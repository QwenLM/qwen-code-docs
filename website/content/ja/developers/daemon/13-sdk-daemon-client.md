# TypeScript SDK デーモンクライアント

## 概要

`packages/sdk-typescript/src/daemon/` は **TypeScript SDK のデーモンクライアント**です。これは、実行中の `qwen serve` デーモンに、任意の TypeScript / JavaScript ホスト（CLI 自体の TUI アダプター、チャネルボットバックエンド、VS Code IDE コンパニオン、カスタムスクリプト、サーバーサイドの Web バックエンド）から接続するための標準的な方法です。他のすべてのアダプターはこれに依存しています。

パッケージの構成は意図的に小さくシンプルに保たれています。

| ファイル                   | 公開インターフェース                                                                                                                 |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `index.ts`                 | 公開バレル（`DaemonClient`, `DaemonSessionClient`, `DaemonAuthFlow`, `parseSseStream`, イベントリデューサー、型）。                  |
| `DaemonClient.ts`          | 低レベルの HTTP/SSE ファサード — `qwen-serve-protocol.md` の各ルートに対応するメソッドを提供。                                       |
| `DaemonSessionClient.ts`   | SSE リプレイ追跡を備えたセッションスコープのラッパー。                                                                               |
| `DaemonAuthFlow.ts`        | 高レベルの OAuth デバイスフローヘルパー。                                                                                            |
| `sse.ts`                   | `parseSseStream`（NDJSON / SSE フレームパーサー）。                                                                                  |
| `events.ts`                | `asKnownDaemonEvent`, `reduceDaemonSessionEvent`, `reduceDaemonAuthEvent`（[`09-event-schema.md`](./09-event-schema.md) を参照）。   |
| `types.ts`                 | `DaemonCapabilities`, `DaemonSession`, `DaemonEvent`, `PermissionResponse`, `PromptResult`, MCP / エージェント / メモリ / 認証関連の型。 |

チュートリアルの例は [`../examples/daemon-client-quickstart.md`](../examples/daemon-client-quickstart.md) にあります。このドキュメントはアーキテクチャとコントラクトのリファレンスです。

## 責務

- デーモンの各 HTTP ルートに対して 1 つの TypeScript メソッドを提供する。
- すべてのリクエストに Bearer トークンと `X-Qwen-Client-Id` を正しく付与する。
- 呼び出し元の `AbortSignal` と呼び出しごとのタイムアウトを合成する（長時間稼働する SSE を切断しないようにする）。
- SSE フレームをストリーミングし、型付けされた `DaemonEvent` にパースする。
- 再接続時に正しくリプレイされるように、セッションごとに `lastSeenEventId` を追跡する。
- デーモンが指定する間隔でポーリングを行うデバイスフロー認証のインターフェースを公開する。

## アーキテクチャ

### `DaemonClient` (`DaemonClient.ts`)

コンストラクタ:

```ts
new DaemonClient({
  baseUrl: string,                  // default 'http://127.0.0.1:4170'
  token?: string,
  fetch?: typeof globalThis.fetch,  // injectable for tests
  fetchTimeoutMs?: number,          // 0 = disabled; default DEFAULT_FETCH_TIMEOUT_MS
});
```

メソッドグループ（すべてのメソッドはオプションの `clientId` を受け取り、`X-Qwen-Client-Id` を付与します）:

