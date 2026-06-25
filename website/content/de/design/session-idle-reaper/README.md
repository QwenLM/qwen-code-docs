# Session Idle Reaper – Design-Dokument

**Status:** Entwurf  
**Autor:** qinqi  
**Datum:** 2026-06-08  
**Geltungsbereich:** `packages/acp-bridge/src/bridge.ts`, `packages/cli/src/serve/server.ts`

---

## 1. Problembeschreibung

### 1.1 Aktuelles Verhalten

Einmal erstellt, lebt eine Bridge-Session dauerhaft im Arbeitsspeicher (`byId: Map<string, SessionEntry>`).
Sie wird nur in folgenden Fällen zerstört:

1. Ein Client ruft explizit `DELETE /session/:id` auf (`closeSession`)
2. Der gemeinsame `qwen --acp`-Kindprozess stürzt ab (`channel.exited`-Handler)
3. Der Daemon-Prozess empfängt `SIGTERM` / `SIGINT` (`shutdown`)

Es gibt **kein automatisches Leerlauf-Timeout** für Sessions. Die Heartbeat-Zeitstempel
(`sessionLastSeenAt`, `clientLastSeenAt`) werden von `recordHeartbeat` aufgezeichnet, aber
niemals für Räumungsentscheidungen genutzt (der Feldkommentar verweist auf eine zukünftige
„Revocation Policy (PR 24)“, die noch nicht eingeführt wurde).

### 1.2 Auswirkungen

| Szenario                                                                              | Symptom                                                                                  |
| ------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Benutzer öffnet mehrere Browser-Tabs, schließt sie ohne `DELETE /session`-Aufruf      | Sessions sammeln sich in `byId`, jede belegt einen EventBus-Ring (~2–4 MB)               |
| 20 Sessions (Standard `maxSessions`) sammeln sich an                                  | `SessionLimitExceededError` bei neuem `spawnOrAttach` – Benutzer wird ausgesperrt        |
| Langlaufender Daemon mit häufigem Tab-Wechsel                                         | Unbegrenztes Speicherwachstum in den EventBus-Wiederholungsringen und im ACP-Session-State |
| Neustart / Absturz der IDE-Erweiterung                                                | Verwaiste Sessions werden nie bereinigt                                                   |

### 1.3 Warum jetzt

Der Daemon wird zunehmend als langlebiger Workspace-Server eingesetzt (Desktop-App,
IDE-Erweiterungen, Web-UI). Client-Abstürze und Netzwerkaussetzer sind normal – sich auf
explizites `DELETE` zur Bereinigung zu verlassen, ist nicht haltbar.

---

## 2. Entwurfsziele

1. **Leerlaufende Sessions automatisch zurückgewinnen**, deren Clients nicht mehr aktiv sind
   und die keine laufende Arbeit haben.
2. **Eine Session mit aktivem Prompt niemals zerstören** – dies würde sichtbare Benutzerarbeit
   still beenden.
3. **Persistierte Session-Daten erhalten** – nur der In-Memory-Bridge-Zustand wird freigegeben;
   Disk-Transkripte (`SessionService`) bleiben unberührt. Benutzer können mit `session/load` oder
   `session/resume` wiederherstellen.
4. **Beobachtbar** – ein eigenes SSE-Ereignis ausgeben, damit Clients wissen, WARUM die Session
   geschlossen wurde (Leerlauf-Timeout vs. explizites Schließen vs. Absturz).
5. **Konfigurierbar** – Betreiber und Tests können Timeouts anpassen oder den Reaper
   komplett deaktivieren.
6. **Keine neuen Abhängigkeiten / Komponenten** – vollständig innerhalb des bestehenden
   Bridge-Closures implementieren.

### Nicht-Ziele

- Session-Management über mehrere Workspaces hinweg (das wäre ein Gateway-Thema).
- LRU-Räumung an der `maxSessions`-Grenze (wertvoll, aber separate Arbeit – als Nachfolger
  vermerkt).
