# Konfigurationsreferenz

## Übersicht

Diese Seite enthält alle Einstellungen, die sich auf den `qwen serve`-Daemon und seine Adapter auswirken: Umgebungsvariablen, CLI-Flags, `settings.json`-Schlüssel und programmatische Optionen. Themenspezifische Seiten verweisen hierher, wenn sie übergreifende Konfigurationsdetails benötigen.

## CLI-Flags (`qwen serve`)

| Flag                                    | Typ                        | Standard                                                                                                                 | Effekt                                                                                                                                                                                                                         |
| --------------------------------------- | -------------------------- | ------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `--hostname <host>`                     | Zeichenkette               | `127.0.0.1`                                                                                                              | Bindungsadresse. Loopback-Werte: `127.0.0.1`, `localhost`, `::1`, `[::1]`. Nicht-Loopback erfordert ein Bearer-Token beim Start. `host:port`-Eingabe wird mit Hinweis auf `--port` abgewiesen.                                 |
| `--port <n>`                            | Zahl                       | `4170`                                                                                                                   | Lauschport; `0` bedeutet ephemer.                                                                                                                                                                                              |
| `--token <s>`                           | Zeichenkette               | env                                                                                                                      | Bearer-Token. Überschreibt `QWEN_SERVER_TOKEN` und wird beim Start getrimmt. Es erscheint in der Prozesskommandozeile, daher in Bereitstellungen env vorziehen.                                                                  |
| `--require-auth`                        | boolesch                   | `false`                                                                                                                  | Erweitert Bearer-Authentifizierung auf Loopback und `/health`; der Start wird ohne Token verweigert.                                                                                                                           |
| `--workspace <dir>`                     | absoluter Pfad             | `process.cwd()`                                                                                                          | Gebundenes Arbeitsverzeichnis. Muss absolut und ein Verzeichnis sein; wird einmal beim Start kanonisch gemacht.                                                                                                                |
| `--max-sessions <n>`                    | Zahl                       | `20`                                                                                                                     | Obergrenze für aktive Sitzungen. `0` / `Infinity` bedeutet unbegrenzt; `NaN` / negative Werte werfen einen Fehler.                                                                                                             |
| `--max-pending-prompts-per-session <n>` | Zahl                       | `5`                                                                                                                      | Obergrenze für akzeptierte, aber ausstehende/laufende Prompts pro Sitzung. Überschüssiger Prompt gibt 503 zurück. `0` / `Infinity` bedeutet unbegrenzt; negative oder nicht-ganzzahlige Werte werfen einen Fehler.               |
| `--max-connections <n>`                 | Zahl                       | `256`                                                                                                                    | HTTP-Listener `server.maxConnections`; `0` / `Infinity` bedeutet unbegrenzt.                                                                                                                                                    |
| `--enable-session-shell`                | boolesch                   | `false`                                                                                                                  | Aktiviert direkte Ausführung über `POST /session/:id/shell`. Erfordert Bearer-Token, und jeder Aufruf muss eine sitzungsgebundene `X-Qwen-Client-Id` enthalten.                                                                 |
| `--event-ring-size <n>`                 | Zahl                       | `8000`                                                                                                                   | Per-Sitzung SSE-Wiedergabering; weiche Obergrenze ist `1_000_000`.                                                                                                                                                             |
| `--http-bridge`                         | boolesch                   | `true`                                                                                                                   | Stufe-1-Bridge-Modus. `--no-http-bridge` fällt auf http-bridge zurück und gibt eine Meldung auf stderr aus.                                                                                                                     |
| `--mcp-client-budget <n>`               | positive Ganzzahl          | nicht gesetzt                                                                                                            | Setzt `WorkspaceMcpBudget.clientBudget` und leitet es an das ACP-Kind über `childEnvOverrides` weiter.                                                                                                                         |
| `--mcp-budget-mode <m>`                 | `off` / `warn` / `enforce` | `warn` wenn Budget gesetzt, sonst `off`                                                                                  | Setzt `WorkspaceMcpBudget.mode`; `enforce` erfordert `--mcp-client-budget`.                                                                                                                                                    |
| `--allow-origin <pattern>`              | wiederholbare Zeichenkette | nicht gesetzt                                                                                                            | Cross-Origin-Zulassungsliste, die die standardmäßige CORS-Verweigerung ersetzt. `*` erlaubt jeden Ursprung, erfordert aber ein Token.                                                                                         |
| `--allow-private-auth-base-url`         | boolesch                   | `false`                                                                                                                  | Erlaubt `/workspace/auth/provider`, eine Auth-Provider-`baseUrl` auf localhost/privatem Netzwerk zu installieren; nur in vertrauenswürdiger lokaler Entwicklung verwenden.                                                       |
| `--prompt-deadline-ms <n>`              | positive Ganzzahl          | nicht gesetzt                                                                                                            | Serverseitige Prompt-Wallclock-Obergrenze in ms. Timeout bricht ab und gibt einen Fehler zurück.                                                                                                                               |
| `--writer-idle-timeout-ms <n>`          | positive Ganzzahl          | nicht gesetzt                                                                                                            | Leerlauf-Timeout pro SSE-Verbindung in ms. Der Daemon schließt die SSE-Verbindung, wenn für diese Dauer kein Ereignis gesendet wird.                                                                                          |
| `--channel-idle-timeout-ms <n>`         | nicht-negative Ganzzahl    | `0`                                                                                                                      | Wie lange das ACP-Kind nach dem Schließen der letzten Sitzung am Leben bleibt. `0` bedeutet sofortige Freigabe.                                                                                                                 |
| `--session-reap-interval-ms <n>`        | nicht-negative Ganzzahl    | `60000`                                                                                                                  | Intervall des Sitzungsbereinigungsscans; `0` deaktiviert es.                                                                                                                                                                   |
| `--session-idle-timeout-ms <n>`         | nicht-negative Ganzzahl    | `1800000`                                                                                                                | Leerlauf-Bereinigungszeit für getrennte Sitzungen; `0` deaktiviert es.                                                                                                                                                          |
| `--rate-limit` / `--no-rate-limit`      | boolesch                   | env / off                                                                                                                | Aktiviert HTTP-Ratenbegrenzung pro Stufe für Prompt-, Mutations- und Lese-Routen.                                                                                                                                               |
| `--rate-limit-prompt <n>`               | positive Ganzzahl          | `10`                                                                                                                     | Prompt-Anfragelimit pro Fenster; erfordert aktivierte Ratenbegrenzung.                                                                                                                                                          |
| `--rate-limit-mutation <n>`             | positive Ganzzahl          | `30`                                                                                                                     | Mutations-Anfragelimit pro Fenster; erfordert aktivierte Ratenbegrenzung.                                                                                                                                                       |
| `--rate-limit-read <n>`                 | positive Ganzzahl          | `120`                                                                                                                    | Lese-Anfragelimit pro Fenster; erfordert aktivierte Ratenbegrenzung.                                                                                                                                                            |
| `--rate-limit-window-ms <n>`            | Ganzzahl `>= 1000`         | `60000`                                                                                                                  | Länge des Ratenbegrenzungsfensters; erfordert aktivierte Ratenbegrenzung.                                                                                                                                                       |
| kein Flag                               | –                          | –                                                                                                                        | `QWEN_SERVE_NO_MCP_POOL=1` deaktiviert den Pool vollständig.                                                                                                                                                                   |
## Umgebungsvariablen

