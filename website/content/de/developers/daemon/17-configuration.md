# Konfigurationsreferenz

## Überblick

Diese Seite fasst alle Einstellungen zusammen, die den `qwen serve`-Daemon und seine Adapter betreffen: Umgebungsvariablen, CLI-Flags, `settings.json`-Schlüssel und programmatische Optionen. Funktionsspezifische Seiten verweisen hierher, wenn sie übergreifende Konfigurationsdetails benötigen.

## CLI-Flags (`qwen serve`)

| Flag                                    | Typ                        | Standard                                    | Wirkung                                                                                                                                                                                                                                    |
| --------------------------------------- | --------------------------- | ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `--hostname <host>`                     | string                      | `127.0.0.1`                                 | Bind-Adresse. Loopback-Werte: `127.0.0.1`, `localhost`, `::1`, `[::1]`. Nicht-Loopback erfordert einen Bearer-Token beim Start. `host:port`-Eingabe wird mit Hinweis auf `--port` abgelehnt.                                                |
| `--port <n>`                            | number                      | `4170`                                      | Listen-Port; `0` bedeutet temporär.                                                                                                                                                                                                        |
| `--token <s>`                           | string                      | env                                         | Bearer-Token. Überschreibt `QWEN_SERVER_TOKEN` und wird beim Start getrimmt. Erscheint in der Prozess-Kommandozeile, daher in Deployments Umgebungsvariable bevorzugen.                                                                   |
| `--require-auth`                        | boolean                     | `false`                                     | Erweitert Bearer-Auth auf Loopback und `/health`; Start verweigert ohne Token.                                                                                                                                                             |
| `--workspace <dir>`                     | absoluter Pfad              | `process.cwd()`                             | Gebundener Arbeitsbereich. Muss absolut und ein Verzeichnis sein; wird einmal beim Start kanonisch gemacht.                                                                                                                                |
| `--max-sessions <n>`                    | number                      | `20`                                        | Aktive Sitzungsbegrenzung. `0` / `Infinity` bedeutet unbegrenzt; `NaN` / negative Werte werfen Fehler.                                                                                                                                    |
| `--max-pending-prompts-per-session <n>` | number                      | `5`                                         | Akzeptierte, aber ausstehende/laufende Prompt-Begrenzung pro Sitzung. Überschreitung gibt 503 zurück. `0` / `Infinity` bedeutet unbegrenzt; negative oder nicht-ganzzahlige Werte werfen Fehler.                                            |
| `--max-connections <n>`                 | number                      | `256`                                       | HTTP-Listener `server.maxConnections`; `0` / `Infinity` bedeutet unbegrenzt.                                                                                                                                                               |
| `--enable-session-shell`                | boolean                     | `false`                                     | Aktiviert direkte `POST /session/:id/shell`-Ausführung. Erfordert Bearer-Token, und jeder Aufruf muss eine sitzungsgebundene `X-Qwen-Client-Id` enthalten.                                                                                 |
| `--event-ring-size <n>`                 | number                      | `8000`                                      | SSE-Wiederholungsring pro Sitzung; weiches Limit ist `1_000_000`.                                                                                                                                                                          |
| `--http-bridge`                         | boolean                     | `true`                                      | Stage-1-Bridge-Modus. `--no-http-bridge` fällt trotzdem auf http-bridge zurück und gibt eine Meldung auf stderr aus.                                                                                                                      |
| `--mcp-client-budget <n>`               | positive ganze Zahl         | nicht gesetzt                               | Setzt `WorkspaceMcpBudget.clientBudget` und leitet es über `childEnvOverrides` an das ACP-Kind weiter.                                                                                                                                    |
| `--mcp-budget-mode <m>`                 | `off` / `warn` / `enforce`  | `warn` wenn Budget gesetzt, sonst `off`     | Setzt `WorkspaceMcpBudget.mode`; `enforce` erfordert `--mcp-client-budget`.                                                                                                                                                                |
| `--allow-origin <pattern>`              | wiederholbarer String       | nicht gesetzt                               | Ursprungs-Zulassungsliste, die die standardmäßige CORS-Ablehnung ersetzt. `*` erlaubt jeden Ursprung, erfordert aber einen Token.                                                                                                          |
| `--allow-private-auth-base-url`         | boolean                     | `false`                                     | Erlaubt `/workspace/auth/provider`, eine Auth-Provider-`baseUrl` für localhost/privates Netzwerk zu installieren; nur in vertrauenswürdiger lokaler Entwicklung verwenden.                                                                |
| `--prompt-deadline-ms <n>`              | positive ganze Zahl         | nicht gesetzt                               | Serverseitige Prompt-Wanduhrzeitbegrenzung in ms. Timeout bricht ab und gibt einen Fehler zurück.                                                                                                                                         |
| `--writer-idle-timeout-ms <n>`          | positive ganze Zahl         | nicht gesetzt                               | Leerlauf-Timeout pro SSE-Verbindung in ms. Der Daemon schließt die SSE-Verbindung, wenn für diese Dauer kein Ereignis gesendet wird.                                                                                                      |
| `--channel-idle-timeout-ms <n>`         | nicht-negative ganze Zahl   | `0`                                         | Wie lange das ACP-Kind nach dem Schließen der letzten Sitzung am Leben bleibt. `0` bedeutet sofortige Freigabe.                                                                                                                            |
| `--session-reap-interval-ms <n>`        | nicht-negative ganze Zahl   | `60000`                                     | Intervall des Sitzungs-Reaper-Durchlaufs; `0` deaktiviert ihn.                                                                                                                                                                            |
| `--session-idle-timeout-ms <n>`         | nicht-negative ganze Zahl   | `1800000`                                   | Leerlauf-Entfernungszeit für getrennte Sitzungen; `0` deaktiviert sie.                                                                                                                                                                    |
| `--rate-limit` / `--no-rate-limit`      | boolean                     | env / off                                   | Aktiviert HTTP-Ratenbegrenzung pro Stufe für Prompt-, Mutations- und Lese-Routen.                                                                                                                                                          |
| `--rate-limit-prompt <n>`               | positive ganze Zahl         | `10`                                        | Prompt-Anfragenlimit pro Fenster; erfordert aktivierte Ratenbegrenzung.                                                                                                                                                                    |
| `--rate-limit-mutation <n>`             | positive ganze Zahl         | `30`                                        | Mutations-Anfragenlimit pro Fenster; erfordert aktivierte Ratenbegrenzung.                                                                                                                                                                 |
| `--rate-limit-read <n>`                 | positive ganze Zahl         | `120`                                       | Lese-Anfragenlimit pro Fenster; erfordert aktivierte Ratenbegrenzung.                                                                                                                                                                      |
| `--rate-limit-window-ms <n>`            | ganze Zahl `>= 1000`        | `60000`                                     | Länge des Ratenbegrenzungsfensters; erfordert aktivierte Ratenbegrenzung.                                                                                                                                                                  |
| Kein Flag                               | -                           | -                                          | `QWEN_SERVE_NO_MCP_POOL=1` deaktiviert den Pool vollständig.                                                                                                                                                                              |

