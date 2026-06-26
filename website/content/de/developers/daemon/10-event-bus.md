# SSE Event Bus & Backpressure

## Überblick

Der `EventBus` (`packages/acp-bridge/src/eventBus.ts`) ist der session-bezogene In-Memory-Pub/Sub-Mechanismus, der die SSE-Route `GET /session/:id/events` des Daemons speist. Er weist jedem Ereignis eine monotone ID zu, puffert aktuelle Ereignisse in einem begrenzten Ring für die `Last-Event-ID`-Wiederherstellung, verteilt veröffentlichte Ereignisse an alle Abonnenten, wendet Backpressure pro Abonnent an (Warnung bei 75 % Warteschlangenfüllung, Entfernung bei Erreichen des Limits) und gibt zwei synthetische Terminal-Frames (`client_evicted`, `slow_client_warning`) aus, die vom SDK als erstklassige Ereignisse behandelt werden, vom Bus jedoch **ohne `id`** markiert werden, sodass sie keinen Slot in der sessionspezifischen Sequenz belegen.

Der `EventBus` ist derzeit paket-privat für `acp-bridge` und wird von der Bridge-Factory über eine geschlossene Instanz pro Session konsumiert. Ein zukünftiges Refactoring (in Zeile 150–159 von `eventBus.ts` erwähnt) wird es zu einem grundlegenden Baustein erheben, sodass Kanäle, Dual-Output und zukünftige WebSocket-Transporte denselben Bus abonnieren können, anstatt parallele Streams zu betreiben.

## Verantwortlichkeiten

- Zuweisung monotoner Session-Ereignis-IDs beginnend bei 1.
- Pufferung der letzten `ringSize` Ereignisse für die Wiederherstellung per `subscribe`-mit-`lastEventId`.
- Verteilung veröffentlichter Ereignisse an ≤ `maxSubscribers` gleichzeitige Abonnenten.
- Anwendung begrenzter Warteschlangen pro Abonnent; Entfernung überlaufender Abonnenten mit einem synthetischen `client_evicted`-Terminal-Frame.
- Ausgabe von `slow_client_warning` einmal pro Überlauf-Episode bei 75 % Warteschlangenfüllung mit 37,5 % Hysterese, um wiederholte Warnungen zu verhindern.
- Saubere Beendigung von Abonnements bei `AbortSignal.abort()`.
- Ordentliches Schließen jedes Abonnenten beim Schließen des Busses (z. B. Session-Tear-Down).
- Der `publish`-Vorgang wirft niemals Fehler (der Vertrag lautet: "publish ist immer sicher aufzurufen").

## Architektur

| Konstante                     | Wert         | Zweck                                                                                                   |
| ----------------------------- | ------------ | ------------------------------------------------------------------------------------------------------- |
| `EVENT_SCHEMA_VERSION`        | `1`          | Wird auf jedes `BridgeEvent.v` gestempelt; erhöht bei bahnbrechenden Frame-Änderungen.                  |
| `DEFAULT_RING_SIZE`           | `8000`       | Session-Wiederherstellungsring. Operator-Override via `--event-ring-size`.                              |
| `DEFAULT_MAX_QUEUED`          | `256`        | Maximaler Rückstand pro Abonnent.                                                                       |
| `DEFAULT_MAX_SUBSCRIBERS`     | `64`         | Maximalgrenze für Abonnenten pro Session.                                                               |
| `WARN_THRESHOLD_RATIO`        | `0.75`       | Auslöser-Schwellwert für `slow_client_warning` (Anteil von `maxQueued`).                                |
| `WARN_RESET_RATIO`            | `0.375`      | Hysterese-Wiederherstellungsanteil.                                                                     |
| `MAX_EVENT_RING_SIZE` (in `bridge.ts`) | `1_000_000` | Weiche Obergrenze für `BridgeOptions.eventRingSize`, um durch Tippfehler verursachte Speicherfehler abzufangen. |

