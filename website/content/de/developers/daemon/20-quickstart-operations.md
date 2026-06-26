# Schnellstart & Betrieb

Diese Seite konzentriert sich auf **das Starten von `qwen serve`, die Überprüfung der Funktionsweise und die interne Aufrufkette von `qwen serve` bis zum lauschenden Server**. Architektur, Komponenten und Details zum Wire-Protocol befinden sich auf den anderen detaillierten Daemon-Seiten.

## 1. Kürzester Weg

```bash
qwen serve
```

Ausgabe:

```text
qwen serve listening on http://127.0.0.1:4170 (mode=http-bridge, workspace=/your/cwd)
qwen serve: bound to workspace "/your/cwd"
qwen serve: bearer auth disabled (loopback default). Set QWEN_SERVER_TOKEN to enable.
```

Öffne `http://127.0.0.1:4170/demo` im Browser, um die Debug-Konsole zu sehen: Chat-UI, Ereignis-Stream und Workspace-Inspektion. Im Standard-Loopback-Entwicklungsmodus wird `/demo` **vor** `bearerAuth` im Loopback-Route-Zweig von `packages/cli/src/serve/server.ts` registriert, daher wird kein Token benötigt.

## 2. Start-Rezepte

```bash
# 1. Lokale Entwicklung (Loopback, kein Token)
qwen serve

# 2. Expliziter Workspace + temporärer Port
qwen serve --workspace /path/to/repo --port 0

# 3. Abgesicherter Loopback-Betrieb (Bearer auch auf Loopback erzwingen)
QWEN_SERVER_TOKEN=$(openssl rand -hex 32) qwen serve --require-auth

# 4. Für LAN freigeben (Nicht-Loopback erfordert Token)
QWEN_SERVER_TOKEN=$(openssl rand -hex 32) \
  qwen serve --hostname 0.0.0.0 --port 4170

# 5. Optimiert für viele Sessions und einen größeren Replay-Ring
qwen serve --max-sessions 0 --event-ring-size 32000

# 6. Multi-Client-Zusammenarbeit + strenges MCP-Budget
QWEN_SERVER_TOKEN=secret \
  qwen serve --require-auth \
             --mcp-client-budget 10 \
             --mcp-budget-mode enforce

# 7. Start mit einer in settings.json konfigurierten Konsensrichtlinie
# settings.json: { "policy": { "permissionStrategy": "consensus", "consensusQuorum": 2 } }
qwen serve

# 8. Debug-Logging
QWEN_SERVE_DEBUG=1 qwen serve

# 9. F2-Pool deaktivieren (Rückfall auf session-bezogene MCP-Clients)
QWEN_SERVE_NO_MCP_POOL=1 qwen serve

# 10. Cross-Origin-Zugriff auf das Browser-Web-UI erlauben
QWEN_SERVER_TOKEN=secret \
  qwen serve --allow-origin 'http://localhost:3000'

# 11. Prompt-Deadline + SSE-Idle-Timeout
qwen serve --prompt-deadline-ms 300000 --writer-idle-timeout-ms 600000

# 12. ACP-Kind nach Schließen der letzten Session warm halten
qwen serve --channel-idle-timeout-ms 60000

# 13. HTTP-Rate-Limiting aktivieren
QWEN_SERVE_RATE_LIMIT=1 qwen serve
```

Mit dem abgesicherten Loopback-Rezept (3) wird `/demo` nach `bearerAuth` registriert. Eine normale Browsernavigation benötigt einen Auth-Header – verwende stattdessen curl oder ein SDK-Skript.

## 3. Vollständige Start-Flags

Die CLI ist definiert in **`packages/cli/src/commands/serve.ts`**:

