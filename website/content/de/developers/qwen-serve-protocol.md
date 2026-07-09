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
Access-Control-Allow-Headers: Authorization, Content-Type, X-Qwen-Client-Id, Last-Event-ID
Access-Control-Max-Age: 86400
Access-Control-Expose-Headers: Retry-After
```

`Access-Control-Allow-Origin` gibt die Origin der Anfrage wortwörtlich wieder (Klein-/Großschreibung wie vom Browser gesendet) und nicht das Literal `*`, selbst unter dem `*`-Muster – Browser-Caches keyern Antworten darauf in Kombination mit `Vary: Origin`, und das Echo lässt Raum, um in einer späteren Version `Access-Control-Allow-Credentials` ohne Schemaänderung hinzuzufügen. `Access-Control-Expose-Headers: Retry-After` ermöglicht es Browser-WebUIs, die Retry-Hinweise des Daemons aus `429`- / `503`-Antworten zu beachten. `Access-Control-Allow-Credentials` wird heute **NICHT** gesendet: Der Daemon authentifiziert sich über Bearer-in-`Authorization`, was cross-origin ohne `credentials: 'include'` funktioniert.

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

`WorkspaceMismatchError` für ein `POST /session`, dessen `cwd` nicht zum gebundenen Workspace des Daemons kanonisiert wird (#3803 §02 – 1 Daemon = 1 Workspace), gibt `400` zurück mit:

```json
{
  "error": "Workspace mismatch: daemon is bound to \"…\" but request asked for \"…\". …",
  "code": "workspace_mismatch",
  "boundWorkspace": "/path/the/daemon/binds",
  "requestedWorkspace": "/path/in/the/request"
}
```

Verwende dies, um Fehlanpassungen vorab (pre-flight) zu erkennen: Lies `workspaceCwd` aus `/capabilities` und lass `cwd` bei `POST /session` weg (es fällt auf den gebundenen Workspace zurück), oder leite die Anfrage an einen Daemon weiter, der an `requestedWorkspace` gebunden ist.

`POST /session` jenseits der `--max-sessions`-Obergrenze des Daemons gibt `503` mit einem `Retry-After: 5`-Header zurück und:

```json
{
  "error": "Session limit reached (20)",
  "code": "session_limit_exceeded",
  "limit": 20
}
```

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
 'session_close', 'session_metadata', 'session_organization',
 'session_archive', 'mcp_guardrails',
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

> Bedingte Tags erscheinen nur, wenn der entsprechende Deployment-Toggle aktiviert ist (siehe Tabelle unten). Das `permission_mediation`-Tag von F3 ist immer aktiv und enthält `modes: ['first-responder', 'designated', 'consensus', 'local-only']`, sodass SDK-Clients die vom Build unterstützte Menge introspektieren können; die zur Laufzeit aktive Strategie befindet sich unter `body.policy.permission`.
`session_scope_override` ist der Negotiation-Handle für das anfragebezogene `sessionScope`-Feld bei `POST /session` (siehe unten). Ältere Daemons ignorieren dieses Feld stillschweigend, daher sollten SDK-Clients `caps.features` vor dem Senden auf dieses Tag prüfen.

`session_load` und `session_resume` bewerben die Explicit-Restore-Routen (`POST /session/:id/load` und `POST /session/:id/resume`). Ältere Daemons geben für diese Pfade `404` zurück, daher sollten SDK-Clients `caps.features` vor dem Aufruf prüfen. `unstable_session_resume` wird weiterhin als veraltetes Alias für die Kompatibilität mit SDKs beworben, die ausgeliefert wurden, als die zugrunde liegende ACP-Methode noch `connection.unstable_resumeSession` hieß; neue Clients sollten auf `session_resume` prüfen.

`slow_client_warning` deckt das SSE-Backpressure-Verhalten ab: (a) Der Daemon emittiert einen synthetischen `slow_client_warning`-Event-Stream-Frame, wenn der Live-Frame-Backlog oder der Live-Serialized-Byte-Backlog eines Subscribers 75 % Kapazität überschreitet, einmal pro Überlauf-Episode (wird wieder aktiviert, nachdem beide Messwerte unter 37,5 % abgefallen sind); (b) `GET /session/:id/events` akzeptiert einen `?maxQueued=N`-Query-Parameter (Bereich `[16, 2048]`), um den subscriberbezogenen Frame-Backlog für Cold-Reconnects gegen einen großen Replay-Ring vorzudimensionieren. Das Serialized-Byte-Limit liegt in der Verantwortung des Daemons (Standard **2 MiB** pro Subscriber), ist nur für Live-Daten gedacht und hat absichtlich keinen Query-Parameter. Die Daemon-weite Ringgröße wird durch `--event-ring-size` gesteuert (Standard **8000**, gemäß #3803 §02). Ältere Daemons unterstützen das Warnungs-/Query-Verhalten nicht und ignorieren es stillschweigend – prüfe dieses Tag vor der Aktivierung.

`typed_event_schema` bewirbt Daemon-Event-Payloads, die dem `KnownDaemonEvent`-Schema des SDK entsprechen. Ältere Daemons streamen möglicherweise weiterhin kompatible Frames, aber SDK-Clients sollten dieses Tag prüfen, bevor sie von einer Typed-Event-Abdeckung ausgehen.

`client_heartbeat` bewirbt `POST /session/:id/heartbeat`. Ältere Daemons geben `404` zurück; prüfe dieses Tag, bevor du periodische Heartbeats sendest.

`session_close` und `session_metadata` bewerben `DELETE /session/:id` und `PATCH /session/:id/metadata`. Ältere Daemons geben `404` zurück; prüfe diese Tags, bevor du Close- oder Rename-Funktionen bereitstellst.

`session_organization` bewirbt benutzerdefinierte Session-Gruppen und Pinning. Es fügt `GET/POST/PATCH/DELETE /workspace/:id/session-groups`, `PATCH /session/:id/organization` und die optionale organisierte Listenansicht `GET /workspace/:id/sessions?view=organized` hinzu. Ältere Daemons geben für die Mutations-/Gruppenrouten `404` zurück und ignorieren den Contract der organisierten Ansicht. WebShell-/SDK-Clients müssen dieses Tag daher prüfen, bevor sie eine Gruppierungs- oder Pinning-UI anzeigen.

`session_archive` bewirbt die v1 Directory-State-Archive-API: `POST /sessions/archive`, `POST /sessions/unarchive` und `GET /workspace/:id/sessions?archiveState=active|archived`. Archivierte Sessions können erst wieder geladen oder fortgesetzt werden, wenn sie dearchiviert (unarchived) sind.

`session_lsp` bewirbt `GET /session/:id/lsp`, den schreibgeschützten strukturierten LSP-Status-Snapshot für Daemon-Clients. Ältere Daemons geben `404` zurück; prüfe dieses Tag, bevor du den Remote-LSP-Status bereitstellst.

`session_status` bewirbt `GET /session/:id/status`, die Live-Bridge-Zusammenfassung für eine einzelne Session anhand der ID (`clientCount` / `hasActivePrompt` und die Kernfelder). Ältere Daemons geben `404` zurück; prüfe dieses Tag, bevor du den Status einer einzelnen Session abfragst, anstatt die gesamte Session-Liste zu scannen.

`session_approval_mode_control`, `workspace_tool_toggle`, `workspace_init` und `workspace_mcp_restart` (Issue [#4175](https://github.com/QwenLM/qwen-code/issues/4175) PR 17) bewerben die vier Mutations-Control-Routen, die unten unter "Mutation: approval, tools, init, MCP restart" dokumentiert sind. Alle vier sind streng durch das PR-15-Mutations-Gate geschützt (ein Daemon, der ohne Bearer-Token konfiguriert ist, weist sie mit 401 `token_required` ab). Ältere Daemons geben `404` zurück; prüfe jedes Tag, bevor du die entsprechende Funktion bereitstellst.

`mcp_guardrails` (Issue [#4175](https://github.com/QwenLM/qwen-code/issues/4175) PR 14) deckt die MCP-Budget-Oberfläche ab: die Felder `clientCount` / `clientBudget` / `budgetMode` / `budgets[]` bei `GET /workspace/mcp`, das Feld `disabledReason` in den Server-Zellen und die CLI-Flags `--mcp-client-budget` / `--mcp-budget-mode`. Ältere Daemons lassen die neuen Felder vollständig weg; SDK-Clients sollten dieses Tag prüfen, bevor sie sich auf die `budgets[]`-Semantik verlassen. Der Registry-Descriptor enthält außerdem `modes: ['warn', 'enforce']` für die zukünftige Bereitstellung von Feature-Modi – vorerst leiten Clients den Modus aus dem Feld `budgetMode` des Snapshots ab. Server-Ablehnungen im `enforce`-Modus sind deterministisch nach der Deklarationsreihenfolge von `Object.entries(mcpServers)`; eine zukünftige Scope-Precedence-Schicht (falls Qwen Code eine einführt) würde dies auf "niedrigste Priorität zuerst" umstellen, um die Konvention `plugin < user < project < local` von claude-code zu spiegeln.

> ⚠️ **PR 14 v1 Scope: pro Session, nicht pro Workspace.** Jede ACP-Session innerhalb des Daemons konstruiert ihre eigene `Config` + `McpClientManager` (über `acpAgent.newSessionConfig`). Die Budgets begrenzen die Live-MCP-Clients **pro Session**; jede Session liest `QWEN_SERVE_MCP_CLIENT_BUDGET` unabhängig aus der weitergeleiteten Umgebung. Bei `--mcp-client-budget=10` und 5 gleichzeitigen ACP-Sessions kann die tatsächliche Anzahl der Live-MCP-Clients daemonweit 5 × 10 = 50 erreichen. Der Snapshot von `GET /workspace/mcp` liest nur die Abrechnung der **Bootstrap-Session** `McpClientManager` aus – der Wert `budgets[0].scope: 'session'` ist das zuverlässige Signal, dass dies pro Session und nicht aggregiert erfolgt. **Wave 5 PR 23 (Shared MCP Pool)** wird einen Workspace-scoped Manager einführen und eine `scope: 'workspace'`-Zelle neben der pro-Session-Zelle hinzufügen, um eine echte sessionsübergreifende Aggregation zu ermöglichen. v1 ist das In-Process-Counter- und Soft-Enforcement-Fundament, auf dem PR 23 aufbaut.

`workspace_file_read` deckt die Text/List/Stat/Glob-Workspace-File-Routen ab
(`GET /file`, `GET /list`, `GET /glob`, `GET /stat`). `workspace_file_bytes`
deckt `GET /file/bytes` ab, das später hinzugefügt wurde, damit Clients die Unterstützung
für rohe Byte-Fenster gegen Daemons aus der PR19-Ära prüfen können. `workspace_file_write` deckt
die Hash-bewussten Textmutationsrouten ab (`POST /file/write`, `POST /file/edit`).
Das Write-Tag bedeutet, dass der Routen-Contract existiert; es bedeutet nicht, dass die aktuelle
Bereitstellung für anonyme Mutationen offen ist. Write/Edit sind strikte Mutationsrouten
und erfordern auch auf Loopback einen konfigurierten Bearer-Token.

`daemon_status` bewirbt `GET /daemon/status`, den konsolidierten schreibgeschützten
Operator-Diagnose-Snapshot, der unten dokumentiert ist.

**Bedingte Tags.** Eine kleine Anzahl von Feature-Tags wird nur beworben, wenn der entsprechende Bereitstellungs-Toggle aktiviert ist. Vorhandensein des Tags = Verhalten ist aktiviert; Fehlen = entweder ein älterer Daemon, der älter als das Tag ist, ODER ein aktueller Daemon, bei dem der Operator sich nicht dafür entschieden hat. Aktuell:

| Tag                        | Beworben, wenn …                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `require_auth`             | der Daemon mit `--require-auth` (oder `requireAuth: true` über die eingebettete API) gestartet wurde. Der Bearer-Token ist auf jeder Route zwingend erforderlich, einschließlich `/health` bei Loopback-Binds.                                                                                                                                                                                                                                                                                                                                    |
| `mcp_workspace_pool`       | der gemeinsame MCP-Transport-Pool aktiv ist. Wird weggelassen, wenn `QWEN_SERVE_NO_MCP_POOL=1` den Pool deaktiviert.                                                                                                                                                                                                                                                                                                                                                                                                             |
| `mcp_pool_restart`         | der gemeinsame MCP-Transport-Pool aktiv ist; Restart-Antworten können Pool-bewusste Multi-Entry-Formen enthalten.                                                                                                                                                                                                                                                                                                                                                                                                           |
| `allow_origin`             | T2.4 ([#4514](https://github.com/QwenLM/qwen-code/issues/4514)). Der Daemon wurde mit mindestens einem `--allow-origin <pattern>` (oder `allowOrigins: [...]` über die eingebettete API) gestartet. Cross-Origin-Anfragen von übereinstimmenden Origins erhalten die entsprechenden CORS-Antwortheader; nicht übereinstimmende Origins erhalten weiterhin den Standard-403-Fehler. Die konfigurierte Pattern-Liste wird absichtlich NICHT in `/capabilities` ausgegeben, um zu verhindern, dass das Trusted-Origin-Set an unauthentifizierte Leser weitergegeben wird – die Browser-WebUI kennt ihre eigene Origin bereits. |
| `prompt_absolute_deadline` | `--prompt-deadline-ms` / `QWEN_SERVE_PROMPT_DEADLINE_MS` / `ServeOptions.promptDeadlineMs` auf eine positive Ganzzahl gesetzt ist.                                                                                                                                                                                                                                                                                                                                                                                        |
| `writer_idle_timeout`      | `--writer-idle-timeout-ms` / `QWEN_SERVE_WRITER_IDLE_TIMEOUT_MS` / `ServeOptions.writerIdleTimeoutMs` auf eine positive Ganzzahl gesetzt ist.                                                                                                                                                                                                                                                                                                                                                                             |
| `workspace_settings`       | der Daemon mit verfügbarer Settings-Persistenz erstellt wurde.                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `session_shell_command`    | die Session-Shell-Ausführung explizit aktiviert ist.                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `rate_limit`               | `--rate-limit` / `QWEN_SERVE_RATE_LIMIT=1` / `ServeOptions.rateLimit` aktiviert ist.                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `workspace_reload`         | Workspace-Reload-Unterstützung in der eingebetteten Routenkonfiguration verfügbar ist.                                                                                                                                                                                                                                                                                                                                                                                                                                      |
`mcp_guardrails` steht **nicht** in dieser bedingten Tabelle – es ist ein immer aktives Tag, das immer dann beworben wird, wenn die Binärdatei die neuen `/workspace/mcp` Budget-Felder unterstützt, unabhängig davon, ob der Operator ein Budget konfiguriert hat. Operatoren, die `--mcp-client-budget` nicht gesetzt haben, erhalten trotzdem die neuen Felder (mit `budgetMode: 'off'`, `budgets: []`).

`mcp_guardrail_events` (Issue [#4175](https://github.com/QwenLM/qwen-code/issues/4175) PR 14b) bewirbt die typisierten SSE-Push-Events, die Überschreitungen des MCP-Budgetstatus ohne Polling-Loop sichtbar machen. Zwei Frame-Typen werden auf `GET /session/:id/events` empfangen:

- `mcp_budget_warning` — wird einmalig beim Überschreiten der 75%-Marke von `reservedSlots.size / clientBudget` nach oben ausgelöst. Wird erst wieder scharfgeschaltet, wenn das Verhältnis unter 37,5 % fällt (`MCP_BUDGET_REARM_FRACTION`). Spiegelt die Hysterese von `slow_client_warning` aus PR 10 wider, jedoch auf Manager-Ebene und nicht auf der Backlog-Ebene pro Subscriber. Payload: `{ liveCount, reservedCount, budget, thresholdRatio: 0.75, mode: 'warn' | 'enforce' }`. Wird in den Modi `warn` und `enforce` ausgelöst; niemals in `off`.
- `mcp_child_refused_batch` — wird am Ende jedes `discoverAllMcpTools*`-Durchlaufs ausgelöst, wenn einer oder mehrere Server abgelehnt wurden, UND als Batch der Länge 1 auf dem `readResource`-Pfad für Lazy-Spawn-Ablehnungen. Payload: `{ refusedServers: [{ name, transport, reason: 'budget_exhausted' }, ...], budget, liveCount, reservedCount, mode: 'enforce' }`. `mode` ist wörtlich `'enforce'`, da der `warn`-Modus niemals ablehnt.

Beide Events leben im SSE-Replay-Ring pro Session (sie tragen eine `id`), sodass ein Client, der sich mit `Last-Event-ID` reconnectet, durch sie hindurch fortsetzt; der Snapshot unter `GET /workspace/mcp` bleibt die Single Source of Truth für den Zustand nach einer längeren Unterbrechung. Einmal beworben, immer aktiv – es gibt keinen bedingten Toggle. Der SDK-Reducer-State (`DaemonSessionViewState`) stellt `mcpBudgetWarningCount`, `lastMcpBudgetWarning`, `mcpChildRefusedBatchCount` und `lastMcpChildRefusedBatch` für Adapter bereit, die eine einfache Lag-ähnliche UI wünschen.

## Routes

### `GET /health`

Liveness Probe. Die Standardform gibt `200 {"status":"ok"}` zurück, wenn der Listener aktiv ist – ressourcenschonend, kein Bridge-Zugriff, geeignet für hochfrequente Liveness Probes in k8s/Compose.

Übergib `?deep=1` (akzeptiert auch `?deep=true` oder einfach `?deep`) für eine Probe, die Bridge-**Zähler** offenlegt (nur informativ, keine echte Liveness-Prüfung):

```json
{ "status": "ok", "sessions": 3, "pendingPermissions": 1 }
```

> ⚠️ Die Deep Probe ist **informativ**, keine echte Liveness-Verifizierung. Sie liest Zähler-Accessoren (`bridge.sessionCount`, `bridge.pendingPermissionCount`), die einfache Map-Size-Getter sind; sie pingen keine einzelnen Child-Prozesse / Channels und erkennen daher keine blockierte, aber dennoch gezählte Session. Nutze sie für Capacity-Dashboards (aktuelle Parallelität vs. `--max-sessions`, Queue-Tiefe) und nicht als Auslöser für "nimm diesen Daemon aus der Rotation". Eine `503 {"status":"degraded"}`-Antwort ist theoretisch möglich, wenn die Getter einer benutzerdefinierten Bridge-Implementierung einen Fehler werfen, aber die Getter der echten Bridge tun dies niemals – im normalen Betrieb gibt die Deep Probe immer 200 zurück. Verlasse dich für echte Liveness darauf, ob der Listener überhaupt eine TCP-Verbindung akzeptiert (d. h. das Standard-`/health` ohne `?deep`).

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
`lastHeartbeatAt` und `staleHeartbeatAt`. `restartCount` ist die über die Lebensdauer
Gesamtzahl der Neustartversuche, die von diesem Serve-Prozess unternommen wurden; ein laufender Worker mit
`restartCount > 0` ist gesund, sofern kein anderes Issue vorliegt. Ein laufender Worker,
dessen `requestedChannels` Namen enthalten, die in `channels` fehlen, meldet
`channel_worker_partial_connect`.

`qwen channel status` liest weiterhin Pidfile-Metadaten. Während eines Neustart-
Fensters bleibt das Serve-eigene Pidfile reserviert, aber `workerPid` wird weggelassen, damit
Clients keinen veralteten Worker-Prozess anzeigen. Worker-stdout/stderr werden
in das Daemon-Log weitergeleitet, wobei Bearer-Tokens, sensible Worker-Umgebungs-
Werte und Proxy-URL-Credentials geschwärzt werden.

Sicherheit: Die Response enthält niemals Bearer-Tokens, Client-IDs, vollständige ACP-
Connection-IDs, Device-Flow-User-Codes oder Verifizierungs-URLs. `summary` lässt
den Daemon-Log-Pfad weg; `full` kann ihn für authentifizierte Operatoren enthalten.

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

Stabiler Contract: Wenn `v` erhöht wird, hat sich das Frame-Layout auf eine abwärtsinkompatible Weise geändert.

> **`protocolVersions`** beschreibt die Serve-Protokollversionen, die der Daemon sprechen kann. `current` ist die bevorzugte Protokollversion des Daemons und `supported` ist die kompatible Menge. Clients, die ein bestimmtes Protokoll benötigen, sollten `supported` prüfen; feature-spezifische UIs sollten weiterhin auf `features` prüfen. Additiv zu v=1: Ältere v=1-Daemons lassen dieses Feld weg, daher sollten SDK-Clients, die auf ältere Builds abzielen, es als optional behandeln.

> **`modelServices` ist in Stage 1 immer `[]`.** Der Agent nutzt seinen einzelnen Standard-Model-Service und zählt ihn nicht über das Wire auf. Stage 2 wird dies aus registrierten Model-Adaptern befüllen, damit SDK-Clients Service-Picker bauen können; verlasse dich bis dahin NICHT darauf, dass dieses Feld nicht leer ist.

> **`workspaceCwd`** ist der kanonische absolute Pfad, an den dieser Daemon bindet (#3803 §02 — 1 Daemon = 1 Workspace). Nutze ihn, um (a) Fehlanpassungen vor dem Posten von `/session` zu erkennen und (b) `cwd` bei `POST /session` wegzulassen (die Route fällt auf diesen Pfad zurück). Multi-Workspace-Deployments stellen mehrere Daemons auf verschiedenen Ports bereit, jeder mit seinem eigenen `workspaceCwd`. Additiv zu v=1: Pre-§02 v=1-Daemons lassen das Feld weg – Clients, die auf ältere Builds abzielen, sollten einen Null-Check durchführen, bevor sie es konsumieren.

### Read-only Runtime-Status-Routen

Diese Routen melden Daemon-seitige Runtime-Snapshots. Es sind additive v1-Routen,
die den Zustand nicht verändern und die Serve-Protokollversion nicht ändern. Workspace-
Status-Routen starten absichtlich **nicht** den ACP-Child-Prozess, nur weil
ein Client eine GET-Route pollt: Wenn der Daemon im Leerlauf ist, geben sie
`initialized: false` mit einem leeren Snapshot zurück. Session-Status-Routen erfordern eine
Live-Session und nutzen die Standard-`404 SessionNotFoundError`-Form für unbekannte
IDs.

Capability-Tags:
- `workspace_mcp` → `GET /workspace/mcp`
- `workspace_skills` → `GET /workspace/skills`
- `workspace_providers` → `GET /workspace/providers`
- `workspace_env` → `GET /workspace/env`
- `workspace_preflight` → `GET /workspace/preflight`
- `session_context` → `GET /session/:id/context`
- `session_supported_commands` → `GET /session/:id/supported-commands`
- `session_tasks` → `GET /session/:id/tasks`
- `session_status` → `GET /session/:id/status`

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

**MCP-Client-Guardrails (Issue [#4175](https://github.com/QwenLM/qwen-code/issues/4175) PR 14).** Post-PR-14-Daemons erweitern die Payload um vier additive Felder und eine Zelle auf Workspace-Ebene:

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

`budgetMode` ist entweder `enforce`, `warn` oder `off`. `clientBudget` fehlt, wenn kein Budget festgelegt wurde. `budgets[]` ist bei Post-PR-14-Daemons **immer ein Array** (möglicherweise leer, wenn `budgetMode === 'off'`); Pre-PR-14-Daemons lassen das Feld komplett weg. v1 gibt eine Zelle mit `scope: 'session'` aus (Durchsetzung pro Session – siehe den Abschnitt "Capabilities" oben für die Begründung). Consumer MÜSSEN zusätzliche `budgets[]`-Einträge mit nicht erkannten `scope`-Werten tolerieren – Wave 5 PR 23 wird `scope: 'workspace'` (oder `'pool'`) neben der Session-Zelle hinzufügen, ohne das Schema zu ändern.

`disabledReason` in den Server-Zellen unterscheidet zwischen vom Operator deaktiviert (`'config'` – `disabledMcpServers`-Konfigurationsliste) und wegen Budget abgelehnt (`'budget'` – entdeckt, aber aufgrund des `enforce`-Modus nie verbunden). Ablehnungen sind deterministisch nach der Deklarationsreihenfolge von `Object.entries(mcpServers)`. Der serverbezogene `status: 'error', errorKind: 'budget_exhausted'` überlagert den rohen `mcpStatus: 'disconnected'` (was zwar zutrifft, aber nicht der für den Operator relevante Schweregrad ist).

Die Budget-Durchsetzung in PR 14 v1 erfolgt **pro Session, nicht pro Workspace**. Obwohl Mode-B-Daemons post-#4113 auf Prozessebene `1 Daemon = 1 Workspace × N Sessions` sind, wird der `McpClientManager` innerhalb der `Config` jeder ACP-Session über `acpAgent.newSessionConfig` konstruiert, sodass N Sessions jeweils ihre eigene Kopie des Limits durchsetzen. Der Snapshot repräsentiert die Sicht der Bootstrap-Session. Wave 5 PR 23 führt einen Workspace-weiten, gemeinsamen MCP-Pool ein, der dies zu einer echten Workspace-weiten Durchsetzung weiterentwickelt.

**Erkennen von Budget-Druck.** Zwei Oberflächen, beide nach PR-14b befüllt:

- **Push-Events** (beworben über `mcp_guardrail_events`): abonniere `GET /session/:id/events` und filtere `mcp_budget_warning` / `mcp_child_refused_batch`-Frames über `KnownDaemonEvent`. Die State Machine feuert einmal pro Überschreitung der 75%-Marke nach oben (wird unter 37,5 % erneut scharf geschaltet); Ablehnungen werden im `enforce`-Modus einmal pro Discovery-Durchlauf zusammengefasst.
- **Snapshot-Poll** (beworben über `mcp_guardrails`): `GET /workspace/mcp` aufrufen und die Budget-Zelle pro Session inspizieren (`budgets[0]`):

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
      "argumentHint": "[path]"
    }
  ]
}
```

