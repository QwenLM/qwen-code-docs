# サーバーランタイム

## 概要

`packages/cli/src/serve/` は `qwen serve` のブートレイヤーです。CLIフラグを `ServeOptions` に変換し、起動設定を検証し、Expressアプリを構築し、ミドルウェアを配線し、ルートを登録し、デーモンホストのプリフライト/ステータスプロバイダーを公開し、パーミッション監査リングを管理し、二段階の graceful shutdown シーケンスを制御します。HTTPに関わる処理はこのレイヤーにあります。ACPに関わる処理は一つ下の `@qwen-code/acp-bridge` にあります（[`03-acp-bridge.md`](./03-acp-bridge.md) 参照）。

## 責務

- `ServeOptions` の解析と検証：listenアドレス、認証、ワークスペース、セッション/接続上限、MCP予算/プール、CORS、プロンプト/SSE/セッションアイドルタイムアウト、レート制限、および関連トグル。
- バインドされたワークスペースを**正規化**する（一度だけ）。同じ正規化形式が `/capabilities`、`POST /session` フォールバック、およびブリッジで共有される。
- 安全でない、または無効な起動設定を拒否する：トークンなしの非ループバックバインド、トークンなしの `--require-auth`、トークンなしの `--allow-origin '*'`、正の `mcpClientBudget` なしの `mcpBudgetMode='enforce'`、存在しない、またはディレクトリでない `--workspace`、無効なタイムアウト値やレート制限値。
- `WorkspaceFileSystem` ファクトリ、パーミッション監査パブリッシャー、`DaemonStatusProvider`、および `acp-bridge` を構築する。
- Expressアプリを構築し、ミドルウェア（`denyBrowserOriginCors` / `allowOriginCors` -> `hostAllowlist` -> アクセスログ -> `bearerAuth` -> レート制限 -> JSONパーサー -> テレメトリー -> ルートごとの `mutationGate`）を配線し、セッション、ワークスペースCRUD、ファイル、デバイスフロー認証、パーミッション投票、ACP HTTPルートをマウントする。
- リッスンポートをバインドし、シグナルハンドラーを登録する。
- SIGINT/SIGTERMで二段階シャットダウンを実行する。2回目のシグナルでは強制終了する。

## アーキテクチャ

**エントリーポイント**: `packages/cli/src/serve/run-qwen-serve.ts` の `runQwenServe(opts, deps)`。`RunHandle`（`{ url, port, close, ... }`）を返す。

**アプリファクトリ**: `packages/cli/src/serve/server.ts` の `createServeApp(opts, getPort, deps)`。Express `Application` を構築する。直接埋め込みやテストではブートラッパーなしでこれを呼び出す。

**機能レジストリ**: `packages/cli/src/serve/capabilities.ts` の `SERVE_CAPABILITY_REGISTRY`。各タグには `since` バージョンとオプションの `modes` がある。10の条件付きタグ（`require_auth`、`mcp_workspace_pool`、`mcp_pool_restart`、`allow_origin`、`prompt_absolute_deadline`、`writer_idle_timeout`、`workspace_settings`、`session_shell_command`、`rate_limit`、`workspace_reload`）は、対応するトグルがオフの場合に省略される。[`11-capabilities-versioning.md`](./11-capabilities-versioning.md) を参照。

**ミドルウェア**（`packages/cli/src/serve/auth.ts` と `server.ts`）：