| Flag                                    | Typ                            | Standard                                     | Erforderlich bei                       | Effekt                                                                                                                                                                                                                |
| --------------------------------------- | ------------------------------ | -------------------------------------------- | ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--port <n>`                            | Zahl                           | `4170`                                       | -                                        | TCP-Port; `0` bedeutet vom Betriebssystem zugewiesener temporärer Port.                                                                                                                                               |
| `--hostname <host>`                     | Zeichenkette                   | `127.0.0.1`                                  | Nicht-Loopback erfordert Token           | Bind-Adresse. Loopback-Werte: `127.0.0.1`, `localhost`, `::1`, `[::1]`. Die Klammern `[::1]` werden automatisch entfernt; Eingabe von `host:port` wird abgelehnt mit dem Hinweis, `--port` zu verwenden.               |
| `--token <s>`                           | Zeichenkette                   | env / keins                                  | Nicht-Loopback und `--require-auth`      | Bearer-Token; einmal getrimmt. **Erscheint in `/proc/<pid>/cmdline`, daher `QWEN_SERVER_TOKEN` bevorzugen**. Boot-Stderr warnt ebenfalls davor.                                                                        |
| `--max-sessions <n>`                    | Zahl                           | `20`                                         | -                                        | Obergrenze für aktive Sessions. Überschuss gibt 503 zurück. `0` bedeutet unbegrenzt. `NaN` / negative Werte werfen Fehler.                                                                                            |
| `--max-pending-prompts-per-session <n>` | Zahl                           | `5`                                          | -                                        | Obergrenze für akzeptierte, aber noch ausstehende/laufende Prompts pro Session. Überschuss gibt 503 zurück. `0` / `Infinity` bedeutet unbegrenzt. Negative oder nicht-ganzzahlige Werte werfen Fehler.                |
| `--workspace <dir>`                     | Zeichenkette                   | `process.cwd()`                              | -                                        | Gebundener Workspace. **Muss ein absoluter Pfad sein, muss existieren und ein Verzeichnis sein**. Boot normalisiert ihn einmalig via `canonicalizeWorkspace`. `POST /session` mit abweichendem `cwd` gibt `400 workspace_mismatch` zurück. |
| `--max-connections <n>`                 | Zahl                           | `256`                                        | -                                        | Listener-Level `server.maxConnections`. `0` / `Infinity` bedeutet unbegrenzt. `NaN` / negative Werte führen zu Boot-Fehler, um Fail-Open zu vermeiden.                                                                 |
| `--require-auth`                        | boolesch                       | `false`                                      | Token erforderlich                       | Erweitert Bearer-Auth auf Loopback **und** `/health`. Boot verweigert den Start ohne Token.                                                                                                                           |
| `--enable-session-shell`                | boolesch                       | `false`                                      | Token erforderlich                       | Ermöglicht direkte `POST /session/:id/shell`-Ausführung. Aufrufer müssen zusätzlich eine session-gebundene `X-Qwen-Client-Id` senden.                                                                                 |
| `--event-ring-size <n>`                 | Zahl                           | `8000`                                       | -                                        | Pro-Session-SSE-Replay-Ring-Tiefe. Weiche Obergrenze ist `MAX_EVENT_RING_SIZE = 1_000_000`; Werte außerhalb des Bereichs werfen Fehler während der Bridge-Erstellung.                                                  |
| `--http-bridge`                         | boolesch                       | `true`                                       | -                                        | Bridge-Modus Stufe 1: ein `qwen --acp`-Kind, vom Daemon gemultiplext. Stufe 2 (In-Process-Modus) ist noch nicht implementiert; `--no-http-bridge` fällt zurück und gibt eine Meldung auf Stderr aus.                  |
| `--mcp-client-budget <n>`               | Zahl                           | keins                                        | Erforderlich für `mcp-budget-mode=enforce` | Workspace-MCP-Client-Obergrenze. Muss eine positive ganze Zahl sein.                                                                                                                                                 |
| `--mcp-budget-mode <m>`                 | `'enforce' \| 'warn' \| 'off'` | `warn` wenn ein Budget gesetzt, sonst `off` | `enforce` erfordert `--mcp-client-budget` | `enforce` lehnt ab, `warn` warnt nur bei 75%, `off` nur beobachtend.                                                                                                                                                  |
| `--allow-origin <pattern>`              | wiederholbare Zeichenkette     | keins                                        | -                                        | CORS-Whitelist, die die standardmäßige Origin-Verweigerung ersetzt. `*` erfordert ein Token.                                                                                                                          |
| `--allow-private-auth-base-url`         | boolesch                       | `false`                                      | -                                        | Erlaubt lokale Installationen von Auth-Providern mit `baseUrl` auf localhost/privatem Netz. Nur für vertrauenswürdige lokale Entwicklung verwenden.                                                                    |
| `--prompt-deadline-ms <n>`              | Zahl                           | keins                                        | -                                        | Server-seitige Prompt-Wallclock-Grenze in ms; Timeout bricht den Prompt ab.                                                                                                                                           |
| `--writer-idle-timeout-ms <n>`          | Zahl                           | keins                                        | -                                        | Pro-SSE-Verbindungs-Idle-Timeout in ms.                                                                                                                                                                               |
| `--channel-idle-timeout-ms <n>`         | Zahl                           | `0`                                          | -                                        | Hält das ACP-Kind nach Schließen der letzten Session am Leben. `0` bedeutet sofortige Freigabe.                                                                                                                       |
| `--session-reap-interval-ms <n>`        | Zahl                           | `60000`                                      | -                                        | Intervall des Session-Reaper-Scans. `0` deaktiviert es.                                                                                                                                                               |
| `--session-idle-timeout-ms <n>`         | Zahl                           | `1800000`                                    | -                                        | Idle-Timeout für getrennte Sessions. `0` deaktiviert es.                                                                                                                                                             |
| `--rate-limit` / `--no-rate-limit`      | boolesch                       | env / aus                                    | -                                        | Aktiviert oder deaktiviert HTTP-Rate-Limiting pro Stufe.                                                                                                                                                              |
| `--rate-limit-prompt <n>`               | Zahl                           | `10`                                         | `--rate-limit`                           | Prompt-Anfragen pro Fenster.                                                                                                                                                                                          |
| `--rate-limit-mutation <n>`             | Zahl                           | `30`                                         | `--rate-limit`                           | Mutationsanfragen pro Fenster.                                                                                                                                                                                        |
| `--rate-limit-read <n>`                 | Zahl                           | `120`                                        | `--rate-limit`                           | Leseanfragen pro Fenster.                                                                                                                                                                                             |
| `--rate-limit-window-ms <n>`            | Zahl                           | `60000`                                      | `--rate-limit`                           | Länge des Rate-Limit-Fensters; muss `>= 1000` sein.                                                                                                                                                                   |

## 4. Umgebungsvariablen

| Umgebungsvariable                     | Entspricht Flag / Effekt                                                                                                                                                |
| ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `QWEN_SERVER_TOKEN`                 | Entspricht `--token`; `--token` gewinnt. Wird einmal beim Booten getrimmt, um einen abschließenden Zeilenumbruch aus `cat token.txt` zu vermeiden.                         |
| `QWEN_SERVE_DEBUG`                  | `1` / `true` / `on` / `yes` (Groß-/Kleinschreibung egal) aktiviert ausführliche Stderr-Logs.                                                                                             |
| `QWEN_SERVE_NO_MCP_POOL`            | `1` deaktiviert den Workspace-MCP-Pool vollständig und fällt auf pro-Session `McpClientManager` zurück. Fähigkeiten werben nicht mehr mit `mcp_workspace_pool` / `mcp_pool_restart`. |
| `QWEN_SERVE_MCP_CLIENT_BUDGET`      | Internes Budget-Input des ACP-Kinds. Die CLI erzeugt es aus `--mcp-client-budget` über `childEnvOverrides`; es ist kein Elternprozess-Env-Fallback.                  |
| `QWEN_SERVE_MCP_BUDGET_MODE`        | Interner Budget-Modus des ACP-Kinds. Die CLI erzeugt ihn aus `--mcp-budget-mode` über `childEnvOverrides`; es ist kein Elternprozess-Env-Fallback.                     |
| `QWEN_SERVE_PROMPT_DEADLINE_MS`     | Env-Fallback für `--prompt-deadline-ms`.                                                                                                                                |
| `QWEN_SERVE_WRITER_IDLE_TIMEOUT_MS` | Env-Fallback für `--writer-idle-timeout-ms`.                                                                                                                            |
| `QWEN_SERVE_MCP_POOL_TRANSPORTS`    | Wird vom ACP-Kind gelesen. Kommagetrennte Whitelist der gepoolten Transporte; Standard ist `stdio,websocket`.                                                                        |
| `QWEN_SERVE_MCP_POOL_DRAIN_MS`      | Wird vom ACP-Kind gelesen. Verzögerung zum Leeren eines inaktiven Pool-Eintrags; Standard ist `30000`, begrenzt auf `1000..600000` ms.                                                                   |
| `QWEN_SERVE_RATE_LIMIT`             | `1` / `true` aktiviert Rate-Limiting; CLI-Flag gewinnt.                                                                                                                      |
| `QWEN_SERVE_RATE_LIMIT_PROMPT`      | Env-Fallback für `--rate-limit-prompt`.                                                                                                                                 |
| `QWEN_SERVE_RATE_LIMIT_MUTATION`    | Env-Fallback für `--rate-limit-mutation`.                                                                                                                               |
| `QWEN_SERVE_RATE_LIMIT_READ`        | Env-Fallback für `--rate-limit-read`.                                                                                                                                   |
| `QWEN_SERVE_RATE_LIMIT_WINDOW_MS`   | Env-Fallback für `--rate-limit-window-ms`.                                                                                                                              |

Pro-Handle-Env-Overrides sind beabsichtigt: Zwei Daemons, die im gleichen Prozess laufen, konkurrieren nicht um `process.env`. `defaultSpawnChannelFactory` erstellt einen Snapshot von env zum Zeitpunkt des Spawns.

## 5. `settings.json` wird ebenfalls gelesen

Boot ruft `loadSettings(boundWorkspace)` einmal auf:

| Schlüssel                     | Typ                                                               | Verhalten                                                                                                                                                                 |
| --------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `policy.permissionStrategy` | `'first-responder' \| 'designated' \| 'consensus' \| 'local-only'` | Setzt `BridgeOptions.permissionPolicy`. **Boot validiert mit `validatePolicyConfig`**; unbekannte Werte werfen `InvalidPolicyConfigError` anstatt stillschweigend zurückzufallen. |
| `policy.consensusQuorum`    | positive ganze Zahl                                                   | N für die `consensus`-Richtlinie. Standard ist `floor(M/2)+1`. Wenn unter einer Nicht-Consensus-Richtlinie gesetzt, wird es ignoriert und Boot loggt eine Stderr-Warnung.                              |
| `context.fileName`          | Zeichenkette                                                             | Überschreibt `getCurrentGeminiMdFilename()` und steuert, welche Datei `POST /workspace/init` schreibt.                                                                          |
| `tools.disabled`            | Zeichenkette[]                                                           | Wird durch `normalizeDisabledToolList()` normalisiert (trimmen, leere Einträge entfernen, deduplizieren), bevor es den nächsten ACP-Kind-Spawn beeinflusst.                                           |
| `tools.approvalMode`        | Zeichenkette                                                             | Standard-Session-Genehmigungsmodus.                                                                                                                                           |
| `telemetry`                 | Objekt                                                             | OTel-Konfiguration: `enabled`, `otlpEndpoint`, `otlpProtocol`, Endpunkte pro Signal und mehr. Siehe [`17-configuration.md`](./17-configuration.md).                       |

Fehler beim Lesen von Settings (z. B. fehlerhaftes JSON) führen zu Standardwerten. `InvalidPolicyConfigError` ist die Ausnahme: Fehlkonfiguration der Richtlinie führt zu explizitem Boot-Fehler.

## 6. Boot-Verweigerungsszenarien (explizite Fehler)

`run-qwen-serve.ts` wirft absichtlich, anstatt zurückzufallen, in diesen Fällen:

| Szenario                                                                      | Fehlerpräfix                                                                                        |
| ----------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Nicht-Loopback-Bind ohne Token                                               | `Refusing to bind ... without a bearer token`                                                       |
| `--require-auth` ohne Token                                                | `Refusing to start with --require-auth set but no bearer token`                                     |
| `--workspace` existiert nicht, ist kein Verzeichnis oder nicht absolut          | `Invalid --workspace ...`                                                                           |
| `--workspace` stat-Berechtigung verweigert                                            | `Invalid --workspace ...: permission denied`                                                        |
| `--mcp-client-budget` ist keine positive ganze Zahl                               | `Must be a positive integer`                                                                        |
| `--mcp-budget-mode=enforce` ohne Budget                                    | `requires a positive mcpClientBudget`                                                               |
| `--hostname` ist als `localhost:4170` geschrieben                                   | `looks like a "host:port" combination. Use --port`                                                  |
| `--hostname [::1]:8080`                                                       | `Invalid --hostname ... brackets indicate an IPv6 literal but the value is not a clean [addr] form` |
| `--max-connections` ist `NaN` oder negativ                                      | `Must be >= 0`                                                                                      |
| `--event-ring-size > 1_000_000`                                               | Wird während der Bridge-Erstellung geworfen                                                                   |
| `--allow-origin '*'` ohne Token                                            | `Refusing to start with --allow-origin '*' but no bearer token configured`                          |
| `--prompt-deadline-ms` / `--writer-idle-timeout-ms` ist keine positive ganze Zahl | `Must be a positive integer`                                                                        |
| Unbekanntes `policy.permissionStrategy` oder nicht-positive `policy.consensusQuorum`  | `InvalidPolicyConfigError`                                                                          |
## 7. Curl-Überprüfungs-Checkliste

```bash
# 1. Liveness
curl http://127.0.0.1:4170/health
# -> {"status":"ok"}

