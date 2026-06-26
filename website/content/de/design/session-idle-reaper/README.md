# Session Idle Reaper — Entwurfsdokument

**Status:** Entwurf  
**Autor:** qinqi  
**Datum:** 08.06.2026  
**Umfang:** `packages/acp-bridge/src/bridge.ts`, `packages/cli/src/serve/server.ts`

---

## 1. Problemstellung

### 1.1 Aktuelles Verhalten

Einmal erstellt, lebt eine Bridge-Session dauerhaft im Speicher (`byId: Map<string, SessionEntry>`).
Sie wird nur zerstört, wenn:

1. Ein Client explizit `DELETE /session/:id` aufruft (`closeSession`)
2. Der gemeinsam genutzte `qwen --acp`-Kindprozess abstürzt (`channel.exited`-Handler)
3. Der Daemon-Prozess `SIGTERM` / `SIGINT` empfängt (`shutdown`)

Es gibt **keine automatische Leerlaufzeitüberschreitung** für Sessions. Die Heartbeat-Zeitstempel
(`sessionLastSeenAt`, `clientLastSeenAt` ) werden von `recordHeartbeat` aufgezeichnet, aber nie für
Räumungszwecke verwendet (der Feldkommentar verweist auf eine zukünftige "Revocation Policy (PR 24)",
die noch nicht implementiert ist).

### 1.2 Auswirkungen

| Szenario                                                                          | Symptom                                                                                             |
| --------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Benutzer öffnet mehrere Browser-Tabs, schließt sie ohne `DELETE /session`-Aufruf  | Sessions sammeln sich in `byId` an, jede hält einen EventBus-Ring (~2-4 MB)                         |
| 20 Sessions (Standard `maxSessions`) sammeln sich an                              | `SessionLimitExceededError` bei neuem `spawnOrAttach` – Benutzer wird ausgesperrt                   |
| Langlebiger Daemon mit häufigen Tab-Wechseln                                      | Unbegrenztes Speicherwachstum in den EventBus-Wiederholungsringen und dem ACP-seitigen Session-Zustand |
| IDE-Erweiterung startet neu / stürzt ab                                           | Verwaiste Sessions werden nie bereinigt                                                             |

### 1.3 Warum jetzt

Der Daemon wird zunehmend als langlebiger Workspace-Server eingesetzt (Desktop-App, IDE-Erweiterungen,
Web-UI). Client-Abstürze und Netzwerkprobleme sind normal – sich auf explizite `DELETE`-Aufrufe zur
Bereinigung zu verlassen, ist nicht haltbar.

---

## 2. Entwurfsziele

1. **Leerlaufende Sessions automatisch zurückgewinnen**, deren Clients weg sind und die keine aktive
   Arbeit in Bearbeitung haben.
2. **Niemals eine Session zerstören, die einen aktiven Prompt hat** – dies würde sichtbare
   Benutzerarbeit stillschweigend beenden.
3. **Persistierte Session-Daten erhalten** – nur der In-Memory-Bridge-Zustand wird freigegeben;
   Transkripte auf der Festplatte (`SessionService`) bleiben unberührt. Benutzer können per
   `session/load` oder `session/resume` wiederherstellen.
4. **Beobachtbar** – ein eigenes SSE-Ereignis ausgeben, damit Clients wissen, WARUM die Session
   geschlossen wurde (Leerlaufzeitüberschreitung vs. explizites Schließen vs. Absturz).
5. **Konfigurierbar** – Betreiber und Tests können Zeitüberschreitungen anpassen oder den Reaper
   komplett deaktivieren.
6. **Keine neuen Abhängigkeiten / Komponenten** – vollständig innerhalb des bestehenden
   Bridge-Closures implementieren.

### Nicht-Ziele

- Session-Management über Workspaces hinweg (das wäre eine Gateway-Aufgabe).
- LRU-Räumung an der `maxSessions`-Grenze (wertvoll, aber separate Arbeit – als Folgeaufgabe
  erfasst).
- EventBus-Ring-Kompaktierung für Leerlauf-Sessions (niedrige Priorität angesichts des
  20-Session-Limits; als Folgeaufgabe erfasst).
- RSS-basierter adaptiver Druck (erfordert `process.memoryUsage()`-Abfragen und
  Richtlinienentwurf; als Folgeaufgabe erfasst).

---

## 3. Architektur

### 3.1 Übersicht

