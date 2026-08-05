# Channel-Interaktions-Präsentationsvertrag

## Status

Implementierter Channel-neutraler Vertrag für PR #6930. Die
DingTalk-spezifische Projektion und operative Details bleiben in
`2026-07-15-dingtalk-interactive-cards.md`.

## Problem

Die bisherige Implementierung erstellte eine DingTalk-Statuskarte beim
Run-Level-`started`-Event. Rief das Modell anschließend `ask_user_question`
auf, erstellte der Adapter eine zweite Formular-Karte und änderte die erste
Karte auf `Waiting for input`. Der Nutzer sah zwei aktive Karten, selbst wenn
das Modell keine sichtbare Antwort erzeugt hatte.

Das ist kein DingTalk-Rendering-Race. Es ist ein Ownership-Fehler:

- ein Run-Level-Event wird als sichtbares Ausgabe-Event behandelt;
- Ausgabe- und Eingabe-Präsentation sind unabhängige Adapter-Zustandsmaschinen;
- es gibt keine gemeinsame Definition eines sichtbaren Ausgabesegments;
- eine Eingabe-Anfrage beendet nicht die aktive Ausgabe-Präsentation.

Nur das Löschen oder Zurückrufen von DingTalk-Karten zu beheben, würde den
Ownership-Fehler bewahren und Feishu oder zukünftigen IM-Adaptern keinen
stabilen Interaktionsvertrag geben.

## Ziele

- Eine Ausgabe-Präsentation nur dann erstellen, wenn es für den Nutzer
  sichtbare Ausgabe gibt.
- Eine native Eingabe-Karte zur einzigen aktiven Präsentation werden lassen,
  wenn das Modell vor sichtbarer Ausgabe um Eingabe bittet.
- Eine Eingabe-Karte in Place bis zu ihrem Terminalzustand aktualisieren; sie
  während des normalen Lebenszyklus nicht löschen.
- Den ursprünglichen Berechtigungs- und Modellkontext fortsetzen, ohne eine
  synthetische Nutzernachricht zu injizieren.
- Jedem Ausgabesegment und jeder Eingabe-Anfrage eine exakte Run-, Session-,
  Target- und Owner-Korrelation geben.
- DingTalk, Feishu und zukünftigen IM-Adaptern erlauben, dieselbe Semantik zu
  übernehmen, ohne Karten-APIs oder Template-Schemas der Plattform zu teilen.
- Bestehendes Verhalten von Adaptern ohne Opt-in bewahren.

## Non-Goals

- Eine generische Cross-Plattform-API `createCard`, `updateCard` oder
  `deleteCard`.
- Freitext-Parsing als Ersatz für native strukturierte Eingabe.
- Von jedem IM zu verlangen, Streaming-Ausgabe, Formulare oder Buttons zu
  unterstützen.
- DingTalk- oder Feishu-Plattform-Handles in `ChannelBase` zu verschieben.
- Live-Callbacks über Prozessneustarts hinweg zu persistieren.
- Core, ACP oder den `ask_user_question`-Antwortvertrag zu ändern.
- Die bestehende Feishu-Kartenimplementierung im Zuge der DingTalk-Korrektur
  zu refaktorieren.

## Designprinzipien

### Gemeinsame Semantik, lokale Projektion

`ChannelBase` besitzt Kontext, Reihenfolge und Settlement-Semantik. Ein
IM-Adapter besitzt natives Rendering, Callback-Transport, Plattform-Handles,
Throttling und Projektionsfehler.

Die gemeinsame Schicht spricht nie von Karten. Sie spricht von:

- einem Prompt-Run;
- einem sichtbaren Ausgabesegment;
- einer strukturierten Eingabe-Anfrage;
- dem Terminal-Ergebnis dieser Objekte.

### Kontext wird erfasst, nie wiederentdeckt

Die maßgebliche Korrelationskette ist:

```text
SessionTarget(chatId/threadId) -> sessionId -> runId -> segmentId/requestId
```

