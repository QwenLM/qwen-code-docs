# `qwen serve` HTTP プロトコルリファレンス

[qwen-code daemon design](https://github.com/QwenLM/qwen-code/issues/3803) の Stage 1。すべてのルートはデーモンのベース URL（デフォルトは `http://127.0.0.1:4170`）配下に存在します。

## 認証

デーモンが `--token` または `QWEN_SERVER_TOKEN` を指定して起動された場合、**ループバックバインドの `/health` を除くすべてのルート**で、以下のヘッダーが必要です。

```
Authorization: Bearer <token>
```

トークンが設定されていない場合（ループバック開発時のデフォルト）、このヘッダーは任意です。トークンの比較は定数時間で行われます。401 レスポンスは、`missing header` / `wrong scheme` / `wrong token` のいずれの場合でも統一されています。

**`/health` の例外** (Bctum): ループバックバインド（`127.0.0.1` / `localhost` / `::1` / `[::1]`）では、`/health` は Bearer ミドルウェアよりも**前に**登録されるため、デーモンが `--token` 付きで起動された場合でも、ポッド内の liveness プローブはトークンを送信する必要がありません。ループバック以外のバインド（`--hostname 0.0.0.0` など）では、他のすべてのルートと同様に `/health` も Bearer 認証で保護されます。理由については [`GET /health`](#get-health) セクションを参照してください。

**`--require-auth` (#4175 PR 15)。** 起動時にこのフラグを渡すと、「トークン必須」ルールがループバックにも適用されます。トークンなしでは起動に失敗し、`/health` の例外も無効になります（つまり、`/health` にも `Authorization: Bearer …` が必要になります）。

このフラグが有効な場合、グローバルな `bearerAuth` ミドルウェアが `/capabilities` を含む**すべての**ルートを保護します。したがって、**未認証の**クライアントは `caps.features` を事前確認して認証が必要であることを知ることはできません。この場合の検出手段は、（[認証](#authentication) セクションに従いすべてのルートで統一されている）**401 レスポンスボディ**自体となります。`require_auth` ケイパビリティタグは**認証後の確認**です。クライアントが正常に認証され `/capabilities` を読み取ると、タグの存在によってデーモンが `--require-auth` で起動されたことが確認できます（監査/コンプライアンス UI や、SDK クライアントが設定パネルで「このデプロイメントは強化されています」と表示するのに役立ちます）。ルートごとの厳格モードにオプトインしているミューテーションルート（Wave 4 のフォローアップ）は、トークンなしのループバックデフォルトに到達すると `401 { code: "token_required", error: "…" }` で拒否します。しかし、`--require-auth` が有効な場合、グローバルな Bearer ミドルウェアがルートごとのゲートの前にリクエストをショートサーキットするため、未認証の呼び出し元が実際に目にするのはレガシーな `Unauthorized` ボディです。

**`--allow-origin <pattern>` (T2.4 [#4514](https://github.com/QwenLM/qwen-code/issues/4514))。** デーモンにクロスオリジンでアクセスするブラウザの Web UI はデフォルトでブロックされます。`Origin` ヘッダーを含むリクエストは `403 {"error":"Request denied by CORS policy"}` を返します。CLI/SDK クライアントは `Origin` を送信せず、デーモンはその存在をオペレーターがオプトインしていないブラウザコンテキストからのリクエストとみなすためです。起動時に `--allow-origin <pattern>`（繰り返し指定可能）を渡すと、ブロックの代わりに許可リストがインストールされます。各パターンは以下のいずれかです。

- リテラル `*` — 任意のオリジンを許可します。**リスクあり**: `*` が設定されているにもかかわらず Bearer トークンが設定されていない場合（`--token`、`QWEN_SERVER_TOKEN`、または起動時にトークンを必須とする `--require-auth` のいずれのソースでも）、起動は拒否されます。`*` がリストに含まれている場合、起動時のパンくず（breadcrumb）は stderr に警告を出力します。**推奨**: ループバックバインドでは `--require-auth` と組み合わせて、`/health` と `/demo` も Bearer で保護されるようにします。これらはデフォルトではループバックの Bearer ミドルウェアより前に登録されるため（k8s/Compose プローブがトークンなしで `/health` に到達できるように）、`*` 許可リストはそれらを任意のクロスオリジンブラウザから到達可能にします。ループバック以外のバインドでは Bearer は起動時にすでに必須であるため、`*` の公開対象は `/health`（ステータス JSON）と `/demo`（JS がトークン保護されたルートを呼び出す静的ページ）のみであり、実際の API 表面は保護されています。
- 正規化された URL オリジン — `<scheme>://<host>[:<port>]`。**末尾のスラッシュ、パス、userinfo、クエリは不可**。エントリが `new URL(pattern).origin === pattern` のラウンドトリップに失敗した場合、起動は `InvalidAllowOriginPatternError` で拒否されます。エラーメッセージには不正なパターンと正規化された形式が示されます。意図的な厳格さ: 暗黙の正規化（例: 末尾の `/` の削除）は、タイプミスを見逃し、曖昧な入力を許可してしまう可能性があります。

一致したオリジンには、すべてのリクエストに対して標準的な CORS レスポンスヘッダーが返されます。

```
Access-Control-Allow-Origin: <echoed origin>
Vary: Origin
Access-Control-Allow-Methods: GET, POST, PATCH, DELETE, OPTIONS
Access-Control-Allow-Headers: Authorization, Content-Type, X-Qwen-Client-Id, Last-Event-ID
Access-Control-Max-Age: 86400
Access-Control-Expose-Headers: Retry-After
```

`Access-Control-Allow-Origin` は、`*` パターンの場合でも、リテラルの `*` ではなく、リクエストのオリジンをそのまま（ブラウザが送信した通りの大文字/小文字で）エコーバックします。ブラウザキャッシュはこれを `Vary: Origin` と組み合わせてレスポンスをキーとするため、エコーバックすることで、スキーマ変更なしに将来のリリースで `Access-Control-Allow-Credentials` を追加する余地が残されます。`Access-Control-Expose-Headers: Retry-After` により、ブラウザの Web UI は `429` / `503` レスポンスからのデーモンのリトライヒントに従うことができます。`Access-Control-Allow-Credentials` は現在**送信されません**。デーモンは `Authorization` 内の Bearer で認証を行うため、`credentials: 'include'` なしでクロスオリジンで機能します。

OPTIONS プリフライトリクエスト（`Access-Control-Request-Method` または `Access-Control-Request-Headers` を伴う OPTIONS）は、`204 No Content` と上記のヘッダーでショートサーキットされます。これは従来の CORS パターンであり、安全です。プリフライトはデーモンが受け入れるメソッド/ヘッダーを確認するだけで、実際の後続リクエストは引き続きフルチェーン（ホスト許可リスト → Bearer 認証 → ルート）を実行するため、アンチ DNS リバインディングと Bearer 強制は、状態が読み取りまたは変更される前に引き続き機能します。一致したオリジンからのプレーンな OPTIONS リクエストは、CORS ヘッダーが付加されたまま下流に流れます。

許可リストに一致しないオリジンにも `403 {"error":"Request denied by CORS policy"}` が返されます。デフォルトのブロックと同じエンベロープであるため、すでにブロックのレスポンスを解析しているクライアントは、許可リストがデプロイされたデーモンを特別に処理する必要がありません。拒否パスは `Access-Control-*` ヘッダーを**出力しません**（ブラウザは無視しますし、出力するとヘッダーの存在を通じて間接的に許可リストのサイズを公開してしまうため）。

設定されたパターンリストは意図的に `/capabilities` でエコーバック**されません**。ブラウザの Web UI はすでに自身のオリジンを知っているため（そもそもデーモンを呼び出しているのです）、リストを公開すると、`/capabilities` の未認証リーダーが信頼されたすべてのオリジンを列挙できてしまいます（設定ミスのあるデプロイメントにとって有用な偵察情報となります）。SDK クライアントは、特定のオリジンを知る必要なく、「このデーモンはクロスオリジンのブラウザヒットを許可する」というために `caps.features.allow_origin` タグでゲートします。

ループバックのセルフオリジンリクエスト（例: `/demo` ページが同じ `127.0.0.1:port` のデーモンを呼び出す場合）は、CORS ミドルウェアの**前**に実行される**別の** Origin ストリップシムによって処理され、`127.0.0.1:port` / `localhost:port` / `[::1]:port` / `host.docker.internal:port` の `Origin` ヘッダーを削除します。したがって、これらは `--allow-origin` の設定に関係なく通過します。オペレーターは、デモページを機能させるためにデーモン自身のポートをリストに追加する必要はありません。

## 共通のエラー形状

5xx レスポンスは、存在する場合に元のエラーの `code` と `data` を保持します（JSON-RPC スタイル — ACP SDK はエージェントから `{code, message, data}` を転送します）。

```json
{
  "error": "Internal error",
  "code": -32000,
  "data": { "reason": "model quota exceeded" }
}
```

リクエストボディの JSON が不正な場合、以下を返します。

```json
{ "error": "Invalid JSON in request body" }
```

ステータスは `400` です。

不明なセッション ID の `SessionNotFoundError` は以下を返します。

```json
{ "error": "No session with id \"<sid>\"", "sessionId": "<sid>" }
```

ステータスは `404` です。

デーモンのバインドされたワークスペースに正規化されない `cwd` を持つ `POST /session` の `WorkspaceMismatchError`（#3803 §02 — 1 デーモン = 1 ワークスペース）は、`400` と以下を返します。

```json
{
  "error": "Workspace mismatch: daemon is bound to \"…\" but request asked for \"…\". …",
  "code": "workspace_mismatch",
  "boundWorkspace": "/path/the/daemon/binds",
  "requestedWorkspace": "/path/in/the/request"
}
```

これを使用して、事前にミスマッチを検出します。`/capabilities` から `workspaceCwd` を読み取り、`POST /session` から `cwd` を省略するか（バインドされたワークスペースにフォールバックします）、`requestedWorkspace` にバインドされたデーモンにリクエストをルーティングします。

デーモンの `--max-sessions` 上限を超えた `POST /session` は、`Retry-After: 5` ヘッダーと `503` を返します。

```json
{
  "error": "Session limit reached (20)",
  "code": "session_limit_exceeded",
  "limit": 20
}
```

既存のセッションへのアタッチは上限にカウント**されない**ため、アイドル状態のデーモンの再接続は、上限に達していても機能し続けます。

`RestoreInProgressError` — `POST /session/:id/load` と `POST /session/:id/resume` によってのみ発行されます — `Retry-After: 5` ヘッダー（`session_limit_exceeded` と同じ）と `409` を返します。

```json
{
  "error": "Session \"<sid>\" is already being restored via session/<resume|load>; retry session/<load|resume> after it completes",
  "code": "restore_in_progress",
  "sessionId": "<sid>",
  "activeAction": "load",
  "requestedAction": "resume"
}
```

すでに `session/resume` が進行中の ID に対して `session/load` が発行された場合（またはその逆）に発生します。少なくとも `Retry-After` 秒待ってからリトライしてください。基礎となるリストアは `initTimeoutMs`（デフォルト 10 秒）以内に完了します。同じアクションの競合（`load` 対 `load`、`resume` 対 `resume`）は、エラーを返す代わりに統合（coalesce）されます。

`SessionArchivedError` は、呼び出し元が JSONL が `chats/archive/` 配下にあるセッションをロードまたはレジュームしようとしたときに発行されます。

```json
{
  "error": "Session \"<sid>\" is archived. Unarchive it before loading.",
  "code": "session_archived",
  "sessionId": "<sid>"
}
```

ステータスは `409` です。

`SessionArchivingError` は、同じ ID に対してセッションのアーカイブまたはアーカイブ解除の遷移がすでに進行中のときに発行されます。

```json
{
  "error": "Session \"<sid>\" is being archived or unarchived; retry later.",
  "code": "session_archiving",
  "sessionId": "<sid>"
}
```

ステータスは `409` で、`Retry-After: 5` が含まれます。

## ケイパビリティ

デーモンは、serve ケイパビリティレジストリからサポートされている機能タグを公開します。クライアントは、`mode` ではなく `features` に基づいて UI をゲート**しなければなりません**（デザイン §10 に従う）。

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
 'session_lsp', 'session_status',
 'session_close', 'session_metadata', 'session_organization',
 'session_archive', 'mcp_guardrails',
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

> 条件付きタグは、一致するデプロイメントトグルがオンの場合にのみ表示されます（以下の表を参照）。F3 の `permission_mediation` タグは常にオンであり、`modes: ['first-responder', 'designated', 'consensus', 'local-only']` を保持するため、SDK クライアントはビルドでサポートされているセットをイントロスペクトできます。ランタイムでアクティブな戦略は `body.policy.permission` にあります。
`session_scope_override` は、`POST /session` のリクエストごとの `sessionScope` フィールド（下記参照）のネゴシエーションハンドルです。古いデーモンはこのフィールドを暗黙に無視するため、SDK クライアントは送信前にこのタグの `caps.features` をプリフライトする必要があります。

`session_load` と `session_resume` は、明示的な復元ルート（`POST /session/:id/load` および `POST /session/:id/resume`）を公開します。古いデーモンはこれらのパスに対して `404` を返すため、SDK クライアントは呼び出し前に `caps.features` をプリフライトする必要があります。`unstable_session_resume` は、基盤となる ACP メソッドが `connection.unstable_resumeSession` という名前だった時代にリリースされた SDK との互換性のために、非推奨のエイリアスとして引き続き公開されています。新しいクライアントは `session_resume` をゲートとして使用する必要があります。

`slow_client_warning` は SSE バックプレッシャの動作をカバーします。(a) デーモンは、サブスクライバーのライブフレームバックログまたはライブシリアライズバイトバックログが 75% を超えたときに `slow_client_warning` 合成イベントストリームフレームを出力します（オーバーフローエピソードごとに 1 回。両方の測定値が 37.5% 未満に減少した後に再設定されます）。(b) `GET /session/:id/events` は `?maxQueued=N` クエリパラメータ（範囲 `[16, 2048]`）を受け付け、大規模なリプレイリングに対するコールド再接続時のサブスクライバーごとのフレームバックログを事前にサイズ設定します。シリアライズバイトの上限はデーモンが管理し（デフォルトはサブスクライバーごとに **2 MiB**）、ライブ専用であり、意図的にクエリパラメータはありません。デーモン全体のリングサイズは `--event-ring-size`（デフォルト **8000**、#3803 §02 に準拠）によって制御されます。古いデーモンは警告/クエリの動作を暗黙に欠いているため、オプトインする前にこのタグをプリフライトしてください。

`typed_event_schema` は、SDK の `KnownDaemonEvent` スキーマに一致するデーモンイベントペイロードを公開します。古いデーモンでも互換性のあるフレームをストリーミングする場合がありますが、SDK クライアントは型付きイベントのカバレッジを想定する前にこのタグをプリフライトする必要があります。

`client_heartbeat` は `POST /session/:id/heartbeat` を公開します。古いデーモンは `404` を返します。定期ハートビートを発行する前に、このタグをプリフライトしてください。

`session_close` と `session_metadata` は、`DELETE /session/:id` と `PATCH /session/:id/metadata` を公開します。古いデーモンは `404` を返します。クローズまたはリネームのアフォーダンスを公開する前に、これらのタグをプリフライトしてください。

`session_organization` は、カスタムセッショングループとピン留めを公開します。これにより、`GET/POST/PATCH/DELETE /workspace/:id/session-groups`、`PATCH /session/:id/organization`、およびオプトインの整理されたリストビュー `GET /workspace/:id/sessions?view=organized` が追加されます。古いデーモンは変更/グループルートに対して `404` を返し、整理されたビューの契約を無視するため、WebShell/SDK クライアントはグループ化やピン留めの UI を表示する前にこのタグをプリフライトする必要があります。

`session_archive` は v1 ディレクトリ状態アーカイブ API を公開します。`POST /sessions/archive`、`POST /sessions/unarchive`、および `GET /workspace/:id/sessions?archiveState=active|archived` です。アーカイブされたセッションは、アーカイブ解除されるまでロードまたは再開できません。

`session_lsp` は、デーモンクライアント用の読み取り専用構造化 LSP ステータススナップショットである `GET /session/:id/lsp` を公開します。古いデーモンは `404` を返します。リモート LSP ステータスを公開する前に、このタグをプリフライトしてください。

`session_status` は、ID ごとの単一セッションのライブブリッジサマリー（`clientCount` / `hasActivePrompt` およびコアフィールド）である `GET /session/:id/status` を公開します。古いデーモンは `404` を返します。完全なセッションリストをスキャンする代わりに単一セッションのステータスをポーリングする前に、このタグをプリフライトしてください。

`session_approval_mode_control`、`workspace_tool_toggle`、`workspace_init`、および `workspace_mcp_restart`（issue [#4175](https://github.com/QwenLM/qwen-code/issues/4175) PR 17）は、後述の「Mutation: approval, tools, init, MCP restart」で文書化されている 4 つの変更制御ルートを公開します。これら 4 つはすべて PR 15 の変更ゲートによって厳密にゲーティングされています（ベアラートークンなしで構成されたデーモンは、それらを 401 `token_required` で拒否します）。古いデーモンは `404` を返します。対応するアフォーダンスを公開する前に、各タグをプリフライトしてください。

`mcp_guardrails`（issue [#4175](https://github.com/QwenLM/qwen-code/issues/4175) PR 14）は MCP バジェットサーフェスをカバーします。`GET /workspace/mcp` の `clientCount` / `clientBudget` / `budgetMode` / `budgets[]` フィールド、サーバーごとのセルの `disabledReason` フィールド、および `--mcp-client-budget` / `--mcp-budget-mode` CLI フラグです。古いデーモンは新しいフィールドを完全に省略します。SDK クライアントは `budgets[]` のセマンティクスに依存する前にこのタグをプリフライトします。レジストリ記述子には、将来の機能モード公開のために `modes: ['warn', 'enforce']` も含まれています。現時点では、クライアントはスナップショットの `budgetMode` フィールドからモードを推測します。`enforce` モードでのサーバー拒否は `Object.entries(mcpServers)` の宣言順序によって決定的になります。将来のスコープ優先度レイヤー（qwen-code が採用する場合）では、claude-code の `plugin < user < project < local` 規則を反映して、「最低優先度から」にシフトします。

> ⚠️ **PR 14 v1 スコープ: ワークスペースごとではなく、セッションごとです。** デーモン内の各 ACP セッションは、独自の `Config` + `McpClientManager` を構築します（`acpAgent.newSessionConfig` 経由）。バジェットは **セッションごと** のライブ MCP クライアントを制限します。各セッションは、転送された環境変数から `QWEN_SERVE_MCP_CLIENT_BUDGET` を独立して読み取ります。`--mcp-client-budget=10` で 5 つの並行 ACP セッションがある場合、デーモン全体の実際のライブ MCP クライアント数は 5 × 10 = 50 に達する可能性があります。`GET /workspace/mcp` スナップショットは **ブートストラップセッションの** `McpClientManager` アカウンティングのみを読み取ります。`budgets[0].scope: 'session'` の値は、これが集計ではなくセッションごとであることを示す正確なシグナルです。**Wave 5 PR 23（共有 MCP プール）** では、ワークスペーススコープのマネージャーが導入され、真のクロスセッション集計のためにセッションごとのセルの横に `scope: 'workspace'` セルが追加されます。v1 は、PR 23 が構築するプロセス内カウンター + ソフト強制の基盤です。

`workspace_file_read` は、テキスト/リスト/統計/glob ワークスペースファイルルート
（`GET /file`、`GET /list`、`GET /glob`、`GET /stat`）をカバーします。`workspace_file_bytes`
は `GET /file/bytes` をカバーします。これは後から追加されたもので、クライアントが PR19 時代のデーモンに対して
生のバイトウィンドウサポートをプリフライトできるようにします。`workspace_file_write` は
ハッシュ対応のテキスト変更ルート（`POST /file/write`、`POST /file/edit`）を
カバーします。write タグはルート契約が存在することを意味しますが、現在の
デプロイが匿名の変更に開放されていることを意味するものではありません。write/edit は厳密な変更
ルートであり、ループバックでも構成されたベアラートークンを必要とします。

`daemon_status` は、後述する統合された読み取り専用
オペレーター診断スナップショットである `GET /daemon/status` を公開します。

**条件付きタグ。** 少数の機能タグは、一致するデプロイトグルがオンの場合にのみ公開されます。タグの存在 = 動作がオン。タグの欠如 = そのタグより前の古いデーモン、またはオペレーターがオプトインしていない現在のデーモンのどちらかです。現在のところ:

| タグ                        | 公開される条件 …                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `require_auth`             | デーモンが `--require-auth`（または組み込み API 経由で `requireAuth: true`）で開始された場合。ループバックバインドの `/health` を含むすべてのルートでベアラートークンが必須です。                                                                                                                                                                                                                                                                                                                                    |
| `mcp_workspace_pool`       | 共有 MCP トランスポートプールがアクティブな場合。`QWEN_SERVE_NO_MCP_POOL=1` でプールが無効化されている場合は省略されます。                                                                                                                                                                                                                                                                                                                                                                                                             |
| `mcp_pool_restart`         | 共有 MCP トランスポートプールがアクティブな場合。再起動レスポンスにプール対応のマルチエントリシェープが含まれる可能性があります。                                                                                                                                                                                                                                                                                                                                                                                                           |
| `allow_origin`             | T2.4 ([#4514](https://github.com/QwenLM/qwen-code/issues/4514))。デーモンが少なくとも 1 つの `--allow-origin <pattern>`（または組み込み API 経由で `allowOrigins: [...]`）で開始された場合。一致するオリジンからのクロスオリジンリクエストには適切な CORS レスポンスヘッダーが返されます。一致しないオリジンにはデフォルトの 403 が返されます。設定されたパターンリストは、認証されていないリーダーに信頼されたオリジンセットが漏洩しないように、意図的に `/capabilities` でエコーされません。ブラウザの WebUI はすでに自身のオリジンを知っています。 |
| `prompt_absolute_deadline` | `--prompt-deadline-ms` / `QWEN_SERVE_PROMPT_DEADLINE_MS` / `ServeOptions.promptDeadlineMs` が正の整数に設定されている場合。                                                                                                                                                                                                                                                                                                                                                                                        |
| `writer_idle_timeout`      | `--writer-idle-timeout-ms` / `QWEN_SERVE_WRITER_IDLE_TIMEOUT_MS` / `ServeOptions.writerIdleTimeoutMs` が正の整数に設定されている場合。                                                                                                                                                                                                                                                                                                                                                                             |
| `workspace_settings`       | デーモンが設定の永続化が利用可能な状態で作成された場合。                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `session_shell_command`    | セッションシェル実行が明示的に有効になっている場合。                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `rate_limit`               | `--rate-limit` / `QWEN_SERVE_RATE_LIMIT=1` / `ServeOptions.rateLimit` が有効になっている場合。                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `workspace_reload`         | 組み込みルート設定でワークスペースのリロードサポートが利用可能な場合。                                                                                                                                                                                                                                                                                                                                                                                                                                      |
`mcp_guardrails` はこの条件付きテーブルには含まれ**ません**。これは常に有効なタグであり、オペレーターが予算を設定しているかどうかに関係なく、バイナリが新しい `/workspace/mcp` 予算フィールドをサポートする場合は常にアドバタイズされます。`--mcp-client-budget` を設定していないオペレーターでも、新しいフィールド（`budgetMode: 'off'`, `budgets: []`）を受け取ります。

`mcp_guardrail_events`（issue [#4175](https://github.com/QwenLM/qwen-code/issues/4175) PR 14b）は、ポーリングループなしで MCP 予算状態の閾値超過を通知する、型付き SSE プッシュイベントをアドバタイズします。`GET /session/:id/events` には 2 種類のフレームタイプが到着します。

- `mcp_budget_warning` — `reservedSlots.size / clientBudget` が 75% を超える crossing（閾値超過）時に 1 回発生します。比率が 37.5%（`MCP_BUDGET_REARM_FRACTION`）を下回った後にのみ再武装（リアーム）されます。PR 10 の `slow_client_warning` ヒステリシスを反映したものですが、サブスクライバーごとのバックログレベルではなく、マネージャーレベルで動作します。ペイロード: `{ liveCount, reservedCount, budget, thresholdRatio: 0.75, mode: 'warn' | 'enforce' }`。`warn` と `enforce` の両方のモードで発生し、`off` では決して発生しません。
- `mcp_child_refused_batch` — 1 つ以上のサーバーが拒否された場合に各 `discoverAllMcpTools*` パスの終了時に発生し、**かつ** `readResource` の遅延スポーン拒否パスで長さ 1 のバッチとして発生します。ペイロード: `{ refusedServers: [{ name, transport, reason: 'budget_exhausted' }, ...], budget, liveCount, reservedCount, mode: 'enforce' }`。`warn` モードでは決して拒否しないため、`mode` はリテラルの `'enforce'` になります。

どちらのイベントもセッションごとの SSE リプレイリングに保存され（`id` を持ちます）、`Last-Event-ID` で再接続するクライアントはこれらを介して再開できます。長時間の切断後の状態については、`GET /workspace/mcp` のスナップショットが引き続き信頼できる情報源（source-of-truth）となります。一度アドバタイズされると常に有効になり、条件付きの切り替えはありません。SDK のリデューサー状態（`DaemonSessionViewState`）は、シンプルな遅延表示風の UI を必要とするアダプター向けに、`mcpBudgetWarningCount`、`lastMcpBudgetWarning`、`mcpChildRefusedBatchCount`、`lastMcpChildRefusedBatch` を公開します。

## Routes

### `GET /health`

Liveness プローブ。デフォルトの形式では、リスナーが稼働していれば `200 {"status":"ok"}` を返します。軽量でブリッジへのアクセスを伴わないため、高頻度の k8s/Compose liveness プローブに適しています。

ブリッジの**カウンター**を公開するプローブ（情報提供のみを目的とし、真の liveness チェックではありません）には、`?deep=1`（`?deep=true` または単なる `?deep` も受け付けます）を渡します。

```json
{ "status": "ok", "sessions": 3, "pendingPermissions": 1 }
```

> ⚠️ deep プローブは**情報提供のみ**を目的としており、実際の liveness 検証ではありません。これはカウンターアクセッサー（`bridge.sessionCount`、`bridge.pendingPermissionCount`）を読み取りますが、これらはシンプルな Map サイズのゲッターです。個別の子プロセスやチャネルに ping を送信しないため、スタックしているにもかかわらずカウントされ続けているセッションを検出することはできません。これは、「この daemon をローテーションから外す」ためのトリガーとしてではなく、キャパシティダッシュボード（現在の同時実行数 vs `--max-sessions`、キューの深さ）のために使用してください。カスタムブリッジ実装のゲッターがスローした場合、理論的には `503 {"status":"degraded"}` レスポンスが返される可能性がありますが、実際のブリッジのゲッターがスローすることはなく、通常の操作では deep プローブは常に 200 を返します。実際の liveness については、リスナーが TCP 接続を受け入れるかどうか（つまり、`?deep` なしのデフォルトの `/health`）に依存してください。

**Auth:** ループバック**以外**のバインドでのみ必須です。ループバック（`127.0.0.1`、`::1`、`[::1]`）では、`/health` は bearer ミドルウェアより前に登録されるため、ポッド内の k8s/Compose プローブはトークンを保持する必要がありません。ループバック以外（`--hostname 0.0.0.0` など）では、ルートは bearer ミドルウェアの後に登録され、有効なトークンがない場合は 401 を返します。そうでなければ、未認証の呼び出し元が任意のアドレスをプローブして `qwen serve` の存在を確認できてしまい、ポートスキャンと組み合わさるとまずい低深刻度の情報漏洩につながります。ループバックの免除においても、CORS deny と Host allowlist は引き続き適用されます。

### `GET /daemon/status`

読み取り専用のオペレーター診断。`/health` とは異なり、これは通常の daemon API です。
ループバックバインドを含め、bearer 認証とレート制限の後に登録されます。クエリパラメータ:

- `detail=summary`（デフォルト）はインメモリ上の daemon 状態のみを読み取ります。
- `detail=full` はライブセッション診断、ACP 接続診断、認証デバイスフローカウント、およびワークスペース状態セクションも含みます。
- その他の `detail` は `400 { "code": "invalid_detail" }` を返します。

`summary` は意図的にワークスペース状態メソッドのクエリ、ACP 子プロセスの開始、またはセッションのスポーンを行いません。`full` は各ワークスペースセクションを個別にクエリします。
タイムアウトや例外が発生した場合、そのセクションのみが `unavailable` としてマークされ、
`workspace_status_unavailable` イシューが追加されます。

レスポンスの形状:

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
    "channelWorker": {
      "enabled": false,
      "state": "disabled",
      "channels": []
    },
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
    },
    "perf": {
      "eventLoop": { "meanMs": 0, "p50Ms": 0, "p99Ms": 0, "maxMs": 0 },
      "promptQueueWait": {
        "count": 0,
        "meanMs": 0,
        "maxMs": 0,
        "lastMs": null
      },
      "pipe": {
        "inbound": { "count": 0, "totalBytes": 0, "maxBytes": 0 },
        "outbound": { "count": 0, "totalBytes": 0, "maxBytes": 0 }
      }
    },
    "activity": {
      "activePrompts": 0,
      "pendingPrompts": 0,
      "queuedPrompts": 0,
      "lastActivityAt": null,
      "idleSinceMs": null
    }
  }
}
```

`runtime.perf` はオプションです。存在する場合、daemon プロセスのイベントループ遅延、プロンプト FIFO キュー待機サンプル、および daemon 子プロセスパイプのバイトカウンターのみを報告します。
ACP 子プロセスのイベントループ遅延は `/daemon/status` には含まれません。

`status` は、いずれかのイシューがエラー重大度の場合は `error`、いずれかのイシューが警告重大度の場合は `warning`、それ以外の場合は `ok` になります。イシューコードは安定しており、
`session_capacity_high`、`connection_capacity_high`、`pending_permissions`、
`acp_channel_down`、`preflight_error`、`mcp_budget_warning`、
`mcp_budget_exhausted`、`rate_limit_hits`、`channel_worker_exited`、
`channel_worker_partial_connect`、および `workspace_status_unavailable` が含まれます。リスナーの準備が整ってから完全なランタイムがマウントされるまでの短いウィンドウ期間中、`/daemon/status` は `daemon_runtime_starting` を報告する場合があります。非同期ランタイムのマウントに失敗した場合、`daemon_runtime_failed` を報告し、ステータス以外のランタイムルートは `503` を返します。

`runtime.activity` は daemon 全体のプロンプトアクティビティを報告します。`activePrompts` は実行中のプロンプトを持つセッションをカウントします。`pendingPrompts` は、実行中のプロンプトと FIFO 待機中のプロンプトを含め、まだ確定していないすべての受け入れ済みプロンプトをカウントします。`queuedPrompts` は、受け入れられたがまだディスパッチされていない FIFO 待機中のプロンプトをカウントします。`lastActivityAt` は最後のプロンプト開始/終了またはセッションスポーンの ISO 8601 タイムスタンプです。daemon が起動以来いかなるアクティビティも処理していない場合は `null` になります。`idleSinceMs` はレスポンス生成時に `lastActivityAt` から計算されます。

`runtime.channel.live` は daemon 内部の ACP ブリッジチャネルを報告します。これはチャネルアダプターワーカーではありません。daemon が管理するチャネルは
`runtime.channelWorker` を使用し、その `state` は `disabled`、`starting`、
`running`、`exited`、`failed`、または `stopped` のいずれかです。ワーカーが `running` に達した後に終了した場合、`/daemon/status` は daemon をオンラインのまま維持し、警告イシューコード `channel_worker_exited` を報告します。

daemon が管理するチャネルワーカーの起動は引き続き fail-fast です。`qwen serve
--channel ...` が ready 状態に到達するワーカーを起動できない場合、serve の起動は失敗します。
ワーカーが ready に到達した後、予期しない終了は serve スーパーバイザーによって制限付きポリシー内で再起動されます。5 分間のウィンドウで最大 3 回の再起動試行が行われ、1 秒、5 秒、そして 15 秒のバックオフが適用されます。ワーカーは 15 秒ごとに IPC ハートビートを送信します。45 秒間ハートビートが観測されない場合、スーパーバイザーはワーカーを古いものとみなしてキルし、`staleHeartbeatAt` を記録して、同じ再起動パスを使用します。

`runtime.channelWorker` には追加の運用フィールドが含まれる場合があります。
`requestedChannels`、`pid`、`startedAt`、`exitCode`、`signal`、`error`、
`restartCount`、`lastExitAt`、`lastRestartAt`、`nextRestartAt`、
`lastHeartbeatAt`、および `staleHeartbeatAt` です。`restartCount` はこの serve プロセスによって行われた再起動試行のライフタイム数です。`restartCount > 0` の実行中のワーカーは、別のイシューが適用されない限り健全です。`requestedChannels` に `channels` に存在しない名前が含まれている実行中のワーカーは、`channel_worker_partial_connect` を報告します。

`qwen channel status` は引き続き pidfile メタデータを読み取ります。再起動ウィンドウ中は serve 所有の pidfile は予約されたままですが、クライアントが古いワーカープロセスを表示しないように `workerPid` は省略されます。ワーカーの stdout/stderr は daemon ログに転送されますが、bearer トークン、機密性の高いワーカー環境変数、およびプロキシ URL 認証情報は伏字（redacted）処理されます。

セキュリティ: レスポンスには bearer トークン、クライアント ID、完全な ACP 接続 ID、デバイスフローユーザーコード、または検証 URL が含まれることはありません。`summary` は daemon ログパスを省略します。`full` は認証されたオペレーターに対してこれを含む場合があります。

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

安定したコントラクト: `v` がインクリメントされた場合、フレームレイアウトが後方互換性のない方法で変更されています。

> **`protocolVersions`** は daemon が話すことができる serve プロトコルバージョンを記述します。`current` は daemon の推奨プロトコルバージョンであり、`supported` は互換性のあるセットです。特定のプロトコルを必要とするクライアントは `supported` を確認する必要があります。機能固有の UI は引き続き `features` でゲートする必要があります。v=1 への追加: 古い v=1 daemon はこのフィールドを省略するため、古いビルドをターゲットにする SDK クライアントはこれをオプションとして扱う必要があります。

> **`modelServices` は Stage 1 では常に `[]` です。** エージェントは単一のデフォルトモデルサービスを使用し、それをネットワーク経由で列挙しません。Stage 2 では、登録されたモデルアダプターからこれが設定され、SDK クライアントがサービスピッカーを構築できるようになります。それまでは、このフィールドが空でないことに依存しないでください。

> **`workspaceCwd`** はこの daemon がバインドする正規の絶対パスです（#3803 §02 — 1 daemon = 1 workspace）。これを使用して、(a) `/session` をポストする前に不一致を検出し、(b) `POST /session` で `cwd` を省略します（ルートはこのパスにフォールバックします）。マルチワークスペースデプロイメントでは、異なるポートで複数の daemon を公開し、それぞれが独自の `workspaceCwd` を持ちます。v=1 への追加: §02 以前の v=1 daemon はこのフィールドを省略します。古いビルドをターゲットにするクライアントは、使用する前に null チェックを行う必要があります。

### Read-only runtime status routes

これらのルートは daemon 側のランタイムスナップショットを報告します。これらは追加の v1 ルートであり、
状態を変更（mutate）せず、serve プロトコルバージョンも変更しません。ワークスペース状態ルートは、クライアントが GET ルートをポーリングしたからといって、意図的に ACP 子プロセスを起動**しません**。daemon がアイドル状態の場合、空のスナップショットで `initialized: false` を返します。セッション状態ルートはライブセッションを必要とし、不明な ID には標準の `404 SessionNotFoundError` 形状を使用します。

Capability tags:
- `workspace_mcp` → `GET /workspace/mcp`
- `workspace_skills` → `GET /workspace/skills`
- `workspace_providers` → `GET /workspace/providers`
- `workspace_env` → `GET /workspace/env`
- `workspace_preflight` → `GET /workspace/preflight`
- `session_context` → `GET /session/:id/context`
- `session_supported_commands` → `GET /session/:id/supported-commands`
- `session_tasks` → `GET /session/:id/tasks`
- `session_status` → `GET /session/:id/status`

共通のステータスセル:

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

`errorKind` は `/workspace/preflight`、`/workspace/env`、および（将来的には）MCP guardrails で共有される closed enum であり、SDK クライアントがフリーフォームのメッセージを解析する代わりに、カテゴリごとに修復（remediation）をレンダリングできるようにします。PR 13 (#4175) で上記の7つのリテラルが導入されました。PR 14 では、egress probe が実装された時点で `blocked_egress` が設定されます。

ステータスペイロードは、MCP の環境変数値、ヘッダー、OAuth/サービスアカウントの詳細、プロバイダーの API キー、プロバイダーの `baseUrl` / `envKey`、skill の本文、skill のファイルシステムパス、hook の定義、またはシークレット環境変数の値を公開することはありません。`/workspace/env` はホワイトリスト化された環境変数の**存在**のみを報告します。プロキシ URL は認証情報が削除され、ネットワーク上に送信される前に `host:port` に縮小されます。

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

`discoveryState` は `not_started`、`in_progress`、または `completed` のいずれかです。`transport` は `stdio`、`sse`、`http`、`websocket`、`sdk`、または `unknown` のいずれかです。discovery が成功した場合、`errors` は省略されます。

**MCP クライアント guardrails (issue [#4175](https://github.com/QwenLM/qwen-code/issues/4175) PR 14)。** PR 14 以降の daemon は、4つの追加フィールドと1つの workspace レベルのセルを使用してペイロードを拡張します。

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

`budgetMode` は `enforce`、`warn`、または `off` のいずれかです。budget が設定されていない場合、`clientBudget` は存在しません。`budgets[]` は PR 14 以降の daemon では**常に配列**です（`budgetMode === 'off'` の場合は空になる可能性があります）。PR 14 より前の daemon ではこのフィールドは完全に省略されます。v1 は `scope: 'session'` のセルを1つ出力します（セッションごとの強制 - 理由は上記の capabilities セクションを参照してください）。コンシューマーは、認識できない `scope` 値を持つ追加の `budgets[]` エントリを許容**しなければなりません**。Wave 5 PR 23 では、スキーマのバージョンアップなしに、セッションごとのセルに加えて `scope: 'workspace'`（または `'pool'`）が追加されます。

サーバーごとのセルの `disabledReason` は、オペレーターによって無効化されたもの（`'config'` — `disabledMcpServers` 設定リスト）と、budget によって拒否されたもの（`'budget'` — 検出されたが `enforce` モードのために接続されなかったもの）を区別します。拒否は `Object.entries(mcpServers)` の宣言順序によって決定的になります。サーバーごとの `status: 'error', errorKind: 'budget_exhausted'` は、生の `mcpStatus: 'disconnected'`（これは真実ですが、オペレーターが直面する重大度ではありません）を覆います。

PR 14 v1 における budget の強制は、**workspace ごとではなくセッションごと**に行われます。プロセスレベルでは、#4113 以降の Mode B daemon は `1 daemon = 1 workspace × N sessions` ですが、`McpClientManager` は `acpAgent.newSessionConfig` を介して各 ACP セッションの `Config` 内で構築されるため、N 個のセッションはそれぞれ独自のキャップのコピーを強制します。スナップショットはブートストラップセッションのビューを表します。Wave 5 PR 23 では、workspace スコープの共有 MCP プールが導入され、真の workspace ごとの強制へと移行します。

**budget 逼迫の検出。** PR 14b 以降に設定される2つの surface があります。

- **Push イベント**（`mcp_guardrail_events` 経由で通知）: `GET /session/:id/events` をサブスクライブし、`KnownDaemonEvent` を介して `mcp_budget_warning` / `mcp_child_refused_batch` フレームを絞り込みます。ステートマシンは 75% を超えた時点で1回発火し（37.5% を下回ると再トリガーされます）。`enforce` モードでは、拒否は discovery パスごとに1回に統合されます。
- **スナップショットのポーリング**（`mcp_guardrails` 経由で通知）: `GET /workspace/mcp` を実行し、セッションごとの budget セル（`budgets[0]`）を調査します。

- `budgets[0].status === 'warning'` ⇔ `liveCount >= 0.75 * clientBudget`（PR 14b の push イベントが使用するヒステリシス閾値と一致）。
- `budgets[0].status === 'error'` ⇔ `refusedCount > 0`（この discovery パスで1つ以上のサーバーが拒否された）。
- `budgets[0].status === 'ok'` ⇔ 75% の閾値を下回り、かつ拒否がない。

推奨されるポーリング頻度: すでに `/workspace/mcp` をポーリングしているものと同期させます。スナップショットは軽量であり、budget セルに追加の discovery コストはかかりません。push イベントをサブスクライブしている SDK クライアントでも、長時間の切断後の状態把握のためにスナップショットが役立ちます（SSE リプレイリングの深さは有限です — `--event-ring-size`、デフォルト 8000 — そのため、リングのカバレッジよりも長くオフラインになったクライアントはスナップショットの再同期にフォールバックします）。

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

`level` は `project`、`user`、`extension`、または `bundled` のいずれかです。discovery が成功した場合、`errors` は省略されます。

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

モデルは auth type ごとにグループ化されます。プロバイダー接続の診断は `/workspace/preflight` の `providers` セルに存在し、環境の preflight は `/workspace/preflight` と `/workspace/env`（下記）に存在します。スナップショットの構築が成功した場合、`errors` は省略されます。

### `GET /workspace/env`

daemon プロセスの runtime、platform、sandbox、proxy、およびホワイトリスト化されたシークレット環境変数の**存在**を報告します。常に `process.*` の状態から応答します。daemon はこのエンドポイントに応答するために ACP 子プロセスを生成することはなく、ACP が稼働中かアイドルかに関わらず応答は同一です。`acpChannelLive` フィールドは情報提供のみを目的としています。

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

**リダクションポリシー。** `kind: 'env_var'` のセルに `value` フィールドが含まれることはなく、クライアントは `present: boolean` のみを確認できます。`kind: 'proxy'` のセルは、生の環境変数値を認証情報のリダクション（`redactProxyCredentials`）にかけ、次に `URL` 解析を通じて、ネットワーク上には `host:port` のみが伝わるようにします。`NO_PROXY` は URL ではなくホストリストであるため、リダクションをそのまま通過します。列挙されるシークレット環境変数のホワイトリストには、現在 `OPENAI_API_KEY`、`ANTHROPIC_API_KEY`、`GEMINI_API_KEY`、`GOOGLE_API_KEY`、`DASHSCOPE_API_KEY`、`OPENROUTER_API_KEY`、および `QWEN_SERVER_TOKEN` が含まれています。他の環境変数は列挙されないため、誤って設定されたシークレットは不可視のままとなります。

### `GET /workspace/preflight`

daemon の準備状況チェックを報告します。**daemon レベルのセル**（`node_version`、`cli_entry`、`workspace_dir`、`ripgrep`、`git`、`npm`）は常に `process.*` と `node:fs` から設定されます。**ACP レベルのセル**（`auth`、`mcp_discovery`、`skills`、`providers`、`tool_registry`、`egress`）は稼働中の ACP 子プロセスを必要とします。daemon がアイドル状態の場合、これらは `status: 'not_started'` のプレースホルダーを出力します。このエンドポイントはセルを設定するためだけに ACP を生成することはなく、該当するセルは `not_started` にフォールバックします。

アイドル時の応答（ACP 子プロセスなし）:

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
セルの構造:

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

`errorKind` のセマンティクス:

- `missing_binary` — Node バージョンが要件を満たしていない、`QWEN_CLI_ENTRY` がない、ripgrep / git / npm が PATH にない（オプションのバイナリの場合はエラーではなく警告）。
- `missing_file` — `boundWorkspace` が存在しないかディレクトリではない、または skill の解析エラーで存在しないまたは読み取り不能なファイルを指している。
- `parse_error` — `SKILL.md` の解析失敗、不正な設定 JSON。
- `auth_env_error` — `validateAuthMethod` が null 以外の失敗文字列を返した、またはプロバイダー解決から伝播した `ModelConfigError` サブクラス。
- `init_timeout` — ブリッジでの `withTimeout` の reject（ACP ラウンドトリップ待機中の実際のタイムアウト）。`BridgeTimeoutError` 型付きクラスを通じて認識される。注意: `connecting > 0` を持つ一時的な `mcp_discovery` の `warning` セルはこの kind を持たない。それは実際のタイムアウトとは異なる、進行中の通常のハンドシェイク状態である。
- `protocol_error` — チャネルがリクエスト中に閉じられたため、またはツールレジストリが予期せず欠落していたため、ACP `extMethod` が拒否された。
- `blocked_egress` — PR 14 (#4175) 用に予約されている。PR 13 は `egress` セルを `status: 'not_started'` のままにする。

ブリッジが preflight リクエストの処理中に ACP 子プロセスに到達できない場合（例: リクエスト中のチャネルクローズ）、エンベロープの `errors` 配列には失敗を説明する単一の `ServeStatusCell` が含まれ、セルは `not_started` の ACP プレースホルダーにフォールバックする。Daemon レベルのセルは引き続き返される。

### ワークスペースファイルルート

すべてのファイルパスは daemon のバインドされたワークスペースを通じて解決される。レスポンスはワークスペース相対パスを使用し、通常の成功ケースで絶対ファイルシステムパスを返すことはない。成功時のファイルレスポンスには以下が含まれる。

```http
Cache-Control: no-store
X-Content-Type-Options: nosniff
```

ファイルシステムエラーは以下の JSON 構造を使用する。

```json
{
  "errorKind": "hash_mismatch",
  "error": "expected sha256:..., found sha256:...",
  "hint": "re-read the file and retry with the latest hash",
  "status": 409
}
```

`errorKind` の値には `path_outside_workspace`、`symlink_escape`、`path_not_found`、`binary_file`、`file_too_large`、`untrusted_workspace`、`permission_denied`、`parse_error`、`hash_mismatch`、`file_already_exists`、`text_not_found`、`ambiguous_text_match` が含まれる。

#### `GET /file`

テキストファイルを読み取る。クエリパラメータ: `path`（必須）、`maxBytes`、`line`、`limit`。daemon はバイナリファイルとテキスト読み取り上限を超えるファイルを拒否する。レスポンスには `hash` が含まれ、これは `line`、`limit`、`maxBytes` によってスライスが返された場合でも、ディスク上のファイル全体の生バイトに対する SHA-256 ダイジェストである。

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

デコードせずにファイルから生バイトを読み取る。クエリパラメータ: `path`（必須）、`offset`（デフォルト `0`）、`maxBytes`（デフォルト `65536`、最大 `262144`）。このルートは、ファイル全体を読み込まずに、大きなバイナリファイルの境界付きウィンドウをサポートする。レスポンスには、返されたウィンドウがファイル全体をカバーしている場合にのみ `hash` が含まれる。

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

テキストファイルを作成または置換する。これは厳密な変更ルートであり、設定されたトークンなしのループバックでは `401 { "code": "token_required" }` を返す。`--require-auth` を指定すると、グローバルな Bearer ミドルウェアがルートが実行される前に未認証リクエストを拒否する。

ボディ:

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

`mode` は `create` または `replace` でなければならない。`create` は既存のファイルを上書きしない（`409 file_already_exists`）。`replace` には `expectedHash` が必要である。欠落または不正なハッシュは `400 parse_error` となり、古いハッシュは `409 hash_mismatch` となる。`expectedHash` は `sha256:` に 64 文字の小文字 hex 文字列を続けたもので、ディスク上の生バイトに対して計算される。

`bom`、`encoding`、`lineEnding` を指定することができる。置換はデフォルトで既存ファイルのエンコーディングプロファイルを保持する。明示的なフィールドはそれをオーバーライドする。バイナリの書き込みは対象外である。

daemon は対象ディレクトリ内のランダムな一時ファイルに書き込み、サポートされている場所で fsync を実行し、`rename()` の直前に現在のハッシュを再チェックしてから、適切な名前に rename する。これにより、部分的なファイルの観察が防止され、同じファイルへの daemon 起点の書き込みが直列化されるが、これはクロスプロセスのカーネル compare-and-swap ではない。外部エディタは、最終ハッシュチェックと rename の間のわずかなウィンドウで依然として競合する可能性がある。

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

既存のテキストファイルに 1 回の正確なテキスト置換を適用する。これも厳密な変更ルートであり、`expectedHash` を必要とする。

```json
{
  "path": "src/config.ts",
  "oldText": "timeout: 30000",
  "newText": "timeout: 60000",
  "expectedHash": "sha256:..."
}
```

`oldText` は空でなく、正確に 1 回出現する必要がある。一致しない場合は `422 text_not_found` を返し、複数一致する場合は `422 ambiguous_text_match` を返す。このルートはエンコーディング、BOM、改行コードを保持し、アトミックな rename の直前に `expectedHash` を再チェックする。

認証された呼び出し元がパスを指定しているため、無視されたパスへの明示的な書き込み/編集は許可される。成功レスポンスと監査イベントには `matchedIgnore: "file" | "directory" | null` が含まれる。

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

`state` は `POST /session`、`POST /session/:id/load`、`POST /session/:id/resume` で使用される ACP の model/mode/config-option の構造と同じものを反映している。

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

`availableCommands` は `available_commands_update` SSE 通知で使用されるものと同じコマンドスナップショットである。`availableSkills` は skill 名のみをリスト化する。クライアントはこのルート経由で skill のボディやパスを期待してはならない。

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
    },
    {
      "kind": "agent",
      "id": "agent-2",
      "label": "general-purpose: run the failing test",
      "description": "run the failing test",
      "status": "running",
      "startTime": 1699999999500,
      "runtimeMs": 500,
      "outputFile": "/tmp/agent-2.jsonl",
      "isBackgrounded": false,
      "subagentType": "general-purpose",
      "parentAgentId": "agent-1",
      "parentName": "reviewer",
      "depth": 1
    }
  ]
}
```

このルートは読み取り専用の帯域外スナップショットである。意図的にプロンプトではなく、セッションがストリーミング中であってもクエリできる。レスポンスには agent、shell、monitor タスクレジストリからのホワイトリスト化されたメタデータのみが含まれ、コントローラー、タイマー、オフセット、保留中のメッセージ、および生のレジストリオブジェクトは決して公開されない。

別のサブエージェントによって生成されたエージェントタスク（`maxSubagentDepth` によって制限されるネストされたサブエージェント）は、3 つのオプションの系譜フィールドを持つ: `parentAgentId`（生成元のエージェントタスクの `id`）、`parentName`（生成元のエージェントの `subagentType`。レジストリからの親の削除後も存続するように登録時にキャプチャされる）、および `depth`（0 ベースの起動深度。0 = トップレベルセッションによって生成）。トップレベルセッションによって起動されたエージェントは `parentAgentId` と `parentName` を省略する。クライアントはこれら 3 つのフィールドをすべてオプションとして扱い、存在しない場合はフラットリストにフォールバックすべきである。

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

`status` は `NOT_STARTED`、`IN_PROGRESS`、`READY`、`FAILED` のいずれかである。オプションの `error` は、利用可能な場合に失敗したサーバーに存在する。無効化された LSP（ベアモードを含む）は、`enabled: false`、ゼロのカウント、および `servers: []` で HTTP 200 を返す。サーバーが構成されていない状態で LSP が有効な場合、`enabled: true`、`configuredServers: 0`、および `servers: []` を返す。クライアントが存在する前に初期化が失敗した場合、レスポンスに `initializationError` が含まれる可能性がある。ライブクライアントがスナップショットを提供できない場合、レスポンスには `statusUnavailable: true` が含まれる。

このルートは安定したクライアント向けフィールドのみを公開する。プロセス ID、spawn 引数、stderr の末尾、root URI、ワークスペースフォルダーパスなどのデバッグ内部情報は意図的に省略されている。

### `POST /session`

新しいエージェントを生成するか、既存のエージェントにアタッチする（`sessionScope: 'single'`（デフォルト）の場合）。

リクエスト:

```json
{
  "cwd": "/absolute/path/to/workspace",
  "modelServiceId": "qwen-prod",
  "sessionScope": "thread"
}
```

| Field            | Required | Notes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ---------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `cwd`            | no       | daemon のバインドされたワークスペースに一致する絶対パス。省略された場合、ルートは `boundWorkspace` にフォールバックする（`/capabilities.workspaceCwd` から読み取る）。一致しない空でない `cwd` は `400 workspace_mismatch` を返す（#3803 §02 — 1 daemon = 1 workspace）。ワークスペースパスは `realpathSync.native` 経由で正規化される（存在しないパスの場合は resolve-only のフォールバックを使用）ため、大文字と小文字を区別しないファイルシステムでスペルごとにセッションが拒否されることはない。                                                                                                                                                                          |
| `modelServiceId` | no       | エージェントがルーティングする構成済みの_モデルサービス_（バックエンドプロバイダー — Alibaba ModelStudio、OpenRouter など）を選択する。省略された場合、エージェントはデフォルトを使用する。ワークスペースにすでにセッションがある場合、これは既存のセッションで `setSessionModel` を呼び出し、`model_switched` をブロードキャストする。すでにバインドされたサービス**内**のモデルを選択する `POST /session/:id/model` の `modelId` とは異なる。`/capabilities` の `modelServices` 配列は構成済みサービスの公開用に予約されている。Stage 1 では常に `[]` である（エージェントのデフォルトサービスが使用され、HTTP 経由で列挙されない）。 |
| `sessionScope`   | no       | セッション共有のリクエストごとのオーバーライド。`'single'`（daemon 全体のデフォルト）は、2 回目の同じワークスペースへの `POST /session` で既存のセッションを再利用する（`attached: true`）。`'thread'` は呼び出しごとに新しい個別のセッションを強制的に作成する。省略すると、daemon 全体のデフォルトを継承する。列挙外の値は `400 { code: 'invalid_session_scope' }` を返す。古い daemon（#4175 PR 5 より前）はこのフィールドをサイレントに無視する。送信前に pre-flight で `caps.features.session_scope_override` を確認すること。daemon 全体のデフォルトは現在の本番環境では `'single'` にハードコードされている。#4175 では、フォローアップで `--sessionScope` CLI フラグが追加される可能性がある。         |
レスポンス:

```json
{
  "sessionId": "<uuid>",
  "workspaceCwd": "/canonical/path",
  "attached": false
}
```

`attached: true` は、そのワークスペースのセッションがすでに存在し、現在それを共有していることを意味します。

独立した会話を必要とするマルチクライアント統合では、各 `POST /session` で `sessionScope: "thread"` を送信する必要があります。デフォルトの `single` スコープは、クライアントが意図的に1つの共同セッションを共有する場合にのみ使用してください。共有セッションは、1つのFIFOを通じてプロンプトを直列化します。これは `/daemon/status` 経由で `runtime.activity.pendingPrompts` および `runtime.activity.queuedPrompts` として確認できます。

同じワークスペースに対する並行する `POST /session` 呼び出しは1つのspawnに**統合（coalesced）** されます。両方の呼び出し元は同じ `sessionId` を取得し、ちょうど1つだけが `attached: false` を返します。基盤となるspawnが失敗した場合（初期化タイムアウト、エージェント出力の形式不正、OOMなど）、**統合されたすべての呼び出し元が同じエラーを受け取ります**。実行中のスロットはクリアされるため、後続の呼び出しで最初から再試行できます。

> ⚠️ **新規セッションにおける `modelServiceId` の拒否は、HTTPレスポンスではサイレントに処理されます。** 不正な `modelServiceId`（タイプミス、未設定のサービスなど）を指定しても、作成時に500エラーは返されません。セッションはエージェントのデフォルトモデルで動作し続けるため、呼び出し元は `sessionId` を取得でき、後でモデルの切り替えを再試行できます（`POST /session/:id/model` 経由）。目に見える失敗シグナルは、セッションのSSEストリーム上で発生する `model_switch_failed` イベントであり、spawnハンドシェイクと最初のサブスクライブの間に発行されます。**このイベントを観測する必要があるサブスクライバーは、最初の `GET /session/:id/events` で `Last-Event-ID: 0` を渡す必要があります。** これにより、リング内で利用可能な最も古いイベントからリプレイされます（サブスクライブが作成レスポンスの数ms後に行われた場合でも、spawn時の `model_switch_failed` をカバーできます）。

### `POST /session/:id/load`

永続化されたACPセッションをIDで復元し、その履歴をSSE経由でリプレイします。パスのIDが優先されます。ボディ内の `sessionId` フィールドは無視されます。事前チェックとして `caps.features.session_load` が必要です。古いデーモンではこのルートに対して `404` を返します。

リクエスト:

```json
{
  "cwd": "/absolute/path/to/workspace"
}
```

| フィールド | 必須 | 備考                                                                                                                                                                                                                                |
| ----- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `cwd` | no       | `POST /session` と同じ正規化および `workspace_mismatch` ルールが適用されます。省略すると `/capabilities.workspaceCwd` が継承されます。`mcpServers` は意図的にここでは受け付けられません。デーモン全体のMCPは設定駆動です（`POST /session` と同じです）。 |

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

`state` はACPの `LoadSessionResponse` を反映します。`models` は `SessionModelState`、`modes` は `SessionModeState`、`configOptions` は `SessionConfigOption` の配列です。欠落しているフィールドはエージェントによって決定されます。後からアタッチするクライアント（以下の `attached: true` のパス）は、元々のload呼び出し元が確認したものと**同じ** `state` スナップショットを取得します。デーモンはエントリ時にこれをキャッシュするため、実行時の変更（例: `model_switched`）は後続のアタッチレスポンスではなく、SSEストリーム上で配信されます。

`attached: true` は、セッションがすでに稼働中だったことを意味します（以前の `session/load` / `session/resume` によるものか、統合された並行呼び出し元がわずかに先に実行されたためです）。

**SSE経由の履歴リプレイ。** エージェント側で `loadSession` が実行中の間、エージェントは永続化された各ターンに対して `session_update` 通知を発行します。デーモンはルートレスポンスが返る前にこれらをセッションのイベントバスにバッファリングするため、直ちに `Last-Event-ID: 0` を指定して `GET /session/:id/events` を呼び出すサブスクライバーは完全なリプレイを確認できます。**リプレイリングには上限があります**（デフォルトではセッションあたり8000フレーム）。多くのツール呼び出しや思考ストリームのターンを含む長い履歴はこれを超える可能性があり、最も古いフレームはサイレントに破棄されます。完全な履歴を必要とするクライアントは、`load` が返った直後にサブスクライブする必要があります。あるいは、SSEイベントIDを永続化し、`Last-Event-ID` を使用して後続のターンの境界から再開することもできます。

**エラー:**

- `404` — 永続化されたセッションIDが存在しません（`SessionNotFoundError`）。
- `400` — `workspace_mismatch`（`POST /session` と同じ形状）。
- `503` — `session_limit_exceeded`（`--max-sessions` の制限にカウントされます。実行中の復元も考慮されます）。
- `409` — `restore_in_progress`（同じIDに対する `session/resume` がすでに実行中です）。`Retry-After: 5`。同じアクションの競合（同じIDに対する2つの並行する `session/load`）は統合されます。ちょうど1つが `attached: false` を返し、残りは同じ `state` で `attached: true` を返します。
- `409` — `session_archived`。IDが `chats/archive/` にのみ存在する場合。`load` または `resume` の前に `POST /sessions/unarchive` を呼び出してください。
- `409` — `session_archiving`。同じIDに対してアーカイブまたはアーカイブ解除が実行中の場合。`Retry-After: 5`。
- `409` — `session_conflict`。IDが `chats/` と `chats/archive/` の両方に存在する場合。ロードする前に `POST /sessions/delete` でセッションを削除してください。

### `POST /session/:id/resume`

永続化されたACPセッションをIDで復元しますが、SSE経由で履歴をリプレイ**しません**。モデルコンテキストはエージェント側で内部的に復元されます（`config.getResumedSessionData` を読み込む `geminiClient.initialize` 経由）。SSEストリームは、すでに履歴がレンダリングされているクライアントのためにクリーンな状態に保たれます。事前チェックとして `caps.features.session_resume` が必要です。`unstable_session_resume` は、古いクライアントのための非推奨の互換エイリアスとして残っています。

リクエストの形状は `/load` と同じです。レスポンスの形状も同じで、`state` はACPの `ResumeSessionResponse` を反映します。エラーエンベロープも同じであり、`409 restore_in_progress`（`session/load` が実行中の場合に発生します。別の `session/resume` に競合する `session/resume` は統合されます）も含まれます。

クライアントに履歴がレンダリングされていない場合（コールド再接続、ピッカー → 開く）は `/load` を使用してください。クライアントがすでにターンを画面に表示しており、デーモン側のハンドルを取り戻すだけの場合は `/resume` を使用してください。

> ⚠️ **なぜ `unstable_session_resume` がまだ公開されているのでしょうか？** デーモンのHTTPルートと `session_resume` ケーパビリティはv1で安定化していますが、ブリッジはまだACPの `connection.unstable_resumeSession` を呼び出しています。古いタグは、`session_resume` より前にリリースされたSDKが引き続き動作するようにするためだけに残されています。

### `GET /workspace/:id/sessions`

正規化されたワークスペースが `:id`（URLエンコードされた絶対cwd）に一致する永続化されたセッションを一覧表示します。デフォルトの一覧は `chats/` からのアクティブセッションです。`archiveState=archived` を渡すと、`chats/archive/` からのアーカイブされたセッションを一覧表示できます。`archiveState=all` はv1ではサポートされていません。デフォルトのレスポンスと数値の `cursor` セマンティクスは `session_organization` によって変更されません。

```bash
curl http://127.0.0.1:4170/workspace/$(jq -rn --arg c "$PWD" '$c|@uri')/sessions
curl http://127.0.0.1:4170/workspace/$(jq -rn --arg c "$PWD" '$c|@uri')/sessions?archiveState=archived
```

クエリパラメータ:

| フィールド          | 必須 | 備考                                                                                                                                                                                           |
| -------------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `archiveState` | no       | `active`（デフォルト）または `archived`。他の値を指定すると `400 { code: "invalid_archive_state" }` が返されます。                                                                                              |
| `cursor`       | no       | 前のレスポンスからのページネーションカーソル。                                                                                                                                                   |
| `size`         | no       | ページサイズ。無効な値を指定すると `400 { code: "invalid_cursor" }` または既存のページサイズバリデーションが返されます。                                                                                         |
| `view`         | no       | 従来の最近の一覧の場合は省略します。`organized` を指定すると、サーバー側のピン留め/グループ順序が有効になり、オプションの組織化フィールドが追加されます。他の値を指定すると `400 { code: "invalid_session_view" }` が返されます。 |
| `group`        | no       | `view=organized` の場合のみ有効です。`all`（デフォルト）、`pinned`、`ungrouped`、またはカスタムグループID。不明なグループIDを指定すると `404 { code: "group_not_found" }` が返されます。                                |

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
      "hasActivePrompt": false,
      "isArchived": false
    }
  ],
  "nextCursor": 1772251200000
}
```

`view=organized` を指定すると、デーモンは `<Storage.getProjectDir(cwd)>/session-organization.v1.json` を読み取り、ピン留めされたセッションを最初に返し、次にアクティビティ時刻の降順、最後に安定したタイブレーカーとして `sessionId` でソートして返します。組織化されたカーソルは不透明なbase64url JSONであり、従来の最近の一覧で再利用してはなりません。`pinned` はグループではなく仮想フィルターです。`groupId: null` は未グループ化を意味します。アーカイブされたセッションは組織化メタデータを保持しますが、`archiveState=archived&view=organized` はアーカイブされたセッションのみを返します。

`view=organized` の場合、各セッションに追加のフィールドが表示されることがあります。

```json
{
  "isPinned": true,
  "pinnedAt": "2026-07-04T12:00:00.000Z",
  "groupId": "018f..."
}
```

アクティブリストには、`clientCount` や `hasActivePrompt` などのライブデーモンオーバーレイフィールドが含まれます。アーカイブリストはストレージのみです。`isArchived` は `true` になり、ライブオーバーレイフィールドは存在しないか、falseのままです。セッションが存在しない場合は空の配列（404ではありません）が返されます。セッションピッカーUIは、ワークスペースがアイドル状態だからといってエラーになるべきではありません。

### `GET /workspace/:id/session-groups`

ワークスペースのユーザー定義セッショングループを一覧表示します。事前チェックとして `caps.features.includes('session_organization')` が必要です。

レスポンス:

```json
{
  "groups": [
    {
      "id": "018f...",
      "name": "Frontend",
      "color": "blue",
      "order": 0,
      "createdAt": "2026-07-04T12:00:00.000Z",
      "updatedAt": "2026-07-04T12:00:00.000Z"
    }
  ],
  "colorOptions": ["red", "orange", "yellow", "green", "blue", "purple"]
}
```

色はプロトコルトークンのみです。クライアントが表示名をローカライズします。デフォルトの色名を持つグループは作成されません。

### `POST /workspace/:id/session-groups`

カスタムセッショングループを作成します。厳格な変更ゲート。事前チェックとして `caps.features.includes('session_organization')` が必要です。

リクエスト:

```json
{ "name": "Frontend", "color": "blue" }
```

`name` はトリミングされ、1〜64文字である必要があり、制御文字を含めることはできません。また、大文字と小文字を区別しないトリミング後の比較により、ワークスペース内で一意である必要があります。重複する名前を指定すると `409 { code: "group_name_conflict" }` が返されます。`color` は返される `colorOptions` のいずれかである必要があります。

レスポンス:

```json
{
  "group": {
    "id": "018f...",
    "name": "Frontend",
    "color": "blue",
    "order": 0,
    "createdAt": "...",
    "updatedAt": "..."
  }
}
```

### `PATCH /workspace/:id/session-groups/:groupId`

カスタムセッショングループを更新します。厳格な変更ゲート。事前チェックとして `caps.features.includes('session_organization')` が必要です。ボディフィールドはオプションです: `{ "name"?: string, "color"?: string, "order"?: number }`。不明なグループIDを指定すると `404 { code: "group_not_found" }` が返されます。重複または無効な名前と色には、作成時と同じエラーが使用されます。

### `DELETE /workspace/:id/session-groups/:groupId`

カスタムセッショングループを削除します。厳格な変更ゲート。事前チェックとして `caps.features.includes('session_organization')` が必要です。そのグループを参照しているセッションは `groupId: null` にクリアされます。ピン留め状態は保持されます。グループが削除された場合は `{ "deleted": true }` が、IDが存在しなかった場合は `{ "deleted": false }` がレスポンスとして返されます。
### `POST /sessions/delete`

永続化されたセッション JSONL ファイルを 1 つ以上ハードデリートします。デーモンはまずベストエフォートでライブセッションをクローズし、その後アクティブまたはアーカイブされた JSONL を削除します。同じ ID に対してアクティブとアーカイブの両方のコピーが存在する場合、両方が削除されます。両側のワークツリーサイドカーはクリーンアップされますが、ファイル履歴、サブエージェントのトランスクリプト、およびランタイムサイドカーは意図的に保持されます。

Request:

```json
{ "sessionIds": ["<uuid>"] }
```

Response:

```json
{
  "removed": ["<uuid>"],
  "notFound": [],
  "errors": []
}
```

### `POST /sessions/archive`

1 つ以上のセッションをアーカイブします。アーカイブは削除ではなく状態遷移です。JSONL は `chats/<id>.jsonl` から `chats/archive/<id>.jsonl` に移動します。ファイル履歴、サブエージェントのトランスクリプト、およびランタイムサイドカーはそのまま残ります。セッションがライブの場合、デーモンはまず厳密なクローズを実行し、ACP エージェントのクローズハンドラにチャット記録のフラッシュを要求します。クローズまたはフラッシュが失敗した場合、JSONL は移動されません。Pre-flight `caps.features.session_archive`。

Request:

```json
{ "sessionIds": ["<uuid>"] }
```

`sessionIds` は、最大 100 個の ID を含む空でない文字列配列である必要があります。重複は排除されます。

Response:

```json
{
  "archived": ["<uuid>"],
  "alreadyArchived": [],
  "notFound": [],
  "errors": []
}
```

`errors` のエントリは `{ "sessionId": "<uuid>", "error": "message" }` の形式です。同じ ID を持つアクティブファイルとアーカイブファイルは競合として扱われ、`errors` で報告されます。ファイルが上書きされることはありません。

### `POST /sessions/unarchive`

アーカイブされたセッションをアクティブディレクトリに復元します。これだけではセッションは再開されず、`chats/archive/<id>.jsonl` を `chats/<id>.jsonl` に戻すだけです。アンアーカイブが成功した後、クライアントは `POST /session/:id/load` または `POST /session/:id/resume` を呼び出すことができます。

Request:

```json
{ "sessionIds": ["<uuid>"] }
```

Response:

```json
{
  "unarchived": ["<uuid>"],
  "alreadyActive": [],
  "notFound": [],
  "errors": []
}
```

その ID に対してアクティブな JSONL がすでに存在する場合、アンアーカイブは `errors` で競合を報告し、上書きしません。同じ ID に対してアーカイブまたはアンアーカイブが実行中の場合、バッチを開始する前に `409 session_archiving` が返されます。

ACP-over-HTTP は、ベンダーメソッド `_qwen/sessions/archive` および `_qwen/sessions/unarchive` を介して同じリクエストおよびレスポンスボディを使用します。REST ルートテーブルは、ACP トランスポート向けに `POST /sessions/archive` および `POST /sessions/unarchive` をそれらのメソッドにマッピングします。

### `POST /session/:id/prompt`

プロンプトをエージェントに転送します。マルチプロンプトの呼び出し元は、セッションごとに FIFO キューイングされます（ACP はセッションごとに 1 つのアクティブなプロンプトを保証します）。

Request:

```json
{
  "prompt": [{ "type": "text", "text": "What does src/main.ts do?" }]
}
```

バリデーション: `prompt` は空でないオブジェクトの配列である必要があります。その他の失敗は、ブリッジに到達する前に `400` を返します。

Response:

```json
{ "stopReason": "end_turn" }
```

その他の停止理由: `cancelled`、`max_tokens`、`error`、`length`（ACP 仕様に基づく）。

プロンプトの途中で HTTP クライアントが切断された場合、デーモンはエージェントに ACP `cancel` 通知を送信し、エージェントは `stopReason: "cancelled"` でプロンプトを終了します。

> **ステージ 1 の制限 — サーバー側プロンプトタイムアウトなし。** ブリッジは、エージェントの `prompt()` と `transportClosedReject`（エージェントの子プロセスのクラッシュ）、および呼び出し元の HTTP 切断 AbortSignal のみを競合させます。応答がなくなったが生きているエージェント（例: ハングするモデル呼び出し）は、HTTP クライアントがタイムアウトして切断するまで、セッションごとの FIFO をブロックします。長時間実行されるプロンプトは正当なユースケース（深いリサーチ、大規模コードベースの分析）であるため、デフォルトのデッドラインは意図的に設定されていません。ステージ 2 では、設定可能な `promptTimeoutMs` のオプトインが公開される予定です。それまでは、呼び出し元で独自のクライアント側タイムアウトを設定し、期限切れ時に切断する（または `POST /session/:id/cancel` を呼び出す）必要があります。

### `POST /session/:id/cancel`

セッション上の**現在アクティブな**プロンプトをキャンセルします。ACP 側では、これはリクエストではなく通知です。エージェントは、アクティブな `prompt()` を `cancelled` で解決することで応答します。

```bash
curl -X POST http://127.0.0.1:4170/session/$SID/cancel
# → 204 No Content
```

> **マルチプロンプトの契約:** キャンセルはアクティブなプロンプトにのみ影響します。同じクライアントが以前に POST し、アクティブなプロンプトの後ろでキューイングされているプロンプトは引き続き実行されます。マルチプロンプトのキューイングはデーモンによって導入された動作（ACP 仕様にはない）であり、キューイングされたプロンプトの契約は「それぞれをキャンセルするか、チャネル終了でセッションを強制終了しない限り、実行され続ける」というものです。

マルチクライアント環境でキューイングされたプロンプトが予期しない動作である場合、まず呼び出し元がデフォルトの `sessionScope: "single"` セッションを共有しているかどうかを確認してください。スレッドごとに独立した会話を行うには、`sessionScope: "thread"` でセッションを作成し、プロンプトがそのスレッド内でのみ直列化されるようにします。

### `DELETE /session/:id`

ライブセッションを明示的にクローズします。他のクライアントがアタッチされている場合でも強制クローズします。アクティブなプロンプトをキャンセルし、保留中のパーミッションをキャンセルとして解決し、`session_closed` イベントを公開し、EventBus をクローズし、デーモンマップからセッションを削除します。ディスクに永続化されたセッションは削除されません。`POST /session/:id/load` を介して再読み込みできます。Pre-flight `caps.features.session_close`。

```bash
curl -X DELETE http://127.0.0.1:4170/session/$SID
# → 204 No Content
```

冪等性: 不明なセッションの場合は `404` を返します（他のルートと同じ `SessionNotFoundError` の形状）。

> **`session_closed` イベント。** SSE 購読者は、ストリームが終了する前に、`{ sessionId, reason: 'client_close', closedBy?: '<clientId>' }` を含む終端の `session_closed` イベントを受信します。SDK リデューサーはこれを `session_died` と同じように扱います（`alive: false` を設定し、`pendingPermissions` をクリアします）。

### `PATCH /session/:id/metadata`

変更可能なセッションメタデータを更新します。現在は `displayName` のみをサポートしています。Pre-flight `caps.features.session_metadata`。グループ化とピン留めは意図的にこのルートの一部ではありません。`session_organization` の下にある `PATCH /session/:id/organization` を使用してください。

Request:

```json
{ "displayName": "My Investigation Session" }
```

| フィールド | 必須 | 備考 |
| --- | --- | --- |
| `displayName` | いいえ | 文字列、最大 256 文字。空の文字列は名前をクリアします。そのままにする場合は省略します。 |

Response:

```json
{ "sessionId": "<uuid>", "displayName": "My Investigation Session" }
```

セッションの SSE ストリームで `{ sessionId, displayName }` を含む `session_metadata_updated` イベントを公開します。

### `PATCH /session/:id/organization`

ローカルセッションの組織化状態を更新します。厳密なミューテーションゲート。Pre-flight `caps.features.includes('session_organization')`。

Request:

```json
{ "isPinned": true, "groupId": "018f..." }
```

| フィールド | 必須 | 備考 |
| --- | --- | --- |
| `isPinned` | いいえ | ブール値。`true` は、まだピン留めされていない場合に `pinnedAt` を設定します。`false` は `pinnedAt` をクリアします。 |
| `groupId` | いいえ | カスタムグループ ID、またはグループ化されていない場合は `null`。不明なグループ ID は `404 { code: "group_not_found" }` を返します。 |

Response:

```json
{
  "sessionId": "<uuid>",
  "groupId": "018f...",
  "isPinned": true,
  "pinnedAt": "2026-07-04T12:00:00.000Z",
  "updatedAt": "2026-07-04T12:00:00.000Z"
}
```

この状態は、デーモンのランタイムストレージディレクトリ下のプロジェクトレベルのセッション組織化サイドカーに保存されます。これはトランスクリプトコンテンツではなく、トランスクリプトの `mtime` を更新せず、トランスクリプトと一緒にエクスポートされず、アーカイブ/アンアーカイブをまたいで保持されます。

### `POST /session/:id/heartbeat`

このセッションに対するデーモンの最終確認（last-seen）の記録を更新します。長寿命のアダプタ（TUI/IDE/web）は、将来の取り消しポリシー（Wave 5 PR 24）が死んだクライアントと静かなクライアントを区別できるように、定期的にこれを ping します。

Headers:

| ヘッダー | 必須 | 備考 |
| --- | --- | --- |
| `X-Qwen-Client-Id` | いいえ | `POST /session` からデーモンが発行した ID をエコーバックします。識別されたクライアントはクライアントごとのタイムスタンプも更新しますが、匿名のハートビートはセッションごとのウォーターマークのみを更新します。他の場所と同じ `[A-Za-z0-9._:-]{1,128}` の形状を満たす必要があります。 |

リクエストボディは空です（`{}` で問題ありません。現在読み取られるフィールドはありません）。

Response:

```json
{
  "sessionId": "<sid>",
  "clientId": "<cid>",
  "lastSeenAt": 1700000000123
}
```

`clientId` は、信頼された `X-Qwen-Client-Id` が提供された場合にのみエコーバックされます。`lastSeenAt` は、ブリッジが保存したデーモン側の `Date.now()` エポック（ミリ秒）です。

エラー:

- `400` — ヘッダーが不正な形式（ヘッダー形状ルール）の場合、またはこのセッションに登録されていない `clientId` を含んでいる場合（ブリッジはタイムスタンプを更新する前に `InvalidClientIdError` をスローします）、`{ code: 'invalid_client_id' }` を返します。
- `404` — 不明なセッション。

ケイパビリティゲーティング: pre-flight `caps.features.client_heartbeat`。古いデーモンはこのパスに対して `404` を返します。

### `POST /session/:id/model`

セッションに現在バインドされているモデルサービス**内で**アクティブなモデルを切り替えます。セッションごとのモデル変更キューを通じて直列化されます。

（_サービス_ 自体（Alibaba ModelStudio と OpenRouter など）を切り替えるには、新しいセッションの `POST /session` で `modelServiceId` を渡します。ステージ 1 にはライブサービス切り替えルートはありません。）

Request:

```json
{ "modelId": "qwen-staging" }
```

Response:

```json
{ "modelId": "qwen-staging" }
```

成功すると、SSE ストリームに `model_switched` を公開します。失敗すると、`model_switch_failed` を公開します（呼び出し元だけでなく、パッシブな購読者も失敗を確認できるようにするため）。エージェントチャネルの終了と競合するため、応答がなくなった子プロセスが HTTP ハンドラをブロックすることはありません。

### `POST /session/:id/recap`

ケイパビリティタグ: `session_recap`。ブリッジ → ACP extMethod `qwen/control/session/recap`。

セッションの「どこまでやったか」を要約する一文を生成します。コアの `generateSessionRecap`（`packages/core/src/services/sessionRecap.ts`）をラップし、ツールを無効にして `maxOutputTokens: 300`、厳密な `<recap>...</recap>` 出力形式で、高速モデルに対してサイドクエリを実行します。サイドクエリはセッションの既存の GeminiClient チャット履歴を読み取り、それに追加することは**ありません**。

リクエストボディは無視されます（`{}` または空を送信）。非厳密なミューテーションゲート — ポスチャーは `/session/:id/prompt` を反映しています（呼び出しはトークンを消費しますが、状態は変更しません）。SSE イベントは公開されません。

Response (200):

```json
{
  "sessionId": "sess:42",
  "recap": "Debugging the auth retry race. Next: add deterministic timing to the integration test."
}
```

以下の場合、`recap` は `null` になります（エラーではなく通常の 200 です）。

- セッションの対話ターンがまだ 2 つ未満の場合、
- サイドクエリが抽出可能な `<recap>...</recap>` ペイロードを返さなかった場合、
- または基盤となるモデルエラーが発生した場合（コアヘルパーはベストエフォートであり、スローすることはありません）。

エラー:

- `400 {code: 'invalid_client_id'}` — `X-Qwen-Client-Id` ヘッダーが不正な形式。
- `404` — 不明なセッション。

キャンセル: **v1 ではなし**。このルートは HTTP クライアントの切断をリッスンせず、`AbortSignal` はブリッジに配管されず、ACP 子プロセスは呼び出し元が切断されたかどうかに関係なくサイドクエリを完了まで実行します。唯一の上限は、ブリッジの 60 秒のバックストップタイムアウト（`SESSION_RECAP_TIMEOUT_MS`）と、ACP チャネルの死に対する transport-closed の競合です。recap は短いため（シングルアテンプト、`maxOutputTokens: 300`、通常約 1〜5 秒）これは許容されます。帯域幅コストが正当化される場合は、将来のリリースでリクエスト ID ベースのキャンセル ext-method が完全なエンドツーエンドのキャンセルを配管できます。

### ミューテーション: 承認、ツール、初期化、MCP 再起動
Issue [#4175](https://github.com/QwenLM/qwen-code/issues/4175) Wave 4 PR 17 は、リモートクライアントがデーモンホストの CLI に触れることなく実行時の動作状態を変更できるようにする、4つのミューテーション制御ルートを追加します。これら4つのルートはすべて：

- PR 15 の**厳格な**ミューテーションゲートによって制御されています。Bearer トークンなしで構成されたデーモンは、これらを `401 {code: 'token_required'}` で拒否します。オプトインする前に `--token`（または `QWEN_SERVER_TOKEN`）を設定してください。
- `X-Qwen-Client-Id` ヘッダーを受け入れ、スタンプを押します（PR 7 の監査チェーン）。ヘッダーに信頼された ID が含まれている場合、デーモンは対応する SSE イベントで `originatorClientId` を発行するため、クロスクライアント UI は自身のミューテーションのエコーを抑制できます。
- アフォーダンスを公開する前に、タグごとの各ケーパビリティをプリフライトチェックします。古いデーモンはルートに対して `404` を返します。

4つのルートのうち3つ（`tools/:name/enable`、`init`、`mcp/:server/restart`）は**ワークスペーススコープ**のイベントを発行します。つまり、ミューテーションがトリガーされたときにどのセッションがアタッチされていたかに関係なく、アクティブなすべてのセッション SSE バスがイベントを受信します。`approval-mode` は、変更が1つのセッションの `Config` にローカルであるため、**セッションスコープ**のイベントを発行します。

#### `POST /session/:id/approval-mode`

ケーパビリティタグ: `session_approval_mode_control`。ブリッジ → ACP extMethod `qwen/control/session/approval_mode`。

ライブセッションの承認モードを変更します。新しいモードは ACP 子プロセスのセッションごとの `Config` に即座に反映されます。設定はデフォルトではディスクに書き込まれません。`persist: true` を渡すと、`tools.approvalMode` をワークスペース設定にも書き込みます。

リクエスト:

```json
{ "mode": "auto-edit", "persist": false }
```

`mode` は `'plan' | 'default' | 'auto-edit' | 'auto' | 'yolo'` のいずれかでなければなりません（コアの `ApprovalMode` 列挙型のミラー。SDK はランタイム検証用に `DAEMON_APPROVAL_MODES` をエクスポートします）。`persist` のデフォルトは `false` です。

レスポンス (200):

```json
{
  "sessionId": "sess:42",
  "mode": "auto-edit",
  "previous": "default",
  "persisted": false
}
```

エラー:

- `400 {code: 'invalid_approval_mode', allowed: [...]}` — 不明なモードリテラル。
- `400 {code: 'invalid_persist_flag'}` — `persist` がブール値ではない。
- `403 {code: 'trust_gate', errorKind: 'auth_env_error'}` — リクエストされたモードには信頼されたフォルダが必要です（信頼されていないワークスペースでの特権モードは、コアの `Config.setApprovalMode` によって拒否されます）。
- `404` — セッションが不明。

SSE イベント（セッションスコープ）: `{sessionId, previous, next, persisted, originatorClientId?}` を含む `approval_mode_changed`。

#### `POST /workspace/tools/:name/enable`

ケーパビリティタグ: `workspace_tool_toggle`。純粋なファイル IO — ACP のラウンドトリップなし。

ワークスペースの `tools.disabled` 設定リストでツール名を切り替えます。そこにリストされているツールは**一切登録されません**（ツールを登録したまま呼び出しを拒否する `permissions.deny` とは異なります）。組み込みツールと MCP で検出されたツールの両方が `ToolRegistry.registerTool` を経由し、そこで無効化セットが参照されます。

> ⚠️ **名前はレジストリが公開する識別子と完全に一致する必要があります。** エイリアスの解決は行われません。ルートはパスパラメータにある文字列をそのまま `tools.disabled` に保存し、次の ACP 子プロセスは登録時に `tool.name` と比較します。組み込みツールは正規のレジストリ名（snake_case の動詞形式）を使用します。`run_shell_command`、`read_file`、`write_file`、`list_directory`、`glob`、`grep_search`、`web_fetch` などです。CLI が表示するラベル（`Shell`、`Read`、`Write`）ではありません。MCP で検出されたツールは、修飾された `mcp__<server>__<name>` 形式を使用します（これは `tool_toggled` イベントがブロードキャストする形式でもあり、`GET /workspace/mcp` がリストする形式でもあります）。`Bash` を無効化しても、次のセッションで `run_shell_command` が登録されるのを防ぐことはできません。

ライブな ACP 子プロセスはすでに登録されたツールを保持します。切り替えは**次の** ACP 子プロセスの生成時に有効になります。現在のデーモンで変更を有効にするには、`POST /workspace/mcp/:server/restart`（MCP 由来のツールの場合）または新規セッションの作成と組み合わせてください。

不明なツール名も受け入れられます。まだインストールされていない MCP ツールを事前に無効化することは正当なユースケースです。

リクエスト:

```json
{ "enabled": false }
```

レスポンス (200):

```json
{ "toolName": "run_shell_command", "enabled": false }
```

エラー:

- `400 {code: 'invalid_tool_name'}` — パスパラメータが空、またはパスパラメータが 256 文字の上限を超えている。
- `400 {code: 'invalid_enabled_flag'}` — `enabled` が欠落している、またはブール値ではない。

SSE イベント（ワークスペーススコープ）: `{toolName, enabled, originatorClientId?}` を含む `tool_toggled`。

#### `POST /workspace/init`

ケーパビリティタグ: `workspace_init`。純粋なファイル IO — ACP のラウンドトリップなし、**LLM の呼び出しなし**。

デーモンがバインドされているワークスペースのルートに、空の `QWEN.md`（または `--memory-file-name` オーバーライドの下で `getCurrentGeminiMdFilename()` が返すもの）をスキャフォールディングします。これは機械的な処理のみです。AI によるコンテンツの記入を行うには、`POST /session/:id/prompt` を続けて実行してください。

デフォルトでは、ターゲットファイルが空白以外のコンテンツを含んで存在する場合、上書きを拒否します。空白のみのファイルは存在しないものとして扱われます（ローカルの `/init` スラッシュコマンドと同じ動作です）。

リクエスト:

```json
{ "force": false }
```

レスポンス (200):

```json
{ "path": "/work/bound/QWEN.md", "action": "created" }
```

`action` は新規作成の場合は `'created'`、既存の空白のみのファイルがそのまま残された（書き込みが実行されなかった）場合は `'noop'`、`force: true` によって空でないコンテンツが置き換えられた場合は `'overwrote'` になります。`workspace_initialized` SSE イベントはレスポンスのアクションをミラーリングします。オブザーバーは `action !== 'noop'` でフィルタリングし、実際のディスク上の変更に対してのみ反応できます。

エラー:

- `400 {code: 'invalid_force_flag'}` — `force` がブール値ではない。
- `409 {code: 'workspace_init_conflict', path, existingSize}` — ファイルが空白以外のコンテンツを含んで存在し、`force` が省略されているか false である。ボディには絶対パスとサイズ（バイト）が含まれるため、SDK クライアントは再 stat せずに「N バイトを上書きしますか？」というプロンプトを表示できます。

SSE イベント（ワークスペーススコープ）: `{path, action, originatorClientId?}` を含む `workspace_initialized`。

#### `POST /workspace/mcp/:server/restart`

ケーパビリティタグ: `workspace_mcp_restart`。ブリッジ → ACP extMethod `qwen/control/workspace/mcp/restart`。

ACP 子プロセスの `McpClientManager.discoverMcpToolsForServer` を介して、構成済みの MCP サーバーを再起動します（切断 + 再接続 + 再検出）。PR 14 v1 のアカウンティングからのライブ予算スナップショットを事前にチェックするため、予算が飽和したワークスペースでの再起動は、`BudgetExhaustedError` のカスケードをトリガーするのではなく、ソフトな拒否を返します。

リクエストボディは空（`{}`）です。パスパラメータは `mcpServers` 設定に表示される URL エンコードされたサーバー名です。

レスポンス (200) — `restarted` による識別共用体:

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

ソフトスキップの理由（すべて 200 を返します）:

| `reason`                | Meaning                                                                                                                                                                               |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `'in_flight'`           | 別の検出 / このサーバーの再起動がすでに進行中です。ルートは元の Promise を待機せずに即座に返ります。呼び出し元は短い遅延後に再試行する必要があります。 |
| `'disabled'`            | サーバーは構成されていますが、`excludedMcpServers` にリストされています。再起動する前に再度有効化してください。                                                                                                    |
| `'budget_would_exceed'` | デーモンが `--mcp-budget-mode=enforce` であり、対象サーバーが現在 `reservedSlots` になく、ライブ合計が `clientBudget` に達しています。呼び出し元はまずスロットを解放する必要があります。         |

エラー (2xx 以外):

- `400 {code: 'invalid_server_name'}` — パスパラメータが空。
- `404` — サーバー名が `mcpServers` 設定にない、またはライブな ACP チャネルが存在しない（再起動には本質的にライブな `McpClientManager` インスタンスが必要です）。
- `500` — 内部エラー（例: `ToolRegistry` が初期化されていない）。

SSE イベント（ワークスペーススコープ）: 成功時は `{serverName, durationMs, originatorClientId?}` を含む `mcp_server_restarted`。ソフトスキップ時は `{serverName, reason, originatorClientId?}` を含む `mcp_server_restart_refused`。

### `GET /session/:id/events` (SSE)

セッションのイベントストリームをサブスクライブします。

ヘッダー:

```
Accept: text/event-stream
Last-Event-ID: 42        ← オプション、ID 42 以降からリプレイ
```

クエリパラメータ:

| Param       | Required | Notes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ----------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `maxQueued` | no       | サブスクライバーごとの**ライブフレームバックログ**の上限。範囲は `[16, 2048]`、デフォルトは 256。サブスクライブ時に強制的にプッシュされるリプレイフレームは、フレームおよびバイトの上限から免除されます。実際にこれらを消費するのは、サブスクライバーが大量の `Last-Event-ID: 0` リプレイをまだドレインしている間に到着するライブイベントです。コールド再接続時に値を増やし、コンシューマーが追いつく前にライブテールが低速クライアント警告/強制退去をトリガーしないようにします。ライブなシリアライズ済みバイトの上限はデーモン側で固定されており（デフォルトは 2 MiB）、クエリパラメータはありません。範囲外 / 非10進 / 存在するが空の値は、SSE ハンドシェイクがオープンする前に `400 invalid_max_queued` を返します。プリフライト `caps.features.slow_client_warning` — 古いデーモンはこのパラメータをサイレントに無視します。 |

フレーム形式。`data:` 行は**完全なイベントエンベロープ**であり、1行に JSON 文字列化されています — `{id?, v, type, data, originatorClientId?}`。ACP 固有のペイロード（`sessionUpdate`、`requestPermission` 引数など）はエンベロープの `data` フィールドの下に配置されます。エンベロープ自身の `type` は SSE の `event:` 行と一致します。

```
id: 7
event: session_update
data: {"id":7,"v":1,"type":"session_update","data":{"sessionUpdate":"agent_message_chunk","content":{"type":"text","text":"…"}}}

id: 8
event: permission_request
data: {"id":8,"v":1,"type":"permission_request","data":{"requestId":"<uuid>","sessionId":"<sid>","toolCall":{...},"options":[...]}}

: heartbeat              ← 15秒ごと、ペイロードなし

event: client_evicted    ← 終端フレーム、ID なし（合成）
data: {"v":1,"type":"client_evicted","data":{"reason":"queue_overflow","droppedAfter":42,"queueSize":256,"maxQueued":256,"queuedBytes":1800000,"maxQueuedBytes":2097152}}

event: client_evicted    ← バイトオーバーフロー用の終端フレーム、ID なし（合成）
data: {"v":1,"type":"client_evicted","data":{"reason":"queue_bytes_overflow","droppedAfter":43,"queueSize":1,"maxQueued":256,"queuedBytes":1900000,"maxQueuedBytes":2097152,"eventBytes":300000}}
```

SSE レベルの `id:` / `event:` 行は、EventSource の互換性のために `envelope.id` / `envelope.type` を複製しています。Raw-`fetch` コンシューマー（SDK の `parseSseStream`）は JSON エンベロープからすべてを読み取り、SSE プリアンブル行を無視します。
| イベントタイプ                | トリガー                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `session_update`          | 任意の ACP `sessionUpdate` 通知（LLM チャンク、ツール呼び出し、使用量）                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `permission_request`      | エージェントがツールの承認を要求した                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `permission_resolved`     | 何らかのクライアントが `POST /permission/:requestId` 経由でパーミッションに投票した                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `permission_partial_vote` | （consensus のみ）投票が記録されたが、まだ定足数に達していない。`{requestId, sessionId, votesReceived, votesNeeded, quorum, optionTallies}` を含む。Pre-flight `caps.features.permission_mediation`。                                                                                                                                                                                                                                                                                |
| `permission_forbidden`    | 投票がアクティブなポリシーによって拒否された（`designated` の不一致、`local-only` の非ループバック、または `consensus` の投票者がスナップショットに存在しない）。`{requestId, sessionId, clientId?, reason}` を含む。Pre-flight `caps.features.permission_mediation`。                                                                                                                                                                                                                                              |
| `model_switched`          | `POST /session/:id/model` が成功した                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `model_switch_failed`     | `POST /session/:id/model` が拒否された                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `session_died`            | エージェントの子プロセスが予期せずクラッシュした。**ターミナル: このフレームの後に SSE ストリームが閉じられ、セッションは `byId` から削除される。** サブスクライバーは `POST /session` 経由で再接続し、新しいセッションを生成する必要がある。                                                                                                                                                                                                                                                                                           |
| `slow_client_warning`     | サブスクライバーローカル: ライブフレームのバックログまたはライブシリアライズバイトのバックログが 75% 以上埋まっている。**非ターミナル** — ストリームは継続され、この警告は強制切断前の事前通知である。`{queueSize, maxQueued, lastEventId, queuedBytes?, maxQueuedBytes?, threshold?}` を含む。ここで `threshold` は `frames`、`bytes`、または `frames_and_bytes` である。オーバーフローエピソードごとに 1 回発生し、両方の測定値が 37.5% 未満に減少した後に再設定される。`id` なし（合成）。Pre-flight `caps.features.slow_client_warning`。 |
| `client_evicted`          | サブスクライバーローカル: キューオーバーフロー。`reason` はライブフレーム上限の場合は `queue_overflow`、ライブシリアライズバイト上限の場合は `queue_bytes_overflow` である。**ターミナル: このフレームの後に SSE ストリームが閉じられる**（`id` なし — 合成）。同じセッションの他のサブスクライバーは継続される。                                                                                                                                                                                                            |
| `stream_error`            | ファンアウト中のデーモン側エラー。**ターミナル: このフレームの後に SSE ストリームが閉じられる**（`id` なし — 合成）。                                                                                                                                                                                                                                                                                                                                                                             |

再接続のセマンティクス:

- `Last-Event-ID: <n>` を送信して、セッションごとのリングから `id > n` のイベントをリプレイする（デフォルトの深さは **8000**、`qwen serve --event-ring-size <n>` で調整可能）
- **ギャップ検出（クライアント側）:** `<n>` がリング内にまだ存在する最古のイベントより前の場合（例: `Last-Event-ID: 50` で再接続したが、リングには現在 200〜1199 しか保持されていない）、デーモンはエラーを発生させずに利用可能な最古のイベントからリプレイする。最初のリプレイされたイベントの `id` を `n + 1` と比較する。差分が失われたウィンドウのサイズである。Stage 2 ではデーモン側で明示的な `stream_gap` 合成フレームが注入される。Stage 1 では検出はクライアントの責任となる。
- ID はセッションごとに単調増加であり、1 から始まる
- 合成フレーム（`client_evicted`、`slow_client_warning`、`stream_error`）は、他のサブスクライバーのシーケンススロットを消費しないように意図的に `id` を省略している

バックプレッシャ:

- サブスクライバーごとのキューのデフォルトは `maxQueued: 256` のライブアイテムと、デーモンが所有する 2 MiB のライブシリアライズバイト上限である。再接続中のリプレイフレーム、`slow_client_warning`、および `client_evicted` は両方の上限をバイパスする。
- SSE リクエストの `?maxQueued=N`（範囲 `[16, 2048]`）を使用して、フレーム上限のみをオーバーライドする。デーモンのメモリ予算をクライアントが引き上げられないように、`?maxQueuedBytes` は意図的に用意されていない。
- サブスクライバーのライブフレームバックログまたはライブバイトバックログが 75% を超えると、バスはそのサブスクライバーに `slow_client_warning` 合成フレームを強制的にプッシュする（オーバーフローエピソードごとに 1 回。両方の測定値が 37.5% 未満に減少した後に再設定される）。ストリームはオープンなままとなる。この警告は事前通知であり、クライアントがより速くドライン（消費）するか、クリーンにデタッチして再接続できるようにするためのものである。
- ライブフレーム上限がオーバーフローした場合、バスは `reason: "queue_overflow"` で `client_evicted` を発行する。ライブバイト上限がオーバーフローした場合は `reason: "queue_bytes_overflow"` を発行する。どちらの場合も、ターミナルフレームが強制的にプッシュされ、サブスクリプションは閉じられる。

### `POST /permission/:requestId`

保留中の `permission_request` に投票する。アクティブな**調停ポリシー**が勝者を決定する:

| ポリシー                      | 動作                                                                                                                                                                                              |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `first-responder`（デフォルト） | 検証された最初の投票者が勝利し、後続の投票者は `404` を受け取る。F3 以前のベースライン。                                                                                                                                    |
| `designated`                | プロンプトの発信者（`originatorClientId`）のみが決定し、非発信者は `403 permission_forbidden / designated_mismatch` を受け取る。匿名プロンプトの場合は `first-responder` にフォールバックする。                 |
| `consensus`                 | M 人中 N 人の投票者が合意する必要がある（デフォルト `N = floor(M/2) + 1`、`policy.consensusQuorum` でオーバーライド可能）。最初に `N` に達したオプションが勝利する。未解決の投票は `200` と `permission_partial_vote` SSE フレームを受け取る。 |
| `local-only`                | ループバック投票者のみが決定し、リモート呼び出し元は `403 permission_forbidden / remote_not_allowed` を受け取る。                                                                                                      |

アクティブなポリシーは `settings.json` の `policy.permissionStrategy` で設定され、`/capabilities` の `body.policy.permission` で公開される。ビルドでサポートされているセットに対しては、Pre-flight `caps.features.permission_mediation`（`modes: [...]` を含む）が使用される。

> **F3 (#4175): マルチクライアントのパーミッション調整。** F3 で上記の 4 つのポリシーが追加された。F3 以前のデーモンは `first-responder` がハードコードされていた。設定されたポリシーが `first-responder` の場合、ワイヤー形状はビット単位で全く変更されない。新しいイベント（`permission_partial_vote`、`permission_forbidden`）は追加型である。古い SDK はこれらを `unrecognized_known_event` として認識し、適切に無視する。

> **パーミッションのタイムアウト（デフォルト 5 分）。** `permission_request` は、以下のいずれかが発生するまで保留状態となる: (a) 何らかのクライアントがここで投票する、(b) `POST /session/:id/cancel` が発行される、(c) プロンプトを駆動している HTTP クライアントが切断される（プロンプト中のキャンセルは未解決のパーミッションを `cancelled` として解決する）、(d) セッションがキルされる、(e) デーモンがシャットダウンする、**または (f) セッションごとのパーミッションタイムアウトが発生する**（`DEFAULT_PERMISSION_TIMEOUT_MS`、5 分）。タイムアウトが発生すると、エージェントの `requestPermission` は `{outcome: 'cancelled'}` として解決され、監査リングに `permission.timeout` エントリが記録され、デーモンの stderr に 1 行のパンくずリストが出力され、SSE バスは標準の `permission_resolved` キャンセルフレームをファンアウトしてサブスクライバーがクリーンアップできるようにする。タイムアウトは `BridgeOptions.permissionResponseTimeoutMs` 経由で設定可能である。長時間のプロンプトを実行するヘッドレス呼び出し元は、この値を延長するとよいだろう。

リクエスト:

```json
{
  "outcome": {
    "outcome": "selected",
    "optionId": "proceed_once"
  }
}
```

結果（Outcomes）:

- `{ "outcome": "selected", "optionId": "<one-of-the-options>" }` — エージェントが提示した選択肢に応じて、accept / reject / proceed-once など
- `{ "outcome": "cancelled" }` — リクエストを破棄する（内部的に `cancelSession` / `shutdown` が行う動作と一致）

レスポンス:

- `200 {}` — 投票が受け入れられた（解決された、または consensus の定足数のもとで記録された）
- `403 { "code": "permission_forbidden", "reason": "designated_mismatch" | "remote_not_allowed", "requestId", "sessionId" }` — F3: アクティブなポリシーが投票を拒否した
- `404 { "error": "..." }` — requestId が不明（すでに解決済み、存在しなかった、またはセッションが破棄された）
- `500 { "code": "cancel_sentinel_collision", ... }` — F3: エージェントの `allowedOptionIds` に予約済みのセンチネル `'__cancelled__'` が含まれている。エージェント/デーモンの契約違反
- `501 { "code": "permission_policy_not_implemented", "policy": "<name>" }` — F3 の前方互換性: ポリシーリテラルがスキーマに追加されたが、その調停ブランチはまだビルドされていない（現在は到達不能。将来のポリシー用に予約されている）
投票が成功すると、接続されているすべてのクライアントは、同じ `requestId` と選択された `outcome` を持つ `permission_resolved` を確認します。`consensus` の下では、中間投票は定足数に達するまで追加で `permission_partial_vote` をファンアウトします。

### 認証デバイスフローのルート (issue #4175 PR 21)

デーモンは OAuth 2.0 Device Authorization Grant (RFC 8628) を仲介し、リモートの SDK クライアントがログインをトリガーできるようにします。この際、トークンはクライアントではなく**デーモン**のファイルシステムに保存されます。デーモン自身が IdP をポーリングし、クライアントの役割は検証 URL とユーザーコードを表示し、（オプションで）完了イベントのために SSE をサブスクライブすることだけです。

ケイパビリティタグ: `auth_device_flow`（常にアドバタイズされます）。v1 でサポートされるプロバイダー: `qwen-oauth`。

> [!note]
>
> Qwen OAuth の無料枠は 2026-04-15 に廃止されました。このプロトコルでは `qwen-oauth` をレガシーな v1 プロバイダー識別子として扱ってください。新しいクライアントは、現在サポートされている認証プロバイダーが利用可能な場合、そちらを優先すべきです。

**ランタイムのローカリティ。** デーモンはブラウザを起動しません（起動可能な場合でも）。クライアントがローカルで `open(verificationUri)` を呼び出すかどうかを決定します。ヘッドレス Pod（標準的な Mode B デプロイメント）では、ユーザーはブラウザを持っている任意のデバイスで URL を開きます。推奨される UX については `docs/users/qwen-serve.md` を参照してください。

**イベントにおけるトークンの漏洩防止。** `auth_device_flow_started` は `{deviceFlowId, providerId, expiresAt}` のみを含みます。ユーザーコードと検証 URL は、POST 201 のレスポンスボディおよび `GET /workspace/auth/device-flow/:id` 経由でポイントツーポイントで返されます。SSE でブロードキャストされることはありません。

**プロバイダーごとのシングルトン。** フローが保留中の間に同じプロバイダーに対して 2 回目の `POST` を行うと、冪等な引き継ぎとなります。新しい IdP リクエストを開始するのではなく、既存のエントリを `attached: true` として返します。

#### `POST /workspace/auth/device-flow`

厳格な変更ゲート: トークン不要のループバックデフォルトであっても、Bearer トークンが必要です（`401 token_required`）。

リクエスト:

```json
{ "providerId": "qwen-oauth" }
```

レスポンス（`201` は新規開始、`200` は冪等な引き継ぎ）:

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

エラー:

- `400 unsupported_provider` — 不明な `providerId`（レスポンスには `supportedProviders` が含まれます）
- `409 too_many_active_flows` — ワークスペースの上限（4）に達しました。`DELETE` で 1 つキャンセルしてください
- `401 token_required` — 厳格なゲートがトークンなしのリクエストを拒否しました
- `502 upstream_error` — IdP が予期しないエラーを返しました

#### `GET /workspace/auth/device-flow/:id`

現在の状態を読み取ります。保留中のエントリは `userCode/verificationUri/expiresAt/intervalMs` をそのまま返します。終了したエントリ（5 分の猶予期間後）はそれらを削除し、`status` とオプションの `errorKind/hint` を返します。

不明な ID および猶予期間経過後に削除されたエントリに対しては `404 device_flow_not_found` を返します。

#### `DELETE /workspace/auth/device-flow/:id`

冪等なキャンセル:

- 保留中のエントリ → `204` + `auth_device_flow_cancelled` を発行
- 終了したエントリ → `204` ノーオペレーション（イベントの再発行なし）
- 不明な ID → `404`

#### `GET /workspace/auth/status`

保留中のフローとサポートされているプロバイダーのスナップショット:

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

#### デバイスフローの SSE イベント

5 種類の型付きイベント（ワークスペーススコープ、アクティブなすべてのセッションバスにファンアウト）:

- `auth_device_flow_started` `{deviceFlowId, providerId, expiresAt}` — POST が成功しました。SDK はサブスクライブする必要があります（ここには userCode は含まれないため、必要に応じて GET で取得してください）
- `auth_device_flow_throttled` `{deviceFlowId, intervalMs}` — デーモンがアップストリームの `slow_down` を尊重しました。GET をポーリングしているクライアントは、間隔をこれに合わせて延長する必要があります
- `auth_device_flow_authorized` `{deviceFlowId, providerId, expiresAt?, accountAlias?}` — 認証情報が永続化されました。`accountAlias` は PII（個人識別情報）ではないラベルです（メールや電話番号は含まれません）
- `auth_device_flow_failed` `{deviceFlowId, errorKind, hint?}` — 終了状態。`errorKind` は `expired_token | access_denied | invalid_grant | upstream_error | persist_failed` のいずれかです。`persist_failed` はデーモン内部のエラーです。IdP との交換は成功しましたが、デーモンが認証情報を永続的に保存できませんでした（EACCES / EROFS / ENOSPC）。ユーザーは、基盤となるディスクの状態が修正された後に再試行する必要があります。
- `auth_device_flow_cancelled` `{deviceFlowId}` — 保留中のエントリに対して DELETE が成功しました

> **MCP 非互換。** MCP 認証仕様（2025-06-18）は、リダイレクトコールバックを伴う OAuth 2.1 + PKCE 認証コードを義務付けており、これはヘッドレス Pod デーモンでは機能しません。Mode B のデバイスフローのインターフェースはデーモンプライベートです。MCP 準拠のサーバーをターゲットとするクライアントは、別の認証パスを使用する必要があります。

## ストリーミングのワイヤーフォーマット

イベントは標準の EventSource フレームとして発行されます。デーモンはフレームごとに 1 行の `data:` を書き込みます（`JSON.stringify` 後の JSON に埋め込み改行はありません）。`packages/sdk-typescript/src/daemon/sse.ts` にある SDK パーサーは、受信側でこれと、仕様で許可されている複数の `data:` 形式の両方を処理します。

## ストリーミング中のエラーフレーム

SSE サブスクライバーにサービスを提供している間にブリッジイテレーターがスローされた場合、デーモンは終端の `stream_error` フレーム（`id` なし）を発行します。`data:` 行は完全なエンベロープです（このドキュメントの他のすべての SSE フレームと同じ形状）。実際のエラーメッセージは `envelope.data.error` に格納されています:

```
event: stream_error
data: {"v":1,"type":"stream_error","data":{"error":"<message>"}}
```

その後、接続は閉じられます。

## 環境変数

| 変数 | 目的 |
| --- | --- |
| `QWEN_SERVER_TOKEN` | Bearer トークン。起動時に先頭と末尾の空白が削除されます。 |

## ソースレイアウト

| パス | 目的 |
| --- | --- |
| `packages/cli/src/commands/serve.ts` | yargs コマンドとフラグスキーマ |
| `packages/cli/src/serve/run-qwen-serve.ts` | リスナーのライフサイクルとシグナル処理 |
| `packages/cli/src/serve/server.ts` | Express アプリケーションのアセンブリ、ミドルウェアの順序、および残りの直接ルート |
| `packages/cli/src/serve/routes/*.ts` | セッション、SSE、ワークスペース認証、ワークスペースステータス、ファイルルートなど、焦点を絞った Express ルートグループ |
| `packages/cli/src/serve/auth.ts` | Bearer 認証 + Host 許可リスト + CORS 拒否 |
| `packages/cli/src/serve/acp-session-bridge.ts` | spawn-or-attach、セッションごとの FIFO、およびパーミッションレジストリのための CLI ローカルなブリッジ互換性ファサード |
| `packages/acp-bridge/src/status.ts` | 読み取り専用のデーモンステータスのワイヤー型 + `ServeErrorKind` + `BridgeTimeoutError` + `mapDomainErrorToErrorKind` |
| `packages/cli/src/serve/env-snapshot.ts` | 認証情報のリダクションを含め、`process.*` の状態から `/workspace/env` ペイロードを構築する純粋なヘルパー |
| `packages/acp-bridge/src/eventBus.ts` | 制限付き非同期キュー + リプレイリング |
| `packages/sdk-typescript/src/daemon/DaemonClient.ts` | TypeScript クライアント |
| `packages/sdk-typescript/src/daemon/sse.ts` | EventSource フレームパーサー |
| `integration-tests/cli/qwen-serve-routes.test.ts` | 18 ケース、LLM なし |
| `integration-tests/cli/qwen-serve-streaming.test.ts` | 3 ケース、ローカルのフェイク OpenAI サーバーによってバックエンドされる実際の `qwen --acp` 子プロセス（POSIX のみ。Windows ではスキップ） |