```
Bridge-Closure (createHttpAcpBridge)
│
├─ byId: Map<sessionId, SessionEntry>     ← vorhanden
├─ channelInfo: ChannelInfo               ← vorhanden
├─ idleTimer (Channel-Ebene)              ← vorhanden
│
└─ sessionReaper: NodeJS.Timeout          ← NEU
     │
     ├─ durchläuft byId alle REAP_INTERVAL_MS
     ├─ überspringt Sessions mit aktivem Prompt
     ├─ überspringt Sessions mit aktiven SSE-Abonnenten
     ├─ schließt Sessions, die die Leerlauf-TTL überschreiten
     └─ sendet session_closed { reason: 'idle_timeout' }
```

### 3.2 Beziehung zu vorhandenen Mechanismen

| Mechanismus                                | Bereich                     | Was wird verwaltet                                                                      |
| ------------------------------------------ | --------------------------- | --------------------------------------------------------------------------------------- |
| `channelIdleTimeoutMs` + `startIdleTimer`  | Kanal (Kindprozess)         | Beendet den `qwen --acp`-Kindprozess, wenn ALLE Sessions verschwunden sind              |
| **Session Reaper** (dieser Entwurf)        | Session (In-Memory-Eintrag) | Schließt einzelne Sessions bei Leerlauf                                                 |
| `ConnectionRegistry`-Durchlauf             | ACP-over-HTTP-Verbindung    | Räumt `/acp`-Transportverbindungen (andere Ebene)                                       |
| `writerIdleTimeoutMs`                      | SSE-Abonnent                | Räumt einen einzelnen feststeckenden SSE-Abonnenten                                     |
| Disconnect Reaper (server.ts)              | Spawn-Handshake             | Räumt Sessions, deren Spawn-Eigentümer während des POST /session-Handshake getrennt wurde |

Zwei Mechanismen arbeiten zusammen, um den gesamten Session-Lebenszyklus abzudecken:

1. **Schließen beim letzten Trennen** (primär) – wenn `detachClient` den letzten registrierten
   Client entfernt UND keine SSE-Abonnenten mehr vorhanden sind, wird die Session sofort über
   `closeSessionImpl` geschlossen. Dies deckt den normalen Pfad ab: Benutzer schließt Tab →
   React-Bereinigung → `POST /session/:id/detach`.

2. **Session-Leerlauf-Reaper** (Auffangnetz) – periodischer Scan nach Sessions ohne aktiven
   Prompt und ohne SSE-Abonnenten, die innerhalb der konfigurierten TTL keinen Heartbeat
   erhalten haben. Dies fängt den Crash-Pfad ab: Browser beendet, Netzwerkausfall, `kill -9` –
   die Detach-Anfrage wurde nie gesendet, daher zeigt `clientIds` noch registrierte Clients,
   aber die Session ist faktisch verwaist.

---

## 4. Detaillierter Entwurf

### 4.1 Neue Konfigurationsoptionen (`BridgeOptions`)

```typescript
interface BridgeOptions {
  // ... vorhandene Felder ...

  /**
   * Wie oft der Session-Reaper `byId` nach Leerlauf-Sessions durchsucht, in
   * Millisekunden. Standard: 60_000 (1 Minute). Auf 0 oder Infinity setzen, um
   * den Reaper vollständig zu deaktivieren. Der Timer wird mit `.unref()` versehen.
   */
  sessionReapIntervalMs?: number;

  /**
   * Eine Session mit NULL aktiven SSE-Abonnenten UND NULL registrierten Clients,
   * die seit dieser Anzahl Millisekunden keinen Heartbeat erhalten hat, gilt als
   * im Leerlauf und wird geräumt.
   *
   * Standard: 30 * 60_000 (30 Minuten).
   * Auf 0 oder Infinity setzen, um die Leerlauf-Räumung zu deaktivieren.
   */
  sessionIdleTimeoutMs?: number;
}
```

**CLI-Oberfläche** (`qwen serve`-Flags):

```
--session-reap-interval-ms <ms>   Reaper-Scan-Intervall (Standard 60000, 0=deaktiviert)
--session-idle-timeout-ms <ms>    Leerlauf-Schwellwert (Standard 1800000, 0=deaktiviert)
```

### 4.2 Leerlauf-Prädikat für Sessions

Eine Session kommt für die Räumung in Frage, wenn **alle** der folgenden Bedingungen erfüllt sind:

