# ACP-over-HTTP — Wiederaufnehmbarer Session-Event-Stream (`Last-Event-ID`)

> Status: Design + Implementierung in diesem PR.
> Schließt die Wiederaufnehmbarkeitslücke, die als RFD Phase 4 in
> [`README.md`](./README.md) §7 / Zeile "Resume cursor (ring `Last-Event-ID`)" erfasst ist.

## Problem

Der `/acp` Streamable-HTTP Session-Event-Stream (`GET /acp` mit einem `Acp-Session-Id` Header) ist **live-only**: Er gibt weder eine SSE `id:`-Sequenz aus noch berücksichtigt er einen `Last-Event-ID` Request-Header beim erneuten Verbinden.

Wenn ein Control-Plane-Proxy die langlebige SSE-Verbindung mitten in einem Turn aufgrund von Inaktivität schließt (der Daemon selbst sendet `retry: 3000`, und Ingress-Proxys trennen lange SSE-Verbindungen häufig), verbindet sich der Client neu und übernimmt erneut die Ownership, aber **jeder Content-Frame, den der Daemon während der Lücke erzeugt hat, geht verloren** — `session/update`-Benachrichtigungen, die `agent_thought_chunk` / `agent_message_chunk` tragen. Der Turn erreicht dennoch einen Terminalzustand (ein `turn_complete` wird erzeugt/synthetisiert), sodass die UI "done" mit einem leeren oder abgeschnittenen Body anzeigt. Das erneute Senden desselben Prompts funktioniert, was der entscheidende Hinweis ist: Der Verlust liegt in der Transportlücke, nicht im Modell.

Symptome und Feldbelege sind in den Integrationsnotizen als **§1.8** (`sdk-known-issues.md`) katalogisiert.

## Was bereits existiert (und warum das hier klein ist)

Die Replay-Engine ist **bereits gebaut und im Einsatz bewährt** — die Lücke besteht nur darin, dass der `/acp`-Transport nicht damit verbunden ist.

`packages/acp-bridge/src/eventBus.ts`:

- Monotone, sitzungsspezifische `id`, beginnend bei 1 (`nextId`, zugewiesen in `publish()`).
- Begrenzter Ringbuffer pro Session (`DEFAULT_RING_SIZE = 8000`, Operator-Override `qwen serve --event-ring-size`).
- `subscribeEvents(sessionId, { lastEventId, signal })` spielt Ring-Frames mit `id > lastEventId` ab, bevor Live-Events fließen, und gibt die synthetischen Control-Frames `replay_complete`, `state_resync_required` (aus dem Ring verdrängt / Epoch-Reset bei Daemon-Neustart), `client_evicted`, `slow_client_warning` aus.

Die **REST**-Surface `GET /session/:id/events` nutzt bereits all dies: Sie liest `last-event-id` (`server.ts` → `parseLastEventId`), übergibt sie an `subscribeEvents` und serialisiert jeden Frame mit einer SSE `id:`-Zeile (`formatSseFrame`). Der Bug ist, dass der **`/acp`-Transport** nichts davon tut:

| Layer                                     | REST `/session/:id/events` | `/acp` GET (heute)                            |
| ----------------------------------------- | -------------------------- | --------------------------------------------- |
| liest `Last-Event-ID` Header              | ja                         | **nein**                                      |
| übergibt `lastEventId` an `subscribeEvents` | ja                       | **nein** (`dispatch.ts pumpSessionEvents`)    |
| gibt SSE `id:`-Zeile aus                  | ja (`formatSseFrame`)      | **nein** (`SseStream.send` schreibt nur `data:`) |

`acp-http/sse-stream.ts` sagt dies sogar in einem Kommentar: _"no ring-buffer `id:` sequencing — resumability is RFD Phase 4, deferred."_ Dieser PR entfernt diese Verschiebung.

## Wire-Entscheidung — SSE `id:`-Zeile (nicht `_meta` im Payload)

Die beiden SSE-Surfaces tragen **unterschiedliche Payloads**:

- REST streamt **`BridgeEvent`-Envelopes** (`{ id, v, type, data, _meta }`). Der SDK-Parser (`sdk-typescript/src/daemon/sse.ts`) extrahiert den Cursor aus dem **`id`-Feld der JSON-Envelope** (er liest nur `data:`-Zeilen).
- `/acp` streamt **rohe JSON-RPC 2.0-Objekte** (`session/update`-Benachrichtigungen, `session/request_permission`-Requests, Responses). Diese haben keine Envelope-`id`, um einen Bus-Cursor zu tragen, und eine JSON-RPC-`id` bedeutet etwas anderes (Request-ID).

Daher ist der Resume-Cursor für `/acp` die **Standard-SSE `id:`-Zeile**:

- Sie ist EventSource-nativ — ein spezifikationskonformer SSE-Client (inkl. des vendorten `AcpHttpTransport`) trackt automatisch die letzte `id:` und sendet sie beim erneuten Verbinden automatisch als `Last-Event-ID` Header zurück.
- Sie hält den JSON-RPC-Payload sauber (keine Injektion von nicht standardkonformen `_meta.qwen.eventId` in Protokoll-Frames).
- Sie spiegelt wider, was `formatSseFrame` bereits bei REST ausgibt, sodass beide Surfaces dieselben `eventBus`-IDs und dieselbe `Last-Event-ID`-Semantik teilen.

Nur **Bus-ursprüngliche** Frames tragen eine `id:` (`session/update`, `session/request_permission`, vom Daemon gepushte Notifies). JSON-RPC-**Responses/Replies**, die den Session-Stream nutzen, sind _keine_ Bus-Events und tragen **keine** `id:` — sie sind nicht im Ring und werden absichtlich nicht vom Replay getrackt (eine verlorene In-Flight-Prompt-_Response_ ist das separat verfolgte §1.7-Problem, das hier nicht im Scope ist; §1.8 handelt von verlorenen _Content_-Frames, bei denen es sich ausschließlich um Bus-`session/update`-Events handelt).

Synthetische Terminal-Frames (`client_evicted`, `stream_error`, …) haben keine Bus-`id` und geben daher keine `id:`-Zeile aus — passend zu REST, damit sie keinen Slot in der monotonen Sequenz verbrauchen, von der aus der Client das Resume durchführt.

## Änderungen

1. **`transport-stream.ts`** — `send(message, id?: number)`. Die optionale `id` ist die Bus-Event-ID für das SSE-Cursor-Tracking.
2. **`sse-stream.ts`** — `send(message, id?)` stellt `id: ${id}\n` vor die `data:`-Zeile, wenn `id !== undefined` (spiegelt `formatSseFrame`).
3. **`ws-stream.ts`** — `send(message, id?)` akzeptiert und **ignoriert** `id`: WebSocket ist eine zustandsbehaftete Verbindung, kein SSE-Replay (konsistent mit `AcpWsTransport.supportsReplay = false`).
4. **`connection-registry.ts`** — `sendSession(sessionId, frame, id?)` reicht `id` an `stream.send` weiter. Der sitzungsspezifische Pre-Attach-**Buffer** speichert `{ frame, id? }`-Paare, sodass ein gepuffertes Frame seinen Cursor behält, wenn es beim Attach geflusht wird. (Der verbindungsweite Buffer bleibt unverändert – diese Frames sind JSON-RPC-Responses ohne Bus-ID.)
5. **`dispatch.ts`**
   - `translateEvent` übergibt `event.id` bei jedem `sendSession`- / `binding.stream.send`-Aufruf für Bus-Events.
   - `pumpSessionEvents(conn, sessionId, signal, lastEventId?)` leitet `lastEventId` an `subscribeEvents` weiter – wobei das vorhandene Ring-Replay direkt wiederverwendet wird.
6. **`index.ts`** — der `GET /acp` Session-Stream-Branch liest den `Last-Event-ID` Header (über ein striktes `parseLastEventId`, dieselbe Regel "nur Dezimalziffern akzeptieren" wie bei REST) und übergibt ihn an `pumpSessionEvents`.

