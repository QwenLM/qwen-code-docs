# Daemon Multi-Workspace Phase 4: Workspace-qualifiziertes ACP

## Zusammenfassung

Dieses Dokument entwirft Phase 4 von Issue #6378: Workspace-qualifiziertes ACP
für `qwen serve`. Es baut direkt auf dem Phase-3-Branch für
Workspace-qualifiziertes REST (`codex/phase3-workspace-qualified-rest`, PR
#6567) auf, der **noch nicht gemerged ist** (Status `CHANGES_REQUESTED`).
Phase 4 mountet einen Pro-Workspace-ACP-Endpunkt unter
`/workspaces/:workspace/acp`, gibt jeder Workspace-Runtime einen eigenen
ACP-Dispatcher und Verbindungszustand und lässt die WebShell einen Workspace
aus `/capabilities` wählen. Legacy `/acp` bleibt an die primäre Runtime
gebunden, sodass bestehende WebShell- und ACP-Clients nicht betroffen sind.

Phase 4 umfasst den ACP-Transport (Streamable HTTP + das inverse `/acp`
WebSocket, seine gespiegelten Workspace-Methoden und inverses MCP/CDP). Voice
(`/workspaces/:workspace/voice/stream`) und Daemon-verwaltete Channel-Worker
sind **Phase 4b**; dynamisches Hinzufügen/Entfernen von Workspaces ist
**Phase 5**. Beides liegt hier außerhalb des Umfangs.

Der zentrale Befund der Seam-Untersuchung: Phase 4 ist überwiegend eine
_Verdrahtungs- und Routing-Änderung_, keine Neuimplementierung. `AcpDispatcher`
ist konstruktionsbedingt bereits Workspace-gebunden, sein
`workspaceCwd`-Konsistenz-Check existiert bereits, Phase 3 hat die
gespiegelte REST-Oberfläche bereits Pro-Runtime gemacht, und
`clientMcpSenderRegistry` ist bereits ein Pro-Runtime-Feld. Die eigentliche
Arbeit ist (1) das einzelne ACP-Mount in einen Dispatcher pro Runtime
umzuwandeln (jeder mit eigener Remember-Lane; weiterhin ein einziger
`mountAcpHttp`-Aufruf und ein einziger Upgrade-Listener; ein `AcpHttpHandle`,
der die Registry jeder Runtime besitzt), (2) diesen WebSocket-Upgrade-Listener
so zu erweitern, dass er nach URL-Pfad dispatched, (3) die
Device-Flow-Registry daemon-global zu halten und über alle Mounts zu teilen
(mit Best-effort-Event-Sink-Fan-out zur Bridge jeder vertrauenswürdigen
Runtime), und (4) den neuen `workspace_qualified_acp`-Capability-Tag über die
SDK/CLI-Capability-Types und Tests zu synchronisieren.

## Systematische Überarbeitung (Härtung, PR #6621)

Das Review deckte ein Critical auf: Eine frühere Iteration machte die
Device-Flow-Registry Pro-Runtime, was sekundäre Mounts unauthentifiziert ließ
(`device_flow "not configured"`). Das ACP-Mount wurde entlang von acht Achsen
überarbeitet; die finale Architektur ist:

1. **Runtime-ACP-Mount-Factory.** Ein einziger `mountAcpHttp`-Aufruf besitzt
   einen `primaryMount` plus eine `secondaryMounts`-Map (ein `RuntimeAcpMount`
   pro nicht-primärer Runtime), jeder trägt ein `primary`-Flag. HTTP und WS
   lösen beide ein Mount per Selector auf und delegieren an geteilte Handler.
2. **Routing + Verbindungsisolation.** Der Plural-Selector aliast den primären
   Workspace auf `primaryMount` und löst andernfalls ein Pro-Runtime-Mount auf.
   Nicht vertrauenswürdige Non-Primary-Workspaces werden sowohl auf dem HTTP-
   als auch auf dem WS-Pfad abgelehnt (403), bevor ein Child gespawnt wird.
3. **Raw-Request-Target-WS-Parsing.** Der Upgrade-Listener parst den rohen
   Request-Target (nicht `new URL().pathname`, das `%2e%2e` normalisiert),
   sodass ein nicht-normalisierter Dot-Segment- / Backslash-Selector vor dem
   Routing zerstört wird.
4. **Daemon-globaler Device-Flow + Fan-out.** Die Device-Flow-Registry bleibt
   eine einzelne Daemon-Instanz (OAuth-Credentials sind prozess-global).
   Sekundäre Mounts teilen sie über `opts.deviceFlowRegistry`;
   Auth-Flow-Events fanen best-effort zur Bridge jeder vertrauenswürdigen
   Runtime aus (`resolveEventBridges`).
5. **Primary-only CDP + Client-MCP.** CDP-Tunnel-Claims sind an
   `activeMount.primary` gegated; der Plural-POST gibt das Dispatch-Promise
   zurück.
6. **Disposed-Lifecycle-Gate.** Nach `dispose()` geben die geteilten
   HTTP-Handler `503 server_disposed` zurück, statt während des
   Shutdown-Drains mit abgebauten Registries zu racen. `dispose()` ist
   idempotent.
7. **Aggregierte Observability.** `AcpHttpHandle.getSnapshot()` summiert
   Verbindungs- und WS-Stream-Zählungen über den primären und jeden sekundären
   Mount, sodass Daemon-Metriken die ACP-Verbindungen aller Workspaces melden,
   nicht nur die des primären.
8. **Capability-Advertising.** `resolveAcpHttpEnabled()` ist die einzige
   Interpretation von `QWEN_SERVE_ACP_HTTP`; `workspace_qualified_acp` wird
   nur beworben, wenn die ACP-HTTP-Oberfläche aktiviert ist **und**
   Multi-Workspace-Sessions aktiv sind.

## Post-Review-Seam-Härtung

Die obige Mount-Architektur bleibt unverändert. Der finale Reparaturdurchlauf
schließt sechs Grenz-Lücken, ohne `AcpHttpHandle` zu ersetzen oder ein neues
Routen-Policy-Modul einzuführen.

1. **Eine Qualified-Route-Readiness-Entscheidung.** Workspace-qualifiziertes
   ACP ist nur bereit, wenn ACP-HTTP aktiviert ist und die Workspace-Registry
   mehr als eine Runtime enthält. HTTP-Routen-Registrierung,
   WebSocket-Pfad-Erkennung, Capability-Advertising und die äußere
   Rate-Limiter-Ausnahme müssen mit dieser Entscheidung übereinstimmen.
   Single-Workspace-Daemons exponieren weiterhin nur Legacy `/acp`.
2. **Eine Rate-Limit-Belastung.** Der äußere Express-Limiter nimmt den
   aktivierten `/workspaces/<single-selector>/acp`-Transportpfad exakt aus,
   einschließlich des bestehenden Case- und Trailing-Slash-Verhaltens der
   Route. Benachbarte Pfade bleiben limitiert. Der ACP-Transport bleibt dafür
   verantwortlich, die JSON-RPC-Methoden-Stufe anzuwenden, sodass ein
   qualifizierter Prompt nur den Prompt-Bucket verbraucht statt sowohl den
   Mutations- als auch den Prompt-Bucket.
3. **Strukturierter Fehler bei fehlerhaften Pfaden.**
   Express-Routen-Parameter-Dekodierfehler, die sowohl `URIError`-Instanzen
   sind als auch mit HTTP-Status 400 markiert sind, geben ein strukturiertes
   `400 invalid_request` zurück. Andere geworfene `URIError`-Werte und fremde
   Fehler behalten die generische 500-Behandlung. Der WebSocket-Pfad behält
   seine bestehende explizite 400-Antwort.
4. **Log-sichere Selectors.** Ein dekodierter Selector, der in einem
   betreiberseitigen WebSocket-Ablehnungslog verwendet wird, durchläuft den
   bestehenden `logSafe`-Sanitizer, sodass kodierte Terminal-Steuerzeichen
   keine Stderr-Zeilen fälschen oder splitten können.
5. **Terminale Disposation.** `dispose()` ist ein irreversibler
   Lifecycle-Übergang. Nachdem es lief, kann `attachServer()` keinen
   WebSocket-Server oder Upgrade-Listener neu erzeugen. Wiederholte
   `dispose()`- und `attachServer()`-Aufrufe bleiben harmlos.
6. **Workspace-attribuierte Full-Diagnosen.** Der aggregierte ACP-Snapshot
   erhält additive Verbindungsdiagnosen, die mit `workspaceId`, `workspaceCwd`
   und `primary` dekoriert sind. Summary-Zähler bleiben unverändert, die
   öffentliche primäre `registry` bleibt aus Kompatibilität verfügbar, und
   Daemon-`detail=full` liest die aggregierte Verbindungsliste. Die bestehende
   Verbindungs-Obergrenze bleibt ein Pro-Mount-Limit, weil jedes Mount mit
   derselben konfigurierten Obergrenze konstruiert wird.

Jeder Vertrag wird durch einen Regressionstest fixiert, der vor seiner
Produktionsänderung geschrieben wurde. Die Verifikation umfasst die
fokussierten ACP-, Rate-Limit-, Daemon-Status- und Serve-Server-Suiten plus
Build, Typecheck, Lint und den Serve-Fast-Path-Bundle-Closure-Check.

## Abhängigkeiten von Phase 3 (nicht gemerged)

Phase 4 konsumiert diese Phase-3-Seams. Weil PR #6567 `CHANGES_REQUESTED` ist,
sind sie als _zu stabilisieren_ zu behandeln; die Phase-4-Implementierung muss
auf die gemergte Phase 3 rebasen.

- `packages/cli/src/serve/workspace-route-runtime.ts`:
  - `resolveRegisteredWorkspaceRuntimeByPathSelector(registry, selector)` —
    pure Funktion, gibt `WorkspaceRuntime | undefined` zurück. **Vom
    WS-Upgrade-Listener wiederverwendbar** (siehe Offene Fragen).
  - `resolveWorkspaceRuntimeFromParam(registry, req, res, param)` —
    Express-gebunden (schreibt `res.status().json()`). **Für die HTTP-ACP-Routen
    verwendbar, nicht für den WS-Upgrade-Pfad** (der Upgrade-Listener hat nur
    ein rohes `IncomingMessage` + `socket`, kein Express-`res`).
  - `requireTrustedWorkspaceRuntime(runtime, res)` — Express-gebundenes
    Trust-Gate, wiederverwendet von den HTTP-ACP-Routen.
  - `isPortableAbsolutePath` / `sendWorkspaceMismatch` — wiederverwendet für
    Selector-Parsing und Fehlerform.
- Pro-Runtime-REST-Handler, registriert in `server.ts`
  (`registerWorkspaceQualified{FileRead,FileWrite,Trust,Status,Permissions,Settings,Lifecycle,McpControl,Tools}Routes`).
  Der ACP-Dispatcher spiegelt diese Oberflächen; Phase 4 verlässt sich darauf,
  dass ihr Pro-Runtime-Verhalten existiert.
- `/capabilities` `workspaces[]` (Phase 2a), gebaut in
  `packages/cli/src/serve/routes/capabilities.ts` (L79-84) und gespiegelt in
  `packages/cli/src/serve/daemon-status.ts` (L432-437) mit `id` / `cwd` /
  `primary` / `trusted` pro Runtime. Feature-Flag-Deklarationen und ihre
  Advertise-/Toggle-Prädikate leben in
  `packages/cli/src/serve/capabilities.ts`.

## Baseline: aktueller ACP-Seam (Phase-3-Tree)

- `mountAcpHttp(app, primaryBridge, opts)` in
  `packages/cli/src/serve/acp-http/index.ts` wird einmal aus `server.ts`
  aufgerufen (L1226-1275) mit **durchweg primären** Inputs: `primaryBridge`,
  `primaryBoundWorkspace`, `primaryWorkspace`,
  `primaryRouteFileSystemFactory`, die App-globale `deviceFlowRegistry`,
  `primaryRuntime.clientMcpSenderRegistry` und `primaryRuntime.env` (für die
  Voice-`extraWsRoute`).
- Ein Dispatcher pro Mount: `mountAcpHttp` baut einen einzelnen
  `AcpDispatcher` und eine einzelne `ConnectionRegistry` und gibt einen
  `AcpHttpHandle` zurück, dessen `registry` diese einzelne Registry ist und
  dessen `attachServer` genau einen `httpServer.on('upgrade', ...)`-Listener
  installiert (index.ts L1536, L1555). `dispose` entfernt diesen einen
  Listener und schließt diese eine Registry (index.ts L1543-1553).
- **Einzelner WebSocket-Upgrade-Listener** (index.ts `setupWebSocket`,
  Upgrade-Handler bei L903-1045). Er wird einmal über
  `AcpHttpHandle.attachServer(server)` nach `listen()` installiert. Er:
  - parst die Upgrade-URL,
  - lehnt jeden Pfad ab, der nicht `opts.path` (`/acp`), nicht `/cdp` und
    kein `extraWsRoutes`-Eintrag ist — `socket.destroy()` bei unbekanntem Pfad
    (index.ts L935-939),
  - führt geteilte Sicherheitsprüfungen aus (Loopback, Host-Allowlist,
    CSRF/Origin, Bearer-Token) für **alle** Pfade,
  - verzweigt dann: `/cdp` -> `attachCdpClient`; `extraRoute` ->
    `onConnection`; sonst der ACP-Initialize-Handshake.
  - Der Doc-Kommentar bei L328-337 ist explizit: Ein zweiter
    `'upgrade'`-Listener kann nicht koexistieren, weil dieser hier unbekannte
    Pfade zerstört. Phase 4 muss diesen einen Listener erweitern, keinen
    weiteren hinzufügen.
- `AcpDispatcher` (dispatch.ts L644-656) ist konstruktionsbedingt bereits
  Workspace-gebunden: `bridge`, `boundWorkspace`, `workspace`,
  `workspaceRememberLane`, `fsFactory?`, `deviceFlowRegistry?`,
  `sessionShellCommandEnabled`, `registry?`, `archiveCoordinator`. Jede
  gespiegelte Workspace-Methode, die er bedient, liest diese Felder, sodass
  das Binden eines Dispatchers an eine Runtime automatisch File / Permissions
  / Settings / Trust / Tools / Mcp / Memory / Agents / Auth auf diese Runtime
  scoped.
- Zwei dieser Dispatcher-Dependencies sind heute als Einzelinstanz an Primary
  gebunden: `workspaceRememberLane = new
  WorkspaceRememberTaskLane(primaryBridge)` (server.ts L816) und
  `archiveCoordinator = new SessionArchiveCoordinator()` (server.ts L596).
  `sessionShellCommandEnabled` ist eine globale Policy, sicher teilbar.
- Konsistenz-Check existiert bereits: `parseRequestedWorkspace` (dispatch.ts
  L694-697) wirft `WorkspaceMismatchError`, wenn das `workspaceCwd` eines
  Requests nicht `this.boundWorkspace` entspricht; der Fehler wird auf
  `INVALID_PARAMS` abgebildet (L577).
- `WorkspaceRuntime` (workspace-registry.ts L28-38) trägt
  `clientMcpSenderRegistry` pro Runtime, hat aber **kein
  `deviceFlowRegistry`-Feld** — Device-Flow ist weiterhin App-global
  (`setupDeviceFlowRegistry({ app, bridge })` in server.ts L609, gebunden an
  die primäre Bridge).

## Architektur: Pro-Runtime-ACP-Mount

Option B beibehalten: ein Daemon, N unabhängige Workspace-Runtimes. Für ACP:

- Jede registrierte Runtime erhält einen eigenen `AcpDispatcher` +
  `ConnectionRegistry` + Reverse-MCP-Provider-Factory, alle gebunden an die
  `bridge` / `workspace` / `routeFileSystemFactory` /
  `clientMcpSenderRegistry` / `env` dieser Runtime. Jeder Dispatcher erhält
  dieselbe daemon-globale Device-Flow-Registry.
- Legacy `/acp` bleibt an den Dispatcher der primären Runtime gebunden
  (unverändertes Wire-Verhalten).
- Das neue `/workspaces/:workspace/acp` bindet an den Dispatcher der
  aufgelösten Runtime.
- **Invariante: `mountAcpHttp` wird weiterhin genau einmal aufgerufen** und
  installiert genau einen `httpServer.on('upgrade', ...)`-Listener. Es ändert
  sich von „Single Bridge + Opts" zur Akzeptanz der `WorkspaceRegistry` (plus
  geteilte, nicht-Workspace-Belange: Token, allowedOrigins, Hostname,
  `checkRate`, `sessionShellCommandEnabled`, `cdpTunnelRegistry`). Intern baut
  es eine `Map<workspaceId, RuntimeAcpMount>`; der primäre Eintrag bleibt über
  den Legacy-`/acp`-Pfad adressierbar.