### Gelesen von `runQwenServe` / Express-Middleware

| Env | Effekt |
| --- | --- |
| `QWEN_SERVER_TOKEN` | Bearer-Token; wird beim Start getrimmt. |
| `QWEN_SERVE_DEBUG` | `1` / `true` / `on` / `yes` (Groß-/Kleinschreibung nicht beachtet) aktiviert ausführliche stderr-Protokolle. Siehe [`19-observability.md`](./19-observability.md). |
| `QWEN_SERVE_NO_MCP_POOL` | `1` deaktiviert den Arbeitsbereich-MCP-Transportpool und fällt auf den sitzungsbezogenen `McpClientManager` zurück; Fähigkeiten werben nicht mehr `mcp_workspace_pool` / `mcp_pool_restart` an. |
| `QWEN_SERVE_PROMPT_DEADLINE_MS` | Env-Fallback für `--prompt-deadline-ms`. |
| `QWEN_SERVE_WRITER_IDLE_TIMEOUT_MS` | Env-Fallback für `--writer-idle-timeout-ms`. |
| `QWEN_SERVE_RATE_LIMIT` | `1` / `true` aktiviert HTTP-Ratenbegrenzung pro Stufe; CLI `--rate-limit` / `--no-rate-limit` hat Vorrang. |
| `QWEN_SERVE_RATE_LIMIT_PROMPT` | Env-Fallback für `--rate-limit-prompt`. |
| `QWEN_SERVE_RATE_LIMIT_MUTATION` | Env-Fallback für `--rate-limit-mutation`. |
| `QWEN_SERVE_RATE_LIMIT_READ` | Env-Fallback für `--rate-limit-read`. |
| `QWEN_SERVE_RATE_LIMIT_WINDOW_MS` | Env-Fallback für `--rate-limit-window-ms`. |

