# `qwen serve` HTTP プロトコルリファレンス

これは [qwen-code デーモン設計](https://github.com/QwenLM/qwen-code/issues/3803) のステージ 1 です。すべてのルートはデーモンのベース URL（デフォルト `http://127.0.0.1:4170`）に配置されます。

## 認証

デーモンが `--token` または `QWEN_SERVER_TOKEN` で起動された場合、**ループバック上の `/health` を除くすべてのルート** は以下を保持する必要があります：

```
Authorization: Bearer <token>
```

トークンが設定されていない場合（ループバック開発デフォルト）、このヘッダーはオプションです。トークン比較は定数時間で行われます。401 応答は `ヘッダー欠落` / `スキーム誤り` / `トークン誤り` のいずれに対しても統一されています。

**`/health` 例外**（Bctum）：ループバックバインド（`127.0.0.1` / `localhost` / `::1` / `[::1]`）では、`/health` はベアラーミドルウェアの**前**に登録されるため、ポッド内の liveness プローブはデーモンが `--token` で起動された場合でもトークンを保持する必要がありません。非ループバックバインド（`--hostname 0.0.0.0` など）では、`/health` も他のルートと同様にベアラーの後ろに配置されます — 理由については [`GET /health`](#get-health) セクションを参照してください。

**`--require-auth`（#4175 PR 15）。** 起動時にこのフラグを渡すと、「トークン必須」ルールがループバックにも拡張されます。トークンなしでは起動に失敗します。`/health` 例外は削除されます（そのため `/health` も `Authorization: Bearer …` が必要になります）。

このフラグが有効な場合、グローバルな `bearerAuth` ミドルウェアが **すべての** ルート（`/capabilities` を含む）をゲートします。したがって、**認証されていない** クライアントは `caps.features` をプリフライトして認証が必要であることを発見できません。その場合の発見面は **401 応答ボディ** そのものです（[認証](#認証)セクションの通り、すべてのルートで統一）。`require_auth` 機能タグは **認証後の確認** です — クライアントが正常に認証し `/capabilities` を読み取ると、タグの存在はデーモンが `--require-auth` で起動されたことを確認します（監査 / コンプライアンス UI や、SDK クライアントが設定パネルに「このデプロイメントは強化されています」と表示するのに便利）。ルートごとの厳格モードにオプトインするミューテーションルート（Wave 4 フォローアップ）は、トークンなしのループバックデフォルトで到達された場合、`401 { code: "token_required", error: "…" }` で拒否します。ただし、`--require-auth` が有効な場合、グローバルベアラーミドルウェアがルートごとのゲートよりも先にリクエストをショートサーキットするため、認証されていない呼び出し元が実際に目にするのは従来の `Unauthorized` ボディです。

**`--allow-origin <pattern>`（T2.4 [#4514](https://github.com/QwenLM/qwen-code/issues/4514)）。** ブラウザの WebUI がクロスオリジンでデーモンにアクセスする場合、デフォルトでブロックされます — `Origin` ヘッダーを含むリクエストはすべて `403 {"error":"Request denied by CORS policy"}` を返します。これは、CLI/SDK クライアントは決して `Origin` を送信せず、デーモンはその存在をオペレーターがオプトインしていないブラウザコンテキストからのリクエストの兆候として扱うためです。起動時に `--allow-origin <pattern>`（繰り返し可能）を渡すと、壁の代わりに許可リストをインストールします。各パターンは次のいずれかです：

- リテラルの `*` — 任意のオリジンを許可します。**リスクあり**：ベアラートークンが設定されていない状態で `*` が設定されている場合、起動は拒否されます（任意のソース：`--token`、`QWEN_SERVER_TOKEN`、または起動時にトークンを必須とする `--require-auth`）。起動時のブレッドクラムは、`*` がリストにある場合 stderr に警告を出力します。**推奨**：ループバックバインドでは `--require-auth` と組み合わせて、`/health` と `/demo` もベアラーでゲートされるようにします（これらはデフォルトでループバック上ではベアラーミドルウェアの前に登録されるため、k8s/Compose プローブはトークンなしで `/health` に到達できます）。`*` 許可リストはこれらを任意のクロスオリジンブラウザから到達可能にします。非ループバックバインドではベアラーが起動時にすでに必須であるため、`*` の露出面は `/health`（ステータス JSON）と `/demo`（JS が依然としてトークンゲートされたルートを呼び出す静的ページ）のみです — 実際の API 面は関係なくゲートされています。
- 正規の URL オリジン — `<scheme>://<host>[:<port>]`。**末尾スラッシュなし、パスなし、ユーザー情報なし、クエリなし。** エントリが往復 `new URL(pattern).origin === pattern` に失敗した場合、起動は `InvalidAllowOriginPatternError` で拒否します。エラーメッセージは不正なパターンと正規形式を指定します。厳格に意図されています：サイレント正規化（例：末尾スラッシュのトリミング）はタイプミスをすり抜けさせ、あいまいな入力を許容します。

一致したオリジンは、すべてのリクエストで標準の CORS 応答ヘッダーを受け取ります：

```
Access-Control-Allow-Origin: <エコーされたオリジン>
Vary: Origin
Access-Control-Allow-Methods: GET, POST, PATCH, DELETE, OPTIONS
Access-Control-Allow-Headers: Authorization, Content-Type, X-Qwen-Client-Id, Last-Event-ID
Access-Control-Max-Age: 86400
Access-Control-Expose-Headers: Retry-After
```

`Access-Control-Allow-Origin` は、`*` パターンの下でも、リテラルの `*` ではなく、リクエストのオリジンをそのまま（ブラウザが送信した小文字/大文字で）エコーします。ブラウザキャッシュはそれと `Vary: Origin` のペアで応答をキーとしており、エコーすることで将来のリリースでスキーマ変更なしに `Access-Control-Allow-Credentials` を追加する余地が残ります。`Access-Control-Expose-Headers: Retry-After` により、ブラウザ WebUI は `429` / `503` 応答からのデーモン再試行ヒントを尊重できます。`Access-Control-Allow-Credentials` は現在 **送信されません**：デーモンは `Authorization` 内のベアラーを介して認証し、これは `credentials: 'include'` なしでクロスオリジンで機能します。

OPTIONS プリフライトリクエスト（`Access-Control-Request-Method` または `Access-Control-Request-Headers` を含む OPTIONS）は `204 No Content` と上記のヘッダーでショートサーキットされます。これは従来の CORS パターンであり安全です — プリフライトはデーモンが受け入れるメソッド/ヘッダーを確認するだけであり、実際の後続リクエストは引き続き完全なチェーン（ホスト許可リスト → ベアラー認証 → ルート）を実行するため、状態が読み取られたり変更されたりする前に、DNS リバインディング対策とベアラー強制がまだ発動します。一致したオリジンからのプレーンな OPTIONS リクエストは、CORS ヘッダーが付加された状態で下流に流れ続けます。

許可リストに一致しないオリジンは、引き続き `403 {"error":"Request denied by CORS policy"}` を受け取ります — デフォルトの壁と同じエンベロープなので、壁の応答をすでに解析しているクライアントは、許可リストがデプロイされたデーモンのために特別な処理をする必要はありません。拒否パスは **一切** `Access-Control-*` ヘッダーを出力しません（ブラウザは無視し、出力するとヘッダーの存在を通じて許可リストのサイズを間接的に宣伝することになります）。

設定されたパターンリストは意図的に `/capabilities` にエコーされません — ブラウザ WebUI は自分のオリジンをすでに知っており（結局デーモンを呼び出したのです）、リストを公開すると `/capabilities` の認証されていない読み取り元がすべての信頼されたオリジンを列挙できるようになります（設定ミスのデプロイメントにとって有用な偵察情報）。SDK クライアントは、特定のオリジンを把握する必要なく、`caps.features.allow_origin` タグで「このデーモンはクロスオリジンブラウザヒットを許可する」ことをゲートします。

ループバック自己発信リクエスト（例：`/demo` ページが同じ `127.0.0.1:port` のデーモンを呼び出す場合）は、CORS ミドルウェアの**前**に実行される**別の** Origin ストリップシムによって処理され、`127.0.0.1:port` / `localhost:port` / `[::1]:port` / `host.docker.internal:port` の `Origin` ヘッダーを削除します。そのため、これらのリクエストは `--allow-origin` 設定に関係なく通過します — オペレーターはデモページを機能させるためにデーモン自身のポートをリストする必要はありません。

## 共通エラー形状

5xx 応答は、元のエラーの `code` と `data` が存在する場合、それらを保持します（JSON-RPC スタイル — ACP SDK はエージェントから `{code, message, data}` を転送します）：

```json
{
  "error": "Internal error",
  "code": -32000,
  "data": { "reason": "model quota exceeded" }
}
```

リクエストボディの不正な JSON は以下を返します：

```json
{ "error": "Invalid JSON in request body" }
```

ステータス `400` で。

未知のセッション ID に対する `SessionNotFoundError` は以下を返します：

```json
{ "error": "No session with id \"<sid>\"", "sessionId": "<sid>" }
```

ステータス `404` で。

`cwd` がデーモンのバインドされたワークスペースに正規化されない `POST /session` に対する `WorkspaceMismatchError`（#3803 §02 — 1 デーモン = 1 ワークスペース）は `400` で以下を返します：

```json
{
  "error": "Workspace mismatch: daemon is bound to \"…\" but request asked for \"…\". …",
  "code": "workspace_mismatch",
  "boundWorkspace": "/path/the/daemon/binds",
  "requestedWorkspace": "/path/in/the/request"
}
```

これを使用して不一致を事前検出します：`/capabilities` から `workspaceCwd` を読み取り、`POST /session` から `cwd` を省略する（バインドされたワークスペースにフォールバックします）か、リクエストを `requestedWorkspace` にバインドされたデーモンにルーティングします。

デーモンの `--max-sessions` 上限を超えた `POST /session` は、`Retry-After: 5` ヘッダーとともに `503` を返し、以下を返します：

```json
{
  "error": "Session limit reached (20)",
  "code": "session_limit_exceeded",
  "limit": 20
}
```

既存のセッションへのアタッチは上限にカウントされないため、アイドル状態のデーモンの再接続は容量に達していても引き続き機能します。

`RestoreInProgressError` — `POST /session/:id/load` と `POST /session/:id/resume` のみによって発行されます — `409` と `Retry-After: 5` ヘッダー（`session_limit_exceeded` と一致）を返し、以下を返します：

```json
{
  "error": "Session \"<sid>\" is already being restored via session/<resume|load>; retry session/<load|resume> after it completes",
  "code": "restore_in_progress",
  "sessionId": "<sid>",
  "activeAction": "load",
  "requestedAction": "resume"
}
```

`session/load` がすでに `session/resume` が進行中の ID に対して発行された場合（またはその逆）に発動します。少なくとも `Retry-After` 秒待ってから再試行してください — 基盤となる復元は `initTimeoutMs`（デフォルト 10 秒）以内に完了します。同じアクションの競合（`load` 対 `load`、`resume` 対 `resume`）は、エラーにする代わりに結合されます。

## 機能

デーモンは、サーブ機能レジストリからサポートされている機能タグをアドバタイズします。クライアントは、`features` に基づいて UI をゲートする必要があり、`mode` に基づいては**いけません**（設計 §10 による）。

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

> 条件付きタグは、対応するデプロイメントトグルがオンの場合にのみ表示されます（下の表を参照）。F3 の `permission_mediation` タグは常にオンであり、`modes: ['first-responder', 'designated', 'consensus', 'local-only']` を保持するため、SDK クライアントはビルドでサポートされているセットをイントロスペクトできます。実行時アクティブな戦略は `body.policy.permission` にあります。

`session_scope_override` は、`POST /session` のリクエストごとの `sessionScope` フィールドのネゴシエーションハンドルです（下記参照）。古いデーモンはこのフィールドをサイレントに無視するため、SDK クライアントは送信する前に `caps.features` でこのタグをプリフライトする必要があります。

`session_load` と `session_resume` は、明示的な復元ルート（`POST /session/:id/load` と `POST /session/:id/resume`）をアドバタイズします。古いデーモンはこれらのパスに対して `404` を返すため、SDK クライアントは呼び出す前に `caps.features` をプリフライトする必要があります。`unstable_session_resume` は、基盤となる ACP メソッドが `connection.unstable_resumeSession` と名付けられていた間に出荷された SDK との互換性のために、非推奨のエイリアスとして引き続きアドバタイズされます。新しいクライアントは `session_resume` でゲートする必要があります。

`slow_client_warning` は、#4175 Wave 2.5 PR 10 で導入された 2 つの同時リリースされた SSE バックプレッシャーノブをカバーします：(a) デーモンは、サブスクライバーのキューが 75% を超えると、オーバーフローエピソードごとに 1 回、合成 `slow_client_warning` イベントストリームフレームを発行します（キューが 37.5% を下回って排出された後に再武装されます）。(b) `GET /session/:id/events` は、大きなリプレイリングに対するコールド再接続のためにサブスクライバーごとのバックログを事前にサイズ設定する `?maxQueued=N` クエリパラメータ（範囲 `[16, 2048]`）を受け入れます。デーモン全体のリングサイズは `--event-ring-size`（デフォルト **8000**、#3803 §02 による）で制御されます。古いデーモンはサイレントに両方を欠いています — オプトインする前にこのタグをプリフライトしてください。

`typed_event_schema` は、SDK の `KnownDaemonEvent` スキーマに一致するデーモンイベントペイロードをアドバタイズします。古いデーモンは互換性のあるフレームをストリームする可能性がありますが、SDK クライアントは型付きイベントカバレッジを想定する前にこのタグをプリフライトする必要があります。

`client_heartbeat` は `POST /session/:id/heartbeat` をアドバタイズします。古いデーモンは `404` を返します。定期的なハートビートを発行する前にこのタグをプリフライトしてください。

`session_close` と `session_metadata` は、`DELETE /session/:id` と `PATCH /session/:id/metadata` をアドバタイズします。古いデーモンは `404` を返します。クローズまたは名前変更のアフォーダンスを公開する前にこれらのタグをプリフライトしてください。

`session_lsp` は、デーモンクライアント向けの読み取り専用の構造化 LSP ステータススナップショットである `GET /session/:id/lsp` をアドバタイズします。古いデーモンは `404` を返します。リモート LSP ステータスを公開する前にこのタグをプリフライトしてください。

`session_status` は、ID による単一セッションのライブブリッジサマリー（`clientCount` / `hasActivePrompt` およびコアフィールド）である `GET /session/:id/status` をアドバタイズします。古いデーモンは `404` を返します。完全なセッションリストをスキャンする代わりに、単一セッションのステータスをポーリングする前にこのタグをプリフライトしてください。

`session_approval_mode_control`、`workspace_tool_toggle`、`workspace_init`、`workspace_mcp_restart`（issue [#4175](https://github.com/QwenLM/qwen-code/issues/4175) PR 17）は、下記「ミューテーション：承認、ツール、init、MCP 再起動」に記載されている 4 つのミューテーション制御ルートをアドバタイズします。4 つすべては PR 15 ミューテーションゲートによって厳格にゲートされます（ベアラートークンなしで構成されたデーモンはそれらを 401 `token_required` で拒否します）。古いデーモンは `404` を返します。対応するアフォーダンスを公開する前に各タグをプリフライトしてください。

`mcp_guardrails`（issue [#4175](https://github.com/QwenLM/qwen-code/issues/4175) PR 14）は MCP バジェットサーフェスをカバーします：`GET /workspace/mcp` の `clientCount` / `clientBudget` / `budgetMode` / `budgets[]` フィールド、サーバーごとのセルの `disabledReason` フィールド、および `--mcp-client-budget` / `--mcp-budget-mode` CLI フラグ。古いデーモンは新しいフィールドを完全に省略します。SDK クライアントは `budgets[]` セマンティクスに依存する前にこのタグをプリフライトします。レジストリ記述子は、将来の機能モード公開のために `modes: ['warn', 'enforce']` も保持します — 現時点では、クライアントはスナップショットの `budgetMode` フィールドからモードを推測します。`enforce` モードでのサーバー拒否は `Object.entries(mcpServers)` の宣言順序によって決定論的です。将来のスコープ優先順位レイヤー（qwen-code が採用する場合）は、これを「最低優先順位優先」にシフトし、claude-code の `plugin < user < project < local` 規則を反映します。

> ⚠️ **PR 14 v1 の範囲：ワークスペース単位ではなくセッション単位。** デーモン内の各 ACP セッションは、独自の `Config` + `McpClientManager` を構築します（`acpAgent.newSessionConfig` 経由）。バジェットキャップはライブ MCP クライアントを**セッションごとに**制限します。各セッションは転送された env から `QWEN_SERVE_MCP_CLIENT_BUDGET` を個別に読み取ります。`--mcp-client-budget=10` で 5 つの同時 ACP セッションがある場合、デーモン全体の実際のライブ MCP クライアント数は 5 × 10 = 50 に達する可能性があります。`GET /workspace/mcp` スナップショットは**ブートストラップセッションの** `McpClientManager` アカウンティングのみを読み取ります — `budgets[0].scope: 'session'` の値は、これがセッション単位であり、集約されていないことを示す正直なシグナルです。**Wave 5 PR 23（共有 MCP プール）** では、ワークスペーススコープのマネージャーが導入され、真のクロスセッション集約のためにセッション単位のセルと並んで `scope: 'workspace'` のセルが追加されます。v1 は、PR 23 が基盤とするインプロセスカウンター + ソフト強制の基盤です。

`workspace_file_read` は、テキスト/リスト/stat/glob ワークスペースファイルルート（`GET /file`、`GET /list`、`GET /glob`、`GET /stat`）をカバーします。`workspace_file_bytes` は `GET /file/bytes` をカバーします。これは後で追加されたため、クライアントは PR19 時代のデーモンに対して raw バイトウィンドウサポートをプリフライトできます。`workspace_file_write` は、ハッシュ対応テキストミューテーションルート（`POST /file/write`、`POST /file/edit`）をカバーします。書き込みタグはルート契約が存在することを意味します。現在のデプロイメントが匿名ミューテーションに対してオープンであることを意味するものではありません。書き込み/編集は厳格なミューテーションルートであり、ループバック上でも設定済みのベアラートークンが必要です。

`daemon_status` は、以下に記載されている統合された読み取り専用オペレーター診断スナップショットである `GET /daemon/status` をアドバタイズします。

**条件付きタグ。** 少数の機能タグは、対応するデプロイメントトグルがオンの場合にのみアドバタイズされます。タグの存在 = 動作がオン。欠落 = タグより前の古いデーモン、またはオペレーターがオプトインしなかった現在のデーモンのいずれか。現在：

| タグ | アドバタイズされる条件 |
| --- | --- |
| `require_auth` | デーモンが `--require-auth`（または組み込み API 経由の `requireAuth: true`）で起動された場合。ベアラートークンはすべてのルートで必須であり、ループバックバインド上の `/health` も含まれます。 |
| `mcp_workspace_pool` | 共有 MCP トランスポートプールがアクティブな場合。`QWEN_SERVE_NO_MCP_POOL=1` がプールを無効にすると省略されます。 |
| `mcp_pool_restart` | 共有 MCP トランスポートプールがアクティブな場合。再起動応答にはプール対応の複数エントリ形状が含まれる場合があります。 |
| `allow_origin` | T2.4（[#4514](https://github.com/QwenLM/qwen-code/issues/4514)）。デーモンが少なくとも 1 つの `--allow-origin <pattern>`（または組み込み API 経由の `allowOrigins: [...]`）で起動された場合。一致したオリジンからのクロスオリジンリクエストは適切な CORS 応答ヘッダーを受け取ります。一致しないオリジンは引き続きデフォルトの 403 を受け取ります。設定されたパターンリストは、信頼されたオリジンセットが認証されていない読み取り元に漏洩するのを防ぐために、意図的に `/capabilities` にエコーされません — ブラウザ WebUI は自分のオリジンをすでに知っています。 |
| `prompt_absolute_deadline` | `--prompt-deadline-ms` / `QWEN_SERVE_PROMPT_DEADLINE_MS` / `ServeOptions.promptDeadlineMs` が正の整数に設定されている場合。 |
| `writer_idle_timeout` | `--writer-idle-timeout-ms` / `QWEN_SERVE_WRITER_IDLE_TIMEOUT_MS` / `ServeOptions.writerIdleTimeoutMs` が正の整数に設定されている場合。 |
| `workspace_settings` | デーモンが設定永続化が利用可能な状態で作成された場合。 |
| `session_shell_command` | セッションシェル実行が明示的に有効になっている場合。 |
| `rate_limit` | `--rate-limit` / `QWEN_SERVE_RATE_LIMIT=1` / `ServeOptions.rateLimit` が有効な場合。 |
| `workspace_reload` | 組み込みルート設定でワークスペースリロードサポートが利用可能な場合。 |
`mcp_guardrails` はこの条件付きテーブルには**含まれません**。これは常時有効なタグであり、バイナリが新しい `/workspace/mcp` バジェットフィールドをサポートしている場合、オペレーターがバジェットを設定したかどうかに関係なく、常に通知されます。`--mcp-client-budget` を設定していないオペレーターも、新しいフィールド（`budgetMode: 'off'`、`budgets: []`）を受け取ります。

`mcp_guardrail_events`（issue [#4175](https://github.com/QwenLM/qwen-code/issues/4175) PR 14b）は、型付けされたSSEプッシュイベントを通知します。これらのイベントは、ポールループなしでMCPバジェット状態の閾値超過を表面化します。`GET /session/:id/events` で2種類のフレームが到着します。

- `mcp_budget_warning` — `reservedSlots.size / clientBudget` が上昇側で75%に達したときに1回発火します。比率が37.5%（`MCP_BUDGET_REARM_FRACTION`）を下回った後にのみ再アームされます。PR 10の `slow_client_warning` ヒステリシスを模倣していますが、サブスクライバー単位のバックログレベルではなく、マネージャーレベルで動作します。ペイロード: `{ liveCount, reservedCount, budget, thresholdRatio: 0.75, mode: 'warn' | 'enforce' }`。`warn` および `enforce` モードの両方で発火し、`off` モードでは発火しません。
- `mcp_child_refused_batch` — 各 `discoverAllMcpTools*` パスの終了時に、1つ以上のサーバーが拒否された場合に発火します。また、`readResource` の遅延スポーン拒否パスでは長さ1のバッチとして発火します。ペイロード: `{ refusedServers: [{ name, transport, reason: 'budget_exhausted' }, ...], budget, liveCount, reservedCount, mode: 'enforce' }`。`mode` はリテラル `'enforce'` です。なぜなら、`warn` モードでは決して拒否しないからです。

両イベントはセッションごとのSSEリプレイリングに存在します（`id` を持ちます）。そのため、`Last-Event-ID` で再接続するクライアントは、それらを通じてイベントを再開できます。`GET /workspace/mcp` のスナップショットは、長時間の切断後の状態の信頼できる情報源として依然として使用されます。一度通知されると常に有効で、条件付きのトグルはありません。SDKのリデューサー状態（`DaemonSessionViewState`）は、単純な遅延スタイルのUIを望むアダプター向けに、`mcpBudgetWarningCount`、`lastMcpBudgetWarning`、`mcpChildRefusedBatchCount`、`lastMcpChildRefusedBatch` を公開します。

## ルート

### `GET /health`

生存性プローブ。デフォルトの形式では、リスナーが起動している場合に `200 {"status":"ok"}` を返します。安価で、ブリッジアクセスは不要で、高頻度のk8s/Compose生存性プローブに適しています。

`?deep=1`（`?deep=true` または単体の `?deep` も受け入れ）を渡すと、ブリッジの**カウンター**を公開するプローブになります（情報提供のみで、実際の生存性チェックではありません）。

```json
{ "status": "ok", "sessions": 3, "pendingPermissions": 1 }
```

> ⚠️ ディーププローブは**情報提供**であり、実際の生存性確認ではありません。カウンターアクセサー（`bridge.sessionCount`、`bridge.pendingPermissionCount`）を読み取りますが、これらは単純なMapサイズのゲッターです。個々の子プロセス/チャネルをpingしないため、動かなくなっているがカウントされているセッションを検出できません。これは、「このデーモンをローテーションから外す」トリガーではなく、キャパシティダッシュボード（現在の同時実行数 vs `--max-sessions`、キュー深度）に使用してください。カスタムブリッジ実装のゲッターがスローした場合、理論的には `503 {"status":"degraded"}` 応答が可能ですが、実際のブリッジのゲッターは決してスローしません。通常の運用では、ディーププローブは常に200を返します。実際の生存性は、リスナーがTCP接続をまったく受け入れるかどうか（つまり、`?deep` なしのデフォルトの `/health`）に依存します。

**認証:** ループバック以外のバインドでのみ**必須**です。ループバック（`127.0.0.1`、`::1`、`[::1]`）では、`/health` はベアラーミドルウェアの前に登録されるため、k8s/Composeプローブがポッド内でトークンを運ぶ必要はありません。ループバック以外（`--hostname 0.0.0.0` など）では、ルートはベアラーミドルウェアの後に登録され、有効なトークンがない場合は401を返します。そうしないと、認証されていない呼び出し元が任意のアドレスをプローブして `qwen serve` が存在することを確認でき、これは軽度の情報漏洩であり、ポートスキャンと組み合わせると問題になります。ループバック例外では、CORS拒否 + ホスト許可リストが引き続き適用されます。

### `GET /daemon/status`

読み取り専用のオペレーター診断。`/health` とは異なり、これは通常のデーモンAPIです。ループバックバインドを含め、ベアラー認証とレート制限の後に登録されます。クエリパラメータ:

- `detail=summary`（デフォルト）は、インメモリのデーモン状態のみを読み取ります。
- `detail=full` は、ライブセッション診断、ACP接続診断、認証デバイスフローカウント、およびワークスペースステータスセクションも含みます。
- その他の `detail` は `400 { "code": "invalid_detail" }` を返します。

`summary` は意図的にワークスペースステータスメソッドを照会せず、ACP子プロセスを起動せず、セッションを生成しません。`full` は各ワークスペースセクションを個別に照会します。タイムアウトまたは例外が発生した場合、そのセクションのみが `unavailable` としてマークされ、`workspace_status_unavailable` 問題が追加されます。

応答形式:

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

問題にエラー重大度がある場合 `status` は `error` になり、警告重大度がある場合は `warning` になり、それ以外の場合は `ok` になります。問題コードは安定しており、`session_capacity_high`、`connection_capacity_high`、`pending_permissions`、`acp_channel_down`、`preflight_error`、`mcp_budget_warning`、`mcp_budget_exhausted`、`rate_limit_hits`、`workspace_status_unavailable` が含まれます。リスナーの準備ができてから完全なランタイムがマウントされるまでの短いウィンドウでは、`/daemon/status` は `daemon_runtime_starting` を報告する場合があります。非同期ランタイムマウントが失敗した場合、非ステータスランタイムルートが `503` を返している間、`daemon_runtime_failed` を報告します。

セキュリティ: 応答には、ベアラートークン、クライアントID、完全なACP接続ID、デバイスフローユーザーコード、または確認URLは決して含まれません。`summary` はデーモンログパスを省略します。`full` は認証されたオペレーター向けにパスを含める場合があります。

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

安定したコントラクト: `v` が増分されると、フレームのレイアウトが後方互換性のない方法で変更されています。

> **`protocolVersions`** は、デーモンが話すことができるサーブプロトコルのバージョンを記述します。`current` はデーモンの推奨プロトコルバージョンであり、`supported` は互換性のあるセットです。特定のプロトコルを必要とするクライアントは `supported` をチェックする必要があります。機能固有のUIは、引き続き `features` でゲートする必要があります。v=1への追加: 古いv=1デーモンはこのフィールドを省略するため、古いビルドをターゲットとするSDKクライアントはこれをオプションとして扱う必要があります。

> **`modelServices` はステージ1では常に `[]` です。** エージェントは単一のデフォルトモデルサービスを使用し、それをワイヤー上で列挙しません。ステージ2では、登録されたモデルアダプターからこれを入力し、SDKクライアントがサービスピッカーを構築できるようにします。それまでは、このフィールドが空でないことに依存しないでください。

> **`workspaceCwd`** は、このデーモンがバインドする正規の絶対パスです（#3803 §02 — 1デーモン = 1ワークスペース）。これを使用して、(a) `/session` を投稿する前に不一致を検出し、(b) `POST /session` で `cwd` を省略します（ルートはこのパスにフォールバックします）。マルチワークスペースデプロイメントは、それぞれ独自の `workspaceCwd` を持つ異なるポートで複数のデーモンを公開します。v=1への追加: §02より前のv=1デーモンはこのフィールドを省略します。古いビルドをターゲットとするクライアントは、消費する前にnullチェックを行う必要があります。

### 読み取り専用ランタイムステータスルート

これらのルートは、デーモン側のランタイムスナップショットを報告します。これらは追加的なv1ルートであり、状態を変更せず、サーブプロトコルバージョンも変更しません。ワークスペースステータスルートは、クライアントがGETルートをポーリングしたという理由だけでACP子プロセスを**意図的に起動しません**。デーモンがアイドル状態の場合、`initialized: false` と空のスナップショットを返します。セッションステータスルートはライブセッションを必要とし、不明なIDには標準の `404 SessionNotFoundError` 形式を使用します。

機能タグ:

- `workspace_mcp` → `GET /workspace/mcp`
- `workspace_skills` → `GET /workspace/skills`
- `workspace_providers` → `GET /workspace/providers`
- `workspace_env` → `GET /workspace/env`
- `workspace_preflight` → `GET /workspace/preflight`
- `session_context` → `GET /session/:id/context`
- `session_supported_commands` → `GET /session/:id/supported-commands`
- `session_tasks` → `GET /session/:id/tasks`
- `session_status` → `GET /session/:id/status`

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

`errorKind` は、`/workspace/preflight`、`/workspace/env`、および（最終的には）MCPガードレールによって共有されるクローズド列挙型であり、SDKクライアントが自由形式のメッセージを解析する代わりに、カテゴリごとに修復をレンダリングできるようにします。PR 13（#4175）は上記の7つのリテラルを導入しました。PR 14は、出口プローブが導入されたら `blocked_egress` を投入します。

ステータスペイロードは、MCP環境値、ヘッダー、OAuth/サービスアカウントの詳細、プロバイダーAPIキー、プロバイダーの `baseUrl` / `envKey`、スキル本文、スキルファイルシステムパス、フック定義、またはシークレット環境変数の値を決して公開しません。`/workspace/env` はホワイトリストに登録されたenv varsの**存在**のみを報告します。プロキシURLは資格情報が削除され、ワイヤーに送信される前に `host:port` に縮小されます。

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

`discoveryState` は `not_started`、`in_progress`、または `completed` のいずれかです。`transport` は `stdio`、`sse`、`http`、`websocket`、`sdk`、または `unknown` のいずれかです。`errors` は発見が成功した場合には省略されます。

**MCPクライアントガードレール（issue [#4175](https://github.com/QwenLM/qwen-code/issues/4175) PR 14）。** PR 14以降のデーモンは、ペイロードを4つの追加フィールドと1つのワークスペースレベルセルで拡張します。

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

`budgetMode` は `enforce`、`warn`、または `off` のいずれかです。`clientBudget` はバジェットが設定されていない場合は存在しません。`budgets[]` は、PR 14以降のデーモンでは**常に配列**です（`budgetMode === 'off'` の場合は空の場合があります）。PR 14より前のデーモンはこのフィールドを完全に省略します。v1は `scope: 'session'` を持つ1つのセルを発行します（セッションごとの強制 — 理由については上記の機能セクションを参照）。コンシューマーは、認識されない `scope` 値を持つ追加の `budgets[]` エントリを許容する**必要があります**。Wave 5 PR 23は、スキーマバンプなしで、セッションごとのセルと一緒に `scope: 'workspace'`（または `'pool'`）を追加します。

サーバーごとのセルの `disabledReason` は、オペレーターによる無効化（`'config'` — `disabledMcpServers` 設定リスト）とバジェットによる拒否（`'budget'` — 発見されたが `enforce` モードのために決して接続されなかった）を区別します。拒否は `Object.entries(mcpServers)` の宣言順によって決定的です。サーバーごとの `status: 'error', errorKind: 'budget_exhausted'` は、生の `mcpStatus: 'disconnected'`（これは真ですが、オペレーターが直面する重大度ではありません）を隠蔽します。

PR 14 v1のバジェット強制は**ワークスペース単位ではなく、セッション単位**です。Mode Bデーモンはプロセスレベルで #4113 以降 `1デーモン = 1ワークスペース × Nセッション` ですが、`McpClientManager` は `acpAgent.newSessionConfig` を介して各ACPセッションの `Config` 内部で構築されるため、N個のセッションはそれぞれ独自の容量コピーを強制します。スナップショットはブートストラップセッションのビューを表します。Wave 5 PR 23は、ワークスペーススコープの共有MCPプールを導入し、これを真のワークスペース単位の強制に昇格させます。

**バジェットプレッシャーの検出。** 2つのサーフェスがあり、どちらもPR 14b以降に投入されます。

- **プッシュイベント**（`mcp_guardrail_events` を介して通知）: `GET /session/:id/events` をサブスクライブし、`KnownDaemonEvent` を介して `mcp_budget_warning` / `mcp_child_refused_batch` フレームを絞り込みます。ステートマシンは、75%上昇クロッシングごとに1回発火します（37.5%未満で再アーム）。拒否は `enforce` モードで、発見パスごとに1回結合されます。
- **スナップショットポーリング**（`mcp_guardrails` を介して通知）: `GET /workspace/mcp` を取得し、セッションごとのバジェットセル（`budgets[0]`）を検査します。

- `budgets[0].status === 'warning'` ⇔ `liveCount >= 0.75 * clientBudget`（PR 14bのプッシュイベントが使用するとステリシスしきい値と一致）。
- `budgets[0].status === 'error'` ⇔ `refusedCount > 0`（この発見パスで1つ以上のサーバーが拒否された）。
- `budgets[0].status === 'ok'` ⇔ 75%しきい値を下回り、かつ拒否がない。

推奨ポーリング間隔: すでに `/workspace/mcp` をポーリングしているものと合わせてください。スナップショットは安価であり、バジェットセルは追加の発見コストを負いません。プッシュイベントをサブスクライブするSDKクライアントも、長時間の切断後の状態を確認するためにスナップショットの恩恵を受けます（SSEリプレイリングの深さは有限です — `--event-ring-size`、デフォルト8000 — そのため、リングのカバレッジより長くオフラインだったクライアントはスナップショット再同期にフォールバックします）。

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

`level` は `project`、`user`、`extension`、または `bundled` のいずれかです。`errors` は発見が成功した場合には省略されます。

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

モデルは認証タイプでグループ化されています。プロバイダー接続診断情報は `/workspace/preflight` の `providers` セルにあります。環境プレフライトは `/workspace/preflight` と `/workspace/env`（下記）にあります。`errors` はスナップショット構築が成功した場合には省略されます。

### `GET /workspace/env`

デーモンプロセスのランタイム、プラットフォーム、サンドボックス、プロキシ、およびホワイトリストに登録されたシークレット環境変数の**存在**を報告します。常に `process.*` の状態から応答します。デーモンがこのルートを提供するためにACP子プロセスを生成することはなく、応答はACPが稼働中かアイドルかに関係なく同一です。`acpChannelLive` フィールドは情報提供のみです。

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

**秘匿化ポリシー。** `kind: 'env_var'` セルには `value` フィールドは決して含まれません。クライアントは `present: boolean` のみを参照できます。`kind: 'proxy'` セルは、生のenv値を資格情報秘匿化（`redactProxyCredentials`）を通過させ、次に `URL` 解析を通過させて、ワイヤーが `host:port` のみを運ぶようにします。`NO_PROXY` はURLではなくホストリストであるため、そのまま秘匿化を通過します。列挙されたシークレットenv varsのホワイトリストには現在、`OPENAI_API_KEY`、`ANTHROPIC_API_KEY`、`GEMINI_API_KEY`、`GOOGLE_API_KEY`、`DASHSCOPE_API_KEY`、`OPENROUTER_API_KEY`、`QWEN_SERVER_TOKEN` が含まれています。他のenv varsは列挙されないため、誤って設定されたシークレットは非表示のままになります。

### `GET /workspace/preflight`

デーモンの準備完了チェックを報告します。**デーモンレベルセル**（`node_version`、`cli_entry`、`workspace_dir`、`ripgrep`、`git`、`npm`）は常に `process.*` と `node:fs` から入力されます。**ACPレベルセル**（`auth`、`mcp_discovery`、`skills`、`providers`、`tool_registry`、`egress`）にはライブACP子プロセスが必要です。デーモンがアイドル状態の場合、`status: 'not_started'` プレースホルダーを出力します。このルートはセルを入力するためだけにACPを生成することは決してありません。対応するセルは `not_started` にフォールバックします。

アイドル応答（ACP子プロセスなし）:

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
```markdown
セル形状:

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

- `missing_binary` — Node バージョンが要件を満たしていない、`QWEN_CLI_ENTRY` が見つからない、ripgrep / git / npm が PATH にない（オプションのバイナリについては警告でありエラーではない）。
- `missing_file` — `boundWorkspace` が存在しない、またはディレクトリではない；存在しない、または読み取り不能なファイルを指すスキルパースエラー。
- `parse_error` — `SKILL.md` のパース失敗、不正な形式の設定 JSON。
- `auth_env_error` — `validateAuthMethod` が null 以外の失敗文字列を返した、またはプロバイダ解決から伝播した `ModelConfigError` サブクラス。
- `init_timeout` — ブリッジ内での `withTimeout` 拒否（ACP ラウンドトリップ待機中の実際のタイムアウト）。`BridgeTimeoutError` 型クラスで認識される。注意: 一時的な `mcp_discovery` `warning` セルで `connecting > 0` の場合、この種類は付与**されない** — これは通常のハンドシェイク進行中状態であり、実際のタイムアウトとは区別される。
- `protocol_error` — チャネルがリクエスト途中でクローズされた、またはツールレジストリが予期せず存在しないために ACP `extMethod` が拒否された。
- `blocked_egress` — PR 14 (#4175) 用に予約済み。PR 13 では `egress` セルを `status: 'not_started'` のままにする。

プリフライトリクエストの処理中にブリッジが ACP 子プロセスに到達できない場合（例：リクエスト途中のチャネルクローズ）、エンベロープの `errors` 配列には単一の `ServeStatusCell` が含まれ、障害を説明し、セルは `not_started` ACP プレースホルダにフォールバックします。デーモンレベルのセルは引き続き返されます。

### ワークスペースファイルルート

すべてのファイルパスはデーモンのバインドされたワークスペースを基準に解決されます。レスポンスはワークスペース相対パスを使用し、通常の成功ケースでは絶対ファイルシステムパスを返しません。成功したファイルレスポンスには以下が含まれます：

```http
Cache-Control: no-store
X-Content-Type-Options: nosniff
```

ファイルシステムエラーは次の JSON 形式を使用します：

```json
{
  "errorKind": "hash_mismatch",
  "error": "expected sha256:..., found sha256:...",
  "hint": "re-read the file and retry with the latest hash",
  "status": 409
}
```

`errorKind` の値には、`path_outside_workspace`、`symlink_escape`、`path_not_found`、`binary_file`、`file_too_large`、`untrusted_workspace`、`permission_denied`、`parse_error`、`hash_mismatch`、`file_already_exists`、`text_not_found`、`ambiguous_text_match` があります。

#### `GET /file`

テキストファイルを読み取ります。クエリパラメータ: `path`（必須）、`maxBytes`、`line`、`limit`。デーモンはバイナリファイルおよびテキスト読み取り上限を超えるファイルを拒否します。レスポンスには `hash`（ファイル全体の生のディスク上のバイトに対する SHA-256 ダイジェスト）が含まれます。`line`、`limit`、または `maxBytes` がスライスを返した場合でも同様です。

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

デコードせずにファイルから生のバイトを読み取ります。クエリパラメータ: `path`（必須）、`offset`（デフォルト `0`）、`maxBytes`（デフォルト `65536`、最大 `262144`）。このルートは、ファイル全体を読み込まずに大きなバイナリファイルの境界付きウィンドウをサポートします。レスポンスに `hash` が含まれるのは、返されたウィンドウがファイル全体をカバーする場合のみです。

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

テキストファイルを作成または置き換えます。これは厳格なミューテーションルートです。トークンが設定されていないループバックでは、`401 { "code": "token_required" }` を返します。`--require-auth` を使用すると、グローバル bearer ミドルウェアがルート実行前に認証されていないリクエストを拒否します。

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

`mode` は `create` または `replace` でなければなりません。`create` は既存のファイルを上書きしません（`409 file_already_exists`）。`replace` には `expectedHash` が必要です。ハッシュがない、または不正な形式の場合は `400 parse_error`、古いハッシュの場合は `409 hash_mismatch` です。`expectedHash` は `sha256:` に続く 64 文字の小文字 16 進数で、生のディスク上のバイトから計算されます。

`bom`、`encoding`、`lineEnding` を指定できます。置換はデフォルトで既存のファイルのエンコーディングプロファイルを保持し、明示的なフィールドで上書きできます。バイナリ書き込みは対象外です。

デーモンは対象ディレクトリ内のランダムな一時ファイルに書き込み、サポートされている場合は fsync し、`rename()` の直前に現在のハッシュを再確認してから、名前を変更して配置します。これにより、部分的なファイルの観測を防ぎ、同じファイルへのデーモン発信の書き込みをシリアル化しますが、クロスプロセスカーネルの compare-and-swap ではありません。外部エディタが最終ハッシュチェックとリネームの間のわずかなウィンドウで競合する可能性があります。

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

既存のテキストファイルに1回の正確なテキスト置換を適用します。これも厳格なミューテーションルートであり、`expectedHash` が必要です。

```json
{
  "path": "src/config.ts",
  "oldText": "timeout: 30000",
  "newText": "timeout: 60000",
  "expectedHash": "sha256:..."
}
```

`oldText` は空文字列ではなく、正確に1回出現する必要があります。一致しない場合は `422 text_not_found`、複数一致する場合は `422 ambiguous_text_match` を返します。このルートはエンコーディング、BOM、改行を保持し、アトミックリネームの直前に `expectedHash` を再確認します。

無視されたパスへの明示的な書き込み/編集は、認証された呼び出し元がパスを指定したため許可されます。成功レスポンスと監査イベントには `matchedIgnore: "file" | "directory" | null` が含まれます。

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

`state` は、`POST /session`、`POST /session/:id/load`、`POST /session/:id/resume` で使用される同じ ACP モデル/モード/設定オプションの形状を反映しています。

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

`availableCommands` は `available_commands_update` SSE 通知で使用されるのと同じコマンドスナップショットです。`availableSkills` はスキル名のみをリストします。クライアントはこのルートでスキル本体やパスを期待してはいけません。

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

このルートは読み取り専用の帯域外スナップショットです。これは意図的にプロンプトではなく、セッションがストリーミング中でもクエリできます。レスポンスにはエージェント、シェル、モニタータスクレジストリからのホワイトリスト化されたメタデータのみが含まれます。コントローラー、タイマー、オフセット、保留中のメッセージ、および生のレジストリオブジェクトは公開されません。

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

`status` は `NOT_STARTED`、`IN_PROGRESS`、`READY`、または `FAILED` のいずれかです。オプションの `error` は、利用可能な場合に失敗したサーバーに存在します。LSP が無効な場合（ベアモードを含む）は HTTP 200 で `enabled: false`、ゼロカウント、`servers: []` を返します。LSP が有効でサーバーが設定されていない場合は `enabled: true`、`configuredServers: 0`、`servers: []` を返します。初期化がクライアント存在前に失敗した場合、レスポンスに `initializationError` が含まれる可能性があります。ライブクライアントがスナップショットを提供できない場合、レスポンスには `statusUnavailable: true` が含まれます。

このルートは安定したクライアント向けフィールドのみを公開します。プロセスID、起動引数、stderr の末尾、ルートURI、ワークスペースフォルダパスなどのデバッグ内部情報は意図的に省略されています。

### `POST /session`

新しいエージェントを起動するか、既存のエージェントにアタッチします（`sessionScope: 'single'`、デフォルト）。

リクエスト:

```json
{
  "cwd": "/absolute/path/to/workspace",
  "modelServiceId": "qwen-prod",
  "sessionScope": "thread"
}
```

| フィールド         | 必須 | 備考                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| ---------------- | ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `cwd`            | no   | デーモンのバインドされたワークスペースに一致する絶対パス。省略した場合、ルートは `boundWorkspace` にフォールバックします（`/capabilities.workspaceCwd` から読み取ります）。一致しない空でない `cwd` は `400 workspace_mismatch` を返します（#3803 §02 — 1 デーモン = 1 ワークスペース）。ワークスペースパスは `realpathSync.native` で正規化され（存在しないパスには解決のみのフォールバック）、大文字小文字を区別しないファイルシステムでもスペルごとにセッションを拒否しません。                                                                                                                                                                                                                                             |
| `modelServiceId` | no   | エージェントがルーティングする設定済みの _モデルサービス_ を選択します（バックエンドプロバイダ — Alibaba ModelStudio、OpenRouter など）。省略した場合、エージェントはデフォルトを使用します。ワークスペースに既にセッションがある場合、既存のセッションで `setSessionModel` を呼び出し、`model_switched` をブロードキャストします。`POST /session/:id/model` の `modelId` とは異なります。後者は既にバインドされたサービス内のモデルを選択します。`/capabilities` の `modelServices` 配列は、設定されたサービスをアドバタイズするために予約されています。Stage 1 では常に `[]` です（エージェントのデフォルトサービスが使用され、HTTP 経由で列挙されません）。 |
| `sessionScope`   | no   | セッション共有のリクエストごとのオーバーライド。`'single'`（デーモン全体のデフォルト）は、同じワークスペースへの2回目の `POST /session` で既存のセッションを再利用します（`attached: true`）。`'thread'` は呼び出しごとに強制的に新しい別個のセッションを作成します。省略するとデーモン全体のデフォルトを継承します。列挙型以外の値は `400 { code: 'invalid_session_scope' }` を返します。古いデーモン（#4175 PR 5 より前）はフィールドを無視します — 送信前に `caps.features.session_scope_override` でプリフライトしてください。デーモン全体のデフォルトは現在プロダクションで `'single'` にハードコードされています。#4175 でフォローアップとして `--sessionScope` CLI フラグが追加される可能性があります。         |

レスポンス:

```json
{
  "sessionId": "<uuid>",
  "workspaceCwd": "/canonical/path",
  "attached": false
}
```

`attached: true` は、そのワークスペースのセッションが既に存在し、現在それを共有していることを意味します。

同じワークスペースへの同時 `POST /session` 呼び出しは **統合** されて1つの起動になります。両方の呼び出し元が同じ `sessionId` を取得し、正確に1つが `attached: false` を報告します。基になる起動が失敗した場合（初期化タイムアウト、不正なエージェント出力、OOM）、**統合されたすべての呼び出し元は同じエラーを受け取ります** — インフライトスロットがクリアされ、後続の呼び出しが最初から再試行できるようになります。

> ⚠️ **新しいセッションでの `modelServiceId` の拒否は HTTP レスポンスでは通知されません。** 不正な `modelServiceId`（タイポ、未設定のサービス）は作成を 500 にしません — セッションはエージェントのデフォルトモデルで動作し続けるため、呼び出し元は引き続き `sessionId` を取得し、後でモデルスイッチを再試行できます（`POST /session/:id/model` 経由）。可視の失敗シグナルは、セッションの SSE ストリーム上の `model_switch_failed` イベントで、起動ハンドシェイクと最初のサブスクライブの間に発生します。**このイベントを監視する必要があるサブスクライバは、最初の `GET /session/:id/events` で `Last-Event-ID: 0` を渡す必要があります**。これにより、リング内の最も古い利用可能なイベントからリプレイされます（作成レスポンスの数 ms 後にサブスクライブが着地した場合でも、起動時の `model_switch_failed` をカバーします）。

### `POST /session/:id/load`

永続化された ACP セッションを ID で復元し、その履歴を SSE 経由でリプレイします。パス ID が優先されます。ボディ内の `sessionId` フィールドは無視されます。事前に `caps.features.session_load` でプリフライトしてください。古いデーモンはこのルートに対して `404` を返します。

リクエスト:

```json
{
  "cwd": "/absolute/path/to/workspace"
}
```

| フィールド | 必須 | 備考                                                                                                                                                                                                                            |
| -------- | ---- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `cwd`    | no   | `POST /session` と同じ正規化 + `workspace_mismatch` ルール。省略すると `/capabilities.workspaceCwd` を継承します。ここでは `mcpServers` は意図的に受け入れられません — デーモン全体の MCP は設定駆動です（`POST /session` と同様）。 |

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

`state` は ACP の `LoadSessionResponse` を反映しています — `models` は `SessionModelState`、`modes` は `SessionModeState`、`configOptions` は `SessionConfigOption` の配列です。欠落フィールドはエージェントが決定します。後からアタッチする人（以下の `attached: true` パス）は、元のロード呼び出し元が参照したのと同じ `state` スナップショットを取得します — デーモンはそれをエントリにキャッシュします。実行時のミューテーション（例：`model_switched`）は SSE ストリームで配信され、後続のアタッチレスポンスでは配信されません。

`attached: true` は、セッションが既にライブであることを意味します（以前の `session/load`/`session/resume` によるか、統合された同時呼び出し元が先に進んだため）。

**SSE 経由の履歴リプレイ。** エージェント側で `loadSession` がインフライトの間、エージェントは永続化されたすべてのターンに対して `session_update` 通知を発行します。デーモンはルートレスポンスが返る前にそれらをセッションのイベントバスにバッファリングするため、すぐに `Last-Event-ID: 0` を指定して `GET /session/:id/events` を呼び出すサブスクライバは完全なリプレイを参照できます。**リプレイリングには上限があります**（セッションあたりデフォルト 8000 フレーム）。多くのツールコール/思考ストリームターンを含む長い履歴ではこれを超える可能性があり、最も古いフレームは静かにドロップされます。完全な履歴が必要なクライアントは、`load` が返った直後にサブスクライブする必要があります。あるいは、SSE イベント ID を保持し、`Last-Event-ID` を使用して後のターン境界から再開することもできます。

**エラー:**

- `404` — 永続化されたセッション ID が存在しません（`SessionNotFoundError`）。
- `400` — `workspace_mismatch`（`POST /session` と同じ形状）。
- `503` — `session_limit_exceeded`（`--max-sessions` に対してカウントされます。インフライトの復元もカウントされます）。
- `409` — `restore_in_progress`（同じ ID の `session/resume` が既にインフライトです）。`Retry-After: 5`。同じアクションの競合（同じ ID への2つの同時 `session/load`）は統合されます — 正確に1つが `attached: false` を返し、残りは同じ `state` で `attached: true` を返します。

### `POST /session/:id/resume`

永続化された ACP セッションを ID で復元しますが、履歴を SSE 経由でリプレイ**しません**。モデルコンテキストはエージェント側で内部的に復元され（`geminiClient.initialize` が `config.getResumedSessionData` を読み取る）、SSE ストリームは既に履歴をレンダリング済みのクライアントのためにクリーンなままになります。事前に `caps.features.session_resume` でプリフライトしてください。`unstable_session_resume` は古いクライアント用の非推奨互換エイリアスとして残ります。

`/load` と同じリクエスト形状。同じレスポンス形状 — `state` は ACP の `ResumeSessionResponse` を反映しています。同じエラーエンベロープで、`409 restore_in_progress` も含まれます（これは `session/load` がインフライトのときに発生し、別の `session/resume` の背後で競合する `session/resume` は統合されます）。

クライアントに履歴がレンダリングされていない場合（コールド再接続、ピッカー → 開く）は `/load` を使用してください。クライアントが既にターンを画面に表示しており、デーモン側のハンドルだけが必要な場合は `/resume` を使用してください。

> ⚠️ **なぜ `unstable_session_resume` がまだアドバタイズされているのですか？** デーモンの HTTP ルートと `session_resume` 機能は v1 で安定していますが、ブリッジは依然として ACP の `connection.unstable_resumeSession` を呼び出しています。古いタグは、`session_resume` より前に出荷された SDK が引き続き動作するためにのみ残されています。

### `GET /workspace/:id/sessions`

`<id>`（URL エンコードされた絶対 cwd）に一致する正規化されたワークスペースを持つすべてのライブセッションを一覧表示します。

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

セッションが存在しない場合は空の配列（404 ではない） — セッションピッカー UI はワークスペースがアイドル状態だからといってエラーを返すべきではありません。

### `POST /session/:id/prompt`

プロンプトをエージェントに転送します。マルチプロンプト呼び出し元はセッションごとに FIFO キューイングされます（ACP はセッションごとに1つのアクティブプロンプトを保証します）。

リクエスト:

```json
{
  "prompt": [{ "type": "text", "text": "What does src/main.ts do?" }]
}
```

検証: `prompt` はオブジェクトの空でない配列である必要があります。その他の失敗はブリッジに到達する前に `400` を返します。

レスポンス:

```json
{ "stopReason": "end_turn" }
```

その他の停止理由: `cancelled`、`max_tokens`、`error`、`length`（ACP 仕様に従う）。

HTTP クライアントがプロンプト中に切断した場合、デーモンはエージェントに ACP `cancel` 通知を送信し、エージェントは `stopReason: "cancelled"` でプロンプトを終了します。
```
> **Stage 1 の制限 — サーバーサイドのプロンプトタイムアウトはありません。** ブリッジはエージェントの `prompt()` を、`transportClosedReject`（エージェント子プロセスのクラッシュ）と呼び出し元の HTTP 切断 AbortSignal とのレースに対してのみ実行します。応答不能だが生きているエージェント（例：ハングしているモデル呼び出し）は、HTTP クライアントがタイムアウトして切断するまで、セッション単位の FIFO をブロックします。長時間実行プロンプトは正当なユースケース（深層調査、大規模コードベース分析）であるため、デフォルトの期限は意図的に設定していません。Stage 2 ではオプトインの設定可能な `promptTimeoutMs` を公開する予定です。それまでは、呼び出し元が自身のクライアントサイドタイムアウトを設定し、期限切れ時に切断する（または `POST /session/:id/cancel` を呼び出す）必要があります。

### `POST /session/:id/cancel`

セッションで**現在アクティブな**プロンプトをキャンセルします。ACP 側ではこれはリクエストではなく通知であり、エージェントはアクティブな `prompt()` を `cancelled` で解決することで応答します。

```bash
curl -X POST http://127.0.0.1:4170/session/$SID/cancel
# → 204 No Content
```

> **マルチプロンプト契約:** キャンセルはアクティブなプロンプトにのみ影響します。同じクライアントが以前に POST し、アクティブなプロンプトの後ろにまだキューイングされているプロンプトは、引き続き実行されます。マルチプロンプトキューイングはデーモンによって導入された動作です（ACP 仕様にはありません）。キューイングされたプロンプトの契約は、「各プロンプトを個別にキャンセルするか、チャネル終了でセッションを強制終了しない限り、実行を継続する」というものです。

### `DELETE /session/:id`

ライブセッションを明示的に閉じます。他のクライアントがアタッチされている場合でも強制クローズします。アクティブなプロンプトをキャンセルし、保留中のパーミッションをキャンセル済みとして解決し、`session_closed` イベントを発行し、EventBus を閉じ、セッションをデーモンマップから削除します。ディスクに永続化されたセッションは削除**されません**。`POST /session/:id/load` で再読み込みできます。事前確認: `caps.features.session_close`。

```bash
curl -X DELETE http://127.0.0.1:4170/session/$SID
# → 204 No Content
```

べき等: 未知のセッションの場合は `404` を返します（他のルートと同じ `SessionNotFoundError` 形式）。

> **`session_closed` イベント。** SSE サブスクライバーは、ストリーム終了前に `{ sessionId, reason: 'client_close', closedBy?: '<clientId>' }` を含む終端 `session_closed` イベントを受信します。SDK リデューサーはこれを `session_died` と同様に扱います（`alive: false` を設定し、`pendingPermissions` をクリア）。

### `PATCH /session/:id/metadata`

変更可能なセッションメタデータを更新します。現在は `displayName` のみをサポートしています。事前確認: `caps.features.session_metadata`。

リクエスト:

```json
{ "displayName": "My Investigation Session" }
```

| フィールド    | 必須 | 備考                                                                     |
| ------------- | ---- | ------------------------------------------------------------------------ |
| `displayName` | いいえ | 文字列、最大256文字。空文字列で名前をクリア。省略するとそのまま維持。 |

レスポンス:

```json
{ "sessionId": "<uuid>", "displayName": "My Investigation Session" }
```

セッションの SSE ストリームに `session_metadata_updated` イベントを `{ sessionId, displayName }` とともに発行します。

### `POST /session/:id/heartbeat`

デーモンのこのセッションに対する最終確認記録を更新します。長期間稼働するアダプター（TUI/IDE/Web）は定期的にこれを ping し、将来の失効ポリシー（Wave 5 PR 24）で、停止したクライアントと静かなクライアントを区別できるようにします。

ヘッダー:

| ヘッダー             | 必須 | 備考                                                                                                                                                                                                                                 |
| -------------------- | ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `X-Qwen-Client-Id`   | いいえ | `POST /session` でデーモンが発行した ID をエコーします。識別されたクライアントはクライアント単位のタイムスタンプも更新します。匿名ハートビートはセッション単位のウォーターマークのみ更新します。他の場所と同じ `[A-Za-z0-9._:-]{1,128}` 形式を満たす必要があります。 |

リクエストボディは空です（`{}` で問題ありません — 現在読み取られるフィールドはありません）。

レスポンス:

```json
{
  "sessionId": "<sid>",
  "clientId": "<cid>",
  "lastSeenAt": 1700000000123
}
```

`clientId` は、信頼できる `X-Qwen-Client-Id` が指定された場合にのみエコーされます。`lastSeenAt` はデーモン側の `Date.now()` エポックミリ秒で、ブリッジが保存した値です。

エラー:

- `400` — `{ code: 'invalid_client_id' }` : ヘッダーが不正な形式（ヘッダー形式ルール違反）の場合、またはこのセッションに登録されていない `clientId` を含む場合（ブリッジはタイムスタンプを更新する前に `InvalidClientIdError` をスローします）。
- `404` — 未知のセッション。

機能ゲート: 事前確認 `caps.features.client_heartbeat`。古いデーモンはこのパスに `404` を返します。

### `POST /session/:id/model`

セッションに現在バインドされているモデルサービス**内で**アクティブなモデルを切り替えます。セッション単位のモデル変更キューを介してシリアル化されます。

（サービス自体（Alibaba ModelStudio や OpenRouter など）を切り替えるには、新しいセッション用に `POST /session` で `modelServiceId` を渡します。Stage 1 にはライブのサービス切り替えルートはありません。）

リクエスト:

```json
{ "modelId": "qwen-staging" }
```

レスポンス:

```json
{ "modelId": "qwen-staging" }
```

成功すると、SSE ストリームに `model_switched` を発行します。失敗すると、`model_switch_failed` を発行します（呼び出し元だけでなく、パッシブサブスクライバーもエラーを確認できるように）。エージェントチャネル終了とのレースを考慮しており、応答不能な子プロセスが HTTP ハンドラをブロックしないようにしています。

### `POST /session/:id/recap`

機能タグ: `session_recap`。Bridge → ACP 拡張メソッド `qwen/control/session/recap`。

セッションの「どこまで進んだか」を一文で要約する summary を生成します。core の `generateSessionRecap`（`packages/core/src/services/sessionRecap.ts`）をラップし、高速モデルに対してツール無効、`maxOutputTokens: 300`、厳格な `<recap>...</recap>` 出力形式でサイドクエリを実行します。サイドクエリはセッションの既存の GeminiClient チャット履歴を読み取り、それに**追加しません**。

リクエストボディは無視されます（`{}` または空を送信）。非厳格な変更ゲート — ポスチャは `/session/:id/prompt` と同様（トークンを消費しますが状態は変更しません）。SSE イベントは発行されません。

レスポンス（200）:

```json
{
  "sessionId": "sess:42",
  "recap": "Debugging the auth retry race. Next: add deterministic timing to the integration test."
}
```

`recap` は次の場合に `null` になります（エラーではなく通常の200）:

- セッションのダイアログターンがまだ2回未満の場合
- サイドクエリが抽出可能な `<recap>...</recap>` ペイロードを返さなかった場合
- または基礎となるモデルエラーが発生した場合（core ヘルパーはベストエフォートであり、スローすることはありません）

エラー:

- `400 {code: 'invalid_client_id'}` — 不正な形式の `X-Qwen-Client-Id` ヘッダー。
- `404` — セッションが不明。

キャンセル: **v1 ではなし**。このルートは HTTP クライアントの切断をリッスンせず、`AbortSignal` はブリッジに組み込まれておらず、ACP 子プロセスは呼び出し元が切断したかどうかに関係なくサイドクエリを完了まで実行します。唯一の制限は、ブリッジの60秒バックストップタイムアウト（`SESSION_RECAP_TIMEOUT_MS`）と、ACP チャネル死亡に対するトランスポートクローズレースです。recap は短い（単一試行、`maxOutputTokens: 300`、通常〜1～5秒）ため、これは許容範囲です。将来的に帯域幅コストが必要になった場合、リクエスト ID ベースのキャンセル拡張メソッドにより完全なエンドツーエンドキャンセルを組み込むことができます。

### 変更: 承認、ツール、init、MCP 再起動

Issue [#4175](https://github.com/QwenLM/qwen-code/issues/4175) Wave 4 PR 17 は、リモートクライアントがデーモンホストの CLI に触れることなくランタイム状態を変更できる4つの変更制御ルートを追加します。これら4つはすべて:

- PR 15 の**厳格な**変更ゲートで保護されています。ベアラートークンなしで設定されたデーモンは `401 {code: 'token_required'}` で拒否します。オプトインする前に `--token`（または `QWEN_SERVER_TOKEN`）を設定してください。
- `X-Qwen-Client-Id` ヘッダー（PR 7 監査チェーン）を受け入れ、スタンプします。ヘッダーに信頼できる ID が含まれている場合、デーモンは対応する SSE イベントに `originatorClientId` を出力し、クロスクライアント UI が自身の変更のエコーを抑制できるようにします。
- 各機能を公開する前に、各タグの機能に対して事前確認を行います。古いデーモンはルートに対して `404` を返します。

4つのルートのうち3つ（`tools/:name/enable`、`init`、`mcp/:server/restart`）は**ワークスペーススコープ**のイベントを発行します。変更がトリガーされたときにどのセッションがアタッチされていたかに関係なく、すべてのアクティブなセッション SSE バスがイベントを受信します。`approval-mode` は**セッションスコープ**のイベントを発行します。変更は1つのセッションの `Config` にローカルであるためです。

#### `POST /session/:id/approval-mode`

機能タグ: `session_approval_mode_control`。Bridge → ACP 拡張メソッド `qwen/control/session/approval_mode`。

ライブセッションの承認モードを変更します。新しいモードは ACP 子プロセスのセッション単位の `Config` に即座に反映されます。デフォルトでは設定はディスクに書き込まれ**ません**。`persist: true` を渡すと、`tools.approvalMode` をワークスペース設定に書き込みます。

リクエスト:

```json
{ "mode": "auto-edit", "persist": false }
```

`mode` は `'plan' | 'default' | 'auto-edit' | 'auto' | 'yolo'` のいずれかである必要があります（core の `ApprovalMode` 列挙型を反映。SDK はランタイム検証用に `DAEMON_APPROVAL_MODES` をエクスポート）。`persist` のデフォルトは `false`。

レスポンス（200）:

```json
{
  "sessionId": "sess:42",
  "mode": "auto-edit",
  "previous": "default",
  "persisted": false
}
```

エラー:

- `400 {code: 'invalid_approval_mode', allowed: [...]}` — 未知のモードリテラル。
- `400 {code: 'invalid_persist_flag'}` — `persist` がブール値でない。
- `403 {code: 'trust_gate', errorKind: 'auth_env_error'}` — 要求されたモードが信頼できるフォルダを必要とする場合（信頼されていないワークスペースでの特権モードは core の `Config.setApprovalMode` によって拒否されます）。
- `404` — セッションが不明。

SSE イベント（セッションスコープ）: `approval_mode_changed`、`{sessionId, previous, next, persisted, originatorClientId?}`。

#### `POST /workspace/tools/:name/enable`

機能タグ: `workspace_tool_toggle`。純粋なファイル IO — ACP ラウンドトリップなし。

ワークスペースの `tools.disabled` 設定リスト内のツール名を切り替えます。ここにリストされたツールは**まったく登録されません**（ツールを登録したまま呼び出しを拒否する `permissions.deny` とは異なります）。ビルトインツールと MCP で発見されたツールはどちらも `ToolRegistry.registerTool` を介して流れ、これが無効化セットを参照します。

> ⚠️ **名前はレジストリが公開する識別子と正確に一致する必要があります。** エイリアス解決は行われません。ルートはパスパラメータの任意の文字列を `tools.disabled` に保存し、次回の ACP 子プロセスは登録時に `tool.name` と比較します。ビルトインツールは正規のレジストリ名（スネークケースの動詞形）を使用します: `run_shell_command`、`read_file`、`write_file`、`list_directory`、`glob`、`grep_search`、`web_fetch` など。CLI が表示する表示ラベル（`Shell`、`Read`、`Write`）では**ありません**。MCP で発見されたツールは修飾された `mcp__<server>__<name>` 形式を使用します（これは `tool_toggled` イベントがブロードキャストする形式であり、`GET /workspace/mcp` が一覧表示する形式でもあります）。`Bash` を無効にしても、次回のセッションで `run_shell_command` が登録されるのを防ぐことは**できません**。

ライブの ACP 子プロセスは既に登録されたツールを保持します — 切り替えは**次の** ACP 子プロセス生成時に有効になります。現在のデーモンで変更を有効にするには、`POST /workspace/mcp/:server/restart`（MCP ソースのツールの場合）または新しいセッション作成と組み合わせてください。

未知のツール名も受け入れられます: まだインストールされていない MCP ツールを事前に無効にしておくことは正当なユースケースです。

リクエスト:

```json
{ "enabled": false }
```

レスポンス（200）:

```json
{ "toolName": "run_shell_command", "enabled": false }
```

エラー:

- `400 {code: 'invalid_tool_name'}` — 空のパスパラメータ、またはパスパラメータが256文字制限を超えている。
- `400 {code: 'invalid_enabled_flag'}` — `enabled` がない、またはブール値でない。

SSE イベント（ワークスペーススコープ）: `tool_toggled`、`{toolName, enabled, originatorClientId?}`。

#### `POST /workspace/init`

機能タグ: `workspace_init`。純粋なファイル IO — ACP ラウンドトリップなし、**LLM 呼び出しなし**。

デーモンがバインドされたワークスペースルートに、空の `QWEN.md`（または `--memory-file-name` オーバーライド下の `getCurrentGeminiMdFilename()` が返すもの）をスキャフォールドします。機械的な操作のみ — AI 駆動のコンテンツ充填には、`POST /session/:id/prompt` をフォローアップしてください。

デフォルトでは、対象ファイルが空白以外のコンテンツで存在する場合、上書きを拒否します。空白のみのファイルは存在しないものとして扱われます（ローカルの `/init` スラッシュコマンドと同じ動作）。

リクエスト:

```json
{ "force": false }
```

レスポンス（200）:

```json
{ "path": "/work/bound/QWEN.md", "action": "created" }
```

`action` は、新規作成の場合は `'created'`、既存の空白のみのファイルがそのまま変更されなかった場合（書き込みは実行されません）は `'noop'`、`force: true` で非空のコンテンツを置き換えた場合は `'overwrote'` です。`workspace_initialized` SSE イベントはレスポンスのアクションを反映します。オブザーバーは `action !== 'noop'` でフィルタリングして、実際のディスク変更にのみ反応できます。

エラー:

- `400 {code: 'invalid_force_flag'}` — `force` がブール値でない。
- `409 {code: 'workspace_init_conflict', path, existingSize}` — ファイルが空白以外のコンテンツで存在し、`force` が省略/`false` の場合。ボディには絶対パスとサイズ（バイト）が含まれるため、SDK クライアントは再 stat することなく「N バイトを上書きしますか？」というプロンプトを表示できます。

SSE イベント（ワークスペーススコープ）: `workspace_initialized`、`{path, action, originatorClientId?}`。

#### `POST /workspace/mcp/:server/restart`

機能タグ: `workspace_mcp_restart`。Bridge → ACP 拡張メソッド `qwen/control/workspace/mcp/restart`。

ACP 子プロセスの `McpClientManager.discoverMcpToolsForServer` を介して設定済み MCP サーバーを再起動します（切断 + 再接続 + 再発見）。PR 14 v1 のアカウンティングからライブの予算スナップショットを事前チェックするため、予算が飽和したワークスペースでの再起動は、`BudgetExhaustedError` のカスケードをトリガーする代わりにソフト拒否を返します。

リクエストボディは空（`{}`）。パスパラメータは、`mcpServers` 設定に表示されるサーバー名を URL エンコードしたものです。

レスポンス（200） — `restarted` で判別する直和型:

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

ソフトスキップ理由（すべて200を返す）:

| `reason`                | 意味                                                                                                                                                                                                                                  |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `'in_flight'`           | このサーバーの別のディスカバリ/再起動が既に進行中。ルートは元のプロミスを待たずに即座に戻ります。呼び出し元は少し遅延して再試行する必要があります。                                                                                        |
| `'disabled'`            | サーバーは設定されているが、`excludedMcpServers` にリストされている。再起動前に再有効化してください。                                                                                                                                       |
| `'budget_would_exceed'` | デーモンが `--mcp-budget-mode=enforce` で、対象サーバーが現在 `reservedSlots` になく、ライブ合計が `clientBudget` に達している。呼び出し元は最初にスロットを解放する必要があります。 |

エラー（非2xx）:

- `400 {code: 'invalid_server_name'}` — 空のパスパラメータ。
- `404` — サーバー名が `mcpServers` 設定にない、またはライブの ACP チャネルが存在しない（再起動には本質的にライブの `McpClientManager` インスタンスが必要）。
- `500` — 内部エラー（例：`ToolRegistry` が初期化されていない）。

SSE イベント（ワークスペーススコープ）: 成功時は `mcp_server_restarted`、`{serverName, durationMs, originatorClientId?}`。ソフトスキップ時は `mcp_server_restart_refused`、`{serverName, reason, originatorClientId?}`。

### `GET /session/:id/events` (SSE)

セッションのイベントストリームを購読します。

ヘッダー:

```
Accept: text/event-stream
Last-Event-ID: 42        ← オプション、ID 42 の後からリプレイ
```

クエリパラメータ:

| パラメータ   | 必須 | 備考                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| ------------ | ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `maxQueued` | いいえ | サブスクライバーごとの**ライブバックログ**の上限。範囲 `[16, 2048]`、デフォルト 256。サブスクライブ時に強制プッシュされるリプレイフレームは上限の対象外。実際に消費するのは、サブスクライバーが大きな `Last-Event-ID: 0` リプレイを処理している間に到着するライブイベントです。コールド再接続時には値を増やし、ライブテールがコンシューマの追いつき前に低速クライアント警告/排除をトリガーしないようにします。範囲外/非10進数/存在するが空の値は、SSE ハンドシェイクが開く前に `400 invalid_max_queued` を返します。事前確認 `caps.features.slow_client_warning` — 古いデーモンはこのパラメータを静かに無視します。 |

フレーム形式。`data:` 行は**完全なイベントエンベロープ**で、JSON 文字列化され1行になっています — `{id?, v, type, data, originatorClientId?}`。ACP 固有のペイロード（`sessionUpdate`、`requestPermission` の引数など）はエンベロープの `data` フィールドに配置され、エンベロープ自身の `type` は SSE の `event:` 行と一致します。

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

SSE レベルの `id:` / `event:` 行は、EventSource 互換性のために `envelope.id` / `envelope.type` を複製しています。生の `fetch` コンシューマ（SDK の `parseSseStream`）はすべての情報を JSON エンベロープから読み取り、SSE プリアンブル行を無視します。

| イベントタイプ             | トリガー                                                                                                                                                                                                                                                                                                                |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `session_update`           | ACP の `sessionUpdate` 通知（LLM チャンク、ツール呼び出し、使用量）                                                                                                                                                                                                                                                       |
| `permission_request`       | エージェントがツール承認を要求                                                                                                                                                                                                                                                                                           |
| `permission_resolved`      | 何らかのクライアントが `POST /permission/:requestId` を介してパーミッションに投票                                                                                                                                                                                                                                         |
| `permission_partial_vote`  | （コンセンサスのみ）投票が記録されたが定足数に達していない。`{requestId, sessionId, votesReceived, votesNeeded, quorum, optionTallies}` を運ぶ。事前確認 `caps.features.permission_mediation`。                                                                                                                            |
| `permission_forbidden`     | 投票がアクティブポリシー（`designated` 不一致、`local-only` 非ループバック、または `consensus` 投票者がスナップショットにない）によって拒否された。`{requestId, sessionId, clientId?, reason}` を運ぶ。事前確認 `caps.features.permission_mediation`。                                                                      |
| `model_switched`           | `POST /session/:id/model` 成功                                                                                                                                                                                                                                                                                           |
| `model_switch_failed`      | `POST /session/:id/model` 拒否                                                                                                                                                                                                                                                                                           |
| `session_died`             | エージェント子プロセスが予期せずクラッシュ。**終端: このフレームの後に SSE ストリームが閉じます。セッションは `byId` から削除されます。** サブスクライバーは `POST /session` で再接続して新しいセッションを生成する必要があります。                                                                                              |
| `slow_client_warning`      | サブスクライバーローカル: キューが 75% 以上満杯。**非終端** — ストリームは継続。警告は排除前の注意喚起。`{queueSize, maxQueued, lastEventId}` を運ぶ。オーバーフローエピソードごとに一度だけ発火。キューが 37.5% 未満に減少すると再アーム。`id` なし（合成）。事前確認 `caps.features.slow_client_warning`。              |
| `client_evicted`           | サブスクライバーローカル: キューオーバーフロー。**終端: このフレームの後に SSE ストリームが閉じます**（`id` なし — 合成）。同じセッションの他のサブスクライバーは継続。                                                                                                                                                   |
| `stream_error`             | ファンアウト中のデーモン側エラー。**終端: このフレームの後に SSE ストリームが閉じます**（`id` なし — 合成）。                                                                                                                                                                                                            |
再接続セマンティクス：

- `Last-Event-ID: <n>` を送信して、セッションごとのリングから `id > n` のイベントをリプレイする（デフォルトの深さは **8000**、`qwen serve --event-ring-size <n>` で調整可能）
- **ギャップ検出（クライアント側）：** `<n>` がリングに残っている最も古いイベントよりも前の日付の場合（例：`Last-Event-ID: 50` で再接続しても、リングが 200～1199 を保持している）、デーモンは最も古い利用可能なイベントからエラーを発生させずにリプレイします。最初にリプレイされたイベントの `id` を `n + 1` と比較してください。差分が失われたウィンドウのサイズです。ステージ 2 では、デーモン側で明示的な `stream_gap` 合成フレームが注入されます。ステージ 1 では、検出はクライアントの責任です。
- ID はセッションごとに単調増加し、1 から始まります
- 合成フレーム（`client_evicted`、`slow_client_warning`、`stream_error`）は意図的に `id` を省略しているため、他のサブスクライバーのシーケンススロットを消費しません

バックプレッシャー：

- サブスクライバーごとのキューはデフォルトで `maxQueued: 256` ライブアイテム（再接続中のリプレイフレームは上限をバイパスします）。SSE リクエストで `?maxQueued=N`（範囲 `[16, 2048]`）を使用してオーバーライドします。
- サブスクライバーのキューが 75% を超えると、バスはそのサブスクライバーに `slow_client_warning` 合成フレームを強制プッシュします（オーバーフローエピソードごとに 1 回。37.5% 未満にドレインされた後に再アームされます）。ストリームは開いたままです。警告は注意喚起であり、クライアントがより速くドレインするか、デタッチしてクリーンに再接続できるようにするためです。
- キューが実際に警告をオーバーフローすると、バスは `client_evicted` 終端フレームを発行し、サブスクリプションを閉じます。

### `POST /permission/:requestId`

保留中の `permission_request` に投票します。アクティブな **調停ポリシー** が誰が勝つかを決定します：

| ポリシー                      | 動作                                                                                                                                                                                              |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `first-responder` (デフォルト) | 検証済みの投票者が勝ちます。その後の投票者には `404` が返ります。F3 以前のベースライン。                                                                                                                                    |
| `designated`                | プロンプトの発信者（`originatorClientId`）のみが決定します。発信者以外は `403 permission_forbidden / designated_mismatch` が返ります。匿名プロンプトの場合は `first-responder` にフォールバックします。                 |
| `consensus`                 | N-of-M の投票者が合意する必要があります（デフォルト `N = floor(M/2) + 1`、`policy.consensusQuorum` でオーバーライド可能）。最初に `N` に達したオプションが勝利します。解決しない投票には `200` + `permission_partial_vote` SSE フレームが返ります。 |
| `local-only`                | ループバック投票者のみが決定します。リモート呼び出し元には `403 permission_forbidden / remote_not_allowed` が返ります。                                                                                                      |

アクティブなポリシーは `settings.json` の `policy.permissionStrategy` で設定され、`/capabilities` の `body.policy.permission` に公開されます。ビルドでサポートされているセットについては、事前に `caps.features.permission_mediation`（`modes: [...]` 付き）を確認してください。

> **F3 (#4175): マルチクライアントのパーミッション調整。** F3 で上記 4 つのポリシーが追加されました。F3 以前のデーモンは `first-responder` をハードコードしていました。設定されたポリシーが `first-responder` の場合、ワイヤー形状はビット単位で変更されません。新しいイベント（`permission_partial_vote`、`permission_forbidden`）は追加的です。古い SDK はこれらを `unrecognized_known_event` として認識し、正常に無視します。

> **パーミッションタイムアウト（デフォルト 5 分）。** `permission_request` は、次のいずれかが発生するまで保留状態を維持します：(a) 何らかのクライアントがここで投票する、(b) `POST /session/:id/cancel` が発火する、(c) プロンプトを駆動している HTTP クライアントが切断する（プロンプト途中のキャンセルにより、保留中のパーミッションが `cancelled` として解決される）、(d) セッションが強制終了される、(e) デーモンがシャットダウンされる、**または (f) セッションごとのパーミッションタイムアウトが発生する**（`DEFAULT_PERMISSION_TIMEOUT_MS`、5 分）。タイムアウトが発生すると、エージェントの `requestPermission` は `{outcome: 'cancelled'}` として解決され、監査リングは `permission.timeout` エントリを記録し、デーモンの stderr に 1 行のブレッドクラムを出力し、SSE バスは標準の `permission_resolved` キャンセルフレームをファンアウトしてサブスクライバーがクリーンアップできるようにします。タイムアウトは `BridgeOptions.permissionResponseTimeoutMs` で設定可能です。長時間実行プロンプトを使用するヘッドレス呼び出し元は、これを延長することをお勧めします。

リクエスト：

```json
{
  "outcome": {
    "outcome": "selected",
    "optionId": "proceed_once"
  }
}
```

結果：

- `{ "outcome": "selected", "optionId": "<オプションの1つ>" }` — 受け入れ / 拒否 / 一度だけ実行 / など。エージェントが提供する選択肢に従う
- `{ "outcome": "cancelled" }` — リクエストを破棄（`cancelSession` / `shutdown` が内部で行うのと同じ）

レスポンス：

- `200 {}` — あなたの投票が受け入れられました（解決された、またはコンセンサスクォーラムの下で記録された）
- `403 { "code": "permission_forbidden", "reason": "designated_mismatch" | "remote_not_allowed", "requestId", "sessionId" }` — F3: アクティブなポリシーがあなたの投票を拒否しました
- `404 { "error": "..." }` — requestId が不明です（既に解決済み、存在しない、またはセッションが破棄された）
- `500 { "code": "cancel_sentinel_collision", ... }` — F3: エージェントの `allowedOptionIds` に予約済みのセンチネル `'__cancelled__'` が含まれています。エージェント/デーモンの契約違反
- `501 { "code": "permission_policy_not_implemented", "policy": "<name>" }` — F3 前方互換性: ポリシーリテラルがスキーマに存在するが、そのメディエーターブランチがまだビルドされていない（現在到達不能。将来のポリシー用に予約済み）

投票が成功した後、接続されているすべてのクライアントは、同じ `requestId` と選択された `outcome` を持つ `permission_resolved` を確認します。`consensus` では、中間投票はさらに、クォーラムに達するまで `permission_partial_vote` をファンアウトします。

### Auth デバイスフロールート（issue #4175 PR 21）

デーモンは OAuth 2.0 Device Authorization Grant（RFC 8628）を仲介し、リモート SDK クライアントがログインをトリガーできるようにします。そのトークンは **デーモン** のファイルシステムに保存され、クライアントには保存されません。デーモンは IdP 自体をポーリングします。クライアントの唯一の仕事は、認証 URL + ユーザーコードを表示し、（オプションで）SSE をサブスクライブして完了イベントを受け取ることです。

機能タグ: `auth_device_flow`（常にアドバタイズされます）。v1 でサポートされているプロバイダー: `qwen-oauth`。

> [!note]
>
> Qwen OAuth の無料枠は 2026-04-15 に廃止されました。このプロトコルでは `qwen-oauth` をレガシー v1 プロバイダー識別子として扱ってください。新しいクライアントは、利用可能な場合は現在サポートされている認証プロバイダーを優先する必要があります。

**ランタイムの局所性。** デーモンはブラウザを起動しません — たとえ起動できたとしても。クライアントは `open(verificationUri)` をローカルで呼び出すかどうかを決定します。ヘッドレス Pod（標準のモード B デプロイメント）では、ユーザーはブラウザを持っている任意のデバイスで URL を開きます。推奨される UX については `docs/users/qwen-serve.md` を参照してください。

**イベント内のトークン漏洩なし。** `auth_device_flow_started` は `{deviceFlowId, providerId, expiresAt}` のみを運びます。ユーザーコードと認証 URL は、POST 201 のボディおよび `GET /workspace/auth/device-flow/:id` 経由でポイントツーポイントで返されます。SSE でブロードキャストされることはありません。

**プロバイダーごとに 1 つのシングルトン。** フローが保留中に同じプロバイダーに対する 2 回目の `POST` は、べき等な引き継ぎです。新しい IdP リクエストを開始するのではなく、既存のエントリを `attached: true` で返します。

#### `POST /workspace/auth/device-flow`

厳格な変更ゲート: トークンレスなループバックデフォルトでもベアラートークンが必要（`401 token_required`）。

リクエスト：

```json
{ "providerId": "qwen-oauth" }
```

レスポンス（`201` 新規開始、`200` べき等な引き継ぎ）：

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

- `400 unsupported_provider` — 不明な `providerId`（レスポンスには `supportedProviders` が含まれます）
- `409 too_many_active_flows` — ワークスペースの上限（4）に達しました。`DELETE` でいずれかをキャンセルしてください
- `401 token_required` — 厳格なゲートがトークンレスリクエストを拒否しました
- `502 upstream_error` — IdP が予期しないエラーを返しました

#### `GET /workspace/auth/device-flow/:id`

現在の状態を読み取ります。保留中のエントリは `userCode/verificationUri/expiresAt/intervalMs` をエコーします。終端エントリ（5 分間の猶予期間）はそれらを削除し、`status` + オプションの `errorKind/hint` を表示します。

不明な ID および猶予期間後のエビクトされたエントリに対しては `404 device_flow_not_found` を返します。

#### `DELETE /workspace/auth/device-flow/:id`

べき等なキャンセル：

- 保留中エントリ → `204` + `auth_device_flow_cancelled` を発行
- 終端エントリ → `204` 何もしない（イベントは再発行されない）
- 不明な ID → `404`

#### `GET /workspace/auth/status`

保留中のフロー + サポートされているプロバイダーのスナップショット：

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

5 つの型付きイベント（ワークスペーススコープ、アクティブなすべてのセッションバスにファンアウト）：

- `auth_device_flow_started` `{deviceFlowId, providerId, expiresAt}` — POST 成功。SDK はサブスクライブする必要があります（ここには userCode はありません。必要に応じて GET で取得）
- `auth_device_flow_throttled` `{deviceFlowId, intervalMs}` — デーモンが上流の `slow_down` を尊重しました。クライアントが GET をポーリングする場合は、インターバルを一致させるように更新する必要があります
- `auth_device_flow_authorized` `{deviceFlowId, providerId, expiresAt?, accountAlias?}` — 資格情報が永続化されました。`accountAlias` は非 PII ラベルです（メールや電話番号は決して含まれません）
- `auth_device_flow_failed` `{deviceFlowId, errorKind, hint?}` — 終端。`errorKind` は以下のいずれかです：`expired_token | access_denied | invalid_grant | upstream_error | persist_failed`。`persist_failed` はデーモン内部のエラーです。IdP との交換は成功しましたが、デーモンが資格情報を永続的に保存できませんでした（EACCES / EROFS / ENOSPC）。ユーザーは基礎となるディスク状態が修正された後に再試行する必要があります。
- `auth_device_flow_cancelled` `{deviceFlowId}` — 保留中エントリに対する DELETE が成功しました

> **MCP 互換ではありません。** MCP 認証仕様（2025-06-18）は、リダイレクトコールバックを使用した OAuth 2.1 + PKCE 認証コードを義務付けており、ヘッドレス Pod デーモンでは機能しません。モード B のデバイスフローサーフェスはデーモンプライベートです。MCP 準拠サーバーをターゲットとするクライアントは、別の認証パスを使用する必要があります。

## ストリーミングワイヤーフォーマット

イベントは標準の EventSource フレームとして出力されます。デーモンはフレームごとに 1 つの `data:` 行を書き込みます（JSON は `JSON.stringify` 後に埋め込み改行を含みません）。TS SDK パーサー（`packages/sdk-typescript/src/daemon/sse.ts`）は、受信側でそれと仕様で許可されているマルチ `data:` 形式の両方を処理します。

## ストリーミング中のエラーフレーム

SSE サブスクライバーにサービスを提供中にブリッジイテレーターがスローすると、デーモンは終端の `stream_error` フレーム（`id` なし）を出力します。`data:` 行は完全なエンベロープです（このドキュメントの他のすべての SSE フレームと同じ形状）。実際のエラーメッセージは `envelope.data.error` にあります。

```
event: stream_error
data: {"v":1,"type":"stream_error","data":{"error":"<メッセージ>"}}
```

その後、接続は閉じられます。

## 環境変数

| 変数                 | 目的                                                        |
| ------------------- | -------------------------------------------------------------- |
| `QWEN_SERVER_TOKEN` | ベアラートークン。起動時に先頭および末尾の空白が除去されます。 |

## ソースレイアウト

| パス                                                 | 目的                                                                                                    |
| ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `packages/cli/src/commands/serve.ts`                 | yargs コマンド + フラグスキーマ                                                                                |
| `packages/cli/src/serve/run-qwen-serve.ts`           | リスナーライフサイクル + シグナル処理                                                                       |
| `packages/cli/src/serve/server.ts`                   | Express ルート + ミドルウェア                                                                                |
| `packages/cli/src/serve/auth.ts`                     | ベアラー + ホスト許可リスト + CORS 拒否                                                                        |
| `packages/cli/src/serve/httpAcpBridge.ts`            | 生成またはアタッチ + セッションごとの FIFO + パーミッションレジストリ                                                   |
| `packages/cli/src/serve/status.ts`                   | 読み取り専用デーモンステータスワイヤータイプ + `ServeErrorKind` + `BridgeTimeoutError` + `mapDomainErrorToErrorKind` |
| `packages/cli/src/serve/env-snapshot.ts`             | `process.*` 状態から `/workspace/env` ペイロードを構築する純粋なヘルパー。資格情報の編集を含む   |
| `packages/acp-bridge/src/eventBus.ts`                | 境界付き非同期キュー + リプレイリング                                                                          |
| `packages/sdk-typescript/src/daemon/DaemonClient.ts` | TS クライアント                                                                                                  |
| `packages/sdk-typescript/src/daemon/sse.ts`          | EventSource フレームパーサー                                                                                   |
| `integration-tests/cli/qwen-serve-routes.test.ts`    | 18 ケース、LLM なし                                                                                           |
| `integration-tests/cli/qwen-serve-streaming.test.ts` | 3 ケース、ローカルの fake OpenAI サーバーに支えられた実際の `qwen --acp` 子プロセス（POSIX のみ。Windows ではスキップ）   |