- Jedes `RuntimeAcpMount` wird mit der eigenen `bridge`, `workspace`,
  `routeFileSystemFactory`, `clientMcpSenderRegistry`, `env` dieser Runtime
  konstruiert, einer neuen Pro-Runtime-`WorkspaceRememberTaskLane(runtime.bridge)`,
  ihrem `AcpDispatcher` und ihrer `ConnectionRegistry`. Die daemon-globale
  Device-Flow-Registry, `archiveCoordinator` und `sessionShellCommandEnabled`
  werden geteilt.
- Alle vier Dispatch-Einstiegspunkte müssen das Mount der aufgelösten Runtime
  wählen, nicht das primäre: `POST`, `GET` (SSE) und `DELETE` auf dem
  Plural-Pfad (Express, via `resolveWorkspaceRuntimeFromParam`; heute schließt
  jeder über den einzelnen Dispatcher bei index.ts L533/L675/L849 ab), plus der
  WS-Upgrade-Zweig (unten). Legacy `/acp` POST/GET/DELETE/Upgrade dispatched
  weiterhin an Primary.
- `AcpHttpHandle` muss von einer einzelnen `registry` anwachsen zum Besitz der
  Dispatcher + `ConnectionRegistry` jeder Runtime; `dispose` schließt alle und
  entfernt den einzelnen Upgrade-Listener.
