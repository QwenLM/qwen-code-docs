# `qwen serve` HTTP プロトコルリファレンス

[qwen-code デーモン設計](https://github.com/QwenLM/qwen-code/issues/3803) のステージ 1。全ルートはデーモンのベース URL（デフォルト `http://127.0.0.1:4170`）以下に配置されます。

## 認証

デーモンが `--token` または `QWEN_SERVER_TOKEN` 付きで起動された場合、**ループバックバインドの `/health` を除くすべてのルート**に以下が必要です:

```
Authorization: Bearer <token>
```

トークンが設定されていない場合（ループバック開発デフォルト）、このヘッダーは省略可能です。トークン比較は定数時間で行われます。`missing header` / `wrong scheme` / `wrong token` のいずれの場合も 401 レスポンスは統一されています。

**`/health` の免除**（Bctum）: ループバックバインド（`127.0.0.1` / `localhost` / `::1` / `[::1]`）では `/health` は bearer ミドルウェアより**前**に登録されるため、pod 内の liveness probe はデーモンが `--token` 付きで起動された場合でもトークンを送信する必要がありません。非ループバックバインド（`--hostname 0.0.0.0` など）では `/health` も他のルートと同様に bearer で保護されます。詳細は [`GET /health`](#get-health) セクションを参照してください。

**`--require-auth`（#4175 PR 15）。** 起動時にこのフラグを渡すと、「トークン必須」ルールがループバックにも適用されます。トークンなしでは起動に失敗し、`/health` の免除も削除されます（`/health` にも `Authorization: Bearer …` が必要になります）。

このフラグが有効な場合、グローバルの `bearerAuth` ミドルウェアが `/capabilities` を含む**すべて**のルートを保護します。そのため、**未認証**クライアントは `caps.features` をプリフライトして認証が必要かどうかを確認できません。このケースの発見手段は **401 レスポンスボディ**自体です（[認証](#authentication) セクションに記載の通り全ルートで統一）。`require_auth` ケーパビリティタグは**認証後の確認**です — クライアントが認証に成功して `/capabilities` を読み取ると、このタグの存在はデーモンが `--require-auth` で起動されたことを確認します（監査・コンプライアンス UI や「このデプロイメントはセキュリティが強化されている」を SDK クライアントが設定パネルに表示する際に有用）。Wave 4 フォローアップでルート単位の厳格モードを採用したミューテーションルートは、トークンなしのループバックデフォルトで到達された場合に `401 { code: "token_required", error: "…" }` を返しますが、`--require-auth` が有効な場合はグローバル bearer ミドルウェアがルート単位のゲートより前にリクエストをショートサーキットするため、未認証の呼び出し元が実際に受け取るのはレガシーの `Unauthorized` ボディです。

**`--allow-origin <pattern>`（T2.4 [#4514](https://github.com/QwenLM/qwen-code/issues/4514)）。** ブラウザ webUI がデーモンにクロスオリジンでアクセスしようとすると、デフォルトではブロックされます — `Origin` ヘッダーを持つリクエストはすべて `403 {"error":"Request denied by CORS policy"}` を返します。CLI/SDK クライアントは `Origin` を送信しないため、デーモンはその存在をオペレーターがオプトインしていないブラウザコンテキストからのリクエストと見なします。起動時に `--allow-origin <pattern>`（繰り返し指定可能）を渡すと、デフォルトの拒否ポリシーの代わりに許可リストを設定できます。各パターンは次のいずれかです:

- リテラル `*` — すべてのオリジンを許可。**リスク有り**: bearer トークンが設定されていない状態（`--token`、`QWEN_SERVER_TOKEN`、または起動時にトークンを必須とする `--require-auth` のいずれも未設定）で `*` が設定された場合、起動に失敗します。リストに `*` が含まれると、起動時に stderr に警告が出力されます。**推奨**: ループバックバインドでは `--require-auth` と組み合わせることで、`/health` と `/demo` も bearer で保護されます。デフォルトではループバックで bearer ミドルウェアの前に登録されるため（k8s/Compose のプローブがトークンなしで `/health` にアクセス可能）、`*` 許可リストを設定するとクロスオリジンブラウザからもアクセス可能になります。非ループバックバインドでは起動時に bearer が必須なので、`*` によって露出するのは `/health`（ステータス JSON）と `/demo`（トークンで保護されたルートを呼び出す JS を含む静的ページ）のみです — 実際の API はいずれにしても保護されます。
- 正規 URL オリジン — `<scheme>://<host>[:<port>]`。**末尾スラッシュ、パス、ユーザー情報、クエリは不可。** エントリが `new URL(pattern).origin === pattern` のラウンドトリップチェックに失敗した場合、`InvalidAllowOriginPatternError` で起動に失敗します。エラーメッセージには問題のあるパターンと正規形式が示されます。意図的に厳格な設計です: サイレントな正規化（末尾 `/` のトリミングなど）ではタイポが見逃され、曖昧な入力を受け入れてしまいます。

マッチしたオリジンはすべてのリクエストで標準 CORS レスポンスヘッダーを受け取ります:

```
Access-Control-Allow-Origin: <echoed origin>
Vary: Origin
Access-Control-Allow-Methods: GET, POST, PATCH, DELETE, OPTIONS
Access-Control-Allow-Headers: Authorization, Content-Type, X-Qwen-Client-Id, Last-Event-ID
Access-Control-Max-Age: 86400
Access-Control-Expose-Headers: Retry-After
```

`Access-Control-Allow-Origin` はリクエストのオリジンをそのまま（ブラウザが送信した大文字小文字のまま）エコーします。`*` パターンの場合でもリテラル `*` ではなくエコーします — ブラウザのキャッシュは `Vary: Origin` と組み合わせてレスポンスをキーとして使用するため、エコーにより後のリリースでスキーマ変更なしに `Access-Control-Allow-Credentials` を追加する余地が残ります。`Access-Control-Expose-Headers: Retry-After` により、ブラウザ webUI が `429` / `503` レスポンスのデーモン再試行ヒントを利用できます。`Access-Control-Allow-Credentials` は現在**送信されません**: デーモンは `Authorization` の bearer で認証を行い、`credentials: 'include'` なしでクロスオリジンでも動作します。

OPTIONS プリフライトリクエスト（`Access-Control-Request-Method` または `Access-Control-Request-Headers` を含む OPTIONS）は、上記ヘッダーとともに `204 No Content` でショートサーキットします。これは慣例的な CORS パターンで安全です — プリフライトはデーモンが受け入れるメソッド/ヘッダーを確認するだけで、後続の実際のリクエストは完全なチェーン（ホスト許可リスト → bearer 認証 → ルート）を通るため、DNS リバインディング対策と bearer 強制はステートの読み取りや変更の前に実行されます。マッチしたオリジンからの通常の OPTIONS リクエストは CORS ヘッダーが付与されてダウンストリームに流れます。

許可リストにマッチしないオリジンは引き続き `403 {"error":"Request denied by CORS policy"}` を受け取ります — デフォルトのウォールと同じエンベロープなので、ウォールのレスポンスをすでに解析しているクライアントは許可リストが設定されたデーモンを特別扱いする必要がありません。拒否パスでは `Access-Control-*` ヘッダーを**送信しません**（ブラウザは無視し、送信するとヘッダーの有無から許可リストのサイズを間接的に広告することになります）。

設定されたパターンリストは意図的に `/capabilities` にエコーしません — ブラウザ webUI は自身のオリジンを知っており（デーモンを呼び出したのですから）、リストを公開すると未認証の `/capabilities` リーダーが信頼されたオリジンをすべて列挙できてしまいます（設定ミスのデプロイメントに対するリコンとして有用）。SDK クライアントは `caps.features.allow_origin` タグを使用して「このデーモンはクロスオリジンブラウザアクセスに対応している」を確認でき、具体的なオリジンを知る必要はありません。

ループバック自己オリジンリクエスト（例: `/demo` ページが同じ `127.0.0.1:port` のデーモンを呼び出す）は、CORS ミドルウェアより**前**に実行される別の Origin ストリップシムで処理され、`127.0.0.1:port` / `localhost:port` / `[::1]:port` / `host.docker.internal:port` の `Origin` ヘッダーを削除します。そのため、`--allow-origin` の設定に関係なく通過します — デモページを動作させるためにデーモン自身のポートをリストに追加する必要はありません。

## 共通エラーシェイプ

5xx レスポンスは、元のエラーの `code` と `data` が存在する場合に含まれます（JSON-RPC スタイル — ACP SDK はエージェントから `{code, message, data}` を転送します）:

```json
{
  "error": "Internal error",
  "code": -32000,
  "data": { "reason": "model quota exceeded" }
}
```

リクエストボディの不正な JSON は次を返します:

```json
{ "error": "Invalid JSON in request body" }
```

ステータス `400` で返されます。

不明なセッション ID に対する `SessionNotFoundError` は次を返します:

```json
{ "error": "No session with id \"<sid>\"", "sessionId": "<sid>" }
```

ステータス `404` で返されます。

`cwd` がデーモンにバインドされたワークスペースに正規化されない `POST /session` に対する `WorkspaceMismatchError`（#3803 §02 — 1 デーモン = 1 ワークスペース）は `400` と以下を返します:

```json
{
  "error": "Workspace mismatch: daemon is bound to \"…\" but request asked for \"…\". …",
  "code": "workspace_mismatch",
  "boundWorkspace": "/path/the/daemon/binds",
  "requestedWorkspace": "/path/in/the/request"
}
```

プリフライトでミスマッチを検出するには: `/capabilities` から `workspaceCwd` を読み取り、`POST /session` から `cwd` を省略します（バインドされたワークスペースにフォールバックされます）。あるいは、`requestedWorkspace` にバインドされたデーモンにリクエストをルーティングしてください。

デーモンの `--max-sessions` 上限を超えた `POST /session` は `503` と `Retry-After: 5` ヘッダー、および以下を返します:

```json
{
  "error": "Session limit reached (20)",
  "code": "session_limit_exceeded",
  "limit": 20
}
```

既存セッションへのアタッチは上限にカウントされないため、アイドル状態のデーモンへの再接続は上限に達していても機能します。

`RestoreInProgressError` — `POST /session/:id/load` と `POST /session/:id/resume` のみから発生 — は `409` と `Retry-After: 5` ヘッダー（`session_limit_exceeded` と同じ）、および以下を返します:

```json
{
  "error": "Session \"<sid>\" is already being restored via session/<resume|load>; retry session/<load|resume> after it completes",
  "code": "restore_in_progress",
  "sessionId": "<sid>",
  "activeAction": "load",
  "requestedAction": "resume"
}
```

すでに `session/resume` が実行中の ID に対して `session/load` が発行された場合（またはその逆）に発火します。少なくとも `Retry-After` 秒待ってから再試行してください — 基礎となるリストアは `initTimeoutMs`（デフォルト 10s）以内に完了します。同一アクションの競合（`load` vs `load`、`resume` vs `resume`）はエラーではなく合流されます。

## ケーパビリティ

デーモンは serve ケーパビリティレジストリからサポートされる機能タグを通知します。クライアントは UI の制御を `mode` ではなく `features` に基づいて行わなければ**なりません**（設計§10 に従って）。

```
['health', 'capabilities', 'session_create', 'session_scope_override',
 'session_load', 'session_resume',
 'unstable_session_resume',
 'session_list', 'session_prompt', 'session_cancel', 'session_events',
 'slow_client_warning', 'typed_event_schema',
 'session_set_model', 'client_identity', 'client_heartbeat',
 'session_permission_vote', 'permission_vote', 'workspace_mcp', 'workspace_skills',
 'workspace_providers', 'auth_provider_install', 'workspace_memory',
 'workspace_agents', 'workspace_agent_generate', 'workspace_env',
 'workspace_preflight', 'session_context', 'session_context_usage',
 'session_supported_commands', 'session_tasks', 'session_stats',
 'session_lsp',
 'session_close', 'session_metadata', 'mcp_guardrails',
 'workspace_mcp_manage', 'mcp_guardrail_events',
 'mcp_server_runtime_mutation',
 'workspace_file_read', 'workspace_file_bytes', 'workspace_file_write',
 'session_approval_mode_control', 'workspace_tool_toggle',
 'workspace_settings', 'workspace_init', 'workspace_mcp_restart',
 'session_recap', 'session_btw', 'session_shell_command',
 'mcp_workspace_pool', 'mcp_pool_restart',
 'require_auth', 'allow_origin', 'auth_device_flow',
 'permission_mediation', 'prompt_absolute_deadline', 'writer_idle_timeout',
 'non_blocking_prompt', 'session_language', 'session_rewind',
 'workspace_hooks', 'session_hooks', 'workspace_extensions',
 'session_branch', 'rate_limit', 'workspace_reload']
```

> 条件付きタグは、対応するデプロイメントトグルがオンのときのみ表示されます（下記の表を参照）。F3 の `permission_mediation` タグは常にオンで、`modes: ['first-responder', 'designated', 'consensus', 'local-only']` を持ち、SDK クライアントがビルドでサポートされているセットを確認できます。ランタイムでアクティブなストラテジーは `body.policy.permission` にあります。

`session_scope_override` は、`POST /session` のリクエスト単位 `sessionScope` フィールドのネゴシエーションハンドルです（後述）。古いデーモンはこのフィールドを無視するため、SDK クライアントは送信前に `caps.features` でこのタグを事前確認する必要があります。

`session_load` と `session_resume` は明示的なリストアルート（`POST /session/:id/load` と `POST /session/:id/resume`）を公開します。古いデーモンはこれらのパスに `404` を返すため、SDK クライアントは呼び出し前に `caps.features` を事前確認する必要があります。`unstable_session_resume` は、基礎となる ACP メソッドが `connection.unstable_resumeSession` という名前だった頃に出荷された SDK との互換性のため、非推奨のエイリアスとして引き続き公開されています。新しいクライアントは `session_resume` を使用してください。

`slow_client_warning` は、#4175 Wave 2.5 PR 10 で導入された 2 つの SSE バックプレッシャーノブをカバーします。(a) デーモンはサブスクライバーのキューが 75% を超えたとき、オーバーフローエピソードごとに 1 回 `slow_client_warning` という合成イベントストリームフレームを発行します（キューが 37.5% 以下になると再アーム）。(b) `GET /session/:id/events` は `?maxQueued=N` クエリパラメータ（範囲 `[16, 2048]`）を受け付け、大きなリプレイリングに対するコールド再接続のために、サブスクライバーごとのバックログをあらかじめサイジングできます。デーモン全体のリングサイズは `--event-ring-size`（デフォルト **8000**、#3803 §02）で制御されます。古いデーモンはどちらの機能も持ちません。オプトインする前にこのタグを事前確認してください。

`typed_event_schema` は、SDK の `KnownDaemonEvent` スキーマと一致するデーモンイベントペイロードを公開します。古いデーモンは互換性のあるフレームをストリームする場合がありますが、SDK クライアントは型付きイベントカバレッジを前提とする前にこのタグを事前確認する必要があります。

`client_heartbeat` は `POST /session/:id/heartbeat` を公開します。古いデーモンは `404` を返します。定期的なハートビートを送信する前にこのタグを事前確認してください。

`session_close` と `session_metadata` は `DELETE /session/:id` と `PATCH /session/:id/metadata` を公開します。古いデーモンは `404` を返します。クローズまたはリネーム機能を公開する前にこれらのタグを事前確認してください。

`session_lsp` は `GET /session/:id/lsp`（デーモンクライアント向けの読み取り専用の構造化 LSP ステータススナップショット）を公開します。古いデーモンは `404` を返します。リモート LSP ステータスを公開する前にこのタグを事前確認してください。

`session_approval_mode_control`、`workspace_tool_toggle`、`workspace_init`、`workspace_mcp_restart`（issue [#4175](https://github.com/QwenLM/qwen-code/issues/4175) PR 17）は、下記「ミューテーション: 承認、ツール、init、MCP 再起動」に記載されている 4 つのミューテーション制御ルートを公開します。4 つすべては PR 15 のミューテーションゲートによって厳格にゲートされています（ベアラートークンなしで設定されたデーモンは 401 `token_required` でリジェクトします）。古いデーモンは `404` を返します。対応する機能を公開する前に各タグを事前確認してください。

`mcp_guardrails`（issue [#4175](https://github.com/QwenLM/qwen-code/issues/4175) PR 14）は MCP バジェットサーフェスをカバーします。`GET /workspace/mcp` の `clientCount` / `clientBudget` / `budgetMode` / `budgets[]` フィールド、サーバーセルの `disabledReason` フィールド、`--mcp-client-budget` / `--mcp-budget-mode` CLI フラグが対象です。古いデーモンは新しいフィールドを完全に省略します。SDK クライアントは `budgets[]` のセマンティクスに依存する前にこのタグを事前確認してください。レジストリデスクリプタには将来のフィーチャーモード公開のために `modes: ['warn', 'enforce']` も含まれています。現時点では、クライアントはスナップショットの `budgetMode` フィールドからモードを推定します。`enforce` モードでのサーバー拒否は `Object.entries(mcpServers)` の宣言順に従い決定論的です。将来スコープ優先度レイヤーが追加される場合（qwen-code が採用した場合）、claude-code の `plugin < user < project < local` 規約を反映した「最低優先度優先」に変わります。

> ⚠️ **PR 14 v1 スコープ: ワークスペース単位ではなくセッション単位。** デーモン内の各 ACP セッションは、独自の `Config` + `McpClientManager`（`acpAgent.newSessionConfig` 経由）を構築します。バジェットキャップは **セッションごとに** MCP クライアントを制限します。各セッションは転送された環境から独立して `QWEN_SERVE_MCP_CLIENT_BUDGET` を読み込みます。`--mcp-client-budget=10` で 5 つの同時 ACP セッションがある場合、実際のライブ MCP クライアント数はデーモン全体で最大 5 × 10 = 50 になります。`GET /workspace/mcp` スナップショットは **ブートストラップセッション** の `McpClientManager` アカウンティングのみを読み取ります。`budgets[0].scope: 'session'` の値がセッション単位であり、集計されていないことを示す正直なシグナルです。**Wave 5 PR 23（共有 MCP プール）** では、ワークスペーススコープのマネージャーが導入され、真のクロスセッション集計のために `scope: 'workspace'` セルがセッション単位セルとともに追加される予定です。v1 はインプロセスカウンター + ソフト強制の基盤であり、PR 23 がこの上に構築されます。

`workspace_file_read` はテキスト/リスト/stat/glob のワークスペースファイルルート
（`GET /file`、`GET /list`、`GET /glob`、`GET /stat`）をカバーします。`workspace_file_bytes`
は `GET /file/bytes` をカバーします。これは後から追加されたため、クライアントは PR19 時代のデーモンに対して
生のバイトウィンドウのサポートを事前確認できます。`workspace_file_write` は
ハッシュ対応のテキストミューテーションルート（`POST /file/write`、`POST /file/edit`）をカバーします。
write タグはルート契約が存在することを意味します。現在のデプロイメントが
匿名ミューテーションに対して開いているという意味ではありません。Write/edit は厳格なミューテーション
ルートであり、ループバック上でも設定済みのベアラートークンが必要です。

`daemon_status` は `GET /daemon/status`（下記で説明する統合された読み取り専用の
オペレーター診断スナップショット）を公開します。

**条件付きタグ。** 少数のフィーチャータグは、対応するデプロイメントトグルがオンのときのみ公開されます。タグの存在 = 動作がオン。タグの不在 = タグを事前に認識していない古いデーモン、またはオペレーターがオプトインしていない現在のデーモンのいずれかです。現在:

| タグ                        | 公開される条件 …                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `require_auth`             | デーモンが `--require-auth`（または組み込み API 経由の `requireAuth: true`）で起動された場合。ループバックバインドの `/health` を含むすべてのルートでベアラートークンが必須になります。                                                                                                                                                                                                                                                                                                                                    |
| `mcp_workspace_pool`       | 共有 MCP トランスポートプールがアクティブな場合。`QWEN_SERVE_NO_MCP_POOL=1` でプールが無効化されている場合は省略されます。                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `mcp_pool_restart`         | 共有 MCP トランスポートプールがアクティブな場合。再起動レスポンスにプール対応の複数エントリ形式が含まれることがあります。                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `allow_origin`             | T2.4 ([#4514](https://github.com/QwenLM/qwen-code/issues/4514))。デーモンが少なくとも 1 つの `--allow-origin <pattern>`（または組み込み API 経由の `allowOrigins: [...]`）で起動された場合。マッチしたオリジンからのクロスオリジンリクエストは適切な CORS レスポンスヘッダーを受け取ります。マッチしないオリジンはデフォルトの 403 のまま。設定されたパターンリストは、未認証の読者への信頼オリジンセットの漏洩を避けるため、`/capabilities` に意図的にエコーされません。ブラウザの webui は自分自身のオリジンをすでに知っています。 |
| `prompt_absolute_deadline` | `--prompt-deadline-ms` / `QWEN_SERVE_PROMPT_DEADLINE_MS` / `ServeOptions.promptDeadlineMs` が正の整数に設定されている場合。                                                                                                                                                                                                                                                                                                                                                                                        |
| `writer_idle_timeout`      | `--writer-idle-timeout-ms` / `QWEN_SERVE_WRITER_IDLE_TIMEOUT_MS` / `ServeOptions.writerIdleTimeoutMs` が正の整数に設定されている場合。                                                                                                                                                                                                                                                                                                                                                                             |
| `workspace_settings`       | 設定の永続化が利用可能な状態でデーモンが作成された場合。                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `session_shell_command`    | セッションシェル実行が明示的に有効化されている場合。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `rate_limit`               | `--rate-limit` / `QWEN_SERVE_RATE_LIMIT=1` / `ServeOptions.rateLimit` が有効な場合。                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `workspace_reload`         | ワークスペースリロードのサポートが組み込みルート設定で利用可能な場合。                                                                                                                                                                                                                                                                                                                                                                                                                                      |

`mcp_guardrails` はこの条件付きテーブルに **含まれません**。バイナリが新しい `/workspace/mcp` バジェットフィールドをサポートするたびに公開される常時オンのタグです。オペレーターがバジェットを設定していなくても新しいフィールドが返されます（`budgetMode: 'off'`、`budgets: []`）。

`mcp_guardrail_events`（issue [#4175](https://github.com/QwenLM/qwen-code/issues/4175) PR 14b）は、ポーリングループなしで MCP バジェット状態の変化を通知する型付き SSE プッシュイベントを公開します。`GET /session/:id/events` に 2 種類のフレームが届きます。

- `mcp_budget_warning` — `reservedSlots.size / clientBudget` が 75% を上回ったとき 1 回発火します。比率が 37.5%（`MCP_BUDGET_REARM_FRACTION`）を下回った後にのみ再アームします。PR 10 の `slow_client_warning` のヒステリシスと同様ですが、サブスクライバーごとのバックログレベルではなくマネージャーレベルです。ペイロード: `{ liveCount, reservedCount, budget, thresholdRatio: 0.75, mode: 'warn' | 'enforce' }`。`warn` と `enforce` の両モードで発火します。`off` では発火しません。
- `mcp_child_refused_batch` — 1 つ以上のサーバーが拒否されたときの `discoverAllMcpTools*` パスの終了時、および `readResource` の遅延スポーン拒否パスでの長さ 1 のバッチとして発火します。ペイロード: `{ refusedServers: [{ name, transport, reason: 'budget_exhausted' }, ...], budget, liveCount, reservedCount, mode: 'enforce' }`。`mode` は `'enforce'` のリテラルです（`warn` モードは拒否しません）。

どちらのイベントもセッションごとの SSE リプレイリングに存在します（`id` を持ちます）。クライアントが `Last-Event-ID` で再接続すると再受信できます。`GET /workspace/mcp` のスナップショットは、接続が長時間切断された後の状態の信頼できる情報源です。一度公開されると常時オンで、条件付きトグルはありません。SDK リデューサー状態（`DaemonSessionViewState`）は、シンプルなラグスタイル UI を望むアダプター向けに `mcpBudgetWarningCount`、`lastMcpBudgetWarning`、`mcpChildRefusedBatchCount`、`lastMcpChildRefusedBatch` を公開します。

## ルート

### `GET /health`

稼働確認プローブ。デフォルト形式では、リスナーが起動している場合 `200 {"status":"ok"}` を返します。安価で、ブリッジアクセス不要。高頻度の k8s/Compose 稼働確認プローブに適しています。

`?deep=1`（`?deep=true` またはベアの `?deep` も受け付けます）を渡すと、ブリッジの **カウンター**（情報提供のみ、真の稼働確認ではありません）を公開するプローブになります。

```json
{ "status": "ok", "sessions": 3, "pendingPermissions": 1 }
```

> ⚠️ ディーププローブは **情報提供用** であり、実際の稼働確認ではありません。カウンターアクセサー（`bridge.sessionCount`、`bridge.pendingPermissionCount`）を読み取りますが、これらは単純な Map サイズゲッターです。個々の子プロセス/チャネルにはアクセスせず、ウェッジ状態のセッションは検出できません。「このデーモンをローテーションから外す」トリガーではなく、キャパシティダッシュボード（現在の同時実行数 vs `--max-sessions`、キューの深さ）に使用してください。カスタムブリッジ実装のゲッターが例外をスローした場合、`503 {"status":"degraded"}` レスポンスが理論的に可能ですが、実際のブリッジのゲッターはそうなりません。通常の動作では、ディーププローブは常に 200 を返します。真の稼働確認には、リスナーが TCP 接続を受け付けるかどうか（つまり `?deep` なしのデフォルト `/health`）を使用してください。

**認証:** **非ループバックバインドでのみ**必要です。ループバック（`127.0.0.1`、`::1`、`[::1]`）では、`/health` はベアラーミドルウェアの前に登録されるため、ポッド内の k8s/Compose プローブはトークンを持つ必要がありません。非ループバック（`--hostname 0.0.0.0` など）では、ルートはベアラーミドルウェアの後に登録され、有効なトークンなしに 401 を返します。そうしないと、未認証の呼び出し元が任意のアドレスをプローブして `qwen serve` の存在を確認でき、ポートスキャンと組み合わさると低重大度の情報漏洩になります。CORS 拒否とホスト許可リストはループバック免除でも適用されます。

### `GET /daemon/status`

読み取り専用のオペレーター診断。`/health` とは異なり、通常のデーモン API です。
ベアラー認証とレート制限の後に登録されます。ループバックバインドも同様です。クエリパラメータ:

- `detail=summary`（デフォルト）はインメモリのデーモン状態のみを読み取ります。
- `detail=full` はさらにライブセッション診断、ACP 接続診断、認証デバイスフローカウント、
  ワークスペースステータスセクションを含みます。
- その他の `detail` は `400 { "code": "invalid_detail" }` を返します。

`summary` は意図的にワークスペースステータスメソッドのクエリ、ACP
子プロセスの起動、セッションのスポーンを行いません。`full` は各ワークスペースセクションを独立してクエリします。
タイムアウトまたは例外が発生すると、そのセクションのみ `unavailable` とマークされ、
`workspace_status_unavailable` イシューが追加されます。

レスポンス形式:

```json
{
  "v": 1,
  "detail": "summary",
  "generatedAt": "2026-06-16T00:00:00.000Z",
  "status": "ok",
  "issues": [],
  "daemon": {
    "pid": 12345,
    "uptimeMs": 3600000,
    "mode": "http-bridge",
    "workspaceCwd": "/repo",
    "qwenCodeVersion": "0.18.1",
    "daemonId": "serve-..."
  },
  "security": {
    "tokenConfigured": true,
    "requireAuth": false,
    "loopbackBind": true,
    "allowOriginConfigured": false,
    "allowOriginMode": "none",
    "sessionShellCommandEnabled": false
  },
  "limits": {
    "maxSessions": 20,
    "maxPendingPromptsPerSession": 5,
    "listenerMaxConnections": 256,
    "eventRingSize": 8000,
    "promptDeadlineMs": null,
    "writerIdleTimeoutMs": null,
    "channelIdleTimeoutMs": 0,
    "sessionIdleTimeoutMs": 1800000,
    "acpConnectionCap": 64
  },
  "runtime": {
    "sessions": { "active": 0 },
    "permissions": { "pending": 0, "policy": "first-responder" },
    "channel": { "live": false },
    "transport": {
      "restSseActive": 0,
      "acp": {
        "enabled": true,
        "connections": 0,
        "connectionStreams": 0,
        "sessionStreams": 0,
        "sseStreams": 0,
        "wsStreams": 0,
        "pendingClientRequests": 0
      }
    }
  }
}
```

`status` は、いずれかの問題がエラー重大度を持つ場合は `error`、警告重大度を持つ場合は `warning`、それ以外は `ok` となります。問題コードは安定しており、`session_capacity_high`、`connection_capacity_high`、`pending_permissions`、`acp_channel_down`、`preflight_error`、`mcp_budget_warning`、`mcp_budget_exhausted`、`rate_limit_hits`、`workspace_status_unavailable` が含まれます。リスナーの準備完了後、フルランタイムがマウントされるまでの短い時間帯では、`/daemon/status` が `daemon_runtime_starting` を報告することがあります。非同期ランタイムのマウントに失敗した場合は `daemon_runtime_failed` を報告し、ステータス以外のランタイムルートは `503` を返します。

セキュリティ: レスポンスにはベアラートークン、クライアント ID、完全な ACP 接続 ID、デバイスフローのユーザーコード、確認 URL は含まれません。`summary` はデーモンのログパスを省略し、`full` は認証済みオペレーター向けに含める場合があります。

### `GET /capabilities`

```json
{
  "v": 1,
  "protocolVersions": {
    "current": "v1",
    "supported": ["v1"]
  },
  "mode": "http-bridge",
  "features": ["health", "daemon_status", "capabilities", "..."],
  "modelServices": [],
  "workspaceCwd": "/canonical/path/to/workspace"
}
```

安定したコントラクト: `v` がインクリメントされた場合、フレームレイアウトが後方互換性のない方法で変更されたことを意味します。

> **`protocolVersions`** は、デーモンが対応しているサーブプロトコルバージョンを示します。`current` はデーモンの優先プロトコルバージョンであり、`supported` は互換性のあるセットです。特定のプロトコルを必要とするクライアントは `supported` を確認してください。機能固有の UI は引き続き `features` でゲートを設けてください。v=1 への追加: 古い v=1 デーモンはこのフィールドを省略するため、古いビルドをターゲットにする SDK クライアントはオプションとして扱う必要があります。

> **`modelServices` は Stage 1 では常に `[]` です。** エージェントは単一のデフォルトモデルサービスを使用し、ワイヤー経由でそれを列挙しません。Stage 2 では登録済みモデルアダプターからこれを取得し、SDK クライアントがサービスピッカーを構築できるようにしますが、それまではこのフィールドが空でないことに依存しないでください。

> **`workspaceCwd`** は、このデーモンがバインドされる正規の絶対パスです（#3803 §02 — デーモン 1 つ = ワークスペース 1 つ）。(a) `/session` をポストする前の不一致検出、(b) `POST /session` で `cwd` を省略（ルートはこのパスにフォールバック）に使用してください。マルチワークスペース環境では、異なるポートで複数のデーモンが公開され、それぞれに独自の `workspaceCwd` があります。v=1 への追加: §02 以前の v=1 デーモンはこのフィールドを省略するため、古いビルドをターゲットにするクライアントは利用前に null チェックを行ってください。

### 読み取り専用ランタイムステータスルート

これらのルートはデーモン側のランタイムスナップショットを報告します。追加的な v1 ルートであり、状態を変更せず、サーブプロトコルのバージョンも変更しません。ワークスペースステータスルートは、クライアントが GET ルートをポーリングしたからといって ACP 子プロセスを起動しません。デーモンがアイドル状態の場合、空のスナップショットと共に `initialized: false` を返します。セッションステータスルートは有効なセッションを必要とし、不明な ID に対して標準の `404 SessionNotFoundError` 形式を使用します。

ケーパビリティタグ:

- `workspace_mcp` → `GET /workspace/mcp`
- `workspace_skills` → `GET /workspace/skills`
- `workspace_providers` → `GET /workspace/providers`
- `workspace_env` → `GET /workspace/env`
- `workspace_preflight` → `GET /workspace/preflight`
- `session_context` → `GET /session/:id/context`
- `session_supported_commands` → `GET /session/:id/supported-commands`
- `session_tasks` → `GET /session/:id/tasks`

共通ステータスセル:

```ts
type DaemonStatus =
  | 'ok'
  | 'warning'
  | 'error'
  | 'disabled'
  | 'not_started'
  | 'unknown';

type DaemonErrorKind =
  | 'missing_binary'
  | 'blocked_egress'
  | 'auth_env_error'
  | 'init_timeout'
  | 'protocol_error'
  | 'missing_file'
  | 'parse_error';

interface DaemonStatusCell {
  kind: string;
  status: DaemonStatus;
  error?: string;
  errorKind?: DaemonErrorKind;
  hint?: string;
}
```

`errorKind` は、`/workspace/preflight`、`/workspace/env`、および（将来的に）MCP ガードレールで共有されるクローズドな列挙型です。これにより SDK クライアントは、自由形式のメッセージを解析する代わりに、カテゴリ別に修復方法をレンダリングできます。PR 13（#4175）で上記の 7 つのリテラルが導入されました。PR 14 では、エグレスプローブが実装されると `blocked_egress` が設定されます。

ステータスペイロードは、MCP の環境変数値、ヘッダー、OAuth/サービスアカウントの詳細、プロバイダー API キー、プロバイダーの `baseUrl` / `envKey`、スキル本体、スキルのファイルシステムパス、フック定義、シークレット環境変数の値を公開しません。`/workspace/env` は、ホワイトリストに登録された環境変数の**存在**のみを報告します。プロキシ URL は認証情報が除去され、ワイヤーに到達する前に `host:port` に縮小されます。

### `GET /workspace/mcp`

```json
{
  "v": 1,
  "workspaceCwd": "/canonical/path",
  "initialized": true,
  "discoveryState": "completed",
  "servers": [
    {
      "kind": "mcp_server",
      "status": "ok",
      "name": "docs",
      "mcpStatus": "connected",
      "transport": "stdio",
      "disabled": false,
      "description": "Documentation server",
      "extensionName": "docs-ext"
    }
  ]
}
```

`discoveryState` は `not_started`、`in_progress`、`completed` のいずれかです。`transport` は `stdio`、`sse`、`http`、`websocket`、`sdk`、`unknown` のいずれかです。ディスカバリーが成功した場合、`errors` は省略されます。

**MCP クライアントガードレール（issue [#4175](https://github.com/QwenLM/qwen-code/issues/4175) PR 14）。** PR-14 以降のデーモンは、4つの追加フィールドとワークスペースレベルのセルでペイロードを拡張します：

```jsonc
{
  "v": 1,
  "workspaceCwd": "/canonical/path",
  "initialized": true,
  "discoveryState": "completed",
  "clientCount": 3,
  "clientBudget": 2,
  "budgetMode": "enforce",
  "budgets": [
    {
      "kind": "mcp_budget",
      "scope": "session",
      "status": "error",
      "errorKind": "budget_exhausted",
      "hint": "Raise --mcp-client-budget or remove servers from mcpServers config.",
      "liveCount": 2,
      "budget": 2,
      "mode": "enforce",
      "refusedCount": 1,
    },
  ],
  "servers": [
    {
      "kind": "mcp_server",
      "status": "ok",
      "name": "a",
      "mcpStatus": "connected",
      "transport": "stdio",
      "disabled": false,
    },
    {
      "kind": "mcp_server",
      "status": "ok",
      "name": "b",
      "mcpStatus": "connected",
      "transport": "stdio",
      "disabled": false,
    },
    {
      "kind": "mcp_server",
      "status": "error",
      "name": "c",
      "mcpStatus": "disconnected",
      "transport": "stdio",
      "disabled": false,
      "disabledReason": "budget",
      "errorKind": "budget_exhausted",
      "hint": "...",
    },
  ],
}
```

`budgetMode` は `enforce`、`warn`、`off` のいずれかです。`clientBudget` はバジェットが設定されていない場合は省略されます。`budgets[]` は PR-14 以降のデーモンでは**常に配列**です（`budgetMode === 'off'` の場合は空になることがあります）；PR-14 より前のデーモンではこのフィールド自体が省略されます。v1 では `scope: 'session'` を持つセルが1つ出力されます（セッション単位の強制 — 理由は上記の capabilities セクションを参照）。コンシューマーは認識できない `scope` 値を持つ追加の `budgets[]` エントリを許容しなければなりません — Wave 5 PR 23 でスキーマバンプなしに `scope: 'workspace'`（または `'pool'`）がセッション単位のセルと並んで追加される予定です。

サーバーごとのセルにある `disabledReason` は、オペレーターが無効化した場合（`'config'` — `disabledMcpServers` 設定リスト）とバジェット拒否の場合（`'budget'` — 検出されたが `enforce` モードにより接続されなかった）を区別します。拒否は `Object.entries(mcpServers)` の宣言順に基づいて決定論的に行われます。サーバーごとの `status: 'error', errorKind: 'budget_exhausted'` は、生の `mcpStatus: 'disconnected'`（これ自体は正しいが、オペレーター向けの深刻度ではない）を上書きします。

PR 14 v1 のバジェット強制は**ワークスペース単位ではなくセッション単位**です。Mode B デーモンは #4113 以降プロセスレベルでは `1 デーモン = 1 ワークスペース × N セッション` ですが、`McpClientManager` は各 ACP セッションの `Config` 内で `acpAgent.newSessionConfig` を通じて構築されるため、N セッションそれぞれが独自のキャップを強制します。スナップショットはブートストラップセッションの視点を表します。Wave 5 PR 23 では、ワークスペーススコープの共有 MCP プールが導入され、真のワークスペース単位の強制へと昇格する予定です。

**バジェット圧力の検出。** 2つの方法があり、どちらも PR-14b 以降で利用可能です：

- **プッシュイベント**（`mcp_guardrail_events` で告知）：`GET /session/:id/events` にサブスクライブし、`KnownDaemonEvent` を通じて `mcp_budget_warning` / `mcp_child_refused_batch` フレームを絞り込みます。ステートマシンは75%を上回るたびに1回発火します（37.5%を下回ると再アーム）；拒否は `enforce` モードでのディスカバリーパスごとに1回まとめられます。
- **スナップショットポーリング**（`mcp_guardrails` で告知）：`GET /workspace/mcp` でセッションごとのバジェットセル（`budgets[0]`）を確認します：

- `budgets[0].status === 'warning'` ⇔ `liveCount >= 0.75 * clientBudget`（PR 14b のプッシュイベントが使用するヒステリシス閾値と一致）。
- `budgets[0].status === 'error'` ⇔ `refusedCount > 0`（このディスカバリーパスで1つ以上のサーバーが拒否された）。
- `budgets[0].status === 'ok'` ⇔ 75%閾値を下回り、かつ拒否なし。

推奨ポーリング間隔：すでに `/workspace/mcp` をポーリングしているものに合わせてください；スナップショットは軽量で、バジェットセルに追加のディスカバリーコストはありません。プッシュイベントにサブスクライブする SDK クライアントも、長時間切断後の状態回復にスナップショットが役立ちます（SSE リプレイリングの深さは有限です — `--event-ring-size`、デフォルト 8000 — リングのカバレッジより長くオフラインだったクライアントはスナップショット再同期にフォールバックします）。

### `GET /workspace/skills`

```json
{
  "v": 1,
  "workspaceCwd": "/canonical/path",
  "initialized": true,
  "skills": [
    {
      "kind": "skill",
      "status": "ok",
      "name": "review",
      "description": "Review code",
      "level": "project",
      "modelInvocable": true,
      "argumentHint": "[path]"
    }
  ]
}
```

`level` は `project`、`user`、`extension`、`bundled` のいずれかです。ディスカバリーが成功した場合、`errors` は省略されます。

### `GET /workspace/providers`

```json
{
  "v": 1,
  "workspaceCwd": "/canonical/path",
  "initialized": true,
  "current": { "authType": "qwen", "modelId": "qwen3(qwen)" },
  "providers": [
    {
      "kind": "model_provider",
      "status": "ok",
      "authType": "qwen",
      "current": true,
      "models": [
        {
          "modelId": "qwen3(qwen)",
          "baseModelId": "qwen3",
          "name": "Qwen 3",
          "description": null,
          "contextLimit": 4096,
          "isCurrent": true,
          "isRuntime": false
        }
      ]
    }
  ]
}
```

モデルは認証タイプ別にグループ化されます。プロバイダー接続の診断は `/workspace/preflight` の `providers` セルにあります；環境プリフライトは `/workspace/preflight` と `/workspace/env`（以下）にあります。スナップショットの構築が成功した場合、`errors` は省略されます。

### `GET /workspace/env`

デーモンプロセスのランタイム、プラットフォーム、サンドボックス、プロキシ、およびホワイトリストに登録されたシークレット環境変数の**存在**をレポートします。常に `process.*` の状態から応答します — デーモンはこのルートを提供するために ACP チャイルドをスポーンすることはなく、ACP が起動中でもアイドル中でもレスポンスは同一です。`acpChannelLive` フィールドは情報提供のみを目的としています。

```json
{
  "v": 1,
  "workspaceCwd": "/canonical/path",
  "initialized": true,
  "acpChannelLive": false,
  "cells": [
    { "kind": "runtime", "name": "node", "status": "ok", "value": "22.4.0" },
    { "kind": "platform", "name": "darwin", "status": "ok", "value": "arm64" },
    {
      "kind": "sandbox",
      "name": "SANDBOX",
      "status": "disabled",
      "present": false
    },
    {
      "kind": "proxy",
      "name": "HTTPS_PROXY",
      "status": "ok",
      "present": true,
      "value": "proxy.internal:1080"
    },
    {
      "kind": "proxy",
      "name": "NO_PROXY",
      "status": "disabled",
      "present": false
    },
    {
      "kind": "env_var",
      "name": "OPENAI_API_KEY",
      "status": "ok",
      "present": true
    },
    {
      "kind": "env_var",
      "name": "ANTHROPIC_BASE_URL",
      "status": "disabled",
      "present": false
    }
  ]
}
```

セルの形状:

```ts
type DaemonEnvKind =
  | 'runtime' // name: 'node' | 'bun' | 'unknown'; value: process.versions.node
  | 'platform' // name: process.platform; value: process.arch
  | 'sandbox' // name: 'SANDBOX' | 'SEATBELT_PROFILE'; value optional
  | 'proxy' // name: HTTP_PROXY | HTTPS_PROXY | NO_PROXY | ALL_PROXY; value: redacted host
  | 'env_var'; // presence-only; value field is ALWAYS omitted

interface DaemonEnvCell extends DaemonStatusCell {
  kind: DaemonEnvKind;
  name: string;
  present?: boolean;
  value?: string;
}
```

**マスキングポリシー。** `kind: 'env_var'` のセルには `value` フィールドが含まれない。クライアントは `present: boolean` のみを参照できる。`kind: 'proxy'` のセルは、生の環境変数値に対してクレデンシャルのマスキング処理（`redactProxyCredentials`）を行い、さらに `URL` パースを通すことで、ワイヤ上には `host:port` のみが送出される。`NO_PROXY` はURLではなくホストリストであるため、マスキング処理はそのまま通過させる。現在列挙されているシークレット環境変数は `OPENAI_API_KEY`、`ANTHROPIC_API_KEY`、`GEMINI_API_KEY`、`GOOGLE_API_KEY`、`DASHSCOPE_API_KEY`、`OPENROUTER_API_KEY`、`QWEN_SERVER_TOKEN` である。それ以外の環境変数は列挙されないため、誤って設定されたシークレットは見えないまま保たれる。

### `GET /workspace/preflight`

デーモンの準備状態チェックを報告する。**デーモンレベルのセル**（`node_version`、`cli_entry`、`workspace_dir`、`ripgrep`、`git`、`npm`）は常に `process.*` および `node:fs` から取得される。**ACPレベルのセル**（`auth`、`mcp_discovery`、`skills`、`providers`、`tool_registry`、`egress`）はACPチャイルドプロセスが稼働中である必要があり、デーモンがアイドル状態のときは `status: 'not_started'` のプレースホルダーが返される。このルートはセルを埋めるためだけにACPを起動することはなく、該当するセルは `not_started` にフォールバックする。

アイドル状態のレスポンス（ACPチャイルドなし）:

```json
{
  "v": 1,
  "workspaceCwd": "/canonical/path",
  "initialized": true,
  "acpChannelLive": false,
  "cells": [
    {
      "kind": "node_version",
      "status": "ok",
      "locality": "daemon",
      "detail": { "version": "22.4.0", "required": ">=22" }
    },
    {
      "kind": "cli_entry",
      "status": "ok",
      "locality": "daemon",
      "detail": { "path": "/usr/local/bin/qwen", "source": "process.argv[1]" }
    },
    {
      "kind": "workspace_dir",
      "status": "ok",
      "locality": "daemon",
      "detail": { "path": "/canonical/path" }
    },
    { "kind": "ripgrep", "status": "ok", "locality": "daemon" },
    {
      "kind": "git",
      "status": "ok",
      "locality": "daemon",
      "detail": { "version": "2.45.0" }
    },
    {
      "kind": "npm",
      "status": "ok",
      "locality": "daemon",
      "detail": { "version": "10.7.0" }
    },
    {
      "kind": "auth",
      "status": "not_started",
      "locality": "acp",
      "hint": "spawn a session to populate"
    },
    {
      "kind": "mcp_discovery",
      "status": "not_started",
      "locality": "acp",
      "hint": "spawn a session to populate"
    },
    {
      "kind": "skills",
      "status": "not_started",
      "locality": "acp",
      "hint": "spawn a session to populate"
    },
    {
      "kind": "providers",
      "status": "not_started",
      "locality": "acp",
      "hint": "spawn a session to populate"
    },
    {
      "kind": "tool_registry",
      "status": "not_started",
      "locality": "acp",
      "hint": "spawn a session to populate"
    },
    {
      "kind": "egress",
      "status": "not_started",
      "locality": "acp",
      "hint": "egress probing lands in PR 14 (#4175)"
    }
  ]
}
```

セルの形状：

```ts
type DaemonPreflightKind =
  | 'node_version'
  | 'cli_entry'
  | 'workspace_dir'
  | 'ripgrep'
  | 'git'
  | 'npm'
  | 'auth'
  | 'mcp_discovery'
  | 'skills'
  | 'providers'
  | 'tool_registry'
  | 'egress';

interface DaemonPreflightCell extends DaemonStatusCell {
  kind: DaemonPreflightKind;
  locality: 'daemon' | 'acp';
  detail?: Record<string, unknown>;
}
```

`errorKind` のセマンティクス：

- `missing_binary` — Node のバージョンが要件を下回っている、`QWEN_CLI_ENTRY` が存在しない、
  ripgrep / git / npm が PATH に存在しない（オプションのバイナリに対しては
  エラーではなく警告として扱われる）。
- `missing_file` — `boundWorkspace` が存在しないか、ディレクトリでない場合；
  スキルの解析エラーで、存在しないか読み取れないファイルを指している。
- `parse_error` — `SKILL.md` の解析失敗、不正な形式の設定 JSON。
- `auth_env_error` — `validateAuthMethod` が非 null の失敗文字列を返した場合、
  またはプロバイダー解決から `ModelConfigError` サブクラスが伝播した場合。
- `init_timeout` — ブリッジ内の `withTimeout` が reject した場合（ACP ラウンドトリップを
  待機中の実際のタイムアウト）。`BridgeTimeoutError` 型クラスを通じて識別される。
  注：`connecting > 0` を持つ一時的な `mcp_discovery` の `warning` セルはこの種類を
  持たない — それは通常のハンドシェイク進行中の状態であり、実際のタイムアウトとは異なる。
- `protocol_error` — チャンネルがリクエスト中に閉じられたため、またはツールレジストリが
  予期せず存在しなかったため、ACP の `extMethod` が拒否された場合。
- `blocked_egress` — PR 14 (#4175) のために予約済み。PR 13 では
  `egress` セルは `status: 'not_started'` のままとなる。

プリフライトリクエストの処理中にブリッジが ACP 子プロセスに到達できない場合
（例：リクエスト中のチャンネル閉鎖）、エンベロープの `errors` 配列には
失敗を説明する単一の `ServeStatusCell` が含まれ、セルは `not_started` の
ACP プレースホルダーにフォールバックする。デーモンレベルのセルは引き続き返される。

### ワークスペースのファイルルート

すべてのファイルパスはデーモンのバウンドワークスペースを通じて解決される。レスポンスには
ワークスペース相対パスが使用され、通常の成功ケースでは絶対ファイルシステムパスは返されない。
ファイルの成功レスポンスには以下が含まれる：

```http
Cache-Control: no-store
X-Content-Type-Options: nosniff
```

ファイルシステムエラーはこの JSON 形式を使用する：

```json
{
  "errorKind": "hash_mismatch",
  "error": "expected sha256:..., found sha256:...",
  "hint": "re-read the file and retry with the latest hash",
  "status": 409
}
```

`errorKind` の値には `path_outside_workspace`、`symlink_escape`、
`path_not_found`、`binary_file`、`file_too_large`、`untrusted_workspace`、
`permission_denied`、`parse_error`、`hash_mismatch`、
`file_already_exists`、`text_not_found`、`ambiguous_text_match` が含まれる。

#### `GET /file`

テキストファイルを読み取る。クエリパラメーター：`path`（必須）、`maxBytes`、`line`、
`limit`。デーモンはバイナリファイルとテキスト読み取り上限を超えるファイルを拒否する。
レスポンスには `hash`（ファイル全体のディスク上の生バイトに対する SHA-256 ダイジェスト）が
含まれ、`line`、`limit`、`maxBytes` でスライスが返された場合も同様である。

```json
{
  "kind": "file",
  "path": "src/index.ts",
  "content": "export {};\n",
  "encoding": "utf-8",
  "bom": false,
  "lineEnding": "lf",
  "sizeBytes": 11,
  "returnedBytes": 11,
  "truncated": false,
  "hash": "sha256:...",
  "matchedIgnore": null,
  "originalLineCount": null
}
```

#### `GET /file/bytes`

デコードせずにファイルから生バイトを読み取る。クエリパラメーター：`path`（必須）、
`offset`（デフォルト `0`）、`maxBytes`（デフォルト `65536`、最大 `262144`）。
このルートはファイル全体を読み込まずに、大きなバイナリファイルへの境界付きウィンドウをサポートする。
返されたウィンドウがファイル全体をカバーする場合にのみ、レスポンスに `hash` が含まれる。

```json
{
  "kind": "file_bytes",
  "path": "assets/logo.png",
  "offset": 0,
  "sizeBytes": 3912,
  "returnedBytes": 3912,
  "truncated": false,
  "contentBase64": "...",
  "hash": "sha256:..."
}
```

#### `POST /file/write`

テキストファイルを作成または置換します。これは厳格なミューテーションルートです。ループバック上でトークンが設定されていない場合、`401 { "code": "token_required" }` を返します。
`--require-auth` を指定すると、グローバルベアラーミドルウェアがルート実行前に未認証リクエストを拒否します。

Body:

```json
{
  "path": "src/new.ts",
  "content": "export const value = 1;\n",
  "mode": "create"
}
```

```json
{
  "path": "src/existing.ts",
  "content": "export const value = 2;\n",
  "mode": "replace",
  "expectedHash": "sha256:..."
}
```

`mode` は `create` または `replace` でなければなりません。`create` は既存ファイルを上書きしません（`409 file_already_exists`）。`replace` は `expectedHash` が必要です。ハッシュが欠落または不正な場合は `400 parse_error`、古いハッシュは `409 hash_mismatch` になります。`expectedHash` は `sha256:` に64文字の小文字16進数を続けたもので、ディスク上の生バイトから計算されます。

`bom`、`encoding`、`lineEnding` を指定できます。置換時はデフォルトで既存ファイルのエンコーディングプロファイルが保持されます。明示的なフィールドを指定するとそれが優先されます。バイナリ書き込みはスコープ外です。

デーモンはターゲットディレクトリのランダムな一時ファイルに書き込み、サポートされている場合は fsync を実行し、`rename()` 直前に現在のハッシュを再確認してからリネームします。これにより、ファイルの部分的な観測を防ぎ、同一ファイルへのデーモン起因の書き込みをシリアル化します。ただし、カーネルレベルのクロスプロセスなコンペアアンドスワップではないため、最終ハッシュチェックとリネームの間のわずかな時間に外部エディタが競合する可能性があります。

```json
{
  "kind": "file_write",
  "path": "src/existing.ts",
  "mode": "replace",
  "created": false,
  "sizeBytes": 24,
  "hash": "sha256:...",
  "encoding": "utf-8",
  "bom": false,
  "lineEnding": "lf",
  "matchedIgnore": null
}
```

#### `POST /file/edit`

既存のテキストファイルに対して、1箇所だけテキストを正確に置換します。これも厳格なミューテーションルートであり、`expectedHash` が必要です。

```json
{
  "path": "src/config.ts",
  "oldText": "timeout: 30000",
  "newText": "timeout: 60000",
  "expectedHash": "sha256:..."
}
```

`oldText` は空にできず、ちょうど1回だけ存在する必要があります。マッチしない場合は `422 text_not_found`、複数マッチする場合は `422 ambiguous_text_match` を返します。ルートはエンコーディング、BOM、行末を保持し、アトミックなリネームの直前に `expectedHash` を再確認します。

無視されたパスへの明示的な書き込み・編集は、認証済みの呼び出し元がパスを指定しているため許可されます。成功レスポンスと監査イベントには `matchedIgnore: "file" | "directory" | null` が含まれます。

```json
{
  "kind": "file_edit",
  "path": "src/config.ts",
  "replacements": 1,
  "sizeBytes": 128,
  "hash": "sha256:...",
  "encoding": "utf-8",
  "bom": false,
  "lineEnding": "lf",
  "matchedIgnore": null
}
```

### `GET /session/:id/context`

```json
{
  "v": 1,
  "sessionId": "<sid>",
  "workspaceCwd": "/canonical/path",
  "state": {
    "models": {},
    "modes": {},
    "configOptions": []
  }
}
```

`state` は `POST /session`、`POST /session/:id/load`、`POST /session/:id/resume` で使用されるのと同じ ACP モデル/モード/設定オプションの形式を反映しています。

### `GET /session/:id/supported-commands`

```json
{
  "v": 1,
  "sessionId": "<sid>",
  "availableCommands": [
    {
      "name": "init",
      "description": "Initialize the project",
      "input": null,
      "_meta": { "source": "builtin" }
    }
  ],
  "availableSkills": ["review"]
}
```

`availableCommands` は `available_commands_update` SSE 通知で使用されるのと同じコマンドのスナップショットです。`availableSkills` はスキル名のみをリストします。クライアントはこのルートからスキルの本文やパスを期待してはなりません。

### `GET /session/:id/tasks`

```json
{
  "v": 1,
  "sessionId": "<sid>",
  "now": 1700000000000,
  "tasks": [
    {
      "kind": "agent",
      "id": "agent-1",
      "label": "reviewer: check failure",
      "description": "check failure",
      "status": "running",
      "startTime": 1699999999000,
      "runtimeMs": 1000,
      "outputFile": "/tmp/agent-1.jsonl",
      "isBackgrounded": true,
      "subagentType": "reviewer"
    }
  ]
}
```

このルートは読み取り専用の帯域外スナップショットです。意図的にプロンプトではなく、セッションがストリーミング中でもクエリできます。レスポンスにはエージェント、シェル、モニタータスクレジストリのホワイトリスト済みメタデータのみが含まれます。コントローラー、タイマー、オフセット、保留中のメッセージ、生のレジストリオブジェクトは公開されません。

### `GET /session/:id/lsp`

```json
{
  "v": 1,
  "sessionId": "<sid>",
  "workspaceCwd": "/canonical/path",
  "enabled": true,
  "configuredServers": 1,
  "readyServers": 1,
  "failedServers": 0,
  "inProgressServers": 0,
  "notStartedServers": 0,
  "servers": [
    {
      "name": "typescript",
      "status": "READY",
      "languages": ["typescript", "javascript"],
      "transport": "stdio",
      "command": "typescript-language-server"
    }
  ]
}
```

`status` は `NOT_STARTED`、`IN_PROGRESS`、`READY`、`FAILED` のいずれかです。失敗したサーバーには、利用可能な場合にオプションの `error` が付与されます。LSP が無効（ベアモードを含む）の場合、HTTP 200 が返され、`enabled: false`、カウントはゼロ、`servers: []` となります。LSP が有効でサーバーが設定されていない場合は `enabled: true`、`configuredServers: 0`、`servers: []` が返されます。クライアントが存在する前に初期化が失敗した場合、レスポンスに `initializationError` が含まれることがあります。ライブクライアントがスナップショットを提供できない場合は、`statusUnavailable: true` が含まれます。

このルートは安定したクライアント向けフィールドのみを公開します。プロセス ID、スポーン引数、stderr テール、ルート URI、ワークスペースフォルダーパスなどのデバッグ内部情報は意図的に省略されています。

### `POST /session`

新しいエージェントを生成するか、既存のエージェントにアタッチします（`sessionScope: 'single'`、デフォルト）。

リクエスト:

```json
{
  "cwd": "/absolute/path/to/workspace",
  "modelServiceId": "qwen-prod",
  "sessionScope": "thread"
}
```

| フィールド       | 必須 | 備考                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ---------------- | ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `cwd`            | いいえ | デーモンのバインドされたワークスペースに一致する絶対パス。省略した場合、ルートは `boundWorkspace` にフォールバックします（`/capabilities.workspaceCwd` から読み取ってください）。空でない `cwd` が一致しない場合は `400 workspace_mismatch` を返します（#3803 §02 — 1 デーモン = 1 ワークスペース）。ワークスペースパスは `realpathSync.native` を介して正規化されます（存在しないパスには解決のみのフォールバックあり）。大文字小文字を区別しないファイルシステムでも、スペルの違いによりセッションが拒否されることはありません。                                                                                                                                                                          |
| `modelServiceId` | いいえ | エージェントがルーティングする設定済み_モデルサービス_（バックエンドプロバイダー — Alibaba ModelStudio、OpenRouter など）を選択します。省略した場合、エージェントはデフォルトを使用します。ワークスペースにすでにセッションがある場合、既存のセッションで `setSessionModel` を呼び出し、`model_switched` をブロードキャストします。`POST /session/:id/model` の `modelId` とは異なり、こちらはすでにバインドされたサービス**内**のモデルを選択します。`/capabilities` の `modelServices` 配列は設定済みサービスを広告するために予約されています。Stage 1 では常に `[]` です（エージェントのデフォルトサービスが使用され、HTTP では列挙されません）。 |
| `sessionScope`   | いいえ | セッション共有のリクエストごとのオーバーライド。`'single'`（デーモン全体のデフォルト）は、同じワークスペースへの2回目の `POST /session` で既存のセッションを再利用します（`attached: true`）。`'thread'` は毎回新しい別のセッションを強制します。デーモン全体のデフォルトを継承するには省略してください。列挙値以外の値は `400 { code: 'invalid_session_scope' }` を返します。古いデーモン（#4175 PR 5 以前）はこのフィールドを暗黙的に無視します。送信前に `caps.features.session_scope_override` を事前確認してください。デーモン全体のデフォルトは本番環境では `'single'` にハードコードされています。#4175 ではフォローアップで `--sessionScope` CLI フラグが追加される可能性があります。         |

レスポンス:

```json
{
  "sessionId": "<uuid>",
  "workspaceCwd": "/canonical/path",
  "attached": false
}
```

`attached: true` は、そのワークスペース用のセッションがすでに存在し、それを共有していることを意味します。

同じワークスペースへの並行する `POST /session` 呼び出しは1つのスポーンに**集約**されます。両方の呼び出し元は同じ `sessionId` を受け取り、`attached: false` を報告するのは1つだけです。基盤となるスポーンが失敗した場合（初期化タイムアウト、不正なエージェント出力、OOM）、**集約されたすべての呼び出し元が同じエラーを受け取ります**。処理中のスロットはクリアされるため、後続の呼び出しでゼロから再試行できます。

> ⚠️ **新規セッションでの `modelServiceId` 拒否は HTTP レスポンスでは無音です。** 不正な `modelServiceId`（タイポ、未設定のサービス）は作成を 500 エラーにしません。セッションはエージェントのデフォルトモデルで動作し続けるため、呼び出し元はモデル切り替えを再試行できる `sessionId` を引き続き受け取ります（`POST /session/:id/model` 経由）。
> 表示される失敗シグナルは、セッションの SSE ストリームの `model_switch_failed` イベントで、スポーンハンドシェイクと最初のサブスクライブの間に発火します。**このイベントを観察する必要があるサブスクライバーは、最初の `GET /session/:id/events` で `Last-Event-ID: 0` を渡してください**。これにより、リングの最も古い利用可能なイベントから再生され、作成レスポンスの数ミリ秒後にサブスクライブが到着した場合でも、スポーン時の `model_switch_failed` をカバーします。

### `POST /session/:id/load`

永続化された ACP セッションを ID で復元し、SSE を通じてその履歴を再生します。パスの ID が権威を持ちます。ボディ内の `sessionId` フィールドは無視されます。`caps.features.session_load` を事前確認してください。古いデーモンではこのルートに `404` を返します。

リクエスト:

```json
{
  "cwd": "/absolute/path/to/workspace"
}
```

| フィールド | 必須 | 備考                                                                                                                                                                                                                                |
| ---------- | ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `cwd`      | いいえ | `POST /session` と同じ正規化 + `workspace_mismatch` ルール。`/capabilities.workspaceCwd` を継承するには省略してください。`mcpServers` はここでは意図的に受け付けません。デーモン全体の MCP は設定駆動です（`POST /session` と一致）。 |

レスポンス:

```json
{
  "sessionId": "persisted-1",
  "workspaceCwd": "/canonical/path",
  "attached": false,
  "state": {
    "models": { ... },
    "modes": { ... },
    "configOptions": [ ... ]
  }
}
```

`state` は ACP の `LoadSessionResponse` を反映しています。`models` は `SessionModelState`、`modes` は `SessionModeState`、`configOptions` は `SessionConfigOption` の配列です。存在しないフィールドはエージェントが決定します。後から接続したクライアント（以下の `attached: true` パス）は、最初の `load` 呼び出し元が受け取ったのと同じ `state` スナップショットを取得します。デーモンはエントリにキャッシュします。ランタイムの変更（例：`model_switched`）は SSE ストリームで配信され、後続の attach レスポンスには含まれません。

`attached: true` は、セッションがすでにライブ状態であることを意味します（以前の `session/load`/`session/resume` によるもの、またはコアレスされた同時呼び出し元が直前に競合したため）。

**SSE によるヒストリーリプレイ。** エージェント側で `loadSession` が実行中の間、エージェントはすべての永続化されたターンに対して `session_update` 通知を送信します。デーモンはルートレスポンスが返る前にそれらをセッションのイベントバスにバッファリングするため、すぐに `Last-Event-ID: 0` で `GET /session/:id/events` を呼び出すサブスクライバーは完全なリプレイを確認できます。**リプレイリングには上限があります**（デフォルトでセッションあたり 8000 フレーム）。ツールコールや思考ストリームのターンが多い長いヒストリーはこれを超える場合があり、最古のフレームが無音で破棄されます。完全なヒストリーが必要なクライアントは `load` が返った直後にサブスクライブする必要があります。あるいは SSE イベント ID を永続化し、`Last-Event-ID` を使用して後のターン境界から再開することもできます。

**エラー:**

- `404` — 永続化されたセッション ID が存在しない（`SessionNotFoundError`）。
- `400` — `workspace_mismatch`（`POST /session` と同じ形式）。
- `503` — `session_limit_exceeded`（`--max-sessions` に対してカウント；実行中のリストアも対象）。
- `409` — `restore_in_progress`（同じ ID の `session/resume` がすでに実行中）。`Retry-After: 5`。同一アクションの競合（同じ ID への 2 つの同時 `session/load`）はコアレスされます。正確に 1 つが `attached: false` を返し、残りは同じ `state` で `attached: true` を返します。

### `POST /session/:id/resume`

履歴を SSE でリプレイせずに、ID で永続化された ACP セッションを復元します。モデルコンテキストはエージェント側で内部的に復元されます（`geminiClient.initialize` が `config.getResumedSessionData` を読み込む）。すでにヒストリーを表示しているクライアントの SSE ストリームはクリーンな状態を維持します。`caps.features.session_resume` を事前確認します。`unstable_session_resume` は古いクライアントとの後方互換性のために非推奨のエイリアスとして残っています。

リクエストの形式は `/load` と同じです。レスポンスの形式も同じで、`state` は ACP の `ResumeSessionResponse` を反映します。エラーエンベロープも同じで、`409 restore_in_progress` を含みます（これは `session/load` が実行中のときに発生します。別の `session/resume` の後ろで競合する `session/resume` はコアレスされます）。

クライアントに表示されたヒストリーがない場合（コールド再接続、ピッカー → 開く）は `/load` を使用します。クライアントがすでに画面にターンを表示していて、デーモン側のハンドルのみが必要な場合は `/resume` を使用します。

> ⚠️ **`unstable_session_resume` がまだ通知される理由は？** デーモンの HTTP ルートと `session_resume` 機能は v1 では安定していますが、ブリッジは引き続き ACP の `connection.unstable_resumeSession` を呼び出します。古いタグは `session_resume` が導入される前にリリースされた SDK が引き続き動作できるようにするためだけに残っています。

### `GET /workspace/:id/sessions`

`:id`（URL エンコードされた絶対 cwd）に一致する標準ワークスペースを持つすべてのライブセッションを一覧表示します。

```bash
curl http://127.0.0.1:4170/workspace/$(jq -rn --arg c "$PWD" '$c|@uri')/sessions
```

レスポンス:

```json
{
  "sessions": [
    {
      "sessionId": "<uuid>",
      "workspaceCwd": "/canonical/path",
      "createdAt": "2026-05-17T08:30:00.000Z",
      "displayName": "My Session",
      "clientCount": 2,
      "hasActivePrompt": false
    }
  ]
}
```

セッションが存在しない場合は空の配列（404 ではなく）を返します。ワークスペースがアイドル状態のときにセッションピッカー UI がエラーを表示しないようにするためです。

### `POST /session/:id/prompt`

エージェントにプロンプトを転送します。マルチプロンプトの呼び出し元はセッションごとに FIFO キューに入れられます（ACP はセッションごとに 1 つのアクティブなプロンプトを保証します）。

リクエスト:

```json
{
  "prompt": [{ "type": "text", "text": "What does src/main.ts do?" }]
}
```

バリデーション: `prompt` はオブジェクトの空でない配列である必要があります。その他の失敗はブリッジに到達する前に `400` を返します。

レスポンス:

```json
{ "stopReason": "end_turn" }
```

その他の停止理由: `cancelled`、`max_tokens`、`error`、`length`（ACP 仕様に準拠）。

HTTP クライアントがプロンプトの途中で切断した場合、デーモンはエージェントに ACP `cancel` 通知を送信し、エージェントは `stopReason: "cancelled"` でプロンプトを終了します。

> **Stage 1 の制限 — サーバーサイドのプロンプトタイムアウトなし。** ブリッジは
> エージェントの `prompt()` を `transportClosedReject`
> （エージェント子プロセスのクラッシュ）と呼び出し元の HTTP 切断
> AbortSignal に対してのみ競合させます。ハングしているが生きているエージェント（例:
> ハングするモデル呼び出し）は、HTTP クライアントがタイムアウトして
> 切断するまでセッションごとの FIFO をブロックします。長時間実行のプロンプトは正当です
> （ディープリサーチ、大規模コードベース分析）ので、デフォルトのデッドラインは
> 意図的に設定されていません。Stage 2 では設定可能な
> `promptTimeoutMs` のオプトインが公開される予定です。それまでの間、呼び出し元は独自の
> クライアントサイドタイムアウトを設定し、期限切れ時に切断（または
> `POST /session/:id/cancel` を呼び出す）する必要があります。

### `POST /session/:id/cancel`

セッションの**現在アクティブな**プロンプトをキャンセルします。ACP 側ではリクエストではなく通知です。エージェントはアクティブな `prompt()` を `cancelled` で解決することで確認応答します。

```bash
curl -X POST http://127.0.0.1:4170/session/$SID/cancel
# → 204 No Content
```

> **マルチプロンプトの契約:** キャンセルはアクティブなプロンプトのみに影響します。同じクライアントが以前に POST してアクティブなプロンプトの後ろにキューイングされているプロンプトは引き続き実行されます。マルチプロンプトのキューイングはデーモンが導入した動作です（ACP 仕様にはありません）。キューイングされたプロンプトの契約は「それぞれをキャンセルするか、チャネル終了でセッションを終了しない限り実行し続ける」です。

### `DELETE /session/:id`

ライブセッションを明示的に閉じます。他のクライアントが接続していても強制的に閉じます。アクティブなプロンプトをキャンセルし、保留中の権限をキャンセルとして解決し、`session_closed` イベントを公開し、EventBus を閉じて、セッションをデーモンマップから削除します。ディスク上の永続化されたセッションは削除されません。`POST /session/:id/load` で再読み込みできます。`caps.features.session_close` を事前確認します。

```bash
curl -X DELETE http://127.0.0.1:4170/session/$SID
# → 204 No Content
```

冪等性: 不明なセッションには `404` を返します（他のルートと同じ `SessionNotFoundError` の形式）。

> **`session_closed` イベント。** SSE サブスクライバーはストリームが終了する前に、`{ sessionId, reason: 'client_close', closedBy?: '<clientId>' }` を含む終端の `session_closed` イベントを受信します。SDK リデューサーはこれを `session_died` と同じように扱います（`alive: false` を設定し、`pendingPermissions` をクリアします）。

### `PATCH /session/:id/metadata`

変更可能なセッションメタデータを更新します。現在は `displayName` のみをサポートしています。`caps.features.session_metadata` を事前確認します。

リクエスト:

```json
{ "displayName": "My Investigation Session" }
```

| フィールド    | 必須 | 注記                                                                          |
| ------------- | ---- | ------------------------------------------------------------------------------ |
| `displayName` | いいえ | 文字列、最大 256 文字。空の文字列は名前をクリアします。省略すると変更されません。 |

レスポンス:

```json
{ "sessionId": "<uuid>", "displayName": "My Investigation Session" }
```

セッションの SSE ストリームに `{ sessionId, displayName }` を含む `session_metadata_updated` イベントを公開します。

### `POST /session/:id/heartbeat`

このセッションのデーモン側「最終確認」情報を更新します。長期稼働するアダプター（TUI/IDE/Web）はこのエンドポイントを定期的に呼び出し、将来の失効ポリシー（Wave 5 PR 24）がデッドクライアントと静止中のクライアントを区別できるようにします。

Headers:

| Header             | Required | Notes                                                                                                                                                                                                                                   |
| ------------------ | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `X-Qwen-Client-Id` | no       | `POST /session` でデーモンが発行した ID をエコーバックします。識別済みクライアントはクライアントごとのタイムスタンプも更新します。匿名ハートビートはセッションごとの watermark のみ更新します。他の箇所と同様に `[A-Za-z0-9._:-]{1,128}` の形式を満たす必要があります。 |

リクエストボディは空です（`{}` も可 — 現在はフィールドを読み取りません）。

Response:

```json
{
  "sessionId": "<sid>",
  "clientId": "<cid>",
  "lastSeenAt": 1700000000123
}
```

`clientId` は信頼された `X-Qwen-Client-Id` が指定された場合のみエコーバックされます。`lastSeenAt` はブリッジが保存したデーモン側の `Date.now()` エポック（ms）です。

Errors:

- `400` — ヘッダーの形式が不正な場合（ヘッダー形式ルール）、またはこのセッションに登録されていない `clientId` が含まれている場合に `{ code: 'invalid_client_id' }` を返します（ブリッジはタイムスタンプを更新する前に `InvalidClientIdError` をスローします）。
- `404` — 不明なセッション。

Capability gating: 事前確認 `caps.features.client_heartbeat`。古いデーモンはこのパスに対して `404` を返します。

### `POST /session/:id/model`

セッションの現在バインドされたモデルサービスの**範囲内で**アクティブモデルを切り替えます。セッションごとのモデル変更キューを通じてシリアライズされます。

（_サービス_自体を切り替える場合 — Alibaba ModelStudio vs OpenRouter など — 新しいセッションで `POST /session` の `modelServiceId` を指定してください。Stage 1 にはライブのサービス切り替えルートはありません。）

Request:

```json
{ "modelId": "qwen-staging" }
```

Response:

```json
{ "modelId": "qwen-staging" }
```

成功すると SSE ストリームに `model_switched` をパブリッシュします。失敗すると `model_switch_failed` をパブリッシュします（呼び出し元だけでなくパッシブなサブスクライバーも失敗を確認できます）。エージェントチャネルの終了と競合するため、応答しない子プロセスが HTTP ハンドラーをブロックできません。

### `POST /session/:id/recap`

Capability tag: `session_recap`。Bridge → ACP extMethod `qwen/control/session/recap`。

セッションの「どこで中断したか」を一文で要約します。コアの `generateSessionRecap`（`packages/core/src/services/sessionRecap.ts`）をラップし、ツールを無効にした高速モデルに対してサイドクエリを実行します。`maxOutputTokens: 300`、厳密な `<recap>...</recap>` 出力形式を使用します。サイドクエリはセッションの既存の GeminiClient チャット履歴を読み取り、そこには**追記しません**。

リクエストボディは無視されます（`{}` または空で送信可）。非厳密ミューテーションゲート — 挙動は `/session/:id/prompt` と同様です（呼び出しにトークンはかかりますが状態は変更しません）。SSE イベントはパブリッシュされません。

Response (200):

```json
{
  "sessionId": "sess:42",
  "recap": "Debugging the auth retry race. Next: add deterministic timing to the integration test."
}
```

以下の場合、`recap` は `null` になります（エラーではなく通常の 200）：

- セッションのダイアログターンがまだ 2 回未満の場合、
- サイドクエリが抽出可能な `<recap>...</recap>` ペイロードを返さなかった場合、
- または基盤となるモデルエラーが発生した場合（コアのヘルパーはベストエフォートでスローしません）。

Errors:

- `400 {code: 'invalid_client_id'}` — `X-Qwen-Client-Id` ヘッダーの形式が不正。
- `404` — セッションが不明。

キャンセル: **v1 では未対応**。このルートは HTTP クライアントの切断を監視せず、ブリッジに `AbortSignal` は接続されておらず、ACP 子プロセスは呼び出し元が切断していても最後までサイドクエリを実行します。唯一の上限はブリッジの 60 秒のバックストップタイムアウト（`SESSION_RECAP_TIMEOUT_MS`）と ACP チャネルが死亡したときのトランスポートクローズの競合です。recap は短い（単一試行、`maxOutputTokens: 300`、一般的に約 1〜5 秒）ため、これは許容範囲です。帯域幅コストが正当化される将来のリリースでは、リクエスト ID ベースのキャンセル extMethod を使用してエンドツーエンドの完全なキャンセルを実装できます。

### Mutation: approval, tools, init, MCP restart

Issue [#4175](https://github.com/QwenLM/qwen-code/issues/4175) Wave 4 PR 17 では、リモートクライアントがデーモンホストの CLI を変更せずにランタイムの設定を変更できる 4 つのミューテーション制御ルートを追加します。これら 4 つすべて：

- PR 15 の**厳密な**ミューテーションゲートによってゲーティングされます。bearer token なしで設定されたデーモンは `401 {code: 'token_required'}` で拒否します。オプトインする前に `--token`（または `QWEN_SERVER_TOKEN`）を設定してください。
- `X-Qwen-Client-Id` ヘッダーを受け取りスタンプします（PR 7 監査チェーン）。ヘッダーに信頼された ID が含まれている場合、デーモンは対応する SSE イベントに `originatorClientId` を付与するため、クロスクライアント UI が自分自身のミューテーションのエコーを抑制できます。
- アフォーダンスを公開する前にタグごとの capability を事前確認します。古いデーモンはルートに対して `404` を返します。

4 つのルートのうち 3 つ（`tools/:name/enable`、`init`、`mcp/:server/restart`）は**ワークスペーススコープ**のイベントを発行します。ミューテーションがトリガーされたときにどのセッションがアタッチされていたかに関わらず、すべてのアクティブなセッション SSE バスがイベントを受け取ります。`approval-mode` は変更が一つのセッションの `Config` にローカルであるため、**セッションスコープ**のイベントを発行します。

#### `POST /session/:id/approval-mode`

Capability tag: `session_approval_mode_control`。Bridge → ACP extMethod `qwen/control/session/approval_mode`。

ライブセッションの承認モードを変更します。新しいモードはすぐに ACP 子プロセスのセッションごとの `Config` に反映されます。デフォルトでは設定はディスクに**書き込まれません** — `persist: true` を渡すことでワークスペース設定の `tools.approvalMode` にも書き込まれます。

Request:

```json
{ "mode": "auto-edit", "persist": false }
```

`mode` は `'plan' | 'default' | 'auto-edit' | 'auto' | 'yolo'` のいずれかである必要があります（コアの `ApprovalMode` enum のミラー。SDK はランタイム検証用に `DAEMON_APPROVAL_MODES` をエクスポートします）。`persist` のデフォルトは `false` です。

Response (200):

```json
{
  "sessionId": "sess:42",
  "mode": "auto-edit",
  "previous": "default",
  "persisted": false
}
```

Errors:

- `400 {code: 'invalid_approval_mode', allowed: [...]}` — 不明なモードリテラル。
- `400 {code: 'invalid_persist_flag'}` — `persist` が boolean ではない。
- `403 {code: 'trust_gate', errorKind: 'auth_env_error'}` — リクエストされたモードに信頼されたフォルダーが必要です（信頼されていないワークスペースでの特権モードはコアの `Config.setApprovalMode` によって拒否されます）。
- `404` — セッションが不明。

SSE event (session-scoped): `approval_mode_changed`、`{sessionId, previous, next, persisted, originatorClientId?}` を含む。

#### `POST /workspace/tools/:name/enable`

Capability tag: `workspace_tool_toggle`。純粋なファイル IO — ACP ラウンドトリップなし。

ワークスペースの `tools.disabled` 設定リストのツール名をトグルします。そこに列挙されたツールはまったく**登録されません**（`permissions.deny` とは異なり、そちらはツールを登録したまま呼び出しを拒否します）。組み込みツールと MCP で発見されたツールはどちらも `ToolRegistry.registerTool` を通じて処理され、無効化リストを参照します。

> ⚠️ **名前はレジストリの公開識別子と完全に一致する必要があります。** エイリアス解決は行われません — ルートはパスパラメーターの文字列をそのまま `tools.disabled` に保存し、次の ACP 子プロセスが登録時に `tool.name` と比較します。組み込みツールは正式なレジストリ名（snake_case 動詞形）を使用します: `run_shell_command`、`read_file`、`write_file`、`list_directory`、`glob`、`grep_search`、`web_fetch` など — CLI が表示するラベル（`Shell`、`Read`、`Write`）ではありません。MCP で発見されたツールは `mcp__<server>__<name>` 形式を使用します（これは `tool_toggled` イベントがブロードキャストする形式であり、`GET /workspace/mcp` が一覧表示する形式でもあります）。`Bash` を無効にしても、次のセッションで `run_shell_command` が登録されることは防止されません。

ライブの ACP 子プロセスはすでに登録済みのツールを保持します — トグルは**次の** ACP 子プロセスの起動時に有効になります。現在のデーモンで変更を有効にするには、`POST /workspace/mcp/:server/restart`（MCP ソースのツールの場合）または新しいセッションの作成と組み合わせてください。

不明なツール名は受け入れられます: まだインストールされていない MCP ツールを事前に無効化するのは正当なユースケースです。

Request:

```json
{ "enabled": false }
```

レスポンス (200):

```json
{ "toolName": "run_shell_command", "enabled": false }
```

エラー:

- `400 {code: 'invalid_tool_name'}` — パスパラメータが空、またはパスパラメータが256文字の上限を超えている。
- `400 {code: 'invalid_enabled_flag'}` — `enabled` が欠落しているか、真偽値でない。

SSE イベント (ワークスペーススコープ): `tool_toggled`、`{toolName, enabled, originatorClientId?}` を含む。

#### `POST /workspace/init`

Capability タグ: `workspace_init`。純粋なファイル IO — ACP のラウンドトリップなし、**LLM 呼び出しなし**。

デーモンのバインドされたワークスペースルートに空の `QWEN.md`（または `--memory-file-name` オーバーライド下で `getCurrentGeminiMdFilename()` が返すファイル名）をスキャフォールドする。機械的な処理のみ — AI による内容の入力には、続けて `POST /session/:id/prompt` を実行する。

デフォルトでは、対象ファイルが空白以外のコンテンツで存在する場合に上書きを拒否する。空白のみのファイルは存在しないものとして扱われる（ローカルの `/init` スラッシュコマンドと一致する）。

リクエスト:

```json
{ "force": false }
```

レスポンス (200):

```json
{ "path": "/work/bound/QWEN.md", "action": "created" }
```

`action` は、新規作成時は `'created'`、既存の空白のみのファイルがそのまま残された場合（書き込みなし）は `'noop'`、`force: true` で空でないコンテンツが置き換えられた場合は `'overwrote'` となる。`workspace_initialized` SSE イベントはレスポンスの action を反映する — オブザーバーは `action !== 'noop'` でフィルタリングして、実際のディスク上の変更にのみ反応できる。

エラー:

- `400 {code: 'invalid_force_flag'}` — `force` が真偽値でない。
- `409 {code: 'workspace_init_conflict', path, existingSize}` — ファイルが空白以外のコンテンツで存在し、`force` が省略または false の場合。ボディには絶対パスとサイズ（バイト）が含まれるため、SDK クライアントは再 stat せずに「N バイトを上書きしますか？」プロンプトを表示できる。

SSE イベント (ワークスペーススコープ): `workspace_initialized`、`{path, action, originatorClientId?}` を含む。

#### `POST /workspace/mcp/:server/restart`

Capability タグ: `workspace_mcp_restart`。Bridge → ACP extMethod `qwen/control/workspace/mcp/restart`。

ACP チャイルドの `McpClientManager.discoverMcpToolsForServer`（切断 + 再接続 + 再検出）を通じて、設定済みの MCP サーバーを再起動する。PR 14 v1 のアカウンティングからライブバジェットスナップショットを事前チェックするため、バジェット超過のワークスペースでの再起動は `BudgetExhaustedError` のカスケードを引き起こすのではなく、ソフトリフューザルを返す。

リクエストボディは空 (`{}`)。パスパラメータは `mcpServers` 設定に表示される URL エンコードされたサーバー名。

レスポンス (200) — `restarted` による判別ユニオン:

```json
{ "serverName": "docs", "restarted": true, "durationMs": 1234 }
```

```json
{
  "serverName": "docs",
  "restarted": false,
  "skipped": true,
  "reason": "budget_would_exceed"
}
```

ソフトスキップ理由（すべて 200 を返す）:

| `reason`                | 意味                                                                                                                                                                                  |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `'in_flight'`           | このサーバーの別の検出 / 再起動がすでに進行中。ルートは元の Promise を待機せずに即座に返す。呼び出し側は短い遅延後にリトライすること。 |
| `'disabled'`            | サーバーは設定されているが `excludedMcpServers` にリストされている。再起動前に再有効化すること。                                                                                      |
| `'budget_would_exceed'` | デーモンが `--mcp-budget-mode=enforce` で、対象サーバーが現在 `reservedSlots` になく、ライブ合計が `clientBudget` に達している。呼び出し側は先にスロットを解放すること。              |

エラー (非 2xx):

- `400 {code: 'invalid_server_name'}` — パスパラメータが空。
- `404` — サーバー名が `mcpServers` 設定にない、またはライブ ACP チャネルが存在しない（再起動にはライブ `McpClientManager` インスタンスが必須）。
- `500` — 内部エラー（例: `ToolRegistry` が初期化されていない）。

SSE イベント (ワークスペーススコープ): 成功時は `mcp_server_restarted`、`{serverName, durationMs, originatorClientId?}` を含む；ソフトスキップ時は `mcp_server_restart_refused`、`{serverName, reason, originatorClientId?}` を含む。

### `GET /session/:id/events` (SSE)

セッションのイベントストリームを購読する。

ヘッダー:

```
Accept: text/event-stream
Last-Event-ID: 42        ← オプション、id 42 以降を再生
```

クエリパラメータ:

| パラメータ  | 必須 | 備考                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ----------- | ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `maxQueued` | いいえ | サブスクライバーごとの**ライブバックログ**上限。範囲 `[16, 2048]`、デフォルト 256。購読時に強制プッシュされるリプレイフレームは上限から除外される；実際に消費するのは、コンシューマーが大量の `Last-Event-ID: 0` リプレイをドレイン中にライブイベントが到着する場合。コールドリコネクト時はバンプして、コンシューマーが追いつく前にスロークライアント警告 / 退出がトリガーされないようにする。範囲外 / 非十進数 / 存在するが空の値は、SSE ハンドシェイクが開く前に `400 invalid_max_queued` を返す。`caps.features.slow_client_warning` を事前確認すること — 旧デーモンはこのパラメータを無視する。 |

フレーム形式。`data:` 行は**完全なイベントエンベロープ**で、JSON が1行にシリアライズされる — `{id?, v, type, data, originatorClientId?}`。ACP 固有のペイロード（`sessionUpdate`、`requestPermission` 引数など）はエンベロープの `data` フィールド以下にあり、エンベロープ自体の `type` は SSE の `event:` 行と一致する。

```
id: 7
event: session_update
data: {"id":7,"v":1,"type":"session_update","data":{"sessionUpdate":"agent_message_chunk","content":{"type":"text","text":"…"}}}

id: 8
event: permission_request
data: {"id":8,"v":1,"type":"permission_request","data":{"requestId":"<uuid>","sessionId":"<sid>","toolCall":{...},"options":[...]}}

: heartbeat              ← 15秒ごと、ペイロードなし

event: client_evicted    ← 終端フレーム、id なし（合成）
data: {"v":1,"type":"client_evicted","data":{"reason":"queue_overflow","droppedAfter":42}}
```

SSE レベルの `id:` / `event:` 行は EventSource との互換性のために `envelope.id` / `envelope.type` を複製している。Raw-`fetch` コンシューマー（SDK の `parseSseStream`）は JSON エンベロープからすべてを読み取り、SSE プリアンブル行を無視する。

| イベントタイプ            | トリガー                                                                                                                                                                                                                                                                                                                 |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `session_update`          | ACP の `sessionUpdate` 通知（LLM チャンク、ツール呼び出し、使用状況）                                                                                                                                                                                                                                                    |
| `permission_request`      | エージェントがツール承認を要求した                                                                                                                                                                                                                                                                                        |
| `permission_resolved`     | いずれかのクライアントが `POST /permission/:requestId` で権限を投票した                                                                                                                                                                                                                                                   |
| `permission_partial_vote` | （コンセンサスのみ）投票が記録されたがクォーラムに未達。`{requestId, sessionId, votesReceived, votesNeeded, quorum, optionTallies}` を含む。`caps.features.permission_mediation` を事前確認すること。                                                                                                                     |
| `permission_forbidden`    | アクティブなポリシーによって投票が拒否された（`designated` の不一致、`local-only` の非ループバック、または `consensus` の投票者がスナップショットにない）。`{requestId, sessionId, clientId?, reason}` を含む。`caps.features.permission_mediation` を事前確認すること。                                                  |
| `model_switched`          | `POST /session/:id/model` が成功した                                                                                                                                                                                                                                                                                     |
| `model_switch_failed`     | `POST /session/:id/model` が拒否された                                                                                                                                                                                                                                                                                   |
| `session_died`            | エージェントチャイルドが予期せずクラッシュした。**終端: このフレームの後 SSE ストリームが閉じる；セッションは `byId` から削除される。** サブスクライバーは `POST /session` を通じて再接続して新しいセッションを起動すること。                                                                                             |
| `slow_client_warning`     | サブスクライバーローカル: キューが 75% 以上。**非終端** — ストリームは継続；警告は退出前の予告。`{queueSize, maxQueued, lastEventId}` を含む。オーバーフローエピソードごとに一度だけ発火；キューが 37.5% を下回ると再アーム。`id` なし（合成）。`caps.features.slow_client_warning` を事前確認すること。 |
| `client_evicted`          | サブスクライバーローカル: キューオーバーフロー。**終端: このフレームの後 SSE ストリームが閉じる**（`id` なし — 合成）。同じセッション上の他のサブスクライバーは継続する。                                                                                                                                                 |
| `stream_error`            | ファンアウト中のデーモン側エラー。**終端: このフレームの後 SSE ストリームが閉じる**（`id` なし — 合成）。                                                                                                                                                                                                                 |

再接続のセマンティクス:

- `Last-Event-ID: <n>` を送信して、セッションごとのリング（デフォルト深さ **8000**、`qwen serve --event-ring-size <n>` で調整可能）から `id > n` のイベントを再生する
- **ギャップ検出（クライアントサイド）:** `<n>` がリングに残っている最古のイベントより古い場合（例: `Last-Event-ID: 50` で再接続したが、リングが 200–1199 を保持している）、デーモンは通知なしに最古の利用可能なイベントから再生する。最初に再生されたイベントの `id` を `n + 1` と比較する；差異が失われたウィンドウのサイズとなる。ステージ 2 ではデーモン側に明示的な `stream_gap` 合成フレームが注入される；ステージ 1 では検出はクライアントの責任。
- ID はセッションごとに単調増加、1 から開始
- 合成フレーム（`client_evicted`、`slow_client_warning`、`stream_error`）は他のサブスクライバーのシーケンススロットを消費しないよう意図的に `id` を省略する

バックプレッシャー:

- サブスクライバーごとのキューのデフォルトは `maxQueued: 256` 件です（再接続時のリプレイフレームはこの上限を除外）。SSE リクエストに `?maxQueued=N`（範囲 `[16, 2048]`）を付与してオーバーライドできます。
- サブスクライバーのキューが 75% を超えると、バスはそのサブスクライバーに `slow_client_warning` 合成フレームを強制プッシュします（オーバーフローが発生するごとに 1 回。37.5% 以下になったら再セット）。ストリームはオープンのままで、警告はクライアントがより速くドレインするか、切断して再接続するための通知です。
- キューが警告を超えて実際にオーバーフローした場合、バスは `client_evicted` 終端フレームを送信してサブスクリプションを閉じます。

### `POST /permission/:requestId`

保留中の `permission_request` に投票します。アクティブな**調停ポリシー**が勝者を決定します。

| ポリシー                      | 動作                                                                                                                                                                                              |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `first-responder` (デフォルト) | 有効な投票者が勝利し、後からの投票者は `404` を受け取ります。F3 以前のベースライン。                                                                                                                                                    |
| `designated`                | プロンプトの発信者（`originatorClientId`）のみが決定します。非発信者は `403 permission_forbidden / designated_mismatch` を受け取ります。匿名プロンプトの場合は first-responder にフォールバックします。                 |
| `consensus`                 | N-of-M の投票者が合意する必要があります（デフォルト `N = floor(M/2) + 1`、`policy.consensusQuorum` でオーバーライド可能）。最初に `N` に達した選択肢が勝ちます。未解決の投票は `200` + `permission_partial_vote` SSE フレームを受け取ります。 |
| `local-only`                | ループバックの投票者のみが決定します。リモートの呼び出し元は `403 permission_forbidden / remote_not_allowed` を受け取ります。                                                                                                      |

アクティブなポリシーは `settings.json` の `policy.permissionStrategy` で設定され、`/capabilities` の `body.policy.permission` に公開されます。ビルドでサポートされているセットについては、`caps.features.permission_mediation`（`modes: [...]` 付き）を事前確認してください。

> **F3 (#4175): マルチクライアント権限調整。** F3 では上記の 4 つのポリシーが追加されました。F3 以前のデーモンは first-responder をハードコードしていましたが、設定されたポリシーが `first-responder` の場合、ワイヤー形式はビット単位で変わりません。新しいイベント（`permission_partial_vote`、`permission_forbidden`）は追加式であり、古い SDK はそれらを `unrecognized_known_event` として受け取り、正常に無視します。

> **権限タイムアウト（デフォルト 5 分）。** `permission_request` は次のいずれかまで保留になります：(a) クライアントがここで投票した場合、(b) `POST /session/:id/cancel` が発火した場合、(c) プロンプトを駆動する HTTP クライアントが切断した場合（プロンプト途中のキャンセルにより未解決の権限は `cancelled` に解決）、(d) セッションが終了した場合、(e) デーモンがシャットダウンした場合、**または (f) セッションごとの権限タイムアウトが発火した場合**（`DEFAULT_PERMISSION_TIMEOUT_MS`、5 分）。タイムアウト発火時、エージェントの `requestPermission` は `{outcome: 'cancelled'}` に解決し、監査リングに `permission.timeout` エントリが記録され、デーモンの stderr に 1 行のブレッドクラムが出力され、SSE バスは標準の `permission_resolved` cancelled フレームをファンアウトしてサブスクライバーがクリーンアップできるようにします。タイムアウトは `BridgeOptions.permissionResponseTimeoutMs` で設定可能です。長形式のプロンプトを実行するヘッドレス呼び出し元は延長を検討してください。

リクエスト：

```json
{
  "outcome": {
    "outcome": "selected",
    "optionId": "proceed_once"
  }
}
```

アウトカム：

- `{ "outcome": "selected", "optionId": "<one-of-the-options>" }` — エージェントが提示した選択肢に従って承認 / 拒否 / 一度だけ進む / など
- `{ "outcome": "cancelled" }` — リクエストを破棄します（`cancelSession` / `shutdown` が内部的に行うものと同じ）

レスポンス：

- `200 {}` — 投票が受理されました（解決済み、またはコンセンサスクォーラムの下で記録済み）
- `403 { "code": "permission_forbidden", "reason": "designated_mismatch" | "remote_not_allowed", "requestId", "sessionId" }` — F3: アクティブなポリシーが投票を拒否しました
- `404 { "error": "..." }` — requestId が不明です（既に解決済み、存在しない、またはセッションが破棄されている）
- `500 { "code": "cancel_sentinel_collision", ... }` — F3: エージェントの `allowedOptionIds` に予約済みセンチネル `'__cancelled__'` が含まれています。エージェント / デーモンのコントラクト違反
- `501 { "code": "permission_policy_not_implemented", "policy": "<name>" }` — F3 前方互換: スキーマにポリシーリテラルが追加されたが、そのメディエーターブランチがまだビルドされていない（現在は到達不能。将来のポリシーのために予約済み）

投票が成功した後、すべての接続済みクライアントは同じ `requestId` と選択された `outcome` を含む `permission_resolved` を受け取ります。`consensus` では、クォーラムに達するまで中間の投票が `permission_partial_vote` として追加でファンアウトされます。

### Auth デバイスフロールート (issue #4175 PR 21)

デーモンは OAuth 2.0 デバイス認証グラント（RFC 8628）を仲介することで、リモート SDK クライアントがログインをトリガーでき、そのトークンがクライアントではなく**デーモン**のファイルシステムに保存されます。デーモン自身が IdP をポーリングし、クライアントの役割は確認 URL とユーザーコードを表示し、（オプションで）完了イベントの SSE をサブスクライブするだけです。

ケイパビリティタグ：`auth_device_flow`（常にアドバタイズ）。v1 でサポートされているプロバイダー：`qwen-oauth`。

> [!note]
>
> Qwen OAuth 無料ティアは 2026-04-15 に廃止されました。このプロトコルでは `qwen-oauth` をレガシー v1 プロバイダー識別子として扱ってください。新しいクライアントは利用可能な場合、現在サポートされている認証プロバイダーを優先してください。

**ランタイムローカリティ。** デーモンはたとえブラウザを起動できる環境でも、ブラウザを生成しません。クライアントがローカルで `open(verificationUri)` を呼び出すかどうかを決定します。ヘッドレスポッド（標準の Mode B デプロイメント）では、ユーザーは任意のブラウザを持つデバイスで URL を開きます。推奨される UX については `docs/users/qwen-serve.md` を参照してください。

**イベントでのトークン漏洩なし。** `auth_device_flow_started` には `{deviceFlowId, providerId, expiresAt}` のみが含まれます。ユーザーコードと確認 URL は POST 201 のレスポンスボディと `GET /workspace/auth/device-flow/:id` を通じてポイントツーポイントで返されます。SSE でブロードキャストされることはありません。

**プロバイダーごとのシングルトン。** フローが保留中に同じプロバイダーに対して 2 回目の `POST` を行うことは冪等な引き継ぎになります。新しい IdP リクエストを開始するのではなく、`attached: true` とともに既存のエントリを返します。

#### `POST /workspace/auth/device-flow`

厳格なミューテーションゲート：トークンなしのループバックデフォルトでもベアラートークンが必要です（`401 token_required`）。

リクエスト：

```json
{ "providerId": "qwen-oauth" }
```

レスポンス（`201` 新規開始、`200` 冪等な引き継ぎ）：

```json
{
  "deviceFlowId": "fa07c61b-…",
  "providerId": "qwen-oauth",
  "status": "pending",
  "userCode": "USER-1",
  "verificationUri": "https://chat.qwen.ai/api/v1/oauth2/device",
  "verificationUriComplete": "https://chat.qwen.ai/api/v1/oauth2/device?user_code=USER-1",
  "expiresAt": 1700000600000,
  "intervalMs": 5000,
  "attached": false
}
```

エラー：

- `400 unsupported_provider` — 不明な `providerId`（レスポンスに `supportedProviders` が含まれます）
- `409 too_many_active_flows` — ワークスペースの上限（4）に達しました。`DELETE` でいずれかをキャンセルしてください
- `401 token_required` — 厳格なゲートがトークンなしのリクエストを拒否しました
- `502 upstream_error` — IdP が予期しないエラーを返しました

#### `GET /workspace/auth/device-flow/:id`

現在の状態を読み取ります。保留中のエントリは `userCode/verificationUri/expiresAt/intervalMs` を返します。終端エントリ（5 分間のグレース期間）はそれらを削除し、`status` とオプションの `errorKind/hint` を返します。

不明な ID およびグレース期間後に削除されたエントリに対しては `404 device_flow_not_found` を返します。

#### `DELETE /workspace/auth/device-flow/:id`

冪等なキャンセル：

- 保留中のエントリ → `204` + `auth_device_flow_cancelled` を送信
- 終端エントリ → `204` ノーオペレーション（イベントを再送信しない）
- 不明な ID → `404`

#### `GET /workspace/auth/status`

保留中のフローとサポートされているプロバイダーのスナップショット：

```json
{
  "v": 1,
  "workspaceCwd": "/work/bound",
  "providers": [],
  "pendingDeviceFlows": [
    {
      "deviceFlowId": "fa07c61b-…",
      "providerId": "qwen-oauth",
      "expiresAt": 1700000600000
    }
  ],
  "supportedDeviceFlowProviders": ["qwen-oauth"]
}
```

#### デバイスフロー SSE イベント

5種類の型付きイベント（ワークスペーススコープ、すべてのアクティブセッションバスにファンアウト）:

- `auth_device_flow_started` `{deviceFlowId, providerId, expiresAt}` — POST 成功; SDK はサブスクライブする必要がある（ここに userCode はない。必要であれば GET で取得）
- `auth_device_flow_throttled` `{deviceFlowId, intervalMs}` — デーモンがアップストリームの `slow_down` を受け付けた; GET をポーリングするクライアントはインターバルをこれに合わせて延長する
- `auth_device_flow_authorized` `{deviceFlowId, providerId, expiresAt?, accountAlias?}` — 資格情報が永続化された; `accountAlias` は非 PII ラベル（メール/電話番号は含まない）
- `auth_device_flow_failed` `{deviceFlowId, errorKind, hint?}` — 終端; `errorKind` は `expired_token | access_denied | invalid_grant | upstream_error | persist_failed` のいずれか。`persist_failed` はデーモン内部エラー: IdP 交換は成功したが、デーモンが資格情報を永続的に保存できなかった（EACCES / EROFS / ENOSPC）。ディスクの問題が解決してから再試行すること。
- `auth_device_flow_cancelled` `{deviceFlowId}` — 保留中のエントリに対して DELETE が成功した

> **MCP 非互換。** MCP 認可仕様（2025-06-18）は OAuth 2.1 + PKCE 認可コードとリダイレクトコールバックを必須とするが、これはヘッドレス Pod デーモンでは動作しない。Mode B のデバイスフローサーフェスはデーモンプライベートであり、MCP 準拠サーバーをターゲットとするクライアントは別の認証パスを使用すること。

## ストリーミングワイヤーフォーマット

イベントは標準 EventSource フレームとして送出される。デーモンはフレームごとに1行の `data:` を書き込む（`JSON.stringify` 後に埋め込み改行はない）; `packages/sdk-typescript/src/daemon/sse.ts` の SDK パーサーはその形式と仕様で許可されている複数 `data:` 形式の両方を受信側で処理する。

## ストリーミング中のエラーフレーム

ブリッジイテレーターが SSE サブスクライバーへの配信中にスローした場合、デーモンは終端の `stream_error` フレームを送出する（`id` なし）。`data:` 行は完全なエンベロープ（本ドキュメントの他の SSE フレームと同じ形式）であり、実際のエラーメッセージは `envelope.data.error` に格納される:

```
event: stream_error
data: {"v":1,"type":"stream_error","data":{"error":"<message>"}}
```

その後、接続は閉じられる。

## 環境変数

| 変数                 | 目的                                                        |
| ------------------- | -------------------------------------------------------------- |
| `QWEN_SERVER_TOKEN` | Bearer トークン。起動時に先頭・末尾の空白を除去する。 |

## ソースレイアウト

| パス                                                 | 目的                                                                                                    |
| ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `packages/cli/src/commands/serve.ts`                 | yargs コマンド + フラグスキーマ                                                                                |
| `packages/cli/src/serve/run-qwen-serve.ts`           | リスナーライフサイクル + シグナルハンドリング                                                                       |
| `packages/cli/src/serve/server.ts`                   | Express ルート + ミドルウェア                                                                                |
| `packages/cli/src/serve/auth.ts`                     | bearer + Host 許可リスト + CORS 拒否                                                                        |
| `packages/cli/src/serve/httpAcpBridge.ts`            | spawn-or-attach + セッションごとの FIFO + パーミッションレジストリ                                                   |
| `packages/cli/src/serve/status.ts`                   | 読み取り専用デーモンステータスワイヤー型 + `ServeErrorKind` + `BridgeTimeoutError` + `mapDomainErrorToErrorKind` |
| `packages/cli/src/serve/env-snapshot.ts`             | `/workspace/env` ペイロードを `process.*` 状態から構築するピュアヘルパー（資格情報のリダクションを含む）   |
| `packages/acp-bridge/src/eventBus.ts`                | 有界非同期キュー + リプレイリング                                                                          |
| `packages/sdk-typescript/src/daemon/DaemonClient.ts` | TS クライアント                                                                                                  |
| `packages/sdk-typescript/src/daemon/sse.ts`          | EventSource フレームパーサー                                                                                   |
| `integration-tests/cli/qwen-serve-routes.test.ts`    | 18 ケース、LLM なし                                                                                           |
| `integration-tests/cli/qwen-serve-streaming.test.ts` | 3 ケース、ローカルフェイク OpenAI サーバーをバックエンドとする実際の `qwen --acp` 子プロセス（POSIX のみ; Windows ではスキップ）   |
