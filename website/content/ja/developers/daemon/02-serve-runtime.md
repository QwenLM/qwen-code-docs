# Serve ランタイム

## 概要

`packages/cli/src/serve/` は `qwen serve` のブートレイヤーです。CLI フラグを `ServeOptions` に変換し、起動設定を検証し、Express アプリをビルドし、ミドルウェアを接続し、ルートを登録し、デーモンホストのプリフライト/ステータスプロバイダーを公開し、パーミッション監査リングを維持し、2 フェーズのグレースフルシャットダウンシーケンスを管理します。HTTP 向けの処理はこのレイヤーに、ACP 向けの処理は 1 つ下のレイヤー `@qwen-code/acp-bridge` に存在します（[`03-acp-bridge.md`](./03-acp-bridge.md) 参照）。

## 責務

- `ServeOptions` のパースと検証: リッスンアドレス、認証、ワークスペース、セッション/コネクションキャップ、MCP バジェット/プール、CORS、プロンプト/SSE/セッションアイドルタイムアウト、レートリミット、および関連トグル。
- **正規化**: バインドされたワークスペースを一度だけ正規化します。同じ正規形式が `/capabilities`、`POST /session` のフォールバック、およびブリッジで共有されます。
- 安全でないまたは無効な起動設定を拒否します: トークンなしの非ループバックバインド、トークンなしの `--require-auth`、トークンなしの `--allow-origin '*'`、正の `mcpClientBudget` なしの `mcpBudgetMode='enforce'`、存在しないまたはディレクトリでない `--workspace`、および無効なタイムアウト値やレートリミット値。
- `WorkspaceFileSystem` ファクトリ、パーミッション監査パブリッシャー、`DaemonStatusProvider`、および `acp-bridge` を構築します。
- Express アプリをビルドし、ミドルウェア（`denyBrowserOriginCors` / `allowOriginCors` -> `hostAllowlist` -> アクセスログ -> `bearerAuth` -> レートリミット -> JSON パーサー -> テレメトリー -> ルートごとの `mutationGate`）を接続し、セッション、ワークスペース CRUD、ファイル、デバイスフロー認証、パーミッション投票、および ACP HTTP ルートをマウントします。
- リッスンポートをバインドし、シグナルハンドラーを登録します。
- SIGINT/SIGTERM で 2 フェーズシャットダウンを実行し、2 番目のシグナルで強制終了します。

## アーキテクチャ

**エントリポイント**: `packages/cli/src/serve/run-qwen-serve.ts` の `runQwenServe(opts, deps)`。`RunHandle`（`{ url, port, close, ... }`）を返します。

**アプリファクトリ**: `packages/cli/src/serve/server.ts` の `createServeApp(opts, getPort, deps)`。Express `Application` をビルドします。直接埋め込む側やテストはブートストラップラッパーなしで呼び出します。

**ケイパビリティレジストリ**: `packages/cli/src/serve/capabilities.ts` の `SERVE_CAPABILITY_REGISTRY`。各タグには `since` バージョンとオプションの `modes` があります。10 個の条件付きタグ（`require_auth`、`mcp_workspace_pool`、`mcp_pool_restart`、`allow_origin`、`prompt_absolute_deadline`、`writer_idle_timeout`、`workspace_settings`、`session_shell_command`、`rate_limit`、`workspace_reload`）は、対応するトグルがオフの場合に省略されます。[`11-capabilities-versioning.md`](./11-capabilities-versioning.md) を参照してください。

**ミドルウェア**（`packages/cli/src/serve/auth.ts` および `server.ts`）:

