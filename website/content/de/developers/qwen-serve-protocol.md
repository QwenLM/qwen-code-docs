# `qwen serve` HTTP-Protokollreferenz

Stufe 1 des [qwen-code Daemon-Designs](https://github.com/QwenLM/qwen-code/issues/3803). Alle Routen befinden sich unter der Basis-URL des Daemons (Standardmäßig `http://127.0.0.1:4170`).

## Authentifizierung

Wenn der Daemon mit `--token` oder `QWEN_SERVER_TOKEN` gestartet wurde, muss **jede Route außer `/health` bei Loopback-Binds** Folgendes enthalten:

```
Authorization: Bearer <token>
```

Ohne konfigurierten Token (Loopback-Entwicklungsstandard) ist der Header optional. Der Token-Vergleich erfolgt in konstanter Zeit. 401-Antworten sind einheitlich für `missing header` / `wrong scheme` / `wrong token`.

**`/health`-Ausnahme** (Bctum): Bei Loopback-Binds (`127.0.0.1` / `localhost` / `::1` / `[::1]`) wird `/health` VOR der Bearer-Middleware registriert, sodass Liveness-Probes innerhalb des Pods den Token nicht mitsenden müssen, auch wenn der Daemon mit `--token` gestartet wurde. Non-Loopback-Binds (`--hostname 0.0.0.0` usw.) stellen `/health` wie jede andere Route hinter den Bearer – siehe den Abschnitt [`GET /health`](#get-health) für die Begründung.

**`--require-auth` (#4175 PR 15).** Übergib diesen Flag beim Start, um die Regel "Token ist Pflicht" auch auf Loopback auszudehnen. Der Start schlägt ohne Token fehl; die `/health`-Ausnahme entfällt (sodass `/health` ebenfalls `Authorization: Bearer …` erfordert).

Wenn der Flag aktiviert ist, blockiert die globale `bearerAuth`-Middleware **jede** Route – einschließlich `/capabilities`. Ein **nicht authentifizierter** Client kann daher nicht `caps.features` vorab prüfen (pre-flight), um herauszufinden, dass eine Authentifizierung erforderlich ist: Die Erkennungsoberfläche für diesen Fall ist der **401-Antwort-Body** selbst (einheitlich für alle Routen gemäß dem Abschnitt [Authentifizierung](#authentication)). Der `require_auth`-Capability-Tag ist eine **Bestätigung nach der Authentifizierung** – sobald sich ein Client erfolgreich authentifiziert und `/capabilities` liest, bestätigt das Vorhandensein des Tags, dass der Daemon mit `--require-auth` gestartet wurde (nützlich für Audit-/Compliance-UIs und damit SDK-Clients in einem Einstellungsbereich "Diese Bereitstellung ist abgesichert" anzeigen können). Mutationsrouten, die sich für den strikten Modus pro Route entscheiden (Wave-4-Follow-ups), lehnen mit `401 { code: "token_required", error: "…" }` ab, wenn sie im Loopback-Standard ohne Token erreicht werden – aber wenn `--require-auth` aktiviert ist, unterbricht die globale Bearer-Middleware die Anfrage vor dem routenspezifischen Gate, sodass nicht authentifizierte Aufrufer tatsächlich den Legacy-`Unauthorized`-Body sehen.

**`--allow-origin <pattern>` (T2.4 [#4514](https://github.com/QwenLM/qwen-code/issues/4514)).** Browser-WebUIs, die den Daemon cross-origin ansprechen, werden standardmäßig blockiert – jede Anfrage mit einem `Origin`-Header gibt `403 {"error":"Request denied by CORS policy"}` zurück, da CLI/SDK-Clients niemals `Origin` senden und der Daemon dessen Vorhandensein als Zeichen wertet, dass die Anfrage aus einem Browser-Kontext stammt, in den der Operator nicht eingewilligt hat. Übergib `--allow-origin <pattern>` (wiederholbar) beim Start, um eine Allowlist anstelle der Blockade zu installieren. Jedes Muster ist entweder:

- Das Literal `*` – jede Origin zulassen. **Riskant**: Der Start wird abgelehnt, wenn `*` konfiguriert ist, aber kein Bearer-Token gesetzt ist (aus beliebigen Quellen: `--token`, `QWEN_SERVER_TOKEN` oder `--require-auth`, was einen Token beim Start vorschreibt). Der Boot-Breadcrumb gibt eine Stderr-Warnung aus, wenn `*` in der Liste steht. **Empfehlung**: Kombiniere dies mit `--require-auth` bei Loopback-Binds, sodass `/health` und `/demo` ebenfalls durch den Bearer geschützt sind – sie werden bei Loopback standardmäßig vor der Bearer-Middleware registriert (sodass k8s/Compose-Probes `/health` ohne Token erreichen können), und eine `*`-Allowlist macht sie von jedem Cross-Origin-Browser aus erreichbar. Bei Non-Loopback-Binds ist der Bearer beim Start bereits Pflicht, sodass die `*`-Angriffsfläche nur `/health` (Status-JSON) und `/demo` (eine statische Seite, deren JS dennoch Token-geschützte Routen aufruft) umfasst – die eigentliche API-Oberfläche ist unabhängig davon geschützt.
- Eine kanonische URL-Origin – `<scheme>://<host>[:<port>]`. **Kein abschließender Schrägstrich, kein Pfad, keine Userinfo, kein Query.** Der Start wird mit `InvalidAllowOriginPatternError` abgelehnt, wenn der Eintrag den Roundtrip `new URL(pattern).origin === pattern` nicht besteht; die Fehlermeldung nennt das fehlerhafte Muster und die kanonische Form. Absichtlich strikt: Eine stille Normalisierung (z. B. das Entfernen eines abschließenden `/`) würde Tippfehler durchrutschen lassen und mehrdeutige Eingaben akzeptieren.

Übereinstimmende Origins erhalten bei jeder Anfrage die Standard-CORS-Antwortheader:

```
Access-Control-Allow-Origin: <echoed origin>
Vary: Origin
Access-Control-Allow-Methods: GET, POST, PATCH, DELETE, OPTIONS
Access-Control-Allow-Headers: Authorization, Content-Type, X-Qwen-Client-Id, Last-Event-ID
Access-Control-Max-Age: 86400
Access-Control-Expose-Headers: Retry-After
```

`Access-Control-Allow-Origin` gibt die Origin der Anfrage wortgetreu zurück (Klein-/Großschreibung wie vom Browser gesendet) anstatt des Literals `*`, selbst unter dem `*`-Muster – Browser-Caches cachen Antworten basierend darauf in Kombination mit `Vary: Origin`, und das Echo lässt Raum, um in einem späteren Release `Access-Control-Allow-Credentials` ohne Schemaänderung hinzuzufügen. `Access-Control-Expose-Headers: Retry-After` ermöglicht es Browser-WebUIs, die Retry-Hinweise des Daemons aus `429`- / `503`-Antworten zu beachten. `Access-Control-Allow-Credentials` wird heute **NICHT** gesendet: Der Daemon authentifiziert sich über Bearer-in-`Authorization`, was cross-origin ohne `credentials: 'include'` funktioniert.

OPTIONS-Preflight-Anfragen (OPTIONS mit `Access-Control-Request-Method` oder `Access-Control-Request-Headers`) werden mit `204 No Content` plus den obigen Headern kurzgeschlossen. Dies ist das konventionelle CORS-Muster und sicher – der Preflight bestätigt nur, welche Methoden/Header der Daemon akzeptiert; die tatsächliche nachfolgende Anfrage durchläuft weiterhin die gesamte Kette (Host-Allowlist → Bearer-Auth → Routen), sodass Anti-DNS-Rebinding- und Bearer-Erzwingung weiterhin auslösen, bevor ein Status gelesen oder geändert wird. Normale OPTIONS-Anfragen von übereinstimmenden Origins fließen weiterhin nachgelagert mit angehängten CORS-Headern.

Origins, die nicht mit der Allowlist übereinstimmen, erhalten weiterhin `403 {"error":"Request denied by CORS policy"}` – dieselbe Hülle wie die Standardblockade, sodass Clients, die die Antwort der Blockade bereits geparst haben, keine Sonderbehandlung für Allowlist-bereitgestellte Daemons vornehmen müssen. Der Ablehnungspfad gibt **keine** `Access-Control-*`-Header aus (der Browser würde sie ignorieren, und das Senden würde indirekt die Größe der Allowlist durch das Vorhandensein der Header verraten).

Die konfigurierte Musterliste wird absichtlich **NICHT** in `/capabilities` widergespiegelt – das Browser-WebUI kennt seine eigene Origin bereits (es hat den Daemon schließlich aufgerufen), und das Offenlegen der Liste würde einem nicht authentifizierten Leser von `/capabilities` ermöglichen, jede vertrauenswürdige Origin aufzuzählen (nützliche Aufklärung für eine falsch konfigurierte Bereitstellung). SDK-Clients prüfen anhand des `caps.features.allow_origin`-Tags, ob "dieser Daemon Cross-Origin-Browser-Treffer akzeptiert", ohne die spezifischen Origins kennen zu müssen.

Loopback-Self-Origin-Anfragen (z. B. die `/demo`-Seite, die den Daemon unter derselben `127.0.0.1:port` aufruft) werden von einem **separaten** Origin-Strip-Shim behandelt, der VOR der CORS-Middleware läuft und den `Origin`-Header für `127.0.0.1:port` / `localhost:port` / `[::1]:port` / `host.docker.internal:port` entfernt. Sie werden also unabhängig von der `--allow-origin`-Konfiguration durchgelassen – Operatoren müssen den eigenen Port des Daemons nicht auflisten, damit die Demo-Seite funktioniert.

## Allgemeines Fehlerformat

5xx-Antworten tragen den `code` und `data` des ursprünglichen Fehlers, falls vorhanden (JSON-RPC-Stil – das ACP-SDK leitet `{code, message, data}` vom Agenten weiter):

```json
{
  "error": "Internal error",
  "code": -32000,
  "data": { "reason": "model quota exceeded" }
}
```

Fehlerhaftes JSON in einem Anfrage-Body gibt Folgendes zurück:

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

Verwende dies, um Fehlanpassungen vorab zu erkennen: Lies `workspaceCwd` aus `/capabilities` und lass `cwd` in `POST /session` weg (es fällt auf den gebundenen Workspace zurück), oder leite die Anfrage an einen Daemon weiter, der an `requestedWorkspace` gebunden ist.

Ein `POST /session` über das `--max-sessions`-Limit des Daemons hinaus gibt `503` mit einem `Retry-After: 5`-Header zurück und:

```json
{
  "error": "Session limit reached (20)",
  "code": "session_limit_exceeded",
  "limit": 20
}
```

Anhängen an bestehende Sessions wird **NICHT** auf das Limit angerechnet, sodass Reconnects eines idle Daemons auch bei voller Kapazität funktionieren.

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

Wird ausgelöst, wenn ein `session/load` für eine ID ausgegeben wird, für die bereits ein `session/resume` läuft (oder umgekehrt). Warte mindestens `Retry-After` Sekunden und versuche es erneut – der zugrunde liegende Restore wird innerhalb von `initTimeoutMs` (Standard 10s) abgeschlossen. Same-Action-Races (`load` vs. `load`, `resume` vs. `resume`) werden zusammengeführt, anstatt einen Fehler zu verursachen.

## Capabilities

Der Daemon deklariert seine unterstützten Feature-Tags aus der Serve-Capability-Registry. Clients **müssen** die UI anhand von `features` steuern, nicht anhand von `mode` (gemäß Design §10).

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
 'session_close', 'session_metadata', 'mcp_guardrails',
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

> Bedingte Tags erscheinen nur, wenn der zugehörige Bereitstellungs-Toggle aktiviert ist (siehe Tabelle unten). Das `permission_mediation`-Tag von F3 ist immer aktiv und enthält `modes: ['first-responder', 'designated', 'consensus', 'local-only']`, damit SDK-Clients die vom Build unterstützte Menge introspektieren können; die zur Laufzeit aktive Strategie befindet sich unter `body.policy.permission`.

`session_scope_override` ist das Verhandlungs-Handle für das anfragebezogene `sessionScope`-Feld bei `POST /session` (siehe unten). Ältere Daemons ignorieren das Feld stillschweigend, daher sollten SDK-Clients `caps.features` vorab auf dieses Tag prüfen, bevor sie es senden.

`session_load` und `session_resume` kündigen die expliziten Restore-Routen an (`POST /session/:id/load` und `POST /session/:id/resume`). Ältere Daemons geben für diese Pfade `404` zurück, daher sollten SDK-Clients `caps.features` vorab prüfen, bevor sie sie aufrufen. `unstable_session_resume` wird weiterhin als veralteter Alias für die Kompatibilität mit SDKs angekündigt, die ausgeliefert wurden, während die zugrunde liegende ACP-Methode `connection.unstable_resumeSession` hieß; neue Clients sollten auf `session_resume` prüfen.

`slow_client_warning` deckt zwei zusammen veröffentlichte SSE-Backpressure-Regler ab, die in #4175 Wave 2.5 PR 10 eingeführt wurden: (a) Der Daemon gibt ein synthetisches `slow_client_warning`-Event-Stream-Frame aus, wenn die Warteschlange eines Subscribers 75 % überschreitet, einmal pro Überlauf-Episode (wird neu ausgelöst, nachdem die Warteschlange unter 37,5 % abfließt); (b) `GET /session/:id/events` akzeptiert einen `?maxQueued=N`-Query-Parameter (Bereich `[16, 2048]`), um den Backlog pro Subscriber für Cold-Reconnects gegen einen großen Replay-Ring vorzudimensionieren. Die Daemon-weite Ringgröße wird durch `--event-ring-size` gesteuert (Standard **8000**, gemäß #3803 §02). Alte Daemons haben beides stillschweigend nicht – prüfe dieses Tag vorab, bevor du es aktivierst.

`typed_event_schema` kündigt Daemon-Event-Payloads an, die dem `KnownDaemonEvent`-Schema des SDK entsprechen. Ältere Daemons streamen möglicherweise weiterhin kompatible Frames, aber SDK-Clients sollten dieses Tag vorab prüfen, bevor sie von einer typisierten Event-Abdeckung ausgehen.

`client_heartbeat` kündigt `POST /session/:id/heartbeat` an. Ältere Daemons geben `404` zurück; prüfe dieses Tag vorab, bevor du periodische Heartbeats sendest.

`session_close` und `session_metadata` kündigen `DELETE /session/:id` und `PATCH /session/:id/metadata` an. Ältere Daemons geben `404` zurück; prüfe diese Tags vorab, bevor du Close- oder Rename-Funktionen bereitstellst.

`session_lsp` kündigt `GET /session/:id/lsp` an, den schreibgeschützten strukturierten LSP-Status-Snapshot für Daemon-Clients. Ältere Daemons geben `404` zurück; prüfe dieses Tag vorab, bevor du den Remote-LSP-Status bereitstellst.

`session_status` kündigt `GET /session/:id/status` an, die Live-Bridge-Zusammenfassung für eine einzelne Session nach ID (`clientCount` / `hasActivePrompt` und die Kernfelder). Ältere Daemons geben `404` zurück; prüfe dieses Tag vorab, bevor du den Status einer einzelnen Session abfragst, anstatt die vollständige Session-Liste zu scannen.

`session_approval_mode_control`, `workspace_tool_toggle`, `workspace_init` und `workspace_mcp_restart` (Issue [#4175](https://github.com/QwenLM/qwen-code/issues/4175) PR 17) kündigen die vier Mutations-Control-Routen an, die unten unter "Mutation: approval, tools, init, MCP restart" dokumentiert sind. Alle vier sind strikt durch das PR-15-Mutations-Gate geschützt (ein Daemon, der ohne Bearer-Token konfiguriert ist, lehnt sie mit 401 `token_required` ab). Ältere Daemons geben `404` zurück; prüfe jedes Tag vorab, bevor du die entsprechende Funktion bereitstellst.

`mcp_guardrails` (Issue [#4175](https://github.com/QwenLM/qwen-code/issues/4175) PR 14) deckt die MCP-Budget-Oberfläche ab: die Felder `clientCount` / `clientBudget` / `budgetMode` / `budgets[]` bei `GET /workspace/mcp`, das Feld `disabledReason` bei den Pro-Server-Zellen und die CLI-Flags `--mcp-client-budget` / `--mcp-budget-mode`. Ältere Daemons lassen die neuen Felder vollständig weg; SDK-Clients prüfen dieses Tag vorab, bevor sie sich auf die `budgets[]`-Semantik verlassen. Der Registry-Deskriptor enthält auch `modes: ['warn', 'enforce']` für die zukünftige Feature-Modes-Offenlegung – vorerst leiten Clients den Modus aus dem `budgetMode`-Feld des Snapshots ab. Server-Ablehnungen im `enforce`-Modus sind deterministisch nach der `Object.entries(mcpServers)`-Deklarationsreihenfolge; eine zukünftige Scope-Präzedenz-Schicht (falls qwen-code eine einführt) würde dies auf "niedrigste Präzedenz zuerst" umstellen, um die Konvention `plugin < user < project < local` von claude-code zu spiegeln.

> ⚠️ **PR 14 v1 Scope: pro Session, nicht pro Workspace.** Jede ACP-Session innerhalb des Daemons konstruiert ihre eigene `Config` + `McpClientManager` (über `acpAgent.newSessionConfig`). Die Budget-Caps begrenzen Live-MCP-Clients **pro Session**; jede Session liest unabhängig `QWEN_SERVE_MCP_CLIENT_BUDGET` aus der weitergeleiteten Env. Bei `--mcp-client-budget=10` und 5 gleichzeitigen ACP-Sessions kann die tatsächliche Live-MCP-Client-Anzahl daemon-weit 5 × 10 = 50 erreichen. Der `GET /workspace/mcp`-Snapshot liest **nur** die `McpClientManager`-Buchhaltung der **Bootstrap-Session** – der Wert `budgets[0].scope: 'session'` ist das eindeutige Signal, dass dies pro Session und nicht aggregiert ist. **Wave 5 PR 23 (Shared MCP Pool)** wird einen Workspace-scoped Manager einführen und eine `scope: 'workspace'`-Zelle neben der Pro-Session-Zelle für eine echte Cross-Session-Aggregation hinzufügen. v1 ist das In-Process-Counter- + Soft-Enforcement-Fundament, auf dem PR 23 aufbaut.

`workspace_file_read` deckt die Text/List/Stat/Glob-Workspace-Datei-Routen ab
(`GET /file`, `GET /list`, `GET /glob`, `GET /stat`). `workspace_file_bytes`
deckt `GET /file/bytes` ab, das später hinzugefügt wurde, damit Clients die Raw-Byte-Window-Unterstützung gegen Daemons der PR19-Ära vorab prüfen können. `workspace_file_write` deckt die Hash-bewussten Text-Mutationsrouten ab (`POST /file/write`, `POST /file/edit`).
Das Write-Tag bedeutet, dass der Routen-Vertrag existiert; es bedeutet nicht, dass die aktuelle Bereitstellung für anonyme Mutationen offen ist. Write/Edit sind strikte Mutationsrouten und erfordern einen konfigurierten Bearer-Token, auch bei Loopback.

`daemon_status` kündigt `GET /daemon/status` an, den konsolidierten schreibgeschützten Operator-Diagnose-Snapshot, der unten dokumentiert ist.

**Bedingte Tags.** Eine kleine Anzahl von Feature-Tags wird nur deklariert, wenn der zugehörige Bereitstellungs-Toggle aktiviert ist. Vorhandensein des Tags = Verhalten ist aktiv; Fehlen = entweder ein älterer Daemon, der dem Tag vorausging, ODER ein aktueller Daemon, bei dem der Operator sich nicht dafür entschieden hat. Derzeit:

| Tag                        | Deklariert wenn …                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `require_auth`             | der Daemon mit `--require-auth` (oder `requireAuth: true` über die eingebettete API) gestartet wurde. Der Bearer-Token ist für jede Route Pflicht, einschließlich `/health` bei Loopback-Binds.                                                                                                                                                                                                                                                                                                                                    |
| `mcp_workspace_pool`       | der Shared-MCP-Transport-Pool aktiv ist. Wird weggelassen, wenn `QWEN_SERVE_NO_MCP_POOL=1` den Pool deaktiviert.                                                                                                                                                                                                                                                                                                                                                                                                             |
| `mcp_pool_restart`         | der Shared-MCP-Transport-Pool aktiv ist; Restart-Antworten können Pool-bewusste Multi-Entry-Shapes enthalten.                                                                                                                                                                                                                                                                                                                                                                                                           |
| `allow_origin`             | T2.4 ([#4514](https://github.com/QwenLM/qwen-code/issues/4514)). Der Daemon wurde mit mindestens einem `--allow-origin <pattern>` (oder `allowOrigins: [...]` über die eingebettete API) gestartet. Cross-Origin-Anfragen von übereinstimmenden Origins erhalten korrekte CORS-Antwortheader; nicht übereinstimmende Origins erhalten weiterhin den Standard-403. Die konfigurierte Musterliste wird absichtlich **NICHT** in `/capabilities` widergespiegelt, um zu vermeiden, dass die Menge der vertrauenswürdigen Origins an nicht authentifizierte Leser durchsickert – das Browser-WebUI kennt seine eigene Origin bereits. |
| `prompt_absolute_deadline` | `--prompt-deadline-ms` / `QWEN_SERVE_PROMPT_DEADLINE_MS` / `ServeOptions.promptDeadlineMs` auf eine positive Ganzzahl gesetzt ist.                                                                                                                                                                                                                                                                                                                                                                                        |
| `writer_idle_timeout`      | `--writer-idle-timeout-ms` / `QWEN_SERVE_WRITER_IDLE_TIMEOUT_MS` / `ServeOptions.writerIdleTimeoutMs` auf eine positive Ganzzahl gesetzt ist.                                                                                                                                                                                                                                                                                                                                                                             |
| `workspace_settings`       | der Daemon mit verfügbarer Settings-Persistenz erstellt wurde.                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `session_shell_command`    | die Session-Shell-Ausführung explizit aktiviert ist.                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `rate_limit`               | `--rate-limit` / `QWEN_SERVE_RATE_LIMIT=1` / `ServeOptions.rateLimit` aktiviert ist.                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `workspace_reload`         | Workspace-Reload-Support in der eingebetteten Routenkonfiguration verfügbar ist.                                                                                                                                                                                                                                                                                                                                                                                                                                      |
`mcp_guardrails` steht **nicht** in dieser bedingten Tabelle – es ist ein immer aktives Tag, das immer dann beworben wird, wenn die Binärdatei die neuen `/workspace/mcp` Budget-Felder unterstützt, unabhängig davon, ob der Operator ein Budget konfiguriert hat. Operatoren, die `--mcp-client-budget` nicht gesetzt haben, erhalten trotzdem die neuen Felder (mit `budgetMode: 'off'`, `budgets: []`).

`mcp_guardrail_events` (Issue [#4175](https://github.com/QwenLM/qwen-code/issues/4175) PR 14b) bewirbt die typisierten SSE-Push-Events, die Überschreitungen des MCP-Budgetstatus ohne Polling-Loop sichtbar machen. Zwei Frame-Typen werden auf `GET /session/:id/events` empfangen:

- `mcp_budget_warning` — wird einmalig beim Überschreiten der 75%-Marke von `reservedSlots.size / clientBudget` nach oben ausgelöst. Wird erst wieder scharfgeschaltet, wenn das Verhältnis unter 37,5 % fällt (`MCP_BUDGET_REARM_FRACTION`). Spiegelt die Hysterese von `slow_client_warning` aus PR 10 wider, jedoch auf Manager-Ebene und nicht auf der Backlog-Ebene pro Subscriber. Payload: `{ liveCount, reservedCount, budget, thresholdRatio: 0.75, mode: 'warn' | 'enforce' }`. Wird in den Modi `warn` und `enforce` ausgelöst; niemals in `off`.
- `mcp_child_refused_batch` — wird am Ende jedes `discoverAllMcpTools*`-Durchlaufs ausgelöst, wenn ein oder mehrere Server abgelehnt wurden, UND als Batch der Länge 1 auf dem `readResource`-Lazy-Spawn-Ablehnungspfad. Payload: `{ refusedServers: [{ name, transport, reason: 'budget_exhausted' }, ...], budget, liveCount, reservedCount, mode: 'enforce' }`. `mode` ist wörtlich `'enforce'`, da der `warn`-Modus niemals ablehnt.

Beide Events leben im SSE-Replay-Ring pro Session (sie tragen eine `id`), sodass ein Client, der sich mit `Last-Event-ID` erneut verbindet, durch sie hindurch fortsetzt; der Snapshot unter `GET /workspace/mcp` bleibt die Single Source of Truth für den Zustand nach einer längeren Trennung. Einmal beworben, immer aktiv – es gibt keinen bedingten Toggle. Der SDK-Reducer-State (`DaemonSessionViewState`) stellt `mcpBudgetWarningCount`, `lastMcpBudgetWarning`, `mcpChildRefusedBatchCount` und `lastMcpChildRefusedBatch` für Adapter bereit, die eine einfache Lag-Style-UI wünschen.

## Routes

### `GET /health`

Liveness Probe. Die Standardform gibt `200 {"status":"ok"}` zurück, wenn der Listener aktiv ist – ressourcenschonend, kein Bridge-Zugriff, geeignet für hochfrequente k8s/Compose-Liveness-Probes.

Übergib `?deep=1` (akzeptiert auch `?deep=true` oder einfach `?deep`) für eine Probe, die Bridge-**Counter** offenlegt (nur informativ, keine echte Liveness-Prüfung):

```json
{ "status": "ok", "sessions": 3, "pendingPermissions": 1 }
```

> ⚠️ Die Deep-Probe ist **informativ**, keine echte Liveness-Verifizierung. Sie liest Counter-Accessoren (`bridge.sessionCount`, `bridge.pendingPermissionCount`), die einfache Map-Size-Getter sind; sie pingen keine einzelnen Child-Prozesse / Channels und erkennen daher keine blockierte, aber weiterhin gezählte Session. Nutze sie für Capacity-Dashboards (aktuelle Parallelität vs. `--max-sessions`, Queue-Tiefe) und nicht als Auslöser für "nimm diesen Daemon aus der Rotation". Eine `503 {"status":"degraded"}`-Antwort ist theoretisch möglich, wenn die Getter einer benutzerdefinierten Bridge-Implementierung throwen, aber die Getter der echten Bridge tun dies niemals – unter normalen Betriebsbedingungen gibt die Deep-Probe immer 200 zurück. Verlasse dich für echte Liveness darauf, ob der Listener überhaupt eine TCP-Verbindung akzeptiert (d. h. das Standard-`/health` ohne `?deep`).

**Auth:** nur bei **Non-Loopback-Binds** erforderlich. Bei Loopback (`127.0.0.1`, `::1`, `[::1]`) wird `/health` vor der Bearer-Middleware registriert, sodass k8s/Compose-Probes innerhalb des Pods kein Token mitführen müssen. Bei Non-Loopback (`--hostname 0.0.0.0` usw.) wird die Route nach der Bearer-Middleware registriert und gibt ohne gültiges Token 401 zurück – andernfalls könnte ein unauthentifizierter Caller beliebige Adressen abfragen, um die Existenz eines `qwen serve` zu bestätigen, was ein Info-Leak mit geringem Schweregrad darstellt, das sich schlecht mit Port-Scanning verträgt. CORS-Deny + Host-Allowlist gelten weiterhin für die Loopback-Ausnahme.

### `GET /daemon/status`

Read-only Operator-Diagnostik. Im Gegensatz zu `/health` ist dies eine normale Daemon-API:
Sie wird nach der Bearer-Auth und dem Rate-Limiting registriert, auch bei Loopback-
Binds. Query-Parameter:

- `detail=summary` (Standard) liest nur den In-Memory-Daemon-State.
- `detail=full` umfasst zusätzlich Live-Session-Diagnostik, ACP-Connection-
  Diagnostik, Auth-Device-Flow-Counts und Workspace-Status-Abschnitte.
- Jeder andere `detail`-Wert gibt `400 { "code": "invalid_detail" }` zurück.

`summary` fragt absichtlich keine Workspace-Status-Methoden ab, startet keinen ACP-
Child und spawnt keine Session. `full` fragt jeden Workspace-Abschnitt unabhängig ab;
ein Timeout oder eine Exception markiert nur diesen Abschnitt als `unavailable` und fügt ein
`workspace_status_unavailable`-Issue hinzu.

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
    }
  }
}
```

`status` ist `error`, wenn ein Issue den Schweregrad Error hat, `warning`, wenn ein Issue den
Schweregrad Warning hat, andernfalls `ok`. Issue-Codes sind stabil und umfassen
`session_capacity_high`, `connection_capacity_high`, `pending_permissions`,
`acp_channel_down`, `preflight_error`, `mcp_budget_warning`,
`mcp_budget_exhausted`, `rate_limit_hits` und
`workspace_status_unavailable`. Während des kurzen Fensters, nachdem der Listener
bereit ist, aber bevor die vollständige Runtime gemountet wird, kann `/daemon/status`
`daemon_runtime_starting` melden; wenn der Async-Runtime-Mount fehlschlägt, meldet er
`daemon_runtime_failed`, während Non-Status-Runtime-Routen `503` zurückgeben.

Security: Die Response enthält niemals Bearer-Tokens, Client-IDs, vollständige ACP-
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

Stabiler Contract: Wenn `v` inkrementiert wird, hat sich das Frame-Layout auf eine abwärtsinkompatible Weise geändert.

> **`protocolVersions`** beschreibt die Serve-Protokollversionen, die der Daemon sprechen kann. `current` ist die bevorzugte Protokollversion des Daemons und `supported` ist die kompatible Menge. Clients, die ein bestimmtes Protokoll benötigen, sollten `supported` prüfen; feature-spezifische UIs sollten weiterhin auf `features` prüfen. Additiv zu v=1: Ältere v=1-Daemons lassen dieses Feld weg, daher sollten SDK-Clients, die auf ältere Builds abzielen, es als optional behandeln.

> **`modelServices` ist in Stage 1 immer `[]`.** Der Agent nutzt seinen einzelnen Standard-Model-Service und zählt ihn nicht über die Wire auf. Stage 2 wird dies aus registrierten Model-Adaptern befüllen, damit SDK-Clients Service-Picker bauen können; verlasse dich bis dahin NICHT darauf, dass dieses Feld nicht leer ist.

> **`workspaceCwd`** ist der kanonische absolute Pfad, an den dieser Daemon bindet (#3803 §02 — 1 Daemon = 1 Workspace). Nutze ihn, um (a) Fehlanpassungen vor dem Posten von `/session` zu erkennen und (b) `cwd` bei `POST /session` wegzulassen (die Route fällt auf diesen Pfad zurück). Multi-Workspace-Deployments stellen mehrere Daemons auf verschiedenen Ports bereit, jeder mit seinem eigenen `workspaceCwd`. Additiv zu v=1: v=1-Daemons vor §02 lassen das Feld weg – Clients, die auf ältere Builds abzielen, sollten einen Null-Check durchführen, bevor sie es konsumieren.

### Read-only Runtime-Status-Routen

Diese Routen melden Daemon-seitige Runtime-Snapshots. Sie sind additive v1-Routen,
mutieren keinen State und ändern nicht die Serve-Protokollversion. Workspace-
Status-Routen starten absichtlich **nicht** den ACP-Child-Prozess, nur weil
ein Client eine GET-Route pollt: Wenn der Daemon im Leerlauf ist, geben sie
`initialized: false` mit einem leeren Snapshot zurück. Session-Status-Routen benötigen eine
Live-Session und verwenden die Standard-`404 SessionNotFoundError`-Shape für unbekannte
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

Allgemeine Status-Cell:

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
`/workspace/env` und (schließlich) MCP-Guardrails geteilt wird, damit SDK-Clients
Remediation pro Kategorie rendern können, anstatt Freiform-Nachrichten zu parsen. PR 13
(#4175) hat die sieben oben aufgeführten Literale eingeführt; PR 14 wird
`blocked_egress` befüllen, sobald die Egress-Probe landet.

Status-Payloads legen niemals MCP-Env-Werte, Header, OAuth/Service-Account-
Details, Provider-API-Keys, Provider-`baseUrl` / `envKey`, Skill-Body, Skill-
Dateisystempfade, Hook-Definitionen oder Werte von geheimen Umgebungs-
variablen offen. `/workspace/env` meldet nur das **Vorhandensein** von Whitelist-Env-
Variablen; Proxy-URLs werden vor dem Senden über die Wire von Credentials bereinigt und auf
`host:port` reduziert.

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

`discoveryState` ist einer der Werte `not_started`, `in_progress` oder `completed`.
`transport` ist einer der Werte `stdio`, `sse`, `http`, `websocket`, `sdk` oder
`unknown`. `errors` wird weggelassen, wenn die Discovery erfolgreich ist.

**MCP-Client-Guardrails (Issue [#4175](https://github.com/QwenLM/qwen-code/issues/4175) PR 14).** Post-PR-14-Daemons erweitern die Payload um vier additive Felder und eine Workspace-Level-Cell:

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

`budgetMode` ist einer der Werte `enforce`, `warn` oder `off`. `clientBudget` fehlt, wenn kein Budget gesetzt wurde. `budgets[]` ist bei Post-PR-14-Daemons **immer ein Array** (möglicherweise leer, wenn `budgetMode === 'off'`); Pre-PR-14-Daemons lassen das Feld vollständig weg. v1 gibt eine Cell mit `scope: 'session'` aus (Enforcement pro Session – siehe den Capabilities-Abschnitt oben für den Grund). Consumer müssen zusätzliche `budgets[]`-Einträge mit nicht erkannten `scope`-Werten tolerieren – Wave 5 PR 23 wird `scope: 'workspace'` (oder `'pool'`) neben der Pro-Session-Cell hinzufügen, ohne das Schema zu bumpen.

`disabledReason` bei Pro-Server-Cells unterscheidet vom Operator deaktiviert (`'config'` – `disabledMcpServers`-Config-Liste) von Budget-abgelehnt (`'budget'` – entdeckt, aber aufgrund des `enforce`-Modus nie verbunden). Ablehnungen sind deterministisch nach der `Object.entries(mcpServers)`-Deklarationsreihenfolge. Der Pro-Server-`status: 'error', errorKind: 'budget_exhausted'` überlagert den rohen `mcpStatus: 'disconnected'` (was wahr ist, aber nicht dem Operator-zugewandten Schweregrad entspricht).

Das Budget-Enforcement in PR 14 v1 ist **pro Session, nicht pro Workspace**. Obwohl Mode-B-Daemons post-#4113 auf Prozessebene `1 Daemon = 1 Workspace × N Sessions` sind, wird der `McpClientManager` innerhalb der `Config` jeder ACP-Session über `acpAgent.newSessionConfig` konstruiert, sodass N Sessions jeweils ihre eigene Kopie des Caps durchsetzen. Der Snapshot repräsentiert die Sicht der Bootstrap-Session. Wave 5 PR 23 führt einen Workspace-weiten geteilten MCP-Pool ein, der dies zu einem echten Pro-Workspace-Enforcement weiterentwickelt.

**Erkennen von Budget-Druck.** Zwei Oberflächen, beide befüllt post-PR-14b:

- **Push-Events** (beworben über `mcp_guardrail_events`): abonniere `GET /session/:id/events` und filtere `mcp_budget_warning` / `mcp_child_refused_batch`-Frames über `KnownDaemonEvent`. Die State Machine feuert einmal pro 75%-Überschreitung nach oben (wird unter 37,5 % wieder scharfgeschaltet); Ablehnungen werden im `enforce`-Modus einmal pro Discovery-Durchlauf zusammengefasst.
- **Snapshot-Poll** (beworben über `mcp_guardrails`): `GET /workspace/mcp` und inspiziere die Pro-Session-Budget-Cell (`budgets[0]`):

- `budgets[0].status === 'warning'` ⇔ `liveCount >= 0.75 * clientBudget` (entspricht dem Hysterese-Schwellenwert, den das Push-Event von PR 14b verwenden wird).
- `budgets[0].status === 'error'` ⇔ `refusedCount > 0` (ein oder mehrere Server wurden in diesem Discovery-Durchlauf abgelehnt).
- `budgets[0].status === 'ok'` ⇔ unter dem 75%-Schwellenwert UND keine Ablehnungen.

Empfohlenes Poll-Intervall: abgestimmt auf das, was ohnehin bereits `/workspace/mcp` pollt; der Snapshot ist ressourcenschonend und die Budget-Cell verursacht keine zusätzlichen Discovery-Kosten. SDK-Clients, die Push-Events abonnieren, profitieren dennoch vom Snapshot für den Zustand nach einer längeren Trennung (die Tiefe des SSE-Replay-Rings ist endlich – `--event-ring-size`, Standard 8000 – sodass ein Client, der länger offline ist als die Abdeckung des Rings, auf einen Snapshot-Resync zurückfällt).

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

`level` ist einer der Werte `project`, `user`, `extension` oder `bundled`. `errors` wird
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

Modelle werden nach Auth-Typ gruppiert. Provider-Connection-Diagnostik lebt in der
`providers`-Cell von `/workspace/preflight`; das Environment-Preflight lebt in
`/workspace/preflight` und `/workspace/env` (unten). `errors` wird weggelassen,
wenn die Snapshot-Erstellung erfolgreich ist.

### `GET /workspace/env`

Meldet die Runtime, Plattform, Sandbox, Proxy und das
**Vorhandensein** von Whitelist-Geheim-Umgebungsvariablen des Daemon-Prozesses. Antwortet immer
aus dem `process.*`-State – der Daemon spawnt niemals einen ACP-Child, um
diese Route zu bedienen, und die Response ist identisch, egal ob ACP aktiv oder im Leerlauf ist. Das
`acpChannelLive`-Feld ist nur informativ.

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

Cell-Shape:

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

**Redaction-Policy.** `kind: 'env_var'`-Cells enthalten niemals ein `value`-
Feld; Clients sehen nur `present: boolean`. `kind: 'proxy'`-Cells leiten den
rohen Env-Wert durch die Credential-Redaktion (`redactProxyCredentials`) und
dann durch das `URL`-Parsing, sodass die Wire nur `host:port` trägt. `NO_PROXY`
wird wortgetreu durch die Redaktion geleitet, da es sich um eine Host-Liste und nicht um
eine URL handelt. Die Whitelist der aufgezählten geheimen Env-Variablen umfasst derzeit
`OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GEMINI_API_KEY`, `GOOGLE_API_KEY`,
`DASHSCOPE_API_KEY`, `OPENROUTER_API_KEY` und `QWEN_SERVER_TOKEN`. Andere
Env-Variablen werden nicht aufgezählt, sodass versehentlich gesetzte Secrets unsichtbar bleiben.

### `GET /workspace/preflight`

Meldet Daemon-Readiness-Checks. **Daemon-Level-Cells** (`node_version`,
`cli_entry`, `workspace_dir`, `ripgrep`, `git`, `npm`) werden immer
aus `process.*` und `node:fs` befüllt. **ACP-Level-Cells** (`auth`,
`mcp_discovery`, `skills`, `providers`, `tool_registry`, `egress`)
benötigen einen Live-ACP-Child – wenn der Daemon im Leerlauf ist, geben sie
`status: 'not_started'`-Platzhalter aus. Die Route spawnt niemals ACP nur,
um Cells zu befüllen; die entsprechenden Cells fallen auf `not_started` zurück.

Idle-Response (kein ACP-Child):

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
Zellform:

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
  ripgrep / git / npm nicht im PATH (Warnungen statt Fehler für die
  optionalen Binärdateien).
- `missing_file` — `boundWorkspace` existiert nicht oder ist kein Verzeichnis;
  Skill-Parse-Fehler, der auf eine fehlende oder unlesbare Datei verweist.
- `parse_error` — `SKILL.md`-Parse-Fehler, fehlerhafte Konfigurations-JSON.
- `auth_env_error` — `validateAuthMethod` hat eine Non-Null-Fehlerzeichenfolge zurückgegeben
  oder eine `ModelConfigError`-Unterklasse wurde von der Provider-
  Auflösung weitergeleitet.
- `init_timeout` — `withTimeout`-Reject in der Bridge (ein tatsächlicher Timeout
  beim Warten auf einen ACP-Roundtrip). Wird über die
  typisierte Klasse `BridgeTimeoutError` erkannt. Hinweis: Eine vorübergehende `mcp_discovery`-
  `warning`-Zelle mit `connecting > 0` trägt NICHT diese Art – das ist
  ein normaler Handshake-in-Progress-Zustand, der sich von einem echten Timeout unterscheidet.
- `protocol_error` — ACP-`extMethod` abgelehnt, weil der Kanal mitten in der Anfrage geschlossen
  wurde oder weil die Tool-Registry unerwartet fehlte.
- `blocked_egress` — reserviert für PR 14 (#4175). PR 13 belässt die
  `egress`-Zelle als `status: 'not_started'`.

Wenn die Bridge das ACP-Kind bei der Bearbeitung einer Preflight-
Anfrage nicht erreichen kann (z. B. durch ein Schließen des Kanals mitten in der Anfrage), enthält das `errors`-Array
des Envelops eine einzelne `ServeStatusCell`, die den Fehler beschreibt, und die Zellen
fallen auf `not_started`-ACP-Platzhalter zurück. Zellen auf Daemon-Ebene werden weiterhin
zurückgegeben.

### Workspace-Dateirouten

Alle Dateipfade werden über den gebundenen Workspace des Daemons aufgelöst. Antworten verwenden
Workspace-relative Pfade und geben für normale Erfolgsfälle niemals absolute Dateisystempfade zurück. Erfolgreiche Datei-Antworten enthalten:

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

Zu den `errorKind`-Werten gehören `path_outside_workspace`, `symlink_escape`,
`path_not_found`, `binary_file`, `file_too_large`, `untrusted_workspace`,
`permission_denied`, `parse_error`, `hash_mismatch`,
`file_already_exists`, `text_not_found` und `ambiguous_text_match`.

#### `GET /file`

Liest eine Textdatei. Query-Parameter: `path` (erforderlich), `maxBytes`, `line` und
`limit`. Der Daemon weist Binärdateien und Dateien zurück, die das Text-Lese-Limit überschreiten.
Die Antwort enthält `hash`, einen SHA-256-Digest über die rohen On-Disk-Bytes der
gesamten Datei, auch wenn `line`, `limit` oder `maxBytes` nur einen Ausschnitt zurückgegeben haben.

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
`offset` (Standard `0`) und `maxBytes` (Standard `65536`, max `262144`). Diese
Route unterstützt begrenzte Fenster bei großen Binärdateien, ohne die gesamte Datei einzulesen. Die Antwort enthält `hash` nur, wenn das zurückgegebene Fenster die
gesamte Datei abdeckt.

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
ohne konfiguriertes Token gibt sie `401 { "code": "token_required" }` zurück.
Mit `--require-auth` weist die globale Bearer-Middleware unauthentifizierte Anfragen ab, bevor die Route ausgeführt wird.

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

`mode` muss `create` oder `replace` sein. `create` überschreibt niemals eine vorhandene
Datei (`409 file_already_exists`). `replace` erfordert `expectedHash`; fehlende oder
fehlerhafte Hashes ergeben `400 parse_error`, und veraltete Hashes ergeben
`409 hash_mismatch`. `expectedHash` ist `sha256:` gefolgt von 64 hexadezimalen Kleinbuchstaben,
berechnet über die rohen On-Disk-Bytes.

`bom`, `encoding` und `lineEnding` können angegeben werden. Das Ersetzen behält standardmäßig das
Encoding-Profil der vorhandenen Datei bei; explizite Felder überschreiben dies.
Binäre Schreibvorgänge sind nicht Teil des Umfangs.

Der Daemon schreibt in eine zufällige Temp-Datei im Zielverzeichnis, führt wo unterstützt ein `fsync` durch, prüft den aktuellen Hash unmittelbar vor `rename()` erneut und benennt die Datei dann an den Zielort um. Dies verhindert die Beobachtung unvollständiger Dateien und serialisiert Daemon-initiierte Schreibvorgänge auf dieselbe Datei, ist aber kein prozessübergreifendes Kernel-Compare-and-Swap: Ein externer Editor kann immer noch in dem winzigen Fenster zwischen der finalen Hash-Prüfung und dem Rename konkurrieren.

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

Wendet genau eine exakte Textersetzung auf eine vorhandene Textdatei an. Dies ist ebenfalls eine
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
Die Route bewahrt Encoding, BOM und Zeilenenden und prüft
`expectedHash` unmittelbar vor dem atomaren Rename erneut.

Explizite Schreib-/Bearbeitungsvorgänge auf ignorierte Pfade sind erlaubt, da der authentifizierte
Caller den Pfad explizit angegeben hat. Erfolgs-Antworten und Audit-Events enthalten
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
`available_commands_update`-SSE-Benachrichtigung verwendet wird. `availableSkills` listet nur Skill-Namen auf; Clients dürfen über diese Route keine Skill-Bodys oder Pfade erwarten.

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
    }
  ]
}
```

Diese Route ist ein schreibgeschützter Out-of-Band-Snapshot. Sie ist absichtlich kein Prompt und kann abgefragt werden, während die Session streamt. Die Antwort enthält nur Whitelist-Metadaten aus den Agent-, Shell- und Monitor-Task-Registries; Controller, Timer, Offsets, ausstehende Nachrichten und rohe Registry-Objekte werden niemals offengelegt.

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
keinen Snapshot bereitstellen kann, enthält die Antwort `statusUnavailable: true`.

Diese Route legt nur stabile, clientseitige Felder offen. Sie lässt absichtlich Debug-Interna wie Prozess-IDs, Spawn-Argumente, Stderr-Tails, Root-URIs und Workspace-Ordnerpfade weg.

### `POST /session`

Startet einen neuen Agent oder hängt sich an einen bestehenden an (unter `sessionScope: 'single'`, dem Standard).

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
| `cwd`            | nein       | Absoluter Pfad, der dem gebundenen Workspace des Daemons entspricht. Wenn weggelassen, fällt die Route auf `boundWorkspace` zurück (über `/capabilities.workspaceCwd` auslesen). Ein nicht übereinstimmender, nicht-leerer `cwd` gibt `400 workspace_mismatch` zurück (#3803 §02 — 1 Daemon = 1 Workspace). Workspace-Pfade werden über `realpathSync.native` kanonisiert (mit einem Resolve-only-Fallback für nicht existierende Pfade), damit Case-insensitive Dateisysteme Sessions nicht aufgrund der Schreibweise ablehnen.                                                                                                                                                                          |
| `modelServiceId` | nein       | Wählt aus, über welchen konfigurierten _Model Service_ der Agent routen soll (der Backend-Provider – Alibaba ModelStudio, OpenRouter, etc). Wenn weggelassen, verwendet der Agent seinen Standard. Wenn der Workspace bereits eine Session hat, ruft dies `setSessionModel` für die bestehende Session auf und broadcastet `model_switched`. Unterscheidet sich von `modelId` bei `POST /session/:id/model`, welches das Modell **innerhalb** eines bereits gebundenen Service auswählt. Das `modelServices`-Array bei `/capabilities` ist für die Ankündigung konfigurierter Services reserviert; in Stage 1 ist es immer `[]` (der Standard-Service des Agents wird verwendet und nicht über HTTP aufgezählt). |
| `sessionScope`   | nein       | Pro-Request-Override für das Session-Sharing. `'single'` (der Daemon-weite Standard) bewirkt, dass ein zweiter `POST /session` für denselben Workspace die bestehende Session wiederverwendet (`attached: true`); `'thread'` erzwingt bei jedem Aufruf eine neue, eigenständige Session. Weglassen, um den Daemon-weiten Standard zu erben. Werte außerhalb der Enum geben `400 { code: 'invalid_session_scope' }` zurück. Ältere Daemons (vor #4175 PR 5) ignorieren das Feld stillschweigend – vor dem Senden `caps.features.session_scope_override` im Preflight prüfen. Der Daemon-weite Standard ist in der Produktion derzeit fest auf `'single'` codiert; #4175 könnte in einem Follow-up ein `--sessionScope`-CLI-Flag hinzufügen.         |

Response:

```json
{
  "sessionId": "<uuid>",
  "workspaceCwd": "/canonical/path",
  "attached": false
}
```

`attached: true` bedeutet, dass für diesen Workspace bereits eine Session existierte und du diese nun teilst.

Gleichzeitige `POST /session`-Aufrufe für denselben Workspace werden zu einem einzigen Spawn **zusammengeführt** – beide Caller erhalten dieselbe `sessionId`, genau einer meldet `attached: false`. Wenn der zugrunde liegende Spawn fehlschlägt (Init-Timeout, fehlerhafte Agent-Ausgabe, OOM), **erhalten alle zusammengeführten Caller denselben Fehler** – der In-Flight-Slot wird freigegeben, sodass ein Folgeaufruf von vorne neu versuchen kann.

> ⚠️ **Die Ablehnung von `modelServiceId` bei einer neuen Session ist in der HTTP-Antwort still.** Eine fehlerhafte `modelServiceId` (Tippfehler, nicht konfigurierter Service)
> führt NICHT zu einem 500-Fehler beim Erstellen – die Session bleibt mit dem
> Standardmodell des Agents betriebsbereit, sodass der Caller immer noch eine `sessionId` erhält, mit der
> er den Modellwechsel erneut versuchen kann (über `POST /session/:id/model`).
> Das sichtbare Fehlersignal ist ein `model_switch_failed`-Event im
> SSE-Stream der Session, das zwischen dem Spawn-Handshake und deinem
> ersten Subscribe ausgelöst wird. **Subscriber, die dieses Event
> beobachten müssen, sollten bei ihrem ersten `GET
/session/:id/events` `Last-Event-ID: 0` übergeben**, um vom ältesten verfügbaren
> Event des Rings zu replayen (deckt das `model_switch_failed` zum Spawn-Zeitpunkt ab, auch wenn das
> Subscribe erst ein paar ms nach der Create-Antwort erfolgt).

### `POST /session/:id/load`

Stellt eine persistierte ACP-Session anhand der ID wieder her und spielt ihre Historie über SSE ab. Die Pfad-ID ist maßgeblich; jedes `sessionId`-Feld im Body wird ignoriert. Preflight-Check für `caps.features.session_load` – ältere Daemons geben für diese Route `404` zurück.

Request:

```json
{
  "cwd": "/absolute/path/to/workspace"
}
```

| Field | Required | Notes                                                                                                                                                                                                                                |
| ----- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `cwd` | nein       | Dieselben Kanonisierungs- und `workspace_mismatch`-Regeln wie bei `POST /session`. Weglassen, um `/capabilities.workspaceCwd` zu erben. `mcpServers` wird hier absichtlich NICHT akzeptiert – Daemon-weites MCP wird über Einstellungen gesteuert (entspricht `POST /session`). |

Response:

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

`state` spiegelt ACPs `LoadSessionResponse` wider – `models` ist ein `SessionModelState`, `modes` ein `SessionModeState`, `configOptions` ein Array von `SessionConfigOption`. Fehlende Felder werden vom Agenten festgelegt. Late Attacher (die `attached: true`-Pfade unten) erhalten denselben `state`-Snapshot, den der ursprüngliche Load-Caller gesehen hat – der Daemon cacht ihn beim Entry; Laufzeit-Mutationen (z. B. `model_switched`) werden über den SSE-Stream zugestellt, nicht bei nachfolgenden Attach-Antworten.

`attached: true` bedeutet, dass die Session bereits live war (entweder durch ein vorheriges `session/load`/`session/resume` oder weil ein zusammengeführter gleichzeitiger Caller knapp zuvor war).

**Historien-Replay über SSE.** Während `loadSession` auf Agentenseite in der Schwebe ist, emittiert der Agent `session_update`-Benachrichtigungen für jeden persistierten Turn. Der Daemon puffert sie im Event-Bus der Session, bevor die Routen-Antwort zurückkehrt, sodass Subscriber, die sofort `GET /session/:id/events` mit `Last-Event-ID: 0` aufrufen, das vollständige Replay sehen. **Der Replay-Ring ist begrenzt** (Standard 8000 Frames pro Session). Lange Historien mit vielen Tool-Call- / Thought-Stream-Turns können dieses Limit überschreiten – die ältesten Frames werden stillschweigend verworfen. Clients, die die vollständige Historie benötigen, sollten sich sofort nach der Rückkehr von `load` subscriben; alternativ können sie die SSE-Event-IDs persistieren und `Last-Event-ID` verwenden, um an einer späteren Turn-Grenze fortzufahren.

**Fehler:**

- `404` — Persistierte Session-ID existiert nicht (`SessionNotFoundError`).
- `400` — `workspace_mismatch` (gleiche Struktur wie bei `POST /session`).
- `503` — `session_limit_exceeded` (zählt gegen `--max-sessions`; In-Flight-Wiederherstellungen werden ebenfalls berücksichtigt).
- `409` — `restore_in_progress` (ein `session/resume` für dieselbe ID ist bereits in der Schwebe). `Retry-After: 5`. Same-Action-Races (zwei gleichzeitige `session/load` für dieselbe ID) werden zusammengeführt – genau eines gibt `attached: false` zurück, der Rest gibt `attached: true` mit demselben `state` zurück.

### `POST /session/:id/resume`

Stellt eine persistierte ACP-Session anhand der ID wieder her, OHNE die Historie über SSE abzuspielen. Der Modell-Kontext wird intern auf Agentenseite wiederhergestellt (über `geminiClient.initialize`, das `config.getResumedSessionData` liest); der SSE-Stream bleibt sauber für Clients, die die Historie bereits gerendert haben. Preflight-Check für `caps.features.session_resume`; `unstable_session_resume` bleibt ein deprecated Kompatibilitäts-Alias für ältere Clients.

Gleiche Request-Struktur wie bei `/load`. Gleiche Response-Struktur – `state` spiegelt ACPs `ResumeSessionResponse` wider. Gleiches Error-Envelope, einschließlich `409 restore_in_progress` (wird ausgelöst, wenn ein `session/load` in der Schwebe ist; `session/resume`, das hinter einem anderen `session/resume` her ist, wird zusammengeführt).

Verwende `/load`, wenn der Client keine Historie gerendert hat (Cold Reconnect, Picker → Öffnen). Verwende `/resume`, wenn der Client die Turns bereits auf dem Bildschirm hat und nur das Daemon-seitige Handle zurückbenötigt.

> ⚠️ **Warum wird `unstable_session_resume` noch immer angekündigt?** Die HTTP-Route und die `session_resume`-Capability des Daemons sind stabil für v1, aber die Bridge ruft immer noch ACPs `connection.unstable_resumeSession` auf. Der alte Tag bleibt nur erhalten, damit SDKs, die vor `session_resume` ausgeliefert wurden, weiterhin funktionieren.

### `GET /workspace/:id/sessions`

Listet alle Live-Sessions auf, deren kanonischer Workspace mit `:id` übereinstimmt (URL-kodierter absoluter Cwd).

```bash
curl http://127.0.0.1:4170/workspace/$(jq -rn --arg c "$PWD" '$c|@uri')/sessions
```

Response:

```json
{
  "sessions": [
    {
      "sessionId": "<uuid>",
      "workspaceCwd": "/canonical/path",
      "createdAt": "2026-05-17T08:30:00.000Z",
      "displayName": "My Session",
      "clientCount": 2,
      "hasActivePrompt": false
    }
  ]
}
```

Leeres Array (nicht 404), wenn keine Sessions existieren – eine Session-Picker-UI sollte keinen Fehler werfen, nur weil der Workspace inaktiv ist.

### `POST /session/:id/prompt`

Leitet einen Prompt an den Agenten weiter. Multi-Prompt-Caller werden pro Session in eine FIFO-Warteschlange gestellt (ACP garantiert einen aktiven Prompt pro Session).

Request:

```json
{
  "prompt": [{ "type": "text", "text": "What does src/main.ts do?" }]
}
```

Validierung: `prompt` muss ein nicht-leeres Array von Objekten sein. Andere Fehler geben `400` zurück, bevor sie die Bridge erreichen.

Response:

```json
{ "stopReason": "end_turn" }
```

Andere Stop-Reasons: `cancelled`, `max_tokens`, `error`, `length` (gemäß ACP-Spezifikation).

Wenn der HTTP-Client mitten im Prompt die Verbindung trennt, sendet der Daemon eine ACP-`cancel`-Benachrichtigung an den Agenten, der den Prompt mit `stopReason: "cancelled"` beendet.
> **Stage-1-Einschränkung – kein serverseitiger Prompt-Timeout.** Die Bridge setzt nur das `prompt()` des Agents gegen `transportClosedReject` (wenn der Agent-Child-Prozess abstürzt) und das HTTP-Disconnect-AbortSignal des Aufrufers in ein Race. Ein blockierter, aber noch lebender Agent (z. B. ein hängender Model-Call) blockiert die sessionbezogene FIFO, bis der HTTP-Client auf seiner Seite einen Timeout erreicht und die Verbindung trennt. Lang laufende Prompts sind legitim (Deep Research, Analyse großer Codebasen), daher wird bewusst kein Standard-Deadline gesetzt; Stage 2 wird ein konfigurierbares `promptTimeoutMs`-Opt-in bereitstellen. Bis dahin sollten Aufrufer ihren eigenen clientseitigen Timeout setzen und bei Ablauf die Verbindung trennen (oder `POST /session/:id/cancel` aufrufen).

### `POST /session/:id/cancel`

Bricht den **aktuell aktiven** Prompt der Session ab. ACP-seitig ist dies eine Notification und kein Request – der Agent bestätigt dies, indem er das aktive `prompt()` mit `cancelled` auflöst.

```bash
curl -X POST http://127.0.0.1:4170/session/$SID/cancel
# → 204 No Content
```

> **Multi-Prompt-Vertrag:** Cancel betrifft nur den aktiven Prompt. Alle Prompts, die derselbe Client zuvor gepostet hat und die noch hinter dem aktiven in der Warteschlange stehen, werden weiterhin ausgeführt. Multi-Prompt-Queueing ist ein vom Daemon eingeführtes Verhalten (nicht in der ACP-Spezifikation); der Vertrag für gequeuete Prompts lautet: "Sie laufen weiter, es sei denn, du brichst sie einzeln ab oder beendest die Session über den Channel-Exit".

### `DELETE /session/:id`

Schließt eine aktive Session explizit. Erzwingt das Schließen, auch wenn andere Clients verbunden sind – bricht alle aktiven Prompts ab, löst ausstehende Permissions als abgebrochen auf, veröffentlicht das `session_closed`-Event, schließt den EventBus und entfernt die Session aus den Daemon-Maps. Auf der Festplatte persistierte Sessions werden NICHT gelöscht – sie können über `POST /session/:id/load` neu geladen werden. Pre-flight `caps.features.session_close`.

```bash
curl -X DELETE http://127.0.0.1:4170/session/$SID
# → 204 No Content
```

Idempotent: Gibt `404` für unbekannte Sessions zurück (gleiche `SessionNotFoundError`-Struktur wie bei anderen Routen).

> **`session_closed`-Event.** SSE-Subscriber erhalten ein terminales `session_closed`-Event mit `{ sessionId, reason: 'client_close', closedBy?: '<clientId>' }`, bevor der Stream endet. SDK-Reducer behandeln dies identisch zu `session_died` (setzt `alive: false`, löscht `pendingPermissions`).

### `PATCH /session/:id/metadata`

Aktualisiert mutable Session-Metadaten. Unterstützt derzeit nur `displayName`. Pre-flight `caps.features.session_metadata`.

Request:

```json
{ "displayName": "My Investigation Session" }
```

| Feld          | Erforderlich | Hinweise                                                                             |
| ------------- | ------------ | ------------------------------------------------------------------------------------ |
| `displayName` | nein         | String, max. 256 Zeichen. Ein leerer String löscht den Namen. Weglassen, um ihn beizubehalten. |

Response:

```json
{ "sessionId": "<uuid>", "displayName": "My Investigation Session" }
```

Veröffentlicht ein `session_metadata_updated`-Event auf dem SSE-Stream der Session mit `{ sessionId, displayName }`.

### `POST /session/:id/heartbeat`

Aktualisiert die Last-Seen-Verwaltung des Daemons für diese Session. Langlebige Adapter (TUI/IDE/Web) pingen dies in einem Intervall, sodass eine zukünftige Revocation-Policy (Wave 5 PR 24) tote von stillen Clients unterscheiden kann.

Header:

| Header             | Erforderlich | Hinweise                                                                                                                                                                                                                                  |
| ------------------ | ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `X-Qwen-Client-Id` | nein         | Gibt die vom Daemon ausgegebene ID aus `POST /session` zurück. Identifizierte Clients aktualisieren auch ihren clientbezogenen Timestamp; anonyme Heartbeats aktualisieren nur den sessionbezogenen Watermark. Muss dieselbe `[A-Za-z0-9._:-]{1,128}`-Struktur wie andernorts erfüllen. |

Der Request-Body ist leer (`{}` ist in Ordnung – derzeit werden keine Felder gelesen).

Response:

```json
{
  "sessionId": "<sid>",
  "clientId": "<cid>",
  "lastSeenAt": 1700000000123
}
```

`clientId` wird nur zurückgegeben, wenn eine vertrauenswürdige `X-Qwen-Client-Id` übermittelt wurde. `lastSeenAt` ist der daemonseitige `Date.now()`-Epoch-Zeitstempel (ms), den die Bridge gespeichert hat.

Fehler:

- `400` — `{ code: 'invalid_client_id' }`, wenn der Header fehlerhaft formatiert ist (Header-Struktur-Regel) oder wenn er eine `clientId` enthält, die nicht für diese Session registriert ist (die Bridge wirft `InvalidClientIdError`, bevor ein Timestamp aktualisiert wird).
- `404` — unbekannte Session.

Capability-Gating: Pre-flight `caps.features.client_heartbeat`. Ältere Daemons geben für diesen Pfad `404` zurück.

### `POST /session/:id/model`

Wechselt das aktive Modell **innerhalb** des aktuell an die Session gebundenen Model-Services. Wird über die sessionbezogene Model-Change-Queue serialisiert.

(Um den _Service_ selbst zu wechseln – z. B. Alibaba ModelStudio vs. OpenRouter – übergib `modelServiceId` bei `POST /session` für eine neue Session. Stage 1 hat keine Live-Service-Switch-Route.)

Request:

```json
{ "modelId": "qwen-staging" }
```

Response:

```json
{ "modelId": "qwen-staging" }
```

Bei Erfolg wird `model_switched` an den SSE-Stream veröffentlicht. Bei Fehlschlag wird `model_switch_failed` veröffentlicht (sodass auch passive Subscriber den Fehlschlag sehen, nicht nur der Aufrufer). Wird gegen den Agent-Channel-Exit in ein Race gesetzt, sodass ein blockierter Child-Prozess den HTTP-Handler nicht blockieren kann.

### `POST /session/:id/recap`

Capability-Tag: `session_recap`. Bridge → ACP extMethod `qwen/control/session/recap`.

Erstellt eine einzeilige "Wo habe ich aufgehört"-Zusammenfassung der Session. Wrapper für `generateSessionRecap` aus Core (`packages/core/src/services/sessionRecap.ts`), das eine Side-Query gegen das schnelle Modell mit deaktivierten Tools, `maxOutputTokens: 300` und einem strikten `<recap>...</recap>`-Ausgabeformat ausführt. Die Side-Query liest den bestehenden GeminiClient-Chatverlauf der Session und erweitert ihn **nicht**.

Der Request-Body wird ignoriert (sende `{}` oder leer). Non-strict Mutation-Gate – die Haltung spiegelt `/session/:id/prompt` wider (der Aufruf kostet Tokens, mutiert aber keinen State). Es wird kein SSE-Event veröffentlicht.

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
- oder ein zugrunde liegender Modellfehler aufgetreten ist (der Core-Helper ist Best-Effort und wirft nie).

Fehler:

- `400 {code: 'invalid_client_id'}` – fehlerhafter `X-Qwen-Client-Id`-Header.
- `404` – Session unbekannt.

Cancellation: **keine in v1**. Die Route lauscht nicht auf HTTP-Client-Disconnects, kein `AbortSignal` wird in die Bridge durchgereicht, und der ACP-Child führt die Side-Query bis zum Abschluss aus, unabhängig davon, ob der Aufrufer die Verbindung getrennt hat. Die einzigen Obergrenzen sind der 60s-Backstop-Timeout der Bridge (`SESSION_RECAP_TIMEOUT_MS`) und das Transport-Closed-Race gegen den ACP-Channel-Tod. Dies ist akzeptabel, da Recap kurz ist (einzelner Versuch, `maxOutputTokens: 300`, typisch ~1–5s); eine request-id-basierte Cancel-Ext-Methode kann in einem zukünftigen Release eine vollständige End-to-End-Cancellation durchreichen, wenn die Bandbreitenkosten dies jemals rechtfertigen.

### Mutation: approval, tools, init, MCP restart

Issue [#4175](https://github.com/QwenLM/qwen-code/issues/4175) Wave 4 PR 17 fügt vier Mutations-Control-Routen hinzu, mit denen Remote-Clients die Runtime-Posture ändern können, ohne die CLI des Daemon-Hosts zu berühren. Alle vier:

- Werden durch das **strikte** Mutation-Gate aus PR 15 gesteuert. Ein Daemon, der ohne Bearer-Token konfiguriert ist, weist sie mit `401 {code: 'token_required'}` ab. Konfiguriere `--token` (oder `QWEN_SERVER_TOKEN`), bevor du dich dafür entscheidest.
- Akzeptieren und stempeln den `X-Qwen-Client-Id`-Header (PR 7 Audit-Chain). Wenn der Header eine vertrauenswürdige ID enthält, emittiert der Daemon `originatorClientId` auf dem entsprechenden SSE-Event, sodass Cross-Client-UIs Echos ihrer eigenen Mutationen unterdrücken können.
- Prüfen jede Tag-bezogene Capability im Pre-flight, bevor sie die Affordance bereitstellen. Ältere Daemons geben für die Route `404` zurück.

Drei der vier Routen (`tools/:name/enable`, `init`, `mcp/:server/restart`) emittieren **workspace-weite** Events: Jeder aktive Session-SSE-Bus empfängt das Event, unabhängig davon, welche Session verbunden war, als die Mutation ausgelöst wurde. `approval-mode` emittiert ein **sessionweites** Event, da die Änderung lokal auf die `Config` einer einzelnen Session beschränkt ist.

#### `POST /session/:id/approval-mode`

Capability-Tag: `session_approval_mode_control`. Bridge → ACP extMethod `qwen/control/session/approval_mode`.

Ändert den Approval-Mode einer aktiven Session. Der neue Modus landet sofort in der sessionbezogenen `Config` des ACP-Childs. Einstellungen werden standardmäßig NICHT auf die Festplatte geschrieben – übergib `persist: true`, um `tools.approvalMode` auch in die Workspace-Einstellungen zu schreiben.

Request:

```json
{ "mode": "auto-edit", "persist": false }
```

`mode` muss einer der Werte `'plan' | 'default' | 'auto-edit' | 'auto' | 'yolo'` sein (Spiegelung des Core-`ApprovalMode`-Enums; das SDK exportiert `DAEMON_APPROVAL_MODES` für die Runtime-Validierung). `persist` ist standardmäßig `false`.

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

- `400 {code: 'invalid_approval_mode', allowed: [...]}` – unbekannter Mode-Literal.
- `400 {code: 'invalid_persist_flag'}` – `persist` ist nicht-boolean.
- `403 {code: 'trust_gate', errorKind: 'auth_env_error'}` – der angeforderte Modus erfordert einen vertrauenswürdigen Ordner (privilegierte Modi in nicht vertrauenswürdigen Workspaces werden von `Config.setApprovalMode` aus Core abgelehnt).
- `404` – Session unbekannt.

SSE-Event (sessionweit): `approval_mode_changed` mit `{sessionId, previous, next, persisted, originatorClientId?}`.

#### `POST /workspace/tools/:name/enable`

Capability-Tag: `workspace_tool_toggle`. Reine File-IO – kein ACP-Roundtrip.

Schaltet einen Tool-Namen in der `tools.disabled`-Einstellungsliste des Workspaces um. Tools, die dort aufgeführt sind, werden **gar nicht erst registriert** (im Gegensatz zu `permissions.deny`, das das Tool registriert lässt und die Ausführung ablehnt). Sowohl Built-in-Tools als auch MCP-discovered-Tools durchlaufen `ToolRegistry.registerTool`, das die Disabled-Menge konsultiert.

> ⚠️ **Namen müssen exakt mit der vom Registry offengelegten Kennung übereinstimmen.** Es findet keine Alias-Auflösung statt – die Route speichert den String aus dem Pfad-Parameter in `tools.disabled`, und der nächste ACP-Child vergleicht ihn beim Registrieren mit `tool.name`. Built-ins verwenden ihren kanonischen Registry-Namen (snake_case Verbform): `run_shell_command`, `read_file`, `write_file`, `list_directory`, `glob`, `grep_search`, `web_fetch` usw. – NICHT die Display-Labels (`Shell`, `Read`, `Write`), die die CLI anzeigt. MCP-discovered-Tools verwenden die qualifizierte Form `mcp__<server>__<name>` (das ist auch die Form, die `tool_toggled`-Events broadcasten und die `GET /workspace/mcp` auflistet). Das Deaktivieren von `Bash` verhindert NICHT, dass `run_shell_command` in der nächsten Session registriert wird.

Aktive ACP-Childs behalten bereits registrierte Tools – der Toggle wird erst beim Spawnen des **nächsten** ACP-Childs wirksam. Kombiniere dies mit `POST /workspace/mcp/:server/restart` (für MCP-basierte Tools) oder der Erstellung einer neuen Session, um die Änderung im aktuellen Daemon wirksam zu machen.

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

- `400 {code: 'invalid_tool_name'}` – leerer Pfad-Parameter oder Pfad-Parameter überschreitet das 256-Zeichen-Limit.
- `400 {code: 'invalid_enabled_flag'}` – `enabled` fehlt oder ist nicht-boolean.

SSE-Event (workspace-weit): `tool_toggled` mit `{toolName, enabled, originatorClientId?}`.

#### `POST /workspace/init`

Capability-Tag: `workspace_init`. Reine File-IO – kein ACP-Roundtrip, **kein LLM-Aufruf**.

Erstellt eine leere `QWEN.md` (oder was auch immer `getCurrentGeminiMdFilename()` unter `--memory-file-name`-Overrides zurückgibt) im gebundenen Workspace-Root des Daemons. Rein mechanisch – für KI-gestütztes Content-Filling folge mit `POST /session/:id/prompt`.

Standardmäßig wird das Überschreiben verweigert, wenn die Zieldatei mit Nicht-Whitespace-Inhalt existiert. Dateien, die nur Whitespace enthalten, werden als nicht vorhanden behandelt (entspricht dem lokalen `/init`-Slash-Command).

Request:

```json
{ "force": false }
```

Response (200):

```json
{ "path": "/work/bound/QWEN.md", "action": "created" }
```

`action` ist `'created'` für Neuerstellungen, `'noop'`, wenn eine bestehende Nur-Whitespace-Datei unberührt blieb (kein Schreibvorgang), und `'overwrote'`, wenn `force: true` nicht-leeren Inhalt ersetzt hat. Das `workspace_initialized`-SSE-Event spiegelt die Response-Action wider – Observer können nach `action !== 'noop'` filtern, um nur auf tatsächliche Änderungen auf der Festplatte zu reagieren.

Fehler:

- `400 {code: 'invalid_force_flag'}` – `force` ist nicht-boolean.
- `409 {code: 'workspace_init_conflict', path, existingSize}` – Datei existiert mit Nicht-Whitespace-Inhalt und `force` wurde weggelassen oder ist false. Der Body enthält den absoluten Pfad und die Größe (Bytes), damit SDK-Clients eine "N Bytes überschreiben?"-Aufforderung rendern können, ohne erneut `stat` auszuführen.

SSE-Event (workspace-weit): `workspace_initialized` mit `{path, action, originatorClientId?}`.

#### `POST /workspace/mcp/:server/restart`

Capability-Tag: `workspace_mcp_restart`. Bridge → ACP extMethod `qwen/control/workspace/mcp/restart`.

Startet einen konfigurierten MCP-Server über `McpClientManager.discoverMcpToolsForServer` des ACP-Childs neu (Disconnect + Reconnect + Rediscover). Prüft vorab den Live-Budget-Snapshot aus dem Accounting von PR 14 v1, sodass ein Neustart in einem Budget-gesättigten Workspace eine sanfte Ablehnung zurückgibt, anstatt eine `BudgetExhaustedError`-Kaskade auszulösen.

Der Request-Body ist leer (`{}`). Der Pfad-Parameter ist der URL-kodierte Servername, wie er in der `mcpServers`-Konfiguration erscheint.

Response (200) – discriminated union auf `restarted`:

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

Gründe für sanftes Überspringen (alle geben 200 zurück):

| `reason`                | Bedeutung                                                                                                                                                                               |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `'in_flight'`           | Eine andere Discovery / ein anderer Neustart für diesen Server läuft bereits. Die Route kehrt sofort zurück, anstatt auf das ursprüngliche Promise zu warten. Der Aufrufer sollte es nach einer kurzen Verzögerung erneut versuchen. |
| `'disabled'`            | Server ist konfiguriert, aber in `excludedMcpServers` aufgeführt. Vor dem Neustart wieder aktivieren.                                                                                   |
| `'budget_would_exceed'` | Daemon ist `--mcp-budget-mode=enforce`, der Zielserver befindet sich derzeit nicht in `reservedSlots`, und die Live-Gesamtzahl hat `clientBudget` erreicht. Der Aufrufer sollte zuerst einen Slot freigeben. |

Fehler (non-2xx):

- `400 {code: 'invalid_server_name'}` – leerer Pfad-Parameter.
- `404` – Servername nicht in der `mcpServers`-Konfiguration, oder es existiert kein aktiver ACP-Channel (ein Neustart erfordert zwingend eine aktive `McpClientManager`-Instanz).
- `500` – interner Fehler (z. B. `ToolRegistry` nicht initialisiert).

SSE-Events (workspace-weit): `mcp_server_restarted` mit `{serverName, durationMs, originatorClientId?}` bei Erfolg; `mcp_server_restart_refused` mit `{serverName, reason, originatorClientId?}` bei sanftem Überspringen.

### `GET /session/:id/events` (SSE)

Abonniert den Event-Stream der Session.

Header:

```
Accept: text/event-stream
Last-Event-ID: 42        ← optional, replays from after id 42
```

Query-Parameter:

| Parameter   | Erforderlich | Hinweise                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ----------- | ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `maxQueued` | nein         | **Live-Backlog**-Cap pro Subscriber. Bereich `[16, 2048]`, Standard 256. Replay-Frames, die beim Abonnieren zwangsgepusht werden, sind von diesem Cap ausgenommen; was ihn tatsächlich verbraucht, sind Live-Events, die eintreffen, während der Subscriber noch ein großes `Last-Event-ID: 0`-Replay abarbeitet. Erhöhe den Wert für Cold-Reconnects, damit der Live-Tail nicht die Slow-Client-Warnung / Eviction auslöst, bevor der Consumer aufgeholt hat. Werte außerhalb des Bereichs / nicht-dezimal / vorhanden-aber-leer geben `400 invalid_max_queued` zurück, bevor der SSE-Handshake geöffnet wird. Pre-flight `caps.features.slow_client_warning` – alte Daemons ignorieren den Parameter stillschweigend. |

Frame-Format. Die `data:`-Zeile ist die **vollständige Event-Envelope**, als JSON auf einer einzigen Zeile stringifiziert – `{id?, v, type, data, originatorClientId?}`. Die ACP-spezifische Payload (`sessionUpdate`, `requestPermission`-Argumente usw.) befindet sich im `data`-Feld der Envelope; der eigene `type` der Envelope entspricht der SSE-`event:`-Zeile.

```
id: 7
event: session_update
data: {"id":7,"v":1,"type":"session_update","data":{"sessionUpdate":"agent_message_chunk","content":{"type":"text","text":"…"}}}

id: 8
event: permission_request
data: {"id":8,"v":1,"type":"permission_request","data":{"requestId":"<uuid>","sessionId":"<sid>","toolCall":{...},"options":[...]}}

: heartbeat              ← every 15s, no payload

event: client_evicted    ← terminal frame, no id (synthetic)
data: {"v":1,"type":"client_evicted","data":{"reason":"queue_overflow","droppedAfter":42}}
```

Die SSE-Level-`id:`- / `event:`-Zeilen duplizieren `envelope.id` / `envelope.type` für EventSource-Kompatibilität. Raw-`fetch`-Consumer (der `parseSseStream` des SDKs) lesen alles aus der JSON-Envelope und ignorieren die SSE-Preamble-Zeilen.

| Event-Typ                 | Auslöser                                                                                                                                                                                                                                                                                                                 |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `session_update`          | Jede ACP-`sessionUpdate`-Notification (LLM-Chunks, Tool-Calls, Usage)                                                                                                                                                                                                                                                    |
| `permission_request`      | Agent hat um Tool-Approval gebeten                                                                                                                                                                                                                                                                                       |
| `permission_resolved`     | Ein Client hat über `POST /permission/:requestId` für eine Permission gestimmt                                                                                                                                                                                                                                           |
| `permission_partial_vote` | (nur Consensus) Eine Stimme wurde erfasst, aber das Quorum ist noch nicht erreicht. Enthält `{requestId, sessionId, votesReceived, votesNeeded, quorum, optionTallies}`. Pre-flight `caps.features.permission_mediation`.                                                                                               |
| `permission_forbidden`    | Eine Stimme wurde von der aktiven Policy abgelehnt (`designated`-Mismatch, `local-only` Non-Loopback oder `consensus`-Voter nicht im Snapshot). Enthält `{requestId, sessionId, clientId?, reason}`. Pre-flight `caps.features.permission_mediation`.                                                                     |
| `model_switched`          | `POST /session/:id/model` war erfolgreich                                                                                                                                                                                                                                                                                |
| `model_switch_failed`     | `POST /session/:id/model` wurde abgelehnt                                                                                                                                                                                                                                                                                |
| `session_died`            | Agent-Child ist unerwartet abgestürzt. **Terminal: SSE-Stream schließt nach diesem Frame; die Session ist aus `byId` entfernt.** Subscriber sollten sich über `POST /session` neu verbinden, um eine neue zu spawnen.                                                                                                   |
| `slow_client_warning`     | Subscriber-lokal: Queue ≥ 75% voll. **Non-terminal** – der Stream läuft weiter; die Warnung ist ein Heads-up vor der Eviction. Enthält `{queueSize, maxQueued, lastEventId}`. Wird EINMAL pro Overflow-Episode ausgelöst; wird neu scharfgeschaltet, nachdem die Queue unter 37,5% abgearbeitet ist. Keine `id` (synthetisch). Pre-flight `caps.features.slow_client_warning`. |
| `client_evicted`          | Subscriber-lokal: Queue-Overflow. **Terminal: SSE-Stream schließt nach diesem Frame** (keine `id` – synthetisch). Andere Subscriber derselben Session laufen weiter.                                                                                                                                                     |
| `stream_error`            | Daemon-seitiger Fehler während des Fan-outs. **Terminal: SSE-Stream schließt nach diesem Frame** (keine `id` – synthetisch).                                                                                                                                                                                             |
Reconnect-Semantik:

- Sende `Last-Event-ID: <n>`, um Events mit `id > n` aus dem session-spezifischen Ring abzuspielen (Standardtiefe **8000**, einstellbar über `qwen serve --event-ring-size <n>`)
- **Gap-Erkennung (clientseitig):** Wenn `<n>` älter ist als das älteste noch im Ring befindliche Event (z. B. du verbindest mit `Last-Event-ID: 50` neu, aber der Ring enthält jetzt 200–1199), spielt der Daemon ab dem ältesten verfügbaren Event ab, ohne einen Fehler auszulösen. Vergleiche die `id` des ersten abgespielten Events mit `n + 1`; jede Differenz entspricht der Größe des verlorenen Fensters. Stage 2 wird einen expliziten `stream_gap` Synthetic-Frame auf Daemon-Seite injizieren; in Stage 1 liegt die Erkennung in der Verantwortung des Clients.
- IDs sind monoton pro Session, beginnend bei 1
- Synthetic-Frames (`client_evicted`, `slow_client_warning`, `stream_error`) lassen absichtlich die `id` weg, damit sie keinen Sequenz-Slot für andere Subscriber verbrauchen

Backpressure:

- Die pro-Subscriber-Queue ist standardmäßig auf `maxQueued: 256` Live-Items gesetzt (Replay-Frames beim Reconnect umgehen dieses Limit). Überschreibbar über `?maxQueued=N` (Bereich `[16, 2048]`) in der SSE-Anfrage.
- Wenn die Queue eines Subscribers 75 % Füllstand überschreitet, pusht der Bus zwangsweise einen `slow_client_warning` Synthetic-Frame an diesen Subscriber (einmal pro Überlauf-Episode; wird nach dem Abflauen unter 37,5 % erneut scharf geschaltet). Der Stream bleibt offen – die Warnung dient als Hinweis, damit der Client schneller abarbeiten oder sich sauber trennen und neu verbinden kann.
- Wenn die Queue nach der Warnung tatsächlich überläuft, emittiert der Bus den terminalen `client_evicted` Frame und schließt die Subscription.

### `POST /permission/:requestId`

Gib eine Stimme für eine ausstehende `permission_request` ab. Die aktive **Mediation Policy** entscheidet, wer gewinnt:

| Policy                      | Verhalten                                                                                                                                                                                             |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `first-responder` (default) | Jeder validierte Voter gewinnt; spätere Voter erhalten `404`. Pre-F3-Baseline.                                                                                                                        |
| `designated`                | Nur der Prompt-Urheber (`originatorClientId`) entscheidet; Nicht-Urheber erhalten `403 permission_forbidden / designated_mismatch`. Fällt bei anonymen Prompts auf first-responder zurück.            |
| `consensus`                 | N von M Votern müssen zustimmen (Standard `N = floor(M/2) + 1`, überschreibbar über `policy.consensusQuorum`). Die erste Option, die `N` erreicht, gewinnt. Nicht-auflösende Stimmen erhalten `200` + `permission_partial_vote` SSE-Frames. |
| `local-only`                | Nur Loopback-Voter entscheiden; Remote-Caller erhalten `403 permission_forbidden / remote_not_allowed`.                                                                                               |

Die aktive Policy wird in `settings.json` unter `policy.permissionStrategy` konfiguriert und auf `/capabilities` unter `body.policy.permission` bereitgestellt. Pre-flight `caps.features.permission_mediation` (mit `modes: [...]`) für den Build-unterstützten Satz.

> **F3 (#4175): Multi-Client-Permission-Koordination.** F3 hat die vier obigen Policies hinzugefügt. Pre-F3-Daemons hatten first-responder hartcodiert; die Wire-Form bleibt Bit für Bit unverändert, wenn die konfigurierte Policy `first-responder` ist. Neue Events (`permission_partial_vote`, `permission_forbidden`) sind additiv – alte SDKs sehen sie als `unrecognized_known_event` und ignorieren sie anmutig.

> **Permission-Timeout (Standard 5 Minuten).** Eine `permission_request`
> bleibt ausstehend, bis: (a) ein Client hier abstimmt, (b) `POST /session/:id/cancel`
> ausgelöst wird, (c) der HTTP-Client, der den Prompt antreibt, die Verbindung trennt
> (Mid-Prompt-Cancel löst ausstehende Permissions als `cancelled` auf),
> (d) die Session beendet wird, (e) der Daemon herunterfährt, **oder
> (f) der session-spezifische Permission-Timeout auslöst** (`DEFAULT_PERMISSION_TIMEOUT_MS`,
> 5 Minuten). Beim Auslösen des Timeouts wird `requestPermission` des Agents als `{outcome: 'cancelled'}`
> aufgelöst, der Audit-Ring zeichnet einen
> `permission.timeout`-Eintrag auf, der Daemon-Stderr emittiert einen einzeiligen
> Breadcrumb, und der SSE-Bus verteilt den Standard-
> `permission_resolved`-Cancelled-Frame, damit Subscriber aufräumen. Der
> Timeout ist über `BridgeOptions.permissionResponseTimeoutMs` konfigurierbar;
> Headless-Caller, die Langform-Prompts ausführen, möchten ihn möglicherweise verlängern.

Anfrage:

```json
{
  "outcome": {
    "outcome": "selected",
    "optionId": "proceed_once"
  }
}
```

Outcomes:

- `{ "outcome": "selected", "optionId": "<one-of-the-options>" }` — akzeptieren / ablehnen / proceed-once / usw., je nach den vom Agent angebotenen Auswahlmöglichkeiten
- `{ "outcome": "cancelled" }` — die Anfrage verwerfen (entspricht dem, was `cancelSession` / `shutdown` intern tun)

Antwort:

- `200 {}` — deine Stimme wurde akzeptiert (aufgelöst ODER unter Consensus-Quorum erfasst)
- `403 { "code": "permission_forbidden", "reason": "designated_mismatch" | "remote_not_allowed", "requestId", "sessionId" }` — F3: Die aktive Policy hat deine Stimme abgelehnt
- `404 { "error": "..." }` — die requestId ist unbekannt (bereits aufgelöst, hat nie existiert oder Session wurde abgebaut)
- `500 { "code": "cancel_sentinel_collision", ... }` — F3: Die `allowedOptionIds` des Agents enthält die reservierte Sentinel `'__cancelled__'`; Verstoß gegen den Agent-/Daemon-Vertrag
- `501 { "code": "permission_policy_not_implemented", "policy": "<name>" }` — F3 Forward-Compat: Ein Policy-Literal ist im Schema gelandet, aber sein Mediator-Branch ist noch nicht gebaut (derzeit unerreichbar; für zukünftige Policies reserviert)

Nach einer erfolgreichen Stimme sieht jeder verbundene Client `permission_resolved` mit derselben `requestId` und dem gewählten `outcome`. Unter `consensus` verteilen Zwischenstimmen zusätzlich `permission_partial_vote`, bis das Quorum erreicht ist.

### Auth-Device-Flow-Routen (Issue #4175 PR 21)

Der Daemon vermittelt einen OAuth 2.0 Device Authorization Grant (RFC 8628), sodass ein Remote-SDK-Client einen Login auslösen kann, dessen Tokens auf dem **Daemon**-Dateisystem landen – nicht auf dem Client. Der Daemon pollt den IdP selbst; die einzige Aufgabe des Clients besteht darin, die Verifizierungs-URL + den User-Code anzuzeigen und (optional) SSE für Abschluss-Events zu abonnieren.

Capability-Tag: `auth_device_flow` (immer beworben). Unterstützte Provider in
v1: `qwen-oauth`.

> [!note]
>
> Der Qwen OAuth Free Tier wurde am 15.04.2026 eingestellt. Behandle `qwen-oauth` als den
> Legacy-v1-Provider-Identifier in diesem Protokoll; neue Clients sollten bevorzugt einen
> aktuell unterstützten Auth-Provider verwenden, wenn einer verfügbar ist.

**Runtime-Lokalität.** Der Daemon öffnet niemals einen Browser – selbst wenn er könnte. Der Client entscheidet, ob er `open(verificationUri)` lokal aufruft; auf einem Headless-Pod (dem kanonischen Mode-B-Deployment) öffnet der Benutzer die URL auf einem beliebigen Gerät, auf dem er einen Browser hat. Siehe `docs/users/qwen-serve.md` für die empfohlene UX.

**Kein Token-Leak in Events.** `auth_device_flow_started` enthält nur `{deviceFlowId, providerId, expiresAt}`. Der User-Code und die Verifizierungs-URL kommen Punkt-zu-Punkt im POST-201-Body und über `GET /workspace/auth/device-flow/:id` zurück; sie werden niemals über SSE broadcastet.

**Pro-Provider-Singleton.** Ein zweiter `POST` für denselben Provider, während ein Flow aussteht, ist eine idempotente Übernahme – er gibt den bestehenden Eintrag mit `attached: true` zurück, anstatt eine neue IdP-Anfrage zu starten.

#### `POST /workspace/auth/device-flow`

Strenges Mutations-Gate: Erfordert ein Bearer-Token, selbst bei den tokenlosen Loopback-Standardwerten (`401 token_required`).

Anfrage:

```json
{ "providerId": "qwen-oauth" }
```

Antwort (`201` neuer Start, `200` idempotente Übernahme):

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

Fehler:

- `400 unsupported_provider` — unbekannte `providerId` (Antwort enthält `supportedProviders`)
- `409 too_many_active_flows` — Workspace-Limit (4) erreicht; einen mit `DELETE` abbrechen
- `401 token_required` — Strenges Gate hat eine tokenlose Anfrage abgelehnt
- `502 upstream_error` — IdP hat einen unerwarteten Fehler zurückgegeben

#### `GET /workspace/auth/device-flow/:id`

Liest den aktuellen Zustand. Ausstehende Einträge geben `userCode/verificationUri/expiresAt/intervalMs` zurück; terminale Einträge (5-Minuten-Gnadenfrist) lassen diese weg und zeigen `status` + optionales `errorKind/hint` an.

Gibt `404 device_flow_not_found` für unbekannte IDs und nach der Gnadenfrist evakuierte Einträge zurück.

#### `DELETE /workspace/auth/device-flow/:id`

Idempotenter Abbruch:

- ausstehender Eintrag → `204` + emittiert `auth_device_flow_cancelled`
- terminaler Eintrag → `204` No-Op (kein erneutes Emittieren des Events)
- unbekannte ID → `404`

#### `GET /workspace/auth/status`

Snapshot ausstehender Flows + unterstützter Provider:

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

#### Device-Flow-SSE-Events

Fünf typisierte Events (Workspace-scoped, an jeden aktiven Session-Bus verteilt):

- `auth_device_flow_started` `{deviceFlowId, providerId, expiresAt}` — POST erfolgreich; SDK sollte abonnieren (kein userCode hier, bei Bedarf über GET abrufen)
- `auth_device_flow_throttled` `{deviceFlowId, intervalMs}` — Daemon hat Upstream-`slow_down` berücksichtigt; Clients, die GET pollen, sollten ihr Intervall entsprechend erhöhen
- `auth_device_flow_authorized` `{deviceFlowId, providerId, expiresAt?, accountAlias?}` — Credentials persistiert; `accountAlias` ist ein Non-PII-Label (niemals E-Mail/Telefon)
- `auth_device_flow_failed` `{deviceFlowId, errorKind, hint?}` — terminal; `errorKind` ist eines von `expired_token | access_denied | invalid_grant | upstream_error | persist_failed`. `persist_failed` ist daemon-intern: Der IdP-Austausch war erfolgreich, aber der Daemon konnte die Credentials nicht dauerhaft speichern (EACCES / EROFS / ENOSPC). Der Benutzer sollte es erneut versuchen, sobald das zugrunde liegende Festplattenproblem behoben ist.
- `auth_device_flow_cancelled` `{deviceFlowId}` — DELETE bei einem ausstehenden Eintrag erfolgreich

> **Nicht MCP-kompatibel.** Die MCP-Authorization-Spec (2025-06-18) erfordert OAuth 2.1 + PKCE Auth-Code mit einem Redirect-Callback, was für Headless-Pod-Daemons nicht funktioniert. Die Device-Flow-Oberfläche von Mode B ist daemon-privat – Clients, die auf MCP-konforme Server abzielen, sollten einen anderen Auth-Pfad verwenden.

## Streaming-Wire-Format

Events werden als Standard-EventSource-Frames emittiert. Der Daemon schreibt eine `data:`-Zeile pro Frame (das JSON enthält nach `JSON.stringify` keine eingebetteten Newlines); der SDK-Parser unter `packages/sdk-typescript/src/daemon/sse.ts` verarbeitet sowohl dies als auch die spezifikationskonforme Multi-`data:`-Form auf der Empfangsseite.

## Error-Frames beim Streaming

Wenn der Bridge-Iterator beim Bedienen eines SSE-Subscribers einen Fehler wirft, emittiert der Daemon einen terminalen `stream_error`-Frame (keine `id`). Die `data:`-Zeile ist die vollständige Envelope (gleiche Form wie jeder andere SSE-Frame in diesem Dokument); die eigentliche Fehlermeldung befindet sich unter `envelope.data.error`:

```
event: stream_error
data: {"v":1,"type":"stream_error","data":{"error":"<message>"}}
```

Die Verbindung wird dann geschlossen.

## Umgebungsvariablen

| Var                 | Zweck                                                        |
| ------------------- | ------------------------------------------------------------ |
| `QWEN_SERVER_TOKEN` | Bearer-Token. Wird beim Start von führenden/abschließenden Whitespaces befreit. |

## Quellcode-Layout

| Pfad                                                 | Zweck                                                                                                    |
| ---------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `packages/cli/src/commands/serve.ts`                 | yargs-Command + Flag-Schema                                                                              |
| `packages/cli/src/serve/run-qwen-serve.ts`           | Listener-Lifecycle + Signal-Behandlung                                                                   |
| `packages/cli/src/serve/server.ts`                   | Express-App-Zusammenstellung, Middleware-Reihenfolge und verbleibende direkte Routen                     |
| `packages/cli/src/serve/routes/*.ts`                 | Fokussierte Express-Routengruppen, einschließlich Session, SSE, Workspace-Auth, Workspace-Status und Datei-Routen |
| `packages/cli/src/serve/auth.ts`                     | Bearer + Host-Allowlist + CORS-Deny                                                                      |
| `packages/cli/src/serve/acp-session-bridge.ts`       | CLI-lokale Bridge-Kompatibilitäts-Fassade für Spawn-or-Attach, session-spezifische FIFO und Permission-Registry |
| `packages/acp-bridge/src/status.ts`                  | Read-only Daemon-Status-Wire-Types + `ServeErrorKind` + `BridgeTimeoutError` + `mapDomainErrorToErrorKind` |
| `packages/cli/src/serve/env-snapshot.ts`             | Pure Helper, der `/workspace/env`-Payloads aus dem `process.*`-Zustand erstellt, einschließlich Credential-Redaktion |
| `packages/acp-bridge/src/eventBus.ts`                | Begrenzte Async-Queue + Replay-Ring                                                                      |
| `packages/sdk-typescript/src/daemon/DaemonClient.ts` | TS-Client                                                                                                |
| `packages/sdk-typescript/src/daemon/sse.ts`          | EventSource-Frame-Parser                                                                                 |
| `integration-tests/cli/qwen-serve-routes.test.ts`    | 18 Cases, kein LLM                                                                                       |
| `integration-tests/cli/qwen-serve-streaming.test.ts` | 3 Cases, echter `qwen --acp`-Child-Prozess, unterstützt vom lokalen Fake-OpenAI-Server (nur POSIX; auf Windows übersprungen) |