- EventBus-Ring-Kompaktierung für Leerlauf-Sessions (niedrige Priorität angesichts der
  20-Session-Grenze; als Nachfolger vermerkt).
- RSS-basierter adaptiver Druck (erfordert `process.memoryUsage()`-Abfragen und
  Policy-Design; als Nachfolger vermerkt).

---

## 3. Architektur

### 3.1 Überblick

```
Bridge-Closure (createHttpAcpBridge)
│
├─ byId: Map<sessionId, SessionEntry>     ← vorhanden
├─ channelInfo: ChannelInfo               ← vorhanden
├─ idleTimer (channel-level)              ← vorhanden
│
└─ sessionReaper: NodeJS.Timeout          ← NEU
     │
     ├─ durchläuft alle REAP_INTERVAL_MS byId
     ├─ überspringt Sessions mit aktivem Prompt
     ├─ überspringt Sessions mit aktiven SSE-Abonnenten
     ├─ schließt Sessions, die das Leerlauf-TTL überschritten haben
     └─ sendet session_closed { reason: 'idle_timeout' }
```

### 3.2 Beziehung zu bestehenden Mechanismen

| Mechanismus                              | Geltungsbereich                         | Was gesteuert wird                                                              |
| ---------------------------------------- | --------------------------------------- | ------------------------------------------------------------------------------- |
| `channelIdleTimeoutMs` + `startIdleTimer` | Kanal (Kindprozess)                     | Beendet den `qwen --acp`-Kindprozess, wenn ALLE Sessions verschwunden sind        |
| **Session-Reaper** (dieser Entwurf)       | Session (In-Memory-Eintrag)             | Schließt einzelne Sessions bei Leerlauf                                         |
| `ConnectionRegistry`-Sweep               | ACP-over-HTTP-Verbindung                | Räumt `/acp`-Transportverbindungen (andere Ebene)                               |
| `writerIdleTimeoutMs`                     | SSE-Abonnent                            | Entfernt einen einzelnen feststeckenden SSE-Abonnenten                          |
| Disconnect-Reaper (server.ts)             | Spawn-Handshake                         | Räumt Sessions, deren Spawn-Besitzer während des POST /session-Handshakes getrennt wurden |

Zwei Mechanismen arbeiten zusammen, um den vollständigen Lebenszyklus von Sessions zu bereinigen:
1. **Close-on-last-detach** (primär) — Wenn `detachClient` den letzten
   registrierten Client entfernt UND keine SSE-Abonnenten mehr vorhanden sind,
   wird die Sitzung sofort über `closeSessionImpl` geschlossen. Dies behandelt
   den normalen Ablauf: Benutzer schließt einen Tab → React-Bereinigung →
   `POST /session/:id/detach`.

2. **Sitzungs-Aufräumer im Leerlauf** (Auffangnetz) — Periodische Suche nach
   Sitzungen ohne aktiven Prompt und ohne SSE-Abonnenten, die innerhalb der
   konfigurierten TTL keinen Heartbeat erhalten haben. Dies fängt den
   Absturzpfad ab: Browser getötet, Netzwerk abgebrochen, `kill -9` — die
   Detach-Anfrage wurde nie gesendet, daher zeigt `clientIds` weiterhin
   registrierte Clients an, aber die Sitzung ist faktisch verwaist.

---

## 4. Detailliertes Design

### 4.1 Neue Konfigurationsoptionen (`BridgeOptions`)

