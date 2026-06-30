# Serve Runtime

## 概要

`packages/cli/src/serve/` は `qwen serve` のブートレイヤーです。CLI フラグを `ServeOptions` に変換し、起動構成を検証し、Express アプリを構築し、ミドルウェアを接続し、ルートを登録し、デーモンホストのプレフライト/ステータスプロバイダーを公開し、権限監査リングを維持し、2 段階のグレースフルシャットダウンシーケンスを管理します。HTTP 関連の処理はこのレイヤーに存在し、ACP 関連の処理はその下のレイヤーである `@qwen-code/acp-bridge` に存在します（[`03-acp-bridge.md`](./03-acp-bridge.md) を参照）。

## 責務

- `ServeOptions` の解析と検証: リッスンアドレス、認証、ワークスペース、セッション/接続の上限、MCP バジェット/プール、CORS、プロンプト/SSE/セッションのアイドルタイムアウト、レート制限、および関連するトグル。
- バインドされたワークスペースを正確に 1 回だけ**正規化**します。同じ正規化形式は、`/capabilities`、`POST /session` のフォールバック、およびブリッジで共有されます。
- 安全でない、または無効な起動構成を拒否します: トークンなしの非ループバックバインド、トークンなしの `--require-auth`、トークンなしの `--allow-origin '*'`、正の `mcpClientBudget` なしの `mcpBudgetMode='enforce'`、存在しないまたはディレクトリではない `--workspace`、および無効なタイムアウトまたはレート制限値。
- `WorkspaceFileSystem` ファクトリ、権限監査パブリッシャー、`DaemonStatusProvider`、および `acp-bridge` を構築します。
- Express アプリを構築し、ミドルウェア（`denyBrowserOriginCors` / `allowOriginCors` -> `hostAllowlist` -> アクセスログ -> `bearerAuth` -> レート制限 -> JSON パーサー -> テレメトリ -> ルートごとの `mutationGate`）を接続し、セッション、ワークスペース CRUD、ファイル、デバイスフロー認証、権限投票、および ACP HTTP ルートをマウントします。
- リッスンポートをバインドし、シグナルハンドラを登録します。
- SIGINT/SIGTERM で 2 段階のシャットダウンを実行します。2 回目のシグナルで強制終了します。

## アーキテクチャ

**エントリー**: `packages/cli/src/serve/run-qwen-serve.ts` の `runQwenServe(opts, deps)`。`RunHandle` (`{ url, port, close, ... }`) を返します。

**アプリファクトリ**: `packages/cli/src/serve/server.ts` の `createServeApp(opts, getPort, deps)`。Express の `Application` を構築します。直接組み込む場合やテストでは、ブートストラップラッパーなしで呼び出します。

**ケイパビリティレジストリ**: `packages/cli/src/serve/capabilities.ts` の `SERVE_CAPABILITY_REGISTRY`。各タグには `since` バージョンとオプションの `modes` があります。10 個の条件付きタグ（`require_auth`、`mcp_workspace_pool`、`mcp_pool_restart`、`allow_origin`、`prompt_absolute_deadline`、`writer_idle_timeout`、`workspace_settings`、`session_shell_command`、`rate_limit`、`workspace_reload`）は、対応するトグルがオフの場合に省略されます。[`11-capabilities-versioning.md`](./11-capabilities-versioning.md) を参照してください。

**ミドルウェア** (`packages/cli/src/serve/auth.ts` および `server.ts`):

