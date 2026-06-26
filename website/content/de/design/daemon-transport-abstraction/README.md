# DaemonTransport-Abstraktionsschicht

> Ziel-Branch: `main`. Autor: arnoo.gao. Datum: 2026-06-12. Status: **Design v4 – Review**.
> Design-First pro Repository-Workflow: Dieses Dokument landet vor dem Implementierungs-PR.

---

## 0. TL;DR

`DaemonClient` hat REST+SSE hartcodiert. Third-Party-Integrationen, die ACP
WebSocket nutzen möchten, müssen den Provider-Stack forken (~8 Dateien). Dieser
Vorschlag fügt ein **`DaemonTransport`-Interface** mit `fetch`- und
`subscribeEvents`-Methoden sowie automatischer Erkennung und
Laufzeit-Fallback hinzu und ermöglicht so steckbare Transporte mit
**null Breaking Changes**.

**Gesamtänderung: ~1300 Zeilen** in einem einzigen Implementierungs-PR.
Bestehende Konsumenten bleiben unberührt — `new DaemonClient({ baseUrl, token })` = aktuelles Verhalten.

---

## 1. Hintergrund

### 1.1 Aktuelle Architektur

```
DaemonClient({ baseUrl, token })
  └─ this._fetch = globalThis.fetch     ← hartcodiert
  └─ subscribeEvents → GET /session/:id/events → parseSseStream → DaemonEvent
```

67 öffentliche Methoden, die jeweils REST-URLs konstruieren und auf HTTP-Statuscodes
verzweigen. `fetch` ist bereits über `DaemonClientOptions.fetch` injizierbar,
aber `subscribeEvents` enthält inline SSE-spezifische Logik (Content-Type-Prüfung,
SSE-Parsing, Verbindungsaufbau-Timeout), die allein durch Fetch-Injektion nicht
austauschbar ist.

### 1.2 Das Problem für Third Parties

Wenn ein Drittanbieter (z.B. `agent-web`) einen `AcpSessionProvider` baut, um
WebSocket statt REST+SSE zu verwenden:

- **Ersetzt er** `DaemonSessionProvider`: Komponenten, die `DaemonStoreContext`
  lesen (z.B. TerminalView) verlieren ihren Kontext → Absturz.
- **Behält er beide Provider bei**: Zwei Ereignisquellen, zwei Stores,
  Desynchronisation.
- **Injiziert er Ereignisse** in den SDK-Store: `DaemonSessionProvider`
  abonniert intern ebenfalls SSE → doppelte Ereignisse.

**Grundursache**: Ein Wechsel des Transports erfordert den Austausch des Providers,
weil `DaemonClient`'s `subscribeEvents` fest auf SSE codiert ist.

### 1.3 Ziel

```
DaemonClient({ transport: new AcpWsTransport(url, token) })
  └─ transport.fetch → bildet URL+Verb auf JSON-RPC über WS ab
  └─ transport.subscribeEvents → demultiplext WS-Benachrichtigungen → DaemonEvent
```

Ein Provider, ein Store, Transport ist ein internes Detail. Drittanbieter
übergeben `transport` an `DaemonClient`; alles andere funktioniert unverändert.

---

## 2. Design

### 2.1 Interface

