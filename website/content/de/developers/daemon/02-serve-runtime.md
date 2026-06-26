# Serve-Laufzeitumgebung

## Übersicht

`packages/cli/src/serve/` ist die Startschicht für `qwen serve`. Sie übersetzt CLI-Flags in `ServeOptions`, validiert die Startkonfiguration, erstellt die Express-App, verdrahtet Middleware, registriert Routen, stellt Daemon-Host-Preflight/Status-Provider bereit, unterhält den Berechtigungs-Audit-Ring und besitzt die zweiphasige, geordnete Herunterfahrsequenz. HTTP-bezogene Arbeit befindet sich in dieser Schicht; ACP-bezogene Arbeit eine Ebene darunter in `@qwen-code/acp-bridge` (siehe [`03-acp-bridge.md`](./03-acp-bridge.md)).

## Zuständigkeiten

- Analysieren und Validieren von `ServeOptions`: Höradresse, Authentifizierung, Arbeitsbereich, Sitzungs-/Verbindungslimits, MCP-Budget/Pool, CORS, Timeouts für Prompt/SSE/Sitzungs-Leerlauf, Ratenbegrenzung und zugehörige Schalter.
- **Kanonisieren** des gebundenen Arbeitsbereichs genau einmal. Derselbe kanonische Name wird von `/capabilities`, dem `POST /session`-Fallback und der Bridge gemeinsam genutzt.
- Ablehnen unsicherer oder ungültiger Startkonfigurationen: Bindung ohne Loopback ohne Token, `--require-auth` ohne Token, `--allow-origin '*'` ohne Token, `mcpBudgetMode='enforce'` ohne positives `mcpClientBudget`, nicht vorhandener oder kein Verzeichnis seiender `--workspace` sowie ungültige Timeout- oder Ratenbegrenzungswerte.
- Konstruieren der `WorkspaceFileSystem`-Factory, des Berechtigungs-Audit-Publishers, des `DaemonStatusProvider` und der `acp-bridge`.
- Aufbau der Express-App, Verdrahten von Middleware (`denyBrowserOriginCors` / `allowOriginCors` -> `hostAllowlist` -> Zugriffsprotokoll -> `bearerAuth` -> Ratenbegrenzung -> JSON-Parser -> Telemetrie -> pro-Route `mutationGate`), und Einbinden von Routen für Sitzung, Arbeitsbereich-CRUD, Dateien, Geräte-Fluss-Authentifizierung, Berechtigungsabstimmung und ACP HTTP.
- Binden des lauschenden Ports und Registrieren von Signal-Handlern.
- Zweiphasiges Herunterfahren bei SIGINT/SIGTERM; erzwungenes Beenden bei einem zweiten Signal.

## Architektur

**Einstiegspunkt**: `runQwenServe(opts, deps)` in `packages/cli/src/serve/run-qwen-serve.ts`. Gibt ein `RunHandle` zurück (`{ url, port, close, ... }`).

**App-Factory**: `createServeApp(opts, getPort, deps)` in `packages/cli/src/serve/server.ts`. Erstellt die Express-`Application`. Direkte Einbettungen und Tests rufen sie ohne den Bootstrap-Wrapper auf.

**Fähigkeiten-Register**: `SERVE_CAPABILITY_REGISTRY` in `packages/cli/src/serve/capabilities.ts`. Jedes Tag hat eine `since`-Version und optionale `modes`. Zehn bedingte Tags (`require_auth`, `mcp_workspace_pool`, `mcp_pool_restart`, `allow_origin`, `prompt_absolute_deadline`, `writer_idle_timeout`, `workspace_settings`, `session_shell_command`, `rate_limit`, `workspace_reload`) werden weggelassen, wenn der entsprechende Schalter deaktiviert ist. Siehe [`11-capabilities-versioning.md`](./11-capabilities-versioning.md).

**Middleware** (`packages/cli/src/serve/auth.ts` und `server.ts`):