# 1.1 Deep health
curl -s 'http://127.0.0.1:4170/health?deep=1' | jq

# 2. Capabilities
curl -s http://127.0.0.1:4170/capabilities | jq

# 3. Preflight readiness
curl -s http://127.0.0.1:4170/workspace/preflight | jq

# 4. Env snapshot (secrets only report presence)
curl -s http://127.0.0.1:4170/workspace/env | jq

# 5. MCP pool / budget snapshot
curl -s http://127.0.0.1:4170/workspace/mcp | jq

# 6. Create a session
curl -s -X POST http://127.0.0.1:4170/session \
  -H 'Content-Type: application/json' \
  -H 'X-Qwen-Client-Id: curl-debug' \
  -d '{}' | jq

# 7. Tail SSE (replace <sid>)
curl -N \
  -H 'Accept: text/event-stream' \
  -H 'X-Qwen-Client-Id: curl-debug' \
  -H 'Last-Event-ID: 0' \
  'http://127.0.0.1:4170/session/<sid>/events'

# 8. Demo page
open http://127.0.0.1:4170/demo
```

Wenn Bearer-Auth aktiviert ist, füge `-H "Authorization: Bearer $QWEN_SERVER_TOKEN"` zu jeder Anfrage hinzu.

## 8. Kann die Demo-Seite verwendet werden?

**Ja.** Sie wird durch `getDemoHtml(port)` in `packages/cli/src/serve/demo.ts` als eigenständiges HTML ohne externe Abhängigkeiten implementiert.

| Startmodus                       | Wo `/demo` registriert ist                                          | Direkte Browser-Navigation                              |
| -------------------------------- | ------------------------------------------------------------------- | ------------------------------------------------------- |
| Loopback ohne `--require-auth`   | `server.ts` Loopback-Pre-Auth-Zweig, **vor** `bearerAuth`           | Funktioniert ohne Token                                 |
| Loopback mit `--require-auth`    | `server.ts` Post-Auth-Zweig, **nach** `bearerAuth`                  | Schwierig aus einem normalen Browser zu nutzen; curl oder SDK verwenden |
| Non-Loopback-Bind                | `server.ts` Post-Auth-Zweig, **nach** `bearerAuth`                  | Gleiches wie oben                                       |

CSP ist `default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; frame-ancestors 'none'`, plus `X-Frame-Options: DENY`. Die Seite kann nur `'self'` (den Daemon) abrufen und keine externen Skripte oder Styles laden.

## 9. Aufrufkette von `qwen serve` bis zum lauschenden Server

```text
qwen serve
   |
   v (Prozess)