## Umgebungsvariablen

### Von `runQwenServe` / Express-Middleware gelesen

| Env                                 | Wirkung                                                                                                                                                                             |
| ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `QWEN_SERVER_TOKEN`                 | Bearer-Token; wird beim Start getrimmt.                                                                                                                                             |
| `QWEN_SERVE_DEBUG`                  | `1` / `true` / `on` / `yes` (Groß-/Kleinschreibung egal) aktiviert ausführliche stderr-Logs. Siehe [`19-observability.md`](./19-observability.md).                                  |
| `QWEN_SERVE_NO_MCP_POOL`            | `1` deaktiviert den MCP-Transportpool des Arbeitsbereichs und fällt auf pro-Sitzung `McpClientManager` zurück; Fähigkeiten werben nicht mehr für `mcp_workspace_pool` / `mcp_pool_restart`. |
| `QWEN_SERVE_PROMPT_DEADLINE_MS`     | Umgebungsfallback für `--prompt-deadline-ms`.                                                                                                                                       |
| `QWEN_SERVE_WRITER_IDLE_TIMEOUT_MS` | Umgebungsfallback für `--writer-idle-timeout-ms`.                                                                                                                                   |
| `QWEN_SERVE_RATE_LIMIT`             | `1` / `true` aktiviert HTTP-Ratenbegrenzung pro Stufe; CLI `--rate-limit` / `--no-rate-limit` gewinnt.                                                                              |
| `QWEN_SERVE_RATE_LIMIT_PROMPT`      | Umgebungsfallback für `--rate-limit-prompt`.                                                                                                                                        |
| `QWEN_SERVE_RATE_LIMIT_MUTATION`    | Umgebungsfallback für `--rate-limit-mutation`.                                                                                                                                      |
| `QWEN_SERVE_RATE_LIMIT_READ`        | Umgebungsfallback für `--rate-limit-read`.                                                                                                                                          |
| `QWEN_SERVE_RATE_LIMIT_WINDOW_MS`   | Umgebungsfallback für `--rate-limit-window-ms`.                                                                                                                                     |