| ミドルウェア（登録順）                                     | 目的                                                                                                                              | 備考                                                                                                                                                           |
| -------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `denyBrowserOriginCors` / `allowOriginCors`              | デフォルトですべての `Origin` ヘッダーを拒否。`--allow-origin <pattern>` が設定されている場合、許可リストに切り替える。              | [`12-auth-security.md`](./12-auth-security.md) 参照。                                                                                                           |
| `hostAllowlist(bind, getPort)`                           | ループバックの場合、`Host` が `localhost`、`127.0.0.1`、`[::1]`、または `host.docker.internal` に実際のポートを含むものであることを検証する。 | DNSリバインディング対策。比較は大文字小文字を区別せず、ポートごとにキャッシュされる。                                                                          |
| アクセスログミドルウェア                                 | リクエスト完了時にメソッド、パス、ステータス、durationMs、sessionId、clientId を `DaemonLogger` に記録する。                         | **`bearerAuth` の前に**登録されるため、401拒否も記録される。`/health` とハートビートはスキップされる。                                                            |
| `bearerAuth(token)`                                      | SHA-256 プラス `timingSafeEqual` の定数時間Bearer比較。                                                                             | トークンが設定されていない場合（ループバック開発デフォルト）はオープンパススルー。`Bearer` スキームは大文字小文字を区別しない。                                     |
| レート制限ミドルウェア                                   | プロンプト、ミューテーション、読み取りルート用のオプションの階層別トークンバケット。                                                  | `bearerAuth` の後、JSONパースの前に登録。バケット枯渇時はパース前に429を返す。                                                                                    |
| `express.json({ limit: '10mb' })`                        | JSONボディパース。                                                                                                                | パースエラーは400を返す。                                                                                                                                     |
| `daemonTelemetryMiddleware`                              | 各HTTPリクエストを `withDaemonRequestSpan` でOpenTelemetryスパンにラップする。                                                       | 属性にはルート、sessionId、clientId、ステータスコードが含まれる。                                                                                               |
| `createMutationGate`（ルートごと）                        | ミューテーションルート用のルートレベルオプトインゲート。ループバックでもトークンが必要。                                             | `401 { code: 'token_required' }` を返す。グローバル `app.use` ではなく、ルートが必要に応じて `mutate({ strict: true })` を呼び出す。                             |

**サブシステム**：

| パス                                                         | 役割                                                                                                                                                                                                                                                                                                                                                                                          |
| ------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `serve/fs/`                                                  | `WorkspaceFileSystem` ファクトリと `policy.ts`（サイズ/信頼/バイナリチェック）、`paths.ts`（正規化、resolveWithin、シンボリックリンク拒否）、`audit.ts`、および型付き `FsError` 値。                                                                                                                                                                                                            |
| `serve/routes/workspace-file-read.ts`、`workspace-file-write.ts` | `GET /file`、`GET /file/bytes`、`POST /file/write`、`POST /file/edit` のHTTPハンドラー。                                                                                                                                                                                                                                                                                                        |
| `serve/workspace-memory.ts`                                  | `GET/POST /workspace/memory`（QWEN.md CRUD）。                                                                                                                                                                                                                                                                                                                                                |
| `serve/workspace-agents.ts`                                  | `GET/POST/DELETE /workspace/agents`（サブエージェントCRUD）。                                                                                                                                                                                                                                                                                                                                    |
| `serve/daemon-status-provider.ts`                            | 環境スナップショットとデーモンホストのプリフライト情報：Nodeバージョン、CLIエントリ、ワークスペース統計、ripgrep、git、npm。                                                                                                                                                                                                                                                                   |
| `serve/permission-audit.ts`                                  | `PermissionAuditRing`（512エントリのFIFO）と `createPermissionAuditPublisher`。                                                                                                                                                                                                                                                                                                                  |
| `serve/auth/device-flow.ts`、`qwen-device-flow-provider.ts`  | デバイスフローOAuthルート。[`12-auth-security.md`](./12-auth-security.md) 参照。                                                                                                                                                                                                                                                                                                             |
| `serve/daemon-logger.ts`                                     | `DaemonLogger` 構造化ファイルログ。[`19-observability.md`](./19-observability.md) 参照。                                                                                                                                                                                                                                                                                                    |
| `serve/debug-mode.ts`                                        | 共有 `isServeDebugMode()` 述語。HTTPレスポンス内の詳細なエラーコンテキストを制御する。                                                                                                                                                                                                                                                                                                            |
| `serve/acp-http/`                                            | ACP Streamable HTTP transport（RFD #721）、`/acp` にマウント。7つのファイルがJSON-RPC POST、SSE GET、DELETE ティアダウン、およびRESTサーフェスと並行して共有ブリッジ使用を実装。                                                                                                                                                                                                                |
| `serve/demo.ts`                                              | 自己完結型インラインHTML `GET /demo`：チャットUI、イベントログ、ワークスペースインスペクターを備えたブラウザデバッグコンソール。ループバックかつ `--require-auth` なしの場合、`bearerAuth` **の前に**登録。非ループバックまたは `--require-auth` ありの場合、`bearerAuth` **の後に**登録。CSP `default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; frame-ancestors 'none'` に加えて `X-Frame-Options: DENY` が付与される。 |