- Session-Lifecycle: ACP `session/new` / `load` / `resume` auf einem
  Plural-Mount muss dieselben Bridge-Lifecycle-`register` / `remove`-Callbacks
  feuern, die den Phase-2b-`WorkspaceSessionOwnerIndex` speisen
  (workspace-registry.ts L48-119). Eine über `/workspaces/B/acp` erzeugte
  Session muss dann durch REST-Owner-geroutete Reads (Context, Stats usw.)
  auffindbar sein und umgekehrt. Phase 2b hat diesen Index bereits scoped, um
  „REST und den späteren ACP-Dispatcher" abzudecken; Phase 4 ist der Punkt, an
  dem die ACP-Seite tatsächlich verdrahtet wird.

## WebSocket-Upgrade-Dispatch (Kerndesign)

Der Upgrade-Listener ist der eine Ort, an dem ACP-Routing nicht
Express-getrieben ist, daher braucht er explizite Pfadbehandlung.

- Die geteilten Sicherheitsprüfungen (Loopback / Host-Allowlist / CSRF /
  Bearer) exakt so belassen, einheitlich angewendet vor jeder
  Workspace-Auflösung.
- Pfadklassifikation erweitern. Heute: `pathname === '/acp' | '/cdp' |
  extraRoute`. Phase 4 fügt einen Zweig für `/workspaces/:workspace/acp`
  hinzu:
  1. Präfix matchen und das rohe `:workspace`-Selector-Segment extrahieren.
  2. Auflösen mit der puren Funktion
     `resolveRegisteredWorkspaceRuntimeByPathSelector(registry, decodeURIComponent(selector))`
     (Id-zuerst, dann kodierte kanonische cwd, passend zum REST-Resolver).
  3. Bei keinem Treffer: den Upgrade mit einem 400er-Close ablehnen
     (`socket.write('HTTP/1.1 400 ...')` + `destroy()`), analog zum
     REST-`workspace_mismatch`. Kein Fallback auf Primary.
  4. Bei Treffer: den ACP-Initialize-Handshake gegen den Dispatcher +
     `ConnectionRegistry` der aufgelösten Runtime ausführen (nicht die
     primären).