```typescript
interface BridgeOptions {
  // ... bestehende Felder ...

  /**
   * Wie oft der Sitzungs-Aufräumer `byId` nach Sitzungen im Leerlauf
   * durchsucht, in Millisekunden. Standard: 60_000 (1 Minute). Auf 0 oder
   * Infinity setzen, um den Aufräumer vollständig zu deaktivieren. Der
   * Timer wird mit `.unref()` versehen.
   */
  sessionReapIntervalMs?: number;

  /**
   * Eine Sitzung mit KEINEN aktiven SSE-Abonnenten UND KEINEN registrierten
   * Clients, die für diese Anzahl Millisekunden keinen Heartbeat erhalten hat,
   * gilt als im Leerlauf und wird aufgeräumt.
   *
   * Standard: 30 * 60_000 (30 Minuten).
   * Auf 0 oder Infinity setzen, um das Aufräumen von Leerlauf zu deaktivieren.
   */
  sessionIdleTimeoutMs?: number;
}
```

**CLI-Oberfläche** (`qwen serve`-Flags):

```
--session-reap-interval-ms <ms>   Intervall der Aufräumer-Suche (Standard 60000, 0=deaktivieren)
--session-idle-timeout-ms <ms>    Leerlauf-Schwelle (Standard 1800000, 0=deaktivieren)
```

### 4.2 Prädikat für Sitzung im Leerlauf

Eine Sitzung ist zum Aufräumen berechtigt, wenn **alle** der folgenden
Bedingungen zutreffen:

1. **Kein aktiver Prompt**: `entry.promptActive === false`
2. **Keine aktiven SSE-Abonnenten**: `entry.events.subscriberCount === 0`
3. **Leerlaufdauer überschritten**: `now - lastActivity(entry) > sessionIdleTimeoutMs`

Hinweis: Der Aufräumer prüft absichtlich NICHT `clientIds.size`. Er deckt
den Absturzpfad ab, bei dem Detach nie gesendet wurde – `clientIds` zeigt
immer noch registrierte Clients, aber die Sitzung ist faktisch verwaist. Der
normale Pfad (Client sendet Detach) wird stattdessen durch Close-on-last-detach
behandelt.

Wobei `lastActivity(entry)` wie folgt definiert ist:

```typescript
function lastActivity(entry: SessionEntry): number {
  // `sessionLastSeenAt` ist Epoche in ms (von Date.now());
  // `createdAt` ist ein ISO-8601-String – zur Sicherheit in Epoche-ms parsen.
  return entry.sessionLastSeenAt ?? Date.parse(entry.createdAt);
}
```

Hinweis: `entry.createdAt` ist als `string` (ISO 8601) typisiert, nicht als Zahl.
`Date.parse` ist hier sicher – das Format ist immer `new Date().toISOString()`
(siehe `createSessionEntry`, bridge.ts:1883).

**Begründung für jede Absicherung:**

| Absicherung               | Warum                                                                                                                          |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Kein aktiver Prompt       | Ein Prompt ohne SSE (z. B. CLI-Pipe, Cron-Job) könnte ohne SSE-Abonnenten laufen. Ihn aufzuräumen würde Arbeit zerstören.     |
| Keine SSE-Abonnenten      | Ein verbundener Client hört aktiv zu. Selbst wenn kein Heartbeat gesendet wurde, beweist die SSE-Verbindung selbst Lebendigkeit. |
| Leerlaufdauer             | Schonfrist, damit kurzzeitig getrennte Clients erneut verbinden können, ohne ihre Sitzung zu verlieren.                        |

### 4.3 Aufräum-Aktion

Für jede Sitzung, die das Leerlauf-Prädikat erfüllt, ruft der Aufräumer auf:

```typescript
await closeSession(sessionId, { reason: 'idle_timeout' });
```

Dies verwendet den vorhandenen `closeSession`-Pfad, der:

1. Aus `byId` / `defaultEntry` entfernt
2. Ausstehende Berechtigungen über `permissionMediator.forgetSession` abbricht
3. `session_closed`-Ereignis (mit `reason: 'idle_timeout'`) veröffentlicht
4. Den EventBus schließt
5. `connection.cancel()` an das ACP-Kind sendet (best-effort)
6. Den `startIdleTimer` auf dem Kanal auslöst, wenn es die letzte Sitzung war

**Warum `closeSession` und nicht `killSession`?**

