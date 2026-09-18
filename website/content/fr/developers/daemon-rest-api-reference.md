# Référence de l'API REST du démon

C'est l'interface REST/SSE publique pour les intégrations qui exécutent
`qwen serve --no-web` et fournissent leur propre interface utilisateur. Commencez par le
[guide d'intégration](./rest-api-integration.md), puis utilisez cette page pour la découverte
des endpoints et la [référence du protocole HTTP](./qwen-serve-protocol.md) pour
la sémantique détaillée du cycle de vie.

## OpenAPI

Le contrat de 25 opérations est disponible au format
[OpenAPI 3.1 JSON](https://raw.githubusercontent.com/QwenLM/qwen-code/main/docs/developers/daemon-rest-api.openapi.json).
Importez cette URL dans un moteur de rendu, un générateur de client ou un outil de validation
compatible OpenAPI. Le JSON versionné est le contrat d'interface portable pour les opérations
indexées ci-dessous et est validé par rapport au guide, aux en-têtes du protocole et aux routes
enregistrées dans le CI.

Cet index couvre un sous-ensemble principal de la surface REST du démon, pas la totalité.
En dehors se trouvent les routes Web Shell officielles, les surfaces internes conditionnelles
et d'autres routes publiques mais non essentielles : mutation de fichiers, enregistrement de
workspace, organisation et génération de sessions, ainsi que les MCP, skills et providers de
workspace entre autres. Ces surfaces sont annoncées par leurs propres tags de capacité ; la
[référence du protocole HTTP](./qwen-serve-protocol.md) documente les surfaces de session,
de statut de workspace et de fichiers, et la gestion des serveurs MCP, des providers
d'authentification et de la connexion par device-flow est couverte par les
[notes d'authentification et de sécurité du démon](./daemon/12-auth-security.md). Elles sont
en dehors de ce contrat, pas dépréciées.

## Lecture de l'index

- **Capability** est le tag de fonctionnalité à vérifier dans `GET /capabilities`. Un
  tiret cadratin signifie que l'opération n'a pas de tag de fonctionnalité dédié ; les clients
  qui doivent prendre en charge d'anciennes versions du démon doivent gérer `404`.
- **Scope** indique quel runtime possède l'opération. `process-global` lit l'état global du
  démon, `selected-runtime` utilise la sélection de workspace de la requête,
  `persisted-workspace` résout le stockage de session persisté, `live-session-owner` route par
  la session live, et `legacy-primary` cible toujours le workspace principal du démon.
  `GET /session/:id/export` est épinglé au primaire : il résout uniquement les runtimes
  internes gérés avant de basculer sur le workspace principal.
- Toutes les opérations de cet index sont **stables** dans le contrat REST v1. Le nom de
  capacité déprécié `unstable_session_resume` est uniquement un alias ; utilisez
  `session_resume` pour la route de reprise stable.

## Découverte

| Operation                                                        | Capability     | Scope            | TypeScript SDK              |
| ---------------------------------------------------------------- | -------------- | ---------------- | --------------------------- |
| [`GET /health`](./qwen-serve-protocol.md#get-health)             | `health`       | `process-global` | `DaemonClient.health`       |
| [`GET /capabilities`](./qwen-serve-protocol.md#get-capabilities) | `capabilities` | `process-global` | `DaemonClient.capabilities` |

## Cycle de vie de la session

| Operation                                                                         | Capability          | Scope                | TypeScript SDK                       |
| --------------------------------------------------------------------------------- | ------------------- | -------------------- | ------------------------------------ |
| [`POST /session`](./qwen-serve-protocol.md#post-session)                          | `session_create`    | `selected-runtime`   | `DaemonClient.createOrAttachSession` |
| [`POST /session/:id/load`](./qwen-serve-protocol.md#post-sessionidload)           | `session_load`      | `selected-runtime`   | `DaemonClient.loadSession`           |
| [`POST /session/:id/resume`](./qwen-serve-protocol.md#post-sessionidresume)       | `session_resume`    | `selected-runtime`   | `DaemonClient.resumeSession`         |
| [`POST /session/:id/heartbeat`](./qwen-serve-protocol.md#post-sessionidheartbeat) | `client_heartbeat`  | `live-session-owner` | `DaemonClient.heartbeat`             |
| [`PATCH /session/:id/metadata`](./qwen-serve-protocol.md#patch-sessionidmetadata) | `session_metadata`  | `live-session-owner` | `DaemonClient.updateSessionMetadata` |
| [`POST /session/:id/model`](./qwen-serve-protocol.md#post-sessionidmodel)         | `session_set_model` | `live-session-owner` | `DaemonClient.setSessionModel`       |
| [`DELETE /session/:id`](./qwen-serve-protocol.md#delete-sessionid)                | `session_close`     | `live-session-owner` | `DaemonClient.closeSession`          |

## Prompts et événements

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

`POST /session/:id/prompt` retourne `202` lorsque le prompt entre dans la file d'attente, pas
lorsque l'Agent termine. Abonnez-vous d'abord, puis corréléz `turn_complete` ou
`turn_error` par `promptId`.

## Permissions

| Operation                                                                                               | Capability                | Scope                | TypeScript SDK                            |
| ------------------------------------------------------------------------------------------------------- | ------------------------- | -------------------- | ----------------------------------------- |
| [`POST /session/:id/permission/:requestId`](./qwen-serve-protocol.md#post-sessionidpermissionrequestid) | `session_permission_vote` | `live-session-owner` | `DaemonClient.respondToSessionPermission` |
| [`POST /permission/:requestId`](./qwen-serve-protocol.md#post-permissionrequestid)                      | `permission_vote`         | `legacy-primary`     | `DaemonClient.respondToPermission`        |

Les nouvelles intégrations multi-workspace doivent toujours utiliser la route à portée de
session. La route héritée peut retourner le même `404` pour une requête appartenant à un
autre runtime que pour un vote déjà résolu.

## Contexte de workspace en lecture seule

| Operation                                                             | Capability             | Scope            | TypeScript SDK                        |
| --------------------------------------------------------------------- | ---------------------- | ---------------- | ------------------------------------- |
| [`GET /workspace/tools`](./qwen-serve-protocol.md#get-workspacetools) | —                      | `legacy-primary` | `DaemonClient.workspaceTools`         |
| [`GET /file`](./qwen-serve-protocol.md#get-file)                      | `workspace_file_read`  | `legacy-primary` | `DaemonClient.readWorkspaceFile`      |
| [`GET /file/bytes`](./qwen-serve-protocol.md#get-filebytes)           | `workspace_file_bytes` | `legacy-primary` | `DaemonClient.readWorkspaceFileBytes` |
| [`GET /stat`](./qwen-serve-protocol.md#get-stat)                      | `workspace_file_read`  | `legacy-primary` | `DaemonClient.fileStat`               |
| [`GET /list`](./qwen-serve-protocol.md#get-list)                      | `workspace_file_read`  | `legacy-primary` | `DaemonClient.dirList`                |
| [`GET /glob`](./qwen-serve-protocol.md#get-glob)                      | `workspace_file_read`  | `legacy-primary` | `DaemonClient.glob`                   |

Ces routes singulières ciblent le workspace principal. Les intégrations qui exposent plusieurs
workspaces enregistrés doivent utiliser les équivalents qualifiés par workspace documentés dans
le protocole complet et le preflight `workspace_qualified_rest_core`.

## APIs documentées supplémentaires

Les 25 opérations ci-dessus constituent le contrat d'intégration OpenAPI stable. Les
opérations suivantes complètent l'index des routes HTTP avec des sections de protocole
dédiées. Ce sont des surfaces v1 documentées, mais elles se situent en dehors de ce contrat
OpenAPI compact car elles sont conditionnelles, administratives, ou prennent principalement
en charge les clients internes. Il faut vérifier chaque capacité listée via un preflight et
considérer une capacité manquante comme une route indisponible. Une ligne groupée peut
contenir plusieurs opérations lorsqu'elles partagent la même propriété et une famille SDK.

| Zone                           | Opérations                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | Capacité et portée                                                                                                                                                                                                           | TypeScript SDK                                                                                                                                                                     |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| État de l'opérateur            | [`GET /daemon/status`](./qwen-serve-protocol.md#get-daemonstatus) · [`GET /brand`](./qwen-serve-protocol.md#get-brand)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | `daemon_status`, `web_shell_brand` ; process-global                                                                                                                                                                            | `DaemonClient.daemonStatus`, `DaemonClient.brand`                                                                                                                                  |
| Enregistrement de workspace    | [`POST /workspaces`](./qwen-serve-protocol.md#post-workspaces) · [`PATCH /workspaces/:workspace`](./qwen-serve-protocol.md#patch-workspacesworkspace) · [`DELETE /workspaces/:workspace`](./qwen-serve-protocol.md#delete-workspacesworkspace) · [`GET /workspace-registrations`](./qwen-serve-protocol.md#get-workspace-registrations) · [`DELETE /workspace-registrations/:id`](./qwen-serve-protocol.md#delete-workspace-registrationsid)                                                                                                                                                                                                                                                                                                                  | `dynamic_workspace_registration`, `persistent_workspace_registration`, `workspace_display_name`, `workspace_runtime_removal` ; process-global ou selected-runtime                                                               | `DaemonClient.addWorkspace`, `DaemonClient.updateWorkspace`, `WorkspaceDaemonClient.remove` ; les routes du magasin d'enregistrement utilisent du REST brut                                                |
| État runtime du workspace      | [`GET /workspace/mcp`](./qwen-serve-protocol.md#get-workspacemcp) · [`GET /workspace/skills`](./qwen-serve-protocol.md#get-workspaceskills) · [`GET /workspace/providers`](./qwen-serve-protocol.md#get-workspaceproviders) · [`GET /workspace/env`](./qwen-serve-protocol.md#get-workspaceenv) · [`GET /workspace/preflight`](./qwen-serve-protocol.md#get-workspacepreflight)                                                                                                                                                                                                                                                                                                                                                                               | `workspace_mcp`, `workspace_skills`, `workspace_providers`, `workspace_env`, `workspace_preflight` ; legacy-primary                                                                                                             | `DaemonClient.workspaceMcp`, `workspaceSkills`, `workspaceProviders`, `workspaceEnv`, `workspacePreflight`                                                                         |
| Mutation de fichiers           | [`POST /file/write`](./qwen-serve-protocol.md#post-filewrite) · [`POST /file/edit`](./qwen-serve-protocol.md#post-fileedit)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | `workspace_file_write` ; legacy-primary                                                                                                                                                                                         | `DaemonClient.writeWorkspaceFile`, `DaemonClient.editWorkspaceFile`                                                                                                                |
| Inspection de session et tâches | [`GET /session/:id/supported-commands`](./qwen-serve-protocol.md#get-sessionidsupported-commands) · [`GET /session/:id/tasks`](./qwen-serve-protocol.md#get-sessionidtasks) · [`POST /session/:id/tasks/:taskId/workflow-action`](./qwen-serve-protocol.md#post-sessionidtaskstaskidworkflow-action) · [`GET /session/:id/lsp`](./qwen-serve-protocol.md#get-sessionidlsp) · [`GET /session/:id/resources`](./qwen-serve-protocol.md#get-sessionidresources)                                                                                                                                                                                                                                                                                                  | `session_supported_commands`, `session_tasks`, `session_lsp`, `session_resources` ; live-session-owner                                                                                                                          | `DaemonClient.sessionSupportedCommands`, `sessionTasks`, `sessionWorkflowTaskAction`, `sessionLspStatus`, `sessionResources`                                                       |
| Historique qualifié par workspace | [`GET /workspaces/:workspace/session/:id/transcript`](./qwen-serve-protocol.md#get-workspacesworkspacesessionidtranscript) · [`GET /workspaces/:workspace/session/:id/export`](./qwen-serve-protocol.md#get-workspacesworkspacesessionidexport) · [`GET /workspaces/:workspace/session/:id/archive/export`](./qwen-serve-protocol.md#get-workspacesworkspacesessionidarchiveexport)                                                                                                                                                                                                                                                                                                                                                                           | `workspace_persisted_transcript`, `workspace_session_export`, `workspace_archived_session_export` ; persisted-workspace                                                                                                         | `WorkspaceDaemonClient.getSessionTranscriptPage`, `exportSession`, `exportArchivedSession`                                                                                         |
| Récupération de worktree       | [`POST /session/:id/worktree-reset`](./qwen-serve-protocol.md#post-sessionidworktree-reset)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | `session_worktree_reset_v1` ; live-session-owner                                                                                                                                                                                | `DaemonClient.resetWorktreeSession`                                                                                                                                                |
| Catalogue de sessions persistées | [`GET /workspace/:id/session-info`](./qwen-serve-protocol.md#get-workspaceidsession-info-and-get-workspacesworkspacesession-info) · [`GET /workspaces/:workspace/session-info`](./qwen-serve-protocol.md#get-workspaceidsession-info-and-get-workspacesworkspacesession-info) · [`GET /workspace/:id/sessions`](./qwen-serve-protocol.md#get-workspaceidsessions-and-get-workspacesworkspacesessions) · [`GET /workspaces/:workspace/sessions`](./qwen-serve-protocol.md#get-workspaceidsessions-and-get-workspacesworkspacesessions) · [`GET /workspaces/:workspace/sessions/live-state`](./qwen-serve-protocol.md#get-workspacesworkspacesessionslive-state)                                                                                                | `session_info`, `session_list`, `workspace_session_live_state` ; persisted-workspace                                                                                                                                            | `DaemonClient.getStandaloneSession`, `listWorkspaceSessions`, `getWorkspaceSessionLiveState`                                                                                       |
| Organisation de sessions       | [`GET /workspace/:id/session-groups`](./qwen-serve-protocol.md#get-workspaceidsession-groups) · [`POST /workspace/:id/session-groups`](./qwen-serve-protocol.md#post-workspaceidsession-groups) · [`PATCH /workspace/:id/session-groups/:groupId`](./qwen-serve-protocol.md#patch-workspaceidsession-groupsgroupid) · [`DELETE /workspace/:id/session-groups/:groupId`](./qwen-serve-protocol.md#delete-workspaceidsession-groupsgroupid) · [`PATCH /session/:id/organization`](./qwen-serve-protocol.md#patch-sessionidorganization-and-patch-workspacesworkspacesessionidorganization) · [`PATCH /workspaces/:workspace/session/:id/organization`](./qwen-serve-protocol.md#patch-sessionidorganization-and-patch-workspacesworkspacesessionidorganization) | `session_organization` ; legacy-primary ou persisted-workspace                                                                                                                                                                  | `DaemonClient.listSessionGroups`, `createSessionGroup`, `updateSessionGroup`, `deleteSessionGroup`, `updateSessionOrganization` ; `WorkspaceDaemonClient.updateSessionOrganization` |
| Modifications groupées de sessions persistées | [`POST /sessions/delete`](./qwen-serve-protocol.md#post-sessionsdelete) · [`POST /sessions/archive`](./qwen-serve-protocol.md#post-sessionsarchive) · [`POST /sessions/unarchive`](./qwen-serve-protocol.md#post-sessionsunarchive)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | `session_archive` ; legacy-primary                                                                                                                                                                                              | `DaemonClient.deleteSessionsData`, `archiveSessionsData`, `unarchiveSessionsData`                                                                                                  |
| Contrôles de session optionnels | [`POST /session/:id/recap`](./qwen-serve-protocol.md#post-sessionidrecap) · [`POST /session/:id/generate`](./qwen-serve-protocol.md#post-sessionidgenerate) · [`POST /session/:id/approval-mode`](./qwen-serve-protocol.md#post-sessionidapproval-mode)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | `session_recap`, `session_generation`, `session_approval_mode_control` ; live-session-owner                                                                                                                                     | `DaemonClient.recapSession`, REST brut pour la génération, `DaemonClient.setSessionApprovalMode`                                                                                        |
| Configuration de workspace     | [`POST /workspace/tools/:name/enable`](./qwen-serve-protocol.md#post-workspacetoolsnameenable) · [`POST /workspace/skills/:name/enable`](./qwen-serve-protocol.md#post-workspaceskillsnameenable) · [`POST /workspace/skills/enable`](./qwen-serve-protocol.md#post-workspaceskillsenable) · [`POST /workspace/init`](./qwen-serve-protocol.md#post-workspaceinit) · [`POST /workspace/mcp/reload`](./qwen-serve-protocol.md#post-workspacemcpreload) · [`POST /workspace/mcp/:server/restart`](./qwen-serve-protocol.md#post-workspacemcpserverrestart) · [`POST /language`](./qwen-serve-protocol.md#post-language)                                                                                                                                         | `workspace_tool_toggle`, `workspace_skill_settings_toggle`, `workspace_skill_settings_batch_toggle`, `workspace_init`, `workspace_mcp_manage`, `workspace_mcp_restart`, `user_language_sync` ; legacy-primary ou process-global | `DaemonClient.setWorkspaceToolEnabled`, `setWorkspaceSkillEnabled`, `setWorkspaceSkillsEnabled`, `initWorkspace`, `reloadWorkspaceMcp`, `restartMcpServer`, `setUserLanguage`      |
| Authentification par device-flow | [`POST /workspace/auth/device-flow`](./qwen-serve-protocol.md#post-workspaceauthdevice-flow) · [`GET /workspace/auth/device-flow/:id`](./qwen-serve-protocol.md#get-workspaceauthdevice-flowid) · [`DELETE /workspace/auth/device-flow/:id`](./qwen-serve-protocol.md#delete-workspaceauthdevice-flowid) · [`GET /workspace/auth/status`](./qwen-serve-protocol.md#get-workspaceauthstatus)                                                                                                                                                                                                                                                                                                                                                                   | `auth_device_flow` ; legacy-primary                                                                                                                                                                                             | `DaemonClient.startDeviceFlow`, `getDeviceFlow`, `cancelDeviceFlow`, `getAuthStatus`                                                                                               |

Les routes sans section de protocole dédiée sont intentionnellement absentes de cet
index. Il peut s'agir de mécanismes internes Web Shell ou de surfaces d'implémentation
conditionnelles, et leur omission ne les promeut pas au rang de contrat d'intégration.

## Règles de protocole communes

- Authentifiez les routes normales avec `Authorization: Bearer <token>`. Une sonde loopback
  `/health` par défaut peut être exemptée ; les liaisons non-loopback ne le sont pas.
- Envoyez `X-Qwen-Client-Id` lorsqu'une réponse de création/chargement en a fourni un. C'est
  un identifiant de rattachement et d'attribution, pas un principal de sécurité utilisateur.
- Considérez les corps d'erreur comme additifs. Branchez principalement sur le statut HTTP et
  le `code` stable ou `errorKind` lorsqu'ils sont présents.
- Préservez les en-têtes de réponse SSE et désactivez le buffering du proxy. Reprenez avec
  `Last-Event-ID` et `X-Qwen-Event-Epoch` lorsque le démon a fourni un epoch.
- Une limite de confiance de workspace n'est pas une isolation de tenant. Exécutez des démons
  séparés lorsque les principaux de sécurité ou les limites de défaillance au niveau processus
  doivent être indépendants.
