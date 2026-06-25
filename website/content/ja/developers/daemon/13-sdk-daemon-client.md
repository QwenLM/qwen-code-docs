# TypeScript SDK Daemon Client

## 概要

`packages/sdk-typescript/src/daemon/` は **TypeScript SDK のデーモンクライアント**です。実行中の `qwen serve` デーモンに接続するための標準的な方法であり、TypeScript / JavaScript ホスト（CLI 自身の TUI アダプター、チャンネルボットバックエンド、VS Code IDE コンパニオン、カスタムスクリプト、サーバーサイド Web バックエンド）から利用されます。他のすべてのアダプターはこれに依存しています。

パッケージのレイアウトは意図的にシンプルにしています：

| ファイル                     | 公開インターフェース                                                                                                                        |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------ |
| `index.ts`               | パブリックバレル（`DaemonClient`、`DaemonSessionClient`、`DaemonAuthFlow`、`parseSseStream`、イベントリデューサー、型）。              |
| `DaemonClient.ts`        | 低レベル HTTP/SSE ファサード — `qwen-serve-protocol.md` の各ルートに対応するメソッド。                                                     |
| `DaemonSessionClient.ts` | SSE リプレイトラッキングを持つセッションスコープのラッパー。                                                                               |
| `DaemonAuthFlow.ts`      | 高レベルの OAuth デバイスフローヘルパー。                                                                                           |
| `sse.ts`                 | `parseSseStream`（NDJSON / SSE フレームパーサー）。                                                                                |
| `events.ts`              | `asKnownDaemonEvent`、`reduceDaemonSessionEvent`、`reduceDaemonAuthEvent`（[`09-event-schema.md`](./09-event-schema.md) 参照）。  |
| `types.ts`               | `DaemonCapabilities`、`DaemonSession`、`DaemonEvent`、`PermissionResponse`、`PromptResult`、MCP / エージェント / メモリ / 認証型。 |

ウォークスルーの例は [`../examples/daemon-client-quickstart.md`](../examples/daemon-client-quickstart.md) にあります。このドキュメントはアーキテクチャとコントラクトのリファレンスです。

## 責務

- デーモンの各 HTTP ルートに対応する TypeScript メソッドを提供する。
- すべてのリクエストにベアラートークンと `X-Qwen-Client-Id` を正しく付与する。
- 長時間の SSE を切断せずに、呼び出し元が指定した `AbortSignal` とコール単位のタイムアウトを組み合わせる。
- SSE フレームをストリーミングし、型付き `DaemonEvent` にパースする。
- セッションごとに `lastSeenEventId` を追跡し、再接続時にリプレイが正しく行われるようにする。
- デーモンが指定した間隔でポーリングするデバイスフロー認証インターフェースを公開する。

## アーキテクチャ

### `DaemonClient` (`DaemonClient.ts`)

コンストラクター：

```ts
new DaemonClient({
  baseUrl: string,                  // デフォルト 'http://127.0.0.1:4170'
  token?: string,
  fetch?: typeof globalThis.fetch,  // テスト用にインジェクション可能
  fetchTimeoutMs?: number,          // 0 = 無効; デフォルト DEFAULT_FETCH_TIMEOUT_MS
});
```

メソッドグループ（すべてのメソッドは `X-Qwen-Client-Id` を付与するためにオプションの `clientId` を受け取ります）：