### An das ACP-Kind über `BridgeOptions.childEnvOverrides` weitergeleitet

`runQwenServe` erstellt diese pro Handle, sodass sich zwei Daemons in einem Prozess nicht um `process.env` streiten. Die Budgetvariablen sind keine Env-Fallbacks des Elternprozesses für `qwen serve`; der CLI-Pfad muss sie aus `--mcp-client-budget` / `--mcp-budget-mode` generieren.

| Env | Effekt |
| --- | --- |
| `QWEN_SERVE_MCP_CLIENT_BUDGET` | Positive Ganzzahl-Zeichenfolge, die von der `readBudgetFromEnv()` des ACP-Kindes verbraucht wird. |
| `QWEN_SERVE_MCP_BUDGET_MODE` | `off` / `warn` / `enforce`. |
| `QWEN_SERVE_MCP_POOL_TRANSPORTS` | Durch Kommas getrennte Transport-Allowlist; standardmäßig gepoolte Transports sind `stdio,websocket`; kann explizit `http,sse` enthalten. |
| `QWEN_SERVE_MCP_POOL_DRAIN_MS` | Pool-Eintrag Leerlauf-Ablaufverzögerung; Standard `30000`, begrenzt auf `1000..600000` ms. |

### Gelesen von SDK / Adaptern

| Env | Effekt |
| --- | --- |
| `QWEN_DAEMON_URL` | Daemon-Basis-URL für CLI-TUI-Adapter, Kanäle und IDE-Begleiter. |
| `QWEN_DAEMON_TOKEN` | Bearer-Token. |
| `QWEN_DAEMON_WORKSPACE` | Überschreibt das `cwd`, das an `POST /session` gesendet wird. |

## `settings.json`-Schlüssel

Der Daemon liest die Einstellungen einmal beim Start durch `loadSettings(boundWorkspace)` innerhalb von `runQwenServe`. Fehlerhafte Einstellungen fallen über einen try/catch-Schutz auf Standardwerte zurück.

| Schlüssel | Typ | Effekt |
| --- | --- | --- |
| `policy.permissionStrategy` | `'first-responder' \| 'designated' \| 'consensus' \| 'local-only'` | Setzt `BridgeOptions.permissionPolicy`; der aktive Wert erscheint in `/capabilities` als `policy.permission`. **Boot validiert** über `validatePolicyConfig()` gegen `SERVE_CAPABILITY_REGISTRY.permission_mediation.modes`. Unbekannte Literale werfen `InvalidPolicyConfigError` und führen zu einem expliziten Startfehler. |
| `policy.consensusQuorum` | positive ganze Zahl | N für die `consensus`-Richtlinie. **Standard** ist `floor(M/2) + 1` über `votersAtIssue.size` (M=2 bedeutet einstimmig; größeres gerades M bedeutet mehr als die Hälfte). Wenn unter einer Nicht-Consensus-Richtlinie gesetzt, wird es ignoriert und der Start gibt eine stderr-Warnung aus. Nicht-positive ganze Zahlen werfen `InvalidPolicyConfigError`. Siehe [`04-permission-mediation.md`](./04-permission-mediation.md). |
| `context.fileName` | Zeichenfolge | Überschreibt `getCurrentGeminiMdFilename()` über `BridgeOptions.contextFilename`. |
| `tools.disabled` | Zeichenfolge[] | Tools, die für den nächsten ACP-Kind-Spawn deaktiviert sind. Normalisiert durch `normalizeDisabledToolList()` (`packages/cli/src/config/normalizeDisabledTools.ts`): Nicht-Arrays werden zu `[]`, Nicht-Zeichenfolgen-Einträge werden übersprungen, Leerzeichen werden getrimmt, leere Einträge werden entfernt und Duplikate werden unter Beibehaltung des ersten Vorkommens entfernt. Boot und `restartMcpServer`-Einstellungsaktualisierung durchlaufen beide diese Funktion. `ToolRegistry.has(name)` ist exakt und case-sensitiv. `POST /workspace/tools/:name/enable` und `tool_toggled` aktualisieren diesen Schlüssel. |
| `tools.approvalMode` | `'default' \| 'auto' \| ...` | Standard-Sitzungsgenehmigungsmodus; `POST /session/:id/approval-mode` schreibt hier, wenn `persist: true`. |
| `telemetry` | Objekt | OTel-Konfiguration. Schlüssel umfassen `enabled`, `otlpEndpoint`, `otlpProtocol`, `otlpTracesEndpoint`, `otlpLogsEndpoint`, `otlpMetricsEndpoint`, `target`, `outfile`, `includeSensitiveSpanAttributes`, `resourceAttributes` und `metrics.includeSessionId`. `resolveTelemetrySettings()` liest es beim Start und initialisiert `initializeTelemetry()`. |
## `ServeOptions` (programmatische Einbettung)