| グループ               | メソッド                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 基盤処理               | `health()`, `capabilities()`, `auth` (lazy `DaemonAuthFlow` accessor)                                                                                                                                                                                                                                                                                                                                                                                                                       |
| セッション             | `createOrAttachSession`, `loadSession`, `resumeSession`, `listSessions`, `closeSession`, `setSessionMetadata`, `getSessionContext`, `getSessionSupportedCommands`, `setSessionApprovalMode`, `setSessionModel`                                                                                                                                                                                                                                                                              |
| プロンプト実行         | `prompt`, `cancel`, `heartbeat`                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| イベント               | `subscribeEvents` (SSE generator), `subscribeEventsStream` (raw response)                                                                                                                                                                                                                                                                                                                                                                                                                   |
| 権限                   | `respondToPermission`, `respondToSessionPermission`                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| ワークスペーススナップショット | `getWorkspaceMcp`, `getWorkspaceSkills`, `getWorkspaceProviders`, `getWorkspaceEnv`, `getWorkspacePreflight`                                                                                                                                                                                                                                                                                                                                                                               |
| ワークスペース変更     | `addWorkspace`, `updateWorkspace`, `writeWorkspaceMemory`, `readWorkspaceMemory`, `rememberWorkspaceMemory`, `getWorkspaceMemoryRememberTask`, `forgetWorkspaceMemory`, `getWorkspaceMemoryForgetTask`, `dreamWorkspaceMemory`, `getWorkspaceMemoryDreamTask`, `listWorkspaceAgents`, `getWorkspaceAgent`, `createWorkspaceAgent`, `updateWorkspaceAgent`, `deleteWorkspaceAgent`, `setWorkspaceToolEnabled`, `setWorkspaceSkillEnabled`, `restartMcpServer`, `initWorkspace` |
| ファイル               | `readFile`, `readFileBytes`, `writeFile`, `editFile`, `listDirectory`, `globPaths`, `statPath`                                                                                                                                                                                                                                                                                                                                                                                              |
| 認証                   | `startDeviceFlow`, `pollDeviceFlow`, `cancelDeviceFlow`, `getAuthStatus`                                                                                                                                                                                                                                                                                                                                                                                                                    |

### `fetchWithTimeout`

すべてのリクエストは `fetchWithTimeout` を経由します。重要な詳細は以下の通りです。

- **ボディの読み取りはタイマーのスコープ内で行われます。** 以前の実装ではヘッダー到着時にタイマーがクリアされていましたが、プロキシがボディの途中で停滞した場合、`await res.json()` が `fetchTimeoutMs` を超えてハングする可能性がありました。現在の形状では、ボディ読み取りコードをコールバックとして渡すため、タイマーはヘッダーの到着とボディの消費の両方をカバーします。
- **`perCallTimeoutMs`** を使用すると、単一の呼び出しでクライアント全体のデフォルト値をオーバーライドできます。最も目立つ呼び出し元は `restartMcpServer` で、SDK は `MCP_RESTART_DEFAULT_TIMEOUT_MS = 330_000`（5分30秒）を使用します。デーモン側の `MCP_RESTART_TIMEOUT_MS` は正確に 300秒です。クライアントがその値に一致させた場合、300秒付近で完了する再起動は、デーモンが構造化レスポンスをシリアライズして送信している間にレースに負ける可能性があり、偽陽性の `TimeoutError` を引き起こします。追加の 30秒は、両サイドでのシリアライズ、ネットワーク転送、デコードをカバーします。より厳しい予算が必要な呼び出し元は `timeoutMs` を渡すことができます。`0` を渡すとタイムアウトが無効になります。
- **`AbortSignal.any`** は呼び出し元から提供されたシグナルと呼び出しごとのタイマーシグナルを合成するため、呼び出し元のキャンセルと呼び出しごとのタイムアウトの両方がクリーンにアボートされます。
- **`AbortSignal.timeout()` の代わりに `AbortController` とキャンセル可能な `setTimeout`** を使用しているため、高速に解決されるリクエストがイベントループ上で保留中のタイマーをリークすることはありません。タイマーは `finally` でクリアされます。
- **ストリーミングエンドポイント（`subscribeEvents`）はタイムアウトをバイパスします** — 長時間稼働する SSE はこれによって切断されてはなりません。

### `DaemonSessionClient` (`DaemonSessionClient.ts`)

1つのセッションにバインドし、`lastSeenEventId` を自動的に追跡するため、呼び出し元の追加の状態なしに SSE リプレイと再接続が機能します。

```ts
class DaemonSessionClient {
  readonly client: DaemonClient;
  readonly session: DaemonSession;
  readonly state: DaemonSessionState;
  private lastSeenEventId: number | undefined;

  static createOrAttach(client, req?): Promise<DaemonSessionClient>;
  static load(client, sessionId, req?): Promise<DaemonSessionClient>;
  static resume(client, sessionId, req?): Promise<DaemonSessionClient>;

  events(opts?: DaemonSessionSubscribeOptions): AsyncIterable<DaemonEvent>;
  prompt(req: PromptRequest): Promise<PromptResult>;
  cancel(): Promise<void>;
  respondToPermission(...): Promise<PermissionResponse>;
  setModel(modelServiceId): Promise<SetModelResult>;
  heartbeat(): Promise<HeartbeatResult>;
  setMetadata(metadata): Promise<SessionMetadataResult>;
  close(): Promise<void>;
}
```

