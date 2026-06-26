# `qwen serve` HTTP-Protokoll-Referenz

Stufe 1 des [qwen-code Daemon-Designs](https://github.com/QwenLM/qwen-code/issues/3803). Alle Routen liegen unter der Basis-URL des Daemons (Standard: `http://127.0.0.1:4170`).

## Authentifizierung

Wurde der Daemon mit `--token` oder `QWEN_SERVER_TOKEN` gestartet, muss **jede Route außer `/health` auf Loopback-Bindungen** Folgendes mitführen:

```
Authorization: Bearer <token>
```

Ohne konfigurierten Token (Loopback-Entwicklungsstandard) ist der Header optional. Der Token-Vergleich erfolgt in konstanter Zeit. 401-Antworten sind einheitlich bei `missing header` / `wrong scheme` / `wrong token`.

**`/health`-Ausnahme** (Bctum): auf Loopback-Bindungen (`127.0.0.1` / `localhost` / `::1` / `[::1]`) wird `/health` VOR der Bearer-Middleware registriert, sodass Liveness-Probes im Pod den Token nicht mitführen müssen, selbst wenn der Daemon mit `--token` gestartet wurde. Nicht-Loopback-Bindungen (`--hostname 0.0.0.0` usw.) schützen `/health` wie jede andere Route hinter dem Bearer – siehe Abschnitt [`GET /health`](#get-health) für die Begründung.

**`--require-auth` (#4175 PR 15).** Übergib dieses Flag beim Start, um die „Token erforderlich“-Regel auch auf Loopback auszuweiten. Der Start schlägt ohne Token fehl; die `/health`-Ausnahme entfällt (sodass auch `/health` `Authorization: Bearer …` benötigt).

Wenn das Flag aktiv ist, schützt die globale `bearerAuth`-Middleware **jede** Route – einschließlich `/capabilities`. Ein **nicht authentifizierter** Client kann daher nicht vorab `caps.features` abfragen, um herauszufinden, dass Authentifizierung erforderlich ist: Die Erkennungsfläche für diesen Fall ist der **401-Antwortbody** selbst (einheitlich über alle Routen gemäß Abschnitt [Authentifizierung](#authentication)). Das `require_auth`-Capability-Tag ist eine **Post-Authentifizierungsbestätigung** – sobald ein Client sich erfolgreich authentifiziert und `/capabilities` liest, bestätigt das Tag, dass der Daemon mit `--require-auth` gestartet wurde (nützlich für Audit-/Compliance-UIs und für SDK-Clients, um "diese Bereitstellung ist gehärtet" in einem Einstellungsfeld anzuzeigen). Mutationsrouten, die sich für einen Per-Route-Strict-Modus entscheiden (Wave 4 Follow-ups), verweigern mit `401 { code: "token_required", error: "…" }`, wenn sie auf einer No-Token-Loopback-Standardeinstellung erreicht werden – aber mit aktiviertem `--require-auth` unterbricht die globale Bearer-Middleware die Anfrage vor dem Per-Route-Gate, sodass nicht authentifizierte Aufrufer tatsächlich den alten `Unauthorized`-Body sehen.

**`--allow-origin <pattern>` (T2.4 [#4514](https://github.com/QwenLM/qwen-code/issues/4514)).** Browser-WebUIs, die den Daemon Cross-Origin ansprechen, werden standardmäßig blockiert – jede Anfrage mit einem `Origin`-Header gibt `403 {"error":"Request denied by CORS policy"}` zurück, weil CLI/SDK-Clients nie `Origin` senden und der Daemon dessen Vorhandensein als Zeichen dafür wertet, dass die Anfrage aus einem Browser-Kontext stammt, den der Betreiber nicht aktiviert hat. Übergib `--allow-origin <pattern>` (wiederholbar) beim Start, um anstelle der Sperre eine Whitelist zu installieren. Jedes Muster ist entweder:

- Der literale `*` – akzeptiert jeden Origin. **Risikoreich**: Der Start verweigert, wenn `*` konfiguriert ist, aber kein Bearer-Token gesetzt ist (jede Quelle: `--token`, `QWEN_SERVER_TOKEN` oder `--require-auth`, das einen Token beim Start vorschreibt). Der Start-Breadcrumb gibt eine Stderr-Warnung aus, wenn `*` in der Liste ist. **Empfehlung**: Kombiniere mit `--require-auth` auf Loopback-Bindungen, sodass `/health` und `/demo` ebenfalls durch den Bearer geschützt werden – sie werden standardmäßig vor der Bearer-Middleware auf Loopback registriert (damit k8s/Compose-Probes `/health` ohne Token erreichen können), und eine `*`-Whitelist macht sie von jedem Cross-Origin-Browser aus erreichbar. Auf Nicht-Loopback-Bindungen ist der Bearer bereits beim Start obligatorisch, sodass die `*`-Expositionsfläche nur `/health` (Status-JSON) und `/demo` (eine statische Seite, deren JS immer noch Token-geschützte Routen aufruft) umfasst – die eigentliche API-Oberfläche ist unabhängig davon geschützt.
- Eine kanonische URL-Origin – `<scheme>://<host>[:<port>]`. **Kein abschließender Schrägstrich, kein Pfad, keine Benutzerinformation, kein Query.** Der Start verweigert mit `InvalidAllowOriginPatternError`, wenn der Eintrag den Roundtrip `new URL(pattern).origin === pattern` nicht besteht; die Fehlermeldung nennt das fehlerhafte Muster und die kanonische Form. Absichtlich streng: Stille Normalisierung (z. B. Entfernen eines abschließenden `/`) würde Tippfehler durchlassen und mehrdeutige Eingaben akzeptieren.

Übereinstimmende Origins erhalten bei jeder Anfrage die standardmäßigen CORS-Antwortheader:

```
Access-Control-Allow-Origin: <echoed origin>
Vary: Origin
Access-Control-Allow-Methods: GET, POST, PATCH, DELETE, OPTIONS
Access-Control-Allow-Headers: Authorization, Content-Type, X-Qwen-Client-Id, Last-Event-ID
Access-Control-Max-Age: 86400
Access-Control-Expose-Headers: Retry-After
```

`Access-Control-Allow-Origin` gibt die Origin der Anfrage wörtlich zurück (Klein-/Großschreibung, wie der Browser sie gesendet hat) und nicht den literalen `*`, selbst unter dem `*`-Muster – Browser cachen Antworten darauf gepaart mit `Vary: Origin`, und das Echo lässt Spielraum, um in einer späteren Version `Access-Control-Allow-Credentials` ohne Schemaänderung hinzuzufügen. `Access-Control-Expose-Headers: Retry-After` ermöglicht es Browser-WebUIs, die Wiederholungshinweise des Daemons aus `429`/`503`-Antworten zu verwenden. `Access-Control-Allow-Credentials` wird HEUTE NICHT gesendet: Der Daemon authentifiziert über Bearer im `Authorization`-Header, was Cross-Origin ohne `credentials: 'include'` funktioniert.

OPTIONS-Preflight-Anfragen (OPTIONS mit `Access-Control-Request-Method` oder `Access-Control-Request-Headers`) werden mit `204 No Content` plus den obigen Headern kurzgeschlossen. Dies ist das übliche CORS-Muster und sicher – der Preflight bestätigt nur, welche Methoden/Header der Daemon akzeptiert; die eigentliche nachfolgende Anfrage durchläuft weiterhin die vollständige Kette (Host-Whitelist → Bearer-Auth → Routen), sodass Anti-DNS-Rebinding und Bearer-Erzwingung noch greifen, bevor ein Zustand gelesen oder verändert wird. Einfache OPTIONS-Anfragen von übereinstimmenden Origins fließen mit CORS-Headern weiter nach unten.

Origins, die nicht der Whitelist entsprechen, erhalten weiterhin `403 {"error":"Request denied by CORS policy"}` – die gleiche Hülle wie die Standardsperre, sodass Clients, die bereits die Antwort der Sperre geparst haben, Daemons mit Whitelist nicht gesondert behandeln müssen. Der Ablehnungspfad sendet **keine** `Access-Control-*`-Header (der Browser würde sie ignorieren, und das Senden würde indirekt die Größe der Whitelist durch die Anwesenheit von Headern verraten).

Die konfigurierte Musterliste wird absichtlich NICHT in `/capabilities` zurückgespiegelt – die Browser-WebUI kennt bereits ihre eigene Origin (sie hat schließlich den Daemon aufgerufen), und das Offenlegen der Liste würde es einem nicht authentifizierten Leser von `/capabilities` ermöglichen, jede vertrauenswürdige Origin aufzuzählen (nützliche Aufklärung für eine falsch konfigurierte Bereitstellung). SDK-Clients setzen auf das `caps.features.allow_origin`-Tag für „dieser Daemon akzeptiert Cross-Origin-Browseraufrufe“, ohne die spezifischen Origins zu kennen.

Loopback-Self-Origin-Anfragen (z. B. die `/demo`-Seite ruft den Daemon am gleichen `127.0.0.1:port` auf) werden von einem **separaten** Origin-Strip-Shim behandelt, der VOR der CORS-Middleware ausgeführt wird und den `Origin`-Header für `127.0.0.1:port` / `localhost:port` / `[::1]:port` / `host.docker.internal:port` entfernt. Sie passieren daher unabhängig von der `--allow-origin`-Konfiguration – Betreiber müssen nicht den eigenen Port des Daemons auflisten, damit die Demoseite funktioniert.

## Allgemeines Fehlerformat

5xx-Antworten enthalten den ursprünglichen Fehlercode `code` und `data`, sofern vorhanden (JSON-RPC-Stil – das ACP SDK leitet `{code, message, data}` vom Agenten weiter):

```json
{
  "error": "Internal error",
  "code": -32000,
  "data": { "reason": "model quota exceeded" }
}
```

Ungültiges JSON im Anfragebody gibt Folgendes zurück:

```json
{ "error": "Invalid JSON in request body" }
```

mit Status `400`.

`SessionNotFoundError` für eine unbekannte Session-ID gibt Folgendes zurück:

```json
{ "error": "No session with id \"<sid>\"", "sessionId": "<sid>" }
```

mit Status `404`.

`WorkspaceMismatchError` für ein `POST /session`, dessen `cwd` nicht zum gebundenen Workspace des Daemons kanonisiert (#3803 §02 – 1 Daemon = 1 Workspace) gibt `400` zurück mit:

```json
{
  "error": "Workspace mismatch: daemon is bound to \"…\" but request asked for \"…\". …",
  "code": "workspace_mismatch",
  "boundWorkspace": "/path/the/daemon/binds",
  "requestedWorkspace": "/path/in/the/request"
}
```

Nutze dies, um einen Mismatch vorab zu erkennen: lies `workspaceCwd` von `/capabilities` und lasse `cwd` von `POST /session` weg (es fällt auf den gebundenen Workspace zurück) oder leite die Anfrage an einen Daemon weiter, der an `requestedWorkspace` gebunden ist.

`POST /session` über dem `--max-sessions`-Limit des Daemons gibt `503` mit einem `Retry-After: 5`-Header und Folgendem zurück:

```json
{
  "error": "Session limit reached (20)",
  "code": "session_limit_exceeded",
  "limit": 20
}
```

Wiederherstellungen bestehender Sessions werden NICHT auf das Limit angerechnet, sodass erneute Verbindungen eines inaktiven Daemons auch bei voller Kapazität weiterhin funktionieren.

`RestoreInProgressError` – wird nur von `POST /session/:id/load` und `POST /session/:id/resume` ausgegeben – gibt `409` mit einem `Retry-After: 5`-Header (entspricht `session_limit_exceeded`) und Folgendem zurück:

```json
{
  "error": "Session \"<sid>\" is already being restored via session/<resume|load>; retry session/<load|resume> after it completes",
  "code": "restore_in_progress",
  "sessionId": "<sid>",
  "activeAction": "load",
  "requestedAction": "resume"
}
```

Wird ausgelöst, wenn ein `session/load` für eine ID ausgegeben wird, für die bereits ein `session/resume` läuft (oder umgekehrt). Warte mindestens `Retry-After` Sekunden und wiederhole – die zugrunde liegende Wiederherstellung wird innerhalb von `initTimeoutMs` (Standard 10s) abgeschlossen. Gleichartige Rennen (`load` vs. `load`, `resume` vs. `resume`) werden zusammengeführt, anstatt einen Fehler zu werfen.

## Fähigkeiten

Der Daemon bewirbt seine unterstützten Feature-Tags aus dem Serve-Capability-Registry.
Clients **müssen** das UI anhand von `features` steuern, nicht anhand von `mode` (gemäß Design §10).

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

> Bedingte Tags erscheinen nur, wenn ihr entsprechender Bereitstellungsschalter aktiv ist (siehe Tabelle unten). F3s `permission_mediation`-Tag ist immer an und trägt `modes: ['first-responder', 'designated', 'consensus', 'local-only']`, damit SDK-Clients die build-seitig unterstützte Menge abfragen können; die laufzeitaktive Strategie befindet sich in `body.policy.permission`.

`session_scope_override` ist das Aushandlungs-Handle für das Per-Request-Feld `sessionScope` bei `POST /session` (siehe unten). Ältere Daemons ignorieren das Feld stillschweigend, daher sollten SDK-Clients vor dem Senden `caps.features` auf dieses Tag prüfen.

`session_load` und `session_resume` bewerben die expliziten Wiederherstellungsrouten (`POST /session/:id/load` und `POST /session/:id/resume`). Ältere Daemons geben für diese Pfade `404` zurück, daher sollten SDK-Clients vor dem Aufruf `caps.features` auf diese Tags prüfen. `unstable_session_resume` wird weiterhin als veraltetes Alias aus Kompatibilitätsgründen beworben, falls SDKs, die während der Benennung der zugrunde liegenden ACP-Methode als `connection.unstable_resumeSession` ausgeliefert wurden; neue Clients sollten auf `session_resume` setzen.

`slow_client_warning` deckt zwei gemeinsam veröffentlichte SSE-Backpressure-Knöpfe aus #4175 Wave 2.5 PR 10 ab: (a) Der Daemon sendet einen `slow_client_warning`-Frame im synthetischen Event-Stream, wenn die Warteschlange eines Subscribers 75 % Füllstand überschreitet, einmal pro Überlauf-Episode (wieder scharfgeschaltet, nachdem die Warteschlange unter 37,5 % fällt); (b) `GET /session/:id/events` akzeptiert einen `?maxQueued=N`-Query-Parameter (Bereich `[16, 2048]`), um den Per-Subscriber-Rückstand für kalte Neuverbindungen gegen einen großen Replay-Ring vorzubelegen. Die Daemon-weite Ringgröße wird durch `--event-ring-size` gesteuert (Standard **8000**, gemäß #3803 §02). Alte Daemons fehlen beide Funktionen stillschweigend – prüfe dieses Tag vor der Opt-in.

`typed_event_schema` bewirbt, dass die Event-Payloads des Daemons mit dem SDK-Schema `KnownDaemonEvent` übereinstimmen. Ältere Daemons streamen möglicherweise noch kompatible Frames, aber SDK-Clients sollten dieses Tag vor der Annahme einer typisierten Event-Abdeckung prüfen.

`client_heartbeat` bewirbt `POST /session/:id/heartbeat`. Ältere Daemons geben `404` zurück; prüfe dieses Tag vor dem Senden periodischer Heartbeats.

`session_close` und `session_metadata` bewerben `DELETE /session/:id` und `PATCH /session/:id/metadata`. Ältere Daemons geben `404` zurück; prüfe diese Tags vor dem Bereitstellen von Schließen- oder Umbenennen-Funktionen.

`session_lsp` bewirbt `GET /session/:id/lsp`, die schreibgeschützte strukturierte LSP-Status-Momentaufnahme für Daemon-Clients. Ältere Daemons geben `404` zurück; prüfe dieses Tag vor dem Bereitstellen eines Remote-LSP-Status.

`session_status` bewirbt `GET /session/:id/status`, die Live-Bridge-Zusammenfassung für eine einzelne Session nach ID (`clientCount` / `hasActivePrompt` und die Kernfelder). Ältere Daemons geben `404` zurück; prüfe dieses Tag vor dem Abfragen des Status einer einzelnen Session anstatt die gesamte Session-Liste zu durchsuchen.

`session_approval_mode_control`, `workspace_tool_toggle`, `workspace_init` und `workspace_mcp_restart` (Issue [#4175](https://github.com/QwenLM/qwen-code/issues/4175) PR 17) bewerben die vier Mutationssteuerungsrouten, die unten unter "Mutation: Approval, Tools, Init, MCP-Neustart" dokumentiert sind. Alle vier werden strikt durch das Mutations-Gate aus PR 15 geschützt (ein Daemon, der ohne Bearer-Token konfiguriert ist, lehnt sie mit 401 `token_required` ab). Ältere Daemons geben `404` zurück; prüfe jedes Tag vor dem Bereitstellen der entsprechenden Funktion.

`mcp_guardrails` (Issue [#4175](https://github.com/QwenLM/qwen-code/issues/4175) PR 14) deckt die MCP-Budget-Oberfläche ab: die Felder `clientCount` / `clientBudget` / `budgetMode` / `budgets[]` auf `GET /workspace/mcp`, das Feld `disabledReason` auf Pro-Server-Zellen und die CLI-Flags `--mcp-client-budget` / `--mcp-budget-mode`. Ältere Daemons lassen die neuen Felder vollständig weg; SDK-Clients prüfen dieses Tag, bevor sie sich auf die `budgets[]`-Semantik verlassen. Der Registry-Descriptor trägt auch `modes: ['warn', 'enforce']` für zukünftige Feature-Modes-Exposition – vorerst leiten Clients den Modus aus dem `budgetMode`-Feld der Momentaufnahme ab. Die Server-Verweigerung im `enforce`-Modus ist deterministisch durch die Deklarationsreihenfolge von `Object.entries(mcpServers)`; eine zukünftige Bereichspräzedenzschicht (falls qwen-code eine einführt) würde dies auf „niedrigste Präzedenz zuerst“ verschieben, um die Konvention von claude-code `plugin < user < project < local` zu spiegeln.

> ⚠️ **PR 14 v1-Bereich: Pro-Session, nicht pro-Workspace.** Jede ACP-Session innerhalb des Daemons erstellt ihre eigene `Config` + `McpClientManager` (über `acpAgent.newSessionConfig`). Die Budget-Begrenzung betrifft live MCP-Clients **pro Session**; jede Session liest unabhängig `QWEN_SERVE_MCP_CLIENT_BUDGET` aus der weitergeleiteten Umgebung. Mit `--mcp-client-budget=10` und 5 gleichzeitigen ACP-Sessions kann die tatsächliche Live-MCP-Client-Anzahl 5 × 10 = 50 über den Daemon hinweg erreichen. Die Momentaufnahme `GET /workspace/mcp` liest nur die Buchhaltung des **Bootstrap-Session**-`McpClientManager` – der Wert `budgets[0].scope: 'session'` ist das ehrliche Signal, dass dies pro Session und nicht aggregiert ist. **Wave 5 PR 23 (Shared MCP Pool)** wird einen Workspace-weiten Manager einführen und eine `scope: 'workspace'`-Zelle neben der Pro-Session-Zelle für eine echte Cross-Session-Aggregation hinzufügen. v1 ist der In-Prozess-Zähler + die Grundlage für weiche Durchsetzung, auf der PR 23 aufbaut.

`workspace_file_read` deckt die Text-/Listen-/Stat-/Glob-Workspace-Dateirouten ab (`GET /file`, `GET /list`, `GET /glob`, `GET /stat`). `workspace_file_bytes` deckt `GET /file/bytes` ab, was später hinzugefügt wurde, damit Clients die Unterstützung für rohe Byte-Fenster gegen PR19-zeitgenössische Daemons vorab prüfen können. `workspace_file_write` deckt die hash-bewussten Textmutationsrouten ab (`POST /file/write`, `POST /file/edit`). Das Write-Tag bedeutet, dass der Routenvertrag existiert; es bedeutet nicht, dass die aktuelle Bereitstellung für anonyme Mutation offen ist. Write/Edit sind strikte Mutationsrouten und erfordern einen konfigurierten Bearer-Token, selbst auf Loopback.

`daemon_status` bewirbt `GET /daemon/status`, die konsolidierte schreibgeschützte operative Diagnose-Momentaufnahme, die unten dokumentiert ist.

**Bedingte Tags.** Eine kleine Anzahl von Feature-Tags wird nur beworben, wenn der entsprechende Bereitstellungsschalter aktiv ist. Tag-Präsenz = Verhalten ist an; Abwesenheit = entweder ein älterer Daemon, der das Tag nicht kennt, ODER ein aktueller Daemon, bei dem der Betreiber nicht opt-in ist. Derzeit:

| Tag                        | Wird beworben, wenn …                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `require_auth`             | der Daemon mit `--require-auth` (oder `requireAuth: true` über die eingebettete API) gestartet wurde. Bearer-Token ist auf jeder Route obligatorisch, einschließlich `/health` auf Loopback-Bindungen.                                                                                                                                                                                                                                                                                                              |
| `mcp_workspace_pool`       | der gemeinsam genutzte MCP-Transport-Pool aktiv ist. Wird weggelassen, wenn `QWEN_SERVE_NO_MCP_POOL=1` den Pool deaktiviert.                                                                                                                                                                                                                                                                                                                                                                                        |
| `mcp_pool_restart`         | der gemeinsam genutzte MCP-Transport-Pool aktiv ist; Neustart-Antworten können Pool-bewusste Multi-Eintrag-Formen enthalten.                                                                                                                                                                                                                                                                                                                                                                                        |
| `allow_origin`             | T2.4 ([#4514](https://github.com/QwenLM/qwen-code/issues/4514)). Der Daemon wurde mit mindestens einem `--allow-origin <pattern>` (oder `allowOrigins: [...]` über die eingebettete API) gestartet. Cross-Origin-Anfragen von übereinstimmenden Origins erhalten ordnungsgemäße CORS-Antwortheader; nicht übereinstimmende Origins erhalten weiterhin den Standard-403. Die konfigurierte Musterliste wird absichtlich NICHT in `/capabilities` zurückgespiegelt, um ein Preisgeben der vertrauenswürdigen Origins an nicht authentifizierte Leser zu vermeiden – die Browser-WebUI kennt bereits ihre eigene Origin. |
| `prompt_absolute_deadline` | `--prompt-deadline-ms` / `QWEN_SERVE_PROMPT_DEADLINE_MS` / `ServeOptions.promptDeadlineMs` auf eine positive Ganzzahl gesetzt ist.                                                                                                                                                                                                                                                                                                                                                                                  |
| `writer_idle_timeout`      | `--writer-idle-timeout-ms` / `QWEN_SERVE_WRITER_IDLE_TIMEOUT_MS` / `ServeOptions.writerIdleTimeoutMs` auf eine positive Ganzzahl gesetzt ist.                                                                                                                                                                                                                                                                                                                                                                       |
| `workspace_settings`       | der Daemon mit verfügbarer Einstellungspersistenz erstellt wurde.                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `session_shell_command`    | die Session-Shell-Ausführung explizit aktiviert ist.                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `rate_limit`               | `--rate-limit` / `QWEN_SERVE_RATE_LIMIT=1` / `ServeOptions.rateLimit` aktiviert ist.                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `workspace_reload`         | Workspace-Reset-Unterstützung in der eingebetteten Routenkonfiguration verfügbar ist.                                                                                                                                                                                                                                                                                                                                                                                                                               |
`mcp_guardrails` befindet sich **nicht** in dieser konditionalen Tabelle – es ist ein immer-aktives Tag, das angekündigt wird, sobald das Binary die neuen `/workspace/mcp`-Budget-Felder unterstützt, unabhängig davon, ob der Operator ein Budget konfiguriert hat. Operatoren, die `--mcp-client-budget` nicht gesetzt haben, erhalten dennoch die neuen Felder (mit `budgetMode: 'off'`, `budgets: []`).

`mcp_guardrail_events` (Issue [#4175](https://github.com/QwenLM/qwen-code/issues/4175) PR 14b) kündigt die getypten SSE-Push-Ereignisse an, die MCP-Budget-Zustandsüberschreitungen ohne Polling-Schleife sichtbar machen. Auf `GET /session/:id/events` treffen zwei Frame-Typen ein:

- `mcp_budget_warning` – feuert einmal beim Überschreiten der 75%-Schwelle von `reservedSlots.size / clientBudget`. Schärft sich erst wieder, wenn das Verhältnis unter 37,5% fällt (`MCP_BUDGET_REARM_FRACTION`). Spiegelt die Hysterese von `slow_client_warning` aus PR 10 wider, jedoch auf Manager-Ebene statt auf der Ebene des Pro-Abonnenten-Backlogs. Payload: `{ liveCount, reservedCount, budget, thresholdRatio: 0.75, mode: 'warn' | 'enforce' }`. Feuert sowohl im `warn`- als auch im `enforce`-Modus; niemals im `off`-Modus.
- `mcp_child_refused_batch` – feuert am Ende jedes `discoverAllMcpTools*`-Durchlaufs, wenn mindestens ein Server abgelehnt wurde, UND als Batch der Länge 1 auf dem `readResource`-Lazy-Spawn-Ablehnungspfad. Payload: `{ refusedServers: [{ name, transport, reason: 'budget_exhausted' }, ...], budget, liveCount, reservedCount, mode: 'enforce' }`. `mode` ist das Literal `'enforce'`, da der `warn`-Modus niemals ablehnt.

Beide Ereignisse befinden sich im pro-Sitzung-SSE-Replay-Ring (sie tragen eine `id`), sodass ein Client, der sich mit `Last-Event-ID` wieder verbindet, sie durchläuft; der Snapshot unter `GET /workspace/mcp` bleibt die Quelle der Wahrheit für den Zustand nach einer längeren Trennung. Immer aktiv, sobald angekündigt – es gibt keinen konditionalen Schalter. Der SDK-Reducer-Zustand (`DaemonSessionViewState`) stellt `mcpBudgetWarningCount`, `lastMcpBudgetWarning`, `mcpChildRefusedBatchCount`, `lastMcpChildRefusedBatch` für Adapter bereit, die eine einfache Verzögerungs-UI wünschen.

## Routen

### `GET /health`

Lebendigkeitsprüfung. Standardformular gibt `200 {"status":"ok"}` zurück, wenn der Listener aktiv ist – günstig, kein Bridge-Zugriff, geeignet für hochfrequente k8s/Compose-Liveness-Probes.

Übergib `?deep=1` (akzeptiert auch `?deep=true` oder nacktes `?deep`) für eine Probe, die Bridge-**Zähler** offenlegt (nur informativ, keine echte Lebendigkeitsprüfung):

```json
{ "status": "ok", "sessions": 3, "pendingPermissions": 1 }
```

> ⚠️ Die tiefe Probe ist **informativ**, keine echte Lebendigkeitsüberprüfung. Sie liest Counter-Accessoren (`bridge.sessionCount`, `bridge.pendingPermissionCount`), die einfache Map-Größen-Getter sind; sie pingen keine einzelnen Kindprozesse/Kanäle an und werden daher keinen festgefahrenen, aber immer noch gezählten Sitzung erkennen. Verwende sie für Kapazitäts-Dashboards (aktuelle Parallelität vs. `--max-sessions`, Warteschlangentiefe) und nicht als Auslöser für „Dämon aus dem Rotation nehmen". Eine `503 {"status":"degraded"}`-Antwort ist theoretisch möglich, wenn die Getter einer benutzerdefinierten Bridge-Implementierung werfen, aber die Getter der echten Bridge werfen nie – unter normalem Betrieb gibt die tiefe Probe immer 200 zurück. Für echte Lebendigkeit verlasse dich darauf, ob der Listener überhaupt eine TCP-Verbindung akzeptiert (d.h. der Standard-`/health` ohne `?deep`).

**Auth:** erforderlich **nur bei Nicht-Loopback-Bindungen**. Auf Loopback (`127.0.0.1`, `::1`, `[::1]`) ist `/health` vor der Bearer-Middleware registriert, sodass k8s/Compose-Probes innerhalb des Pods das Token nicht mitführen müssen. Auf Nicht-Loopback (`--hostname 0.0.0.0` usw.) ist die Route nach der Bearer-Middleware registriert und gibt 401 ohne gültiges Token zurück – andernfalls könnte ein nicht authentifizierter Aufrufer beliebige Adressen abfragen, um die Existenz eines `qwen serve` zu bestätigen, ein geringfügiges Informationsleck, das sich schlecht mit Port-Scans kombiniert. CORS-Deny + Host-Allowlist gelten weiterhin für die Loopback-Ausnahme.

### `GET /daemon/status`

Schreibgeschützte Operator-Diagnose. Anders als `/health` ist dies eine normale Dämon-API:
Sie ist nach Bearer-Auth und Rate-Limiting registriert, auch auf Loopback-Bindungen. Abfrageparameter:

- `detail=summary` (Standard) liest nur den In-Memory-Dämon-Zustand.
- `detail=full` enthält zusätzlich Live-Sitzungsdiagnose, ACP-Verbindungsdiagnose, Auth-Device-Flow-Zähler und Workspace-Status-Abschnitte.
- jeder andere `detail`-Wert gibt `400 { "code": "invalid_detail" }` zurück.

`summary` fragt absichtlich keine Workspace-Status-Methoden ab, startet kein ACP-Kind und erzeugt keine Sitzung. `full` fragt jeden Workspace-Abschnitt unabhängig ab; ein Timeout oder eine Ausnahme markiert nur diesen Abschnitt als `unavailable` und fügt ein `workspace_status_unavailable`-Issue hinzu.

Antwortform:

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

`status` ist `error`, wenn ein Issue einen Fehler-Schweregrad hat, `warning`, wenn ein Issue einen Warn-Schweregrad hat, andernfalls `ok`. Issue-Codes sind stabil und umfassen `session_capacity_high`, `connection_capacity_high`, `pending_permissions`, `acp_channel_down`, `preflight_error`, `mcp_budget_warning`, `mcp_budget_exhausted`, `rate_limit_hits` und `workspace_status_unavailable`. Während des kurzen Fensters, nachdem der Listener bereit ist, aber bevor die vollständige Laufzeit gemountet ist, kann `/daemon/status` `daemon_runtime_starting` melden; wenn der asynchrone Laufzeit-Mount fehlschlägt, meldet es `daemon_runtime_failed`, während Nicht-Status-Laufzeitrouten `503` zurückgeben.

Sicherheit: Die Antwort enthält niemals Bearer-Tokens, Client-IDs, vollständige ACP-Verbindungs-IDs, Device-Flow-Benutzercodes oder Verifizierungs-URLs. `summary` lässt den Dämon-Log-Pfad aus; `full` kann ihn für authentifizierte Operatoren enthalten.

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

Stabiler Vertrag: Wenn `v` inkrementiert, hat sich das Frame-Layout auf eine inkompatible Weise geändert.

> **`protocolVersions`** beschreibt die Serve-Protokollversionen, die der Dämon sprechen kann. `current` ist die bevorzugte Protokollversion des Dämons und `supported` ist die kompatible Menge. Clients, die eine bestimmte Protokollversion benötigen, sollten `supported` prüfen; funktionsspezifische UIs sollten dennoch auf `features` prüfen. Additiv zu v=1: Ältere v=1-Dämonen lassen dieses Feld aus, daher sollten SDK-Clients, die auf ältere Builds abzielen, es als optional behandeln.

> **`modelServices` ist in Phase 1 immer `[]`.** Der Agent verwendet seinen einzigen Standard-Modellservice und listet ihn nicht über das Kabel auf. Phase 2 wird dies aus registrierten Modelladaptern befüllen, damit SDK-Clients Service-Auswahlen erstellen können; bis dahin verlasse dich NICHT darauf, dass dieses Feld nicht leer ist.

> **`workspaceCwd`** ist der kanonische absolute Pfad, an den dieser Dämon gebunden ist (#3803 §02 – 1 Dämon = 1 Workspace). Verwende ihn, um (a) eine Fehlanpassung vor dem Posten von `/session` zu erkennen und (b) `cwd` bei `POST /session` wegzulassen (die Route fällt auf diesen Pfad zurück). Multi-Workspace-Bereitstellungen exponieren mehrere Dämonen auf verschiedenen Ports, jeder mit eigenem `workspaceCwd`. Additiv zu v=1: Pre-§02 v=1-Dämonen lassen das Feld aus – Clients, die auf ältere Builds abzielen, sollten vor der Verwendung auf Null prüfen.

### Schreibgeschützte Laufzeit-Status-Routen

Diese Routen melden Dämon-seitige Laufzeit-Snapshots. Sie sind additive v1-Routen,
mutieren keinen Zustand und ändern nicht die Serve-Protokollversion. Workspace-Status-Routen starten **nicht** absichtlich den ACP-Kindprozess nur, weil ein Client eine GET-Route pollt: Wenn der Dämon im Leerlauf ist, geben sie `initialized: false` mit einem leeren Snapshot zurück. Sitzungs-Status-Routen erfordern eine aktive Sitzung und verwenden die standardmäßige `404 SessionNotFoundError`-Form für unbekannte IDs.

Fähigkeits-Tags:

- `workspace_mcp` → `GET /workspace/mcp`
- `workspace_skills` → `GET /workspace/skills`
- `workspace_providers` → `GET /workspace/providers`
- `workspace_env` → `GET /workspace/env`
- `workspace_preflight` → `GET /workspace/preflight`
- `session_context` → `GET /session/:id/context`
- `session_supported_commands` → `GET /session/:id/supported-commands`
- `session_tasks` → `GET /session/:id/tasks`
- `session_status` → `GET /session/:id/status`

Allgemeine Statuszelle:

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

`errorKind` ist ein geschlossener Enum, der von `/workspace/preflight`, `/workspace/env` und (irgendwann) MCP-Guardrails gemeinsam genutzt wird, damit SDK-Clients Abhilfe pro Kategorie rendern können, anstatt freiformatierte Nachrichten zu parsen. PR 13 (#4175) führte die sieben oben aufgeführten Literale ein; PR 14 wird `blocked_egress` befüllen, sobald die Egress-Probe landet.

Status-Payloads exponieren niemals MCP-Env-Werte, Header, OAuth/Dienstkonto-Details, Provider-API-Keys, Provider-`baseUrl`/`envKey`, Skill-Text, Skill-Dateisystempfade, Hook-Definitionen oder Werte von geheimen Umgebungsvariablen. `/workspace/env` meldet nur die **Anwesenheit** von zugelassenen Env-Vars; Proxy-URLs werden von Anmeldeinformationen befreit und auf `host:port` reduziert, bevor sie über das Kabel gehen.

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
      "description": "Dokumentationsserver",
      "extensionName": "docs-ext"
    }
  ]
}
```

`discoveryState` ist einer von `not_started`, `in_progress` oder `completed`. `transport` ist einer von `stdio`, `sse`, `http`, `websocket`, `sdk` oder `unknown`. `errors` wird weggelassen, wenn die Discovery erfolgreich ist.

**MCP-Client-Guardrails (Issue [#4175](https://github.com/QwenLM/qwen-code/issues/4175) PR 14).** Post-PR-14-Dämonen erweitern die Payload um vier additive Felder und eine Workspace-Ebene-Zelle:

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
      "hint": "Erhöhe --mcp-client-budget oder entferne Server aus der mcpServers-Konfiguration.",
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

`budgetMode` ist einer von `enforce`, `warn` oder `off`. `clientBudget` fehlt, wenn kein Budget gesetzt wurde. Das Array `budgets[]` ist bei Post-PR-14-Dämonen **immer ein Array** (möglicherweise leer, wenn `budgetMode === 'off'`); Pre-PR-14-Dämonen lassen das Feld vollständig aus. v1 gibt eine Zelle mit `scope: 'session'` aus (pro-Sitzung-Durchsetzung – siehe den Abschnitt zu Fähigkeiten oben für die Begründung). Konsumenten MÜSSEN zusätzliche `budgets[]`-Einträge mit unbekannten `scope`-Werten tolerieren – Wave 5 PR 23 wird `scope: 'workspace'` (oder `'pool'`) zusammen mit der Pro-Sitzung-Zelle ohne Schema-Bump hinzufügen.

`disabledReason` auf Pro-Server-Zellen unterscheidet zwischen operator-deaktiviert (`'config'` – `disabledMcpServers`-Konfigurationsliste) und budget-abgelehnt (`'budget'` – entdeckt, aber aufgrund des `enforce`-Modus nie verbunden). Ablehnungen sind deterministisch nach der Deklarationsreihenfolge von `Object.entries(mcpServers)`. Das Pro-Server-`status: 'error', errorKind: 'budget_exhausted'` überschattet den rohen `mcpStatus: 'disconnected'` (der zwar wahr ist, aber nicht den operator-zugewandten Schweregrad darstellt).

Die Budgetdurchsetzung in PR 14 v1 erfolgt **pro Sitzung, nicht pro Workspace**. Obwohl Mode-B-Dämonen auf Prozessebene `1 Dämon = 1 Workspace × N Sitzungen` sind (Post-#4113), wird der `McpClientManager` innerhalb der `Config` jeder ACP-Sitzung über `acpAgent.newSessionConfig` konstruiert, sodass N Sitzungen jeweils ihre eigene Kopie des Limits durchsetzen. Der Snapshot repräsentiert die Ansicht der Bootstrap-Sitzung. Wave 5 PR 23 führt einen Workspace-bezogenen, gemeinsam genutzten MCP-Pool ein, der dies zu einer echten Workspace-weiten Durchsetzung hochstuft.

**Budgetdruck erkennen.** Zwei Oberflächen, beide ab PR-14b befüllt:

- **Push-Ereignisse** (angekündigt über `mcp_guardrail_events`): Abonniere `GET /session/:id/events` und schränke `mcp_budget_warning` / `mcp_child_refused_batch`-Frames durch `KnownDaemonEvent` ein. Die Zustandsmaschine feuert einmal pro Überschreitung der 75%-Schwelle (wieder scharf unter 37,5%); Ablehnungen werden einmal pro Discovery-Durchlauf im `enforce`-Modus zusammengefasst.
- **Snapshot-Poll** (angekündigt über `mcp_guardrails`): `GET /workspace/mcp` und überprüfe die Pro-Sitzung-Budgetzelle (`budgets[0]`):

- `budgets[0].status === 'warning'` ⇔ `liveCount >= 0.75 * clientBudget` (entspricht der Hystereseschwelle, die das Push-Ereignis in PR 14b verwenden wird).
- `budgets[0].status === 'error'` ⇔ `refusedCount > 0` (mindestens ein Server wurde in diesem Discovery-Durchlauf abgelehnt).
- `budgets[0].status === 'ok'` ⇔ unter der 75%-Schwelle UND keine Ablehnungen.

Empfohlene Poll-Rate: ausgerichtet an dem, was bereits `/workspace/mcp` pollt; der Snapshot ist günstig und die Budgetzelle verursacht keine zusätzlichen Discovery-Kosten. SDK-Clients, die Push-Ereignisse abonnieren, profitieren dennoch vom Snapshot für den Zustand nach längerer Trennung (die Tiefe des SSE-Replay-Rings ist begrenzt – `--event-ring-size`, Standard 8000 – daher fällt ein Client, der länger offline ist als die Ringabdeckung, auf Snapshot-Resync zurück).

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
      "description": "Code überprüfen",
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

Modelle sind nach Auth-Typ gruppiert. Provider-Verbindungsdiagnosen befinden sich in der `providers`-Zelle von `/workspace/preflight`; Umgebungs-Preflight befindet sich in `/workspace/preflight` und `/workspace/env` (unten). `errors` wird weggelassen, wenn die Snapshot-Erstellung erfolgreich ist.

### `GET /workspace/env`

Meldet die Laufzeit, Plattform, Sandbox, Proxy und die **Anwesenheit** von zugelassenen geheimen Umgebungsvariablen des Dämon-Prozesses. Antwortet immer aus dem `process.*`-Zustand – der Dämon startet niemals ein ACP-Kind, um diese Route zu bedienen, und die Antwort ist identisch, unabhängig davon, ob ACP aktiv oder im Leerlauf ist. Das Feld `acpChannelLive` dient nur zu Informationszwecken.

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

Zellenform:

```ts
type DaemonEnvKind =
  | 'runtime' // name: 'node' | 'bun' | 'unknown'; value: process.versions.node
  | 'platform' // name: process.platform; value: process.arch
  | 'sandbox' // name: 'SANDBOX' | 'SEATBELT_PROFILE'; value optional
  | 'proxy' // name: HTTP_PROXY | HTTPS_PROXY | NO_PROXY | ALL_PROXY; value: redacted host
  | 'env_var'; // nur Anwesenheit; value-Feld wird IMMER weggelassen

interface DaemonEnvCell extends DaemonStatusCell {
  kind: DaemonEnvKind;
  name: string;
  present?: boolean;
  value?: string;
}
```

**Redaktionsrichtlinie.** Zellen vom Typ `kind: 'env_var'` enthalten niemals ein `value`-Feld; Clients sehen nur `present: boolean`. Zellen vom Typ `kind: 'proxy'` durchlaufen den rohen Env-Wert durch Credential-Redaktion (`redactProxyCredentials`) und dann durch `URL`-Parsing, sodass das Kabel nur `host:port` überträgt. `NO_PROXY` wird unverändert durch die Redaktion geleitet, da es sich um eine Host-Liste und nicht um eine URL handelt. Die Whitelist der aufgezählten geheimen Env-Vars umfasst derzeit `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GEMINI_API_KEY`, `GOOGLE_API_KEY`, `DASHSCOPE_API_KEY`, `OPENROUTER_API_KEY` und `QWEN_SERVER_TOKEN`. Andere Env-Vars werden nicht aufgezählt, sodass versehentlich gesetzte Secrets unsichtbar bleiben.

### `GET /workspace/preflight`

Meldet Bereitschaftsprüfungen des Dämons. **Dämon-Ebene-Zellen** (`node_version`, `cli_entry`, `workspace_dir`, `ripgrep`, `git`, `npm`) werden immer aus `process.*` und `node:fs` befüllt. **ACP-Ebene-Zellen** (`auth`, `mcp_discovery`, `skills`, `providers`, `tool_registry`, `egress`) erfordern ein aktives ACP-Kind – wenn der Dämon im Leerlauf ist, geben sie Platzhalter mit `status: 'not_started'` aus. Die Route startet niemals ACP nur, um Zellen zu befüllen; die entsprechenden Zellen fallen auf `not_started` zurück.

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
      "hint": "Starte eine Sitzung, um zu befüllen"
    },
    {
      "kind": "mcp_discovery",
      "status": "not_started",
      "locality": "acp",
      "hint": "Starte eine Sitzung, um zu befüllen"
    },
    {
      "kind": "skills",
      "status": "not_started",
      "locality": "acp",
      "hint": "Starte eine Sitzung, um zu befüllen"
    },
    {
      "kind": "providers",
      "status": "not_started",
      "locality": "acp",
      "hint": "Starte eine Sitzung, um zu befüllen"
    },
    {
      "kind": "tool_registry",
      "status": "not_started",
      "locality": "acp",
      "hint": "Starte eine Sitzung, um zu befüllen"
    },
    {
      "kind": "egress",
      "status": "not_started",
      "locality": "acp",
      "hint": "Egress-Probing wird in PR 14 (#4175) landen"
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

- `missing_binary` — Node-Version liegt unter der erforderlichen, fehlender `QWEN_CLI_ENTRY`, ripgrep / git / npm nicht im PATH (Warnungen statt Fehler für die optionalen Binärdateien).
- `missing_file` — `boundWorkspace` existiert nicht oder ist kein Verzeichnis; Skill-Parsefehler, der auf eine fehlende oder nicht lesbare Datei verweist.
- `parse_error` — `SKILL.md`-Parsefehler, fehlerhaftes Konfigurations-JSON.
- `auth_env_error` — `validateAuthMethod` hat einen Nicht-Null-Fehlerstring zurückgegeben, oder eine `ModelConfigError`-Unterklasse wurde während der Provider-Auflösung propagiert.
- `init_timeout` — `withTimeout`-Ablehnung in der Bridge (ein tatsächlicher Timeout beim Warten auf einen ACP-Roundtrip). Wird durch die typisierte Klasse `BridgeTimeoutError` erkannt. Hinweis: Eine transiente `mcp_discovery`-`warning`-Zelle mit `connecting > 0` trägt NICHT diesen kind – das ist ein normaler Handshake-in-Progress-Zustand, unterschieden von einem echten Timeout.
- `protocol_error` — ACP `extMethod` wurde abgelehnt, weil der Kanal mitten in der Anfrage geschlossen wurde oder weil das Tool-Registry unerwartet fehlte.
- `blocked_egress` — reserviert für PR 14 (#4175). PR 13 belässt die `egress`-Zelle auf `status: 'not_started'`.

Wenn die Bridge während der Bearbeitung einer Preflight-Anfrage das ACP-Child nicht erreichen kann (z.B. Kanal-Schließung während der Anfrage), enthält das `errors`-Array des Envelopes eine einzelne `ServeStatusCell` mit der Fehlerbeschreibung, und die Zellen fallen zurück auf `not_started`-ACP-Platzhalter. Daemon-Ebene-Zellen werden weiterhin zurückgegeben.

### Workspace-Dateipfade

Alle Dateipfade werden relativ zum gebundenen Workspace des Daemons aufgelöst. Antworten verwenden Workspace-relative Pfade und geben bei normalen Erfolgsfällen nie absolute Dateisystempfade zurück. Erfolgreiche Dateiantworten enthalten:

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

Liest eine Textdatei. Query-Parameter: `path` (erforderlich), `maxBytes`, `line` und `limit`. Der Daemon lehnt Binärdateien und Dateien ab, die größer als die Text-Lese-Grenze sind. Die Antwort enthält `hash`, einen SHA-256-Digest über die rohen On-Disk-Bytes der gesamten Datei, auch wenn `line`, `limit` oder `maxBytes` einen Ausschnitt zurückgegeben haben.

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

Liest rohe Bytes aus einer Datei ohne Dekodierung. Query-Parameter: `path` (erforderlich), `offset` (Standard `0`) und `maxBytes` (Standard `65536`, maximal `262144`). Diese Route unterstützt begrenzte Fenster auf große Binärdateien, ohne die gesamte Datei zu laden. Die Antwort enthält `hash` nur, wenn das zurückgegebene Fenster die gesamte Datei abdeckt.

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

Erstellt oder ersetzt eine Textdatei. Dies ist eine strikte Mutations-Route: Bei Loopback ohne konfiguriertes Token gibt sie `401 { "code": "token_required" }` zurück. Mit `--require-auth` lehnt die globale Bearer-Middleware unauthentifizierte Anfragen ab, bevor die Route ausgeführt wird.

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

`mode` muss `create` oder `replace` sein. `create` überschreibt niemals eine bestehende Datei (`409 file_already_exists`). `replace` erfordert `expectedHash`; fehlende oder ungültige Hashes führen zu `400 parse_error`, und veraltete Hashes zu `409 hash_mismatch`. `expectedHash` ist `sha256:` plus 64 hexadezimale Kleinbuchstaben, berechnet über die rohen On-Disk-Bytes.

`bom`, `encoding` und `lineEnding` können angegeben werden. `replace` behält standardmäßig das bestehende Codierungsprofil der Datei bei; explizite Felder überschreiben es. Binäre Schreibvorgänge sind nicht vorgesehen.

Der Daemon schreibt in eine zufällige temporäre Datei im Zielverzeichnis, ruft wo unterstützt `fsync` auf, überprüft den aktuellen Hash unmittelbar vor `rename()` und benennt dann per `rename` an die Zielposition um. Dies verhindert die Beobachtung von Teil-Dateien und serialisiert Daemon-gestartete Schreibvorgänge auf dieselbe Datei, ist aber kein kernel-basierter Compare-and-Swap über Prozesse hinweg: Ein externer Editor kann im schmalen Fenster zwischen letzter Hash-Prüfung und `rename` trotzdem eine Race-Bedingung verursachen.

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

Wendet eine exakte Textersetzung auf eine bestehende Textdatei an. Auch dies ist eine strikte Mutations-Route und erfordert `expectedHash`.

```json
{
  "path": "src/config.ts",
  "oldText": "timeout: 30000",
  "newText": "timeout: 60000",
  "expectedHash": "sha256:..."
}
```

`oldText` darf nicht leer sein und muss genau einmal vorkommen. Keine Übereinstimmung gibt `422 text_not_found` zurück; mehrere Übereinstimmungen geben `422 ambiguous_text_match` zurück. Die Route bewahrt Encoding, BOM und Zeilenumbrüche und überprüft `expectedHash` unmittelbar vor dem atomaren `rename` erneut.

Explizite Schreib-/Editiervorgänge auf ignorierte Pfade sind erlaubt, weil der authentifizierte Aufrufer den Pfad benannt hat. Erfolgsantworten und Audit-Events enthalten `matchedIgnore: "file" | "directory" | null`.

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

`state` spiegelt dieselben ACP-Modell-/Modus-/Konfigurationsoptions-Strukturen wider, die von `POST /session`, `POST /session/:id/load` und `POST /session/:id/resume` verwendet werden.

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

`availableCommands` ist derselbe Befehls-Snapshot, der auch von der SSE-Benachrichtigung `available_commands_update` verwendet wird. `availableSkills` listet nur Skill-Namen auf; Clients müssen über diese Route keine Skill-Bodies oder -Pfade erwarten.

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

Diese Route ist ein schreibgeschützter Out-of-Band-Snapshot. Sie ist bewusst kein Prompt und kann während des Streamings der Session abgefragt werden. Die Antwort enthält nur freigegebene Metadaten aus den Agent-, Shell- und Monitor-Task-Registries; Controller, Timer, Offsets, ausstehende Nachrichten und rohe Registry-Objekte werden nie exponiert.

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

`status` ist einer von `NOT_STARTED`, `IN_PROGRESS`, `READY` oder `FAILED`. Optionales `error` ist bei fehlgeschlagenen Servern vorhanden, sofern verfügbar. Deaktiviertes LSP (einschließlich Bare-Mode) gibt HTTP 200 mit `enabled: false`, Null-Zählern und `servers: []` zurück. LSP aktiviert ohne konfigurierte Server gibt `enabled: true`, `configuredServers: 0` und `servers: []` zurück. Wenn die Initialisierung fehlschlägt, bevor der Client existiert, kann die Antwort `initializationError` enthalten; wenn ein Live-Client keinen Snapshot liefern kann, enthält die Antwort `statusUnavailable: true`.

Diese Route exponiert nur stabile client-seitige Felder. Debug-Interna wie Prozess-IDs, Spawn-Argumente, stderr-Tails, Root-URIs und Workspace-Ordner-Pfade werden bewusst weggelassen.

### `POST /session`

Einen neuen Agenten starten oder an einen bestehenden anhängen (unter `sessionScope: 'single'`, der Standard).

Anfrage:

```json
{
  "cwd": "/absolute/path/to/workspace",
  "modelServiceId": "qwen-prod",
  "sessionScope": "thread"
}
```

| Feld              | Erforderlich | Hinweise                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| ----------------- | ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `cwd`             | nein         | Absoluter Pfad, der dem gebundenen Workspace des Daemons entspricht. Wenn ausgelassen, fällt die Route auf `boundWorkspace` zurück (aus `/capabilities.workspaceCwd` lesen). Ein nicht übereinstimmender, nicht leerer `cwd` gibt `400 workspace_mismatch` zurück (#3803 §02 – 1 Daemon = 1 Workspace). Workspace-Pfade werden mittels `realpathSync.native` kanonisiert (mit einem Nur-Auflösungs-Fallback für nicht existierende Pfade), sodass case-insensitive Dateisysteme Sessions nicht aufgrund von Schreibweisen ablehnen.                                                                 |
| `modelServiceId`  | nein         | Wählt aus, welcher konfigurierte _Model Service_ (der Backend-Provider – Alibaba ModelStudio, OpenRouter usw.) vom Agenten verwendet wird. Wenn ausgelassen, verwendet der Agent seinen Standard. Wenn der Workspace bereits eine Session hat, wird `setSessionModel` auf der bestehenden Session aufgerufen und `model_switched` gesendet. Unterscheidet sich von `modelId` auf `POST /session/:id/model`, welches das Modell **innerhalb** eines bereits gebundenen Service auswählt. Das `modelServices`-Array in `/capabilities` ist für die Anzeige konfigurierter Services reserviert; in Stage 1 ist es immer `[]` (der standardmäßige Service des Agenten wird verwendet und nicht über HTTP aufgezählt). |
| `sessionScope`    | nein         | Überschreibung pro Anfrage für Session-Sharing. `'single'` (der Daemon-weite Standard) bewirkt, dass ein zweites `POST /session` im selben Workspace die bestehende Session wiederverwendet (`attached: true`); `'thread'` erzwingt bei jedem Aufruf eine neue, eigenständige Session. Wenn ausgelassen, wird der Daemon-weite Standard übernommen. Werte außerhalb des Enums geben `400 { code: 'invalid_session_scope' }` zurück. Ältere Daemons (vor #4175 PR 5) ignorieren das Feld stillschweigend – vorher `caps.features.session_scope_override` prüfen. Der Daemon-weite Standard ist derzeit fest auf `'single'` programmiert; #4175 könnte in einem Follow-up ein CLI-Flag `--sessionScope` hinzufügen.  |

Antwort:

```json
{
  "sessionId": "<uuid>",
  "workspaceCwd": "/canonical/path",
  "attached": false
}
```

`attached: true` bedeutet, dass für diesen Workspace bereits eine Session existiert und Sie diese jetzt teilen.

Gleichzeitige `POST /session`-Aufrufe für denselben Workspace werden zu **einem** Start **zusammengefasst** – beide Aufrufer erhalten dieselbe `sessionId`, genau einer meldet `attached: false`. Falls der zugrunde liegende Start fehlschlägt (Init-Timeout, fehlerhafte Agent-Ausgabe, OOM), erhalten **alle zusammengefassten Aufrufer denselben Fehler** – der In-Flight-Slot wird geleert, sodass ein Folgeaufruf von vorn neu starten kann.

> [!warning] **`modelServiceId`-Ablehnung bei einer frischen Session ist still auf der HTTP-Antwort.**  
> Eine falsche `modelServiceId` (Tippfehler, nicht konfigurierter Service) verursacht KEINEN 500 beim Erstellen – die Session bleibt auf dem Standardmodell des Agenten betriebsbereit, sodass der Aufrufer trotzdem eine `sessionId` erhält, gegen die er den Modellwechsel erneut versuchen kann (via `POST /session/:id/model`). Das sichtbare Fehlersignal ist ein `model_switch_failed`-Event auf dem SSE-Stream der Session, das zwischen dem Spawn-Handshake und Ihrem ersten Subscribe gesendet wird. **Abonnementen, die dieses Event beobachten müssen, sollten bei ihrem ersten `GET /session/:id/events` `Last-Event-ID: 0` übergeben**, um vom ältesten verfügbaren Event im Ring abzuspielen (deckt das `model_switch_failed` zur Spawn-Zeit ab, selbst wenn das Subscribe einige ms nach der Create-Antwort erfolgt).

### `POST /session/:id/load`

Stellt eine persistierte ACP-Session anhand der ID wieder her und spielt deren Verlauf über SSE ab. Die ID im Pfad ist maßgeblich; ein `sessionId`-Feld im Body wird ignoriert. Vorher `caps.features.session_load` prüfen – ältere Daemons geben auf diese Route `404` zurück.

Anfrage:

```json
{
  "cwd": "/absolute/path/to/workspace"
}
```

| Feld  | Erforderlich | Hinweise                                                                                                                                                                                                                                                  |
| ----- | ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `cwd` | nein         | Gleiche Kanonisierung + `workspace_mismatch`-Regeln wie bei `POST /session`. Weglassen, um `/capabilities.workspaceCwd` zu übernehmen. `mcpServers` wird hier bewusst NICHT akzeptiert – Daemon-weites MCP wird per Einstellungen gesteuert (entspricht `POST /session`). |

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

`state` spiegelt ACPs `LoadSessionResponse` wider – `models` ist ein `SessionModelState`, `modes` ein `SessionModeState`, `configOptions` ein Array von `SessionConfigOption`. Fehlende Felder werden vom Agenten entschieden. Späte Anhänger (die `attached: true`-Pfade unten) erhalten den GLEICHEN `state`-Snapshot, den der ursprüngliche Load-Aufrufer gesehen hat – der Daemon cached ihn auf dem Eintrag; Laufzeitmutationen (z.B. `model_switched`) werden auf dem SSE-Stream geliefert, nicht auf späteren Attach-Antworten.

`attached: true` bedeutet, dass die Session bereits live war (entweder von einem vorherigen `session/load`/`session/resume` oder weil ein zusammengefasster, gleichzeitiger Aufrufer knapp voraus war).

**History-Replay über SSE.** Während `loadSession` auf der Agent-Seite läuft, sendet der Agent `session_update`-Benachrichtigungen für jeden persistierten Turn. Der Daemon puffert sie auf den Event-Bus der Session, bevor die Routen-Antwort zurückgegeben wird, sodass Abonnenten, die sofort `GET /session/:id/events` mit `Last-Event-ID: 0` aufrufen, das vollständige Replay sehen. **Der Replay-Ring ist begrenzt** (Standard 8000 Frames pro Session). Lange Verläufe mit vielen Tool-Call-/Thought-Stream-Turns können dies überschreiten – die ältesten Frames werden stillschweigend verworfen. Clients, die den vollständigen Verlauf benötigen, sollten sich sofort nach der Rückkehr von `load` abonnieren; alternativ können sie die SSE-Event-IDs persistieren und `Last-Event-ID` verwenden, um ab einer späteren Turn-Grenze fortzufahren.

**Fehler:**

- `404` – persistierte Session-ID existiert nicht (`SessionNotFoundError`).
- `400` – `workspace_mismatch` (gleiche Struktur wie `POST /session`).
- `503` – `session_limit_exceeded` (zählt gegen `--max-sessions`; laufende Wiederherstellungen werden ebenfalls berücksichtigt).
- `409` – `restore_in_progress` (ein `session/resume` für dieselbe ID ist bereits im Flug). `Retry-After: 5`. Gleichartige Rennen (zwei gleichzeitige `session/load` für dieselbe ID) werden zusammengefasst – genau einer gibt `attached: false` zurück, die restlichen geben `attached: true` mit demselben `state` zurück.

### `POST /session/:id/resume`

Stellt eine persistierte ACP-Session anhand der ID wieder her, OHNE den Verlauf über SSE abzuspielen. Der Modellkontext wird intern auf der Agent-Seite wiederhergestellt (via `geminiClient.initialize` liest `config.getResumedSessionData`); der SSE-Stream bleibt sauber für Clients, die den Verlauf bereits gerendert haben. Vorher `caps.features.session_resume` prüfen; `unstable_session_resume` bleibt ein veralteter Kompatibilitäts-Alias für ältere Clients.

Gleiche Anfrage-Struktur wie `/load`. Gleiche Antwort-Struktur – `state` spiegelt ACPs `ResumeSessionResponse` wider. Gleiches Fehler-Envelope, einschließlich `409 restore_in_progress` (das ausgelöst wird, wenn ein `session/load` im Flug ist; `session/resume`, das hinter einem anderen `session/resume` hinterherhinkt, wird zusammengefasst).

Verwenden Sie `/load`, wenn der Client noch keinen Verlauf gerendert hat (kaltes Wiederverbinden, Picker → Öffnen). Verwenden Sie `/resume`, wenn der Client die Turns bereits auf dem Bildschirm hat und nur das Handle auf der Daemon-Seite benötigt.

> [!warning] **Warum wird `unstable_session_resume` noch angezeigt?**  
> Die HTTP-Route des Daemons und die Fähigkeit `session_resume` sind für v1 stabil, aber die Bridge ruft immer noch ACPs `connection.unstable_resumeSession` auf. Der alte Tag bleibt nur, damit SDKs, die vor `session_resume` ausgeliefert wurden, weiter funktionieren.

### `GET /workspace/:id/sessions`

Listet alle aktiven Sessions auf, deren kanonischer Workspace mit `:id` übereinstimmt (URL-codierter absoluter cwd).

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

Leeres Array (nicht 404), wenn keine Sessions existieren – eine Session-Picker-UI sollte keinen Fehler werfen, nur weil der Workspace im Leerlauf ist.

### `POST /session/:id/prompt`

Leitet einen Prompt an den Agenten weiter. Mehrfach-Prompt-Aufrufer werden pro Session FIFO-gereiht (ACP garantiert einen aktiven Prompt pro Session).

Anfrage:

```json
{
  "prompt": [{ "type": "text", "text": "What does src/main.ts do?" }]
}
```

Validierung: `prompt` muss ein nicht-leeres Array von Objekten sein. Andere Fehler geben `400` zurück, bevor die Bridge erreicht wird.

Antwort:

```json
{ "stopReason": "end_turn" }
```

Andere Stop-Gründe: `cancelled`, `max_tokens`, `error`, `length` (gemäß ACP-Spezifikation).

Wenn der HTTP-Client die Verbindung während eines Prompts trennt, sendet der Daemon eine ACP-`cancel`-Benachrichtigung an den Agenten, der den Prompt mit `stopReason: "cancelled"` beendet.
> **Stadium‑1‑Einschränkung – kein serverseitiges Prompt‑Timeout.** Die Bridge
> raced nur das `prompt()` des Agenten gegen `transportClosedReject`
> (Absturz des Agent‑Childs) und das HTTP‑Disconnect‑AbortSignal des Aufrufers.
> Ein steckengebliebener, aber noch lebender Agent (z. B. ein hängender Modellaufruf)
> blockiert das FIFO pro Sitzung, bis der HTTP‑Client seinerseits ein Timeout setzt
> und die Verbindung trennt. Langlebige Prompts sind legitim (tiefgehende Recherche,
> Analyse großer Codebasen), daher wird bewusst kein Standard‑Deadline gesetzt;
> Stadium 2 wird ein konfigurierbares `promptTimeoutMs` als Opt‑In bereitstellen.
> Bis dahin sollten Aufrufer ein eigenes clientseitiges Timeout setzen und bei Ablauf
> trennen (oder `POST /session/:id/cancel` aufrufen).

### `POST /session/:id/cancel`

Bricht das **aktuell aktive** Prompt auf der Sitzung ab. ACP‑seitig ist dies eine Benachrichtigung, keine Anfrage – der Agent bestätigt durch Auflösen des aktiven `prompt()` mit `cancelled`.

```bash
curl -X POST http://127.0.0.1:4170/session/$SID/cancel
# → 204 No Content
```

> **Multi‑Prompt‑Vertrag:** cancel betrifft nur das aktive Prompt. Alle Prompts, die der gleiche Client zuvor per POST gesendet hat und die noch hinter dem aktiven in der Warteschlange stehen, werden weiter ausgeführt. Die Multi‑Prompt‑Warteschlange ist ein vom Daemon eingeführtes Verhalten (nicht im ACP‑Standard); der Vertrag für wartende Prompts lautet: „Sie werden weiter ausgeführt, es sei denn, Sie brechen jedes einzelne ab oder beenden die Sitzung über den Kanal‑Exit“.

### `DELETE /session/:id`

Schließt eine aktive Sitzung explizit. Erzwungene Schließung auch dann, wenn andere Clients verbunden sind – bricht jedes aktive Prompt ab, löst ausstehende Berechtigungen als abgebrochen auf, veröffentlicht das `session_closed`-Event, schließt den EventBus und entfernt die Sitzung aus den Daemon‑Maps. Auf der Festplatte persistierte Sitzungen werden NICHT gelöscht – sie können über `POST /session/:id/load` neu geladen werden. Pre‑Flight: `caps.features.session_close`.

```bash
curl -X DELETE http://127.0.0.1:4170/session/$SID
# → 204 No Content
```

Idempotent: gibt `404` für unbekannte Sitzungen zurück (gleiche `SessionNotFoundError`‑Form wie andere Routen).

> **`session_closed`‑Event.** SSE‑Abonnenten erhalten ein terminales `session_closed`-Event mit `{ sessionId, reason: 'client_close', closedBy?: '<clientId>' }`, bevor der Stream endet. SDK‑Reducer behandeln dies identisch zu `session_died` (setzt `alive: false`, löscht `pendingPermissions`).

### `PATCH /session/:id/metadata`

Aktualisiert veränderbare Sitzungsmetadaten. Unterstützt derzeit nur `displayName`. Pre‑Flight: `caps.features.session_metadata`.

Anfrage:

```json
{ "displayName": "My Investigation Session" }
```

| Feld          | Erforderlich | Hinweise                                                                                    |
| ------------- | ------------ | ------------------------------------------------------------------------------------------- |
| `displayName` | nein         | Zeichenkette, maximal 256 Zeichen. Leere Zeichenkette löscht den Namen. Weglassen = belassen. |

Antwort:

```json
{ "sessionId": "<uuid>", "displayName": "My Investigation Session" }
```

Veröffentlicht ein `session_metadata_updated`-Event auf dem SSE‑Stream der Sitzung mit `{ sessionId, displayName }`.

### `POST /session/:id/heartbeat`

Aktualisiert die „zuletzt gesehen“-Buchhaltung des Daemons für diese Sitzung. Langlebige Adapter (TUI/IDE/Web) pingen dies in einem Intervall an, damit eine zukünftige Widerrufsrichtlinie (Wave 5, PR 24) tote von stillen Clients unterscheiden kann.

Header:

| Header                | Erforderlich | Hinweise                                                                                                                                                                                                                                   |
| --------------------- | ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `X-Qwen-Client-Id`    | nein         | Echoed die vom Daemon ausgestellte ID aus `POST /session`. Identifizierte Clients aktualisieren auch ihren clientseitigen Zeitstempel; anonyme Heartbeats aktualisieren nur den sitzungsweiten Watermark. Muss dieselbe `[A-Za-z0-9._:-]{1,128}`-Form wie anderswo erfüllen. |

Der Anfragetext ist leer (`{}` ist in Ordnung – es werden derzeit keine Felder gelesen).

Antwort:

```json
{
  "sessionId": "<sid>",
  "clientId": "<cid>",
  "lastSeenAt": 1700000000123
}
```

`clientId` wird nur dann zurückgegeben, wenn ein vertrauenswürdiger `X-Qwen-Client-Id`-Header übermittelt wurde. `lastSeenAt` ist der daemonseitige `Date.now()`-Epochenwert (ms), den die Bridge gespeichert hat.

Fehler:

- `400` – `{ code: 'invalid_client_id' }`, wenn der Header fehlerhaft ist (Header‑Formregel) oder eine `clientId` enthält, die für diese Sitzung nicht registriert ist (die Bridge wirft `InvalidClientIdError`, bevor ein Zeitstempel aktualisiert wird).
- `404` – unbekannte Sitzung.

Capability‑Gating: Pre‑Flight `caps.features.client_heartbeat`. Ältere Daemons geben `404` für diesen Pfad zurück.

### `POST /session/:id/model`

Wechselt das aktive Modell **innerhalb** des aktuell an die Sitzung gebundenen Modelldienstes. Serialisiert über die sitzungsspezifische Modellwechselwarteschlange.

(Für den Wechsel des _Dienstes_ selbst – Alibaba ModelStudio vs. OpenRouter usw. – übergeben Sie `modelServiceId` in `POST /session` für eine neue Sitzung. Stadium 1 hat keine Live‑Dienstwechselroute.)

Anfrage:

```json
{ "modelId": "qwen-staging" }
```

Antwort:

```json
{ "modelId": "qwen-staging" }
```

Bei Erfolg wird `model_switched` an den SSE‑Stream gesendet. Bei Misserfolg wird `model_switch_failed` gesendet (damit passive Abonnenten den Fehler sehen, nicht nur der Aufrufer). Raced gegen den Exit des Agent‑Kanals, sodass ein steckengebliebenes Child den HTTP‑Handler nicht blockieren kann.

### `POST /session/:id/recap`

Capability‑Tag: `session_recap`. Bridge → ACP extMethod `qwen/control/session/recap`.

Erzeugt eine Ein‑Satz‑Zusammenfassung „Wo bin ich stehengeblieben?“ der Sitzung. Kapselt `generateSessionRecap` aus dem Core (`packages/core/src/services/sessionRecap.ts`), das eine Nebenabfrage gegen das schnelle Modell mit deaktivierten Tools, `maxOutputTokens: 300` und einem strikten `<recap>...</recap>` Ausgabeformat ausführt. Die Nebenabfrage liest den vorhandenen GeminiClient‑Chatverlauf der Sitzung und fügt **keine** Daten hinzu.

Der Anfragetext wird ignoriert (senden Sie `{}` oder leer). Nicht‑striktes Mutations‑Gate – die Haltung spiegelt `/session/:id/prompt` wider (der Aufruf kostet Tokens, verändert aber keinen Zustand). Es wird kein SSE‑Event veröffentlicht.

Antwort (200):

```json
{
  "sessionId": "sess:42",
  "recap": "Debugging the auth retry race. Next: add deterministic timing to the integration test."
}
```

`recap` ist `null` (ein normaler 200‑Status, kein Fehler), wenn:

- die Sitzung noch weniger als zwei Dialogrunden hat,
- die Nebenabfrage keine extrahierbare `<recap>...</recap>` Nutzlast zurückgegeben hat,
- oder ein zugrundeliegender Modellfehler aufgetreten ist (der Core‑Helfer arbeitet nach bestem Wissen und wirft niemals).

Fehler:

- `400 {code: 'invalid_client_id'}` – fehlerhafter `X-Qwen-Client-Id`-Header.
- `404` – Sitzung unbekannt.

Abbruch: **keiner in v1**. Die Route hört nicht auf HTTP‑Client‑Disconnect, es wird kein `AbortSignal` in die Bridge eingebunden, und das ACP‑Child führt die Nebenabfrage unabhängig davon aus, ob der Aufrufer getrennt hat. Die einzigen Begrenzungen sind das 60‑Sekunden‑Backstop‑Timeout der Bridge (`SESSION_RECAP_TIMEOUT_MS`) und die Race‑Bedingung durch Transport‑Schließen gegen den ACP‑Kanal‑Tod. Dies ist akzeptabel, da Recap kurz ist (ein Versuch, `maxOutputTokens: 300`, typischerweise ~1–5 s); eine anfragen‑ID‑basierte Cancel‑Ext‑Methode kann in einer zukünftigen Version vollständige Ende‑zu‑Ende‑Abbruchmöglichkeiten bieten, falls die Bandbreitenkosten dies jemals rechtfertigen.

### Mutation: Approval, Tools, Init, MCP‑Neustart

Issue [#4175](https://github.com/QwenLM/qwen-code/issues/4175) Wave 4 PR 17 fügt vier Mutations‑Steuerrouten hinzu, mit denen Remote‑Clients das Laufzeitverhalten ändern können, ohne die CLI des Daemon‑Hosts zu berühren. Alle vier:

- Sind durch das **strikte** Mutations‑Gate aus PR 15 geschützt. Ein Daemon ohne konfiguriertes Bearer‑Token lehnt sie mit `401 {code: 'token_required'}` ab. Konfigurieren Sie `--token` (oder `QWEN_SERVER_TOKEN`), bevor Sie sie aktivieren.
- Akzeptieren und stempeln den `X-Qwen-Client-Id`-Header (PR 7 Audit‑Chain). Wenn der Header eine vertrauenswürdige ID enthält, gibt der Daemon `originatorClientId` im entsprechenden SSE‑Event aus, sodass Cross‑Client‑UIs Echos ihrer eigenen Mutationen unterdrücken können.
- Führen vor dem Freischalten der Möglichkeit einen Pre‑Flight pro Tag‑Capability durch. Ältere Daemons geben `404` für die Route zurück.

Drei der vier Routen (`tools/:name/enable`, `init`, `mcp/:server/restart`) senden **workspace‑weite** Events: Jeder aktive Sitzungs‑SSE‑Bus empfängt das Event, unabhängig davon, welche Sitzung zum Zeitpunkt der Auslösung der Mutation verbunden war. `approval-mode` sendet ein **sitzungsweites** Event, da die Änderung lokal für die `Config` einer Sitzung ist.

#### `POST /session/:id/approval-mode`

Capability‑Tag: `session_approval_mode_control`. Bridge → ACP extMethod `qwen/control/session/approval_mode`.

Ändert den Approval‑Modus einer laufenden Sitzung. Der neue Modus landet sofort in der sitzungsweiten `Config` des ACP‑Childs. Einstellungen werden standardmäßig NICHT auf die Festplatte geschrieben – übergeben Sie `persist: true`, um auch `tools.approvalMode` in die Workspace‑Einstellungen zu schreiben.

Anfrage:

```json
{ "mode": "auto-edit", "persist": false }
```

`mode` muss einer von `'plan' | 'default' | 'auto-edit' | 'auto' | 'yolo'` sein (Spiegelung des `ApprovalMode`-Enums aus dem Core; das SDK exportiert `DAEMON_APPROVAL_MODES` zur Laufzeitvalidierung). `persist` standardmäßig `false`.

Antwort (200):

```json
{
  "sessionId": "sess:42",
  "mode": "auto-edit",
  "previous": "default",
  "persisted": false
}
```

Fehler:

- `400 {code: 'invalid_approval_mode', allowed: [...]}` – unbekannter Modus‑Literal.
- `400 {code: 'invalid_persist_flag'}` – `persist` ist nicht boolesch.
- `403 {code: 'trust_gate', errorKind: 'auth_env_error'}` – der angeforderte Modus erfordert einen vertrauenswürdigen Ordner (privilegierte Modi in nicht vertrauenswürdigen Workspaces werden von `Config.setApprovalMode` aus dem Core abgelehnt).
- `404` – Sitzung unbekannt.

SSE‑Event (sitzungsweit): `approval_mode_changed` mit `{sessionId, previous, next, persisted, originatorClientId?}`.

#### `POST /workspace/tools/:name/enable`

Capability‑Tag: `workspace_tool_toggle`. Reine Datei‑IO – kein ACP‑Roundtrip.

Schaltet einen Tool‑Namen in der `tools.disabled`‑Einstellungsliste des Workspaces um. Tools, die dort aufgeführt sind, werden **überhaupt nicht** registriert (unterscheidet sich von `permissions.deny`, das das Tool registriert hält und den Aufruf ablehnt). Sowohl eingebaute Tools als auch MCP‑gefundene Tools durchlaufen `ToolRegistry.registerTool`, das die deaktivierte Menge konsultiert.

> ⚠️ **Namen müssen exakt mit dem freigegebenen Bezeichner des Registries übereinstimmen.** Es findet keine Alias‑Auflösung statt – die Route speichert die Zeichenkette, wie sie im Pfadparameter steht, in `tools.disabled`, und das nächste ACP‑Child vergleicht sie beim Registrieren mit `tool.name`. Eingebaute Tools verwenden ihren kanonischen Registry‑Namen (Snake‑Case‑Verbform): `run_shell_command`, `read_file`, `write_file`, `list_directory`, `glob`, `grep_search`, `web_fetch`, usw. – NICHT die Anzeigelabels (`Shell`, `Read`, `Write`), die die CLI anzeigt. MCP‑gefundene Tools verwenden die qualifizierte Form `mcp__<server>__<name>` (dies ist auch die Form, die `tool_toggled`‑Events senden und die `GET /workspace/mcp` auflistet). Das Deaktivieren von `Bash` verhindert NICHT, dass `run_shell_command` bei der nächsten Sitzung registriert wird.

Live‑ACP‑Children behalten bereits registrierte Tools – der Umschaltvorgang wird beim **nächsten** ACP‑Child‑Spawn wirksam. Kombinieren Sie mit `POST /workspace/mcp/:server/restart` (für MCP‑Quell‑Tools) oder der Erstellung neuer Sitzungen, um die Änderung im aktuellen Daemon wirksam zu machen.

Unbekannte Tool‑Namen werden akzeptiert: Das vorbeugende Deaktivieren eines noch nicht installierten MCP‑Tools ist ein legitimer Anwendungsfall.

Anfrage:

```json
{ "enabled": false }
```

Antwort (200):

```json
{ "toolName": "run_shell_command", "enabled": false }
```

Fehler:

- `400 {code: 'invalid_tool_name'}` – leerer Pfadparameter oder Pfadparameter überschreitet die Grenze von 256 Zeichen.
- `400 {code: 'invalid_enabled_flag'}` – `enabled` fehlt oder ist nicht boolesch.

SSE‑Event (workspace‑weit): `tool_toggled` mit `{toolName, enabled, originatorClientId?}`.

#### `POST /workspace/init`

Capability‑Tag: `workspace_init`. Reine Datei‑IO – kein ACP‑Roundtrip, **kein LLM‑Aufruf**.

Erstellt ein leeres `QWEN.md` (oder was auch immer `getCurrentGeminiMdFilename()` unter `--memory-file-name`‑Überschreibungen zurückgibt) im gebundenen Workspace‑Root des Daemons. Rein mechanisch – für KI‑gestützte Inhaltsbefüllung folgen Sie mit `POST /session/:id/prompt`.

Standardmäßig wird das Überschreiben verweigert, wenn die Zieldatei mit Nicht‑Leerraum‑Inhalt existiert. Nur‑Leerraum‑Dateien werden als nicht vorhanden behandelt (entspricht dem lokalen `/init`‑Slash‑Befehl).

Anfrage:

```json
{ "force": false }
```

Antwort (200):

```json
{ "path": "/work/bound/QWEN.md", "action": "created" }
```

`action` ist `'created'` für Neu­erstellungen, `'noop'`, wenn eine vorhandene Nur‑Leerraum‑Datei unberührt gelassen wurde (kein Schreibvorgang), und `'overwrote'`, wenn `force: true` nicht‑leeren Inhalt ersetzt hat. Das `workspace_initialized`‑SSE‑Event spiegelt die Aktion der Antwort wider – Beobachter können nach `action !== 'noop''` filtern, um nur auf tatsächliche Festplattenänderungen zu reagieren.

Fehler:

- `400 {code: 'invalid_force_flag'}` – `force` ist nicht boolesch.
- `409 {code: 'workspace_init_conflict', path, existingSize}` – Datei existiert mit Nicht‑Leerraum‑Inhalt und `force` ist weggelassen/false. Der Body enthält den absoluten Pfad und die Größe (Bytes), sodass SDK‑Clients eine „N Bytes überschreiben?“-Eingabeaufforderung rendern können, ohne die Datei erneut zu statistieren.

SSE‑Event (workspace‑weit): `workspace_initialized` mit `{path, action, originatorClientId?}`.

#### `POST /workspace/mcp/:server/restart`

Capability‑Tag: `workspace_mcp_restart`. Bridge → ACP extMethod `qwen/control/workspace/mcp/restart`.

Startet einen konfigurierten MCP‑Server über `McpClientManager.discoverMcpToolsForServer` des ACP‑Childs neu (Trennen + Neuverbinden + Neu­erkennung). Prüft vorab das Live‑Budget‑Snapshot aus PR 14 v1‑Abrechnung, sodass ein Neustart in einem budgetgesättigten Workspace eine weiche Ablehnung zurückgibt, anstatt eine `BudgetExhaustedError`-Kaskade auszulösen.

Der Anfragetext ist leer (`{}`). Der Pfadparameter ist der URL‑codierte Servername, wie er in der `mcpServers`‑Konfiguration erscheint.

Antwort (200) – diskriminierte Vereinigung über `restarted`:

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

Weiche Überspringungsgründe (alle geben 200 zurück):

| `reason`                | Bedeutung                                                                                                                                                                               |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `'in_flight'`           | Eine andere Erkennung / ein Neustart für diesen Server ist bereits im Gange. Die Route kehrt sofort zurück, anstatt auf das ursprüngliche Promise zu warten. Aufrufer sollte es nach kurzer Verzögerung erneut versuchen. |
| `'disabled'`            | Server ist konfiguriert, aber in `excludedMcpServers` aufgeführt. Vor dem Neustart wieder aktivieren.                                                                                                                  |
| `'budget_would_exceed'` | Daemon ist im `--mcp-budget-mode=enforce`, der Zielserver befindet sich derzeit nicht in `reservedSlots` und die Live‑Summe hat `clientBudget` erreicht. Aufrufer sollte zuerst einen Slot freigeben. |

Fehler (nicht 2xx):

- `400 {code: 'invalid_server_name'}` – leerer Pfadparameter.
- `404` – Servername nicht in `mcpServers`‑Konfiguration, oder es existiert kein Live‑ACP‑Kanal (Neustart erfordert inhärent eine Live‑`McpClientManager`-Instanz).
- `500` – interner Fehler (z. B. `ToolRegistry` nicht initialisiert).

SSE‑Events (workspace‑weit): `mcp_server_restarted` mit `{serverName, durationMs, originatorClientId?}` bei Erfolg; `mcp_server_restart_refused` mit `{serverName, reason, originatorClientId?}` bei weichem Überspringen.

### `GET /session/:id/events` (SSE)

Abonnieren Sie den Ereignisstream der Sitzung.

Header:

```
Accept: text/event-stream
Last-Event-ID: 42        ← optional, spielt ab nach ID 42
```

Query‑Parameter:

| Parameter    | Erforderlich | Hinweise                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ------------ | ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `maxQueued`  | nein         | **Live‑Backlog**-Obergrenze pro Abonnent. Bereich `[16, 2048]`, Standard 256. Wiedergabe‑Frames, die zum Zeitpunkt des Abonnierens erzwungen werden, sind von der Obergrenze ausgenommen; was sie tatsächlich verbraucht, sind Live‑Events, die eintreffen, während der Abonnent noch eine große `Last-Event-ID: 0`-Wiedergabe abarbeitet. Erhöhen Sie den Wert bei kalten Neuverbindungen, damit der Live‑Tail nicht die Warnung / Entfernung bei langsamen Clients auslöst, bevor der Konsument aufholt. Außerhalb des Bereichs / nicht‑dezimal / vorhanden‑aber‑leer geben `400 invalid_max_queued` zurück, bevor der SSE‑Handshake geöffnet wird. Pre‑Flight: `caps.features.slow_client_warning` – alte Daemons ignorieren den Parameter stillschweigend. |

Frame‑Format. Die `data:`-Zeile ist der **vollständige Event‑Envelope**, JSON‑stringifiziert in einer einzigen Zeile – `{id?, v, type, data, originatorClientId?}`. Die ACP‑spezifische Nutzlast (`sessionUpdate`-, `requestPermission`-Argumente usw.) liegt im `data`-Feld des Envelopes; der eigene `type` des Envelopes stimmt mit der SSE‑`event:`-Zeile überein.

```
id: 7
event: session_update
data: {"id":7,"v":1,"type":"session_update","data":{"sessionUpdate":"agent_message_chunk","content":{"type":"text","text":"…"}}}

id: 8
event: permission_request
data: {"id":8,"v":1,"type":"permission_request","data":{"requestId":"<uuid>","sessionId":"<sid>","toolCall":{...},"options":[...]}}

: heartbeat              ← alle 15 s, keine Nutzlast

event: client_evicted    ← terminaler Frame, keine id (synthetisch)
data: {"v":1,"type":"client_evicted","data":{"reason":"queue_overflow","droppedAfter":42}}
```

Die SSE‑`id:` / `event:`-Zeilen duplizieren `envelope.id` / `envelope.type` für EventSource‑Kompatibilität. Raw‑`fetch`-Konsumenten (das SDKs `parseSseStream`) lesen alles aus dem JSON‑Envelope und ignorieren die SSE‑Präambel‑Zeilen.

| Ereignistyp            | Auslöser                                                                                                                                                                                                                                                                                                                  |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `session_update`       | Jede ACP‑`sessionUpdate`-Benachrichtigung (LLM‑Chunks, Tool‑Aufrufe, Nutzung)                                                                                                                                                                                                                                             |
| `permission_request`   | Agent hat Tool‑Genehmigung angefragt                                                                                                                                                                                                                                                                                      |
| `permission_resolved`  | Ein Client hat über eine Berechtigung via `POST /permission/:requestId` abgestimmt                                                                                                                                                                                                                                        |
| `permission_partial_vote` | (nur Konsens) Eine Stimme wurde aufgezeichnet, aber das Quorum ist noch nicht erreicht. Enthält `{requestId, sessionId, votesReceived, votesNeeded, quorum, optionTallies}`. Pre‑Flight: `caps.features.permission_mediation`.                                                                                                                   |
| `permission_forbidden` | Eine Stimme wurde von der aktiven Richtlinie abgelehnt (`designated`-Fehlanpassung, `local-only` nicht‑Loopback oder `consensus`‑Wähler nicht im Snapshot). Enthält `{requestId, sessionId, clientId?, reason}`. Pre‑Flight: `caps.features.permission_mediation`.                                                                                 |
| `model_switched`       | `POST /session/:id/model` war erfolgreich                                                                                                                                                                                                                                                                                 |
| `model_switch_failed`  | `POST /session/:id/model` wurde abgelehnt                                                                                                                                                                                                                                                                                  |
| `session_died`         | Agent‑Child ist unerwartet abgestürzt. **Terminal: SSE‑Stream schließt nach diesem Frame; die Sitzung ist aus `byId` entfernt.** Abonnenten sollten sich via `POST /session` neu verbinden, um eine frische Sitzung zu spawnen.                                                                                              |
| `slow_client_warning`  | Abonnenten‑lokal: Warteschlange ≥ 75 % voll. **Nicht terminal** – der Stream läuft weiter; die Warnung ist ein Hinweis vor der Entfernung. Enthält `{queueSize, maxQueued, lastEventId}`. Wird EINMAL pro Überlaufepisode ausgelöst; wird nach Ablaufen der Warteschlange unter 37,5 % wieder scharf geschaltet. Keine `id` (synthetisch). Pre‑Flight: `caps.features.slow_client_warning`. |
| `client_evicted`       | Abonnenten‑lokal: Warteschlangenüberlauf. **Terminal: SSE‑Stream schließt nach diesem Frame** (keine `id` – synthetisch). Andere Abonnenten derselben Sitzung laufen weiter.                                                                                                                                             |
| `stream_error`         | Daemon‑seitiger Fehler während des Fan‑Outs. **Terminal: SSE‑Stream schließt nach diesem Frame** (keine `id` – synthetisch).                                                                                                                                                                                            |
Wiederverbindungssemantik:

- Sende `Last-Event-ID: <n>`, um Ereignisse mit `id > n` aus dem Sitzungs-Ring (Standardtiefe **8000**, einstellbar via `qwen serve --event-ring-size <n>`) erneut abzuspielen.
- **Lückenerkennung (clientseitig):** Wenn `<n>` älter ist als das älteste noch im Ring vorhandene Ereignis (z. B. verbindest du dich mit `Last-Event-ID: 50` wieder, aber der Ring enthält jetzt 200–1199), spielt der Daemon ab dem ältesten verfügbaren Ereignis ohne Fehler ab. Vergleiche die `id` des ersten erneuten Ereignisses mit `n + 1`; jede Abweichung ist die Größe des verlorenen Fensters. Stufe 2 wird einen expliziten synthetischen Frame `stream_gap` auf dem Daemon einfügen; in Stufe 1 liegt die Erkennung in der Verantwortung des Clients.
- IDs sind monoton pro Sitzung, beginnend bei 1.
- Synthetische Frames (`client_evicted`, `slow_client_warning`, `stream_error`) lassen absichtlich `id` weg, damit sie keine Sequenznummer für andere Abonnenten verbrauchen.

Backpressure:

- Die Warteschlange pro Abonnent enthält standardmäßig `maxQueued: 256` Live-Objekte (Wiederholungsframes während der Wiederverbindung umgehen das Limit). Überschreiben via `?maxQueued=N` (Bereich `[16, 2048]`) in der SSE-Anfrage.
- Wenn die Warteschlange eines Abonnenten zu 75 % gefüllt ist, erzwingt der Bus einen synthetischen `slow_client_warning`-Frame für diesen Abonnenten (einmal pro Überlauf-Episode; erneut aktiviert nach Leeren unter 37,5 %). Der Stream bleibt bestehen – die Warnung ist ein Hinweis, damit der Client schneller leeren oder sauber trennen und erneut verbinden kann.
- Wenn die Warteschlange die Warnung tatsächlich überläuft, sendet der Bus den terminalen `client_evicted`-Frame und schließt das Abonnement.

### `POST /permission/:requestId`

Gib eine Stimme für eine ausstehende `permission_request` ab. Die aktive **Mediation Policy** entscheidet, wer gewinnt:

| Policy                      | Verhalten                                                                                                                                                                                                               |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `first-responder` (Standard) | Jeder validierte Wähler gewinnt; spätere Wähler erhalten `404`. Pre-F3 Baseline.                                                                                                                                        |
| `designated`                | Nur der Prompt-Urheber (`originatorClientId`) entscheidet; Nicht-Urheber erhalten `403 permission_forbidden / designated_mismatch`. Fallback auf first-responder bei anonymen Prompts.                                  |
| `consensus`                 | N-von-M Wähler müssen zustimmen (Standard `N = floor(M/2) + 1`, überschreibbar via `policy.consensusQuorum`). Die erste Option, die `N` erreicht, gewinnt. Nicht entscheidende Stimmen erhalten `200` + `permission_partial_vote` SSE-Frames. |
| `local-only`                | Nur Loopback-Wähler entscheiden; entfernte Aufrufer erhalten `403 permission_forbidden / remote_not_allowed`.                                                                                                           |

Die aktive Policy ist in `settings.json` unter `policy.permissionStrategy` konfiguriert und wird unter `/capabilities` bei `body.policy.permission` angezeigt. Pre-Flight `caps.features.permission_mediation` (mit `modes: [...]`) für den build-unterstützten Satz.

> **F3 (#4175): Multi-Client Berechtigungskoordination.** F3 führte die vier obigen Policies hinzu. Pre-F3 Daemons hatten `first-responder` fest codiert; das Wire-Format bleibt bitweise unverändert, wenn die konfigurierte Policy `first-responder` ist. Neue Ereignisse (`permission_partial_vote`, `permission_forbidden`) sind additiv – alte SDKs sehen sie als `unrecognized_known_event` und ignorieren sie ordnungsgemäß.

> **Berechtigungs-Timeout (Standard 5 Minuten).** Eine `permission_request`
> bleibt ausstehend, bis: (a) ein Client hier abstimmt, (b) `POST /session/:id/cancel`
> ausgelöst wird, (c) der HTTP-Client, der den Prompt steuert, die Verbindung trennt
> (mitten im Prompt abbrechen löst ausstehende Berechtigungen als `cancelled` auf),
> (d) die Sitzung beendet wird, (e) der Daemon heruntergefahren wird, **oder
> (f) das sitzungsspezifische Berechtigungs-Timeout ausgelöst wird** (`DEFAULT_PERMISSION_TIMEOUT_MS`,
> 5 Minuten). Bei Timeout löst sich `requestPermission` des Agenten
> als `{outcome: 'cancelled'}` auf, der Audit-Ring zeichnet einen
> `permission.timeout`-Eintrag auf, der Daemon stderr gibt einen einzeiligen
> Breadcrumb aus, und der SSE-Bus verteilt den standardmäßigen
> `permission_resolved`-Cancelled-Frame, damit Abonnenten aufräumen. Das
> Timeout ist konfigurierbar via `BridgeOptions.permissionResponseTimeoutMs`;
> Headless-Aufrufer, die langlaufende Prompts ausführen, möchten es möglicherweise verlängern.

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

- `{ "outcome": "selected", "optionId": "<eine-der-optionen>" }` — akzeptieren / ablehnen / einmalig ausführen / etc., gemäß den angebotenen Optionen des Agenten
- `{ "outcome": "cancelled" }` — Anfrage verwerfen (entspricht dem, was `cancelSession` / `shutdown` intern tun)

Antwort:

- `200 {}` — deine Stimme wurde angenommen (aufgelöst ODER unter Konsens-Quorum aufgezeichnet)
- `403 { "code": "permission_forbidden", "reason": "designated_mismatch" | "remote_not_allowed", "requestId", "sessionId" }` — F3: die aktive Policy hat deine Stimme abgelehnt
- `404 { "error": "..." }` — die requestId ist unbekannt (bereits aufgelöst, nie existiert oder Sitzung abgebaut)
- `500 { "code": "cancel_sentinel_collision", ... }` — F3: die `allowedOptionIds` des Agenten enthalten den reservierten Sentinel `'__cancelled__'`; Verstoß gegen Agent/Daemon-Vertrag
- `501 { "code": "permission_policy_not_implemented", "policy": "<name>" }` — F3 Vorwärtskompatibilität: ein Policy-Literal ist im Schema vorhanden, aber sein Mediator-Zweig ist noch nicht gebaut (derzeit unerreichbar; für zukünftige Policies reserviert)

Nach einer erfolgreichen Abstimmung sieht jeder verbundene Client `permission_resolved` mit derselben `requestId` und dem gewählten `outcome`. Unter `consensus` verteilen Zwischenstimmen zusätzlich `permission_partial_vote` bis zum Quorum.

### Auth Device-Flow Routen (Issue #4175 PR 21)

Der Daemon vermittelt einen OAuth 2.0 Device Authorization Grant (RFC 8628), sodass ein Remote-SDK-Client einen Login auslösen kann, dessen Tokens auf dem **Daemon**-Dateisystem landen – nicht auf dem Client. Der Daemon fragt selbstständig den IdP ab; die einzige Aufgabe des Clients ist es, die Verifikations-URL + Benutzercode anzuzeigen und (optional) SSE auf Abschlussereignisse zu abonnieren.

Capability-Tag: `auth_device_flow` (immer angekündigt). Unterstützte Anbieter in
v1: `qwen-oauth`.

> [!note]
>
> Der kostenlose Qwen OAuth-Tarif wurde am 15.04.2026 eingestellt. Behandle `qwen-oauth` als
> Legacy-v1-Anbieterkennung in diesem Protokoll; neue Clients sollten einen
> aktuell unterstützten Auth-Anbieter bevorzugen, wenn einer verfügbar ist.

**Laufzeit-Lokalität.** Der Daemon startet niemals einen Browser – selbst wenn er es könnte. Der Client entscheidet, ob er `open(verificationUri)` lokal aufruft; auf einem Headless-Pod (der kanonische Mode-B-Deployment) öffnet der Benutzer die URL auf einem beliebigen Gerät, auf dem ein Browser verfügbar ist. Siehe `docs/users/qwen-serve.md` für die empfohlene UX.

**Kein Token-Leak in Ereignissen.** `auth_device_flow_started` enthält nur `{deviceFlowId, providerId, expiresAt}`. Der Benutzercode und die Verifikations-URL werden Punkt-zu-Punkt im POST-201-Body und via `GET /workspace/auth/device-flow/:id` zurückgegeben; sie werden niemals auf SSE gesendet.

**Ein Singleton pro Anbieter.** Ein zweites `POST` für denselben Anbieter während eines laufenden Flows ist eine idempotente Übernahme – es gibt den vorhandenen Eintrag mit `attached: true` zurück, anstatt eine neue IdP-Anfrage zu starten.

#### `POST /workspace/auth/device-flow`

Strenge Mutationsschranke: erfordert ein Bearer-Token, auch bei Standard-Loopback ohne Token (`401 token_required`).

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

- `400 unsupported_provider` — unbekannte `providerId` (Antwort enthält `supportedProviders`)
- `409 too_many_active_flows` – Workspace-Limit (4) erreicht; abbrechen mit `DELETE`
- `401 token_required` – strenge Schranke hat eine tokenlose Anfrage abgelehnt
- `502 upstream_error` – IdP hat einen unerwarteten Fehler zurückgegeben

#### `GET /workspace/auth/device-flow/:id`

Lese den aktuellen Status. Ausstehende Einträge geben `userCode/verificationUri/expiresAt/intervalMs` zurück; terminale Einträge (5 Min. Gnadenfrist) lassen diese weg und zeigen `status` + optional `errorKind/hint`.

Gibt `404 device_flow_not_found` für unbekannte IDs und nach der Gnadenfrist entfernte Einträge zurück.

#### `DELETE /workspace/auth/device-flow/:id`

Idempotenter Abbruch:

- ausstehender Eintrag → `204` + `auth_device_flow_cancelled` auslösen
- terminaler Eintrag → `204` No-Op (kein erneutes Ereignis)
- unbekannte ID → `404`

#### `GET /workspace/auth/status`

Momentaufnahme der ausstehenden Flows + unterstützter Anbieter:

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

#### Device-Flow SSE-Ereignisse

Fünf typisierte Ereignisse (Workspace-weit, an jeden aktiven Sitzungsbus verteilt):

- `auth_device_flow_started` `{deviceFlowId, providerId, expiresAt}` — POST erfolgreich; SDK sollte abonnieren (kein userCode hier, bei Bedarf via GET abrufen)
- `auth_device_flow_throttled` `{deviceFlowId, intervalMs}` — Daemon hat das upstream `slow_down` beachtet; Clients, die GET abfragen, sollten ihr Intervall entsprechend erhöhen
- `auth_device_flow_authorized` `{deviceFlowId, providerId, expiresAt?, accountAlias?}` — Anmeldedaten gespeichert; `accountAlias` ist ein nicht-PII-konformes Label (niemals E-Mail/Telefon)
- `auth_device_flow_failed` `{deviceFlowId, errorKind, hint?}` — terminal; `errorKind` ist eines von `expired_token | access_denied | invalid_grant | upstream_error | persist_failed`. `persist_failed` ist Daemon-intern: Der IdP-Austausch war erfolgreich, aber der Daemon konnte die Anmeldedaten nicht dauerhaft speichern (EACCES / EROFS / ENOSPC). Der Benutzer sollte es erneut versuchen, sobald der zugrunde liegende Datenträgerzustand behoben ist.
- `auth_device_flow_cancelled` `{deviceFlowId}` — DELETE erfolgreich gegen einen ausstehenden Eintrag

> **Nicht MCP-kompatibel.** Die MCP-Autorisierungsspezifikation (2025-06-18) schreibt OAuth 2.1 + PKCE Auth-Code mit einem Redirect-Callback vor, was für Headless-Pod-Daemons nicht funktioniert. Die Device-Flow-Oberfläche von Mode B ist Daemon-privat – Clients, die auf MCP-konforme Server abzielen, sollten einen anderen Auth-Pfad verwenden.

## Streaming Wire-Format

Ereignisse werden als Standard-EventSource-Frames ausgegeben. Der Daemon schreibt eine `data:`-Zeile pro Frame (das JSON hat nach `JSON.stringify` keine eingebetteten Zeilenumbrüche); der SDK-Parser unter `packages/sdk-typescript/src/daemon/sse.ts` verarbeitet sowohl diese als auch die spezifikationserlaubte Multi-`data:`-Form auf der Empfangsseite.

## Fehlerframes während des Streamings

Wenn der Bridge-Iterator beim Bedienen eines SSE-Abonnenten einen Fehler wirft, gibt der Daemon einen terminalen `stream_error`-Frame aus (kein `id`). Die `data:`-Zeile ist der vollständige Envelope (gleiche Form wie jeder andere SSE-Frame in diesem Dokument); die tatsächliche Fehlermeldung befindet sich unter `envelope.data.error`:

```
event: stream_error
data: {"v":1,"type":"stream_error","data":{"error":"<message>"}}
```

Die Verbindung wird dann geschlossen.

## Umgebungsvariablen

| Var                 | Zweck                                                       |
| ------------------- | ----------------------------------------------------------- |
| `QWEN_SERVER_TOKEN` | Bearer-Token. Führende/nachfolgende Leerzeichen werden beim Start entfernt. |

## Quell-Layout

| Pfad                                                 | Zweck                                                                                                    |
| ---------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `packages/cli/src/commands/serve.ts`                 | Yargs-Befehl + Flag-Schema                                                                               |
| `packages/cli/src/serve/run-qwen-serve.ts`           | Listener-Lebenszyklus + Signalbehandlung                                                                 |
| `packages/cli/src/serve/server.ts`                   | Express-Routen + Middleware                                                                              |
| `packages/cli/src/serve/auth.ts`                     | Bearer + Host-Allowlist + CORS-Ablehnung                                                                  |
| `packages/cli/src/serve/httpAcpBridge.ts`            | Starten/Anhängen + FIFO pro Sitzung + Berechtigungsregister                                              |
| `packages/cli/src/serve/status.ts`                   | Schreibgeschützte Daemon-Status-Wire-Typen + `ServeErrorKind` + `BridgeTimeoutError` + `mapDomainErrorToErrorKind` |
| `packages/cli/src/serve/env-snapshot.ts`             | Reiner Helfer, der `/workspace/env`-Payloads aus `process.*`-Zustand erstellt, inkl. Anmeldeinformations-Schwärzung |
| `packages/acp-bridge/src/eventBus.ts`                | Begrenzte asynchrone Warteschlange + Wiederholungsring                                                   |
| `packages/sdk-typescript/src/daemon/DaemonClient.ts` | TS-Client                                                                                                  |
| `packages/sdk-typescript/src/daemon/sse.ts`          | EventSource-Frame-Parser                                                                                 |
| `integration-tests/cli/qwen-serve-routes.test.ts`    | 18 Tests, kein LLM                                                                                       |
| `integration-tests/cli/qwen-serve-streaming.test.ts` | 3 Tests, echter `qwen --acp`-Kindprozess mit lokalem Fake-OpenAI-Server (nur POSIX; auf Windows übersprungen) |