| グループ               | メソッド                                                                                                                                                                                                                             |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| プラミング            | `health()`、`capabilities()`、`auth`（遅延 `DaemonAuthFlow` アクセサー）                                                                                                                                                               |
| セッション            | `createOrAttachSession`、`loadSession`、`resumeSession`、`listSessions`、`closeSession`、`setSessionMetadata`、`getSessionContext`、`getSessionSupportedCommands`、`setSessionApprovalMode`、`setSessionModel`                      |
| プロンプト           | `prompt`、`cancel`、`heartbeat`                                                                                                                                                                                                     |
| イベント              | `subscribeEvents`（SSE ジェネレーター）、`subscribeEventsStream`（生レスポンス）                                                                                                                                                           |
| 権限         | `respondToPermission`、`respondToSessionPermission`                                                                                                                                                                                 |
| ワークスペーススナップショット | `getWorkspaceMcp`、`getWorkspaceSkills`、`getWorkspaceProviders`、`getWorkspaceEnv`、`getWorkspacePreflight`                                                                                                                        |
| ワークスペースミューテーション | `writeWorkspaceMemory`、`readWorkspaceMemory`、`listWorkspaceAgents`、`getWorkspaceAgent`、`createWorkspaceAgent`、`updateWorkspaceAgent`、`deleteWorkspaceAgent`、`toggleWorkspaceTool`、`restartMcpServer`、`initializeWorkspace` |
| ファイル               | `readFile`、`readFileBytes`、`writeFile`、`editFile`、`listDirectory`、`globPaths`、`statPath`                                                                                                                                      |
| 認証                | `startDeviceFlow`、`pollDeviceFlow`、`cancelDeviceFlow`、`getAuthStatus`                                                                                                                                                            |

### `fetchWithTimeout`

すべてのリクエストは `fetchWithTimeout` を経由します。重要な詳細：

- **ボディの読み取りはタイマーのスコープ内です。** 以前の実装ではヘッダーが届いた時点でタイマーをクリアしていたため、プロキシがボディの途中で停止した場合、`await res.json()` が `fetchTimeoutMs` を超えてハングする可能性がありました。現在の実装では、ボディ読み取りコードをコールバックとして渡すことで、タイマーがヘッダーの到達とボディの読み取り両方をカバーします。
- **`perCallTimeoutMs`** は単一のコールでクライアント全体のデフォルトを上書きできます。最も目立つ呼び出し元は `restartMcpServer` で、SDK は `MCP_RESTART_DEFAULT_TIMEOUT_MS = 330_000`（5 分 30 秒）を使用します。デーモン自身の `MCP_RESTART_TIMEOUT_MS` はちょうど 300 秒ですが、クライアントがその値に合わせると、300 秒付近で完了する再起動がデーモンによる構造化レスポンスのシリアライズと送信の間に競合を引き起こし、誤った `TimeoutError` が発生する可能性があります。追加の 30 秒はシリアライズ、ネットワーク転送、両端のデコードをカバーします。より短いタイムアウトが必要な呼び出し元は `timeoutMs` を渡せます。`0` を渡すとタイムアウトが無効になります。
- **`AbortSignal.any`** は呼び出し元が指定したシグナルとコール単位のタイマーシグナルを組み合わせるため、呼び出し元によるキャンセルとコール単位のタイムアウトの両方がきれいにアボートされます。
- **`AbortController` + キャンセル可能な `setTimeout`**（`AbortSignal.timeout()` の代わり）を使用することで、高速に解決するリクエストがイベントループに保留タイマーをリークしません。タイマーは `finally` でクリアされます。
- **ストリーミングエンドポイント（`subscribeEvents`）はタイムアウトをバイパスします** — 長時間の SSE はタイムアウトによって切断されてはなりません。

### `DaemonSessionClient` (`DaemonSessionClient.ts`)

1 つのセッションにバインドし、`lastSeenEventId` を自動的に追跡することで、呼び出し元に追加の状態管理を求めることなく SSE リプレイと再接続が機能します。

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

`events()` はデフォルトで `resume: true` を指定して `client.subscribeEvents` にプロキシします — 追跡している `lastSeenEventId` を渡すことで、前のサブスクリプションが停止した場所から再接続時にリプレイが行われます。yield されるイベントごとに `lastSeenEventId` が更新されます。

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

`awaitCompletion()` は、フローが `authorized`、`failed`、または `cancelled` になるまで、デーモンが指定した `intervalMs` で `GET /workspace/auth/device-flow/:id` をポーリングします。`client.auth` を通じて遅延構築されるため、認証を使用しないクライアントはアロケーションコストを負いません。

### `parseSseStream` (`sse.ts`)

`Response.body`（`ReadableStream<Uint8Array>`）を `AsyncIterable<DaemonEvent>` に変換します。以下を処理します：