`events()` はデフォルトで `resume: true` を指定して `client.subscribeEvents` をプロキシします。追跡された `lastSeenEventId` を渡すため、再接続時に前のサブスクリプションが停止した場所からリプレイされます。yield されるイベントごとに `lastSeenEventId` が更新されます。

### `DaemonAuthFlow` (`DaemonAuthFlow.ts`)

```ts
class DaemonAuthFlow {
  start(opts: { providerId, ... }): Promise<DaemonAuthFlowHandle>;
}
interface DaemonAuthFlowHandle {
  deviceFlowId: string;
  providerId: string;
  expiresAt: string;
  verificationUrl: string;
  userCode: string;
  awaitCompletion(opts?): Promise<DaemonAuthDeviceFlowState>;
  cancel(): Promise<void>;
}
```

`awaitCompletion()` は、フローが `authorized`、`failed`、または `cancelled` になるまで、デーモンが指定する `intervalMs` で `GET /workspace/auth/device-flow/:id` をポーリングします。これは `client.auth` を介して遅延構築されるため、認証に触れないクライアントはアロケーションコストを負担しません。

### `parseSseStream` (`sse.ts`)

`Response.body`（`ReadableStream<Uint8Array>`）を `AsyncIterable<DaemonEvent>` に変換します。以下の処理を行います。

- LF および CRLF フレームの処理。
- バッファオーバーフローの上限（16 MiB）— デーモンが異常に大きな単一フレームを出力した場合の防御的な境界。
- AbortSignal の配線 — アボートはストリームとイテレータを閉じます。
- コメントのみのフレームと不明なイベントタイプ（`DaemonEvent` として透過的に渡されます。SDK 側は `asKnownDaemonEvent` を介して下流で絞り込みを行います）。

### 型 (`types.ts`)

主なエクスポート: `DaemonCapabilities`, `DaemonSession` (`{ sessionId, workspaceCwd, attached, clientId?, createdAt? }`), `DaemonEvent`, `DaemonSessionState`, `DaemonSessionContextStatus`, `DaemonSessionSupportedCommandsStatus`, `PermissionResponse`, `PromptResult`, `HeartbeatResult`, `SetModelResult`, `SessionMetadataResult`、および MCP / エージェント / メモリ / 認証の結果型。管理されたワークスペースメモリのタスク型には `DaemonWorkspaceMemoryRememberTask`, `DaemonWorkspaceMemoryForgetTask`, `DaemonWorkspaceMemoryDreamTask` が含まれます。

ワークスペースの管理メモリタスクヘルパー:

```ts
await client.rememberWorkspaceMemory('Use strict TypeScript.', {
  contextMode: 'workspace',
});
await client.getWorkspaceMemoryRememberTask('remember-...');

await client.forgetWorkspaceMemory('old preference');
await client.getWorkspaceMemoryForgetTask('forget-...');

await client.dreamWorkspaceMemory();
await client.getWorkspaceMemoryDreamTask('dream-...');
```

ワークスペースのスキルトグルは、両方のクライアント形状で利用できます。

```ts
await client.setWorkspaceSkillEnabled('review', false, {
  clientId: 'dashboard-1',
});
await client
  .workspaceByCwd('/work/secondary')
  .setWorkspaceSkillEnabled('review', true, { clientId: 'dashboard-1' });
```

事前に `capabilities.features.includes('workspace_skill_toggle')` を確認してください。型付きの `DaemonSkillToggleResult` は、正規の `skillName`、ディスク状態の `changed`、アクティベーション状態（`applied`、`deferred`、または `partial`）、およびリフレッシュ/失敗したセッション数を報告します。`DaemonWorkspaceSkillStatus.userInvocable` はオプションの false のみのフィールドです。不在の場合、スキルはユーザーが呼び出し可能であることを意味します。