Keine `eventBus`-/Bridge-Änderungen – die Engine wird unverändert wiederverwendet.

## Damit Resume tatsächlich greift (Session-Stream Grace/Reclaim)

Die obige `id:`/`Last-Event-ID`-Verkabelung ist notwendig, aber **nicht hinreichend** — allein löst sie im echten Flow nichts aus. Zuvor führte der GET-Handler bei einem Transport-Level-Abbruch eines Session-SSE-Streams den **vollständigen** `closeSessionStream`-Teardown durch: Er entfernte die Session aus `ownedSessions`, brach den In-Flight-Prompt ab und trennte den Bridge-Client. In der echten EventSource/Proxy-Reihenfolge (alter Socket schließt _zuerst_, dann verbindet der Client neu) bedeutet das, dass ein Reconnect mit `Last-Event-ID` von der Ownership-Prüfung mit **403** abgelehnt wird, bevor der Cursor überhaupt gelesen wird – und der Prompt, der den Content erzeugt hat, wurde bereits abgebrochen. Die Replay-Engine hätte nichts, wozu sie sich neu verbinden könnte.

Daher führt ein Transport-Level-Session-Stream-Abbruch jetzt nur noch ein **Detach** durch (`AcpConnection.detachSessionStream`), anstatt einen Teardown auszulösen: Er stoppt nur den Stream + sein Event-Abonnement und **hält das Binding, die Ownership, den In-Flight-Prompt und die Bridge-Client-Registrierung** für ein Grace-Window (`SESSION_GRACE_MS`, analog zu `CONN_GRACE_MS`) am Leben. Ein Reconnect innerhalb des Fensters hängt sich wieder an (`attachSessionStream` löscht den Grace-Timer – Reclaim) und das Ring-Replay füllt die Lücke. Wenn kein Reconnect eintrifft, löst der Grace-Timer den vollständigen Teardown aus – was die Kosten für einen durchgehenden Prompt begrenzt. Der vollständige Teardown bleibt bei einem expliziten `session/close` und beim Verbindungs-Teardown (`destroy`) sofort. Der GET-Handler verzweigt anhand von `stream.isClosed`: Ein Transport-Abbruch → Detach-with-grace; eine Pump, die endet, während der Stream noch offen ist (Subprozess fertig / Iterator-Fehler) → vollständiges Schließen (Zombie-Stream).

### Zwei Replay-Korrektheits-Guards, die dadurch freigeschaltet werden

Beide sind latent, bis Resume tatsächlich läuft; das obige Grace/Reclaim macht sie erreichbar, daher werden sie zusammen ausgeliefert:

- **Keine Doppelzustellung UND kein stiller Verlust (Buffer ↔ Ring).** Ein gepuffertes Bus-Event befindet sich _auch_ im EventBus-Ring (es wurde dort veröffentlicht, um seine ID zu erhalten). Daher erhält `attachSessionStream` bei einem Resume (`Last-Event-ID` vorhanden) den Cursor und **flusht überhaupt keine ID-tragenden gepufferten Frames** – das Ring-Replay (gestartet am Cursor des Clients) ist der einzige Zustellungspfad für jedes Bus-Event nach dem Cursor. Dies ist absichtlich _nicht_ "Buffer flushen, dann den Replay-Cursor darüber hinaus schieben": Ein Frame, der an den jetzt toten Socket gesendet, aber nie vom Client empfangen wurde, hat eine ID _unterhalb_ der Buffer-IDs, aber _oberhalb_ des Client-Cursors. Würde man den Cursor über den Buffer hinweg schieben, würde dieser **stillschweigend verworfen werden**. Wenn der Ring alle Bus-Events besitzt, wird jedes genau einmal ohne Lücke zugestellt. ID-_lose_ Frames (über `replySession` geroutete JSON-RPC-Replies) sind keine Ring-Events, der Ring wird sie also nicht erneut zustellen – aber sie dürfen auch beim Attach nicht geflusht werden: Ein gepuffertes `session/prompt`-_Result_, das vor dem Replay geflusht wird, würde vor den Content-Chunks ankommen, die ihm vorausgingen (der Client sieht "done" vor dem Body – genau der Truncated-Body-Fehler, den §1.8 behebt). Daher werden beim Resume die ID-losen Frames **zurückgestellt**: Sie verbleiben im Buffer, und die Event-Pump gibt sie frei (`flushBufferedSessionFrames`), sobald das Replay abgearbeitet ist – **nur** bei `replay_complete`, um die ursprüngliche Stream-Reihenfolge beizubehalten. Wichtig: NICHT bei `state_resync_required`: Der EventBus gibt diesen Frame _vor_ den Replay-Frames aus (und gibt dann am Ende immer noch `replay_complete` aus), ein Flush dabei würde die Reply vor den replayten Content setzen. Der Live-only-Fall (keine `Last-Event-ID` ⇒ kein Replay ⇒ kein `replay_complete`) wird durch den Post-Loop-Safety-Flush der Pump abgedeckt. (Ein Fresh-Connect ohne `Last-Event-ID` hat keinen Ring-Anker, daher flusht er den gesamten Buffer sofort und in der Reihenfolge wie zuvor.)
- **Idempotente `permission_request` unter Replay.** Eine `permission_request` ist ein ID-tragendes Ring-Event, daher replayt ein Reconnect, dessen Cursor einer noch unbeantworteten Permission vorausgeht, diese. `translateEvent` verwendet nun den vorhandenen `conn.pending`-Eintrag für diese `bridgeRequestId` erneut (sendet dieselbe ausgehende JSON-RPC-ID zum Aufholen erneut), anstatt eine zweite ID + einen zweiten Eintrag zu prägen – kein verwaistes Pending, kein Double-Prompt für einen Client, der auf `_meta.requestId` dedupliziert.

`parseLastEventId` wird in ein gemeinsames `serve/sse-last-event-id.ts` extrahiert, das von beiden REST- und `/acp`-Surfaces verwendet wird, sodass ihre strengen Accept/Reject-Regeln und das Operator-Logging nicht auseinanderdriften können.

## Abwärtskompatibilität

- **Alte Clients, die keine `Last-Event-ID` senden** → `lastEventId` ist `undefined` → `subscribeEvents` startet live, genau wie heute.
- **Das Hinzufügen von `id:`-Zeilen ist abwärtskompatibles SSE** – ein Client, der das Feld ignoriert, ist nicht betroffen; ein EventSource-basierter beginnt kostenlos, es zu tracken.
- **Der vendorte SDK-`AcpHttpTransport` optet in diesem PR in das Replay ein** – er setzt `supportsReplay = true` und sendet `Last-Event-ID` beim Reconnect erneut, sodass Lücken-Frames aus dem Ring replayt werden und der §1.8-Content-Verlust geschlossen wird, **ohne dass weitere Daemon-Änderungen erforderlich sind**. (Der separate externe `agent-web`-Transport-Flip bleibt verschoben – siehe "Nicht im Scope".) Die Daemon-Änderung bleibt für jeden Consumer inert, der weiterhin `supportsReplay = false` meldet und den Header weglässt.
- Die REST-Surface bleibt unberührt.

## Testplan

- `sse-stream.test.ts` — `send(msg, 7)` gibt `id: 7\n` vor `data:` aus; `send(msg)` (keine ID) lässt die `id:`-Zeile weg; Reihenfolge `id:` → `data:` → Leerzeile.
- `transport.test.ts` (End-to-End über den `/acp`-Transport):
  - Live-`session/update`-Frames kommen jetzt mit einer `id:`-Zeile an;
  - ein `GET /acp` mit `Last-Event-ID: N` leitet den Cursor an `subscribeEvents` weiter; ein neuer Stream ohne Header verhält sich wie heute;
  - eine überlaufende `Last-Event-ID` (> `MAX_SAFE_INTEGER`) → live-only;
  - **echte Close-then-Reconnect-Reihenfolge**: alten SSE _zuerst_ schließen, dann mit `Last-Event-ID` neu verbinden – **200 nicht 403** assertieren (Ownership behalten) und der Prompt wird **nicht** abgebrochen (Grace/Reclaim);
  - eine replayte `permission_request` verwendet den Pending-Eintrag erneut (dieselbe ausgehende ID).