- LF および CRLF フレーミング。
- バッファオーバーフロー上限（16 MiB）— 単一の異常に大きなフレームを出力するデーモンに対する防御的な制限。
- AbortSignal の配線 — アボートするとストリームとイテレーターが閉じられます。
- コメントのみのフレームと未知のイベントタイプ（`DaemonEvent` としてそのまま渡され、SDK コンシューマーは `asKnownDaemonEvent` で下流において絞り込みます）。

### 型 (`types.ts`)

主なエクスポート：`DaemonCapabilities`、`DaemonSession`（`{ sessionId, workspaceCwd, attached, clientId?, createdAt? }`）、`DaemonEvent`、`DaemonSessionState`、`DaemonSessionContextStatus`、`DaemonSessionSupportedCommandsStatus`、`PermissionResponse`、`PromptResult`、`HeartbeatResult`、`SetModelResult`、`SessionMetadataResult`、および MCP / エージェント / メモリ / 認証の結果型。

## ワークフロー

### セッションの作成または接続と最初のプロンプト

```mermaid
sequenceDiagram
    autonumber
    participant App as App code
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
    participant App as App code
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
    participant App as App
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

`qwen-oauth` はレガシー v1 プロバイダー識別子です。Qwen OAuth 無料ティアは
2026-04-15 に廃止されたため、新しいクライアントは利用可能な現在サポートされている
認証プロバイダーを優先してください。

## 状態とライフサイクル

- `DaemonClient` はコネクションレスです。コンストラクション時には何も起きません。各メソッドは新しい `fetch` を開きます。
- `DaemonSessionClient` は `events()` の呼び出し間で `lastSeenEventId` を保持します。再接続時は最後に確認した位置からリプレイされます。
- `DaemonAuthFlow` は遅延評価です — `client.auth` が初回アクセス時に構築します。
- SSE イテレーターは（a）デーモンがストリームを終了した場合、（b）`AbortSignal.abort()` が発火した場合、（c）コンシューマーが `for await` からブレークアウトした場合、または（d）バッファオーバーフロー上限（16 MiB）に達した場合に閉じられます。

## 依存関係

- `globalThis.fetch`（Node 18+ 組み込み、ブラウザ、undici など）。テスト用に `DaemonClient` ごとにインジェクション可能。
- ネイティブ `AbortController` / `AbortSignal.any` / `setTimeout`。
- `@qwen-code/qwen-code-core` や `@qwen-code/acp-bridge` への推移的な依存関係なし — SDK パッケージは完全に分離されており、外部コンシューマーがデーモンの内部実装を引き込みません。

## `ui/*` サブパッケージ（[#4328](https://github.com/QwenLM/qwen-code/pull/4328) + [#4353](https://github.com/QwenLM/qwen-code/pull/4353)）

SDK は `packages/sdk-typescript/src/daemon/ui/` もエクスポートします。これはデーモンイベントをトランスクリプトブロックに変換するホスト中立なプリミティブのセットです：

- `normalizeDaemonEvent(evt)` は 43 の既知のデーモンワイヤーイベントを 37 の UI フレンドリーな `DaemonUiEventType` 値にマッピングします。モデル化されていないまたは不正なイベントは `debug` に正規化されます。
- `createDaemonTranscriptState()` と `reduceDaemonTranscriptEvents(state, events)` は UI イベントを `DaemonTranscriptBlock[]` に投影します。
- `createDaemonTranscriptStore()` はサブスクライブ / ディスパッチをラップします。
- `render.ts` / `terminal.ts` は HTML およびターミナルのベースラインレンダラーを提供し、`toolPreview.ts` はツールコールのサマリーを生成します。
- セレクターには `selectTranscriptBlocksOrderedByEventId`、`selectPendingPermissionBlocks`、`selectCurrentTool`、`selectApprovalMode`、`selectToolProgress`、`selectSubagentChildBlocks`、`formatMissedRange`、`formatBlockTimestamp` が含まれます。
- パブリック定数には `DAEMON_PLAN_TOOL_CALL_ID` が含まれます。
- `conformance.ts` はクロスホスト整合性テストスイートを含みます。

最初のプロダクションコンシューマーは React の `DaemonSessionProvider` を通じた
`packages/webui/src/daemon/` です。詳細なアーキテクチャ、用語集、セレクター一覧、
レガシー `DaemonTuiAdapter` との関係については [`14-cli-tui-adapter.md`](./14-cli-tui-adapter.md)
を参照してください。

このサブパッケージは `@qwen-code/sdk/daemon` サブパスからエクスポートされます。
既存の `import { DaemonClient }` を使用しているコードには影響しません。

## 設定

| 設定項目               | 場所                                | 効果                                                                                  |
| ------------------ | ------------------------------------ | --------------------------------------------------------------------------------------- |
| `baseUrl`          | `DaemonClient` コンストラクター           | デーモンの URL。末尾のスラッシュは除去されます。                                                  |
| `token`            | `DaemonClient` コンストラクター           | `Authorization: Bearer` として付与されます。                                                     |
| `fetch`            | `DaemonClient` コンストラクター           | テスト用のインジェクションポイント。                                                                   |
| `fetchTimeoutMs`   | `DaemonClient` コンストラクター           | コール単位のタイムアウト。`0` = 無効。                                                       |
| `clientId`         | メソッドごとのオプション引数              | `X-Qwen-Client-Id` ヘッダー（[`08-session-lifecycle.md`](./08-session-lifecycle.md) 参照）。 |
| `lastEventId`      | `DaemonSessionClient` コンストラクター    | リプレイカーソルの初期値。                                                                     |
| `maxQueued`        | サブスクライブごとのオプション                 | SSE ルートの `?maxQueued=N`。事前に `caps.features.slow_client_warning` を確認してください。 |
| `perCallTimeoutMs` | メソッドごと（例：`restartMcpServer`） | クライアント全体のタイムアウトを上書きします。                                                           |

## 注意事項と既知の制限

- **`fetchTimeoutMs` はコール単位であり、コネクションレベルではありません。** 長いボディの読み取りはタイマーを共有します。レスポンスをストリーミングするデーモンは、コール単位のタイムアウトを上書きするか、タイムアウトを `0` に設定する必要があります。
- **SSE はフェッチタイムアウトをバイパスします** — 長時間の SSE 接続は `fetchTimeoutMs` によって切断されません。呼び出し元によるキャンセルには `AbortSignal` を使用してください。
- **`parseSseStream` のバッファ上限は 16 MiB** で、防御的な制限です。この上限を超える単一フレームはイテレーターをアボートします（デーモンが正当にそのようなフレームを出力することはありません）。
- **`asKnownDaemonEvent` は未認識のイベントタイプに対して `undefined` を返します。** SDK コンシューマーは、ユニオンが網羅的であると仮定するのではなく、このブランチを処理する必要があります。これが前方互換性のコントラクトです。未認識のイベントは `DaemonSessionViewState.unrecognizedKnownEventCount` をインクリメントします。
- **`client_evicted`、`slow_client_warning`、`stream_error` はリプレイリングにありません。** 退去後に再接続するとデーモンのリングから再開しますが、退去フレームは再び表示されません。
- **`DaemonClient` は自動リトライを行いません。** ネットワーク障害は拒否として表面化します。再接続 / リプレイの戦略は呼び出し元の責務です（`DaemonSessionClient.events()` はリプレイを簡単にしますが、再接続はコール単位です）。

## リファレンス

- `packages/sdk-typescript/src/daemon/DaemonClient.ts`
- `packages/sdk-typescript/src/daemon/DaemonSessionClient.ts`
- `packages/sdk-typescript/src/daemon/DaemonAuthFlow.ts`
- `packages/sdk-typescript/src/daemon/sse.ts`
- `packages/sdk-typescript/src/daemon/events.ts`
- `packages/sdk-typescript/src/daemon/types.ts`
- エンドツーエンドのウォークスルー：[`../examples/daemon-client-quickstart.md`](../examples/daemon-client-quickstart.md)。
