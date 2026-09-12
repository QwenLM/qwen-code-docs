# Serve Runtime

## Overview

`packages/cli/src/serve/` ist die Boot-Schicht für `qwen serve`. Es übersetzt CLI-Flags in `ServeOptions`, validiert die Startkonfiguration, baut die Express-App, verbindet Middleware, registriert Routen, stellt Daemon-Host-Pre-Flight-/Status-Provider bereit, verwaltet den Permission-Audit-Ring und steuert die zweiphasige Graceful-Shutdown-Sequenz. HTTP-bezogene Arbeit liegt in dieser Schicht; ACP-bezogene Arbeit liegt eine Schicht tiefer in `@qwen-code/acp-bridge` (siehe [`03-acp-bridge.md`](./03-acp-bridge.md)).

## Responsibilities

- Parsen und Validieren von `ServeOptions`: Listen-Adresse, Auth, Workspace, Session-/Connection-Caps, MCP-Budget/-Pool, CORS, Prompt-/SSE-/Session-Idle-Timeouts, Rate-Limit und zugehörige Toggles.
- Den primären Workspace genau einmal **kanonisieren** und jedes wiederholte `--workspace` kanonisieren, bevor Session-Runtimes registriert werden. Die primäre kanonische Form wird von `/capabilities.workspaceCwd`, dem `POST /session`-Fallback und der primären Bridge gemeinsam genutzt.
- Den Bearer auflösen: `--token`, dann `QWEN_SERVER_TOKEN`, dann – wenn keine dieser Quellen vorhanden ist und der angeforderte `--hostname` Non-Loopback ist (wobei das literale `localhost` einmal zuerst aufgelöst wird) – ein generierter ephemeral 128-Bit-Base64url-Bearer (22 Zeichen), der einmalig beim Start ausgegeben wird. Loopback-Schreibweisen generieren niemals und behalten den trusted Token-losen Modus, außer `--require-auth` ist gesetzt. Die Generierung basiert auf der Schreibweise, während die Boot-Verweigerung die aufgelöste Adresse liest, was zwei Ausnahmen ergibt: ein `localhost`, der zu Non-Loopback auflöst, generiert niemals und bootet nur, wenn eine Token-Quelle aufgelöst wurde (andernfalls `Refusing to bind …`); und ein nicht-literaler Name, der zu Loopback auflöst, generiert sehr wohl, verliert den trusted Token-losen Modus, sodass sein Bearer nur Token-basiert ausgibt.
- Unsichere oder ungültige Startkonfigurationen ablehnen: ein Non-Loopback-Bind, dessen Token-Quelle explizit leer ist, `--require-auth` bei einem token-loser Loopback-Bind, Wildcard- oder Non-Loopback-HTTP(S)-`--allow-origin` bei einem token-loser Loopback-Bind, `mcpBudgetMode='enforce'` ohne positives `mcpClientBudget`, ein nicht existierender oder kein Verzeichnis-`--workspace` sowie ungültige Timeout- oder Rate-Limit-Werte.
- Die `WorkspaceFileSystem`-Factory, den Permission-Audit-Publisher, den `DaemonStatusProvider` und die `acp-bridge` konstruieren.
- Die Express-App bauen, Middleware verdrahten (Loopback-`Origin`-Strip -> Access-Log -> Inbound-Trace-ID-Erfassung -> `hostAllowlist` -> Remote-Same-Origin-`Origin`-Strip -> `allowOriginCors` über die mutable Origin-Allowlist -> Pre-Auth-`/health` -> Pre-Auth-Web-Shell-Assets -> Channel-Webhooks -> `bearerAuth` -> Rate-Limit -> JSON-Parser -> Telemetrie -> routenbezogene `mutationGate`) sowie Session-, Workspace-CRUD-, File-, Device-Flow-Auth-, Permission-Vote- und ACP-HTTP-Routen mounten. (Die bedingungslose `denyBrowserOriginCors`-Mauer bleibt nur in der Bootstrap-App, `run-qwen-serve.ts`.)
- Den Listening-Port binden und Signal-Handler registrieren.
- Zweiphasigen Shutdown bei SIGINT/SIGTERM ausführen; Force-Exit bei einem zweiten Signal.

## Architecture

**Entry**: `runQwenServe(opts, deps)` in `packages/cli/src/serve/run-qwen-serve.ts`. Gibt ein `RunHandle` (`{ url, port, close, ... }`) zurück.

