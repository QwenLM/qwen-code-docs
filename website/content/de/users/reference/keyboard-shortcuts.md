# Qwen Code Tastenkürzel

Dieses Dokument listet die verfügbaren Tastenkürzel in Qwen Code auf.

## Allgemein

| Shortcut                       | Beschreibung                                                                                                           |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------- |
| `Esc`                          | Schließt Dialoge und Vorschläge.                                                                                        |
| `Ctrl+C`                       | Bricht die aktuelle Anfrage ab und leert die Eingabe. Zweimal drücken, um die Anwendung zu beenden.                                  |
| `Ctrl+D`                       | Beendet die Anwendung, wenn die Eingabe leer ist. Zweimal drücken, um zu bestätigen.                                                   |
| `Ctrl+L`                       | Löscht den Bildschirm.                                                                                                     |
| `Ctrl+O`                       | Schaltet den Kompaktmodus um (Tool-Ausgabe und Denkprozess ausblenden/einblenden).                                                             |
| `Ctrl+S`                       | Gibt lange Antworten vollständig aus und deaktiviert die Kürzung. Verwende den Scrollback deines Terminals, um die gesamte Ausgabe anzuzeigen. |
| `Ctrl+T`                       | Schaltet die Anzeige von Tool-Beschreibungen um.                                                                              |
| `Shift+Tab` (`Tab` unter Windows) | Wechselt durch die Genehmigungsmodi (`plan` → `default` → `auto-edit` → `yolo`)                                                      |

## Eingabeaufforderung

| Shortcut                                           | Beschreibung                                                                                                                         |
| -------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `!`                                                | Schaltet den Shell-Modus um, wenn die Eingabe leer ist.                                                                                          |
| `?`                                                | Schaltet die Anzeige der Tastenkürzel um, wenn die Eingabe leer ist.                                                                          |
| `\` (am Zeilenende) + `Enter`                     | Fügt einen Zeilenumbruch ein.                                                                                                                   |
| `Down Arrow`                                       | Navigiert nach unten im Eingabeverlauf.                                                                                            |
| `Enter`                                            | Sendet die aktuelle Eingabe.                                                                                                          |
| `Meta+Delete` / `Ctrl+Delete`                      | Löscht das Wort rechts vom Cursor.                                                                                         |
| `Tab`                                              | Vervollständigt den aktuellen Vorschlag, falls vorhanden.                                                                                  |
| `Up Arrow`                                         | Navigiert nach oben im Eingabeverlauf.                                                                                              |
| `Ctrl+A` / `Home`                                  | Bewegt den Cursor an den Zeilenanfang.                                                                                       |
| `Ctrl+B` / `Left Arrow`                            | Bewegt den Cursor ein Zeichen nach links.                                                                                          |
| `Ctrl+C`                                           | Leert die Eingabeaufforderung.                                                                                                              |
| `Esc` (doppelt drücken)                               | Leert die Eingabeaufforderung.                                                                                                             |
| `Ctrl+D` / `Delete`                                | Löscht das Zeichen rechts vom Cursor.                                                                                    |
| `Ctrl+E` / `End`                                   | Bewegt den Cursor an das Zeilenende.                                                                                             |
| `Ctrl+F` / `Right Arrow`                           | Bewegt den Cursor ein Zeichen nach rechts.                                                                                         |
| `Ctrl+H` / `Backspace`                             | Löscht das Zeichen links vom Cursor.                                                                                     |
| `Ctrl+K`                                           | Löscht vom Cursor bis zum Zeilenende.                                                                                      |
| `Ctrl+Left Arrow` / `Meta+Left Arrow` / `Meta+B`   | Bewegt den Cursor ein Wort nach links.                                                                                               |
| `Ctrl+N`                                           | Navigiert nach unten im Eingabeverlauf.                                                                                            |
| `Ctrl+P`                                           | Navigiert nach oben im Eingabeverlauf.                                                                                              |
| `Ctrl+R`                                           | Rückwärtssuche im Eingabe-/Shell-Verlauf.                                                                                         |
| `Ctrl+Y`                                           | Wiederholt die letzte fehlgeschlagene Anfrage.                                                                                                      |
| `Ctrl+Right Arrow` / `Meta+Right Arrow` / `Meta+F` | Bewegt den Cursor ein Wort nach rechts.                                                                                              |
| `Ctrl+U`                                           | Löscht vom Cursor bis zum Zeilenanfang.                                                                                |
| `Ctrl+V` (Windows: `Alt+V`)                        | Fügt den Inhalt der Zwischenablage ein. Enthält die Zwischenablage ein Bild, wird dieses gespeichert und ein Verweis darauf in die Eingabe eingefügt. |
| `Ctrl+W` / `Meta+Backspace` / `Ctrl+Backspace`     | Löscht das Wort links vom Cursor.                                                                                          |
| `Ctrl+X` / `Meta+Enter`                            | Öffnet die aktuelle Eingabe in einem externen Editor.                                                                                       |

## Vorschläge

| Shortcut        | Beschreibung                            |
| --------------- | -------------------------------------- |
| `Down Arrow`    | Navigiert nach unten durch die Vorschläge. |
| `Tab` / `Enter` | Übernimmt den ausgewählten Vorschlag.        |
| `Up Arrow`      | Navigiert nach oben durch die Vorschläge.   |

## Radio-Button-Auswahl

| Shortcut           | Beschreibung                                                                                                   |
| ------------------ | ------------------------------------------------------------------------------------------------------------- |
| `Down Arrow` / `j` | Verschiebt die Auswahl nach unten.                                                                                          |
| `Enter`            | Bestätigt die Auswahl.                                                                                            |
| `Up Arrow` / `k`   | Verschiebt die Auswahl nach oben.                                                                                            |
| `1-9`              | Wählt ein Element über seine Nummer aus.                                                                                 |
| `(mehrstellig)`      | Für Elemente mit Nummern größer als 9: Drücke die Ziffern schnell hintereinander, um das entsprechende Element auszuwählen. |

## IDE-Integration

| Shortcut | Beschreibung                       |
| -------- | --------------------------------- |
| `Ctrl+G` | Zeigt den Kontext an, den das CLI von der IDE erhalten hat. |