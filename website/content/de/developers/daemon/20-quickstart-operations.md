# Quickstart & Betrieb

Diese Seite konzentriert sich darauf, **wie `qwen serve` gestartet wird, wie die Funktionsfähigkeit überprüft werden kann und wie die interne Aufrufkette von `qwen serve` zum Listening-Server aussieht**. Details zu Architektur, Komponenten und dem Wire-Protokoll finden sich in den anderen Deep-Dive-Seiten zum Daemon.

## 1. Kürzester Weg

```bash
qwen serve
```

Output:

```text
qwen serve listening on http://127.0.0.1:4170 (mode=http-bridge, workspace=/your/cwd)
qwen serve: bound to workspace "/your/cwd"
qwen serve: bearer auth disabled (loopback default). Set QWEN_SERVER_TOKEN to enable.
```

Öffne `http://127.0.0.1:4170/demo` in einem Browser, um die Debug-Konsole zu sehen: Chat-UI, Event-Stream und Workspace-Inspektion. Im Standard-Loopback-Dev-Modus mountet `createServeApp()` die Route `/demo` aus `packages/cli/src/serve/routes/health-demo.ts` **vor** `bearerAuth`, sodass kein Token erforderlich ist.

## 2. Start-Rezepte

```bash
# 1. Local-Dev-Standard (Loopback, kein Token)
qwen serve

# 2. Expliziter Workspace + ephemeraler Port
qwen serve --workspace /path/to/repo --port 0

# 3. Abgesicherte Loopback-Entwicklung (Bearer auch auf Loopback erzwingen)
QWEN_SERVER_TOKEN=$(openssl rand -hex 32) qwen serve --require-auth

# 4. Für LAN freigeben (Non-Loopback erfordert ein Token)
QWEN_SERVER_TOKEN=$(openssl rand -hex 32) \
  qwen serve --hostname 0.0.0.0 --port 4170

# 5. Optimierung für viele Sessions und einen größeren Replay-Ring
qwen serve --max-sessions 0 --event-ring-size 32000

# 6. Multi-Client-Kollaboration + striktes MCP-Budget
QWEN_SERVER_TOKEN=secret \
  qwen serve --require-auth \
             --mcp-client-budget 10 \
             --mcp-budget-mode enforce

# 7. Start mit einer in settings.json konfigurierten Consensus-Policy
# settings.json: { "policy": { "permissionStrategy": "consensus", "consensusQuorum": 2 } }
qwen serve

# 8. Debug-Logging
QWEN_SERVE_DEBUG=1 qwen serve

# 9. F2-Pool deaktivieren (Fallback auf session-spezifische MCP-Clients)
QWEN_SERVE_NO_MCP_POOL=1 qwen serve

# 10. Cross-Origin-Zugriff für Browser-Web-UI erlauben
QWEN_SERVER_TOKEN=secret \
  qwen serve --allow-origin 'http://localhost:3000'

# 11. Prompt-Deadline + SSE-Idle-Timeout
qwen serve --prompt-deadline-ms 300000 --writer-idle-timeout-ms 600000

# 12. ACP-Child nach Schließen der letzten Session warmhalten
qwen serve --channel-idle-timeout-ms 60000

# 13. HTTP-Rate-Limiting aktivieren
QWEN_SERVE_RATE_LIMIT=1 qwen serve
```

Beim abgesicherten Loopback-Rezept (3) wird `/demo` nach `bearerAuth` registriert. Eine normale Browser-Navigation benötigt einen Auth-Header, verwende stattdessen curl oder ein SDK-Skript.

## 3. Alle Start-Flags

Die CLI ist in **`packages/cli/src/commands/serve.ts`** definiert:

| Flag                                    | Typ                            | Standard                                     | Erforderlich wenn                        | Effekt                                                                                                                                                                                                                |
| --------------------------------------- | ------------------------------ | -------------------------------------------- | ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--port <n>`                            | number                         | `4170`                                       | -                                        | TCP-Port; `0` bedeutet ein vom OS zugewiesener ephemeraler Port.                                                                                                                                                      |
| `--hostname <host>`                     | string                         | `127.0.0.1`                                  | Non-Loopback erfordert Token             | Bind-Adresse. Loopback-Werte: `127.0.0.1`, `localhost`, `::1`, `[::1]`. `[::1]`-Klammern werden automatisch entfernt; `host:port`-Eingaben werden mit einem Hinweis auf `--port` abgelehnt.                           |
| `--token <s>`                           | string                         | env / none                                   | Non-Loopback und `--require-auth`        | Bearer-Token; wird einmal getrimmt. **Es erscheint in `/proc/<pid>/cmdline`, bevorzuge daher `QWEN_SERVER_TOKEN`**. Boot-Stderr warnt ebenfalls davor.                                                                |
| `--max-sessions <n>`                    | number                         | `20`                                         | -                                        | Obergrenze für aktive Sessions. Überschüssige Spawns geben 503 zurück. `0` bedeutet unbegrenzt. `NaN` / negative Werte werfen einen Fehler.                                                                         |
| `--max-pending-prompts-per-session <n>` | number                         | `5`                                          | -                                        | Obergrenze für akzeptierte, aber ausstehende/laufende Prompts pro Session. Überschüssige Prompts geben 503 zurück. `0` / `Infinity` bedeutet unbegrenzt. Negative oder nicht-ganzzahlige Werte werfen einen Fehler.   |
| `--workspace <dir>`                     | string                         | `process.cwd()`                              | -                                        | Gebundener Workspace. **Muss ein absoluter Pfad sein, muss existieren und muss ein Verzeichnis sein**. Boot kanonisiert ihn einmalig über `canonicalizeWorkspace`. `POST /session` mit einem nicht übereinstimmenden `cwd` gibt `400 workspace_mismatch` zurück. |
| `--max-connections <n>`                 | number                         | `256`                                        | -                                        | `server.maxConnections` auf Listener-Ebene. `0` / `Infinity` bedeutet unbegrenzt. `NaN` / negative Werte schlagen beim Boot fehl, um Fail-Open-Verhalten zu vermeiden.                                                |
| `--require-auth`                        | boolean                        | `false`                                      | Token erforderlich                       | Erweitert die Bearer-Auth auf Loopback **und** `/health`. Boot verweigert den Start ohne Token.                                                                                                                       |
| `--enable-session-shell`                | boolean                        | `false`                                      | Token erforderlich                       | Aktiviert die direkte `POST /session/:id/shell`-Ausführung. Caller müssen zusätzlich eine session-gebundene `X-Qwen-Client-Id` senden.                                                                                |
| `--event-ring-size <n>`                 | number                         | `8000`                                       | -                                        | Tiefe des SSE-Replay-Rings pro Session. Soft-Cap ist `MAX_EVENT_RING_SIZE = 1_000_000`; Werte außerhalb des Bereichs werfen während der Bridge-Konstruktion einen Fehler.                                             |
| `--http-bridge`                         | boolean                        | `true`                                       | -                                        | Stage-1-Bridge-Modus: ein `qwen --acp`-Child, das vom Daemon gemultiplext wird. Stage-2-In-Process-Modus ist noch nicht implementiert; `--no-http-bridge` fällt zurück und gibt eine Meldung auf Stderr aus.          |
| `--mcp-client-budget <n>`               | number                         | none                                         | Erforderlich für `mcp-budget-mode=enforce` | Obergrenze für Workspace-MCP-Clients. Muss eine positive Ganzzahl sein.                                                                                                                                               |
| `--mcp-budget-mode <m>`                 | `'enforce' \| 'warn' \| 'off'` | `warn` wenn ein Budget gesetzt ist, sonst `off` | `enforce` erfordert `--mcp-client-budget` | `enforce` lehnt ab, `warn` warnt nur bei 75%, `off` dient nur der Beobachtung.                                                                                                                                        |
| `--allow-origin <pattern>`              | repeatable string              | none                                         | -                                        | CORS-Allowlist, die die Standard-Origin-Verweigerung ersetzt. `*` erfordert ein Token.                                                                                                                                |
| `--allow-private-auth-base-url`         | boolean                        | `false`                                      | -                                        | Erlaubt die Installation von `baseUrl` für localhost / Private-Network-Auth-Provider. Nur für vertrauenswürdige lokale Entwicklung verwenden.                                                                         |
| `--prompt-deadline-ms <n>`              | number                         | none                                         | -                                        | Serverseitiges Prompt-Wallclock-Limit in ms; Timeout bricht den Prompt ab.                                                                                                                                            |
| `--writer-idle-timeout-ms <n>`          | number                         | none                                         | -                                        | Idle-Timeout pro SSE-Verbindung in ms.                                                                                                                                                                                |
| `--channel-idle-timeout-ms <n>`         | number                         | `0`                                          | -                                        | Hält das ACP-Child am Leben, nachdem die letzte Session geschlossen wird. `0` bedeutet sofortige Freigabe.                                                                                                            |
| `--session-reap-interval-ms <n>`        | number                         | `60000`                                      | -                                        | Scan-Intervall des Session-Reapers. `0` deaktiviert ihn.                                                                                                                                                              |
| `--session-idle-timeout-ms <n>`         | number                         | `1800000`                                    | -                                        | Idle-Timeout für getrennte Sessions. `0` deaktiviert es.                                                                                                                                                              |
| `--rate-limit` / `--no-rate-limit`      | boolean                        | env / off                                    | -                                        | Aktiviert oder deaktiviert das HTTP-Rate-Limiting pro Stufe.                                                                                                                                                          |
| `--rate-limit-prompt <n>`               | number                         | `10`                                         | `--rate-limit`                           | Prompt-Requests pro Zeitfenster.                                                                                                                                                                                      |
| `--rate-limit-mutation <n>`             | number                         | `30`                                         | `--rate-limit`                           | Mutations-Requests pro Zeitfenster.                                                                                                                                                                                   |
| `--rate-limit-read <n>`                 | number                         | `120`                                        | `--rate-limit`                           | Read-Requests pro Zeitfenster.                                                                                                                                                                                        |
| `--rate-limit-window-ms <n>`            | number                         | `60000`                                      | `--rate-limit`                           | Länge des Rate-Limit-Zeitfensters; muss `>= 1000` sein.                                                                                                                                                               |

## 4. Umgebungsvariablen

| Env                                 | Äquivalentes Flag / Effekt                                                                                                                                                |
| ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `QWEN_SERVER_TOKEN`                 | Äquivalent zu `--token`; `--token` hat Vorrang. Wird beim Boot einmal getrimmt, um einen abschließenden Zeilenumbruch von `cat token.txt` zu vermeiden.                   |
| `QWEN_SERVE_DEBUG`                  | `1` / `true` / `on` / `yes` (Groß-/Kleinschreibung ignorieren) aktiviert ausführliche Stderr-Logs.                                                                        |
| `QWEN_SERVE_NO_MCP_POOL`            | `1` deaktiviert den Workspace-MCP-Pool vollständig und fällt auf den session-spezifischen `McpClientManager` zurück. Capabilities bewerben nicht mehr `mcp_workspace_pool` / `mcp_pool_restart`. |
| `QWEN_SERVE_MCP_CLIENT_BUDGET`      | Interner Budget-Input des ACP-Childs. Die CLI generiert ihn aus `--mcp-client-budget` über `childEnvOverrides`; er ist kein Env-Fallback des Elternprozesses.              |
| `QWEN_SERVE_MCP_BUDGET_MODE`        | Interner Budget-Modus des ACP-Childs. Die CLI generiert ihn aus `--mcp-budget-mode` über `childEnvOverrides`; er ist kein Env-Fallback des Elternprozesses.                |
| `QWEN_SERVE_PROMPT_DEADLINE_MS`     | Env-Fallback für `--prompt-deadline-ms`.                                                                                                                                  |
| `QWEN_SERVE_WRITER_IDLE_TIMEOUT_MS` | Env-Fallback für `--writer-idle-timeout-ms`.                                                                                                                              |
| `QWEN_SERVE_MCP_POOL_TRANSPORTS`    | Wird vom ACP-Child gelesen. Kommagetrennte Allowlist für gepoolte Transports; Standard ist `stdio,websocket`.                                                             |
| `QWEN_SERVE_MCP_POOL_DRAIN_MS`      | Wird vom ACP-Child gelesen. Idle-Drain-Verzögerung für Pool-Einträge; Standard ist `30000`, begrenzt auf `1000..600000` ms.                                               |
| `QWEN_SERVE_RATE_LIMIT`             | `1` / `true` aktiviert das Rate-Limiting; CLI-Flag hat Vorrang.                                                                                                           |
| `QWEN_SERVE_RATE_LIMIT_PROMPT`      | Env-Fallback für `--rate-limit-prompt`.                                                                                                                                   |
| `QWEN_SERVE_RATE_LIMIT_MUTATION`    | Env-Fallback für `--rate-limit-mutation`.                                                                                                                                 |
| `QWEN_SERVE_RATE_LIMIT_READ`        | Env-Fallback für `--rate-limit-read`.                                                                                                                                     |
| `QWEN_SERVE_RATE_LIMIT_WINDOW_MS`   | Env-Fallback für `--rate-limit-window-ms`.                                                                                                                                |

Pro-Handle-Env-Overrides sind beabsichtigt: zwei Daemons, die im selben Prozess laufen, konkurrieren nicht um `process.env`. `defaultSpawnChannelFactory` erstellt beim Spawnen einen Snapshot der Env.

## 5. `settings.json` wird ebenfalls gelesen

Boot ruft einmalig `loadSettings(boundWorkspace)` auf:

| Key                         | Typ                                                                | Verhalten                                                                                                                                                                |
| --------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `policy.permissionStrategy` | `'first-responder' \| 'designated' \| 'consensus' \| 'local-only'` | Setzt `BridgeOptions.permissionPolicy`. **Boot validiert mit `validatePolicyConfig`**; unbekannte Werte werfen `InvalidPolicyConfigError`, anstatt stillschweigend zurückzufallen. |
| `policy.consensusQuorum`    | positive integer                                                   | N für die `consensus`-Policy. Standard ist `floor(M/2)+1`. Wenn es unter einer Non-Consensus-Policy gesetzt wird, wird es ignoriert und Boot gibt eine Stderr-Warnung aus. |
| `context.fileName`          | string                                                             | Überschreibt `getCurrentGeminiMdFilename()` und steuert, welche Datei `POST /workspace/init` schreibt.                                                                   |
| `tools.disabled`            | string[]                                                           | Wird durch `normalizeDisabledToolList()` normalisiert (trimmen, leere Einträge entfernen, Deduplizierung), bevor es den nächsten ACP-Child-Spawn beeinflusst.            |
| `tools.approvalMode`        | string                                                             | Standard-Session-Approval-Modus.                                                                                                                                         |
| `telemetry`                 | object                                                             | OTel-Konfiguration: `enabled`, `otlpEndpoint`, `otlpProtocol`, Endpunkte pro Signal und mehr. Siehe [`17-configuration.md`](./17-configuration.md).                      |

Fehler bei den Settings-I/O, wie z. B. fehlerhaftes JSON, fallen auf die Standardwerte zurück. `InvalidPolicyConfigError` ist die Ausnahme: Eine falsche Policy-Konfiguration lässt den Boot explizit fehlschlagen.

## 6. Boot-Verweigerungsszenarien (explizite Fehler)

`run-qwen-serve.ts` wirft in diesen Fällen absichtlich einen Fehler, anstatt zurückzufallen:

| Szenario                                                                      | Fehler-Präfix                                                                                         |
| ----------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Non-Loopback-Bind ohne Token                                                  | `Refusing to bind ... without a bearer token`                                                       |
| `--require-auth` ohne Token                                                   | `Refusing to start with --require-auth set but no bearer token`                                     |
| `--workspace` existiert nicht, ist kein Verzeichnis oder ist nicht absolut    | `Invalid --workspace ...`                                                                           |
| `--workspace` stat permission denied                                          | `Invalid --workspace ...: permission denied`                                                        |
| `--mcp-client-budget` ist keine positive Ganzzahl                             | `Must be a positive integer`                                                                        |
| `--mcp-budget-mode=enforce` ohne Budget                                       | `requires a positive mcpClientBudget`                                                               |
| `--hostname` ist als `localhost:4170` geschrieben                             | `looks like a "host:port" combination. Use --port`                                                  |
| `--hostname [::1]:8080`                                                       | `Invalid --hostname ... brackets indicate an IPv6 literal but the value is not a clean [addr] form` |
| `--max-connections` ist `NaN` oder negativ                                    | `Must be >= 0`                                                                                      |
| `--event-ring-size > 1_000_000`                                               | Wird während der Bridge-Konstruktion geworfen                                                       |
| `--allow-origin '*'` ohne Token                                               | `Refusing to start with --allow-origin '*' but no bearer token configured`                          |
| `--prompt-deadline-ms` / `--writer-idle-timeout-ms` ist keine positive Ganzzahl | `Must be a positive integer`                                                                        |
| Unbekannte `policy.permissionStrategy` oder nicht-positive `policy.consensusQuorum` | `InvalidPolicyConfigError`                                                                          |
## 7. Curl-Verifizierungscheckliste

```bash
# 1. Liveness
curl http://127.0.0.1:4170/health
# -> {"status":"ok"}