### `BridgeEvent`

```ts
interface BridgeEvent {
  id?: number; // monoton pro Session; fehlt bei synthetischen Terminal-Frames
  v: 1; // EVENT_SCHEMA_VERSION
  type: string; // einer der 43 bekannten Typen oder zukünftig erweiterbar
  data: unknown; // Nutzlast (typspezifisch pro Typ durch das SDK; siehe 09-event-schema.md)
  originatorClientId?: string; // gesetzt, wenn das Ereignis von einer mit clientId gestempelten Anfrage stammt
}
```

### `SubscribeOptions`

```ts
interface SubscribeOptions {
  lastEventId?: number; // Wiederherstellung ab nach dieser ID (Last-Event-ID-Fortsetzung)
  signal?: AbortSignal; // bricht das Abonnement umgehend ab
  maxQueued?: number; // Maximaler Rückstand pro Abonnent; Standard 256
}
```

`subscribe()` gibt ein `AsyncIterable<BridgeEvent>` zurück. Die SSE-Route konsumiert es mit `for await`. Die Registrierung erfolgt **synchron** – zum Zeitpunkt der Rückkehr von `subscribe()` ist der Abonnent bereits angehängt, sodass ein `publish()`, das mit dem ersten `next()` des Consumers konkurriert, trotzdem zugestellt wird.

### `BoundedAsyncQueue`

Die Warteschlange pro Abonnent. Zwei entscheidende Verhaltensweisen:

- **Live-Cap gilt nur für Live-Elemente.** Elemente, die über `forcePush()` eingefügt werden, tragen ein `forced: true`-Tag pro Eintrag und zählen nie zu `maxSize`. Dadurch kann der `Last-Event-ID`-Wiederherstellungspfad hunderte historischer Frames per Force Push in einen neuen Abonnenten einfügen, ohne sofort das Live-Limit auszulösen und den gerade wiederhergestellten Abonnenten zu entfernen.
- **`liveCount` wird als Feld geführt**, nicht von der Position `forcedInBuf` abgeleitet. Die frühere positionbasierte Heuristik brach, als `slow_client_warning` begann, mid-stream per Force Push einzufügen (Warnungen kommen ans ENDE der Warteschlange, nicht an den Anfang wie bei Wiederherstellungen). Die eintragsbasierten `forced`-Tags sind positionsunabhängig.

`push(value)` gibt `false` zurück (anstatt zu blockieren oder zu werfen), wenn der Live-Rückstand das Limit erreicht hat – der Bus nutzt dieses Signal, um den Abonnenten zu entfernen. `forcePush(value)` umgeht das Limit. `close({drain?: boolean})` entleert standardmäßig ausstehende Elemente; der Abbruchpfad übergibt `drain: false`, um sie sofort zu verwerfen.

## Arbeitsablauf

### Veröffentlichung (Publish)

```mermaid
flowchart TD
    P["publish({type, data, originatorClientId?})"] --> C{"bus closed?"}
    C -->|ja| RU["return undefined"]
    C -->|nein| AID["assign id = nextId++, v = 1"]
    AID --> PR["push to ring (shift if > ringSize)"]
    PR --> FAN["snapshot subscribers, for each sub:"]
    FAN --> EVCK{"sub.evicted?"}
    EVCK -->|ja| NEXT[next subscriber]
    EVCK -->|nein| PUSH["sub.queue.push(event)"]
    PUSH --> OK{"accepted?"}
    OK -->|nein| EVICT["mark evicted; force-push client_evicted; queue.close; sub.dispose"]
    OK -->|ja| WARN{"!warned && liveSize >= warnThreshold?"}
    WARN -->|ja| FW["force-push slow_client_warning; warned = true"]
    WARN -->|nein| RES{"warned && liveSize <= warnResetThreshold?"}
    RES -->|ja| RA["warned = false (Hysterese wiederherstellen)"]
    RES -->|nein| NEXT
```

