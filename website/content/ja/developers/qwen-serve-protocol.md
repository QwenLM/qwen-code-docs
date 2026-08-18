---
title: "`qwen serve` HTTP プロトコルリファレンス"
description: "qwen-code デーモンの HTTP API、認証、ケイパビリティ、および読み取り専用ステータスルート"
---

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

- リテラル `*` — 任意のオリジンを許可します。**リスクあり**: `*` が設定されているにもかかわらず Bearer トークンが設定されていない場合（`--token`、`QWEN_SERVER_TOKEN`、または起動時にトークンを必須とする `--require-auth` のいずれのソースでも）、起動は拒否されます。`*` がリストに含まれている場合、起動時のパンくず（breadcrumb）は stderr に警告を出力します。**推奨**: ループバックバインドでは `--require-auth` と組み合わせて、`/health` も Bearer で保護されるようにします。これはデフォルトではループバックの Bearer ミドルウェアより前に登録されるため（k8s/Compose プローブがトークンなしで到達できるように）、`*` 許可リストはそれを任意のクロスオリジンブラウザから到達可能にします。`--require-auth` でも Web Shell の静的アセット（`/`、`/assets/*`、および `/session/:id` のドキュメントナビゲーション）はループバックでは設計上プリオーサンのままです。これらは Bearer ミドルウェアより前にマウントされるため、`*` 許可リストの下では任意のクロスオリジンブラウザから引き続き読み取り可能です。`--no-web` はその表面を除去します。ループバック以外のバインドでは Bearer は起動時にすでに必須であり、`/health` もその後に登録されるため、`*` がトークンなしで公開するのは Web Shell の静的アセット（`/`、`/assets/*`、および `/session/:id` のドキュメントナビゲーション。それらの JS はトークン保護されたルートを呼び出します）のみです。`--no-web` はそれも除去します。実際の API 表面はどちらの場合でも保護されています。
- 正規化された URL オリジン — `<scheme>://<host>[:<port>]`。**末尾のスラッシュ、パス、userinfo、クエリは不可**。エントリが `new URL(pattern).origin === pattern` のラウンドトリップに失敗した場合、起動は `InvalidAllowOriginPatternError` で拒否されます。エラーメッセージには不正なパターンと正規化された形式が示されます。意図的な厳格さ: 暗黙の正規化（例: 末尾の `/` の削除）は、タイプミスを見逃し、曖昧な入力を許可してしまう可能性があります。

一致したオリジンには、すべてのリクエストに対して標準的な CORS レスポンスヘッダーが返されます。

```
Access-Control-Allow-Origin: <echoed origin>
Vary: Origin
Access-Control-Allow-Methods: GET, POST, PATCH, DELETE, OPTIONS
Access-Control-Allow-Headers: Authorization, Content-Type, X-Qwen-Client-Id, Last-Event-ID, X-Qwen-Event-Epoch
Access-Control-Max-Age: 86400
Access-Control-Expose-Headers: Retry-After, X-Qwen-Event-Epoch, X-Qwen-SSE-Stream-Id
```

`Access-Control-Allow-Origin` は、`*` パターンの場合でも、リテラルの `*` ではなく、リクエストのオリジンをそのまま（ブラウザが送信した通りの大文字/小文字で）エコーバックします。ブラウザキャッシュはこれを `Vary: Origin` と組み合わせてレスポンスをキーとするため、エコーバックすることで、スキーマ変更なしに将来のリリースで `Access-Control-Allow-Credentials` を追加する余地が残されます。公開されたヘッダーにより、ブラウザの Web UI はリトライヒントに従い、SSE エポックを保持し、受け入れられた物理ストリームを相関できます。`Access-Control-Allow-Credentials` は現在**送信されません**。デーモンは `Authorization` 内の Bearer で認証を行うため、`credentials: 'include'` なしでクロスオリジンで機能します。

OPTIONS プリフライトリクエスト（`Access-Control-Request-Method` または `Access-Control-Request-Headers` を伴う OPTIONS）は、`204 No Content` と上記のヘッダーでショートサーキットされます。これは従来の CORS パターンであり、安全です。プリフライトはデーモンが受け入れるメソッド/ヘッダーを確認するだけで、実際の後続リクエストは引き続きフルチェーン（ホスト許可リスト → Bearer 認証 → ルート）を実行するため、アンチ DNS リバインディングと Bearer 強制は、状態が読み取りまたは変更される前に引き続き機能します。一致したオリジンからのプレーンな OPTIONS リクエストは、CORS ヘッダーが付加されたまま下流に流れます。

許可リストに一致しないオリジンにも `403 {"error":"Request denied by CORS policy"}` が返されます。デフォルトのブロックと同じエンベロープであるため、すでにブロックのレスポンスを解析しているクライアントは、許可リストがデプロイされたデーモンを特別に処理する必要がありません。拒否パスは `Access-Control-*` ヘッダーを**出力しません**（ブラウザは無視しますし、出力するとヘッダーの存在を通じて間接的に許可リストのサイズを公開してしまうため）。

設定されたパターンリストは意図的に `/capabilities` でエコーバック**されません**。ブラウザの Web UI はすでに自身のオリジンを知っているため（そもそもデーモンを呼び出しているのです）、リストを公開すると、`/capabilities` の未認証リーダーが信頼されたすべてのオリジンを列挙できてしまいます（設定ミスのあるデプロイメントにとって有用な偵察情報となります）。SDK クライアントは、特定のオリジンを知る必要なく、「このデーモンはクロスオリジンのブラウザヒットを許可する」というために `caps.features.allow_origin` タグでゲートします。

ループバックのセルフオリジンリクエスト（例: Web Shell が同じ `127.0.0.1:port` のデーモンを呼び出す場合）は、CORS ミドルウェアの**前**に実行される**別の** Origin ストリップシムによって処理され、`127.0.0.1:port` / `localhost:port` / `[::1]:port` / `host.docker.internal:port` の `Origin` ヘッダーを削除します。したがって、これらは `--allow-origin` の設定に関係なく通過します。オペレーターは、Web Shell を機能させるためにデーモン自身のポートをリストに追加する必要はありません。

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
{
  "error": "No session with id \"<sid>\"",
  "sessionId": "<sid>",
  "code": "session_not_found"
}
```

ステータスは `404` です。並行するクローズは `code: "session_closing"` を使用します。

`POST /session` の `cwd` が登録されたワークスペースに正規化されない場合の `WorkspaceMismatchError` は、`400` と以下を返します。

```json
{
  "error": "Workspace mismatch: daemon is bound to \"…\"",
  "code": "workspace_mismatch",
  "boundWorkspace": "/path/the/daemon/uses/as-primary",
  "requestedWorkspace": "/path/in/the/request"
}
```

これを使用して、事前にミスマッチを検出します。`/capabilities` から `workspaceCwd` を読み取り、`POST /session` から `cwd` を省略するか（プライマリワークスペースにフォールバックします）、`multi_workspace_sessions` が公開されている場合は `workspaces[].cwd` のいずれかを選択します。

デーモンの `--max-sessions` 上限を超えた `POST /session` は、`Retry-After: 5` ヘッダーと `503` を返します。

```json
{
  "error": "Session limit reached (20)",
  "code": "session_limit_exceeded",
  "limit": 20,
  "scope": "workspace"
}
```

`--max-total-sessions` が新しいセッションを拒否する場合も、`"scope": "total"` を除いて同じレスポンス形状が返されます。

既存のセッションへのアタッチは上限にカウント**されない**ため、アイドル状態のデーモンの再接続は、上限に達していても機能し続けます。

`RestoreInProgressError` — 別の登録がすでにその ID を所有している場合に、`POST /session/:id/load`、`POST /session/:id/resume`、または呼び出し元指定 ID の `POST /session` によって発行されます — `409` と以下を返します。

```json
{
  "error": "Session \"<sid>\" is already being restored via session/<resume|load>; retry session/<load|resume> after it completes",
  "code": "restore_in_progress",
  "reason": "restore_in_progress",
  "retryable": true,
  "sessionId": "<sid>",
  "activeAction": "load",
  "requestedAction": "resume"
}
```

すでに `session/resume` が進行中の ID に対して `session/load` が発行された場合（またはその逆）、あるいは呼び出し元指定 ID のスポーンがどちらかの復元方向と競合した場合に発生します。少なくとも `Retry-After` 秒待ってからリトライしてください。同じアクションの競合（`load` 対 `load`、`resume` 対 `resume`）は、復元がアクティブな間はエラーを返す代わりに統合（coalesce）されます。

`reason` はこのコードを共有する 2 つのフェンスを区別し、`Retry-After` ヘッダーもそれに追従します。

| `reason`                     | 意味                                                                                                               | `Retry-After`                                                 |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------- |
| `restore_in_progress`        | 通常の復元が実行中。                                                                                               | `5`（`session_limit_exceeded` と同じ）                        |
| `awaiting_abandoned_cleanup` | 公開呼び出し元はすでに `504` を受け取っており、キャンセル不可の ACP リクエストとそのクリーンアップがまだ収束していない。 | 有効な復元バジェット（秒）、`5`〜`120` にクランプされる       |

公開の復元リクエストは `limits.sessionRestoreTimeoutMs`（デフォルト 60 秒）によって管理されます。`504` の後、ID は遅延 ACP リクエストとクリーンアップが収束するまでフェンスされたままです。そのため、通常の 5 秒間隔でリトライを続けるクライアントは、解除できない 409 に対してスピンの状態になります。`awaiting_abandoned_cleanup` に付随するバジェット由来のヒントに従ってください。

`SessionWorkspaceConflictError` — リクエストされた `cwd` が登録されたワークスペースの 1 つをターゲットにしているが、同じセッション ID がすでに別のランタイムでライブまたは復元中の場合に、`POST /session/:id/load` および `POST /session/:id/resume` によって発行されます — `409` と以下を返します。

```json
{
  "error": "Session \"<sid>\" is already live or restoring in another workspace runtime.",
  "code": "session_workspace_conflict",
  "sessionId": "<sid>",
  "workspaceCwd": "/requested/workspace",
  "workspaceId": "requested-workspace-id",
  "liveWorkspaceCwd": "/live/owner/workspace",
  "liveWorkspaceId": "live-owner-workspace-id"
}
```

クライアントは所有ワークスペースでリトライするか、進行中の復元が完了するまで待ってから、ID を別のワークスペースに復元する必要があります。同じワークスペース内の復元競合は、引き続きブリッジの `restore_in_progress` / 統合動作を使用します。

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
['health', 'capabilities', 'session_create', 'session_id_override', 'session_scope_override',
 'session_load', 'session_resume', 'session_transcript',
 'unstable_session_resume',
 'session_list', 'session_info', 'session_prompt', 'session_mid_turn_message_mutation',
 'session_cancel', 'session_events',
 'slow_client_warning', 'typed_event_schema',
 'session_set_model', 'client_identity', 'client_heartbeat',
 'session_permission_vote', 'permission_vote', 'workspace_mcp', 'workspace_skills',
 'workspace_providers', 'workspace_acp_preheat', 'workspace_acp_status',
 'auth_provider_install', 'workspace_memory',
 'workspace_agents', 'workspace_agent_generate', 'workspace_env',
 'workspace_preflight', 'session_context', 'session_context_usage',
 'session_supported_commands', 'session_tasks', 'session_monitor_tool_correlation', 'session_stats',
 'session_lsp', 'session_status',
 'session_close', 'session_metadata', 'session_organization',
 'session_archive', 'mcp_guardrails',
 'workspace_mcp_manage', 'mcp_guardrail_events',
 'mcp_server_runtime_mutation',
 'workspace_file_read', 'workspace_file_bytes', 'workspace_file_write',
 'workspace_file_upload',
 'session_approval_mode_control', 'workspace_tool_toggle', 'workspace_skill_toggle',
 'workspace_skill_batch_toggle',
 'workspace_settings', 'workspace_init', 'workspace_mcp_restart',
 'session_recap', 'session_generation', 'session_btw', 'session_shell_command',
 'mcp_workspace_pool', 'mcp_pool_restart',
 'require_auth', 'allow_origin', 'auth_device_flow',
 'permission_mediation', 'prompt_absolute_deadline', 'writer_idle_timeout',
 'non_blocking_prompt', 'session_language', 'session_rewind',
 'workspace_hooks', 'session_hooks', 'workspace_extensions',
 'session_branch', 'rate_limit', 'workspace_reload', 'channel_delivery',
 'multi_workspace_sessions', 'multi_workspace_session_rewind',
 'multi_workspace_session_shell', 'persistent_workspace_registration',
 'workspace_display_name',
 'workspace_qualified_rest_core', 'workspace_qualified_voice',
 'workspace_qualified_memory', 'extension_management_v2',
 'workspace_persisted_transcript',
 'workspace_session_export', 'workspace_archived_session_export',
 'workspace_session_live_state',
 'client_mcp_over_ws', 'cdp_tunnel_over_ws', 'browser_automation_mcp']
```

> 条件付きタグは、一致するデプロイメントトグルがオンの場合にのみ表示されます（以下の表を参照）。F3 の `permission_mediation` タグは常にオンであり、`modes: ['first-responder', 'designated', 'consensus', 'local-only']` を保持するため、SDK クライアントはビルドでサポートされているセットをイントロスペクトできます。ランタイムでアクティブな戦略は `body.policy.permission` にあります。

`session_scope_override` は、`POST /session` のリクエストごとの `sessionScope` フィールド（下記参照）のネゴシエーションハンドルです。古いデーモンはこのフィールドを暗黙に無視するため、SDK クライアントは送信前にこのタグの `caps.features` をプリフライトする必要があります。

`session_id_override` は、`POST /session` および ACP `session/new` メタデータでのオプションの呼び出し元指定 `sessionId` のネゴシエーションハンドルです。クライアントは、古いデーモンが暗黙に無視する可能性があるため、フィールドを送信する前に `caps.features` にこのタグが含まれていることを確認しなければなりません。

`persistent_workspace_registration` は、ランタイム時に追加されたワークスペースの永続的な登録を公開します。`POST /workspaces` は `{ "cwd": "/absolute/path", "persist": true }` を受け入れます。成功時には `persisted: true` が含まれます。登録はユーザーの Qwen ホーム配下のデーモンの正規プライマリワークスペースにスコープされ、次回のデーモン起動時に復元されます。`persist` を省略すると、プロセスローカルの登録が保持されます。`GET /workspace-registrations` は保存された希望セットを一覧表示し、`DELETE /workspace-registrations/:id` はエントリを次回の再起動時に忘れます（アクティブなランタイムのホット削除は行いません）。

`workspace_display_name` は、`POST /workspaces` のオプションの `displayName` 入力、`PATCH /workspaces/:workspace` を通じたワークスペースメタデータの更新、およびワークスペースプロジェクション内のオプションの表示名フィールドを公開します。名前はルックアップやルーティングには関与しません。`id` と正規の `cwd` が唯一のセレクターであり、重複する名前も許可されます。

`workspace_runtime_removal` は、`DELETE /workspaces/:workspace` による同期的なホット削除を公開します。ケイパビリティのワークスペースエントリにはオプションの `removable` が追加されます。`removable: true` の行のみ削除可能です。削除すると、そのランタイムのすべての永続登録エイリアスも忘れますが、ファイル、設定、トランスクリプト、アーカイブが削除されることはありません。

`session_load` と `session_resume` は、明示的な復元ルート（`POST /session/:id/load` および `POST /session/:id/resume`）を公開します。古いデーモンはこれらのパスに対して `404` を返すため、SDK クライアントは呼び出し前に `caps.features` をプリフライトする必要があります。`unstable_session_resume` は、基盤となる ACP メソッドが `connection.unstable_resumeSession` という名前だった時代にリリースされた SDK との互換性のために、非推奨のエイリアスとして引き続き公開されています。新しいクライアントは `session_resume` をゲートとして使用する必要があります。

`limits.sessionRestoreTimeoutMs` は、存在する場合、基盤となる ACP `loadSession` / `unstable_resumeSession` リクエストに対するデーモンのウォールクロックバジェットです。これは加算的な v1 フィールドです。TypeScript SDK はデーモンに 10 秒のクライアントヘッドルームを与え、WebUI ウォッチドッグは 15 秒を与えます。古いデーモンと通信するクライアントは、それぞれ 70 秒と 75 秒を使用する必要があります。

`session_transcript` は `GET /session/:id/transcript` を公開します。これは、永続化されたアクティブセッション JSONL に対する読み取り専用のページングされたリプレイビューです。これは `/load` とは異なります。クライアントのアタッチ、ライブ EventBus のシード、ライブセッションの作成、またはライブリプレイウィンドウの変更は行いません。クライアントは、長いセッションの完全なディスク上のトランスクリプトが必要な場合にこれを使用し、コールド UI 復元中の制限付きライブリプレイには引き続き `/load` を使用する必要があります。

`workspace_persisted_transcript` は `GET /workspaces/:workspace/session/:id/transcript` を公開します。これは、デーモンローカルの永続化専用のページャーであり、ACP の開始、ライブブリッジ状態のクエリ、設定のロード、プロジェクトケイパビリティの検出、またはレガシーな永続カーソルキーの作成は行いません。このタグは無条件です。信頼された単一ワークスペースのプライマリも複数形ルートを使用できるためです。ワークスペースごとの信頼認証は引き続きすべてのリクエストで評価されます。登録された信頼されていないセカンダリワークスペースも読み取り可能ですが、信頼されていないプライマリは引き続き拒否されます。

`workspace_session_export` は `GET /workspaces/:workspace/session/:id/export` を公開します。これは、選択されたワークスペースのアクティブな永続セッションの信頼された専用の完全エクスポートです。`session_export` および `workspace_qualified_rest_core` とは独立しています。リリースされたデーモンは両方の古いタグを公開しながら複数形ルートを実装しない可能性があるため、クライアントはこのタグを直接プリフライトする必要があります。このタグは無条件です。信頼された単一ワークスペースのプライマリは ID または cwd でルートを使用できるためです。エクスポートはライブオーナーの解決、ACP の開始、クライアントのアタッチ、または別のワークスペースへのフォールバックは行いません。

`workspace_archived_session_export` は `GET /workspaces/:workspace/session/:id/archive/export` を公開します。これは、選択されたワークスペースのアーカイブされた永続ストレージからの信頼された専用の完全エクスポートです。`workspace_session_export` および `workspace_qualified_rest_core` とは独立しています。クライアントはこのタグを直接プリフライトする必要があります。別のルートであることで、古いデーモンがアーカイブの意図を無視して同じ ID のアクティブなトランスクリプトを返すことを防ぎます。

`workspace_session_live_state` は `GET /workspaces/:workspace/sessions/live-state` を公開します。これは、選択されたワークスペースランタイムのライブセッションのメモリ上のみのスナップショットと、インメモリカタログバージョンであり、クライアントが `hasActivePrompt`、待機フラグ、および `clientCount` などの揮発性状態のために `GET /workspaces/:workspace/sessions` の永続化カタログをポーリングするのをやめられるようにします。`workspace_qualified_rest_core` とは独立しています。リリースされたデーモンはより広範なワークスペース REST ケイパビリティを公開しながらこのルートを実装しない可能性があるため、クライアントはこのタグを直接プリフライトする必要があります。セレクターは他の複数形セッションルートと同じく、まず正確なワークスペース ID として解決され、次に正規化後の URL エンコードされた絶対 cwd として解決されます。ルートはプライマリおよびセカンダリランタイムの両方に対して信頼された専用のみです。プライマリランタイムへのフォールバックは行わず、信頼されていないセカンダリに有界カタログ読み取りを許可する寛容な永続化カタログポリシーも使用しません。エンドポイントにはクエリパラメータがなく、セッションストレージ、設定、外部コマンド、または ACP のラウンドトリップを実行しないため、そのコストは永続化セッション数や JSONL サイズに依存しません。デフォルトのライブセッション上限がレスポンスを有界に保ち、上限が無効化されていてもコストはライブセッション数にのみ比例します。

`slow_client_warning` は SSE バックプレッシャの動作をカバーします。(a) デーモンは、サブスクライバーのライブフレームバックログまたはライブシリアライズバイトバックログが 75% を超えたときに `slow_client_warning` 合成イベントストリームフレームを出力します（オーバーフローエピソードごとに 1 回。両方の測定値が 37.5% 未満に減少した後に再設定されます）。(b) `GET /session/:id/events` は `?maxQueued=N` クエリパラメータ（範囲 `[16, 2048]`）を受け付け、大規模なリプレイリングに対するコールド再接続時のサブスクライバーごとのフレームバックログを事前にサイズ設定します。シリアライズバイトの上限はデーモンが管理し（デフォルトはサブスクライバーごとに **2 MiB**）、ライブ専用であり、意図的にクエリパラメータはありません。デーモン全体のリングサイズは `--event-ring-size`（デフォルト **8000**、#3803 §02 に準拠）によって制御されます。古いデーモンは警告/クエリの動作を暗黙に欠いているため、オプトインする前にこのタグをプリフライトしてください。

`typed_event_schema` は、SDK の `KnownDaemonEvent` スキーマに一致するデーモンイベントペイロードを公開します。古いデーモンでも互換性のあるフレームをストリーミングする場合がありますが、SDK クライアントは型付きイベントのカバレッジを想定する前にこのタグをプリフライトする必要があります。

`client_heartbeat` は `POST /session/:id/heartbeat` を公開します。古いデーモンは `404` を返します。定期 heartbeat を発行する前に、このタグをプリフライトしてください。

`session_close` と `session_metadata` は、`DELETE /session/:id` と `PATCH /session/:id/metadata` を公開します。古いデーモンは `404` を返します。クローズまたはリネームのアフォーダンスを公開する前に、これらのタグをプリフライトしてください。

`session_organization` は、カスタムセッショングループとピン留めを公開します。これにより、`GET/POST/PATCH/DELETE /workspace/:id/session-groups`、`PATCH /session/:id/organization`、およびオプトインの整理されたリストビュー `GET /workspace/:id/sessions?view=organized` が追加されます。`session_organization` と `workspace_qualified_rest_core` の両方が公開されている場合、ワークスペース修飾の組織変更 `PATCH /workspaces/:workspace/session/:id/organization` も利用可能です。レガシーな変更はプライマリワークスペースのみに限定されます。古いデーモンは変更/グループルートに対して `404` を返し、整理されたビューの契約を無視するため、WebShell/SDK クライアントはグループ化やピン留めの UI を表示する前にこれらのタグをプリフライトする必要があります。

`session_archive` は v1 ディレクトリ状態アーカイブ API を公開します。`POST /sessions/archive`、`POST /sessions/unarchive`、および `GET /workspace/:id/sessions?archiveState=active|archived` です。アーカイブされたセッションは、アーカイブ解除されるまでロードまたは再開できません。

`workspace_qualified_rest_core` は `/workspaces/:workspace/...` 配下の複数形コア REST ルートを公開します。セレクターは最初に正確なワークスペース ID として解決され、次に正規化後の URL エンコードされた絶対 cwd として解決されます。新しい単一ワークスペースのデーモンは、`multi_workspace_sessions` がなくても `workspaces[]` にプライマリランタイムを含めるため、クライアントはワークスペース修飾ルートに必要な ID を検出できます。クライアントは、配列を省略する古いデーモンの場合は `capabilities.workspaceCwd` にフォールバックする必要があります。信頼ステータスと信頼リクエストルートは登録された信頼されていないワークスペースで利用可能です。ファイル読み取りルートは既存のファイルシステム読み取りポリシーに従います。登録された信頼されていないセカンダリワークスペースも永続化専用のセッションおよびセッショングループカタログを公開します。これらの読み取りはセッションへのアタッチ、ACP の開始、またはライブブリッジ状態のマージは行いません。ファイル書き込み、カタログの変更、およびその他の複数形コアルートは、別のケイパビリティ（`workspace_persisted_transcript` など）が明示的に狭い読み取り専用ポリシーを定義していない限り、信頼されたワークスペースを必要とします。信頼されていないプライマリは、複数形カタログおよびトランスクリプトルートから引き続き `403 { code: "untrusted_workspace" }` を受け取ります。レガシーな単数形プライマリルートは既存の互換性動作を保持します。このタグは、コアファイル、ステータス、設定、パーミッション、信頼、ライフサイクル、MCP 制御、ツールおよびスキルトグル、メモリ、ワークスペースエージェント CRUD、およびセッションストレージの表面をカバーします。認証、音声、拡張機能、ACP/WebSocket トランスポート、チャネルワーカー.routing、またはワークスペース修飾のセッションエクスポートはカバーしません。`workspace_session_export` または `workspace_archived_session_export` を別途プリフライトしてください。ワークスペース信頼は ACL ではありません。デーモントークンを保持するクライアントは、このポリシーで許可されたすべての登録ワークスペース表面を読み取れます。

`workspace_qualified_voice` は、信頼されたワークスペースランタイムで選択される Voice ルートを公開します。`GET` および `POST /workspaces/:workspace/voice`、`POST /workspaces/:workspace/voice/transcribe`、および `WS /workspaces/:workspace/voice/stream` です。マルチワークスペースランタイムと共有 ACP/Voice WebSocket リスナーの両方が有効な場合にのみ公開されます。セレクターは他の複数形ルートと同じ ID またはエンコードされた絶対 cwd のルールに従います。REST の場合、不明なセレクターは `400 { code: "workspace_mismatch" }` を返し、信頼されていないセレクターは `403 { code: "untrusted_workspace" }` を返します。WebSocket アップグレードの拒否は、構造化 JSON エンベロープなしで対応する HTTP 400/403 ステータスを公開します。どちらのトランスポートもプライマリにフォールバックしません。レガシーの `/workspace/voice`、`/workspace/voice/transcribe`、および `/voice/stream` はプライマリのみに残ります。クライアントはすべての修飾 Voice モダリティに `workspace_qualified_voice` を使用し、設定固有のエラーは選択されたランタイムに報告させます。レガシーの `workspace_voice`、`workspace_voice_transcription`、および `voice_transcribe` タグはプライマリバインドのルートのみを記述し、修飾されたセカンダリ設定を隠してはなりません。

