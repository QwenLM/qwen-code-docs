---
title: "qwen serve HTTP-Protokollreferenz"
description: "Vollständige Referenz des qwen serve HTTP-Protokolls – Authentifizierung, Capabilities, Routen, SSE-Events und Fehlerbehandlung."
---

# `qwen serve` HTTP-Protokollreferenz

Stufe 1 des [qwen-code Daemon-Designs](https://github.com/QwenLM/qwen-code/issues/3803). Alle Routen befinden sich unter der Basis-URL des Daemons (Standard `http://127.0.0.1:4170`).

## Authentifizierung

Wenn der Daemon mit `--token` oder `QWEN_SERVER_TOKEN` gestartet wurde, muss **jede Route außer `/health` bei Loopback-Binds** Folgendes enthalten:

```
Authorization: Bearer <token>
```

Ohne konfigurierten Token (Loopback-Entwicklerstandard) ist der Header optional. Der Token-Vergleich erfolgt in konstanter Zeit. 401-Antworten sind einheitlich für `missing header` / `wrong scheme` / `wrong token`.

**`/health`-Ausnahme** (Bctum): Bei Loopback-Binds (`127.0.0.1` / `localhost` / `::1` / `[::1]`) wird `/health` VOR der Bearer-Middleware registriert, sodass Liveness-Probes innerhalb des Pods den Token nicht mitsenden müssen, auch wenn der Daemon mit `--token` gestartet wurde. Non-Loopback-Binds (`--hostname 0.0.0.0` usw.) schalten `/health` wie jede andere Route hinter den Bearer – siehe den Abschnitt [`GET /health`](#get-health) für die Begründung.

**`--require-auth` (#4175 PR 15).** Übergib diesen Flag beim Start, um die Regel "Token ist erforderlich" auch auf Loopback auszudehnen. Der Start schlägt ohne Token fehl; die `/health`-Ausnahme entfällt (sodass `/health` ebenfalls `Authorization: Bearer …` erfordert).

Wenn der Flag aktiviert ist, blockiert die globale `bearerAuth`-Middleware **jede** Route – einschließlich `/capabilities`. Ein **nicht authentifizierter** Client kann daher nicht `caps.features` vorab prüfen (pre-flight), um herauszufinden, dass Auth erforderlich ist: Die Discover-Oberfläche für diesen Fall ist der **401-Antwort-Body** selbst (einheitlich für alle Routen gemäß dem Abschnitt [Authentifizierung](#authentication)). Der `require_auth` Capability-Tag ist eine **Bestätigung nach der Authentifizierung** – sobald sich ein Client erfolgreich authentifiziert und `/capabilities` liest, bestätigt das Vorhandensein des Tags, dass der Daemon mit `--require-auth` gestartet wurde (nützlich für Audit-/Compliance-UIs und für SDK-Clients, um "diese Bereitstellung ist gehärtet" in einem Einstellungsbereich anzuzeigen). Mutationsrouten, die sich für den strikten Modus pro Route entscheiden (Wave-4-Follow-ups), lehnen mit `401 { code: "token_required", error: "…" }` ab, wenn sie im Loopback-Standard ohne Token erreicht werden – aber wenn `--require-auth` aktiviert ist, weist die globale Bearer-Middleware die Anfrage bereits vor dem routenspezifischen Gate ab, sodass nicht authentifizierte Aufrufer tatsächlich den Legacy-`Unauthorized`-Body sehen.

**`--allow-origin <pattern>` (T2.4 [#4514](https://github.com/QwenLM/qwen-code/issues/4514)).** Browser-WebUIs, die den Daemon cross-origin aufrufen, werden standardmäßig blockiert – jede Anfrage, die einen `Origin`-Header enthält, gibt `403 {"error":"Request denied by CORS policy"}` zurück, da CLI/SDK-Clients niemals `Origin` senden und der Daemon dessen Vorhandensein als Zeichen wertet, dass die Anfrage aus einem Browser-Kontext stammt, in den der Operator nicht eingewilligt hat. Übergib `--allow-origin <pattern>` (wiederholbar) beim Start, um eine Allowlist anstelle der Blockade zu installieren. Jedes Muster ist entweder:

- Das Literal `*` – lässt jede Origin zu. **Riskant**: Der Start wird abgelehnt, wenn `*` konfiguriert ist, aber kein Bearer-Token gesetzt ist (aus beliebigen Quellen: `--token`, `QWEN_SERVER_TOKEN` oder `--require-auth`, was einen Token beim Start erzwingt). Der Start-Breadcrumb gibt eine Stderr-Warnung aus, wenn `*` in der Liste ist. **Empfehlung**: Kombiniere dies mit `--require-auth` bei Loopback-Binds, sodass `/health` und `/demo` ebenfalls durch den Bearer geschützt sind – sie werden bei Loopback standardmäßig vor der Bearer-Middleware registriert (sodass k8s/Compose-Probes `/health` ohne Token erreichen können), und eine `*`-Allowlist macht sie von jedem Cross-Origin-Browser aus erreichbar. Bei Non-Loopback-Binds ist der Bearer beim Start bereits obligatorisch, sodass die `*`-Angriffsfläche nur `/health` (Status-JSON) und `/demo` (eine statische Seite, deren JS weiterhin token-geschützte Routen aufruft) umfasst – die eigentliche API-Oberfläche ist unabhängig davon geschützt.
- Eine kanonische URL-Origin — `<scheme>://<host>[:<port>]`. **Kein abschließender Schrägstrich, kein Pfad, keine Userinfo, kein Query.** Der Start wird mit `InvalidAllowOriginPatternError` abgelehnt, wenn der Eintrag den Roundtrip `new URL(pattern).origin === pattern` nicht besteht; die Fehlermeldung nennt das fehlerhafte Muster und die kanonische Form. Absichtlich strikt: Eine stille Normalisierung (z. B. das Entfernen eines abschließenden `/`) würde Tippfehler durchrutschen lassen und mehrdeutige Eingaben akzeptieren.

Übereinstimmende Origins erhalten bei jeder Anfrage die Standard-CORS-Antwortheader:

```
Access-Control-Allow-Origin: <echoed origin>
Vary: Origin
Access-Control-Allow-Methods: GET, POST, PATCH, DELETE, OPTIONS
Access-Control-Allow-Headers: Authorization, Content-Type, X-Qwen-Client-Id, Last-Event-ID, X-Qwen-Event-Epoch
Access-Control-Max-Age: 86400
Access-Control-Expose-Headers: Retry-After, X-Qwen-Event-Epoch, X-Qwen-SSE-Stream-Id
```

`Access-Control-Allow-Origin` gibt die Origin der Anfrage wortwörtlich wieder (Klein-/Großschreibung wie vom Browser gesendet) und nicht das Literal `*`, selbst unter dem `*`-Muster – Browser-Caches keyern Antworten darauf in Kombination mit `Vary: Origin`, und das Echo lässt Raum, um in einer späteren Version `Access-Control-Allow-Credentials` ohne Schemaänderung hinzuzufügen. Die exponierten Header ermöglichen es Browser-WebUIs, Retry-Hinweise zu beachten, die SSE-Epoche beizubehalten und akzeptierte physische Streams zu korrelieren. `Access-Control-Allow-Credentials` wird heute **NICHT** gesendet: Der Daemon authentifiziert sich über Bearer-in-`Authorization`, was cross-origin ohne `credentials: 'include'` funktioniert.

OPTIONS-Preflight-Anfragen (OPTIONS mit `Access-Control-Request-Method` oder `Access-Control-Request-Headers`) werden mit `204 No Content` plus den obigen Headern kurzgeschlossen (short-circuit). Dies ist das konventionelle CORS-Muster und sicher – der Preflight bestätigt nur, welche Methoden/Header der Daemon akzeptiert; die eigentliche nachfolgende Anfrage durchläuft weiterhin die gesamte Kette (Host-Allowlist → Bearer-Auth → Routen), sodass Anti-DNS-Rebinding und Bearer-Erzwingung weiterhin ausgelöst werden, bevor ein Zustand gelesen oder verändert wird. Normale OPTIONS-Anfragen von übereinstimmenden Origins fließen weiterhin nach unten (downstream), wobei die CORS-Header angehängt bleiben.

Origins, die nicht mit der Allowlist übereinstimmen, erhalten weiterhin `403 {"error":"Request denied by CORS policy"}` – dieselbe Hülle (Envelope) wie die Standard-Blockade, sodass Clients, die die Antwort der Blockade bereits geparst haben, keine Sonderbehandlung für Allowlist-bereitgestellte Daemons vornehmen müssen. Der Ablehnungspfad gibt **keine** `Access-Control-*`-Header aus (der Browser würde sie ignorieren, und die Ausgabe würde indirekt die Größe der Allowlist durch das Vorhandensein der Header bekannt geben).

Die konfigurierte Musterliste wird absichtlich **NICHT** in `/capabilities` widergespiegelt – das Browser-WebUI kennt seine eigene Origin bereits (es hat den Daemon schließlich aufgerufen), und das Offenlegen der Liste würde einem nicht authentifizierten Leser von `/capabilities` ermöglichen, jede vertrauenswürdige Origin aufzuzählen (nützliche Aufklärung für eine falsch konfigurierte Bereitstellung). SDK-Clients prüfen anhand des Tags `caps.features.allow_origin`, ob "dieser Daemon Cross-Origin-Browser-Treffer beachtet", ohne die spezifischen Origins kennen zu müssen.

Loopback-Self-Origin-Anfragen (z. B. die `/demo`-Seite, die den Daemon auf demselben `127.0.0.1:port` aufruft) werden von einem **separaten** Origin-Strip-Shim verarbeitet, der VOR der CORS-Middleware läuft und den `Origin`-Header für `127.0.0.1:port` / `localhost:port` / `[::1]:port` / `host.docker.internal:port` entfernt. Sie werden also unabhängig von der `--allow-origin`-Konfiguration durchgelassen – Operatoren müssen den eigenen Port des Daemons nicht auflisten, damit die Demo-Seite funktioniert.

## Allgemeines Fehlerformat

5xx-Antworten tragen den `code` und `data` des ursprünglichen Fehlers, falls vorhanden (JSON-RPC-Stil – das ACP SDK leitet `{code, message, data}` vom Agenten weiter):

```json
{
  "error": "Internal error",
  "code": -32000,
  "data": { "reason": "model quota exceeded" }
}
```

Fehlerhaftes JSON in einem Request-Body gibt Folgendes zurück:

```json
{ "error": "Invalid JSON in request body" }
```

mit Status `400`.

`SessionNotFoundError` für eine unbekannte Session-ID gibt Folgendes zurück:

```json
{ "error": "No session with id \"<sid>\"", "sessionId": "<sid>" }
```

mit Status `404`.

`WorkspaceMismatchError` für ein `POST /session`, dessen `cwd` nicht zu einem registrierten Workspace kanonisiert wird, gibt `400` zurück mit:

```json
{
  "error": "Workspace mismatch: daemon is bound to \"…\"",
  "code": "workspace_mismatch",
  "boundWorkspace": "/path/the/daemon/uses/as-primary",
  "requestedWorkspace": "/path/in/the/request"
}
```

Verwende dies, um Fehlanpassungen vorab (pre-flight) zu erkennen: Lies `workspaceCwd` aus `/capabilities` und lass `cwd` bei `POST /session` weg (es fällt auf den primären Workspace zurück), oder wähle bei beworbenem `multi_workspace_sessions` eines von `workspaces[].cwd`.

`POST /session` jenseits der `--max-sessions`-Obergrenze des Daemons gibt `503` mit einem `Retry-After: 5`-Header zurück und:

```json
{
  "error": "Session limit reached (20)",
  "code": "session_limit_exceeded",
  "limit": 20,
  "scope": "workspace"
}
```

Wenn `--max-total-sessions` eine neue Session ablehnt, wird dieselbe Antwortform mit `"scope": "total"` zurückgegeben.

Anhängungen (Attaches) an bestehende Sessions werden NICHT auf die Obergrenze angerechnet, sodass Reconnects eines inaktiven Daemons auch bei voller Kapazität weiterhin funktionieren.

`RestoreInProgressError` – wird nur von `POST /session/:id/load` und `POST /session/:id/resume` ausgegeben – gibt `409` mit einem `Retry-After: 5`-Header (passend zu `session_limit_exceeded`) zurück und:

```json
{
  "error": "Session \"<sid>\" is already being restored via session/<resume|load>; retry session/<load|resume> after it completes",
  "code": "restore_in_progress",
  "sessionId": "<sid>",
  "activeAction": "load",
  "requestedAction": "resume"
}
```

Wird ausgelöst, wenn ein `session/load` für eine ID ausgegeben wird, bei der bereits ein `session/resume` läuft (oder umgekehrt). Warte mindestens `Retry-After` Sekunden und versuche es erneut – der zugrunde liegende Restore wird innerhalb von `initTimeoutMs` (Standard 10 s) abgeschlossen. Races mit derselben Aktion (`load` vs. `load`, `resume` vs. `resume`) werden zusammengeführt (coalesce), anstatt einen Fehler zu verursachen.

`SessionWorkspaceConflictError` – wird von `POST /session/:id/load` und `POST /session/:id/resume` ausgegeben, wenn das angeforderte `cwd` auf einen registrierten Workspace zielt, aber dieselbe Session-ID bereits in einer anderen Runtime live ist oder wiederhergestellt wird – gibt `409` zurück mit:

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

Clients sollten mit dem besitzenden Workspace erneut versuchen oder warten, bis der laufende Restore abgeschlossen ist, bevor sie die ID in einem anderen Workspace wiederherstellen. Same-Workspace-Restore-Races verwenden weiterhin das `restore_in_progress`-/Coalescing-Verhalten der Bridge.

`SessionArchivedError` wird ausgegeben, wenn ein Aufrufer versucht, eine Session zu laden oder fortzusetzen, deren JSONL sich unter `chats/archive/` befindet:

```json
{
  "error": "Session \"<sid>\" is archived. Unarchive it before loading.",
  "code": "session_archived",
  "sessionId": "<sid>"
}
```

mit Status `409`.

`SessionArchivingError` wird ausgegeben, wenn für dieselbe ID bereits ein Archivierungs- oder Dearchivierungsübergang läuft:

```json
{
  "error": "Session \"<sid>\" is being archived or unarchived; retry later.",
  "code": "session_archiving",
  "sessionId": "<sid>"
}
```

mit Status `409` und `Retry-After: 5`.

## Capabilities

Der Daemon bewirbt seine unterstützten Feature-Tags aus der Serve-Capability-Registry. Clients **müssen** die UI anhand von `features` steuern, nicht anhand von `mode` (gemäß Design §10).

```
['health', 'capabilities', 'session_create', 'session_scope_override',
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
 'session_approval_mode_control', 'workspace_tool_toggle', 'workspace_skill_toggle',
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
 'client_mcp_over_ws', 'cdp_tunnel_over_ws', 'browser_automation_mcp']
```

> Bedingte Tags erscheinen nur, wenn der entsprechende Deployment-Toggle aktiviert ist (siehe Tabelle unten). Das `permission_mediation`-Tag von F3 ist immer aktiv und enthält `modes: ['first-responder', 'designated', 'consensus', 'local-only']`, sodass SDK-Clients die vom Build unterstützte Menge introspektieren können; die zur Laufzeit aktive Strategie befindet sich unter `body.policy.permission`.

`session_scope_override` ist der Negotiation-Handle für das anfragebezogene `sessionScope`-Feld bei `POST /session` (siehe unten). Ältere Daemons ignorieren dieses Feld stillschweigend, daher sollten SDK-Clients `caps.features` vor dem Senden auf dieses Tag prüfen.

`persistent_workspace_registration` bewirbt dauerhafte Registrierung für zur Laufzeit hinzugefügte Workspaces. `POST /workspaces` akzeptiert `{ "cwd": "/absolute/path", "persist": true }`; der Erfolg enthält `persisted: true`. Registrierungen sind auf den kanonischen primären Workspace des Daemons unter dem Qwen-Home-Verzeichnis des Benutzers beschränkt und werden beim nächsten Daemon-Start wiederhergestellt. Das Weglassen von `persist` bewahrt die prozesslokale Registrierung. `GET /workspace-registrations` listet die gespeicherte gewünschte Menge auf, und `DELETE /workspace-registrations/:id` vergisst einen Eintrag für den nächsten Neustart, ohne eine aktive Runtime hot zu entfernen.

`workspace_display_name` bewirbt die optionale `displayName`-Eingabe bei `POST /workspaces`, Workspace-Metadatenupdates über `PATCH /workspaces/:workspace` und optionale Display-Name-Felder in Workspace-Projektionen. Namen nehmen nicht an Lookup oder Routing teil: `id` und kanonisches `cwd` bleiben die einzigen Selektoren, und doppelte Namen sind erlaubt.

`workspace_runtime_removal` bewirbt das synchrone Hot Removal über `DELETE /workspaces/:workspace`. Capability-Workspace-Einträge fügen ein optionales `removable` hinzu; nur Zeilen mit `removable: true` dürfen entfernt werden. Das Entfernen vergisst auch alle persistenten Registrierungsaliase für die Runtime, löscht aber niemals Dateien, Einstellungen, Transkripte oder Archive.

`session_load` und `session_resume` bewerben die Explicit-Restore-Routen (`POST /session/:id/load` und `POST /session/:id/resume`). Ältere Daemons geben für diese Pfade `404` zurück, daher sollten SDK-Clients `caps.features` vor dem Aufruf prüfen. `unstable_session_resume` wird weiterhin als veraltetes Alias für die Kompatibilität mit SDKs beworben, die ausgeliefert wurden, als die zugrunde liegende ACP-Methode noch `connection.unstable_resumeSession` hieß; neue Clients sollten auf `session_resume` prüfen.

`session_transcript` bewirbt `GET /session/:id/transcript`, eine schreibgeschützte seitenweise Replay-Ansicht über das persistierte aktive Session-JSONL. Sie ist getrennt von `/load`: Sie hängt keinen Client an, seedet nicht den live EventBus, erstellt keine Live-Session und ändert nicht das Live-Replay-Fenster. Clients sollten sie verwenden, wenn sie das vollständige Transkript auf der Festplatte für eine lange Session benötigen, und weiterhin `/load` nur für begrenztes Live-Replay beim Cold-UI-Restore verwenden.

`workspace_persisted_transcript` bewirbt `GET /workspaces/:workspace/session/:id/transcript`, einen daemon-lokalen rein persistierten Pager, der keinen ACP startet, den Live-Bridge-Zustand abfragt, Einstellungen lädt, Projekt-Capabilities entdeckt oder den Legacy-Persisted-Cursor-Key erstellt. Das Tag ist bedingungslos, da vertrauenswürdige Single-Workspace-Primaries die Plural-Route verwenden können; die Workspace-Trust-Autorisierung wird weiterhin bei jeder Anfrage ausgewertet. Registrierte nicht vertrauenswürdige sekundäre Workspaces dürfen lesen, während ein nicht vertrauenswürdiger Primary weiterhin abgelehnt wird.

`workspace_session_export` bewirbt `GET /workspaces/:workspace/session/:id/export`, einen rein vertrauenswürdigen vollständigen Export der aktiven persistierten Session des ausgewählten Workspaces. Er ist unabhängig von `session_export` und `workspace_qualified_rest_core`: Veröffentlichte Daemons können beide älteren Tags bewerben, ohne die Plural-Route zu implementieren, daher müssen Clients dieses Tag direkt vorab prüfen. Das Tag ist bedingungslos, da ein vertrauenswürdiger Single-Workspace-Primary die Route nach ID oder CWD verwenden kann. Der Export löst keinen Live-Owner auf, startet keinen ACP, hängt keinen Client an oder fällt auf einen anderen Workspace zurück.

`workspace_archived_session_export` bewirbt `GET /workspaces/:workspace/session/:id/archive/export`, einen rein vertrauenswürdigen vollständigen Export aus dem archivierten persistierten Speicher des ausgewählten Workspaces. Er ist unabhängig von `workspace_session_export` und `workspace_qualified_rest_core`; Clients müssen dieses Tag direkt vorab prüfen. Eine eigene Route verhindert, dass ein älterer Daemon die Archiv-Absicht ignoriert und ein aktives Transkript mit derselben ID zurückgibt.

`slow_client_warning` deckt das SSE-Backpressure-Verhalten ab: (a) Der Daemon emittiert einen synthetischen `slow_client_warning`-Event-Stream-Frame, wenn der Live-Frame-Backlog oder der Live-Serialized-Byte-Backlog eines Subscribers 75 % Kapazität überschreitet, einmal pro Überlauf-Episode (wird wieder aktiviert, nachdem beide Messwerte unter 37,5 % abgefallen sind); (b) `GET /session/:id/events` akzeptiert einen `?maxQueued=N`-Query-Parameter (Bereich `[16, 2048]`), um den subscriberbezogenen Frame-Backlog für Cold-Reconnects gegen einen großen Replay-Ring vorzudimensionieren. Das Serialized-Byte-Limit liegt in der Verantwortung des Daemons (Standard **2 MiB** pro Subscriber), ist nur für Live-Daten gedacht und hat absichtlich keinen Query-Parameter. Die Daemon-weite Ringgröße wird durch `--event-ring-size` gesteuert (Standard **8000**, gemäß #3803 §02). Ältere Daemons unterstützen das Warnungs-/Query-Verhalten nicht und ignorieren es stillschweigend – prüfe dieses Tag vor der Aktivierung.

`typed_event_schema` bewirbt Daemon-Event-Payloads, die dem `KnownDaemonEvent`-Schema des SDK entsprechen. Ältere Daemons streamen möglicherweise weiterhin kompatible Frames, aber SDK-Clients sollten dieses Tag prüfen, bevor sie von einer Typed-Event-Abdeckung ausgehen.

`client_heartbeat` bewirbt `POST /session/:id/heartbeat`. Ältere Daemons geben `404` zurück; prüfe dieses Tag, bevor du periodische Heartbeats sendest.

`session_close` und `session_metadata` bewerben `DELETE /session/:id` und `PATCH /session/:id/metadata`. Ältere Daemons geben `404` zurück; prüfe diese Tags, bevor du Close- oder Rename-Funktionen bereitstellst.

`session_organization` bewirbt benutzerdefinierte Session-Gruppen und Pinning. Es fügt `GET/POST/PATCH/DELETE /workspace/:id/session-groups`, `PATCH /session/:id/organization` und die optionale organisierte Listenansicht `GET /workspace/:id/sessions?view=organized` hinzu. Wenn sowohl `session_organization` als auch `workspace_qualified_rest_core` beworben werden, ist auch die Workspace-qualifizierte Organisationsmutation `PATCH /workspaces/:workspace/session/:id/organization` verfügbar. Die Legacy-Mutation bleibt nur für den primären Workspace. Ältere Daemons geben für die Mutations-/Gruppenrouten `404` zurück und ignorieren den Contract der organisierten Ansicht. WebShell-/SDK-Clients müssen diese Tags daher prüfen, bevor sie die entsprechende Gruppierungs- oder Pinning-UI anzeigen.

`session_archive` bewirbt die v1 Directory-State-Archive-API: `POST /sessions/archive`, `POST /sessions/unarchive` und `GET /workspace/:id/sessions?archiveState=active|archived`. Archivierte Sessions können erst wieder geladen oder fortgesetzt werden, wenn sie dearchiviert (unarchived) sind.

`workspace_qualified_rest_core` bewirbt die pluralen Core-REST-Routen unter `/workspaces/:workspace/...`. Der Selektor löst sich zuerst als exakte Workspace-ID auf, dann als URL-kodiertes absolutes CWD nach Kanonisierung. Neuere Single-Workspace-Daemons schließen die primäre Runtime in `workspaces[]` ein, auch wenn `multi_workspace_sessions` fehlt, sodass Clients die für Workspace-qualifizierte Routen erforderliche ID entdecken können; Clients sollten für ältere Daemons, die das Array weglassen, auf `capabilities.workspaceCwd` zurückfallen. Trust-Status und Trust-Request-Routen sind für registrierte nicht vertrauenswürdige Workspaces verfügbar; Datei-Lese-Routen folgen der bestehenden Dateisystem-Lese-Policy. Registrierte nicht vertrauenswürdige sekundäre Workspaces legen auch rein persistierte Session- und Session-Group-Kataloge offen: Diese Lesevorgänge hängen sich nicht an eine Session an, starten keinen ACP oder mergen Live-Bridge-Zustand. Dateischreibvorgänge, Katalogmutationen und andere Plural-Core-Routen erfordern einen vertrauenswürdigen Workspace, es sei denn, eine separate Capability definiert explizit eine engere schreibgeschützte Policy, wie `workspace_persisted_transcript`. Ein nicht vertrauenswürdiger Primary erhält weiterhin `403 { code: "untrusted_workspace" }` von den Plural-Katalog- und Transkript-Routen; Legacy-Singular-Primary-Routen behalten ihr bestehendes Kompatibilitätsverhalten. Dieses Tag deckt die Core-Datei-, Status-, Einstellungs-, Berechtigungs-, Trust-, Lifecycle-, MCP-Control-, Tool- und Skill-Toggle-, Memory-, Workspace-Agent-CRUD- und Session-Speicher-Oberflächen ab. Es deckt nicht Auth, Voice, Extensions, ACP/WebSocket-Transport, Channel-Worker-Routing oder Workspace-qualifizierten Session-Export ab; prüfe `workspace_session_export` oder `workspace_archived_session_export` separat. Workspace-Trust ist keine ACL: Ein Client, der das Daemon-Token besitzt, kann jede registrierte Workspace-Oberfläche lesen, die von dieser Policy erlaubt ist.

`workspace_qualified_voice` bewirbt Voice-Routen, die nach einer vertrauenswürdigen Workspace-Runtime selektiert werden: `GET` und `POST /workspaces/:workspace/voice`, `POST /workspaces/:workspace/voice/transcribe` und `WS /workspaces/:workspace/voice/stream`. Es wird nur beworben, wenn Multi-Workspace-Runtimes und der gemeinsame ACP/Voice-WebSocket-Listener beide aktiviert sind. Der Selektor folgt denselben ID-oder-kodiertes-absolutes-CWD-Regeln wie andere Plural-Routen. Bei REST gibt ein unbekannter Selektor `400 { code: "workspace_mismatch" }` zurück und ein nicht vertrauenswürdiger Selektor `403 { code: "untrusted_workspace" }`; WebSocket-Upgrade-Ablehnung legt den entsprechenden HTTP 400/403-Status ohne strukturiertes JSON-Envelope offen. Keiner der Transport fällt auf Primary zurück. Legacy `/workspace/voice`, `/workspace/voice/transcribe` und `/voice/stream` bleiben nur für Primary. Clients verwenden `workspace_qualified_voice` für alle qualifizierten Voice-Modalitäten und lassen die ausgewählte Runtime konfigurationsspezifische Fehler melden. Die Legacy-Tags `workspace_voice`, `workspace_voice_transcription` und `voice_transcribe` beschreiben nur die Primary-gebundenen Routen und dürfen keine qualifizierte sekundäre Konfiguration verbergen.

`workspace_qualified_memory` bewirbt die Workspace-qualifizierten Managed-Memory-Routen: `POST /workspaces/:workspace/memory/{remember,forget,dream}` stellen Tasks in die Warteschlange und `GET /workspaces/:workspace/memory/{remember,forget,dream}/:taskId` liest sie zurück. Es wird nur beworben, wenn ACP HTTP und Multi-Workspace-Runtimes beide aktiviert sind. Der Selektor folgt denselben ID-oder-kodiertes-absolutes-CWD-Regeln wie andere Plural-Routen. Jeder registrierte Workspace erhält eine eigene Task-Lane; die qualifizierte Lane des Primaries ist dieselbe Instanz wie die Singular-`/workspace/memory`-Oberfläche, sodass ein auf einer in die Warteschlange gestellter Task auf der anderen lesbar ist. Die Auflösung erfolgt strikt nach ausgewählter Runtime ohne Primary-Fallback: Ein unbekannter Selektor gibt `400 { code: "workspace_mismatch" }` zurück, ein nicht vertrauenswürdiger Selektor `403 { code: "untrusted_workspace" }`, und eine inaktive oder drainende Runtime `503 { code: "workspace_runtime_unavailable" }`. Lesevorgänge weisen niemals eine Lane zu, daher gibt das Pollen eines Workspaces ohne Tasks `404 { code: "<kind>_task_not_found" }` zurück. Task-IDs sind auf ihre Lane beschränkt und überleben keine Workspace-Rekonfiguration oder Runtime-Ersetzung; eine veraltete ID gibt `404` zurück, keinen Datenverlust. Wenn ACP HTTP deaktiviert ist, wird das Tag nicht beworben und eine nicht primäre qualifizierte Anfrage gibt ein nicht wiederholbares `501 { code: "workspace_memory_unavailable" }` zurück, während die primäre qualifizierte Route über die lokal besessene Lane weiterhin funktioniert.

`session_lsp` bewirbt `GET /session/:id/lsp`, den schreibgeschützten strukturierten LSP-Status-Snapshot für Daemon-Clients. Ältere Daemons geben `404` zurück; prüfe dieses Tag, bevor du den Remote-LSP-Status bereitstellst.

`session_status` bewirbt `GET /session/:id/status`, die Live-Bridge-Zusammenfassung für eine einzelne Session anhand der ID. Neben `clientCount` und `hasActivePrompt` legen Live-Sessions `isWaitingForPermission`, `isWaitingForUserQuestion`, `pendingInteractionCount` und einen beibehaltenen `turnError` nach einem fehlgeschlagenen Turn offen. Der Fehler wird gelöscht, wenn der nächste Prompt tatsächlich startet. Sowohl die Single-Session-Status-Antwort als auch Workspace-Session-Listen enthalten `turnError` und `pendingInteractions`: renderbereite Berechtigungsaktionen oder `ask_user_question`-Fragen plus die `requestId` und auswählbaren Optionen, die von den bestehenden Permission-Vote-Routen erforderlich sind. Jede Benutzerfrage hat einen `answerKey`; stimme mit `answers` ab, z. B. `{ "0": "Polling" }`, nach diesem Wert keyiert. Rein persistierte Sessions lassen Runtime-Zustand weg, da keine Runtime existiert. Ältere Daemons geben `404` zurück; prüfe dieses Tag, bevor du den Status einer einzelnen Session abfragst, anstatt die gesamte Session-Liste zu scannen.

`session_info` bewirbt `GET /workspace/:id/session-info` und seinen `/workspaces/:workspace/session-info`-Zwilling. Die Antwort aggregiert persistierte aktive und archivierte Session-Zahlen ohne Hydratierung von Listen-Metadaten. Sie ist ein expliziter O(n)-Disk-Scan und darf nicht gepollt werden; Clients sollten `truncated: true` als Untergrenze behandeln.

`session_approval_mode_control`, `workspace_tool_toggle`, `workspace_skill_toggle`, `workspace_init` und `workspace_mcp_restart` bewerben die unten dokumentierten Mutations-Control-Routen. Sie sind streng durch das Mutations-Gate geschützt (ein Daemon, der ohne Bearer-Token konfiguriert ist, weist sie mit 401 `token_required` ab). Ältere Daemons geben `404` zurück; prüfe jedes Tag, bevor du die entsprechende Funktion bereitstellst.

`mcp_guardrails` (Issue [#4175](https://github.com/QwenLM/qwen-code/issues/4175) PR 14) deckt die MCP-Budget-Oberfläche ab: die Felder `clientCount` / `clientBudget` / `budgetMode` / `budgets[]` bei `GET /workspace/mcp`, das Feld `disabledReason` in den Server-Zellen und die CLI-Flags `--mcp-client-budget` / `--mcp-budget-mode`. Ältere Daemons lassen die neuen Felder vollständig weg; SDK-Clients sollten dieses Tag prüfen, bevor sie sich auf die `budgets[]`-Semantik verlassen. Der Registry-Descriptor enthält außerdem `modes: ['warn', 'enforce']` für die zukünftige Bereitstellung von Feature-Modi – vorerst leiten Clients den Modus aus dem Feld `budgetMode` des Snapshots ab. Server-Ablehnungen im `enforce`-Modus sind deterministisch nach der Deklarationsreihenfolge von `Object.entries(mcpServers)`; eine zukünftige Scope-Precedence-Schicht (falls Qwen Code eine einführt) würde dies auf "niedrigste Priorität zuerst" umstellen, um die Konvention `plugin < user < project < local` von claude-code zu spiegeln.

> **Scope ist Capability-getrieben.** Mit `mcp_workspace_pool` teilen sich Sessions innerhalb einer Workspace-Runtime einen Transport-Pool und `WorkspaceMcpBudget`, und der Snapshot emittiert `budgets[0].scope: 'workspace'`. Verschiedene Workspace-Runtimes besitzen unabhängige Pools. Ohne das Tag verwendet jede ACP-Session ihren Legacy-`McpClientManager`, der Snapshot emittiert `scope: 'session'`, und N Sessions können jeweils die konfigurierte Obergrenze verbrauchen.

`workspace_file_read` deckt die Text/List/Stat/Glob-Workspace-File-Routen ab
(`GET /file`, `GET /list`, `GET /glob`, `GET /stat`). `workspace_file_bytes`
deckt `GET /file/bytes` ab, das später hinzugefügt wurde, damit Clients die Unterstützung
für rohe Byte-Fenster gegen Daemons aus der PR19-Ära prüfen können. `workspace_file_write` deckt
die Hash-bewussten Textmutationsrouten ab (`POST /file/write`, `POST /file/edit`).
Das Write-Tag bedeutet, dass der Routen-Contract existiert; es bedeutet nicht, dass die aktuelle
Bereitstellung für anonyme Mutationen offen ist. Write/Edit sind strikte Mutationsrouten
und erfordern auch auf Loopback einen konfigurierten Bearer-Token.

Wenn `workspace_qualified_rest_core` beworben wird, ist dieselbe Datei-Oberfläche auch unter `/workspaces/:workspace/file`, `/workspaces/:workspace/file/bytes`, `/workspaces/:workspace/stat`, `/workspaces/:workspace/list`, `/workspaces/:workspace/glob`, `/workspaces/:workspace/file/write` und `/workspaces/:workspace/file/edit` verfügbar.

Dasselbe Tag legt auch Workspace-qualifizierten Projekt-Agent-CRUD unter `/workspaces/:workspace/agents` und `/workspaces/:workspace/agents/:agentType` offen. Diese Plural-Routen lesen oder mutieren nur Projekt-Level-Agenten für den ausgewählten Workspace; `global`- und `user`-Scope-Anfragen geben `400 { code: "global_scope_not_supported_for_workspace_route" }` zurück. Workspace-lose `/workspace/agents`-Routen behalten ihr bestehendes Primary-Workspace-Verhalten und bleiben die einzige REST-Oberfläche für User-Level-Agent-Scope.

`extension_management_v2` bewirbt einen User-Level-Extension-Katalog und eine Mutationsoberfläche unter `/extensions/*` sowie Workspace-Aktivierungs-Projektionen unter `/workspaces/:workspace/extensions/*`. Artefakte sind global; Workspace-Routen legen nur Projektions-Lesevorgänge, exakte Aktivierungs-Overrides und Runtime-Refresh offen. Lesevorgänge dürfen auf einen nicht vertrauenswürdigen registrierten Workspace zielen, während Aktivierung, Refresh und Workspace-scopige Installation ein vertrauenswürdiges Ziel erfordern. Langsame Mutationen verwenden daemon-lokale Vorgänge unter `/extensions/operations/:operationId`; Store-Generation, nicht Vorgangshistorie, ist maßgeblich über Neustarts und Daemons hinweg. Die veröffentlichte `workspace_extensions`-Capability und `/workspace/extensions/*`-Routen bleiben ein Primary-Workspace-Kompatibilitätsadapter. Clients müssen `extension_management_v2` vorab prüfen und dürfen es nicht vom Daemon-Modus oder `workspace_qualified_rest_core` ableiten.

### Extension Management V2 Wire-Contract

Alle Routen verwenden die oben beschriebenen Bearer-Authentifizierungsregeln des Daemons. `X-Qwen-Client-Id` ist für die V2-Mutationsrouten optional; wenn angegeben, muss es einen Client identifizieren, der bei einer der Workspace-Runtimes des Mutationsziels registriert ist. `:extensionId` ist die 64-Hex-Extension-Identität in Kleinbuchstaben. `:workspace` wird zuerst als exakte Workspace-ID aufgelöst und andernfalls als URL-kodiertes absolutes CWD nach Kanonisierung.

| Methode und Pfad                                                     | Erfolg                                                                      |
| -------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| `GET /extensions`                                                    | `200` globaler Artefaktkatalog                                              |
| `PUT /extensions/:extensionId/activation`                            | `202` globale Standard-Aktivierungs-Operation                               |
| `POST /extensions/install`                                           | `202` Installations-Operation                                               |
| `POST /extensions/check-updates`                                     | `202` Update-Check-Operation                                                |
| `POST /extensions/:extensionId/update`                               | `202` Update-Operation                                                      |
| `DELETE /extensions/:extensionId`                                    | `202` Deinstallations-Operation oder idempotentes `204` wenn die Extension fehlt |
| `GET /extensions/operations/:operationId`                            | `200` Operations-Snapshot                                                   |
| `GET /workspaces/:workspace/extensions`                              | `200` Workspace-Aktivierungs-Projektion                                     |
| `PUT /workspaces/:workspace/extensions/:extensionId/activation`      | `202` exakte Workspace-Aktivierungs-Operation                               |
| `DELETE /workspaces/:workspace/extensions/:extensionId/activation`   | `202` Clear-Override-Operation                                              |
| `POST /workspaces/:workspace/extensions/refresh`                     | `202` Runtime-Refresh-Operation                                             |

Die globale Katalogantwort ist:

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

`installType` wird weggelassen, wenn keine Installationsmetadaten verfügbar sind. `defaultActivation` ist `enabled` oder `disabled`. `workspaceOverrideCount` schließt gespeicherte `inherit`-Einträge aus.

Die Workspace-Projektionsantwort ist:

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

`workspaceActivation` ist `enabled`, `disabled` oder `null` für Vererbung. `activationSource` ist `default`, `workspace_override`, `legacy_path_rule` oder `cli_override`. `desiredGeneration` ist die dauerhafte Store-Generation; `appliedGeneration` ist die neueste Generation, die der Controller als auf diese Workspace-Runtime angewendet aufgezeichnet hat, und kann vorübergehend hinterherhinken.

Die Installation erfordert explizite Zustimmung und eine initiale Aktivierung:

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

Für eine rein Workspace-initiale Aktivierung verwende `{ "scope": "workspace", "workspaceId": "target-workspace-id" }`; das Ziel muss existieren und vertrauenswürdig sein. Daemon-Installationen akzeptieren GitHub-, Git- und npm-Quellen. `ref` gilt nicht für npm, und `registry` gilt nur für npm. `ref`, `autoUpdate`, `allowPreRelease` und `registry` sind optional.

Globale und Workspace-Aktivierungs-`PUT`-Anfragen verwenden denselben Body:

```json
{ "state": "enabled" }
```

`state` ist `enabled` oder `disabled`. Update-, Deinstallations-, Check-Updates-, Clear-Activation- und Refresh-Anfragen haben keinen erforderlichen Body.

Jede akzeptierte asynchrone Mutation gibt Folgendes zurück:

```http
HTTP/1.1 202 Accepted
Location: /extensions/operations/<operation-id>
Retry-After: 1
Content-Type: application/json

{"accepted":true,"operationId":"<operation-id>"}
```

Workspace-qualifizierte Mutationen verwenden denselben globalen `/extensions/operations/:operationId`-Polling-Pfad. Die Operationshistorie ist prozesslokal, behält nur eine begrenzte Anzahl terminaler Einträge und geht beim Daemon-Neustart verloren; Clients müssen den Katalog oder die Workspace-Projektion erneut lesen und Generationen vergleichen, wenn eine Operations-ID verschwindet.

Ein Operations-Snapshot hat diese Form:

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

`status` wechselt von `queued` zu `running`, dann zu `succeeded`, `succeeded_with_warnings` oder `failed`. Während der Ausführung ist `phase` entweder `preparing`, `committing` oder `reconciling`. Terminaler Erfolg kann `result` mit `status` gleich `installed`, `enabled`, `disabled`, `updated`, `uninstalled`, `checked` oder `refreshed` enthalten; Reconciliation-Ergebnisse können zusätzlich `refreshed`, `failed` und `error` enthalten. Update-Checks geben `result.states` zurück, keyiert nach Extension-Name, mit Werten wie `checking for updates`, `update available`, `up to date`, `not updatable` oder `error`.

Ein dauerhafter Commit gefolgt von unvollständiger Bereinigung oder Runtime-Reconciliation wird nicht als fehlgeschlagene Mutation gemeldet. Er gibt `succeeded_with_warnings` zurück und bewahrt das committete Ergebnis:

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

Warning-`workspaceId` und `code` sind optional; `workspaceCwd` und `error` sind immer vorhanden. Clients sollten Warnings anzeigen, ihren Katalog/ihre Projektion aktualisieren und dürfen die dauerhafte Mutation nicht blind wiederholen.

Validierungs- und Autorisierungsfehler sind synchrone HTTP-Fehler mit `{ "error": "...", "code": "..." }`, wenn ein stabiler Code existiert. Wichtige Fälle sind `400 invalid_extension_id`, `400 invalid_extension_activation`, `400 workspace_mismatch`, `403 untrusted_workspace`, `404 extension_operation_not_found` und `429 extension_queue_full`. Installationsvalidierung gibt auch `400` für ungültige Source/Ref/Registry-Optionen, fehlende Zustimmung oder fehlende/ungültige initiale Aktivierung zurück. Eine nach `202` fehlgeschlagene Mutation wird, solange sie in der Operationshistorie behalten wird, mit `status: "failed"`, `error` und einem optionalen stabilen `code` dargestellt; häufige Codes umfassen `extension_prepare_timeout` und `extension_conflict`. HTTP `404` für eine Operation impliziert kein Rollback, da die Operationshistorie nicht dauerhaft ist.

`daemon_status` bewirbt `GET /daemon/status`, den konsolidierten schreibgeschützten
Operator-Diagnose-Snapshot, der unten dokumentiert ist.

**Bedingte Tags.** Eine kleine Anzahl von Feature-Tags wird nur beworben, wenn der entsprechende Bereitstellungs-Toggle, Runtime-Wiring oder die Verfügbarkeitsbedingung aktiv ist. Vorhandensein des Tags = Verhalten ist aktiviert; Fehlen = entweder ein älterer Daemon, der älter als das Tag ist, ODER ein aktueller Daemon, bei dem diese Bedingung nicht zutrifft. Aktuell:

<!-- conditional-serve-features:start -->

| Tag                                 | Beworben, wenn …                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `require_auth`                      | der Daemon mit `--require-auth` (oder `requireAuth: true` über die eingebettete API) gestartet wurde. Der Bearer-Token ist auf jeder Route zwingend erforderlich, einschließlich `/health` bei Loopback-Binds.                                                                                                                                                                                                                                                                                                                                    |
| `mcp_workspace_pool`                | der gemeinsame MCP-Transport-Pool aktiv ist. Wird weggelassen, wenn `QWEN_SERVE_NO_MCP_POOL=1` den Pool deaktiviert.                                                                                                                                                                                                                                                                                                                                                                                                             |
| `mcp_pool_restart`                  | der gemeinsame MCP-Transport-Pool aktiv ist; Restart-Antworten können Pool-bewusste Multi-Entry-Formen enthalten.                                                                                                                                                                                                                                                                                                                                                                                                           |
| `external_tool_guard`               | `qwen serve` den Startup-Handshake für `--external-tool-guard-mode=required` abgeschlossen hat; jeder erzeugte ACP-Channel muss den installierten Callback vor der Session-Erstellung bestätigen, und jede unterstützte Top-Level-Managed-ACP-Tool-Invocation, die die endgültige Ausführungsgrenze erreicht, muss eine externe Pre-Execution-Erlaubnis erhalten. Frühere Permission-/Hook-Ablehnungen stellen keine Provider-Anfrage. Verschachtelte AgentCore-Ausführung liegt außerhalb von v1 und wird abgelehnt.                                                       |
| `allow_origin`                      | T2.4 ([#4514](https://github.com/QwenLM/qwen-code/issues/4514)). Der Daemon wurde mit mindestens einem `--allow-origin <pattern>` (oder `allowOrigins: [...]` über die eingebettete API) gestartet. Cross-Origin-Anfragen von übereinstimmenden Origins erhalten die entsprechenden CORS-Antwortheader; nicht übereinstimmende Origins erhalten weiterhin den Standard-403-Fehler. Die konfigurierte Pattern-Liste wird absichtlich NICHT in `/capabilities` ausgegeben, um zu verhindern, dass das Trusted-Origin-Set an unauthentifizierte Leser weitergegeben wird – die Browser-WebUI kennt ihre eigene Origin bereits. |
| `prompt_absolute_deadline`          | `--prompt-deadline-ms` / `QWEN_SERVE_PROMPT_DEADLINE_MS` / `ServeOptions.promptDeadlineMs` auf eine positive Ganzzahl gesetzt ist.                                                                                                                                                                                                                                                                                                                                                                                        |
| `writer_idle_timeout`               | `--writer-idle-timeout-ms` / `QWEN_SERVE_WRITER_IDLE_TIMEOUT_MS` / `ServeOptions.writerIdleTimeoutMs` auf eine positive Ganzzahl gesetzt ist.                                                                                                                                                                                                                                                                                                                                                                             |
| `workspace_settings`                | der Daemon mit verfügbarer Settings-Persistenz erstellt wurde.                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `workspace_voice`                   | Settings-Persistenz verfügbar ist, sodass die Legacy-Primary-Workspace-Voice-Einstellungsrouten aktiv sind.                                                                                                                                                                                                                                                                                                                                                                                                            |
| `workspace_voice_transcription`     | der primäre Workspace ein konfiguriertes Voice-Transkriptionsmodell hat.                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `session_shell_command`             | die Session-Shell-Ausführung explizit aktiviert ist.                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `session_artifacts_persistence`     | die Session-Artefakt-Persistenz für die Runtime verdrahtet ist.                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `session_generation`                | Session-Generation-Helper verfügbar sind.                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `workspace_generation`              | Workspace-scopige Generation-Helper verfügbar sind.                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `rate_limit`                        | `--rate-limit` / `QWEN_SERVE_RATE_LIMIT=1` / `ServeOptions.rateLimit` aktiviert ist.                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `workspace_reload`                  | Workspace-Reload-Unterstützung in der eingebetteten Routenkonfiguration verfügbar ist.                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `workspace_trust_hot_reload`        | Workspace-Trust-Policy-Überwachung und Runtime-Generation-Reconciliation verdrahtet sind, sodass Trust-Änderungen ohne Daemon-Neustart wirksam werden und v2-Trust-Status-Berichte Konvergenz melden.                                                                                                                                                                                                                                                                                                                          |
| `channel_reload`                    | ein Daemon-verwalteter Channel-Worker-Manager aktiviert ist und seine aktuelle Auswahl neu laden kann.                                                                                                                                                                                                                                                                                                                                                                                                                |
| `channel_control`                   | die Runtime-Steuerung des Daemon-verwalteten Channel-Workers verdrahtet ist.                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `channel_management`                | Workspace-scopige Channel-Einstellungen, Lifecycle und Pairing-Management verdrahtet sind.                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `multi_workspace_sessions`          | mehr als eine Workspace-Runtime registriert ist, sodass die Session-Erstellung eine vertrauenswürdige Runtime nach CWD auswählen kann.                                                                                                                                                                                                                                                                                                                                                                                 |
| `multi_workspace_session_rewind`    | mehr als eine Workspace-Runtime registriert ist; Singular-Live-Session-Rewind-Routen lösen die besitzende Runtime auf.                                                                                                                                                                                                                                                                                                                                                                                               |
| `multi_workspace_session_shell`     | mehr als eine Workspace-Runtime registriert ist und die Session-Shell-Ausführung explizit aktiviert ist; Singular-REST-Shell löst die besitzende Runtime auf.                                                                                                                                                                                                                                                                                                                                                         |
| `dynamic_workspace_registration`    | eine Workspace-Runtime-Factory in den Daemon verdrahtet ist, sodass ein bestehendes vertrauenswürdiges Verzeichnis zur Laufzeit als sekundäre Runtime registriert werden kann.                                                                                                                                                                                                                                                                                                                                         |
| `persistent_workspace_registration` | ein Workspace-Registrierungs-Store in den Daemon verdrahtet ist. Das Produktions-`runQwenServe` liefert den benutzerbezogenen Store automatisch; direkte `createServeApp`-Embeds müssen einen explizit injizieren und die Start-Wiederherstellung ihrer Workspace-Registry selbst verwalten.                                                                                                                                                                                                                           |
| `scratch_workspace_registration`    | die verwaltete Scratch-Workspace-Erstellung verfügbar ist – eine Runtime-Factory, ein validiertes verwaltetes Scratch-Root und Runtime-Entsorgung sind verdrahtet, und jede verwaltete Runtime respektiert die Scratch-Root-Grenze.                                                                                                                                                                                                                                                                                     |
| `workspace_runtime_removal`         | entfernbare dynamische oder persistent wiederhergestellte sekundäre Runtimes gedrainet und über die Management-Route entfernt werden können.                                                                                                                                                                                                                                                                                                                                                                          |
| `workspace_qualified_acp`           | ACP HTTP und Multi-Workspace-Runtimes aktiv sind, sodass der Plural-ACP-Endpunkt eine sekundäre Runtime auswählen kann.                                                                                                                                                                                                                                                                                                                                                                                              |
| `workspace_qualified_voice`         | Multi-Workspace-Runtimes und der gemeinsame ACP/Voice-WebSocket-Listener aktiv sind, sodass jede Workspace-qualifizierte Voice-Modalität für eine sekundäre Runtime erreichbar ist.                                                                                                                                                                                                                                                                                                                                 |
| `workspace_qualified_memory`        | ACP HTTP und Multi-Workspace-Runtimes aktiv sind, sodass Workspace-qualifizierte Managed-Memory-Routen eine pro-Workspace-Task-Lane für Remember-, Forget- und Dream-Operationen auswählen können.                                                                                                                                                                                                                                                                                                                    |
| `client_mcp_over_ws`                | der Daemon Client-gehostete MCP-Server über den ACP-WebSocket akzeptiert. Dies ist ein explizites Opt-in, nicht für den CDP-Tunnel-Pfad erforderlich.                                                                                                                                                                                                                                                                                                                                                                 |
| `cdp_tunnel_over_ws`                | der Daemon den umgekehrten `/cdp`-WebSocket-Tunnel bereitstellt, entweder durch explizites Opt-in oder weil eine Chrome-Extension-Origin erlaubt ist. Dies bedeutet nur, dass der Tunnel existiert; nicht, dass Chrome-DevTools-MCP-Tools registriert sind.                                                                                                                                                                                                                                                             |
| `browser_automation_mcp`            | ACP HTTP aktiviert ist, `cdp_tunnel_over_ws` aktiv ist, kein Bearer-Token `/cdp` blockiert und `QWEN_CDP_MCP_COMMAND` einen externen Stdio-MCP-Adapter benennt. Das Haupt-CLI-Paket bündelt keinen Browser-Automatisierungs-Adapter; ohne dieses Tag kann die Chrome-Extension-Side-Panel-Chat weiterhin funktionieren, aber Console/Network/Screenshot/Click-Tools werden standardmäßig nicht registriert.                                                                                                           |
| `voice_transcribe`                  | der Voice-WebSocket-Endpunkt gemountet ist; ein konfiguriertes Voice-Modell wird dennoch für eine erfolgreiche Transkription benötigt.                                                                                                                                                                                                                                                                                                                                                                                 |
| `realtime_voice`                    | der macOS-WebShell-Daemon Live Voice aktiviert und native Host-Integration aktiv hat. `/live/status` meldet Bereitschaft, aber die Capability wird zurückgezogen, bis das Feature aktiviert ist.                                                                                                                                                                                                                                                                                                                       |

<!-- conditional-serve-features:end -->

`mcp_guardrails` steht **nicht** in dieser bedingten Tabelle – es ist ein immer aktives Tag, das immer dann beworben wird, wenn die Binärdatei die neuen `/workspace/mcp` Budget-Felder unterstützt, unabhängig davon, ob der Operator ein Budget konfiguriert hat. Operatoren, die `--mcp-client-budget` nicht gesetzt haben, erhalten trotzdem die neuen Felder (mit `budgetMode: 'off'`, `budgets: []`).

`mcp_guardrail_events` (Issue [#4175](https://github.com/QwenLM/qwen-code/issues/4175) PR 14b) bewirbt die typisierten SSE-Push-Events, die Überschreitungen des MCP-Budgetstatus ohne Polling-Loop sichtbar machen. Zwei Frame-Typen werden auf `GET /session/:id/events` empfangen:

- `mcp_budget_warning` — wird einmalig beim Überschreiten der 75%-Marke von `reservedSlots.size / clientBudget` nach oben ausgelöst. Wird erst wieder scharfgeschaltet, wenn das Verhältnis unter 37,5 % fällt (`MCP_BUDGET_REARM_FRACTION`). Spiegelt die Hysterese von `slow_client_warning` aus PR 10 wider, jedoch auf Manager-Ebene und nicht auf der Backlog-Ebene pro Subscriber. Payload: `{ liveCount, reservedCount, budget, thresholdRatio: 0.75, mode: 'warn' | 'enforce' }`. Wird in den Modi `warn` und `enforce` ausgelöst; niemals in `off`.
- `mcp_child_refused_batch` — wird am Ende jedes `discoverAllMcpTools*`-Durchlaufs ausgelöst, wenn einer oder mehrere Server abgelehnt wurden, UND als Batch der Länge 1 auf dem `readResource`-Pfad für Lazy-Spawn-Ablehnungen. Payload: `{ refusedServers: [{ name, transport, reason: 'budget_exhausted' }, ...], budget, liveCount, reservedCount, mode: 'enforce' }`. `mode` ist wörtlich `'enforce'`, da der `warn`-Modus niemals ablehnt.

Beide Events leben im SSE-Replay-Ring pro Session (sie tragen eine `id`), sodass ein Client, der sich mit `Last-Event-ID` reconnectet, durch sie hindurch fortsetzt; der Snapshot unter `GET /workspace/mcp` bleibt die Single Source of Truth für den Zustand nach einer längeren Unterbrechung. Einmal beworben, immer aktiv – es gibt keinen bedingten Toggle. Der SDK-Reducer-State (`DaemonSessionViewState`) stellt `mcpBudgetWarningCount`, `lastMcpBudgetWarning`, `mcpChildRefusedBatchCount` und `lastMcpChildRefusedBatch` für Adapter bereit, die eine einfache Lag-ähnliche UI wünschen.

## Routen

### `GET /health`

Liveness Probe. Die Standardform gibt `200 {"status":"ok"}` zurück, wenn der Listener aktiv ist – ressourcenschonend, kein Bridge-Zugriff, geeignet für hochfrequente Liveness Probes in k8s/Compose.

Übergib `?deep=1` (akzeptiert auch `?deep=true` oder einfach `?deep`) für eine Daemon-weite Probe, die Bridge-**Zähler** über jede verwaltete Workspace-Runtime hinweg aggregiert, einschließlich eines Workspaces, der noch drainend ist (nur informativ, keine echte Liveness-Prüfung):

```json
{
  "status": "ok",
  "workspaceCount": 2,
  "sessions": 3,
  "pendingPermissions": 1,
  "activePrompts": 1,
  "connectedClients": 2,
  "channelAlive": true,
  "lastActivityAt": "2026-07-15T08:30:00.000Z",
  "idleSinceMs": 120000
}
```

`sessions`, `pendingPermissions` und `activePrompts` sind Summen. `lastActivityAt` ist der späteste nicht-null Workspace-Aktivitätszeitpunkt und `idleSinceMs` wird aus demselben Snapshot abgeleitet. `channelAlive` bedeutet, dass mindestens ein verwalteter Workspace-Channel live ist; es bedeutet nicht, dass jeder Workspace gesund ist. `connectedClients` und das optionale `rateLimitHits` bleiben Daemon-weite Zähler und keine pro-Workspace-Summen.

> ⚠️ Die Deep Probe ist **informativ**, keine echte Liveness-Verifizierung oder ein atomarer Reclaim-Lease. Sie liest Zähler-Accessoren, die keine einzelnen Child-Prozesse / Channels pingen und daher keine blockierte, aber dennoch gezählte Session erkennen. `connectedClients` zählt REST-SSE-Connections über alle Workspace-Busse hinweg; es ist kein Proxy für "wie viele Clients actively lesen". Nutze sie für Capacity-Dashboards (aktuelle Parallelität vs. `--max-sessions`, Queue-Tiefe) und nicht als Auslöser für "nimm diesen Daemon aus der Rotation". Eine `503 {"status":"degraded"}`-Antwort ist theoretisch möglich, wenn die Getter einer benutzerdefinierten Bridge-Implementierung einen Fehler werfen, aber die Getter der echten Bridge tun dies niemals – im normalen Betrieb gibt die Deep Probe immer 200 zurück. Verlasse dich für echte Liveness darauf, ob der Listener überhaupt eine TCP-Verbindung akzeptiert (d. h. das Standard-`/health` ohne `?deep`).

**Auth:** nur bei **Non-Loopback-Binds** erforderlich. Bei Loopback (`127.0.0.1`, `::1`, `[::1]`) wird `/health` vor der Bearer-Middleware registriert, sodass k8s/Compose-Probes innerhalb des Pods kein Token mitführen müssen. Bei Non-Loopback (`--hostname 0.0.0.0` usw.) wird die Route nach der Bearer-Middleware registriert und gibt ohne gültiges Token 401 zurück – andernfalls könnte ein unauthentifizierter Caller beliebige Adressen abfragen, um zu bestätigen, dass ein `qwen serve` existiert, was ein Info-Leak mit geringer Schwere ist, das sich schlecht mit Port-Scanning verträgt. CORS-Deny + Host-Allowlist gelten weiterhin für die Loopback-Ausnahme.

### `GET /daemon/status`

Read-only Operator-Diagnostik. Im Gegensatz zu `/health` ist dies eine normale Daemon-API:
sie wird nach der Bearer-Auth und dem Rate-Limiting registriert, auch bei Loopback-
Binds. Query-Parameter:

- `detail=summary` (Standard) liest nur den In-Memory-Daemon-State.
- `detail=full` beinhaltet zusätzlich Live-Session-Diagnostik, ACP-Connection-
  Diagnostik, Auth-Device-Flow-Zählungen und Workspace-Status-Sektionen.
- Jeder andere `detail`-Wert gibt `400 { "code": "invalid_detail" }` zurück.

`summary` fragt absichtlich keine Workspace-Status-Methoden ab, startet keinen ACP-
Child und erzeugt keine Session. `full` fragt jede Workspace-Sektion unabhängig ab;
ein Timeout oder eine Exception markiert nur diese Sektion als `unavailable` und fügt ein
`workspace_status_unavailable` Issue hinzu.

Response-Shape:

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

Multi-Workspace-Antworten enthalten auch Top-Level-`workspaces[]`-Zeilen mit
`{ id, cwd, displayName?, primary, trusted }`. Der optionale Anzeigename wird
weggelassen, wenn nicht gesetzt, und bleibt rein präsentativ; Status-Consumer müssen
weiterhin `id` oder `cwd` verwenden, um Runtimes zu korrelieren.

`runtime.perf` ist optional. Wenn vorhanden, meldet es ausschließlich den Event-Loop-
Lag des Daemon-Prozesses, Prompt-FIFO-Queue-Wartezeit-Samples und Daemon-Child-Pipe-Byte-Zähler;
der Event-Loop-Lag des ACP-Childs ist in `/daemon/status` nicht enthalten.

`status` ist `error`, wenn ein Issue den Schweregrad Error hat, `warning`, wenn ein Issue den
Schweregrad Warning hat, andernfalls `ok`. Issue-Codes sind stabil und umfassen
`session_capacity_high`, `connection_capacity_high`, `pending_permissions`,
`acp_channel_down`, `preflight_error`, `mcp_budget_warning`,
`mcp_budget_exhausted`, `rate_limit_hits`, `channel_worker_exited` und
`channel_worker_partial_connect` sowie `workspace_status_unavailable`. Während
des kurzen Fensters, nachdem der Listener bereit ist, aber bevor die vollständige Runtime
gemountet ist, kann `/daemon/status` `daemon_runtime_starting` melden; wenn das asynchrone
Runtime-Mount fehlschlägt, meldet es `daemon_runtime_failed`, während Non-Status-
Runtime-Routen `503` zurückgeben.

`runtime.activity` meldet die Daemon-weite Prompt-Aktivität. `activePrompts` zählt Sessions mit einem laufenden Prompt. `pendingPrompts` zählt alle akzeptierten Prompts, die noch nicht abgeschlossen sind, einschließlich des laufenden Prompts und der in der FIFO-Warteschlange wartenden Prompts. `queuedPrompts` zählt die in der FIFO-Warteschlange wartenden Prompts, die akzeptiert, aber noch nicht dispatched wurden. `lastActivityAt` ist der ISO-8601-Timestamp des letzten Prompt-Starts/-Endes oder Session-Spawns; `null`, wenn der Daemon seit dem Booten noch keine Aktivität verarbeitet hat. `idleSinceMs` wird zum Zeitpunkt der Response-Generierung aus `lastActivityAt` berechnet.

`limits.memory` ist additiv und meldet die aufgelösten Speicherzahlen des Daemons: ein erforderliches `enforced: false`, ein `childHeap`-Objekt (`mode`; `maxConcurrentChildren` und `perChildCeilingMb`, beide `null` unter `mode: 'off'`, was nichts modelliert – und `perChildCeilingMb` zusätzlich `null`, wo immer keine Partition innerhalb von `modeled.minChildHeapMb` modelliert werden kann – entweder deckt der Pool nicht ein Child auf diesem Floor, oder die Obergrenze würde darunter liegen, sobald sie auf `modeled.legacyChildCeilingMb` begrenzt wird, was `floor(available / 2)` ist und somit auf einem Host unter 1024 MB unter den Floor fällt. Es ist niemals 0, und `maxConcurrentChildren` ist `0` in diesen Fällen, da ein Host, der keine Partition modelliert, eine berechnete Antwort ist und kein fehlendes Modell; sowie `refusals`, die Spawns, die das modellierte Limit überschritten hätten), `configuredBudgetMb`, `effectiveBudgetMb` (der konfigurierte Wert, begrenzt auf aufgelösten Cgroup/Host-Speicher), `budgetSource` (`flag` / `derived`), `availableMemoryMb`, `availableMemorySource` (`constrained` / `host`), `insufficientMemory` und ein `modeled`-Objekt mit `rootReserveMb`, `childPoolMb`, `minChildHeapMb`, `maxChildHeapMb` und `legacyChildCeilingMb` (ein konservatives Modell der Obergrenze, die ein ACP-Child heute erhält, das unter dem tatsächlichen Wert liegen kann). `runtime.memory` meldet zusätzlich `registeredWorkspaces` (die Registrierungszahl – nicht entfernte Workspace-Einträge, einschließlich drainender, wechselnder oder blockierter; keine Live-Child-Zahl), `activeAcpChildren` (Daemon-verwaltete ACP-Children mit einem live, nicht sterbenden Channel – umfasst wechselnde oder blockierte Einträge, schließt aber einen Workspace aus, dessen Kill begonnen hat, auch wenn das Child nicht beendet ist; keine Channel-Worker, MCP-Descendants oder nicht angehängte Spawn-Reservierungen), `childRssCoverage` (`active_children` – jedes ACP-Child mit einem live Channel, also die Menge, die `activeAcpChildren` zählt; ältere Daemons senden `primary_only`), ein unten beschriebenes `children`-Objekt und ein `modeled`-Objekt mit `recommendedShareAtRegisteredMb` (`null`, wenn kein Workspace registriert ist) und `recommendedShareAtActiveMb` (`null`, wenn kein Child aktiv ist). Jede Share wird auf die Legacy-Child-Obergrenze begrenzt und nur auf den minimalen Child-Heap gesetzt, wenn die Obergrenze dies zulässt – auf einem kleinen Host liegt die Obergrenze unter dem Minimum, sodass Share × Anzahl den Child-Pool überschreiten kann. Lies eine Share als beratend, nicht als Partition des Pools. All dies ist Beobachtung: Kein Child-Spawn-Argument leitet sich aus diesen Werten ab, und keine Anfrage wird auf ihrer Grundlage abgelehnt. `childHeap` modelliert eine feste Partition von `modeled.childPoolMb` – jedes Child würde dieselbe `perChildCeilingMb` erhalten, sodass das modellierte Total innerhalb des Pools bleibt, anstatt sich als pro-Spawn-Share zu akkumulieren. Lies `refusals` nur als Admission-Druck: Ein Count von 0 bedeutet **nicht**, dass die Partition sicher anwendbar ist, da Children auf der viel größeren Host-abgeleiteten Obergrenze laufen, sodass ein Workload, der mehr Old Space als `perChildCeilingMb` benötigt, hier gesund ist und erst nach Anwendung der Partition fehlschlagen würde. Zwei weitere Gründe, warum ein Count ungleich null keinen Capacity-Druck bedeuten muss: die Admission-Entscheidung zählt ein terminierendes Child bis es beendet ist, sodass auf einem Daemon bereits bei `maxConcurrentChildren` jeder Channel-Ersatz eine Refusal während des Überlappungsfensters bucht; und auf einem Host, der zu klein ist, um eine Partition zu modellieren, ist `maxConcurrentChildren` `0`, sodass `refusals` dem gesamten ACP-Spawn-Count entspricht, wobei `insufficientMemory` das erklärende Feld ist. Auf dem normalen `runQwenServe`-Pfad wird das Budget aufgelöst, bevor die Bootstrap-App erstellt wird, sodass `limits.memory` bereits während des Bootstrap-Fensters belegt ist. Es ist nur `null` auf Pfaden, die kein Budget auflösen (wie Direct-Embed, das `runQwenServeImpl` umgeht). Der SDK-Typ erlaubt `null`, daher kommen korrekte Clients damit zurecht.

`runtime.memory.children` ist additiv innerhalb dieses Blocks und meldet aggregiertes RSS über die Children, die `childRssCoverage` benennt: `rssBytes` (ihre summierten selbstberichteten RSS), `sampled` (wie viele einen Messwert geliefert haben) und `oldestReadingAgeMs` (das Alter des ältesten Messwerts in der Summe, sodass ein Aufrufer erkennen kann, wie weit auseinander die Teile aufgenommen wurden). Der Nenner für `sampled` ist das Geschwisterfeld `activeAcpChildren`, das nicht innerhalb des Blocks wiederholt wird; wenn `sampled` niedriger ist, ist `rssBytes` ein Floor statt ein Total. Sampling erfordert einen aktiven SSE/WS-Watcher, sodass eine Status-Anfrage an einen Daemon, von dem niemand streamt, `sampled: 0` meldet, selbst mit live Children – `activeAcpChildren` daneben macht diese Lücke sichtbar, und `rssBytes: 0` mit `sampled: 0` bedeutet niemals eine gemessene Null. `oldestReadingAgeMs` ist `null`, wenn nichts gesampled wurde, und auch wenn jeder Beiträger eine Bridge ist, die das Feld noch nicht kennt, es bedeutet also niemals "frisch". Lies die Summe gleichzeitig als Über- und Unterzählung: Das Summieren von Pro-Zessess-RSS zählt Seiten doppelt, die die Children teilen, während jedes Child nur seinen eigenen Prozess meldet, sodass seine MCP-Descendants und alle Channel-Worker fehlen. Es ist nicht der Speicher des Daemon-Trees. Das Feld ist im SDK-Mirror optional, da Daemons, die `primary_only` melden, es niemals senden.

`runtime.memory.pressure` ist additiv innerhalb dieses Blocks und meldet den eigenen Speicherdruck des Daemon-Root: `mode` (`off` / `observe`), `level` (`normal` / `soft` / `hard` / `critical`), `source` (`rss` / `heap` / `unknown`), `ratio` und die sechs Rohwerte, aus denen die Verhältnisse berechnet werden – `rssBytes`, `rssRatio`, `availableBytes`, `heapUsedBytes`, `heapRatio`, `heapLimitBytes`. `ratio` ist das größere von `rssRatio` und `heapRatio`, und `source` benennt, welches es war; Gleichstände werden als `rss` gemeldet. `availableBytes` ist `limits.memory.availableMemoryMb` in Bytes – absichtlich der erkannte Cgroup/Host-Wert statt `effectiveBudgetMb`, weil den Prozess die reale Grenze beendet, nicht die Policy-Zahl eines Operators. `source: "unknown"` bedeutet, dass keiner der Nenner messbar war, und darf nicht als gesund gelesen werden; `level` ist nur in diesem Fall `normal`, weil es nichts zu klassifizieren gibt. Die Werte betreffen ausschließlich den **Daemon-Root-Prozess**: es ist das eigene `memoryUsage()` dieses Prozesses, sodass wachsende Children sie nicht bewegen. `runtime.memory.children` meldet diese separat, und keiner der Werte ist der Prozess-Tree-Speicher. Beide Modi melden den gesamten Block; nur `observe` löst zusätzlich die pfadlose `daemon_memory_pressure`-Warnung in das Status-Rollup aus, sodass `off` den Top-Level-`status` unverändert lässt. In keinem Modus wird etwas remediiert. Das Feld ist im SDK-Mirror optional, da Daemons, die `runtime.memory` vor dessen Existenz ausgeliefert haben, den Block ohne es senden.

`limits.maxTotalSessions` ist additiv. `null` bedeutet, dass das effektive Daemon-weite Frisch-Session-Limit deaktiviert ist. Wenn mehrere Startup/wiederhergestellte Workspaces vorhanden sind, `--max-total-sessions` weggelassen wird und `maxSessionsPerWorkspace` endlich ist, leitet der Daemon das effektive Gesamtlimit einmal als `maxSessionsPerWorkspace * startupWorkspaceCount` ab; spätere dynamische Registrierung berechnet es nicht neu. Wenn gesetzt, begrenzt es die Frisch-Session-Erstellung Daemon-weit und meldet Gesamtlimit-Fehler mit der bestehenden `session_limit_exceeded`-Fehlerform plus `scope: "total"`.

`runtime.channel.live` meldet den ACP-Bridge-Channel innerhalb des Daemons. Es ist
nicht der Channel-Adapter-Worker. Daemon-verwaltete Channels nutzen
`runtime.channelWorker`, dessen `state` einer von `disabled`, `starting`,
`running`, `exited`, `failed` oder `stopped` ist. Wenn ein Worker `running` erreicht
und dann beendet wird, hält `/daemon/status` den Daemon online und meldet den Warning-
Issue-Code `channel_worker_exited`.

Der Start von Daemon-verwalteten Channel-Workern bleibt fail-fast: Wenn `qwen serve
--channel ...` keinen Worker starten kann, der den Ready-Zustand erreicht, schlägt der Serve-Start fehl.
Nachdem ein Worker Ready erreicht hat, werden unerwartete Beendigungen vom Serve-
Supervisor innerhalb einer begrenzten Policy neu gestartet: bis zu 3 Neustartversuche in einem 5-Minuten-
Fenster, mit 1s, 5s und dann 15s Backoff. Der Worker sendet alle
15s IPC-Heartbeats; wenn 45s lang keine Heartbeat beobachtet wird, behandelt der Supervisor den Worker als
veraltet, killt ihn, protokolliert `staleHeartbeatAt` und nutzt denselben Neustart-Pfad.

`runtime.channelWorker` kann additive operative Felder enthalten:
`requestedChannels`, `pid`, `startedAt`, `exitCode`, `signal`, `error`,
`restartCount`, `lastExitAt`, `lastRestartAt`, `nextRestartAt`,
`lastHeartbeatAt`, `staleHeartbeatAt`, `startupFailures` und
`startupFailuresTruncated`. Jeder Startup-Fehler hat `channel`, `phase`
(derzeit `connect`), optionales vom Adapter bereitgestelltes `code` und eine Credential-
bereinigtes `message`. Maximal 64 Fehler werden für die aktuelle Worker-Generation
behalten; das Truncation-Flag bedeutet, dass mehr Fehler beobachtet wurden. `code` ist
diagnostisch und keine stabile Cross-Adapter-Klassifikation. `restartCount` ist die über die Lebensdauer
Gesamtzahl der Neustartversuche, die von diesem Serve-Prozess unternommen wurden; ein laufender Worker mit
`restartCount > 0` ist gesund, sofern kein anderes Issue vorliegt. Ein laufender Worker,
dessen `requestedChannels` Namen enthalten, die in `channels` fehlen, meldet
`channel_worker_partial_connect`.

Bei einem Multi-Workspace-Daemon (`--workspace` wiederholt) enthält `runtime` zusätzlich
`channelWorkers[]` – ein Eintrag pro besitzendem Workspace, jeweils ein
`channelWorker`-Snapshot, annotiert mit `workspaceId`, `workspaceCwd` und
`primary`. `channelWorker` bleibt als Snapshot des primären Workspaces für
Kompatibilität belegt. Single-Workspace-Daemons lassen `channelWorkers[]` weg.

### Daemon-verwaltete Channel-Steuerung

Die `channel_control`-Capability bewirbt die Runtime-Selection-Ressource.
Die Ressource ist Daemon-weit, auch wenn ihr Kompatibilitätspfad den
Singular-`/workspace`-Prefix verwendet. Runtime-Selections werden nicht persistiert und
modifizieren nicht die Boot-Zeit-`--channel`-Option des Daemons.

`GET /workspace/channel` gibt einen unveränderlichen Manager-Snapshot zurück:

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

`selection` ist `null`, wenn deaktiviert. `pendingSelection` ist nur während
einer Mutation vorhanden. `transition` ist einer von `idle`, `starting`, `reconciling`,
`stopping` oder `rolling_back`.

`PUT /workspace/channel` ist strikt-gated und akzeptiert genau eine Selection:

```json
{ "selection": { "mode": "all" } }
```

```json
{ "selection": { "mode": "names", "names": ["telegram", "feishu"] } }
```

Namen werden getrimmt und dedupliziert ohne Sortierung; ein leeres Namens-Array ist
ungültig. `all` bleibt nur für den primären Workspace. Eine Disabled-to-Enabled-Änderung
gibt `201` zurück; ein idempotentes PUT oder Ersatz gibt `200` zurück. Die Antwort ist
`{ changed, replaced, partial, state }`. Eine gleiche Selection behält gesunde
Worker bei, stellt aber eine gleiche Selection wieder her, deren Worker gestoppt oder
fehlgeschlagen ist.

`DELETE /workspace/channel` ist strikt-gated und idempotent. Es gibt
`{ changed, state }` zurück; ein erfolgreicher Zustand ist disabled. `POST
/workspace/channel/reload` ist ebenfalls strikt-gated und liest Einstellungen neu,
löst Workspace-Gruppen neu auf und erzwingt die Reconciliation der committeten Selection.
Es gibt `409 channel_worker_not_enabled` zurück, wenn deaktiviert. Die
`channel_reload`-Capability wird dynamisch nur beworben, während der Manager
eine committete, reloadbare Selection hat.

Jedes Enable, Replace, Reload, Stop und Daemon-Shutdown betritt eine FIFO-
Lifecycle-Lane. GET wartet nicht auf diese Lane. Workspace-Gruppen, deren geordnete
Selection sich nicht geändert hat, bleiben online. Ersatzfehler versuchen, neu gestartete
Worker zu stoppen und die vorherige committete Selection wiederherzustellen. Clients
müssen `rolledBack`, `rollbackError` und `state` inspizieren, da Bereinigung oder
Wiederherstellung ebenfalls fehlschlagen können. Der Daemon behält die Channel-Service-PID-Lease
während einer Transaktion und gibt sie nicht frei, bis jeder relevante Child-
Exit bestätigt ist.

Stabile Control-Fehler sind:

- `400 invalid_channel_selection`, `channel_workspace_mismatch` oder `ambiguous_channel_workspace`
- `403 untrusted_workspace`
- `409 channel_service_conflict` oder `channel_worker_not_enabled`
- `500 channel_worker_stop_failed`
- `502 channel_worker_start_failed`, mit `rolledBack` und einem optionalen Credential-bereinigten `rollbackError`
- `503 daemon_draining`

Strikte Schreibvorgänge gegen einen Daemon ohne konfigurierten Token geben `401
token_required` zurück, bevor der Control-Code läuft. Sobald eine Anfrage beginnt, annulliert das
Trennen des HTTP-Clients die Lifecycle-Transaktion nicht; Clients können dasselbe PUT
sicher wiederholen.

Für `502 channel_worker_start_failed` kann die Antwort auch
`startupFailures[]` und `startupFailuresTruncated` enthalten. Jeder Fehler fügt das
vertrauenswürdige `workspaceCwd` des versuchten Workers hinzu. Diese Felder beschreiben die
fehlgeschlagene Transaktion, während `state` den aktuellen Zustand nach dem Rollback beschreibt;
ein späteres GET behält den fehlgeschlagenen Versuch nicht. Ein teilweise verbundener Worker
gibt stattdessen Erfolg zurück und legt seine Fehler im Worker-Snapshot offen. Boot-
Zeit-Alle-Fehler bricht weiterhin `qwen serve` ab, bevor ein abfragbarer Daemon existiert.

`qwen channel status` ohne `--daemon-url` liest weiterhin Pidfile-Metadaten;
mit `--daemon-url` liest es `GET /workspace/channel`. Während eines Neustart-
Fensters bleibt das Serve-eigene Pidfile reserviert, aber `workerPid` wird weggelassen, damit
Clients keinen veralteten Worker-Prozess anzeigen. Bei einem Multi-Workspace-Daemon trägt das
Pidfile auch ein additives `workers[]`-Array (pro-Workspace
`workspaceId` / `workspaceCwd` / `channels` / live `workerPid`), während die
Top-Level-`channels` (Union) und `workerPid` (Primary) für ältere
Leser belegt bleiben; Single-Workspace-Daemons behalten die ursprüngliche Single-Worker-Form. Worker-
stdout/stderr werden in das Daemon-Log weitergeleitet, wobei Bearer-Tokens, sensible Worker-Umgebungs-
Werte und Proxy-URL-Credentials geschwärzt werden.

### Workspace-Channel-Management

Die `channel_management`-Capability bewirbt Workspace-scopige Channel-
Konfiguration und Runtime-Management. Die Singular-`/workspace`-Routen zielen auf
die primäre Runtime. `/workspaces/:workspace` löst die exakte registrierte,
vertrauenswürdige Runtime auf und fällt niemals auf die primäre Runtime zurück.

Read-only Discovery verwendet:

- `GET /workspace/channel-types`
- `GET /workspace/channels`
- `GET /workspaces/:workspace/channel-types`
- `GET /workspaces/:workspace/channels`

Der Katalog markiert die von dieser Management-API unterstützten Typen mit
`manageable: true`. Instanz-Snapshots enthalten eine Revision, geschwärzte Secret-
Präsenzmetadaten, Startup-Zustand und Runtime-Zustand; literale Secrets werden niemals
zurückgegeben. Channel-Snapshots verwenden `Cache-Control: no-store`.

Field-Deskriptoren können über `properties` verschachtelte Objekt-Metadaten bereitstellen.
Numerische Deskriptoren können `exclusiveMinimum` für offene Untergrenzen verwenden. Clients,
die einen beworbenen Field-Kind nicht rendern, müssen seinen bestehenden Konfigurationswert
beibehalten, anstatt ihn zu erzwingen oder zu löschen. Objekt-Felder können nicht erforderlich sein,
und verschachtelte Properties können keine Secrets oder Environment-auflösbaren Felder sein;
diese Management-Protokolle bleiben nur auf Top-Level-Ebene. Eine verschachtelte `required`-Property
wird nur durchgesetzt, während ihr Elternobjekt im Write vorhanden ist; das Weglassen des
Elternobjekts lässt seine verschachtelten Anforderungen ungeprüft. Writes ersetzen den
gespeicherten Wert jedes Feldes vollständig, sodass das Beibehalten eines Objekts das erneute Senden des
gespeicherten Objekts bedeutet; der Daemon führt keine partiellen Objekte zusammen.

Konfigurationsschreibvorgänge verwenden optimistische Concurrency und das strikte Bearer-Token-
Gate:

- `PUT /workspace/channels/:name`
- `DELETE /workspace/channels/:name`
- `PUT /workspace/channels/:name/startup`
- die äquivalenten `/workspaces/:workspace/...`-Routen

Jede Einstellungsmutation enthält `expectedRevision`. Upsert-Anfragen enthalten ein
`config`-Objekt und können explizite Secret-Operationen enthalten: `preserve`,
`replace` oder `clear`. Eine Channel-Konfiguration kann kein Arbeitsverzeichnis außerhalb des aufgelösten Workspaces auswählen.

Runtime-Aktionen sind strikt-gated `POST`-Anfragen an
`.../channels/:name/start`, `stop` oder `restart`. Sie wirken nur auf den
Worker, der dem aufgelösten Workspace gehört.

Pairing-Management ist nur für Instanzen verfügbar, die mit der
`pairing`-Sender-Policy oder Group-Policy konfiguriert sind:

- `GET .../channels/:name/pairing-requests`
- `POST .../channels/:name/pairing-requests/approve` mit `{ "code": "..." }`
- `GET .../channels/:name/pairing-approvals`
- `DELETE .../channels/:name/pairing-approvals` mit
  entweder `{ "senderId": "..." }` oder `{ "groupId": "..." }`

Alle Pairing-Routen erfordern einen Bearer-Token und verwenden `Cache-Control: no-store`.
Anfragen, Genehmigungen und Widerrufe sind auf die ausgewählte Channel-
Instanz und den Workspace beschränkt. Ausstehende Anfragen enthalten ein typisiertes User- oder Group-Subject;
Group-Anfragen behalten zusätzlich den Sender, der die Anfrage initiiert hat. Genehmigungs-Snapshots enthalten
`senderIds` und `groupIds`, da Allowlist keine Anzeigenamen persistieren. Der Widerruf eines unbekannten Users
oder einer unbekannten Group gibt `404 channel_pairing_approval_not_found` zurück.

### Channel-Delivery und Notify

`channel_delivery` bewirbt sofortige, best-effort Delivery-Unterstützung. Es ist eine
Protokoll-Capability, kein Worker-Gesundheitssignal. Delivery startet niemals einen
fehlenden Worker, fällt auf einen anderen Workspace zurück, wiederholt, persistiert eine Outbox
oder spielt historische Benachrichtigungen ab.

Direct Notify umgeht Agent und Session und wartet auf einen Sendeversuch:

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

Beide Routen verwenden das strikte Mutations-Gate. Die qualifizierte Route löst nur einen
registrierten, vertrauenswürdigen Workspace auf. Erfolg ist `200 {delivered:true,deliveryId}`.
`delivered:true` bedeutet, dass das Channel-Send-Promise aufgelöst wurde; es beweist nicht
Provider-Akzeptanz, Benutzer-Empfang oder eine Lesebestätigung. Providerspezifische
Antwortvalidierung und konsistente Error-Reason-Semantik über IM-Adapter hinweg
liegen außerhalb dieses V1-Contracts.
Fehler sind `400 channel_delivery_invalid`, `503 channel_worker_unavailable` oder
`channel_delivery_queue_full`, `504 channel_delivery_timeout` und `502
channel_delivery_rejected` oder `channel_delivery_failed`. Ein Timeout hat ein
unbekanntes Ergebnis und wird nicht wiederholt.
Es gibt absichtlich keinen separaten Konnektivitätstest-Endpunkt: ein normaler
Notify-Aufruf ist der End-to-End-Test.

Das replaybare Ergebnis-Event enthält nur Korrelation und bereinigten Status:

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

Ein leerer erfolgreicher Prompt-Abschluss lässt Fehlerfelder weg:

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

`source` ist `prompt` oder `scheduled`; `status` ist `delivered`, `failed` oder
`skipped`. `skipped` bedeutet, dass der berechtigte Turn erfolgreich abgeschlossen wurde, aber sein
letzter toolfreier Assistant-Antwortblock leer oder nur Whitespace war. Der
Daemon verbraucht die Delivery-Autorisierung und veröffentlicht das Event, ohne
einen Channel-Worker aufzulösen. Die Scheduled-Korrelation verwendet `taskId` und `firedAt`.
Das Event enthält niemals Ziel-IDs, Nachrichtentext, Credentials oder Webhook-
Secrets.

Sicherheit: Die Response enthält niemals Bearer-Tokens, Client-IDs, vollständige ACP-
Connection-IDs, Device-Flow-User-Codes oder Verifizierungs-URLs. Beide Detail-
Ebenen können additive `daemon.runId`, `daemon.logMode` und
`daemon.logHealth` enthalten. `summary` lässt den Daemon-Log-Pfad und Verlustdetails
weg; `full` kann `logPath`, `logIssues`, `logDroppedRecords` und
`logDroppedBytes` für authentifizierte Operatoren enthalten. Degraded File Logging fügt den
pfadfreien `daemon_log_degraded`-Warning zur normalen Status-Zusammenfassung hinzu.

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
    "maxTotalSessions": 64
  },
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

Stabiler Contract: Wenn `v` erhöht wird, hat sich das Frame-Layout auf eine abwärtsinkompatible Weise geändert.

> **`protocolVersions`** beschreibt die Serve-Protokollversionen, die der Daemon sprechen kann. `current` ist die bevorzugte Protokollversion des Daemons und `supported` ist die kompatible Menge. Clients, die ein bestimmtes Protokoll benötigen, sollten `supported` prüfen; feature-spezifische UIs sollten weiterhin auf `features` prüfen. Additiv zu v=1: Ältere v=1-Daemons lassen dieses Feld weg, daher sollten SDK-Clients, die auf ältere Builds abzielen, es als optional behandeln.

> **`modelServices` ist in Stage 1 immer `[]`.** Der Agent nutzt seinen einzelnen Standard-Model-Service und zählt ihn nicht über das Wire auf. Stage 2 wird dies aus registrierten Model-Adaptern befüllen, damit SDK-Clients Service-Picker bauen können; verlasse dich bis dahin NICHT darauf, dass dieses Feld nicht leer ist.

> **`workspaceCwd`** ist der kanonische absolute Pfad für den primären Workspace des Daemons. Verwende ihn, um `cwd` bei `POST /session` wegzulassen (die Route fällt auf diesen primären Pfad zurück) und um alte Single-Workspace-Clients kompatibel zu halten. Additiv zu v=1: Pre-§02 v=1-Daemons lassen das Feld weg – Clients, die auf ältere Builds abzielen, sollten einen Null-Check durchführen, bevor sie es konsumieren.

> **`workspaces[]`** listet jede registrierte Runtime auf. Neuere Single-Workspace-Daemons schließen die primäre Runtime ein, auch wenn `multi_workspace_sessions` fehlt, sodass Clients die stabile ID entdecken können, die für Workspace-qualifizierte Routen erforderlich ist; ältere Daemons können das Array weglassen. Jeder Eintrag ist `{ id, cwd, displayName?, primary, trusted, removable? }`. `displayName` ist rein präsentativ und wird weggelassen, wenn nicht gesetzt. Der erste/primäre Workspace wird weiterhin von `workspaceCwd` gespiegelt; neue Clients wählen eine nicht primäre Runtime, indem sie das `cwd` dieses Eintrags an `POST /session` übergeben. Nicht vertrauenswürdige Workspaces werden für die Diagnostik beworben, lehnen aber die Frisch-Session-Erstellung mit `403 untrusted_workspace` ab, bis sich der Trust ändert. `removable` ist auf Daemons vorhanden, die Runtime-Entfernung unterstützen, und ist nur für prozessdynamische oder persistent wiederhergestellte sekundäre Runtimes true.

Die Workspace-Feature-Tags und `workspaces[]` sind dynamisch. Clients, die einen Workspace hinzufügen, müssen `/capabilities` erneut abrufen, nachdem die Mutation abgeschlossen ist; der Daemon broadcastet keine Capability-Änderungen an Clients, die eine frühere Antwort zwischengespeichert haben. Das Vergessen der Persistenz entlädt keine aktive Runtime, sodass diese Runtime bis zum Neustart beworben bleibt.

### `POST /workspaces`

Registriere eine zusätzliche Workspace-Runtime. Der Pfad muss ein bestehendes, zugängliches, absolutes Verzeichnis sein, das nicht mit einem anderen registrierten Workspace dupliziert oder verschachtelt ist. Die Registrierung ist prozesslokal, es sei denn, der Client sendet `persist: true`; Clients müssen `persistent_workspace_registration` vorab prüfen, bevor sie Persistenz anfordern. Wenn `workspace_display_name` beworben wird, kann die Anfrage auch einen optionalen `displayName` enthalten.

```json
{
  "cwd": "/canonical/path/to/secondary-workspace",
  "persist": true,
  "displayName": "Payments Production"
}
```

Eine neu erstellte Runtime gibt `201` zurück; das Befördern eines bereits aktiven sekundären Workspaces auf persistent gibt `200` zurück. Persistenter Erfolg enthält `persisted: true`:

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

`displayName` muss ein String mit maximal 256 Zeichen sein, nachdem umgebender Whitespace getrimmt wurde. Ein leeres Ergebnis wird als kein Name behandelt, und interne C0- (`U+0000`–`U+001F`) oder DEL-(`U+007F`) Steuerzeichen werden abgelehnt. JSON `null` ist kein Erstellungswert und gibt `400 invalid_display_name` zurück; lass das Feld weg, um keinen initialen Namen anzugeben. Doppelte Anzeigenamen sind erlaubt. Ein Name, der mit einer prozesslokalen Registrierung angegeben wird, gilt nur für diesen Daemon-Prozess; `persist: true` speichert ihn mit der persistenten Registrierung, sodass er nach dem Neustart wiederhergestellt werden kann. Das Wiederholen der Anfrage für einen bereits persistenten Workspace ist idempotent und benennt ihn nicht um.

Fehler umfassen `400 invalid_path` / `invalid_persist_flag` / `invalid_persist_target` / `invalid_display_name`, `409 workspace_exists` / `workspace_nested` / `workspace_limit_reached`, `500 workspace_registration_store_error` / `runtime_creation_failed` und `501 persistence_not_available` / `not_implemented`.

### `PATCH /workspaces/:workspace`

Aktualisiere eine aktive Workspace-Ressource, ausgewählt nach Workspace-ID oder URL-kodiertem absoluten CWD. Der Endpunkt unterstützt derzeit nur Display-Name-Metadaten:

```json
{ "displayName": "Payments Production" }
```

Sende `{ "displayName": null }`, um den Namen zu löschen. Hier ist `null` ein nur-updatefähiges Lösch-Sentinel; Nicht-Null-Werte folgen denselben String-Normalisierungsregeln wie `POST /workspaces`. Die Antwort ist die aktualisierte `{ id, cwd, displayName?, primary, trusted, removable? }` Workspace-Projektion. Runtime-Metadaten werden immer aktualisiert. Wenn die Runtime passende persistente Registrierungsidentitäten hat, wird jeder Alias atomar über den bestehenden Schema-v1-Registrierungs-Store aktualisiert; der Endpunkt erstellt oder befördert niemals eine persistente Registrierung.

Nicht unterstützte Felder schlagen fail-closed fehl, anstatt stillschweigend ignoriert zu werden. Fehler umfassen `400 empty_patch` / `invalid_display_name` / `unsupported_field` / `workspace_mismatch`, `409 workspace_registration_in_progress`, `500 workspace_registration_store_error` und `503 daemon_shutting_down`.

### `DELETE /workspaces/:workspace`

Entferne eine entfernbare sekundäre Runtime. Der Selektor folgt den Plural-Workspace-Routing-Regeln und akzeptiert entweder eine Workspace-ID oder ein URL-kodiertes absolutes CWD. Der optionale JSON-Body ist `{ "force": boolean }`; das Weglassen fordert nicht-erzwungene Entfernung an.

Nicht-erzwungene Entfernung gibt `409 workspace_busy` mit einem `activity`-Snapshot zurück, wenn die eingefrorene Runtime Sessions, Prompts, ausstehende Starts, ACP-Connections, Memory-Tasks oder Workspace-Channel-Worker hat. Das Senden von `{ "force": true }` fordert die Beendigung dieser Ressourcen an. Die Persistenzentfernung ist der Commit-Punkt: nachfolgende Bereinigung ist begrenzt und best-effort, Bereinigungsfehler werden protokolliert, und die logische Entfernung konvergiert weiterhin, anstatt die Runtime wiederherzustellen. Eine erfolgreiche Antwort ist:

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

Eine sofort beschäftigte nicht-erzwungene Anfrage gibt einen schnellen Pre-Drain-Aktivitäts-Snapshot zurück. Sobald der Drain beginnt, enthält die Busy- oder Erfolgsantwort den endgültigen Snapshot, der nach dem Schließen der Admission- und ACP-Drain-Gates und vor dem Beginn der Bereinigung aufgenommen wurde. Fehler umfassen `400 invalid_force_flag` / `workspace_mismatch`, `409 workspace_busy` / `primary_workspace_removal_forbidden` / `static_workspace_removal_forbidden` / `workspace_removal_in_progress` / `workspace_registration_in_progress`, `500 workspace_persist_failed` / `workspace_runtime_removal_failed`, `501 workspace_runtime_removal_unsupported` und `503 daemon_shutting_down`.

### `GET /workspace-registrations`

Liste die persistierte gewünschte Workspace-Menge für diesen primären Workspace auf. Einträge bleiben mit `active: false` sichtbar, wenn ein gespeichertes Verzeichnis während des aktuellen Starts nicht wiederhergestellt werden konnte.
Ein Eintrag bleibt `active: true`, während seine Runtime drainend ist, da die Runtime weiterhin Live-Ressourcen besitzt, bis die Entfernung abgeschlossen ist.
Einträge enthalten optional `displayName`, wenn die persistente Registrierung einen hat.

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

Gibt `501 persistence_not_available` zurück, wenn kein Registrierungs-Store konfiguriert ist, und `500 workspace_registration_store_error`, wenn der Store nicht gelesen werden kann.

### `DELETE /workspace-registrations/:id`

Vergiss eine persistierte Registrierung. Dies entlädt keine aktive Runtime oder beendet ihre Sessions; `restartRequired: true` bedeutet, dass die aktive Runtime beim nächsten Daemon-Neustart verschwindet.

```json
{ "removed": true, "active": true, "restartRequired": true }
```

Gibt `404 workspace_registration_not_found`, `500 workspace_registration_store_error` oder `501 persistence_not_available` zurück. Wie andere Mutationsrouten erfordert dieser Endpunkt Mutationsauthentifizierung, wenn die Daemon-Authentifizierung aktiviert ist.

### Read-only Runtime-Status-Routen

Diese Routen melden Daemon-seitige Runtime-Snapshots. Es sind additive v1-Routen,
die den Zustand nicht verändern und die Serve-Protokollversion nicht ändern. Workspace-
Status-Routen starten absichtlich **nicht** den ACP-Child-Prozess, nur weil
ein Client eine GET-Route pollt: Wenn der Daemon im Leerlauf ist, geben sie
`initialized: false` mit einem leeren Snapshot zurück. Session-Status-Routen erfordern eine
Live-Session und geben `404 { code: "session_not_found", ... }` für unbekannte
IDs zurück.

Capability-Tags:

- `workspace_mcp` → `GET /workspace/mcp`
- `workspace_skills` → `GET /workspace/skills`
- `workspace_providers` → `GET /workspace/providers`
- `workspace_acp_status` → `GET /workspace/acp/status`
- `workspace_env` → `GET /workspace/env`
- `workspace_preflight` → `GET /workspace/preflight`
- `session_context` → `GET /session/:id/context`
- `session_supported_commands` → `GET /session/:id/supported-commands`
- `session_tasks` → `GET /session/:id/tasks`
- `session_monitor_tool_correlation` → Monitor-Einträge aus `GET /session/:id/tasks`
  enthalten `toolUseId` für Transkript-zu-Task-Korrelation
- `session_status` → `GET /session/:id/status`
- `session_info` → `GET /workspace/:id/session-info` und `GET /workspaces/:workspace/session-info`
- `session_transcript` → `GET /session/:id/transcript`
- `workspace_persisted_transcript` → `GET /workspaces/:workspace/session/:id/transcript`
- `workspace_session_export` → `GET /workspaces/:workspace/session/:id/export`
- `workspace_archived_session_export` → `GET /workspaces/:workspace/session/:id/archive/export`
- `workspace_qualified_memory` → `POST /workspaces/:workspace/memory/{remember,forget,dream}` und `GET /workspaces/:workspace/memory/{remember,forget,dream}/:taskId`

`workspace_acp_status` meldet die punktuelle Liveness des primären Workspace-ACP-Channels
als `{ channelLive: boolean }`. Der Handler erstellt keinen Channel, aber das Erreichen einer
Runtime-Route kann zuerst eine verzögerte Daemon-Runtime starten, deren konfigurierte
Startup-Policy unabhängig ACP vorheizen kann. Der Snapshot ist kein Lease: Clients müssen
die Session-Erstellung den Channel neu validieren oder starten lassen.

### ACP-Preheat

Capability-Tag: `workspace_acp_preheat`.

`POST /workspace/acp/preheat?timeoutMs=N` initialisiert best-effort den primären
Workspace-ACP-Channel. `timeoutMs` ist standardmäßig 5000 und muss eine positive
Ganzzahl sein, die nicht größer als 60000 ist. Gleichzeitige Aufrufer und Session-Erstellung teilen
sich dieselbe Bridge-Initialisierung. Ein Anfrage-Timeout beendet nur dieses HTTP-Warten; er
annulliert nicht die gemeinsame Initialisierung.

```ts
interface WorkspaceAcpPreheatResult {
  ready: boolean;
  channelLive: boolean;
  durationMs: number;
  reason?: 'timeout' | 'error';
  error?: string;
}
```

`ready` entspricht immer `channelLive`. Eine Live-Antwort lässt `reason` und
`error` weg; andernfalls ist `reason` `timeout` oder `error`. `durationMs` misst den
aktuellen HTTP-Aufruf, nicht die volle Lebensdauer einer Initialisierung, der der Aufruf beigetreten ist.
Operativer Timeout oder Fehler gibt HTTP 200 zurück. Ungültiges `timeoutMs` gibt
400 zurück, während Authentifizierungs-, Rate-Limiting- und Deferred-Runtime-Fehler ihre
normalen Antworten behalten.

Beide ACP-Workspace-Routen sind Singular und nur für den primären Workspace. Clients
dürfen sie nicht für einen sekundären Workspace verwenden oder eine der beiden Antworten als
dauerhafte Bereitschaftszusage interpretieren.

Allgemeine Status-Zelle:

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

`errorKind` ist eine geschlossene Enum, die von `/workspace/preflight`,
`/workspace/env` und (schließlich) MCP-Guardrails gemeinsam genutzt wird, damit SDK-Clients Remediation pro Kategorie rendern können, anstatt Freiform-Nachrichten zu parsen. PR 13
(#4175) hat die sieben oben aufgeführten Literale eingeführt; PR 14 wird `blocked_egress` befüllen, sobald der Egress-Check implementiert ist.

Status-Payloads legen niemals MCP-Umgebungsvariablen-Werte, Header, OAuth/Service-Account-Details, Provider-API-Keys, Provider-`baseUrl` / `envKey`, Skill-Body, Skill-Dateisystempfade, Hook-Definitionen oder Werte geheimer Umgebungsvariablen offen. `/workspace/env` meldet nur das **Vorhandensein** von Whitelist-Umgebungsvariablen; Proxy-URLs werden vor der Übertragung von Zugangsdaten bereinigt und auf `host:port` reduziert.

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

`discoveryState` ist entweder `not_started`, `in_progress` oder `completed`.
`transport` ist entweder `stdio`, `sse`, `http`, `websocket`, `sdk` oder
`unknown`. `errors` wird weggelassen, wenn die Discovery erfolgreich ist.

**MCP-Client-Guardrails (Issue [#4175](https://github.com/QwenLM/qwen-code/issues/4175)).** Aktuelle Daemons erweitern die Payload um vier additive Felder und eine Capability-scopige Budget-Zelle:

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

`budgetMode` ist entweder `enforce`, `warn` oder `off`. `clientBudget` fehlt, wenn kein Budget festgelegt wurde. `budgets[]` ist bei Daemons, die `mcp_guardrails` bewerben, **immer ein Array** (möglicherweise leer, wenn `budgetMode === 'off'`); ältere Daemons lassen das Feld komplett weg. Wenn `mcp_workspace_pool` beworben wird, hat die Zelle `scope: 'workspace'` und deckt den gemeinsamen Pool der ausgewählten Workspace-Runtime ab. Wenn dieses Tag fehlt, einschließlich unter `QWEN_SERVE_NO_MCP_POOL=1`, emittiert der Legacy-Manager `scope: 'session'`. Consumer MÜSSEN zusätzliche nicht erkannte Scope-Werte tolerieren.

`disabledReason` in den Server-Zellen unterscheidet zwischen vom Operator deaktiviert (`'config'` – `disabledMcpServers`-Konfigurationsliste) und wegen Budget abgelehnt (`'budget'` – entdeckt, aber aufgrund des `enforce`-Modus nie verbunden). Ablehnungen sind deterministisch nach der Deklarationsreihenfolge von `Object.entries(mcpServers)`. Der serverbezogene `status: 'error', errorKind: 'budget_exhausted'` überlagert den rohen `mcpStatus: 'disconnected'` (was zwar zutrifft, aber nicht der für den Operator relevante Schweregrad ist).

Die Budget-Durchsetzung ist Capability-getrieben. Mit `mcp_workspace_pool` teilen sich Sessions innerhalb einer Workspace-Runtime Transports und ein `WorkspaceMcpBudget`; verschiedene Workspace-Runtimes teilen sich niemals einen Pool oder ein Budget. Ohne das Tag erzwingt der `McpClientManager` jeder ACP-Session seine eigene Kopie der Obergrenze, und der Snapshot repräsentiert diese Legacy-Session-Ansicht.

**Erkennen von Budget-Druck.** Zwei Oberflächen, beide nach PR-14b befüllt:

- **Push-Events** (beworben über `mcp_guardrail_events`): abonniere `GET /session/:id/events` und filtere `mcp_budget_warning` / `mcp_child_refused_batch`-Frames über `KnownDaemonEvent`. Die State Machine feuert einmal pro Überschreitung der 75%-Marke nach oben (wird unter 37,5 % erneut scharf geschaltet); Ablehnungen werden im `enforce`-Modus einmal pro Discovery-Durchlauf zusammengefasst.
- **Snapshot-Poll** (beworben über `mcp_guardrails`): `GET /workspace/mcp` aufrufen und die Budget-Zelle (`budgets[0]`) zusammen mit `mcp_workspace_pool` inspizieren, um ihren Scope zu bestimmen:

- `budgets[0].status === 'warning'` ⇔ `liveCount >= 0.75 * clientBudget` (entspricht dem Hysterese-Schwellenwert, den das Push-Event in PR 14b verwenden wird).
- `budgets[0].status === 'error'` ⇔ `refusedCount > 0` (ein oder mehrere Server wurden in diesem Discovery-Durchlauf abgelehnt).
- `budgets[0].status === 'ok'` ⇔ unter dem 75%-Schwellenwert UND keine Ablehnungen.

Empfohlenes Poll-Intervall: abgestimmt auf das, was ohnehin bereits `/workspace/mcp` pollt; der Snapshot ist ressourcenschonend und die Budget-Zelle verursacht keine zusätzlichen Discovery-Kosten. SDK-Clients, die Push-Events abonnieren, profitieren dennoch vom Snapshot für den Zustand nach einer längeren Trennung (die SSE-Replay-Ring-Tiefe ist begrenzt – `--event-ring-size`, Standard 8000 – sodass ein Client, der länger offline ist als die Ring-Abdeckung, auf einen Snapshot-Resync zurückfällt).

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

`level` ist entweder `project`, `user`, `extension` oder `bundled`.
`userInvocable` (Boolean, optional) wird für normale Skills weggelassen
(bedeutet `true`) und ist nur als `false` vorhanden, wenn der Skill nicht manuell
aufgerufen oder über die Skill-API umgeschaltet werden kann. `modelInvocable` ist unabhängig: `false`
bedeutet, dass der Skill weiterhin manuell verfügbar bleibt, aber vor der Modellaufrufung
verborgen ist. `installedPath` ist der bestehende absolute Pfad zur `SKILL.md` des Skills; der
Daemon gibt ihn wie gespeichert zurück, ohne Symlinks separat aufzulösen
oder ihn zu kanonisieren. Aktuelle Daemons emittieren ihn für jeden Skill, während Clients
sein Fehlen von älteren v1-Daemons tolerieren müssen. Skill-Bodies, Hooks, `skillRoot`
und andere Skill-Konfiguration bleiben ausgeschlossen. `errors` wird weggelassen, wenn
die Discovery erfolgreich ist.

Wiederholte Lesevorgänge werden aus dem letzten committeten Workspace-Snapshot bedient,
periodisch gegen den In-Memory-Cache des Childs revalidiert. Ein Lesevorgang scannt niemals
Skill-Verzeichnisse oder parst `SKILL.md`-Dateien neu. Das Child überprüft, dass seine
Extension-Quellen unverändert sind – ein `readdir` des Extensions-
Verzeichnisses plus ein `stat` pro Eintrag, die Enablement-Datei und der Aktivierungs-
zustand des Stores – und aktualisiert nur, wenn sie sich verschoben haben, sodass eine Extension,
die außerhalb des Daemons installiert oder umgeschaltet wurde, beim nächsten Lesevorgang
noch erkannt wird. Safe- und Bare-Mode überspringen die Überprüfung, passend zu ihrem
Ausschluss von Extensions.

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

Modelle werden nach Auth-Typ gruppiert. Die Verbindungsdiagnostik für Provider befindet sich in der `providers`-Zelle von `/workspace/preflight`; der Environment-Preflight befindet sich in `/workspace/preflight` und `/workspace/env` (unten). `errors` wird weggelassen, wenn die Snapshot-Erstellung erfolgreich ist.

### `GET /workspace/env`

Meldet die Runtime, Plattform, Sandbox, den Proxy und das **Vorhandensein** von Whitelist-Geheimnissen (secret environment variables) des Daemon-Prozesses. Antwortet immer aus dem `process.*`-Zustand – der Daemon startet niemals ein ACP-Kind, um diese Route zu bedienen, und die Antwort ist identisch, egal ob ACP läuft oder im Leerlauf ist. Das Feld `acpChannelLive` ist nur informativ.

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

Zellstruktur:

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

**Maskierungsrichtlinie.** Zellen mit `kind: 'env_var'` enthalten niemals ein `value`-Feld; Clients sehen nur `present: boolean`. Zellen mit `kind: 'proxy'` leiten den rohen Umgebungsvariablen-Wert durch die Zugangsdaten-Maskierung (`redactProxyCredentials`) und dann durch `URL`-Parsing, sodass die Übertragung nur `host:port` enthält. `NO_PROXY` wird wortwörtlich durch die Maskierung gereicht, da es sich um eine Host-Liste und nicht um eine URL handelt. Die Whitelist der aufgeführten geheimen Umgebungsvariablen umfasst derzeit `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GEMINI_API_KEY`, `GOOGLE_API_KEY`, `DASHSCOPE_API_KEY`, `OPENROUTER_API_KEY` und `QWEN_SERVER_TOKEN`. Andere Umgebungsvariablen werden nicht aufgeführt, sodass versehentlich gesetzte Geheimnisse unsichtbar bleiben.

### `GET /workspace/preflight`

Meldet Daemon-Bereitschaftsprüfungen. **Zellen auf Daemon-Ebene** (`node_version`,
`cli_entry`, `workspace_dir`, `ripgrep`, `git`, `npm`) werden immer aus `process.*` und `node:fs` befüllt. **Zellen auf ACP-Ebene** (`auth`,
`mcp_discovery`, `skills`, `providers`, `tool_registry`, `egress`)
erfordern ein aktives ACP-Kind – wenn der Daemon im Leerlauf ist, geben sie `status: 'not_started'`-Platzhalter aus. Die Route startet ACP niemals ausschließlich zum Befüllen von Zellen; die entsprechenden Zellen fallen auf `not_started` zurück.

Leerlauf-Antwort (kein ACP-Kind):

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

Zellstruktur:

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

`errorKind`-Semantik:

- `missing_binary` — Node-Version unterhalb des erforderlichen Minimums, fehlender `QWEN_CLI_ENTRY`,
  ripgrep / git / npm nicht im PATH (bei optionalen Binärdateien eher Warnungen als Fehler).
- `missing_file` — `boundWorkspace` existiert nicht oder ist kein Verzeichnis;
  Skill-Parse-Fehler, der auf eine fehlende oder unlesbare Datei verweist.
- `parse_error` — `SKILL.md`-Parse-Fehler, fehlerhaftes Konfigurations-JSON.
- `auth_env_error` — `validateAuthMethod` hat eine Fehlermeldung ungleich null zurückgegeben
  oder eine `ModelConfigError`-Unterklasse wurde von der Provider-Auflösung weitergereicht.
- `init_timeout` — `withTimeout`-Reject in der Bridge (ein tatsächlicher Timeout
  beim Warten auf einen ACP-Roundtrip). Wird über die typisierte Klasse
  `BridgeTimeoutError` erkannt. Hinweis: Eine vorübergehende `mcp_discovery`-
  `warning`-Zelle mit `connecting > 0` trägt NICHT diesen Kind – das ist
  ein normaler Handshake-in-Progress-Zustand, der sich von einem echten Timeout unterscheidet.
- `protocol_error` — ACP-`extMethod` wurde abgelehnt, weil der Kanal mitten in der Anfrage
  geschlossen wurde oder weil die Tool-Registry unerwartet fehlte.
- `blocked_egress` — reserviert für PR 14 (#4175). PR 13 belässt die
  `egress`-Zelle auf `status: 'not_started'`.

Wenn die Bridge beim Bearbeiten einer Preflight-Anfrage das ACP-Child nicht erreichen kann
(z. B. durch ein Schließen des Kanals mitten in der Anfrage), enthält das `errors`-Array
des Envelopes eine einzelne `ServeStatusCell`, die den Fehler beschreibt, und die Zellen
fallen auf `not_started`-ACP-Platzhalter zurück. Daemon-level Zellen werden weiterhin zurückgegeben.

### Workspace-Dateirouten

Alle Dateipfade werden über den primären Workspace des Daemons aufgelöst. Antworten verwenden
Workspace-relative Pfade und geben im normalen Erfolgsfall niemals absolute Dateisystempfade zurück. Erfolgreiche Datei-Antworten enthalten:

```http
Cache-Control: no-store
X-Content-Type-Options: nosniff
```

Dateisystemfehler verwenden diese JSON-Struktur:

```json
{
  "errorKind": "hash_mismatch",
  "error": "expected sha256:..., found sha256:...",
  "hint": "re-read the file and retry with the latest hash",
  "status": 409
}
```

`errorKind`-Werte umfassen `path_outside_workspace`, `symlink_escape`,
`path_not_found`, `binary_file`, `file_too_large`, `untrusted_workspace`,
`permission_denied`, `parse_error`, `hash_mismatch`,
`file_already_exists`, `text_not_found` und `ambiguous_text_match`.

#### `GET /file`

Liest eine Textdatei. Query-Parameter: `path` (erforderlich), `maxBytes`, `line`, `limit`
und `cursor`. Der Daemon lehnt Binärdateien ab. Dateien über der 256 KiB
Full-Snapshot-Obergrenze erfordern mindestens ein explizites Fensterargument (`line`, `limit` oder
`maxBytes`); eine Anfrage ohne eines davon bleibt `file_too_large`. Solch ein
Fenster wird gestreamt, und sein zurückgegebener UTF-8-Inhalt bleibt auf 256 KiB begrenzt.
`maxBytes` gilt immer für die UTF-8-Antwort-Bytes nach der Dekodierung, einschließlich
wenn die Quelle eine andere unterstützte Kodierung innerhalb der Full-Snapshot-Obergrenze verwendet.

Line-Offsets werden durch Scannen vom Anfang der Datei aufgelöst, daher wird ein Fenster
auch mit `file_too_large` abgelehnt, wenn das Erreichen mehr als
8 MiB (`MAX_TEXT_SCAN_BYTES`) lesen würde. Verwende `GET /file/bytes`, um ein tieferes Offset
direkt zu erreichen. Großer Text in einer Kodierung, die die Route nicht dekodieren kann, gibt
`binary_file` zurück, nicht `file_too_large` – das Wiederholen mit einem kleineren Fenster kann
nicht helfen, und `readBytes` ist dasselbe Mittel, das bereits für Binärdateien gilt.

Für Dateien innerhalb der Full-Snapshot-Obergrenze enthält die Antwort `hash`, einen SHA-256-
Digest über die rohen On-Disk-Bytes der gesamten Datei, auch wenn `line`, `limit`
oder `maxBytes` nur einen Ausschnitt zurückgegeben haben. Große Teilfenster lassen `hash` weg, behalten das
vollständige `sizeBytes`, setzen `truncated: true` und geben
`originalLineCount: null` zurück, wenn der Stream vor EOF stoppt.

##### Paging mit `cursor`

Erfordert die `workspace_file_read_cursor`-Capability. Eine Antwort, die noch mehr hat,
gibt `hasMore: true` und, wenn ein Datei-Byte-Offset ableitbar ist, ein
`nextCursor`-Token zurück. Das Zurückgeben als `cursor` setzt in O(1) fort, während ein tiefer
`line`-Offset einen Scan ab Byte 0 kostet und jenseits von 8 MiB abgelehnt wird.

```
GET /file?path=big.log&limit=500          → { content, nextCursor, hasMore: true }
GET /file?path=big.log&limit=500&cursor=… → nächste Seite
```

`cursor` und `line` schließen sich gegenseitig aus (`parse_error`) – beide benennen einen
Startpunkt. Ein fehlerhafter oder überlanger Cursor ist `parse_error`; ein Cursor,
dessen Datei ersetzt oder gekürzt wurde, ist `hash_mismatch` (409). Anhängen
invalidiert einen ausstehenden Cursor **nicht**, was der Anwendungsfall ist, für den das Feature
existiert.

`content` lässt das abschließende Newline seiner letzten Zeile weg, wie jeder andere Lesevorgang,
sodass ein Client, der Seiten zusammensetzt, sie mit `\n` verbindet. `hasMore` ist keine
Wiederholung von `nextCursor`: eine kleine Nicht-UTF-8-Datei, die mit einem `limit` gelesen wird, hat
mehr Inhalt, aber kein ableitbares Byte-Offset, daher meldet sie `hasMore: true` mit
`nextCursor: null`. Der Cursor ist auch null, wenn die Byte-Obergrenze die aktuelle Zeile
abschneidet, da das Fortsetzen ab diesem Offset eine Teilzeile zurückgeben würde. Für viele
kurze Zeilen senke `limit`, bis die Seite vor der Byte-Obergrenze endet und einen Cursor
zurückgibt. Für eine einzelne übergroße Zeile fordere die folgende Zeile explizit an
(z. B. `line=2` beim Start bei Zeile 1), dann fahre mit Cursorn fort;
verwende `GET /file/bytes`, wenn die vollständige übergroße Zeile erforderlich ist.

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

Liest rohe Bytes aus einer Datei ohne Dekodierung. Query-Parameter: `path` (erforderlich),
`offset` (Standard `0`) und `maxBytes` (Standard `65536`, Maximum `262144`). Diese
Route unterstützt begrenzte Fenster bei großen Binärdateien, ohne die gesamte Datei einzulesen. Die Antwort enthält `hash` nur, wenn das zurückgegebene Fenster die gesamte Datei abdeckt.

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

Erstellt oder ersetzt eine Textdatei. Dies ist eine strikte Mutations-Route: Auf Loopback
ohne konfigurierten Token gibt sie `401 { "code": "token_required" }` zurück.
Mit `--require-auth` lehnt die globale Bearer-Middleware nicht authentifizierte Anfragen ab, bevor die Route ausgeführt wird.

Body:

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

`mode` muss `create` oder `replace` sein. `create` überschreibt niemals eine bestehende
Datei (`409 file_already_exists`). `replace` erfordert `expectedHash`; fehlende oder
fehlerhafte Hashes resultieren in `400 parse_error`, und veraltete Hashes in
`409 hash_mismatch`. `expectedHash` ist `sha256:` gefolgt von 64 hexadezimalen Kleinbuchstaben,
berechnet über die rohen On-Disk-Bytes.

`bom`, `encoding` und `lineEnding` können angegeben werden. Beim Ersetzen wird standardmäßig das
Encoding-Profil der bestehenden Datei beibehalten; explizite Felder überschreiben dies.
Binäre Schreibvorgänge sind nicht im Funktionsumfang enthalten.

Der Daemon schreibt in eine zufällige Temp-Datei im Zielverzeichnis, führt wo unterstützt ein fsync durch,
prüft den aktuellen Hash unmittelbar vor `rename()` erneut und benennt die Datei dann an den Zielort um.
Dies verhindert die Beobachtung unvollständiger Dateien und serialisiert Daemon-initiierte Schreibvorgänge
auf dieselbe Datei, ist jedoch kein Cross-Process-Kernel-Compare-and-Swap: Ein externer Editor kann
immer noch in dem winzigen Zeitfenster zwischen der finalen Hash-Prüfung und dem Rename konkurrieren.

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

Wendet genau eine exakte Textersetzung auf eine bestehende Textdatei an. Dies ist ebenfalls eine
strikte Mutations-Route und erfordert `expectedHash`.

```json
{
  "path": "src/config.ts",
  "oldText": "timeout: 30000",
  "newText": "timeout: 60000",
  "expectedHash": "sha256:..."
}
```

`oldText` darf nicht leer sein und muss genau einmal vorkommen. Keine Übereinstimmung gibt
`422 text_not_found` zurück; mehrere Übereinstimmungen geben `422 ambiguous_text_match` zurück.
Die Route bewahrt Encoding, BOM und Zeilenenden und prüft `expectedHash` unmittelbar vor dem atomaren Rename.

Explizite Schreib-/Bearbeitungsvorgänge auf ignorierte Pfade sind erlaubt, da der authentifizierte
Aufrufer den Pfad explizit angegeben hat. Erfolgs-Antworten und Audit-Events enthalten
`matchedIgnore: "file" | "directory" | null`.

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

`state` spiegelt dieselben ACP-Model/Mode/Config-Option-Strukturen wider, die von
`POST /session`, `POST /session/:id/load` und `POST /session/:id/resume` verwendet werden.

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

`availableCommands` ist derselbe Befehls-Snapshot, der von der
`available_commands_update`-SSE-Benachrichtigung verwendet wird. `availableSkills` listet nur Skill-Namen auf; Clients dürfen über diese Route keine Skill-Bodies oder Pfade erwarten.

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

Diese Route ist ein schreibgeschütztes Out-of-Band-Snapshot. Sie ist absichtlich kein Prompt und kann abgefragt werden, während die Session streamt. Die Antwort enthält nur Whitelisted-Metadaten aus den Agent-, Shell- und Monitor-Task-Registries; Controller, Timer, Offsets, ausstehende Nachrichten und rohe Registry-Objekte werden niemals offengelegt.

Agent-Tasks, die von einem anderen Sub-Agenten erzeugt wurden (verschachtelte Sub-Agenten, begrenzt durch
`maxSubagentDepth`), enthalten drei optionale Lineage-Felder: `parentAgentId` (die
`id` des erzeugenden Agent-Tasks), `parentName` (der `subagentType` des erzeugenden Agents,
bei der Registrierung erfasst, damit er die Entfernung des Parents aus der Registry überlebt) und `depth` (0-basierte Starttiefe; 0 = erzeugt von der
Top-Level-Session). Agents, die von der Top-Level-Session gestartet werden, lassen
`parentAgentId` und `parentName` weg; Clients sollten alle drei Felder als optional behandeln und auf eine flache Liste zurückfallen, wenn sie fehlen.

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

`status` ist einer der Werte `NOT_STARTED`, `IN_PROGRESS`, `READY` oder `FAILED`.
Das optionale `error` ist bei fehlgeschlagenen Servern vorhanden, wenn verfügbar. Deaktiviertes LSP
(einschließlich Bare-Mode) gibt HTTP 200 mit `enabled: false`, Null-Zählungen und
`servers: []` zurück. Aktiviertes LSP ohne konfigurierte Server gibt `enabled: true`,
`configuredServers: 0` und `servers: []` zurück. Wenn die Initialisierung fehlschlägt, bevor der
Client existiert, kann die Antwort `initializationError` enthalten; wenn ein aktiver Client
kein Snapshot bereitstellen kann, enthält die Antwort `statusUnavailable: true`.

Diese Route legt nur stabile, clientseitige Felder offen. Sie lässt absichtlich Debug-Interna wie Prozess-IDs, Spawn-Args, Stderr-Tails, Root-URIs und Workspace-Ordnerpfade weg.

### `POST /session`

Erzeugt einen neuen Agent oder hängt sich an einen bestehenden an (unter `sessionScope: 'single'`, dem Standard).

Request:

```json
{
  "cwd": "/absolute/path/to/workspace",
  "modelServiceId": "qwen-prod",
  "sessionScope": "thread"
}
```

| Field            | Required | Notes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ---------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `cwd`            | nein       | Absoluter Pfad, der einem registrierten Workspace entspricht. Wenn weggelassen, fällt die Route auf den primären Workspace zurück (über `/capabilities.workspaceCwd` auslesen). Wenn `features` `multi_workspace_sessions` enthält, können Clients jedes vertrauenswürdige `workspaces[].cwd` übergeben; andernfalls wird nur der primäre Workspace akzeptiert. Ein nicht übereinstimmendes, nicht leeres `cwd` gibt `400 workspace_mismatch` zurück. Workspace-Pfade werden über `realpathSync.native` kanonisiert (mit einem Resolve-only-Fallback für nicht existierende Pfade), damit Case-insensitive Dateisysteme Sessions nicht aufgrund der Schreibweise ablehnen. |
| `modelServiceId` | nein       | Wählt aus, durch welchen konfigurierten _Model Service_ der Agent routet (der Backend-Provider – Alibaba ModelStudio, OpenRouter, usw.). Wenn weggelassen, verwendet der Agent seinen Standard. Wenn der Workspace bereits eine Session hat, ruft dies `setSessionModel` auf der bestehenden Session auf und sendet `model_switched`. Unterscheidet sich von `modelId` bei `POST /session/:id/model`, welches das Modell **innerhalb** eines bereits gebundenen Service auswählt. Das `modelServices`-Array bei `/capabilities` ist für die Bekanntgabe konfigurierter Services reserviert; in Stage 1 ist es immer `[]` (der Standard-Service des Agents wird verwendet und nicht über HTTP aufgezählt). |
| `sessionScope`   | nein       | Pro-Request-Override für das Session-Sharing. `'single'` (der Daemon-weite Standard) bewirkt, dass ein zweiter `POST /session` für denselben Workspace die bestehende Session wiederverwendet (`attached: true`); `'thread'` erzwingt bei jedem Aufruf eine neue, eigenständige Session. Weglassen, um den Daemon-weiten Standard zu erben. Werte außerhalb der Enum geben `400 { code: 'invalid_session_scope' }` zurück. Ältere Daemons (vor #4175 PR 5) ignorieren das Feld stillschweigend – vor dem Senden `caps.features.session_scope_override` im Pre-flight prüfen. Der Daemon-weite Standard ist in der Produktion derzeit hart auf `'single'` codiert; #4175 könnte in einem Follow-up ein `--sessionScope`-CLI-Flag hinzufügen.         |

Antwort:

```json
{
  "sessionId": "<uuid>",
  "workspaceCwd": "/canonical/path",
  "attached": false
}
```

`attached: true` bedeutet, dass für diesen Workspace bereits eine Session existierte und du sie nun teilst.

Multi-Client-Integrationen, die unabhängige Konversationen wünschen, sollten bei jedem `POST /session` `sessionScope: "thread"` senden. Verwende den Standard-Scope `single` nur, wenn Clients absichtlich eine gemeinsame kollaborative Session teilen; gemeinsame Sessions serialisieren Prompts über eine FIFO, sichtbar über `/daemon/status` als `runtime.activity.pendingPrompts` und `runtime.activity.queuedPrompts`.

Gleichzeitige `POST /session`-Aufrufe für denselben Workspace werden zu einem einzigen Spawn **zusammengeführt** — beide Aufrufer erhalten dieselbe `sessionId`, genau einer meldet `attached: false`. Wenn der zugrunde liegende Spawn fehlschlägt (Init-Timeout, fehlerhafte Agent-Ausgabe, OOM), **erhalten alle zusammengeführten Aufrufer denselben Fehler** — der In-Flight-Slot wird freigegeben, sodass ein Folgeaufruf den Vorgang von Grund auf neu starten kann.

> ⚠️ **Die Ablehnung einer `modelServiceId` bei einer neuen Session bleibt in der HTTP-Antwort stumm.** Eine fehlerhafte `modelServiceId` (Tippfehler, nicht konfigurierter Service) löst beim Erstellen KEINEN 500-Fehler aus — die Session bleibt auf dem Standardmodell des Agenten betriebsbereit, sodass der Aufrufer dennoch eine `sessionId` erhält, mit der er den Modellwechsel erneut versuchen kann (via `POST /session/:id/model`). Das sichtbare Fehlersignal ist ein `model_switch_failed`-Event auf dem SSE-Stream der Session, das zwischen dem Spawn-Handshake und deinem ersten Subscribe ausgelöst wird. **Subscriber, die dieses Event beobachten müssen, sollten bei ihrem ersten `GET /session/:id/events` `Last-Event-ID: 0` übergeben**, um vom ältesten verfügbaren Event des Rings zu replayen (deckt das `model_switch_failed` zur Spawn-Zeit ab, selbst wenn das Subscribe erst ein paar ms nach der Create-Antwort eintrifft).

### `POST /session/:id/load`

Stellt eine persistierte ACP-Session anhand der ID wieder her und spielt deren Historie über SSE ab. Die Pfad-ID ist maßgeblich; jedes `sessionId`-Feld im Body wird ignoriert. Pre-flight `caps.features.session_load` — ältere Daemons geben für diese Route `404` zurück.

Request:

```json
{
  "cwd": "/absolute/path/to/workspace"
}
```

| Feld | Erforderlich | Hinweise                                                                                                                                                                                                                                                                                                                                                                                                                      |
| ---- | ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `cwd` | nein       | Dieselben Kanonisierungs- und `workspace_mismatch`-Regeln wie bei `POST /session`. Weglassen, um `/capabilities.workspaceCwd` zu erben. Wenn `features` `multi_workspace_sessions` enthält, können Aufrufer jedes vertrauenswürdige registrierte `workspaces[].cwd` übergeben; nicht vertrauenswürdige nicht primäre Workspaces geben `403 untrusted_workspace` zurück. `mcpServers` wird hier absichtlich NICHT akzeptiert — daemon-weites MCP wird über Einstellungen gesteuert (entspricht `POST /session`). |

Antwort:

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

`state` spiegelt ACPs `LoadSessionResponse` wider — `models` ist ein `SessionModelState`, `modes` ein `SessionModeState`, `configOptions` ein Array von `SessionConfigOption`. Fehlende Felder werden vom Agenten bestimmt. Nachträgliche Attacher (die `attached: true`-Pfade unten) erhalten denselben `state`-Snapshot, den der ursprüngliche Load-Aufrufer gesehen hat — der Daemon cacht ihn beim Entry; Runtime-Mutationen (z. B. `model_switched`) werden über den SSE-Stream ausgeliefert, nicht über nachfolgende Attach-Antworten.

`attached: true` bedeutet, dass die Session bereits live war (entweder durch ein vorheriges `session/load`/`session/resume` oder weil ein zusammengeführter, gleichzeitiger Aufrufer knapp voraus war).

**Historien-Replay über SSE.** Während `loadSession` auf der Agentenseite in-flight ist, kann der Agent `session_update`-Benachrichtigungen für persistierte Turns emittieren oder Bulk-Replay-Updates in den Response-Metadaten zurückgeben. Der Daemon seedet diese Events in das begrenzte Replay-Snapshot-Fenster der Session, bevor die Route-Antwort zurückkehrt. Für Live-Sessions verspricht `POST /session/:id/load` nur dieses begrenzte Fenster (`compactedReplay`, `liveJournal`, `lastEventId`), nicht das vollständige Transkript. Das Fenster ist byte-begrenzt durch `--compacted-replay-max-bytes` (Standard 4 MiB, Maximum 256 MiB); wenn ältere Replay-Einträge verworfen wurden, ist `compactedReplay[0]` ein ID-loser `history_truncated`-Marker. Das in-flight `liveJournal` ist separat durch `--max-journal-events` (Standard 10 000) und `--max-journal-bytes` (Standard 8 MiB) begrenzt; wenn überschritten, werden die ältesten Journal-Einträge verworfen und ein `history_truncated`-Marker mit `scope: 'live_journal'` vorangestellt. Clients sollten diesen Marker als Status rendern und angewandte beibehaltene Events weiter verarbeiten. Der vollständige persistierte Transkript-Zugriff wird separat über `GET /session/:id/transcript` bereitgestellt.

**Fehler:**

- `404` — Persistierte Session-ID existiert nicht (`SessionNotFoundError`).
- `400` — `workspace_mismatch` (gleiche Form wie bei `POST /session`).
- `403` — `untrusted_workspace`, wenn `cwd` auf einen nicht vertrauenswürdigen nicht primären Workspace zielt.
- `503` — `session_limit_exceeded` (zählt auf `--max-sessions` an; In-Flight-Restores werden ebenfalls berücksichtigt).
- `409` — `restore_in_progress` (ein `session/resume` für dieselbe ID ist bereits in-flight). `Retry-After: 5`. Gleichartige Race-Conditions (zwei gleichzeitige `session/load` für dieselbe ID) werden zusammengeführt — genau eines gibt `attached: false` zurück, die anderen geben `attached: true` mit demselben `state` zurück.
- `409` — `session_workspace_conflict`, wenn dieselbe Session-ID bereits in einer anderen Workspace-Runtime live ist oder wiederhergestellt wird.
- `409` — `session_archived`, wenn die ID nur unter `chats/archive/` existiert; rufe `POST /sessions/unarchive` vor `load` oder `resume` auf.
- `409` — `session_archiving`, wenn Archive oder Unarchive für dieselbe ID in-flight ist. `Retry-After: 5`.
- `409` — `session_conflict`, wenn die ID sowohl in `chats/` als auch in `chats/archive/` existiert; lösche die Session mit `POST /sessions/delete` vor dem Laden.

### `GET /session/:id/transcript`

Gibt eine Seite ID-loser `session_update`-Replay-Frames zurück, die aus dem aktiven persistierten JSONL-Transkript rekonstruiert wurden. Pre-flight `caps.features.session_transcript` — ältere Daemons geben für diese Route `404` zurück.

Query-Parameter:

| Feld     | Erforderlich | Hinweise                                                                                                                                                                                                                                                                                                                                                                                                                    |
| -------- | ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `cursor` | nein       | Opaker Base64url-Cursor, der von der vorherigen Seite zurückgegeben wurde. Für die erste Seite weglassen. Der Cursor wird vom Daemon ausgestellt und tamper-geprüft; das Modifizieren gibt `400 invalid_transcript_cursor` zurück. Er bindet an die Transkript-Datei-Identität und die eingefrorene First-Page-Byte-Größe; das Löschen, Kürzen, Ersetzen oder Archivieren der Datei invalidiert ihn und gibt `409` zurück. |
| `limit`  | nein       | Anzahl der aktiven `ChatRecord`s, die in der Seite enthalten sind. Standardmäßig `100`, Maximum `500`. Ein Record kann mehrere Replay-Frames erzeugen, daher kann `events.length` größer als `limit` sein. Ungültige Werte geben `400 invalid_transcript_limit` zurück.                                                                                                                                                      |

Antwort:

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

`events` sind nur Replay-Frames: `{ v: 1, type: "session_update", data: SessionUpdate }`. Sie tragen keine EventBus-IDs, und die Antwort enthält niemals `lastEventId`. Das Aufrufen dieser Route ruft nicht `/load` auf, hängt keinen Client an, seedet nicht den live EventBus, erstellt keine Live-Session oder ändert das aktuelle Live-Replay-Fenster. Live und inaktive aktive Sessions werden beide von der Child-seitigen schreibgeschützten Statusmethode rekonstruiert, sodass das Replay dieselben Workspace-Einstellungen, das Runtime-Ausgabeverzeichnis, die Emitter und die `/load`-Historiensemantik verwendet, ohne den Daemon-Session-Zustand zu mutieren.

Die erste Seite friert die aktuelle JSONL-Snapshot-Größe ein. Spätere Seiten lesen nur dieses Byte-Präfix, sodass Anhänge nach Seite 1 die Ergebnismenge nicht ändern. Wenn die Datei verschwindet, unter die eingefrorene Größe gekürzt wird, durch eine andere Inode ersetzt oder ins Archiv verschoben wird, gibt die nächste Seite `409` zurück, und der Client sollte ab Seite 1 neu starten oder den Benutzer bitten, das Transkript erneut zu öffnen.

Zum Schutz von Daemon-Speicher und Latenz schlagen Snapshots über dem Transkript-Indexierungs-Limit fehl, bevor der Daemon das JSONL scannt. Clients erhalten `413 transcript_too_large` und sollten auf Export/Offline-Verarbeitung zurückfallen oder den Benutzer bitten, ältere Historie zu kürzen/archivieren.

`partial: true` und `replayError` können erscheinen, wenn die Replay-Konvertierung nach dem Erzeugen einiger Frames fehlschlägt. Teilantworten enthalten niemals `nextCursor`, sodass Clients nicht stillschweigend über nicht konvertierte Records hinweg paginieren können.

**Fehler:**

- `400` — ungültige `limit`-, `cursor`- oder Session-ID-Form.
- `404` — Aktive persistierte Session-ID existiert bei der First-Page-Anfrage nicht.
- `409` — `session_archived`, `session_archiving` oder `session_conflict` aus denselben Loadability-Prüfungen wie `/load`.
- `409` — Transkript-Snapshot ist nicht verfügbar, da die Datei nach der Cursor-Ausstellung gelöscht, gekürzt, ersetzt oder archiviert wurde; dies gilt auch, wenn der Preflight die aktive Datei für eine Cursor-Anfrage nicht mehr finden kann.
- `413` — `transcript_too_large`, wenn der eingefrorene Transkript-Snapshot das Daemon-Indexierungslimit überschreitet.
- `413` — `transcript_page_too_large`, wenn ein aggregierter Record das Workspace-qualifizierte Seitenbudget überschreitet oder die serialisierte Seite ihr Antwortbudget überschreitet.

### `GET /workspaces/:workspace/session/:id/transcript`

Gibt dieselbe `DaemonSessionTranscriptPage`-Projektion wie die Singular-Route aus dem aktiven persistierten JSONL des ausgewählten registrierten Workspaces zurück. Pre-flight `workspace_persisted_transcript`; diese Capability ist unabhängig von `multi_workspace_sessions` und funktioniert für einen vertrauenswürdigen Single-Workspace-Primary, der nach ID oder CWD ausgewählt wird.

Der Selektor und die Query-Parameter folgen den bestehenden Plural-Workspace- und Transkript-Regeln. Vertrauenswürdige primäre und sekundäre Runtimes und nicht vertrauenswürdige sekundäre Runtimes dürfen lesen. Ein nicht vertrauenswürdiger Primary gibt `403 untrusted_workspace` zurück. Archivierte Inhalte werden nicht zurückgegeben.

Für diese Workspace-qualifizierte Route ist `limit` die maximale Record-Anzahl. Eine Seite kann früher beim 4-MiB-persistierten-Quellen-Budget stoppen und einen Fortsetzungs-Cursor zurückgeben. Serialisierte Antworten sind auf 32 MiB begrenzt und Cursor auf 64 KiB. Wenn der Replay-Zustand die Cursor-Obergrenze überschreiten würde, gibt die Seite ihre erfolgreich konvertierten Events mit `partial: true`, `hasMore: false` und keinem `nextCursor` zurück.

Im Gegensatz zur Legacy-Singular-Route wird dieser Pfad vollständig innerhalb des Daemon-Prozesses implementiert. Er ruft nicht die Workspace-Bridge auf, startet keinen ACP, lädt keine Einstellungen, parst keine Projekt-definierten Agenten oder Skills oder erstellt/repariert `session-transcript-cursor-key`. Tool-Frames verwenden persistierte Tool-Namen und -Beschreibungen, ohne die Runtime-Tool-Registry zu konsultieren. Sein HMAC-Cursor-Key existiert nur im Daemon-Speicher, ist pro Workspace isoliert und rotiert beim Neustart; ein Cursor aus einem vorherigen Daemon-Prozess gibt `400 invalid_transcript_cursor` zurück.

### `GET /workspaces/:workspace/session/:id/export`

Exportiere die aktive persistierte Session des ausgewählten registrierten Workspaces als Anhang. Pre-flight `workspace_session_export`; leite Unterstützung nicht von `session_export` oder `workspace_qualified_rest_core` ab. Der Selektor wird zuerst als exakte Workspace-ID aufgelöst und andernfalls als URL-kodiertes absolutes CWD nach Kanonisierung. Sowohl primäre als auch sekundäre Runtimes müssen vertrauenswürdig sein. Eine nicht vertrauenswürdige Runtime gibt `403 untrusted_workspace` vor der Session- oder Formatvalidierung zurück.

Der optionale `format`-Query ist `html` (Standard), `md`, `json` oder `jsonl`. Body, MIME-Typ, Dateinamenbereinigung, `Cache-Control: no-store`, `X-Content-Type-Options: nosniff` und Attachment-Disposition entsprechen `GET /session/:id/export`. Die Legacy-Route bleibt an den primären Speicher gebunden.

Die Plural-Route liest nur das aktive persistierte JSONL des ausgewählten Workspaces unter dem bestehenden gemeinsamen Archive-Koordinator. Sie scannt keine anderen Workspace-Speicher, fällt nicht auf Primary zurück, löst keinen Live-Owner auf, ruft nicht die Workspace-Bridge auf, startet keinen ACP, hängt keinen Client an oder lädt keine Einstellungen. Eine Session-ID, die nur in einem anderen Workspace existiert, gibt `404 { code: "session_not_found" }` zurück; archivierte Sessions geben `409 session_archived` zurück. Ungültige Formate geben `400 invalid_export_format` zurück, und Storage-Races behalten die bestehenden `session_archiving`- und `session_conflict`-Fehler.

### `GET /workspaces/:workspace/session/:id/archive/export`

Exportiere die archivierte persistierte Session des ausgewählten registrierten Workspaces als Anhang. Pre-flight `workspace_archived_session_export`; Unterstützung kann nicht aus dem aktiven Export oder den Plural-Core-Capabilities abgeleitet werden. Workspace-Selektor-Auflösung und Trust-Prüfungen laufen vor der Session-ID- und Formatvalidierung.

TypeScript-SDK-Aufrufer verwenden `WorkspaceDaemonClient.exportArchivedSession(sessionId, options)`. Die Methode verwendet immer natives REST und gibt die bestehende `DaemonSessionExportResult`-Anhang-Projektion zurück.

Der optionale `format`-Query, Antwort-Body, MIME-Typ, bereinigter Dateiname, Cache-Policy, Sicherheits-Header und Attachment-Disposition sind identisch mit dem aktiven Workspace-Export. Das archivierte Quell-JSONL ist vor der Rekonstruktion auf 256 MiB begrenzt; eine größere Datei gibt `413 transcript_too_large` mit `sessionId`, `snapshotSize` und `maxBytes` zurück. Der aktive Export behält sein bestehendes Größenverhalten.

Die Route liest nur `chats/archive/<id>.jsonl` im ausgewählten vertrauenswürdigen Workspace unter einer gemeinsamen Archive-Koordinator-Lease. Sie inspiziert keinen aktiven Inhalt für Fallback, scannt keinen anderen Workspace, löst keinen Live-Owner auf, ruft keine Bridge auf, startet keinen ACP, hängt keinen Client an oder lädt keine Einstellungen. Eine nur-aktive ID gibt `409 { code: "session_not_archived" }` zurück; eine fehlende ID gibt `404 { code: "session_not_found" }` zurück; gleichzeitige aktive und archivierte Dateien geben `409 session_conflict` zurück; und ein Archiv-Übergang gibt `409 session_archiving` mit `Retry-After: 5` zurück.

### `POST /session/:id/resume`

Stellt eine persistierte ACP-Session anhand der ID wieder her, OHNE die Historie über SSE abzuspielen. Der Modellkontext wird intern auf der Agentenseite wiederhergestellt (über `geminiClient.initialize`, das `config.getResumedSessionData` liest); der SSE-Stream bleibt sauber für Clients, die die Historie bereits gerendert haben. Pre-flight `caps.features.session_resume`; `unstable_session_resume` bleibt ein deprecated Kompatibilitäts-Alias für ältere Clients.

Gleiche Request-Form wie bei `/load`. Gleiche Response-Form — `state` spiegelt ACPs `ResumeSessionResponse` wider. Gleiches Error-Envelope, einschließlich `409 restore_in_progress` (wird ausgelöst, wenn ein `session/load` in-flight ist; `session/resume`, das einem anderen `session/resume` hinterherrennt, wird zusammengeführt).

Verwende `/load`, wenn der Client keine Historie gerendert hat (Cold Reconnect, Picker → Open). Verwende `/resume`, wenn der Client die Turns bereits auf dem Bildschirm hat und nur das daemon-seitige Handle zurückbenötigt.

> ⚠️ **Warum wird `unstable_session_resume` noch immer advertised?** Die HTTP-Route des Daemons und die `session_resume`-Capability sind stabil für v1, aber die Bridge ruft weiterhin ACPs `connection.unstable_resumeSession` auf. Der alte Tag bleibt nur erhalten, damit SDKs, die vor `session_resume` ausgeliefert wurden, weiterhin funktionieren.

### `GET /workspace/:id/session-info` und `GET /workspaces/:workspace/session-info`

Gibt aggregierte persistierte Session-Zahlen für den ausgewählten Workspace zurück, ohne den paginierten Session-Listen-Pfad zu ändern:

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

`active`, `archived` und `total` zählen lokale JSONL-Sessions. `live` ist die passende In-Memory-Bridge-Zahl und wird für einen registrierten nicht vertrauenswürdigen sekundären Workspace weggelassen, da dieser rein persistierte Lesevorgang keinen Live-Zustand abfragen darf. `expensive` ist immer `true` und `cost` ist immer `"disk_scan"`; Clients müssen diesen Endpunkt selten aufrufen, anstatt ihn zu pollen. Wenn der Scan sein Sicherheitslimit erreicht oder nicht jede Kandidatendatei klassifizieren kann, fügt die Antwort `"truncated": true` hinzu, und die persistierten Zahlen sind Untergrenzen. Fehlender Speicher gibt Null persistierte Zahlen zurück. Die Plural-Route verwendet denselben Workspace-Selektor und dieselbe Trust-Policy wie der Plural-Session-Katalog; ein nicht vertrauenswürdiger Primary gibt weiterhin `403 untrusted_workspace` zurück.

Das TypeScript-Daemon-SDK legt die Plural-Route über `workspaceById(...)` oder `workspaceByCwd(...)` offen, gefolgt von `getWorkspaceSessionInfo()`.

### `GET /workspace/:id/sessions` und `GET /workspaces/:workspace/sessions`

Listet Sessions auf, deren kanonischer Workspace mit `:id` oder `:workspace` übereinstimmt. Der Pfadparameter wird zuerst als exakte Workspace-ID aufgelöst und dann als URL-kodiertes absolutes CWD. Primäre Workspaces enthalten das bestehende persistierte/live-Merge: Die Standardliste enthält aktive Sessions aus `chats/`; übergib `archiveState=archived`, um archivierte Sessions aus `chats/archive/` aufzulisten. Vertrauenswürdige nicht primäre Workspaces enthalten aktive persistierte Sessions aus ihrem eigenen `chats/`-Store und mergen passende Live-Zusammenfassungen ohne Duplikate; wenn keine aktiven persistierten Sessions existieren, bewahrt die Route das bisherige Live-only-Cursor-Verhalten. Vertrauenswürdige nicht primäre Workspaces unterstützen auch `archiveState=archived`, die organisierte `view=organized`-Liste und `group`-Filter, die aus ihren eigenen `chats/`, `chats/archive/` und Session-Organisations-Speichern lesen; eine kombinierte `view=organized&archiveState=archived`-Anfrage gibt nur archivierte Sessions ohne Live-Merge zurück. Registrierte nicht vertrauenswürdige nicht primäre Workspaces unterstützen dieselben Listen-, Filter- und Paginierungsformen, geben aber nur persistierte Einträge zurück: Der Daemon fragt nicht die Live-Bridge ab oder füllt Pending Interactions, Turn Errors oder Client-Zustand aus der Runtime. Persistierte Standardwerte wie `clientCount: 0` und `hasActivePrompt: false` bleiben für Wire-Kompatibilität vorhanden. Fehlender Speicher gibt eine leere Liste zurück. Die Plural-Route gibt weiterhin `403 { code: "untrusted_workspace" }` für einen nicht vertrauenswürdigen Primary zurück; Legacy-Primary-Routen behalten ihr bestehendes Kompatibilitätsverhalten. `archiveState=all` wird in v1 nicht unterstützt. Primäre und persistiert-gestützte Listen behalten die bestehende numerische `cursor`-Semantik; der nicht-persistierte vertrauenswürdige nicht primäre Live-Fallback behält seinen bestehenden opaken Live-Cursor.

```bash
curl http://127.0.0.1:4170/workspace/$(jq -rn --arg c "$PWD" '$c|@uri')/sessions
curl http://127.0.0.1:4170/workspace/$(jq -rn --arg c "$PWD" '$c|@uri')/sessions?archiveState=archived
curl http://127.0.0.1:4170/workspaces/<workspace-id>/sessions
```

Wenn `workspace_qualified_rest_core` beworben wird, sind Workspace-scopige Session-Batch-Operationen, Gruppen-CRUD und Session-Organisations-Mutation unter `/workspaces/:workspace/sessions/{delete,archive,unarchive}`, `/workspaces/:workspace/session-groups` und `/workspaces/:workspace/session/:id/organization` verfügbar. Für einen nicht vertrauenswürdigen sekundären Workspace bleibt Gruppen-GET verfügbar; jede Gruppen-, Session- und Organisations-Mutation bleibt Trust-gated. Workspace-lose Batch- und Organisations-Mutationsrouten bleiben aus Kompatibilitätsgründen nur für den primären Workspace.

Query-Parameter:

| Feld           | Erforderlich | Hinweise                                                                                                                                                                                          |
| -------------- | ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `archiveState` | nein       | `active` (Standard) oder `archived`. Jeder andere Wert gibt `400 { code: "invalid_archive_state" }` zurück.                                                                                       |
| `cursor`       | nein       | Paginierungs-Cursor aus der vorherigen Response.                                                                                                                                                  |
| `size`         | nein       | Seitengröße. Ungültige Werte geben `400 { code: "invalid_cursor" }` oder die bestehende Seitengrößen-Validierung zurück.                                                                          |
| `view`         | nein       | Weglassen für die Legacy-Recent-Liste. `organized` aktiviert die serverseitige Pinned/Group-Sortierung und fügt optionale Organisationsfelder hinzu. Jeder andere Wert gibt `400 { code: "invalid_session_view" }` zurück. |
| `group`        | nein       | Nur sinnvoll mit `view=organized`. `all` (Standard), `pinned`, `ungrouped` oder eine benutzerdefinierte Gruppen-ID. Unbekannte Gruppen-IDs geben `404 { code: "group_not_found" }` zurück.         |

Antwort:

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

Mit `view=organized` liest der Daemon `<Storage.getProjectDir(cwd)>/session-organization.v1.json`, gibt gepinnte Sessions zuerst zurück, dann absteigend nach Aktivitätszeit und schließlich nach `sessionId` für stabile Gleichstände. Der organisierte Cursor ist ein opaque base64url-JSON und darf nicht mit der Legacy-Recent-Liste wiederverwendet werden. `pinned` ist ein virtueller Filter, keine Gruppe. `groupId: null` bedeutet nicht gruppiert. Archivierte Sessions behalten ihre Organisationsmetadaten, aber `archiveState=archived&view=organized` gibt dennoch nur archivierte Sessions zurück.

Zusätzliche Felder können bei jeder Session erscheinen, wenn `view=organized`:

```json
{
  "isPinned": true,
  "pinnedAt": "2026-07-04T12:00:00.000Z",
  "groupId": "018f..."
}
```

Vertrauenswürdige aktive Listen enthalten Live-Daemon-Overlay-Felder wie `clientCount` und `hasActivePrompt`. Nicht vertrauenswürdige sekundäre und archivierte Listen sind rein speicherbasiert: Live-Overlay-Felder bleiben absent oder false, und archivierte Einträge setzen `isArchived` auf `true`. Leeres Array (nicht 404), wenn keine Sessions existieren — eine Session-Picker-UI sollte keinen Fehler werfen, nur weil der Workspace inaktiv ist.

### `GET /workspace/:id/session-groups`

Listet benutzerdefinierte Session-Gruppen für einen Workspace auf. Der Singular-GET-Selektor akzeptiert jede registrierte Workspace-ID oder URL-kodiertes kanonisches CWD. Das Plural-GET-Alias ist auch für einen nicht vertrauenswürdigen sekundären Workspace verfügbar und liest nur den Organisations-Sidecar. Plural-Gruppenmutationen bleiben Trust-gated, während Singular-Gruppenmutationen ihr bisheriges Primary-only-Kompatibilitätsverhalten beibehalten. Pre-flight `caps.features.includes('session_organization')`.

Antwort:

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

Farben sind reine Protokoll-Tokens; Clients lokalisieren die Anzeigenamen. Es werden keine Standardgruppen mit Farbnamen erstellt.

### `POST /workspace/:id/session-groups`

Erstellt eine benutzerdefinierte Session-Gruppe. Striktes Mutations-Gate. Pre-flight `caps.features.includes('session_organization')`.

Request:

```json
{ "name": "Frontend", "color": "blue" }
```

`name` wird getrimmt, muss 1-64 Zeichen lang sein, darf keine Steuerzeichen enthalten und ist innerhalb des Workspace eindeutig durch einen Case-insensitive getrimmten Vergleich. Doppelte Namen geben `409 { code: "group_name_conflict" }` zurück. `color` muss eine der zurückgegebenen `colorOptions` sein.

Antwort:

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

Aktualisiert eine benutzerdefinierte Session-Gruppe. Striktes Mutations-Gate. Pre-flight `caps.features.includes('session_organization')`. Body-Felder sind optional: `{ "name"?: string, "color"?: string, "order"?: number }`. Unbekannte Gruppen-IDs geben `404 { code: "group_not_found" }` zurück; doppelte/ungültige Namen und Farben verwenden dieselben Fehler wie beim Erstellen.

### `DELETE /workspace/:id/session-groups/:groupId`

Löscht eine benutzerdefinierte Session-Gruppe. Striktes Mutations-Gate. Pre-flight `caps.features.includes('session_organization')`. Sessions, die auf die Gruppe verweisen, werden auf `groupId: null` gesetzt; der Pinned-Status bleibt erhalten. Die Response ist `{ "deleted": true }`, wenn eine Gruppe entfernt wurde, und `{ "deleted": false }`, wenn die ID nicht existierte.

### `POST /sessions/delete`

Hard-Delete einer oder mehrerer persistierter Session-JSONL-Dateien. Der Daemon schließt zunächst best-effort aktive Sessions und entfernt dann die aktive oder archivierte JSONL. Wenn für dieselbe ID sowohl eine aktive als auch eine archivierte Kopie existiert, werden beide entfernt. Worktree-Sidecars auf beiden Seiten werden bereinigt; Dateihistorie, Subagent-Transkripte und Runtime-Sidecars bleiben absichtlich erhalten.

Request:

```json
{ "sessionIds": ["<uuid>"] }
```

Response:

```json
{
  "removed": ["<uuid>"],
  "notFound": [],
  "errors": []
}
```

### `POST /sessions/archive`

Archiviert eine oder mehrere Sessions. Das Archivieren ist ein Zustandsübergang, kein Löschen: Die JSONL wird von `chats/<id>.jsonl` nach `chats/archive/<id>.jsonl` verschoben. Dateihistorie, Subagent-Transkripte und Runtime-Sidecars bleiben unverändert. Wenn eine Session aktiv (live) ist, führt der Daemon zunächst ein striktes Schließen (strict close) durch und verlangt, dass der Close-Handler des ACP-Agents die Chat-Aufzeichnung flushen muss; wenn das Schließen oder Flushen fehlschlägt, wird die JSONL nicht verschoben. Pre-flight `caps.features.session_archive`.

Request:

```json
{ "sessionIds": ["<uuid>"] }
```

`sessionIds` muss ein nicht leeres String-Array mit höchstens 100 IDs sein. Duplikate werden zusammengeführt.

Response:

```json
{
  "archived": ["<uuid>"],
  "alreadyArchived": [],
  "notFound": [],
  "errors": []
}
```

`errors`-Einträge haben das Format `{ "sessionId": "<uuid>", "error": "message" }`. Aktive und archivierte Dateien mit derselben ID werden als Konflikt behandelt und in `errors` gemeldet; keine Datei wird überschrieben.

### `POST /sessions/unarchive`

Stellt archivierte Sessions im aktiven Verzeichnis wieder her. Dies setzt die Session nicht automatisch fort; es verschiebt lediglich `chats/archive/<id>.jsonl` zurück nach `chats/<id>.jsonl`. Nach erfolgreichem Unarchivieren können Clients `POST /session/:id/load` oder `POST /session/:id/resume` aufrufen.

Request:

```json
{ "sessionIds": ["<uuid>"] }
```

Response:

```json
{
  "unarchived": ["<uuid>"],
  "alreadyActive": [],
  "notFound": [],
  "errors": []
}
```

Wenn für die ID bereits eine aktive JSONL existiert, meldet das Unarchivieren einen Konflikt in `errors` und überschreibt sie nicht. Wenn für dieselbe ID bereits ein Archivierungs- oder Unarchivierungsvorgang läuft, wird `409 session_archiving` zurückgegeben, bevor der Batch gestartet wird.

ACP-over-HTTP verwendet dieselben Request- und Response-Bodies über die Vendor-Methoden `_qwen/sessions/archive` und `_qwen/sessions/unarchive`. Die REST-Route-Tabelle mappt `POST /sessions/archive` und `POST /sessions/unarchive` für ACP-Transports auf diese Methoden.

### Multi-Workspace-Live-Session-Routing

Wenn `multi_workspace_sessions` beworben wird, identifizieren Live-Session-Operationen ihren Workspace anhand der `sessionId`; Clients fügen der URL keinen Workspace-Selektor hinzu. Zusätzlich zu den bestehenden Owner-gerouteten Lifecycle-Operationen gilt dies für `PATCH /session/:id/metadata`, `POST /session/:id/recap`, `POST /session/:id/generate`, `POST /session/:id/btw`, `POST /session/:id/mid-turn-message`, `DELETE /session/:id/mid-turn-messages/:messageId`, `POST /session/:id/tasks/:taskId/cancel`, `POST /session/:id/goal/clear`, `POST /session/:id/continue`, `POST /session/:id/language`, `POST /session/:id/artifacts` und `DELETE /session/:id/artifacts/:artifactId`. Der Daemon routet jede Anfrage an die vertrauenswürdige Runtime, der die Live-Session gehört. Ein nicht vertrauenswürdiger nicht primärer Owner gibt `403 untrusted_workspace` zurück, ein fehlender Live-Owner gibt `404 session_not_found` zurück, und ein mehrdeutiger Owner schlägt fail-closed mit `500 ambiguous_session_owner` fehl.

Diese Regel gilt nur für Live-Sessions und macht nicht jede Workspace-lose Session-Route Multi-Workspace-fähig. Persistierte oder archivierte Operationen verwenden ihre dokumentierten Workspace-qualifizierten Routen. `POST /session/:id/branch`, `POST /session/:id/fork` und `POST /session/:id/cd` bleiben absichtlich nur für Primary und geben `non_primary_session_route_not_supported` für nicht primäre Owner zurück.

### Mid-Turn-Nachrichten

`POST /session/:id/mid-turn-message` akzeptiert `{ "message": "..." }`, während ein Turn aktiv ist. Eine erfolgreiche Aufnahme gibt `{ "accepted": true, "messageId": "<uuid>" }` zurück; eine inaktive Session oder eine volle Mid-Turn-Queue gibt `{ "accepted": false }` zurück, und der Client sollte die Nachricht für die normale Next-Turn-Einreichung behalten. Wenn die Nachricht in den laufenden Turn drainiert wird, enthält `mid_turn_message_injected` ausgerichtete `messages`- und `messageIds`-Arrays plus die Ursprungs-Client-ID.

Wenn `session_mid_turn_message_mutation` beworben wird, kann der Ursprungs-Client `DELETE /session/:id/mid-turn-messages/:messageId` aufrufen. Er gibt `{ "removed": true }` nur zurück, während diese Nachricht noch in der Daemon-Queue wartet. `{ "removed": false }` bedeutet, dass sie nicht gefunden wurde, einem anderen Client gehörte oder bereits drainiert war.

### `POST /session/:id/prompt`

Leitet einen Prompt an den Agenten weiter. Multi-Prompt-Caller werden pro Session in einer FIFO-Warteschlange gereiht (ACP garantiert einen aktiven Prompt pro Session).

Request:

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

`delivery` ist optional und erfordert die `channel_delivery`-Capability. Der
Daemon gibt weiterhin `202 {promptId,lastEventId}` zurück, wenn der Prompt aufgenommen wird.
Nach einem erfolgreichen `end_turn` übermittelt die Session den sichtbaren finalen Text an den
bereits laufenden Channel Worker des exakten Workspaces. Die Payload ist nur der
letzte toolfreie Assistant-Antwortblock; Tool-Call-Einleitungen, Tool-Erzählungen,
veraltete Wiederholungen und frühere automatische Fortsetzungsblöcke werden
ausgeschlossen. Ein leerer oder nur-Whitespace-finaler erzeugt weiterhin ein korreliertes
`channel_delivery_result` mit `status: "skipped"`, nachdem die Autorisierung verbraucht wurde,
kontaktiert aber keinen Worker. Delivery-Erfolg oder -Fehler kommt später über dasselbe
replaybare Event und ändert niemals `turn_complete` in `turn_error`. Cancellation,
Agent-Fehler und Token-Limit-Beendigung senden oder veröffentlichen kein Delivery-Ergebnis.

Validierung: `prompt` muss ein nicht leeres Array von Objekten sein. Andere Fehler geben `400` zurück, bevor die Bridge erreicht wird.

Response:

```json
{ "promptId": "session-id########1", "lastEventId": 42 }
```

Die `202`-Antwort bestätigt die Aufnahme, nicht den Agent-Abschluss. Beobachte den
Session-SSE-Stream nach `lastEventId` und korreliere `turn_complete` oder
`turn_error` nach `promptId`. `turn_complete.data.stopReason` kann `end_turn`,
`cancelled`, `max_tokens`, `error` oder `length` sein.

Wenn der HTTP-Client mitten im Prompt die Verbindung trennt, sendet der Daemon eine ACP-`cancel`-Benachrichtigung an den Agenten, wodurch der Prompt mit `stopReason: "cancelled"` beendet wird.

Wenn `prompt_absolute_deadline` beworben wird, kann `deadlineMs` die
konfigurierte Server-Deadline verkürzen. Ablauf emittiert ein korreliertes `turn_error` mit
`errorKind: "prompt_deadline_exceeded"`.

### `POST /session/:id/cancel`

Bricht den **aktuell aktiven** Prompt der Session ab. ACP-seitig ist dies eine Benachrichtigung, kein Request — der Agent bestätigt dies, indem er das aktive `prompt()` mit `cancelled` auflöst.

```bash
curl -X POST http://127.0.0.1:4170/session/$SID/cancel
# → 204 No Content
```

> **Multi-Prompt-Vertrag:** Cancel betrifft nur den aktiven Prompt. Alle Prompts, die derselbe Client zuvor gepostet hat und die noch hinter dem aktiven in der Warteschlange stehen, werden weiterhin ausgeführt. Multi-Prompt-Queueing ist ein vom Daemon eingeführtes Verhalten (nicht in der ACP-Spezifikation); der Vertrag für Prompts in der Warteschlange lautet: "sie laufen weiter, es sei denn, du brichst sie einzeln ab oder beendest die Session über den Channel-Exit".

Wenn Prompts in der Warteschlange in einem Multi-Client-Deployment unerwartet sind, stelle zunächst sicher,
ob die Caller eine Standard-Session mit `sessionScope: "single"` teilen. Für unabhängige
Unterhaltungen pro Thread erstelle Sessions mit `sessionScope: "thread"`, sodass Prompts
nur innerhalb dieses Threads serialisiert werden.

### `DELETE /session/:id`

Schließt eine aktive Session explizit. Erzwingt das Schließen, auch wenn andere Clients verbunden sind — bricht alle aktiven Prompts ab, löst ausstehende Berechtigungen als abgebrochen auf, veröffentlicht das `session_closed`-Event, schließt den EventBus und entfernt die Session aus den Daemon-Maps. Auf der Festplatte persistierte Sessions werden NICHT gelöscht — sie können über `POST /session/:id/load` neu geladen werden. Pre-flight `caps.features.session_close`.

```bash
curl -X DELETE http://127.0.0.1:4170/session/$SID
# → 204 No Content
```

Idempotent: Gibt `404` für unbekannte Sessions zurück (gleiche `SessionNotFoundError`-Struktur wie bei anderen Routen).

> **`session_closed`-Event.** SSE-Subscriber erhalten ein terminales `session_closed`-Event mit `{ sessionId, reason: 'client_close', closedBy?: '<clientId>' }`, bevor der Stream endet. SDK-Reducer behandeln dies identisch zu `session_died` (setzt `alive: false`, löscht `pendingPermissions`).

### `PATCH /session/:id/metadata`

Aktualisiert mutable Session-Metadaten. Unterstützt derzeit nur `displayName`. Pre-flight `caps.features.session_metadata`. Gruppierung und Pinning sind absichtlich nicht Teil dieser Route; verwende `PATCH /session/:id/organization` unter `session_organization`.

Request:

```json
{ "displayName": "My Investigation Session" }
```

| Field         | Required | Notes                                                                          |
| ------------- | -------- | ------------------------------------------------------------------------------ |
| `displayName` | nein     | String, max. 256 Zeichen. Ein leerer String löscht den Namen. Weglassen, um ihn unverändert zu lassen. |

Response:

```json
{ "sessionId": "<uuid>", "displayName": "My Investigation Session" }
```

Veröffentlicht ein `session_metadata_updated`-Event auf dem SSE-Stream der Session mit `{ sessionId, displayName }`.

### `PATCH /session/:id/organization` und `PATCH /workspaces/:workspace/session/:id/organization`

Aktualisiert den lokalen Session-Organisationszustand über das bestehende Mutations-Gate. Pre-flight `caps.features.includes('session_organization')`; die Plural-Route erfordert zusätzlich `workspace_qualified_rest_core`. Auf der Plural-Route wird `:workspace` zuerst als exakte registrierte Workspace-ID aufgelöst und dann als URL-kodiertes kanonisches absolutes CWD. Die ausgewählte Runtime muss vertrauenswürdig sein. Die Session-Existenz- und Nicht-Null-`groupId`-Validierung sind auf den aktiven persistierten, archivierten persistierten und Live-Session-Zustand und Gruppen-Store dieser Runtime beschränkt, ohne Fallback auf den Primary oder einen anderen Workspace. Die Legacy-Route bleibt nur für den primären Workspace.

Request:

```json
{ "isPinned": true, "groupId": "018f..." }
```

| Field      | Required | Notes                                                                                                |
| ---------- | -------- | ---------------------------------------------------------------------------------------------------- |
| `isPinned` | nein     | Boolean. `true` setzt `pinnedAt`, wenn es noch nicht gepinnt war; `false` löscht `pinnedAt`.         |
| `groupId`  | nein     | Benutzerdefinierte Gruppen-ID oder `null` für nicht gruppiert. Unbekannte Gruppen-IDs geben `404 { code: "group_not_found" }` zurück. |
| `color`    | nein     | Ein unterstütztes Session-Farb-Token, oder `null` zum Löschen der Session-Farbe.                     |

Response:

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

Dieser Zustand wird im Session-Organisations-Sidecar auf Projektebene unter dem Daemon-Runtime-Speicherverzeichnis gespeichert. Es handelt sich nicht um Transkript-Inhalte, aktualisiert nicht die `mtime` des Transkripts, wird nicht mit Transkripten exportiert und bleibt bei Archivierung/Unarchivierung erhalten.

### `POST /session/:id/heartbeat`

Aktualisiert das Last-Seen-Bookkeeping des Daemons für diese Session. Langlebige Adapter (TUI/IDE/web) pingen dies in einem Intervall, sodass zukünftige Revocation-Policies (Wave 5 PR 24) tote Clients von inaktiven unterscheiden können.

Headers:

| Header             | Required | Notes                                                                                                                                                                                                                                   |
| ------------------ | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `X-Qwen-Client-Id` | nein     | Gibt die vom Daemon ausgegebene ID aus `POST /session` zurück (Echo). Identifizierte Clients aktualisieren auch ihren pro-Client-Timestamp; anonyme Heartbeats aktualisieren nur die pro-Session-Watermark. Muss dieselbe `[A-Za-z0-9._:-]{1,128}`-Form erfüllen wie andernorts. |

Der Request-Body ist leer (`{}` ist in Ordnung – heute werden keine Felder gelesen).

Response:

```json
{
  "sessionId": "<sid>",
  "clientId": "<cid>",
  "lastSeenAt": 1700000000123
}
```

`clientId` wird nur zurückgegeben (Echo), wenn eine vertrauenswürdige `X-Qwen-Client-Id` übermittelt wurde. `lastSeenAt` ist der daemon-seitige `Date.now()`-Epoch (ms), den die Bridge gespeichert hat.

Errors:

- `400` — `{ code: 'invalid_client_id' }`, wenn der Header fehlerhaft formatiert ist (Header-Shape-Regel) oder wenn er eine `clientId` enthält, die nicht für diese Session registriert ist (die Bridge wirft `InvalidClientIdError`, bevor ein Timestamp aktualisiert wird).
- `404` — unbekannte Session.

Capability-Gating: Pre-flight `caps.features.client_heartbeat`. Ältere Daemons geben für diesen Pfad `404` zurück.

### `POST /session/:id/model`

Wechselt das aktive Modell **innerhalb** des aktuell an die Session gebundenen Model-Services. Serialisiert über die pro-Session Model-Change-Queue.

(Um den _Service_ selbst zu wechseln – z. B. Alibaba ModelStudio vs. OpenRouter – übergib `modelServiceId` bei `POST /session` für eine neue Session. Stage 1 hat keine Live-Service-Switch-Route.)

Request:

```json
{ "modelId": "qwen-staging" }
```

Response:

```json
{ "modelId": "qwen-staging" }
```

Bei Erfolg wird `model_switched` an den SSE-Stream veröffentlicht. Bei Fehlschlag wird `model_switch_failed` veröffentlicht (sodass auch passive Subscriber den Fehlschlag sehen, nicht nur der Caller). Wettlauf (Race) gegen den Agent-Channel-Exit, sodass ein blockierter Child-Prozess den HTTP-Handler nicht blockieren kann.

### `POST /session/:id/recap`

Capability-Tag: `session_recap`. Bridge → ACP extMethod `qwen/control/session/recap`.

Generiert eine einzeilige "Wo habe ich aufgehört"-Zusammenfassung der Session. Umhüllt die Core-Funktion `generateSessionRecap` (`packages/core/src/services/sessionRecap.ts`), die eine Side-Query gegen das schnelle Modell mit deaktivierten Tools, `maxOutputTokens: 300` und einem strikten `<recap>...</recap>`-Ausgabeformat ausführt. Die Side-Query liest die bestehende GeminiClient-Chat-Historie der Session und fügt dieser **nichts** hinzu.

Der Request-Body wird ignoriert (sende `{}` oder leer). Non-strict Mutation-Gate – das Vorgehen spiegelt `/session/:id/prompt` wider (der Aufruf kostet Tokens, mutiert aber keinen Zustand). Es wird kein SSE-Event veröffentlicht.

Response (200):

```json
{
  "sessionId": "sess:42",
  "recap": "Debugging the auth retry race. Next: add deterministic timing to the integration test."
}
```

`recap` ist `null` (ein normales 200, kein Fehler), wenn:

- die Session noch weniger als zwei Dialog-Turns hat,
- die Side-Query keine extrahierbare `<recap>...</recap>`-Payload zurückgegeben hat,
- oder ein zugrunde liegender Modellfehler aufgetreten ist (der Core-Helper arbeitet nach dem Best-Effort-Prinzip und wirft nie).

Errors:

- `400 {code: 'invalid_client_id'}` — fehlerhaft formatierter `X-Qwen-Client-Id`-Header.
- `404` — Session unbekannt.

Abbruch (Cancellation): **keiner in v1**. Die Route lauscht nicht auf HTTP-Client-Disconnects, kein `AbortSignal` wird in die Bridge durchgereicht, und der ACP-Child führt die Side-Query bis zum Abschluss aus, unabhängig davon, ob der Caller die Verbindung getrennt hat. Die einzigen Obergrenzen sind der 60s-Backstop-Timeout der Bridge (`SESSION_RECAP_TIMEOUT_MS`) und der Transport-Closed-Wettlauf gegen den ACP-Channel-Tod. Dies ist akzeptabel, da Recap kurz ist (einzelner Versuch, `maxOutputTokens: 300`, typischerweise ~1–5s); eine request-id-basierte Cancel-Ext-Methode kann in einer zukünftigen Version eine vollständige End-to-End-Abbruchlogik durchreichen, falls die Bandbreitenkosten dies jemals rechtfertigen.

### `POST /session/:id/generate`

Capability-Tag: `session_generation`.

Führt anfrage-scopige Textgenerierung aus einem vom Aufrufer bereitgestellten Prompt aus. Die Anfrage liest oder mutiert keinen Konversationsverlauf und legt keine Tools offen. Sie bevorzugt das konfigurierte schnelle Modell und fällt auf das Hauptmodell der Session zurück, wenn das schnelle Modell fehlt oder nicht aufgelöst werden kann. Der Endpunkt ist aufgabenagnostisch; Übersetzung ist nur ein möglicher vom Aufrufer definierter Prompt.

Request:

```json
{ "prompt": "Translate into Chinese: Hello" }
```

Die Antwort ist `text/event-stream`. Der Server schreibt sofort einen initialen SSE-Kommentar, gefolgt von `started`, einem optionalen `thinking`-Fortschritts-Event, null oder mehr `delta`-Events und `done`. Das `thinking`-Event trägt keinen Reasoning-Inhalt. Ein Modellfehler nach Streaming-Start erzeugt ein `error`-Event; er wiederholt nicht mit einem anderen Modell. Prompts sind auf 32 KiB UTF-8-Text begrenzt. Das Trennen des HTTP-Clients annulliert die Generierungsanfrage.

### Mutation: approval, tools, skills, init, MCP restart

Der Daemon legt fünf Mutations-Control-Routen offen, die es Remote-Clients ermöglichen, das Laufzeitverhalten zu ändern, ohne die CLI des Daemon-Hosts zu verwenden. Alle fünf:

- Werden durch das **strict** Mutation-Gate aus PR 15 abgesichert. Ein Daemon, der ohne Bearer Token konfiguriert ist, lehnt sie mit `401 {code: 'token_required'}` ab. Konfiguriere `--token` (oder `QWEN_SERVER_TOKEN`), bevor du diese Routen aktivierst.
- Akzeptieren und stempeln den `X-Qwen-Client-Id`-Header (PR 7 Audit-Chain). Wenn der Header eine vertrauenswürdige ID enthält, emittiert der Daemon `originatorClientId` im entsprechenden SSE-Event, damit Cross-Client-UIs Echos eigener Mutationen unterdrücken können.
- Prüfen jede Per-Tag-Capability im Pre-Flight, bevor die Affordance verfügbar gemacht wird. Ältere Daemons geben für die Route `404` zurück.

Die Tool-Toggle-, Skill-Toggle-, Init- und MCP-Restart-Routen emittieren **Workspace-scopige** Events: Jeder aktive Session-SSE-Bus empfängt das Event, unabhängig davon, welche Session angehängt war, als die Mutation ausgelöst wurde. `approval-mode` emittiert ein **Session-scopiges** Event, da die Änderung lokal auf die `Config` einer einzelnen Session beschränkt ist.

#### `POST /session/:id/approval-mode`

Capability-Tag: `session_approval_mode_control`. Bridge → ACP extMethod `qwen/control/session/approval_mode`.

Ändere den Approval-Modus einer Live-Session. Der neue Modus landet sofort in der session-spezifischen `Config` des ACP-Childs. Einstellungen werden standardmäßig NICHT auf die Festplatte geschrieben – übergebe `persist: true`, um `tools.approvalMode` auch in die Workspace-Einstellungen zu schreiben.

Request:

```json
{ "mode": "auto-edit", "persist": false }
```

`mode` muss einer der folgenden Werte sein: `'plan' | 'default' | 'auto-edit' | 'auto' | 'yolo'` (Spiegelung des `ApprovalMode`-Enums von Core; das SDK exportiert `DAEMON_APPROVAL_MODES` zur Laufzeitvalidierung). `persist` ist standardmäßig `false`.

Response (200):

```json
{
  "sessionId": "sess:42",
  "mode": "auto-edit",
  "previous": "default",
  "persisted": false
}
```

Fehler:

- `400 {code: 'invalid_approval_mode', allowed: [...]}` — unbekannter Modus-Literal.
- `400 {code: 'invalid_persist_flag'}` — `persist` ist nicht-boolean.
- `403 {code: 'trust_gate', errorKind: 'auth_env_error'}` — Der angeforderte Modus erfordert einen vertrauenswürdigen Ordner (privilegierte Modi in nicht vertrauenswürdigen Workspaces werden von `Config.setApprovalMode` des Cores abgelehnt).
- `404` — Session unbekannt.

SSE-Event (Session-scoped): `approval_mode_changed` mit `{sessionId, previous, next, persisted, originatorClientId?}`.

#### `POST /workspace/tools/:name/enable`

Capability-Tag: `workspace_tool_toggle`. Reine Datei-IO – kein ACP-Roundtrip.

Schalte einen Tool-Namen in der `tools.disabled`-Einstellungsliste des Workspaces um. Tools, die dort aufgeführt sind, werden **gar nicht erst registriert** (im Gegensatz zu `permissions.deny`, wo das Tool registriert bleibt, aber der Aufruf abgelehnt wird). Sowohl integrierte Tools als auch über MCP entdeckte Tools durchlaufen `ToolRegistry.registerTool`, was die Menge der deaktivierten Tools konsultiert.

> ⚠️ **Namen müssen exakt mit dem vom Registry bereitgestellten Identifier übereinstimmen.** Es findet keine Alias-Auflösung statt – die Route speichert den String aus dem Pfadparameter direkt in `tools.disabled`, und das nächste ACP-Child vergleicht beim Registrieren mit `tool.name`. Integrierte Tools verwenden ihren kanonischen Registry-Namen (snake_case-Verbform): `run_shell_command`, `read_file`, `write_file`, `list_directory`, `glob`, `grep_search`, `web_fetch` usw. – NICHT die Anzeige-Labels (`Shell`, `Read`, `Write`), die die CLI anzeigt. Über MCP entdeckte Tools verwenden die qualifizierte Form `mcp__<server>__<name>` (dies ist auch die Form, die `tool_toggled`-Events broadcasten und die `GET /workspace/mcp` auflistet). Das Deaktivieren von `Bash` verhindert NICHT, dass `run_shell_command` in der nächsten Session registriert wird.

Live-ACP-Childs behalten bereits registrierte Tools – die Umschaltung wird erst beim Spawnen des **nächsten** ACP-Childs wirksam. Kombiniere dies mit `POST /workspace/mcp/:server/restart` (für MCP-Tools) oder der Erstellung einer neuen Session, um die Änderung im aktuellen Daemon wirksam zu machen.

Unbekannte Tool-Namen werden akzeptiert: Das vorzeitige Deaktivieren eines noch nicht installierten MCP-Tools ist ein legitimer Anwendungsfall.

Request:

```json
{ "enabled": false }
```

Response (200):

```json
{ "toolName": "run_shell_command", "enabled": false }
```

Fehler:

- `400 {code: 'invalid_tool_name'}` — leerer Pfadparameter oder Pfadparameter überschreitet das Limit von 256 Zeichen.
- `400 {code: 'invalid_enabled_flag'}` — `enabled` fehlt oder ist nicht-boolean.

SSE-Event (Workspace-scoped): `tool_toggled` mit `{toolName, enabled, originatorClientId?}`.

#### `POST /workspace/skills/:name/enable`

Capability-Tag: `workspace_skill_toggle`. Die Workspace-qualifizierte Form ist `POST /workspaces/:workspace/skills/:name/enable`.

Schalte einen geladenen, benutzer-aufrufbaren Skill über die Workspace-Skill-Einstellungen um, passend zum Space-Tasten-Verhalten des CLI `/skills`-Panels. Das Lookup ist Case-insensitive, während Persistenz und Antwort den kanonischen Namen des Skills verwenden. Das Aktivieren eines `skills.defaultDisabled`-Skills fügt ein Workspace-`skills.enabled`-Opt-in hinzu; das Deaktivieren entfernt dieses Opt-in und fügt einen Workspace-`skills.disabled`-Eintrag hinzu. Bestehende Einträge für nicht mehr geladene Skills werden beibehalten, und doppelte/Case-variante Einträge für das Ziel werden zusammengeführt. Ein Hard-Disable-Eintrag, der von System-Defaults, Benutzer oder System-Scope geerbt wurde, sperrt den Skill: Workspace-Scope kann ihn nicht überschreiben.

Dies unterscheidet sich von der ACP-`qwen/skills/setEnabled`-Managed-Skill-Operation und dem `disable-model-invocation`-Frontmatter-Feld. Die effektive Skill-Verfügbarkeit folgt `skills.disabled` > `skills.enabled` > `skills.defaultDisabled`. Sowohl Hard- als auch Default-Deaktivierungen entfernen den Skill aus der Slash-Command/Modell-Verfügbarkeit und lehnen spätere Skill-Ausführung ab. `disable-model-invocation: true` hält die direkte Benutzer-Aufrufmöglichkeit verfügbar und verbirgt den Skill nur vor der Modellaufrufung.

Request:

```json
{ "enabled": false }
```

Response (200):

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

`activation` ist `applied`, wenn jede aktive Session aktualisiert wurde, `deferred`, wenn kein ACP-Child existiert (die persistierte Einstellung wird verwendet, wenn eines startet), und `partial`, wenn mindestens eine aktive Session die Aktualisierung nicht geschafft hat. Busy Sessions sind eingeschlossen. Der Daemon lädt die Workspace-Einstellungen für das ACP-Child und jede aktive Session neu, benachrichtigt SkillManager-Consumer und pusht `available_commands_update`. Eine bereits an das Modell gesendete Anfrage wird nicht umgeschrieben; nachfolgende Validierung, Befehls-Snapshots und Modellkontexte verwenden den neuen Zustand. Wenn die Persistenz fehlschlägt, wird kein Refresh oder Event emittiert. Wenn ein Session-Refresh fehlschlägt, wird die committete Einstellung beibehalten. Wenn das Child pro-Session-Ergebnisse zurückgibt, sind die Session-Zahlen exakt. Wenn der Refresh-Control selbst vor der Rückgabe dieser Ergebnisse fehlschlägt, ist `sessionsFailed: 1` eine konservative Untergrenze, die anzeigt, dass die Refresh-Anfrage fehlgeschlagen ist.

Fehler:

- `400 {code: 'invalid_skill_name'}` — leerer Pfadparameter oder mehr als 256 Zeichen.
- `400 {code: 'invalid_enabled_flag'}` — `enabled` fehlt oder ist nicht-boolean.
- `403 {code: 'untrusted_workspace'}` — der ausgewählte Workspace ist nicht vertrauenswürdig.
- `404 {code: 'skill_not_found'}` — kein geladener Skill passt zum Namen.
- `409 {code: 'skill_not_toggleable', reason: 'not_user_invocable' | 'inactive_extension' | 'locked', lockedScope?: 'system' | 'user' | 'systemDefaults'}` — das CLI-Panel würde das Ziel nicht zum Umschalten zulassen. `lockedScope` ist nur vorhanden, wenn `reason` `locked` ist.

Die Mutation verwendet das Workspace-scopige `settings_changed`-Event für jeden geänderten Key (`skills.disabled` und/oder `skills.enabled`); sie fügt keinen neuen Event-Typ hinzu. Workspace-Skill-Status-Zellen enthalten optionale `disabledReason: 'hard' | 'default' | 'inactive_extension'`- und `lockedScope: 'system' | 'user' | 'systemDefaults'`-Felder.

#### `POST /workspace/init`

Capability-Tag: `workspace_init`. Reine Datei-IO – kein ACP-Roundtrip, **kein LLM-Aufruf**.

Erstelle eine leere `QWEN.md` (oder was auch immer `getCurrentGeminiMdFilename()` unter `--memory-file-name`-Overrides zurückgibt) im gebundenen Workspace-Root des Daemons. Rein mechanisch – für KI-gestütztes Füllen von Inhalten folge mit `POST /session/:id/prompt`.

Standardmäßig wird das Überschreiben verweigert, wenn die Zieldatei Nicht-Whitespace-Inhalte enthält. Dateien nur mit Whitespace werden als nicht vorhanden behandelt (entspricht dem lokalen `/init`-Slash-Command).

Request:

```json
{ "force": false }
```

Response (200):

```json
{ "path": "/work/bound/QWEN.md", "action": "created" }
```

`action` ist `'created'` für Neuerstellungen, `'noop'`, wenn eine bestehende Whitespace-only-Datei unberührt blieb (kein Schreibvorgang), und `'overwrote'`, wenn `force: true` nicht-leere Inhalte ersetzt hat. Das `workspace_initialized`-SSE-Event spiegelt die Response-Action wider – Observer können nach `action !== 'noop'` filtern, um nur auf tatsächliche Änderungen auf der Festplatte zu reagieren.

Fehler:

- `400 {code: 'invalid_force_flag'}` — `force` ist nicht-boolean.
- `409 {code: 'workspace_init_conflict', path, existingSize}` — Datei existiert mit Nicht-Whitespace-Inhalten und `force` fehlt oder ist false. Der Body enthält den absoluten Pfad und die Größe (Bytes), damit SDK-Clients einen "N Bytes überschreiben?"-Prompt rendern können, ohne die Datei erneut zu staten.

SSE-Event (Workspace-scoped): `workspace_initialized` mit `{path, action, originatorClientId?}`.

#### `POST /workspace/mcp/reload`

Lade persistierte MCP-Einstellungen in die Workspace-Discovery-Konfiguration und jede
aktive Session neu. Die Workspace-qualifizierte Form ist
`POST /workspaces/:workspace/mcp/reload`.

Request-Body:

```json
{ "forceReconnectAll": true }
```

`forceReconnectAll` ist optional und standardmäßig `false`, erhält
inkrementelle Reconciliation. Wenn true, verbindet der Daemon jeden berechtigten
konfigurierten MCP-Server nach der Settings-Reconciliation neu. Alternativ übergib
`forceReconnectWhich: ["server-a", "server-b"]`, um nur benannte Server neu zu verbinden.
Die Optionen schließen sich gegenseitig aus. Ein erzwungener Reconnect verursacht, dass jeder
Transport Credentials liest, die ein anderer lokaler Qwen-Code-Prozess in den Token-Speicher
geschrieben haben könnte; er startet keinen OAuth-Autorisierungs-Flow.

Die Route gibt `202 { "accepted": true }` zurück; polle `GET /workspace/mcp` für
den endgültigen Verbindungsstatus. Ungültige Optionswerte geben 400 zurück.

#### `POST /workspace/mcp/:server/restart`

Capability-Tag: `workspace_mcp_restart`. Bridge → ACP extMethod `qwen/control/workspace/mcp/restart`.

Starte einen konfigurierten MCP-Server über `McpClientManager.discoverMcpToolsForServer` des ACP-Childs neu (Disconnect + Reconnect + Rediscover). Prüft vorab den Live-Budget-Snapshot aus dem Accounting von PR 14 v1, sodass ein Neustart in einem Budget-gesättigten Workspace einen Soft-Refusal zurückgibt, anstatt eine `BudgetExhaustedError`-Kaskade auszulösen.

Der Request-Body ist leer (`{}`). Der Pfadparameter ist der URL-kodierte Servername, wie er in der `mcpServers`-Konfiguration erscheint.

Response (200) – discriminated Union auf `restarted`:

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

Gründe für Soft-Skips (alle geben 200 zurück):

| `reason`                | Meaning                                                                                                                                                                               |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `'in_flight'`           | Eine weitere Discovery / ein weiterer Neustart für diesen Server ist bereits im Gange. Die Route kehrt sofort zurück, anstatt auf das ursprüngliche Promise zu warten. Der Caller sollte nach einer kurzen Verzögerung erneut versuchen. |
| `'disabled'`            | Server ist konfiguriert, aber in `excludedMcpServers` aufgeführt. Vor dem Neustart wieder aktivieren.                                                                                                    |
| `'budget_would_exceed'` | Daemon ist auf `--mcp-budget-mode=enforce` gesetzt, der Zielserver befindet sich derzeit nicht in `reservedSlots` und der Live-Gesamtwert hat `clientBudget` erreicht. Der Caller sollte zuerst einen Slot freigeben.         |

Fehler (non-2xx):

- `400 {code: 'invalid_server_name'}` — leerer Pfadparameter.
- `404` — Servername nicht in der `mcpServers`-Konfiguration oder kein Live-ACP-Channel vorhanden (Neustart erfordert zwingend eine Live-`McpClientManager`-Instanz).
- `500` — interner Fehler (z. B. `ToolRegistry` nicht initialisiert).

SSE-Events (Workspace-scoped): `mcp_server_restarted` mit `{serverName, durationMs, originatorClientId?}` bei Erfolg; `mcp_server_restart_refused` mit `{serverName, reason, originatorClientId?}` bei Soft-Skip.

### `GET /session/:id/events` (SSE)

Abonniere den Event-Stream der Session.

Headers:

```
Accept: text/event-stream
Last-Event-ID: 42        ← optional, replays from after id 42
X-Qwen-Event-Epoch: ...  ← optional, paart den Cursor mit seiner Bus-Epoche
X-Qwen-Client-Id: ...    ← optionale Client-Identität und diagnostische Korrelation
```

Query-Params:

| Param              | Required | Notes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ------------------ | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `maxQueued`        | nein       | Obergrenze für den **Live-Frame-Backlog** pro Subscriber. Bereich `[16, 2048]`, Standard 256. Replay-Frames, die beim Abonnieren forciert gepusht werden, sind von den Frame- und Byte-Obergrenzen ausgenommen; was sie tatsächlich verbraucht, sind Live-Events, die eintreffen, während der Subscriber noch einen großen `Last-Event-ID: 0`-Replay abarbeitet. Erhöhe diesen Wert für Cold-Reconnects, damit der Live-Tail nicht die Slow-Client-Warnung / Eviction auslöst, bevor der Consumer aufgeholt hat. Die Obergrenze für serialisierte Live-Bytes ist daemonseitig fest (Standard 2 MiB) und hat keinen Query-Parameter. Werte außerhalb des Bereichs / nicht-dezimal / vorhanden aber leer geben `400 invalid_max_queued` zurück, bevor der SSE-Handshake geöffnet wird. Pre-Flight `caps.features.slow_client_warning` – alte Daemons ignorieren den Parameter stillschweigend. |
| `connectReason`    | nein       | Vom Client gemeldeter diagnostischer Hinweis: `initial`, `resume`, `prompt_restart`, `stream_end`, `transport_error`, `state_resync` oder `unknown`. Ungültige Werte werden auf `unknown` normalisiert und lehnen den Handshake niemals ab. Der Daemon verwendet dieses Feld nicht für Auth, Replay, Eviction, Deduplizierung oder Stream-Ersetzung.                                                                                                                                                                                                                                                                                                                                                                                |
| `previousStreamId` | nein       | UUID des vom Client gemeldeten vorherigen akzeptierten REST/SSE-Streams. Ungültige Werte werden ignoriert. Dies ist nur Best-Effort-Lineage und ändert niemals das Stream-Verhalten.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |

Ein erfolgreicher Handshake enthält `X-Qwen-SSE-Stream-Id: <uuid>`. Browser-Gateways müssen diesen Response-Header beibehalten und über `Access-Control-Expose-Headers` offenlegen. Alte Daemons oder Intermediaries können ihn weglassen; Clients müssen normal fortfahren und Lineage als nicht verfügbar behandeln. Die ID identifiziert diese physische REST/SSE-Verbindung und korreliert ihren Daemon-Lifecycle, Queue-Diagnostik und Request-Trace.

Frame-Format. Die `data:`-Zeile ist das **vollständige Event-Envelope**, JSON-stringified in einer einzigen Zeile – `{id?, v, type, data, originatorClientId?}`. Das ACP-spezifische Payload (`sessionUpdate`, `requestPermission`-Argumente usw.) befindet sich im `data`-Feld des Envelopes; der eigene `type` des Envelopes entspricht der SSE-`event:`-Zeile.

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

Die SSE-`id:`- / `event:`-Zeilen duplizieren `envelope.id` / `envelope.type` für EventSource-Kompatibilität. Raw-`fetch`-Consumer (wie `parseSseStream` des SDKs) lesen alles aus dem JSON-Envelope und ignorieren die SSE-Preamble-Zeilen.

| Ereignistyp               | Trigger                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `session_update`          | Jede ACP `sessionUpdate`-Benachrichtigung (LLM-Chunks, Tool-Aufrufe, Nutzung)                                                                                                                                                                                                                                                                                                                                                                                                          |
| `permission_request`      | Agent hat um Tool-Genehmigung gebeten                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `permission_resolved`     | Ein Client hat über `POST /permission/:requestId` für eine Berechtigung abgestimmt                                                                                                                                                                                                                                                                                                                                                                                                       |
| `permission_partial_vote` | (nur Consensus) Eine Stimme wurde erfasst, aber das Quorum ist noch nicht erreicht. Enthält `{requestId, sessionId, votesReceived, votesNeeded, quorum, optionTallies}`. Pre-Flight `caps.features.permission_mediation`.                                                                                                                                                                                                                                                                |
| `permission_forbidden`    | Eine Stimme wurde von der aktiven Richtlinie abgelehnt (`designated`-Mismatch, `local-only` Non-Loopback oder `consensus`-Voter nicht im Snapshot). Enthält `{requestId, sessionId, clientId?, reason}`. Pre-Flight `caps.features.permission_mediation`.                                                                                                                                                                                                                                 |
| `model_switched`          | `POST /session/:id/model` erfolgreich                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `model_switch_failed`     | `POST /session/:id/model` abgelehnt                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `session_died`            | Agent-Child ist unerwartet abgestürzt. **Terminal: Der SSE-Stream wird nach diesem Frame geschlossen; die Session ist aus `byId` entfernt.** Subscriber sollten sich über `POST /session` neu verbinden, um eine neue Session zu erstellen.                                                                                                                                                                                                                                              |
| `slow_client_warning`     | Subscriber-lokal: Live-Frame-Backlog oder Live-Serialized-Byte-Backlog ≥ 75 % voll. **Non-terminal** — der Stream läuft weiter; die Warnung ist eine Vorwarnung vor der Evakuierung. Enthält `{queueSize, maxQueued, lastEventId, queuedBytes?, maxQueuedBytes?, threshold?}`, wobei `threshold` `frames`, `bytes` oder `frames_and_bytes` ist. Wird EINMAL pro Überlauf-Episode ausgelöst; wird scharfgeschaltet, nachdem beide Werte wieder unter 37,5 % gefallen sind. Keine `id` (synthetisch). Pre-Flight `caps.features.slow_client_warning`. |
| `client_evicted`          | Subscriber-lokal: Queue-Überlauf. `reason` ist `queue_overflow` für das Live-Frame-Limit und `queue_bytes_overflow` für das Live-Serialized-Byte-Limit. **Terminal: Der SSE-Stream wird nach diesem Frame geschlossen** (keine `id` — synthetisch). Andere Subscriber auf derselben Session laufen weiter.                                                                                                                                                                                |
| `stream_error`            | Daemon-seitiger Fehler beim Fan-out. **Terminal: Der SSE-Stream wird nach diesem Frame geschlossen** (keine `id` — synthetisch).                                                                                                                                                                                                                                                                                                                                                         |

Reconnect-Semantik:

- Sende `Last-Event-ID: <n>`, um Ereignisse mit `id > n` aus dem Session-Ring abzuspielen (Standardtiefe **8000**, einstellbar über `qwen serve --event-ring-size <n>`).
- **Gap-Erkennung:** Wenn `<n>` älter ist als das älteste noch im Ring befindliche Ereignis, emittiert der Daemon einen ID-loser `state_resync_required`-Frame, bevor das überlebende Suffix abgespielt wird. Das SDK latcht `awaitingResync`; Clients sollten `POST /session/:id/load` aufrufen und aus dem aktuellen begrenzten Replay-Snapshot-Fenster neu aufbauen. Dieser Snapshot kann selbst mit `history_truncated` beginnen, wenn ältere In-Memory-Replay-Einträge verworfen wurden; dieser Marker ist informativ und darf keine weitere Resync-Schleife starten.
- IDs sind pro Session monoton steigend, beginnend bei 1
- Synthetische Frames (`client_evicted`, `slow_client_warning`, `stream_error`) lassen absichtlich die `id` weg, damit sie keinen Sequenz-Slot für andere Subscriber verbrauchen

Backpressure:

- Die pro-Subscriber-Queue hat standardmäßig `maxQueued: 256` Live-Items plus ein daemon-eigenes Live-Serialized-Byte-Limit von 2 MiB. Replay-Frames während des Reconnects, `slow_client_warning` und `client_evicted` umgehen beide Limits.
- Überschreibe nur das Frame-Limit über `?maxQueued=N` (Bereich `[16, 2048]`) in der SSE-Anfrage. Es gibt absichtlich kein `?maxQueuedBytes`; Clients können das Daemon-Speicherbudget nicht erhöhen.
- Wenn das Live-Frame-Backlog oder das Live-Byte-Backlog eines Subscribers 75 % Füllstand überschreitet, pusht der Bus zwangsweise einen `slow_client_warning`-Synthetic-Frame an diesen Subscriber (einmal pro Überlauf-Episode; wird scharfgeschaltet, nachdem beide Werte wieder unter 37,5 % gefallen sind). Der Stream bleibt offen — die Warnung ist eine Vorwarnung, damit der Client die Queue schneller abarbeiten oder sich sauber trennen und neu verbinden kann.
- Wenn das Live-Frame-Limit überläuft, gibt der Bus `client_evicted` mit `reason: "queue_overflow"` aus. Wenn das Live-Byte-Limit überläuft, gibt er `reason: "queue_bytes_overflow"` aus. In beiden Fällen wird das Terminal-Frame zwangsgepusht und das Abonnement geschlossen.

### `POST /permission/:requestId`

Stimme über eine ausstehende `permission_request` ab. Die aktive **Mediationsrichtlinie** entscheidet, wer gewinnt:

| Richtlinie                  | Verhalten                                                                                                                                                                                                                                                 |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `first-responder` (Standard) | Jeder validierte Voter gewinnt; spätere Voter erhalten `404`. Pre-F3-Baseline.                                                                                                                                                                            |
| `designated`                | Nur der Prompt-Ursprungsclient (`originatorClientId`) entscheidet; Nicht-Ursprungsclients erhalten `403 permission_forbidden / designated_mismatch`. Fällt bei anonymen Prompts auf First-Responder zurück.                                                 |
| `consensus`                 | N von M Voter müssen zustimmen (Standard `N = floor(M/2) + 1`, überschreibbar über `policy.consensusQuorum`). Die erste Option, die `N` erreicht, gewinnt. Nicht-auflösende Stimmen erhalten `200` + `permission_partial_vote`-SSE-Frames.                   |
| `local-only`                | Nur Loopback-Voter entscheiden; Remote-Caller erhalten `403 permission_forbidden / remote_not_allowed`.                                                                                                                                                     |

Die aktive Richtlinie wird in `settings.json` unter `policy.permissionStrategy` konfiguriert und auf `/capabilities` unter `body.policy.permission` angezeigt. Pre-Flight `caps.features.permission_mediation` (mit `modes: [...]`) für den Build-unterstützten Satz.

> **F3 (#4175): Multi-Client-Berechtigungskoordination.** F3 hat die vier obigen Richtlinien hinzugefügt. Pre-F3-Daemons haben First-Responder hartcodiert; das Wire-Format bleibt Bit für Bit unverändert, wenn die konfigurierte Richtlinie `first-responder` ist. Neue Ereignisse (`permission_partial_vote`, `permission_forbidden`) sind additiv — alte SDKs sehen sie als `unrecognized_known_event` und ignorieren sie sicher.

> **Permission-Timeout (Standard 5 Minuten).** Eine `permission_request`
> bleibt ausstehend, bis: (a) ein Client hier abstimmt, (b) `POST /session/:id/cancel`
> ausgelöst wird, (c) der HTTP-Client, der den Prompt steuert, die Verbindung trennt
> (Mid-Prompt-Cancel löst ausstehende Berechtigungen als `cancelled` auf),
> (d) die Session beendet wird, (e) der Daemon herunterfährt **oder
> (f) der Session-spezifische Permission-Timeout auslöst** (`DEFAULT_PERMISSION_TIMEOUT_MS`,
> 5 Minuten). Beim Auslösen des Timeouts wird `requestPermission` des Agents
> als `{outcome: 'cancelled'}` aufgelöst, der Audit-Ring zeichnet einen
> `permission.timeout`-Eintrag auf, der Daemon-Stderr gibt einen einzeiligen
> Breadcrumb aus und der SSE-Bus verteilt das Standard-
> `permission_resolved`-Cancelled-Frame, damit Subscriber aufräumen können. Der
> Timeout ist über `BridgeOptions.permissionResponseTimeoutMs` konfigurierbar;
> Headless-Caller, die langlaufende Prompts ausführen, möchten ihn möglicherweise verlängern.

Anfrage:

```json
{
  "outcome": {
    "outcome": "selected",
    "optionId": "proceed_once"
  }
}
```

Ergebnisse:

- `{ "outcome": "selected", "optionId": "<one-of-the-options>" }` — akzeptieren / ablehnen / proceed-once / usw., je nach den vom Agent angebotenen Auswahlmöglichkeiten
- `{ "outcome": "cancelled" }` — die Anfrage verwerfen (entspricht dem, was `cancelSession` / `shutdown` intern tun)

Antwort:

- `200 {}` — deine Stimme wurde akzeptiert (aufgelöst ODER unter Consensus-Quorum erfasst)
- `403 { "code": "permission_forbidden", "reason": "designated_mismatch" | "remote_not_allowed", "requestId", "sessionId" }` — F3: Die aktive Richtlinie hat deine Stimme abgelehnt
- `404 { "error": "..." }` — die `requestId` ist unbekannt (bereits aufgelöst, hat nie existiert oder Session wurde abgebaut)
- `500 { "code": "cancel_sentinel_collision", ... }` — F3: Die `allowedOptionIds` des Agents enthält das reservierte Sentinel `'__cancelled__'`; Verstoß gegen den Agent/Daemon-Vertrag
- `501 { "code": "permission_policy_not_implemented", "policy": "<name>" }` — F3 Forward-Compat: Ein Richtlinien-Literal ist im Schema gelandet, aber sein Mediator-Branch ist noch nicht gebaut (derzeit nicht erreichbar; für zukünftige Richtlinien reserviert)

Nach einer erfolgreichen Abstimmung sieht jeder verbundene Client `permission_resolved` mit derselben `requestId` und dem gewählten `outcome`. Unter `consensus` werden bei Zwischenabstimmungen zusätzlich `permission_partial_vote`-Events verteilt, bis das Quorum erreicht ist.

### Auth-Device-Flow-Routen (Issue #4175 PR 21)

Der Daemon vermittelt einen OAuth 2.0 Device Authorization Grant (RFC 8628), sodass ein entfernter SDK-Client einen Login auslösen kann, dessen Tokens auf dem Dateisystem des **Daemons** landen – und nicht auf dem des Clients. Der Daemon pollt den IdP selbst; die einzige Aufgabe des Clients besteht darin, die Verifizierungs-URL + den User Code anzuzeigen und (optional) SSE für Abschluss-Events zu abonnieren.

Capability-Tag: `auth_device_flow` (wird immer advertised). Unterstützte Provider in
v1: `qwen-oauth`.

> [!note]
>
> Der Qwen OAuth Free Tier wurde am 15.04.2026 eingestellt. Behandle `qwen-oauth` in
> diesem Protokoll als den Legacy-v1-Provider-Identifier; neue Clients sollten
> bevorzugt einen aktuell unterstützten Auth-Provider verwenden, sofern einer verfügbar ist.

**Runtime-Lokalität.** Der Daemon öffnet niemals einen Browser – selbst wenn er dazu in der Lage wäre. Der Client entscheidet, ob er `open(verificationUri)` lokal aufruft; auf einem Headless-Pod (dem kanonischen Mode-B-Deployment) öffnet der Benutzer die URL auf einem beliebigen Gerät, auf dem er einen Browser hat. Siehe `docs/users/qwen-serve.md` für die empfohlene UX.

**Kein Token-Leakage in Events.** `auth_device_flow_started` enthält nur `{deviceFlowId, providerId, expiresAt}`. User Code und Verifizierungs-URL werden Punkt-zu-Punkt im POST-201-Body und über `GET /workspace/auth/device-flow/:id` zurückgegeben; sie werden niemals per SSE broadcastet.

**Pro-Provider-Singleton.** Ein zweiter `POST` für denselben Provider, während ein Flow noch aussteht, ist ein idempotentes Take-over – er gibt den bestehenden Eintrag mit `attached: true` zurück, anstatt eine neue IdP-Anfrage zu starten.

#### `POST /workspace/auth/device-flow`

Strict-Mutation-Gate: Erfordert ein Bearer-Token, auch bei den tokenlosen Loopback-Defaults (`401 token_required`).

Request:

```json
{ "providerId": "qwen-oauth" }
```

Response (`201` für einen neuen Start, `200` für idempotentes Take-over):

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

Errors:

- `400 unsupported_provider` — unbekannte `providerId` (Response enthält `supportedProviders`)
- `409 too_many_active_flows` — Workspace-Cap (4) erreicht; einen mit `DELETE` abbrechen
- `401 token_required` — Strict-Gate hat eine Anfrage ohne Token abgelehnt
- `502 upstream_error` — IdP hat einen unerwarteten Fehler zurückgegeben

#### `GET /workspace/auth/device-flow/:id`

Liest den aktuellen Status. Ausstehende Einträge geben `userCode/verificationUri/expiresAt/intervalMs` zurück; terminale Einträge (5-Minuten-Gnadenfrist) lassen diese weg und zeigen stattdessen `status` + optionales `errorKind/hint` an.

Gibt `404 device_flow_not_found` für unbekannte IDs und nach Ablauf der Gnadenfrist entfernte Einträge zurück.

#### `DELETE /workspace/auth/device-flow/:id`

Idempotentes Abbrechen:

- ausstehender Eintrag → `204` + `auth_device_flow_cancelled` wird emitted
- terminaler Eintrag → `204` No-op (kein erneutes Emitting des Events)
- unbekannte ID → `404`

#### `GET /workspace/auth/status`

Snapshot der ausstehenden Flows + unterstützter Provider:

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

#### Device-flow SSE-Events

Fünf typisierte Events (Workspace-scoped, werden an jeden aktiven Session-Bus verteilt):

- `auth_device_flow_started` `{deviceFlowId, providerId, expiresAt}` — POST erfolgreich; SDK sollte abonnieren (kein userCode enthalten, bei Bedarf per GET abrufen)
- `auth_device_flow_throttled` `{deviceFlowId, intervalMs}` — Daemon hat das Upstream-`slow_down` berücksichtigt; Clients, die GET pollen, sollten ihr Intervall entsprechend erhöhen
- `auth_device_flow_authorized` `{deviceFlowId, providerId, expiresAt?, accountAlias?}` — Credentials persistiert; `accountAlias` ist ein Non-PII-Label (niemals E-Mail/Telefon)
- `auth_device_flow_failed` `{deviceFlowId, errorKind, hint?}` — terminal; `errorKind` ist einer der Werte `expired_token | access_denied | invalid_grant | upstream_error | persist_failed`. `persist_failed` ist daemon-intern: Der IdP-Austausch war erfolgreich, aber der Daemon konnte die Credentials nicht dauerhaft speichern (EACCES / EROFS / ENOSPC). Der Benutzer sollte es erneut versuchen, sobald das zugrunde liegende Speicherproblem behoben ist.
- `auth_device_flow_cancelled` `{deviceFlowId}` — DELETE bei einem ausstehenden Eintrag erfolgreich

> **Nicht MCP-kompatibel.** Die MCP-Authorization-Spec (2025-06-18) erfordert OAuth 2.1 + PKCE Auth-Code mit einem Redirect-Callback, was für Headless-Pod-Daemons nicht funktioniert. Die Device-Flow-Surface von Mode B ist daemon-privat – Clients, die auf MCP-konforme Server abzielen, sollten einen anderen Auth-Pfad verwenden.

## Streaming-Wire-Format

Events werden als Standard-EventSource-Frames emittiert. Der Daemon schreibt pro Frame eine `data:`-Zeile (das JSON enthält nach `JSON.stringify` keine eingebetteten Newlines); der SDK-Parser unter `packages/sdk-typescript/src/daemon/sse.ts` verarbeitet sowohl dieses Format als auch die spezifikationskonforme Multi-`data:`-Form auf der Empfangsseite.

## Error-Frames beim Streaming

Wenn der Bridge-Iterator beim Bedienen eines SSE-Subscribers eine Exception wirft, emittiert der Daemon ein terminaleres `stream_error`-Frame (keine `id`). Die `data:`-Zeile ist die vollständige Envelope (hat dieselbe Form wie jedes andere SSE-Frame in diesem Dokument); die eigentliche Fehlermeldung befindet sich unter `envelope.data.error`:

```
event: stream_error
data: {"v":1,"type":"stream_error","data":{"error":"<message>"}}
```

Die Verbindung wird anschließend geschlossen.

## Umgebungsvariablen

| Var                 | Purpose                                                        |
| ------------------- | -------------------------------------------------------------- |
| `QWEN_SERVER_TOKEN` | Bearer-Token. Wird beim Start um führende und nachfolgende Whitespaces bereinigt. |

## Source-Layout

| Path                                                 | Purpose                                                                                                    |
| ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `packages/cli/src/commands/serve.ts`                 | yargs-Command + Flag-Schema                                                                                |
| `packages/cli/src/serve/run-qwen-serve.ts`           | Listener-Lifecycle + Signal-Handling                                                                       |
| `packages/cli/src/serve/server.ts`                   | Express-App-Assembly, Middleware-Reihenfolge und verbleibende direkte Routen                               |
| `packages/cli/src/serve/routes/*.ts`                 | Fokussierte Express-Route-Gruppen, einschließlich Session, SSE, Workspace-Auth, Workspace-Status und File-Routen |
| `packages/cli/src/serve/auth.ts`                     | Bearer + Host-Allowlist + CORS-Deny                                                                        |
| `packages/cli/src/serve/acp-session-bridge.ts`       | CLI-lokale Bridge-Kompatibilitäts-Fassade für Spawn-or-Attach, Session-FIFO und Permission-Registry        |
| `packages/acp-bridge/src/status.ts`                  | Read-only Daemon-Status-Wire-Types + `ServeErrorKind` + `BridgeTimeoutError` + `mapDomainErrorToErrorKind` |
| `packages/cli/src/serve/env-snapshot.ts`             | Pure Helper, der `/workspace/env`-Payloads aus dem `process.*`-Status erstellt, einschließlich Credential-Redaction |
| `packages/acp-bridge/src/eventBus.ts`                | Bounded Async Queue + Replay-Ring                                                                          |
| `packages/sdk-typescript/src/daemon/DaemonClient.ts` | TS-Client                                                                                                  |
| `packages/sdk-typescript/src/daemon/sse.ts`          | EventSource-Frame-Parser                                                                                   |
| `integration-tests/cli/qwen-serve-routes.test.ts`    | 18 Cases, kein LLM                                                                                         |
| `integration-tests/cli/qwen-serve-streaming.test.ts` | 3 Cases, echter `qwen --acp`-Child-Prozess, unterstützt vom lokalen Fake-OpenAI-Server (nur POSIX; wird unter Windows übersprungen) |
