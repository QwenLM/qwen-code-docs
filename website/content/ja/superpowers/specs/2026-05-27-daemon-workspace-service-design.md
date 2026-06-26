# DaemonWorkspaceService 実装設計（案 C）

> 関連：issue #4542, PR #4472, #3803, #4175
> ブランチ：`daemon_mode_b_main`
> 日付：2026-05-27
> 性質：実装設計ドキュメント（実装指向）、RFC ではない

---

> **実装範囲の説明（2026-05-31 更新、PR #4563）**
>
> このドキュメントが記述するのは**最終アーキテクチャ**です。PR #4563 で実装されるのはその一部のみで、残りは後続の PR で対応します。以下の表を基準に読み進めてください。すべてが実装済みとは想定しないでください。
>
> | 機能                                                                         | 本PR(#4563)の状態                                                                                                             |
> | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
> | `HttpAcpBridge` → `AcpSessionBridge` 改名                                    | ✅ 実装済み                                                                                                                      |
> | bridge が公開する `queryWorkspaceStatus` / `invokeWorkspaceCommand` 汎用デリゲート       | ✅ 実装済み                                                                                                                      |
> | facade の workspace レベル **status / init / tool-toggle / mcp-restart**         | ✅ 実装済み、配線済み（server.ts + acpHttp dispatch は facade 経由）                                                                      |
> | **File / Auth / Agents / Memory の 4 つのサブサービス**                           | ⏳ **延期** —— 本PRには含まれません。各ルート配線、`deviceFlowRegistry`/`subagentManager` の注入、e2e テストとともに後続PRで実装      |
> | `/workspace/memory`、`/workspace/agents` 等の REST ルートは facade を呼ぶように変更             | ⏳ **延期** —— 現状は引き続き旧 `workspaceMemory.ts` / `workspaceAgents.ts` が直接サービス                                      |
> | `/acp` northbound `qwen/workspace/*` dispatch（§6）                          | ⏳ **延期**                                                                                                                |
> | `initWorkspace` は `fsFactory` / `WorkspaceFileSystem` 経由（trust gate + audit） | ⏳ **延期** —— 現状は旧 bridge の raw `node:fs` 実装（§SV TOCTOU/symlink 防御を含む）をそのまま使用し、退行なし；fsFactory/audit 移行は後続に委ねる |
>
> したがって、本ドキュメントの §3.4（サブサービスインターフェース）、§6（/acp northbound）、§7.1 の `e2e.test.ts`、§10 の PR 形態の記述はすべて**最終/将来範囲**であり、本PRでは実装されていません。

---

## 1. アーキテクチャと境界

### 1.1 最終層構造

```
                          CLIENTS
   webui    SDK/channels(via REST)    Zed/Goose(/acp)    future
     │             │                       │
═════╪═════════════╪═══════════════════════╪═════════════ L1 transport (薄)
   REST+SSE      REST+SSE              /acp (jsonrpc/sse)
   server.ts                           acpHttp/
     └─────────────┴───────────────────────┘
                          │ 業務/trust/audit はすべて L2 に下ろす
═════════════════════════╪═══════════════════════════════ L2 アプリケーション層
   ┌──────────────────────────┐   ┌─────────────────────────────────┐
   │ AcpSessionBridge          │   │ DaemonWorkspaceService (facade)  │
   │ (← HttpAcpBridge 改名)    │   │  ┌──────────────────────────┐   │
   │ • channel/session ライフサイクル │  │ FileService              │   │
   │ • prompt / cancel / close │   │  │ AuthService              │   │
   │ • EventBus / 権限調停      │   │  │ AgentsService            │   │
   │ • 依存する子プロセスの状態内省   │   │  │ MemoryService            │   │
   │   (mcp/skills/preflight)  │   │  └──────────────────────────┘   │
   └──────────┬───────────────┘   │  統一 WorkspaceRequestContext     │
              │                    └──────────┬──────────────────────┘
              │ L3 → child                    │
              ▼                               │ (純粋ローカル、child に触れない)
══════════════════════════════════════════════════════════ L3 ACP-client
══════════════════════════════════════════════════════════ L4 agent
```

### 1.2 振り分け判定関数

**唯一のルール：操作のスコープは session か workspace か？**

- **session-scoped**（特定の sessionId を操作：prompt/cancel/close/model/approval/metadata/heartbeat）**→ `AcpSessionBridge` に残す**
- **workspace-scoped**（ワークスペース全体を操作：file/auth/agents/memory/mcp-status/skills/env/preflight/tool-toggle/init）**→ `DaemonWorkspaceService` に入れる**

workspace メソッドのうち一部は child への問い合わせが必要（status getters、restartMcpServer）。それらは **injected callback** を通じて bridge の channel に委譲し、service 自体は connection を保持しない。

### 1.3 横断的依存：コールバック注入（共有インフラではない）

現在 `publishWorkspaceEvent` と `knownClientIds` は bridge が保持している（per-session bus fan-out / session-derived）。service は **単方向コールバック注入** でこれらを使用し、共有インフラ層は導入しない。

**理由：**

1. EventBus は per-session bus（`bridge.ts:1457`）、workspace-level bus はコードコメントに PR 24 で追加予定と記載（`bridge.ts:2611`）
2. `knownClientIds` も session-attach state から派生したもので、コメントに "PR 24 will replace it"（`bridge.ts:2658`）と明記
3. これらは独立した作業として計画済みであり、本PRに無理に組み込むと追加のリファクタリングとなる
4. コールバック注入により service は単方向依存（関数参照のみ保持し、bridge を知らない）となる；PR 24 導入後は注入元を差し替えるだけで、service インターフェースは不変

**厳格ルール：**

1. `DaemonWorkspaceServiceDeps` には `AcpSessionBridge` 型の参照を一切含めてはならない——関数シグネチャのみを使用する。
2. bridge が外部に新しく公開する `queryWorkspaceStatus` と `invokeWorkspaceCommand` の2メソッドを、service がコールバック経由で呼び出す。内部では既存の `requestWorkspaceStatus` / `liveChannelInfo` + timeout ロジックをそのまま使用し、新たな抽象は作成しない。

---

## 2. 構築順序と依存性注入

```ts
// runQwenServe.ts における構築順序

// 1. fsFactory を先に構築（両者で共有）
const fsFactory = resolveBridgeFsFactory({ ... });

// 2. bridge を先に構築（session/channel/EventBus の所有者）
const bridge = createAcpSessionBridge({
  eventRingSize,
  boundWorkspace,
  fileSystem: createBridgeFileSystemAdapter(fsFactory),
  // ... その他既存パラメータは変更なし
});

// 3. service を後に構築し、bridge のコールバックセットを受け取る
const workspace = createDaemonWorkspaceService({
  fsFactory,
  deviceFlowRegistry,
  subagentManager,
  boundWorkspace,
  contextFilename,
  // 横断コールバック — service はこれらが bridge 由来であることを知らない
  publishWorkspaceEvent: (event) => bridge.publishWorkspaceEvent(event),
  knownClientIds: () => bridge.knownClientIds(),
  // child 委譲コールバック — workspace-scoped ext method が bridge の channel を通じて agent に到達
  queryWorkspaceStatus: (method, idle) => bridge.queryWorkspaceStatus(method, idle),
  invokeWorkspaceCommand: (method, params, opts) => bridge.invokeWorkspaceCommand(method, params, opts),
});

// 4. 両方を server routes + /acp handler に渡す
createServeApp({ bridge, workspace, ... });
```

**構築順序 bridge → service はハード依存**（service は bridge インスタンス上のメソッドをコールバック源として必要とする）。

---

## 3. DaemonWorkspaceService 内部構造

### 3.1 ディレクトリ構成

```
packages/cli/src/serve/workspace-service/
├── types.ts            ← WorkspaceRequestContext + サブサービスインターフェース
├── index.ts            ← facade factory (createDaemonWorkspaceService)
├── fileService.ts      ← fsFactory をラップ
├── authService.ts      ← DeviceFlowRegistry をラップ
├── agentsService.ts    ← SubagentManager をラップ
├── memoryService.ts    ← メモリファイル操作をラップ
└── __tests__/
    ├── fileService.test.ts
    ├── authService.test.ts
    ├── agentsService.test.ts
    ├── memoryService.test.ts
    └── e2e.test.ts
```

### 3.2 Facade インターフェース

```ts
export interface DaemonWorkspaceService {
  file: FileService;
  auth: AuthService;
  agents: AgentsService;
  memory: MemoryService;

  // 純粋ローカル
  initWorkspace(
    opts: InitWorkspaceOpts,
    ctx: WorkspaceRequestContext,
  ): Promise<void>;
  setToolEnabled(
    toolName: string,
    enabled: boolean,
    ctx: WorkspaceRequestContext,
  ): Promise<ToolToggleResult>;

  // コールバック経由で child に委譲
  getMcpStatus(): Promise<ServeWorkspaceMcpStatus>;
  getSkillsStatus(): Promise<ServeWorkspaceSkillsStatus>;
  getProvidersStatus(): Promise<ServeWorkspaceProvidersStatus>;
  getEnvStatus(): Promise<ServeWorkspaceEnvStatus>;
  getPreflightStatus(): Promise<ServeWorkspacePreflightStatus>;
  restartMcpServer(
    serverName: string,
    ctx: WorkspaceRequestContext,
    opts?: RestartOpts,
  ): Promise<RestartResult>;
}
```

> `listWorkspaceSessions` / `recordHeartbeat` / `getHeartbeatState` / `publishWorkspaceEvent` / `knownClientIds` は bridge に残す——これらは bridge 内部の per-session state（`byId` map / session bus）にアクセスする、session 派生のインフラである。service はコールバック経由で消費するのみで、直接保持しない。

### 3.3 Facade Factory のシグネチャ

```ts
export interface DaemonWorkspaceServiceDeps {
  fsFactory: WorkspaceFileSystemFactory;
  deviceFlowRegistry: DeviceFlowRegistry;
  subagentManager: SubagentManager;
  boundWorkspace: string;
  contextFilename: string;
  persistDisabledTools: (
    workspace: string,
    tool: string,
    enabled: boolean,
  ) => Promise<void>;

  // 横断コールバック（session 派生インフラ）
  publishWorkspaceEvent: (event: WorkspaceEvent) => void;
  knownClientIds: () => Set<string>;

  // child 委譲コールバック（workspace-scoped ext method が bridge channel を通じて agent に到達）
  queryWorkspaceStatus: <T>(method: string, idle: () => T) => Promise<T>;
  invokeWorkspaceCommand: <T>(
    method: string,
    params?: Record<string, unknown>,
    opts?: { timeoutMs?: number },
  ) => Promise<T>;
}

export function createDaemonWorkspaceService(
  deps: DaemonWorkspaceServiceDeps,
): DaemonWorkspaceService;
```

### 3.4 各サブサービスインターフェース

| サブサービス    | メソッド                                                                  | 必要な deps                                                            | 既存ソース                                                                    |
| ------------- | ------------------------------------------------------------------------- | ---------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| FileService   | `read`, `readBytes`, `write`, `edit`, `glob`, `list`, `stat`              | `fsFactory`, `boundWorkspace`                                          | `serve/routes/workspaceFileRead.ts`, `workspaceFileWrite.ts`, `serve/fs/`     |
| AuthService   | `startFlow`, `getFlowStatus(flowId)`, `cancelFlow(flowId)`, `getAuthStatus` | `deviceFlowRegistry`                                                   | `serve/auth/deviceFlow.ts`, `server.ts:794-966`                               |
| AgentsService | `list`, `get(agentType)`, `create`, `update`, `delete`                    | `subagentManager`, `publishWorkspaceEvent`, `knownClientIds`           | `serve/workspaceAgents.ts`                                                    |
| MemoryService | `list`, `read`, `write`, `delete`                                         | `fsFactory` or direct fs, `publishWorkspaceEvent`, `knownClientIds`    | `serve/workspaceMemory.ts`                                                    |

各メソッドの最初の引数は `ctx: WorkspaceRequestContext` であり、trust gate はメソッドエントリで一貫して実行される。

---

## 4. WorkspaceRequestContext

```ts
export interface WorkspaceRequestContext {
  originatorClientId?: string; // X-Qwen-Client-Id ヘッダ（読み取り操作では欠落可）
  sessionId?: string; // audit 関連付け（例：session context 内から発行された操作）
  route: string; // audit 証跡（例："POST /file/write"）
  workspaceCwd: string; // trust boundary ルート
}
```

> `originatorClientId` は optional——現在のファイル読み取りなどの読み取り専用ルートではヘッダがなくても正常動作（`clientId ?? undefined` として `fsFactory.forRequest` に渡される）。書き込みルートでは clientId が**存在する場合のみ**正当性を検証する。

**構築場所**：L1 route handler / `/acp` method handler がリクエストヘッダ・パラメータから抽出して L2 に渡す。L2 は消費のみで、HTTP コンテキストを自ら抽出しない。

---

## 5. AcpSessionBridge の瘦身化と改名

### 5.1 bridge から移行するメソッド

| メソッド                        | 移行先                         | 機構                                    | 理由                                                             |
| ------------------------------- | ------------------------------ | --------------------------------------- | ---------------------------------------------------------------- |
| `initWorkspace`                 | `workspace.initWorkspace`      | 直接移行（純粋ローカル）                | 付随して FIXME 修正（bridge は fsFactory を使わず、trust gate / audit をスキップしていた） |
| `setWorkspaceToolEnabled`       | `workspace.setToolEnabled`     | 直接移行（純粋ローカル）                | 純粋なファイル I/O + event fan-out、コメントに "no ACP roundtrip" と明記       |
| `getWorkspaceMcpStatus`         | `workspace.getMcpStatus`       | `queryWorkspaceStatus` コールバック経由 | workspace-scoped ステータス問い合わせ                            |
| `getWorkspaceSkillsStatus`      | `workspace.getSkillsStatus`    | `queryWorkspaceStatus` コールバック経由 | 同上                                                             |
| `getWorkspaceProvidersStatus`   | `workspace.getProvidersStatus` | `queryWorkspaceStatus` コールバック経由 | 同上                                                             |
| `getWorkspaceEnvStatus`         | `workspace.getEnvStatus`       | `queryWorkspaceStatus` コールバック経由 | 同上                                                             |
| `getWorkspacePreflightStatus`   | `workspace.getPreflightStatus` | `queryWorkspaceStatus` コールバック経由 | 同上                                                             |
| `restartMcpServer`              | `workspace.restartMcpServer`   | `invokeWorkspaceCommand` コールバック経由 | workspace-scoped 変更操作                                       |

> `listWorkspaceSessions` / `recordHeartbeat` / `getHeartbeatState` / `updateSessionMetadata` は bridge に残す——これらは bridge 内部の `byId` session map にアクセスする、session-scoped 操作である。

### 5.2 bridge に残すもの

- すべての session/channel ライフサイクル（spawn/load/resume/send/cancel/close/kill/detach）
- EventBus の保持 + `publishWorkspaceEvent` fan-out 実装（service コールバックが消費）
- `knownClientIds`（service コールバックが消費）
- `queryWorkspaceStatus` / `invokeWorkspaceCommand`（新規公開、channel + timeout + error をカプセル化し、service コールバック委譲用）
- 権限調停 mediator
- session 設定変更（model/approvalMode/recap）
- session 状態（context/supportedCommands/metadata/heartbeat/listSessions）

### 5.3 改名

- `HttpAcpBridge` → `AcpSessionBridge`
- `createHttpAcpBridge` → `createAcpSessionBridge`
- ファイル `serve/httpAcpBridge.ts` → `serve/acpSessionBridge.ts`

外部パッケージの消費者は存在しないことを確認済み（`packages/cli/src/serve/` と `packages/acp-bridge/src/` 以外に参照なし）、内部での安全な変更。

---

## 6. /acp northbound ext methods

### 6.1 名前空間

`qwen/workspace/...`（既存の `qwen/control/...` と区別）：

- `qwen/control/...` = daemon→child 転送コマンド（southbound、AcpSessionBridge 経由）
- `qwen/workspace/...` = daemon ローカルワークスペース操作（northbound、DaemonWorkspaceService で終端）

> chiga0 確認待ち。名前空間を変更する場合はメソッド名のプレフィックスを変えるだけでアーキテクチャに影響なし。

### 6.2 メソッド一覧

| method                            | 対応 REST                                       | L2 呼び出し                                          |
| --------------------------------- | ----------------------------------------------- | ---------------------------------------------------- |
| `qwen/workspace/fs/read`          | `GET /file?path=...`                            | `workspace.file.read(ctx, path)`                     |
| `qwen/workspace/fs/readBytes`     | `GET /file/bytes?path=...`                      | `workspace.file.readBytes(ctx, path)`                |
| `qwen/workspace/fs/write`         | `POST /file/write`                              | `workspace.file.write(ctx, path, content)`           |
| `qwen/workspace/fs/edit`          | `POST /file/edit`                               | `workspace.file.edit(ctx, path, edits)`              |
| `qwen/workspace/fs/glob`          | `GET /glob?pattern=...`                         | `workspace.file.glob(ctx, pattern)`                  |
| `qwen/workspace/fs/list`          | `GET /list?path=...`                            | `workspace.file.list(ctx, path)`                     |
| `qwen/workspace/fs/stat`          | `GET /stat?path=...`                            | `workspace.file.stat(ctx, path)`                     |
| `qwen/workspace/auth/start`       | `POST /workspace/auth/device-flow`              | `workspace.auth.startFlow(ctx)`                      |
| `qwen/workspace/auth/status`      | `GET /workspace/auth/status`                    | `workspace.auth.getAuthStatus(ctx)`                  |
| `qwen/workspace/auth/flow`        | `GET /workspace/auth/device-flow/:id`           | `workspace.auth.getFlowStatus(ctx, flowId)`          |
| `qwen/workspace/auth/cancel`      | `POST /workspace/auth/device-flow/:id` (cancel) | `workspace.auth.cancelFlow(ctx, flowId)`             |
| `qwen/workspace/agents/list`      | `GET /workspace/agents`                         | `workspace.agents.list(ctx)`                         |
| `qwen/workspace/agents/get`       | `GET /workspace/agents/:agentType`              | `workspace.agents.get(ctx, agentType)`               |
| `qwen/workspace/agents/create`    | `POST /workspace/agents`                        | `workspace.agents.create(ctx, spec)`                 |
| `qwen/workspace/agents/update`    | `POST /workspace/agents/:agentType`             | `workspace.agents.update(ctx, agentType, spec)`      |
| `qwen/workspace/agents/delete`    | `DELETE /workspace/agents/:agentType`           | `workspace.agents.delete(ctx, agentType)`            |
| `qwen/workspace/memory/list`      | `GET /workspace/memory`                         | `workspace.memory.list(ctx)`                         |
| `qwen/workspace/memory/read`      | `GET /workspace/memory/:key`                    | `workspace.memory.read(ctx, key)`                    |
| `qwen/workspace/memory/write`     | `POST /workspace/memory`                        | `workspace.memory.write(ctx, key, content)`          |
| `qwen/workspace/memory/delete`    | `DELETE /workspace/memory/:key`                 | `workspace.memory.delete(ctx, key)`                  |
| `qwen/workspace/init`             | `POST /workspace/init`                          | `workspace.initWorkspace(ctx, opts)`                 |
| `qwen/workspace/tool/toggle`      | `POST /workspace/tool/toggle`                   | `workspace.setToolEnabled(ctx, toolName, enabled)`   |
| `qwen/workspace/status/mcp`       | `GET /workspace/mcp`                            | `workspace.getMcpStatus()`                           |
| `qwen/workspace/status/skills`    | `GET /workspace/skills`                         | `workspace.getSkillsStatus()`                        |
| `qwen/workspace/status/providers` | `GET /workspace/providers`                      | `workspace.getProvidersStatus()`                     |
| `qwen/workspace/status/env`       | `GET /workspace/env`                            | `workspace.getEnvStatus()`                           |
| `qwen/workspace/status/preflight` | `GET /workspace/preflight`                      | `workspace.getPreflightStatus()`                     |
| `qwen/workspace/mcp/restart`      | `POST /workspace/mcp/restart`                   | `workspace.restartMcpServer(ctx, serverName, opts)`  |

Capabilities advertise 時に `_meta.qwen.methods` でこれらのメソッドを宣言する。

---

## 7. ファイル変更リスト

### 7.1 新規追加

| ファイル                                                    | 用途                                                |
| ----------------------------------------------------------- | --------------------------------------------------- |
| `serve/workspace-service/types.ts`                          | `WorkspaceRequestContext` + サブサービスインターフェース |
| `serve/workspace-service/index.ts`                          | facade factory                                     |
| `serve/workspace-service/fileService.ts`                    | FileService 実装                                   |
| `serve/workspace-service/authService.ts`                    | AuthService 実装                                   |
| `serve/workspace-service/agentsService.ts`                  | AgentsService 実装                                 |
| `serve/workspace-service/memoryService.ts`                  | MemoryService 実装                                 |
| `serve/workspace-service/__tests__/fileService.test.ts`     | 単体テスト                                          |
| `serve/workspace-service/__tests__/authService.test.ts`     | 単体テスト                                          |
| `serve/workspace-service/__tests__/agentsService.test.ts`   | 単体テスト                                          |
| `serve/workspace-service/__tests__/memoryService.test.ts`   | 単体テスト                                          |
| `serve/workspace-service/__tests__/e2e.test.ts`             | エンドツーエンド REST ↔ /acp 等価検証               |

### 7.2 変更

| ファイル                                                        | 変更内容                                                                                                                                                                          |
| --------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `acp-bridge/src/bridge.ts`                                      | 8 つの workspace メソッドを削除（initWorkspace / setWorkspaceToolEnabled / 5 status getters / restartMcpServer）；新たに `queryWorkspaceStatus` + `invokeWorkspaceCommand` を公開；ファクトリ関数を改名 |
| `acp-bridge/src/bridgeTypes.ts`                                 | インターフェース名変更 `HttpAcpBridge` → `AcpSessionBridge`；8 つの workspace メソッドシグネチャを削除；新たに `queryWorkspaceStatus` + `invokeWorkspaceCommand` シグネチャを追加    |
| `acp-bridge/src/bridgeOptions.ts`                               | JSDoc 参照を更新                                                                                                                                                                  |
| `acp-bridge/src/status.ts`                                      | エラーメッセージ内のクラス名を更新                                                                                                                                                |
| `cli/src/serve/httpAcpBridge.ts` → 改名 `acpSessionBridge.ts`   | re-export 更新                                                                                                                                                                    |
| `cli/src/serve/runQwenServe.ts`                                 | `DaemonWorkspaceService` を構築し、コールバックを注入、routes と /acp handler に渡す                                                                                              |
| `cli/src/serve/server.ts`                                       | routes を `fsFactory`/`DeviceFlowRegistry` 直接使用から `workspace.file.*` / `workspace.auth.*` 呼び出しに変更                                                                   |
| `cli/src/serve/workspaceAgents.ts`                              | ビジネスロジックを `agentsService.ts` に移行；元のファイルは route handler の薄いラッパーに（ctx 構築 → service 呼び出し）                                                         |
| `cli/src/serve/workspaceMemory.ts`                              | 同上                                                                                                                                                                              |
| `cli/src/serve/routes/workspaceFileRead.ts`                     | 同上                                                                                                                                                                              |
| `cli/src/serve/routes/workspaceFileWrite.ts`                    | 同上                                                                                                                                                                              |
| `/acp` handler（`acp-integration/` または `serve/` 内）          | northbound method dispatch を新規追加                                                                                                                                              |
---

## 8. SDK 互換性とエラーフォーマット

### 8.1 SDK 後方互換性

REST API サーフェス（パス、HTTP メソッド、リクエスト/レスポンス JSON スキーマ）は変更なし。`sdk-typescript` の `DaemonClient` / `DaemonSessionClient` は一切の修正不要。

検証方法：既存の `packages/sdk-typescript/test/unit/DaemonClient.test.ts` と `DaemonSessionClient.test.ts` が本 PR で修正なしでパスすること。

### 8.2 /acp trust gate 拒否時のエラーフォーマット

両トランスポートは意味的に同等だが、エンコードが異なる。

| シーン                          | REST                                       | /acp (JSON-RPC)                                                          |
| ------------------------------ | ------------------------------------------ | ------------------------------------------------------------------------ |
| 無効/欠落の bearer token       | `401 { error, code: "unauthorized" }`      | `{ error: { code: -32001, message: "unauthorized" } }`                   |
| 無効な clientId                | `400 { error, code: "invalid_client_id" }` | `{ error: { code: -32602, message: "invalid_client_id", data: {...} } }` |
| trust gate 拒否（パスエスケープ等） | `403 { error, code: "forbidden" }`         | `{ error: { code: -32003, message: "forbidden", data: {...} } }`         |

> JSON-RPC エラーコードは [ACP error code registry](https://spec.acpprotocol.org)（標準範囲 -32000 〜 -32099 はサーバ定義のアプリケーションエラー）に従う。具体的なコード値は実装時に `/acp` 既存のエラーマッピングロジック（`acp-integration/errorCodes.ts`）に合わせる。

---

## 9. テスト戦略

| 層                | テスト種類                                                              | カバレッジ対象                                                   |
| ----------------- | ----------------------------------------------------------------------- | -------------------------------------------------------------- |
| Sub-service unit  | Jest、mock fsFactory / DeviceFlowRegistry / SubagentManager / callbacks | ビジネスロジックの正確性 + trust gate による無効 clientId の拒否               |
| Route integration | 既存の route テストを service 経由に変更（HTTP surface が変わらないことを検証）                | 回帰保障、REST パスが壊れない                                    |
| E2e 等価検証      | 実際のサーバ起動 + HTTP リクエスト                                      | REST と `/acp` が同一操作で同等の結果を返すこと；trust gate が両エンドポイントで一貫して拒否すること |

### E2e 検証マトリックス

- File read/write：REST `GET /file` vs `/acp` `qwen/workspace/fs/read` → 同結果
- Agent CRUD：REST `POST /workspace/agents` vs `/acp` `qwen/workspace/agents/create` → 同動作
- Trust gate rejection：無効な clientId で両パスとも 403
- Workspace init：fsFactory が正常動作し、監査証跡が生成されることを検証

---

## 10. PR の形態

単一 PR の原子的コミットであり、以下を含む：

- DaemonWorkspaceService の全新規ファイル
- REST ルートハンドラを service 呼び出しに変更
- bridge のスリム化（8 つの workspace メソッドを移行）+ 新たに 2 つの子委譲メソッドを公開
- `HttpAcpBridge` → `AcpSessionBridge` への名称変更
- `/acp` northbound ext メソッドの追加（27 個）
- 全テスト（unit + integration + e2e）

---

## 11. 明示的に行わない事項（スコープ境界）

- workspace スコープの EventBus（PR 24 の領域）
- workspace スコープの ClientRegistry（PR 24 の領域）
- L2 ↔ L3 分割（`ClientSideConnection` を bridge から切り出す）
- REST を `/acp` 互換のシムにする（長期的な方向性）
- channels スタンドアロンモードの統一（独立デプロイ形態の問題）
- `listWorkspaceSessions` / `recordHeartbeat` / `getHeartbeatState` / `updateSessionMetadata` の移行（session スコープ、元の場所に維持）
- `publishWorkspaceEvent` / `knownClientIds` の所有権移行（session 派生インフラ、bridge が保持し、service がコールバックで利用）

---

## 12. chiga0 に確認が必要な決定事項

1. `/acp` northbound 名前空間：`qwen/workspace/...` か他の方式（例：`qwen/control/...` の再利用）か
2. 名称変更を同一 PR で行うか：同一 PR の方向だが、フィードバックに応じて分割可能

> 上記 2 点の調整が必要な場合は、命名とコミット境界にのみ影響し、アーキテクチャには影響しない。