バッチ変更の場合は、事前に `workspace_skill_batch_toggle` を確認し、同じコントラクトでどちらのクライアント形状でも呼び出せます。

```ts
await client.setWorkspaceSkillsEnabled(['review', 'deploy'], false, {
  clientId: 'dashboard-1',
});
await client
  .workspaceByCwd('/work/secondary')
  .setWorkspaceSkillsEnabled(['review', 'deploy'], true);
```

`DaemonSkillBatchToggleResult` には、順序付きの成功 `results`、ターゲットごとの `errors`、およびバッチレベルのアクティベーション/セッションリフレッシュのカウントが含まれます。デーモンは有効なターゲットを一緒に永続化し、アクティブなセッションを一度だけリフレッシュします。1つの期待されるターゲットエラーが他の有効なターゲットをブロックすることはありません。このメソッドは非 200 レスポンスの場合にのみスローします。200 はすべてのターゲットが適用されたことを意味しないため、バッチを成功として扱う前に常に `errors` を確認してください。

V2 Extension バッチアクティベーションは非同期の Extension 操作モデルを保持します。事前に `extension_batch_activation_v2` を確認し、グローバルデフォルトバッチまたは選択されたワークスペースのオーバーライドバッチを提出し、既存の操作ヘルパーでポーリングします。

```ts
const globalHandle = await client.setExtensionDefaultActivations(
  ['formatter', 'review-tools'],
  'disabled',
  'dashboard-1',
);
const workspaceHandle = await client
  .workspaceByCwd('/work/secondary')
  .setExtensionActivations(
    ['formatter', 'review-tools'],
    'inherit',
    'dashboard-1',
  );
const operation = await client.waitForExtensionOperation(workspaceHandle);
```

最終的な操作結果には順序付きの `results` が含まれます。`enabled` または `disabled` を設定する際、ターゲットはインストールされている必要はありません。デーモンは名前宣言を保存し、その名前の Extension が後からインストールされたときにそのアクティベーションポリシーを保持します。変更されたすべてのターゲットは 1 つの Extension Store 世代と 1 回の reconciliation を共有します。グローバルデフォルトバッチは登録されたすべてのランタイムを reconciliation します。ワークスペースバッチは選択された信頼されたランタイムのみを解決および reconciliation します。ワークスペースの `inherit` は正確なオーバーライドをクリアしますが、不明な名前の宣言は作成しません。すべて不明なクリアは reconciliation なしの no-op として成功します。単一のアクティベーションメソッドはインストール済みのみのままです。

ワークスペースの表示名はオプションのプレゼンテーションメタデータです。事前に `capabilities.features.includes('workspace_display_name')` を確認してください。ワークスペース ID と正規パスが唯一のセレクターであり、表示名の重複は有効です。

```ts
const workspace = await client.addWorkspace('/srv/repos/payments', {
  persist: true,
  displayName: 'Payments Production',
});

await client.updateWorkspace(workspace.id, {
  displayName: 'Payments',
});
await client.updateWorkspace(workspace.id, { displayName: null });
```

`addWorkspace` は `displayName?: string` を受け取り、設定されている場合にそれを返します。`updateWorkspace` は ID または cwd セレクターと `{ displayName: string | null }` を受け入れます。`null` は名前をクリアします。名前はトリミング後 256 文字に制限され、内部の C0/DEL 制御文字は拒否されます。プロセスローカルのワークスペースは、現在のデーモンプロセス間のみ名前を保持します。一致する永続化された登録は、既存のストアを通じて更新されます。`DaemonWorkspaceCapability.displayName` はオプションのままなので、SDK は古いデーモンとも引き続き相互運用できます。

## ワークフロー

### Create-or-attach + 最初のプロンプト

```mermaid
sequenceDiagram
    autonumber
    participant App as アプリケーションコード
    participant SC as DaemonSessionClient
    participant DC as DaemonClient
    participant D as Daemon

    App->>SC: DaemonSessionClient.createOrAttach(client, {clientId: 'alice'})
    SC->>DC: client.createOrAttachSession({}, 'alice')
    DC->>D: POST /session<br/>Authorization: Bearer ...<br/>X-Qwen-Client-Id: alice
    D-->>DC: {sessionId, attached, clientId}
    DC-->>SC: DaemonSession
    SC-->>App: DaemonSessionClient

    App->>SC: prompt({...})
    SC->>DC: client.prompt(sessionId, req, 'alice')
    DC->>D: POST /session/:id/prompt
    D-->>DC: {result}
    DC-->>SC: PromptResult
```