**再エクスポートシム**：F1以前のインポートパスとの互換性のため：

- `serve/event-bus.ts` -> `@qwen-code/acp-bridge/eventBus`
- `serve/status.ts` -> `@qwen-code/acp-bridge/status`
- `serve/httpAcpBridge.ts` -> `@qwen-code/acp-bridge`

## フロー

### ブートシーケンス

1. **トークンの解決とトリム**：`opts.token` または `QWEN_SERVER_TOKEN` から。`cat token.txt` からの末尾改行がBearer比較を静かに壊すのを防ぐ。
2. **ホスト名タイポガード**：`--hostname localhost:4170` はエラーにし、`--port` を提案する。
3. **認証プリフライト**：非ループバックでトークンなしは拒否。`--require-auth` でトークンなしは拒否。
4. **ワークスペース検証**：絶対パス、存在確認、ディレクトリ確認。`EACCES` / `EPERM` はフラグを指すようにラップされる。
5. **ワークスペースの正規化**：`canonicalizeWorkspace(rawWorkspace)` は `realpathSync.native` を一度実行し、`/capabilities`、`POST /session` フォールバック、およびブリッジに供給する。
6. **MCP予算検証**：正整数。`enforce` には予算が必要。
7. **MCPプールトグル推論**：親環境 `QWEN_SERVE_NO_MCP_POOL=1` は `mcpPoolActive=false` にし、機能は正直に `mcp_workspace_pool` と `mcp_pool_restart` を省略する。
8. **CORS / タイムアウト / レート制限検証**：`--allow-origin '*'` はトークンが必要。プロンプト、ライター、チャネルアイドル、セッションアイドル、リーパー、レート制限ウィンドウの値は、無効な場合に早期失敗する。
9. **ハンドルごとの `childEnvOverrides`**：`QWEN_SERVE_MCP_CLIENT_BUDGET` と `QWEN_SERVE_MCP_BUDGET_MODE` を `process.env` を変更する代わりに `BridgeOptions.childEnvOverrides` を通じてACP子プロセスに渡す。
10. **`settings.json` を一度だけ読み込む**：`context.fileName`、`policy.permissionStrategy`、`policy.consensusQuorum` を読み取る。破損ファイルはデフォルトにフォールバック。`validatePolicyConfig()` は `policy.*` を `SERVE_CAPABILITY_REGISTRY.permission_mediation.modes` に対してチェック。未知の戦略や正でない `consensusQuorum` は `InvalidPolicyConfigError` をスロー。非 `consensus` 戦略でクォーラムが設定されている場合は stderr に警告を出力する。
11. **`PermissionAuditRing` の割り当て**（512エントリ）。
12. **`fsFactory` の構築**：`runQwenServe` はデフォルトで `trusted: true`。直接の `createServeApp` 呼び出し元はデフォルトで `trusted: false` で、一度警告する。
13. **`createHttpAcpBridge`**：[`03-acp-bridge.md`](./03-acp-bridge.md) 参照。
14. **`createServeApp`** がExpressを組み立てる。
15. **`server.listen(port, hostname)`**、次にホスト許可リスト用に実際の `getPort()` を解決する。
16. **SIGINT / SIGTERM ハンドラーの登録**（graceful shutdown用）。

