# Konfigurationsreferenz

## Übersicht

Diese Seite sammelt alle Einstellungen, die den `qwen serve`-Daemon und seine Adapter betreffen: Umgebungsvariablen, CLI-Flags, `settings.json`-Schlüssel und programmatische Optionen. Feature-spezifische Seiten verlinken hierher zurück, wenn sie übergreifende Konfigurationsdetails benötigen.

## CLI-Flags (`qwen serve`)

| Flag                                    | Typ                        | Standard                                   | Effekt                                                                                                                                                                              |
| --------------------------------------- | -------------------------- | ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--hostname <host>`                     | string                     | `127.0.0.1`                                | Bindungsadresse. Loopback-Werte: `127.0.0.1`, `localhost`, `::1`, `[::1]`. Non-Loopback erfordert beim Start ein Bearer-Token. Die Eingabe `host:port` wird abgelehnt mit dem Hinweis, `--port` zu verwenden. |
| `--port <n>`                            | number                     | `4170`                                     | Listen-Port; `0` bedeutet ein ephemeraler Port.                                                                                                                                     |
| `--token <s>`                           | string                     | env                                        | Bearer-Token. Überschreibt `QWEN_SERVER_TOKEN` und wird beim Start getrimmt. Es erscheint in der Prozess-Befehlszeile, daher in Deployments bevorzugt die Umgebungsvariable verwenden. |
| `--require-auth`                        | boolean                    | `false`                                    | Erweitert die Bearer-Authentifizierung auf Loopback und `/health`; der Start wird ohne Token verweigert.                                                                            |
| `--workspace <dir>`                     | absolute path              | `process.cwd()`                            | Gebundener Workspace. Muss absolut und ein Verzeichnis sein; wird beim Start einmal kanonisiert.                                                                                    |
| `--max-sessions <n>`                    | number                     | `20`                                       | Obergrenze für aktive Sessions. `0` / `Infinity` bedeutet unbegrenzt; `NaN` / negative Werte lösen einen Fehler aus.                                                                |
| `--max-pending-prompts-per-session <n>` | number                     | `5`                                        | Obergrenze für akzeptierte, aber ausstehende/laufende Prompts pro Session. Überschüssige Prompts geben 503 zurück. `0` / `Infinity` bedeutet unbegrenzt; negative oder nicht-ganzzahlige Werte lösen einen Fehler aus. |
| `--max-connections <n>`                 | number                     | `256`                                      | HTTP-Listener `server.maxConnections`; `0` / `Infinity` bedeutet unbegrenzt.                                                                                                        |
| `--enable-session-shell`                | boolean                    | `false`                                    | Aktiviert die direkte `POST /session/:id/shell`-Ausführung. Erfordert ein Bearer-Token und jeder Aufruf muss eine session-gebundene `X-Qwen-Client-Id` mitführen.                   |
| `--event-ring-size <n>`                 | number                     | `8000`                                     | SSE-Replay-Ring pro Session; Soft-Limit ist `1_000_000`.                                                                                                                            |
| `--http-bridge`                         | boolean                    | `true`                                     | Stage-1-Bridge-Modus. `--no-http-bridge` fällt dennoch auf die HTTP-Bridge zurück und gibt eine Meldung auf stderr aus.                                                             |
| `--mcp-client-budget <n>`               | positive integer           | unset                                      | Setzt `WorkspaceMcpBudget.clientBudget` und leitet es über `childEnvOverrides` an den ACP-Child weiter.                                                                             |
| `--mcp-budget-mode <m>`                 | `off` / `warn` / `enforce` | `warn` wenn Budget gesetzt, sonst `off`    | Setzt `WorkspaceMcpBudget.mode`; `enforce` erfordert `--mcp-client-budget`.                                                                                                         |
| `--allow-origin <pattern>`              | repeatable string          | unset                                      | Cross-Origin-Allowlist, die die Standard-CORS-Ablehnung ersetzt. `*` erlaubt jeden Origin, erfordert aber ein Token.                                                                |
| `--allow-private-auth-base-url`         | boolean                    | `false`                                    | Erlaubt `/workspace/auth/provider`, die `baseUrl` eines Localhost-/Private-Network-Auth-Providers zu installieren; nur in vertrauenswürdiger lokaler Entwicklung verwenden.         |
| `--prompt-deadline-ms <n>`              | positive integer           | unset                                      | Serverseitiges Prompt-Wallclock-Limit in ms. Timeout bricht ab und gibt einen Fehler zurück.                                                                                        |
| `--writer-idle-timeout-ms <n>`          | positive integer           | unset                                      | Idle-Timeout pro SSE-Verbindung in ms. Der Daemon schließt die SSE-Verbindung, wenn für diese Dauer kein Ereignis gesendet wird.                                                    |
| `--channel-idle-timeout-ms <n>`         | non-negative integer       | `0`                                        | Wie lange der ACP-Child nach dem Schließen der letzten Session am Leben gehalten wird. `0` bedeutet sofortige Freigabe.                                                             |
| `--session-reap-interval-ms <n>`        | non-negative integer       | `60000`                                    | Scan-Intervall des Session-Reapers; `0` deaktiviert ihn.                                                                                                                            |
| `--session-idle-timeout-ms <n>`         | non-negative integer       | `1800000`                                  | Idle-Reaping-Zeit für getrennte Sessions; `0` deaktiviert sie.                                                                                                                      |
| `--rate-limit` / `--no-rate-limit`      | boolean                    | env / off                                  | Aktiviert das HTTP-Rate-Limiting pro Stufe für Prompt-, Mutations- und Lese-Routen.                                                                                                 |
| `--rate-limit-prompt <n>`               | positive integer           | `10`                                       | Prompt-Request-Limit pro Zeitfenster; erfordert aktiviertes Rate-Limiting.                                                                                                          |
| `--rate-limit-mutation <n>`             | positive integer           | `30`                                       | Mutations-Request-Limit pro Zeitfenster; erfordert aktiviertes Rate-Limiting.                                                                                                       |
| `--rate-limit-read <n>`                 | positive integer           | `120`                                      | Lese-Request-Limit pro Zeitfenster; erfordert aktiviertes Rate-Limiting.                                                                                                            |
| `--rate-limit-window-ms <n>`            | integer `>= 1000`          | `60000`                                    | Länge des Rate-Limit-Zeitfensters; erfordert aktiviertes Rate-Limiting.                                                                                                             |
| kein Flag                               | -                          | -                                          | `QWEN_SERVE_NO_MCP_POOL=1` deaktiviert den Pool vollständig.                                                                                                                        |

## Umgebungsvariablen

### Gelesen von `runQwenServe` / Express-Middleware

| Env                                 | Effekt                                                                                                                                                                   |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `QWEN_SERVER_TOKEN`                 | Bearer-Token; wird beim Start getrimmt.                                                                                                                                  |
| `QWEN_SERVE_DEBUG`                  | `1` / `true` / `on` / `yes` (Groß-/Kleinschreibung wird ignoriert) aktiviert ausführliche stderr-Logs. Siehe [`19-observability.md`](./19-observability.md).               |
| `QWEN_SERVE_NO_MCP_POOL`            | `1` deaktiviert den Workspace-MCP-Transport-Pool und fällt auf den session-spezifischen `McpClientManager` zurück; Capabilities bewerben nicht mehr `mcp_workspace_pool` / `mcp_pool_restart`. |
| `QWEN_SERVE_PROMPT_DEADLINE_MS`     | Umgebungs-Fallback für `--prompt-deadline-ms`.                                                                                                                           |
| `QWEN_SERVE_WRITER_IDLE_TIMEOUT_MS` | Umgebungs-Fallback für `--writer-idle-timeout-ms`.                                                                                                                       |
| `QWEN_SERVE_RATE_LIMIT`             | `1` / `true` aktiviert das HTTP-Rate-Limiting pro Stufe; CLI `--rate-limit` / `--no-rate-limit` hat Vorrang.                                                             |
| `QWEN_SERVE_RATE_LIMIT_PROMPT`      | Umgebungs-Fallback für `--rate-limit-prompt`.                                                                                                                            |
| `QWEN_SERVE_RATE_LIMIT_MUTATION`    | Umgebungs-Fallback für `--rate-limit-mutation`.                                                                                                                          |
| `QWEN_SERVE_RATE_LIMIT_READ`        | Umgebungs-Fallback für `--rate-limit-read`.                                                                                                                              |
| `QWEN_SERVE_RATE_LIMIT_WINDOW_MS`   | Umgebungs-Fallback für `--rate-limit-window-ms`.                                                                                                                         |

### An den ACP-Child weitergeleitet über `BridgeOptions.childEnvOverrides`

`runQwenServe` erstellt diese pro Handle, sodass zwei Daemons in einem Prozess nicht um `process.env` konkurrieren. Die Budget-Variablen sind keine Umgebungs-Fallbacks des Elternprozesses für `qwen serve`; der CLI-Pfad muss sie aus `--mcp-client-budget` / `--mcp-budget-mode` generieren.

| Env                              | Effekt                                                                                                                   |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `QWEN_SERVE_MCP_CLIENT_BUDGET`   | Positiver Integer-String, der von `readBudgetFromEnv()` des ACP-Childs konsumiert wird.                                  |
| `QWEN_SERVE_MCP_BUDGET_MODE`     | `off` / `warn` / `enforce`.                                                                                              |
| `QWEN_SERVE_MCP_POOL_TRANSPORTS` | Kommagetrennte Transport-Allowlist; Standard-Pool-Transports sind `stdio,websocket`; kann explizit `http,sse` enthalten. |
| `QWEN_SERVE_MCP_POOL_DRAIN_MS`   | Idle-Drain-Verzögerung für Pool-Einträge; Standard ist `30000`, begrenzt auf `1000..600000` ms.                          |

### Gelesen von SDK / Adaptern

| Env                     | Effekt                                                            |
| ----------------------- | ----------------------------------------------------------------- |
| `QWEN_DAEMON_URL`       | Daemon-Basis-URL für CLI-TUI-Adapter, Channels und IDE-Companion. |
| `QWEN_DAEMON_TOKEN`     | Bearer-Token.                                                     |
| `QWEN_DAEMON_WORKSPACE` | Überschreibt das `cwd`, das an `POST /session` gesendet wird.     |

## `settings.json`-Schlüssel

Der Daemon liest die Einstellungen einmal beim Start über `loadSettings(boundWorkspace)` innerhalb von `runQwenServe`. Fehlerhafte Einstellungen fallen über einen try/catch-Schutzmechanismus auf die Standardwerte zurück.

| Key                         | Typ                                                                | Effekt                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| --------------------------- | ------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `policy.permissionStrategy` | `'first-responder' \| 'designated' \| 'consensus' \| 'local-only'` | Setzt `BridgeOptions.permissionPolicy`; der aktive Wert erscheint in `/capabilities` als `policy.permission`. **Der Start validiert** über `validatePolicyConfig()` gegen `SERVE_CAPABILITY_REGISTRY.permission_mediation.modes`. Unbekannte Literale lösen einen `InvalidPolicyConfigError` aus und brechen den Start explizit ab.                                                                                                                                                               |
| `policy.consensusQuorum`    | positive integer                                                   | N für die `consensus`-Policy. **Standard** ist `floor(M/2) + 1` über `votersAtIssue.size` (M=2 bedeutet einstimmig; größeres gerades M bedeutet mehr als die Hälfte). Wenn es unter einer Nicht-Consensus-Policy gesetzt wird, wird es ignoriert und der Start gibt eine stderr-Warnung aus. Nicht-positive Ganzzahlen lösen einen `InvalidPolicyConfigError` aus. Siehe [`04-permission-mediation.md`](./04-permission-mediation.md).                                                                                                        |
| `context.fileName`          | string                                                             | Überschreibt `getCurrentGeminiMdFilename()` über `BridgeOptions.contextFilename`.                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `tools.disabled`            | string[]                                                           | Tools, die für den nächsten ACP-Child-Spawn deaktiviert sind. Normalisiert über `normalizeDisabledToolList()` (`packages/cli/src/config/normalizeDisabledTools.ts`): Nicht-Arrays werden zu `[]`, Nicht-String-Einträge werden übersprungen, Leerzeichen werden getrimmt, leere Einträge werden verworfen und Duplikate werden entfernt, wobei das erste Vorkommen beibehalten wird. Sowohl der Start als auch die Aktualisierung der `restartMcpServer`-Einstellungen durchlaufen diese Funktion. `ToolRegistry.has(name)` ist exakt und beachtet die Groß-/Kleinschreibung. `POST /workspace/tools/:name/enable` und `tool_toggled` aktualisieren diesen Schlüssel. |
| `tools.approvalMode`        | `'default' \| 'auto' \| ...`                                       | Standard-Session-Genehmigungsmodus; `POST /session/:id/approval-mode` schreibt hierhin, wenn `persist: true`.                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `telemetry`                 | object                                                             | OTel-Konfiguration. Schlüssel umfassen `enabled`, `otlpEndpoint`, `otlpProtocol`, `otlpTracesEndpoint`, `otlpLogsEndpoint`, `otlpMetricsEndpoint`, `target`, `outfile`, `includeSensitiveSpanAttributes`, `sensitiveSpanAttributeMaxLength`, `resourceAttributes` und `metrics.includeSessionId`. `resolveTelemetrySettings()` liest dies beim Start und initialisiert `initializeTelemetry()`.                                                                                                                                                             |

## `ServeOptions` (programmatische Einbettung)

`packages/cli/src/serve/types.ts` definiert das typisierte Optionsobjekt, das sowohl von `runQwenServe` als auch von `createServeApp` akzeptiert wird. Es spiegelt die obigen CLI-Flags wider und fügt hinzu:

| Field                         | Effekt                                                                                        |
| ----------------------------- | --------------------------------------------------------------------------------------------- |
| `eventRingSize`               | Überschreibt die Standard-Ringgröße pro Session.                                              |
| `maxPendingPromptsPerSession` | Obergrenze für ausstehende Prompts pro Session; `0` / `Infinity` bedeutet unbegrenzt.         |
| `mcpPoolActive`               | Programmatischer Schalter, Standardwert abgeleitet von `QWEN_SERVE_NO_MCP_POOL`.              |
| `allowOrigins`                | Cross-Origin-Allowlist (`string[]`), entspricht `--allow-origin`.                             |
| `allowPrivateAuthBaseUrl`     | Erlaubt die Installation der `baseUrl` für private / Localhost-Auth-Provider.                 |
| `enableSessionShell`          | Aktiviert die Session-Shell-Ausführung; Bearer-Token und session-gebundene Client-ID sind weiterhin erforderlich. |
| `promptDeadlineMs`            | Prompt-Wallclock-Limit.                                                                       |
| `writerIdleTimeoutMs`         | SSE-Writer-Idle-Timeout.                                                                      |
| `channelIdleTimeoutMs`        | Wie lange der ACP-Child nach dem Schließen der letzten Session warmgehalten wird.             |
| `sessionReapIntervalMs`       | Scan-Intervall des Session-Reapers.                                                           |
| `sessionIdleTimeoutMs`        | Idle-Reaping-Zeit für getrennte Sessions.                                                     |
| `rateLimit*`                  | HTTP-Rate-Limit-Schalter, Schwellenwerte und Zeitfenster pro Stufe.                           |
## `BridgeOptions` (programmatische Bridge-Einbettung)

`packages/acp-bridge/src/bridgeOptions.ts` definiert die Bridge-Optionen. Die vollständige Tabelle findest du in [`03-acp-bridge.md`](./03-acp-bridge.md). Wichtige Felder:

| Feld                                                                                                                   | Auswirkung                                                                                  |
| ----------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `boundWorkspace`                                                                                                        | Erforderlicher kanonischer Workspace.                                                         |
| `sessionScope`                                                                                                          | `'single'` (Standard) vs. `'thread'`.                                                         |
| `initializeTimeoutMs`, `maxSessions`, `eventRingSize`, `permissionResponseTimeoutMs`, `maxPendingPermissionsPerSession` | Begrenzte Ressourcenlimits.                                                                   |
| `channelFactory`                                                                                                        | Steckbare ACP-Child-Factory; Standard ist `defaultSpawnChannelFactory`.                       |
| `fileSystem`                                                                                                            | `BridgeFileSystem`-Adapter. Siehe [`07-workspace-filesystem.md`](./07-workspace-filesystem.md). |
| `permissionPolicy`, `permissionConsensusQuorum`, `permissionAudit`                                                      | Mediator-Verkabelung.                                                                         |
| `statusProvider`                                                                                                        | Daemon-Host-Preflight-Zellen.                                                                 |
| `childEnvOverrides`                                                                                                     | Umgebungsvariablen-Ergänzungen oder -Entfernungen pro Handle.                                 |
| `contextFilename`                                                                                                       | Überschreibt `getCurrentGeminiMdFilename()`.                                                  |
| `channelIdleTimeoutMs`                                                                                                  | Wie lange das ACP-Child nach dem Schließen der letzten Sitzung in ms am Leben gehalten wird; Standard `0`. |

## Wichtige Standardwerte

| Konstante                           | Datei                   | Wert              | Bedeutung                                                           |
| --------------------------------- | ----------------------- | ----------------- | ----------------------------------------------------------------- |
| `DEFAULT_MAX_SESSIONS`            | `bridge.ts`             | `20`              | Session-Limit vor `SessionLimitExceededError`.                      |
| `MAX_EVENT_RING_SIZE`             | `bridge.ts`             | `1_000_000`       | Soft-Limit für `BridgeOptions.eventRingSize`; schützt vor Tippfehlern. |
| `DEFAULT_RING_SIZE`               | `eventBus.ts`           | `8000`            | SSE-Replay-Ringtiefe pro Session.                                   |
| `DEFAULT_MAX_QUEUED`              | `eventBus.ts`           | `256`             | Warteschlangenlimit pro Subscriber.                                 |
| `DEFAULT_MAX_SUBSCRIBERS`         | `eventBus.ts`           | `64`              | Subscriber-Limit pro Bus.                                           |
| `WARN_THRESHOLD_RATIO`            | `eventBus.ts`           | `0.75`            | Auslöser für `slow_client_warning`.                                 |
| `WARN_RESET_RATIO`                | `eventBus.ts`           | `0.375`           | Schwellenwert für Hysterese-Re-Arm.                                 |
| `DEFAULT_INIT_TIMEOUT_MS`         | `bridge.ts`             | `10_000`          | ACP-`initialize`-Handshake-Timeout.                                 |
| `MCP_RESTART_TIMEOUT_MS`          | `bridge.ts`             | `300_000`         | Bridge-Timeout für `/workspace/mcp/:server/restart`.                |
| `DEFAULT_PERMISSION_TIMEOUT_MS`   | `bridge.ts`             | `5 * 60_000`      | Wallclock-Timeout pro Permission-Anfrage.                           |
| `DEFAULT_MAX_PENDING_PER_SESSION` | `bridge.ts`             | `64`              | Abgestimmt auf `DEFAULT_MAX_SUBSCRIBERS`.                           |
| `MAX_RESOLVED_PERMISSION_RECORDS` | `permissionMediator.ts` | `512`             | FIFO für kürzlich aufgelöste Permissions.                           |
| `KILL_HARD_DEADLINE_MS`           | `spawnChannel.ts`       | `10_000`          | Graceful-Shutdown-Fenster pro Channel.                              |
| `SHUTDOWN_FORCE_CLOSE_MS`         | `run-qwen-serve.ts`     | `5_000`           | Force-Close-Timer des HTTP-Servers.                                 |
| `MAX_READ_BYTES`                  | `fs/policy.ts`          | `256 * 1024`      | Lese-Limit.                                                         |
| `MAX_WRITE_BYTES`                 | `fs/policy.ts`          | `5 * 1024 * 1024` | Schreib-Limit.                                                      |
| `MAX_DISPLAY_NAME_LENGTH`         | `bridge.ts`             | `256`             | Limit für Session-`displayName`.                                    |

## Querverweise

- Auth-Einstellungen: [`12-auth-security.md`](./12-auth-security.md)
- Capabilities und Protokollversion: [`11-capabilities-versioning.md`](./11-capabilities-versioning.md)
- Event-Ring- und Backpressure-Tuning: [`10-event-bus.md`](./10-event-bus.md)
- MCP-Pool / -Budget: [`05-mcp-transport-pool.md`](./05-mcp-transport-pool.md) und [`06-mcp-budget-guardrails.md`](./06-mcp-budget-guardrails.md)
- Permission-Policy: [`04-permission-mediation.md`](./04-permission-mediation.md)
- User-Operations-Guide: [`../../users/qwen-serve.md`](../../users/qwen-serve.md)