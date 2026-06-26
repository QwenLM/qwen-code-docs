# Zusammenfassungen der Tool-Nutzung

Qwen Code kann nach dem Abschluss jedes Tool-Batches eine kurze Bezeichnung im Stil einer Git-Commit-Betreffzeile generieren, die zusammenfasst, was der Batch erreicht hat. Die Bezeichnung erscheint inline im Transkript und ersetzt im kompakten Modus den generischen Header `Tool × N`.

Dies ist eine UX-Hilfe für parallele Tool-Aufrufe: Wenn das Modell sich auf mehrere `Read` + `Grep` + `Bash`-Aufrufe gleichzeitig aufteilt, zeigt die Zusammenfassung auf einen Blick die Absicht, anstatt dass Sie die Tool-Liste durchsuchen müssen.

Die Funktion ist standardmäßig aktiviert und läuft leise im Hintergrund. Sie erfordert ein konfiguriertes [fast model](./followup-suggestions#fast-model).

## Was Sie sehen

### Vollmodus (Standard)

Die Zusammenfassung erscheint als abgedunkelte Badge-Zeile direkt unter der Tool-Gruppe:

```
╭──────────────────────────────────────────────╮
│ ✓  ReadFile a.txt                            │
│ ✓  ReadFile b.txt                            │
│ ✓  ReadFile c.txt                            │
│ ✓  ReadFile d.txt                            │
╰──────────────────────────────────────────────╯

 ● Read 4 text files
```

### Kompaktmodus (`Ctrl+O` oder `ui.compactMode: true`)

Die Bezeichnung ersetzt den generischen `Tool × N`-Header in der kompakten Einzeiler-Darstellung:

```
╭──────────────────────────────────────────────╮
│✓  Read txt files  · 4 tools                  │
│Press Ctrl+O to show full tool output         │
╰──────────────────────────────────────────────╯
```

Die einzelnen Tool-Aufrufe sind weiterhin nur einen Tastendruck entfernt (`Ctrl+O` zum Umschalten in den Vollmodus).

## Wie es funktioniert

Nachdem ein Tool-Batch abgeschlossen ist, sendet Qwen Code einen Fire-and-Forget-Aufruf an das konfigurierte Fast Model mit:

- Den Tool-Namen, gekürzten Argumenten und gekürzten Ergebnissen (jeweils auf 300 Zeichen begrenzt).
- Den letzten Textausgaben des Assistenten (erste 200 Zeichen) als Absichts-Präfix.
- Einem System-Prompt, der das Modell anweist, eine 30-Zeichen-Bezeichnung im Stil einer Git-Commit-Betreffzeile im Präteritum zurückzugeben.

Der Aufruf läuft parallel zum API-Streaming des nächsten Durchgangs, sodass seine ~1s Latenz durch die Antwort des Hauptmodells verdeckt wird. Wenn die Bezeichnung aufgelöst ist, wird sie als `tool_use_summary`-Eintrag an das Transkript angehängt.

Beispiel-Bezeichnungen: `Searched in auth/`, `Fixed NPE in UserService`, `Created signup endpoint`, `Read config.json`, `Ran failing tests`.

## Wann es erscheint

Die Zusammenfassung wird generiert, wenn **alle** der folgenden Bedingungen zutreffen:

- `experimental.emitToolUseSummaries` ist `true` (Standard).
- Ein `fastModel` ist konfiguriert (über Einstellungen oder `/model --fast`).
- Mindestens ein Tool wurde im Batch abgeschlossen.
- Der Durchgang wurde nicht vor dem Abschluss des Tools abgebrochen.
- Das Fast Model hat eine nicht-leere, nicht fehlerhafte Antwort zurückgegeben.

Subagent-Tool-Aufrufe lösen keine Zusammenfassungserstellung aus – nur die Tool-Batches der Hauptsitzung.

## Wann es nicht erscheint

Die Zusammenfassung wird stillschweigend übersprungen (kein Fehler, keine UI-Änderung), wenn:

- Kein Fast Model konfiguriert ist.
- Der Fast-Model-Aufruf fehlschlägt, eine Zeitüberschreitung auftritt oder eine leere Antwort zurückgegeben wird.
- Das Modell eine offensichtliche Fehlermeldung ähnliche Zeichenkette zurückgegeben hat (z.B. `Error: ...`, `I cannot ...`) – vom Client herausgefiltert, damit die UI keine irreführenden Bezeichnungen anzeigt.
- Der Durchgang wurde abgebrochen (`Ctrl+C`), bevor das Modell fertig war.

In all diesen Fällen wird die Tool-Gruppe wie gewohnt dargestellt.

## Fast Model

Die Bezeichnung wird mit dem [fast model](./followup-suggestions#fast-model) generiert – demselben Modell, das Sie für Prompt-Vorschläge und spekulative Ausführung konfigurieren. Konfigurieren Sie es:

### Über die Befehlszeile

```
/model --fast qwen3-coder-flash
```

### Über `settings.json`

```json
{
  "fastModel": "qwen3-coder-flash"
}
```

Wenn kein Fast Model konfiguriert ist, wird die Zusammenfassungserstellung vollständig übersprungen – die Funktion hat keine Wirkung, bis ein solches eingerichtet ist.

## Konfiguration

Diese Einstellungen können in `settings.json` konfiguriert werden:

| Einstellung                          | Typ     | Standard | Beschreibung                                                                                         |
| ------------------------------------ | ------- | -------- | ---------------------------------------------------------------------------------------------------- |
| `experimental.emitToolUseSummaries`  | boolean | `true`   | Hauptschalter für die Zusammenfassungserstellung. Deaktivieren, um den zusätzlichen Fast-Model-Aufruf zu unterbinden. |
| `fastModel`                          | string  | `""`     | Fast Model, das für die Zusammenfassungserstellung verwendet wird (gemeinsam mit den Prompt-Vorschlägen). Erforderlich; keine Wirkung, wenn leer. |

### Überschreibung durch Umgebungsvariable

`QWEN_CODE_EMIT_TOOL_USE_SUMMARIES` überschreibt die Einstellung `experimental.emitToolUseSummaries` für die aktuelle Sitzung:

- `QWEN_CODE_EMIT_TOOL_USE_SUMMARIES=0` oder `=false` – erzwingt Deaktivierung.
- `QWEN_CODE_EMIT_TOOL_USE_SUMMARIES=1` oder `=true` – erzwingt Aktivierung.
- Nicht gesetzt – verwendet die Einstellung `experimental.emitToolUseSummaries`.

### Beispiel

```json
{
  "fastModel": "qwen3-coder-flash",
  "experimental": {
    "emitToolUseSummaries": true
  }
}
```

## Umfang und Lebenszyklus

Drei Punkte, die beim ersten Lesen dieser Funktion typischerweise übersehen werden:

1. **Eine Generierung pro Batch, von beiden Darstellungsmodi gemeinsam genutzt.** Der Fast-Model-Aufruf erfolgt genau einmal in `handleCompletedTools`, wenn ein Tool-Batch abgeschlossen ist. Ein nachträgliches Umschalten mit `Ctrl+O` löst **keinen** neuen Aufruf aus – beide Modi lesen aus demselben `tool_use_summary`-Verlaufseintrag, der beim ersten Mal erfasst wurde. Sie können den kompakten Modus frei ein- und ausschalten, ohne zusätzliche Kosten zu verursachen.
2. **Keine Nachberechnung beim Umschalten oder beim Wiederaufnehmen einer Sitzung.** Eine `tool_group`, die vor der Aktivierung der Funktion (oder bevor Sie die Einstellung umgeschaltet haben, oder in einer wiederaufgenommenen Sitzung – `ChatRecordingService` speichert Zusammenfassungseinträge nicht) abgeschlossen wurde, erhält niemals eine Bezeichnung. Es gibt keinen "Durchlauf über vorhandenen Verlauf". Wenn Sie diese Einstellung mitten in einer Sitzung aktivieren, wird nur für _zukünftige_ Batches eine Bezeichnung angezeigt; ältere Gruppen behalten die Standarddarstellung ohne Hinweis auf eine fehlende Bezeichnung.
3. **Nur Batches des Haupt-Agenten.** Der Auslöser befindet sich in der Durchlaufschleife der Hauptsitzung (`useGeminiStream`), daher:
   - ✅ Shell-, MCP-, Dateioperationen und der `Task` / Subagent-Tool-_Aufruf selbst_ (wie er im Haupt-Batch erscheint) werden zusammengefasst.
   - ❌ Die **internen** Tool-Batches eines Subagenten (ausgeführt über `packages/core/src/agents/runtime/`) werden nicht zusammengefasst.

   Ein äußerer Batch, der ein `Task`-Tool _enthält_, erhält dennoch eine Bezeichnung, aber das Fast Model sieht nur den Subagent-Tool-Aufruf und dessen aggregierte Ausgabe – nicht die einzelnen Tool-Aufrufe innerhalb des Subagenten. Erwarten Sie Bezeichnungen wie `Ran research-agent` oder `Delegated file search` statt `Searched 14 files`. Dies ist beabsichtigt – die Zusammenfassung von Subagent-Interna würde die Fast-Model-Kosten vervielfachen und Rauschen erzeugen, das in der primären Benutzeroberfläche nie auftaucht.

## Empfohlene Kombination: Kompaktmodus aktivieren

Für Batches mit 3+ parallelen Tool-Aufrufen ergibt die Kombination dieser Funktion mit `ui.compactMode: true` das sauberste Transkript. Die kompakte Ansicht klappt den gesamten Batch zu einer einzigen beschrifteten Zeile (`✓  Read txt files  · 4 tools`) zusammen, anstatt jede Tool-Zeile plus die abschließende Zusammenfassung anzuzeigen. Details bleiben über `Ctrl+O` nur einen Tastendruck entfernt.

```json
{
  "fastModel": "qwen3-coder-flash",
  "ui": {
    "compactMode": true
  },
  "experimental": {
    "emitToolUseSummaries": true
  }
}
```

Im Vollmodus (Standard) wird die Zusammenfassung als eine abschließende Zeile `● <label>` unter der Tool-Gruppe dargestellt – nützlich für große oder heterogene Batches, aber für kleine Batches desselben Typs (z.B. `Read × 3`) kann die Bezeichnung wie eine Wiederholung der sichtbaren Tool-Zeilen wirken. Wenn das Ihrem üblichen Arbeitsablauf entspricht, aktivieren Sie entweder den kompakten Modus wie oben oder schalten Sie die Zusammenfassung vollständig aus mit `experimental.emitToolUseSummaries: false`.

## Überwachung

Die Nutzung des Zusammenfassungsmodells erscheint in der `/stats`-Ausgabe unter den Fast-Model-Token-Summen, mit der `prompt_id` `tool_use_summary_generation`, sodass sie von Prompt-Vorschlägen und anderen Hintergrundaufgaben unterschieden werden kann.

## Datenfluss und Datenschutz

Der Zusammenfassungsaufruf sendet den Namen jedes erfolgreichen Tools, gekürzte `args` und gekürztes Ergebnis (jeweils auf 300 Zeichen begrenzt) an das **Fast Model**, plus die ersten 200 Zeichen des letzten Textes des Assistenten als Absichts-Präfix.

Wenn Ihr Fast Model für denselben Anbieter/dieselbe Authentifizierung wie Ihr Hauptsitzungsmodell konfiguriert ist, fließen die Daten entlang derselben Grenze, die Ihre Hauptsitzung bereits verwendet – keine Änderung des Vertrauensbereichs. Wenn Sie ein Fast Model von einem **anderen Anbieter** konfiguriert haben, werden Tool-Eingaben und -Ausgaben (einschließlich möglicherweise Dateiinhalte, die durch `read_file` gelesen wurden, Befehlsausgaben von Shell-Aufrufen oder Werte, die durch MCP-Tools bereitgestellt wurden) als Teil des Zusammenfassungs-Prompts an diesen anderen Anbieter gesendet. Dies ist ein strikt größerer Datenweitergabebereich als bei der Hauptsitzung allein.

Wenn dies für Ihren Arbeitsablauf relevant ist, haben Sie zwei saubere Optionen:

- Konfigurieren Sie `fastModel` so, dass es ein Modell unter demselben Anbieter wie Ihre Hauptsitzung verwendet, sodass der Zusammenfassungsaufruf keine neue Authentifizierungs-/Datengrenze überschreitet.
- Deaktivieren Sie die Funktion vollständig mit `experimental.emitToolUseSummaries: false` (oder `QWEN_CODE_EMIT_TOOL_USE_SUMMARIES=0`).

Die Begrenzung auf 300 Zeichen pro Feld reduziert die Exposition, beseitigt sie jedoch nicht – Geheimnisse, die während des Begrenzungsfensters in der Tool-Ausgabe gefunden werden, können dennoch gesendet werden. Behandeln Sie die Datengrenze des Fast Models genauso wie die des Hauptmodells.

## Kosten

Ein Fast-Model-Aufruf pro qualifiziertem Tool-Batch. Die Eingabe besteht aus einem kleinen, festen System-Prompt plus den gekürzten Tool-Eingaben/-Ausgaben (jeweils auf 300 Zeichen pro Feld begrenzt). Die Ausgabe ist eine einzelne kurze Zeile (auf 100 Zeichen begrenzt, typischerweise 20 Token oder weniger). Bei einem typischen Fast Model entspricht das etwa $0.001 pro Batch.

Wenn Sie die zusätzlichen Kosten nicht möchten, deaktivieren Sie die Funktion über `experimental.emitToolUseSummaries: false` oder `QWEN_CODE_EMIT_TOOL_USE_SUMMARIES=0`.

## Verwandte Themen

- [Compact Mode (Kompaktmodus)](../configuration/settings#ui) – Umschalten mit `Ctrl+O`; die Zusammenfassung ersetzt den generischen Tool-Gruppen-Header, wenn der kompakte Modus aktiviert ist.
- [Followup Suggestions (Folgevorschläge)](./followup-suggestions) – eine weitere Fast-Model-gesteuerte UX-Verbesserung, die dieselbe `fastModel`-Einstellung nutzt.