### Graceful Shutdown

1. **フェーズ1 - ブリッジのティアダウン**（最初のシグナル）：
   - デバイスフローレジストリを破棄し、保留中のフローをキャンセル。
   - `bridge.shutdown()` は各チャネルを `isDying = true` に設定し、各ACP子プロセスの標準入力に graceful close を送信し、チャネルごとに `KILL_HARD_DEADLINE_MS`（10秒）待機してから、必要に応じて `channel.kill()` を呼び出す。
2. **フェーズ2 - HTTPのティアダウン**：
   - `server.close()` は新しい接続を受け付けなくなり、進行中のリクエストを完了させる。
   - `SHUTDOWN_FORCE_CLOSE_MS`（5秒）が `server.closeAllConnections()` をトリガーする。
   - 必要に応じて、さらに2秒のデッドラインで再エスカレーションされる。
3. **終了中の2回目のシグナル**：
   - `bridge.killAllSync()` + `process.exit(1)` により、孤児となった子プロセスがデーモンの終了を妨げるのを防ぐ。

## 状態とライフサイクル

`RunHandle` は以下を公開する：

- `url`：解決されたlisten URL（エフェメラルポート解決後）。
- `port`：実際のポート（`0` の解決を含む）。
- `close({ timeoutMs? })`：埋め込みやテスト用のプログラムシャットダウン。

`createServeApp` を直接呼び出すと `Application` のみが返される。埋め込み側が `listen` とシャットダウンを管理する。

## 依存関係

| `serve/` が使用する上流                                                                 | `serve/` を使用する下流           |
| --------------------------------------------------------------------------------------- | --------------------------------- |
| `@qwen-code/acp-bridge`：ブリッジ、イベントバス、ステータス型                             | `qwen` CLI の `serve` サブコマンドハンドラー |
| `packages/core`：`loadSettings`、`getCurrentGeminiMdFilename`、`Config`、`WorkspaceContext` | 直接埋め込み、テスト              |
| ACP SDK（`@agentclientprotocol/sdk`）：`PROTOCOL_VERSION`、`ClientSideConnection`（ブリッジ経由） |                                   |
| Express + body-parser、`node:crypto`、`node:fs`、`node:path`                            |                                   |

## 設定

