# DaemonTransport Abstraktionsebene

> Ziel-Branch: `main`. Autor: arno.gao. Datum: 2026-06-12. Status: **Design v4 — review**.
> Design-First per Repository-Workflow: Dieses Dokument landet vor dem Implementierungs-PR.

---

## 0. TL;DR

`DaemonClient` verwendet festcodiert REST+SSE. Drittanbieter-Integrationen, die ACP WebSocket nutzen möchten, müssen den Provider-Stack forken (~8 Dateien). Dieser Vorschlag fügt ein **`DaemonTransport`-Interface** mit den Methoden `fetch` + `subscribeEvents` hinzu, plus automatische Erkennung und Laufzeit-Fallback, was steckbare Transporte ohne **breaking changes** ermöglicht.

**Gesamtänderung: ~1300 Zeilen** in einem einzigen Implementierungs-PR. Vorhandene Nutzer bleiben unberührt – `new DaemonClient({ baseUrl, token })` = aktuelles Verhalten.

---

## 1. Hintergrund

### 1.1 Aktuelle Architektur

```
DaemonClient({ baseUrl, token })
  └─ this._fetch = globalThis.fetch     ← festcodiert
  └─ subscribeEvents → GET /session/:id/events → parseSseStream → DaemonEvent
```

67 öffentliche Methoden, die jeweils REST-URLs konstruieren und auf HTTP-Statuscodes verzweigen. `fetch` ist bereits über `DaemonClientOptions.fetch` injizierbar, aber `subscribeEvents` enthält SSE-spezifische Logik (Inhaltstyp-Prüfung, SSE-Parsing, Verbindungsaufbau-Timeout), die allein durch Fetch-Injektion nicht austauschbar ist.

### 1.2 Das Problem für Drittanbieter

Wenn ein Drittanbieter (z. B. `agent-web`) einen `AcpSessionProvider` baut, um WebSocket statt REST+SSE zu nutzen:

- **Wenn er** `DaemonSessionProvider` **ersetzt**: Komponenten, die `DaemonStoreContext` lesen (z. B. TerminalView), verlieren ihren Kontext → Absturz.
- **Wenn er beide Provider behält**: Zwei Ereignisquellen, zwei Stores, Desynchronisation.
- **Wenn er Ereignisse** in den SDK-Store injiziert: `DaemonSessionProvider` abonniert intern ebenfalls SSE → doppelte Ereignisse.

**Ursache**: Der Transportwechsel erfordert den Austausch des Providers, weil `DaemonClient`'s `subscribeEvents` fest auf SSE codiert ist.

### 1.3 Ziel

```
DaemonClient({ transport: new AcpWsTransport(url, token) })
  └─ transport.fetch → mapped URL+Verb auf JSON-RPC über WS
  └─ transport.subscribeEvents → demultiplext WS-Benachrichtigungen → DaemonEvent
```

Ein Provider, ein Store, der Transport ist ein internes Detail. Drittanbieter übergeben `transport` an `DaemonClient`; alles andere funktioniert unverändert.

---

## 2. Design

### 2.1 Interface

