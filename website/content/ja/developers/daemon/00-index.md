# デーモン開発者ドキュメント

これは **qwen-code デーモンモード** の開発者向け技術ドキュメントです。対象は `qwen serve` HTTP デーモン、`@qwen-code/acp-bridge` パッケージ、ワークスペーススコープの MCP トランスポートプール、マルチクライアントパーミッション調停、型付きデーモンイベントスキーマ v1、TypeScript SDK デーモンクライアント、およびデーモンに接続するアダプター群です。

このドキュメントは既存のドキュメントを補完するものであり、置き換えるものではありません:

| 既存ドキュメント                                                                         | 対象読者              | 情報源として扱う内容                                      |
| ------------------------------------------------------------------------------------ | --------------------- | -------------------------------------------------------- |
| [`../../users/qwen-serve.md`](../../users/qwen-serve.md)                             | 運用者                | ユーザークイックスタート、フラグ、脅威モデル              |
| [`../qwen-serve-protocol.md`](../qwen-serve-protocol.md)                             | プロトコル実装者      | HTTP ルートカタログ、リクエスト/レスポンス形式、エラーコード |
| [`../examples/daemon-client-quickstart.md`](../examples/daemon-client-quickstart.md) | SDK 利用者            | TypeScript エンドツーエンドウォークスルー                 |
| [`../daemon-client-adapters/`](../daemon-client-adapters/)                           | アダプター作成者      | レガシークライアントアダプターの設計ドキュメント          |
| [`14-cli-tui-adapter.md`](./14-cli-tui-adapter.md)                                   | アダプター作成者      | クライアントアダプターの設計メモ                          |
| [`../../design/f2-mcp-transport-pool.md`](../../design/f2-mcp-transport-pool.md)     | F2 メンテナー         | ワークスペース MCP トランスポートプール設計 v2.2          |

**デーモンを起動して使いたい**場合は、まず `qwen-serve.md` を読んでください。**ワイヤーフォーマットに対してクライアントを構築したい**場合は、`qwen-serve-protocol.md` を読んでください。**デーモン内部を理解・拡張・デバッグしたい**場合は、このドキュメントセットを読んでください。

## 読む順番

目的に合ったパスを選んでください:

- **まずデーモンを起動して動作確認する**: `20 -> 17 -> 19`.
- **新規コントリビューター**: `01 -> 02 -> 03 -> 08 -> 09 -> 10 -> 11 -> 12`.
- **新しいクライアントアダプターを追加する**: `01 -> 09 -> 10 -> 13 -> (14 / 15 / 16)`.
- **MCP プールまたはバジェットに取り組む**: `01 -> 03 -> 05 -> 06`.
- **パーミッションに取り組む**: `01 -> 03 -> 04 -> 12`.
- **本番デーモンをデバッグする**: `19 -> 18 -> 17 -> 20`.

## ドキュメント一覧

### 基礎

- [`01-architecture.md`](./01-architecture.md) - システムアーキテクチャ、プロセストポロジー、パッケージマップ、および7つのトップレベルシーケンス図。

### サーバーコア

