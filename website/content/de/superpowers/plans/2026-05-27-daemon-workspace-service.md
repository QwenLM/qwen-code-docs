# DaemonWorkspaceService Implementierungsplan

> **Für agentische Arbeiter:** ERFORDERLICHE UNTER-FÄHIGKEIT: Verwenden Sie superpowers:subagent-driven-development (empfohlen) oder superpowers:executing-plans, um diesen Plan Aufgabe für Aufgabe umzusetzen. Schritte verwenden die Checkbox-Syntax (`- [ ]`) zur Nachverfolgung.

**Ziel:** Alle arbeitsbereichsbezogenen Fähigkeiten aus HttpAcpBridge in einen neuen DaemonWorkspaceService extrahieren, um /acp-Transportparität und eine ehrliche Umbenennung zu AcpSessionBridge zu ermöglichen.

**Architektur:** Bereichsbasierte Aufteilung – Arbeitsbereichsbezogene Operationen gehen an eine neue Fassade (DaemonWorkspaceService) mit 4 internen Subdiensten; sitzungsbezogene Operationen bleiben in der Bridge. Von Kindern abhängige Arbeitsbereichsoperationen delegieren über injizierte Callbacks. Sowohl REST als auch /acp rufen denselben L2-Dienst auf.

**Tech Stack:** TypeScript, Vitest, Express (REST-Routen), JSON-RPC (ACP), SuperTest (Integrationstests)

**Spezifikation:** `docs/superpowers/specs/2026-05-27-daemon-workspace-service-design.md`

---

## Dateizuordnung

### Neue Dateien

| Datei                                                                       | Verantwortung                                                              |
| --------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| `packages/cli/src/serve/workspace-service/types.ts`                         | WorkspaceRequestContext, Subdienst-Schnittstellen, Abhängigkeitsschnittstelle, Ergebnistypen |
| `packages/cli/src/serve/workspace-service/index.ts`                         | Fassadenfabrik `createDaemonWorkspaceService`                              |
| `packages/cli/src/serve/workspace-service/fileService.ts`                   | FileService – kapselt fsFactory                                             |
| `packages/cli/src/serve/workspace-service/authService.ts`                   | AuthService – kapselt DeviceFlowRegistry                                    |
| `packages/cli/src/serve/workspace-service/agentsService.ts`                 | AgentsService – kapselt SubagentManager                                     |
| `packages/cli/src/serve/workspace-service/memoryService.ts`                 | MemoryService – kapselt Speicherdateioperationen                            |
| `packages/cli/src/serve/workspace-service/__tests__/fileService.test.ts`   | FileService Unit-Tests                                                      |
| `packages/cli/src/serve/workspace-service/__tests__/authService.test.ts`   | AuthService Unit-Tests                                                      |
| `packages/cli/src/serve/workspace-service/__tests__/agentsService.test.ts` | AgentsService Unit-Tests                                                    |
| `packages/cli/src/serve/workspace-service/__tests__/memoryService.test.ts` | MemoryService Unit-Tests                                                    |
| `packages/cli/src/serve/workspace-service/__tests__/facade.test.ts`        | Fassaden- + arbeitsbereichsbezogene Methoden (Status/Tool/Init/Neustart) Unit-Tests |
| `packages/cli/src/serve/workspace-service/__tests__/e2e.test.ts`           | REST ↔ /acp Äquivalenz-End-to-End-Tests                                   |

### Geänderte Dateien

| Datei                                                                       | Änderung                                                                                               |
| --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `packages/acp-bridge/src/bridgeTypes.ts`                                     | Schnittstelle umbenennen + 8 Methoden entfernen + 2 neue Methoden hinzufügen                            |
| `packages/acp-bridge/src/bridge.ts`                                          | 8 Arbeitsbereichsmethoden entfernen, `queryWorkspaceStatus` + `invokeWorkspaceCommand` bereitstellen, Fabrik umbenennen |
| `packages/acp-bridge/src/bridgeOptions.ts`                                   | JSDoc-Referenzen aktualisieren                                                                         |
| `packages/acp-bridge/src/status.ts`                                          | Fehlermeldung-Klassennamen aktualisieren                                                               |
| `packages/cli/src/serve/httpAcpBridge.ts` → umbenannt nach `acpSessionBridge.ts` | Re-Exporte aktualisieren                                                                               |
| `packages/cli/src/serve/runQwenServe.ts`                                     | Arbeitsbereichsdienst konstruieren, Callbacks injizieren                                               |
| `packages/cli/src/serve/server.ts`                                           | Arbeitsbereichsrouten umleiten, um Dienst aufzurufen                                                   |
| `packages/cli/src/serve/workspaceAgents.ts`                                  | Geschäftslogik → agentsService extrahieren, als Routenhülle behalten                                    |
| `packages/cli/src/serve/workspaceMemory.ts`                                  | Geschäftslogik → memoryService extrahieren, als Routenhülle behalten                                    |
| `packages/cli/src/serve/routes/workspaceFileRead.ts`                         | Umleitung zu FileService                                                                               |
| `packages/cli/src/serve/routes/workspaceFileWrite.ts`                        | Umleitung zu FileService                                                                               |

---

## Aufgabe 1: Typen & Schnittstellen

**Dateien:**

- Erstellen: `packages/cli/src/serve/workspace-service/types.ts`

- [ ] **Schritt 1: Typendatei mit allen Schnittstellen erstellen**

