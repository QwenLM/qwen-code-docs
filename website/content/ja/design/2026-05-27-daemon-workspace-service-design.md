# DaemonWorkspaceService 実装設計（プラン C）

> 関連：issue #4542, PR #4472, #3803, #4175
> ブランチ：`daemon_mode_b_main`
> 日付：2026-05-27
> 性質：実装設計ドキュメント（実装向け）、RFC ではない

---

> **実装範囲の説明（2026-05-31 更新、PR #4563）**
>
> 本ドキュメントは**最終状態のアーキテクチャ**について説明している。PR #4563 ではその一部のみを実装し、残りは後続の PR の範囲となる。読む際は以下の表を基準とし、すべてが実装済みであると想定しないこと：
>
> | 機能                                                                         | 本 PR (#4563) の状態                                                                                                             |
> | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
> | `HttpAcpBridge` → `AcpSessionBridge` へのリネーム                                    | ✅ 実装済み                                                                                                                      |
> | bridge が `queryWorkspaceStatus` / `invokeWorkspaceCommand` ジェネリックデリゲートを公開       | ✅ 実装済み                                                                                                                      |
> | facade の workspace レベルの **status / init / tool-toggle / mcp-restart**         | ✅ 実装および配線済み（server.ts + acpHttp dispatch が facade を経由）                                                                      |
> | **File / Auth / Agents / Memory の 4 つのサブサービス**                           | ⏳ **延期** —— 本 PR には含まれない。それぞれのルート配線、`deviceFlowRegistry`/`subagentManager` の注入、e2e テストとともに後続の PR で実装      |
> | `/workspace/memory`、`/workspace/agents` などの REST ルートを facade 呼び出しに変更             | ⏳ **延期** —— 現在は引き続き古い `workspaceMemory.ts` / `workspaceAgents.ts` が直接処理                                           |
> | `/acp` northbound `qwen/workspace/*` dispatch（§6）                          | ⏳ **延期**                                                                                                                |
> | `initWorkspace` が `fsFactory` / `WorkspaceFileSystem` を使用（trust gate + audit） | ⏳ **延期** —— 現在は古い bridge の raw `node:fs` 実装（§SV TOCTOU/symlink 防御を含む）をそのまま使用しており、リグレッションはない。fsFactory/audit の移行は後続に委ねられる |
>
> したがって、本ドキュメントの §3.4（サブサービスインターフェース）、§6（/acp northbound）、§7.1 の `e2e.test.ts`、§10 の PR 形態の記述はすべて**最終状態/将来の範囲**に属し、本 PR では実装されていない。

---

## 1. アーキテクチャと境界

### 1.1 最終状態のレイヤー

```
                          CLIENTS
   webui    SDK/channels(via REST)    Zed/Goose(/acp)    future
     │             │                       │
═════╪═════════════╪═══════════════════════╪═════════════ L1 transport (thin)
   REST+SSE      REST+SSE              /acp (jsonrpc/sse)
   server.ts                           acpHttp/
     └─────────────┴───────────────────────┘
                          │ business/trust/audit all sink to L2
═════════════════════════╪═══════════════════════════════ L2 application layer
   ┌──────────────────────────┐   ┌─────────────────────────────────┐
   │ AcpSessionBridge          │   │ DaemonWorkspaceService (facade)  │
   │ (← HttpAcpBridge rename)  │   │  ┌──────────────────────────┐   │
   │ • channel/session lifecycle│  │  │ FileService              │   │
   │ • prompt / cancel / close │   │  │ AuthService              │   │
   │ • EventBus / auth arbitra.│   │  │ AgentsService            │   │
   │ • child state introspect. │   │  │ MemoryService            │   │
   │   (mcp/skills/preflight)  │   │  └──────────────────────────┘   │
   └──────────┬───────────────┘   │  unified WorkspaceRequestContext  │
              │                    └──────────┬──────────────────────┘
              │ L3 → child                    │
              ▼                               │ (pure local, no child touch)
══════════════════════════════════════════════════════════ L3 ACP-client
══════════════════════════════════════════════════════════ L4 agent
```

### 1.2 分割判定関数

**唯一のルール：操作のスコープは session か workspace か？**

- **session-scoped**（特定の sessionId を操作：prompt/cancel/close/model/approval/metadata/heartbeat）**→ `AcpSessionBridge` に残す**
- **workspace-scoped**（ワークスペース全体を操作：file/auth/agents/memory/mcp-status/skills/env/preflight/tool-toggle/init）**→ `DaemonWorkspaceService` へ**

workspace メソッドの一部は child のクエリ（status getters、restartMcpServer）を必要とするため、**injected callback** を通じて bridge の channel に委譲して実行する。service 自体は connection を保持しない。

### 1.3 横断依存：callback 注入（共有 infra ではない）

現在、`publishWorkspaceEvent` と `knownClientIds` は bridge が保持している（per-session bus fan-out / session-derived）。service は**単方向 callback 注入**を通じてこれらを使用し、共有インフラストラクチャ層は導入しない。

**理由：**

1. EventBus は per-session bus であり（`bridge.ts:1457`）、workspace-level bus はコードコメントで PR 24 に予定されている（`bridge.ts:2611`）
2. `knownClientIds` も同様に session-attach state から派生しており、コメントには "PR 24 will replace it" と明記されている（`bridge.ts:2658`）
3. これら2つはすでに独立した作業として計画されており、本 PR に無理に組み込むことは追加の refactor を重ねることになる
4. callback 注入は service に対する単方向依存である（関数参照のみを保持し、bridge 由来とは知らない）。PR 24 が実装された後に注入元を置き換えればよく、service のインターフェースは変更されない

**厳格なルール：**

1. `DaemonWorkspaceServiceDeps` 内に `AcpSessionBridge` 型の参照を含めてはならない——関数シグネチャのみを使用する。
2. bridge は外部向けに `queryWorkspaceStatus` と `invokeWorkspaceCommand` の2つの新しいメソッドを公開し、service が callback 経由で呼び出せるようにする。内部では引き続き既存の `requestWorkspaceStatus` / `liveChannelInfo` + timeout ロジックを使用し、新しい抽象化は作成しない。

---

## 2. 構築シーケンスと依存性注入

```ts
// runQwenServe.ts での構築順序

// 1. fsFactory を先に構築（両者で共有）
const fsFactory = resolveBridgeFsFactory({ ... });

// 2. bridge を先に構築（session/channel/EventBus の owner であるため）
const bridge = createAcpSessionBridge({
  eventRingSize,
  boundWorkspace,
  fileSystem: createBridgeFileSystemAdapter(fsFactory),
  // ... その他の既存パラメータは変更なし
});

// 3. service を後に構築し、bridge の callback セットを受け取る
const workspace = createDaemonWorkspaceService({
  fsFactory,
  deviceFlowRegistry,
  subagentManager,
  boundWorkspace,
  contextFilename,
  // 横断 callback — service はこれらが bridge 由来であることを知らない
  publishWorkspaceEvent: (event) => bridge.publishWorkspaceEvent(event),
  knownClientIds: () => bridge.knownClientIds(),
  // child 委譲 callback — workspace-scoped ext method は bridge の channel を通じて agent に到達する
  queryWorkspaceStatus: (method, idle) => bridge.queryWorkspaceStatus(method, idle),
  invokeWorkspaceCommand: (method, params, opts) => bridge.invokeWorkspaceCommand(method, params, opts),
});

// 4. 両者を server routes + /acp handler に渡す
createServeApp({ bridge, workspace, ... });
```

**構築順序 bridge → service は厳格な依存関係である**（service は bridge インスタンス上のメソッドを callback ソースとして必要とする）。

---

## 3. DaemonWorkspaceService の内部構造

### 3.1 ディレクトリ構成

```
packages/cli/src/serve/workspace-service/
├── types.ts            ← WorkspaceRequestContext + サブサービスインターフェース
├── index.ts            ← facade factory (createDaemonWorkspaceService)
├── fileService.ts      ← fsFactory をラップ
├── authService.ts      ← DeviceFlowRegistry をラップ
├── agentsService.ts    ← SubagentManager をラップ
├── memoryService.ts    ← memory ファイル操作をラップ
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

  // 純粋にローカル
  initWorkspace(
    opts: InitWorkspaceOpts,
    ctx: WorkspaceRequestContext,
  ): Promise<void>;
  setToolEnabled(
    toolName: string,
    enabled: boolean,
    ctx: WorkspaceRequestContext,
  ): Promise<ToolToggleResult>;

  // callback 経由で child に委譲
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

> `listWorkspaceSessions` / `recordHeartbeat` / `getHeartbeatState` / `publishWorkspaceEvent` / `knownClientIds` は bridge に残す——これらは bridge 内部の per-session state（`byId` map / session bus）にアクセスする、session 派生のインフラストラクチャである。service は callback を通じて消費し、直接は所有しない。

### 3.3 Facade Factory シグネチャ

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

  // 横断 callback（session 派生インフラストラクチャ）
  publishWorkspaceEvent: (event: WorkspaceEvent) => void;
  knownClientIds: () => Set<string>;

  // child 委譲 callback（workspace-scoped ext method は bridge channel を通じて agent に到達）
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

| サブサービス        | メソッド                                                                        | 必要な deps                                                           | 既存のソース                                                                  |
| ------------- | --------------------------------------------------------------------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| FileService   | `read`, `readBytes`, `write`, `edit`, `glob`, `list`, `stat`                | `fsFactory`, `boundWorkspace`                                       | `serve/routes/workspaceFileRead.ts`, `workspaceFileWrite.ts`, `serve/fs/` |
| AuthService   | `startFlow`, `getFlowStatus(flowId)`, `cancelFlow(flowId)`, `getAuthStatus` | `deviceFlowRegistry`                                                | `serve/auth/deviceFlow.ts`, `server.ts:794-966`                           |
| AgentsService | `list`, `get(agentType)`, `create`, `update`, `delete`                      | `subagentManager`, `publishWorkspaceEvent`, `knownClientIds`        | `serve/workspaceAgents.ts`                                                |
| MemoryService | `list`, `read`, `write`, `delete`                                           | `fsFactory` or direct fs, `publishWorkspaceEvent`, `knownClientIds` | `serve/workspaceMemory.ts`                                                |

各メソッドの第一引数は常に `ctx: WorkspaceRequestContext` であり、trust gate はメソッドの入口で一律に実行される。

---

## 4. WorkspaceRequestContext

```ts
export interface WorkspaceRequestContext {
  originatorClientId?: string; // X-Qwen-Client-Id ヘッダー（読み取り専用操作では省略可）
  sessionId?: string; // audit 関連（例：session コンテキスト内から発行された操作）
  route: string; // audit trail（例："POST /file/write"）
  workspaceCwd: string; // trust boundary ルート
}
```

> `originatorClientId` は optional である——現在、file read などの読み取り専用ルートはヘッダーが欠落していても通常通り動作する（`clientId ?? undefined` が `fsFactory.forRequest` に渡される）。write ルートは `clientId` が**存在する場合にのみ**正当性を検証する。

**構築位置**：L1 route handler / `/acp` method handler が request headers/params から抽出して L2 に渡す。L2 は消費のみを行い、HTTP コンテキストの抽出は自行わない。

---

## 5. AcpSessionBridge の整理とリネーム

### 5.1 bridge から移行されるメソッド

| メソッド                          | 移行先                           | 仕組み                                  | 理由                                                           |
| ----------------------------- | ------------------------------ | ------------------------------------- | -------------------------------------------------------------- |
| `initWorkspace`               | `workspace.initWorkspace`      | 直接移行（純粋にローカル）                      | 付随して FIXME を修正（bridge は fsFactory に接続されておらず、trust gate / audit をスキップしていた） |
| `setWorkspaceToolEnabled`     | `workspace.setToolEnabled`     | 直接移行（純粋にローカル）                      | 純粋な file I/O + event fan-out であり、コメントに "no ACP roundtrip" と明記       |
| `getWorkspaceMcpStatus`       | `workspace.getMcpStatus`       | `queryWorkspaceStatus` callback 経由   | workspace-scoped status query                                  |
| `getWorkspaceSkillsStatus`    | `workspace.getSkillsStatus`    | `queryWorkspaceStatus` callback 経由   | 同上                                                           |
| `getWorkspaceProvidersStatus` | `workspace.getProvidersStatus` | `queryWorkspaceStatus` callback 経由   | 同上                                                           |
| `getWorkspaceEnvStatus`       | `workspace.getEnvStatus`       | `queryWorkspaceStatus` callback 経由   | 同上                                                           |
| `getWorkspacePreflightStatus` | `workspace.getPreflightStatus` | `queryWorkspaceStatus` callback 経由   | 同上                                                           |
| `restartMcpServer`            | `workspace.restartMcpServer`   | `invokeWorkspaceCommand` callback 経由 | workspace-scoped mutation                                      |
> `listWorkspaceSessions` / `recordHeartbeat` / `getHeartbeatState` / `updateSessionMetadata` は bridge に残します。これらは bridge 内部の `byId` session map にアクセスする、session スコープの操作です。

### 5.2 bridge に残すもの

- 全ての session/channel ライフサイクル（spawn/load/resume/send/cancel/close/kill/detach）
- EventBus の保持と `publishWorkspaceEvent` の fan-out 実装（service callback による消費用）
- `knownClientIds`（service callback による消費用）
- `queryWorkspaceStatus` / `invokeWorkspaceCommand`（新規公開。channel + timeout + error をカプセル化し、service callback からの委譲用）
- 権限調停 mediator
- session 設定の変更（model/approvalMode/recap）
- session 状態（context/supportedCommands/metadata/heartbeat/listSessions）

### 5.3 名前変更

- `HttpAcpBridge` → `AcpSessionBridge`
- `createHttpAcpBridge` → `createAcpSessionBridge`
- ファイル `serve/httpAcpBridge.ts` → `serve/acpSessionBridge.ts`

外部パッケージのコンシューマーはいません（`packages/cli/src/serve/` と `packages/acp-bridge/src/` 以外に参照がないことを確認済み）。内部変更のみで安全です。

---

## 6. /acp northbound ext メソッド

### 6.1 名前空間

`qwen/workspace/...`（既存の `qwen/control/...` と区別）：

- `qwen/control/...` = daemon→child へのコマンド転送（southbound、AcpSessionBridge 経由）
- `qwen/workspace/...` = daemon ローカルワークスペース操作（northbound、DaemonWorkspaceService で終端）

> chiga0 の確認待ち。名前空間を変更する場合はメソッド名のプレフィックスを入れ替えるだけでよく、アーキテクチャには影響しません。

### 6.2 メソッド一覧

| メソッド                            | 対応する REST                                       | L2 呼び出し                                             |
| --------------------------------- | ----------------------------------------------- | --------------------------------------------------- |
| `qwen/workspace/fs/read`          | `GET /file?path=...`                            | `workspace.file.read(ctx, path)`                    |
| `qwen/workspace/fs/readBytes`     | `GET /file/bytes?path=...`                      | `workspace.file.readBytes(ctx, path)`               |
| `qwen/workspace/fs/write`         | `POST /file/write`                              | `workspace.file.write(ctx, path, content)`          |
| `qwen/workspace/fs/edit`          | `POST /file/edit`                               | `workspace.file.edit(ctx, path, edits)`             |
| `qwen/workspace/fs/glob`          | `GET /glob?pattern=...`                         | `workspace.file.glob(ctx, pattern)`                 |
| `qwen/workspace/fs/list`          | `GET /list?path=...`                            | `workspace.file.list(ctx, path)`                    |
| `qwen/workspace/fs/stat`          | `GET /stat?path=...`                            | `workspace.file.stat(ctx, path)`                    |
| `qwen/workspace/auth/start`       | `POST /workspace/auth/device-flow`              | `workspace.auth.startFlow(ctx)`                     |
| `qwen/workspace/auth/status`      | `GET /workspace/auth/status`                    | `workspace.auth.getAuthStatus(ctx)`                 |
| `qwen/workspace/auth/flow`        | `GET /workspace/auth/device-flow/:id`           | `workspace.auth.getFlowStatus(ctx, flowId)`         |
| `qwen/workspace/auth/cancel`      | `POST /workspace/auth/device-flow/:id` (cancel) | `workspace.auth.cancelFlow(ctx, flowId)`            |
| `qwen/workspace/agents/list`      | `GET /workspace/agents`                         | `workspace.agents.list(ctx)`                        |
| `qwen/workspace/agents/get`       | `GET /workspace/agents/:agentType`              | `workspace.agents.get(ctx, agentType)`              |
| `qwen/workspace/agents/create`    | `POST /workspace/agents`                        | `workspace.agents.create(ctx, spec)`                |
| `qwen/workspace/agents/update`    | `POST /workspace/agents/:agentType`             | `workspace.agents.update(ctx, agentType, spec)`     |
| `qwen/workspace/agents/delete`    | `DELETE /workspace/agents/:agentType`           | `workspace.agents.delete(ctx, agentType)`           |
| `qwen/workspace/memory/list`      | `GET /workspace/memory`                         | `workspace.memory.list(ctx)`                        |
| `qwen/workspace/memory/read`      | `GET /workspace/memory/:key`                    | `workspace.memory.read(ctx, key)`                   |
| `qwen/workspace/memory/write`     | `POST /workspace/memory`                        | `workspace.memory.write(ctx, key, content)`         |
| `qwen/workspace/memory/delete`    | `DELETE /workspace/memory/:key`                 | `workspace.memory.delete(ctx, key)`                 |
| `qwen/workspace/init`             | `POST /workspace/init`                          | `workspace.initWorkspace(ctx, opts)`                |
| `qwen/workspace/tool/toggle`      | `POST /workspace/tool/toggle`                   | `workspace.setToolEnabled(ctx, toolName, enabled)`  |
| `qwen/workspace/status/mcp`       | `GET /workspace/mcp`                            | `workspace.getMcpStatus()`                          |
| `qwen/workspace/status/skills`    | `GET /workspace/skills`                         | `workspace.getSkillsStatus()`                       |
| `qwen/workspace/status/providers` | `GET /workspace/providers`                      | `workspace.getProvidersStatus()`                    |
| `qwen/workspace/status/env`       | `GET /workspace/env`                            | `workspace.getEnvStatus()`                          |
| `qwen/workspace/status/preflight` | `GET /workspace/preflight`                      | `workspace.getPreflightStatus()`                    |
| `qwen/workspace/mcp/restart`      | `POST /workspace/mcp/restart`                   | `workspace.restartMcpServer(ctx, serverName, opts)` |

Capabilities advertise 時に `_meta.qwen.methods` でこれらのメソッドを宣言します。

---

## 7. ファイル変更リスト

### 7.1 新規追加

| ファイル                                                      | 用途                                               |
| --------------------------------------------------------- | -------------------------------------------------- |
| `serve/workspace-service/types.ts`                        | `WorkspaceRequestContext` + サブサービスインターフェース |
| `serve/workspace-service/index.ts`                        | ファサードファクトリ                                     |
| `serve/workspace-service/fileService.ts`                  | FileService 実装                                   |
| `serve/workspace-service/authService.ts`                  | AuthService 実装                                   |
| `serve/workspace-service/agentsService.ts`                | AgentsService 実装                                 |
| `serve/workspace-service/memoryService.ts`                | MemoryService 実装                                 |
| `serve/workspace-service/__tests__/fileService.test.ts`   | 単体テスト                                          |
| `serve/workspace-service/__tests__/authService.test.ts`   | 単体テスト                                          |
| `serve/workspace-service/__tests__/agentsService.test.ts` | 単体テスト                                          |
| `serve/workspace-service/__tests__/memoryService.test.ts` | 単体テスト                                          |
| `serve/workspace-service/__tests__/e2e.test.ts`           | エンドツーエンド REST ↔ /acp 等価性検証                       |

### 7.2 変更

| ファイル                                                          | 変更内容                                                                                                                                                                                |
| ------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `acp-bridge/src/bridge.ts`                                    | 8 個の workspace メソッド（initWorkspace / setWorkspaceToolEnabled / 5 個の status getter / restartMcpServer）を削除。`queryWorkspaceStatus` と `invokeWorkspaceCommand` を新規公開。ファクトリ関数をリネーム |
| `acp-bridge/src/bridgeTypes.ts`                               | インターフェース名を `HttpAcpBridge` から `AcpSessionBridge` に変更。8 個の workspace メソッドのシグネチャを削除。`queryWorkspaceStatus` と `invokeWorkspaceCommand` のシグネチャを追加                                            |
| `acp-bridge/src/bridgeOptions.ts`                             | JSDoc 参照を更新                                                                                                                                                                     |
| `acp-bridge/src/status.ts`                                    | エラーメッセージ内のクラス名を更新                                                                                                                                                                |
| `cli/src/serve/httpAcpBridge.ts` → 改名 `acpSessionBridge.ts` | re-export を更新                                                                                                                                                                      |
| `cli/src/serve/runQwenServe.ts`                               | `DaemonWorkspaceService` を構築し、callback を注入して、routes と /acp ハンドラに渡す                                                                                                           |
| `cli/src/serve/server.ts`                                     | routes が `fsFactory` / `DeviceFlowRegistry` を直接呼び出すのではなく、`workspace.file.*` / `workspace.auth.*` を呼び出すよう変更                                                                                       |
| `cli/src/serve/workspaceAgents.ts`                            | ビジネスロジックを `agentsService.ts` に移行。元のファイルは route handler の薄いラッパー（ctx の構築 → service の呼び出し）に変更                                                                                             |
| `cli/src/serve/workspaceMemory.ts`                            | 同上                                                                                                                                                                                |
| `cli/src/serve/routes/workspaceFileRead.ts`                   | 同上                                                                                                                                                                                |
| `cli/src/serve/routes/workspaceFileWrite.ts`                  | 同上                                                                                                                                                                                |
| `/acp` handler（`acp-integration/` または `serve/` 内）           | northbound メソッドのディスパッチを新規追加                                                                                                                                                     |

---

## 8. SDK 互換性とエラーフォーマット

### 8.1 SDK 後方互換性

REST API 表面（パス、HTTP メソッド、リクエスト/レスポンス JSON スキーマ）は変更されません。`sdk-typescript` の `DaemonClient` / `DaemonSessionClient` は一切変更不要です。

検証方法：既存の `packages/sdk-typescript/test/unit/DaemonClient.test.ts` と `DaemonSessionClient.test.ts` は、本 PR で一切修正せずにパスする必要があります。

### 8.2 /acp trust gate 拒否時のエラーフォーマット

両トランスポートは意味的に等価ですが、エンコーディングが異なります：

| シナリオ                          | REST                                       | /acp (JSON-RPC)                                                          |
| ----------------------------- | ------------------------------------------ | ------------------------------------------------------------------------ |
| 無効または欠落している bearer token        | `401 { error, code: "unauthorized" }`      | `{ error: { code: -32001, message: "unauthorized" } }`                   |
| 無効な clientId                 | `400 { error, code: "invalid_client_id" }` | `{ error: { code: -32602, message: "invalid_client_id", data: {...} } }` |
| trust gate による拒否（パスエスケープなど） | `403 { error, code: "forbidden" }`         | `{ error: { code: -32003, message: "forbidden", data: {...} } }`         |

> JSON-RPC エラーコードは [ACP error code registry](https://spec.acpprotocol.org) に準拠します（標準範囲 -32000 ~ -32099 はサーバー定義のアプリケーションエラーです）。具体的なコード値は、実装時に `/acp` の既存のエラーマッピングロジック（`acp-integration/errorCodes.ts`）に整合させます。

---

## 9. テスト戦略

| レイヤー                | テストタイプ                                                                | カバレッジ目標                                                       |
| ----------------- | ----------------------------------------------------------------------- | -------------------------------------------------------------- |
| サブサービス単体  | Jest、fsFactory / DeviceFlowRegistry / SubagentManager / callbacks をモック化 | ビジネスロジックの正確性 + trust gate による不正な clientId の拒否                  |
| ルート統合 | 既存のルートテストを service 経由に変更（HTTP 表面が不変であることを検証）                | 回帰保証、REST パスが壊れないこと                                    |
| E2E 等価性検証      | 実際の serve を起動 + HTTP リクエスト                                              | REST と `/acp` が同一操作に対して等価な結果を返すこと。trust gate が両端で一貫して拒否すること |
### E2E 検証マトリクス

- File read/write：REST `GET /file` vs `/acp` `qwen/workspace/fs/read` → 同一結果
- Agent CRUD：REST `POST /workspace/agents` vs `/acp` `qwen/workspace/agents/create` → 同一動作
- Trust gate rejection：無効な clientId の場合、両方のパスで 403 を返す
- Workspace init：fsFactory の正常動作と audit trail の生成を検証

---

## 10. PR の構成

単一の PR でアトミックにコミットし、以下を含む：

- DaemonWorkspaceService の全新規ファイル
- REST route handler を service を呼び出すよう変更
- bridge の軽量化（8 個の workspace メソッドを移行）+ 2 個の child 委譲メソッドを新規公開
- `HttpAcpBridge` → `AcpSessionBridge` へのリネーム
- `/acp` northbound ext methods の追加（27 個）
- 全テスト（unit + integration + e2e）

---

## 11. 明示的にやらないこと（スコープ境界）

- workspace-scoped EventBus（PR 24 の領域）
- workspace-scoped ClientRegistry（PR 24 の領域）
- L2 ↔ L3 の分割（`ClientSideConnection` を bridge から切り出すこと）
- REST を `/acp` 互換 shim にすること（長期的な方向性）
- channels standalone モードの統一（独立デプロイ形態に関する問題）
- `listWorkspaceSessions` / `recordHeartbeat` / `getHeartbeatState` / `updateSessionMetadata` の移行（session-scoped のため、現状のまま維持）
- `publishWorkspaceEvent` / `knownClientIds` の ownership 移譲（session 派生インフラのため、bridge が保持し、service は callback 経由で消費）

---

## 12. chiga0 の確認が必要な意思決定ポイント

1. `/acp` northbound 名前空間：`qwen/workspace/...` vs その他（例：`qwen/control/...` の再利用）
2. リネームを同じ PR に含めるか：基本的には同じ PR に含める方針だが、フィードバックに応じて分割可能

> 上記 2 点の調整が必要であっても、名前とコミット境界にのみ影響し、アーキテクチャには影響しない。