- [`02-serve-runtime.md`](./02-serve-runtime.md) - `runQwenServe` ブートストラップ、Express アプリ、ミドルウェアチェーン、グレースフルシャットダウン。
- [`03-acp-bridge.md`](./03-acp-bridge.md) - `@qwen-code/acp-bridge` パッケージ内部、セッション多重化、チャネルファクトリー、ACP 子プロセス起動。
- [`04-permission-mediation.md`](./04-permission-mediation.md) - `MultiClientPermissionMediator`、4つのポリシー、N1 タイムアウト不変条件、キャンセルセンチネル。
- [`05-mcp-transport-pool.md`](./05-mcp-transport-pool.md) - `McpTransportPool` (F2)、プールエントリー、逆引きインデックス、再起動、ドレイン。
- [`06-mcp-budget-guardrails.md`](./06-mcp-budget-guardrails.md) - `WorkspaceMcpBudget`、モード (`off`/`warn`/`enforce`)、ヒステリシス、拒否バッチの集約。
- [`07-workspace-filesystem.md`](./07-workspace-filesystem.md) - `WorkspaceFileSystem` サンドボックス、パスポリシー、監査、`BridgeFileSystem` コントラクト。
- [`08-session-lifecycle.md`](./08-session-lifecycle.md) - 作成 / アタッチ / ロード / レジューム、`X-Qwen-Client-Id`、ハートビート、退避、メタデータ。
- [`09-event-schema.md`](./09-event-schema.md) - 型付きイベントスキーマ v1: ペイロード、リデューサー、前方互換性を含む43種類の既知イベントタイプ。
- [`10-event-bus.md`](./10-event-bus.md) - `EventBus`、モノトニック ID、リングリプレイ、`Last-Event-ID`、スロークライアントバックプレッシャー、`client_evicted`。
- [`11-capabilities-versioning.md`](./11-capabilities-versioning.md) - ケイパビリティレジストリ、プロトコルバージョン、スキーマバージョン、条件付きアドバタイズ。
- [`12-auth-security.md`](./12-auth-security.md) - ベアラーミドルウェア、ホスト許可リスト、CORS 拒否、ミューテーションゲート、`--require-auth`、`/health` 除外、デバイスフロー。

### クライアント

- [`13-sdk-daemon-client.md`](./13-sdk-daemon-client.md) - TypeScript SDK: `DaemonClient`、`DaemonSessionClient`、`DaemonAuthFlow`、SSE パーサー、イベントリデューサー、`ui/*` トランスクリプトレイヤー。
- [`14-cli-tui-adapter.md`](./14-cli-tui-adapter.md) - 共有 UI トランスクリプトレイヤーとレガシー CLI TUI デーモンアダプターの関係。
- [`15-channel-adapters.md`](./15-channel-adapters.md) - `DaemonChannelBridge` 共有ベース、および DingTalk、WeChat (Weixin)、Telegram、Feishu の各チャネルアダプター。
- [`16-vscode-ide-adapter.md`](./16-vscode-ide-adapter.md) - `DaemonIdeConnection`、ループバック専用の強制、ウェブビューブリッジング。

### リファレンス付録

- [`17-configuration.md`](./17-configuration.md) - デーモンに影響する環境変数、CLI フラグ、`settings.json` キー。
- [`18-error-taxonomy.md`](./18-error-taxonomy.md) - レイヤーごとの型付きエラーと対処法。
- [`19-observability.md`](./19-observability.md) - `QWEN_SERVE_DEBUG`、デバッグレシピ、テレメトリのギャップ。
- [`20-quickstart-operations.md`](./20-quickstart-operations.md) - 最短起動パス、curl チェック、ルートマップ、組み込み呼び出しレシピ。

## 用語集

