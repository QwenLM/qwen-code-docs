# DaemonWorkspaceService – Implementierungsdesign (Option C)

> Verknüpfungen: issue #4542, PR #4472, #3803, #4175
> Branch: `daemon_mode_b_main`
> Datum: 2026-05-27
> Art: Implementierungsdesign-Dokument (umsetzungsorientiert), kein RFC

---

> **Hinweis zum Implementierungsumfang (Aktualisiert 2026-05-31, PR #4563)**
>
> Dieses Dokument beschreibt die **Zielarchitektur**. PR #4563 setzt nur einen Teil davon um; der Rest ist Gegenstand späterer PRs. Bitte orientieren Sie sich beim Lesen an der folgenden Tabelle und gehen Sie nicht davon aus, dass alles bereits implementiert ist:
>
> | Fähigkeit                                                                         | Status in diesem PR (#4563)                                                                                                             |
> | --------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
> | Umbenennung `HttpAcpBridge` → `AcpSessionBridge`                                  | ✅ Umgesetzt                                                                                                                            |
> | Bridge stellt generische Delegaten `queryWorkspaceStatus` / `invokeWorkspaceCommand` bereit | ✅ Umgesetzt                                                                                                                            |
> | Workspace-Level **status / init / tool-toggle / mcp-restart** im Facade           | ✅ Umgesetzt und verdrahtet (server.ts + acpHttp dispatch läuft über Facade)                                                             |
> | **Die vier Sub-Services File / Auth / Agents / Memory**                           | ⏳ **verschoben** – nicht in diesem PR. Zusammen mit den zugehörigen Routenverdrahtungen, den Injektionen von `deviceFlowRegistry`/`subagentManager` und den e2e-Tests in einem späteren PR            |
> | REST-Routen `/workspace/memory`, `/workspace/agents` usw. sollen über Facade laufen | ⏳ **verschoben** – werden derzeit noch direkt von den alten `workspaceMemory.ts` / `workspaceAgents.ts` bedient                        |
> | Northbound-Dispatch `/acp` für `qwen/workspace/*` (§6)                            | ⏳ **verschoben**                                                                                                                        |
> | `initWorkspace` über `fsFactory` / `WorkspaceFileSystem` (trust gate + audit)    | ⏳ **verschoben** – aktuell wird weiterhin die raw `node:fs`-Implementierung der alten Bridge verwendet (inkl. §SV TOCTOU/Symlink-Schutz); kein Regression; Migration zu fsFactory/audit bleibt später |
>
> Daher sind §3.4 (Sub-Service-Interfaces), §6 (/acp northbound), §7.1 (`e2e.test.ts`) und §10 (PR-Form) als **Ziel-/Zukunftsbereich** zu verstehen und in diesem PR nicht implementiert.

---

## 1. Architektur & Grenzen

### 1.1 Ziel-Schichtung

```
                          CLIENTS
   webui    SDK/channels(via REST)    Zed/Goose(/acp)    future
     │             │                       │
═════╪═════════════╪═══════════════════════╪═════════════ L1 Transport (dünn)
   REST+SSE      REST+SSE              /acp (jsonrpc/sse)
   server.ts                           acpHttp/
     └─────────────┴───────────────────────┘
                          │ Business/Trust/Audit immer in L2
═════════════════════════╪═══════════════════════════════ L2 Anwendungsschicht
   ┌──────────────────────────┐   ┌─────────────────────────────────┐
   │ AcpSessionBridge          │   │ DaemonWorkspaceService (Facade) │
   │ (← Umbenennung HttpAcpBridge) │  ┌──────────────────────────┐   │
   │ • Channel/Session-Lebenszyklus │  │ FileService              │   │
   │ • prompt / cancel / close      │  │ AuthService              │   │
   │ • EventBus / Berechtigungsvermittlung │  │ AgentsService            │   │
   │ • Statusintrospection des kindes │  │ MemoryService            │   │
   │   (mcp/skills/preflight)        │  └──────────────────────────┘   │
   └──────────┬───────────────┘   │ Einheitlicher WorkspaceRequestContext │
              │                    └──────────┬──────────────────────┘
              │ L3 → child                    │
              ▼                               │ (rein lokal, kein Kindkontakt)
══════════════════════════════════════════════════════════ L3 ACP-Client
══════════════════════════════════════════════════════════ L4 Agent
```

### 1.2 Entscheidungsfunktion zur Aufteilung

**Eindeutige Regel: Bezieht sich die Operation auf eine Session oder auf einen Workspace?**

- **Session-bezogen** (operiert auf einer bestimmten sessionId: prompt/cancel/close/model/approval/metadata/heartbeat) **→ bleibt in `AcpSessionBridge`**
- **Workspace-bezogen** (operiert auf dem gesamten Workspace: file/auth/agents/memory/mcp-status/skills/env/preflight/tool-toggle/init) **→ geht in `DaemonWorkspaceService`**

Manche Workspace-Methoden müssen das Child abfragen (Status-Getter, restartMcpServer) – dies geschieht über **injektierte Callbacks**, die über den Bridge-Kanal delegieren. Der Service selbst hält keine Verbindung.

### 1.3 Querschnittsabhängigkeit: Callback-Injektion (keine gemeinsame Infrastruktur)

Derzeit werden `publishWorkspaceEvent` und `knownClientIds` von der Bridge gehalten (per-session Bus Fan-out / Session-abgeleitet). Der Service nutzt sie über **unidirektionale Callback-Injektion** und führt keine gemeinsame Infrastrukturschicht ein.

**Begründung:**

1. EventBus ist ein per-session Bus (`bridge.ts:1457`); ein Workspace-Level-Bus ist in Codekommentaren bereits für PR 24 vorgemerkt (`bridge.ts:2611`)
2. `knownClientIds` ist ebenfalls aus dem Session-Attach-State abgeleitet; Kommentar besagt explizit "PR 24 will replace it" (`bridge.ts:2658`)
3. Diese beiden Punkte sind eigenständige, bereits geplante Arbeiten – sie in diesen PR zu zwingen, würde einen zusätzlichen Refaktor bedeuten
4. Die Callback-Injektion ist eine unidirektionale Abhängigkeit für den Service (hält nur Funktionsreferenzen, kennt die Bridge nicht); nach PR 24 kann die Injektionsquelle gewechselt werden, ohne dass sich das Service-Interface ändert

**Harte Regeln:**

1. In `DaemonWorkspaceServiceDeps` darf **kein Typverweis auf `AcpSessionBridge`** vorkommen – nur Funktionssignaturen.
2. Die Bridge stellt nach außen die beiden neuen Methoden `queryWorkspaceStatus` und `invokeWorkspaceCommand` bereit, die vom Service über Callback aufgerufen werden. Intern wird weiterhin die bestehende `requestWorkspaceStatus`- / `liveChannelInfo`-Logik mit Timeout verwendet; es wird keine neue Abstraktion eingeführt.

---

## 2. Erstellungsreihenfolge & Dependency Injection

```ts
// Erstellungsreihenfolge in runQwenServe.ts

// 1. fsFactory zuerst (wird von beiden benötigt)
const fsFactory = resolveBridgeFsFactory({ ... });

// 2. Bridge zuerst (Eigentümer von Session/Channel/EventBus)
const bridge = createAcpSessionBridge({
  eventRingSize,
  boundWorkspace,
  fileSystem: createBridgeFileSystemAdapter(fsFactory),
  // ... restliche vorhandene Parameter unverändert
});

// 3. Service danach, erhält Callback-Set von der Bridge
const workspace = createDaemonWorkspaceService({
  fsFactory,
  deviceFlowRegistry,
  subagentManager,
  boundWorkspace,
  contextFilename,
  // Querschnitts-Callbacks – Service weiß nicht, dass sie von der Bridge kommen
  publishWorkspaceEvent: (event) => bridge.publishWorkspaceEvent(event),
  knownClientIds: () => bridge.knownClientIds(),
  // Child-Delegierten-Callbacks – Workspace-bezogene ext-Methoden erreichen den Agenten über den Bridge-Kanal
  queryWorkspaceStatus: (method, idle) => bridge.queryWorkspaceStatus(method, idle),
  invokeWorkspaceCommand: (method, params, opts) => bridge.invokeWorkspaceCommand(method, params, opts),
});

// 4. Beide werden an Server-Routen und /acp-Handler übergeben
createServeApp({ bridge, workspace, ... });
```

**Die Erstellungsreihenfolge Bridge → Service ist eine harte Abhängigkeit** (der Service benötigt die Methoden der Bridge-Instanz als Callback-Quelle).

---

## 3. Interne Struktur von DaemonWorkspaceService

### 3.1 Verzeichnisstruktur

```
packages/cli/src/serve/workspace-service/
├── types.ts            ← WorkspaceRequestContext + Sub-Service-Interfaces
├── index.ts            ← Facade-Factory (createDaemonWorkspaceService)
├── fileService.ts      ← kapselt fsFactory
├── authService.ts      ← kapselt DeviceFlowRegistry
├── agentsService.ts    ← kapselt SubagentManager
├── memoryService.ts    ← kapselt Memory-Dateioperationen
└── __tests__/
    ├── fileService.test.ts
    ├── authService.test.ts
    ├── agentsService.test.ts
    ├── memoryService.test.ts
    └── e2e.test.ts
```

### 3.2 Facade-Interface

```ts
export interface DaemonWorkspaceService {
  file: FileService;
  auth: AuthService;
  agents: AgentsService;
  memory: MemoryService;

  // Rein lokal
  initWorkspace(
    opts: InitWorkspaceOpts,
    ctx: WorkspaceRequestContext,
  ): Promise<void>;
  setToolEnabled(
    toolName: string,
    enabled: boolean,
    ctx: WorkspaceRequestContext,
  ): Promise<ToolToggleResult>;

  // Delegiert über Callback an Child
  getMcpStatus(): Promise<ServeWorkspaceMcpStatus>;
  getSkillsStatus(): Promise<ServeWorkspaceSkillsStatus>;
  getProvidersStatus(): Promise<ServeWorkspaceProvidersStatus>;
  getEnvStatus(): Promise<ServeWorkspaceEnvStatus>;
  getPreflightStatus(): Promise<ServeWorkspacePreflightStatus>;
  restartMcpServer(
    serverName: string,
    ctx: WorkspaceRequestContext,
    opts?: RestartOpts,
  ): Promise<RestartResult>;
}
```

> `listWorkspaceSessions` / `recordHeartbeat` / `getHeartbeatState` / `publishWorkspaceEvent` / `knownClientIds` bleiben in der Bridge – sie greifen auf den internen per-session State der Bridge zu (`byId`-Map / Session-Bus), sind also Session-abgeleitete Infrastruktur. Der Service konsumiert sie über Callbacks, besitzt sie nicht.

### 3.3 Facade-Factory-Signatur

```ts
export interface DaemonWorkspaceServiceDeps {
  fsFactory: WorkspaceFileSystemFactory;
  deviceFlowRegistry: DeviceFlowRegistry;
  subagentManager: SubagentManager;
  boundWorkspace: string;
  contextFilename: string;
  persistDisabledTools: (
    workspace: string,
    tool: string,
    enabled: boolean,
  ) => Promise<void>;

  // Querschnitts-Callbacks (Session-abgeleitete Infrastruktur)
  publishWorkspaceEvent: (event: WorkspaceEvent) => void;
  knownClientIds: () => Set<string>;

  // Child-Delegierten-Callbacks (Workspace-bezogene ext-Methoden erreichen den Agenten über Bridge-Kanal)
  queryWorkspaceStatus: <T>(method: string, idle: () => T) => Promise<T>;
  invokeWorkspaceCommand: <T>(
    method: string,
    params?: Record<string, unknown>,
    opts?: { timeoutMs?: number },
  ) => Promise<T>;
}

export function createDaemonWorkspaceService(
  deps: DaemonWorkspaceServiceDeps,
): DaemonWorkspaceService;
```

### 3.4 Sub-Service-Interfaces

| Sub-Service     | Methoden                                                                        | Benötigte deps                                                      | Vorhandene Quelle                                                             |
| --------------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| FileService     | `read`, `readBytes`, `write`, `edit`, `glob`, `list`, `stat`                    | `fsFactory`, `boundWorkspace`                                       | `serve/routes/workspaceFileRead.ts`, `workspaceFileWrite.ts`, `serve/fs/`     |
| AuthService     | `startFlow`, `getFlowStatus(flowId)`, `cancelFlow(flowId)`, `getAuthStatus`     | `deviceFlowRegistry`                                                | `serve/auth/deviceFlow.ts`, `server.ts:794-966`                               |
| AgentsService   | `list`, `get(agentType)`, `create`, `update`, `delete`                          | `subagentManager`, `publishWorkspaceEvent`, `knownClientIds`        | `serve/workspaceAgents.ts`                                                    |
| MemoryService   | `list`, `read`, `write`, `delete`                                               | `fsFactory` oder direktes fs, `publishWorkspaceEvent`, `knownClientIds` | `serve/workspaceMemory.ts`                                                    |

Jede Methode hat als ersten Parameter `ctx: WorkspaceRequestContext`; das Trust-Gate wird einheitlich am Methodeneingang ausgeführt.

---

## 4. WorkspaceRequestContext

```ts
export interface WorkspaceRequestContext {
  originatorClientId?: string; // X-Qwen-Client-Id Header (kann bei Leseoperationen fehlen)
  sessionId?: string; // Verknüpfung für Audit (z. B. wenn Operation aus Session-Kontext heraus initiiert wird)
  route: string; // Audit-Trail (z. B. "POST /file/write")
  workspaceCwd: string; // Trust-Boundary-Root
}
```

> `originatorClientId` ist optional – derzeit funktionieren lesende Routen wie File-Read auch bei fehlendem Header (es wird `clientId ?? undefined` an `fsFactory.forRequest` übergeben). Schreibende Routen prüfen die Legitimität **nur dann**, wenn eine `clientId` vorhanden ist.

**Konstruktionsort**: Der L1-Route-Handler / `/acp` Method-Handler extrahiert die Werte aus Request-Headern/-Parametern und übergibt sie an L2. L2 konsumiert nur, zieht selbst keinen HTTP-Kontext.

---

## 5. Verschlankung & Umbenennung von AcpSessionBridge

### 5.1 Aus der Bridge ausgelagerte Methoden

| Methode                         | Zielort                        | Mechanismus                             | Begründung                                                      |
| ------------------------------- | ------------------------------ | --------------------------------------- | --------------------------------------------------------------- |
| `initWorkspace`                 | `workspace.initWorkspace`      | Direktverschiebung (rein lokal)         | Behebt gleichzeitig FIXME (Bridge hatte kein fsFactory, überspringt trust gate / audit) |
| `setWorkspaceToolEnabled`       | `workspace.setToolEnabled`     | Direktverschiebung (rein lokal)         | Reine File-I/O + Event-Fan-out; Kommentar sagt explizit "no ACP roundtrip" |
| `getWorkspaceMcpStatus`         | `workspace.getMcpStatus`       | via `queryWorkspaceStatus` Callback     | Workspace-bezogene Statusabfrage                                |
| `getWorkspaceSkillsStatus`      | `workspace.getSkillsStatus`    | via `queryWorkspaceStatus` Callback     | Wie oben                                                        |
| `getWorkspaceProvidersStatus`   | `workspace.getProvidersStatus` | via `queryWorkspaceStatus` Callback     | Wie oben                                                        |
| `getWorkspaceEnvStatus`         | `workspace.getEnvStatus`       | via `queryWorkspaceStatus` Callback     | Wie oben                                                        |
| `getWorkspacePreflightStatus`   | `workspace.getPreflightStatus` | via `queryWorkspaceStatus` Callback     | Wie oben                                                        |
| `restartMcpServer`              | `workspace.restartMcpServer`   | via `invokeWorkspaceCommand` Callback   | Workspace-bezogene Mutation                                     |

> `listWorkspaceSessions` / `recordHeartbeat` / `getHeartbeatState` / `updateSessionMetadata` bleiben in der Bridge – sie greifen auf die interne `byId`-Session-Map der Bridge zu und sind Session-bezogene Operationen.

### 5.2 In der Bridge verbleibend

- Alle Session/Channel-Lebenszyklus-Methoden (spawn/load/resume/send/cancel/close/kill/detach)
- Besitz des EventBus + Implementierung des `publishWorkspaceEvent`-Fan-outs (zur Konsumation durch Service-Callbacks)
- `knownClientIds` (zur Konsumation durch Service-Callbacks)
- Neu bereitgestellt: `queryWorkspaceStatus` / `invokeWorkspaceCommand` (kapseln Channel + Timeout + Error; zur Delegation durch Service-Callbacks)
- Berechtigungsvermittlung (Mediator)
- Session-Konfigurationsänderungen (model/approvalMode/recap)
- Session-Status (context/supportedCommands/metadata/heartbeat/listSessions)

### 5.3 Umbenennung

- `HttpAcpBridge` → `AcpSessionBridge`
- `createHttpAcpBridge` → `createAcpSessionBridge`
- Datei `serve/httpAcpBridge.ts` → `serve/acpSessionBridge.ts`

Es gibt keine externen Konsumenten des Pakets (überprüft: keine Referenzen außerhalb von `packages/cli/src/serve/` und `packages/acp-bridge/src/`), daher intern sicher.

---

## 6. /acp Northbound Ext-Methoden

### 6.1 Namensraum

`qwen/workspace/...` (Abgrenzung zu vorhandenem `qwen/control/...`):

- `qwen/control/...` = Daemon → Child Weiterleitungsbefehle (Southbound, über AcpSessionBridge)
- `qwen/workspace/...` = Lokale Workspace-Operationen auf dem Daemon (Northbound, enden im DaemonWorkspaceService)

> Steht zur Bestätigung durch chiga0 aus. Falls der Namensraum geändert wird, muss nur das Methodenpräfix ausgetauscht werden; die Architektur bleibt unberührt.

### 6.2 Methodenliste

| method                            | Entsprechender REST                        | L2-Aufruf                                             |
| --------------------------------- | ------------------------------------------ | ----------------------------------------------------- |
| `qwen/workspace/fs/read`          | `GET /file?path=...`                       | `workspace.file.read(ctx, path)`                      |
| `qwen/workspace/fs/readBytes`     | `GET /file/bytes?path=...`                 | `workspace.file.readBytes(ctx, path)`                 |
| `qwen/workspace/fs/write`         | `POST /file/write`                         | `workspace.file.write(ctx, path, content)`            |
| `qwen/workspace/fs/edit`          | `POST /file/edit`                          | `workspace.file.edit(ctx, path, edits)`               |
| `qwen/workspace/fs/glob`          | `GET /glob?pattern=...`                    | `workspace.file.glob(ctx, pattern)`                   |
| `qwen/workspace/fs/list`          | `GET /list?path=...`                       | `workspace.file.list(ctx, path)`                      |
| `qwen/workspace/fs/stat`          | `GET /stat?path=...`                       | `workspace.file.stat(ctx, path)`                      |
| `qwen/workspace/auth/start`       | `POST /workspace/auth/device-flow`         | `workspace.auth.startFlow(ctx)`                       |
| `qwen/workspace/auth/status`      | `GET /workspace/auth/status`               | `workspace.auth.getAuthStatus(ctx)`                   |
| `qwen/workspace/auth/flow`        | `GET /workspace/auth/device-flow/:id`      | `workspace.auth.getFlowStatus(ctx, flowId)`           |
| `qwen/workspace/auth/cancel`      | `POST /workspace/auth/device-flow/:id` (cancel) | `workspace.auth.cancelFlow(ctx, flowId)`          |
| `qwen/workspace/agents/list`      | `GET /workspace/agents`                    | `workspace.agents.list(ctx)`                          |
| `qwen/workspace/agents/get`       | `GET /workspace/agents/:agentType`         | `workspace.agents.get(ctx, agentType)`                |
| `qwen/workspace/agents/create`    | `POST /workspace/agents`                   | `workspace.agents.create(ctx, spec)`                  |
| `qwen/workspace/agents/update`    | `POST /workspace/agents/:agentType`        | `workspace.agents.update(ctx, agentType, spec)`       |
| `qwen/workspace/agents/delete`    | `DELETE /workspace/agents/:agentType`      | `workspace.agents.delete(ctx, agentType)`             |
| `qwen/workspace/memory/list`      | `GET /workspace/memory`                    | `workspace.memory.list(ctx)`                          |
| `qwen/workspace/memory/read`      | `GET /workspace/memory/:key`               | `workspace.memory.read(ctx, key)`                     |
| `qwen/workspace/memory/write`     | `POST /workspace/memory`                   | `workspace.memory.write(ctx, key, content)`           |
| `qwen/workspace/memory/delete`    | `DELETE /workspace/memory/:key`            | `workspace.memory.delete(ctx, key)`                   |
| `qwen/workspace/init`             | `POST /workspace/init`                     | `workspace.initWorkspace(ctx, opts)`                  |
| `qwen/workspace/tool/toggle`      | `POST /workspace/tool/toggle`              | `workspace.setToolEnabled(ctx, toolName, enabled)`    |
| `qwen/workspace/status/mcp`       | `GET /workspace/mcp`                       | `workspace.getMcpStatus()`                            |
| `qwen/workspace/status/skills`    | `GET /workspace/skills`                    | `workspace.getSkillsStatus()`                         |
| `qwen/workspace/status/providers` | `GET /workspace/providers`                 | `workspace.getProvidersStatus()`                      |
| `qwen/workspace/status/env`       | `GET /workspace/env`                       | `workspace.getEnvStatus()`                            |
| `qwen/workspace/status/preflight` | `GET /workspace/preflight`                 | `workspace.getPreflightStatus()`                      |
| `qwen/workspace/mcp/restart`      | `POST /workspace/mcp/restart`              | `workspace.restartMcpServer(ctx, serverName, opts)`   |

Beim Advertise der Capabilities werden diese Methoden in `_meta.qwen.methods` deklariert.

---

## 7. Dateiliste der Änderungen

### 7.1 Neu

| Datei                                                          | Zweck                                              |
| -------------------------------------------------------------- | -------------------------------------------------- |
| `serve/workspace-service/types.ts`                             | `WorkspaceRequestContext` + Sub-Service-Interfaces |
| `serve/workspace-service/index.ts`                             | Facade-Factory                                     |
| `serve/workspace-service/fileService.ts`                       | FileService-Implementierung                        |
| `serve/workspace-service/authService.ts`                       | AuthService-Implementierung                        |
| `serve/workspace-service/agentsService.ts`                     | AgentsService-Implementierung                      |
| `serve/workspace-service/memoryService.ts`                     | MemoryService-Implementierung                      |
| `serve/workspace-service/__tests__/fileService.test.ts`        | Unit-Test                                          |
| `serve/workspace-service/__tests__/authService.test.ts`        | Unit-Test                                          |
| `serve/workspace-service/__tests__/agentsService.test.ts`      | Unit-Test                                          |
| `serve/workspace-service/__tests__/memoryService.test.ts`      | Unit-Test                                          |
| `serve/workspace-service/__tests__/e2e.test.ts`                | End-to-End-Test zur Gleichwertigkeit REST ↔ /acp  |

### 7.2 Geändert

| Datei                                                          | Änderung                                                                                                                                                                                    |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `acp-bridge/src/bridge.ts`                                     | Entfernt 8 Workspace-Methoden (initWorkspace / setWorkspaceToolEnabled / 5 Status-Getter / restartMcpServer); fügt neu `queryWorkspaceStatus` + `invokeWorkspaceCommand` hinzu; Factory umbenannt |
| `acp-bridge/src/bridgeTypes.ts`                                | Interface-Umbenennung `HttpAcpBridge` → `AcpSessionBridge`; entfernt 8 Methodensignaturen der Workspace-Methoden; fügt neu `queryWorkspaceStatus` + `invokeWorkspaceCommand`-Signaturen hinzu |
| `acp-bridge/src/bridgeOptions.ts`                              | JSDoc-Referenzen aktualisiert                                                                                                                                                               |
| `acp-bridge/src/status.ts`                                     | Klassennamen in Fehlermeldungen aktualisiert                                                                                                                                                 |
| `cli/src/serve/httpAcpBridge.ts` → umbenannt `acpSessionBridge.ts` | Re-Export aktualisiert                                                                                                                                                                      |
| `cli/src/serve/runQwenServe.ts`                                | Erstellt `DaemonWorkspaceService`, injiziert Callbacks, übergibt an Routen und /acp-Handler                                                                                                 |
| `cli/src/serve/server.ts`                                      | Routen von direktem `fsFactory`/`DeviceFlowRegistry`-Zugriff auf `workspace.file.*` / `workspace.auth.*` umgestellt                                                                         |
| `cli/src/serve/workspaceAgents.ts`                             | Geschäftslogik in `agentsService.ts` verschoben; alte Datei wird zur dünnen Route-Handler-Hülle (erstellt ctx → ruft Service auf)                                                            |
| `cli/src/serve/workspaceMemory.ts`                             | Wie oben                                                                                                                                                                                    |
| `cli/src/serve/routes/workspaceFileRead.ts`                    | Wie oben                                                                                                                                                                                    |
| `cli/src/serve/routes/workspaceFileWrite.ts`                   | Wie oben                                                                                                                                                                                    |
| `/acp` Handler (in `acp-integration/` oder `serve/` )          | Neuer Northbound-Methoden-Dispatch hinzugefügt                                                                                                                                              |
---

## 8. SDK-Kompatibilität und Fehlerformate

### 8.1 SDK-Rückwärtskompatibilität

Die REST-API-Oberfläche (Pfade, HTTP-Methoden, JSON-Schema für Anfragen/Antworten) bleibt unverändert. Die `DaemonClient`- und `DaemonSessionClient`-Klassen im `sdk-typescript` benötigen keine Änderungen.

Überprüfung: Die vorhandenen Tests `packages/sdk-typescript/test/unit/DaemonClient.test.ts` und `DaemonSessionClient.test.ts` müssen in diesem PR ohne Änderungen bestehen.

### 8.2 Fehlerformat für Ablehnungen durch das /acp Trust Gateway

Die Semantik ist zwischen beiden Transporten äquivalent, die Codierung unterscheidet sich jedoch:

| Szenario                                        | REST                                       | /acp (JSON-RPC)                                                          |
| ----------------------------------------------- | ------------------------------------------ | ------------------------------------------------------------------------ |
| Ungültiges/fehlendes Bearer-Token               | `401 { error, code: "unauthorized" }`      | `{ error: { code: -32001, message: "unauthorized" } }`                   |
| Ungültige clientId                              | `400 { error, code: "invalid_client_id" }` | `{ error: { code: -32602, message: "invalid_client_id", data: {...} } }` |
| Ablehnung durch Trust Gateway (z. B. Pfadausbrüche) | `403 { error, code: "forbidden" }`         | `{ error: { code: -32003, message: "forbidden", data: {...} } }`         |

> Die JSON-RPC-Fehlercodes folgen dem [ACP-Fehlercode-Register](https://spec.acpprotocol.org) (Standardbereich -32000 bis -32099 für serverdefinierte Anwendungsfehler). Die konkreten Code-Werte werden in der Implementierung an die bestehende Fehlerzuordnungslogik des `/acp` angeglichen (`acp-integration/errorCodes.ts`).

---

## 9. Teststrategie

| Ebene              | Testtyp                                                                              | Abdeckungsziel                                                                          |
| ------------------ | ------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------- |
| Sub-Service-Unit   | Jest, mocke fsFactory / DeviceFlowRegistry / SubagentManager / Callbacks             | Korrektheit der Geschäftslogik + Ablehnung ungültiger clientId durch Trust Gateway      |
| Route-Integration  | Vorhandene Routentests werden über den Service ausgeführt (bestätigt unveränderte HTTP-Oberfläche) | Regressionssicherung, REST-Pfade brechen nicht                                          |
| E2E-Äquivalenz     | Starten eines echten Servers + HTTP-Anfragen                                         | REST und `/acp` liefern äquivalente Ergebnisse für denselben Vorgang; Trust Gateway lehnt konsistent auf beiden Seiten ab |

### E2E-Prüfmatrix

- Datei lesen/schreiben: REST `GET /file` vs. `/acp` `qwen/workspace/fs/read` → gleiches Ergebnis
- Agent CRUD: REST `POST /workspace/agents` vs. `/acp` `qwen/workspace/agents/create` → gleiches Verhalten
- Trust-Gateway-Ablehnung: Ungültige clientId führt auf beiden Pfaden zu 403
- Workspace-Initialisierung: Überprüfung, dass fsFactory funktioniert + Audit-Trail erzeugt wird

---

## 10. PR-Form

Ein einzelner PR mit atomaren Commits, enthält:

- Alle neuen Dateien für `DaemonWorkspaceService`
- REST-Route-Handler werden geändert, um den Service aufzurufen
- Bridge-Verschlankung (Auslagerung von 8 Workspace-Methoden) + 2 neu exponierte Delegationsmethoden für Child
- Umbenennung von `HttpAcpBridge` in `AcpSessionBridge`
- Neue northbound-Extra-Methoden für `/acp` (27 Stück)
- Vollständige Tests (Unit + Integration + E2E)

---

## 11. Explizit nicht umgesetzt (Scope-Grenze)

- Workspace-bezogener EventBus (PR 24, nicht hier)
- Workspace-bezogene ClientRegistry (PR 24)
- Aufteilung L2 ↔ L3 (Auslagern von `ClientSideConnection` aus der Bridge)
- REST als `/acp`-Kompatibilitäts-Shim (langfristiges Ziel)
- Vereinheitlichung des Channels-Standalone-Modus (Problem der eigenständigen Bereitstellungsform)
- Migration von `listWorkspaceSessions` / `recordHeartbeat` / `getHeartbeatState` / `updateSessionMetadata` (session-scoped, bleiben am ursprünglichen Ort)
- Übertragung der Ownership von `publishWorkspaceEvent` / `knownClientIds` (session-abgeleitete Infrastruktur, bleibt bei Bridge, Service konsumiert über Callbacks)

---

## 12. Von chiga0 zu bestätigende Entscheidungspunkte

1. Namespace für `/acp` northbound: `qwen/workspace/...` vs. andere (z. B. Wiederverwendung von `qwen/control/...`)
2. Umbenennung im gleichen PR: Tendenz zum selben PR, aber kann auf Wunsch ausgegliedert werden

> Sollten die beiden Punkte angepasst werden müssen, betrifft dies nur die Namensgebung und die Commit-Grenzen, nicht die Architektur.