# Design der Leerlauferkennungs-API des Daemons

## Hintergrund

### Problem

Der Qwen-Daemon wird auf mehreren Maschinen als langlaufender Dienst bereitgestellt. Wenn der Daemon längere Zeit keine Aufgaben ausführt, ist es Verschwendung, weiterhin Maschinenressourcen zu belegen. Ein externer Scheduler (K8s HPA / benutzerdefinierter Scaler) benötigt ein zuverlässiges Signal, um zu entscheiden, ob der Daemon im Leerlauf ist, um ihn für die Skalierung herunterzufahren.

### Aktueller Stand

Derzeit verfügbare Schnittstellen:

| Schnittstelle                    | Rückgabeinformationen                               | Einschränkungen                                                           |
| -------------------------------- | --------------------------------------------------- | ------------------------------------------------------------------------- |
| `GET /health?deep=true`          | `{ sessions, pendingPermissions }`                  | Nur Anzahl der Sessions, kann nicht unterscheiden zwischen "Session im Leerlauf" und "Session arbeitet" |
| `GET /workspace/:cwd/sessions`   | Für jede Session `hasActivePrompt` + `clientCount`  | Erfordert eine zusätzliche Anfrage, keine zeitliche Dimension (wie lange inaktiv?) |

**Kernlücken**:

1. Kein aggregiertes Indikator für "aktive Prompts"
2. Kein "letzter Aktivitätszeitpunkt", externe Systeme müssen selbst einen Zustandsautomaten zur Berechnung der Leerlaufdauer pflegen
3. Keine Offenlegung der SSE-Verbindungsanzahl (wird intern als `activeSseCount` verwaltet, aber `/health` gibt sie nicht zurück)
4. Keine Offenlegung des Kanal- (Agent-Subprozess-) Lebendstatus

## Designziele

Bereitstellung einer Schnittstelle, die mit **einem einzigen HTTP-Aufruf** die Leerlaufbeurteilung ermöglicht:

- Externer Scheduler kann mit einem GET entscheiden, ob freigegeben werden kann
- Unterstützt Zeitdimension (wie lange im Leerlauf), vermeidet externe Zustandsverwaltung
- Rückwärtskompatibel zum bestehenden `/health`-Verhalten
- Null zusätzliche Abhängigkeiten, Nutzung bestehender interner Zustände

## Lösung

### Erweiterung der Antwort von `GET /health?deep=true`

Füge Felder zur bestehenden Antwort von `/health?deep=true` hinzu:

```jsonc
// GET /health?deep=true
{
  "status": "ok",

  // --- Bestehende Felder (unverändert) ---
  "sessions": 2,
  "pendingPermissions": 0,

  // --- Neue Felder ---
  "activePrompts": 1, // Anzahl der Sessions, die gerade einen Prompt ausführen
  "connectedClients": 3, // Aktive SSE-Verbindungen
  "channelAlive": true, // Lebt der Agent-Subprozess?
  "lastActivityAt": "2026-06-10T08:30:00.000Z", // Zeitstempel der letzten Aktivität (ISO 8601)
  "idleSinceMs": 120000, // Millisekunden seit der letzten Aktivität
}
```

### Felddefinitionen

| Feld                | Typ                | Bedeutung                                                                                             |
| ------------------- | ------------------ | ----------------------------------------------------------------------------------------------------- |
| `activePrompts`     | `number`           | Anzahl der Sessions mit `promptActive === true`                                                        |
| `connectedClients`  | `number`           | Anzahl aktuell aktiver SSE-Verbindungen (bereits vorhanden `activeSseCount`)                          |
| `channelAlive`      | `boolean`          | Ob der Agent-Subprozess noch lebt (bereits vorhanden `bridge.isChannelLive()`)                        |
| `lastActivityAt`    | `string \| null`   | ISO-Zeitstempel des letzten Prompt-Starts oder -Endes; `null`, wenn seit Daemon-Start nie ein Prompt stattfand |
| `idleSinceMs`       | `number \| null`   | `Date.now() - lastActivityAt`; `null`, wenn keine Aktivitätsaufzeichnung                              |

### Definition von "Aktivität"

Folgende Ereignisse gelten als "Aktivität" und aktualisieren `lastActivityAt`:

- Prompt beginnt Ausführung (`promptActive` wechselt von false → true)
- Prompt wird beendet/schließt fehl (`promptActive` wechselt von true → false)
- Neue Session wird erstellt (`spawnOrAttach` erfolgreich)
- Session wird wiederhergestellt/geladen (`loadSession` / `resumeSession` erfolgreich)

**Nicht** als Aktivität gewertet (um Fehlinterpretationen zu vermeiden):

- SSE-Verbindung auf-/abbauen
- Heartbeat
- `/health`-Anfrage selbst
- Permission-Anfrage/-Antwort

