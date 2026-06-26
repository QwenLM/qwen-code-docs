# Entwurf der Daemon-Leerlauferkennungsschnittstelle

## Hintergrund

### Problem

Der Qwen-Daemon wird auf mehreren Maschinen als langlebiger Dienst bereitgestellt. Wenn der Daemon über einen längeren Zeitraum keine Aufgaben ausführt, ist es eine Verschwendung, weiterhin Maschinenressourcen zu belegen. Ein externer Scheduler (K8s HPA / benutzerdefinierter Scaler) benötigt ein zuverlässiges Signal, um zu erkennen, ob sich der Daemon im Leerlauf befindet, damit eine Skalierung nach unten und Freigabe der Ressourcen vorgenommen werden kann.

### Aktuelle Situation

Derzeit verfügbare Schnittstellen:

| Schnittstelle                     | Rückgabeinformationen                           | Einschränkungen                                                                                          |
| --------------------------------- | ----------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `GET /health?deep=true`           | `{ sessions, pendingPermissions }`              | Enthält nur die Anzahl der Sessions, kann nicht zwischen "Session hat Leerlauf" und "Session arbeitet" unterscheiden |
| `GET /workspace/:cwd/sessions`    | `hasActivePrompt` + `clientCount` pro Session   | Erfordert eine zusätzliche Anfrage und liefert keine Zeitdimension (wie lange keine Aktivität?)          |

**Wesentliche Lücken**:

1. Keine aggregierte Metrik für "aktive Prompt-Ausführungen"
2. Keine "letzte Aktivitätszeit" – externe Systeme müssten selbst eine Zustandsmaschine verwalten, um die Leerlaufdauer zu berechnen
3. Keine Offenlegung der Anzahl der SSE-Verbindungen (wird intern bereits als `activeSseCount` geführt, aber nicht in `/health` zurückgegeben)
4. Keine Offenlegung des Aktivitätsstatus von Channels (Agent-Unterprozessen)

## Designziele

Bereitstellung einer Schnittstelle, die **mit einem einzigen HTTP-Aufruf** eine Leerlaufbewertung ermöglicht:

- Ein externer Scheduler kann mit einem GET-Aufruf entscheiden, ob der Daemon freigegeben werden kann
- Unterstützung der Zeitdimension (wie lange läuft der Leerlauf?), damit keine externe Zustandsverwaltung nötig ist
- Abwärtskompatibilität zum bestehenden `/health`-Verhalten
- Keine zusätzlichen Abhängigkeiten – Nutzung bereits vorhandener interner Zustände

## Lösung

### Erweiterte Antwort von `GET /health?deep=true`

In der bestehenden Antwort von `/health?deep=true` werden folgende Felder ergänzt:

```jsonc
// GET /health?deep=true
{
  "status": "ok",

  // --- Bestehende Felder (unverändert) ---
  "sessions": 2,
  "pendingPermissions": 0,

  // --- Neue Felder ---
  "activePrompts": 1,          // Anzahl der Sessions, die gerade einen Prompt ausführen
  "connectedClients": 3,       // Aktive SSE-Verbindungen
  "channelAlive": true,        // Agent-Unterprozess lebt
  "lastActivityAt": "2026-06-10T08:30:00.000Z", // Zeitstempel der letzten Aktivität (ISO 8601)
  "idleSinceMs": 120000,       // Millisekunden seit der letzten Aktivität
}
```

### Felddefinitionen

| Feld                | Typ              | Bedeutung                                                                             |
| ------------------- | ---------------- | ------------------------------------------------------------------------------------- |
| `activePrompts`     | `number`         | Anzahl der Sessions, bei denen `promptActive === true` gilt                           |
| `connectedClients`  | `number`         | Aktuelle Anzahl der aktiven SSE-Verbindungen (bereits vorhanden als `activeSseCount`) |
| `channelAlive`      | `boolean`        | Gibt an, ob der Agent-Unterprozess läuft (bereits vorhanden via `bridge.isChannelLive()`) |
| `lastActivityAt`    | `string \| null` | ISO-Zeitstempel des letzten Beginns oder Abschlusses eines Prompts; `null`, wenn seit Daemon-Start nie ein Prompt ausgeführt wurde |
| `idleSinceMs`       | `number \| null` | `Date.now() - lastActivityAt`; `null`, wenn keine Aktivität aufgezeichnet wurde       |

### Definition von „Aktivität“

Die folgenden Ereignisse gelten als „Aktivität“ und setzen `lastActivityAt` zurück:

- Prompt-Ausführung beginnt (`promptActive` wechselt von false → true)
- Prompt-Ausführung endet/schlägt fehl (`promptActive` wechselt von true → false)
- Neue Session wird erstellt (`spawnOrAttach` erfolgreich)
- Session wird wiederhergestellt/geladen (`loadSession` / `resumeSession` erfolgreich)

**Nicht** als Aktivität betrachtete Ereignisse (um Fehlinterpretationen zu vermeiden):

- SSE-Verbindungsaufbau/-abbau
- Heartbeats
- `/health`-Aufrufe selbst
- Permission-Anfragen/-Antworten

### Regeln zur Leerlauferkennung (zur Referenz für externe Scheduler)

```python
def should_reclaim(health, idle_threshold_ms=300_000):
    """Suggested reclaim condition: idle more than threshold (default 5 min)"""
    if health["activePrompts"] > 0:
        return False  # Tasks laufen
    if health["connectedClients"] > 0:
        return False  # Clients sind verbunden
    if health["idleSinceMs"] is None:
        # Nie Aktivität gehabt – möglicherweise ein frisch gestarteter Cold-Daemon
        return True
    return health["idleSinceMs"] >= idle_threshold_ms
```

