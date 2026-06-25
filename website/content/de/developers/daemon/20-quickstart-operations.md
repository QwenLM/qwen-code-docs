# Kurzanleitung & Betrieb

Diese Seite konzentriert sich darauf, **wie man `qwen serve` startet, wie man überprüft, ob es funktioniert, und wie der interne Aufrufablauf von `qwen serve` bis zum lauschenden Server aussieht**. Architektur, Komponenten und Details zum Wire-Protokoll befinden sich auf den anderen Seiten mit vertieften Einblicken in den Daemon.

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

Öffne `http://127.0.0.1:4170/demo` in einem Browser, um die Debug-Konsole zu sehen: Chat-UI, Ereignisstrom und Workspace-Inspektion. Im Standard-Loopback-Entwicklungsmodus wird `/demo` **vor** `bearerAuth` im Loopback-Route-Zweig von `packages/cli/src/serve/server.ts` registriert, sodass kein Token erforderlich ist.

## 2. Start-Rezepte

```bash
# 1. Local dev default (loopback, no token)
qwen serve

# 2. Explicit workspace + ephemeral port
qwen serve --workspace /path/to/repo --port 0

# 3. Hardened loopback development (force bearer even on loopback)
QWEN_SERVER_TOKEN=$(openssl rand -hex 32) qwen serve --require-auth

# 4. Expose to LAN (non-loopback requires a token)
QWEN_SERVER_TOKEN=$(openssl rand -hex 32) \
  qwen serve --hostname 0.0.0.0 --port 4170

# 5. Tune for many sessions and a larger replay ring
qwen serve --max-sessions 0 --event-ring-size 32000

# 6. Multi-client collaboration + strict MCP budget
QWEN_SERVER_TOKEN=secret \
  qwen serve --require-auth \
             --mcp-client-budget 10 \
             --mcp-budget-mode enforce

# 7. Start with a consensus policy configured in settings.json
# settings.json: { "policy": { "permissionStrategy": "consensus", "consensusQuorum": 2 } }
qwen serve

# 8. Debug logging
QWEN_SERVE_DEBUG=1 qwen serve

# 9. Disable the F2 pool (fallback to per-session MCP clients)
QWEN_SERVE_NO_MCP_POOL=1 qwen serve

# 10. Allow browser web UI cross-origin access
QWEN_SERVER_TOKEN=secret \
  qwen serve --allow-origin 'http://localhost:3000'

# 11. Prompt deadline + SSE idle timeout
qwen serve --prompt-deadline-ms 300000 --writer-idle-timeout-ms 600000

# 12. Keep the ACP child warm after the last session closes
qwen serve --channel-idle-timeout-ms 60000

# 13. Enable HTTP rate limiting
QWEN_SERVE_RATE_LIMIT=1 qwen serve
```

Mit dem gehärteten Loopback-Rezept (3) wird `/demo` nach `bearerAuth` registriert. Ein normaler Browserzugriff benötigt einen Auth-Header; verwende stattdessen curl oder ein SDK-Skript.

## 3. Alle Start-Flags

Die CLI ist in **`packages/cli/src/commands/serve.ts`** definiert:

| Flag                                   | Typ                           | Standard                                      | Erforderlich wenn                        | Wirkung                                                                                                                                                                                                               |
| -------------------------------------- | ----------------------------- | --------------------------------------------- | ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--port <n>`                           | number                        | `4170`                                        | -                                        | TCP-Port; `0` bedeutet vom Betriebssystem zugewiesener temporärer Port.                                                                                                                                               |
| `--hostname <host>`                    | string                        | `127.0.0.1`                                   | Nicht-Loopback erfordert Token           | Bind-Adresse. Loopback-Werte: `127.0.0.1`, `localhost`, `::1`, `[::1]`. Eckige Klammern bei `[::1]` werden automatisch entfernt; Eingabe im Format `host:port` wird abgelehnt mit Hinweis auf `--port`.                |
| `--token <s>`                          | string                        | Umgebungsvariable / keines                    | Nicht-Loopback und `--require-auth`      | Bearer-Token; wird einmal getrimmt. **Erscheint in `/proc/<pid>/cmdline`, daher `QWEN_SERVER_TOKEN` bevorzugen**. Boot stderr warnt ebenfalls davor.                                                                   |
| `--max-sessions <n>`                   | number                        | `20`                                          | -                                        | Obergrenze für aktive Sitzungen. Überschreitung führt zu 503. `0` bedeutet unbegrenzt. `NaN` / negative Werte werfen einen Fehler.                                                                                    |
| `--max-pending-prompts-per-session <n>`| number                        | `5`                                           | -                                        | Obergrenze für akzeptierte, aber ausstehende/laufende Prompts pro Sitzung. Überschreitung führt zu 503. `0` / `Infinity` bedeutet unbegrenzt. Negative oder nicht-ganzzahlige Werte werfen einen Fehler.               |
| `--workspace <dir>`                    | string                        | `process.cwd()`                               | -                                        | Gebundener Workspace. **Muss ein absoluter Pfad sein, muss existieren und ein Verzeichnis sein**. Boot kanonisiert ihn einmal via `canonicalizeWorkspace`. `POST /session` mit abweichendem `cwd` gibt `400 workspace_mismatch`. |
| `--max-connections <n>`                | number                        | `256`                                         | -                                        | Listener-Ebene `server.maxConnections`. `0` / `Infinity` bedeutet unbegrenzt. `NaN` / negative Werte verhindern Boot, um kein Fail-Open-Verhalten zu riskieren.                                                        |
| `--require-auth`                       | boolean                       | `false`                                       | Token erforderlich                       | Erweitert Bearer-Auth auf Loopback **und** `/health`. Boot verweigert den Start ohne Token.                                                                                                                           |
| `--enable-session-shell`               | boolean                       | `false`                                       | Token erforderlich                       | Ermöglicht direkte `POST /session/:id/shell`-Ausführung. Aufrufer müssen auch eine sitzungsgebundene `X-Qwen-Client-Id` senden.                                                                                       |
| `--event-ring-size <n>`                | number                        | `8000`                                        | -                                        | Tiefe des SSE-Wiederholungsrings pro Sitzung. Weiches Limit ist `MAX_EVENT_RING_SIZE = 1_000_000`; außerhalb des gültigen Bereichs wird beim Brückenbau ein Fehler geworfen.                                           |
| `--http-bridge`                        | boolean                       | `true`                                        | -                                        | Brückenmodus Stufe 1: ein `qwen --acp`-Kind, das vom Daemon gemultiplext wird. Stufe 2 (In-Prozess-Modus) ist noch nicht implementiert; `--no-http-bridge` fällt zurück und gibt eine Meldung auf stderr aus.          |
| `--mcp-client-budget <n>`              | number                        | keines                                        | Erforderlich für `mcp-budget-mode=enforce` | Obergrenze für Workspace-MCP-Clients. Muss eine positive ganze Zahl sein.                                                                                                                                             |
| `--mcp-budget-mode <m>`                | `'enforce' \| 'warn' \| 'off'`| `warn` wenn Budget gesetzt, sonst `off`       | `enforce` erfordert `--mcp-client-budget` | `enforce` lehnt ab, `warn` warnt nur bei 75%, `off` ist reine Beobachtung.                                                                                                                                            |
| `--allow-origin <pattern>`             | wiederholbare Zeichenkette     | keines                                        | -                                        | CORS-Allowlist, die die standardmäßige Origin-Ablehnung ersetzt. `*` erfordert ein Token.                                                                                                                              |
| `--allow-private-auth-base-url`        | boolean                       | `false`                                       | -                                        | Erlaubt die Installation eines Auth-Provider-`baseUrl` auf localhost / privatem Netzwerk. Nur für vertrauenswürdige lokale Entwicklung verwenden.                                                                       |
| `--prompt-deadline-ms <n>`             | number                        | keines                                        | -                                        | Serverseitiges Prompt-Wallclock-Limit in ms; Timeout bricht den Prompt ab.                                                                                                                                            |
| `--writer-idle-timeout-ms <n>`         | number                        | keines                                        | -                                        | Inaktivitäts-Timeout pro SSE-Verbindung in ms.                                                                                                                                                                         |
| `--channel-idle-timeout-ms <n>`        | number                        | `0`                                           | -                                        | Hält das ACP-Kind nach dem Schließen der letzten Sitzung am Leben. `0` bedeutet sofortige Freigabe.                                                                                                                    |
| `--session-reap-interval-ms <n>`       | number                        | `60000`                                       | -                                        | Intervall des Sitzungs-Reaper-Scans. `0` deaktiviert ihn.                                                                                                                                                             |
| `--session-idle-timeout-ms <n>`        | number                        | `1800000`                                     | -                                        | Inaktivitäts-Timeout für getrennte Sitzungen. `0` deaktiviert es.                                                                                                                                                     |
| `--rate-limit` / `--no-rate-limit`     | boolean                       | Umgebungsvariable / aus                       | -                                        | Aktiviert oder deaktiviert HTTP-Ratenbegrenzung pro Stufe.                                                                                                                                                             |
| `--rate-limit-prompt <n>`              | number                        | `10`                                          | `--rate-limit`                           | Prompt-Anfragen pro Fenster.                                                                                                                                                                                          |
| `--rate-limit-mutation <n>`            | number                        | `30`                                          | `--rate-limit`                           | Mutationsanfragen pro Fenster.                                                                                                                                                                                        |
| `--rate-limit-read <n>`                | number                        | `120`                                         | `--rate-limit`                           | Leseanfragen pro Fenster.                                                                                                                                                                                             |
| `--rate-limit-window-ms <n>`           | number                        | `60000`                                       | `--rate-limit`                           | Fensterlänge für Ratenbegrenzung; muss `>= 1000` sein.                                                                                                                                                                |
## 4. Umgebungsvariablen

| Env                                 | Entsprechendes Flag / Effekt                                                                                                                                            |
| ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `QWEN_SERVER_TOKEN`                 | Entspricht `--token`; `--token` gewinnt. Wird beim Start einmal getrimmt, um einen nachgestellten Zeilenumbruch von `cat token.txt` zu vermeiden.                       |
| `QWEN_SERVE_DEBUG`                  | `1` / `true` / `on` / `yes` (Groß-/Kleinschreibung egal) aktiviert ausführliche stderr-Logs.                                                                           |
| `QWEN_SERVE_NO_MCP_POOL`            | `1` deaktiviert den Workspace-MCP-Pool vollständig und fällt auf den pro-Sitzung `McpClientManager` zurück. Fähigkeiten bewerben dann `mcp_workspace_pool` / `mcp_pool_restart` nicht mehr. |
| `QWEN_SERVE_MCP_CLIENT_BUDGET`      | ACP-Child-internes Budget-Input. Das CLI erzeugt es aus `--mcp-client-budget` über `childEnvOverrides`; es ist kein Fallback auf die Umgebungsvariable des Elternprozesses. |
| `QWEN_SERVE_MCP_BUDGET_MODE`        | ACP-Child-interner Budget-Modus. Das CLI erzeugt es aus `--mcp-budget-mode` über `childEnvOverrides`; es ist kein Fallback auf die Umgebungsvariable des Elternprozesses. |
| `QWEN_SERVE_PROMPT_DEADLINE_MS`     | Umgebungsvariablen-Fallback für `--prompt-deadline-ms`.                                                                                                                |
| `QWEN_SERVE_WRITER_IDLE_TIMEOUT_MS` | Umgebungsvariablen-Fallback für `--writer-idle-timeout-ms`.                                                                                                            |
| `QWEN_SERVE_MCP_POOL_TRANSPORTS`    | Vom ACP-Child gelesen. Kommagetrennte Whitelist gepoolter Transporte; Standard ist `stdio,websocket`.                                                                  |
| `QWEN_SERVE_MCP_POOL_DRAIN_MS`      | Vom ACP-Child gelesen. Verzögerung für das Leeren inaktiver Pool-Einträge; Standard ist `30000`, begrenzt auf `1000..600000` ms.                                        |
| `QWEN_SERVE_RATE_LIMIT`             | `1` / `true` aktiviert Ratenbegrenzung; CLI-Flag gewinnt.                                                                                                              |
| `QWEN_SERVE_RATE_LIMIT_PROMPT`      | Umgebungsvariablen-Fallback für `--rate-limit-prompt`.                                                                                                                 |
| `QWEN_SERVE_RATE_LIMIT_MUTATION`    | Umgebungsvariablen-Fallback für `--rate-limit-mutation`.                                                                                                               |
| `QWEN_SERVE_RATE_LIMIT_READ`        | Umgebungsvariablen-Fallback für `--rate-limit-read`.                                                                                                                   |
| `QWEN_SERVE_RATE_LIMIT_WINDOW_MS`   | Umgebungsvariablen-Fallback für `--rate-limit-window-ms`.                                                                                                              |

Die Überschreibungen pro Handle sind beabsichtigt: Zwei Daemons, die im selben Prozess laufen, konkurrieren nicht um `process.env`. `defaultSpawnChannelFactory` erfasst die Umgebung zum Zeitpunkt des Spawnens.

## 5. `settings.json` wird ebenfalls gelesen

Boot ruft `loadSettings(boundWorkspace)` einmal auf:

| Schlüssel                    | Typ                                                                | Verhalten                                                                                                                                                             |
| ---------------------------- | ------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `policy.permissionStrategy`  | `'first-responder' \| 'designated' \| 'consensus' \| 'local-only'`| Setzt `BridgeOptions.permissionPolicy`. **Boot validiert mit `validatePolicyConfig`**; unbekannte Werte werfen `InvalidPolicyConfigError`, anstatt stillschweigend zurückzufallen. |
| `policy.consensusQuorum`     | positive Ganzzahl                                                  | N für die `consensus`-Richtlinie. Standard ist `floor(M/2)+1`. Wenn unter einer Nicht-consensus-Richtlinie gesetzt, wird es ignoriert und Boot protokolliert eine stderr-Warnung. |
| `context.fileName`           | Zeichenkette                                                       | Überschreibt `getCurrentGeminiMdFilename()` und steuert, welche Datei `POST /workspace/init` schreibt.                                                                |
| `tools.disabled`             | Zeichenkette[]                                                     | Wird durch `normalizeDisabledToolList()` normalisiert (trimmen, leere Einträge entfernen, deduplizieren), bevor der nächste ACP-Child-Spawn beeinflusst wird.        |
| `tools.approvalMode`         | Zeichenkette                                                       | Standard-Genehmigungsmodus für Sitzungen.                                                                                                                            |
| `telemetry`                  | Objekt                                                             | OTel-Konfiguration: `enabled`, `otlpEndpoint`, `otlpProtocol`, signal-spezifische Endpunkte und mehr. Siehe [`17-configuration.md`](./17-configuration.md).          |
Fehler bei Einstellungs-I/O, z. B. fehlerhaftes JSON, führen zur Verwendung der Standardwerte. `InvalidPolicyConfigError` ist die Ausnahme: eine Fehlkonfiguration der Richtlinie führt zu einem expliziten Boot-Fehler.

## 6. Verweigerungsszenarien beim Boot (explizite Fehler)

`run-qwen-serve.ts` wirft absichtlich einen Fehler, anstatt auf Standardwerte zurückzufallen, in diesen Fällen:

| Szenario                                                                      | Fehlerpräfix                                                                                        |
| ----------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Nicht-Loopback-Bindung ohne Token                                             | `Refusing to bind ... without a bearer token`                                                       |
| `--require-auth` ohne Token                                                   | `Refusing to start with --require-auth set but no bearer token`                                     |
| `--workspace` existiert nicht, ist kein Verzeichnis oder nicht absolut        | `Invalid --workspace ...`                                                                           |
| `--workspace` stat-Berechtigung verweigert                                    | `Invalid --workspace ...: permission denied`                                                        |
| `--mcp-client-budget` ist keine positive Ganzzahl                             | `Must be a positive integer`                                                                        |
| `--mcp-budget-mode=enforce` ohne Budget                                       | `requires a positive mcpClientBudget`                                                               |
| `--hostname` ist als `localhost:4170` geschrieben                             | `looks like a "host:port" combination. Use --port`                                                  |
| `--hostname [::1]:8080`                                                       | `Invalid --hostname ... brackets indicate an IPv6 literal but the value is not a clean [addr] form` |
| `--max-connections` ist `NaN` oder negativ                                    | `Must be >= 0`                                                                                      |
| `--event-ring-size > 1_000_000`                                               | Wird während der Bridge-Konstruktion geworfen                                                        |
| `--allow-origin '*'` ohne Token                                               | `Refusing to start with --allow-origin '*' but no bearer token configured`                          |
| `--prompt-deadline-ms` / `--writer-idle-timeout-ms` ist keine positive Ganzzahl | `Must be a positive integer`                                                                        |
| Unbekanntes `policy.permissionStrategy` oder nicht-positives `policy.consensusQuorum` | `InvalidPolicyConfigError`                                                                          |

## 7. Überprüfungs-Checkliste mit curl

```bash
# 1. Liveness
curl http://127.0.0.1:4170/health
# -> {"status":"ok"}

