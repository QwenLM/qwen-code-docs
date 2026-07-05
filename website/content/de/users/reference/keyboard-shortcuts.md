# Qwen Code Tastaturkürzel

Dieses Dokument listet die verfügbaren Tastaturkürzel in Qwen Code auf.

## Allgemein

| Shortcut                       | Beschreibung                                                                                                                                                                                                                                                                                              |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Esc`                          | Schließt Dialoge und Vorschläge.                                                                                                                                                                                                                                                                          |
| `Ctrl+C`                       | Bricht die laufende Anfrage ab und löscht die Eingabe. Zweimal drücken, um die Anwendung zu beenden.                                                                                                                                                                                                      |
| `Ctrl+D`                       | Beendet die Anwendung, wenn die Eingabe leer ist. Zweimal drücken zur Bestätigung.                                                                                                                                                                                                                        |
| `Ctrl+L`                       | Löscht den Bildschirm.                                                                                                                                                                                                                                                                                    |
| `Ctrl+O`                       | Schaltet den Kompaktmodus um (Tool-Ausgabe und Thinking ein-/ausblenden).                                                                                                                                                                                                                                 |
| `Ctrl+S`                       | Ermöglicht die vollständige Ausgabe langer Antworten, indem die Kürzung deaktiviert wird. Verwende den Scrollback deines Terminals, um die gesamte Ausgabe anzuzeigen.                                                                                                                                    |
| `Ctrl+T`                       | Schaltet die Anzeige der Tool-Beschreibungen um.                                                                                                                                                                                                                                                          |
| `Ctrl+B`                       | Wenn ein Shell-Befehl im Vordergrund läuft: Wird in eine Hintergrundaufgabe umgewandelt. Der Child-Prozess läuft weiter, der Agent wird entblockt und die Shell erscheint in `/tasks` sowie im Dialog "Background tasks". Hat keine Funktion, wenn keine Shell ausgeführt wird – Strg+B wird dann an die Prompt-Bereich-Bindung (Cursor links) durchgereicht. |
| `Alt/Option+M`                 | Schaltet die Markdown-Ausgabe zwischen gerenderten Rich-Previews und dem Raw-/Source-Modus um. Unter macOS muss das Terminal Option als Meta senden.                                                                                                                                                      |
| `Shift+Tab` (`Tab` on Windows) | Wechselt durch die Approval-Modi (`plan` → `default` → `auto-edit` → `auto` → `yolo`)                                                                                                                                                                                                                     |

## Input Prompt

| Shortcut                                              | Beschreibung                                                                                                                          |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `!`                                                   | Schaltet den Shell-Modus um, wenn die Eingabe leer ist.                                                                               |
| `?`                                                   | Schaltet die Anzeige der Tastaturkürzel um, wenn die Eingabe leer ist.                                                                |
| `Ctrl+Enter` / `Cmd+Enter` / `Shift+Enter` / `Ctrl+J` | Fügt einen Zeilenumbruch ein.                                                                                                         |
| `Down Arrow`                                          | Zeile nach unten, dann ans Ende springen, dann nächster Verlaufseintrag.                                                              |
| `Enter`                                               | Sendet den aktuellen Prompt ab.                                                                                                       |
| `Meta+Delete` / `Ctrl+Delete`                         | Löscht das Wort rechts vom Cursor.                                                                                                    |
| `Tab`                                                 | Schließt den aktuellen Vorschlag automatisch ab, falls einer vorhanden ist.                                                           |
| `Up Arrow`                                            | Zeile nach oben, dann an den Anfang springen, dann vorheriger Verlaufseintrag.                                                        |
| `Ctrl+A` / `Home`                                     | Bewegt den Cursor an den Zeilenanfang.                                                                                                |
| `Ctrl+B` / `Left Arrow`                               | Bewegt den Cursor ein Zeichen nach links.                                                                                             |
| `Ctrl+C`                                              | Löscht den Input Prompt                                                                                                                                                                             |
| `Esc` (double press)                                  | Löscht den Input Prompt.                                                                                                              |
| `Ctrl+D` / `Delete`                                   | Löscht das Zeichen rechts vom Cursor.                                                                                                 |
| `Ctrl+E` / `End`                                      | Bewegt den Cursor an das Zeilenende.                                                                                                  |
| `Ctrl+F` / `Right Arrow`                              | Bewegt den Cursor ein Zeichen nach rechts.                                                                                            |
| `Ctrl+H` / `Backspace`                                | Löscht das Zeichen links vom Cursor.                                                                                                  |
| `Ctrl+K`                                              | Löscht vom Cursor bis zum Zeilenende.                                                                                                 |
| `Ctrl+Left Arrow` / `Meta+Left Arrow` / `Meta+B`      | Bewegt den Cursor ein Wort nach links.                                                                                                |
| `Ctrl+N`                                              | Zeile nach unten, dann ans Ende springen, dann nächster Verlaufseintrag.                                                              |
| `Ctrl+P`                                              | Zeile nach oben, dann an den Anfang springen, dann vorheriger Verlaufseintrag.                                                        |
| `Ctrl+R`                                              | Rückwärtssuche im Eingabe-/Shell-Verlauf.                                                                                             |
| `Ctrl+Y`                                              | Wiederholt die letzte fehlgeschlagene Anfrage.                                                                                        |
| `Ctrl+Right Arrow` / `Meta+Right Arrow` / `Meta+F`    | Bewegt den Cursor ein Wort nach rechts.                                                                                               |
| `Ctrl+U`                                              | Löscht vom Cursor bis zum Zeilenanfang.                                                                                               |
| `Ctrl+V` (Windows: `Alt+V`)                           | Fügt den Inhalt der Zwischenablage ein. Wenn die Zwischenablage ein Bild enthält, wird es gespeichert und eine Referenz darauf in den Prompt eingefügt. |
| `Ctrl+W` / `Meta+Backspace` / `Ctrl+Backspace`        | Löscht das Wort links vom Cursor.                                                                                                     |
| `Ctrl+X`                                              | Öffnet die aktuelle Eingabe in einem externen Editor.                                                                                 |

## Vorschläge

| Shortcut                | Beschreibung                             |
| ----------------------- | ---------------------------------------- |
| `Down Arrow` / `Ctrl+N` | Navigiert in den Vorschlägen nach unten. |
| `Tab` / `Enter`         | Übernimmt den ausgewählten Vorschlag.    |
| `Up Arrow` / `Ctrl+P`   | Navigiert in den Vorschlägen nach oben.  |

## Radio-Button-Auswahl

| Shortcut                      | Beschreibung                                                                                                      |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `Down Arrow` / `j` / `Ctrl+N` | Verschiebt die Auswahl nach unten.                                                                                |
| `Enter`                       | Bestätigt die Auswahl.                                                                                            |
| `Up Arrow` / `k` / `Ctrl+P`   | Verschiebt die Auswahl nach oben.                                                                                 |
| `1-9`                         | Wählt ein Element anhand seiner Nummer aus.                                                                       |
| (multi-digit)                 | Für Elemente mit Nummern größer als 9: Drücke die Ziffern in schneller Folge, um das entsprechende Element auszuwählen. |

## History Scrollback

Nur aktiv, wenn `ui.useTerminalBuffer` aktiviert ist (Settings → UI → Virtualized History). In diesem Modus wird der Konversationsverlauf in einem In-App-Viewport gerendert, anstatt im Scrollback des Host-Terminals, sodass die folgenden Tasten das native Scrollen des Terminals ersetzen.

| Shortcut        | Beschreibung                                           |
| --------------- | ------------------------------------------------------ |
| `Shift+Up`      | Scrollt den Verlauf eine Zeile nach oben.              |
| `Shift+Down`    | Scrollt den Verlauf eine Zeile nach unten.             |
| `PgUp`          | Scrollt den Verlauf eine Seite (Viewport-Höhe) nach oben. |
| `PgDn`          | Scrollt den Verlauf eine Seite (Viewport-Höhe) nach unten. |
| `Ctrl+Home`     | Springt an den Anfang der Konversation.                |
| `Ctrl+End`      | Springt ans Ende (und reaktiviert das Live-Auto-Follow). |
| **Mouse wheel** | Scrollt den Verlauf (3 Zeilen pro Rastung).            |
Wenn `ui.useTerminalBuffer` aktiviert ist, leitet das Terminal Mausereignisse an qwen-code weiter, sodass das Mausrad das Viewport der App steuern kann. Als Nebeneffekt **wird die native Textauswahl durch Klicken und Ziehen vom Programm abgefangen** – halte `Shift` (oder `Option` im macOS Terminal / iTerm) während des Ziehens gedrückt, um die Mauserfassung zu umgehen und Text auf die gewohnte Weise auszuwählen.

### tmux Trackpad-Scrolling

Innerhalb von tmux übersetzen einige Terminals Trackpad- oder Mausrad-Gesten in einfache `Up Arrow`- und `Down Arrow`-Sequenzen, bevor qwen-code sie empfängt. Diese Bytes sind identisch mit echten Pfeiltasten-Drücken, sodass qwen-code nicht unterscheiden kann, ob du das Viewport scrollen oder durch den Prompt-Verlauf navigieren wolltest.

Wenn das Trackpad-Scrolling in tmux den Prompt-Verlauf ändert, aktiviere `ui.useTerminalBuffer`; verwende dann `Shift+Up` / `Shift+Down` oder das Mausrad, wenn tmux Mausrad-Ereignisse an die App weiterleitet. Wenn du den Host-Scrollback bevorzugst, passe deine tmux-Maus-Bindings für Mausrad-Ereignisse an.

## IDE-Integration

| Shortcut | Beschreibung                      |
| -------- | --------------------------------- |
| `Ctrl+G` | Vom CLI empfangenen Kontext der IDE anzeigen |