`killSession` ist der interne Zwangs-Aufräum-Pfad, der für die Verbindungsrennbedingung beim Spawn-Handshake entwickelt wurde (`requireZeroAttaches`-Wächter, `spawnOwnerWantedKill`-Tombstone).
`closeSession` ist der dokumentierte, client-seitige Pfad, der `session_closed` (nicht `session_died`) veröffentlicht und die Telemetrie korrekt behandelt. Der Aufräumer ist ein "ordentliches Schließen im Namen eines abwesenden Clients", daher ist `closeSession` die richtige Semantik.

### 4.4 Erweiterung von `closeSession` zur Annahme eines Schließgrunds

Derzeit setzt `closeSession` im `session_closed`-Ereignis hart `reason: 'client_close'`. Wir müssen dies parametrisierbar machen.

**Ansatz:** Fügen Sie einen neuen optionalen Parameter `opts` zu `closeSession` hinzu, anstatt `BridgeClientRequestContext` zu überladen (dieser ist ein Client-Anfrage-Kontext – das Hinzufügen von `reason` wäre ein Schichtenverstoß, da "reason" eine serverseitige Entscheidung ist, kein Wert, den ein Client in einem Header übergibt).

```typescript
// bridgeTypes.ts – Neuer Typ + Signaturänderung:
export interface CloseSessionOpts {
  /** Überschreibt den standardmäßigen 'client_close'-Grund im session_closed-Ereignis. */
  reason?: string;
}

closeSession(
  sessionId: string,
  context?: BridgeClientRequestContext,
  opts?: CloseSessionOpts,
): Promise<void>;
```
```typescript
// bridge.ts — implementation change:
async closeSession(sessionId, context, opts) {
  // ...
  const reason = opts?.reason ?? 'client_close';
  entry.events.publish({
    type: 'session_closed',
    data: { sessionId, reason, ... },
  });
}
```

Bestehende Aufrufer (Route `DELETE /session/:id`) übergeben kein `opts`, standardmäßig wird `'client_close'` verwendet. Der Reaper übergibt `{ reason: 'idle_timeout' }`.

### 4.5 Reaper-Lebenszyklus

```typescript
// Inside createHttpAcpBridge closure:

const resolvedReapIntervalMs = resolvePositiveMs(
  opts.sessionReapIntervalMs,
  60_000,
);
const resolvedIdleTimeoutMs = resolvePositiveMs(
  opts.sessionIdleTimeoutMs,
  30 * 60_000,
);

let sessionReaper: ReturnType<typeof setInterval> | undefined;

function startSessionReaper(): void {
  if (resolvedReapIntervalMs <= 0 || resolvedIdleTimeoutMs <= 0) return;
  sessionReaper = setInterval(() => {
    if (shuttingDown) return;
    const now = Date.now();
    for (const [id, entry] of byId) {
      if (entry.promptActive) continue;
      if (entry.events.subscriberCount > 0) continue;
      const lastActive = entry.sessionLastSeenAt ?? Date.parse(entry.createdAt);
      const idle = now - lastActive;
      if (idle < resolvedIdleTimeoutMs) continue;
      writeStderrLine(
        `qwen serve: reaping idle session ${JSON.stringify(id)} ` +
          `(idle for ${Math.round(idle / 1000)}s, threshold ${Math.round(resolvedIdleTimeoutMs / 1000)}s)`,
      );
      // Pass `undefined` context (no client) and `{ reason }` opts.
      bridgeImpl
        .closeSession(id, undefined, { reason: 'idle_timeout' })
        .catch((err) => {
          writeStderrLine(
            `qwen serve: session reaper failed to close ${JSON.stringify(id)}: ${String(err)}`,
          );
        });
    }
  }, resolvedReapIntervalMs);
  sessionReaper.unref();
}

function stopSessionReaper(): void {
  if (sessionReaper !== undefined) {
    clearInterval(sessionReaper);
    sessionReaper = undefined;
  }
}
```