# 1.1 Deep health
curl -s 'http://127.0.0.1:4170/health?deep=1' | jq

# 2. Capabilities
curl -s http://127.0.0.1:4170/capabilities | jq

# 3. Preflight-Bereitschaft
curl -s http://127.0.0.1:4170/workspace/preflight | jq

# 4. Env-Snapshot (Secrets melden nur ihre Präsenz)
curl -s http://127.0.0.1:4170/workspace/env | jq

# 5. MCP-Pool / Budget-Snapshot
curl -s http://127.0.0.1:4170/workspace/mcp | jq

# 6. Session erstellen
curl -s -X POST http://127.0.0.1:4170/session \
  -H 'Content-Type: application/json' \
  -H 'X-Qwen-Client-Id: curl-debug' \
  -d '{}' | jq

# 7. SSE tailen (<sid> ersetzen)
curl -N \
  -H 'Accept: text/event-stream' \
  -H 'X-Qwen-Client-Id: curl-debug' \
  -H 'Last-Event-ID: 0' \
  'http://127.0.0.1:4170/session/<sid>/events'

# 8. Demo-Seite
open http://127.0.0.1:4170/demo
```

Wenn die Bearer-Authentifizierung aktiviert ist, füge `-H "Authorization: Bearer $QWEN_SERVER_TOKEN"` zu jeder Anfrage hinzu.

## 8. Kann die Demo-Seite verwendet werden?

**Ja.** Sie wird durch `getDemoHtml(port)` in `packages/cli/src/serve/demo.ts` als in sich geschlossenes HTML ohne externe Abhängigkeiten implementiert.

| Startmodus                          | Wo `/demo` registriert wird                                                    | Direkte Browser-Navigation                             |
| ----------------------------------- | ------------------------------------------------------------------------------ | ------------------------------------------------------ |
| Loopback ohne `--require-auth`      | `routes/health-demo.ts`, von `createServeApp()` **vor** `bearerAuth` gemountet  | Funktioniert ohne Token                                |
| Loopback mit `--require-auth`       | `routes/health-demo.ts`, von `createServeApp()` **nach** `bearerAuth` gemountet | Schwierig über einen normalen Browser zu nutzen; curl oder SDK verwenden |
| Non-Loopback-Bind                   | `routes/health-demo.ts`, von `createServeApp()` **nach** `bearerAuth` gemountet | Wie oben                                               |

Die CSP lautet `default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; frame-ancestors 'none'`, ergänzt durch `X-Frame-Options: DENY`. Die Seite kann nur `'self'` (den Daemon) abrufen und keine externen Skripte oder Styles laden.

## 9. Aufrufkette von qwen serve bis zum Server, der auf Anfragen wartet

```text
qwen serve
   |
   v (process)
