# `qwen serve` HTTP プロトコルリファレンス

[qwen-code デーモン設計](https://github.com/QwenLM/qwen-code/issues/3803) のステージ 1。すべてのルートは、デーモンのベース URL（デフォルト `http://127.0.0.1:4170`）の下にあります。

このリファレンスでは、HTTP ルートと SSE フレーミングについて説明します。ペイロード契約、再同期理由、履歴アンカーについては [型付きイベントスキーマ](./daemon/09-event-schema.md)、配信とバックプレッシャについては [イベントバスと再生ガイド](./daemon/10-event-bus.md)、既存の `v1` プロトコルと互換性ルールについては [機能とバージョン管理](./daemon/11-capabilities-versioning.md) を併せてお読みください。完全な契約セットへのリンクは [デーモンドキュメントインデックス](./daemon/00-index.md) にあります。

## 認証 [#authentication]

デーモンが `--token` または `QWEN_SERVER_TOKEN` で起動された場合 — または、いずれも指定されずに非ループバックにバインドされた場合（一時的なベアラートークンを生成し、起動時に一度だけ表示します）— **通常のループバックバインドでは `/health` を除くすべての通常 API ルート**で次を運ぶ必要があります:

```
Authorization: Bearer <token>
```

ループバックデフォルトでトークンが設定されていない場合、ヘッダーはオプションであり、プライマリリスナー経由で到着するリクエストはフルオペレーター API 権限を持ちます。ワークスペース信頼性、セッション所有権、`X-Qwen-Client-Id`、権限、機能、検証、およびリソースチェックは依然として適用されます。トークン比較は定数時間です。401 レスポンスは `missing header` / `wrong scheme` / `wrong token` で一律です。

**`--open-with-auth`。** このデフォルトオフの CLI モードには、ループバックバインドと利用可能な Web Shell が必要です。通常の `--token`-over-`QWEN_SERVER_TOKEN` 選択を再利用するか、その選択が空の場合、デーモン起動前に base64url エンコードされた 32 ランダムバイトを生成します。ブラウザは、`#token=` 経由で選択されたベアラートークンを受信し、タブごとに保存します。プロトコルとミドルウェアは、通常の設定済みトークンとして扱います。フラグメント配信キーは解決されたトークンに基づいており、このフラグには基づきません: すべての `--open` 起動は、解決されたベアラートークン（設定済みまたは生成済み）を起動 URL の `#token=` フラグメントに添付します（ローカルユーザーは `ps` / `/proc` を介して確認できます。ランチャーが警告するように）、したがって、裸の `--open` を伴う非ループバックバインドは、生成されたベアラートークンを同じようにブラウザに渡します。このフラグの独自の貢献は、ループバックでのトークン _生成_ と、ブラウザ不適格環境での手動 URL フォールバックです。`RunHandle.resolvedToken` を無視する直接埋め込み呼び出し元のみ、およびブラウザを起動しないクライアントは、自動資格情報を受け取りません。ブラウザ不適格環境では、秘密を含むフラグメント URL が手動開き用に表示されます。ループバック `/health` と静的 Web Shell アセットは、以下で説明される免除を保持します。`--require-auth` は依然として `/health` をゲートします。

チャネル Webhook イングレス（`POST /channels/:channelName/webhooks/:source`）は、すべてのモードにおいてこのベアラート契約とは別個です。マウントされると、`bearerAuth` より前に登録され、設定済みの `x-qwen-webhook-secret` で認証します。デーモンベアラートトークンのローテーションは、Webhook ソースシークレットをローテーションしません。

**`/health` 免除** (Bctum): ループバックバインド（`127.0.0.0/8` / `localhost` / `::1` / `[::1]`）では、`/health` はベアラートミドルウェアより BEFORE に登録されるため、ポッド内のライブネスプローブは、デーモンが `--token` で起動された場合でもトークンを運ぶ必要がありません。非ループバックバインド（`--hostname 0.0.0.0` など）は、他の通常 API ルートと同様に `/health` をゲートします — 根拠については [`GET /health`](#get-health) セクションを参照してください。

**`--require-auth` (#4175 PR 15)。** このフラグを起動時に渡すと、「トークンが必要」というルールがループバックにも拡張されます。トークンソースが解決されない場合、起動は失敗します — ループバックでは、`--token`、`QWEN_SERVER_TOKEN`、または `--open-with-auth`（これらは起動前に独自に生成されたトークンをインストールするため、`--require-auth --open-with-auth` が開始します）を意味します。fail-fast はループバック限定です: 非ループバックバインドは、設定済みソースのいずれも存在しない場合に生成される一時的なベアラートークンを解決し、これがフラグを満たします。`/health` 免除はいずれの場合も削除されるため、`/health` も `Authorization: Bearer …` が必要になります。

フラグがオンの場合、グローバル `bearerAuth` ミドルウェアは **すべての通常 API ルート** — `/health` と `/capabilities` を含む — をゲートします。チャネル Webhook イングレスは独立した共有シークレット認証のままとなり、Web Shell ドキュメントおよびアセットルートは事前認証のままとなります。したがって、**未認証**クライアントは、認証が必要であることを発見するために `caps.features` をプリフライトできません: そのケースの検出表面は **401 レスポンスボディ**自体です（[認証](#authentication) セクションに従い、ベアラートゲートルート間で一律）。`require_auth` 機能タグは **認証後の確認** です — クライアントが正常に認証し `/capabilities` を読み取った後、タグの存在はデーモンが `--require-auth` で起動されたことを確認します（監査/コンプライアンス UI や、SDK クライアントが「このデプロイメントは強化されている」を設定パネルに表示するのに有用）。厳格な変更ルートは、信頼できるループバックプライマリリスナーリクエスト、ベアラート認証済みリクエスト、またはペアリングされた Local Control リクエストを受け入れます。信頼できないトークンなしの埋め込みは依然として `401 { code: "token_required", error: "…" }` を受け取ります。`--require-auth` では、グローバルベアラートミドルウェアが最初にレガシーな `Unauthorized` ボディで拒否します。

**`--allow-origin <pattern>` (T2.4 [#4514](https://github.com/QwenLM/qwen-code/issues/4514))。** デーモンにクロスオリジンでアクセスするブラウザクライアントはデフォルトでブロックされます — `Origin` ヘッダーを持つリクエストは `403 {"error":"Request denied by CORS policy"}` を返します。これは、CLI/SDK クライアントが `Origin` を送信せず、デーモンはその存在を、オペレーターがオプトインしていないブラウザコンテキストから来たリクエストの兆候として扱うためです。トークンを持つ非ループバックバインドでは、壁の前に一つの例外があります: 同一オリジンリクエスト（`Origin` がダイレクトソケットスキームと正規化された `Host` オーソリティの合計と等しい）はベアラート認証され、その `Origin` は **プライマリリスナー上**で除去されます — 有効なベアラートがある場合はルート自身のステータスが従われ、ベアラートがないか無効な場合は `401` となりますが、**事前認証の Web Shell ドキュメント、`/assets/*`、`/manifest.webmanifest`、`/sw.js`、および `/mcp-app-sandbox` ルートを除きます。これらは他のすべてのモードと同様に資格情報なしで提供されます** — そして、クロスオリジンまたは一致しない `Origin` 値のみが `403` エンベロープを保持します。起動時に `--allow-origin <pattern>`（繰り返し可能）を渡すと、壁の代わりに許可リストをインストールします。各パターンは次のいずれかです:

- リテラルな `*` — あらゆる送信元を許可します。**リスクあり**: `*` が設定されているのにベアラートークンが解決されない場合、起動は拒否されます。ガードは _解決済み_ のトークン — `--token`、`QWEN_SERVER_TOKEN`、`--open-with-auth` で生成されるループバックトークン、または設定されたソースがない場合に非ループバインドで生成される一時的なベアラートークン — を読み取るため、この拒否はループバック限定です。起動時のブレットクラムは、`*` がリストに含まれている場合に stderr へ警告を出力します。**推奨事項**: ループバインドでは `--require-auth` と組み合わせて使用し、`/health` もベアラートークンで保護されるようにしてください。デフォルトではループバック上でベアラミドルウェアより前に登録されるため（k8s/Compose プローブがトークンなしで到達可能）、`*` の許可リストにより任意のクロスオリジンブラウザから到達可能になります。`--require-auth` でも Web Shell の静的アセット（`/`、`/assets/*`、`/manifest.webmanifest`、`/sw.js`、および `/session/:id`、`/plugins`、`/channels`、`/live`、`/scheduled-tasks`、`/goals`、および `/settings` ドキュメントナビゲーション）は設計上ループバック上で認証前アクセスが可能であり、ベアラミドルウェアより前にマウントされるため、`*` の許可リスト下では任意のクロスオリジンブラウザから読み取り可能です。`--no-web` はその表面を除去します。非ループバインドでは、ベアラートークンは起動時に必須であり、`/health` はその背後に配置されています。通常の API ルートはベアラートークンで保護され、チャネル Webhook インバースは独自の共有シークレットゲートを維持し、Web Shell の静的アセット（`/`、`/assets/*`、`/manifest.webmanifest`、`/sw.js`、および `/session/:id`、`/plugins`、`/channels`、`/live`、`/scheduled-tasks`、`/goals`、および `/settings` ドキュメントナビゲーション）は `--no-web` によって除去されない限り認証前アクセスのままです。
- 正規化された URL オリジン — `<scheme>://<host>[:<port>]`。**末尾スラッシュなし、パスなし、ユーザー情報なし、クエリなし。** エントリが往復検証 `new URL(pattern).origin === pattern` に失敗した場合、起動は `InvalidAllowOriginPatternError` で拒否されます。エラーメッセージには不正なパターンと正規形式が記載されます。意図的な厳格性: 暗黙的な正規化（例: 末尾の `/` のトリミング）は誤字を見逃し曖昧な入力を許容してしまいます。解決済みのトークンがない場合 — 生成後はループバインドを意味します — HTTP(S) エントリはループバックホストに限定されます。非ループバックブラウザオリジンは、デーモンユーザーとしてのコード実行を含む完全なオペレーター API を駆動できる可能性があるため、トークンが必要です。明示的なブラウザ拡張機能のオリジンは、既存のトークン不要なローカル自動化パスを維持します。起動時、トークン不要で許可されたブラウザオリジンに付与される権限がログに記録されます。

マッチしたオリジンはすべてのリクエストに対して標準的な CORS レスポンスヘッダーを受け取ります:

```
Access-Control-Allow-Origin: <echoed origin>
Vary: Origin
Access-Control-Allow-Methods: GET, POST, PUT, PATCH, DELETE, OPTIONS
Access-Control-Allow-Headers: Authorization, Content-Type, X-Qwen-Client-Id, Last-Event-ID, X-Qwen-Event-Epoch
Access-Control-Max-Age: 86400
Access-Control-Expose-Headers: Retry-After, X-Qwen-Event-Epoch, X-Qwen-SSE-Stream-Id
```

`Access-Control-Allow-Origin` は、リクエストのオリジンをそのまま（ブラウザが送信した大文字小文字のまま）エコー返し、リテラルな `*` を返しません。`*` パターン下でも同様です。ブラウザキャッシュはこれと `Vary: Origin` をペアにしてレスポンスをキー付けするため、エコー返しによりスキーマ変更なしで将来のリリースで `Access-Control-Allow-Credentials` を追加する余地が残ります。公開ヘッダーにより、ブラウザクライアントは再試行ヒントに従い、SSE エポックを保持し、受け入れられた物理ストリームを相関させることができます。`Access-Control-Allow-Credentials` は現在 **送信されません**。設定されたデーモン資格情報は `Authorization` 内のベアラートークンを使用しており、`credentials: 'include'` なしでクロスオリジン動作が可能です。信頼できるループバック権限にはブラウザ資格情報が不要です。

OPTIONS プリフライトリクエスト（`Access-Control-Request-Method` または `Access-Control-Request-Headers` を伴う OPTIONS）は、`204 No Content` と上記ヘッダーで短絡応答します。これは慣例的な CORS パターンであり安全です。プリフライトはデーモンが受け入れるメソッド/ヘッダーを確認するのみで、実際の後続リクエストは Host ゲートを実行し、その後状態を読み書きする前にベアラートークン/リスナー権限またはチャネル Webhook 共有シークレットゲートを通ります。マッチしたオリジンからの通常の OPTIONS リクエストは、CORS ヘッダー付きで下流へ流れ続けます。

許可リストに一致しないオリジンも `403 {"error":"Request denied by CORS policy"}` を取得します。デフォルトの壁と同じエンベロープのため、すでに壁のレスポンスを解析しているクライアントは許可リスト展開済みデーモンを特別扱いする必要がありません。拒否パスは **`Access-Control-*` ヘッダーを発行しません**（ブラウザは無視し、発行するとヘッダーの有無を通じて許可リストサイズを間接的に通知してしまうため）。

設定されたパターンリストは意図的に `/capabilities` にエコーされません。ブラウザクライアントは自身のオリジンを既に知っており（結局のところデーモンを呼び出したのは自分自身なので）、リストを開示すると未認証の `/capabilities` 読者がすべての信頼できるオリジンを列挙できてしまいます（誤設定された展開に対する有用な偵察情報となります）。SDK クライアントは「このデーモンはクロスオリジンブラウザヒットを尊重する」ことを判断するために `caps.features.allow_origin` タグでゲート制御を行い、具体的なオリジンを知らなくても済みます。

ループバック自己オリジンリクエスト（例: 同じ `127.0.0.1:port` でデーモンを呼び出す Web Shell）は、CORS ミドルウェアより **前に** 実行される別の Origin-strip シムによって処理され、`127.0.0.1:port` / `localhost:port` / `[::1]:port` / `host.docker.internal:port` または正確にバインドされたループバックアドレスとポートに対して `Origin` ヘッダーを削除します。また、ブラウザがデフォルトポートに対して送信するスキーム一致のポートなし形式も受け入れます: ポート 80 では `http://host`、ポート 443 では `https://host` です。これらのリクエストは `--allow-origin` の設定に関係なく通過します。オペレーターは Web Shell を動作させるためにデーモンの自身のポートをリストする必要はありません。

## 一般的なエラー形状

5xx レスポンスには、存在する場合元のエラーの `code` と `data` が含まれます（JSON-RPC スタイル — ACP SDK はエージェントから `{code, message, data}` を転送します）:

```json
{
  "error": "Internal error",
  "code": -32000,
  "data": { "reason": "model quota exceeded" }
}
```

リクエストボディ内の不正な JSON は以下を返します:

```json
{ "error": "Invalid JSON in request body" }
```

ステータス `400` で。

不明なセッション ID に対する `SessionNotFoundError` は以下を返します:

```json
{
  "error": "No session with id \"<sid>\"",
  "sessionId": "<sid>",
  "code": "session_not_found"
}
```

ステータス `404` で。同時クローズは `code: "session_closing"` を使用します。

`cwd` が登録済みワークスペースに正規化されない `POST /session` に対する `WorkspaceMismatchError` は、以下とともに `400` を返します:

```json
{
  "error": "Workspace mismatch: daemon is bound to \"…\"",
  "code": "workspace_mismatch",
  "boundWorkspace": "/path/the/daemon/uses/as-primary",
  "requestedWorkspace": "/path/in/the/request"
}
```

これを事前検出に使用してください: `/capabilities` から `workspaceCwd` を読み取り、`POST /session` から `cwd` を省略します（プライマリワークスペースにフォールバックします）。または `multi_workspace_sessions` がアドバタイズされている場合は `workspaces[].cwd` のいずれかを選択します。

デーモンの `--max-sessions` 上限を超えた `POST /session` は、`Retry-After: 5` ヘッダーと以下とともに `503` を返します:

```json
{
  "error": "Session limit reached (20)",
  "code": "session_limit_exceeded",
  "limit": 20,
  "scope": "workspace"
}
```

有効なデーモン全体の合計上限が新しいセッションを拒否する場合 — `--max-total-sessions`、または `limits.maxTotalSessions` の下に説明されているデフォルト — 同じレスポンス形状が `"scope": "total"` とともに返されます。

既存セッションへのアタッチは上限にカウントされないため、アイドル状態のデーモンの再接続は容量限界時でも動作し続けます。

ACP チャネル初期化予算が `newSession` のディスパッチ前に期限切れになる場合、`POST /session` は `Retry-After: 5` と以下とともに `504` を返します:

```json
{
  "error": "AcpSessionBridge initialize timed out after 10000ms",
  "code": "init_timeout",
  "errorKind": "init_timeout",
  "retryable": true,
  "sideEffectPossible": false,
  "phase": "channel.initialize",
  "timeoutMs": 10000
}
```

`timeoutMs` — および `error` の数値サフィックス — はデーモンの設定済み `--initialize-timeout-ms` 予算を反映します（上記の値はデフォルトです）。上記の完全な安全再試行形状は、チャネル初期化が永続的変更に先行する単純なセッション作成の場合のみ出力されます。そのパスでは、初期化が ACP `newSession` リクエストに先行するため `sideEffectPossible: false` フィールドが権威を持ち、この構造化契約を理解するクライアントは重複セッションのリスクなくアドバタイズされた遅延後に再試行できます。

`branch` または `worktree` を伴うリクエスト、および単純な作成以外のミューテーションを含むルートによって生じる初期化タイムアウト（例えば、コミット済みのフォークが失敗したハンドシェイクより長く存続しうる `POST /session/:id/branch` や `POST /session/:id/side-task` など）は、同じ `504` を `code: "init_timeout"`、`phase`、および `timeoutMs` とともに返しますが、`Retry-After`、`retryable`、または `sideEffectPossible` は含みません。これらの場合、ミューテーションの結果は不明です：ブランチとワークツリーの準備はチャネルの初期化前に git を変更するため、失敗時に試行されるロールバックはベストエフォートであり（チェックアウトのロールバックに失敗するとワークスペースは新しいブランチに残り、再試行でブランチが既に存在する競合が発生する可能性があります）、すべての 5xx ミューテーション応答を曖昧として分類するクライアントは保守的にフェイルクローズのままとなり、縮小された形状にも同じポリシーを適用すべきです。`POST /session/:id/load` と `POST /session/:id/resume` は、復元リクエストがディスパッチされる前（`ensureChannel` ステージ）にチャネル初期化がタイムアウトした場合、同じ縮小された `init_timeout` `504` を生じます。それらの Errors リストに記載されている `session_restore_timeout` `504` とは異なり、この形状には `Retry-After` なし、`retryable` なし、そして復元がディスパッチされなかったためフェンスもインストールされません。`POST /session` における `newSession` ディスパッチタイムアウトは例外です：これは `504` を `code: "init_timeout"`、`retryable: true`、および予算から導出された `Retry-After` とともに返しますが、`phase` や `sideEffectPossible` は含まれません。なぜなら作成結果が曖昧だからです。他のすべてのタイムアウトラベルは汎用マッピングを維持します。

`RestoreInProgressError` — 他の登録がその ID を既に所有している場合に `POST /session/:id/load`、`POST /session/:id/resume`、または呼び出し元提供 ID の `POST /session` によって生成されます — `409` と以下を返します：

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

ID が既に進行中の `session/resume` を持っている場合（またはその逆の場合）、または呼び出し元提供 ID のスポンがどちらかの復元方向と競合する場合に `session/load` が発行されると発生します。少なくとも `Retry-After` 秒待ってから再試行してください。同じアクション間の競合（`load` vs `load`、`resume` vs `resume`）は、復元がアクティブな間はエラーとする代わりに結合されます。

`reason` はこのコードを共有する 2 つのフェンスを区別し、`Retry-After` ヘッダーがそれを追跡します：

| `reason` | 意味 | `Retry-After` |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------ |
| `restore_in_progress` | 通常の復元が実行中です。 | `5`（`session_limit_exceeded` に一致） |
| `awaiting_abandoned_cleanup` | 公開呼び出し元がすでにタイムアウトを受け取っており（復元の場合は `504`、セッション初期化の場合は `init_timeout`）、キャンセル不可の ACP リクエストとそのクリーンアップはまだ完了していません。 | タイムアウトした操作の予算（秒単位）— 復元、または呼び出し元提供 ID のスポンの場合は初期化 — `5`–`120` にクランプされます |

公開復元リクエストは `limits.sessionRestoreTimeoutMs`（デフォルト 60 秒）によって管理されます。`504` の後、遅延した ACP リクエストとクリーンアップが完了するまで ID はフェンスされたままとなるため、通常の 5 秒間隔で再試行を続けるクライアントはクリアできない 409 に対してスピンすることになります。`awaiting_abandoned_cleanup` とともに提供される予算から導出されたヒントに従ってください。

`SessionWorkspaceConflictError` — リクエストされた `cwd` が登録済みワークスペース 1 つを対象としているにもかかわらず、同じセッション ID が別のランタイムによって既にライブであるか復元中の場合に `POST /session/:id/load` と `POST /session/:id/resume` によって生成されます — 以下とともに `409` を返します：

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

クライアントは所有ワークスペースで再試行するか、異なるワークスペースに ID を復元する前に進行中の復元が完了するのを待つべきです。同じワークスペース内の復元競合は引き続きブリッジの `restore_in_progress` / 結合動作を使用します。

`SessionArchivedError` は、JSONL が `chats/archive/` 下にあるセッションを読み込みまたは再開しようとしたときに生成されます：

```json
{
  "error": "Session \"<sid>\" is archived. Unarchive it before loading.",
  "code": "session_archived",
  "sessionId": "<sid>"
}
```

ステータス `409` で。

`SessionArchivingError` は、同じ ID に対するセッションアーカイブまたはアーカイブ解除の遷移が既に進行中のときに生成されます：

```json
{
  "error": "Session \"<sid>\" is being archived or unarchived; retry later.",
  "code": "session_archiving",
  "sessionId": "<sid>"
}
```

ステータス `409` と `Retry-After: 5` で。

## 機能 [#capabilities]

デーモンは、serve 機能レジストリからサポートされている機能タグを通知します。クライアントは UI の制御を `mode` ではなく `features` で **必ず** ゲートする必要があります（設計書 §10 に準拠）。

```
['health', 'capabilities', 'session_create', 'session_startup_config', 'session_id_override', 'session_scope_override',
 'session_load', 'session_resume', 'session_transcript',
 'unstable_session_resume',
 'session_list', 'session_catalog_batch', 'session_info', 'session_prompt', 'session_mid_turn_message_mutation',
 'session_mid_turn_send_now',
 'session_cancel', 'session_events',
 'slow_client_warning', 'typed_event_schema',
 'session_set_model', 'client_identity', 'client_heartbeat',
 'session_permission_vote', 'permission_vote', 'workspace_mcp', 'workspace_skills',
 'workspace_skills_config_runtime',
 'workspace_providers', 'workspace_acp_preheat', 'workspace_acp_status',
 'auth_provider_install', 'workspace_memory',
 'workspace_agents', 'workspace_agent_generate', 'workspace_env',
 'workspace_preflight', 'session_context', 'session_context_usage',
 'session_supported_commands', 'session_tasks', 'scheduled_task_gate', 'autofix_pr_watches', 'session_monitor_tool_correlation', 'session_stats',
 'session_lsp', 'session_resources', 'session_status',
 'session_close', 'session_metadata', 'session_organization',
 'session_archive', 'mcp_guardrails',
 'workspace_mcp_manage', 'mcp_guardrail_events',
 'mcp_server_runtime_mutation',
 'workspace_file_read', 'workspace_file_bytes', 'workspace_file_write',
 'workspace_file_upload', 'workspace_file_delete', 'workspace_directory_create', 'workspace_directory_delete',
 'session_approval_mode_control', 'workspace_tool_toggle',
 'workspace_skill_settings_toggle', 'workspace_skill_settings_batch_toggle',
 'workspace_session_refresh',
 'extension_batch_activation_v2', 'extension_activation_explicit_refresh',
 'extension_state',
 'workspace_settings', 'workspace_init', 'workspace_mcp_restart',
 'session_recap', 'session_generation', 'session_btw', 'session_btw_stream', 'session_shell_command',
 'standalone_sessions_v1', 'standalone_session_options_v1',
 'mcp_workspace_pool', 'mcp_pool_restart',
 'require_auth', 'allow_origin', 'auth_device_flow',
 'permission_mediation', 'prompt_absolute_deadline', 'writer_idle_timeout',
 'non_blocking_prompt', 'session_language', 'user_language_sync', 'session_message_deletion', 'session_rewind',
 'workspace_hooks', 'session_hooks', 'workspace_extensions',
 'session_branch', 'rate_limit', 'workspace_reload', 'workspace_model_reload', 'channel_delivery',
 'multi_workspace_sessions', 'multi_workspace_session_rewind',
 'multi_workspace_session_shell', 'persistent_workspace_registration',
 'workspace_display_name', 'workspace_runtime_removal', 'workspace_runtime',
 'workspace_qualified_rest_core', 'workspace_qualified_voice',
 'workspace_qualified_memory', 'extension_management_v2', 'extension_git_credentials',
 'extension_local_path_install',
 'workspace_persisted_transcript',
 'workspace_session_export', 'workspace_archived_session_export',
 'workspace_session_live_state', 'workspace_session_live_state_batch',
 'client_mcp_over_ws', 'cdp_tunnel_over_ws', 'browser_automation_mcp']
```

> 条件付きタグは、そのデプロイメントまたはランタイム可用性条件が満たされた場合のみ表示されます（以下の表を参照）。F3 の `permission_mediation` タグは常にオンであり、SDK クライアントがビルドでサポートされるセットを内省できるように `modes: ['first-responder', 'designated', 'consensus', 'local-only']` を伴います。ランタイムアクティブ戦略は `body.policy.permission` にあります。

`session_startup_config` は、通常およびスタンドアロン作成でのオプションの `startupConfig: { modelServiceId, reasoningEffort? }` を広告します。このタグを必ずプリフライトしてください：古い通常作成ルートはオブジェクトを黙って無視する場合があります。`modelServiceId` は必須です（1～256 文字）；`reasoningEffort` は、選択されたモデルがサポートする場合、`none`、`default`、`low`、`medium`、`high`、`xhigh`、または `max` を受け入れます。省略時はモデルのみが適用され、推論セッターや暗黙的な `default` はありません。このオブジェクトはレガシーのトップレベル `modelServiceId` や明示的な単一スコープと組み合わせることはできず、新しいスレッドを示唆します。起動時には共有デフォルトは保存されません；後のセッション動作は変わりません。

成功には `modelApplied: true` と `startupConfigApplied: { modelServiceId, reasoningEffort?, effectiveReasoning? }` が含まれます。モデルセレクターは正規化されています。明示的な推論リクエストのみが 2 つの推論フィールドを含みます；有効な状態は `{ state: 'disabled' }`、`{ state: 'provider-default' }`、または `{ state: 'enabled', effort? }` です（トグルのみの推論には effort がありません）。無効な構造は `400 invalid_startup_config` です；拒否または未確認の選択は `422 startup_config_rejected` です。確定的なスタンドアロン拒否は、所有する記録をロールバックし、空の出力ディレクトリの破棄を試みた後に返却します；削除を確認できない記録ロールバックと過渡的な起動失敗は `standalone_creation_outcome_unknown` を保持しますが、ディレクトリ破棄の失敗はログに記録されるのみで、確定的な拒否は依然として返却されます。SDK における成功ボディの確認失敗はプロトコルエラーであり、回復したセッションを採用するための指示ではありません。

`session_scope_override` は、`POST /session` 上のリクエストごとの `sessionScope` フィールドのネゴシエーションハンドルです（以下を参照）。古いデーモンはこのフィールドを黙って無視するため、SDK クライアントはこのフィールドを送信する前にこのタグについて `caps.features` をプリフライトすべきです。

`session_id_override` は、`POST /session` および ACP `session/new` メタデータにおけるオプションの呼び出し元提供 `sessionId` のネゴシエーションハンドルです。クライアントは、古いデーモンがこのフィールドを黙って無視する可能性があるため、このフィールドを送信する前に `caps.features` にこのタグが含まれていることを確認しなければなりません。

`persistent_workspace_registration` は、ランタイム時に追加されたワークスペースに対する永続的登録を広告します。`POST /workspaces` は `{ "cwd": "/absolute/path", "persist": true }` を受け入れ、成功には `persisted: true` が含まれます。登録はユーザーの Qwen ホーム下のデーモンの正規主ワークスペースにスコープされ、次回のデーモン起動時に復元されます。`persist` を省略するとプロセスローカル登録が保持されます。`GET /workspace-registrations` は保存された希望セットを一覧表示し、`DELETE /workspace-registrations/:id` はアクティブなランタイムをホット除去せずに次回再起動のためのエントリーを忘れます。

`workspace_display_name` は、`POST /workspaces` へのオプションの `displayName` 入力、`PATCH /workspaces/:workspace` を通じたワークスペースメタデータ更新、およびワークスペースプロジェクション内のオプションの表示名フィールドを広告します。名前は検索やルーティングに関与しません：`id` と正規 `cwd` が唯一のセレクターとして残り、重複名が許可されます。

`workspace_runtime_removal` は `DELETE /workspaces/:workspace` を介して同期ホット除去を通知します。Capability workspace エントリにはオプションの `removable` が追加されます。除去できるのは `removable: true` を持つ行のみです。除去により、ランタイムの永続的な登録エイリアスはすべて破棄されますが、ファイル、設定、トランスクリプト、アーカイブは削除されません。

`workspace_runtime` は `GET /workspace/runtime/status`、`POST /workspace/runtime/ensure`、およびそれらの `/workspaces/:workspace/runtime/...` 相当を通知します。`ensure` は capability の選択を受け付けません。これは、選択された信頼できるワークスペースの ACP ランタイムを開始または再利用し、そのライフサイクル状態と単調増加するランタイムエポックを返します。プライマリルートはプライマリライトタイムのみが所有します。修飾付きルートは、選択された登録済みランタイムのみを解決し、フォールバックすることはありません。ensure が成功すると、ランタイムの 10 分間の keepalive ウィンドウが更新されます。ステータスは読み取り専用であり、子プロセスを開始することはありません。並行する ensure は 1 つの物理的な起動を共有します。起動中または失敗時は、再試行可能な `503 runtime_still_starting` または `503 runtime_initialization_failed` が返されます。capability の準備は、ensure の観測予算が期限切れになった後も継続される場合があります。その場合、ensure は依然としてライブランタイムを返し、ステータスポーリング用に非 ready な capability 状態を示します。この capability は、すべてのアクティブなランタイムブリッジが権威あるライフサイクルスナップショットを提供する場合にのみ通知されます。選択されたレガシー注入ブリッジは、推測された状態やエポックの代わりに `501 workspace_runtime_not_supported` を返します。

`workspace_runtime_stop` は、ユーザー確認済みのランタイム停止を独立して通知します。`GET /workspaces/runtime-stop-options` は読み取り専用のプロセスグローバルプレビューであり、コミットされた子プロセス数、モデル化された子プロセス上限、各可視ワークスペースのセッション、ブロック理由、チャネル ID、エポック、現在の停止トークン、最新の領収書を含みます。通常のロード済みセッションは明示的に停止できますが、独立した ACP クライアント、有効なスケジュール、保留中のスケジューラー/管理/開始作業、メモリタスク、ワーカー、音声、特殊目的ランタイムはブロックされます。`POST /workspaces/:workspace/runtime/stop` は厳格な変更ゲートを使用し、選択された信頼できるランタイムのみを対象とします。プレビューから `confirmInterruptions: true`、`expectedChannelId`、`expectedRuntimeEpoch`、`expectedStopToken` および正確な `expectedSessionIds` を送信してください。プライマリライトタイムへのフォールバックは絶対に行わないでください。プレビューとすべての領収書には、ランタイムのライブ ACP チャネルが `channels`（`channelId`、`runtimeEpoch`、オプションの `executionEngine`）としてリストされます。ランタイムは実行エンジンごとに 1 つのチャネルを持つことができ、停止操作はそれらすべてをカバーします。`channelId` は最初にリストされたチャネルを指し、`runtimeEpoch` は最後にリストされたエポックであるため、プレビュー後に開始されたチャネルがあると確認情報が古くなります。

応答が成功した場合、承認されたセッションクローズと、リストされたすべての子プロセスのプロセスレジストリ解放の後、`state: "stopped"`、`stopped: true`、`released: true` が含まれます。登録、ファイル、保存された履歴は保持されます。応答には、影響を受けたセッション ID、中断されたセッション ID、クローズされたセッション ID、残りのセッション ID が含まれます。古いまたはブロックされた確認情報は HTTP 409（`workspace_runtime_stop_stale` / `workspace_runtime_stop_blocked`）です。部分的なクローズは 409 `workspace_runtime_stop_incomplete` です。進行中のティアダウン、または解放が証明されていない失敗したティアダウンは 503 `workspace_runtime_stop_in_progress` / `workspace_runtime_stop_failed` です。サポートされていない管理操作は 501 `workspace_runtime_stop_not_supported` です。後でレジストリ解放が証明されたクリーンでないティアダウンは、エラー警告付きで 200 を返す場合があります。未確認のセッションフラッシュは、依然として部分結果/エラー結果を返します。観測/クローズの総予算は 60 秒です。セッションクローズがまだ実行中に予算が期限切れになった場合、応答は `state: "failed"` と `503 workspace_runtime_stop_failed` で確定し、クリーンアップは別個に継続されます。呼び出し元が失敗を受信したとしても、選択されたワークスペースは分離されたままになり、実際のクリーンアップ完了までその子プロセスはカウントされ続けます。読み取り専用オプションは、承認されたクローズと証明された解放の後に `stopped` を報告するか、永続化が未確認の場合に `incomplete` を報告することがあります。すでに返された失敗スナップショットは変化しません。セッションクローズの間で予算が使い果たされた場合、応答は `state: "incomplete"` と `409 workspace_runtime_stop_incomplete` で確定します。これ以上クローズや強制キルは開始されず、停止のアドミッションガードは解放されます（生存している子プロセスは通常どおりカウントされ続けます）。残りのセッションを停止するには、新しいプレビューと確認情報が必要になります。フラッシュ拒否は、残りのセッションを強制キルすることで回避できません。ルート終了やグローバルプロセス数の減少だけでは、選択された子プロセスの解放は確立されません。Windows では、レジストリが子孫プロセスグループを追跡しないため、ルートの確定した終了が解放の証拠となります。したがって、`released: true` はそこではプロセスツリーが消滅したことを証明しません。

最後に消費されたトークンの繰り返し確認により、同じ操作が観測されます。新しい確認情報により、不完全な停止を再試行でき、トークンはローテーションされます。その後、以前に消費された古いトークンは無効になります。応答が失われた場合、別のターゲットを停止するのではなく、オプションを読み取り、ワークスペースと停止トークンによって最新の領収書を照合してください。領収書は、除去、信頼関係の変更、デーモン/ブリッジの再作成後に利用できなくなる場合があります。存在しない場合は結果が不明となり、継続を許可することはありません。SDK の `runtimeStopOptions()` と `workspaceById(id).stopRuntime(confirmation)` は、ACP トランスポートを使用していても REST を使用し、POST を自動的に繰り返すことはありません。セッションサブスクライバーは、`reason: "client_close"` と `cause: "workspace_runtime_stop"` を含む `session_closed` を受信します。致命的な停止関連の終了は、さらに `persistenceUnconfirmed: true` をマークします。更新された Web Shell クライアントは、保存された選択/トランスクリプトを保持し、明示的な Resume を待ちます。これは永続的なサスペンションではなく、一度限りの停止です。イベントを見逃したクライアントは、容量を再び競う可能性があります。

ランタイムステータスと ensure 応答はこの形式を使用します:

```json
{
  "v": 1,
  "workspaceCwd": "/work/project",
  "state": "active",
  "runtimeLive": true,
  "runtimeEpoch": 4,
  "capabilities": {
    "skills": {
      "state": "ready",
      "revision": 2,
      "runtimeEpoch": 4
    }
  }
}
```

ワークスペースランタイムに複数の実行エンジンがある場合、`runtimeLive` と `runtimeEpoch` はワークスペース制御（MCP と Skills）を提供するチャネルを記述します。そのチャネルがライブである間、他のエンジンの開始または終了によってそれらは変化しません。`state` は、そのチャネルがライブでない場合、それを `cold`、`starting`、または `stopping` として報告します。`active` と `idle` はすべてのエンジンでの作業をカウントします。

`capabilities.skills.state` は `not_started`、`starting`、`ready`、`stale`、または `error` です。失敗時には `capabilities.skills.error` に `{code, message}` が含まれます。Skills カタログは、トップレベルと capability の `runtimeEpoch` 値が一致する場合にのみ最新の状態です。`revision` は 1 つのランタイムエポック内で Skills の準備順序を示し、エポック間で比較してはいけません。

`workspace_skills_config_runtime` は、`/workspace/{config,runtime}/skills` と `/workspaces/:workspace/{config,runtime}/skills` の下で分割された Skills 読み取りと設定変更を通知します。Web Shell は、Skills 管理のためにこれらのルートを使用し、新しいセッションを作成する際に、一致するエポックのランタイムカタログで置き換える直前に、設定からスラッシュコマンドを埋めるために使用します。この機能が存在しない場合、クライアントはレガシー Skills ルートを引き続き使用する必要があり、Skills のためだけにランタイム ensure を呼び出してはいけません。

`session_load` と `session_resume` は、明示的な復元ルート（`POST /session/:id/load` と `POST /session/:id/resume`）を通知します。古いデーモンはこれらのパスに対して `404` を返すため、SDK クライアントは呼び出す前に `caps.features` をプリフライトすべきです。`unstable_session_resume` は、基盤となる ACP メソッドが `connection.unstable_resumeSession` と呼ばれていた時期に出荷された SDK との互換性のため、非推奨のエイリアスとして引き続き通知されます。新しいクライアントは `session_resume` でゲート処理を行うべきです。

`limits.sessionRestoreTimeoutMs` が存在する場合、これは基盤となる ACP `loadSession` / `unstable_resumeSession` リクエストに対するデーモンの実時間予算です。これは v1 で追加されたフィールドです。TypeScript SDK はクライアント側に 10 秒の余裕を持たせ、Web Shell のウォッチドッグは 15 秒の余裕を持たせます。古いバージョンのデーモンと通信するクライアントは、それぞれ 70 秒と 75 秒を使用すべきです。

`session_transcript` は `GET /session/:id/transcript` を広告します。これは永続化されたアクティブセッションの JSONL に対する読み取り専用でページング可能な再生ビューです。これは `/load` とは異なります。クライアントをアタッチせず、ライブ EventBus にシードせず、ライブセッションを作成せず、ライブ再生ウィンドウを変更しません。クライアントは、長いセッションに対して完全なディスク上のトランスクリプトが必要な場合にこれを使用し、コールド UI 復元中の制限付きライブ再生には `/load` のみを引き続き使用してください。

`workspace_persisted_transcript` は `GET /workspaces/:workspace/session/:id/transcript` を広告します。これはデーモンローカルで永続化のみを対象とするページャであり、ACP を起動せず、ライブブリッジ状態を照会せず、設定を読み込まず、プロジェクト機能を検出せず、レガシーな永続化カーソルキーを作成しません。信頼できる単一ワークスペースプライマリが複数形ルートを使用できるため、このタグは無条件です。ワークスペースごとの信頼性認可はすべてのリクエストで引き続き評価されます。登録された信頼できないセカンダリワークスペースは読み取り可能ですが、信頼できないプライマリは拒否されたままです。

`workspace_session_export` は `GET /workspaces/:workspace/session/:id/export` を広告します。これは選択されたワークスペースのアクティブな永続化セッションに対する信頼限定の完全エクスポートです。これは `session_export` および `workspace_qualified_rest_core` とは独立しています。リリース済みのデーモンは両方の古いタグを広告できますが、複数形ルートを実装していない場合があるため、クライアントはこのタグを直接プリフライトする必要があります。信頼できる単一ワークスペースプライマリは ID または cwd によってルートを使用できるため、このタグは無条件です。エクスポートはライブオーナーを解決せず、ACP を起動せず、クライアントをアタッチせず、他のワークスペースへのフォールバックを行いません。

`workspace_archived_session_export` は `GET /workspaces/:workspace/session/:id/archive/export` を広告します。これは選択されたワークスペースのアーカイブ済み永続化ストレージからの信頼限定の完全エクスポートです。これは `workspace_session_export` および `workspace_qualified_rest_core` とは独立しており、クライアントはこのタグを直接プリフライトする必要があります。異なるルートが存在することで、古いデーモンがアーカイブの意図を無視して同じ ID のアクティブなトランスクリプトを返すことを防ぎます。

`workspace_session_live_state` は `GET /workspaces/:workspace/sessions/live-state` を広告します。これは選択されたワークスペースランタイムのライブセッションおよびメモリ内カタログバージョンの信頼限定かつメモリ専用のスナップショットであり、クライアントに完全な永続化カタログのリロードがいつ正当であるかを通知します。これは `workspace_qualified_rest_core` とは独立しています。リリース済みのデーモンはより広範なワークスペース REST 機能を広告できますが、このルートを実装していない場合があるため、クライアントはこのタグを直接プリフライトする必要があります。信頼できる単一ワークスペースプライマリは ID または cwd によってルートを使用できるため、このタグは無条件です。ワークスペースごとの信頼性チェックはすべてのリクエストで引き続き適用され、このルートは寛容な信頼できないセカンダリの永続化カタログ読み取りポリシーをライブブリッジ状態に拡張しません。このタグはエンドポイントが存在することを意味しますが、すべてのライブ項目がオプションの `updatedAt` アクティビティウォーターマークを持つことを保証するものではありません。これはライフサイクルに依存します。

`workspace_session_live_state_batch` は `POST /sessions/live-state` を広告します。クライアントはバッチポーリングの前に一度だけこれをプリフライトし、古いデーモンに対しては単一ワークスペースルートを保持します。バッチは単一ワークスペースルートと同じ信頼限定、メモリ専用スナップショットおよびカタログバージョンの意味論を使用します。

オプションのトップレベルフィールド `/capabilities` `sessionLiveStatePollIntervalMs` は、ミリ秒単位のデーモン全体のライブ状態ポーリング間隔を広告します。これはワークスペース環境オーバーレイとは独立して、起動環境変数 `QWEN_SESSION_LIVE_STATE_POLL_INTERVAL_MS` から一度だけ解決されます。`1000` から `2147483647` までの整数値が受け入れられます。欠落または無効な値の場合は `5000` が使用されます。Web Shell はすべてのワークスペースライブ状態ポーリングでこのヒントを消費し、古いまたは互換性のないデーモンからフィールドが欠落または無効な場合にも `5000` にフォールバックします。このフィールドは、ルートのスナップショット意味論、即時のローカル/可視性リフレッシュ、または完全カタログポーリングを変更しません。SDK クライアントは独自のタイマーに対する責任を引き続き持ちます。

`slow_client_warning` は SSE バックプレッシャー動作をカバーします: (a) デーモンは、サブスクライバーのライブフレームバックログまたはライブシリアライズバイトバックログが 75% 以上になったときに、オーバーフローエピソードごとに一度だけ `slow_client_warning` 合成イベントストリームフレームを発行します（両方の測定値が 37.5% 未満まで排水された後に再武装されます）; (b) `GET /session/:id/events` は、大きな再生リングに対するコールド再接続時にサブスクライバーごとのフレームバックログを事前サイズ指定するための `?maxQueued=N` クエリパラメータ（範囲 `[16, 2048]`）を受け入れます。シリアライズバイト上限はデーモン所有です（デフォルトではサブスクライバーあたり **2 MiB**）、ライブ専用であり、意図的にクエリパラメータがありません。デーモン全体のリングサイズは `--event-ring-size` によって制御されます（デフォルト **8000**、#3803 §02 参照）。古いデーモンは警告/クエリ動作を黙って欠如しているため、オプトインする前にこのタグをプリフライトしてください。

`typed_event_schema` は SDK の `KnownDaemonEvent` スキーマと一致するデーモンイベントペイロードを広告します。古いデーモンは依然として互換性のあるフレームをストリーミングする可能性がありますが、SDK クライアントは型付きイベントカバレッジを想定する前にこのタグをプリフライトすべきです。

`client_heartbeat` は `POST /session/:id/heartbeat` を広告します。古いデーモンは `404` を返します。周期的なハートビートを発行する前にこのタグをプリフライトしてください。

`session_close` および `session_metadata` は `DELETE /session/:id` および `PATCH /session/:id/metadata` を広告します。古いデーモンは `404` を返します。閉じるまたは名前変更のアフォーダンスを公開する前にこれらのタグをプリフライトしてください。

`session_organization` はカスタムセッショングループおよびピン留めを広告します。これは `GET/POST/PATCH/DELETE /workspace/:id/session-groups`、`PATCH /session/:id/organization`、およびオプトインの整理されたリストビュー `GET /workspace/:id/sessions?view=organized` を追加します。`session_organization` と `workspace_qualified_rest_core` の両方が広告されている場合、ワークスペース修飾付きの組織ミューテーション `PATCH /workspaces/:workspace/session/:id/organization` も利用可能です。レガシーなミューテーションはプライマリワークスペース専用として残ります。古いデーモンはミューテーション/グループルートに対して `404` を返し、整理されたビュー契約を無視するため、WebShell/SDK クライアントは対応するグループ化またはピン留め UI を表示する前にこれらのタグをプリフライトする必要があります。

`session_archive` は v1 ディレクトリ状態アーカイブ API を広告します: `POST /sessions/archive`、`POST /sessions/unarchive`、および `GET /workspace/:id/sessions?archiveState=active|archived`。アーカイブされたセッションは、アーカイブ解除されるまで読み込みまたは再開できません。`session_archive_idle_guard` は追加的な `requireIdle` アーカイブオプションを広告します: オーニングランタイムは、クローズを開始する直前にアクティブな作業がアイドルであることを確認し、そうでない場合はアクティブなトランスクリプトをそのまま残します。`session_storage_conflict_repair` は追加的な `resolveConflicts` リクエストオプションおよび以下に記載される `resolvedConflicts` レスポンスバケットを広告します。

`workspace_qualified_rest_core` は `/workspaces/:workspace/...` の下に複数のコア REST ルートを公開します。セレクターは、まず正確なワークスペース ID として解決され、次に正規化後の URL エンコードされた絶対 cwd として解決されます。新しい単一ワークスペースのデーモンには、`multi_workspace_sessions` が存在しない場合でもプライマリランタイムが `workspaces[]` に含まれており、クライアントはワークスペース修飾ルートに必要な ID を検出できます。クライアントは配列を省略する古いデーモンのために `capabilities.workspaceCwd` にフォールバックする必要があります。信頼ステータスと信頼リクエストルートは、登録済みで信頼されていないワークスペースで利用可能です。修飾付きフックステータス読み取り（`GET /workspaces/:workspace/hooks`）も、保留中のプロジェクトフックの信頼決定を報告するため、登録済みで信頼されていないワークスペースに対して提供され、修飾付き承認ミューテーションと一致します。ファイル読み取りルートは既存のファイルシステム読み取りポリシーに従います。登録済みで信頼されていないセカンダリワークスペースも、永続化専用のセッションおよびセッショングループカタログを公開します。これらの読み取り操作はセッションにアタッチせず、ACP を開始せず、ライブブリッジ状態をマージしません。ファイル書き込み、カタログミューテーション、およびその他の複数のコアルートは、より狭いポリシーを文書化する個別の機能がない限り、信頼されたワークスペースを必要とします。`workspace_persisted_transcript`（読み取り専用）、または信頼付与ミューテーションは、`workspace_trust_grant` が公開されているかどうかに関係なく、登録済みで信頼されていないワークスペースに対して受け入れられます。このタグは信頼ホットリロードが接続されているかどうのみを報告するため、記録された決定はデーモンの再起動なしで実行中のランタイムに到達できます。ただし、ルートが提供されているかどうかは決して報告しません。信頼されていないプライマリは、複数のカタログおよびトランスクリプトルートから引き続き `403 { code: "untrusted_workspace" }` を受け取ります。レガシーな単数形のプライマルルートは、既存の互換性動作を維持します。このタグは、コアファイル、ステータス、設定、権限、信頼、ライフサイクル、MCP 制御、ツールおよびスキル切り替え、メモリ、ワークスペースエージェント CRUD、およびセッションストレージのサーフェスをカバーします。認証、音声、拡張機能、ACP/WebSocket トランスポート、チャネルワーカールーティング、またはワークスペース修飾付きセッションエクスポートはカバーしません。事前に `workspace_session_export` または `workspace_archived_session_export` を確認してください。ワークスペース信頼は ACL ではありません。デーモントークンを保持するクライアントは、このポリシーによって許可されるすべての登録済みワークスペースサーフェスを読み取ることができます。

`workspace_qualified_voice` は、信頼されたワークスペースランタイムによって選択された Voice ルートを公開します。具体的には `GET` と `POST /workspaces/:workspace/voice`、`POST /workspaces/:workspace/voice/transcribe`、および `WS /workspaces/:workspace/voice/stream` です。これは、マルチワークスペースランタイムと共有 ACP/Voice WebSocket リスナーの両方が有効な場合にのみ公開されます。セレクターは、他の複数のルートと同じ ID またはエンコードされた絶対 cwd のルールに従います。REST では、不明なセレクターは `400 { code: "workspace_mismatch" }` を返し、信頼されていないセレクターは `403 { code: "untrusted_workspace" }` を返します。WebSocket アップグレード拒否は、構造化された JSON エンベロープなしで対応する HTTP 400/403 ステータスを公開します。どちらのトランスポートもプライマリにフォールバックしません。レガシーな `/workspace/voice`、`/workspace/voice/transcribe`、および `/voice/stream` はプライマリ専用です。クライアントはすべての修飾付き Voice モダリティのために `workspace_qualified_voice` を使用し、選択されたランタイムに構成固有のエラーを報告させます。レガシーな `workspace_voice`、`workspace_voice_transcription`、および `voice_transcribe` タグは、プライマリにバインドされたルートのみを記述しており、修飾付きセカンダリ構成を隠蔽してはいけません。

`workspace_qualified_memory` は、ワークスペース修飾付き管理メモリルートである `POST /workspaces/:workspace/memory/{remember,forget,dream}`（タスクの投入）と `GET /workspaces/:workspace/memory/{remember,forget,dream}/:taskId`（それらの読み戻し）を公開します。これは、ACP HTTP とマルチワークスペースランタイムの両方が有効な場合にのみ公開されます。セレクターは、他の複数のルートと同じ ID またはエンコードされた絶対 cwd のルールに従います。各登録済みワークスペースには独自のタスクレーンがあり、プライマリの修飾付きレーンは単数形の `/workspace/memory` サーフェスと同じインスタンスであるため、片方に投入されたタスクはもう片方で読み取れます。解決は厳密に選択されたランタイムごとに行われ、プライマリへのフォールバックはありません。不明なセレクターは `400 { code: "workspace_mismatch" }` を返し、信頼されていないセレクターは `403 { code: "untrusted_workspace" }` を返し、非アクティブまたはドレイン中のランタイムは `503 { code: "workspace_runtime_unavailable" }` を返します。読み取り操作はレーンを割り当てないため、タスクのないワークスペースをポーリングすると `404 { code: "<kind>_task_not_found" }` が返されます。タスク ID はそのレーンにスコープされており、ワークスペース再構成やランタイム置換を生き延びません。古い ID はデータ損失条件ではなく `404` を返します。ACP HTTP が無効な場合、タグは公開されず、非プライマリ修飾付きリクエストは再試行不可の `501 { code: "workspace_memory_unavailable" }` を返しますが、プライマリ修飾付きルートはローカル所有のレーンを通じて動作を継続します。

`session_lsp` は、デーモンクライアント向けの読み取り専用構造化 LSP ステータススナップショットである `GET /session/:id/lsp` を公開します。古いデーモンは `404` を返します。リモート LSP ステータスを公開する前にこのタグを確認してください。

`session_resources` は、選択されたライブセッションの Config から構築された、サニタイズされた Skill および MCP スナップショットの読み取り専用ペアである `GET /session/:id/resources` を公開します。ルートはライブセッション所有者のスコープであり、プライマリランタイムにフォールバックせず、ワークスペースステータスからセッションのリソースを推測しません。ネストされた `skills` および `mcp` オブジェクトは、対応するワークスペースステータスペイロードを再利用しますが、MCP 認証、プール、ワークスペース予算、およびワークスペース検出エラーのエンリッチメントを省略します。選択されたセッションの MCP マネージャーによって報告されるステータス、検出、および会計情報はそのまま残ります。古いデーモンは `404` を返します。セッションリソースカタログを表示する前にこのタグを確認してください。

`session_status` は、ID による単一セッションのライブブリッジサマリーである `GET /session/:id/status` を公開します。`clientCount` および `hasActivePrompt` に加えて、ライブセッションは `isWaitingForPermission`、`isWaitingForUserQuestion`、`pendingInteractionCount`、および失敗したターン後の保持された `turnError` を公開します。エラーは次のプロンプトが実際に開始されたときにクリアされます。現在のブリッジ内で実行中のターンを決着させたライブセッションには、ライブステートルートの下で文書化されている同じアクティビティウォーターマークである `updatedAt` も含まれます。このルートはブリッジサマリーを直接返すため、値は永続化されたトランスクリプト mtime とマージされず、セッションリストが報告するものより早くなる可能性があります。単一セッションステータスレスポンスとワークスペースセッションリストの両方に `turnError` と `pendingInteractions` が含まれます。これらは、レンダリング準備完了の権限アクションまたは `ask_user_question` 質問に加え、既存の権限投票ルートで必要な `requestId` と選択可能なオプションです。各ユーザー質問には `answerKey` があります。その値をキーとして `answers` で投票します。例：`{ "0": "Polling" }`。永続化専用のセッションは、ランタイムが存在しないためランタイム状態を省略します。古いデーモンは `404` を返します。完全なセッションリストをスキャンする代わりに単一セッションのステータスをポーリングする前にこのタグを確認してください。

`session_info` は `GET /workspace/:id/session-info` とその `/workspaces/:workspace/session-info` ツインを公開します。レスポンスは、リストメタデータをハイドレートせずに、永続化されたアクティブおよびアーカイブされたセッション数を集約します。これは明示的な O(n) ディスクスキャンであり、ポーリングしてはいけません。クライアントは `truncated: true` を下限結果として扱う必要があります。

`session_approval_mode_control`、`workspace_tool_toggle`、`workspace_skill_settings_toggle`、`workspace_skill_settings_batch_toggle`、`extension_batch_activation_v2`、`workspace_init`、および `workspace_mcp_restart` は、以下に記載されているミューテーション制御ルートをアドバタイズします。承認モード制御は非厳密互換性ゲートを維持します。その他の制御はオペレーター権限によって厳密にゲートされます：信頼できるループバックプライマリ、ベアラー認証済み、またはペアリングされたローカル制御リクエストが通過します。信頼できるループバック権限なしで厳密ゲートに到達したトークンレスのプライマリリクエストは 401 `token_required` を返します。設定された資格情報の欠落または無効、および未ペアリングのローカル制御資格情報は、ベアラーミドルウェアによって事前に拒否され、プレーンな `401 Unauthorized` が返されます。これらのルートのいずれかが欠けているデーモンは `404` を返します。設定固有の Skill タグは異なります：退役タグ世代からのデーモンは `workspace_skill_toggle` と `workspace_skill_batch_toggle` をアドバタイズし、同じパスでカタログ検証済みのコントラクトを提供します。退役した単一ターゲットルートは HTTP `404 skill_not_found` または `409 skill_not_toggleable` を返す可能性があります。退役したバッチルートは HTTP 200 を返し、カタログ由来の失敗を `errors[]` に配置します。そのアフォーダンスを公開する前に各タグをプリフライトし、ルート到達可能性のプロビングによって設定固有の Skill コントラクトを推測しないでください。ルートパスとリクエストボディは変更されていません。

`mcp_guardrails`（issue [#4175](https://github.com/QwenLM/qwen-code/issues/4175) PR 14）は MCP バジェットサーフェスをカバーします：`GET /workspace/mcp` の `clientCount` / `clientBudget` / `budgetMode` / `budgets[]` フィールド、サーバーごとのセルの `disabledReason` フィールド、および `--mcp-client-budget` / `--mcp-budget-mode` CLI フラグ。古いデーモンは新しいフィールドを完全に省略します。SDK クライアントは `budgets[]` セマンティクスに依存する前にこのタグをプリフライトします。レジストリの記述子には将来の機能モード公開用の `modes: ['warn', 'enforce']` も含まれていますが、現時点ではクライアントはスナップショットの `budgetMode` フィールドからモードを推測します。`enforce` モードでのサーバー拒否は `Object.entries(mcpServers)` 宣言順序によって決定論的です。将来のスコープ優先度レイヤー（qwen-code が採用する場合）は、claude-code の `plugin < user < project < local` 慣例を反映するためにこれを「最低優先度が最初」に変更します。

> **スコープは能力駆動型です。** `mcp_workspace_pool` を使用すると、1つのワークスペースランタイム内のセッションはトランスポートプールと `WorkspaceMcpBudget` を共有し、スナップショットは `budgets[0].scope: 'workspace'` を出力します。異なるワークスペースランタイムは独立したプールを所有します。タグがない場合、各 ACP セッションはレガシーな `McpClientManager` を使用し、スナップショットは `scope: 'session'` を出力し、N 個のセッションがそれぞれ設定された上限を消費する可能性があります。

`workspace_file_read` はテキスト/リスト/統計/glob ワークスペースファイルルート（`GET /file`, `GET /list`, `GET /glob`, `GET /stat`）をカバーします。`workspace_file_bytes` は `GET /file/bytes` をカバーしており、これは後から追加されたもので、クライアントが PR19 時代のデーモンに対して生のバイトウィンドウサポートを事前チェックできるようになります。`workspace_file_write` はハッシュ対応のテキスト変更ルート（`POST /file/write`, `POST /file/edit`）をカバーします。write タグはルート契約が存在することを意味しますが、現在のデプロイメントが匿名による変更を受け入れていることを意味するわけではありません。write/edit は厳格な変更ルートであり、オペレーター権限が必要です。トークンなしの信頼できるループバックもこれに該当します。`workspace_file_upload` は `POST /file/upload`、つまりバイナリ入力ルートをカバーしています。`MAX_UPLOAD_BYTES` (50 MiB) 上限の `application/octet-stream` ボディがワークスペースに書き込まれますが、上書きは行われず、名前が重複している場合は自動で番号が付与されます（`name (1).ext`, `name (2).ext`, ...）。これもまた厳格な変更ルートです。

`workspace_file_delete` は `POST /workspaces/:workspace/file/delete` のみをカバーします。レガシープライマリ `/file/delete` ルートは存在しません。JSON ボディは `{ "path": "relative/file.txt" }` であり、成功時は `{ "kind": "file_delete", "path": "relative/file.txt" }` を返します。この厳密なミューテーションルートは、選択された信頼できるローカルワークスペースから1つの通常ファイルを永久的に削除します。ディレクトリとシンボリックリンクは拒否されます。サポートされていないファクトリー（SSH を含む）は 422 を返します。この能力はプロトコルサポートを説明しており、すべてのワークスペースでの削除許可を意味しません。クライアントは `workspace_qualified_rest_core` もプリフライトする必要があります。

`workspace_qualified_rest_core` がアドバタイズされると、同じファイルサーフェスは `/workspaces/:workspace/file`、`/workspaces/:workspace/file/bytes`、`/workspaces/:workspace/stat`、`/workspaces/:workspace/list`、`/workspaces/:workspace/glob`、`/workspaces/:workspace/file/write`、`/workspaces/:workspace/file/edit`、`/workspaces/:workspace/file/upload`、および `/workspaces/:workspace/file/delete` でも利用可能になります（最後のルートはさらに `workspace_file_delete` を必要とします）。

`workspace_directory_create` と `workspace_directory_delete` は独立して `POST /workspaces/:workspace/directory/create` と `POST /workspaces/:workspace/directory/delete` をアドバタイズします。操作のタグを `workspace_qualified_rest_core` と一緒にプリフライトしてください。古い適格なデーモンはこれらのルートを欠いている可能性があります。両方とも、プライマリフォールバックやレガシープライマリ対応物を持たない、信頼できるアクティブな選択されたローカルランタイムが所有する厳密なミューテーションです。作成は既存の親の下で排他的です。削除は永久的かつ再帰的です。

同じタグは `/workspaces/:workspace/agents` と `/workspaces/:workspace/agents/:agentType` でワークスペース修飾付きプロジェクトエージェント CRUD も公開します。これらの複数形ルートは、選択されたワークスペースのプロジェクトレベルのエージェントのみを読み取ったり変更したりします。`global` と `user` スコープリクエストは `400 { code: "global_scope_not_supported_for_workspace_route" }` を返します。ワークスペースなしの `/workspace/agents` ルートは既存のプライマリワークスペース動作を維持し、ユーザーレベルのエージェントスコープに対する唯一の REST サーフェスのままです。

`extension_management_v2` は `/extensions/*` でユーザーレベル拡張カタログとミューテーションサーフェスを、`/workspaces/:workspace/extensions/*` でワークスペースアクティベーションプロジェクションをアドバタイズします。アーティファクトはグローバルです。ワークスペースルートはプロジェクション読み取り、正確なアクティベーションオーバーライド、およびランタイム更新のみを公開します。読み取りは信頼できない登録済みワークスペースを対象とする場合がありますが、アクティベーション、更新、およびワークスペーススコープ付きインストールは信頼できるターゲットを必要とします。遅いミューテーションは `/extensions/operations/:operationId` でデーモンローカルな操作を使用します。ストア生成が権威ありであり、操作履歴ではなく、再起動間およびデーモン間で権威があります。公開された `workspace_extensions` 能力と `/workspace/extensions/*` ルートはプライマリワークスペース互換性アダプターとして残ります。クライアントは `extension_management_v2` をプリフライトする必要があり、デーモンモードや `workspace_qualified_rest_core` から推測してはいけません。

`extension_git_credentials` は `POST /workspace/extensions/install` と `POST /extensions/install` の両方で認証済み HTTPS Git インストールをアドバタイズします。クライアントは URL ユーザー情報や `credentialPersistence` を送信する前にこのタグをプリフライトする必要があります。古いデーモンは URL 資格情報を拒否します。このタグはバックエンドプロトコルサポートを説明しており、キーチェーンの利用可能性を説明するものではありません。保存モードは端末操作結果で選択されたバックエンドを報告します。

`extension_local_path_install` は `POST /workspace/extensions/install` と `POST /extensions/install` の両方でデーモンローカルな Extension ソースをアドバタイズします。`source` はデーモンホスト上に存在する絶対パスでなければなりません。相対パスはサポートされないままであるため、デーモンプロセス cwd がソースアイデンティティを変更したり GitHub `owner/repo` ショートハンドをシャドーイングしたりすることはできません。既存のインストール操作は Extension を管理ストレージにコピーしますが、ソースをリンクしません。クライアントはこのタグをプリフライトする必要があります。なぜなら古いデーモンはローカルソースを拒否するためです。

`extension_batch_activation_v2` は `PUT /extensions/activation` と `PUT /workspaces/:workspace/extensions/activation` を追加します。両方とも `extensionNames` で 1〜100 の名前を受け入れ、大文字小文字を区別せずに重複排除しながら最初に出現した順序を保持し、変更されたターゲットを 1 つの世代で永続化し、1 つの `202` 操作ハンドルを返します。`enabled` または `disabled` を設定する際に、ターゲットがインストールされている必要はありません。その名前は、その名前の Extension がインストールされたときに保持される望ましい状態の宣言を作成します。グローバルルートは `state: "enabled" | "disabled"` を受け入れ、V2 `defaultActivation` に書き込みます。ワークスペースルートも `"inherit"` を受け入れ、選択された信頼できるランタイムに対して正確なオーバーライドを適用またはクリアします。`inherit` は不明な名前を宣言せず、すべて不明なクリアは `updated: false` を報告します。

`extension_activation_explicit_refresh` は、単一およびバッチのアクティベーション操作が、永続的なポリシーコミット後に直接アクティブセッションを更新することなく完了することを意味します。即時の適用が必要な呼び出し側は、アクティベーションの成功を待ってから、リフレッシュカウントを直接返す同期プライマリワークスペースの `POST /workspace/extensions/refresh`、または別の操作ハンドルを返す選択されたワークスペースの非同期 `POST /workspaces/:workspace/extensions/refresh` のいずれかをサブミットする必要があります。この 2 つの形式は互換性がないことに注意してください。非同期操作は、完全なランタイム調整が完了したときに適用された世代を記録しますが、同期ルートは何も記録しないため、世代レコンサイラーはそのワークスペースを保留中とみなし、次のパスでセッションを再度更新します。特定のワークスペースを指定できる呼び出し側は、非同期形式を優先すべきです。リフレッシュ失敗は、アクティベーション結果をロールバックしたりダウングレードしたりしません。この機能を備えていないデーモンは、アクティベーションにランタイムリフレッシュをすでに含んでいるため、互換性のあるクライアントは 2 番目のリフレッシュをサブミットしてはいけません。独立した 30 秒の世代レコンサイラーは有効なままであり、通常は次のパスでコミットされたポリシーを適用します。失敗した調整は、後続のパスで再試行されます。

### Extension Management V2 ワイヤ契約 [#extension-management-v2-wire-contract]

すべてのルートは、上記のデーモンベアラート認証ルールを使用します。`X-Qwen-Client-Id` は V2 ミューテーションルートではオプションです。提供される場合、ミューテーションのターゲットワークスペースランタイムのいずれかに登録されているクライアントを識別する必要があります。`:extensionId` は、小文字の 64 進数の拡張機能 ID です。`:workspace` は、まず正確なワークスペース ID として解決され、それ以外の場合は正規化後の URL エンコードされた絶対 cwd として解決されます。

| メソッドとパス | 成功 |
| ------------------------------------------------------------------ | --------------------------------------------------------------------------- |
| `GET /extensions` | `200` グローバルアーティファクトカタログ |
| `PUT /extensions/activation` | `202` グローバルデフォルトアクティベーションバッチ操作 |
| `PUT /extensions/:extensionId/activation` | `202` グローバルデフォルトアクティベーション操作 |
| `POST /extensions/install` | `202` インストール操作 |
| `POST /extensions/check-updates` | `202` アップデートチェック操作 |
| `POST /extensions/:extensionId/update` | `202` アップデート操作 |
| `DELETE /extensions/:extensionId` | `202` アンインストール操作、または拡張機能が存在しない場合は冪等な `204` |
| `GET /extensions/operations/:operationId` | `200` 操作スナップショット |
| `GET /workspaces/:workspace/extensions` | `200` ワークスペースアクティベーションプロジェクション |
| `GET /workspaces/:workspace/extensions/:extensionId/state` | `200` ワークスペースリソース状態 (`extension_state`) |
| `PUT /workspaces/:workspace/extensions/:extensionId/state` | `202` ワークスペースリソース状態操作 (`extension_state`) |
| `PUT /workspaces/:workspace/extensions/activation` | `202` 正確なワークスペースアクティベーションバッチ操作 |
| `PUT /workspaces/:workspace/extensions/:extensionId/activation` | `202` 正確なワークスペースアクティベーション操作 |
| `DELETE /workspaces/:workspace/extensions/:extensionId/activation` | `202` オーバーライドクリア操作 |
| `POST /workspaces/:workspace/extensions/refresh` | `202` ランタイムリフレッシュ操作 |

#### 明示的な Extension リフレッシュ

機能タグ: オプションのセッション選択には `workspace_session_refresh`。`POST /workspace/extensions/refresh` (プライマリランタイム) と `POST /workspaces/:workspace/extensions/refresh` (選択されたランタイム) の両方が次を受け入れます:

```json
{ "sessionIds": ["session-1", "session-2"] }
```

`sessionIds` を省略すると、完全なランタイムリフレッシュが維持されます。配列が提供された場合、リクエスト順に重複排除され、`[]` はセッションやブートストラップキャッシュをリフレッシュしません。ID は空でない文字列である必要があります。無効なリクエスト形状は HTTP 400 を返し、他のワークスペースが所有するセッションを含む不明な ID は、作業開始前に HTTP 404 を返します。セッションの所有権は、解決されたランタイム内でのみチェックされ、プライマリランタイムへのフォールバックはありません。既存の認証、厳格なミューテーション、ワークスペース信頼、およびクライアント ID ゲートが適用されます。

プライマルートは依然として `{ refreshed, failed }` で HTTP 200 を返し、修飾ルートは依然として操作ハンドル付きで HTTP 202 を返します。カウントは選択されたセッションを記述します。`sessionIds` を使用したリフレッシュは、選択が現在のすべてのセッションをカバーしていても、ワークスペース全体の適用済み世代を進めません。自動の完全調整は変更されず、後で他のセッションをリフレッシュする可能性があります。選択はセッションスコープのアクティベーションポリシーを作成しません。共有ランタイムキャッシュは変更される可能性があり、ワークスペースイベントはワークスペース全体のままです。

クライアントは、空の配列を含めてフィールドを提供する前に `workspace_session_refresh` をプリフライトする必要があります。古いデーモンはこれを黙って無視する可能性があります。フィールドなしの既存の呼び出しには、新しい機能チェックは不要です。

#### ワークスペースリソース状態

`extension_state` を独立してプリフライトします。これは Skills のみをサポートし、MCP リソース管理を意味しません。両方のルートは登録されたワークスペースランタイムを選択し、プライマリにフォールバックすることは決してありません。GET は既存の読み取り専用信頼ルールに従います。PUT は信頼できるワークスペースが必要です。

```json
{
  "skills": [
    { "name": "review", "state": "enabled" },
    { "name": "deploy", "state": "disabled" }
  ]
}
```

PUT は、単一要素のバッチを含む 1〜100 のエントリを受け入れます。キューイング前に、不正なエントリ、大文字小文字を区別しない重複名、およびサポートされていないグループを拒否します。すべての名前は、現在無効になっている Skills を含む、インストールされたターゲット Extension に属している必要があります。無効なターゲットは、部分的な書き込みなしで操作を失敗させます。1 つのロックされたストアコミットが、正確な正規化されたワークスペースに対するリストされたオーバーライドをマージします。リストされていない Skills と他のワークスペースは保持されます。設定の書き込み、将来の名前の宣言、または親 Extension の暗黙的なアクティベーションはありません。

GET は `v: 1`, `workspaceId`, `workspaceCwd`, `extensionId`, `name` および `skills` を返します。各 Skill には `name`, `defaultEnabled`, nullable な `workspaceEnabled`, `effectiveEnabled`, およびオプションの `disabledReason`/`lockedScope` があります。マニフェストのオプションの `skillStates` はデフォルトを提供します。値が欠落している場合は、有効がデフォルトになります。アクティブな親の場合、優先順位は、設定によるハード無効化、設定による明示的な有効化、設定によるデフォルト無効化、ワークスペース内部オーバーライド、マニフェストデフォルトです。内部無効化は `disabledReason: "default"` を使用し、設定をロックすることはありません。無効または削除された親は、Skill オーバーライドによって復活させることはできません。

`set_extension_state` 操作は順序付けられた `result.resourceStates.skills` を含む `status: "updated"` を返します。`result.states` は更新チェックの意味を保持します。永続化された状態は、すべてのセッションが更新されたことの証明にはなりません。デーモンは、ブートストラップおよびライブセッションを含むターゲットランタイムの Skills とそのコマンド/モデルコンテキストのみを更新し、無関係な MCP/LSP/hooks は再起動しません。コミット後の更新失敗は、状態をロールバックせずに警告を生成します。オーバーライドは再起動と Extension の更新後も存続し、アンインストール時に削除されます。クライアントは、より優先度の高い設定を書き込む Skill settings API にフォールバックしてはなりません。

#### グローバルカタログ

グローバルカタログのレスポンスは次のとおりです:

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

インストールメタデータが利用できない場合、`installType` は省略されます。`defaultActivation` は `enabled` または `disabled` です。`workspaceOverrideCount` は保存された `inherit` エントリを除外します。

ワークスペースプロジェクションのレスポンスは次のとおりです:

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

継承の場合、`workspaceActivation` は `enabled`、`disabled`、または `null` です。`activationSource` は `default`、`workspace_override`、`legacy_path_rule`、または `cli_override` です。`desiredGeneration` は永続ストアの世代番号であり、`appliedGeneration` はコントローラーがそのワークスペースランタイムに適用済みとして記録した最新の世代番号で、一時的に遅延する可能性があります。

インストールには明示的な同意と初期アクティベーションが必要です:

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

ワークスペース限定の初期アクティベーションには `{ "scope": "workspace", "workspaceId": "target-workspace-id" }` を使用します。ターゲットが存在し、信頼されている必要があります。デーモンへのインストールでは GitHub、Git、npm ソースを受け入れます。`extension_local_path_install` がアドバタイズされている場合、デーモンホスト上に存在する絶対パスも受け入れます。`ref` は npm には適用されず、`ref` と `autoUpdate` はローカルソースには適用されず、`registry` は npm のみに適用されます。`ref`、`autoUpdate`、`allowPreRelease`、および `registry` はオプションです。

`extension_git_credentials` がアドバタイズされている場合、HTTPS Git ソースにはユーザー情報を含めることができます。例えば `https://username:token@git.example.com/org/repository.git` などです。`credentialPersistence` はそのようなソースでのみ有効です。これは `stored` または `one_time` であり、省略された場合はデフォルトで `one_time` になります。保存モードでは、デーモンのハイブリッドシークレットストレージを通じて資格情報を保存し、インストールメタデータにはクリーンなリポジトリ URL のみを保持するため、拡張機能は更新可能のままです。一回限りのモードでは、リポジトリ URL も資格情報も保存せず、更新不可能な `snapshot` を作成します。このモードでは `autoUpdate: true` は拒否されます。URL 資格情報なしでフィールドを提供する場合、無効な資格情報を提供する場合、または npm、アーカイブ、ローカル、SSH、非 Git ソースで資格情報を使用する場合は、`400` が返されます。

資格情報付きのインストールレスポンスと操作では `credentialPersistence` が公開され、`credentialStorage` が `keychain` または `encrypted_file` として公開される場合があります。一回限りの操作では `source` は省略されます。保存された操作ではクリーンなソースが返される場合があります。スナップショットカタログ/ステータスエントリではソースが省略され、`credentialPersistence` は `one_time` に設定され、`not updatable` が報告されます。更新は `extension_not_updatable` で失敗します。利用不可の保存済みシークレットはネットワークアクセス前に `extension_credential_unavailable` で失敗します。

グローバルおよびワークスペースアクティベーション `PUT` リクエストは同じボディを使用します:

```json
{ "state": "enabled" }
```

`state` は `enabled` または `disabled` です。更新、アンインストール、更新チェック、アクティベーションクリア、および更新リクエストには必須のボディはありません。

バッチアクティベーションリクエストでは Extension 名を使用します:

```json
{
  "extensionNames": ["formatter", "review-tools"],
  "state": "disabled"
}
```

ワークスペースバッチでは `"state": "inherit"` も受け入れます。終端のグローバル結果には `name` と `defaultActivation` が含まれ、ワークスペース結果には `name`、`workspaceActivation`（継承の場合は `null`）、および `effectiveActivation` が含まれます。不正な名前はリクエストを拒否します。既存の Store アイデンティティとの競合は、部分的なコミットなくアトミックに失敗します。不明な `inherit` ターゲットは永続化されません。オーバーライドのクリアは、デフォルトアクティベーション宣言を作成したり、後続のインストール同意を置き換えたりしてはならないためです。

承認されたすべての非同期変更は次を返します:

```http
HTTP/1.1 202 Accepted
Location: /extensions/operations/<operation-id>
Retry-After: 1
Content-Type: application/json

{"accepted":true,"operationId":"<operation-id>"}
```

ワークスペース修飾付きの変更は、同じグローバル `/extensions/operations/:operationId` ポーリングパスを使用します。操作履歴はプロセスローカルであり、有限数の終端エントリのみを保持し、デーモン再起動時に失われます。クライアントは、操作 ID が消えた場合にカタログまたはワークスペースプロジェクションを再読み込みし、世代番号を比較する必要があります。

操作スナップショットはこの形状をしています:

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

`status` は `queued` から `running` へ遷移し、その後 `succeeded`、`succeeded_with_warnings`、または `failed` へ遷移します。実行中、`phase` は `preparing`、`committing`、または `reconciling` です。成功時の終端状態には `result` が含まれる場合があり、`status` は `installed`、`enabled`、`disabled`、`updated`、`uninstalled`、`checked`、または `refreshed` と等しくなります。調整結果にはさらに `refreshed`、`failed`、および `error` が含まれる場合があり、バッチアクティベーション結果には順序付けられた `results` が含まれます。更新チェックは拡張機能名をキーとした `result.states` を返し、値には `checking for updates`、`update available`、`up to date`、`not updatable`、または `error` などが含まれます。資格情報と認証ヘッダーは操作フィールドには決して含まれません。

永続コミットの後に不完全なクリーンアップまたはランタイム調整が発生した場合、失敗した変更として報告されません。代わりに `succeeded_with_warnings` を返し、コミットされた結果を保持します:

```json
{
  "v": 1,
  "operationId": "<operation-id>",
  "operation": "uninstall",
  "status": "succeeded_with_warnings",
  "createdAt": 1750000000000,
  "updatedAt": 1750000000200,
  "result": {
    "status": "uninstalled",
    "name": "demo",
    "refreshed": 2,
    "failed": 0
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

警告 `workspaceId` と `code` はオプションです。`workspaceCwd` と `error` は常に存在します。クライアントは警告を表示し、カタログ/プロジェクションを更新する必要があり、永続的な変更を盲目的に再試行してはなりません。

検証および認可の失敗は、安定したコードが存在する場合は `{ "error": "...", "code": "..." }` を使用する同期的な HTTP エラーです。重要なケースは `400 invalid_extension_id`、`400 invalid_extension_names`、`400 invalid_extension_name`、`400 invalid_extension_activation`、`400 workspace_mismatch`、`403 untrusted_workspace`、`404 extension_operation_not_found`、および `429 extension_queue_full` です。インストール検証では、無効なソース/参照/レジストリオプション、同意の欠如、または初期アクティベーションの欠如/無効に対して `400` も返されます。`202` の後に失敗した変更は、操作履歴に保持されている間、`status: "failed"`、`error`、およびオプションの安定した `code` で表現されます。一般的なコードには `extension_prepare_timeout` と `extension_conflict` が含まれます。操作に対する HTTP `404` は、操作履歴が永続的ではないため、ロールバックを意味しません。

`daemon_status` は `GET /daemon/status`、つまり以下に文書化されている統合された読み取り専用オペレーター診断スナップショットを通知します。

`daemon_update` はプロセスグローバルな `GET /daemon/update`, `POST /daemon/update/prepare`, `POST /daemon/update/restart` インターフェースを通知します。

`scheduled_task_gate` は `POST` と `PATCH /scheduled-tasks` におけるオプションの `gate`、およびタスクビューにおける `gate` と `gateStatus` を通知します。ゲートとは、モデルの外側で所有セッションが各発火時に実行するシェルコマンドです。出力ありで exit 0 の場合、その出力を添付して発火が配信されます。stdout が空で exit 0 の場合、スキップされます。非ゼロ終了の場合、すべての発火時ではなく、ゲートが失敗し始めたときに報告されます。`gateStatus.lastOutcome` は `quiet`, `delivered`, `failed` または `blocked` です。

- ゲートには繰り返し実行されるタスクが必要です。`recurring: false` を伴う `POST`、またはワンショットタスクにゲートを設定するか、ゲート付きタスクをワンショットにする `PATCH` は、400 `gate_requires_recurring` を返答します。すでにその状態にあるタスクは、他の編集内容を保持します。不正なゲート（`POST` で空、コメントのみ、2048 文字を超える、NUL 文字またはペアになっていない UTF-16 サロゲートを含む、`bash -c '…'` のようなシェルラッパー、または `&` でバックグラウンド実行されている部分がある場合）は 400 `invalid_gate` を返答します。`&` チェックは字句的かつベストエフォートです。不明な場合は拒否され（コメント内の `&`、ヒアドキュメント本体、または `(( … ))` など）、これを通過したゲートが、バックグラウンド部分が stdout を保持している状態で stdout が空のまま終了した場合、`failed` として報告されます（bwrap シェルサンドボックス外では、PID 名前空間によりコマンドとともにその部分が終了します）。`PATCH`, `gate: null` または `gate: ""` では、ゲートとその `condition` がクリアされます。
- `condition` によって保護されているレガシータスクは、`PATCH` 内の任意の `gate` キーを 409 `task_legacy_unsupported` で拒否するため、クライアントは変更する場合にのみ `gate` を送信します。
- これらのルートを通じて書き込まれたゲートには、セッションからの確認はありません。同じコマンドに対する `monitor` 呼び出しが確認なしで実行される場所でのみ、無人実行されます。具体的には、保存された `Monitor(...)` または `Bash(...)` の許可ルール下、読み取り専用コマンドとして、または auto もしくは yolo セッション内です。deny ルールはすべてのモードでブロックし、plan モードでもブロックします。ブロックされた発火は `blocked` で確定します。
- クライアントはこのタグのないデーモンに `gate` を送信してはなりません。そのようなデーモンは `POST` でそれを破棄し、ゲートのみの `PATCH` に対して 400 `empty_patch` を返答します。

`autofix_pr_watches` は `GET /autofix-pr/watches`（プライマリワークスペース）と `GET /workspaces/:workspace/autofix-pr/watches`（登録済みで信頼できるワークスペース）を通知します。それぞれがワークスペースのクローンの `/autofix-pr` ウォッチに対し、`qwen autofix-pr status` がリスト表示するように応答します。ウォッチのファイルはクローンのメインワークツリー（`.qwen/tmp`）の下から読み取られ、シンボリックリンクを追わず、ブロッキングせずに開かれます。ロックは取得されず、GitHub には問い合わせず、クローンを見つけるための `git worktree list` 以外の git コマンドは実行されません。応答は `{ v: 1, available, root?, now?, watches, unreadable? }` です。ワークスペース用の git リポジトリが見つからない場合（または git がそこで実行できない場合）、`available` は false となり、ウォッチはありません。`root` はクローンのメインワークツリーであり、1 つのクローンの 2 つのワークスペースで同じ値になります。ウォッチは `status`（`/autofix-pr` 設計書のセクション 6.10）のフィールドを持ちますが、`thisSession`, `worktreePath`, `pushTarget`, `gitTrusted`, `worktreeWork` は含みません。その `session` はそれを所有するセッションであり、このデーモンのセッションではない可能性があります。ウォッチの停止はスキルが行います（所有セッション内の `/autofix-pr stop <n>`）。これらのルートは何も変更しません。

**条件付きタグ。** これらの機能タグは、デプロイメントトグル、ランタイムワイヤリング、または可用性条件がアクティブな場合のみ広告されます。タグが存在することは、ドキュメント化された動作が利用可能であることを意味し、存在しないことは、そのタグより前の古いデーモンであるか、その条件が false である現在のデーモンであることを意味します。現在:

<!-- conditional-serve-features:start -->

| タグ | 広告される条件 … |
| ---------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `agent_collaboration_v1` | 少なくとも一つの登録済みワークスペースが `experimental.agentCollaboration` (任意のスコープ、ワークスペース含む) または `QWEN_CODE_ENABLE_AGENT_COLLABORATION=1` を介して永続的なワークスペース Agent コラボレーションを選択した場合。存在することは `/workspaces/:workspace/agent/*` と Agent Host トランスポートルートがマウントされていることを意味します。`workspaces[].agentCollaborationEnabled` は各ワークスペースのオプトイン状態を識別し、クライアントは有効なエントリに対してのみコラボレーションサーフェスを表示または呼び出す必要があります。古いデーモンはそのワークスペースフィールドを省略するため、クライアントは互換性のためにこのトップレベルのタグにフォールバックする場合があります。存在しないことは、このレスポンスでコラボレーションが提供されないことを意味します — このタグはブート時にスナップショットされるのではなく、リクエストごとに再計算されます — したがって、クライアントはエントリーポイントを描画して呼び出しが 404 になるのを待つのではなく、ドロップする必要があります。初めて有効にするには再起動が必要です。別のワークスペースがすでにオンになっている状態でワークスペース用に切り替えると、次のリクエストで有効になります。無条件の `workspace_agents` タグとは異なり、これはサブエージェント定義の CRUD です。 |
| `session_message_deletion` | プライベート Hosted Harness プロファイルがアクティブでない場合。ライブセッションオーナールートを通じてメッセージグループをリストおよび削除します。通常のローカルデーモンセッションは物理削除をサポートしますが、Managed 権威ストレージと SSH ワークスペースはこれを拒否します。 |
| `hosted_harness_private_v1` | プライベート Hosted Harness プロファイルがアクティブであり、認証済みセッション API のみが利用可能な場合。 |
| `managed_session_journal_delta_v1` | プライベート Hosted Harness プロファイルがアクティブであり (`hosted_harness_private_v1` と同じ条件)、このビルドが `message.delta` レコードを含む Managed Session ジャーナルを開ける場合。コントロールプレーンは能力交渉時にこのタグを要求するため、それらのレコードより前のロールバックされた Harness は、すべての Session open で失敗する代わりに、そこで一度拒否されます (`managed_session_open_failed`)。 |
| `require_auth` | デーモンが `--require-auth` (または埋め込み API 経由の `requireAuth: true`) で起動された場合。すべての通常の API ルートで Bearer トークンが必須となります。ループバックバインド上の `/health` を含みます。チャネル Webhook イングレスは独立した共有シークレット認証を維持し、Web Shell ドキュメントおよびアセットルートは事前認証のままです。 |
| `mcp_workspace_pool` | 共有 MCP トランスポートプールがアクティブな場合。`QWEN_SERVE_NO_MCP_POOL=1` がプールを無効にする場合は省略されます。 |
| `mcp_pool_restart` | 共有 MCP トランスポートプールがアクティブな場合。再起動レスポンスにはプール対応の複数エントリの形状が含まれることがあります。 |
| `external_tool_guard` | `qwen serve` が `--external-tool-guard-mode=required` のためのスタートアップハンドシェイクを完了した場合。生成されたすべての ACP チャネルは、Session 作成前にインストールされたコールバックを確認する必要があり、最終的な実行境界に到達したすべてのサポートされているトップレベルの管理された ACP ツール呼び出しは、外部の実行前許可を一つ受信する必要があります。以前の permission/hook 拒否はプロバイダーリクエストを行いません。ネストされた AgentCore 実行は v1 の外側にあり、この外部プロバイダーモードがアクティブな間は拒否されます。このタグは外部プロバイダーのみを反映します: それとは独立して、すべてのデーモンはシェルコマンドラインを持つ管理ツール (`run_shell_command` および `monitor`) に組み込みの Git relocation guard を適用するため、このタグの欠如は実行前拒否がないことを意味しません。 |
| `allow_origin` | T2.4 ([#4514](https://github.com/QwenLM/qwen-code/issues/4514))。デーモンは少なくとも1つの `--allow-origin <pattern>`（または埋め込みAPI経由の `allowOrigins: [...]`）とともに起動されました。一致するオリジンからのクロスオリジンリクエストには適切なCORSレスポンスヘッダーが付与されますが、一致しないオリジンは引き続きデフォルトの403を受け取ります。設定されたパターンリストは、認証されていない読み取り側への信頼済みオリジンセットの漏洩を避けるため、意図的に `/capabilities` にはエコーされません — ブラウザクライアントは既に自身のオリジンを認識しています。 |
| `prompt_absolute_deadline` | `--prompt-deadline-ms` / `QWEN_SERVE_PROMPT_DEADLINE_MS` / `ServeOptions.promptDeadlineMs` が正の整数に設定されています。 |
| `writer_idle_timeout` | `--writer-idle-timeout-ms` / `QWEN_SERVE_WRITER_IDLE_TIMEOUT_MS` / `ServeOptions.writerIdleTimeoutMs` が正の整数に設定されています。 |
| `workspace_settings` | デーモンは設定永続化機能が利用可能な状態で作成されました。 |
| `user_language_sync` | デーモンは設定永続化機能が利用可能な状態で作成されました（`workspace_settings` と同じ条件）、そのためセッションレスの `POST /language` ルートが登録されています。 |
| `workspace_voice` | 設定永続化機能が利用可能であるため、レガシーなプライマリワークスペースの音声設定ルートが有効です。 |
| `workspace_voice_transcription` | プライマリワークスペースに音声文字起こしモデルが設定されています。 |
| `session_shell_command` | セッションシェル実行がベアラ認証または信頼できるループバック権限下で明示的に有効かつ実効状態であり、呼び出しには依然としてセッションに紐付いたクライアントIDが必要です。 |
| `standalone_sessions_v1` | デーモンは完全なスタンドアロンセッションランタイム、ライフサイクルコーディネータ、永続的な削除ジャーナル、管理ディレクトリの実装、および `/standalone/sessions` ルートファミリーをインストールしました。完全な依存関係グラフを持たない直接埋め込みでは、ルートとこのタグの両方が省略されます。 |
| `standalone_session_options_v1` | 完全なスタンドアロンセッションランタイムがインストールされています（`standalone_sessions_v1` と同じ条件）、そのため読み取り専用でセッションレスの `GET /standalone/session-options` ルートが内部のConversationsランタイムに登録されています。 |
| `session_artifacts_persistence` | ランタイムに対してセッションアーティファクトの永続化が接続されています。 |
| `session_artifact_library` | セッションアーティファクトの永続化が接続されており、`/workspaces/:workspace/session/:id/artifact-library` を介してライブ、コールド、およびアーカイブされた登録に対する信頼できるワークスペースオーナーによる読み取り/削除をサポートします。 |
| `workspace_artifact_library` | `/workspaces/:workspace/artifact-library` を介した、永続化されたワークスペース全体のアーティファクトクエリ、バッチセッショクエリ、および明示的なペアの削除。 |
| `workspace_artifact_library_stream` | すべてのアーティファクトライブラリの読み取りにおけるセッションメタデータ、および完全および選択されたセッションクエリのためのオプトイン有限SSE；アーティファクトの永続化が必要です。 |
| `session_sources` | ランタイムに対してセッションソースの永続化が接続されています。ライブセッションオーナーを介して、メタデータ専用のワークスペースファイル、アップロードされた添付ファイル、およびHTTP(S)リンクを登録します。 |
| `session_generation` | セッション生成ヘルパーが利用可能です。 |
| `session_btw_stream` | 登録されたすべてのランタイムブリッジが再開可能なBTWストリーミングをサポートしています。クライアントは `/session/:id/btw/stream` を呼び出す前にこのフラグを確認する必要があります。それ以外の場合は、既存のJSON BTWインターフェースを使用してください。 |
| `scheduled_task_session_reuse` | 永続的なスケジュールタスクセッション管理がアクティブであり、すべての管理されたデーモンランタイムが、タスクが現在の既存セッションに明示的にバインドできるようにするコールバックをインストールしました。 |
| `workspace_generation` | ワークスペーススコープの生成ヘルパーが利用可能です。 |
| `rate_limit` | `--rate-limit` / `QWEN_SERVE_RATE_LIMIT=1` / `ServeOptions.rateLimit` が有効です。 |
| `workspace_reload` | ワークスペースのリロードサポートが埋め込みルート構成で利用可能です。 |
| `workspace_trust_grant` | 信頼のホットリロードが接続されています（`workspace_trust_hot_reload` と同じ条件）。両方のグラントルートはバインドされたフォルダのみを信頼し、既存の `TRUST_FOLDER` または `TRUST_PARENT` ルールを保持します。永続化後、ホストポリシーと報告されたステータスが信頼されている場合に限り `200` はv1ステータスを返します。それ以外の場合、`409 { error, code: "trust_grant_ineffective" }` はポリシー読み込みまたはIDE/ファイル拒否を含め、チェックされた状態/ソースを `error` で指定します。信頼ファイルの永続化失敗は `FatalConfigError` に対して `500 trusted_folders_invalid` を返し、それ以外の場合は `500 internal_error` を返します。信頼ファイルの読み取りは、JSONC書き込み側のコメントと末尾カンマを受け入れます。ルートはホットリロードなしでも提供されます：デーモン自身のAPIグラントはキャッシュされたv1ステータスを即座に更新しますが、起動時バインドゲートは再起動を必要とします（`requiresDaemonRestartForChanges: true`）。外部ターミナル/ファイル編集は、そのキャッシュされたステータスを更新するためにデーモンの再起動が必要です。 |
| `workspace_trust_hot_reload` | ワークスペース信頼ポリシー監視とランタイム世代調整が接続されているため、信頼の変更はデーモンを再起動せずに有効になり、v2信頼ステータスは収束を報告します。 |
| `channel_reload` | デーモン管理チャネルワーカーマネージャーが有効であり、現在の選択をリロードできます。 |
| `channel_control` | デーモン管理チャネルワーカーランタイム制御が接続されています。 |
| `channel_management` | ワークスペーススコープのチャネル設定、ライフサイクル、およびペアリング管理が接続されています。 |
| `channel_delete_config_loss_convergence` | ワークスペースチャネル管理が接続されています（`channel_management` と同じ条件）。`DELETE /workspaces/:workspace/channels/:name` は、ワーカーが解決するマージ済み設定ビュー（システム + ユーザー + ワークスペーススコープ）から設定が消失したチャネルを収束させます：ランタイムはそのチャネルについて沈黙しているか、そのワークスペース内で正確に1つのコミット済みワーカーオーナーを確認する必要があります。これは、そのスコープに保持されている永続化された起動時選択が削除される前に停止されます。代わりに `channel_instance_not_found` を報告するのではなく。マージ済みビューにはまだ含まれているが、ワークスペースの解決済みチャネル設定スコープが所有していない設定を持つチャネル — ワークスペースがプロジェクトディレクトリである間にユーザーまたはシステムスコープでのみ設定されているもの — はランタイムに触れずに `channel_instance_not_found` を報告します。解決済みスコープが設定しているチャネルは通常どおり削除され、ディレクトリがユーザーのホームディレクトリであるワークスペースはそのスコープを共有ユーザーファイルに解決するため、ユーザースコープのチャネルはそこで設定 — および削除 — されます。 |
| `multi_workspace_sessions` | 複数のワークスペースランタイムが登録されているため、セッション作成時にcwdによって信頼できるランタイムを選択できます。 |
| `multi_workspace_session_rewind` | 複数のワークスペースランタイムが登録されています。単数形のライブセッション巻き戻しルートは、オーナーランタイムを解決します。 |
| `multi_workspace_session_shell` | 複数のワークスペースランタイムが登録されており、ベアラ認証または信頼できるループバック権限下でセッションシェル実行が明示的に有効になっています。単数形のRESTシェルはオーナーランタイムを解決します。 |
| `dynamic_workspace_registration` | ワークスペースランタイムファクトリーがデーモンに接続されているため、既存の信頼できるディレクトリを実行時にセカンダリランタイムとして登録できます。 |
| `persistent_workspace_registration` | ワークスペース登録ストアがデーモンに接続されています。本番環境の `runQwenServe` はユーザーレベルのストアを自動的に供給します。直接の `createServeApp` 埋め込みでは、これを明示的に注入し、ワークスペースレジストリの起動時復元を自前で処理する必要があります。 |
| `scratch_workspace_registration` | 管理されたスクラッチワークスペースの作成が利用可能です。ランタイムファクトリ、検証済みの管理されたスクラットルート、およびランタイム破棄が接続されており、すべての管理されたランタイムはスクラットルートの境界を尊重します。 |
| `git_workspace_clone` | デーモンホストに `git` バイナリがあります。`POST /workspaces` を `{ kind: "git", url, target }` とともに使用すると、進捗状況、キャンセル、正規化された cwd を報告する非同期クローンジョブが開始されます。`git` を持たないホストはこのタグを省略します。 |
| `workspace_runtime_removal` | 削除可能な動的または永続性から復元されたセカンダリランタイムは、管理ルートを通じてドレインおよび削除できます。 |
| `workspace_directories` | デーモンはワークスペース設定を永続化し、すべての信頼できるローカルランタイムはライブセッションに追加ディレクトリを適用できます。`/workspaces/:workspace/directories` はワークスペーススコープ（`context.includeDirectories`）で永続化されたエントリのリスト表示、追加、削除を行います。SSH、管理型、スタンドアロンワークスペースは、タグが存在する場合でも拒否され、実験的なペアリングエンジンデーモンは、ワークスペーススコープの変更が管理された子プロセスに到達できないため、タグとルートを省略します。 |
| `native_directory_picker` | デーモンホストはネイティブOSディレクトリピッカーを開くことができます（macOSでは `osascript`、Windowsでは PowerShell、ディスプレイ付きLinuxホストでは `zenity`）。ヘッドレスホストはこのタグを省略するため、クライアントは確実に失敗するものを表示する代わりに、デーモンネイティブピッカーを控えます。Web Shellはピッカーが利用できない場合、[Browse]ボタンを隠します。[埋め込みホストディレクトリピッカー](../design/web-shell-host-directory-picker.md#public-api-and-precedence)がこのタグなしで提供することもできます。 |
| `workspace_runtime_stop` | デーモンはACPプロセス会計、完全な独立アクティビティおよびスケジュールタスク観察、確認済み停止および受領スナップショットをサポートするランタイムブリッジを所有しています。サポートされていない個々のランタイムはプレビューで無効になります。 |
| `workspace_runtime` | すべてのアクティブなワークスペースブリッジは権威あるランタイムライフサイクルスナップショットを提供します。混在またはレガシー注入ブリッジはこのタグを省略します。 |
| `workspace_skills_config_runtime` | すべてのアクティブなワークスペースは権威あるランタイムライフサイクルと、Skills管理および新規セッションコンポーザーで使用される分割されたconfig/runtime Skillsルートをサポートします。 |
| `skill_archive_install` | 権威あるワークスペースライフサイクル、生Skillアーカイブインストール、所有者スコープの試行受領が利用可能です。 |
| `skill_zip_file_source` | 権威あるワークスペースライフサイクル、デーモンローカルZIPコピー、所有者スコープの試行受領が利用可能です。 |
| `workspace_local_open` | デーモンホストはホストのOSファイルマネージャーでワークスペースディレクトリを開くことができます（macOSでは `open`、Windowsでは `explorer.exe`、ディスプレイ付きLinuxホストでは `xdg-open`）。ヘッドレスホストはこのタグを省略するため、クライアントは確実に起動失敗を表示する代わりに「Open-locally」機能を隠します。開かれるパスは常に解決された登録済みワークスペースcwdであり、`POST /workspaces/:workspace/open` を介して行われます。ルートはオプションのJSONボディ `{ "target": "terminal" }` （欠落/その他 = フォルダ）を受け入れ、`{ kind: 'workspace-local-open', opened: true, target }` に `target` が `folder` または `terminal` に設定されて応答します。 |
| `workspace_local_terminal` | デーモンホストはワークスペースディレクトリでターミナルウィンドウを開くことができます（macOSでは `open -a Terminal`、Windowsでは `wt.exe` および `cmd.exe` フォールバック、ディスプレイ付きLinuxホストでは `gnome-terminal`/`konsole`/`xterm`）。ヘッドレスホストはこのタグを省略するため、クライアントは確実に起動失敗を表示する代わりに「Open-in-terminal」機能を隠します。`POST /workspaces/:workspace/open` によってサービスされ、ボディは `{ "target": "terminal" }` です。 |
| `workspace_qualified_acp` | ACP HTTPおよびマルチワークスペースランタイムがアクティブであるため、複数形ACPエンドポイントはセカンダリランタイムを選択できます。 |
| `workspace_qualified_voice` | マルチワークスペースランタイムと共有ACP/Voice WebSocketリスナーがアクティブであるため、すべてのワークスペース修飾Voiceモダリティがセカンダリランタイムに対して到達可能です。 |
| `workspace_qualified_memory` | ACP HTTPおよびマルチワークスペースランタイムがアクティブであるため、ワークスペース修飾管理メモリルートはremember、forget、dream操作のためのワークスペース別タスクレーンを選択できます。 |
| `client_mcp_over_ws` | デーモンはACP WebSocket経由でクライアントホストMCPサーバーを受け入れます。これは明示的なオプトインであり、CDPトンネルパスには必須ではありません。 |
| `cdp_tunnel_over_ws` | デーモンは逆方向 `/cdp` WebSocketトンネルを公開します。これは明示的なオプトインまたはChrome拡張機能オリジンの許可によるものです。これはトンネルが存在することを意味するだけであり、Chrome DevTools MCPツールが登録されていることを意味しません。 |
| `browser_automation_mcp` | ACP HTTPが有効で、`cdp_tunnel_over_ws` がアクティブであり、ベアラートークンは `/cdp` をブロックせず、`QWEN_CDP_MCP_COMMAND` は外部stdio MCPアダプターを指します。メインCLIパッケージはブラウザ自動化アダプターをバンドルしていません。このタグがない場合、Chrome拡張機能サイドパネルチャットは動作する可能性がありますが、console/network/screenshot/clickツールはデフォルトで登録されません。 |
| `voice_transcribe` | Voice WebSocketエンドポイントがマウントされています。成功した文字起こしには設定されたVoiceモデルが依然として必要です。 |
| `realtime_voice` | macOS WebShellデーモンはLive Voiceが有効であり、ネイティブHostは `QWEN_SERVE_LIVE_NATIVE_HOST=1` でオプトインしています（デフォルトは無効；以下参照）。`/live/status` は準備完了状態を報告しますが、機能が有効になるまでこの機能は撤回されます。 |
| `realtime_voice_web` | Live Voiceが有効であり、Web Shellページ自体がWS `/live/web` 経由のオーディオエンドポイントとなる可能性があります（任意のプラットフォームで、デフォルトのエンドポイントです。ネイティブHostはmacOS限定かつオプトインです）。ルートは `/voice/stream` と同様に認証します（ベアラサブプロトコル）、信頼できるプライマリワークスペースが必要であり、簡略化されたhelloでLive Hostプロトコルを話します：マイク許可プラスオーディオ入力/出力セルフチェック。単一のHostリースが残ります：ネイティブHostはブラウザを上書きし（`4010`）、ブラウザはネイティブHostを置き換えることはなく（`4009`）、2番目のタブは `?takeover=1` のみで引き継ぎます。`/live/status` は `host.kind: "browser"` を報告します。画面キャプチャには共有画面が必要であり（以下参照）、ショートカット変更は次のネイティブHost用に保存され、登録はされません。 |
| `web_terminal` | ACP HTTPが有効であるため、認証済みWeb Terminalエンドポイントが利用可能です。 |
| `user_skill_activation` | ユーザー設定永続性が利用可能です。`PUT /skills/activation` は正確な名前のUserプリファレンスを保存し、非同期伝播をキューに入れます。 |

<!-- conditional-serve-features:end -->

Live VoiceはデフォルトですべてのプラットフォームにおいてWeb Shellエンドポイント（`realtime_voice_web`、WS `/live/web`）を使用します。ネイティブmacOS Hostはオプトインです：`QWEN_SERVE_LIVE_NATIVE_HOST=1` で起動されたmacOSデーモンのみが `realtime_voice` をアドバタイズし、WS `/live/host` を登録し、Liveが有効な場合にHostをインストールします。これがない場合、`/live/setup` は再試行不可の `install` エラーとともに `nativeHost: false` を報告し、`POST /live/setup/install` および `POST /live/setup/launch` は `409 live_native_host_unavailable` に応答します。

ブラウザ Host は、ユーザーがページと画面を共有している間のみ `host.capture_visual` に応答します。これはページが hello メッセージ内で `selfChecks.screenShare` として報告します。共有は別個の明示的な操作です。モデルはターン中に要求し、`getDisplayMedia` にはユーザーのジェスチャーが必要であるため、ページはストリームを保持し、リクエストごとに 1 フレームを取得します。何も共有されていない場合は、リクエストのタイムアウトを待たずに即座に `success: false` を返答します。

ページはデーモンのファイルシステムに書き込めないため、JPEG のみを送信します。デーモンはブラウザリースが報告する任意の `screenshotPath` を無視し、画像自体をネイティブ Host が書き込むのと同じプライベートキャプチャディレクトリ内に、自分で選んだ名前で保存します。ネイティブ Host は引き続き独自の PNG を永続化し、以前と同様にパスを渡します。

`mcp_guardrails`はこの条件付きテーブルには**含まれません**。これは常時有効なタグであり、バイナリが新しい`/workspace/mcp`予算フィールドをサポートしている場合、オペレーターが予算を設定したかどうかに関係なく常に告知されます。`--mcp-client-budget`を設定していないオペレーターも新しいフィールド（`budgetMode: 'off'`、`budgets: []`）を取得します。

`mcp_guardrail_events`（問題 [#4175](https://github.com/QwenLM/qwen-code/issues/4175) PR 14b）は、ポーリングループなしでMCP予算状態の閾値超過を検出する型付きSSEプッシュイベントを告知します。2つのフレームタイプが`GET /session/:id/events`に届きます：

- `mcp_budget_warning` — `reservedSlots.size / clientBudget`の上方向75%超過時に一度発火します。比率が37.5%未満（`MCP_BUDGET_REARM_FRACTION`）に下がった後にのみ再アームされます。PR 10の`slow_client_warning`ヒステリシスを反映していますが、サブスクライバーごとのバックログレベルではなくマネージャーレベルです。ペイロード: `{ liveCount, reservedCount, budget, thresholdRatio: 0.75, mode: 'warn' | 'enforce' }`。`warn`モードと`enforce`モードの両方で発火し、`off`では決して発火しません。
- `mcp_child_refused_batch` — 1つ以上のサーバーが拒否された場合、各`discoverAllMcpTools*`パスの終了時に発火し、さらに`readResource`遅延スパーン拒否パスでは長さ1のバッチとして発火します。ペイロード: `{ refusedServers: [{ name, transport, reason: 'budget_exhausted' }, ...], budget, liveCount, reservedCount, mode: 'enforce' }`。`mode`はリテラル`'enforce'`です。なぜなら`warn`モードでは決して拒否しないからです。

両方のイベントはセッションごとのSSE再生リング内に存在します（`id`を保持するため）、`Last-Event-ID`を使用して再接続するクライアントはそれらを通じて再開できます。`GET /workspace/mcp`のスナップショットは、長時間切断後の状態の信頼できる情報源のままです。告知されると常時有効になります — 条件付きトグルはありません。SDKリデューサー状態（`DaemonSessionViewState`）は、単純な遅延スタイルUIを望むアダプター向けに`mcpBudgetWarningCount`、`lastMcpBudgetWarning`、`mcpChildRefusedBatchCount`、`lastMcpChildRefusedBatch`を公開します。

## ルート

クライアントは`session_turn_status`を機能検出し、`GET /session/:id/turns/current`または`GET /session/:id/turns/:promptId`をポーリングできます。これらのルートはライブ所有Sessionを必要とし、他のワークスペースを読み込んだりスキャンしたりすることはありません。確定結果は、アクティブブランチから境界付きスキャンで読み取られるベストエフォートのトランスクリプトレコードです。`prompt_not_found`は、ライブキュー、64エントリのターミナルオーバーレイ、または境界付きアクティブウィンドウ内で結果が見つからなかったことを意味します。`resultText`は、最後のツール境界後、オプションのメッセージ書き換え前の生の最終親モデル回答であり、存在しない場合があります。32,768 UTF-16コードユニットを超える結果には`resultTruncated: true`と`resultCode: "RESULT_TEXT_TRUNCATED"`が含まれます。

### `GET /health`

生存性プローブ。デフォルト形式は、リスナーが生きている場合に`200 {"status":"ok"}`を返します — 安価で、ブリッジアクセスがなく、高頻度のk8s/Compose生存性プローブに適しています。

すべての管理対象ワークスペースランタイムにわたってブリッジ**カウンター**を集約するデーモン全体のプローブを行うには、`?deep=1`（`?deep=true`または裸の`?deep`も受け入れます）を渡します。まだドレイン中のワークスペースも含みます（情報提供のみであり、真の生存性チェックではありません）：

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

`sessions`、`pendingPermissions`、および`activePrompts`は合計です。`activeWork`は、任意のランタイムに承認済みだが未確定のプロンプト（FIFO待ちプロンプトを含む）、実行中のバックグラウンドAgent、キュー投入中/進行中のAgentターミナル通知、Session管理下のバックグラウンドシェルまたはワークフロー作業、または子所有のSessionターンがある場合にtrueになります。集約された`session`ホールドは、目標およびcron処理、履歴変更、およびキュー投入中または実行中のMonitor継続を含みます。フォアグラウンドプロンプトはデーモン所有のままです。実行中のMonitor、フォローアップ提案、およびシェルレジストリが追跡できなくなった外部プロセスは、このフィールドの外に残ります。これはセッションスコープです：まだセッションが添付されていないチャネルレベルの作業 — 進行中のスパーン、保留中のリストア、MCPディスカバリまたは認証 — はカウントされないため、`activeWork`はデーモンがそのチャネルの回収を依然として拒否している間にfalseを読む可能性があります。このフィールドを「デーモンは回収可能である」と解釈しないでください。セッション所有の作業のみを記述します。`activeWorkReporting`は、そのブール値のうち実際に保証されている割合を示します：`full`は、すべての必須カテゴリを報告する子からの最新レポートによってすべてのライブセッションがカバーされている場合、`none`は、セッションがレポートをネゴシエートしていない場合、`partial`はその間のすべて — 古いスナップショットや必須カテゴリを省略するネゴシエートされた子を含む — です。3つのレポート間隔より古いスナップショットはカバーとしてカウントされなくなります：セッションがアイドルであることを示すレポートではないため、セッションはあたかも子が一度もレポートしなかったかのように、再び保持中として読まれます。ネゴシエートされたが不完全な子に対して通常の自動クリーンアップも無効になります；`shell`または`session`を理解しない子は、完全な現在の述語に従って条件付きクローズを安全に認可できません。完全にサポートされていない過去の子はレガシークリーンアップ動作を保持し、明示的なクローズ、キル、シャットダウン、およびチャネル終了は強制操作のまま残ります。`activeWorkStaleMs`は、**カバーされたセッションの中で**ブール値が依存する最も古いスナップショットのエージングであり、セッションがカバーされていない場合は`0`です。これは診断用です。なぜなら鮮度はすでにデーモンによって`activeWorkReporting`に格付けされているからです（各チャネルのネゴシエートされた周期を知っているのはデーモンだけです）。格付けは、ランタイムごとに行われて結合されるのではなく、すべての管理対象ランタイムに対して一度計算されます — セッションがないランタイムは空虚に完了しており、それを証拠として扱うと、空のワークスペースが別のワークスペースの未報告セッションを保証できてしまいます。`lastActivityAt`は最新の非nullワークスペースアクティビティ時刻であり、`idleSinceMs`はその同じスナップショットから導出されます。`channelAlive`は、少なくとも1つの管理対象ワークスペースチャネルがライブであることを意味します。すべてのワークスペースが健全であることを意味するわけではありません。`connectedClients`とオプションの`rateLimitHits`は、ワークスペースごとの合計ではなく、デーモン全体のカウンターのままです。

再起動コントローラーは、以下の場合にデーモンをビジーとして扱うべきです：

```ts
const busy =
  health.activePrompts > 0 ||
  health.activeWork ||
  health.activeWorkReporting !== 'full';
```

第3項を削除すると、`activeWork === false`は「何の子からも何も知らされなかった」と区別できなくなり、これは行動を取ることが安全でない唯一のケースです。不明な応答と失敗したプローブも再起動を防ぐ必要があります。`activePrompts`は独立した互換性信号のまま残ります。

これらのフィールドは観測キャッシュであり、再起動リースではありません：新鮮で完全に格付けされた空の回答であっても、サンプリングされた瞬間を記述するものであり、直後に作業が始まる可能性があります。上記のルールは誤った再起動のリスクを大幅に低減しますが、排除するものではありません — 厳密な安全性には、新しい作業のアドミッションを停止し、ドレインを確認し、その後初めてシャットダウンするprepare-restartフェンスが必要です。

> ⚠️ 深いプローブは**情報提供のみ**であり、実際のライブネス検証やアトミックなリクレームリースではありません。ネゴシエートされた ACP サブプロセスは、ネゴシエートされた頻度でチャネル全体のアクティブワークスナップショットを公開し、デーモンはその鮮度を `activeWorkReporting` に分類しますが、レポートが欠落しているというだけでチャネルを強制終了することはありません。なぜなら、あるセッションの沈黙はプロセスが死んだ証拠ではないからです。トランスポートのライブネスと停滞した Agent の検出は別個のメカニズムです。`connectedClients` は REST SSE 接続をカウントし、すべての ACP トランスポートをカウントするわけではありません。アイドル時のリクレームには繰り返しサンプルとグレースフルシャットダウンを使用し、トランスポートおよびワークスペースごとの診断には認証付きの `/daemon/status` を使用してください。管理対象ランタイムゲッターが例外をスローした場合、深いヘルスは部分的な合計値を返すのではなく `503 {"status":"degraded","reason":"aggregation_failed"}` でフェイルクローズし、デーモンログに失敗したワークスペースランタイムが特定されます。ブートストラップ中、ランタイムレジストリの準備ができる前は、`Retry-After: 1` を伴う `503 {"status":"degraded","reason":"bootstrap"}` を返します。リスナーのライブネスを確認するには、`?deep` なしのデフォルトの `/health` を使用してください。

**認証:** ループバック以外のバインド時、およびループバックが `--require-auth` で強化されている場合に必須です。通常のループバックバインド（`127.0.0.0/8`、`localhost`、`::1`、`[::1]`）では、k8s/Compose ポッド内のプローブがトークンを保持する必要がないように、ベアラミドルウェアの前に `/health` が登録されます。ループバック以外（`--hostname 0.0.0.0` など）または強化されたループバックの場合、ルートはベアラミドルウェアの後に登録され、有効なトークンなしでは 401 を返します。これは、未認証の呼び出し元が任意のアドレスをプローブして `qwen serve` の存在を確認できる可能性があり、ポートスキャンと組み合わさると悪影響のある低深刻度の情報漏洩となるためです。通常のループバック免除においても、CORS 拒否 + Host アドレスリスト制限は適用されます。

### `GET /daemon/update`, `POST /daemon/update/prepare`, and `POST /daemon/update/restart`

これらの認証済みルートは、選択されたワークスペースとは独立して、デーモンの Qwen Code インストールを管理します。ACP セッション トランスポートを使用する SDK クライアントからのリクエストも含め、常に REST を使用します。`daemon_update` 機能はプロトコルを通知し、可用性は返される状態によって決定されます。

GET はダウンロードやアクティベーションを行わずにリリースを確認します。成功した確認は 15 分間、エラーは 1 分間キャッシュされ、`?refresh=true` は新しい確認を要求します。同時の確認は 1 つのルックアップを共有します。レスポンスには `state` (`available`、`up-to-date`、`installing`、`ready`、`restarting`、`unavailable`、または `error`)、`canInstall`、オプションの `currentVersion` と `latestVersion`、およびオプションの `instructions` と `message` が含まれます。`currentVersion` は、更新が準備された後を含め、実行中のデーモンを識別します。サポートされていないインストール方法は、`available` を `canInstall: false` および手動手順とともに報告する場合があります。

自動更新には、POSIX `process.execve` を備えた実際の CLI ライフサイクル、スタンドアロン インストール、または公開されたランチャーを実行しているグローバルな npm/pnpm/yarn/bun インストール（ステージングはグローバル プレフィックスに書き込まないため、root 所有の npm プレフィックスが含まれます）、および `general.enableAutoUpdate` を許可するオペレーター設定が必要です。埋め込みサーバー、Windows、サポートされていない Node ランタイム、開発モードは `unavailable` を報告します。グローバル/システム設定のみが適用され、ワークスペース設定ではインストールを有効にできません。接続はプライマリ リスナーとそのデーモン ランタイム トークン、またはトークンなしで明示的に信頼されたループバック デプロイメントを使用する必要があります。ペアリングされたブラウザと Local Control 接続は、資格情報またはリスナーが再起動後も存続しないため、`unavailable` を報告します。それらの更新ミューテーションは `403 update_connection_unsupported` を返します。

両方の POST ルートは、厳格なミューテーション ゲートのデーモン オペレーター権限を必要とし、パラメーターを受け入れません。サーバーがリリース、宛先、ランチャーを選択します。クライアントはバージョンやコマンドを指定できません。

- `POST /daemon/update/prepare` はバックグラウンド ダウンロードを開始し、`state: "installing"` を伴う `202` を返します。アクティブなインストールは変更しません。状態が `ready` になるまで GET をポーリングしてください。繰り返しの準備は同じ操作を共有し、準備済みの更新は `200` を返します。利用可能な自動更新がない場合は `409 update_unavailable` を返します。
- `POST /daemon/update/restart` は準備済みの更新を必要とし、そうでない場合は `409 update_not_ready` を返します。更新をアクティベーションする前に、`202` と `state: "restarting"` で応答し、デーモンをグレースフルにシャットダウンし、プロセスを更新後のランチャーに置き換えます。繰り返しのクリックは 1 つの再起動を共有します。応答後、デーモンは現在のリリースを一度再解決します。それが準備済みのものより新しく、ワンクリックでカバーできる場合、新しいリリースがステージングされ、準備済みのペイロードは破棄されるため、長期稼働中のデーモンは最初に準備した時点での最新ではなく、現在の最新に到達します。新しいペイロードは、置き換えられたものが破棄される前にコミットされ、その破棄はベストエフォートです。失敗した破棄はディスクをリークしますが、新しいペイロードが孤立したり、半分削除されている可能性のあるものにフォールバックしたりすることはありません。その後、`latestVersion` は新しいターゲットを報告し、`state` は `restarting` のままになります。再解決またはステージングの失敗は代わりに準備済みのリリースを適用します。レジストリの障害により、クリックが実行中のバージョンに取り残されることはありません。置き換えは PID、作業ディレクトリ、CLI オプション、バインドされたポート、有効なデーモン トークンを保持し、古いバージョン ピンをクリアし、ブラウザを開き直しません。クライアントは `currentVersion` が変化するまで GET をポーリングし、更新が要求されたときにキャプチャされた URL でドキュメントをリロードします。ステージングは `202` の後に実行され、数分かかる可能性があるため、クライアントはクリックからではなく、継続的な到達不能性から再起動期限を測定します。応答を返し続けているデーモンはまだ動作しています。寛大な絶対上限（20 分）は、到達可能だが決して `restarting` を離れないデーモンに対してバックストップとして機能します。これは単一のタイムアウト定数の上ではなく、ステージング チェーン全体の上に位置します。スタンドアロン アーカイブのダウンロードは OSS と GitHub を順次試み、それぞれに 5 分の予算があり、チェックサムと署名の取得にはさらに最大 2 分かかり、1 回の再ステージングではアクティベーション前にダウンロードと検証に約 12 分費やす可能性があります。管理された npm 子プロセスは 10 分に制限されています。すべてのギブアップ パスは画面に再試行可能なエントリを残します。スタックしたデーモンは制御が表示しない `restarting` を報告し続けるためです。再起動が承認されると、プロセスが置き換わるまで `restarting` はスティッキーになります。したがって、`currentVersion` が変更されないまま他の状態を報告する到達可能なデーモンは、置き換えが新しいビルドに反映されなかったことを意味します。クライアントは待機を終了し、確定した状態を発行し、バージョン変更を永久に待つ代わりに失敗を報告します。このチェックは、承認後に _開始_ されたポーリングにのみ適用されます。ステータス要求と再起動要求は独立しているため、以前に開始されたポーリングが再起動前のスナップショットを後に配信することがあり、それを確定したデーモンとして読み取ると、誤った失敗を報告し、成功した更新がユーザーに負っているリロードを抑制してしまいます。スタンドアロン ランチャーの検証はサービスを閉じる前に実行されます。チェックが失敗すると、デーモンは実行されたままになります。シャットダウン開始後またはプロセス置換中の障害は、回復が保証されません。

Web Shell はサポートされている利用可能な更新をバックグラウンドで自動的にチェックし準備します。準備済みの更新が完了した際、または手動手順を含む更新が利用可能になった際に、バージョンの横にある更新ボタンを表示します。手動手順の状態では、ボタンをクリックするとチェック時の手順を含むポップオーバーが開き、準備や再起動は行われません。準備と可用性はワークスペースランタイムのリロード後も維持されます。準備済みの更新はターゲットを固定します。`?refresh=true` を含むポーリング GET は、準備済み `latestVersion` を報告し続け、再ダウンロードを行わないため、複数のリリースにわたって稼働し続けるデーモンがバックグラウンドでダウンロードを繰り返すことはありません。ターゲットの再解決が行われるのは再起動時のみです。通常のデーモンシャットダウンでは準備済みダウンロードが破棄されます。有効化失敗時はデーモンの稼働を継続し `error` を報告します。1 分間のエラーキャッシュ経過後の次回チェック時に、リトライ用の新しいダウンロードを準備できます。自動更新を無効にすると、可用性が削除され、再起動開始前にダウンロードがクリーンアップされます。一度再起動が進行中になると中断されません。状態が `restarting` の間、ステータス、prepare、restart ルートはすべてオペレーター設定を参照せずに応答し、シャットダウン時のクリーンアップは no-op となるため、数分かかる再ステージング中にペイロードが取り除かれることはありません。ready 状態でボタンをクリックすると、デーモン全体が明示的に再起動され、アクティブなセッションが中断されます。

### `GET /daemon/status`

読み取り専用のオペレーター診断機能。`/health` と異なり、これは通常のデーモン API です。ループバックバインドを含め、ベアラ認証およびレート制限の後に登録されます。クエリパラメータ:

- `detail=summary` （デフォルト）はメモリ内のデーモン状態のみを読み取ります。
- `detail=full` には、ライブセッション診断、ACP 接続診断、認証デバイスフローカウント、およびワークスペースステータスセクションも含まれます。
- その他の `detail` は `400 { "code": "invalid_detail" }` を返します。

`summary` は意図的にワークスペースステータスメソッドを照会せず、ACP チャイルドプロセスを開始せず、セッションを生成しません。`full` は各ワークスペースセクションを独立して照会します。タイムアウトまたは例外が発生した場合、そのセクションのみが `unavailable` とマークされ、`workspace_status_unavailable` 問題が追加されます。

レスポンス形式：

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
    "maxRegisteredWorkspaces": 256,
    "maxChannelControlWorkspaces": 25,
    "maxSessions": 32,
    "maxTotalSessions": 800,
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

マルチワークスペースレスポンスには、`{ id, cwd, displayName?, primary, trusted }` を持つトップレベルの `workspaces[]` 行も含まれます。任意の表示名が未設定の場合は省略され、プレゼンテーション専用として扱われます。ステータスコンシューマーはランタイムを相関付けるために `id` または `cwd` を使用し続ける必要があります。

`runtime.perf` はオプションです。存在する場合、デーモンプロセスのイベントループ遅延、プロンプト FIFO キュー待機サンプル、およびデーモンチャイルドパイプバイトカウンターのみを報告します。ACP チャイルドプロセスのイベントループ遅延は `/daemon/status` に含まれません。

`status` は、いずれかの問題にエラー重大度がある場合は `error`、警告重大度がある場合は `warning`、それ以外の場合は `ok` です。問題コードは安定しており、`session_capacity_high`、`connection_capacity_high`、`pending_permissions`、`acp_channel_down`、`preflight_error`、`mcp_budget_warning`、`mcp_budget_exhausted`、`rate_limit_hits`、`channel_worker_exited`、`channel_worker_partial_connect`、`channel_restore_failed`、および `workspace_status_unavailable` が含まれます。リスナーが準備できてから完全なランタイムがマウントされるまでの短い期間中、`/daemon/status` は `daemon_runtime_starting` を報告する場合があります。非同期ランタイムマウントが失敗した場合、非ステータスランティアルートが `503` を返している間に `daemon_runtime_failed` を報告します。

`runtime.activity` はデーモン全体のプロンプトアクティビティを報告します。`activePrompts` は進行中のプロンプトを持つセッション数をカウントします。`pendingPrompts` は実行中のプロンプトと FIFO 待機中のプロンプトを含め、まだ完了していないすべての受け入れられたプロンプトをカウントします。`queuedPrompts` は受け入れられたがディスパッチされていない FIFO 待機中のプロンプトをカウントします。`lastActivityAt` は最後のプロンプト開始/終了またはセッション生成の ISO 8601 タイムスタンプです。`null` は、デーモンが起動以来一度もアクティビティを処理していない場合に表示されます。`idleSinceMs` は応答生成時に `lastActivityAt` から計算されます。

`limits.memory` は加算的であり、デーモンの解決済みメモリ数値を報告します：必須の `enforced: false`、`childHeap` オブジェクト（`mode`: `off`、`observe`、または `admit`；`admissionEnforced` は管理された `admit` の場合にのみ true）、`maxConcurrentChildren` および `perChildCeilingMb`（どちらも `mode: 'off'` 下での `null` で、これは何もモデル化しません）、そして `perChildCeilingMb` はさらに、`modeled.minChildHeapMb` 内でパーティションをモデル化できない場所 wherever `null` を報告します — つまり、プールがその階層で子プロセスを1つでもカバーできないか、上限が `modeled.legacyChildCeilingMb` にキャップされると天井がその下に着地するためです。これは `floor(available / 2)` であり、1024 MB 未満のホストでは床の下に落ちます。これは決して 0 にならず、そのような場合 `maxConcurrentChildren` は `0` です。パーティションをモデル化しないホストは欠落したモデルではなく計算された回答であるためです。また `refusals`（モデル化された制限を超えていたであろうスポーン）、`configuredBudgetMb`、`effectiveBudgetMb`（解決済みの cgroup/ホストメモリでキャップされた設定値）、`budgetSource`（`flag` / `derived`）、`availableMemoryMb`、`availableMemorySource`（`constrained` / `host`）、`insufficientMemory`、および `rootReserveMb`、`childPoolMb`、`minChildHeapMb`、`maxChildHeapMb`、`legacyChildCeilingMb`（ACP 子が今日受け取る天井の保守的なモデルで、実際の数値より低くなる可能性があります）を保持する `modeled` オブジェクトを含みます。`runtime.memory` はさらに `registeredWorkspaces`（登録数 — ドレイン中、移行中、またはブロックされているものを含む、削除されていないワークスペースエントリ。ライブ子プロセス数ではありません）、`activeAcpChildren`（ライブで終了していないチャネルを持つデーモン管理の ACP 子プロセス — 移行中またはブロックされているエントリを含みますが、キルが開始されたワークスペースは子が終了していなくても除外されます。チャネルワーカー、MCP 子孫、または未接続のスポーン予約は含まれません）、`childRssCoverage`（`active_children` — ライブチャネルを持つすべての ACP 子プロセス。これは `activeAcpChildren` がカウントするセットです。古いデーモンは `primary_only` を送信します）、以下で説明される `children` オブジェクト、および `recommendedShareAtRegisteredMb`（ワークスペースが登録されていない場合は `null`）と `recommendedShareAtActiveMb`（アクティブな子プロセスがない場合は `null`）を保持する `modeled` オブジェクトを含みます。各シェアはレガシー子プロセス上限でキャップされ、天井が許可する場合のみ最小子プロセスヒープでフロアされます。小さなホストでは天井が床の下にあるため、シェア × カウントが子プロセスプールを超える可能性があります。シェアはプールのパーティションではなく参考情報として解釈してください。子プロセスヒープのサイジングも参考情報です。これらの値から派生する子プロセススポーン引数はありません。オプトインの `admit` はモデル化された同時子プロセス数を強制しますが、デフォルトの `observe` は拒否されたであろう事象を記録するだけです。`runtime.memory.committedAcpChildren` はレジストリ解放まで終了中の子プロセスを含む、管理された ACP 予約と接続された子プロセスをカウントします。管理されたレジストリが利用できない場合は `null` です。`childHeap` は `modeled.childPoolMb` の固定パーティションをモデル化します。すべての子プロセスが同じ `perChildCeilingMb` を受け取るため、モデル化された合計はスポーンごとのシェアとして蓄積するのではなくプール内に収まります。`refusals` はアドミッションプレッシャーとしてのみ解釈してください。カウントが 0 でも、パーティションを適用しても安全であるとは **限りません**。子プロセスははるかに大きなホスト由来の天井で実行されるため、`perChildCeilingMb` より多くの旧世代スペースを必要とするワークロードはここでは健全であり、パーティションが適用されて初めて失敗するからです。非ゼロのカウントが容量プレッシャーを意味しない理由がさらに2つあります。アドミッション決定は終了する子プロセスが終了するまでカウントするため、すでに `maxConcurrentChildren` に達しているデーモンでは、すべてのチャネル置換が重複ウィンドウ中に拒否を予約します。また、パーティションをモデル化できないほど小さいホストでは `maxConcurrentChildren` は `0` であるため、`refusals` は総 ACP スポーン数と等しくなり、`insufficientMemory` がそれを説明するフィールドとなります。`admit` では、ゼロスロットモデルは起動に失敗します。容量枯渇に直面した完全管理デーモンは、ライブセッションや保留中の作業がない最も使用頻度の低い空の ACP を1つ回収し、追跡された解放を待ってから、スポーン前に一度だけアドミッションを再試行します。ロードされたセッションは保護され、ワークスペース登録と保存された履歴は保持されます。`refusals` カウンターは、最初の拒否後に成功した回収を含む、拒否されたアドミッション試行をカウントします。最終的なユーザー可視の失敗ではありません。枯渇した容量は、`Retry-After` なしで、`code: "acp_child_capacity_exhausted"`、`maxConcurrentChildren`、および `committedAcpChildren`（拒否された予約を除く）とともに REST HTTP 503 を返します。ACP JSON-RPC は、そのコードを含む `data.errorKind`、`data.httpStatus: 503`、および同じカウンターを持つ `-32603` を使用します。検証済みのプリディスパッチスタンドアロン作成ロールバックは `standalone_creation_rolled_back`、そのセッション ID と再試行可能性を保持し、容量コードとカウンターを `capacity` の下にネストします。不確実な作成結果は既存のリカバリセマンティクスを保持します。クライアントは自動容量再試行を停止し、ドラフトまたは選択されたセッションを手動再試行のために保持すべきです。通常の `runQwenServe` パスでは、ブートストラップアプリが作成される前に予算が解決されるため、`limits.memory` はブートストラップウィンドウ中すでに設定されています。`runQwenServeImpl` をバイパスする直接埋め込みなど、予算を解決しないパスでのみ `null` です。SDK タイプは `null` を許可するため、正しいクライアントはこれに対応します。

`runtime.memory.children` はそのブロック内で加算的であり、`childRssCoverage` が名前を挙げる子プロセス全体の集約 RSS を報告します：`rssBytes`（それらの自己申告 RSS の合計）、`sampled`（測定値を提供した数）、`oldestReadingAgeMs`（合計内の最古の測定値の経過時間。これにより呼び出し側は部分間の時間差を知ることができます）。`sampled` の分母は兄弟要素の `activeAcpChildren` であり、ブロック内には繰り返されません。`sampled` が低い場合、`rssBytes` は合計ではなくフロアです。サンプリングはアクティブな SSE/WS ウォッチャーによってゲートされるため、誰もストリーミングしていないデーモンに対するステータス要求は、ライブの子プロセスがあっても `sampled: 0` を報告します。隣接する `activeAcpChildren` によりこのギャップが見えるようになり、`rssBytes: 0` と `sampled: 0` は決して測定ゼロを意味しません。`oldestReadingAgeMs` は何もサンプリングされなかった場合、およびすべての寄与者がこのフィールド以前からのブリッジである場合にも `null` となるため、「新鮮」を意味することはありません。合計は過大評価かつ過小評価として読んでください：プロセスごとの RSS を合計すると子プロセス間で共有されるページが二重にカウントされる一方、各子プロセスは自身のプロセスのみを報告するため、その MCP 子孫とすべてのチャネルワーカーが欠落しています。これはデーモンツリーのメモリではありません。`primary_only` を報告するデーモンはこのフィールドを送信しないため、SDK ミラーではこのフィールドはオプションです。

`runtime.memory.children.heap` はそのブロック内で加算的であり、各 ACP 子プロセスの V8 オールドジェネレーションのライフタイム・ハイウォーターマークを報告します。これは **合計ではなく最大値**として集約されます: `peakOldGenerationBytes`, `peakLiveSetBytes`, `peakTotalHeapBytes`, `majorGcCount`, `majorGcMs`, `unclassifiedSpaceNames`, および `reported`。ヒープ上限は子プロセスごとに適用され、ピークに達したタイミングが異なるため、合計値には意味がありません。各フィールドは報告された子プロセス間での独立した最大値であり、特定の子プロセスのプロファイルではありません。また、子プロセスごとの上限はそれぞれの軸に対して個別に判定されます。`reported` は `sampled` のうちいくつが寄与したかをカウントし、一部の子プロセスがこれらのフィールドより前に存在していた場合は値が低くなります。すべてのバイト数は **オールドジェネレーション** をカバーしています。これは `--max-old-space-size` が実際に制限する対象であり、`old_space` だけではありません。なぜなら、子プロセスは `old_space` が数メガバイトしかない状態で上限を使い果たすことがあり、`large_object_space` がすべてを保持している可能性があるからです。`peakOldGenerationBytes` はコミット済みバイト数で、子プロセスに割り当てられた上限とともに増加するため、ワークロードが必要とする要件というよりも、必要とする量の上限として解釈してください。`peakLiveSetBytes` はメジャー GC 後も残存するメモリ量で、上限の変動に影響されないため、子プロセスが一つでも収まらないことを示せる指標となります。GC エントリは非同期で到着し、コレクションと読み取りの間で割り当てられたものはすべてカウントされるため、正確なライブセットではなく上限として解釈してください。`peakLiveSetBytes` はメジャー GC が観測されるまで `0` です。これは測定結果ではなく不在を示しています。`unclassifiedSpaceNames` は、報告されたどの子プロセスも分類できなかったヒープスペースの和集合です。V8 はバージョン間でスペースの名前を変更したり追加したりするため、未知のスペースは合計から除外されます。除外すると過小評価になるため、配列が空でない場合、バイト数は不完全であり、完全な測定値として解釈してはいけません。サンプリングされた子プロセスが一つも報告しない場合、オブジェクト全体はゼロ化されたオブジェクトではなく `null` になります。SSE/WS ウォッチャーが接続されていない場合は何もサンプリングされないため、これはエッジケースではなく通常の状態です。これらはすべて観察的なものであり、ここでの子プロセスのサイズ設定、起動拒否、または `limits.memory.enforced` を `false` から移動させることはありません。

`runtime.memory.pressure` はそのブロック内で加算的であり、デーモンルート自身のメモリ圧力を報告します: `mode` (`off` / `observe`), `level` (`normal` / `soft` / `hard` / `critical`), `source` (`rss` / `heap` / `unknown`), `ratio`, および比率の算出元となる 6 つの生数値 — `rssBytes`, `rssRatio`, `availableBytes`, `heapUsedBytes`, `heapRatio`, `heapLimitBytes`。`ratio` は `rssRatio` と `heapRatio` の大きい方であり、`source` はどちらであったかを名前で示します。同値の場合は `rss` として報告されます。`availableBytes` はバイト単位の `limits.memory.availableMemoryMb` です。これは意図的に検出された cgroup/ホストの値であり、`effectiveBudgetMb` ではありません。プロセスを終了させるのは実際の制限であり、オペレーターのポリシー数値ではないためです。`source: "unknown"` は両方の分母が測定不可能であることを意味し、健全であると解釈してはいけません。`level` はそのような場合にのみ `normal` となります。分類すべきものがないためです。これらの数値は **デーモンのルートプロセスのみ** をカバーしています。これはこのプロセス自身の `memoryUsage()` であるため、子プロセスが増加しても変動しません。`runtime.memory.children` はそれらを別々に報告し、どちらの数値もプロセスツリーのメモリではありません。両モードともブロック全体を報告します。ただし、`observe` のみがパスなしの `daemon_memory_pressure` 警告をステータスロールアップに追加するため、`off` はトップレベルの `status` を変更しません。どちらのモードでも修復処理は行われません。SDK ミラーでは、このフィールドが存在する以前に `runtime.memory` を出荷したデーモンがこのブロックをフィールドなしで送信するため、このフィールドはオプションです。

`limits.maxRegisteredWorkspaces` は加算的であり、解決済みのユーザー登録上限（デフォルト 256、1 から 256 で設定可能）を報告します。`limits.maxChannelControlWorkspaces` は、チャネルが無効になっている場合でも、標準デーモンにおける制御/復旧オーナーの独立した上限 25 を報告します。カスタムコントローラーは、この上限を実施する場合にのみこのフィールドを広告します。これらのフィールドはブートストラップおよび ready レスポンスの両方に存在しますが、古いデーモンでは省略される場合があります。チャネルコントローラーは、候補ワーカーを構築する前に、上限を超える過渡的なオーナー統合を `409 channel_control_workspace_limit_reached` で拒否します。起動時の統合が上限を超える場合は、リスナーが公開される前に起動が失敗するため、HTTP インターフェースはありません。登録容量は SDK チャネルタイムアウトを決定しません。

`limits.maxTotalSessions` は加算的です。`null` は、有効なデーモン全体の新しいセッション上限が無効であることを意味します。解決済みの登録容量（デフォルト 256、`QWEN_SERVE_MAX_WORKSPACES` または埋め込み `maxRegisteredWorkspaces` 経由で設定可能）が 25 を超え、かつ `--max-total-sessions` が省略されている場合、標準デーモンは一つの起動ワークスペースであっても固定総数 800 を使用します。登録容量が 25 以下の場合、有限の `maxSessionsPerWorkspace` を持つ複数の起動/復元ワークスペースは、同じ起動プラス復元カウントに対する `maxSessionsPerWorkspace * workspaceCount` として有効総数を一度だけ導出します。一つの起動または復元ワークスペースは無制限のデフォルトを保持します。明示的な総数制限（無効値を含む）が優先されます。後続の動的登録によって総数は再計算されません。直接の `createServeApp` 埋め込みは、独自の共有アドミッションポリシーを提供する必要があります。設定されると、デーモン全体で新しいセッション作成を制限し、既存の `session_limit_exceeded` エラー形状と `scope: "total"` を用いて総数制限違反を報告します。

`runtime.channel.live` はデーモン内の ACP ブリッジチャネルを報告します。これはチャネルアダプターワーカーではありません。デーモン管理チャネルは `runtime.channelWorker` を使用し、その `state` は `disabled`、`starting`、`running`、`exited`、`failed`、または `stopped` のいずれかです。ワーカーが `running` に到達して終了した場合、`/daemon/status` はデーモンをオンラインのままにし、警告問題コード `channel_worker_exited` を報告します。

明示的な `qwen serve --channel ...` からのデーモン管理チャネルワーカー起動は fail-fast のままであり、永続化された起動設定より優先されます。フラグなしのブートでは、信頼できるすべての登録済みワークスペースから `serve.channels` を復元し、それぞれが独自のスコープ設定内のリストを提供します。復元された名前は、通常どおり所有者が解決される単一の選択を形成し、名前をリストしたワークスペースが曖昧な所有権タイブレークを解消します。そのブート帰属はデーモンが稼働している限り持続します。`PUT /workspace/channel` によるそのような名前の再有効化は、途中で選択が停止されていた場合でも、ブート時と同じ方法で解決します。プライマリ以外のワークスペースが提供した名前は、解決できない場合にログとともに破棄されるため、あるワークスペースの古いエントリーによって他のワークスペースが孤立することはありません。プライマリワークスペースがリストした名前は、他のワークスペースにもリストされているかどうかに関係なく、復元全体を失敗させます。`all` はプライマリ専用として残ります。他の場所では無視され、報告されます。

ブート後に登録された信頼できるプライマリ以外のワークスペースは、独自の `serve.channels` も復元し、チャネルランタイムを読み込み、他に何も保持していない場合はチャネルサービスリースを予約します。その復元は:

- **デーモン実行ごとに一度だけ**発生します — ワークスペースが何かを要求した時点で記録されるため、後での削除と再登録、または信頼の再実体化によって、その間にそれらのチャネルの一つを停止したオペレーターの操作が取り消されることはありません;
- 明示的な `--channel` 選択下では発生しません。後から登録されたワークスペースによって拡張されることもありません;
- `DELETE /workspace/channel` がホスティングを停止した後、`PUT /workspace/channel` が選択を再度コミットするか、デーモンが再起動するまでは発生しません;
- コミット済みの `all` 選択はそのままにします;
- ワークスペース名をコミット済み選択に追加する際は、一度に変更し、遅延復元は一度ずつ行います。ホストできない名前を破棄して残りを保持するブートとは異なり、属性付けできない名前が存在する場合、そのワークスペースのリスト全体が復元されず、エラーは以下で説明する方法でログに記録され報告されます。

登録はチャネル制御を一切待ちません。復元はチャネル制御レーンにキューイングされ、応答はそれを待たずに書き込まれます。また、デーモンが既にホストしているチャネルに対して登録または信頼変更によってトリガーされる調整も同様に待機しません。したがって、準備完了にならないワーカーは、その後にキューイングされたチャネル処理のみを遅延させ、他の登録や信頼調整を遅延させることはありません。裏を返せば、`POST /workspaces`からの`201`はそのワークスペースのチャネルが稼働中であること、または所有する既存ホストチャネルの再起動が完了したことを意味しません。これについては`GET /workspace/channel`を参照してください。

明示的な選択、ブート時の`serve.channels`復元、上記のような登録がない場合、チャネルランタイムの読み込みは遅延のままになります。

保存された起動名は空であってはならず、先頭または末尾の空白を含んではならず、安全でない制御文字や不可視文字を含んではなりません。無効なエントリは個別にスキップされ、配列インデックスとともにログに記録されます。起動時にそれらを他のインスタンス名へトリミングしたり、設定を書き換えたりすることはありません。ワーカー引数は`--channel=<value>`を使用し、先頭のダッシュを名前の一部として保持します。

ワーカー起動前に無効な起動フィールド、検証エラー、またはリースエラーが発生した場合、自動復元はスキップされ、`serve.channels`を特定するログが残ります。一方、無関係な設定は有効なままです。ワーカー起動が失敗しても、クリーンアップが成功すればデーモンの継続実行が許可されます。グローバルランタイム起動タイムアウトと未確認のワーカー停止は、既存の起動失敗パスに従い、ワーカー終了が未確認の間はリースが保持されます。チャネル管理は永続化された起動設定と実際のランタイム状態を報告します。

一部の`serve.channels`名でデーモンが起動しなかったものは、ログだけでなく報告されます。そのような名前はコミット済み選択に参加しないため、ワッカースナップショットには含まれません。報告されるケースは次の3つです：

- 設定された起動選択のうち、ワーカー起動に失敗したもの。これはチャネルなしでデーモンがサービスを提供し続けるブートパスにおいて発生します。
- ワークスペースへの属性付け中にブート所有権レゾルバが破棄した名前。これをリストしていたすべてのワークスペースに対して報告されます。
- 各チャネルとそのエラーを名指しします。これが完全な表面であり、ブートレコードが書き込まれている間存在する唯一の

ブートストラップレスポンスにも含まれます。ワークスペースごとに最大64個のチャネルが名指しされ、

- `/daemon/status`はワークスペースごとに`channel_restore_failed`警告を一つ報告し、各チャネルとそのエラーを記載します。これは完全な情報であり、ブートレコードが書き込まれている間に存在する唯一の要素であるブートストラップ応答にも含まれます。ワークスペースあたり最大64チャネルまで記載可能で、各名前は128文字に制限され、リストが長い場合は`and <n> more`が付与されます。
- そのワークスペースの`GET /workspaces/:workspace/channels`は、`stopped`ではなく`runtime: { state: "error", lastError }`を用いてチャネルを一覧表示します。ここで`lastError`は、ワーカーがそのチャネルについてエラーを報告した場合はアダプター自身の起動エラーであり、そうでない場合は試行のエラーです。この情報はワークスペース固有のチャネル設定スコープから構築されるため、そのスコープで定義されている名前のみを保持できます。登録済みワークスペースが設定していない名前や、設定が別のワークスペースにある名前はここに行を持たず、`/daemon/status`でのみ報告されます。

`serve.channels`名がホストされないままになるその他の事象は、デーモンログでのみ診断されます。リスト全体が読み取れないか無効だったために失われた名前、プライマリが`all`を選択したために非プライマリワークスペースのリストが破棄された場合、コミット済み選択が`all`であるために遅延復元がスキップされた場合、およびリモート（SSH）ワークスペースのリストです。これらについてはデーモンログを確認してください。

レポートは、チャネルがホストされている間（このワークスペースまたは別のワークスペースからの復元による）、ワークスペースの登録が解除されるまで、またはオペレーターが操作を行うまで保持されます。その操作とは、チャネルに対する `POST` の開始、停止、再起動、`PUT`/`DELETE /workspace/channels/:name`、または選択内容を変更する `PUT`/`DELETE /workspace/channel` です。`PUT /workspace/channels/:name/startup` はレポートをクリアしません。失敗した試行について言及せずに `serve.channels` を書き換えるだけです。レポートはメモリに保持されます。再起動されたデーモンは再度復元を行い、その試行の結果を報告します。エラーテキストは認証情報を削除し、デーモンログのレンダリング方法と同様に長さが制限されています。

ワーカーが準備完了状態に達した後、予期しない終了はサーブスーパーバイザーにより制限付きポリシー内で再起動されます。5分間のウィンドウ内で最大3回の再起動試行が行われ、バックオフ時間は1秒、5秒、15秒の順です。ワーカーは15秒ごとにIPCハートビートを送信します。45秒間ハートビートが観測されない場合、スーパーバイザーはワーカーをスタールとみなし、強制終了して`staleHeartbeatAt`を記録し、同じ再起動パスを使用します。

`runtime.channelWorker` には、追加の運用フィールドが含まれる場合があります: `requestedChannels`, `pid`, `startedAt`, `exitCode`, `signal`, `error`, `restartCount`, `lastExitAt`, `lastRestartAt`, `nextRestartAt`, `lastHeartbeatAt`, `staleHeartbeatAt`, `startupFailures`, および `startupFailuresTruncated`。各起動失敗には `channel`, `phase` (現在 `connect`), オプションのアダプター提供の `code`, および認証情報をマスキングした `message` が含まれます。現在のワーカー世代に対しては最大 64 件の失敗が保持されます。切り詰めフラグは、さらに多くの失敗が観測されたことを意味します。`code` は診断用であり、安定したクロスアダプター分類ではありません。`restartCount` は、この serve プロセスが行った再起動試行の累計回数です。`restartCount > 0` を持つ実行中のワーカーは、他の問題がない限り健全です。`requestedChannels` に `channels` から欠落している名前が含まれる実行中のワーカーは、`channel_worker_partial_connect` を報告します。

マルチワークスペースデーモン (`--workspace` の繰り返し) では、`runtime` に加えて `channelWorkers[]` が含まれます。これは所有するワークスペースごとのエントリで、それぞれが `workspaceId`, `workspaceCwd`, および `primary` で注釈付けされた `channelWorker` スナップショットです。互換性のため、`channelWorker` はプライマリワークスペースのスナップショットとして引き続き設定されます。単一ワークスペースデーモンでは `channelWorkers[]` は省略されます。

### デーモン管理のチャネル制御

`channel_control` 機能は、ランタイム選択リソースを通知します。互換性パスが単数形の `/workspace` プレフィックスを使用する場合でも、このリソースはデーモン全体に適用されます。ランタイム選択は永続化されず、デーモンの起動時オプション `--channel` を変更しません。

`GET /workspace/channel` はイミュータブルなマネージャースナップショットを返します:

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

無効な場合、`selection` は `null` です。`pendingSelection` は変更要件中のみ存在します。`transition` は `idle`, `starting`, `reconciling`, `stopping`, または `rolling_back` のいずれかです。

`PUT /workspace/channel` は strict-gated であり、正確に1つの選択を受け入れます:

```json
{ "selection": { "mode": "all" } }
```

```json
{ "selection": { "mode": "names", "names": ["telegram", "feishu"] } }
```

名前はトリムおよび重複排除されますが、ソートは行われません。空の名前配列は無効です。`all` はプライマリワークスペース専用です。無効から有効への変更は `201` を返します。冪等な PUT または置換は `200` を返します。レスポンスは `{ changed, replaced, partial, state }` です。同じ選択の場合、健全なワーカーはその場に留まりますが、ワーカーが停止または失敗した同じ選択の場合は回復します。

`DELETE /workspace/channel` は厳格ゲート付きで冪等です。`{ changed, state }` を返します。成功時の状態は無効です。`POST /workspace/channel/reload` も厳格ゲート付きであり、設定を再読み込みし、ワークスペースグループを再解決し、コミット済みの選択を強制的に調整します。無効な場合は `409 channel_worker_not_enabled` を返します。`channel_reload` 機能は、マネージャーがコミット済みで再読み込み可能な選択を持っている場合にのみ動的に通知されます。

すべての有効化、置換、再読み込み、停止、およびデーモンシャットダウンは、1 つの FIFO ライフサイクルレーンに入ります。GET はそのレーンを待ちません。順序付けられた選択が変更されていないワークスペースグループはオンラインのままです。置換失敗時は、新たに開始されたワーカーの停止と、以前のコミット済み選択の復元を試みます。クリーンアップや復元も失敗する可能性があるため、クライアントは `rolledBack`, `rollbackError`, および `state` を確認する必要があります。デーモンはトランザクション全体を通じてチャネルサービス PID リースを保持し、関連するすべての子プロセスの終了が確認されるまで解放しません。

安定した制御エラーは次のとおりです:

- `400 invalid_channel_selection`、`channel_workspace_mismatch`、または `ambiguous_channel_workspace`
- `403 untrusted_workspace`
- `409 channel_service_conflict`、`channel_worker_not_enabled`、または `channel_control_workspace_limit_reached`
- `500 channel_worker_stop_failed`
- `502 channel_worker_start_failed` で、`rolledBack` とオプションの資格情報マスキング済み `rollbackError` を伴います
- `503 daemon_draining`

信頼できるループバック権限なしでゲートに到達したトークンなしのプライマリリクエストからの厳格な書き込みは、制御コードの実行前に `401 token_required` を返します。設定された認証情報の欠落または無効、およびペアリングされていない Local Control 認証情報は、より早い段階で通常の `401 Unauthorized` で拒否されます。信頼できるループバックのプライマリリクエストは通常どおり実行されます。リクエストが開始されると、HTTP クライアントの切断によってライフサイクルトランザクションはキャンセルされません。クライアントは同じ PUT を安全に再試行できます。

`502 channel_worker_start_failed` の場合、レスポンスには `startupFailures[]` と `startupFailuresTruncated` も含まれる場合があります。各失敗により、試行されたワーカーの信頼できる `workspaceCwd` が追加されます。これらのフィールドは失敗したトランザクションを記述しますが、`state` はロールバック後の現在の状態を記述します。後続の GET では失敗した試行は保持されません。部分的に接続されたワーカーは代わりに成功を返し、その失敗をワーカーのスナップショットで公開します。接続されたアダプターのない明示的な `--channel` ブートは起動に失敗します。設定由来の起動失敗はログに記録され、グローバルランタイム起動タイムアウトの対象となりますが、クリーンアップが成功すればデーモンの継続を許可します。クリーンアップの確認に失敗した場合、通常の起動失敗動作とサービスリースが保持されます。

`--daemon-url` なしの `qwen channel status` は pidfile メタデータを読み取り続けます。`--daemon-url` がある場合は `GET /workspace/channel` を読み取ります。再起動ウィンドウ中、serve が所有する pidfile は予約されたままですが、`workerPid` は省略されるため、クライアントは古いワーカープロセスを表示しません。マルチワークスペースデーモンでは、pidfile には追加の `workers[]` 配列 (ワークスペースごとの `workspaceId` / `workspaceCwd` / `channels` / ライブ `workerPid`) も含まれますが、上位レベルの `channels` (和集合) と `workerPid` (プライマリ) は古いリーダー向けに設定されたままです。単一ワークスペースデーモンは元の単一ワーカー形状を維持します。ワーカーの stdout/stderr は、ベアラートークン、機密性の高いワーカー環境値、およびプロキシ URL 認証情報をマスキングして、デーモンログに転送されます。

### ワークスペースチャネル管理

`channel_management` 機能は、ワークスペーススコープの Channel 設定とランタイム管理を通知します。単数形の `/workspace` ルートはプライマリランタイムを対象とします。`/workspaces/:workspace` は、登録済みで信頼できる正確なランタイムを解決し、プライマリランタイムへのフォールバックは行いません。

読み取り専用のディスカバリーでは次を使用する：

- `GET /workspace/channel-types`
- `GET /workspace/channels`
- `GET /workspace/channels/events`
- `GET /workspaces/:workspace/channel-types`
- `GET /workspaces/:workspace/channels`
- `GET /workspaces/:workspace/channels/events`

`GET .../channels/events` は、解決されたワークスペースのチャネルイベントジャーナルを `{ "events": [...], "truncated": boolean }` として `Cache-Control: no-store` と共に返し、オプションの `channelLinkMeta` メンバー（チャネルインスタンス名から非シークレットリンクメタデータへのマップ：`type` および `baseUrl`。それぞれが文字列として設定されている場合にのみ存在し、GitHub チャネルの場合は解決された `webOrigin` を含む。Web UI のオリジンクライアントは API ルートから再導出するのではなく、これを直接連結すべきです）を含みます。メタデータは、チャネルワーカーが実行するマージされたシステム＋ユーザー＋ワークスペース設定から解決されます。スコープローカルの管理リストには、別のスコープで設定されたチャネルは含まれません。また、解決された `cwd` がクエリ対象のワークスペースに属するチャネルにフィルタリングされるため、あるワークスペースが別のワークスペースのチャネルメタデータを受け取ることはありません。これにより、クライアントはユーザーまたはシステム設定から継承されたチャネルであっても、ジャーナル行（例：GitHub PR または issue 参照）にリンクできます。このメンバーは、解決されるチャネルがない場合は完全に省略され、古いデーモンはこれを送信しません。設定読み取りエラーが発生した場合、ジャーナル読み取りが失敗するのではなく、このメンバーが存在しない状態へと劣化します。各イベントは、チャネルが実行した操作（受信メッセージの受理またはスキップ（機械的理由：`reason_filter`、`mention_required`、`duplicate`、送信者ゲートによる拒否、`github_api_error`）、処理に失敗し再読取予定の GitHub スレッド（`failed` と `github_api_error`：GitHub エラー、またはチャネルが自身の状態を読み書きできない間のローカルエラー、あるいはスレッドのタスクの一つが未完了）、公開結果、受信タスク遷移、またはポーリング結果）を記録し、メッセージテキストを含むことはありません。20件以上の通知をフィルタリングする GitHub ポーリングでは、最初の20件を個別にジャーナルに記録し、残りの数を `detail.filtered` でカウントする追加の `reason_filter` 行を1つ記録するため、固定されたポーリングカーソルが同じバッチの繰り返しでジャーナルを溢れさせることを防ぎます。カーソルが保持されている間、ポーリングが再読取したコメントはウィンドウごとに1回ずつ `duplicate` または `mention_required` としてジャーナルに記録され、失敗しているスレッドはウィンドウ内の最初の失敗ポーリング時および10回ごとの失敗ポーリング時（レート制限または認証情報エラー：その最初および10回ごと）、そしてスキップされた際に1回、`github_api_error` として記録されます。ウィンドウごとの行は最大8,192キーで追跡され、キーが収まらなくなった行はすべてのポーリングでジャーナルに記録されます。クエリパラメータ：`limit`（1-500、デフォルト100）、`type`（カンマ区切りの `inbound`、`outbound`、`task`、`poll`）、`channel`（インスタンス名ごとにパラメータを1回繰り返す）、および `since`（ISO 8601）。このルートにはオペレーター権限は不要です。ジャーナル読み取りは非同期かつ境界付きです：現在のジャーナルに加え、チャネルごとに1つの回転ファイル、ファイルあたり256 KiB、リクエストあたり4 MiB、リクエストあたり32ファイル、最新順。リンクメタデータは、マージされた設定の副作用のないスナップショット（いくつかの小さな JSON ファイル、ランタイムの実効環境に対して解決）を同期的に追加読み取りします。これはベストエフォートの装飾であるため、失敗時はジャーナル読み取りを失敗させるのではなくメンバーを省略します。レコード制限または任意の読み取り境界によって結果が切り捨てられた場合（ファイルごとのテールウィンドウを超える高さのジャーナルを含む）、`truncated` は true になります。ジャーナルがまだ存在しないワークスペースは空のリストを返します。読み取り不可のスコープディレクトリは、空のリストではなく 5xx エラーを返します。

カタログは、この管理 API でサポートされる型を `manageable: true` でマークします。インスタンススナップショットには、リビジョン、秘匿化されたシークレットの有無を示すメタデータ、起動状態、およびランタイム状態が含まれます。リテラルなシークレットは決して返却されません。チャネルスナップショットは `Cache-Control: no-store` を使用します。

フィールドディスクリプタは、`properties` を通じてネストされたオブジェクトメタデータを公開できます。数値ディスクリプタは、開下限のために `exclusiveMinimum` を、包含上限のために `maximum` を使用できます。新たに宣言された境界外の保存済み数値は、クライアントが変更せずに再送信する場合でも受け入れられます。したがって、境界の宣言は既存のチャネルに対する無関係な編集をブロックしません。クライアントが実際に変更した値は、両方の境界を満たす必要があります。文字列およびシークレットディスクリプタは、クライアントに複数行のテキストエリアを求めるために `multiline` を使用できます。ディスクリプタタイプは、トップレベルのフィールドでのみこれを許可します。広告されたフィールドの種類を描画しないクライアントは、既存の設定値を強制削除するのではなく、そのまま保持する必要があります。また、単一行コントロールで `multiline` フィールドを描画するクライアントは、改行を除去した入力値を書き戻すのではなく、保存された値をそのまま保持する必要があります。オブジェクトフィールドは必須にできず、ネストされたプロパティはシークレットまたは環境変数で解決可能なフィールドにできません。これらの管理プロトコルはトップレベルのみです。ネストされた `required` プロパティは、親オブジェクトが書き込み中に存在する場合にのみ強制されます。親オブジェクトを省略すると、そのネストされた要件はチェックされません。書き込みは各フィールドの保存値を丸ごと置き換えるため、オブジェクトを保持するには保存されたオブジェクトを再送信する必要があります。デーモンは部分オブジェクトをマージしません。

設定の書き込みは楽観的並行性と厳格なオペレーター権限ゲートを使用します。

- `PUT /workspace/channels/:name`
- `DELETE /workspace/channels/:name`
- `PUT /workspace/channels/:name/startup`
- 同等の`/workspaces/:workspace/...`ルート

各設定の変更には `expectedRevision` が含まれます。アップサートリクエストには `config` オブジェクトが含まれ、明示的なシークレット操作：`preserve`、`replace`、または `clear` を含む場合があります。Channel 設定は、解決されたワークスペース外の仕事用ディレクトリを選択できません。

ランタイムアクションは、`POST` リクエストを `.../channels/:name/start`、`stop`、または `restart` に厳格にゲートします。これらは解決されたワークスペースが所有するワーカーに対してのみ動作します。

ペアリング管理は、`pairing` 送信者ポリシーまたはグループポリシーで設定されたインスタンスでのみ利用可能です:

- `GET .../channels/:name/pairing-requests`
- `POST .../channels/:name/pairing-requests/approve`と`{ "code": "..." }`
- `GET .../channels/:name/pairing-approvals`
- `{ "senderId": "..." }` または `{ "groupId": "..." }` を伴う `DELETE .../channels/:name/pairing-approvals`

すべてのペアリングルートは厳格なオペレーター権限を必要とし、`Cache-Control: no-store` を使用します。リクエスト、承認、および取り消しは、選択されたチャネルインスタンスとワークスペースの範囲に限定されます。保留中のリクエストには、型付きのユーザーまたはグループのサブジェクトが含まれます。グループのリクエストには、リクエストを開始した送信者も保持されます。承認スナップショットには `senderIds` と `groupIds` が含まれます。これは許可リストが表示名を永続化しないためです。不明なユーザーまたはグループを取り消すと `404 channel_pairing_approval_not_found` が返されます。

### チャネル配信とNotify

`channel_delivery` は即時かつベストエフォートの配信サポートを広告します。これはプロトコル機能であり、ワーカーのヘルスシグナルではありません。配信は欠落しているワーカーを開始せず、別のワークスペースへのフォールバック、再試行、アウトボックスの永続化、または履歴通知の再生も行いません。

ダイレクトNotifyはAgentとSessionをバイパスし、1回の送信試行を待ちます：

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

両方のルートは厳格なミューテーションゲートを使用します。修飾されたルートは登録済みで信頼できるワークスペースのみを解決します。成功は `200 {delivered:true,deliveryId}` です。`delivered:true` はチャネル送信 Promise が解決されたことを意味しますが、プロバイダーによる受け入れ、ユーザーによる受信、または既読レシートを保証するものではありません。IM アダプター間でのプロバイダー固有の応答検証と一貫したエラー理由セマンティクスは、この V1 契約の範囲外です。エラーは `400 channel_delivery_invalid`、`503 channel_worker_unavailable` または `channel_delivery_queue_full`、`504 channel_delivery_timeout`、および `502 channel_delivery_rejected` または `channel_delivery_failed` です。タイムアウトの結果は不明であり、再試行されません。意図的に個別の接続性テストエンドポイントはありません。通常の Notify 呼び出しがエンドツーエンドのテストとなります。

再生可能な結果イベントには、相関情報とサニタイズされたステータスのみが含まれます：

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

空の成功したPrompt最終レスポンスはエラーフィールドを省略します：

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

`source` は `prompt` または `scheduled` です。`status` は `delivered`、`failed`、または `skipped` です。`skipped` は、対象ターンが正常に完了したが、その最後のツールなしのアシスタント応答ブロックが空または空白のみであったことを意味します。デーモンは配信認可を消費し、イベントを公開しますが、チャネルワーカーを解決しません。スケジュールされた相関には `taskId` と `firedAt` を使用します。イベントにはターゲット ID、メッセージテキスト、認証情報、または Webhook シークレットは決して含まれません。

セキュリティ: 応答にはベアラートークン、クライアント ID、完全な ACP 接続 ID、デバイスフローのユーザーコード、または検証 URL は決して含まれません。両方の詳細レベルには追加的な `daemon.runId`、`daemon.logMode`、および `daemon.logHealth` が含まれる場合があります。`summary` はデーモンのログパスと損失の詳細を省略します。`full` には認証されたオペレーター向けに `logPath`、`logIssues`、`logDroppedRecords`、および `logDroppedBytes` が含まれる場合があります。劣化したファイルロギングでは、パスなしの `daemon_log_degraded` 警告が通常のステータスロールアップに追加されます。

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
    "maxRegisteredWorkspaces": 256,
    "maxChannelControlWorkspaces": 25,
    "maxPendingPromptsPerSession": 5,
    "maxSessionsPerWorkspace": 32,
    "maxTotalSessions": 800,
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

安定した契約: `v` が増加する場合、フレームレイアウトは後方互換性のない方法で変更されています。

> **`protocolVersions`** は、デーモンが対応できる serve プロトコルバージョンを記述します。`current` はデーモンの優先プロトコルバージョンであり、`supported` は互換性のあるセットです。特定のプロトコルを必要とするクライアントは `supported` を確認する必要があります。機能固有の UI は引き続き `features` でゲート制御を行います。v=1 に追加的: 古い v=1 デーモンはこのフィールドを省略するため、古いビルドを対象とする SDK クライアントはこれをオプションとして扱う必要があります。

> **Stage 1 では `modelServices` は常に `[]` です。** エージェントは単一のデフォルトモデルサービスを使用し、ワイヤー経由で列挙しません。Stage 2 では登録済みのモデルアダプターからこのフィールドを設定し、SDK クライアントがサービスピッカーを作成できるようにする予定です。それまでは、このフィールドが非空であることを前提としないでください。

> **`workspaceCwd`** は、デーモンのプライマリワークスペースの正規絶対パスです。これを使用して `POST /session` での `cwd` を省略し（ルートはこのプライマリパスにフォールバックします）、古い単一ワークスペースクライアントとの互換性を維持します。v=1 に追加的: §02 より前の v=1 デーモンはこのフィールドを省略するため、古いビルドを対象とするクライアントは消費前に null チェックを行う必要があります。

> **`workspaces[]`** は登録済みのすべてのランタイムを一覧表示します。新しい単一ワークスペースデーモンは、`multi_workspace_sessions` が存在しない場合でもプライマリラランタイムを含み、クライアントがワークスペース修飾ルートに必要な安定 ID を検出できるようにします。古いデーモンは配列を省略する場合があります。各エントリは `{ id, cwd, displayName?, primary, trusted, removable? }` です。`displayName` は表示専用であり、未設定の場合は省略されます。最初の/プライマリワークスペースは `workspaceCwd` によってミラーリングされ続けます。新しいクライアントは、そのエントリの `cwd` を `POST /session` に渡すことで非プライマリラランタイムを選択します。信頼されていないワークスペースは診断のために広告されますが、信頼の変更まで `403 untrusted_workspace` で新規セッション作成を拒否します。`removable` はランタイム削除をサポートするデーモンに存在し、プロセス動的または永続性復元されたセカンダリラランタイムに対してのみ true です。

> **`session_worktree_persistence_v1`** は、デーモンが Part 4A ワークツリー所有権を永続化および検証できることを意味します。成功したワークツリー作成レスポンス、およびアイドル時に再配置されたか、すでに検証済みワークツリーの cwd を報告している子を持つ復元レスポンスには、`worktree` メタデータと `worktreeState: "persisted-v1"` が含まれます。レガシーのベストエフォート復元、または parked ではなく restore-prompt が発火した cold 復元（`suppressWorktreeContextRestore` オフのため、ルートはブリッジに延期なしを要求しました）で、現在の cwd なしのアクティブなプロンプトを報告する場合は、その証明なしで `worktree` を返すことがあります。分離を要求するクライアントは、このタグをプリフライトし、各レスポンスを検証する必要があります。`worktree` オブジェクトだけでは永続的な所有権の証明ではありません。

> **`session_worktree_reset_v1`** は、デーモンがワークツリー所有権転送をサポートすることを意味します: `POST /session/:id/worktree-reset` は永続化されたワークツリーセッションのチェックアウト所有権を新しい代替セッションに移動します。復元レスポンスにはこれとともに 3 つの型付き 409 分類が含まれます: `worktree_session_superseded`（セッションのサイドカーに `supersededBy` リンクがあります — 分類はそのリンクのみから決定され、マーカー読み取りの前に行われ、リンクはマーカーが反転する前に書き込まれるため、ボディの `replacementSessionId` は所有権の証明ではなく検証のためのリダイレクトです: pre-commit 中断状態では、マーカー所有者ではないセッションを指し、それ自体を復元できず、再試行されたリセットによって回収されます）、`worktree_marker_missing`（チェックアウトマーカーが存在しません。タスクをリセットして再作成してください — 復元のリトライではできません。復元パスがマーカーを書き込むことはないため）、および `worktree_reset_interrupted`（以前の転送がサイドカーリンクが一致した状態で途中でクラッシュしました。リセットを再試行してください）。中断分類が最初にチェックされます: `supersedes`/`supersededBy` リンクが一致するマーカー欠落は `worktree_reset_interrupted` として現れ、`worktree_marker_missing` としては現れません。転送プロトコルと失敗分類については、以下のルートセクションを参照してください。

ワークスペース機能タグと `workspaces[]` は動的です。ワークスペースを追加するクライアントは、変更完了後に `/capabilities` を再度取得する必要があります。デーモンは以前レスポンスをキャッシュしたクライアントに機能変更をブロードキャストしません。永続性の忘却はアクティブなランタイムをアンロードしないため、そのランタイムは再起動まで広告され続けます。

### `GET /brand`

Web Shell の製品ブランディング。シェルをホワイトレーベルしたいホスト向けです。オペレーター設定スコープ内の `ui.brand` から解決されます。`web_shell_brand` 機能タグによってゲート制御されます; このルートを持たないデーモンは 404 を返答します。

```json
{
  "name": "QiuQiu Code",
  "logoDataUri": "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%2F%3E"
}
```

> **両方のフィールドはオプションであり、`{}` は正常なレスポンスです。** フィールドが存在しないことは「クライアントの内蔵ブランドを使用する」ことを意味します — Web Shell は独自の名前とインラインロゴを描画します。クライアントは空のボディをエラーとして扱ってはいけません。

> **ハンドラーは、設定されたロゴが拒否された場合でも常に 200 で応答します。** ファイルが存在しない場合、シンボリックリンクである場合、ハードリンクされたファイルである場合、ディレクトリである場合、SVG ドキュメントではない場合、またはコンテンツが 32 KiB を超える場合は、`logoDataUri` を含まないボディが返され、理由は `qwen serve: GET /brand: ui.brand.logoPath …` としてデーモンの stderr に書き込まれます。したがって、クライアントは「ブランドが設定されていない」と「オペレーターのロゴが拒否された」を区別できません。オペレーター向けのチャネルはデーモンログです。拒否よりも緩い警告が 2 つあります。1 つは、使用可能な `viewBox` と正のパーセンテージ以外の `width`/`height` (不正な形式または面積ゼロの viewBox は使用不可と見なされます) を持たないルート `<svg>` で、ブラウザはサイドバーの固定サイズで空白としてレンダリングする可能性があります。もう 1 つは、プレフィックスバインドされたルートであり、プレフィックスなしの要素にデフォルト名前空間バインディングがないため、それらが不可視になります。ハンドラーの前にあるミドルウェアは、実行される前に応答します — ベアラートークン認証が必要かつ存在しない場合は `401`、オプションのレートリミッターが有効な場合は `429`。ドレイン中のデーモンはこのルートを拒否しません: レートリミッターはドレイン中は寛容であるため、リスナーが閉じるまでハンドラーは 200 で応答し続け、クライアントは接続失敗を見ます。このルートでの起動時 503 はありません: デフォルトの遅延ランタイムパスでは、リクエストはランタイムが準備できるまで _保持_ され、その後 200 で応答されるため、短いクライアントタイムアウトが早期に発火する可能性があります。`code: "daemon_runtime_starting"` を伴う 503 は、ランタイムが準備できる前に応答する構成 (例: `--open`) の場合にのみこのルートに到達し、再試行可能です。`code: "daemon_runtime_failed"` を伴う 503 は、デーモンが再起動するまで終端的であり、`Retry-After` を含みません — 再試行しないでください。

> **ワークスペース設定は決して寄与しません。** ルートは `skipWorkspaceSettings` で設定を読み込むため、リポジトリの `.qwen/settings.json` は製品名を変更したり、デーモンが読み取りすべての接続済みブラウザにインライン化するファイルを指定したりすることはできません。システムデフォルト、ユーザー、およびシステムのみが、その優先順位で読み取られます。同じ理由により、プレースホルダー置換によってブランド値が変更される可能性がある場合、デーモンの stderr に警告とともにブランド値が拒否されます: 置換はプロセス全体の環境から取得しますが、これはブート時にワークスペースの `.qwen/.env` または `env` ブロックによって最初に設定されます。解決できないプレースホルダー (変数が未設定) はそのまま保持されるため、誤った変数名は暗黙的にフォールバックするのではなくリテラルテキストとして表示されます。

> **`logoDataUri` は画像としてレンダリングする必要があり、マークアップとして注入してはなりません。** デーモンは読み取った SVG をサニタイズしません。`img` src や favicon href 経由で読み込まれた SVG はスクリプトを実行できませんが、ドキュメントに注入された SVG は実行できます。Web Shell はこれを画像コンテキストにのみ割り当て、このインベリアントがサニタイザー不在を安全にしています。

> **プロセスグローバル。** ルートはワークスペースセレクターもセッション ID も受け取りません: この値はユーザーグローバル設定から導出されるため、デーモンが提供するすべてのワークスペースで同じです。これは `bearerAuth` とレートリミッターの後、Web Shell SPA フォールバックの前に登録されるため、任意の `Accept` ヘッダーに対して JSON で応答します。

### `POST /workspaces`

追加のワークスペースランタイムを登録します。パスは、他の登録済みワークスペースと重複または入れ子になっていない、既存でアクセス可能な絶対ディレクトリでなければなりません。クライアントが `persist: true` を送信しない限り、登録はプロセスローカルです。クライアントは永続化を要求する前に `persistent_workspace_registration` をプリフライトする必要があります。`workspace_display_name` が広告されている場合、リクエストにはオプションの `displayName` も含まれる場合があります。

`git_workspace_clone` が広告されている場合、同じルートは `{ "kind": "git", "url": "...", "target": "/absolute/new/path" }` も受け入れます。この形式では、まだ存在しない絶対的な `target` が必要であり、非同期クローンを開始し、何も登録せず、`202 { "kind": "git-workspace-clone", "jobId": "..." }` を返します。以下の `201` および `200` の応答は、同期の `cwd` および `scratch` の形式を説明しています。git 形式は何も登録せず、クローンの進捗状況とキャンセルには `GET`/`DELETE /workspace-git-clone-jobs/:jobId` を使用します。

```json
{
  "cwd": "/canonical/path/to/secondary-workspace",
  "persist": true,
  "displayName": "Payments Production"
}
```

新しく作成されたランタイムは `201` を返します。すでにアクティブなセカンダリワークスペースを永続的に昇格させる場合は `200` を返します。永続的な成功には `persisted: true` が含まれます:

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

`displayName` は、前後の空白がトリムされた後に 256 文字以内の文字列でなければなりません。空の結果は名前なしとして扱われ、内部 C0 (`U+0000`–`U+001F`) または DEL (`U+007F`) 制御文字は拒否されます。JSON `null` は作成値ではなく、`400 invalid_display_name` を返します。初期名を提供しない場合はフィールドを省略してください。重複した表示名は許可されています。プロセスローカル登録とともに提供された名前は、そのデーモンプロセス中のみ持続します。`persist: true` は永続的な登録とともに保存し、再起動後に復元できるようにします。すでに永続的なワークスペースに対するリクエストの繰り返しは冪等であり、名前を変更しません。

エラーには `400 invalid_path` / `invalid_persist_flag` / `invalid_persist_target` / `invalid_display_name`, `409 workspace_exists` / `workspace_nested` / `workspace_limit_reached` / `workspace_registration_store_too_large`, `500 workspace_registration_store_error` / `runtime_creation_failed`, および `501 persistence_not_available` / `not_implemented` が含まれます。

### `PATCH /workspaces/:workspace`

ワークスペース ID または URL エンコードされた絶対 cwd によって選択されたアクティブなワークスペースリソースを更新します。エンドポイントは現在、表示名メタデータのみをサポートしています:

```json
{ "displayName": "Payments Production" }
```

名前をクリアするには `{ "displayName": null }` を送信します。ここで `null` は更新専用削除センチネルです。null 以外の値は `POST /workspaces` と同じ文字列正規化ルールに従います。応答は更新された `{ id, cwd, displayName?, primary, trusted, removable? }` ワークスペースプロジェクションです。ランタイムメタデータは常に更新されます。ランタイムが一致する永続的な登録アイデンティティを持つ場合、すべてのエイリアスは既存のスキーマ v1 登録ストアを通じてアトミックに更新されます。エンドポイントが永続的な登録を作成または昇格することはありません。

サポートされていないフィールドは、暗黙的に無視されるのではなくフェイルクローズします。エラーには `400 empty_patch` / `invalid_display_name` / `unsupported_field` / `workspace_mismatch`, `409 workspace_registration_in_progress`, `500 workspace_registration_store_error`, および `503 daemon_shutting_down` が含まれます。

### `DELETE /workspaces/:workspace`

削除可能なセカンダリランタイムを 1 つ削除します。セレクターは複数形ワークスペースルーティングルールに従い、ワークスペース ID または URL エンコードされた絶対 cwd のいずれかを受け入れます。オプションの JSON ボディは `{ "force": boolean }` です。省略すると強制でない削除を要求します。

凍結されたランタイムにセッション、プロンプト、保留中の開始、ACP 接続、メモリタスク、またはワークスペースチャネルワーカーがある場合、強制でない削除は `activity` スナップショット付きの `409 workspace_busy` を返します。`{ "force": true }` を送信すると、これらのリソースの終了を要求します。永続的な削除はコミットポイントです: その後のクリーンアップは制限付きかつベストエフォートであり、クリーンアップの失敗はログに記録され、論理的な削除はランタイムを復元する代わりに依然として収束します。成功した応答は次のとおりです:

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

即時ビジー状態の強制でないリクエストは、高速なプレドレイン活動スナップショットを返します。ドレインが開始されると、ビジーまたは成功の応答には、アドミッションと ACP ドレインゲートが閉じた後、クリーンアップが開始される前に取得された最終スナップショットが含まれます。エラーには `400 invalid_force_flag` / `workspace_mismatch`, `409 workspace_busy` / `primary_workspace_removal_forbidden` / `static_workspace_removal_forbidden` / `workspace_removal_in_progress` / `workspace_registration_in_progress`, `500 workspace_persist_failed` / `workspace_runtime_removal_failed`, `501 workspace_runtime_removal_unsupported`, および `503 daemon_shutting_down` が含まれます。

### `GET /workspace-registrations`

このプライマリワークスペース用に永続化された望ましいワークスペースセットを一覧表示します。現在の起動中に保存されたディレクトリを復元できなかった場合、エントリは `active: false` で表示されたままになります。ランタイムがライブリソースを所有し続けるため、削除が完了するまでランタイムがドレイン中である間、エントリは `active: true` のままです。永続的な登録に存在する場合、エントリにはオプションの `displayName` が含まれます。

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

永続化された登録を1つ破棄します。これはアクティブなランタイムをアンロードしたり、そのセッションを終了したりしません。`restartRequired: true` は、アクティブなランタイムが次回のデーモン再起動時に消滅することを意味します。

```json
{ "removed": true, "active": true, "restartRequired": true }
```

`404 workspace_registration_not_found`、`500 workspace_registration_store_error`、または `501 persistence_not_available` を返します。他の変更ルートと同様に、デーモン認証が有効な場合、このエンドポイントには変更認証が必要です。

### 読み取り専用のランタイムステータスルート

これらのルートはデーモン側のランタイムスナップショットを報告します。これらは追加的な v1 ルートであり、状態を変更せず、serve プロトコルのバージョンも変更しません。ワークスペースステータスルートは、クライアントが GET ルートをポーリングするという理由だけで ACP 子プロセスを開始することを意図して **しません**。`GET /workspace/mcp` は、デーモンがアイドル状態で保持されている MCP 観測結果を持たない場合、空のスナップショットを含む `initialized: false` を返します。ライブの子プロセスが以前に応答した場合、アイドル時の読み取りはその観測結果を `source: "cache"` と元の `initialized` 値で再生します。`GET /workspace/skills` は代わりに保持されたデーモン観測結果またはデーモンローカル列挙を提供し、保持された観測結果が存在せず、両方のソースが利用できない場合（またはコールド読み取りがスロットリングされている場合）にのみ、**`errors` エントリ付きの** `initialized: false` （再利用可能なカタログではなく、再試行可能な利用不可）を報告します — [`GET /workspace/skills`](#get-workspaceskills) を参照してください。`GET /workspace/providers` はワークスペース設定と環境からデーモンローカルに応答されるため、ライブの ACP 子プロセスに依存せず、`acpChannelLive` はライブネスを報告します。その `initialized` は成功パスでは `true` であり、ワークスペース設定またはモデル構成を解決できない場合は `errors` エントリ付きの `false` です。デーモンローカルプロバイダービルダーなしで構築されたデーモンはライブ ACP スナップショットにフォールバックし、デーモンローカルの応答にはランタイムに登録されたモデルが含まれません。セッションステータスルートはライブセッションを必要とし、不明な ID に対しては `404 { code: "session_not_found", ... }` を返します。

機能タグ：

- `workspace_mcp` → `GET /workspace/mcp`
- `workspace_skills` → `GET /workspace/skills`
- `workspace_providers` → `GET /workspace/providers`
- `workspace_acp_status` → `GET /workspace/acp/status`
- `workspace_env` → `GET /workspace/env`
- `workspace_preflight` → `GET /workspace/preflight`
- `session_context` → `GET /session/:id/context`
- `session_supported_commands` → `GET /session/:id/supported-commands`
- `session_tasks` → `GET /session/:id/tasks`
- `session_resources` → `GET /session/:id/resources`
- `session_monitor_tool_correlation` → `GET /session/:id/tasks` からのモニターエントリには、トランスクリプトからタスクへの相関のために `toolUseId` が含まれます
- `session_status` → `GET /session/:id/status`
- `session_info` → `GET /workspace/:id/session-info` および `GET /workspaces/:workspace/session-info`
- `session_transcript` → `GET /session/:id/transcript`
- `workspace_persisted_transcript` → `GET /workspaces/:workspace/session/:id/transcript`
- `workspace_session_export` → `GET /workspaces/:workspace/session/:id/export`
- `workspace_archived_session_export` → `GET /workspaces/:workspace/session/:id/archive/export`
- `workspace_session_live_state` → `GET /workspaces/:workspace/sessions/live-state`
- `workspace_qualified_memory` → `POST /workspaces/:workspace/memory/{remember,forget,dream}` および `GET /workspaces/:workspace/memory/{remember,forget,dream}/:taskId`

`workspace_acp_status` はプライマリワークスペースの ACP チャネルの時点でのライブネスを `{ channelLive: boolean }` として報告します。ハンドラーはチャネルを作成しませんが、ランタイムルートに到達すると、遅延デーモンランタイムが最初に開始される場合があり、その設定された起動ポリシーは独立して ACP をプリヒートする可能性があります。スナップショットはリースではありません。クライアントはセッション作成時にチャネルの再検証または開始を許可する必要があります。

### ACP 予熱

機能タグ: `workspace_acp_preheat`.

`POST /workspace/acp/preheat?timeoutMs=N` はプライマリワークスペースの ACP チャネルをベストエフォートで初期化します。`timeoutMs` のデフォルトは 5000 であり、60000 以下でなければならない正の整数です。並行する呼び出し側とセッション作成は同じブリッジ初期化を共有します。リクエストタイムアウトはその HTTP 待機のみを終了させ、共有初期化をキャンセルしません。

```ts
interface WorkspaceAcpPreheatResult {
  ready: boolean;
  channelLive: boolean;
  durationMs: number;
  reason?: 'timeout' | 'error';
  error?: string;
}
```

`ready` は常に `channelLive` と等しい。ライブの応答では `reason` と `error` が省略され、それ以外の場合 `reason` は `timeout` または `error` となる。`durationMs` は現在の HTTP 呼び出しを測定するものであり、その呼び出しが参加した初期化全体のライフサイクルではない。運用上のタイムアウトまたは失敗は HTTP 200 を返す。無効な `timeoutMs` は 400 を返すが、認証、レート制限、遅延実行の失敗は通常の応答を維持する。

両方の ACP ワークスペースルートは単数形で、プライマリワークスペース専用である。クライアントはこれらをセカンダリワークスペースで使用したり、いずれかの応答を持続的な準備完了保証として解釈したりしてはならない。

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

`errorKind` は `/workspace/preflight`、`/workspace/env`、および（将来的には）MCP ガードレールで共有される閉じた列挙型であり、SDK クライアントが自由形式のメッセージを解析する代わりにカテゴリごとに修復措置を描画できるようにする。元の 7 つのステータスリテラルは #4175 に由来し、`restore_timeout` はセッション復元リクエスト用に別途追加された。`blocked_egress` は egress プローブが実装されるまで予約されたままとなる。

ステータスのペイロードには、MCP の環境変数の値、ヘッダー、OAuth/サービスアカウントの詳細、プロバイダー API キー、プロバイダーの `baseUrl` / `envKey`、スキル本体、スキルのファイルシステムパス、フック定義、シークレット環境変数の値は決して公開されない。`/workspace/env` はホワイトリストに登録された環境変数の**存在**のみを報告する。プロキシ URL は資格情報を削除され、送信前に `host:port` に縮約される。

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

`discoveryState` は `not_started`、`in_progress`、または `completed` のいずれかである。`transport` は `stdio`、`sse`、`http`、`websocket`、`sdk`、または `unknown` のいずれかである。`errors` は検出が成功した場合に省略される。

`source` は、観測結果を生成した子プロセスが生きている間 `"live"` である。デーモンがアイドル状態で、生きている子プロセスが以前に応答した場合、応答はその観測結果を `source: "cache"` および子プロセスの元の値（`initialized: true` とそのサーバーリストを含む）で再生する。キャッシュされた観測結果は、新しい MCP 検出が始まったときのみクリアされる。子プロセスの回収によって破棄されるわけではないため、アイドル状態の `GET /workspace/mcp` は現在生きている子プロセスが提供していないカタログを報告する場合がある。

**MCP クライアントのガードレール (issue [#4175](https://github.com/QwenLM/qwen-code/issues/4175))。** 現在のデーモンはペイロードに 4 つの追加フィールドと capability-scoped budget cell を拡張します:

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

`budgetMode` は `enforce`、`warn`、または `off` のいずれかです。予算が設定されていない場合、`clientBudget` は存在しません。`mcp_guardrails` を広告するデーモンでは、`budgets[]` は **常に配列** です（`budgetMode === 'off'` の場合は空になる可能性あり）。古いデーモンはこのフィールド自体を省略します。`mcp_workspace_pool` が広告されている場合、cell には `scope: 'workspace'` が含まれ、選択されたワークスペースランタイムの共有プールをカバーします。そのタグが存在しない場合（`QWEN_SERVE_NO_MCP_POOL=1` の下も含む）、レガシーマネージャーは `scope: 'session'` を出力します。コンシューマーは、認識できないスコープ値の追加を必ず許容する必要があります。

サーバーごとの cell における `disabledReason` は、オペレーターによる無効化（`'config'` — `disabledMcpServers` 設定リスト）と、予算による拒否（`'budget'` — 検出されたものの、`enforce` モードにより接続されなかった）を区別します。拒否は `Object.entries(mcpServers)` の宣言順によって決定論的です。サーバーごとの `status: 'error', errorKind: 'budget_exhausted'` は、生の `mcpStatus: 'disconnected'`（true だがオペレーター向けの深刻度ではない）をシャドウします。

予算の強制実行は capability-driven です。`mcp_workspace_pool` を使用すると、1 つのワークスペースランタイム内のセッションはトランスポートと 1 つの `WorkspaceMcpBudget` を共有します。異なるワークスペースランタイムはプールや予算を共有しません。このタグがない場合、各 ACP セッションの `McpClientManager` は上限のコピーを独自に強制実行し、スナップショットはそのレガシーセッションビューを表します。

**予算圧力の検出。** PR-14b 以降で両方のサーフェスが利用可能になります:

- **プッシュイベント**（`mcp_guardrail_events` で広告）: `GET /session/:id/events` を購読し、`KnownDaemonEvent` を通じて `mcp_budget_warning` / `mcp_child_refused_batch` フレームを絞り込みます。ステートマシンは上昇時の 75% 交差ごとに一度発火します（37.5% 未満で再アーム）。拒否は `enforce` モード下でディスカバリーパスごとに一度まとめられます。
- **スナップショットポーリング**（`mcp_guardrails` で広告）: `GET /workspace/mcp` を実行し、budget cell（`budgets[0]`）と `mcp_workspace_pool` を調べてそのスコープを判定します:

- `budgets[0].status === 'warning'` ⇔ `liveCount >= 0.75 * clientBudget` （PR 14b のヒステリシス閾値と一致し、プッシュイベントで使用されます）。
- 推奨ポーリング頻度：`budgets[0].status === 'error'`を既にポーリングしているものに合わせます；スナップショットは軽量であり、予算セルは追加のディスカバリーコストを伴いません。プッシュイベントを購読するSDKクライアントも、長時間切断後の状態確認のためにスナップショットから利益を得られます（SSE再生リングの深さは有限です — `refusedCount > 0`、デフォルト8000 — そのため、リングのカバー範囲より長くオフラインだったクライアントはスナップショット再同期にフォールバックします）。
- `budgets[0].status === 'ok'` ⇔ 75% 閾値未満かつ拒否なし。

推奨されるポーリング間隔: `/workspace/mcp` をすでにポーリングしているものに合わせます。スナップショットは軽量で、budget cell には追加のディスカバリーコストはありません。プッシュイベントを購読する SDK クライアントも、長時間の切断後の状態確認のためにスナップショットから利益を得られます（SSE リプレイリングの深さは有限であり、`--event-ring-size`、デフォルト 8000 — したがって、リングのカバー範囲より長くオフラインになったクライアントはスナップショット再同期にフォールバックします）。

### `GET /workspace/skills`

プライマリとワークスペース修飾付きのインベントリルートは、バックグラウンドで再検証しながら保持されたスナップショットを即座に返す。開始はタスク開始から計測され、1 秒に 1 回にスロットルされ、同時読み取りはタスクを共有する。ウォームバックグラウンド再検証は 5 秒後にスロットを解放する。タイムアウトは再試行を許可するが、観測または ACP 作業を取り消さない。コールド読み取りは、ACP で設定されたリクエストタイムアウト（デフォルトで 10 秒）、その後 ACP が利用できない場合のデーモンローカル列挙に従う。どちらのソースにもバックグラウンド期限を課さない。開始から 1 秒以内に失敗したコールド読み取りは、そのウィンドウの残りの部分を即座に利用不可ステータスで返す。より遅い失敗はスロットルウィンドウを残さないため、クライアント側で独自の再試行バックオフが必要になる。遅れて成功したバックグラウンド観測は再試行が保留中に公開できるが、すでに公開されている後から開始された観測を置き換えることはできない。無効化されたタスクは公開できない。無効化された観測が成功しても、元の呼び出し元に回答することはできる。明示的な無効化は既知の無効なインベントリを破棄し、スロットルをクリアする。タイムアウト前に完了した ACP プリヒートの成功も保持されたインベントリを無効化する。これは子プロセスがすでに生きている場合も含み、その後の読み取りで子プロセスが見えるようにする。タイムアウトしてからチャネルが生きていることを発見したプリヒートも `ready: true` を報告する — ready は常に `channelLive` と等しい — が、起動がまだ不完全な可能性があるため保持されたインベントリを維持する。次の読み取りはその保持データを返し、1 秒の開始スロットルが許可されるとバックグラウンド再検証がそれを置き換える。スキル削除はスナップショットとスロットルをバイパスするが、新しく列挙されたカタログが必要であり、ローカルフォールバックを使用し、保持されたスナップショットから応答することはない。有効化アイデンティティ読み取りはスナップショットとスロットルをバイパスし、新しい観測を待機し、両方のソースが失敗した場合はローカルフォールバック、次に保持されたスナップショットを使用する。

保持されたデーモン観測を含むインベントリアクティブには、オプションのスナップショットメタデータが追加で含まれる。直接の設定/ランタイムステータス読み取り、セッションリソースインベントリ、古いデーモンはこれを省略する。上書きされた成功したコールド読み取りは、利用可能な場合、より新しい保持されたスナップショットを返す。そうでない場合、このメタデータなしで自身のキャッシュされていない観測結果を返す。エラーのない初期化された観測結果のみが保持されたスナップショットを置き換えることができる:

```json
{
  "snapshot": {
    "observedAt": 1792486800000,
    "ageMs": 1500,
    "stale": true,
    "refreshing": true
  }
}
```

`observedAt` は、正常な観測の Unix ミリ秒単位の開始時刻です。`ageMs` は応答ごとに再計算され、収集時間を保守的に含みます。`stale` は、その観測が少なくとも 1 秒経過していることを意味します。`refreshing` は、再検証が共有スロットを占有しているかどうかを報告します。タイムアウトした観測は、スロットが解放された後も完了する場合があります。読み取り失敗、スロットのタイムアウト、およびランタイム停止後のリプレイはタイムスタンプを更新しません。後続の正常な公開は、独自の観測開始時刻を記録します。クライアントはこの経過時間を表示できますが、これはファイルシステムのリビジョンではなく、すべてのセッションが最新であることを保証するものではありません。初期化されたスナップショットが存在せず、両方のソースが利用できない場合（またはコールド読み取りがスロットリングされている場合）、応答には `initialized: false`、`errors` エントリが含まれ、`snapshot` メタデータはありません。これは再試行可能な一時的な利用不可であり、空のカatalogではありません。有効な空のカatalog は `initialized: true` を持ちます。ステータスの読み取りでは、セッションに影響を与える Skill の更新コマンドは呼び出されません。閉じた状態またはドレイン中のワークスペースランタイムは読み取りを拒否します。保持されたデータは、子チャネルの除去では生き残りますが、ランタイムの退役では失われます。

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
    },
    {
      "kind": "skill",
      "status": "ok",
      "name": "database-review",
      "description": "Review database changes",
      "level": "extension",
      "modelInvocable": true,
      "installedPath": "/home/alice/.qwen/extensions/alibabacloud-database-suite/skills/database-review/SKILL.md",
      "extensionName": "alibabacloud-database-suite",
      "extensionDisplayName": "Alibaba Cloud Database Suite"
    }
  ]
}
```

`level` は `project`、`user`、`extension`、または `bundled` のいずれかです。`userInvocable`（ブール値、省略可能）は通常のスキルに対しては省略されます（`true` を意味します）。手動で呼び出せないスキルの場合のみ `false` として存在します。これは、以下で説明する設定専用の Skill トグルルートを制御するものではありません。`modelInvocable` は独立しています。`false` は、スキルが手動では引き続き利用可能ですが、モデルからの呼び出しからは隠されることを意味します。`installedPath` は、スキルの `SKILL.md` への既存の絶対パスです。デーモンはこれを保存されたまま返し、シンボリックリンクの個別解決や正規化は行いません。現在のデーモンはすべてのスキルに対してこれを出力しますが、クライアントは古い v1 デーモンからの欠如を許容する必要があります。スキル本体、フック、`skillRoot`、およびその他のスキル設定は除外されたままです。検出が成功した場合、`errors` は省略されます。

拡張機能所有のスキルの場合、`extensionName` は正規化されたマニフェスト名であり、所有者識別子として安全に使用できます。`extensionDisplayName` はオプションのローカライズされた表示用値であり、一意ではない可能性があります。新しいクライアントは `extensionDisplayName ?? extensionName` を表示すべきです。古いデーモンは表示フィールドを省略します。

繰り返しの読み取りは、最後にコミットされたワークスペーススナップショットから提供され、子のメモリ内キャッシュに対して定期的に再検証されます。定常状態の読み取りでは、スキルディレクトリのスキャンや `SKILL.md` ファイルの再解析は行われません。コールドなデーモンローカルフォールバックはディスクから列挙を行うことができます。子は、拡張機能のソースが変更されていないことを確認します。具体的には、拡張機能ディレクトリの `readdir` と各エントリの `stat`、有効化ファイル、およびストアのアクティベーション状態を確認し、それらが移動した場合のみ更新します。そのため、デーモンの外でインストールまたはトグルされた拡張機能は、再検証によって拾い上げられ、その再検証が公開された後の subsequent な読み取りに表示されます。ウォーム読み取りは、バックグラウンド作業を開始する場合でも、常に保持された観測結果を返します。セーフモードとベアモードはこのチェックをスキップし、拡張機能を除外する動作と一致させます。

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

モデルは認証タイプ別にグループ化されています。プロバイダー接続診断情報は `/workspace/preflight` の `providers` セルにあります。環境プリフライト情報は `/workspace/preflight` と `/workspace/env` にあります（以下参照）。スナップショット構築が成功した場合、`errors` は省略されます。

### `GET /workspace/env`

デーモンプロセスのランタイム、プラットフォーム、サンドボックス、プロキシ、およびホワイトリストに登録された秘密環境変数の**存在**を報告します。常に `process.*` の状態から回答します。デーモンがこのルートを提供するために ACP 子を起動することは決してなく、ACP が稼働中であってもアイドル状態であっても応答は同一です。`acpChannelLive` フィールドは情報提供のみを目的としています。

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

セル形状:

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

**編集ポリシー。** `kind: 'env_var'` セルには `value` フィールドが決して含まれません。クライアントは `present: boolean` のみを見ます。`kind: 'proxy'` セルでは、生の環境変数値が資格情報編集処理（`redactProxyCredentials`）を通り、その後 `URL` 解析を通るため、ワイヤー上には `host:port` のみが載ります。`NO_PROXY` は URL ではなくホストリストであるため、編集処理をそのまま通過します。現在列挙されている秘密環境変数のホワイトリストには、`OPENAI_API_KEY`、`ANTHROPIC_API_KEY`、`GEMINI_API_KEY`、`GOOGLE_API_KEY`、`DASHSCOPE_API_KEY`、`OPENROUTER_API_KEY`、および `QWEN_SERVER_TOKEN` が含まれます。他の環境変数は列挙されないため、誤って設定された秘密情報は見えなくなります。

### `GET /workspace/preflight`

デーモンの準備完了チェックを報告します。**デーモンレベルのセル**（`node_version`、`cli_entry`、`workspace_dir`、`ripgrep`、`git`、`npm`）は常に `process.*` と `node:fs` から入力されます。**ACP レベルのセル**（`auth`、`mcp_discovery`、`skills`、`providers`、`tool_registry`、`egress`）はライブの ACP 子を必要とし、デーモンがアイドル状態の場合は `status: 'not_started'` プレースホルダを出力します。このルートはセルを入力するためだけに ACP を起動することはありません。対応するセルは `not_started` にフォールバックします。

アイドル時の応答（ACP 子なし）:

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

- `missing_binary` — Node バージョンが必須より低い、`QWEN_CLI_ENTRY` の欠如、ripgrep / git / npm が PATH にない（オプションのバイナリについてはエラーではなく警告）。
- `missing_file` — `boundWorkspace` が存在しないかディレクトリではない。欠落または読み取り不能なファイルを指すスキル解析エラー。
- `parse_error` — `SKILL.md` 解析失敗、不正な設定 JSON。
- `auth_env_error` — `validateAuthMethod` が null 以外の失敗文字列を返したか、プロバイダー解決から伝播された `ModelConfigError` サブクラス。
- `init_timeout` — ブリッジ内の `withTimeout` リジェクト（ACP ラウンドトリップ待機中の実際のタイムアウト）。`BridgeTimeoutError` 型付きクラスによって認識されます。注意：`connecting > 0` を持つ一時的な `mcp_discovery` `warning` セルはこの種類を含みません。これは進行中のハンドシェイクの通常の状態であり、実際のタイムアウトとは区別されます。
- `restore_timeout` — セッションの読み込みまたは再開が、専用の復元予算を超えました。REST レスポンスは `504` であり、再試行可能です。これは子プロセスの初期化や、制限付き再生ウィンドウの上限とは異なります。
- `protocol_error` — リクエスト中にチャネルが閉じられたため、またはツールレジストリが予期せず存在しなかったため、ACP `extMethod` が拒否されました。
- `blocked_egress` — PR 14 (#4175) 用に予約されています。PR 13 では `egress` セルを `status: 'not_started'` のままにしています。

プリフライトリクエストの処理中にブリッジが ACP 子プロセスに到達できなかった場合（例：リクエスト中のチャネルクローズ）、エンベロープの `errors` 配列には障害を示す単一の `ServeStatusCell` が含まれ、セルは `not_started` ACP プレースホルダーにフォールバックします。デーモンレベルのセルは引き続き返されます。

### `GET /workspace/tools`

プライマリワークスペースの ACP 子プロセスから報告されたツールカタログを返します。これはレガシーなプライマリワークスぺースルートです。ワークスペースセレクターがなく、非プライマリランタイムのツールを推測するために使用してはいけません。

```json
{
  "v": 1,
  "workspaceCwd": "/canonical/path",
  "initialized": true,
  "acpChannelLive": true,
  "tools": [
    {
      "name": "ReadFile",
      "displayName": "Read",
      "description": "Read a file",
      "enabled": true
    }
  ]
}
```

アクティブな ACP 子プロセスがない場合でも、ルートは `200` を返し、`acpChannelLive: false`、空の `tools` 配列、およびオプションの `errors` 配列内の `not_started` エントリを含みます。予期しないブリッジ障害は標準的な `500` ブリッジエラーレスポンスを使用します。TypeScript SDK メソッドは `workspaceTools()` です。専用の機能タグはないため、古いデーモンをサポートするクライアントは `404` を未対応として扱う必要があります。

### ワークスペースファイルルート

レガシーファイルルートはプライマリワークスペースを通じてパスを解決します。`/workspaces/:workspace/...` ルートは選択されたランタイムのワークスペースを通じてパスを解決します。レスポンスはワークスペース相対パスを使用し、通常の成功ケースでは絶対ファイルシステムパスを返しません。成功したファイルレスポンスには以下が含まれます:

```http
Cache-Control: no-store
X-Content-Type-Options: nosniff
```

ファイルシステムエラーはこの JSON 形式を使用します:

```json
{
  "errorKind": "hash_mismatch",
  "error": "expected sha256:..., found sha256:...",
  "hint": "re-read the file and retry with the latest hash",
  "status": 409
}
```

`errorKind` の値には `path_outside_workspace`、`symlink_escape`、`path_not_found`、`binary_file`、`file_too_large`、`untrusted_workspace`、`permission_denied`、`parse_error`、`hash_mismatch`、`file_already_exists`、`text_not_found`、および `ambiguous_text_match` が含まれます。

#### `GET /file`

テキストファイルを読み取ります。クエリパラメータ: `path` (必須)、`maxBytes`、`line`、`limit`、および `cursor`。デーモンはバイナリファイルを拒否します。256 KiB のフルスナップショット上限を超えるファイルには、少なくとも 1 つの明示的なウィンドウ引数（`line`、`limit`、または `maxBytes`）が必要です。これらが指定されていないリクエストは `file_too_large` のままになります。そのようなウィンドウはストリーミングされ、返される UTF-8 コンテンツは 256 KiB に制限されます。`maxBytes` は常にデコード後の UTF-8 レスポンスバイトに適用され、ソースがフルスナップショット上限内で他のサポートされているエンコーディングを使用している場合も含みます。

行オフセットはファイルの先頭からのスキャンによって解決されるため、ウィンドウへの到達に 8 MiB 以上（`MAX_TEXT_SCAN_BYTES`）を読む必要がある場合は `file_too_large` で拒否されます。より深いオフセットに直接到達するには `GET /file/bytes` を使用してください。ルートがデコードできないエンコーディングの大きなテキストは `binary_file` を返し、`file_too_large` を返しません — より小さなウィンドウで再試行しても助けにはならず、`readBytes` はバイナリに既に適用されている同じ対策です。

フルスナップショット上限内のファイルの場合、レスポンスには `hash` が含まれます。これはファイル全体の生ディスク上のバイトに対する SHA-256 ダイジェストであり、`line`、`limit`、または `maxBytes` がスライスを返した場合でも同様です。大きな部分ウィンドウでは `hash` を省略し、完全な `sizeBytes` を保持し、`truncated: true` を設定し、ストリームが EOF 前に停止した場合は `originalLineCount: null` を返します。

##### `cursor` によるページング

`workspace_file_read_cursor` 機能が必要です。さらにデータがあるレスポンスは `hasMore: true` を返し、ファイルバイトオフセットが導出可能な場合は `nextCursor` トークンを返します。これを `cursor` として渡すと O(1) で再開できますが、深い `line` オフセットはバイト 0 からのスキャンが必要になり、8 MiB を超えると拒否されます。

```
GET /file?path=big.log&limit=500          → { content, nextCursor, hasMore: true }
GET /file?path=big.log&limit=500&cursor=… → next page
```

`cursor` と `line` は相互排他的です（`parse_error`）— どちらも開始点を指定します。不正な形式または長すぎるカーソルは `parse_error` です。ファイルが置き換えられたり切り詰められたりしたカーソルは `hash_mismatch` (409) です。追加操作は未完了のカーソルを無効化**しません**。これがこの機能が存在する理由です。

`content` は他のすべての読み取りと同様に、最後の行の終端改行を省略するため、ページを再組み立てするクライアントはそれらを `\n` で結合します。`hasMore` は `nextCursor` の言い換えではありません: `limit` を使用して読み取られた小さな非 UTF-8 ファイルにはコンテンツが多いですが、導出可能なバイトオフセットがないため、`hasMore: true` を `nextCursor: null` とともに報告します。バイト上限が現在の行を切断する場合もカーソルは null になります。そのオフセットから再開すると部分的な行が返されるからです。多くの短い行がある場合、ページがバイト上限の前に終わり、カーソルを返すまで `limit` を下げてください。単一の巨大な行がある場合、次の行を明示的に要求してください（例えば、1 行目から開始する場合は `line=2`）。その後カーソルで続けます。完全な巨大な行が必要な場合は `GET /file/bytes` を使用してください。

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

デコードせずにファイルから生バイトを読み取ります。クエリパラメータ: `path` (必須)、`offset` (デフォルト `0`)、および `maxBytes` (デフォルト `65536`、最大 `262144`)。このルートは、ファイル全体を一括読み込みすることなく、大きなバイナリファイルに対する制限付きウィンドウをサポートします。レスポンスには、返されたウィンドウがファイル全体をカバーする場合のみ `hash` が含まれます。

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

#### `GET /stat`

プライマリワークスペースの 1 つのパスのメタデータを返します。クエリパラメータ `path` は必須です。

```json
{
  "kind": "stat",
  "path": "src/index.ts",
  "type": "file",
  "sizeBytes": 128,
  "modifiedMs": 1700000000123
}
```

`type` は `file`、`directory`、`symlink`、または `other` です。ルートはワークスペースファイル境界と、上記で説明した共通のファイルシステムエラーエンベロープを使用します。TypeScript SDK メソッドは `fileStat()` です。

#### `GET /list`

プライマリワークスペースのディレクトリを1つ一覧表示します。クエリパラメータ `path` は必須です。`includeIgnored=1`（または `true`）を指定すると、無視ルールに一致するエントリが含まれます。レスポンスは最大 2,000 エントリに制限され、それ以上存在する場合は `truncated: true` が設定されます。

```json
{
  "kind": "list",
  "path": ".",
  "entries": [{ "name": "src", "kind": "directory", "ignored": false }],
  "truncated": false,
  "matchedIgnore": null
}
```

各エントリの `kind` は `file`、`directory`、`symlink`、または `other` です。TypeScript SDK メソッドは `dirList()` です。

#### `GET /glob`

プライマリワークスペース内のパスを検索します。クエリパラメータ `pattern` は必須です。オプションの `cwd` で検索範囲を絞り込み、`includeIgnored=1`（または `true`）で無視されたパスを含め、`maxResults` は 1 から 50,000 の整数（デフォルトは 5,000）です。

```json
{
  "kind": "glob",
  "pattern": "**/*.ts",
  "cwd": "",
  "matches": ["src/index.ts"],
  "count": 1,
  "truncated": false,
  "durationMs": 4
}
```

一致結果はワークスペース相対です。無効なクエリ値は `400` を返します。ワークスペース信頼性、包含関係、パス欠落、予期しない失敗には共通のファイルシステムエラーエンベロープが使用されます。TypeScript SDK メソッドは `glob()` です。

#### `POST /file/write`

テキストファイルを作成または置き換えます。これは厳密な変更ルートです：トークンなしの信頼できるループバックからのプライマリリクエストは許可されます。信頼できるループバック権限なしでゲートに到達したトークンなしのプライマリリクエストは `401 { "code": "token_required" }` を返します。設定されたトークンおよび Local Control 認証情報の失敗は、より早い段階で単純な `401 Unauthorized` で拒否されます。`--require-auth` の場合、グローバルベアラミドルウェアがルート実行前に未認証のリクエストを拒否します。

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

`mode` は `create` または `replace` でなければなりません。`create` は既存のファイルを上書きしません（`409 file_already_exists`）。`replace` は `expectedHash` を必要とします。ハッシュが存在しないか不正な形式の場合は `400 parse_error`、古いハッシュの場合は `409 hash_mismatch` です。`expectedHash` は `sha256:` に小文字の16進数64桁を追加したもので、ディスク上の生バイトに対して計算されます。

`bom`、`encoding`、および `lineEnding` を指定できます。置き換え時は、デフォルトで既存ファイルのエンコーディングプロファイルを保持し、明示的なフィールドで上書きします。バイナリ書き込みは対象外です。

デーモンはターゲットディレクトリ内のランダムな一時ファイルに書き込み、サポートされている場合は fsync を実行し、`rename()` の直前に現在のハッシュを再チェックしてから、名前を変更して配置します。これにより部分的なファイル観察を防ぎ、同じファイルへのデーモン由来の書き込みをシリアル化しますが、プロセス間カーネル比較スワップではありません：最終ハッシュチェックと名前変更の間のわずかなウィンドウで外部エディタが競合する可能性があります。

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

既存のテキストファイルに正確なテキスト置換を1回適用します。これも厳密な変更ルートであり、`expectedHash` が必要です。

```json
{
  "path": "src/config.ts",
  "oldText": "timeout: 30000",
  "newText": "timeout: 60000",
  "expectedHash": "sha256:..."
}
```

`oldText` は空ではなく、完全に一度だけ出現しなければなりません。一致がない場合は `422 text_not_found`、複数一致する場合は `422 ambiguous_text_match` を返します。ルートはエンコーディング、BOM、改行コードを保持し、アトミックな名前変更の直前に `expectedHash` を再チェックします。

無視されたパスへの明示的な書き込み/編集は、認証された呼び出し元がパスを指定しているため許可されます。成功レスポンスと監査イベントには `matchedIgnore: "file" | "directory" | null` が含まれます。

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

#### `POST /workspaces/:workspace/directory/create`

`workspace_qualified_rest_core` と `workspace_directory_create`、厳密な変更権限、および信頼できるアクティブなローカルワークスペースが必要です。ボディ:

```json
{ "path": "src/new-folder" }
```

親が存在する必要があります。作成は排他的です：既存のファイルまたはディレクトリがある場合は `409 file_already_exists`、最終的なシンボリックリンクの場合は `400 symlink_escape` を返します。成功は `201 { "kind": "directory_create", "path": "src/new-folder" }` です。SDK メソッドは `WorkspaceDaemonClient.createWorkspaceDirectory(path, clientId?)` です。

#### `POST /workspaces/:workspace/directory/delete`

同じ厳密な変更および信頼できるローカルランタイムポリシーの下で、`workspace_qualified_rest_core` と `workspace_directory_delete` が必要です。ボディ:

```json
{ "path": "src/old-folder" }
```

空または非空のディレクトリを再帰的に削除します。ワークスペースルート、通常ファイル、最終的なシンボリックリンクは拒否されます。入れ子のシンボリックリンクエントリは、ターゲットを追跡せずに削除されます。ターゲットが存在しない場合は `404 path_not_found` を返します。成功は `200 { "kind": "directory_delete", "path": "src/old-folder" }` です。SDK メソッドは `WorkspaceDaemonClient.deleteWorkspaceDirectory(path, clientId?)` です。

両方のディレクトリルートは、選択されたワークスペース内で親を解決しながら、語彙上の最終名を保持します。パスは区切り文字で終わってはなりません。不審なパスパターンは `400 path_outside_workspace` を返し、不正なリーフ形状は `400 parse_error` を返します。サポートされていないカスタムファクトリは `422` を返します。SSH ワークスペースは SSH 境界によって `501` で拒否されます。不明、利用不可、削除済み、または信頼できないオーナーはプライマリにフォールバックしません。

削除は永久的であり、失敗時に部分的な削除が残る可能性があります。並行ライターが `ENOTEMPTY` を引き起こすことがあり、`503 io_error` として返されます。ライターが停止した後、同じ操作を再試行してください。パスごとのロックはディレクトリをすべての子書き込みに対してシリアル化せず、外部ディレクトリ置換は移植可能なパスベースのチェックではアトミックにできません。無視されたディレクトリへの明示的な変更は許可され、該当する場合、監査イベントは `matchedIgnore` を注釈付けします。作成記録は `sizeBytes: 0` です。

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

トップレベルセッションの場合、`state` は `POST /session`、`POST /session/:id/load`、および `POST /session/:id/resume` で使用される同じ ACP モデル/モード/設定オプションの形状を反映します。`subagent.` プレフィックス付きの仮想セッション ID はその親ランタイムに対して解決され、空の `state` オブジェクトを返します。

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

`availableCommands` は `available_commands_update` SSE 通知で使用される同じコマンドスナップショットです。`availableSkills` はスキル名のみを一覧表示します。クライアントはこのルート経由でスキル本体やパスを期待してはなりません。

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

このルートは読み取り専用のアウトオブバンドスナップショットです。意図的にプロンプトではなく、セッションがストリーミング中に照会できます。レスポンスにはエージェント、シェル、モニタータスクレジストリからのホワイトリスト化されたメタデータのみが含まれ、コントローラー、タイマー、オフセット、保留中のメッセージ、生のレジストリオブジェクトは公開されません。

別のサブエージェントによって生成されたエージェントタスク（ネストされたサブエージェント、`maxSubagentDepth`で制限）には、3つのオプションの系譜フィールドが含まれます: `parentAgentId`（生成元のエージェントタスクの`id`）、`parentName`（登録時にキャプチャされるため、親がレジストリから退避されても保持される、生成元エージェントの`subagentType`）、および`depth`（0ベースの起動深さ; 0 = トップレベルセッションによって生成）。トップレベルセッションによって起動されたエージェントは`parentAgentId`と`parentName`を省略します。クライアントはこれら3つのフィールドすべてをオプションとして扱い、存在しない場合はフラットなリストにフォールバックする必要があります。

### `GET /session/:id/tasks/:taskId/runtime`

1つのシェルタスク用のオンデマンド詳細。`GET /session/:id/tasks`はライフサイクル事実のみを含みます。このルートはキャプチャされた出力ファイルを読み取り、プロセスツリーをプローブするため、開いている詳細パネルはこれを個別に要求します。

ACPメソッドは`_qwen/session/task_runtime`で、`sessionId`と`taskId`のパラメータを持ちます。両方のトランスポートはライブセッションオーナーを解決し、ACPでは接続がセッションを所有していることも必要です。

パスの`taskId`は、セッション自身のシェルレジストリに対して解決されます。呼び出し側はファイルパスを渡しません。

```json
{
  "v": 1,
  "sessionId": "<sid>",
  "taskId": "bg_0123abcd",
  "runtime": {
    "memoryBytes": 104857600,
    "outputBytes": 65536,
    "outputModifiedAt": 1700000000000,
    "outputTail": "ready in 120ms\n",
    "outputTailTruncated": true
  }
}
```

タスクが不明な場合、退避された場合、またはシェルタスクでない場合、`runtime`は`null`です。`memoryBytes`はシェルのプロセスツリーの常駐セットで、タスクの実行中のみサンプリングされます。共有ページはプロセスごとに1回カウントされ、コンテナサンドボックスはラッパープロセスのみを公開する場合があります。`outputTail`は完了通知で使用される同じ8 KiBの上限で制限され、`outputTailTruncated`はファイルの途中で始まる末尾を示します。ファイルが読み取れない場合、`outputError`が設定されます。成功した部分からのフィールドはまだ存在する可能性があります。

### `POST /session/:id/tasks/:taskId/workflow-action`

ワークフロー実行を制御するか、新しい実行を開始します。ACPメソッドは`_qwen/session/tasks/workflow_action`です。

```json
{
  "action": "run-script",
  "script": "export const meta = { name: 'daily-audit', description: 'Audits yesterday' }\nreturn await agent(args.question)",
  "args": { "question": "which tables grew?" },
  "sourceRef": { "id": "definition-7", "revision": "rev-3" }
}
```

`taskId` が何を指すかはアクションによります:

| `action` | `taskId` | 実行を開始 |
| ----------------------------------- | ------------------------------------------------------------------ | ---------------------- |
| `pause`, `resume`, `retry`, `rerun` | 実行 ID | `retry` と `rerun` が行う |
| `delete-history` | 実行 ID | いいえ |
| `run-saved` | 保存されたワークフローの名前、拡張機能の場合は `<extension>:<name>` | はい |
| `run-script` | 呼び出し側が選択する開始キー | はい |

`args`、`sourceRef`、および`script`は`run-saved`と`run-script`によってのみ読み取られます。`args`はスクリプトの`args`グローバルにバインドされ、任意のJSON値を取り得ます。`sourceRef`は呼び出し側の独自の`{id, revision}`で、実行、そのジャーナル、およびそのスナップショットに記録されます。`script`はソース`run-script`が実行するものであり、それによって必須とされます。リトライまたは再実行は、元の独自の実行の`args`と`sourceRef`を再生します。これが同じ実行であることを保証するため、これらのフィールドは制御アクションとともに無視されます。

開始された実行はセッション所有です。承認プロンプトなしでバックグラウンドで実行され、その完了はセッションの完了チャネルに到達します。その後、他の実行と同様に`retry`/`rerun`ターゲットになります。

`retry`と`rerun`は、履歴から復元された実行（`GET /session/:id/tasks`内の`isHistorical`など、デーモンの再起動によって中断されたものなど）も受け入れます。実行はスナップショットのスクリプト、`args`、および`sourceRef`から再び開始され、アクションを送信したセッションに登録され、その完了を報告します。`retry`は同じ実行IDの下で実行のジャーナルを再開し、まだプロセスが実行されていない`failed`実行に適用されます。`rerun`は、終了した実行から新しい実行IDを開始します。`argsOmitted`を持つ履歴エントリは、保持するには大きすぎる`args`で起動されたため、どちらのアクションも適用されません。`args`が保持される前に書き込まれたスナップショットも適用されません。これは`argsOmitted`も`argsRecorded`も含みません。実行のジャーナルはその`args`のハッシュからキー付けされるため、その`args`を履歴が特定できないものを再起動すると、何も再生されずすべてのエージェントが再ディスパッチされます。両方の拒否は`workflow_args_unavailable`であり、`GET /session/:id/tasks`は両方をエントリ上の`argsUnavailable`として報告します。これにより、クライアントは呼び出しを行うことで拒否を発見する代わりに、2つのアクションを保留できます。`argsOmitted`は理由としてその隣に残り、どの理由かを伝えたいクライアント向けとなります。`args`自体は決してワイヤー上に置かれません。

`run-script`は定義名を渡さないため、実行はスクリプト自身の`export const meta`でラベル付けされます。コンパイルされたスクリプトはそれを宣言すべきですが、そうでない場合、実行はIDのみを表示します。

応答は、開始された実行の場合は`{"changed": true, "status": "running", "taskId": "<runId>"}`、有効になった制御アクションの場合は`{"changed": true, "status": "<status>"}`、何も发生しなかった場合は`{"changed": false}`です。セッションでWorkflowが利用不可（無効化、ベアモード、信頼できないフォルダ）、ワークスペースが信頼できない、保存されたワークフロー名が不明、実行IDが不明、または同じ`taskId`の下で別の開始がすでに進行中の場合です。重複する開始のみが重複排除されます。1つの`taskId`の下での2つの同時`run-script`呼び出しは1つの実行を開始します。その開始が返ると、キーは解放されます。再度送信すると別の実行を開始できますが、最初の実行がまだアクティブである可能性があります。このキーは、レスポンスを失った後のリトライ冪等性を提供しません。

拒否されたパラメータは、開始された実行ではなく`400`（ACP経由では`-32602`）です。不明な`action`、`script`のない`run-script`、空でない文字列の`{id, revision}`ではない`sourceRef`、または構文エラーや決定性違反のために起動前に拒否されたスクリプトです。Workflow開始入力エラーは`workflow_invalid_params`を含み、拒否メッセージを保持します。

4つの拒否は、リクエストではなく実行の保存された状態から生じます。それぞれはACP経由で`-32602`であり、その`errorKind`とその`data.httpStatus`を含みます。3つは`409`です。4番目の`workflow_not_recorded`は`503`です。何も開始されず、同じ呼び出しを単に再試行できる可能性があるためです。`retry`は、実行が再び実行中であることを開始前に記録します。この記録が別のプロセスによる二重開始を防ぎますが、その記録を書き込めませんでした。

| `code` / `errorKind` | HTTP | 時期 | 対処方法 |
| ------------------------------ | ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| `workflow_journal_unavailable` | `409` | ディスク上にジャーナルがない、または読み取れない `retry` の実行 | それを `rerun` し、最初から開始します |
| `workflow_args_unavailable` | `409` | `argsUnavailable`とマークされた履歴エントリの`retry`または`rerun`：その`args`が大きすぎて保持できなかったか、スナップショットが保持開始以前のもの | `run-saved`または`run-script`とその`args`で再度開始する |
| `workflow_run_live_elsewhere` | `409` | チェックポイントが終了していないプロセス（まだ実行中、別のマシン上、またはPIDが再利用されたもの）を記録している実行の `retry` | それを `rerun` し、新しい実行IDを取得します |
| `workflow_not_recorded` | `503` | 実行が再び実行中であるという記録を書き込めなかったため、開始されなかった `retry` | 同じ呼び出しを再度行います。実行は影響を受けません |

`workflowToolFeatures` は `GET /session/:id/supported-commands` で `runSavedArgs` と `runScript` を広告します。これらを備えないデーモンは、開始入力も `run-script` アクションも受け付けません。また `nameOnly` を含み、セッションのモデルが名前付きワークフローのみを実行できる場合に true となります（`tools.workflowNameOnly`）。モデル自身の `script` および `scriptPath` の呼び出しは拒否されますが、上記のすべてのアクション（`run-script` を含む）は依然として実行を開始できます。`retryHistorical` は、`retry` と `rerun` が履歴から復元された実行を受け入れる場合に true となります。古いデーモンはこれらに `{"changed": false}` で応答するため、クライアントはこれらのコントロールを、報告されている場合のみ履歴エントリに対して提供すべきです。

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

`status` は `NOT_STARTED`、`IN_PROGRESS`、`READY`、または `FAILED` のいずれかです。オプションの `error` は、利用可能な場合に失敗したサーバーに表示されます。無効な LSP（ベアモードを含む）は HTTP 200 を返し、`enabled: false`、ゼロのカウント、および `servers: []` を含みます。設定済みサーバーがない状態で有効な LSP は `enabled: true`、`configuredServers: 0`、および `servers: []` を返します。初期化がクライアント存在前に失敗した場合、レスポンスに `initializationError` が含まれることがあります。ライブクライアントがスナップショットを提供できない場合、レスポンスには `statusUnavailable: true` が含まれます。

このルートは、安定したクライアント向けフィールドのみを公開します。プロセス ID、spawn 引数、stderr の末尾、root URI、ワークスペースフォルダパスなどのデバッグ内部情報は意図的に省略されています。

### `GET /session/:id/resources`

```json
{
  "v": 1,
  "sessionId": "<sid>",
  "workspaceCwd": "/canonical/session/path",
  "skills": {
    "v": 1,
    "workspaceCwd": "/canonical/session/path",
    "initialized": true,
    "skills": []
  },
  "mcp": {
    "v": 1,
    "workspaceCwd": "/canonical/session/path",
    "initialized": true,
    "discoveryState": "completed",
    "servers": []
  }
}
```

このライブセッションオーナールートは、独自の ACP 接続を通じて選択されたセッションの Config を読み取ります。プロセスグローバルまたはワークスペースレベルのステータスルートを組み合わせず、コールドランタイムを初期化せず、クライアントをアタッチせず、プライマリワークスペースへのフォールバックも行いません。不明なセッションと永続化のみのセッションは、既存の `session_not_found` レスポンスを返します。

ネストされたオブジェクトは、正確な `GET /workspace/skills` および `GET /workspace/mcp` のステータス契約を使用します。それらの `workspaceCwd` フィールドは、スナップショットを生成した Config を識別し、トップレベルの値と一致します。既存のマスキングルールは適用され続けます：MCP 認証情報とヘッダー、環境変数の値、Skill の本文、および生設定はレスポンスに現れません。MCP 認証、プール、ワークスペース予算、およびワークスペース検出エラーのエンリッチメントは、その裏付け状態がワークスペース所有であるか、セッションではなくサーバー名のみでキー付けされるため、存在しません。選択されたセッション自身の MCP マネージャーからのステータス、検出、および会計は引き続き利用可能です。

### スタンドアロンセッションライフサイクル (`standalone_sessions_v1`)

`/capabilities.features` に `standalone_sessions_v1` が含まれる場合、デーモンは専用の Conversations ランタイムによって所有されるトップレベルのスタンドアロンセッション用のプロセスグローバルルートファミリーを公開します。これらのルートはワークスペースセレクターを受け入れず、プライマリワークスペースへのフォールバックもありません。完全な Conversations の所有権、ランタイム、ディレクトリ、ライフサイクル、および削除ジャーナルの依存関係グラフを構築できない直接埋め込みは、機能とその下のすべてのルートを省略します。

| ルート | リクエスト | 成功 |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST /standalone/sessions` | `{ "sessionId": "<UUID>", "modelServiceId"?: string, "startupConfig"?: { "modelServiceId": string, "reasoningEffort"?: ReasoningSelection }, "approvalMode"?: ApprovalMode }` | スタンドアロンセッション、`context: { "kind": "standalone" }`、および管理されたプロジェクトなし出力ディレクトリを含む `200`。作成はプロンプトなしです。 |
| `GET /standalone/session-options` | なし; クエリフィールドがある場合は 400 で拒否されます | `{ v, initialized, current?, approvalMode?, providers, errors? }` を含む `200`; 内部ワークスペースパスと ACP チャネル状態は省略されます |
| `GET /standalone/sessions` | クエリ: `cursor?`, `size?` (1-100), `archiveState?` (`active` または `archived`) | `200 { sessions, nextCursor?, liveMergeFailed?, truncated? }` |
| `GET /standalone/sessions/:id` | なし | ローカル作成が進行中の間は `202 { sessionId, state: "creating" }`、そうでなければ正確なサマリーを含む `200`。 |
| `POST /standalone/sessions/:id/load` | 既存の復元オプションのみ: `historyPageSize?`, `liveReplayMode?`, `compactedReplayMode?`, `hideInheritedHistory?`, `approvalMode?`; クライアント ID は `X-Qwen-Client-Id` に保持されます。 | `200` 復元されたスタンドアロンセッション。 |
| `POST /standalone/sessions/:id/resume` | `load` と同じ復元オプション。 | 履歴読み込み再生なしの `200` 復元されたスタンドアロンセッション。 |
| `POST /standalone/sessions/:id/repair-directory` | 空のボディまたは `{}` | 検証済みまたは再作成された管理ディレクトリを含む `200`。 |
| `PATCH /standalone/sessions/:id/metadata`        | `{ "displayName": string }`                                                                                                                                                          | `200 { sessionId, displayName }`                                                                                                               |
| `GET /standalone/sessions/:id/export` | クエリ: `format=html`, `format=md`, `format=json`, または `format=jsonl` (デフォルトは `html`)。 | 既存のエクスポートコンテンツタイプ、ファイル名、およびボディ。 |
| `POST /standalone/sessions/archive`              | `{ "sessionIds": ["<UUID>", ...] }`                                                                                                                                                  | `200 { archived, alreadyArchived, notFound, errors }`                                                                                          |
| `POST /standalone/sessions/unarchive`            | `{ "sessionIds": ["<UUID>", ...] }`                                                                                                                                                  | `200 { unarchived, alreadyActive, notFound, errors }`                                                                                          |
| `POST /standalone/sessions/delete`               | `{ "sessionIds": ["<UUID>", ...] }`                                                                                                                                                  | `200 { removed, notFound, errors, fileCleanupPending }`                                                                                        |

`POST /standalone/sessions` がレガシーな `modelServiceId` を持つ場合、レスポンスには `modelApplied` が含まれます: `false` はスパーン時のモデル切り替えが失敗したことを意味し (`model_switch_failed` セッションイベントでも表面化)、セッションはエージェントデフォルトモデルで実行されています — 作成自体は成功するため、呼び出し側は警告、解放、または明示的な再試行を行うことができます。

ボディは未知のフィールドを持たない JSON オブジェクトでなければなりません。ID は RFC UUID v1-v5 の値です; デーモンはそれらを小文字に正規化します。バッチリクエストは 1-100 個の文字列を含み、変更前に検証され重複排除されます。バッチの失敗は `{ sessionId, code, message }` として報告され、他の ID での成功した操作をロールバックしません。`fileCleanupPending` はトランスクリプト削除がコミットされたが、ジャーナル認可されたサイドカーまたは管理ディレクトリのクリーンアップは照合により再試行する必要があることを意味します; セッションはすでに論理的に削除されています。

明示的なスタンドアロントランスクリプトと文書化されたトップレベルのレガシー互換形状のみが見えます。子、Live、プロジェクト、ワークツリー、曖昧、読み取り不可、または削除ジャーナル付きのレコードはフェイルクローズします。HTTP レスポンスが切断されても作成は継続します; コミットされたセッションは削除されず、レスポンスクライアントはデタッチされます。アタッチとして作成を再試行する代わりに、正確な GET の後に load/resume を行って回復してください。

アーカイブ、アーカイブ解除、修復、名前変更、および削除は、load/resume およびプロンプトと同じセッションごとのライフサイクルアドミッションを共有します。削除はトランスクリプトの unlink を永続的なコミットポイントとして使用し、クラッシュリカバリーのためにプライベートジャーナルとアトミックな管理ディレクトリスケーリングを使用します。リカバリーはトランスクリプトが intact のままである場合にディレクトリを復元し、トランスクリプトが消えた場合にクリーンアップを完了します; 不一致の ID、競合するパス、外部オーナー、または曖昧なトランスクリプトは構造化されたフェイルクローズエラーを返します。

### `POST /session`

オプションの `startupConfig` 契約は [Capabilities](#capabilities) の下に説明されています。レガシーなベストエフォートモデル選択とは異なり、却下された起動時選択は作成を失敗させます。

新しいエージェントをスパーンするか、既存のエージェントにアタッチします (`sessionScope: 'single'` の下では、デフォルト)。

リクエスト:

```json
{
  "cwd": "/absolute/path/to/workspace",
  "modelServiceId": "qwen-prod",
  "sessionId": "550e8400-e29b-41d4-a716-446655440000",
  "sessionScope": "thread",
  "worktree": { "slug": "feature-a" }
}
```

| フィールド | 必須 | メモ |
| ---------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `cwd` | いいえ | 登録されたワークスペースのいずれかと一致する絶対パス。省略した場合、ルートはプライマリワークスペースにフォールバックします (`/capabilities.workspaceCwd` から読んでください)。一致しない非空の `cwd` は `400 workspace_mismatch` を返します。`features` に `multi_workspace_sessions` が含まれる場合、クライアントは信頼できる任意の `workspaces[].cwd` を渡すことができます; そうでない場合、プライマリワークスペースのみが受け入れられます。ワークスペースパスは `realpathSync.native` を介して正規化されます (存在しないパスに対する resolve-only フォールバック付き) ため、大文字小文字を区別しないファイルシステムが綴りごとにセッションを拒否することはありません。 |
| `modelServiceId` | いいえ | エージェントがルーティングする設定済みの _モデルサービス_ (バックエンドプロバイダー — Alibaba ModelStudio, OpenRouter など) を選択します。省略した場合、エージェントはデフォルトを使用します。ワークスペースにすでにセッションがある場合、これは既存のものに対して `setSessionModel` を呼び出し、`model_switched` をブロードキャストします。`POST /session/:id/model` の `modelId` とは異なります。これはすでにバインドされたサービスの **内** でモデルを選択します。`/capabilities` の `modelServices` 配列は設定済みサービスを広告するために予約されています; Stage 1 では常に `[]` です (エージェントのデフォルトサービスが使用され、HTTP 経由で列挙されません)。 |
| `startupConfig` | いいえ | `{ modelServiceId: string, reasoningEffort?: ReasoningSelection }`; `session_startup_config` が必要で、新しいスレッドを作成し、要求された選択を確認しますが、共有デフォルトには書き込みません。トップレベルの `modelServiceId` や明示的な単一スコープと混在させることはできません。 |
| `sessionId` | いいえ | 呼び出し側が選択した RFC バリアント UUID v1-v5。デーモンはこれを小文字に正規化し、常に新しいスレッドセッションを作成します; このフィールドを冪等なアタッチとして扱うことはありません。古いデーモンは未知のフィールドを無視する可能性があるため、送信する前に `caps.features` に `session_id_override` が含まれていることを確認してください。`null` は省略と同等です。 |
| `sessionScope` | いいえ | セッション共有のリクエスト単位のオーバーライド。`'single'`（デーモン全体のデフォルト）では、同じワークスペースの2番目の `POST /session` が既存のセッションを再利用します（`attached: true`）。`'thread'` は毎回新しい個別のセッションを強制します。省略するとデーモン全体のデフォルトが継承されます。列挙型外の値は `400 { code: 'invalid_session_scope' }` を返します。古いデーモン（#4175 PR 5 以前）はこのフィールドを黙って無視します。送信前に `caps.features.session_scope_override` でプリフライトチェックを行ってください。現在本番環境ではデーモン全体のデフォルトは `'single'` にハードコードされています。#4175 ではフォローアップで `--sessionScope` CLI フラグが追加される可能性があります。 |
| `worktree` | いいえ | ユーザー指定名付き Git ワークスペースに新しいスレッドセッションを作成します。オプションの `slug` はデーモンのワークスペース名検証を使用します。`session_worktree_persistence_v1` でプリフライトチェックを行ってください。クライアントは古いワークスペース形式のレスポンスから永続的な分離を推測してはいけません。ワークスペース作成はアタッチ操作ではなく、ブランチ作成と組み合わせることはできません。このルートは、再配置、排他的な所有権マーカーの作成、サイドカーの永続化、および最終的なランタイム世代チェックが完了した後にのみ成功を返します。 |

レスポンス:

```json
{
  "sessionId": "<uuid>",
  "workspaceCwd": "/canonical/path",
  "attached": false,
  "worktree": {
    "slug": "feature-a",
    "path": "/canonical/path/.qwen/worktrees/feature-a",
    "branch": "worktree-feature-a"
  },
  "worktreeState": "persisted-v1"
}
```

`attached: true` は、そのワークスペース用のセッションが既に存在し、現在それを共有していることを意味します。

`worktreeState` は認証されたワークスペースセッションの場合にのみ存在します。レガシーのベストエフォート復元では `worktreeState` なしの `worktree` を返す場合があります。復元プロンプトが保留されずに発火したコールド Part 4A 復元（`suppressWorktreeContextRestore` オフのため、ルートはブリッジに延期なしを要求しました）も、プロンプトが確定するまで未検証の `worktree` メタデータを返します。子プロセスは cwd なしでアクティブとして読み取られ、ライブプロンプト下では再配置が不可能であり、ルートは呼び出し側が回復したばかりのセッションを殺さず保持します。どちらのレスポンスも永続的な実行ルートの証明ではありません。ワークスペース分離を要求したクライアントは、プロンプトをルーティングする前に `worktreeState: "persisted-v1"` と期待される正規パスを必須とする必要があります。初期ロードはアクティブなプロンプトが確定した後に再試行できます。SDK の再接続時、結果はレスポンスにまだ `worktree` メタデータが含まれているかどうかに応じて分岐します。認証なしまたはパスが変更された状態でメタデータを含むレスポンスはそのクライアントにとって終端的です。新しいアタッチメントは切り離され、プロンプトは再試行されません。一方、`worktree` オブジェクト自体がないレスポンスは修復されます。クライアントはキャッシュされたワークスペースクレームを破棄し、新しいアタッチメントを保持し、同じ呼び出し内でプロンプトを再試行します。修復は再試行をゲートしないため、1つのターンがクライアントによって認証できなくなったディレクトリで実行される可能性があります（クライアントが見たことのない `exit_worktree` が通常の理由であり、クライアントはクリアされたインメモリ関連付けと区別できません）。したがって、分離対応の呼び出し側はプロンプトを送信する前にワークスペース認証自体を再検証する必要があります。破棄されたクレームにより、その呼び出し側は次のロードまたは選択時に自身のアイデンティティゲートでフェイルクローズになるだけです。

呼び出し側提供の ID は、現在登録されているすべてのワークスペースランタイムと、まだ生きているすべてのブリッジ世代（ドレイン中の置き換えを含む）を通じて一意です。ライブ、保留中、アクティブ、アーカイブ済み、またはワークスペースバックエンドの重複は `409 session_id_conflict` を返します。無効な値は `400 invalid_session_id` を返します。利用不可のライブオーナーまたは永続化状態チェックは再試行可能な `503 session_id_admission_unavailable` を返します。ブリッジまたはストレージの状態変化後にバウンドバックオフで再試行してください。`retryable` は別の試行が安全であることを意味しますが、即時の再試行が成功することを意味しません。ダウンストリームエージェントが異なる ID を返した場合、デーモンはその孤児を削除し `500 session_id_not_honored` を返します。曖昧なレスポンスの後、アタッチとして create を再試行するのではなく、既知の ID をロードまたは再開してください。

独立した会話を望むマルチクライアント統合は、各 `POST /session` で `sessionScope: "thread"` を送信すべきです。デフォルトの `single` スコープは、クライアントが意図的に一つの協調セッションを共有する場合にのみ使用してください。共有セッションはプロンプトを一つの FIFO 経由で直列化し、`/daemon/status` 経由で `runtime.activity.pendingPrompts` および `runtime.activity.queuedPrompts` として可視化されます。

同じワークスペースに対する並行する `POST /session` 呼び出しは、1つのスパーンに **結合** されます。両方の呼び出し側は同じ `sessionId` を取得し、ちょうど1つだけが `attached: false` を報告します。基盤となるスパーンが失敗した場合（初期化タイムアウト、不正なエージェント出力、OOM）、**結合されたすべての呼び出し側が同じエラーを受信します**。進行中のスロットはクリアされるため、後続の呼び出しは最初から再試行できます。

> ⚠️ **新しいセッションでの `modelServiceId` 拒否は HTTP レスポンスではサイレントです。** 不正な `modelServiceId`（タイポ、未設定サービス）は create を 500 エラーにしません。セッションはエージェントのデフォルトモデルで稼働状態を保つため、呼び出し側はモデル切り替えを再試行できる `sessionId` を取得します（`POST /session/:id/model` 経由）。目に見える失敗シグナルは、セッションの SSE ストリーム上の `model_switch_failed` イベントであり、spawn ハンドシェイクと最初の subscribe の間で発火します。**このイベントを観察する必要があるサブスクライバーは、最初の `GET /session/:id/events` で `Last-Event-ID: 0` を渡す**べきです。これによりリング内の最も古い利用可能イベントから再生が行われ、create レスポンスの数ミリ秒後に subscribe が到着しても spawn 時の `model_switch_failed` をカバーします。

### `GET /session/:id/status`

セッションを所有するランタイムからライブサマリーを返します。このルートは永続化のみのセッションを読み込まず、プライマリライトタイムへのフォールバックも決して行いません。事前チェックとして `caps.features.session_status` を実行してください。

```json
{
  "sessionId": "<sid>",
  "workspaceCwd": "/canonical/path",
  "createdAt": "2026-09-10T08:00:00.000Z",
  "clientCount": 1,
  "hasActivePrompt": true,
  "isWaitingForPermission": false,
  "isWaitingForUserQuestion": false,
  "pendingInteractionCount": 0,
  "pendingInteractions": []
}
```

レスポンスは `DaemonSessionSummary` のワイヤー形状です。オプションフィールドには、表示およびソースメタデータ、`activeWorkState`、`updatedAt`、`turnError`、worktree または branch メタデータ、および PR バインディングが含まれます。`404` はライブオーナーが存在しないことを意味します。ブートストラップ中、ドレイン中、または利用不可のオーナーは、フォールバックする代わりに `503` を返します。信頼できない非プライマリオーナーは `403 untrusted_workspace` を返し、複数のワークスペースでライブしている ID は `500 ambiguous_session_owner` を返します。TypeScript SDK メソッドは `sessionStatus()` です。

### ACP `session/new` 呼び出し側提供 ID

ACP クライアントは拡張メタデータフィールドを通じて同じ動作をリクエストします。

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

レスポンスには正規化された小文字のIDが含まれます。プライマリおよびワークスペース修飾付きACPマウントはRESTとアドミッションを共有し、`session/load`と`session/resume`を含みます。無効なIDはACP`INVALID_PARAMS`を使用し、`data.httpStatus=400`と`data.errorKind="invalid_session_id"`を伴います。競合は`data.httpStatus=409`を使用し、利用不可のライブオーナーまたは永続化状態チェックは`data.httpStatus=503`と`data.retryable=true`を使用します。

プロンプトを一度も受け取らない ACP 作成セッションは永続化トレースを残さず、所有する接続が添付セッションゼロで閉じるとデーモンによって回収されます。その回収後、同じ ID を再度作成できますが、これは接続のライフサイクルであり ID の再利用ではありません: 接続 (または任意の添付) がアクティブな間、重複した作成要求は拒否されます。

### `POST /session/:id/load`

`liveReplayMode` と `compactedReplayMode` は `full`（デフォルト）または `summary` を受け入れます。それぞれ `liveJournal` と `compactedReplay` を投影しますが、保存された履歴を変更しません。ページ選択はフィルタリングに先行するため、表示項目数は `historyPageSize` より少なくなることがあります。不正な値は `400 invalid_live_replay_mode` または `400 invalid_compacted_replay_mode` を返します。スタンドアロンロードは両方のオプションを受け入れますが、不正な値を `400 invalid_request` として報告します。

ID で永続化された ACP セッションを復元し、その履歴を SSE 経由で再生します。パスの id が権威的であり、ボディ内の `sessionId` フィールドは無視されます。プリフライト `caps.features.session_load` — 古いデーモンはこのルートに対して `404` を返します。

リクエスト:

```json
{
  "cwd": "/absolute/path/to/workspace"
}
```

| フィールド | 必須 | 備考 |
| ----- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `cwd` | いいえ | `POST /session` と同じ正規化ですが、復元にはより厳格な欠落契約があります: NO レジストリエントリ (削除済み、または登録されていない) を持つ明示的な `cwd` は `404 workspace_not_found` を返します — これは呼び出し側が消滅したと分類できる永続的な欠落です — 一方で、可逆状態 (draining, transitioning, blocked) にエントリが存在するワークスペースは依然として `400 workspace_mismatch` を返します。省略すると `/capabilities.workspaceCwd` を継承します。`features` に `multi_workspace_sessions` が含まれる場合、呼び出し側は信頼できる登録済みの `workspaces[].cwd` を渡すことができますが、信頼できない非プライマリワークスペースは `403 untrusted_workspace` を返します。`mcpServers` はここでは意図的に受け入れられません — デーモン全体の MCP は設定駆動です (`POST /session` と一致)。 |

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

`state` は ACP の `LoadSessionResponse` を反映します — `models` は `SessionModelState`、`modes` は `SessionModeState`、`configOptions` は `SessionConfigOption` の配列です。欠落フィールドはエージェントが決定します。遅延アタッチャ (以下の `attached: true` パス) は、元の読み込み呼び出し側が見たものと同じ `state` スナップショットを取得します — デーモンはこれをエントリにキャッシュします。ランタイム変更 (例: `model_switched`) は subsequent attach レスポンスではなく、SSE ストリーム上で配信されます。

`attached: true` は、セッションが既にアクティブであったことを意味します (以前の `session/load`/`session/resume` から、または同時実行呼び出しの合流により直前に競走したため)。

永続化されたセッションが Part 4A ワークツリーを所有する場合、load/resume はそのサイドカー、正規化された包含関係、および正確なチェックアウトマーカーを検証します。アイドル状態の子プロセスはレスポンス前に再配置されます。アクティブな子プロセスは、報告された cwd がすでにワークツリーと等しい場合にのみ証明され、報告された cwd が存在しないか他の場所にあるアクティブな子プロセスは、プロンプトの下に移動される代わりにフェイルクローズします — ただし、リストアプロンプトを延期できなかったコールドリストアを除きます (`suppressWorktreeContextRestore` off — 有効なソースが Channel-owned でない任意のリストア — または延期 API なしのブリッジ): その形状は依然として `worktree` を `worktreeState` なしで返し、再配置されず、セッションは存続します。再配置および証明されたレスポンスは `worktree` に加えて `worktreeState: "persisted-v1"` を返します。リストア側の型付き 409 分類 (`session_worktree_reset_v1` によってアドバタイズ): `worktree_session_superseded` は、セッションのサイドカーが `supersededBy` リンクを持つ場合 — この分類はそのリンクのみを読み取り、チェックアウトごとの所有権ロックの下で、マーカー読み取りの前に実行されるため、コミットロールバック中の転送が同じデーモンが削除中のセッションへ呼び出し側をリダイレクトすることはできません。ただし、リンクはマーカーが切り替わる前に書き込まれるため、ボディ内の `replacementSessionId` は検証すべきリダイレクトであり、所有権が移動したことの証明ではありません: コミット後の転送では、呼び出し側はその id を読み込み、ブックキーピングを更新する必要がありますが、コミット前の中断状態では、マーカー所有者ではない置換セッションを指しており、そのセッション自身のリストアは `worktree_reset_interrupted` を返し、再試行されたリセットによって回収されます — したがって、その読み込みが成功するまで `replacementSessionId` をタスクのセッション ID として永続化してはいけません。`worktree_reset_interrupted` は、リストアされたセッションの `supersedes` リンクと名前付きセッションの `supersededBy` リンクが一致するが、マーカーが移動していないか存在しない場合 — 以前のリセットが転送中にクラッシュし、再試行されたリセットが修復手段となります。そして `worktree_marker_missing` は、チェックアウトマーカーがその一致するリンクペアなしで存在しない場合 — タスクのリセットが修復手段となります。なぜなら、どのリストアパスもマーカーを再作成せず、リストアの再試行は同じ 409 を返すからです。中断分類が最初にチェックされるため、一致するリンクペアが `worktree_marker_missing` として表面化することはありません。有効なリストアソースが Channel-owned である場合、ルートは Part 4A または分類不能なサイドカー状態に対するエージェントのベストエフォートクリーンアップを抑制するため、古くなった、外部由来の、曖昧な、または所有権不一致の永続化状態は保持され、リクエストは失敗します。永続化されたメタデータが優先されます。存在しない場合、load/resume リクエストが有効なソースを提供します。Part 4A の `workspaceCwd` フィールドを持たない構造的に有効なレガシーサイドカーは、既存のベストエフォートエージェントリストアを維持し、そのパスによってクリーンアップされる可能性があり、`worktree` を `worktreeState` なしで返す可能性があります。クライアントはその互換性メタデータから分離性を推測してはいけません。その明示的なレガシー互換性のケースを除き、有効なリストアソースが Channel-owned でないセッションのみ、ルート検証前の既存のベストエフォートクリーンアップを維持します。サイドカーが存在しない場合、ワークツリーの証明は返されません。分離認識型のクライアントは、セッションを共有ワークスペースに再バインドするのではなく、そのレスポンスを拒否する必要があります。

**SSE 経由の履歴再生。** エージェント側で `loadSession` が実行中の間、エージェントは永続化されたターンに対する `session_update` 通知を発行するか、レスポンスメタデータにバルク再生更新を返す場合があります。デーモンは、ルートレスポンスが返される前に、これらのイベントをセッションの境界付き再生スナップショットウィンドウにシードします。ライブセッションの場合、`POST /session/:id/load` は完全なトランスクリプトではなく、その境界付きウィンドウ（`compactedReplay`、`liveJournal`、オプションの `lifecycleReplay`、`lastEventId`）のみを保証します。アイドル状態のライブセッションが境界付き永続ページからリフレッシュされると、`lifecycleReplay` は、メモリ内ウィンドウからの `_meta.executionLifecycle` または `_meta.toolLifecycle` を含む最大 1024 のメタデータ専用 `session_update` フレームでそのページを補完します。この補完は永続化されたライフサイクルレコードと重複する可能性があり、クライアントは冪等に削減しなければならず、再生された開始がまだ実行中であると推定してはいけません。`lifecycleReplayIncomplete: true` は利用不可、劣化、または切り詰められたメモリ内カバレッジを報告し、`false` は完全なトランスクリプトを保証しません。これらのオプションフィールドは個別に永続化されたストアではなく、古いデーモンでは省略される可能性があります。ウィンドウは `--compacted-replay-max-bytes` によってバイト単位で上限が設定されます（デフォルト 4 MiB、最大 256 MiB）。古い再生エントリが破棄された場合、`compactedReplay[0]` は ID なしの `history_truncated` マーカーです。実行中の `liveJournal` は、`--max-journal-events`（デフォルト 10,000 再生エントリ）と `--max-journal-bytes`（デフォルト 8 MiB のシリアライズ済みソースイベント）によって個別に上限が設定されています。これらはセッションごとの **ベースライン** 上限です。実行中のターンがこれらを超過した場合、デーモンはまず適応的な成長を試みます。すべてのライブセッションにわたって許可された成長が、デーモンの有効メモリ予算の 5% にサイズ設定された単一のデーモン全体にわたる成長プールに収まる限り、そのセッションの上限を倍に向けて引き上げます（セッションごとのハード上限は 256 MiB で、エントリ数は比例してスケーリングされ、残りのプールヘッドルームによって制限されます）。渡された場合は `--memory-budget-mb` の値、そうでない場合は自動検出メモリの 50% で、`1024` MB に上限が設定されます。会計処理はデーモン全体で行われます。マルチワークスペースデーモンはワークスペースごとに 1 つのブリッジを実行し、それらすべてが単一のプールを共有します。成長はオンデマンドであり、プールが許す範囲でのみ発生します。オペレーターが固定した `--max-journal-events` または `--max-journal-bytes` はこれを無効にし、有効予算が最小値 1024 MB を下回るホスト（`insufficientMemory`）も同様です。この場合、プールは 0 となり、適応的成長は完全に無効になります。連続する互換性のある `agent_message_chunk` または `agent_thought_chunk` ソースイベントは、ツール、帰属、来歴、および離散的メッセージ境界がそのまま維持されたまま、1 エントリあたり最大 256 ソースイベントまで再生エントリを共有します。プールが許す成長の後でもジャーナルが（おそらく成長した）上限を超えている場合 — ヘッドルームが付与されないか、付与がオーバーシュートの一部のみをカバーする場合も含む — 最も古いエントリは丸ごと破棄され（保持される末尾はバイト上限よりはるかに小さくなる可能性があります）、`scope: 'live_journal'` を伴う `history_truncated` マーカーが前置されます。その `truncatedEvents` および `retainedEvents` フィールドは再生エントリではなくソースイベントをカウントし、その `maxBytes` / `maxEvents` は施行されている上限（すでに成長している可能性があります）を反映します。クライアントはそのマーカーをステータスとしてレンダリングし、保持されたイベントの適用を継続すべきです。完全な永続化トランスクリプトアクセスは、`GET /session/:id/transcript` を介して別途公開されます。

再生ウィンドウのバイト上限は、子プロセスが永続化されたトランスクリプトを再構築した後に適用され、ディスク上の JSONL 読み取りには適用されません。デーモン予算を超える復元は、復元予算から導出された（5〜120 秒にクランプ）`Retry-After` と `{code: "session_restore_timeout", errorKind: "restore_timeout", retryable: true, sessionId, action, timeoutMs}` を伴う `504` を返します。デーモンは、まだ実行中の ACP リクエストをフェンスし、登録する代わりに遅延セッションをクリーンアップします。同じ ID に対する再試行は、そのクリーンアップが確定するまで、復元予算から導出された（5〜120 秒にクランプ）`Retry-After` と `reason: "awaiting_abandoned_cleanup"` を伴う `409 restore_in_progress` を返します。遅延復元クリーンアップが不確実である場合、または放棄された復元が期限後も完全な復元予算を経過しても確定していない場合、そのワークスペースへの新規セッションは `reason: "restore_cleanup_failed"` または `"restore_settlement_overdue"` を伴う `503 acp_channel_unavailable` を返します。タイムアウトしたセッション初期化は、遅れて確定する古い ACP 子プロセスに対して同じフェイルクローズドなアドミッションポリシーに従います。結論が出ないクリーンアップは `reason: "new_session_cleanup_failed"` を返し、さらに 1 つの初期化予算の間確定しないリクエストは `reason: "new_session_settlement_overdue"` を返します。確定遅延状態は、遅延失敗が確定した後、または遅延成功が正確な ID クリーンアップを完了した直後にクリアされます。結論が出ないクリーンアップは、対応するクリーンアップ失敗状態に移行します。クリーンアップ失敗状態は、ワークスペースチャネルが排出され、リサイクルされるまで持続します。いずれの場合も、既に稼働中のセッションは使用可能です。

**エラー:**

- `404` — 永続化セッション ID が存在しません（`SessionNotFoundError`）。
- `404` — 明示的な `cwd` にレジストリエントリがまったく存在しない場合（削除されたか、登録されていない）に `workspace_not_found`：これは以下の可逆状態とは異なる、永久的な不在です。ボディ: `{ error, code: "workspace_not_found", boundWorkspace, requestedWorkspace }` — `workspaceCount` なし。「404 はセッションが消滅したことを意味する」という古い契約を読み取ったクライアントは、このコードをセッションが削除された証拠としてではなく、回避できるルーティング障害（例：ワークスペースの再登録）として扱うべきです。
- `400` — `workspace_mismatch`（`POST /session` と同じ形状）、可逆的なライフサイクル状態を含みます：レジストリエントリが存在するが、ドレイン中、遷移中、またはブロックされているワークスペース。ワークスペースが確定したら再試行してください。消滅したとして分類しないでください。
- `403` — `cwd` が信頼できない非プライマリワークスペースを対象としている場合に `untrusted_workspace`。
- `503` — `session_limit_exceeded`（`--max-sessions` にカウントされます。実行中の復元も勘定されます）。
- `504` — `session_restore_timeout`; 再試行可能で、復元予算から導出された（5〜120 秒にクランプ）`Retry-After` を伴います。同じセッション ID は遅延クリーンアップが確定するまでフェンスされたままになるためです。
- `504` — `init_timeout`; 再試行不可、`Retry-After` なし、`sideEffectPossible` なし、フェンス設置なし。復元リクエストがディスパッチされる前にチャネル初期化がタイムアウトした場合（`ensureChannel` ステージ）に発行されます。復元は一度も試行されていないため、セッション ID はフェンスされず、クリーンアップも保留されていません。
- `503` — ワークスペースチャネルが新しいセッションワークに対して閉じられている場合の `acp_channel_unavailable`。`reason` はその理由を示します: 放棄された復元が確定的にクリーンアップできなかった場合の `restore_cleanup_failed`; 期限から1回の完全な復元予算を経過しても放棄された復元がまだ確定していない場合の `restore_settlement_overdue`; パブリック初期化タイムアウト後に作成されたセッションが確定的にクローズできなかった場合の `new_session_cleanup_failed`; または期限からさらに1回の初期化予算を経過してもタイムアウトした初期化がまだ確定していない場合の `new_session_settlement_overdue`。既存のセッションは引き続き利用可能です。複数の実行エンジンを持つワークスペースランタイムでは、これらの検疫状態は該当エンジンのチャネルを隔離します: そのセッションも新しいワークを受け付けません（プロンプト、継続、サイドリクエスト、シェルコマンド、ターン中のメッセージ、Goalまたはワークフローの開始は同じ `503` を返します）、確定したセッションはクローズされ、そのエンジンの新規セッションはチャネルのプロセストリーが消滅するまで拒否され続け、確認できない間は `channel_exit_unverified` が適用されます。ここで、`workspace_change_unacknowledged` はチャネルがセッションに影響するワークスペース変更（権限ルール、設定のリロード、Session Workflowゲート、モデルプロバイダーまたはSkills）を認識しなかったことを意味します; すべての欠落した変更に対する遅延認識により、その検疫状態は早期に終了します。決済遅延状態は、遅延失敗が決着するか、遅延成功が正確なIDのクリーンアップを完了すると解消されます。不確定なクリーンアップは、対応するクリーンアップ失敗状態に移行し、ワークスペースチャネルのドレインとリサイクルが必要になります。ボディには `retryAfterSeconds` が含まれ、ヘッダーには一致する予算由来の `Retry-After` が含まれるため、クライアントは通常の5秒間隔でのポーリングではなく、操作予算規模のバックオフを使用します。
- `409` — 同じIDに対する `session/resume` が既に進行中であるか、新規スポンが復元が所有するIDを提供した場合の `restore_in_progress`。復元がアクティブな間は `Retry-After: 5`; `awaiting_abandoned_cleanup` としてフェンスされた後は予算由来のヒント。同一アクションの競合（同じIDに対する2つの同時 `session/load`）は統合されます — ちょうど1つが `attached: false` を返し、残りは同じ `state` で `attached: true` を返します。
- `409` — 同じセッションIDが別のワークスペースランタイムによって既にライブであるか復元中の場合の `session_workspace_conflict`。
- `409` — IDが `chats/archive/` の下でのみ存在する場合の `session_archived`; `load` または `resume` を呼び出す前に `POST /sessions/unarchive` を呼び出してください。
- `409` — 同じIDに対するアーカイブまたはアーカイブ解除が進行中の場合の `session_archiving`。`Retry-After: 5`。
- `409` — IDが `chats/` と `chats/archive/` の両方に存在する場合の `session_conflict`; ロードする前に `POST /sessions/delete` でセッションを削除してください。

### `GET /session/:id/transcript`

アクティブな永続化JSONLトランスクリプトから再構築された、IDなしの `session_update` リプレイフレームの1ページを返します。プリフライト `caps.features.session_transcript` — 古いデーモンはこのルートに対して `404` を返します。

クエリパラメータ:

| フィールド | 必須 | 備考 |
| --------------------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `cursor` | いいえ | 前のページで返された不透明なbase64urlカーソル。最初のページでは省略してください。カーソルはデーモンが発行し改ざんチェックされています; 変更すると `400 invalid_transcript_cursor` が返されます。これはトランスクリプトファイルのアイデンティティと凍結された最初のページのバイトサイズにバインドされます; ファイルの削除、切り詰め、置換、またはアーカイブは無効化し `409` を返します。 |
| `limit` | いいえ | ページ内のアクティブな `ChatRecord` の目標数。デフォルトは `100`、最大 `500`。後方ページはターンおよびツール呼び出し/結果の境界を保持するために最大 `3 * limit` レコードまで拡張される場合があります。1つのレコードは複数のリプレイフレームを生成するため、`events.length` はさらに大きくなる可能性があります。無効な値は `400 invalid_transcript_limit` を返します。 |
| `direction` | いいえ | 許容される唯一の値は `backward` で、最新のレコードからページを開始します。最初のページで前方にページングする場合、または `cursor` に凍結された方向を継続する場合は、このパラメータを省略してください。`cursor`、`beforeRecordId`、`atRecordId`、または `snapshot` と組み合わせることはできません。 |
| `beforeRecordId` | いいえ | このレコードIDの前に後方ページを開始します。後方を意味するため、`direction` も送信しないでください。`cursor` または `atRecordId` と組み合わせることはできませんが、`snapshot` とペアにすることはできます。 |
| `compactedReplayMode` | いいえ | `full`（デフォルト）または `summary`。ページ選択後に `events` を投影するため、表示数は `limit` より小さくなる場合があります。保存された履歴やカーソル選択は変更しません。ワークスペース修飾付きトランスクリプトルートでも受け入れられます。無効な値は `400 invalid_compacted_replay_mode` を返します。 |

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

`events` はリプレイフレームのみです: `{ v: 1, type: "session_update", data: SessionUpdate }`。これらはEventBus IDを持たず、レスポンスには `lastEventId` は決して含まれません。このルートを呼び出しても、`/load` を呼び出したり、クライアントをアタッチしたり、ライブEventBusをシードしたり、ライブセッションを作成したり、現在のライブリプレイウィンドウを変更したりすることはありません。ライブおよび非アクティブなアクティブセッションの両方が、子側読み取り専用ステータスメソッドによって再構築されるため、リプレイは同じワークスペース設定、ランタイム出力ディレクトリ、エミッター、および `/load` 履歴セマンティクスを使用しますが、デーモンのセッション状態は変更しません。

最初のページは現在のJSONLスナップショットサイズを凍結します。後のページはそのバイトプレフィックスのみを読み取るため、ページ1以降の追加は結果セットを変更しません。ファイルが消去された場合、凍結サイズ以下に切り詰められた場合、異なるinodeに置き換えられた場合、またはアーカイブに移動された場合、次のページは `409` を返し、クライアントはページ1から再開するか、ユーザーにトランスクリプトの再読み込みを求めるべきです。

デーモンのメモリとレイテンシを保護するため、トランスクリプトインデックス上限を超えるスナップショットは、デーモンがJSONLをスキャンする前に失敗します。クライアントは `413 transcript_too_large` を受け取り、エクスポート/オフライン処理にフォールバックするか、ユーザーに古い履歴の短縮/アーカイブを求めるべきです。

いくつかのフレームを生成した後にリプレイ変換が失敗した場合、`partial: true` および `replayError` が現れることがあります。部分レスポンスには `nextCursor` は決して含まれないため、クライアントは変換されなかったレコードを黙ってページングすることはできません。

**エラー:**

- `400` — 無効な `limit`、`cursor`、`direction`、`beforeRecordId`、またはセッションID形状。ページングパラメータは相互排他です: `cursor` は `beforeRecordId`、`atRecordId`、または `snapshot` と組み合わせることはできません; `snapshot` には `atRecordId` または `beforeRecordId` が必要です; `atRecordId` には `snapshot` が必要です; そして `backward` はカーソルまたは任意のレコードアンカーと組み合わせることはできません。
- `404` — アクティブな永続化セッションIDが最初のページリクエスト時に存在しません。
- `409` — `/load` と同じロード可能性チェックからの `session_archived`、`session_archiving`、または `session_conflict`。
- `409` — カーソル発行後にファイルが削除、切り詰め、置換、またはアーカイブされたため、トランスクリプトスナップショットが利用不可; プリフライトがカーソルリクエストに対してアクティブファイルを見つけられなくなった場合にも適用されます。
- `413` — 凍結されたトランスクリプトスナップショットがデーモンのインデックス上限を超えている場合の `transcript_too_large`。
- `413` — 1つの集約レコードがワークスペース修飾付きページ予算を超えるか、シリアライズされたページがそのレスポンス予算を超える場合の `transcript_page_too_large`。

### `GET /session/:id/export`

プライマリワークスペースのアクティブな永続化セッショントランスクリプトをダウンロードします。オプションの `format` クエリは `html`（デフォルト）、`md`、`json`、または `jsonl` です。事前チェックとして `caps.features.session_export` を実行してください。

成功レスポンスは、サニタイズされたファイル名、`Cache-Control: no-store`、および `X-Content-Type-Options: nosniff` を持つ添付ファイルです。コンテンツタイプは、選択されたフォーマットに応じて `text/html`、`text/markdown`、`application/json`、または `application/jsonl` です。このルートは永続ストレージのみを読み取ります。ライブオーナーを解決せず、ACP を開始せず、クライアントをアタッチしません。ターゲットが非プライマリワークスペースにある可能性がある場合は、以下のワークスペース修飾付きルートを使用してください。不正なフォーマットは `400 invalid_export_format` を返します。アクティブセッションがない場合は `404` を返します。アーカイブ済み、移行中、または競合するストレージは `409` を返します。TypeScript SDK メソッドは `exportSession()` です。

### `GET /workspaces/:workspace/session/:id/transcript`

選択された登録済みワークスペースのアクティブな永続化 JSONL から、単数形ルートと同じ `DaemonSessionTranscriptPage` プロジェクションを返します。プリフライト `workspace_persisted_transcript`。この機能は `multi_workspace_sessions` とは独立しており、ID または cwd によって選択された信頼できる単一ワークスペースのプライマリに対して動作します。

セレクターとクエリパラメータは、既存の複数形ワークスペースおよびトランスクリプトのルールに従います。信頼できるプライマリおよびセカンダリランタイム、ならびに信頼できないセカンダリランタイムによる読み取りが可能です。信頼できないプライマリは `403 untrusted_workspace` を返します。アーカイブされたコンテンツは返されません。

このワークスペース修飾付きルートでは、`limit` は前方ページの最大レコード数です。後方ページは、ターンとツール呼び出し/結果ペアが完全に保たれるよう、最大 `3 * limit` レコードまで拡張される場合があります。ページは、4 MiB の永続ソース予算で早期に停止し、継続カーソルを返すことがあります。シリアライズされたレスポンスは 32 MiB に、カーソルは 64 KiB に制限されます。リプレイ状態がカーソルの上限を超える場合、ページは正常に変換されたイベントを `partial: true`、`hasMore: false`、および `nextCursor` なしで返します。

前方ページとカーソルページは、すべてデーモンプロセス内で実装されています。ライブセッションの後方最初のページは、永続テールが最新であることを保証するため、まず 1 レコードのワークスペースブリッジフラッシュバリアを通過します。このバリアにより ACP が起動し、ワークスペース設定が読み込まれる可能性があります。永続ページ自体の読み取りでは、プロジェクト定義のエージェントやスキルを解析したり、`session-transcript-cursor-key` を作成/修復したりしません。ツールフレームは、ランタイムツールレジストリを参照せず、永続化されたツール名と説明を使用します。その HMAC カーソルキーはデーモンメモリ内にのみ存在し、ワークスペースごとに分離されており、再起動時にローテーションされます。以前のデーモンプロセスからのカーソルは `400 invalid_transcript_cursor` を返します。

### `GET /workspaces/:workspace/session/:id/export`

選択された登録済みワークスペースのアクティブな永続化セッションを添付ファイルとしてエクスポートします。プリフライト `workspace_session_export`。`session_export` または `workspace_qualified_rest_core` からサポートを推測しないでください。セレクターは、まず正確なワークスペース ID として解決され、次に正規化後の URL エンコードされた絶対 cwd として解決されます。プライマリおよびセカンダリの両方のランタイムが信頼されている必要があります。信頼されていないランタイムは、セッションまたは形式の検証の前に `403 untrusted_workspace` を返します。

オプションの `format` クエリは、`html`（デフォルト）、`md`、`json`、または `jsonl` です。ボディ、MIME タイプ、ファイル名のサニタイズ、`Cache-Control: no-store`、`X-Content-Type-Options: nosniff`、および添付ファイルの処置は `GET /session/:id/export` と一致します。レガシールートはプライマリストorage にバインドされたままです。

複数形ルートは、既存の共有アーカイブコーディネーターの下で、選択されたワークスペースのアクティブな永続化 JSONL のみを読み取ります。他のワークスペースストアのスキャン、プライマリへのフォールバック、ライブオーナーの解決、ワークスペースブリッジの呼び出し、ACP の起動、クライアントの接続、設定の読み込みは行いません。他のワークスペースにのみ存在するセッション ID は `404 { code: "session_not_found" }` を返します。アーカイブされたセッションは `409 session_archived` を返します。無効な形式は `400 invalid_export_format` を返し、ストレージの競合は既存の `session_archiving` および `session_conflict` エラーを保持します。

### `GET /workspaces/:workspace/session/:id/archive/export`

選択された登録済みワークスペースのアーカイブされた永続化セッションを添付ファイルとしてエクスポートします。プリフライト `workspace_archived_session_export`。サポートは、アクティブエクスポートまたは複数形コア機能から推測できません。ワークスペースセレクターの解決と信頼性チェックは、セッション ID および形式の検証の前に実行されます。

TypeScript SDK の呼び出し側は `WorkspaceDaemonClient.exportArchivedSession(sessionId, options)` を使用します。このメソッドは常にネイティブ REST を使用し、既存の `DaemonSessionExportResult` 添付プロジェクションを返します。

オプションの `format` クエリ、レスポンスボディ、MIME タイプ、サニタイズされたファイル名、キャッシュポリシー、セキュリティヘッダー、および添付ファイルの処置は、アクティブワークスペースエクスポートと同一です。アーカイブソース JSONL は再構築前に 256 MiB に制限されます。より大きなファイルは `413 transcript_too_large` を返し、`sessionId`、`snapshotSize`、および `maxBytes` を含みます。アクティブエクスポートは既存のサイズ挙動を維持します。

このルートは、共有アーカイブコーディネーターリースの下で、選択された信頼できるワークスペース内の `chats/archive/<id>.jsonl` のみを読み取ります。フォールバックのためのアクティブコンテンツの検査、他のワークスペースのスキャン、ライブオーナーの解決、ブリッジの呼び出し、ACP の起動、クライアントの接続、設定の読み込みは行いません。アクティブのみの ID は `409 { code: "session_not_archived" }` を返します。存在しない ID は `404 { code: "session_not_found" }` を返します。アクティブファイルとアーカイブファイルが同時に存在する場合は `409 session_conflict` を返します。アーカイブ移行中は `409 session_archiving` を返し、`Retry-After: 5` を含みます。

### `POST /session/:id/resume`

履歴を SSE 経由でリプレイせずに、ID によって永続化された ACP セッションを復元します。モデルコンテキストはエージェント側で内部的に復元されます（`geminiClient.initialize` による `config.getResumedSessionData` の読み取り）。SSE ストリームは、すでに履歴がレンダリングされているクライアント向けにクリーンな状態を保ちます。プリフライト `caps.features.session_resume`。`unstable_session_resume` は、古いクライアント向けの非推奨互換性エイリアスとして残っています。

`/load`と同じく、`cwd`、`approvalMode`、`sourceType`、および`sourceId`フィールドを受け付けます。読み込み専用リプレイフィールドである`historyPageSize`、`liveReplayMode`、および`compactedReplayMode`はここでは解析、検証、転送されず、公開されている再開リクエストスキーマに従って暗黙的に無視されます。レスポンス形式も同一で、`state`はACPの`ResumeSessionResponse`を反映しています。エラーエンベロープも同一であり、`409 restore_in_progress`（`session/load`が実行中の場合に発生します。別の`session/resume`に遅れて追いつこうとする`session/resume`は統合されます）を含みます。

クライアントに履歴がレンダリングされていない場合（コールド再接続、ピッカー → オープン）には `/load` を使用します。クライアントがすでに画面上にターンを持っており、デーモン側のハンドルのみが必要である場合は `/resume` を使用します。

> ⚠️ **なぜ `unstable_session_resume` がまだ広告されているのですか？** デーモンの HTTP ルートと `session_resume` 機能は v1 で安定していますが、ブリッジはまだ ACP の `connection.unstable_resumeSession` を呼び出しています。古いタグは、`session_resume` より前にリリースされた SDK が動作を継続できるようにするためだけに残されています。

### `POST /session/:id/worktree-reset`

永続化された Part 4A ワークツリーセッションのチェックアウト所有権を、新しい代替セッションに転送します。プリフライト `session_worktree_reset_v1` — 古いデーモンはこのルートに対して `404` を返します。このルートは、Channel の名前付きタスク `/clear` がファイルを破棄せずにワークツリータスクをリセットする方法です。代替セッションにはまったく新しい会話が付与され、置き換えられたセッションはカタログ内のトランスクリプトを保持しますが、二度と復元できなくなります。

リクエストボディ（すべてのフィールドは省略可能）:

```json
{
  "cwd": "/canonical/path",
  "modelServiceId": "service-id",
  "approvalMode": "plan",
  "sourceType": "channel",
  "sourceId": "dingtalk-main"
}
```

`cwd` は `POST /session/:id/load` と同じ解決規則に従い、デーモンのプライマリワークスペースの場合は省略できます。メタデータフィールドは、ワークツリー作成時のスレッドスコープおよびソースの慣例と同じものを代替セッションにスタンプします。

成功すると、このルートは代替セッションの作成形状レスポンスを含む `200` を返します。これは、検証済みの正規ワークツリーパスと等しい新しい `sessionId`、`workspaceCwd`、`currentCwd`、`worktree` メタデータ、および `worktreeState: "persisted-v1"` です。呼び出し側は古い ID のハンドルを破棄し、それ以降は代替 ID を使用します。古い ID の後続の復元は `worktree_session_superseded` を `replacementSessionId` とともに返します。クライアントはこれを利用して古くなったブッキング情報を自己修復することもできますが、その ID の読み込みが一度でも成功した場合に限ります。分類はサイドカーリンクのみから決定され、そのリンクはマーカーが切り替わる前に書き込まれるため、中断されたコミット前の転送では、マーカーの所有者ではない代替セッションが返されます。その代替セッション自身の復元は `worktree_reset_interrupted` を返し、再試行されたリセットによって回収されます。

このルートは `X-Qwen-Client-Id` を決して読み取らないため、代替セッションはアタッチされていない状態で生成されますが、成功レスポンスは登録フリーではありません。新しい転送はその生成に対してオーナースタイルの `clientId` を発行し、それを代替セッションに登録してボディで報告します。コミット済み転送の冪等な再開は何も報告しません。発行された ID はアタッチメントではありません（代替セッションのアタッチカウントは変更されないため、`killSession` with `requireZeroAttaches` では依然として未アタッチと見なされます）が、ライブクライアントの登録はまさにデーモンのアイドルクリーンアップを遅延させるものです。使い続けられない ID をデタッチしてください。さもないと、代替セッションは無期限にライブのままになります。そして、マーカーなしでまだライブである代替セッションは、後のリセットが解体を拒否する形状です。レスポンスを代替セッションのアイデンティティとして扱い、登録済みクライアントが必要な場合は通常の `POST /session/:id/load` または `/resume` インターフェースを通じてアタッチしてください。

転送はワークツリーの復元や他のリセットに対してチェックアウトごとにシリアライズされ、いずれかのセッションがビジー状態（プロンプト実行中または保留中のインタラクションあり）の場合は実行を拒否し、置き換えられたセッションに入場バリアを設定します。バリアが設定されている間、9 つのライターが入場で `worktree_reset_active` により拒否されます。すなわち、`POST /session/:id/prompt`、`/rewind`、`/cd`、`/branch`、`/fork`、`/shell`、`/goal`、`/tasks/:taskId/workflow-action`、および `/messages/delete` です。残りの 8 つは、プロンプト入場を経ずにセッションの cwd を移動するか、そこで作業を開始するためフェンスされています。シェルコマンドはセッションの実効 cwd で実行されますが、移設されたワークツリーセッションの場合、それはチェックアウトそのものです。フォークエージェントはその cwd でツールを実行します。巻き戻しはそれに対して相対的にファイルを復元します。cd はそれを移動します。チェックアウトのサブディレクトリへの移動も含みます。ブランチは所有権が変動している間に置き換えられたセッションの永続化された履歴を変更し、派生セッションを生成します。ゴール `resume` はキュー内のターンを昇格させ、継続をキューに入れます。メッセージ削除は永続化された履歴を書き換えます。ワークフローアクションは、保存されたワークフローまたは呼び出し側が提供したスクリプトを実行するか、セッション自身のツールレジストリ経由でライブ実行を再開します。`POST /session/:id/continue` は 10 番目のゲートではありません。承認された継続をフェンスされたプロンプト入場に駆動し、そこで拒否されるからです。このリストがフェンス全体であり、フェンスは子に到達するすべてではありません。リリースパスと停止パスは設計上、転送中でも使用可能です（タスクのキャンセル、ゴールのクリア、クライアントのデタッチ、セッションのキル）。また、デーモン内部のバックグラウンド通知エンキュー（サブセッションから親への完了確認で、HTTP ルートからは呼び出されないもの）もフェンスされていません。なぜなら、それはターンを開始するのではなく通知をエンキューするからです。転送の最後のステップは、置き換えられたセッションのクライアント登録を切断し、メモリ内のワークツリー関連付けをクリアし、置き換えられたセッションが実際に消滅したかどうかを報告します。生存者（まだバックグラウンド作業を保持している子で、最後のデタッチによってトリガーされるアイドルクローズが拒否され延期されるもの）は隠蔽されず表面化されます。デーモンはこれをログに記録し、バリアはそのエントリに残っている唯一のフェンスとして設定されたままになり、`200` ボディには `supersededSessionLive: true` が含まれ、呼び出し側は置き換えられた ID が所有権が移動したばかりのチェックアウト内でまだライブであり再アタッチ可能であることを知ることができます。クラッシュセーフティはウィンドウ単位であり、書き込み順序がウィンドウを定義します。まず古いサイドカーの `supersededBy` リンクが書き込まれ、次に `supersedes` を含む代替セッションのサイドカーが書き込まれ、最後にマーカーが切り替わります。したがって、切り替え前のクラッシュは、再試行が区別できる 3 つの形状のいずれかで古いセッションを権威ある状態のまま残します。リンクがまったくない場合（代替セッションは通常の孤児であり、再試行は単純に新しい転送を開始します）、後方リンクのみ存在し代替セッションのサイドカーがない場合（再試行は `worktree_reset_invalid_state` で閉じ込め失敗し、オペレーターによる修復のために中断された状態をそのまま残します）、両方のリンクが存在する場合（再試行は部分的な転送をロールバックし、新しい転送を完了します。ただし、クライアントがまだアタッチされているために中断された代替セッションを削除できない場合は、ロールバックは `worktree_reset_invalid_state` で閉じ込め失敗し、両方のリンクを保持するため、そのクライアントがいなくなると後の再試行が収束します）。切り替え後のクラッシュは代替セッションを権威ある状態のままにし、再試行は no-op として再開します。古いセッションは決して削除されず、ワークツリーのチェックアウトはリセットによって決して削除されません。

**エラー:**

- `404` — セッションレコードが存在しない場合 `session_not_found`。
- `409` — セッションに有効な Part 4A サイドカーがない場合（ワークツリーセッションではない）`worktree_reset_unsupported`。
- `409` — 転送に関与するセッションがビジー状態の場合 `worktree_reset_active`。落ち着いたら再試行してください。バリアがカバーする任意のライター（プロンプト、巻き戻し、cwd 変更、ブランチ、フォーク、シェルコマンド、ゴール制御、またはワークフロータスクアクション）の入場が、転送中のセッションで失敗した場合、同じコードで失敗します。
- `409` — 破損したサイドカー、無効なマーカー、包含の失敗、または矛盾する上書きリンクペアに対する `worktree_reset_invalid_state`。このリクエストが開始した処理に対して非破壊的です：このリクエストが開始した部分的な転送はすべて、呼び出し側が表示する前にロールバックされます。一方、フェイルクローズ型のレジューム分岐（無効なマーカー、一致しない上書きリンクペア（置換サイドカーが欠落している後方リンクを含む）、あいまいなマーカー所有者、およびマーカーが存在しない場合にこのデーモン上でまだアクティブな置換）は、既存の中断状態をオペレーターによる修復のためにそのまま残し、形状が後のリセットまたは復元で表示されるようにします。これらの状態のいずれかに対する再試行はそれらを再読み込みし、同じ 409 を返します：収束しないため、状態には再試行ループではなくオペレーターによる修復が必要です。具体的な理由はワイヤー上ではなくデーモンログに書き込まれます。
- `500` — フェイルクローズの内部エラー（例：リセットサポートのないブリッジ、またはロールバック後の移管拒否）。そのままでは再試行できません。1 つの `500` は性質が異なります：コミット後のテールがフリップの永続的コミット _後_ に失敗したマーカー転送は、所有権が移動したことを報告し、破壊的なロールバックを実行せず、リセットを再試行することで修復され、コミットされた転送を冪等に再開します。

### `GET /workspace/:id/session-info` and `GET /workspaces/:workspace/session-info`

ページネーション付きセッションリストパスを変更せずに、選択されたワークスペースの集計済み永続化セッション数を返します：

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

`active`、`archived`、および `total` はユーザーに見えるローカル JSONL セッションをカウントします。内部デーモンホストセッションとワークスペースエージェントタスクセッション（`sourceType` `agent-host` および `agent`）は、これらのカウントおよびすべてのセッションリストから除外されます。ユーザーは ID でエージェントセッションを開くことができます。`live` は対応するユーザーに見えるインメモリブリッジ数であり、登録された信頼できないセカンダリワークスペースでは省略されます。これは永続化のみを読む操作がライブ状態をクエリしてはならないためです。`expensive` は常に `true` であり、`cost` は常に `"disk_scan"` です。クライアントはこのエンドポイントを頻繁に呼び出さず、ポーリングしないでください。スキャンが安全上限に達した場合、または候補ファイルすべてを分類できなかった場合、レスポンスに `"truncated": true` が追加され、永続化カウントは下限値となります。ストレージが存在しない場合、永続化カウントはゼロになります。複数形ルートは、複数形セッションカタログと同じワークスペースセレクターと信頼ポリシーを使用します。信頼できないプライマリでも `403 untrusted_workspace` を返します。

TypeScript デーモン SDK は、`workspaceById(...)` または `workspaceByCwd(...)` を介して複数形ルートを公開し、続いて `getWorkspaceSessionInfo()` を使用します。

### ワークスペースセッションアーティファクトライブラリ

`workspace_artifact_library`はさらに、ワークスペース全体のクエリとバッチ操作をサポートします：

| メソッド | ルート | 入力 |
| ------ | ------------------------------------------------ | ------------------------------------------------------------------------------- |
| GET | `/workspaces/:workspace/artifact-library` | ワークスペース内のすべてのアクティブ、未ロード、およびアーカイブされたセッション |
| POST | `/workspaces/:workspace/artifact-library/query` | `{ "sessionIds": ["session-id"] }` |
| POST | `/workspaces/:workspace/artifact-library/delete` | `{ "artifacts": [{ "sessionId": "session-id", "artifactId": "artifact-id" }] }` |

両方のPOSTボディは、1〜100件のエントリを含む厳密なオブジェクトです。重複したIDやペアは一度だけ処理されます。クエリのレスポンスは`{ "v": 1, "sessions": [<session artifact envelope>], "errors": [<member error>] }`です。各メンバーのエラーには`sessionId`、`status`、`code`、および`message`が含まれます。完全な検出では、存在しないセッションや外部のセッションは省略されますが、明示的なクエリではこれらが報告されます。他のメンバーの失敗は明示的に残され、成功したセッションは返されます。

`workspace_artifact_library_stream`を使用する場合、すべてのアーティファクトライブラリセッションエンベロープ（既存の単一セッションGETも含む）には以下が追加されます：

```json
{
  "session": {
    "displayName": "Task title",
    "createdAt": "2026-10-26T00:00:00.000Z",
    "archiveState": "archived",
    "sourceType": "scheduled_task",
    "sourceId": "task-id"
  }
}
```

`displayName`と`sourceId`はオプションです。`createdAt`は、再開後も含まれる元のセッション作成時刻であり、アーティファクトのタイムスタンプではありません。`archiveState`は`active`または`archived`です。ソースタイプはオープンな文字列であり、帰属情報が欠落している場合は`default`になります。`resource_inspection`などのソースは、クライアントが明示的に除外できるように保持されます。ソースIDはその元のソースタイプとペアリングされています。名前は、現在のライブタイトルまたは永続化されたカスタムタイトル/最初のプロンプトに従います。汎用の`/session/:id/artifacts`レスポンスは変更されていません。

完全なGETと選択されたセッションのPOSTでも`Accept: text/event-stream`を受け付けます。このネゴシエーションがない場合、上記のJSONレスポンスを返します。POSTにはfetchベースのストリーミングを使用してください。古いデーモンでは機能とレスポンスコンテンツタイプを確認してください。有限のSSEシーケンスは以下の通りです：

| イベント | データ |
| --------------- | -------------------------------------------------------------------------------- |
| `start`         | `{ "v": 1, "total": <candidate sessions> }`                                      |
| `session` | `session` を含む完全なアーティファクトライブラリエンベロープ 1 つ |
| `session_error` | `{ "v": 1, "sessionId": "...", "status": 404, "code": "...", "message": "..." }` |
| `complete`      | `{ "v": 1, "total": 10, "succeeded": 8, "failed": 1, "skipped": 1 }`             |
| `error` | 致命的な `{ "v": 1, "status": 503, "code": "...", "message": "..." }` |

結果は完了順に到着し、最大4つのセッション読み取りが並行して実行されます。遅いセッションが他のワーカーをブロックすることはありません。JSONは選択順序を保持します。完全クエリにおける存在しない/外部のセッションは`skipped`としてカウントされます。明示的クエリの失敗は`session_error`を出力します。`total`は候補数をカウントし、アーティファクト数をカウントしません。`complete`のみがスキャン完了を示します。致命的な`error`または`complete`なしでの切断は部分結果を意味し、再生カーソル、自動再接続、サブスクリプションはありません。待機中にハートビートコメントが発生する場合があります。初期の失敗は通常のHTTPステータスコードを使用します。SSEヘッダー送信後の致命的なエラーはストリームイベントとなります。切断されたリクエストは新しい読み取りのディスパッチを停止しますが、既に実行中の共有キャッシュ読み取りは完了する可能性があります。バックプレッシャーは保留中の結果フレームを制限し、クライアントを待っている間アーカイブバリアを保持しません。

バッチ削除は`{ "v": 1, "results": [...] }`を返します。各結果には`sessionId`と`artifactId`が含まれ、既存の変更に伴うエンベロープ（`v`、`changes`、オプションの`warnings`/`warningDetails`）または`error: { status, code, message }`のいずれかが含まれます。存在しないアーティファクトは冪等な空の変更として扱われます。クライアントはすべての結果と永続化警告を確認する必要があります。200のバッチレスポンスは、すべてのメンバーが成功したことを意味しません。削除はセッションごとにグループ化され、セッション間ではトランザクションではなく、実際のファイルを保持し、単一アーティファクト削除と同じ厳格なオペレーター権限が必要です。無効な入力は400 `invalid_artifact_library_request`を返します。ワークスペースレベルのエラーは通常のHTTPステータスコードを維持します。

ライブアーティファクトとタイトルはブリッジから取得されます。有界の永続化されたアイデンティティメタデータは、元の作成時刻とソース帰属情報を保持します。空の結果を含む未ロードのメタデータは、実行時ごとに32 MiBのシリアル化サイズ予算でキャッシュされます。変更されていないファイルは、繰り返しクエリやTTL経過後にも再再生されません。トランスクリプトと所有権メタデータのアイデンティティは各読み取り時にチェックされ、変更されたエントリは再構築されます。候補検出はディレクトリアイデンティティによってキャッシュされ、完了したスキャンの少なくとも2秒後に行われる最初のクエリで更新されます。このファイル名のみによる更新により、変更されていないアーティファクトキャッシュが保持されます。並行コールド読み取りは読み込みを共有し、各リクエストは一度に最大4つのセッションを処理します。受け入れられた変更されていないエントリは保持されます。予算を超える新しい結果はキャッシュされずに返されるため、繰り返しのフルスキャンによってキャッシュ全体が追い出されることはありません。これらのキャッシュされないセッション、またはデーモンの再起動は再構築が必要です。これにより、キャッシュされたエントリの繰り返しJSONL解析を回避できますが、ファイルシステムチェックとレスポンスサイズはワークスペースに応じてスケールします。コールドファイル可用性は、既存のメタデータのみに関するセマンティクスを維持します。

既存の単一セッションアーティファクトライブラリGETは、完全クエリおよびバッチクエリと同じキャッシュを共有しており、レスポンスに`session`サマリーを追加するだけで、既存のエラー形式を維持します。あるルートへのウォームアップは他のルートにも利益をもたらします。単一およびバッチ削除は共有エントリを無効化します。タイトルのみに関するトランスクリプト追記やアーカイブ移動もメタデータを更新します。ライブタイトルはディスク永続化を待たずに各リクエストで読み取られます。ライブの永続化メタデータとコールドエンベロープは同じ32 MiB予算を共有し、ライブ/コールド間の遷移はエントリを再構築します。キャッシュされたエンベロープの`generatedAt`は、そのプロジェクションの作成時刻です。

`session_artifact_library` は、これらの永続化ワークスペーススコープのエンドポイントを公開します:

| メソッド | ルート | 結果 |
| ------ | ----------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| GET | `/workspaces/:workspace/session/:id/artifact-library` | アンロードおよびアーカイブされたセッションの永続化登録を含む、セッションアーティファクトエンベロープ。 |
| DELETE | `/workspaces/:workspace/session/:id/artifact-library/:artifactId` | アーティファクト変更に伴う結果。既に存在しない登録は `changes: []` を返します。 |

ワークスペースセレクタは信頼できるランタイムに解決されます。両方のルートは、曖昧なライブオーナーや別のランタイム内のライブオーナーを拒否してから、アーティファクトにアクセスします。これらは内部ランタイムアクティビティバリアに参加します。読み取りは共有セッションアーカイブバリアを保持し、削除は排他的に保持します。どちらのルートもエージェントをロードしたり、セッションをアンアーカイブしたりしません。削除には厳格な変更ゲートを通じたデーモンオペレーターの権限が必要ですが、`X-Qwen-Client-Id` は必要ありません。既存のクライアント所有のアーティファクトエンドポイントは、その認可ルールを維持します。

コールド読み取りは、永続化されたアーティファクトレコードを再生し、ワークスペース相対的な `workspacePath`、`managedId` または `url` などのメタデータとロケーターを返します。記録されたタイムスタンプを保持し、成功した永続化を利用不可としてマークせずに、アーティファクトごとの互換性警告を報告します。`limits.maxArtifacts` はライブストアの登録制限を記述します。コールドプロジェクションはその制限を強制するために歴史的な登録を退避しません。

コールド削除は、永続的な明示的な墓碑（tombstone）を追加します。ワークスペースファイルを保持し、参照されていないデーモン管理のWebプレビューのスナップショット参照を、既存のベストエフォートクリーンアップを使用して解放します。ライブ削除は、永続化が失敗した場合、HTTP 200 とともに `changes: []`、`warnings` および `warningDetails` を返すことがあります。呼び出し側は結果を検査し、登録を保持する必要があります。コールド書き込みの失敗はエラーとして返されます。

両方のルートは、アーティファクト永続化が無効になっている場合に `409 artifact_library_unavailable` を返します。不明なセッションは `404 session_not_found` を返します。外部プロジェクトストレージは見つからないものとして扱われ、曖昧または非正規のストレージは `409 session_storage_conflict` を返します。不完全な会話レコードまたは非権威的な変更ジャーナルは、並行書き込み側の `session_transcript_changed` とは異なる `409 session_transcript_corrupt` を返します。64 MiBを超える読み取りは 413 を返します。コールドマネージド実行の変更は `409 artifact_mutation_requires_managed_authority` を返します。既存のワークスペース所有権およびライフサイクルエラー応答も適用されます。

### `GET /workspace/:id/sessions` and `GET /workspaces/:workspace/sessions`

正規ワークスペースが `:id` または `:workspace` に一致するセッションを一覧表示します。path パラメータは、まず正確なワークスペース ID として解決され、次に URL エンコードされた絶対 cwd として解決されます。プライマリワークスペースには、既存の永続化/ライブマージが含まれます: デフォルトの一覧は `chats/` のアクティブなセッションです; アーカイブされたセッションを `chats/archive/` から一覧表示するには `archiveState=archived` を渡します。信頼できる非プライマリワークスペースには、独自の `chats/` ストアからのアクティブな永続化セッションと、重複なしで一致するライブサマリのマージが含まれます; アクティブな永続化セッションが存在しない場合、ルートは以前のライブのみカーソルの動作を保持します。信頼できる非プライマリワークスペースはまた、`archiveState=archived`、整理された `view=organized` リスト、および `group` フィルターをサポートし、独自の `chats/`、`chats/archive/`、およびセッション組織ストアから読み取ります; 組み合わせた `view=organized&archiveState=archived` クエリは、ライブマージなしでアーカイブされたセッションのみを返します。登録された信頼できない非プライマリワークスペースは、同じリスト、フィルター、およびページネーション形状をサポートしますが、永続化エントリのみを返します: デーモンはライブブリッジにクエリを実行したり、ランタイムから保留中のインタラクション、ターンエラー、またはクライアント状態を設定したりしません。`clientCount: 0` や `hasActivePrompt: false` などの永続化デフォルトは、ワイヤー互換性のために存在し続けます。ストレージがない場合は空のリストを返します。複数形ルートは、信頼できないプライマリに対して依然として `403 { code: "untrusted_workspace" }` を返します; レガシープライマルルートは、既存の互換性動作を維持します。v1 では `archiveState=all` はサポートされていません。プライマリおよび永続化バックエンドのリストは、既存の数値的な `cursor` セマンティクスを維持します; 永続化のない信頼できる非プライマリライブフォールバックは、既存の不透明なライブカーソルを維持します。

```bash
curl http://127.0.0.1:4170/workspace/$(jq -rn --arg c "$PWD" '$c|@uri')/sessions
curl http://127.0.0.1:4170/workspace/$(jq -rn --arg c "$PWD" '$c|@uri')/sessions?archiveState=archived
curl http://127.0.0.1:4170/workspaces/<workspace-id>/sessions
```

`workspace_qualified_rest_core` が広告されると、ワークスペーススコープのセッションバッチ操作、グループ CRUD、およびセッション組織変更が `/workspaces/:workspace/sessions/{delete,archive,unarchive}`、`/workspaces/:workspace/session-groups`、および `/workspaces/:workspace/session/:id/organization` の下で利用可能になります。信頼できないセカンダリの場合、グループ GET は引き続き利用可能です; すべてのグループ、セッション、および組織変更は引き続き信頼ゲートされています。ワークスペースなしのバッチおよび組織変更ルートは、互換性のためプライマリワークスペース専用です。

クエリパラメータ:

| フィールド | 必須 | 備考 |
| -------------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `archiveState` | いいえ | `active` (デフォルト) または `archived`。その他の値は `400 { code: "invalid_archive_state" }` を返します。 |
| `cursor` | いいえ | 前のレスポンスからのページネーションカーソル。 |
| `size` | いいえ | ページサイズ。無効な値は `400 { code: "invalid_cursor" }` または既存のページサイズ検証を返します。 |
| `view` | いいえ | レガシーな最近リストの場合は省略してください。`organized` はサーバー側ピン留め/グループ順序付けを選択し、オプションの組織フィールドを追加します。その他の値は `400 { code: "invalid_session_view" }` を返します。 |
| `group` | いいえ | `view=organized` と共にのみ意味があります。`all` (デフォルト)、`pinned`、`ungrouped`、またはカスタムグループ ID。不明なグループ ID は `404 { code: "group_not_found" }` を返します。 |

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

`view=organized` を使用すると、デーモンは `<Storage.getProjectDir(cwd)>/session-organization.v1.json` を読み取り、ピン留めされたセッションを最初に返し、次に活動時間降順で、最後に安定したタイのために `sessionId` を返します。整理されたカーソルは不透明な base64url JSON であり、レガシーな最近リストで再利用してはなりません。`pinned` は仮想フィルターであり、グループではありません。`groupId: null` はグループ化されていないことを意味します。アーカイブされたセッションは組織メタデータを保持しますが、`archiveState=archived&view=organized` は依然としてアーカイブされたセッションのみを返します。

活動順序付きカーソル — 整理されたビューと `parentSessionId` / `sourceType` フィルター付きリスト — はスナップショット分離されておらず、信頼できるアクティブリストは、トランスクリプト mtime とライブ活動ウォーターマークのうち遅い方によって行を並べ替えます。ライブウォーターマークはメモリ内のみであるため、2回のページ取得の間でライブエントリが終了すると、セッションのキーはその mtime に退行することがあります。カーソルはこれを補正します: ライブ由来のキーで既に出力されたアイデンティティを保持し — 行がページのコレクションに存在しない間、およびピン反転により再受け入れられる可能性がある間も保持し — そしてパスの残りの部分についてはそれらを除外するため、ライブ由来のキー移動によりセッションはパスあたり最大1回返されます。保証は保持範囲に限定されます: 64 アイデンティティで上限があり (1つのパス内の超過アイデンティティはエラーではなく最大1回の重複に劣化し)、ピン状態が変化する前に出力された永続化のみの行は決して保持されないため、取得間のアンピンによりその行がこのフィールドが存在する前と同様に2回目に返される可能性があります。したがって、ページを蓄積する呼び出し側は、常に `sessionId` で行をキーすべきであり、64を超える場合だけでなく常にそうすべきです。行は同時活動の下で移動またはスキップされる可能性が依然としてあり、以前と全く同じです; 一貫したビューが必要な呼び出し側は、活動変化後に最初のページから再読み込みします。

`view=organized` の場合、各セッションに追加フィールドが表示される可能性があります:

```json
{
  "isPinned": true,
  "pinnedAt": "2026-07-04T12:00:00.000Z",
  "groupId": "018f..."
}
```

信頼できるアクティブリストには、`clientCount`、`hasActivePrompt`、`activeWorkState` などのライブデーモンオーバーレイフィールドが含まれます。信頼できないセカンダリおよびアーカイブリストはストレージのみです: ライブオーバーレイフィールドは欠落または false のままであり、アーカイブエントリは `isArchived` を `true` に設定します。セッションが存在しない場合は空配列 (404 ではない) — ワークスペースがアイドル状態だからといってセッションピッカー UI がエラーになるべきではありません。

### `POST /sessions/catalog`

1つのリクエストで複数の登録済みワークスペースの独立してページネーションされたセッションカタログを読み取ります。事前に `session_catalog_batch` を一度実行してください; 古いデーモンはワークスペース修飾セッションリストおよびグループエンドポイントを保持します。各バッチメンバーには永続化ワークスペース所有権があります: 認証およびリクエストアドミッションはプロセスグローバルですが、各エントリは所有ワークスペースのみを解決および読み取ります。ワークスペースの登録、セッションの作成、ACP の開始、プライマリランタイムへのフォールバックは決して行いません。

```json
{
  "workspaces": [
    { "workspace": "workspace-a", "cursor": "previous-a-cursor" },
    { "workspace": "/canonical/workspace-b" }
  ],
  "options": {
    "size": 20,
    "archiveState": "active",
    "view": "organized",
    "group": "all"
  },
  "includeGroups": true
}
```

`workspaces` は、1〜20個の `{ workspace, cursor? }` エントリの順序付き配列、またはすべての公開登録済みワークスペースを選択するための `"all"` です。セレクターは、正規絶対パスの前に正確な ID として解決されます。`all` は内部 Conversations および削除されたエントリを除外し、一時的に利用不可のエントリを含み、20個を超えるエントリが選択される場合は失敗します; 呼び出し側は明示的な選択を分割する必要があります。空の公開レジストリは空の結果を返します。明示的な内部セレクターは、内部ランタイムを起動せずにエントリエラーを返します。

共有の `options` は、既存のリストフィルターおよび組み合わせと共に、`size` (整数 1–100、デフォルト 20)、`archiveState`、`view`、`group`、`parentSessionId`、`sourceType`、および `sourceId` を受け入れます。`group` および `parentSessionId` は 256 文字に制限されています。`includeGroups` のデフォルトは false です。各ワークスペースには独自のカーソルがあります。バッチデフォルトページは、ライブのみのセッションも含めて、活動順序および不透明カーソルを使用します; これらのカーソルはレガシー数値リストカーソルと相互交換できません。そのエントリの返された `cwd` および `nextCursor` を使用して、フィルターを保持しながら続けます。グローバルソートやグローバルページネーションカーソルはありません。

```json
{
  "workspaces": [
    {
      "workspace": "workspace-a",
      "workspaceId": "workspace-a",
      "cwd": "/canonical/workspace-a",
      "sessions": [],
      "groups": {
        "groups": [],
        "colorOptions": ["red", "orange", "yellow", "green", "blue", "purple"]
      }
    },
    {
      "workspace": "/canonical/workspace-b",
      "error": {
        "code": "workspace_not_found",
        "message": "Workspace is not registered with this daemon.",
        "status": 404
      }
    }
  ]
}
```

結果は選択順序と元のセレクタを `workspace` として保持します。成功したエントリには、正規化された `cwd`、`workspaceId`、および既存のページフィールド（`sessions`、オプションの `nextCursor`、`truncated`、`liveMergeFailed`）が含まれます。返されるすべてのセッションの `workspaceCwd` は、それを含むエントリの正規化された `cwd` に正規化されます。要求された場合、`groups` には完全なグループカタログが含まれます。グループの識別子は、それを含むワークスペースにスコープされます。グループ読み取りでは、既存の正規化が維持され、不正または読み取り不能な組織ストアに対して警告付きの空リストへのフォールバックが行われます。失敗したエントリには、利用可能な場合に限り `error: { code, message, status }` と解決されたアイデンティティが含まれ、成功を示す空の `sessions` リストは含まれません。一部のエントリが失敗した場合でも、有効なバッチは HTTP 200 を返します。不正な要求エンベロープは、ストレージ読み取りの前に HTTP 400 を返します。

不明、内部、または削除されたワークスペースは `404 workspace_not_found` を生成し、利用不可または変更されたランタイム世代は `503 workspace_runtime_unavailable` を生成し、信頼されていないプライマリは `403 untrusted_workspace` を生成します。信頼されていないセカンダリは、ライブブリッジ読み取り、修復書き込み、デバッグセッションログなしで、既存の永続化のみカタログポリシーを維持します。スローされたカーソルおよびグループの失敗は既存のコードを保持し、他のスローされた読み取り失敗は `500 session_catalog_failed` になります。信頼できるアクティブなエントリは、既存のライブブリッジ状態をマージできますが、アーカイブされたエントリはストレージのみです。

デーモンはバッチごとに最大4つのワークスペース読み取りを並行して実行し、セレクタを4096文字、カーソルを16384文字に制限し、各シリアライズされた成功エントリを512 KiBに上限設定します。サイズ超過のエントリは `413 catalog_response_too_large` を返します。再試行前に `size` を減らすか、グループを省略してください。これにより、バッチ応答は約10 MiBプラスエンベロープ/エラーオーバーヘッドに制限されます。クライアントの切断は保留中の読み取りを取り消し、追加のワークスペース読み取りの開始を防ぎます。既存のデーモンのJSONボディ制限と永続化スキャン制限も適用されます。カタログ要求は読み取りレート制限ティアを使用します。

### `POST /sessions/live-state`

1つのリクエストで、明示的に選択された登録済みワークスペース1〜20件のライブ状態スナップショットを読み取ります。厳密なボディは `{ "workspaces": ["workspace-id", "/absolute/workspace/path"] }` です。セレクタは、正規化された絶対パスの前に正確なワークスペースIDとして解決されます。応答はリクエスト順の `{ "workspaces": [...] }` です。各成功エントリには、元の `workspace` セレクタ、正規化された `workspaceId` と `cwd`、および以下の単一ワークスペースルートと同じ `v: 1`、`catalogVersion`、完全な `sessions` スナップショットが含まれます。スナップショットは独立しており、ワークスペース間のアトミック性や統合セッションフィードはありません。両方のルートはカタログバージョン公開とキャッシュ無効化を共有しているため、それらを交互に使用しても単一ワークスペースのカタログ照合契約が維持されます。一部のエントリが失敗した場合でも、有効なバッチはHTTP 200と `Cache-Control: no-store` を返します。

各失敗エントリには `workspace`、オプションの解決された `workspaceId` と `cwd`、および成功を示す空の `sessions` リストなしの `error: { code, message, status }` が含まれます。不明、内部、または削除されたセレクタは `404 workspace_not_found` を返し、利用不可または置き換えられたランタイム世代は `503 workspace_runtime_unavailable` を返し、信頼されていないプライマリまたはセカンダリワークスペースは `403 untrusted_workspace` を返し、予期しないブリッジ障害は `500 session_live_state_failed` を返します。512 KiBを超える成功エントリは `413 live_state_response_too_large` を返します。不正なエンベロープ、余分なキー、空配列、20以上のセレクタ、4096文字を超えるセレクタは、ブリッジ読み取りの前にHTTP 400 `invalid_session_live_state_batch_request` を返します。このルートは、選択された各アクティブランタイムのインメモリブリッジのみを読み取り、永続化カタログやACP子プロセスは読み取りません。メンバー読み取りは順次実行され、POSTはデーモンの読み取りレート制限ティアに課金されます。

### `GET /workspaces/:workspace/sessions/live-state`

クライアントが `GET /workspaces/:workspace/sessions` の永続化カタログを `hasActivePrompt`、待機フラグ、`clientCount` などの揮発性状態のためにポーリング停止できるように、選択されたワークスペースランタイムのメモリ専用ライブセッションスナップショットとインメモリカタログバージョンを返します。プリフライト `workspace_session_live_state`。タグは `workspace_qualified_rest_core` から独立しているため、より広いワークスペースREST機能を広告する古いデーモンはこのルートを実装しません。セレクタは最初に正確なワークスペースIDとして解決され、次に正規化後のURLエンコードされた絶対cwdとして解決され、他の複数セッションルートと一致します。このルートはプライマリとセカンダリランタイムの両方に対して信頼必須です。プライマリランタイムへのフォールバックは行わず、信頼されていないセカンダリに限定されたカタログ読み取りを許可する寛容な永続化カタログポリシーも使用しません。エンドポイントにはクエリパラメータがなく、セッションストレージ、設定、外部コマンド、ACP往復処理も実行しないため、そのコストは永続化セッション数やJSONLサイズから独立しています。デフォルトのライブセッション上限により応答は制限され、上限が無効な場合でもコストはライブセッションの数にのみ比例します。

応答:

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
      "activeWorkState": "active",
      "isWaitingForPermission": false,
      "isWaitingForUserQuestion": false,
      "updatedAt": "2026-08-18T08:12:30.123Z"
    }
  ]
}
```

`v` は応答スキーマバージョンです。すべての成功応答には `Cache-Control: no-store` が含まれます。`sessions` は、選択されたランタイムで現在ライブであるセッションの完全な、ページングなし、順序付けられていないセットです。空のライブランタイムは `200` と `sessions: []` を返します。`clientCount`、`hasActivePrompt`、`isWaitingForPermission`、`isWaitingForUserQuestion` は必須のワイヤーフィールドであり、欠落したオプションのブリッジ値は `0` または `false` に投影されます。`activeWorkState` はワイヤー追加的であり、古いデーモンには存在しません。`active` は、デーモンが未確定の作業を所有しているか、子プロセスが新しい非空ホールドスナップショットを送信したことを意味します。`idle` は、すべての必須カテゴリをカバーする新しい空スナップショットに対してのみ出力されます。`unknown` は、ネゴシエートされたレポートが古いか不完全であることを意味します。`unsupported` は、子プロセスがレポートをネゴシエートしなかったことを意味します。これは `hasActivePrompt` を変更しません。バックグラウンドシェル、cronターン、保留中のターミナル通知は、フォアグラウンドプロンプトにならずにアクティブな作業です。表示名、作成時間、組織、ソースメタデータなどの静的カタログフィールドは意図的に除外されており、完全なカタログによって所有されたままです。ライブ状態行が存在しない場合、既知のカタログ行の揮発性フィールドをクリアするだけで、永続化カタログ行を削除することはありません。

`updatedAt` は、実行状態に達したプロンプトが現在のブリッジで正式なターミナルを発行した場合に存在する、オプションのデーモン監視アクティビティ・ウォーターマークです。成功、エラー、キャンセル、期限切れなど、すべてのターミナルが書き込まれた後に一度だけ進み、2 つのターミナルが同じ壁時計ミリ秒に着地したり、壁時計が巻き戻ったりしても、ライブセッションごとに厳密に増加します。したがって、前方へのクロックジャンプは、壁時計時間が追いつくまで持続します。セッションの `createdAt` より早くなることはありません。最初の進歩は作成時間でフロアされるため、作成と最初のターミナルの間での壁時計ロールバックにより、すでにリストされていた `createdAt` の後ろにキーが存在することにはなりません。プロンプトのアドミッション、キュー待ち、ストリーミング更新、キュー専用キャンセル、ハートビート、インタラクション待ちは、これを進行させることはありません。クライアントは、完了したターン後にカタログ全体を再読み込みする代わりに、保持しているカタログ行の新しさを更新するためにこれを使用します。これは永続化の確認応答ではありません。レコーダーはターン結果を非同期で書き込むため、この値はデーモンが実行中の試行が完了したことを観測したことのみを証明します。ディスクから復元されたセッションを含め、ブリッジ世代における最初のランニングターミナルの前には存在しないため、不在はサポートプローブではなく、デーモンの再起動またはワークスペースランタイムの置換によって新しいブリッジがインストールされると消えます。1 つのセッションに対してライブサマリーと永続化サマリーの両方が存在する場合、完全なカタログレスポンスはより後の有効なタイムスタンプを報告するため、そのマージを行わずにブリッジサマリーを直接返す `GET /session/:id/status` は、リストレスポンスよりも早い値を報告する可能性があります。

`catalogVersion` は、デーモンが観測したカタログ変更のための等価性トークンです。`generation` は各ブリッジインスタンスで作成されるランダムな UUID であり、デーモンの再起動またはワークスペースランタイムの置換時に変わります。`revision` はゼロから始まり、世代内で単調に増加します。唯一サポートされている操作は、ペア全体に対する等価性です。同じ世代とリビジョンは、デーモンが観測したカタログ変更がないことを意味し、何らかの違いは完全なカタログを再読み込みすることを意味します。クライアントはリビジョン演算を実行したり、世代間でリビジョンを比較したりしてはならず、保守的な追加インクリメントは許可されます。バージョンは、デーモンが観測したカタログメンバーシップおよび静的メタデータの変更を対象とします。通常のターン活動、プロンプトライフサイクル、アタッチ/デタッチ、待機状態遷移は、ライブスナップショットが対応する揮発性フィールドを既に保持しているため、これを進行させません。したがって、変更されていないバージョン下での `updatedAt` の変化は有効かつ期待されており、デーモンの永続化リストキャッシュを無効にするものではありません。2 つの揮発性オーバーレイ値は意図的に両方のシグナルの外にあります。ターンエラー状態（`hasTurnError`/`turnError`）と保留中インタラクション数/コンテンツ（`pendingInteractionCount`/`pendingInteractions`）はどちらもバージョンを進行させず、スナップショットにも表示されないため、これらが必要なクライアントは、このルートに依存するのではなく、セッションごとのイベントストリームまたは完全なカタログを読み続ける必要があります。具体的なコンシューマーが必要とする場合、どちらのフィールドもワイヤー加法的に追加できます。別のデーモン、TUI、または外部プロセスによって直接書き込まれた変更は観測されないため、クライアントが定期的な完全カタログポーリングを停止すると、それらの書き込みには有界の検出時間があり、明示的な完全リロード、別の観測されたカタログ変更、再接続、またはデーモン/ランタイム置換の後でのみ表面化します。

クライアントは、2 回の読み取りハンドシェイクを使用してカタログバンドルを照合します。ライブ状態 A を読み取り、完全なセッションリスト（クライアントが `session_organization` を消費する場合は `GET /workspaces/:workspace/session-groups` も含む）を読み込み、次にライブ状態 B を読み取ります。A と B のバージョンが一致すればバンドルを受け入れます。バージョンが異なる場合はカタログを古くなったとマークし、タイトなリトライループに入る代わりに、最大 1 回の末尾リロードを結合します。受け入れられたすべてのカタログリクエストは A の後に開始されなければなりません。A より前に始まったリクエストまたは重複排除されたプロミスは、照合を満たすことができません。バージョン駆動のリロードはワークスペースごとにシングルフライトであり、ゼロ以外のバックグラウンド最小間隔に従うため、持続的なカタログチャーンにより、ライブ状態ポーリングごとに完全なカタログスキャンが発生することはありません。明示的なローカル変更は、同じシングルフライト操作を通じて即時リフレッシュを要求することも依然として可能です。

**エラー:**

- `400` — 不明、不正形式、ネスト、または未登録のセレクターに対する既存のセレクター検証または `workspace_mismatch` の動作。このルートは、不明なセレクターをプライマリランタイムに解決することはありません。
- `403` — 信頼できないプライマリを含む、信頼できないランタイムに対する `untrusted_workspace`。
- `503` — ブートストラップ中、移行中、ドレイン中、ブロック中、または削除されたランタイム、あるいはリクエスト中に閉じるランタイム世代に対する `workspace_runtime_unavailable` と `Retry-After`。
- `500` — 予期しないローカルエラーは、既存のブリッジエラーマッピングを使用します。

### `GET /workspace/:id/session-groups`

ワークスペースのユーザー定義セッショングループを一覧表示します。単数の GET セレクターは、登録済みのワークスペース ID または URL エンコードされた正規 cwd を受け入れます。複数の GET エイリアスは信頼できないセカンダリでも利用可能であり、組織サイドカーのみを読み取ります。複数のグループ変更は信頼ゲート付きのままですが、単数のグループ変更はプライマリ専用の互換性動作を維持します。プリフライト `caps.features.includes('session_organization')`。

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

色はプロトコルトークンのみです。クライアントは表示名をローカライズします。デフォルトの色付きグループは作成されません。

### `POST /workspace/:id/session-groups`

カスタムセッショングループを作成します。厳格な変更ゲート。プリフライト `caps.features.includes('session_organization')`。

リクエスト:

```json
{ "name": "Frontend", "color": "blue" }
```

`name` はトリムされ、1〜64 文字でなければならず、制御文字を含めることはできず、ワークスペース内で大文字小文字を区別しないトリム比較により一意でなければなりません。重複した名前は `409 { code: "group_name_conflict" }` を返します。`color` は返された `colorOptions` のいずれかでなければなりません。

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

カスタムセッショングループを更新します。厳格な変更ゲート。プリフライト `caps.features.includes('session_organization')`。ボディフィールドはオプションです: `{ "name"?: string, "color"?: string, "order"?: number }`。不明なグループ ID は `404 { code: "group_not_found" }` を返します。重複/無効な名前と色は、作成時と同じエラーを使用します。

### `DELETE /workspace/:id/session-groups/:groupId`

カスタムセッショングループを削除します。厳格な変更ゲート。プリフライト `caps.features.includes('session_organization')`。グループを参照するセッションは `groupId: null` にクリアされます。ピン留め状態は保持されます。レスポンスは、グループが削除された場合は `{ "deleted": true }`、ID が存在しなかった場合は `{ "deleted": false }` です。

### `POST /sessions/delete`

永続化されたセッションのJSONLファイルを1つ以上完全に削除します。デーモンはまずベストエフォートでライブセッションをクローズし、その後アクティブまたはアーカイブされたJSONLを削除します。同じIDに対してアクティブとアーカイブのコピーが両方存在する場合、両方が削除されます。両側のワークツリーサイドカーもクリーンアップされますが、ファイル履歴、サブエージェントのトランスクリプト、およびランタイムサイドカーは意図的に保持されます。

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

1つ以上のセッションをアーカイブします。アーカイブは削除ではなく状態遷移です: JSONLファイルが`chats/<id>.jsonl`から`chats/archive/<id>.jsonl`へ移動します。ファイル履歴、サブエージェントのトランスクリプト、ランタイムサイドカーはその場に留まります。セッションがアクティブな場合、デーモンはまず厳密なクローズを実行し、ACPエージェントのクローズハンドラーにチャット記録のフラッシュを要求します。クローズまたはフラッシュが失敗した場合、JSONLは移動されません。事前チェックとして`caps.features.session_archive`を実行してください。

リクエスト:

```json
{ "sessionIds": ["<uuid>"], "resolveConflicts": true, "requireIdle": true }
```

`sessionIds`は空でない文字列配列であり、最大100個のIDを含む必要があります。重複は統合されます。

レスポンス:

```json
{
  "archived": ["<uuid>"],
  "alreadyArchived": [],
  "resolvedConflicts": ["<uuid>"],
  "notFound": [],
  "errors": []
}
```

`resolveConflicts`は省略可能で、デフォルトは`false`です。デフォルトでは、同じIDを持つアクティブおよびアーカイブされたファイルは`errors`に報告され、どちらのコピーも移動、削除、上書きされません。アクティブなセッションをアーカイブする場合、競合分類の前に上記の厳密なクローズが実行されるため、キューに入れられたレコードがアクティブなトランスクリプトにフラッシュされる可能性があります。`resolveConflicts: true`を使用すると、選択したワークスペースが管理できる通常のトランスクリプトファイル（所有権のある空または破損したトランスクリプトを含む）が両方のコピーである場合にのみ、アーカイブが競合を修復します。アーカイブされたコピーを保持し、アクティブなコピーを削除し、そのIDを`archived`と`resolvedConflicts`の両方に報告します。このオプションは所有権チェックをバイパスしません。ローカル/外部混在やその他の曖昧な所有権は`errors`に報告され、どちらのコピーも移動されません。`errors`のエントリには`{ "sessionId": "<uuid>", "error": "message" }`が含まれます。

`requireIdle`は省略可能で、デフォルトは`false`です。クライアントは送信前に`session_archive_idle_guard`を事前チェックする必要があります。`requireIdle: true`を使用すると、アクティブワークの状態がactive、unknown、またはunsupportedであるライブオーナーは、そのセッションを`errors`に返します。デーモンはそれをクローズしたり、トランスクリプトを移動したりしません。チェックとクローズへの遷移は、所有ランタイムのコントロールプレーンの1ターン内で発生するため、その間に新しいワークが入り込むことはありません。ライブの子プロセスがすでに回収されている永続化セッションは、アーカイブの対象のままです。

アーカイブ専用セッションは、デーモンが保留中のサイドカークリーンアップを調整するためにライターまたはメンテナンスリースを取得した後、`alreadyArchived`に返されます。別のプロセスがまだライターリースを保持している場合、アーカイブ専用のIDはリースが利用可能になるまで`errors`に報告されます。

後続のクリーンアップ所有権チェックが失敗した場合でも、トランスクリプトの移動または競合修復はロールバックされません。その場合、アーカイブ状態はすでに変更されているにもかかわらず、IDが`errors`にのみ表示され、`archived`と`resolvedConflicts`から省略される可能性があります。エラーをアクティブコピーまたは競合が残っている証拠として扱う前に、同じワークスペースに対して同じライフサイクルリクエストを再試行してください。サービスが保存されたトランスクリプトのIDを確認し、必要なライターまたはメンテナンスリースを取得できる場合、再試行では、セッションリストから省略される空または破損したトランスクリプトに対しても権威ある`alreadyArchived`状態が報告され、保留中のサイドカークリーンアップが再開されます。保存されたIDを確認できないトランスクリプトは、再試行時に`errors`を引き続き報告し、手動での検査が必要になります。必要なリースを取得できない再試行は、リースが利用可能になるまで`errors`に残ります。

ライフサイクル競合はバッチアイテムの結果です: ワークスペースなしおよびワークスペース修飾付きルートは、`errors`内の競合とともにHTTP `200`を返します。これは以前のワークスペース修飾付きHTTP `409 session_conflict`エンベロープを置き換えます。そのルートを呼び出したクライアントはバッチ応答を検査する必要があります。内部ランタイムRESTバッチは、安全な競合メッセージを保持しつつ、他のセッションごとの失敗詳細のマスキングを継続します。

### `POST /sessions/unarchive`

アーカイブされたセッションをアクティブディレクトリに復元します。これ自体はセッションを再開しません。`chats/archive/<id>.jsonl`を`chats/<id>.jsonl`に戻すだけです。アーカイブ解除が成功した後、クライアントは`POST /session/:id/load`または`POST /session/:id/resume`を呼び出すことができます。

リクエスト:

```json
{ "sessionIds": ["<uuid>"], "resolveConflicts": true }
```

レスポンス:

```json
{
  "unarchived": ["<uuid>"],
  "alreadyActive": [],
  "resolvedConflicts": ["<uuid>"],
  "notFound": [],
  "errors": []
}
```

`resolveConflicts`は省略可能で、デフォルトは`false`です。デフォルトでは、同時に存在するアクティブおよびアーカイブされたJSONLファイルは`errors`に競合を生じさせ、どちらのコピーも移動、削除、上書きされません。アクティブ専用セッションは、デーモンが保留中のサイドカークリーンアップを調整するためにライターまたはメンテナンスリースを取得した後、`alreadyActive`に返されます。ライブセッションがまだライターリースを保持している場合、アクティブ専用のIDはそのセッションが閉じるまで`errors`に報告されます。`resolveConflicts: true`を使用すると、アーカイブ解除は、選択したワークスペースが管理できる通常のトランスクリプトファイル（所有権のある空または破損したトランスクリプトを含む）が両方のコピーである場合にのみ競合を修復します。アクティブコピーを保持し、アーカイブコピーを削除し、そのIDを`unarchived`と`resolvedConflicts`の両方に報告します。このオプションは所有権チェックをバイパスしません。ローカル/外部混在やその他の曖昧な所有権は`errors`に報告され、どちらのコピーも移動されません。同じIDに対するアーカイブまたはアーカイブ解除が進行中の場合、バッチ開始前に`409 session_archiving`が返されます。

後続のクリーンアップ所有権チェックが失敗した場合でも、トランスクリプトの移動または競合修復はロールバックされません。その場合、アーカイブ状態はすでに変更されているにもかかわらず、IDが`errors`にのみ表示され、`unarchived`と`resolvedConflicts`から省略される可能性があります。エラーをアーカイブコピーまたは競合が残っている証拠として扱う前に、同じワークスペースに対して同じライフサイクルリクエストを再試行してください。サービスが保存されたトランスクリプトのIDを確認し、必要なライターまたはメンテナンスリースを取得できる場合、再試行では、セッションリストから省略される空または破損したトランスクリプトに対しても権威ある`alreadyActive`状態が報告され、保留中のサイドカークリーンアップが再開されます。保存されたIDを確認できないトランスクリプトは、再試行時に`errors`を引き続き報告し、手動での検査が必要になります。アクティブセッションがまだリースを保持していることなどにより、必要なリースを取得できない再試行は、リースが利用可能になるまで`errors`に残ります。

ACP-over-HTTPはベンダーメソッド`_qwen/sessions/archive`および`_qwen/sessions/unarchive`を通じて同じリクエストおよびレスポンスボディを使用します。RESTルートテーブルは、ACPトランスポート用に`POST /sessions/archive`および`POST /sessions/unarchive`をこれらのメソッドにマッピングします。

### マルチワークスペース・ライブセッションルーティング

`multi_workspace_sessions`がアドバタイズされている場合、ライブセッション操作は`sessionId`からワークスペースを識別します。クライアントはURLにワークスペースセレクタを追加しません。既存のオーナー経由のライフサイクル操作に加えて、これは`PATCH /session/:id/metadata`、`POST /session/:id/recap`、`POST /session/:id/generate`、`POST /session/:id/btw`、`POST /session/:id/btw/stream`、`DELETE /session/:id/btw/stream/:requestId`、`POST /session/:id/mid-turn-message`、`GET /session/:id/mid-turn-messages`、`POST /session/:id/mid-turn-messages/send-now`、`DELETE /session/:id/mid-turn-messages/:messageId`、`POST /session/:id/tasks/:taskId/cancel`、`POST /session/:id/goal/clear`、`POST /session/:id/continue`、`POST /session/:id/language`、`POST /session/:id/artifacts`、`DELETE /session/:id/artifacts/:artifactId`、`GET /session/:id/sources`、`POST /session/:id/sources`、および`DELETE /session/:id/sources/:sourceId`にも適用されます。デーモンは各リクエストをライブセッションを所有する信頼できるランタイムにルーティングします。信頼できない非プライマリオーナーは`403 untrusted_workspace`を返し、ライブオーナーが存在しない場合は`404 session_not_found`を返し、オーナーが曖昧な場合は`500 ambiguous_session_owner`でフェイルクローズします。

このルールはライブセッションのみで有効であり、ワークスペースなしのすべてのセッションルートをマルチワークスペース対応にするわけではありません。永続化またはアーカイブされた操作は、ドキュメントに記載されているワークスペース修飾付きルートを使用します。`POST /session/:id/branch`、`POST /session/:id/fork`、および `POST /session/:id/cd` は意図的にプライマリ専用であり、非プライマリオーナーに対しては `non_primary_session_route_not_supported` を返します。

### ターン中のメッセージ

`POST /session/:id/mid-turn-message` は `{ "message": "...", "messageId": "<optional-message-id>" }` を受け入れます。正常な受理では `{ "accepted": true, "messageId": "<id>" }` が返され、所有権がデーモンに移行します。つまり、メッセージはアクティブなターンに排出されるか、セッションがアイドル状態になったときに通常のプロンプトFIFOに昇格されます。`session_mid_turn_message_query` を使用するクライアントは安定した `messageId` を送信します。これがキュー内、保留中、または有界の照合リングにある限り、再送しても冪等性が保たれます。デーモンが検証したリクエストに対する拒否は `{ "accepted": false }` を返し、所有権を移行しません。プロンプトFIFOに受理されたプロンプトがなく、アクティブなGoalターンもない開いているセッションは `{ "accepted": false, "reason": "session_idle" }` を報告するため、クライアントは失敗を表示する代わりに、そのメッセージを通常のプロジェクトとして再送信できます。真に新しい受理の場合、セッションが保持しなくなった添付ファイルや無効な参照を指す `content` ブロックは、アイドル判定とキュー判定の前に却下されます。リクエストには `410 session_attachment_gone`（または `400 invalid_session_attachment_reference`）で応答され、`{ "error", "code" }` ボディが含まれますが、セッションがアイドル状態であっても `reason` は含まれません。これより前の2つのゲートがこれを優先します。ペイロードがまだ一致する繰り返しの `messageId` は、その後添付ファイルが削除されていても、`{ "accepted": true, "messageId" }` で冪等に確定し、閉じようとしているか、クローズを承認しているセッションは理由のない `{ "accepted": false }` で拒否されます。判定結果は、ターン中のメッセージを排出できるもののみを記述しており、セッションが保持している可能性のあるすべてを記述しているわけではありません。たとえば、遅延リストアプロンプトが待機している間、セッションスナップショットはそのために `hasActivePrompt: true` を報告することがあります。理由のない拒否には別の原因があります。キューがいっぱいである、セッションが閉じようとしているかクローズを承認している、キュー内のインライン添付ファイル予算を使い果たした、または繰り返しの `messageId` がデーモンが保持しているペイロードと一致しなくなった場合です。デーモンはすでに受理したペイロードを置き換えずに保持しますが、それは配信保証ではありません。クライアントによって削除された昇格済みメッセージは、保留中プロンプトのスナップショットから即座に消えます。開始していなかったものはその場で破棄され、すでに実行中のものは中断されたターンが確定するまで隠されます。したがって、削除レスポンスはクライアントが観測する唯一の `removed = true` です。閉じつつあるセッションは、キューに残っているものを昇格させることは決してなく、クローズがまだ承認されている間にターンが確定すると、キューは受理ゲートに渡され、そこで拒否されるため、それらのメッセージは昇格されずに破棄され、どのリングにも入りません。子プロセスがその後クローズを拒否した場合、セッションはライブのまま残り、キューに残っていたものがリストされ続け、後日のターンが終了するまで昇格をスケジュールするものは何もありません。これらのメッセージはまだデーモンのものなので、デフォルトの回復方法は待機することです。次のターンの確定時にバックログが昇格され、何も失われず、二重配信も発生しません。待機できないクライアント（さらなるターンが来ず、ユーザーが排出されないキューを見ている場合）は、強制的に排出を行うことができますが、サポートされている唯一の方法は、再度送信する前に各ペイロードを解放することです。両方のパスは同じセットから始まります。このセットは、クライアント自身がそのウィンドウ中にエンキューしたものの記録から、確実な配信証拠があるものを差し引いて構築します。リスト表示の沈黙からは構築しません。クエリはデーモンが保持しているものの在庫表ではありません。すでに削除済みとしてマークされたプロンプトは省略され、両方のリングは有界であり、クライアントIDなしで送信されたエンキューはこのインターフェースではまったく追跡されないため、どこにも報告されていないIDは、配信後に期限切れになったか、未配信のまま破棄されたか、一度もリストされなかった可能性があります。確実な配信証拠とは、`mid_turn_message_injected` エコー、そのIDに対する `pending_prompt_started`、またはどちらかのリングへのメンバーシップです。

ターン中の POST には、オプションの `eventDetailMode` も受け付けられます。値は `full`（デフォルト）または `summary` で、不正な値の場合は `400 invalid_event_detail_mode` が返されます。デーモンはこのモードをメッセージとともに保持し、未処理のメッセージが新しいプロンプトになった場合に使用します。既存のターンにドレインしても、そのターンのモードは変更されません。キューに入っている間や昇格済みで保留中の間は、同じ `messageId` での再試行ではテキスト、メディア、および有効なモード（省略時は full とみなす）が一致する必要があります。Web Shell は現在の Provider モードを送信します。REST ルートではアイドル時の新しいアドミッションを `reason: "session_idle"` で拒否し続けます。呼び出し側はその後、通常のプロンプトを送信します。

排出を強制するには、クエリがまだキュー内として報告しているそのセット内のすべてのIDについて `DELETE /session/:id/mid-turn-messages/:messageId` を実行し、その後にのみ、新しい `messageId` の下でテキストを再投稿します。繰り返しのIDは冪等にACKされ、何も再武装しないためです。順序が重要であり、一度に1つのIDではなくセット全体に適用されます。デーモンが所有するまだキュー内のペイロードは、次の確定時に昇格されるため、ペイロードが解放されなかったIDを再投稿すると、そのメッセージが二重に配信されます。一度はその昇格から、もう一度は再送信からです。`session_mid_turn_message_mutation` が広告されていない場合、ペイロードを解放する方法がないため、待機することが唯一の安全な選択肢です。DELETE判定自体が配信を確立することはありません。`{ "removed": false }` は、すでに注入済みまたは完了済みのID（配信済みであるため再投稿してはならない）と、以下のDELETEルートに従ったさらに2つのケースをカバーします。1つは、排出がまだ保持しているIDであり、これも再投稿してはなりません。後日のクエリでは `settledMessageIds` にリストされますが、これは最終的なものではありません。排出が失敗した場合、IDはリングから離れ、イベントなしでキューに戻ります。タイムアウトした排出のメッセージが失われるタイミングについては、以下の「今すぐ送信」セクションを参照してください。もう1つは見つからないIDであり、クエリが直前にキュー内としてリストしていたIDの場合は、2回の呼び出しの間でキューから離脱し、上記のクローズ承認パスによって未配信のまま破棄された可能性があることを意味します。そのケースはクライアント自身の証拠に基づいて判断してください。`{ "removed": true }` はペイロードを解放しますが、そのウィンドウ内で確定により昇格されたIDの場合、ディスパッチ前にFIFOから切り離されたエントリ（再投稿可能）と、すでに開始されていた昇格済みプロンプトの中止（再投稿すると二重送信される）の両方をカバーします。昇格されたIDは、リスト表示がキュー内として報告しなくなっても、確定するまで同じルートを通じて削除可能なままです。再投稿自体はターン中の受理であり、`{ "accepted": false, "reason": "session_idle" }` で拒否される可能性があります。これは失敗ではなく、セッションが通常のプロジェクトを受け入れるようになったという上記のシグナルです。通常のルート経由で送信するとターンが開始され、その確定時にまだキューにあるものが昇格されます。これが、セット内のすべてのIDを最初に解放する必要がある理由でもあります。

したがって、`reason` の欠落はセッションがビジーである証拠ではありません。`reason` より前のバージョンのデーモンでは常にこれが省略されるため、クライアント側でも独自のアイドル検出を維持する必要があります。古いデーモンに接続した新しいクライアントは、この機能の欠落を検出し、従来のローカルフォールバックを引き続き使用します。

`GET /session/:id/mid-turn-messages` は、セッション全体のデーモン所有キューに加え、上限のある `settledMessageIds` および `promotedMessageIds` リングを返します。確定済み ID は注入されたか明示的に削除され、昇格済み ID は通常のプロンプト FIFO に入りました。いずれかのリングにある ID は再送信してはなりません。

キュー内のメッセージがアクティブなターンに排出されると、デーモンは整合性の取れた `messages` および `messageIds` 配列（および既知の場合は実行中ターンの `promptId`）を含む `mid_turn_message_injected` を公開します。これは一時的な重複排除シグナルであり、トランスクリプト項目ではありません：クライアントはこれらのメッセージ ID で登録された完了コールバックを確定し、対応するローカルの保留行を破棄します。古いデーモンではペイロードにさらに `originatorClientId` が含まれます。エコーの取り逃しは、上記のクエリを通じて確定済みリングから復元されます。

エージェントはツールバッチが完了するたびにキューを排出するため、モデル応答のストリーミング中に受け入れられたメッセージは、その応答とツールバッチの完了を待ちます。`session_mid_turn_send_now` がアドバタイズされている場合、接続中のセッションクライアントは `POST /session/:id/mid-turn-messages/send-now` を呼び出して、キュー内のメッセージを直ちに配信させることができます。前景ターン（ゴール継続を含む）がモデル応答をストリーミングしている場合、エージェントはキューを即座に排出し、その応答を中断し、すでにストリーミングされた部分を会話に保持したまま、同じターンをそれらのメッセージで続けます。プロバイダーによってアナウンスされたツール呼び出しを開始した応答（引数がまだストリーミング中のものも含む）は中断されず、実行中のツールも決して中断されません：メッセージはキューに残り、ツール結果とともに配信されるか、ツールがターンを終了する際に次のプロンプトへ昇格されます。一部のプロバイダーは引数が完了してから初めてツール呼び出しをアナウンスする場合があり、そのような呼び出しはまだ中断され得ます。いくつかのケースでは、メッセージはすでにキューを出ていますが、そのターンでは回答を得られません。send-now ドレインが既に送信されている状態でプロバイダーがツール呼び出しをアナウンスしそれがターンを終了する場合や、ターンが停止される場合、メッセージは会話とトランスクリプトには保持されますが、昇格はされません。send-now ドレイン自体がタイムアウトした場合（エージェントは 2 秒待機し、デーモンは依然として添付ファイルを読み込んでいる可能性があります）、その後デーモンが引き渡すメッセージは、ツール呼び出しなしでまだストリーミング中の場合は応答を中断し、そうでなければ後続のドレインで配信されます（おそらく後のターンで）。他のタイムアウトしたドレインと同様に、デーモンがタイムアウト後 30 秒以上経過してから応答した場合、またはその後のドレインが添付ファイルを解決している間にターンが停止した場合は、メッセージは失われます。すべての場合において、それらの ID は他の排出されたメッセージと同様に確定されます：再送信すると、再度キューに入れられることなく確認応答され、会話に保持されたメッセージへの回答を望むクライアントは新しいプロンプトを送信します。キュー専用の内部ステアリングは決して中断を引き起こさず、send-now ドレインにも拾われません；モデルへの次のリクエストとともに送信されるか、ターンが先に終了した場合に呼び出し元が駆動する確定パスを通じて送信されます。チャネル、cron、およびバックグラウンドターンはツール境界での配信を維持します。ユーザーメッセージが待機しており、エージェントにそれらを配信するよう依頼された場合の応答は `{ "requested": true }` であり、待機しているものがなかった場合（すでに配信済み、削除済み、または昇格済み）は `{ "requested": false }` です。このリクエストより前のバージョンのエージェントは `-32601` で応答し、ツール境界での配信を維持します。

`session_mid_turn_message_mutation` がアドバタイズされている場合、接続中のセッションクライアントは `DELETE /session/:id/mid-turn-messages/:messageId` を呼び出すことができます。これはミッドターンキューまたは昇格された保留プロンプト状態からメッセージを削除します。すでに実行中の昇格済みメッセージを削除すると、そのターンが中止され、通常の保留プロンプト削除と同じ動作になります。デーモン所有キューへの追加および削除は、既存の `pending_prompt_added` および `pending_prompt_completed` セッションイベントを公開するため、接続中のクライアントは両方の権威あるキューのスナップショットを更新します。`{ "removed": false }` は、メッセージがすでに注入済み、完了済み、または見つからなかったことを意味します。ドレインによって取得されたが、まだエージェントに引き渡されていないメッセージも `{ "removed": false }` と応答します。そのドレインが失敗した場合、メッセージはキューイベントなしでキューに戻され、その ID は確定済みリングから外れます。後続のドレインまたはターンの確定によって再び取得されますが、ドレインがターンの確定後に失敗した場合、メッセージは次のターンまでキューに残ります。

### `GET /session/:id/pending-prompts`

現在実行中のプロンプトと、ライブセッションの FIFO で待機しているプロンプトを返します。リクエストには `X-Qwen-Client-Id` を含めることができます。含まれる場合は、接続されているクライアントを識別する必要があります。

```json
{
  "pendingPrompts": [
    {
      "promptId": "<prompt-id>",
      "text": "Explain the failure",
      "queuedAt": 1700000000123,
      "state": "running",
      "originatorClientId": "<client-id>"
    }
  ]
}
```

`state` は、ディスパッチ中のプロンプトに対しては `running`、待機中のプロンプトに対しては `queued` です。構造化コンテンツ（画像など）を含むプロンプトの場合、`content` が表示されます。これはライブセッションオーナーのルートです。`404` はライブオーナーが存在しないことを意味し、`503` はオーナーが一時的に利用できないことを意味します。信頼されていないプライマリ以外のオーナーの場合は `403 untrusted_workspace` を返し、複数のワークスペースでアクティブな ID の場合は `500 ambiguous_session_owner` を返します。専用の機能タグはありません。古いバージョンのデーモンは `404` を返します。TypeScript SDK メソッドは `getPendingPrompts()` です。

### `POST /session/:id/prompt`

`eventDetailMode` は `full`（デフォルト）または `summary` を受け付けます。不正な値の場合は `400 invalid_event_detail_mode` が返されます。Summary フィルターは、リング保持および SSE 配信の前にネストされたサブエージェントの詳細を除外し、Agent プロンプト、埋め込みツール、進行中のトークンカウンターを削除しますが、ルートコンテンツとメインモデルの使用量は保持します。確定した Agent 結果は、ターンメトリクス用に `tokenCount` および `executionSummary` の合計トークン数（失敗/キャンセルを含む）を保持しますが、ネストされた使用量フレームは引き続きフィルターされます。このルールは summary ロード/トランスクリプトレスポンスにも適用されます。モードはアドミッション時にキャプチャされ、ディスパッチ時のみ適用され、確定時に full にリセットされます。遅延サブエージェントイベントは公開時のモードを使用します。アイドル中は full、後続のプロンプトが実行中の場合はアクティブなプロンプトのモードです。サブエージェントを最初に起動したプロンプトのモードは継承しません。これはセッションのすべての購読者に適用され、フィルターされた詳細は後からリングから取得することはできません。デーモンの `/acp` `session/prompt` は、同じスコープで同じオプションのトップレベル拡張を受け付けます（不正な値は JSON-RPC `-32602`）。これは標準的な ACP フィールドではなく、子プロセスには転送されません。

プロンプトをエージェントに転送します。複数プロンプトの呼び出し元はセッションごとに FIFO キューで待機します（ACP はセッションごとにアクティブなプロンプトを 1 つだけ保証します）。

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

`delivery` はオプションであり、`channel_delivery` 機能が必要です。プロンプトがアドミッションされると、デーモンは依然として `202 {promptId,lastEventId}` を返します。`end_turn` が成功した後、セッションは表示される最終テキストを、正確なワークスペースで既に実行中の Channel Worker に送信します。ペイロードは、最後のツールなしのアシスタント応答ブロックのみです。ツール呼び出しの前置き、ツール間のナレーション、置き換えられた再試行、および以前の自動継続ブロックは除外されます。空または空白のみの最終結果でも、認証が消費された後に相関のある `channel_delivery_result` と `status: "skipped"` が生成されますが、ワーカーには連絡しません。配信の成否は、同じ再生可能なイベントを通じて後で到着し、`turn_complete` を `turn_error` に変更することはありません。キャンセル、Agent の失敗、トークン制限による終了は、配信結果を送信または公開しません。

検証: `prompt` は空でないオブジェクトの配列でなければなりません。その他の失敗はブリッジに到達する前に `400` を返します。

`idempotencyKey` は、最大 200 文字のオプションの非空文字列です（不正な値の場合は `400 invalid_idempotency_key` が返されます）。これは HTTP リクエストではなく、呼び出し側の EVENT を識別します。最初のアドミッションはセッションごとにキーを記憶し、同じキーでの重複 POST は元のアドミッションを返します。つまり、`202 { promptId, lastEventId, eventEpoch, deduplicated: true }` とともに最初のプロンプトの `promptId` と新しいカーソル/エポックを返し、2 番目のターンをエンキューしません。これにより、`202` の後に受入を永続的にマークするリレー（または応答を失う場合）は安全に再試行できます。重複排除はデーモンの寿命内でのベストエフォートです。リングはメモリ内でバウンドされています（セッションあたり 128 キー、1024 セッション、両レベルで FIFO エビクション）。どちらの上限も、そのイベントのキューエントリが生きている間にキーをエビクトする可能性があります。通常のケース（1 つの長寿命セッションが 128 以上の異なるイベントをアドミッションする場合）ではセッションごとの上限が、1024 以上のセッションがキーを保持している場合はセッション上限が該当します。このようなエビクション後の再試行は再注入されます。リングは保護対象であるメモリ内のプロンプトキューとともに消滅するため、デーモンの再起動では両方が失われ、再注入が正しい回復手段となります。キーはセッションごとにスコープされており、このフィールドはアドミッションメタデータであり、エージェントには決して転送されません。

チャネルリレーは、ルートが転送前に削除する3つの`_meta`キーを利用します。具体的には、`qwen.channel.prompt`（チャネルターン分類）、`qwen.daemon.channelBoundRelay: true`（ワークスペース間バインド配信意図）、および`qwen.daemon.channelPromptAuthorization`（チャネルワーカー認証トークン。参照ワーカーは資格情報を保持している場合のみ送信します）です。`qwen.channel.prompt`は登録済みのチャネルワーカー認証トークンを必要とします。これはターゲットワークスペースのワークスペースごとの登録情報、またはCROSSワークスペースのバインド配信の場合、任意の登録済みワーカートークンに明示的な`qwen.daemon.channelBoundRelay: true`マーカーとプライマリ/信頼できるターゲットを伴うものです。資格情報なしで2つのマーカーのみを送信するリレーはチャネル分類を受けません。通常のインタラクティブプロンプトとして受理されます（ループ検出による拒否、リレーされたテキストに対するライブPRバインディングバックフィル）。外部ワーカートークンを伴うプレーンなプロンプトも同様に、チャネル分類と呼び出し元提供の表示プロジェクションを受けません。

レスポンス:

```json
{ "promptId": "session-id########1", "lastEventId": 42 }
```

`202`レスポンスは受理を認識しますが、Agentの完了ではありません。`lastEventId`後にセッションSSEストリームを観察し、`promptId`によって`turn_complete`または`turn_error`を相関させてください。予約済みスタンドアロン作業ディレクトリガードを含むすべての到達可能なキュー投入前受理チェックは同期的にスローするため、ルートは受理の前に非202エラーを応答します。ガードはセッションのマネージド会話バインディングがまだ解放されていない間に`409 working_directory_missing`（`retryable: true`、`Retry-After: 5`）に応答し、チャネルリレーはファントム受理を消費する代わりにイベントを延期します。ブリッジが受理前に延期を拒否した場合でも、ルートはリクエストの`idempotencyKey`を破棄し、後続のリトライがファントム受理への重複排除ではなく新規に受理されるようにします。これは、現在の配信がすでに呼び出し元によって消費されているケースに対する多層防御です。

`turn_complete.data.stopReason`はエージェントが返したACP `StopReason`を伝えます。具体的には`end_turn`、`max_tokens`、`max_turn_requests`、`refusal`、または`cancelled`です。デーモンは、エージェントが実行せずに中断されたプロンプトに対して`cancelled`を発行することもできます。これには、キュー投入プロンプトの削除、呼び出し元の切断、またはドレイン/ティアダウンが含まれますが、この値はエージェントがプロンプトを実行したことを証明しません。**フィールドを開いた文字列として扱ってください**。ワイヤー上では`string`として型付けされており、ACPセットは拡張可能であり、これに対して網羅的にスイッチするクライアントは次の追加で破綻します。

デーモン側の2つの結果はこのフィールドには**届きません**。デーモン内部で失敗したターン（期限切れ、ティアダウンフラッシュ、子プロセスクラッシュ）は、`turn_complete` stopReasonとしてではなく、`turn_error`イベントとして公開されます。その`data`には常に`message`が含まれます。`code`は、デーモンが失敗を分類した場合（期限切れ → `prompt_deadline_exceeded`、ティアダウンフラッシュ → `channel_closed`、`session_closed`、`session_killed`、または`daemon_shutdown`）にのみ存在し、ACP子がリクエスト中に死んだために拒否されたプロンプトのフレームには`code`も`errorKind`も含まれません。両方をオプションとして扱い、`message`に基づいて分岐してください。

再起動後に永続化履歴から復旧したターンは、ストリーム上で再公開されません。代わりに`promptTerminals[]`内の`POST /session/:id/load`レスポンスボディに表示されます。永続化テールがターンの完了を示している場合は`{ terminal: "completed", stopReason: "reconstructed_from_transcript" }`として、デーモンがターン途中で死んだ場合は**`stopReason`なし**で`{ terminal: "interrupted", code: "daemon_lost" }`として表示されます。`promptId`によってエントリを一致させ、`terminal`に基づいて分岐してください。台帳にセッションのエビデンスがない場合、`promptTerminals`はレスポンスから完全に省略されます。

HTTP クライアントがプロンプト中に切断した場合、デーモンはエージェントへ ACP `cancel` 通知を送信し、エージェントは `stopReason: "cancelled"` でプロンプトを終了させる。

`prompt_absolute_deadline`が広告されている場合、`deadlineMs`は設定されたサーバー期限を短縮することがあります。期限切れは`code: "prompt_deadline_exceeded"`を伴う相関付き`turn_error`を発行します。期限はエージェントを殺さずに呼び出し元を解放します。エージェントがその後解決する場合、その`promptId`に対するターンステータスポーリングは、期限エラーの代わりに解決されたトランスクリプト結果を返します。

### `POST /session/:id/cancel`

セッション上の **現在アクティブな** プロンプトを取り消す。ACP 側ではこれはリクエストではなく通知であり、エージェントはアクティブな `prompt()` を `cancelled` で解決することで応答する。

```bash
curl -X POST http://127.0.0.1:4170/session/$SID/cancel
# → 204 No Content
```

> **マルチプロンプト契約:** 取り消しはアクティブなプロンプトにのみ影響する。同じクライアントが以前に POST し、アクティブなものに続いてキューに入っているプロンプトは実行を継続する。マルチプロンプトのキューイングはデーモンによって導入された動作 (ACP 仕様にはない) であり、キューに入ったプロンプトの契約は「それぞれを取り消すか、チャネル終了でセッションを殺さない限り、実行を続ける」というもの。

マルチクライアント展開でキュー投入プロンプトが予期しない場合は、まず呼び出し元がデフォルトの`sessionScope: "single"`セッションを共有しているかどうかを確認してください。独立したスレッドごとの会話の場合は、`sessionScope: "thread"`を使用してセッションを作成し、プロンプトがそのスレッド内でのみシリアライズされるようにしてください。

### `DELETE /session/:id`

ライブセッションを明示的に閉じる。他のクライアントが接続していても強制的に閉じる — アクティブなプロンプトを取り消し、保留中の権限を取り消しとして解決し、`session_closed` イベントを発行し、EventBus を閉じ、デーモンのマップからセッションを削除する。ディスク上に永続化されたセッションは削除されない — `POST /session/:id/load` 経由で再ロードできる。プリフライト `caps.features.session_close`。

```bash
curl -X DELETE http://127.0.0.1:4170/session/$SID
# → 204 No Content
```

冪等性: 不明なセッションに対しては `404` を返す。エラーエンベロープは `code: "session_not_found"` を使用し; 並行クローズは `code: "session_closing"` を返す可能性があり、クライアントはこのルートに対して同じ正常な終端状態として扱うことができる。

> **`session_closed` イベント。** SSE サブスクライバーは、ストリーム終了前に `{ sessionId, reason: 'client_close', closedBy?: '<clientId>' }` を伴う終端の `session_closed` イベントを受信する。SDK リデューサーはこれを `session_died` と同一に扱う (`alive: false` を設定し、`pendingPermissions` をクリアする)。

### `PATCH /session/:id/metadata`

可変セッションメタデータを更新します。プリフライト`caps.features.session_metadata`。グループ化とピン留めは意図的にこのルートの一部ではありません。`session_organization`の下で`PATCH /session/:id/organization`を使用してください。

リクエスト:

```json
{
  "displayName": "My Investigation Session",
  "pr": {
    "number": 123,
    "url": "https://github.com/QwenLM/qwen-code/pull/123",
    "state": "open"
  }
}
```

| フィールド | 必須 | 備考 |
| ------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `displayName` | いいえ | 文字列。256 UTF-16 コードユニットを超える値は切り詰められ、カットはサロゲートペアを考慮しないため、非 BMP 文字で終わる名前は孤立したサロゲート半分を失う可能性がある。空または空白のみの値は `400 invalid_metadata` で拒否される; 名前を変更しない場合はフィールドを省略する。 |
| `pr` | いいえ | 1 つのプルリクエストをバインドする。正の整数 `number`、制御文字を含まず最大 2,048 文字の HTTP(S) `url`、およびオプションの `state`: `open`、`merged`、または `closed` が必要。 |

レスポンス:

```json
{
  "sessionId": "<uuid>",
  "displayName": "My Investigation Session",
  "prs": [
    {
      "number": 123,
      "url": "https://github.com/QwenLM/qwen-code/pull/123",
      "state": "open"
    }
  ]
}
```

`prs`は有効なバインド履歴であり、更新されたイシューリンクが含まれる場合があります。変更されたフィールドグループのみを運ぶ`session_metadata_updated`イベントをセッションのSSEストリーム上に公開します。名前変更は`displayName`（名前が設定されている場合は`titleSource`を追加）を発行し、`prs`を欠落させます。一方、PRバインディングの変更は`prs`を発行し、設定されている場合は現在の`displayName`をエコーします。イベントから欠落しているフィールドはクリアされたものではなく変更されていないものとして扱い、完全なメタデータが必要な場合は`200`ボディまたはセッションリストを再読み込みしてください。

### `PATCH /session/:id/organization` and `PATCH /workspaces/:workspace/session/:id/organization`

既存の変更ゲートを通じてローカルセッション整理状態を更新する。プリフライト `caps.features.includes('session_organization')`; 複数形ルートは追加で `workspace_qualified_rest_core` を必要とする。複数形ルートでは、`:workspace` は最初に登録済みワークスペース ID として厳密一致で解決され、次に URL エンコードされた正規絶対 cwd として解決される。選択されたランタイムは信頼されていなければならない。セッションの存在および null でない `groupId` の検証は、そのランタイムのアクティブな永続化、アーカイブ済み永続化、およびライブセッション状態とグループストアにスコープされており、プライマリまたは別のワークスペースへのフォールバックはない。レガシールートはプライマリワークスペース専用として残る。

リクエスト:

```json
{ "isPinned": true, "groupId": "018f..." }
```

| フィールド | 必須 | 備考 |
| ---------- | -------- | ---------------------------------------------------------------------------------------------------- |
| `isPinned` | いいえ | ブール値。`true` は、まだピン留めされていない場合に `pinnedAt` を設定する; `false` は `pinnedAt` をクリアする。 |
| `groupId` | いいえ | カスタムグループ ID または未グループ化の場合は `null`。不明なグループ ID は `404 { code: "group_not_found" }` を返す。 |
| `color` | いいえ | サポートされているセッションカラートークン、またはセッションカラーをクリアするための `null`。 |

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

この状態は、デーモンランタイムストレージディレクトリ内のプロジェクトレベルのセッション組織サイドカーに保存されます。トランスクリプトの内容ではなく、トランスクリプト `mtime` を更新せず、トランスクリプトとともにエクスポートされず、アーカイブ/アーカイブ解除をまたいで保持されます。

### `POST /session/:id/heartbeat`

このセッションに対するデーモンの最終確認記録を更新します。長寿命のアダプター（TUI/IDE/Web）は一定間隔でこれを ping するため、将来の取り消しポリシー（Wave 5 PR 24）では、停止したクライアントと静かなクライアントを区別できます。

ヘッダー:

| ヘッダー | 必須 | 備考 |
| ------------------ | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `X-Qwen-Client-Id` | いいえ | デーモンが発行した ID を `POST /session` からエコーします。識別されたクライアントはクライアントごとのタイムスタンプも更新します。匿名のハートビートはセッションごとのウォーターマークのみを更新します。他の場所と同じ `[A-Za-z0-9._:-]{1,128}` の形式を満たす必要があります。 |

リクエストボディは空です（`{}` で問題ありません — 今日現在、フィールドは読み取られません）。

レスポンス:

```json
{
  "sessionId": "<sid>",
  "clientId": "<cid>",
  "lastSeenAt": 1700000000123
}
```

`clientId` は、信頼できる `X-Qwen-Client-Id` が提供された場合のみエコーされます。`lastSeenAt` はブリッジが保存したデーモン側の `Date.now()` エポック（ms）です。

エラー:

- `400` — `{ code: 'invalid_client_id' }` ヘッダーが不正な場合（ヘッダー形式ルール）または、このセッションに登録されていない `clientId` が含まれている場合（ブリッジはタイムスタンプを更新する前に `InvalidClientIdError` をスローします）。
- `404` — 不明なセッション。

機能ゲート: プレフライト `caps.features.client_heartbeat`。古いバージョンのデーモンはこのパスに対して `404` を返します。

### `POST /session/:id/model`

セッション内で現在バインドされているモデルサービス **内** でアクティブなモデルを切り替えます。セッションごとのモデル変更キューを通じてシリアライズされます。

（サービス自体を切り替える場合 — Alibaba ModelStudio vs OpenRouter など — 新しいセッションで `POST /session` に `modelServiceId` を渡してください。ステージ 1 ではライブのサービス切り替えルートはありません。）

リクエスト:

```json
{ "modelId": "qwen-staging" }
```

レスポンス：ACPエージェントのモデル切替結果をそのまま転送します。デーモンは形状を変更しないため、トップレベルには`modelId`が含まれません。切替の詳細は`_meta.qwenModelSwitch`から読み取ってください。

成功すると、SSE ストリームに `model_switched` を公開します。失敗すると、`model_switch_failed` を公開します（受け身サブスクライバーは呼び出し元だけでなく失敗も確認できます）。エージェントチャネル終了と競合するため、フリーズした子プロセスが HTTP ハンドラーをブロックすることはありません。正常な切り替えでは、ベストエフォートベースでセッション JSONL にセッションモデルも記録されます。記録が書き込まれると、デーモンのロード/再開時に認証の前にこのセッションのモデルの復元を試みます。記録されたモデルを適用できない場合（モデル削除、資格情報の利用不可など）、復元では存在する場合同一 ID のレジストリルートを使用します — ランタイムスナップショットレコードの場合、記録されたバインディングとは異なるエンドポイントになる可能性があります — ルートが解決されない場合にのみ `settings.model.name` デフォルトで続行します。**新しい** セッションのデフォルトとして `settings.model.name` も更新されます。

### `GET /session/:id/message-groups`

機能タグ: `session_message_deletion`。ブリッジ → ACP extMethod `qwen/status/session/message_groups`。これはライブセッションオーナーの読み取りです: セッションの所有ランタイムを解決し、プライマリワークスペースへのフォールバックは行いません。デーモン全体の機能はすべてのセッションでのサポートを意味しません。SSH ワークスペースと Managed 権威ストレージは削除を拒否します。

アクティブ履歴順で安全に属性付け可能なプロンプト/返信またはコマンド表示グループを一覧表示します。通常のレガシーレコーダーに対してライターリースを取得しません。読み取りは以前の履歴変更に待機します。返されるスナップショットはセッションの変化により陳腐化する可能性があります。削除自体はアイドルセッションが必要です。

レスポンス (200):

```json
{
  "snapshot": "<opaque selection token>",
  "groups": [
    {
      "id": "<group-id>",
      "promptId": "<prompt-id>",
      "recordIds": ["<user-record-id>", "<reply-record-id>"]
    }
  ]
}
```

`promptId` と `promptIds` はオプションのプロンプトアイデンティティです。`recordIds` はグループの保存されたレコードを識別します。空の履歴は `groups: []` を返します。グループ ID とスナップショットは不透明なものとして扱ってください。削除時には返されたスナップショットを変更せずに渡してください。

エラーには、不明なセッションに対する `404`、SSH ワークスペースに対する `400 unsupported_operation`、およびサポートされていないストレージまたは録画不可に対する `422 session_message_deletion_unsupported` が含まれます。既存のライター整合性エラーにより `409 session_writer_conflict`、`409 session_writer_lost`、`409 session_transcript_changed`、または `503 session_writer_unavailable` が返される場合もあります。

### `POST /session/:id/messages/delete`

機能タグ: `session_message_deletion`。ブリッジ → ACP extMethod `qwen/control/session/messages_delete`。厳格な変換ゲート。ライブセッションオーナーのスコープであり、プライマリワークスペースへのフォールバックはありません。イベント属性付けのためにオプションの `X-Qwen-Client-Id` を受け入れます。

リクエスト:

```json
{ "snapshot": "<token from message-groups>", "groupIds": ["<group-id>"] }
```

両方のフィールドが必須です。`snapshot` は空であってはなりません。`groupIds` は重複のない非空文字列を含める必要があります。選択されたグループはそのスナップショット内にまだ存在する必要があります。サーバーはモデルターン背後に削除をキューイングする代わりにビジーセッションを拒否します。

レスポンス (200):

```json
{
  "deletedGroupIds": ["<group-id>"],
  "deletedPromptIds": ["<daemon-prompt-id>"]
}
```

選択された元のレコードとその所有する生圧縮コンテキストは JSONL から物理的に削除されます。既存の要約テキスト、コマンド効果、およびプロジェクトファイルは保持されます。すべてのグループを削除しても、セッションは後のプロンプトのために利用可能です。

エラー:

- `400 invalid_message_groups` — 不正、不明、または重複したグループ選択。
- `400 invalid_client_id` — 不正な属性ヘッダー。
- `404` — 不明なセッション。
- `409 session_busy` — プロンプトまたは履歴変換がアクティブです。完了後に再試行してください。
- `409 worktree_reset_active` — このセッションはワークツリーリセットによって置き換えられています。代替セッションに再接続してください。
- `409 message_groups_conflict` — 選択スナップショットが古くなっています。グループを再取得し、再試行前に新しい選択を要求してください。
- `409 message_history_invalid` — 履歴を安全に属性付けできません。選択トークンを変更するだけでは修復できません。
- `400 unsupported_operation` / `422 session_message_deletion_unsupported` — セッション/ワークスペースストレージはこの操作をサポートしていません。リフレッシュしてリクエストを繰り返しても有効になりません。
- `409 session_writer_conflict`、`409 session_writer_lost`、`409 session_transcript_changed`、または `503 session_writer_unavailable` — 排他的トランスクリプト所有権を確立または維持できませんでした。
- `503 message_deletion_context_unavailable` — 削除は **永続化されました** が、ライブコンテキストをインストールできませんでした。JSON ボディには `persisted: true`、`deletedGroupIds`、および `deletedPromptIds` が含まれます。権威ある履歴から UI を調整し、別のプロンプトを送信する前にセッションを開き直してください。何も削除されなかったかのように削除を再試行しないでください。コンテキスト回復が成功するまで後のプロンプトは拒否され続けます。

コンテキスト復元が保留中の場合、後続の履歴依存ミューテーションおよびモデルリクエストは 503 `session_history_context_unavailable` を返します。`persisted` または削除アイデンティティはありません。セッションの読み込みまたは再開では、権威ある JSONL コンテキストのインストールを再試行します。インストールが成功した場合のみ、モデルアドミッションが再開されます。ライフサイクルクローズは引き続き利用可能です。

永続化後、セッションは **イベントエンベロープ** 上でデータ `{sessionId, deletedGroupIds, deletedPromptIds}` とオプションの `originatorClientId` を伴う `session_messages_deleted` を公開します。内部 API 履歴アイデンティティはこのワイヤー上では公開されません。このイベントは永続化された 503 パスでも発生します。ピアはキャッシュされたトランスクリプト、ナビゲーション、検索、選択状態を無効化し、権威ある履歴を再読み込みする必要があります。発信者は成功した HTTP レスポンスと `persisted: true` エラーの両方を照合する必要があり、自身の SSE エコーの処理に依存してはいけません。

### `POST /session/:id/recap`

機能タグ: `session_recap`。ブリッジ → ACP extMethod `qwen/control/session/recap`。

セッションの「どこまで進んだか」を一文で要約します。コアの `generateSessionRecap` (`packages/core/src/services/sessionRecap.ts`) をラップしており、ツールを無効化した高速モデルに対してサイドクエリを実行し、`maxOutputTokens: 300` と厳格な `<recap>...</recap>` 出力形式を使用します。このサイドクエリはセッションの既存の GeminiClient チャット履歴を読み取りますが、**追加しません**。

リクエストボディは無視されます（`{}` または空を送信してください）。非厳密なミューテーションゲート — ポスチャーは `/session/:id/prompt` を反映しています（呼び出しはトークンを消費しますが、状態を変更しません）。SSE イベントは公開されません。

レスポンス (200):

```json
{
  "sessionId": "sess:42",
  "recap": "Debugging the auth retry race. Next: add deterministic timing to the integration test."
}
```

`recap` は以下の場合に `null` （エラーではなく通常の 200）です:

- セッションにまだ対話ターンが2回未満である場合、
- サイドクエリが抽出可能な `<recap>...</recap>` ペイロードを返さなかった場合、
- または基盤となるモデルエラーが発生した場合（コアヘルパーはベストエフォートであり、例外をスローしません）。

エラー:

- `400 {code: 'invalid_client_id'}` — `X-Qwen-Client-Id` ヘッダーの形式が不正です。
- `404` — セッションが不明です。

キャンセル: **v1 ではなし**。ルートは HTTP クライアントの切断を監視せず、`AbortSignal` はブリッジに配線されず、ACP 子プロセスは呼び出し元が切断したかどうかに関係なくサイドクエリを完了まで実行します。上限はブリッジの 60 秒バックストップタイムアウト（`SESSION_RECAP_TIMEOUT_MS`）と ACP チャネル死に対するトランポートクローズ競合のみです。これは recap が短い（単一試行、`maxOutputTokens: 300`、典型的には約 1〜5 秒）ため許容されます。将来のリリースで帯域幅コストが正当化する場合は、リクエスト ID ベースのキャンセル ext-method で完全なエンドツーエンドキャンセルを配線できます。

### `POST /session/:id/generate`

機能タグ: `session_generation`。

呼び出し元提供のプロンプトからリクエストスコープのテキスト生成を実行します。リクエストは会話履歴を読み取りまたは変更せず、ツールを公開しません。設定された高速モデルを優先し、高速モデルが存在しないか解決できない場合はセッションの主モデルにフォールバックします。エンドポイントはタスク非依存です。翻訳は単なる呼び出し元定義プロンプトの一例に過ぎません。

リクエスト:

```json
{ "prompt": "Translate into Chinese: Hello" }
```

レスポンスは `text/event-stream` です。サーバーは最初に SSE コメントを即座に書き込み、続いて `started`、任意の `thinking` 進捗イベント、ゼロ以上の `delta` イベント、そして `done` を送信します。`thinking` イベントには推論コンテンツが含まれません。ストリーミング開始後のモデル障害は `error` イベントを生成し、別のモデルで再試行することはありません。プロンプトは UTF-8 テキストで 32 KiB に制限されています。HTTP クライアントの切断は生成リクエストをキャンセルします。

### `POST /session/:id/btw/stream`

機能タグ: `session_btw_stream`。スコープ: ライブセッションオーナー。

ライブセッションの会話コンテキストを使用して、そのトランスクリプトへの追加やメインタスクの中断なしに、ツールを使用しないサイド質問を行います。既存の JSON `POST /session/:id/btw` API は元の動作のまま利用可能です。

リクエスト:

```json
{ "question": "Why?", "requestId": "unique-request-id", "resume": false }
```

`question` は空でないトリム済み文字列であり、トリム前に 4096 文字に制限されます。`requestId` には 1〜64 の ASCII 文字、数字、アンダースコアまたはハイフンが含まれます。`resume` は任意であり、デフォルトは `false` です。`X-Qwen-Client-Id` が指定されている場合、ライブセッションに登録されたクライアントを名指す必要があります。すべての開始と再開は、解決されたオーナーランタイムとその信頼および変更ゲートを使用します。

レスポンスは `text/event-stream` であり、すべてのイベントに `v: 1` が含まれます:

| イベント | ペイロード |
| -------- | --------------------------------------------------------------------------- |
| `answer` | `{ "type": "answer", "requestId": "...", "answer": "accumulated text" }`    |
| `done`   | `{ "type": "done", "requestId": "...", "answer": "trimmed complete text" }` |
| `error`  | `{ "type": "error", "requestId": "...", "code": "...", "message": "..." }`  |

各 `answer` は以前のテキストを置き換えます。追記する差分ではありません。部分スナップショットは空白を保持しますが、`done` は先頭および末尾の空白をトリムし、既存の JSON BTW 結果と一致します。初期スナップショットは空である可能性があります。`done` と `error` はストリームを終了します。ハートビートコメントは 15 秒ごとに送信されます。回答は UTF-8 テキストで 1 MiB に制限されており、これを超えると `btw_failed` が生成されます。デーモンは 5 分後に `btw_timeout` で生成を終了します。子プロセスおよびブリッジのクリーンアップ期限はそれぞれさらに 5 秒と 10 秒許容されます。明示的なキャンセルは `btw_cancelled` を生成し、他の上流障害は `btw_failed` を生成します。

HTTP 切断はサブスクライバーを切り離すだけです。同じ `requestId`、質問、およびクライアント ID とともに `resume: true` で再接続すると、別のモデル呼び出しを開始せずに最新のスナップショットを受信できます。同じ ID を使用した繰り返しの初期送信も、保持された作業を再利用します。イベントカーソルや `Last-Event-ID` は不要です。保持エントリが存在しない `resume: true` リクエストは 410 を返し、新しい作業を開始しません。リクエストはブリッジ ID、セッション、クライアント、およびリクエスト ID でスコープされ、デーモンの再起動や代替オーナーランタイムをまたいで再開することはできません。

オーナーランタイムごとに最大 32 個の保持リクエストがあります。終端レシートとキャンセルマーカーは 60 秒後に期限切れとなり、新しいリクエストを受け入れるために最も古いものから早期に退避される場合があります。アクティブなリクエストは退避されません。生成はモデルやサブスクライバーを待っている間、セッションの共有アーカイブアドミッションロックを保持しませんが、ブリッジアクティビティはアイドルクリーンアップに対してそれを保護します。明示的なセッションクローズとデーモンシャットダウンは、通常のキャンセル動作を保持します。

SSE開始前のエラー:

- `400 invalid_btw_request` — 無効な質問、リクエストID、または再開フラグ。
- `400 invalid_client_id` — 不正な形式または未登録のクライアントID。
- `403 untrusted_workspace` — 解決された非プライマリ所有者が信頼されていません。
- `404 session_not_found` — ライブ所有者が存在しません。
- `409 btw_request_conflict` — 保持されているIDが別の質問に属しています。
- `410 btw_expired` — 再開に対応する保持済みリクエストがありません。
- `429 btw_limit` — 保持されている32個のリクエストすべてがアクティブです。
- `501 btw_stream_not_supported` — 所有者のブリッジはBTWをストリーミングできません。

### `DELETE /session/:id/btw/stream/:requestId`

機能タグ: `session_btw_stream`。スコープ: live-session-owner。

開始時に使用した同じセッションおよびクライアント ID を持つ一致する BTW リクエストをキャンセルします。空の `204` を返します。キャンセルは保持リクエストに対して冪等です。正確なキャッシュされた ID は、クライアントが切り離された後でもキャンセルできますが、不明な ID はまだ登録されているクライアントが必要です。不明な ID のキャンセルは、遅延した初期 POST が作業を開始できないように、短命のキャンセルマーカーを記録します。

このルートは、ストリーミング POST と同じオーナー解決、信頼、および変更ゲートを使用します。無効な ID は `400 invalid_btw_request` を返し、無効なクライアント ID は `400 invalid_client_id` を返します。すべての 32 個の保持リクエストがアクティブな場合、不明なキャンセルは `429 btw_limit` を返します。ランタイムが容量上限にある場合でも、既知のアクティブリクエストは常にキャンセルできます。キャンセルはメインプロンプトや他のセッションの BTW をキャンセルしません。

### 変更操作: 承認、ツール、スキル、init、MCP再起動

デーモンは、リモートクライアントがデーモンホストのCLIに触れることなくランタイムの状態を変更できるようにする5つの変更制御ルートを公開します。承認モード制御は、非厳密な互換性ゲートを維持します。ツール切り替え、スキル切り替え、ワークスペース初期化、およびMCP再起動は、厳密な変更ゲートを使用します: 信頼できるループバックプライマリ、ベアラー認証済み、およびペアリングされたローカルコントロールリクエストが通過します。信頼できるループバック権限なしでゲートに到達したトークンなしのプライマリリクエストは `401 {code: 'token_required'}` を受け取ります。設定された資格情報の欠落または無効、およびペアリングされていないローカルコントロール資格情報は、より早い段階で単純な `401 Unauthorized` で拒否されます。これら5つのルートすべてについて:

- `X-Qwen-Client-Id` ヘッダーを受け取り、スタンプします（PR 7監査チェーン）。ヘッダーに信頼できるIDが含まれている場合、デーモンは対応するSSEイベントで `originatorClientId` を出力し、クロスクライアントUIが自分自身の変更のエコーを抑制できるようにします。
- 機能を提供する前に、各タグごとの機能をプリフライトチェックします。ルートがないデーモンは `404` を返します。スキル設定ルートの場合、タグの欠如は、同じパスが廃止されたカタログ検証済み契約を提供することを意味する場合もあります。単一ターゲットルートはHTTP `404 skill_not_found` または `409 skill_not_toggleable` を返すことがあり、バッチルートはHTTP 200を返し、`errors[]` にカタログ由来の失敗を含めます。ルートプロービングをバージョンチェックとして使用しないでください。

ツール切り替え、スキル切り替え、init、およびMCP再起動ルートは、**ワークスペーススコープ**のイベントを発行します。すべてのアクティブなセッションSSEバスは、変更がトリガーされたときにどのセッションが接続されていたかに関係なく、イベントを受信します。`approval-mode` は、変更が1つのセッションの `Config` に局所であるため、**セッションスコープ**のイベントを発行します。

#### `POST /session/:id/approval-mode`

機能タグ: `session_approval_mode_control`。ブリッジ → ACP extMethod `qwen/control/session/approval_mode`。

ライブセッションの承認モードを変更します。新しいモードは、ACP子プロセスのセッションごとの `Config` 内に即座に適用され、チャット録画が利用可能な場合はそのセッションのトランスクリプトから復元されます。Planの選択された実行モードも一緒に復元されます。ワークスペース設定はデフォルトでは書き込まれません。ワークスペース設定にも `tools.approvalMode` を書き込む場合は、`persist: true` を渡してください。録画が無効または劣化している場合、モードはライブセッションのみで有効のままです。

リクエスト:

```json
{ "mode": "auto-edit", "persist": false }
```

`mode` は `'plan' | 'default' | 'auto-edit' | 'auto' | 'yolo'` のいずれかでなければなりません（コアの `ApprovalMode` enumのミラー。SDKはランタイム検証用に `DAEMON_APPROVAL_MODES` をエクスポートします）。`persist` のデフォルトは `false` です。

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
- `400 {code: 'invalid_persist_flag'}` — `persist` がブール値ではありません。
- `403 {code: 'trust_gate', errorKind: 'auth_env_error'}` — リクエストされたモードは信頼できるフォルダが必要です（信頼できないワークスペースでの特権モードは、コアの `Config.setApprovalMode` によって拒否されます）。
- `404` — セッションが不明です。

SSEイベント（セッションスコープ）: `approval_mode_changed` with `{sessionId, previous, next, persisted, originatorClientId?}`。

#### `POST /workspace/tools/:name/enable`

機能タグ: `workspace_tool_toggle`。純粋なファイルIO — ACPラウンドトリップなし。

ワークスペースの `tools.disabled` 設定リスト内のツール名を切り替えます。そこにリストされているツールはまったく**登録されません**（ツールを登録したまま呼び出しを拒否する `permissions.deny` とは異なります）。組み込みツールとMCP検出ツールの両方が `ToolRegistry.registerTool` を通じて流れ、これは無効セットを参照します。

> ⚠️ **名前はレジストリの公開識別子と完全に一致する必要があります。** エイリアス解決は行われません。ルートはパスパラメータにある文字列をそのまま `tools.disabled` に保存し、次のACP子プロセスは登録時に `tool.name` と比較します。組み込みツールは正規のレジストリ名（snake_caseの動詞形）を使用します: `run_shell_command`, `read_file`, `write_file`, `list_directory`, `glob`, `grep_search`, `web_fetch` など。CLIが表示する表示ラベル（`Shell`, `Read`, `Write`）ではありません。MCP検出ツールは修飾された `mcp__<server>__<name>` 形式を使用します（これは `tool_toggled` イベントがブロードキャストし、`GET /workspace/mcp` がリストする形式でもあります）。`Bash` を無効にしても、`run_shell_command` が次のセッションで登録されることは防ぎません。

ライブACP子プロセスはすでに登録されているツールを保持します。切り替えは**次の**ACP子プロセス起動時に有効になります。現在のデーモンで変更を有効にするには、`POST /workspace/mcp/:server/restart`（MCP由来のツール用）または新規セッション作成と組み合わせてください。

不明なツール名も受け入れられます: まだインストールされていない MCP ツールを事前に無効化することは正当なユースケースです。

リクエスト:

```json
{ "enabled": false }
```

レスポンス (200):

```json
{ "toolName": "run_shell_command", "enabled": false }
```

エラー:

- `400 {code: 'invalid_tool_name'}` — パスパラメータが空、またはパスパラメータが 256 文字の上限を超えています。
- `400 {code: 'invalid_enabled_flag'}` — `enabled` が欠落しているか、ブール値ではありません。

SSE イベント (ワークスペーススコープ): `{toolName, enabled, originatorClientId?}` を伴う `tool_toggled`。

#### Skills の設定とランタイムルートの分離

機能タグ: `workspace_skills_config_runtime`。

`GET /workspace/config/skills` はデーモンローカルのグローバル設定オーナーを読み取ります。`GET /workspaces/:workspace/config/skills` は登録済みの正確なワークスペース設定を読み取り、ライブまたは信頼できるランタイムを必要としません。どちらも必須の `runtimeEpoch` なしで通常の Skills ステータスの形状を返します:

```json
{
  "v": 1,
  "workspaceCwd": "/work/project",
  "initialized": true,
  "skills": []
}
```

`GET /workspace/runtime/skills` と `GET /workspaces/:workspace/runtime/skills` は選択された信頼できるランタイムを開始せずに読み取ります。ライブカタログには、それを作成したランタイムの世代が含まれます:

```json
{
  "v": 1,
  "workspaceCwd": "/work/project",
  "initialized": true,
  "runtimeEpoch": 4,
  "skills": []
}
```

グローバルなインストールと削除には `POST /workspace/config/skills/install` と `DELETE /workspace/config/skills/:name?scope=global` を使用します。ワークスペースへのインストール、削除、有効化には `POST /workspaces/:workspace/config/skills/install`、`DELETE /workspaces/:workspace/config/skills/:name?scope=workspace`、`POST /workspaces/:workspace/config/skills/:name/enable` を使用します。設定書き込みは、ランタイムの整合性をスケジュールする前に永続的な状態をコミットします。現在のランタイムを更新できない場合は `activation` が `deferred` となり、更新がキューに入れられた場合は `reconciling` となります。何もしないトグルは、ランタイムのリフレッシュが発生したと主張する代わりに、ファサードの有効化状態を保持します。

設定の削除は、デーモンローカルの Skill インベントリを列挙できない場合、確定的な not-found レスポンスの代わりに `503 skills_config_unavailable` を返します。ランタイムの削除 (`DELETE /workspace/skills/:name` とそのワークスペース修飾形式) には、新しく列挙されたカタログが必要です。ランタイムカタログでもデーモンローカルな列挙でも初期化されたカタログが得られない場合、保持されている観測結果が存在しても同じ `503 skills_config_unavailable` を返します。`404 skill_not_found` は、カタログが列挙され、名前がそこに含まれていないことを意味します。

単数形のミューテーションオーナーはワークスペーススコープを `400 workspace_scope_requires_qualified_workspace` で拒否します。修飾されたミューテーションはグローバルスコープを `400 global_scope_requires_singular_owner` で拒否します。修飾された書き込みには信頼できるワークスペースが必要です。レガシーな注入済みブリッジは、ランタイムの調整が必要な修飾された設定書き込みに対して `501 workspace_runtime_not_supported` を返します。不明、削除済み、移行中、およびドレイン中のワークスペースは、標準的な修飾付きワークスペースのエラーに従い、プライマリにフォールバックすることはありません。

#### ネイティブ Skill アーカイブのインストールと領収書

`skill_archive_install` と `skill_zip_file_source` はネイティブ ZIP 入力と対応するオーナー修飾付きの領収書クエリを提供します。両方ともモダンな設定面に限定されています。それらの `limits.maxSkillArchiveBytes`、`maxSkillArchiveExpandedBytes`、`maxSkillArchiveEntries`、および `maxSkillArchiveManifestBytes` はこれら 2 つのソースにのみ適用されます: 圧縮時 50 MiB、展開時 200 MiB、ZIP レコード 4096 件、および効果的なルート `SKILL.md` に 32 MiB。明示的なディレクトリと無視されるメタデータはフィルタリング前にレコードとしてカウントされますが、暗黙的な親はカウントされません。無視されるメタデータは膨張しません。レガシーな base64、ディレクトリ、GitHub の制限 (10 MiB JSON パーサーを含む) は変更されていません。

- `POST /workspace/config/skills/install-archive?name=...&attemptId=...` はグローバルにインストールし、`/workspaces/:workspace/config/skills/install-archive` は選択されたワークスペースにインストールします。HTTP コンテンツエンコーディングなしで `application/octet-stream` を送信してください。ルートはスコープを固定します。
- 既存のモダンな JSON インストールルートも `{ "name": "example", "scope": "global", "attemptId": "<UUID>", "source": { "type": "zip-file", "path": "/absolute/daemon/path.zip", "sha256": "<optional 64 hex digits>" } }` を受け入れます。修飾されたルートには `scope: "workspace"` が必要です。デーモンは開かれた通常ファイルをプライベートストレージにコピーし、呼び出し元のファイルを削除または名前変更することはありません。コピー中はソースを安定した状態に保ってください。メタデータのチェックだけではアトミックなスナップショットになりません。
- `GET /workspace/config/skills/install-attempts/:attemptId` と `GET /workspaces/:workspace/config/skills/install-attempts/:attemptId` は元のオーナーを照会します。レスポンスには `running` (フェーズ付き)、`committed`、`not_committed`、または `recovery_required` が含まれます。領収書が存在しないかアクセスできない場合、結果を確認できません。クエリはランタイムを開始せず、ミューテーションコーディネータを取得もしません。

クライアントは送信前に UUID を提供します。SDK で生成することもできます。同じオーナー下での重複 ID は、インストールを繰り返さずに 409 を返します。ロック待ちとクリーンアップを含め、デーモンごとに 2 つの操作をアクティブにできます。さらなるアドミッションは `Retry-After` を伴う 429 を返します。領収書の受け付けから公開アドミッションまでをカバーする 120 秒の予算があります。公開前のキャンセルは操作を停止します。アドミッション後は、HTTP 接続が消滅してもコミットまたはロールバックが完了します。

成功時はミューテーションの結果と有効化を保持し、`attemptId` と `archiveSha256` を追加します。コミット後の有効化失敗は、コミットの失敗ではなく `activationWarning` です。領収書はプロセスローカルな履歴結果であり、作業が確定してから 10 分間保持され、容量は 256 で早期退避はありません。これらは、後続の操作がインストールされたコンテンツを置き換えていないことを証明するものではありません。再起動、期限切れ、またはオーナーアクセスの喪失により、結果は不明になります。クライアントは曖昧な失敗後に必ずクエリを実行しなければならず、自動的に再送信してはいけません。

#### `POST /workspace/skills/refresh`

機能タグ: `workspace_session_refresh`。ワークスペース修飾形式は `POST /workspaces/:workspace/skills/refresh` です。単数形ルートはプライマリランタイムを所有します。修飾されたルートは、選択された正確な信頼できるランタイムを解決し、プライマリにフォールバックすることはありません。どちらも厳格なミューテーションゲートと既存のクライアントアイデンティティチェックを使用します。

すべてのライブセッション、または指定されたセッション ID のみを対象に、Skill 設定とコンテンツを明示的にリロードします:

```json
{ "sessionIds": ["session-1", "session-2"] }
```

`sessionIds` を省略すると、すべてのライブセッションがリフレッシュされます。ID は空でない文字列でなければならず、リクエスト順で重複排除されます。`[]` はセッションやキャッシュをリフレッシュせずにゼロカウントを返します。無効なリクエスト形状は HTTP 400 を返します。不明な ID と別のワークスペースが所有する ID は、リフレッシュが始まる前に HTTP 404 を返します。選択されたセッションは、それらを所有する実行エンジンチャネルのみにルーティングされます。無関係なチャネルにはリフレッシュコマンドが届きません。

レスポンス (200):

```json
{
  "sessionsRefreshed": 2,
  "sessionsFailed": 0,
  "configsRefreshed": 3,
  "configsFailed": 0,
  "reason": "all"
}
```

カウントは、選択されたセッションと、それらのオーナーチャネル向けにリフレッシュされた共有/セッション設定を記述します。選択は即時のセッションリフレッシュとコマンド通知を制御します。共有チャネルキャッシュは変化する可能性があり、ワークスペースイベントはワークスペース全体のままです。明示的なリクエストは、Skill コーディネータのリビジョンまたは準備完了状態を更新しません。Skill の有効/無効化、インストール/削除、および自動整合性は、既存の完全リフレッシュ動作を維持します。このルートは、Skill トグルボディに `refreshRuntime` や `sessionIds` を追加しません。

#### `POST /workspace/skills/:name/enable`

機能タグ: `workspace_skill_settings_toggle`。ワークスペース修飾形式は `POST /workspaces/:workspace/skills/:name/enable` です。

名前のワークスペース Skill 設定を更新します。有効化時、デーモンはまず拡張機能作成の名前を新しいカタログ観測に対して解決し、保持データと読み取りスロットリングをバイパスして、必要に応じて ACP およびデーモンローカルのフォールバックを待ちます。両方の新しいソースが失敗した場合、レガシー名ヒューリスティックの前に保持された観測が使用されます。名前はカタログに対して検証されません。無効化時はカタログを読み取りません。トリムされたリクエスト名は永続化に渡され、レスポンスで返されます。任意の名前を有効にすると、インストール前であってもワークスペースの `skills.enabled` オプトインが記録されます。無効にするとそのオプトインが削除され、ワークスペースの `skills.disabled` エントリが追加されます。もはやロードされていない Skills の既存エントリは保持され、ターゲットに対する重複/大文字小文字バリエーションのエントリは統合されます。上位スコープから継承されたハード `skills.disabled` エントリは有効な可用性にとって権威的ですが、ワークスペーススコープが独自宣言を記録または削除することを妨げません。それ以外のワークスペース宣言は通常の `skills.disabled > skills.enabled > skills.defaultDisabled` 解決に参加し、上位スコープの `skills.defaultDisabled` または `skills.enabled` エントリを上書きできます。

これは ACP `qwen/skills/setEnabled` マネージドスキル操作および `disable-model-invocation` フロントマターフィールドとは異なります。アクティブな Extension 親の場合、有効な Skill 可用性は `skills.disabled` > `skills.enabled` > `skills.defaultDisabled` > ワークスペース内部上書き > マニフェスト `skillStates` > 有効 の順に従います。ハード無効化とデフォルト無効化の両方により、スキルはスラッシュコマンド/モデル可用性から削除され、後続のスキル実行が拒否されます。`disable-model-invocation: true` は直接ユーザー呼び出しを可能にしたまま、モデル呼び出しからのみスキルを非表示にします。

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

`activation` は `changed` と独立して子プロセスの生存状態と必要なリフレッシュを反映します。ACP 子が生存しており、必要なリフレッシュがすべて成功した場合は `applied` です。生存チェック時に生存している子がいない場合、または変更されたリクエストが必要なリフレッシュ中に子/セッションを失った場合は `deferred` です。少なくとも他の必要なリフレッシュが 1 つ以上失敗した場合は `partial` です。したがって、no-op は `changed: false` を伴う `applied` または `deferred` となり得ます。`changed` が true でアクティベーションが `deferred` の場合、子が起動する際に永続化された宣言が使用されます。ビジーセッションは必要なリフレッシュに含まれます。デーモンは ACP 子とすべてのアクティブセッションのワークスペース設定を再読み込みし、SkillManager コンシューマーに通知を送り、`available_commands_update` をプッシュします。すでにモデルに送信されたリクエストは書き換えられません。後続の検証、コマンドスナップショット、モデルコンテキストは新しい状態を使用します。永続化が失敗した場合、リフレッシュやイベントは発行されません。セッションのリフレッシュが失敗した場合、コミットされた設定は保持されます。子がセッションごとの結果を返す場合、セッションカウントは正確です。リフレッシュ制御自体がこれらの結果を返す前に失敗した場合、`sessionsFailed: 1` はリフレッシュリクエストが失敗したことを示す保守的な下限値です。

エラー:

- `400 {code: 'invalid_skill_name'}` — パスパラメータが空、または 256 文字を超えています。
- `400 {code: 'invalid_enabled_flag'}` — `enabled` が欠落しているかブール値ではありません。
- `403 {code: 'untrusted_workspace'}` — 選択されたワークスペースが信頼されていません。

このミューテーションは、変更された各キー（`skills.disabled` および/または `skills.enabled`）に対してワークスペーススコープの `settings_changed` イベントを再利用し、新しいイベントタイプを追加しません。これらのイベントにはそれぞれ同じ `mutation` オブジェクトが含まれます: `{ id, kind: 'skill_toggle', skills: [{ name, enabled }], activation, sessionsRefreshed, sessionsFailed }`. `id` は、1 つのトグルリクエストによって生成されたすべての設定イベントを相関付けます。`skills` は、要求された名前と要求された有効値のうち、ワークスペース設定宣言が実際に変化したものをリストします。上位スコープの設定により、有効な可用性が変わらない場合があります。ワークスペーススキルステータスセルにはオプションの `disabledReason: 'hard' | 'default' | 'inactive_extension'` および `lockedScope: 'system' | 'user' | 'systemDefaults'` フィールドが含まれます。

#### `POST /workspace/skills/enable`

ケイパビリティタグ: `workspace_skill_settings_batch_toggle`. ワークスペース修飾形式は `POST /workspaces/:workspace/skills/enable` です。

1 リクエストで最大 100 個の名前のワークスペース Skill 設定を更新します。上限は重複排除前の生 `skillNames` エントリ数を数えます。名前はトリムされ、最初に現れた順序と大文字小文字を保持しながら大文字小文字を区別せずに重複排除されます。有効化時、デーモンはまず拡張機能作成の名前を新しいカタログ観測に対して解決し、保持データと読み取りスロットリングをバイパスして、必要に応じて ACP およびデーモンローカルのフォールバックを待ちます。両方の新しいソースが失敗した場合、レガシー名ヒューリスティックの前に保持された観測が使用されます。名前はカタログに対して検証されません。無効化時はカタログを読み取りません。結果として生じるすべての宣言変更を、ロックされた設定書き込み高々 1 回で適用し、何か変化があった場合はアクティブセッションを一度だけリフレッシュします。有効化は常に明示的なワークスペース `skills.enabled` オプトインを記録します。これにはまだインストールされていない名前も含まれるため、Extension の内部無効化を上書きできます。同一の宣言を繰り返すことは no-op のままです。予期しない永続化またはランタイム生成の失敗は、リクエスト全体を失敗させます。

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
    },
    {
      "skillName": "missing",
      "enabled": false,
      "changed": true
    }
  ],
  "errors": []
}
```

不正なリクエストは HTTP 400 を返し、`invalid_skill_names`, `invalid_skill_name`, または `invalid_enabled_flag` が含まれます。認証、ワークスペース信頼性、クライアントアイデンティティ、予期しない永続化失敗、およびランタイム生成失敗は、標準ルートゲートを通じてリクエスト全体を失敗させます。`errors` はワイヤー互換性のためにレスポンスに残りますが、構造的に有効な名前については空です。バッチレベルの `activation`, `sessionsRefreshed`, および `sessionsFailed` は、子プロセスの生存状態と、すべての変更結果で共有される単一のライブセッションリフレッシュを記述します。ターゲットが何も変化しなかったバッチでも、子が生存している場合は `applied`、存在しない場合は `deferred` と応答することがあり、単一 Skill の no-op レスポンスと一致するため、実際に何が変わったかは各結果の `changed` フラグから導出してください。少なくとも 1 つのターゲットが変化する場合、デーモンは単一 Skill ルートと同じ `settings_changed` ミューテーションメタデータを発行します。そのリクエストからのすべての `skills.disabled` / `skills.enabled` イベントは一つの `mutation.id` を共有します。

#### `PUT /skills/activation`

ケイパビリティ: `user_skill_activation` (User 設定永続化が利用可能な場合に広告されます)。このプロセスグローバルミューテーションは、信頼できるワークスペースやインストール済み Skills のスキャンを必要とせずに User Skill 環境設定を保存します。通常の認証済みミューテーションゲートを使用します。オプションの `X-Qwen-Client-Id` は、ドレイン中のものも含め、依然として管理されているランタイムに属していなければなりません。

```json
{
  "skillNames": ["rust:pdf", "go:review"],
  "state": "enabled"
}
```

1〜100 個の名前を提供します（各最大 256 文字）。名前はトリムされ、大文字小文字を区別せずに重複排除されます。`state` は `enabled` または `disabled` です。`disabled` のみが `mode` を受け入れます: `hard` (デフォルト) または `default`. 名前は必ずしもインストール済みである必要はありません。無効なバッチは書き込み前に拒否されます。

Qwen は、設定書き込みロックの下で最新のユーザー設定を読み取り、各明示的な名前を `skills.enabled`、`skills.disabled`、または `skills.defaultDisabled` に追加し、同じ名前を他の 2 つのリストから削除して一括保存します。他の名前、綴り、スコープ、および設定は保持されます。特に、`rust:pdf` を有効にしても `pdf` の制限は削除されません。明示的なベア名は既存のマッチングルールを維持します。システム制限は引き続き適用されます。

```json
{
  "scope": "user",
  "state": "enabled",
  "results": [
    { "skillName": "rust:pdf", "changed": true },
    { "skillName": "go:review", "changed": true }
  ],
  "propagation": "queued"
}
```

無効化された応答には、正規化された `mode` も含まれます。`propagation` はスケジューリングを記述しており、測定可能な可用性ではありません: `queued` は少なくとも 1 つのライブランタイムがリフレッシュをキューに入れたことを意味します; `deferred` は保存された設定がランタイムライフサイクル処理を待機していることを意味します; `not_required` はこのリクエストが何も変更しなかったことを意味します。no-op は書き込みもイベント発行も行わず、以前の更新の完了を保証しません。有効な状態については、既存のワークスペース設定およびランタイム Skill ステータスのエンドポイントを確認してください。

成功した変更は設定キャッシュを無効にし、`scope: "user"` を伴う通常の `settings_changed` イベントをブロードキャストします。リフレッシュはユーザーおよびワークスペース設定をアトミックに再読み込みします。失敗した設定またはセッションのリフレッシュは、ライフサイクル復旧と限定された再試行のために保留中の作業を保持します。既存のワークスペース専用リフレッシュ動作は変更されません。

不正な入力は HTTP 400 (`invalid_skill_names`, `invalid_skill_name`, `invalid_skill_activation_state`, または `invalid_skill_activation_mode`) を返します。コミット前にプライマリランタイム生成が閉じられた場合、設定ルートと同様に HTTP 503 と `Retry-After: 1` を返します。SDK は `setUserSkillsActivation(skillNames, activation, { clientId? })` を公開し、予備的な設定読み取りなしで 1 つの PUT を送信します。

#### `POST /workspace/init`

機能タグ: `workspace_init`. 純粋なファイル IO — ACP ラウンドトリップなし、**LLM 呼び出しなし**。

デーモンのプライマリワークスペースルートに空の `QWEN.md`（またはワークスペース `context.fileName` 設定オーバーライド）をスキャフォールドします。機械的な操作のみ — AI ドリブンなコンテンツ埋め立てには、`POST /session/:id/prompt` でフォローアップしてください。

デフォルトでは、ターゲットファイルが存在し非空白の内容がある場合、上書きを拒否します。空白のみのファイルは存在しないものとして扱われます（ローカル `/init` スラッシュコマンドと一致）。

リクエスト:

```json
{ "force": false }
```

レスポンス (200):

```json
{ "path": "/work/bound/QWEN.md", "action": "created" }
```

`action` は新規作成の場合 `'created'`、既存の空白のみファイルがそのまま残った場合（書き込み実行なし）`'noop'`、`force: true` が非空の内容を置き換えた場合 `'overwrote'` です。`workspace_initialized` SSE イベントはレスポンスアクションを反映します — オブザーバーは実際のディスク変更のみに反応するために `action !== 'noop'` でフィルタリングできます。

エラー:

- `400 {code: 'invalid_force_flag'}` — `force` がブール値ではありません。
- `409 {code: 'workspace_init_conflict', path, existingSize}` — ファイルが非空白の内容で存在し、`force` が省略または false です。ボディには絶対パスとサイズ（バイト）が含まれるため、SDK クライアントは再 stat せずに「N バイトを上書きしますか？」プロンプトを描画できます。

SSE イベント（ワークスペーススコープ）: `{path, action, originatorClientId?}` を伴う `workspace_initialized`.

#### `POST /workspace/mcp/reload`

永続化された MCP 設定をワークスペース検出設定とすべてのアクティブセッションに再読み込みします。ワークスペース修飾形式は `POST /workspaces/:workspace/mcp/reload` です。

リクエストボディ:

```json
{ "forceReconnectAll": true }
```

`forceReconnectAll` は任意であり、デフォルトは `false` で、増分的な調整を保持します。true の場合、デーモンは設定調整後にすべての適格な構成済み MCP サーバーに再接続します。代わりに、`forceReconnectWhich: ["server-a", "server-b"]` を渡して名前付きサーバーのみを再接続することもできます。これらのオプションは相互排他です。強制再接続により、各トランスポートは他のローカル Qwen Code プロセスがトークンストレージに書き込んだ可能性のある資格情報を読み取りますが、OAuth 認可フローを開始することはありません。

ルートは `202 { "accepted": true }` を返します。最終的な接続ステータスは `GET /workspace/mcp` でポーリングしてください。無効なオプション値は 400 を返します。

#### `POST /workspace/mcp/:server/restart`

機能タグ: `workspace_mcp_restart`. ブリッジ → ACP extMethod `qwen/control/workspace/mcp/restart`.

ACP チャイルドの `McpClientManager.discoverMcpToolsForServer` を介して構成済み MCP サーバーを再起動します（切断 + 再接続 + 再検出）。PR 14 v1 の会計からのライブ予算スナップショットを事前チェックするため、予算飽和ワークスペースでの再起動は `BudgetExhaustedError` カスケードを引き起こすのではなく、ソフト拒否を返します。

リクエストボディは空です（`{}`）。パスパラメータは、`mcpServers` 設定に表示される URL エンコードされたサーバー名です。

レスポンス (200) — `restarted` による判別共用体:

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

| `reason` | 意味 |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `'in_flight'` | このサーバーに対する別の検出/再起動が既に進行中です。ルートは元のプロミスを待たずに即座に返ります。呼び出し側は短い遅延後に再試行すべきです。 |
| `'disabled'` | サーバーは構成されていますが、`excludedMcpServers` にリストされています。再起動前に有効化してください。 |
| `'budget_would_exceed'` | デーモンは `--mcp-budget-mode=enforce` であり、ターゲットサーバーは現在 `reservedSlots` に含まれておらず、ライブ合計が `clientBudget` に達しています。呼び出し側はまずスロットを解放すべきです。 |

エラー（非 2xx）:

- `400 {code: 'invalid_server_name'}` — パスパラメータが空です。
- `404` — サーバー名が `mcpServers` 設定に含まれていないか、ライブ ACP チャネルが存在しません（再起動には本質的にライブ `McpClientManager` インスタンスが必要です）。
- `500` — 内部エラー（例: `ToolRegistry` が初期化されていない）。

SSE イベント（ワークスペーススコープ）: 成功時は `{serverName, durationMs, originatorClientId?}` を伴う `mcp_server_restarted`、ソフトスキップ時は `{serverName, reason, originatorClientId?}` を伴う `mcp_server_restart_refused`.

#### `POST /workspaces/:workspace/language`

設定永続化が利用可能な場合に登録される、セッションレスのワークスペース UI 言語同期。所有権: selected-runtime。ワークスペース ID またはエンコードされた絶対 cwd を解決し、アクティブな信頼できるランタイムを必要とし、そのランタイムに対してクライアント所有権を検証します。非アクティブな生成は `503 workspace_runtime_unavailable` を返します。未解決のセレクターはプライマリワークスペースにフォールバックすることはありません。

リクエスト: `{ "language": "zh" }`. 言語は `POST /language` と同じサポートコードを使用します。選択されたワークスペースの `general.language` のみを永続化し、その後そのマージされた有効設定を読み取り、`scope: "workspace"` を伴う `qwen/control/user/language` を介してすでにライブのチャネルを同期します。コールドチャネルはプロセス開始や会話作成なしにスキップされます。出力言語とモデル設定は変更されません。`syncOutputLanguage: true` は拒否されます。

レスポンスは `POST /language` と同じ形状で、`outputLanguage: null` を含みます。`language` は有効な構成ロケール（`auto` を含む）であり、`refresh` は選択されたランタイムのみをカウントします。成功時にワークスペース `language_changed` イベントが発行されます。SDK はセッショントランスポートとは独立して REST 経由で `client.workspaceByCwd(cwd).setUiLanguage(language)` を公開します。

#### `POST /language`

機能タグ: `user_language_sync` (条件付き — 設定の永続化が利用可能な場合のみ広告されます。`workspace_settings` と同じ条件です)。信頼できるランタイムごとにライブチャネルを介して Bridge → ACP extMethod `qwen/control/user/language` を実行します。

セッションレスの **ユーザーレベル** の言語同期 (issue #10234)。セッションが存在する前に言語を切り替える必要があるホスト向けです (例: ウェルカムページ)。所有権分類: プロセスグローバル — ユーザーグローバルの状態のみを変更するため (`~/.qwen/settings.json`、グローバルな `~/.qwen/output-language.md`)、ワークスペースセレクターもセッション ID も必要としません。兄弟要素である `POST /session/:id/language` に合わせて、非厳密な `mutate()` ゲートの裏に登録されています。

デーモンプロセスが単一の書き込み側です: ファンアウトの前に `general.language` を永続化し (`syncOutputLanguage` が true の場合は `general.outputLanguage` およびグローバルな `output-language.md` も含みます)、各信頼できるランタイムは自身のプロセス UI 言語を切り替え、ディスクからユーザースコープの設定を再読み込みします。`syncOutputLanguage` が true の場合、すべてのローカルセッションのシステム指示も更新します。セッションスコープのルートとの違い:

- プロジェクトバインドの出力言語ファイルは書き換えられません — ワークスペースに独自の `.qwen/output-language.md` があるセッションはそのオーバーライドを保持します (プロジェクトスコープが再読み込み時に優先されます)。
- セッション数ゼロおよびライブランタイムチャネル数ゼロはエラーではなく **成功** です。ライブチャネルを持たないランタイムはスキップされ (失敗ではありません)、そのチャネルが次に起動したときに永続化されたファイルを読み取ります。
- 信頼できないワークスペースランタイムは、セッションルートの `403 untrusted_workspace` ポスチャーに従ってスキップされます。

リクエスト:

```json
{ "language": "zh", "syncOutputLanguage": true }
```

`language` は `/capabilities` `supportedLanguages` にリストされているコードのいずれか (および `'auto'`) でなければなりません。`syncOutputLanguage` のデフォルトは `false` です。

レスポンス (200):

```json
{
  "language": "zh",
  "outputLanguage": "Chinese",
  "refresh": { "runtimes": 1, "sessions": 2, "failed": 0 }
}
```

`language` はデーモンによって解決された UI ロケールであり、`'auto'` リクエストで具体的な言語が返される場合があります。ホストはセレクターの状態について永続化された `general.language` 設定を読むべきです。`syncOutputLanguage` が false の場合、`outputLanguage` は `null` になります。`refresh.runtimes` はライブチャネル経由で切り替えを適用したランタイム数をカウントします。`refresh.sessions` はセッションごとのシステム指示の更新回数の合計です。`refresh.failed` はセッションごとの更新失敗と失敗したランタイムを集約します (ファンアウトはベストエフォートであり、永続化が成功した後はリクエストを失敗させることはありません)。

エラー:

- `400 {code: 'invalid_language', allowed: [...]}` — 不明な言語コード。
- `400 {code: 'invalid_sync_flag'}` — `syncOutputLanguage` がブール値ではありません。
- `400 {code: 'invalid_client_id'}` — `X-Qwen-Client-Id` がどのランタイムにも認識されていないクライアントです (ヘッダーは省略可能です。セッションが存在しない場合は省略してください)。
- `500 {code: 'persist_error'}` — ユーザー設定または出力言語ファイルへの書き込みに失敗しました。失敗したステップとその後のステップは実行されませんでした (`general.language` の書き込みなど、以前に適用されたステップはロールバックされません)。
- `404` — デーモンがこのルートより前のバージョンであるか、設定の永続化なしでビルドされました (機能タグを確認してください)。

SSE イベント (ワークスペーススコープ、すべてのランタイムのセッションバス上): `language_changed` with `{language, outputLanguage, userLevel: true, originatorClientId?}`. `userLevel: true` マーカーにより、このファンアウトがセッションルートのセッションごとのイベント (代わりに `sessionId` を含む) と区別されます。

### `GET /session/:id/events` (SSE)

セッションのイベントストリームを購読します。

ヘッダー:

```
Accept: text/event-stream
Last-Event-ID: 42        ← optional, replays from after id 42
X-Qwen-Event-Epoch: ...  ← optional, pairs the cursor with its bus epoch
X-Qwen-Client-Id: ...    ← optional client identity and diagnostic correlation
```

クエリパラメータ:

| パラメータ | 必須 | 備考 |
| ------------------ | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `maxQueued` | いいえ | サブスクライバーごとの **ライブフレームバックログ** の上限。範囲は `[16, 2048]`、デフォルトは 256。サブスクライブ時に強制プッシュされる再生フレームは、フレームおよびバイトの上限の対象外です。実際に消費するのは、サブスクライバーが大きな `Last-Event-ID: 0` 再生をまだ処理している間に到着するライブイベントです。コールド再接続の場合は引き上げてください。これにより、コンシューマーが追いつく前にライブテールが遅いクライアント警告 / エビクションを引き起こすのを防ぎます。ライブシリアライズ済みバイトの上限はデーモン側で固定されており (デフォルト 2 MiB)、クエリパラメータはありません。範囲外 / 10進数ではない / 存在するが空の値は、SSE ハンドシェイクが開かれる前に `400 invalid_max_queued` を返します。プリフライト `caps.features.slow_client_warning` — 古いデーモンはこのパラメータを黙って無視します。 |
| `connectReason` | いいえ | クライアントが報告する診断ヒント: `initial`, `resume`, `prompt_restart`, `stream_end`, `transport_error`, `state_resync`, または `unknown`。無効な値は `unknown` に正規化され、ハンドシェイクを拒否することはありません。デーモンはこのフィールドを認証、再生、エビクション、重複排除、またはストリーム置換には使用しません。 |
| `previousStreamId` | いいえ | クライアントによって報告された、以前に受け入れられた REST/SSE ストリームの UUID。無効な値は無視されます。これはベストエフォートの系譜情報であり、ストリームの挙動を変えるものではありません。 |

成功したハンドシェイクには `X-Qwen-SSE-Stream-Id: <uuid>` が含まれます。ブラウザゲートウェイはこのレスポンスヘッダーを保持し、`Access-Control-Expose-Headers` 経由で公開する必要があります。古いデーモンや中間層ではこれが省略される場合があります。クライアントは通常どおり継続し、系譜情報が利用不可として扱う必要があります。この ID は、この物理的な REST/SSE 接続を識別し、そのデーモンのライフサイクル、キュー診断、リクエストトレースを相関させます。

フレーム形式。`data:` 行は **完全なイベントエンベロープ** であり、1行に JSON 文字列化されています — `{id?, v, type, data, originatorClientId?}`。ACP 固有のペイロード (`sessionUpdate`, `requestPermission` 引数など) はエンベロープの `data` フィールドの下にあります。エンベロープ自体の `type` は SSE の `event:` 行と一致します。

```
id: 7
event: session_update
data: {"id":7,"v":1,"type":"session_update","data":{"sessionUpdate":"agent_message_chunk","content":{"type":"text","text":"…"}}}

id: 8
event: permission_request
data: {"id":8,"v":1,"type":"permission_request","data":{"requestId":"<uuid>","sessionId":"<sid>","toolCall":{...},"options":[...]}}

: heartbeat              ← every 15s, no payload

event: client_evicted    ← terminal frame, no id (synthetic)
data: {"v":1,"type":"client_evicted","data":{"reason":"queue_overflow","droppedAfter":42,"queueSize":256,"maxQueued":256,"queuedBytes":1800000,"maxQueuedBytes":2097152}}

event: client_evicted    ← terminal frame for byte overflow, no id (synthetic)
data: {"v":1,"type":"client_evicted","data":{"reason":"queue_bytes_overflow","droppedAfter":43,"queueSize":1,"maxQueued":256,"queuedBytes":1900000,"maxQueuedBytes":2097152,"eventBytes":300000}}
```

SSE レベルの `id:` / `event:` 行は、EventSource 互換性のために `envelope.id` / `envelope.type` を複製しています。生の `fetch` コンシューマー (SDK の `parseSseStream`) はすべて JSON エンベロープから読み取り、SSE プリアンブル行を無視します。

| イベントタイプ | トリガー |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `session_update` | すべての ACP `sessionUpdate` 通知 (LLM チャンク、ツール呼び出し、使用量) |
| `permission_request` | エージェントがツールの承認を要求した場合 |
| `permission_resolved` | 一部のクライアントが `POST /permission/:requestId` を介して権限に対して投票した場合 |
| `permission_partial_vote` | (合意制のみ) 投票は記録されましたが、定足数には達していません。`{requestId, sessionId, votesReceived, votesNeeded, quorum, optionTallies}` を含みます。プリフライト `caps.features.permission_mediation`。 |
| `permission_forbidden` | 投票がアクティブなポリシーによって拒否されました (`designated` の不一致、`local-only` がループバックでない、または `consensus` の投票者がスナップショットに含まれていない)。`{requestId, sessionId, clientId?, reason}` を含みます。プリフライト `caps.features.permission_mediation`。 |
| `model_switched` | `POST /session/:id/model` が成功した場合 |
| `model_switch_failed` | `POST /session/:id/model` が拒否された場合 |
| `session_died` | エージェントの子プロセスが予期せずクラッシュしました。**終端: このフレームの後、SSE ストリームは閉じられます。セッションは `byId` から消えます。** サブスクライバーは `POST /session` を介して再接続し、新しいセッションを生成する必要があります。 |
| `slow_client_warning` | サブscriberローカル: ライブフレームバックログまたはライブシリアライズ済みバイトバックログが75%以上。 **非終端** — ストリームは継続; この警告は退避前の注意喚起です。 `{queueSize, maxQueued, lastEventId, queuedBytes?, maxQueuedBytes?, threshold?}` を伴い、ここで `threshold` は `frames`、`bytes`、または `frames_and_bytes` です。 オーバーフローエピソードごとに一度だけ発火します; 両方の測定値が37.5%未満に低下した後に再アームされます。 `id` なし（合成）。 プリフライト `caps.features.slow_client_warning`。 |
| `client_evicted` | サブscriberローカル: キューオーバーフロー。 `reason` はライブフレーム上限に対して `queue_overflow` で、ライブシリアライズ済みバイト上限に対して `queue_bytes_overflow` です。 **終端: このフレームの後でSSEストリームがクローズされます** （`id` なし — 合成）。 同じセッション上の他のサブscriberは継続します。 |
| `stream_error` | ファンアウト中のデーモン側エラー。 **終端: このフレームの後でSSEストリームがクローズされます** （`id` なし — 合成）。 |

再接続セマンティクス:

- セッションごとのリングから `id > n` を持つイベントを再生するために `Last-Event-ID: <n>` を送信します（デフォルト深さ **8000**、`qwen serve --event-ring-size <n>` 経由で調整可能）。
- **ギャップ検出:** 同じエポック内で、最初に保持されているリングIDが `<n> + 1` より大きい場合、デーモンは生き残ったサフィックスを再生する前に、`reason: 'ring_evicted'` を持つIDなしの `state_resync_required` フレームを発行します。 他の理由は `epoch_reset`、`seeded_replay_not_in_ring`、および `replay_budget_exceeded` です; バジェット信号は配信された再生プレフィックスに従います。 トリガー、カーソルフィールド、および回復ルールについては [resync reasons and ordering](./daemon/09-event-schema.md#resync-reasons-and-ordering) を参照してください。
- SDKは `awaitingResync` をラッチします; クライアントは `POST /session/:id/load` を呼び出し、現在のバウンドされた再生スナップショットウィンドウから再構築する必要があります。 そのスナップショット自体は、古いインメモリ再生エントリが破棄された場合に `history_truncated` で始まる可能性があります; このマーカーは情報提供であり、別のresyncループを開始してはいけません。 そのオプションのページングアンカーは [frozen at replay-window eviction](./daemon/09-event-schema.md#history-truncation-anchor) です。
- IDはセッションのイベントバスエポック内で単調増加し、1から始まります。 拒否された公開はIDを消費してはいけません; [event sequence invariants](./daemon/09-event-schema.md#state-and-forward-compatibility) を参照してください。
- 合成フレーム（`client_evicted`、`slow_client_warning`、`stream_error`、`state_resync_required`、`replay_complete`）は意図的に `id` を省略しており、他のサブscriberのためにシーケンススロットを消費しないようにしています。 `replay_complete` は空または不完全な再生を含む再生の終わりを示しますが、resyncが完了したことを意味するものではありません。

バックプレッシャー:

- サブscriberごとのキューはデフォルトで `maxQueued: 256` のライブアイテムと、デーモン所有の2 MiBライブシリアライズ済みバイト上限を持ちます。 再接続中の再生フレーム、`slow_client_warning`、および `client_evicted` は両方の上限をバイパスします。
- SSEリクエスト上で `?maxQueued=N` （範囲 `[16, 2048]`）のみを通じてフレーム上限を上書きします。 意図的に `?maxQueuedBytes` はありません; クライアントはデーモンのメモリーバジェットを引き上げることはできません。
- サブscriberのライブフレームバックログまたはライブバイトバックログが75%を超えた場合、バスはそのサブscriberに `slow_client_warning` 合成フレームを強制プッシュします（オーバーフローエピソードごとに一度; 両方の測定値が37.5%未満に低下した後に再アームされます）。 ストリームは開いたままです — この警告は注意喚起であり、クライアントがより速くドレインするか、クリーンにデタッチ＋再接続できるようにするためです。
- ライブフレーム上限がオーバーフローした場合、バスは `reason: "queue_overflow"` を伴う `client_evicted` を発行します。 空のライブキューは一つの過大サイズのイベントを変更なしで受け入れます。 空でないキューにおけるバイトオーバーフローを拒否する前に、バスはMCP App全体の `rawOutput.html` を `''` にドロップすることがあります。その場合、`fallbackText` が空でないときです。 そのコピーが収まる場合、退避やresync信号なしで配信が継続されます。 そうでない場合は `reason: "queue_bytes_overflow"` を発行します。 いずれかの退避において、終端フレームは強制プッシュされ、サブスクリプションはクローズされます。
- このオプションのApp劣化はキューイングされた配信のみに影響します。 直接配信と再生リングはオリジナルを保持します; コンパクション再生ウィンドウは独自バジェットを適用します。 劣化したコピーは元のリングエントリと同じイベントIDを持ちます。 したがって、IDを持つ配信ペイロードはリングのペイロードと等しい必要はなく、そのID以降の再開ではそのHTMLを復元しません。 ドキュメントを必要とするクライアントは永続化されたトランスクリプトを明示的に再ページングする必要があり、これはページサイズ制限の対象ともなります。

### `POST /session/:id/permission/:requestId`

以下に記載されている同じ投票を実行しますが、名前付きライブセッションを所有するランタイムを通じてルーティングします。新しいマルチワークスペース統合では、レガシーなプロセスグローバルルートではなく、この形式を使用してください。プリフライト `caps.features.session_permission_vote`。

リクエストボディ、調停ポリシー、結果、および成功レスポンスは `POST /permission/:requestId` と同一です。任意の `X-Qwen-Client-Id` ヘッダーは、指定されたポリシーおよび合意ポリシーに参加します。失敗時は、記載されている場所で安定した `code` 値を使用します。不正な入力と失われた保留リクエスト競合は `code` を省略する場合があります:

- `400` — 不正な投票ボディ（`code` なし）または無効なクライアント ID（`invalid_client_id`）、あるいは選択されたオプションが提示されていなかった場合の `invalid_option_id`。同じ投票を再試行するのではなく、提示されたオプションを再読み込みしてください。
- アクティブなポリシーが投票者を拒否した場合の `403` — `permission_forbidden`、またはプライマリ以外の所有ワークスペースが信頼されていない場合の `untrusted_workspace`。信頼されていないプライマリ所有者はこの信頼チェックから免除され、投票は受理される場合があります。
- ライブの所有者が存在しない場合の `404` — `session_not_found`、またはリクエストが保留中ではない場合の `code` なし。
- エージェントの `allowedOptionIds` に予約済みの `__cancelled__` センチネルが含まれている場合の `500` — `cancel_sentinel_collision`、または複数のワークスペースがセッションをクレームしている場合の `ambiguous_session_owner`。
- このビルドで実装されていないポリシーに対する `501` — `permission_policy_not_implemented`。
- 所有ランタイムが利用できない場合の `503` — `workspace_runtime_unavailable`、またはデーモンが作業を受け付けなくなった場合の `daemon_draining`。

プライマリブリッジに対して再試行を行うことはありません。TypeScript SDK メソッドは `respondToSessionPermission()` です。

### `POST /permission/:requestId`

保留中の `permission_request` に投票します。アクティブな **調停ポリシー** が勝者を決定します:

| ポリシー | 動作 |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `first-responder` (デフォルト) | 検証済みの投票者なら誰でも勝ちます。後続の投票者は `404` を取得します。F3 以前のベースライン。 |
| `designated` | プロンプトの発信元 (`originatorClientId`) のみが決定します。非発信元は `403 permission_forbidden / designated_mismatch` を取得します。匿名のプロンプトの場合は最初の応答者にフォールバックします。 |
| `consensus` | N-of-M 投票者の合意が必要（デフォルトは `N = floor(M/2) + 1`、`policy.consensusQuorum` で上書き可能）。最初に `N` に達した選択肢が勝者となります。未解決の投票には `200` + `permission_partial_vote` SSE フレームが含まれます。 |
| `local-only` | ループバック接続からの投票者のみが決定権を持ちます。リモート呼び出し元は `403 permission_forbidden / remote_not_allowed` を取得します。 |

アクティブなポリシーは `settings.json` の `policy.permissionStrategy` 配下で設定され、`/capabilities` の `body.policy.permission` で表示されます。ビルドでサポートされているセットを確認するには、`caps.features.permission_mediation`（`modes: [...]` を使用）を事前に実行してください。

> **F3 (#4175): マルチクライアント権限調整。** F3 では上記の 4 つのポリシーが追加されました。F3 以前のデーモンでは最初の応答者がハードコードされていましたが、設定されたポリシーが `first-responder` の場合、ワイヤー形式はビット単位で変更されません。新しいイベント（`permission_partial_vote`, `permission_forbidden`）は追加的であり、古い SDK はこれらを `unrecognized_known_event` として認識し、適切に無視します。

> **権限タイムアウト（デフォルトでは無効）。** `permission_request` は、次のいずれかが発生するまで保留状態が続きます: (a) 何らかのクライアントがここで投票する場合、(b) `POST /session/:id/cancel` が発火する場合、(c) プロンプトを実行している HTTP クライアントが切断される場合（プロンプト途中でのキャンセルにより、未解決の権限は `cancelled` として解決されます）、(d) セッションが終了する場合、(e) デーモンがシャットダウンする場合、**または (f) 設定されたタイムアウトが発火する場合**。タイムアウト発火時、エージェントの `requestPermission` は `{outcome: 'cancelled'}` として解決され、監査リングに `permission.timeout` エントリが記録され、デーモンの stderr に一行のブレッドクラムが出力され、SSE バスによって標準的な `permission_resolved` キャンセルフレームがファンアウトされ、サブスクライバーによるクリーンアップが行われます。共有タイムアウトは `BridgeOptions.permissionResponseTimeoutMs` または `qwen serve --permission-response-timeout-ms` を通じて設定可能です。デフォルト値は `0` であるため、通常の権限と `ask_user_question` の両方とも、人間の判断を無期限に待ちます。投票者のキャンセル、セッションのキャンセル、切断時のクリーンアップ、およびデーモンのシャットダウンは、依然として保留中のインタラクションをキャンセル済みとして解決します。

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

- `{ "outcome": "selected", "optionId": "<one-of-the-options>" }` — 承認 / 拒否 / 一度だけ続行 / など、エージェントが提示した選択肢に従います
- `{ "outcome": "cancelled" }` — リクエストを破棄します（内部で `cancelSession` / `shutdown` が行う動作と同じです）

レスポンス:

- `200 {}` — あなたの投票は受け入れられました（解決済み OR コンセンサスクォーラムの下で記録済み）
- `400` — 不正な投票ボディ（`code`なし）、`invalid_client_id`、または選択されたオプションが提供されていない場合の `invalid_option_id`。同じ投票を再試行する代わりに、提供されたオプションを読み直してください
- `403 { "code": "permission_forbidden", "reason": "designated_mismatch" | "remote_not_allowed", "requestId", "sessionId" }` — F3: アクティブなポリシーがあなたの投票を拒否しました
- `404 { "error": "..." }` — requestId が不明です（すでに解決済み、存在しない、またはセッションが破棄されています）
- `500 { "code": "cancel_sentinel_collision", ... }` — F3: エージェントの `allowedOptionIds` に予約済みセンチネル `'__cancelled__'` が含まれています。エージェント/デーモンの契約違反です
- `501 { "code": "permission_policy_not_implemented", "policy": "<name>" }` — F3 前方互換性: ポリシーリテラルがスキーマに含まれていますが、その仲介者ブランチはまだビルドされていません（現在到達不能です。将来のポリシー用に予約されています）

投票成功後、接続されているすべてのクライアントは、同じ `requestId` と選択された `outcome` を持つ `permission_resolved` を確認します。`consensus` の下では、中間投票はクォーラムに達するまでさらに `permission_partial_vote` を送信します。

### 認証デバイスフロールート (issue #4175 PR 21)

デーモンは OAuth 2.0 デバイス認可グラント (RFC 8628) をブローカーとして機能し、リモート SDK クライアントがログインを開始できるようにします。トークンはクライアントではなく **デーモン** のファイルシステムに保存されます。デーモン自体が IdP をポーリングします。クライアントの役割は、検証 URL とユーザーコードを表示すること、および（オプションで）完了イベントのために SSE にサブスクライブすることのみです。

機能タグ: `auth_device_flow`（常に広告されます）。v1 でサポートされているプロバイダー: `qwen-oauth`。

> [!note]
>
> 新規連携では [**Qwen Account with Subscription**](https://chat.qwen.ai/?memberPlan=qwen_code&entry=qwen_code&paywallScene=cli) を使用してください。`GET /auth/subscription?paywallScene=cli` は購入用リンクを `plansUrl` として返します。ブラウザでのサインインは `POST /auth/subscription/flows?paywallScene=cli` で別途開始し、`GET /auth/subscription/flows/:id` をポーリングして `authorizationUrl` を取得します。
>
> Qwen OAuth の無料枠は 2026 年 4 月 15 日に終了しました。`qwen-oauth` は以下のルートで使用される従来の v1 プロバイダー識別子です。

**ランタイム局所性。** デーモンはブラウザを起動しません。たとえ可能であってもです。クライアントは `open(verificationUri)` をローカルで呼び出すかどうかを決定します。ヘッドレスポッド（標準的な Mode B デプロイメント）では、ユーザーはブラウザのある任意のデバイスで URL を開きます。推奨 UX については `docs/users/qwen-serve.md` を参照してください。

**イベントにおけるトークン漏洩なし。** `auth_device_flow_started` には `{deviceFlowId, providerId, expiresAt}` のみが含まれます。ユーザーコードと検証 URL は、POST 201 ボディ内でポイントツーポイントで返され、`GET /workspace/auth/device-flow/:id` 経由でも取得されます。これらが SSE でブロードキャストされることは決してありません。

**プロバイダーごとのシングルトン。** フローが保留中に同じプロバイダーに対して 2 回目の `POST` が発行された場合、これは冪等な引き継ぎとして扱われます。新しい IdP リクエストを開始するのではなく、`attached: true` を含む既存のエントリを返します。

#### `POST /workspace/auth/device-flow`

厳格なミューテーションゲート: トークンなしの信頼できるループバックプライマリリクエストは通過します。信頼できるループバック権限なしでゲートに到達したトークンなしのプライマリリクエストは `401 token_required` を受けます。設定された資格情報の欠落または無効、およびペアリングされていない Local Control 資格情報は、より早い段階で単純な `401 Unauthorized` で拒否されます。

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
  "verificationUri": "https://chat.qwen.ai/api/v1/oauth2/device?entry=qwen_code&paywallScene=cli",
  "verificationUriComplete": "https://chat.qwen.ai/api/v1/oauth2/device?user_code=USER-1&entry=qwen_code&paywallScene=cli",
  "expiresAt": 1700000600000,
  "intervalMs": 5000,
  "attached": false
}
```

エラー:

- `400 unsupported_provider` — 不明な `providerId` （レスポンスには `supportedProviders` が含まれます）
- `409 too_many_active_flows` — ワークスペース上限（4）に達しました。`DELETE` を使用して一つをキャンセルしてください
- `401 token_required` — 厳格なゲートが、信頼できるループバック権限のないトークンなしのプライマリリクエストを拒否しました
- `502 upstream_error` — IdP から予期しないエラーが返されました

#### `GET /workspace/auth/device-flow/:id`

現在の状態を読み取ります。保留中のエントリは `userCode/verificationUri/expiresAt/intervalMs` を反映します。終端のエントリ（5 分の猶予期間）はそれらを削除し、`status` + オプションの `errorKind/hint` を表示します。

不明な ID および猶予期間後に退避されたエントリに対しては `404 device_flow_not_found` を返します。

#### `DELETE /workspace/auth/device-flow/:id`

冪等なキャンセル:

- 保留中のエントリ → `204` + `auth_device_flow_cancelled` を送信
- 終端のエントリ → `204` no-op（イベントの再送信なし）
- 不明な ID → `404`

#### `GET /workspace/auth/status`

保留中のフロー + サポートされているプロバイダーのスナップショット:

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

5 つの型付きイベント（ワークスペーススコープ、すべてのアクティブなセッションバスへファンアウト）:

- `auth_device_flow_started` `{deviceFlowId, providerId, expiresAt}` — POST 成功; SDK は購読する必要がある (ここに userCode なし、必要に応じて GET で取得)
- `auth_device_flow_throttled` `{deviceFlowId, intervalMs}` — デーモンが上流の `slow_down` を尊重; GET をポーリングしているクライアントは間隔をそれに合わせて更新すべき
- `auth_device_flow_authorized` `{deviceFlowId, providerId, expiresAt?, accountAlias?}` — 認証情報が永続化された; `accountAlias` は非 PII ラベル (メール/電話ではない)
- `auth_device_flow_failed` `{deviceFlowId, errorKind, hint?}` — 終了状態; `errorKind` は `expired_token | access_denied | invalid_grant | upstream_error | persist_failed` のいずれか。`persist_failed` はデーモン内部: IdP 交換は成功したが、デーモンが認証情報を永続的に保存できなかった (EACCES / EROFS / ENOSPC)。ユーザーは根本的なディスク条件が修正されたら再試行すべき。
- `auth_device_flow_cancelled` `{deviceFlowId}` — 保留中のエントリに対する DELETE が成功

> **MCP 互換性なし。** MCP 認可仕様 (2025-06-18) は、リダイレクトコールバック付きの OAuth 2.1 + PKCE 認可コードフローを義務付けており、これはヘッドレスポッドのデーモンでは機能しない。モード B のデバイスフローインターフェースはデーモンプライベートであり、MCP 準拠サーバーを対象とするクライアントは別の認証パスを使用すべき。

### セッション添付ファイルチャンクアップロード

機能: `session_attachment_chunk_upload`。以下の 4 つのルートすべては、アクティブなセッションの実行時環境が所有するミューテーションである。これらは既存のベアラートークンとオプションの `X-Qwen-Client-Id` ヘッダーを使用する。アップロードは、作成元のセッションストアと正確なクライアント ID に属する。省略された ID は名前付きクライアントとは区別される。

`U = /session/:id/attachment-uploads` とする:

| リクエスト | ボディ | レスポンス |
| ---------------------------------- | ------------------------------------------------- | ------------------------------------------------------------------------------- |
| `POST U` | JSON `{ name, mimeType, size }`、最大 4 KiB | 201 `{ uploadId }` |
| `POST U/:uploadId/chunks?offset=N` | Raw `application/octet-stream`、最大 512 KiB | 200 `{ offset }`、次のバイトオフセット |
| `POST U/:uploadId/complete` | ボディ不要; JSON ボディは解析され無視される | 200 既存の添付ファイル参照 `{ type, attachmentId, mimeType, size }` |
| `DELETE U/:uploadId` | 空 | 受信中、失敗、または存在しないアップロードに対して 204; 完了中または完了済みに対して 409 |

最大の添付ファイルサイズは依然として 8 MiB である。メタデータは既存のファイル名/MIME ルールに従う; 空の画像ファイルは無効である。最後のチャンクには正確な余りを含め、連続した 512 KiB チャンクを送信すること。直前のチャンクのみ、同じオフセット、長さ、バイトで再試行できる。ギャップ、重複、変更された再試行、または早すぎる完了は 409 を返す; 不正な入力は 400、サイズ超過の入力は 413、サポートされていないチャンクメディアタイプまたは JSON 文字セットは 415 `invalid_attachment_upload_content_type` を返す。作成およびチャンクリクエストでのサポートされていないリクエストエンコーディングは 415 `invalid_attachment_upload_encoding` を返す。不明、期限切れ、または異なる所有者のアップロード ID は、3 つの POST ルートで 404 を返す; DELETE は存在しないアップロードに対して 204 を返し、完了中または完了後は 409 を返す。作成およびチャンクリクエストは圧縮ボディを受け付けない。完了ルートはグローバル JSON パーサーを使用するため、有効な圧縮 JSON ボディは無視される可能性があり、不正な JSON は完了前に拒否される。

完了処理は、ストレージの前と後にセッション/クライアント/実行時環境の所有権を検証する。並行または繰り返しの完了は、別の書き込みを行わずに同じ結果を返す。並行セッションコピーは一時的に `503 attachment_upload_store_busy` を `retryable: true` とともに返す; ステージングされたバイトは、コピー終了後も同じアップロード ID で完了するために利用可能である。実際のストレージ障害はそのアップロード ID に対して終端的なままとなる。受信中のアップロードは作成後 5 分で期限切れになる。成功/失敗レシートは 5 分後に期限切れになり、デーモンプロセスあたり最大 1024 個に制限される。セッションのクローズ/削除と最終的なクライアント登録解除は、未完了のアップロードを無効にする。読み取り、参照、またはコピーができるのは完了した添付ファイルのみである。DELETE はすでに確定中または完了した添付ファイルをロールバックできない; 応答喪失後も完了したファイルが残ることがある。

ステージングは、プロセス内のすべての実行時環境で合計 128 MiB および 32 個のアクティブアップロード、セッションストアあたり最大 8 個のアクティブアップロードに制限される。枯渇すると `429 attachment_upload_capacity_exceeded` を返す; 既存のリクエストレート制限も適用される。これはステージングバッファの制限であり、プロセス全体のメモリではない。一時的な ID はデーモンの再起動後も存続しない。

TypeScript SDK は、広告されている場合、512 KiB を超える添付ファイルに対してこのプロトコルを自動的に使用する。クライアントごとに 2 つの同時ファイルと連続チャンクを使用する。ACP トランスポートを使用する場合でも認証付き REST を使用し、有効なディスカバリーを 60 秒間キャッシュし、より小さいファイルや古いデーモン用に既存の raw エンドポイントを保持する。ネットワークエラー、リクエストタイムアウト、または 502/503/504 の後、追加/完了の再試行は最大 2 回行う; レート制限の再試行は 5 分の操作期限内で `Retry-After` を尊重する。曖昧な作成と容量不足による失敗は再試行されない。失敗したアップロードは、独立した 2 秒間のクリーンアップ試行を 1 回行う。`DaemonAttachmentUploadError` は原因と `httpStatus` を保持する; その `status` はアップロード内部の 404 を省略するため、コンシューマーがこれをサポートされていないレガシー添付ファイルルーティングと誤認することはない。

ライフサイクルと互換性の詳細については、[完全な設計](../design/session-attachment-chunk-upload.md) を参照。

### モデルカタログのリロード

`workspace_model_reload` 機能は `POST /workspaces/:workspace/models/reload` を広告する。この認証済み、信頼済み、選択された実行時環境のミューテーションは、ユーザーおよびワークスペーススコープの設定を再読み込みし、選択された実行時環境オーバーレイを更新し、モデルプロバイダー設定を再構築する前に ACP 子プロセスで環境を再適用する。環境の変更はプロバイダー認証情報をサポートし、他の環境キーを含むことができる; これらはレスポンスや設定イベントでは報告されない。デーモンプロセス環境とワークフローの有効化は変更されない。`{ "status": "applied" | "deferred" | "failed" }` を返す; `deferred` はアクティブな ACP 子がカタログを適用しなかったことを意味する。プラットフォームカタログを取得したり、設定を書き込んだり、アクティブな会話モデルを切り替えたり、設定イベントをブロードキャストしたりはしない。現在の選択可能なモデルを確認するには、その後に既存のセッションの `/session/:id/context` を読み取る; セッション作成前には、選択されたワークスペースのプロバイダーを読み取る。不明、信頼されていない、ドレイン中、または閉じた実行時環境はプライマリにフォールバックしない。

## ストリーミングワイヤーフォーマット

イベントは標準的な EventSource フレームとして送信される。デーモンはフレームごとに 1 つの `data:` 行を書き込む (JSON には `JSON.stringify` の後に埋め込まれた改行がない); `packages/sdk-typescript/src/daemon/sse.ts` の SDK パーサーは、受信側でこれと仕様が許可する複数の `data:` の両方を処理する。

## ストリーミング中のエラーフレーム

SSE サブスクライバーへのサービス中にブリッジイテレーターが例外をスローした場合、デーモンは終端的な `stream_error` フレームを出力する (`id` なし)。`data:` 行は完全なエンベロープである (このドキュメント内の他のすべての SSE フレームと同じ形状); 実際のエラーメッセージは `envelope.data.error` 以下にある:

```
event: stream_error
data: {"v":1,"type":"stream_error","data":{"error":"<message>"}}
```

その後、接続がクローズされる。

## 環境変数

| 変数 | 目的 |
| ------------------- | -------------------------------------------------------------- |
| `QWEN_SERVER_TOKEN` | Bearer トークン。起動時に前後の空白が除去されます。 |

## ソースレイアウト

| パス | 目的 |
| ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `packages/cli/src/commands/serve.ts` | yargs コマンド + フラグスキーマ |
| `packages/cli/src/serve/run-qwen-serve.ts` | リスナーライフサイクル + シグナルハンドリング |
| `packages/cli/src/serve/server.ts` | Express アプリのアセンブリ、ミドルウェア順序付け、および残りの直接ルート |
| `packages/cli/src/serve/routes/*.ts` | セッション、SSE、ワークスペース認証、ワークスペースステータス、ファイルルートを含む、焦点を絞った Express ルートグループ |
| `packages/cli/src/serve/auth.ts` | bearer + Host 許可リスト + CORS 拒否 |
| `packages/cli/src/serve/acp-session-bridge.ts` | spawn-or-attach、セッションごとの FIFO、権限レジストリ向けの CLI ローカルブリッジ互換ファサード |
| `packages/acp-bridge/src/status.ts` | 読み取り専用デーモンステータスのワイヤー型 + `ServeErrorKind` + `BridgeTimeoutError` + `mapDomainErrorToErrorKind` |
| `packages/cli/src/serve/env-snapshot.ts` | `process.*` の状態から `/workspace/env` ペイロードを構築する純粋なヘルパー（資格情報のマスキングを含む） |
| `packages/acp-bridge/src/eventBus.ts` | バウンド非同期キュー + リプレイリング |
| `packages/sdk-typescript/src/daemon/DaemonClient.ts` | TS クライアント |
| `packages/sdk-typescript/src/daemon/sse.ts` | EventSource フレームパーサー |
| `integration-tests/cli/qwen-serve-routes.test.ts` | 18 ケース、LLM なし |
| `integration-tests/cli/qwen-serve-streaming.test.ts` | 3 ケース、ローカル偽 OpenAI サーバーでバックアップされた実際の `qwen --acp` 子プロセス（POSIX のみ；Windows ではスキップ） |