- Inverses `/cdp` und Voice-`extraWsRoutes` bleiben in Phase 4
  Primary-gebunden (Voice ist 4b). Der `/cdp`-Zweig ist unverändert.
- Legacy-`/acp`-Upgrade bindet weiterhin an den primären Dispatcher.
- `%2F` im kodierten cwd-Selector: Der Daemon parst die rohe Upgrade-URL
  selbst (`new URL(req.url, ...)`), unterliegt also nicht dem
  Express-Pfad-Decoding, aber Reverse-Proxys könnten `%2F` dennoch
  normalisieren. Für WS in Proxy-Deployments wird der `id`-basierte Selector
  empfohlen (dieselbe Empfehlung wie bei Phase 2b/3 REST). Die
  HTTP-Plural-Routen verwenden stattdessen `resolveWorkspaceRuntimeFromParam`
  wieder, das `req.params` liest (Express dekodiert einmal), sodass sie die
  Phase-3-Behandlung kodierter Selectors gratis erben.
- Observability: Der WS-Upgrade-Pfad und sein ACP-Dispatch umgehen
  Express-Middleware, daher muss die Daemon-Telemetrie/-Logging den
  aufgelösten Workspace hier explizit stempeln (derselbe Grund, warum
  `checkRate` über `opts` durchgereicht wird); das
  Phase-1-Request-Zeit-Workspace-Hashing deckt nur Express-Routen ab.

