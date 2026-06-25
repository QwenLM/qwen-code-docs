# Zusammenfassungen von Tool-Einsätzen

Qwen Code kann nach Abschluss jedes Tool-Batches eine kurze Beschriftung im Stil eines Git-Commit-Betreffs erzeugen, die zusammenfasst, was der Batch bewirkt hat. Die Beschriftung erscheint inline im Transkript und ersetzt im kompakten Modus den generischen `Tool × N`-Header.

Dies ist eine UX-Hilfe für parallele Tool-Aufrufe: Wenn das Modell mehrere `Read` + `Grep` + `Bash`-Aufrufe gleichzeitig ausführt, zeigt die Zusammenfassung auf einen Blick die Absicht, anstatt dass man die Tool-Liste scannen muss.

Die Funktion ist standardmäßig aktiviert und läuft im Hintergrund. Sie erfordert ein konfiguriertes [schnelles Modell](./followup-suggestions#fast-model).

## Was Sie sehen

### Vollmodus (Standard)

Die Zusammenfassung erscheint als dezente Badge-Zeile direkt unter der Tool-Gruppe:

```
╭──────────────────────────────────────────────╮
│ ✓  ReadFile a.txt                            │
│ ✓  ReadFile b.txt                            │
│ ✓  ReadFile c.txt                            │
│ ✓  ReadFile d.txt                            │
╰──────────────────────────────────────────────╯

 ● Read 4 text files
```

### Kompakter Modus (`Ctrl+O` oder `ui.compactMode: true`)

Die Beschriftung ersetzt den generischen `Tool × N`-Header in der kompakten Einzeiler-Darstellung:

```
╭──────────────────────────────────────────────╮
│✓  Read txt files  · 4 tools                  │
│Press Ctrl+O to show full tool output         │
╰──────────────────────────────────────────────╯
```

Die einzelnen Tool-Aufrufe sind weiterhin nur einen Tastendruck entfernt (`Ctrl+O`, um in den Vollmodus zu wechseln).

## Funktionsweise

Nachdem ein Tool-Batch abgeschlossen ist, sendet Qwen Code einen Fire-and-Forget-Aufruf an das konfigurierte schnelle Modell mit:

- Den Tool-Namen, gekürzten Argumenten und gekürzten Ergebnissen (jeweils auf 300 Zeichen begrenzt).
- Dem aktuellsten Text-Output des Assistenten (erste 200 Zeichen) als Absichts-Präfix.
- Einem System-Prompt, der das Modell anweist, eine Beschriftung in Vergangenheitsform und maximal 30 Zeichen im Stil eines Git-Commit-Betreffs zurückzugeben.

Der Aufruf erfolgt parallel zum API-Streaming des nächsten Turns, sodass seine ~1s Latenz hinter der Antwort des Hauptmodells verborgen wird. Sobald die Beschriftung aufgelöst ist, wird sie als `tool_use_summary`-Eintrag an das Transkript angehängt.

Beispiele für Beschriftungen: `Searched in auth/`, `Fixed NPE in UserService`, `Created signup endpoint`, `Read config.json`, `Ran failing tests`.

## Wann sie erscheint

Die Zusammenfassung wird erzeugt, wenn **alle** der folgenden Bedingungen zutreffen:

- `experimental.emitToolUseSummaries` ist `true` (Standard).
- Ein `fastModel` ist konfiguriert (über Einstellungen oder `/model --fast`).
- Mindestens ein Tool wurde im Batch abgeschlossen.
- Der Turn wurde nicht vor Abschluss der Tools abgebrochen.
- Das schnelle Modell hat eine nicht-leere, fehlerfreie Antwort zurückgegeben.

Tool-Aufrufe von Subagenten lösen keine Zusammenfassungserzeugung aus – nur die Tool-Batches der Hauptsitzung.

## Wann sie nicht erscheint

Die Zusammenfassung wird stillschweigend übersprungen (kein Fehler, keine Änderung der Benutzeroberfläche), wenn:

- Kein schnelles Modell konfiguriert ist.
- Der Aufruf des schnellen Modells fehlschlägt, zeitlich ausläuft oder eine leere Antwort zurückgibt.
- Das Modell eine offensichtliche Fehlermeldung zurückgibt (z. B. `Error: ...`, `I cannot ...`) – vom Client herausgefiltert, damit die Oberfläche keine irreführenden Beschriftungen anzeigt.
- Der Turn abgebrochen wurde (`Ctrl+C`), bevor das Modell fertig war.

In all diesen Fällen wird die Tool-Gruppe wie gewohnt dargestellt.

## Schnelles Modell

Die Beschriftung wird mit dem [schnellen Modell](./followup-suggestions#fast-model) erzeugt – demselben Modell, das Sie für Prompt-Vorschläge und spekulative Ausführung konfigurieren. Konfiguration über:

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

Wenn kein schnelles Modell konfiguriert ist, wird die Zusammenfassungserzeugung komplett übersprungen – die Funktion hat keine Wirkung, bis Sie eines eingerichtet haben.

## Konfiguration

Diese Einstellungen können in `settings.json` konfiguriert werden:

| Einstellung                          | Typ     | Standard | Beschreibung                                                                                     |
| ------------------------------------ | ------- | -------- | ------------------------------------------------------------------------------------------------ |
| `experimental.emitToolUseSummaries`  | boolean | `true`   | Hauptschalter für die Zusammenfassungserzeugung. Ausschalten, um den zusätzlichen Fast-Modell-Aufruf zu deaktivieren. |
| `fastModel`                          | string  | `""`     | Schnelles Modell, das für die Zusammenfassungserzeugung verwendet wird (geteilt mit Prompt-Vorschlägen). Erforderlich; keine Wirkung, wenn leer. |

### Umgebungsvariable

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

## Geltungsbereich & Lebenszyklus

Drei Punkte, die beim ersten Lesen dieser Funktion oft verwirren:

1. **Eine Erzeugung pro Batch, gemeinsam genutzt von beiden Anzeigemodi.** Der Fast-Modell-Aufruf erfolgt genau einmal in `handleCompletedTools`, wenn ein Tool-Batch abgeschlossen wird. Ein späteres Umschalten mit `Ctrl+O` löst **keinen** neuen Aufruf aus – beide Modi lesen aus demselben `tool_use_summary`-Verlaufseintrag, der beim ersten Mal erfasst wurde. Sie können den kompakten Modus frei ein- und ausschalten, ohne zusätzliche Kosten.
2. **Keine Nachholung beim Umschalten oder bei Wiederaufnahme der Sitzung.** Eine `tool_group`, die abgeschlossen wurde, bevor die Funktion aktiviert wurde (oder bevor Sie die Einstellung eingeschaltet haben, oder in einer wiederaufgenommenen Sitzung – `ChatRecordingService` speichert keine Zusammenfassungseinträge), erhält nie eine Beschriftung. Es gibt keinen „bestehenden Verlauf durchgehen"-Durchlauf. Wenn Sie diese Einstellung mitten in der Sitzung einschalten, erhalten nur _zukünftige_ Batches eine Beschriftung; ältere Gruppen behalten die Standarddarstellung ohne Hinweis, dass eine Beschriftung fehlt.
3. **Nur Batches des Haupt-Agenten.** Der Auslöser befindet sich in der Turn-Schleife der Hauptsitzung (`useGeminiStream`), daher:
   - ✅ Shell-, MCP-, Dateioperationen und der `Task`-/Subagent-Tool _selbst_ (wie er im Haupt-Batch erscheint) werden zusammengefasst.
   - ❌ Die **internen** Tool-Batches eines Subagenten (ausgeführt über `packages/core/src/agents/runtime/`) werden nicht zusammengefasst.
Ein äußerer Batch, der ein `Task`-Tool _enthält_, wird weiterhin gekennzeichnet, aber das Fast-Modell sieht nur den Subagenten-Toolaufruf und dessen aggregierte Ausgabe – nicht die einzelnen Toolaufrufe innerhalb des Subagenten. Erwarten Sie Beschriftungen wie `Ran research-agent` oder `Delegated file search` statt `Searched 14 files`. Dies ist beabsichtigt – eine Zusammenfassung der Subagenten-Interna würde die Kosten des Fast-Modells vervielfachen und Rauschen an die Oberfläche bringen, das in der primären Benutzeroberfläche nie auftaucht.

## Empfohlene Kombination: Kompaktmodus aktivieren

Bei Batches mit 3 oder mehr parallelen Toolaufrufen ergibt die Kombination dieser Funktion mit `ui.compactMode: true` das sauberste Transkript. Die kompakte Ansicht faltet den gesamten Batch in eine einzelne beschriftete Zeile (`✓  Read txt files  · 4 tools`) zusammen, anstatt jede Toolzeile plus die abschließende Zusammenfassung anzuzeigen. Details bleiben einen Tastendruck entfernt via `Ctrl+O`.

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

Im Vollmodus (Standard) wird die Zusammenfassung als abschließende `● <label>`-Zeile unter der Toolgruppe dargestellt – nützlich für große oder heterogene Batches, aber bei kleinen Batches desselben Typs (z.B. `Read × 3`) kann die Beschriftung wie eine Wiederholung der sichtbaren Toolzeilen wirken. Wenn das Ihrem üblichen Workflow entspricht, aktivieren Sie entweder den Kompaktmodus wie oben oder schalten Sie die Zusammenfassung vollständig aus über `experimental.emitToolUseSummaries: false`.

## Überwachung

Die Nutzung des Zusammenfassungsmodells erscheint in der `/stats`-Ausgabe unter den Fast-Modell-Token-Summen, mit der `prompt_id` `tool_use_summary_generation`, sodass es von Prompt-Vorschlägen und anderen Hintergrundaufgaben unterschieden werden kann.

## Datenfluss & Datenschutz

Der Zusammenfassungsaufruf sendet den Namen jedes erfolgreichen Tools, die gekürzten `args` und das gekürzte Ergebnis (jedes Feld auf 300 Zeichen begrenzt) an das **Fast-Modell**, plus die ersten 200 Zeichen des letzten Texts des Assistenten als Intent-Präfix.

Wenn Ihr Fast-Modell für denselben Anbieter/dieselbe Authentifizierung wie Ihr Hauptsitzungsmodell konfiguriert ist, fließen die Daten entlang derselben Grenze, die Ihre Hauptsitzung bereits nutzt – keine Änderung des Vertrauensbereichs. Wenn Sie ein Fast-Modell von einem **anderen Anbieter** konfiguriert haben, werden Tool-Eingaben und -Ausgaben (möglicherweise einschließlich Dateiinhalten, die von `read_file` gelesen wurden, Befehlsausgaben von Shell-Aufrufen oder Werten, die über MCP-Tools bereitgestellt werden) als Teil des Zusammenfassungs-Prompts an diesen anderen Anbieter gesendet. Das ist ein streng größerer Datenfreigabebereich als die Hauptsitzung allein.

Wenn dies für Ihren Workflow wichtig ist, haben Sie zwei saubere Optionen:

- Konfigurieren Sie `fastModel` auf ein Modell unter demselben Anbieter wie Ihre Hauptsitzung, damit der Zusammenfassungsaufruf keine neue Auth-/Datengrenze überschreitet.
- Deaktivieren Sie die Funktion vollständig mit `experimental.emitToolUseSummaries: false` (oder `QWEN_CODE_EMIT_TOOL_USE_SUMMARIES=0`).

Die Begrenzung auf 300 Zeichen pro Feld begrenzt die Exposition, beseitigt sie jedoch nicht – Geheimnisse, die während des Begrenzungsfensters in der Tool-Ausgabe entdeckt werden, können weiterhin gesendet werden. Behandeln Sie die Datengrenze des Fast-Modells auf die gleiche Weise wie die des Hauptmodells.

## Kosten

Ein Fast-Modell-Aufruf pro qualifiziertem Tool-Batch. Die Eingabe ist ein kleiner fester System-Prompt plus die gekürzten Tool-Eingaben/Ausgaben (jedes Feld auf 300 Zeichen begrenzt). Die Ausgabe ist eine einzelne kurze Zeile (auf 100 Zeichen begrenzt, typischerweise 20 Tokens oder weniger). Bei einem typischen Fast-Modell sind das etwa 0,001 $ pro Batch.

Wenn Sie die zusätzlichen Kosten nicht möchten, schalten Sie die Funktion über `experimental.emitToolUseSummaries: false` oder `QWEN_CODE_EMIT_TOOL_USE_SUMMARIES=0` aus.

## Verwandte Themen

- [Kompaktmodus](../configuration/settings#ui) – umschaltbar mit `Ctrl+O`; die Zusammenfassung ersetzt den generischen Tool-Gruppen-Header, wenn der Kompaktmodus aktiviert ist.
- [Followup-Vorschläge](./followup-suggestions) – eine weitere Fast-Modell-gesteuerte UX-Verbesserung, die dieselbe `fastModel`-Einstellung verwendet.
