# Simuliertes `sed -i` File-History-Tracking

## Summary

Unterstützt das verbleibende Issue #4204, Punkt B1, indem eine eng gefasste Klasse von `sed -i 's/pattern/replacement/flags' file` Shell-Befehlen als reguläre Dateiänderungen statt als undurchsichtige Shell-Ausführungen behandelt wird.

Der simulierte Pfad zeigt die exakte Textänderung in der normalen UI zur Bestätigung von Bearbeitungen als Vorschau an, protokolliert die Zieldatei mit `FileHistoryService.trackEdit()`, schreibt über `FileSystemService.writeTextFile()` und verhindert das Spawnen einer Shell. Dadurch kann `/rewind` Shell-basierte In-Place-Änderungen erfassen, die in Agent-Workflows häufig vorkommen.

## Scope

Nur einfache In-Place-Substitutionen werden simuliert:

- `sed -i 's/foo/bar/' file`
- `sed -i '' -E 's/foo|bar/baz/g' file`
- `sed -i -e 's/foo/bar/' file`

Befehle werden nicht simuliert, wenn sie zusammengesetzte Shell-Operatoren, Globs, mehrere Dateien, Command Substitutions, Shell-Variablenreferenzen im sed-Ausdruck, durch Variablen expandierte Dateipfade, Backup-Suffixe wie `-i.bak`, nicht unterstützte sed-Flags, nicht unterstützte sed-Ausdrücke oder Hintergrundausführungen enthalten. In diesen Fällen greift das bestehende Verhalten der Shell-Ausführung.

Die unterstützten Substitutions-Flags sind absichtlich auf `g` und numerische Vorkommen beschränkt. Flags, die stdout beeinflussen können oder ein plattformspezifisches sed-Verhalten aufweisen, wie `p`, `I` und `M`, fallen auf den Shell-Pfad zurück. Auch Shell-Wrapper mit Umgebungs-Präfixen fallen zurück, damit der Simulator Locale- oder Umgebungsänderungen nicht stillschweigend ignorieren kann.

## Behavior

Die Bestätigung liest die Zieldatei, wendet die geparste Substitution im Arbeitsspeicher an und gibt `ToolEditConfirmationDetails` mit einem regulären Datei-Diff zurück.

Die Ausführung liest die Datei vor dem Schreiben erneut ein. Weicht der Dateiinhalt von dem Inhalt ab, der für die Bestätigung verwendet wurde, bricht die Ausführung mit `FILE_CHANGED_SINCE_READ` ab, anstatt eine vom Benutzer nicht genehmigte Änderung zu schreiben.

Schlägt die Vorschau der Datei fehl, wird der Befehl über den bestehenden Shell-Pfad bestätigt und ausgeführt, anstatt simuliert zu werden.

Die Bestätigung blendet Modify-Aktionen externer Editoren aus, da ShellTool kein allgemeines Tool zur Bearbeitung von Dateien ist. Gibt eine IDE oder ein Host beim Genehmigen des Diffs ein Inline-`newContent`-Payload zurück, schreibt der simulierte sed-Pfad diesen genehmigten Inhalt unter Verwendung desselben Stale-Content-Guards.

Vor dem Schreiben ruft die Ausführung `FileHistoryService.trackEdit(filePath)` auf, damit der File-History-Snapshot des aktuellen Turns ein Pre-Edit-Backup erfasst. Der File-History-Aufruf erfolgt nach dem Best-Effort-Prinzip und blockiert die Bearbeitung niemals. Der Schreibvorgang selbst nutzt `FileSystemService.writeTextFile()` mit den Lese-Metadaten, sodass das Verhalten bezüglich Encoding, BOM und Zeilenenden mit den Edit- und WriteFile-Tools übereinstimmt.

## Compatibility

Es sind keine Änderungen am persistierten Schema erforderlich. Dies ist lediglich eine weitere Quelle für nachverfolgte Dateiänderungen innerhalb eines bestehenden Snapshots. Nicht unterstützte Shell-Befehle werden weiterhin über den bestehenden Shell-Pfad ausgeführt, wodurch sich die generische Shell-Semantik nicht ändert.

## Out of Scope

Das generische Tracking von Shell-Mutationen bleibt vorerst zurückgestellt. Befehle wie `perl -pi`, `python -c`, `awk`, `cat > file`, `mv`, beliebige Skripte und `sed`-Aufrufe für mehrere Dateien werden nicht simuliert. Sie erfordern eine umfassendere Analyse der Shell-Effekte, die von claude-code derzeit nicht unterstützt wird und außerhalb des Umfangs von B1 liegt.