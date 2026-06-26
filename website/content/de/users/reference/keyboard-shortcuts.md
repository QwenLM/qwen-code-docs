# Qwen Code Tastaturkürzel

Dieses Dokument listet die verfügbaren Tastaturkürzel in Qwen Code auf.

## Allgemein

| Shortcut                       | Beschreibung                                                                                                                                                                                                                                                                                                                                                            |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Esc`                          | Dialoge und Vorschläge schließen.                                                                                                                                                                                                                                                                                                                                       |
| `Ctrl+C`                       | Laufende Anfrage abbrechen und Eingabe löschen. Zweimal drücken, um die Anwendung zu beenden.                                                                                                                                                                                                                                                                           |
| `Ctrl+D`                       | Anwendung beenden, wenn die Eingabe leer ist. Zweimal drücken zur Bestätigung.                                                                                                                                                                                                                                                                                          |
| `Ctrl+L`                       | Bildschirm leeren.                                                                                                                                                                                                                                                                                                                                                      |
| `Ctrl+O`                       | Kompaktmodus umschalten (Tool-Ausgabe und Denkprozess ein-/ausblenden).                                                                                                                                                                                                                                                                                                 |
| `Ctrl+S`                       | Ermöglicht vollständige Ausgabe langer Antworten, deaktiviert Abschneidung. Verwenden Sie den Scrollback-Puffer Ihres Terminals, um die gesamte Ausgabe anzuzeigen.                                                                                                                                                                                                     |
| `Ctrl+T`                       | Anzeige der Tool-Beschreibungen umschalten.                                                                                                                                                                                                                                                                                                                             |
| `Ctrl+B`                       | Während ein Shell-Befehl im Vordergrund ausgeführt wird: ihn zu einer Hintergrundaufgabe erheben. Das Kind läuft weiter, der Agent ist wieder frei und die Shell erscheint in `/tasks` und im Dialog „Hintergrundaufgaben“. Keine Aktion, wenn keine Shell ausgeführt wird – Ctrl+B fällt dann auf seine Bindung im Eingabebereich zurück (Cursor nach links).            |
| `Alt/Option+M`                 | Markdown-Ausgabe zwischen gerenderten Vorschauen und Roh-/Quellmodus umschalten. Auf macOS muss das Terminal Option als Meta senden.                                                                                                                                                                                                                                    |
| `Shift+Tab` (`Tab` unter Windows) | Genehmigungsmodi durchschalten (`plan` → `default` → `auto-edit` → `auto` → `yolo`)                                                                                                                                                                                                                                                                                    |

## Eingabeaufforderung

| Shortcut                                              | Beschreibung                                                                                                                            |
| ----------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `!`                                                   | Shell-Modus umschalten, wenn die Eingabe leer ist.                                                                                      |
| `?`                                                   | Anzeige der Tastaturkürzel umschalten, wenn die Eingabe leer ist.                                                                       |
| `Ctrl+Enter` / `Cmd+Enter` / `Shift+Enter` / `Ctrl+J` | Neue Zeile einfügen.                                                                                                                    |
| `Pfeil nach unten`                                    | Eine Zeile nach unten, dann zum Ende springen, dann nächster Verlaufseintrag.                                                           |
| `Enter`                                               | Aktuelle Eingabe absenden.                                                                                                              |
| `Meta+Entf` / `Ctrl+Entf`                             | Wort rechts vom Cursor löschen.                                                                                                         |
| `Tab`                                                 | Aktuellen Vorschlag automatisch vervollständigen, falls vorhanden.                                                                      |
| `Pfeil nach oben`                                     | Eine Zeile nach oben, dann zum Anfang springen, dann vorheriger Verlaufseintrag.                                                        |
| `Ctrl+A` / `Pos1`                                     | Cursor an den Zeilenanfang bewegen.                                                                                                     |
| `Ctrl+B` / `Pfeil nach links`                         | Cursor ein Zeichen nach links bewegen.                                                                                                  |
| `Ctrl+C`                                              | Eingabe löschen.                                                                                                                        |
| `Esc` (Doppeldruck)                                   | Eingabe löschen.                                                                                                                        |
| `Ctrl+D` / `Entf`                                     | Zeichen rechts vom Cursor löschen.                                                                                                      |
| `Ctrl+E` / `Ende`                                     | Cursor an das Zeilenende bewegen.                                                                                                       |
| `Ctrl+F` / `Pfeil nach rechts`                        | Cursor ein Zeichen nach rechts bewegen.                                                                                                 |
| `Ctrl+H` / `Rücktaste`                                | Zeichen links vom Cursor löschen.                                                                                                       |
| `Ctrl+K`                                              | Vom Cursor bis zum Zeilenende löschen.                                                                                                  |
| `Ctrl+Pfeil links` / `Meta+Pfeil links` / `Meta+B`    | Cursor ein Wort nach links bewegen.                                                                                                     |
| `Ctrl+N`                                              | Eine Zeile nach unten, dann zum Ende springen, dann nächster Verlaufseintrag.                                                           |
| `Ctrl+P`                                              | Eine Zeile nach oben, dann zum Anfang springen, dann vorheriger Verlaufseintrag.                                                        |
| `Ctrl+R`                                              | Rückwärtssuche durch Eingabe-/Shell-Verlauf.                                                                                            |
| `Ctrl+Y`                                              | Letzte fehlgeschlagene Anfrage wiederholen.                                                                                             |
| `Ctrl+Pfeil rechts` / `Meta+Pfeil rechts` / `Meta+F`  | Cursor ein Wort nach rechts bewegen.                                                                                                    |
| `Ctrl+U`                                              | Vom Cursor bis zum Zeilenanfang löschen.                                                                                                |
| `Ctrl+V` (Windows: `Alt+V`)                           | Zwischenablage-Inhalt einfügen. Wenn die Zwischenablage ein Bild enthält, wird es gespeichert und ein Verweis darauf in die Eingabe eingefügt.                                                          |
| `Ctrl+W` / `Meta+Rücktaste` / `Ctrl+Rücktaste`        | Wort links vom Cursor löschen.                                                                                                          |
| `Ctrl+X` / `Meta+Enter`                               | Aktuelle Eingabe in einem externen Editor öffnen.                                                                                       |

## Vorschläge

| Shortcut                | Beschreibung                                  |
| ----------------------- | --------------------------------------------- |
| `Pfeil nach unten` / `Ctrl+N` | Durch die Vorschläge nach unten navigieren.   |
| `Tab` / `Enter`         | Ausgewählten Vorschlag übernehmen.            |
| `Pfeil nach oben` / `Ctrl+P`   | Durch die Vorschläge nach oben navigieren.    |

## Optionsfeld-Auswahl

| Shortcut                      | Beschreibung                                                                                                  |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `Pfeil nach unten` / `j` / `Ctrl+N` | Auswahl nach unten bewegen.                                                                                   |
| `Enter`                       | Auswahl bestätigen.                                                                                           |
| `Pfeil nach oben` / `k` / `Ctrl+P`   | Auswahl nach oben bewegen.                                                                                    |
| `1-9`                         | Ein Element über seine Nummer auswählen.                                                                      |
| (mehrstellig)                 | Für Elemente mit Nummern größer als 9 die Ziffern schnell hintereinander drücken, um das entsprechende Element auszuwählen. |

## History scrollback

Nur aktiv, wenn `ui.useTerminalBuffer` aktiviert ist (Einstellungen → UI → Virtualisierter Verlauf). In diesem Modus wird der Gesprächsverlauf in einem anwendungsinternen Ansichtsfenster gerendert, anstatt im Scrollback des Host-Terminals, daher ersetzen die folgenden Tasten das native Scrollen des Terminals.

| Shortcut        | Beschreibung                                                  |
| --------------- | ------------------------------------------------------------- |
| `Shift+Pfeil nach oben`  | Verlauf eine Zeile nach oben scrollen.                        |
| `Shift+Pfeil nach unten` | Verlauf eine Zeile nach unten scrollen.                       |
| `Bild auf`      | Verlauf eine Seite (Ansichtsfensterhöhe) nach oben scrollen.  |
| `Bild ab`       | Verlauf eine Seite (Ansichtsfensterhöhe) nach unten scrollen. |
| `Ctrl+Pos1`     | Zum Anfang des Gesprächs springen.                            |
| `Ctrl+Ende`     | Zum Ende springen (und Live-Auto-Follow erneut aktivieren).   |
| **Mausrad**     | Verlauf scrollen (3 Zeilen pro Tick).                         |

Wenn `ui.useTerminalBuffer` aktiviert ist, leitet das Terminal Mausereignisse an qwen-code weiter, sodass das Mausrad das anwendungsinterne Ansichtsfenster steuern kann. Als Nebeneffekt wird **die native Textauswahl durch Klicken und Ziehen vom Programm abgefangen** – halten Sie beim Ziehen `Shift` (oder `Option` auf macOS Terminal / iTerm) gedrückt, um die Mauserfassung zu umgehen und Text auf die übliche Weise auszuwählen.

### tmux Trackpad-Scrolling

In tmux übersetzen einige Terminals Trackpad- oder Mausrad-Gesten in einfache `Pfeil nach oben`- und `Pfeil nach unten`-Sequenzen, bevor qwen-code sie sieht. Diese Bytes sind identisch mit echten Pfeiltasten-Drücken, daher kann qwen-code nicht unterscheiden, ob Sie das Ansichtsfenster scrollen oder die Eingabehistorie durchsuchen wollten.

Wenn Trackpad-Scrolling in tmux die Eingabehistorie verändert, aktivieren Sie `ui.useTerminalBuffer`; verwenden Sie dann `Shift+Pfeil nach oben` / `Shift+Pfeil nach unten` oder das Mausrad, wenn tmux Radereignisse an die Anwendung weiterleitet. Wenn Sie den nativen Scrollback bevorzugen, passen Sie Ihre tmux-Mausbindungen für Radereignisse an.

## IDE-Integration

| Shortcut | Beschreibung                                          |
| -------- | ----------------------------------------------------- |
| `Ctrl+G` | Kontext anzeigen, den die CLI von der IDE erhalten hat |