```typescript
interface DaemonTransportFetchOptions {
  timeout?: number; // 0 = no timeout. undefined = transport default.
}

interface DaemonTransportSubscribeOptions {
  lastEventId?: number;
  maxQueued?: number;
  signal?: AbortSignal;
  connectTimeoutMs?: number;
}

interface DaemonTransport {
  /**
   * Send a request and return a Response.
   *
   * Contract:
   * - Response MUST support .json(), .text(), .ok, .status,
   *   .headers.get(), .body?.cancel()
   * - .status MUST be an accurate HTTP status code
   *   (200, 201, 202, 204, 404, etc.)
   * - Error bodies MUST preserve the daemon's structured shape
   * - Callable without prior setup; transport handles init internally
   *   (lazy-init / init-once deferred pattern)
   * - Throws DaemonTransportClosedError when connection is dead
   * - When init.signal aborts: for prompt requests, transport MUST
   *   cancel the in-flight prompt on the wire (WS: send session/cancel
   *   RPC; HTTP: abort fetch). For ordinary requests, abort only
   *   rejects/cancels the pending request without side effects.
   *   Pending response rejects with AbortError.
   */
  fetch(
    url: string,
    init: RequestInit,
    opts?: DaemonTransportFetchOptions,
  ): Promise<Response>;

  /**
   * Subscribe to session events.
   *
   * Contract:
   * - Events with id MUST have monotonic integer ids; synthetic/terminal
   *   frames (e.g., stream_error) MAY omit id (DaemonEvent.id is optional)
   * - MUST deliver ALL event types (session + workspace) in one stream
   * - Aborting signal MUST stop only this generator, NOT the connection
   * - When the connection dies, all pending generators MUST throw
   *   DaemonTransportClosedError (transport maintains generator refs)
   * - MUST apply connectTimeoutMs to connect phase only
   * - Transport MUST declare whether lastEventId replay is supported;
   *   if not, consumer MUST use session/load for full resync on reconnect
   */
  subscribeEvents(
    sessionId: string,
    opts: DaemonTransportSubscribeOptions,
  ): AsyncGenerator<DaemonEvent>;

  /** Transport identity for exhaustive switching. */
  readonly type: 'rest' | 'acp-http' | 'acp-ws';

  /** Whether this transport supports Last-Event-ID based replay on reconnect.
   *  When false, consumer MUST use session/load for full resync. */
  readonly supportsReplay: boolean;

  /** False after connection drop or dispose(). */
  readonly connected: boolean;

  /** Idempotent teardown. */
  dispose(): void;
}

class DaemonTransportClosedError extends Error {}
```

### 2.2 Warum zwei Methoden (fetch + subscribeEvents) und nicht nur fetch

`subscribeEvents` hat grundlegend unterschiedliche Drahtsemantiken pro Transport:

| Transport | Drahtmechanismus                                                                 |
| --------- | -------------------------------------------------------------------------------- |
| REST      | `GET /session/:id/events` → SSE → `parseSseStream` → `DaemonEvent`                |
| ACP HTTP  | `GET /acp` (session-bezogenes SSE) → JSON-RPC-Benachrichtigung entpacken           |
| ACP WS    | Demultiplext Benachrichtigungen vom gemeinsamen Socket nach sessionId               |
Diese durch ein Fetch-förmiges Loch zu zwingen erfordert SSE-Neu- und -Dekodierung (WS → fake SSE text → `parseSseStream` → DaemonEvent) — aufwändig und fehleranfällig.

Alle anderen 66 Methoden arbeiten über `fetch`, da sie unabhängig vom Transport Request→Response-Semantiken folgen.

### 2.3 Warum auf Fetch-Ebene, nicht Methoden-Dispatch

Die 67 Methoden von DaemonClient enthalten HTTP-Verzweigungen pro Methode:

- `prompt()`: 202 vs 200 Statusprüfung
- `deleteWorkspaceAgent()`: 204 vs 404 mit Prüfung des Bodies
- `respondToPermission()`: 200 vs 404 zur Erkennung von Race Conditions
- 6 Methoden umgehen `fetchWithTimeout`, indem sie direkt `_fetch` aufrufen

Ein Methoden-Dispatch-Interface (`request<T>(method, params)`) würde erzwingen, diese Logik in jedem Transport zu duplizieren. Die Fetch-Ebene hält DaemonClient unverändert.

### 2.4 Änderungen an DaemonClient (~40 Zeilen)

```typescript
export interface DaemonClientOptions {
  baseUrl: string;
  token?: string;
  fetch?: typeof globalThis.fetch; // Kept
  fetchTimeoutMs?: number; // Kept
  transport?: DaemonTransport; // NEW — optional override
}
```

Interne Änderungen:

- Konstruktor: `this.transport = opts.transport ?? new RestSseTransport(...)`
- `fetchWithTimeout`: Delegiert an `this.transport.fetch(url, init, { timeout })`
- 6 direkte `this._fetch`-Aufrufe (prompt, promptNonBlocking, recapSession,
  btwSession, shellCommand, subscribeEvents): Ersetzen durch
  `this.transport.fetch(url, init, { timeout: 0 })`
- `subscribeEvents`: Erschöpfender Switch über `this.transport.type`:
  - `'rest'`: Delegiert an `this.transport.subscribeEvents(sessionId, opts)`
  - default: Gleiche Delegation (jeder Transport behandelt sein eigenes Wire-Format)
- `private _fetch`-Feld entfernen (durch Transport ersetzt)

