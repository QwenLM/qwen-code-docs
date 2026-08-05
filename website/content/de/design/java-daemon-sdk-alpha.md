# Java-Daemon-SDK 0.1.0-alpha

## Status

Dieses Dokument definiert den ersten Daemon-Transport im bestehenden
`com.alibaba:qwencode-sdk`-Artefakt. Es ist bewusst unabhängig von der
Legacy-stdio-Implementierung unter `com.alibaba.qwen.code.cli`.

## Ziele

- Eine Java-11-API für `qwen serve` hinzufügen, ohne ein weiteres
  Maven-Artefakt zu erzeugen.
- Gestreamte Text-, Thought-, Tool-, Usage-, Permission- und Raw-Events in
  Daemon-Reihenfolge liefern.
- Prompt-Text erst nach einem passenden zuverlässigen Terminal-Event
  zurückgeben.
- Einen Prompt-Stream ab dem Admission-Watermark ohne Replay-Lücken oder
  doppelte Observer-Zustellung fortsetzen.
- Mehrdeutige Mutationsergebnisse und unvollständige Prompt-Ergebnisse
  explizit machen.
- Client-eigene Threads, Streams, Sessions und Detach-Versuche begrenzt
  halten.

## Öffentliche Fläche

`DaemonClient` besitzt HTTP- und Worker-Ressourcen, liest Capabilities und
erzeugt Sessions. Die Session-Erzeugung verwendet standardmäßig
`sessionScope=thread`. Blockierende Prompt-Beobachtung nutzt einen
konfigurierbaren begrenzten Worker-Pool statt eines globalen oder
unbegrenzten Executors. Der geteilte Timer dispatcht nur Watchdog-Aktionen.
Potenziell blockierendes Schließen von SSE-Streams läuft auf einem separaten
begrenzten Pool, der auf das Prompt-Concurrency-Limit dimensioniert ist,
damit ein hängender Close weder die Deadline noch den Idle-Watchdog einer
anderen Session verzögern kann. Jeder zugelassene Prompt reserviert begrenzte
Stream-Cleanup-Kapazität, bis seine finale Close-Aufgabe abgeschlossen ist.
Ein Prompt publiziert sein Terminal, sobald sein Prompt-Slot freigegeben ist,
während sein eigener Stream noch schließt, sodass diese Kapazität einen
drainenden Cleanup pro Prompt-Slot erlaubt; eine Terminal-Fortsetzung kann
den nächsten Prompt auch am Concurrency-Limit starten. Closes, die über
diesen Spielraum hinaus hängen bleiben, können einen späteren
`startPrompt`-Aufruf weiterhin mit `DaemonClientCapacityException`
fehlschlagen lassen, aber sie können keinen Deadline-ausgelösten Close
stillschweigend verwerfen oder die Cleanup-Arbeit unbegrenzt wachsen lassen.

`DaemonSessionClient` besitzt eine Daemon-Session und lässt höchstens einen
lokalen Prompt gleichzeitig zu. `startPrompt` gibt sofort einen `PromptCall`
zurück. Seine Admission- und Terminal-Futures sind unabhängig, sodass ein
Aufrufer zwischen „der Daemon hat diesen Prompt akzeptiert" und „der Turn
endete zuverlässig" unterscheiden kann. Fortsetzungen von Admission- und
Terminal-Future werden über einen separaten, Client-eigenen Executor
dispatcht, damit Nutzer-Fortsetzungen die SSE-Beobachtung, ihren lokalen
Timeout oder die Prompt-Transport-Kapazität nicht verzögern können.
Exceptionelle Vervollständigung folgt demselben Pfad. Die
Publikationskapazität ist relativ zu `maximumConcurrentPrompts` begrenzt;
Fortsetzungen, die blockiert bleiben, können daher einen späteren
`startPrompt`-Aufruf mit `DaemonClientCapacityException` fehlschlagen lassen,
statt unbegrenzte Threads oder Queued-Work zu erzeugen.

Eine unbestimmte Vervollständigung ist keine Session-Wiederverwendungs-
Grenze. Nachdem die Admission unbekannt wird oder ein zugelassener Prompt
unbestimmt endet, lehnt der Session-Client weitere Prompts dauerhaft ab, auch
wenn lokales Stream-Cleanup erfolgreich ist. Ein lokaler Beobachtungs-Timeout
wird publiziert, ohne unbegrenzt auf das Stream-Schließen zu warten; das
Cleanup läuft asynchron weiter und behält begrenzte Client-Kapazität, bis es
abschließt. Aufrufer schließen oder destroyen die betroffene Session.

