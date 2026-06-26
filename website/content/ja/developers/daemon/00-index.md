# デーモン開発者向けドキュメント

これは **qwen-code デーモンモード** に関する開発者向けテクニカルドキュメントです。対象となるのは、`qwen serve` HTTP デーモン、`@qwen-code/acp-bridge` パッケージ、ワークスペーススコープの MCP トランスポートプール、マルチクライアント権限調停、型付きデーモンイベントスキーマ v1、TypeScript SDK デーモンクライアント、そしてデーモンに接続するアダプターです。

このドキュメントは、以下の既存ドキュメントを補完するものであり、置き換えるものではありません。

| 既存ドキュメント                                                                         | 対象読者              | 主な情報源                                             |
| ---------------------------------------------------------------------------------------- | --------------------- | ------------------------------------------------------ |
| [`../../users/qwen-serve.md`](../../users/qwen-serve.md)                                 | オペレーター          | ユーザークイックスタート、フラグ、脅威モデル           |
| [`../qwen-serve-protocol.md`](../qwen-serve-protocol.md)                                 | プロトコル実装者      | HTTP ルートカタログ、リクエスト/レスポンス型、エラーコード |
| [`../examples/daemon-client-quickstart.md`](../examples/daemon-client-quickstart.md)     | SDK ユーザー          | エンドツーエンドの TypeScript ウォークスルー           |
| [`../daemon-client-adapters/`](../daemon-client-adapters/)                               | アダプター作成者      | レガシークライアントアダプター設計ドキュメント         |
| [`14-cli-tui-adapter.md`](./14-cli-tui-adapter.md)                                       | アダプター作成者      | クライアントアダプター設計ノート                       |
| [`../../design/f2-mcp-transport-pool.md`](../../design/f2-mcp-transport-pool.md)         | F2 メンテナー         | ワークスペース MCP トランスポートプール設計 v2.2       |

**デーモンを起動して使用する**場合は、まず `qwen-serve.md` をお読みください。**ワイヤーフォーマットに対するクライアントを構築する**場合は、`qwen-serve-protocol.md` をお読みください。**デーモン内部を理解、拡張、またはデバッグする**場合は、このセットをお読みください。

## 読み進める順序

目標に応じたパスを選択してください。

- **まずデーモンを起動して確認する**: `20 -> 17 -> 19`.
- **新規コントリビューター**: `01 -> 02 -> 03 -> 08 -> 09 -> 10 -> 11 -> 12`.
- **新しいクライアントアダプターを追加する**: `01 -> 09 -> 10 -> 13 -> (14 / 15 / 16)`.
- **MCP プールまたはバジェットに取り組む**: `01 -> 03 -> 05 -> 06`.
- **権限に取り組む**: `01 -> 03 -> 04 -> 12`.
- **運用中のデーモンをデバッグする**: `19 -> 18 -> 17 -> 20`.

## ドキュメントセット

### 基礎

- [`01-architecture.md`](./01-architecture.md) - システムアーキテクチャ、プロセストポロジー、パッケージマップ、および7つのトップレベルシーケンス図。

### サーバーコア

