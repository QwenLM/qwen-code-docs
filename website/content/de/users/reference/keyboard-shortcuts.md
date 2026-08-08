# Qwen Code Tastaturkürzel

Dieses Dokument listet die verfügbaren Tastaturkürzel in Qwen Code auf.

## Allgemein

| Shortcut                       | Beschreibung                                                                                                                                                                                                                                        |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Esc`                          | Schließt Dialoge und Vorschläge. Bei leerem Prompt wird eine laufende Anfrage abgebrochen; im Leerlauf außerhalb des IDE-Modus zweimal drücken, um den Rewind-Selector zu öffnen.                                                                                               |
| `Ctrl+C`                       | Bricht die laufende Anfrage ab und löscht die Eingabe. Zweimal drücken, um die Anwendung zu beenden.                                                                                                                                                               |
| `Ctrl+D`                       | Beendet die Anwendung, wenn die Eingabe leer ist. Zweimal drücken zur Bestätigung.                                                                                                                                                                                |
| `Ctrl+L`                       | Löscht den Bildschirm.                                                                                                                                                                                                                                  |
| `Ctrl+O` / `Alt/Option+T`      | Schaltet den erweiterten Detailmodus um: alle Thinking-Blöcke und Tool-Ausgaben inline ein- oder ausblenden. Erneut drücken zum Einklappen. Wenn `ui.useTerminalBuffer` deaktiviert ist, zeichnet das Umschalten die gesamte Konversation mit ungekürzter Ausgabe in den Terminal-Scrollback neu. |
| `Ctrl+S`                       | Speichert nicht-leere Eingaben für das aktuelle Projekt und stellt sie beim nächsten Start wieder her. Bei leerer Eingabe wird die Kürzung deaktiviert, sodass lange Antworten vollständig ausgegeben werden können. Verwende den Scrollback deines Terminals, um die gesamte Ausgabe anzuzeigen.                        |
| `Ctrl+T`                       | Schaltet die Anzeige der Tool-Beschreibungen um.                                                                                                                                                                                                           |
| `Alt/Option+M`                 | Schaltet die Markdown-Ausgabe zwischen gerenderten Rich-Previews und dem Raw-/Source-Modus um. Unter macOS muss das Terminal Option als Meta senden.                                                                                                                        |
| `Shift+Tab` (`Tab` on Windows) | Wechselt durch die Genehmigungsmodi (`plan` → `default` → `auto-edit` → `auto` → `yolo`)                                                                                                                                                                          |

## Input Prompt

| Shortcut                                              | Beschreibung                                                                                                                         |
| ----------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `!`                                                   | Schaltet den Shell-Modus um, wenn die Eingabe leer ist.                                                                                          |
| `?`                                                   | Schaltet die Anzeige der Tastaturkürzel um, wenn die Eingabe leer ist.                                                                          |
| `/`                                                   | Öffnet die Slash-Befehl-Autovervollständigung.                                                                                                      |
| `@`                                                   | Öffnet die Autovervollständigung für Dateien, Ordner und anderen Kontext.                                                                              |
| `Space` (leerer Prompt)                                | Startet die Spracherkennung, wenn sie und ein Sprachmodell konfiguriert sind; Halte- oder Tippverhalten folgt `general.voice.mode`.                  |
| `Ctrl+Enter` / `Cmd+Enter` / `Shift+Enter` / `Ctrl+J` | Fügt einen Zeilenumbruch ein.                                                                                                                   |
| `Down Arrow`                                          | Zeile nach unten, dann ans Ende springen, dann nächster Verlaufseintrag.                                                                                      |
| `Enter`                                               | Sendet den aktuellen Prompt ab. Während eine Antwort läuft, wird der aktuelle Turn gesteuert.                                                     |
| `Ctrl+Q`                                              | Reiht den aktuellen Prompt oder Befehl für den nächsten Turn ein, anstatt den laufenden zu steuern; er wird ausgeführt, nachdem Qwen Code in den Leerlauf zurückkehrt.                 |
| `Up Arrow` (am Anfang) / `Esc`                       | Wenn eingereihte Nachrichten vorhanden sind, werden diese zurück in die Eingabe zum Bearbeiten verschoben (`Up Arrow` am Anfang, solange die Eingabe angezeigt wird; `Esc` nur wenn der Agent im Leerlauf ist). Während der Agent antwortet und die Eingabe leer ist, bricht `Esc` stattdessen die laufende Anfrage ab (eingereihte Nachrichten werden dann zurück in die Eingabe verschoben). |
| `Meta+D` / `Meta+Delete` / `Ctrl+Delete`              | Löscht das Wort rechts vom Cursor.                                                                                         |
| `Tab`                                                 | Schließt den aktuellen Vorschlag automatisch ab, falls einer vorhanden ist.                                                                                  |
| `Up Arrow`                                            | Zeile nach oben, dann an den Anfang springen, dann vorheriger Verlaufseintrag.                                                                                      |
| `Ctrl+A` / `Home`                                     | Bewegt den Cursor an den Zeilenanfang.                                                                                       |
| `Ctrl+B` / `Left Arrow`                               | Bewegt den Cursor ein Zeichen nach links.                                                                                          |
| `Ctrl+C`                                              | Löscht den Input Prompt                                                                                                              |
| `Esc` (double press)                                  | Löscht den Input Prompt.                                                                                                             |
| `Ctrl+D` / `Delete`                                   | Löscht das Zeichen rechts vom Cursor.                                                                                    |
| `Ctrl+E` / `End`                                      | Bewegt den Cursor an das Zeilenende.                                                                                             |
| `Ctrl+F` / `Right Arrow`                              | Bewegt den Cursor ein Zeichen nach rechts.                                                                                         |
| `Ctrl+H` / `Backspace`                                | Löscht das Zeichen links vom Cursor.                                                                                     |
| `Ctrl+K`                                              | Löscht vom Cursor bis zum Zeilenende.                                                                                      |
| `Ctrl+Left Arrow` / `Meta+Left Arrow` / `Meta+B`      | Bewegt den Cursor ein Wort nach links.                                                                                               |
| `Ctrl+N`                                              | Zeile nach unten, dann ans Ende springen, dann nächster Verlaufseintrag.                                                                                      |
| `Ctrl+P`                                              | Zeile nach oben, dann an den Anfang springen, dann vorheriger Verlaufseintrag.                                                                                      |
| `Ctrl+R`                                              | Rückwärtssuche im Eingabe-/Shell-Verlauf.                                                                                         |
| `Ctrl+Y`                                              | Wiederholt die letzte fehlgeschlagene Anfrage.                                                                                                      |
| `Ctrl+Right Arrow` / `Meta+Right Arrow` / `Meta+F`    | Bewegt den Cursor ein Wort nach rechts.                                                                                              |
| `Ctrl+U`                                              | Löscht vom Cursor bis zum Zeilenanfang.                                                                                |
| `Ctrl+V` / `Option+V` (Windows: `Alt+V`)              | Fügt den Inhalt der Zwischenablage ein. Wenn die Zwischenablage ein Bild enthält, wird es gespeichert und eine Referenz darauf in den Prompt eingefügt. |
| `Ctrl+W` / `Meta+Backspace` / `Ctrl+Backspace`        | Löscht das Wort links vom Cursor.                                                                                          |
| `Ctrl+X`                                              | Öffnet die aktuelle Eingabe in einem externen Editor.                                                                                       |
| `Ctrl+Z`                                              | Macht die letzte Eingabebearbeitung rückgängig.                                                                                                           |
| `Ctrl+Shift+Z`                                        | Stellt die letzte rückgängig gemachte Eingabebearbeitung wieder her.                                                                                                    |

## Foreground Shell

Diese Tastenkürzel gelten, während ein interaktiver foreground Shell-Befehl läuft.

| Shortcut                            | Beschreibung                                                                                                                                                    |
| ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Ctrl+F`                            | Schaltet den Tastaturfokus zwischen Shell und Prompt um. Wenn keine Shell läuft, bewegt `Ctrl+F` den Prompt-Cursor nach rechts.                                      |
| `Ctrl+Shift+Up` / `Ctrl+Shift+Down` | Scrollt die fokussierte Shell nach oben oder unten.                                                                                                                           |
| `Ctrl+B`                            | Befördert die Shell in eine Hintergrundaufgabe. Der Child-Prozess läuft weiter, der Turn des Agenten wird entblockt, und die Shell erscheint in `/tasks` und im Dialog „Background tasks". |