Hinweis: `bridgeImpl` bezieht sich auf das Bridge-Objekt, das von `createHttpAcpBridge` zurückgegeben wird, sodass `closeSession` vollen Zugriff auf den Closure-Bereich hat. In der Praxis wird dies als direkter Aufruf der clousure-internen Funktion `closeSessionImpl` implementiert.

**Integration in den Lebenszyklus:**

- `startSessionReaper()` wird zum Zeitpunkt der Bridge-Erstellung aufgerufen (nach der Optionsvalidierung, parallel zur Einrichtung von `channelIdleTimeoutMs`).
- `stopSessionReaper()` wird sowohl in `shutdown()` als auch in `killAllSync()` aufgerufen.

### 4.6 Interaktion mit bestehenden `closeSession`-Aufrufern

| Aufrufer                       | Auswirkung                                                             |
| ------------------------------ | ---------------------------------------------------------------------- |
| Route `DELETE /session/:id`    | Keine — kein `opts` übergeben, Standardwert ist `reason: 'client_close'`|
| Session-Reaper (dieses Design) | Übergibt `opts: { reason: 'idle_timeout' }`                            |
| Verzögertes `detachClient`-Aufräumen | Ruft `killSession` auf (nicht `closeSession`), nicht betroffen      |
| `channel.exited`-Handler       | Veröffentlicht `session_died`, nicht betroffen                         |
| `shutdown()`                   | Veröffentlicht `session_died` mit Grund `daemon_shutdown`, nicht betroffen |

### 4.7 Nebenläufigkeitssicherheit

Der Reaper-Callback läuft auf der Node.js-Ereignisschleife. Wichtige Überlegungen:

- **`for...of`-Iteration ist synchron.** Der Reaper wertet das Leerlauf-Prädikat jedes Eintrags synchron aus und löst dann `closeSession(...).catch(...)` für übereinstimmende Einträge aus. Kein `await` im Schleifenkörper — alle Schließungen werden in einer einzigen Mikrotask-Grenze ausgelöst, dann wird die Schleife beendet.
- **`byId.delete` ist verzögert.** Innerhalb von `closeSession` wird `byId.delete` NACH dem ersten `await` (`notifyAgentSessionClose`) ausgeführt. Das bedeutet, dass Löschungen in Mikrotasks nach Abschluss der `for...of`-Schleife stattfinden. Da jede `closeSession` auf einem eigenen Schlüssel operiert, gibt es kein Aliasing. Und `for...of` hat die Iteration bereits abgeschlossen, sodass eine Löschung während der Iteration kein Problem darstellt.
- **Rennen beim doppelten Schließen.** Wenn ein Client zwischen der Prädikatprüfung des Reapers und der asynchronen `closeSession`-Ausführung `DELETE /session/:id` für dieselbe Session aufruft, wird `closeSession` des Reapers einen `SessionNotFoundError` auslösen (abgefangen durch `.catch()`). Sicher.
- **Rennen beim Wiederverbinden.** Wenn ein Client zwischen der Prädikatprüfung des Reapers und der `closeSession`-Ausführung erneut eine Verbindung zu einer Session herstellt (clientId registriert / SSE öffnet), wird `closeSession` trotzdem fortfahren und die Session schließen. Der Client erhält `session_closed` und muss neu laden. Dieses Zeitfenster ist extrem schmal (ein einziger synchroner `setInterval`-Tick) und die Konsequenz ist harmlos — kein Datenverlust, nur eine Aufforderung zum Neuladen. Der standardmäßige TTL von 30 Minuten macht dies äußerst selten.
- Ein gleichzeitiges `spawnOrAttach`, das eine neue Session erstellt, während der Reaper scannt, wird nicht gesehen (wir iterieren `byId`-Einträge zu Beginn jedes Ticks). Dies ist sicher — neue Sessions sind frisch und erreichen die Leerlaufschwelle nicht.
### 4.8 Änderung des Wire-Formats