`packages/cli/src/serve/types.ts` definiert das typisierte Optionen-Objekt, das sowohl von `runQwenServe` als auch von `createServeApp` akzeptiert wird. Es spiegelt die obigen CLI-Flags wider und fügt hinzu:

| Feld                           | Effekt                                                                                        |
| ------------------------------ | --------------------------------------------------------------------------------------------- |
| `eventRingSize`                | Überschreibt die standardmäßige Ringgröße pro Sitzung.                                        |
| `maxPendingPromptsPerSession`  | Anzahl ausstehender Prompts pro Sitzung; `0` / `Infinity` bedeutet unbegrenzt.                |
| `mcpPoolActive`                | Programmatischer Schalter, standardmäßig von `QWEN_SERVE_NO_MCP_POOL` abgeleitet.              |
| `allowOrigins`                 | Cross-Origin-Whitelist (`string[]`), entspricht `--allow-origin`.                              |
| `allowPrivateAuthBaseUrl`      | Ermöglicht die Installation einer privaten / Localhost-Authentifizierungsanbieter-`baseUrl`.   |
| `enableSessionShell`           | Aktiviert die Ausführung von Sitzungs-Shells; Bearer-Token und sitzungsgebundene Client-ID sind weiterhin erforderlich. |
| `promptDeadlineMs`             | Prompt-Wanduhrzeit-Limit.                                                                     |
| `writerIdleTimeoutMs`          | Inaktivitäts-Timeout des SSE-Writers.                                                         |
| `channelIdleTimeoutMs`         | Wie lange der ACP-Child nach dem Schließen der letzten Sitzung warm gehalten wird.            |
| `sessionReapIntervalMs`        | Intervall für den Sitzungsbereinigungsscan.                                                   |
| `sessionIdleTimeoutMs`         | Inaktivitäts-Timeout für getrennte Sitzungen.                                                 |
| `rateLimit*`                   | HTTP-Ratenbegrenzungsschalter pro Stufe, Schwellenwerte und Fenster.                          |

## `BridgeOptions` (programmatische Brückeneinbettung)

`packages/acp-bridge/src/bridgeOptions.ts` definiert Brückenoptionen. Die vollständige Tabelle finden Sie in [`03-acp-bridge.md`](./03-acp-bridge.md). Wichtige Felder:

| Feld                                                                                                                     | Effekt                                                                                        |
| ------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------- |
| `boundWorkspace`                                                                                                         | Erforderlicher kanonischer Arbeitsbereich.                                                    |
| `sessionScope`                                                                                                           | `'single'` (Standard) vs. `'thread'`.                                                         |
| `initializeTimeoutMs`, `maxSessions`, `eventRingSize`, `permissionResponseTimeoutMs`, `maxPendingPermissionsPerSession`  | Begrenzte Ressourcenobergrenzen.                                                              |
| `channelFactory`                                                                                                         | Einsteckbare ACP-Child-Factory; Standard ist `defaultSpawnChannelFactory`.                    |
| `fileSystem`                                                                                                             | `BridgeFileSystem`-Adapter. Siehe [`07-workspace-filesystem.md`](./07-workspace-filesystem.md). |
| `permissionPolicy`, `permissionConsensusQuorum`, `permissionAudit`                                                       | Mediator-Verdrahtung.                                                                         |
| `statusProvider`                                                                                                         | Daemon-Host-Preflight-Zellen.                                                                 |
| `childEnvOverrides`                                                                                                      | Umgebungserweiterungen oder -entfernungen pro Handle.                                         |
| `contextFilename`                                                                                                        | Überschreibt `getCurrentGeminiMdFilename()`.                                                  |
| `channelIdleTimeoutMs`                                                                                                   | Wie lange der ACP-Child nach dem Schließen der letzten Sitzung aktiv bleibt, in ms; Standard `0`. |