### リプレイ付きのサブスクライブ

```mermaid
sequenceDiagram
    autonumber
    participant App as アプリケーションコード
    participant SC as DaemonSessionClient
    participant DC as DaemonClient
    participant D as Daemon
    participant P as parseSseStream

    App->>SC: for await (e of session.events())
    SC->>DC: client.subscribeEvents(sessionId, {lastEventId: <tracked>}, 'alice')
    DC->>D: GET /session/:id/events<br/>Last-Event-ID: 42
    D-->>DC: SSE bytes (replay then live)
    DC->>P: parseSseStream(res.body, signal)
    loop per frame
        P-->>SC: DaemonEvent
        SC->>SC: bump lastSeenEventId
        SC-->>App: DaemonEvent
        App->>App: asKnownDaemonEvent + reduce
    end
```

### デバイスフロー認証

```mermaid
sequenceDiagram
    autonumber
    participant App as アプリケーション
    participant AF as DaemonAuthFlow
    participant DC as DaemonClient
    participant D as Daemon

    App->>AF: start({providerId: 'qwen-oauth'})
    AF->>DC: client.startDeviceFlow(...)
    DC->>D: POST /workspace/auth/device-flow
    D-->>DC: {deviceFlowId, verificationUrl, userCode, intervalMs, expiresAt}
    DC-->>AF: handle
    AF-->>App: handle (with awaitCompletion())
    App->>AF: handle.awaitCompletion()
    loop until done
        AF->>D: GET /workspace/auth/device-flow/:id
        D-->>AF: {status: 'pending' | 'authorized' | ...}
        AF->>AF: setTimeout(intervalMs)
    end
    AF-->>App: final state
```

`qwen-oauth` はレガシーな v1 プロバイダー識別子です。Qwen OAuth の無料枠は 2026-04-15 に廃止されたため、新しいクライアントは現在サポートされている認証プロバイダーが利用可能な場合、そちらを優先すべきです。

## 状態とライフサイクル

- `DaemonClient` はコネクションレスであり、インスタンス生成時には何も起こりません。各メソッドは新しい `fetch` を開始します。
- `DaemonSessionClient` は `events()` の呼び出しをまたいで `lastSeenEventId` を保持し、再接続時には最後に確認した ID からリプレイします。
- `DaemonAuthFlow` は遅延初期化されます — `client.auth` は初回アクセス時にそれを構築します。
- SSE イテレーターは、(a) デーモンがストリームを終了したとき、(b) `AbortSignal.abort()` が発火したとき、(c) コンシューマーが `for await` を抜けたとき、または (d) バッファーオーバーフローの上限（16 MiB）に達したときにクローズされます。

## 依存関係

- `globalThis.fetch`（Node 18+ の組み込み、ブラウザー、undici など）。テスト用に `DaemonClient` ごとに注入可能です。
- ネイティブの `AbortController` / `AbortSignal.any` / `setTimeout`。
- `@qwen-code/qwen-codeCore` や `@qwen-code/acp-bridge` への推移的な依存関係はありません — SDK パッケージは完全に分離されており、外部のコンシューマーがデーモンの内部実装を取り込むことはありません。

## `ui/*` サブパッケージ ([#4328](https://github.com/QwenLM/qwen-code/pull/4328) + [#4353](https://github.com/QwenLM/qwen-code/pull/4353))

SDK は `packages/sdk-typescript/src/daemon/ui/` もエクスポートします。これは、デーモンイベントをトランスクリプトブロックに変換する、ホストに依存しないプリミティブのセットです。