**App-Factory**: `createServeApp(opts, getPort, deps)` in `packages/cli/src/serve/server.ts`. Baut die Express-`Application`. Direkte Embedder und Tests rufen sie ohne den Bootstrap-Wrapper auf.

**Capability-Registry**: `SERVE_CAPABILITY_REGISTRY` in `packages/cli/src/serve/capabilities.ts`. Jeder Tag hat eine `since`-Version und optionale `modes`. Bedingte Tags werden weggelassen, wenn ihr Deployment- oder Runtime-Prädikat falsch ist; die Registry und die Prädikat-Map sind maßgeblich. Siehe [`11-capabilities-versioning.md`](./11-capabilities-versioning.md).

**Middleware** (`packages/cli/src/serve/auth.ts`, `server.ts`, `server/self-origin.ts` und `server/access-log.ts`):

| Middleware, in Registrierungsreihenfolge | Zweck | Hinweise |
| --- | --- | --- |
| `installSelfOriginStripMiddleware` | Löscht einen `Origin`-Header, der für den gebundenen Port einem Loopback-Same-Origin-Wert entspricht, sodass die POST/fetch-Aufrufe der Loopback-WebShell selbst nie als Cross-Origin behandelt werden. | Erste Middleware auf der Runtime-App. Matcht beide Schemes und den gebundenen Loopback-Host und lässt Scheme-Standard-Ports gemäß RFC 7230 §5.4 weg. |
| Access-Log-Middleware | Protokolliert Methode, Pfad, Status, durationMs, sessionId und clientId im `DaemonLogger`, wenn ein Request abgeschlossen ist. | Vor jedem Gate registriert, sodass `401` / `403` / `429`-Kurzschlüsse ebenfalls protokolliert werden. Befreit **nach exaktem Pfad**: `GET /health` und `POST */heartbeat`, sodass diese Liveness-Probes nie protokolliert werden – auch nicht, wenn ein darunterliegendes Gate sie ablehnt (`HEAD /health` und `GET /health/` werden wie jeder andere Request protokolliert). Erfolgreiche `GET */events`-Streams werden ebenfalls verworfen. Burst-limitiert auf 60 Zeilen, die sich mit 2/s auffüllen; Überlauf wird zu einer `access logs suppressed`-Warnung zusammengefasst. Pre-Authentication-Gate-Ablehnungen (Host-Allowlist, die CORS-Mauer, die Remote-Same-Origin-Credential-Prüfung) ziehen aus einem separaten 30/1-s-Budget, sodass ein Credential-loser Flood dieser Ablehnungen die eigenen Zeilen des Operators hinter dieser Warnung nicht aushungern kann; `bearerAuth`-401s (ein No-Origin-Flood) werden nicht markiert und belasten weiterhin das Operator-Budget – unverändert seit der Neuanordnung. |
| Inbound-Trace-ID-Erfassung | Erfasst die `traceparent`-Trace-ID des Aufrufers, bevor ein Gate kurzschließen kann. | Ermöglicht dem Access-Log, eine `401` / `429` / `400` / `404`-Zeile in Telemetrie-aus-Deployments mit der Trace des Aufrufers zu verknüpfen, wo sie die einzige derartige Verknüpfung ist. |
| `hostAllowlist(bind, getPort)` | Auf Loopback validieren, dass `Host` zu `localhost`, `127.0.0.1`, `[::1]`, `host.docker.internal` oder der exakt gebundenen Loopback-Adresse gehört, plus dem tatsächlichen Port; Port-lose Formen werden auf den Ports 80 und 443 akzeptiert. | Schutz gegen DNS-Rebinding; deckt daher auch die darunterliegenden Pre-Auth-`/health`-Routen ab. Der Vergleich ist case-insensitive und wird pro Port gecacht. Auf Non-Loopback-Binds bewusst ein No-op, wo der Bearer die Authentifizierungsschicht ist. Der Local-Control-LAN-Listener erzwingt immer seine Advertised-Authority-Hostprüfung, unabhängig vom primären Bind. |
| `installRemoteSelfOriginMiddleware` | Auf einem Non-Loopback-Primary-Listener mit Token: Bearer-authentifiziert einen Request, dessen `Origin` dem direkten Socket-Scheme plus dem normalisierten `Host` entspricht, und löscht dann diesen `Origin`. | Dies lässt die Same-Origin-HTTP-Mutationen der eingebauten WebShell ohne `--allow-origin` durch. No-op bei Loopback-Binds und wenn kein Token konfiguriert ist. Pre-Auth-WebShell-Routen (`/`, `//`, `/assets*`, `/mcp-app-sandbox`, exakte `/session/:id`-Document-Navigations) überspringen die Credential-Prüfung. Forwarded-Header werden nie konsultiert. |
| `allowOriginCors` | Immer auf der Runtime-App über eine `MutableOriginAllowlist` installiert: `--allow-origin <pattern>`-Einträge seeden sie, Local Control fügt die LAN-Origin hinzu, während es aktiviert ist; nicht übereinstimmende Origins erhalten den 403-Deny-Envelope. | Siehe [`12-auth-security.md`](./12-auth-security.md). Seine Ablehnungen werden vom Access-Log oben protokolliert, außer bei den Health/Heartbeat-Ausnahmen. |
| Pre-Auth-`/health` | Liveness-Route, die auf einem gewöhnlichen Loopback-Bind vor `bearerAuth` registriert wird. | Entfällt unter `--require-auth` und wird bei einem Non-Loopback-Bind nie pre-auth registriert; in diesen Fällen wird `/health` stattdessen nach `bearerAuth` registriert. Ein Local-Control-Listener authentifiziert sein eigenes `/health` auch in der Pre-Auth-Position. |
| Web-Shell-Static-Assets und MCP-App-Sandbox | `/`, `/assets*`, `/mcp-app-sandbox` und exakte `/session/:id`-Document-Navigations, vor `bearerAuth` gemountet. | Ein Browser kann `Authorization` nicht bei einer Navigation oder einer `<script src>`-Subresource anhängen, und die statische Shell enthält keine Secrets. Der SPA-Deep-Link-Fallback wird stattdessen nach allen API-Routen registriert. `--no-web` optet aus. |
| Channel-Webhook-Routen | `POST /channels/:channelName/webhooks/:source`, vor `bearerAuth` registriert. | Authentifiziert mit seinem eigenen `x-qwen-webhook-secret`; das Rotieren des Daemon-Bearers rotiert nicht die Webhook-Secrets. |
| `bearerAuth(token)` | SHA-256 plus `timingSafeEqual` Constant-Time-Bearer-Vergleich. | Offener Passthrough, wenn kein Token konfiguriert ist (Loopback-Dev-Standard). Das `Bearer`-Schema ist case-insensitive. |
| Rate-Limit-Middleware | Optionaler Token-Bucket pro Stufe für Prompt-, Mutations- und Read-Routen. | Nach `bearerAuth` und vor dem JSON-Parsing registriert, sodass nur authentifizierte Requests gezählt werden; gibt 429 vor dem Parsing zurück, wenn ein Bucket erschöpft ist. Webhook-Routen verwenden stattdessen ihr eigenes Shared-Secret-Gate. |
| `express.json({ limit: '10mb' })` | JSON-Body-Parsing. | Parse-Fehler geben 400 zurück. |
| `daemonTelemetryMiddleware` | Wrapper für klassifizierte Daemon-API-Requests, die diesen Punkt erreichen, in einem OpenTelemetry-Span durch `withDaemonRequestSpan`. | Attribute umfassen kanonische Route, aufgelösten Workspace-Hash, sessionId, clientId und Statuscode. Frühere Auth-, Rate-Limit- und Body-Parser-Ablehnungen liegen außerhalb dieser Span-Grenze. |
| `createMutationGate` (pro Route) | Opt-in-Gate auf Routen-Ebene für Mutations, die Operator-Autorität erfordern. Qualifiziert sind vertrauenswürdige Primary-Listener-Requests, Bearer-authentifizierte Requests und gepaarte Local-Control-Requests. | Ein token-loser Primary-Request, der das strikte Gate ohne Trusted-Loopback-Autorität erreicht, gibt `401 { code: 'token_required' }` zurück. Fehlende oder ungültige konfigurierte Credentials werden früher von der Bearer-Middleware mit schlichtem `401 Unauthorized` abgelehnt. Kein globales `app.use`; Routen rufen bei Bedarf `mutate({ strict: true })` auf. |

