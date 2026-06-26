# Plan d'implémentation de DaemonWorkspaceService

> **Pour les agents travailleurs :** SOUS-COMPÉTENCE REQUISE : Utilisez superpowers:subagent-driven-development (recommandé) ou superpowers:executing-plans pour implémenter ce plan tâche par tâche. Les étapes utilisent la syntaxe avec cases à cocher (`- [ ]`) pour le suivi.

**Objectif :** Extraire toutes les capacités liées à l'espace de travail de HttpAcpBridge dans un nouveau DaemonWorkspaceService, permettant la parité de transport /acp et un renommage honnête en AcpSessionBridge.

**Architecture :** Découpage par périmètre — les opérations liées à l'espace de travail vont dans une nouvelle façade (DaemonWorkspaceService) avec 4 sous-services internes ; les opérations liées à la session restent dans le bridge. Les opérations workspace dépendantes d'enfants délèguent via des callbacks injectés. REST et /acp appellent le même service L2.

**Stack technique :** TypeScript, Vitest, Express (routes REST), JSON-RPC (ACP), supertest (intégration)

**Spécification :** `docs/superpowers/specs/2026-05-27-daemon-workspace-service-design.md`

---

## Cartographie des fichiers

### Nouveaux fichiers

| Fichier                                                                                 | Responsabilité                                                                 |
| --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| `packages/cli/src/serve/workspace-service/types.ts`                                     | WorkspaceRequestContext, interfaces des sous-services, interface de dépendances, types de résultats |
| `packages/cli/src/serve/workspace-service/index.ts`                                     | Usine de façade `createDaemonWorkspaceService`                                 |
| `packages/cli/src/serve/workspace-service/fileService.ts`                               | FileService — encapsule fsFactory                                              |
| `packages/cli/src/serve/workspace-service/authService.ts`                               | AuthService — encapsule DeviceFlowRegistry                                     |
| `packages/cli/src/serve/workspace-service/agentsService.ts`                             | AgentsService — encapsule SubagentManager                                      |
| `packages/cli/src/serve/workspace-service/memoryService.ts`                             | MemoryService — encapsule les opérations sur fichiers mémoire                  |
| `packages/cli/src/serve/workspace-service/__tests__/fileService.test.ts`                | Tests unitaires de FileService                                                 |
| `packages/cli/src/serve/workspace-service/__tests__/authService.test.ts`                | Tests unitaires de AuthService                                                 |
| `packages/cli/src/serve/workspace-service/__tests__/agentsService.test.ts`              | Tests unitaires de AgentsService                                               |
| `packages/cli/src/serve/workspace-service/__tests__/memoryService.test.ts`              | Tests unitaires de MemoryService                                               |
| `packages/cli/src/serve/workspace-service/__tests__/facade.test.ts`                     | Tests unitaires de la façade + méthodes workspace (status/tool/init/restart)   |
| `packages/cli/src/serve/workspace-service/__tests__/e2e.test.ts`                        | Tests e2e d'équivalence REST ↔ /acp                                           |

### Fichiers modifiés

| Fichier                                                                                  | Changement                                                                                        |
| ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `packages/acp-bridge/src/bridgeTypes.ts`                                                  | Renommer l'interface + supprimer 8 méthodes + ajouter 2 nouvelles méthodes                        |
| `packages/acp-bridge/src/bridge.ts`                                                       | Supprimer 8 méthodes workspace, exposer `queryWorkspaceStatus` + `invokeWorkspaceCommand`, renommer l'usine |
| `packages/acp-bridge/src/bridgeOptions.ts`                                                | Mettre à jour les références JSDoc                                                                |
| `packages/acp-bridge/src/status.ts`                                                       | Mettre à jour le nom de classe dans le message d'erreur                                           |
| `packages/cli/src/serve/httpAcpBridge.ts` → renommer en `acpSessionBridge.ts`             | Mettre à jour les ré-exportations                                                                 |
| `packages/cli/src/serve/runQwenServe.ts`                                                  | Construire le service workspace, injecter les callbacks                                            |
| `packages/cli/src/serve/server.ts`                                                        | Reconnecter les routes workspace pour appeler le service                                          |
| `packages/cli/src/serve/workspaceAgents.ts`                                               | Extraire la logique métier → agentsService, conserver comme coquille de route                     |
| `packages/cli/src/serve/workspaceMemory.ts`                                               | Extraire la logique métier → memoryService, conserver comme coquille de route                     |
| `packages/cli/src/serve/routes/workspaceFileRead.ts`                                      | Reconnecter pour appeler FileService                                                              |
| `packages/cli/src/serve/routes/workspaceFileWrite.ts`                                     | Reconnecter pour appeler FileService                                                              |