Das Feld `data.reason` des Ereignisses `session_closed` existiert bereits mit dem Wert `'client_close'`. Wir fügen zwei neue Werte hinzu:

- `'idle_timeout'` – wird vom Idle-Reaper ausgelöst (Auffangmechanismus für abgestürzte Clients)
- `'last_client_detached'` – wird bei Schließen beim letzten Trennen ausgelöst (normales Schließen eines Tabs)

Dies ist abwärtskompatibel – vorhandener SDK-Code, der `reason === 'client_close'` prüft, wird die neuen Werte einfach nicht treffen, und der generische Terminal-Frame-Handler (`isTerminalLifecycleEvent`) behandelt `session_closed` bereits unabhängig vom Grund.

---

## 5. Testplan

### 5.1 Unit-Tests (`bridge.test.ts`)

| #   | Test                                                                   | Beschreibung                                                                                                                                                                                             |
| --- | ---------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Idle-Session wird nach Timeout entfernt                                | Session erstellen, Zeit über `sessionIdleTimeoutMs` hinaus vorspulen, Reaper-Tick auslösen, prüfen ob Session aus `byId` entfernt und Ereignis `session_closed` mit `reason: 'idle_timeout'` veröffentlicht wird |
| 2   | Session mit aktivem Prompt wird NICHT entfernt                         | Session erstellen, Prompt starten, Zeit vorspulen, prüfen ob Session den Reaper-Tick überlebt                                                                                                           |
| 3   | Session mit live-SSE-Abonnent wird NICHT entfernt                      | Session erstellen, ihren EventBus abonnieren, Zeit vorspulen, prüfen ob Session überlebt                                                                                                                 |
| 4   | Session mit registriertem Client wird NICHT entfernt                   | Session erstellen, eine clientId registrieren, Zeit vorspulen, prüfen ob Session überlebt                                                                                                                |
| 5   | Reaper deaktiviert bei Intervall = 0                                   | `sessionReapIntervalMs: 0` übergeben, prüfen ob kein `setInterval` aktiviert wird                                                                                                                        |
| 6   | Reaper deaktiviert bei Timeout = 0                                     | `sessionIdleTimeoutMs: 0` übergeben, prüfen ob kein `setInterval` aktiviert wird                                                                                                                         |
| 7   | Reaper wird beim Herunterfahren gestoppt                                | `shutdown()` aufrufen, prüfen ob `clearInterval` aufgerufen wurde                                                                                                                                         |
| 8   | closeSession-Grund standardmäßig 'client_close'                        | `closeSession` ohne expliziten Grund aufrufen, prüfen ob veröffentlichtes Ereignis `reason: 'client_close'` hat                                                                                          |
| 9   | closeSession mit explizitem Grund                                      | `closeSession` mit `reason: 'idle_timeout'` aufrufen, prüfen ob Ereignis veröffentlicht wird                                                                                                             |
| 10  | Mehrere Idle-Sessions werden in einem Tick entfernt                     | 3 Idle-Sessions erstellen, Zeit vorspulen, Tick auslösen, prüfen ob alle 3 entfernt wurden                                                                                                               |
| 11  | Session mit Heartbeat innerhalb der TTL überlebt                       | Session erstellen, Heartbeat aufzeichnen, Zeit knapp unter TTL vorspulen, prüfen ob Session überlebt                                                                                                     |
| 12  | Channel-Idle-Timer wird nach Entfernen der letzten Session ausgelöst    | 1 Session (letzte auf dem Channel) erstellen, entfernen, prüfen ob `startIdleTimer` auf dem Channel aufgerufen wird                                                                                      |

### 5.2 Integrationstests (`server.test.ts`)

| #   | Test                                                                       | Beschreibung                                                                                       |
| --- | -------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| 1   | `GET /health?deep=1` spiegelt die vom Reaper bereinigte Session-Anzahl wider | Daemon starten, Sessions erstellen, Zeit vorspulen, prüfen ob Health-Endpoint reduzierte Anzahl zeigt |
| 2   | SSE-Abonnent erhält `session_closed` mit `reason: 'idle_timeout'`           | SSE öffnen, trennen, vor TTL wieder verbinden, dann TTL ablaufen lassen, Ereignis prüfen            |