| ミドルウェア（登録順）                        | 目的                                                                                                                                         | 備考                                                                                                              |
| ------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `denyBrowserOriginCors` / `allowOriginCors` | デフォルトですべての `Origin` ヘッダーを拒否します。`--allow-origin <pattern>` が設定されている場合は許可リストに切り替えます。                       | [`12-auth-security.md`](./12-auth-security.md) を参照。                                                           |
| `hostAllowlist(bind, getPort)`              | ループバックでは、`Host` が `localhost`、`127.0.0.1`、`[::1]`、`host.docker.internal` のいずれかと実際のポートに属することを検証します。          | DNS リバインディングへの防御。比較は大文字小文字を区別せず、ポートごとにキャッシュされます。                                |
| アクセスログミドルウェア                      | リクエスト完了時に、メソッド、パス、ステータス、durationMs、sessionId、clientId を `DaemonLogger` に記録します。                                   | `bearerAuth` の**前に**登録されるため、401 拒否もログに記録されます。`/health` とハートビートはスキップします。          |
| `bearerAuth(token)`                         | SHA-256 と `timingSafeEqual` による定時間ベアラー比較。                                                                                        | トークンが設定されていない場合はパススルー（ループバック開発デフォルト）。`Bearer` スキームは大文字小文字を区別しません。  |
| レートリミットミドルウェア                    | プロンプト、ミューテーション、読み取りルートに対するオプションのティアごとのトークンバケット。                                                      | `bearerAuth` の後、JSON パースの前に登録されます。バケットが枯渇すると、パース前に 429 を返します。                      |
| `express.json({ limit: '10mb' })`           | JSON ボディパース。                                                                                                                            | パースエラーは 400 を返します。                                                                                      |
| `daemonTelemetryMiddleware`                 | `withDaemonRequestSpan` を通じて各 HTTP リクエストを OpenTelemetry スパンでラップします。                                                        | 属性にはルート、sessionId、clientId、ステータスコードが含まれます。                                                    |
| `createMutationGate`（ルートごと）           | ループバック上でもトークンを必要とするミューテーションルートのためのルートレベルのオプトインゲート。                                                 | `401 { code: 'token_required' }` を返します。グローバルな `app.use` ではなく、ルートが必要に応じて `mutate({ strict: true })` を呼び出します。 |

**サブシステム**:

| パス                                                             | 役割                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `serve/fs/`                                                      | `WorkspaceFileSystem` ファクトリ、`policy.ts`（サイズ/信頼/バイナリチェック）、`paths.ts`（正規化、resolveWithin、シンボリックリンク拒否）、`audit.ts`、および型付き `FsError` 値。                                                                                                                                                                                                                                                                              |
| `serve/routes/workspace-file-read.ts`, `workspace-file-write.ts` | `GET /file`、`GET /file/bytes`、`POST /file/write`、`POST /file/edit` の HTTP ハンドラー。                                                                                                                                                                                                                                                                                                                                                                   |
| `serve/workspace-memory.ts`                                      | `GET/POST /workspace/memory`（QWEN.md CRUD）。                                                                                                                                                                                                                                                                                                                                                                                                               |
| `serve/workspace-agents.ts`                                      | `GET/POST/DELETE /workspace/agents`（サブエージェント CRUD）。                                                                                                                                                                                                                                                                                                                                                                                               |
| `serve/daemon-status-provider.ts`                                | 環境スナップショットとデーモンホストプリフライトセル: Node バージョン、CLI エントリ、ワークスペース stat、ripgrep、git、npm。                                                                                                                                                                                                                                                                                                                                  |
| `serve/permission-audit.ts`                                      | `PermissionAuditRing`（512 エントリ FIFO）と `createPermissionAuditPublisher`。                                                                                                                                                                                                                                                                                                                                                                              |
| `serve/auth/device-flow.ts`, `qwen-device-flow-provider.ts`      | デバイスフロー OAuth ルート。[`12-auth-security.md`](./12-auth-security.md) を参照。                                                                                                                                                                                                                                                                                                                                                                         |
| `serve/daemon-logger.ts`                                         | `DaemonLogger` 構造化ファイルログ。[`19-observability.md`](./19-observability.md) を参照。                                                                                                                                                                                                                                                                                                                                                                  |
| `serve/debug-mode.ts`                                            | HTTP レスポンス内の詳細エラーコンテキストを制御する共有 `isServeDebugMode()` 述語。                                                                                                                                                                                                                                                                                                                                                                           |
| `serve/acp-http/`                                                | ACP Streamable HTTP トランスポート（RFD #721）、`/acp` にマウント。7 つのファイルが JSON-RPC POST、SSE GET、DELETE ティアダウン、および REST サーフェスと並行した共有ブリッジ使用を実装します。                                                                                                                                                                                                                                                               |
| `serve/demo.ts`                                                  | `GET /demo` 用のセルフコンテインドなインライン HTML: チャット UI、イベントログ、ワークスペースインスペクターを備えたブラウザデバッグコンソール。`--require-auth` なしのループバックでは `bearerAuth` の**前に**登録され、非ループバックまたは `--require-auth` ありでは `bearerAuth` の**後に**登録されます。CSP `default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; frame-ancestors 'none'` と `X-Frame-Options: DENY` で提供されます。 |

