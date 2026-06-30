# 設定リファレンス

## 概要

このページでは、`qwen serve` デーモンとそのアダプターに影響を与えるすべての設定（環境変数、CLIフラグ、`settings.json` のキー、プログラムからのオプション）をまとめています。機能固有のページでは、横断的な設定の詳細が必要な場合にここへリンクしています。

## CLIフラグ（`qwen serve`）

| フラグ                                    | 型                       | デフォルト                                    | 効果                                                                                                                                                                              |
| --------------------------------------- | -------------------------- | ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--hostname <host>`                     | string                     | `127.0.0.1`                                | バインドアドレス。ループバック値: `127.0.0.1`、`localhost`、`::1`、`[::1]`。ループバック以外の場合、起動時にベアラートークンが必要です。`host:port` 形式の入力は拒否され、`--port` の使用が案内されます。 |
| `--port <n>`                            | number                     | `4170`                                     | リッスンポート。`0` はエフェメラルポートを意味します。                                                                                                                                                   |
| `--token <s>`                           | string                     | env                                        | ベアラートークン。`QWEN_SERVER_TOKEN` をオーバーライドし、起動時にトリミングされます。プロセスのコマンドラインに表示されるため、デプロイ時には環境変数の使用を推奨します。                                           |
| `--require-auth`                        | boolean                    | `false`                                    | ベアラ認証をループバックおよび `/health` に拡張します。トークンなしでは起動が拒否されます。                                                                                               |
| `--workspace <dir>`                     | absolute path              | `process.cwd()`                            | バインドされるワークスペース。絶対パスかつディレクトリである必要があります。起動時に1回だけ正規化されます。                                                                                                      |
| `--max-sessions <n>`                    | number                     | `20`                                       | アクティブセッションの上限。`0` / `Infinity` は無制限を意味します。`NaN` / 負の値はエラーをスローします。                                                                                                |
| `--max-pending-prompts-per-session <n>` | number                     | `5`                                        | セッションごとに受け入れられたが保留中または実行中のプロンプトの上限。超過したプロンプトは 503 を返します。`0` / `Infinity` は無制限を意味します。負の値または非整数値はエラーをスローします。                             |
| `--max-connections <n>`                 | number                     | `256`                                      | HTTPリスナーの `server.maxConnections`。`0` / `Infinity` は無制限を意味します。                                                                                                            |
| `--enable-session-shell`                | boolean                    | `false`                                    | `POST /session/:id/shell` の直接実行を有効にします。ベアラートークンが必要であり、すべての呼び出しにセッションにバインドされた `X-Qwen-Client-Id` を含める必要があります。                                            |
| `--event-ring-size <n>`                 | number                     | `8000`                                     | セッションごとのSSEリプレイリング。ソフトキャップは `1_000_000` です。                                                                                                                               |
| `--http-bridge`                         | boolean                    | `true`                                     | ステージ1ブリッジモード。`--no-http-bridge` でも http-bridge にフォールバックし、stderrに出力します。                                                                                       |
| `--mcp-client-budget <n>`               | positive integer           | unset                                      | `WorkspaceMcpBudget.clientBudget` を設定し、`childEnvOverrides` を通じてACP子プロセスに転送します。                                                                                |
| `--mcp-budget-mode <m>`                 | `off` / `warn` / `enforce` | `warn` when budget is set, otherwise `off` | `WorkspaceMcpBudget.mode` を設定します。`enforce` には `--mcp-client-budget` が必要です。                                                                                                           |
| `--allow-origin <pattern>`              | repeatable string          | unset                                      | デフォルトのCORS拒否を置き換えるクロスオリジン許可リスト。`*` は任意のオリジンを許可しますが、トークンが必要です。                                                                           |
| `--allow-private-auth-base-url`         | boolean                    | `false`                                    | `/workspace/auth/provider` による localhost / プライベートネットワーク認証プロバイダーの `baseUrl` のインストールを許可します。信頼されたローカル開発環境でのみ使用してください。                                            |
| `--prompt-deadline-ms <n>`              | positive integer           | unset                                      | サーバー側のプロンプトの実時間制限（ミリ秒）。タイムアウトすると中止され、エラーが返されます。                                                                                                      |
| `--writer-idle-timeout-ms <n>`          | positive integer           | unset                                      | SSE接続ごとのアイドルタイムアウト（ミリ秒）。この時間イベントが送信されない場合、デーモンはSSE接続を閉じます。                                                                |
| `--channel-idle-timeout-ms <n>`         | non-negative integer       | `0`                                        | 最後のセッションが閉じられた後、ACP子プロセスを存続させる時間。`0` は即座に回収することを意味します。                                                                                  |
| `--session-reap-interval-ms <n>`        | non-negative integer       | `60000`                                    | セッションリーパーのスキャン間隔。`0` で無効になります。                                                                                                                                      |
| `--session-idle-timeout-ms <n>`         | non-negative integer       | `1800000`                                  | 切断されたセッションのアイドル時の回収時間。`0` で無効になります。                                                                                                                            |
| `--rate-limit` / `--no-rate-limit`      | boolean                    | env / off                                  | プロンプト、ミューテーション、および読み取りルートに対する階層ごとのHTTPレート制限を有効にします。                                                                                                          |
| `--rate-limit-prompt <n>`               | positive integer           | `10`                                       | ウィンドウごとのプロンプトリクエスト制限。レート制限が有効である必要があります。                                                                                                              |
| `--rate-limit-mutation <n>`             | positive integer           | `30`                                       | ウィンドウごとのミューテーションリクエスト制限。レート制限が有効である必要があります。                                                                                                            |
| `--rate-limit-read <n>`                 | positive integer           | `120`                                      | ウィンドウごとの読み取りリクエスト制限。レート制限が有効である必要があります。                                                                                                                |
| `--rate-limit-window-ms <n>`            | integer `>= 1000`          | `60000`                                    | レート制限ウィンドウの長さ。レート制限が有効である必要があります。                                                                                                                     |
| フラグなし                                 | -                          | -                                          | `QWEN_SERVE_NO_MCP_POOL=1` はプールを完全に無効にします。                                                                                                                                 |

## 環境変数

### `runQwenServe` / Expressミドルウェアによって読み込まれる変数

| 環境変数                                 | 効果                                                                                                                                                                   |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `QWEN_SERVER_TOKEN`                 | ベアラートークン。起動時にトリミングされます。                                                                                                                                           |
| `QWEN_SERVE_DEBUG`                  | `1` / `true` / `on` / `yes`（大文字小文字を区別しない）で詳細なstderrログを有効にします。[`19-observability.md`](./19-observability.md) を参照してください。                                          |
| `QWEN_SERVE_NO_MCP_POOL`            | `1` でワークスペースMCPトランスポートプールを無効にし、セッションごとの `McpClientManager` にフォールバックします。capabilitiesは `mcp_workspace_pool` / `mcp_pool_restart` を公開しなくなります。 |
| `QWEN_SERVE_PROMPT_DEADLINE_MS`     | `--prompt-deadline-ms` の環境変数フォールバック。                                                                                                                                 |
| `QWEN_SERVE_WRITER_IDLE_TIMEOUT_MS` | `--writer-idle-timeout-ms` の環境変数フォールバック。                                                                                                                             |
| `QWEN_SERVE_RATE_LIMIT`             | `1` / `true` で階層ごとのHTTPレート制限を有効にします。CLIの `--rate-limit` / `--no-rate-limit` が優先されます。                                                                           |
| `QWEN_SERVE_RATE_LIMIT_PROMPT`      | `--rate-limit-prompt` の環境変数フォールバック。                                                                                                                                  |
| `QWEN_SERVE_RATE_LIMIT_MUTATION`    | `--rate-limit-mutation` の環境変数フォールバック。                                                                                                                                |
| `QWEN_SERVE_RATE_LIMIT_READ`        | `--rate-limit-read` の環境変数フォールバック。                                                                                                                                    |
| `QWEN_SERVE_RATE_LIMIT_WINDOW_MS`   | `--rate-limit-window-ms` の環境変数フォールバック。                                                                                                                               |

### `BridgeOptions.childEnvOverrides` を通じてACP子プロセスに転送される変数

`runQwenServe` はこれらの変数をハンドルごとに構築するため、1つのプロセス内の2つのデーモンが `process.env` で競合することはありません。budget変数は `qwen serve` の親プロセス環境変数フォールバックではありません。CLIパスは `--mcp-client-budget` / `--mcp-budget-mode` からこれらを生成する必要があります。

| 環境変数                              | 効果                                                                                                                   |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `QWEN_SERVE_MCP_CLIENT_BUDGET`   | ACP子プロセスの `readBudgetFromEnv()` によって消費される正の整数文字列。                                               |
| `QWEN_SERVE_MCP_BUDGET_MODE`     | `off` / `warn` / `enforce`。                                                                                              |
| `QWEN_SERVE_MCP_POOL_TRANSPORTS` | カンマ区切りのトランスポート許可リスト。デフォルトのプールトランスポートは `stdio,websocket` です。`http,sse` を明示的に含めることができます。 |
| `QWEN_SERVE_MCP_POOL_DRAIN_MS`   | プールエントリのアイドルドレイン遅延。デフォルトは `30000` で、`1000..600000` ms にクランプされます。                                              |

### SDK / アダプターによって読み込まれる変数

| 環境変数                     | 効果                                                            |
| ----------------------- | ----------------------------------------------------------------- |
| `QWEN_DAEMON_URL`       | CLI TUIアダプター、チャネル、およびIDEコンパニオンのデーモンベースURL。 |
| `QWEN_DAEMON_TOKEN`     | ベアラートークン。                                                     |
| `QWEN_DAEMON_WORKSPACE` | `POST /session` に送信される `cwd` をオーバーライドします。                      |

## `settings.json` のキー

デーモンは、`runQwenServe` 内の `loadSettings(boundWorkspace)` を通じて起動時に1回だけ設定を読み取ります。不正な形式の設定は、try/catchガードを通じてデフォルト値にフォールバックします。

| キー                         | 型                                                               | 効果                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| --------------------------- | ------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `policy.permissionStrategy` | `'first-responder' \| 'designated' \| 'consensus' \| 'local-only'` | `BridgeOptions.permissionPolicy` を設定します。有効な値は `policy.permission` として `/capabilities` に表示されます。**起動時**に `validatePolicyConfig()` を通じて `SERVE_CAPABILITY_REGISTRY.permission_mediation.modes` に対して**検証**されます。不明なリテラルは `InvalidPolicyConfigError` をスローし、起動を明示的に失敗させます。                                                                                                                                                                                                                               |
| `policy.consensusQuorum`    | positive integer                                                   | `consensus` ポリシーの N。**デフォルト**は `votersAtIssue.size` に対する `floor(M/2) + 1` です（M=2 は全会一致、より大きな偶数 M は過半数を意味します）。consensus 以外のポリシーで設定された場合は無視され、起動時にstderrに警告が出力されます。正でない整数は `InvalidPolicyConfigError` をスローします。[`04-permission-mediation.md`](./04-permission-mediation.md) を参照してください。                                                                                                                                                                        |
| `context.fileName`          | string                                                             | `BridgeOptions.contextFilename` を通じて `getCurrentGeminiMdFilename()` をオーバーライドします。                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `tools.disabled`            | string[]                                                           | 次のACP子プロセス生成時に無効化されるツール。`normalizeDisabledToolList()` (`packages/cli/src/config/normalizeDisabledTools.ts`) を通じて正規化されます。配列以外は `[]` になり、非文字列エントリはスキップされ、空白はトリミングされ、空のエントリは削除され、重複は最初の出現を保持して削除されます。起動時と `restartMcpServer` 設定の更新の両方でこの関数が実行されます。`ToolRegistry.has(name)` は完全一致かつ大文字小文字を区別します。`POST /workspace/tools/:name/enable` と `tool_toggled` はこのキーを更新します。 |
| `tools.approvalMode`        | `'default' \| 'auto' \| ...`                                       | デフォルトのセッション承認モード。`persist: true` の場合、`POST /session/:id/approval-mode` がここに書き込みます。                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `telemetry`                 | object                                                             | OTel設定。キーには `enabled`、`otlpEndpoint`、`otlpProtocol`、`otlpTracesEndpoint`、`otlpLogsEndpoint`、`otlpMetricsEndpoint`、`target`、`outfile`、`includeSensitiveSpanAttributes`、`sensitiveSpanAttributeMaxLength`、`resourceAttributes`、および `metrics.includeSessionId` が含まれます。`resolveTelemetrySettings()` が起動時にこれを読み取り、`initializeTelemetry()` を初期化します。                                                                                                                                                             |

## `ServeOptions`（プログラムによる組み込み）

`packages/cli/src/serve/types.ts` は、`runQwenServe` と `createServeApp` の両方で受け入れられる型付きオプションオブジェクトを定義します。これは上記のCLIフラグを反映し、以下を追加します。

| フィールド                         | 効果                                                                                        |
| ----------------------------- | --------------------------------------------------------------------------------------------- |
| `eventRingSize`               | デフォルトのセッションごとのリングサイズをオーバーライドします。                                                  |
| `maxPendingPromptsPerSession` | セッションごとの保留中プロンプトの上限。`0` / `Infinity` は無制限を意味します。                             |
| `mcpPoolActive`               | プログラムによるスイッチ。デフォルトは `QWEN_SERVE_NO_MCP_POOL` から取得されます。                                |
| `allowOrigins`                | クロスオリジン許可リスト（`string[]`）。`--allow-origin` に対応します。                       |
| `allowPrivateAuthBaseUrl`     | プライベート / localhost 認証プロバイダーの `baseUrl` のインストールを許可します。                              |
| `enableSessionShell`          | セッションシェル実行を有効にします。ベアラートークンとセッションにバインドされたクライアントIDは引き続き必要です。 |
| `promptDeadlineMs`            | プロンプトの実時間制限。                                                                       |
| `writerIdleTimeoutMs`         | SSEライターアイドルタイムアウト。                                                                      |
| `channelIdleTimeoutMs`        | 最後のセッションが閉じられた後、ACP子プロセスをウォーム状態に保つ時間。                            |
| `sessionReapIntervalMs`       | セッションリーパーのスキャン間隔。                                                                 |
| `sessionIdleTimeoutMs`        | 切断されたセッションのアイドル時の回収時間。                                                       |
| `rateLimit*`                  | 階層ごとのHTTPレート制限スイッチ、しきい値、およびウィンドウ。                                      |
## `BridgeOptions`（プログラムによるブリッジの埋め込み）

`packages/acp-bridge/src/bridgeOptions.ts` はブリッジオプションを定義します。完全なテーブルについては [`03-acp-bridge.md`](./03-acp-bridge.md) を参照してください。主なフィールドは以下の通りです。

| Field                                                                                                                   | Effect                                                                                        |
| ----------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `boundWorkspace`                                                                                                        | 必須の正規ワークスペース。                                                                    |
| `sessionScope`                                                                                                          | `'single'`（デフォルト）または `'thread'`。                                                   |
| `initializeTimeoutMs`, `maxSessions`, `eventRingSize`, `permissionResponseTimeoutMs`, `maxPendingPermissionsPerSession` | リソース上限のバインド。                                                                      |
| `channelFactory`                                                                                                        | プラグイン可能な ACP 子プロセスファクトリ。デフォルトは `defaultSpawnChannelFactory`。        |
| `fileSystem`                                                                                                            | `BridgeFileSystem` アダプタ。[`07-workspace-filesystem.md`](./07-workspace-filesystem.md) を参照。 |
| `permissionPolicy`, `permissionConsensusQuorum`, `permissionAudit`                                                      | メディエーターの関連付け。                                                                    |
| `statusProvider`                                                                                                        | デーモンホストのプレフライトセル。                                                            |
| `childEnvOverrides`                                                                                                     | ハンドルごとの環境変数の追加または削除。                                                      |
| `contextFilename`                                                                                                       | `getCurrentGeminiMdFilename()` をオーバーライドします。                                       |
| `channelIdleTimeoutMs`                                                                                                  | 最後のセッションが閉じた後に ACP 子プロセスを存続させる時間（ミリ秒）。デフォルトは `0`。     |

## 重要なデフォルト値

| Constant                          | File                    | Value             | Meaning                                                           |
| --------------------------------- | ----------------------- | ----------------- | ----------------------------------------------------------------- |
| `DEFAULT_MAX_SESSIONS`            | `bridge.ts`             | `20`              | `SessionLimitExceededError` が発生するまでのセッション上限。      |
| `MAX_EVENT_RING_SIZE`             | `bridge.ts`             | `1_000_000`       | `BridgeOptions.eventRingSize` のソフトキャップ。タイプミスに対するガード。 |
| `DEFAULT_RING_SIZE`               | `eventBus.ts`           | `8000`            | セッションごとの SSE リプレイリングの深さ。                       |
| `DEFAULT_MAX_QUEUED`              | `eventBus.ts`           | `256`             | サブスクライバーごとのキュー上限。                                |
| `DEFAULT_MAX_SUBSCRIBERS`         | `eventBus.ts`           | `64`              | バスごとのサブスクライバー上限。                                  |
| `WARN_THRESHOLD_RATIO`            | `eventBus.ts`           | `0.75`            | `slow_client_warning` のトリガー。                                |
| `WARN_RESET_RATIO`                | `eventBus.ts`           | `0.375`           | ヒステリシスの再設定しきい値。                                    |
| `DEFAULT_INIT_TIMEOUT_MS`         | `bridge.ts`             | `10_000`          | ACP `initialize` ハンドシェイクのタイムアウト。                   |
| `MCP_RESTART_TIMEOUT_MS`          | `bridge.ts`             | `300_000`         | `/workspace/mcp/:server/restart` のブリッジタイムアウト。         |
| `DEFAULT_PERMISSION_TIMEOUT_MS`   | `bridge.ts`             | `5 * 60_000`      | 権限リクエストごとのタイムアウト時間。                            |
| `DEFAULT_MAX_PENDING_PER_SESSION` | `bridge.ts`             | `64`              | `DEFAULT_MAX_SUBSCRIBERS` に整合。                                |
| `MAX_RESOLVED_PERMISSION_RECORDS` | `permissionMediator.ts` | `512`             | 最近解決された権限の FIFO キュー。                                |
| `KILL_HARD_DEADLINE_MS`           | `spawnChannel.ts`       | `10_000`          | チャネルごとのグレースフルシャットダウンのウィンドウ。            |
| `SHUTDOWN_FORCE_CLOSE_MS`         | `run-qwen-serve.ts`     | `5_000`           | HTTP サーバーの強制クローズタイマー。                             |
| `MAX_READ_BYTES`                  | `fs/policy.ts`          | `256 * 1024`      | 読み取り上限。                                                    |
| `MAX_WRITE_BYTES`                 | `fs/policy.ts`          | `5 * 1024 * 1024` | 書き込み上限。                                                    |
| `MAX_DISPLAY_NAME_LENGTH`         | `bridge.ts`             | `256`             | セッションの `displayName` の上限。                               |

## 相互参照

- 認証設定: [`12-auth-security.md`](./12-auth-security.md)
- 機能とプロトコルバージョン: [`11-capabilities-versioning.md`](./11-capabilities-versioning.md)
- イベントリングとバックプレッシャーのチューニング: [`10-event-bus.md`](./10-event-bus.md)
- MCP プール / バジェット: [`05-mcp-transport-pool.md`](./05-mcp-transport-pool.md) および [`06-mcp-budget-guardrails.md`](./06-mcp-budget-guardrails.md)
- 権限ポリシー: [`04-permission-mediation.md`](./04-permission-mediation.md)
- ユーザー操作ガイド: [`../../users/qwen-serve.md`](../../users/qwen-serve.md)