# Bounded Replay Snapshot Window

## Problem

Live-Daemon-Sessions halten die Replay-Historie derzeit im Speicher, damit `POST /session/:id/load` Replay für Clients injizieren kann, die sich anhängen, nachdem die Session bereits existiert. Diese Replay-Vorhaltung muss unabhängig vom SSE-Ring begrenzt werden: Restore im Response-Mode kann große historische Updates in einem Rutsch einbringen, und abgeschlossene Live-Turns können sich in langlebigen Sessions unbegrenzt ansammeln.

Die Session-Historie auf der Festplatte bleibt die maßgebliche Quelle für das vollständige Transkript. PR-1 begrenzt nur das Live-In-Memory-Replay-Fenster des Daemons; es führt keinen Endpoint für das vollständige Transkript ein.

## Ziele

- Die vorgehaltenen Replay-Events pro Live-Session nach serialisierten Bytes begrenzen, standardmäßig auf 4 MiB, und ungültige Konfiguration beim Boot zurückweisen.
- Die Grenze sowohl auf abgeschlossene Live-Turn-Replay-Segmente als auch auf wiederhergestellte historische Replays aus dem Response-Mode oder Stream-Mode anwenden.
- Das bestehende Wire-Format des Snapshots beibehalten: `compactedReplay`, `liveJournal` und `lastEventId`.
- Mindestens ein echtes Replay-Event oder ein abgeschlossenes Live-Turn-Segment behalten, auch wenn diese einzelne Einheit die Grenze überschreitet.
- Trunkierung mit einem id-losen `history_truncated`-Marker am Anfang von `compactedReplay` sichtbar machen.
- `history_truncated` nur als Status behandeln. Es darf weder `state_resync_required` noch Reload-Schleifen auslösen noch zurück in das Replay-Fenster persistiert werden.

## Nicht-Ziele