```ts
// packages/cli/src/serve/workspace-service/types.ts
import type { WorkspaceFileSystemFactory } from '../fs/index.js';
import type { DeviceFlowRegistry } from '../auth/deviceFlow.js';
import type {
  ServeWorkspaceMcpStatus,
  ServeWorkspaceSkillsStatus,
  ServeWorkspaceProvidersStatus,
  ServeWorkspaceEnvStatus,
  ServeWorkspacePreflightStatus,
} from '@qwen-code/acp-bridge';

// --- Request Context ---

export interface WorkspaceRequestContext {
  originatorClientId?: string;
  sessionId?: string;
  route: string;
  workspaceCwd: string;
}

// --- Sub-service interfaces ---

export interface FileService {
  read(
    ctx: WorkspaceRequestContext,
    path: string,
    opts?: { maxBytes?: number },
  ): Promise<FileReadResult>;
  readBytes(ctx: WorkspaceRequestContext, path: string): Promise<Buffer>;
  write(
    ctx: WorkspaceRequestContext,
    path: string,
    content: string,
    opts?: { mode?: string },
  ): Promise<FileWriteResult>;
  edit(
    ctx: WorkspaceRequestContext,
    path: string,
    edits: FileEdit[],
  ): Promise<FileEditResult>;
  glob(ctx: WorkspaceRequestContext, pattern: string): Promise<string[]>;
  list(ctx: WorkspaceRequestContext, path: string): Promise<ListEntry[]>;
  stat(ctx: WorkspaceRequestContext, path: string): Promise<StatResult>;
}

export interface AuthService {
  startFlow(ctx: WorkspaceRequestContext): Promise<DeviceFlowStartResult>;
  getFlowStatus(
    ctx: WorkspaceRequestContext,
    flowId: string,
  ): Promise<DeviceFlowStatus>;
  cancelFlow(ctx: WorkspaceRequestContext, flowId: string): Promise<void>;
  getAuthStatus(ctx: WorkspaceRequestContext): Promise<AuthStatusResult>;
}

export interface AgentsService {
  list(ctx: WorkspaceRequestContext): Promise<AgentSummary[]>;
  get(ctx: WorkspaceRequestContext, agentType: string): Promise<AgentDetail>;
  create(
    ctx: WorkspaceRequestContext,
    spec: AgentCreateSpec,
  ): Promise<AgentDetail>;
  update(
    ctx: WorkspaceRequestContext,
    agentType: string,
    spec: AgentUpdateSpec,
  ): Promise<AgentDetail>;
  delete(
    ctx: WorkspaceRequestContext,
    agentType: string,
    opts?: { scope?: string },
  ): Promise<void>;
}

export interface MemoryService {
  list(ctx: WorkspaceRequestContext): Promise<MemoryEntry[]>;
  read(ctx: WorkspaceRequestContext, key: string): Promise<MemoryContent>;
  write(
    ctx: WorkspaceRequestContext,
    key: string,
    content: string,
  ): Promise<void>;
  delete(ctx: WorkspaceRequestContext, key: string): Promise<void>;
}

// --- Facade interface ---

export interface DaemonWorkspaceService {
  file: FileService;
  auth: AuthService;
  agents: AgentsService;
  memory: MemoryService;

  initWorkspace(
    opts: InitWorkspaceOpts,
    ctx: WorkspaceRequestContext,
  ): Promise<void>;
  setToolEnabled(
    toolName: string,
    enabled: boolean,
    ctx: WorkspaceRequestContext,
  ): Promise<ToolToggleResult>;

  getMcpStatus(): Promise<ServeWorkspaceMcpStatus>;
  getSkillsStatus(): Promise<ServeWorkspaceSkillsStatus>;
  getProvidersStatus(): Promise<ServeWorkspaceProvidersStatus>;
  getEnvStatus(): Promise<ServeWorkspaceEnvStatus>;
  getPreflightStatus(): Promise<ServeWorkspacePreflightStatus>;
  restartMcpServer(
    serverName: string,
    ctx: WorkspaceRequestContext,
    opts?: RestartMcpOpts,
  ): Promise<RestartMcpResult>;
}

// --- Deps (callback injection) ---

export interface WorkspaceEvent {
  type: string;
  data: Record<string, unknown>;
  originatorClientId?: string;
}

export interface DaemonWorkspaceServiceDeps {
  fsFactory: WorkspaceFileSystemFactory;
  deviceFlowRegistry: DeviceFlowRegistry;
  subagentManager: unknown; // type from workspaceAgents.ts — refine during implementation
  boundWorkspace: string;
  contextFilename: string;
  persistDisabledTools: (
    workspace: string,
    tool: string,
    enabled: boolean,
  ) => Promise<void>;

  // Cross-cutting callbacks (session-derived infrastructure)
  publishWorkspaceEvent: (event: WorkspaceEvent) => void;
  knownClientIds: () => Set<string>;

  // Child delegation callbacks
  queryWorkspaceStatus: <T>(method: string, idle: () => T) => Promise<T>;
  invokeWorkspaceCommand: <T>(
    method: string,
    params?: Record<string, unknown>,
    opts?: { timeoutMs?: number },
  ) => Promise<T>;
}

// --- Result types (refine from existing code during implementation) ---

export interface FileReadResult {
  content: string;
  truncated: boolean;
  bytesRead: number;
}
export interface FileWriteResult {
  ok: boolean;
  filePath: string;
  bytesWritten: number;
  mode?: string;
}
export interface FileEdit {
  oldText: string;
  newText: string;
}
export interface FileEditResult {
  ok: boolean;
  filePath: string;
}
export interface ListEntry {
  name: string;
  type: 'file' | 'directory' | 'symlink';
}
export interface StatResult {
  exists: boolean;
  isFile: boolean;
  isDirectory: boolean;
  size: number;
}
export interface DeviceFlowStartResult {
  flowId: string;
  verificationUri: string;
  userCode: string;
}
export interface DeviceFlowStatus {
  state: string /* refine from existing types */;
}
export interface AuthStatusResult {
  authenticated: boolean /* refine from existing */;
}
export interface AgentSummary {
  agentType: string /* refine */;
}
export interface AgentDetail {
  agentType: string /* refine */;
}
export interface AgentCreateSpec {
  agentType: string;
  content: string /* refine */;
}
export interface AgentUpdateSpec {
  content: string /* refine */;
}
export interface MemoryEntry {
  key: string /* refine */;
}
export interface MemoryContent {
  key: string;
  content: string;
}
export interface InitWorkspaceOpts {
  /* refine from bridge.ts:3256 */
}
export interface ToolToggleResult {
  toolName: string;
  enabled: boolean;
}
export interface RestartMcpOpts {
  entryIndex?: number;
}
export interface RestartMcpResult {
  serverName: string;
  restarted: boolean;
  durationMs?: number;
}
```

> **Hinweis:** Ergebnistypen, die mit `/* refine */` markiert sind, sollten während der Implementierung an die vorhandenen Antwortformen angepasst werden. Lesen Sie die aktuellen Routenhandler, um die genauen Felder zu erhalten.

- [ ] **Schritt 2: Überprüfen, ob Typen kompilieren**

Führen Sie aus: `cd packages/cli && npx tsc --noEmit src/serve/workspace-service/types.ts`
Erwartet: Keine Fehler (ggf. Importe basierend auf tatsächlichen Exportpfaden anpassen)

- [ ] **Schritt 3: Commit**

```bash
git add packages/cli/src/serve/workspace-service/types.ts
git commit -m "feat(serve): Typdefinitionen für DaemonWorkspaceService hinzufügen"
```

---

## Aufgabe 2: FileService (TDD)

**Dateien:**

- Erstellen: `packages/cli/src/serve/workspace-service/__tests__/fileService.test.ts`
- Erstellen: `packages/cli/src/serve/workspace-service/fileService.ts`

- [ ] **Schritt 1: Fehlschlagende Tests für FileService.read schreiben**

