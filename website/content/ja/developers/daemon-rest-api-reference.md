# デーモン REST API リファレンス

これは `qwen serve --no-web` を実行して独自の UI を提供するインテグレーション向けの公開 REST/SSE インターフェースです。まず [インテグレーションガイド](./rest-api-integration.md) を確認し、その後このページでエンドポイントを調べ、[HTTP プロトコルリファレンス](./qwen-serve-protocol.md) で詳細なライフサイクルセマンティクスを参照してください。

## OpenAPI

25 操作の厳選されたコントラクトは [OpenAPI 3.1 JSON](https://raw.githubusercontent.com/QwenLM/qwen-code/main/docs/developers/daemon-rest-api.openapi.json) として利用可能です。この URL を OpenAPI 互換のレンダラー、クライアントジェネレーター、または検証ツールにインポートしてください。チェックインされた JSON は以下でインデックス化された操作のポータブルなインターフェースコントラクトであり、CI でガイド、プロトコル見出し、および登録済みルートに対して検証されています。

このインデックスはデーモンの REST サーフェスの厳選されたコアサブセットをカバーしており、すべてではありません。その外にはファーストパーティの Web Shell ルート、条件付きの内部サーフェス、およびその他の公開されているが非コアのルート——ファイル変更、ワークスペース登録、セッション整理と生成、ワークスペース MCP、スキル、プロバイダーなど——があります。これらのサーフェスは独自のケーパビリティタグで宣伝されており、[HTTP プロトコルリファレンス](./qwen-serve-protocol.md) にセッション、ワークスペースステータス、ファイルサーフェスがドキュメント化され、MCP サーバー管理、認証プロバイダー、デバイスフローサインインは [デーモン認証とセキュリティノート](./daemon/12-auth-security.md) でカバーされています。これらはこの契約の範囲外ですが、非推奨ではありません。

## インデックスの読み方

- **ケーパビリティ** は `GET /capabilities` で確認する機能タグです。ダッシュは操作に専用の機能タグがないことを意味します。古いデーモンビルドをサポートする必要があるクライアントは `404` を処理してください。
- **スコープ** はどのランタイムが操作を所有するかを示します。`process-global` はデーモン全体の状態を読み取り、`selected-runtime` はリクエストのワークスペース選択を使用し、`persisted-workspace` は永続化されたセッションストレージを解決し、`live-session-owner` はライブセッションでルーティングし、`legacy-primary` は常にデーモンのプライマリワークスペースをターゲットにします。`GET /session/:id/export` はプライマリ固定です。管理された内部ランタイムのみを解決し、その後プライマリワークスペースにフォールバックします。
- このインデックスのすべての操作は v1 REST コントラクトで **安定** です。非推奨の `unstable_session_resume` ケーパビリティ名は単なるエイリアスです。安定した resume ルートには `session_resume` を使用してください。

## Discovery

| Operation | Capability | Scope | TypeScript SDK |
| --- | --- | --- | --- |
| [`GET /health`](./qwen-serve-protocol.md#get-health) | `health` | `process-global` | `DaemonClient.health` |
| [`GET /capabilities`](./qwen-serve-protocol.md#get-capabilities) | `capabilities` | `process-global` | `DaemonClient.capabilities` |

## セッションライフサイクル

| Operation | Capability | Scope | TypeScript SDK |
| --- | --- | --- | --- |
| [`POST /session`](./qwen-serve-protocol.md#post-session) | `session_create` | `selected-runtime` | `DaemonClient.createOrAttachSession` |
| [`POST /session/:id/load`](./qwen-serve-protocol.md#post-sessionidload) | `session_load` | `selected-runtime` | `DaemonClient.loadSession` |
| [`POST /session/:id/resume`](./qwen-serve-protocol.md#post-sessionidresume) | `session_resume` | `selected-runtime` | `DaemonClient.resumeSession` |
| [`POST /session/:id/heartbeat`](./qwen-serve-protocol.md#post-sessionidheartbeat) | `client_heartbeat` | `live-session-owner` | `DaemonClient.heartbeat` |
| [`PATCH /session/:id/metadata`](./qwen-serve-protocol.md#patch-sessionidmetadata) | `session_metadata` | `live-session-owner` | `DaemonClient.updateSessionMetadata` |
| [`POST /session/:id/model`](./qwen-serve-protocol.md#post-sessionidmodel) | `session_set_model` | `live-session-owner` | `DaemonClient.setSessionModel` |
| [`DELETE /session/:id`](./qwen-serve-protocol.md#delete-sessionid) | `session_close` | `live-session-owner` | `DaemonClient.closeSession` |

## プロンプトとイベント

| Operation | Capability | Scope | TypeScript SDK |
| --- | --- | --- | --- |
| [`GET /session/:id/status`](./qwen-serve-protocol.md#get-sessionidstatus) | `session_status` | `live-session-owner` | `DaemonClient.sessionStatus` |
| [`POST /session/:id/prompt`](./qwen-serve-protocol.md#post-sessionidprompt) | `session_prompt` | `live-session-owner` | `DaemonClient.promptNonBlocking` |
| [`POST /session/:id/cancel`](./qwen-serve-protocol.md#post-sessionidcancel) | `session_cancel` | `live-session-owner` | `DaemonClient.cancel` |
| [`GET /session/:id/events`](./qwen-serve-protocol.md#get-sessionidevents-sse) | `session_events` | `live-session-owner` | `DaemonClient.subscribeEvents` |
| [`GET /session/:id/transcript`](./qwen-serve-protocol.md#get-sessionidtranscript) | `session_transcript` | `persisted-workspace` | `DaemonClient.getSessionTranscriptPage` |
| [`GET /session/:id/context`](./qwen-serve-protocol.md#get-sessionidcontext) | `session_context` | `live-session-owner` | `DaemonClient.sessionContext` |
| [`GET /session/:id/export`](./qwen-serve-protocol.md#get-sessionidexport) | `session_export` | `legacy-primary` | `DaemonClient.exportSession` |
| [`GET /session/:id/pending-prompts`](./qwen-serve-protocol.md#get-sessionidpending-prompts) | — | `live-session-owner` | `DaemonClient.getPendingPrompts` |

`POST /session/:id/prompt` はプロンプトがキューに入ると `202` を返します。エージェントが完了した時点ではありません。まずサブスクライブし、`promptId` で `turn_complete` または `turn_error` を関連付けます。

## 権限

| Operation | Capability | Scope | TypeScript SDK |
| --- | --- | --- | --- |
| [`POST /session/:id/permission/:requestId`](./qwen-serve-protocol.md#post-sessionidpermissionrequestid) | `session_permission_vote` | `live-session-owner` | `DaemonClient.respondToSessionPermission` |
| [`POST /permission/:requestId`](./qwen-serve-protocol.md#post-permissionrequestid) | `permission_vote` | `legacy-primary` | `DaemonClient.respondToPermission` |

新しいマルチワークスペースインテグレーションは常にセッションスコープのルートを使用してください。レガシールートは別のランタイムが所有するリクエストに対して、すでに解決済みの投票と同じ `404` を返す可能性があります。

## 読み取り専用ワークスペースコンテキスト

| Operation | Capability | Scope | TypeScript SDK |
| --- | --- | --- | --- |
| [`GET /workspace/tools`](./qwen-serve-protocol.md#get-workspacetools) | — | `legacy-primary` | `DaemonClient.workspaceTools` |
| [`GET /file`](./qwen-serve-protocol.md#get-file) | `workspace_file_read` | `legacy-primary` | `DaemonClient.readWorkspaceFile` |
| [`GET /file/bytes`](./qwen-serve-protocol.md#get-filebytes) | `workspace_file_bytes` | `legacy-primary` | `DaemonClient.readWorkspaceFileBytes` |
| [`GET /stat`](./qwen-serve-protocol.md#get-stat) | `workspace_file_read` | `legacy-primary` | `DaemonClient.fileStat` |
| [`GET /list`](./qwen-serve-protocol.md#get-list) | `workspace_file_read` | `legacy-primary` | `DaemonClient.dirList` |
| [`GET /glob`](./qwen-serve-protocol.md#get-glob) | `workspace_file_read` | `legacy-primary` | `DaemonClient.glob` |

これらの単一ルートはプライマリワークスペースをターゲットにします。複数の登録済みワークスペースを公開するインテグレーションは完全なプロトコルでドキュメント化されているワークスペース修飾の対照ルートを使用し、`workspace_qualified_rest_core` をプリフライトしてください。

## 共通プロトコルルール

- 通常のルートは `Authorization: Bearer <token>` で認証します。デフォルトのループバック `/health` プローブは免除される場合があります。非ループバックバインドは免除されません。
- 作成・ロードレスポンスで `X-Qwen-Client-Id` が提供された場合は送信してください。これは添付・属性識別子であり、エンドユーザーのセキュリティプリンシパルではありません。
- エラーボディは追加的なものとして扱います。主に HTTP ステータスと、存在する場合は安定した `code` または `errorKind` で分岐してください。
- SSE レスポンスヘッダーを保持し、プロキシバッファリングを無効にしてください。デーモンがエポックを提供した場合は `Last-Event-ID` と `X-Qwen-Event-Epoch` の両方で再開します。
- ワークスペースの信頼境界はテナント分離ではありません。セキュリティプリンシパルまたはプロセスレベルの障害境界を独立させる必要がある場合は別のデーモンを実行してください。