## Wichtige Standardwerte

| Konstante                          | Datei                    | Wert              | Bedeutung                                                           |
| ---------------------------------- | ------------------------ | ----------------- | ------------------------------------------------------------------- |
| `DEFAULT_MAX_SESSIONS`             | `bridge.ts`              | `20`              | Sitzungslimit vor `SessionLimitExceededError`.                      |
| `MAX_EVENT_RING_SIZE`              | `bridge.ts`              | `1_000_000`       | Weiches Limit für `BridgeOptions.eventRingSize`; schützt vor Tippfehlern. |
| `DEFAULT_RING_SIZE`                | `eventBus.ts`            | `8000`            | Tiefe des SSE-Wiedergaberinges pro Sitzung.                          |
| `DEFAULT_MAX_QUEUED`               | `eventBus.ts`            | `256`             | Warteschlangenlimit pro Abonnent.                                    |
| `DEFAULT_MAX_SUBSCRIBERS`          | `eventBus.ts`            | `64`              | Abonnentenlimit pro Bus.                                              |
| `WARN_THRESHOLD_RATIO`             | `eventBus.ts`            | `0.75`            | `slow_client_warning`-Auslöser.                                      |
| `WARN_RESET_RATIO`                 | `eventBus.ts`            | `0.375`           | Hystereseschwelle zum erneuten Scharfschalten.                       |
| `DEFAULT_INIT_TIMEOUT_MS`          | `bridge.ts`              | `10_000`          | Timeout für den ACP-`initialize`-Handshake.                          |
| `MCP_RESTART_TIMEOUT_MS`           | `bridge.ts`              | `300_000`         | Bridge-Timeout für `/workspace/mcp/:server/restart`.                 |
| `DEFAULT_PERMISSION_TIMEOUT_MS`    | `bridge.ts`              | `5 * 60_000`      | Wanduhrzeit pro Berechtigungsanfrage.                                 |
| `DEFAULT_MAX_PENDING_PER_SESSION`  | `bridge.ts`              | `64`              | Abgestimmt auf `DEFAULT_MAX_SUBSCRIBERS`.                            |
| `MAX_RESOLVED_PERMISSION_RECORDS`  | `permissionMediator.ts`  | `512`             | FIFO für kürzlich aufgelöste Berechtigungen.                         |
| `KILL_HARD_DEADLINE_MS`            | `spawnChannel.ts`        | `10_000`          | Zeitfenster für das ordnungsgemäße Herunterfahren pro Kanal.         |
| `SHUTDOWN_FORCE_CLOSE_MS`          | `run-qwen-serve.ts`      | `5_000`           | HTTP-Server-Force-Close-Timer.                                       |
| `MAX_READ_BYTES`                   | `fs/policy.ts`           | `256 * 1024`      | Leselimit.                                                           |
| `MAX_WRITE_BYTES`                  | `fs/policy.ts`           | `5 * 1024 * 1024` | Schreiblimit.                                                        |
| `MAX_DISPLAY_NAME_LENGTH`          | `bridge.ts`              | `256`             | Sitzungs-`displayName`-Limit.                                        |
## Querverweise

- Auth-Einstellungen: [`12-auth-security.md`](./12-auth-security.md)
- Fähigkeiten und Protokollversion: [`11-capabilities-versioning.md`](./11-capabilities-versioning.md)
- Event-Ring und Backpressure-Tuning: [`10-event-bus.md`](./10-event-bus.md)
- MCP-Pool / Budget: [`05-mcp-transport-pool.md`](./05-mcp-transport-pool.md) und [`06-mcp-budget-guardrails.md`](./06-mcp-budget-guardrails.md)
- Berechtigungsrichtlinie: [`04-permission-mediation.md`](./04-permission-mediation.md)
- Benutzerhandbuch: [`../../users/qwen-serve.md`](../../users/qwen-serve.md)