- [`02-serve-runtime.md`](./02-serve-runtime.md) - `runQwenServe` ブートストラップ、Express アプリ、ミドルウェアチェーン、グレースフルシャットダウン。
- [`03-acp-bridge.md`](./03-acp-bridge.md) - `@qwen-code/acp-bridge` パッケージ内部、セッションマルチプレクシング、チャネルファクトリ、ACP 子プロセス生成。
- [`04-permission-mediation.md`](./04-permission-mediation.md) - `MultiClientPermissionMediator`、4つのポリシー、N1 タイムアウト不変条件、キャンセルセンチネル。
- [`05-mcp-transport-pool.md`](./05-mcp-transport-pool.md) - `McpTransportPool` (F2)、プールエントリ、逆インデックス、再起動、ドレイン。
- [`06-mcp-budget-guardrails.md`](./06-mcp-budget-guardrails.md) - `WorkspaceMcpBudget`、モード (`off`/`warn`/`enforce`)、ヒステリシス、拒否バッチの結合。
- [`07-workspace-filesystem.md`](./07-workspace-filesystem.md) - `WorkspaceFileSystem` サンドボックス、パスポリシー、監査、`BridgeFileSystem` コントラクト。
- [`08-session-lifecycle.md`](./08-session-lifecycle.md) - 作成/アタッチ/ロード/再開、`X-Qwen-Client-Id`、ハートビート、エビクション、メタデータ。
- [`09-event-schema.md`](./09-event-schema.md) - 型付きイベントスキーマ v1: ペイロード、リデューサー、前方互換性を含む既知の43のイベントタイプ。
- [`10-event-bus.md`](./10-event-bus.md) - `EventBus`、単調増加 ID、リングリプレイ、`Last-Event-ID`、低速クライアントのバックプレッシャー、`client_evicted`。
- [`11-capabilities-versioning.md`](./11-capabilities-versioning.md) - 機能レジストリ、プロトコルバージョン、スキーマバージョン、条件付きアドバタイズメント。
- [`12-auth-security.md`](./12-auth-security.md) - Bearer ミドルウェア、ホスト許可リスト、CORS 拒否、ミューテーションゲート、`--require-auth`、`/health` 例外、デバイスフロー。

### クライアント

- [`13-sdk-daemon-client.md`](./13-sdk-daemon-client.md) - TypeScript SDK: `DaemonClient`、`DaemonSessionClient`、`DaemonAuthFlow`、SSE パーサー、イベントリデューサー、`ui/*` トランスクリプトレイヤー。
- [`14-cli-tui-adapter.md`](./14-cli-tui-adapter.md) - 共有 UI トランスクリプトレイヤーとレガシー CLI TUI デーモンアダプターの関係。
- [`15-channel-adapters.md`](./15-channel-adapters.md) - `DaemonChannelBridge` 共有ベースと、DingTalk、WeChat (Weixin)、Telegram、Feishu のチャネル別アダプター。
- [`16-vscode-ide-adapter.md`](./16-vscode-ide-adapter.md) - `DaemonIdeConnection`、ループバックのみの強制、Webview ブリッジング。

### 参考付録

- [`17-configuration.md`](./17-configuration.md) - デーモンに影響を与える環境変数、CLI フラグ、`settings.json` のキー。
- [`18-error-taxonomy.md`](./18-error-taxonomy.md) - レイヤーごとの型付きエラーと修正方法。
- [`19-observability.md`](./19-observability.md) - `QWEN_SERVE_DEBUG`、デバッグレシピ、テレメトリーのギャップ。
- [`20-quickstart-operations.md`](./20-quickstart-operations.md) - 最短の起動パス、curl チェック、ルートマップ、組み込み呼び出しレシピ。

## 用語集