プレ F1 インポートパスとの互換性のための**再エクスポートシム**:

- `serve/event-bus.ts` -> `@qwen-code/acp-bridge/eventBus`
- `serve/status.ts` -> `@qwen-code/acp-bridge/status`
- `serve/httpAcpBridge.ts` -> `@qwen-code/acp-bridge`

## フロー

### ブートシーケンス

1. **トークンの解決とトリミング**: `opts.token` または `QWEN_SERVER_TOKEN` から。`cat token.txt` の末尾の改行がベアラー比較をサイレントに破壊するのを防ぎます。
2. **ホスト名タイポガード**: `--hostname localhost:4170` はエラーになり、`--port` の使用を提案します。
3. **認証プリフライト**: トークンなしの非ループバックは拒否されます。トークンなしの `--require-auth` は拒否されます。
4. **ワークスペース検証**: 絶対パス、存在確認、ディレクトリ確認。`EACCES` / `EPERM` はフラグを指すようにラップされます。
5. **ワークスペースの正規化**: `canonicalizeWorkspace(rawWorkspace)` が `realpathSync.native` を一度実行し、`/capabilities`、`POST /session` のフォールバック、ブリッジに提供します。
6. **MCP バジェット検証**: 正の整数。`enforce` にはバジェットが必要です。
7. **MCP プールトグル推論**: 親環境の `QWEN_SERVE_NO_MCP_POOL=1` により `mcpPoolActive=false` となり、ケイパビリティから `mcp_workspace_pool` と `mcp_pool_restart` が正直に省略されます。
8. **CORS / タイムアウト / レートリミット検証**: `--allow-origin '*'` にはトークンが必要。プロンプト、ライター、チャネルアイドル、セッションアイドル、リーパー、レートリミットウィンドウ値は無効な場合にフェイルファストします。
9. **ハンドルごとの `childEnvOverrides`**: `process.env` を変更する代わりに `BridgeOptions.childEnvOverrides` を通じて `QWEN_SERVE_MCP_CLIENT_BUDGET` と `QWEN_SERVE_MCP_BUDGET_MODE` を ACP チャイルドに渡します。
10. **`settings.json` を一度読み込む**: `context.fileName`、`policy.permissionStrategy`、`policy.consensusQuorum` を読み取ります。破損したファイルはデフォルトにフォールバックします。`validatePolicyConfig()` は `policy.*` を `SERVE_CAPABILITY_REGISTRY.permission_mediation.modes` に対して検証します。未知のストラテジーまたは非正の `consensusQuorum` は `InvalidPolicyConfigError` をスローします。`consensus` 以外のストラテジーで設定されたクォーラムは stderr 警告をログに記録します。
11. **`PermissionAuditRing` の割り当て**（512 エントリ）。
12. **`fsFactory` のビルド**: `runQwenServe` はデフォルトで `trusted: true`。直接 `createServeApp` を呼び出す側はデフォルトで `trusted: false` となり、一度警告が表示されます。
13. **`createHttpAcpBridge`**、[`03-acp-bridge.md`](./03-acp-bridge.md) を参照。
14. **`createServeApp`** で Express を組み立てます。
15. **`server.listen(port, hostname)`**、その後ホスト許可リスト用に実際の `getPort()` を解決します。
16. **SIGINT / SIGTERM ハンドラーを登録**してグレースフルシャットダウンに備えます。

