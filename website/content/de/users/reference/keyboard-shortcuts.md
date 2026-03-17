# Tastaturkürzel für Qwen Code

In diesem Dokument sind die verfügbaren Tastaturkürzel in Qwen Code aufgelistet.

## Allgemein

| Tastenkombination               | Beschreibung                                                                                                          |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------- |
| `Esc`                          | Schließt Dialoge und Vorschläge.                                                                                      |
| `Strg+C`                       | Bricht die laufende Anfrage ab und löscht die Eingabe. Zweimal drücken, um die Anwendung zu beenden.                  |
| `Strg+D`                       | Beendet die Anwendung, wenn die Eingabe leer ist. Zweimal drücken, um die Aktion zu bestätigen.                       |
| `Strg+L`                       | Löscht den Bildschirm.                                                                                                |
| `Strg+O`                       | Schaltet die Anzeige der Debug-Konsole um.                                                                            |
| `Strg+S`                       | Erlaubt lange Antworten vollständig anzuzeigen, wodurch die Kürzung deaktiviert wird. Verwenden Sie den Scrollback Ihres Terminals, um die gesamte Ausgabe einzusehen. |
| `Strg+T`                       | Schaltet die Anzeige der Tool-Beschreibungen um.                                                                      |
| `Umschalt+Tab` (`Tab` unter Windows) | Wechselt zwischen den Genehmigungsmodi (`plan` → `default` → `auto-edit` → `yolo`)                                 |

## Eingabeaufforderung

| Tastenkombination                                           | Beschreibung                                                                                                                         |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `!`                                                         | Aktiviert den Shell-Modus, wenn die Eingabe leer ist.                                                                                 |
| `?`                                                         | Zeigt oder blendet die Liste der Tastenkombinationen aus, wenn die Eingabe leer ist.                                                 |
| `\` (am Zeilenende) + `Enter`                                | Fügt eine neue Zeile ein.                                                                                                            |
| `Pfeil-nach-unten`                                          | Blättert in der Eingabehistorie nach unten.                                                                                           |
| `Enter`                                                     | Sendet die aktuelle Eingabeaufforderung ab.                                                                                          |
| `Meta+Entf` / `Strg+Entf`                                   | Löscht das Wort rechts vom Cursor.                                                                                                   |
| `Tab`                                                       | Ergänzt automatisch den aktuellen Vorschlag, falls vorhanden.                                                                        |
| `Pfeil-nach-oben`                                           | Blättert in der Eingabehistorie nach oben.                                                                                            |
| `Strg+A` / `Pos1`                                           | Bewegt den Cursor an den Anfang der Zeile.                                                                                           |
| `Strg+B` / `Pfeil-links`                                    | Bewegt den Cursor um ein Zeichen nach links.                                                                                         |
| `Strg+C`                                                    | Leert die Eingabeaufforderung.                                                                                                       |
| `Esc` (zweimal drücken)                                     | Leert die Eingabeaufforderung.                                                                                                       |
| `Strg+D` / `Entf`                                           | Löscht das Zeichen rechts vom Cursor.                                                                                                |
| `Strg+E` / `Ende`                                           | Bewegt den Cursor ans Ende der Zeile.                                                                                                |
| `Strg+F` / `Pfeil-rechts`                                   | Bewegt den Cursor um ein Zeichen nach rechts.                                                                                        |
| `Strg+H` / `Rücktaste`                                      | Löscht das Zeichen links vom Cursor.                                                                                                 |
| `Strg+K`                                                    | Löscht vom Cursor bis zum Zeilenende.                                                                                                |
| `Strg+Pfeil-links` / `Meta+Pfeil-links` / `Meta+B`          | Bewegt den Cursor um ein Wort nach links.                                                                                            |
| `Strg+N`                                                    | Blättert in der Eingabehistorie nach unten.                                                                                          |
| `Strg+P`                                                    | Blättert in der Eingabehistorie nach oben.                                                                                            |
| `Strg+R`                                                    | Durchsucht die Eingabe-/Shell-Historie rückwärts.                                                                                     |
| `Strg+Y`                                                    | Wiederholt die letzte fehlgeschlagene Anfrage.                                                                                       |
| `Strg+Pfeil-rechts` / `Meta+Pfeil-rechts` / `Meta+F`         | Bewegt den Cursor um ein Wort nach rechts.                                                                                           |
| `Strg+U`                                                    | Löscht vom Cursor bis zum Zeilenanfang.                                                                                              |
| `Strg+V` (Windows: `Alt+V`)                                 | Fügt den Inhalt der Zwischenablage ein. Falls die Zwischenablage ein Bild enthält, wird dieses gespeichert und ein Verweis darauf in die Eingabeaufforderung eingefügt. |
| `Strg+W` / `Meta+Rücktaste` / `Strg+Rücktaste`              | Löscht das Wort links vom Cursor.                                                                                                    |
| `Strg+X` / `Meta+Enter`                                     | Öffnet die aktuelle Eingabe in einem externen Editor.                                                                                |

## Vorschläge

| Tastenkombination | Beschreibung                              |
| ----------------- | ----------------------------------------- |
| `Pfeil nach unten` | Navigieren Sie durch die Vorschläge nach unten. |
| `Tab` / `Eingabe`  | Übernehmen Sie den ausgewählten Vorschlag.        |
| `Pfeil nach oben`  | Navigieren Sie durch die Vorschläge nach oben.    |

## Auswahlfeld (Radio Button)

| Tastenkürzel       | Beschreibung                                                                                                  |
| ------------------ | ------------------------------------------------------------------------------------------------------------- |
| `Pfeil nach unten` / `j` | Auswahl nach unten verschieben.                                                                               |
| `Eingabe`          | Auswahl bestätigen.                                                                                           |
| `Pfeil nach oben` / `k`  | Auswahl nach oben verschieben.                                                                                 |
| `1–9`              | Ein Element anhand seiner Nummer auswählen.                                                                   |
| (mehrstellig)      | Für Elemente mit Nummern größer als 9 die Ziffern nacheinander schnell eingeben, um das entsprechende Element auszuwählen. |

## IDE-Integration

| Tastenkürzel | Beschreibung                              |
| ------------ | ----------------------------------------- |
| `Strg+G`     | Kontext anzeigen, den die CLI von der IDE erhalten hat |