packages/cli/index.ts              main()
   |
   v
gemini.tsx                         main() - parseArguments()
   |
   v (yargs assembly)
config/config.ts                   import { serveCommand } ...
config/config.ts                   .command(serveCommand)
config/config.ts                   await yargsInstance.parse()
   |
   v (handler)
commands/serve.ts                  handler(argv) - boot pre-checks
commands/serve.ts                  const { runQwenServe } = await import('../serve/index.js')   # Lazy Load
commands/serve.ts                  await runQwenServe({...})
   |
   v
serve/run-qwen-serve.ts              runQwenServe(opts, deps)
   |  |- trim token
   |  |- hostname mismatch fallback
   |  |- auth preflight
   |  |- workspace validation + canonicalization
   |  |- MCP budget validation + childEnvOverrides
   |  |- loadSettings + validatePolicyConfig
   |  |- PermissionAuditRing + publisher
   |  |- resolveBridgeFsFactory
   |  `- createHttpAcpBridge({...})
   |
   v
serve/run-qwen-serve.ts              const app = createServeApp(opts, () => actualPort, {...})
   |
   v
serve/server.ts                    createServeApp() - builds Express app (**does not listen**)
   |  |- middleware chain (Host allowlist / CORS / bearerAuth / mutation gate / rate limit)
   |  |- route mounting (health / demo / capabilities / workspace / session / SSE / ACP HTTP)
   |  `- return app
   |
   v
