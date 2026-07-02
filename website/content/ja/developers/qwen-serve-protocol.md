# `qwen serve` HTTP プロトコルリファレンス

[qwen-code daemon design](https://github.com/QwenLM/qwen-code/issues/3803) の Stage 1。すべてのルートは daemon のベース URL（デフォルト `http://127.0.0.1:4170`）配下に存在します。

## 認証

daemon が `--token` または `QWEN_SERVER_TOKEN` を指定して起動された場合、ループバックバインドの `/health` を除く**すべてのルート**で、以下のヘッダーが必要です。

```
Authorization: Bearer <token>
```

トークンが設定されていない場合（ループバック開発時のデフォルト）、このヘッダーは任意です。トークンの比較は定数時間で行われます。401 レスポンスは、`ヘッダーなし` / `スキーム不正` / `トークン不正` のいずれの場合でも同一の形式になります。

**`/health` の例外** (Bctum): ループバックバインド（`127.0.0.1` / `localhost` / `::1` / `[::1]`）では、`/health` は bearer ミドルウェア**より前**に登録されるため、daemon が `--token` 付きで起動された場合でも、Pod 内の liveness プローブはトークンを送信する必要がありません。非ループバックバインド（`--hostname 0.0.0.0` など）では、他のルートと同様に `/health` も bearer 認証で保護されます。理由については [`GET /health`](#get-health) セクションを参照してください。

**`--require-auth` (#4175 PR 15)。** 起動時にこのフラグを渡すと、「トークン必須」ルールがループバックにも適用されます。トークンなしでは起動に失敗し、`/health` の例外も無効になります（つまり、`/health` にも `Authorization: Bearer …` が必要になります）。

このフラグが有効な場合、グローバルな `bearerAuth` ミドルウェアが `/capabilities` を含む**すべての**ルートを保護します。そのため、**未認証**のクライアントは `caps.features` を事前確認して認証が必要かどうかを検出できません。この場合の検出手段は、（[認証](#authentication) セクションに従いすべてのルートで統一されている）**401 レスポンスボディ**自体になります。`require_auth` ケーパビリティタグは**認証後の確認**です。クライアントが正常に認証され `/capabilities` を読み取ると、このタグの存在によって daemon が `--require-auth` で起動されたことが確認できます（監査/コンプライアンス UI や、SDK クライアントが設定パネルで「このデプロイメントは強化されています」と表示するのに便利です）。ルートごとの厳格モードにオプトインしているミューテーションルート（Wave 4 のフォローアップ）は、トークンなしのループバックデフォルトに到達すると `401 { code: "token_required", error: "…" }` で拒否します。しかし、`--require-auth` が有効な場合、グローバルな bearer ミドルウェアがルートごとのゲートより前にリクエストをショートサーキットするため、未認証の呼び出し元が実際に目にするのは従来の `Unauthorized` ボディです。

**`--allow-origin <pattern>` (T2.4 [#4514](https://github.com/QwenLM/qwen-code/issues/4514))。** daemon に対してクロスオリジンでリクエストを行うブラウザの Web UI は、デフォルトでブロックされます。`Origin` ヘッダーを含むリクエストは、CLI/SDK クライアントが `Origin` を送信せず、daemon がその存在をオペレーターがオプトインしていないブラウザコンテキストからのリクエストとみなすため、`403 {"error":"Request denied by CORS policy"}` を返します。起動時に `--allow-origin <pattern>`（繰り返し指定可能）を渡すと、ブロックの代わりに許可リストがインストールされます。各パターンは以下のいずれかです。

- リテラル `*` — 任意のオリジンを許可します。**リスクあり**: `*` が設定されているにもかかわらず bearer トークンが設定されていない場合（`--token`、`QWEN_SERVER_TOKEN`、または起動時にトークンを必須とする `--require-auth` のいずれかのソース）、起動は拒否されます。`*` がリストに含まれている場合、起動時のパンくず（ログ）で stderr に警告が出力されます。**推奨**: ループバックバインドでは `--require-auth` と組み合わせて、`/health` と `/demo` も bearer で保護されるようにします。これらはデフォルトでループバックにおいて bearer ミドルウェアより前に登録されるため（k8s/Compose プローブがトークンなしで `/health` に到達できるように）、`*` 許可リストはそれらを任意のクロスオリジンブラウザから到達可能にしてしまいます。非ループバックバインドでは bearer が起動時にすでに必須となっているため、`*` による公開対象は `/health`（ステータス JSON）と `/demo`（JS がトークン保護されたルートを呼び出す静的ページ）のみであり、実際の API 表面は保護されています。
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

`Access-Control-Allow-Origin` は、`*` パターン下であっても、リテラルの `*` ではなく、リクエストのオリジンをそのまま（ブラウザが送信した通りの大文字/小文字で）エコーバックします。ブラウザキャッシュはこれと `Vary: Origin` のペアでレスポンスをキーとするため、エコーバックすることで、スキーマ変更なしに将来のリリースで `Access-Control-Allow-Credentials` を追加する余地が残ります。`Access-Control-Expose-Headers: Retry-After` により、ブラウザの Web UI は daemon からの `429` / `503` レスポンスのリトライヒントに従うことができます。`Access-Control-Allow-Credentials` は現在**送信されません**。daemon は `Authorization` 内の bearer で認証を行うため、`credentials: 'include'` なしでクロスオリジンで機能します。

OPTIONS プリフライトリクエスト（`Access-Control-Request-Method` または `Access-Control-Request-Headers` を含む OPTIONS）は、`204 No Content` と上記のヘッダーでショートサーキットされます。これは従来の CORS パターンであり安全です。プリフライトは daemon がどのメソッド/ヘッダーを受け入れるかを確認するだけで、実際の後続リクエストは引き続きフルチェーン（ホスト許可リスト → bearer 認証 → ルート）を実行するため、Anti-DNS-rebinding と bearer 強制は状態が読み書きされる前に引き続き機能します。一致したオリジンからのプレーンな OPTIONS リクエストは、CORS ヘッダーが付加されたまま下流に流れます。

許可リストに一致しないオリジンも `403 {"error":"Request denied by CORS policy"}` を受け取ります。デフォルトのブロックと同じエンベロープであるため、すでにブロックのレスポンスを解析しているクライアントは、許可リストがデプロイされた daemon を特別扱いする必要がありません。拒否パスでは `Access-Control-*` ヘッダーは**出力されません**（ブラウザは無視しますし、出力するとヘッダーの存在を通じて許可リストのサイズを間接的に公開してしまうため）。

設定されたパターンリストは意図的に `/capabilities` でエコーバック**されません**。ブラウザの Web UI はすでに自身のオリジンを知っている（daemon を呼び出したわけですから）であり、リストを公開すると `/capabilities` の未認証リーダーが信頼されたオリジンをすべて列挙できてしまうためです（設定ミスのあるデプロイメントに対する有用な偵察行為となります）。SDK クライアントは、特定のオリジンを知る必要なく、「この daemon はクロスオリジンのブラウザヒットを許可する」という意味で `caps.features.allow_origin` タグに基づいてゲートします。

ループバックのセルフオリジンリクエスト（例: `/demo` ページが同じ `127.0.0.1:port` の daemon を呼び出す場合）は、CORS ミドルウェア**より前**に実行され、`127.0.0.1:port` / `localhost:port` / `[::1]:port` / `host.docker.internal:port` の `Origin` ヘッダーを削除する**別の** Origin ストリップシムによって処理されます。したがって、これらは `--allow-origin` の設定に関係なく通過します。オペレーターは、デモページを機能させるために daemon 自身のポートをリストする必要はありません。

## 共通のエラー形式

5xx レスポンスは、存在する場合、元のエラーの `code` と `data` を保持します（JSON-RPC スタイル — ACP SDK はエージェントから `{code, message, data}` を転送します）。

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

不明なセッション ID の場合の `SessionNotFoundError` は以下を返します。

```json
{ "error": "No session with id \"<sid>\"", "sessionId": "<sid>" }
```

ステータスは `404` です。

daemon のバインドされたワークスペースに正規化されない `cwd` を持つ `POST /session` の場合の `WorkspaceMismatchError`（#3803 §02 — 1 daemon = 1 ワークスペース）は、`400` と以下を返します。

```json
{
  "error": "Workspace mismatch: daemon is bound to \"…\" but request asked for \"…\". …",
  "code": "workspace_mismatch",
  "boundWorkspace": "/path/the/daemon/binds",
  "requestedWorkspace": "/path/in/the/request"
}
```

これを使用して、事前にミスマッチを検出します。`/capabilities` から `workspaceCwd` を読み取り、`POST /session` から `cwd` を省略するか（バインドされたワークスペースにフォールバックします）、`requestedWorkspace` にバインドされた daemon にリクエストをルーティングします。

daemon の `--max-sessions` 上限を超えた `POST /session` は、`Retry-After: 5` ヘッダーと `503` を返します。

```json
{
  "error": "Session limit reached (20)",
  "code": "session_limit_exceeded",
  "limit": 20
}
```

既存のセッションへのアタッチは上限にカウントされないため、アイドル状態の daemon への再接続は、キャパシティに達している場合でも機能し続けます。

`RestoreInProgressError` — `POST /session/:id/load` と `POST /session/:id/resume` からのみ発行され、`Retry-After: 5` ヘッダー（`session_limit_exceeded` と同じ）と `409` を返します。

```json
{
  "error": "Session \"<sid>\" is already being restored via session/<resume|load>; retry session/<load|resume> after it completes",
  "code": "restore_in_progress",
  "sessionId": "<sid>",
  "activeAction": "load",
  "requestedAction": "resume"
}
```

すでに `session/resume` が進行中の ID に対して `session/load` が発行された場合（またはその逆）に発生します。少なくとも `Retry-After` 秒待ってからリトライしてください。基礎となるリストアは `initTimeoutMs`（デフォルト 10 秒）以内に完了します。同じアクションの競合（`load` 対 `load`、`resume` 対 `resume`）は、エラーになる代わりに統合（coalesce）されます。

`SessionArchivedError` は、呼び出し元が `chats/archive/` 配下にある JSONL を持つセッションをロードまたはレジュームしようとしたときに発行されます。

```json
{
  "error": "Session \"<sid>\" is archived. Unarchive it before loading.",
  "code": "session_archived",
  "sessionId": "<sid>"
}
```

ステータスは `409` です。

`SessionArchivingError` は、同じ ID に対してセッションのアーカイブまたはアーカイブ解除の遷移がすでに進行中の場合に発行されます。

```json
{
  "error": "Session \"<sid>\" is being archived or unarchived; retry later.",
  "code": "session_archiving",
  "sessionId": "<sid>"
}
```

ステータスは `409` で、`Retry-After: 5` が付加されます。

## ケーパビリティ

daemon は、serve ケーパビリティレジストリからサポートされている機能タグを公開します。クライアントは、UI のゲートを `mode` ではなく `features` に基づいて行う**必要があります**（デザイン §10 に従う）。

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
 'session_close', 'session_metadata', 'session_archive', 'mcp_guardrails',
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

`session_scope_override` は、`POST /session` のリクエストごとの `sessionScope` フィールドのネゴシエーションハンドルです（以下を参照）。古い daemon はこのフィールドを無視するため、SDK クライアントは送信前にこのタグの `caps.features` を事前確認する必要があります。

`session_load` と `session_resume` は、明示的なリストアルート（`POST /session/:id/load` と `POST /session/:id/resume`）を公開します。古い daemon はこれらのパスに対して `404` を返すため、SDK クライアントは呼び出す前に `caps.features` を事前確認する必要があります。`unstable_session_resume` は、基礎となる ACP メソッドが `connection.unstable_resumeSession` という名前であった間にリリースされた SDK との互換性のために、非推奨のエイリアスとして引き続き公開されます。新しいクライアントは `session_resume` でゲートする必要があります。

`slow_client_warning` は、#4175 Wave 2.5 PR 10 で同時にリリースされた 2 つの SSE バックプレッシャーノブをカバーします。(a) daemon は、サブスクライバーのキューが 75% 満杯を超えたときに `slow_client_warning` 合成イベントストリームフレームを出力します（オーバーフローエピソードごとに 1 回、キューが 37.5% 未満に排出された後に再武装されます）。(b) `GET /session/:id/events` は `?maxQueued=N` クエリパラメータ（範囲 `[16, 2048]`）を受け付け、大きなリプレイリングに対するコールド再接続時のサブスクライバーごとのバックログを事前にサイズ設定します。daemon 全体のリングサイズは `--event-ring-size`（デフォルト **8000**、#3803 §02 に従う）によって制御されます。古い daemon は両方をサイレントに欠いているため、オプトインする前にこのタグを事前確認してください。

`typed_event_schema` は、SDK の `KnownDaemonEvent` スキーマに一致する daemon イベントペイロードを公開します。古い daemon は引き続き互換性のあるフレームをストリーミングする可能性がありますが、SDK クライアントは型付きイベントのカバレッジを想定する前にこのタグを事前確認する必要があります。

`client_heartbeat` は `POST /session/:id/heartbeat` を公開します。古い daemon は `404` を返すため、定期ハートビートを発行する前にこのタグを事前確認してください。

`session_close` と `session_metadata` は `DELETE /session/:id` と `PATCH /session/:id/metadata` を公開します。古い daemon は `404` を返すため、close または rename 機能を提供する前にこれらのタグを事前確認してください。

`session_archive` は v1 ディレクトリ状態アーカイブ API（`POST /sessions/archive`、`POST /sessions/unarchive`、および `GET /workspace/:id/sessions?archiveState=active|archived`）を公開します。アーカイブされたセッションは、アーカイブ解除されるまでロードまたはレジュームできません。

`session_lsp` は `GET /session/:id/lsp`（daemon クライアント用の読み取り専用構造化 LSP ステータススナップショット）を公開します。古い daemon は `404` を返すため、リモート LSP ステータスを提供する前にこのタグを事前確認してください。

`session_status` は `GET /session/:id/status`（ID ごとの単一セッションのライブブリッジサマリー（`clientCount` / `hasActivePrompt` およびコアフィールド））を公開します。古い daemon は `404` を返すため、完全なセッションリストをスキャンする代わりに単一セッションのステータスをポーリングする前にこのタグを事前確認してください。

`session_approval_mode_control`、`workspace_tool_toggle`、`workspace_init`、および `workspace_mcp_restart`（issue [#4175](https://github.com/QwenLM/qwen-code/issues/4175) PR 17）は、以下の「ミューテーション: 承認、ツール、初期化、MCP 再起動」で文書化されている 4 つのミューテーション制御ルートを公開します。4 つすべては、PR 15 のミューテーションゲートによって厳密にゲートされています（bearer トークンなしで設定された daemon は、それらを 401 `token_required` で拒否します）。古い daemon は `404` を返すため、対応する機能を提供する前に各タグを事前確認してください。

`mcp_guardrails`（issue [#4175](https://github.com/QwenLM/qwen-code/issues/4175) PR 14）は、MCP バジェット表面をカバーします。`GET /workspace/mcp` の `clientCount` / `clientBudget` / `budgetMode` / `budgets[]` フィールド、サーバーごとのセルの `disabledReason` フィールド、および `--mcp-client-budget` / `--mcp-budget-mode` CLI フラグです。古い daemon は新しいフィールドを完全に省略するため、SDK クライアントは `budgets[]` セマンティクスに依存する前にこのタグを事前確認します。レジストリ記述子は、将来の機能モード公開のために `modes: ['warn', 'enforce']` も保持します。今のところ、クライアントはスナップショットの `budgetMode` フィールドからモードを推測します。`enforce` モードでのサーバーの拒否は、`Object.entries(mcpServers)` の宣言順序によって決定的です。将来のスコープ優先順位レイヤー（qwen-code が採用する場合）は、claude-code の `plugin < user < project < local` 規則を反映させるために、これを「最低優先順位から」にシフトさせます。

> ⚠️ **PR 14 v1 スコープ: ワークスペースごとではなく、セッションごと。** daemon 内の各 ACP セッションは、独自の `Config` + `McpClientManager` を構築します（`acpAgent.newSessionConfig` 経由）。バジェットキャップは**セッションごと**にライブ MCP クライアントを制限します。各セッションは、転送された env から `QWEN_SERVE_MCP_CLIENT_BUDGET` を独立して読み取ります。`--mcp-client-budget=10` で 5 つの同時 ACP セッションがある場合、daemon 全体の実際のライブ MCP クライアント数は 5 × 10 = 50 に達する可能性があります。`GET /workspace/mcp` スナップショットは、**ブートストラップセッションの** `McpClientManager` アカウンティングのみを読み取ります。`budgets[0].scope: 'session'` 値は、これが集約ではなくセッションごとであることを示す正直なシグナルです。**Wave 5 PR 23（共有 MCP プール）** は、ワークスペーススコープのマネージャーを導入し、真のクロスセッション集計のためにセッションごとのセルの横に `scope: 'workspace'` セルを追加します。v1 は、PR 23 が構築するプロセス内カウンター + ソフト強制の基盤です。

`workspace_file_read` は、テキスト/リスト/統計/glob ワークスペースファイルルート（`GET /file`、`GET /list`、`GET /glob`、`GET /stat`）をカバーします。`workspace_file_bytes` は `GET /file/bytes` をカバーし、これは後で追加されたもので、クライアントが PR19 時代の daemon に対して生のバイトウィンドウサポートを事前確認できるようにします。`workspace_file_write` は、ハッシュ対応のテキストミューテーションルート（`POST /file/write`、`POST /file/edit`）をカバーします。write タグはルート契約が存在することを意味しますが、現在のデプロイメントが匿名のミューテーションに対してオープンであることを意味するものではありません。write/edit は厳密なミューテーションルートであり、ループバックでも設定された bearer トークンを必要とします。

`daemon_status` は `GET /daemon/status`（以下で文書化されている統合された読み取り専用オペレーター診断スナップショット）を公開します。

**条件付きタグ。** 少数の機能タグは、一致するデプロイメントトグルがオンの場合にのみ公開されます。タグの存在 = 動作がオン。不在 = タグより前の古い daemon、またはオペレーターがオプトインしていない現在の daemon のいずれかです。現在:

| Tag                        | Advertised when …                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `require_auth`             | daemon が `--require-auth`（または埋め込み API 経由で `requireAuth: true`）で起動された場合。ループバックバインドの `/health` を含むすべてのルートで bearer トークンが必須。                                                                                                                                                                                                                                                                                                                                    |
| `mcp_workspace_pool`       | 共有 MCP トランスポートプールがアクティブな場合。`QWEN_SERVE_NO_MCP_POOL=1` でプールが無効になっている場合は省略。                                                                                                                                                                                                                                                                                                                                                                                             |
| `mcp_pool_restart`         | 共有 MCP トランスポートプールがアクティブな場合。再起動レスポンスにプール対応のマルチエントリシェープが含まれる可能性があります。                                                                                                                                                                                                                                                                                                                                                                                                           |
| `allow_origin`             | T2.4 ([#4514](https://github.com/QwenLM/qwen-code/issues/4514))。daemon が少なくとも 1 つの `--allow-origin <pattern>`（または埋め込み API 経由で `allowOrigins: [...]`）で起動された場合。一致したオリジンからのクロスオリジンリクエストは適切な CORS レスポンスヘッダーを受け取ります。一致しないオリジンはデフォルトの 403 を受け取ります。設定されたパターンリストは、信頼されたオリジンセットを未認証のリーダーに漏らさないように意図的に `/capabilities` でエコーバック**されません**。ブラウザの Web UI はすでに自身のオリジンを知っています。 |
| `prompt_absolute_deadline` | `--prompt-deadline-ms` / `QWEN_SERVE_PROMPT_DEADLINE_MS` / `ServeOptions.promptDeadlineMs` が正の整数に設定されている場合。                                                                                                                                                                                                                                                                                                                                                                                        |
| `writer_idle_timeout`      | `--writer-idle-timeout-ms` / `QWEN_SERVE_WRITER_IDLE_TIMEOUT_MS` / `ServeOptions.writerIdleTimeoutMs` が正の整数に設定されている場合。                                                                                                                                                                                                                                                                                                                                                                             |
| `workspace_settings`       | daemon が設定の永続化が利用可能な状態で作成された場合。                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `session_shell_command`    | セッションシェル実行が明示的に有効になっている場合。                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `rate_limit`               | `--rate-limit` / `QWEN_SERVE_RATE_LIMIT=1` / `ServeOptions.rateLimit` が有効になっている場合。                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `workspace_reload`         | 埋め込みルート設定でワークスペースのリロードサポートが利用可能な場合。                                                                                                                                                                                                                                                                                                                                                                                                                                      |
`mcp_guardrails` はこの条件付きテーブルには含まれて**いません**。これは常に有効なタグであり、オペレーターが予算を設定しているかどうかに関係なく、バイナリが新しい `/workspace/mcp` 予算フィールドをサポートしている場合に常に公開されます。`--mcp-client-budget` を設定していないオペレーターでも、新しいフィールド（`budgetMode: 'off'`, `budgets: []`）を受け取ります。

`mcp_guardrail_events`（issue [#4175](https://github.com/QwenLM/qwen-code/issues/4175) PR 14b）は、ポーリングループなしで MCP 予算状態の閾値超過を通知する、型付き SSE プッシュイベントを公開します。`GET /session/:id/events` には 2 種類のフレームタイプが到着します。

- `mcp_budget_warning` — `reservedSlots.size / clientBudget` が 75% を上回った時点で 1 回発生します。比率が 37.5%（`MCP_BUDGET_REARM_FRACTION`）を下回った後にのみ再武装（リセット）されます。PR 10 の `slow_client_warning` ヒステリシスを反映したものですが、サブスクライバーごとのバックログレベルではなくマネージャーレベルで動作します。ペイロード: `{ liveCount, reservedCount, budget, thresholdRatio: 0.75, mode: 'warn' | 'enforce' }`。`warn` と `enforce` の両方のモードで発生し、`off` では決して発生しません。
- `mcp_child_refused_batch` — 1 つ以上のサーバーが拒否された場合に各 `discoverAllMcpTools*` パスの終了時に発生し、**かつ** `readResource` の遅延スポーン拒否パスで長さ 1 のバッチとして発生します。ペイロード: `{ refusedServers: [{ name, transport, reason: 'budget_exhausted' }, ...], budget, liveCount, reservedCount, mode: 'enforce' }`。`warn` モードでは決して拒否しないため、`mode` はリテラルの `'enforce'` になります。

どちらのイベントもセッションごとの SSE リプレイリングに保存され（`id` を持ちます）、`Last-Event-ID` で再接続するクライアントはこれらを介して再開できます。長時間の切断後の状態については、`GET /workspace/mcp` のスナップショットが引き続き信頼できる情報源となります。一度公開されれば常に有効であり、条件付きの切り替えはありません。SDK のリデューサー状態（`DaemonSessionViewState`）は、シンプルなラグスタイル UI を必要とするアダプター向けに、`mcpBudgetWarningCount`、`lastMcpBudgetWarning`、`mcpChildRefusedBatchCount`、`lastMcpChildRefusedBatch` を公開します。

## ルート

### `GET /health`

生存プローブ。デフォルト形式では、リスナーが稼働中の場合に `200 {"status":"ok"}` を返します。軽量でブリッジへのアクセスを伴わないため、高頻度の k8s/Compose 生存プローブに適しています。

ブリッジの**カウンター**を公開するプローブ（情報提供のみで、真の生存チェックではありません）には、`?deep=1`（`?deep=true` または単なる `?deep` も受け付けます）を渡します。

```json
{ "status": "ok", "sessions": 3, "pendingPermissions": 1 }
```

> ⚠️ ディーププローブは**情報提供のみ**を目的としており、実際の生存検証ではありません。これはカウンターアクセサー（`bridge.sessionCount`、`bridge.pendingPermissionCount`）を読み取りますが、これらはシンプルな Map サイズのゲッターです。個々の子プロセスやチャネルに ping を送信しないため、スタックしているにもかかわらずカウントされ続けているセッションは検出できません。これは、「このデーモンをローテーションから外す」ためのトリガーとしてではなく、キャパシティダッシュボード（現在の同時実行数 vs `--max-sessions`、キューの深さ）に使用してください。カスタムブリッジ実装のゲッターがスローした場合、理論的には `503 {"status":"degraded"}` レスポンスが返される可能性がありますが、実際のブリッジのゲッターがスローすることはありません。通常の操作では、ディーププローブは常に 200 を返します。実際の生存確認については、リスナーが TCP 接続を受け入れるかどうか（つまり、`?deep` なしのデフォルトの `/health`）に依存してください。

**認証:** ループバック**以外**のバインドでのみ必須です。ループバック（`127.0.0.1`、`::1`、`[::1]`）では、`/health` はベアラミドルウェアより前に登録されるため、ポッド内の k8s/Compose プローブはトークンを保持する必要はありません。ループバック以外（`--hostname 0.0.0.0` など）では、ルートはベアラミドルウェアの後に登録され、有効なトークンがない場合は 401 を返します。そうしないと、認証されていない呼び出し元が任意のアドレスをプローブして `qwen serve` の存在を確認できてしまい、ポートスキャンと組み合わさると低深刻度の情報漏洩につながる可能性があります。ループバックの免除においても、CORS 拒否 + ホスト許可リストは引き続き適用されます。

### `GET /daemon/status`

読み取り専用のオペレーター診断。`/health` とは異なり、これは通常のデーモン API です。ループバックバインドを含め、ベアラ認証とレート制限の後に登録されます。クエリパラメータ:

- `detail=summary`（デフォルト）はインメモリデーモン状態のみを読み取ります。
- `detail=full` はライブセッション診断、ACP 接続診断、認証デバイスフローカウント、およびワークスペース状態セクションも含みます。
- その他の `detail` は `400 { "code": "invalid_detail" }` を返します。

`summary` は意図的にワークスペース状態メソッドのクエリ、ACP 子プロセスの開始、またはセッションのスポーンを行いません。`full` は各ワークスペースセクションを個別にクエリします。タイムアウトまたは例外が発生した場合、そのセクションのみが `unavailable` としてマークされ、`workspace_status_unavailable` イシューが追加されます。

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
    }
  }
}
```

`status` は、いずれかのイシューがエラーの重大度を持つ場合は `error`、いずれかのイシューが警告の重大度を持つ場合は `warning`、それ以外の場合は `ok` になります。イシューコードは安定しており、`session_capacity_high`、`connection_capacity_high`、`pending_permissions`、`acp_channel_down`、`preflight_error`、`mcp_budget_warning`、`mcp_budget_exhausted`、`rate_limit_hits`、`channel_worker_exited`、`channel_worker_partial_connect`、および `workspace_status_unavailable` が含まれます。リスナーの準備ができてから完全なランタイムがマウントされるまでの短いウィンドウでは、`/daemon/status` が `daemon_runtime_starting` を報告する場合があります。非同期ランタイムのマウントに失敗した場合は `daemon_runtime_failed` を報告し、ステータス以外のランタイムルートは `503` を返します。

`runtime.channel.live` はデーモン内部の ACP ブリッジチャネルを報告します。これはチャネルアダプターワーカーではありません。デーモンが管理するチャネルは `runtime.channelWorker` を使用し、その `state` は `disabled`、`starting`、`running`、`exited`、`failed`、または `stopped` のいずれかです。ワーカーが `running` に到達した後に終了した場合、`/daemon/status` はデーモンをオンラインのまま維持し、警告イシューコード `channel_worker_exited` を報告します。

デーモンが管理するチャネルワーカーの起動は引き続きフェイルファストです。`qwen serve --channel ...` が準備完了状態に到達するワーカーを起動できない場合、serve の起動は失敗します。ワーカーが準備完了状態に到達した後、予期しない終了は、制限付きポリシー内で serve スーパーバイザーによって再起動されます。5 分間のウィンドウで最大 3 回の再起動試行が行われ、1 秒、5 秒、15 秒のバックオフが適用されます。ワーカーは 15 秒ごとに IPC ハートビートを送信します。45 秒間ハートビートが観測されない場合、スーパーバイザーはワーカーを古いものとみなして強制終了し、`staleHeartbeatAt` を記録して、同じ再起動パスを使用します。

`runtime.channelWorker` には、追加の運用フィールドが含まれる場合があります。`requestedChannels`、`pid`、`startedAt`、`exitCode`、`signal`、`error`、`restartCount`、`lastExitAt`、`lastRestartAt`、`nextRestartAt`、`lastHeartbeatAt`、および `staleHeartbeatAt` です。`restartCount` は、この serve プロセスによって行われた再起動試行の生涯カウントです。`restartCount > 0` の実行中のワーカーは、他のイシューが適用されない限り健全です。`requestedChannels` に `channels` に存在しない名前が含まれている実行中のワーカーは、`channel_worker_partial_connect` を報告します。

`qwen channel status` は引き続き pidfile メタデータを読み取ります。再起動ウィンドウ中は serve が所有する pidfile が予約されたままになりますが、クライアントが古いワーカープロセスを表示しないように `workerPid` は省略されます。ワーカーの stdout/stderr はデーモンログに転送されますが、ベアラトークン、機密性の高いワーカー環境値、およびプロキシ URL 資格情報はマスキングされます。

セキュリティ: レスポンスにはベアラトークン、クライアント ID、完全な ACP 接続 ID、デバイスフローユーザーコード、または検証 URL が含まれることはありません。`summary` はデーモンログパスを省略します。`full` は認証されたオペレーターに対してこれを含む場合があります。

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

安定した契約: `v` がインクリメントされた場合、フレームレイアウトが後方互換性のない方法で変更されています。

> **`protocolVersions`** はデーモンが話せる serve プロトコルバージョンを記述します。`current` はデーモンが優先するプロトコルバージョンであり、`supported` は互換性のあるセットです。特定のプロトコルを必要とするクライアントは `supported` を確認する必要があります。機能固有の UI は引き続き `features` でゲートする必要があります。v=1 への追加: 古い v=1 デーモンはこのフィールドを省略するため、古いビルドをターゲットにする SDK クライアントはこれをオプションとして扱う必要があります。

> **`modelServices` は Stage 1 では常に `[]` です。** エージェントは単一のデフォルトモデルサービスを使用し、それをネットワーク経由で列挙しません。Stage 2 では、SDK クライアントがサービスピッカーを構築できるように、登録されたモデルアダプターからこれが設定されます。それまでは、このフィールドが空でないことに依存して**ください**。

> **`workspaceCwd`** はこのデーモンがバインドする正規の絶対パスです（#3803 §02 — 1 デーモン = 1 ワークスペース）。これを使用して、(a) `/session` をポストする前に不一致を検出し、(b) `POST /session` で `cwd` を省略します（ルートはこのパスにフォールバックします）。マルチワークスペースデプロイメントでは、異なるポートで複数のデーモンを公開し、それぞれが独自の `workspaceCwd` を持ちます。v=1 への追加: §02 以前の v=1 デーモンはフィールドを省略します。古いビルドをターゲットにするクライアントは、使用する前に null チェックを行う必要があります。

### 読み取り専用ランタイム状態ルート

これらのルートはデーモン側のランタイムスナップショットを報告します。これらは v1 への追加ルートであり、状態を変更せず、serve プロトコルバージョンも変更しません。ワークスペース状態ルートは、クライアントが GET ルートをポーリングしたからといって、意図的に ACP 子プロセスを起動**しません**。デーモンがアイドル状態の場合、空のスナップショットで `initialized: false` を返します。セッション状態ルートはライブセッションを必要とし、不明な ID には標準の `404 SessionNotFoundError` 形状を使用します。

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

`errorKind` は `/workspace/preflight`、`/workspace/env`、および（最終的に）MCP ガードレールで共有される閉じた列挙型であり、SDK クライアントがフリーフォームのメッセージを解析する代わりにカテゴリごとに修復策をレンダリングできるようにします。PR 13（#4175）で上記の 7 つのリテラルが導入されました。PR 14 では、エグレスプローブが導入されると `blocked_egress` が設定されます。

ステータスペイロードが MCP 環境変数値、ヘッダー、OAuth/サービスアカウントの詳細、プロバイダー API キー、プロバイダーの `baseUrl` / `envKey`、スキル本文、スキルファイルシステムパス、フック定義、またはシークレット環境変数の値を公開することはありません。`/workspace/env` はホワイトリストに登録された環境変数の**存在**のみを報告します。プロキシ URL は資格情報が削除され、ネットワークに送信される前に `host:port` に削減されます。

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

`discoveryState` は `not_started`、`in_progress`、または `completed` のいずれかです。`transport` は `stdio`、`sse`、`http`、`websocket`、`sdk`、または `unknown` のいずれかです。検出が成功した場合、`errors` は省略されます。

**MCP クライアントガードレール（issue [#4175](https://github.com/QwenLM/qwen-code/issues/4175) PR 14）。** PR-14 以降のデーモンは、4 つの追加フィールドと 1 つのワークスペースレベルのセルでペイロードを拡張します。

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

`budgetMode` は `enforce`、`warn`、または `off` のいずれかです。予算が設定されていない場合、`clientBudget` は存在しません。`budgets[]` は PR-14 以降のデーモンでは**常に配列**です（`budgetMode === 'off'` の場合は空になる可能性があります）。PR-14 以前のデーモンはフィールドを完全に省略します。v1 は `scope: 'session'` のセルを 1 つ出力します（セッションごとの強制 — 理由については上記のケイパビリティセクションを参照）。コンシューマーは、認識されない `scope` 値を持つ追加の `budgets[]` エントリを許容**しなければなりません**。Wave 5 PR 23 では、スキーマのバージョンアップなしに、セッションごとのセルに加えて `scope: 'workspace'`（または `'pool'`）を追加します。

サーバーごとのセルの `disabledReason` は、オペレーターによって無効化されたもの（`'config'` — `disabledMcpServers` 設定リスト）と、予算によって拒否されたもの（`'budget'` — 検出されたが `enforce` モードのために接続されなかったもの）を区別します。拒否は `Object.entries(mcpServers)` の宣言順序によって決定的になります。サーバーごとの `status: 'error', errorKind: 'budget_exhausted'` は、生の `mcpStatus: 'disconnected'`（これは真ですが、オペレーターに対して提示される重大度ではありません）を隠蔽します。

PR 14 v1 における予算強制は**ワークスペースごとではなく、セッションごと**です。モード B デーモンは #4113 以降、プロセスレベルで `1 デーモン = 1 ワークスペース × N セッション` ですが、`McpClientManager` は `acpAgent.newSessionConfig` を介して各 ACP セッションの `Config` 内で構築されるため、N 個のセッションはそれぞれ独自のキャップのコピーを強制します。スナップショットはブートストラップセッションのビューを表します。Wave 5 PR 23 では、ワークスペーススコープの共有 MCP プールが導入され、真のワークスペースごとの強制へと移行します。

**予算プレッシャーの検出。** PR-14b 以降に設定される 2 つのサーフェス:

- **プッシュイベント**（`mcp_guardrail_events` 経由で公開）: `GET /session/:id/events` をサブスクライブし、`KnownDaemonEvent` を介して `mcp_budget_warning` / `mcp_child_refused_batch` フレームを絞り込みます。ステートマシンは 75% を上回る crossing ごとに 1 回発生し（37.5% を下回ると再武装）、拒否は `enforce` モードで検出パスごとに 1 回にまとめられます。
- **スナップショットポーリング**（`mcp_guardrails` 経由で公開）: `GET /workspace/mcp` を実行し、セッションごとの予算セル（`budgets[0]`）を調べます。

- `budgets[0].status === 'warning'` ⇔ `liveCount >= 0.75 * clientBudget`（PR 14b のプッシュイベントが使用するヒステリシス閾値と一致）。
- `budgets[0].status === 'error'` ⇔ `refusedCount > 0`（この検出パスで 1 つ以上のサーバーが拒否された）。
- `budgets[0].status === 'ok'` ⇔ 75% 閾値未満であり、かつ拒否がない。

推奨されるポーリング頻度: すでに `/workspace/mcp` をポーリングしているものと同期させます。スナップショットは軽量であり、予算セルに追加の検出コストはかかりません。プッシュイベントをサブスクライブする SDK クライアントも、長時間の切断後の状態のためにスナップショットから利益を得ます（SSE リプレイリングの深さは有限です — `--event-ring-size`、デフォルト 8000 — そのため、リングのカバー範囲より長くオフラインになるクライアントはスナップショットの再同期にフォールバックします）。

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

`level` は `project`、`user`、`extension`、または `bundled` のいずれかです。検出が成功した場合、`errors` は省略されます。

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

モデルは認証タイプごとにグループ化されます。プロバイダー接続診断は `/workspace/preflight` の `providers` セルに存在し、環境プレフライトは `/workspace/preflight` と `/workspace/env`（以下）に存在します。スナップショットの構築が成功した場合、`errors` は省略されます。

### `GET /workspace/env`

デーモンプロセスのランタイム、プラットフォーム、サンドボックス、プロキシ、およびホワイトリストに登録されたシークレット環境変数の**存在**を報告します。常に `process.*` 状態から回答します。デーモンはこのルートを提供するために ACP 子プロセスをスポーンすることはなく、ACP が稼働中かアイドル状態かに関わらずレスポンスは同一です。`acpChannelLive` フィールドは情報提供のみを目的としています。

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
**マスキングポリシー。** `kind: 'env_var'` のセルには `value` フィールドが含まれることはなく、クライアントからは `present: boolean` のみが参照できます。`kind: 'proxy'` のセルは、生の環境変数値を認証情報マスキング（`redactProxyCredentials`）にかけ、その後 `URL` パースを通じて、ネットワーク上には `host:port` のみが伝送されるようにします。`NO_PROXY` は URL ではなくホストリストであるため、マスキングをそのまま通過します。現在、列挙されるシークレット環境変数のホワイトリストには、`OPENAI_API_KEY`、`ANTHROPIC_API_KEY`、`GEMINI_API_KEY`、`GOOGLE_API_KEY`、`DASHSCOPE_API_KEY`、`OPENROUTER_API_KEY`、および `QWEN_SERVER_TOKEN` が含まれています。他の環境変数は列挙されないため、誤って設定されたシークレットは非表示のままになります。

### `GET /workspace/preflight`

デーモンの準備状況チェックを報告します。**デーモンレベルのセル**（`node_version`、`cli_entry`、`workspace_dir`、`ripgrep`、`git`、`npm`）は常に `process.*` と `node:fs` から取得されます。**ACPレベルのセル**（`auth`、`mcp_discovery`、`skills`、`providers`、`tool_registry`、`egress`）には稼働中の ACP 子プロセスが必要です。デーモンがアイドル状態の場合、これらは `status: 'not_started'` のプレースホルダーを出力します。このルートはセルを生成するためだけに ACP を起動することはなく、該当するセルは `not_started` にフォールバックします。

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

セルの形状:

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

- `missing_binary` — Node バージョンが要件未満、`QWEN_CLI_ENTRY` が見つからない、または ripgrep / git / npm が PATH にない（オプションのバイナリの場合はエラーではなく警告）。
- `missing_file` — `boundWorkspace` が存在しないかディレクトリではない、または存在しないか読み取り不能なファイルを指す skill パースエラー。
- `parse_error` — `SKILL.md` のパース失敗、不正な形式の config JSON。
- `auth_env_error` — `validateAuthMethod` が null 以外の失敗文字列を返した、またはプロバイダー解決から伝播した `ModelConfigError` のサブクラス。
- `init_timeout` — ブリッジでの `withTimeout` リジェクト（ACP ラウンドトリップ待機中の実際のタイムアウト）。`BridgeTimeoutError` 型クラスを通じて認識されます。注: `connecting > 0` を持つ一時的な `mcp_discovery` の `warning` セルはこの種類を含みません。これは実際のタイムアウトとは異なる、通常のハンドシェイク進行中の状態です。
- `protocol_error` — リクエスト中にチャネルが閉じられたか、tool registry が予期せず存在しなかったために ACP `extMethod` がリジェクトされた。
- `blocked_egress` — PR 14 (#4175) 用に予約されています。PR 13 では `egress` セルは `status: 'not_started'` のままになります。

プリフライトリクエストの処理中にブリッジが ACP 子プロセスに到達できなかった場合（例: リクエスト中のチャネルクローズ）、エンベロープの `errors` 配列には失敗を説明する単一の `ServeStatusCell` が含まれ、セルは `not_started` の ACP プレースホルダーにフォールバックします。デーモンレベルのセルは引き続き返されます。

### ワークスペースファイルルート

すべてのファイルパスは、デーモンにバインドされたワークスペースを通じて解決されます。レスポンスはワークスペース相対パスを使用し、通常の成功ケースで絶対ファイルシステムパスを返すことはありません。成功時のファイルレスポンスには以下が含まれます。

```http
Cache-Control: no-store
X-Content-Type-Options: nosniff
```

ファイルシステムエラーは以下の JSON 形状を使用します。

```json
{
  "errorKind": "hash_mismatch",
  "error": "expected sha256:..., found sha256:...",
  "hint": "re-read the file and retry with the latest hash",
  "status": 409
}
```

`errorKind` の値には、`path_outside_workspace`、`symlink_escape`、`path_not_found`、`binary_file`、`file_too_large`、`untrusted_workspace`、`permission_denied`、`parse_error`、`hash_mismatch`、`file_already_exists`、`text_not_found`、および `ambiguous_text_match` が含まれます。

#### `GET /file`

テキストファイルを読み取ります。クエリパラメータ: `path`（必須）、`maxBytes`、`line`、`limit`。デーモンはバイナリファイルとテキスト読み取り上限を超えるファイルをリジェクトします。レスポンスには `hash` が含まれ、これは `line`、`limit`、または `maxBytes` によってスライスが返された場合でも、ファイル全体のディスク上の生バイトに対する SHA-256 ダイジェストです。

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

デコードせずにファイルから生バイトを読み取ります。クエリパラメータ: `path`（必須）、`offset`（デフォルト `0`）、`maxBytes`（デフォルト `65536`、最大 `262144`）。このルートは、ファイル全体を読み込むことなく、大きなバイナリファイルに対して境界付きウィンドウをサポートします。レスポンスには、返されたウィンドウがファイル全体をカバーしている場合にのみ `hash` が含まれます。

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

テキストファイルを作成または置換します。これは厳密な変更ルートです。トークンが設定されていないループバックでは `401 { "code": "token_required" }` を返します。`--require-auth` を指定すると、グローバル Bearer ミドルウェアがルート実行前に未認証リクエストをリジェクトします。

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

`mode` は `create` または `replace` でなければなりません。`create` は既存ファイルを上書きすることはありません（`409 file_already_exists`）。`replace` には `expectedHash` が必要です。ハッシュの欠落や不正な形式は `400 parse_error` となり、古いハッシュは `409 hash_mismatch` となります。`expectedHash` は `sha256:` に続く 64 文字の小文字 hex 文字列で、ディスク上の生バイトに対して計算されます。

`bom`、`encoding`、および `lineEnding` を指定できます。置換はデフォルトで既存ファイルのエンコーディングプロファイルを保持します。明示的なフィールドがこれをオーバーライドします。バイナリ書き込みは対象外です。

デーモンは対象ディレクトリ内のランダムな一時ファイルに書き込み、サポートされている場所で fsync を実行し、`rename()` の直前に現在のハッシュを再確認してから、適切な名前にリネームします。これにより、部分的なファイルの観測が防止され、同じファイルへのデーモン発の書き込みが直列化されますが、これはクロスプロセスのカーネル compare-and-swap ではありません。最終ハッシュチェックとリネームの間のわずかなウィンドウで、外部エディタが競合する可能性は依然としてあります。

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

既存のテキストファイルに正確なテキスト置換を 1 つ適用します。これも厳密な変更ルートであり、`expectedHash` が必要です。

```json
{
  "path": "src/config.ts",
  "oldText": "timeout: 30000",
  "newText": "timeout: 60000",
  "expectedHash": "sha256:..."
}
```

`oldText` は空でなく、正確に 1 回出現する必要があります。一致しない場合は `422 text_not_found` を返し、複数一致する場合は `422 ambiguous_text_match` を返します。このルートはエンコーディング、BOM、および改行コードを保持し、アトミックなリネームの直前に `expectedHash` を再確認します。

認証された呼び出し元がパスを指定しているため、無視されるパスへの明示的な書き込み/編集は許可されます。成功時のレスポンスと監査イベントには `matchedIgnore: "file" | "directory" | null` が含まれます。

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

`state` は、`POST /session`、`POST /session/:id/load`、および `POST /session/:id/resume` で使用される ACP の model/mode/config-option の形状を反映しています。

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

`availableCommands` は `available_commands_update` SSE 通知で使用されるものと同じコマンドスナップショットです。`availableSkills` は skill 名のみをリスト化します。クライアントはこのルート経由で skill の本体やパスを期待してはなりません。

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

このルートは読み取り専用の帯域外スナップショットです。意図的にプロンプトではなく、セッションのストリーミング中にクエリを実行できます。レスポンスには、agent、shell、および monitor タスクレジストリからのホワイトリスト化されたメタデータのみが含まれます。controller、timer、offset、保留中のメッセージ、および生のレジストリオブジェクトが公開されることは決してありません。

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

`status` は `NOT_STARTED`、`IN_PROGRESS`、`READY`、または `FAILED` のいずれかです。利用可能な場合、オプションの `error` が失敗したサーバーに存在します。無効化された LSP（ベアモードを含む）は、`enabled: false`、ゼロのカウント、および `servers: []` で HTTP 200 を返します。サーバーが構成されていない LSP が有効な場合は、`enabled: true`、`configuredServers: 0`、および `servers: []` を返します。クライアントが存在する前に初期化が失敗した場合、レスポンスに `initializationError` が含まれる可能性があります。稼働中のクライアントがスナップショットを提供できない場合、レスポンスには `statusUnavailable: true` が含まれます。

このルートは、安定したクライアント向けフィールドのみを公開します。プロセス ID、spawn 引数、stderr テール、root URI、およびワークスペースフォルダーパスなどのデバッグ内部情報は意図的に省略されています。

### `POST /session`

新しい agent を生成するか、既存の agent にアタッチします（デフォルトの `sessionScope: 'single'` の場合）。

リクエスト:

```json
{
  "cwd": "/absolute/path/to/workspace",
  "modelServiceId": "qwen-prod",
  "sessionScope": "thread"
}
```

| フィールド | 必須 | 備考 |
| --- | --- | --- |
| `cwd` | いいえ | デーモンにバインドされたワークスペースに一致する絶対パス。省略した場合、ルートは `boundWorkspace` にフォールバックします（`/capabilities.workspaceCwd` から読み取ります）。一致しない空でない `cwd` は `400 workspace_mismatch` を返します（#3803 §02 — 1 デーモン = 1 ワークスペース）。ワークスペースパスは `realpathSync.native` を通じて正規化されるため（存在しないパスの場合は resolve-only フォールバックあり）、大文字小文字を区別しないファイルシステムでも表記ごとにセッションがリジェクトされることはありません。 |
| `modelServiceId` | いいえ | agent がルーティングする構成済み_モデルサービス_（バックエンドプロバイダー — Alibaba ModelStudio、OpenRouter など）を選択します。省略した場合、agent はデフォルトを使用します。ワークスペースにすでにセッションがある場合、これは既存のセッションで `setSessionModel` を呼び出し、`model_switched` をブロードキャストします。すでにバインドされたサービス**内**のモデルを選択する `POST /session/:id/model` の `modelId` とは異なります。`/capabilities` の `modelServices` 配列は構成済みサービスの公開用に予約されています。Stage 1 では常に `[]` です（agent のデフォルトサービスが使用され、HTTP 経由で列挙されません）。 |
| `sessionScope` | いいえ | セッション共有のリクエストごとのオーバーライド。`'single'`（デーモン全体のデフォルト）は、同じワークスペースへの 2 回目の `POST /session` で既存のセッションを再利用させます（`attached: true`）。`'thread'` は呼び出しごとに新しい個別セッションを強制します。省略するとデーモン全体のデフォルトを継承します。列挙外の値は `400 { code: 'invalid_session_scope' }` を返します。古いデーモン（#4175 PR 5 より前）はこのフィールドを暗黙的に無視します。送信前に `caps.features.session_scope_override` をプリフライトで確認してください。デーモン全体のデフォルトは現在、本番環境で `'single'` にハードコードされています。#4175 では、後続のアップデートで `--sessionScope` CLI フラグが追加される可能性があります。 |

レスポンス:

```json
{
  "sessionId": "<uuid>",
  "workspaceCwd": "/canonical/path",
  "attached": false
}
```

`attached: true` は、そのワークスペースのセッションがすでに存在し、現在それを共有していることを意味します。

同じワークスペースへの同時 `POST /session` 呼び出しは、1 つの生成に**統合（coalesced）** されます。両方の呼び出し元は同じ `sessionId` を取得し、ちょうど 1 つだけが `attached: false` を報告します。基盤となる生成が失敗した場合（初期化タイムアウト、不正な形式の agent 出力、OOM）、**統合されたすべての呼び出し元が同じエラーを受け取ります**。インフライトスロットはクリアされるため、後続の呼び出しは最初から再試行できます。

> ⚠️ **新規セッションでの `modelServiceId` のリジェクトは、HTTP レスポンス上ではサイレントです。** 不正な `modelServiceId`（タイプミス、未構成のサービス）は作成時に 500 エラーを返しません。セッションは agent のデフォルトモデルで動作し続けるため、呼び出し元はモデル切り替えを再試行できる `sessionId` を引き続き取得します（`POST /session/:id/model` 経由）。目に見える失敗シグナルは、セッションの SSE ストリーム上の `model_switch_failed` イベントであり、生成ハンドシェイクと最初のサブスクライブの間に発生します。**このイベントを観測する必要があるサブスクライバーは、最初の `GET /session/:id/events` で `Last-Event-ID: 0` を渡す必要があります**。これにより、リングの最も古い利用可能なイベントからリプレイされます（サブスクライブが作成レスポンスの数 ms 後に到着した場合でも、生成時の `model_switch_failed` をカバーします）。

### `POST /session/:id/load`

ID で永続化された ACP セッションを復元し、その履歴を SSE 経由でリプレイします。パス ID が優先されます。ボディ内の `sessionId` フィールドは無視されます。`caps.features.session_load` をプリフライトで確認してください。古いデーモンはこのルートに対して `404` を返します。

リクエスト:

```json
{
  "cwd": "/absolute/path/to/workspace"
}
```

| フィールド | 必須 | 備考 |
| --- | --- | --- |
| `cwd` | いいえ | `POST /session` と同じ正規化および `workspace_mismatch` のルール。省略すると `/capabilities.workspaceCwd` を継承します。`mcpServers` は意図的にここでは受け付けません。デーモン全体の MCP は設定駆動です（`POST /session` と一致）。 |

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

`state` は ACP の `LoadSessionResponse` を反映しています。`models` は `SessionModelState`、`modes` は `SessionModeState`、`configOptions` は `SessionConfigOption` の配列です。欠落しているフィールドは agent によって決定されます。遅れてアタッチするクライアント（以下の `attached: true` のパス）は、元の load 呼び出し元が見たものと**同じ** `state` スナップショットを取得します。デーモンはこれをエントリ時にキャッシュします。ランタイムの変更（例: `model_switched`）は、後続のアタッチレスポンスではなく SSE ストリーム上で配信されます。

`attached: true` は、セッションがすでに稼働中だったことを意味します（以前の `session/load`/`session/resume` によるものか、統合された同時呼び出し元がわずかに先に競合したためです）。

**SSE 経由の履歴リプレイ。** agent 側で `loadSession` が実行されている間、agent は永続化された各ターンに対して `session_update` 通知を発行します。デーモンはこれらをルートレスポンスが返る前にセッションのイベントバスにバッファリングするため、直ちに `Last-Event-ID: 0` を指定して `GET /session/:id/events` を呼び出すサブスクライバーは完全なリプレイを確認できます。**リプレイリングには上限があります**（デフォルトでセッションあたり 8000 フレーム）。多くのツール呼び出し/思考ストリームのターンを含む長い履歴はこれを超える可能性があり、最も古いフレームはサイレントに破棄されます。完全な履歴を必要とするクライアントは、`load` が返された直後にサブスクライブする必要があります。あるいは、SSE イベント ID を永続化し、`Last-Event-ID` を使用して後のターンの境界から再開することもできます。

**エラー:**

- `404` — 永続化されたセッション ID が存在しない（`SessionNotFoundError`）。
- `400` — `workspace_mismatch`（`POST /session` と同じ形状）。
- `503` — `session_limit_exceeded`（`--max-sessions` に対してカウントされます。インフライトの復元も考慮されます）。
- `409` — `restore_in_progress`（同じ ID の `session/resume` がすでにインフライト）。`Retry-After: 5`。同じアクションの競合（同じ ID への 2 つの同時 `session/load`）は統合されます。ちょうど 1 つが `attached: false` を返し、残りは同じ `state` で `attached: true` を返します。
- `409` — ID が `chats/archive/` にのみ存在する場合の `session_archived`。`load` または `resume` の前に `POST /sessions/unarchive` を呼び出してください。
- `409` — 同じ ID に対してアーカイブまたはアーカイブ解除がインフライトの場合の `session_archiving`。`Retry-After: 5`。
- `409` — ID が `chats/` と `chats/archive/` の両方に存在する場合の `session_conflict`。読み込む前に `POST /sessions/delete` でセッションを削除してください。
### `POST /session/:id/resume`

永続化された ACP セッションを ID で復元します。SSE を介して履歴をリプレイすることはありません。モデルコンテキストはエージェント側で内部的に復元されます（`config.getResumedSessionData` を読み込む `geminiClient.initialize` 経由）。すでに履歴がレンダリングされているクライアントにとって、SSE ストリームはクリーンなまま保たれます。プリフライトは `caps.features.session_resume` です。`unstable_session_resume` は、古いクライアントのための非推奨の互換エイリアスとして残されています。

リクエストの形状は `/load` と同じです。レスポンスの形状も同じで、`state` は ACP の `ResumeSessionResponse` を反映します。エラーエンベロープも同じであり、`409 restore_in_progress`（`session/load` が進行中の場合に発生します。別の `session/resume` の背後で競合する `session/resume` は統合されます）も含まれます。

クライアントに履歴がレンダリングされていない場合（コールド再接続、ピッカー → 開く）は `/load` を使用します。クライアントがすでに画面上にターンを持っており、デーモン側のハンドルを取り戻すだけの場合は `/resume` を使用します。

> ⚠️ **なぜ `unstable_session_resume` がまだ公開されているのか？** デーモンの HTTP ルートと `session_resume` ケーパビリティは v1 向けに安定化していますが、ブリッジはまだ ACP の `connection.unstable_resumeSession` を呼び出しています。古いタグは、`session_resume` より前にリリースされた SDK が引き続き動作するようにするためだけに残されています。

### `GET /workspace/:id/sessions`

正規化されたワークスペースが `:id`（URL エンコードされた絶対 cwd）に一致する永続化されたセッションを一覧表示します。デフォルトの一覧は `chats/` からのアクティブセッションです。`archiveState=archived` を渡すと、`chats/archive/` からアーカイブされたセッションを一覧表示します。`archiveState=all` は v1 ではサポートされていません。

```bash
curl http://127.0.0.1:4170/workspace/$(jq -rn --arg c "$PWD" '$c|@uri')/sessions
curl http://127.0.0.1:4170/workspace/$(jq -rn --arg c "$PWD" '$c|@uri')/sessions?archiveState=archived
```

クエリパラメータ:

| フィールド | 必須 | 備考 |
| -------------- | -------- | ------------------------------------------------------------------------------------------------------- |
| `archiveState` | いいえ | `active`（デフォルト）または `archived`。他の値を指定すると `400 { code: "invalid_archive_state" }` が返されます。 |
| `cursor` | いいえ | 前のレスポンスからのページネーションカーソル。 |
| `size` | いいえ | ページサイズ。無効な値を指定すると、`400 { code: "invalid_cursor" }` または既存のページサイズ検証が返されます。 |

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

アクティブな一覧には、`clientCount` や `hasActivePrompt` などのライブデーモンオーバーレイフィールドが含まれます。アーカイブされた一覧はストレージのみです。`isArchived` は `true` になり、ライブオーバーレイフィールドは存在しないか false のままです。セッションが存在しない場合は空の配列（404 ではありません）が返されます。セッションピッカー UI は、ワークスペースがアイドル状態だからといってエラーになるべきではありません。

### `POST /sessions/delete`

1 つ以上の永続化されたセッション JSONL ファイルをハードデリートします。デーモンはまずベストエフォートでライブセッションを閉じ、次にアクティブまたはアーカイブされた JSONL を削除します。同じ ID に対してアクティブとアーカイブの両方のコピーが存在する場合、両方が削除されます。両側のワークツリーサイドカーはクリーンアップされますが、ファイル履歴、サブエージェントのトランスクリプト、およびランタイムサイドカーは意図的に保持されます。

リクエスト:

```json
{ "sessionIds": ["<uuid>"] }
```

レスポンス:

```json
{
  "removed": ["<uuid>"],
  "notFound": [],
  "errors": []
}
```

### `POST /sessions/archive`

1 つ以上のセッションをアーカイブします。アーカイブは状態遷移であり、削除ではありません。JSONL は `chats/<id>.jsonl` から `chats/archive/<id>.jsonl` に移動します。ファイル履歴、サブエージェントのトランスクリプト、およびランタイムサイドカーはそのまま残ります。セッションがライブの場合、デーモンはまず厳密なクローズを実行し、ACP エージェントのクローズハンドラにチャット記録のフラッシュを要求します。クローズまたはフラッシュが失敗した場合、JSONL は移動されません。プリフライトは `caps.features.session_archive` です。

リクエスト:

```json
{ "sessionIds": ["<uuid>"] }
```

`sessionIds` は、最大 100 個の ID を含む空でない文字列配列である必要があります。重複は折りたたまれます。

レスポンス:

```json
{
  "archived": ["<uuid>"],
  "alreadyArchived": [],
  "notFound": [],
  "errors": []
}
```

`errors` のエントリは `{ "sessionId": "<uuid>", "error": "message" }` を持ちます。同じ ID のアクティブファイルとアーカイブファイルは競合として扱われ、`errors` で報告されます。ファイルが上書きされることはありません。

### `POST /sessions/unarchive`

アーカイブされたセッションをアクティブディレクトリに復元します。これだけではセッションは再開されません。`chats/archive/<id>.jsonl` を `chats/<id>.jsonl` に戻すだけです。アンアーカイブが成功した後、クライアントは `POST /session/:id/load` または `POST /session/:id/resume` を呼び出すことができます。

リクエスト:

```json
{ "sessionIds": ["<uuid>"] }
```

レスポンス:

```json
{
  "unarchived": ["<uuid>"],
  "alreadyActive": [],
  "notFound": [],
  "errors": []
}
```

ID に対してアクティブな JSONL がすでに存在する場合、アンアーカイブは `errors` で競合を報告し、上書きしません。同じ ID に対してアーカイブまたはアンアーカイブが進行中の場合、バッチを開始する前に `409 session_archiving` が返されます。

ACP-over-HTTP は、ベンダーメソッド `_qwen/sessions/archive` および `_qwen/sessions/unarchive` を介して同じリクエストおよびレスポンスボディを使用します。REST ルートテーブルは、ACP トランスポート向けに `POST /sessions/archive` および `POST /sessions/unarchive` をそれらのメソッドにマッピングします。

### `POST /session/:id/prompt`

エージェントにプロンプトを転送します。マルチプロンプトの呼び出し元は、セッションごとに FIFO キューイングされます（ACP はセッションごとに 1 つのアクティブなプロンプトを保証します）。

リクエスト:

```json
{
  "prompt": [{ "type": "text", "text": "What does src/main.ts do?" }]
}
```

検証: `prompt` は空でないオブジェクトの配列である必要があります。他の失敗はブリッジに到達する前に `400` を返します。

レスポンス:

```json
{ "stopReason": "end_turn" }
```

その他の停止理由: `cancelled`、`max_tokens`、`error`、`length`（ACP 仕様準拠）。

HTTP クライアントがプロンプトの途中で切断された場合、デーモンはエージェントに ACP `cancel` 通知を送信し、プロンプトを `stopReason: "cancelled"` で巻き戻します。

> **ステージ 1 の制限 — サーバー側プロンプトタイムアウトなし。** ブリッジは、エージェントの `prompt()` と `transportClosedReject`（エージェント子プロセスのクラッシュ）、および呼び出し元の HTTP 切断 AbortSignal だけを競合させます。詰まっているが生きているエージェント（例: ハングするモデル呼び出し）は、HTTP クライアントが独自のタイムアウトで切断するまで、セッションごとの FIFO をブロックします。長時間実行されるプロンプトは正当なもの（深い調査、大規模コードベースの分析）であるため、デフォルトのデッドラインは意図的に設定されていません。ステージ 2 では、設定可能な `promptTimeoutMs` オプトインが公開される予定です。それまでの間、呼び出し元は独自のクライアント側タイムアウトを設定し、期限切れ時に切断する（または `POST /session/:id/cancel` を呼び出す）必要があります。

### `POST /session/:id/cancel`

セッション上の**現在アクティブな**プロンプトをキャンセルします。ACP 側では、これはリクエストではなく通知です。エージェントは、アクティブな `prompt()` を `cancelled` で解決することで応答します。

```bash
curl -X POST http://127.0.0.1:4170/session/$SID/cancel
# → 204 No Content
```

> **マルチプロンプトの契約:** キャンセルはアクティブなプロンプトにのみ影響します。同じクライアントが以前に POST し、アクティブなプロンプトの背後でまだキューイングされているプロンプトは、引き続き実行されます。マルチプロンプトのキューイングはデーモンによって導入された動作（ACP 仕様にはない）であり、キューイングされたプロンプトの契約は「それぞれをキャンセルするか、チャネル終了でセッションを強制終了しない限り、実行され続ける」というものです。

### `DELETE /session/:id`

ライブセッションを明示的に閉じます。他のクライアントがアタッチされている場合でも強制クローズします。アクティブなプロンプトをキャンセルし、保留中のパーミッションをキャンセルとして解決し、`session_closed` イベントを公開し、EventBus を閉じ、デーモンマップからセッションを削除します。ディスク上の永続化されたセッションは削除されません。`POST /session/:id/load` 経由で再読み込みできます。プリフライトは `caps.features.session_close` です。

```bash
curl -X DELETE http://127.0.0.1:4170/session/$SID
# → 204 No Content
```

冪等性: 不明なセッションの場合は `404` を返します（他のルートと同じ `SessionNotFoundError` 形状）。

> **`session_closed` イベント。** SSE 購読者は、ストリームが終了する前に、`{ sessionId, reason: 'client_close', closedBy?: '<clientId>' }` を含む終端の `session_closed` イベントを受信します。SDK リデューサーはこれを `session_died` と同一に扱います（`alive: false` を設定し、`pendingPermissions` をクリアします）。

### `PATCH /session/:id/metadata`

変更可能なセッションメタデータを更新します。現在は `displayName` のみをサポートします。プリフライトは `caps.features.session_metadata` です。

リクエスト:

```json
{ "displayName": "My Investigation Session" }
```

| フィールド | 必須 | 備考 |
| ------------- | -------- | ------------------------------------------------------------------------------ |
| `displayName` | いいえ | 文字列、最大 256 文字。空の文字列は名前をクリアします。そのままにする場合は省略します。 |

レスポンス:

```json
{ "sessionId": "<uuid>", "displayName": "My Investigation Session" }
```

セッションの SSE ストリームで `{ sessionId, displayName }` を含む `session_metadata_updated` イベントを公開します。

### `POST /session/:id/heartbeat`

このセッションのデーモンの最終閲覧（last-seen）記録を更新します。長寿命のアダプタ（TUI/IDE/web）は、将来の失効ポリシー（Wave 5 PR 24）が死んだクライアントと静かなクライアントを区別できるように、インターバルでこれを ping します。

ヘッダー:

| ヘッダー | 必須 | 備考 |
| ------------------ | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `X-Qwen-Client-Id` | いいえ | `POST /session` からデーモンが発行した ID をエコーします。識別されたクライアントはクライアントごとのタイムスタンプも更新しますが、匿名のハートビートはセッションごとのウォーターマークのみを更新します。他の場所と同じ `[A-Za-z0-9._:-]{1,128}` の形状を満たす必要があります。 |

リクエストボディは空です（`{}` で問題ありません。現在読み取られるフィールドはありません）。

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

- `400` — ヘッダーが不正な形式（ヘッダー形状ルール）の場合、またはこのセッションに登録されていない `clientId` を含んでいる場合（ブリッジはタイムスタンプを更新する前に `InvalidClientIdError` をスローします）、`{ code: 'invalid_client_id' }`。
- `404` — 不明なセッション。

ケーパビリティゲーティング: プリフライトは `caps.features.client_heartbeat` です。古いデーモンはこのパスに対して `404` を返します。

### `POST /session/:id/model`

セッションに現在バインドされているモデルサービス**内で**、アクティブなモデルを切り替えます。セッションごとのモデル変更キューを通じて直列化されます。

（_サービス_ 自体（Alibaba ModelStudio と OpenRouter など）を切り替えるには、新しいセッションのために `POST /session` で `modelServiceId` を渡します。ステージ 1 にはライブサービス切り替えルートはありません。）

リクエスト:

```json
{ "modelId": "qwen-staging" }
```

レスポンス:

```json
{ "modelId": "qwen-staging" }
```

成功すると、SSE ストリームに `model_switched` を公開します。失敗すると、`model_switch_failed` を公開します（パッシブな購読者が呼び出し元だけでなく失敗を見られるようにするため）。エージェントチャネルの終了と競合するため、詰まった子プロセスが HTTP ハンドラをブロックすることはありません。

### `POST /session/:id/recap`

ケーパビリティタグ: `session_recap`。ブリッジ → ACP extMethod `qwen/control/session/recap`。

セッションの「どこで中断したか」を表す一文の要約を生成します。コアの `generateSessionRecap`（`packages/core/src/services/sessionRecap.ts`）をラップし、ツールを無効にして、`maxOutputTokens: 300`、および厳密な `<recap>...</recap>` 出力形式で、高速モデルに対してサイドクエリを実行します。サイドクエリはセッションの既存の GeminiClient チャット履歴を読み取り、それに追加することは**ありません**。

リクエストボディは無視されます（`{}` または空を送信します）。厳密でないミューテーションゲート — ポスチャーは `/session/:id/prompt` を反映します（呼び出しはトークンを消費しますが、状態は変更しません）。SSE イベントは公開されません。

レスポンス (200):

```json
{
  "sessionId": "sess:42",
  "recap": "Debugging the auth retry race. Next: add deterministic timing to the integration test."
}
```

`recap` は `null`（通常の 200 であり、エラーではありません）になることがあります:

- セッションのダイアログターンがまだ 2 つ未満の場合、
- サイドクエリが抽出可能な `<recap>...</recap>` ペイロードを返さなかった場合、
- または基盤となるモデルエラーが発生した場合（コアヘルパーはベストエフォートであり、スローすることはありません）。

エラー:

- `400 {code: 'invalid_client_id'}` — `X-Qwen-Client-Id` ヘッダーが不正な形式。
- `404` — 不明なセッション。

キャンセル: **v1 ではなし**。ルートは HTTP クライアントの切断をリッスンせず、`AbortSignal` はブリッジに配管されず、ACP 子は呼び出し元が切断されたかどうかに関係なくサイドクエリを完了まで実行します。上限は、ブリッジの 60 秒のバックストップタイムアウト（`SESSION_RECAP_TIMEOUT_MS`）と、ACP チャネルの死に対するトランスポートクローズの競合のみです。これは、recap が短いため（シングルアテンプト、`maxOutputTokens: 300`、通常 ~1〜5 秒）許容されます。帯域幅コストが正当化される場合は、将来のリリースでリクエスト ID ベースのキャンセル ext-method が完全なエンドツーエンドのキャンセルを配管できます。

### ミューテーション: approval, tools, init, MCP restart

issue [#4175](https://github.com/QwenLM/qwen-code/issues/4175) Wave 4 PR 17 は、リモートクライアントがデーモンホストの CLI に触れずにランタイムポスチャーを変更できるようにする 4 つのミューテーション制御ルートを追加します。4 つすべて:

- PR 15 の**厳密な**ミューテーションゲートによってゲーティングされます。ベアラートークンなしで構成されたデーモンは、それらを `401 {code: 'token_required'}` で拒否します。オプトインする前に `--token`（または `QWEN_SERVER_TOKEN`）を構成してください。
- `X-Qwen-Client-Id` ヘッダー（PR 7 監査チェーン）を受け入れ、スタンプします。ヘッダーが信頼された ID を運ぶ場合、デーモンは対応する SSE イベントで `originatorClientId` を出力し、クロスクライアント UI が独自のミューテーションのエコーを抑制できるようにします。
- アフォーダンスを公開する前に、タグごとのケーパビリティを事前にチェックします。古いデーモンはルートに対して `404` を返します。

4 つのルートのうち 3 つ（`tools/:name/enable`、`init`、`mcp/:server/restart`）は**ワークスペーススコープ**のイベントを出力します。ミューテーションがトリガーされたときにどのセッションがアタッチされていたかに関係なく、すべてのアクティブなセッション SSE バスがイベントを受信します。`approval-mode` は**セッションスコープ**のイベントを出力します。これは、変更が 1 つのセッションの `Config` にローカルなものだからです。

#### `POST /session/:id/approval-mode`

ケーパビリティタグ: `session_approval_mode_control`。ブリッジ → ACP extMethod `qwen/control/session/approval_mode`。

ライブセッションの承認モードを変更します。新しいモードは ACP 子のセッションごとの `Config` に即座に反映されます。設定はデフォルトではディスクに書き込まれません。`persist: true` を渡すと、`tools.approvalMode` をワークスペース設定にも書き込みます。

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

ケーパビリティタグ: `workspace_tool_toggle`。純粋なファイル IO — ACP ラウンドトリップなし。

ワークスペースの `tools.disabled` 設定リストでツール名を切り替えます。そこにリストされたツールは**一切登録されません**（ツールを登録したまま呼び出しを拒否する `permissions.deny` とは異なります）。組み込みツールと MCP 検出ツールの両方が `ToolRegistry.registerTool` を経由し、そこで無効化セットが参照されます。

> ⚠️ **名前はレジストリの公開された識別子と完全に一致する必要があります。** エイリアスの解決は行われません。ルートはパスパラメータにある文字列をそのまま `tools.disabled` に保存し、次の ACP 子は登録時に `tool.name` と照合します。組み込みツールは正規のレジストリ名（スネークケースの動詞形式）を使用します: `run_shell_command`、`read_file`、`write_file`、`list_directory`、`glob`、`grep_search`、`web_fetch` など — CLI が表示するラベル（`Shell`、`Read`、`Write`）ではありません。MCP 検出ツールは修飾された `mcp__<server>__<name>` 形式を使用します（これは `tool_toggled` イベントがブロードキャストする形式でもあり、`GET /workspace/mcp` がリストする形式でもあります）。`Bash` を無効にしても、次のセッションで `run_shell_command` が登録されるのを防ぐことはできません。

ライブな ACP 子はすでに登録されたツールを保持します。切り替えは**次の** ACP 子プロセスの生成時に有効になります。現在のデーモンで変更を有効にするには、`POST /workspace/mcp/:server/restart`（MCP 由来のツールの場合）または新しいセッションの作成と組み合わせます。

不明なツール名も受け入れられます。まだインストールされていない MCP ツールを事前に無効化することは、正当なユースケースです。

リクエスト:

```json
{ "enabled": false }
```

レスポンス (200):

```json
{ "toolName": "run_shell_command", "enabled": false }
```

エラー:

- `400 {code: 'invalid_tool_name'}` — 空のパスパラメータ、またはパスパラメータが 256 文字の上限を超えている。
- `400 {code: 'invalid_enabled_flag'}` — `enabled` が欠落しているか、ブール値ではない。

SSE イベント（ワークスペーススコープ）: `{toolName, enabled, originatorClientId?}` を含む `tool_toggled`。

#### `POST /workspace/init`

ケーパビリティタグ: `workspace_init`。純粋なファイル IO — ACP ラウンドトリップなし、**LLM 呼び出しなし**。

デーモンがバインドされたワークスペースルートに、空の `QWEN.md`（または `--memory-file-name` オーバーライドの下で `getCurrentGeminiMdFilename()` が返すもの）をスキャフォールディングします。機械的な操作のみです。AI 駆動のコンテンツ入力については、`POST /session/:id/prompt` をフォローアップしてください。

デフォルトでは、ターゲットファイルが空白以外のコンテンツで存在する場合、上書きを拒否します。空白のみのファイルは存在しないものとして扱われます（ローカルの `/init` スラッシュコマンドと一致します）。

リクエスト:

```json
{ "force": false }
```

レスポンス (200):

```json
{ "path": "/work/bound/QWEN.md", "action": "created" }
```

`action` は、新規作成の場合は `'created'`、既存の空白のみのファイルがそのままにされた（書き込みが実行されなかった）場合は `'noop'`、`force: true` によって空でないコンテンツが置き換えられた場合は `'overwrote'` です。`workspace_initialized` SSE イベントはレスポンスアクションを反映します。オブザーバーは `action !== 'noop'` をフィルタリングして、実際のディスク上の変更のみに反応できます。

エラー:

- `400 {code: 'invalid_force_flag'}` — `force` がブール値ではない。
- `409 {code: 'workspace_init_conflict', path, existingSize}` — ファイルが空白以外のコンテンツで存在し、`force` が省略されているか false である。ボディは絶対パスとサイズ（バイト）を運ぶため、SDK クライアントは再 stat せずに「N バイトを上書きしますか？」プロンプトをレンダリングできます。

SSE イベント（ワークスペーススコープ）: `{path, action, originatorClientId?}` を含む `workspace_initialized`。

#### `POST /workspace/mcp/:server/restart`

ケーパビリティタグ: `workspace_mcp_restart`。ブリッジ → ACP extMethod `qwen/control/workspace/mcp/restart`。

ACP 子の `McpClientManager.discoverMcpToolsForServer`（切断 + 再接続 + 再検出）を通じて、構成済みの MCP サーバーを再起動します。PR 14 v1 のアカウンティングからのライブバジェットスナップショットを事前にチェックするため、バジェットが飽和したワークスペースでの再起動は、`BudgetExhaustedError` カスケードをトリガーするのではなく、ソフトな拒否を返します。
リクエストボディは空（`{}`）です。パスパラメータは、`mcpServers` 設定に表示される URL エンコードされたサーバー名です。

レスポンス (200) — `restarted` による識別共用体（discriminated union）:

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
| `'in_flight'`           | このサーバーに対する別の検出 / 再起動がすでに進行中です。ルートは元の Promise を待機するのではなく即座に返ります。呼び出し元は短い遅延後に再試行する必要があります。 |
| `'disabled'`            | サーバーは設定されていますが、`excludedMcpServers` にリストされています。再起動する前に再度有効化してください。                                                                                                    |
| `'budget_would_exceed'` | デーモンが `--mcp-budget-mode=enforce` であり、対象サーバーが現在 `reservedSlots` になく、ライブ合計が `clientBudget` に達しています。呼び出し元はまずスロットを解放する必要があります。         |

エラー（2xx 以外）:

- `400 {code: 'invalid_server_name'}` — パスパラメータが空です。
- `404` — サーバー名が `mcpServers` 設定にないか、ライブ ACP チャネルが存在しません（再起動には本質的にライブの `McpClientManager` インスタンスが必要です）。
- `500` — 内部エラー（例: `ToolRegistry` が初期化されていません）。

SSE イベント（ワークスペーススコープ）: 成功時は `{serverName, durationMs, originatorClientId?}` を含む `mcp_server_restarted`、ソフトスキップ時は `{serverName, reason, originatorClientId?}` を含む `mcp_server_restart_refused`。

### `GET /session/:id/events` (SSE)

セッションのイベントストリームをサブスクライブします。

ヘッダー:

```
Accept: text/event-stream
Last-Event-ID: 42        ← オプション、id 42 以降からリプレイ
```

クエリパラメータ:

| パラメータ       | 必須 | 備考                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ----------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `maxQueued` | いいえ       | サブスクライバーごとの**ライブバックログ**上限。範囲は `[16, 2048]`、デフォルトは 256。サブスクライブ時に強制プッシュされるリプレイフレームは上限の対象外です。実際に消費するのは、サブスクライバーがまだ大量の `Last-Event-ID: 0` リプレイをドレインしている間に到着するライブイベントです。コールド再接続時には、コンシューマーが追いつく前にライブテールが低速クライアント警告 / 強制排除を引き起こさないよう、この値を増やしてください。範囲外 / 非10進数 / 値が空の場合は、SSE ハンドシェイクが開始される前に `400 invalid_max_queued` を返します。プレフライト `caps.features.slow_client_warning` — 古いデーモンはこのパラメータをサイレントに無視します。 |

フレーム形式。`data:` 行は**完全なイベントエンベロープ**であり、1行の JSON 文字列です — `{id?, v, type, data, originatorClientId?}`。ACP 固有のペイロード（`sessionUpdate`、`requestPermission` 引数など）はエンベロープの `data` フィールド内に配置されます。エンベロープ自体の `type` は SSE の `event:` 行と一致します。

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

SSE レベルの `id:` / `event:` 行は、EventSource との互換性のために `envelope.id` / `envelope.type` を複製しています。Raw-`fetch` コンシューマー（SDK の `parseSseStream`）は JSON エンベロープからすべてを読み取り、SSE プリアンブル行を無視します。

| イベントタイプ                | トリガー                                                                                                                                                                                                                                                                                                                  |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `session_update`          | 任意の ACP `sessionUpdate` 通知（LLM チャンク、ツール呼び出し、使用量）                                                                                                                                                                                                                                                     |
| `permission_request`      | エージェントがツールの承認を要求した                                                                                                                                                                                                                                                                                            |
| `permission_resolved`     | 何らかのクライアントが `POST /permission/:requestId` 経由でパーミッションに投票した                                                                                                                                                                                                                                                      |
| `permission_partial_vote` | （コンセンサスのみ）投票が記録されたが、まだ定足数に達していません。`{requestId, sessionId, votesReceived, votesNeeded, quorum, optionTallies}` を運びます。プレフライト `caps.features.permission_mediation`。                                                                                                                   |
| `permission_forbidden`    | 投票がアクティブなポリシーによって拒否されました（`designated` の不一致、`local-only` の非ループバック、または `consensus` の投票者がスナップショットにいない）。`{requestId, sessionId, clientId?, reason}` を運びます。プレフライト `caps.features.permission_mediation`。                                                                                 |
| `model_switched`          | `POST /session/:id/model` が成功した                                                                                                                                                                                                                                                                                      |
| `model_switch_failed`     | `POST /session/:id/model` が拒否された                                                                                                                                                                                                                                                                                       |
| `session_died`            | エージェントの子プロセスが予期せずクラッシュしました。**終端: このフレームの後に SSE ストリームが閉じます。セッションは `byId` から削除されます。** サブスクライバーは `POST /session` 経由で再接続し、新しいセッションを生成する必要があります。                                                                                                                              |
| `slow_client_warning`     | サブスクライバーローカル: キューが 75% 以上埋まっています。**非終端** — ストリームは継続します。この警告は強制排除前の事前通知です。`{queueSize, maxQueued, lastEventId}` を運びます。オーバーフローエピソードごとに 1 回のみ発生し、キューが 37.5% 未満にドレインした後に再武装します。`id` なし（合成）。プレフライト `caps.features.slow_client_warning`。 |
| `client_evicted`          | サブスクライバーローカル: キューオーバーフロー。**終端: このフレームの後に SSE ストリームが閉じます**（`id` なし — 合成）。同じセッション上の他のサブスクライバーは継続します。                                                                                                                                                                |
| `stream_error`            | ファンアウト中のデーモン側エラー。**終端: このフレームの後に SSE ストリームが閉じます**（`id` なし — 合成）。                                                                                                                                                                                                                |

再接続のセマンティクス:

- `Last-Event-ID: <n>` を送信して、セッションごとのリングから `id > n` のイベントをリプレイします（デフォルトの深さは **8000**、`qwen serve --event-ring-size <n>` で調整可能）。
- **ギャップ検出（クライアント側）:** `<n>` がリング内にまだ残っている最も古いイベントより過去の場合（例: `Last-Event-ID: 50` で再接続したが、リングには現在 200〜1199 しか保持されていない）、デーモンはエラーを発生させずに利用可能な最も古いイベントからリプレイします。最初のリプレイされたイベントの `id` を `n + 1` と比較してください。差分が失われたウィンドウのサイズです。Stage 2 ではデーモン側で明示的な `stream_gap` 合成フレームが注入されますが、Stage 1 では検出はクライアントの責任です。
- ID はセッションごとに単調増加であり、1 から始まります。
- 合成フレーム（`client_evicted`、`slow_client_warning`、`stream_error`）は、他のサブスクライバーのシーケンススロットを消費しないよう、意図的に `id` を省略しています。

バックプレッシャー:

- サブスクライバーごとのキューのデフォルトは、ライブアイテム `maxQueued: 256` です（再接続時のリプレイフレームは上限をバイパスします）。SSE リクエストで `?maxQueued=N`（範囲 `[16, 2048]`）を使用してオーバーライドします。
- サブスクライバーのキューが 75% 埋まると、バスはそのサブスクライバーに `slow_client_warning` 合成フレームを強制プッシュします（オーバーフローエピソードごとに 1 回。37.5% 未満にドレインした後に再武装されます）。ストリームはオープンなままです。この警告は、クライアントがより速くドレインするか、クリーンにデタッチして再接続するための事前通知です。
- キューが実際に警告をオーバーフローした場合、バスは `client_evicted` 終端フレームを発行し、サブスクリプションを閉じます。

### `POST /permission/:requestId`

保留中の `permission_request` に投票します。アクティブな**調停ポリシー**が勝者を決定します:

| ポリシー                      | 動作                                                                                                                                                                                              |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `first-responder`（デフォルト） | 検証された最初の投票者が勝利します。後の投票者は `404` を受け取ります。F3 以前のベースライン。                                                                                                                                    |
| `designated`                | プロンプトの起案者（`originatorClientId`）のみが決定します。起案者以外は無記名プロンプトの場合、`403 permission_forbidden / designated_mismatch` を受け取るか、`first-responder` にフォールバックします。                 |
| `consensus`                 | M 人中 N 人の投票者が合意する必要があります（デフォルト `N = floor(M/2) + 1`、`policy.consensusQuorum` でオーバーライド可能）。最初に `N` に達したオプションが勝利します。解決に至らない投票は `200` と `permission_partial_vote` SSE フレームを受け取ります。 |
| `local-only`                | ループバック投票者のみが決定します。リモート呼び出し元は `403 permission_forbidden / remote_not_allowed` を受け取ります。                                                                                                      |

アクティブなポリシーは `settings.json` の `policy.permissionStrategy` で設定され、`/capabilities` の `body.policy.permission` で公開されます。ビルドでサポートされているセットについては、プレフライト `caps.features.permission_mediation`（`modes: [...]` 付き）を使用します。

> **F3 (#4175): マルチクライアントのパーミッション調整。** F3 は上記の 4 つのポリシーを追加しました。F3 以前のデーモンは first-responder をハードコードしていましたが、設定されたポリシーが `first-responder` の場合、ワイヤー形状はビット単位で変更されません。新しいイベント（`permission_partial_vote`、`permission_forbidden`）は追加的なものであり、古い SDK はこれらを `unrecognized_known_event` として認識し、適切に無視します。

> **パーミッションのタイムアウト（デフォルト 5 分）。** `permission_request` は、以下のいずれかが発生するまで保留状態のままです: (a) 何らかのクライアントがここで投票する、(b) `POST /session/:id/cancel` が発行される、(c) プロンプトを駆動している HTTP クライアントが切断される（プロンプト中のキャンセルは保留中のパーミッションを `cancelled` として解決します）、(d) セッションがキルされる、(e) デーモンがシャットダウンする、**または (f) セッションごとのパーミッションタイムアウトが発生する**（`DEFAULT_PERMISSION_TIMEOUT_MS`、5 分）。タイムアウトが発生すると、エージェントの `requestPermission` は `{outcome: 'cancelled'}` として解決され、監査リングに `permission.timeout` エントリが記録され、デーモンの stderr に 1 行のパンくずリストが出力され、SSE バスが標準の `permission_resolved` cancelled フレームをファンアウトしてサブスクライバーがクリーンアップできるようにします。タイムアウトは `BridgeOptions.permissionResponseTimeoutMs` 経由で設定可能です。長期プロンプトを実行するヘッドレス呼び出し元は、これを延長することをお勧めします。

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

- `{ "outcome": "selected", "optionId": "<one-of-the-options>" }` — エージェントが提示した選択肢に従って、accept / reject / proceed-once などを選択
- `{ "outcome": "cancelled" }` — リクエストを破棄する（内部的に `cancelSession` / `shutdown` が行う動作と一致）

レスポンス:

- `200 {}` — あなたの投票が受け入れられました（解決された、またはコンセンサスの定足数のもとで記録された）
- `403 { "code": "permission_forbidden", "reason": "designated_mismatch" | "remote_not_allowed", "requestId", "sessionId" }` — F3: アクティブなポリシーがあなたの投票を拒否しました
- `404 { "error": "..." }` — requestId が不明です（すでに解決済み、存在しなかった、またはセッションが破棄された）
- `500 { "code": "cancel_sentinel_collision", ... }` — F3: エージェントの `allowedOptionIds` に予約済みのセンチネル `'__cancelled__'` が含まれています。エージェント / デーモンの契約違反です
- `501 { "code": "permission_policy_not_implemented", "policy": "<name>" }` — F3 の前方互換性: ポリシーリテラルがスキーマに追加されましたが、その調停ブランチはまだビルドされていません（現在到達不能。将来のポリシー用に予約）

投票が成功した後、接続されているすべてのクライアントは、同じ `requestId` と選択された `outcome` を含む `permission_resolved` を確認します。`consensus` のもとでは、定足数に達するまで、中間投票が追加で `permission_partial_vote` をファンアウトします。

### Auth デバイスフロールート（issue #4175 PR 21）

デーモンは OAuth 2.0 デバイス認証グラント（RFC 8628）を仲介し、リモート SDK クライアントがログインをトリガーできるようにします。この際、トークンはクライアントではなく**デーモン**のファイルシステムに保存されます。デーモン自身が IdP をポーリングし、クライアントの唯一の役割は検証 URL とユーザーコードを表示し、（オプションで）完了イベントのために SSE をサブスクライブすることです。

ケイパビリティタグ: `auth_device_flow`（常にアドバタイズされます）。v1 でサポートされているプロバイダー: `qwen-oauth`。

> [!note]
>
> Qwen OAuth の無料枠は 2026-04-15 に廃止されました。このプロトコルでは `qwen-oauth` をレガシーな v1 プロバイダー識別子として扱ってください。新しいクライアントは、現在サポートされている認証プロバイダーが利用可能な場合、そちらを優先する必要があります。

**ランタイムのローカリティ。** デーモンは、たとえ可能であってもブラウザを起動しません。クライアントがローカルで `open(verificationUri)` を呼び出すかどうかを決定します。ヘッドレスポッド（典型的な Mode B デプロイメント）では、ユーザーはブラウザを持っている任意のデバイスで URL を開きます。推奨される UX については `docs/users/qwen-serve.md` を参照してください。

**イベントにおけるトークンの漏洩なし。** `auth_device_flow_started` は `{deviceFlowId, providerId, expiresAt}` のみを運びます。ユーザーコードと検証 URL は、POST 201 ボディおよび `GET /workspace/auth/device-flow/:id` 経由でポイントツーポイントで返され、SSE でブロードキャストされることはありません。

**プロバイダーごとのシングルトン。** フローが保留中に同じプロバイダーに対して 2 回目の `POST` を行うと、冪等な引き継ぎとなります。新しい IdP リクエストを開始するのではなく、既存のエントリを `attached: true` として返します。

#### `POST /workspace/auth/device-flow`

厳格なミューテーションゲート: トークンなしのループバックデフォルトであってもベアラートークンを要求します（`401 token_required`）。

リクエスト:

```json
{ "providerId": "qwen-oauth" }
```

レスポンス（`201` 新規開始、`200` 冪等な引き継ぎ）:

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

現在の状態を読み取ります。保留中のエントリは `userCode/verificationUri/expiresAt/intervalMs` をエコーバックします。終端エントリ（5 分の猶予）はそれらをドロップし、`status` とオプションの `errorKind/hint` を公開します。

不明な ID および猶予後に排除されたエントリには `404 device_flow_not_found` を返します。

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

#### デバイスフロー SSE イベント

5 つの型付きイベント（ワークスペーススコープ、アクティブなセッションバスごとにファンアウト）:

- `auth_device_flow_started` `{deviceFlowId, providerId, expiresAt}` — POST が成功しました。SDK はサブスクライブする必要があります（ここに userCode は含まれないため、必要に応じて GET で取得してください）
- `auth_device_flow_throttled` `{deviceFlowId, intervalMs}` — デーモンがアップストリームの `slow_down` を尊重しました。GET をポーリングしているクライアントは、間隔をこれに合わせて増やす必要があります
- `auth_device_flow_authorized` `{deviceFlowId, providerId, expiresAt?, accountAlias?}` — 認証情報が永続化されました。`accountAlias` は非 PII のラベルです（メール/電話番号は含まれません）
- `auth_device_flow_failed` `{deviceFlowId, errorKind, hint?}` — 終端。`errorKind` は `expired_token | access_denied | invalid_grant | upstream_error | persist_failed` のいずれかです。`persist_failed` はデーモン内部のエラーです。IdP との交換には成功しましたが、デーモンが認証情報を永続的に保存できませんでした（EACCES / EROFS / ENOSPC）。ユーザーは、基盤となるディスクの状態が修正された後に再試行する必要があります。
- `auth_device_flow_cancelled` `{deviceFlowId}` — 保留中のエントリに対して DELETE が成功しました
> **MCP 非対応。** MCP 認可仕様 (2025-06-18) は、リダイレクトコールバックを伴う OAuth 2.1 + PKCE 認可コードを必須としていますが、これはヘッドレス Pod のデーモンでは機能しません。モード B のデバイスフローのインターフェースはデーモン専用です。MCP 準拠のサーバーをターゲットにするクライアントは、別の認可パスを使用する必要があります。

## ストリーミングのワイヤフォーマット

イベントは標準の EventSource フレームとして出力されます。デーモンはフレームごとに 1 行の `data:` を書き込みます（`JSON.stringify` 後の JSON に埋め込み改行はありません）。`packages/sdk-typescript/src/daemon/sse.ts` にある SDK パーサーは、受信側でこれと、仕様で許可されている複数の `data:` を持つ形式の両方を処理します。

## ストリーミング中のエラーフレーム

SSE サブスクライバーへのサービス提供中にブリッジイテレーターが例外をスローした場合、デーモンは終端の `stream_error` フレーム（`id` なし）を出力します。`data:` 行は完全なエンベロープです（このドキュメント内の他のすべての SSE フレームと同じ形状）。実際のエラーメッセージは `envelope.data.error` に格納されています。

```
event: stream_error
data: {"v":1,"type":"stream_error","data":{"error":"<message>"}}
```

その後、接続は閉じられます。

## 環境変数

| 変数                | 目的                                                           |
| ------------------- | -------------------------------------------------------------- |
| `QWEN_SERVER_TOKEN` | Bearer トークン。起動時に先頭と末尾の空白文字は削除されます。 |

## ソース構成

| パス                                                 | 目的                                                                                                       |
| ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `packages/cli/src/commands/serve.ts`                 | yargs コマンド + フラグスキーマ                                                                            |
| `packages/cli/src/serve/run-qwen-serve.ts`           | リスナーのライフサイクル + シグナルハンドリング                                                            |
| `packages/cli/src/serve/server.ts`                   | Express アプリケーションのアセンブリ、ミドルウェアの順序、残りのダイレクトルート                           |
| `packages/cli/src/serve/routes/*.ts`                 | セッション、SSE、ワークスペース認証、ワークスペースステータス、ファイルルートを含む、焦点を絞った Express ルートグループ |
| `packages/cli/src/serve/auth.ts`                     | Bearer 認証 + ホスト許可リスト + CORS 拒否                                                                 |
| `packages/cli/src/serve/acp-session-bridge.ts`       | spawn-or-attach、セッションごとの FIFO、権限レジストリのための CLI ローカルブリッジ互換性ファサード        |
| `packages/acp-bridge/src/status.ts`                  | 読み取り専用デーモンステータスのワイヤ型 + `ServeErrorKind` + `BridgeTimeoutError` + `mapDomainErrorToErrorKind` |
| `packages/cli/src/serve/env-snapshot.ts`             | 認証情報のリダクションを含め、`process.*` の状態から `/workspace/env` ペイロードを構築する純粋なヘルパー   |
| `packages/acp-bridge/src/eventBus.ts`                | 制限付き非同期キュー + リプレイリング                                                                      |
| `packages/sdk-typescript/src/daemon/DaemonClient.ts` | TS クライアント                                                                                            |
| `packages/sdk-typescript/src/daemon/sse.ts`          | EventSource フレームパーサー                                                                               |
| `integration-tests/cli/qwen-serve-routes.test.ts`    | 18 ケース、LLM なし                                                                                        |
| `integration-tests/cli/qwen-serve-streaming.test.ts` | 3 ケース、ローカルのフェイク OpenAI サーバーによってバックエンドされる実際の `qwen --acp` 子プロセス（POSIX のみ。Windows ではスキップ） |