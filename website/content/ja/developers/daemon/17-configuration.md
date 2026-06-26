# 設定リファレンス

## 概要

このページでは、`qwen serve` デーモンとそのアダプターに影響を与えるすべての設定（環境変数、CLIフラグ、`settings.json` のキー、プログラムオプション）をまとめています。機能固有のページは、横断的な設定の詳細が必要な場合にここにリンクします。

## CLIフラグ (`qwen serve`)

| フラグ                                   | 型                         | デフォルト                                     | 効果                                                                                                                                                                                |
| ---------------------------------------- | -------------------------- | ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--hostname <host>`                      | 文字列                     | `127.0.0.1`                                    | バインドアドレス。ループバック値: `127.0.0.1`、`localhost`、`::1`、`[::1]`。非ループバックの場合は起動時にベアラートークンが必要です。`host:port` の入力は拒否され、`--port` の使用が促されます。 |
| `--port <n>`                             | 数値                       | `4170`                                         | リッスンポート。`0` はエフェメラルポートを意味します。                                                                                                                                   |
| `--token <s>`                            | 文字列                     | env                                            | ベアラートークン。`QWEN_SERVER_TOKEN` を上書きし、起動時にトリミングされます。プロセスのコマンドラインに表示されるため、デプロイメントでは環境変数の使用を推奨します。                                                   |
| `--require-auth`                         | boolean                    | `false`                                        | ベアラー認証をループバックと `/health` に拡張します。トークンなしでは起動が拒否されます。                                                                                               |
| `--workspace <dir>`                      | 絶対パス                   | `process.cwd()`                                | バインドされたワークスペース。絶対パスであり、ディレクトリである必要があります。起動時に一度だけ正規化されます。                                                                                                      |
| `--max-sessions <n>`                     | 数値                       | `20`                                           | アクティブセッションの上限。`0` / `Infinity` は無制限を意味します。`NaN` / 負の値はエラーになります。                                                                                                |
| `--max-pending-prompts-per-session <n>`  | 数値                       | `5`                                            | セッションごとの、受理済みだが保留中/実行中のプロンプトの上限。超過したプロンプトは503を返します。`0` / `Infinity` は無制限を意味します。負の値や非整数はエラーになります。                             |
| `--max-connections <n>`                  | 数値                       | `256`                                          | HTTPリスナーの `server.maxConnections`。`0` / `Infinity` は無制限を意味します。                                                                                                            |
| `--enable-session-shell`                 | boolean                    | `false`                                        | `POST /session/:id/shell` の直接実行を有効にします。ベアラートークンが必要で、各呼び出しはセッションにバインドされた `X-Qwen-Client-Id` を保持する必要があります。                                            |
| `--event-ring-size <n>`                  | 数値                       | `8000`                                         | セッションごとのSSEリプレイリング。ソフトキャップは `1_000_000` です。                                                                                                                               |
| `--http-bridge`                          | boolean                    | `true`                                         | ステージ1のブリッジモード。`--no-http-bridge` でも http-bridge にフォールバックし、stderr に出力します。                                                                                       |
| `--mcp-client-budget <n>`                | 正の整数                   | 未設定                                         | `WorkspaceMcpBudget.clientBudget` を設定し、`childEnvOverrides` を通じてACP子プロセスに転送します。                                                                                |
| `--mcp-budget-mode <m>`                  | `off` / `warn` / `enforce` | バジェットが設定されている場合は `warn`、それ以外は `off` | `WorkspaceMcpBudget.mode` を設定します。`enforce` には `--mcp-client-budget` が必要です。                                                                                                           |
| `--allow-origin <pattern>`               | 繰り返し可能な文字列       | 未設定                                         | デフォルトのCORS拒否を置き換えるクロスオリジン許可リスト。`*` は任意のオリジンを許可しますが、トークンが必要です。                                                                           |
| `--allow-private-auth-base-url`          | boolean                    | `false`                                        | `/workspace/auth/provider` が localhost / プライベートネットワークの認証プロバイダー `baseUrl` をインストールすることを許可します。信頼できるローカル開発でのみ使用してください。                                            |
| `--prompt-deadline-ms <n>`               | 正の整数                   | 未設定                                         | サーバー側プロンプトのウォールクロック制限（ミリ秒）。タイムアウトにより中断され、エラーを返します。                                                                                                      |
| `--writer-idle-timeout-ms <n>`           | 正の整数                   | 未設定                                         | SSE接続ごとのアイドルタイムアウト（ミリ秒）。この期間イベントが送信されない場合、デーモンはSSE接続を閉じます。                                                                |
| `--channel-idle-timeout-ms <n>`          | 非負の整数                 | `0`                                            | 最後のセッションが閉じてからACP子プロセスを維持する時間。`0` は即座に解放することを意味します。                                                                                  |
| `--session-reap-interval-ms <n>`         | 非負の整数                 | `60000`                                        | セッション再利用スキャンの間隔。`0` で無効になります。                                                                                                                                      |
| `--session-idle-timeout-ms <n>`          | 非負の整数                 | `1800000`                                      | 切断されたセッションのアイドル再利用時間。`0` で無効になります。                                                                                                                            |
| `--rate-limit` / `--no-rate-limit`       | boolean                    | env / off                                      | プロンプト、ミューテーション、読み取りルートに対する階層別HTTPレート制限を有効にします。                                                                                                          |
| `--rate-limit-prompt <n>`                | 正の整数                   | `10`                                           | ウィンドウあたりのプロンプトリクエスト制限。レート制限が有効である必要があります。                                                                                                              |
| `--rate-limit-mutation <n>`              | 正の整数                   | `30`                                           | ウィンドウあたりのミューテーションリクエスト制限。レート制限が有効である必要があります。                                                                                                            |
| `--rate-limit-read <n>`                  | 正の整数                   | `120`                                          | ウィンドウあたりの読み取りリクエスト制限。レート制限が有効である必要があります。                                                                                                                |
| `--rate-limit-window-ms <n>`             | 整数 `>= 1000`            | `60000`                                        | レート制限ウィンドウの長さ。レート制限が有効である必要があります。                                                                                                                     |
| フラグなし                                | -                          | -                                              | `QWEN_SERVE_NO_MCP_POOL=1` でプールを完全に無効化します。                                                                                                                                |

## 環境変数

### `runQwenServe` / Expressミドルウェアで読み取られる

| Env                                 | 効果                                                                                                                                                                   |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `QWEN_SERVER_TOKEN`                 | ベアラートークン。起動時にトリミングされます。                                                                                                                                           |
| `QWEN_SERVE_DEBUG`                  | `1` / `true` / `on` / `yes` (大文字小文字を区別しない) で詳細なstderrログを有効にします。詳細は [`19-observability.md`](./19-observability.md) を参照。                                          |
| `QWEN_SERVE_NO_MCP_POOL`            | `1` でワークスペースMCPトランスポートプールを無効にし、セッションごとの `McpClientManager` にフォールバックします。機能は `mcp_workspace_pool` / `mcp_pool_restart` のアドバタイズを停止します。 |
| `QWEN_SERVE_PROMPT_DEADLINE_MS`     | `--prompt-deadline-ms` の環境変数フォールバック。                                                                                                                                 |
| `QWEN_SERVE_WRITER_IDLE_TIMEOUT_MS` | `--writer-idle-timeout-ms` の環境変数フォールバック。                                                                                                                             |
| `QWEN_SERVE_RATE_LIMIT`             | `1` / `true` で階層別HTTPレート制限を有効にします。CLIの `--rate-limit` / `--no-rate-limit` が優先されます。                                                                           |
| `QWEN_SERVE_RATE_LIMIT_PROMPT`      | `--rate-limit-prompt` の環境変数フォールバック。                                                                                                                                  |
| `QWEN_SERVE_RATE_LIMIT_MUTATION`    | `--rate-limit-mutation` の環境変数フォールバック。                                                                                                                                |
| `QWEN_SERVE_RATE_LIMIT_READ`        | `--rate-limit-read` の環境変数フォールバック。                                                                                                                                |
| `QWEN_SERVE_RATE_LIMIT_WINDOW_MS`   | `--rate-limit-window-ms` の環境変数フォールバック。                                                                                                                               |

### `BridgeOptions.childEnvOverrides` を通じてACP子プロセスに転送される

`runQwenServe` はハンドルごとにこれらを構築するため、同一プロセス内の2つのデーモンが `process.env` で競合することはありません。バジェット変数は `qwen serve` の親プロセス環境変数のフォールバックではありません。CLIパスは `--mcp-client-budget` / `--mcp-budget-mode` からこれらを生成する必要があります。

| Env                              | 効果                                                                                                                   |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `QWEN_SERVE_MCP_CLIENT_BUDGET`   | ACP子プロセスの `readBudgetFromEnv()` で消費される正の整数の文字列。                                               |
| `QWEN_SERVE_MCP_BUDGET_MODE`     | `off` / `warn` / `enforce`。                                                                                              |
| `QWEN_SERVE_MCP_POOL_TRANSPORTS` | カンマ区切りのトランスポート許可リスト。デフォルトのプール対象トランスポートは `stdio,websocket`。`http,sse` を明示的に含めることができます。 |
| `QWEN_SERVE_MCP_POOL_DRAIN_MS`   | プールエントリのアイドル排出遅延。デフォルト `30000`、`1000..600000` ミリ秒にクランプされます。                                              |

### SDK / アダプターで読み取られる

| Env                     | 効果                                                            |
| ----------------------- | ----------------------------------------------------------------- |
| `QWEN_DAEMON_URL`       | CLI TUIアダプター、チャンネル、IDEコンパニオンのデーモンベースURL。 |
| `QWEN_DAEMON_TOKEN`     | ベアラートークン。                                                     |
| `QWEN_DAEMON_WORKSPACE` | `POST /session` に送信される `cwd` を上書きします。                      |

## `settings.json` のキー

デーモンは起動時に `runQwenServe` 内の `loadSettings(boundWorkspace)` を通じて設定を一度読み取ります。不正な設定は try/catch ガードによりデフォルト値にフォールバックします。

| キー                          | 型                                                               | 効果                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| ---------------------------- | ------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `policy.permissionStrategy`  | `'first-responder' \| 'designated' \| 'consensus' \| 'local-only'` | `BridgeOptions.permissionPolicy` を設定します。アクティブな値は `/capabilities` に `policy.permission` として表示されます。**起動時に** `validatePolicyConfig()` により `SERVE_CAPABILITY_REGISTRY.permission_mediation.modes` に対して検証されます。未知のリテラルは `InvalidPolicyConfigError` をスローし、起動を明示的に失敗させます。                                                                                                                                                                                               |
| `policy.consensusQuorum`     | 正の整数                                                           | `consensus` ポリシーのN値。**デフォルト**は `votersAtIssue.size` に対する `floor(M/2) + 1` (M=2 の場合は全会一致、より大きい偶数のMは過半数を意味します)。非 consensus ポリシーで設定された場合は無視され、起動時にstderrに警告が出力されます。非正の整数は `InvalidPolicyConfigError` をスローします。詳細は [`04-permission-mediation.md`](./04-permission-mediation.md) を参照。                                                                                                                                                                        |
| `context.fileName`           | 文字列                                                             | `BridgeOptions.contextFilename` を通じて `getCurrentGeminiMdFilename()` を上書きします。                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `tools.disabled`             | 文字列[]                                                           | 次のACP子プロセス生成時に無効化されるツール。`normalizeDisabledToolList()` (`packages/cli/src/config/normalizeDisabledTools.ts`) により正規化されます。非配列は `[]` に、非文字列エントリはスキップ、空白はトリミング、空エントリは削除、重複は最初の出現を残して削除されます。起動時および `restartMcpServer` の設定更新は両方ともこの関数を通過します。`ToolRegistry.has(name)` は完全一致で大文字小文字を区別します。`POST /workspace/tools/:name/enable` および `tool_toggled` はこのキーを更新します。 |
| `tools.approvalMode`         | `'default' \| 'auto' \| ...`                                       | デフォルトのセッション承認モード。`persist: true` の場合、`POST /session/:id/approval-mode` はここに書き込みます。                                                                                                                                                                                                                                                                                                                                                                                                               |
| `telemetry`                  | オブジェクト                                                         | OTel設定。キーには `enabled`、`otlpEndpoint`、`otlpProtocol`、`otlpTracesEndpoint`、`otlpLogsEndpoint`、`otlpMetricsEndpoint`、`target`、`outfile`、`includeSensitiveSpanAttributes`、`sensitiveSpanAttributeMaxLength`、`resourceAttributes`、`metrics.includeSessionId` が含まれます。`resolveTelemetrySettings()` が起動時にこれを読み取り、`initializeTelemetry()` を初期化します。                                                                                                                                                             |

## `ServeOptions` (プログラムによる埋め込み)

`packages/cli/src/serve/types.ts` は、`runQwenServe` と `createServeApp` の両方で受け入れられる型付きオプションオブジェクトを定義しています。上記のCLIフラグをミラーリングし、さらに以下の項目を追加します:

| フィールド                       | 効果                                                                                        |
| ----------------------------- | --------------------------------------------------------------------------------------------- |
| `eventRingSize`               | デフォルトのセッションごとのリングサイズを上書きします。                                                  |
| `maxPendingPromptsPerSession` | セッションごとの保留中プロンプト上限。`0` / `Infinity` は無制限。                             |
| `mcpPoolActive`               | プログラムによるスイッチ。デフォルトは `QWEN_SERVE_NO_MCP_POOL` に従います。                                |
| `allowOrigins`                | クロスオリジン許可リスト (`string[]`)。`--allow-origin` に対応します。                       |
| `allowPrivateAuthBaseUrl`     | プライベート / localhost の認証プロバイダー `baseUrl` のインストールを許可します。                              |
| `enableSessionShell`          | セッションシェルの実行を有効にします。ベアラートークンとセッションにバインドされたクライアントIDは依然として必要です。 |
| `promptDeadlineMs`            | プロンプトのウォールクロック制限。                                                                       |
| `writerIdleTimeoutMs`         | SSEライターのアイドルタイムアウト。                                                                      |
| `channelIdleTimeoutMs`        | 最後のセッションが閉じてからACP子プロセスを維持する時間。                            |
| `sessionReapIntervalMs`       | セッション再利用スキャンの間隔。                                                                 |
| `sessionIdleTimeoutMs`        | 切断されたセッションのアイドル再利用時間。                                                       |
| `rateLimit*`                  | 階層別HTTPレート制限のスイッチ、しきい値、ウィンドウ。                                      |
## `BridgeOptions`（プログラムによるブリッジの埋め込み）

`packages/acp-bridge/src/bridgeOptions.ts` はブリッジオプションを定義します。完全なテーブルは [`03-acp-bridge.md`](./03-acp-bridge.md) を参照してください。主なフィールド:

| フィールド                                                                                                             | 効果                                                                                          |
| ----------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `boundWorkspace`                                                                                                        | 必須の正規ワークスペース。                                                                 |
| `sessionScope`                                                                                                          | `'single'`（デフォルト）と `'thread'` の比較。                                                           |
| `initializeTimeoutMs`, `maxSessions`, `eventRingSize`, `permissionResponseTimeoutMs`, `maxPendingPermissionsPerSession` | リソース上限の制限。                                                                        |
| `channelFactory`                                                                                                        | プラグイン可能なACP子ファクトリー。デフォルトは `defaultSpawnChannelFactory`。                         |
| `fileSystem`                                                                                                            | `BridgeFileSystem` アダプター。詳細は [`07-workspace-filesystem.md`](./07-workspace-filesystem.md) を参照。 |
| `permissionPolicy`, `permissionConsensusQuorum`, `permissionAudit`                                                      | メディエーターの配線。                                                                              |
| `statusProvider`                                                                                                        | デーモンホストのプリフライトセル。                                                                  |
| `childEnvOverrides`                                                                                                     | ハンドルごとの環境変数の追加または削除。                                                 |
| `contextFilename`                                                                                                       | `getCurrentGeminiMdFilename()` をオーバーライド。                                                     |
| `channelIdleTimeoutMs`                                                                                                  | 最後のセッションが閉じた後にACP子プロセスを維持する時間（ミリ秒）。デフォルトは `0`。       |

## 重要なデフォルト値

| 定数                          | ファイル                    | 値             | 意味                                                           |
| --------------------------------- | ----------------------- | ----------------- | ----------------------------------------------------------------- |
| `DEFAULT_MAX_SESSIONS`            | `bridge.ts`             | `20`              | `SessionLimitExceededError` が発生するまでのセッション上限。                   |
| `MAX_EVENT_RING_SIZE`             | `bridge.ts`             | `1_000_000`       | `BridgeOptions.eventRingSize` のソフトキャップ。タイプミス防止。 |
| `DEFAULT_RING_SIZE`               | `eventBus.ts`           | `8000`            | セッションごとのSSEリプレイリングの深さ。                                |
| `DEFAULT_MAX_QUEUED`              | `eventBus.ts`           | `256`             | サブスクライバーごとのキュー上限。                                         |
| `DEFAULT_MAX_SUBSCRIBERS`         | `eventBus.ts`           | `64`              | バスごとのサブスクライバー上限。                                           |
| `WARN_THRESHOLD_RATIO`            | `eventBus.ts`           | `0.75`            | `slow_client_warning` のトリガー。                                    |
| `WARN_RESET_RATIO`                | `eventBus.ts`           | `0.375`           | ヒステリシス再アームのしきい値。                                      |
| `DEFAULT_INIT_TIMEOUT_MS`         | `bridge.ts`             | `10_000`          | ACP `initialize` ハンドシェイクのタイムアウト。                               |
| `MCP_RESTART_TIMEOUT_MS`          | `bridge.ts`             | `300_000`         | `/workspace/mcp/:server/restart` のブリッジタイムアウト。              |
| `DEFAULT_PERMISSION_TIMEOUT_MS`   | `bridge.ts`             | `5 * 60_000`      | 許可リクエストごとのウォールクロックタイムアウト。                                 |
| `DEFAULT_MAX_PENDING_PER_SESSION` | `bridge.ts`             | `64`              | `DEFAULT_MAX_SUBSCRIBERS` と一致。                           |
| `MAX_RESOLVED_PERMISSION_RECORDS` | `permissionMediator.ts` | `512`             | 最近解決された許可のFIFOキュー。                           |
| `KILL_HARD_DEADLINE_MS`           | `spawnChannel.ts`       | `10_000`          | チャンネルごとのグレースフルシャットダウンウィンドウ。                             |
| `SHUTDOWN_FORCE_CLOSE_MS`         | `run-qwen-serve.ts`       | `5_000`           | HTTPサーバーの強制終了タイマー。                                    |
| `MAX_READ_BYTES`                  | `fs/policy.ts`          | `256 * 1024`      | 読み取り上限。                                                         |
| `MAX_WRITE_BYTES`                 | `fs/policy.ts`          | `5 * 1024 * 1024` | 書き込み上限。                                                        |
| `MAX_DISPLAY_NAME_LENGTH`         | `bridge.ts`             | `256`             | セッションの `displayName` 上限。                                        |

## 相互参照

- 認証設定: [`12-auth-security.md`](./12-auth-security.md)
- 機能とプロトコルバージョン: [`11-capabilities-versioning.md`](./11-capabilities-versioning.md)
- イベントリングとバックプレッシャーチューニング: [`10-event-bus.md`](./10-event-bus.md)
- MCPプール/バジェット: [`05-mcp-transport-pool.md`](./05-mcp-transport-pool.md) および [`06-mcp-budget-guardrails.md`](./06-mcp-budget-guardrails.md)
- 許可ポリシー: [`04-permission-mediation.md`](./04-permission-mediation.md)
- ユーザー操作ガイド: [`../../users/qwen-serve.md`](../../users/qwen-serve.md)