1. **Kein aktiver Prompt**: `entry.promptActive === false`
2. **Keine aktiven SSE-Abonnenten**: `entry.events.subscriberCount === 0`
3. **Leerlaufdauer überschritten**: `now - lastActivity(entry) > sessionIdleTimeoutMs`

Hinweis: Der Reaper prüft bewusst NICHT `clientIds.size`. Er deckt den Crash-Pfad ab, bei dem
`detach` nie gesendet wurde – `clientIds` zeigt noch registrierte Clients, aber die Session ist
faktisch verwaist. Der normale Pfad (Client sendet `detach`) wird stattdessen durch das
„Schließen beim letzten Trennen" behandelt.

Wobei `lastActivity(entry)` wie folgt definiert ist:

```typescript
function lastActivity(entry: SessionEntry): number {
  // `sessionLastSeenAt` ist Epoche in ms (von Date.now());
  // `createdAt` ist ein ISO-8601-String – als Fallback in Epoche ms parsen.
  return entry.sessionLastSeenAt ?? Date.parse(entry.createdAt);
}
```

Hinweis: `entry.createdAt` ist als `string` (ISO 8601) typisiert, nicht als Zahl.
`Date.parse` ist hier sicher – das Format ist immer `new Date().toISOString()`
(siehe `createSessionEntry`, bridge.ts:1883).

**Begründung für jede Absicherung:**

| Absicherung          | Warum                                                                                                                 |
| -------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Kein aktiver Prompt  | Ein kopfloser / autonomer Prompt (z. B. CLI-Pipe, Cron-Job) kann ohne SSE-Abonnenten laufen. Ihn zu räumen würde Arbeit beenden. |
| Keine SSE-Abonnenten | Ein verbundener Client hört aktiv zu. Selbst wenn er keinen Heartbeat gesendet hat, beweist die SSE-Verbindung selbst die Lebendigkeit. |
| Leerlaufdauer        | Gnadenfrist, damit kurzzeitig getrennte Clients wieder verbinden können, ohne ihre Session zu verlieren.               |

### 4.3 Räumungsaktion

Für jede Session, die das Leerlauf-Prädikat erfüllt, ruft der Reaper auf:

```typescript
await closeSession(sessionId, { reason: 'idle_timeout' });
```

Dies nutzt den vorhandenen `closeSession`-Pfad, der:

1. Aus `byId` / `defaultEntry` entfernt
2. Ausstehende Berechtigungen über `permissionMediator.forgetSession` storniert
3. Das `session_closed`-Ereignis veröffentlicht (mit `reason: 'idle_timeout'`)
4. Den EventBus schließt
5. `connection.cancel()` an den ACP-Kindprozess sendet (bestmöglich)
6. `startIdleTimer` auf dem Kanal auslöst, wenn es die letzte Session war

**Warum `closeSession` und nicht `killSession`?**

`killSession` ist der interne Zwangsräumungspfad, der für die Spawn-Handshake-Trennungs-Race
(`requireZeroAttaches`-Wächter, `spawnOwnerWantedKill`-Tombstone) entwickelt wurde.
`closeSession` ist der dokumentierte, clientseitige Pfad, der `session_closed` (nicht
`session_died`) veröffentlicht und Telemetrie korrekt behandelt. Der Reaper ist ein
„anmutiges Schließen im Namen eines abwesenden Clients", daher ist `closeSession` die
richtige Semantik.

### 4.4 Erweiterung von `closeSession` zur Annahme eines Schließgrundes

Derzeit kodiert `closeSession` im `session_closed`-Ereignis fest den Grund `'client_close'`.
Wir müssen dies parametrisierbar machen.

**Ansatz:** Füge einen neuen optionalen `opts`-Parameter zu `closeSession` hinzu, anstatt
`BridgeClientRequestContext` zu überladen (was ein client-anforderungsspezifischer Typ
ist – das Hinzufügen von `reason` wäre ein Schichtenverstoß, da „Grund" eine
serverseitige Entscheidung ist, kein Wert, den ein Client in einem Header übergibt).

```typescript
// bridgeTypes.ts — neuer Typ + Signaturänderung:
export interface CloseSessionOpts {
  /** Überschreibt den standardmäßigen Grund 'client_close' im session_closed-Ereignis. */
  reason?: string;
}

closeSession(
  sessionId: string,
  context?: BridgeClientRequestContext,
  opts?: CloseSessionOpts,
): Promise<void>;
```

