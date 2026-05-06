# Tool-Use-Zusammenfassungen

Qwen Code kann nach Abschluss jedes Tool-Batches ein kurzes Label im Stil eines Git-Commit-Betreffs generieren, das zusammenfasst, was der Batch erledigt hat. Das Label erscheint inline im Transkript und ersetzt im kompakten Modus den generischen `Tool × N`-Header.

Dies ist eine UX-Hilfe für parallele Tool-Aufrufe: Wenn das Modell mehrere `Read`-, `Grep`- und `Bash`-Aufrufe gleichzeitig ausführt, zeigt die Zusammenfassung auf einen Blick die Absicht, anstatt die Tool-Liste durchsuchen zu müssen.

Das Feature ist standardmäßig aktiviert und läuft leise im Hintergrund. Es erfordert ein konfiguriertes [fast model](./followup-suggestions#fast-model).

## Was du siehst

### Vollständiger Modus (Standard)

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

### Kompakter Modus (`Ctrl+O` oder `ui.compactMode: true`)

Das Label ersetzt den generischen `Tool × N`-Header in der kompakten Einzeiler-Ansicht:

```
╭──────────────────────────────────────────────╮
│✓  Read txt files  · 4 tools                  │
│Press Ctrl+O to show full tool output         │
╰──────────────────────────────────────────────╯
```

Die einzelnen Tool-Aufrufe sind weiterhin nur einen Tastendruck entfernt (`Ctrl+O` zum Umschalten in den vollständigen Modus).

## Funktionsweise

Nachdem ein Tool-Batch abgeschlossen ist, sendet Qwen Code einen Fire-and-Forget-Aufruf an das konfigurierte Fast Model mit:

- Den Tool-Namen, gekürzten Argumenten und gekürzten Ergebnissen (jeweils auf 300 Zeichen begrenzt).
- Der neuesten Textausgabe des Assistenten (erste 200 Zeichen) als Intent-Präfix.
- Einem System-Prompt, der das Modell anweist, ein Label im Präteritum mit maximal 30 Zeichen im Stil eines Git-Commit-Betreffs zurückzugeben.

Der Aufruf läuft parallel zum API-Streaming des nächsten Turns, sodass die Latenz von ~1 s hinter der Antwort des Hauptmodells verborgen bleibt. Sobald das Label aufgelöst ist, wird es als `tool_use_summary`-Eintrag an das Transkript angehängt.

Beispiel-Labels: `Searched in auth/`, `Fixed NPE in UserService`, `Created signup endpoint`, `Read config.json`, `Ran failing tests`.

## Wann es erscheint

Die Zusammenfassung wird generiert, wenn **alle** folgenden Bedingungen erfüllt sind:

- `experimental.emitToolUseSummaries` ist `true` (Standard).
- Ein `fastModel` ist konfiguriert (über Einstellungen oder `/model --fast`).
- Mindestens ein Tool im Batch wurde abgeschlossen.
- Der Turn wurde nicht vor Abschluss der Tools abgebrochen.
- Das Fast Model hat eine nicht-leere, fehlerfreie Antwort zurückgegeben.

Tool-Aufrufe von Subagenten triggern keine Zusammenfassungsgenerierung – nur die Tool-Batches der Hauptsitzung.

## Wann es nicht erscheint

Die Zusammenfassung wird stillschweigend übersprungen (kein Fehler, keine UI-Änderung), wenn:

- Kein Fast Model konfiguriert ist.
- Der Fast-Model-Aufruf fehlschlägt, ein Timeout auftritt oder eine leere Antwort zurückgibt.
- Das Modell eine offensichtliche Fehlermeldung zurückgibt (z. B. `Error: ...`, `I cannot ...`) – diese wird vom Client herausgefiltert, damit die UI keine irreführenden Labels anzeigt.
- Der Turn (`Ctrl+C`) abgebrochen wurde, bevor das Modell fertig war.

In all diesen Fällen wird die Tool-Gruppe wie gewohnt gerendert.

## Fast Model

Das Label wird mit dem [fast model](./followup-suggestions#fast-model) generiert – demselben Modell, das du für Prompt-Vorschläge und spekulative Ausführung konfigurierst. Konfiguriere es über:

### Über Befehl

```
/model --fast qwen3-coder-flash
```

### Über `settings.json`

```json
{
  "fastModel": "qwen3-coder-flash"
}
```

Wenn kein Fast Model konfiguriert ist, wird die Zusammenfassungsgenerierung vollständig übersprungen – das Feature hat keine Wirkung, bis du eines einrichtest.

## Konfiguration

Diese Einstellungen können in `settings.json` konfiguriert werden:

| Einstellung                             | Typ     | Standard | Beschreibung                                                                                        |
| ----------------------------------- | ------- | ------- | -------------------------------------------------------------------------------------------------- |
| `experimental.emitToolUseSummaries` | boolean | `true`  | Hauptschalter für die Zusammenfassungsgenerierung. Deaktivieren, um den zusätzlichen Fast-Model-Aufruf zu unterbinden.               |
| `fastModel`                         | string  | `""`    | Fast Model für die Zusammenfassungsgenerierung (geteilt mit Prompt-Vorschlägen). Erforderlich; keine Wirkung, wenn leer. |

### Environment-Override

`QWEN_CODE_EMIT_TOOL_USE_SUMMARIES` überschreibt die `experimental.emitToolUseSummaries`-Einstellung für die aktuelle Sitzung:

- `QWEN_CODE_EMIT_TOOL_USE_SUMMARIES=0` oder `=false` – zwingend deaktivieren.
- `QWEN_CODE_EMIT_TOOL_USE_SUMMARIES=1` oder `=true` – zwingend aktivieren.
- Nicht gesetzt – verwendet die `experimental.emitToolUseSummaries`-Einstellung.

### Beispiel

```json
{
  "fastModel": "qwen3-coder-flash",
  "experimental": {
    "emitToolUseSummaries": true
  }
}
```

## Umfang & Lebenszyklus

Drei Punkte, die beim ersten Lesen dieses Features oft zu Verwirrung führen:

1. **Eine Generierung pro Batch, geteilt von beiden Anzeigemodi.** Der Fast-Model-Aufruf erfolgt genau einmal in `handleCompletedTools`, wenn ein Tool-Batch abgeschlossen wird. Das Umschalten mit `Ctrl+O` danach triggert **keinen** neuen Aufruf – beide Modi lesen denselben `tool_use_summary`-Verlaufseintrag, der beim ersten Mal erfasst wurde. Du kannst den kompakten Modus frei ein- und ausschalten, ohne zusätzliche Kosten.
2. **Keine nachträgliche Generierung beim Umschalten oder bei Sitzungswiederaufnahme.** Eine `tool_group`, die abgeschlossen wurde, bevor das Feature aktiviert war (oder bevor du die Einstellung aktiviert hast, oder in einer wiederaufgenommenen Sitzung – `ChatRecordingService` persistiert keine Zusammenfassungseinträge), erhält niemals ein Label. Es gibt keinen Durchlauf zum „Durchsuchen des bestehenden Verlaufs“. Wenn du diese Einstellung mitten in der Sitzung aktivierst, zeigen nur _zukünftige_ Batches ein Label; ältere Gruppen behalten das Standard-Rendering ohne Hinweis auf ein fehlendes Label.
3. **Nur Main-Agent-Batches.** Der Trigger befindet sich im Turn-Loop der Hauptsitzung (`useGeminiStream`), daher:
   - ✅ Shell-, MCP-, Dateioperationen und der `Task`-/Subagent-Tool-_Aufruf selbst_ (so wie er im Haupt-Batch erscheint) werden zusammengefasst.
   - ❌ **Interne** Tool-Batches eines Subagenten (ausgeführt über `packages/core/src/agents/runtime/`) werden nicht zusammengefasst.

   Ein äußerer Batch, der ein `Task`-Tool _enthält_, wird weiterhin gelabelt, aber das Fast Model sieht nur den Subagent-Tool-Aufruf und dessen aggregierte Ausgabe – nicht die einzelnen Tool-Aufrufe innerhalb des Subagenten. Erwarte Labels wie `Ran research-agent` oder `Delegated file search` statt `Searched 14 files`. Dies ist beabsichtigt – das Zusammenfassen von Subagent-Interna würde die Fast-Model-Kosten vervielfachen und Rauschen erzeugen, das nie in der primären UI erscheint.

## Empfohlene Kombination: Kompakten Modus aktivieren

Für Batches mit 3+ parallelen Tool-Aufrufen erzeugt die Kombination dieses Features mit `ui.compactMode: true` das übersichtlichste Transkript. Die kompakte Ansicht faltet den gesamten Batch in eine einzelne gelabelte Zeile (`✓  Read txt files  · 4 tools`), anstatt jede Tool-Zeile plus die nachgestellte Zusammenfassung anzuzeigen. Details bleiben über `Ctrl+O` nur einen Tastendruck entfernt.

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

Im vollständigen Modus (Standard) wird die Zusammenfassung als nachgestellte `● <label>`-Zeile unter der Tool-Gruppe gerendert – nützlich für große oder heterogene Batches, aber bei kleinen Batches desselben Typs (z. B. `Read × 3`) kann das Label wie eine Wiederholung der sichtbaren Tool-Zeilen wirken. Wenn das deinem üblichen Workflow entspricht, aktiviere entweder den kompakten Modus wie oben beschrieben oder deaktiviere die Zusammenfassung vollständig über `experimental.emitToolUseSummaries: false`.

## Monitoring

Die Modellnutzung für Zusammenfassungen erscheint in der `/stats`-Ausgabe unter den Fast-Model-Token-Gesamtwerten mit der `prompt_id` `tool_use_summary_generation`, sodass sie von Prompt-Vorschlägen und anderen Hintergrundtasks unterschieden werden kann.

## Datenfluss & Datenschutz

Der Zusammenfassungsaufruf sendet den Namen jedes erfolgreichen Tools, gekürzte `args` und gekürzte Ergebnisse (jedes Feld auf 300 Zeichen begrenzt) an das **Fast Model**, plus die ersten 200 Zeichen des neuesten Textes des Assistenten als Intent-Präfix.

Wenn dein Fast Model für denselben Provider/Auth wie dein Hauptsitzungsmodell konfiguriert ist, fließen die Daten entlang derselben Grenze, die deine Hauptsitzung bereits nutzt – keine Änderung des Vertrauensbereichs. Wenn du ein Fast Model von einem **anderen Provider** konfiguriert hast, werden Tool-Eingaben und -Ausgaben (potenziell einschließlich von `read_file` gelesener Dateiinhalte, Shell-Befehlsausgaben oder über MCP-Tools bereitgestellter Werte) als Teil des Zusammenfassungsprompts an diesen anderen Provider gesendet. Das ist ein deutlich größerer Umfang der Datenfreigabe als bei der Hauptsitzung allein.

Wenn das für deinen Workflow relevant ist, hast du zwei klare Optionen:

- Konfiguriere `fastModel` auf ein Modell desselben Providers wie deine Hauptsitzung, sodass der Zusammenfassungsaufruf keine neue Auth-/Daten-Grenze überschreitet.
- Deaktiviere das Feature vollständig mit `experimental.emitToolUseSummaries: false` (oder `QWEN_CODE_EMIT_TOOL_USE_SUMMARIES=0`).

Die 300-Zeichen-Begrenzung pro Feld schränkt die Exposition ein, beseitigt sie aber nicht – Secrets, die im Tool-Output während dieses Fensters entdeckt werden, können dennoch gesendet werden. Behandle die Daten-Grenze des Fast Models genauso wie die des Hauptmodells.

## Kosten

Ein Fast-Model-Aufruf pro qualifizierendem Tool-Batch. Die Eingabe besteht aus einem kleinen festen System-Prompt plus den gekürzten Tool-Eingaben/-Ausgaben (jeweils auf 300 Zeichen pro Feld begrenzt). Die Ausgabe ist eine einzelne kurze Zeile (auf 100 Zeichen begrenzt, typischerweise 20 Tokens oder weniger). Bei einem typischen Fast Model beträgt dies etwa 0,001 $ pro Batch.

Wenn du die zusätzlichen Kosten vermeiden möchtest, deaktiviere das Feature über `experimental.emitToolUseSummaries: false` oder `QWEN_CODE_EMIT_TOOL_USE_SUMMARIES=0`.

## Verwandte Themen

- [Compact Mode](../configuration/settings#ui.compactMode) – umschalten mit `Ctrl+O`; die Zusammenfassung ersetzt den generischen Tool-Gruppen-Header, wenn der kompakte Modus aktiviert ist.
- [Followup Suggestions](./followup-suggestions) – eine weitere Fast-Model-gesteuerte UX-Verbesserung, die dieselbe `fastModel`-Einstellung nutzt.