serve/run-qwen-serve.ts              server = app.listen(port, hostname, cb)
   |  |- server.maxConnections = cap
   |  |- actualPort = server.address().port
   |  |- write "qwen serve listening on ..."
   |  |- register SIGINT / SIGTERM (onSignal)
   |  `- resolve(handle: RunHandle)
   |
   v
commands/serve.ts                  await blockForever()    # blockiert endlos bis zum Signal
```

Wichtige Fakten:

- **`createServeApp` baut nur auf; es lauscht nicht.** Es gibt eine `express()`-Instanz mit gemounteter Middleware und Routen zurück. Der Aufrufer ist für `app.listen()` zuständig. `server.test.ts` verwendet die Factory in rund 25 Testfällen auf diese Weise, weshalb die Factory absichtlich keine Lifecycle-Verantwortung übernimmt.
- **`() => actualPort` ist eine Lazy Closure.** `actualPort` wird im `app.listen`-Callback zugewiesen. Die `hostAllowlist`-Middleware liest ihn bei Bedarf aus, sodass ephemere Ports (`--port 0`) den `Host`-Header weiterhin korrekt prüfen.
- **`await blockForever()` ist beabsichtigt.** Wenn `yargs.parse()` auflöst, fällt die CLI-Top-Level-Ebene in den interaktiven TUI-Entrypoint (`gemini.tsx`) durch. SIGINT / SIGTERM werden über den `onSignal`-Pfad von `runQwenServe` beendet.