```typescript
// bridge.ts — Implementierungsänderung:
async closeSession(sessionId, context, opts) {
  // ...
  const reason = opts?.reason ?? 'client_close';
  entry.events.publish({
    type: 'session_closed',
    data: { sessionId, reason, ... },
  });
}
```

Vorhandene Aufrufer (`DELETE /session/:id`-Route) übergeben kein `opts` und verwenden
standardmäßig `'client_close'`. Der Reaper übergibt `{ reason: 'idle_timeout' }`.

### 4.5 Lebenszyklus des Reapers

```typescript
// Innerhalb des createHttpAcpBridge-Closures:

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
        `qwen serve: räume Leerlauf-Session ${JSON.stringify(id)} ` +
          `(Leerlauf ${Math.round(idle / 1000)}s, Schwellwert ${Math.round(resolvedIdleTimeoutMs / 1000)}s)`,
      );
      // Übergebe `undefined`-Kontext (kein Client) und `{ reason }`-Optionen.
      bridgeImpl
        .closeSession(id, undefined, { reason: 'idle_timeout' })
        .catch((err) => {
          writeStderrLine(
            `qwen serve: Session-Reaper konnte ${JSON.stringify(id)} nicht schließen: ${String(err)}`,
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

Hinweis: `bridgeImpl` bezieht sich auf das Bridge-Objekt, das von `createHttpAcpBridge`
zurückgegeben wird, sodass `closeSession` vollen Zugriff auf den closure-scoped Zustand hat.
In der Praxis wird dies als direkter Aufruf der closure-internen Funktion `closeSessionImpl`
implementiert.

**Integration in den Lebenszyklus:**

- `startSessionReaper()` wird zur Bridge-Erstellungszeit aufgerufen (nach der
  Optionsvalidierung, parallel zur vorhandenen `channelIdleTimeoutMs`-Einrichtung).
- `stopSessionReaper()` wird sowohl in `shutdown()` als auch in `killAllSync()` aufgerufen.

### 4.6 Interaktion mit vorhandenen `closeSession`-Aufrufern

| Aufrufer                       | Auswirkungen                                                         |
| ------------------------------ | -------------------------------------------------------------------- |
| `DELETE /session/:id`-Route    | Keine – kein `opts` übergeben, Standardgrund `reason: 'client_close'` |
| Session Reaper (dieser Entwurf) | Übergibt `opts: { reason: 'idle_timeout' }`                         |
| `detachClient` verzögerte Räumung | Ruft `killSession` auf (nicht `closeSession`), keine Auswirkungen     |
| `channel.exited`-Handler       | Veröffentlicht `session_died`, keine Auswirkungen                     |
| `shutdown()`                   | Veröffentlicht `session_died` mit Grund `daemon_shutdown`, keine Auswirkungen |

### 4.7 Nebenläufigkeitssicherheit

Der Reaper-Callback läuft auf der Node.js-Ereignisschleife. Wichtige Überlegungen:

- **`for...of`-Iteration ist synchron.** Der Reaper wertet das Leerlauf-Prädikat jedes
  Eintrags synchron aus und feuert dann `closeSession(...).catch(...)` für passende
  Einträge. Kein `await` im Schleifenkörper – alle Schließungen werden in einer einzigen
  Microtask-Grenze ausgelöst, dann wird die Schleife beendet.
- **`byId.delete` ist verzögert.** Innerhalb von `closeSession` läuft `byId.delete` NACH
  dem ersten `await` (`notifyAgentSessionClose`). Das bedeutet, dass Löschungen in
  Microtasks erfolgen, NACHDEM die `for...of`-Schleife abgeschlossen ist. Da jede
  `closeSession` auf einem eigenen Schlüssel operiert, gibt es keine Alias-Probleme.
  Und da `for...of` die Iteration bereits beendet hat, ist eine Löschung während der
  Iteration kein Problem.
- **Double-Close-Race.** Wenn ein Client für dieselbe Session `DELETE /session/:id`
  aufruft, zwischen der Prädikatsprüfung des Reapers und der asynchronen Ausführung von
  `closeSession`, wird die `closeSession` des Reapers einen `SessionNotFoundError` werfen
  (vom `.catch()` abgefangen). Sicher.
- **Wiederverbindungs-Race.** Wenn ein Client zu einer Session wieder verbindet (clientId
  registriert / SSE öffnet), zwischen der Prädikatsprüfung des Reapers und der Ausführung
  von `closeSession`, wird `closeSession` trotzdem fortfahren und die Session schließen.
  Der Client erhält `session_closed` und muss neu laden. Dieses Fenster ist extrem schmal
  (ein synchroner `setInterval`-Tick) und die Konsequenz ist harmlos – kein Datenverlust,
  nur eine Aufforderung zum Neuladen. Die Standard-TTL von 30 Minuten macht dies extrem
  selten.
- Ein gleichzeitiger `spawnOrAttach`, der eine neue Session erstellt, während der Reaper
  scannt, wird nicht gesehen (wir iterieren über `byId`-Einträge zu Beginn jedes Ticks).
  Dies ist sicher – neue Sessions sind frisch und werden den Leerlauf-Schwellwert nicht
  erreichen.

### 4.8 Änderung des Drahtformats

Das `data.reason`-Feld des `session_closed`-Ereignisses existiert bereits mit dem Wert
`'client_close'`. Wir fügen zwei neue Werte hinzu:

- `'idle_timeout'` – vom Leerlauf-Reaper ausgegeben (Auffangnetz für abgestürzte Clients)
- `'last_client_detached'` – vom „Schließen beim letzten Trennen" ausgegeben (normaler
  Tab-Schließvorgang)

Dies ist abwärtskompatibel – vorhandener SDK-Code, der auf `reason === 'client_close'`
prüft, wird die neuen Werte einfach nicht treffen, und der generische Terminal-Frame-Handler
(`isTerminalLifecycleEvent`) behandelt `session_closed` bereits unabhängig vom Grund.

---

## 5. Testplan

### 5.1 Unit-Tests (`bridge.test.ts`)

| #   | Test                                                    | Beschreibung                                                                                                                                                                              |
| --- | ------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Leerlauf-Session wird nach Zeitüberschreitung geräumt    | Session erstellen, Zeit über `sessionIdleTimeoutMs` hinaus vorspulen, Reaper-Tick auslösen, prüfen, ob Session aus `byId` entfernt und `session_closed`-Ereignis mit `reason: 'idle_timeout'` veröffentlicht wurde |
| 2   | Session mit aktivem Prompt wird NICHT geräumt            | Session erstellen, Prompt starten, Zeit vorspulen, prüfen, ob Session den Reaper-Tick überlebt                                                                                            |
| 3   | Session mit aktivem SSE-Abonnenten wird NICHT geräumt    | Session erstellen, ihren EventBus abonnieren, Zeit vorspulen, prüfen, ob Session überlebt                                                                                                 |
| 4   | Session mit registriertem Client wird NICHT geräumt      | Session erstellen, eine clientId registrieren, Zeit vorspulen, prüfen, ob Session überlebt                                                                                                |
| 5   | Reaper deaktiviert, wenn Intervall = 0                   | `sessionReapIntervalMs: 0` übergeben, prüfen, ob kein `setInterval` aktiviert ist                                                                                                         |
| 6   | Reaper deaktiviert, wenn Zeitüberschreitung = 0          | `sessionIdleTimeoutMs: 0` übergeben, prüfen, ob kein `setInterval` aktiviert ist                                                                                                          |
| 7   | Reaper wird beim Herunterfahren gestoppt                 | `shutdown()` aufrufen, prüfen, ob `clearInterval` aufgerufen wurde                                                                                                                        |
| 8   | Standardgrund von closeSession ist 'client_close'        | `closeSession` ohne expliziten Grund aufrufen, prüfen, ob das veröffentlichte Ereignis `reason: 'client_close'` hat                                                                       |
| 9   | closeSession mit explizitem Grund                        | `closeSession` mit `reason: 'idle_timeout'` aufrufen, veröffentlichtes Ereignis prüfen                                                                                                    |
| 10  | Mehrere Leerlauf-Sessions werden in einem Tick geräumt   | 3 Leerlauf-Sessions erstellen, Zeit vorspulen, Tick auslösen, prüfen, ob alle 3 geräumt wurden                                                                                            |
| 11  | Session mit Heartbeat innerhalb der TTL überlebt         | Session erstellen, Heartbeat aufzeichnen, Zeit auf knapp unter TTL vorspulen, prüfen, ob Session überlebt                                                                                  |
| 12  | Channel-Leerlauf-Timer wird nach Räumung der letzten Session ausgelöst | 1 Session (letzte auf dem Channel) erstellen, räumen, prüfen, ob `startIdleTimer` auf dem Channel aufgerufen wurde                                                    |

### 5.2 Integrationstests (`server.test.ts`)

| #   | Test                                                                    | Beschreibung                                                                                       |
| --- | ----------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| 1   | `GET /health?deep=1` zeigt die durch den Reaper bereinigte Session-Anzahl | Daemon starten, Sessions erstellen, Zeit vorspulen, prüfen, ob der Health-Endpunkt eine reduzierte Anzahl anzeigt |
| 2   | SSE-Abonnent erhält `session_closed` mit `reason: 'idle_timeout'`        | SSE öffnen, trennen, vor TTL wieder verbinden, dann TTL ablaufen lassen, Ereignis prüfen           |
---

## 6. Konfigurationsstandards

| Option                  | Standard           | Begründung                                                                                                   |
| ----------------------- | ------------------ | ----------------------------------------------------------------------------------------------------------- |
| `sessionReapIntervalMs` | 60.000 (1 Min.)    | Häufig genug, um lange Ansammlungen zu verhindern, günstig genug (einfacher Map-Scan), um oft ausgeführt zu werden |
| `sessionIdleTimeoutMs`  | 1.800.000 (30 Min.)| Großzügige Nachfrist für die Wiederverbindung. Entspricht `ConnectionRegistry.idleTtlMs` für Konsistenz im Gedankenmodell |

---

## 7. Beobachtbarkeit

- **stderr-Log**: `qwen serve: reaping idle session "<id>" (idle for Nms)` bei jedem Bereinigen, in Übereinstimmung mit der bestehenden `qwen serve:`-Präfix-Konvention.
- **Telemetrie-Ereignis**: `session.close` mit Operation `qwen-code.daemon.bridge.operation: 'session.close'` (nutzt bestehenden `closeSession`-Telemetriepfad wieder).
- **Telemetrie-Metrik**: `sessionLifecycle('close')` (nutzt bestehenden Zähler wieder).
- **SSE-Ereignis**: `session_closed` mit `data.reason: 'idle_timeout'`.

---

## 8. Folgearbeiten (außerhalb des Umfangs)

| Element                            | Beschreibung                                                                     | Priorität |
| ------------------------------- | ------------------------------------------------------------------------------- | -------- |
| LRU-Verdrängung bei `maxSessions`   | Statt neue Sessions abzulehnen, die am längsten inaktive Session verdrängen | P1       |
| EventBus-Ring-Kompaktierung        | Ring für Sessions mit 0 Abonnenten verkleinern, um Speicher zu sparen                  | P2       |
| RSS-basierter adaptiver Druck     | `process.memoryUsage().rss` überwachen und die Leerlauf-TTL senken, wenn der Speicher knapp ist | P2       |
| Heartbeat-basierte Client-Lebendigkeit | Clients automatisch abmelden, die N aufeinanderfolgende Heartbeat-Fenster verpassen               | P2       |

---

## 9. Risiken und Gegenmaßnahmen

| Risiko                                                                            | Gegenmaßnahme                                                                                                                                                                        |
| ------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Bereiniger schließt eine Session, mit der sich ein Headless-Client gerade wieder verbinden will         | 30-minütige Standard-TTL ist großzügig; Headless-Clients sollten Heartbeats senden. Das Festplattenprotokoll bleibt erhalten — `session/load` stellt es wieder her.                                            |
| `closeSession` innerhalb des Bereinigers wirft einen Fehler und vergiftet die Scanschleife                    | Jeder close hat seinen eigenen `.catch()` — ein Fehler blockiert nicht die anderen                                                                                                            |
| Bereiniger-Iteration über `byId` während gleichzeitigen `closeSession` von einem anderen Pfad | ES2015-Map-Iteration toleriert das Löschen aktueller/vorheriger Schlüssel. Doppeltes Schließen ist idempotent (`byId.get` gibt undefined zurück → `SessionNotFoundError` wird von reaper's `.catch` abgefangen). |
| Leistung beim Scannen von 20 Sessions alle 60s                                   | Trivial — 20 Map-Lesevorgänge + 4 Feldprüfungen pro Session. Keine E/A.                                                                                                                             |
| Interaktion mit dem Kanal-Leerlauftimer                                                  | Wenn die letzte Session bereinigt wird, ruft `closeSession` bereits `startIdleTimer` auf dem Kanal auf. Keine zusätzliche Logik erforderlich.                                                        |