- ~~Keine Grenze für einen einzelnen in-flight Live-Turn in PR-1; `liveJournal` hält den aktiven Turn bis zu einer Grenze weiter.~~ Hinzugefügt durch DAEMON-009 (PR #7622): `liveJournal` wird jetzt durch `maxJournalEvents` (Standard 10 000) und `maxJournalBytes` (Standard 8 MiB) begrenzt, konfigurierbar über `--max-journal-events` / `--max-journal-bytes`.
- Keine Turn-Anzahl-Grenze. Turn-Anzahlen sind nur diagnostisch, wenn die Engine verworfene abgeschlossene Turn-Segmente exakt zählen kann.
- Kein `/capabilities`-Feature-Tag für dieses additive Event. Das aufgelöste Limit wird im Daemon-Status offengelegt.
- Kein Endpoint für das vollständige Transkript. PR-2 muss paginierte oder gestreamte Transkript-Lesezugriffe entwerfen und darf keine One-Shot-Antwort mit dem vollständigen Array offenlegen.

## Design

`TurnBoundaryCompactionEngine` speichert vorgehaltenes Replay als geordnete Segmente statt als unbegrenztes flaches Array. Ein abgeschlossener Live-Turn ist ein Segment. Restore-/Bulk-Seed-Replay wird als Event-Level-Segmente gespeichert, damit die ältesten Restore-Events unabhängig voneinander verworfen werden können, wenn die Byte-Grenze überschritten wird.

Die Größenbestimmung übernimmt die Safe-JSON-Sizing-Semantik des EventBus. Ein Fehlschlagen der Größenbestimmung loggt Diagnostik und zählt das Event als null Bytes, damit Publish- und Seed-Pfade ihren Never-Throws-Vertrag einhalten.

Wenn `replayBytes > maxReplayBytes`, verwirft die Engine die ältesten Segmente, solange mehr als ein Segment übrig bleibt. Sie erhöht `truncatedEvents` und erhöht `truncatedTurns` nur für verworfene Live-Turn-Segmente. `snapshot()` flacht die vorgehaltenen Segmente ab und stellt voran:

```json
{
  "type": "history_truncated",
  "data": {
    "reason": "replay_window_exceeded",
    "truncatedEvents": 12,
    "retainedEvents": 8,
    "maxBytes": 4194304,
    "truncatedTurns": 3,
    "fullTranscriptAvailable": true
  }
}
```

Der Marker ist synthetisch und id-los. Er ist von der Byte-Buchhaltung und von der transienten Replay-Vorhaltung ausgeschlossen. `ingest()`, `seed(snapshot)` und `seedReplayEvents()` filtern ihn alle heraus, damit das Laden eines begrenzten Snapshots Marker nicht vervielfachen kann.

`EventBus.seedReplayEvents()` weist Restore-Replay-Events ids und Zeitstempel zu, ruft die dedizierte Seed-Methode der Compaction-Engine auf und leert den SSE-Ring wie bisher. Das verhindert, dass Bulk-Restore-Replay an `liveJournal` angehängt wird.

Die CLI-Verdrahtung reicht eine aufgelöste Grenze durch yargs, den Fast-Path-Parser, `ServeOptions`, die Server-Verdrahtung, `BridgeOptions`, den Bridge-Status und das Rendern des Daemon-Status weiter. Ungültige Werte (`0`, negativ, nicht ganzzahlig, `NaN`, `Infinity` oder Werte über 256 MiB) schlagen fail-closed fehl.

SDK und WebUI kennen `history_truncated`, validieren dessen Payload, projizieren ihn auf View-State-Zähler und Transkript-Status und rendern eine terminale Statuszeile. Das Event ist kein Unknown-/Debug-Event und kein Teil des Resync-Gatings.

## Audit-Anmerkungen

Runde 1: Eine Grenze nur für abgeschlossene Live-Turns reicht nicht aus, weil Restore im Response-Mode großes historisches Replay ohne Live-Grenzen einbringen kann. Das Design fügt daher `seedReplayEvents()` und Event-Level-historische Segmente hinzu.

Runde 2: `state_resync_required` für die Trunkierung wiederzuverwenden würde Reload-Schleifen erzeugen, weil `/load` weiterhin dasselbe begrenzte Fenster zurückgeben würde. Das Design verwendet einen separaten Status-Marker, der `awaitingResync` niemals setzt.

Runde 3: Eine Turn-Anzahl-Grenze begrenzt den Speicher nicht, wenn ein Turn große Tool-Ausgaben enthält. PR-1 erzwingt nur Bytes und lässt die Begrenzung des aktiven Turns außen vor.

Runde 4: Das vollständige Transkript als Array zurückzugeben würde dasselbe Peak-Speicher-Problem zum Anfragezeitpunkt neu erzeugen. PR-2 wird explizit auf Paginierung oder Streaming eingeschränkt.

Runde 5: Leeres Replay nach der Trunkierung würde dazu führen, dass Clients sämtlichen sichtbaren Zustand verlieren. Die Engine behält das neueste Segment auch dann, wenn es zu groß ist.

## Verifikationsplan

- Unit-Tests für Live-Turn-Trimming, Restore-Seed-Trimming, Marker-Platzierung, Filterung transienter Marker, Behalten des zu großen letzten Elements, Safe-Sizing-Fehler und das Never-Throws-Verhalten des EventBus.
- Unit-Tests für Restore im Response-Mode der Bridge und das Laden von Live-Sessions mit dem begrenzten Fenster.
- Unit-Tests für CLI-Parsing, Fast-Path-Parsing, runQwenServe-Validierung, Server-Bridge-Verdrahtung und Daemon-Status-Limits.
- Unit-Tests für Known-Event-Validierung im SDK, Reducer-Zustand, UI-Normalizer, Transkript-Status, Terminal-Rendering und Replay-Injection im WebUI.
- Die abschließende Verifikation bei `npm run build`, `npm run typecheck` und `npm run lint` beibehalten.
