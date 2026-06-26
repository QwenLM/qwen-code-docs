# Entwurf des Sitzungstitels

> Ein 3-7 Wörter langer, in Satzschreibweise verfasster Sitzungstitel, der vom schnellen Modell nach
> der ersten Antwort des Assistenten generiert wird. Wird in der Session JSONL mit einem
> `titleSource: 'auto' | 'manual'`-Tag gespeichert, in der Sitzungsauswahl angezeigt
> und auf Anfrage über `/rename --auto` neu generierbar.

## Überblick

`/rename` (#3093) ermöglicht es einem Benutzer, eine Sitzung zu beschriften, damit er sie später in der Auswahl wiederfinden kann. Bis zur Ausführung des Befehls zeigt die Auswahl jedoch die erste Benutzereingabe – oft mitten im Satz abgeschnitten oder eine einleitende Frage beschreibend, anstatt den eigentlichen Inhalt der Sitzung widerzuspiegeln. Manuelles Umbenennen ist eine optionale Hürde, die die meisten Benutzer nie nehmen.

Ziel ist es, Sitzungsnamen **standardmäßig nützlich** zu machen:

- **Beschreibend** für das, was die Sitzung tatsächlich bewirkt hat, nicht nur die erste Zeile. 3-7 Wörter, Satzschreibweise, im Stil von Git-Commit-Betreffen.
- **Best-Effort**: Wird im Hintergrund nach der ersten Antwort ausgelöst; bei Fehlschlag sieht der Benutzer nie eine Fehlermeldung.
- **Rücksichtsvoll gegenüber dem Benutzer**: Überschreibt niemals einen `/rename`-Titel, den der Benutzer bewusst gewählt hat, selbst über mehrere CLI-Tabs derselben Sitzung hinweg.
- **Explizit regenerierbar** über `/rename --auto` für den Fall, dass der automatische Titel veraltet ist oder ein neuer gewünscht wird.

## Auslöser

| Auslöser    | Bedingungen                                                                                                                                                     | Implementierung                                                |
| ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| **Auto**    | Nachdem `recordAssistantTurn` ausgelöst wurde. Übersprungen, wenn ein vorhandener Titel gesetzt ist, ein anderer Versuch läuft, das Limit erreicht ist, nicht-interaktiv, Umgebungsvariable deaktiviert oder kein schnelles Modell. | `ChatRecordingService.maybeTriggerAutoTitle` – Feuer-Vergiss |
| **Manuell** | Benutzer führt `/rename --auto` aus                                                                                                                              | `renameCommand.ts` über `tryGenerateSessionTitle`               |

Beide Pfade münden in eine einzige Funktion – `tryGenerateSessionTitle(config, signal)` – um identischen Prompt, Schema, Modellauswahl und Bereinigung zu gewährleisten. Der automatische Auslöser ist ein Best-Effort-Hintergrundaufruf; das manuelle `/rename --auto` ist eine blockierende Benutzeraktion, die bei Fehlschlag einen grundspezifischen Fehler anzeigt.

## Architektur

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        packages/core/src/services/                      │
│                                                                         │
│  ┌──────────────────────────┐                                           │
│  │ chatRecordingService.ts  │                                           │
│  │                          │                                           │
│  │  recordAssistantTurn()   │                                           │
│  │     │                    │                                           │
│  │     ↓                    │                                           │
│  │  maybeTriggerAutoTitle() │── 6 Wächter ──→ IIFE(autoTitleController) │
│  │     │                    │                       │                   │
│  │     └── hydrate über     │                       ↓                   │
│  │         getSessionTitle- │          tryGenerateSessionTitle          │
│  │         Info             │          (sessionTitle.ts)                │
│  │                          │                       │                   │
│  └──────────────────────────┘          BaseLlmClient.generateJson       │
│                                        (schnelles Modell + JSON-Schema) │
│                                                       │                 │
│  ┌──────────────────────────┐                         ↓                 │
│  │ sessionService.ts        │         sanitizeTitle + Plausibilitäts-   │
│  │                          │         prüfungen                         │
│  │  getSessionTitleInfo()   │◀── prozessübergreifendes ↓                │
│  │      nutzt               │    erneutes Lesen     recordCustomTitle   │
│  │  readLastJsonString-     │    vor dem Schreiben  (…, 'auto')        │
│  │  FieldsSync              │                                           │
│  │  (sessionStorageUtils)   │                                           │
│  └──────────────────────────┘                                           │
│                                                                         │
│                          ┌─────────────────────┐                        │
│                          │ utils/terminalSafe  │                        │
│                          │ stripTerminalCtrl-  │                        │
│                          │ Sequences           │                        │
│                          └─────────────────────┘                        │
└─────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────┐
│                     packages/cli/src/ui/                                │
│                                                                         │
│  commands/renameCommand.ts     ─── /rename <name>          → manuell    │
│                                ─── /rename                 → kebab      │
│                                ─── /rename --auto          → auto      │
│                                ─── /rename -- --literal    → manuell    │
│                                ─── /rename --unknown-flag  → Fehler    │
│                                                                         │
│  components/SessionPicker.tsx  ── Zeilen abdunkeln, wenn                │
│                                   session.titleSource === 'auto'        │
└─────────────────────────────────────────────────────────────────────────┘
```

### Dateien

| Datei                                                     | Verantwortung                                                                               |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `packages/core/src/services/sessionTitle.ts`              | Einmaliger LLM-Aufruf + Verlaufsfilter + Bereinigung. Exportiert `tryGenerateSessionTitle`. |
| `packages/core/src/services/chatRecordingService.ts`      | `maybeTriggerAutoTitle`-Auslöser, Wächter, prozessübergreifendes erneutes Lesen, Abbruch bei Finalisierung. |
| `packages/core/src/services/sessionService.ts`            | `getSessionTitleInfo` öffentlicher Zugriff; `renameSession` akzeptiert `titleSource`.        |
| `packages/core/src/utils/sessionStorageUtils.ts`          | `extractLastJsonStringFields` + `readLastJsonStringFieldsSync` atomares Paar-Leser.         |
| `packages/core/src/utils/terminalSafe.ts`                 | `stripTerminalControlSequences`, gemeinsam genutzt von Satzschreibweise- und Kebab-Pfaden.   |
| `packages/cli/src/ui/commands/renameCommand.ts`           | `/rename --auto`, Sentinel-Parser, Fehlerursachen-Nachrichtenzuordnung.                     |
| `packages/cli/src/ui/components/SessionPicker.tsx`        | Abdunkelungsstil für `titleSource === 'auto'`.                                             |

## Prompt-Design

### System-Prompt

Ersetzt den System-Prompt des Hauptagenten für diesen einzelnen Aufruf, sodass das Modell nur versucht, die Sitzung zu beschriften, nicht als Programmierassistent zu agieren.

Die folgenden Aufzählungspunkte entsprechen 1:1 `TITLE_SYSTEM_PROMPT`:

- 3-7 Wörter, Satzschreibweise (nur das erste Wort und Eigennamen großgeschrieben).
- Keine abschließende Interpunktion, kein Markdown, keine Anführungszeichen.
- Die vorherrschende Sprache der Unterhaltung verwenden; für Chinesisch etwa 12-20 Zeichen einplanen.
- Spezifisch das tatsächliche Ziel des Benutzers benennen – die Funktion, den Fehler oder den Themenbereich nennen. Vermeide vage Sammelbegriffe wie „Codeänderungen“ oder „Hilfeanfrage“.
- Vier gute Beispiele (drei Englisch + ein Chinesisch) und vier schlechte Beispiele (zu vage / zu lang / falsche Schreibweise / abschließende Interpunktion).
- Nur ein JSON-Objekt mit einem einzelnen `title`-Schlüssel zurückgeben.

### Strukturierte Ausgabe (JSON-Schema)

Anstatt die Ausgabe in Tags zu verpacken (wie es die Sitzungszusammenfassung tut), verwenden wir `BaseLlmClient.generateJson` mit einem Funktionsaufruf-Schema:

```ts
const TITLE_SCHEMA = {
  type: 'object',
  properties: {
    title: {
      type: 'string',
      description:
        'Ein präziser Sitzungstitel in Satzschreibweise, 3-7 Wörter, ohne abschließende Interpunktion.',
    },
  },
  required: ['title'],
};
```

Warum Funktionsaufruf anstelle von Freitext + Tag-Extraktion:

1. Anbieterübergreifende Zuverlässigkeit – OpenAI-kompatible Endpunkte, Gemini und
   Qwens native Tool-Calling implementieren alle Funktionsaufrufe; Tag-Parsing
   würde darauf vertrauen, dass jedes Modell eine Textkonvention einhält.
2. Kein Auslaufen von Reasoning-Präambeln – die Funktionsaufrufargumente kommen
   strukturiert zurück, sodass ein „Denk“-Absatz vor der Antwort nicht in den
   Titel einfließen kann.
3. Einfachere Nachbearbeitung – eine einzelne `typeof result.title === 'string'`-Prüfung
   plus `sanitizeTitle` deckt jede realistische Modellabweichung ab.

Das Modell kann dennoch etwas zurückgeben, das das Schema zulässt, aber die UX ablehnt (leerer String, nur Leerzeichen, 500 Zeichen, Markdown-Begrenzer, Steuerzeichen). `sanitizeTitle` behandelt all diese Fälle und gibt `''` zurück → Dienst gibt `{ok: false, reason: 'empty_result'}` zurück.

### Aufrufparameter

| Parameter         | Wert                           | Grund                                                                                                |
| ----------------- | ------------------------------ | ---------------------------------------------------------------------------------------------------- |
| `model`           | `getFastModel()` – kein Fallback | Automatische Titelvergabe mit Main-Modell-Token ist zu teuer, um unbemerkt zu bleiben.                |
| `schema`          | `TITLE_SCHEMA`                 | Erzwingt `{title: string}`; filtert Formabweichungen auf der Transportebene.                          |
| `maxOutputTokens` | `100`                          | Mehr als genug für 7 Wörter plus Schema-Overhead.                                                     |
| `temperature`     | `0,2`                          | Größtenteils deterministisch – Sitzungstitel profitieren von Stabilität bei Neugenerierung.           |
| `maxAttempts`     | `1`                            | Titel sind kosmetische Metadaten nach Best-Effort; Wiederholungen würden hinter benutzersichtbarem Hauptverkehr warten. |

Im Gegensatz zur Sitzungszusammenfassung, die auf das Hauptmodell zurückfällt. Die Titelgenerierung wird automatisch und häufig ausgelöst; das lautlose Ausgeben von Main-Modell-Token ohne Benutzerzustimmung wäre eine echte Kostenüberraschung. Manuelles `/rename --auto` schlägt explizit mit `no_fast_model` fehl, anstatt zurückzufallen – der Benutzer wird gezwungen, die Entscheidung für das schnelle Modell bewusst zu treffen.

## Verlaufsfilterung

`geminiClient.getChat().getHistory()` gibt `Content[]` zurück, das Tool-Aufrufe, Tool-Antworten (oft 10K+ Token Dateiinhalt) und Modell-Denkteile enthält. Die rohe Übergabe an das Titel-LLM würde die Bezeichnung in Richtung Implementierungsrauschen wie „grep auf auth-Modul aufgerufen“ verzerren.

`filterToDialog` behält nur `user` / `model`-Einträge mit nicht-leerem Text und ohne `thought` / `thoughtSignature`-Teile. `takeRecentDialog` schneidet auf die letzten 20 Nachrichten und weigert sich, mit einer baumelnden Modell-/Tool-Antwort zu beginnen. `flattenToTail` wandelt in „Rolle: Text“-Zeilen um und schneidet die letzten 1000 Zeichen.

### Der 1000-Zeichen-Tail-Slice

Eine Sitzung, die mit `hilf mir, X zu debuggen` beginnt, aber zu Refactoring von Y übergeht, sollte nach Y benannt werden. Die Benennung nach dem Kopf fixiert den einleitenden Rahmen; die Benennung nach dem Tail erfasst, was die Sitzung geworden ist.

### UTF-16-Surrogat-Behandlung

`.slice(-1000)` auf einer UTF-16-Code-Unit-Grenze kann ein High- oder Low-Surrogat verwaist lassen, wenn ein CJK-Ergänzungszeichen oder Emoji geschnitten wird. Einige Anbieter reagieren mit einem 400 auf das resultierende ungültige UTF-16 – was ohne Behandlung einen Versuch grundlos verbrauchen würde. `flattenToTail` verwirft ein führendes verwaistes Low-Surrogat; `sanitizeTitle` entfernt verwaiste Surrogate nach dem Max-Längen-Kürzen auf dem Ausgabepfad ebenfalls.

## Persistenz

### Datensatzform

`CustomTitleRecordPayload` erhält ein optionales Feld `titleSource: 'auto' | 'manual'`:

```jsonc
{
  "type": "system",
  "subtype": "custom_title",
  "systemPayload": {
    "customTitle": "Anmeldebutton auf Mobilgeräten debuggen",
    "titleSource": "auto",
  },
}
```

Das Feld ist optional, und nicht vorhandene Felder in Legacy-Datensätzen werden als `undefined` behandelt. `SessionPicker` dunkelt Zeilen nur bei einem strikten `=== 'auto'`-Match ab – ein vor der Änderung per `/rename` festgelegter Benutzertitel wird nie stillschweigend als Modellschätzung neu klassifiziert.

### Hydrierung beim Wiederaufnehmen

Beim Wiederaufnehmen ruft der `ChatRecordingService`-Konstruktor `sessionService.getSessionTitleInfo(sessionId)` auf, um **sowohl** den Titel als auch seine Quelle zu lesen. Ohne die Hydrierung der Quelle würde das erneute Anhängen von `finalize()` (das bei jedem Sitzungslebenszyklus-Ereignis ausgeführt wird) bei jedem Wiederaufnahmezyklus auto in manuell umschreiben – die Abdunkelungsfunktion würde stillschweigend entfernt.

### Atomares Paar-Lesen

`extractLastJsonStringFields` gibt `customTitle` und `titleSource` von **derselben** passenden Zeile in einem einzigen Scan zurück. Zwei separate `readLastJsonStringFieldSync`-Aufrufe könnten auf unterschiedliche Datensätze treffen, wenn eine ältere Zeile nur das primäre Feld enthält, was ein nicht zusammenpassendes Paar ergibt. Der Extraktor erfordert zudem ein ordentliches schließendes Anführungszeichen für den Primärwert, sodass ein bei einem Absturz abgeschnittener nachfolgender Datensatz das Match des letzten Vorkommens nicht gewinnen kann.

### Vollständiger Datei-Scan-Limit

Phase-2 (wenn der Tail-Fenster-Schnellpfad fehlschlägt) streamt die gesamte Datei in 64KB-Blöcken. Begrenzt auf `MAX_FULL_SCAN_BYTES = 64 MB`, sodass eine korrupte Multi-GB-JSONL die Sitzungsauswahl nicht auf der Haupt-Ereignisschleife einfrieren kann. Das Latenzfenster der Auswahl überlebt Korruption.

### Symlink-Schutz

Sitzungslesevorgänge öffnen mit `O_NOFOLLOW` (fällt auf reines Lesen zurück unter Windows, wo die Konstante nicht verfügbar ist). Verteidigung in der Tiefe, sodass ein in `~/.qwen/projects/<proj>/chats/` platzierter Symlink einen Metadatenlesevorgang nicht auf eine nicht zugehörige Datei umleiten kann.

## Nebenläufigkeit und Randfälle

### Reihenfolge der Auslöser-Wächter

`maybeTriggerAutoTitle` prüft sechs Bedingungen in genau dieser Reihenfolge – jede unterbricht die weiteren kurz, sodass die günstigen zuerst ausgeführt werden:

1. `currentCustomTitle` gesetzt → überspringen. Niemals manuellen / vorherigen Auto-Titel überschreiben.
2. `autoTitleController !== undefined` → überspringen. Nur ein Versuch gleichzeitig.
3. `autoTitleAttempts >= 3` → überspringen. Limit begrenzt den Gesamtaufwand.
4. `!config.isInteractive()` → überspringen. Headless `qwen -p` / CI verbraucht niemals Fast-Model-Token für eine einmalige Sitzung.
5. `autoTitleDisabledByEnv()` → überspringen. `QWEN_DISABLE_AUTO_TITLE=1` expliziter Opt-out.
6. `!config.getFastModel()` → überspringen. Kein schnelles Modell → keine Aktion.

### Warum das Limit 3 und nicht 1 ist

Die erste Antwort des Assistenten kann ein reiner Tool-Aufruf ohne für den Benutzer sichtbaren Text sein (z.B. das Modell beginnt mit einem `grep`). `tryGenerateSessionTitle` gibt in diesem Fall `{ok: false, reason: 'empty_history'}` zurück. Ohne ein Wiederholungsfenster wäre die gesamte Chance einer Sitzung auf einen Titel bei Durchlauf 1 verbrannt, bevor der Benutzer etwas Interessantes gesagt hat. Das Limit von 3 deckt den häufigen Fall „erster Durchlauf ist Rauschen“ ab, während es eine ausufernde Wiederholung bei einem dauerhaft fehlschlagenden schnellen Modell begrenzt.

### Wettlauf bei prozessübergreifender manueller Umbenennung

Zwei CLI-Tabs auf derselben Sitzungsdatei können im Speicher auseinanderdriften. Tab A führt `/rename foo` aus und schreibt `titleSource: manual`. Der `ChatRecordingService` von Tab B hat seinen eigenen `currentCustomTitle = undefined` und würde naiv mit einem Auto-Titel überschreiben.

Nach Auflösung des LLM-Aufrufs liest die IIFE die JSONL erneut über `sessionService.getSessionTitleInfo`. Wenn die Datei `source: 'manual'` zeigt, bricht die IIFE ab UND synchronisiert ihren In-Memory-Status, sodass nachfolgende Durchläufe die Umbenennung ebenfalls respektieren. Kosten: ein 64KB-Tail-Read pro erfolgreicher Generierung; vernachlässigbar.

### Abbruchweitergabe bei `finalize()`

`autoTitleController` dient gleichzeitig als In-Flight-Flag. `finalize()` (ausgeführt bei Sitzungswechsel und Prozessbeendigung) ruft `autoTitleController.abort()` auf, bevor der Titeldatensatz erneut angehängt wird. Die LLM-Socket wird sofort abgebrochen; der Sitzungswechsel wartet nicht auf einen langsamen Fast-Model-Aufruf. Der `finally`-Block der IIFE löscht `autoTitleController` nur, wenn er noch der aktive ist, sodass eine Finalisierung während des Flugs nicht mit einem gleichzeitigen `recordAssistantTurn` in Konflikt gerät.

### Manuelles `/rename` während des Flugs

Zwischen der Fertigstellung des `await` der IIFE und dem Aufruf von `recordCustomTitle('auto')` könnte der Benutzer `/rename foo` ausführen. Die IIFE prüft erneut `this.currentTitleSource === 'manual'` und bricht ab. Die In-Process-Prüfung UND die prozessübergreifende erneute Lektüre werden beide ausgeführt; manuell gewinnt auf beiden Ebenen.

## Konfiguration

### Benutzersichtbare Stellschrauben

| Einstellung / Umgebungsvariable   | Standard | Wirkung                                                                                               |
| -------------------------------- | -------- | ---------------------------------------------------------------------------------------------------- |
| `fastModel`                       | nicht gesetzt | Erforderlich für automatische Titelvergabe. Nicht gesetzt → keine Aktion (kein Main-Modell-Fallback). |
| `QWEN_DISABLE_AUTO_TITLE=1`       | nicht gesetzt | Opt-out vom automatischen Auslöser, ohne `fastModel` zu deaktivieren. `/rename --auto` funktioniert auf Anfrage weiterhin. |

Kein `settings.json`-Schalter – die Umgebungsvariable ist der einzige benutzersichtbare Ausschalter. Begründung: Die Funktion ist kosmetisch und günstig; ein Einstellungsschalter würde eine Benutzeroberfläche für etwas hinzufügen, das für die wenigen Benutzer, die es deaktivieren möchten, als einmaliger `env export` leben kann.

### Warum auto nicht auf das Hauptmodell zurückfällt

Die automatische Titelvergabe wird bedingungslos nach jeder Assistentenantwort ausgelöst. Wenn ein Benutzer ohne schnelles Modell stillschweigend mit Main-Modell-Token für jeden neuen Sitzungstitel belastet würde, wäre der Kostendifferenz unsichtbar, bis die monatliche Rechnung eintrifft. Leises Fehlschlagen (keine Aktion, kein Titel, keine Kosten) ist der sicherere Standard. `/rename --auto` zeigt `no_fast_model` als umsetzbaren Fehler an, sodass der Benutzer ein schnelles Modell festlegen kann, wenn gewünscht.

## Beobachtbarkeit

`createDebugLogger('SESSION_TITLE')` gibt `debugLogger.warn` im Catch-Block des Generators aus. Fehler sind für den Benutzer vollständig transparent – die automatische Titelvergabe ist eine Hilfsfunktion und wird niemals in die UI geworfen.

Entwickler können nach dem Tag `[SESSION_TITLE]` im Debug-Log suchen (`~/.qwen/debug/<sessionId>.txt`; `latest.txt` verweist als Symlink auf die aktuelle Sitzung). Ein funktionierender End-to-End-Aufruf erzeugt keine Log-Ausgabe; ein fehlschlagender erhält eine WARN-Zeile mit der zugrunde liegenden Fehlermeldung.

## Sicherheitshärtung

Der Titelwert wird wörtlich im Terminal (Sitzungsauswahl) gerendert UND in einer benutzerlesbaren JSONL-Datei gespeichert. Beide Oberflächen sind angreifbar, wenn ein kompromittiertes oder per Prompt-Injection manipuliertes schnelles Modell feindlichen Text zurückgibt.

| Bedenken                                     | Schutzmaßnahme                                                                                                                   |
| --------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| ANSI / OSC-8 / CSI-Injection                 | `stripTerminalControlSequences` vor sowohl JSONL-Schreiben als auch Picker-Rendering. |
| Clickable-Link-Schmuggel via OSC-8            | Gleich – OSC-Sequenzen werden als ganze Einheiten entfernt, nicht nur das ESC-Byte. |
| Ungültige UTF-16-Surrogate                   | Beseitigt in `flattenToTail` (LLM-Eingabe) und `sanitizeTitle` (LLM-Ausgabe nach Max-Längen-Kürzung). |
| Subtype-Zeilenspoofing via Benutzernachricht  | `lineContains: '"subtype":"custom_title"'` – Benutzertext, der zufällig den wörtlichen Ausdruck enthält, kann keinen echten Datensatz überschatten. |
| Symlink-Umleitung bei Sitzungslesevorgängen | `O_NOFOLLOW` (keine Aktion unter Windows, wo die Konstante fehlt). |
| Abgeschnittener nachfolgender JSONL-Datensatz | `extractLastJsonStringFields` erfordert ein schließendes Anführungszeichen, bevor ein Datensatz das Match des letzten Vorkommens gewinnen kann. |
| Pathologische Dateigröße friert die Auswahl ein | `MAX_FULL_SCAN_BYTES = 64 MB`-Limit auf Phase-2 Vollständiger-Datei-Scan. |
| Gepaarte CJK-Klammerdekorationen (`【Entwurf】`) | Werden als Einheit entfernt, sodass keine einzelne schließende Klammer übrig bleibt. |
## Nicht abgedeckt

| Element                                                             | Warum nicht                                                                                                                                                                                                                           |
| ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Automatische Neugenerierung, wenn der Titel veraltet ist            | `/rename --auto` ist der explizite, vom Benutzer ausgelöste Weg. Stille Titeländerungen mitten in einer Sitzung würden Benutzer verwirren, die durch die Auswahlliste scrollen.                                                        |
| Parität des Dim-Stylings von WebUI / VSCode                         | Diese Oberflächen lesen bereits `customTitle` und zeigen automatische Titel so an, als wären sie manuell eingegeben. Ein Folge-Update kann `titleSource` durchreichen.                                                                |
| Ein-/Ausschalter im Einstellungsdialog für automatische Generierung | Die Umgebungsvariable ist der einzige Schalter. Eine vollständige Einstellungsoberfläche lässt sich leicht später hinzufügen, falls Benutzer dies wünschen.                                                                           |
| i18n-Locale-Katalogeinträge für neue Zeichenketten                  | Konsistent mit den bestehenden `/rename`-Zeichenketten, die auf Englisch zurückfallen. Eine repo-weite i18n-Runde liegt außerhalb des Rahmens.                                                                                        |
| Migration zur Neuklassifizierung von Legacy-Einträgen              | Abwärtskompatibilität durch Design: Fehlendes `titleSource` wird als manuell behandelt. Das Umschreiben alter Einträge könnte die Benutzerabsicht gefährden.                                                                          |
| Nicht-interaktive automatische Titelvergabe                         | `qwen -p` / CI-Skripte verwerfen die Sitzung; schnelle Modelltokens für einen Titel, den niemand je wieder aufnimmt, sind reine Verschwendung.                                                                                       |