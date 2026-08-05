# Serve-Großtext-Range-Konsistenz

## Kontext

Serve streamt jetzt Finite-Limit-Text-Fenster aus Dateien, die größer als
`MAX_READ_BYTES` sind. Eine Nur-Zeilen- oder Nur-maxBytes-Anfrage schaltet
diesen Pfad nicht frei. Die Workspace-Grenze öffnet die Datei einmal, liest
über dieses Handle und gibt partielle Metadaten ohne einen
Voll-Datei-Hash zurück.

Ein offener Dateideskriptor fixiert die Inode, friert aber nicht die Bytes
der Inode ein. Node synchronisiert auch keine Dateisystem-Operationen, die
dieselbe Datei parallel verändern. Ein Leser kann daher Bytes beobachten,
die nach `open` geschrieben wurden, einschließlich einer In-Place-
Umschreibung mit derselben Inode und Größe.

Issue #7946 verlangt, dass Dateien, die während eines Lesevorgangs geändert
oder ersetzt wurden, weiterhin abgelehnt werden. Append-tolerante
Lesevorgänge sind nicht Teil dieses Vertrags.

## Entscheidung

Große gestreamte Fenster verwenden den Open-Zeit-Stat der Datei als ihre
Snapshot-Baseline:

1. Der initiale `lstat` und der Open-Zeit-`fstat` müssen dieselbe reguläre
   Datei mit demselben Device, derselben Inode, Größe, Änderungszeit und
   Status-Änderungszeit identifizieren.
2. Nach dem Streaming müssen sowohl `fstat` als auch der Pfadname-`lstat`
   diese Identität und Version behalten, und der Pfadname darf kein Symlink
   sein.
3. Der Aufrufer schließt das Handle in `finally`, nach allen Lese- und
   Stabilitäts-Checks.
4. Ein Mismatch, den diese Stabilitäts-Checks erkennen, gibt
   `hash_mismatch` zurück.

Inhalt-Validierungsfehler werden erfasst, bis die Post-Read-Checks
abschließen, sodass eine parallele Mutation, die auch das Decoding
fehlschlagen lässt, weiterhin `hash_mismatch` zurückgibt. Ohne Mutation
bleibt Binärinhalt `binary_file` und großer Nicht-UTF-8-Text bleibt
`file_too_large` mit einem Konvertierungshinweis.

Dies entspricht der bestehenden Voll-Snapshot-Stabilitäts-Policy. Es lehnt
bewusst parallele Appends ab: Größenwachstum beweist, dass der
Open-Zeit-Snapshot nicht stabil war, während die Inode-Identität allein
nicht beweisen kann, dass der ursprüngliche Präfix unverändert war.

Zuverlässige Append-Toleranz würde einen separaten Snapshot-Mechanismus
oder einen zweiten begrenzten Lesevorgang erfordern, der jedes Byte
verifiziert, das verwendet wurde, um das angefragte Zeilenfenster zu
lokalisieren und zu erzeugen. Dieses zusätzliche I/O und diese
Protokoll-Policy liegen außerhalb dieses Bugfixes.

## Range-Reader-Cleanup

Ein Aufrufer-eigenes Datei-Handle wählt immer den Streaming-Pfad. Der
separate `forceStreaming`-Schalter und der Handle-Pufferungs-Fast-Path
werden daher entfernt. Der Handle-Chunk-Reader begrenzt positionale
Lesevorgänge auf die vom Aufrufer erfasste Dateigröße, sodass ein
Lesevorgang den Open-Zeit-EOF nicht überschreiten kann, und nutzt einen
einzigen 512-KiB-Puffer erneut, da jeder Chunk synchron decodiert wird,
bevor der Generator weiterzieht.

Es gibt kein festes Scan-Byte-Budget: Zeilen-Offsets erfordern ein Scannen
ab Byte null, sodass tiefe Fenster O(Dateigröße) bleiben. Das finite
Zeilen-Limit und die `MAX_READ_BYTES`-Obergrenze begrenzen zurückgegebenen
Inhalt und Speicher, während Cancellation zwischen Lesevorgängen geprüft
wird. Eine zukünftige Scan-Kosten-Policy benötigt einen Cursor oder einen
gleichwertigen Fortsetzungsvertrag, statt gültige tiefe Offsets
stillschweigend unerreichbar zu machen.

