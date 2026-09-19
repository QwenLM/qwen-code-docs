# Справочник по REST API демона

Это публичный REST/SSE-интерфейс для интеграций, которые запускают
`qwen serve --no-web` и предоставляют собственный UI. Начните с
[руководства по интеграции](./rest-api-integration.md), затем используйте эту страницу
для обнаружения эндпоинтов, а [справочник по протоколу HTTP](./qwen-serve-protocol.md) —
для подробной семантики жизненного цикла.

## OpenAPI

Курируемый контракт из 25 операций доступен в формате
[OpenAPI 3.1 JSON](https://raw.githubusercontent.com/QwenLM/qwen-code/main/docs/developers/daemon-rest-api.openapi.json).
Импортируйте этот URL в OpenAPI-совместимый рендерер, генератор клиентов или
инструмент валидации. Зафиксированный JSON является переносимым контрактом
интерфейса для проиндексированных ниже операций и проверяется на соответствие
руководству, заголовкам протокола и зарегистрированным маршрутам в CI.

Этот индекс охватывает курируемое базовое подмножество REST-поверхности демона,
а не всю её целиком.
За пределами этого индекса остаются собственные маршруты Web Shell, условные
внутренние поверхности и другие публичные, но не базовые маршруты: мутация
файлов, регистрация рабочих пространств, организация и генерация сессий, а
также MCP рабочих пространств, навыки и провайдеры. Эти поверхности
объявляются собственными тегами возможностей;
[справочник по протоколу HTTP](./qwen-serve-protocol.md) документирует
поверхности сессий, статусов рабочих пространств и файлов, а управление
MCP-серверами, провайдеры аутентификации и вход через device-flow описаны в
[заметках по аутентификации и безопасности демона](./daemon/12-auth-security.md).
Они находятся за рамками данного контракта, а не устарели.

## Чтение индекса

- **Capability** — тег возможности для проверки в `GET /capabilities`. Тире
  означает, что у операции нет выделенного тега возможности; клиенты, которым нужна
  поддержка старых сборок демона, должны обрабатывать `404`.
- **Scope** указывает, какой runtime владеет операцией. `process-global` читает
  состояние демона в целом, `selected-runtime` использует выбор рабочего
  пространства из запроса, `persisted-workspace` разрешает сохранённое хранилище
  сессий, `live-session-owner` маршрутизирует по активной сессии, а
  `legacy-primary` всегда нацелен на основное рабочее пространство демона.
  `GET /session/:id/export` привязан к основному рабочему пространству: он
  разрешает только управляемые внутренние runtime, прежде чем вернуться к
  основному рабочему пространству.
- Все операции в этом индексе являются **стабильными** в контракте REST v1.
  Устаревшее имя возможности `unstable_session_resume` — только
  алиас; используйте `session_resume` для стабильного маршрута возобновления.

## Обнаружение

| Operation                                                        | Capability     | Scope            | TypeScript SDK              |
| ---------------------------------------------------------------- | -------------- | ---------------- | --------------------------- |
| [`GET /health`](./qwen-serve-protocol.md#get-health)             | `health`       | `process-global` | `DaemonClient.health`       |
| [`GET /capabilities`](./qwen-serve-protocol.md#get-capabilities) | `capabilities` | `process-global` | `DaemonClient.capabilities` |

## Жизненный цикл сессии

| Operation                                                                         | Capability          | Scope                | TypeScript SDK                       |
| --------------------------------------------------------------------------------- | ------------------- | -------------------- | ------------------------------------ |
| [`POST /session`](./qwen-serve-protocol.md#post-session)                          | `session_create`    | `selected-runtime`   | `DaemonClient.createOrAttachSession` |
| [`POST /session/:id/load`](./qwen-serve-protocol.md#post-sessionidload)           | `session_load`      | `selected-runtime`   | `DaemonClient.loadSession`           |
| [`POST /session/:id/resume`](./qwen-serve-protocol.md#post-sessionidresume)       | `session_resume`    | `selected-runtime`   | `DaemonClient.resumeSession`         |
| [`POST /session/:id/heartbeat`](./qwen-serve-protocol.md#post-sessionidheartbeat) | `client_heartbeat`  | `live-session-owner` | `DaemonClient.heartbeat`             |
| [`PATCH /session/:id/metadata`](./qwen-serve-protocol.md#patch-sessionidmetadata) | `session_metadata`  | `live-session-owner` | `DaemonClient.updateSessionMetadata` |
| [`POST /session/:id/model`](./qwen-serve-protocol.md#post-sessionidmodel)         | `session_set_model` | `live-session-owner` | `DaemonClient.setSessionModel`       |
| [`DELETE /session/:id`](./qwen-serve-protocol.md#delete-sessionid)                | `session_close`     | `live-session-owner` | `DaemonClient.closeSession`          |

## Промпты и события

| Operation                                                                                   | Capability           | Scope                 | TypeScript SDK                          |
| ------------------------------------------------------------------------------------------- | -------------------- | --------------------- | --------------------------------------- |
| [`GET /session/:id/status`](./qwen-serve-protocol.md#get-sessionidstatus)                   | `session_status`     | `live-session-owner`  | `DaemonClient.sessionStatus`            |
| [`POST /session/:id/prompt`](./qwen-serve-protocol.md#post-sessionidprompt)                 | `session_prompt`     | `live-session-owner`  | `DaemonClient.promptNonBlocking`        |
| [`POST /session/:id/cancel`](./qwen-serve-protocol.md#post-sessionidcancel)                 | `session_cancel`     | `live-session-owner`  | `DaemonClient.cancel`                   |
| [`GET /session/:id/events`](./qwen-serve-protocol.md#get-sessionidevents-sse)               | `session_events`     | `live-session-owner`  | `DaemonClient.subscribeEvents`          |
| [`GET /session/:id/transcript`](./qwen-serve-protocol.md#get-sessionidtranscript)           | `session_transcript` | `persisted-workspace` | `DaemonClient.getSessionTranscriptPage` |
| [`GET /session/:id/context`](./qwen-serve-protocol.md#get-sessionidcontext)                 | `session_context`    | `live-session-owner`  | `DaemonClient.sessionContext`           |
| [`GET /session/:id/export`](./qwen-serve-protocol.md#get-sessionidexport)                   | `session_export`     | `legacy-primary`      | `DaemonClient.exportSession`            |
| [`GET /session/:id/pending-prompts`](./qwen-serve-protocol.md#get-sessionidpending-prompts) | —                    | `live-session-owner`  | `DaemonClient.getPendingPrompts`        |

`POST /session/:id/prompt` возвращает `202`, когда промпт поступает в очередь, а
не когда Агент завершает работу. Сначала подпишитесь, затем сопоставляйте
`turn_complete` или `turn_error` по `promptId`.

## Разрешения

| Operation                                                                                               | Capability                | Scope                | TypeScript SDK                            |
| ------------------------------------------------------------------------------------------------------- | ------------------------- | -------------------- | ----------------------------------------- |
| [`POST /session/:id/permission/:requestId`](./qwen-serve-protocol.md#post-sessionidpermissionrequestid) | `session_permission_vote` | `live-session-owner` | `DaemonClient.respondToSessionPermission` |
| [`POST /permission/:requestId`](./qwen-serve-protocol.md#post-permissionrequestid)                      | `permission_vote`         | `legacy-primary`     | `DaemonClient.respondToPermission`        |

Новые интеграции с несколькими рабочими пространствами всегда должны использовать
маршрут с областью действия сессии. Устаревший маршрут может вернуть тот же
`404` для запроса, принадлежащего другому runtime, как и для уже разрешённого
голосования.

## Дополнительные документированные API

25 операций выше составляют стабильный контракт интеграции OpenAPI.
Следующие операции завершают индекс HTTP-маршрутов с выделенными разделами
протокола. Это документированные поверхности v1, но они находятся за рамками
компактного контракта OpenAPI, поскольку являются условными,
административными или в основном обслуживают клиентов от первой стороны.
Выполняйте preflight каждой перечисленной возможности и рассматривайте
отсутствующую возможность как недоступный маршрут. Сгруппированная строка
может содержать несколько операций, если они имеют общего владельца и
семейство SDK.

| Area                           | Operations                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | Capability and scope                                                                                                                                                                                                           | TypeScript SDK                                                                                                                                                                     |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Operator state                 | [`GET /daemon/status`](./qwen-serve-protocol.md#get-daemonstatus) · [`GET /brand`](./qwen-serve-protocol.md#get-brand)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | `daemon_status`, `web_shell_brand`; process-global                                                                                                                                                                             | `DaemonClient.daemonStatus`, `DaemonClient.brand`                                                                                                                                  |
| Workspace registration         | [`POST /workspaces`](./qwen-serve-protocol.md#post-workspaces) · [`PATCH /workspaces/:workspace`](./qwen-serve-protocol.md#patch-workspacesworkspace) · [`DELETE /workspaces/:workspace`](./qwen-serve-protocol.md#delete-workspacesworkspace) · [`GET /workspace-registrations`](./qwen-serve-protocol.md#get-workspace-registrations) · [`DELETE /workspace-registrations/:id`](./qwen-serve-protocol.md#delete-workspace-registrationsid)                                                                                                                                                                                                                                                                                                                  | `dynamic_workspace_registration`, `persistent_workspace_registration`, `workspace_display_name`, `workspace_runtime_removal`; process-global or selected-runtime                                                               | `DaemonClient.addWorkspace`, `DaemonClient.updateWorkspace`, `WorkspaceDaemonClient.remove`; registration-store routes use raw REST                                                |
| Workspace runtime status       | [`GET /workspace/mcp`](./qwen-serve-protocol.md#get-workspacemcp) · [`GET /workspace/skills`](./qwen-serve-protocol.md#get-workspaceskills) · [`GET /workspace/providers`](./qwen-serve-protocol.md#get-workspaceproviders) · [`GET /workspace/env`](./qwen-serve-protocol.md#get-workspaceenv) · [`GET /workspace/preflight`](./qwen-serve-protocol.md#get-workspacepreflight)                                                                                                                                                                                                                                                                                                                                                                               | `workspace_mcp`, `workspace_skills`, `workspace_providers`, `workspace_env`, `workspace_preflight`; legacy-primary                                                                                                             | `DaemonClient.workspaceMcp`, `workspaceSkills`, `workspaceProviders`, `workspaceEnv`, `workspacePreflight`                                                                         |
| File mutation                  | [`POST /file/write`](./qwen-serve-protocol.md#post-filewrite) · [`POST /file/edit`](./qwen-serve-protocol.md#post-fileedit)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | `workspace_file_write`; legacy-primary                                                                                                                                                                                         | `DaemonClient.writeWorkspaceFile`, `DaemonClient.editWorkspaceFile`                                                                                                                |
| Session inspection and tasks   | [`GET /session/:id/supported-commands`](./qwen-serve-protocol.md#get-sessionidsupported-commands) · [`GET /session/:id/tasks`](./qwen-serve-protocol.md#get-sessionidtasks) · [`POST /session/:id/tasks/:taskId/workflow-action`](./qwen-serve-protocol.md#post-sessionidtaskstaskidworkflow-action) · [`GET /session/:id/lsp`](./qwen-serve-protocol.md#get-sessionidlsp) · [`GET /session/:id/resources`](./qwen-serve-protocol.md#get-sessionidresources)                                                                                                                                                                                                                                                                                                  | `session_supported_commands`, `session_tasks`, `session_lsp`, `session_resources`; live-session-owner                                                                                                                          | `DaemonClient.sessionSupportedCommands`, `sessionTasks`, `sessionWorkflowTaskAction`, `sessionLspStatus`, `sessionResources`                                                       |
| Workspace-qualified history    | [`GET /workspaces/:workspace/session/:id/transcript`](./qwen-serve-protocol.md#get-workspacesworkspacesessionidtranscript) · [`GET /workspaces/:workspace/session/:id/export`](./qwen-serve-protocol.md#get-workspacesworkspacesessionidexport) · [`GET /workspaces/:workspace/session/:id/archive/export`](./qwen-serve-protocol.md#get-workspacesworkspacesessionidarchiveexport)                                                                                                                                                                                                                                                                                                                                                                           | `workspace_persisted_transcript`, `workspace_session_export`, `workspace_archived_session_export`; persisted-workspace                                                                                                         | `WorkspaceDaemonClient.getSessionTranscriptPage`, `exportSession`, `exportArchivedSession`                                                                                         |
| Worktree recovery              | [`POST /session/:id/worktree-reset`](./qwen-serve-protocol.md#post-sessionidworktree-reset)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | `session_worktree_reset_v1`; live-session-owner                                                                                                                                                                                | `DaemonClient.resetWorktreeSession`                                                                                                                                                |
| Persisted session catalog      | [`GET /workspace/:id/session-info`](./qwen-serve-protocol.md#get-workspaceidsession-info-and-get-workspacesworkspacesession-info) · [`GET /workspaces/:workspace/session-info`](./qwen-serve-protocol.md#get-workspaceidsession-info-and-get-workspacesworkspacesession-info) · [`GET /workspace/:id/sessions`](./qwen-serve-protocol.md#get-workspaceidsessions-and-get-workspacesworkspacesessions) · [`GET /workspaces/:workspace/sessions`](./qwen-serve-protocol.md#get-workspaceidsessions-and-get-workspacesworkspacesessions) · [`GET /workspaces/:workspace/sessions/live-state`](./qwen-serve-protocol.md#get-workspacesworkspacesessionslive-state)                                                                                                | `session_info`, `session_list`, `workspace_session_live_state`; persisted-workspace                                                                                                                                            | `DaemonClient.getStandaloneSession`, `listWorkspaceSessions`, `getWorkspaceSessionLiveState`                                                                                       |
| Session organization           | [`GET /workspace/:id/session-groups`](./qwen-serve-protocol.md#get-workspaceidsession-groups) · [`POST /workspace/:id/session-groups`](./qwen-serve-protocol.md#post-workspaceidsession-groups) · [`PATCH /workspace/:id/session-groups/:groupId`](./qwen-serve-protocol.md#patch-workspaceidsession-groupsgroupid) · [`DELETE /workspace/:id/session-groups/:groupId`](./qwen-serve-protocol.md#delete-workspaceidsession-groupsgroupid) · [`PATCH /session/:id/organization`](./qwen-serve-protocol.md#patch-sessionidorganization-and-patch-workspacesworkspacesessionidorganization) · [`PATCH /workspaces/:workspace/session/:id/organization`](./qwen-serve-protocol.md#patch-sessionidorganization-and-patch-workspacesworkspacesessionidorganization) | `session_organization`; legacy-primary or persisted-workspace                                                                                                                                                                  | `DaemonClient.listSessionGroups`, `createSessionGroup`, `updateSessionGroup`, `deleteSessionGroup`, `updateSessionOrganization`; `WorkspaceDaemonClient.updateSessionOrganization` |
| Bulk persisted-session changes | [`POST /sessions/delete`](./qwen-serve-protocol.md#post-sessionsdelete) · [`POST /sessions/archive`](./qwen-serve-protocol.md#post-sessionsarchive) · [`POST /sessions/unarchive`](./qwen-serve-protocol.md#post-sessionsunarchive)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | `session_archive`; legacy-primary                                                                                                                                                                                              | `DaemonClient.deleteSessionsData`, `archiveSessionsData`, `unarchiveSessionsData`                                                                                                  |
| Optional session controls      | [`POST /session/:id/recap`](./qwen-serve-protocol.md#post-sessionidrecap) · [`POST /session/:id/generate`](./qwen-serve-protocol.md#post-sessionidgenerate) · [`POST /session/:id/approval-mode`](./qwen-serve-protocol.md#post-sessionidapproval-mode)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | `session_recap`, `session_generation`, `session_approval_mode_control`; live-session-owner                                                                                                                                     | `DaemonClient.recapSession`, raw REST for generation, `DaemonClient.setSessionApprovalMode`                                                                                        |
| Workspace configuration        | [`POST /workspace/tools/:name/enable`](./qwen-serve-protocol.md#post-workspacetoolsnameenable) · [`POST /workspace/skills/:name/enable`](./qwen-serve-protocol.md#post-workspaceskillsnameenable) · [`POST /workspace/skills/enable`](./qwen-serve-protocol.md#post-workspaceskillsenable) · [`POST /workspace/init`](./qwen-serve-protocol.md#post-workspaceinit) · [`POST /workspace/mcp/reload`](./qwen-serve-protocol.md#post-workspacemcpreload) · [`POST /workspace/mcp/:server/restart`](./qwen-serve-protocol.md#post-workspacemcpserverrestart) · [`POST /language`](./qwen-serve-protocol.md#post-language)                                                                                                                                         | `workspace_tool_toggle`, `workspace_skill_settings_toggle`, `workspace_skill_settings_batch_toggle`, `workspace_init`, `workspace_mcp_manage`, `workspace_mcp_restart`, `user_language_sync`; legacy-primary or process-global | `DaemonClient.setWorkspaceToolEnabled`, `setWorkspaceSkillEnabled`, `setWorkspaceSkillsEnabled`, `initWorkspace`, `reloadWorkspaceMcp`, `restartMcpServer`, `setUserLanguage`      |
| Device-flow authentication     | [`POST /workspace/auth/device-flow`](./qwen-serve-protocol.md#post-workspaceauthdevice-flow) · [`GET /workspace/auth/device-flow/:id`](./qwen-serve-protocol.md#get-workspaceauthdevice-flowid) · [`DELETE /workspace/auth/device-flow/:id`](./qwen-serve-protocol.md#delete-workspaceauthdevice-flowid) · [`GET /workspace/auth/status`](./qwen-serve-protocol.md#get-workspaceauthstatus)                                                                                                                                                                                                                                                                                                                                                                   | `auth_device_flow`; legacy-primary                                                                                                                                                                                             | `DaemonClient.startDeviceFlow`, `getDeviceFlow`, `cancelDeviceFlow`, `getAuthStatus`                                                                                               |

Маршруты без выделенного раздела протокола намеренно отсутствуют в этом
индексе. Они могут быть внутренней механикой Web Shell от первой стороны или
условными поверхностями реализации и не.promoteются в контракт интеграции
фактом их пропуска.

## Контекст рабочего пространства только для чтения

| Operation                                                             | Capability             | Scope            | TypeScript SDK                        |
| --------------------------------------------------------------------- | ---------------------- | ---------------- | ------------------------------------- |
| [`GET /workspace/tools`](./qwen-serve-protocol.md#get-workspacetools) | —                      | `legacy-primary` | `DaemonClient.workspaceTools`         |
| [`GET /file`](./qwen-serve-protocol.md#get-file)                      | `workspace_file_read`  | `legacy-primary` | `DaemonClient.readWorkspaceFile`      |
| [`GET /file/bytes`](./qwen-serve-protocol.md#get-filebytes)           | `workspace_file_bytes` | `legacy-primary` | `DaemonClient.readWorkspaceFileBytes` |
| [`GET /stat`](./qwen-serve-protocol.md#get-stat)                      | `workspace_file_read`  | `legacy-primary` | `DaemonClient.fileStat`               |
| [`GET /list`](./qwen-serve-protocol.md#get-list)                      | `workspace_file_read`  | `legacy-primary` | `DaemonClient.dirList`                |
| [`GET /glob`](./qwen-serve-protocol.md#get-glob)                      | `workspace_file_read`  | `legacy-primary` | `DaemonClient.glob`                   |

Эти единичные маршруты нацелены на основное рабочее пространство. Интеграции,
предоставляющие доступ к нескольким зарегистрированным рабочим пространствам,
должны использовать квалифицированные по рабочему пространству аналоги,
описанные в полном протоколе и preflight `workspace_qualified_rest_core`.

## Общие правила протокола

- Аутентифицируйте обычные маршруты с помощью `Authorization: Bearer <token>`.
  Стандартный loopback-зонд `/health` может быть освобождён; привязки не к
  loopback не освобождаются.
- Отправляйте `X-Qwen-Client-Id`, если ответ create/load предоставил его. Это
  идентификатор привязки и атрибуции, а не принципал безопасности конечного
  пользователя.
- Рассматривайте тела ошибок как дополнения. Ветвитесь преимущественно по
  HTTP-статусу и стабильным `code` или `errorKind`, если они присутствуют.
- Сохраняйте заголовки ответов SSE и отключайте буферизацию прокси. Возобновляйте
  с помощью `Last-Event-ID` и `X-Qwen-Event-Epoch`, если демон предоставил
  эпоху.
- Граница доверия рабочего пространства — это не изоляция арендаторов. Запускайте
  отдельные демоны, когда принципалы безопасности или границы сбоев на уровне
  процессов должны быть независимы.