## 10. Aufteilung der HTTP-Routendateien

Die Hauptzusammenstellung erfolgt in `createServeApp()` in `server.ts`, wo die Middleware verdrahtet und fokussierte Routenmodule gemountet werden:

| Routen                                                                                         | Datei                                                   | Mount-Eintrag                                                                  |
| ---------------------------------------------------------------------------------------------- | ------------------------------------------------------- | ------------------------------------------------------------------------------ |
| `/health`, `/demo`                                                                             | `packages/cli/src/serve/routes/health-demo.ts`          | `healthDemoRoutes.register()`                                                  |
| `/daemon/status`                                                                               | `packages/cli/src/serve/routes/daemon-status.ts`        | `registerDaemonStatusRoutes()`                                                 |
| `/capabilities`, Workspace-Init/Tool/MCP-Mutationsrouten, ACP-HTTP-Bridge                      | `packages/cli/src/serve/server.ts`                      | Direkt innerhalb von `createServeApp()` registriert                            |
| Workspace-Status, Env, Preflight, MCP/Tool/Provider/Skill-Zusammenfassungen                    | `packages/cli/src/serve/routes/workspace-status.ts`     | `registerWorkspaceStatusRoutes()`, `registerWorkspaceDiagnosticStatusRoutes()` |
| Workspace-Erweiterungen und Erweiterungsoperationen                                            | `packages/cli/src/serve/routes/workspace-extensions.ts` | `registerWorkspaceExtensionRoutes()`                                           |
| `/workspace/memory` (GET/POST)                                                                 | `packages/cli/src/serve/workspace-memory.ts`            | `mountWorkspaceMemoryRoutes()`                                                 |
| Alle `/workspace/agents` CRUD-Routen                                                           | `packages/cli/src/serve/workspace-agents.ts`            | `mountWorkspaceAgentsRoutes()`                                                 |
| `GET /file`, `/file/bytes`, `/list`, `/glob`, `/stat`                                          | `packages/cli/src/serve/routes/workspace-file-read.ts`  | `registerWorkspaceFileReadRoutes()`                                            |
| `POST /file/write`, `/file/edit`                                                               | `packages/cli/src/serve/routes/workspace-file-write.ts` | `registerWorkspaceFileWriteRoutes()`                                           |
| Workspace-Setup, Trust, Einstellungen, Berechtigungen und Voice-Routen                         | `packages/cli/src/serve/routes/workspace-*.ts`          | `registerWorkspaceSetupGithubRoutes()`, `registerWorkspaceTrustRoutes()`, etc. |
| Workspace-Auth-Provider und Device-Flow-Routen                                                 | `packages/cli/src/serve/routes/workspace-auth.ts`       | `registerWorkspaceAuthRoutes()`                                                |
| Session-Lifecycle, Prompt, Metadaten, Sprache, Shell, Recap, Rewind, Branch und Listen-Routen  | `packages/cli/src/serve/routes/session.ts`              | `registerSessionRoutes()`                                                      |
| `GET /session/:id/events` SSE-Stream                                                           | `packages/cli/src/serve/routes/sse-events.ts`           | `registerSseEventsRoutes()`                                                    |
| Permission-Response-Routen                                                                     | `packages/cli/src/serve/routes/permission.ts`           | `registerPermissionRoutes()`                                                   |