Der Adapter erfasst diese Kette, wenn er eine native Präsentation erstellt.
Ein Callback löst den erfassten Datensatz auf. Er darf nicht nach der neuesten
Karte, dem neuesten Run oder der neuesten Session in einem Chat suchen.

`SessionTarget.threadId` bleibt die Thread-Partition, wenn eine Plattform eine
solche bereitstellt. Plattformen ohne Thread-Semantik nutzen `chatId`.
Plattform-Callbacks leiten nicht eigenständig ein neues Target ab.

### Transaktionen und Projektionen sind getrennt

Die Berechtigungsantwort ist die Transaktion. Ein Karten-Update ist eine
UI-Projektion. Eine erfolgreiche Berechtigungsantwort wird nie zurückgerollt,
weil das nachfolgende Native-Karten-Update fehlgeschlagen ist.

## Gemeinsames semantisches Modell

### Prompt-Run

Eine `runId` identifiziert eine Channel-eigene Prompt-Ausführung. Sie behält
die bestehenden Exakter-Run-Abbruch- und Owner-Regeln.

Das `started`-Lifecycle-Event bedeutet, dass der Run akzeptiert wurde. Es
eröffnet keine Ausgabe-Präsentation.

### Ausgabesegment

Ein Ausgabesegment ist eine zusammenhängende Sequenz von für den Nutzer
sichtbarem Assistenten-Text innerhalb eines Runs. `ChannelBase` alloziert eine
opaque `segmentId` erst, wenn der erste sichtbare Text dieses Segments
eintrifft.

Ein Segment endet beim ersten der folgenden Ereignisse:

- eine Response-Boundary;
- Präsentation einer strukturierten Eingabe-Anfrage;
- erfolgreiche finale Response-Zustellung;
- Run-Fehler;
- Run-Abbruch.

Nachdem eine strukturierte Eingabe-Anfrage settled, eröffnet späterer Text im
selben Run ein neues Segment mit neuer `segmentId`. Das Vor-Frage-Segment wird
nie wiedereröffnet oder überschrieben.

### Eingabe-Anfrage

Eine `requestId` identifiziert eine ursprüngliche ausstehende
`ask_user_question`-Berechtigungsanfrage. Eine Anfrage kann alle
normalisierten Fragen dieses Tool-Calls enthalten. Der Präsentation-Ownership
ist über `sessionId + owner.id` gescoped. Unterschiedliche Nutzer oder
Sessions können gleichzeitig Live-Eingabe-Präsentationen haben. Innerhalb
eines Runs gibt eine zweite Anfrage im selben Scope `unsupported` zurück,
hält die erste native Präsentation beantwortbar und nutzt den bestehenden
Text-Berechtigungs-Fallback.

Die Adapter-interne Eingabe-Zustandsmaschine ist:

```text
reserved -> pending -> claimed -> terminal
```

Sie ist Callback-Arbitrierung, kein Plattform-Kartenzustand. DingTalk kennt
nur `pending`, `submitted`, `cancelled` und `expired`: eine akzeptierte
Übermittlung wird auf `submitted` abgebildet, ein akzeptierter
Nutzerabbruch auf `cancelled`, und Timeout, externe Auflösung oder ein nicht
verfügbarer Responder auf `expired`. Jeder Terminal-Übergang aktualisiert die
bestehende native Eingabe-Präsentation in Place und löscht sie nie.

Das gemeinsame Settlement-Label ist `resolved_outside_presenter`. Der Vertrag
wird von nativen Formularen und anderen Interaktionsflächen geteilt, damit kein
plattformspezifisches Substantiv zur öffentlichen API wird.

## Gemeinsamer Vertrag

Die bestehenden Hooks bleiben die Erweiterungsfläche. Sie erhalten stärkeren
semantischen Kontext statt Plattform-Operationen.