# 1.1 Deep Health
curl -s 'http://127.0.0.1:4170/health?deep=1' | jq

# 2. Fähigkeiten
curl -s http://127.0.0.1:4170/capabilities | jq

# 3. Preflight-Bereitschaft
curl -s http://127.0.0.1:4170/workspace/preflight | jq

# 4. Umgebungs-Snapshot (Geheimnisse zeigen nur ihre Existenz an)
curl -s http://127.0.0.1:4170/workspace/env | jq

# 5. MCP-Pool / Budget-Snapshot
curl -s http://127.0.0.1:4170/workspace/mcp | jq

# 6. Sitzung erstellen
curl -s -X POST http://127.0.0.1:4170/session \
  -H 'Content-Type: application/json' \
  -H 'X-Qwen-Client-Id: curl-debug' \
  -d '{}' | jq

# 7. SSE-Ereignisse abonnieren (ersetze <sid>)
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

**Ja.** Sie wird von `getDemoHtml(port)` in `packages/cli/src/serve/demo.ts` als eigenständiges HTML ohne externe Abhängigkeiten implementiert.

| Startmodus                     | Wo `/demo` registriert ist                                         | Direkte Browser-Navigation                              |
| ------------------------------ | ------------------------------------------------------------------ | ------------------------------------------------------- |
| Loopback ohne `--require-auth` | `server.ts` Loopback-Pre-Auth-Route-Zweig, **vor** `bearerAuth`    | Funktioniert ohne Token                                  |
| Loopback mit `--require-auth`  | `server.ts` Post-Auth-Route-Zweig, **nach** `bearerAuth`           | Schwierig von einem normalen Browser aus zu verwenden; curl oder SDK nutzen |
| Nicht-Loopback-Bindung         | `server.ts` Post-Auth-Route-Zweig, **nach** `bearerAuth`           | Gleiches wie oben                                        |
CSP ist `default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; frame-ancestors 'none'`, plus `X-Frame-Options: DENY`. Die Seite kann nur `'self'` (den Daemon) abrufen und keine externen Skripte oder Styles laden.

