# Qwen Code Tastaturkürzel

Dieses Dokument listet die verfügbaren Tastaturkürzel in Qwen Code auf.

## Allgemein

| Tastenkürzel | Beschreibung                                                                                                          |
| ------------ | --------------------------------------------------------------------------------------------------------------------- |
| `Esc`        | Schließt Dialoge und Vorschläge.                                                                                      |
| `Ctrl+C`     | Bricht die laufende Anfrage ab und leert die Eingabe. Zweimal drücken, um die Anwendung zu beenden.                   |
| `Ctrl+D`     | Beendet die Anwendung, wenn die Eingabe leer ist. Zweimal drücken zur Bestätigung.                                    |
| `Ctrl+L`     | Löscht den Bildschirm.                                                                                                |
| `Ctrl+O`     | Schaltet die Anzeige der Debug-Konsole ein/aus.                                                                       |
| `Ctrl+S`     | Ermöglicht die vollständige Ausgabe langer Antworten durch Deaktivierung der Kürzung. Verwende den Scrollback deines Terminals, um die gesamte Ausgabe zu sehen. |
| `Ctrl+T`     | Schaltet die Anzeige der Tool-Beschreibungen ein/aus.                                                                 |
| `Shift+Tab`  | Wechselt zwischen den Genehmigungsmodi (`plan` → `default` → `auto-edit` → `yolo`).                                   |

## Eingabeaufforderung

| Tastenkürzel                                       | Beschreibung                                                                                                                        |
| -------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `!`                                                | Shell-Modus umschalten, wenn die Eingabe leer ist.                                                                                  |
| `\` (am Zeilenende) + `Enter`                      | Neue Zeile einfügen.                                                                                                                |
| `Pfeil nach unten`                                 | Durch den Eingabeverlauf nach unten navigieren.                                                                                     |
| `Enter`                                            | Aktuelle Eingabe absenden.                                                                                                          |
| `Meta+Entf` / `Strg+Entf`                          | Wort rechts vom Cursor löschen.                                                                                                     |
| `Tab`                                              | Aktuellen Vorschlag vervollständigen, falls vorhanden.                                                                              |
| `Pfeil nach oben`                                  | Durch den Eingabeverlauf nach oben navigieren.                                                                                      |
| `Strg+A` / `Pos1`                                  | Cursor an den Anfang der Zeile bewegen.                                                                                             |
| `Strg+B` / `Pfeil links`                           | Cursor ein Zeichen nach links bewegen.                                                                                              |
| `Strg+C`                                           | Eingabeaufforderung leeren                                                                                                          |
| `Esc` (doppeltes Drücken)                          | Eingabeaufforderung leeren.                                                                                                         |
| `Strg+D` / `Entf`                                  | Zeichen rechts vom Cursor löschen.                                                                                                  |
| `Strg+E` / `Ende`                                  | Cursor ans Ende der Zeile bewegen.                                                                                                  |
| `Strg+F` / `Pfeil rechts`                          | Cursor ein Zeichen nach rechts bewegen.                                                                                             |
| `Strg+H` / `Rücktaste`                             | Zeichen links vom Cursor löschen.                                                                                                   |
| `Strg+K`                                           | Von der Cursorposition bis zum Ende der Zeile löschen.                                                                              |
| `Strg+Pfeil links` / `Meta+Pfeil links` / `Meta+B` | Cursor ein Wort nach links bewegen.                                                                                                 |
| `Strg+N`                                           | Durch den Eingabeverlauf nach unten navigieren.                                                                                     |
| `Strg+P`                                           | Durch den Eingabeverlauf nach oben navigieren.                                                                                      |
| `Strg+Pfeil rechts` / `Meta+Pfeil rechts` / `Meta+F` | Cursor ein Wort nach rechts bewegen.                                                                                                |
| `Strg+U`                                           | Von der Cursorposition bis zum Anfang der Zeile löschen.                                                                            |
| `Strg+V`                                           | Inhalt aus der Zwischenablage einfügen. Wenn die Zwischenablage ein Bild enthält, wird dieses gespeichert und ein Verweis darauf in die Eingabe eingefügt. |
| `Strg+W` / `Meta+Rücktaste` / `Strg+Rücktaste`     | Wort links vom Cursor löschen.                                                                                                      |
| `Strg+X` / `Meta+Enter`                            | Aktuelle Eingabe in einem externen Editor öffnen.                                                                                   |

## Vorschläge

| Shortcut        | Beschreibung                              |
| --------------- | ----------------------------------------- |
| `Down Arrow`    | Nach unten durch die Vorschläge navigieren. |
| `Tab` / `Enter` | Den ausgewählten Vorschlag akzeptieren.     |
| `Up Arrow`      | Nach oben durch die Vorschläge navigieren.  |

## Radio Button Select

| Shortcut           | Description                                                                                                   |
| ------------------ | ------------------------------------------------------------------------------------------------------------- |
| `Down Arrow` / `j` | Auswahl nach unten bewegen.                                                                                   |
| `Enter`            | Auswahl bestätigen.                                                                                           |
| `Up Arrow` / `k`   | Auswahl nach oben bewegen.                                                                                    |
| `1-9`              | Eintrag über seine Nummer auswählen.                                                                          |
| (mehrziffrig)      | Für Einträge mit Nummern größer 9 die Ziffernfolge schnell hintereinander drücken, um den entsprechenden Eintrag auszuwählen. |

## IDE-Integration

| Shortcut | Beschreibung                           |
| -------- | -------------------------------------- |
| `Ctrl+G` | Kontext-CLI anzeigen, die von der IDE empfangen wurde |