- `connection-registry.test.ts` — ein Non-Resume-Attach flusht den gesamten Buffer und reicht die `id` jedes Frames durch; ein **Resume**-Attach (Cursor vorhanden) überspringt die ID-tragenden Frames (Ring-Replay besitzt sie), flusht aber weiterhin ID-lose JSON-RPC-Replies; `detachSessionStream` behält Ownership/Prompt über das Grace-Window bei und führt dann beim Ablauf den Teardown durch; ein Reconnect innerhalb des Fensters reclaimt (bricht den ausstehenden Teardown ab).
- `ws-stream.test.ts` — `send(msg, id)` ignoriert die ID: Der WS-Wire-Frame ist das nackte JSON, kein SSE-`id:`-Framing sickert durch.

## Nicht im Scope (weiterhin verschoben)

- WebSocket- / HTTP/2-Transports.
- §1.7 Verbindungsübergreifendes Permission-Resolve (ein Vote, das auf einer anderen `Acp-Connection-Id` gepostet wird als der, die den Prompt gestreamt hat) – ein separates, sicherheitskritisches Anliegen, das als eigenes Follow-up verfolgt wird. Dieser PR macht die `permission_request`-Übersetzung zwar idempotent unter Replay (siehe oben), fügt aber nicht das sitzungsglobale RequestId-Resolve hinzu. Er fügt auch keine **Response-Replay-Idempotenz für eine BEREITS AUFGEKLÄRTE Permission** hinzu: Sobald der Client gevotet hat, wird der Pending-Eintrag verbraucht, sodass ein späterer Reconnect, der die (noch im Ring befindliche) `permission_request` replayt, den Prompt mit derselben `_meta.requestId` erneut sendet. Ein konformer Client dedupliziert anhand dieser ID (der Vertrag, auf den sich der Replay-Pfad bereits verlässt) und der verbleibende verwaiste Pending-Eintrag wird beim Teardown aufgeräumt – der Agent blockiert nie – aber das Aufzeichnen von aufgelösten Ergebnissen in einer begrenzten sitzungsspezifischen LRU, um das aufgezeichnete Vote erneut zu senden (volle Idempotenz für nicht-deduplizierende Clients), gehört in dasselbe Permission-Koordinations-Follow-up, da es den Zustand der aufgelösten Permission zum Vote-Pfad hinzufügt.
- Die verlorene In-Flight-_Prompt-Response_ auf dem Session-Stream – wiederhergestellte Content-Frames fließen alle durch den `eventBus`-Ring; eine JSON-RPC-Response ist kein Ring-Event.
- Consumer-seitiger `supportsReplay`-Flip im externen `agent-web`-`AcpHttpTransport` (befindet sich in einem anderen Repo; wird durch diesen PR entblockt).
- **Permission-Voting über die exportierten SDK-Transports.** Der exportierte `AcpHttpTransport`/`AcpWsTransport` stellt `session/request_permission` als `permission_request`-Event bereit, aber die Vote-APIs des SDK (`respondToPermission` / `respondToSessionPermission`) mappen auf einen `session/permission`-Request, für den der ACP-Daemon keinen Handler hat – er akzeptiert ein Permission-Vote nur als JSON-RPC-_Response_, die die ausgehende `_qwen_perm_N`-ID echo't. Die Verkabelung des Vote-Roundtrips ist Teil des §1.7 Permission-Koordinations-Follow-ups. Ein verwandter Aspekt: Die No-Subscriber-Session-**Reply-Pump** (`ensureSessionReplyPump`) öffnet einen echten `GET /acp` Session-Stream, den der Daemon als Live-Stream behandelt – daher wird ein Agent-`permission_request`, der ausgelöst wird, während nur die Reply-Pump angehängt ist, an diesen Stream ROUTED und von der Pump verworfen (sie leitet nur JSON-RPC-Responses weiter), was den Mediator aufhängt, wohingegen der Daemon bei gar keinem Stream Cancel-Denies ausführt und der Agent fortfährt. Sowohl die Daemon-seitige Unterscheidung "Ist das ein echter Consumer oder nur eine Reply-Pump?" als auch die SDK-seitige Behandlung (lokal ablehnen / an einen Permission-Callback weitergeben) gehören in dasselbe Permission-Koordinations-Follow-up, da die Pump selbst kein Vote abgeben kann. Consumer, die Permission-Handling benötigen, sollten `subscribeEvents` öffnen, bevor sie Session-RPCs ausgeben (der dokumentierte Vertrag), was dem Daemon einen echten Consumer-Stream gibt.
- **Session-RPCs, die innerhalb der `subscribeEvents`-Schleife auf dem exportierten `AcpHttpTransport` ausgegeben werden.** Der Session-`/acp`-Stream ist Single-Reader: Während der Async-Generator eines Consumers zwischen `yield`s parkt, drainiert der Reader nicht. Wenn der Consumer innerhalb seiner eigenen Event-Handling-Schleife auf ein Session-geroutetes RPC (`session/set_model`, `session/prompt`, …) `await`et, unterdrückt `sendRequest` die Background-Reply-Pump (ein Abonnement ist "aktiv"), aber der geparkte Generator liest die Reply nie – der Aufruf hängt, bis der Consumer das nächste Event pullt. Der robuste Fix besteht darin, den Session-Reader zu einer Background-Pump zu machen, die immer JSON-RPC-Replies drainiert und nur `DaemonEvent`s für den Iterator queued; verschoben als fokussiertes Follow-up, da es sich um eine strukturelle Änderung an einem Opt-in, neu exportierten Transport handelt und den Standard-REST-Transport nicht beeinflusst.
- **Automatischer Guard für die `SESSION_STREAM_REPLY_METHODS` ⇄ `replySession`-Drift.** Das SDK-Set `SESSION_STREAM_REPLY_METHODS` muss die `replySession(...)`-Call-Sites des Daemons in `dispatch.ts` (ein anderes Package) spiegeln; eine Methode, die dort hinzugefügt wird, ohne sie hier hinzuzufügen, öffnet keine Reply-Pump und ein No-Subscriber-`sendRequest` dafür hängt bis zum Abbruch. Das Typsystem keines der beiden Packages erzwingt dies. Ein CI-Guard (ein leichtgewichtiges Skript oder Vitest, das die Session-Reply-Methodennamen des Daemons extrahiert und sie mit dem SDK-Set diffed) ist der richtige Fix, aber Cross-Package-Static-Analysis-Tooling ist eine eigene fokussierte Aufgabe – und kein triviales Grep: Ein korrekter Extraktor benötigt eine leichte Dataflow-Analyse, da die Reply von `session/prompt` NICHT innerhalb seines `case 'session/prompt'`-Blocks ausgegeben wird. Der Prompt wird asynchron gestartet und sein `replySession(...)` feuert später vom Prompt-Completion-Handler (einer anderen Call-Site), sodass ein naiver Scan "Welche `case`-Blöcke enthalten `replySession`" `session/prompt` fälschlicherweise AUSKLAMMERN würde und den Build gegen ein korrektes Set fehlschlagen lässt. Das Set ist in der Zwischenzeit klein und stabil, und die JSDoc der Konstante dokumentiert die Invariante; der robuste Langzeit-Fix besteht darin, dass der Daemon seine Session-gerouteten Methodennamen bekannt gibt (eine gemeinsame Source of Truth), anstatt `dispatch.ts` zu scrapen.