## 9. Aufrufkette von `qwen serve` bis zum lauschenden Server

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
commands/serve.ts                  const { runQwenServe } = await import('../serve/index.js')   # lazy load
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
commands/serve.ts                  await blockForever()    // block forever until signal
```

Wichtige Fakten:

- **`createServeApp` baut nur; es lauscht nicht.** Es gibt eine `express()`-Instanz mit Middleware und Routen zurück. Der Aufrufer besitzt `app.listen()`. `server.test.ts` verwendet die Factory auf diese Weise in etwa 25 Tests, daher vermeidet die Factory absichtlich die Lebenszyklusverwaltung.
- **`() => actualPort` ist ein Lazy-Closure.** `actualPort` wird im `app.listen`-Callback zugewiesen. Die `hostAllowlist`-Middleware liest ihn bei Bedarf aus, sodass auch kurzlebige Ports (`--port 0`) den `Host`-Header korrekt prüfen.
- **`await blockForever()` ist beabsichtigt.** Wenn `yargs.parse()` auflöst, fällt die oberste CLI-Ebene in den interaktiven TUI-Einstiegspunkt (`gemini.tsx`). SIGINT / SIGTERM beenden über den `onSignal`-Pfad von `runQwenServe`.

## 10. Aufteilung der HTTP-Routendateien

Die Hauptassemblierung erfolgt in `createServeApp()` in `server.ts`, das vier modulare Routendateien einbindet:

| Routen                                                                                                                    | Datei                                                  | Einhängepunkt                                  |
| ------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- | --------------------------------------------- |
| `/health`, `/demo`, `/capabilities`, alle Session-Routen, Device-Flow, Permission-Vote, SSE und Single-Server-MCP-Neustart | `packages/cli/src/serve/server.ts`                    | Direkt in `createServeApp()` registriert      |
| `/workspace/memory` (GET/POST)                                                                                            | `packages/cli/src/serve/workspace-memory.ts`           | `mountWorkspaceMemoryRoutes()`                |
| Alle CRUD-Routen für `/workspace/agents`                                                                                       | `packages/cli/src/serve/workspace-agents.ts`           | `mountWorkspaceAgentsRoutes()`                |
| `GET /file`, `/file/bytes`, `/list`, `/glob`, `/stat`                                                                     | `packages/cli/src/serve/routes/workspace-file-read.ts`  | `registerWorkspaceFileReadRoutes()`           |
| `POST /file/write`, `/file/edit`                                                                                          | `packages/cli/src/serve/routes/workspace-file-write.ts` | `registerWorkspaceFileWriteRoutes()`          |

Die vollständige Referenz zu den Routen und zum Drahtprotokoll findest du in [`../qwen-serve-protocol.md`](../qwen-serve-protocol.md). Zur Architektur siehe [`01-architecture.md`](./01-architecture.md).

## 11. Sanftes vs. hartes Herunterfahren

- **Erstes SIGINT / SIGTERM** -> `runQwenServe` `onSignal` -> zweiphasiges Graceful-Shutdown:
  1. `bridge.shutdown()`: jeder Kanal erhält `KILL_HARD_DEADLINE_MS` (10s), dann `channel.kill()`.
  2. `server.close()`: laufende Requests werden abgearbeitet, `SHUTDOWN_FORCE_CLOSE_MS` (5s) löst `closeAllConnections()` aus, danach gilt eine zweite 2s-Frist.
- **Zweites SIGINT / SIGTERM während des Herunterfahrens** -> `bridge.killAllSync()` sendet synchron SIGKILL an alle ACP-Kinder und ruft `process.exit(1)` auf, um verwaiste Prozesse zu vermeiden.
`RunHandle.close()` von `runQwenServe` zurückgegeben ist das programmatische Äquivalent für Einbettungen und Tests.

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
// ... call handle.bridge directly or access handle.server
await handle.close(); // programmatic shutdown
```