### グレースフルシャットダウン

1. **フェーズ 1 - ブリッジティアダウン**（最初のシグナル時）:
   - デバイスフローレジストリを破棄し、保留中のフローをキャンセルします。
   - `bridge.shutdown()` は各チャネルを `isDying = true` としてマークし、各 ACP チャイルドの stdin にグレースフルクローズを送信し、チャネルごとに `KILL_HARD_DEADLINE_MS`（10 秒）待機し、必要であれば `channel.kill()` を呼び出します。
2. **フェーズ 2 - HTTP ティアダウン**:
   - `server.close()` で新しいコネクションの受け入れを停止し、進行中のリクエストを完了させます。
   - `SHUTDOWN_FORCE_CLOSE_MS`（5 秒）で `server.closeAllConnections()` をトリガーします。
   - 必要であれば 2 秒の追加デッドラインで再度エスカレートします。
3. **終了中の 2 番目のシグナル**:
   - `bridge.killAllSync()` + `process.exit(1)` でデーモン終了をブロックする孤立したチャイルドを回避します。

## 状態とライフサイクル

`RunHandle` が公開するもの:

- `url`: エフェメラルポート解決後の解決済みリッスン URL。
- `port`: `0` 解決を含む実際のポート。
- `close({ timeoutMs? })`: 埋め込む側とテスト用のプログラマティックシャットダウン。

`createServeApp` を直接呼び出すと `Application` のみが返されます。埋め込む側が `listen` とシャットダウンを管理します。

## 依存関係

| `serve/` が使用するアップストリーム                                                                     | `serve/` を使用するダウンストリーム         |
| ----------------------------------------------------------------------------------------------- | ----------------------------------------- |
| `@qwen-code/acp-bridge`: ブリッジ、イベントバス、ステータス型                                            | `qwen` CLI `serve` サブコマンドハンドラー   |
| `packages/core`: `loadSettings`、`getCurrentGeminiMdFilename`、`Config`、`WorkspaceContext`     | 直接埋め込む側、テスト                      |
| ACP SDK（`@agentclientprotocol/sdk`）: `PROTOCOL_VERSION`、ブリッジ経由の `ClientSideConnection` |                                           |
| Express + body-parser、`node:crypto`、`node:fs`、`node:path`                                    |                                           |

## 設定

