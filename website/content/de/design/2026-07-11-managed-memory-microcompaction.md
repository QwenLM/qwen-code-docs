# Managed Memory Microcompaction Preservation

## Problem

Topic-Dateien des Managed Memory werden lazy per `read_file` geladen. Die Microcompaction behandelt diese Ergebnisse aktuell wie gewöhnlichen Tool-Output und ersetzt ältere Inhalte durch `[Old tool result content cleared]`. Der Memory-Index bleibt verfügbar, und kürzliche erfolgte Fixes sorgen dafür, dass ein späteres `read_file` wieder echte Bytes zurückgibt, aber es ist nicht garantiert, dass das aktive Modell bemerkt, dass es das Memory neu laden muss.

Issue #6487 meldet außerdem einen veralteten Index nach `/remember`; diesen Teil übernimmt bereits PR #6497. Dieses Design behandelt nur Managed-Memory-Inhalte, die von der Microcompaction entfernt werden.

## Gewähltes Design

Es wird ein schmaler `MicrocompactOptions`-Callback hinzugefügt, der `read_file`-Pfade identifiziert, deren erfolgreiche Ergebnisse erhalten bleiben müssen. Bevor Pläne für idle-, erzwungenes oder größenbasiertes Leeren erstellt werden, korreliert die Microcompaction jede Antwort mit dem request-seitigen `file_path` und entfernt geschützte Ergebnisse aus der kompakierbaren Menge. Andere Tools, gewöhnliche Dateilesevorgänge, Fehler und Antworten, deren Pfad nicht aufgelöst werden kann, behalten das aktuelle Verhalten.

Jeder Produktions-Einstiegspunkt der Microcompaction liefert dasselbe Prädikat:

- Pre-Send-Idle- und größenbasierte Compaction
- `/compress-fast`
- History-Compaction bei Memory-Druck

Das Prädikat erkennt die Managed-Memory-Roots von Projekt, Benutzer und Team mittels realpath-fähiger Containment-Prüfung. Symlinks, die aus einem Managed-Root herausführen, werden nicht geschützt.

## Warum diese Ebene

Jeden geladenen Memory-Body in die System-Instruction zu injizieren, würde dazu führen, dass Memory dauerhaft Kontext verbraucht, und würde das bestehende Design aus Index plus Lazy-Read ersetzen. Jede Memory-Datei nach einer vollständigen Compaction wieder anzuhängen, erfordert ein separates Token-Budget und eine Wiederherstellungspolitik. Nur Managed-Memory-Lesevorgänge vor der Microcompaction zu schützen, behebt das reproduzierte Löschverhalten direkt mit einer begrenzten Änderung und belässt die vollständige Compaction als bestehende harte Kontextreduktionsgrenze.

Die vollständige Compaction ist daher bewusst nicht Byte-erhaltend. Ihre Zusammenfassung sieht den Pre-Compaction-Memory-Inhalt, die `MEMORY.md`-Indizes bleiben in der System-Instruction, und der Dateilese-Cache wird geleert, damit das Modell die exakten Bytes neu laden kann. Diese Änderung garantiert den Erhalt nur über die Microcompaction hinweg.

## Risiko und Tests

Wiederholte Lesevorgänge von Managed-Memory-Dateien können mehrere Kopien bis zur vollständigen Compaction behalten. Das ist ein bewusster Kompromiss: Dauerhafte Anleitung ist wichtiger als das Zurückgewinnen dieser Tool-Result-Tokens, während die vollständige Compaction weiterhin als hartes Limit zur Verfügung steht.

Die Tests decken ab: Projekt-, Benutzer- und Team-Roots; gewöhnliche Lesevorgänge; Symlink-Escapes; idle-, erzwungene und größenbasierte Pfade; gemischte geschützte und kompakierbare Ergebnisse; mehrdeutige oder fehlende Antwort-Ids; und Eviction-Metadaten.
