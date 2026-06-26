# Qwen Code Tastaturkürzel

Dieses Dokument listet die verfügbaren Tastaturkürzel in Qwen Code auf.

## Allgemein

| Tastenkombination              | Beschreibung                                                                                                                                                                                                                                                                                           |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `Esc`                          | Dialoge und Vorschläge schließen.                                                                                                                                                                                                                                                                      |
| `Ctrl+C`                       | Aktuelle Anfrage abbrechen und die Eingabe leeren. Zweimal drücken, um die Anwendung zu beenden.                                                                                                                                                                                                       |
| `Ctrl+D`                       | Anwendung beenden, wenn die Eingabe leer ist. Zweimal drücken zur Bestätigung.                                                                                                                                                                                                                         |
| `Ctrl+L`                       | Bildschirm leeren.                                                                                                                                                                                                                                                                                     |
| `Ctrl+O`                       | Kompaktmodus umschalten (Tool-Ausgabe und Denkprozess ein-/ausblenden).                                                                                                                                                                                                                                |
| `Ctrl+S`                       | Ermöglicht das vollständige Drucken langer Antworten, deaktiviert die Kürzung. Verwenden Sie den Scrollback Ihres Terminals, um die gesamte Ausgabe anzuzeigen.                                                                                                                                        |
| `Ctrl+T`                       | Anzeige von Tool-Beschreibungen umschalten.                                                                                                                                                                                                                                                            |
| `Ctrl+B`                       | Während ein Shell-Befehl im Vordergrund läuft: ihn zu einer Hintergrundaufgabe befördern. Der Kindprozess läuft weiter, der Agent wird wieder aktiv, und die Shell erscheint in `/tasks` und im Dialog „Hintergrundaufgaben“. Keine Aktion, wenn keine Shell ausgeführt wird – Ctrl+B fällt dann auf seine Bindung im Eingabebereich zurück (Cursor nach links). |
| `Alt/Option+M`                 | Markdown-Ausgabe zwischen gerenderten Vorschauen und Roh-/Quellmodus umschalten. Unter macOS muss das Terminal Option als Meta senden.                                                                                                                                                                |
| `Shift+Tab` (`Tab` unter Windows) | Genehmigungsmodi durchschalten (`plan` → `default` → `auto-edit` → `auto` → `yolo`)                                                                                                                                                                                                                  |

## Eingabeaufforderung

| Tastenkombination                                         | Beschreibung                                                                                                                           |
| --------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `!`                                                       | Shell-Modus umschalten, wenn die Eingabe leer ist.                                                                                     |
| `?`                                                       | Anzeige der Tastaturkürzel umschalten, wenn die Eingabe leer ist.                                                                      |
| `Ctrl+Enter` / `Cmd+Enter` / `Shift+Enter` / `Ctrl+J`     | Neue Zeile einfügen.                                                                                                                   |
| `Pfeil nach unten`                                        | Eine Zeile nach unten, dann zum Ende springen, dann nächster Verlaufseintrag.                                                           |
| `Enter`                                                   | Aktuelle Eingabe absenden.                                                                                                             |
| `Meta+Delete` / `Ctrl+Delete`                             | Wort rechts vom Cursor löschen.                                                                                                        |
| `Tab`                                                     | Autovervollständigung des aktuellen Vorschlags, falls vorhanden.                                                                       |
| `Pfeil nach oben`                                         | Eine Zeile nach oben, dann zum Anfang springen, dann vorheriger Verlaufseintrag.                                                        |
| `Ctrl+A` / `Pos1`                                         | Cursor an den Zeilenanfang bewegen.                                                                                                    |
| `Ctrl+B` / `Pfeil links`                                  | Cursor ein Zeichen nach links bewegen.                                                                                                 |
| `Ctrl+C`                                                  | Eingabeaufforderung leeren.                                                                                                            |
| `Esc` (zweimal drücken)                                   | Eingabeaufforderung leeren.                                                                                                            |
| `Ctrl+D` / `Delete`                                       | Zeichen rechts vom Cursor löschen.                                                                                                     |
| `Ctrl+E` / `Ende`                                         | Cursor an das Zeilenende bewegen.                                                                                                      |
| `Ctrl+F` / `Pfeil rechts`                                 | Cursor ein Zeichen nach rechts bewegen.                                                                                                |
| `Ctrl+H` / `Rücktaste`                                    | Zeichen links vom Cursor löschen.                                                                                                      |
| `Ctrl+K`                                                  | Vom Cursor bis zum Zeilenende löschen.                                                                                                 |
| `Ctrl+Pfeil links` / `Meta+Pfeil links` / `Meta+B`        | Cursor ein Wort nach links bewegen.                                                                                                    |
| `Ctrl+N`                                                  | Eine Zeile nach unten, dann zum Ende springen, dann nächster Verlaufseintrag.                                                           |
| `Ctrl+P`                                                  | Eine Zeile nach oben, dann zum Anfang springen, dann vorheriger Verlaufseintrag.                                                        |
| `Ctrl+R`                                                  | Rückwärtssuche durch Eingabe-/Shell-Verlauf.                                                                                           |
| `Ctrl+Y`                                                  | Letzte fehlgeschlagene Anfrage wiederholen.                                                                                            |
| `Ctrl+Pfeil rechts` / `Meta+Pfeil rechts` / `Meta+F`      | Cursor ein Wort nach rechts bewegen.                                                                                                   |
| `Ctrl+U`                                                  | Vom Cursor bis zum Zeilenanfang löschen.                                                                                               |
| `Ctrl+V` (Windows: `Alt+V`)                               | Zwischenablageinhalt einfügen. Wenn die Zwischenablage ein Bild enthält, wird es gespeichert und ein Verweis darauf in die Eingabe eingefügt. |
| `Ctrl+W` / `Meta+Rücktaste` / `Ctrl+Rücktaste`            | Wort links vom Cursor löschen.                                                                                                         |
| `Ctrl+X` / `Meta+Enter`                                   | Aktuelle Eingabe in einem externen Editor öffnen.                                                                                      |
## Vorschläge