Die Voll-Snapshot-Lesevorgänge von Serve leiten `lineEnding` aus der
gesamten decodierten Datei ab. Die Großdatei-Fenster-Pfade leiten es
weiterhin aus dem zurückgegebenen Fenster ab, mit der Ausnahme, dass eine
Byte-Cursor-Seite auch einen Terminator außerhalb ihres zurückgegebenen
Slice zählt — den, nach dem sie fortsetzt, und, wenn ihre erste Zeile vom
Byte-Budget abgeschnitten wird, den, den der Re-Snap überschreitet —, sodass
eine nicht terminierte Tail-Seite mit der Seite davor übereinstimmt und eine
Byte-trunkierte Seite mit der Seite danach, in einer Datei mit einheitlichen
Zeilenenden (Dateien mit gemischten Enden können weiterhin zwischen Seiten
umschlagen, und ein Großdatei-Zeilenfenster einer einheitlichen Datei kann
von einer Byte-Cursor-Seite derselben Bytes abweichen; die Vereinheitlichung
der Pfade ist ein Kandidaten-Folge-PR — es existiert noch kein
Tracking-Issue). Core kann weiterhin Datei-Level-Metadaten für seine anderen
Consumer melden.

Jedes Großdatei-Fenster behält `truncated: true`, selbst wenn der Scan
zufällig EOF erreicht. Diese Grenze nutzt das Flag, um ein Fenster ohne
Voll-Datei-Hash von einem vollständigen Snapshot zu unterscheiden, der
sicher als Ganz-Datei-Inhalt behandelt werden kann; es bedeutet nicht nur,
dass decodierte Zeichen ausgelassen wurden.

## Consumer

Alle Serve-Aufrufer lösen über die ausgewählte Workspace-Runtime auf, bevor
sie diese Grenze erreichen:

- `GET /file`
- ACP HTTP `_qwen/file/read`
- der injizierte ACP-`readTextFile`-Adapter

Fensterlose Lesevorgänge, die vom Workspace-Setup verwendet werden, behalten
die bestehende 256-KiB-Voll-Snapshot-Ablehnung.

## Verifikation

- Das Zeilenfenster einer Großdatei mit gemischten EOLs meldet den im
  zurückgegebenen Slice vorhandenen Endungsstil; eine Byte-Cursor-Seite darf
  auch einen Terminator außerhalb ihres zurückgegebenen Slice melden (siehe
  Entscheidung).
- Paralleler Append, Trunkierung, Pfadname-Ersetzung und Symlink-Ersetzung
  werden abgelehnt. Eine In-Place-Umschreibung mit derselben Größe wird
  abgelehnt, wenn immer die Änderung in einem späteren Zeitstempel-Quantum
  landet: Die Checks vergleichen Änderungszeit und Status-Änderungszeit,
  sodass eine Umschreibung, die auch die Änderungszeit wiederherstellt, nur
  durch das Vorrücken der Status-Änderungszeit gefangen wird, was
  Best-Effort auf der Grob-Uhr-Auflösung des Kernels ist und keine absolute
  Garantie, aber dennoch strikt stärker als der vorherige
  Größe-plus-Änderungszeit-Voll-Snapshot-Vergleich.
- Handle-gebundene Range-Lesevorgänge nutzen niemals den Voll-Puffer-
  Fast-Path und nutzen ihren Streaming-Puffer erneut.
- Ein tiefer Offset jenseits von 10 MiB gelingt mit einem finiten
  Zeilen-Limit.
- Kein-Limit-, Nur-Zeilen- und Nur-maxBytes-Anfragen bleiben hinter dem
  256-KiB-Voll-Snapshot-Gate.
- Bestehende Ausgabe-, Encoding-, Binär-, Hash- und Zeilenanzahl-Limits
  bleiben unverändert.