packages/cli/index.ts              main()
   |
   v
gemini.tsx                         main() - parseArguments()
   |
   v (yargs-Assembly)
config/config.ts                   import { serveCommand } ...
config/config.ts                   .command(serveCommand)
config/config.ts                   await yargsInstance.parse()
   |
   v (Handler)
commands/serve.ts                  handler(argv) - Boot-Vorprüfungen
commands/serve.ts                  const { runQwenServe } = await import('../serve/index.js')   # lazy load
commands/serve.ts                  await runQwenServe({...})
   |
   v
serve/run-qwen-serve.ts              runQwenServe(opts, deps)
   |  |- Token trimmen
   |  |- Hostname-Mismatch-Fallback
   |  |- Auth-Preflight
   |  |- Workspace-Validierung + Kanonisierung
   |  |- MCP-Budget-Validierung + childEnvOverrides
   |  |- loadSettings + validatePolicyConfig
   |  |- PermissionAuditRing + Publisher
   |  |- resolveBridgeFsFactory
   |  `- createHttpAcpBridge({...})
   |
   v
serve/run-qwen-serve.ts              const app = createServeApp(opts, () => actualPort, {...})
   |
   v
serve/server.ts                    createServeApp() - erstellt Express-App (**lauscht nicht**)
   |  |- Middleware-Kette (Host-Whitelist / CORS / bearerAuth / Mutation-Gate / Rate-Limit)
   |  |- Routen-Montage (health / demo / capabilities / workspace / session / SSE / ACP HTTP)
   |  `- return app
   |
   v
