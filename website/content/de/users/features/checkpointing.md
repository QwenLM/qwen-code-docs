# Checkpointing

Qwen Code bietet eine Checkpointing-Funktion, die automatisch einen Momentaufnahmezustand Ihres Projekts speichert, bevor von KI-gestützten Tools Dateiänderungen vorgenommen werden. Dadurch können Sie sicher mit Codeänderungen experimentieren und diese anwenden – denn Sie können jederzeit sofort zum Zustand vor Ausführung des Tools zurückkehren.

## So funktioniert es

Wenn Sie ein Tool genehmigen, das das Dateisystem verändert (z. B. `write_file` oder `edit`), erstellt die CLI automatisch einen „Wiederherstellungspunkt“. Dieser Wiederherstellungspunkt umfasst:

1.  **Eine Git-Sicherungskopie:** Ein Commit wird in einem speziellen, versteckten Git-Repository im Verzeichnis Ihres Home-Ordners (`~/.qwen/history/<project_hash>`) erstellt. Diese Sicherungskopie enthält den vollständigen Zustand aller Projektdateien zu diesem Zeitpunkt. Sie greift **nicht** in Ihr eigenes Git-Repository des Projekts ein.
2.  **Verlauf der Unterhaltung:** Der gesamte bisherige Dialog mit dem Agenten wird gespeichert.
3.  **Der Tool-Aufruf:** Der konkrete Tool-Aufruf, der gerade ausgeführt werden sollte, wird ebenfalls gespeichert.

Falls Sie die Änderung rückgängig machen oder einfach zurückkehren möchten, können Sie den Befehl `/restore` verwenden. Durch die Wiederherstellung eines Wiederherstellungspunkts wird Folgendes erreicht:

- Alle Dateien Ihres Projekts werden auf den Zustand zurückgesetzt, der in der Sicherungskopie festgehalten wurde.
- Der Verlauf der Unterhaltung wird in der CLI wiederhergestellt.
- Der ursprüngliche Tool-Aufruf wird erneut vorgeschlagen, sodass Sie ihn erneut ausführen, anpassen oder einfach ignorieren können.

Alle Daten zu Wiederherstellungspunkten – einschließlich der Git-Sicherungskopie und des Unterhaltungsverlaufs – werden lokal auf Ihrem Rechner gespeichert. Die Git-Sicherungskopie befindet sich im versteckten Repository, während der Unterhaltungsverlauf und die Tool-Aufrufe in einer JSON-Datei im temporären Verzeichnis Ihres Projekts gespeichert werden, typischerweise unter `~/.qwen/tmp/<project_hash>/checkpoints`.

## Aktivieren der Funktion

Die Funktion „Checkpointing“ ist standardmäßig deaktiviert. Um sie zu aktivieren, können Sie entweder ein Befehlszeilenflag verwenden oder Ihre Datei `settings.json` bearbeiten.

### Verwenden des Befehlszeilenflags

Sie können das Checkpointing für die aktuelle Sitzung aktivieren, indem Sie beim Starten von Qwen Code das Flag `--checkpointing` verwenden:

```bash
qwen --checkpointing
```

### Verwenden der Datei `settings.json`

Um das Checkpointing standardmäßig für alle Sitzungen zu aktivieren, müssen Sie Ihre Datei `settings.json` bearbeiten.

Fügen Sie den folgenden Eintrag zu Ihrer `settings.json` hinzu:

```json
{
  "general": {
    "checkpointing": {
      "enabled": true
    }
  }
}
```

## Verwenden des Befehls `/restore`

Sobald die Funktion aktiviert ist, werden automatisch Checkpoints erstellt. Um diese zu verwalten, verwenden Sie den Befehl `/restore`.

### Verfügbare Checkpoints auflisten

Um eine Liste aller gespeicherten Checkpoints für das aktuelle Projekt anzuzeigen, führen Sie einfach Folgendes aus:

```
/restore
```

Die CLI zeigt eine Liste der verfügbaren Checkpoint-Dateien an. Diese Dateinamen bestehen in der Regel aus einem Zeitstempel, dem Namen der bearbeiteten Datei und dem Namen des gerade ausgeführten Tools (z. B. `2025-06-22T10-00-00_000Z-my-file.txt-write_file`).

### Einen bestimmten Checkpoint wiederherstellen

Um Ihr Projekt auf einen bestimmten Checkpoint zurückzusetzen, verwenden Sie die entsprechende Checkpoint-Datei aus der Liste:

```
/restore <checkpoint_datei>
```

Beispiel:

```
/restore 2025-06-22T10-00-00_000Z-my-file.txt-write_file
```

Nach Ausführung des Befehls werden Ihre Dateien und die Konversation sofort in den Zustand zurückversetzt, der zum Zeitpunkt der Erstellung des Checkpoints bestand. Die ursprüngliche Tool-Aufforderung erscheint erneut.