# Kontextbezogene Tipps

Qwen Code verfügt über ein System für kontextbezogene Tipps, das dir hilft, Funktionen zu entdecken und den Sitzungsstatus im Blick zu behalten.

## Start-Tipps

Bei jedem Start von Qwen Code wird ein Tipp im Header-Bereich angezeigt. Die Auswahl erfolgt zunächst nach Priorität. Anschließend werden Tipps gleicher Priorität über die Sitzungen hinweg nach dem LRU-Verfahren (Least Recently Used) rotiert, sodass du jedes Mal einen anderen Tipp siehst.

Neue Nutzer sehen während ihrer ersten Sitzungen Tipps mit Fokus auf das Onboarding:

| Sitzungen | Beispiel-Tipps                                       |
| --------- | ---------------------------------------------------- |
| < 5       | Slash-Befehle (`/`), Tab-Autovervollständigung       |
| < 10      | `QWEN.md`-Projektkontext, `--continue` / `--resume`  |
| < 15      | Shell-Befehle mit `!`-Präfix                         |

Danach rotieren die Tipps durch allgemeine Funktionen wie `/compress`, `/approval-mode`, `/insight`, `/btw` und weitere.

## Tipps nach der Antwort

Während einer Konversation überwacht Qwen Code die Nutzung deines Context Windows und zeigt Tipps an, wenn eine Aktion erforderlich sein könnte:

| Kontextnutzung | Bedingung                      | Tipp                                              |
| -------------- | ------------------------------ | ------------------------------------------------- |
| 50-80%         | Nach einigen Prompts in der Sitzung | Empfiehlt `/compress`, um Kontext freizugeben |
| 80-95%         | —                              | Warnt, dass der Kontext fast voll ist             |
| >= 95%         | —                              | Dringend: Führe jetzt `/compress` aus oder starte mit `/new` neu, um fortzufahren |

Tipps nach der Antwort verfügen über individuelle Cooldowns pro Tipp, um Wiederholungen zu vermeiden.

## Tipp-Verlauf

Der Anzeigeverlauf der Tipps wird unter `~/.qwen/tip_history.json` gespeichert. Diese Datei erfasst:

- Anzahl der Sitzungen (wird zur Auswahl der Tipps für neue Nutzer verwendet)
- Welche Tipps wann angezeigt wurden (wird für die LRU-Rotation und Cooldowns verwendet)

Du kannst diese Datei bedenkenlos löschen, um den Tipp-Verlauf zurückzusetzen.

## Tipps deaktivieren

Um alle Tipps (sowohl Start- als auch Post-Response-Tipps) auszublenden, setze `ui.hideTips` in `~/.qwen/settings.json` auf `true`:

```json
{
  "ui": {
    "hideTips": true
  }
}
```

Du kannst diese Einstellung auch über den `/settings`-Befehl im Einstellungsdialog umschalten.

Tipps werden außerdem automatisch ausgeblendet, wenn der Screenreader-Modus aktiviert ist.