`publish` wirft niemals Fehler. Das Schließen des Busses während eines laufenden `publish` (der Shutdown-Pfad schließt Session-Busse, bevor `channel.kill()` abgewartet wird) gibt `undefined` zurück, anstatt zu werfen, weil der Agent im kleinen Fenster zwischen Bus-Schließen und Channel-Kill möglicherweise noch `sessionUpdate`-Benachrichtigungen emittiert.

### Abonnieren + Wiederherstellung (mit Ring-Entfernungs-Erkennung)

```mermaid
sequenceDiagram
    autonumber
    participant SR as SSE route
    participant EB as EventBus
    participant Q as BoundedAsyncQueue

    SR->>EB: subscribe({lastEventId: 42, maxQueued: 256, signal})
    EB->>EB: refuse if subs.size >= maxSubscribers<br/>(wirft SubscriberLimitExceededError)
    EB->>Q: new BoundedAsyncQueue(256)
    EB->>EB: subs.add(sub)
    EB->>EB: epochReset = lastEventId >= nextId
    alt epochReset (alte Bus-Epoche)
        EB->>Q: forcePush state_resync_required<br/>{ reason: 'epoch_reset', lastDeliveredId: 42, earliestAvailableId: ring[0]?.id ?? nextId }
        Note over EB,Q: id-loser synthetischer Frame, geht VOR der Wiederherstellung.<br/>Wiederherstellung scannt den gesamten aktuellen Ring.
    else gleiche Bus-Epoche
        EB->>EB: earliestInRing = ring[0]?.id
        opt earliestInRing > lastEventId + 1 (Lücke entfernt)
            EB->>Q: forcePush state_resync_required<br/>{ reason: 'ring_evicted', lastDeliveredId: 42, earliestAvailableId: earliestInRing }
            Note over EB,Q: id-loser synthetischer Frame, geht VOR der Wiederherstellung.<br/>Stream bleibt offen; SDK-Reducer schaltet awaitingResync um.
        end
    end
    loop Ringscan
        EB->>EB: for e in ring where e.id > (epochReset ? 0 : 42)
        EB->>Q: forcePush(e)
    end
    EB->>EB: attach AbortSignal listener<br/>(onAbort → queue.close({drain:false}); dispose)
    EB-->>SR: AsyncIterable
    SR->>Q: next() in for-await loop
```

Wenn zum Zeitpunkt des Abonnierens `subs.size >= maxSubscribers` ist, wird `SubscriberLimitExceededError` geworfen – die SSE-Route fängt ihn ab und serialisiert einen synthetischen `stream_error`-Frame an den abgelehnten Client, damit dieser keinen stillen, leeren Stream sieht. Die Rückgabe eines leeren Iterables würde den Betreibern die Sichtbarkeit nehmen ("einige Clients erhalten Ereignisse, andere nicht" unter Last).

### Ring-Entfernung → `state_resync_required` (der Wiederherstellungsablauf)

Wenn ein Consumer mit `Last-Event-ID: N` wieder verbindet und das früheste noch vorhandene Ereignis im Ring eine `id > N + 1` hat, wurden die Ereignisse in `[N+1, earliestInRing-1]` entfernt, bevor der Consumer wieder verbunden ist. Die naive Wiederherstellung würde stillschweigend mit einem nicht zusammenhängenden Suffix erfolgreich sein, der SDK-Reducer würde weiterhin Deltas anwenden, als ob der Stream zusammenhängend wäre, und sein Zustand würde von der Wahrheit des Daemons abweichen – ohne abschließendes Signal.

Implementiert in `EventBus.subscribe()`:

1. Zuerst Prüfung von `opts.lastEventId >= this.nextId`. Wenn wahr, stammt der Client-Cursor aus einer älteren Bus-Epoche (Daemon-Neustart / EventBus-Rekonstruktion), daher emittiert der Bus `reason: 'epoch_reset'` und spielt den gesamten aktuellen Ring ab.
2. Andernfalls Berechnung von `earliestInRing = this.ring[0]?.id`.
3. Wenn `earliestInRing > opts.lastEventId + 1`, per Force Push einen synthetischen Frame **vor** den Wiederherstellungsframes einfügen:
   ```jsonc
   {
     "v": 1,
     "type": "state_resync_required",
     "data": {
       "reason": "ring_evicted",
       "lastDeliveredId": <opts.lastEventId>,
       "earliestAvailableId": <earliestInRing>
     }
   }
   ```
4. Danach die normale Wiederherstellungsschleife fortsetzen.

Kritische Verträge (und was die Überprüfung #4360 korrigiert hat):

- **Keine `id`** – gleiches no-slot-Muster wie `client_evicted`, sodass es keinen Slot in der sessionbezogenen monotonen Sequenz belegt, die andere Abonnenten sehen.
- **Stream bleibt offen** – anders als `client_evicted` (wirklich terminal) ist `state_resync_required` wiederherstellungsorientiert. Wiederherstellungs- und Live-Frames fließen danach weiter.
- **Reducer überspringt Deltas automatisch** – die SDK-Seite setzt `awaitingResync = true` und wendet nur `state_resync_required`, die Terminal-Frames und Vollzustands-Snapshots an, bis der Consumer-Code `loadSession` aufruft und das Flag löscht. Siehe [`09-event-schema.md`](./09-event-schema.md) für `RESYNC_PASSTHROUGH_TYPES`.
- **Netzwerkfreundlich** – Frames bleiben auf der Leitung, sodass das SDK später ein "Was du verpasst hast"-Diff berechnen kann, falls gewünscht. Kein zusätzlicher Verbindungszyklus erforderlich.

### Terminaler Ablauf der Entfernung (Eviction)

Wenn der Live-Rückstand eines Abonnenten auf `maxQueued` ist und der nächste `push()` `false` zurückgibt:

1. Setze `sub.evicted = true`.
2. Erstelle `client_evicted`-Frame **ohne `id`** – `{ v: 1, type: 'client_evicted', data: { reason: 'queue_overflow', droppedAfter: <last delivered id> } }`.
3. `queue.forcePush(evictionFrame)`, damit der Consumer-Iterator einen terminalen Frame sieht.
4. `queue.close()`, damit die Iteration nach dem terminalen Frame beendet wird.
5. Rufe `sub.dispose()` auf – entfernt aus `subs` und löst den `AbortSignal`-Listener; ohne diese Bereinigung bleiben die Closures von blockierten Consumern bis zur Garbage Collection von `AbortSignal` aktiv.

### Abbruch-Ablauf (Abort)

`AbortSignal.abort()` → `onAbort()`:

1. `queue.close({drain: false})` – verwirft gepufferte Elemente, damit die SSE-Route nicht weiterhin Ereignisse an einen Socket serialisiert, den niemand hört.
2. `dispose()` – idempotent durch ein `disposed`-Flag.

Bereits abgebrochene Signale zum Zeitpunkt des Abonnierens rufen `onAbort()` synchron auf, bevor der Iterator zurückgegeben wird.

## Zustand & Lebenszyklus

- `nextId` beginnt bei 1 und wird nur erhöht. Der Getter `lastEventId` gibt `nextId - 1` zurück.
- `ring` ist begrenzt; Entfernung durch Shifting ist O(n) sobald voll. Bei `ringSize=8000` liegt das bei hochvolumigen Sessions im niedrigen Millisekundenbereich – weit unter dem Latenzbudget pro Frame. Ein Refactoring zu einem Ringpuffer wird zurückgestellt, bis Profiling es anzeigt oder Betreiber `--event-ring-size` um eine Größenordnung erhöhen.
- `close()` setzt `closed`, schließt die Warteschlange jedes Abonnenten und leert `subs`. Nachfolgende `publish()` / `subscribe()`-Aufrufe sind No-Ops (`publish` gibt `undefined` zurück; `subscribe` gibt `emptyAsyncIterable` zurück).
- Jede Session besitzt einen eigenen `EventBus`. Das Schließen des Busses erfolgt vor `channel.kill()`, sodass laufende `publish`-Aufrufe während des Herunterfahrens `undefined` zurückgeben, anstatt zu werfen.

## Abhängigkeiten

- Konsumiert von `packages/acp-bridge/src/bridge.ts` (`BridgeClient.sessionUpdate` / `BridgeClient.extNotification` → `events.publish(...)`).
- Konsumiert von `packages/cli/src/serve/server.ts` (SSE-Route-Handler → `events.subscribe(...)`, formatiert dann `BridgeEvent` in SSE-Wire-Frames).
- Re-Export-Shim: `packages/cli/src/serve/event-bus.ts` → `@qwen-code/acp-bridge/eventBus`.
- SDK-Consumer: `packages/sdk-typescript/src/daemon/sse.ts` (`parseSseStream`), dann `asKnownDaemonEvent` (siehe [`09-event-schema.md`](./09-event-schema.md), [`13-sdk-daemon-client.md`](./13-sdk-daemon-client.md)).

## Konfiguration

- `--event-ring-size <n>` – Ringtiefe pro Session; weich gedeckelt bei `MAX_EVENT_RING_SIZE = 1_000_000`.
- Subscriber-Query-Parameter `?maxQueued=N` auf `GET /session/:id/events`, Bereich `[16, 2048]`. SDK-Clients prüfen zuerst `caps.features.slow_client_warning`, bevor sie zustimmen.
- `BridgeOptions.eventRingSize` (überschreibt den Daemon-Standard für eingebettete Nutzung).
- Capability-Tags: `session_events`, `slow_client_warning`, `typed_event_schema`.

## Einschränkungen & bekannte Grenzen

- **Synthetische Frames haben keine `id`.** SDK-Consumer, die `Last-Event-ID` für die Wiederherstellung verwenden, zeichnen nur Frames mit IDs auf; `slow_client_warning`, `client_evicted`, `state_resync_required` und `replay_complete` bewegen den Cursor nicht und verbrauchen keine sessionspezifischen Sequenznummern. Wenn zwei ID tragende Live-Frames eine echte Lücke aufweisen, behandeln Sie dies über den Ring-Entfernungs-/Epochen-Reset-Resync-Pfad und nicht als privaten synthetischen Frame.
- `client_evicted` gilt **pro Abonnent**, nicht pro Session. Derselbe Client kann erneut verbinden.
- Der `BoundedAsyncQueue`-Iterator ist **nicht sicher für gleichzeitige Treiber** – zwei gleichzeitige `.next()`-Aufrufe würden um dasselbe Ereignis konkurrieren. Die Daemon-Nutzung ist sequentiell (`for await ... of` im SSE-Route-Handler), daher ist dies in der Produktion sicher.
- Der Bus ist derzeit paket-privat; Kanäle und die Weboberfläche müssen über die HTTP-SSE-Route des Daemons abonnieren, nicht direkt auf den Bus zugreifen. Stufe 1.5 wird dies beheben.

## Referenzen

- `packages/acp-bridge/src/eventBus.ts` (gesamte Datei)
- `packages/acp-bridge/src/bridge.ts` (Publish-Stellen, insb. `BridgeClient.sessionUpdate` und die F3-Berechtigungsereignisse)
- `packages/cli/src/serve/server.ts` (SSE-Route-Handler – formatiert `BridgeEvent` in Wire-SSE)
- `packages/sdk-typescript/src/daemon/sse.ts` (SSE-Wire-Parser auf der Client-Seite)
- Wire-Referenz: [`../qwen-serve-protocol.md`](../qwen-serve-protocol.md) (der `Last-Event-ID`-Wiederherstellungsvertrag).