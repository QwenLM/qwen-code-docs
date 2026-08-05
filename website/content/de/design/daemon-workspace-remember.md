# Daemon Workspace Memory Tasks — Sitzungsloser verwalteter Speicher

> **Status**: Vorgeschlagen — Implementierung in [PR #5884](https://github.com/QwenLM/qwen-code/pull/5884) (Branch `codex/sessionless-daemon-remember`), noch nicht gemerged.

---

## 1. Problemstellung

Das Managed-Memory-System des Daemons (Auto-Extraktion, Dream-Agent) benötigte zuvor eine aktive Chat-Session, um Memories zu schreiben. Dies verursachte zwei Probleme:

1. **Settings-UI kann keine Memories schreiben** — Das Einstellungen-Panel der Web-Shell muss benutzerdefinierte Fakten (z. B. "immer TypeScript strict mode verwenden") speichern, ohne eine sichtbare Chat-Session zu erstellen oder zu verunreinigen.
2. **Verschmutzung der Session-Liste** — Das Erstellen einer Wegwerf-Session nur zum Ausführen eines `/remember`-Befehls fügt der Session-Liste unnötige Einträge hinzu und verwirrt Benutzer, die Geister-Sessions sehen, die sie nie geöffnet haben.

Die Lösung ist eine **sitzungslose Memory-Task-API auf Workspace-Ebene**, die Remember-, Forget- und Dream-Tasks in eine Warteschlange stellt, sie ohne Erstellung einer sichtbaren Session ausführt und den Status über Polling verfügbar macht.

---

## 2. Design-Übersicht

```
┌──────────────┐  POST /workspace/memory/{task}      ┌─────────────────────────┐
│  SDK / UI    │ ─────────────────────────────────►  │  workspace-remember.ts  │
│  client      │                                     │  (WorkspaceRemember-    │
│              │  GET  /workspace/memory/{task}/:id  │   TaskLane)             │
│              │ ─────────────────────────────────►  │                         │
└──────────────┘                                     └────────────┬────────────┘
                                                                  │ bridge.runWorkspaceMemory*
                                                     ┌────────────▼────────────┐
                                                     │  HttpAcpBridge          │
                                                     │  extMethod(             │
                                                     │    'qwen/control/       │
                                                     │     workspace/memory/   │
                                                     │     {task}')            │
                                                     └────────────┬────────────┘
                                                                  │ ACP stdio (JSON-RPC)
                                                     ┌────────────▼────────────┐
                                                     │  qwen --acp child       │
                                                     │  (QwenAgent.extMethod)  │
                                                     │  → remember / forget /  │
                                                     │    dream core logic     │
                                                     └─────────────────────────┘
```

Wichtige Eigenschaften:

- **Keine Session erforderlich** — Die Bridge stellt sicher, dass das ACP-Child gespawnt wird, erstellt/lädt/setzt jedoch keine ACP-Session fort.
- **Serielle Ausführung** — Tasks werden nacheinander über eine Promise-Chain-Lane ausgeführt, was gleichzeitige Schreibvorgänge in das Managed-Memory-Dateisystem verhindert.
- **Versteckt** — Remember/Dream laufen über versteckte Agents und Forget verwendet eine versteckte Memory-Konfiguration; keine dieser Operationen erstellt sichtbare Sessions.
- **Capability-advertised** — `workspace_memory_remember`, `workspace_memory_forget` und `workspace_memory_dream` in der `/capabilities`-Antwort des Daemons. Remember advertised zusätzlich `modes: ['workspace', 'clean']`.

---

## 3. API-Endpunkte

### 3.1 `POST /workspace/memory/remember`

Einen neuen Remember-Task in die Warteschlange stellen.

**Request:**

```json
{
  "content": "The user prefers dark mode in all editors",
  "contextMode": "workspace"
}
```

| Feld          | Typ      | Erforderlich | Beschreibung                                                                                                  |
| ------------- | -------- | ------------ | ------------------------------------------------------------------------------------------------------------- |
| `content`     | `string` | ja           | Der zu merkende Fakt. Max. 64 KiB (UTF-8-Byte-Länge).                                                         |
| `contextMode` | `string` | nein         | `"workspace"` (Standard) — Agent sieht den Workspace-Memory-Kontext. `"clean"` — Agent sieht keinen vorherigen User-Memory. |

**Headers:**

- `Authorization: Bearer <token>` (erforderlich)
- `X-Qwen-Client-Id: <clientId>` (optional — schränkt die Task-Sichtbarkeit ein)

**Response `202 Accepted`:**

```json
{
  "taskId": "remember-a1b2c3d4-...",
  "status": "queued",
  "contextMode": "workspace",
  "createdAt": "2026-06-01T12:00:00.000Z",
  "updatedAt": "2026-06-01T12:00:00.000Z"
}
```

**Error-Responses:**

| Status | Code                         | Bedingung                                         |
| ------ | ---------------------------- | ------------------------------------------------- |
| 400    | `invalid_content`            | Fehlender, leerer oder zu großer Content          |
| 400    | `invalid_context_mode`       | Unbekannter contextMode-Wert                      |
| 400    | `invalid_client_id`          | X-Qwen-Client-Id nicht bei der Bridge registriert |
| 409    | `managed_memory_unavailable` | Managed Memory nicht für Workspace konfiguriert   |
| 429    | `remember_queue_full`        | Bereits 16 ausstehende Tasks in der Warteschlange |
| 500    | `remember_failed`            | Verfügbarkeitsprüfung hat unerwartet einen Fehler geworfen |

### 3.2 `GET /workspace/memory/remember/:taskId`

Task-Status pollen.

**Headers:**

- `Authorization: Bearer <token>` (erforderlich)
- `X-Qwen-Client-Id: <clientId>` (optional — muss mit dem Ersteller übereinstimmen, um den Task zu sehen)

**Response `200 OK` (queued/running):**

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

- `status` ist `"queued"` oder `"running"`, abhängig davon, ob der Task mit der Ausführung begonnen hat.
- `result`: nur vorhanden (nicht null), wenn `status === "completed"`.
- `error`: nur vorhanden (nicht null), wenn `status === "failed"`.

**Response `200 OK` (completed):**

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

**Response `200 OK` (failed):**

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

**Error-Responses:**

| Status | Code                      | Bedingung                                            |
| ------ | ------------------------- | ---------------------------------------------------- |
| 400    | `invalid_client_id`       | X-Qwen-Client-Id nicht registriert                   |
| 404    | `remember_task_not_found` | Task existiert nicht oder gehört zu einem anderen Client |

---

### 3.3 `POST /workspace/memory/forget`

Einen Forget-Task in die Warteschlange stellen. Der Daemon wählt passende Managed-Auto-Memory-Einträge aus und entfernt sie, ohne eine Session zu erstellen.

**Request:**

```json
{
  "query": "old preference"
}
```

| Feld    | Typ      | Erforderlich | Beschreibung                                                              |
| ------- | -------- | ------------ | ------------------------------------------------------------------------- |
| `query` | `string` | ja           | Natürlich-sprachliche Beschreibung zum Vergessen. Max. 64 KiB (UTF-8-Byte-Länge). |

Die initiale Response ist `202 Accepted` mit einer `forget-...`-Task-ID. `GET /workspace/memory/forget/:taskId` pollen, bis ein Terminal-Status erreicht ist.

**Completed-Result:**

```json
{
  "summary": "Forgot 1 memory entry.",
  "removedEntries": [
    {
      "topic": "project",
      "summary": "old preference",
      "filePath": "/path/to/memory.md"
    }
  ],
  "touchedTopics": ["project"],
  "touchedScopes": ["project"]
}
```

### 3.4 `GET /workspace/memory/forget/:taskId`

Forget-Task-Status pollen. Die Form entspricht dem Remember-Task-Polling, mit der Ausnahme, dass es kein `contextMode`-Feld gibt und terminale Fehler `forget_task_not_found` für unbekannte oder nicht autorisierte Task-IDs verwenden.

### 3.5 `POST /workspace/memory/dream`

Einen Dream-Task in die Warteschlange stellen. Der Daemon führt den Managed-Auto-Memory-Dream-Compaction-Flow aus, ohne eine Session zu erstellen.

**Request:** Leeres JSON-Objekt oder kein Body.

Die initiale Response ist `202 Accepted` mit einer `dream-...`-Task-ID. `GET /workspace/memory/dream/:taskId` pollen, bis ein Terminal-Status erreicht ist.

**Completed-Result:**

```json
{
  "summary": "Managed auto-memory dream completed.",
  "touchedTopics": ["project"],
  "dedupedEntries": 1
}
```

### 3.6 `GET /workspace/memory/dream/:taskId`

Dream-Task-Status pollen. Die Form entspricht dem Remember-Task-Polling, mit der Ausnahme, dass es kein `contextMode`-Feld gibt und terminale Fehler `dream_task_not_found` für unbekannte oder nicht autorisierte Task-IDs verwenden.

---

## 4. Task-Lifecycle

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

- **queued** — Task ist erstellt und wartet in der seriellen Lane.
- **running** — Der Bridge-Call ist unterwegs; der geforkte Agent wird ausgeführt.
- **completed** — Agent erfolgreich beendet; `result` ist befüllt.
- **failed** — Agent hat einen Fehler geworfen oder ein Timeout erreicht; `error` ist befüllt.

Die Lane speichert insgesamt bis zu **1000 Tasks** (terminale Tasks werden bei Erreichen des Limits nach FIFO evictet). Es können jederzeit höchstens **16 Tasks** ausstehend (queued + running) sein. Forget- und Dream-Tasks teilen sich ein kleineres Limit von **8 ausstehenden Tasks**, damit manuelle Wartungsspitzen nicht alle Slots verbrauchen können, die für die automatische Remember-Arbeit benötigt werden.

---

## 5. Implementierungsdetails

### 5.1 Serielle Task-Lane (`WorkspaceRememberTaskLane`)

Befindet sich in `packages/cli/src/serve/workspace-remember.ts`. Verwaltet eine `Map<taskId, TaskRecord>` und eine einzelne Promise-Chain (`this.tail`). Jeder `enqueue()`-Aufruf hängt eine `run`-Funktion an, die:

1. Den Status auf `running` setzt.
2. Die passende Bridge-Methode aufruft: `runWorkspaceMemoryRemember`, `runWorkspaceMemoryForget` oder `runWorkspaceMemoryDream`.
3. Bei Erfolg: Den Status auf `completed` setzt, `result` befüllt und ein `memory_changed`-Event veröffentlicht, wenn der Task tatsächlich Managed Memory berührt hat.
4. Bei Fehlschlag: Den Status auf `failed` setzt und `error` mit einem stabilen öffentlichen Error-Code befüllt.

Die Lane garantiert eine strikte Serialisierung — es wird immer nur ein Workspace-Memory-Task gleichzeitig ausgeführt, was gleichzeitige Dateisystem-Schreibzugriffe auf Managed Memory verhindert.

### 5.2 Bridge-Layer (`HttpAcpBridge`)

Workspace-Memory-Methoden zu `BridgeInterface` hinzugefügt (`packages/acp-bridge/src/bridgeTypes.ts`):

- `isWorkspaceMemoryRememberAvailable()` — Ruft die `qwen/control/workspace/memory/remember/availability`-Ext-Method auf dem Child auf. Gibt `boolean` zurück. Wird für Fast-Fail `409` vor dem Einreihen in die Warteschlange verwendet.
- `runWorkspaceMemoryRemember(request)` — Ruft die `qwen/control/workspace/memory/remember`-Ext-Method auf. Timeout bei **300 s** (`WORKSPACE_MEMORY_REMEMBER_TIMEOUT_MS`). Erstellt oder lädt KEINE Session.
- `runWorkspaceMemoryForget(request)` — Ruft die `qwen/control/workspace/memory/forget`-Ext-Method auf und verwendet dasselbe Bridge-Timeout. Erstellt oder lädt KEINE Session.
- `runWorkspaceMemoryDream()` — Ruft die `qwen/control/workspace/memory/dream`-Ext-Method auf und verwendet dasselbe Bridge-Timeout. Erstellt oder lädt KEINE Session.

Beide Methoden rufen `ensureChannel()` auf (spawnt das ACP-Child bei Bedarf) und starten danach den Idle-Timer neu, wenn keine Sessions aktiv sind.

### 5.3 ACP-Child-Ausführung (`QwenAgent.extMethod`)

In `packages/cli/src/acp-integration/acpAgent.ts` validiert und verarbeitet der Handler für
`workspaceMemoryRemember`, `workspaceMemoryForget` und `workspaceMemoryDream`:

1. Validiert die aufgabenspezifischen Eingaben (`content`/`contextMode` für remember,
   `query` für forget).
2. Prüft `config.isManagedMemoryAvailable()`.
3. Ruft die entsprechende Core-Operation mit einem **295 s** Abort-Signal auf
   (`WORKSPACE_MEMORY_REMEMBER_CHILD_TIMEOUT_MS` – etwas weniger als der Bridge-Timeout,
   um sicherzustellen, dass der Child-Prozess vor dem Bridge-Backstop abbricht). Bei forget
   wird das Signal durch `MemoryManager.forget`, die Selektion, die Model-seitige Query und
   die Filesystem-Mutationen zur Apply-Zeit durchgereicht.

### 5.4 Core-Remember-Logik (`packages/core/src/memory/remember.ts`)

`runManagedRememberByAgent()`:

1. Erstellt einen sauberen Memory-System-Prompt aus dem Managed-Memory-Index des Projekts.
2. Entfernt optional vorherige User-Memory-Einträge (wenn `contextMode === 'clean'`).
3. Erstellt eine `memoryScopedAgentConfig`, die die Datei-I/O auf die Memory-Verzeichnisse
   beschränkt.
4. Startet einen **geforkten Headless-Agenten** (`runForkedAgent`) mit:
   - Name: `managed-auto-memory-remember`
   - Tools: `read_file`, `grep`, `ls`, `write_file`, `edit`
   - Max turns: 6
   - Max time: 5 minutes
5. Validiert, dass alle berührten Dateien innerhalb der erlaubten Memory-Pfade liegen
   (`classifyTouchedScopes`). Wirft `remember_path_escape`, wenn der Agent außerhalb
   der Memory-Verzeichnisse geschrieben hat.
6. Baut die Memory-Indizes für alle berührten Scopes neu auf.
7. Gibt `{ summary, filesTouched, touchedScopes }` zurück.

### 5.5 Memory-Scoped Agent Config (`packages/core/src/memory/memory-scoped-agent-config.ts`)

`createMemoryScopedAgentConfig()` erstellt einen eingeschränkten `Config`-Wrapper, der:

- **Write-Tools** (`write_file`, `edit`): nur innerhalb des Projekt-Auto-Memory-Roots
  oder des User-Memory-Roots (`~/.qwen/memories`) erlaubt.
- **Read-Tools** (`read_file`, `grep`, `ls`): wenn `restrictReadsToMemoryPaths`
  true ist, nur innerhalb der Memory-Verzeichnisse erlaubt.
- **Shell**: standardmäßig deaktiviert; wenn aktiviert, sind nur Read-only-Befehle erlaubt.
- Löst Symlinks auf, um Path-Traversal-Escapes zu verhindern.

---

## 6. Events

### `memory_changed` (scope: `managed`)

Wird auf dem Daemon-SSE-Event-Stream (`GET /session/:id/events`) als `memory_changed`-Event
mit `scope: 'managed'` veröffentlicht, wenn eine Workspace-Memory-Aufgabe erfolgreich
abgeschlossen wird und tatsächlich den Managed Memory berührt. Clients, die den
Event-Stream pro Session abonniert haben, erhalten diese Benachrichtigung.

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

| Feld            | Typ         | Beschreibung                                                                              |
| --------------- | ----------- | ----------------------------------------------------------------------------------------- |
| `scope`         | `"managed"` | Unterscheidet von dateibasierten `memory_changed`-Events                                  |
| `source`        | `string`    | `"workspace_memory_remember"`, `"workspace_memory_forget"` oder `"workspace_memory_dream"`|
| `taskId`        | `string`    | Korreliert mit dem von POST zurückgegebenen Task                                          |
| `touchedScopes` | `string[]`  | Welche Memory-Scopes beschrieben wurden: `"user"`, `"project"`                            |

Die `originatorClientId` (falls zum POST-Zeitpunkt angegeben) wird an den Event-Envelope
angehängt, damit der Event-Bus ihn an den Ursprungs-Client weiterleiten kann.

---

## 7. Fehlerbehandlung

### Fehlercodes

| Code                         | Ursprung            | Bedeutung                                                |
| ---------------------------- | ------------------- | -------------------------------------------------------- |
| `invalid_content`            | HTTP-Route          | Content fehlt, ist leer oder überschreitet 64 KiB        |
| `invalid_context_mode`       | HTTP-Route          | contextMode ist nicht `"workspace"` oder `"clean"`       |
| `invalid_query`              | HTTP-Route          | Forget-Query fehlt, ist leer oder überschreitet 64 KiB   |
| `invalid_client_id`          | HTTP-Route          | Client-Id-Header nicht im bekannten Set der Bridge       |
| `managed_memory_unavailable` | Bridge / ACP-Child  | Workspace ist nicht für Managed Memory konfiguriert      |
| `remember_queue_full`        | Task-Lane           | Limit von 16 ausstehenden Tasks erreicht                 |
| `remember_path_escape`       | Core-Remember-Logik | Agent hat in einen Pfad außerhalb der Managed-Memory-Verzeichnisse geschrieben |
| `remember_failed`            | Catch-all           | Nicht klassifizierter Agent-Fehler, Timeout oder interner Fehler |
| `remember_task_not_found`    | HTTP-Route          | GET für unbekannte oder nicht autorisierte Task-ID       |
| `forget_task_not_found`      | HTTP-Route          | GET für unbekannte oder nicht autorisierte Forget-Task-ID|
| `dream_task_not_found`       | HTTP-Route          | GET für unbekannte oder nicht autorisierte Dream-Task-ID |

### Timeout-Chain

```
Agent forked runner:   5 min maxTimeMinutes
Child abort signal:  295 s  (WORKSPACE_MEMORY_REMEMBER_CHILD_TIMEOUT_MS)
Bridge timeout:      300 s  (WORKSPACE_MEMORY_REMEMBER_TIMEOUT_MS)
```

Der Child-Prozess bricht ab, bevor die Bridge einen Timeout hat, sodass ein sauberer Fehler
propagiert wird, anstatt eines Timeout-Fehlers auf Transportebene.

---

## 8. SDK-Integration

### TypeScript SDK (`@qwen-code/sdk-typescript`)

Workspace-Memory-Methoden auf dem `DaemonClient`:

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

const forget = await client.forgetWorkspaceMemory('old preference');
const forgetResult = await client.getWorkspaceMemoryForgetTask(forget.taskId);

const dream = await client.dreamWorkspaceMemory();
const dreamResult = await client.getWorkspaceMemoryDreamTask(dream.taskId);
```

### UI-Event-Normalisierung

Der SDK-Normalizer mappt das rohe `memory_changed`-SSE-Event (mit
`scope: 'managed'`) auf ein `DaemonUiWorkspaceMemoryChangedEvent`:

```typescript
{
  type: 'workspace.memory.changed',
  scope: 'managed',
  source: 'workspace_memory_remember',
  taskId: 'remember-...',
  touchedScopes: ['user', 'project']
}
```

Dies erweitert den bestehenden `workspace.memory.changed`-Event-Typ, der zuvor nur
`scope: 'workspace' | 'global'` für dateibasierte QWEN.md-Schreibvorgänge enthielt.

---

## 9. Design-Rationale

### Warum sessionless?

Der `/remember`-Slash-Befehl in der CLI funktioniert bereits innerhalb einer Session. Aber
die Settings-UI und programmatische SDK-Caller sollten keine Session erstellen müssen, nur
um ein Fact zu persistieren. Eine Session impliziert Conversation-History, Turn-Tracking und
Sichtbarkeit in der Session-Liste – nichts davon ist auf ein Fire-and-Forget-Memory-Write
anwendbar.

### Warum serielle Ausführung?

Das Managed-Memory-System speichert Facts in Markdown-Dateien mit Indizes. Gleichzeitige
Schreibvorgänge aus mehreren Remember-Tasks könnten Indizes korrumpieren oder Merge-Konflikte
erzeugen. Eine single-threaded Lane ist die einfachste korrekte Lösung.

### Warum eine Task-Queue (nicht synchron)?

Memory-Schreibvorgänge beinhalten einen LLM-Agenten, der entscheidet, _wo_ und _wie_ das Fact
gespeichert wird (Wahl zwischen User- und Project-Scope, Auswahl der richtigen Datei,
Formatierung). Das dauert 2–30 Sekunden. Eine synchrone HTTP-Anfrage würde entweder einen
Timeout erzeugen oder den Client blockieren. Das asynchrone Queue- und Poll-Muster hält den
HTTP-Contract einfach und ermöglicht es Clients, eine Progress-UI anzuzeigen.

### Warum `contextMode`?

- `"workspace"` (Standard) – der Remember-Agent sieht bestehende Memories als Kontext,
  was es ihm ermöglicht, Duplikate zu vermeiden oder bestehende Einträge zu aktualisieren.
- `"clean"` – der Agent sieht keine vorherigen User-Memory-Einträge. Nützlich, wenn der
  Caller ein frisches Schreiben ohne Dedup-Logik erzwingen möchte (z. B. bei Bulk-Imports).

### Warum Lesezugriffe auf Memory-Pfade beschränken?

Der Remember-Agent sollte nur innerhalb der Managed-Memory-Verzeichnisse lesen und schreiben.
Dies verhindert ein Prompt-Injection-Szenario, bei dem manipulierter `content` den Agenten
dazu bringt, sensible Projektdateien zu lesen und in Memory-Einträge zu leaken.