`level` ist entweder `project`, `user`, `extension` oder `bundled`. `errors` wird
weggelassen, wenn die Discovery erfolgreich ist.

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

Alle Dateipfade werden über den gebundenen Workspace des Daemons aufgelöst. Antworten verwenden
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

Liest eine Textdatei. Query-Parameter: `path` (erforderlich), `maxBytes`, `line` und
`limit`. Der Daemon lehnt Binärdateien und Dateien ab, die das Text-Lese-Limit überschreiten.
Die Antwort enthält `hash`, einen SHA-256-Digest über die rohen On-Disk-Bytes der gesamten Datei,
auch wenn `line`, `limit` oder `maxBytes` nur einen Ausschnitt zurückgegeben haben.

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
| `cwd`            | nein       | Absoluter Pfad, der dem gebundenen Workspace des Daemons entspricht. Wenn weggelassen, fällt die Route auf `boundWorkspace` zurück (über `/capabilities.workspaceCwd` auslesen). Ein nicht übereinstimmendes, nicht leeres `cwd` gibt `400 workspace_mismatch` zurück (#3803 §02 — 1 Daemon = 1 Workspace). Workspace-Pfade werden über `realpathSync.native` kanonisiert (mit einem Resolve-only-Fallback für nicht existierende Pfade), damit Case-insensitive Dateisysteme Sessions nicht aufgrund der Schreibweise ablehnen.                                                                                                                                                                          |
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

| Feld | Erforderlich | Hinweise                                                                                                                                                                                                                         |
| ---- | ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `cwd` | nein       | Dieselben Kanonisierungs- und `workspace_mismatch`-Regeln wie bei `POST /session`. Weglassen, um `/capabilities.workspaceCwd` zu erben. `mcpServers` wird hier absichtlich NICHT akzeptiert — daemon-weites MCP wird über Einstellungen gesteuert (entspricht `POST /session`). |

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

**Historien-Replay über SSE.** Während `loadSession` auf der Agentenseite in-flight ist, emittiert der Agent `session_update`-Benachrichtigungen für jeden persistierten Turn. Der Daemon puffert sie auf dem Event-Bus der Session, bevor die Route-Antwort zurückkehrt, sodass Subscriber, die sofort `GET /session/:id/events` mit `Last-Event-ID: 0` aufrufen, das vollständige Replay sehen. **Der Replay-Ring ist begrenzt** (Standard: 8000 Frames pro Session). Lange Historien mit vielen Tool-Call- / Thought-Stream-Turns können dieses Limit überschreiten — die ältesten Frames werden stillschweigend verworfen. Clients, die die vollständige Historie benötigen, sollten sich sofort nach der Rückkehr von `load` subscriben; alternativ können sie die SSE-Event-IDs persistieren und `Last-Event-ID` verwenden, um an einer späteren Turn-Grenze fortzufahren.

**Fehler:**

- `404` — Persistierte Session-ID existiert nicht (`SessionNotFoundError`).
- `400` — `workspace_mismatch` (gleiche Form wie bei `POST /session`).
- `503` — `session_limit_exceeded` (zählt auf `--max-sessions` an; In-Flight-Restores werden ebenfalls berücksichtigt).
- `409` — `restore_in_progress` (ein `session/resume` für dieselbe ID ist bereits in-flight). `Retry-After: 5`. Gleichartige Race-Conditions (zwei gleichzeitige `session/load` für dieselbe ID) werden zusammengeführt — genau eines gibt `attached: false` zurück, die anderen geben `attached: true` mit demselben `state` zurück.
- `409` — `session_archived`, wenn die ID nur unter `chats/archive/` existiert; rufe `POST /sessions/unarchive` vor `load` oder `resume` auf.
- `409` — `session_archiving`, wenn Archive oder Unarchive für dieselbe ID in-flight ist. `Retry-After: 5`.
- `409` — `session_conflict`, wenn die ID sowohl in `chats/` als auch in `chats/archive/` existiert; lösche die Session mit `POST /sessions/delete` vor dem Laden.

### `POST /session/:id/resume`

Stellt eine persistierte ACP-Session anhand der ID wieder her, OHNE die Historie über SSE abzuspielen. Der Modellkontext wird intern auf der Agentenseite wiederhergestellt (über `geminiClient.initialize`, das `config.getResumedSessionData` liest); der SSE-Stream bleibt sauber für Clients, die die Historie bereits gerendert haben. Pre-flight `caps.features.session_resume`; `unstable_session_resume` bleibt ein deprecated Kompatibilitäts-Alias für ältere Clients.

Gleiche Request-Form wie bei `/load`. Gleiche Response-Form — `state` spiegelt ACPs `ResumeSessionResponse` wider. Gleiches Error-Envelope, einschließlich `409 restore_in_progress` (wird ausgelöst, wenn ein `session/load` in-flight ist; `session/resume`, das einem anderen `session/resume` hinterherrennt, wird zusammengeführt).

Verwende `/load`, wenn der Client keine Historie gerendert hat (Cold Reconnect, Picker → Open). Verwende `/resume`, wenn der Client die Turns bereits auf dem Bildschirm hat und nur das daemon-seitige Handle zurückbenötigt.

> ⚠️ **Warum wird `unstable_session_resume` noch immer advertised?** Die HTTP-Route des Daemons und die `session_resume`-Capability sind stabil für v1, aber die Bridge ruft weiterhin ACPs `connection.unstable_resumeSession` auf. Der alte Tag bleibt nur erhalten, damit SDKs, die vor `session_resume` ausgeliefert wurden, weiterhin funktionieren.

### `GET /workspace/:id/sessions`

Listet persistierte Sessions auf, deren kanonischer Workspace mit `:id` übereinstimmt (URL-kodiertes absolutes cwd). Die Standardliste enthält aktive Sessions aus `chats/`; übergib `archiveState=archived`, um archivierte Sessions aus `chats/archive/` aufzulisten. `archiveState=all` wird in v1 nicht unterstützt. Die Standard-Response und die numerische `cursor`-Semantik werden durch `session_organization` nicht verändert.

```bash
curl http://127.0.0.1:4170/workspace/$(jq -rn --arg c "$PWD" '$c|@uri')/sessions
curl http://127.0.0.1:4170/workspace/$(jq -rn --arg c "$PWD" '$c|@uri')/sessions?archiveState=archived
```

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

Aktive Listen enthalten Live-Daemon-Overlay-Felder wie `clientCount` und `hasActivePrompt`. Archivierte Listen sind rein speicherbasiert: `isArchived` ist `true` und Live-Overlay-Felder fehlen oder sind false. Leeres Array (nicht 404), wenn keine Sessions existieren — eine Session-Picker-UI sollte keinen Fehler werfen, nur weil der Workspace inaktiv ist.

### `GET /workspace/:id/session-groups`

Listet benutzerdefinierte Session-Gruppen für einen Workspace auf. Pre-flight `caps.features.includes('session_organization')`.

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

### `POST /session/:id/prompt`

Leitet einen Prompt an den Agenten weiter. Multi-Prompt-Caller werden pro Session in einer FIFO-Warteschlange gereiht (ACP garantiert einen aktiven Prompt pro Session).

Request:

```json
{
  "prompt": [{ "type": "text", "text": "What does src/main.ts do?" }]
}
```

Validierung: `prompt` muss ein nicht leeres Array von Objekten sein. Andere Fehler geben `400` zurück, bevor die Bridge erreicht wird.

Response:

```json
{ "stopReason": "end_turn" }
```

Weitere Stop-Reasons: `cancelled`, `max_tokens`, `error`, `length` (gemäß ACP-Spezifikation).

Wenn der HTTP-Client mitten im Prompt die Verbindung trennt, sendet der Daemon eine ACP-`cancel`-Benachrichtigung an den Agenten, wodurch der Prompt mit `stopReason: "cancelled"` beendet wird.

> **Stage 1 Einschränkung — kein serverseitiger Prompt-Timeout.** Die Bridge setzt nur das `prompt()` des Agenten gegen `transportClosedReject` (wenn der Agent-Child-Prozess crasht) und das HTTP-Disconnect-AbortSignal des Callers. Ein blockierter, aber lebender Agent (z. B. ein hängender Model-Call) blockiert die FIFO-Warteschlange pro Session, bis der HTTP-Client auf seiner Seite einen Timeout erreicht und die Verbindung trennt. Langlaufende Prompts sind legitim (Deep Research, Analyse großer Codebasen), daher wird absichtlich kein Standard-Deadline gesetzt; Stage 2 wird ein konfigurierbares `promptTimeoutMs`-Opt-in bereitstellen. Bis dahin sollten Caller ihre eigenen clientseitigen Timeouts einstellen und bei Ablauf die Verbindung trennen (oder `POST /session/:id/cancel` aufrufen).

### `POST /session/:id/cancel`

Bricht den **aktuell aktiven** Prompt der Session ab. ACP-seitig ist dies eine Benachrichtigung, kein Request — der Agent bestätigt dies, indem er das aktive `prompt()` mit `cancelled` auflöst.

```bash
curl -X POST http://127.0.0.1:4170/session/$SID/cancel
# → 204 No Content
```

> **Multi-Prompt-Vertrag:** Cancel betrifft nur den aktiven Prompt. Alle Prompts, die derselbe Client zuvor gepostet hat und die noch hinter dem aktiven in der Warteschlange stehen, werden weiterhin ausgeführt. Multi-Prompt-Queueing ist ein vom Daemon eingeführtes Verhalten (nicht in der ACP-Spezifikation); der Vertrag für Prompts in der Warteschlange lautet: "sie laufen weiter, es sei denn, du brichst sie einzeln ab oder beendest die Session über den Channel-Exit".

Wenn Prompts in der Warteschlange in einem Multi-Client-Deployment unerwartet sind, stelle zunächst sicher, ob die Caller eine Standard-Session mit `sessionScope: "single"` teilen. Für unabhängige Unterhaltungen pro Thread erstelle Sessions mit `sessionScope: "thread"`, sodass Prompts nur innerhalb dieses Threads serialisiert werden.

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

### `PATCH /session/:id/organization`

Aktualisiert den lokalen Session-Organisationszustand. Striktes Mutation-Gate. Pre-flight `caps.features.includes('session_organization')`.

Request:

```json
{ "isPinned": true, "groupId": "018f..." }
```

| Field      | Required | Notes                                                                                                |
| ---------- | -------- | ---------------------------------------------------------------------------------------------------- |
| `isPinned` | nein     | Boolean. `true` setzt `pinnedAt`, wenn es noch nicht gepinnt war; `false` löscht `pinnedAt`.         |
| `groupId`  | nein     | Benutzerdefinierte Gruppen-ID oder `null` für nicht gruppiert. Unbekannte Gruppen-IDs geben `404 { code: "group_not_found" }` zurück. |

Response:

```json
{
  "sessionId": "<uuid>",
  "groupId": "018f...",
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

### Mutation: approval, tools, init, MCP restart
Issue [#4175](https://github.com/QwenLM/qwen-code/issues/4175) Wave 4 PR 17 fügt vier Routen zur Mutationskontrolle hinzu, mit denen Remote-Clients das Laufzeitverhalten ändern können, ohne die CLI des Daemon-Hosts zu verwenden. Alle vier:

- Werden durch das **strict** Mutation-Gate aus PR 15 abgesichert. Ein Daemon, der ohne Bearer Token konfiguriert ist, lehnt sie mit `401 {code: 'token_required'}` ab. Konfiguriere `--token` (oder `QWEN_SERVER_TOKEN`), bevor du diese Routen aktivierst.
- Akzeptieren den `X-Qwen-Client-Id`-Header (PR 7 Audit-Chain). Wenn der Header eine vertrauenswürdige ID enthält, emittiert der Daemon `originatorClientId` im entsprechenden SSE-Event, damit Cross-Client-UIs Echos eigener Mutationen unterdrücken können.
- Prüfen jede Per-Tag-Capability im Pre-Flight, bevor die Affordance verfügbar gemacht wird. Ältere Daemons geben für die Route `404` zurück.

Drei der vier Routen (`tools/:name/enable`, `init`, `mcp/:server/restart`) emittieren **Workspace-scoped** Events: Jeder aktive Session-SSE-Bus empfängt das Event, unabhängig davon, welche Session angehängt war, als die Mutation ausgelöst wurde. `approval-mode` emittiert ein **Session-scoped** Event, da die Änderung lokal auf die `Config` einer einzelnen Session beschränkt ist.

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
```

Query-Params:

| Param       | Required | Notes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ----------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `maxQueued` | nein       | Obergrenze für den **Live-Frame-Backlog** pro Subscriber. Bereich `[16, 2048]`, Standard 256. Replay-Frames, die beim Abonnieren forciert gepusht werden, sind von den Frame- und Byte-Obergrenzen ausgenommen; was sie tatsächlich verbraucht, sind Live-Events, die eintreffen, während der Subscriber noch einen großen `Last-Event-ID: 0`-Replay abarbeitet. Erhöhe diesen Wert für Cold-Reconnects, damit der Live-Tail nicht die Slow-Client-Warnung / Eviction auslöst, bevor der Consumer aufgeholt hat. Die Obergrenze für serialisierte Live-Bytes ist daemonseitig fest (Standard 2 MiB) und hat keinen Query-Parameter. Werte außerhalb des Bereichs / nicht-dezimal / vorhanden aber leer geben `400 invalid_max_queued` zurück, bevor der SSE-Handshake geöffnet wird. Pre-Flight `caps.features.slow_client_warning` – alte Daemons ignorieren den Parameter stillschweigend. |

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

- Sende `Last-Event-ID: <n>`, um Ereignisse mit `id > n` aus dem Session-Ring abzuspielen (Standardtiefe **8000**, einstellbar über `qwen serve --event-ring-size <n>`)
- **Gap-Erkennung (clientseitig):** Wenn `<n>` älter ist als das älteste noch im Ring befindliche Ereignis (z. B. du verbindest mit `Last-Event-ID: 50` neu, aber der Ring enthält jetzt 200–1199), spielt der Daemon ab dem ältesten verfügbaren Ereignis ab, ohne einen Fehler auszulösen. Vergleiche die `id` des ersten abgespielten Ereignisses mit `n + 1`; jede Differenz entspricht der Größe des verlorenen Fensters. Stage 2 wird einen expliziten `stream_gap`-Synthetic-Frame auf Daemon-Seite injizieren; in Stage 1 liegt die Erkennung in der Verantwortung des Clients.
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

### Auth device-flow routes (issue #4175 PR 21)

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