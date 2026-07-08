# DaemonWorkspaceService Implementierungsdesign (Plan C)

> Bezug: Issue #4542, PR #4472, #3803, #4175
> Branch: `daemon_mode_b_main`
> Datum: 2026-05-27
> Art: Implementierungsdesign-Dokument (auf Umsetzung ausgerichtet), kein RFC

---

> **Hinweis zum Implementierungsumfang (aktualisiert am 2026-05-31, PR #4563)**
>
> Dieses Dokument beschreibt die **Zielarchitektur**. PR #4563 implementiert nur einen Teil davon, der Rest ist Gegenstand späterer PRs. Bitte orientiere dich beim Lesen an der folgenden Tabelle und gehe nicht davon aus, dass alles bereits implementiert ist:
>
> | Fähigkeit                                                                      | Status in diesem PR (#4563)                                                                                                    |
> | ------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------- |
> | Umbenennung von `HttpAcpBridge` → `AcpSessionBridge`                           | ✅ Implementiert                                                                                                                 |
> | Bridge stellt generische Delegation für `queryWorkspaceStatus` / `invokeWorkspaceCommand` bereit | ✅ Implementiert                                                                                                                 |
> | Workspace-weite **status / init / tool-toggle / mcp-restart** der Facade       | ✅ Implementiert und verbunden (server.ts + acpHttp Dispatch über Facade)                                                        |
> | **Vier Sub-Services: File / Auth / Agents / Memory**                           | ⏳ **deferred** – Nicht in diesem PR. Wird zusammen mit dem jeweiligen Routing, der Injektion von `deviceFlowRegistry`/`subagentManager` und E2E-Tests in einem späteren PR implementiert |
> | REST-Routen wie `/workspace/memory`, `/workspace/agents` rufen nun die Facade auf | ⏳ **deferred** – Werden derzeit noch direkt von den alten `workspaceMemory.ts` / `workspaceAgents.ts` bedient                 |
> | `/acp` Northbound `qwen/workspace/*` Dispatch (§6)                             | ⏳ **deferred**                                                                                                                  |
> | `initWorkspace` nutzt `fsFactory` / `WorkspaceFileSystem` (Trust Gate + Audit) | ⏳ **deferred** – Verwendet derzeit noch die alte Raw-`node:fs`-Implementierung der Bridge (inkl. §SV TOCTOU/Symlink-Schutz) ohne Regression; die Migration auf fsFactory/Audit bleibt späteren Schritten vorbehalten |
>
> Daher sind §3.4 (Sub-Service-Schnittstellen), §6 (/acp Northbound), `e2e.test.ts` in §7.1 und die PR-Beschreibung in §10 allesamt **Ziel-/Zukunftsbereiche** und in diesem PR nicht implementiert.

---

## 1. Architektur und Abgrenzung

### 1.1 Ziel-Schichtenarchitektur

```
                          CLIENTS
   webui    SDK/channels(via REST)    Zed/Goose(/acp)    future
     │             │                       │
═════╪═════════════╪═══════════════════════╪═════════════ L1 transport (dünn)
   REST+SSE      REST+SSE              /acp (jsonrpc/sse)
   server.ts                           acpHttp/
     └─────────────┴───────────────────────┘
                          │ Business/trust/audit immer nach L2 verlagern
═════════════════════════╪═══════════════════════════════ L2 Anwendungsschicht
   ┌──────────────────────────┐   ┌─────────────────────────────────┐
   │ AcpSessionBridge          │   │ DaemonWorkspaceService (facade)  │
   │ (← umbenannt von HttpAcpBridge)│  │  ┌──────────────────────────┐   │
   │ • channel/session lifecycle│   │  │ FileService              │   │
   │ • prompt / cancel / close │   │  │ AuthService              │   │
   │ • EventBus / Berechtigungsprüfung│   │  │ AgentsService            │   │
   │ • Status-Introspektion abhängig vom Child│   │  │ MemoryService            │   │
   │   (mcp/skills/preflight)  │   │  └──────────────────────────┘   │
   └──────────┬───────────────┘   │  einheitlicher WorkspaceRequestContext│
              │                    └──────────┬──────────────────────┘
              │ L3 → child                    │
              ▼                               │ (rein lokal, kein Child-Zugriff)
══════════════════════════════════════════════════════════ L3 ACP-client
══════════════════════════════════════════════════════════ L4 agent
```

### 1.2 Entscheidungsfunktion für die Aufteilung

**Einzige Regel: Ist der Scope der Operation session- oder workspace-bezogen?**

- **session-scoped** (Operationen für eine bestimmte sessionId: prompt/cancel/close/model/approval/metadata/heartbeat) **→ verbleibt in `AcpSessionBridge`**
- **workspace-scoped** (Operationen für den gesamten Workspace: file/auth/agents/memory/mcp-status/skills/env/preflight/tool-toggle/init) **→ wandert in `DaemonWorkspaceService`**

Einige Workspace-Methoden müssen das Child abfragen (Status-Getter, restartMcpServer). Dies wird über einen **injected callback** an den Channel der Bridge delegiert; der Service selbst hält keine Connection.

### 1.3 Querschnittsabhängigkeiten: Callback-Injektion (keine gemeinsame Infra)

Derzeit werden `publishWorkspaceEvent` und `knownClientIds` von der Bridge gehalten (per-session bus fan-out / session-abgeleitet). Der Service nutzt sie über eine **einseitige Callback-Injektion**, ohne eine gemeinsame Infrastruktur-Schicht einzuführen.

**Begründung:**

1. Der EventBus ist ein per-session bus (`bridge.ts:1457`), der workspace-level bus ist in den Code-Kommentaren bereits für PR 24 vorgesehen (`bridge.ts:2611`).
2. `knownClientIds` ist ebenfalls vom session-attach state abgeleitet, die Kommentare weisen explizit darauf hin: "PR 24 will replace it" (`bridge.ts:2658`).
3. Beides sind bereits geplante, unabhängige Arbeitspakete. Sie zwangsweise in diesen PR zu integrieren, würde ein zusätzliches Refactoring bedeuten.
4. Die Callback-Injektion ist für den Service eine einseitige Abhängigkeit (er hält nur Funktionsreferenzen und weiß nicht, dass sie von der Bridge stammen). Sobald PR 24 implementiert ist, kann die Injektionsquelle einfach ausgetauscht werden, ohne die Service-Schnittstelle zu ändern.

**Harte Regeln:**

1. In `DaemonWorkspaceServiceDeps` dürfen keine Typreferenzen auf `AcpSessionBridge` erscheinen – es werden nur Funktionssignaturen verwendet.
2. Die Bridge stellt extern die zwei neuen Methoden `queryWorkspaceStatus` und `invokeWorkspaceCommand` bereit, damit der Service sie per Callback aufrufen kann. Intern wird weiterhin die bestehende `requestWorkspaceStatus` / `liveChannelInfo` + Timeout-Logik verwendet, es wird keine neue Abstraktion erstellt.

---

## 2. Konstruktionsreihenfolge und Dependency Injection

```ts
// Konstruktionsreihenfolge in runQwenServe.ts

// 1. fsFactory zuerst konstruieren (von beiden geteilt)
const fsFactory = resolveBridgeFsFactory({ ... });

// 2. bridge zuerst konstruieren (sie ist der Owner von session/channel/EventBus)
const bridge = createAcpSessionBridge({
  eventRingSize,
  boundWorkspace,
  fileSystem: createBridgeFileSystemAdapter(fsFactory),
  // ... andere bestehende Parameter bleiben unverändert
});

// 3. service danach konstruieren, empfängt das Callback-Set der bridge
const workspace = createDaemonWorkspaceService({
  fsFactory,
  deviceFlowRegistry,
  subagentManager,
  boundWorkspace,
  contextFilename,
  // Querschnitts-Callbacks — der Service weiß nicht, dass sie von der bridge stammen
  publishWorkspaceEvent: (event) => bridge.publishWorkspaceEvent(event),
  knownClientIds: () => bridge.knownClientIds(),
  // Child-Delegations-Callbacks — workspace-scoped ext methods erreichen den agent über den channel der bridge
  queryWorkspaceStatus: (method, idle) => bridge.queryWorkspaceStatus(method, idle),
  invokeWorkspaceCommand: (method, params, opts) => bridge.invokeWorkspaceCommand(method, params, opts),
});

// 4. beide an server routes + /acp handler übergeben
createServeApp({ bridge, workspace, ... });
```

**Die Konstruktionsreihenfolge bridge → service ist eine harte Abhängigkeit** (der Service benötigt die Methoden der bridge-Instanz als Callback-Quelle).

---

## 3. Interne Struktur von DaemonWorkspaceService

### 3.1 Verzeichnisstruktur

```
packages/cli/src/serve/workspace-service/
├── types.ts            ← WorkspaceRequestContext + Sub-Service-Schnittstellen
├── index.ts            ← Facade-Factory (createDaemonWorkspaceService)
├── fileService.ts      ← wrappt fsFactory
├── authService.ts      ← wrappt DeviceFlowRegistry
├── agentsService.ts    ← wrappt SubagentManager
├── memoryService.ts    ← wrappt Memory-Dateioperationen
└── __tests__/
    ├── fileService.test.ts
    ├── authService.test.ts
    ├── agentsService.test.ts
    ├── memoryService.test.ts
    └── e2e.test.ts
```

### 3.2 Facade-Schnittstelle

```ts
export interface DaemonWorkspaceService {
  file: FileService;
  auth: AuthService;
  agents: AgentsService;
  memory: MemoryService;

  // rein lokal
  initWorkspace(
    opts: InitWorkspaceOpts,
    ctx: WorkspaceRequestContext,
  ): Promise<void>;
  setToolEnabled(
    toolName: string,
    enabled: boolean,
    ctx: WorkspaceRequestContext,
  ): Promise<ToolToggleResult>;

  // über Callback an Child delegiert
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

> `listWorkspaceSessions` / `recordHeartbeat` / `getHeartbeatState` / `publishWorkspaceEvent` / `knownClientIds` verbleiben in der Bridge – sie greifen auf den internen per-session state der Bridge zu (`byId` map / session bus) und sind session-abgeleitete Infrastruktur. Der Service konsumiert sie über Callbacks und besitzt sie nicht direkt.

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

  // Querschnitts-Callbacks (session-abgeleitete Infrastruktur)
  publishWorkspaceEvent: (event: WorkspaceEvent) => void;
  knownClientIds: () => Set<string>;

  // Child-Delegations-Callbacks (workspace-scoped ext methods erreichen den agent über den bridge channel)
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

### 3.4 Schnittstellen der Sub-Services

| Sub-Service | Methode | Benötigte Deps | Bestehende Quelle |
| ------------- | --------------------------------------------------------------------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| FileService   | `read`, `readBytes`, `write`, `edit`, `glob`, `list`, `stat`                | `fsFactory`, `boundWorkspace`                                       | `serve/routes/workspaceFileRead.ts`, `workspaceFileWrite.ts`, `serve/fs/` |
| AuthService   | `startFlow`, `getFlowStatus(flowId)`, `cancelFlow(flowId)`, `getAuthStatus` | `deviceFlowRegistry`                                                | `serve/auth/deviceFlow.ts`, `server.ts:794-966`                           |
| AgentsService | `list`, `get(agentType)`, `create`, `update`, `delete`                      | `subagentManager`, `publishWorkspaceEvent`, `knownClientIds`        | `serve/workspaceAgents.ts`                                                |
| MemoryService | `list`, `read`, `write`, `delete`                                           | `fsFactory` oder direktes fs, `publishWorkspaceEvent`, `knownClientIds` | `serve/workspaceMemory.ts`                                                |

Der erste Parameter jeder Methode ist `ctx: WorkspaceRequestContext`, das Trust Gate wird einheitlich am Methodeneingang ausgeführt.

---

## 4. WorkspaceRequestContext

```ts
export interface WorkspaceRequestContext {
  originatorClientId?: string; // X-Qwen-Client-Id Header (kann bei Leseoperationen fehlen)
  sessionId?: string; // Audit-Verknüpfung (z. B. bei Operationen, die aus dem Session-Kontext initiiert werden)
  route: string; // Audit-Trail (z. B. "POST /file/write")
  workspaceCwd: string; // Trust-Boundary-Root
}
```

> `originatorClientId` ist optional – aktuelle reine Lese-Routen wie file read funktionieren auch ohne diesen Header normal (`clientId ?? undefined` wird an `fsFactory.forRequest` übergeben). Schreib-Routen validieren die Rechtmäßigkeit nur, wenn `clientId` **vorhanden** ist.

**Konstruktionsort**: Der L1-Route-Handler / `/acp`-Method-Handler extrahiert ihn aus den Request-Headern/Parametern und übergibt ihn an L2. L2 konsumiert ihn nur und extrahiert den HTTP-Kontext nicht selbst.

---

## 5. Verschlankung und Umbenennung von AcpSessionBridge

### 5.1 Aus der Bridge ausgelagerte Methoden

| Methode                          | Ziel                           | Mechanismus                                  | Begründung                                                           |
| ----------------------------- | ------------------------------ | ------------------------------------- | -------------------------------------------------------------- |
| `initWorkspace`               | `workspace.initWorkspace`      | Direkt ausgelagert (rein lokal)                      | Behebt gleichzeitig ein FIXME (Bridge hatte fsFactory nicht angebunden, Trust Gate / Audit wurde übersprungen) |
| `setWorkspaceToolEnabled`     | `workspace.setToolEnabled`     | Direkt ausgelagert (rein lokal)                      | Reines File-I/O + Event-Fan-out, Kommentar weist explizit auf "no ACP roundtrip" hin       |
| `getWorkspaceMcpStatus`       | `workspace.getMcpStatus`       | über `queryWorkspaceStatus` Callback   | Workspace-scoped Statusabfrage                                  |
| `getWorkspaceSkillsStatus`    | `workspace.getSkillsStatus`    | über `queryWorkspaceStatus` Callback   | Siehe oben                                                           |
| `getWorkspaceProvidersStatus` | `workspace.getProvidersStatus` | über `queryWorkspaceStatus` Callback   | Siehe oben                                                           |
| `getWorkspaceEnvStatus`       | `workspace.getEnvStatus`       | über `queryWorkspaceStatus` Callback   | Siehe oben                                                           |
| `getWorkspacePreflightStatus` | `workspace.getPreflightStatus` | über `queryWorkspaceStatus` Callback   | Siehe oben                                                           |
| `restartMcpServer`            | `workspace.restartMcpServer`   | über `invokeWorkspaceCommand` Callback | Workspace-scoped Mutation                                      |
> `listWorkspaceSessions` / `recordHeartbeat` / `getHeartbeatState` / `updateSessionMetadata` verbleiben in der Bridge – sie greifen auf die interne `byId`-Session-Map der Bridge zu und sind session-scoped Operationen.

### 5.2 Was in der Bridge verbleibt

- Gesamter Session/Channel-Lifecycle (spawn/load/resume/send/cancel/close/kill/detach)
- EventBus-Holder + `publishWorkspaceEvent` Fan-out-Implementierung (für die Nutzung durch Service-Callbacks)
- `knownClientIds` (für die Nutzung durch Service-Callbacks)
- `queryWorkspaceStatus` / `invokeWorkspaceCommand` (neu exponiert, kapselt Channel + Timeout + Error, zur Delegierung durch Service-Callbacks)
- Berechtigungs-Mediator
- Session-Konfigurationsänderungen (model/approvalMode/recap)
- Session-Status (context/supportedCommands/metadata/heartbeat/listSessions)

### 5.3 Umbenennungen

- `HttpAcpBridge` → `AcpSessionBridge`
- `createHttpAcpBridge` → `createAcpSessionBridge`
- Datei `serve/httpAcpBridge.ts` → `serve/acpSessionBridge.ts`

Keine externen Paket-Consumer (verifiziert, dass es keine Referenzen außerhalb von `packages/cli/src/serve/` und `packages/acp-bridge/src/` gibt), intern sicher.

---

## 6. /acp Northbound Ext Methods

### 6.1 Namensraum

`qwen/workspace/...` (zur Abgrenzung vom bestehenden `qwen/control/...`):

- `qwen/control/...` = Daemon→Child Weiterleitung von Befehlen (southbound, über AcpSessionBridge)
- `qwen/workspace/...` = Daemon-lokale Workspace-Operationen (northbound, endend bei DaemonWorkspaceService)

> Muss noch von chiga0 bestätigt werden. Bei einer Änderung des Namensraums muss nur das Methoden-Präfix ausgetauscht werden, was die Architektur nicht beeinflusst.

### 6.2 Methodenliste

| Methode                           | Zugehöriges REST                                | L2-Aufruf                                           |
| --------------------------------- | ----------------------------------------------- | --------------------------------------------------- |
| `qwen/workspace/fs/read`          | `GET /file?path=...`                            | `workspace.file.read(ctx, path)`                    |
| `qwen/workspace/fs/readBytes`     | `GET /file/bytes?path=...`                      | `workspace.file.readBytes(ctx, path)`               |
| `qwen/workspace/fs/write`         | `POST /file/write`                              | `workspace.file.write(ctx, path, content)`          |
| `qwen/workspace/fs/edit`          | `POST /file/edit`                               | `workspace.file.edit(ctx, path, edits)`             |
| `qwen/workspace/fs/glob`          | `GET /glob?pattern=...`                         | `workspace.file.glob(ctx, pattern)`                 |
| `qwen/workspace/fs/list`          | `GET /list?path=...`                            | `workspace.file.list(ctx, path)`                    |
| `qwen/workspace/fs/stat`          | `GET /stat?path=...`                            | `workspace.file.stat(ctx, path)`                    |
| `qwen/workspace/auth/start`       | `POST /workspace/auth/device-flow`              | `workspace.auth.startFlow(ctx)`                     |
| `qwen/workspace/auth/status`      | `GET /workspace/auth/status`                    | `workspace.auth.getAuthStatus(ctx)`                 |
| `qwen/workspace/auth/flow`        | `GET /workspace/auth/device-flow/:id`           | `workspace.auth.getFlowStatus(ctx, flowId)`         |
| `qwen/workspace/auth/cancel`      | `POST /workspace/auth/device-flow/:id` (cancel) | `workspace.auth.cancelFlow(ctx, flowId)`            |
| `qwen/workspace/agents/list`      | `GET /workspace/agents`                         | `workspace.agents.list(ctx)`                        |
| `qwen/workspace/agents/get`       | `GET /workspace/agents/:agentType`              | `workspace.agents.get(ctx, agentType)`              |
| `qwen/workspace/agents/create`    | `POST /workspace/agents`                        | `workspace.agents.create(ctx, spec)`                |
| `qwen/workspace/agents/update`    | `POST /workspace/agents/:agentType`             | `workspace.agents.update(ctx, agentType, spec)`     |
| `qwen/workspace/agents/delete`    | `DELETE /workspace/agents/:agentType`           | `workspace.agents.delete(ctx, agentType)`           |
| `qwen/workspace/memory/list`      | `GET /workspace/memory`                         | `workspace.memory.list(ctx)`                        |
| `qwen/workspace/memory/read`      | `GET /workspace/memory/:key`                    | `workspace.memory.read(ctx, key)`                   |
| `qwen/workspace/memory/write`     | `POST /workspace/memory`                        | `workspace.memory.write(ctx, key, content)`         |
| `qwen/workspace/memory/delete`    | `DELETE /workspace/memory/:key`                 | `workspace.memory.delete(ctx, key)`                 |
| `qwen/workspace/init`             | `POST /workspace/init`                          | `workspace.initWorkspace(ctx, opts)`                |
| `qwen/workspace/tool/toggle`      | `POST /workspace/tool/toggle`                   | `workspace.setToolEnabled(ctx, toolName, enabled)`  |
| `qwen/workspace/status/mcp`       | `GET /workspace/mcp`                            | `workspace.getMcpStatus()`                          |
| `qwen/workspace/status/skills`    | `GET /workspace/skills`                         | `workspace.getSkillsStatus()`                       |
| `qwen/workspace/status/providers` | `GET /workspace/providers`                      | `workspace.getProvidersStatus()`                    |
| `qwen/workspace/status/env`       | `GET /workspace/env`                            | `workspace.getEnvStatus()`                          |
| `qwen/workspace/status/preflight` | `GET /workspace/preflight`                      | `workspace.getPreflightStatus()`                    |
| `qwen/workspace/mcp/restart`      | `POST /workspace/mcp/restart`                   | `workspace.restartMcpServer(ctx, serverName, opts)` |

Beim Capabilities-Advertising werden diese Methoden in `_meta.qwen.methods` deklariert.

---

## 7. Liste der Dateiänderungen

### 7.1 Neu hinzugefügt

| Datei                                                     | Zweck                                              |
| --------------------------------------------------------- | -------------------------------------------------- |
| `serve/workspace-service/types.ts`                        | `WorkspaceRequestContext` + Sub-Service-Interfaces |
| `serve/workspace-service/index.ts`                        | Facade-Factory                                     |
| `serve/workspace-service/fileService.ts`                  | FileService-Implementierung                        |
| `serve/workspace-service/authService.ts`                  | AuthService-Implementierung                        |
| `serve/workspace-service/agentsService.ts`                | AgentsService-Implementierung                      |
| `serve/workspace-service/memoryService.ts`                | MemoryService-Implementierung                      |
| `serve/workspace-service/__tests__/fileService.test.ts`   | Unit-Test                                          |
| `serve/workspace-service/__tests__/authService.test.ts`   | Unit-Test                                          |
| `serve/workspace-service/__tests__/agentsService.test.ts` | Unit-Test                                          |
| `serve/workspace-service/__tests__/memoryService.test.ts` | Unit-Test                                          |
| `serve/workspace-service/__tests__/e2e.test.ts`           | End-to-End-REST ↔ /acp Äquivalenzprüfung         |

### 7.2 Geändert

| Datei                                                           | Änderung                                                                                                                                                                                |
| --------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `acp-bridge/src/bridge.ts`                                      | 8 Workspace-Methoden entfernt (initWorkspace / setWorkspaceToolEnabled / 5 Status-Getter / restartMcpServer); neu exponiert: `queryWorkspaceStatus` + `invokeWorkspaceCommand`; Factory-Funktion umbenannt |
| `acp-bridge/src/bridgeTypes.ts`                                 | Interface umbenannt `HttpAcpBridge` → `AcpSessionBridge`; 8 Workspace-Methodensignaturen entfernt; Signaturen für `queryWorkspaceStatus` + `invokeWorkspaceCommand` hinzugefügt                                            |
| `acp-bridge/src/bridgeOptions.ts`                               | JSDoc-Referenzen aktualisiert                                                                                                                                                           |
| `acp-bridge/src/status.ts`                                      | Klassennamen in Fehlermeldungen aktualisiert                                                                                                                                            |
| `cli/src/serve/httpAcpBridge.ts` → umbenannt zu `acpSessionBridge.ts` | Re-Export aktualisiert                                                                                                                                                                      |
| `cli/src/serve/runQwenServe.ts`                                 | `DaemonWorkspaceService` konstruiert, Callback injiziert, an Routes und /acp-Handler übergeben                                                                                           |
| `cli/src/serve/server.ts`                                       | Routes von direktem Aufruf von `fsFactory`/`DeviceFlowRegistry` umgestellt auf `workspace.file.*` / `workspace.auth.*`                                                                                       |
| `cli/src/serve/workspaceAgents.ts`                              | Business-Logik in `agentsService.ts` verschoben; Originaldatei wird zu einem dünnen Route-Handler-Wrapper (baut ctx auf → ruft Service auf)                                                                                             |
| `cli/src/serve/workspaceMemory.ts`                              | Dasselbe                                                                                                                                                                                |
| `cli/src/serve/routes/workspaceFileRead.ts`                     | Dasselbe                                                                                                                                                                                |
| `cli/src/serve/routes/workspaceFileWrite.ts`                    | Dasselbe                                                                                                                                                                                |
| `/acp`-Handler (in `acp-integration/` oder `serve/`)             | Northbound-Method-Dispatch hinzugefügt                                                                                                                                                     |

---

## 8. SDK-Kompatibilität und Fehlerformat

### 8.1 SDK-Abwärtskompatibilität

Die REST-API-Oberfläche (Pfade, HTTP-Methoden, Request/Response-JSON-Schema) bleibt unverändert. `DaemonClient` / `DaemonSessionClient` in `sdk-typescript` benötigen keine Änderungen.

Validierungsmethode: Die bestehenden `packages/sdk-typescript/test/unit/DaemonClient.test.ts` und `DaemonSessionClient.test.ts` müssen in diesem PR ohne Änderungen bestehen.

### 8.2 Fehlerformat bei Ablehnung durch das /acp Trust Gate

Beide Transportarten sind semantisch äquivalent, aber unterschiedlich kodiert:

| Szenario                          | REST                                       | /acp (JSON-RPC)                                                          |
| --------------------------------- | ------------------------------------------ | ------------------------------------------------------------------------ |
| Ungültiges/fehlendes Bearer-Token | `401 { error, code: "unauthorized" }`      | `{ error: { code: -32001, message: "unauthorized" } }`                   |
| Ungültige clientId                | `400 { error, code: "invalid_client_id" }` | `{ error: { code: -32602, message: "invalid_client_id", data: {...} } }` |
| Trust-Gate-Ablehnung (z. B. Path-Escape) | `403 { error, code: "forbidden" }`         | `{ error: { code: -32003, message: "forbidden", data: {...} } }`         |

> JSON-RPC-Error-Codes folgen dem [ACP error code registry](https://spec.acpprotocol.org) (der Standardbereich -32000 ~ -32099 ist für server-definierte Anwendungsfehler). Die spezifischen Code-Werte werden bei der Implementierung an die bestehende Error-Mapping-Logik von `/acp` (`acp-integration/errorCodes.ts`) angeglichen.

---

## 9. Teststrategie

| Schicht           | Testtyp                                                                 | Abdeckungsziel                                                 |
| ----------------- | ----------------------------------------------------------------------- | -------------------------------------------------------------- |
| Sub-Service-Unit  | Jest, mockt fsFactory / DeviceFlowRegistry / SubagentManager / Callbacks | Korrektheit der Business-Logik + Trust-Gate-Ablehnung ungültiger clientIds                  |
| Route-Integration | Bestehende Route-Tests umgestellt auf Service (prüft, dass HTTP-Oberfläche unverändert bleibt)                | Regressionsschutz, REST-Pfade brechen nicht                                    |
| E2e-Äquivalenzprüfung      | Startet echtes Serve + HTTP-Requests                                              | REST und `/acp` liefern für dieselbe Operation äquivalente Ergebnisse; Trust-Gate lehnt auf beiden Seiten konsistent ab |
### E2E-Validierungsmatrix

- File read/write: REST `GET /file` vs `/acp` `qwen/workspace/fs/read` → gleiches Ergebnis
- Agent CRUD: REST `POST /workspace/agents` vs `/acp` `qwen/workspace/agents/create` → gleiches Verhalten
- Trust-Gate-Rejection: Beide Pfade geben bei ungültiger `clientId` 403 zurück
- Workspace-Init: Validierung, dass `fsFactory` erfolgreich durchläuft + Audit-Trail-Erzeugung

---

## 10. PR-Struktur

Atomarer Commit in einem einzigen PR, enthält:

- Alle neu erstellten Dateien für `DaemonWorkspaceService`
- REST-Route-Handler werden umgestellt, um den Service aufzurufen
- Bridge verschlankt (8 Workspace-Methoden ausgelagert) + 2 neue Child-Delegationsmethoden freigegeben
- Umbenennung von `HttpAcpBridge` → `AcpSessionBridge`
- Hinzufügen von 27 neuen `/acp` Northbound-Ext-Methoden
- Vollständige Tests (Unit + Integration + E2E)

---

## 11. Explizit ausgeschlossen (Scope-Grenzen)

- Workspace-scoped EventBus (Thema für PR 24)
- Workspace-scoped ClientRegistry (Thema für PR 24)
- L2 ↔ L3-Aufteilung (`ClientSideConnection` aus der Bridge auslagern)
- REST als `/acp` Compat-Shim (langfristige Richtung)
- Vereinheitlichung des Channels-Standalone-Modus (Frage der unabhängigen Bereitstellungsform)
- Migration von `listWorkspaceSessions` / `recordHeartbeat` / `getHeartbeatState` / `updateSessionMetadata` (session-scoped, verbleiben an Ort und Stelle)
- Ownership-Übertragung von `publishWorkspaceEvent` / `knownClientIds` (Session-abgeleitete Infrastruktur, verbleibt bei der Bridge, Service konsumiert via Callback)

---

## 12. Von chiga0 zu bestätigende Entscheidungspunkte

1. `/acp` Northbound-Namespace: `qwen/workspace/...` vs. andere (z. B. Wiederverwendung von `qwen/control/...`)
2. Umbenennung im selben PR: Bevorzugt im selben PR, kann aber je nach Feedback ausgelagert werden

> Sollten diese beiden Punkte angepasst werden müssen, betrifft dies nur die Benennung und die Commit-Grenzen, nicht jedoch die Architektur.