### Über `BridgeOptions.childEnvOverrides` an das ACP-Kind weitergeleitet

`runQwenServe` baut diese pro Handle auf, sodass zwei Daemons in einem Prozess sich nicht um `process.env` streiten. Die Budget-Variablen sind keine Umgebungsfallbacks für das `qwen serve`-Elternprozess; der CLI-Pfad muss sie aus `--mcp-client-budget` / `--mcp-budget-mode` generieren.

| Env                              | Wirkung                                                                                                             |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `QWEN_SERVE_MCP_CLIENT_BUDGET`   | Positive ganze Zahl als String, verbraucht von `readBudgetFromEnv()` des ACP-Kindes.                                |
| `QWEN_SERVE_MCP_BUDGET_MODE`     | `off` / `warn` / `enforce`.                                                                                         |
| `QWEN_SERVE_MCP_POOL_TRANSPORTS` | Komma-getrennte Transport-Zulassungsliste; standardmäßig gepoolte Transporte sind `stdio,websocket`; `http,sse` können explizit enthalten sein. |
| `QWEN_SERVE_MCP_POOL_DRAIN_MS`   | Leerlauf-Entleerungsverzögerung für Pool-Einträge; Standard `30000`, begrenzt auf `1000..600000` ms.                |

### Von SDK / Adaptern gelesen

| Env                     | Wirkung                                                                     |
| ----------------------- | --------------------------------------------------------------------------- |
| `QWEN_DAEMON_URL`       | Daemon-Basis-URL für CLI-TUI-Adapter, Channels und IDE-Begleiter.           |
| `QWEN_DAEMON_TOKEN`     | Bearer-Token.                                                               |
| `QWEN_DAEMON_WORKSPACE` | Überschreibt das an `POST /session` gesendete `cwd`.                        |

## `settings.json`-Schlüssel

Der Daemon liest die Einstellungen einmal beim Start über `loadSettings(boundWorkspace)` innerhalb von `runQwenServe`. Fehlerhafte Einstellungen fallen über einen try/catch-Schutz auf Standardwerte zurück.

| Schlüssel                    | Typ                                                                 | Wirkung                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| ---------------------------- | -------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `policy.permissionStrategy`  | `'first-responder' \| 'designated' \| 'consensus' \| 'local-only'`   | Setzt `BridgeOptions.permissionPolicy`; der aktive Wert erscheint unter `/capabilities` als `policy.permission`. **Boot-Validierung** durch `validatePolicyConfig()` gegen `SERVE_CAPABILITY_REGISTRY.permission_mediation.modes`. Unbekannte Literale werfen `InvalidPolicyConfigError` und verhindern den Start explizit.                                                                                                                                              |
| `policy.consensusQuorum`     | positive ganze Zahl                                                  | N für die `consensus`-Richtlinie. **Standard** ist `floor(M/2) + 1` über `votersAtIssue.size` (M=2 bedeutet einstimmig; größeres gerades M bedeutet mehr als die Hälfte). Wenn unter einer Nicht-Consensus-Richtlinie gesetzt, wird es ignoriert und der Start gibt eine stderr-Warnung aus. Nicht-positive ganze Zahlen werfen `InvalidPolicyConfigError`. Siehe [`04-permission-mediation.md`](./04-permission-mediation.md).                                           |
| `context.fileName`           | string                                                              | Überschreibt `getCurrentGeminiMdFilename()` über `BridgeOptions.contextFilename`.                                                                                                                                                                                                                                                                                                                                                                                        |
| `tools.disabled`             | string[]                                                            | Tools, die für den nächsten ACP-Kind-Start deaktiviert sind. Normalisiert durch `normalizeDisabledToolList()` (`packages/cli/src/config/normalizeDisabledTools.ts`): Nicht-Array wird `[]`, Nicht-String-Einträge werden übersprungen, Leerraum wird getrimmt, leere Einträge werden entfernt, Duplikate werden entfernt unter Beibehaltung des ersten Vorkommens. Sowohl der Boot- als auch der `restartMcpServer`-Einstellungs-Refresh durchlaufen diese Funktion. `ToolRegistry.has(name)` ist exakt und Groß-/Kleinschreibung-sensitiv. `POST /workspace/tools/:name/enable` und `tool_toggled` aktualisieren diesen Schlüssel. |
| `tools.approvalMode`         | `'default' \| 'auto' \| ...`                                        | Standard-Zustimmungsmodus für Sitzungen; `POST /session/:id/approval-mode` schreibt hier, wenn `persist: true`.                                                                                                                                                                                                                                                                                                                                                         |
| `telemetry`                  | object                                                              | OTel-Konfiguration. Schlüssel umfassen `enabled`, `otlpEndpoint`, `otlpProtocol`, `otlpTracesEndpoint`, `otlpLogsEndpoint`, `otlpMetricsEndpoint`, `target`, `outfile`, `includeSensitiveSpanAttributes`, `sensitiveSpanAttributeMaxLength`, `resourceAttributes` und `metrics.includeSessionId`. `resolveTelemetrySettings()` liest es beim Start und initialisiert `initializeTelemetry()`.                                                                              |