```ts
// packages/cli/src/serve/workspace-service/__tests__/fileService.test.ts
import { describe, it, expect, vi } from 'vitest';
import { createFileService } from '../fileService.js';
import type { WorkspaceRequestContext } from '../types.js';

function makeCtx(
  overrides: Partial<WorkspaceRequestContext> = {},
): WorkspaceRequestContext {
  return { route: 'GET /file', workspaceCwd: '/workspace', ...overrides };
}

describe('FileService', () => {
  describe('read', () => {
    it('calls fsFactory.forRequest with context and delegates to readFile', async () => {
      const mockFs = {
        readFile: vi.fn().mockResolvedValue({
          content: 'hello',
          truncated: false,
          bytesRead: 5,
        }),
      };
      const fsFactory = { forRequest: vi.fn().mockReturnValue(mockFs) };
      const service = createFileService({
        fsFactory: fsFactory as any,
        boundWorkspace: '/workspace',
      });

      const result = await service.read(
        makeCtx({ originatorClientId: 'c1' }),
        'src/app.ts',
      );

      expect(fsFactory.forRequest).toHaveBeenCalledWith({
        originatorClientId: 'c1',
        route: 'GET /file',
      });
      expect(mockFs.readFile).toHaveBeenCalledWith('src/app.ts', undefined);
      expect(result.content).toBe('hello');
    });

    it('works without originatorClientId (read-only, no auth required)', async () => {
      const mockFs = {
        readFile: vi
          .fn()
          .mockResolvedValue({ content: '', truncated: false, bytesRead: 0 }),
      };
      const fsFactory = { forRequest: vi.fn().mockReturnValue(mockFs) };
      const service = createFileService({
        fsFactory: fsFactory as any,
        boundWorkspace: '/workspace',
      });

      await service.read(makeCtx(), 'README.md');

      expect(fsFactory.forRequest).toHaveBeenCalledWith({
        originatorClientId: undefined,
        route: 'GET /file',
      });
    });
  });
});
```

- [ ] **Schritt 2: Test ausführen, um zu überprüfen, dass er fehlschlägt**

Führen Sie aus: `cd packages/cli && npx vitest run src/serve/workspace-service/__tests__/fileService.test.ts`
Erwartet: FEHLGESCHLAGEN – `createFileService` nicht gefunden

- [ ] **Schritt 3: FileService implementieren**

```ts
// packages/cli/src/serve/workspace-service/fileService.ts
import type { WorkspaceFileSystemFactory } from '../fs/index.js';
import type {
  FileService,
  WorkspaceRequestContext,
  FileReadResult,
  FileWriteResult,
  FileEdit,
  FileEditResult,
  ListEntry,
  StatResult,
} from './types.js';

export interface FileServiceDeps {
  fsFactory: WorkspaceFileSystemFactory;
  boundWorkspace: string;
}

export function createFileService(deps: FileServiceDeps): FileService {
  const { fsFactory } = deps;

  function scopedFs(ctx: WorkspaceRequestContext) {
    return fsFactory.forRequest({
      originatorClientId: ctx.originatorClientId,
      route: ctx.route,
      ...(ctx.sessionId ? { sessionId: ctx.sessionId } : {}),
    });
  }

  return {
    async read(ctx, path, opts) {
      const fs = scopedFs(ctx);
      return fs.readFile(path, opts?.maxBytes);
    },
    async readBytes(ctx, path) {
      const fs = scopedFs(ctx);
      return fs.readFileBytes(path);
    },
    async write(ctx, path, content, opts) {
      const fs = scopedFs(ctx);
      return fs.writeFile(path, content, opts);
    },
    async edit(ctx, path, edits) {
      const fs = scopedFs(ctx);
      return fs.editFile(path, edits);
    },
    async glob(ctx, pattern) {
      const fs = scopedFs(ctx);
      return fs.glob(pattern);
    },
    async list(ctx, path) {
      const fs = scopedFs(ctx);
      return fs.listDirectory(path);
    },
    async stat(ctx, path) {
      const fs = scopedFs(ctx);
      return fs.stat(path);
    },
  };
}
```

> **Wichtig:** Die Methodennamen auf `WorkspaceFileSystem` (`readFile`, `readFileBytes`, `writeFile`, `editFile`, `glob`, `listDirectory`, `stat`) müssen anhand der tatsächlichen Schnittstelle in `packages/cli/src/serve/fs/workspaceFileSystem.ts` überprüft werden. Passen Sie sie an, falls sie abweichen.

- [ ] **Schritt 4: Test ausführen, um zu überprüfen, dass er bestanden wird**

Führen Sie aus: `cd packages/cli && npx vitest run src/serve/workspace-service/__tests__/fileService.test.ts`
Erwartet: BESTANDEN

- [ ] **Schritt 5: Tests für write hinzufügen (Trust-Gate prüft clientId, falls vorhanden)**

Fügen Sie zur Testdatei hinzu:

```ts
describe('write', () => {
  it('passes originatorClientId to forRequest for audit', async () => {
    const mockFs = {
      writeFile: vi.fn().mockResolvedValue({
        ok: true,
        filePath: '/workspace/f.ts',
        bytesWritten: 3,
      }),
    };
    const fsFactory = { forRequest: vi.fn().mockReturnValue(mockFs) };
    const service = createFileService({
      fsFactory: fsFactory as any,
      boundWorkspace: '/workspace',
    });

    await service.write(
      makeCtx({ originatorClientId: 'c1', route: 'POST /file/write' }),
      'f.ts',
      'abc',
    );

    expect(fsFactory.forRequest).toHaveBeenCalledWith({
      originatorClientId: 'c1',
      route: 'POST /file/write',
    });
    expect(mockFs.writeFile).toHaveBeenCalledWith('f.ts', 'abc', undefined);
  });
});
```

- [ ] **Schritt 6: Vollständige FileService-Tests ausführen**

Führen Sie aus: `cd packages/cli && npx vitest run src/serve/workspace-service/__tests__/fileService.test.ts`
Erwartet: Alle BESTANDEN

- [ ] **Schritt 7: Commit**

```bash
git add packages/cli/src/serve/workspace-service/fileService.ts packages/cli/src/serve/workspace-service/__tests__/fileService.test.ts
git commit -m "feat(serve): FileService als Wrapper für fsFactory hinzufügen (TDD)"
```

---

## Aufgabe 3: AuthService (TDD)

**Dateien:**

- Erstellen: `packages/cli/src/serve/workspace-service/__tests__/authService.test.ts`
- Erstellen: `packages/cli/src/serve/workspace-service/authService.ts`

- [ ] **Schritt 1: Vorhandene Auth-Routenlogik lesen**

Lesen Sie: `packages/cli/src/serve/server.ts:794-966` (Device-Flow-Routen) und `packages/cli/src/serve/auth/deviceFlow.ts`, um die DeviceFlowRegistry-Schnittstelle zu verstehen.

- [ ] **Schritt 2: Fehlschlagenden Test schreiben**

```ts
// packages/cli/src/serve/workspace-service/__tests__/authService.test.ts
import { describe, it, expect, vi } from 'vitest';
import { createAuthService } from '../authService.js';
import type { WorkspaceRequestContext } from '../types.js';

const ctx: WorkspaceRequestContext = {
  route: 'POST /workspace/auth/device-flow',
  workspaceCwd: '/w',
};

describe('AuthService', () => {
  it('startFlow delegates to registry.start and returns flowId + verificationUri + userCode', async () => {
    const registry = {
      start: vi.fn().mockReturnValue({
        id: 'flow-1',
        verificationUri: 'https://auth.example/device',
        userCode: 'ABCD-1234',
      }),
    };
    const service = createAuthService({ deviceFlowRegistry: registry as any });

    const result = await service.startFlow(ctx);

    expect(registry.start).toHaveBeenCalled();
    expect(result.flowId).toBe('flow-1');
    expect(result.verificationUri).toBe('https://auth.example/device');
  });

  it('cancelFlow delegates to registry.cancel', async () => {
    const registry = { cancel: vi.fn().mockReturnValue({ cancelled: true }) };
    const service = createAuthService({ deviceFlowRegistry: registry as any });

    await service.cancelFlow(ctx, 'flow-1');

    expect(registry.cancel).toHaveBeenCalledWith('flow-1', undefined);
  });
});
```
- [ ] **Schritt 3: Test ausführen – Fehlschlag bestätigen**

