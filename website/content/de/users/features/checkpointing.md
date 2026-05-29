---
description: "Lernen Sie Qwen Code Checkpointing kennen, um wichtige Zustände zu speichern und bei Refactorings, Experimenten oder langen KI-Sessions sicher zurückzukehren."
---

# Checkpointing

Qwen Code verfügt über eine Checkpointing-Funktion, die automatisch einen Snapshot des Projektzustands erstellt, bevor KI-gestützte Tools Dateien ändern. So kannst du Codeänderungen sicher testen und anwenden, da du jederzeit sofort zum Zustand vor der Tool-Ausführung zurückkehren kannst.

## Funktionsweise

Wenn du ein Tool genehmigst, das das Dateisystem ändert (z. B. `write_file` oder `edit`), erstellt die CLI automatisch einen „Checkpoint“. Dieser Checkpoint enthält:

1.  **Ein Git-Snapshot:** Es wird ein Commit in einem speziellen Shadow-Git-Repository in deinem Home-Verzeichnis (`~/.qwen/history/<project_hash>`) erstellt. Dieser Snapshot erfasst den vollständigen Zustand deiner Projektdateien zu diesem Zeitpunkt. Er beeinträchtigt **nicht** das Git-Repository deines eigenen Projekts.
2.  **Konversationsverlauf:** Der gesamte bisherige Verlauf deiner Konversation mit dem Agent wird gespeichert.
3.  **Der Tool-Aufruf:** Der spezifische Tool-Aufruf, der ausgeführt werden sollte, wird ebenfalls gespeichert.

Wenn du die Änderung rückgängig machen oder einfach einen Schritt zurückgehen möchtest, kannst du den Befehl `/restore` verwenden. Das Wiederherstellen eines Checkpoints führt Folgendes aus:

- Setzt alle Dateien in deinem Projekt auf den im Snapshot erfassten Zustand zurück.
- Stellt den Konversationsverlauf in der CLI wieder her.
- Schlägt den ursprünglichen Tool-Aufruf erneut vor, sodass du ihn erneut ausführen, anpassen oder einfach ignorieren kannst.

Alle Checkpoint-Daten, einschließlich des Git-Snapshots und des Konversationsverlaufs, werden lokal auf deinem Rechner gespeichert. Der Git-Snapshot wird im Shadow-Repository gespeichert, während der Konversationsverlauf und die Tool-Aufrufe in einer JSON-Datei im temporären Verzeichnis deines Projekts abgelegt werden, das sich typischerweise unter `~/.qwen/tmp/<project_hash>/checkpoints` befindet.

## Aktivieren der Funktion

Die Checkpointing-Funktion ist standardmäßig deaktiviert. Du kannst sie entweder über ein CLI-Flag aktivieren oder deine `settings.json`-Datei bearbeiten.

### Über das CLI-Flag

Du kannst Checkpointing für die aktuelle Sitzung aktivieren, indem du beim Start von Qwen Code das Flag `--checkpointing` verwendest:

```bash
qwen --checkpointing
```

### Über die `settings.json`-Datei

Um Checkpointing standardmäßig für alle Sitzungen zu aktivieren, musst du deine `settings.json`-Datei bearbeiten.

Füge deiner `settings.json` den folgenden Schlüssel hinzu:

```json
{
  "general": {
    "checkpointing": {
      "enabled": true
    }
  }
}
```

## Verwenden des `/restore`-Befehls

Sobald die Funktion aktiviert ist, werden Checkpoints automatisch erstellt. Zur Verwaltung verwendest du den Befehl `/restore`.

### Verfügbare Checkpoints auflisten

Um eine Liste aller gespeicherten Checkpoints für das aktuelle Projekt anzuzeigen, führe einfach Folgendes aus:

```
/restore
```

Die CLI zeigt eine Liste der verfügbaren Checkpoint-Dateien an. Diese Dateinamen setzen sich in der Regel aus einem Zeitstempel, dem Namen der geänderten Datei und dem Namen des auszuführenden Tools zusammen (z. B. `2025-06-22T10-00-00_000Z-my-file.txt-write_file`).

### Einen bestimmten Checkpoint wiederherstellen

Um dein Projekt auf einen bestimmten Checkpoint zurückzusetzen, verwende die entsprechende Checkpoint-Datei aus der Liste:

```
/restore <checkpoint_file>
```

Beispiel:

```
/restore 2025-06-22T10-00-00_000Z-my-file.txt-write_file
```

Nach der Ausführung des Befehls werden deine Dateien und die Konversation sofort auf den Zustand zum Zeitpunkt der Checkpoint-Erstellung zurückgesetzt, und der ursprüngliche Tool-Prompt wird erneut angezeigt.