## `ServeOptions` (programmatische Einbettung)

`packages/cli/src/serve/types.ts` definiert das typisierte Optionen-Objekt, das von `runQwenServe` und `createServeApp` akzeptiert wird. Es spiegelt die obigen CLI-Flags wider und fügt hinzu:

| Feld                            | Wirkung                                                                                                   |
| ------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `eventRingSize`                 | Überschreibt die Standard-Ringgröße pro Sitzung.                                                          |
| `maxPendingPromptsPerSession`   | Ausstehende Prompt-Begrenzung pro Sitzung; `0` / `Infinity` bedeutet unbegrenzt.                          |
| `mcpPoolActive`                 | Programmatischer Schalter, standardmäßig von `QWEN_SERVE_NO_MCP_POOL`.                                    |
| `allowOrigins`                  | Ursprungs-Zulassungsliste (`string[]`), entsprechend `--allow-origin`.                                    |
| `allowPrivateAuthBaseUrl`       | Erlaubt Installation von privater / localhost Auth-Provider-`baseUrl`.                                    |
| `enableSessionShell`            | Aktiviert Sitzungs-Shell-Ausführung; Bearer-Token und sitzungsgebundene Client-ID sind weiterhin erforderlich. |
| `promptDeadlineMs`              | Prompt-Wanduhrzeitbegrenzung.                                                                             |
| `writerIdleTimeoutMs`           | SSE-Writer-Leerlauf-Timeout.                                                                              |
| `channelIdleTimeoutMs`          | Wie lange das ACP-Kind nach dem Schließen der letzten Sitzung warm gehalten wird.                         |
| `sessionReapIntervalMs`         | Intervall des Sitzungs-Reaper-Durchlaufs.                                                                 |
| `sessionIdleTimeoutMs`          | Leerlauf-Entfernungszeit für getrennte Sitzungen.                                                         |
| `rateLimit*`                    | HTTP-Ratenbegrenzung pro Stufe: Schalter, Schwellenwerte und Fenster.                                     |
## `BridgeOptions` (programmatische Bridge-Einbettung)

`packages/acp-bridge/src/bridgeOptions.ts` definiert die Bridge-Optionen. Siehe [`03-acp-bridge.md`](./03-acp-bridge.md) für die vollständige Tabelle. Schlüsselfelder:

| Feld                                                                                                                   | Auswirkung                                                                                        |
| ----------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `boundWorkspace`                                                                                                        | Erforderlicher kanonischer Workspace.                                                             |
| `sessionScope`                                                                                                          | `'single'` (Standard) vs. `'thread'`.                                                             |
| `initializeTimeoutMs`, `maxSessions`, `eventRingSize`, `permissionResponseTimeoutMs`, `maxPendingPermissionsPerSession` | Begrenzte Ressourcenschwellen.                                                                    |
| `channelFactory`                                                                                                        | Plugable ACP-Child-Factory; Standard ist `defaultSpawnChannelFactory`.                             |
| `fileSystem`                                                                                                            | `BridgeFileSystem`-Adapter. Siehe [`07-workspace-filesystem.md`](./07-workspace-filesystem.md).   |
| `permissionPolicy`, `permissionConsensusQuorum`, `permissionAudit`                                                      | Mediator-Verdrahtung.                                                                             |
| `statusProvider`                                                                                                        | Daemon-Host-Preflight-Zellen.                                                                     |
| `childEnvOverrides`                                                                                                     | Umgebungshinzufügungen oder -entfernungen pro Handle.                                             |
| `contextFilename`                                                                                                       | Überschreibt `getCurrentGeminiMdFilename()`.                                                      |
| `channelIdleTimeoutMs`                                                                                                  | Wie lange der ACP-Child nach Schließung der letzten Sitzung am Leben bleibt, in ms; Standardwert `0`. |

