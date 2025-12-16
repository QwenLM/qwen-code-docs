# Qwen Code Tastaturkürzel

Dieses Dokument listet die verfügbaren Tastaturkürzel in Qwen Code auf.

## Allgemein

| Tastenkürzel | Beschreibung                                                                                                      |
| ------------ | ----------------------------------------------------------------------------------------------------------------- |
| `Esc`        | Schließt Dialoge und Vorschläge.                                                                                  |
| `Strg+C`     | Bricht die laufende Anfrage ab und leert die Eingabe. Zweimal drücken, um die Anwendung zu beenden.                 |
| `Strg+D`     | Beendet die Anwendung, wenn die Eingabe leer ist. Zweimal drücken zur Bestätigung.                                 |
| `Strg+L`     | Löscht den Bildschirm.                                                                                            |
| `Strg+O`     | Schaltet die Anzeige der Debug-Konsole ein oder aus.                                                              |
| `Strg+S`     | Ermöglicht die vollständige Ausgabe langer Antworten durch Deaktivierung der Kürzung. Verwenden Sie den Scrollback Ihres Terminals, um die gesamte Ausgabe anzuzeigen. |
| `Strg+T`     | Schaltet die Anzeige der Tool-Beschreibungen ein oder aus.                                                        |
| `Umschalt+Tab` | Wechselt zwischen den Genehmigungsmodi (`plan` → `default` → `auto-edit` → `yolo`).                             |

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
| `Strg+B` / `Pfeil nach links`                      | Cursor ein Zeichen nach links bewegen.                                                                                              |
| `Strg+C`                                           | Eingabeaufforderung leeren                                                                                                          |
| `Esc` (doppeltes Drücken)                          | Eingabeaufforderung leeren.                                                                                                         |
| `Strg+D` / `Entf`                                  | Zeichen rechts vom Cursor löschen.                                                                                                  |
| `Strg+E` / `Ende`                                  | Cursor ans Ende der Zeile bewegen.                                                                                                  |
| `Strg+F` / `Pfeil nach rechts`                     | Cursor ein Zeichen nach rechts bewegen.                                                                                             |
| `Strg+H` / `Rücktaste`                             | Zeichen links vom Cursor löschen.                                                                                                   |
| `Strg+K`                                           | Von der Cursorposition bis zum Zeilenende löschen.                                                                                  |
| `Strg+Pfeil nach links` / `Meta+Pfeil nach links` / `Meta+B` | Cursor ein Wort nach links bewegen.                                                                                     |
| `Strg+N`                                           | Durch den Eingabeverlauf nach unten navigieren.                                                                                     |
| `Strg+P`                                           | Durch den Eingabeverlauf nach oben navigieren.                                                                                      |
| `Strg+Pfeil nach rechts` / `Meta+Pfeil nach rechts` / `Meta+F` | Cursor ein Wort nach rechts bewegen.                                                                                    |
| `Strg+U`                                           | Von der Cursorposition bis zum Zeilenanfang löschen.                                                                                |
| `Strg+V`                                           | Inhalt der Zwischenablage einfügen. Wenn die Zwischenablage ein Bild enthält, wird dieses gespeichert und ein Verweis darauf in die Eingabe eingefügt. |
| `Strg+W` / `Meta+Rücktaste` / `Strg+Rücktaste`     | Wort links vom Cursor löschen.                                                                                                      |
| `Strg+X` / `Meta+Enter`                            | Aktuelle Eingabe in einem externen Editor öffnen.                                                                                   |

## Vorschläge

| Tastenkürzel    | Beschreibung                              |
| --------------- | ----------------------------------------- |
| `Pfeil nach unten` | Durch die Vorschläge nach unten navigieren. |
| `Tab` / `Enter`   | Den ausgewählten Vorschlag übernehmen.      |
| `Pfeil nach oben`  | Durch die Vorschläge nach oben navigieren.  |

## Radio Button Auswahl

| Tastenkürzel        | Beschreibung                                                                                                      |
| ------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `Pfeil unten` / `j` | Auswahl nach unten verschieben.                                                                                   |
| `Enter`             | Auswahl bestätigen.                                                                                               |
| `Pfeil oben` / `k`  | Auswahl nach oben verschieben.                                                                                    |
| `1-9`               | Ein Element anhand seiner Nummer auswählen.                                                                       |
| (mehrstellig)       | Für Elemente mit Nummern größer als 9 die Ziffern nacheinander schnell drücken, um das entsprechende Element auszuwählen. |

## IDE-Integration

| Tastenkürzel | Beschreibung                          |
| ------------ | ------------------------------------- |
| `Strg+G`     | Kontext-CLI anzeigen, die von der IDE empfangen wurde |