Ausführen: `cd packages/cli && npx vitest run src/serve/workspace-service/__tests__/authService.test.ts`
Erwartet: FAIL

- [ ] **Schritt 4: AuthService implementieren**

```ts
// packages/cli/src/serve/workspace-service/authService.ts
import type { DeviceFlowRegistry } from '../auth/deviceFlow.js';
import type {
  AuthService,
  WorkspaceRequestContext,
  DeviceFlowStartResult,
  DeviceFlowStatus,
  AuthStatusResult,
} from './types.js';

export interface AuthServiceDeps {
  deviceFlowRegistry: DeviceFlowRegistry;
}

export function createAuthService(deps: AuthServiceDeps): AuthService {
  const { deviceFlowRegistry } = deps;

  return {
    async startFlow(ctx) {
      const flow = deviceFlowRegistry.start(ctx.originatorClientId);
      return {
        flowId: flow.id,
        verificationUri: flow.verificationUri,
        userCode: flow.userCode,
      };
    },
    async getFlowStatus(ctx, flowId) {
      return deviceFlowRegistry.get(flowId);
    },
    async cancelFlow(ctx, flowId) {
      deviceFlowRegistry.cancel(flowId, ctx.originatorClientId);
    },
    async getAuthStatus(_ctx) {
      return deviceFlowRegistry.getStatus();
    },
  };
}
```

> [!note]
> Methodenamen auf `DeviceFlowRegistry` (`start`, `get`, `cancel`, `getStatus`) müssen gegen `packages/cli/src/serve/auth/deviceFlow.ts` verifiziert werden. Signatur bei Bedarf anpassen.

- [ ] **Schritt 5: Test ausführen – Bestehen bestätigen**

Ausführen: `cd packages/cli && npx vitest run src/serve/workspace-service/__tests__/authService.test.ts`
Erwartet: PASS

- [ ] **Schritt 6: Commit**

```bash
git add packages/cli/src/serve/workspace-service/authService.ts packages/cli/src/serve/workspace-service/__tests__/authService.test.ts
git commit -m "feat(serve): add AuthService wrapping DeviceFlowRegistry (TDD)"
```

---

## Aufgabe 4: AgentsService (TDD)

**Dateien:**

- Erstellen: `packages/cli/src/serve/workspace-service/__tests__/agentsService.test.ts`
- Erstellen: `packages/cli/src/serve/workspace-service/agentsService.ts`

- [ ] **Schritt 1: Vorhandene Agent-Logik lesen**

Lesen: `packages/cli/src/serve/workspaceAgents.ts` – die Geschäftslogik extrahieren (Validierung, SubagentManager-Aufrufe, Event-Publishing). Hinweis: Diese Datei ist ~700+ Zeilen lang, mit Routing-Logik vermischt.

- [ ] **Schritt 2: Fehlschlagenden Test schreiben – list + clientId-Validierung**

```ts
// packages/cli/src/serve/workspace-service/__tests__/agentsService.test.ts
import { describe, it, expect, vi } from 'vitest';
import { createAgentsService } from '../agentsService.js';
import type { WorkspaceRequestContext } from '../types.js';

const ctx: WorkspaceRequestContext = {
  route: 'GET /workspace/agents',
  workspaceCwd: '/w',
  originatorClientId: 'c1',
};

describe('AgentsService', () => {
  it('list returns agents from subagentManager', async () => {
    const subagentManager = {
      list: vi.fn().mockResolvedValue([{ agentType: 'reviewer' }]),
    };
    const deps = {
      subagentManager,
      publishWorkspaceEvent: vi.fn(),
      knownClientIds: () => new Set(['c1']),
    };
    const service = createAgentsService(deps as any);

    const result = await service.list(ctx);

    expect(result).toEqual([{ agentType: 'reviewer' }]);
  });

  it('create publishes workspace event after success', async () => {
    const subagentManager = {
      create: vi
        .fn()
        .mockResolvedValue({ agentType: 'helper', content: '...' }),
    };
    const publishWorkspaceEvent = vi.fn();
    const deps = {
      subagentManager,
      publishWorkspaceEvent,
      knownClientIds: () => new Set(['c1']),
    };
    const service = createAgentsService(deps as any);

    await service.create(ctx, { agentType: 'helper', content: 'prompt' });

    expect(publishWorkspaceEvent).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'agent_created' }),
    );
  });

  it('rejects unknown clientId on mutation', async () => {
    const deps = {
      subagentManager: { create: vi.fn() },
      publishWorkspaceEvent: vi.fn(),
      knownClientIds: () => new Set(['c2']), // c1 not in set
    };
    const service = createAgentsService(deps as any);

    await expect(
      service.create(ctx, { agentType: 'x', content: '' }),
    ).rejects.toThrow(/not registered/);
  });
});
```

- [ ] **Schritt 3: Test ausführen – Fehlschlag bestätigen**

Ausführen: `cd packages/cli && npx vitest run src/serve/workspace-service/__tests__/agentsService.test.ts`
Erwartet: FAIL

- [ ] **Schritt 4: AgentsService implementieren**

Geschäftslogik aus `packages/cli/src/serve/workspaceAgents.ts` extrahieren in:

```ts
// packages/cli/src/serve/workspace-service/agentsService.ts
import type {
  AgentsService,
  WorkspaceRequestContext,
  WorkspaceEvent,
} from './types.js';

export interface AgentsServiceDeps {
  subagentManager: any; // refine type from workspaceAgents.ts
  publishWorkspaceEvent: (event: WorkspaceEvent) => void;
  knownClientIds: () => Set<string>;
}

function validateClientId(
  deps: AgentsServiceDeps,
  ctx: WorkspaceRequestContext,
): void {
  if (
    ctx.originatorClientId &&
    !deps.knownClientIds().has(ctx.originatorClientId)
  ) {
    throw new Error(
      `Client id "${ctx.originatorClientId}" is not registered for this workspace`,
    );
  }
}

export function createAgentsService(deps: AgentsServiceDeps): AgentsService {
  return {
    async list(_ctx) {
      return deps.subagentManager.list();
    },
    async get(_ctx, agentType) {
      return deps.subagentManager.get(agentType);
    },
    async create(ctx, spec) {
      validateClientId(deps, ctx);
      const result = await deps.subagentManager.create(spec);
      deps.publishWorkspaceEvent({
        type: 'agent_created',
        data: { agentType: spec.agentType },
        originatorClientId: ctx.originatorClientId,
      });
      return result;
    },
    async update(ctx, agentType, spec) {
      validateClientId(deps, ctx);
      const result = await deps.subagentManager.update(agentType, spec);
      deps.publishWorkspaceEvent({
        type: 'agent_updated',
        data: { agentType },
        originatorClientId: ctx.originatorClientId,
      });
      return result;
    },
    async delete(ctx, agentType, opts) {
      validateClientId(deps, ctx);
      await deps.subagentManager.delete(agentType, opts);
      deps.publishWorkspaceEvent({
        type: 'agent_deleted',
        data: { agentType },
        originatorClientId: ctx.originatorClientId,
      });
    },
  };
}
```