Oder die Express-App direkt abrufen und selbst lauschen:

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

Hinweis: Beim direkten Aufruf von `createServeApp` ist der Standardwert `fsFactory.trusted = false`. Das serverseitige ACP `writeTextFile` wird als `untrusted_workspace` abgelehnt, und eine Stderr-Warnung wird einmal ausgegeben. Entweder `deps.fsFactory` mit explizitem Vertrauen injizieren, `deps.bridge` injizieren oder das standardmäßige vertrauensgesteuerte Verhalten akzeptieren.

## 13. Debugging-Rezepte

Siehe den Abschnitt zum Debuggen in [`19-observability.md`](./19-observability.md). Die üblichen Befehle sind:

```bash
# Is the daemon alive?
curl http://127.0.0.1:4170/health

# Which capabilities are advertised?
curl -s http://127.0.0.1:4170/capabilities | jq

# Daemon-host readiness
curl -s http://127.0.0.1:4170/workspace/preflight | jq

# Tail live SSE
curl -N -H 'Accept: text/event-stream' \
     -H 'Last-Event-ID: 0' \
     'http://127.0.0.1:4170/session/<sid>/events'

# Verbose logs
QWEN_SERVE_DEBUG=1 qwen serve
```

## Referenzen

- CLI-Einstieg: `packages/cli/src/commands/serve.ts`
- Bootstrap: `packages/cli/src/serve/run-qwen-serve.ts`
- Express-Factory: `packages/cli/src/serve/server.ts`
- Middleware: `packages/cli/src/serve/auth.ts`
- Bridge-Factory: `packages/acp-bridge/src/bridge.ts`
- HTML der Demo-Seite: `packages/cli/src/serve/demo.ts`
- Benutzerdokumentation: [`../../users/qwen-serve.md`](../../users/qwen-serve.md)
- Drahtprotokoll: [`../qwen-serve-protocol.md`](../qwen-serve-protocol.md)