serve/run-qwen-serve.ts              server = app.listen(port, hostname, cb)
   |  |- server.maxConnections = cap
   |  |- actualPort = server.address().port
   |  |- schreibe "qwen serve listening on ..."
   |  |- SIGINT / SIGTERM registrieren (onSignal)
   |  `- resolve(handle: RunHandle)
   |
   v
commands/serve.ts                  await blockForever()    // blockiert bis Signal
```

Wichtige Fakten:

- **`createServeApp` baut nur auf; es lauscht nicht.** Es gibt eine `express()`-Instanz mit Middleware und Routen zurück. Der Aufrufer besitzt `app.listen()`. `server.test.ts` verwendet die Factory so in etwa 25 Tests, daher vermeidet die Factory absichtlich die Lebenszyklus-Verwaltung.
- **`() => actualPort` ist ein Lazy-Closure.** `actualPort` wird im `app.listen`-Callback zugewiesen. Die `hostAllowlist`-Middleware liest es bei Bedarf, sodass auch bei ephemeren Ports (`--port 0`) der `Host`-Header korrekt geprüft wird.
- **`await blockForever()` ist beabsichtigt.** Wenn `yargs.parse()` auflöst, fällt die CLI-Top-Ebene in den interaktiven TUI-Einstiegspunkt (`gemini.tsx`). SIGINT / SIGTERM beenden über den `onSignal`-Pfad von `runQwenServe`.