### 2.5 Einspeisepunkt für Provider

`DaemonWorkspaceProvider` und `DaemonSessionProvider` konstruieren beide intern `DaemonClient`. Um Drittanbietern zu ermöglichen, einen Transport ohne Umgehung des Providers zu injizieren:

```typescript
// DaemonWorkspaceProvider — add optional transport prop
interface DaemonWorkspaceProviderProps {
  baseUrl: string;
  token?: string;
  transport?: DaemonTransport; // NEW — forwarded to DaemonClient
  // ...existing props
}

// DaemonSessionProvider — inherit from workspace context
// No transport prop needed; reads from workspace context
```

Wenn `transport` angegeben ist, übergibt der Provider ihn an `DaemonClient`:

```typescript
new DaemonClient({ baseUrl, token, transport: props.transport });
```

Wenn nicht angegeben: aktuelles Verhalten (REST+SSE). ~5 Zeilen Änderung am Provider.

### 2.5 RestSseTransport (~80 Zeilen)

Kapselt `globalThis.fetch` + extrahiert die aktuelle SSE-Logik aus `DaemonClient.subscribeEvents`:

```typescript
class RestSseTransport implements DaemonTransport {
  readonly type = 'rest' as const;
  readonly supportsReplay = true; // SSE supports Last-Event-ID
  readonly connected = true; // REST is stateless

  constructor(
    private readonly baseUrl: string,
    private readonly token: string | undefined,
    private readonly _fetch: typeof globalThis.fetch,
  ) {}

  fetch(url, init, opts?) {
    return this._fetch(url, init);
  }

  async *subscribeEvents(sessionId, opts) {
    // Current DaemonClient.subscribeEvents logic moved here:
    // - build URL from this.baseUrl + sessionId
    // - set Authorization header from this.token
    // - connect-phase timeout from opts.connectTimeoutMs
    // - fetch → validate content-type → parseSseStream → yield
  }

  dispose() {} // no-op
}
```

### 2.6 Interna des ACP-Transports

**AcpWsTransport** (~400-600 Zeilen):

- Lazy-Init: Erster `fetch`-Aufruf öffnet WS und sendet `initialize`
- URL→JSON-RPC-Zuordnungstabelle: `/session/:id/prompt` → `{method: "session/prompt", params: {sessionId: id, ...body}}`
- Request-Multiplexer: `Map<id, {resolve, reject}>` für ausstehende Anfragen
- `subscribeEvents`: Filtert den gemeinsamen Benachrichtigungsstream nach sessionId
- `connected`: Verfolgt den WS readyState
- `supportsReplay`: false (WS hat kein Last-Event-ID; Konsument muss `session/load` aufrufen)
- Synthetisiert `Response`-Objekte mit korrektem `.status`/`.json()`/`.text()`

**AcpHttpTransport** (~800-1000 Zeilen):

- Lazy-Init: Erster `fetch`-Aufruf sendet `POST /acp {initialize}`
- Verwaltet intern verbindungsbezogene + sitzungsbezogene SSE-Streams
- Gleiche URL→JSON-RPC-Zuordnung + Request-Korrelation
- `supportsReplay`: true (Session-SSE unterstützt Last-Event-ID)

### 2.7 Automatische Erkennung des Transports

Der Server bewirbt unterstützte Transporte in `GET /capabilities`:

```json
{
  "transports": ["rest+sse", "acp-http+sse", "acp-ws"],
  ...existing capabilities fields...
}
```

Das SDK bietet eine einmalige statische Factory:

```typescript
// Probe once before React render, never switches mid-session
const transport = await DaemonTransport.negotiate(baseUrl, token);
// Returns best available: acp-ws > acp-http > rest (fallback)
```

Implementierung:

1. `GET /capabilities` → Array `transports` auslesen
2. Wenn `acp-ws` in der Liste → WS-Upgrade versuchen; bei Erfolg `AcpWsTransport` zurückgeben
3. Wenn WS fehlschlägt oder nicht in der Liste → `acp-http` versuchen; bei Erfolg `AcpHttpTransport` zurückgeben
4. Fallback → `RestSseTransport`

Keine bestehende API wird beeinträchtigt: `GET /capabilities` fügt ein neues Feld hinzu (additiv), bestehende Konsumenten ignorieren unbekannte Felder.
### 2.8 Runtime-Fallback (WS → REST bei Verbindungsabbruch)