- `normalizeDaemonEvent(evt)` は、既知の 53 種類のデーモンワイヤーイベントを、UI で扱いやすい 43 種類の `DaemonUiEventType` 値にマッピングします。モデル化されていないイベントや不正なイベントは `debug` に正規化されます。
- `createDaemonTranscriptState()` と `reduceDaemonTranscriptEvents(state, events)` は、UI イベントを `DaemonTranscriptBlock[]` に射影します。
- `createDaemonTranscriptStore()` はサブスクライブ / ディスパッチをラップします。
- `render.ts` / `terminal.ts` は HTML とターミナルのベースラインレンダラーを提供し、`toolPreview.ts` はツール呼び出しのサマリーを生成します。
- セレクターには `selectTranscriptBlocksOrderedByEventId`、`selectPendingPermissionBlocks`、`selectCurrentTool`、`selectApprovalMode`、`selectToolProgress`、`selectSubagentChildBlocks`、`formatMissedRange`、`formatBlockTimestamp` が含まれます。
- パブリック定数には `DAEMON_PLAN_TOOL_CALL_ID` が含まれます。
- `conformance.ts` にはクロスホスト一貫性テストスイートが含まれています。

最初の本番環境でのコンシューマーは、React の `DaemonSessionProvider` を介した `packages/webui/src/daemon/` です。詳細なアーキテクチャ、用語集、セレクターテーブル、およびレガシーな `DaemonTuiAdapter` との関係については、[`14-cli-tui-adapter.md`](./14-cli-tui-adapter.md) を参照してください。

このサブパッケージは `@qwen-code/sdk/daemon` サブパスからエクスポートされます。`import { DaemonClient }` を実行している既存のコードは影響を受けません。

## SDK を使用した `Last-Event-ID` 再接続

### `DaemonSessionClient` による自動トラッキング

`DaemonSessionClient` は内部的に `lastSeenEventId` をトラッキングします。数値の `id` を持つ生成されたイベントごとにカーソルが更新されます。後続の `events()` 呼び出しは、トラッキングされた ID を自動的に `Last-Event-ID` として渡すため、呼び出し側で追加の状態を保持することなく、リプレイ付きの再接続が機能します。

```ts
import { DaemonClient, DaemonSessionClient } from '@qwen-code/sdk/daemon';

const client = new DaemonClient({ baseUrl: 'http://127.0.0.1:4170', token });
const session = await DaemonSessionClient.createOrAttach(client);

// 最初のサブスクリプション — ライブから開始（新しいセッションの場合はリングの先頭から）。
for await (const event of session.events()) {
  console.log(event.type, event.id);
  // session.lastEventId は id を含む各フレームで更新されます。
  if (shouldStop(event)) break;
}

// 再接続 — Last-Event-ID: <最後に見た id> を自動的に送信します。
// デーモンはリングから逃したイベントをリプレイし、その後ライブに移行します。
for await (const event of session.events()) {
  // リプレイフレームが最初に到着し、次に合成された `replay_complete`、
  // その後ライブイベントが続きます。
  handleEvent(event);
}
```

### `DaemonClient` を使用した手動再接続

より低レベルの制御が必要な場合は、`DaemonClient.subscribeEvents` を直接使用し、カーソルを自分で管理します。

```ts
const client = new DaemonClient({ baseUrl: 'http://127.0.0.1:4170', token });

let cursor: number | undefined; // undefined = 初回接続時はライブのみ

async function* subscribe(sessionId: string, signal: AbortSignal) {
  for await (const event of client.subscribeEvents(sessionId, {
    lastEventId: cursor,
    signal,
  })) {
    // id を含むフレームのみがカーソルを進めます。
    if (event.id !== undefined) {
      cursor = event.id;
    }
    // リングからのエビクションによるギャップを処理します。
    if (event.type === 'state_resync_required') {
      // 状態が古くなっています — デーモンのバウンドされたリプレイスナップショットウィンドウをリロードします。
      await client.loadSession(sessionId);
      continue;
    }
    if (event.type === 'history_truncated') {
      // 情報のみ。ステータス通知をレンダリングし、保持されたリプレイイベントの適用を
      // 続行します。別のリロードはトリガーしません。
    }
    yield event;
  }
}
```

### リトライループによる再接続

SDK はネットワーク障害時に自動リトライを**行いません**。`events()` の周りにリトライループを実装してください。

