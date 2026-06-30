# Daemon 開発者ドキュメント

これは **qwen-code daemon mode** の開発者向け技術ドキュメントです。`qwen serve` HTTP daemon、`@qwen-code/acp-bridge` パッケージ、ワークスペーススコープの MCP transport pool、マルチクライアント権限調停、型付き daemon event schema v1、TypeScript SDK daemon client、そして daemon に接続するアダプターについて説明します。

本ドキュメントは、以下の既存ドキュメントを置き換えるものではなく、補完するものです。

| 既存ドキュメント                                                                         | 対象読者              | 一次情報源                                      |
| ------------------------------------------------------------------------------------ | --------------------- | -------------------------------------------------------- |
| [`../../users/qwen-serve.md`](../../users/qwen-serve.md)                             | オペレーター             | ユーザー向けクイックスタート、フラグ、脅威モデル                     |
| [`../qwen-serve-protocol.md`](../qwen-serve-protocol.md)                             | プロトコル実装者 | HTTP ルートカタログ、リクエスト/レスポンスの形状、エラーコード |
| [`../examples/daemon-client-quickstart.md`](../examples/daemon-client-quickstart.md) | SDK ユーザー             | エンドツーエンドの TypeScript 解説                        |
| [`../daemon-client-adapters/`](../daemon-client-adapters/)                           | アダプター作成者       | レガシークライアントアダプターの設計ドキュメント                        |
| [`14-cli-tui-adapter.md`](./14-cli-tui-adapter.md)                                   | アダプター作成者       | クライアントアダプターの設計メモ                              |
| [`../../design/f2-mcp-transport-pool.md`](../../design/f2-mcp-transport-pool.md)     | F2 メンテナー        | ワークスペース MCP transport pool 設計 v2.2                 |

**daemon を起動して使用したい**場合は、まず `qwen-serve.md` をお読みください。**ワイヤーフォーマットに対してクライアントを構築したい**場合は、`qwen-serve-protocol.md` をお読みください。**daemon の内部を理解、拡張、またはデバッグしたい**場合は、このドキュメントセットをお読みください。

## 読む順序

目標に合ったパスを選んでください。

- **まず daemon を起動して確認する**: `20 -> 17 -> 19`。
- **新しいコントリビューター**: `01 -> 02 -> 03 -> 08 -> 09 -> 10 -> 11 -> 12`。
- **新しいクライアントアダプターを追加する**: `01 -> 09 -> 10 -> 13 -> (14 / 15 / 16)`。
- **MCP pool または budget に取り組む**: `01 -> 03 -> 05 -> 06`。
- **権限 (permissions) に取り組む**: `01 -> 03 -> 04 -> 12`。
- **本番環境の daemon をデバッグする**: `19 -> 18 -> 17 -> 20`。

## ドキュメントセット

### 基盤

- [`01-architecture.md`](./01-architecture.md) - システムアーキテクチャ、プロセストポロジー、パッケージマップ、および7つのトップレベルシーケンス図。

### サーバーコア