Wenn ein nicht-REST-Transport während einer laufenden Sitzung die Verbindung verliert:

```
AcpWsTransport (connected=true)
  │
  ├── WS bricht ab (Netzwerk, Server-Neustart, Leerlauf-Timeout)
  │
  ├── connected = false
  ├── Alle ausstehenden fetch()-Aufrufe → werden mit DaemonTransportClosedError abgelehnt
  ├── Alle subscribeEvents-Generatoren → werfen DaemonTransportClosedError
  │
  └── Consumer (Provider / Drittanbieter) erkennt Verbindungsabbruch:
        1. Neuen RestSseTransport erstellen (garantiert funktionsfähig, wenn der Daemon läuft)
        2. Neuen DaemonClient({ transport: newTransport }) erstellen
        3. Für jede aktive Sitzung: session/load zum erneuten Anhängen
        4. Event-Abonnement fortsetzen
```

**Wichtige Einschränkung**: Der Runtime-Fallback wird vom **Consumer gesteuert, nicht vom Transport selbst**.
Der Transport wechselt nicht stillschweigend das Protokoll – er scheitert lautstark
(`DaemonTransportClosedError`) und der Consumer entscheidet, ob er neu aufbaut.

Begründung:

- WS-Abbau zerstört alle eigenen Sitzungen serverseitig (`registry.delete` →
  `conn.destroy`). Ein stiller Wechsel würde diesen Datenverlust verbergen.
- `session/load` hängt die Sitzung erneut an die bestehende Bridge-Sitzung an (Transkripte
  bleiben erhalten), aber die laufende Eingabeaufforderung wird abgebrochen. Der Consumer muss
  dies explizit behandeln (Wiederholung oder Benutzerinformation).
- Noch keine Fortsetzung über `Last-Event-ID` zwischen den Transports (Phase 4). Ereignisse zwischen
  Verbindungsabbruch und Wiederherstellung können verloren gehen. Der Consumer sollte eine vollständige
  Status-Neusynchronisation über `session/load` anfordern (das die Geschichte wiederholt).

**AutoReconnectTransport** (~150 Zeilen, optionaler Wrapper):

```typescript
class AutoReconnectTransport implements DaemonTransport {
  constructor(
    private baseUrl: string,
    private token: string,
    private preferred: 'acp-ws' | 'acp-http' | 'rest',
  ) {}

  // Bei DaemonTransportClosedError vom inneren Transport:
  // 1. Versuche, den bevorzugten Transport neu zu erstellen
  // 2. Falls der bevorzugte scheitert, Fallback auf REST
  // 3. Verbindung neu initialisieren
  // Der Aufrufer muss trotzdem session/load ausführen – dieser Wrapper kümmert sich nur
  // um die Wiederherstellung auf Transportebene, nicht auf Sitzungsebene.
}
```

Dieser Wrapper ist optional. Bestehende Consumer, die keine automatische Wiederverbindung möchten,
fangen `DaemonTransportClosedError` einfach selbst ab und behandeln ihn.

**Auswirkungen auf bestehende Funktionalität**: Keine. Die gesamte automatische Erkennung und der Fallback-Code
sind additiv und optional. `new DaemonClient({ baseUrl, token })` ohne
`transport` = aktuelles REST-Verhalten, keine automatische Erkennung, keine Fallback-Logik.

---

## 3. Prüfung auf breaking changes

### Fazit: Keine breaking changes

| Öffentliche API                           | Änderung                                   | Breaking? |
| ----------------------------------------- | ------------------------------------------ | :-------: |
| `new DaemonClient({ baseUrl, token })`    | Keine Änderung                             |    ❌     |
| `DaemonClientOptions.*`                   | Alle erhalten, `transport` hinzugefügt     |    ❌     |
| `DaemonHttpError`                         | Unverändert                                |    ❌     |
| `DaemonSessionClient`                     | Keine Änderungen (delegiert an DaemonClient)|    ❌     |
| Alle Typ-Exporte (100+)                   | Unverändert                                |    ❌     |

### Auswirkungen pro Consumer