```ts
interface ChannelOutputSegmentContext {
  channelName: string;
  sessionId: string;
  runId: string;
  segmentId: string;
  owner: ChannelPromptOwner;
  target: SessionTarget;
  messageId?: string;
}

type ChannelOutputSegmentEndReason =
  | 'response_boundary'
  | 'input_requested'
  | 'completed'
  | 'failed'
  | 'cancelled';
```

Die Chunk- und Completion-Hooks erhalten ein optionales finales
Kontextargument für Quellkompatibilität. Die Segment-Beendigung nutzt einen
eigenen Hook, damit Adapter Response-Boundaries von Eingabe-Anfragen und
Terminal-Ursachen unterscheiden können:

```ts
protected onResponseChunk(
  chatId: string,
  chunk: string,
  sessionId: string,
  segment?: ChannelOutputSegmentContext,
): void;

protected onOutputSegmentEnd(
  chatId: string,
  sessionId: string,
  segment: ChannelOutputSegmentContext,
  reason: ChannelOutputSegmentEndReason,
): void | Promise<void>;

protected onResponseBoundary(
  chatId: string,
  sessionId: string,
): void | Promise<void>;

protected onResponseComplete(
  chatId: string,
  text: string,
  sessionId: string,
  segment?: ChannelOutputSegmentContext,
): Promise<void>;
```

Bestehende Overrides, die weniger Argumente akzeptieren, bleiben gültig und
unverändert. `ChannelBase` liefert den Segment-Kontext für einen attended
Channel-eigenen Run immer an die Response-Hooks und ruft `onOutputSegmentEnd`
auf, wann immer dieses Segment schließt. Die Default-Implementierung
delegiert nur `response_boundary` an den Legacy-`onResponseBoundary`-Hook.
Loop-, Webhook- und Legacy-Synthetic-Pfade bleiben für native
Interaktions-Präsentation unqualifiziert.

`ChannelUserInputRequestContext` behält den bestehenden Request-Responder und
das Settlement-Abo. Zusätzlich trägt es den erfassten Interaktions-Scope:

```ts
interface ChannelUserInputRequestContext {
  requestId: string;
  sessionId: string;
  runId: string;
  owner: ChannelPromptOwner;
  target: SessionTarget;
  precedingSegmentId?: string;
  // bestehende normalisierte Fragen, Submit-Option, onSettled und respond
}
```

Seine Settlement-Reason-Union nutzt `resolved_outside_presenter`, `cancelled`
und `run_cancelled`.

Bevor `presentUserInputRequest` aufgerufen wird, schließt `ChannelBase` die
gemeinsame Segment-Identität und übergibt ihre ID als `precedingSegmentId`,
projiziert aber keine Plattform-Response-Boundary. Ein unterstützender Adapter
schließt seine eigene Präsentation mit `input_requested`, bevor er die native
Eingabe präsentiert. So werden nicht unterstützende Adapter daran gehindert,
ihren bestehenden Streaming-Zustand zu leeren oder anderweitig zu mutieren.
Das Schließen ist idempotent, sodass ein Plattform-Response-Boundary-Event,
das zuerst oder später eintrifft, nicht zwei verschiedene Segmente schließen
kann.

Es sind keine gemeinsamen Capability-Flags nötig. Capability drückt sich durch
Verhalten aus:

- Ausgabe-Hooks sind optional und liefern default die bestehende Zustellung;
- `presentUserInputRequest` gibt `unsupported` zurück, wenn native
  strukturierte Eingabe nicht verfügbar ist;
- plattformspezifische Konfiguration bleibt im Adapter.

Das vermeidet ungültige Kombinationen globaler Booleans und erlaubt einem
Adapter, Streaming-Ausgabe ohne Formulare zu unterstützen oder Formulare ohne
Streaming-Ausgabe.

## Presenter-Vertrag innerhalb jedes Adapters

Ein Adapter darf einen internen Presenter komponieren, statt
Plattform-Zustand in seine Haupt-Adapterklasse zu legen. Dieser Presenter
besitzt:

- `segmentId -> natives Ausgabe-Handle`;
- `requestId/outTrackId/messageId -> natives Eingabe-Handle`;
- eine serialisierte Projektions-Queue pro `runId`;
- begrenzte Ausgabe-Snapshots und Update-Zusammenlegung;
- Callback-Owner-Validierung und Einmal-Claims;
- Native-API-Timeouts und Fehlerprotokollierung;
- kompakte Terminal-Tombstones.

Die Pro-Run-Projektions-Queue garantiert diese Reihenfolge:

```text
altes Ausgabesegment beenden
  -> Eingabe-Präsentation erstellen
  -> Eingabe-Terminalzustand aktualisieren
  -> nächstes Ausgabesegment bei dessen erstem sichtbaren Text erstellen
```

Zwischenzeitliche Ausgabe-Anhängsel stellen einen ersetzbaren vollen Snapshot
in die Queue und blockieren die Modellerzeugung nicht. Boundary,
Eingabe-Präsentation und finale Zustellung reihen sich in dieselbe Queue ein,
damit sie frühere Schreibvorgänge nicht überholen können.

## Erforderliche Interaktionssequenzen

### Normale Antwort

```text
Run started
  -> keine native Ausgabe
erster sichtbarer Text
  -> segment-1 allozieren
  -> native Ausgabe-Präsentation lazy erstellen
spätere Chunks
  -> segment-1 aktualisieren
Run completed
  -> segment-1 in Place auf completed aktualisieren
```

Wenn ein Provider eine finale Antwort ohne Chunks zurückgibt, alloziert die
finale Zustellung das Segment und erstellt eine abgeschlossene
Ausgabe-Präsentation.

### Direkte Frage

```text
Run started
  -> keine native Ausgabe
ask_user_question-Anfrage
  -> request-1-Eingabe-Präsentation erstellen
```

Es existiert kein Ausgabesegment, daher sieht der Nutzer nur die
Eingabe-Präsentation. Während sie aussteht, gibt es keine separate
Run-Status-Präsentation. Der Pending-Zustand der Eingabe-Präsentation ist der
sichtbare Hinweis, dass der Run auf den Nutzer wartet.

### Text gefolgt von einer Frage

```text
erster sichtbarer Text
  -> segment-1-Ausgabe-Präsentation erstellen
ask_user_question-Anfrage
  -> segment-1 in Place abschließen
  -> request-1-Eingabe-Präsentation erstellen
```

Die abgeschlossene Ausgabe bleibt als Konversationshistorie erhalten, aber nur
die Eingabe-Präsentation ist aktiv.

### Frage-Übermittlung und Fortsetzung

```text
gültiger Callback
  -> request-1 korrelieren und Owner validieren
  -> request-1 atomar claimen
  -> Callback bestätigen
  -> auf die ursprüngliche Berechtigung antworten
  -> request-1 in Place auf submitted aktualisieren
nächster sichtbarer Modelltext im selben Run
  -> segment-2 allozieren
  -> neue Ausgabe-Präsentation erstellen
```

Die Antwort setzt den ursprünglichen Modellkontext fort. Der Adapter injiziert
keine synthetische eingehende Nachricht.

### Gleichzeitige Fragen

Für dasselbe `sessionId + owner.id + runId` ist höchstens eine native
Eingabe-Präsentation aktiv. Eine zweite Anfrage in diesem Scope gibt
`unsupported` zurück; `ChannelBase` sendet seinen semantischen Text-Fallback,
während die erste native Präsentation gültig bleibt. Das vermeidet eine
unerreichbare ausstehende Anfrage, ohne einen Abbruch oder eine eingehende
Nachricht zu synthetisieren. Unterschiedliche Nutzer und Sessions bleiben
unabhängig, und die Run-Beendigung schließt alle Präsentationen, die diesem
Run gehören.

## DingTalk-Projektion

Der DingTalk-Presenter bildet ab:

- ein Ausgabesegment auf eine Statuskarten-Template-Instanz;
- eine Eingabe-Anfrage auf eine Frage-Karten-Template-Instanz.

Änderungen gegenüber der aktuellen Implementierung:

- bei `started` keine Statuskarte erstellen;
- sie beim ersten Chunk oder der finalen Antwort eines Segments erstellen;
- Statusdatensätze über `segmentId` keyen, dabei `runId` für Stop behalten;
- das aktive Segment schließen, bevor eine Frage-Karte erstellt wird;
- die erste Frage-Karte aktiv lassen, wenn derselbe Run eine weitere Frage
  anfordert, und die neuere Anfrage den Text-Fallback nutzen lassen;
- eine alte Statuskarte nie auf `Waiting for input` ändern;
- die Frage-Karte in Place auf submitted, cancelled, expired oder extern
  aufgelöst aktualisieren;
- eine neue Statuskarte nur erstellen, wenn Text nach der Übermittlung
  beginnt.

Der normale Pfad ruft keine der beiden Karten zurück und löscht keine. Wenn
eine teilweise fehlgeschlagene native Zustellung einen unbrauchbaren Waisen
hinterlässt, der nicht aktualisiert werden kann, darf der Plattform-Cleanup
ihn als letzten Fehlerpfad löschen oder zurückrufen; das ist kein
Geschäftszustandsübergang.

Die Stop-Aktion bleibt an die exakte `runId` und den Owner gebunden, die vom
Segment erfasst wurden. Ein Stop aus einem beliebigen Live-Ausgabesegment
bricht nur diesen Run ab. Ein terminales historisches Segment kann keinen
späteren Run stoppen.

Die Cancel-Aktion der Frage-Karte löst die ursprüngliche Eingabe-Anfrage als
cancelled auf. Die bestehende `ask_user_question`-Abbruchsemantik entscheidet
dann, ob der Run endet; der Adapter gibt keinen zweiten Session-weiten Abbruch
ab.

Die erste Metadata-Projektion ist bewusst auf das konfigurierte Modell und die
verstrichene Wall-Clock-Zeit beschränkt. DingTalk liest das optionale Modell
aus der bestehenden Channel-Konfiguration und rendert eine laufende Zeile wie
`Running · qwen3.7-max · 12s`. Der verstrichene Wert wird aktualisiert, wenn
der bestehende zusammengefasste Modell-Text-Stream flushed und sich die
angezeigte Sekunde geändert hat, sodass der Status höchstens ein Update pro
Sekunde hinzufügt, ohne eigenen Timer. Stilles Nachdenken oder Tool-Ausführung
rücken den sichtbaren Zähler daher erst beim nächsten Text-Flush vor. Das
Terminale Update schreibt immer den exakten verstrichenen Wert, zum Beispiel
`Stopped · qwen3.7-max · 18s`. Wählt die Channel-Konfiguration kein Modell
aus, lässt die Zeile das Modell weg, statt eines zu erschließen.

Dieses Inkrement legt keine Token-Nutzung offen. Exakte Pro-Turn-Token-Zahlen
existieren in der aktuellen Channel-Bridge oder dem Lifecycle-Vertrag nicht,
und eine aus sichtbarem Text abgeleitete Schätzung wäre irreführend. Eine
spätere Änderung darf Token-Metadaten erst hinzufügen, nachdem die gemeinsame
Runtime einen maßgeblichen Pro-Turn-Snapshot liefert. Fehlende Metadaten
verzögern oder ändern den Segmentzustand nie.

## Feishu-Erweiterung

Die bestehende Feishu-Implementierung erstellt Streaming-Karten bereits lazy
bei Response-Chunks und kann eine interaktive Nachricht aktualisieren oder
löschen. Sie muss sich für die DingTalk-Korrektur nicht ändern.

Eine spätere Feishu-Interaktionsänderung kann dieselben Kontexte übernehmen:

- `segmentId` ersetzt den impliziten `inboundMsgId`-Ownership für
  Ausgabe-Karten;
- `runId` schützt Stop weiterhin davor, einen neueren Run abzubrechen;
- ein natives interaktives Formular oder Buttons implementieren
  `presentUserInputRequest`;
- der Callback löst die erfasste `requestId` auf, nicht die neueste Karte im
  Chat;
- dieselbe Eingabe-Nachricht wird auf ihren Terminalzustand gepatcht;
- nicht unterstützte Feldtypen geben `unsupported` zurück oder brechen mit
  einem lesbaren plattformlokalen Fehler ab, statt beliebigen Text zu parsen.

Telegram, WeCom, Weixin, QQ und Plugin-Adapter dürfen unabhängig
Ausgabe-Kontexte, Eingabe-Kontexte, beides oder keines konsumieren. Die
Default-Hooks bewahren ihr aktuelles Verhalten.

## Fehler- und Degradationsregeln

| Fehler                                                        | Erforderliches Verhalten                                                                                                                             |
| ------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Erstellung der Ausgabe-Präsentation schlägt fehl              | Begrenzten Text behalten und den bestehenden awaited Text-Zustellungspfad nutzen.                                                                    |
| Update zwischenzeitlicher Ausgabe schlägt fehl                | Weiteres natives Streaming für dieses Segment stoppen; finalen Text für den Fallback bewahren.                                                       |
| Terminales Ausgabe-Update schlägt fehl                        | Finalen Text über den bestehenden Fallback senden und die native Projektion als nicht verfügbar markieren.                                          |
| Eingabe-Präsentation gibt `unsupported` zurück                | Die bestehende semantische Berechtigungsnachricht nutzen; eine spätere Freitext-Antwort nicht parsen.                                                |
| Native Eingabe-Erstellung schlägt nach Opt-in fehl            | Dem Nutzer mitteilen, dass die native Frage fehlgeschlagen ist, die ursprüngliche Anfrage abbrechen und einen expliziten Retry erlauben.             |
| Berechtigungsantwort erfolgreich, aber Eingabe-Karten-Update schlägt fehl | Berechtigung aufgelöst lassen, einen Terminal-Tombstone behalten und den Projektionsfehler protokollieren.                                |
| Callback ist dupliziert, veraltet, fremd oder fehlerhaft      | Nach synchroner Validierung bestätigen und keine Zustandsänderung vornehmen.                                                                         |
| Run endet mit ausstehenden Eingaben                           | Diese Eingabe-Präsentationen in Place auf cancelled aktualisieren.                                                                                   |
| Prozess startet mit Live-Karten neu                           | Callbacks als nicht mehr ausstehend behandeln und auf expired/unavailable aktualisieren, wenn die Plattform-Korrelation es erlaubt. Persistente Wiederherstellung ist separate Arbeit. |

## Zustands- und Ressourcengrenzen

- Ausgabe-Inhalt bleibt auf 20.000 sichtbare Zeichen pro Segment begrenzt.
- Jedes Segment erlaubt einen nativen Schreibvorgang in Flight und einen
  ersetzbaren ausstehenden Snapshot.
- Native-API-Aufrufe behalten explizite Timeouts.
- Live-Maps für Run, Segment, Request und Callback bleiben
  einfügungsgeordnet und begrenzt.
- Terminal-Tombstones enthalten nur Korrelation und Terminalzustand; sie
  behalten keine Responder, Fragen, Antworten, Timer oder Inhalte.
- Jedes Cleanup prüft exakte Objektidentität, damit späte asynchrone
  Abschlüsse nicht einen neueren Datensatz derselben Session mutieren können.

## Migrationsplan

Die Korrektur soll klein und geordnet bleiben:

1. Ausgabesegment-Kontext und idempotente Segment-Boundaries zu `ChannelBase`
   hinzufügen, bestehende Hook-Signaturen durch optionale angehängte Parameter
   bewahren.