Die vollständige Referenz für Routen und Wire-Protokolle findest du unter [`../qwen-serve-protocol.md`](../qwen-serve-protocol.md). Informationen zur Architektur findest du unter [`01-architecture.md`](./01-architecture.md).

## 11. Graceful vs. Hard Shutdown

- **Erstes SIGINT / SIGTERM** -> `runQwenServe` `onSignal` -> zweiphasiger Graceful Shutdown:
  1. `bridge.shutdown()`: Jeder Channel erhält `KILL_HARD_DEADLINE_MS` (10s), dann `channel.kill()`.
  2. `server.close()`: In-flight Requests werden abgearbeitet, `SHUTDOWN_FORCE_CLOSE_MS` (5s) löst `closeAllConnections()` aus, dann greift eine zweite 2s-Frist.
- **Zweites SIGINT / SIGTERM während des bereits laufenden Exits** -> `bridge.killAllSync()` beendet alle ACP-Children synchron per SIGKILL und ruft `process.exit(1)` auf, um orphan processes zu vermeiden.

Das von `runQwenServe` zurückgegebene `RunHandle.close()` ist das programmatische Äquivalent für Embedder und Tests.

## 12. Eingebetteter Aufruf (CLI umgehen)

```ts
import { runQwenServe } from '@qwen-code/qwen-code/serve';

const handle = await runQwenServe({
  port: 0, // ephemeral
  hostname: '127.0.0.1',
  mode: 'http-bridge',
  maxSessions: 20,
  workspace: '/abs/path/to/repo',
});
console.log(`Daemon at ${handle.url}`);
// ... handle.bridge direkt aufrufen oder auf handle.server zugreifen
await handle.close(); // programmatischer Shutdown
```

Oder hole die Express-App direkt und lausche selbst:

```ts
import { createServeApp } from '@qwen-code/qwen-code/serve';

const app = createServeApp(
  {
    port: 0,
    hostname: '127.0.0.1',
    mode: 'http-bridge',
    maxSessions: 20,
  },
  () => 0,
  {
    /* deps: bridge, fsFactory, ... */
  },
);

const server = app.listen(0, '127.0.0.1', () => {
  console.log('listening on', server.address());
});
```

Hinweis: Beim direkten Aufruf von `createServeApp` ist der Standardwert `fsFactory.trusted = false`. Der agentenseitige ACP `writeTextFile` wird als `untrusted_workspace` abgelehnt und eine Stderr-Warnung wird einmalig ausgegeben. Injiziere entweder `deps.fsFactory` mit explizitem Trust, injiziere `deps.bridge` oder akzeptiere das standardmäßige, durch Trust gesteuerte Verhalten.

## 13. Debugging-Rezepte

Siehe den Debugging-Abschnitt in [`19-observability.md`](./19-observability.md). Die gängigsten Befehle sind:

```bash
# Ist der Daemon erreichbar?
curl http://127.0.0.1:4170/health

# Welche Capabilities werden angeboten?
curl -s http://127.0.0.1:4170/capabilities | jq

# Daemon-Host-Bereitschaft
curl -s http://127.0.0.1:4170/workspace/preflight | jq

# Live-SSE tailen
curl -N -H 'Accept: text/event-stream' \
     -H 'Last-Event-ID: 0' \
     'http://127.0.0.1:4170/session/<sid>/events'

# Ausführliche Logs
QWEN_SERVE_DEBUG=1 qwen serve
```

## Referenzen

- CLI-Entrypoint: `packages/cli/src/commands/serve.ts`
- Bootstrap: `packages/cli/src/serve/run-qwen-serve.ts`
- Express-Factory: `packages/cli/src/serve/server.ts`
- Middleware: `packages/cli/src/serve/auth.ts`
- Bridge-Factory: `packages/acp-bridge/src/bridge.ts`
- Demo-Seiten-HTML: `packages/cli/src/serve/demo.ts`
- User-Docs: [`../../users/qwen-serve.md`](../../users/qwen-serve.md)
- Wire-Protokoll: [`../qwen-serve-protocol.md`](../qwen-serve-protocol.md)