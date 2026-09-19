# Daemon-REST-API-Referenz

Dies ist die öffentliche REST/SSE-Schnittstelle für Integrationen, die
`qwen serve --no-web` ausführen und eine eigene UI bereitstellen. Beginnen Sie mit dem
[Integrationsleitfaden](./rest-api-integration.md), verwenden Sie dann diese Seite für die Endpunkt-
Erkundung und die [HTTP-Protokollreferenz](./qwen-serve-protocol.md) für
detaillierte Lebenszyklus-Semantik.

## OpenAPI

Der kuratierte 25-Operation-Vertrag ist als
[OpenAPI 3.1 JSON](https://raw.githubusercontent.com/QwenLM/qwen-code/main/docs/developers/daemon-rest-api.openapi.json) verfügbar.
Importieren Sie diese URL in einen OpenAPI-kompatiblen Renderer, Client-Generator oder
Validierungstool. Das eingecheckte JSON ist der portable Schnittstellenvertrag für die
unten indizierten Operationen und wird im CI gegen den Leitfaden, die Protokoll-Überschriften
und die registrierten Routen validiert.

Dieser Index deckt eine kuratierte Kern-Teilmenge der REST-Oberfläche des Daemons ab, nicht
alles.
Außerhalb befinden sich die erstklassigen WebShell-Routen, bedingte interne Oberflächen
und andere öffentliche, aber nicht zum Kern gehörende Routen: Datei-Mutation, Workspace-Registrierung,
Session-Organisation und -Generierung sowie Workspace-MCP, Skills und Provider
unter anderem. Diese Oberflächen werden durch ihre eigenen Capability-Tags gekennzeichnet; die
[HTTP-Protokollreferenz](./qwen-serve-protocol.md) dokumentiert die Session-,
Workspace-Status- und Datei-Oberflächen, und MCP-Server-Verwaltung, Auth-Provider
und Device-Flow-Anmeldung werden in den
[Daemon-Auth- und Sicherheitshinweisen](./daemon/12-auth-security.md) behandelt. Sie sind außerhalb
dieses Vertrags, nicht deprecated.

## Den Index lesen

- **Capability** ist das Feature-Tag, das in `GET /capabilities` geprüft werden soll. Ein
  Gedankenstrich bedeutet, dass die Operation kein eigenes Feature-Tag hat; Clients, die
  ältere Daemon-Builds unterstützen müssen, sollten `404` behandeln.
- **Scope** gibt an, welche Runtime die Operation besitzt. `process-global` liest
  Daemon-weiten Zustand, `selected-runtime` verwendet die Workspace-Auswahl der Anfrage,
  `persisted-workspace` löst persistierte Session-Speicher auf, `live-session-owner`
  routet über die Live-Session, und `legacy-primary` zielt immer auf den primären Workspace des Daemons.
  `GET /session/:id/export` ist primär-angeheftet: es löst
  nur verwaltete interne Runtimes auf, bevor es auf den primären Workspace zurückfällt.
- Alle Operationen in diesem Index sind im v1-REST-Vertrag **stabil**. Der
  deprecated Capability-Name `unstable_session_resume` ist nur ein Alias; verwenden Sie
  `session_resume` für die stabile Resume-Route.

## Discovery

| Operation                                                        | Capability     | Scope            | TypeScript SDK              |
| ---------------------------------------------------------------- | -------------- | ---------------- | --------------------------- |
| [`GET /health`](./qwen-serve-protocol.md#get-health)             | `health`       | `process-global` | `DaemonClient.health`       |
| [`GET /capabilities`](./qwen-serve-protocol.md#get-capabilities) | `capabilities` | `process-global` | `DaemonClient.capabilities` |

## Session-Lebenszyklus

| Operation                                                                         | Capability          | Scope                | TypeScript SDK                       |
| --------------------------------------------------------------------------------- | ------------------- | -------------------- | ------------------------------------ |
| [`POST /session`](./qwen-serve-protocol.md#post-session)                          | `session_create`    | `selected-runtime`   | `DaemonClient.createOrAttachSession` |
| [`POST /session/:id/load`](./qwen-serve-protocol.md#post-sessionidload)           | `session_load`      | `selected-runtime`   | `DaemonClient.loadSession`           |
| [`POST /session/:id/resume`](./qwen-serve-protocol.md#post-sessionidresume)       | `session_resume`    | `selected-runtime`   | `DaemonClient.resumeSession`         |
| [`POST /session/:id/heartbeat`](./qwen-serve-protocol.md#post-sessionidheartbeat) | `client_heartbeat`  | `live-session-owner` | `DaemonClient.heartbeat`             |
| [`PATCH /session/:id/metadata`](./qwen-serve-protocol.md#patch-sessionidmetadata) | `session_metadata`  | `live-session-owner` | `DaemonClient.updateSessionMetadata` |
| [`POST /session/:id/model`](./qwen-serve-protocol.md#post-sessionidmodel)         | `session_set_model` | `live-session-owner` | `DaemonClient.setSessionModel`       |
| [`DELETE /session/:id`](./qwen-serve-protocol.md#delete-sessionid)                | `session_close`     | `live-session-owner` | `DaemonClient.closeSession`          |

## Prompts und Events

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

`POST /session/:id/prompt` gibt `202` zurück, wenn der Prompt die Warteschlange betritt, nicht
wenn der Agent fertig ist. Abonnieren Sie zuerst, dann korrelieren Sie `turn_complete` oder
`turn_error` über `promptId`.

## Berechtigungen

| Operation                                                                                               | Capability                | Scope                | TypeScript SDK                            |
| ------------------------------------------------------------------------------------------------------- | ------------------------- | -------------------- | ----------------------------------------- |
| [`POST /session/:id/permission/:requestId`](./qwen-serve-protocol.md#post-sessionidpermissionrequestid) | `session_permission_vote` | `live-session-owner` | `DaemonClient.respondToSessionPermission` |
| [`POST /permission/:requestId`](./qwen-serve-protocol.md#post-permissionrequestid)                      | `permission_vote`         | `legacy-primary`     | `DaemonClient.respondToPermission`        |

Neue Multi-Workspace-Integrationen sollten immer die Session-scoped Route verwenden.
Die Legacy-Route kann für eine Anfrage, die einer anderen
Runtime gehört, denselben `404` zurückgeben wie für eine bereits aufgelöste Abstimmung.

## Schreibgeschützter Workspace-Kontext

| Operation                                                             | Capability             | Scope            | TypeScript SDK                        |
| --------------------------------------------------------------------- | ---------------------- | ---------------- | ------------------------------------- |
| [`GET /workspace/tools`](./qwen-serve-protocol.md#get-workspacetools) | —                      | `legacy-primary` | `DaemonClient.workspaceTools`         |
| [`GET /file`](./qwen-serve-protocol.md#get-file)                      | `workspace_file_read`  | `legacy-primary` | `DaemonClient.readWorkspaceFile`      |
| [`GET /file/bytes`](./qwen-serve-protocol.md#get-filebytes)           | `workspace_file_bytes` | `legacy-primary` | `DaemonClient.readWorkspaceFileBytes` |
| [`GET /stat`](./qwen-serve-protocol.md#get-stat)                      | `workspace_file_read`  | `legacy-primary` | `DaemonClient.fileStat`               |
| [`GET /list`](./qwen-serve-protocol.md#get-list)                      | `workspace_file_read`  | `legacy-primary` | `DaemonClient.dirList`                |
| [`GET /glob`](./qwen-serve-protocol.md#get-glob)                      | `workspace_file_read`  | `legacy-primary` | `DaemonClient.glob`                   |

Diese singulären Routen zielen auf den primären Workspace. Integrationen, die
mehrere registrierte Workspaces bereitstellen, sollten die Workspace-qualifizierten Gegenstücke
verwenden, die im vollständigen Protokoll dokumentiert sind, und `workspace_qualified_rest_core` vorab prüfen.

## Zusätzlich dokumentierte APIs

Die 25 Operationen oben sind der stabile OpenAPI-Integrationsvertrag. Die
folgenden Operationen vervollständigen den Index der HTTP-Routen mit eigenen Protokoll-
Abschnitten. Es sind dokumentierte v1-Oberflächen, aber sie liegen außerhalb dieses kompakten
OpenAPI-Vertrags, weil sie konditional, administrativ oder primär zur Unterstützung
von Erstanbieter-Clients sind. Preflighten Sie jede aufgeführte Capability und behandeln Sie
fehlende Capabilities als nicht verfügbare Routen. Eine gruppierte Zeile kann mehrere
Operationen enthalten, wenn sie Ownership und eine SDK-Familie teilen.

| Bereich                          | Operationen                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | Capability und Scope                                                                                                                                                                                                           | TypeScript SDK                                                                                                                                                                     |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Operator-Zustand                 | [`GET /daemon/status`](./qwen-serve-protocol.md#get-daemonstatus) · [`GET /brand`](./qwen-serve-protocol.md#get-brand)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | `daemon_status`, `web_shell_brand`; process-global                                                                                                                                                                             | `DaemonClient.daemonStatus`, `DaemonClient.brand`                                                                                                                                  |
| Workspace-Registrierung          | [`POST /workspaces`](./qwen-serve-protocol.md#post-workspaces) · [`PATCH /workspaces/:workspace`](./qwen-serve-protocol.md#patch-workspacesworkspace) · [`DELETE /workspaces/:workspace`](./qwen-serve-protocol.md#delete-workspacesworkspace) · [`GET /workspace-registrations`](./qwen-serve-protocol.md#get-workspace-registrations) · [`DELETE /workspace-registrations/:id`](./qwen-serve-protocol.md#delete-workspace-registrationsid)                                                                                                                                                                                                                                                                                                                  | `dynamic_workspace_registration`, `persistent_workspace_registration`, `workspace_display_name`, `workspace_runtime_removal`; process-global oder selected-runtime                                                               | `DaemonClient.addWorkspace`, `DaemonClient.updateWorkspace`, `WorkspaceDaemonClient.remove`; Registration-Store-Routen verwenden rohes REST                                                |
| Workspace-Runtime-Status         | [`GET /workspace/mcp`](./qwen-serve-protocol.md#get-workspacemcp) · [`GET /workspace/skills`](./qwen-serve-protocol.md#get-workspaceskills) · [`GET /workspace/providers`](./qwen-serve-protocol.md#get-workspaceproviders) · [`GET /workspace/env`](./qwen-serve-protocol.md#get-workspaceenv) · [`GET /workspace/preflight`](./qwen-serve-protocol.md#get-workspacepreflight)                                                                                                                                                                                                                                                                                                                                                                               | `workspace_mcp`, `workspace_skills`, `workspace_providers`, `workspace_env`, `workspace_preflight`; legacy-primary                                                                                                             | `DaemonClient.workspaceMcp`, `workspaceSkills`, `workspaceProviders`, `workspaceEnv`, `workspacePreflight`                                                                         |
| Datei-Mutation                   | [`POST /file/write`](./qwen-serve-protocol.md#post-filewrite) · [`POST /file/edit`](./qwen-serve-protocol.md#post-fileedit)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | `workspace_file_write`; legacy-primary                                                                                                                                                                                         | `DaemonClient.writeWorkspaceFile`, `DaemonClient.editWorkspaceFile`                                                                                                                |
| Session-Inspektion und Tasks     | [`GET /session/:id/supported-commands`](./qwen-serve-protocol.md#get-sessionidsupported-commands) · [`GET /session/:id/tasks`](./qwen-serve-protocol.md#get-sessionidtasks) · [`POST /session/:id/tasks/:taskId/workflow-action`](./qwen-serve-protocol.md#post-sessionidtaskstaskidworkflow-action) · [`GET /session/:id/lsp`](./qwen-serve-protocol.md#get-sessionidlsp) · [`GET /session/:id/resources`](./qwen-serve-protocol.md#get-sessionidresources)                                                                                                                                                                                                                                                                                                  | `session_supported_commands`, `session_tasks`, `session_lsp`, `session_resources`; live-session-owner                                                                                                                          | `DaemonClient.sessionSupportedCommands`, `sessionTasks`, `sessionWorkflowTaskAction`, `sessionLspStatus`, `sessionResources`                                                       |
| Workspace-qualifizierter Verlauf | [`GET /workspaces/:workspace/session/:id/transcript`](./qwen-serve-protocol.md#get-workspacesworkspacesessionidtranscript) · [`GET /workspaces/:workspace/session/:id/export`](./qwen-serve-protocol.md#get-workspacesworkspacesessionidexport) · [`GET /workspaces/:workspace/session/:id/archive/export`](./qwen-serve-protocol.md#get-workspacesworkspacesessionidarchiveexport)                                                                                                                                                                                                                                                                                                                                                                           | `workspace_persisted_transcript`, `workspace_session_export`, `workspace_archived_session_export`; persisted-workspace                                                                                                         | `WorkspaceDaemonClient.getSessionTranscriptPage`, `exportSession`, `exportArchivedSession`                                                                                         |
| Worktree-Recovery                | [`POST /session/:id/worktree-reset`](./qwen-serve-protocol.md#post-sessionidworktree-reset)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | `session_worktree_reset_v1`; live-session-owner                                                                                                                                                                                | `DaemonClient.resetWorktreeSession`                                                                                                                                                |
| Persistierter-Session-Katalog    | [`GET /workspace/:id/session-info`](./qwen-serve-protocol.md#get-workspaceidsession-info-and-get-workspacesworkspacesession-info) · [`GET /workspaces/:workspace/session-info`](./qwen-serve-protocol.md#get-workspaceidsession-info-and-get-workspacesworkspacesession-info) · [`GET /workspace/:id/sessions`](./qwen-serve-protocol.md#get-workspaceidsessions-and-get-workspacesworkspacesessions) · [`GET /workspaces/:workspace/sessions`](./qwen-serve-protocol.md#get-workspaceidsessions-and-get-workspacesworkspacesessions) · [`GET /workspaces/:workspace/sessions/live-state`](./qwen-serve-protocol.md#get-workspacesworkspacesessionslive-state)                                                                                                | `session_info`, `session_list`, `workspace_session_live_state`; persisted-workspace                                                                                                                                            | `DaemonClient.getStandaloneSession`, `listWorkspaceSessions`, `getWorkspaceSessionLiveState`                                                                                       |
| Session-Organisation             | [`GET /workspace/:id/session-groups`](./qwen-serve-protocol.md#get-workspaceidsession-groups) · [`POST /workspace/:id/session-groups`](./qwen-serve-protocol.md#post-workspaceidsession-groups) · [`PATCH /workspace/:id/session-groups/:groupId`](./qwen-serve-protocol.md#patch-workspaceidsession-groupsgroupid) · [`DELETE /workspace/:id/session-groups/:groupId`](./qwen-serve-protocol.md#delete-workspaceidsession-groupsgroupid) · [`PATCH /session/:id/organization`](./qwen-serve-protocol.md#patch-sessionidorganization-and-patch-workspacesworkspacesessionidorganization) · [`PATCH /workspaces/:workspace/session/:id/organization`](./qwen-serve-protocol.md#patch-sessionidorganization-and-patch-workspacesworkspacesessionidorganization) | `session_organization`; legacy-primary oder persisted-workspace                                                                                                                                                                  | `DaemonClient.listSessionGroups`, `createSessionGroup`, `updateSessionGroup`, `deleteSessionGroup`, `updateSessionOrganization`; `WorkspaceDaemonClient.updateSessionOrganization` |
| Bulk-Änderungen persistierter Sessions | [`POST /sessions/delete`](./qwen-serve-protocol.md#post-sessionsdelete) · [`POST /sessions/archive`](./qwen-serve-protocol.md#post-sessionsarchive) · [`POST /sessions/unarchive`](./qwen-serve-protocol.md#post-sessionsunarchive)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | `session_archive`; legacy-primary                                                                                                                                                                                              | `DaemonClient.deleteSessionsData`, `archiveSessionsData`, `unarchiveSessionsData`                                                                                                  |
| Optionale Session-Steuerung      | [`POST /session/:id/recap`](./qwen-serve-protocol.md#post-sessionidrecap) · [`POST /session/:id/generate`](./qwen-serve-protocol.md#post-sessionidgenerate) · [`POST /session/:id/approval-mode`](./qwen-serve-protocol.md#post-sessionidapproval-mode)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | `session_recap`, `session_generation`, `session_approval_mode_control`; live-session-owner                                                                                                                                     | `DaemonClient.recapSession`, raw REST für Generation, `DaemonClient.setSessionApprovalMode`                                                                                        |
| Workspace-Konfiguration          | [`POST /workspace/tools/:name/enable`](./qwen-serve-protocol.md#post-workspacetoolsnameenable) · [`POST /workspace/skills/:name/enable`](./qwen-serve-protocol.md#post-workspaceskillsnameenable) · [`POST /workspace/skills/enable`](./qwen-serve-protocol.md#post-workspaceskillsenable) · [`POST /workspace/init`](./qwen-serve-protocol.md#post-workspaceinit) · [`POST /workspace/mcp/reload`](./qwen-serve-protocol.md#post-workspacemcpreload) · [`POST /workspace/mcp/:server/restart`](./qwen-serve-protocol.md#post-workspacemcpserverrestart) · [`POST /language`](./qwen-serve-protocol.md#post-language)                                                                                                                                         | `workspace_tool_toggle`, `workspace_skill_settings_toggle`, `workspace_skill_settings_batch_toggle`, `workspace_init`, `workspace_mcp_manage`, `workspace_mcp_restart`, `user_language_sync`; legacy-primary oder process-global | `DaemonClient.setWorkspaceToolEnabled`, `setWorkspaceSkillEnabled`, `setWorkspaceSkillsEnabled`, `initWorkspace`, `reloadWorkspaceMcp`, `restartMcpServer`, `setUserLanguage`      |
| Device-Flow-Authentifizierung    | [`POST /workspace/auth/device-flow`](./qwen-serve-protocol.md#post-workspaceauthdevice-flow) · [`GET /workspace/auth/device-flow/:id`](./qwen-serve-protocol.md#get-workspaceauthdevice-flowid) · [`DELETE /workspace/auth/device-flow/:id`](./qwen-serve-protocol.md#delete-workspaceauthdevice-flowid) · [`GET /workspace/auth/status`](./qwen-serve-protocol.md#get-workspaceauthstatus)                                                                                                                                                                                                                                                                                                                                                                   | `auth_device_flow`; legacy-primary                                                                                                                                                                                             | `DaemonClient.startDeviceFlow`, `getDeviceFlow`, `cancelDeviceFlow`, `getAuthStatus`                                                                                               |

Routen ohne eigenen Protokoll-Abschnitt fehlen absichtlich in diesem
Index. Es kann sich um erstklassige WebShell-Infrastruktur oder konditionale Implementierungs-
Oberflächen handeln; durch ihr Fehlen werden sie nicht zu einem Integrationsvertrag befördert.

## Gemeinsame Protokollregeln

- Authentifizieren Sie normale Routen mit `Authorization: Bearer <token>`. Eine Standard-
  Loopback-`/health`-Probe kann ausgenommen sein; Non-Loopback-Binds sind es nicht.
- Senden Sie `X-Qwen-Client-Id`, wenn eine Create/Load-Antwort eines bereitgestellt hat. Es ist ein
  Zuordnungs- und Attributions-Identifier, kein Endnutzer-Sicherheitsprinzipal.
- Behandeln Sie Fehler-Bodys als additiv. Verzweigen Sie primär über HTTP-Status und den
  stabilen `code` oder `errorKind`, falls vorhanden.
- Bewahren Sie SSE-Antwort-Header auf und deaktivieren Sie Proxy-Buffering. Setzen Sie mit beiden
  `Last-Event-ID` und `X-Qwen-Event-Epoch` fort, wenn der Daemon eine Epoch bereitgestellt hat.
- Eine Workspace-Trust-Grenze ist keine Tenant-Isolation. Führen Sie separate Daemons aus, wenn
  Sicherheitsprinzipale oder Prozess-Level-Fehlerschranken unabhängig sein müssen.