- [`02-serve-runtime.md`](./02-serve-runtime.md) - `runQwenServe` ブートストラップ、Express アプリ、ミドルウェアチェーン、グレースフルシャットダウン。
- [`03-acp-bridge.md`](./03-acp-bridge.md) - `@qwen-code/acp-bridge` パッケージの内部構造、セッション多重化、チャネルファクトリ、ACP チャイルドの生成。
- [`04-permission-mediation.md`](./04-permission-mediation.md) - `MultiClientPermissionMediator`、4つのポリシー、N1 タイムアウト不変条件、キャンセルセンチネル。
- [`05-mcp-transport-pool.md`](./05-mcp-transport-pool.md) - `McpTransportPool` (F2)、プールエントリ、リバースインデックス、再起動、ドレイン。
- [`06-mcp-budget-guardrails.md`](./06-mcp-budget-guardrails.md) - `WorkspaceMcpBudget`、モード (`off`/`warn`/`enforce`)、ヒステリシス、拒否バッチの統合。
- [`07-workspace-filesystem.md`](./07-workspace-filesystem.md) - `WorkspaceFileSystem` サンドボックス、パスポリシー、監査、`BridgeFileSystem` 契約。
- [`08-session-lifecycle.md`](./08-session-lifecycle.md) - 作成 / アタッチ / ロード / 再開、`X-Qwen-Client-Id`、ハートビート、エビクション、メタデータ。
- [`09-event-schema.md`](./09-event-schema.md) - 型付き event schema v1: ペイロード、リデューサー、前方互換性を持つ既知の47種類のイベントタイプ。
- [`10-event-bus.md`](./10-event-bus.md) - `EventBus`、単調増加 ID、リングリプレイ、`Last-Event-ID`、低速クライアントのバックプレッシャー、`client_evicted`。
- [`11-capabilities-versioning.md`](./11-capabilities-versioning.md) - ケイパビリティレジストリ、プロトコルバージョン、スキーマバージョン、条件付きアドバタイズメント。
- [`12-auth-security.md`](./12-auth-security.md) - Bearer ミドルウェア、ホスト許可リスト、CORS 拒否、ミューテーションゲート、`--require-auth`、`/health` 除外、デバイスフロー。

### クライアント

- [`13-sdk-daemon-client.md`](./13-sdk-daemon-client.md) - TypeScript SDK: `DaemonClient`、`DaemonSessionClient`、`DaemonAuthFlow`、SSE パーサー、イベントリデューサー、`ui/*` トランスクリプトレイヤー。
- [`14-cli-tui-adapter.md`](./14-cli-tui-adapter.md) - 共有 UI トランスクリプトレイヤーとレガシー CLI TUI daemon アダプターの関係。
- [`15-channel-adapters.md`](./15-channel-adapters.md) - `DaemonChannelBridge` 共有ベースと、DingTalk、WeChat (Weixin)、Telegram、Feishu のチャネル別アダプター。
- [`16-vscode-ide-adapter.md`](./16-vscode-ide-adapter.md) - `DaemonIdeConnection`、ループバックのみの強制、Webview ブリッジ。

### リファレンス付録

- [`17-configuration.md`](./17-configuration.md) - daemon に影響する環境変数、CLI フラグ、`settings.json` キー。
- [`18-error-taxonomy.md`](./18-error-taxonomy.md) - 各レイヤーの型付きエラーと修復手順。
- [`19-observability.md`](./19-observability.md) - `QWEN_SERVE_DEBUG`、デバッグレシピ、テレメトリのギャップ。
- [`20-quickstart-operations.md`](./20-quickstart-operations.md) - 最短の起動パス、curl チェック、ルートマップ、および組み込み呼び出しレシピ。

## 用語集