```ts
async function resilientSubscribe(session: DaemonSessionClient) {
  const MAX_RETRIES = 10;
  const BASE_DELAY_MS = 1000;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      // `resume: true`（デフォルト）はトラッキングされた lastSeenEventId を渡します。
      for await (const event of session.events()) {
        attempt = 0; // イベント成功時にリセット
        handleEvent(event);
      }
      break; // 正常なストリーム終了
    } catch (err) {
      const delay = BASE_DELAY_MS * 2 ** Math.min(attempt, 5);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
}
```

再接続時、デーモンはサイズ制限付きリング（デフォルト 8000 イベント）から `id > lastSeenEventId` のイベントをリプレイします。ギャップがリングの容量を超える場合、`state_resync_required` フレームがクライアントにシグナルを送信し、`loadSession` を呼び出してバウンドされたリプレイスナップショットウィンドウから再構築します。そのスナップショットは `history_truncated` で始まる可能性があります。これをオペレーターが確認できるステータスマーカーとして扱い、別の再同期リクエストとして扱わないでください。

`history_truncated.fullTranscriptAvailable` は真偽値のケイパビリティフラグです。`true` の場合、呼び出し元は `DaemonClient.getSessionTranscriptPage(sessionId, { cursor, limit })` でフルアクティブ永続化リプレイをページングできます。`false` の場合、クライアントはバウンドされたリプレイのレンダリングを通常通り続行する必要があります。

`workspace_persisted_transcript` がアドバタイズされている場合、`client.workspaceById(workspaceId).getSessionTranscriptPage(sessionId, { cursor, limit })` は、選択された登録済みワークスペースに ACP にアタッチせずに読み取ります。ワークスペース修飾メソッドは、クライアントが置換可能なトランスポートを持っている場合でも常にネイティブ REST を使用します。そのカーソルはデーモンが再起動すると期限切れになります。

`workspace_session_export` がアドバタイズされている場合、`client.workspaceById(workspaceId).exportSession(sessionId, { format })` または `client.workspaceByCwd(workspaceCwd).exportSession(...)` は、選択された信頼されたワークスペースのアクティブな永続化トランスクリプトをエクスポートします。既存の `DaemonSessionExportResult` を返し、オプションのクライアント ID とクライアント全体の fetch タイムアウト動作を保持し、クライアントが置換可能なトランスポートを持っている場合でも常にネイティブ REST を使用します。`session_export` や `workspace_qualified_rest_core` からこのメソッドのサーバーサポートを推測しないでください。古いデーモンはプライマリのみのエクスポートを保持します。

`workspace_archived_session_export` がアドバタイズされている場合、`client.workspaceById(workspaceId).exportArchivedSession(sessionId, { format })` または対応する `workspaceByCwd` メソッドを使用して、選択されたワークスペースのアーカイブされた永続化トランスクリプトのみをエクスポートします。このメソッドはアクティブエクスポートと同じ結果型とネイティブ REST 動作を使用しますが、アクティブセッションにフォールバックすることはありません。サポートはアクティブエクスポートのケイパビリティから推測できません。

`workspace_session_live_state` がアドバタイズされている場合、`client.getWorkspaceSessionLiveState(workspaceCwd)` またはスコープ付きの `client.workspaceById(workspaceId).getSessionLiveState()` / `client.workspaceByCwd(workspaceCwd).getSessionLiveState()` は、選択された信頼されたワークスペースのメモリ内のみのライブセッションスナップショットとそのカタログバージョンを読み取り、`DaemonWorkspaceSessionLiveState`（`{ v: 1, catalogVersion: DaemonSessionCatalogVersion, sessions: DaemonSessionLiveState[] }`）を返します。これらのメソッドは常にベアラー認証とエンコードされたワークスペースセレクターでネイティブ REST を使用し、オプションのクライアント ID を保持し、既存の短時間リクエストタイムアウトを使用します。`requireCapability()` は呼び出しません — ポールごとにケイパビリティプローブを行うとリクエスト数が倍増するため — 代わりに、コンシューマーは既にロードされたケイパビリティから `workspace_session_live_state` を一度プリフライトし、タグがない場合は既存のカタログポーリングにフォールバックします。`workspace_qualified_rest_core` からサポートを推測しないでください。各 `DaemonSessionLiveState` はオプションの `updatedAt` アクティビティ watermark を保持し、コンシューマーは完了したターンの後にカタログをリロードする代わりに、既に保持しているカタログ行の最新性をリフレッシュできます。これは現在のブリッジ内の最初の running-turn terminal より前、およびデーモンまたはランタイムの置換後には存在しないため、コンシューマーは欠落値を未サポートとして扱うのではなく、既存のカタログフォールバックを保持する必要があります。

