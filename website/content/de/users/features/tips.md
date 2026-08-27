# Kontextuelle Tipps

Qwen Code enthält ein System kontextueller Tipps, das Ihnen hilft, Funktionen zu entdecken und den Sitzungsstatus im Blick zu behalten.

## Starttipps

Jedes Mal, wenn Sie Qwen Code starten, wird ein Tipp im Kopfbereich angezeigt. Tipps werden zuerst nach Priorität ausgewählt und dann mithilfe von LRU (am wenigsten kürzlich verwendet) über Sitzungen hinweg rotiert, sodass jedes Mal ein anderer Tipp erscheint.

Neue Benutzer sehen während ihrer ersten Sitzungen onboarding-orientierte Tipps:

| Sitzungen | Beispieltipps                                          |
| --------- | ------------------------------------------------------ |
| < 5       | Slash-Befehle (`/`), Tab-Autovervollständigung         |
| < 10      | `QWEN.md`-Projektkontext, `--continue` / `--resume`    |
| < 15      | Shell-Befehle mit `!`-Präfix                           |

Danach rotieren die Tipps durch allgemeine Funktionen wie `/compress`, `/approval-mode`, `/insight`, `/btw` und weitere.

## Tipps nach Antworten

Während eines Gesprächs überwacht Qwen Code die Nutzung des Kontextfensters und zeigt Tipps an, wenn möglicherweise Maßnahmen erforderlich sind:

| Kontextnutzung | Bedingung                        | Tipp                                                    |
| -------------- | -------------------------------- | ------------------------------------------------------- |
| 50-80%         | Nach einigen Aufforderungen in der Sitzung | Schlägt `/compress` vor, um Kontext freizugeben        |
| 80-95%         | —                                | Warnt, dass der Kontext voll wird                       |
| >= 95%         | —                                | Dringend: jetzt `/compress` ausführen oder `/new` zum Fortfahren |

Tipps nach Antworten haben tippspezifische Abklingzeiten, um Wiederholungen zu vermeiden.

## Tipp-Verlauf

Der Anzeigeverlauf der Tipps wird in `~/.qwen/tip_history.json` gespeichert. Diese Datei verfolgt:

- Sitzungsanzahl (wird für die Auswahl der Tipps für neue Benutzer verwendet)
- Welche Tipps wann angezeigt wurden (wird für die LRU-Rotation und Abklingzeit verwendet)

Sie können diese Datei bedenkenlos löschen, um den Tipp-Verlauf zurückzusetzen.

## Tipps deaktivieren

Um alle Tipps (sowohl Start- als auch Nach-Antwort-Tipps) auszublenden, setzen Sie `ui.hideTips` auf `true` in `~/.qwen/settings.json`:

```json
{
  "ui": {
    "hideTips": true
  }
}
```

Sie können dies auch im Einstellungsdialog über den Befehl `/settings` umschalten.

Tipps werden auch automatisch ausgeblendet, wenn der Bildschirmlesemodus aktiviert ist.