- **ACP** - Agent Client Protocol。デーモンブリッジと ACP 子プロセス間で使用される stdio 上の JSON-RPC。クライアントがデーモンに対して使用する HTTP プロトコルとは異なります。
- **ACP child** - デーモンが起動する子プロセス (`qwen --acp`)。実際のエージェントランタイムをホストします。ブリッジは1つの ACP 子プロセスを多くの接続クライアントに多重化します。
- **acp-bridge** - `@qwen-code/acp-bridge` パッケージ (`packages/acp-bridge/`)。セッション多重化、パーミッションメディエーター、イベントバス、チャネルファクトリーを管理します。
- **BridgeClient** - `packages/acp-bridge/src/bridgeClient.ts`。1つの ACP `ClientSideConnection` をラップし、`requestPermission`、`sendPrompt`、`cancelSession` を処理します。
- **Channel factory** - ACP 子プロセスを起動またはアタッチするためのプラガブル戦略。デフォルトの `spawnChannel` は `qwen --acp` をサブプロセスとして実行し、`inMemoryChannel` はテスト用にインプロセスで実行します。
- **DaemonClient** - `packages/sdk-typescript/src/daemon/DaemonClient.ts`。デーモンに対する TypeScript SDK HTTP レベルのファサード。
- **DaemonSessionClient** - `packages/sdk-typescript/src/daemon/DaemonSessionClient.ts`。SSE リプレイのために `lastSeenEventId` を追跡するセッションスコープのラッパー。
- **EventBus** - `packages/acp-bridge/src/eventBus.ts`。モノトニック ID、有界リング、サブスクライバーごとのバックプレッシャーを持つセッションごとのインメモリ pub/sub。
- **F1 / F2 / F3 / F4** - [#4175](https://github.com/QwenLM/qwen-code/issues/4175) で追跡される内部マイルストーン。F1: ブリッジ抽出と `BridgeFileSystem`。F2: ワークスペーススコープの MCP トランスポートプール。F3: マルチクライアントパーミッション調停。F4: プロトコル完成とデーモンクライアントサーフェス。
- **MCP** - Model Context Protocol。サーバーがツール、リソース、プロンプトを公開し、デーモン ACP 子プロセスがそれらに接続します。
- **McpTransportPool** - `packages/core/src/tools/mcp-transport-pool.ts`。F2 ワークスペーススコープのプール。サーバー名と設定フィンガープリントごとに1つの MCP トランスポートを共有します。
- **Mediator policy** - `first-responder`、`designated`、`consensus`、`local-only` のいずれか。マルチクライアントのパーミッション投票の解決方法を決定します。
- **Originator client id** - 現在パーミッションを要求しているプロンプトを開始したクライアントの `X-Qwen-Client-Id`。`designated` ポリシーはこの id からの投票のみを受け付けます。
- **PoolEntry** - `packages/core/src/tools/mcp-pool-entry.ts`。`McpTransportPool` の1エントリー: 1つの MCP トランスポート、アタッチされたセッションの参照カウント、アイドルドレインタイマー。
- **Session scope** - `single`（すべてのクライアントで共有される1つの ACP セッション）または `thread`（会話スレッドごとに1つのセッション）。デフォルトは `single`。
- **SSE** - Server-Sent Events。デーモンのアウトバウンドイベントチャネル (`GET /session/:id/events`)。
- **Workspace** - 起動時にデーモンがバインドされたディレクトリ (`--workspace` または `cwd`)。1つのデーモンプロセスは1つのワークスペースに対応します。

## 実装ソースアンカー

ドキュメントから最新の `main` コードに移動する際はこれらのアンカーを使用してください:

| サーフェス                              | 実装アンカー                                                                                                                                                                                                                                              | 主要ドキュメント                                                                                                           |
| ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| ブートストラップと HTTP アセンブリ      | `packages/cli/src/serve/run-qwen-serve.ts`, `server.ts`, `/demo`                                                                                                                                                                                          | [`02`](./02-serve-runtime.md), [`20`](./20-quickstart-operations.md)                                                   |
| ACP ブリッジとセッション多重化          | `packages/acp-bridge/src/bridge.ts`, `packages/acp-bridge/src/bridgeTypes.ts`, `@qwen-code/acp-bridge`                                                                                                                                                    | [`03`](./03-acp-bridge.md), [`08`](./08-session-lifecycle.md)                                                          |
| パーミッション調停                      | `packages/acp-bridge/src/permissionMediator.ts`, `fromLoopback: boolean`, `policy.*`                                                                                                                                                                      | [`04`](./04-permission-mediation.md), [`12`](./12-auth-security.md)                                                    |
| MCP トランスポートプール               | `packages/core/src/tools/mcp-transport-pool.ts`, `mcp-pool-key.ts`, `pid-descendants.ts`, `session-mcp-view.ts`, `/mcp refresh`, `MCPCallInterruptedError`                                                                                                | [`05`](./05-mcp-transport-pool.md), [`06`](./06-mcp-budget-guardrails.md)                                              |
| MCP バジェットガードレール             | `packages/core/src/tools/mcp-workspace-budget.ts`, `ServeMcpBudgetStatusCell.scope`, `budgets[]`                                                                                                                                                          | [`06`](./06-mcp-budget-guardrails.md)                                                                                  |
| ワークスペースファイルシステム          | `packages/cli/src/serve/fs/`, `assertTrustedForIntent(trusted, intent)`, `meta.matchedIgnore`, `includeIgnored`                                                                                                                                           | [`07`](./07-workspace-filesystem.md)                                                                                   |
| イベントスキーマと SSE ライター        | `packages/sdk-typescript/src/daemon/events.ts`, `packages/cli/src/serve/server.ts`, `formatSseFrame`, `packages/cli/src/acp-integration/session/emitters/ToolCallEmitter.ts`, `ToolCallEmitter.resolveToolProvenance`, `tool_call.provenance`, `serverId` | [`09`](./09-event-schema.md), [`10`](./10-event-bus.md)                                                                |
| イベント再同期                          | `state_resync_required`, `awaitingResync`, `RESYNC_PASSTHROUGH_TYPES`, `asKnownDaemonEvent`, `unrecognizedKnownEventCount`                                                                                                                                | [`09`](./09-event-schema.md), [`10`](./10-event-bus.md)                                                                |
| ケイパビリティ                          | `packages/cli/src/serve/capabilities.ts`, `mcp_server_restart_refused.reason`, `MCP_RESTART_REFUSED_REASONS.has`                                                                                                                                          | [`11`](./11-capabilities-versioning.md)                                                                                |
| 認証とデバイスフロー                    | `packages/cli/src/serve/auth.ts`, `packages/cli/src/serve/auth/device-flow.ts`                                                                                                                                                                            | [`12`](./12-auth-security.md)                                                                                          |
| TypeScript SDK デーモンクライアント    | `packages/sdk-typescript/src/daemon/{DaemonClient,DaemonSessionClient,DaemonAuthFlow,sse,events,types}.ts`, `MCP_RESTART_DEFAULT_TIMEOUT_MS`                                                                                                              | [`13`](./13-sdk-daemon-client.md)                                                                                      |
| 共有 UI トランスクリプトレイヤー        | `DaemonUiEventType`, `DaemonSessionProvider`, `packages/webui/src/daemon/`                                                                                                                                                                                | [`13`](./13-sdk-daemon-client.md), [`14`](./14-cli-tui-adapter.md), [`../daemon-ui/README.md`](../daemon-ui/README.md) |
| チャネルと IDE アダプター              | `packages/channels/`, `packages/vscode-ide-companion/src/services/daemonIdeConnection.ts`                                                                                                                                                                 | [`15`](./15-channel-adapters.md), [`16`](./16-vscode-ide-adapter.md)                                                   |

## 意図的なスコープ外

- **Java / Python SDK デーモンクライアント** - 現時点でデーモンクライアントを提供しているのは TypeScript SDK のみです。ドキュメント 13 は TypeScript 専用です。
- **Web UI 製品の詳細** - 共有トランスクリプトレイヤーと Web UI デーモンエントリーポイントはここでカバーされていますが、製品 UI レイアウトは `docs/developers/daemon-ui/` とアダプター設計メモで管理されています。
- **Zed 拡張機能 (`packages/zed-extension/`)** - stdio 経由で `qwen --acp` を直接起動し、デーモンをバイパスします。
- **試験的なインプロセスホスティング** - `--no-http-bridge` は現在も http-bridge にフォールバックします。安定したインプロセスサービングモードが実装された際には新しいドキュメントが必要です。

## 現在のデーモンモードのカバレッジ

### サーバーコアのカバレッジ

| 領域                      | 現在の状態                                                                                                                                                                    | 主要ドキュメント                                                              |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| ブートストラップ / リッスンパス | `qwen serve` は `runQwenServe` を遅延ロードし、auth/workspace/budget/settings を検証し、Express アプリを構築してから `app.listen` を呼び出してシグナルが来るまでブロックします。 | [`02`](./02-serve-runtime.md), [`20`](./20-quickstart-operations.md)      |
| 認証 / ネットワークガードレール | ループバックはデフォルトでベアラー不要。非ループバックはベアラーが必要。`--require-auth` はループバックと `/health` にもベアラーを要求します。ホスト許可リストとデフォルト CORS 拒否が有効です。 | [`12`](./12-auth-security.md), [`17`](./17-configuration.md)              |
| セッションライフサイクル     | `POST /session`、load、resume、メタデータパッチ、ハートビート、退避、アイドルリーピング、プロンプト保留制限、グレースフルクローズがドキュメント化されています。                   | [`08`](./08-session-lifecycle.md), [`10`](./10-event-bus.md)              |
| ACP ブリッジ               | デフォルトでは1つの ACP 子プロセスを多重化します。`sessionScope` は `single` と `thread` をサポートします。`BridgeFileSystem`、コンテキストファイル名、環境変数オーバーライド、チャネルアイドルタイムアウトが組み込まれています。 | [`03`](./03-acp-bridge.md), [`07`](./07-workspace-filesystem.md)          |
| MCP プール / バジェット     | ワークスペース MCP プールは `QWEN_SERVE_NO_MCP_POOL=1` でない限りデフォルトで有効です。ガードレールイベントと再起動セマンティクスがドキュメント化されています。                      | [`05`](./05-mcp-transport-pool.md), [`06`](./06-mcp-budget-guardrails.md) |
| パーミッション               | F3 メディエーターは `first-responder`、`designated`、`consensus`、`local-only` をサポートします。無効な設定は明示的に失敗します。                                                 | [`04`](./04-permission-mediation.md), [`12`](./12-auth-security.md)       |

### ワイヤープロトコル

| 領域          | 現在の状態                                                                                                                                       | 主要ドキュメント                                                                                                  |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| HTTP ルート   | ルートカタログは `qwen-serve-protocol.md` にあります。このデーモンセットはそれを参照し、実装の所有権を説明するのみです。                               | [`../qwen-serve-protocol.md`](../qwen-serve-protocol.md), [`20`](./20-quickstart-operations.md)               |
| イベントスキーマ | `EVENT_SCHEMA_VERSION = 1`。43種類の既知イベントタイプ。ID なしサブスクライバーの合成フレーム。SSE 書き込み境界でスタンプされる `_meta.serverTimestamp`。 | [`09`](./09-event-schema.md), [`10`](./10-event-bus.md)                                                       |
| ケイパビリティ | `SERVE_PROTOCOL_VERSION = 'v1'`。67の登録済みタグ。10の条件付きタグ。                                                                               | [`11`](./11-capabilities-versioning.md)                                                                       |
| セッションシェル | `POST /session/:id/shell` は `--enable-session-shell`、ベアラー認証、セッションバインドの `X-Qwen-Client-Id` の後ろに存在します。ケイパビリティタグは条件付きです。 | [`11`](./11-capabilities-versioning.md), [`17`](./17-configuration.md), [`20`](./20-quickstart-operations.md) |
| レート制限     | オプションのティアごとの HTTP レート制限は CLI フラグ/環境変数と条件付きケイパビリティタグで公開されています。                                          | [`11`](./11-capabilities-versioning.md), [`17`](./17-configuration.md)                                        |

### クライアント / SDK

| 領域                         | 現在の状態                                                                                                                                                | 主要ドキュメント                                                                                                                                  |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------- |
| TypeScript SDK デーモンクライアント | `DaemonClient`、`DaemonSessionClient`、`DaemonAuthFlow`、SSE パーサー、イベントリデューサー、フィーチャープリフライト、UI トランスクリプトエクスポートがドキュメント化されています。 | [`13`](./13-sdk-daemon-client.md)                                                                                                             |
| 共有 UI トランスクリプトレイヤー | SDK `daemon/ui/*` はデーモンイベントを37種類の UI セマンティックイベントタイプに正規化し、トランスクリプトブロックに還元し、レンダラー/適合ヘルパーを提供します。 | [`14`](./14-cli-tui-adapter.md), [`../daemon-ui/README.md`](../daemon-ui/README.md), [`../daemon-ui/MIGRATION.md`](../daemon-ui/MIGRATION.md) |
| Web UI デーモンコンシューマー | `packages/webui/src/daemon/` は React プロバイダーとアダプターを通じて SDK トランスクリプトストアを利用します。                                              | [`14`](./14-cli-tui-adapter.md), [`../daemon-client-adapters/web-ui.md`](../daemon-client-adapters/web-ui.md)                                 |
| CLI TUI / チャネル / VS Code  | レガシーパスは引き続き存在します。共有トランスクリプトプリミティブへの移行はフォローアップ作業としてドキュメント化されており、完了した動作ではありません。          | [`14`](./14-cli-tui-adapter.md), [`15`](./15-channel-adapters.md), [`16`](./16-vscode-ide-adapter.md)                                         |

### リファレンスと運用

| 領域                    | 現在の状態                                                                                                                                             | 主要ドキュメント                          |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------- |
| 設定                    | `qwen serve` の全フラグ、環境変数、`settings.json`、`ServeOptions`、`BridgeOptions`、重要な定数が1ページにまとめられています。                              | [`17`](./17-configuration.md)         |
| クイックスタート / 運用  | 最短起動パス、起動レシピ、curl チェック、デモページの認証動作、ルート分割、シャットダウン動作、組み込み呼び出しレシピがカバーされています。                    | [`20`](./20-quickstart-operations.md) |
| エラー                  | 起動時の明示的な失敗、ルートエラー、ブリッジエラー、EventBus エラー、ファイルシステムエラー、メディエーターエラーが対処法とともにまとめられています。        | [`18`](./18-error-taxonomy.md)        |
| 観測可能性               | `QWEN_SERVE_DEBUG`、curl レシピ、有用なイベント、テレメトリのギャップ、調査チェックリストがドキュメント化されています。                                      | [`19`](./19-observability.md)         |

### 歴史的または非推奨のサーフェス

| サーフェス                                              | 状態                                                                                                         |
| -------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `docs/developers/daemon-client-adapters/tui.md`    | 旧 `DaemonTuiAdapter` スパイクの歴史的ドラフト。現在の共有 UI トランスクリプトアーキテクチャはドキュメント 14 にあります。 |
| `packages/cli/src/ui/daemon/daemon-tui-adapter.ts` | レガシーの実験的アダプターがツリーに残っています。新しい共有 UI 作業は SDK `daemon/ui/*` を優先してください。       |
| `--no-http-bridge`                                 | 互換性のために受け付けますが、http-bridge にフォールバックし、stderr に出力します。                               |

### 前方互換性

- イベントスキーマ v1 は追加専用です。新しい既知イベントタイプは `DAEMON_KNOWN_EVENT_TYPE_VALUES` に追記する必要があります。古い SDK は未知のタイプを前方互換として扱う必要があります。
- ケイパビリティタグは動作のコントラクトです。新しい動作には新しいタグが必要です。特にクライアントがルートを呼び出す前にプリフライトする可能性がある場合は必須です。
- `sessionScope: 'thread'` は現在の会話スレッドごとの分割方式です。古いクライアントスコープの表現を再導入しないでください。
- エンベロープ `_meta` と ACP ペイロード `data._meta` は別物です。ツール呼び出しのプロベナンスは ACP ペイロード下にあり、サーバー発行タイムスタンプは SSE エンベロープにあります。

## バージョンの出自

このドキュメントセットは、[#4412](https://github.com/QwenLM/qwen-code/pull/4412) のフォローアップ作業を含む、現在 `main` にマージされているデーモンモードのサーフェスを反映しています。以前の F シリーズの計画スナップショットではなく、現在の動作を意図的に記述しています。
