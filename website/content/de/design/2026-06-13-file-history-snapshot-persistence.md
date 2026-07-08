# Persistenz von File-History-Snapshots

## Zusammenfassung

Diese Änderung schließt die A+C-Persistenzlücken für die `/rewind`-File-History, ohne das persistierte JSONL-Schema zu ändern.

`file_history_snapshot`-Datensätze bleiben append-only Systemdatensätze. Resume rekonstruiert die File-History, indem es alle Snapshot-Datensätze in der linearen Historie liest und nach `promptId` mit Last-Wins-Semantik dedupliziert. Das bedeutet, dass ein aktualisierter Snapshot für denselben Prompt später angehängt werden kann, ohne alte Logs umzuschreiben.

## Aufzeichnung von Snapshot-Updates

`makeSnapshot(promptId)` erstellt weiterhin den Turn-Boundary-Snapshot und der Caller zeichnet ihn weiterhin explizit auf. Der fehlende Last-Turn-Fall wird behandelt, indem `FileHistoryService` ein optionaler Recorder-Callback übergeben wird. Wenn `trackEdit(filePath)` erfolgreich ein neues Backup zum neuesten Snapshot hinzufügt oder einen fehlgeschlagenen Backup-Eintrag in diesem Snapshot repariert, ruft es den Recorder mit dem aktualisierten Snapshot auf.

Doppelte `trackEdit`-Aufrufe für eine bereits erfasste, nicht fehlgeschlagene Datei zeichnen nicht erneut auf, da sich der Snapshot nicht geändert hat.

Recorder-Fehler werden unterdrückt und geloggt. Die Dateibearbeitung muss Best-Effort bleiben: Die Persistenz der File-History darf nicht dazu führen, dass Edit- oder Write-Tools fehlschlagen.

## Persistenz-Struktur

Es wird keine Schema-Version hinzugefügt. Der bestehende Payload hat bereits genug Struktur für eine abwärtskompatible Rekonstruktion:

```json
{
  "type": "system",
  "subtype": "file_history_snapshot",
  "systemPayload": {
    "snapshots": []
  }
}
```

Alte Logs ohne diese Datensätze setzen weiterhin ohne File-History-Status fort. Fehlerhafte Snapshot-Datensätze werden mit einer Warnung übersprungen, und gültige spätere Datensätze bleiben nutzbar.

Es wird kein explizites `isSnapshotUpdate`-Flag hinzugefügt. Das Anhängen eines weiteren `file_history_snapshot`-Datensatzes mit derselben `promptId` hat dasselbe praktische Verhalten, da `SessionService.loadSession()` bereits eine Last-Wins-Deduplizierung nach `promptId` anwendet.

## Umfang

Dies betrifft nur A+C.

Die Abdeckung für simuliertes `sed -i` in B1 wird für einen separaten PR offengelassen. Generisches Shell-Edit-Tracking, `getDiffStats`-Concurrency-Limitierung und Fehlerursachen pro Datei werden ebenfalls zurückgestellt. Claude Code unterstützt diese Verhaltensweisen heute nicht, daher sollte qwen-code sie nicht als Teil dieses Kompatibilitätsdurchlaufs hinzufügen.

Es ist keine Migration erforderlich, da die Struktur der persistierten Datensätze unverändert bleibt.