| Consumer                       | Auswirkung                               |
| ------------------------------ | ---------------------------------------- |
| webui (25 Dateien)             | Keine Code-Änderungen                    |
| web-shell (4 Dateien)          | Keine Code-Änderungen                    |
| vscode-ide-companion (1 Datei) | Keine Code-Änderungen                    |
| Drittanbieter                  | Keine für REST; `transport` für ACP übergeben |

---

## 4. Design-Entscheidungen

| Entscheidung                                           | Begründung                                                                                                                                                                   |
| ------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `subscribeEvents` auf dem Transport, nicht nur `fetch` | SSE-Neucodierung durch fetch ist verschwenderisch und störanfällig                                                                                                            |
| `connected: boolean` auf dem Transport                 | Die Wiederherstellungsschleife des Providers muss zwischen "Transport tot" und "vorübergehender 500" unterscheiden                                                             |
| Lazy-Initialisierung (kein explizites `connect()`)     | Hält die DaemonClient-Konstruktion synchron; der Standard `new RestSseTransport()` benötigt keine Initialisierung                                                               |
| Automatische Erkennung ist einmalig, nicht mittendrin  | `negotiate()` testet einmalig beim Start; Runtime-Fallback wird vom Consumer über `DaemonTransportClosedError` gesteuert, nicht durch stillen internen Wechsel               |
| Keine Fehlertaxonomie als Voraussetzung                | ACP-Transports bilden Fehler intern auf HTTP-äquivalente Statuscodes ab; `DaemonHttpError` funktioniert wie gehabt                                                             |
| Provider erhält `transport`-Prop                       | `DaemonWorkspaceProvider` erhält optionales `transport`-Prop (~5 Zeilen), an den DaemonClient-Konstruktor weitergeleitet. Drittanbieter setzen dieses Prop; Weglassen = aktuelles REST-Verhalten |
## 5. In Betracht gezogene Alternativen

### 5.1 Benutzerdefinierte Fetch-Injektion (kein neues Interface)

Übergabe eines WS-basierten `fetch` über die vorhandene `DaemonClientOptions.fetch`.

**Abgelehnt**: `subscribeEvents` validiert `content-type: text/event-stream` und
verwendet `parseSseStream`. Ein benutzerdefinierter Fetch müsste WS-Frames als SSE-Text
umkodieren, dann dekodiert das SDK sie zurück – ineffizienter Kodierungs-Decodierungs-Roundtrip.
Außerdem haben `capabilities()` und `initialize` unterschiedliche Antwortstrukturen,
die eine Format-Mapping-Schicht erfordern.

### 5.2 Vollständiges formales Interface (4 PRs, ~2750 Zeilen)

Fehlertaxonomie → Interface → AcpHttp → AcpWs als separate PRs.

**Abgelehnt**: überentwickelt. Fehlertaxonomie ist unnötig (ACP-Transports können auf
HTTP-äquivalente Statuscodes abbilden). Separate PRs erhöhen die Review-Kontextwechsel-Kosten
für eine einzelne zusammenhängende Abstraktion.

### 5.3 Dualer Provider mit BridgeContext

Paralleler `AcpSessionProvider` + `ChatBridgeContext` + `SessionBridgeContext`.

**Abgelehnt**: führt zu Store-Desynchronisation, benötigt ~8 Dateien, funktioniert nicht ohne SDK-Änderungen.

---

## 6. Implementierungsplan (einzelner PR)

Alle Änderungen landen in einem PR. Insgesamt ca. 1300 Zeilen.