`PromptObserver` erhält typisierte Callbacks und das Raw-Event. Callbacks
laufen seriell auf einem Client-eigenen Daemon-Thread. Ein Event-Cursor
schreitet nur voran, nachdem alle anwendbaren Callbacks erfolgreich
zurückgekehrt sind. Callbacks müssen daher prompt zurückkehren, dürfen nicht
auf denselben `PromptCall` warten und dürfen dieselbe Session nicht aus einem
Callback schließen oder destroyen. Auf eine Permission aus ihrem Callback zu
antworten wird unterstützt; die Antwort-Methode gibt `false` zurück, wenn der
Daemon meldet, dass die Anfrage bereits aufgelöst oder nicht mehr pending
ist.

`promptText` ist eine Komfortfunktion über `startPrompt`. Es sammelt nur
Assistant-Text, erzwingt ein UTF-8-Byte-Limit und gibt ein
`PromptTextResult` nur für ein passendes `turn_complete` zurück. Ein
`turn_error` bleibt ein zuverlässiges Terminal, wird aber als
`PromptTurnException` gemeldet; jedes Ergebnis ohne zuverlässiges Terminal
wird als `PromptOutcomeIndeterminateException` gemeldet, mit explizit
unvollständigem partiellem Text, wenn verfügbar.

Fastjson2-Encoding und striktes Jackson-Core-Decoding sind
Implementierungsdetails. Das Decoding lehnt Nicht-Standard-JSON und
doppelte Objekt-Keys ab. Öffentliche Raw-JSON-Werte verwenden Java-`Map`,
`List`, Skalare und Nullwerte.

Modellauswahl zum Erzeugungszeitpunkt wird in dieser Alpha bewusst nicht
freigegeben. Der Daemon hält eine frische Session auf dem Default-Modell am
Leben, wenn `modelServiceId` abgelehnt wird, und meldet die Ablehnung nur
über ein SSE-Event, das vor der Create-Response emittiert wird. Das
Pro-Prompt-Abonnement startet ab dem späteren Admission-Watermark, sodass es
nicht beweisen kann, dass das angefragte Modell ausgewählt wurde, ohne einen
separaten Session-Event-Lebenszyklus hinzuzufügen.

Vor der Session-Erzeugung verlangt das SDK, dass der Daemon REST und
`session_scope_override` bewirbt; es verweigert Mutationen, wenn ein älterer
Daemon den angefragten Scope stillschweigend ignorieren könnte. Während eine
Session offen bleibt, sendet das SDK eine neue Heartbeat-Mutation einmal pro
konfiguriertem Intervall (standardmäßig eine Minute), nur wenn der Daemon
`client_heartbeat` bewirbt, und stoppt bei Detach oder Destroy. Jeder
Heartbeat hat die normale Finite-Request-Deadline und wird nicht erneut
versucht; das Intervall auf Null zu setzen deaktiviert automatisches
Keepalive. Ebenso wird ein Prompt mit `deadlineMs` vor der Admission
abgelehnt, sofern der Daemon nicht `prompt_absolute_deadline` bewirbt, damit
eine angefragte Server-seitige Deadline nicht stillschweigend ignoriert
werden kann. Der lokale Beobachtungs-Timeout bleibt unabhängig und wird immer
vom SDK erzwungen.

## Wire-Ablauf

1. Sende ein einziges, nicht erneut versuchtes `POST /session/:id/prompt`.
2. Verlange `202` und validiere `{promptId,lastEventId,eventEpoch?}`.
3. Öffne `GET /session/:id/events` mit `Last-Event-ID` auf das Watermark
   gesetzt und `X-Qwen-Event-Epoch` gesetzt, wenn der Daemon eine Epoche
   geliefert hat.
4. Spiele Events zurück und beobachte nur Events, die mit diesem Prompt
   korreliert sind, während Session-Level-Fehler-Frames als fatal behandelt
   werden.
5. Stoppe nur bei passendem `turn_complete` oder `turn_error`.

Dieses Pro-Prompt-Abonnement deckt Content- und Terminal-Events ab, die
emittiert werden, bevor die `202`-Response den Client erreicht. Es erfordert
keinen Unknown-Prompt-Cache oder eine langlebige Session-Pumpe.

## Transport-Vertrag