---

## Tâche 1 : Types & Interfaces

**Fichiers :**

- Créer : `packages/cli/src/serve/workspace-service/types.ts`

- [ ] **Étape 1 : Créer le fichier de types avec toutes les interfaces**

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

// --- Contexte de la requête ---

export interface WorkspaceRequestContext {
  originatorClientId?: string;
  sessionId?: string;
  route: string;
  workspaceCwd: string;
}

// --- Interfaces des sous-services ---

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

// --- Interface de la façade ---

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

// --- Dépendances (injection de callbacks) ---

export interface WorkspaceEvent {
  type: string;
  data: Record<string, unknown>;
  originatorClientId?: string;
}

export interface DaemonWorkspaceServiceDeps {
  fsFactory: WorkspaceFileSystemFactory;
  deviceFlowRegistry: DeviceFlowRegistry;
  subagentManager: unknown; // type de workspaceAgents.ts — à affiner pendant l'implémentation
  boundWorkspace: string;
  contextFilename: string;
  persistDisabledTools: (
    workspace: string,
    tool: string,
    enabled: boolean,
  ) => Promise<void>;

  // Callbacks transversaux (infrastructure dérivée de la session)
  publishWorkspaceEvent: (event: WorkspaceEvent) => void;
  knownClientIds: () => Set<string>;

  // Callbacks de délégation enfants
  queryWorkspaceStatus: <T>(method: string, idle: () => T) => Promise<T>;
  invokeWorkspaceCommand: <T>(
    method: string,
    params?: Record<string, unknown>,
    opts?: { timeoutMs?: number },
  ) => Promise<T>;
}