- **ACP** - Agent Client Protocol。daemon ブリッジと ACP チャイルドプロセスの間で stdio 経由で通信する JSON-RPC。クライアントが daemon に対して使用する HTTP プロトコルではありません。
- **ACP child** - daemon が実際のエージェントランタイムをホストするために生成するチャイルドプロセス (`qwen --acp`)。ブリッジは1つの ACP チャイルドを多数の接続されたクライアント間で多重化します。
- **acp-bridge** - `@qwen-code/acp-bridge` パッケージ (`packages/acp-bridge/`)。セッション多重化、権限調停、イベントバス、チャネルファクトリを所有します。
- **BridgeClient** - `packages/acp-bridge/src/bridgeClient.ts`。1つの ACP `ClientSideConnection` をラップし、`requestPermission`、`sendPrompt`、`cancelSession` を処理します。
- **Channel factory** - ACP チャイルドの生成またはアタッチのためのプラグ可能な戦略。デフォルトの `spawnChannel` は `qwen --acp` をサブプロセスとして実行し、`inMemoryChannel` はテスト用にプロセス内で実行します。
- **DaemonClient** - `packages/sdk-typescript/src/daemon/DaemonClient.ts`。daemon 上の TypeScript SDK HTTP レベルのファサード。
- **DaemonSessionClient** - `packages/sdk-typescript/src/daemon/DaemonSessionClient.ts`。SSE リプレイのために `lastSeenEventId` を追跡するセッションスコープのラッパー。
- **EventBus** - `packages/acp-bridge/src/eventBus.ts`。単調増加 ID、有界リング、およびサブスクライバーごとのバックプレッシャーを備えたセッションごとのインメモリ Pub/Sub。
- **F1 / F2 / F3 / F4** - [#4175](https://github.com/QwenLM/qwen-code/issues/4175) で追跡されている内部マイルストーン。F1: ブリッジの抽出と `BridgeFileSystem`。F2: ワークスペーススコープの MCP transport pool。F3: マルチクライアント権限調停。F4: プロトコルの完成と daemon クライアントのインターフェース。
- **MCP** - Model Context Protocol。サーバーはツール、リソース、プロンプトを公開し、daemon ACP チャイルドがそれらに接続します。
- **McpTransportPool** - `packages/core/src/tools/mcp-transport-pool.ts`。F2 ワークスペーススコープのプールで、サーバー名と設定フィンガープリントごとに1つの MCP transport を共有します。
- **Mediator policy** - `first-responder`、`designated`、`consensus`、または `local-only` のいずれか。マルチクライアントの権限投票がどのように解決されるかを決定します。
- **Originator client id** - 現在権限を要求しているプロンプトを開始したクライアントの `X-Qwen-Client-Id`。`designated` ポリシーは、この ID からの投票のみを受け入れます。
- **PoolEntry** - `packages/core/src/tools/mcp-pool-entry.ts`。`McpTransportPool` 内の1つのエントリ: 1つの MCP transport、アタッチされたセッションの参照カウント、およびアイドルドレインタイマー。
- **Session scope** - `single` (すべてのクライアントで共有される1つの ACP セッション) または `thread` (会話スレッドごとに1つのセッション)。デフォルトは `single` です。
- **SSE** - Server-Sent Events。daemon の送信イベントチャネル (`GET /session/:id/events`)。
- **Workspace** - 起動時に daemon がバインドされたディレクトリ (`--workspace` または `cwd`)。1つの daemon プロセスは1つのワークスペースに相当します。

## 実装ソースアンカー

ドキュメントから最新の `main` コードに移行する際に、これらのアンカーを使用してください。

| サーフェス                             | 実装アンカー                                                                                                                                                                                                                                               | 主要ドキュメント                                                                                                           |
| ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| ブートストラップと HTTP アセンブリ         | `packages/cli/src/serve/run-qwen-serve.ts`, `packages/cli/src/serve/server.ts`, `packages/cli/src/serve/routes/health-demo.ts`, `/demo`                                                                                                                              | [`02`](./02-serve-runtime.md), [`20`](./20-quickstart-operations.md)                                                   |
| ACP ブリッジとセッション多重化 | `packages/acp-bridge/src/bridge.ts`, `packages/acp-bridge/src/bridgeTypes.ts`, `@qwen-code/acp-bridge`                                                                                                                                                               | [`03`](./03-acp-bridge.md), [`08`](./08-session-lifecycle.md)                                                          |
| 権限調停                | `packages/acp-bridge/src/permissionMediator.ts`, `fromLoopback: boolean`, `policy.*`                                                                                                                                                                                 | [`04`](./04-permission-mediation.md), [`12`](./12-auth-security.md)                                                    |
| MCP transport pool                  | `packages/core/src/tools/mcp-transport-pool.ts`, `mcp-pool-key.ts`, `pid-descendants.ts`, `session-mcp-view.ts`, `/mcp refresh`, `MCPCallInterruptedError`                                                                                                           | [`05`](./05-mcp-transport-pool.md), [`06`](./06-mcp-budget-guardrails.md)                                              |
| MCP budget ガードレール               | `packages/core/src/tools/mcp-workspace-budget.ts`, `ServeMcpBudgetStatusCell.scope`, `budgets[]`                                                                                                                                                                     | [`06`](./06-mcp-budget-guardrails.md)                                                                                  |
| ワークスペースファイルシステム                | `packages/cli/src/serve/fs/`, `assertTrustedForIntent(trusted, intent)`, `meta.matchedIgnore`, `includeIgnored`                                                                                                                                                      | [`07`](./07-workspace-filesystem.md)                                                                                   |
| イベントスキーマと SSE ライター         | `packages/sdk-typescript/src/daemon/events.ts`, `packages/cli/src/serve/routes/sse-events.ts`, `formatSseFrame`, `packages/cli/src/acp-integration/session/emitters/ToolCallEmitter.ts`, `ToolCallEmitter.resolveToolProvenance`, `tool_call.provenance`, `serverId` | [`09`](./09-event-schema.md), [`10`](./10-event-bus.md)                                                                |
| イベントの再同期                        | `state_resync_required`, `awaitingResync`, `RESYNC_PASSTHROUGH_TYPES`, `asKnownDaemonEvent`, `unrecognizedKnownEventCount`                                                                                                                                           | [`09`](./09-event-schema.md), [`10`](./10-event-bus.md)                                                                |
| ケイパビリティ                        | `packages/cli/src/serve/capabilities.ts`, `mcp_server_restart_refused.reason`, `MCP_RESTART_REFUSED_REASONS.has`                                                                                                                                                     | [`11`](./11-capabilities-versioning.md)                                                                                |
| 認証とデバイスフロー                | `packages/cli/src/serve/auth.ts`, `packages/cli/src/serve/auth/device-flow.ts`                                                                                                                                                                                       | [`12`](./12-auth-security.md)                                                                                          |
| TypeScript SDK daemon クライアント        | `packages/sdk-typescript/src/daemon/{DaemonClient,DaemonSessionClient,DaemonAuthFlow,sse,events,types}.ts`, `MCP_RESTART_DEFAULT_TIMEOUT_MS`                                                                                                                         | [`13`](./13-sdk-daemon-client.md)                                                                                      |
| 共有 UI トランスクリプトレイヤー          | `DaemonUiEventType`, `DaemonSessionProvider`, `packages/webui/src/daemon/`                                                                                                                                                                                           | [`13`](./13-sdk-daemon-client.md), [`14`](./14-cli-tui-adapter.md), [`../daemon-ui/README.md`](../daemon-ui/README.md) |
| チャネルと IDE アダプター           | `packages/channels/`, `packages/vscode-ide-companion/src/services/daemonIdeConnection.ts`                                                                                                                                                                            | [`15`](./15-channel-adapters.md), [`16`](./16-vscode-ide-adapter.md)                                                   |

## 意図的にスコープ外となっているもの

- **Java / Python SDK daemon クライアント** - 現在、daemon クライアントを出荷しているのは TypeScript SDK のみです。ドキュメント 13 は TypeScript のみ対象です。
- **Web UI 製品の詳細** - 共有トランスクリプトレイヤーと Web UI daemon のエントリーポイントはここで説明されていますが、製品 UI のレイアウトは `docs/developers/daemon-ui/` とアダプター設計メモで追跡されています。
- **Zed 拡張機能 (`packages/zed-extension/`)** - stdio 経由で直接 `qwen --acp` を起動し、daemon をバイパスします。
- **実験的なプロセス内ホスティング** - `--no-http-bridge` は現在でも http-bridge にフォールバックします。安定したプロセス内 serve モードは、実装された際に新しいドキュメントが必要になります。

## 現在の daemon mode のカバレッジ

### サーバーコアのカバレッジ

| 領域                      | 現在の状態                                                                                                                                                                    | 主要ドキュメント                                                              |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| ブートストラップ / リッスンパス   | `qwen serve` は `runQwenServe` を遅延ロードし、認証/ワークスペース/予算/設定を検証し、Express アプリを構築してから、`app.listen` を呼び出し、シグナルがあるまで永久にブロックします。                | [`02`](./02-serve-runtime.md), [`20`](./20-quickstart-operations.md)      |
| 認証 / ネットワークガードレール | ループバックはデフォルトで Bearer なしです。ループバック以外では Bearer が必要です。`--require-auth` は Bearer をループバックと `/health` に拡張します。ホスト許可リストとデフォルトの CORS 拒否が有効です。        | [`12`](./12-auth-security.md), [`17`](./17-configuration.md)              |
| セッションライフサイクル         | `POST /session`、`load`、`resume`、メタデータパッチ、ハートビート、エビクション、アイドルリーピング、プロンプトの保留制限、およびグレースフルクローズについてドキュメント化されています。                                  | [`08`](./08-session-lifecycle.md), [`10`](./10-event-bus.md)              |
| ACP ブリッジ                | デフォルトで単一の ACP チャイルドが多重化されます。`sessionScope` は `single` と `thread` をサポートします。`BridgeFileSystem`、コンテキストファイル名、環境変数のオーバーライド、およびチャネルのアイドルタイムアウトが配線されています。 | [`03`](./03-acp-bridge.md), [`07`](./07-workspace-filesystem.md)          |
| MCP pool / budget         | `QWEN_SERVE_NO_MCP_POOL=1` でない限り、ワークスペース MCP pool はデフォルトでオンです。ガードレールイベントと再起動セマンティクスについてドキュメント化されています。                                                    | [`05`](./05-mcp-transport-pool.md), [`06`](./06-mcp-budget-guardrails.md) |
| 権限               | F3 調停者は `first-responder`、`designated`、`consensus`、および `local-only` をサポートします。無効な設定は明示的に失敗します。                                                           | [`04`](./04-permission-mediation.md), [`12`](./12-auth-security.md)       |

### ワイヤープロトコル

| 領域          | 現在の状態                                                                                                                                                                                           | 主要ドキュメント                                                                                                  |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| HTTP ルート   | ルートカタログは `qwen-serve-protocol.md` にあります。この daemon セットはそれを参照し、実装の所有権を説明するのみです。                                                                          | [`../qwen-serve-protocol.md`](../qwen-serve-protocol.md), [`20`](./20-quickstart-operations.md)               |
| イベントスキーマ  | `EVENT_SCHEMA_VERSION = 1`。既知の47種類のイベントタイプ。ID なしサブスクライバーの合成フレーム。`_meta.serverTimestamp` は `EventBus.publish()` によってタイムスタンプが押されます (合成フレームの場合は `formatSseFrame()` がフォールバックとして使用されます)。 | [`09`](./09-event-schema.md), [`10`](./10-event-bus.md)                                                       |
| ケイパビリティ  | `SERVE_PROTOCOL_VERSION = 'v1'`。75個の登録済みタグ。13個の条件付きタグ。                                                                                                                               | [`11`](./11-capabilities-versioning.md)                                                                       |
| セッションシェル | `POST /session/:id/shell` は `--enable-session-shell`、Bearer 認証、およびセッションにバインドされた `X-Qwen-Client-Id` の背後に存在します。ケイパビリティタグは条件付きです。                                                     | [`11`](./11-capabilities-versioning.md), [`17`](./17-configuration.md), [`20`](./20-quickstart-operations.md) |
| レート制限 | オプションのティアごとの HTTP レート制限は、CLI フラグ/環境変数および条件付きケイパビリティタグによって公開されます。                                                                                                           | [`11`](./11-capabilities-versioning.md), [`17`](./17-configuration.md)                                        |
### クライアント / SDK

| 領域                         | 現在の状態                                                                                                                                                | 主要ドキュメント                                                                                                                                  |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| TypeScript SDK daemonクライアント | `DaemonClient`、`DaemonSessionClient`、`DaemonAuthFlow`、SSEパーサー、イベントリデューサー、機能プリフライト、およびUIトランスクリプトのエクスポートについてドキュメント化されています。 | [`13`](./13-sdk-daemon-client.md)                                                                                                             |
| 共有UIトランスクリプトレイヤー   | SDKの `daemon/ui/*` はdaemonイベントを42種類のUIセマンティックイベントタイプに正規化し、それらをトランスクリプトブロックにリデュースして、レンダラー/適合性ヘルパーを提供します。 | [`14`](./14-cli-tui-adapter.md), [`../daemon-ui/README.md`](../daemon-ui/README.md), [`../daemon-ui/MIGRATION.md`](../daemon-ui/MIGRATION.md) |
| Web UI daemonコンシューマー       | `packages/webui/src/daemon/` は、Reactプロバイダーとアダプターを介してSDKトランスクリプトストアを消費します。                                                         | [`14`](./14-cli-tui-adapter.md), [`../daemon-client-adapters/web-ui.md`](../daemon-client-adapters/web-ui.md)                                 |
| CLI TUI / チャネル / VS Code | レガシーパスはまだ存在します。共有トランスクリプトプリミティブへの移行は、完了した動作ではなく、フォローアップ作業としてドキュメント化されています。                                 | [`14`](./14-cli-tui-adapter.md), [`15`](./15-channel-adapters.md), [`16`](./16-vscode-ide-adapter.md)                                         |

### リファレンスと運用

| 領域                    | 現在の状態                                                                                                                                             | 主要ドキュメント                          |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------- |
| 設定           | `qwen serve` の全フラグ、環境変数、`settings.json`、`ServeOptions`、`BridgeOptions`、および重要な定数が1つのページにまとめられています。                   | [`17`](./17-configuration.md)         |
| クイックスタート / 運用 | 最短の起動パス、起動レシピ、curlチェック、デモページの認証動作、ルート分割、シャットダウン動作、および組み込み呼び出しレシピについて説明しています。 | [`20`](./20-quickstart-operations.md) |
| エラー                  | 起動時の明示的な失敗、ルートエラー、ブリッジエラー、EventBusエラー、ファイルシステムエラー、およびメディエーターエラーについて、対処法とともに要約されています。        | [`18`](./18-error-taxonomy.md)        |
| オブザーバビリティ           | `QWEN_SERVE_DEBUG`、curlレシピ、有用なイベント、テレメトリのギャップ、および調査チェックリストについてドキュメント化されています。                                             | [`19`](./19-observability.md)         |

### 歴史的または非推奨のサーフェス

| サーフェス                                            | ステータス                                                                                                         |
| -------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `docs/developers/daemon-client-adapters/tui.md`    | 古い `DaemonTuiAdapter` スパイクの歴史的なドラフトです。現在の共有UIトランスクリプトアーキテクチャはドキュメント14にあります。 |
| `packages/cli/src/ui/daemon/daemon-tui-adapter.ts` | レガシーな実験的アダプターがまだツリー内に残っています。新しい共有UIの作業では、SDKの `daemon/ui/*` を優先すべきです。                 |
| `--no-http-bridge`                                 | 互換性のために受け入れられますが、http-bridge にフォールバックし、stderr に出力します。                                    |

### 前方互換性

- イベントスキーマv1は追加型です。新しい既知のイベントタイプは `DAEMON_KNOWN_EVENT_TYPE_VALUES` に追加する必要があり、古いSDKは未知のタイプを前方互換として扱う必要があります。
- ケイパビリティタグは動作のコントラクトです。新しい動作には新しいタグが必要であり、特にクライアントがルートを呼び出す前にプリフライトを行う可能性がある場合はそうです。
- `sessionScope: 'thread'` は現在の会話スレッドごとの分割です。古いクライアントスコープの用語を再導入しないようにしてください。
- エンベロープの `_meta` とACPペイロードの `data._meta` は異なります。ツール呼び出しの来歴はACPペイロード下に存在し、サーバーの発行タイムスタンプはSSEエンベロープ上に存在します。

## バージョン来歴

このドキュメントセットは、[#4412](https://github.com/QwenLM/qwen-code/pull/4412) からのフォローアップ作業を含め、現在 `main` にマージされている daemon モードのサーフェスを反映しています。以前のFシリーズの計画スナップショットではなく、現在の動作を意図的に説明しています。