`workspace_qualified_memory` はワークスペース修飾の managed memory ルートを公開します。`POST /workspaces/:workspace/memory/{remember,forget,dream}` はタスクをエンキューし、`GET /workspaces/:workspace/memory/{remember,forget,dream}/:taskId` はそれを読み戻します。ACP HTTP とマルチワークスペースランタイムの両方が有効な場合にのみ公開されます。セレクターは他の複数形ルートと同じ ID またはエンコードされた絶対 cwd のルールに従います。各登録ワークスペースは独自のタスクレーンを取得します。プライマリの修飾レーンは単数形の `/workspace/memory` 表面と同じインスタンスであるため、一方のレーンでエンキューされたタスクはもう一方で読み取り可能です。解決は選択されたランタイムごとに厳密に行われ、プライマリへのフォールバックはありません。不明なセレクターは `400 { code: "workspace_mismatch" }` を返し、信頼されていないセレクターは `403 { code: "untrusted_workspace" }` を返し、非アクティブまたは drain 中のランタイムは `503 { code: "workspace_runtime_unavailable" }` を返します。読み取りはレーンを割り当てないため、タスクのないワークスペースをポーリングすると `404 { code: "<kind>_task_not_found" }` が返されます。タスク ID はレーンにスコープされ、ワークスペースの再設定やランタイムの置換後は存続しません。古い ID は `404` を返しますが、データ損失条件ではありません。ACP HTTP が無効な場合、タグは公開されず、プライマリ以外の修飾リクエストは再試行不可の `501 { code: "workspace_memory_unavailable" }` を返します。プライマリ修飾ルートはローカル所有のレーンを通じて機能し続けます。

`session_lsp` は `GET /session/:id/lsp` を公開します。デーモンクライアント用の読み取り専用構造化 LSP ステータススナップショットです。古いデーモンは `404` を返します。リモート LSP ステータスを公開する前に、このタグをプリフライトしてください。

`session_status` は `GET /session/:id/status` を公開します。ID ごとの単一セッションのライブブリッジサマリーです。`clientCount` と `hasActivePrompt` に加えて、ライブセッションは `isWaitingForPermission`、`isWaitingForUserQuestion`、`pendingInteractionCount`、および失敗したターンの後の保持された `turnError` を公開します。エラーは次のプロンプトが実際に開始したときにクリアされます。単一セッションのステータスレスポンスとワークスペースセッションリストの両方に `turnError` と `pendingInteractions` が含まれます。レンダリング準備ができたパーミッションアクションまたは `ask_user_question` の質問と、既存のパーミッション投票ルートに必要な `requestId` と選択可能なオプションです。各ユーザー質問には `answerKey` があります。`answers` で投票します。例: `{ "0": "Polling" }`。その値でキー付けされます。永続化専用のセッションはランタイム状態を省略します（ランタイムが存在しないため）。古いデーモンは `404` を返します。完全なセッションリストをスキャンする代わりに単一セッションのステータスをポーリングする前に、このタグをプリフライトしてください。

`session_info` は `GET /workspace/:id/session-info` とその `/workspaces/:workspace/session-info` ツインを公開します。レスポンスは永続化されたアクティブおよびアーカイブされたセッションカウントを、リストメタデータのハイドレーションなしに集約します。これは明示的な O(n) ディスクスキャンであり、ポーリングしてはいけません。クライアントは `truncated: true` を下限結果として扱う必要があります。

`session_approval_mode_control`、`workspace_tool_toggle`、`workspace_skill_toggle`、`workspace_skill_batch_toggle`、`workspace_init`、および `workspace_mcp_restart` は、後述の変更制御ルートを公開します。これらはミューテーションゲートによって厳密にゲーティングされています（ベアラートークンなしで構成されたデーモンは、それらを 401 `token_required` で拒否します）。古いデーモンは `404` を返します。対応するアフォーダンスを公開する前に、各タグをプリフライトしてください。