Die **Bootstrap-App**, die während des Cold-Windows Requests beantwortet (`createBootstrapServeApp` in `run-qwen-serve.ts`), betreibt eine kürzere Chain in dieser Reihenfolge: Loopback-`Origin`-Strip -> `hostAllowlist` -> Remote-Same-Origin-`Origin`-Strip -> die CORS-Mauer (`allowOriginCors` wenn `--allow-origin` gesetzt ist, andernfalls die bedingungslose `denyBrowserOriginCors`) -> Pre-Auth-`/health` auf einem gewöhnlichen Loopback-Bind -> `bearerAuth` -> die gegateten `/health`-, `/capabilities`- und `/daemon/status`-Routen. Sie installiert kein Access-Log, sodass nur die Requests, die sie selbst beantwortet – `/health`, `/capabilities` und `/daemon/status` – nicht protokolliert werden. Der delegierende Wrapper (`createDelegatingServeApp`) sitzt davor mit seinem eigenen Bearer-Gate: Jeder andere Cold-Window-Pfad startet die Runtime und wird an die Runtime-App dispatched, die ihn protokolliert, wobei `durationMs` ab diesem Handoff gemessen wird, nicht ab dem client-sichtbaren Start. Mit `--open` beantwortet die Runtime-App direkt, sodass es gar kein Cold-Window gibt.