// --- Types de résultats (à affiner à partir du code existant pendant l'implémentation) ---

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
  state: string /* à affiner à partir des types existants */;
}
export interface AuthStatusResult {
  authenticated: boolean /* à affiner à partir de l'existant */;
}
export interface AgentSummary {
  agentType: string /* à affiner */;
}
export interface AgentDetail {
  agentType: string /* à affiner */;
}
export interface AgentCreateSpec {
  agentType: string;
  content: string /* à affiner */;
}
export interface AgentUpdateSpec {
  content: string /* à affiner */;
}
export interface MemoryEntry {
  key: string /* à affiner */;
}
export interface MemoryContent {
  key: string;
  content: string;
}
export interface InitWorkspaceOpts {
  /* à affiner à partir de bridge.ts:3256 */
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

> **Note :** Les types de résultats marqués `/* à affiner */` doivent être alignés avec les formes de réponse existantes pendant l'implémentation. Lisez les gestionnaires de routes actuels pour obtenir les champs exacts.

- [ ] **Étape 2 : Vérifier que les types compilent**

Exécutez : `cd packages/cli && npx tsc --noEmit src/serve/workspace-service/types.ts`
Attendu : Aucune erreur (peut nécessiter d'ajuster les imports en fonction des chemins d'export réels)

- [ ] **Étape 3 : Commit**

```bash
git add packages/cli/src/serve/workspace-service/types.ts
git commit -m "feat(serve): add DaemonWorkspaceService type definitions"
```

---

## Tâche 2 : FileService (TDD)

**Fichiers :**

- Créer : `packages/cli/src/serve/workspace-service/__tests__/fileService.test.ts`
- Créer : `packages/cli/src/serve/workspace-service/fileService.ts`

- [ ] **Étape 1 : Écrire des tests échouant pour FileService.read**

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
    it('appelle fsFactory.forRequest avec le contexte et délègue à readFile', async () => {
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

    it('fonctionne sans originatorClientId (lecture seule, pas d\'authentification requise)', async () => {
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

- [ ] **Étape 2 : Exécuter le test pour vérifier qu'il échoue**

Exécutez : `cd packages/cli && npx vitest run src/serve/workspace-service/__tests__/fileService.test.ts`
Attendu : ÉCHEC — `createFileService` introuvable

- [ ] **Étape 3 : Implémenter FileService**

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

> **Important :** Les noms de méthodes sur `WorkspaceFileSystem` (`readFile`, `readFileBytes`, `writeFile`, `editFile`, `glob`, `listDirectory`, `stat`) doivent être vérifiés par rapport à l'interface réelle dans `packages/cli/src/serve/fs/workspaceFileSystem.ts`. Ajustez s'ils diffèrent.

- [ ] **Étape 4 : Exécuter le test pour vérifier qu'il passe**

Exécutez : `cd packages/cli && npx vitest run src/serve/workspace-service/__tests__/fileService.test.ts`
Attendu : SUCCÈS

- [ ] **Étape 5 : Ajouter des tests pour write (la gate de confiance valide que clientId est présent)**

Ajoutez au fichier de test :

```ts
describe('write', () => {
  it('passe originatorClientId à forRequest pour l\'audit', async () => {
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

- [ ] **Étape 6 : Exécuter tous les tests de FileService**

Exécutez : `cd packages/cli && npx vitest run src/serve/workspace-service/__tests__/fileService.test.ts`
Attendu : Tous SUCCÈS

- [ ] **Étape 7 : Commit**

```bash
git add packages/cli/src/serve/workspace-service/fileService.ts packages/cli/src/serve/workspace-service/__tests__/fileService.test.ts
git commit -m "feat(serve): add FileService wrapping fsFactory (TDD)"
```

---

## Tâche 3 : AuthService (TDD)

**Fichiers :**

- Créer : `packages/cli/src/serve/workspace-service/__tests__/authService.test.ts`
- Créer : `packages/cli/src/serve/workspace-service/authService.ts`

- [ ] **Étape 1 : Lire la logique de route auth existante**

Lisez : `packages/cli/src/serve/server.ts:794-966` (routes device flow) et `packages/cli/src/serve/auth/deviceFlow.ts` pour comprendre l'interface de DeviceFlowRegistry.

- [ ] **Étape 2 : Écrire un test échouant**

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
  it('startFlow délègue à registry.start et retourne flowId + verificationUri + userCode', async () => {
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

  it('cancelFlow délègue à registry.cancel', async () => {
    const registry = { cancel: vi.fn().mockReturnValue({ cancelled: true }) };
    const service = createAuthService({ deviceFlowRegistry: registry as any });

    await service.cancelFlow(ctx, 'flow-1');

    expect(registry.cancel).toHaveBeenCalledWith('flow-1', undefined);
  });
});
```
- [ ] **Étape 3 : Exécuter le test — vérifier l’échec**

Exécuter : `cd packages/cli && npx vitest run src/serve/workspace-service/__tests__/authService.test.ts`
Résultat attendu : FAIL

- [ ] **Étape 4 : Implémenter AuthService**

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
> Les noms de méthodes sur `DeviceFlowRegistry` (`start`, `get`, `cancel`, `getStatus`) doivent être vérifiés par rapport à `packages/cli/src/serve/auth/deviceFlow.ts`. Ajustez les signatures si nécessaire.

- [ ] **Étape 5 : Exécuter le test — vérifier la réussite**

Exécuter : `cd packages/cli && npx vitest run src/serve/workspace-service/__tests__/authService.test.ts`
Résultat attendu : PASS

- [ ] **Étape 6 : Commit**

```bash
git add packages/cli/src/serve/workspace-service/authService.ts packages/cli/src/serve/workspace-service/__tests__/authService.test.ts
git commit -m "feat(serve): add AuthService wrapping DeviceFlowRegistry (TDD)"
```

---

## Tâche 4 : AgentsService (TDD)

**Fichiers :**

- Créer : `packages/cli/src/serve/workspace-service/__tests__/agentsService.test.ts`
- Créer : `packages/cli/src/serve/workspace-service/agentsService.ts`

- [ ] **Étape 1 : Lire la logique existante des agents**

Lire : `packages/cli/src/serve/workspaceAgents.ts` — extraire la logique métier (validation, appels à SubagentManager, publication d'événements). Note : ce fichier fait ~700+ lignes avec un mélange de gestion de routes.

- [ ] **Étape 2 : Écrire un test qui échoue — liste + validation clientId**

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

- [ ] **Étape 3 : Exécuter le test — vérifier l’échec**

Exécuter : `cd packages/cli && npx vitest run src/serve/workspace-service/__tests__/agentsService.test.ts`
Résultat attendu : FAIL

- [ ] **Étape 4 : Implémenter AgentsService**

Extraire la logique métier de `packages/cli/src/serve/workspaceAgents.ts` dans :

```ts
// packages/cli/src/serve/workspace-service/agentsService.ts
import type {
  AgentsService,
  WorkspaceRequestContext,
  WorkspaceEvent,
} from './types.js';

export interface AgentsServiceDeps {
  subagentManager: any; // raffiner le type depuis workspaceAgents.ts
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
> L'interface réelle de SubagentManager et les types d'événements doivent être extraits de `workspaceAgents.ts` lors de l'implémentation. Ce qui précède est le modèle ; les noms de méthodes/paramètres exacts différeront.

- [ ] **Étape 5 : Exécuter le test — vérifier la réussite**

Exécuter : `cd packages/cli && npx vitest run src/serve/workspace-service/__tests__/agentsService.test.ts`
Résultat attendu : PASS

- [ ] **Étape 6 : Commit**

```bash
git add packages/cli/src/serve/workspace-service/agentsService.ts packages/cli/src/serve/workspace-service/__tests__/agentsService.test.ts
git commit -m "feat(serve): add AgentsService with clientId validation and event publish (TDD)"
```

---

## Tâche 5 : MemoryService (TDD)

**Fichiers :**

- Créer : `packages/cli/src/serve/workspace-service/__tests__/memoryService.test.ts`
- Créer : `packages/cli/src/serve/workspace-service/memoryService.ts`

- [ ] **Étape 1 : Lire la logique mémoire existante**

Lire : `packages/cli/src/serve/workspaceMemory.ts` — comprendre comment fonctionne le CRUD mémoire (probablement basé sur des fichiers avec `writeWorkspaceContextFile` ou similaire).

- [ ] **Étape 2 : Écrire un test qui échoue**

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

- [ ] **Étape 3 : Implémenter MemoryService**

Extraire la logique de `packages/cli/src/serve/workspaceMemory.ts`. Modèle identique à AgentsService : valider le clientId sur les mutations, déléguer au backend, publier l'événement.

- [ ] **Étape 4 : Exécuter les tests — vérifier la réussite**

Exécuter : `cd packages/cli && npx vitest run src/serve/workspace-service/__tests__/memoryService.test.ts`
Résultat attendu : PASS

- [ ] **Étape 5 : Commit**

```bash
git add packages/cli/src/serve/workspace-service/memoryService.ts packages/cli/src/serve/workspace-service/__tests__/memoryService.test.ts
git commit -m "feat(serve): add MemoryService with event publish (TDD)"
```

---

## Tâche 6 : Facade + Méthodes scopées au workspace (TDD)

**Fichiers :**

- Créer : `packages/cli/src/serve/workspace-service/__tests__/facade.test.ts`
- Créer : `packages/cli/src/serve/workspace-service/index.ts`

- [ ] **Étape 1 : Écrire un test qui échoue pour la construction de la facade + délégation de statut**

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

- [ ] **Étape 2 : Exécuter le test — vérifier l’échec**

Exécuter : `cd packages/cli && npx vitest run src/serve/workspace-service/__tests__/facade.test.ts`
Résultat attendu : FAIL

- [ ] **Étape 3 : Implémenter la factory facade**

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
      // Migrer la logique depuis bridge.ts:3256 — création de fichiers locaux via fsFactory
      const fs = deps.fsFactory.forRequest({
        originatorClientId: ctx.originatorClientId,
        route: ctx.route,
      });
      // ... validation de chemin + création de fichier (copier depuis bridge.ts:3256-3350)
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
> L'implémentation de `initWorkspace` doit être copiée depuis `bridge.ts:3256-3350` (validation de chemin, vérification des liens symboliques, création de fichier). Utiliser `fsFactory.forRequest(ctx)` au lieu de `node:fs/promises` brut — cela corrige le FIXME existant.

- [ ] **Étape 4 : Exécuter le test — vérifier la réussite**

Exécuter : `cd packages/cli && npx vitest run src/serve/workspace-service/__tests__/facade.test.ts`
Résultat attendu : PASS

- [ ] **Étape 5 : Commit**

```bash
git add packages/cli/src/serve/workspace-service/index.ts packages/cli/src/serve/workspace-service/__tests__/facade.test.ts
git commit -m "feat(serve): add DaemonWorkspaceService facade with status/tool/init/restart (TDD)"
```

---

## Tâche 7 : Bridge — Exposer la délégation enfant + Supprimer les méthodes workspace

**Fichiers :**

- Modifier : `packages/acp-bridge/src/bridge.ts`
- Modifier : `packages/acp-bridge/src/bridgeTypes.ts`

- [ ] **Étape 1 : Ajouter `queryWorkspaceStatus` et `invokeWorkspaceCommand` à l'interface du bridge**

Dans `packages/acp-bridge/src/bridgeTypes.ts`, ajouter à l'interface (qui s'appelle encore `HttpAcpBridge` à ce stade) :

```ts
  queryWorkspaceStatus<T>(method: string, idle: () => T): Promise<T>;
  invokeWorkspaceCommand<T>(method: string, params?: Record<string, unknown>, opts?: { timeoutMs?: number }): Promise<T>;
```

- [ ] **Étape 2 : Les implémenter dans bridge.ts**

Dans `packages/acp-bridge/src/bridge.ts`, ajouter à l'objet retourné (près de l'utilisation existante de `requestWorkspaceStatus`) :

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

- [ ] **Étape 3 : Supprimer les 8 méthodes workspace du bridge**

Supprimer de bridge.ts :

- `initWorkspace` (lignes ~3256-3550)
- `setWorkspaceToolEnabled` (lignes ~3071-3093)
- `getWorkspaceMcpStatus` / `getWorkspaceSkillsStatus` / `getWorkspaceProvidersStatus` / `getWorkspaceEnvStatus` / `getWorkspacePreflightStatus` (lignes ~2665-2790)
- `restartMcpServer` (lignes ~3093-3256)

Supprimer leurs signatures de `bridgeTypes.ts`.

- [ ] **Étape 4 : Exécuter les tests du bridge pour vérifier que rien n'est cassé**

Exécuter : `cd packages/acp-bridge && npx vitest run`
Résultat attendu : Certains tests peuvent référencer des méthodes supprimées — les corriger (ils doivent désormais tester via la facade en intégration).

- [ ] **Étape 5 : Commit**

```bash
git add packages/acp-bridge/src/bridge.ts packages/acp-bridge/src/bridgeTypes.ts
git commit -m "refactor(bridge): extract workspace methods, expose queryWorkspaceStatus + invokeWorkspaceCommand"
```

---

## Tâche 8 : Renommage du bridge (HttpAcpBridge → AcpSessionBridge)

**Fichiers :**

- Modifier : `packages/acp-bridge/src/bridgeTypes.ts`
- Modifier : `packages/acp-bridge/src/bridge.ts`
- Modifier : `packages/acp-bridge/src/bridgeOptions.ts`
- Modifier : `packages/acp-bridge/src/status.ts`
- Modifier : `packages/acp-bridge/src/index.ts`
- Renommer : `packages/cli/src/serve/httpAcpBridge.ts` → `packages/cli/src/serve/acpSessionBridge.ts`
- Modifier : `packages/cli/src/serve/runQwenServe.ts` (chemins d'import)
- Modifier : tous les fichiers important `HttpAcpBridge` ou `createHttpAcpBridge`

- [ ] **Étape 1 : Renommer l'interface + la fonction factory dans le package acp-bridge**

Dans `bridgeTypes.ts` :

```ts
// Avant : export interface HttpAcpBridge {
// Après :
export interface AcpSessionBridge {
```

Dans `bridge.ts` :

```ts
// Avant : export function createHttpAcpBridge(
// Après :
export function createAcpSessionBridge(
```

Ajouter une ré-exportation dépréciée pour la sécurité :
```ts
/** @deprecated Utilisez AcpSessionBridge */
export type HttpAcpBridge = AcpSessionBridge;
/** @deprecated Utilisez createAcpSessionBridge */
export const createHttpAcpBridge = createAcpSessionBridge;
```

- [ ] **Étape 2 : Renommer le fichier dans le package cli**

```bash
git mv packages/cli/src/serve/httpAcpBridge.ts packages/cli/src/serve/acpSessionBridge.ts
```

- [ ] **Étape 3 : Mettre à jour toutes les importations dans le projet**

```bash
# Trouver et corriger toutes les références
grep -rn "HttpAcpBridge\|createHttpAcpBridge\|httpAcpBridge" packages/ --include="*.ts" | grep -v node_modules | grep -v ".test.ts"
```

Mettre à jour chaque fichier avec les nouveaux noms. Fichiers clés :

- `packages/cli/src/serve/runQwenServe.ts`
- `packages/cli/src/serve/workspaceAgents.ts`
- `packages/cli/src/serve/workspaceMemory.ts`
- `packages/cli/src/serve/server.ts`
- `packages/acp-bridge/src/status.ts` (chaîne de message d'erreur)
- `packages/acp-bridge/src/bridgeOptions.ts` (JSDoc)

- [ ] **Étape 4 : Exécuter la vérification de types**

Exécuter : `cd packages/cli && npx tsc --noEmit && cd ../acp-bridge && npx tsc --noEmit`
Attendu : Aucune erreur de type

- [ ] **Étape 5 : Exécuter les suites de tests complètes**

Exécuter : `cd packages/acp-bridge && npx vitest run && cd ../cli && npx vitest run`
Attendu : Tout passe (les tests utilisent encore l'alias déprécié ou ont été mis à jour)

- [ ] **Étape 6 : Commit**

```bash
git add -A
git commit -m "refactor(bridge): rename HttpAcpBridge → AcpSessionBridge"
```

---

## Tâche 9 : Intégrer le service dans runQwenServe + routes REST

**Fichiers :**

- Modifier : `packages/cli/src/serve/runQwenServe.ts`
- Modifier : `packages/cli/src/serve/server.ts`
- Modifier : `packages/cli/src/serve/workspaceAgents.ts`
- Modifier : `packages/cli/src/serve/workspaceMemory.ts`
- Modifier : `packages/cli/src/serve/routes/workspaceFileRead.ts`
- Modifier : `packages/cli/src/serve/routes/workspaceFileWrite.ts`

- [ ] **Étape 1 : Construire le service dans runQwenServe.ts**

Ajouter après la construction du bridge :

```ts
import { createDaemonWorkspaceService } from './workspace-service/index.js';

// Après la création du bridge :
const workspace = createDaemonWorkspaceService({
  fsFactory,
  deviceFlowRegistry,
  subagentManager, // de la construction existante
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

Passer `workspace` à `createServeApp`.

- [ ] **Étape 2 : Reconnecter les routes d'état du workspace dans server.ts**

Remplacer les appels directs au bridge par des appels au service :

```ts
// Avant :
app.get('/workspace/mcp', async (_req, res) => {
  res.status(200).json(await bridge.getWorkspaceMcpStatus());
});

// Après :
app.get('/workspace/mcp', async (_req, res) => {
  res.status(200).json(await workspace.getMcpStatus());
});
```

Répéter pour `/workspace/skills`, `/workspace/providers`, `/workspace/env`, `/workspace/preflight`, `/workspace/init`, la route de bascule d'outil.

- [ ] **Étape 3 : Reconnecter la route worksapceAgents.ts shell**

Modifier `mountWorkspaceAgentsRoutes` pour recevoir `workspace.agents` au lieu de `bridge` :

```ts
// deps.bridge.publishWorkspaceEvent → le service gère en interne
// deps.bridge.knownClientIds() → le service gère en interne
// Le gestionnaire de route devient fin : analyser la requête → construire le contexte → appeler le service → envoyer la réponse
```

- [ ] **Étape 4 : Reconnecter la route workspaceMemory.ts shell**

Même motif que pour agents.

- [ ] **Étape 5 : Reconnecter les routes de fichiers**

`workspaceFileRead.ts` et `workspaceFileWrite.ts` — remplacer l'appel direct à `fsFactory.forRequest` par un appel à `workspace.file.*` :

```ts
// Avant :
const fs = getFsFactory(req, res);
const result = await fs.readFile(path, maxBytes);

// Après :
const ctx = buildRequestContext(req);
const result = await workspace.file.read(ctx, path, { maxBytes });
```

- [ ] **Étape 6 : Exécuter la suite de tests complète**

Exécuter : `cd packages/cli && npx vitest run`
Attendu : Tous les tests de routes existants passent (surface HTTP inchangée)

- [ ] **Étape 7 : Commit**

```bash
git add -A
git commit -m "refactor(serve): wire DaemonWorkspaceService into REST routes"
```

---

## Tâche 10 : Distribution des méthodes nord /acp

**Fichiers :**

- Modifier : le fichier gestionnaire `/acp` concerné (localiser avec `grep -rn "extMethod\|acpHttp\|acp-integration" packages/cli/src/`)
- Créer ou modifier : le répartiteur de méthodes nord

- [ ] **Étape 1 : Localiser le point d'entrée de distribution des méthodes /acp**

```bash
grep -rn "method.*dispatch\|handleMethod\|jsonrpc.*method" packages/cli/src/acp-integration/ packages/cli/src/serve/ --include="*.ts" | grep -v test | head -20
```

- [ ] **Étape 2 : Ajouter la distribution des méthodes workspace**

Dans le gestionnaire /acp qui achemine les méthodes JSON-RPC, ajouter un switch/map pour `qwen/workspace/*` :

```ts
// Motif (l'emplacement exact dépend de la structure du code) :
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
// ... les 27 méthodes
```

> Construire une fonction utilitaire `buildAcpRequestContext` qui extrait le clientId de la connexion ACP et construit `WorkspaceRequestContext`.

- [ ] **Étape 3 : Ajouter la déclaration des capacités**

S'assurer que `_meta.qwen.methods` inclut toutes les méthodes `qwen/workspace/*` dans la réponse `initialize`.

- [ ] **Étape 4 : Exécuter la vérification de types**

Exécuter : `cd packages/cli && npx tsc --noEmit`
Attendu : Aucune erreur

- [ ] **Étape 5 : Commit**

```bash
git add -A
git commit -m "feat(serve): add /acp northbound workspace methods (27 qwen/workspace/* endpoints)"
```

---

## Tâche 11 : Tests d'équivalence E2E

**Fichiers :**

- Créer : `packages/cli/src/serve/workspace-service/__tests__/e2e.test.ts`

- [ ] **Étape 1 : Construire l'utilitaire de harnais de test /acp**

```ts
// Utilitaire pour envoyer du JSON-RPC vers le point de terminaison /acp via supertest
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

- [ ] **Étape 2 : Écrire les tests d'équivalence**

```ts
// packages/cli/src/serve/workspace-service/__tests__/e2e.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { createServeApp } from '../../server.js';
// ... configuration avec bridge + workspace simulés

describe('Équivalence REST ↔ /acp', () => {
  let app: any;

  beforeAll(() => {
    // Créer l'application avec REST et /acp câblés au même service workspace
    app = createServeApp({
      /* ... dépendances de test */
    });
  });

  describe('lecture de fichier', () => {
    it('retourne le même contenu via les deux transports', async () => {
      const restRes = await request(app)
        .get('/file?path=README.md')
        .set('Authorization', 'Bearer tok');
      const acpRes = await acpCall(app, 'qwen/workspace/fs/read', {
        path: 'README.md',
      });

      expect(restRes.body.content).toBe(acpRes.result.content);
    });
  });

  describe('rejet par la porte de confiance', () => {
    it('rejette un clientId invalide via REST (400)', async () => {
      const res = await request(app)
        .post('/file/write')
        .set('Authorization', 'Bearer tok')
        .set('X-Qwen-Client-Id', 'unknown-client')
        .send({ path: 'x.ts', content: 'y' });
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('invalid_client_id');
    });

    it('rejette un clientId invalide via /acp (erreur JSON-RPC)', async () => {
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

- [ ] **Étape 3 : Exécuter les tests E2E**

Exécuter : `cd packages/cli && npx vitest run src/serve/workspace-service/__tests__/e2e.test.ts`
Attendu : SUCCÈS

- [ ] **Étape 4 : Commit**

```bash
git add packages/cli/src/serve/workspace-service/__tests__/e2e.test.ts
git commit -m "test(serve): add REST ↔ /acp equivalence e2e tests"
```

---

## Tâche 12 : Vérification finale

- [ ] **Étape 1 : Exécuter la vérification de types complète sur tous les packages**

```bash
cd packages/acp-bridge && npx tsc --noEmit && cd ../cli && npx tsc --noEmit && cd ../sdk-typescript && npx tsc --noEmit
```

Attendu : Aucune erreur

- [ ] **Étape 2 : Exécuter les suites de tests complètes**

```bash
cd packages/acp-bridge && npx vitest run && cd ../cli && npx vitest run
```

Attendu : Tout passe. Les tests du SDK doivent passer SANS modification (surface REST inchangée).

- [ ] **Étape 3 : Vérifier que les tests du SDK passent sans modification**

```bash
cd packages/sdk-typescript && npx vitest run
```

Attendu : Tout passe — confirme la compatibilité ascendante.

- [ ] **Étape 4 : Exécuter le lint**

```bash
cd packages/cli && npm run lint && cd ../acp-bridge && npm run lint
```

Attendu : Aucune erreur

- [ ] **Étape 5 : Commit final (si nécessaire)**

```bash
git status
# Si propre, aucun commit nécessaire. Si des corrections de lint :
git add -A && git commit -m "chore: lint fixes"
```

- [ ] **Étape 6 : Vérifier que le journal git est propre**

```bash
git log --oneline -15
```

Confirmer que les commits racontent une histoire cohérente pour le relecteur de la PR unique.
```