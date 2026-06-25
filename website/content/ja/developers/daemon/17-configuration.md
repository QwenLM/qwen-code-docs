# 設定リファレンス

## 概要

このページでは、`qwen serve` デーモンとそのアダプターに影響するすべての設定をまとめています。対象は環境変数、CLI フラグ、`settings.json` のキー、およびプログラム的なオプションです。機能固有のページは、横断的な設定の詳細が必要な場合にここへリンクします。

## CLI フラグ (`qwen serve`)

| フラグ                                   | 型                         | デフォルト                                     | 効果                                                                                                                                                                                |
| --------------------------------------- | -------------------------- | ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--hostname <host>`                     | string                     | `127.0.0.1`                                | バインドアドレス。ループバック値: `127.0.0.1`、`localhost`、`::1`、`[::1]`。非ループバックの場合は起動時にベアラートークンが必要。`host:port` 形式の入力は拒否され、`--port` の使用が案内されます。 |
| `--port <n>`                            | number                     | `4170`                                     | リッスンポート。`0` はエフェメラルポートを意味します。                                                                                                                                |
| `--token <s>`                           | string                     | env                                        | ベアラートークン。`QWEN_SERVER_TOKEN` を上書きし、起動時にトリムされます。プロセスのコマンドラインに表示されるため、デプロイ環境では env の使用を推奨します。                            |
| `--require-auth`                        | boolean                    | `false`                                    | ループバックおよび `/health` にもベアラー認証を適用します。トークンなしでは起動を拒否します。                                                                                          |
| `--workspace <dir>`                     | absolute path              | `process.cwd()`                            | バインドするワークスペース。絶対パスかつディレクトリである必要があり、起動時に一度正規化されます。                                                                                      |
| `--max-sessions <n>`                    | number                     | `20`                                       | アクティブセッションの上限。`0` / `Infinity` は無制限を意味します。`NaN` や負の値はエラーになります。                                                                                 |
| `--max-pending-prompts-per-session <n>` | number                     | `5`                                        | セッションごとに受け付けるペンディング/実行中プロンプトの上限。超過した場合は 503 を返します。`0` / `Infinity` は無制限。負の値や非整数はエラーになります。                              |
| `--max-connections <n>`                 | number                     | `256`                                      | HTTP リスナーの `server.maxConnections`。`0` / `Infinity` は無制限。                                                                                                                |
| `--enable-session-shell`                | boolean                    | `false`                                    | `POST /session/:id/shell` の直接実行を有効にします。ベアラートークンが必要で、各リクエストはセッションにバインドされた `X-Qwen-Client-Id` を持つ必要があります。                         |
| `--event-ring-size <n>`                 | number                     | `8000`                                     | セッションごとの SSE リプレイリング。ソフト上限は `1_000_000`。                                                                                                                      |
| `--http-bridge`                         | boolean                    | `true`                                     | Stage 1 ブリッジモード。`--no-http-bridge` でも http-bridge にフォールバックし、stderr に出力します。                                                                                 |
| `--mcp-client-budget <n>`               | positive integer           | unset                                      | `WorkspaceMcpBudget.clientBudget` を設定し、`childEnvOverrides` 経由で ACP 子プロセスに転送します。                                                                                  |
| `--mcp-budget-mode <m>`                 | `off` / `warn` / `enforce` | バジェット設定時は `warn`、それ以外は `off` | `WorkspaceMcpBudget.mode` を設定します。`enforce` には `--mcp-client-budget` が必要です。                                                                                            |
| `--allow-origin <pattern>`              | repeatable string          | unset                                      | デフォルトの CORS 拒否を置き換えるクロスオリジン許可リスト。`*` はすべてのオリジンを許可しますが、トークンが必要です。                                                                  |
| `--allow-private-auth-base-url`         | boolean                    | `false`                                    | `/workspace/auth/provider` がローカルホスト / プライベートネットワークの認証プロバイダー `baseUrl` をインストールできるようにします。信頼できるローカル開発環境でのみ使用してください。  |
| `--prompt-deadline-ms <n>`              | positive integer           | unset                                      | サーバー側のプロンプトウォールクロック制限（ミリ秒）。タイムアウト時はプロンプトを中断してエラーを返します。                                                                            |
| `--writer-idle-timeout-ms <n>`          | positive integer           | unset                                      | SSE 接続ごとのアイドルタイムアウト（ミリ秒）。この期間イベントが送信されなかった場合、デーモンは SSE 接続を閉じます。                                                                   |
| `--channel-idle-timeout-ms <n>`         | non-negative integer       | `0`                                        | 最後のセッションが閉じられた後、ACP 子プロセスを保持する時間。`0` は即時解放を意味します。                                                                                            |
| `--session-reap-interval-ms <n>`        | non-negative integer       | `60000`                                    | セッションリーパーのスキャン間隔。`0` で無効化します。                                                                                                                               |
| `--session-idle-timeout-ms <n>`         | non-negative integer       | `1800000`                                  | 切断済みセッションのアイドル回収時間。`0` で無効化します。                                                                                                                           |
| `--rate-limit` / `--no-rate-limit`      | boolean                    | env / off                                  | プロンプト、ミューテーション、読み取りルートに対してティアごとの HTTP レート制限を有効にします。                                                                                        |
| `--rate-limit-prompt <n>`               | positive integer           | `10`                                       | ウィンドウあたりのプロンプトリクエスト上限。レート制限が有効な場合に適用されます。                                                                                                    |
| `--rate-limit-mutation <n>`             | positive integer           | `30`                                       | ウィンドウあたりのミューテーションリクエスト上限。レート制限が有効な場合に適用されます。                                                                                              |
| `--rate-limit-read <n>`                 | positive integer           | `120`                                      | ウィンドウあたりの読み取りリクエスト上限。レート制限が有効な場合に適用されます。                                                                                                      |
| `--rate-limit-window-ms <n>`            | integer `>= 1000`          | `60000`                                    | レート制限ウィンドウの長さ。レート制限が有効な場合に適用されます。                                                                                                                    |
| no flag                                 | -                          | -                                          | `QWEN_SERVE_NO_MCP_POOL=1` でプールを完全に無効化します。                                                                                                                            |

## 環境変数

### `runQwenServe` / Express ミドルウェアが読み取る変数

| 環境変数                                | 効果                                                                                                                                                                   |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `QWEN_SERVER_TOKEN`                 | ベアラートークン。起動時にトリムされます。                                                                                                                                |
| `QWEN_SERVE_DEBUG`                  | `1` / `true` / `on` / `yes`（大文字小文字を問わない）で詳細な stderr ログを有効にします。[`19-observability.md`](./19-observability.md) を参照してください。              |
| `QWEN_SERVE_NO_MCP_POOL`            | `1` でワークスペース MCP トランスポートプールを無効化し、セッションごとの `McpClientManager` にフォールバックします。機能として `mcp_workspace_pool` / `mcp_pool_restart` のアドバタイズが停止します。 |
| `QWEN_SERVE_PROMPT_DEADLINE_MS`     | `--prompt-deadline-ms` の環境変数フォールバック。                                                                                                                        |
| `QWEN_SERVE_WRITER_IDLE_TIMEOUT_MS` | `--writer-idle-timeout-ms` の環境変数フォールバック。                                                                                                                    |
| `QWEN_SERVE_RATE_LIMIT`             | `1` / `true` でティアごとの HTTP レート制限を有効化します。CLI の `--rate-limit` / `--no-rate-limit` が優先されます。                                                      |
| `QWEN_SERVE_RATE_LIMIT_PROMPT`      | `--rate-limit-prompt` の環境変数フォールバック。                                                                                                                         |
| `QWEN_SERVE_RATE_LIMIT_MUTATION`    | `--rate-limit-mutation` の環境変数フォールバック。                                                                                                                       |
| `QWEN_SERVE_RATE_LIMIT_READ`        | `--rate-limit-read` の環境変数フォールバック。                                                                                                                           |
| `QWEN_SERVE_RATE_LIMIT_WINDOW_MS`   | `--rate-limit-window-ms` の環境変数フォールバック。                                                                                                                      |

### `BridgeOptions.childEnvOverrides` 経由で ACP 子プロセスに転送される変数

`runQwenServe` はハンドルごとにこれらを構築するため、1 つのプロセスで 2 つのデーモンが `process.env` で競合することはありません。バジェット変数は `qwen serve` の親プロセス環境変数フォールバックではなく、CLI パスが `--mcp-client-budget` / `--mcp-budget-mode` から生成する必要があります。

| 環境変数                              | 効果                                                                                                                   |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `QWEN_SERVE_MCP_CLIENT_BUDGET`   | ACP 子プロセスの `readBudgetFromEnv()` が消費する正の整数文字列。                                                         |
| `QWEN_SERVE_MCP_BUDGET_MODE`     | `off` / `warn` / `enforce`。                                                                                             |
| `QWEN_SERVE_MCP_POOL_TRANSPORTS` | カンマ区切りのトランスポート許可リスト。デフォルトのプールトランスポートは `stdio,websocket`。`http,sse` を明示的に含めることも可能です。 |
| `QWEN_SERVE_MCP_POOL_DRAIN_MS`   | プールエントリのアイドルドレイン遅延。デフォルトは `30000`、`1000..600000` ms にクランプされます。                          |

### SDK / アダプターが読み取る変数

| 環境変数                     | 効果                                                            |
| ----------------------- | ----------------------------------------------------------------- |
| `QWEN_DAEMON_URL`       | CLI TUI アダプター、チャンネル、IDE コンパニオン用のデーモンベース URL。 |
| `QWEN_DAEMON_TOKEN`     | ベアラートークン。                                                 |
| `QWEN_DAEMON_WORKSPACE` | `POST /session` に送信される `cwd` を上書きします。               |

## `settings.json` のキー

デーモンは `runQwenServe` 内の `loadSettings(boundWorkspace)` を通じて起動時に設定を一度読み込みます。不正な設定は try/catch ガードによってデフォルト値にフォールバックします。

| キー                         | 型                                                               | 効果                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| --------------------------- | ------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `policy.permissionStrategy` | `'first-responder' \| 'designated' \| 'consensus' \| 'local-only'` | `BridgeOptions.permissionPolicy` を設定します。アクティブな値は `/capabilities` に `policy.permission` として表示されます。**起動時に** `validatePolicyConfig()` を通じて `SERVE_CAPABILITY_REGISTRY.permission_mediation.modes` に対してバリデーションが行われます。未知のリテラルは `InvalidPolicyConfigError` をスローし、起動が明示的に失敗します。                                                                                                                                                                                |
| `policy.consensusQuorum`    | positive integer                                                   | `consensus` ポリシーの N 値。**デフォルト**は `votersAtIssue.size` に対して `floor(M/2) + 1`（M=2 の場合は全会一致、M が偶数の大きな値の場合は過半数超え）。コンセンサスポリシー以外で設定された場合は無視され、起動時に stderr 警告が出力されます。非正の整数は `InvalidPolicyConfigError` をスローします。[`04-permission-mediation.md`](./04-permission-mediation.md) を参照してください。                                                                                                                                               |
| `context.fileName`          | string                                                             | `BridgeOptions.contextFilename` を通じて `getCurrentGeminiMdFilename()` を上書きします。                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `tools.disabled`            | string[]                                                           | 次の ACP 子プロセス起動時に無効化するツール。`normalizeDisabledToolList()` (`packages/cli/src/config/normalizeDisabledTools.ts`) を通じて正規化されます（配列でない場合は `[]`、文字列以外のエントリはスキップ、空白はトリム、空エントリは除去、重複は最初の出現を保持して除去）。起動時と `restartMcpServer` の設定更新時の両方でこの関数が実行されます。`ToolRegistry.has(name)` は完全一致かつ大文字小文字を区別します。`POST /workspace/tools/:name/enable` と `tool_toggled` はこのキーを更新します。 |
| `tools.approvalMode`        | `'default' \| 'auto' \| ...`                                       | デフォルトのセッション承認モード。`persist: true` の場合、`POST /session/:id/approval-mode` がここに書き込みます。                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `telemetry`                 | object                                                             | OTel 設定。キーには `enabled`、`otlpEndpoint`、`otlpProtocol`、`otlpTracesEndpoint`、`otlpLogsEndpoint`、`otlpMetricsEndpoint`、`target`、`outfile`、`includeSensitiveSpanAttributes`、`resourceAttributes`、`metrics.includeSessionId` が含まれます。`resolveTelemetrySettings()` が起動時に読み込み、`initializeTelemetry()` を初期化します。                                                                                                                                                                                          |

## `ServeOptions`（プログラム的な埋め込み）

`packages/cli/src/serve/types.ts` では、`runQwenServe` と `createServeApp` の両方が受け付ける型付きオプションオブジェクトを定義しています。上記の CLI フラグを反映し、以下を追加します。

| フィールド                        | 効果                                                                                        |
| ----------------------------- | --------------------------------------------------------------------------------------------- |
| `eventRingSize`               | デフォルトのセッションごとのリングサイズを上書きします。                                        |
| `maxPendingPromptsPerSession` | セッションごとのペンディングプロンプト上限。`0` / `Infinity` は無制限。                         |
| `mcpPoolActive`               | プログラム的なスイッチ。`QWEN_SERVE_NO_MCP_POOL` からデフォルト値が設定されます。               |
| `allowOrigins`                | クロスオリジン許可リスト（`string[]`）。`--allow-origin` に対応します。                        |
| `allowPrivateAuthBaseUrl`     | プライベート / ローカルホストの認証プロバイダー `baseUrl` のインストールを許可します。           |
| `enableSessionShell`          | セッションシェル実行を有効にします。ベアラートークンとセッションバインドのクライアント ID は引き続き必要です。 |
| `promptDeadlineMs`            | プロンプトのウォールクロック制限。                                                             |
| `writerIdleTimeoutMs`         | SSE ライターのアイドルタイムアウト。                                                           |
| `channelIdleTimeoutMs`        | 最後のセッションが閉じられた後、ACP 子プロセスをウォームな状態で保持する時間。                  |
| `sessionReapIntervalMs`       | セッションリーパーのスキャン間隔。                                                             |
| `sessionIdleTimeoutMs`        | 切断済みセッションのアイドル回収時間。                                                         |
| `rateLimit*`                  | ティアごとの HTTP レート制限スイッチ、しきい値、ウィンドウ。                                    |

## `BridgeOptions`（プログラム的なブリッジ埋め込み）

`packages/acp-bridge/src/bridgeOptions.ts` でブリッジオプションを定義しています。完全なテーブルは [`03-acp-bridge.md`](./03-acp-bridge.md) を参照してください。主なフィールド：

| フィールド                                                                                                                   | 効果                                                                                        |
| ----------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `boundWorkspace`                                                                                                        | 必須の正規化されたワークスペース。                                                             |
| `sessionScope`                                                                                                          | `'single'`（デフォルト）または `'thread'`。                                                   |
| `initializeTimeoutMs`、`maxSessions`、`eventRingSize`、`permissionResponseTimeoutMs`、`maxPendingPermissionsPerSession` | リソース上限の制御。                                                                          |
| `channelFactory`                                                                                                        | プラガブルな ACP 子ファクトリー。デフォルトは `defaultSpawnChannelFactory`。                   |
| `fileSystem`                                                                                                            | `BridgeFileSystem` アダプター。[`07-workspace-filesystem.md`](./07-workspace-filesystem.md) を参照してください。 |
| `permissionPolicy`、`permissionConsensusQuorum`、`permissionAudit`                                                      | メディエーターの配線。                                                                        |
| `statusProvider`                                                                                                        | デーモンホストのプリフライトセル。                                                             |
| `childEnvOverrides`                                                                                                     | ハンドルごとの環境変数の追加または削除。                                                       |
| `contextFilename`                                                                                                       | `getCurrentGeminiMdFilename()` を上書きします。                                               |
| `channelIdleTimeoutMs`                                                                                                  | 最後のセッションが閉じられた後、ACP 子プロセスを生かし続ける時間（ミリ秒）。デフォルトは `0`。 |

## 重要なデフォルト値

| 定数                               | ファイル                  | 値                | 意味                                                           |
| --------------------------------- | ----------------------- | ----------------- | ----------------------------------------------------------------- |
| `DEFAULT_MAX_SESSIONS`            | `bridge.ts`             | `20`              | `SessionLimitExceededError` が発生するまでのセッション上限。       |
| `MAX_EVENT_RING_SIZE`             | `bridge.ts`             | `1_000_000`       | `BridgeOptions.eventRingSize` のソフト上限。タイプミスを防ぎます。 |
| `DEFAULT_RING_SIZE`               | `eventBus.ts`           | `8000`            | セッションごとの SSE リプレイリング深度。                         |
| `DEFAULT_MAX_QUEUED`              | `eventBus.ts`           | `256`             | サブスクライバーごとのキュー上限。                                 |
| `DEFAULT_MAX_SUBSCRIBERS`         | `eventBus.ts`           | `64`              | バスごとのサブスクライバー上限。                                   |
| `WARN_THRESHOLD_RATIO`            | `eventBus.ts`           | `0.75`            | `slow_client_warning` のトリガー。                                |
| `WARN_RESET_RATIO`                | `eventBus.ts`           | `0.375`           | ヒステリシスの再アーム閾値。                                       |
| `DEFAULT_INIT_TIMEOUT_MS`         | `bridge.ts`             | `10_000`          | ACP `initialize` ハンドシェイクタイムアウト。                     |
| `MCP_RESTART_TIMEOUT_MS`          | `bridge.ts`             | `300_000`         | `/workspace/mcp/:server/restart` のブリッジタイムアウト。         |
| `DEFAULT_PERMISSION_TIMEOUT_MS`   | `bridge.ts`             | `5 * 60_000`      | 許可リクエストごとのウォールクロック。                             |
| `DEFAULT_MAX_PENDING_PER_SESSION` | `bridge.ts`             | `64`              | `DEFAULT_MAX_SUBSCRIBERS` に合わせた値。                          |
| `MAX_RESOLVED_PERMISSION_RECORDS` | `permissionMediator.ts` | `512`             | 最近解決された許可の FIFO。                                        |
| `KILL_HARD_DEADLINE_MS`           | `spawnChannel.ts`       | `10_000`          | チャンネルごとのグレースフルシャットダウンウィンドウ。             |
| `SHUTDOWN_FORCE_CLOSE_MS`         | `run-qwen-serve.ts`       | `5_000`           | HTTP サーバーの強制クローズタイマー。                              |
| `MAX_READ_BYTES`                  | `fs/policy.ts`          | `256 * 1024`      | 読み取り上限。                                                    |
| `MAX_WRITE_BYTES`                 | `fs/policy.ts`          | `5 * 1024 * 1024` | 書き込み上限。                                                    |
| `MAX_DISPLAY_NAME_LENGTH`         | `bridge.ts`             | `256`             | セッション `displayName` の上限。                                  |

## クロスリファレンス

- 認証設定: [`12-auth-security.md`](./12-auth-security.md)
- ケイパビリティとプロトコルバージョン: [`11-capabilities-versioning.md`](./11-capabilities-versioning.md)
- イベントリングとバックプレッシャーのチューニング: [`10-event-bus.md`](./10-event-bus.md)
- MCP プール / バジェット: [`05-mcp-transport-pool.md`](./05-mcp-transport-pool.md) および [`06-mcp-budget-guardrails.md`](./06-mcp-budget-guardrails.md)
- 許可ポリシー: [`04-permission-mediation.md`](./04-permission-mediation.md)
- ユーザー操作ガイド: [`../../users/qwen-serve.md`](../../users/qwen-serve.md)