```typescript
interface DaemonTransportFetchOptions {
  timeout?: number; // 0 = kein Timeout. undefined = Transport-Standard.
}

interface DaemonTransportSubscribeOptions {
  lastEventId?: number;
  maxQueued?: number;
  signal?: AbortSignal;
  connectTimeoutMs?: number;
}

interface DaemonTransport {
  /**
   * Sendet eine Anfrage und gibt ein Response-Objekt zurück.
   *
   * Vertrag:
   * - Response MUSS .json(), .text(), .ok, .status,
   *   .headers.get(), .body?.cancel() unterstützen
   * - .status MUSS ein genauer HTTP-Statuscode sein
   *   (200, 201, 202, 204, 404, usw.)
   * - Fehlertexte MÜSSEN die strukturierte Form des Daemons bewahren
   * - Aufrufbar ohne vorherige Einrichtung; Transport kümmert sich intern
   *   um Initialisierung (Lazy-Init / Init-Once-Deferred-Muster)
   * - Wirft DaemonTransportClosedError, wenn die Verbindung tot ist
   * - Wenn init.signal abbricht: Bei Prompt-Anfragen MUSS der Transport
   *   den laufenden Prompt auf der Leitung abbrechen (WS: session/cancel
   *   RPC senden; HTTP: fetch abbrechen). Bei gewöhnlichen Anfragen wird
   *   nur die ausstehende Anfrage verworfen/abgebrochen, ohne Seiteneffekte.
   *   Ausstehende Response wird mit AbortError abgelehnt.
   */
  fetch(
    url: string,
    init: RequestInit,
    opts?: DaemonTransportFetchOptions,
  ): Promise<Response>;

  /**
   * Abonniert Session-Ereignisse.
   *
   * Vertrag:
   * - Ereignisse mit id MÜSSEN monotone ganzzahlige ids haben; synthetische/terminale
   *   Frames (z.B. stream_error) KÖNNEN id weglassen (DaemonEvent.id ist optional)
   * - MÜSSEN ALLE Ereignistypen (Session + Workspace) in einem Stream liefern
   * - Abbruch des Signals MUSS nur diesen Generator stoppen, NICHT die Verbindung
   * - Wenn die Verbindung stirbt, MÜSSEN alle ausstehenden Generatoren
   *   DaemonTransportClosedError werfen (Transport verwaltet Generator-Referenzen)
   * - MUSS connectTimeoutMs nur auf die Verbindungsphase anwenden
   * - Transport MUSS deklarieren, ob lastEventId-Wiederholung unterstützt wird;
   *   falls nicht, MUSS der Konsument bei Wiederverbindung session/load für
   *   vollständige Resynchronisation verwenden
   */
  subscribeEvents(
    sessionId: string,
    opts: DaemonTransportSubscribeOptions,
  ): AsyncGenerator<DaemonEvent>;

  /** Transport-Identität für erschöpfende Verzweigung. */
  readonly type: 'rest' | 'acp-http' | 'acp-ws';

  /** Ob dieser Transport Last-Event-ID-basierte Wiederholung bei erneuter
   *  Verbindung unterstützt. Bei false MUSS der Konsument session/load für
   *  vollständige Resynchronisation verwenden. */
  readonly supportsReplay: boolean;

  /** False nach Verbindungsabbruch oder dispose(). */
  readonly connected: boolean;

  /** Idempotentes Herunterfahren. */
  dispose(): void;
}

class DaemonTransportClosedError extends Error {}
```

### 2.2 Warum zwei Methoden (fetch + subscribeEvents), nicht nur fetch

`subscribeEvents` hat pro Transport grundlegend unterschiedliche Wire-Semantiken:

| Transport | Wire-Mechanismus                                                     |
| --------- | -------------------------------------------------------------------- |
| REST      | `GET /session/:id/events` → SSE → `parseSseStream` → `DaemonEvent` |
| ACP HTTP  | `GET /acp` (Session-bezogenes SSE) → JSON-RPC-Benachrichtigung entpacken   |
| ACP WS    | Demultiplexen von Benachrichtigungen aus gemeinsamem Socket nach sessionId |

Diese durch ein fetch-förmiges Loch zu zwingen, erfordert SSE-Neu-
codierung/Dekodierung (WS → fake SSE-Text → `parseSseStream` → DaemonEvent) –
verschwenderisch und fragil.

Alle anderen 66 Methoden funktionieren über `fetch`, da sie unabhängig vom
Transport dem Anfrage→Antwort-Schema folgen.

### 2.3 Warum auf Fetch-Ebene, nicht Methoden-Dispatch

Die 67 Methoden von DaemonClient enthalten pro Methode HTTP-Verzweigungen:

- `prompt()`: 202 vs 200 Statusprüfung
- `deleteWorkspaceAgent()`: 204 vs 404 mit Body-Inspektion
- `respondToPermission()`: 200 vs 404 zur Race-Erkennung
- 6 Methoden umgehen `fetchWithTimeout`, indem sie direkt `_fetch` aufrufen

Ein Methoden-Dispatch-Interface (`request<T>(method, params)`) würde erzwingen,
diese gesamte Logik in jedem Transport zu duplizieren. Fetch-Ebene hält
DaemonClient unverändert.

### 2.4 Änderungen an DaemonClient (~40 Zeilen)

```typescript
export interface DaemonClientOptions {
  baseUrl: string;
  token?: string;
  fetch?: typeof globalThis.fetch; // Behalten
  fetchTimeoutMs?: number; // Behalten
  transport?: DaemonTransport; // NEU – optionale Überschreibung
}
```

Interne Änderungen:

- Konstruktor: `this.transport = opts.transport ?? new RestSseTransport(...)`
- `fetchWithTimeout`: Delegieren an `this.transport.fetch(url, init, { timeout })`
- 6 direkte `this._fetch`-Stellen (prompt, promptNonBlocking, recapSession,
  btwSession, shellCommand, subscribeEvents): Ersetzen durch
  `this.transport.fetch(url, init, { timeout: 0 })`
- `subscribeEvents`: Erschöpfende Verzweigung über `this.transport.type`:
  - `'rest'`: Delegieren an `this.transport.subscribeEvents(sessionId, opts)`
  - Standard: gleiche Delegierung (jeder Transport handhabt sein eigenes Wire-Format)
- Entfernen des Feldes `private _fetch` (durch Transport ersetzt)

### 2.5 Provider-Injektionspunkt

`DaemonWorkspaceProvider` und `DaemonSessionProvider` konstruieren beide
intern `DaemonClient`. Damit Drittanbieter einen Transport injizieren können,
ohne den Provider zu umgehen:

```typescript
// DaemonWorkspaceProvider – optionales transport-Prop hinzufügen
interface DaemonWorkspaceProviderProps {
  baseUrl: string;
  token?: string;
  transport?: DaemonTransport; // NEU – an DaemonClient weitergeleitet
  // ...bestehende Props
}

// DaemonSessionProvider – erbt aus Workspace-Kontext
// Kein transport-Prop nötig; wird aus Workspace-Kontext gelesen
```

Wenn `transport` angegeben ist, übergibt der Provider ihn an `DaemonClient`:

```typescript
new DaemonClient({ baseUrl, token, transport: props.transport });
```

Wenn ausgelassen: aktuelles Verhalten (REST+SSE). ~5 Zeilen Provider-Änderung.

### 2.5 RestSseTransport (~80 Zeilen)

Wrapper um `globalThis.fetch` + extrahiert aktuelle SSE-Logik aus
`DaemonClient.subscribeEvents`:

```typescript
class RestSseTransport implements DaemonTransport {
  readonly type = 'rest' as const;
  readonly supportsReplay = true; // SSE unterstützt Last-Event-ID
  readonly connected = true; // REST ist zustandslos

  constructor(
    private readonly baseUrl: string,
    private readonly token: string | undefined,
    private readonly _fetch: typeof globalThis.fetch,
  ) {}

  fetch(url, init, opts?) {
    return this._fetch(url, init);
  }

  async *subscribeEvents(sessionId, opts) {
    // Aktuelle DaemonClient.subscribeEvents-Logik hierher verschoben:
    // - URL aus this.baseUrl + sessionId erstellen
    // - Authorization-Header aus this.token setzen
    // - Verbindungs-Timeout aus opts.connectTimeoutMs
    // - fetch → content-type validieren → parseSseStream → yield
  }

  dispose() {} // keine Operation
}
```

### 2.6 ACP-Transport-Interna

**AcpWsTransport** (~400-600 Zeilen):

- Lazy-Init: Erster `fetch`-Aufruf öffnet WS + sendet `initialize`
- URL→JSON-RPC-Abbildungstabelle: `/session/:id/prompt` → `{method: "session/prompt", params: {sessionId: id, ...body}}`
- Request-Multiplexer: `Map<id, {resolve, reject}>` für ausstehende Anfragen
- `subscribeEvents`: Gefilterter gemeinsamer Benachrichtigungsstream nach sessionId
- `connected`: Verfolgt WS-readyState
- `supportsReplay`: false (WS hat kein Last-Event-ID; Konsument muss `session/load` verwenden)
- Synthetisiert `Response`-Objekte mit korrektem `.status`/`.json()`/`.text()`

**AcpHttpTransport** (~800-1000 Zeilen):

- Lazy-Init: Erster `fetch`-Aufruf sendet `POST /acp {initialize}`
- Verwaltet intern Verbindungs- und Session-bezogene SSE-Streams
- Gleiche URL→JSON-RPC-Abbildung + Request-Korrelation
- `supportsReplay`: true (Session-SSE unterstützt Last-Event-ID)

### 2.7 Transport-Autoerkennung

Der Server gibt unterstützte Transporte in `GET /capabilities` bekannt:

```json
{
  "transports": ["rest+sse", "acp-http+sse", "acp-ws"],
  ...vorhandene capabilities-Felder...
}
```

Das SDK stellt eine einmalige statische Factory bereit:

