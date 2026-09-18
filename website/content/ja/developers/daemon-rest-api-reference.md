# デーモン REST API リファレンス

これは `qwen serve --no-web` を実行して独自の UI を提供するインテグレーション向けの公開 REST/SSE インターフェースです。まず [インテグレーションガイド](./rest-api-integration.md) を確認し、その後このページでエンドポイントを調べ、[HTTP プロトコルリファレンス](./qwen-serve-protocol.md) で詳細なライフサイクルセマンティクスを参照してください。

## OpenAPI

25 操作の厳選されたコントラクトは [OpenAPI 3.1 JSON](https://raw.githubusercontent.com/QwenLM/qwen-code/main/docs/developers/daemon-rest-api.openapi.json) として利用可能です。この URL を OpenAPI 互換のレンダラー、クライアントジェネレーター、または検証ツールにインポートしてください。チェックインされた JSON は以下でインデックス化された操作のポータブルなインターフェースコントラクトであり、CI でガイド、プロトコル見出し、および登録済みルートに対して検証されています。

このインデックスはデーモンの REST サーフェスの厳選されたコアサブセットをカバーしており、すべてではありません。その外にはファーストパーティの Web Shell ルート、条件付きの内部サーフェス、およびその他の公開されているが非コアのルート——ファイル変更、ワークスペース登録、セッション整理と生成、ワークスペース MCP、スキル、プロバイダーなど——があります。これらのサーフェスは独自のケーパビリティタグで宣伝されており、[HTTP プロトコルリファレンス](./qwen-serve-protocol.md) にセッション、ワークスペースステータス、ファイルサーフェスがドキュメント化され、MCP サーバー管理、認証プロバイダー、デバイスフローサインインは [デーモン認証とセキュリティノート](./daemon/12-auth-security.md) でカバーされています。これらはこの契約の範囲外ですが、非推奨ではありません。

## インデックスの読み方

- **ケーパビリティ** は `GET /capabilities` で確認する機能タグです。ダッシュは操作に専用の機能タグがないことを意味します。古いデーモンビルドをサポートする必要があるクライアントは `404` を処理してください。
- **スコープ** はどのランタイムが操作を所有するかを示します。`process-global` はデーモン全体の状態を読み取り、`selected-runtime` はリクエストのワークスペース選択を使用し、`persisted-workspace` は永続化されたセッションストレージを解決し、`live-session-owner` はライブセッションでルーティングし、`legacy-primary` は常にデーモンのプライマリワークスペースをターゲットにします。`GET /session/:id/export` はプライマリ固定です。管理された内部ランタイムのみを解決し、その後プライマリワークスペースにフォールバックします。
- このインデックスのすべての操作は v1 REST コントラクトで **安定** です。非推奨の `unstable_session_resume` ケーパビリティ名は単なるエイリアスです。安定した resume ルートには `session_resume` を使用してください。

## 検出

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

## 追加のドキュメント化された API

上記の 25 操作は安定した OpenAPI インテグレーション契約です。以下の操作は専用プロトコルセクションを持つ HTTP ルートのインデックスを完成させます。これらはドキュメント化された v1 サーフェスですが、条件付き、管理用、または主にファーストパーティクライアントをサポートするため、そのコンパクトな OpenAPI 契約の範囲外です。リストされたすべてのケーパビリティをプリフライトし、欠落しているケーパビリティは利用不可のルートとして扱ってください。グループ化された行は、所有権と SDK ファミリーを共有する場合に複数の操作を含むことがあります。

| 領域 | 操作 | ケーパビリティとスコープ | TypeScript SDK |
| --- | --- | --- | --- |
| オペレーター状態 | [`GET /daemon/status`](./qwen-serve-protocol.md#get-daemonstatus) · [`GET /brand`](./qwen-serve-protocol.md#get-brand) | `daemon_status`、`web_shell_brand`；process-global | `DaemonClient.daemonStatus`、`DaemonClient.brand` |
| ワークスペース登録 | [`POST /workspaces`](./qwen-serve-protocol.md#post-workspaces) · [`PATCH /workspaces/:workspace`](./qwen-serve-protocol.md#patch-workspacesworkspace) · [`DELETE /workspaces/:workspace`](./qwen-serve-protocol.md#delete-workspacesworkspace) · [`GET /workspace-registrations`](./qwen-serve-protocol.md#get-workspace-registrations) · [`DELETE /workspace-registrations/:id`](./qwen-serve-protocol.md#delete-workspace-registrationsid) | `dynamic_workspace_registration`、`persistent_workspace_registration`、`workspace_display_name`、`workspace_runtime_removal`；process-global または selected-runtime | `DaemonClient.addWorkspace`、`DaemonClient.updateWorkspace`、`WorkspaceDaemonClient.remove`；registration-store ルートは生 REST を使用 |
| ワークスペースランタイムステータス | [`GET /workspace/mcp`](./qwen-serve-protocol.md#get-workspacemcp) · [`GET /workspace/skills`](./qwen-serve-protocol.md#get-workspaceskills) · [`GET /workspace/providers`](./qwen-serve-protocol.md#get-workspaceproviders) · [`GET /workspace/env`](./qwen-serve-protocol.md#get-workspaceenv) · [`GET /workspace/preflight`](./qwen-serve-protocol.md#get-workspacepreflight) | `workspace_mcp`、`workspace_skills`、`workspace_providers`、`workspace_env`、`workspace_preflight`；legacy-primary | `DaemonClient.workspaceMcp`、`workspaceSkills`、`workspaceProviders`、`workspaceEnv`、`workspacePreflight` |
| ファイル変更 | [`POST /file/write`](./qwen-serve-protocol.md#post-filewrite) · [`POST /file/edit`](./qwen-serve-protocol.md#post-fileedit) | `workspace_file_write`；legacy-primary | `DaemonClient.writeWorkspaceFile`、`DaemonClient.editWorkspaceFile` |
| セッション検査とタスク | [`GET /session/:id/supported-commands`](./qwen-serve-protocol.md#get-sessionidsupported-commands) · [`GET /session/:id/tasks`](./qwen-serve-protocol.md#get-sessionidtasks) · [`POST /session/:id/tasks/:taskId/workflow-action`](./qwen-serve-protocol.md#post-sessionidtaskstaskidworkflow-action) · [`GET /session/:id/lsp`](./qwen-serve-protocol.md#get-sessionidlsp) · [`GET /session/:id/resources`](./qwen-serve-protocol.md#get-sessionidresources) | `session_supported_commands`、`session_tasks`、`session_lsp`、`session_resources`；live-session-owner | `DaemonClient.sessionSupportedCommands`、`sessionTasks`、`sessionWorkflowTaskAction`、`sessionLspStatus`、`sessionResources` |
| ワークスペース修飾の履歴 | [`GET /workspaces/:workspace/session/:id/transcript`](./qwen-serve-protocol.md#get-workspacesworkspacesessionidtranscript) · [`GET /workspaces/:workspace/session/:id/export`](./qwen-serve-protocol.md#get-workspacesworkspacesessionidexport) · [`GET /workspaces/:workspace/session/:id/archive/export`](./qwen-serve-protocol.md#get-workspacesworkspacesessionidarchiveexport) | `workspace_persisted_transcript`、`workspace_session_export`、`workspace_archived_session_export`；persisted-workspace | `WorkspaceDaemonClient.getSessionTranscriptPage`、`exportSession`、`exportArchivedSession` |
| ワークツリーリカバリー | [`POST /session/:id/worktree-reset`](./qwen-serve-protocol.md#post-sessionidworktree-reset) | `session_worktree_reset_v1`；live-session-owner | `DaemonClient.resetWorktreeSession` |
| 永続化セッションカタログ | [`GET /workspace/:id/session-info`](./qwen-serve-protocol.md#get-workspaceidsession-info-and-get-workspacesworkspacesession-info) · [`GET /workspaces/:workspace/session-info`](./qwen-serve-protocol.md#get-workspaceidsession-info-and-get-workspacesworkspacesession-info) · [`GET /workspace/:id/sessions`](./qwen-serve-protocol.md#get-workspaceidsessions-and-get-workspacesworkspacesessions) · [`GET /workspaces/:workspace/sessions`](./qwen-serve-protocol.md#get-workspaceidsessions-and-get-workspacesworkspacesessions) · [`GET /workspaces/:workspace/sessions/live-state`](./qwen-serve-protocol.md#get-workspacesworkspacesessionslive-state) | `session_info`、`session_list`、`workspace_session_live_state`；persisted-workspace | `DaemonClient.getStandaloneSession`、`listWorkspaceSessions`、`getWorkspaceSessionLiveState` |
| セッション整理 | [`GET /workspace/:id/session-groups`](./qwen-serve-protocol.md#get-workspaceidsession-groups) · [`POST /workspace/:id/session-groups`](./qwen-serve-protocol.md#post-workspaceidsession-groups) · [`PATCH /workspace/:id/session-groups/:groupId`](./qwen-serve-protocol.md#patch-workspaceidsession-groupsgroupid) · [`DELETE /workspace/:id/session-groups/:groupId`](./qwen-serve-protocol.md#delete-workspaceidsession-groupsgroupid) · [`PATCH /session/:id/organization`](./qwen-serve-protocol.md#patch-sessionidorganization-and-patch-workspacesworkspacesessionidorganization) · [`PATCH /workspaces/:workspace/session/:id/organization`](./qwen-serve-protocol.md#patch-sessionidorganization-and-patch-workspacesworkspacesessionidorganization) | `session_organization`；legacy-primary または persisted-workspace | `DaemonClient.listSessionGroups`、`createSessionGroup`、`updateSessionGroup`、`deleteSessionGroup`、`updateSessionOrganization`；`WorkspaceDaemonClient.updateSessionOrganization` |
| 永続化セッションの一括変更 | [`POST /sessions/delete`](./qwen-serve-protocol.md#post-sessionsdelete) · [`POST /sessions/archive`](./qwen-serve-protocol.md#post-sessionsarchive) · [`POST /sessions/unarchive`](./qwen-serve-protocol.md#post-sessionsunarchive) | `session_archive`；legacy-primary | `DaemonClient.deleteSessionsData`、`archiveSessionsData`、`unarchiveSessionsData` |
| オプションのセッションコントロール | [`POST /session/:id/recap`](./qwen-serve-protocol.md#post-sessionidrecap) · [`POST /session/:id/generate`](./qwen-serve-protocol.md#post-sessionidgenerate) · [`POST /session/:id/approval-mode`](./qwen-serve-protocol.md#post-sessionidapproval-mode) | `session_recap`、`session_generation`、`session_approval_mode_control`；live-session-owner | `DaemonClient.recapSession`、generation は生 REST、`DaemonClient.setSessionApprovalMode` |
| ワークスペース設定 | [`POST /workspace/tools/:name/enable`](./qwen-serve-protocol.md#post-workspacetoolsnameenable) · [`POST /workspace/skills/:name/enable`](./qwen-serve-protocol.md#post-workspaceskillsnameenable) · [`POST /workspace/skills/enable`](./qwen-serve-protocol.md#post-workspaceskillsenable) · [`POST /workspace/init`](./qwen-serve-protocol.md#post-workspaceinit) · [`POST /workspace/mcp/reload`](./qwen-serve-protocol.md#post-workspacemcpreload) · [`POST /workspace/mcp/:server/restart`](./qwen-serve-protocol.md#post-workspacemcpserverrestart) · [`POST /language`](./qwen-serve-protocol.md#post-language) | `workspace_tool_toggle`、`workspace_skill_settings_toggle`、`workspace_skill_settings_batch_toggle`、`workspace_init`、`workspace_mcp_manage`、`workspace_mcp_restart`、`user_language_sync`；legacy-primary または process-global | `DaemonClient.setWorkspaceToolEnabled`、`setWorkspaceSkillEnabled`、`setWorkspaceSkillsEnabled`、`initWorkspace`、`reloadWorkspaceMcp`、`restartMcpServer`、`setUserLanguage` |
| デバイスフロー認証 | [`POST /workspace/auth/device-flow`](./qwen-serve-protocol.md#post-workspaceauthdevice-flow) · [`GET /workspace/auth/device-flow/:id`](./qwen-serve-protocol.md#get-workspaceauthdevice-flowid) · [`DELETE /workspace/auth/device-flow/:id`](./qwen-serve-protocol.md#delete-workspaceauthdevice-flowid) · [`GET /workspace/auth/status`](./qwen-serve-protocol.md#get-workspaceauthstatus) | `auth_device_flow`；legacy-primary | `DaemonClient.startDeviceFlow`、`getDeviceFlow`、`cancelDeviceFlow`、`getAuthStatus` |

専用のプロトコルセクションがないルートは意図的にこのインデックスから除外されています。これらはファーストパーティの Web Shell の配管や条件付き実装サーフェスである可能性があり、省略によってインテグレーション契約に昇格されることはありません。

## 共通プロトコルルール

- 通常のルートは `Authorization: Bearer <token>` で認証します。デフォルトのループバック `/health` プローブは免除される場合があります。非ループバックバインドは免除されません。
- 作成・ロードレスポンスで `X-Qwen-Client-Id` が提供された場合は送信してください。これは添付・属性識別子であり、エンドユーザーのセキュリティプリンシパルではありません。
- エラーボディは追加的なものとして扱います。主に HTTP ステータスと、存在する場合は安定した `code` または `errorKind` で分岐してください。
- SSE レスポンスヘッダーを保持し、プロキシバッファリングを無効にしてください。デーモンがエポックを提供した場合は `Last-Event-ID` と `X-Qwen-Event-Epoch` の両方で再開します。
- ワークスペースの信頼境界はテナント分離ではありません。セキュリティプリンシパルまたはプロセスレベルの障害境界を独立させる必要がある場合は別のデーモンを実行してください。