## Background-tasks-Dialog

Fokussiere die Background-tasks-Pille im Footer (verwende `Down Arrow` bei leerem Composer – dies bewegt sich durch das Live-Agent-Panel und, falls vorhanden, die Arena-Tab-Leiste zuerst) und drücke `Enter`, um den Dialog zu öffnen. Er listet Hintergrund-Agenten, Shells, Monitore, Workflow-Ausführungen und Memory-Dreams auf.

| Shortcut                  | Beschreibung                                                                                                                                              |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Up Arrow` / `Down Arrow` | Verschiebt die Auswahl zwischen Tasks.                                                                                                                    |
| `Enter`                   | Öffnet die Detailansicht für den ausgewählten Task.                                                                                                       |
| `x`                       | Stoppt den ausgewählten Task (gibt einen pausierten Agenten auf). Ein foreground Agent, der deinen Turn blockiert, benötigt ein zweites `x` zur Bestätigung. |
| `r`                       | Setzt den ausgewählten pausierten Agenten fort.                                                                                                           |
| `p`                       | Pausiert oder setzt den ausgewählten Hintergrund-Workflowlauf kooperativ fort. Während der Pause werden keine neuen Agenten gestartet, aber Skriptcode zwischen Agentaufrufen läuft weiter. |
| `s`                       | Speichert das Skript eines abgeschlossenen (completed, failed oder cancelled) Workflowlaufs (nur Detailansicht).                                           |
| `Left Arrow` / `Esc`      | Kehrt von der Detailansicht zur Liste zurück oder schließt den Dialog.                                                                                    |

## Vorschläge

| Shortcut                             | Beschreibung                                                              |
| ------------------------------------ | ------------------------------------------------------------------------ |
| `Down Arrow` / `Ctrl+N`              | Navigiert in den Vorschlägen nach unten.                                   |
| `Tab` / `Enter`                      | Übernimmt den ausgewählten Vorschlag.                                          |
| `Up Arrow` / `Ctrl+P`                | Navigiert in den Vorschlägen nach oben.                                     |
| `Right Arrow`                        | Übernimmt einen Ghost-Text-Vorschlag, wenn der Prompt leer ist.                 |
| `Ctrl+Tab` / `Ctrl+Right Arrow`      | Wechselt zur nächsten Autovervollständigungs-Kategorie, wenn Kategorie-Tabs angezeigt werden.     |
| `Ctrl+Shift+Tab` / `Ctrl+Left Arrow` | Wechselt zur vorherigen Autovervollständigungs-Kategorie, wenn Kategorie-Tabs angezeigt werden. |

## History-Suche

Drücke `Ctrl+R`, um im Prompt-Verlauf zu suchen, oder im Shell-Verlauf, während der Shell-Modus aktiv ist.

| Shortcut                     | Beschreibung                                                |
| ---------------------------- | ---------------------------------------------------------- |
| `Up Arrow` / `Down Arrow`    | Navigiert durch die passenden Verlaufseinträge.                 |
| `Left Arrow` / `Right Arrow` | Klappt einen langen ausgewählten Eintrag ein oder aus.                  |
| `Tab`                        | Übernimmt den ausgewählten Eintrag in den Prompt, ohne ihn zu senden. |
| `Enter`                      | Sendet den ausgewählten Eintrag.                                 |
| `Esc`                        | Schließt die History-Suche.                                      |

## Radio-Button-Auswahl

| Shortcut                      | Beschreibung                                                                                                   |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `Down Arrow` / `j` / `Ctrl+N` | Verschiebt die Auswahl nach unten.                                                                                          |
| `Enter`                       | Bestätigt die Auswahl.                                                                                            |
| `Up Arrow` / `k` / `Ctrl+P`   | Verschiebt die Auswahl nach oben.                                                                                            |
| `1-9`                         | Wählt ein Element anhand seiner Nummer aus.                                                                                 |
| (multi-digit)                 | Für Elemente mit Nummern größer als 9: Drücke die Ziffern in schneller Folge, um das entsprechende Element auszuwählen. |

## History scrollback

Aktiv, wenn `ui.useTerminalBuffer` aktiviert ist (Settings → UI → Virtualized History), der Screen-Reader-Modus ausgeschaltet ist und Qwen Code in einem kompatiblen interaktiven Terminal läuft (`stdout` ist ein TTY, CI ist inaktiv und `TERM` ist nicht `dumb`) — dies ist der Standard für normale Nicht-Screen-Reader-Sitzungen. In diesem Modus wird der Konversationsverlauf in einem In-App-Viewport gerendert, anstatt im Scrollback des Host-Terminals, sodass die folgenden Tasten das native Scrollen des Terminals ersetzen.

| Shortcut        | Beschreibung                                                                     |
| --------------- | ------------------------------------------------------------------------------- |
| `Shift+Up`      | Scrollt den Verlauf eine Zeile nach oben.                                                     |
| `Shift+Down`    | Scrollt den Verlauf eine Zeile nach unten.                                                   |
| `PgUp`          | Scrollt den Verlauf eine Seite (Viewport-Höhe) nach oben.                                   |
| `PgDn`          | Scrollt den Verlauf eine Seite (Viewport-Höhe) nach unten.                                  |
| `Ctrl+Home`     | Springt an den Anfang der Konversation.                                            |
| `Ctrl+End`      | Springt ans Ende (und reaktiviert das Live-Auto-Follow).                            |
| **Mouse wheel** | Scrollt den Verlauf (3 Zeilen pro Rastung). Erfordert `ui.mouseTracking` (standardmäßig aktiviert). |

Wenn `ui.useTerminalBuffer` aktiviert und `ui.mouseTracking` eingeschaltet ist (Standard), leitet das Terminal Mausereignisse an qwen-code weiter, sodass das Mausrad den In-App-Viewport steuern kann. Als Nebeneffekt wird die native Textauswahl durch Klicken und Ziehen vom Programm abgefangen — qwen-code bietet dafür eine eigene Lösung: **Ziehen zum Auswählen von Text im History-Viewport, Doppelklick zum Auswählen eines Wortes, Dreifachklick zum Auswählen einer Zeile.** Die Auswahl wird hervorgehoben und beim Loslassen der Maus in die Zwischenablage kopiert (funktioniert lokal, über SSH via OSC 52 und innerhalb von tmux). Ein einfacher Klick löscht die Auswahl; Scrollen oder neue Ausgabe löscht sie ebenfalls. Die Auswahl ist derzeit auf den sichtbaren Viewport beschränkt. Du kannst jederzeit auf die native Auswahl des Terminals zurückgreifen, indem du `Shift` (oder `Option` im macOS Terminal / iTerm) während des Ziehens gedrückt hältst. Setze `ui.mouseTracking` auf `false`, um zu verhindern, dass qwen-code die Maus vollständig erfasst; dadurch werden das native Rechtsklick-Menü des Terminals, OSC-8-Hyperlink-Klicks und die Textauswahl durch Klicken und Ziehen wiederhergestellt, aber der In-App-Viewport reagiert dann nicht mehr auf die Maus — verwende in diesem Fall die obigen Tastaturkürzel zum Scrollen.

### tmux Trackpad-Scrolling

Innerhalb von tmux übersetzen einige Terminals Trackpad- oder Mausrad-Gesten in einfache `Up Arrow`- und `Down Arrow`-Sequenzen, bevor qwen-code sie empfängt. Diese Bytes sind identisch mit echten Pfeiltasten-Drücken, sodass qwen-code nicht unterscheiden kann, ob du das Viewport scrollen oder durch den Prompt-Verlauf navigieren wolltest.

Wenn das Trackpad-Scrolling in tmux den Prompt-Verlauf ändert, stelle sicher, dass `ui.useTerminalBuffer` aktiviert ist; verwende dann `Shift+Up` / `Shift+Down` oder das Mausrad, wenn tmux Mausrad-Ereignisse an die App weiterleitet (erfordert `ui.mouseTracking`). Wenn du den Host-Scrollback bevorzugst, passe deine tmux-Maus-Bindings für Mausrad-Ereignisse an.

## IDE-Integration

| Shortcut | Beschreibung                       |
| -------- | --------------------------------- |
| `Ctrl+G` | Vom IDE empfangenen Kontext-CLI anzeigen |