### 構築時の `lastEventId` のシード

プロセスの再起動をまたいでカーソルを永続化する呼び出し元は、それをシードできます。

```ts
const session = new DaemonSessionClient({
  client,
  session: { sessionId, workspaceCwd, attached: true },
  lastEventId: persistedCursor, // 永続化された位置から再開
});
```

値は有限の非負整数である必要があります（構築時に検証されます）。無効な値は例外をスローします。

## 設定

| 設定項目 | 場所 | 効果 |
| --- | --- | --- |
| `baseUrl` | `DaemonClient` コンストラクター | デーモンの URL。末尾のスラッシュは削除されます。 |
| `token` | `DaemonClient` コンストラクター | `Authorization: Bearer` としてスタンプされます。 |
| `fetch` | `DaemonClient` コンストラクター | テスト用の注入ポイント。 |
| `fetchTimeoutMs` | `DaemonClient` コンストラクター | 呼び出しごとのタイムアウト。`0` = 無効。 |
| `clientId` | メソッドごとのオプション引数 | `X-Qwen-Client-Id` ヘッダー（[`08-session-lifecycle.md`](./08-session-lifecycle.md) を参照）。 |
| `lastEventId` | `DaemonSessionClient` コンストラクター | リプレイカーソルのシード。 |
| `maxQueued` | サブスクライブごとのオプション | SSE ルート用の `?maxQueued=N`。事前に `caps.features.slow_client_warning` を確認してください。 |
| `perCallTimeoutMs` | メソッドごと（例: `restartMcpServer`） | クライアント全体のタイムアウトをオーバーライドします。 |

## 注意事項と既知の制限

- **`fetchTimeoutMs` は呼び出しごとであり、コネクションレベルではありません。** 長いボディの読み取りはタイマーを共有します。レスポンスをストリーミングするデーモンは、呼び出しごとにオーバーライドするか、タイムアウトを `0` に設定する必要があります。
- **SSE は fetch タイムアウトをバイパスします** — 長時間存続する SSE 接続は `fetchTimeoutMs` によって切断されません。呼び出し元が制御するキャンセルには `AbortSignal` を使用してください。
- **`parseSseStream` のバッファー上限は 16 MiB** です（防御的な上限）。これより大きな単一のフレームはイテレーターを中止します（デーモンがこのようなフレームを正当に発行することはありません）。
- **`asKnownDaemonEvent` は認識されないイベントタイプに対して `undefined` を返します。** SDK コンシューマーは、ユニオン型が網羅的であると想定するのではなく、この分岐を処理する必要があります。これが前方互換性の契約です。認識されないイベントは `DaemonSessionViewState.unrecognizedKnownEventCount` をインクリメントします。
- **`client_evicted`、`slow_client_warning`、`stream_error` はリプレイリングに含まれません。** エビクション後の再接続はデーモンのリングから再開されます。エビクションフレームが再度表示されることはありません。
- **`DaemonClient` は自動リトライを行いません。** ネットワーク障害は拒否（rejection）として表面化します。再接続 / リプレイの戦略は呼び出し元の責任です（`DaemonSessionClient.events()` はリプレイを簡単にしますが、再接続は依然として呼び出しごとです）。

## 参照

- `packages/sdk-typescript/src/daemon/DaemonClient.ts`
- `packages/sdk-typescript/src/daemon/DaemonSessionClient.ts`
- `packages/sdk-typescript/src/daemon/DaemonAuthFlow.ts`
- `packages/sdk-typescript/src/daemon/sse.ts`
- `packages/sdk-typescript/src/daemon/events.ts`
- `packages/sdk-typescript/src/daemon/types.ts`
- エンドツーエンドのウォークスルー: [`../examples/daemon-client-quickstart.md`](../examples/daemon-client-quickstart.md)。