| ソース          | キー                                                                                             | 効果                                                                                                  |
| --------------- | ----------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| 環境変数        | `QWEN_SERVER_TOKEN`                                                                             | トリム後のベアラートークン。                                                                             |
| 環境変数        | `QWEN_SERVE_NO_MCP_POOL=1`                                                                      | `mcpPoolActive=false` を強制します。                                                                    |
| ACP チャイルド環境変数 | `QWEN_SERVE_MCP_CLIENT_BUDGET` / `QWEN_SERVE_MCP_BUDGET_MODE`                             | `--mcp-client-budget` / `--mcp-budget-mode` から生成され、`childEnvOverrides` を通じて転送されます。   |
| 環境変数        | `QWEN_SERVE_PROMPT_DEADLINE_MS` / `QWEN_SERVE_WRITER_IDLE_TIMEOUT_MS`                           | デフォルトのプロンプト / SSE アイドルタイムアウト。                                                       |
| 環境変数        | `QWEN_SERVE_RATE_LIMIT*`                                                                        | レートリミットスイッチ、プロンプト / ミューテーション / 読み取りキャップ、デフォルトウィンドウ。               |
| 環境変数        | `QWEN_SERVE_DEBUG=1`                                                                            | 詳細な stderr ログ。[`19-observability.md`](./19-observability.md) を参照。                             |
| フラグ          | `--hostname`, `--port`                                                                          | リッスンバインディング。                                                                                 |
| フラグ          | `--token`, `--require-auth`, `--enable-session-shell`                                           | ベアラートークン、ループバック認証ハードニング、明示的なシェル実行スイッチ。                                 |
| フラグ          | `--workspace`                                                                                   | `process.cwd()` を上書きします。                                                                        |
| フラグ          | `--max-sessions`, `--max-pending-prompts-per-session`, `--max-connections`, `--event-ring-size` | ブリッジ / Express キャップ。                                                                           |
| フラグ          | `--mcp-client-budget=N`, `--mcp-budget-mode={off,warn,enforce}`                                 | ACP チャイルドに転送されます。                                                                           |
| フラグ          | `--allow-origin`, `--allow-private-auth-base-url`                                               | ブラウザ CORS 許可リストとローカルホスト/プライベート認証プロバイダーインストールスイッチ。                   |
| フラグ          | `--prompt-deadline-ms`, `--writer-idle-timeout-ms`, `--channel-idle-timeout-ms`                 | プロンプト、SSE ライター、ACP チャイルドのアイドルライフサイクル制御。                                      |
| フラグ          | `--session-reap-interval-ms`, `--session-idle-timeout-ms`                                       | 切断済みセッションのリーピング制御。                                                                     |
| フラグ          | `--rate-limit*`                                                                                 | ティアごとの HTTP レートリミット。                                                                       |
| `settings.json` | `policy.permissionStrategy`, `policy.consensusQuorum`                                           | `MultiClientPermissionMediator` ポリシーとクォーラム。                                                  |
| `settings.json` | `context.fileName`                                                                              | ブリッジ用の `getCurrentGeminiMdFilename` オーバーライド。                                               |

マージされたリファレンスについては [`17-configuration.md`](./17-configuration.md) を参照してください。

## 注意事項と既知の制限

- `deps.fsFactory` または `deps.bridge` なしで `createServeApp` を直接呼び出すと、デフォルトで `trusted: false` になります。エージェント側の ACP `writeTextFile` は `untrusted_workspace` として拒否されます。警告は一度だけ表示されます。
- `denyBrowserOriginCors` は `Origin` を持つ**すべての**リクエストを拒否します。デモページが動作するのは、別のミドルウェアが先に同一オリジンの一致する値をストリップするためです。
- ボディパーサーの順序: `mutate({ strict: true })` を使用するルートは `express.json()` の後にのみ 401 を返します。最悪のケースは `--max-connections × express.json({limit: '10mb'})` で、飽和したループバックリスナー上で最大約 2.5 GB の一時メモリが必要になります。このトレードオフは意図的なものです。
- 1 つのプロセス内の複数のデーモンはハンドルごとの `childEnvOverrides` を使用する必要があります。`defaultSpawnChannelFactory` がスポーン時に環境をスナップショットするため、`process.env` を変更するとレースが発生します。

## 参照

- `packages/cli/src/serve/run-qwen-serve.ts`（ブートストラップ、ブート検証、グレースフルシャットダウン）
- `packages/cli/src/serve/server.ts`（`createServeApp()`、ミドルウェアとルートの組み立て）
- `packages/cli/src/serve/auth.ts`（CORS、Host 許可リスト、ベアラー認証、ミューテーションゲート）
- `packages/cli/src/serve/rate-limit.ts`（ティアごとの HTTP レートリミット）
- `packages/cli/src/serve/capabilities.ts`（ケイパビリティレジストリと条件付きアドバタイズ）
- `packages/cli/src/serve/types.ts`（`ServeOptions`、`CapabilitiesEnvelope`）
- `packages/cli/src/serve/daemon-status-provider.ts`
- `packages/cli/src/serve/permission-audit.ts`
- Issues: [#3803](https://github.com/QwenLM/qwen-code/issues/3803), [#4175](https://github.com/QwenLM/qwen-code/issues/4175)