`mcp_guardrails` (issue [#4175](https://github.com/QwenLM/qwen-code/issues/4175) PR 14) は MCP バジェットサーフェスをカバーします。`GET /workspace/mcp` の `clientCount` / `clientBudget` / `budgetMode` / `budgets[]` フィールド、サーバーごとのセルの `disabledReason` フィールド、および `--mcp-client-budget` / `--mcp-budget-mode` CLI フラグです。古いデーモンは新しいフィールドを完全に省略します。SDK クライアントは `budgets[]` のセマンティクスに依存する前にこのタグをプリフライトします。レジストリ記述子には、将来の機能モード公開のために `modes: ['warn', 'enforce']` も含まれています。現時点では、クライアントはスナップショットの `budgetMode` フィールドからモードを推測します。`enforce` モードでのサーバー拒否は `Object.entries(mcpServers)` の宣言順序によって決定的になります。将来のスコープ優先度レイヤー（qwen-code が採用する場合）では、claude-code の `plugin < user < project < local` 規則を反映して、「最低優先度から」にシフトします。

> **スコープはケイパビリティ駆動です。** `mcp_workspace_pool` では、1 つのワークスペースランタイム内のセッションがトランスポートプールと `WorkspaceMcpBudget` を共有し、スナップショットは `budgets[0].scope: 'workspace'` を出力します。異なるワークスペースランタイムは独立したプールを所有します。タグがない場合、各 ACP セッションはレガシーな `McpClientManager` を使用し、スナップショットは `scope: 'session'` を出力します。N 個のセッションがそれぞれ設定された上限を消費する可能性があります。

`workspace_file_read` はテキスト/リスト/統計/glob ワークスペースファイルルート
（`GET /file`、`GET /list`、`GET /glob`、`GET /stat`）をカバーします。`workspace_file_bytes`
は `GET /file/bytes` をカバーします。これは後から追加されたもので、クライアントが PR19 時代のデーモンに対して
生のバイトウィンドウサポートをプリフライトできるようにします。`workspace_file_write` は
ハッシュ対応のテキスト変更ルート（`POST /file/write`、`POST /file/edit`）を
カバーします。write タグはルート契約が存在することを意味しますが、現在の
デプロイが匿名の変更に開放されていることを意味するものではありません。write/edit は厳格な変更
ルートであり、ループバックでも構成されたベアラートークンを必要とします。
`workspace_file_upload` は `POST /file/upload`、バイナリ取り込みルートをカバーします。
`application/octet-stream` のボディは `MAX_UPLOAD_BYTES`（50 MiB）に制限され、
ワークスペース内に上書きされずに書き込まれます。占有された名前は
自動採番されます（`name (1).ext`、`name (2).ext`、...）。これも厳格な
変更ルートです。

`workspace_qualified_rest_core` が公開されている場合、同じファイル表面は `/workspaces/:workspace/file`、`/workspaces/:workspace/file/bytes`、`/workspaces/:workspace/stat`、`/workspaces/:workspace/list`、`/workspaces/:workspace/glob`、`/workspaces/:workspace/file/write`、`/workspaces/:workspace/file/edit`、および `/workspaces/:workspace/file/upload` でも利用可能です。

同じタグは、`/workspaces/:workspace/agents` および `/workspaces/:workspace/agents/:agentType` でワークスペース修飾のプロジェクトエージェント CRUD も公開します。これらの複数形ルートは、選択されたワークスペースのプロジェクトレベルのエージェントのみを読み取りまたは変更します。`global` および `user` スコープリクエストは `400 { code: "global_scope_not_supported_for_workspace_route" }` を返します。ワークスペースなしの `/workspace/agents` ルートは既存のプライマリワークスペース動作を保持し、ユーザーレベルのエージェントスコープの唯一の REST 表面であり続けます。

`extension_management_v2` は `/extensions/*` のユーザーレベル拡張カタログと変更表面、および `/workspaces/:workspace/extensions/*` のワークスペースアクティベーションプロジェクションを公開します。アーティファクトはグローバルです。ワークスペースルートはプロジェクションの読み取り、正確なアクティベーションオーバーライド、およびランタイムリフレッシュのみを公開します。読み取りは信頼されていない登録ワークスペースをターゲットにできますが、アクティベーション、リフレッシュ、およびワークスペーススコープのインストールには信頼されたターゲットが必要です。遅い変更は `/extensions/operations/:operationId` のデーモンローカル操作を使用します。ストアの世代（操作履歴ではない）が再起動間およびデーモン間で信頼できる情報源です。公開された `workspace_extensions` ケイパビリティと `/workspace/extensions/*` ルートは、プライマリワークスペースの互換性アダプターのままです。クライアントは `extension_management_v2` をプリフライトしなければならず、デーモンモードや `workspace_qualified_rest_core` から推論してはなりません。

### Extension Management V2 ワイア契約

すべてのルートは上記のデーモン Bearer 認証ルールを使用します。`X-Qwen-Client-Id` は V2 変更ルートで任意です。指定する場合、変更のターゲットワークスペースランタイムの 1 つに登録されたクライアントを識別しなければなりません。`:extensionId` は小文字 64 文字の 16 進拡張 ID です。`:workspace` は最初に正確なワークスペース ID として解決され、それ以外の場合は正規化後の URL エンコードされた絶対 cwd として解決されます。

| メソッドとパス                                                     | 成功                                                                        |
| ------------------------------------------------------------------ | --------------------------------------------------------------------------- |
| `GET /extensions`                                                  | `200` グローバルアーティファクトカタログ                                    |
| `PUT /extensions/:extensionId/activation`                          | `202` グローバルデフォルトアクティベーション操作                            |
| `POST /extensions/install`                                         | `202` インストール操作                                                      |
| `POST /extensions/check-updates`                                   | `202` アップデートチェック操作                                              |
| `POST /extensions/:extensionId/update`                             | `202` アップデート操作                                                      |
| `DELETE /extensions/:extensionId`                                  | `202` アンインストール操作。拡張機能が存在しない場合は冪等な `204`          |
| `GET /extensions/operations/:operationId`                          | `200` 操作スナップショット                                                  |
| `GET /workspaces/:workspace/extensions`                            | `200` ワークスペースアクティベーションプロジェクション                      |
| `PUT /workspaces/:workspace/extensions/:extensionId/activation`    | `202` 正確なワークスペースアクティベーション操作                            |
| `DELETE /workspaces/:workspace/extensions/:extensionId/activation` | `202` オーバーライドクリア操作                                              |
| `POST /workspaces/:workspace/extensions/refresh`                   | `202` ランタイムリフレッシュ操作                                            |

グローバルカタログレスポンス:

```json
{
  "v": 1,
  "generation": 12,
  "extensions": [
    {
      "id": "<64 lowercase hex characters>",
      "name": "demo",
      "version": "1.2.3",
      "installType": "npm",
      "defaultActivation": "enabled",
      "workspaceOverrideCount": 1
    }
  ]
}
```

`installType` はインストールメタデータが利用できない場合に省略されます。`defaultActivation` は `enabled` または `disabled` です。`workspaceOverrideCount` は保存された `inherit` エントリを除外します。

ワークスペースプロジェクションレスポンス:

```json
{
  "v": 1,
  "workspaceId": "workspace-id",
  "workspaceCwd": "/absolute/workspace",
  "trusted": true,
  "desiredGeneration": 12,
  "appliedGeneration": 11,
  "extensions": [
    {
      "extensionId": "<64 lowercase hex characters>",
      "name": "demo",
      "version": "1.2.3",
      "defaultActivation": "enabled",
      "workspaceActivation": "disabled",
      "effectiveActivation": "disabled",
      "activationSource": "workspace_override"
    }
  ]
}
```

`workspaceActivation` は `enabled`、`disabled`、または継承の場合は `null` です。`activationSource` は `default`、`workspace_override`、`legacy_path_rule`、または `cli_override` です。`desiredGeneration` は永続ストアの世代です。`appliedGeneration` はコントローラーがそのワークスペースランタイムに適用済みとして記録した最新の世代であり、一時的に遅れることがあります。

インストールには明示的な同意と初期アクティベーションが必要です。

```json
{
  "source": "@scope/demo",
  "consent": true,
  "activation": { "scope": "user" },
  "ref": "optional-git-ref",
  "autoUpdate": true,
  "allowPreRelease": false,
  "registry": "https://registry.npmjs.org"
}
```

ワークスペースのみの初期アクティベーションには `{ "scope": "workspace", "workspaceId": "target-workspace-id" }` を使用します。ターゲットは存在し、信頼されている必要があります。デーモンのインストールは GitHub、Git、および npm ソースを受け入れます。`ref` は npm には適用されず、`registry` は npm にのみ適用されます。`ref`、`autoUpdate`、`allowPreRelease`、および `registry` は任意です。

グローバルおよびワークスペースのアクティベーション `PUT` リクエストは同じボディを使用します。

```json
{ "state": "enabled" }
```

`state` は `enabled` または `disabled` です。アップデート、アンインストール、アップデートチェック、アクティベーションクリア、およびリフレッシュリクエストには必須のボディはありません。

受け入れられた非同期変更はすべて以下を返します。

```http
HTTP/1.1 202 Accepted
Location: /extensions/operations/<operation-id>
Retry-After: 1
Content-Type: application/json

{"accepted":true,"operationId":"<operation-id>"}
```

ワークスペース修飾の変更もグローバルの `/extensions/operations/:operationId` ポーリングパスを使用します。操作履歴はプロセスローカルであり、有界の数の終端エントリのみを保持し、デーモンの再起動時に失われます。クライアントは、操作 ID が消えた場合、カタログまたはワークスペースプロジェクションを再読み取りし、世代を比較する必要があります。

操作スナップショットは以下の形状です。

```json
{
  "v": 1,
  "operationId": "<operation-id>",
  "operation": "install",
  "status": "running",
  "phase": "preparing",
  "createdAt": 1750000000000,
  "updatedAt": 1750000000100,
  "source": "owner/repository",
  "name": "demo"
}
```

`status` は `queued` から `running` に遷移し、次に `succeeded`、`succeeded_with_warnings`、または `failed` になります。実行中、`phase` は `preparing`、`committing`、または `reconciling` です。終端の成功には `result` が含まれる場合があります。`status` は `installed`、`enabled`、`disabled`、`updated`、`uninstalled`、`checked`、または `refreshed` のいずれかです。調整結果にはさらに `refreshed`、`failed`、および `error` が含まれることがあります。アップデートチェックは `result.states` を返します。拡張名でキー付けされ、値は `checking for updates`、`update available`、`up to date`、`not updatable`、または `error` などです。

永続的なコミットの後に不完全なクリーンアップやランタイムの調整が残った場合、失敗した変更としては報告されません。`succeeded_with_warnings` を返し、コミットされた結果を保持します。

```json
{
  "v": 1,
  "operationId": "<operation-id>",
  "operation": "activation",
  "status": "succeeded_with_warnings",
  "createdAt": 1750000000000,
  "updatedAt": 1750000000200,
  "result": {
    "status": "disabled",
    "name": "demo",
    "refreshed": 1,
    "failed": 1
  },
  "warnings": [
    {
      "workspaceId": "workspace-id",
      "workspaceCwd": "/absolute/workspace",
      "code": "reconcile_slow",
      "error": "Runtime reconciliation took 31000ms."
    }
  ]
}
```

警告の `workspaceId` と `code` は任意です。`workspaceCwd` と `error` は常に存在します。クライアントは警告を表示し、カタログ/プロジェクションをリフレッシュし、永続的な変更を盲目的に再試行してはなりません。

バリデーションと認証の失敗は、安定したコードが存在する場合に `{ "error": "...", "code": "..." }` を使用する同期的な HTTP エラーです。重要なケースは `400 invalid_extension_id`、`400 invalid_extension_activation`、`400 workspace_mismatch`、`403 untrusted_workspace`、`404 extension_operation_not_found`、および `429 extension_queue_full` です。インストールのバリデーションは、無効な source/ref/registry オプション、同意の欠如、または初期アクティベーションの欠如/無効性に対しても `400` を返します。`202` の後に失敗した変更は、操作履歴に保持されている間、`status: "failed"`、`error`、およびオプションの安定した `code` で表現されます。一般的なコードには `extension_prepare_timeout` と `extension_conflict` が含まれます。操作に対する HTTP `404` はロールバックを意味しません（操作履歴は永続的ではないため）。

`daemon_status` は `GET /daemon/status` を公開します。後述する統合された読み取り専用オペレーター診断スナップショットです。

**条件付きタグ。** 少数の機能タグは、一致するデプロイトグル、ランタイム配線、または可用性条件がアクティブな場合にのみ公開されます。タグの存在 = 文書化された動作が利用可能。タグの欠如 = そのタグより前の古いデーモン、またはその条件が偽である現在のデーモンのどちらかです。現在のところ:

<!-- conditional-serve-features:start -->

| タグ                                 | 公開される条件 …                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `require_auth`                      | デーモンが `--require-auth`（または組み込み API 経由で `requireAuth: true`）で開始された場合。ループバックバインドの `/health` を含むすべてのルートでベアラートークンが必須です。                                                                                                                                                                                                                                                                                                                                    |
| `mcp_workspace_pool`                | 共有 MCP トランスポートプールがアクティブな場合。`QWEN_SERVE_NO_MCP_POOL=1` でプールが無効化されている場合は省略されます。                                                                                                                                                                                                                                                                                                                                                                                                             |
| `mcp_pool_restart`                  | 共有 MCP トランスポートプールがアクティブな場合。再起動レスポンスにプール対応のマルチエントリシェープが含まれる可能性があります。                                                                                                                                                                                                                                                                                                                                                                                                           |
| `external_tool_guard`               | `qwen serve` が `--external-tool-guard-mode=required` の起動ハンドシェイクを完了した場合。スポーンされたすべての ACP チャネルは、セッション作成前にインストールされたコールバックを確認しなければならず、最終実行境界に到達するサポートされたトップレベルの管理 ACP ツール呼び出しは、すべて 1 つの外部実行前許可を受け取る必要があります。以前のパーミッション/フックの拒否はプロバイダーリクエストを行いません。ネストされた AgentCore 実行は v1 の対象外であり、この外部プロバイダーモードがアクティブな間は拒否されます。このタグは外部プロバイダーのみを反映します。これとは独立して、すべてのデーモンはシェルコマンドラインを持つ管理ツール（`run_shell_command` と `monitor`）に組み込みの Git 再配置ガードを適用するため、このタグがない場合でも実行前拒否がないわけではありません。 |
| `allow_origin`                      | T2.4 ([#4514](https://github.com/QwenLM/qwen-code/issues/4514))。デーモンが少なくとも 1 つの `--allow-origin <pattern>`（または組み込み API 経由で `allowOrigins: [...]`）で開始された場合。一致するオリジンからのクロスオリジンリクエストには適切な CORS レスポンスヘッダーが返されます。一致しないオリジンにはデフォルトの 403 が返されます。設定されたパターンリストは、認証されていないリーダーに信頼されたオリジンセットが漏洩しないように、意図的に `/capabilities` でエコーされません。ブラウザの WebUI はすでに自身のオリジンを知っています。 |
| `prompt_absolute_deadline`          | `--prompt-deadline-ms` / `QWEN_SERVE_PROMPT_DEADLINE_MS` / `ServeOptions.promptDeadlineMs` が正の整数に設定されている場合。                                                                                                                                                                                                                                                                                                                                                                                        |
| `writer_idle_timeout`               | `--writer-idle-timeout-ms` / `QWEN_SERVE_WRITER_IDLE_TIMEOUT_MS` / `ServeOptions.writerIdleTimeoutMs` が正の整数に設定されている場合。                                                                                                                                                                                                                                                                                                                                                                             |
| `workspace_settings`                | デーモンが設定の永続化が利用可能な状態で作成された場合。                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `workspace_voice`                   | 設定の永続化が利用可能であり、レガシーなプライマリワークスペースの Voice 設定ルートがアクティブです。                                                                                                                                                                                                                                                                                                                                                                                                            |
| `workspace_voice_transcription`     | プライマリワークスペースに Voice 文字起こしモデルが設定されている場合。                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `session_shell_command`             | セッションシェル実行が明示的に有効になっている場合。                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `session_artifacts_persistence`     | セッションアーティファクトの永続化がランタイムに配線されている場合。                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `session_generation`                | セッション生成ヘルパーが利用可能な場合。                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `workspace_generation`              | ワークスペーススコープの生成ヘルパーが利用可能な場合。                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `rate_limit`                        | `--rate-limit` / `QWEN_SERVE_RATE_LIMIT=1` / `ServeOptions.rateLimit` が有効になっている場合。                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `workspace_reload`                  | 組み込みルート設定でワークスペースのリロードサポートが利用可能な場合。                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `workspace_trust_hot_reload`        | ワークスペース信頼ポリシーのモニタリングとランタイム世代の reconciliation が配線されているため、デーモンを再起動せずに信頼の変更が有効になり、v2 の信頼ステータスレポートが収束します。                                                                                                                                                                                                                                                                                                                                                                                |
| `channel_reload`                    | デーモン管理のチャネルワーカーマネージャーが有効で、現在のセレクションをリロードできる場合。                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `channel_control`                   | デーモン管理のチャネルワーカーランタイム制御が配線されている場合。                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `channel_management`                | ワークスペーススコープのチャネル設定、ライフサイクル、およびペアリング管理が配線されている場合。                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `multi_workspace_sessions`          | 複数のワークスペースランタイムが登録されているため、セッション作成で cwd によって信頼されたランタイムを選択できる場合。                                                                                                                                                                                                                                                                                                                                                                                                              |
| `multi_workspace_session_rewind`    | 複数のワークスペースランタイムが登録されている場合。単数形のライブセッション rewind ルートは所有ランタイムを解決します。                                                                                                                                                                                                                                                                                                                                                                                                            |
| `multi_workspace_session_shell`     | 複数のワークスペースランタイムが登録されており、セッションシェル実行が明示的に有効になっている場合。単数形の REST シェルは所有ランタイムを解決します。                                                                                                                                                                                                                                                                                                                                                                                 |
| `dynamic_workspace_registration`    | ワークスペースランタイムファクトリがデーモンに配線されているため、既存の信頼されたディレクトリをランタイムでセカンダリランタイムとして登録できる場合。                                                                                                                                                                                                                                                                                                                                                                                 |
| `persistent_workspace_registration` | ワークスペース登録ストアがデーモンに配線されている場合。本番の `runQwenServe` はユーザーレベルのストアを自動的に提供します。直接の `createServeApp` 組み込みは明示的に注入し、ワークスペースレジストリの起動時復元を所有する必要があります。                                                                                                                                                                                                                                                                                              |
| `scratch_workspace_registration`    | 管理されたスクラッチワークスペースの作成が利用可能な場合 — ランタイムファクトリ、検証済みの管理スクラッチルート、およびランタイム破棄が配線されており、管理されたランタイムはすべてスクラッチルートの境界を尊重します。                                                                                                                                                                                                                                                                                                                                                                          |
| `workspace_runtime_removal`         | 削除可能な動的または永続化復元されたセカンダリランタイムを、管理ルート経由で drain して削除できる場合。                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `workspace_qualified_acp`           | ACP HTTP とマルチワークスペースランタイムがアクティブなため、複数形の ACP エンドポイントがセカンダリランタイムを選択できる場合。                                                                                                                                                                                                                                                                                                                                                                                                    |
| `workspace_qualified_voice`         | マルチワークスペースランタイムと共有 ACP/Voice WebSocket リスナーがアクティブなため、セカンダリランタイムに対してワークスペース修飾の Voice モダリティがすべて到達可能な場合。                                                                                                                                                                                                                                                                                                                                                         |
| `workspace_qualified_memory`        | ACP HTTP とマルチワークスペースランタイムがアクティブなため、ワークスペース修飾の managed memory ルートが remember、forget、および dream 操作のワークスペースごとのタスクレーンを選択できる場合。                                                                                                                                                                                                                                                                                                                                  |
| `client_mcp_over_ws`                | デーモンが ACP WebSocket 経由でクライアントホストの MCP サーバーを受け入れる場合。これは明示的なオプトインであり、CDP トンネルパスには不要です。                                                                                                                                                                                                                                                                                                                                                                                     |
| `cdp_tunnel_over_ws`                | デーモンが逆方向の `/cdp` WebSocket トンネルを公開する場合。明示的なオプトイン、または Chrome 拡張のオリジンが許可されていることが理由です。トンネルが存在することのみを意味し、Chrome DevTools MCP ツールが登録されていることは意味しません。                                                                                                                                                                                                                                                                                            |
| `browser_automation_mcp`            | ACP HTTP が有効、`cdp_tunnel_over_ws` がアクティブ、Bearer トークンが `/cdp` をブロックしておらず、`QWEN_CDP_MCP_COMMAND` が外部 stdio MCP アダプターを指定している場合。メイン CLI パッケージはブラウザ自動化アダプターをバンドルしていません。このタグがない場合でも Chrome 拡張のサイドパネルチャットは機能する可能性がありますが、コンソール/ネットワーク/スクリーンショット/クリックツールはデフォルトで登録されません。                                                                                                                                                                        |
| `voice_transcribe`                  | Voice WebSocket エンドポイントがマウントされている場合。文字起こしを成功させるには設定された Voice モデルがまだ必要です。                                                                                                                                                                                                                                                                                                                                                                                                             |
| `realtime_voice`                    | macOS WebShell デーモンで Live Voice が有効になり、ネイティブの Host 統合がアクティブです。`/live/status` は準備状況を報告しますが、この機能は有効になるまで取り下げられます。                                                                                                                                                                                                                                                                                                                                                        |

<!-- conditional-serve-features:end -->

`mcp_guardrails` はこの条件付きテーブルには含まれ**ません**。これは常に有効なタグであり、オペレーターが予算を設定しているかどうかに関係なく、バイナリが新しい `/workspace/mcp` バジェットフィールドをサポートする場合は常にアドバタイズされます。`--mcp-client-budget` を設定していないオペレーターでも、新しいフィールド（`budgetMode: 'off'`、`budgets: []`）を受け取ります。

`mcp_guardrail_events` (issue [#4175](https://github.com/QwenLM/qwen-code/issues/4175) PR 14b) は、ポーリングループなしで MCP バジェット状態の閾値超過を通知する、型付き SSE プッシュイベントをアドバタイズします。`GET /session/:id/events` には 2 種類のフレームタイプが到着します。

- `mcp_budget_warning` — `reservedSlots.size / clientBudget` が 75% を超える crossing（閾値超過）時に 1 回発生します。比率が 37.5%（`MCP_BUDGET_REARM_FRACTION`）を下回った後にのみ再武装（リアーム）されます。PR 10 の `slow_client_warning` ヒステリシスを反映したものですが、サブスクライバーごとのバックログレベルではなく、マネージャーレベルで動作します。ペイロード: `{ liveCount, reservedCount, budget, thresholdRatio: 0.75, mode: 'warn' | 'enforce' }`。`warn` と `enforce` の両方のモードで発生し、`off` では決して発生しません。
- `mcp_child_refused_batch` — 1 つ以上のサーバーが拒否された場合に各 `discoverAllMcpTools*` パスの終了時に発生し、**かつ** `readResource` の遅延スポーン拒否パスで長さ 1 のバッチとして発生します。ペイロード: `{ refusedServers: [{ name, transport, reason: 'budget_exhausted' }, ...], budget, liveCount, reservedCount, mode: 'enforce' }`。`warn` モードでは決して拒否しないため、`mode` はリテラルの `'enforce'` になります。

どちらのイベントもセッションごとの SSE リプレイリングに保存され（`id` を持ちます）、`Last-Event-ID` で再接続するクライアントはこれらを介して再開できます。長時間の切断後の状態については、`GET /workspace/mcp` のスナップショットが引き続き信頼できる情報源（source-of-truth）となります。一度アドバタイズされると常に有効になり、条件付きの切り替えはありません。SDK のリデューサー状態（`DaemonSessionViewState`）は、シンプルな遅延表示風の UI を必要とするアダプター向けに、`mcpBudgetWarningCount`、`lastMcpBudgetWarning`、`mcpChildRefusedBatchCount`、`lastMcpChildRefusedBatch` を公開します。

## ルート

### `GET /health`

Liveness プローブ。デフォルトの形式では、リスナーが稼働していれば `200 {"status":"ok"}` を返します。軽量でブリッジへのアクセスを伴わないため、高頻度の k8s/Compose liveness プローブに適しています。

デーモン全体のプローブで、管理されるすべてのワークスペースランタイムにまたがるブリッジの**カウンター**を集約するには、`?deep=1`（`?deep=true` または単なる `?deep` も受け付けます）を渡します。drain 中のワークスペースも含みます（情報提供のみを目的とし、真の liveness チェックではありません）。

```json
{
  "status": "ok",
  "workspaceCount": 2,
  "sessions": 3,
  "pendingPermissions": 1,
  "activePrompts": 1,
  "activeWork": true,
  "activeWorkReporting": "full",
  "activeWorkStaleMs": 4200,
  "connectedClients": 2,
  "channelAlive": true,
  "lastActivityAt": "2026-07-15T08:30:00.000Z",
  "idleSinceMs": 120000
}
```

`sessions`、`pendingPermissions`、および `activePrompts` は合計値です。`activeWork` は、任意のランタイムに受け入れ済みだが未確定のプロンプト（FIFO 待機中のプロンプトを含む）、実行中のバックグラウンドエージェント、キュー済み/進行中のエージェントターミナル通知、またはセッション管理のバックグラウンドシェル作業がある場合に true となります。シェル作業は、シェルレジストリが実行中のエントリを報告している間、およびそのターミナル通知がキューされている間または親の継続を駆動している間アクティブのままです。任意の数のシェルが 1 つの有界な集約ホールドに寄与します。Monitor、ワークフロー、cron ジョブ、フォローアップ提案、およびシェルレジストリが追跡できなくなった外部プロセスはフィールドの対象外です。セッションスコープです。セッションにまだアタッチされていないチャネルレベルの作業（スポーン中、保留中の復元、MCP 検出または認証）はカウントされないため、`activeWork` はデーモンがそのチャネルの回収を拒否している場合でも false を示すことがあります。このフィールドを「デーモンが回収可能」として解釈しないでください。セッション所有の作業のみを記述します。`activeWorkReporting` は、そのブール値の実際に保証されている範囲を示します。すべての子がすべてのカテゴリを報告する最新レポートでカバーされている場合は `full`、どのセッションもネゴシエーションされていない場合は `none`、それ以外の場合は `partial`（古いスナップショットや必須カテゴリを省略するネゴシエーション済み子を含む）。3 つのレポート間隔より古いスナップショットはカバレッジとしてカウントされなくなります。それはセッションがアイドルであるというレポートではなく、セッションは保持中として読み戻されます。ちょうどネゴシエーションされたが不完全な子の通常の自動クリーンアップも無効になります。`shell` を理解しない子は、完全な現在の述語に従って条件付きクローズを安全に承認できません。完全にサポートされていない歴史的な子はレガシーなクリーンアップ動作を保持し、明示的な close、kill、shutdown、およびチャネル終了は強制操作のままです。`activeWorkStaleMs` は、ブール値が依存する最も古いスナップショットの経過時間です（**カバーされているセッションの中での**）。カバーされているセッションがない場合は `0` です。これは診断用です。鮮度はすでにデーモンによって `activeWorkReporting` に組み込まれているためです（各チャネルのネゴシエーションされたケイデンスを知っているのはデーモンのみです）。グレードはランタイムごとではなく、管理されたランタイム全体で一度に計算され、その後結合されます。セッションのないランタイムは自明に完全であり、それを証拠として扱うと空のワークスペースが別のワークスペースの未報告セッションを保証できてしまいます。`lastActivityAt` は最新の非 null ワークスペースアクティビティ時刻であり、`idleSinceMs` は同じスナップショットから導出されます。`channelAlive` は少なくとも 1 つの管理ワークスペースチャネルがライブであることを意味します。すべてのワークスペースが健全であることを意味するわけではありません。`connectedClients` とオプションの `rateLimitHits` は、デーモン全体のカウンターのままです（ワークスペースごとの合計ではありません）。

再起動コントローラーは、以下の場合にデーモンをビジーとして扱うべきです。

```ts
const busy =
  health.activePrompts > 0 ||
  health.activeWork ||
  health.activeWorkReporting !== 'full';
```

3 番目の項を削除すると、`activeWork === false` が「どの子も何も教えてくれなかった」と区別できなくなります。これが、それに基づいて行動することが安全でない唯一のケースです。未知のレスポンスと失敗したプローブも再起動を防がなければなりません。`activePrompts` は独立した互換性シグナルのままです。

これらのフィールドは観測キャッシュであり、再起動リースではありません。新鮮で完全にグレード付けされた空の回答でさえ、サンプリングされた瞬間を記述するものであり、その直後に作業が開始される可能性があります。上記のルールは誤った再起動のリスクを大幅に低減しますが、排除はしません。厳密な安全性には、新しい作業の受け入れを停止し、drain を確認してからシャットダウンする prepare-restart フェンスが必要です。

> ⚠️ deep プローブは**情報提供のみ**を目的としており、実際の liveness 検証でもアトミックな回収リースでもありません。ネゴシエーションされた ACP 子は、ネゴシエーションされたケイデンスでチャネル全体のアクティブワークスナップショットを公開し、デーモンはその鮮度を `activeWorkReporting` に組み込みます。ただし、レポートがないからといってチャネルをキルすることはありません。1 つのセッションの沈黙は、プロセスが死んだという証拠ではないためです。トランスポートの liveness とスタックしたエージェントの検出は別のメカニズムです。`connectedClients` は REST SSE 接続をカウントします。すべての ACP トランスポートではありません。アイドル状態の回収には繰り返しサンプリングとグレースフルシャットダウンを使用してください。トランスポートおよびワークスペースごとの診断には認証された `/daemon/status` を使用してください。管理ランタイムのゲッターのいずれかがスローした場合、deep ヘルスは部分的な合計を返す代わりに `503 {"status":"degraded","reason":"aggregation_failed"}` で fail closed します。デーモンログは失敗したワークスペースランタイムを特定します。ブートストラップ中、ランタイムレジストリが準備できる前は、`Retry-After: 1` で `503 {"status":"degraded","reason":"bootstrap"}` を返します。リスナーの liveness については、`?deep` なしのデフォルトの `/health` を使用してください。

**Auth:** ループバック**以外**のバインドでのみ必須です。ループバック（`127.0.0.1`、`::1`、`[::1]`）では、`/health` は Bearer ミドルウェアより前に登録されるため、ポッド内の k8s/Compose プローブはトークンを保持する必要がありません。ループバック以外（`--hostname 0.0.0.0` など）では、ルートは Bearer ミドルウェアの後に登録され、有効なトークンがない場合は 401 を返します。そうでなければ、未認証の呼び出し元が任意のアドレスをプローブして `qwen serve` の存在を確認できてしまい、ポートスキャンと組み合わさるとまずい低深刻度の情報漏洩につながります。ループバックの免除においても、CORS deny と Host allowlist は引き続き適用されます。

### `GET /daemon/status`

読み取り専用のオペレーター診断。`/health` とは異なり、これは通常のデーモン API です。
ループバックバインドを含め、Bearer 認証とレート制限の後に登録されます。クエリパラメータ:

- `detail=summary`（デフォルト）はインメモリ上のデーモン状態のみを読み取ります。
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
    "maxSessions": 32,
    "maxTotalSessions": null,
    "maxPendingPromptsPerSession": 5,
    "listenerMaxConnections": 256,
    "eventRingSize": 8000,
    "compactedReplayMaxBytes": 4194304,
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

マルチワークスペースのレスポンスには、トップレベルの `workspaces[]` 行も
`{ id, cwd, displayName?, primary, trusted }` で含まれます。オプションの表示名は
未設定の場合は省略され、表示のみに使用されます。ステータスコンシューマーは引き続き
`id` または `cwd` を使用してランタイムを相関させる必要があります。

`runtime.perf` はオプションです。存在する場合、デーモンプロセスのイベントループ遅延、プロンプト FIFO キュー待機サンプル、およびデーモン子プロセスパイプのバイトカウンターのみを報告します。
ACP 子プロセスのイベントループ遅延は `/daemon/status` には含まれません。

`status` は、いずれかのイシューがエラー重大度の場合は `error`、いずれかのイシューが警告重大度の場合は `warning`、それ以外の場合は `ok` になります。イシューコードは安定しており、
`session_capacity_high`、`connection_capacity_high`、`pending_permissions`、
`acp_channel_down`、`preflight_error`、`mcp_budget_warning`、
`mcp_budget_exhausted`、`rate_limit_hits`、`channel_worker_exited`、
`channel_worker_partial_connect`、および `workspace_status_unavailable` が含まれます。リスナーの準備が整ってから完全なランタイムがマウントされるまでの短いウィンドウ期間中、`/daemon/status` は `daemon_runtime_starting` を報告する場合があります。非同期ランタイムのマウントに失敗した場合、`daemon_runtime_failed` を報告し、ステータス以外のランタイムルートは `503` を返します。

`runtime.activity` はデーモン全体のプロンプトアクティビティを報告します。`activePrompts` は実行中のプロンプトを持つセッションをカウントします。`pendingPrompts` は、実行中のプロンプトと FIFO 待機中のプロンプトを含め、まだ確定していないすべての受け入れ済みプロンプトをカウントします。`queuedPrompts` は、受け入れられたがまだディスパッチされていない FIFO 待機中のプロンプトをカウントします。`lastActivityAt` は最後のプロンプト開始/終了またはセッションスポーンの ISO 8601 タイムスタンプです。デーモンが起動以来いかなるアクティビティも処理していない場合は `null` になります。`idleSinceMs` はレスポンス生成時に `lastActivityAt` から計算されます。

`limits.memory` は加算的であり、デーモンの解決されたメモリ数値を報告します。必須の `enforced: false`、`childHeap` オブジェクト（`mode`、`maxConcurrentChildren` と `perChildCeilingMb` は両方とも `mode: 'off'` の下では `null` で、何もモデル化しないことを示します。また `perChildCeilingMb` は `modeled.minChildHeapMb` 内でパーティションをモデル化できない場合にも追加で `null` になります。プールがそのフロアで 1 つの子もカバーできない場合、または `modeled.legacyChildCeilingMb`（`floor(available / 2)` であり、1024 MB 未満のホストではフロアを下回ります）でキャップするとフロアの下にランディングする場合です。0 になることはなく、`maxConcurrentChildren` はそのような場合に `0` です。パーティションをモデル化しないホストは、計算された回答であり、欠落したモデルではないためです）、`configuredBudgetMb`、`effectiveBudgetMb`（解決された cgroup/ホストメモリでキャップされた設定値）、`budgetSource`（`flag` / `derived`）、`availableMemoryMb`、`availableMemorySource`（`constrained` / `host`）、`insufficientMemory`、および `modeled` オブジェクト（`rootReserveMb`、`childPoolMb`、`minChildHeapMb`、`maxChildHeapMb`、および `legacyChildCeilingMb` — ACP 子が今日受け取る上限の保守的なモデルで、実際の数値を下回ることがあります）。`runtime.memory` はさらに `registeredWorkspaces`（登録カウント — 削除されていないワークスペースエントリ。drain 中、遷移中、またはブロックされたものを含む。ライブ子カウントではない）、`activeAcpChildren`（ライブで非 dying チャネルを持つデーモン管理 ACP 子 — 遷移中またはブロックされたエントリを含むが、キルが開始されたワークスペースは子がまだ終了していない場合でも除外。チャネルワーカー、MCP 子孫、または未アタッチのスポーン予約ではない）、`childRssCoverage`（`active_children` — ライブチャネルを持つすべての ACP 子。`activeAcpChildren` がカウントするセット。古いデーモンは `primary_only` を送信）、以下で説明する `children` オブジェクト、および `modeled` オブジェクト（`recommendedShareAtRegisteredMb`（登録されたワークスペースがない場合は `null`）と `recommendedShareAtActiveMb`（アクティブな子がない場合は `null`）。各シェアはレガシーな子の上限でキャップされ、上限が許可する場合にのみ最小子ヒープでフロアリングされます。小さなホストでは上限がフロアを下回るため、シェア × カウントが子プールを超えることがあります）。シェアはプールのパーティションではなく、助言として読んでください。すべてが観測です。これらの値から派生する子のスポーン引数はありません。これらの値に基づいてリクエストが拒否されることもありません。`childHeap` は `modeled.childPoolMb` の固定パーティションをモデル化します。すべての子が同じ `perChildCeilingMb` を受け取るため、モデル化された合計はプール内に収まります（スポーンごとのシェアとして蓄積するのではなく）。`refusals` は受け入れ圧力としてのみ読んでください。カウント 0 はパーティションが安全に適用できることを意味**しません**。子ははるかに大きなホスト全体で実行されるためです。非ゼロのカウントが必ずしもキャパシティプレッシャーを意味しない理由はさらに 2 つあります。受け入れ判定は終了する子をそれが退出するまでカウントするため、すでに `maxConcurrentChildren` に達しているデーモンでは、チャネル置換ごとにオーバーラップウィンドウ中に拒否が記録されます。また、パーティションをモデル化できないほど小さなホストでは `maxConcurrentChildren` が `0` であるため、`refusals` は ACP の総スポーン数と等しくなり、`insufficientMemory` がそれを説明するフィールドとなります。通常の `runQwenServe` パスでは、ブートストラップアプリが作成される前にバジェットが解決されるため、`limits.memory` はブートストラップウィンドウ中すでに投入されています。バジェットを解決しないパス（`runQwenServeImpl` をバイパスする直接組み込みなど）でのみ `null` となります。SDK 型は `null` を許可するため、正しいクライアントはそれに対応します。

`runtime.memory.children` はそのブロック内で加算的であり、`childRssCoverage` が名前を付ける子の集約 RSS を報告します。`rssBytes`（それらの合計された自己報告 RSS）、`sampled`（読み取りを生成した子の数）、および `oldestReadingAgeMs`（合計内の最も古い読み取りの経過時間。呼び出し元がその部分をどれだけ離れて取得したかを判断できます）。`sampled` の分母は兄弟の `activeAcpChildren` であり、ブロック内で繰り返されません。`sampled` が低い場合、`rssBytes` は合計ではなく下限です。サンプリングはアクティブな SSE/WS ウォッチャーにゲーティングされているため、誰もストリーミングしていないデーモンに対するステータスリクエストは、ライブ子があっても `sampled: 0` を報告します。隣の `activeAcpChildren` がそのギャップを可視化し、`sampled: 0` の `rssBytes: 0` は測定されたゼロを意味することはありません。`oldestReadingAgeMs` は何もサンプリングされなかった場合、およびすべての貢献者がそのフィールドより前のブリッジである場合にも `null` です。「新鮮」を意味することはありません。合計を過算と下算の両方として読んでください。プロセスごとの RSS を合計すると、子が共有するページが二重カウントされます。各子は自身のプロセスのみを報告するため、MCP 子孫とすべてのチャネルワーカーが欠落します。デーモンツリーのメモリではありません。SDK ミラーではオプションです。`primary_only` を報告するデーモンは決して送信しないためです。

`runtime.memory.pressure` はそのブロック内で加算的であり、デーモンルートプロセス自身のメモリプレッシャーを報告します。`mode`（`off` / `observe`）、`level`（`normal` / `soft` / `hard` / `critical`）、`source`（`rss` / `heap` / `unknown`）、`ratio`、および比率の元となる 6 つの生の数値 — `rssBytes`、`rssRatio`、`availableBytes`、`heapUsedBytes`、`heapRatio`、`heapLimitBytes`。`ratio` は `rssRatio` と `heapRatio` の大きい方であり、`source` はどちらであったかを名前付けします。タイは `rss` として報告されます。`availableBytes` は `limits.memory.availableMemoryMb` のバイト単位です。意図的に検出された cgroup/ホストの数値であり、`effectiveBudgetMb` ではありません。プロセスを終了させるのは実際の制限であり、オペレーターのポリシー数値ではないためです。`source: "unknown"` はどちらの分母も測定できなかったことを意味し、健全と解釈してはなりません。その場合のみ `level` は `normal` です。分類するものがないためです。数値はデーモンの**ルートプロセスのみ**をカバーします。このプロセス自身の `memoryUsage()` であり、子が増殖しても動きません。`runtime.memory.children` はそれらを個別に報告し、どちらの数値もプロセスツリーのメモリではありません。両方のモードがブロック全体を報告します。`observe` のみ、パスフリーの `daemon_memory_pressure` 警告をステータス集約に追加します。`off` はトップレベルの `status` を変更しません。どちらのモードでも何も是正しません。SDK ミラーではオプションです。それが存在する前に `runtime.memory` を出荷したデーモンは、それなしでブロックを送信するためです。

`limits.maxTotalSessions` は加算的です。`null` はデーモン全体の新しいセッションキャップが無効であることを意味します。複数の起動/復元されたワークスペースが存在し、`--max-total-sessions` が省略され、`maxSessionsPerWorkspace` が有限の場合、デーモンは有効な合計キャップを `maxSessionsPerWorkspace * startupWorkspaceCount` として一度導出します。後続の動的登録は再計算しません。設定されると、デーモン全体の新しいセッション作成を制限し、既存の `session_limit_exceeded` エラー形状に `scope: "total"` を追加して合計制限の失敗を報告します。

`runtime.channel.live` はデーモン内部の ACP ブリッジチャネルを報告します。これはチャネルアダプターワーカーではありません。デーモンが管理するチャネルは `runtime.channelWorker` を使用し、その `state` は `disabled`、`starting`、`running`、`exited`、`failed`、または `stopped` のいずれかです。ワーカーが `running` に達した後に終了した場合、`/daemon/status` はデーモンをオンラインのまま維持し、警告イシューコード `channel_worker_exited` を報告します。

デーモンが管理するチャネルワーカーの起動は引き続き fail-fast です。`qwen serve --channel ...` が ready 状態に到達するワーカーを起動できない場合、serve の起動は失敗します。ワーカーが ready に到達した後、予期しない終了は serve スーパーバイザーによって制限付きポリシー内で再起動されます。5 分間のウィンドウで最大 3 回の再起動試行が行われ、1 秒、5 秒、そして 15 秒のバックオフが適用されます。ワーカーは 15 秒ごとに IPC heartbeat を送信します。45 秒間 heartbeat が観測されない場合、スーパーバイザーはワーカーを古いものとみなしてキルし、`staleHeartbeatAt` を記録して、同じ再起動パスを使用します。

`runtime.channelWorker` には追加の運用フィールドが含まれる場合があります。`requestedChannels`、`pid`、`startedAt`、`exitCode`、`signal`、`error`、`restartCount`、`lastExitAt`、`lastRestartAt`、`nextRestartAt`、`lastHeartbeatAt`、`staleHeartbeatAt`、`startupFailures`、および `startupFailuresTruncated` です。各起動失敗には `channel`、`phase`（現在は `connect`）、オプションのアダプター提供の `code`、および認証情報をリダクションした `message` があります。現在のワーカー世代に対して最大 64 件の失敗が保持されます。切り捨てフラグは、より多くの失敗が観測されたことを意味します。`code` は診断用であり、安定したクロスアダプターの分類ではありません。`restartCount` はこの serve プロセスによって行われた再起動試行のライフタイム数です。`restartCount > 0` の実行中のワーカーは、別のイシューが適用されない限り健全です。`requestedChannels` に `channels` に存在しない名前が含まれている実行中のワーカーは、`channel_worker_partial_connect` を報告します。

マルチワークスペースのデーモン（`--workspace` が繰り返される）では、`runtime` にさらに `channelWorkers[]` が含まれます。所有ワークスペースごとに 1 エントリで、それぞれが `workspaceId`、`workspaceCwd`、および `primary` で注釈された `channelWorker` スナップショットです。`channelWorker` は互換性のためにプライマリワークスペースのスナップショットとして引き続き設定されます。単一ワークスペースのデーモンは `channelWorkers[]` を省略します。

### デーモン管理チャネル制御

`channel_control` ケイパビリティはランタイム選択リソースを公開します。リソースはデーモン全体ですが、互換性パスは単数形の `/workspace` プレフィックスを使用します。ランタイム選択は永続化されず、デーモンの起動時 `--channel` オプションを変更しません。

`GET /workspace/channel` は不変のマネージャースナップショットを返します。

```json
{
  "enabled": true,
  "selection": { "mode": "names", "names": ["telegram", "feishu"] },
  "pendingSelection": { "mode": "names", "names": ["telegram"] },
  "transition": "reconciling",
  "workers": [
    {
      "workspaceId": "primary-id",
      "workspaceCwd": "/work/primary",
      "primary": true,
      "enabled": true,
      "state": "running",
      "channels": ["telegram"],
      "pid": 1234
    }
  ]
}
```

`selection` は無効時に `null` です。`pendingSelection` は変更中にのみ存在します。`transition` は `idle`、`starting`、`reconciling`、`stopping`、または `rolling_back` のいずれかです。

`PUT /workspace/channel` は厳格にゲーティングされ、ちょうど 1 つの選択を受け入れます。

```json
{ "selection": { "mode": "all" } }
```

```json
{ "selection": { "mode": "names", "names": ["telegram", "feishu"] } }
```

名前はトリミングされ、ソートせずに重複排除されます。空の名前配列は無効です。`all` は引き続きプライマリワークスペースのみに限定されます。無効から有効への変更は `201` を返します。冪等な PUT または置換は `200` を返します。レスポンスは `{ changed, replaced, partial, state }` です。等しい選択は健全なワーカーをそのまま保持しますが、ワーカーが停止または失敗している等しい選択は回復します。

`DELETE /workspace/channel` は厳格にゲーティングされ、冪等です。`{ changed, state }` を返します。成功時の状態は無効です。`POST /workspace/channel/reload` も厳格にゲーティングされ、設定を再読み取りし、ワークスペースグループを再解決し、コミットされた選択を強制的に調整します。無効時に `409 channel_worker_not_enabled` を返します。`channel_reload` ケイパビリティは、マネージャーがコミットされたリロード可能な選択を持っている間にのみ動的に公開されます。

すべての有効化、置換、リロード、停止、およびデーモンシャットダウンは 1 つの FIFO ライフサイクルレーンに入ります。GET はそのレーンを待ちません。順序付き選択が変更されなかったワークスペースグループはオンラインのままです。置換の失敗は、新しく開始されたワーカーを停止し、以前のコミットされた選択を復元しようとします。クライアントは `rolledBack`、`rollbackError`、および `state` を検査しなければなりません。クリーンアップや復元も失敗する可能性があるためです。デーモンはトランザクション全体を通じてチャネルサービスの PID リースを保持し、すべての関連する子の終了が確認されるまで解放しません。

安定した制御エラー:

- `400 invalid_channel_selection`、`channel_workspace_mismatch`、または `ambiguous_channel_workspace`
- `403 untrusted_workspace`
- `409 channel_service_conflict` または `channel_worker_not_enabled`
- `500 channel_worker_stop_failed`
- `502 channel_worker_start_failed`。`rolledBack` とオプションの認証情報リダクションされた `rollbackError` を含む
- `503 daemon_draining`

トークンが設定されていないデーモンに対する厳格な書き込みは、制御コードが実行される前に `401 token_required` を返します。リクエストが開始されると、HTTP クライアントの切断はライフサイクルトランザクションをキャンセルしません。クライアントは同じ PUT を安全にリトライできます。

`502 channel_worker_start_failed` の場合、レスポンスに `startupFailures[]` と `startupFailuresTruncated` も含まれる場合があります。各失敗には試行されたワーカーの信頼された `workspaceCwd` が追加されます。これらのフィールドは失敗したトランザクションを記述し、`state` はロールバック後の現在の状態を記述します。後続の GET は失敗した試行を保持しません。部分的に接続されたワーカーは代わりに成功を返し、ワーカーのスナップショットで失敗を公開します。起動時の全失敗は引き続き、クエリ可能なデーモンが存在する前に `qwen serve` を中止します。

`--daemon-url` なしの `qwen channel status` は引き続き pidfile メタデータを読み取ります。`--daemon-url` 付きの場合は `GET /workspace/channel` を読み取ります。再起動ウィンドウ中は serve 所有の pidfile は予約されたままですが、クライアントが古いワーカープロセスを表示しないように `workerPid` は省略されます。マルチワークスペースのデーモンでは、

pidfile はさらに、加算的な `workers[]` 配列（ワークスペースごとの `workspaceId` / `workspaceCwd` / `channels` / ライブ `workerPid`）を保持します。一方、トップレベルの `channels`（和集合）と `workerPid`（プライマリ）は古いリーダーのために引き続き設定されます。単一ワークスペースのデーモンは元の単一ワーカーシェープを保持します。ワーカーの stdout/stderr はデーモンログに転送されますが、ベアラートークン、機密性の高いワーカー環境変数、およびプロキシ URL 認証情報は伏字（redacted）処理されます。

### ワークスペースチャネル管理

`channel_management` ケイパビリティは、ワークスペーススコープのチャネル設定およびランタイム管理をアドバタイズします。単数形の `/workspace` ルートはプライマリランタイムをターゲットにします。`/workspaces/:workspace` は登録済みの信頼されたランタイムを正確に解決し、プライマリランタイムへのフォールバックは行いません。

読み取り専用のディスカバリは以下を使用します。

- `GET /workspace/channel-types`
- `GET /workspace/channels`
- `GET /workspaces/:workspace/channel-types`
- `GET /workspaces/:workspace/channels`

カタログは、この管理 API でサポートされるタイプに `manageable: true` のマークを付けます。インスタンススナップショットには、リビジョン、伏字処理されたシークレット存在メタデータ、起動状態、およびランタイム状態が含まれます。リテラルのシークレットが返されることは決してありません。チャネルスナップショットは `Cache-Control: no-store` を使用します。

フィールド記述子は `properties` を通じてネストされたオブジェクトメタデータを公開できます。数値記述子は開いた下限に `exclusiveMinimum` を使用できます。アドバタイズされたフィールド種別をレンダリングしないクライアントは、既存の設定値を強制や削除ではなく保持しなければなりません。オブジェクトフィールドは required にできません。また、ネストされたプロパティはシークレットや環境変数解決フィールドにはなれません。それらの管理プロトコルはトップレベルのみに残ります。ネストされた `required` プロパティは、親オブジェクトが書き込みに存在する間のみ強制されます。親オブジェクトを省略すると、ネストされた要件はチェックされません。書き込みは各フィールドの保存値をまるごと置換します。つまり、オブジェクトを保持するには保存されたオブジェクトを再送信する必要があります。デーモンは部分オブジェクトをマージしません。

設定の書き込みはオプティミスティック同時実行制御と厳格なベアラートークンゲートを使用します。

- `PUT /workspace/channels/:name`
- `DELETE /workspace/channels/:name`
- `PUT /workspace/channels/:name/startup`
- 同等の `/workspaces/:workspace/...` ルート

各設定変更には `expectedRevision` が含まれます。upsert リクエストには `config` オブジェクトが含まれ、明示的なシークレット操作（`preserve`、`replace`、`clear`）を含む場合があります。チャネル設定は解決されたワークスペースの外部の作業ディレクトリを選択できません。

ランタイムアクションは `.../channels/:name/start`、`stop`、`restart` への厳格にゲーティングされた `POST` リクエストです。これらは解決されたワークスペースが所有するワーカーのみを操作します。

ペアリング管理は、`pairing` 送信ポリシーまたはグループポリシーで設定されたインスタンスでのみ利用可能です。

- `GET .../channels/:name/pairing-requests`
- `POST .../channels/:name/pairing-requests/approve`（`{ "code": "..." }` を使用）
- `GET .../channels/:name/pairing-approvals`
- `DELETE .../channels/:name/pairing-approvals`（`{ "senderId": "..." }` または `{ "groupId": "..." }` を使用）

すべてのペアリングルートはベアラートークンを必要とし、`Cache-Control: no-store` を使用します。リクエスト、承認、取り消しは選択されたチャネルインスタンスとワークスペースにスコープされます。保留中のリクエストには型付きのユーザーまたはグループのサブジェクトが含まれます。グループリクエストはリクエストを開始した送信者も保持します。承認スナップショットには `senderIds` と `groupIds` が含まれます。許可リストは表示名を保持しないためです。不明なユーザーまたはグループの取り消しは `404 channel_pairing_approval_not_found` を返します。

### チャネル配信と Notify

`channel_delivery` は即時のベストエフォート配信サポートをアドバタイズします。これはプロトコルケイパビリティであり、ワーカーのヘルスシグナルではありません。配信は、欠落したワーカーの起動、別のワークスペースへのフォールバック、リトライ、アウトボックスの永続化、または過去の通知のリプレイを絶対に行いません。

ダイレクト Notify は Agent と Session をバイパスし、1 回の送信試行を待ちます。

```http
POST /workspace/notify
POST /workspaces/:workspace/notify
Authorization: Bearer <token>
Content-Type: application/json

{
  "text": "service unavailable",
  "delivery": {
    "kind": "channel",
    "target": {
      "channelName": "dingtalk",
      "type": "user",
      "id": "platform-user-id"
    }
  }
}
```

両方のルートは厳格な変更ゲートを使用します。修飾ルートは登録済みの信頼されたワークスペースのみを解決します。成功は `200 {delivered:true,deliveryId}` です。`delivered:true` はチャネルの送信 Promise が解決されたことを意味します。プロバイダーの受け入れ、ユーザーの受信、または開封証明を保証するものではありません。プロバイダー固有のレスポンス検証と IM アダプター間の一貫したエラー理由セマンティクスは、この V1 契約の範囲外です。
エラーは `400 channel_delivery_invalid`、`503 channel_worker_unavailable` または `channel_delivery_queue_full`、`504 channel_delivery_timeout`、および `502 channel_delivery_rejected` または `channel_delivery_failed` です。タイムアウトは結果不明であり、リトライされません。
接続テスト用の独立エンドポイントは意図的に存在しません。通常の Notify 呼び出しがエンドツーエンドテストになります。

リプレイ可能な結果イベントには相関情報とサニタイズされたステータスのみが含まれます。

```json
{
  "type": "channel_delivery_result",
  "promptId": "prompt-1",
  "data": {
    "sessionId": "session-1",
    "deliveryId": "prompt-1",
    "source": "prompt",
    "status": "failed",
    "promptId": "prompt-1",
    "code": "channel_worker_unavailable",
    "error": "Channel worker is not running."
  }
}
```

空の成功時の Prompt 完了はエラーフィールドを省略します。

```json
{
  "type": "channel_delivery_result",
  "promptId": "prompt-1",
  "data": {
    "sessionId": "session-1",
    "deliveryId": "prompt-1",
    "source": "prompt",
    "status": "skipped",
    "promptId": "prompt-1"
  }
}
```

`source` は `prompt` または `scheduled` です。`status` は `delivered`、`failed`、または `skipped` です。`skipped` は、対象のターンが正常に完了したが、最後のツールを含まないアシスタントレスポンスブロックが空または空白のみのだったことを意味します。デーモンは配信認可を消費し、チャネルワーカーを解決せずにイベントを公開します。スケジュールされた相関には `taskId` と `firedAt` を使用します。イベントにはターゲット ID、メッセージテキスト、認証情報、または webhook シークレットが含まれることは決してありません。

セキュリティ: レスポンスにはベアラートークン、クライアント ID、完全な ACP 接続 ID、デバイスフローのユーザーコード、または検証 URL が含まれることは決してありません。両方の詳細レベルには、加算的な `daemon.runId`、`daemon.logMode`、および `daemon.logHealth` が含まれる場合があります。`summary` はデーモンログパスと損失の詳細を省略します。`full` には認証されたオペレーターに対して `logPath`、`logIssues`、`logDroppedRecords`、および `logDroppedBytes` が含まれる場合があります。劣化したファイルロギングは、通常のステータスロールアップにパスを含まない `daemon_log_degraded` 警告を追加します。

### `GET /capabilities`

```json
{
  "v": 1,
  "protocolVersions": {
    "current": "v1",
    "supported": ["v1"]
  },
  "mode": "http-bridge",
  "features": [
    "health",
    "daemon_status",
    "capabilities",
    "multi_workspace_sessions",
    "..."
  ],
  "limits": {
    "maxPendingPromptsPerSession": 5,
    "maxSessionsPerWorkspace": 32,
    "maxTotalSessions": 64,
    "sessionRestoreTimeoutMs": 60000
  },
  "modelServices": [],
  "workspaceCwd": "/canonical/path/to/primary-workspace",
  "workspaces": [
    {
      "id": "stable-workspace-id",
      "cwd": "/canonical/path/to/primary-workspace",
      "primary": true,
      "trusted": true
    },
    {
      "id": "stable-secondary-workspace-id",
      "cwd": "/canonical/path/to/secondary-workspace",
      "displayName": "Payments Production",
      "primary": false,
      "trusted": true
    }
  ]
}
```

安定した契約: `v` がインクリメントされた場合、フレームレイアウトが後方互換性のない方法で変更されています。

> **`protocolVersions`** はデーモンが話すことができる serve プロトコルバージョンを記述します。`current` はデーモンの推奨プロトコルバージョンであり、`supported` は互換性のあるセットです。特定のプロトコルを必要とするクライアントは `supported` を確認する必要があります。機能固有の UI は引き続き `features` でゲートする必要があります。v=1 への追加: 古い v=1 デーモンはこのフィールドを省略するため、古いビルドをターゲットにする SDK クライアントはこれをオプションとして扱う必要があります。

> **`modelServices` は Stage 1 では常に `[]` です。** エージェントは単一のデフォルトモデルサービスを使用し、それをネットワーク経由で列挙しません。Stage 2 では、登録されたモデルアダプターからこれが設定され、SDK クライアントがサービスピッカーを構築できるようになります。それまでは、このフィールドが空でないことに依存しないでください。

> **`workspaceCwd`** はデーモンのプライマリワークスペースの正規の絶対パスです。これを使用して `POST /session` で `cwd` を省略します（ルートはこのプライマリパスにフォールバックします）。また、古い単一ワークスペースクライアントの互換性を維持します。v=1 への追加: §02 以前の v=1 デーモンはこのフィールドを省略します。古いビルドをターゲットにするクライアントは、使用する前に null チェックを行う必要があります。

> **`workspaces[]`** は登録されたすべてのランタイムをリストします。新しい単一ワークスペースデーモンは、`multi_workspace_sessions` が存在しない場合でもプライマリランタイムを含めます。これにより、クライアントがワークスペース修飾ルートに必要な安定 ID をディスカバリできます。古いデーモンは配列を省略する場合があります。各エントリは `{ id, cwd, displayName?, primary, trusted, removable? }` です。`displayName` は表示のみであり、未設定の場合は省略されます。最初の/プライマリワークスペースは引き続き `workspaceCwd` によってミラーリングされます。新しいクライアントは、そのエントリの `cwd` を `POST /session` に渡すことで、プライマリでないランタイムを選択します。信頼されていないワークスペースは診断用にアドバタイズされますが、信頼が変更されるまで `403 untrusted_workspace` で新しいセッション作成を拒否します。`removable` はランタイムの削除をサポートするデーモンに存在し、プロセス動的または永続化から復元されたセカンダリランタイムに対してのみ true になります。

ワークスペース機能タグと `workspaces[]` は動的です。ワークスペースを追加するクライアントは、変更完了後に `/capabilities` を再取得しなければなりません。デーモンは以前レスポンスをキャッシュしたクライアントにケイパビリティの変更をブロードキャストしません。永続化の削除はアクティブなランタイムをアンロードしないため、そのランタイムは再起動まで引き続きアドバタイズされます。

### `POST /workspaces`

追加のワークスペースランタイムを登録します。パスは既存のアクセス可能な絶対ディレクトリでなければならず、他の登録済みワークスペースと重複またはネストしてはなりません。登録はクライアントが `persist: true` を送信しない限りプロセスローカルです。クライアントは永続化をリクエストする前に `persistent_workspace_registration` をプリフライトしなければなりません。`workspace_display_name` がアドバタイズされている場合、リクエストにはオプションの `displayName` も含めることができます。

```json
{
  "cwd": "/canonical/path/to/secondary-workspace",
  "persist": true,
  "displayName": "Payments Production"
}
```

新規作成されたランタイムは `201` を返します。すでにアクティブなセカンダリワークスペースを永続化に昇格させると `200` を返します。永続化の成功には `persisted: true` が含まれます。

```json
{
  "id": "stable-workspace-id",
  "cwd": "/canonical/path/to/secondary-workspace",
  "displayName": "Payments Production",
  "primary": false,
  "trusted": true,
  "persisted": true
}
```

`displayName` は前後の空白をトリムした後に 256 文字以下の文字列でなければなりません。空の結果は名前なしとして扱われ、内部 C0（`U+0000`〜`U+001F`）または DEL（`U+007F`）制御文字は拒否されます。JSON の `null` は作成値ではなく、`400 invalid_display_name` を返します。初期名を指定しない場合はフィールドを省略してください。表示名の重複は許可されます。プロセスローカルの登録に付加された名前は、そのデーモンプロセスの間のみ有効です。`persist: true` は永続化登録とともに保存され、再起動後に復元できます。すでに永続化されているワークスペースに対してリクエストを繰り返しても冪等であり、名前の変更は行われません。

エラーには `400 invalid_path` / `invalid_persist_flag` / `invalid_persist_target` / `invalid_display_name`、`409 workspace_exists` / `workspace_nested` / `workspace_limit_reached`、`500 workspace_registration_store_error` / `runtime_creation_failed`、および `501 persistence_not_available` / `not_implemented` が含まれます。

### `PATCH /workspaces/:workspace`

ワークスペース ID または URL エンコードされた絶対 cwd で選択されたアクティブなワークスペースリソースを更新します。このエンドポイントは現在、表示名メタデータのみをサポートします。

```json
{ "displayName": "Payments Production" }
```

名前をクリアするには `{ "displayName": null }` を送信します。ここでの `null` は更新専用の削除センチネルです。null 以外の値は `POST /workspaces` と同じ文字列正規化ルールに従います。レスポンスは更新された `{ id, cwd, displayName?, primary, trusted, removable? }` ワークスペースプロジェクションです。ランタイムメタデータは常に更新されます。ランタイムに一致する永続化登録 ID がある場合、すべてのエイリアスが既存の schema-v1 登録ストアを通じてアトミックに更新されます。このエンドポイントが永続化登録を作成または昇格させることは決してありません。

サポートされていないフィールドは黙って無視されるのではなく、fail closed（失敗時は拒否）されます。エラーには `400 empty_patch` / `invalid_display_name` / `unsupported_field` / `workspace_mismatch`、`409 workspace_registration_in_progress`、`500 workspace_registration_store_error`、および `503 daemon_shutting_down` が含まれます。

### `DELETE /workspaces/:workspace`

削除可能なセカンダリランタイムを 1 つ削除します。セレクターは複数形ワークスペースルーティングルールに従い、ワークスペース ID または URL エンコードされた絶対 cwd のいずれかを受け付けます。オプションの JSON ボディは `{ "force": boolean }` です。省略すると非強制削除をリクエストします。

非強制削除は、フリーズされたランタイムにセッション、プロンプト、保留中の開始、ACP 接続、メモリタスク、またはワークスペースチャネルワーカーがある場合、`activity` スナップショットと共に `409 workspace_busy` を返します。`{ "force": true }` を送信すると、それらのリソースの終了をリクエストします。永続化の削除がコミットポイントです。後続のクリーンアップは有界でベストエフォートであり、クリーンアップの失敗はログに記録され、論理的な削除はランタイムを復元せずに収束します。成功レスポンスは以下の通りです。

```json
{
  "removed": true,
  "workspaceId": "stable-workspace-id",
  "workspaceCwd": "/canonical/path/to/secondary-workspace",
  "forced": true,
  "persistedRegistrationRemoved": true,
  "activity": {
    "sessions": 2,
    "activePrompts": 1,
    "pendingSessionStarts": 0,
    "acpConnections": 1,
    "memoryTasks": 0,
    "channelWorkers": 0,
    "voiceSessions": 0
  }
}
```

即座にビジーな非強制リクエストは、高速なプレドレイン activity スナップショットを返します。drain が開始されると、ビジーまたは成功のレスポンスには、受け入れと ACP drain ゲートが閉じた後、クリーンアップ開始前に取得された最終スナップショットが含まれます。エラーには `400 invalid_force_flag` / `workspace_mismatch`、`409 workspace_busy` / `primary_workspace_removal_forbidden` / `static_workspace_removal_forbidden` / `workspace_removal_in_progress` / `workspace_registration_in_progress`、`500 workspace_persist_failed` / `workspace_runtime_removal_failed`、`501 workspace_runtime_removal_unsupported`、および `503 daemon_shutting_down` が含まれます。

### `GET /workspace-registrations`

このプライマリワークスペースの永続化された希望ワークスペースセットをリストします。現在の起動中に保存されたディレクトリを復元できなかった場合、エントリは `active: false` で表示されたままになります。
ランタイムが drain 中の間もエントリは `active: true` のままです。削除が完了するまでランタイムがライブリソースを所有し続けるためです。
エントリには、永続化登録に表示名がある場合、オプションの `displayName` が含まれます。

```json
{
  "schemaVersion": 1,
  "primaryWorkspace": "/canonical/path/to/primary-workspace",
  "entries": [
    {
      "id": "stable-registration-id",
      "cwd": "/canonical/path/to/secondary-workspace",
      "displayName": "Payments Production",
      "active": true,
      "persisted": true
    }
  ]
}
```

登録ストアが設定されていない場合は `501 persistence_not_available` を返し、ストアを読み取れない場合は `500 workspace_registration_store_error` を返します。

### `DELETE /workspace-registrations/:id`

永続化された登録を 1 つ削除します。これはアクティブなランタイムをアンロードしたり、そのセッションを終了したりしません。`restartRequired: true` は、アクティブなランタイムが次回のデーモン再起動時に消えることを意味します。

```json
{ "removed": true, "active": true, "restartRequired": true }
```

`404 workspace_registration_not_found`、`500 workspace_registration_store_error`、または `501 persistence_not_available` を返します。他の変更ルートと同様に、このエンドポイントはデーモン認証が有効な場合に変更認証を必要とします。

### 読み取り専用ランタイムステータスルート

これらのルートはデーモン側のランタイムスナップショットを報告します。これらは追加の v1 ルートであり、状態を変更せず、serve プロトコルバージョンも変更しません。ワークスペースステータスルートは、クライアントが GET ルートをポーリングしたからといって、意図的に ACP 子プロセスを起動**しません**。デーモンがアイドル状態の場合、空のスナップショットで `initialized: false` を返します。セッションステータスルートはライブセッションを必要とし、不明な ID には `404 { code: "session_not_found", ... }` を返します。

ケイパビリティタグ:

- `workspace_mcp` → `GET /workspace/mcp`
- `workspace_skills` → `GET /workspace/skills`
- `workspace_providers` → `GET /workspace/providers`
- `workspace_acp_status` → `GET /workspace/acp/status`
- `workspace_env` → `GET /workspace/env`
- `workspace_preflight` → `GET /workspace/preflight`
- `session_context` → `GET /session/:id/context`
- `session_supported_commands` → `GET /session/:id/supported-commands`
- `session_tasks` → `GET /session/:id/tasks`
- `session_monitor_tool_correlation` → `GET /session/:id/tasks` からのモニターエントリにトランスクリプトとタスクの相関用の `toolUseId` が含まれます
- `session_status` → `GET /session/:id/status`
- `session_info` → `GET /workspace/:id/session-info` および `GET /workspaces/:workspace/session-info`
- `session_transcript` → `GET /session/:id/transcript`
- `workspace_persisted_transcript` → `GET /workspaces/:workspace/session/:id/transcript`
- `workspace_session_export` → `GET /workspaces/:workspace/session/:id/export`
- `workspace_archived_session_export` → `GET /workspaces/:workspace/session/:id/archive/export`
- `workspace_session_live_state` → `GET /workspaces/:workspace/sessions/live-state`
- `workspace_qualified_memory` → `POST /workspaces/:workspace/memory/{remember,forget,dream}` および `GET /workspaces/:workspace/memory/{remember,forget,dream}/:taskId`

`workspace_acp_status` はプライマリワークスペースの ACP チャネルのポイントインタイム liveness を `{ channelLive: boolean }` として報告します。ハンドラーはチャネルを作成しませんが、ランタイムルートに到達すると最初に遅延デーモンランタイムを開始する場合があります。その設定された起動ポリシーが独立して ACP をプリヒートする場合があります。スナップショットはリースではありません。クライアントは Session 作成にチャネルの再検証または開始を任せなければなりません。

### ACP プリヒート

ケイパビリティタグ: `workspace_acp_preheat`。

`POST /workspace/acp/preheat?timeoutMs=N` はプライマリワークスペースの ACP チャネルをベストエフォートで初期化します。`timeoutMs` のデフォルトは 5000 で、60000 以下の正の整数でなければなりません。同時呼び出し元と Session 作成は同じブリッジ初期化を共有します。リクエストのタイムアウトはその HTTP 待機のみを終了します。共有初期化をキャンセルするものではありません。

```ts
interface WorkspaceAcpPreheatResult {
  ready: boolean;
  channelLive: boolean;
  durationMs: number;
  reason?: 'timeout' | 'error';
  error?: string;
}
```

`ready` は常に `channelLive` と等しくなります。ライブレスポンスは `reason` と `error` を省略します。それ以外の場合、`reason` は `timeout` または `error` です。`durationMs` は現在の HTTP 呼び出しを測定します。呼び出しが参加した初期化の全ライフタイムではありません。運用上のタイムアウトまたは失敗は HTTP 200 を返します。無効な `timeoutMs` は 400 を返します。認証、レート制限、および遅延ランタイムの失敗は通常のレスポンスを保持します。

両方の ACP ワークスペースルートは単数形であり、プライマリワークスペース専用です。クライアントはセカンダリワークスペースにこれらを使用してはならず、いずれのレスポンスも永続的な準備保証として解釈してはなりません。

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
  | 'restore_timeout'
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

`errorKind` は `/workspace/preflight`、`/workspace/env`、および（将来的には）MCP guardrails で共有される closed enum であり、SDK クライアントがフリーフォームのメッセージを解析する代わりにカテゴリごとに修復（remediation）をレンダリングできるようにします。元の 7 つのステータスリテラルは #4175 から来ています。`restore_timeout` はセッション復元リクエスト用に別途追加されました。`blocked_egress` は egress プローブが実装されるまで予約されたままです。

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

**MCP クライアント guardrails (issue [#4175](https://github.com/QwenLM/qwen-code/issues/4175))。** 現在のデーモンは、4 つの追加フィールドとケイパビリティスコープの予算セルを使用してペイロードを拡張します。

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
      "scope": "workspace",
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

`budgetMode` は `enforce`、`warn`、または `off` のいずれかです。budget が設定されていない場合、`clientBudget` は存在しません。`budgets[]` は `mcp_guardrails` をアドバタイズするデーモンでは**常に配列**です（`budgetMode === 'off'` の場合は空になる可能性があります）。古いデーモンはフィールド全体を省略します。`mcp_workspace_pool` がアドバタイズされている場合、セルは `scope: 'workspace'` を持ち、選択されたワークスペースランタイムの共有プールをカバーします。そのタグがない場合（`QWEN_SERVE_NO_MCP_POOL=1` の下でも）、レガシーマネージャーは `scope: 'session'` を出力します。コンシューマーは追加の認識されないスコープ値を許容**しなければなりません**。

サーバーごとのセルの `disabledReason` は、オペレーターによって無効化されたもの（`'config'` — `disabledMcpServers` 設定リスト）と budget によって拒否されたもの（`'budget'` — 検出されたが `enforce` モードのために接続されなかったもの）を区別します。拒否は `Object.entries(mcpServers)` の宣言順序によって決定的になります。サーバーごとの `status: 'error', errorKind: 'budget_exhausted'` は、生の `mcpStatus: 'disconnected'`（これは真実ですが、オペレーターが直面する重大度ではありません）を覆います。

budget の強制はケイパビリティ駆動です。`mcp_workspace_pool` があると、1 つのワークスペースランタイム内のセッションがトランスポートと 1 つの `WorkspaceMcpBudget` を共有します。異なるワークスペースランタイムがプールや budget を共有することは決してありません。そのタグがない場合、各 ACP セッションの `McpClientManager` が独自のキャップのコピーを強制し、スナップショットはそのレガシーセッションビューを表します。

**budget 逼迫の検出。** 2 つの surface があり、両方とも PR 14b 以降に設定されます。

- **Push イベント**（`mcp_guardrail_events` 経由でアドバタイズ）: `GET /session/:id/events` をサブスクライブし、`KnownDaemonEvent` を介して `mcp_budget_warning` / `mcp_child_refused_batch` フレームを絞り込みます。ステートマシンは 75% を超える crossing ごとに 1 回発火し（37.5% を下回った後に再武装されます）。`enforce` モードでは、拒否は discovery パスごとに 1 回に統合されます。
- **スナップショットのポーリング**（`mcp_guardrails` 経由でアドバタイズ）: `GET /workspace/mcp` を実行し、budget セル（`budgets[0]`）を `mcp_workspace_pool` と共に調査してスコープを判断します。

- `budgets[0].status === 'warning'` ⇔ `liveCount >= 0.75 * clientBudget`（PR 14b の push イベントが使用するヒステリシス閾値と一致）。
- `budgets[0].status === 'error'` ⇔ `refusedCount > 0`（この discovery パスで 1 つ以上のサーバーが拒否された）。
- `budgets[0].status === 'ok'` ⇔ 75% の閾値を下回り、かつ拒否がない。

推奨されるポーリング頻度: すでに `/workspace/mcp` をポーリングしているものと同期させます。スナップショットは軽量であり、budget セルに追加の discovery コストはかかりません。push イベントをサブスクライブしている SDK クライアントでも、長時間の切断後の状態把握にスナップショットが役立ちます。

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
      "userInvocable": false,
      "installedPath": "/home/alice/project/.qwen/skills/review/SKILL.md",
      "argumentHint": "[path]"
    }
  ]
}
```

`level` は `project`、`user`、`extension`、または `bundled` のいずれかです。
`userInvocable`（ブール値、オプション）は通常の skill では省略され（`true` を意味します）、skill が手動で呼び出せない場合または skill API 経由で切り替えられない場合にのみ `false` として存在します。`modelInvocable` は独立しています。`false` は skill が手動では引き続き利用可能だが、モデル呼び出しからは隠されることを意味します。`installedPath` は skill の `SKILL.md` への既存の絶対パスです。デーモンはそれを保存されている通りに返し、シンボリックリンクを個別に解決したり正規化したりしません。現在のデーモンはすべての skill についてこれを出力します。クライアントは古い v1 デーモンからの欠落を許容しなければなりません。skill の本文、hook、`skillRoot`、およびその他の skill 設定は引き続き除外されます。discovery が成功した場合、`errors` は省略されます。

繰り返し読み取りは最後にコミットされたワークスペーススナップショットから提供され、子のインメモリキャッシュに対して定期的に再検証されます。読み取りは skill ディレクトリをスキャンしたり `SKILL.md` ファイルを再解析したりしません。子は拡張ソースが変更されていないことを確認します。拡張ディレクトリの 1 回の `readdir` と各エントリ、有効化ファイル、およびストアのアクティベーション状態ごとの `stat` です。それらが移動した場合にのみ更新されるため、デーモンの外部でインストールまたは切り替えられた拡張も次の読み取り時に検出されます。Safe モードと Bare モードは拡張の除外に合わせてチェックをスキップします。

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

デーモンプロセスの runtime、platform、sandbox、proxy、およびホワイトリスト化されたシークレット環境変数の**存在**を報告します。常に `process.*` の状態から応答します。デーモンはこのルートに応答するために ACP 子プロセスを生成することはなく、ACP が稼働中かアイドルかに関わらず応答は同一です。`acpChannelLive` フィールドは情報提供のみを目的としています。

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

デーモンの準備状況チェックを報告します。**デーモンレベルのセル**（`node_version`、`cli_entry`、`workspace_dir`、`ripgrep`、`git`、`npm`）は常に `process.*` と `node:fs` から設定されます。**ACP レベルのセル**（`auth`、`mcp_discovery`、`skills`、`providers`、`tool_registry`、`egress`）はライブ ACP 子を必要とします。デーモンがアイドル状態の場合、これらは `status: 'not_started'` のプレースホルダーを出力します。このルートはセルを設定するためだけに ACP を生成しません。対応するセルは `not_started` にフォールバックします。

アイドルレスポンス（ACP 子なし）:

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

- `missing_binary` — Node バージョンが要件を満たしていない、`QWEN_CLI_ENTRY` がない、ripgrep / git / npm が PATH にない（オプションのバイナリの場合はエラーではなく警告）。
- `missing_file` — `boundWorkspace` が存在しないかディレクトリではない、または skill の解析エラーで存在しないまたは読み取り不能なファイルを指している。
- `parse_error` — `SKILL.md` の解析失敗、不正な設定 JSON。
- `auth_env_error` — `validateAuthMethod` が null 以外の失敗文字列を返した、またはプロバイダー解決から伝播した `ModelConfigError` サブクラス。
- `init_timeout` — ブリッジでの `withTimeout` の reject（ACP ラウンドトリップ待機中の実際のタイムアウト）。`BridgeTimeoutError` 型付きクラスを通じて認識される。注意: `connecting > 0` を持つ一時的な `mcp_discovery` の `warning` セルはこの kind を持たない。それは実際のタイムアウトとは異なる、進行中の通常のハンドシェイク状態である。
- `restore_timeout` — セッションの load または resume が専用の復元バジェットを超過した。REST レスポンスは `504` であり、リトライ可能である。子プロセスの初期化および境界付きリプレイウィンドウの制限とは区別される。
- `protocol_error` — チャネルがリクエスト中に閉じられたため、またはツールレジストリが予期せず欠落していたため、ACP `extMethod` が拒否された。
- `blocked_egress` — PR 14 (#4175) 用に予約されている。PR 13 は `egress` セルを `status: 'not_started'` のままにする。

ブリッジが preflight リクエストの処理中に ACP 子プロセスに到達できない場合（例: リクエスト中のチャネルクローズ）、エンベロープの `errors` 配列には失敗を説明する単一の `ServeStatusCell` が含まれ、セルは `not_started` の ACP プレースホルダーにフォールバックする。Daemon レベルのセルは引き続き返される。

### ワークスペースファイルルート

すべてのファイルパスは daemon のプライマリワークスペースを通じて解決される。レスポンスはワークスペース相対パスを使用し、通常の成功ケースで絶対ファイルシステムパスを返すことはない。成功時のファイルレスポンスには以下が含まれる。

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

テキストファイルを読み取る。クエリパラメータ: `path`（必須）、`maxBytes`、`line`、`limit`、`cursor`。daemon はバイナリファイルを拒否する。256 KiB のフルスナップショット上限を超えるファイルには、少なくとも 1 つの明示的なウィンドウ引数（`line`、`limit`、`maxBytes`）が必要である。いずれもないリクエストは `file_too_large` のままとなる。このようなウィンドウはストリーミングされ、返される UTF-8 コンテンツは 256 KiB に抑えられる。`maxBytes` は常にデコード後の UTF-8 レスポンスバイトに適用され、ソースがフルスナップショット上限内で別のサポートされたエンコーディングを使用している場合も同様である。

行オフセットはファイルの先頭からスキャンして解決されるため、到達するために 8 MiB（`MAX_TEXT_SCAN_BYTES`）を超える読み取りが必要なウィンドウも `file_too_large` で拒否される。より深いオフセットに直接到達するには `GET /file/bytes` を使用すること。ルートがデコードできないエンコーディングの大きなテキストは `file_too_large` ではなく `binary_file` を返す。より小さいウィンドウで再試行しても助けにはならず、`readBytes` はバイナリにすでに適用されるのと同じ対処法である。

フルスナップショット上限内のファイルの場合、レスポンスには `hash` が含まれる。これは `line`、`limit`、`maxBytes` によってスライスが返された場合でも、ディスク上のファイル全体の生バイトに対する SHA-256 ダイジェストである。大きな部分ウィンドウは `hash` を省略し、完全な `sizeBytes` を保持し、`truncated: true` を設定し、ストリームが EOF より前に停止した場合は `originalLineCount: null` を返す。

##### `cursor` によるページング

`workspace_file_read_cursor` ケイパビリティを必要とする。返すコンテンツがまだあるレスポンスは `hasMore: true` を返し、ファイルバイトオフセットが導出可能な場合は `nextCursor` トークンを返す。これを `cursor` として返すと O(1) で再開される。一方、深い `line` オフセットはバイト 0 からのスキャンを必要とし、8 MiB を超えると拒否される。

```
GET /file?path=big.log&limit=500          → { content, nextCursor, hasMore: true }
GET /file?path=big.log&limit=500&cursor=… → 次のページ
```

`cursor` と `line` は相互排他である（`parse_error`）。両方とも開始点を指定する。不正または長すぎる cursor は `parse_error` である。ファイルが置換または切り詰められた cursor は `hash_mismatch`（409）である。追記しても既存の cursor は無効化されない。これがこの機能の存在理由である。

`content` は最終行の終端改行を省略する。他のすべての読み取りと同様である。そのため、ページを再構成するクライアントは `\n` で結合する。`hasMore` は `nextCursor` の言い換えではない。`limit` 付きで読み取られた小さな非 UTF-8 ファイルには、さらなるコンテンツがあるがバイトオフセットが導出できない場合があり、`hasMore: true` と `nextCursor: null` を報告する。バイト上限が現在の行を切り取った場合も cursor は null である。そのオフセットから再開すると部分的な行が返されるためである。多くの短い行の場合は、`limit` を下げてページがバイト上限より前に終了し、cursor を返すようにする。1 つの特大行の場合は、次の行を明示的にリクエストし（例: 行 1 から開始する場合は `line=2`）、その後 cursor で継続する。完全な特大行が必要な場合は `GET /file/bytes` を使用すること。

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

テキストファイルを作成または置換する。これは厳密な変更ルートであり、設定されたトークンなしのループバックでは `401 { "code": "token_required" }` を返す。`--require-auth` を指定すると、グローバルなベアラートークンミドルウェアがルートが実行される前に未認証リクエストを拒否する。

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
  "sessionId": "550e8400-e29b-41d4-a716-446655440000",
  "sessionScope": "thread"
}
```

| Field            | Required | Notes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ---------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `cwd`            | no       | 登録されたワークスペースのいずれかに一致する絶対パス。省略された場合、ルートはプライマリワークスペースにフォールバックする（`/capabilities.workspaceCwd` から読み取る）。一致しない空でない `cwd` は `400 workspace_mismatch` を返す。`features` に `multi_workspace_sessions` が含まれる場合、クライアントは信頼された `workspaces[].cwd` を渡すことができる。それ以外の場合、プライマリワークスペースのみが受け付けられる。ワークスペースパスは `realpathSync.native` 経由で正規化される（存在しないパスの場合は resolve-only のフォールバックを使用）ため、大文字と小文字を区別しないファイルシステムでスペルごとにセッションが拒否されることはない。 |
| `modelServiceId` | no       | エージェントがルーティングする構成済みの_モデルサービス_（バックエンドプロバイダー — Alibaba ModelStudio、OpenRouter など）を選択する。省略された場合、エージェントはデフォルトを使用する。ワークスペースにすでにセッションがある場合、これは既存のセッションで `setSessionModel` を呼び出し、`model_switched` をブロードキャストする。すでにバインドされたサービス**内**のモデルを選択する `POST /session/:id/model` の `modelId` とは異なる。`/capabilities` の `modelServices` 配列は構成済みサービスの公開用に予約されている。Stage 1 では常に `[]` である（エージェントのデフォルトサービスが使用され、HTTP 経由で列挙されない）。 |
| `sessionId`      | no       | 呼び出し元が選択する RFC 準拠の UUID v1-v5。daemon はそれを小文字に正規化し、常に新しいスレッドセッションを作成する。このフィールドを冪等的なアタッチとして扱うことはない。送信前に `caps.features` に `session_id_override` が含まれることを確認すること。古い daemon は未知のフィールドを無視する可能性があるためである。`null` は省略と同等である。 |
| `sessionScope`   | no       | セッション共有のリクエストごとのオーバーライド。`'single'`（daemon 全体のデフォルト）は、2 回目の同じワークスペースへの `POST /session` で既存のセッションを再利用する（`attached: true`）。`'thread'` は呼び出しごとに新しい個別のセッションを強制的に作成する。省略すると、daemon 全体のデフォルトを継承する。列挙外の値は `400 { code: 'invalid_session_scope' }` を返す。古い daemon（#4175 PR 5 より前）はこのフィールドをサイレントに無視する。送信前に pre-flight で `caps.features.session_scope_override` を確認すること。daemon 全体のデフォルトは現在の本番環境では `'single'` にハードコードされている。#4175 では、フォローアップで `--sessionScope` CLI フラグが追加される可能性がある。 |

レスポンス:

```json
{
  "sessionId": "<uuid>",
  "workspaceCwd": "/canonical/path",
  "attached": false
}
```

`attached: true` は、そのワークスペースのセッションがすでに存在し、現在それを共有していることを意味する。

呼び出し元指定の ID は、現在登録されているすべてのワークスペースランタイムと、drain 中の置換を含むすべてのまだ有効なブリッジ世代において一意である。ライブ、保留中、アクティブ、アーカイブ、またはワークツリーバックの重複は `409 session_id_conflict` を返す。無効な値は `400 invalid_session_id` を返す。利用できないライブオーナーまたは永続化状態のチェックは、リトライ可能な `503 session_id_admission_unavailable` を返す。ブリッジまたはストレージのヘルス変化後に境界付きバックオフでリトライすること。`retryable` は別の試行が安全であることを意味し、即時のリトライが成功することを意味しない。下流のエージェントが異なる ID を返した場合、daemon はその孤立セッションを削除し、`500 session_id_not_honored` を返す。曖昧なレスポンスの後には、create のリトライではなく既知の ID を load または resume すること。

独立した会話を必要とするマルチクライアント統合では、各 `POST /session` で `sessionScope: "thread"` を送信すること。デフォルトの `single` スコープは、クライアントが意図的に 1 つの共同セッションを共有する場合にのみ使用すること。共有セッションは 1 つの FIFO を通じてプロンプトを直列化し、`/daemon/status` 経由で `runtime.activity.pendingPrompts` および `runtime.activity.queuedPrompts` として確認できる。

同じワークスペースに対する並行する `POST /session` 呼び出しは 1 つの spawn に**統合（coalesced）** される。両方の呼び出し元は同じ `sessionId` を取得し、ちょうど 1 つだけが `attached: false` を報告する。基盤となる spawn が失敗した場合（初期化タイムアウト、エージェント出力の形式不正、OOM）、**統合されたすべての呼び出し元が同じエラーを受け取る**。実行中のスロットはクリアされるため、後続の呼び出しで最初から再試行できる。

> ⚠️ **新規セッションにおける `modelServiceId` の拒否は、HTTP レスポンスではサイレントに処理される。** 不正な `modelServiceId`（タイプミス、未設定のサービスなど）を指定しても、作成時に 500 エラーは返されない。セッションはエージェントのデフォルトモデルで動作し続けるため、呼び出し元は `sessionId` を取得でき、後でモデルの切り替えを再試行できる（`POST /session/:id/model` 経由）。目に見える失敗シグナルは、セッションの SSE ストリーム上で発生する `model_switch_failed` イベントであり、spawn ハンドシェイクと最初のサブスクライブの間に発行される。**このイベントを観測する必要があるサブスクライバーは、最初の `GET /session/:id/events` で `Last-Event-ID: 0` を渡す必要がある。** これにより、リング内で利用可能な最も古いイベントからリプレイされる（サブスクライブが作成レスポンスの数 ms 後に行われた場合でも、spawn 時の `model_switch_failed` をカバーできる）。

### ACP `session/new` 呼び出し元指定 ID

ACP クライアントは拡張メタデータフィールドを通じて同じ動作をリクエストする。

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "session/new",
  "params": {
    "cwd": "/absolute/path/to/workspace",
    "_meta": {
      "qwen-code/sessionId": "550E8400-E29B-41D4-A716-446655440000"
    }
  }
}
```

レスポンスには正規化された小文字の ID が含まれる。プライマリおよびワークスペース修飾 ACP マウントは、`session/load` および `session/resume` を含めて REST と受け入れを共有する。無効な ID は ACP `INVALID_PARAMS` を使用し、`data.httpStatus=400` と `data.errorKind="invalid_session_id"` を持つ。競合は `data.httpStatus=409` を使用する。利用できないライブオーナーまたは永続化状態のチェックは `data.httpStatus=503` と `data.retryable=true` を使用する。

プロンプトを受け取らなかった ACP 作成セッションは永続化されたトレースを残さず、daemon は所有接続がアタッチされたセッション 0 で閉じられたときにそれを回収する。その回収後、同じ ID を再度作成できる。これは接続ライフサイクルであり、ID の再利用ではない。接続（または任何のアタッチ）が有効な間、受け入れは重複を拒否する。

### `POST /session/:id/load`

永続化された ACP セッションを ID で復元し、その履歴を SSE 経由でリプレイする。パスの ID が優先される。ボディ内の `sessionId` フィールドは無視される。事前チェックとして `caps.features.session_load` が必要である。古い daemon ではこのルートに対して `404` を返す。

リクエスト:

```json
{
  "cwd": "/absolute/path/to/workspace"
}
```

| Field | Required | Notes                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ----- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `cwd` | no       | `POST /session` と同じ正規化および `workspace_mismatch` ルール。省略すると `/capabilities.workspaceCwd` を継承する。`features` に `multi_workspace_sessions` が含まれる場合、呼び出し元は信頼された登録済み `workspaces[].cwd` を渡すことができる。信頼されていない非プライマリワークスペースは `403 untrusted_workspace` を返す。`mcpServers` は意図的にここでは受け付けられない。デーモン全体の MCP は設定駆動である（`POST /session` と同じ）。 |

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

`state` は ACP の `LoadSessionResponse` を反映する。`models` は `SessionModelState`、`modes` は `SessionModeState`、`configOptions` は `SessionConfigOption` の配列である。欠落しているフィールドはエージェントによって決定される。後からアタッチするクライアント（以下の `attached: true` のパス）は、元の load 呼び出し元が確認したものと**同じ** `state` スナップショットを取得する。daemon はエントリ時にこれをキャッシュするため、実行時の変更（例: `model_switched`）は後続のアタッチレスポンスではなく SSE ストリーム上で配信される。

`attached: true` は、セッションがすでに稼働中だったことを意味する（以前の `session/load`/`session/resume` によるものか、統合された並行呼び出し元がわずかに先に実行されたため）。

**SSE 経由の履歴リプレイ。** エージェント側で `loadSession` が実行中の間、エージェントは永続化されたターンに対して `session_update` 通知を発行するか、レスポンスメタデータでバルクリプレイ更新を返す場合がある。daemon はルートレスポンスが返る前に、これらのイベントをセッションの境界付きリプレイスナップショットウィンドウにシードする。ライブセッションの場合、`POST /session/:id/load` はその境界付きウィンドウ（`compactedReplay`、`liveJournal`、`lastEventId`）のみを保証し、完全なトランスクリプトは保証しない。ウィンドウは `--compacted-replay-max-bytes`（デフォルト 4 MiB、最大 256 MiB）によってバイト上限が設定される。古いリプレイエントリが削除された場合、`compactedReplay[0]` は ID なしの `history_truncated` マーカーである。実行中の `liveJournal` は `--max-journal-events`（デフォルト 10,000 リプレイエントリ）と `--max-journal-bytes`（デフォルト 8 MiB のシリアライズされたソースイベント）によって別途上限が設定される。これらはセッションごとの**ベースライン**上限である。実行中のターンがこれらを超えた場合、daemon はまず適応的成長を試みる。そのセッションの上限を 2 倍に向けて引き上げる（セッションごとのハード上限 256 MiB まで、エントリは比例してスケールされ、残りのプールヘッドルームによって制限される）。ただし、すべてのライブセッションに付与される成長の合計が、デーモンの実効メモリバジェットの 5% でサイズのデーモン全体の成長プールに収まる必要がある。これは `--memory-budget-mb` が渡された場合はその値で、解決された利用可能メモリで上限設定され、それ以外の場合は自動検出メモリの 50% で、`1024` MB を上限とする。計算はデーモン全体で行われる。マルチワークスペースデーモンはワークスペースごとに 1 つのブリッジを実行し、すべてが単一のプールを共有する。成長はオンデマンドであり、プールが許す限りでのみ行われる。オペレーターが固定した `--max-journal-events` または `--max-journal-bytes` はこれを無効化する。実効バジェットが 1024 MB 最小値（`insufficientMemory`）を下回るホストも同様である。プールは 0 となり、適応的成長は完全に無効化される。連続する互換性のある `agent_message_chunk` または `agent_thought_chunk` ソースイベントは、エントリあたり最大 256 のソースイベントまでリプレイエントリを共有する。一方、ツール、帰属、出所、および個別メッセージの境界は保持される。ジャーナルがプールが許す成長後も（成長した可能性のある）上限を超えた場合 — ヘッドルームが全く付与されない場合や、付与が超過の一部のみの場合も含む — 最も古いエントリが丸ごと削除され（保持された末尾はバイト上限よりずっと小さくなる場合がある）、`scope: 'live_journal'` を持つ `history_truncated` マーカーが先頭に追加される。その `truncatedEvents` と `retainedEvents` フィールドはソースイベントをカウントし、リプレイエントリではない。また、`maxBytes` / `maxEvents` は適用中の上限を反映する（すでに成長している可能性がある）。クライアントはそのマーカーをステータスとしてレンダリングし、保持されたイベントの適用を続行すべきである。完全な永続化トランスクリプトアクセスは `GET /session/:id/transcript` 経由で別途公開される。

リプレイウィンドウのバイト上限は、子プロセスが永続化されたトランスクリプトを再構成した後に適用される。ディスク上の JSONL 読み取りを制限するものではない。デーモンバジェットを超過する復元は `504` を返し、`Retry-After` は復元バジェットから導出される（5-120 秒にクランプされる）。ボディは `{code: "session_restore_timeout", errorKind: "restore_timeout", retryable: true, sessionId, action, timeoutMs}` である。デーモンは実行中の ACP リクエストをフェンスし、遅れて到着したセッションは登録せずにクリーンアップする。同じ ID へのリトライは、そのクリーンアップが確定するまで、`reason: "awaiting_abandoned_cleanup"` と復元バジェットから導出される `Retry-After`（5-120 秒にクランプ）を持つ `409 restore_in_progress` を返す。遅延クリーンアップが不確実な場合、または放棄された復元がデッドライン後に 1 フル復元バジェットを経過してもまだ確定していない場合、そのワークスペース上の新しいセッションは `reason: "restore_cleanup_failed"` または `"restore_settlement_overdue"` を持つ `503 acp_channel_unavailable` を返す。すでにライブのセッションはチャネルが drain している間も使用可能である。

**エラー:**

- `404` — 永続化されたセッション ID が存在しない（`SessionNotFoundError`）。
- `400` — `workspace_mismatch`（`POST /session` と同じ形状）。
- `403` — `cwd` が信頼されていない非プライマリワークスペースを指定している場合の `untrusted_workspace`。
- `503` — `session_limit_exceeded`（`--max-sessions` の制限にカウントされる。実行中の復元も考慮される）。
- `504` — `session_restore_timeout`。リトライ可能。`Retry-After` は復元バジェットから導出される（5-120 秒にクランプ）。同じセッション ID は遅延クリーンアップが確定するまでフェンスされたままになるため。
- `503` — ワークスペースチャネルが新しいセッションワークに対して閉じられている場合の `acp_channel_unavailable`。`reason` が理由を示す: 放棄された復元のクリーンアップが決定的に完了できなかった場合は `restore_cleanup_failed`、放棄された復元がデッドライン後に 1 フル復元バジェットを経過してもまだ確定していない場合は `restore_settlement_overdue`。どちらの場合も既存のセッションは利用可能であり、新しいセッションワークはワークスペースチャネルの drain 後にリトライできる。ボディは `retryAfterSeconds` を持ち、ヘッダーは一致するバジェット導出の `Retry-After` を持つ。これは隔離期間がフェンスより長く存続し、新しい ID はヒントを持つ 409 を決して見ないためである。
- `409` — `restore_in_progress`（同じ ID に対する `session/resume` がすでに実行中、または新しい spawn が復元の所有する ID を指定した）。復元がアクティブな間は `Retry-After: 5`。`awaiting_abandoned_cleanup` としてフェンスされた後はバジェット導出のヒント。同じアクションの競合（同じ ID に対する 2 つの並行する `session/load`）は統合される。ちょうど 1 つが `attached: false` を返し、残りは同じ `state` で `attached: true` を返す。
- `409` — `session_workspace_conflict`。同じセッション ID がすでに別のワークスペースランタイムでライブまたは復元中の場合。
- `409` — `session_archived`。ID が `chats/archive/` にのみ存在する場合。`load` または `resume` の前に `POST /sessions/unarchive` を呼び出すこと。
- `409` — `session_archiving`。同じ ID に対してアーカイブまたはアーカイブ解除が実行中の場合。`Retry-After: 5`。
- `409` — `session_conflict`。ID が `chats/` と `chats/archive/` の両方に存在する場合。ロードする前に `POST /sessions/delete` でセッションを削除すること。

### `GET /session/:id/transcript`

アクティブな永続化 JSONL トランスクリプトから再構成された、ID なし `session_update` リプレイフレームの 1 ページを返す。事前チェックとして `caps.features.session_transcript` が必要。古いデーモンではこのルートに対して `404` を返す。

クエリパラメータ:

| Field    | Required | Notes                                                                                                                                                                                                                                                                                                                                                    |
| -------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `cursor` | no       | 前のページによって返された不透明な base64url カーソル。最初のページでは省略する。カーソルはデーモン発行で改ざんチェックされる。変更すると `400 invalid_transcript_cursor` を返す。トランスクリプトファイルの ID と凍結された最初のページのバイトサイズにバインドされる。ファイルの削除、切り詰め、置換、またはアーカイブは無効化され、`409` を返す。 |
| `limit`  | no       | ページに含めるアクティブな `ChatRecord` の数。デフォルトは `100`、最大 `500`。1 つのレコードが複数のリプレイフレームを生成する可能性があるため、`events.length` は `limit` より大きくなる場合がある。無効な値は `400 invalid_transcript_limit` を返す。                                                                                                             |

レスポンス:

```json
{
  "v": 1,
  "sessionId": "persisted-1",
  "events": [
    {
      "v": 1,
      "type": "session_update",
      "data": {
        "sessionUpdate": "user_message_chunk",
        "content": { "type": "text", "text": "..." }
      }
    }
  ],
  "nextCursor": "opaque",
  "hasMore": true,
  "startTime": "2026-07-08T00:00:00.000Z",
  "lastUpdated": "2026-07-08T00:01:00.000Z"
}
```

`events` はリプレイフレームのみである: `{ v: 1, type: "session_update", data: SessionUpdate }`。EventBus ID は含まれず、レスポンスに `lastEventId` が含まれることはない。このルートを呼び出しても、`/load` の呼び出し、クライアントのアタッチ、ライブ EventBus のシード、ライブセッションの作成、または現在のライブリプレイウィンドウの変更は行われない。ライブおよび非アクティブなアクティブセッションの両方が、子プロセス側の読み取り専用ステータスメソッドによって再構成されるため、リプレイは同じワークスペース設定、ランタイム出力ディレクトリ、エミッター、および `/load` の履歴セマンティクスを使用し、デーモンセッション状態を変更することはない。

最初のページは現在の JSONL スナップショットサイズを凍結する。以降のページはそのバイトプレフィックスのみを読み取るため、ページ 1 以降の追記は結果セットを変更しない。ファイルが消失した場合、凍結サイズ以下に切り詰められた場合、異なる inode で置換された場合、またはアーカイブに移動された場合、次のページは `409` を返し、クライアントはページ 1 から再開するか、ユーザーにトランスクリプトを再度開くよう依頼すべきである。

デーモンのメモリとレイテンシを保護するため、トランスクリプトインデックス上限を超えるスナップショットは、デーモンが JSONL をスキャンする前に失敗する。クライアントは `413 transcript_too_large` を受け取り、エクスポート/オフライン処理にフォールバックするか、ユーザーに古い履歴の短縮/アーカイブを依頼すべきである。

`partial: true` と `replayError` は、一部のフレームを生成した後にリプレイ変換が失敗した場合に出現する可能性がある。部分レスポンスには `nextCursor` が決して含まれないため、クライアントは変換されなかったレコードをサイレントにページネーションで通過することはない。

**エラー:**

- `400` — 無効な `limit`、`cursor`、またはセッション ID の形状。
- `404` — 最初のページリクエスト時にアクティブな永続化セッション ID が存在しない。
- `409` — `/load` と同じ loadability チェックによる `session_archived`、`session_archiving`、または `session_conflict`。
- `409` — カーソル発行後にファイルが削除、切り詰め、置換、またはアーカイブされたため、トランスクリプトスナップショットが利用できない。これは、preflight がカーソルリクエストのアクティブファイルを見つけられなくなった場合にも適用される。
- `413` — 凍結されたトランスクリプトスナップショットがデーモンインデックス上限を超える場合の `transcript_too_large`。
- `413` — 1 つの集約レコードがワークスペース修飾ページバジェットを超える場合、またはシリアライズされたページがレスポンスバジェットを超える場合の `transcript_page_too_large`。

### `GET /workspaces/:workspace/session/:id/transcript`

選択された登録済みワークスペースのアクティブな永続化 JSONL から、単数ルートと同じ `DaemonSessionTranscriptPage` プロジェクションを返す。事前チェックとして `workspace_persisted_transcript` が必要。このケイパビリティは `multi_workspace_sessions` とは独立しており、ID または cwd で選択された信頼された単一ワークスペースのプライマリに対して機能する。

セレクターとクエリパラメータは、既存の複数ワークスペースおよびトランスクリプトルールのパターンに従う。信頼されたプライマリおよびセカンダリランタイムと、信頼されていないセカンダリランタイムが読み取り可能である。信頼されていないプライマリは `403 untrusted_workspace` を返す。アーカイブされたコンテンツは返されない。

このワークスペース修飾ルートでは、`limit` は最大レコード数である。ページは 4 MiB の永続化ソースバジェットで早く停止し、継続カーソルを返す場合がある。シリアライズされたレスポンスは 32 MiB に、カーソルは 64 KiB に上限設定される。リプレイ状態がカーソル上限を超える場合、ページは正常に変換されたイベントを `partial: true`、`hasMore: false`、および `nextCursor` なしで返す。

レガシーの単数ルートと異なり、このパスはデーモンプロセス内で完全に実装される。ワークスペースブリッジの呼び出し、ACP の開始、設定の読み込み、プロジェクト定義エージェントまたは skill の解析、または `session-transcript-cursor-key` の作成/修復は行わない。ツールフレームは、ランタイムツールレジストリを参照せずに、永続化されたツール名と説明を使用する。HMAC カーソルキーはデーモンメモリ内にのみ存在し、ワークスペースごとに分離され、再起動時にローテーションされる。前のデーモンプロセスのカーソルは `400 invalid_transcript_cursor` を返す。

### `GET /workspaces/:workspace/session/:id/export`

選択された登録済みワークスペースのアクティブな永続セッションを添付ファイルとしてエクスポートする。事前チェックとして `workspace_session_export` が必要。`session_export` または `workspace_qualified_rest_core` からサポートを推測してはならない。セレクターはまず正確なワークスペース ID として解決され、次に正規化後の URL エンコードされた絶対 cwd として解決される。プライマリおよびセカンダリランタイムの両方が信頼されている必要がある。信頼されていないランタイムは、セッションまたはフォーマットの検証前に `403 untrusted_workspace` を返す。

オプションの `format` クエリは `html`（デフォルト）、`md`、`json`、または `jsonl` である。ボディ、MIME タイプ、ファイル名のサニタイズ、`Cache-Control: no-store`、`X-Content-Type-Options: nosniff`、および添付ファイル disposition は `GET /session/:id/export` と同じである。レガシールートはプライマリストレージにバインドされたままである。

複数ルートは、既存の共有アーカイブコーディネーターの下で、選択されたワークスペースのアクティブな永続化 JSONL のみを読み取る。他のワークスペースストアのスキャン、プライマリへのフォールバック、ライブオーナーの解決、ワークスペースブリッジの呼び出し、ACP の開始、クライアントのアタッチ、または設定の読み込みは行わない。別のワークスペースにのみ存在するセッション ID は `404 { code: "session_not_found" }` を返す。アーカイブされたセッションは `409 session_archived` を返す。無効なフォーマットは `400 invalid_export_format` を返し、ストレージの競合は既存の `session_archiving` および `session_conflict` エラーを保持する。

### `GET /workspaces/:workspace/session/:id/archive/export`

選択された登録済みワークスペースのアーカイブされた永続化セッションを添付ファイルとしてエクスポートする。事前チェックとして `workspace_archived_session_export` が必要。アクティブエクスポートまたは複数のコアケイパビリティからサポートを推測することはできない。ワークスペースセレクターの解決と信頼チェックは、セッション ID およびフォーマットの検証前に実行される。

TypeScript SDK の呼び出し元は `WorkspaceDaemonClient.exportArchivedSession(sessionId, options)` を使用する。このメソッドは常にネイティブ REST を使用し、既存の `DaemonSessionExportResult` 添付ファイルプロジェクションを返す。

オプションの `format` クエリ、レスポンスボディ、MIME タイプ、サニタイズされたファイル名、キャッシュポリシー、セキュリティヘッダー、および添付ファイル disposition は、アクティブなワークスペースエクスポートと同じである。アーカイブされたソース JSONL は再構築前に 256 MiB に上限設定される。より大きなファイルは `sessionId`、`snapshotSize`、および `maxBytes` を持つ `413 transcript_too_large` を返す。アクティブエクスポートは既存のサイズ動作を保持する。

このルートは、共有アーカイブコーディネーターのリースの下で、選択された信頼されたワークスペース内の `chats/archive/<id>.jsonl` のみを読み取る。フォールバックのためにアクティブコンテンツを検査したり、別のワークスペースをスキャンしたり、ライブオーナーを解決したり、ブリッジを呼び出したり、ACP を開始したり、クライアントをアタッチしたり、設定を読み込んだりすることはない。アクティブのみの ID は `409 { code: "session_not_archived" }` を返す。欠落した ID は `404 { code: "session_not_found" }` を返す。同時のアクティブおよびアーカイブファイルは `409 session_conflict` を返す。アーカイブ遷移は `Retry-After: 5` を持つ `409 session_archiving` を返す。

### `POST /session/:id/resume`

永続化された ACP セッションを ID で復元するが、SSE 経由で履歴をリプレイ**しない**。モデルコンテキストはエージェント側で内部的に復元される（`config.getResumedSessionData` を読み込む `geminiClient.initialize` 経由）。SSE ストリームは、すでに履歴がレンダリングされているクライアントのためにクリーンな状態に保たれる。事前チェックとして `caps.features.session_resume` が必要。`unstable_session_resume` は、古いクライアントのための非推奨の互換エイリアスとして残っている。

リクエストの形状は `/load` と同じ。レスポンスの形状も同じで、`state` は ACP の `ResumeSessionResponse` を反映する。エラーエンベロープも同じであり、`409 restore_in_progress`（`session/load` が実行中の場合に発生する。別の `session/resume` に競合する `session/resume` は統合される）も含まれる。

クライアントに履歴がレンダリングされていない場合（コールド再接続、ピッカー → 開く）は `/load` を使用すること。クライアントがすでにターンを画面に表示しており、デーモン側のハンドルを取り戻すだけの場合は `/resume` を使用すること。

> ⚠️ **なぜ `unstable_session_resume` がまだ公開されているのか？** デーモンの HTTP ルートと `session_resume` ケイパビリティは v1 で安定化しているが、ブリッジはまだ ACP の `connection.unstable_resumeSession` を呼び出している。古いタグは、`session_resume` より前にリリースされた SDK が引き続き動作するようにするためだけに残されている。

### `GET /workspace/:id/session-info` および `GET /workspaces/:workspace/session-info`

ページネーションされたセッション一覧パスを変更せずに、選択されたワークスペースの集計永続化セッション数を返す。

```json
{
  "active": 450,
  "archived": 30,
  "total": 480,
  "live": 2,
  "expensive": true,
  "cost": "disk_scan"
}
```

`active`、`archived`、`total` はローカルの JSONL セッションをカウントする。`live` は一致するインメモリブリッジの数であり、登録された信頼されていないセカンダリワークスペースでは省略される。その永続化のみの読み取りではライブ状態をクエリしてはならないためである。`expensive` は常に `true` で、`cost` は常に `"disk_scan"` である。クライアントはこのエンドポイントを頻繁に呼び出さず、ポーリングしてはならない。スキャンが安全制限に達した場合、またはすべての候補ファイルを分類できなかった場合、レスポンスは `"truncated": true` を追加し、永続化カウントは下限となる。ストレージが欠落している場合は永続化カウントはゼロを返す。複数ルートは、複数セッションカタログと同じワークスペースセレクターと信頼ポリシーを使用する。信頼されていないプライマリは `403 untrusted_workspace` を返す。

TypeScript デーモン SDK は、`workspaceById(...)` または `workspaceByCwd(...)` に続けて `getWorkspaceSessionInfo()` を通じて複数ルートを公開する。

### `GET /workspace/:id/sessions` および `GET /workspaces/:workspace/sessions`

正規化されたワークスペースが `:id` または `:workspace` に一致するセッションを一覧表示する。パスパラメータはまず正確なワークスペース ID として解決され、次に URL エンコードされた絶対 cwd として解決される。プライマリワークスペースには既存の永続化/ライブのマージが含まれる。デフォルトの一覧は `chats/` からのアクティブセッションである。`archiveState=archived` を渡すと `chats/archive/` からアーカイブされたセッションを一覧表示できる。信頼された非プライマリワークスペースには、独自の `chats/` ストアからのアクティブな永続化セッションが含まれ、一致するライブサマリーが重複なくマージされる。アクティブな永続化セッションが存在しない場合、ルートは以前のライブのみのカーソル動作を保持する。信頼された非プライマリワークスペースは `archiveState=archived`、組織化された `view=organized` 一覧、および `group` フィルターもサポートし、独自の `chats/`、`chats/archive/`、およびセッション組織ストアから読み取る。`view=organized&archiveState=archived` の組み合わせクエリは、ライブマージなしでアーカイブされたセッションのみを返す。登録された信頼されていない非プライマリワークスペースは、同じ一覧、フィルター、およびページネーション形状をサポートするが、永続化エントリのみを返す。デーモンはライブブリッジをクエリせず、ランタイムからの保留中のインタラクション、ターンエラー、またはクライアント状態を設定しない。`clientCount: 0` や `hasActivePrompt: false` などの永続化デフォルトは、ワイヤー互換性のために残される。ストレージが欠落している場合は空の一覧を返す。複数ルートは信頼されていないプライマリに対して `403 { code: "untrusted_workspace" }` を返す。レガシープライマリルートは既存の互換性動作を保持する。`archiveState=all` は v1 ではサポートされていない。プライマリおよび永続化バックの一覧は既存の数値 `cursor` セマンティクスを保持する。永続化なしの信頼された非プライマリのライブフォールバックは、既存の不透明ライブカーソルを保持する。

```bash
curl http://127.0.0.1:4170/workspace/$(jq -rn --arg c "$PWD" '$c|@uri')/sessions
curl http://127.0.0.1:4170/workspace/$(jq -rn --arg c "$PWD" '$c|@uri')/sessions?archiveState=archived
curl http://127.0.0.1:4170/workspaces/<workspace-id>/sessions
```

`workspace_qualified_rest_core` がアドバタイズされている場合、ワークスペーススコープのセッションバッチ操作、グループ CRUD、およびセッション組織の変更は、`/workspaces/:workspace/sessions/{delete,archive,unarchive}`、`/workspaces/:workspace/session-groups`、および `/workspaces/:workspace/session/:id/organization` で利用可能である。信頼されていないセカンダリの場合、グループ GET は引き続き利用可能である。すべてのグループ、セッション、および組織の変更は信頼ゲートされたままである。ワークスペースなしのバッチおよび組織の変更ルートは、互換性のためにプライマリワークスペースのみに残る。

クエリパラメータ:

| Field          | Required | Notes                                                                                                                                                                                           |
| -------------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `archiveState` | no       | `active`（デフォルト）または `archived`。他の値を指定すると `400 { code: "invalid_archive_state" }` が返される。                                                                                              |
| `cursor`       | no       | 前のレスポンスからのページネーションカーソル。                                                                                                                                                   |
| `size`         | no       | ページサイズ。無効な値を指定すると `400 { code: "invalid_cursor" }` または既存のページサイズバリデーションが返される。                                                                                         |
| `view`         | no       | 従来の最近の一覧の場合は省略する。`organized` を指定すると、サーバー側のピン留め/グループ順序が有効になり、オプションの組織化フィールドが追加される。他の値を指定すると `400 { code: "invalid_session_view" }` が返される。 |
| `group`        | no       | `view=organized` の場合のみ有効。`all`（デフォルト）、`pinned`、`ungrouped`、またはカスタムグループ ID。不明なグループ ID を指定すると `404 { code: "group_not_found" }` が返される。                                |

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

`view=organized` を指定すると、デーモンは `<Storage.getProjectDir(cwd)>/session-organization.v1.json` を読み取り、ピン留めされたセッションを最初に返し、次にアクティビティ時刻の降順、最後に安定したタイブレーカーとして `sessionId` でソートして返す。組織化されたカーソルは不透明な base64url JSON であり、従来の最近の一覧で再利用してはならない。`pinned` はグループではなく仮想フィルターである。`groupId: null` は未グループ化を意味する。アーカイブされたセッションは組織化メタデータを保持するが、`archiveState=archived&view=organized` はアーカイブされたセッションのみを返す。

`view=organized` の場合、各セッションに追加のフィールドが表示されることがある。

```json
{
  "isPinned": true,
  "pinnedAt": "2026-07-04T12:00:00.000Z",
  "groupId": "018f..."
}
```

信頼されたアクティブリストには、`clientCount` や `hasActivePrompt` などのライブデーモンオーバーレイフィールドが含まれる。信頼されていないセカンダリおよびアーカイブリストはストレージのみである。ライブオーバーレイフィールドは存在しないか false のままであり、アーカイブエントリは `isArchived` を `true` に設定する。セッションが存在しない場合は空の配列（404 ではない）が返される。セッションピッカー UI は、ワークスペースがアイドル状態だからといってエラーになるべきではない。

### `GET /workspaces/:workspace/sessions/live-state`

選択されたワークスペースランタイムのメモリ上のみのライブセッションスナップショットとインメモリカタログバージョンを返します。これにより、クライアントは `hasActivePrompt`、待機フラグ、`clientCount` などの揮発性状態のために `GET /workspaces/:workspace/sessions` の永続化カタログをポーリングする必要がなくなります。事前チェックとして `workspace_session_live_state` が必要です。このタグは `workspace_qualified_rest_core` とは独立しているため、より広範なワークスペース REST ケイパビリティを公開する古いデーモンはこのルートを実装しません。セレクターは他の複数形セッションルートと同じく、まず正確なワークスペース ID として解決され、次に正規化後の URL エンコードされた絶対 cwd として解決されます。ルートはプライマリおよびセカンダリランタイムの両方に対して信頼された専用のみです。プライマリランタイムへのフォールバックは行わず、信頼されていないセカンダリに有界カタログ読み取りを許可する寛容な永続化カタログポリシーも使用しません。エンドポイントにはクエリパラメータがなく、セッションストレージ、設定、外部コマンド、または ACP のラウンドトリップを実行しないため、そのコストは永続化セッション数や JSONL サイズに依存しません。デフォルトのライブセッション上限がレスポンスを有界に保ち、上限が無効化されていてもコストはライブセッション数にのみ比例します。

レスポンス:

```json
{
  "v": 1,
  "catalogVersion": {
    "generation": "7eca3164-bce1-4f50-94d8-c842c480f213",
    "revision": 17
  },
  "sessions": [
    {
      "sessionId": "session-123",
      "clientCount": 1,
      "hasActivePrompt": true,
      "isWaitingForPermission": false,
      "isWaitingForUserQuestion": false
    }
  ]
}
```

`v` はレスポンススキーマバージョンです。すべての成功レスポンスには `Cache-Control: no-store` が含まれます。`sessions` は選択されたランタイムで現在ライブのセッションの完全な、ページネーションされていない、順序付けされていないセットです。空のライブランタイムは `sessions: []` で `200` を返します。`clientCount`、`hasActivePrompt`、`isWaitingForPermission`、および `isWaitingForUserQuestion` は必須のワイヤフィールドであり、欠落しているオプションのブリッジ値は `0` または `false` にプロジェクションされます。表示名、タイムスタンプ、組織化、およびソースメタデータなどの静的カタログフィールドは意図的に除外され、フルカタログが所有し続けます。ライブステート行が存在しない場合は、既知のカタログ行の揮発性フィールドをクリアするだけです。永続化カタログ行を削除することはありません。

`catalogVersion` はデーモンが観測したカタログ変更の等価トークンです。`generation` は各ブリッジインスタンスで作成されるランダム UUID であり、デーモンの再起動またはワークスペースランタイムの置換時に変更されます。`revision` はゼロから始まり、世代内で単調に増加します。サポートされる操作はペア全体の等価比較のみです。世代とリビジョンが同じであればデーモンが観測したカタログ変更はなく、いずれかが異なればフルカタログをリロードする必要があります。クライアントはリビジョンの算術演算や世代をまたいだリビジョンの比較を行ってはなりません。保守的な追加のインクリメントは許可されます。バージョンはデーモンが観測したカタログメンバーシップと静的メタデータの変更をカバーします。通常のターンアクティビティ、プロンプトライフサイクル、アタッチ/デタッチ、および待機状態の遷移はバージョンを進めません。ライブスナップショットが対応する揮発性フィールドをすでに保持しているためです。2 つの揮発性オーバーレイ値は意図的に両方のシグナルの外にあります。ターンエラーステート（`hasTurnError`/`turnError`）と保留中インタラクションのカウント/コンテンツ（`pendingInteractionCount`/`pendingInteractions`）はバージョンを進めず、スナップショットにも表示されません。そのため、それらが必要なクライアントは、セッションごとのイベントストリームまたはフルカタログの読み取りを続ける必要があります。いずれのフィールドも、具体的なコンシューマーが必要になったときにワイヤ追加できます。別のデーモン、TUI、または外部プロセスによって直接書き込まれた変更は観測されないため、クライアントが定期フルカタログポーリングを停止すると、それらの書き込みには有界な検出時間がなく、明示的なフルリロード、別の観測されたカタログ変更、再接続、またはデーモン/ランタイムの置換後にのみ表面化します。

クライアントは 2 回の読み取りハンドシェイクでカタログバンドルを調整します。ライブステート A を読み取り、フルセッションリスト（クライアントが `session_organization` を消費する場合は `GET /workspaces/:workspace/session-groups` も）をロードし、次にライブステート B を読み取ります。A と B のバージョンが等しければバンドルを受け入れます。バージョンが異なればカタログを古いものとしてマークし、 tight リトライループに入らずに最大 1 回の追跡リロードに統合します。受け入れられるすべてのカタログリクエストは A の後に開始されなければなりません。A より前に開始されたリクエストまたは重複排除されたプロミスは調整を満たせません。バージョン駆動のリロードはワークスペースごとにシングルフライトであり、非ゼロの背景最小間隔に従うため、持続的なカタログの激変がライブステートポーリングごとに 1 回のフルカタログスキャンを引き起こすことはありません。明示的なローカル変更は、同じシングルフライト操作を通じて即時リフレッシュをリクエストできます。

**エラー:**

- `400` — 不明、不正、ネスト、または未登録のセレクターに対する既存のセレクターバリデーションまたは `workspace_mismatch` の動作。ルートは不明なセレクターをプライマリランタイムに解決することはありません。
- `403` — 信頼されていないプライマリを含む、信頼されていないランタイムに対する `untrusted_workspace`。
- `503` — ブートストラップ中、遷移中、drain 中、ブロック、または削除されたランタイム、あるいはリクエスト中にクローズするランタイム世代に対する `Retry-After` 付きの `workspace_runtime_unavailable`。
- `500` — 予期しないローカルエラーは既存のブリッジエラーマッピングを使用します。

### `GET /workspace/:id/session-groups`

ワークスペースのユーザー定義セッショングループを一覧表示する。単数 GET セレクターは、登録されたワークスペース ID または URL エンコードされた正規化 cwd を受け付ける。複数 GET エイリアスは信頼されていないセカンダリでも利用可能で、組織サイドカーのみを読み取る。複数のグループ変更は信頼ゲートされたままである一方、単数のグループ変更はプライマリのみの互換性動作を保持する。事前チェックとして `caps.features.includes('session_organization')` が必要。

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

色はプロトコルトークンのみである。クライアントが表示名をローカライズする。デフォルトの色名を持つグループは作成されない。

### `POST /workspace/:id/session-groups`

カスタムセッショングループを作成する。厳格な変更ゲート。事前チェックとして `caps.features.includes('session_organization')` が必要。

リクエスト:

```json
{ "name": "Frontend", "color": "blue" }
```

`name` はトリミングされ、1-64 文字でなければならず、制御文字を含むことはできず、大文字と小文字を区別しないトリミング比較でワークスペース内で一意である。重複する名前は `409 { code: "group_name_conflict" }` を返す。`color` は返された `colorOptions` のいずれかでなければならない。

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

カスタムセッショングループを更新する。厳格な変更ゲート。事前チェックとして `caps.features.includes('session_organization')` が必要。ボディフィールドはオプション: `{ "name"?: string, "color"?: string, "order"?: number }`。不明なグループ ID は `404 { code: "group_not_found" }` を返す。重複/無効な名前と色は作成と同じエラーを使用する。

### `DELETE /workspace/:id/session-groups/:groupId`

カスタムセッショングループを削除する。厳格な変更ゲート。事前チェックとして `caps.features.includes('session_organization')` が必要。グループを参照しているセッションは `groupId: null` にクリアされる。ピン留め状態は保持される。グループが削除された場合は `{ "deleted": true }` を返し、ID が存在しなかった場合は `{ "deleted": false }` を返す。

### `POST /sessions/delete`

1 つ以上の永続化セッション JSONL ファイルをハードデリートする。デーモンはまずベストエフォートでライブセッションを閉じ、次にアクティブまたはアーカイブされた JSONL を削除する。同じ ID に対してアクティブとアーカイブの両方のコピーが存在する場合、両方が削除される。両側のワークツリーサイドカーがクリーンアップされる。ファイル履歴、サブエージェントのトランスクリプト、およびランタイムサイドカーは意図的に保持される。

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

1 つ以上のセッションをアーカイブする。アーカイブは状態遷移であり、削除ではない。JSONL は `chats/<id>.jsonl` から `chats/archive/<id>.jsonl` に移動する。ファイル履歴、サブエージェントのトランスクリプト、およびランタイムサイドカーはそのまま保持される。セッションがライブの場合、デーモンはまず厳格なクローズを実行し、ACP エージェントのクローズハンドラーにチャット記録のフラッシュを要求する。クローズまたはフラッシュが失敗した場合、JSONL は移動されない。事前チェックとして `caps.features.session_archive` が必要。

リクエスト:

```json
{ "sessionIds": ["<uuid>"] }
```

`sessionIds` は最大 100 個の ID を持つ空でない文字列配列でなければならない。重複は折りたたまれる。

レスポンス:

```json
{
  "archived": ["<uuid>"],
  "alreadyArchived": [],
  "notFound": [],
  "errors": []
}
```

`errors` エントリは `{ "sessionId": "<uuid>", "error": "message" }` を持つ。同じ ID のアクティブファイルとアーカイブファイルは競合として扱われ、`errors` で報告される。ファイルが上書きされることはない。

### `POST /sessions/unarchive`

アーカイブされたセッションをアクティブディレクトリに復元する。これだけではセッションは再開されない。`chats/archive/<id>.jsonl` を `chats/<id>.jsonl` に戻すだけである。unarchive が成功した後、クライアントは `POST /session/:id/load` または `POST /session/:id/resume` を呼び出すことができる。

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

同じ ID のアクティブな JSONL がすでに存在する場合、unarchive は `errors` で競合を報告し、上書きしない。同じ ID に対してアーカイブまたは unarchive が実行中の場合、バッチ開始前に `409 session_archiving` を返す。

ACP-over-HTTP は、ベンダーメソッド `_qwen/sessions/archive` および `_qwen/sessions/unarchive` を通じて同じリクエストおよびレスポンスボディを使用する。REST ルートテーブルは、`POST /sessions/archive` および `POST /sessions/unarchive` を ACP トランスポート用のそれらのメソッドにマップする。

### マルチワークスペースのライブセッションルーティング

`multi_workspace_sessions` が公開されている場合、ライブセッション操作は `sessionId` からワークスペースを特定する。クライアントは URL にワークスペースセレクターを追加しない。既存のオーナー routed ライフサイクル操作に加えて、これは `PATCH /session/:id/metadata`、`POST /session/:id/recap`、`POST /session/:id/generate`、`POST /session/:id/btw`、`POST /session/:id/mid-turn-message`、`GET /session/:id/mid-turn-messages`、`DELETE /session/:id/mid-turn-messages/:messageId`、`POST /session/:id/tasks/:taskId/cancel`、`POST /session/:id/goal/clear`、`POST /session/:id/continue`、`POST /session/:id/language`、`POST /session/:id/artifacts`、および `DELETE /session/:id/artifacts/:artifactId` にも適用される。デーモンは各リクエストを、ライブセッションを所有する信頼されたランタイムにルーティングする。信頼されていない非プライマリオーナーは `403 untrusted_workspace` を返し、ライブオーナーが存在しない場合は `404 session_not_found` を返し、曖昧なオーナーは `500 ambiguous_session_owner` で fail closed（失敗時は拒否）する。

このルールはライブセッション専用であり、ワークスペースを持たないすべてのセッションルートがマルチワークスペース対応になるわけではない。永続化またはアーカイブされた操作は、ドキュメント化されたワークスペース修飾ルートを使用する。`POST /session/:id/branch`、`POST /session/:id/fork`、および `POST /session/:id/cd` は意図的にプライマリ専用のままとなり、非プライマリオーナーに対して `non_primary_session_route_not_supported` を返す。

### ミッドターンメッセージ

`POST /session/:id/mid-turn-message` は `{ "message": "...", "messageId": "<optional-message-id>" }` を受け付ける。成功した受け入れは `{ "accepted": true, "messageId": "<id>" }` を返し、所有権をデーモンに移す。メッセージはアクティブなターンに drain されるか、セッションがアイドル状態になったときに通常のプロンプト FIFO に昇格される。`session_mid_turn_message_query` を使用するクライアントは安定した `messageId` を送信する。キューイング中、保留中、または有界整合性リング内に残っている間は、それを繰り返しても冪等である。キューがいっぱいの場合、所有権を取得せずに新しいリクエストを拒否する。古いデーモンに接続された新しいクライアントは、欠落しているケイパビリティを検出し、レガシーのローカルフォールバックを保持する。

`GET /session/:id/mid-turn-messages` は、セッション全体のデーモン所有キューと、有界の `settledMessageIds` および `promotedMessageIds` リングを返す。settled ID は注入されたか明示的に削除されたものである。promoted ID は通常のプロンプト FIFO に入ったものである。いずれかのリングにある ID は再送信してはならない。

キューイングされたメッセージがアクティブなターンに drain されると、デーモンは整列された `messages` 配列と `messageIds` 配列（および既知の場合、実行中のターンの `promptId`）を運ぶ `mid_turn_message_injected` を公開する。これは一時的な重複排除シグナルであり、トランスクリプトアイテムではない。クライアントはそれらのメッセージ ID に登録された完了コールバックを settle し、それに対するローカルの保留中行を破棄する。古いデーモンはペイロードに `originatorClientId` も含める。エコーの取りこぼしは、上記のクエリを通じて settled リングから回復される。

`session_mid_turn_message_mutation` が公開されている場合、アタッチされたセッションクライアントは `DELETE /session/:id/mid-turn-messages/:messageId` を呼び出すことができる。これは、ミッドターンキューまたは昇格された保留中プロンプト状態のいずれかからメッセージを削除する。すでに実行中の昇格されたメッセージを削除すると、そのターンが中止される。これは通常の保留中プロンプトの削除と同じである。デーモン所有キューの追加と削除は、既存の `pending_prompt_added` および `pending_prompt_completed` セッションイベントを公開し、アタッチされたクライアントは両方の信頼できるキューのスナップショットを更新する。`{ "removed": false }` は、メッセージがすでに注入済み、完了済み、または見つからなかったことを意味する。

### `POST /session/:id/prompt`

プロンプトをエージェントに転送する。マルチプロンプトの呼び出し元はセッションごとに FIFO キューイングされる（ACP はセッションごとに 1 つのアクティブなプロンプトを保証する）。

リクエスト:

```json
{
  "prompt": [{ "type": "text", "text": "What does src/main.ts do?" }],
  "delivery": {
    "kind": "channel",
    "target": {
      "channelName": "dingtalk",
      "type": "user",
      "id": "platform-user-id"
    }
  }
}
```

`delivery` はオプションであり、`channel_delivery` ケイパビリティを必要とする。デーモンはプロンプトが受け入れられたときに `202 {promptId,lastEventId}` を返す。成功した `end_turn` の後、セッションは可視な最終テキストを、同じワークスペースのすでに実行中のチャネルワーカーに送信する。ペイロードは最後のツールなしアシスタント応答ブロックのみである。ツール呼び出しのプリアンブル、ツール間のナレーション、置き換えられたリトライ、および以前の自動コンティニュエーションブロックは除外される。空または空白のみの最終テキストでも、認可が消費された後に `status: "skipped"` を持つ相関のある `channel_delivery_result` が生成されるが、ワーカーには連絡しない。配信の成功または失敗は、後で同じリプレイ可能なイベントを通じて到着し、`turn_complete` を `turn_error` に変更することはない。キャンセル、エージェントの失敗、およびトークン制限による終了は、配信結果を送信または公開しない。

バリデーション: `prompt` は空でないオブジェクトの配列である必要がある。その他の失敗はブリッジに到達する前に `400` を返す。

レスポンス:

```json
{ "promptId": "session-id########1", "lastEventId": 42 }
```

`202` レスポンスは受け入れを確認するものであり、エージェントの完了を確認するものではない。`lastEventId` の後のセッション SSE ストリームを監視し、`promptId` で `turn_complete` または `turn_error` を相関付ける。`turn_complete.data.stopReason` は `end_turn`、`cancelled`、`max_tokens`、`error`、または `length` の場合がある。

HTTP クライアントがプロンプトの途中で切断された場合、デーモンはエージェントに ACP `cancel` 通知を送信し、エージェントは `stopReason: "cancelled"` でプロンプトを終了する。

`prompt_absolute_deadline` が公開されている場合、`deadlineMs` は設定されたサーバーデッドラインを短縮する場合がある。期限超過は、`errorKind: "prompt_deadline_exceeded"` を持つ相関のある `turn_error` を出力する。

### `POST /session/:id/cancel`

セッション上の**現在アクティブな**プロンプトをキャンセルする。ACP 側では、これはリクエストではなく通知である。エージェントはアクティブな `prompt()` を `cancelled` で解決することで応答する。

```bash
curl -X POST http://127.0.0.1:4170/session/$SID/cancel
# → 204 No Content
```

> **マルチプロンプトの契約:** キャンセルはアクティブなプロンプトにのみ影響する。同じクライアントが以前に POST し、アクティブなプロンプトの後ろでキューイングされているプロンプトは引き続き実行される。マルチプロンプトキューイングはデーモンが導入した動作（ACP 仕様にはない）であり、キューイングされたプロンプトの契約は「それぞれをキャンセルするか、チャネル終了でセッションを強制終了しない限り、実行され続ける」というものである。

マルチクライアント環境でキューイングされたプロンプトが予期されない場合、まず呼び出し元がデフォルトの `sessionScope: "single"` セッションを共有しているかどうかを確認すること。スレッドごとに独立した会話を行うには、`sessionScope: "thread"` でセッションを作成し、プロンプトがそのスレッド内でのみ直列化されるようにする。

### `DELETE /session/:id`

ライブセッションを明示的にクローズする。他のクライアントがアタッチされている場合でも強制クローズする。アクティブなプロンプトをキャンセルし、保留中のパーミッションをキャンセルとして解決し、`session_closed` イベントを公開し、EventBus をクローズし、デーモンマップからセッションを削除する。ディスクに永続化されたセッションは削除されない。`POST /session/:id/load` を介して再読み込みできる。Pre-flight `caps.features.session_close`。

```bash
curl -X DELETE http://127.0.0.1:4170/session/$SID
# → 204 No Content
```

冪等性: 不明なセッションの場合は `404` を返す。エラーエンベロープは `code: "session_not_found"` を使用する。同時クローズは `code: "session_closing"` を返す場合があり、クライアントはこのルートに対して同じ成功した終端状態として扱うことができる。

> **`session_closed` イベント。** SSE 購読者は、ストリームが終了する前に `{ sessionId, reason: 'client_close', closedBy?: '<clientId>' }` を含む終端の `session_closed` イベントを受信する。SDK リデューサーはこれを `session_died` と同じように扱う（`alive: false` を設定し、`pendingPermissions` をクリアする）。

### `PATCH /session/:id/metadata`

変更可能なセッションメタデータを更新する。現在は `displayName` のみをサポートする。Pre-flight `caps.features.session_metadata`。グループ化とピン留めは意図的にこのルートの一部ではない。`session_organization` の下の `PATCH /session/:id/organization` を使用すること。

リクエスト:

```json
{ "displayName": "My Investigation Session" }
```

| フィールド     | 必須 | 備考                                                                            |
| ------------- | ---- | ------------------------------------------------------------------------------- |
| `displayName` | いいえ | 文字列、最大 256 文字。空の文字列は名前をクリアする。そのままにする場合は省略する。 |

レスポンス:

```json
{ "sessionId": "<uuid>", "displayName": "My Investigation Session" }
```

セッションの SSE ストリームで `{ sessionId, displayName }` を含む `session_metadata_updated` イベントを公開する。

### `PATCH /session/:id/organization` および `PATCH /workspaces/:workspace/session/:id/organization`

既存のミューテーションゲートを通じてローカルセッションの組織化状態を更新する。Pre-flight `caps.features.includes('session_organization')`。複数形ルートは追加で `workspace_qualified_rest_core` を必要とする。複数形ルートでは、`:workspace` はまず正確な登録済みワークスペース ID として解決され、次に URL エンコードされた正規化された絶対 cwd として解決される。選択されたランタイムは信頼されている必要がある。セッションの存在と非 null の `groupId` のバリデーションは、そのランタイムのアクティブな永続化、アーカイブされた永続化、およびライブセッション状態とグループストアにスコープされ、プライマリまたは別のワークスペースへのフォールバックはない。レガシールートはプライマリワークスペース専用のままである。

リクエスト:

```json
{ "isPinned": true, "groupId": "018f..." }
```

| フィールド   | 必須 | 備考                                                                                                      |
| ----------- | ---- | --------------------------------------------------------------------------------------------------------- |
| `isPinned`  | いいえ | ブール値。`true` はまだピン留めされていない場合に `pinnedAt` を設定する。`false` は `pinnedAt` をクリアする。 |
| `groupId`   | いいえ | カスタムグループ ID、またはグループ化されていない場合は `null`。不明なグループ ID は `404 { code: "group_not_found" }` を返す。 |
| `color`     | いいえ | サポートされているセッションカラートークン、またはセッションカラーをクリアする場合は `null`。                    |

レスポンス:

```json
{
  "sessionId": "<uuid>",
  "groupId": "018f...",
  "color": "blue",
  "isPinned": true,
  "pinnedAt": "2026-07-04T12:00:00.000Z",
  "updatedAt": "2026-07-04T12:00:00.000Z"
}
```

この状態は、デーモンのランタイムストレージディレクトリ下のプロジェクトレベルのセッション組織化サイドカーに保存される。これはトランスクリプトコンテンツではなく、トランスクリプトの `mtime` を更新せず、トランスクリプトと一緒にエクスポートされず、アーカイブ/アンアーカイブをまたいで保持される。

### `POST /session/:id/heartbeat`

このセッションに対するデーモンの最終確認（last-seen）の記録を更新する。長寿命のアダプタ（TUI/IDE/web）は、将来の取り消しポリシー（Wave 5 PR 24）が死んだクライアントと静かなクライアントを区別できるように、定期的にこれを ping する。

ヘッダー:

| ヘッダー           | 必須 | 備考                                                                                                                                                                                                                                          |
| ----------------- | ---- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `X-Qwen-Client-Id` | いいえ | `POST /session` からデーモンが発行した ID をエコーバックする。識別されたクライアントはクライアントごとのタイムスタンプも更新するが、匿名の heartbeat はセッションごとの watermark のみを更新する。他の場所と同じ `[A-Za-z0-9._:-]{1,128}` の形状を満たす必要がある。 |

リクエストボディは空（`{}` で問題ない。現在読み取られるフィールドはない）。

レスポンス:

```json
{
  "sessionId": "<sid>",
  "clientId": "<cid>",
  "lastSeenAt": 1700000000123
}
```

`clientId` は信頼された `X-Qwen-Client-Id` が提供された場合にのみエコーバックされる。`lastSeenAt` はブリッジが保存したデーモン側の `Date.now()` エポック（ミリ秒）である。

エラー:

- `400` — ヘッダーが不正な形式（ヘッダー形状ルール）の場合、またはこのセッションに登録されていない `clientId` を含んでいる場合（ブリッジはタイムスタンプを更新する前に `InvalidClientIdError` をスローする）、`{ code: 'invalid_client_id' }` を返す。
- `404` — 不明なセッション。

ケイパビリティゲーティング: pre-flight `caps.features.client_heartbeat`。古いデーモンはこのパスに対して `404` を返す。

### `POST /session/:id/model`

セッションに現在バインドされているモデルサービス**内で**アクティブなモデルを切り替える。セッションごとのモデル変更キューを通じて直列化される。

（_サービス_ 自体（Alibaba ModelStudio と OpenRouter など）を切り替えるには、新しいセッションの `POST /session` で `modelServiceId` を渡す。ステージ 1 にはライブサービス切り替えルートはない。）

リクエスト:

```json
{ "modelId": "qwen-staging" }
```

レスポンス:

```json
{ "modelId": "qwen-staging" }
```

成功すると、SSE ストリームに `model_switched` を公開する。失敗すると、`model_switch_failed` を公開する（呼び出し元だけでなくパッシブな購読者も失敗を確認できるようにするため）。エージェントチャネルの終了と競合するため、応答がなくなった子プロセスが HTTP ハンドラをブロックすることはない。

### `POST /session/:id/recap`

ケイパビリティタグ: `session_recap`。ブリッジ → ACP extMethod `qwen/control/session/recap`。

セッションの「どこまでやったか」を要約する一文を生成する。コアの `generateSessionRecap`（`packages/core/src/services/sessionRecap.ts`）をラップし、ツールを無効にして `maxOutputTokens: 300`、厳密な `<recap>...</recap>` 出力形式で高速モデルに対してサイドクエリを実行する。サイドクエリはセッションの既存の GeminiClient チャット履歴を読み取り、それに追加することは**ない**。

リクエストボディは無視される（`{}` または空を送信）。非厳格なミューテーションゲート — ポスチャーは `/session/:id/prompt` を反映する（呼び出しはトークンを消費するが状態は変更しない）。SSE イベントは公開されない。

レスポンス (200):

```json
{
  "sessionId": "sess:42",
  "recap": "Debugging the auth retry race. Next: add deterministic timing to the integration test."
}
```

以下の場合、`recap` は `null` になる（エラーではなく通常の 200）。

- セッションの対話ターンがまだ 2 つ未満の場合、
- サイドクエリが抽出可能な `<recap>...</recap>` ペイロードを返さなかった場合、
- または基盤となるモデルエラーが発生した場合（コアヘルパーはベストエフォートであり、スローすることはない）。

エラー:

- `400 {code: 'invalid_client_id'}` — `X-Qwen-Client-Id` ヘッダーが不正な形式。
- `404` — 不明なセッション。

キャンセル: **v1 ではなし**。このルートは HTTP クライアントの切断をリッスンせず、`AbortSignal` はブリッジに配管されず、ACP 子プロセスは呼び出し元が切断されたかどうかに関係なくサイドクエリを完了まで実行する。唯一の上限は、ブリッジの 60 秒のバックストップタイムアウト（`SESSION_RECAP_TIMEOUT_MS`）と、ACP チャネルの死に対する transport-closed の競合である。recap は短いため（シングルアテンプト、`maxOutputTokens: 300`、通常約 1〜5 秒）これは許容される。帯域幅コストが正当化される場合は、将来のリリースでリクエスト ID ベースのキャンセル ext-method が完全なエンドツーエンドのキャンセルを配管できる。

### `POST /session/:id/generate`

ケイパビリティタグ: `session_generation`。

呼び出し元指定のプロンプトからリクエストスコープのテキスト生成を実行する。リクエストは会話履歴を読み取りまたは変更せず、ツールも公開しない。設定された高速モデルを優先し、高速モデルが存在しないか解決できない場合はセッションのメインモデルにフォールバックする。エンドポイントはタスク非依存である。翻訳は呼び出し元が定義するプロンプトの 1 つの可能性に過ぎない。

リクエスト:

```json
{ "prompt": "Translate into Chinese: Hello" }
```

レスポンスは `text/event-stream` である。サーバーは最初に SSE コメントを即座に書き込み、続いて `started`、オプションの `thinking` 進捗イベント、0 個以上の `delta` イベント、および `done` を送信する。`thinking` イベントは推論コンテンツを運ばない。ストリーミング開始後のモデル失敗は `error` イベントを生成する。別のモデルでリトライすることはない。プロンプトは 32 KiB の UTF-8 テキストに制限される。HTTP クライアントの切断は生成リクエストをキャンセルする。

### ミューテーション: 承認、ツール、スキル、初期化、MCP 再起動

デーモンは 5 つのミューテーション制御ルートを公開し、リモートクライアントがデーモンホストの CLI に触れることなく実行時の動作状態を変更できるようにする。5 つすべてが:

- PR 15 の**厳格な**ミューテーションゲートによって制御されている。ベアラートークンなしで構成されたデーモンは、これらを `401 {code: 'token_required'}` で拒否する。オプトインする前に `--token`（または `QWEN_SERVER_TOKEN`）を設定すること。
- `X-Qwen-Client-Id` ヘッダーを受け入れ、スタンプを押す（PR 7 の監査チェーン）。ヘッダーに信頼された ID が含まれている場合、デーモンは対応する SSE イベントで `originatorClientId` を発行し、クロスクライアント UI は自身のミューテーションのエコーを抑制できる。
- アフォーダンスを公開する前に、タグごとの各ケイパビリティを pre-flight チェックする。古いデーモンはルートに対して `404` を返す。

ツールトグル、スキルトグル、初期化、および MCP 再起動ルートは**ワークスペーススコープ**のイベントを発行する。ミューテーションがトリガーされたときにどのセッションがアタッチされていたかに関係なく、すべてのアクティブなセッション SSE バスがイベントを受信する。`approval-mode` は**セッションスコープ**のイベントを発行する。変更が 1 つのセッションの `Config` にローカルであるためである。

#### `POST /session/:id/approval-mode`

ケイパビリティタグ: `session_approval_mode_control`。ブリッジ → ACP extMethod `qwen/control/session/approval_mode`。

ライブセッションの承認モードを変更する。新しいモードは ACP 子プロセスのセッションごとの `Config` に即座に反映される。設定はデフォルトではディスクに書き込まれない。`persist: true` を渡すと、`tools.approvalMode` をワークスペース設定にも書き込む。

リクエスト:

```json
{ "mode": "auto-edit", "persist": false }
```

`mode` は `'plan' | 'default' | 'auto-edit' | 'auto' | 'yolo'` のいずれかでなければならない（コアの `ApprovalMode` 列挙型のミラー。SDK はランタイム検証用に `DAEMON_APPROVAL_MODES` をエクスポートする）。`persist` のデフォルトは `false`。

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
- `403 {code: 'trust_gate', errorKind: 'auth_env_error'}` — リクエストされたモードには信頼されたフォルダが必要（信頼されていないワークスペースでの特権モードはコアの `Config.setApprovalMode` によって拒否される）。
- `404` — 不明なセッション。

SSE イベント（セッションスコープ）: `{sessionId, previous, next, persisted, originatorClientId?}` を含む `approval_mode_changed`。

#### `POST /workspace/tools/:name/enable`

ケイパビリティタグ: `workspace_tool_toggle`。純粋なファイル IO — ACP のラウンドトリップなし。

ワークスペースの `tools.disabled` 設定リストでツール名を切り替える。そこにリストされているツールは**一切登録されない**（ツールを登録したまま呼び出しを拒否する `permissions.deny` とは異なる）。組み込みツールと MCP で検出されたツールの両方が `ToolRegistry.registerTool` を経由し、そこで無効化セットが参照される。

> ⚠️ **名前はレジストリが公開する識別子と完全に一致しなければならない。** エイリアスの解決は行われない。ルートはパスパラメータにある文字列をそのまま `tools.disabled` に保存し、次の ACP 子プロセスは登録時に `tool.name` と比較する。組み込みツールは正規のレジストリ名（snake_case の動詞形式）を使用する: `run_shell_command`、`read_file`、`write_file`、`list_directory`、`glob`、`grep_search`、`web_fetch` など。CLI が表示するラベル（`Shell`、`Read`、`Write`）ではない。MCP で検出されたツールは修飾された `mcp__<server>__<name>` 形式を使用する（これは `tool_toggled` イベントがブロードキャストする形式でもあり、`GET /workspace/mcp` がリストする形式でもある）。`Bash` を無効化しても、次のセッションで `run_shell_command` が登録されるのを防ぐことはできない。

ライブな ACP 子プロセスはすでに登録されたツールを保持する。切り替えは**次の** ACP 子プロセスの.spawn時に有効になる。現在のデーモンで変更を有効にするには、`POST /workspace/mcp/:server/restart`（MCP 由来のツールの場合）または新規セッションの作成と組み合わせてください。

不明なツール名も受け入れられる。まだインストールされていない MCP ツールを事前に無効化することは正当なユースケースである。

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

#### `POST /workspace/skills/:name/enable`

ケイパビリティタグ: `workspace_skill_toggle`。ワークスペース修飾形式は `POST /workspaces/:workspace/skills/:name/enable`。

ワークスペースのスキル設定を通じて、読み込まれたユーザー呼び出し可能なスキルを切り替える。CLI の `/skills` パネルの Space キーの動作と同じ。ルックアップは大文字と小文字を区別しないが、永続化とレスポンスはスキルの正規名を使用する。`skills.defaultDisabled` のスキルを有効にすると、ワークスペースの `skills.enabled` オプトインが追加される。無効にすると、そのオプトインが削除され、ワークスペースの `skills.disabled` エントリが追加される。すでに読み込まれていないスキルの既存エントリは保持され、対象の重複または大文字と小文字が異なるエントリは折りたたまれる。システムデフォルト、ユーザー、またはシステムスコープから継承されたハードディスエントリはスキルをロックする。ワークスペーススコープはそれをオーバーライドできない。

これは ACP の `qwen/skills/setEnabled` managed-skill 操作および `disable-model-invocation` フロントマターフィールドとは異なる。有効なスキルの可用性は `skills.disabled` > `skills.enabled` > `skills.defaultDisabled` に従う。ハードおよびデフォルトの両方の無効化は、スラッシュコマンド/モデルの可用性からスキルを削除し、その後のスキル実行を拒否する。`disable-model-invocation: true` は直接のユーザー呼び出しを有効なままにし、モデルからの呼び出しからスキルを隠すのみである。

リクエスト:

```json
{ "enabled": false }
```

レスポンス (200):

```json
{
  "skillName": "review",
  "enabled": false,
  "changed": true,
  "activation": "applied",
  "sessionsRefreshed": 2,
  "sessionsFailed": 0
}
```

`activation` は、すべてのアクティブなセッションが更新された場合は `applied`、ACP 子プロセスが存在しない場合は `deferred`（1 つ開始されたときに永続化された設定が使用される）、少なくとも 1 つのアクティブなセッションの更新に失敗した場合は `partial`。ビジーなセッションも含まれる。デーモンは ACP 子プロセスとすべてのアクティブなセッションのワークスペース設定をリロードし、SkillManager コンシューマーに通知し、`available_commands_update` をプッシュする。すでにモデルに送信されたリクエストは書き換えられない。後続のバリデーション、コマンドスナップショット、およびモデルコンテキストは新しい状態を使用する。永続化に失敗した場合、更新もイベントも発行されない。セッションの更新に失敗した場合、コミットされた設定は保持される。子がセッションごとの結果を返すとき、セッションカウントは正確である。更新制御自体がそれらの結果を返す前に失敗した場合、`sessionsFailed: 1` は更新リクエストが失敗したことを示す保守的な下限である。

エラー:

- `400 {code: 'invalid_skill_name'}` — パスパラメータが空、または 256 文字を超えている。
- `400 {code: 'invalid_enabled_flag'}` — `enabled` が欠落している、またはブール値ではない。
- `403 {code: 'untrusted_workspace'}` — 選択されたワークスペースが信頼されていない。
- `404 {code: 'skill_not_found'}` — 名前に一致する読み込まれたスキルがない。
- `409 {code: 'skill_not_toggleable', reason: 'not_user_invocable' | 'inactive_extension' | 'locked', lockedScope?: 'system' | 'user' | 'systemDefaults'}` — CLI パネルが対象の切り替えを許可しない。`lockedScope` は `reason` が `locked` の場合にのみ存在する。

このミューテーションは、変更されたキー（`skills.disabled` および/または `skills.enabled`）ごとにワークスペーススコープの `settings_changed` イベントを再利用する。新しいイベントタイプは追加しない。ワークスペースのスキルステータスセルには、オプションの `disabledReason: 'hard' | 'default' | 'inactive_extension'` および `lockedScope: 'system' | 'user' | 'systemDefaults'` フィールドが含まれる。

#### `POST /workspace/skills/enable`

ケイパビリティタグ: `workspace_skill_batch_toggle`。ワークスペース修飾形式は `POST /workspaces/:workspace/skills/enable`。

1 つのリクエストで最大 100 個の読み込まれたスキルを切り替える。上限は重複排除前の生の `skillNames` エントリをカウントする。名前はトリミングされ、最初に見た順序を保持しながら大文字と小文字を区別せずに重複排除される。デーモンは 1 つのスキルステータススナップショットに対してバリデーションし、すべての有効な変更を 1 回のロックされた設定書き込みで永続化し、アクティブなセッションを 1 回更新する。処理は期待される対象エラーに対してベストエフォートである。不明、非表示、inactive-extension、またはロックされた対象は `errors` に記録されるが、他の有効な対象が適用されるのを妨げない。予期しない永続化またはランタイム生成の失敗は引き続きリクエスト全体を失敗させる。

リクエスト:

```json
{
  "skillNames": ["review", "deploy", "missing"],
  "enabled": false
}
```

レスポンス (200):

```json
{
  "enabled": false,
  "activation": "applied",
  "sessionsRefreshed": 2,
  "sessionsFailed": 0,
  "results": [
    {
      "skillName": "review",
      "enabled": false,
      "changed": true
    },
    {
      "skillName": "deploy",
      "enabled": false,
      "changed": true
    }
  ],
  "errors": [
    {
      "skillName": "missing",
      "code": "skill_not_found",
      "error": "Skill not found: missing"
    }
  ]
}
```

対象エラーは `skill_not_found`、`skill_not_toggleable`、または `skill_inactive_extension` を使用する。不正なリクエストは HTTP 400 を返し、`invalid_skill_names`、`invalid_skill_name`、または `invalid_enabled_flag` を返す。認証、ワークスペースの信頼、クライアント識別子、予期しない永続化失敗、およびランタイム生成失敗は、標準のルートゲートを通じてリクエスト全体を失敗させる。バッチレベルの `activation`、`sessionsRefreshed`、および `sessionsFailed` は、変更されたすべての結果で共有される 1 つのライブセッション更新を記述する。`activation` は結果ではなく更新試行を報告する。対象が 1 つも変更されなかったバッチ（たとえば、すべての対象がエラーになった場合）でも、セッションがライブであれば `applied` を返す。これは単一スキルの no-op レスポンスと一致する。実際に変更されたものは、各結果の `changed` フラグと `errors` 配列から導出する。

#### `POST /workspace/init`

ケイパビリティタグ: `workspace_init`。純粋なファイル IO — ACP のラウンドトリップなし、**LLM の呼び出しなし**。

デーモンのプライマリワークスペースのルートに、空の `QWEN.md`（または `--memory-file-name` オーバーライドの下で `getCurrentGeminiMdFilename()` が返すもの）をスキャフォールディングする。機械的な処理のみ。AI によるコンテンツの記入には、`POST /session/:id/prompt` を続けて実行すること。

デフォルトでは、ターゲットファイルが空白以外のコンテンツを含んで存在する場合、上書きを拒否する。空白のみのファイルは存在しないものとして扱われる（ローカルの `/init` スラッシュコマンドと同じ動作）。

リクエスト:

```json
{ "force": false }
```

レスポンス (200):

```json
{ "path": "/work/bound/QWEN.md", "action": "created" }
```

`action` は新規作成の場合は `'created'`、既存の空白のみのファイルがそのまま残された（書き込みが実行されなかった）場合は `'noop'`、`force: true` によって空でないコンテンツが置き換えられた場合は `'overwrote'` になる。`workspace_initialized` SSE イベントはレスポンスのアクションをミラーリングする。オブザーバーは `action !== 'noop'` でフィルタリングし、実際のディスク上の変更に対してのみ反応できる。

エラー:

- `400 {code: 'invalid_force_flag'}` — `force` がブール値ではない。
- `409 {code: 'workspace_init_conflict', path, existingSize}` — ファイルが空白以外のコンテンツを含んで存在し、`force` が省略されているか false である。ボディには絶対パスとサイズ（バイト）が含まれるため、SDK クライアントは再 stat せずに「N バイトを上書きしますか？」というプロンプトを表示できる。

SSE イベント（ワークスペーススコープ）: `{path, action, originatorClientId?}` を含む `workspace_initialized`。

#### `POST /workspace/mcp/reload`

永続化された MCP 設定をワークスペースの検出設定とすべてのアクティブなセッションにリロードする。ワークスペース修飾形式は `POST /workspaces/:workspace/mcp/reload`。

リクエストボディ:

```json
{ "forceReconnectAll": true }
```

`forceReconnectAll` はオプションで、デフォルトは `false` であり、増分の整合性を保持する。true の場合、デーモンは設定の整合性調整後に、対象となる構成済み MCP サーバーをすべて再接続する。代わりに、`forceReconnectWhich: ["server-a", "server-b"]` を渡して、名前付きサーバーのみを再接続できる。オプションは相互排他である。強制再接続により、各トランスポートは別のローカルの Qwen Code プロセスがトークンストレージに書き込んだ可能性のある認証情報を読み取る。OAuth 認可フローを開始するものではない。

このルートは `202 { "accepted": true }` を返す。最終的な接続状態は `GET /workspace/mcp` をポーリングすること。無効なオプション値は 400 を返す。

#### `POST /workspace/mcp/:server/restart`

ケイパビリティタグ: `workspace_mcp_restart`。ブリッジ → ACP extMethod `qwen/control/workspace/mcp/restart`。

ACP 子プロセスの `McpClientManager.discoverMcpToolsForServer` を介して構成済みの MCP サーバーを再起動する（切断 + 再接続 + 再検出）。PR 14 v1 のアカウンティングからのライブ予算スナップショットを事前にチェックするため、予算が飽和したワークスペースでの再起動は、`BudgetExhaustedError` のカスケードをトリガーするのではなく、ソフトな拒否を返す。

リクエストボディは空（`{}`）。パスパラメータは `mcpServers` 設定に表示される URL エンコードされたサーバー名。

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

ソフトスキップの理由（すべて 200 を返す）:

| `reason`                | 意味                                                                                                                                                                                |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `'in_flight'`           | このサーバーに対する別の検出/再起動がすでに進行中。ルートは元の Promise を待機せずに即座に返す。呼び出し元は短い遅延後に再試行する必要がある。                                           |
| `'disabled'`            | サーバーは構成されているが `excludedMcpServers` にリストされている。再起動前に再度有効化すること。                                                                                      |
| `'budget_would_exceed'` | デーモンが `--mcp-budget-mode=enforce` であり、対象サーバーが現在 `reservedSlots` になく、ライブ合計が `clientBudget` に達している。呼び出し元はまずスロットを解放する必要がある。         |

エラー（2xx 以外）:

- `400 {code: 'invalid_server_name'}` — パスパラメータが空。
- `404` — サーバー名が `mcpServers` 設定にない、またはライブな ACP チャネルが存在しない（再起動には本質的にライブな `McpClientManager` インスタンスが必要）。
- `500` — 内部エラー（例: `ToolRegistry` が初期化されていない）。

SSE イベント（ワークスペーススコープ）: 成功時は `{serverName, durationMs, originatorClientId?}` を含む `mcp_server_restarted`。ソフトスキップ時は `{serverName, reason, originatorClientId?}` を含む `mcp_server_restart_refused`。

### `GET /session/:id/events` (SSE)

セッションのイベントストリームをサブスクライブする。

ヘッダー:

```
Accept: text/event-stream
Last-Event-ID: 42        ← オプション、ID 42 以降からリプレイ
X-Qwen-Event-Epoch: ...  ← オプション、カーソルをそのバスエポックと対応付け
X-Qwen-Client-Id: ...    ← オプションのクライアント識別子と診断相関
```

クエリパラメータ:

| パラメータ         | 必須 | 備考                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| ------------------ | ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `maxQueued`        | いいえ | サブスクライバーごとの**ライブフレームバックログ**の上限。範囲は `[16, 2048]`、デフォルトは 256。サブスクライブ時に強制的にプッシュされるリプレイフレームは、フレームおよびバイトの上限から免除される。実際にこれらを消費するのは、サブスクライバーが大量の `Last-Event-ID: 0` リプレイをまだ drain している間に到着するライブイベントである。コールド再接続時に値を増やし、コンシューマーが追いつく前にライブテールが低速クライアント警告/強制退去をトリガーしないようにする。ライブなシリアライズ済みバイトの上限はデーモン側で固定されており（デフォルトは 2 MiB）、クエリパラメータはない。範囲外/非10進/存在するが空の値は、SSE ハンドシェイクがオープンする前に `400 invalid_max_queued` を返す。Pre-flight `caps.features.slow_client_warning` — 古いデーモンはこのパラメータをサイレントに無視する。 |
| `connectReason`    | いいえ | クライアント報告の診断ヒント: `initial`、`resume`、`prompt_restart`、`stream_end`、`transport_error`、`state_resync`、または `unknown`。無効な値は `unknown` に正規化され、ハンドシェイクを拒否することはない。デーモンはこのフィールドを認証、リプレイ、強制退去、重複排除、またはストリーム置換に使用しない。                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `previousStreamId` | いいえ | クライアントが報告する、以前に受け入れられた REST/SSE ストリームの UUID。無効な値は無視される。これはベストエフォートの系譜のみであり、ストリームの動作を変更することはない。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |

成功したハンドシェイクには `X-Qwen-SSE-Stream-Id: <uuid>` が含まれる。ブラウザゲートウェイはそのレスポンスヘッダーを保持し、`Access-Control-Expose-Headers` を通じて公開しなければならない。古いデーモンまたは中間サーバーはそれを省略する場合がある。クライアントは通常通り続行し、系譜が利用できないものとして扱う必要がある。この ID は物理的な REST/SSE 接続を識別し、そのデーモンライフサイクル、キュー診断、およびリクエストトレースを相関付ける。

フレーム形式。`data:` 行は**完全なイベントエンベロープ**であり、1行に JSON 文字列化されている — `{id?, v, type, data, originatorClientId?}`。ACP 固有のペイロード（`sessionUpdate`、`requestPermission` 引数など）はエンベロープの `data` フィールドの下に配置される。エンベロープ自身の `type` は SSE の `event:` 行と一致する。

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

SSE レベルの `id:` / `event:` 行は、EventSource の互換性のために `envelope.id` / `envelope.type` を複製している。Raw-`fetch` コンシューマー（SDK の `parseSseStream`）は JSON エンベロープからすべてを読み取り、SSE プリアンブル行を無視する。

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
| `client_evicted`          | サブスクライバーローカル: キューオーバーフロー。`reason` はライブフレーム上限の場合は `queue_overflow`、ライブシリアライズバイト上限の場合は `queue_bytes_overflow` である。**ターミナル: このフレームの後に SSE ストリームが閉じられる**（`id` なし — 合成）。同じセッションの他のサブスクライバーは継続される。                                                                                                                                                                                                                                 |
| `stream_error`            | ファンアウト中のデーモン側エラー。**ターミナル: このフレームの後に SSE ストリームが閉じられる**（`id` なし — 合成）。                                                                                                                                                                                                                                                                                                                                                                   |

再接続のセマンティクス:

- `Last-Event-ID: <n>` を送信して、セッションごとのリングから `id > n` のイベントをリプレイする（デフォルトの深さは **8000**、`qwen serve --event-ring-size <n>` で調整可能）。
- **ギャップ検出:** `<n>` がリングにまだ残っている最も古いイベントより前の場合、デーモンは ID なしの `state_resync_required` フレームを出力してから、存続するサフィックスをリプレイする。SDK は `awaitingResync` をラッチする。クライアントは `POST /session/:id/load` を呼び出し、現在の有界リプレイスナップショットウィンドウから再構築する必要がある。そのスナップショット自体も、古いメモリ内リプレイエントリが削除された場合に `history_truncated` で始まる場合がある。このマーカーは情報提供用であり、別の resync ループを開始してはならない。
- ID はセッションごとに単調増加で、1 から始まる。
- 合成フレーム（`client_evicted`、`slow_client_warning`、`stream_error`）は意図的に `id` を省略し、他のサブスクライバーのシーケンススロットを消費しない。

バックプレッシャー:

- サブスクライバーごとのキューのデフォルトは `maxQueued: 256` ライブアイテムと、デーモン所有の 2 MiB ライブシリアライズ済みバイト上限。再接続中のリプレイフレーム、`slow_client_warning`、および `client_evicted` は両方の上限をバイパスする。
- フレーム上限のみを、SSE リクエストの `?maxQueued=N`（範囲 `[16, 2048]`）でオーバーライドする。`?maxQueuedBytes` は意図的に存在しない。クライアントはデーモンのメモリ予算を増やすことはできない。
- サブスクライバーのライブフレームバックログまたはライブバイトバックログが 75% を超えると、バスはそのサブスクライバーに `slow_client_warning` 合成フレームを強制的にプッシュする（オーバーフローエピソードごとに 1 回。両方の測定値が 37.5% 未満に減少した後に再設定される）。ストリームはオープンしたままになる。警告は事前通知であり、クライアントはより速く drain するか、切断してきれいに再接続できる。
- ライブフレーム上限がオーバーフローした場合、バスは `reason: "queue_overflow"` で `client_evicted` を出力する。ライブバイト上限がオーバーフローした場合、`reason: "queue_bytes_overflow"` を出力する。どちらの場合も、終端フレームが強制的にプッシュされ、サブスクリプションがクローズされる。

### `POST /permission/:requestId`

保留中の `permission_request` に投票する。アクティブな**メディエーションポリシー**が勝者を決定する。

| ポリシー                      | 動作                                                                                                                                                                                              |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `first-responder` (デフォルト) | 検証された最初の投票者が勝利。後続の投票者は `404` を取得。F3 以前のベースライン。                                                                                                                                            |
| `designated`                | プロンプトの originator（`originatorClientId`）のみが決定する。非 originator は `403 permission_forbidden / designated_mismatch` を取得。匿名プロンプトの場合は first-responder にフォールバックする。                         |
| `consensus`                 | N-of-M の投票者が合意する必要がある（デフォルト `N = floor(M/2) + 1`、`policy.consensusQuorum` でオーバーライド可能）。最初に `N` に達したオプションが勝利する。解決に至らない投票は `200` + `permission_partial_vote` SSE フレームを取得する。             |
| `local-only`                | ループバックの投票者のみ決定する。リモート呼び出し元は `403 permission_forbidden / remote_not_allowed` を取得する。                                                                                                      |

アクティブなポリシーは `settings.json` の `policy.permissionStrategy` に設定され、`/capabilities` の `body.policy.permission` で公開される。ビルドサポートされたセットに対して pre-flight `caps.features.permission_mediation`（`modes: [...]` 付き）。

> **F3 (#4175): マルチクライアントのパーミッション調整。** F3 は上記の 4 つのポリシーを追加した。F3 以前のデーモンは first-responder をハードコードしていた。設定されたポリシーが `first-responder` の場合、ワイヤー形状はビット単位で変更されない。新しいイベント（`permission_partial_vote`、`permission_forbidden`）は追加である。古い SDK はこれらを `unrecognized_known_event` として扱い、優雅に無視する。

> **パーミッションのタイムアウト（デフォルト 5 分）。** `permission_request` は以下のいずれかまで保留中のまま: (a) 何らかのクライアントがここで投票する、(b) `POST /session/:id/cancel` が発行される、(c) プロンプトを駆動する HTTP クライアントが切断される（プロンプト中のキャンセルは保留中のパーミッションを `cancelled` として解決する）、(d) セッションが強制終了される、(e) デーモンがシャットダウンする、**または (f) セッションごとのパーミッションタイムアウトが発火する**（`DEFAULT_PERMISSION_TIMEOUT_MS`、5 分）。タイムアウトの発火時、エージェントの `requestPermission` は `{outcome: 'cancelled'}` として解決され、監査リングに `permission.timeout` エントリが記録され、デーモンの stderr に一行のパンくずが出力され、SSE バスは標準の `permission_resolved` cancelled フレームをファンアウトし、サブスクライバーがクリーンアップする。タイムアウトは `BridgeOptions.permissionResponseTimeoutMs` 経由で設定可能である。長期プロンプトを実行するヘッドレス呼び出し元はこれを延長したい場合がある。

リクエスト:

```json
{
  "outcome": {
    "outcome": "selected",
    "optionId": "proceed_once"
  }
}
```

結果:

- `{ "outcome": "selected", "optionId": "<one-of-the-options>" }` — エージェントが提示した選択肢に応じて、accept / reject / proceed-once / など
- `{ "outcome": "cancelled" }` — リクエストを破棄する（`cancelSession` / `shutdown` が内部的に行うことと同じ）

レスポンス:

- `200 {}` — 投票が受け入れられた（解決された、または consensus の定足数の下に記録された）
- `403 { "code": "permission_forbidden", "reason": "designated_mismatch" | "remote_not_allowed", "requestId", "sessionId" }` — F3: アクティブなポリシーが投票を拒否した
- `404 { "error": "..." }` — requestId が不明（すでに解決済み、存在しなかった、またはセッションが破棄された）
- `500 { "code": "cancel_sentinel_collision", ... }` — F3: エージェントの `allowedOptionIds` に予約されたセンチネル `'__cancelled__'` が含まれている。エージェント/デーモンの契約違反
- `501 { "code": "permission_policy_not_implemented", "policy": "<name>" }` — F3 の前方互換性: ポリシーリテラルがスキーマに追加されたが、そのメディエーターブランチはまだビルドされていない（現在到達不能。将来のポリシー用に予約）

成功した投票の後、接続されているすべてのクライアントは同じ `requestId` と選択された `outcome` で `permission_resolved` を確認する。`consensus` の下では、中間投票は定足数に達するまで追加で `permission_partial_vote` をファンアウトする。

### 認証デバイスフロールート（issue #4175 PR 21）

デーモンは OAuth 2.0 Device Authorization Grant（RFC 8628）を仲介し、リモート SDK クライアントがログインをトリガーできるようにする。トークンは**デーモン**のファイルシステムに保存される。クライアントには保存されない。デーモン自身が IdP をポーリングする。クライアントの唯一の役割は、検証 URL とユーザーコードを表示し、（オプションで）SSE を介して完了イベントをサブスクライブすることである。

ケイパビリティタグ: `auth_device_flow`（常に公開）。v1 でサポートされるプロバイダー: `qwen-oauth`。

> [!note]
>
> Qwen OAuth 無料枠は 2026-04-15 に廃止された。このプロトコルでは `qwen-oauth` をレガシーな v1 プロバイダー識別子として扱う。新しいクライアントは、現在サポートされている認証プロバイダーが利用可能な場合、それを優先すべきである。

**ランタイムのローカリティ。** デーモンはブラウザを起動しない。たとえ起動できたとしてもである。クライアントが `open(verificationUri)` をローカルで呼び出すかどうかを決定する。ヘッドレスポッド（典型的な Mode B デプロイメント）では、ユーザーはブラウザを持っているデバイスで URL を開く。推奨 UX については `docs/users/qwen-serve.md` を参照。

**イベントにトークンが漏洩することはない。** `auth_device_flow_started` は `{deviceFlowId, providerId, expiresAt}` のみを運ぶ。ユーザーコードと検証 URL は、POST 201 ボディと `GET /workspace/auth/device-flow/:id` 経由でポイントツーポイントで返される。SSE でブロードキャストされることはない。

**プロバイダーごとのシングルトン。** フローが保留中の同じプロバイダーに対する 2 回目の `POST` は冪等な引き継ぎである。新しい IdP リクエストを開始するのではなく、既存のエントリを `attached: true` で返す。

#### `POST /workspace/auth/device-flow`

厳格なミューテーションゲート: トークンレスのループバックデフォルトでもベアラートークンを必要とする（`401 token_required`）。

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

- `400 unsupported_provider` — 不明な `providerId`（レスポンスに `supportedProviders` を含む）
- `409 too_many_active_flows` — ワークスペースの上限（4）に達した。`DELETE` で 1 つをキャンセルする
- `401 token_required` — 厳格なゲートがトークンレスのリクエストを拒否した
- `502 upstream_error` — IdP が予期しないエラーを返した

#### `GET /workspace/auth/device-flow/:id`

現在の状態を読み取る。保留中のエントリは `userCode/verificationUri/expiresAt/intervalMs` をエコーする。終端エントリ（5 分の猶予）はそれらを削除し、`status` とオプションの `errorKind/hint` を公開する。

不明な ID と猶予後に退去されたエントリには `404 device_flow_not_found` を返す。

#### `DELETE /workspace/auth/device-flow/:id`

冪等なキャンセル:

- 保留中のエントリ → `204` + `auth_device_flow_cancelled` を発行
- 終端エントリ → `204` no-op（イベントの再発行なし）
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

5 つの型付きイベント（ワークスペーススコープ、すべてのアクティブなセッションバスにファンアウト）:

- `auth_device_flow_started` `{deviceFlowId, providerId, expiresAt}` — POST が成功した。SDK はサブスクライブする必要がある（ここに userCode は含まれない。必要な場合は GET で取得）
- `auth_device_flow_throttled` `{deviceFlowId, intervalMs}` — デーモンがアップストリームの `slow_down` を尊重した。GET をポーリングするクライアントは間隔をこれに合わせて引き上げるべき
- `auth_device_flow_authorized` `{deviceFlowId, providerId, expiresAt?, accountAlias?}` — 認証情報が永続化された。`accountAlias` は非 PII のラベル（メール/電話番号は決して含まない）
- `auth_device_flow_failed` `{deviceFlowId, errorKind, hint?}` — 終端。`errorKind` は `expired_token | access_denied | invalid_grant | upstream_error | persist_failed` のいずれか。`persist_failed` はデーモン内部: IdP 交換は成功したが、デーモンが認証情報を永続的に保存できなかった（EACCES / EROFS / ENOSPC）。ユーザーは基盤となるディスクの状態が修正された後に 1 回再試行すべき。
- `auth_device_flow_cancelled` `{deviceFlowId}` — DELETE が保留中のエントリに対して成功した

> **MCP 非互換。** MCP 認可仕様（2025-06-18）は OAuth 2.1 + PKCE 認証コードとリダイレクトコールバックを義務付けており、ヘッドレスポッドデーモンには機能しない。Mode B のデバイスフローのサーフェスはデーモンプライベートである。MCP 準拠のサーバーをターゲットにするクライアントは別の認証パスを使用すべきである。

## ストリーミングワイヤー形式

イベントは標準の EventSource フレームとして出力される。デーモンはフレームごとに 1 つの `data:` 行を書き込む（JSON は `JSON.stringify` の後に埋め込み改行を持たない）。`packages/sdk-typescript/src/daemon/sse.ts` の SDK パーサーは受信側でそれと仕様で許可された複数 `data:` 形式の両方を処理する。

## ストリーミング中のエラーフレーム

SSE サブスクライバーにサービスを提供している間にブリッジイテレータがスローした場合、デーモンは終端の `stream_error` フレーム（`id` なし）を出力する。`data:` 行は完全なエンベロープ（このドキュメントの他のすべての SSE フレームと同じ形状）である。実際のエラーメッセージは `envelope.data.error` の下に存在する。

```
event: stream_error
data: {"v":1,"type":"stream_error","data":{"error":"<message>"}}
```

その後、接続は閉じられる。

## 環境変数

| 変数                  | 目的                                                             |
| -------------------- | ---------------------------------------------------------------- |
| `QWEN_SERVER_TOKEN` | ベアラートークン。起動時に先頭と末尾の空白が削除される。                    |

## ソースレイアウト

| パス                                                 | 目的                                                                                                          |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `packages/cli/src/commands/serve.ts`                 | yargs コマンドとフラグスキーマ                                                                                 |
| `packages/cli/src/serve/run-qwen-serve.ts`           | リスナーのライフサイクルとシグナル処理                                                                          |
| `packages/cli/src/serve/server.ts`                   | Express アプリケーションのアセンブリ、ミドルウェアの順序、および残りの直接ルート                                  |
| `packages/cli/src/serve/routes/*.ts`                 | セッション、SSE、ワークスペース認証、ワークスペースステータス、ファイルルートなど、焦点を絞った Express ルートグループ    |
| `packages/cli/src/serve/auth.ts`                     | ベアラートークン + Host 許可リスト + CORS 拒否                                                                  |
| `packages/cli/src/serve/acp-session-bridge.ts`       | spawn-or-attach、セッションごとの FIFO、およびパーミッションレジストリのための CLI ローカルなブリッジ互換性ファサード  |
| `packages/acp-bridge/src/status.ts`                  | 読み取り専用のデーモンステータスのワイヤー型 + `ServeErrorKind` + `BridgeTimeoutError` + `mapDomainErrorToErrorKind` |
| `packages/cli/src/serve/env-snapshot.ts`             | 認証情報のリダクションを含め、`process.*` の状態から `/workspace/env` ペイロードを構築する純粋なヘルパー              |
| `packages/acp-bridge/src/eventBus.ts`                | 有界非同期キュー + リプレイリング                                                                               |
| `packages/sdk-typescript/src/daemon/DaemonClient.ts` | TypeScript クライアント                                                                                        |
| `packages/sdk-typescript/src/daemon/sse.ts`          | EventSource フレームパーサー                                                                                    |
| `integration-tests/cli/qwen-serve-routes.test.ts`    | 18 ケース、LLM なし                                                                                             |
| `integration-tests/cli/qwen-serve-streaming.test.ts` | 3 ケース、ローカルのフェイク OpenAI サーバーによってバックエンドされる実際の `qwen --acp` 子プロセス（POSIX のみ。Windows ではスキップ） |

