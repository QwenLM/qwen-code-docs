# Checkpointing

Qwen Code bietet ein Checkpointing-Feature, das automatisch einen Snapshot des Projektzustands speichert, bevor Dateiänderungen durch KI-gestützte Tools vorgenommen werden. Dadurch kannst du Änderungen am Code sicher ausprobieren und anwenden, da du jederzeit zum Zustand vor dem Tool-Start zurückkehren kannst.

## Wie es funktioniert

Wenn du ein Tool freigibst, das das Dateisystem verändert (wie `write_file` oder `edit`), erstellt die CLI automatisch einen "Checkpoint". Dieser Checkpoint enthält:

1.  **Ein Git-Snapshot:** Ein Commit wird in einem speziellen, versteckten Git-Repository in deinem Home-Verzeichnis erstellt (`~/.qwen/history/<project_hash>`). Dieser Snapshot erfasst den vollständigen Zustand deiner Projektdateien zu diesem Zeitpunkt. Er greift **nicht** in das Git-Repository deines eigenen Projekts ein.
2.  **Konversationsverlauf:** Die gesamte Konversation, die du bis zu diesem Punkt mit dem Agenten geführt hast, wird gespeichert.
3.  **Der Tool-Aufruf:** Der spezifische Tool-Aufruf, der ausgeführt werden sollte, wird ebenfalls gespeichert.

Falls du die Änderung rückgängig machen oder einfach zurückgehen möchtest, kannst du den Befehl `/restore` verwenden. Beim Wiederherstellen eines Checkpoints wird Folgendes durchgeführt:

- Alle Dateien in deinem Projekt werden auf den Zustand des Snapshots zurückgesetzt.
- Der Konversationsverlauf in der CLI wird wiederhergestellt.
- Der ursprüngliche Tool-Aufruf wird erneut vorgeschlagen, sodass du ihn erneut ausführen, anpassen oder einfach ignorieren kannst.

Alle Checkpoint-Daten, einschließlich des Git-Snapshots und des Konversationsverlaufs, werden lokal auf deinem Rechner gespeichert. Der Git-Snapshot wird im Shadow-Repository gespeichert, während der Konversationsverlauf und die Tool-Aufrufe in einer JSON-Datei im temporären Verzeichnis deines Projekts gespeichert werden, normalerweise unter `~/.qwen/tmp/<project_hash>/checkpoints`.

## Aktivieren der Funktion

Die Checkpointing-Funktion ist standardmäßig deaktiviert. Um sie zu aktivieren, kannst du entweder ein Command-Line Flag verwenden oder deine `settings.json` Datei bearbeiten.

### Verwendung des Command-Line Flags

Du kannst Checkpointing für die aktuelle Sitzung aktivieren, indem du das `--checkpointing` Flag beim Starten von Qwen Code verwendest:

```bash
qwen --checkpointing
```

### Verwendung der `settings.json` Datei

Um Checkpointing standardmäßig für alle Sitzungen zu aktivieren, musst du deine `settings.json` Datei bearbeiten.

Füge den folgenden Schlüssel zu deiner `settings.json` hinzu:

```json
{
  "checkpointing": {
    "enabled": true
  }
}
```

## Verwendung des `/restore` Befehls

Sobald aktiviert, werden Checkpoints automatisch erstellt. Um sie zu verwalten, verwendest du den `/restore` Befehl.

### Verfügbare Checkpoints auflisten

Um eine Liste aller gespeicherten Checkpoints für das aktuelle Projekt anzuzeigen, führe einfach folgenden Befehl aus:

```
/restore
```

Die CLI zeigt dann eine Liste der verfügbaren Checkpoint-Dateien an. Diese Dateinamen setzen sich in der Regel aus einem Zeitstempel, dem Namen der geänderten Datei und dem Namen des Tools zusammen, das ausgeführt werden sollte (z. B. `2025-06-22T10-00-00_000Z-my-file.txt-write_file`).

### Einen bestimmten Checkpoint wiederherstellen

Um dein Projekt auf einen bestimmten Checkpoint zurückzusetzen, verwende die entsprechende Checkpoint-Datei aus der Liste:

```
/restore <checkpoint_file>
```

Beispiel:

```
/restore 2025-06-22T10-00-00_000Z-my-file.txt-write_file
```

Nach Ausführung des Befehls werden deine Dateien und der Konversationsverlauf sofort auf den Zustand zum Zeitpunkt der Checkpoint-Erstellung zurückgesetzt, und die ursprüngliche Tool-Eingabeaufforderung wird erneut angezeigt.