> [!important]
> Das tatsächliche SubagentManager-Interface und die Event-Typen müssen während der Implementierung aus `workspaceAgents.ts` extrahiert werden. Oben ist das Muster; genaue Methodennamen/Parameter können abweichen.

- [ ] **Schritt 5: Test ausführen – Bestehen bestätigen**

Ausführen: `cd packages/cli && npx vitest run src/serve/workspace-service/__tests__/agentsService.test.ts`
Erwartet: PASS

- [ ] **Schritt 6: Commit**

```bash
git add packages/cli/src/serve/workspace-service/agentsService.ts packages/cli/src/serve/workspace-service/__tests__/agentsService.test.ts
git commit -m "feat(serve): add AgentsService with clientId validation and event publish (TDD)"
```

---

## Aufgabe 5: MemoryService (TDD)

**Dateien:**

- Erstellen: `packages/cli/src/serve/workspace-service/__tests__/memoryService.test.ts`
- Erstellen: `packages/cli/src/serve/workspace-service/memoryService.ts`

- [ ] **Schritt 1: Vorhandene Memory-Logik lesen**

Lesen: `packages/cli/src/serve/workspaceMemory.ts` – verstehen, wie Memory-CRUD funktioniert (vermutlich dateibasiert mit `writeWorkspaceContextFile` oder ähnlich).

- [ ] **Schritt 2: Fehlschlagenden Test schreiben**

```ts
// packages/cli/src/serve/workspace-service/__tests__/memoryService.test.ts
import { describe, it, expect, vi } from 'vitest';
import { createMemoryService } from '../memoryService.js';
import type { WorkspaceRequestContext } from '../types.js';

const ctx: WorkspaceRequestContext = {
  route: 'POST /workspace/memory',
  workspaceCwd: '/w',
  originatorClientId: 'c1',
};

describe('MemoryService', () => {
  it('write publishes workspace event', async () => {
    const publishWorkspaceEvent = vi.fn();
    const deps = {
      // mock whatever memory backend is used
      publishWorkspaceEvent,
      knownClientIds: () => new Set(['c1']),
      boundWorkspace: '/w',
    };
    const service = createMemoryService(deps as any);

    await service.write(ctx, 'user-prefs', 'dark mode');

    expect(publishWorkspaceEvent).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'memory_written' }),
    );
  });

  it('rejects unknown clientId on write', async () => {
    const deps = {
      publishWorkspaceEvent: vi.fn(),
      knownClientIds: () => new Set(['other']),
      boundWorkspace: '/w',
    };
    const service = createMemoryService(deps as any);

    await expect(service.write(ctx, 'key', 'val')).rejects.toThrow(
      /not registered/,
    );
  });
});
```

- [ ] **Schritt 3: MemoryService implementieren**

Logik aus `packages/cli/src/serve/workspaceMemory.ts` extrahieren. Muster identisch zu AgentsService: clientId bei Mutationen validieren, an Backend delegieren, Event veröffentlichen.

- [ ] **Schritt 4: Tests ausführen – Bestehen bestätigen**

Ausführen: `cd packages/cli && npx vitest run src/serve/workspace-service/__tests__/memoryService.test.ts`
Erwartet: PASS

- [ ] **Schritt 5: Commit**

```bash
git add packages/cli/src/serve/workspace-service/memoryService.ts packages/cli/src/serve/workspace-service/__tests__/memoryService.test.ts
git commit -m "feat(serve): add MemoryService with event publish (TDD)"
```

---

## Aufgabe 6: Fassade + Workspace-Scoped-Methoden (TDD)

**Dateien:**

- Erstellen: `packages/cli/src/serve/workspace-service/__tests__/facade.test.ts`
- Erstellen: `packages/cli/src/serve/workspace-service/index.ts`

- [ ] **Schritt 1: Fehlschlagenden Test für Fassaden-Konstruktion + Status-Delegation schreiben**

```ts
// packages/cli/src/serve/workspace-service/__tests__/facade.test.ts
import { describe, it, expect, vi } from 'vitest';
import { createDaemonWorkspaceService } from '../index.js';
import type { WorkspaceRequestContext } from '../types.js';

const ctx: WorkspaceRequestContext = {
  route: 'POST /workspace/init',
  workspaceCwd: '/w',
};

describe('DaemonWorkspaceService', () => {
  function makeDeps(overrides = {}) {
    return {
      fsFactory: { forRequest: vi.fn().mockReturnValue({}) },
      deviceFlowRegistry: {},
      subagentManager: {},
      boundWorkspace: '/w',
      contextFilename: 'QWEN.md',
      persistDisabledTools: vi.fn(),
      publishWorkspaceEvent: vi.fn(),
      knownClientIds: () => new Set<string>(),
      queryWorkspaceStatus: vi
        .fn()
        .mockImplementation((_m, idle) => Promise.resolve(idle())),
      invokeWorkspaceCommand: vi.fn(),
      ...overrides,
    };
  }

  it('exposes file, auth, agents, memory sub-services', () => {
    const service = createDaemonWorkspaceService(makeDeps());
    expect(service.file).toBeDefined();
    expect(service.auth).toBeDefined();
    expect(service.agents).toBeDefined();
    expect(service.memory).toBeDefined();
  });

  it('getMcpStatus delegates to queryWorkspaceStatus callback', async () => {
    const idle = { servers: [] };
    const queryWorkspaceStatus = vi.fn().mockResolvedValue(idle);
    const service = createDaemonWorkspaceService(
      makeDeps({ queryWorkspaceStatus }),
    );

    const result = await service.getMcpStatus();

    expect(queryWorkspaceStatus).toHaveBeenCalled();
    expect(result).toBe(idle);
  });

  it('setToolEnabled calls persistDisabledTools + publishes event', async () => {
    const persistDisabledTools = vi.fn().mockResolvedValue(undefined);
    const publishWorkspaceEvent = vi.fn();
    const service = createDaemonWorkspaceService(
      makeDeps({ persistDisabledTools, publishWorkspaceEvent }),
    );

    const result = await service.setToolEnabled('Bash', false, ctx);

    expect(persistDisabledTools).toHaveBeenCalledWith('/w', 'Bash', false);
    expect(publishWorkspaceEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'tool_toggled',
        data: { toolName: 'Bash', enabled: false },
      }),
    );
    expect(result).toEqual({ toolName: 'Bash', enabled: false });
  });
});
```

- [ ] **Schritt 2: Test ausführen – Fehlschlag bestätigen**

Ausführen: `cd packages/cli && npx vitest run src/serve/workspace-service/__tests__/facade.test.ts`
Erwartet: FAIL

