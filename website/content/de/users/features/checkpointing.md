# Checkpointing

Qwen Code enthält eine Checkpointing-Funktion, die automatisch einen Snapshot des Projektzustands speichert, bevor Dateiänderungen durch KI-gestützte Tools vorgenommen werden. Dies ermöglicht es Ihnen, sicher mit Codeänderungen zu experimentieren und diese anzuwenden, da Sie jederzeit zum Zustand vor dem Ausführen des Tools zurückkehren können.

## Funktionsweise

Wenn du ein Tool genehmigst, das das Dateisystem ändert (wie `write_file` oder `edit`), erstellt die CLI automatisch einen „Checkpoint“. Dieser Checkpoint umfasst:

1.  **Ein Git-Snapshot:** Ein Commit wird in einem speziellen, versteckten Git-Repository in deinem Home-Verzeichnis erstellt (`~/.qwen/history/<project_hash>`). Dieser Snapshot erfasst den vollständigen Zustand deiner Projektdateien zu diesem Zeitpunkt. Er greift **nicht** in das eigene Git-Repository deines Projekts ein.
2.  **Konversationsverlauf:** Die gesamte Konversation, die du bis zu diesem Punkt mit dem Agenten geführt hast, wird gespeichert.
3.  **Der Tool-Aufruf:** Der spezifische Tool-Aufruf, der ausgeführt werden sollte, wird ebenfalls gespeichert.

Wenn du die Änderung rückgängig machen oder einfach zurückgehen möchtest, kannst du den Befehl `/restore` verwenden. Das Wiederherstellen eines Checkpoints bewirkt Folgendes:

- Alle Dateien im Projekt werden auf den Zustand des Snapshots zurückgesetzt.
- Der Konversationsverlauf in der CLI wird wiederhergestellt.
- Der ursprüngliche Tool-Aufruf wird erneut vorgeschlagen, sodass du ihn erneut ausführen, ändern oder einfach ignorieren kannst.

Alle Checkpoint-Daten, einschließlich des Git-Snapshots und des Konversationsverlaufs, werden lokal auf deinem Computer gespeichert. Der Git-Snapshot wird im Shadow-Repository gespeichert, während der Konversationsverlauf und die Tool-Aufrufe in einer JSON-Datei im temporären Verzeichnis deines Projekts gespeichert werden, üblicherweise unter `~/.qwen/tmp/<project_hash>/checkpoints`.

## Aktivieren der Funktion

Die Checkpointing-Funktion ist standardmäßig deaktiviert. Um sie zu aktivieren, kannst du entweder ein Befehlszeilen-Flag verwenden oder deine `settings.json`-Datei bearbeiten.

### Verwendung des Befehlszeilen-Flags

Du kannst das Checkpointing für die aktuelle Sitzung aktivieren, indem du das `--checkpointing`-Flag beim Starten von Qwen Code verwendest:

```bash
qwen --checkpointing
```

### Verwendung der `settings.json`-Datei

Um das Checkpointing standardmäßig für alle Sitzungen zu aktivieren, musst du deine `settings.json`-Datei bearbeiten.

Füge den folgenden Schlüssel zu deiner `settings.json` hinzu:

```json
{
  "general": {
    "checkpointing": {
      "enabled": true
    }
  }
}
```

## Verwendung des `/restore`-Befehls

Sobald die Funktion aktiviert ist, werden Checkpoints automatisch erstellt. Um sie zu verwalten, verwendest du den `/restore`-Befehl.

### Verfügbare Checkpoints auflisten

Um eine Liste aller gespeicherten Checkpoints für das aktuelle Projekt anzuzeigen, führe einfach Folgendes aus:

```
/restore
```

Die CLI zeigt eine Liste der verfügbaren Checkpoint-Dateien an. Diese Dateinamen setzen sich typischerweise aus einem Zeitstempel, dem Namen der geänderten Datei und dem Namen des Tools zusammen, das ausgeführt werden sollte (z. B. `2025-06-22T10-00-00_000Z-my-file.txt-write_file`).

### Einen bestimmten Checkpoint wiederherstellen

Um dein Projekt auf einen bestimmten Checkpoint zurückzusetzen, verwende die Checkpoint-Datei aus der Liste:

```
/restore <checkpoint_file>
```

Beispiel:

```
/restore 2025-06-22T10-00-00_000Z-my-file.txt-write_file
```

Nach Ausführung des Befehls werden deine Dateien und die Konversation sofort in den Zustand zurückversetzt, in dem sie sich zum Zeitpunkt der Erstellung des Checkpoints befanden, und die ursprüngliche Tool-Eingabeaufforderung wird erneut angezeigt.