```typescript
// Einmalig vor React-Rendering prüfen, niemals mid-session wechseln
const transport = await DaemonTransport.negotiate(baseUrl, token);
// Gibt den besten verfügbaren zurück: acp-ws > acp-http > rest (Fallback)
```

Implementierung:

1. `GET /capabilities` → `transports`-Array lesen
2. Wenn `acp-ws` in der Liste → WS-Upgrade versuchen; bei Erfolg `AcpWsTransport` zurückgeben
3. Wenn WS fehlschlägt oder nicht in der Liste → `acp-http` versuchen; bei Erfolg `AcpHttpTransport` zurückgeben
4. Fallback → `RestSseTransport`

Keine bestehende API betroffen: `GET /capabilities` erhält ein neues Feld (additiv),
bestehende Konsumenten ignorieren unbekannte Felder.

### 2.8 Laufzeit-Fallback (WS → REST bei Trennung)

Wenn ein Nicht-REST-Transport mid-session die Verbindung verliert:

```
AcpWsTransport (connected=true)
  │
  ├── WS fällt aus (Netzwerk, Server-Neustart, Leerlauf-Timeout)
  │
  ├── connected = false
  ├── Alle ausstehenden fetch()-Aufrufe → Ablehnung mit DaemonTransportClosedError
  ├── Alle subscribeEvents-Generatoren → Werfen DaemonTransportClosedError
  │
  └── Konsument (Provider / Drittanbieter) erkennt Trennung:
        1. Neuen RestSseTransport erstellen (garantiert funktionsfähig, wenn Daemon läuft)
        2. Neuen DaemonClient({ transport: newTransport }) erstellen
        3. Für jede aktive Session: session/load zum erneuten Anhängen
        4. Ereignisabonnement fortsetzen
```

**Wichtige Einschränkung**: Laufzeit-Fallback ist **konsumentengesteuert, nicht transport-intern**.
Der Transport wechselt nicht stillschweigend das Protokoll – er meldet sich laut
(`DaemonTransportClosedError`) und der Konsument entscheidet, ob er neu aufbauen möchte.

Begründung:

- WS-Abbau zerstört alle eigenen Sessions serverseitig (`registry.delete` →
  `conn.destroy`). Ein stiller Wechsel würde diesen Datenverlust verbergen.
- `session/load` stellt die Verbindung zur bestehenden Bridge-Session wieder her (Transkripte
  bleiben erhalten), aber der laufende Prompt wird abgebrochen. Der Konsument muss dies
  explizit behandeln (Wiederholung oder dem Benutzer anzeigen).
- Keine `Last-Event-ID`-Wiederaufnahme über Transporte hinweg (Phase 4). Ereignisse zwischen
  Trennung und Wiederverbindung können verloren gehen. Der Konsument sollte eine vollständige
  Zustandsresynchronisation über `session/load` anfordern (das den Verlauf wiedergibt).

**AutoReconnectTransport** (~150 Zeilen, optionaler Wrapper):

```typescript
class AutoReconnectTransport implements DaemonTransport {
  constructor(
    private baseUrl: string,
    private token: string,
    private preferred: 'acp-ws' | 'acp-http' | 'rest',
  ) {}

  // Bei DaemonTransportClosedError vom inneren Transport:
  // 1. Versuche, bevorzugten Transport neu zu erstellen
  // 2. Wenn bevorzugt fehlschlägt, Fallback zu REST
  // 3. Verbindung neu initialisieren
  // Aufrufer muss dennoch session/load aufrufen – dieser Wrapper kümmert sich
  // nur um Transport-Level-Wiederverbindung, nicht um Session-Level.
}
```

Dieser Wrapper ist optional. Bestehende Konsumenten, die keine automatische
Wiederverbindung wünschen, fangen einfach `DaemonTransportClosedError` und behandeln
es selbst.

**Auswirkungen auf bestehende Funktionalität**: Null. Die gesamte Autoerkennungs-
und Fallback-Logik ist additiv und optional. `new DaemonClient({ baseUrl, token })`
ohne `transport` = aktuelles REST-Verhalten, keine Autoerkennung, keine Fallback-Logik.

---

## 3. Breaking-Change-Audit

### Fazit: null Breaking Changes

| Public API                             | Änderung                                  | Breaking? |
| -------------------------------------- | ----------------------------------------- | :-------: |
| `new DaemonClient({ baseUrl, token })` | Keine Änderung                            |    ❌     |
| `DaemonClientOptions.*`                | Alle behalten, `transport` hinzugefügt    |    ❌     |
| `DaemonHttpError`                      | Unverändert                               |    ❌     |
| `DaemonSessionClient`                  | Keine Änderungen (delegiert an DaemonClient) |    ❌     |
| Alle Type-Exports (100+)               | Unverändert                               |    ❌     |