## 10. HTTP-Routen-Aufteilung

Die Hauptzusammenstellung erfolgt in `createServeApp()` in `server.ts`, das vier modulare Routen-Dateien einbindet:

| Routen                                                                                                                     | Datei                                                 | Einhängepunkt                                   |
| -------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- | ----------------------------------------------- |
| `/health`, `/demo`, `/capabilities`, alle Session-Routen, Device-Flow, Permission-Vote, SSE und Single-Server-MCP-Neustart | `packages/cli/src/serve/server.ts`                    | Direkt in `createServeApp()` registriert        |
| `/workspace/memory` (GET/POST)                                                                                             | `packages/cli/src/serve/workspace-memory.ts`          | `mountWorkspaceMemoryRoutes()`                  |
| Alle `/workspace/agents` CRUD-Routen                                                                                       | `packages/cli/src/serve/workspace-agents.ts`          | `mountWorkspaceAgentsRoutes()`                  |
| `GET /file`, `/file/bytes`, `/list`, `/glob`, `/stat`                                                                     | `packages/cli/src/serve/routes/workspace-file-read.ts` | `registerWorkspaceFileReadRoutes()`             |
| `POST /file/write`, `/file/edit`                                                                                          | `packages/cli/src/serve/routes/workspace-file-write.ts`| `registerWorkspaceFileWriteRoutes()`            |