2. Gemeinsame Tests für lazy Segment-Allozierung, Boundary-Reihenfolge,
   direkte Fragen, Fortsetzungssegmente, gleichzeitige Fragen und
   Kontext-Isolation hinzufügen.
3. Den Run-scoped Status-Controller von DingTalk durch einen Run-Presenter
   ersetzen, der Segment-scoped Ausgabe-Datensätze und Request-scoped
   Eingabe-Datensätze besitzt.
4. Eager-Statuskarten-Erstellung und `Waiting for input`-Projektion entfernen.
5. Die bestehenden Final-Content-V2-Felder und die
   Strukturierte-Frage-Settlement-Logik behalten.
6. DingTalk mit Echtgerät-Szenarien validieren: direkte Frage,
   Text-dann-Frage, Übermittlungs-Fortsetzung, Stop, Timeout und Fehler.
7. Feishu-Produktionscode unverändert lassen; nur Kompatibilitätsnachweise
   hinzufügen, wenn die gemeinsame Signaturänderung es erfordert.

Die lokale Korrektur darf erst committet werden, wenn die
Echtgerät-Abnahme den obigen Sequenzen entspricht. Sie bleibt bis zur
expliziten Freigabe unpushed.

## Akzeptanzkriterien

### Gemeinsamer Channel

- `started` alloziert nie ein Ausgabesegment.
- Der erste sichtbare Text alloziert genau eine Segment-Id.
- Eine Response-Boundary oder Eingabe-Anfrage schließt dieses Segment genau
  einmal.
- Text nach dem Frage-Settlement erhält eine andere Segment-Id im selben Run
  und derselben Session.
- `chatId/threadId`-, Session-, Run-, Request-, Segment- und Owner-Korrelation
  können sich zwischen gleichzeitigen Kontexten nicht kreuzen.
- Bestehende Adapter ohne Interaktionsunterstützung behalten ihr Verhalten.

### DingTalk

- Ein direktes `ask_user_question` zeigt eine Frage-Karte und keine
  Statuskarte.
- Eine Frage-Karte wird bei Übermittlung, Abbruch, Ablauf und externer
  Auflösung in Place aktualisiert.
- Eine zweite Frage im selben Run nutzt den Text-Fallback, während die erste
  native Karte beantwortbar bleibt.
- Unterschiedliche Nutzer und Sessions behalten unabhängige Live-Frage-Karten.
- Text vor einer Frage bleibt in einer abgeschlossenen historischen
  Statuskarte.
- Text nach der Übermittlung erscheint in einer neuen Statuskarte.
- Keine Statuskarte zeigt `Waiting for input`.
- Stop bricht nur den exakt erfassten Run ab.
- Finaler abgeschlossener Inhalt bleibt über die V2-Felder `blockList`,
  `content` und `copy_content` sichtbar.

### Cross-IM-Kompatibilität

- Feishu baut und seine bestehenden Streaming-Karten- und Stop-Tests bleiben
  grün, ohne den neuen Presenter zu übernehmen.
- Ein Adapter kann native Eingabe ohne Streaming-Ausgabe implementieren.
- Ein Adapter kann Streaming-Ausgabe ohne native Eingabe implementieren.
- Ein Adapter, der keines von beiden unterstützt, erbt das bestehende
  Text-Verhalten.

## Entscheidungsübersicht

Die gemeinsame Abstraktion ist ein Interaktions-Präsentationsvertrag, kein
Karten-Framework. `ChannelBase` besitzt Kontext und Segment-/Request-Semantik.
Jeder IM besitzt seinen nativen Presenter. Ausgabe-Karten sind lazy und
Segment-scoped; Eingabe-Karten sind Request-scoped und werden in Place
aktualisiert. Das entfernt das DingTalk-Verhalten doppelt aktiver Karten und
gibt Feishu sowie zukünftigen Adaptern einen stabilen,
plattformneutralen Erweiterungspfad.
