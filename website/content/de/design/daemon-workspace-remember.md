# Daemon Workspace Remember — Sitzungslose Memory-Ingestion

> **Status**: Vorgeschlagen — Implementierung in [PR #5884](https://github.com/QwenLM/qwen-code/pull/5884) (Branch `codex/sessionless-daemon-remember`), noch nicht gemerged.

---

## 1. Problemstellung

Das Managed-Memory-System des Daemons (Auto-Extraktion, Dream Agent) benötigte zuvor eine aktive Chat-Session, um Memories zu schreiben. Dies verursachte zwei Probleme:

1. **Settings UI kann keine Memories schreiben** — Das Web-Shell-Einstellungspanel muss benutzerdefinierte Fakten (z. B. "immer TypeScript strict mode verwenden") speichern, ohne eine sichtbare Chat-Session zu erstellen oder zu verunreinigen.
2. **Verschmutzung der Session-Liste** — Das Erstellen einer Einweg-Session nur zum Ausführen eines `/remember`-Befehls fügt der Session-Liste Rauschen hinzu und verwirrt Benutzer, die Geister-Sessions sehen, die sie nie geöffnet haben.

Die Lösung ist ein **sitzungsloser Remember-Endpunkt auf Workspace-Ebene**, der Memory-Schreibaufgaben in eine Warteschlange stellt, sie über einen versteckten `AgentHeadless`-Fork ausführt (keine Session wird erstellt) und den Status über Polling verfügbar macht.

---

## 2. Design-Übersicht

```
┌──────────────┐  POST /workspace/memory/remember   ┌─────────────────────────┐
│  SDK / UI    │ ─────────────────────────────────►  │  workspace-remember.ts  │
│  client      │                                     │  (WorkspaceRemember-    │
│              │  GET  /workspace/memory/remember/:id │   TaskLane)             │
│              │ ─────────────────────────────────►  │                         │
└──────────────┘                                     └────────────┬────────────┘
                                                                  │ bridge.runWorkspaceMemoryRemember()
                                                     ┌────────────▼────────────┐
                                                     │  HttpAcpBridge          │
                                                     │  extMethod(             │
                                                     │    'qwen/control/       │
                                                     │     workspace/memory/   │
                                                     │     remember')          │
                                                     └────────────┬────────────┘
                                                                  │ ACP stdio (JSON-RPC)
                                                     ┌────────────▼────────────┐
                                                     │  qwen --acp child       │
                                                     │  (QwenAgent.extMethod)  │
                                                     │  → runManagedRemember-  │
                                                     │    ByAgent (forked)     │
                                                     └─────────────────────────┘
```

Wichtige Eigenschaften:

- **Keine Session erforderlich** — Die Bridge stellt sicher, dass das ACP-Child gespawnt wird, erstellt/lädt/setzt jedoch keine ACP-Session fort.
- **Serielle Ausführung** — Aufgaben werden nacheinander über eine Promise-Chain-Lane ausgeführt, was gleichzeitige Schreibzugriffe auf das Managed-Memory-Dateisystem verhindert.
- **Versteckt** — Der geforkte Agent läuft mit `name: 'managed-auto-memory-remember'` und ist für die Session-Liste unsichtbar.
- **Capability-advertised** — `workspace_memory_remember` in der `/capabilities`-Antwort des Daemons, mit unterstützten `modes: ['workspace', 'clean']`.

---

## 3. API-Endpunkte

### 3.1 POST /workspace/memory/remember

Eine neue Remember-Aufgabe in die Warteschlange stellen.

**Request:**

```json
{
  "content": "The user prefers dark mode in all editors",
  "contextMode": "workspace"
}
```

| Feld          | Typ      | Erforderlich | Beschreibung                                                                                                  |
| ------------- | -------- | ------------ | ------------------------------------------------------------------------------------------------------------- |
| `content`     | `string` | ja           | Der zu speichernde Fakt. Max. 64 KiB (UTF-8-Bytelänge).                                                       |
| `contextMode` | `string` | nein         | `"workspace"` (Standard) — Agent sieht Workspace-Memory-Kontext. `"clean"` — Agent sieht keinen vorherigen Benutzer-Memory. |

**Headers:**

- Authorization: Bearer <token> (erforderlich)
- X-Qwen-Client-Id: <clientId> (optional — schränkt die Sichtbarkeit der Aufgabe ein)

**Response 202 Accepted:**

```json
{
  "taskId": "remember-a1b2c3d4-...",
  "status": "queued",
  "contextMode": "workspace",
  "createdAt": "2026-06-01T12:00:00.000Z",
  "updatedAt": "2026-06-01T12:00:00.000Z"
}
```

**Error Responses:**

| Status | Code                         | Bedingung                                         |
| ------ | ---------------------------- | ------------------------------------------------- |
| 400    | `invalid_content`            | Fehlender, leerer oder übergroßer Content         |
| 400    | `invalid_context_mode`       | Unbekannter contextMode-Wert                      |
| 400    | `invalid_client_id`          | X-Qwen-Client-Id nicht bei der Bridge registriert |
| 409    | `managed_memory_unavailable` | Managed Memory nicht für Workspace konfiguriert   |
| 429    | `remember_queue_full`        | Bereits 16 ausstehende Aufgaben in der Warteschlange |
| 500    | `remember_failed`            | Verfügbarkeitsprüfung hat unerwartet einen Fehler geworfen |

### 3.2 GET /workspace/memory/remember/:taskId

Aufgabenstatus abfragen.

**Headers:**

- Authorization: Bearer <token> (erforderlich)
- X-Qwen-Client-Id: <clientId> (optional — muss mit dem Ursprung übereinstimmen, um die Aufgabe zu sehen)

**Response 200 OK (queued/running):**

```json
{
  "taskId": "remember-a1b2c3d4-...",
  "status": "queued",
  "contextMode": "workspace",
  "createdAt": "2026-06-01T12:00:00.000Z",
  "updatedAt": "2026-06-01T12:00:00.000Z",
  "result": null,
  "error": null
}
```

- `status` ist `"queued"` oder `"running"`, abhängig davon, ob die Aufgabe mit der Ausführung begonnen hat.
- `result`: nur vorhanden (nicht null), wenn `status === "completed"`.
- `error`: nur vorhanden (nicht null), wenn `status === "failed"`.

**Response 200 OK (completed):**

```json
{
  "taskId": "remember-a1b2c3d4-...",
  "status": "completed",
  "contextMode": "workspace",
  "createdAt": "2026-06-01T12:00:00.000Z",
  "updatedAt": "2026-06-01T12:00:05.000Z",
  "result": {
    "summary": "Saved dark-mode preference to user memory.",
    "filesTouched": ["~/.qwen/memories/user/user.md"],
    "touchedScopes": ["user"]
  }
}
```

**Response 200 OK (failed):**

```json
{
  "taskId": "remember-a1b2c3d4-...",
  "status": "failed",
  "contextMode": "workspace",
  "createdAt": "2026-06-01T12:00:00.000Z",
  "updatedAt": "2026-06-01T12:00:03.000Z",
  "error": {
    "code": "remember_path_escape",
    "message": "Remember agent touched a path outside managed memory."
  }
}
```

**Error Responses:**

| Status | Code                      | Bedingung                                            |
| ------ | ------------------------- | ---------------------------------------------------- |
| 400    | `invalid_client_id`       | X-Qwen-Client-Id nicht registriert                   |
| 404    | `remember_task_not_found` | Aufgabe existiert nicht oder gehört einem anderen Client |

---

## 4. Aufgaben-Lifecycle

```
            enqueue()
               │
               ▼
  ┌─────────────────────┐
  │       queued         │   (awaiting serial lane slot)
  └──────────┬──────────┘
             │  lane picks up
             ▼
  ┌─────────────────────┐
  │       running        │   (bridge.runWorkspaceMemoryRemember in progress)
  └──────────┬──────────┘
             │
     ┌───────┴────────┐
     ▼                ▼
┌──────────┐    ┌──────────┐
│ completed│    │  failed  │
└──────────┘    └──────────┘
```

- **queued** — Aufgabe wurde erstellt und wartet in der seriellen Lane.
- **running** — Der Bridge-Aufruf ist unterwegs; der geforkte Agent wird ausgeführt.
- **completed** — Agent erfolgreich beendet; `result` ist befüllt.
- **failed** — Agent hat einen Fehler geworfen oder ein Timeout erreicht; `error` ist befüllt.

Die Lane speichert insgesamt bis zu **1000 Aufgaben** (terminale Aufgaben werden bei Erreichen des Limits nach FIFO evictet). Es können jederzeit höchstens **16 Aufgaben** ausstehend sein (queued + running).

---

## 5. Implementierungsdetails

### 5.1 Serial Task Lane (WorkspaceRememberTaskLane)

Befindet sich in packages/cli/src/serve/workspace-remember.ts. Verwaltet eine Map<taskId, TaskRecord> und eine einzelne Promise-Chain (this.tail). Jeder enqueue()-Aufruf hängt eine run-Funktion an, die:

1. Setzt den Status auf `running`.
2. Ruft `bridge.runWorkspaceMemoryRemember({ content, contextMode })` auf.
3. Bei Erfolg: Setzt den Status auf `completed`, befüllt `result` und veröffentlicht das `memory_changed`-Event.
4. Bei Fehlschlag: Setzt den Status auf `failed` und befüllt `error` mit einem stabilen öffentlichen Error-Code.

Die Lane garantiert eine strikte Serialisierung — es wird jeweils nur eine Remember-Aufgabe ausgeführt, was gleichzeitige Dateisystem-Schreibzugriffe auf Managed Memory verhindert.

### 5.2 Bridge Layer (HttpAcpBridge)

Zwei Methoden zu BridgeInterface (packages/acp-bridge/src/bridgeTypes.ts) hinzugefügt:

- isWorkspaceMemoryRememberAvailable() — ruft die ext-method qwen/control/workspace/memory/remember/availability auf dem Child auf. Gibt boolean zurück. Wird für fast-fail 409 vor dem Einreihen verwendet.
- runWorkspaceMemoryRemember(request) — ruft die ext-method qwen/control/workspace/memory/remember auf. Timeout bei **300 s** (WORKSPACE_MEMORY_REMEMBER_TIMEOUT_MS). Erstellt oder lädt KEINE Session.

Beide Methoden rufen ensureChannel() auf (spawnt das ACP-Child bei Bedarf) und starten danach den Idle-Timer neu, wenn keine Sessions aktiv sind.

### 5.3 ACP Child Execution (QwenAgent.extMethod)

In packages/cli/src/acp-integration/acpAgent.ts, der Handler für workspaceMemoryRemember:

1. Validiert `content` (nicht-leerer String, ≤64 KiB) und `contextMode`.
2. Prüft `config.isManagedMemoryAvailable()`.
3. Ruft `runManagedRememberByAgent()` mit einem **295 s** Abort-Signal auf (`WORKSPACE_MEMORY_REMEMBER_CHILD_TIMEOUT_MS` — etwas weniger als der Bridge-Timeout, um sicherzustellen, dass das Child vor dem Bridge-Backstop abbricht).

### 5.4 Core Remember Logic (packages/core/src/memory/remember.ts)

`runManagedRememberByAgent()`:

1. Erstellt einen sauberen Memory-System-Prompt aus dem Managed-Memory-Index des Projekts.
2. Entfernt optional vorherige Benutzer-Memories (wenn `contextMode === 'clean'`).
3. Erstellt eine `memoryScopedAgentConfig`, die Datei-I/O ausschließlich auf Memory-Verzeichnisse beschränkt.
4. Führt einen **geforkten Headless-Agenten** (`runForkedAgent`) aus mit:
   - Name: `managed-auto-memory-remember`
   - Tools: `read_file`, `grep`, `ls`, `write_file`, `edit`
   - Max turns: 6
   - Max time: 5 Minuten
5. Validiert, dass alle berührten Dateien innerhalb der erlaubten Memory-Pfade liegen (`classifyTouchedScopes`). Wirft `remember_path_escape`, wenn der Agent außerhalb der Memory-Verzeichnisse geschrieben hat.
6. Baut Memory-Indizes für alle berührten Scopes neu auf.
7. Gibt `{ summary, filesTouched, touchedScopes }` zurück.

### 5.5 Memory-Scoped Agent Config (packages/core/src/memory/memory-scoped-agent-config.ts)

`createMemoryScopedAgentConfig()` erstellt einen berechtigungsbegrenzten Config-Wrapper, der:

- **Write-Tools** (`write_file`, `edit`): nur innerhalb des Projekt-Auto-Memory-Roots oder des Benutzer-Memory-Roots (`~/.qwen/memories`) erlaubt.
- **Read-Tools** (`read_file`, `grep`, `ls`): wenn `restrictReadsToMemoryPaths` true ist, nur innerhalb der Memory-Verzeichnisse erlaubt.
- **Shell**: standardmäßig deaktiviert; wenn aktiviert, sind nur Read-Only-Befehle erlaubt.
- Löst Symlinks auf, um Path-Traversal-Escapes zu verhindern.

---

## 6. Events

### memory_changed (scope: managed)

Wird auf dem Daemon-SSE-Event-Stream (GET /session/:id/events) als memory_changed-Event mit scope: 'managed' veröffentlicht, wenn eine Remember-Aufgabe erfolgreich abgeschlossen wird. Clients, die den Session-spezifischen Event-Stream abonniert haben, erhalten diese Benachrichtigung.

**Payload:**

```json
{
  "type": "memory_changed",
  "data": {
    "scope": "managed",
    "source": "workspace_memory_remember",
    "taskId": "remember-a1b2c3d4-...",
    "touchedScopes": ["user", "project"]
  }
}
```

| Feld            | Typ         | Beschreibung                                              |
| --------------- | ----------- | --------------------------------------------------------- |
| `scope`         | `"managed"` | Unterscheidet von dateibasierten `memory_changed`-Events  |
| `source`        | `string`    | Immer `"workspace_memory_remember"` für dieses Feature    |
| `taskId`        | `string`    | Korreliert mit der von POST zurückgegebenen Aufgabe       |
| `touchedScopes` | `string[]`  | Welche Memory-Scopes beschrieben wurden: `"user"`, `"project"` |

Die originatorClientId (falls zum POST-Zeitpunkt angegeben) wird an das Event-Envelope angehängt, damit der Event-Bus sie an den Ursprungs-Client weiterleiten kann.

---

## 7. Error Handling

### Error Codes

| Code                         | Ursprung            | Bedeutung                                                |
| ---------------------------- | ------------------- | -------------------------------------------------------- |
| `invalid_content`            | HTTP route          | Content fehlt, ist leer oder überschreitet 64 KiB        |
| `invalid_context_mode`       | HTTP route          | contextMode nicht `"workspace"` oder `"clean"`           |
| `invalid_client_id`          | HTTP route          | Client-Id-Header nicht im bekannten Set der Bridge       |
| `managed_memory_unavailable` | Bridge / ACP child  | Workspace nicht für Managed Memory konfiguriert          |
| `remember_queue_full`        | Task lane           | Limit von 16 ausstehenden Aufgaben erreicht              |
| `remember_path_escape`       | Core remember logic | Agent hat in einen Pfad außerhalb der Managed-Memory-Verzeichnisse geschrieben |
| `remember_failed`            | Catch-all           | Unklassifizierter Agent-Fehler, Timeout oder interner Fehler |
| `remember_task_not_found`    | HTTP route          | GET für unbekannte oder nicht autorisierte Aufgaben-ID   |

### Timeout Chain

```
Agent forked runner:   5 min maxTimeMinutes
Child abort signal:  295 s  (WORKSPACE_MEMORY_REMEMBER_CHILD_TIMEOUT_MS)
Bridge timeout:      300 s  (WORKSPACE_MEMORY_REMEMBER_TIMEOUT_MS)
```

Das Child bricht ab, bevor die Bridge einen Timeout erreicht, sodass ein sauberer Fehler propagiert wird und kein Timeout auf Transportebene.

---

## 8. SDK Integration

### TypeScript SDK (@qwen-code/sdk-typescript)

Zwei neue Methoden auf DaemonClient:

```typescript
// Queue a remember task
const task = await client.rememberWorkspaceMemory(
  'The project uses pnpm workspaces',
  { contextMode: 'workspace' },
);
// task.taskId, task.status === 'queued'

// Poll until terminal
const result = await client.getWorkspaceMemoryRememberTask(task.taskId);
// result.status === 'completed' | 'failed'
```

### UI Event Normalization

Der SDK-Normalizer mappt das rohe memory_changed-SSE-Event (mit scope: 'managed') auf ein DaemonUiWorkspaceMemoryChangedEvent:

```typescript
{
  type: 'workspace.memory.changed',
  scope: 'managed',
  source: 'workspace_memory_remember',
  taskId: 'remember-...',
  touchedScopes: ['user', 'project']
}
```

Dies erweitert den bestehenden workspace.memory.changed-Event-Typ, der zuvor nur scope: 'workspace' | 'global' für dateibasierte QWEN.md-Schreibvorgänge enthielt.

---

## 9. Design-Rationale

### Warum sitzungslos?

Der /remember-Slash-Befehl in der CLI funktioniert bereits innerhalb einer Session. Die Settings UI und programmatische SDK-Caller sollten jedoch keine Session erstellen müssen, nur um einen Fakt zu persistieren. Eine Session impliziert Konversationshistorie, Turn-Tracking und Sichtbarkeit in der Session-Liste — nichts davon trifft auf einen Fire-and-Forget-Memory-Schreibvorgang zu.

### Warum serielle Ausführung?

Das Managed-Memory-System speichert Fakten in Markdown-Dateien mit Indizes. Gleichzeitige Schreibzugriffe von mehreren Remember-Aufgaben könnten Indizes beschädigen oder Merge-Konflikte erzeugen. Eine single-threaded Lane ist die einfachste korrekte Lösung.

### Warum eine Aufgaben-Warteschlange (nicht synchron)?

Memory-Schreibvorgänge beinhalten einen LLM-Agenten, der entscheidet, wo und wie der Fakt gespeichert wird (Wahl zwischen User- und Project-Scope, Auswahl der richtigen Datei, Formatierung). Dies dauert 2–30 Sekunden. Eine synchrone HTTP-Anfrage würde entweder einen Timeout erzeugen oder den Client blockieren. Das Async-Queue-+Poll-Muster hält den HTTP-Vertrag einfach und ermöglicht es Clients, eine Fortschritts-UI anzuzeigen.

### Warum contextMode?

- `"workspace"` (Standard) — Der Remember-Agent sieht bestehende Memories als Kontext, was es ihm ermöglicht, vorhandene Einträge zu deduplizieren oder zu aktualisieren.
- `"clean"` — Der Agent sieht keine vorherigen Benutzer-Memories, nützlich wenn der Caller einen frischen Schreibvorgang ohne Dedup-Logik erzwingen möchte (z. B. Bulk-Import).

### Warum Lesezugriffe auf Memory-Pfade beschränken?

Der Remember-Agent sollte nur innerhalb der Managed-Memory-Verzeichnisse lesen/schreiben. Dies verhindert ein Prompt-Injection-Szenario, bei dem manipulierter Content den Agenten dazu bringt, sensible Projektdateien zu lesen und in Memory-Einträge durchsickern zu lassen.