Der JDK-`HttpClient` verwendet HTTP/1.1 und folgt niemals Redirects. Jeder
Request sendet JSON- oder Event-Stream-`Accept`-Header, Bearer-
Authentifizierung wenn konfiguriert, und die vom Daemon ausgestellte
`X-Qwen-Client-Id` nach der Session-Erzeugung. SSE sendet zusätzlich
`Accept-Encoding: identity`, `Cache-Control: no-cache` und `Last-Event-ID`.
Wenn verfügbar, reist `X-Qwen-Event-Epoch` mit diesem Cursor. Der Client
seeded ihn aus der Prompt-Admission, lernt ihn aus einem validierten
SSE-Response-Header für Kompatibilität, behält einen bekannten Wert, wenn
eine Response den Header weglässt, und verfährt fail-closed, wenn sich der
Wert während der Prompt-Beobachtung ändert.

Finite JSON- und Error-Bodies werden von einem begrenzten Subscriber
konsumiert und über `sendAsync` gegen die Request-Deadline geraced; der
Empfang von Response-Headers beendet diese Deadline nicht. Nicht-erfolgreiche
SSE-Bodies werden separat durch das kürzere der Request- und
Prompt-Beobachtungs-Budgets begrenzt.

Der SSE-Parser akzeptiert LF- und CRLF-Framing, Kommentare und mehrere
`data:`-Zeilen. UTF-8-Decoding ist strikt. Frames, Event-Namen,
Envelope-Version, numerische IDs und SSE/Envelope-ID-Konsistenz werden
validiert. Ein missgebildetes Frame, eine ID-Lücke, `state_resync_required`,
Session-Death, Observer-Versagen, Idle-Timeout oder erschöpfte Reconnects
fahren fail-closed.

IDs auf oder unter dem committed Cursor sind Duplikate und werden nicht
zugestellt. Das nächste numerische Event muss exakt `cursor + 1` sein.
Synthetische ID-lose Events werden nur für die dokumentierten Control-Frames
des Daemons akzeptiert und bewegen den Cursor nicht; ein ID-loses Content-
oder Terminal-Event fährt fail-closed. Die Implementierung verbindet nur den
SSE-GET erneut, mit begrenztem exponentiellem Full-Jitter-Backoff, der
SSE-`retry`-Direktive nach einem Stream-Disconnect und `Retry-After` bei
retrybaren HTTP-Responses. Mutationen werden niemals automatisch erneut
versucht.

## Mehrdeutige und terminale Ergebnisse

Wenn der Prompt-Transport nach dem Dispatch ohne validierte `202`
fehlschlägt oder HTTP 408 oder 5xx zurückgibt, schlägt das Admission-Future
mit `PromptAdmissionUnknownException` fehl; das SDK postet den Prompt niemals
erneut. Die Session-Erzeugung wendet dieselbe konservative Klassifikation
über `SessionCreationOutcomeUnknownException` an. Permission, Cancel,
Heartbeat, Detach und Delete wenden dieselbe Klassifikation an, da eine
Zwischen-Response nicht beweist, dass der Daemon die Mutation abgelehnt hat.
Detach verwendet die spezifischere `DetachOutcomeUnknownException`. Jede
Mutation wird höchstens einmal pro Methodenaufruf versucht.

Nur passende `turn_complete` und `turn_error` sind terminal. Queue- und
`prompt_cancelled`-Events sind beratend. Ein lokaler Timeout stoppt die
Beobachtung, cancelt aber nicht automatisch den Daemon-Turn. Eine
kooperative Daemon-Cancellation schließt als `turn_complete` mit
`stopReason=cancelled` ab, während ein Agent- oder Provider-Fehlschlag
während der Cancellation `turn_error` erzeugen kann. `promptText()` gibt das
vollständige Ergebnis zurück und zeigt das Error-Terminal als
`PromptTurnException`; Aufrufer müssen in beiden Fällen auf das Terminal
warten. Wenn Cancellation, Deadline, Teardown oder Agent-Settlement um die
Wette laufen, publiziert der Exactly-once-Latch des Daemons das erste formale
Terminal und unterdrückt spätere Kandidaten. Das SDK behandelt daher das
empfangene Terminal als maßgeblich, statt ein Ergebnis aus der letzten
Control-Mutation abzuleiten, die es gesendet hat.

`close()` ist lokal idempotent, stoppt die lokale Beobachtung und versucht
Detach höchstens einmal. Eine verlorene Detach-Response wird nicht erneut
versucht. `destroySession()` ist die einzige API, die `DELETE /session/:id`
ausstellt; sie kann nach Detach aufgerufen werden.

## Kompatibilität und Nicht-Ziele