| ソース           | キー                                                                                           | 効果                                                                                                            |
| ---------------- | ---------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| 環境変数         | `QWEN_SERVER_TOKEN`                                                                            | トリム後のBearerトークン。                                                                                         |
| 環境変数         | `QWEN_SERVE_NO_MCP_POOL=1`                                                                     | `mcpPoolActive=false` を強制。                                                                                    |
| ACP子プロセス環境 | `QWEN_SERVE_MCP_CLIENT_BUDGET` / `QWEN_SERVE_MCP_BUDGET_MODE`                                  | `--mcp-client-budget` / `--mcp-budget-mode` から生成され、`childEnvOverrides` 経由で転送。                       |
| 環境変数         | `QWEN_SERVE_PROMPT_DEADLINE_MS` / `QWEN_SERVE_WRITER_IDLE_TIMEOUT_MS`                          | デフォルトのプロンプト / SSEアイドルタイムアウト。                                                               |
| 環境変数         | `QWEN_SERVE_RATE_LIMIT*`                                                                       | レート制限スイッチ、プロンプト/ミューテーション/読み取りキャップ、ウィンドウデフォルト。                         |
| 環境変数         | `QWEN_SERVE_DEBUG=1`                                                                           | 詳細な stderr ログ。[`19-observability.md`](./19-observability.md) 参照。                                         |
| フラグ           | `--hostname`、`--port`                                                                         | リッセンバインド。                                                                                             |
| フラグ           | `--token`、`--require-auth`、`--enable-session-shell`                                        | Bearerトークン、ループバック認証強化、明示的なシェル実行スイッチ。                                               |
| フラグ           | `--workspace`                                                                                  | `process.cwd()` を上書き。                                                                                     |
| フラグ           | `--max-sessions`、`--max-pending-prompts-per-session`、`--max-connections`、`--event-ring-size` | ブリッジ / Express の上限。                                                                                     |
| フラグ           | `--mcp-client-budget=N`、`--mcp-budget-mode={off,warn,enforce}`                                | ACP子プロセスに転送。                                                                                         |
| フラグ           | `--allow-origin`、`--allow-private-auth-base-url`                                              | ブラウザCORS許可リストと localhost/private 認証プロバイダーインストールスイッチ。                               |
| フラグ           | `--prompt-deadline-ms`、`--writer-idle-timeout-ms`、`--channel-idle-timeout-ms`                | プロンプト、SSEライター、ACP子プロセスのアイドルライフサイクル制御。                                             |
| フラグ           | `--session-reap-interval-ms`、`--session-idle-timeout-ms`                                      | 切断セッションの回収制御。                                                                                     |
| フラグ           | `--rate-limit*`                                                                                | 階層別HTTPレート制限。                                                                                         |
| `settings.json`  | `policy.permissionStrategy`、`policy.consensusQuorum`                                        | `MultiClientPermissionMediator` のポリシーとクォーラム。                                                         |
| `settings.json`  | `context.fileName`                                                                             | ブリッジ用の `getCurrentGeminiMdFilename` の上書き。                                                              |
[`17-configuration.md`](./17-configuration.md) を参照して統合リファレンスを確認してください。

## 注意点および既知の制限

- `deps.fsFactory` または `deps.bridge` なしで `createServeApp` を直接使用すると、デフォルトで `trusted: false` になります。エージェント側の ACP `writeTextFile` は `untrusted_workspace` として拒否します。警告は1回だけ出力されます。
- `denyBrowserOriginCors` は `Origin` ヘッダを持つ**すべての**リクエストを拒否します。デモページが動作するのは、別のミドルウェアが同一オリジンの値を先に取り除くためです。
- ボディパーサーの順序: `mutate({ strict: true })` を使用するルートは、`express.json()` の後にのみ 401 を返します。最悪のケースは `--max-connections × express.json({limit: '10mb'})` で、飽和したループバックリスナー上で最大約 2.5 GB の一時メモリを消費します。このトレードオフは意図的です。
- 1つのプロセスで複数のデーモンを使用する場合は、ハンドルごとに `childEnvOverrides` を使用する必要があります。`process.env` を書き換えると競合が発生します。これは `defaultSpawnChannelFactory` が生成時に env のスナップショットを取得するためです。

## 参考文献

- `packages/cli/src/serve/run-qwen-serve.ts` (ブートストラップ、起動検証、グレースフルシャットダウン)
- `packages/cli/src/serve/server.ts` (`createServeApp()`、ミドルウェアとルートの構築)
- `packages/cli/src/serve/auth.ts` (CORS、Host 許可リスト、Bearer 認証、ミューテーションゲート)
- `packages/cli/src/serve/rate-limit.ts` (階層別 HTTP レート制限)
- `packages/cli/src/serve/capabilities.ts` (機能レジストリと条件付きアドバタイズ)
- `packages/cli/src/serve/types.ts` (`ServeOptions`、`CapabilitiesEnvelope`)
- `packages/cli/src/serve/daemon-status-provider.ts`
- `packages/cli/src/serve/permission-audit.ts`
- Issues: [#3803](https://github.com/QwenLM/qwen-code/issues/3803)、[#4175](https://github.com/QwenLM/qwen-code/issues/4175)