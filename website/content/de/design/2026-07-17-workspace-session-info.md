# Workspace `session-info` aggregate endpoint

## Problem

`GET /workspace/:id/sessions` ist Cursor-paginiert und liefert keine
Gesamtzahl zurück. `GET /daemon/status` stellt nur die Live-`sessionCount` im
Speicher bereit. Workspaces mit vielen persistierten Sessions (zum Beispiel
aus geplanten Tasks) können die lokale Store-Größe nicht erfahren, ohne jede
Session zu paginieren.

## Vorschlag

Hinzufügen:

```http
GET /workspace/:id/session-info
GET /workspaces/:workspace/session-info
```

Antwort (illustrativ):

```json
{
  "active": 450,
  "archived": 30,
  "total": 480,
  "live": 2,
  "expensive": true,
  "cost": "disk_scan"
}
```

`live` wird für einen nicht vertrauenswürdigen sekundären Workspace
weggelassen, da diese Katalog-Lesevorgänge die Live-Bridge nicht abfragen
dürfen. Wenn der Scan sein Sicherheitslimit erreicht oder eine
Kandidaten-JSONL-Datei nicht klassifizieren kann, enthält die Antwort
`"truncated": true`; persistierte Zählungen sind dann untere Schranken.

## Kostenmodell

Persistierte Zählungen verwenden das bestehende Full-Directory-Scan-Muster
wieder, das bereits von der Session-Titel-Suche verwendet wird
(`SessionService.findSessionsByTitle` / `findSessionTitlesByPrefix`):

1. `readdir` auf dem Projekt-Chats-Verzeichnis (und dem Archiv-Zwilling)
2. UUID-`*.jsonl` filtern
3. auf dasselbe Dateiverarbeitungs-Sicherheitslimit begrenzen
4. nur den ersten JSONL-Datensatz auf Projekt-Hash-Zugehörigkeit lesen

Keine Titel-/Prompt-Hydration. Das ist O(n) auf der Festplatte und **darf
nicht gepollt werden**. Die Antwort setzt immer `expensive: true` und
`cost: "disk_scan"`, sodass Clients auf Hot-Paths fail-closed handeln können.
Die Dokumentation weist explizit darauf hin.

Die Standard-Listen-Paginierung bleibt unverändert und berechnet keine
Gesamtzahlen. `listAllPersistedSummaries` der organisierten Ansicht nicht für
Zählungen wiederverwenden — dieser Pfad hydriert vollständige
Listen-Metadaten für bis zu 50k Sessions.

## Capability

Always-on `session_info` auf `/capabilities`, neben `session_list`.

## Non-Goals

- Gecachte Zähler / Mutations-Hook-Buchführung (mögliches Follow-up, wenn
  Aufrufstellen niedrigere Latenz benötigen)
- `total` in jede Listenseite stopfen
- Organisierte Gruppen- oder parent-gefilterte Gesamtzahlen in v1
