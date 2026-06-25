# `qwen serve` HTTP-Protokollreferenz

Stadium 1 des [qwen-code Daemon-Designs](https://github.com/QwenLM/qwen-code/issues/3803). Alle Routen liegen unter der Basis-URL des Daemons (Standard: `http://127.0.0.1:4170`).

## Authentifizierung

Wenn der Daemon mit `--token` oder `QWEN_SERVER_TOKEN` gestartet wurde, **muss jede Route außer `/health` auf Loopback-Bindungen** Folgendes enthalten:

```
Authorization: Bearer <token>
```

Ohne konfiguriertes Token (Loopback-Entwicklungsstandard) ist der Header optional. Der Token-Vergleich erfolgt konstant zeitlich. 401-Antworten sind einheitlich für `fehlender Header` / `falsches Schema` / `falsches Token`.

**`/health` Ausnahme** (Bctum): Bei Loopback-Bindungen (`127.0.0.1` / `localhost` / `::1` / `[::1]`) wird `/health` VOR der Bearer-Middleware registriert, sodass Liveness-Probes innerhalb des Pods kein Token mitführen müssen, selbst wenn der Daemon mit `--token` gestartet wurde. Nicht-Loopback-Bindungen (`--hostname 0.0.0.0` usw.) schützen `/health` hinter dem Bearer wie jede andere Route – siehe Abschnitt [`GET /health`](#get-health) für die Begründung.

**`--require-auth` (#4175 PR 15).** Übergeben Sie dieses Flag beim Start, um die Regel „Muss ein Token haben“ auch auf Loopback auszuweiten. Der Start schlägt ohne Token fehl; die `/health`-Ausnahme wird aufgehoben (auch `/health` benötigt dann `Authorization: Bearer …`).

Wenn das Flag gesetzt ist, schützt die globale `bearerAuth`-Middleware **jede** Route – einschließlich `/capabilities`. Ein **nicht authentifizierter** Client kann daher nicht vorab `caps.features` prüfen, um herauszufinden, dass eine Authentifizierung erforderlich ist: Die Erkennungsfläche für diesen Fall ist der **401-Antworttext** selbst (einheitlich über alle Routen gemäß Abschnitt [Authentifizierung](#authentication)). Das `require_auth`-Fähigkeits-Tag ist eine **Post-Authentifizierungsbestätigung** – sobald ein Client erfolgreich authentifiziert und `/capabilities` gelesen hat, bestätigt das Vorhandensein des Tags, dass der Daemon mit `--require-auth` gestartet wurde (nützlich für Prüf-/Compliance-UI und für SDK-Clients, um in einem Einstellungsbereich „Diese Bereitstellung ist gehärtet“ anzuzeigen). Mutationsrouten, die den strikten Modus pro Route aktivieren (Wave 4 Follow-ups), lehnen mit `401 { code: "token_required", error: "…" }` ab, wenn sie auf einem Loopback-Standard ohne Token erreicht werden – aber mit aktiviertem `--require-auth` unterbricht die globale Bearer-Middleware die Anfrage vor dem pro-Route-Gate, sodass der Legacy-Text `Unauthorized` das ist, was nicht authentifizierte Aufrufer tatsächlich sehen.

**`--allow-origin <pattern>` (T2.4 [#4514](https://github.com/QwenLM/qwen-code/issues/4514)).** Browser-WebUIs, die den Daemon Cross-Origin ansprechen, werden standardmäßig blockiert – jede Anfrage mit einem `Origin`-Header gibt `403 {"error":"Request denied by CORS policy"}` zurück, weil CLI/SDK-Clients niemals `Origin` senden und der Daemon dessen Vorhandensein als Zeichen dafür wertet, dass die Anfrage aus einem Browser-Kontext stammt, in den der Betreiber nicht eingewilligt hat. Übergeben Sie `--allow-origin <pattern>` (wiederholbar) beim Start, um anstelle der Blockade eine Erlaubnisliste zu installieren. Jedes Muster ist entweder:

- Das Literal `*` – jeder Ursprung wird zugelassen. **Riskant**: Der Start verweigert, wenn `*` konfiguriert ist, aber kein Bearer-Token gesetzt ist (jede Quelle: `--token`, `QWEN_SERVER_TOKEN` oder `--require-auth` erzwingt ein Token beim Start). Der Start-Breadcrumb gibt eine Stderr-Warnung aus, wenn `*` in der Liste ist. **Empfehlung**: Kombinieren Sie mit `--require-auth` auf Loopback-Bindungen, damit auch `/health` und `/demo` durch den Bearer geschützt sind – sie werden auf Loopback standardmäßig vor der Bearer-Middleware registriert (damit k8s/Compose-Probes `/health` ohne Token erreichen können), und eine `*`-Erlaubnisliste macht sie von jedem Cross-Origin-Browser erreichbar. Auf Nicht-Loopback-Bindungen ist der Bearer beim Start bereits obligatorisch, daher ist die `*`-Expositionsfläche nur `/health` (Status-JSON) und `/demo` (eine statische Seite, deren JS immer noch Token-geschützte Routen aufruft) – die eigentliche API-Oberfläche ist unabhängig davon geschützt.
- Eine kanonische URL-Origin – `<scheme>://<host>[:<port>]`. **Kein abschließender Schrägstrich, kein Pfad, keine Benutzerinformationen, keine Query.** Der Start verweigert mit `InvalidAllowOriginPatternError`, wenn der Eintrag den Roundtrip `new URL(pattern).origin === pattern` nicht besteht; die Fehlermeldung nennt das fehlerhafte Muster und die kanonische Form. Streng beabsichtigt: Stille Normalisierung (z. B. Entfernen eines abschließenden `/`) würde Tippfehler durchlassen und mehrdeutige Eingaben akzeptieren.

Passende Ursprünge erhalten bei jeder Anfrage die standardmäßigen CORS-Antwort-Header:

```
Access-Control-Allow-Origin: <echoed origin>
Vary: Origin
Access-Control-Allow-Methods: GET, POST, PATCH, DELETE, OPTIONS
Access-Control-Allow-Headers: Authorization, Content-Type, X-Qwen-Client-Id, Last-Event-ID
Access-Control-Max-Age: 86400
Access-Control-Expose-Headers: Retry-After
```

`Access-Control-Allow-Origin` gibt die Origin der Anfrage wörtlich zurück (Klein-/Großschreibung wie vom Browser gesendet) und nicht das Literal `*`, selbst unter dem `*`-Muster – Browser-Caches schlüsseln Antworten darauf in Verbindung mit `Vary: Origin` auf, und das Zurückgeben lässt Raum, in einer späteren Version `Access-Control-Allow-Credentials` hinzuzufügen, ohne ein Schema zu ändern. `Access-Control-Expose-Headers: Retry-After` ermöglicht Browser-WebUIs, Retry-Hinweise des Daemons aus `429`/`503`-Antworten zu beachten. `Access-Control-Allow-Credentials` wird heute **NICHT** gesendet: Der Daemon authentifiziert über Bearer im `Authorization`-Header, der Cross-Origin ohne `credentials: 'include'` funktioniert.
OPTIONS-Preflight-Anfragen (OPTIONS mit `Access-Control-Request-Method` oder `Access-Control-Request-Headers`) werden mit `204 No Content` plus den obigen Headern kurzgeschlossen. Dies ist das übliche CORS-Muster und sicher – der Preflight bestätigt lediglich, welche Methoden/Header der Daemon akzeptiert; die eigentliche nachfolgende Anfrage durchläuft weiterhin die vollständige Kette (Host-Zulassungsliste → Bearer-Authentifizierung → Routen), sodass Anti-DNS-Rebinding und Bearer-Erzwingung immer noch greifen, bevor ein Zustand gelesen oder verändert wird. Normale OPTIONS-Anfragen von übereinstimmenden Ursprüngen werden weiterhin mit CORS-Headern versehen nach unten durchgereicht.

Ursprünge, die nicht mit der Zulassungsliste übereinstimmen, erhalten weiterhin `403 {"error":"Request denied by CORS policy"}` – dieselbe Hülle wie die Standard-Sperrseite, sodass Clients, die die Antwort der Sperrseite bereits parsen, keine Sonderbehandlung für Daemons mit bereitgestellter Zulassungsliste vornehmen müssen. Der Ablehnungspfad gibt **keine** `Access-Control-*-Header` aus (der Browser würde sie ignorieren, und das Ausgeben würde indirekt die Größe der Zulassungsliste durch das Vorhandensein von Headern preisgeben).

Die konfigurierte Musterliste wird bewusst **nicht** in `/capabilities` zurückgegeben – die Browser-WebUI kennt bereits ihren eigenen Ursprung (sie hat schließlich den Daemon aufgerufen), und das Offenlegen der Liste würde einem nicht authentifizierten Leser von `/capabilities` erlauben, jeden vertrauenswürdigen Ursprung aufzuzählen (nützliche Aufklärung für eine fehlkonfigurierte Bereitstellung). SDK-Clients prüfen auf das Tag `caps.features.allow_origin`, um zu erkennen, dass dieser Daemon ursprungsübergreifende Browser-Treffer akzeptiert, ohne die spezifischen Ursprünge kennen zu müssen.

Loopback-Selbstursprungs-Anfragen (z. B. wenn die `/demo`-Seite den Daemon am selben `127.0.0.1:port` aufruft) werden durch einen **separaten** Origin-Strip-Shim behandelt, der **vor** der CORS-Middleware ausgeführt wird und den `Origin`-Header für `127.0.0.1:port` / `localhost:port` / `[::1]:port` / `host.docker.internal:port` entfernt. Sie passieren also unabhängig von der `--allow-origin`-Konfiguration – Betreiber müssen den eigenen Port des Daemons nicht auflisten, damit die Demo-Seite funktioniert.

## Allgemeine Fehlerstruktur

5xx-Antworten enthalten den ursprünglichen Fehler-`code` und `data`, sofern vorhanden (JSON-RPC-Stil – das ACP SDK leitet `{code, message, data}` vom Agenten weiter):

```json
{
  "error": "Internal error",
  "code": -32000,
  "data": { "reason": "model quota exceeded" }
}
```

Fehlerhaftes JSON im Anfragetext gibt zurück:

```json
{ "error": "Invalid JSON in request body" }
```

mit Status `400`.

`SessionNotFoundError` für eine unbekannte Session-ID gibt zurück:

```json
{ "error": "No session with id \"<sid>\"", "sessionId": "<sid>" }
```

mit Status `404`.

`WorkspaceMismatchError` für ein `POST /session`, dessen `cwd` nicht auf den gebundenen Workspace des Daemons kanonisiert (#3803 §02 – 1 Daemon = 1 Workspace), gibt `400` zurück mit:

```json
{
  "error": "Workspace mismatch: daemon is bound to \"…\" but request asked for \"…\". …",
  "code": "workspace_mismatch",
  "boundWorkspace": "/path/the/daemon/binds",
  "requestedWorkspace": "/path/in/the/request"
}
```

Verwenden Sie dies, um einen Konflikt vorab zu erkennen: Lesen Sie `workspaceCwd` von `/capabilities` aus und lassen Sie `cwd` bei `POST /session` weg (es fällt auf den gebundenen Workspace zurück), oder leiten Sie die Anfrage an einen Daemon weiter, der an `requestedWorkspace` gebunden ist.

`POST /session` über dem `--max-sessions`-Limit des Daemons gibt `503` mit einem `Retry-After: 5`-Header zurück und:

```json
{
  "error": "Session limit reached (20)",
  "code": "session_limit_exceeded",
  "limit": 20
}
```

Anhänge an bestehende Sessions werden NICHT auf das Limit angerechnet, sodass Wiederverbindungen bei einem müßigen Daemon auch dann noch funktionieren, wenn dieser bereits ausgelastet ist.

`RestoreInProgressError` – wird nur von `POST /session/:id/load` und `POST /session/:id/resume` ausgegeben – gibt `409` mit einem `Retry-After: 5`-Header (entspricht `session_limit_exceeded`) zurück und:

```json
{
  "error": "Session \"<sid>\" is already being restored via session/<resume|load>; retry session/<load|resume> after it completes",
  "code": "restore_in_progress",
  "sessionId": "<sid>",
  "activeAction": "load",
  "requestedAction": "resume"
}
```

Wird ausgelöst, wenn ein `session/load` für eine ID ausgegeben wird, für die bereits ein `session/resume` in Bearbeitung ist (oder umgekehrt). Warten Sie mindestens `Retry-After` Sekunden und wiederholen Sie den Vorgang – die zugrunde liegende Wiederherstellung wird innerhalb von `initTimeoutMs` (Standard 10s) abgeschlossen. Gleichzeitige Aktionen (`load` vs `load`, `resume` vs `resume`) werden zusammengeführt, statt einen Fehler zu werfen.

## Capabilities

Der Daemon bewirbt seine unterstützten Feature-Tags aus dem Serve-Fähigkeitsregister. Clients **müssen** die UI anhand von `features` und nicht anhand von `mode` steuern (gemäß Design §10).

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
 'session_lsp',
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
> Bedingte Tags erscheinen nur, wenn der zugehörige Deployment-Toggle aktiviert ist (siehe Tabelle unten). Das `permission_mediation`-Tag von F3 ist immer aktiv und trägt `modes: ['first-responder', 'designated', 'consensus', 'local-only']`, sodass SDK-Clients die build-unterstützte Menge abfragen können; die zur Laufzeit aktive Strategie befindet sich unter `body.policy.permission`.

`session_scope_override` ist das Verhandlungshandle für das pro-Request-Feld `sessionScope` bei `POST /session` (siehe unten). Ältere Daemons ignorieren das Feld stillschweigend, daher sollten SDK-Clients vor dem Senden `caps.features` auf dieses Tag prüfen (Pre-Flight).

`session_load` und `session_resume` geben die expliziten Wiederherstellungsrouten bekannt (`POST /session/:id/load` und `POST /session/:id/resume`). Ältere Daemons geben für diese Pfade `404` zurück, daher sollten SDK-Clients vor dem Aufruf `caps.features` prüfen. `unstable_session_resume` wird weiterhin als veralteter Alias für Kompatibilität mit SDKs angeboten, die ausgeliefert wurden, als die zugrundeliegende ACP-Methode noch `connection.unstable_resumeSession` hieß; neue Clients sollten auf `session_resume` prüfen.

`slow_client_warning` umfasst zwei gemeinsam veröffentlichte SSE-Backpressure-Stellschrauben, die in #4175 Wave 2.5 PR 10 eingeführt wurden: (a) Der Daemon sendet einen synthetischen `slow_client_warning`-Ereignis-Stream-Frame, wenn die Warteschlange eines Abonnenten 75% erreicht, einmal pro Überlauf-Episode (wieder scharf geschaltet, nachdem die Warteschlange unter 37,5% fällt); (b) `GET /session/:id/events` akzeptiert einen `?maxQueued=N`-Query-Parameter (Bereich `[16, 2048]`), um den Pro-Abonnenten-Backlog für kalte Neuverbindungen gegen einen großen Replay-Ring vorzubesetzen. Die daemonweite Ringgröße wird über `--event-ring-size` gesteuert (Standard **8000**, gemäß #3803 §02). Alte Daemons haben beides stillschweigend nicht – führen Sie für dieses Tag einen Pre-Flight durch, bevor Sie es aktivieren.

`typed_event_schema` kündigt Daemon-Ereignis-Payloads an, die dem `KnownDaemonEvent`-Schema des SDKs entsprechen. Ältere Daemons streamen möglicherweise weiterhin kompatible Frames, aber SDK-Clients sollten dieses Tag vorab prüfen, bevor sie eine typisierte Ereignisabdeckung annehmen.

`client_heartbeat` kündigt `POST /session/:id/heartbeat` an. Ältere Daemons geben `404` zurück; führen Sie für dieses Tag einen Pre-Flight durch, bevor Sie periodische Heartbeats senden.

`session_close` und `session_metadata` kündigen `DELETE /session/:id` und `PATCH /session/:id/metadata` an. Ältere Daemons geben `404` zurück; führen Sie für diese Tags einen Pre-Flight durch, bevor Sie Schließen- oder Umbenennen-Funktionen bereitstellen.

`session_lsp` kündigt `GET /session/:id/lsp` an, den schreibgeschützten strukturierten LSP-Status-Snapshot für Daemon-Clients. Ältere Daemons geben `404` zurück; führen Sie für dieses Tag einen Pre-Flight durch, bevor Sie den entfernten LSP-Status bereitstellen.

`session_approval_mode_control`, `workspace_tool_toggle`, `workspace_init` und `workspace_mcp_restart` (Issue [#4175](https://github.com/QwenLM/qwen-code/issues/4175) PR 17) geben die vier Mutationskontrollrouten bekannt, die unten unter „Mutation: approval, tools, init, MCP restart“ dokumentiert sind. Alle vier sind streng durch das Mutations-Gate von PR 15 geschützt (ein Daemon, der ohne Bearer-Token konfiguriert ist, lehnt sie mit 401 `token_required` ab). Ältere Daemons geben `404` zurück; führen Sie für jedes Tag einen Pre-Flight durch, bevor Sie die entsprechende Funktion bereitstellen.

`mcp_guardrails` (Issue [#4175](https://github.com/QwenLM/qwen-code/issues/4175) PR 14) umfasst die MCP-Budget-Oberfläche: die Felder `clientCount` / `clientBudget` / `budgetMode` / `budgets[]` bei `GET /workspace/mcp`, das Feld `disabledReason` auf Pro-Server-Zellen sowie die CLI-Flags `--mcp-client-budget` / `--mcp-budget-mode`. Ältere Daemons lassen die neuen Felder vollständig weg; SDK-Clients führen für dieses Tag einen Pre-Flight durch, bevor sie sich auf die `budgets[]`-Semantik verlassen. Der Registry-Descriptor trägt außerdem `modes: ['warn', 'enforce']` für die zukünftige Bereitstellung von Feature-Modi – vorerst leiten Clients den Modus aus dem `budgetMode`-Feld des Snapshots ab. Die Serverablehnung im Modus `enforce` erfolgt deterministisch nach der Deklarationsreihenfolge von `Object.entries(mcpServers)`; eine zukünftige Scope-Precedence-Ebene (falls qwen-code eine einführt) würde dies auf „niedrigste Präzedenz zuerst“ umstellen, um die Konvention `plugin < user < project < local` von claude-code zu spiegeln.

> ⚠️ **PR 14 v1-Umfang: pro Session, nicht pro Workspace.** Jede ACP-Session innerhalb des Daemons erstellt ihre eigene `Config` + `McpClientManager` (über `acpAgent.newSessionConfig`). Die Budget-Obergrenzen gelten für aktive MCP-Clients **pro Session**; jede Session liest unabhängig `QWEN_SERVE_MCP_CLIENT_BUDGET` aus der weitergeleiteten Umgebung. Mit `--mcp-client-budget=10` und 5 gleichzeitigen ACP-Sessions kann die tatsächliche Anzahl aktiver MCP-Clients auf 5 × 10 = 50 im gesamten Daemon ansteigen. Der Snapshot von `GET /workspace/mcp` liest nur die Buchhaltung des **Bootstrap-Session**-`McpClientManager` – der Wert `budgets[0].scope: 'session'` ist das ehrliche Signal, dass dies pro Session und nicht aggregiert ist. **Wave 5 PR 23 (gemeinsamer MCP-Pool)** wird einen Workspace-weiten Manager einführen und eine `scope: 'workspace'`-Zelle neben der Pro-Session-Zelle für eine echte sessionübergreifende Aggregation hinzufügen. v1 ist die In-Prozess-Zähler- und Soft-Enforcement-Grundlage, auf der PR 23 aufbaut.

`workspace_file_read` umfasst die Text-/Listen-/Stat-/Glob-Workspace-Datei-Routen
(`GET /file`, `GET /list`, `GET /glob`, `GET /stat`). `workspace_file_bytes`
umfasst `GET /file/bytes`, das später hinzugefügt wurde, sodass Clients die Unterstützung für rohe Byte-Fenster gegen Daemons aus der PR19-Ära vorab prüfen können. `workspace_file_write` umfasst die hash-bewussten Text-Mutations-Routen (`POST /file/write`, `POST /file/edit`).
Das Write-Tag bedeutet, dass der Routenvertrag existiert; es bedeutet nicht, dass die aktuelle Bereitstellung für anonyme Mutationen offen ist. Write/Edit sind strikte Mutationsrouten und erfordern auch auf Loopback einen konfigurierten Bearer-Token.
`daemon_status` wirbt mit dem `GET /daemon/status`-Endpunkt, der den konsolidierten, schreibgeschützten Diagnose-Snapshot des Bedieners liefert, der unten dokumentiert ist.

**Bedingte Tags.** Eine kleine Anzahl von Feature-Tags wird nur beworben, wenn der entsprechende Deployment-Umschalter aktiviert ist. Tag vorhanden = Verhalten ist aktiv; nicht vorhanden = entweder ein älterer Daemon, der älter ist als das Tag, ODER ein aktueller Daemon, bei dem der Bediener nicht zugestimmt hat. Derzeit:

| Tag                        | Wird beworben, wenn …                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `require_auth`             | der Daemon wurde mit `--require-auth` (oder `requireAuth: true` über die eingebettete API) gestartet. Bearer-Token ist auf jeder Route erforderlich, einschließlich `/health` bei Loopback-Bindungen.                                                                                                                                                                                                                                                                                                            |
| `mcp_workspace_pool`       | der gemeinsame MCP-Transportpool ist aktiv. Fehlt, wenn `QWEN_SERVE_NO_MCP_POOL=1` den Pool deaktiviert.                                                                                                                                                                                                                                                                                                                                                                                                        |
| `mcp_pool_restart`         | der gemeinsame MCP-Transportpool ist aktiv; Neustartantworten können pool-bewusste Mehrfacheintragsformen enthalten.                                                                                                                                                                                                                                                                                                                                                                                            |
| `allow_origin`             | T2.4 ([#4514](https://github.com/QwenLM/qwen-code/issues/4514)). Der Daemon wurde mit mindestens einem `--allow-origin <Muster>` (oder `allowOrigins: [...]` über die eingebettete API) gestartet. Cross-Origin-Anfragen von übereinstimmenden Ursprüngen erhalten korrekte CORS-Antwortheader; nicht übereinstimmende Ursprünge erhalten weiterhin den Standard-403. Die konfigurierte Musterliste wird absichtlich NICHT in `/capabilities` ausgegeben, um die Menge der vertrauenswürdigen Ursprünge nicht an nicht authentifizierte Leser preiszugeben — die Browser-WebUI kennt bereits ihren eigenen Ursprung. |
| `prompt_absolute_deadline` | `--prompt-deadline-ms` / `QWEN_SERVE_PROMPT_DEADLINE_MS` / `ServeOptions.promptDeadlineMs` ist auf eine positive ganze Zahl gesetzt.                                                                                                                                                                                                                                                                                                                                                                            |
| `writer_idle_timeout`      | `--writer-idle-timeout-ms` / `QWEN_SERVE_WRITER_IDLE_TIMEOUT_MS` / `ServeOptions.writerIdleTimeoutMs` ist auf eine positive ganze Zahl gesetzt.                                                                                                                                                                                                                                                                                                                                                                 |
| `workspace_settings`       | der Daemon wurde mit verfügbarer Einstellungspersistenz erstellt.                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `session_shell_command`    | die Ausführung von Sitzungs-Shells ist explizit aktiviert.                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `rate_limit`               | `--rate-limit` / `QWEN_SERVE_RATE_LIMIT=1` / `ServeOptions.rateLimit` ist aktiviert.                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `workspace_reload`         | Unterstützung für das Neuladen des Arbeitsbereichs ist in der eingebetteten Routenkonfiguration verfügbar.                                                                                                                                                                                                                                                                                                                                                                                                       |
`mcp_guardrails` ist **nicht** in dieser bedingten Tabelle — es ist ein immer aktives Tag, das immer dann beworben wird, wenn die Binärdatei die neuen `/workspace/mcp` Budget-Felder unterstützt, unabhängig davon, ob der Operator ein Budget konfiguriert hat. Operatoren, die `--mcp-client-budget` nicht gesetzt haben, erhalten trotzdem die neuen Felder (mit `budgetMode: 'off'`, `budgets: []`).

`mcp_guardrail_events` (Issue [#4175](https://github.com/QwenLM/qwen-code/issues/4175) PR 14b) bewirbt die typisierten SSE-Push-Events, die MCP-Budget-Zustandsüberschreitungen ohne Polling-Schleife sichtbar machen. Zwei Frame-Typen treffen auf `GET /session/:id/events` ein:

- `mcp_budget_warning` — wird einmal beim Überschreiten der 75%-Schwelle von `reservedSlots.size / clientBudget` ausgelöst. Scharfschaltung erfolgt erst, wenn das Verhältnis unter 37,5% fällt (`MCP_BUDGET_REARM_FRACTION`). Spiegelt die Hysterese von PR 10's `slow_client_warning` wider, jedoch auf Manager-Ebene statt auf der Ebene des einzelnen Subscribers. Payload: `{ liveCount, reservedCount, budget, thresholdRatio: 0.75, mode: 'warn' | 'enforce' }`. Wird sowohl im `warn`- als auch im `enforce`-Modus ausgelöst; niemals im `off`-Modus.
- `mcp_child_refused_batch` — wird am Ende jedes `discoverAllMcpTools*`-Durchlaufs ausgelöst, wenn einer oder mehrere Server abgelehnt wurden, UND als Batch der Länge 1 auf dem `readResource`-Lazy-Spawn-Ablehnungspfad. Payload: `{ refusedServers: [{ name, transport, reason: 'budget_exhausted' }, ...], budget, liveCount, reservedCount, mode: 'enforce' }`. `mode` ist das Literal `'enforce'`, da der `warn`-Modus niemals ablehnt.

Beide Events leben im pro-Sitzung SSE-Wiedergabe-Ring (sie tragen eine `id`), sodass ein Client, der mit `Last-Event-ID` neu verbindet, durch diese hindurch fortfährt; der Schnappschuss unter `GET /workspace/mcp` bleibt die Quelle der Wahrheit für den Zustand nach längerer Trennung. Immer aktiv, sobald beworben — es gibt keinen bedingten Schalter. Der SDK-Reducer-Zustand (`DaemonSessionViewState`) stellt `mcpBudgetWarningCount`, `lastMcpBudgetWarning`, `mcpChildRefusedBatchCount`, `lastMcpChildRefusedBatch` für Adapter bereit, die eine einfache Verzögerungsanzeige wünschen.

## Routes

### `GET /health`

Liveness-Probe. Standardformular gibt `200 {"status":"ok"}` zurück, wenn der Listener aktiv ist — günstig, kein Bridge-Zugriff, geeignet für hochfrequente k8s/Compose-Liveness-Probes.

Übergib `?deep=1` (akzeptiert auch `?deep=true` oder bloßes `?deep`) für eine Probe, die Bridge-**Zähler** offenlegt (nur informativ, keine echte Liveness-Prüfung):

```json
{ "status": "ok", "sessions": 3, "pendingPermissions": 1 }
```

> ⚠️ Die tiefe Probe ist **informativ**, keine echte Liveness-Überprüfung. Sie liest Counter-Accessoren (`bridge.sessionCount`, `bridge.pendingPermissionCount`), die einfache Map-Size-Getter sind; sie pingen keine einzelnen Child-Prozesse/Kanäle an und erkennen daher keine festgefahrene, aber weiterhin gezählte Sitzung. Verwende sie für Kapazitäts-Dashboards (aktuelle Parallelität vs. `--max-sessions`, Warteschlangentiefe) und nicht als Auslöser für "diesen Daemon aus der Rotation nehmen". Eine `503 {"status":"degraded"}`-Antwort ist theoretisch möglich, wenn die Getter einer benutzerdefinierten Bridge-Implementierung werfen, aber die Getter der echten Bridge tun das nie — unter normalem Betrieb gibt die tiefe Probe immer 200 zurück. Für echte Liveness verlassen Sie sich darauf, ob der Listener eine TCP-Verbindung akzeptiert (d.h. das Standard-`/health` ohne `?deep`).

**Auth:** erforderlich **nur bei Nicht-Loopback-Bindungen**. Auf Loopback (`127.0.0.1`, `::1`, `[::1]`) ist `/health` vor der Bearer-Middleware registriert, sodass k8s/Compose-Probes innerhalb des Pods kein Token mitführen müssen. Auf Nicht-Loopback (`--hostname 0.0.0.0` usw.) ist die Route nach der Bearer-Middleware registriert und gibt 401 ohne gültiges Token zurück — andernfalls könnte ein nicht authentifizierter Aufrufer beliebige Adressen abfragen, um die Existenz eines `qwen serve` zu bestätigen, ein geringfügiger Informationsleck, der sich schlecht mit Port-Scanning kombiniert. CORS-Deny + Host-Allowlist gelten weiterhin für die Loopback-Ausnahme.

### `GET /daemon/status`

Schreibgeschützte Operator-Diagnose. Anders als `/health` ist dies eine normale Daemon-API: Sie ist nach Bearer-Auth und Ratenbegrenzung registriert, einschließlich auf Loopback-Bindungen. Abfrageparameter:

- `detail=summary` (Standard) liest nur den In-Memory-Daemon-Zustand.
- `detail=full` beinhaltet zusätzlich Live-Sitzungsdiagnose, ACP-Verbindungsdiagnose, Auth-Device-Flow-Zählungen und Workspace-Statusabschnitte.
- jeder andere `detail`-Wert gibt `400 { "code": "invalid_detail" }` zurück.

`summary` fragt absichtlich keine Workspace-Statusmethoden ab, startet kein ACP-Child und erzeugt keine Sitzung. `full` fragt jeden Workspace-Abschnitt unabhängig ab; ein Timeout oder eine Ausnahme markiert nur diesen Abschnitt als `unavailable` und fügt ein `workspace_status_unavailable`-Issue hinzu.

Response-Form:

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
`status` ist `error`, wenn ein Problem den Schweregrad "Fehler" hat, `warning`, wenn ein Problem den Schweregrad "Warnung" hat, andernfalls `ok`. Problemcodes sind stabil und umfassen `session_capacity_high`, `connection_capacity_high`, `pending_permissions`, `acp_channel_down`, `preflight_error`, `mcp_budget_warning`, `mcp_budget_exhausted`, `rate_limit_hits` und `workspace_status_unavailable`. In dem kurzen Zeitfenster, nachdem der Listener bereit ist, aber bevor die vollständige Laufzeitumgebung gemountet ist, kann `/daemon/status` den Wert `daemon_runtime_starting` melden; wenn das asynchrone Mounten der Laufzeitumgebung fehlschlägt, wird `daemon_runtime_failed` gemeldet, während Nicht-Status-Runtime-Routen `503` zurückgeben.

Sicherheit: Die Antwort enthält niemals Bearer-Tokens, Client-IDs, vollständige ACP-Verbindungs-IDs, Device-Flow-Benutzercodes oder Verifizierungs-URLs. `summary` lässt den Daemon-Log-Pfad aus; `full` kann diesen für authentifizierte Operatoren enthalten.

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

Stabiler Vertrag: Wenn `v` inkrementiert wird, hat sich das Rahmenlayout in einer abwärtsinkompatiblen Weise geändert.

> **`protocolVersions`** beschreibt die Serve-Protokollversionen, die der Daemon sprechen kann. `current` ist die bevorzugte Protokollversion des Daemons und `supported` ist die kompatible Menge. Clients, die ein bestimmtes Protokoll benötigen, sollten `supported` prüfen; funktionsspezifische UI sollten dennoch auf `features` abgestimmt sein. Additiv zu v=1: Ältere v1-Daemons lassen dieses Feld weg, daher sollten SDK-Clients, die auf ältere Builds abzielen, es als optional behandeln.

> **`modelServices` ist in Stage 1 immer `[]`.** Der Agent verwendet seinen einzigen Standard-Modellservice und listet ihn nicht über die Leitung auf. Stage 2 wird dies aus registrierten Modelladaptern befüllen, sodass SDK-Clients Service-Auswahlen erstellen können; bis dahin sollten Sie sich NICHT darauf verlassen, dass dieses Feld nicht leer ist.

> **`workspaceCwd`** ist der kanonische absolute Pfad, an den dieser Daemon gebunden ist (#3803 §02 — 1 Daemon = 1 Workspace). Verwenden Sie ihn, um (a) eine Diskrepanz vor dem Absenden von `/session` zu erkennen und (b) `cwd` bei `POST /session` wegzulassen (die Route fällt auf diesen Pfad zurück). Multi-Workspace-Bereitstellungen exponieren mehrere Daemons auf verschiedenen Ports, jeder mit eigenem `workspaceCwd`. Additiv zu v=1: Pre-§02-v1-Daemons lassen das Feld weg – Clients, die auf ältere Builds abzielen, sollten vor der Verwendung eine Null-Prüfung durchführen.

### Schreibgeschützte Runtime-Status-Routen

Diese Routen melden daemon-seitige Runtime-Snapshots. Sie sind additive v1-Routen, verändern keinen Zustand und ändern nicht die Serve-Protokollversion. Workspace-Status-Routen starten **nicht** absichtlich den ACP-Kindprozess, nur weil ein Client eine GET-Route abfragt: Wenn der Daemon im Leerlauf ist, geben sie `initialized: false` mit einem leeren Snapshot zurück. Session-Status-Routen erfordern eine aktive Session und verwenden die standardmäßige `404 SessionNotFoundError`-Form für unbekannte IDs.

Capability-Tags:

- `workspace_mcp` → `GET /workspace/mcp`
- `workspace_skills` → `GET /workspace/skills`
- `workspace_providers` → `GET /workspace/providers`
- `workspace_env` → `GET /workspace/env`
- `workspace_preflight` → `GET /workspace/preflight`
- `session_context` → `GET /session/:id/context`
- `session_supported_commands` → `GET /session/:id/supported-commands`
- `session_tasks` → `GET /session/:id/tasks`

Common status cell:

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

`errorKind` ist ein geschlossenes Enum, das von `/workspace/preflight`, `/workspace/env` und (eventuell) MCP-Guardrails geteilt wird, sodass SDK-Clients die Behebung pro Kategorie rendern können, anstatt Freitextnachrichten zu parsen. PR 13 (#4175) führte die sieben oben aufgeführten Literale ein; PR 14 wird `blocked_egress` befüllen, sobald der Egress-Probe bereitgestellt ist.

Status-Payloads geben niemals MCP-Umgebungsvariablenwerte, Header, OAuth-/Servicekonto-Details, Provider-API-Keys, Provider-`baseUrl`/`envKey`, Skill-Body, Skill-Dateisystempfade, Hook-Definitionen oder Werte geheimer Umgebungsvariablen preis. `/workspace/env` meldet nur das **Vorhandensein** von zugelassenen Umgebungsvariablen; Proxy-URLs werden von Anmeldeinformationen befreit und auf `host:port` reduziert, bevor sie über die Leitung gehen.

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

`discoveryState` ist einer von `not_started`, `in_progress` oder `completed`. `transport` ist einer von `stdio`, `sse`, `http`, `websocket`, `sdk` oder `unknown`. `errors` wird weggelassen, wenn die Erkennung erfolgreich ist.
**MCP-Client-Guardrails (Issue [#4175](https://github.com/QwenLM/qwen-code/issues/4175) PR 14).** Post-PR-14-Daemons erweitern das Payload um vier zusätzliche Felder und eine Workspace-Level-Zelle:

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
      "hint": "Erhöhen Sie --mcp-client-budget oder entfernen Sie Server aus der mcpServers-Konfiguration.",
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

`budgetMode` ist einer von `enforce`, `warn` oder `off`. `clientBudget` fehlt, wenn kein Budget festgelegt wurde. `budgets[]` ist bei Post-PR-14-Daemons **immer ein Array** (möglicherweise leer, wenn `budgetMode === 'off'`); Pre-PR-14-Daemons lassen das Feld komplett weg. v1 gibt eine Zelle mit `scope: 'session'` aus (Sitzungsweise Durchsetzung – siehe den Abschnitt zu den Fähigkeiten oben für die Begründung). Konsumenten MÜSSEN zusätzliche `budgets[]`-Einträge mit unbekannten `scope`-Werten tolerieren – Wave 5 PR 23 wird `scope: 'workspace'` (oder `'pool'`) neben der Sitzungszelle ohne Schema-Update hinzufügen.

`disabledReason` bei Pro-Server-Zellen unterscheidet zwischen vom Betreiber deaktiviert (`'config'` – `disabledMcpServers`-Konfigurationsliste) und aufgrund von Budget verweigert (`'budget'` – entdeckt, aber aufgrund des Modus `enforce` nie verbunden). Verweigerungen sind deterministisch gemäß der Deklarationsreihenfolge von `Object.entries(mcpServers)`. Der Pro-Server-Status `status: 'error', errorKind: 'budget_exhausted'` überdeckt den rohen `mcpStatus: 'disconnected'` (der zwar wahr ist, aber nicht die betreiberseitige Schwere widerspiegelt).

Die Budget-Durchsetzung in PR 14 v1 erfolgt **sitzungsweise, nicht workspace-bezogen**. Obwohl Mode-B-Daemons auf Prozessebene `1 Daemon = 1 Workspace × N Sitzungen` nach #4113 sind, wird der `McpClientManager` innerhalb der jeweiligen ACP-Sitzung über `acpAgent.newSessionConfig` erstellt, daher erzwingen N Sitzungen jeweils ihre eigene Kopie der Obergrenze. Der Snapshot zeigt die Sicht der Bootstrap-Sitzung. Wave 5 PR 23 führt einen workspace-bezogenen gemeinsamen MCP-Pool ein, der dies zu einer echten Workspace-weiten Durchsetzung aufwertet.

**Budgetdruck erkennen.** Zwei Oberflächen, beide nach PR 14b befüllt:

- **Push-Ereignisse** (beworben via `mcp_guardrail_events`): Abonnieren Sie `GET /session/:id/events` und filtern Sie `mcp_budget_warning` / `mcp_child_refused_batch`-Frames durch `KnownDaemonEvent`. Die Zustandsmaschine feuert einmal pro 75%-Aufwärtsüberschreitung (wird unter 37,5% wieder scharfgeschaltet); Verweigerungen werden einmal pro Discovery-Durchlauf im Modus `enforce` zusammengefasst.
- **Snapshot-Abfrage** (beworben via `mcp_guardrails`): `GET /workspace/mcp` und prüfen Sie die sitzungsweise Budget-Zelle (`budgets[0]`):

- `budgets[0].status === 'warning'` ⇔ `liveCount >= 0.75 * clientBudget` (entspricht der Hystereseschwelle, die PR 14bs Push-Ereignis verwenden wird).
- `budgets[0].status === 'error'` ⇔ `refusedCount > 0` (ein oder mehrere Server wurden bei diesem Discovery-Durchlauf verweigert).
- `budgets[0].status === 'ok'` ⇔ unter der 75%-Schwelle UND keine Verweigerungen.

Empfohlenes Abfrageintervall: abgestimmt auf das, was bereits `/workspace/mcp` abfragt; der Snapshot ist günstig und die Budget-Zelle verursacht keine zusätzlichen Discovery-Kosten. SDK-Clients, die Push-Ereignisse abonnieren, profitieren dennoch vom Snapshot für den Zustand nach längerer Trennung (die SSE-Wiedergabering-Tiefe ist begrenzt – `--event-ring-size`, Standard 8000 – daher fällt ein Client, der länger offline ist als die Ringabdeckung, auf eine Snapshot-Neusynchronisation zurück).

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

`level` ist einer von `project`, `user`, `extension` oder `bundled`. `errors` wird weggelassen, wenn die Discovery erfolgreich ist.

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
Modelle sind nach Authentifizierungstyp gruppiert. Die Diagnose der Provider-Verbindung erfolgt in der Zelle `providers` unter `/workspace/preflight`; die Umgebungsvorabprüfung befindet sich unter `/workspace/preflight` und `/workspace/env` (unten). `errors` wird weggelassen, wenn die Snapshot-Konstruktion erfolgreich ist.

### `GET /workspace/env`

Meldet die Laufzeit, die Plattform, die Sandbox, den Proxy und das **Vorhandensein** von whitelistierten geheimen Umgebungsvariablen des Daemon-Prozesses. Antwortet immer aus dem `process.*`-Zustand – der Daemon startet niemals ein ACP-Kind, um diese Route zu bedienen, und die Antwort ist identisch, egal ob ACP aktiv oder im Leerlauf ist. Das Feld `acpChannelLive` dient nur der Information.

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

Zellform:

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

**Schwärzungsrichtlinie.** Zellen vom Typ `kind: 'env_var'` enthalten niemals ein `value`-Feld; Clients sehen nur `present: boolean`. Zellen vom Typ `kind: 'proxy'` durchlaufen den rohen Umgebungsvariablenwert eine Anmeldedatenschwärzung (`redactProxyCredentials`) und dann eine `URL`-Analyse, sodass auf der Leitung nur `host:port` übertragen wird. `NO_PROXY` wird unverändert durch die Schwärzung geleitet, da es sich um eine Host-Liste und nicht um eine URL handelt. Die Whitelist der aufgezählten geheimen Umgebungsvariablen umfasst derzeit `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GEMINI_API_KEY`, `GOOGLE_API_KEY`, `DASHSCOPE_API_KEY`, `OPENROUTER_API_KEY` und `QWEN_SERVER_TOKEN`. Andere Umgebungsvariablen werden nicht aufgelistet, sodass versehentlich gesetzte Geheimnisse unsichtbar bleiben.

### `GET /workspace/preflight`

Meldet Bereitschaftsprüfungen des Daemons. **Daemon-Ebene-Zellen** (`node_version`, `cli_entry`, `workspace_dir`, `ripgrep`, `git`, `npm`) werden immer aus `process.*` und `node:fs` befüllt. **ACP-Ebene-Zellen** (`auth`, `mcp_discovery`, `skills`, `providers`, `tool_registry`, `egress`) erfordern ein lebendes ACP-Kind – wenn der Daemon im Leerlauf ist, geben sie Platzhalter mit `status: 'not_started'` aus. Die Route startet niemals ACP nur zum Befüllen von Zellen; die entsprechenden Zellen fallen auf `not_started` zurück.

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
Zellenform:

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

`errorKind` Semantik:

- `missing_binary` — Node-Version unterhalb der Anforderung, fehlende `QWEN_CLI_ENTRY`, ripgrep / git / npm nicht im PATH (Warnungen, keine Fehler für die optionalen Binärdateien).
- `missing_file` — `boundWorkspace` existiert nicht oder ist kein Verzeichnis; Skill-Parse-Fehler, der auf eine fehlende oder nicht lesbare Datei verweist.
- `parse_error` — `SKILL.md`-Parsefehler, fehlerhaftes Konfigurations-JSON.
- `auth_env_error` — `validateAuthMethod` hat einen nicht-null Fehlerstring zurückgegeben, oder eine `ModelConfigError`-Unterklasse, die von der Provider-Auflösung weitergegeben wurde.
- `init_timeout` — `withTimeout`-Ablehnung in der Bridge (eine tatsächliche Zeitüberschreitung beim Warten auf einen ACP-Roundtrip). Erkannt über die `BridgeTimeoutError`-Typklasse. Hinweis: Eine vorübergehende `mcp_discovery`-`warning`-Zelle mit `connecting > 0` trägt NICHT diese Art – das ist ein normaler Handshake-im-Gange-Zustand, unterschieden von einer echten Zeitüberschreitung.
- `protocol_error` — ACP `extMethod` wurde abgelehnt, weil der Kanal mitten in der Anfrage geschlossen wurde oder weil das Tool-Registry unerwartet nicht vorhanden war.
- `blocked_egress` — reserviert für PR 14 (#4175). PR 13 belässt die `egress`-Zelle als `status: 'not_started'`.

Wenn die Bridge während der Bearbeitung einer Preflight-Anfrage das ACP-Child nicht erreichen kann (z.B. eine Kanal-Schließung mitten in der Anfrage), enthält das `errors`-Array des Envelopes eine einzelne `ServeStatusCell`, die den Fehler beschreibt, und die Zellen fallen auf `not_started`-ACP-Platzhalter zurück. Daemon-Ebene-Zellen werden weiterhin zurückgegeben.

### Dateipfade im Arbeitsbereich

Alle Dateipfade werden durch den gebundenen Arbeitsbereich des Daemon aufgelöst. Antworten verwenden arbeitsbereichsrelative Pfade und geben bei normalen Erfolgsfällen niemals absolute Dateisystempfade zurück. Erfolgreiche Dateiantworten enthalten:

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

`errorKind`-Werte umfassen `path_outside_workspace`, `symlink_escape`, `path_not_found`, `binary_file`, `file_too_large`, `untrusted_workspace`, `permission_denied`, `parse_error`, `hash_mismatch`, `file_already_exists`, `text_not_found` und `ambiguous_text_match`.

#### `GET /file`

Liest eine Textdatei. Query-Parameter: `path` (erforderlich), `maxBytes`, `line` und `limit`. Der Daemon lehnt Binärdateien und Dateien ab, die über dem Textleselimit liegen. Die Antwort enthält `hash`, einen SHA-256-Digest über die rohen Bytes auf der Festplatte für die gesamte Datei, auch wenn `line`, `limit` oder `maxBytes` einen Teil zurückgegeben haben.

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

Liest Rohbytes aus einer Datei ohne Dekodierung. Query-Parameter: `path` (erforderlich), `offset` (Standard `0`) und `maxBytes` (Standard `65536`, max `262144`). Diese Route unterstützt begrenzte Fenster auf große Binärdateien, ohne die gesamte Datei einzulesen. Die Antwort enthält `hash` nur, wenn das zurückgegebene Fenster die gesamte Datei abdeckt.

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

Erstellt oder ersetzt eine Textdatei. Dies ist eine strikte Mutationsroute: Bei Loopback ohne konfiguriertes Token wird `401 { "code": "token_required" }` zurückgegeben. Mit `--require-auth` lehnt die globale Bearer-Middleware unauthentifizierte Anfragen ab, bevor die Route ausgeführt wird.

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

`mode` muss `create` oder `replace` sein. `create` überschreibt niemals eine vorhandene Datei (`409 file_already_exists`). `replace` erfordert `expectedHash`; fehlende oder fehlerhafte Hashes sind `400 parse_error`, und veraltete Hashes sind `409 hash_mismatch`. `expectedHash` ist `sha256:` plus 64 hexadezimale Kleinbuchstaben, berechnet über die rohen Bytes auf der Festplatte.

`bom`, `encoding` und `lineEnding` können angegeben werden. Ersetzung behält standardmäßig das bestehende Kodierungsprofil der Datei bei; explizite Felder überschreiben es. Binäre Schreibvorgänge sind nicht im Geltungsbereich.

Der Daemon schreibt in eine zufällige temporäre Datei im Zielverzeichnis, führt fsync aus, wo unterstützt, überprüft den aktuellen Hash unmittelbar vor dem `rename()` und benennt dann an die Stelle um. Dies verhindert die Beobachtung von Teildateien und serialisiert vom Daemon ausgehende Schreibvorgänge auf dieselbe Datei, aber es ist kein prozessübergreifender Kernel-Compare-and-Swap: Ein externer Editor kann immer noch in dem kleinen Fenster zwischen der endgültigen Hash-Prüfung und dem Umbenennen konkurrieren.
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

Wendet eine exakte Textersetzung auf eine vorhandene Textdatei an. Auch dies ist ein strikter Mutationsendpunkt und erfordert `expectedHash`.

```json
{
  "path": "src/config.ts",
  "oldText": "timeout: 30000",
  "newText": "timeout: 60000",
  "expectedHash": "sha256:..."
}
```

`oldText` muss nicht-leer sein und genau einmal vorkommen. Keine Übereinstimmung gibt `422 text_not_found` zurück; mehrere Übereinstimmungen geben `422 ambiguous_text_match` zurück. Der Endpunkt bewahrt Kodierung, BOM und Zeilenenden und überprüft `expectedHash` unmittelbar vor der atomaren Umbenennung erneut.

Explizite Schreib-/Bearbeitungsvorgänge auf ignorierten Pfaden sind erlaubt, da der authentifizierte Aufrufer den Pfad benannt hat. Erfolgsantworten und Audit-Ereignisse enthalten `matchedIgnore: "file" | "directory" | null`.

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

`state` spiegelt dieselben ACP-Modell-/Modus-/Konfigurationsoptions-Formen wider, die von `POST /session`, `POST /session/:id/load` und `POST /session/:id/resume` verwendet werden.

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

`availableCommands` ist derselbe Befehls-Snapshot, der von der `available_commands_update`-SSE-Benachrichtigung verwendet wird. `availableSkills` listet nur Skill-Namen auf; Clients sollten über diese Route keine Skill-Textkörper oder -Pfade erwarten.

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

Diese Route ist ein schreibgeschützter Out-of-Band-Snapshot. Sie ist bewusst kein Prompt und kann abgefragt werden, während die Session streamt. Die Antwort enthält nur zugelassene Metadaten aus den Agenten-, Shell- und Monitor-Task-Registries; Controller, Timer, Offsets, ausstehende Nachrichten und rohe Registry-Objekte werden nie offengelegt.

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

`status` ist einer von `NOT_STARTED`, `IN_PROGRESS`, `READY` oder `FAILED`. Optionales `error` ist bei fehlgeschlagenen Servern vorhanden, falls verfügbar. Deaktiviertes LSP (einschließlich Bare-Mode) gibt HTTP 200 mit `enabled: false`, Nullzählwerten und `servers: []` zurück. LSP aktiviert ohne konfigurierte Server gibt `enabled: true`, `configuredServers: 0` und `servers: []` zurück. Falls die Initialisierung fehlschlägt, bevor der Client existiert, kann die Antwort `initializationError` enthalten; falls ein Live-Client keinen Snapshot bereitstellen kann, enthält die Antwort `statusUnavailable: true`.

Diese Route legt nur stabile, clientseitige Felder offen. Sie lässt bewusst Debug-Interna wie Prozess-IDs, Spawn-Argumente, stderr-Auszüge, Root-URIs und Workspace-Ordnerpfade aus.

### `POST /session`

Einen neuen Agenten starten oder an einen vorhandenen anhängen (unter `sessionScope: 'single'`, der Standardeinstellung).

Request:

```json
{
  "cwd": "/absolute/path/to/workspace",
  "modelServiceId": "qwen-prod",
  "sessionScope": "thread"
}
```

| Feld               | Erforderlich | Anmerkungen                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ------------------- | ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `cwd`               | nein        | Absoluter Pfad, der mit dem gebundenen Workspace des Daemons übereinstimmt. Wenn ausgelassen, fällt die Route auf `boundWorkspace` zurück (lesen Sie es von `/capabilities.workspaceCwd` ab). Ein nicht übereinstimmender, nicht leerer `cwd` gibt `400 workspace_mismatch` zurück (#3803 §02 — 1 Daemon = 1 Workspace). Workspace-Pfade werden über `realpathSync.native` kanonisiert (mit einem reinen Auflösungs-Fallback für nicht existierende Pfade), sodass case-insensitive Dateisysteme Sessions nicht aufgrund der Schreibweise ablehnen.                                                                                  |
| `modelServiceId`    | nein        | Wählt aus, welcher konfigurierte _Model Service_ (der Backend-Anbieter – Alibaba ModelStudio, OpenRouter usw.) vom Agenten verwendet wird. Wenn ausgelassen, verwendet der Agent seinen Standardwert. Falls der Workspace bereits eine Session hat, ruft dies `setSessionModel` auf der bestehenden auf und sendet `model_switched`. Unterscheidet sich von `modelId` auf `POST /session/:id/model`, welches das Modell **innerhalb** eines bereits gebundenen Dienstes auswählt. Das `modelServices`-Array unter `/capabilities` ist für die Anzeige konfigurierter Dienste reserviert; in Stufe 1 ist es immer `[]` (der Standarddienst des Agenten wird verwendet und nicht über HTTP aufgezählt). |
| `sessionScope`      | nein        | Überschreibung pro Anfrage für die Session-Weitergabe. `'single'` (der daemonweite Standard) bewirkt, dass ein zweites `POST /session` im selben Workspace die vorhandene Session wiederverwendet (`attached: true`); `'thread'` erzwingt bei jedem Aufruf eine neue, eigenständige Session. Wenn ausgelassen, wird der daemonweite Standard geerbt. Werte außerhalb der Enumeration geben `400 { code: 'invalid_session_scope' }` zurück. Alte Daemons (vor #4175 PR 5) ignorieren das Feld stillschweigend – vor dem Senden `caps.features.session_scope_override` prüfen. Der daemonweite Standard ist in der Produktion derzeit fest auf `'single'` codiert; #4175 könnte in einem Folge-Update ein CLI-Flag `--sessionScope` hinzufügen.      |
```json
{
  "sessionId": "<uuid>",
  "workspaceCwd": "/canonical/path",
  "attached": false
}
```

`attached: true` bedeutet, dass für diesen Workspace bereits eine Sitzung existierte und Sie diese nun teilen.

Gleichzeitige `POST /session`-Aufrufe für denselben Workspace werden **zu einem einzigen Spawn zusammengefasst** – beide Aufrufer erhalten die gleiche `sessionId`, genau einer meldet `attached: false`. Schlägt der zugrundeliegende Spawn fehl (Init-Timeout, fehlerhafte Agent-Ausgabe, OOM), **erhalten alle zusammengefassten Aufrufer denselben Fehler** – der laufende Slot wird geleert, sodass ein Folgeaufruf einen vollständigen Neustart versuchen kann.

> ⚠️ **Die Ablehnung einer `modelServiceId` bei einer neuen Sitzung erfolgt stillschweigend in der
> HTTP-Antwort.** Eine ungültige `modelServiceId` (Tippfehler, nicht konfigurierter Dienst)
> führt NICHT zu einem 500-Fehler beim Erstellen – die Sitzung bleibt mit dem
> Standardmodell des Agenten betriebsbereit, sodass der Aufrufer weiterhin eine `sessionId` erhält,
> gegen die er den Modellwechsel erneut versuchen kann (via `POST /session/:id/model`).
> Das sichtbare Fehlersignal ist ein `model_switch_failed`-Ereignis auf dem
> SSE-Stream der Sitzung, das zwischen dem Spawn-Handshake und Ihrem
> ersten Subscribe ausgelöst wird. **Abonnenten, die dieses Ereignis beobachten müssen,
> sollten bei ihrem ersten `GET /session/:id/events` den Header `Last-Event-ID: 0` mitgeben**,
> um vom ältesten verfügbaren Ereignis des Rings abzuspielen (deckt das Spawn-Zeit
> `model_switch_failed` ab, selbst wenn der Subscribe einige ms nach der Create-Antwort eintrifft).

### `POST /session/:id/load`

Stellt eine persistierte ACP-Sitzung anhand ihrer ID wieder her und spielt deren Verlauf über SSE ab. Die Pfad-ID ist maßgeblich; ein eventuelles `sessionId`-Feld im Body wird ignoriert. Voraussetzung prüfen: `caps.features.session_load` – ältere Daemons geben für diese Route `404` zurück.

Anfrage:

```json
{
  "cwd": "/absolute/path/to/workspace"
}
```

| Feld  | Erforderlich | Hinweise                                                                                                                                                                                                                           |
| ----- | ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `cwd` | nein         | Gleiche Kanonisierung + `workspace_mismatch`-Regeln wie bei `POST /session`. Weglassen, um `/capabilities.workspaceCwd` zu übernehmen. `mcpServers` wird hier absichtlich NICHT akzeptiert – daemonweites MCP ist settingsgesteuert (entspricht `POST /session`). |

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

`state` spiegelt ACPs `LoadSessionResponse` wider – `models` ist ein `SessionModelState`, `modes` ein `SessionModeState`, `configOptions` ein Array von `SessionConfigOption`. Fehlende Felder werden vom Agenten bestimmt. Späte Beitreter (die `attached: true`-Pfade unten) erhalten den GLEICHEN `state`-Snapshot, den der ursprüngliche Load-Aufrufer gesehen hat – der Daemon cached ihn beim Eintrag; Laufzeitmutationen (z. B. `model_switched`) werden auf dem SSE-Stream zugestellt, nicht in späteren Attach-Antworten.

`attached: true` bedeutet, dass die Sitzung bereits aktiv war (entweder durch einen vorherigen `session/load`/`session/resume` oder weil ein zusammengefasster gleichzeitiger Aufrufer knapp voraus war).

**Verlaufswiedergabe über SSE.** Während `loadSession` auf der Agentenseite ausgeführt wird, sendet der Agent für jede persistierte Runde eine `session_update`-Benachrichtigung. Der Daemon puffert sie im Ereignisbus der Sitzung, bevor die Routenantwort zurückkommt, sodass Abonnenten, die sofort `GET /session/:id/events` mit `Last-Event-ID: 0` aufrufen, die vollständige Wiedergabe sehen. **Der Wiedergabering ist begrenzt** (Standard 8000 Frames pro Sitzung). Lange Verläufe mit vielen Tool-Call-/Thought-Stream-Runden können diese Grenze überschreiten – die ältesten Frames werden stillschweigend verworfen. Clients, die den vollständigen Verlauf benötigen, sollten sofort nach der Rückkehr von `load` abonnieren; alternativ können sie die SSE-Ereignis-IDs persistieren und mit `Last-Event-ID` ab einer späteren Rundengrenze fortsetzen.

**Fehler:**

- `404` – persistierte Sitzungs-ID existiert nicht (`SessionNotFoundError`).
- `400` – `workspace_mismatch` (gleiche Form wie bei `POST /session`).
- `503` – `session_limit_exceeded` (zählt gegen `--max-sessions`; laufende Wiederherstellungen werden ebenfalls berücksichtigt).
- `409` – `restore_in_progress` (für dieselbe ID ist bereits ein `session/resume` im Gange). `Retry-After: 5`. Gleichartige Rennen (zwei gleichzeitige `session/load` für dieselbe ID) werden zusammengefasst – genau einer gibt `attached: false` zurück, die restlichen geben `attached: true` mit demselben `state` zurück.

### `POST /session/:id/resume`

Stellt eine persistierte ACP-Sitzung anhand ihrer ID wieder her, OHNE den Verlauf über SSE abzuspielen. Der Modellkontext wird intern auf der Agentenseite wiederhergestellt (via `geminiClient.initialize`, das `config.getResumedSessionData` liest); der SSE-Stream bleibt sauber für Clients, die den Verlauf bereits gerendert haben. Voraussetzung prüfen: `caps.features.session_resume`; `unstable_session_resume` bleibt ein veraltetes Kompatibilitätsalias für ältere Clients.

Gleiches Anfrageformat wie bei `/load`. Gleiches Antwortformat – `state` spiegelt ACPs `ResumeSessionResponse` wider. Gleicher Fehler-Envelope, einschließlich `409 restore_in_progress` (das ausgelöst wird, wenn ein `session/load` im Gange ist; `session/resume`, das hinter einem anderen `session/resume` herläuft, wird zusammengefasst).
Verwenden Sie `/load`, wenn der Client keinen Verlauf gerendert hat (kalte Wiederverbindung, Picker → öffnen). Verwenden Sie `/resume`, wenn der Client die Turns bereits auf dem Bildschirm hat und nur das serverseitige Handle wiederherstellen muss.

> ⚠️ **Warum wird `unstable_session_resume` noch beworben?** Die HTTP-Route des Daemons und die `session_resume`-Fähigkeit sind für v1 stabil, aber die Bridge ruft immer noch `connection.unstable_resumeSession` von ACP auf. Das alte Tag bleibt nur bestehen, damit SDKs, die vor `session_resume` ausgeliefert wurden, weiterhin funktionieren.

### `GET /workspace/:id/sessions`

Listet alle aktiven Sitzungen auf, deren kanonischer Arbeitsbereich mit `:id` (URL-kodiertes absolutes aktuelles Arbeitsverzeichnis) übereinstimmt.

```bash
curl http://127.0.0.1:4170/workspace/$(jq -rn --arg c "$PWD" '$c|@uri')/sessions
```

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
      "hasActivePrompt": false
    }
  ]
}
```

Leeres Array (nicht 404), wenn keine Sitzungen existieren – eine Sitzungsauswahl-Oberfläche sollte nicht allein deshalb einen Fehler werfen, weil der Arbeitsbereich inaktiv ist.

### `POST /session/:id/prompt`

Leitet eine Eingabeaufforderung an den Agenten weiter. Mehrfache Eingabeaufforderungen pro Sitzung werden in einer FIFO-Warteschlange verarbeitet (ACP garantiert eine aktive Eingabeaufforderung pro Sitzung).

Anfrage:

```json
{
  "prompt": [{ "type": "text", "text": "Was macht src/main.ts?" }]
}
```

Validierung: `prompt` muss ein nicht-leeres Array von Objekten sein. Andere Fehler geben `400` zurück, bevor die Bridge erreicht wird.

Antwort:

```json
{ "stopReason": "end_turn" }
```

Andere Stop-Gründe: `cancelled`, `max_tokens`, `error`, `length` (gemäß ACP-Spezifikation).

Wenn der HTTP-Client während einer Eingabeaufforderung die Verbindung trennt, sendet der Daemon eine ACP `cancel`-Benachrichtigung an den Agenten, der die Eingabeaufforderung mit `stopReason: "cancelled"` beendet.

> **Stufe-1-Einschränkung – kein serverseitiges Prompt-Timeout.** Die Bridge
> wartet lediglich auf das `prompt()` des Agenten gegen `transportClosedReject`
> (Absturz des Agenten-Kindprozesses) und das HTTP-Verbindungsabbruch-
> AbortSignal des Aufrufers. Ein blockierter, aber noch lebender Agent (z. B. ein
> hängender Modellaufruf) blockiert die FIFO-Warteschlange pro Sitzung, bis der
> HTTP-Client seinerseits ein Timeout setzt und die Verbindung trennt.
> Langlaufende Eingabeaufforderungen sind legitim (Tiefenrecherche,
> Analyse großer Codebasen), daher wird bewusst kein Standard-Timeout
> gesetzt; Stufe 2 wird ein konfigurierbares
> `promptTimeoutMs` als Opt-in bereitstellen. Bis dahin sollten Aufrufer
> ihr eigenes clientseitiges Timeout setzen und bei Ablauf die Verbindung trennen
> (oder `POST /session/:id/cancel` aufrufen).

### `POST /session/:id/cancel`

Bricht die **derzeit aktive** Eingabeaufforderung in der Sitzung ab. Auf ACP-Seite ist dies eine Benachrichtigung, keine Anfrage – der Agent bestätigt den Abbruch, indem er das aktive `prompt()` mit `cancelled` auflöst.

```bash
curl -X POST http://127.0.0.1:4170/session/$SID/cancel
# → 204 No Content
```

> **Mehrfach-Prompt-Vertrag:** cancel betrifft nur die aktive Eingabeaufforderung. Alle Eingabeaufforderungen, die derselbe Client zuvor per POST gesendet hat und die noch hinter der aktiven in der Warteschlange stehen, werden weiterhin ausgeführt. Die FIFO-Warteschlange für Eingabeaufforderungen ist ein vom Daemon eingeführtes Verhalten (nicht in der ACP-Spezifikation); der Vertrag für Eingabeaufforderungen in der Warteschlange lautet: "Sie werden weiter ausgeführt, es sei denn, Sie brechen jede einzelne ab oder beenden die Sitzung durch Kanalausstieg".

### `DELETE /session/:id`

Schließt eine aktive Sitzung explizit. Erzwingt das Schließen auch dann, wenn andere Clients verbunden sind – bricht jede aktive Eingabeaufforderung ab, löst ausstehende Berechtigungen als abgebrochen auf, veröffentlicht ein `session_closed`-Ereignis, schließt den EventBus und entfernt die Sitzung aus den Daemon-Zuordnungen. Auf der Festplatte gespeicherte Sitzungen werden NICHT gelöscht – sie können über `POST /session/:id/load` erneut geladen werden. Vorabprüfung: `caps.features.session_close`.

```bash
curl -X DELETE http://127.0.0.1:4170/session/$SID
# → 204 No Content
```

Idempotent: Gibt `404` für unbekannte Sitzungen zurück (gleiche `SessionNotFoundError`-Form wie andere Routen).

> **`session_closed`-Ereignis.** SSE-Abonnenten erhalten ein abschließendes `session_closed`-Ereignis mit `{ sessionId, reason: 'client_close', closedBy?: '<clientId>' }`, bevor der Stream endet. SDK-Reducer behandeln dies identisch zu `session_died` (setzt `alive: false`, löscht `pendingPermissions`).

### `PATCH /session/:id/metadata`

Aktualisiert änderbare Sitzungsmetadaten. Derzeit wird nur `displayName` unterstützt. Vorabprüfung: `caps.features.session_metadata`.

Anfrage:

```json
{ "displayName": "Meine Untersuchungssitzung" }
```

| Feld          | Erforderlich | Hinweise                                                                                     |
| ------------- | ------------ | -------------------------------------------------------------------------------------------- |
| `displayName` | nein         | Zeichenkette, maximal 256 Zeichen. Leere Zeichenkette löscht den Namen. Weglassen belässt es. |

Antwort:

```json
{ "sessionId": "<uuid>", "displayName": "Meine Untersuchungssitzung" }
```

Veröffentlicht ein `session_metadata_updated`-Ereignis im SSE-Stream der Sitzung mit `{ sessionId, displayName }`.

### `POST /session/:id/heartbeat`

Aktualisiert die Letztkontakt-Buchhaltung des Daemons für diese Sitzung. Langlebige Adapter (TUI/IDE/Web) senden dies in einem Intervall, damit eine zukünftige Sperrrichtlinie (Wave 5 PR 24) tote Clients von ruhigen unterscheiden kann.
| Header             | Required | Notes                                                                                                                                                                                                                                   |
| ------------------ | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `X-Qwen-Client-Id` | no       | Gibt die vom Daemon ausgestellte ID aus `POST /session` zurück. Identifizierte Clients aktualisieren auch ihren client-spezifischen Zeitstempel; anonyme Heartbeats aktualisieren nur den session-weiten Wasserstand. Muss das gleiche `[A-Za-z0-9._:-]{1,128}`-Format wie anderswo erfüllen. |

Der Anforderungstext ist leer (`{}` ist in Ordnung — aktuell werden keine Felder gelesen).

Antwort:

```json
{
  "sessionId": "<sid>",
  "clientId": "<cid>",
  "lastSeenAt": 1700000000123
}
```

`clientId` wird nur zurückgegeben, wenn eine vertrauenswürdige `X-Qwen-Client-Id` mitgesendet wurde. `lastSeenAt` ist der vom Daemon-seitige `Date.now()`-Zeitstempel (ms), den die Bridge gespeichert hat.

Fehler:

- `400` — `{ code: 'invalid_client_id' }`, wenn der Header fehlerhaft ist (Header-Format-Regel) oder wenn er eine `clientId` enthält, die nicht für diese Session registriert ist (die Bridge wirft `InvalidClientIdError`, bevor sie einen Zeitstempel aktualisiert).
- `404` — unbekannte Session.

Capability-Prüfung: Vorabprüfung `caps.features.client_heartbeat`. Ältere Daemons geben für diesen Pfad `404` zurück.

### `POST /session/:id/model`

Wechselt das aktive Modell **innerhalb** des aktuell an die Session gebundenen Modell-Dienstes. Serialisiert über die sessionspezifische Modellwechsel-Warteschlange.

(Für das Wechseln des _Dienstes_ selbst – Alibaba ModelStudio vs OpenRouter etc. – übergeben Sie `modelServiceId` bei `POST /session` für eine neue Session. Phase 1 hat keine Live-Dienstwechsel-Route.)

Anforderung:

```json
{ "modelId": "qwen-staging" }
```

Antwort:

```json
{ "modelId": "qwen-staging" }
```

Bei Erfolg veröffentlicht sie `model_switched` im SSE-Stream. Bei Fehlschlag veröffentlicht sie `model_switch_failed` (damit passive Abonnenten den Fehler sehen, nicht nur der Aufrufer). Sie läuft gegen den Ausstieg des Agentenkanals, damit ein festgefahrener Child den HTTP-Handler nicht blockieren kann.

### `POST /session/:id/recap`

Capability-Tag: `session_recap`. Bridge → ACP extMethod `qwen/control/session/recap`.

Erzeugt eine einzeilige Zusammenfassung „Wo bin ich stehengeblieben?" der Session. Kapselt den Kern `generateSessionRecap` (`packages/core/src/services/sessionRecap.ts`), der eine Nebenabfrage gegen das schnelle Modell mit deaktivierten Tools, `maxOutputTokens: 300` und einem strikten `<recap>...</recap>`-Ausgabeformat durchführt. Die Nebenabfrage liest den vorhandenen GeminiClient-Chatverlauf der Session und fügt ihm **nichts** hinzu.

Der Anforderungstext wird ignoriert (senden Sie `{}` oder leer). Nicht-striktes Mutations-Gate – die Haltung spiegelt `/session/:id/prompt` wider (der Aufruf kostet Token, mutiert aber keinen Zustand). Es wird kein SSE-Ereignis veröffentlicht.

Antwort (200):

```json
{
  "sessionId": "sess:42",
  "recap": "Debugging the auth retry race. Next: add deterministic timing to the integration test."
}
```

`recap` ist `null` (ein normaler 200, kein Fehler), wenn:

- die Session noch weniger als zwei Dialogrunden hat,
- die Nebenabfrage keine extrahierbare `<recap>...</recap>`-Nutzlast zurückgegeben hat,
- oder ein zugrunde liegender Modellfehler aufgetreten ist (der Kern-Helfer ist bestmöglich und wirft nie).

Fehler:

- `400 {code: 'invalid_client_id'}` — fehlerhafter `X-Qwen-Client-Id`-Header.
- `404` — Session unbekannt.

Abbruch: **keiner in v1**. Die Route horcht nicht auf HTTP-Client-Trennung, es wird kein `AbortSignal` in die Bridge geleitet, und der ACP-Child führt die Nebenabfrage unabhängig davon aus, ob der Aufrufer getrennt hat, zu Ende. Die einzigen Grenzen sind das 60s-Hintergrund-Timeout der Bridge (`SESSION_RECAP_TIMEOUT_MS`) und der Wettlauf gegen den ACP-Kanal-Tod bei Transport-Schließung. Dies ist akzeptabel, da Recap kurz ist (einzelner Versuch, `maxOutputTokens: 300`, typisch ~1–5s); eine anforderungs-ID-basierte Cancel-Ext-Methode kann in einer zukünftigen Version vollständige Ende-zu-Ende-Abbrechbarkeit einbauen, falls die Bandbreitenkosten dies jemals rechtfertigen.

### Mutation: Zulassung, Tools, Init, MCP-Neustart

Issue [#4175](https://github.com/QwenLM/qwen-code/issues/4175) Wave 4 PR 17 fügt vier Mutations-Steuerungsrouten hinzu, die es entfernten Clients ermöglichen, das Laufzeitverhalten zu ändern, ohne die CLI des Daemon-Hosts zu berühren. Alle vier:

- Sind durch das **strikte** Mutations-Gate aus PR 15 geschützt. Ein Daemon, der ohne Bearer-Token konfiguriert ist, lehnt sie mit `401 {code: 'token_required'}` ab. Konfigurieren Sie `--token` (oder `QWEN_SERVER_TOKEN`), bevor Sie teilnehmen.
- Akzeptieren und stempeln den `X-Qwen-Client-Id`-Header (PR 7 Audit-Kette). Wenn der Header eine vertrauenswürdige ID enthält, gibt der Daemon `originatorClientId` im entsprechenden SSE-Ereignis aus, sodass clientübergreifende UIs Echos ihrer eigenen Mutationen unterdrücken können.
- Führen für jede Tag-spezifische Capability eine Vorabprüfung durch, bevor die Funktionalität bereitgestellt wird. Ältere Daemons geben für die Route `404` zurück.

Drei der vier Routen (`tools/:name/enable`, `init`, `mcp/:server/restart`) geben **arbeitsbereichsbezogene** Ereignisse aus: Jeder aktive Session-SSE-Bus empfängt das Ereignis, unabhängig davon, welche Session beim Auslösen der Mutation verbunden war. `approval-mode` gibt ein **sessionsbezogenes** Ereignis aus, da die Änderung lokal für die `Config` einer Session ist.
#### `POST /session/:id/approval-mode`

Capability-Tag: `session_approval_mode_control`. Bridge → ACP extMethod `qwen/control/session/approval_mode`.

Ändert den Genehmigungsmodus einer aktiven Sitzung. Der neue Modus wird sofort in der pro-Sitzung `Config` des ACP-Kindes übernommen. Einstellungen werden standardmäßig NICHT auf die Festplatte geschrieben — übergeben Sie `persist: true`, um auch `tools.approvalMode` in die Workspace-Einstellungen zu schreiben.

Request:

```json
{ "mode": "auto-edit", "persist": false }
```

`mode` muss einer von `'plan' | 'default' | 'auto-edit' | 'auto' | 'yolo'` sein (Spiegelung des `ApprovalMode`-Enums des Kerns; das SDK exportiert `DAEMON_APPROVAL_MODES` für die Laufzeitvalidierung). `persist` hat den Standardwert `false`.

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

- `400 {code: 'invalid_approval_mode', allowed: [...]}` — unbekannter Modus-Wert.
- `400 {code: 'invalid_persist_flag'}` — `persist` ist nicht boolesch.
- `403 {code: 'trust_gate', errorKind: 'auth_env_error'}` — der angeforderte Modus erfordert einen vertrauenswürdigen Ordner (privilegierte Modi in nicht vertrauenswürdigen Workspaces werden von der `Config.setApprovalMode` des Kerns abgelehnt).
- `404` — Sitzung unbekannt.

SSE-Ereignis (sitzungsbezogen): `approval_mode_changed` mit `{sessionId, previous, next, persisted, originatorClientId?}`.

#### `POST /workspace/tools/:name/enable`

Capability-Tag: `workspace_tool_toggle`. Reine Datei-IO — kein ACP-Roundtrip.

Schaltet einen Tool-Namen in der `tools.disabled`-Einstellungsliste des Workspace um. Tools, die dort aufgeführt sind, werden **überhaupt nicht registriert** (anders als `permissions.deny`, das das Tool registriert hält und den Aufruf ablehnt). Sowohl eingebaute Tools als auch MCP-entdeckte Tools durchlaufen `ToolRegistry.registerTool`, das die deaktivierte Menge konsultiert.

> ⚠️ **Namen müssen exakt mit dem freigelegten Bezeichner der Registry übereinstimmen.** Es findet keine Aliasauflösung statt — die Route speichert den String aus dem Pfadparameter unverändert in `tools.disabled`, und das nächste ACP-Kind vergleicht ihn zur Registrierungszeit mit `tool.name`. Eingebaute Tools verwenden ihren kanonischen Registry-Namen (snake_case-Verbform): `run_shell_command`, `read_file`, `write_file`, `list_directory`, `glob`, `grep_search`, `web_fetch`, usw. — NICHT die Anzeigelabel (`Shell`, `Read`, `Write`), die die CLI anzeigt. MCP-entdeckte Tools verwenden die qualifizierte Form `mcp__<server>__<name>` (dies ist auch die Form, die `tool_toggled`-Events senden und die `GET /workspace/mcp` auflistet). Das Deaktivieren von `Bash` verhindert NICHT, dass `run_shell_command` bei der nächsten Sitzung registriert wird.

Bereits registrierte Tools bleiben in aktiven ACP-Kindern erhalten — der Umschalter wirkt sich erst beim **nächsten** ACP-Kind-Spawn aus. Kombinieren Sie mit `POST /workspace/mcp/:server/restart` (für MCP-basierte Tools) oder der Erstellung einer neuen Sitzung, um die Änderung im aktuellen Daemon wirksam zu machen.

Unbekannte Tool-Namen werden akzeptiert: Das vorherige Deaktivieren eines noch nicht installierten MCP-Tools ist ein legitimer Anwendungsfall.

Request:

```json
{ "enabled": false }
```

Response (200):

```json
{ "toolName": "run_shell_command", "enabled": false }
```

Fehler:

- `400 {code: 'invalid_tool_name'}` — leerer Pfadparameter oder Pfadparameter überschreitet das 256-Zeichen-Limit.
- `400 {code: 'invalid_enabled_flag'}` — `enabled` fehlt oder ist nicht boolesch.

SSE-Ereignis (workspace-bezogen): `tool_toggled` mit `{toolName, enabled, originatorClientId?}`.

#### `POST /workspace/init`

Capability-Tag: `workspace_init`. Reine Datei-IO — kein ACP-Roundtrip, **kein LLM-Aufruf**.

Erstellt eine leere `QWEN.md` (oder was immer `getCurrentGeminiMdFilename()` unter `--memory-file-name`-Überschreibungen zurückgibt) im gebundenen Workspace-Root des Daemon. Nur mechanisch — für KI-gestützte Inhaltsbefüllung, folgen Sie mit `POST /session/:id/prompt`.

Standardmäßig wird das Überschreiben verweigert, wenn die Zieldatei mit nicht-Leerzeichen-Inhalt existiert. Dateien, die nur Leerzeichen enthalten, werden als nicht vorhanden behandelt (entspricht dem lokalen `/init`-Schrägstrichbefehl).

Request:

```json
{ "force": false }
```

Response (200):

```json
{ "path": "/work/bound/QWEN.md", "action": "created" }
```

`action` ist `'created'` für Neuereugungen, `'noop'`, wenn eine vorhandene, nur Leerzeichen enthaltende Datei unberührt gelassen wurde (kein Schreibvorgang), und `'overwrote'`, wenn `force: true` nicht-leeren Inhalt ersetzt hat. Das SSE-Ereignis `workspace_initialized` spiegelt die Response-Aktion wider — Beobachter können auf `action !== 'noop'` filtern, um nur auf tatsächliche Änderungen auf der Festplatte zu reagieren.

Fehler:

- `400 {code: 'invalid_force_flag'}` — `force` ist nicht boolesch.
- `409 {code: 'workspace_init_conflict', path, existingSize}` — Datei existiert mit nicht-Leerzeichen-Inhalt und `force` wird weggelassen/ist `false`. Der Body enthält den absoluten Pfad und die Größe (Bytes), sodass SDK-Clients eine „N Bytes überschreiben?"-Aufforderung rendern können, ohne erneut `stat` aufrufen zu müssen.

SSE-Ereignis (workspace-bezogen): `workspace_initialized` mit `{path, action, originatorClientId?}`.

#### `POST /workspace/mcp/:server/restart`

Capability-Tag: `workspace_mcp_restart`. Bridge → ACP extMethod `qwen/control/workspace/mcp/restart`.

Startet einen konfigurierten MCP-Server über das `McpClientManager.discoverMcpToolsForServer` des ACP-Kindes neu (Trennen + Wiederverbinden + Wiederentdecken). Überprüft vorab den Live-Budget-Snapshot aus der Buchhaltung von PR 14 v1, sodass ein Neustart in einem budget-gesättigten Workspace eine weiche Ablehnung zurückgibt, anstatt eine `BudgetExhaustedError`-Kaskade auszulösen.
Der Anforderungsrumpf ist leer (`{}`). Der Pfadparameter ist der URL-kodierte Servername, wie er in der `mcpServers`-Konfiguration erscheint.

Antwort (200) – diskriminierte Union basierend auf `restarted`:

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

Weiche Ablehnungsgründe (alle geben 200 zurück):

| `reason`                | Bedeutung                                                                                                                                                                               |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `'in_flight'`           | Eine weitere Ermittlung / ein Neustart für diesen Server ist bereits im Gange. Die Route wird sofort zurückgegeben, ohne auf das ursprüngliche Promise zu warten. Der Aufrufer sollte es nach einer kurzen Verzögerung erneut versuchen. |
| `'disabled'`            | Der Server ist konfiguriert, aber in `excludedMcpServers` aufgeführt. Vor dem Neustart aktivieren.                                                                                      |
| `'budget_would_exceed'` | Der Daemon ist im Modus `--mcp-budget-mode=enforce`, der Zielserver befindet sich nicht in `reservedSlots` und die Live-Summe hat `clientBudget` erreicht. Der Aufrufer sollte zuerst einen Slot freigeben. |

Fehler (nicht 2xx):

- `400 {code: 'invalid_server_name'}` – leerer Pfadparameter.
- `404` – Servername nicht in der `mcpServers`-Konfiguration oder kein Live-ACP-Kanal vorhanden (Neustart erfordert grundsätzlich eine Live-`McpClientManager`-Instanz).
- `500` – interner Fehler (z. B. `ToolRegistry` nicht initialisiert).

SSE-Ereignisse (Workspace-Scope): `mcp_server_restarted` mit `{serverName, durationMs, originatorClientId?}` bei Erfolg; `mcp_server_restart_refused` mit `{serverName, reason, originatorClientId?}` bei weicher Ablehnung.

### `GET /session/:id/events` (SSE)

Den Ereignisstrom der Sitzung abonnieren.

Header:

```
Accept: text/event-stream
Last-Event-ID: 42        ← optional, replayt ab nach ID 42
```

Abfrageparameter:

| Parameter   | Erforderlich | Hinweise                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| ----------- | ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `maxQueued` | nein         | **Live-Backlog**-Obergrenze pro Abonnent. Bereich `[16, 2048]`, Standard 256. Replay-Frames, die zum Zeitpunkt des Abonnierens per Push gesendet werden, sind von der Obergrenze ausgenommen; was sie tatsächlich verbraucht, sind Live-Ereignisse, die eintreffen, während der Abonnent noch ein großes `Last-Event-ID: 0`-Replay abarbeitet. Erhöhen Sie diesen Wert für kalte Neuverbindungen, damit der Live-Tail den `slow_client_warning` / die Vertreibung nicht auslöst, bevor der Verbraucher aufgeholt hat. Werte außerhalb des Bereichs / nicht numerisch / vorhanden aber leer geben `400 invalid_max_queued` zurück, bevor der SSE-Handshake geöffnet wird. Voraussetzung: `caps.features.slow_client_warning` – ältere Daemons ignorieren den Parameter stillschweigend. |

Frame-Format. Die `data:`-Zeile ist der **vollständige Ereignis-Envelope**, als JSON-String in einer einzigen Zeile – `{id?, v, type, data, originatorClientId?}`. Die ACP-spezifische Nutzlast (`sessionUpdate`, `requestPermission`-Argumente usw.) liegt unter dem Feld `data` des Envelopes; der eigene `type` des Envelopes entspricht der SSE-`event:`-Zeile.

```
id: 7
event: session_update
data: {"id":7,"v":1,"type":"session_update","data":{"sessionUpdate":"agent_message_chunk","content":{"type":"text","text":"…"}}}

id: 8
event: permission_request
data: {"id":8,"v":1,"type":"permission_request","data":{"requestId":"<uuid>","sessionId":"<sid>","toolCall":{...},"options":[...]}}

: heartbeat              ← alle 15s, keine Nutzlast

event: client_evicted    ← terminaler Frame, keine id (synthetisch)
data: {"v":1,"type":"client_evicted","data":{"reason":"queue_overflow","droppedAfter":42}}
```

Die `id:`- und `event:`-Zeilen der SSE-Ebene duplizieren `envelope.id` / `envelope.type` für die EventSource-Kompatibilität. Raw-`fetch`-Konsumenten (die `parseSseStream` des SDKs) lesen alles aus dem JSON-Envelope und ignorieren die SSE-Präambelzeilen.
| Eventtyp | Auslöser |
| -------- | -------- |
| `session_update` | Jede ACP `sessionUpdate`-Benachrichtigung (LLM-Chunks, Tool-Aufrufe, Nutzung) |
| `permission_request` | Agent fragte nach Tool-Genehmigung |
| `permission_resolved` | Ein Client stimmte über eine Berechtigung ab via `POST /permission/:requestId` |
| `permission_partial_vote` | (nur Konsens) Eine Stimme wurde aufgezeichnet, aber das Quorum noch nicht erreicht. Enthält `{requestId, sessionId, votesReceived, votesNeeded, quorum, optionTallies}`. Voraussetzung: `caps.features.permission_mediation`. |
| `permission_forbidden` | Eine Stimme wurde von der aktiven Richtlinie abgelehnt (`designated`-Mismatch, `local-only` ohne Loopback, oder `consensus`-Wähler nicht im Snapshot). Enthält `{requestId, sessionId, clientId?, reason}`. Voraussetzung: `caps.features.permission_mediation`. |
| `model_switched` | `POST /session/:id/model` erfolgreich |
| `model_switch_failed` | `POST /session/:id/model` abgelehnt |
| `session_died` | Agent-Child-Prozess unerwartet abgestürzt. **Terminal: SSE-Stream schließt nach diesem Frame; die Sitzung ist aus `byId` entfernt.** Abonnenten sollten sich über `POST /session` neu verbinden, um eine frische Sitzung zu erstellen. |
| `slow_client_warning` | Abonnenten-lokal: Warteschlange ≥ 75 % voll. **Nicht terminal** — der Stream läuft weiter; die Warnung ist ein Hinweis vor der Räumung. Enthält `{queueSize, maxQueued, lastEventId}`. Wird einmal pro Überlauf-Episode ausgelöst; wird nach Abfluss der Warteschlange unter 37,5 % wieder scharf geschaltet. Keine `id` (synthetisch). Voraussetzung: `caps.features.slow_client_warning`. |
| `client_evicted` | Abonnenten-lokal: Warteschlangenüberlauf. **Terminal: SSE-Stream schließt nach diesem Frame** (keine `id` — synthetisch). Andere Abonnenten derselben Sitzung laufen weiter. |
| `stream_error` | Daemon-seitiger Fehler beim Fan-Out. **Terminal: SSE-Stream schließt nach diesem Frame** (keine `id` — synthetisch). |

Wiederverbindungssemantik:

- Sende `Last-Event-ID: <n>`, um Ereignisse mit `id > n` aus dem sitzungsspezifischen Ring erneut abzuspielen (Standardtiefe **8000**, konfigurierbar über `qwen serve --event-ring-size <n>`)
- **Lückenerkennung (clientseitig):** Wenn `<n>` älter ist als das älteste noch im Ring befindliche Ereignis (z. B. verbindest du dich mit `Last-Event-ID: 50` wieder, aber der Ring enthält jetzt 200–1199), spielt der Daemon ohne Fehlermeldung ab dem ältesten verfügbaren Ereignis ab. Vergleiche die `id` des ersten wiederabgespielten Ereignisses mit `n + 1`; jede Abweichung ist die Größe des verlorenen Fensters. Stufe 2 wird einen expliziten synthetischen `stream_gap`-Frame auf Daemon-Seite einfügen; in Stufe 1 liegt die Erkennung in der Verantwortung des Clients.
- IDs sind pro Sitzung monoton steigend, beginnend bei 1
- Synthetische Frames (`client_evicted`, `slow_client_warning`, `stream_error`) lassen absichtlich `id` weg, damit sie keinen Sequenzslot für andere Abonnenten verbrauchen.
Backpressure:

- Die Standard-Warteschlange pro Abonnent ist auf `maxQueued: 256` Live-Elemente voreingestellt (Wiedergabe-Frames während der Wiederverbindung umgehen die Obergrenze). Überschreibbar über `?maxQueued=N` (Bereich `[16, 2048]`) in der SSE-Anfrage.
- Wenn die Warteschlange eines Abonnenten 75 % Füllstand überschreitet, sendet der Bus zwangsweise einen synthetischen `slow_client_warning`-Frame an diesen Abonnenten (einmal pro Überlauf-Episode; erneut aktiviert nach Leerung unter 37,5 %). Der Stream bleibt geöffnet – der Warnhinweis dient als Vorwarnung, damit der Client schneller leeren oder sauber trennen und neu verbinden kann.
- Falls die Warteschlange tatsächlich überläuft, sendet der Bus den terminalen `client_evicted`-Frame und schließt das Abonnement.

### `POST /permission/:requestId`

Gib eine Stimme zu einer ausstehenden `permission_request` ab. Die aktive **Mediationsrichtlinie** entscheidet, wer gewinnt:

| Richtlinie                     | Verhalten                                                                                                                                                                                                                                |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `first-responder` (Standard)   | Jeder validierte Abstimmende gewinnt; spätere Abstimmende erhalten `404`. Pre-F3-Basislinie.                                                                                                                                              |
| `designated`                   | Nur der Prompt-Ersteller (`originatorClientId`) entscheidet; Nicht-Ersteller erhalten `403 permission_forbidden / designated_mismatch`. Fallback auf first-responder für anonyme Prompts.                                                   |
| `consensus`                    | N-von-M Abstimmende müssen zustimmen (Standard `N = floor(M/2) + 1`, überschreibbar über `policy.consensusQuorum`). Die erste Option, die N erreicht, gewinnt. Nicht entscheidende Stimmen erhalten `200` + `permission_partial_vote`-SSE-Frames. |
| `local-only`                   | Nur Loopback-Abstimmende entscheiden; entfernte Aufrufer erhalten `403 permission_forbidden / remote_not_allowed`.                                                                                                                        |

Die aktive Richtlinie wird in `settings.json` unter `policy.permissionStrategy` konfiguriert und unter `/capabilities` bei `body.policy.permission` angezeigt. Pre-Flight über `caps.features.permission_mediation` (mit `modes: [...]`) für den build-seitig unterstützten Satz.

> **F3 (#4175): Multi-Client-Berechtigungskoordination.** F3 fügte die vier obigen Richtlinien hinzu. Pre-F3-Daemons hatten first-responder fest codiert; das Drahtformat bleibt bitweise unverändert, wenn die konfigurierte Richtlinie `first-responder` ist. Neue Ereignisse (`permission_partial_vote`, `permission_forbidden`) sind additiv – alte SDKs sehen sie als `unrecognized_known_event` und ignorieren sie stillschweigend.

> **Berechtigungs-Timeout (Standard 5 Minuten).** Eine `permission_request`
> bleibt ausstehend bis: (a) ein Client hier abstimmt, (b) `POST /session/:id/cancel`
> ausgelöst wird, (c) der HTTP-Client, der den Prompt steuert, die Verbindung trennt
> (Abbruch mitten im Prompt löst ausstehende Berechtigungen als `cancelled` auf),
> (d) die Sitzung beendet wird, (e) der Daemon herunterfährt, **oder
> (f) das berechtigungsspezifische Sitzungs-Timeout ausgelöst wird** (`DEFAULT_PERMISSION_TIMEOUT_MS`,
> 5 Minuten). Bei Timeout-Auslösung wird die `requestPermission` des Agents
> als `{outcome: 'cancelled'}` aufgelöst, der Audit-Ring zeichnet einen
> `permission.timeout`-Eintrag auf, der Daemon schreibt auf stderr eine einzeilige
> Brotkrume und der SSE-Bus verteilt den standardmäßigen
> `permission_resolved`-Cancelled-Frame, damit Abonnenten aufräumen. Das
> Timeout ist konfigurierbar über `BridgeOptions.permissionResponseTimeoutMs`;
> kopflose Aufrufer, die langlaufende Prompts ausführen, möchten es möglicherweise verlängern.

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

- `{ "outcome": "selected", "optionId": "<eine-der-optionen>" }` — annehmen / ablehnen / einmalig fortsetzen / etc., je nach den angebotenen Wahlmöglichkeiten des Agents
- `{ "outcome": "cancelled" }` — Anfrage verwerfen (entspricht dem, was `cancelSession` / `shutdown` intern tun)

Antwort:

- `200 {}` — Ihre Stimme wurde angenommen (aufgelöst ODER unter Konsens-Quorum aufgezeichnet)
- `403 { "code": "permission_forbidden", "reason": "designated_mismatch" | "remote_not_allowed", "requestId", "sessionId" }` — F3: die aktive Richtlinie hat Ihre Stimme abgelehnt
- `404 { "error": "..." }` — die requestId ist unbekannt (bereits aufgelöst, nie existiert oder Sitzung abgebaut)
- `500 { "code": "cancel_sentinel_collision", ... }` — F3: die `allowedOptionIds` des Agents enthalten den reservierten Sentinel `'__cancelled__'`; Vertragsverletzung zwischen Agent und Daemon
- `501 { "code": "permission_policy_not_implemented", "policy": "<name>" }` — F3 Vorwärtskompatibilität: ein Richtlinienliteral ist im Schema gelandet, aber der zugehörige Mediator-Zweig ist noch nicht gebaut (derzeit nicht erreichbar; für zukünftige Richtlinien reserviert)

Nach einer erfolgreichen Abstimmung sieht jeder verbundene Client `permission_resolved` mit derselben `requestId` und dem gewählten `outcome`. Unter `consensus` verteilen Zwischenstimmen zusätzlich `permission_partial_vote`, bis das Quorum erreicht ist.
### Auth device-flow-Routen (Issue #4175 PR 21)

Der Daemon vermittelt einen OAuth 2.0 Device Authorization Grant (RFC 8628), sodass ein entfernter SDK-Client einen Login auslösen kann, dessen Tokens im Dateisystem des **Daemons** landen – nicht auf dem Client. Der Daemon pollt selbst den IdP; die einzige Aufgabe des Clients ist es, die Verifikations-URL und den Benutzercode anzuzeigen und optional SSE für Abschlussereignisse zu abonnieren.

Fähigkeits-Tag: `auth_device_flow` (immer angekündigt). Unterstützte Anbieter in v1: `qwen-oauth`.

> [!note]
>
> Der kostenlose Qwen-OAuth-Tarif wurde am 15.04.2026 eingestellt. Behandeln Sie `qwen-oauth` in diesem Protokoll als Legacy-v1-Anbieterkennung; neue Clients sollten, wenn verfügbar, einen derzeit unterstützten Authentifizierungsanbieter bevorzugen.

**Laufzeit-Lokalität.** Der Daemon startet niemals einen Browser – selbst wenn er könnte. Der Client entscheidet, ob er `open(verificationUri)` lokal aufruft; auf einem headless Pod (der kanonischen Mode-B-Bereitstellung) öffnet der Benutzer die URL auf dem Gerät, auf dem ein Browser verfügbar ist. Siehe `docs/users/qwen-serve.md` für die empfohlene Benutzererfahrung.

**Kein Token-Leak in Ereignissen.** `auth_device_flow_started` trägt nur `{deviceFlowId, providerId, expiresAt}`. Der Benutzercode und die Verifikations-URL kommen Punkt-zu-Punkt im POST-201-Textkörper zurück und über `GET /workspace/auth/device-flow/:id`; sie werden niemals per SSE gesendet.

**Ein Singleton pro Anbieter.** Ein zweiter `POST` für denselben Anbieter, während ein Flow aussteht, ist eine idempotente Übernahme – er gibt den vorhandenen Eintrag mit `attached: true` zurück, anstatt eine neue IdP-Anfrage zu starten.

#### `POST /workspace/auth/device-flow`

Striktes Mutations-Gate: Erfordert auch bei tokenlosen Loopback-Standardeinstellungen ein Bearer-Token (`401 token_required`).

Anfrage:

```json
{ "providerId": "qwen-oauth" }
```

Antwort (`201` Neustart, `200` idempotente Übernahme):

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

- `400 unsupported_provider` – unbekannte `providerId` (Antwort enthält `supportedProviders`)
- `409 too_many_active_flows` – Workspace-Limit (4) erreicht; abbrechen mit `DELETE`
- `401 token_required` – Striktes Gate hat eine tokenlose Anfrage abgelehnt
- `502 upstream_error` – IdP hat einen unerwarteten Fehler zurückgegeben

#### `GET /workspace/auth/device-flow/:id`

Liest den aktuellen Zustand. Ausstehende Einträge geben `userCode/verificationUri/expiresAt/intervalMs` zurück; abschließende Einträge (5-Minuten-Gnadenfrist) lassen sie weg und zeigen `status` + optional `errorKind/hint`.

Gibt `404 device_flow_not_found` für unbekannte IDs und nach der Gnadenfrist entfernte Einträge zurück.

#### `DELETE /workspace/auth/device-flow/:id`

Idempotenter Abbruch:

- Ausstehender Eintrag → `204` + sende `auth_device_flow_cancelled`
- Abgeschlossener Eintrag → `204` No-op (kein erneutes Senden des Ereignisses)
- Unbekannte ID → `404`

#### `GET /workspace/auth/status`

Momentaufnahme der ausstehenden Flows + unterstützte Anbieter:

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

#### Device-flow-SSE-Ereignisse

Fünf typisierte Ereignisse (Workspace-weit, an jede aktive Sitzungsbus verteilt):

- `auth_device_flow_started` `{deviceFlowId, providerId, expiresAt}` – POST erfolgreich; SDK sollte abonnieren (kein userCode hier, bei Bedarf über GET abrufen)
- `auth_device_flow_throttled` `{deviceFlowId, intervalMs}` – Daemon hat upstream `slow_down` beachtet; Clients, die GET pollieren, sollten ihr Intervall entsprechend anpassen
- `auth_device_flow_authorized` `{deviceFlowId, providerId, expiresAt?, accountAlias?}` – Anmeldedaten gespeichert; `accountAlias` ist ein nicht personenbezogenes Label (niemals E-Mail/Telefon)
- `auth_device_flow_failed` `{deviceFlowId, errorKind, hint?}` – Terminal; `errorKind` ist eines von `expired_token | access_denied | invalid_grant | upstream_error | persist_failed`. `persist_failed` ist Daemon-intern: Der IdP-Austausch war erfolgreich, aber der Daemon konnte die Anmeldedaten nicht dauerhaft speichern (EACCES / EROFS / ENOSPC). Der Benutzer sollte es erneut versuchen, sobald der zugrunde liegende Datenträgerzustand behoben ist.
- `auth_device_flow_cancelled` `{deviceFlowId}` – DELETE erfolgreich gegen einen ausstehenden Eintrag

> **Nicht MCP-kompatibel.** Die MCP-Autorisierungsspezifikation (2025-06-18) schreibt OAuth 2.1 + PKCE-Autorisierungscode mit einem Redirect-Callback vor, was für Headless-Pod-Daemons nicht funktioniert. Die Device-Flow-Oberfläche von Mode B ist Daemon-privat – Clients, die MCP-konforme Server ansprechen, sollten einen anderen Authentifizierungspfad verwenden.

## Streaming-Drahtformat

Ereignisse werden als standardmäßige EventSource-Frames ausgegeben. Der Daemon schreibt eine `data:`-Zeile pro Frame (das JSON enthält nach `JSON.stringify` keine eingebetteten Zeilenumbrüche); der SDK-Parser unter `packages/sdk-typescript/src/daemon/sse.ts` verarbeitet sowohl dies als auch die spezifikationserlaubte mehrzeilige `data:`-Form auf der Empfangsseite.
## Fehlerframes während des Streamings

Wenn der Bridge-Iterator beim Bedienen eines SSE-Abonnenten einen Fehler auslöst, sendet der Daemon einen terminalen `stream_error`-Frame (ohne `id`). Die `data:`-Zeile enthält das vollständige Envelope (gleiche Form wie jeder andere SSE-Frame in diesem Dokument); die eigentliche Fehlermeldung befindet sich unter `envelope.data.error`:

```
event: stream_error
data: {"v":1,"type":"stream_error","data":{"error":"<message>"}}
```

Die Verbindung wird dann geschlossen.

## Umgebungsvariablen

| Variable             | Zweck                                                         |
| -------------------- | ------------------------------------------------------------- |
| `QWEN_SERVER_TOKEN`  | Bearer-Token. Beim Start von führenden/nachgestellten Leerzeichen befreit. |

## Quell-Layout

| Pfad                                                   | Zweck                                                                                                    |
| ------------------------------------------------------ | -------------------------------------------------------------------------------------------------------- |
| `packages/cli/src/commands/serve.ts`                   | yargs-Befehl + Flagschema                                                                                |
| `packages/cli/src/serve/run-qwen-serve.ts`             | Listener-Lebenszyklus + Signalbehandlung                                                                 |
| `packages/cli/src/serve/server.ts`                     | Express-Routen + Middleware                                                                              |
| `packages/cli/src/serve/auth.ts`                       | Bearer + Host-Zulassungsliste + CORS-Verweigerung                                                        |
| `packages/cli/src/serve/httpAcpBridge.ts`              | Erzeugen-oder-Anhängen + FIFO pro Sitzung + Berechtigungsregister                                        |
| `packages/cli/src/serve/status.ts`                     | Nur-Lese-Daemon-Status-Drahttypen + `ServeErrorKind` + `BridgeTimeoutError` + `mapDomainErrorToErrorKind` |
| `packages/cli/src/serve/env-snapshot.ts`               | Reiner Helfer, der `/workspace/env`-Nutzlasten aus `process.*`-Zustand erstellt, inklusive Ausblendung von Anmeldeinformationen |
| `packages/acp-bridge/src/eventBus.ts`                  | Begrenzte asynchrone Warteschlange + Wiedergabering                                                      |
| `packages/sdk-typescript/src/daemon/DaemonClient.ts`   | TS-Client                                                                                                |
| `packages/sdk-typescript/src/daemon/sse.ts`            | EventSource-Frame-Parser                                                                                 |
| `integration-tests/cli/qwen-serve-routes.test.ts`      | 18 Fälle, kein LLM                                                                                      |
| `integration-tests/cli/qwen-serve-streaming.test.ts`   | 3 Fälle, echter `qwen --acp`-Kindprozess, unterstützt durch den lokalen Fake-OpenAI-Server (nur POSIX; auf Windows übersprungen) |