## Pro-Runtime-Device-Flow-Registry (ersetzt — siehe „Systematische Überarbeitung" Achse 4)

> **Ersetzt.** Dieser Abschnitt ist das Pre-Rework-Design (eine
> Pro-Runtime-Device-Flow-Registry). Das Review stellte fest, dass sie
> sekundäre Mounts unauthentifiziert ließ, daher behält die ausgelieferte
> Implementierung stattdessen eine einzelne daemon-globale Registry, geteilt
> von jedem Mount mit Best-effort-Event-Sink-Fan-out — siehe Achse 4 der
> „Systematischen Überarbeitung" oben. Die Unterabschnitte unten bleiben nur
> als Design-Historien-Kontext erhalten und beschreiben nicht das
> ausgelieferte Verhalten.

Device-Flow ist die eine gespiegelte Oberfläche, die noch App-global ist und
sich ändern muss.

- `deviceFlowRegistry` zu `WorkspaceRuntime` hinzufügen (oder eine pro Runtime
  innerhalb von `mountAcpHttp` bauen). Der Dispatcher jeder Runtime erhält
  seine eigene Registry.
- `setupDeviceFlowRegistry` muss pro Runtime aufgerufen werden (gebunden an
  Bridge/Env dieser Runtime), nicht einmal gegen die primäre Bridge.
- Workspace-qualifizierte Auth-Routen/-Methoden
  (`GET/DELETE /workspaces/:workspace/auth/device-flow/:id` und die
  ACP-`_qwen/workspace/auth/device_flow/*`-Methoden) müssen die Registry der
  Ziel-Runtime auflösen und Flows ablehnen/verbergen, die zu einem anderen
  Workspace gehören.
- Shutdown muss die Registry jeder Runtime disposen, nicht nur
  `app.locals.deviceFlowRegistry`.