### Auswirkungen pro Konsument

| Konsument                      | Auswirkung                                |
| ----------------------------- | ----------------------------------------- |
| webui (25 Dateien)            | Keine Code-Änderungen                     |
| web-shell (4 Dateien)         | Keine Code-Änderungen                     |
| vscode-ide-companion (1 Datei)| Keine Code-Änderungen                     |
| Drittanbieter                 | Keine für REST; `transport` für ACP übergeben |

---

## 4. Designentscheidungen

| Entscheidung                                         | Begründung                                                                                                                                                                       |
| ---------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `subscribeEvents` am Transport, nicht nur `fetch`    | SSE-Neucodierung durch fetch ist verschwenderisch und fragil                                                                                                                     |
| `connected: boolean` am Transport                    | Provider-Wiederverbindungsschleife muss "Transport tot" von "vorübergehendem 500" unterscheiden können                                                                          |
| Lazy-Init (kein explizites `connect()`)              | Hält DaemonClient-Konstruktion synchron; Standard-`new RestSseTransport()` benötigt keine Init                                                                                     |
| Autoerkennung ist einmalig, nicht mid-session        | `negotiate()` prüft einmalig beim Start; Laufzeit-Fallback ist konsumentengesteuert über `DaemonTransportClosedError`, kein stiller interner Wechsel                            |
| Keine Fehlertaxonomie-Voraussetzung                  | ACP-Transporte bilden Fehler intern auf HTTP-äquivalente Statuscodes ab; `DaemonHttpError` funktioniert unverändert                                                             |
| Provider erhält `transport`-Prop                     | `DaemonWorkspaceProvider` erhält optionales `transport`-Prop (~5 Zeilen), an `DaemonClient`-Konstruktor weitergeleitet. Drittanbieter setzen dieses Prop; Weglassen = aktuelles REST-Verhalten |

---

## 5. Alternativen, die in Betracht gezogen wurden

### 5.1 Benutzerdefinierte Fetch-Injektion (kein neues Interface)

WS-basiertes `fetch` über vorhandenes `DaemonClientOptions.fetch` übergeben.

**Abgelehnt**: `subscribeEvents` validiert `content-type: text/event-stream` und
verwendet `parseSseStream`. Ein benutzerdefiniertes Fetch müsste WS-Frames als SSE-Text
neucodieren, dann dekodiert das SDK sie zurück – verschwenderische Kodier-Dekodier-
Rundreise. Außerdem haben `capabilities()` und `initialize` unterschiedliche
Antwortstrukturen, die eine Format-Mapping-Schicht erfordern.

### 5.2 Vollständiges formales Interface (4 PRs, ~2750 Zeilen)

Fehlertaxonomie → Interface → AcpHttp → AcpWs als separate PRs.

**Abgelehnt**: Überentwickelt. Fehlertaxonomie ist unnötig (ACP-Transporte können
auf HTTP-äquivalente Statuscodes abbilden). Separate PRs erhöhen die Kosten für
Review-Kontextwechsel für eine einzige zusammenhängende Abstraktion.

### 5.3 Dualer Provider mit BridgeContext

Paralleler `AcpSessionProvider` + `ChatBridgeContext` + `SessionBridgeContext`.

**Abgelehnt**: verursacht Store-Desynchronisation, erfordert ~8 Dateien, kann ohne SDK-Änderungen nicht funktionieren.

---

## 6. Implementierungsplan (einzelner PR)

Alle Änderungen landen in einem PR. Geschätzt ~1300 Zeilen insgesamt.