- [ ] **Schritt 3: Fassaden-Fabrik implementieren**

```ts
// packages/cli/src/serve/workspace-service/index.ts
import type {
  DaemonWorkspaceService,
  DaemonWorkspaceServiceDeps,
} from './types.js';
import { createFileService } from './fileService.js';
import { createAuthService } from './authService.js';
import { createAgentsService } from './agentsService.js';
import { createMemoryService } from './memoryService.js';
import { SERVE_STATUS_EXT_METHODS } from '@qwen-code/acp-bridge';

export {
  type DaemonWorkspaceService,
  type DaemonWorkspaceServiceDeps,
  type WorkspaceRequestContext,
} from './types.js';

export function createDaemonWorkspaceService(
  deps: DaemonWorkspaceServiceDeps,
): DaemonWorkspaceService {
  const file = createFileService({
    fsFactory: deps.fsFactory,
    boundWorkspace: deps.boundWorkspace,
  });
  const auth = createAuthService({
    deviceFlowRegistry: deps.deviceFlowRegistry,
  });
  const agents = createAgentsService({
    subagentManager: deps.subagentManager,
    publishWorkspaceEvent: deps.publishWorkspaceEvent,
    knownClientIds: deps.knownClientIds,
  });
  const memory = createMemoryService({
    publishWorkspaceEvent: deps.publishWorkspaceEvent,
    knownClientIds: deps.knownClientIds,
    boundWorkspace: deps.boundWorkspace,
  });

  return {
    file,
    auth,
    agents,
    memory,

    async initWorkspace(opts, ctx) {
      // Logik aus bridge.ts:3256 migrieren – lokale Dateierstellung via fsFactory
      const fs = deps.fsFactory.forRequest({
        originatorClientId: ctx.originatorClientId,
        route: ctx.route,
      });
      // ... Pfadvalidierung + Dateierstellung (aus bridge.ts:3256-3350 kopieren)
    },

    async setToolEnabled(toolName, enabled, ctx) {
      await deps.persistDisabledTools(deps.boundWorkspace, toolName, enabled);
      deps.publishWorkspaceEvent({
        type: 'tool_toggled',
        data: { toolName, enabled },
        ...(ctx.originatorClientId
          ? { originatorClientId: ctx.originatorClientId }
          : {}),
      });
      return { toolName, enabled };
    },

    async getMcpStatus() {
      return deps.queryWorkspaceStatus(
        SERVE_STATUS_EXT_METHODS.workspaceMcp,
        () => createIdleMcpStatus(deps.boundWorkspace),
      );
    },
    async getSkillsStatus() {
      return deps.queryWorkspaceStatus(
        SERVE_STATUS_EXT_METHODS.workspaceSkills,
        () => ({ skills: [] }),
      );
    },
    async getProvidersStatus() {
      return deps.queryWorkspaceStatus(
        SERVE_STATUS_EXT_METHODS.workspaceProviders,
        () => ({ providers: [] }),
      );
    },
    async getEnvStatus() {
      return deps.queryWorkspaceStatus(
        SERVE_STATUS_EXT_METHODS.workspaceEnv,
        () => ({ env: [] }),
      );
    },
    async getPreflightStatus() {
      return deps.queryWorkspaceStatus(
        SERVE_STATUS_EXT_METHODS.workspacePreflight,
        () => ({ checks: [] }),
      );
    },

    async restartMcpServer(serverName, ctx, opts) {
      const params: Record<string, unknown> = { serverName };
      if (opts?.entryIndex !== undefined)
        params['entryIndex'] = opts.entryIndex;
      const result = await deps.invokeWorkspaceCommand(
        SERVE_STATUS_EXT_METHODS.workspaceMcpRestart ??
          'qwen/control/workspace/mcp/restart',
        params,
      );
      deps.publishWorkspaceEvent({
        type: 'mcp_server_restarted',
        data: { serverName, ...(result as object) },
        ...(ctx.originatorClientId
          ? { originatorClientId: ctx.originatorClientId }
          : {}),
      });
      return result as any;
    },
  };
}
```

> [!critical]
> Die `initWorkspace`-Implementierung muss aus `bridge.ts:3256-3350` kopiert werden (Pfadvalidierung, Symlink-Prüfungen, Dateierstellung). Statt rohem `node:fs/promises` `fsFactory.forRequest(ctx)` verwenden – das behebt den bestehenden FIXME.

- [ ] **Schritt 4: Test ausführen – Bestehen bestätigen**

Ausführen: `cd packages/cli && npx vitest run src/serve/workspace-service/__tests__/facade.test.ts`
Erwartet: PASS

- [ ] **Schritt 5: Commit**

```bash
git add packages/cli/src/serve/workspace-service/index.ts packages/cli/src/serve/workspace-service/__tests__/facade.test.ts
git commit -m "feat(serve): add DaemonWorkspaceService facade with status/tool/init/restart (TDD)"
```

---

## Aufgabe 7: Bridge – Child-Delegation bereitstellen + Workspace-Methoden entfernen

**Dateien:**

- Ändern: `packages/acp-bridge/src/bridge.ts`
- Ändern: `packages/acp-bridge/src/bridgeTypes.ts`

- [ ] **Schritt 1: `queryWorkspaceStatus` und `invokeWorkspaceCommand` zum Bridge-Interface hinzufügen**

In `packages/acp-bridge/src/bridgeTypes.ts` dem Interface (das zu diesem Zeitpunkt noch `HttpAcpBridge` heißt) hinzufügen:

```ts
  queryWorkspaceStatus<T>(method: string, idle: () => T): Promise<T>;
  invokeWorkspaceCommand<T>(method: string, params?: Record<string, unknown>, opts?: { timeoutMs?: number }): Promise<T>;
```

- [ ] **Schritt 2: In bridge.ts implementieren**

In `packages/acp-bridge/src/bridge.ts` dem zurückgegebenen Objekt hinzufügen (in der Nähe der bestehenden `requestWorkspaceStatus`-Nutzung):

```ts
    queryWorkspaceStatus(method, idle) {
      return requestWorkspaceStatus(method, idle);
    },
    invokeWorkspaceCommand(method, params, opts) {
      const info = liveChannelInfo();
      if (!info) throw new SessionNotFoundError(`workspace-command:${method}`);
      const timeout = opts?.timeoutMs ?? initTimeoutMs;
      return withTimeout(
        Promise.race([
          info.connection.extMethod(method, { ...params, cwd: boundWorkspace }),
          getChannelClosedReject(info),
        ]),
        timeout,
        method,
      ) as Promise<any>;
    },
```

- [ ] **Schritt 3: Die 8 Workspace-Methoden aus der Bridge entfernen**

Aus bridge.ts entfernen:

- `initWorkspace` (Zeilen ~3256-3550)
- `setWorkspaceToolEnabled` (Zeilen ~3071-3093)
- `getWorkspaceMcpStatus` / `getWorkspaceSkillsStatus` / `getWorkspaceProvidersStatus` / `getWorkspaceEnvStatus` / `getWorkspacePreflightStatus` (Zeilen ~2665-2790)
- `restartMcpServer` (Zeilen ~3093-3256)