| Tastenkürzel                | Beschreibung                               |
| --------------------------- | ------------------------------------------ |
| `Pfeil nach unten` / `Strg+N` | Durch die Vorschläge nach unten navigieren. |
| `Tab` / `Eingabe`            | Ausgewählten Vorschlag übernehmen.          |
| `Pfeil nach oben` / `Strg+P`   | Durch die Vorschläge nach oben navigieren.  |

## Optionsfeld-Auswahl

| Tastenkürzel                      | Beschreibung                                                                                                 |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `Pfeil nach unten` / `j` / `Strg+N` | Auswahl nach unten verschieben.                                                                              |
| `Eingabe`                         | Auswahl bestätigen.                                                                                          |
| `Pfeil nach oben` / `k` / `Strg+P`   | Auswahl nach oben verschieben.                                                                               |
| `1-9`                             | Ein Element über seine Nummer auswählen.                                                                     |
| (mehrstellig)                     | Bei Elementen mit Nummern größer als 9 die Ziffern schnell hintereinander drücken, um das entsprechende Element auszuwählen. |

## Verlauf rückwärts scrollen

Nur aktiv, wenn `ui.useTerminalBuffer` aktiviert ist (Einstellungen → UI → Virtualisierter Verlauf). In diesem Modus wird der Unterhaltungsverlauf innerhalb eines anwendungsinternen Viewports dargestellt, anstatt im hosteigenen Terminal-Rücklauf. Daher ersetzen die nachfolgenden Tasten das native Scrollen des Terminals.

| Tastenkürzel        | Beschreibung                                                   |
| ------------------- | -------------------------------------------------------------- |
| `Umschalt+Pfeil hoch` | Verlauf um eine Zeile nach oben scrollen.                      |
| `Umschalt+Pfeil runter` | Verlauf um eine Zeile nach unten scrollen.                    |
| `Bild auf`          | Verlauf um eine Seite (Viewport-Höhe) nach oben scrollen.       |
| `Bild ab`           | Verlauf um eine Seite (Viewport-Höhe) nach unten scrollen.     |
| `Strg+Pos1`         | Zum Anfang der Unterhaltung springen.                           |
| `Strg+Ende`         | Zum Ende springen (und den Live-Autofollow wieder aktivieren).  |
| **Mausrad**         | Verlauf scrollen (3 Zeilen pro Raste).                         |

Wenn `ui.useTerminalBuffer` aktiviert ist, leitet das Terminal Mausereignisse an qwen-code weiter, sodass das Rad den anwendungsinternen Viewport steuern kann. Als Nebeneffekt wird **die native Textauswahl per Klick-und-Ziehen vom Programm konsumiert** – halten Sie `Umschalt` (oder `Option` im macOS-Terminal / iTerm) während des Ziehens gedrückt, um die Mauserfassung zu umgehen und den Text auf die gewohnte Weise auszuwählen.

### tmux Trackpad-Scrollen

Innerhalb von tmux übersetzen manche Terminals Trackpad- oder Radgesten in einfache `Pfeil nach oben`- und `Pfeil nach unten`-Sequenzen, bevor qwen-code sie sieht. Diese Bytes sind mit echten Pfeiltastendrücken identisch, sodass qwen-code nicht unterscheiden kann, ob Sie den Viewport scrollen oder die Eingabezeilenhistorie durchblättern möchten.

Wenn Trackpad-Scrollen in tmux die Eingabezeilenhistorie verändert, aktivieren Sie `ui.useTerminalBuffer`. Verwenden Sie dann `Umschalt+Pfeil hoch` / `Umschalt+Pfeil runter` oder das Mausrad, wenn tmux Radereignisse an die Anwendung weiterleitet. Bevorzugen Sie den hosteigenen Rücklauf, passen Sie Ihre tmux-Mausbindungen für Radereignisse an.

## IDE-Integration

| Tastenkürzel | Beschreibung                             |
| ------------ | ---------------------------------------- |
| `Strg+G`     | Siehe Kontext, den die CLI von der IDE erhalten hat. |
