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