- **ACP** - Agent Client Protocol。デーモンブリッジと ACP 子プロセス間で stdio 上で通信される JSON-RPC。クライアントがデーモンに対して使用する HTTP プロトコルではありません。
- **ACP 子プロセス** - デーモンが生成する子プロセス (`qwen --acp`)。実際のエージェントランタイムをホストします。ブリッジは1つの ACP 子プロセスを多数の接続クライアント間で多重化します。
- **acp-bridge** - `@qwen-code/acp-bridge` パッケージ (`packages/acp-bridge/`)。セッションマルチプレクシング、権限調停者、イベントバス、チャネルファクトリを管理します。
- **BridgeClient** - `packages/acp-bridge/src/bridgeClient.ts`。1つの ACP `ClientSideConnection` をラップし、`requestPermission`、`sendPrompt`、`cancelSession` を処理します。
- **チャネルファクトリ** - ACP 子プロセスを生成またはアタッチするためのプラグイン可能な戦略。デフォルトの `spawnChannel` は `qwen --acp` をサブプロセスとして実行します。`inMemoryChannel` はテスト用にインプロセスで実行します。
- **DaemonClient** - `packages/sdk-typescript/src/daemon/DaemonClient.ts`。デーモンに対する TypeScript SDK の HTTP レベルのファサード。
- **DaemonSessionClient** - `packages/sdk-typescript/src/daemon/DaemonSessionClient.ts`。SSE リプレイのために `lastSeenEventId` を追跡するセッションスコープのラッパー。
- **EventBus** - `packages/acp-bridge/src/eventBus.ts`。単調増加 ID、有界リング、サブスクライバーごとのバックプレッシャーを備えた、セッションごとのインメモリ pub/sub。
- **F1 / F2 / F3 / F4** - [#4175](https://github.com/QwenLM/qwen-code/issues/4175) で追跡される内部マイルストーン。F1: ブリッジ抽出と `BridgeFileSystem`。F2: ワークスペーススコープの MCP トランスポートプール。F3: マルチクライアント権限調停。F4: プロトコル完了とデーモンクライアントサーフェス。
- **MCP** - Model Context Protocol。サーバーはツール、リソース、プロンプトを公開します。デーモンの ACP 子プロセスがそれらに接続します。
- **McpTransportPool** - `packages/core/src/tools/mcp-transport-pool.ts`。F2 ワークスペーススコーププール。サーバー名と設定フィンガープリントごとに1つの MCP トランスポートを共有します。
- **調停者ポリシー** - `first-responder`、`designated`、`consensus`、`local-only` のいずれか。マルチクライアント権限投票の解決方法を決定します。
- **発信元クライアント ID** - 現在権限を要求しているプロンプトを開始したクライアントの `X-Qwen-Client-Id`。`designated` ポリシーはこの ID からの投票のみを受け入れます。
- **PoolEntry** - `packages/core/src/tools/mcp-pool-entry.ts`。`McpTransportPool` 内の1つのエントリ: 1つの MCP トランスポート、アタッチされたセッションの参照カウント、アイドルドレインタイマー。
- **セッションスコープ** - `single` (全クライアントで1つの ACP セッションを共有) または `thread` (会話スレッドごとに1つのセッション)。デフォルトは `single`。
- **SSE** - Server-Sent Events。デーモンのアウトバウンドイベントチャネル (`GET /session/:id/events`)。
- **ワークスペース** - デーモンが起動時にバインドされたディレクトリ (`--workspace` または `cwd`)。1つのデーモンプロセスが1つのワークスペースに対応します。

## 実装ソースアンカー

ドキュメントから最新の `main` コードに移動する際は、これらのアンカーを使用してください。

| サーフェス                           | 実装アンカー                                                                                                                                                                                                                                    | 主なドキュメント                                                                                                   |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| ブートストラップと HTTP アセンブリ    | `packages/cli/src/serve/run-qwen-serve.ts`、`server.ts`、`/demo`                                                                                                                                                                                  | [`02`](./02-serve-runtime.md)、[`20`](./20-quickstart-operations.md)                                                |
| ACP ブリッジとセッションマルチプレクシング | `packages/acp-bridge/src/bridge.ts`、`packages/acp-bridge/src/bridgeTypes.ts`、`@qwen-code/acp-bridge`                                                                                                                                            | [`03`](./03-acp-bridge.md)、[`08`](./08-session-lifecycle.md)                                                      |
| 権限調停                            | `packages/acp-bridge/src/permissionMediator.ts`、`fromLoopback: boolean`、`policy.*`                                                                                                                                                              | [`04`](./04-permission-mediation.md)、[`12`](./12-auth-security.md)                                                |
| MCP トランスポートプール             | `packages/core/src/tools/mcp-transport-pool.ts`、`mcp-pool-key.ts`、`pid-descendants.ts`、`session-mcp-view.ts`、`/mcp refresh`、`MCPCallInterruptedError`                                                                                        | [`05`](./05-mcp-transport-pool.md)、[`06`](./06-mcp-budget-guardrails.md)                                          |
| MCP バジェットガードレール           | `packages/core/src/tools/mcp-workspace-budget.ts`、`ServeMcpBudgetStatusCell.scope`、`budgets[]`                                                                                                                                                  | [`06`](./06-mcp-budget-guardrails.md)                                                                              |
| ワークスペースファイルシステム       | `packages/cli/src/serve/fs/`、`assertTrustedForIntent(trusted, intent)`、`meta.matchedIgnore`、`includeIgnored`                                                                                                                                   | [`07`](./07-workspace-filesystem.md)                                                                               |
| イベントスキーマと SSE ライター      | `packages/sdk-typescript/src/daemon/events.ts`、`packages/cli/src/serve/server.ts`、`formatSseFrame`、`packages/cli/src/acp-integration/session/emitters/ToolCallEmitter.ts`、`ToolCallEmitter.resolveToolProvenance`、`tool_call.provenance`、`serverId` | [`09`](./09-event-schema.md)、[`10`](./10-event-bus.md)                                                            |
| イベント再同期                      | `state_resync_required`、`awaitingResync`、`RESYNC_PASSTHROUGH_TYPES`、`asKnownDaemonEvent`、`unrecognizedKnownEventCount`                                                                                                                        | [`09`](./09-event-schema.md)、[`10`](./10-event-bus.md)                                                            |
| 機能                                | `packages/cli/src/serve/capabilities.ts`、`mcp_server_restart_refused.reason`、`MCP_RESTART_REFUSED_REASONS.has`                                                                                                                                  | [`11`](./11-capabilities-versioning.md)                                                                            |
| 認証とデバイスフロー                 | `packages/cli/src/serve/auth.ts`、`packages/cli/src/serve/auth/device-flow.ts`                                                                                                                                                                    | [`12`](./12-auth-security.md)                                                                                      |
| TypeScript SDK デーモンクライアント  | `packages/sdk-typescript/src/daemon/{DaemonClient,DaemonSessionClient,DaemonAuthFlow,sse,events,types}.ts`、`MCP_RESTART_DEFAULT_TIMEOUT_MS`                                                                                                      | [`13`](./13-sdk-daemon-client.md)                                                                                  |
| 共有 UI トランスクリプトレイヤー    | `DaemonUiEventType`、`DaemonSessionProvider`、`packages/webui/src/daemon/`                                                                                                                                                                        | [`13`](./13-sdk-daemon-client.md)、[`14`](./14-cli-tui-adapter.md)、[`../daemon-ui/README.md`](../daemon-ui/README.md) |
| チャネルと IDE アダプター           | `packages/channels/`、`packages/vscode-ide-companion/src/services/daemonIdeConnection.ts`                                                                                                                                                         | [`15`](./15-channel-adapters.md)、[`16`](./16-vscode-ide-adapter.md)                                               |

## 意図的にスコープ外としているもの

- **Java / Python SDK デーモンクライアント** - 現在、デーモンクライアントを提供しているのは TypeScript SDK のみです。文書 13 は TypeScript のみを対象としています。
- **Web UI 製品の詳細** - 共有トランスクリプトレイヤーと Web UI デーモンエントリポイントはここでカバーされていますが、製品 UI レイアウトは `docs/developers/daemon-ui/` とアダプター設計ノートで追跡されています。
- **Zed 拡張機能 (`packages/zed-extension/`)** - これは `qwen --acp` を stdio 経由で直接起動し、デーモンをバイパスします。
- **実験的なインプロセスホスティング** - `--no-http-bridge` は現在も http-bridge にフォールバックします。安定したインプロセスサーブモードが利用可能になった場合、新しいドキュメントが必要になります。

## 現在のデーモンモードのカバレッジ

### サーバーコアのカバレッジ

| 領域                        | 現在の状態                                                                                                                                                                    | 主なドキュメント                                                              |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| ブートストラップ/待機パス   | `qwen serve` は `runQwenServe` を遅延ロードし、認証/ワークスペース/バジェット/設定を検証し、Express アプリを構築し、`app.listen` を呼び出し、シグナルを受け取るまでブロックします。 | [`02`](./02-serve-runtime.md)、[`20`](./20-quickstart-operations.md)          |
| 認証/ネットワークガードレール | ループバックではデフォルトで Bearer 不要。非ループバックでは Bearer 必須。`--require-auth` はループバックと `/health` にも Bearer を拡張。ホスト許可リストとデフォルトの CORS 拒否が有効。 | [`12`](./12-auth-security.md)、[`17`](./17-configuration.md)                  |
| セッションライフサイクル   | `POST /session`、`load`、`resume`、メタデータパッチ、ハートビート、エビクション、アイドル回収、プロンプト保留中の制限、グレースフルクローズが文書化されています。                  | [`08`](./08-session-lifecycle.md)、[`10`](./10-event-bus.md)                  |
| ACP ブリッジ                | デフォルトで単一の ACP 子プロセスが多重化されます。`sessionScope` は `single` と `thread` をサポート。`BridgeFileSystem`、コンテキストファイル名、環境変数オーバーライド、チャネルアイドルタイムアウトが配線されています。 | [`03`](./03-acp-bridge.md)、[`07`](./07-workspace-filesystem.md)              |
| MCP プール/バジェット       | `QWEN_SERVE_NO_MCP_POOL=1` でなければワークスペース MCP プールはデフォルトでオン。ガードレールイベントと再起動セマンティクスが文書化されています。                                                | [`05`](./05-mcp-transport-pool.md)、[`06`](./06-mcp-budget-guardrails.md)     |
| 権限                        | F3 調停者は `first-responder`、`designated`、`consensus`、`local-only` をサポート。無効な設定は明示的に失敗します。                                                                   | [`04`](./04-permission-mediation.md)、[`12`](./12-auth-security.md)           |

### ワイヤープロトコル

| 領域            | 現在の状態                                                                                                                                       | 主なドキュメント                                                                                                  |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| HTTP ルート     | ルートカタログは `qwen-serve-protocol.md` にあります。このデーモンセットはそれを参照し、実装の所有権を説明するだけです。                              | [`../qwen-serve-protocol.md`](../qwen-serve-protocol.md)、[`20`](./20-quickstart-operations.md)                   |
| イベントスキーマ | `EVENT_SCHEMA_VERSION = 1`。43 の既知のイベントタイプ。ID なしのサブスクライバー合成フレーム。`_meta.serverTimestamp` は SSE 書き込み境界でスタンプされます。 | [`09`](./09-event-schema.md)、[`10`](./10-event-bus.md)                                                           |
| 機能            | `SERVE_PROTOCOL_VERSION = 'v1'`。67 の登録タグ。10 の条件付きタグ。                                                                                 | [`11`](./11-capabilities-versioning.md)                                                                           |
| セッションシェル | `POST /session/:id/shell` は `--enable-session-shell`、Bearer 認証、セッションにバインドされた `X-Qwen-Client-Id` の背後に存在。機能タグは条件付き。 | [`11`](./11-capabilities-versioning.md)、[`17`](./17-configuration.md)、[`20`](./20-quickstart-operations.md)     |
| レート制限      | オプションの階層別 HTTP レート制限は、CLI フラグ/env と条件付き機能タグによって公開されます。                                                       | [`11`](./11-capabilities-versioning.md)、[`17`](./17-configuration.md)                                            |

### クライアント / SDK

| 領域                         | 現在の状態                                                                                                                                                | 主なドキュメント                                                                                                                                  |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| TypeScript SDK デーモンクライアント | `DaemonClient`、`DaemonSessionClient`、`DaemonAuthFlow`、SSE パーサー、イベントリデューサー、機能プリフライト、UI トランスクリプトエクスポートが文書化されています。 | [`13`](./13-sdk-daemon-client.md)                                                                                                                 |
| 共有 UI トランスクリプトレイヤー   | SDK `daemon/ui/*` はデーモンイベントを 37 の UI セマンティックイベントタイプに正規化し、トランスクリプトブロックにリデュースし、レンダラー/適合性ヘルパーを提供します。 | [`14`](./14-cli-tui-adapter.md)、[`../daemon-ui/README.md`](../daemon-ui/README.md)、[`../daemon-ui/MIGRATION.md`](../daemon-ui/MIGRATION.md)     |
| Web UI デーモンコンシューマー     | `packages/webui/src/daemon/` は React プロバイダーとアダプターを介して SDK トランスクリプトストアを消費します。                                                     | [`14`](./14-cli-tui-adapter.md)、[`../daemon-client-adapters/web-ui.md`](../daemon-client-adapters/web-ui.md)                                     |
| CLI TUI / チャネル / VS Code     | レガシーパスはまだ存在します。共有トランスクリプトプリミティブへの移行は、完了した動作ではなく、フォローアップ作業として文書化されています。                             | [`14`](./14-cli-tui-adapter.md)、[`15`](./15-channel-adapters.md)、[`16`](./16-vscode-ide-adapter.md)                                             |
### リファレンスと操作

| 領域       | 現在の状態                                                                                                                                               | 主要ドキュメント                     |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------ |
| 設定       | `qwen serve` のすべてのフラグ、環境変数、`settings.json`、`ServeOptions`、`BridgeOptions`、および重要な定数が1ページにまとめられています。               | [`17`](./17-configuration.md)        |
| クイックスタート / 操作 | 最短の起動パス、起動レシピ、curl チェック、デモページの認証動作、ルート分割、シャットダウン動作、組み込み呼び出しレシピがカバーされています。 | [`20`](./20-quickstart-operations.md) |
| エラー     | 起動時の明示的な失敗、ルートエラー、ブリッジエラー、EventBusエラー、ファイルシステムエラー、メディエーターエラーが修復方法とともにまとめられています。 | [`18`](./18-error-taxonomy.md)        |
| 可観測性   | `QWEN_SERVE_DEBUG`、curlレシピ、有用なイベント、テレメトリのギャップ、調査チェックリストが文書化されています。                                          | [`19`](./19-observability.md)         |

### 歴史的または非推奨のサーフェス

| サーフェス                                            | ステータス                                                                                                           |
| ----------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `docs/developers/daemon-client-adapters/tui.md`       | 古い `DaemonTuiAdapter` スパイクの歴史的なドラフト。現在の共有UIトランスクリプトアーキテクチャはドキュメント14を参照してください。 |
| `packages/cli/src/ui/daemon/daemon-tui-adapter.ts`    | ツリー内に残っているレガシー実験的アダプター。新しい共有UI作業では、SDKの `daemon/ui/*` を優先すべきです。               |
| `--no-http-bridge`                                    | 互換性のために受け入れられていますが、http-bridgeにフォールバックしstderrに出力します。                                 |

### 前方互換性

- イベントスキーマv1は追加型です。新しい既知のイベントタイプは `DAEMON_KNOWN_EVENT_TYPE_VALUES` に追加する必要があります。古いSDKは未知のタイプを前方互換として扱う必要があります。
- ケイパビリティタグは動作契約です。新しい動作には新しいタグが必要です。特に、クライアントがルートを呼び出す前にプリフライトする可能性がある場合。
- `sessionScope: 'thread'` は現在の会話スレッドごとの分割です。古いクライアントスコープの表現を再導入しないでください。
- エンベロープの `_meta` とACPペイロードの `data._meta` は異なります。ツール呼び出しの出自はACPペイロード側にあり、サーバー発行のタイムスタンプはSSEエンベロープ側にあります。

## バージョンの由来

このドキュメントセットは、[#4412](https://github.com/QwenLM/qwen-code/pull/4412) のフォローアップ作業を含め、現在 `main` にマージされているデーモンモードのサーフェスを反映しています。意図的に、以前のFシリーズ計画スナップショットではなく、現在の動作を説明しています。