Ihre Signaturen aus `bridgeTypes.ts` entfernen.

- [ ] **Schritt 4: Bridge-Tests ausführen, um sicherzustellen, dass nichts kaputt ist**

Ausführen: `cd packages/acp-bridge && npx vitest run`
Erwartet: Einige Tests könnten auf entfernte Methoden verweisen – diese reparieren (sie sollten dann über die Fassade in der Integration getestet werden).

- [ ] **Schritt 5: Commit**

```bash
git add packages/acp-bridge/src/bridge.ts packages/acp-bridge/src/bridgeTypes.ts
git commit -m "refactor(bridge): extract workspace methods, expose queryWorkspaceStatus + invokeWorkspaceCommand"
```

---

## Aufgabe 8: Bridge-Umbenennung (HttpAcpBridge → AcpSessionBridge)

**Dateien:**

- Ändern: `packages/acp-bridge/src/bridgeTypes.ts`
- Ändern: `packages/acp-bridge/src/bridge.ts`
- Ändern: `packages/acp-bridge/src/bridgeOptions.ts`
- Ändern: `packages/acp-bridge/src/status.ts`
- Ändern: `packages/acp-bridge/src/index.ts`
- Umbenennen: `packages/cli/src/serve/httpAcpBridge.ts` → `packages/cli/src/serve/acpSessionBridge.ts`
- Ändern: `packages/cli/src/serve/runQwenServe.ts` (Import-Pfade)
- Ändern: Alle Dateien, die `HttpAcpBridge` oder `createHttpAcpBridge` importieren

- [ ] **Schritt 1: Interface + Factory-Funktion im acp-bridge-Paket umbenennen**

In `bridgeTypes.ts`:

```ts
// Vorher: export interface HttpAcpBridge {
// Nachher:
export interface AcpSessionBridge {
```

In `bridge.ts`:

```ts
// Vorher: export function createHttpAcpBridge(
// Nachher:
export function createAcpSessionBridge(
```

Zur Sicherheit einen veralteten Re-Export hinzufügen:
```ts
/** @deprecated Use AcpSessionBridge */
export type HttpAcpBridge = AcpSessionBridge;
/** @deprecated Use createAcpSessionBridge */
export const createHttpAcpBridge = createAcpSessionBridge;
```

- [ ] **Schritt 2: Datei im CLI-Paket umbenennen**

```bash
git mv packages/cli/src/serve/httpAcpBridge.ts packages/cli/src/serve/acpSessionBridge.ts
```

- [ ] **Schritt 3: Alle Importe projektweit aktualisieren**

```bash
# Alle Referenzen finden und korrigieren
grep -rn "HttpAcpBridge\|createHttpAcpBridge\|httpAcpBridge" packages/ --include="*.ts" | grep -v node_modules | grep -v ".test.ts"
```

Jede Datei mit den neuen Namen aktualisieren. Wichtige Dateien:

- `packages/cli/src/serve/runQwenServe.ts`
- `packages/cli/src/serve/workspaceAgents.ts`
- `packages/cli/src/serve/workspaceMemory.ts`
- `packages/cli/src/serve/server.ts`
- `packages/acp-bridge/src/status.ts` (Fehlermeldung-String)
- `packages/acp-bridge/src/bridgeOptions.ts` (JSDoc)

- [ ] **Schritt 4: Typüberprüfung ausführen**

Ausführen: `cd packages/cli && npx tsc --noEmit && cd ../acp-bridge && npx tsc --noEmit`
Erwartet: Keine Typfehler

- [ ] **Schritt 5: Vollständige Test-Suites ausführen**

Ausführen: `cd packages/acp-bridge && npx vitest run && cd ../cli && npx vitest run`
Erwartet: Alle erfolgreich (Tests verwenden weiterhin den veralteten Alias oder wurden aktualisiert)

- [ ] **Schritt 6: Commit**

```bash
git add -A
git commit -m "refactor(bridge): rename HttpAcpBridge → AcpSessionBridge"
```

---

## Aufgabe 9: Service in runQwenServe + REST-Routen einbinden

**Dateien:**

- Ändern: `packages/cli/src/serve/runQwenServe.ts`
- Ändern: `packages/cli/src/serve/server.ts`
- Ändern: `packages/cli/src/serve/workspaceAgents.ts`
- Ändern: `packages/cli/src/serve/workspaceMemory.ts`
- Ändern: `packages/cli/src/serve/routes/workspaceFileRead.ts`
- Ändern: `packages/cli/src/serve/routes/workspaceFileWrite.ts`

- [ ] **Schritt 1: Service in runQwenServe.ts erstellen**

Nach dem Erstellen der Bridge einfügen:

```ts
import { createDaemonWorkspaceService } from './workspace-service/index.js';

// Nachdem die Bridge erstellt wurde:
const workspace = createDaemonWorkspaceService({
  fsFactory,
  deviceFlowRegistry,
  subagentManager, // aus bestehendem Aufruf
  boundWorkspace,
  contextFilename,
  persistDisabledTools,
  publishWorkspaceEvent: (event) => bridge.publishWorkspaceEvent(event),
  knownClientIds: () => bridge.knownClientIds(),
  queryWorkspaceStatus: (method, idle) =>
    bridge.queryWorkspaceStatus(method, idle),
  invokeWorkspaceCommand: (method, params, opts) =>
    bridge.invokeWorkspaceCommand(method, params, opts),
});
```

`workspace` an `createServeApp` übergeben.

- [ ] **Schritt 2: Workspace-Status-Routen in server.ts umstellen**

Direkte Bridge-Aufrufe durch Service-Aufrufe ersetzen:

```ts
// Vorher:
app.get('/workspace/mcp', async (_req, res) => {
  res.status(200).json(await bridge.getWorkspaceMcpStatus());
});

// Nachher:
app.get('/workspace/mcp', async (_req, res) => {
  res.status(200).json(await workspace.getMcpStatus());
});
```

Wiederholen für `/workspace/skills`, `/workspace/providers`, `/workspace/env`, `/workspace/preflight`, `/workspace/init`, Tool-Toggle-Route.

- [ ] **Schritt 3: Route-Shell in workspaceAgents.ts umstellen**

`mountWorkspaceAgentsRoutes` so ändern, dass es `workspace.agents` statt `bridge` erhält:

```ts
// deps.bridge.publishWorkspaceEvent → Service behandelt intern
// deps.bridge.knownClientIds() → Service behandelt intern
// Route-Handler wird schlank: Request parsen → Kontext bauen → Service aufrufen → Antwort senden
```

- [ ] **Schritt 4: Route-Shell in workspaceMemory.ts umstellen**

Gleiches Muster wie bei agents.

- [ ] **Schritt 5: Datei-Routen umstellen**

`workspaceFileRead.ts` und `workspaceFileWrite.ts` – statt direkt `fsFactory.forRequest` aufzurufen, `workspace.file.*` verwenden:

```ts
// Vorher:
const fs = getFsFactory(req, res);
const result = await fs.readFile(path, maxBytes);

// Nachher:
const ctx = buildRequestContext(req);
const result = await workspace.file.read(ctx, path, { maxBytes });
```