---

## 6. Standardkonfiguration

| Option                  | Standard            | Begründung                                                                                                      |
| ----------------------- | ------------------- | --------------------------------------------------------------------------------------------------------------- |
| `sessionReapIntervalMs` | 60.000 (1 Min)      | Häufig genug, um lange Ansammlungen zu vermeiden, günstig (einfacher Map-Scan) für häufiges Ausführen           |
| `sessionIdleTimeoutMs`  | 1.800.000 (30 Min)  | Großzügige Gnadenfrist für Wiederverbindung. Stimmt mit `ConnectionRegistry.idleTtlMs` für mentale Modellkonsistenz überein |
---

## 7. Observability

- **stderr log**: `qwen serve: reaping idle session "<id>" (idle for Nms)` bei jeder Bereinigung, passend zur bestehenden `qwen serve:`-Präfix-Konvention.
- **Telemetry event**: `session.close` mit Operation `qwen-code.daemon.bridge.operation: 'session.close'` (verwendet vorhandenen `closeSession`-Telemetriepfad).
- **Telemetry metric**: `sessionLifecycle('close')` (verwendet vorhandenen Zähler).
- **SSE event**: `session_closed` mit `data.reason: 'idle_timeout'`.

---

## 8. Folgearbeiten (außerhalb des Umfangs)

| Element                        | Beschreibung                                                                                  | Priorität |
| ------------------------------ | --------------------------------------------------------------------------------------------- | --------- |
| LRU-Verdrängung bei `maxSessions` | Anstatt neue Sitzungen abzulehnen, die am längsten inaktive Sitzung verdrängen              | P1        |
| EventBus-Ring-Kompaktierung    | Den Ring für Sitzungen mit 0 Abonnenten verkleinern, um Speicher zu sparen                   | P2        |
| RSS-basierter adaptiver Druck  | Überwache `process.memoryUsage().rss` und senke die Leerlauf-TTL bei Speicherknappheit       | P2        |
| Heartbeat-basierte Client-Lebendigkeit | Clients, die N aufeinanderfolgende Heartbeat-Fenster verpassen, automatisch abmelden | P2        |

---

## 9. Risiken und Maßnahmen

| Risiko                                                                                               | Maßnahme                                                                                                                                                                                                   |
| ---------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Der Reaper schließt eine Sitzung, mit der sich ein Headless-Client gerade wieder verbinden möchte | Der Standard-TTL von 30 Minuten ist großzügig; Headless-Clients sollten Heartbeats senden. Das Transkript auf der Festplatte bleibt erhalten – `session/load` stellt es wieder her.                        |
| `closeSession` im Reaper wirft einen Fehler und vergiftet die Scan-Schleife                         | Jeder Schließvorgang hat seinen eigenen `.catch()` – ein Fehler blockiert keine anderen.                                                                                                                    |
| Reaper-Iteration über `byId` während gleichzeitigem `closeSession` von einem anderen Pfad          | Die ES2015 Map-Iteration toleriert das Löschen aktueller/vorheriger Schlüssel. Doppeltes Schließen ist idempotent (`byId.get` gibt undefined zurück → `SessionNotFoundError` wird vom `.catch` des Reapers abgefangen). |
| Leistung beim Scannen von 20 Sitzungen alle 60s                                                      | Trivial – 20 Map-Lesevorgänge + 4 Feldprüfungen pro Stück. Keine E/A.                                                                                                                                     |
| Interaktion des Kanal-Leerlauf-Timers                                                                | Wenn die letzte Sitzung bereinigt wird, ruft `closeSession` bereits `startIdleTimer` auf dem Kanal auf. Es ist keine zusätzliche Logik erforderlich.                                                        |