**Subsystems**:

| Pfad | Rolle |
| --- | --- |
| `serve/fs/` | `WorkspaceFileSystem`-Factory plus `policy.ts` (Size/Trust/Binary-Checks), `paths.ts` (Kanonisierung, resolveWithin, Symlink-Ablehnung), `audit.ts` und typisierte `FsError`-Werte. |
| `serve/routes/workspace-file-read.ts`, `workspace-file-write.ts` | HTTP-Handler für `GET /file`, `GET /file/bytes`, `POST /file/write` und `POST /file/edit`. |
| `serve/workspace-memory.ts` | `GET/POST /workspace/memory` (QWEN.md CRUD). |
| `serve/workspace-agents.ts` | `GET/POST/DELETE /workspace/agents` (Subagent-CRUD). |
| `serve/daemon-status-provider.ts` | Env-Snapshot plus Daemon-Host-Pre-Flight-Zellen: Node-Version, CLI-Entry, Workspace-Stat, ripgrep, git, npm. |
| `serve/permission-audit.ts` | `PermissionAuditRing` (512-Einträge FIFO) und `createPermissionAuditPublisher`. |
| `serve/auth/device-flow.ts`, `qwen-device-flow-provider.ts` | Device-Flow-OAuth-Routen. Siehe [`12-auth-security.md`](./12-auth-security.md). |
| `serve/daemon-logger.ts` | `DaemonLogger` strukturierte Datei-Logs. Siehe [`19-observability.md`](./19-observability.md). |
| `serve/debug-mode.ts` | Gemeinsames `isServeDebugMode()`-Prädikat zur Steuerung des ausführlichen Fehlerkontexts in HTTP-Antworten. |
| `serve/acp-http/` | ACP Streamable HTTP Transport (RFD #721), gemountet unter `/acp`. Sieben Dateien implementieren JSON-RPC POST, SSE GET, DELETE-Teardown und die gemeinsame Bridge-Nutzung parallel zur REST-Oberfläche. |
| `serve/web-shell-static.ts`, `serve/web-shell-resolver.ts` | Lokalisieren und mounten der gebauten Web-Shell-Assets (die Browser-UI des Daemons) unter `/`, `/assets` und `/session/:id`, sowie den SPA-Deep-Link-Fallback, der nach allen API-Routen registriert wird. Wird in jedem Launch-Modus **vor** `bearerAuth` gemountet, da ein Browser `Authorization` nicht bei einer Navigation oder Subresource anhängen kann. API-Aufrufe folgen der normalen Authority-Policy: Konfigurierte Token schützen normale API-Routen außer Loopback-`/health`, es sei denn, `--require-auth` ist gesetzt, während Channel-Webhook-Ingress immer sein eigenes Shared Secret verwendet und der token-lose Trusted-Loopback-Primary-Listener vollen Operator-Zugriff hat. Fällt auf API-only zurück, wenn die Assets fehlen; `--no-web` optet aus. |

**ACP-Bridge-Package-Imports**:

- Event-Bus-Primitive werden aus `@qwen-code/acp-bridge/eventBus` importiert.
- Status-Primitive werden aus `@qwen-code/acp-bridge/status` importiert.
- `serve/acp-session-bridge.ts` bleibt als CLI-lokale Kompatibilitäts-Fassade für die breitere Bridge-Oberfläche erhalten.

## Ablauf

### Boot-Sequenz

Bevor `runQwenServe()` diese Sequenz startet, validiert der CLI-exklusive `--open-with-auth`-Modus die Loopback/Web-Shell-Eignung und füllt `ServeOptions.token` mit dem ausgewählten konfigurierten Token oder mit 32 zufälligen Bytes (ein 256-Bit-Bearer), kodiert als base64url, wenn diese Auswahl leer ist. Dieser generierte Wert ist für jeden der folgenden Schritte ein gewöhnliches konfiguriertes Token – weshalb `--require-auth --open-with-auth` bootet – und er ist ein separater Generator vom ephemeral Non-Loopback-Bearer in Schritt 1. Direkte Embedder, die `createServeApp` selbst aufrufen, generieren niemals ein Token.

1. **Token auflösen** aus `opts.token` oder `QWEN_SERVER_TOKEN`, getrimmt, sodass ein abschließender Newline von `cat token.txt` den Bearer-Vergleich nicht stillschweigend brechen kann. Wenn der angeforderte `--hostname` Non-Loopback ist (wobei das literale `localhost` einmal zuerst aufgelöst wird) und **keine** der beiden Quellen vorhanden ist, wird ein ephemeral 128-Bit (16-Byte) Bearer als 22 base64url-Zeichen generiert, anstatt abzulehnen; er wird einmalig vom Remote-Quickstart nach `listen()` ausgegeben und rotiert bei jedem Neustart. Loopback-Schreibweisen generieren niemals, sodass sie den trusted Token-losen Modus behalten. Eine **ausdrücklich leere** Quelle (`--token ''` oder `QWEN_SERVER_TOKEN` auf einen leeren oder nur aus Whitespace bestehenden Wert gesetzt) ist nicht „abwesend“, unterdrückt also immer die Generierung – aber die Leerheit entscheidet das aufgelöste Token nur in eine Richtung: ein leeres `--token` shadowed einen gesetzten Env-Wert und löst zu keinem Token auf, während ein leeres Env nur dann zu keinem Token auflöst, wenn `--token` nicht übergeben wird (ein nicht-leeres `--token` gewinnt trotzdem); in beiden Fällen scheitert ein Non-Loopback-Bind ohne aufgelöstes Token weiterhin an den Guards unten.
2. **Hostname-Typo-Guard**: `--hostname localhost:4170` erzeugt einen Fehler und schlägt `--port` vor.
3. **Auth-Pre-Flight**: Ein Non-Loopback-Bind ohne _aufgelöstes_ Token wird abgelehnt – erreichbar durch eine ausdrücklich leere Quelle oder durch einen `localhost`-Bind, dessen einmalige Auflösung auf Non-Loopback landet (die Generierung basiert auf der Schreibweise, dort wurde also nichts generiert); `--require-auth` wird bei einem token-loser Bind abgelehnt, was nach Schritt 1 einen Loopback-Bind ohne konfigurierte Quelle bedeutet. Wildcard- und Non-Loopback-HTTP(S)-`--allow-origin`-Guards lesen dasselbe aufgelöste Token, sodass auf einem Non-Loopback-Bind der generierte Bearer sie erfüllt und diese Ablehnungen ebenfalls nur Loopback betreffen.
4. **Workspace-Validierung**: absoluter Pfad, existiert, Verzeichnis. `EACCES` / `EPERM` werden ummantelt, um auf den Flag hinzuweisen.
5. **Workspace kanonisieren**: `canonicalizeWorkspace(rawWorkspace)` führt `realpathSync.native` einmal aus und speist `/capabilities`, den `POST /session`-Fallback und die Bridge.
6. **MCP-Budget-Validierung**: positive ganze Zahl; `enforce` erfordert ein Budget.
7. **MCP-Pool-Toggle-Inferenz**: Parent-Env `QWEN_SERVE_NO_MCP_POOL=1` setzt `mcpPoolActive=false`, sodass die Capabilities `mcp_workspace_pool` und `mcp_pool_restart` korrekt weglassen.
8. **CORS-/Timeout-/Rate-Limit-Validierung**: Wildcard- und Non-Loopback-HTTP(S)-`--allow-origin`-Werte erfordern ein aufgelöstes Token (siehe Schritt 3, warum diese Ablehnungen nur Loopback betreffen); Prompt-, Writer-, Channel-Idle-, Session-Idle-, Reaper- und Rate-Limit-Window-Werte schlagen bei Ungültigkeit sofort fehl (fail fast).
9. **Handle-spezifische `childEnvOverrides`**: `QWEN_SERVE_MCP_CLIENT_BUDGET` und `QWEN_SERVE_MCP_BUDGET_MODE` über `BridgeOptions.childEnvOverrides` an das ACP-Child übergeben, anstatt `process.env` zu mutieren.
10. **`settings.json` einmalig laden**: `context.fileName`, `policy.permissionStrategy` und `policy.consensusQuorum` lesen. Beschädigte Dateien fallen auf Standardwerte zurück. `validatePolicyConfig()` prüft `policy.*` gegen `SERVE_CAPABILITY_REGISTRY.permission_mediation.modes`; unbekannte Strategien oder ein nicht-positives `consensusQuorum` werfen `InvalidPolicyConfigError`. Ein unter einer Nicht-`consensus`-Strategie gesetztes Quorum protokolliert eine Stderr-Warnung.
11. **`PermissionAuditRing` allokieren** (512 Einträge).
12. **`fsFactory` bauen**: `runQwenServe` ist standardmäßig `trusted: true`; direkte `createServeApp`-Aufrufer sind standardmäßig `trusted: false` und warnen einmalig.
13. **`createHttpAcpBridge`**, siehe [`03-acp-bridge.md`](./03-acp-bridge.md).
14. **`createServeApp`** assembliert Express.
15. **HTTP(S)-Server erstellen und lifecycle-binden vor dem Lauschen**, dann `server.listen(port, hostname)` aufrufen und den tatsächlichen `getPort()` für die Host-Allowlist auflösen. Die Conversations-Ownership kann erst starten, wenn dieser Listener und die verbleibenden Host-Startup-Gates bereit sind.
16. **SIGINT-/SIGTERM-Handler registrieren** für Graceful Shutdown über den gemeinsamen App-Lifecycle.

### Graceful Shutdown

1. **Admission versiegeln und alle Drains beginnen** beim ersten Signal:
   - Die Device-Flow-Registry verwerfen und ausstehende Flows abbrechen.
   - `bridge.shutdown()` markiert jeden Kanal mit `isDying = true`, sendet Graceful Close an die Stdin jedes ACP-Childs, wartet `KILL_HARD_DEADLINE_MS` (10s) pro Kanal und ruft dann bei Bedarf `channel.kill()` auf.
2. **Den Listener schließen, während App- und Host-Drains laufen**:
   - `server.close()` stoppt die Annahme neuer Verbindungen und lässt laufende Requests abschließen.
   - `SHUTDOWN_FORCE_CLOSE_MS` (5s) löst `server.closeAllConnections()` aus.
   - Eine zweite 2s-Frist eskaliert bei Bedarf erneut.
3. **Conversations-Ownership erst nach positivem Shutdown-Nachweis freigeben** vom Listener, App-lokaler Arbeit, Host-eigener Arbeit, Live-Discovery-Cleanup und Runtime-Drains. Jeder unvollständige Nachweis lehnt den Shutdown ab, anstatt eine unsichere Übergabe zuzulassen.
4. **Zweites Signal beim Beenden**:
   - `bridge.killAllSync()` + `process.exit(1)`, um zu verhindern, dass verwaiste Childs den Daemon-Exit blockieren.

## State und Lifecycle

`RunHandle` bietet:

- `url`: aufgelöste Listen-URL, nach der Auflösung des ephemeren Ports.
- `port`: tatsächlicher Port, einschließlich der `0`-Auflösung.
- `close()`: programmatischer Shutdown für Embedder und Tests.

Der direkte Aufruf von `createServeApp` gibt weiterhin nur eine `Application` zurück. Ein Embedder, der Live/Conversations benötigt, muss den tatsächlichen Node-Server erstellen, `getServeAppLifecycle(app).bindServer(server)` vor dem ersten `listen()` aufrufen und `lifecycle.close()` während des Shutdowns awaiten. Ohne Binding bleiben gewöhnliche Routen verfügbar, aber Live/Conversations schlagen fail-closed fehl. Der Aufruf von `server.close()` löst eine ereignisgesteuerte Aufräumaktion aus, aber der Embedder muss dennoch `lifecycle.close()` awaiten, um Drain- oder Ownership-Fehler zu beobachten.

## Dependencies

| Upstream verwendet von `serve/` | Downstream verwendet `serve/` |
| --- | --- |
| `@qwen-code/acp-bridge`: Bridge, Event-Bus, Status-Typen | Der `serve`-Subcommand-Handler der `qwen`-CLI |
| `packages/core`: `getAllMemoryFilenames`, `Config`, `WorkspaceContext` | Direkte Embedder, Tests |
| ACP SDK (`@agentclientprotocol/sdk`): `PROTOCOL_VERSION`, `ClientSideConnection` über Bridge | |
| Express + body-parser, `node:crypto`, `node:fs`, `node:path` | |

## Konfiguration

| Quelle | Schlüssel | Effekt |
| --- | --- | --- |
| Env | `QWEN_SERVER_TOKEN` | Bearer-Token nach dem Trimmen. |
| Env | `QWEN_SERVE_NO_MCP_POOL=1` | Erzwingt `mcpPoolActive=false`. |
| ACP-Child-Env | `QWEN_SERVE_MCP_CLIENT_BUDGET` / `QWEN_SERVE_MCP_BUDGET_MODE` | Generiert aus `--mcp-client-budget` / `--mcp-budget-mode` und weitergeleitet über `childEnvOverrides`. |
| Env | `QWEN_SERVE_PROMPT_DEADLINE_MS` / `QWEN_SERVE_WRITER_IDLE_TIMEOUT_MS` | Standard-Prompt-/SSE-Idle-Timeouts. |
| Env | `QWEN_SERVE_RATE_LIMIT*` | Rate-Limit-Schalter, Prompt-/Mutations-/Read-Caps und Window-Standardwert. |
| Env | `QWEN_SERVE_DEBUG=1` | Ausführliche Stderr-Logs. Siehe [`19-observability.md`](./19-observability.md). |
| Flags | `--hostname`, `--port` | Listen-Binding. |
| Flags | `--token`, `--require-auth`, `--enable-session-shell` | Bearer-Token, Loopback-Auth-Härtung und expliziter Shell-Ausführungsschalter. |
| CLI-Flags       | `--open-with-auth`                                                                                         | Standardmäßig deaktivierter Loopback-Web-Shell-Start, der einen prozesslebenslangen Bearer vor der Runtime wiederverwendet oder generiert. |
| Flag            | `--workspace`                                                                                              | Überschreibt `process.cwd()`; wiederholbar, um zusätzliche isolierte Workspace-Runtimes zu registrieren.                      |
| Flags | `--max-sessions`, `--max-pending-prompts-per-session`, `--max-connections`, `--event-ring-size` | Bridge-/Express-Caps. |
| Flags | `--mcp-client-budget=N`, `--mcp-budget-mode={off,warn,enforce}` | An das ACP-Child weitergeleitet. |
| Flags | `--allow-origin`, `--allow-private-auth-base-url` | Browser-CORS-Allowlist und Installationsschalter für Localhost/Private-Auth-Provider. |
| Flag            | `--web` / `--no-web`                                                                                       | Web-Shell-UI am Daemon-Root ausliefern oder überspringen (Standard: ausliefern). `--no-web` lässt den Daemon API-only. |
| Flags           | `--prompt-deadline-ms`, `--writer-idle-timeout-ms`, `--channel-idle-timeout-ms`, `--initialize-timeout-ms` | Prompt-, SSE-Writer-, ACP-Child-Idle-Lifecycle- und ACP-Child-Request-Timeout-Steuerung.               |
| Flags | `--session-reap-interval-ms`, `--session-idle-timeout-ms` | Steuerung des Reapings getrennter Sessions. |
| Flags | `--rate-limit*` | HTTP-Rate-Limit pro Stufe. |
| `settings.json` | `policy.permissionStrategy`, `policy.consensusQuorum` | `MultiClientPermissionMediator`-Policy und Quorum. |
| `settings.json` | `context.fileName` | Workspace-Memory-Dateiname, der über das `contextFilename` des Workspace-Service an `/workspace/init` übergeben wird. |
Siehe [`17-configuration.md`](./17-configuration.md) für die zusammengeführte Referenz.

## Einschränkungen und bekannte Limits

- Bei direktem Aufruf von `createServeApp` ohne `deps.fsFactory` oder `deps.bridge` ist der Standardwert `trusted: false`; das agentenseitige ACP `writeTextFile` wird mit `untrusted_workspace` abgelehnt. Die Warnung wird einmalig ausgegeben.
- Die Runtime-App betreibt `allowOriginCors` über die mutable Allowlist; nicht übereinstimmende `Origin`-Werte erhalten den 403-Deny-Envelope (die bedingungslose `denyBrowserOriginCors`-Mauer überlebt nur in der Bootstrap-App). Die **Loopback**-Web-Shell funktioniert, weil eine andere Middleware zuvor übereinstimmende Loopback-Same-Origin-Werte entfernt; auf einem Non-Loopback-Bind mit Token sind die Same-Origin-XHRs der Shell Bearer-authentifiziert und ihr `Origin` wird vor der Mauer entfernt, sodass sie kein `--allow-origin` benötigen. Drei Fälle erfordern weiterhin einen Allowlist-Eintrag: WebSocket-Upgrades (Terminal, Voice), ein TLS-terminierender Front-Proxy, dessen `https`-Origin niemals zum Plain-Socket passt, und jeder Plain-HTTP-Intermediär, der den `Host`-Header umschreibt – nginxs Standard-`proxy_set_header Host $proxy_host` und k8s Ingress tun beide. Port-Translation allein benötigt **auf einem Non-Loopback-Bind** nichts (`docker -p 8080:4170`): der Check vergleicht `Origin` nur mit dem normalisierten weitergeleiteten `Host` und konsultiert niemals den Listening-Port (nur die Scheme-Standard-Ports `:80`/`:443` werden entfernt; ein Nicht-Standard-Port muss unverändert darin überleben). Auf dem Standard-**Loopback**-Bind tut er das nicht: die DNS-Rebinding-Host-Allowlist akzeptiert nur den eigenen Port des Daemons, daher wird ein Port-translatierender Tunnel (`ssh -L 8080:localhost:4170`) mit `403 Invalid Host header` für jeden Request einschließlich des Shell-Dokuments abgelehnt, und `--allow-origin` kann das nicht überschreiben – den gleichen Port weiterleiten oder Non-Loopback binden. Das Mittel für die WebSocket- und TLS-Terminierungsfälle ist `--allow-origin <origin>`; ein Host-umschreibender Intermediär kann stattdessen konfiguriert werden, `Host` unverändert weiterzuleiten – was nicht helfen kann, sobald TLS am Proxy terminiert, weil der Scheme aus dem eigenen Socket des Daemons gelesen wird.
- Body-Parser-Reihenfolge: Routes, die `mutate({ strict: true })` verwenden, geben 401 erst nach `express.json()` zurück. Der Worst-Case ist `--max-connections × express.json({limit: '10mb'})`, was bis zu etwa 2,5 GB temporären Speicher auf einem ausgelasteten Loopback-Listener bedeutet; dieser Kompromiss ist beabsichtigt.
- Mehrere Daemons in einem Prozess müssen `childEnvOverrides` pro Handle verwenden; das Mutieren von `process.env` führt zu Race Conditions, da `defaultSpawnChannelFactory` die Umgebungsvariablen zum Zeitpunkt des Spawns als Snapshot erfasst.

## Referenzen

- `packages/cli/src/serve/run-qwen-serve.ts` (Bootstrap, Boot-Validierung, Graceful Shutdown)
- `packages/cli/src/serve/server.ts` (`createServeApp()`, Middleware- und Route-Zusammenstellung)
- `packages/cli/src/serve/auth.ts` (CORS, Host-Allowlist, Bearer-Auth, Mutation-Gate)
- `packages/cli/src/serve/rate-limit.ts` (HTTP-Rate-Limit pro Tier)
- `packages/cli/src/serve/capabilities.ts` (Capability-Registry und bedingte Advertisement)
- `packages/cli/src/serve/types.ts` (`ServeOptions`, `CapabilitiesEnvelope`)
- `packages/cli/src/serve/daemon-status-provider.ts`
- `packages/cli/src/serve/permission-audit.ts`
- Issues: [#3803](https://github.com/QwenLM/qwen-code/issues/3803), [#4175](https://github.com/QwenLM/qwen-code/issues/4175)
