---

# 設定リファレンス

## 概要

このページでは、`qwen serve` デーモンとそのアダプターに影響を与えるすべての設定（環境変数、CLIフラグ、`settings.json` のキー、プログラムからのオプション）をまとめています。機能固有のページでは、横断的な設定の詳細が必要な場合にここへリンクしています。

## CLIフラグ（`qwen serve`）

| フラグ                                    | 型                         | デフォルト                                                                           | 効果                                                                                                                                                                                                                    |
| --------------------------------------- | ---------------------------- | --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--hostname <host>`                     | string                       | `127.0.0.1`                                                                       | バインドアドレス。ループバック値: `127.0.0.1`、`localhost`、`::1`、`[::1]`。ループバック以外の場合、起動時にベアラートークンが必要です。`host:port` 形式の入力は拒否され、`--port` の使用が案内されます。                                       |
| `--port <n>`                            | number                       | `4170`                                                                            | リッスンポート。`0` はエフェメラルポートを意味します。                                                                                                                                                                                         |
| `--token <s>`                           | string                       | env                                                                               | ベアラートークン。`QWEN_SERVER_TOKEN` をオーバーライドし、起動時にトリミングされます。プロセスのコマンドラインに表示されるため、デプロイ時には環境変数の使用を推奨します。                                                                                 |
| `--require-auth`                        | boolean                      | `false`                                                                           | ベアラ認証をループバックおよび `/health` に拡張します。トークンなしでは起動が拒否されます。                                                                                                                                     |
| `--workspace <dir>`                     | absolute path / repeatable   | `process.cwd()`                                                                   | 起動時のワークスペースランタイム。繰り返して追加の分離されたランタイムを登録できます。最初がプライマリです。すべての値は絶対パスかつディレクトリである必要があります。起動時に正規化されます。                                                    |
| `--memory-project-scope <mode>`         | `git-root` / `workspace`     | `git-root`                                                                        | プロジェクトメモリのパーティション。`git-root` は同じ Git ルートにあるワークスペース間でメモリを共有します。`workspace` は正確なワークスペースディレクトリごとに分離します。`QWEN_CODE_MEMORY_PROJECT_SCOPE` をオーバーライドします。                               |
| `--max-sessions <n>`                    | number                       | `32`                                                                              | ワークスペースごとのアクティブセッション上限。`0` / `Infinity` は無制限を意味します。`NaN` / 負の値はエラーをスローします。                                                                                                                        |
| `--max-total-sessions <n>`              | number                       | 複数の起動時/復元ワークスペース用に導出                                  | デーモン全体のアクティブセッション上限。省略時、ワークスペースごとの上限と起動時/復元ワークスペース数から有限のデフォルト値が 1 回だけ導出されます。`0` / `Infinity` は無制限を意味します。                                         |
| `--max-pending-prompts-per-session <n>` | number                       | `5`                                                                               | セッションごとに受け入れられたが保留中または実行中のプロンプトの上限。超過したプロンプトは 503 を返します。`0` / `Infinity` は無制限を意味します。負の値または非整数値はエラーをスローします。                             |
| `--max-connections <n>`                 | number                       | `256`                                                                             | HTTPリスナーの `server.maxConnections`。`0` / `Infinity` は無制限を意味します。                                                                                                            |
| `--enable-session-shell`                | boolean                      | `false`                                                                           | `POST /session/:id/shell` の直接実行を有効にします。ベアラートークンが必要であり、すべての呼び出しにセッションにバインドされた `X-Qwen-Client-Id` を含める必要があります。                                            |
| `--event-ring-size <n>`                 | number                       | `8000`                                                                            | セッションごとのSSEリプレイリング。ソフトキャップは `1_000_000` です。                                                                                                                                                                     |
| `--compacted-replay-max-bytes <n>`      | positive integer             | `4194304`                                                                         | `POST /session/:id/load` が返す有界インメモリリプレイスナップショットのバイト上限。ハードキャップは `268435456` です。                                                                                                         |
| `--memory-budget-mb <n>`                | integer in `[1024, 1048576]` | cgroup 制約またはホストメモリの 50%、フラグの最大値（1048576 MB）を上限 | デーモンプロセスツリーの合計メモリ予算。解決された利用可能メモリの上限でキャップされます。デーモンステータスの `limits.memory` で観測・報告されます。子プロセスのサイズ決定には使用されません。起動時は範囲外の値を拒否します。 |
| `--memory-pressure-mode <mode>`         | `off` \| `observe`           | `observe`                                                                         | デーモンが自身の RSS と V8 ヒープからメモリプレッシャーレベルを導出するかどうか。両モードとも `runtime.memory.pressure` を報告します。`observe` のみ `daemon_memory_pressure` を発生させます。ルートプロセスのみ。是正措置はありません。                               |
| `--child-heap-mode <mode>`              | `off` \| `observe`           | `observe`                                                                         | デーモンが予算の子ごとのヒープパーティションをモデル化するかどうか。`observe` はそれを報告し、それを超えたスポーンをカウントします。何も適用されません。`off` はパーティションを一切公開しません。`maxConcurrentChildren` と `perChildCeilingMb` は両方とも `null` になります。 |
| `--http-bridge`                         | boolean                      | `true`                                                                            | ステージ1ブリッジモード。`--no-http-bridge` でも http-bridge にフォールバックし、stderrに出力します。                                                                                       |
| `--mcp-client-budget <n>`               | positive integer             | unset                                                                             | `WorkspaceMcpBudget.clientBudget` を設定し、`childEnvOverrides` を通じてACP子プロセスに転送します。                                                                                                                      |
| `--mcp-budget-mode <m>`                 | `off` / `warn` / `enforce`   | `warn` when budget is set, otherwise `off`                                        | `WorkspaceMcpBudget.mode` を設定します。`enforce` には `--mcp-client-budget` が必要です。                                                                                                           |
| `--external-tool-guard-mode <m>`        | `off` / `required`           | `off`                                                                             | 管理された ACP 外部の事前実行ガードを有効にします。`required` は、ループバックプロバイダーが v1 ハンドシェイクを完了しない限り起動を失敗します。                                                                                   |
| `--external-tool-guard-endpoint <url>`  | loopback HTTP(S) origin      | unset                                                                             | `required` モードでのみ使用されるプロバイダーオリジン。オリジンのみで、`127.0.0.1`、`localhost`、または `::1` を使用する必要があります。パス、資格情報、リダイレクト、プロキシルーティングは拒否されます。                                           |
| `--external-tool-guard-timeout-ms <n>`  | integer `100..30000`         | `3000`                                                                            | ハンドシェイクおよび prepare ごとのデッドライン。タイムアウトはハンドシェイク中は起動を失敗させ、ターン中は呼び出しを fail closed します。                                                                                        |
| `--allow-origin <pattern>`              | repeatable string            | unset                                                                             | デフォルトのCORS拒否を置き換えるクロスオリジン許可リスト。`*` は任意のオリジンを許可しますが、トークンが必要です。                                                                           |
| `--allow-private-auth-base-url`         | boolean                      | `false`                                                                           | `/workspace/auth/provider` による localhost / プライベートネットワーク認証プロバイダーの `baseUrl` のインストールを許可します。信頼されたローカル開発環境でのみ使用してください。                                            |
| `--prompt-deadline-ms <n>`              | positive integer             | unset                                                                             | サーバー側のプロンプトの実時間制限（ミリ秒）。タイムアウトすると中止され、エラーが返されます。                                                                                                      |
| `--writer-idle-timeout-ms <n>`          | positive integer             | unset                                                                             | SSE接続ごとのアイドルタイムアウト（ミリ秒）。この時間イベントが送信されない場合、デーモンはSSE接続を閉じます。                                                                |
| `--channel-idle-timeout-ms <n>`         | non-negative integer         | `0`                                                                               | 最後のセッションが閉じられた後、ACP子プロセスを存続させる時間。`0` は即座に回収することを意味します。                                                                                  |
| `--initialize-timeout-ms <n>`           | positive integer             | `10000`                                                                           | ACP子プロセスのリクエストタイムアウト。initialize ハンドシェイクを含みます（ミリ秒）。                                                                                                                                                       |
| `--session-reap-interval-ms <n>`        | non-negative integer         | `60000`                                                                           | セッションリーパーのスキャン間隔。`0` で無効になります。                                                                                                                                      |
| `--session-idle-timeout-ms <n>`         | non-negative integer         | `1800000`                                                                         | 切断されたセッションのアイドル時の回収時間。`0` で無効になります。                                                                                                                            |
| `--rate-limit` / `--no-rate-limit`      | boolean                      | env / off                                                                         | プロンプト、ミューテーション、および読み取りルートに対する階層ごとのHTTPレート制限を有効にします。                                                                                                          |
| `--rate-limit-prompt <n>`               | positive integer             | `10`                                                                              | ウィンドウごとのプロンプトリクエスト制限。レート制限が有効である必要があります。                                                                                                              |
| `--rate-limit-mutation <n>`             | positive integer             | `30`                                                                              | ウィンドウごとのミューテーションリクエスト制限。レート制限が有効である必要があります。                                                                                                            |
| `--rate-limit-read <n>`                 | positive integer             | `120`                                                                             | ウィンドウごとの読み取りリクエスト制限。レート制限が有効である必要があります。                                                                                                                |
| `--rate-limit-window-ms <n>`            | integer `>= 1000`            | `60000`                                                                           | レート制限ウィンドウの長さ。レート制限が有効である必要があります。                                                                                                                     |
| フラグなし                                 | -                          | -                                                                                 | `QWEN_SERVE_NO_MCP_POOL=1` はプールを完全に無効にします。                                                                                                                                 |

## 環境変数

### `runQwenServe` / Expressミドルウェアによって読み込まれる変数

| 環境変数                                 | 効果                                                                                                                                                                                                                                                                                                                                                                                       |
| ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `QWEN_SERVER_TOKEN`                 | ベアラートークン。起動時にトリミングされます。                                                                                                                                                                                                                                                                                                                                                               |
| `QWEN_SERVE_DEBUG`                  | `1` / `true` / `on` / `yes`（大文字小文字を区別しない）で詳細なstderrログを有効にします。[`19-observability.md`](./19-observability.md) を参照してください。                                                                                                                                                                                                                                                              |
| `QWEN_SERVE_NO_MCP_POOL`            | `1` でワークスペースMCPトランスポートプールを無効にし、セッションごとの `McpClientManager` にフォールバックします。capabilitiesは `mcp_workspace_pool` / `mcp_pool_restart` を公開しなくなります。                                                                                                                                                                                                                     |
| `QWEN_SERVE_PROMPT_DEADLINE_MS`     | `--prompt-deadline-ms` の環境変数フォールバック。                                                                                                                                                                                                                                                                                                                                                     |
| `QWEN_SERVE_WRITER_IDLE_TIMEOUT_MS` | `--writer-idle-timeout-ms` の環境変数フォールバック。                                                                                                                                                                                                                                                                                                                                                 |
| `QWEN_SERVE_RATE_LIMIT`             | `1` / `true` で階層ごとのHTTPレート制限を有効にします。CLIの `--rate-limit` / `--no-rate-limit` が優先されます。                                                                                                                                                                                                                                                                                               |
| `QWEN_SERVE_RATE_LIMIT_PROMPT`      | `--rate-limit-prompt` の環境変数フォールバック。                                                                                                                                                                                                                                                                                                                                                      |
| `QWEN_SERVE_RATE_LIMIT_MUTATION`    | `--rate-limit-mutation` の環境変数フォールバック。                                                                                                                                                                                                                                                                                                                                                    |
| `QWEN_SERVE_RATE_LIMIT_READ`        | `--rate-limit-read` の環境変数フォールバック。                                                                                                                                                                                                                                                                                                                                                        |
| `QWEN_SERVE_RATE_LIMIT_WINDOW_MS`   | `--rate-limit-window-ms` の環境変数フォールバック。                                                                                                                                                                                                                                                                                                                                                   |
| `QWEN_CODE_MEMORY_PROJECT_SCOPE`    | `workspace` はプロジェクトメモリを正確なワークスペースディレクトリごとにキー付けします。他の値は `git-root` スコープを保持します（認識されない値は 1 回だけ警告します）。`childEnvOverrides` ではなくランタイムベース環境経由で伝播します。`--memory-project-scope` が優先されます。各ワークスペースの remember/forget/dream レーンは保留中タスクを `MAX_PENDING = 16` にキャップします。N ワークスペースでは最大 16·N のキューイングされたタスクを許可し、デーモン全体のキャップはありません。 |

### `qwen serve` CLIラッパーによって読み込まれる変数

| 環境変数                                   | 効果                                                                                                                                                                                                                                                                                                                      |
| ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `QWEN_CODE_EXTERNAL_TOOL_GUARD_TOKEN` | 制御文字を含まない最大 8192 UTF-16 コード単位のプロビジョニングされたベアラートークン。`required` モードでのみ `ServeOptions.externalToolGuard` にコピーされます。CLI はランタイム環境が凍結される前にアンビエント値を削除します。ACP 子プロセス、チャネルワーカー、および実行環境も防御的にスクラブします。 |

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

デーモンは、各ワークスペースのランタイムをそのワークスペースのマージされた設定と環境オーバーレイから構築します。プロセス全体のリスナー/認証オプションは 1 回だけ解決され、ランタイム固有のサービスと ACP 子プロセスは所有ランタイムのスナップショットを受け取ります。不正な形式の設定は、影響を受けるランタイムに対して文書化された起動フォールバックまたは失敗動作に従います。別のワークスペースの設定が再利用される原因となってはなりません。

| キー                         | 型                                                               | 効果                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| --------------------------- | ------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `policy.permissionStrategy` | `'first-responder' \| 'designated' \| 'consensus' \| 'local-only'` | `BridgeOptions.permissionPolicy` を設定します。有効な値は `policy.permission` として `/capabilities` に表示されます。**起動時**に `validatePolicyConfig()` を通じて `SERVE_CAPABILITY_REGISTRY.permission_mediation.modes` に対して**検証**されます。不明なリテラルは `InvalidPolicyConfigError` をスローし、起動を明示的に失敗させます。                                                                                                                                                                                                                               |
| `policy.consensusQuorum`    | positive integer                                                   | `consensus` ポリシーの N。**デフォルト**は `votersAtIssue.size` に対する `floor(M/2) + 1` です（M=2 は全会一致、より大きな偶数 M は過半数を意味します）。consensus 以外のポリシーで設定された場合は無視され、起動時にstderrに警告が出力されます。正でない整数は `InvalidPolicyConfigError` をスローします。[`04-permission-mediation.md`](./04-permission-mediation.md) を参照してください。                                                                                                                                                                        |
| `context.fileName`          | string                                                             | `BridgeOptions.contextFilename` を通じて `getCurrentGeminiMdFilename()` をオーバーライドします。                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `tools.disabled`            | string[]                                                           | 次のACP子プロセス生成時に無効化されるツール。`normalizeDisabledToolList()` (`packages/cli/src/config/normalizeDisabledTools.ts`) を通じて正規化されます。配列以外は `[]` になり、非文字列エントリはスキップされ、空白はトリミングされ、空のエントリは削除され、重複は最初の出現を保持して削除されます。起動時と `restartMcpServer` 設定の更新の両方でこの関数が実行されます。`ToolRegistry.has(name)` は完全一致かつ大文字小文字を区別します。`POST /workspace/tools/:name/enable` と `tool_toggled` はこのキーを更新します。 |
| `tools.approvalMode`        | `'default' \| 'auto' \| ...`                                       | デフォルトのセッション承認モード。`persist: true` の場合、`POST /session/:id/approval-mode` がここに書き込みます。                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `telemetry`                 | object                                                             | OTel設定。キーには `enabled`、`otlpEndpoint`、`otlpProtocol`、`otlpTracesEndpoint`、`otlpLogsEndpoint`、`otlpMetricsEndpoint`、`target`、`outfile`、`userId`、`includeSensitiveSpanAttributes`、`sensitiveSpanAttributeMaxLength`、`resourceAttributes`、および `metrics.includeSessionId` が含まれます。`resolveTelemetrySettings()` が起動時にこれを読み取り、`initializeTelemetry()` を初期化します。`userId` はプロセス全体であり、デーモンが複数のユーザーにサービスを提供する場合にエンドユーザー ID として設定してはなりません。                                                                                                                                                             |

## `ServeOptions`（プログラムによる組み込み）

`packages/cli/src/serve/types.ts` は、`runQwenServe` と `createServeApp` の両方で受け入れられる型付きオプションオブジェクトを定義します。これは上記のCLIフラグを反映し、以下を追加します。

| フィールド                         | 効果                                                                                        |
| ----------------------------- | --------------------------------------------------------------------------------------------- |
| `eventRingSize`               | デフォルトのセッションごとのリングサイズをオーバーライドします。                                                  |
| `memoryProjectScope`          | `'git-root' \| 'workspace'` プロジェクトメモリのパーティション。`QWEN_CODE_MEMORY_PROJECT_SCOPE` にフォールバックします。                          |
| `maxPendingPromptsPerSession` | セッションごとの保留中プロンプトの上限。`0` / `Infinity` は無制限を意味します。                             |
| `mcpPoolActive`               | プログラムによるスイッチ。デフォルトは `QWEN_SERVE_NO_MCP_POOL` から取得されます。                                |
| `externalToolGuard`           | オプションの `{mode:'required', endpoint, token, timeoutMs?}`。省略時は完全にオフ。required モードはリスニング前にプロバイダーハンドシェイクを実行します。 |
| `allowOrigins`                | クロスオリジン許可リスト（`string[]`）。`--allow-origin` に対応します。                       |
| `allowPrivateAuthBaseUrl`     | プライベート / localhost 認証プロバイダーの `baseUrl` のインストールを許可します。                              |
| `enableSessionShell`          | セッションシェル実行を有効にします。ベアラートークンとセッションにバインドされたクライアントIDは引き続き必要です。 |
| `promptDeadlineMs`            | プロンプトの実時間制限。                                                                       |
| `writerIdleTimeoutMs`         | SSEライターアイドルタイムアウト。                                                                      |
| `channelIdleTimeoutMs`        | 最後のセッションが閉じられた後、ACP子プロセスをウォーム状態に保つ時間。                            |
| `initializeTimeoutMs`         | ACP子プロセスのリクエストタイムアウト。initialize ハンドシェイクを含みます。                                                                                    |
| `sessionReapIntervalMs`       | セッションリーパーのスキャン間隔。                                                                 |
| `sessionIdleTimeoutMs`        | 切断されたセッションのアイドル時の回収時間。                                                       |
| `rateLimit*`                  | 階層ごとのHTTPレート制限スイッチ、しきい値、およびウィンドウ。                                      |

## `BridgeOptions`（プログラムによるブリッジの埋め込み）

`packages/acp-bridge/src/bridgeOptions.ts` はブリッジオプションを定義します。完全なテーブルについては [`03-acp-bridge.md`](./03-acp-bridge.md) を参照してください。主なフィールドは以下の通りです。

| Field                                                                                                                   | Effect                                                                                                                                                                        |
| ----------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `boundWorkspace`                                                                                                        | 必須の正規ワークスペース。                                                                                                                                                 |
| `sessionScope`                                                                                                          | `'single'`（デフォルト）または `'thread'`。                                                   |
| `initializeTimeoutMs`, `maxSessions`, `eventRingSize`, `permissionResponseTimeoutMs`, `maxPendingPermissionsPerSession` | リソース上限のバインド。                                                                      |
| `channelFactory`                                                                                                        | プラグイン可能な ACP 子プロセスファクトリ。デフォルトは `defaultSpawnChannelFactory`。        |
| `fileSystem`                                                                                                            | `BridgeFileSystem` アダプタ。[`07-workspace-filesystem.md`](./07-workspace-filesystem.md) を参照。 |
| `permissionPolicy`, `permissionConsensusQuorum`, `permissionAudit`                                                      | メディエーターの関連付け。                                                                    |
| `statusProvider`                                                                                                        | デーモンホストのプレフライトセル。                                                            |
| `childEnvOverrides`                                                                                                     | ハンドルごとの環境変数の追加または削除。                                                      |
| `externalToolGuard`                                                                                                     | オプションのデーモン側のプライベート子から親への prepare RPC のハンドラー。ブリッジはハンドラーの呼び出し前後でチャネルの所有権とアクティブなプロンプトを検証します。 |
| `contextFilename`                                                                                                       | `getCurrentGeminiMdFilename()` をオーバーライドします。                                       |
| `channelIdleTimeoutMs`                                                                                                  | 最後のセッションが閉じた後に ACP 子プロセスを存続させる時間（ミリ秒）。デフォルトは `0`。     |

## 重要なデフォルト値

| Constant                          | File                    | Value             | Meaning                                                                              |
| --------------------------------- | ----------------------- | ----------------- | ------------------------------------------------------------------------------------ |
| `DEFAULT_MAX_SESSIONS`            | `bridge.ts`             | `32`              | `SessionLimitExceededError` が発生するまでのセッション上限。                           |
| `MAX_EVENT_RING_SIZE`             | `bridge.ts`             | `1_000_000`       | `BridgeOptions.eventRingSize` のソフトキャップ。タイプミスに対するガード。               |
| `DEFAULT_RING_SIZE`               | `eventBus.ts`           | `8000`            | セッションごとの SSE リプレイリングの深さ。                                             |
| `DEFAULT_MAX_QUEUED`              | `eventBus.ts`           | `256`             | サブスクライバーごとのキュー上限。                                                     |
| `DEFAULT_MAX_SUBSCRIBERS`         | `eventBus.ts`           | `64`              | バスごとのサブスクライバー上限。                                                       |
| `WARN_THRESHOLD_RATIO`            | `eventBus.ts`           | `0.75`            | `slow_client_warning` のトリガー。                                                    |
| `WARN_RESET_RATIO`               | `eventBus.ts`           | `0.375`           | ヒステリシスの再設定しきい値。                                                         |
| `DEFAULT_INIT_TIMEOUT_MS`         | `bridge.ts`             | `10_000`          | ACP `initialize` ハンドシェイクのタイムアウト。                                        |
| `MCP_RESTART_TIMEOUT_MS`          | `bridge.ts`             | `300_000`         | `/workspace/mcp/:server/restart` のブリッジタイムアウト。                              |
| `DEFAULT_PERMISSION_TIMEOUT_MS`   | `bridge.ts`             | `5 * 60_000`      | 権限リクエストごとのタイムアウト時間。                                                 |
| `DEFAULT_MAX_PENDING_PER_SESSION` | `bridge.ts`             | `64`              | `DEFAULT_MAX_SUBSCRIBERS` に整合。                                                    |
| `MAX_RESOLVED_PERMISSION_RECORDS` | `permissionMediator.ts` | `512`             | 最近解決された権限の FIFO キュー。                                                    |
| `KILL_HARD_DEADLINE_MS`           | `spawnChannel.ts`       | `10_000`          | チャネルごとのグレースフルシャットダウンのウィンドウ。                                 |
| `SHUTDOWN_FORCE_CLOSE_MS`         | `run-qwen-serve.ts`     | `5_000`           | HTTP サーバーの強制クローズタイマー。                                                  |
| `MAX_READ_BYTES`                  | `fs/policy.ts`          | `256 * 1024`      | フルスナップショットおよび返されるテキストの上限。より大きな UTF-8 テキストには有限の行制限が必要です。 |
| `MAX_WRITE_BYTES`                 | `fs/policy.ts`          | `5 * 1024 * 1024` | 書き込み上限。                                                                        |
| `MAX_DISPLAY_NAME_LENGTH`         | `bridge.ts`             | `256`             | セッションの `displayName` の上限。                                                    |

## 相互参照

- 認証設定: [`12-auth-security.md`](./12-auth-security.md)
- 機能とプロトコルバージョン: [`11-capabilities-versioning.md`](./11-capabilities-versioning.md)
- イベントリングとバックプレッシャーのチューニング: [`10-event-bus.md`](./10-event-bus.md)
- MCP プール / バジェット: [`05-mcp-transport-pool.md`](./05-mcp-transport-pool.md) および [`06-mcp-budget-guardrails.md`](./06-mcp-budget-guardrails.md)
- 権限ポリシー: [`04-permission-mediation.md`](./04-permission-mediation.md)
- ユーザー操作ガイド: [`../../users/qwen-serve.md`](../../users/qwen-serve.md)