Für das vollständige Routen- und Wire-Protokoll siehe [`../qwen-serve-protocol.md`](../qwen-serve-protocol.md). Zur Architektur siehe [`01-architecture.md`](./01-architecture.md).

## 11. Graceful- vs. Hard-Shutdown

- **Erstes SIGINT / SIGTERM** -> `runQwenServe` `onSignal` -> zweiphasiger Graceful-Shutdown:
  1. `bridge.shutdown()`: Jeder Kanal erhält `KILL_HARD_DEADLINE_MS` (10s), dann `channel.kill()`.
  2. `server.close()`: Ausstehende Anfragen werden abgearbeitet, `SHUTDOWN_FORCE_CLOSE_MS` (5s) löst `closeAllConnections()` aus, danach gilt eine zweite 2s-Frist.
- **Zweites SIGINT / SIGTERM während des laufenden Shutdowns** -> `bridge.killAllSync()` beendet synchron alle ACP-Kinder per SIGKILL und ruft `process.exit(1)` auf, um verwaiste Prozesse zu vermeiden.

`RunHandle.close()`, das von `runQwenServe` zurückgegeben wird, ist das programmatische Äquivalent für Einbettungen und Tests.

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

Oder direkt die Express-App holen und selbst lauschen:

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

Hinweis: Bei direktem Aufruf von `createServeApp` ist die Standardeinstellung `fsFactory.trusted = false`. Agent-seitiges ACP `writeTextFile` wird als `untrusted_workspace` abgelehnt, und es wird einmalig eine Warnung auf stderr ausgegeben. Entweder `deps.fsFactory` mit explizitem Trust injizieren, `deps.bridge` injizieren, oder das trust-gesteuerte Standardverhalten akzeptieren.

## 13. Debugging-Rezepte

Siehe den Debugging-Abschnitt in [`19-observability.md`](./19-observability.md). Die gängigen Befehle sind:

```bash
# Ist der Daemon am Leben?
curl http://127.0.0.1:4170/health

# Welche Fähigkeiten werden beworben?
curl -s http://127.0.0.1:4170/capabilities | jq

# Daemon-Host-Bereitschaft
curl -s http://127.0.0.1:4170/workspace/preflight | jq

# Live-SSE mitschneiden
curl -N -H 'Accept: text/event-stream' \
     -H 'Last-Event-ID: 0' \
     'http://127.0.0.1:4170/session/<sid>/events'

# Ausführliche Logs
QWEN_SERVE_DEBUG=1 qwen serve
```

## Referenzen

- CLI-Einstieg: `packages/cli/src/commands/serve.ts`
- Bootstrap: `packages/cli/src/serve/run-qwen-serve.ts`
- Express-Factory: `packages/cli/src/serve/server.ts`
- Middleware: `packages/cli/src/serve/auth.ts`
- Bridge-Factory: `packages/acp-bridge/src/bridge.ts`
- Demo-Seiten-HTML: `packages/cli/src/serve/demo.ts`
- Benutzerdokumentation: [`../../users/qwen-serve.md`](../../users/qwen-serve.md)
- Wire-Protokoll: [`../qwen-serve-protocol.md`](../qwen-serve-protocol.md)