- Auth-Provider-Install-Callbacks sind innerhalb des Dispatchers bereits
  `boundWorkspace`-scoped; Pro-Runtime-Dispatcher machen dies automatisch
  korrekt. Legacy-Primary-Auth-Routen schreiben weiterhin auf Primary.

## Dispatcher-Spiegelfläche (Runtime-Bindung)

Das inverse `/acp`-WS spiegelt eine große REST-Oberfläche (index.ts
`WS_READ_METHODS` L186-219 und dispatch.ts Vendor-Methoden): File
read/list/glob/stat, Workspace mcp / skills / providers / env / preflight /
trust / permissions / voice / tools / agents / memory / auth, Session-Gruppen,
setup-github. Weil all diese die Konstruktorfelder des Dispatchers lesen,
scoped das Binden eines Dispatchers an eine Runtime sie gratis. Phase 4
implementiert sie **nicht** neu; es stellt nur sicher, dass der Dispatcher
jeder Runtime mit den Dependencies dieser Runtime konstruiert wird. Diese
Menge enthält explizit die Pro-Runtime-`deviceFlowRegistry` und
`WorkspaceRememberTaskLane`: Wenn eine von beiden als Primary-Singleton
verbleibt, würden Non-Primary-`_qwen/workspace/memory/remember`- und
`auth/device_flow`-Aufrufe stillschweigend gegen die primäre Bridge laufen.

Konsistenzgarantie: Da jedes gemountete Dispatcher Runtime-gebunden ist und
`parseRequestedWorkspace` bereits `WorkspaceMismatchError` wirft, wenn das
`workspaceCwd` eines Requests sich von `boundWorkspace` unterscheidet, wird
ein Client, der sich mit `/workspaces/A/acp` verbindet, aber `workspaceCwd: B`
in Params sendet, abgelehnt. Phase 4 sollte einen Test hinzufügen, der dies
assertet, und bestätigen, dass derselbe Guard `session/new` abdeckt
(`parseOptionalWorkspaceCwd`, dispatch.ts L1059).

## Inverse MCP-/CDP-Isolation

- Inverser Tool-Channel: Die `clientMcpProviderFactory` schließt aktuell über
  `primaryRuntime.clientMcpSenderRegistry` + `primaryBridge` ab (server.ts
  L1252-1257). Pro-Runtime-Mounts bauen die Factory aus der
  _aufgelösten Runtime_ `clientMcpSenderRegistry` + `bridge`, sodass eine
  WS-Verbindung auf `/workspaces/B/acp` Client-gehostete MCP-Server nur in Bs
  Runtime registriert.
- Pro-Verbindungs-`ClientMcpWsConnection` und `cdpEndpoint` bleiben
  Pro-Verbindung; sie heften sich einfach an den Dispatcher der besitzenden
  Runtime.
- CDP-Tunnel: `cdpTunnelRegistry` ist prozess-scoped und die CDP-Bridge wird
  von einer Extensions-`/acp`-Verbindung mit `clientInfo.name ===
  'qwen-cdp-bridge'` geclaimed. Phase 4 behält CDP-Claiming auf Legacy `/acp`
  (Primary) als pragmatischen Default; Workspace-scoped CDP wird als Offene
  Frage ausgewiesen statt hier gelöst, weil ein einzelner
  Loopback-Puppeteer-Client + ein `/cdp`-Endpunkt sich nicht sauber auf N
  Runtimes abbildet. Konkret müssen Non-Primary-`RuntimeAcpMount`s den
  `cdpTunnelOverWs` / `/cdp`-Zweig und die `chrome-devtools`-Runtime-MCP-Registrierung
  ausgeschaltet lassen; nur das primäre Mount verdrahtet sie.

## Trust-Gate

- Nicht vertrauenswürdige registrierte Workspaces bleiben
  sichtbar/read-only, dürfen aber kein Child spawnen. Auf
  `/workspaces/:workspace/acp` müssen die Ownership-vergebenden Operationen
  (`session/new`, `session/load`, `session/resume`; dispatch.ts
  `CONN_ROUTED_METHODS` L239-243) mit einem `untrusted_workspace`-Fehler
  ablehnen und nicht spawnen, passend zur REST-403-`untrusted_workspace`-Semantik,
  die bereits in `routes/session-runtime.ts` (L39-53) und `routes/session.ts`
  implementiert ist (Session-create/load/resume-Trust-Gates plus
  `session_workspace_conflict`).
- Die Trust-Entscheidung wiederverwenden, die Phase 3 über
  `requireTrustedWorkspaceRuntime` für die HTTP-ACP-Routen exponiert; für den
  WS-Pfad läuft die äquivalente Prüfung auf dem `trusted`-Flag der aufgelösten
  Runtime, bevor der Handshake eine Session gewährt.