Das gesamte Artefakt erfordert jetzt Java 11. Java-8-Nutzer müssen auf
`0.0.3-alpha` bleiben. Die stdio-API bleibt quellkompatibel, läuft jetzt aber
auf Java 11 und erhält Logging über `slf4j-api`; Anwendungen wählen ihren
eigenen SLF4J-Provider, da Logback nur für Tests ist.

Der kompatible Daemon ist der qwen-code-Build, der aus derselben
Quell-Revision wie das SDK released wurde. Er enthält das Pro-Client-Detach-
Ledger aus #7386, die Pro-Epoche-Terminal-Garantie aus #7400,
Restart-sichere Event-Cursor-Epochen aus #7458 sowie die in diesem Release
enthaltenen acknowledged Admission Cancellation plus FIFO-Cancel-Drain-Zaun.
Allein der #7400-Commit kann einen Cancel weiterhin vor dem Agent-Dispatch
acknowledgen, ohne den zugelassenen Prompt zu stoppen, oder einen nicht
acknowledgten Session-scoped Cancel einen queued Nachfolger erreichen lassen.
Das gebündelte ACP-Child behandelt die interne Cancellation-Anfrage des
Daemons über einen einzigen acknowledged Admission-fähigen Handshake. Ein
eigenes standards-konformes ACP-Child, das diese Erweiterung nicht
implementiert, erhält stattdessen eine Standard-`session/cancel`-
Notification. Der Daemon bewirbt keine Capability, die diese
Implementierungen mit demselben REST/SSE-Feature-Set unterscheidet, sodass
das SDK dieses Minimum nicht zur Laufzeit aushandeln kann und fail-closed
verfährt, wenn ein formales Terminal fehlt.

Der Handshake wartet bewusst darauf, dass der anvisierte Prompt-Call sich
settled, bevor der FIFO seinen Nachfolger dispatchen darf. Einen
reinen Acknowledgement-Timeout hinzuzufügen würde einem späten Session-scoped
Cancel erlauben, diesen Nachfolger zu erreichen, und die
Reihenfolge-Garantie brechen. Folglich kann ein Provider, Tool oder eine
Custom-Integration, die sein `AbortSignal` unbegrenzt ignoriert, das
Cancel-Mutationsergebnis unbekannt und die Session unbrauchbar lassen. Einen
festgefahrenen geteilten ACP-Child-Prozess zurückzugewinnen, ohne
Geschwister-Sessions zu beenden, erfordert stärkere Runtime-Isolation und
liegt außerhalb dieser Alpha.

Die Alpha erkennt eine Event-Epochen-Änderung während eines beobachteten
Prompts und verfährt fail-closed, verspricht aber keine Exactly-once-
Ausführung über Daemon-Restarts, keine automatische Epochen-Recovery, kein
Snapshot/Resync, keine persistierten Cursor und keine echte
Prompt-ID-zielgerichtete Cancellation. Sie gibt auch keine Modellauswahl zum
Erzeugungszeitpunkt frei, bis der Daemon ein definitives Ergebnis
zurückgeben kann oder das SDK einen Session-Event-Lebenszyklus ab
`Last-Event-ID: 0` besitzt. Ein mehrdeutiges Create kann eine Daemon-Session
hinterlassen, die der Aufrufer nicht identifizieren oder detach-en kann, bis
der Daemon-seitige Reaping greift. Diese Fälle erfordern stärkere
Daemon-Verträge.

## Verifikation

Unit-Tests verwenden einen In-Prozess-HTTP-Server, um SSE-Fragmentierung,
langsame Ein-Zeilen-Zustellung, Replay, Duplikate, Lücken, widersprüchliche
Prompt-IDs, opake zukünftige Event-Daten, Watermark-Replay, Disconnects,
komprimierte Responses, hängende finite Bodies, Event-Epochen-Propagation und
-Mismatch, Resync, Observer-Versagen, Terminal-Abwesenheit und mehrdeutige
Mutations-Responses zu injizieren. Lebenszyklus-Tests decken
Ein-lokaler-Prompt-Admission, Admission/Close-Serialisierung, Deadline-
Terminal gefolgt von Session-Wiederverwendung, gecancelte Vervollständigung,
Teardown-Terminal-Reihenfolge, begrenzten Text, automatischen Heartbeat,
idempotentes Close, Detach-Client-Identität, Detach-once und expliziten
Destroy ab.

CI kompiliert und testet auf Java 11, 17 und 21 auf Linux, mit Java-21-
Smoke-Abdeckung auf macOS und Windows. Linux-CI und der geschützte
Release-Workflow führen einen E2E gegen einen echten `qwen serve`-Prozess
mit temporärem Workspace und Modell-Stub aus.