### Leerlauf-Erkennungsregeln (als Referenz für externen Scheduler)

```python
def should_reclaim(health, idle_threshold_ms=300_000):
    """Empfohlene Freigabebedingung: Leerlauf länger als Schwellwert (Standard 5 Minuten)"""
    if health["activePrompts"] > 0:
        return False  # Aufgabe läuft
    if health["connectedClients"] > 0:
        return False  # Clients sind verbunden
    if health["idleSinceMs"] is None:
        # Noch nie aktiv — möglicherweise frisch gestarteter Cold Daemon
        return True
    return health["idleSinceMs"] >= idle_threshold_ms
```

## Betroffene Codeänderungen

### 1. `packages/acp-bridge/src/bridgeTypes.ts`

Im Interface `AcpSessionBridge` neu hinzufügen:

```typescript
/** Anzahl der Sessions, die gerade einen Prompt ausführen */
get activePromptCount(): number;

/** Zeitstempel der letzten Aktivität (epoch ms), null falls noch nie aktiv */
get lastActivityAt(): number | null;
```

### 2. `packages/acp-bridge/src/bridge.ts`

Innerhalb der Factory-Funktion `createAcpSessionBridge`:

```typescript
// Neue Zustandsverfolgung
let lastActivityTimestamp: number | null = null;

function touchActivity(): void {
  lastActivityTimestamp = Date.now();
}
```

`touchActivity()` an folgenden Stellen aufrufen:

- `entry.promptActive = true` (ca. Zeile 2528) — Prompt start
- `entry.promptActive = false` (ca. Zeile 2551, 2559) — Prompt Ende
- Nach erfolgreichem `doSpawn` einer Session (ca. Zeile 1906)
- Nach erfolgreichem `restoreSession`

Im zurückgegebenen Objekt offenlegen:

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

`healthHandler` (ca. Zeile 803) im `deep`-Zweig ändern:

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

Neue Testfälle decken ab:

- `/health?deep=true` gibt die Korrektheit der neuen Felder zurück
- Ohne Session: `activePrompts === 0`, `idleSinceMs === null`
- Während der Prompt-Ausführung: `activePrompts > 0`, `idleSinceMs` wird kontinuierlich aktualisiert
- Nach Abschluss des Prompts: `idleSinceMs` beginnt zu steigen

### 5. `packages/acp-bridge/src/bridge.test.ts`

Neue Testfälle decken ab:

- Änderungen des `activePromptCount`-Werts im Lebenszyklus eines Prompts
- `lastActivityAt` wird nach jedem Aktivitätsereignis aktualisiert
- Korrekte Akkumulation von `activePromptCount` bei parallelen Sessions

## Dateiänderungsübersicht

| Datei                                     | Änderungstyp       | Beschreibung                                                 |
| ---------------------------------------- | ------------------ | ------------------------------------------------------------ |
| `packages/acp-bridge/src/bridgeTypes.ts` | Schnittstellenerw. | Neue Eigenschaften `activePromptCount`, `lastActivityAt`      |
| `packages/acp-bridge/src/bridge.ts`      | Logikimplementierung | Neue `lastActivityTimestamp`-Verfolgung + Getter              |
| `packages/cli/src/serve/server.ts`       | HTTP-Antwort-Erw.  | `/health?deep=true` um neue Felder erweitert                  |
| `packages/cli/src/serve/server.test.ts`  | Test               | Neue Felder der Health-Schnittstelle abgedeckt                |
| `packages/acp-bridge/src/bridge.test.ts` | Test               | Neue Bridge-Eigenschaften abgedeckt                           |

## Kompatibilität

- **Rückwärtskompatibel**: Neue Felder werden hinzugefügt, keine vorhandenen Felder werden geändert oder gelöscht
- **`GET /health` (nicht deep)**: Verhalten unverändert, gibt weiterhin nur `{ "status": "ok" }` zurück
- **OTel Gauge**: Vorhandene `registerDaemonGaugeCallbacks` können optional später einen `activePrompts`-Gauge hinzufügen, dies ist jedoch nicht Teil dieses Umfangs

## Zukünftige Erweiterungen (nicht Teil dieses Umfangs)

1. **Automatisches Herunterfahren**: Daemon erhält Parameter `--auto-shutdown-idle-ms`, wird nach Leerlauf-Timeout selbstständig beendet (geeignet für systemd/K8s-Pod-Szenarien)
2. **Offenlegung von OTel-Metriken**: `activePrompts` und `idleSinceMs` als Gauge im OTel-Meter registrieren
3. **Webhook-Callback**: Bei Überschreitung der Leerlaufschwelle werden Ereignisse aktiv an ein externes System gesendet