| Datei                                                                            | Änderung                                                                      | Zeilen   |
| -------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- | -------- |
| `packages/sdk-typescript/src/daemon/DaemonTransport.ts`                          | Interface + Typen + `DaemonTransportClosedError` + `negotiate()`-Factory      | ~110     |
| `packages/sdk-typescript/src/daemon/RestSseTransport.ts`                         | Kapselt `globalThis.fetch` + SSE-Logik aus DaemonClient extrahiert            | ~80      |
| `packages/sdk-typescript/src/daemon/AcpWsTransport.ts`                          | WS-Multiplexer + URL→JSON-RPC-Mapping + Anfragekorrelation                    | ~400     |
| `packages/sdk-typescript/src/daemon/AcpHttpTransport.ts`                        | POST /acp + Verbindungs-/Session-SSE-Verwaltung                               | ~300     |
| `packages/sdk-typescript/src/daemon/AcpEventDenormalizer.ts`                    | JSON-RPC-Benachrichtigung → DaemonEvent-Mapping                               | ~150     |
| `packages/sdk-typescript/src/daemon/AutoReconnectTransport.ts`                  | Opt-in-Wrapper: erneute Verbindung + Fallback                                 | ~150     |
| `packages/sdk-typescript/src/daemon/DaemonClient.ts`                            | Konstruktor + 6 `_fetch`-Stellen + subscribeEvents-Neuschreibung              | ~40 net  |
| `packages/sdk-typescript/src/daemon/index.ts`                                   | Export neuer Typen                                                            | ~10      |
| `packages/cli/src/serve/server.ts`                                              | `transports`-Feld zu `GET /capabilities` hinzugefügt                          | ~5       |
| `packages/sdk-typescript/src/daemon/types.ts`                                   | `transports` zum `DaemonCapabilities`-Typ hinzugefügt                         | ~3       |
| `packages/webui/src/daemon/workspace/DaemonWorkspaceProvider.tsx`               | Optionales `transport`-Prop hinzugefügt, an `DaemonClient` weitergeleitet     | ~5       |
| Tests                                                                           | Transport-Komponenten- + Integrationstests                                    | ~200     |

**Abwärtskompatibilität**: `new DaemonClient({ baseUrl, token })` ohne
`transport` = identisches REST+SSE-Verhalten. Alle vorhandenen Tests bestehen unverändert.

---

## 7. Verifizierung

1. **Abwärtskompatibilität**: `npm run test` über sdk-typescript und webui – keine
   Teständerungen nötig. `new DaemonClient({ baseUrl, token })` = identisches Verhalten.
2. **RestSseTransport-Extraktion**: Bit-für-Bit äquivalentes SSE-Verhalten, bestätigt
   durch vorhandene Testsuite.
3. **AcpWsTransport**: Integrationstest mit Verbindung zu echtem Daemon über WS. Überprüfen:
   - `subscribeEvents` liefert gleiche `DaemonEvent`-Strukturen wie REST SSE
   - Prompt 202/200-Verzweigung funktioniert mit synthetisierter Response
   - Permission-Vote-Rundlauf korrekt
   - `connected` wechselt bei WS-Abbruch auf `false`
   - Abbruchsignal bei Prompt → WS sendet Session/Cancel-RPC
4. **AcpHttpTransport**: gleiche Verifizierung wie bei WS, aber über HTTP+SSE.
5. **Auto-Erkennung**: `negotiate()` liefert besten Transport; Fallback zu REST bei WS-Fehler.
6. **Laufzeit-Fallback**: `AutoReconnectTransport` fängt `DaemonTransportClosedError` ab,
   baut Transport neu auf, Consumer ruft `session/load` zur Resynchronisation.
7. **Provider**: `DaemonWorkspaceProvider` mit `transport`-Prop – ChatView und
   TerminalView lesen beide aus demselben Store.
8. **Ende-zu-Ende**: Drittanbieter übergibt `transport={new AcpWsTransport(url, token)}`
   an `DaemonWorkspaceProvider`. Alle SDK-Hooks und der Transkript-Store funktionieren unverändert.

---

## 8. Risiken

| Risiko                                                               | Minderung                                                                                                                         |
| -------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Wartung der URL→JSON-RPC-Zuordnungstabelle                           | Tabelle zusammen mit Transport; Änderungen an Daemon-Routen erfordern Transport-Update                                             |
| Genauigkeit der synthetisierten ACP-WS-Response                      | Hilfsfunktion `syntheticResponse(status, json)` bereitstellen; Vertrag dokumentieren (`.json()`, `.text()`, `.status`, `.body?.cancel()`) |
| Monotonie von `DaemonEvent.id` bei WS                                | ACP-Server-JSON-RPC-Benachrichtigungen enthalten Ereignis-ID; Transport gibt sie direkt weiter                                    |
| Prompt 202 vs 200 bei WS                                             | Transport bildet JSON-RPC-Antwort → 200 mit Ergebnisbody (blockierender Pfad); Ereignisse fließen weiter über `subscribeEvents`    |
| Erkennung von WS-Verbindungsabbrüchen                                | `connected: boolean` + `DaemonTransportClosedError`, ausgelöst von `fetch`                                                        |
