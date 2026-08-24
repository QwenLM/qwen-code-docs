# Serve Runtime

## Overview

`packages/cli/src/serve/` ist die Boot-Schicht für `qwen serve`. Es übersetzt CLI-Flags in `ServeOptions`, validiert die Startkonfiguration, baut die Express-App, verbindet Middleware, registriert Routen, stellt Daemon-Host-Pre-Flight-/Status-Provider bereit, verwaltet den Permission-Audit-Ring und steuert die zweiphasige Graceful-Shutdown-Sequenz. HTTP-bezogene Arbeit liegt in dieser Schicht; ACP-bezogene Arbeit liegt eine Schicht tiefer in `@qwen-code/acp-bridge` (siehe [`03-acp-bridge.md`](./03-acp-bridge.md)).

## Responsibilities

- Parsen und Validieren von `ServeOptions`: Listen-Adresse, Auth, Workspace, Session-/Connection-Caps, MCP-Budget/-Pool, CORS, Prompt-/SSE-/Session-Idle-Timeouts, Rate-Limit und zugehörige Toggles.
- Den primären Workspace genau einmal **kanonisieren** und jedes wiederholte `--workspace` kanonisieren, bevor Session-Runtimes registriert werden. Die primäre kanonische Form wird von `/capabilities.workspaceCwd`, dem `POST /session`-Fallback und der primären Bridge gemeinsam genutzt.
- Unsichere oder ungültige Startkonfigurationen ablehnen: Non-Loopback-Bind ohne Token, `--require-auth` ohne Token, `--allow-origin '*'` ohne Token, `mcpBudgetMode='enforce'` ohne positives `mcpClientBudget`, ein nicht existierender oder kein Verzeichnis-`--workspace` sowie ungültige Timeout- oder Rate-Limit-Werte.
- Die `WorkspaceFileSystem`-Factory, den Permission-Audit-Publisher, den `DaemonStatusProvider` und die `acp-bridge` konstruieren.
- Die Express-App bauen, Middleware verdrahten (`allowOriginCors` über die mutable Origin-Allowlist -> `hostAllowlist` -> Access-Log -> `bearerAuth` -> Rate-Limit -> JSON-Parser -> Telemetrie -> routenbezogene `mutationGate`) sowie Session-, Workspace-CRUD-, File-, Device-Flow-Auth-, Permission-Vote- und ACP-HTTP-Routen mounten. (Die bedingungslose `denyBrowserOriginCors`-Mauer bleibt nur in der Bootstrap-App, `run-qwen-serve.ts`.)
- Den Listening-Port binden und Signal-Handler registrieren.
- Zweiphasigen Shutdown bei SIGINT/SIGTERM ausführen; Force-Exit bei einem zweiten Signal.

## Architecture

**Entry**: `runQwenServe(opts, deps)` in `packages/cli/src/serve/run-qwen-serve.ts`. Gibt ein `RunHandle` (`{ url, port, close, ... }`) zurück.

**App-Factory**: `createServeApp(opts, getPort, deps)` in `packages/cli/src/serve/server.ts`. Baut die Express-`Application`. Direkte Embedder und Tests rufen sie ohne den Bootstrap-Wrapper auf.

**Capability-Registry**: `SERVE_CAPABILITY_REGISTRY` in `packages/cli/src/serve/capabilities.ts`. Jeder Tag hat eine `since`-Version und optionale `modes`. Bedingte Tags werden weggelassen, wenn ihr Deployment- oder Runtime-Prädikat falsch ist; die Registry und die Prädikat-Map sind maßgeblich. Siehe [`11-capabilities-versioning.md`](./11-capabilities-versioning.md).

**Middleware** (`packages/cli/src/serve/auth.ts` und `server.ts`):

