# Serve Runtime

## Übersicht

`packages/cli/src/serve/` ist die Boot-Schicht für `qwen serve`. Sie übersetzt CLI-Flags in `ServeOptions`, validiert die Startkonfiguration, baut die Express-App auf, verdrahtet Middleware, registriert Routen, stellt Daemon-Host-Preflight- und Status-Provider bereit, verwaltet den Berechtigungs-Audit-Ring und besitzt die zweiphasige Graceful-Shutdown-Sequenz. Die HTTP-Seite lebt in dieser Schicht; die ACP-Seite lebt eine Ebene tiefer in `@qwen-code/acp-bridge` (siehe [`03-acp-bridge.md`](./03-acp-bridge.md)).

## Verantwortlichkeiten

- Parsen und Validieren von `ServeOptions`: Listen-Adresse, Authentifizierung, Arbeitsbereich, Sitzungs-/Verbindungslimits, MCP-Budget/Pool, CORS, Prompt-/SSE-/Session-Idle-Timeouts, Ratenlimit und zugehörige Schalter.
- **Kanonisieren** des gebundenen Arbeitsbereichs genau einmal. Dieselbe kanonische Form wird von `/capabilities`, dem `POST /session`-Fallback und der Bridge gemeinsam genutzt.
- Ablehnen unsicherer oder ungültiger Startkonfigurationen: Nicht-Loopback-Bindung ohne Token, `--require-auth` ohne Token, `--allow-origin '*'` ohne Token, `mcpBudgetMode='enforce'` ohne positives `mcpClientBudget`, einen nicht vorhandenen oder kein Verzeichnis darstellenden `--workspace` sowie ungültige Timeout- oder Ratenlimit-Werte.
- Konstruieren der `WorkspaceFileSystem`-Factory, des Permission-Audit-Publishers, des `DaemonStatusProvider` und der `acp-bridge`.
- Bauen der Express-App, Verdrahten von Middleware (`denyBrowserOriginCors` / `allowOriginCors` -> `hostAllowlist` -> Access-Log -> `bearerAuth` -> Ratenlimit -> JSON-Parser -> Telemetrie -> pro-Route `mutationGate`) und Einbinden von Sitzungs-, Arbeitsbereichs-CRUD-, Datei-, Device-Flow-Auth-, Permission-Vote- und ACP-HTTP-Routen.
- Binden des Listening-Ports und Registrieren von Signal-Handlern.
- Ausführen des zweiphasigen Shutdowns bei SIGINT/SIGTERM; sofortiger Zwangsabbruch bei einem zweiten Signal.

## Architektur

**Einstiegspunkt**: `runQwenServe(opts, deps)` in `packages/cli/src/serve/run-qwen-serve.ts`. Gibt ein `RunHandle` zurück (`{ url, port, close, ... }`).

**App-Factory**: `createServeApp(opts, getPort, deps)` in `packages/cli/src/serve/server.ts`. Baut die Express-`Application`. Direkte Einbettungen und Tests rufen sie ohne den Bootstrap-Wrapper auf.

**Capability-Registry**: `SERVE_CAPABILITY_REGISTRY` in `packages/cli/src/serve/capabilities.ts`. Jeder Tag hat eine `since`-Version und optionale `modes`. Zehn bedingte Tags (`require_auth`, `mcp_workspace_pool`, `mcp_pool_restart`, `allow_origin`, `prompt_absolute_deadline`, `writer_idle_timeout`, `workspace_settings`, `session_shell_command`, `rate_limit`, `workspace_reload`) werden weggelassen, wenn der entsprechende Schalter deaktiviert ist. Siehe [`11-capabilities-versioning.md`](./11-capabilities-versioning.md).

**Middleware** (`packages/cli/src/serve/auth.ts` und `server.ts`):