## Wichtige Standardwerte

| Konstante                          | Datei                    | Wert             | Bedeutung                                                           |
| --------------------------------- | ----------------------- | ----------------- | ------------------------------------------------------------------- |
| `DEFAULT_MAX_SESSIONS`            | `bridge.ts`             | `20`              | Sitzungsgrenze vor `SessionLimitExceededError`.                     |
| `MAX_EVENT_RING_SIZE`             | `bridge.ts`             | `1_000_000`       | Weiche Grenze für `BridgeOptions.eventRingSize`; schützt vor Tippfehlern. |
| `DEFAULT_RING_SIZE`               | `eventBus.ts`           | `8000`            | SSE-Wiedergaberingtiefe pro Sitzung.                                |
| `DEFAULT_MAX_QUEUED`              | `eventBus.ts`           | `256`             | Warteschlangenbegrenzung pro Abonnent.                              |
| `DEFAULT_MAX_SUBSCRIBERS`         | `eventBus.ts`           | `64`              | Abonnentengrenze pro Bus.                                           |
| `WARN_THRESHOLD_RATIO`            | `eventBus.ts`           | `0.75`            | `slow_client_warning`-Auslöser.                                     |
| `WARN_RESET_RATIO`                | `eventBus.ts`           | `0.375`           | Hysterese-Wiederherstellungsschwelle.                               |
| `DEFAULT_INIT_TIMEOUT_MS`         | `bridge.ts`             | `10_000`          | ACP-`initialize`-Handshake-Timeout.                                 |
| `MCP_RESTART_TIMEOUT_MS`          | `bridge.ts`             | `300_000`         | Bridge-Timeout für `/workspace/mcp/:server/restart`.                |
| `DEFAULT_PERMISSION_TIMEOUT_MS`   | `bridge.ts`             | `5 * 60_000`      | Wanduhrzeit pro Berechtigungsanfrage.                               |
| `DEFAULT_MAX_PENDING_PER_SESSION` | `bridge.ts`             | `64`              | Abgestimmt auf `DEFAULT_MAX_SUBSCRIBERS`.                           |
| `MAX_RESOLVED_PERMISSION_RECORDS` | `permissionMediator.ts` | `512`             | FIFO für kürzlich aufgelöste Berechtigungen.                        |
| `KILL_HARD_DEADLINE_MS`           | `spawnChannel.ts`       | `10_000`          | Graceful-Shutdown-Fenster pro Kanal.                                |
| `SHUTDOWN_FORCE_CLOSE_MS`         | `run-qwen-serve.ts`       | `5_000`           | HTTP-Server-Force-Close-Timer.                                      |
| `MAX_READ_BYTES`                  | `fs/policy.ts`          | `256 * 1024`      | Lesebegrenzung.                                                     |
| `MAX_WRITE_BYTES`                 | `fs/policy.ts`          | `5 * 1024 * 1024` | Schreibbegrenzung.                                                  |
| `MAX_DISPLAY_NAME_LENGTH`         | `bridge.ts`             | `256`             | Begrenzung des Sitzungs-`displayName`.                              |

## Querverweise

- Authentifizierungseinstellungen: [`12-auth-security.md`](./12-auth-security.md)
- Fähigkeiten und Protokollversion: [`11-capabilities-versioning.md`](./11-capabilities-versioning.md)
- Event-Ring und Backpressure-Tuning: [`10-event-bus.md`](./10-event-bus.md)
- MCP-Pool / Budget: [`05-mcp-transport-pool.md`](./05-mcp-transport-pool.md) und [`06-mcp-budget-guardrails.md`](./06-mcp-budget-guardrails.md)
- Berechtigungsrichtlinie: [`04-permission-mediation.md`](./04-permission-mediation.md)
- Benutzerhandbuch: [`../../users/qwen-serve.md`](../../users/qwen-serve.md)