| Middleware, in Registrierungsreihenfolge | Zweck | Hinweise |
| --- | --- | --- |
| `allowOriginCors` | `Origin`-Header gegen eine mutable Allowlist prüfen; die `--allow-origin <pattern>`-Einträge seeden sie, und Local Control fügt die LAN-Origin hinzu, während es aktiviert ist. Nicht übereinstimmende Origins erhalten den 403- deny-Envelope. | Siehe [`12-auth-security.md`](./12-auth-security.md). |
| `hostAllowlist(bind, getPort)` | Auf Loopback validieren, dass `Host` zu `localhost`, `127.0.0.1`, `[::1]` oder `host.docker.internal` sowie dem tatsächlichen Port gehört. Der Local-Control-LAN-Listener ist die Ausnahme, die immer ihre beworbene-Autorität-Hostprüfung erzwingt, unabhängig vom primären Bind. | Schutz gegen DNS-Rebinding. Der Vergleich ist case-insensitive und wird pro Port gecacht. |
| Access-Log-Middleware | Protokolliert Methode, Pfad, Status, durationMs, sessionId und clientId im `DaemonLogger`, wenn ein Request abgeschlossen ist. | **Vor** `bearerAuth` registriert, sodass 401-Ablehnungen ebenfalls protokolliert werden. Überspringt `/health` und Heartbeat. |
| `bearerAuth(token)` | SHA-256 plus `timingSafeEqual` Constant-Time-Bearer-Vergleich. | Offener Passthrough, wenn kein Token konfiguriert ist (Loopback-Dev-Standard). Das `Bearer`-Schema ist case-insensitive. |
| Rate-Limit-Middleware | Optionaler Token-Bucket pro Stufe für Prompt-, Mutations- und Read-Routen. | Nach `bearerAuth` und vor dem JSON-Parsing registriert; gibt 429 vor dem Parsing zurück, wenn ein Bucket erschöpft ist. |
| `express.json({ limit: '10mb' })` | JSON-Body-Parsing. | Parse-Fehler geben 400 zurück. |
| `daemonTelemetryMiddleware` | Wrapper für klassifizierte Daemon-API-Requests, die diesen Punkt erreichen, in einem OpenTelemetry-Span durch `withDaemonRequestSpan`. | Attribute umfassen kanonische Route, aufgelösten Workspace-Hash, sessionId, clientId und Statuscode. Frühere Auth-, Rate-Limit- und Body-Parser-Ablehnungen liegen außerhalb dieser Span-Grenze. |
| `createMutationGate` (pro Route) | Opt-in-Gate auf Routen-Ebene für Mutations-Routen, die auch auf Loopback ein Token erfordern. | Gibt `401 { code: 'token_required' }` zurück. Kein globales `app.use`; Routen rufen bei Bedarf `mutate({ strict: true })` auf. |

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
| `serve/web-shell-static.ts`, `serve/web-shell-resolver.ts` | Lokalisieren und mounten der gebauten Web-Shell-Assets (die Browser-UI des Daemons) unter `/`, `/assets` und `/session/:id`, sowie den SPA-Deep-Link-Fallback, der nach allen API-Routen registriert wird. Wird in jedem Launch-Modus **vor** `bearerAuth` gemountet – ein Browser kann `Authorization` nicht bei einer Navigation oder Subresource anhängen – während jede API-Route, die er aufruft, token-geschützt bleibt. Fällt auf API-only zurück, wenn die Assets fehlen; `--no-web` optet aus. |

**ACP-Bridge-Package-Imports**:

- Event-Bus-Primitive werden aus `@qwen-code/acp-bridge/eventBus` importiert.
- Status-Primitive werden aus `@qwen-code/acp-bridge/status` importiert.
- `serve/acp-session-bridge.ts` bleibt als CLI-lokale Kompatibilitäts-Fassade für die breitere Bridge-Oberfläche erhalten.

## Ablauf

### Boot-Sequenz

Bevor `runQwenServe()` diese Sequenz startet, validiert der CLI-exklusive `--open-with-auth`-Modus die Loopback/Web-Shell-Eignung und füllt `ServeOptions.token` mit dem ausgewählten konfigurierten Token oder mit 32 zufälligen Bytes, kodiert als base64url, wenn diese Auswahl leer ist. Direkte Embedder und Aufrufe ohne diesen standardmäßig deaktivierten Flag generieren kein Token.