- [ ] **Schritt 6: Vollständige Test-Suite ausführen**

Ausführen: `cd packages/cli && npx vitest run`
Erwartet: Alle bestehenden Routentests erfolgreich (HTTP-Oberfläche unverändert)

- [ ] **Schritt 7: Commit**

```bash
git add -A
git commit -m "refactor(serve): wire DaemonWorkspaceService into REST routes"
```

---

## Aufgabe 10: /acp Northbound-Methodendispatch

**Dateien:**

- Ändern: relevante `/acp`-Handler-Datei (lokalisieren mit `grep -rn "extMethod\|acpHttp\|acp-integration" packages/cli/src/`)
- Erstellen oder ändern: Northbound-Methodendispatcher

- [ ] **Schritt 1: Einstiegspunkt für /acp-Methodendispatch lokalisieren**

```bash
grep -rn "method.*dispatch\|handleMethod\|jsonrpc.*method" packages/cli/src/acp-integration/ packages/cli/src/serve/ --include="*.ts" | grep -v test | head -20
```

- [ ] **Schritt 2: Workspace-Methodendispatch hinzufügen**

Im /acp-Handler, der JSON-RPC-Methoden routet, ein switch/map für `qwen/workspace/*` hinzufügen:

```ts
// Muster (genaue Position abhängig von Codebasis-Struktur):
case 'qwen/workspace/fs/read': {
  const ctx = buildAcpRequestContext(connection, 'qwen/workspace/fs/read');
  const { path } = params;
  return workspace.file.read(ctx, path);
}
case 'qwen/workspace/fs/write': {
  const ctx = buildAcpRequestContext(connection, 'qwen/workspace/fs/write');
  const { path, content, mode } = params;
  return workspace.file.write(ctx, path, content, { mode });
}
// ... alle 27 Methoden
```

> Einen Helfer `buildAcpRequestContext` erstellen, der die clientId aus der ACP-Verbindung extrahiert und `WorkspaceRequestContext` konstruiert.

- [ ] **Schritt 3: Capabilities-Ankündigung hinzufügen**

Sicherstellen, dass `_meta.qwen.methods` alle `qwen/workspace/*`-Methoden in der `initialize`-Antwort enthält.

- [ ] **Schritt 4: Typüberprüfung ausführen**

Ausführen: `cd packages/cli && npx tsc --noEmit`
Erwartet: Keine Fehler

- [ ] **Schritt 5: Commit**

```bash
git add -A
git commit -m "feat(serve): add /acp northbound workspace methods (27 qwen/workspace/* endpoints)"
```

---

## Aufgabe 11: E2E-Äquivalenztests

**Dateien:**

- Erstellen: `packages/cli/src/serve/workspace-service/__tests__/e2e.test.ts`

- [ ] **Schritt 1: /acp-Test-Harness-Helfer bauen**

```ts
// Helfer zum Senden von JSON-RPC an /acp-Endpunkt mit supertest
import request from 'supertest';

async function acpCall(
  app: any,
  method: string,
  params: Record<string, unknown> = {},
  token = 'test-token',
) {
  const res = await request(app)
    .post('/acp')
    .set('Authorization', `Bearer ${token}`)
    .set('Content-Type', 'application/json')
    .send({ jsonrpc: '2.0', id: 1, method, params });
  return res.body;
}
```

- [ ] **Schritt 2: Äquivalenztests schreiben**

```ts
// packages/cli/src/serve/workspace-service/__tests__/e2e.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { createServeApp } from '../../server.js';
// ... Setup mit gemockter Bridge + Workspace

describe('REST ↔ /acp-Äquivalenz', () => {
  let app: any;

  beforeAll(() => {
    // App mit sowohl REST als auch /acp erstellen, die auf denselben Workspace-Service zugreifen
    app = createServeApp({
      /* ... Test-Abhängigkeiten */
    });
  });

  describe('Dateilesen', () => {
    it('gibt denselben Inhalt über beide Transports zurück', async () => {
      const restRes = await request(app)
        .get('/file?path=README.md')
        .set('Authorization', 'Bearer tok');
      const acpRes = await acpCall(app, 'qwen/workspace/fs/read', {
        path: 'README.md',
      });

      expect(restRes.body.content).toBe(acpRes.result.content);
    });
  });

  describe('Trust-Gate-Ablehnung', () => {
    it('lehnt ungültige clientId über REST ab (400)', async () => {
      const res = await request(app)
        .post('/file/write')
        .set('Authorization', 'Bearer tok')
        .set('X-Qwen-Client-Id', 'unknown-client')
        .send({ path: 'x.ts', content: 'y' });
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('invalid_client_id');
    });

    it('lehnt ungültige clientId über /acp ab (JSON-RPC-Fehler)', async () => {
      const res = await acpCall(app, 'qwen/workspace/fs/write', {
        path: 'x.ts',
        content: 'y',
      });
      expect(res.error.code).toBe(-32602);
      expect(res.error.message).toContain('invalid_client_id');
    });
  });
});
```

- [ ] **Schritt 3: E2E-Tests ausführen**

Ausführen: `cd packages/cli && npx vitest run src/serve/workspace-service/__tests__/e2e.test.ts`
Erwartet: BESTANDEN

- [ ] **Schritt 4: Commit**

```bash
git add packages/cli/src/serve/workspace-service/__tests__/e2e.test.ts
git commit -m "test(serve): add REST ↔ /acp equivalence e2e tests"
```

---

## Aufgabe 12: Abschließende Verifikation

- [ ] **Schritt 1: Vollständige Typüberprüfung über alle Pakete hinweg**

```bash
cd packages/acp-bridge && npx tsc --noEmit && cd ../cli && npx tsc --noEmit && cd ../sdk-typescript && npx tsc --noEmit
```

Erwartet: Keine Fehler

- [ ] **Schritt 2: Vollständige Test-Suites ausführen**

```bash
cd packages/acp-bridge && npx vitest run && cd ../cli && npx vitest run
```

Erwartet: Alle erfolgreich. SDK-Tests sollten ohne Änderungen bestehen (REST-Oberfläche unverändert).

- [ ] **Schritt 3: Bestätigen, dass SDK-Tests unverändert bestehen**

```bash
cd packages/sdk-typescript && npx vitest run
```

Erwartet: Alle erfolgreich – bestätigt Abwärtskompatibilität.

- [ ] **Schritt 4: Lint ausführen**

```bash
cd packages/cli && npm run lint && cd ../acp-bridge && npm run lint
```

Erwartet: Keine Fehler

- [ ] **Schritt 5: Finaler Commit (falls Bereinigung nötig)**

```bash
git status
# Falls sauber, kein Commit nötig. Falls Lint-Korrekturen:
git add -A && git commit -m "chore: lint fixes"
```

- [ ] **Schritt 6: Git-Log auf Sauberkeit prüfen**

```bash
git log --oneline -15
```

Bestätigen, dass die Commits eine kohärente Geschichte für den PR-Reviewer (Einzel-PR) ergeben.