| Middleware, in Registrierungsreihenfolge         | Zweck                                                                                                                   | Anmerkungen                                                                                                     |
| ------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `denyBrowserOriginCors` / `allowOriginCors`      | Alle `Origin`-Header standardmäßig ablehnen; zu einer Whitelist wechseln, wenn `--allow-origin <pattern>` konfiguriert. | Siehe [`12-auth-security.md`](./12-auth-security.md).                                                           |
| `hostAllowlist(bind, getPort)`                    | Bei Loopback validieren, dass `Host` zu `localhost`, `127.0.0.1`, `[::1]` oder `host.docker.internal` plus dem tatsächlichen Port gehört. | Abwehr gegen DNS-Rebinding. Der Vergleich erfolgt case-insensitiv und wird pro Port zwischengespeichert.        |
| Zugriffsprotokoll-Middleware                     | Zeichnet Methode, Pfad, Status, Dauer, sessionId und clientId im `DaemonLogger` auf, wenn eine Anfrage abgeschlossen ist. | Wird **vor** `bearerAuth` registriert, sodass auch 401-Ablehnungen protokolliert werden. Überspringt `/health` und Heartbeat. |
| `bearerAuth(token)`                              | SHA-256 plus `timingSafeEqual` konstante Bearer-Prüfung.                                                              | Offener Durchlass, wenn kein Token konfiguriert ist (Loopback-Entwicklungsstandard). Das `Bearer`-Schema ist case-insensitiv. |
| Ratenbegrenzungs-Middleware                      | Optionales Token-Bucket pro Stufe für Prompt-, Mutations- und Lese-Routen.                                              | Wird nach `bearerAuth` und vor dem JSON-Parsen registriert; gibt 429 zurück, bevor geparst wird, wenn ein Bucket erschöpft ist. |
| `express.json({ limit: '10mb' })`                | JSON-Körper-Parsing.                                                                                                   | Parse-Fehler geben 400 zurück.                                                                                 |
| `daemonTelemetryMiddleware`                      | Umhüllt jede HTTP-Anfrage mit einem OpenTelemetry-Span mittels `withDaemonRequestSpan`.                                 | Attribute umfassen Route, sessionId, clientId und Statuscode.                                                   |
| `createMutationGate` (pro Route)                  | Routenbezogene Opt-in-Gate für Mutations-Routen, die selbst auf Loopback einen Token erfordern.                        | Gibt `401 { code: 'token_required' }` zurück. Nicht global `app.use`; Routen rufen bei Bedarf `mutate({ strict: true })` auf. |
**Subsysteme**:

| Pfad                                                             | Rolle                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `serve/fs/`                                                      | `WorkspaceFileSystem`-Factory plus `policy.ts` (Größen-/Vertrauens-/Binärprüfungen), `paths.ts` (kanonische Pfade, resolveWithin, Symlink-Ablehnung), `audit.ts` und typisierte `FsError`-Werte.                                                                                                                                                                                                                                                              |
| `serve/routes/workspace-file-read.ts`, `workspace-file-write.ts` | HTTP-Handler für `GET /file`, `GET /file/bytes`, `POST /file/write` und `POST /file/edit`.                                                                                                                                                                                                                                                               |
| `serve/workspace-memory.ts`                                      | `GET/POST /workspace/memory` (QWEN.md CRUD).                                                                                                                                                                                                                                                                                                                                                 |
| `serve/workspace-agents.ts`                                      | `GET/POST/DELETE /workspace/agents` (Subagent CRUD).                                                                                                                                                                                                                                                                                                                                         |
| `serve/daemon-status-provider.ts`                                | Umgebungs-Snapshot plus Daemon-Host-Preflight-Zellen: Node-Version, CLI-Einstiegspunkt, Workspace-Status, ripgrep, git, npm.                                                                                                                                                                                                                                                                 |
| `serve/permission-audit.ts`                                      | `PermissionAuditRing` (512-Einträge FIFO) und `createPermissionAuditPublisher`.                                                                                                                                                                                                                                                  |
| `serve/auth/device-flow.ts`, `qwen-device-flow-provider.ts`      | Device-Flow-OAuth-Routen. Siehe [`12-auth-security.md`](./12-auth-security.md).                                                                                                                                                                                                                                             |
| `serve/daemon-logger.ts`                                         | `DaemonLogger` – strukturierte Datei-Logs. Siehe [`19-observability.md`](./19-observability.md).                                                                                                                                                                                                                             |
| `serve/debug-mode.ts`                                            | Gemeinsames Prädikat `isServeDebugMode()` zur Steuerung ausführlicher Fehlerkontexte in HTTP-Antworten.                                                                                                                                                                                                                     |
| `serve/acp-http/`                                                | ACP Streamable HTTP Transport (RFD #721), bereitgestellt unter `/acp`. Sieben Dateien implementieren JSON-RPC POST, SSE GET, DELETE-Teardown und die gemeinsame Bridge-Nutzung parallel zur REST-Oberfläche.                                                                                                                       |
| `serve/demo.ts`                                                  | Inline-HTML für `GET /demo`: Browser-Debug-Konsole mit Chat-UI, Ereignislog und Workspace-Inspektor. Auf Loopback ohne `--require-auth` wird es **vor** `bearerAuth` registriert; auf nicht-Loopback oder mit `--require-auth` **nach** `bearerAuth`. Ausgeliefert mit CSP `default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; frame-ancestors 'none'` plus `X-Frame-Options: DENY`. |
**Re-Export-Shims** für Kompatibilität mit pre-F1-Importpfaden:

- `serve/event-bus.ts` -> `@qwen-code/acp-bridge/eventBus`
- `serve/status.ts` -> `@qwen-code/acp-bridge/status`
- `serve/httpAcpBridge.ts` -> `@qwen-code/acp-bridge`

## Ablauf

### Startsequenz

1. **Token auflösen und trimmen** aus `opts.token` oder `QWEN_SERVER_TOKEN`; dies verhindert, dass ein abschließender Zeilenumbruch aus `cat token.txt` den Bearer-Vergleich stillschweigend bricht.
2. **Hostname-Tippfehler-Schutz**: `--hostname localhost:4170` meldet einen Fehler und schlägt `--port` vor.
3. **Authentifizierungsvorabprüfung**: Nicht-Loopback ohne Token verweigert; `--require-auth` ohne Token verweigert.
4. **Workspace-Validierung**: absoluter Pfad, existiert, Verzeichnis. `EACCES`/`EPERM` werden umschlossen, um auf das Flag hinzuweisen.
5. **Workspace kanonisieren**: `canonicalizeWorkspace(rawWorkspace)` führt `realpathSync.native` einmal aus und speist `/capabilities`, den `POST /session`-Fallback und die Brücke.
6. **MCP-Budgetvalidierung**: positive Ganzzahl; `enforce` erfordert ein Budget.
7. **MCP-Pool-Umschaltinferenz**: Eltern-Umgebungsvariable `QWEN_SERVE_NO_MCP_POOL=1` setzt `mcpPoolActive=false`, sodass Fähigkeiten ehrlich `mcp_workspace_pool` und `mcp_pool_restart` weglassen.
8. **CORS-/Timeout-/Ratenbegrenzungsvalidierung**: `--allow-origin '*'` erfordert Token; Werte für Prompt-, Writer-, Kanal-Leerlauf, Sitzungs-Leerlauf, Reaper und Ratenbegrenzungsfenster schlagen bei Ungültigkeit schnell fehl.
9. **Pro-Handle `childEnvOverrides`**: Übergibt `QWEN_SERVE_MCP_CLIENT_BUDGET` und `QWEN_SERVE_MCP_BUDGET_MODE` an das ACP-Kind über `BridgeOptions.childEnvOverrides`, anstatt `process.env` zu mutieren.
10. **`settings.json` einmal laden**: Liest `context.fileName`, `policy.permissionStrategy` und `policy.consensusQuorum`. Beschädigte Dateien fallen auf Standardwerte zurück. `validatePolicyConfig()` prüft `policy.*` gegen `SERVE_CAPABILITY_REGISTRY.permission_mediation.modes`; unbekannte Strategien oder nicht-positive `consensusQuorum` werfen `InvalidPolicyConfigError`. Ein Quorum, das unter einer Nicht-`consensus`-Strategie gesetzt ist, protokolliert eine Warnung auf stderr.
11. **`PermissionAuditRing` zuweisen** (512 Einträge).
12. **`fsFactory` erstellen**: `runQwenServe` standardmäßig `trusted: true`; direkte Aufrufer von `createServeApp` standardmäßig `trusted: false` und warnen einmal.
13. **`createHttpAcpBridge`**, siehe [`03-acp-bridge.md`](./03-acp-bridge.md).
14. **`createServeApp`** stellt Express zusammen.
15. **`server.listen(port, hostname)`**, dann die tatsächliche `getPort()` für die Host-Zulassungsliste auflösen.
16. **SIGINT-/SIGTERM-Handler registrieren** für ordentliches Herunterfahren.

### Ordentliches Herunterfahren

1. **Phase 1 – Brückenabbau** beim ersten Signal:
   - Verwerfen der Device-Flow-Registrierung und Abbrechen ausstehender Flows.
   - `bridge.shutdown()` markiert jeden Kanal als `isDying = true`, sendet ein ordentliches Schließen an jedes ACP-Kind-stdin, wartet `KILL_HARD_DEADLINE_MS` (10s) pro Kanal und ruft dann bei Bedarf `channel.kill()` auf.
2. **Phase 2 – HTTP-Abbau**:
   - `server.close()` stoppt die Annahme neuer Verbindungen und lässt laufende Anfragen beenden.
   - `SHUTDOWN_FORCE_CLOSE_MS` (5s) löst `server.closeAllConnections()` aus.
   - Eine zweite 2s-Frist eskaliert erneut, falls nötig.
3. **Zweites Signal während des Beendens**:
   - `bridge.killAllSync()` + `process.exit(1)`, um zu vermeiden, dass verwaiste Kinder den Daemon-Exit blockieren.

## Zustand und Lebenszyklus

`RunHandle` stellt bereit:

- `url`: aufgelöste Listen-URL nach Auflösung des ephemeren Ports.
- `port`: tatsächlicher Port, inklusive Auflösung von `0`.
- `close({ timeoutMs? })`: programmgesteuertes Herunterfahren für Einbettungen und Tests.

Der direkte Aufruf von `createServeApp` gibt nur eine `Application` zurück; der Einbetter besitzt `listen` und das Herunterfahren.

## Abhängigkeiten

| Von `serve/` verwendete Upstreams                                                                    | `serve/` verwendende Downstreams                 |
| --------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| `@qwen-code/acp-bridge`: Brücke, Ereignisbus, Status-Typen                                          | Der `qwen` CLI-`serve`-Subkommando-Handler       |
| `packages/core`: `loadSettings`, `getCurrentGeminiMdFilename`, `Config`, `WorkspaceContext`          | Direkte Einbetter, Tests                         |
| ACP SDK (`@agentclientprotocol/sdk`): `PROTOCOL_VERSION`, `ClientSideConnection` über die Brücke    |                                                  |

## Konfiguration

| Quelle            | Schlüssel                                                                                             | Effekt                                                                                                |
| ----------------- | ----------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Umgebung          | `QWEN_SERVER_TOKEN`                                                                                   | Bearer-Token nach Trimmen.                                                                              |
| Umgebung          | `QWEN_SERVE_NO_MCP_POOL=1`                                                                           | Erzwingt `mcpPoolActive=false`.                                                                         |
| ACP-Kind-Umgebung | `QWEN_SERVE_MCP_CLIENT_BUDGET` / `QWEN_SERVE_MCP_BUDGET_MODE`                                         | Generiert aus `--mcp-client-budget` / `--mcp-budget-mode` und über `childEnvOverrides` weitergeleitet. |
| Umgebung          | `QWEN_SERVE_PROMPT_DEADLINE_MS` / `QWEN_SERVE_WRITER_IDLE_TIMEOUT_MS`                                 | Standard-Prompt-/SSE-Leerlauf-Timeouts.                                                                   |
| Umgebung          | `QWEN_SERVE_RATE_LIMIT*`                                                                              | Ratenbegrenzungsschalter, Prompt-/Mutations-/Leseobergrenzen und Fensterstandard.                                 |
| Umgebung          | `QWEN_SERVE_DEBUG=1`                                                                                  | Ausführliche stderr-Logs. Siehe [`19-observability.md`](./19-observability.md).                              |
| Flags             | `--hostname`, `--port`                                                                                | Listen-Bindung.                                                                                       |
| Flags             | `--token`, `--require-auth`, `--enable-session-shell`                                                 | Bearer-Token, Loopback-Auth-Härtung und expliziter Shell-Ausführungsschalter.                           |
| Flag              | `--workspace`                                                                                         | Überschreibt `process.cwd()`.                                                                             |
| Flags             | `--max-sessions`, `--max-pending-prompts-per-session`, `--max-connections`, `--event-ring-size`       | Bridge-/Express-Obergrenzen.                                                                                |
| Flags             | `--mcp-client-budget=N`, `--mcp-budget-mode={off,warn,enforce}`                                       | An das ACP-Kind weitergeleitet.                                                                           |
| Flags             | `--allow-origin`, `--allow-private-auth-base-url`                                                     | Browser-CORS-Zulassungsliste und localhost/private Auth-Provider-Installationsschalter.                       |
| Flags             | `--prompt-deadline-ms`, `--writer-idle-timeout-ms`, `--channel-idle-timeout-ms`                        | Steuerung des Leerlauf-Lebenszyklus von Prompt, SSE-Writer und ACP-Kind.                                       |
| Flags             | `--session-reap-interval-ms`, `--session-idle-timeout-ms`                                             | Steuerung der Bereinigung getrennter Sitzungen.                                                             |
| Flags             | `--rate-limit*`                                                                                       | HTTP-Ratenbegrenzung pro Stufe.                                                                             |
| `settings.json`   | `policy.permissionStrategy`, `policy.consensusQuorum`                                                 | `MultiClientPermissionMediator`-Richtlinie und Quorum.                                                    |
| `settings.json`   | `context.fileName`                                                                                    | `getCurrentGeminiMdFilename`-Überschreibung für die Brücke.                                                 |
Siehe [`17-configuration.md`](./17-configuration.md) für die zusammengeführte Referenz.

## Einschränkungen und bekannte Grenzen

- Direktes `createServeApp` ohne `deps.fsFactory` oder `deps.bridge` wird standardmäßig auf `trusted: false` gesetzt; agentenseitiges ACP `writeTextFile` lehnt als `untrusted_workspace` ab. Die Warnung wird einmal ausgegeben.
- `denyBrowserOriginCors` weist **alle** Anfragen mit `Origin` zurück; die Demoseite funktioniert, weil eine andere Middleware zuerst übereinstimmende Same-Origin-Werte entfernt.
- Body-Parser-Reihenfolge: Routen, die `mutate({ strict: true })` verwenden, geben 401 erst nach `express.json()` zurück. Der schlimmste Fall ist `--max-connections × express.json({limit: '10mb'})`, was bei einem gesättigten Loopback-Listener bis zu etwa 2,5 GB transienten Speicher verbraucht; dieser Kompromiss ist beabsichtigt.
- Mehrere Daemons in einem Prozess müssen pro Handle `childEnvOverrides` verwenden; das Mutieren von `process.env` führt zu Wettlaufsituationen, da `defaultSpawnChannelFactory` die Umgebung zum Zeitpunkt des Spawnens einfriert.

## Referenzen

- `packages/cli/src/serve/run-qwen-serve.ts` (Bootstrapping, Boot-Validierung, ordnungsgemäßes Herunterfahren)
- `packages/cli/src/serve/server.ts` (`createServeApp()`, Middleware- und Routen-Zusammenstellung)
- `packages/cli/src/serve/auth.ts` (CORS, Host-Zulassungsliste, Bearer-Authentifizierung, Mutationsschranke)
- `packages/cli/src/serve/rate-limit.ts` (pro Stufe HTTP-Ratenbegrenzung)
- `packages/cli/src/serve/capabilities.ts` (Fähigkeitsregister und bedingte Anzeige)
- `packages/cli/src/serve/types.ts` (`ServeOptions`, `CapabilitiesEnvelope`)
- `packages/cli/src/serve/daemon-status-provider.ts`
- `packages/cli/src/serve/permission-audit.ts`
- Issues: [#3803](https://github.com/QwenLM/qwen-code/issues/3803), [#4175](https://github.com/QwenLM/qwen-code/issues/4175)