1. **Token auflösen und trimmen** aus `opts.token` oder `QWEN_SERVER_TOKEN`; dies verhindert, dass ein abschließender Newline von `cat token.txt` den Bearer-Vergleich stillschweigend fehlschlagen lässt.
2. **Hostname-Typo-Guard**: `--hostname localhost:4170` erzeugt einen Fehler und schlägt `--port` vor.
3. **Auth-Pre-Flight**: Non-Loopback ohne Token wird abgelehnt; `--require-auth` ohne Token wird abgelehnt.
4. **Workspace-Validierung**: absoluter Pfad, existiert, Verzeichnis. `EACCES` / `EPERM` werden ummantelt, um auf den Flag hinzuweisen.
5. **Workspace kanonisieren**: `canonicalizeWorkspace(rawWorkspace)` führt `realpathSync.native` einmal aus und speist `/capabilities`, den `POST /session`-Fallback und die Bridge.
6. **MCP-Budget-Validierung**: positive ganze Zahl; `enforce` erfordert ein Budget.
7. **MCP-Pool-Toggle-Inferenz**: Parent-Env `QWEN_SERVE_NO_MCP_POOL=1` setzt `mcpPoolActive=false`, sodass die Capabilities `mcp_workspace_pool` und `mcp_pool_restart` korrekt weglassen.
8. **CORS-/Timeout-/Rate-Limit-Validierung**: `--allow-origin '*'` erfordert ein Token; Prompt-, Writer-, Channel-Idle-, Session-Idle-, Reaper- und Rate-Limit-Window-Werte schlagen bei Ungültigkeit sofort fehl (fail fast).
9. **Handle-spezifische `childEnvOverrides`**: `QWEN_SERVE_MCP_CLIENT_BUDGET` und `QWEN_SERVE_MCP_BUDGET_MODE` über `BridgeOptions.childEnvOverrides` an das ACP-Child übergeben, anstatt `process.env` zu mutieren.
10. **`settings.json` einmalig laden**: `context.fileName`, `policy.permissionStrategy` und `policy.consensusQuorum` lesen. Beschädigte Dateien fallen auf Standardwerte zurück. `validatePolicyConfig()` prüft `policy.*` gegen `SERVE_CAPABILITY_REGISTRY.permission_medication.modes`; unbekannte Strategien oder ein nicht-positives `consensusQuorum` werfen `InvalidPolicyConfigError`. Ein unter einer Nicht-`consensus`-Strategie gesetztes Quorum protokolliert eine Stderr-Warnung.
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
| `packages/core`: `loadSettings`, `getCurrentGeminiMdFilename`, `Config`, `WorkspaceContext` | Direkte Embedder, Tests |
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
| `settings.json` | `context.fileName` | `getCurrentGeminiMdFilename`-Override für die Bridge. |
Siehe [`17-configuration.md`](./17-configuration.md) für die zusammengeführte Referenz.

## Einschränkungen und bekannte Limits

- Bei direktem Aufruf von `createServeApp` ohne `deps.fsFactory` oder `deps.bridge` ist der Standardwert `trusted: false`; das agentenseitige ACP `writeTextFile` wird mit `untrusted_workspace` abgelehnt. Die Warnung wird einmalig ausgegeben.
- Die Runtime-App betreibt `allowOriginCors` über die mutable Allowlist; nicht übereinstimmende `Origin`-Werte erhalten den 403-Deny-Envelope (die bedingungslose `denyBrowserOriginCors`-Mauer überlebt nur in der Bootstrap-App). Die **Loopback**-Web-Shell funktioniert, weil eine andere Middleware zuvor übereinstimmende Loopback-Same-Origin-Werte entfernt – Non-Loopback-Binds erfordern `--allow-origin` für die XHRs der Shell.
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
