# Design des Sitzungstitels

> Ein aus 3–7 Wörtern bestehender Sitzungstitel in Satzschreibweise, der vom schnellen Modell nach der ersten Antwort des Assistenten generiert wird. Wird in der JSONL-Datei der Sitzung mit einem `titleSource: 'auto' | 'manual'`-Tag persistiert, im Sitzungs-Picker angezeigt und auf Anfrage über `/rename --auto` neu generierbar.

## Overview

`/rename` (#3093) ermöglicht es Nutzern, eine Sitzung zu benennen, um sie später im Picker wiederzufinden. Solange der Befehl nicht ausgeführt wird, zeigt der Picker jedoch die erste Nutzereingabe an – oft mitten im Satz abgeschnitten oder als Rahmenfrage formuliert, die nicht den tatsächlichen Inhalt der Sitzung widerspiegelt. Manuelles Umbenennen ist eine optionale Hürde, die die meisten Nutzer nie überwinden.

Das Ziel ist es, Sitzungsnamen _standardmäßig nützlich_ zu machen:

- **Beschreibend** für das, was in der Sitzung tatsächlich erreicht wurde, nicht nur die Eröffnungszeile. 3–7 Wörter, Satzschreibweise, im Stil eines Git-Commit-Betreffs.
- **Best-Effort**: Läuft im Hintergrund nach der ersten Antwort; bei einem Fehler sieht der Nutzer keine Fehlermeldung.
- **Respektvoll gegenüber dem Nutzer**: Überschreibt niemals einen `/rename`-Titel, den der Nutzer bewusst gewählt hat, auch nicht über CLI-Tabs hinweg für dieselbe Sitzung.
- **Explizit neu generierbar** über `/rename --auto` für den Fall, dass der automatische Titel veraltet ist oder ein neuer gewünscht wird.

## Triggers

| Trigger    | Bedingungen                                                                                                                                                          | Implementation                                                 |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| **Auto**   | Nach dem Auslösen von `recordAssistantTurn`. Wird übersprungen, wenn bereits ein Titel gesetzt ist, ein anderer Versuch läuft, das Limit erreicht ist, der Modus nicht-interaktiv ist, die Umgebungsvariable deaktiviert ist oder kein schnelles Modell verfügbar ist. | `ChatRecordingService.maybeTriggerAutoTitle` — Fire-and-Forget |
| **Manuell** | Nutzer führt `/rename --auto` aus                                                                                                                                          | `renameCommand.ts` über `tryGenerateSessionTitle`               |

Beide Pfade münden in eine einzelne Funktion – `tryGenerateSessionTitle(config, signal)` –, um identische Prompts, Schemata, Modellauswahl und Bereinigung zu garantieren. Der Auto-Trigger ist ein Best-Effort-Hintergrundaufruf; das manuelle `/rename --auto` ist eine blockierende Nutzeraktion, die bei einem Fehler eine spezifische Fehlerursache ausgibt.

## Architecture

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
│  │  maybeTriggerAutoTitle() │── 6 guards ──→ IIFE(autoTitleController)  │
│  │     │                    │                       │                   │
│  │     └── resume hydrate   │                       ↓                   │
│  │         via              │          tryGenerateSessionTitle          │
│  │         getSessionTitle- │          (sessionTitle.ts)                │
│  │         Info             │                       │                   │
│  │                          │                       ↓                   │
│  └──────────────────────────┘          BaseLlmClient.generateJson       │
│                                        (fastModel + JSON schema)        │
│                                                       │                 │
│  ┌──────────────────────────┐                         ↓                 │
│  │ sessionService.ts        │         sanitizeTitle + sanity checks     │
│  │                          │                         │                 │
│  │  getSessionTitleInfo()   │◀── cross-process        ↓                 │
│  │      uses                │    re-read             recordCustomTitle  │
│  │  readLastJsonString-     │    before write        (…, 'auto')        │
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
│  commands/renameCommand.ts     ─── /rename <name>          → manual      │
│                                ─── /rename                 → kebab       │
│                                ─── /rename --auto          → auto       │
│                                ─── /rename -- --literal    → manual     │
│                                ─── /rename --unknown-flag  → error      │
│                                                                         │
│  components/SessionPicker.tsx  ── dims rows where                       │
│                                   session.titleSource === 'auto'        │
└─────────────────────────────────────────────────────────────────────────┘
```

### Files

| File                                                 | Responsibility                                                                     |
| ---------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `packages/core/src/services/sessionTitle.ts`         | Einmaliger LLM-Aufruf + History-Filter + Bereinigung. Exportiert `tryGenerateSessionTitle`.  |
| `packages/core/src/services/chatRecordingService.ts` | `maybeTriggerAutoTitle`-Trigger, Guards, prozessübergreifendes Neu-Lesen, Abbruch bei Finalisierung. |
| `packages/core/src/services/sessionService.ts`       | Öffentlicher Accessor `getSessionTitleInfo`; `renameSession` akzeptiert `titleSource`.      |
| `packages/core/src/utils/sessionStorageUtils.ts`     | Atomarer Paar-Leser `extractLastJsonStringFields` + `readLastJsonStringFieldsSync`. |
| `packages/core/src/utils/terminalSafe.ts`            | `stripTerminalControlSequences`, gemeinsam genutzt von Satzschreibweise- und Kebab-Pfaden.           |
| `packages/cli/src/ui/commands/renameCommand.ts`      | `/rename --auto`, Sentinel-Parser, Fehlerursachen-Message-Map.                     |
| `packages/cli/src/ui/components/SessionPicker.tsx`   | Dim-Styling für `titleSource === 'auto'`.                                          |

## Prompt Design

### System Prompt

Ersetzt den System-Prompt des Haupt-Agenten für diesen einzelnen Aufruf, sodass das Modell nur versucht, die Sitzung zu benennen, und nicht als Coding-Assistent agiert.

Die folgenden Punkte entsprechen 1:1 `TITLE_SYSTEM_PROMPT`:

- 3–7 Wörter, Satzschreibweise (nur das erste Wort und Eigennamen großgeschrieben).
- Keine abschließende Interpunktion, kein Markdown, keine Anführungszeichen.
- An die dominante Sprache der Konversation anpassen; für Chinesisch ca. 12–20 Zeichen einplanen.
- Spezifisch auf das tatsächliche Ziel des Nutzers eingehen – Feature, Bug oder Themenbereich benennen. Vage Sammelbegriffe wie „Code-Änderungen“ oder „Hilfegesuch“ vermeiden.
- Vier gute Beispiele (drei englische + ein chinesisches) und vier schlechte Beispiele (zu vage / zu lang / falsche Großschreibung / abschließende Interpunktion).
- Nur ein JSON-Objekt mit einem einzigen `title`-Key zurückgeben.

### Structured Output (JSON schema)

Anstatt die Ausgabe in Tags zu verpacken (wie beim Session-Recap), verwenden wir `BaseLlmClient.generateJson` mit einem Function-Calling-Schema:

```ts
const TITLE_SCHEMA = {
  type: 'object',
  properties: {
    title: {
      type: 'string',
      description:
        'A concise sentence-case session title, 3-7 words, no trailing punctuation.',
    },
  },
  required: ['title'],
};
```

Warum Function Calling statt Freitext + Tag-Extraktion:

1. Zuverlässigkeit über Provider hinweg – OpenAI-kompatible Endpunkte, Gemini und Qwens natives Tool-Calling implementieren alle Function Calling; Tag-Parsing würde darauf vertrauen, dass jedes Modell eine Textkonvention einhält.
2. Kein Leakage von Reasoning-Präambeln – die Argumente des Function Calls kommen strukturiert zurück, sodass ein „Thinking“-Absatz vor der Antwort nicht in den Titel überläuft.
3. Einfachere Nachbearbeitung – eine einzelne `typeof result.title === 'string'`-Prüfung plus `sanitizeTitle` deckt jede realistische Modellabweichung ab.

Das Modell könnte dennoch etwas zurückgeben, das das Schema erlaubt, aber die UX ablehnt (leerer String, nur Leerzeichen, 500 Zeichen, Markdown-Fencing, Steuerzeichen). `sanitizeTitle` behandelt all diese Fälle und gibt `''` zurück → der Service liefert `{ok: false, reason: 'empty_result'}`.

### Call Parameters

| Parameter         | Value                          | Reason                                                                                          |
| ----------------- | ------------------------------ | ----------------------------------------------------------------------------------------------- |
| `model`           | `getFastModel()` — no fallback | Auto-Titling mit Main-Model-Tokens ist zu teuer, um es stillschweigend auszuführen.                                |
| `schema`          | `TITLE_SCHEMA`                 | Erzwingt `{title: string}`; filtert Shape-Drift auf Transportebene.                           |
| `maxOutputTokens` | `100`                          | Mehr als genug für 7 Wörter plus Schema-Overhead.                                              |
| `temperature`     | `0.2`                          | Überwiegend deterministisch – Sitzungstitel profitieren von Stabilität bei der Neugenerierung.               |
| `maxAttempts`     | `1`                            | Titel sind Best-Effort-Kosmetikmetadaten; Retries würden sich hinter nutzersichtbarem Main-Traffic anstellen. |

Im Gegensatz zum Session-Recap, das auf das Hauptmodell zurückfällt. Die Titelgenerierung wird automatisch und häufig ausgelöst. Main-Model-Tokens stillschweigend ohne Nutzer-Opt-in zu verbrauchen, wäre eine echte Kostenüberraschung. Manuelles `/rename --auto` schlägt explizit mit `no_fast_model` fehl, anstatt einen Fallback zu nutzen – zwingt den Nutzer also, die Wahl des schnellen Modells bewusst zu treffen.

## History Filtering

`geminiClient.getChat().getHistory()` gibt `Content[]` zurück, das Tool Calls, Tool Responses (oft 10K+ Tokens an Dateiinhalten) und Model-Thought-Parts enthält. Das Rohdaten-Feed in den Titel-LLM würde das Label hin zu Implementierungsrauschen wie „Called grep on auth module“ verzerren.

`filterToDialog` behält nur `user` / `model`-Einträge mit nicht-leerem Text und ohne `thought` / `thoughtSignature`-Parts. `takeRecentDialog` schneidet auf die letzten 20 Nachrichten zu und verweigert den Start bei einer hängenden Model-/Tool-Response. `flattenToTail` konvertiert zu „Role: text“-Zeilen und schneidet die letzten 1000 Zeichen ab.

### The 1000-character tail slice

Eine Sitzung, die mit `help me debug X` beginnt, aber zu Refactoring Y wechselt, sollte nach Y benannt werden. Eine Benennung nach dem Anfang fixiert die Eröffnungsfrage; eine Benennung nach dem Ende (Tail) erfasst, worum es in der Sitzung tatsächlich ging.

### UTF-16 surrogate handling

`.slice(-1000)` an einer UTF-16-Code-Unit-Grenze kann ein hohes oder niedriges Surrogate isolieren, wenn ein CJK-Supplementary-Zeichen oder Emoji abgeschnitten wird. Einige Provider antworten auf das resultierende ungültige UTF-16 mit einem 400er – was ohne Behandlung einen Versuch sinnlos verbrennen würde. `flattenToTail` entfernt ein führendes isoliertes niedriges Surrogate; `sanitizeTitle` bereinigt auch auf dem Ausgabepfad nach dem Max-Length-Trim alle isolierten Surrogates.

## Persistence

### Record shape

`CustomTitleRecordPayload` erhält ein optionales `titleSource: 'auto' | 'manual'`-Feld:

```jsonc
{
  "type": "system",
  "subtype": "custom_title",
  "systemPayload": {
    "customTitle": "Debug login button on mobile",
    "titleSource": "auto",
  },
}
```

Das Feld ist optional, und in Legacy-Records fehlende Werte werden als `undefined` behandelt. `SessionPicker` dimmt Zeilen nur bei einem strikten `=== 'auto'`-Match – ein vor der Änderung manuell per `/rename` gesetzter Titel wird niemals stillschweigend als Modell-Guess neu klassifiziert.

### Resume hydration

Beim Fortsetzen ruft der `ChatRecordingService`-Konstruktor `sessionService.getSessionTitleInfo(sessionId)` auf, um **sowohl** den Titel als auch dessen Quelle zu lesen. Ohne das Hydratisieren der Quelle würde das erneute Anhängen durch `finalize()` (das bei jedem Sitzungs-Lifecycle-Event läuft) bei jedem Fortsetzungszyklus Auto zu Manual umschreiben – und die Dim-Affordance stillschweigend entfernen.

### Atomic pair read

`extractLastJsonStringFields` gibt `customTitle` und `titleSource` aus der **gleichen passenden Zeile** in einem einzigen Scan zurück. Zwei separate `readLastJsonStringFieldSync`-Aufrufe könnten auf unterschiedliche Records landen, wenn eine ältere Zeile nur das Primärfeld enthält, was zu einem nicht passenden Paar führen würde. Der Extraktor verlangt zudem ein korrektes schließendes Anführungszeichen für den Primärwert, sodass ein durch einen Crash abgeschnittener trailing Record nicht das Latest-Match-Race gewinnt.

### Full-file scan cap

Phase-2 (wenn der Tail-Window-Fast-Path nicht greift) streamt die gesamte Datei in 64KB-Chunks. Begrenzt auf `MAX_FULL_SCAN_BYTES = 64 MB`, damit eine korrupte mehr-GB-JSONL den Sitzungs-Picker nicht im Main-Event-Loop einfriert. Die Latenzanforderungen des Pickers überstehen Korruption.

### Symlink defense

Sitzungs-Lesevorgänge öffnen mit `O_NOFOLLOW` (fällt auf Windows, wo die Konstante nicht exponiert ist, auf plain Read-Only zurück). Defense in Depth, damit ein in `~/.qwen/projects/<proj>/chats/` platzierter Symlink einen Metadaten-Lesevorgang nicht auf eine unrelated Datei umleiten kann.

## Concurrency and Edge Cases

### Trigger guard order

`maybeTriggerAutoTitle` prüft sechs Bedingungen in genau dieser Reihenfolge – jede bricht die restlichen ab, sodass die günstigen zuerst laufen:

1. `currentCustomTitle` gesetzt → überspringen. Niemals manuelle / vorherige Auto-Titel überschreiben.
2. `autoTitleController !== undefined` → überspringen. Immer nur ein Versuch gleichzeitig.
3. `autoTitleAttempts >= 3` → überspringen. Limit begrenzt totale Verschwendung.
4. `!config.isInteractive()` → überspringen. Headless `qwen -p` / CI verbraucht niemals Fast-Model-Tokens für eine One-Shot-Sitzung.
5. `autoTitleDisabledByEnv()` → überspringen. `QWEN_DISABLE_AUTO_TITLE=1` explizites Opt-out.
6. `!config.getFastModel()` → überspringen. Kein Fast-Model → No-op.

### Why the cap is 3, not 1

Der erste Assistenten-Turn kann ein reiner Tool-Call ohne nutzersichtbaren Text sein (z. B. startet das Modell mit einem `grep`). `tryGenerateSessionTitle` gibt in diesem Fall `{ok: false, reason: 'empty_history'}` zurück. Ohne ein Retry-Fenster würde die Chance auf einen Titel für eine gesamte Sitzung bereits im Turn 1 verbrannt, bevor der Nutzer etwas Interessantes gesagt hat. Das Limit von 3 deckt den häufigen „erster Turn ist Rauschen“-Fall ab, begrenzt aber gleichzeitig ein unkontrolliertes Retry bei einem persistent fehlschlagenden Fast-Model.

### Cross-process manual-rename race

Zwei CLI-Tabs derselben Sitzungsdatei können im Speicher divergieren. Tab A führt `/rename foo` aus und schreibt `titleSource: manual`. Tab B's `ChatRecordingService` hat sein eigenes `currentCustomTitle = undefined` und würde naiv mit einem Auto-Titel überschreiben.

Nachdem der LLM-Aufruf abgeschlossen ist, liest die IIFE die JSONL über `sessionService.getSessionTitleInfo` neu. Zeigt die Datei `source: 'manual'`, bricht die IIFE ab UND synchronisiert ihren In-Memory-Status, sodass auch nachfolgende Turns das Rename respektieren. Kosten: ein 64KB-Tail-Read pro erfolgreicher Generierung; vernachlässigbar.

### Abort propagation on `finalize()`

`autoTitleController` dient gleichzeitig als In-Flight-Flag. `finalize()` (läuft bei Sitzungswechsel und Prozess-Shutdown) ruft `autoTitleController.abort()` auf, bevor der Titel-Record erneut angehängt wird. Der LLM-Socket wird prompt abgebrochen; der Sitzungswechsel wartet nicht auf einen langsamen Fast-Model-Aufruf. Der `finally`-Block der IIFE löscht `autoTitleController` nur, wenn es noch der aktive ist, sodass ein Finalize während des Fluges nicht mit einem gleichzeitigen `recordAssistantTurn` raced.

### Manual `/rename` lands mid-flight

Zwischen dem Abschluss des `await` der IIFE und dem `recordCustomTitle('auto')`-Aufruf könnte der Nutzer `/rename foo` ausführen. Die IIFE prüft `this.currentTitleSource === 'manual'` erneut und bricht ab. Sowohl die In-Process-Prüfung ALS AUCH das prozessübergreifende Neu-Lesen laufen; manuell gewinnt auf beiden Ebenen.

## Configuration

### User-facing knobs

| Setting / env var           | Default | Effect                                                                                              |
| --------------------------- | ------- | --------------------------------------------------------------------------------------------------- |
| `fastModel`                 | unset   | Erforderlich für Auto-Titling. Nicht gesetzt → No-op (kein Main-Model-Fallback).                                  |
| `QWEN_DISABLE_AUTO_TITLE=1` | unset   | Opt-out des Auto-Triggers, ohne `fastModel` zu entfernen. `/rename --auto` funktioniert auf Anfrage weiterhin. |

Kein `settings.json`-Toggle – die Umgebungsvariable ist der einzige nutzersichtbare Ausschalter. Begründung: Das Feature ist kosmetisch und günstig; ein Settings-Toggle würde eine UI-Oberfläche für etwas hinzufügen, das als einmaliger Env-Export für die wenigen Nutzer leben kann, die es deaktivieren möchten.

### Why auto doesn't fall back to the main model

Auto-Titling wird bedingungslos nach jedem Assistenten-Turn ausgelöst. Würde ein Nutzer ohne Fast-Model stillschweigend Main-Model-Tokens für den Titel jeder neuen Sitzung belastet, wäre die Kostendifferenz bis zur Monatsrechnung unsichtbar. Still zu scheitern (No-op, kein Titel, keine Kosten) ist der sicherere Standard. `/rename --auto` gibt `no_fast_model` als handlungsorientierten Fehler aus, sodass der Nutzer bei Bedarf eines setzen kann.

## Observability

`createDebugLogger('SESSION_TITLE')` emittiert `debugLogger.warn` aus dem Catch-Block des Generators. Fehler sind für den Nutzer vollständig transparent – Auto-Titling ist ein Hilfsfeature und wirft niemals in die UI.

Entwickler können im Debug-Log nach dem `[SESSION_TITLE]`-Tag greppen (`~/.qwen/debug/<sessionId>.txt`; `latest.txt` symlinkt auf die aktuelle Sitzung). Ein funktionierender End-to-End-Aufruf erzeugt keine Log-Ausgabe; ein fehlerhafter erhält eine WARN-Zeile mit der zugrunde liegenden Fehlermeldung.

## Security Hardening

Der Titelwert wird unverändert im Terminal (Sitzungs-Picker) gerendert UND in einer nutzerlesbaren JSONL-Datei persistiert. Beide Oberflächen sind angreifbar, wenn ein kompromittiertes oder prompt-injiziertes schnelles Modell feindlichen Text zurückgibt.

| Concern                                     | Guard                                                                                                                         |
| ------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| ANSI / OSC-8 / CSI-Injection                | `stripTerminalControlSequences` vor JSONL-Write und Picker-Render.                                                    |
| Klickbare Links via OSC-8 schmuggeln            | Gleiches – OSC-Sequenzen werden als ganze Einheiten entfernt, nicht nur das ESC-Byte.                                                          |
| Ungültige UTF-16-Surrogates                   | Bereinigt in `flattenToTail` (LLM-Input) und `sanitizeTitle` (LLM-Output nach Max-Length-Trim).                               |
| Subtype-Line-Spoofing via User-Message-Content | `lineContains: '"subtype":"custom_title"'` – User-Text, der zufällig die exakte Phrase enthält, kann keinen echten Record überschatten. |
| Symlink-Redirect bei Sitzungs-Lesevorgängen           | `O_NOFOLLOW` (No-op auf Windows, wo die Konstante fehlt).                                                                |
| Abgeschnittener trailing JSONL-Record             | `extractLastJsonStringFields` verlangt ein schließendes Anführungszeichen, bevor ein Record das Latest-Match-Race gewinnt.                            |
| Pathologische Dateigröße friert Picker ein  | `MAX_FULL_SCAN_BYTES = 64 MB`-Limit für Phase-2-Voll-Datei-Scan.                                                                  |
| Gepaarte CJK-Klammer-Dekorateure (`【Draft】`) | Werden als Einheit entfernt, sodass eine einzelne schließende Klammer nicht hängen bleibt.                                                                  |

## Out of Scope

| Item                                        | Why not                                                                                                                                     |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Auto-Regenerierung, wenn der Titel veraltet ist   | `/rename --auto` ist der explizite, nutzergetriggerte Pfad. Stille Titel-Swaps mitten in der Sitzung würden Nutzer verwirren, die im Picker zurückscrollen. |
| WebUI / VSCode Dim-Styling-Parität           | Diese Oberflächen lesen bereits `customTitle` und zeigen Auto-Titel wie manuelle an. Ein Follow-up kann `titleSource` durchschleifen.           |
| Settings-Dialog-Toggle für Auto-Generierung  | Umgebungsvariable ist der einzige Knopf. Eine vollständige Settings-UI lässt sich später leicht hinzufügen, wenn die Nutzernachfrage steigt.                                                  |
| i18n-Locale-Katalogeinträge für neue Strings | Konsistent mit bestehenden `/rename`-Strings, die auf Englisch durchfallen. Ein repo-weiter i18n-Durchlauf ist out of scope.                           |
| Migration zur Neuklassifizierung von Legacy-Records     | Back-Compat by Design: Fehlendes `titleSource` wird als manuell behandelt. Das Umschreiben alter Records würde riskieren, die Nutzerabsicht zu verlieren.                      |
| Nicht-interaktives Auto-Titling                | `qwen -p` / CI-Skripte werfen die Sitzung weg; Fast-Model-Tokens für einen Titel, den niemand jemals fortsetzen wird, sind reine Verschwendung.                         |