- Boot-eingefrorener Trust ist die Phase-2a-Baseline; Runtime-Trust-Flips
  (ACP-Child des Workspaces drainen/stoppen + seinen Session-Index bei Revoke
  leeren) bleiben auf diejenige Trust-Mutations-Phase ausgerichtet, die landet,
  und werden hier nicht neu implementiert.

## Capabilities und WebShell-Picker

- Einen ACP-Feature-Flag (z. B. `workspace_qualified_acp`) in
  `packages/cli/src/serve/capabilities.ts` hinzufügen (Flag-Deklaration +
  Advertise-/Toggle-Prädikat), nur beworben, wenn mehr als eine Runtime
  registriert ist und ACP aktiviert ist (das `multi_workspace_sessions`-Gating
  in capabilities.ts L408-409 spiegeln). Wenn Phase 4 über mehrere PRs
  landet, den Tag nicht bewerben, bis die vollständige Plural-ACP-Schleife
  (HTTP + WS + Device-Flow + Owner-Index-Verdrahtung) komplett ist, damit
  Clients nie `/workspaces/:id/acp`-URLs gegen eine halb verdrahtete
  Oberfläche bauen (dieselbe Halb-aktiviert-Guard-Philosophie wie das
  Phase-2a-Feature-Gate). Den Hinweis zu `workspace_qualified_rest_core`
  (L264-271) aktualisieren, der aktuell sagt „ACP/WebSocket, auth, voice, and
  extensions stay on their existing primary-workspace routes in this phase."
- Den Tag hinzuzufügen ist nicht lokal auf `capabilities.ts`. Er muss
  synchronisiert werden zu: dem `/capabilities`-Response-Builder in
  `routes/capabilities.ts`, den SDK-Capability-Types
  (`packages/sdk-typescript/src/daemon/types.ts`), den CLI-Serve-Types
  (`packages/cli/src/serve/types.ts`) und der Feature-Set-Assertion in
  `server.test.ts` (L376-381). Dies ist erforderliche Phase-4-Arbeit, nicht
  optional.
- `workspaces[]` existiert bereits (Phase 2a), gebaut in
  `routes/capabilities.ts` (L79-84) und `daemon-status.ts` (L432-437) mit
  `id` / `cwd` / `primary` / `trusted` pro Runtime. Die WebShell liest es und
  baut `/workspaces/:id/acp`-Verbindungs-URLs; der Picker deaktiviert (oder
  markiert read-only) nicht vertrauenswürdige Einträge.
- Der SDK-`DaemonClient` (hinzugefügt in Phase 3) liest bereits
  `caps.workspaces[].cwd` für Session-Routing; ein Workspace-qualifizierter
  ACP-Connect-Helfer ist die natürliche Erweiterung. Der obige
  Capability-Type-Sync ist erforderlich; der Connect-Helfer selbst kann
  folgen.

## Fehlerpfade

- `workspace_mismatch`: unbekannter WS/HTTP-Selector -> 400er-Ablehnung; nie
  auf Primary zurückfallen.
- `untrusted_workspace`: Ownership-vergebende ACP-Operation auf einer nicht
  vertrauenswürdigen Runtime -> Ablehnung, kein Spawn.
- `workspaceCwd`-Parameter-Mismatch: `WorkspaceMismatchError` ->
  `INVALID_PARAMS` (bereits verdrahtet).
- Child-Crash: isoliert auf die besitzende Runtime; Dispatcher und
  Verbindungen anderer Runtimes sind nicht betroffen (größerer
  Single-Daemon-Auswirkungsradius ist eine dokumentierte bekannte
  Einschränkung).
- Trust revoked: Wenn eine Trust-Mutations-Phase landet, muss das Revoken
  einer Runtime ihr ACP-Child drainen/stoppen und ihren Session-Index leeren;
  Phase 4 garantiert nur, dass das Pro-Runtime-ACP-Mount drainbar ist, es fügt
  selbst keine Trust-Mutation hinzu.
- Globaler Shutdown: Die `ConnectionRegistry` jeder Runtime disposen, dann die
  einzelne daemon-globale Device-Flow-Registry einmal disposen.
- Rate-Limiting: ACP-HTTP/WS-Admission verwendet `checkRate`, gekeyed pro
  Verbindung/Session (index.ts L627-641, L1175-1178). Die Plural-Mounts
  teilen den einen Limiter; Keys müssen über Runtimes hinweg eindeutig
  bleiben, damit ein Workspace nicht das Budget eines anderen ausschöpfen oder
  umgehen kann.