| Datei                                                              | Änderung                                                                 | Zeilen  |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------ | ------- |
| `packages/sdk-typescript/src/daemon/DaemonTransport.ts`           | Interface + Typen + `DaemonTransportClosedError` + `negotiate()`-Factory | ~110    |
| `packages/sdk-typescript/src/daemon/RestSseTransport.ts`          | Wrapper um `globalThis.fetch` + aus DaemonClient extrahierte SSE-Logik   | ~80     |
| `packages/sdk-typescript/src/daemon/AcpWsTransport.ts`            | WS-Multiplexer + URL→JSON-RPC-Abbildung + Request-Korrelation            | ~400    |
| `packages/sdk-typescript/src/daemon/AcpHttpTransport.ts`          | POST /acp + Verbindungs-/Session-SSE-Verwaltung                          | ~300    |
| `packages/sdk-typescript/src/daemon/AcpEventDenormalizer.ts`      | JSON-RPC-Benachrichtigung → DaemonEvent-Abbildung                        | ~150    |
| `packages/sdk-typescript/src/daemon/AutoReconnectTransport.ts`    | Optionaler Wrapper: Wiederverbindung + Fallback                          | ~150    |
| `packages/sdk-typescript/src/daemon/DaemonClient.ts`              | Konstruktor + 6 `_fetch`-Stellen + subscribeEvents-Umschreibung          | ~40 net |
| `packages/sdk-typescript/src/daemon/index.ts`                     | Neue Typen exportieren                                                   | ~10     |
| `packages/cli/src/serve/server.ts`                                | Feld `transports` zu `GET /capabilities` hinzufügen                      | ~5      |
| `packages/sdk-typescript/src/daemon/types.ts`                     | `transports` zu `DaemonCapabilities`-Typ hinzufügen                      | ~3      |
| `packages/webui/src/daemon/workspace/DaemonWorkspaceProvider.tsx` | Optionales `transport`-Prop hinzufügen, an `DaemonClient` weiterleiten   | ~5      |
| Tests                                                             | Transport-Unit- + Integrationstests                                      | ~200    |

**Abwärtskompatibilität**: `new DaemonClient({ baseUrl, token })` ohne
`transport` = identisches REST+SSE-Verhalten. Alle bestehenden Tests bestehen unverändert.

---

## 7. Verifikation

1. **Abwärtskompatibilität**: `npm run test` in sdk-typescript und webui – keine
   Teständerungen nötig. `new DaemonClient({ baseUrl, token })` = identisches Verhalten.
2. **RestSseTransport-Extraktion**: Bit-genau äquivalentes SSE-Verhalten, bestätigt
   durch vorhandene Testsuite.
3. **AcpWsTransport**: Integrationstest mit Verbindung zu echtem Daemon über WS. Überprüfen:
   - `subscribeEvents` liefert dieselben `DaemonEvent`-Strukturen wie REST SSE
   - prompt 202/200-Verzweigung funktioniert mit synthetisierter Response
   - Permission-Vote-Rundreise funktioniert korrekt
   - `connected` wechselt auf `false` bei WS-Abbruch
   - Abbruch-Signal bei prompt → WS sendet session/cancel RPC
4. **AcpHttpTransport**: Gleiche Überprüfung wie WS, aber über HTTP+SSE.
5. **Autoerkennung**: `negotiate()` gibt besten Transport zurück; Fallback zu REST bei WS-Fehler.
6. **Laufzeit-Fallback**: `AutoReconnectTransport` fängt `DaemonTransportClosedError`,
   baut Transport neu auf, Konsument ruft `session/load` zur Resynchronisation auf.
7. **Provider**: `DaemonWorkspaceProvider` mit `transport`-Prop – ChatView und
   TerminalView lesen beide aus einem einzigen Store.
8. **Ende-zu-Ende**: Drittanbieter übergibt `transport={new AcpWsTransport(url, token)}`
   an `DaemonWorkspaceProvider`. Alle SDK-Hooks und der Transcript-Store funktionieren unverändert.
---

## 8. Risiken

| Risiko                                   | Gegenmaßnahme                                                                                                               |
| ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| URL→JSON-RPC-Zuordnungstabelle Wartung   | Tabelle gemeinsam mit Transport abgelegt; Änderungen an Daemon-Routen erfordern Transport-Update                            |
| ACP WS synthetisierte Antworttreue       | Hilfsprogramm `syntheticResponse(status, json)` bereitstellen; Vertrag dokumentieren (`.json()`, `.text()`, `.status`, `.body?.cancel()`) |
| `DaemonEvent.id`-Monotonie für WS        | JSON-RPC-Benachrichtigungen des ACP-Servers tragen die Ereignis-ID; der Transport gibt sie direkt weiter                   |
| Prompt 202 vs 200 für WS                 | Transport bildet JSON-RPC-Antwort → 200 mit Ergebnisbody ab (blockierender Pfad); Ereignisse fließen weiterhin über `subscribeEvents` |
| Erkennung von WS-Verbindungsabbrüchen    | `connected: boolean` + `DaemonTransportClosedError`, ausgelöst von `fetch`                                                  |