| Middleware (in Registrierungsreihenfolge)                        | Zweck                                                                                                                                                        | Hinweise                                                                                                                           |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------- |
| `denyBrowserOriginCors` / `allowOriginCors`                     | Alle `Origin`-Header standardmäßig ablehnen; bei Konfiguration von `--allow-origin <pattern>` auf eine Allowlist umschalten.                                  | Siehe [`12-auth-security.md`](./12-auth-security.md).                                                                              |
| `hostAllowlist(bind, getPort)`                                  | Bei Loopback prüfen, ob `Host` zu `localhost`, `127.0.0.1`, `[::1]` oder `host.docker.internal` plus dem tatsächlichen Port gehört.                          | Schutz vor DNS-Rebinding. Der Vergleich erfolgt case-insensitive und wird pro Port gecached.                                      |
| Access-Log-Middleware                                           | Zeichnet Methode, Pfad, Status, Dauer_ms, sessionId und clientId beim Abschluss einer Anfrage im `DaemonLogger` auf.                                          | Wird **vor** `bearerAuth` registriert, sodass auch 401-Ablehnungen geloggt werden. Überspringt `/health` und Heartbeat.           |
| `bearerAuth(token)`                                             | SHA-256 plus `timingSafeEqual` konstanter Bearer-Vergleich.                                                                                                  | Offene Durchleitung, wenn kein Token konfiguriert ist (Loopback-Dev-Standard). Das `Bearer`-Schema ist case-insensitive.           |
| Ratenlimit-Middleware                                           | Optionales Token-Bucket pro Tier für Prompt-, Mutations- und Read-Routen.                                                                                    | Wird nach `bearerAuth` und vor JSON-Parsing registriert; gibt 429 zurück, bevor geparst wird, wenn ein Bucket erschöpft ist.      |
| `express.json({ limit: '10mb' })`                               | JSON-Body-Parsing.                                                                                                                                           | Parse-Fehler geben 400 zurück.                                                                                                     |
| `daemonTelemetryMiddleware`                                     | Ummantelt jede HTTP-Anfrage in einen OpenTelemetry-Span mit `withDaemonRequestSpan`.                                                                         | Attribute enthalten Route, sessionId, clientId und Statuscode.                                                                    |
| `createMutationGate` (pro Route)                                | Route-level Opt-in-Gate für Mutations-Routen, die auch auf Loopback ein Token benötigen.                                                                     | Gibt `401 { code: 'token_required' }` zurück. Nicht global `app.use`; Routen rufen bei Bedarf `mutate({ strict: true })` auf.     |

**Subsysteme**:

| Pfad                                                                    | Rolle                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ----------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `serve/fs/`                                                             | `WorkspaceFileSystem`-Factory plus `policy.ts` (Größe/Trust/Binärprüfungen), `paths.ts` (Kanonisieren, resolveWithin, Symlink-Ablehnung), `audit.ts` und typisierte `FsError`-Werte.                                                                                                                                                                                                                                               |
| `serve/routes/workspace-file-read.ts`, `workspace-file-write.ts`        | HTTP-Handler für `GET /file`, `GET /file/bytes`, `POST /file/write` und `POST /file/edit`.                                                                                                                                                                                                                                                                                                                                         |
| `serve/workspace-memory.ts`                                             | `GET/POST /workspace/memory` (QWEN.md CRUD).                                                                                                                                                                                                                                                                                                                                                                                       |
| `serve/workspace-agents.ts`                                             | `GET/POST/DELETE /workspace/agents` (Subagent-CRUD).                                                                                                                                                                                                                                                                                                                                                                               |
| `serve/daemon-status-provider.ts`                                       | Umgebungs-Snapshot plus Daemon-Host-Preflight-Zellen: Node-Version, CLI-Eintrag, Workspace-Stat, ripgrep, git, npm.                                                                                                                                                                                                                                                                                                                |
| `serve/permission-audit.ts`                                             | `PermissionAuditRing` (512 Einträge, FIFO) und `createPermissionAuditPublisher`.                                                                                                                                                                                                                                                                                                                                                   |
| `serve/auth/device-flow.ts`, `qwen-device-flow-provider.ts`            | Device-Flow-OAuth-Routen. Siehe [`12-auth-security.md`](./12-auth-security.md).                                                                                                                                                                                                                                                                                                                                                    |
| `serve/daemon-logger.ts`                                                | `DaemonLogger` strukturierte Dateilogdaten. Siehe [`19-observability.md`](./19-observability.md).                                                                                                                                                                                                                                                                                                                                  |
| `serve/debug-mode.ts`                                                   | Gemeinsames `isServeDebugMode()`-Prädikat, das den ausführlichen Fehlerkontext in HTTP-Antworten steuert.                                                                                                                                                                                                                                                                                                                          |
| `serve/acp-http/`                                                       | ACP Streamable HTTP Transport (RFD #721), eingehängt unter `/acp`. Sieben Dateien implementieren JSON-RPC POST, SSE GET, DELETE Teardown und die gemeinsame Bridge-Nutzung parallel zur REST-Oberfläche.                                                                                                                                                                                                                           |
| `serve/demo.ts`                                                         | Eigenständiges Inline-HTML für `GET /demo`: Browser-Debug-Konsole mit Chat-UI, Ereignis-Log und Workspace-Inspektor. Auf Loopback ohne `--require-auth` wird es **vor** `bearerAuth` registriert; auf Nicht-Loopback oder mit `--require-auth` wird es **nach** `bearerAuth` registriert. Ausgeliefert mit CSP `default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; frame-ancestors 'none'` plus `X-Frame-Options: DENY`. |

**Re-Export-Shims** für Kompatibilität mit Pre-F1-Importpfaden:

- `serve/event-bus.ts` -> `@qwen-code/acp-bridge/eventBus`
- `serve/status.ts` -> `@qwen-code/acp-bridge/status`
- `serve/httpAcpBridge.ts` -> `@qwen-code/acp-bridge`

## Ablauf

### Boot-Sequenz

1. **Token auflösen und trimmen** aus `opts.token` oder `QWEN_SERVER_TOKEN`; dies
   verhindert, dass ein nachfolgender Zeilenumbruch aus `cat token.txt` den Bearer-Vergleich stillschweigend stört.
2. **Hostname-Tippfehler-Guard**: `--hostname localhost:4170` führt zu einem Fehler und schlägt `--port` vor.
3. **Auth-Preflight**: Nicht-Loopback ohne Token wird abgelehnt; `--require-auth` ohne Token wird abgelehnt.
4. **Workspace-Validierung**: absoluter Pfad, existiert, Verzeichnis. `EACCES` / `EPERM` werden umschlossen, um auf das Flag zu verweisen.
5. **Kanonisieren des Workspace**: `canonicalizeWorkspace(rawWorkspace)` führt `realpathSync.native` einmal aus und versorgt `/capabilities`, den `POST /session`-Fallback und die Bridge.
6. **MCP-Budget-Validierung**: positive ganze Zahl; `enforce` erfordert ein Budget.
7. **MCP-Pool-Umschalt-Inferenz**: übergeordnete Umgebung `QWEN_SERVE_NO_MCP_POOL=1` setzt `mcpPoolActive=false`, sodass Capabilities ehrlich `mcp_workspace_pool` und `mcp_pool_restart` weglassen.
8. **CORS / Timeout / Ratenlimit-Validierung**: `--allow-origin '*'` erfordert Token; Prompt-, Writer-, Channel-Idle-, Session-Idle-, Reaper- und Ratenlimit-Fensterwerte schlagen bei Ungültigkeit schnell fehl.
9. **Pro-Handle `childEnvOverrides`**: Übergibt `QWEN_SERVE_MCP_CLIENT_BUDGET` und `QWEN_SERVE_MCP_BUDGET_MODE` an das ACP-Kind über `BridgeOptions.childEnvOverrides` anstatt `process.env` zu mutieren.
10. **Einmaliges Laden von `settings.json`**: Liest `context.fileName`, `policy.permissionStrategy` und `policy.consensusQuorum`. Beschädigte Dateien fallen auf Standardwerte zurück. `validatePolicyConfig()` prüft `policy.*` gegen `SERVE_CAPABILITY_REGISTRY.permission_mediation.modes`; unbekannte Strategien oder nicht-positives `consensusQuorum` werfen `InvalidPolicyConfigError`. Ein Quorum, das unter einer nicht-`consensus`-Strategie gesetzt ist, protokolliert eine Warnung auf stderr.
11. **Allokieren von `PermissionAuditRing`** (512 Einträge).
12. **Bauen von `fsFactory`**: `runQwenServe` verwendet standardmäßig `trusted: true`; direkte Aufrufer von `createServeApp` verwenden standardmäßig `trusted: false` und geben eine einmalige Warnung aus.
13. **`createHttpAcpBridge`**, siehe [`03-acp-bridge.md`](./03-acp-bridge.md).
14. **`createServeApp`** baut Express zusammen.
15. **`server.listen(port, hostname)`**, dann Auflösen des tatsächlichen `getPort()` für die Host-Allowlist.
16. **Registrieren von SIGINT / SIGTERM-Handlern** für Graceful Shutdown.

### Graceful Shutdown

1. **Phase 1 – Bridge-Takedown** bei erstem Signal:
   - Device-Flow-Registry freigeben und ausstehende Flows abbrechen.
   - `bridge.shutdown()` markiert jeden Channel mit `isDying = true`, sendet Graceful-Close an jedes ACP-Kind-Stdin, wartet `KILL_HARD_DEADLINE_MS` (10s) pro Channel, ruft dann bei Bedarf `channel.kill()` auf.
2. **Phase 2 – HTTP-Takedown**:
   - `server.close()` stoppt die Annahme neuer Verbindungen und lässt laufende Anfragen abschließen.
   - `SHUTDOWN_FORCE_CLOSE_MS` (5s) löst `server.closeAllConnections()` aus.
   - Eine zweite 2s-Frist eskaliert bei Bedarf erneut.
3. **Zweites Signal während des Beendens**:
   - `bridge.killAllSync()` + `process.exit(1)`, um zu vermeiden, dass verwaiste Kinder den Daemon-Exit blockieren.

## Zustand und Lebenszyklus

`RunHandle` stellt bereit:

- `url`: aufgelöste Listen-URL nach Auflösung des ephemeren Ports.
- `port`: tatsächlicher Port, einschließlich Auflösung von `0`.
- `close({ timeoutMs? })`: programmatisches Herunterfahren für Einbettungen und Tests.

Der direkte Aufruf von `createServeApp` gibt nur eine `Application` zurück; der Einbetter besitzt `listen` und Shutdown.

## Abhängigkeiten

| Von `serve/` verwendete Upstreams                                                                                                | Downstreams, die `serve/` verwenden         |
| -------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| `@qwen-code/acp-bridge`: Bridge, Event-Bus, Status-Typen                                                                         | Der `qwen` CLI `serve`-Subcommand-Handler   |
| `packages/core`: `loadSettings`, `getCurrentGeminiMdFilename`, `Config`, `WorkspaceContext`                                      | Direkte Einbettungen, Tests                 |
| ACP SDK (`@agentclientprotocol/sdk`): `PROTOCOL_VERSION`, `ClientSideConnection` über Bridge                                     |                                             |
| Express + body-parser, `node:crypto`, `node:fs`, `node:path`                                                                     |                                             |

## Konfiguration

| Quelle            | Schlüssel                                                                                         | Effekt                                                                                                 |
| ----------------- | ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Umgebung          | `QWEN_SERVER_TOKEN`                                                                               | Bearer-Token nach Trimmen.                                                                             |
| Umgebung          | `QWEN_SERVE_NO_MCP_POOL=1`                                                                        | Erzwingt `mcpPoolActive=false`.                                                                        |
| ACP-Kind-Umgebung | `QWEN_SERVE_MCP_CLIENT_BUDGET` / `QWEN_SERVE_MCP_BUDGET_MODE`                                     | Generiert aus `--mcp-client-budget` / `--mcp-budget-mode` und weitergeleitet über `childEnvOverrides`. |
| Umgebung          | `QWEN_SERVE_PROMPT_DEADLINE_MS` / `QWEN_SERVE_WRITER_IDLE_TIMEOUT_MS`                             | Standard Prompt- / SSE-Idle-Timeouts.                                                                  |
| Umgebung          | `QWEN_SERVE_RATE_LIMIT*`                                                                          | Ratenlimit-Schalter, Prompt-/Mutations-/Read-Limits und Fenster-Standard.                              |
| Umgebung          | `QWEN_SERVE_DEBUG=1`                                                                              | Ausführliche stderr-Logs. Siehe [`19-observability.md`](./19-observability.md).                        |
| Flags             | `--hostname`, `--port`                                                                            | Listen-Bindung.                                                                                        |
| Flags             | `--token`, `--require-auth`, `--enable-session-shell`                                             | Bearer-Token, Loopback-Auth-Härtung und expliziter Shell-Ausführungs-Schalter.                         |
| Flag              | `--workspace`                                                                                     | Überschreibt `process.cwd()`.                                                                          |
| Flags             | `--max-sessions`, `--max-pending-prompts-per-session`, `--max-connections`, `--event-ring-size`   | Bridge-/Express-Limits.                                                                                |
| Flags             | `--mcp-client-budget=N`, `--mcp-budget-mode={off,warn,enforce}`                                   | An das ACP-Kind weitergeleitet.                                                                        |
| Flags             | `--allow-origin`, `--allow-private-auth-base-url`                                                 | Browser-CORS-Allowlist und Installations-Schalter für lokale/private Auth-Provider.                    |
| Flags             | `--prompt-deadline-ms`, `--writer-idle-timeout-ms`, `--channel-idle-timeout-ms`                   | Prompt-, SSE-Writer- und ACP-Kind-Idle-Lifecycle-Steuerung.                                             |
| Flags             | `--session-reap-interval-ms`, `--session-idle-timeout-ms`                                         | Steuerung der Bereinigung getrennter Sitzungen.                                                        |
| Flags             | `--rate-limit*`                                                                                   | HTTP-Ratenlimit pro Tier.                                                                              |
| `settings.json`   | `policy.permissionStrategy`, `policy.consensusQuorum`                                             | `MultiClientPermissionMediator`-Policy und Quorum.                                                     |
| `settings.json`   | `context.fileName`                                                                                | `getCurrentGeminiMdFilename`-Überschreibung für die Bridge.                                            |
Siehe [`17-configuration.md`](./17-configuration.md) für die zusammengeführte Referenz.

## Einschränkungen und bekannte Grenzen

- Ein direkter Aufruf von `createServeApp` ohne `deps.fsFactory` oder `deps.bridge` standardmäßig auf `trusted: false`; agent-seitiges ACP `writeTextFile` lehnt mit `untrusted_workspace` ab. Die Warnung wird einmal ausgegeben.
- `denyBrowserOriginCors` lehnt **alle** Anfragen mit `Origin` ab; die Demoseite funktioniert, weil eine andere Middleware zuerst die passenden Same-Origin-Werte entfernt.
- Body-Parser-Reihenfolge: Routen, die `mutate({ strict: true })` verwenden, geben 401 erst nach `express.json()` zurück. Der schlechteste Fall ist `--max-connections × express.json({limit: '10mb'})`, bis zu etwa 2,5 GB transientem Speicher auf einem gesättigten Loopback-Listener; dieser Kompromiss ist beabsichtigt.
- Mehrere Daemons in einem Prozess müssen pro Handle `childEnvOverrides` verwenden; das Mutieren von `process.env` führt zu Wettlaufsituationen, da `defaultSpawnChannelFactory` die Umgebung zum Zeitpunkt des Spawnens einfriert.

## Referenzen

- `packages/cli/src/serve/run-qwen-serve.ts` (Bootstrap, Boot-Validierung, Graceful Shutdown)
- `packages/cli/src/serve/server.ts` (`createServeApp()`, Middleware- und Routen-Assembly)
- `packages/cli/src/serve/auth.ts` (CORS, Host-Allowlist, Bearer-Authentifizierung, Mutations-Gate)
- `packages/cli/src/serve/rate-limit.ts` (stufenbasierte HTTP-Ratenbegrenzung)
- `packages/cli/src/serve/capabilities.ts` (Capability-Registry und bedingte Werbung)
- `packages/cli/src/serve/types.ts` (`ServeOptions`, `CapabilitiesEnvelope`)
- `packages/cli/src/serve/daemon-status-provider.ts`
- `packages/cli/src/serve/permission-audit.ts`
- Issues: [#3803](https://github.com/QwenLM/qwen-code/issues/3803), [#4175](https://github.com/QwenLM/qwen-code/issues/4175)