- Kapazität: `maxConnections` wird pro Runtime-`ConnectionRegistry` erzwungen,
  sodass die gesamten ACP-Verbindungen auf N x `maxConnections` skalieren
  (ein Pro-Workspace-Budget, passend zum Pro-Workspace-`maxSessions`-Modell).
  Die Fresh-Session-Gesamtzahl bleibt durch die
  Phase-2a-`maxTotalSessions`-Admission an der Bridge-Seam begrenzt, die die
  ACP-Session-Erzeugung bereits durchläuft.

## Nicht-Ziele (Phase 4b / 5)

- `/workspaces/:workspace/voice/stream` und Pro-Workspace-Voice-Settings (4b).
- Daemon-verwaltete Channel-Worker-Gruppierung / Pidfile / Status (4b).
- Dynamisches Workspace-Hinzufügen/-Entfernen und Lazy-Runtime-Erzeugung (5).

## Teststrategie

- WS-Upgrade-Dispatch: Pfadklassifikation unit-testen — `/acp` (primary),
  `/workspaces/:id/acp` (aufgelöst), unbekannter Selector (Ablehnung),
  `%2F`-kodierter cwd-Selector, und dass die geteilten Sicherheitsprüfungen
  weiterhin für den Plural-Pfad laufen.
- Workspace-übergreifende Isolation: Eine Verbindung auf `/workspaces/A/acp`
  kann eine von B besessene Session weder sehen noch steuern; `session/list`
  und gespiegelte Reads geben nur As Sicht zurück.
- Transport-übergreifender Besitz: Eine über `/workspaces/B/acp` erzeugte
  Session ist durch REST-Owner-geroutete Reads (z. B.
  `GET /session/:id/stats`) und durch `resolveLiveSessionOwner` auflösbar,
  was bestätigt, dass ACP-Erzeugung den Owner-Index speist.
- Konsistenz: mit A verbinden, `workspaceCwd: B` senden ->
  `WorkspaceMismatchError`.
- Trust-Gate: `session/new|load|resume` auf einer nicht vertrauenswürdigen
  Runtime -> abgelehnt, kein Child-Spawn.
- Device-Flow: jedes Mount erreicht die daemon-globale Registry;
  Event-Publikation fant zu primären und vertrauenswürdigen sekundären
  Bridges aus, eine fehlschlagende Bridge blockiert die anderen nicht, und
  Shutdown disposed die Registry einmal.
- Inverse MCP: `mcp_register` auf `/workspaces/B/acp` landet nur in Bs
  `clientMcpSenderRegistry` und Bs Bridge.
- Rate-Limiting: Prompts/Mutationen auf `/workspaces/A/acp` und
  `/workspaces/B/acp` werden unabhängig bemessen und keines kann den
  geteilten Limiter umgehen.
- Capabilities: `workspace_qualified_acp` nur mit >1 Runtime beworben;
  `workspaces[]`-Form unverändert.

## Offene Fragen / Feedback an Phase 3

1. **`resolveRegisteredWorkspaceRuntimeByPathSelector` als pure Funktion
   behalten.** Der WS-Upgrade-Listener kann das Express-gebundene
   `resolveWorkspaceRuntimeFromParam` nicht verwenden. Phase 4 hängt davon ab,
   dass der pure Resolver frei von `req`/`res`-Kopplung bleibt. Wenn das
   Phase-3-Review diesen Seam ändert, einen puren `(registry, selector) =>
   runtime | undefined`-Einstiegspunkt bewahren.
2. **Device-Flow-Ownership (geklärt).** Die Registry daemon-global halten,
   weil OAuth-Credentials prozess-global sind. Phase 4 teilt diese Registry
   mit jedem Dispatcher und fant bereinigte Events zu vertrauenswürdigen
   Runtime-Bridges aus.
3. **CDP-Tunnel-Pro-Workspace-Modell.** Ein Loopback-Puppeteer-Client + ein
   `/cdp`-Endpunkt bildet sich nicht sauber auf N Runtimes ab. Phase 4 behält
   CDP auf Primary; bestätigen, dass das akzeptabel ist, oder ein
   Workspace-qualifiziertes CDP-Follow-up scopieren.
4. **Voice-Verschiebung.** Bestätigen, dass Voice bis Phase 4b Primary-only
   bleibt, obwohl der ACP-Dispatcher bereits
   `_qwen/workspace/voice`-Reads exponiert.
5. **`archiveCoordinator`-Umfang.** Es ist heute ein einzelner
   `SessionArchiveCoordinator` (server.ts L596). Bestätigen, dass das Teilen
   über Runtimes hinweg sicher ist angesichts Phase 3s
   Workspace-qualifiziertem Archive/Organisation, oder ihn Pro-Runtime machen.
6. **Rate-Limit-Key-Dimensionierung.** Entscheiden, ob
   ACP-Plural-Admission-Keys eine explizite Workspace-Dimension benötigen oder
   ob Pro-Verbindungs-/Session-Keys über Mounts hinweg bereits eindeutig sind.
