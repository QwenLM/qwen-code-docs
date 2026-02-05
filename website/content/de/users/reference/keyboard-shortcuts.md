# Qwen Code Tastaturkürzel

Dieses Dokument listet die verfügbaren Tastaturkürzel in Qwen Code auf.

## Allgemein

| Tastenkürzel                   | Beschreibung                                                                                                          |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------- |
| `Esc`                          | Schließt Dialoge und Vorschläge.                                                                                      |
| `Strg+C`                       | Bricht die laufende Anfrage ab und leert die Eingabe. Zweimal drücken, um die Anwendung zu beenden.                  |
| `Strg+D`                       | Beendet die Anwendung, wenn die Eingabe leer ist. Zweimal drücken zum Bestätigen.                                     |
| `Strg+L`                       | Leert den Bildschirm.                                                                                                 |
| `Strg+O`                       | Schaltet die Anzeige der Debug-Konsole ein/aus.                                                                       |
| `Strg+S`                       | Erlaubt es, lange Antworten vollständig auszugeben, ohne sie abzuschneiden. Nutzen Sie den Bildlauf Ihres Terminals, um die gesamte Ausgabe anzusehen. |
| `Strg+T`                       | Schaltet die Anzeige von Werkzeugbeschreibungen ein/aus.                                                              |
| `Umschalt+Tab` (`Tab` unter Windows) | Wechselt zwischen Genehmigungsmodi (`plan` → `default` → `auto-edit` → `yolo`)                                      |

## Eingabeaufforderung

| Tastenkürzel                                        | Beschreibung                                                                                                                        |
| --------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `!`                                                 | Shell-Modus umschalten, wenn die Eingabe leer ist.                                                                                 |
| `?`                                                 | Anzeige der Tastenkürzel umschalten, wenn die Eingabe leer ist.                                                                     |
| `\` (am Zeilenende) + `Enter`                       | Neue Zeile einfügen.                                                                                                                |
| `Pfeil nach unten`                                  | Durch den Eingabeverlauf nach unten navigieren.                                                                                     |
| `Enter`                                             | Aktuelle Eingabeaufforderung absenden.                                                                                              |
| `Meta+Entf` / `Strg+Entf`                           | Das Wort rechts vom Cursor löschen.                                                                                                 |
| `Tab`                                               | Die aktuelle Vervollständigung übernehmen, falls eine vorhanden ist.                                                                |
| `Pfeil nach oben`                                   | Durch den Eingabeverlauf nach oben navigieren.                                                                                      |
| `Strg+A` / `Pos1`                                   | Den Cursor an den Anfang der Zeile bewegen.                                                                                         |
| `Strg+B` / `Pfeil nach links`                       | Den Cursor ein Zeichen nach links bewegen.                                                                                          |
| `Strg+C`                                            | Die Eingabeaufforderung leeren.                                                                                                     |
| `Esc` (doppelt drücken)                             | Die Eingabeaufforderung leeren.                                                                                                     |
| `Strg+D` / `Entf`                                   | Das Zeichen rechts vom Cursor löschen.                                                                                              |
| `Strg+E` / `Ende`                                   | Den Cursor ans Ende der Zeile bewegen.                                                                                              |
| `Strg+F` / `Pfeil nach rechts`                      | Den Cursor ein Zeichen nach rechts bewegen.                                                                                         |
| `Strg+H` / `Rücktaste`                              | Das Zeichen links vom Cursor löschen.                                                                                               |
| `Strg+K`                                            | Ab dem Cursor bis zum Ende der Zeile löschen.                                                                                       |
| `Strg+Pfeil nach links` / `Meta+Pfeil nach links` / `Meta+B` | Den Cursor ein Wort nach links bewegen.                                                                                           |
| `Strg+N`                                            | Durch den Eingabeverlauf nach unten navigieren.                                                                                     |
| `Strg+P`                                            | Durch den Eingabeverlauf nach oben navigieren.                                                                                      |
| `Strg+R`                                            | Rückwärts durch den Eingabe-/Shell-Verlauf suchen.                                                                                  |
| `Strg+Pfeil nach rechts` / `Meta+Pfeil nach rechts` / `Meta+F` | Den Cursor ein Wort nach rechts bewegen.                                                                                        |
| `Strg+U`                                            | Ab dem Cursor bis zum Anfang der Zeile löschen.                                                                                     |
| `Strg+V`                                            | Inhalt der Zwischenablage einfügen. Falls die Zwischenablage ein Bild enthält, wird es gespeichert und eine Referenz dazu in die Eingabe eingefügt. |
| `Strg+W` / `Meta+Rücktaste` / `Strg+Rücktaste`      | Das Wort links vom Cursor löschen.                                                                                                  |
| `Strg+X` / `Meta+Enter`                             | Die aktuelle Eingabe in einem externen Editor öffnen.                                                                               |

## Vorschläge

| Tastenkürzel    | Beschreibung                                |
| --------------- | ------------------------------------------- |
| `Pfeil abwärts` | Durch die Vorschläge nach unten navigieren. |
| `Tab` / `Enter` | Den ausgewählten Vorschlag akzeptieren.     |
| `Pfeil aufwärts`| Durch die Vorschläge nach oben navigieren.  |

## Radio-Button-Auswahl

| Tastenkürzel       | Beschreibung                                                                                                  |
| ------------------ | ------------------------------------------------------------------------------------------------------------- |
| `Pfeil abwärts` / `j` | Auswahl nach unten verschieben.                                                                               |
| `Eingabe`          | Auswahl bestätigen.                                                                                           |
| `Pfeil aufwärts` / `k` | Auswahl nach oben verschieben.                                                                                |
| `1-9`              | Ein Element anhand seiner Nummer auswählen.                                                                   |
| (mehrere Ziffern)  | Für Elemente mit Nummern größer als 9 drücken Sie die Ziffern nacheinander schnell, um das entsprechende Element auszuwählen. |

## IDE-Integration

| Tastenkürzel | Beschreibung                                |
| ------------ | ------------------------------------------- |
| `Strg+G`     | Kontext-CLI anzeigen, die von der IDE empfangen wurde |