## Betroffene Codeänderungen

### 1. `packages/acp-bridge/src/bridgeTypes.ts`

Im Interface `AcpSessionBridge` neu hinzufügen:

```typescript
/** Anzahl der Sessions, die gerade einen Prompt ausführen */
get activePromptCount(): number;

/** Zeitstempel der letzten Aktivität (epoch ms), null bedeutet nie Aktivität gehabt */
get lastActivityAt(): number | null;
```

### 2. `packages/acp-bridge/src/bridge.ts`

In der Factory-Funktion `createAcpSessionBridge`:

```typescript
// Neue Zustandsverfolgung
let lastActivityTimestamp: number | null = null;

function touchActivity(): void {
  lastActivityTimestamp = Date.now();
}
```

`touchActivity()` an folgenden Stellen aufrufen:

- `entry.promptActive = true` (~ Zeile 2528) – Prompt startet
- `entry.promptActive = false` (~ Zeile 2551, 2559) – Prompt endet
- Nach erfolgreichem `doSpawn` (Session erstellt) – etwa bei Zeile 1906
- Nach erfolgreichem `restoreSession`

Im zurückgegebenen Objekt bereitstellen:

```typescript
get activePromptCount() {
  let count = 0;
  for (const entry of byId.values()) {
    if (entry.promptActive) count++;
  }
  return count;
},

get lastActivityAt() {
  return lastActivityTimestamp;
},
```

### 3. `packages/cli/src/serve/server.ts`

`healthHandler` (~ Zeile 803) im `deep`-Zweig anpassen:

```typescript
const healthHandler = (req: Request, res: Response): void => {
  const deepQuery = req.query['deep'];
  const deep = deepQuery === '1' || deepQuery === 'true' || deepQuery === '';
  if (!deep) {
    res.status(200).json({ status: 'ok' });
    return;
  }
  try {
    const lastActivityAt = bridge.lastActivityAt;
    const now = Date.now();
    res.status(200).json({
      status: 'ok',
      // Bestehend
      sessions: bridge.sessionCount,
      pendingPermissions: bridge.pendingPermissionCount,
      // Neu
      activePrompts: bridge.activePromptCount,
      connectedClients: getActiveSseCount(),
      channelAlive: bridge.isChannelLive(),
      lastActivityAt:
        lastActivityAt !== null ? new Date(lastActivityAt).toISOString() : null,
      idleSinceMs: lastActivityAt !== null ? now - lastActivityAt : null,
    });
  } catch (err) {
    writeStderrLine(
      `qwen serve: /health deep probe failed: ${err instanceof Error ? err.message : String(err)}`,
    );
    res.status(503).json({ status: 'degraded' });
  }
};
```

### 4. `packages/cli/src/serve/server.test.ts`

Neue Testfälle hinzufügen, die Folgendes abdecken:

- Korrekte Rückgabe der neuen Felder in `/health?deep=true`
- Bei keiner Session: `activePrompts === 0`, `idleSinceMs === null`
- Während der Prompt-Ausführung: `activePrompts > 0`, `idleSinceMs` wird ständig aktualisiert
- Nach Abschluss des Prompts: `idleSinceMs` beginnt zu steigen

### 5. `packages/acp-bridge/src/bridge.test.ts`

Neue Testfälle hinzufügen, die Folgendes abdecken:

- Werteveränderungen von `activePromptCount` im Lebenszyklus eines Prompts
- Aktualisierung von `lastActivityAt` nach verschiedenen Aktivitätsereignissen
- Korrekte Summierung von `activePromptCount` bei parallelen Sessions

## Dateiänderungsliste

| Datei                                    | Änderungsart   | Beschreibung                                                                 |
| ---------------------------------------- | -------------- | ---------------------------------------------------------------------------- |
| `packages/acp-bridge/src/bridgeTypes.ts` | Schnittstellen-Erweiterung | Neue Eigenschaften `activePromptCount` und `lastActivityAt` hinzugefügt      |
| `packages/acp-bridge/src/bridge.ts`      | Logik-Implementierung      | Neue Verfolgung von `lastActivityTimestamp` + Getter                         |
| `packages/cli/src/serve/server.ts`       | HTTP-Antwort-Erweiterung   | `/health?deep=true` gibt neue Felder zurück                                 |
| `packages/cli/src/serve/server.test.ts`  | Tests         | Neue Abdeckung der Health-Endpunkt-Felder                                    |
| `packages/acp-bridge/src/bridge.test.ts` | Tests         | Neue Abdeckung der Bridge-Eigenschaften                                      |

## Kompatibilität

- **Abwärtskompatibel**: Neue Felder werden angehängt, keine vorhandenen Felder werden geändert oder gelöscht
- **`GET /health` (nicht deep)**: Verhalten bleibt unverändert – es wird nur `{ "status": "ok" }` zurückgegeben
- **OTel-Gauge**: Der bestehende `registerDaemonGaugeCallbacks` kann optional später um einen `activePrompts`-Gauge erweitert werden, liegt aber nicht im Umfang dieses Changes

## Zukünftige Erweiterungen (nicht in diesem Umfang)

1. **Automatisches Herunterfahren**: Daemon-interner Parameter `--auto-shutdown-idle-ms`, der bei Überschreiten der Leerlaufzeit den Daemon selbstständig beendet (geeignet für systemd/K8s-Pod-Szenarien)
2. **OTel-Metrik-Export**: `activePrompts` und `idleSinceMs` als Gauge beim OTel-Meter registrieren
3. **Webhook-Callback**: Bei Überschreiten der Leerlaufschwelle ein Ereignis aktiv an ein externes System senden