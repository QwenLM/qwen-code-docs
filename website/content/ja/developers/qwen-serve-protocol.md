# `qwen serve` HTTP プロトコルリファレンス

[qwen-code daemon design](https://github.com/QwenLM/qwen-code/issues/3803) の Stage 1。すべてのルートはデーモンのベース URL（デフォルトは `http://127.0.0.1:4170`）配下に存在します。

## 認証

デーモンが `--token` または `QWEN_SERVER_TOKEN` を指定して起動された場合、ループバックバインドの `/health` を除く**すべてのルート**で以下のヘッダーが必要です。

```
Authorization: Bearer <token>
```

トークンが設定されていない場合（ループバック開発時のデフォルト）、このヘッダーは任意です。トークンの比較は定数時間で行われます。401 レスポンスは、`ヘッダーなし` / `スキーム不正` / `トークン不正` のいずれの場合でも同一の形式になります。

**`/health` の例外** (Bctum): ループバックバインド（`127.0.0.1` / `localhost` / `::1` / `[::1]`）では、`/health` は Bearer ミドルウェア**より前**に登録されるため、デーモンが `--token` 付きで起動されていても、Pod 内の liveness プローブはトークンを送信する必要がありません。非ループバックバインド（`--hostname 0.0.0.0` など）では、他のすべてのルートと同様に `/health` も Bearer 認証で保護されます。理由については [`GET /health`](#get-health) セクションを参照してください。

**`--require-auth` (#4175 PR 15)。** 起動時にこのフラグを渡すと、「トークン必須」ルールがループバックにも適用されます。トークンなしでは起動に失敗し、`/health` の例外も解除されます（つまり、`/health` にも `Authorization: Bearer …` が必要になります）。

このフラグが有効な場合、グローバルな `bearerAuth` ミドルウェアが `/capabilities` を含む**すべて**のルートを保護します。したがって、**未認証**のクライアントは `caps.features` を事前確認して認証が必要であることを発見できません。この場合の発見手段は、（[認証](#authentication) セクションに従いすべてのルートで統一された）**401 レスポンスボディ**自体となります。`require_auth` ケーパビリティタグは**認証後の確認**です。クライアントが正常に認証され `/capabilities` を読み取ると、このタグの存在によってデーモンが `--require-auth` 付きで起動されたことを確認できます（監査/コンプライアンス UI や、SDK クライアントが設定パネルで「このデプロイメントは強化されています」と表示するのに役立ちます）。ルートごとの厳格モードにオプトインするミューテーションルート（Wave 4 のフォローアップ）は、トークンなしのループバックデフォルトに到達すると `401 { code: "token_required", error: "…" }` で拒否します。しかし `--require-auth` が有効な場合、グローバルな Bearer ミドルウェアがルートごとのゲートの前にリクエストをショートサーキットするため、未認証の呼び出し元が実際に目にするのはレガシーな `Unauthorized` ボディです。

**`--allow-origin <pattern>` (T2.4 [#4514](https://github.com/QwenLM/qwen-code/issues/4514))。** デーモンにクロスオリジンでアクセスするブラウザの Web UI はデフォルトでブロックされます。`Origin` ヘッダーを含むリクエストは、CLI/SDK クライアントが `Origin` を送信せず、デーモンがその存在をオペレーターがオプトインしていないブラウザコンテキストからのリクエストとみなすため、`403 {"error":"Request denied by CORS policy"}` を返します。起動時に `--allow-origin <pattern>`（繰り返し指定可能）を渡すと、ブロックの代わりに許可リストがインストールされます。各パターンは以下のいずれかです。

- リテラル `*` — すべてのオリジンを許可します。**リスクあり**: `*` が設定されているが Bearer トークンが設定されていない場合（`--token`、`QWEN_SERVER_TOKEN`、または起動時にトークンを必須とする `--require-auth` のいずれも）、起動は拒否されます。`*` がリストに含まれている場合、起動時のパンくずログで stderr に警告が出力されます。**推奨**: ループバックバインドでは `--require-auth` と組み合わせて `/health` と `/demo` も Bearer で保護するようにしてください。これらはデフォルトでループバックの Bearer ミドルウェアより前に登録されるため（k8s/Compose プローブがトークンなしで `/health` に到達できるように）、`*` 許可リストはそれらを任意のクロスオリジンブラウザから到達可能にしてしまいます。非ループバックバインドでは Bearer は起動時にすでに必須であるため、`*` の公開対象は `/health`（ステータス JSON）と `/demo`（JS がトークン保護されたルートを呼び出す静的ページ）のみであり、実際の API 表面は保護されています。
- 正規化された URL オリジン — `<scheme>://<host>[:<port>]`。**末尾のスラッシュ、パス、userinfo、クエリは不可**。エントリが `new URL(pattern).origin === pattern` の往復チェックに失敗した場合、起動は `InvalidAllowOriginPatternError` で拒否されます。エラーメッセージには不正なパターンと正規化された形式が示されます。意図的な厳格さ: 暗黙の正規化（例: 末尾の `/` の削除）は、タイプミスを見逃し、曖昧な入力を許可してしまう可能性があります。

一致したオリジンには、すべてのリクエストに対して標準的な CORS レスポンスヘッダーが返されます。

```
Access-Control-Allow-Origin: <echoed origin>
Vary: Origin
Access-Control-Allow-Methods: GET, POST, PATCH, DELETE, OPTIONS
Access-Control-Allow-Headers: Authorization, Content-Type, X-Qwen-Client-Id, Last-Event-ID
Access-Control-Max-Age: 86400
Access-Control-Expose-Headers: Retry-After
```

`Access-Control-Allow-Origin` は、`*` パターンの場合でも、リテラルの `*` ではなく、リクエストのオリジンをそのまま（ブラウザが送信した通りの大文字/小文字で）エコーバックします。ブラウザキャッシュはこれを `Vary: Origin` と組み合わせてレスポンスをキーとするため、エコーバックすることで、スキーマ変更なしに将来のリリースで `Access-Control-Allow-Credentials` を追加する余地が残ります。`Access-Control-Expose-Headers: Retry-After` は、ブラウザの Web UI が `429` / `503` レスポンスからのデーモンのリトライヒントを尊重できるようにします。`Access-Control-Allow-Credentials` は現在**送信されません**。デーモンは `Authorization` 内の Bearer 経由で認証を行い、これは `credentials: 'include'` なしでクロスオリジンで機能するためです。

OPTIONS プリフライトリクエスト（`Access-Control-Request-Method` または `Access-Control-Request-Headers` を含む OPTIONS）は、`204 No Content` と上記のヘッダーでショートサーキットされます。これは従来の CORS パターンであり安全です。プリフライトはデーモンがどのメソッド/ヘッダーを受け入れるかを確認するだけで、実際の後続リクエストは引き続きフルチェーン（ホスト許可リスト → Bearer 認証 → ルート）を実行するため、アンチ DNS リバインディングと Bearer 強制は状態の読み取りや変更前に引き続き機能します。一致したオリジンからのプレーンな OPTIONS リクエストは、CORS ヘッダーを付加して下流にそのまま流れます。

許可リストに一致しないオリジンも `403 {"error":"Request denied by CORS policy"}` を受け取ります。デフォルトのブロックと同じエンベロープであるため、すでにブロックのレスポンスを解析しているクライアントは、許可リストがデプロイされたデーモンを特別扱いする必要がありません。拒否パスは `Access-Control-*` ヘッダーを**出力しません**（ブラウザは無視するためであり、出力するとヘッダーの存在を通じて許可リストのサイズを間接的に公開してしまうためです）。

設定されたパターンリストは意図的に `/capabilities` でエコーバック**されません**。ブラウザの Web UI はすでに自身のオリジンを知っている（デーモンを呼び出したわけですから）であり、リストを公開すると `/capabilities` の未認証リーダーが信頼されたすべてのオリジンを列挙できてしまうためです（設定ミスのあるデプロイメントにとって有用な偵察情報となります）。SDK クライアントは、特定のオリジンを知る必要なく、「このデーモンはクロスオリジンのブラウザヒットを許可する」というために `caps.features.allow_origin` タグでゲートします。

ループバックのセルフオリジンリクエスト（例: `/demo` ページが同じ `127.0.0.1:port` のデーモンを呼び出す場合）は、CORS ミドルウェア**より前**に実行され、`127.0.0.1:port` / `localhost:port` / `[::1]:port` / `host.docker.internal:port` の `Origin` ヘッダーを削除する**別の** Origin ストリップシムによって処理されます。したがって、これらは `--allow-origin` の設定に関係なく通過します。オペレーターは、デモページを機能させるためにデーモン自身のポートをリストする必要はありません。

## 共通のエラー形式

5xx レスポンスは、存在する場合、元のエラーの `code` と `data` を保持します（JSON-RPC スタイル — ACP SDK はエージェントから `{code, message, data}` を転送します）。

```json
{
  "error": "Internal error",
  "code": -32000,
  "data": { "reason": "model quota exceeded" }
}
```

リクエストボディの JSON が不正な場合、以下のレスポンスを返します。

```json
{ "error": "Invalid JSON in request body" }
```

ステータスは `400` です。

不明なセッション ID の `SessionNotFoundError` は以下を返します。

```json
{ "error": "No session with id \"<sid>\"", "sessionId": "<sid>" }
```

ステータスは `404` です。

デーモンのバインドされたワークスペースに正規化されない `cwd` を持つ `POST /session` の `WorkspaceMismatchError`（#3803 §02 — 1 デーモン = 1 ワークスペース）は `400` を返し、ボディは以下のようになります。

```json
{
  "error": "Workspace mismatch: daemon is bound to \"…\" but request asked for \"…\". …",
  "code": "workspace_mismatch",
  "boundWorkspace": "/path/the/daemon/binds",
  "requestedWorkspace": "/path/in/the/request"
}
```

これを使用して、事前にミスマッチを検出します。`/capabilities` から `workspaceCwd` を読み取り、`POST /session` から `cwd` を省略するか（バインドされたワークスペースにフォールバックします）、`requestedWorkspace` にバインドされたデーモンにリクエストをルーティングします。

デーモンの `--max-sessions` 上限を超えた `POST /session` は、`Retry-After: 5` ヘッダーと以下のボディで `503` を返します。

```json
{
  "error": "Session limit reached (20)",
  "code": "session_limit_exceeded",
  "limit": 20
}
```

既存のセッションへのアタッチは上限にカウントされないため、アイドル状態のデーモンへの再接続は、上限に達していても機能し続けます。

`RestoreInProgressError` — `POST /session/:id/load` と `POST /session/:id/resume` からのみ発行され、`Retry-After: 5` ヘッダー（`session_limit_exceeded` と同じ）と以下のボディで `409` を返します。

```json
{
  "error": "Session \"<sid>\" is already being restored via session/<resume|load>; retry session/<load|resume> after it completes",
  "code": "restore_in_progress",
  "sessionId": "<sid>",
  "activeAction": "load",
  "requestedAction": "resume"
}
```

すでに `session/resume` が進行中の ID に対して `session/load` が発行された場合（またはその逆）に発生します。少なくとも `Retry-After` 秒待ってからリトライしてください。基礎となるリストアは `initTimeoutMs`（デフォルト 10 秒）以内に完了します。同じアクションの競合（`load` 対 `load`、`resume` 対 `resume`）は、エラーにならずに統合されます。

## ケーパビリティ

デーモンは、serve ケーパビリティレジストリからサポートされている機能タグを公開します。クライアントは、UI の表示を `mode` ではなく `features` に基づいてゲート**しなければなりません**（デザイン §10 に従う）。

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

> 条件付きタグは、一致するデプロイメントトグルがオンの場合にのみ表示されます（以下の表を参照）。F3 の `permission_mediation` タグは常にオンであり、SDK クライアントがビルドでサポートされているセットをイントロスペクトできるように `modes: ['first-responder', 'designated', 'consensus', 'local-only']` を持ちます。ランタイムでアクティブな戦略は `body.policy.permission` にあります。

`session_scope_override` は、`POST /session` のリクエストごとの `sessionScope` フィールドのネゴシエーションハンドルです（以下を参照）。古いデーモンはこのフィールドを無視するため、SDK クライアントは送信前にこのタグの `caps.features` を事前確認する必要があります。

`session_load` と `session_resume` は、明示的なリストアルート（`POST /session/:id/load` と `POST /session/:id/resume`）を公開します。古いデーモンはこれらのパスに対して `404` を返すため、SDK クライアントは呼び出す前に `caps.features` を事前確認する必要があります。`unstable_session_resume` は、基礎となる ACP メソッドが `connection.unstable_resumeSession` という名前であった間にリリースされた SDK との互換性のために、非推奨のエイリアスとして引き続き公開されます。新しいクライアントは `session_resume` でゲートする必要があります。

`slow_client_warning` は、#4175 Wave 2.5 PR 10 で同時にリリースされた 2 つの SSE バックプレッシャーノブをカバーします。(a) サブスクライバーのキューが 75% 満杯を超えた場合、デーモンは `slow_client_warning` 合成イベントストリームフレームを発行します（オーバーフローエピソードごとに 1 回、キューが 37.5% 未満に排出された後に再武装）。(b) `GET /session/:id/events` は `?maxQueued=N` クエリパラメータ（範囲 `[16, 2048]`）を受け付け、大きなリプレイリングに対するコールド再接続時のサブスクライバーごとのバックログを事前にサイズ決定します。デーモン全体のリングサイズは `--event-ring-size`（デフォルト **8000**、#3803 §02 に従う）によって制御されます。古いデーモンは両方をサイレントに欠いているため、オプトインする前にこのタグを事前確認してください。

`typed_event_schema` は、SDK の `KnownDaemonEvent` スキーマに一致するデーモンイベントペイロードを公開します。古いデーモンは引き続き互換性のあるフレームをストリーミングする可能性がありますが、SDK クライアントは型付きイベントのカバレッジを想定する前にこのタグを事前確認する必要があります。

`client_heartbeat` は `POST /session/:id/heartbeat` を公開します。古いデーモンは `404` を返します。定期ハートビートを発行する前にこのタグを事前確認してください。

`session_close` と `session_metadata` は `DELETE /session/:id` と `PATCH /session/:id/metadata` を公開します。古いデーモンは `404` を返します。クローズまたはリネームの機能を提供する前に、これらのタグを事前確認してください。

`session_lsp` は `GET /session/:id/lsp` を公開します。これは、デーモンクライアント向けの読み取り専用の構造化 LSP ステータススナップショットです。古いデーモンは `404` を返します。リモート LSP ステータスを提供する前にこのタグを事前確認してください。

`session_status` は `GET /session/:id/status` を公開します。これは、ID ごとの単一セッションのライブブリッジサマリー（`clientCount` / `hasActivePrompt` およびコアフィールド）です。古いデーモンは `404` を返します。セッションリスト全体をスキャンする代わりに単一セッションのステータスをポーリングする前に、このタグを事前確認してください。

`session_approval_mode_control`、`workspace_tool_toggle`、`workspace_init`、および `workspace_mcp_restart`（issue [#4175](https://github.com/QwenLM/qwen-code/issues/4175) PR 17）は、以下の「ミューテーション: 承認、ツール、初期化、MCP 再起動」で文書化されている 4 つのミューテーション制御ルートを公開します。4 つすべてが PR 15 のミューテーションゲートによって厳密にゲートされています（Bearer トークンなしで設定されたデーモンは、それらを 401 `token_required` で拒否します）。古いデーモンは `404` を返します。対応する機能を提供する前に、各タグを事前確認してください。

`mcp_guardrails`（issue [#4175](https://github.com/QwenLM/qwen-code/issues/4175) PR 14）は、MCP バジェット表面をカバーします。`GET /workspace/mcp` の `clientCount` / `clientBudget` / `budgetMode` / `budgets[]` フィールド、サーバーごとのセルの `disabledReason` フィールド、および `--mcp-client-budget` / `--mcp-budget-mode` CLI フラグです。古いデーモンは新しいフィールドを完全に省略します。SDK クライアントは `budgets[]` のセマンティクスに依存する前にこのタグを事前確認します。レジストリ記述子は、将来の機能モード公開のために `modes: ['warn', 'enforce']` も保持します。現時点では、クライアントはスナップショットの `budgetMode` フィールドからモードを推測します。`enforce` モードでのサーバーの拒否は、`Object.entries(mcpServers)` の宣言順序によって決定的になります。将来のスコープ優先順位レイヤー（qwen-code が採用する場合）は、claude-code の `plugin < user < project < local` 規則を反映するために、これを「最低優先順位を最初」にシフトさせます。

> ⚠️ **PR 14 v1 スコープ: ワークスペースごとではなく、セッションごと。** デーモン内の各 ACP セッションは、独自の `Config` + `McpClientManager` を構築します（`acpAgent.newSessionConfig` 経由）。バジェットキャップは**セッションごと**に MCP クライアントをライブ化します。各セッションは、転送された env から `QWEN_SERVE_MCP_CLIENT_BUDGET` を独立して読み取ります。`--mcp-client-budget=10` で 5 つの同時 ACP セッションがある場合、デーモン全体の実際のライブ MCP クライアント数は 5 × 10 = 50 に達する可能性があります。`GET /workspace/mcp` スナップショットは、**ブートストラップセッションの** `McpClientManager` アカウンティングのみを読み取ります。`budgets[0].scope: 'session'` の値は、これが集約ではなくセッションごとであることを示す正直なシグナルです。**Wave 5 PR 23（共有 MCP プール）** は、ワークスペーススコープのマネージャーを導入し、真のクロスセッション集計のためにセッションごとのセルの横に `scope: 'workspace'` セルを追加します。v1 は、PR 23 が構築するプロセス内カウンター + ソフト強制の基盤です。

`workspace_file_read` は、テキスト/リスト/統計/glob ワークスペースファイルルート（`GET /file`、`GET /list`、`GET /glob`、`GET /stat`）をカバーします。`workspace_file_bytes` は `GET /file/bytes` をカバーし、これは後で追加されたもので、クライアントが PR19 時代のデーモンに対して生バイトウィンドウサポートを事前確認できるようにします。`workspace_file_write` は、ハッシュ対応のテキストミューテーションルート（`POST /file/write`、`POST /file/edit`）をカバーします。write タグはルート契約が存在することを意味しますが、現在のデプロイメントが匿名のミューテーションに対してオープンであることは意味しません。write/edit は厳密なミューテーションルートであり、ループバックでも設定された Bearer トークンを必要とします。

`daemon_status` は `GET /daemon/status` を公開します。これは、以下で文書化されている統合された読み取り専用のオペレーター診断スナップショットです。

**条件付きタグ。** 少数の機能タグは、一致するデプロイメントトグルがオンの場合にのみ公開されます。タグの存在 = 動作がオン。タグの欠如 = そのタグより前の古いデーモン、またはオペレーターがオプトインしていない現在のデーモンのいずれかです。現在:

| Tag                        | Advertised when …                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `require_auth`             | デーモンが `--require-auth`（または埋め込み API 経由で `requireAuth: true`）を指定して起動された場合。ループバックバインドの `/health` を含むすべてのルートで Bearer トークンが必須です。                                                                                                                                                                                                                                                                                                                                    |
| `mcp_workspace_pool`       | 共有 MCP トランスポートプールがアクティブな場合。`QWEN_SERVE_NO_MCP_POOL=1` でプールが無効になっている場合は省略されます。                                                                                                                                                                                                                                                                                                                                                                                                             |
| `mcp_pool_restart`         | 共有 MCP トランスポートプールがアクティブな場合。再起動レスポンスにプール対応のマルチエントリシェイプが含まれる可能性があります。                                                                                                                                                                                                                                                                                                                                                                                                           |
| `allow_origin`             | T2.4 ([#4514](https://github.com/QwenLM/qwen-code/issues/4514))。デーモンが少なくとも 1 つの `--allow-origin <pattern>`（または埋め込み API 経由で `allowOrigins: [...]`）を指定して起動された場合。一致したオリジンからのクロスオリジンリクエストは適切な CORS レスポンスヘッダーを受け取ります。一致しないオリジンはデフォルトの 403 を受け取ります。設定されたパターンリストは、信頼されたオリジンセットを未認証のリーダーに漏洩させないために `/capabilities` で意図的にエコーバック**されません**。ブラウザの Web UI はすでに自身のオリジンを知っています。 |
| `prompt_absolute_deadline` | `--prompt-deadline-ms` / `QWEN_SERVE_PROMPT_DEADLINE_MS` / `ServeOptions.promptDeadlineMs` が正の整数に設定されている場合。                                                                                                                                                                                                                                                                                                                                                                                        |
| `writer_idle_timeout`      | `--writer-idle-timeout-ms` / `QWEN_SERVE_WRITER_IDLE_TIMEOUT_MS` / `ServeOptions.writerIdleTimeoutMs` が正の整数に設定されている場合。                                                                                                                                                                                                                                                                                                                                                                             |
| `workspace_settings`       | デーモンが設定の永続化が利用可能な状態で作成された場合。                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `session_shell_command`    | セッションシェル実行が明示的に有効になっている場合。                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `rate_limit`               | `--rate-limit` / `QWEN_SERVE_RATE_LIMIT=1` / `ServeOptions.rateLimit` が有効になっている場合。                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `workspace_reload`         | 埋め込みルート設定でワークスペースリロードサポートが利用可能な場合。                                                                                                                                                                                                                                                                                                                                                                                                                                      |
`mcp_guardrails` はこの条件付きテーブルには含まれ**ません**。これは常時オンのタグであり、オペレーターが予算を設定しているかどうかに関係なく、バイナリが新しい `/workspace/mcp` 予算フィールドをサポートしている場合に常にアドバタイズされます。`--mcp-client-budget` を設定していないオペレーターでも、新しいフィールド（`budgetMode: 'off'`, `budgets: []`）を受け取ります。

`mcp_guardrail_events`（issue [#4175](https://github.com/QwenLM/qwen-code/issues/4175) PR 14b）は、ポーリングループなしで MCP 予算の状態閾値超過を通知する、型付き SSE プッシュイベントをアドバタイズします。`GET /session/:id/events` には 2 種類のフレームタイプが到着します。

- `mcp_budget_warning` — `reservedSlots.size / clientBudget` が 75% を上回った時点で 1 回発生します。比率が 37.5%（`MCP_BUDGET_REARM_FRACTION`）を下回った後にのみ再武装（リアーム）されます。PR 10 の `slow_client_warning` ヒステリシスを反映していますが、サブスクライバーごとのバックログレベルではなくマネージャーレベルで動作します。ペイロード: `{ liveCount, reservedCount, budget, thresholdRatio: 0.75, mode: 'warn' | 'enforce' }`。`warn` と `enforce` の両方のモードで発生し、`off` では決して発生しません。
- `mcp_child_refused_batch` — 1 つ以上のサーバーが拒否された場合に各 `discoverAllMcpTools*` パスの終了時に発生し、**かつ** `readResource` の遅延スポーン拒否パス上で長さ 1 のバッチとして発生します。ペイロード: `{ refusedServers: [{ name, transport, reason: 'budget_exhausted' }, ...], budget, liveCount, reservedCount, mode: 'enforce' }`。`warn` モードでは決して拒否しないため、`mode` はリテラルの `'enforce'` になります。

どちらのイベントもセッションごとの SSE リプレイリングに保存され（`id` を持ちます）、`Last-Event-ID` で再接続するクライアントはこれらを介して再開できます。長時間の切断後の状態については、`GET /workspace/mcp` のスナップショットが引き続き信頼できる情報源（source-of-truth）となります。一度アドバタイズされると常時オンになり、条件付きの切り替えはありません。SDK のリデューサー状態（`DaemonSessionViewState`）は、シンプルな遅延スタイルの UI を必要とするアダプター向けに、`mcpBudgetWarningCount`、`lastMcpBudgetWarning`、`mcpChildRefusedBatchCount`、`lastMcpChildRefusedBatch` を公開します。

## ルート

### `GET /health`

生存プローブ（Liveness probe）。デフォルト形式では、リスナーが稼働している場合に `200 {"status":"ok"}` を返します。軽量でブリッジへのアクセスを必要とせず、高頻度の k8s/Compose 生存プローブに適しています。

ブリッジの**カウンター**を公開するプローブ（情報提供のみで、真の生存チェックではありません）には、`?deep=1`（`?deep=true` または単なる `?deep` も受け付けます）を渡します。

```json
{ "status": "ok", "sessions": 3, "pendingPermissions": 1 }
```

> ⚠️ ディーププローブは**情報提供のみ**を目的としており、実際の生存検証ではありません。これはカウンターアクセッサー（`bridge.sessionCount`、`bridge.pendingPermissionCount`）を読み取りますが、これらは単純な Map サイズのゲッターです。個々の子プロセスやチャネルに ping を送信しないため、スタックしているにもかかわらずカウントされ続けているセッションは検出できません。これは、「このデーモンをローテーションから外す」トリガーとしてではなく、キャパシティダッシュボード（現在の同時実行数 vs `--max-sessions`、キューの深さ）のために使用してください。カスタムブリッジ実装のゲッターがスローした場合、理論的には `503 {"status":"degraded"}` レスポンスが返される可能性がありますが、実際のブリッジのゲッターがスローすることはありません。通常の操作では、ディーププローブは常に 200 を返します。実際の生存確認については、リスナーが TCP 接続を受け付けるかどうか（つまり、`?deep` なしのデフォルトの `/health`）に依存してください。

**認証:** **ループバック以外のバインドでのみ**必須です。ループバック（`127.0.0.1`、`::1`、`[::1]`）では、`/health` は bearer ミドルウェアより前に登録されるため、ポッド内の k8s/Compose プローブはトークンを保持する必要がありません。ループバック以外（`--hostname 0.0.0.0` など）では、ルートは bearer ミドルウェアの後に登録され、有効なトークンがない場合は 401 を返します。そうでなければ、未認証の呼び出し元が任意のアドレスをプローブして `qwen serve` の存在を確認できてしまい、ポートスキャンと組み合わさると深刻化しやすい低重大度の情報漏洩につながります。ループバックの免除においても、CORS 拒否 + ホスト許可リストは引き続き適用されます。

### `GET /daemon/status`

読み取り専用のオペレーター診断。`/health` とは異なり、これは通常のデーモン API です。ループバックバインドを含め、bearer 認証とレート制限の後に登録されます。クエリパラメータ:

- `detail=summary`（デフォルト）は、インメモリ上のデーモン状態のみを読み取ります。
- `detail=full` は、ライブセッション診断、ACP 接続診断、認証デバイスフローカウント、およびワークスペースステータスセクションも含みます。
- その他の `detail` は `400 { "code": "invalid_detail" }` を返します。

`summary` は意図的にワークスペースステータスメソッドのクエリ、ACP 子プロセスの開始、またはセッションのスポーンを行いません。`full` は各ワークスペースセクションを個別にクエリします。タイムアウトや例外が発生した場合、そのセクションのみが `unavailable` としてマークされ、`workspace_status_unavailable` イシューが追加されます。

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

`status` は、いずれかのイシューがエラー重大度の場合 `error`、いずれかのイシューが警告重大度の場合 `warning`、それ以外の場合は `ok` になります。イシューコードは安定しており、`session_capacity_high`、`connection_capacity_high`、`pending_permissions`、`acp_channel_down`、`preflight_error`、`mcp_budget_warning`、`mcp_budget_exhausted`、`rate_limit_hits`、および `workspace_status_unavailable` が含まれます。リスナーの準備ができてから完全なランタイムがマウントされるまでの短いウィンドウ期間中、`/daemon/status` は `daemon_runtime_starting` を報告する場合があります。非同期ランタイムのマウントに失敗した場合、`daemon_runtime_failed` を報告し、ステータス以外のランタイムルートは `503` を返します。

セキュリティ: レスポンスには、bearer トークン、クライアント ID、完全な ACP 接続 ID、デバイスフローのユーザーコード、または検証 URL が含まれることはありません。`summary` はデーモンログパスを省略します。`full` は認証されたオペレーターに対してこれを含む場合があります。

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

> **`protocolVersions`** は、デーモンが話せる serve プロトコルバージョンを記述します。`current` はデーモンが優先するプロトコルバージョンであり、`supported` は互換性のあるセットです。特定のプロトコルを必要とするクライアントは `supported` を確認する必要があります。機能固有の UI は引き続き `features` でゲートする必要があります。v=1 への追加: 古い v=1 デーモンはこのフィールドを省略するため、古いビルドをターゲットとする SDK クライアントはこれをオプションとして扱う必要があります。

> **`modelServices` は Stage 1 では常に `[]` です。** エージェントは単一のデフォルトモデルサービスを使用し、それをネットワーク経由で列挙しません。Stage 2 では、SDK クライアントがサービスピッカーを構築できるように、登録されたモデルアダプターからこれが設定されます。それまでは、このフィールドが空でないことに依存しては**なりません**。

> **`workspaceCwd`** は、このデーモンがバインドする正規の絶対パスです（#3803 §02 — 1 デーモン = 1 ワークスペース）。これを使用して、(a) `/session` をポストする前に不一致を検出し、(b) `POST /session` で `cwd` を省略します（ルートはこのパスにフォールバックします）。マルチワークスペースデプロイメントでは、異なるポートで複数のデーモンを公開し、それぞれが独自の `workspaceCwd` を持ちます。v=1 への追加: §02 以前の v=1 デーモンはフィールドを省略します。古いビルドをターゲットとするクライアントは、使用する前に null チェックを行う必要があります。

### 読み取り専用ランタイムステータスルート

これらのルートはデーモン側のランタイムスナップショットを報告します。これらは追加の v1 ルートであり、状態を変更せず、serve プロトコルバージョンも変更しません。ワークスペースステータスルートは、クライアントが GET ルートをポーリングしたからといって、意図的に ACP 子プロセスを起動**しません**。デーモンがアイドル状態の場合、空のスナップショットで `initialized: false` を返します。セッションステータスルートはライブセッションを必要とし、不明な ID に対しては標準の `404 SessionNotFoundError` 形状を使用します。

ケイパビリティタグ:

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

`errorKind` は、`/workspace/preflight`、`/workspace/env`、および（最終的に）MCP ガードレールで共有される閉じた列挙型であり、SDK クライアントがフリーフォームのメッセージを解析する代わりにカテゴリごとに修復（remediation）をレンダリングできるようにします。PR 13（#4175）で上記の 7 つのリテラルが導入されました。PR 14 では、エグレスプローブが実装され次第、`blocked_egress` が設定されます。

ステータスペイロードが MCP 環境変数の値、ヘッダー、OAuth/サービスアカウントの詳細、プロバイダー API キー、プロバイダーの `baseUrl` / `envKey`、スキル本文、スキルのファイルシステムパス、フック定義、またはシークレット環境変数の値を公開することはありません。`/workspace/env` はホワイトリスト化された環境変数の**存在**のみを報告します。プロキシ URL はネットワークに送信される前に認証情報が削除され、`host:port` に削減されます。

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

`discoveryState` は `not_started`、`in_progress`、または `completed` のいずれかです。`transport` は `stdio`、`sse`、`http`、`websocket`、`sdk`、または `unknown` のいずれかです。ディスカバリーが成功した場合、`errors` は省略されます。

**MCP クライアントガードレール（issue [#4175](https://github.com/QwenLM/qwen-code/issues/4175) PR 14）。** PR 14 以降のデーモンは、4 つの追加フィールドと 1 つのワークスペースレベルのセルを使用してペイロードを拡張します。

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

`budgetMode` は `enforce`、`warn`、または `off` のいずれかです。予算が設定されていない場合、`clientBudget` は存在しません。`budgets[]` は PR 14 以降のデーモンでは**常に配列**です（`budgetMode === 'off'` の場合は空になる可能性があります）。PR 14 より前のデーモンはフィールドを完全に省略します。v1 は `scope: 'session'` のセルを 1 つ出力します（セッションごとの強制 — 理由は上記のケイパビリティセクションを参照）。コンシューマーは、認識されない `scope` 値を持つ追加の `budgets[]` エントリを許容**しなければなりません**。Wave 5 PR 23 では、スキーマのバージョンアップなしに、セッションごとのセル alongside に `scope: 'workspace'`（または `'pool'`）が追加されます。

サーバーごとのセルの `disabledReason` は、オペレーターによって無効化されたもの（`'config'` — `disabledMcpServers` 設定リスト）と、予算によって拒否されたもの（`'budget'` — ディスカバリーされたが `enforce` モードのために接続されなかったもの）を区別します。拒否は `Object.entries(mcpServers)` の宣言順序によって決定的になります。サーバーごとの `status: 'error', errorKind: 'budget_exhausted'` は、生の `mcpStatus: 'disconnected'`（これは真ですが、オペレーター向け重大度ではありません）をシャドウイングします。

PR 14 v1 における予算強制は**ワークスペースごとではなく、セッションごと**です。モード B デーモンは #4113 以降、プロセスレベルでは `1 デーモン = 1 ワークスペース × N セッション` ですが、`McpClientManager` は `acpAgent.newSessionConfig` を介して各 ACP セッションの `Config` 内で構築されるため、N 個のセッションはそれぞれ独自のキャップのコピーを強制します。スナップショットはブートストラップセッションのビューを表します。Wave 5 PR 23 では、ワークスペーススコープの共有 MCP プールが導入され、真のワークスペースごとの強制へと移行します。

**予算の逼迫の検出。** PR 14b 以降に設定される 2 つのサーフェス:

- **プッシュイベント**（`mcp_guardrail_events` 経由でアドバタイズ）: `GET /session/:id/events` をサブスクライブし、`KnownDaemonEvent` を介して `mcp_budget_warning` / `mcp_child_refused_batch` フレームを絞り込みます。ステートマシンは 75% を上回る crossing ごとに 1 回発生し（37.5% を下回ると再武装）、拒否は `enforce` モードではディスカバリーパスごとに 1 回に統合されます。
- **スナップショットポーリング**（`mcp_guardrails` 経由でアドバタイズ）: `GET /workspace/mcp` を実行し、セッションごとの予算セル（`budgets[0]`）を検査します。

- `budgets[0].status === 'warning'` ⇔ `liveCount >= 0.75 * clientBudget`（PR 14b のプッシュイベントが使用するヒステリシス閾値と一致）。
- `budgets[0].status === 'error'` ⇔ `refusedCount > 0`（このディスカバリーパスで 1 つ以上のサーバーが拒否された）。
- `budgets[0].status === 'ok'` ⇔ 75% 閾値未満 かつ 拒否なし。

推奨されるポーリング頻度: すでに `/workspace/mcp` をポーリングしているものと同期させます。スナップショットは軽量であり、予算セルに追加のディスカバリーコストはかかりません。プッシュイベントをサブスクライブする SDK クライアントでも、長時間の切断後の状態把握のためにスナップショットが役立ちます（SSE リプレイリングの深さは有限です — `--event-ring-size`、デフォルト 8000 — そのため、リングのカバレッジよりも長くオフラインになるクライアントはスナップショットの再同期にフォールバックします）。

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

`level` は `project`、`user`、`extension`、または `bundled` のいずれかです。ディスカバリーが成功した場合、`errors` は省略されます。

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

モデルは認証タイプごとにグループ化されます。プロバイダー接続診断は `/workspace/preflight` の `providers` セルに存在し、環境プレフライトは `/workspace/preflight` と `/workspace/env`（下記）に存在します。スナップショットの構築が成功した場合、`errors` は省略されます。

### `GET /workspace/env`

デーモンプロセスのランタイム、プラットフォーム、サンドボックス、プロキシ、およびホワイトリスト化されたシークレット環境変数の**存在**を報告します。常に `process.*` の状態から回答します。デーモンはこのルートを提供するために ACP 子プロセスをスポーンすることはなく、ACP が稼働中かアイドルかに関係なくレスポンスは同一です。`acpChannelLive` フィールドは情報提供のみを目的としています。

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

**リダクションポリシー。** `kind: 'env_var'` セルには `value` フィールドが含まれることはなく、クライアントは `present: boolean` のみを確認できます。`kind: 'proxy'` セルは、生の環境変数の値を認証情報のリダクション（`redactProxyCredentials`）にかけ、次に `URL` 解析を通じて、ネットワーク上には `host:port` のみが伝わるようにします。`NO_PROXY` は URL ではなくホストリストであるため、リダクションをそのまま通過します。列挙されるシークレット環境変数のホワイトリストには、現在 `OPENAI_API_KEY`、`ANTHROPIC_API_KEY`、`GEMINI_API_KEY`、`GOOGLE_API_KEY`、`DASHSCOPE_API_KEY`、`OPENROUTER_API_KEY`、および `QWEN_SERVER_TOKEN` が含まれています。他の環境変数は列挙されないため、誤って設定されたシークレットは不可視のままとなります。

### `GET /workspace/preflight`

デーモンの準備状態チェックを報告します。**デーモンレベルのセル**（`node_version`、`cli_entry`、`workspace_dir`、`ripgrep`、`git`、`npm`）は常に `process.*` と `node:fs` から設定されます。**ACP レベルのセル**（`auth`、`mcp_discovery`、`skills`、`providers`、`tool_registry`、`egress`）はライブな ACP 子プロセスを必要とします。デーモンがアイドル状態の場合、これらは `status: 'not_started'` プレースホルダーを出力します。このルートはセルを設定するためだけに ACP をスポーンすることはなく、対応するセルは `not_started` にフォールバックします。

アイドル時のレスポンス（ACP 子プロセスなし）:

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
Cell の形状:

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

- `missing_binary` — Node バージョンが要件未満、`QWEN_CLI_ENTRY` が欠落、ripgrep / git / npm が PATH にない（オプションのバイナリの場合はエラーではなく警告）。
- `missing_file` — `boundWorkspace` が存在しないかディレクトリではない、または欠落・読み取り不能なファイルを指す skill のパースエラー。
- `parse_error` — `SKILL.md` のパース失敗、不正な形式の config JSON。
- `auth_env_error` — `validateAuthMethod` が null 以外の失敗文字列を返した、またはプロバイダー解決から伝播した `ModelConfigError` サブクラス。
- `init_timeout` — ブリッジでの `withTimeout` の reject（ACP ラウンドトリップ待機中の実際のタイムアウト）。`BridgeTimeoutError` 型付きクラスを通じて認識される。注意: `connecting > 0` を持つ一時的な `mcp_discovery` の `warning` cell はこの kind を持たない。これは実際のタイムアウトとは異なる、通常のハンドシェイク進行中の状態である。
- `protocol_error` — チャネルがリクエスト中に閉じられたため、または tool registry が予期せず欠落していたため、ACP `extMethod` が拒否された。
- `blocked_egress` — PR 14 (#4175) 用に予約されている。PR 13 は `egress` cell を `status: 'not_started'` のままにする。

ブリッジが preflight リクエストの処理中に ACP 子プロセスに到達できなかった場合（例: リクエスト中のチャネルクローズ）、エンベロープの `errors` 配列には失敗を説明する単一の `ServeStatusCell` が含まれ、cell は `not_started` の ACP プレースホルダーにフォールバックする。Daemon レベルの cell は引き続き返される。

### Workspace ファイルルート

すべてのファイルパスは daemon のバインドされたワークスペースを通じて解決される。レスポンスはワークスペース相対パスを使用し、通常の成功ケースで絶対ファイルシステムパスを返すことはない。成功時のファイルレスポンスには以下が含まれる:

```http
Cache-Control: no-store
X-Content-Type-Options: nosniff
```

ファイルシステムエラーは以下の JSON 形状を使用する:

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

テキストファイルを読み取る。クエリパラメータ: `path`（必須）、`maxBytes`、`line`、`limit`。daemon はバイナリファイルとテキスト読み取り上限を超えるファイルを拒否する。レスポンスには `hash`（ファイル全体のディスク上の生バイトに対する SHA-256 ダイジェスト）が含まれる。これは `line`、`limit`、または `maxBytes` によってスライスが返された場合でも同様である。

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

デコードせずにファイルから生バイトを読み取る。クエリパラメータ: `path`（必須）、`offset`（デフォルト `0`）、`maxBytes`（デフォルト `65536`、最大 `262144`）。このルートは、ファイル全体を読み込むことなく、大きなバイナリファイルに対する境界付きウィンドウをサポートする。レスポンスには、返されたウィンドウがファイル全体をカバーしている場合にのみ `hash` が含まれる。

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

テキストファイルを作成または置換する。これは厳密な変更ルートである: 設定されたトークンなしのループバックでは `401 { "code": "token_required" }` を返す。`--require-auth` 指定時、グローバル Bearer ミドルウェアはルートが実行される前に未認証リクエストを拒否する。

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

`mode` は `create` または `replace` でなければならない。`create` は既存ファイルを上書きしない（`409 file_already_exists`）。`replace` には `expectedHash` が必要である。欠落または不正な形式のハッシュは `400 parse_error`、古いハッシュは `409 hash_mismatch` となる。`expectedHash` は `sha256:` に続く 64 文字の小文字 16 進数であり、ディスク上の生バイトに対して計算される。

`bom`、`encoding`、`lineEnding` を指定することができる。置換はデフォルトで既存ファイルのエンコーディングプロファイルを保持する。明示的なフィールドがこれをオーバーライドする。バイナリの書き込みは対象外である。

daemon は対象ディレクトリ内のランダムな一時ファイルに書き込み、サポートされている場所で fsync を実行し、`rename()` の直前に現在のハッシュを再チェックしてから、適切な場所にリネームする。これにより、部分的なファイルの観測が防止され、同じファイルへの daemon 起点の書き込みが直列化されるが、これはプロセス間カーネルの compare-and-swap ではない。最終ハッシュチェックとリネームの間のわずかなウィンドウで、外部エディタが競合する可能性は依然としてある。

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

既存のテキストファイルに対して正確なテキスト置換を 1 回適用する。これも厳密な変更ルートであり、`expectedHash` が必要である。

```json
{
  "path": "src/config.ts",
  "oldText": "timeout: 30000",
  "newText": "timeout: 60000",
  "expectedHash": "sha256:..."
}
```

`oldText` は空でなく、正確に 1 回出現する必要がある。一致しない場合は `422 text_not_found` を返し、複数一致する場合は `422 ambiguous_text_match` を返す。このルートはエンコーディング、BOM、改行コードを保持し、アトミックなリネームの直前に `expectedHash` を再チェックする。

認証された呼び出し元がパスを明示的に指定しているため、無視されたパスへの明示的な書き込み/編集は許可される。成功時のレスポンスと監査イベントには `matchedIgnore: "file" | "directory" | null` が含まれる。

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

`state` は `POST /session`、`POST /session/:id/load`、`POST /session/:id/resume` で使用される ACP の model/mode/config-option の形状と同一である。

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
    }
  ]
}
```

このルートは読み取り専用の帯域外スナップショットである。意図的にプロンプトではなく、セッションのストリーミング中にもクエリを実行できる。レスポンスには agent、shell、monitor タスクレジストリからのホワイトリスト化されたメタデータのみが含まれ、コントローラー、タイマー、オフセット、保留中のメッセージ、および生のレジストリオブジェクトが公開されることはない。

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

`status` は `NOT_STARTED`、`IN_PROGRESS`、`READY`、`FAILED` のいずれかである。オプションの `error` は、失敗したサーバーで利用可能な場合に存在する。無効化された LSP（ベアモードを含む）は、`enabled: false`、ゼロのカウント、`servers: []` で HTTP 200 を返す。サーバーが構成されていない状態で LSP が有効な場合は、`enabled: true`、`configuredServers: 0`、`servers: []` を返す。クライアントが存在する前に初期化が失敗した場合、レスポンスに `initializationError` が含まれることがある。稼働中のクライアントがスナップショットを提供できない場合、レスポンスには `statusUnavailable: true` が含まれる。

このルートは安定したクライアント向けフィールドのみを公開する。プロセス ID、spawn 引数、stderr の末尾、ルート URI、ワークスペースフォルダーパスなどのデバッグ用の内部情報は意図的に省略されている。

### `POST /session`

新しい agent を生成するか、既存の agent にアタッチする（`sessionScope: 'single'`（デフォルト）の場合）。

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
| `cwd`            | いいえ       | daemon のバインドされたワークスペースに一致する絶対パス。省略した場合、ルートは `boundWorkspace` にフォールバックする（`/capabilities.workspaceCwd` から読み取る）。一致しない空でない `cwd` は `400 workspace_mismatch` を返す（#3803 §02 — 1 daemon = 1 workspace）。ワークスペースパスは `realpathSync.native` 経由で正規化される（存在しないパスの場合は resolve-only のフォールバックを使用）ため、大文字と小文字を区別しないファイルシステムでもスペルごとにセッションが拒否されることはない。                                                                                                                                                                          |
| `modelServiceId` | いいえ       | agent がルーティングする構成済みの_モデルサービス_（バックエンドプロバイダー — Alibaba ModelStudio、OpenRouter など）を選択する。省略した場合、agent はデフォルトを使用する。ワークスペースにすでにセッションがある場合、これは既存のセッションで `setSessionModel` を呼び出し、`model_switched` をブロードキャストする。すでにバインドされたサービス**内**のモデルを選択する `POST /session/:id/model` の `modelId` とは異なる。`/capabilities` の `modelServices` 配列は構成済みサービスの公開用に予約されている。Stage 1 では常に `[]` である（agent のデフォルトサービスが使用され、HTTP 経由で列挙されない）。 |
| `sessionScope`   | いいえ       | セッション共有のリクエストごとのオーバーライド。`'single'`（daemon 全体のデフォルト）は、同じワークスペースへの 2 回目の `POST /session` で既存のセッションを再利用させる（`attached: true`）。`'thread'` は呼び出しごとに新しい個別セッションを強制的に作成する。省略すると daemon 全体のデフォルトが継承される。列挙外の値は `400 { code: 'invalid_session_scope' }` を返す。古い daemon（#4175 PR 5 より前）はこのフィールドをサイレントに無視する。送信前に pre-flight で `caps.features.session_scope_override` を確認すること。daemon 全体のデフォルトは現在の本番環境では `'single'` にハードコードされている。#4175 では、後続のアップデートで `--sessionScope` CLI フラグが追加される可能性がある。         |

レスポンス:

```json
{
  "sessionId": "<uuid>",
  "workspaceCwd": "/canonical/path",
  "attached": false
}
```

`attached: true` は、そのワークスペースのセッションがすでに存在し、現在それを共有していることを意味する。

同じワークスペースに対する同時実行の `POST /session` 呼び出しは、1 つの生成に**統合（coalesced）** される。両方の呼び出し元は同じ `sessionId` を取得し、ちょうど 1 つだけが `attached: false` を報告する。基盤となる生成が失敗した場合（初期化タイムアウト、不正な形式の agent 出力、OOM）、**統合されたすべての呼び出し元が同じエラーを受け取る**。実行中のスロットはクリアされるため、後続の呼び出しで最初から再試行できる。

> ⚠️ **新しいセッションでの `modelServiceId` の拒否は、HTTP レスポンス上ではサイレントである。** 不正な `modelServiceId`（タイプミス、未構成のサービス）であっても、作成時に 500 エラーには**ならない**。セッションは agent のデフォルトモデルで動作し続けるため、呼び出し元はモデルの切り替えを再試行できる `sessionId` を引き続き取得する（`POST /session/:id/model` 経由）。可視化される失敗シグナルは、セッションの SSE ストリーム上で、生成ハンドシェイクと最初のサブスクライブの間に発行される `model_switch_failed` イベントである。**このイベントを観測する必要があるサブスクライバーは、最初の `GET /session/:id/events` で `Last-Event-ID: 0` を渡すべきである。** これにより、リングの最も古い利用可能なイベントからリプレイされる（サブスクライブが作成レスポンスの数 ms 後になった場合でも、生成時の `model_switch_failed` をカバーする）。

### `POST /session/:id/load`

ID で永続化された ACP セッションを復元し、その履歴を SSE 経由でリプレイする。パスの ID が優先される。ボディ内の `sessionId` フィールドは無視される。Pre-flight で `caps.features.session_load` を確認すること。古い daemon はこのルートに対して `404` を返す。

リクエスト:

```json
{
  "cwd": "/absolute/path/to/workspace"
}
```

| Field | Required | Notes                                                                                                                                                                                                                                |
| ----- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `cwd` | いいえ       | `POST /session` と同じ正規化および `workspace_mismatch` のルール。省略すると `/capabilities.workspaceCwd` が継承される。`mcpServers` は意図的にここでは受け付けられない。daemon 全体の MCP は設定駆動である（`POST /session` と同様）。 |

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

`state` は ACP の `LoadSessionResponse` を反映する。`models` は `SessionModelState`、`modes` は `SessionModeState`、`configOptions` は `SessionConfigOption` の配列である。欠落しているフィールドは agent によって決定される。後からアタッチするクライアント（以下の `attached: true` のパス）は、元々の load 呼び出し元が確認したものと**同一**の `state` スナップショットを取得する。daemon はこれをエントリでキャッシュする。実行時の変更（例: `model_switched`）は、後続のアタッチレスポンスではなく SSE ストリーム上で配信される。

`attached: true` は、セッションがすでに稼働中だったことを意味する（以前の `session/load` / `session/resume` によるものか、統合された同時呼び出し元がわずかに先に競合したため）。

**SSE 経由の履歴リプレイ。** agent 側で `loadSession` が実行中の間、agent は永続化されたすべてのターンに対して `session_update` 通知を発行する。daemon はルートレスポンスが返される前にこれらをセッションのイベントバスにバッファリングするため、直ちに `Last-Event-ID: 0` を指定して `GET /session/:id/events` を呼び出すサブスクライバーは完全なリプレイを確認できる。**リプレイリングには上限がある**（デフォルトではセッションあたり 8000 フレーム）。多くのツール呼び出し/思考ストリームのターンを含む長い履歴はこれを超える可能性がある。最も古いフレームはサイレントに破棄される。完全な履歴を必要とするクライアントは、`load` が返された直後にサブスクライブすべきである。あるいは、SSE イベント ID を永続化し、`Last-Event-ID` を使用して後続のターンの境界から再開することもできる。

**エラー:**

- `404` — 永続化されたセッション ID が存在しない（`SessionNotFoundError`）。
- `400` — `workspace_mismatch`（`POST /session` と同じ形状）。
- `503` — `session_limit_exceeded`（`--max-sessions` に対するカウント。実行中の復元も考慮される）。
- `409` — `restore_in_progress`（同じ ID に対する `session/resume` がすでに実行中）。`Retry-After: 5`。同じアクションの競合（同じ ID に対する 2 つの同時 `session/load`）は統合される。ちょうど 1 つが `attached: false` を返し、残りは同じ `state` で `attached: true` を返す。

### `POST /session/:id/resume`

ID で永続化された ACP セッションを復元するが、SSE 経由で履歴をリプレイ**しない**。モデルコンテキストは agent 側で内部的に復元される（`geminiClient.initialize` が `config.getResumedSessionData` を読み取る経由）。すでに履歴がレンダリングされているクライアントのために、SSE ストリームはクリーンなまま保たれる。Pre-flight で `caps.features.session_resume` を確認すること。`unstable_session_resume` は、古いクライアントのための非推奨の互換性エイリアスのままとなっている。

リクエストの形状は `/load` と同じ。レスポンスの形状も同じ。`state` は ACP の `ResumeSessionResponse` を反映する。`409 restore_in_progress`（`session/load` が実行中の場合に発生する。別の `session/resume` の背後で競合する `session/resume` は統合される）を含む、同じエラーエンベロープが使用される。

クライアントに履歴がレンダリングされていない場合（コールド再接続、ピッカー → 開く）は `/load` を使用する。クライアントがすでにターンを画面に表示しており、daemon 側のハンドルのみを必要とする場合は `/resume` を使用する。

> ⚠️ **なぜ `unstable_session_resume` がまだ公開されているのか？** daemon の HTTP ルートと `session_resume` ケーパビリティは v1 向けに安定しているが、ブリッジは引き続き ACP の `connection.unstable_resumeSession` を呼び出す。古いタグは、`session_resume` より前にリリースされた SDK が引き続き動作するようにするためだけに残されている。

### `GET /workspace/:id/sessions`

正規化されたワークスペースが `:id`（URL エンコードされた絶対 cwd）に一致するすべての稼働中セッションをリスト化する。

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

セッションが存在しない場合は空の配列（404 ではない）を返す。セッションピッカー UI は、ワークスペースがアイドル状態であるだけでエラーになるべきではない。

### `POST /session/:id/prompt`

プロンプトを agent に転送する。複数プロンプトの呼び出し元は、セッションごとに FIFO キューに入る（ACP はセッションごとに 1 つのアクティブなプロンプトを保証する）。

リクエスト:

```json
{
  "prompt": [{ "type": "text", "text": "What does src/main.ts do?" }]
}
```

バリデーション: `prompt` は空でないオブジェクトの配列でなければならない。その他の失敗は、ブリッジに到達する前に `400` を返す。

レスポンス:

```json
{ "stopReason": "end_turn" }
```

その他の停止理由: `cancelled`、`max_tokens`、`error`、`length`（ACP 仕様に基づく）。

HTTP クライアントがプロンプトの途中で切断された場合、daemon は agent に ACP の `cancel` 通知を送信し、agent は `stopReason: "cancelled"` でプロンプトを終了する。
> **Stage 1 の制限 — サーバー側のプロンプトタイムアウトなし。** ブリッジは、エージェントの `prompt()` と `transportClosedReject`（エージェント子プロセスのクラッシュ）、および呼び出し元の HTTP 切断 AbortSignal のみを競合させます。応答が止まったが生きているエージェント（例: ハングするモデル呼び出し）は、HTTP クライアント側でタイムアウトして切断されるまで、セッションごとの FIFO をブロックします。長時間実行されるプロンプト（詳細なリサーチ、大規模コードベースの分析など）は正当なユースケースであるため、デフォルトのデッドラインは意図的に設定されていません。Stage 2 では、設定可能な `promptTimeoutMs` オプトインが公開される予定です。それまでは、呼び出し元で独自のクライアント側タイムアウトを設定し、期限切れ時に切断する（または `POST /session/:id/cancel` を呼び出す）必要があります。

### `POST /session/:id/cancel`

セッション上で**現在アクティブな**プロンプトをキャンセルします。ACP 側では、これはリクエストではなく通知です。エージェントは、アクティブな `prompt()` を `cancelled` で解決することで応答します。

```bash
curl -X POST http://127.0.0.1:4170/session/$SID/cancel
# → 204 No Content
```

> **マルチプロンプトの契約:** キャンセルはアクティブなプロンプトにのみ影響します。同じクライアントが以前に POST し、アクティブなプロンプトの後ろでキューイングされているプロンプトは引き続き実行されます。マルチプロンプトのキューイングはデーモンによって導入された動作（ACP 仕様には含まれません）であり、キューイングされたプロンプトの契約は「それぞれをキャンセルするか、チャネル終了でセッションを強制終了しない限り、実行を継続する」というものです。

### `DELETE /session/:id`

ライブセッションを明示的に閉じます。他のクライアントがアタッチされている場合でも強制閉鎖します。アクティブなプロンプトをキャンセルし、保留中のパーミッションをキャンセル済みとして解決し、`session_closed` イベントを発行し、EventBus を閉じ、デーモンマップからセッションを削除します。ディスクに永続化されたセッションは削除されません。`POST /session/:id/load` 経由で再読み込みできます。プリフライト: `caps.features.session_close`。

```bash
curl -X DELETE http://127.0.0.1:4170/session/$SID
# → 204 No Content
```

冪等性: 不明なセッションの場合は `404` を返します（他のルートと同じ `SessionNotFoundError` シェイプ）。

> **`session_closed` イベント。** SSE サブスクライバーは、ストリームが終了する前に、`{ sessionId, reason: 'client_close', closedBy?: '<clientId>' }` を含む終端の `session_closed` イベントを受信します。SDK リデューサーはこれを `session_died` と同一に扱います（`alive: false` を設定し、`pendingPermissions` をクリアします）。

### `PATCH /session/:id/metadata`

変更可能なセッションメタデータを更新します。現在は `displayName` のみをサポートします。プリフライト: `caps.features.session_metadata`。

リクエスト:

```json
{ "displayName": "My Investigation Session" }
```

| フィールド      | 必須 | 備考                                                                          |
| ------------- | -------- | ------------------------------------------------------------------------------ |
| `displayName` | いいえ       | 文字列、最大 256 文字。空の文字列は名前をクリアします。そのままにする場合は省略します。 |

レスポンス:

```json
{ "sessionId": "<uuid>", "displayName": "My Investigation Session" }
```

セッションの SSE ストリームで `{ sessionId, displayName }` を含む `session_metadata_updated` イベントを発行します。

### `POST /session/:id/heartbeat`

このセッションに対するデーモンの最終確認（last-seen）の記録を更新します。長寿命なアダプター（TUI/IDE/web）は、将来の失効ポリシー（Wave 5 PR 24）が死んだクライアントと静かなクライアントを区別できるように、一定間隔でこれを ping します。

ヘッダー:

| ヘッダー             | 必須 | 備考                                                                                                                                                                                                                                   |
| ------------------ | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `X-Qwen-Client-Id` | いいえ       | `POST /session` から発行されたデーモン ID をエコーします。識別されたクライアントはクライアントごとのタイムスタンプも更新しますが、匿名のハートビートはセッションごとのウォーターマークのみを更新します。他の場所と同じ `[A-Za-z0-9._:-]{1,128}` のシェイプを満たす必要があります。 |

リクエストボディは空です（`{}` で問題ありません。現在フィールドは読み取られません）。

レスポンス:

```json
{
  "sessionId": "<sid>",
  "clientId": "<cid>",
  "lastSeenAt": 1700000000123
}
```

`clientId` は、信頼された `X-Qwen-Client-Id` が提供された場合にのみエコーされます。`lastSeenAt` は、ブリッジが保存したデーモン側の `Date.now()` エポック（ミリ秒）です。

エラー:

- `400` — ヘッダーが不正な形式（ヘッダーシェイプルール）の場合、またはこのセッションに登録されていない `clientId` を含んでいる場合（ブリッジはタイムスタンプを更新する前に `InvalidClientIdError` をスローします）に `{ code: 'invalid_client_id' }`。
- `404` — 不明なセッション。

ケイパビリティゲーティング: プリフライト `caps.features.client_heartbeat`。古いデーモンはこのパスに対して `404` を返します。

### `POST /session/:id/model`

セッションに現在バインドされているモデルサービス**内で**アクティブなモデルを切り替えます。セッションごとのモデル変更キューを通じて直列化されます。

（_サービス_ 自体を切り替える場合 — Alibaba ModelStudio と OpenRouter など — 新しいセッションの `POST /session` で `modelServiceId` を渡します。Stage 1 にはライブサービス切り替えルートはありません。）

リクエスト:

```json
{ "modelId": "qwen-staging" }
```

レスポンス:

```json
{ "modelId": "qwen-staging" }
```

成功すると、SSE ストリームに `model_switched` を発行します。失敗すると、`model_switch_failed` を発行します（呼び出し元だけでなく、パッシブなサブスクライバーも失敗を確認できるようにするため）。エージェントチャネルの終了と競合するため、応答が止まった子プロセスが HTTP ハンドラーをブロックすることはありません。

### `POST /session/:id/recap`

ケイパビリティタグ: `session_recap`。ブリッジ → ACP extMethod `qwen/control/session/recap`。

セッションの「どこまで進んでいたか」を示す一文の要約を生成します。コアの `generateSessionRecap`（`packages/core/src/services/sessionRecap.ts`）をラップし、ツールを無効にして高速モデルに対してサイドクエリを実行します。`maxOutputTokens: 300`、厳密な `<recap>...</recap>` 出力形式です。サイドクエリはセッションの既存の GeminiClient チャット履歴を読み取り、それに追加することはありません。

リクエストボディは無視されます（`{}` または空を送信）。非厳密なミューテーションゲート — ポスチャーは `/session/:id/prompt` をミラーリングします（呼び出しはトークンを消費しますが、状態は変更しません）。SSE イベントは発行されません。

レスポンス (200):

```json
{
  "sessionId": "sess:42",
  "recap": "Debugging the auth retry race. Next: add deterministic timing to the integration test."
}
```

`recap` が `null`（エラーではなく通常の 200）になるのは以下の時です:

- セッションのダイアログターンがまだ 2 回未満の場合、
- サイドクエリが抽出可能な `<recap>...</recap>` ペイロードを返さなかった場合、
- 基盤となるモデルエラーが発生した場合（コアヘルパーはベストエフォートであり、スローすることはありません）。

エラー:

- `400 {code: 'invalid_client_id'}` — `X-Qwen-Client-Id` ヘッダーが不正な形式。
- `404` — 不明なセッション。

キャンセル: v1 では**なし**。ルートは HTTP クライアントの切断をリッスンせず、`AbortSignal` はブリッジに配管されず、ACP 子は呼び出し元が切断されたかどうかに関係なくサイドクエリを完了まで実行します。唯一の上限は、ブリッジの 60 秒のバックストップタイムアウト（`SESSION_RECAP_TIMEOUT_MS`）と、ACP チャネルの死に対する transport-closed の競合です。recap は短いため（単一試行、`maxOutputTokens: 300`、通常約 1〜5 秒）これは許容されます。帯域幅コストが正当化される場合は、将来のリリースでリクエスト ID ベースのキャンセル ext-method が完全なエンドツーエンドのキャンセルを配管できます。

### ミューテーション: approval, tools, init, MCP restart

Issue [#4175](https://github.com/QwenLM/qwen-code/issues/4175) Wave 4 PR 17 は、リモートクライアントがデーモンホストの CLI に触れずにランタイムポスチャーを変更できるようにする 4 つのミューテーション制御ルートを追加します。4 つすべて:

- PR 15 の**厳密な**ミューテーションゲートによってゲーティングされます。ベアラートークンなしで構成されたデーモンは、それらを `401 {code: 'token_required'}` で拒否します。オプトインする前に `--token`（または `QWEN_SERVER_TOKEN`）を構成してください。
- `X-Qwen-Client-Id` ヘッダー（PR 7 監査チェーン）を受け入れてスタンプします。ヘッダーが信頼された ID を含む場合、デーモンは対応する SSE イベントで `originatorClientId` を発行し、クロスクライアント UI が独自のミューテーションのエコーを抑制できるようにします。
- アフォーダンスを公開する前に、タグごとのケイパビリティをプリフライトします。古いデーモンはルートに対して `404` を返します。

4 つのルートのうち 3 つ（`tools/:name/enable`、`init`、`mcp/:server/restart`）は**ワークスペーススコープ**のイベントを発行します。ミューテーションがトリガーされたときにどのセッションがアタッチされていたかに関係なく、すべてのアクティブなセッション SSE バスがイベントを受信します。`approval-mode` は**セッションスコープ**のイベントを発行します。これは、変更が 1 つのセッションの `Config` にローカルなものだからです。

#### `POST /session/:id/approval-mode`

ケイパビリティタグ: `session_approval_mode_control`。ブリッジ → ACP extMethod `qwen/control/session/approval_mode`。

ライブセッションの承認モードを変更します。新しいモードは ACP 子のセッションごとの `Config` に即座に反映されます。設定はデフォルトではディスクに書き込まれません。`persist: true` を渡して、`tools.approvalMode` をワークスペース設定にも書き込みます。

リクエスト:

```json
{ "mode": "auto-edit", "persist": false }
```

`mode` は `'plan' | 'default' | 'auto-edit' | 'auto' | 'yolo'` のいずれかである必要があります（コアの `ApprovalMode` 列挙型のミラー。SDK はランタイム検証用に `DAEMON_APPROVAL_MODES` をエクスポートします）。`persist` のデフォルトは `false` です。

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
- `403 {code: 'trust_gate', errorKind: 'auth_env_error'}` — 要求されたモードは信頼されたフォルダを必要とします（信頼されていないワークスペースの特権モードは、コアの `Config.setApprovalMode` によって拒否されます）。
- `404` — 不明なセッション。

SSE イベント（セッションスコープ）: `{sessionId, previous, next, persisted, originatorClientId?}` を含む `approval_mode_changed`。

#### `POST /workspace/tools/:name/enable`

ケイパビリティタグ: `workspace_tool_toggle`。純粋なファイル IO — ACP ラウンドトリップなし。

ワークスペースの `tools.disabled` 設定リスト内のツール名を切り替えます。そこにリストされているツールは**一切登録されません**（ツールを登録したまま呼び出しを拒否する `permissions.deny` とは異なります）。組み込みツールと MCP 検出ツールの両方が `ToolRegistry.registerTool` を通過し、そこで無効化セットが参照されます。

> ⚠️ **名前はレジストリが公開する識別子と完全に一致する必要があります。** エイリアスの解決は行われません。ルートはパスパラメータにある文字列をそのまま `tools.disabled` に保存し、次の ACP 子が登録時に `tool.name` と比較します。組み込みツールは正規のレジストリ名（スネークケースの動詞形式）を使用します: `run_shell_command`, `read_file`, `write_file`, `list_directory`, `glob`, `grep_search`, `web_fetch` など — CLI が表示するラベル（`Shell`, `Read`, `Write`）ではありません。MCP 検出ツールは修飾された `mcp__<server>__<name>` 形式を使用します（これは `tool_toggled` イベントがブロードキャストする形式でもあり、`GET /workspace/mcp` がリストするものでもあります）。`Bash` を無効にしても、次のセッションで `run_shell_command` が登録されるのを防ぐことはできません。

ライブ ACP 子はすでに登録されたツールを保持します。切り替えは**次の** ACP 子プロセスの生成時に有効になります。MCP 由来のツールに対しては `POST /workspace/mcp/:server/restart` と組み合わせるか、新しいセッションを作成して、現在のデーモンで変更を有効にします。

不明なツール名も受け入れられます。まだインストールされていない MCP ツールを事前に無効化するのは正当なユースケースです。

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

ケイパビリティタグ: `workspace_init`。純粋なファイル IO — ACP ラウンドトリップなし、**LLM 呼び出しなし**。

デーモンがバインドされたワークスペースルートに空の `QWEN.md`（または `--memory-file-name` オーバーライドの下で `getCurrentGeminiMdFilename()` が返すもの）をスキャフォールディングします。機械的な操作のみです。AI 駆動のコンテンツ入力については、`POST /session/:id/prompt` を続けて実行してください。

デフォルトでは、ターゲットファイルが空白以外のコンテンツを含んで存在する場合、上書きを拒否します。空白のみのファイルは存在しないものとして扱われます（ローカルの `/init` スラッシュコマンドと一致します）。

リクエスト:

```json
{ "force": false }
```

レスポンス (200):

```json
{ "path": "/work/bound/QWEN.md", "action": "created" }
```

`action` は、新規作成の場合は `'created'`、既存の空白のみのファイルがそのままにされた（書き込みが実行されなかった）場合は `'noop'`、`force: true` によって空でないコンテンツが置き換えられた場合は `'overwrote'` になります。`workspace_initialized` SSE イベントはレスポンスアクションをミラーリングします。オブザーバーは `action !== 'noop'` でフィルタリングし、実際のディスク上の変更のみに反応できます。

エラー:

- `400 {code: 'invalid_force_flag'}` — `force` がブール値ではない。
- `409 {code: 'workspace_init_conflict', path, existingSize}` — ファイルが空白以外のコンテンツを含んで存在し、`force` が省略されているか false である。ボディには絶対パスとサイズ（バイト）が含まれるため、SDK クライアントは再 stat せずに「N バイトを上書きしますか？」プロンプトを表示できます。

SSE イベント（ワークスペーススコープ）: `{path, action, originatorClientId?}` を含む `workspace_initialized`。

#### `POST /workspace/mcp/:server/restart`

ケイパビリティタグ: `workspace_mcp_restart`。ブリッジ → ACP extMethod `qwen/control/workspace/mcp/restart`。

ACP 子の `McpClientManager.discoverMcpToolsForServer`（切断 + 再接続 + 再検出）を通じて、構成済みの MCP サーバーを再起動します。PR 14 v1 のアカウンティングからライブ予算スナップショットを事前チェックするため、予算が飽和したワークスペースでの再起動は、`BudgetExhaustedError` カスケードをトリガーするのではなく、ソフトな拒否を返します。

リクエストボディは空です（`{}`）。パスパラメータは、`mcpServers` 設定に表示される URL エンコードされたサーバー名です。

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

| `reason`                | 意味                                                                                                                                                                               |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `'in_flight'`           | このサーバーに対する別の検出/再起動がすでに進行中です。ルートは元の Promise を待機するのではなく即座に返ります。呼び出し元は短い遅延後に再試行する必要があります。 |
| `'disabled'`            | サーバーは構成されていますが、`excludedMcpServers` にリストされています。再起動前に再度有効にしてください。                                                                                                    |
| `'budget_would_exceed'` | デーモンが `--mcp-budget-mode=enforce` であり、ターゲットサーバーが現在 `reservedSlots` になく、ライブ合計が `clientBudget` に達しています。呼び出し元はまずスロットを解放する必要があります。         |

エラー (非 2xx):

- `400 {code: 'invalid_server_name'}` — パスパラメータが空。
- `404` — サーバー名が `mcpServers` 設定にない、またはライブ ACP チャネルが存在しない（再起動には本質的にライブの `McpClientManager` インスタンスが必要です）。
- `500` — 内部エラー（例: `ToolRegistry` が初期化されていない）。

SSE イベント（ワークスペーススコープ）: 成功時は `{serverName, durationMs, originatorClientId?}` を含む `mcp_server_restarted`。ソフトスキップ時は `{serverName, reason, originatorClientId?}` を含む `mcp_server_restart_refused`。

### `GET /session/:id/events` (SSE)

セッションのイベントストリームをサブスクライブします。

ヘッダー:

```
Accept: text/event-stream
Last-Event-ID: 42        ← オプション、id 42 の後からリプレイ
```

クエリパラメータ:

| パラメータ       | 必須 | 備考                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ----------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `maxQueued` | いいえ       | サブスクライバーごとの**ライブバックログ**上限。範囲 `[16, 2048]`、デフォルト 256。サブスクライブ時に強制プッシュされるリプレイフレームは上限から免除されます。実際にこれを消費するのは、サブスクライバーが大きな `Last-Event-ID: 0` リプレイをまだドレインしている間に到着するライブイベントです。コールド再接続時にバンプして、コンシューマーが追いつく前にライブテールがスロークライアント警告/エビクションをトリガーしないようにします。範囲外/非10進数/存在するが空の値は、SSE ハンドシェイクが開く前に `400 invalid_max_queued` を返します。プリフライト `caps.features.slow_client_warning` — 古いデーモンはこのパラメータをサイレントに無視します。 |

フレーム形式。`data:` 行は**完全なイベントエンベロープ**であり、1 行に JSON 文字列化されます — `{id?, v, type, data, originatorClientId?}`。ACP 固有のペイロード（`sessionUpdate`、`requestPermission` 引数など）はエンベロープの `data` フィールドの下に配置されます。エンベロープ自身の `type` は SSE の `event:` 行と一致します。

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

SSE レベルの `id:` / `event:` 行は、EventSource の互換性のために `envelope.id` / `envelope.type` を複製します。Raw-`fetch` コンシューマー（SDK の `parseSseStream`）は JSON エンベロープからすべてを読み取り、SSE プリアンブル行を無視します。

| イベントタイプ                | トリガー                                                                                                                                                                                                                                                                                                                  |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `session_update`          | 任意の ACP `sessionUpdate` 通知（LLM チャンク、ツール呼び出し、使用量）                                                                                                                                                                                                                                                     |
| `permission_request`      | エージェントがツールの承認を要求した                                                                                                                                                                                                                                                                                            |
| `permission_resolved`     | 一部のクライアントが `POST /permission/:requestId` 経由でパーミッションに投票した                                                                                                                                                                                                                                                      |
| `permission_partial_vote` | （コンセンサスのみ）投票が記録されたが、まだ定足数に達していない。`{requestId, sessionId, votesReceived, votesNeeded, quorum, optionTallies}` を含む。プリフライト `caps.features.permission_mediation`。                                                                                                                   |
| `permission_forbidden`    | 投票がアクティブなポリシーによって拒否された（`designated` の不一致、`local-only` の非ループバック、または `consensus` の投票者がスナップショットにいない）。`{requestId, sessionId, clientId?, reason}` を含む。プリフライト `caps.features.permission_mediation`。                                                                                 |
| `model_switched`          | `POST /session/:id/model` が成功した                                                                                                                                                                                                                                                                                      |
| `model_switch_failed`     | `POST /session/:id/model` が拒否された                                                                                                                                                                                                                                                                                       |
| `session_died`            | エージェント子プロセスが予期せずクラッシュした。**終端: このフレームの後に SSE ストリームが閉じます。セッションは `byId` から消えます。** サブスクライバーは `POST /session` 経由で再接続して新しいものを生成する必要があります。                                                                                                                              |
| `slow_client_warning`     | サブスクライバーローカル: キューが 75% 以上埋まっている。**非終端** — ストリームは継続します。警告はエビクション前の事前通知です。`{queueSize, maxQueued, lastEventId}` を含みます。オーバーフローエピソードごとに 1 回だけ発生し、キューが 37.5% 未満にドレインした後に再武装します。`id` なし（合成）。プリフライト `caps.features.slow_client_warning`。 |
| `client_evicted`          | サブスクライバーローカル: キューオーバーフロー。**終端: このフレームの後に SSE ストリームが閉じます**（`id` なし — 合成）。同じセッションの他のサブスクライバーは継続します。                                                                                                                                                                |
| `stream_error`            | ファンアウト中のデーモン側エラー。**終端: このフレームの後に SSE ストリームが閉じます**（`id` なし — 合成）。                                                                                                                                                                                                                |
再接続のセマンティクス:

- `Last-Event-ID: <n>` を送信して、セッションごとのリングから `id > n` のイベントをリプレイします（デフォルトの深さは **8000** で、`qwen serve --event-ring-size <n>` で調整可能）。
- **ギャップの検出（クライアント側）:** `<n>` がリング内に残っている最も古いイベントよりも前の場合（例: `Last-Event-ID: 50` で再接続したが、リングには現在 200～1199 しか保持されていない）、デーモンは例外をスローせずに利用可能な最も古いイベントからリプレイします。最初のリプレイされたイベントの `id` を `n + 1` と比較し、その差分が失われたウィンドウのサイズとなります。Stage 2 ではデーモン側で明示的な `stream_gap` 合成フレームが注入されますが、Stage 1 では検出はクライアントの責任となります。
- ID はセッションごとに単調増加であり、1 から始まります。
- 合成フレーム（`client_evicted`、`slow_client_warning`、`stream_error`）は、他のサブスクライバーのシーケンススロットを消費しないように意図的に `id` を省略しています。

バックプレッシャー:

- サブスクライバーごとのキューのデフォルトは `maxQueued: 256` のライブアイテムです（再接続時のリプレイフレームはこの上限をバイパスします）。SSE リクエストで `?maxQueued=N`（範囲 `[16, 2048]`）を指定してオーバーライドできます。
- サブスクライバーのキューが 75% を超えると、バスはそのサブスクライバーに `slow_client_warning` 合成フレームを強制プッシュします（オーバーフローのエピソードごとに 1 回。37.5% 未満に排出された後に再武装されます）。ストリームはオープンされたままです。この警告は、クライアントがより速く排出するか、クリーンにデタッチして再接続するための事前通知です。
- キューが実際にオーバーフローした場合、バスは `client_evicted` 終端フレームを発行し、サブスクリプションを閉じます。

### `POST /permission/:requestId`

保留中の `permission_request` に投票します。アクティブな **調停ポリシー** が勝者を決定します。

| ポリシー                      | 動作                                                                                                                                                                                              |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `first-responder` (デフォルト) | 検証済みの投票者が勝者となります。後続の投票者は `404` を受け取ります。F3 以前のベースライン。                                                                                                                                    |
| `designated`                | プロンプトの発信者（`originatorClientId`）のみが決定します。発信者以外は `403 permission_forbidden / designated_mismatch` を受け取ります。匿名プロンプトの場合は first-responder にフォールバックします。                 |
| `consensus`                 | M 人中 N 人の投票者が合意する必要があります（デフォルトは `N = floor(M/2) + 1` で、`policy.consensusQuorum` でオーバーライド可能）。最初に `N` に達したオプションが勝者となります。未解決の投票は `200` と `permission_partial_vote` SSE フレームを受け取ります。 |
| `local-only`                | ループバックの投票者のみが決定します。リモート呼び出し元は `403 permission_forbidden / remote_not_allowed` を受け取ります。                                                                                                      |

アクティブなポリシーは `settings.json` の `policy.permissionStrategy` で設定され、`/capabilities` の `body.policy.permission` で公開されます。ビルドでサポートされているセットについては、プリフライトの `caps.features.permission_mediation`（`modes: [...]` 付き）を参照してください。

> **F3 (#4175): マルチクライアントのパーミッション調整。** F3 では上記の 4 つのポリシーが追加されました。F3 以前のデーモンは first-responder がハードコードされていましたが、設定されたポリシーが `first-responder` の場合、ワイヤー上の形状はビット単位で一切変更されません。新しいイベント（`permission_partial_vote`、`permission_forbidden`）は追加的なものであり、古い SDK はこれらを `unrecognized_known_event` として認識し、安全に無視します。

> **パーミッションのタイムアウト（デフォルト 5 分）。** `permission_request` は、以下のいずれかが発生するまで保留状態のままです。(a) 何らかのクライアントがここで投票する、(b) `POST /session/:id/cancel` が発行される、(c) プロンプトを駆動している HTTP クライアントが切断される（プロンプト中のキャンセルは未解決のパーミッションを `cancelled` として解決します）、(d) セッションがキルされる、(e) デーモンがシャットダウンする、**または (f) セッションごとのパーミッションタイムアウトが発生する**（`DEFAULT_PERMISSION_TIMEOUT_MS`、5 分）です。タイムアウトが発生すると、エージェントの `requestPermission` は `{outcome: 'cancelled'}` として解決され、監査リングに `permission.timeout` エントリが記録され、デーモンの stderr に 1 行のパンくずが出力され、SSE バスは標準の `permission_resolved` cancelled フレームをファンアウトしてサブスクライバーがクリーンアップできるようにします。タイムアウトは `BridgeOptions.permissionResponseTimeoutMs` で設定可能です。長時間のプロンプトを実行するヘッドレス呼び出し元は、これを延長することをお勧めします。

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
- `{ "outcome": "cancelled" }` — リクエストを破棄します（内部的に `cancelSession` / `shutdown` が行う動作と一致）

レスポンス:

- `200 {}` — 投票が受け入れられました（解決済み、またはコンセンサス定足数に基づいて記録済み）
- `403 { "code": "permission_forbidden", "reason": "designated_mismatch" | "remote_not_allowed", "requestId", "sessionId" }` — F3: アクティブなポリシーが投票を拒否しました
- `404 { "error": "..." }` — requestId が不明です（すでに解決済み、存在しなかった、またはセッションが破棄された）
- `500 { "code": "cancel_sentinel_collision", ... }` — F3: エージェントの `allowedOptionIds` に予約済みのセンチネル `'__cancelled__'` が含まれています。エージェント/デーモン間の契約違反です
- `501 { "code": "permission_policy_not_implemented", "policy": "<name>" }` — F3 の前方互換性: ポリシーリテラルがスキーマに追加されましたが、その調停ブランチはまだビルドされていません（現在到達不能。将来のポリシー用に予約）

投票が成功した後、接続されているすべてのクライアントは、同じ `requestId` と選択された `outcome` を持つ `permission_resolved` を確認します。`consensus` の場合、定足数に達するまで中間投票が追加で `permission_partial_vote` をファンアウトします。

### Auth device-flow ルート (issue #4175 PR 21)

デーモンは OAuth 2.0 Device Authorization Grant（RFC 8628）を仲介し、リモート SDK クライアントがログインをトリガーできるようにします。この際、トークンはクライアントではなく **デーモン** のファイルシステムに保存されます。デーモン自身が IdP をポーリングし、クライアントの役割は検証 URL とユーザーコードを表示し、（オプションで）完了イベントの SSE をサブスクライブすることだけです。

ケイパビリティタグ: `auth_device_flow`（常にアドバタイズされます）。v1 でサポートされているプロバイダー: `qwen-oauth`。

> [!note]
>
> Qwen OAuth の無料枠は 2026-04-15 に廃止されました。このプロトコルでは `qwen-oauth` をレガシーな v1 プロバイダー識別子として扱ってください。新しいクライアントは、現在サポートされている認証プロバイダーが利用可能な場合、そちらを優先すべきです。

**ランタイムのローカリティ。** デーモンは、可能であってもブラウザを起動することはありません。クライアントがローカルで `open(verificationUri)` を呼び出すかどうかを決定します。ヘッドレス Pod（標準的な Mode B デプロイメント）では、ユーザーはブラウザを持っている任意のデバイスで URL を開きます。推奨される UX については `docs/users/qwen-serve.md` を参照してください。

**イベントにおけるトークンの漏洩なし。** `auth_device_flow_started` は `{deviceFlowId, providerId, expiresAt}` のみを含みます。ユーザーコードと検証 URL は、POST 201 のボディおよび `GET /workspace/auth/device-flow/:id` 経由でポイントツーポイントで返されます。SSE でブロードキャストされることはありません。

**プロバイダーごとのシングルトン。** フローが保留中に同じプロバイダーに対して 2 回目の `POST` を行うと、冪等な引き継ぎとなります。新しい IdP リクエストを開始するのではなく、既存のエントリを `attached: true` として返します。

#### `POST /workspace/auth/device-flow`

厳格な変更ゲート: トークンなしのループバックデフォルトであっても、Bearer トークンを要求します（`401 token_required`）。

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

- `400 unsupported_provider` — 不明な `providerId` です（レスポンスに `supportedProviders` が含まれます）
- `409 too_many_active_flows` — ワークスペースの上限（4）に達しました。`DELETE` で 1 つキャンセルしてください
- `401 token_required` — 厳格なゲートがトークンなしのリクエストを拒否しました
- `502 upstream_error` — IdP が予期しないエラーを返しました

#### `GET /workspace/auth/device-flow/:id`

現在の状態を読み取ります。保留中のエントリは `userCode/verificationUri/expiresAt/intervalMs` をエコーバックします。終端エントリ（5 分の猶予期間）はこれらを破棄し、`status` とオプションの `errorKind/hint` を公開します。

不明な ID および猶予期間後に削除されたエントリに対しては `404 device_flow_not_found` を返します。

#### `DELETE /workspace/auth/device-flow/:id`

冪等なキャンセル:

- 保留中のエントリ → `204` + `auth_device_flow_cancelled` を発行
- 終端エントリ → `204` ノーオペレーション（イベントの再発行なし）
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

#### Device-flow SSE イベント

5 つの型付きイベント（ワークスペーススコープ、アクティブなすべてのセッションバスにファンアウト）:

- `auth_device_flow_started` `{deviceFlowId, providerId, expiresAt}` — POST が成功しました。SDK はサブスクライブする必要があります（ここに userCode は含まれないため、必要に応じて GET で取得してください）
- `auth_device_flow_throttled` `{deviceFlowId, intervalMs}` — デーモンがアップストリームの `slow_down` を尊重しました。GET をポーリングしているクライアントは、間隔をこれに合わせて延長する必要があります
- `auth_device_flow_authorized` `{deviceFlowId, providerId, expiresAt?, accountAlias?}` — 認証情報が永続化されました。`accountAlias` は非 PII のラベルです（メールや電話番号は含まれません）
- `auth_device_flow_failed` `{deviceFlowId, errorKind, hint?}` — 終端状態です。`errorKind` は `expired_token | access_denied | invalid_grant | upstream_error | persist_failed` のいずれかです。`persist_failed` はデーモン内部のエラーです。IdP との交換には成功しましたが、デーモンが認証情報を永続的に保存できませんでした（EACCES / EROFS / ENOSPC）。ユーザーは、基盤となるディスクの状態が修正された後に再試行する必要があります。
- `auth_device_flow_cancelled` `{deviceFlowId}` — 保留中のエントリに対して DELETE が成功しました

> **MCP 非互換。** MCP 認証仕様（2025-06-18）は、リダイレクトコールバックを伴う OAuth 2.1 + PKCE 認証コードを義務付けており、これはヘッドレス Pod のデーモンでは機能しません。Mode B の device-flow サーフェスはデーモンプライベートです。MCP 準拠のサーバーをターゲットとするクライアントは、別の認証パスを使用する必要があります。

## ストリーミングのワイヤーフォーマット

イベントは標準の EventSource フレームとして発行されます。デーモンはフレームごとに 1 行の `data:` を書き込みます（JSON は `JSON.stringify` 後に埋め込み改行を含みません）。`packages/sdk-typescript/src/daemon/sse.ts` にある SDK パーサーは、それと、仕様で許可されている複数の `data:` 形式の両方を受信側で処理します。

## ストリーミング中のエラーフレーム

SSE サブスクライバーへのサービス提供中にブリッジイテレーターがスローされた場合、デーモンは終端の `stream_error` フレーム（`id` なし）を発行します。`data:` 行は完全なエンベロープです（このドキュメント内の他のすべての SSE フレームと同じ形状）。実際のエラーメッセージは `envelope.data.error` に格納されています。

```
event: stream_error
data: {"v":1,"type":"stream_error","data":{"error":"<message>"}}
```

その後、接続は閉じられます。

## 環境変数

| 変数                 | 目的                                                        |
| ------------------- | -------------------------------------------------------------- |
| `QWEN_SERVER_TOKEN` | Bearer トークン。起動時に先頭と末尾の空白が削除されます。 |

## ソースレイアウト

| パス                                                 | 目的                                                                                                    |
| ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `packages/cli/src/commands/serve.ts`                 | yargs コマンド + フラグスキーマ                                                                                |
| `packages/cli/src/serve/run-qwen-serve.ts`           | リスナーのライフサイクル + シグナルハンドリング                                                                       |
| `packages/cli/src/serve/server.ts`                   | Express アプリケーションのアセンブリ、ミドルウェアの順序、および残りのダイレクトルート                                     |
| `packages/cli/src/serve/routes/*.ts`                 | セッション、SSE、ワークスペース認証、ワークスペースステータス、ファイルルートなど、焦点を絞った Express ルートグループ    |
| `packages/cli/src/serve/auth.ts`                     | Bearer + ホスト許可リスト + CORS 拒否                                                                        |
| `packages/cli/src/serve/acp-session-bridge.ts`       | spawn-or-attach、セッションごとの FIFO、およびパーミッションレジストリのための CLI ローカルブリッジ互換性ファサード       |
| `packages/acp-bridge/src/status.ts`                  | 読み取り専用のデーモンステータスワイヤー型 + `ServeErrorKind` + `BridgeTimeoutError` + `mapDomainErrorToErrorKind` |
| `packages/cli/src/serve/env-snapshot.ts`             | 認証情報のリダクションを含め、`process.*` 状態から `/workspace/env` ペイロードを構築する純粋なヘルパー   |
| `packages/acp-bridge/src/eventBus.ts`                | 境界付き非同期キュー + リプレイリング                                                                          |
| `packages/sdk-typescript/src/daemon/DaemonClient.ts` | TS クライアント                                                                                                  |
| `packages/sdk-typescript/src/daemon/sse.ts`          | EventSource フレームパーサー                                                                                   |
| `integration-tests/cli/qwen-serve-routes.test.ts`    | 18 ケース、LLM なし                                                                                           |
| `integration-tests/cli/qwen-serve-streaming.test.ts` | 3 ケース、ローカルのフェイク OpenAI サーバーでバックアップされた実際の `qwen --acp` 子プロセス（POSIX のみ。Windows ではスキップ）   |