| ミドルウェア（登録順）                          | 目的                                                                                                                     | 備考                                                                                                              |
| ------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `denyBrowserOriginCors` / `allowOriginCors` | デフォルトですべての `Origin` ヘッダーを拒否します。`--allow-origin <pattern>` が設定されている場合は許可リストに切り替えます。                | [`12-auth-security.md`](./12-auth-security.md) を参照。                                                               |
| `hostAllowlist(bind, getPort)`              | ループバックでは、`Host` が `localhost`、`127.0.0.1`、`[::1]`、または `host.docker.internal` と実際のポートに属することを検証します。 | DNS リバインディングに対する防御。比較は大文字と小文字を区別せず、ポートごとにキャッシュされます。                                |
| アクセスログミドルウェア                       | リクエストが完了したときに、メソッド、パス、ステータス、durationMs、sessionId、および clientId を `DaemonLogger` に記録します。               | `bearerAuth` の**前**に登録されるため、401 拒否もログに記録されます。`/health` とハートビートはスキップされます。                 |
| `bearerAuth(token)`                         | SHA-256 と `timingSafeEqual` による定数時間ベアラートークン比較。                                                            | トークンが設定されていない場合（ループバック開発のデフォルト）はオープンパススルーになります。`Bearer` スキームは大文字と小文字を区別しません。         |
| レート制限ミドルウェア                       | プロンプト、ミューテーション、および読み取りルート用のオプションの階層ごとのトークンバケット。                                                      | `bearerAuth` の後、JSON 解析の前に登録されます。バケットが枯渇した場合、解析前に 429 を返します。     |
| `express.json({ limit: '10mb' })`           | JSON ボディの解析。                                                                                                         | 解析エラーは 400 を返します。                                                                                          |
| `daemonTelemetryMiddleware`                 | `withDaemonRequestSpan` を介して各 HTTP リクエストを OpenTelemetry スパンでラップします。                                          | 属性にはルート、sessionId、clientId、およびステータスコードが含まれます。                                                   |
| `createMutationGate` (ルートごと)            | ループバックでもトークンを必要とするミューテーションルート用のルートレベルのオプトインゲート。                                           | `401 { code: 'token_required' }` を返します。グローバルな `app.use` ではありません。ルートは必要に応じて `mutate({ strict: true })` を呼び出します。 |

**サブシステム**:

| パス                                                             | 役割                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `serve/fs/`                                                      | `WorkspaceFileSystem` ファクトリ、`policy.ts`（サイズ/信頼/バイナリチェック）、`paths.ts`（正規化、resolveWithin、シンボリックリンク拒否）、`audit.ts`、および型付き `FsError` 値。                                                                                                                                                                                                                                                                              |
| `serve/routes/workspace-file-read.ts`、`workspace-file-write.ts` | `GET /file`、`GET /file/bytes`、`POST /file/write`、および `POST /file/edit` の HTTP ハンドラ。                                                                                                                                                                                                                                                                                                                                                                 |
| `serve/workspace-memory.ts`                                      | `GET/POST /workspace/memory` (QWEN.md CRUD)。                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `serve/workspace-agents.ts`                                      | `GET/POST/DELETE /workspace/agents` (サブエージェント CRUD)。                                                                                                                                                                                                                                                                                                                                                                                                         |
| `serve/daemon-status-provider.ts`                                | 環境スナップショットとデーモンホストのプレフライトセル: Node バージョン、CLI エントリー、ワークスペース stat、ripgrep、git、npm。                                                                                                                                                                                                                                                                                                                                                   |
| `serve/permission-audit.ts`                                      | `PermissionAuditRing` (512 エントリの FIFO) と `createPermissionAuditPublisher`。                                                                                                                                                                                                                                                                                                                                                                                 |
| `serve/auth/device-flow.ts`、`qwen-device-flow-provider.ts`      | デバイスフロー OAuth ルート。[`12-auth-security.md`](./12-auth-security.md) を参照。                                                                                                                                                                                                                                                                                                                                                                                |
| `serve/daemon-logger.ts`                                         | `DaemonLogger` 構造化ファイルログ。[`19-observability.md`](./19-observability.md) を参照。                                                                                                                                                                                                                                                                                                                                                                     |
| `serve/debug-mode.ts`                                            | HTTP レスポンスの詳細なエラーコンテキストを制御する共有 `isServeDebugMode()` 述語。                                                                                                                                                                                                                                                                                                                                                                   |
| `serve/acp-http/`                                                | `/acp` にマウントされる ACP Streamable HTTP トランスポート (RFD #721)。7 つのファイルで、JSON-RPC POST、SSE GET、DELETE テアダウン、および REST サーフェスと並行した共有ブリッジの使用を実装します。                                                                                                                                                                                                                                                                       |
| `serve/demo.ts`                                                  | `GET /demo` 用の自己完結型インライン HTML: チャット UI、イベントログ、ワークスペースインスペクターを備えたブラウザデバッグコンソール。`--require-auth` なしのループバックでは、`bearerAuth` の**前**に登録されます。非ループバックまたは `--require-auth` ありの場合は、`bearerAuth` の**後**に登録されます。CSP `default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; frame-ancestors 'none'` と `X-Frame-Options: DENY` で提供されます。 |

**ACP ブリッジパッケージのインポート**:

- イベントバスプリミティブは `@qwen-code/acp-bridge/eventBus` からインポートされます。
- ステータスプリミティブは `@qwen-code/acp-bridge/status` からインポートされます。
- `serve/acp-session-bridge.ts` は、より広範なブリッジサーフェスの CLI ローカル互換性ファサードとして残っています。

## フロー

### ブートシーケンス

1. `opts.token` または `QWEN_SERVER_TOKEN` から**トークンを解決してトリミング**します。これにより、`cat token.txt` の末尾の改行がベアラー比較を静かに壊すのを防ぎます。
2. **ホスト名のタイプミスガード**: `--hostname localhost:4170` はエラーになり、`--port` を提案します。
3. **認証プレフライト**: トークンなしの非ループバックは拒否されます。トークンなしの `--require-auth` は拒否されます。
4. **ワークスペースの検証**: 絶対パス、存在すること、ディレクトリであること。`EACCES` / `EPERM` はフラグを指すようにラップされます。
5. **ワークスペースの正規化**: `canonicalizeWorkspace(rawWorkspace)` は `realpathSync.native` を 1 回実行し、`/capabilities`、`POST /session` のフォールバック、およびブリッジに供給します。
6. **MCP バジェット検証**: 正の整数。`enforce` はバジェットを必要とします。
7. **MCP プールトグルの推論**: 親環境の `QWEN_SERVE_NO_MCP_POOL=1` は `mcpPoolActive=false` にするため、ケイパビリティは正直に `mcp_workspace_pool` と `mcp_pool_restart` を省略します。
8. **CORS / タイムアウト / レート制限の検証**: `--allow-origin '*'` はトークンを必要とします。プロンプト、ライター、チャネルアイドル、セッションアイドル、リーパー、およびレート制限ウィンドウの値が無効な場合は即座に失敗します。
9. **ハンドルごとの `childEnvOverrides`**: `process.env` を変更する代わりに、`BridgeOptions.childEnvOverrides` を介して `QWEN_SERVE_MCP_CLIENT_BUDGET` と `QWEN_SERVE_MCP_BUDGET_MODE` を ACP 子プロセスに渡します。
10. **`settings.json` を 1 回ロード**: `context.fileName`、`policy.permissionStrategy`、および `policy.consensusQuorum` を読み取ります。破損したファイルはデフォルトにフォールバックします。`validatePolicyConfig()` は `policy.*` を `SERVE_CAPABILITY_REGISTRY.permission_mediation.modes` に対してチェックします。不明な戦略または正でない `consensusQuorum` は `InvalidPolicyConfigError` をスローします。非 `consensus` 戦略の下で設定されたクォーラムは stderr 警告をログに記録します。
11. **`PermissionAuditRing` を割り当て** (512 エントリ)。
12. **`fsFactory` を構築**: `runQwenServe` はデフォルトで `trusted: true` です。直接 `createServeApp` を呼び出す場合はデフォルトで `trusted: false` になり、1 回警告します。
13. **`createHttpAcpBridge`**、[`03-acp-bridge.md`](./03-acp-bridge.md) を参照。
14. **`createServeApp`** が Express を組み立てます。
15. **`server.listen(port, hostname)`**、次にホスト許可リストのために実際の `getPort()` を解決します。
16. グレースフルシャットダウンのために **SIGINT / SIGTERM ハンドラを登録**します。

### グレースフルシャットダウン

1. 最初のシグナルでの**フェーズ 1 - ブリッジのティアダウン**:
   - デバイスフローレジストリを破棄し、保留中のフローをキャンセルします。
   - `bridge.shutdown()` は各チャネルを `isDying = true` にマークし、各 ACP 子プロセスの stdin にグレースフルクローズを送信し、チャネルごとに `KILL_HARD_DEADLINE_MS` (10 秒) 待機し、必要に応じて `channel.kill()` を呼び出します。
2. **フェーズ 2 - HTTP のティアダウン**:
   - `server.close()` は新しい接続の受け入れを停止し、実行中のリクエストが完了するのを待ちます。
   - `SHUTDOWN_FORCE_CLOSE_MS` (5 秒) で `server.closeAllConnections()` がトリガーされます。
   - 必要に応じて、2 番目の 2 秒のデッドラインで再度エスカレーションします。
3. **終了中の 2 回目のシグナル**:
   - 孤立した子プロセスがデーモンの終了をブロックするのを防ぐために、`bridge.killAllSync()` + `process.exit(1)` を実行します。

## 状態とライフサイクル

`RunHandle` は以下を公開します:

- `url`: エフェメラルポート解決後の解決済みリッスン URL。
- `port`: `0` の解決を含む実際のポート。
- `close({ timeoutMs? })`: 組み込み用およびテスト用のプログラムによるシャットダウン。

`createServeApp` を直接呼び出すと `Application` のみが返されます。組み込み側が `listen` とシャットダウンを所有します。

## 依存関係

| `serve/` が使用するアップストリーム                                                                       | `serve/` を使用するダウンストリーム                 |
| ----------------------------------------------------------------------------------------------- | ----------------------------------------- |
| `@qwen-code/acp-bridge`: ブリッジ、イベントバス、ステータスタイプ                                        | `qwen` CLI の `serve` サブコマンドハンドラ |
| `packages/core`: `loadSettings`、`getCurrentGeminiMdFilename`、`Config`、`WorkspaceContext`     | 直接組み込む場合、テスト                   |
| ACP SDK (`@agentclientprotocol/sdk`): ブリッジを介した `PROTOCOL_VERSION`、`ClientSideConnection` |                                           |
| Express + body-parser、`node:crypto`、`node:fs`、`node:path`                                    |                                           |

## 設定

| ソース          | キー                                                                                             | 効果                                                                                                |
| --------------- | ----------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| 環境変数             | `QWEN_SERVER_TOKEN`                                                                             | トリミング後のベアラートークン。                                                                              |
| 環境変数             | `QWEN_SERVE_NO_MCP_POOL=1`                                                                      | `mcpPoolActive=false` を強制します。                                                                         |
| ACP 子プロセス環境変数   | `QWEN_SERVE_MCP_CLIENT_BUDGET` / `QWEN_SERVE_MCP_BUDGET_MODE`                                   | `--mcp-client-budget` / `--mcp-budget-mode` から生成され、`childEnvOverrides` を介して転送されます。 |
| 環境変数             | `QWEN_SERVE_PROMPT_DEADLINE_MS` / `QWEN_SERVE_WRITER_IDLE_TIMEOUT_MS`                           | デフォルトのプロンプト / SSE アイドルタイムアウト。                                                                   |
| 環境変数             | `QWEN_SERVE_RATE_LIMIT*`                                                                        | レート制限スイッチ、プロンプト / ミューテーション / 読み取りの上限、およびウィンドウのデフォルト。                                 |
| 環境変数             | `QWEN_SERVE_DEBUG=1`                                                                            | 詳細な stderr ログ。[`19-observability.md`](./19-observability.md) を参照。                              |
| フラグ           | `--hostname`、`--port`                                                                          | リッスンバインディング。                                                                                       |
| フラグ           | `--token`、`--require-auth`、`--enable-session-shell`                                           | ベアラートークン、ループバック認証の強化、および明示的なシェル実行スイッチ。                           |
| フラグ            | `--workspace`                                                                                   | `process.cwd()` をオーバーライドします。                                                                            |
| フラグ           | `--max-sessions`、`--max-pending-prompts-per-session`、`--max-connections`、`--event-ring-size` | ブリッジ / Express の上限。                                                                                |
| フラグ           | `--mcp-client-budget=N`、`--mcp-budget-mode={off,warn,enforce}`                                 | ACP 子プロセスに転送されます。                                                                           |
| フラグ           | `--allow-origin`、`--allow-private-auth-base-url`                                               | ブラウザ CORS 許可リストと、localhost/プライベート認証プロバイダーのインストールスイッチ。                       |
| フラグ           | `--prompt-deadline-ms`、`--writer-idle-timeout-ms`、`--channel-idle-timeout-ms`                 | プロンプト、SSE ライター、および ACP 子プロセスのアイドルライフサイクル制御。                                             |
| フラグ           | `--session-reap-interval-ms`、`--session-idle-timeout-ms`                                       | 切断されたセッションの回収制御。                                                                 |
| フラグ           | `--rate-limit*`                                                                                 | 階層ごとの HTTP レート制限。                                                                             |
| `settings.json` | `policy.permissionStrategy`、`policy.consensusQuorum`                                           | `MultiClientPermissionMediator` のポリシーとクォーラム。                                                    |
| `settings.json` | `context.fileName`                                                                              | ブリッジ用の `getCurrentGeminiMdFilename` オーバーライド。                                                 |
統合されたリファレンスについては、[`17-configuration.md`](./17-configuration.md) を参照してください。

## 注意事項と既知の制限

- `deps.fsFactory` または `deps.bridge` を指定せずに `createServeApp` を直接呼び出すと、デフォルトで `trusted: false` になります。エージェント側の ACP `writeTextFile` は `untrusted_workspace` として拒否されます。警告は一度だけ出力されます。
- `denyBrowserOriginCors` は `Origin` を含む**すべて**のリクエストを拒否します。デモページが動作するのは、別のミドルウェアが先に一致する同一オリジンの値を削除するためです。
- Body-parser の順序: `mutate({ strict: true })` を使用するルートは、`express.json()` の後にのみ 401 を返します。最悪のケースは `--max-connections × express.json({limit: '10mb'})` となり、飽和したループバックリスナーで最大約 2.5 GB の一時的なメモリを消費します。このトレードオフは意図的なものです。
- 1つのプロセスで複数のデーモンを実行する場合は、ハンドルごとに `childEnvOverrides` を使用する必要があります。`defaultSpawnChannelFactory` が spawn 時に環境変数のスナップショットを取得するため、`process.env` の変更は競合を引き起こします。

## 参照

- `packages/cli/src/serve/run-qwen-serve.ts` (ブートストラップ、起動時の検証、グレースフルシャットダウン)
- `packages/cli/src/serve/server.ts` (`createServeApp()`、ミドルウェアとルートのアセンブリ)
- `packages/cli/src/serve/auth.ts` (CORS、ホスト許可リスト、Bearer 認証、ミューテーションゲート)
- `packages/cli/src/serve/rate-limit.ts` (ティアごとの HTTP レート制限)
- `packages/cli/src/serve/capabilities.ts` (ケイパビリティレジストリと条件付き公開)
- `packages/cli/src/serve/types.ts` (`ServeOptions`, `CapabilitiesEnvelope`)
- `packages/cli/src/serve/daemon-status-provider.ts`
- `packages/cli/src/serve/permission-audit.ts`
- Issues: [#3803](https://github.com/QwenLM/qwen-code/issues/3803), [#4175](https://github.com/QwenLM/qwen-code/issues/4175)