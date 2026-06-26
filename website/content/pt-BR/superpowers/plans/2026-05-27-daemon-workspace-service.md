# Plano de Implementação do DaemonWorkspaceService

> **Para workers agenticos:** SUB-SKILL OBRIGATÓRIA: Use superpowers:subagent-driven-development (recomendado) ou superpowers:executing-plans para implementar este plano tarefa por tarefa. As etapas usam a sintaxe de caixa de seleção (`- [ ]`) para acompanhamento.

**Objetivo:** Extrair todas as capacidades com escopo de workspace do HttpAcpBridge para um novo DaemonWorkspaceService, possibilitando a paridade de transporte /acp e a renomeação honesta para AcpSessionBridge.

**Arquitetura:** Separação baseada em escopo — operações com escopo de workspace vão para uma nova fachada (DaemonWorkspaceService) com 4 sub-serviços internos; operações com escopo de sessão permanecem no bridge. Operações de workspace que dependem de filhos delegam via callbacks injetados. Tanto REST quanto /acp chamam o mesmo serviço L2.

**Stack Tecnológica:** TypeScript, Vitest, Express (rotas REST), JSON-RPC (ACP), supertest (integração)

**Especificação:** `docs/superpowers/specs/2026-05-27-daemon-workspace-service-design.md`

---

## Mapa de Arquivos

### Novos Arquivos

| Arquivo                                                                       | Responsabilidade                                                                 |
| ----------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| `packages/cli/src/serve/workspace-service/types.ts`                           | WorkspaceRequestContext, interfaces de sub-serviço, interface de deps, tipos de resultado |
| `packages/cli/src/serve/workspace-service/index.ts`                           | Fábrica da fachada `createDaemonWorkspaceService`                                |
| `packages/cli/src/serve/workspace-service/fileService.ts`                     | FileService — encapsula fsFactory                                                |
| `packages/cli/src/serve/workspace-service/authService.ts`                     | AuthService — encapsula DeviceFlowRegistry                                       |
| `packages/cli/src/serve/workspace-service/agentsService.ts`                   | AgentsService — encapsula SubagentManager                                        |
| `packages/cli/src/serve/workspace-service/memoryService.ts`                   | MemoryService — encapsula operações de arquivo de memória                        |
| `packages/cli/src/serve/workspace-service/__tests__/fileService.test.ts`      | Testes unitários do FileService                                                  |
| `packages/cli/src/serve/workspace-service/__tests__/authService.test.ts`      | Testes unitários do AuthService                                                  |
| `packages/cli/src/serve/workspace-service/__tests__/agentsService.test.ts`    | Testes unitários do AgentsService                                                |
| `packages/cli/src/serve/workspace-service/__tests__/memoryService.test.ts`    | Testes unitários do MemoryService                                                |
| `packages/cli/src/serve/workspace-service/__tests__/facade.test.ts`           | Testes unitários da fachada + métodos com escopo de workspace (status/tool/init/restart) |
| `packages/cli/src/serve/workspace-service/__tests__/e2e.test.ts`              | Testes e2e de equivalência REST ↔ /acp                                          |

### Arquivos Modificados

| Arquivo                                                                        | Alteração                                                                                              |
| ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------ |
| `packages/acp-bridge/src/bridgeTypes.ts`                                       | Renomear interface + remover 8 métodos + adicionar 2 novos métodos                                      |
| `packages/acp-bridge/src/bridge.ts`                                            | Remover 8 métodos de workspace, expor `queryWorkspaceStatus` + `invokeWorkspaceCommand`, renomear fábrica |
| `packages/acp-bridge/src/bridgeOptions.ts`                                     | Atualizar referências de JSDoc                                                                          |
| `packages/acp-bridge/src/status.ts`                                            | Atualizar nome da classe na mensagem de erro                                                           |
| `packages/cli/src/serve/httpAcpBridge.ts` → renomear para `acpSessionBridge.ts`| Atualizar re-exports                                                                                   |
| `packages/cli/src/serve/runQwenServe.ts`                                       | Construir serviço de workspace, injetar callbacks                                                       |
| `packages/cli/src/serve/server.ts`                                             | Reconfigurar rotas de workspace para chamar o serviço                                                  |
| `packages/cli/src/serve/workspaceAgents.ts`                                    | Extrair lógica de negócio → agentsService, manter como casca de rota                                    |
| `packages/cli/src/serve/workspaceMemory.ts`                                    | Extrair lógica de negócio → memoryService, manter como casca de rota                                    |
| `packages/cli/src/serve/routes/workspaceFileRead.ts`                           | Reconfigurar para chamar o FileService                                                                  |
| `packages/cli/src/serve/routes/workspaceFileWrite.ts`                          | Reconfigurar para chamar o FileService                                                                  |

---

## Tarefa 1: Tipos e Interfaces

**Arquivos:**

- Criar: `packages/cli/src/serve/workspace-service/types.ts`

- [ ] **Passo 1: Criar arquivo de tipos com todas as interfaces**

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

// --- Contexto da Requisição ---

export interface WorkspaceRequestContext {
  originatorClientId?: string;
  sessionId?: string;
  route: string;
  workspaceCwd: string;
}

// --- Interfaces de sub-serviço ---

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

// --- Interface da Fachada ---

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

// --- Deps (injeção de callbacks) ---

export interface WorkspaceEvent {
  type: string;
  data: Record<string, unknown>;
  originatorClientId?: string;
}

export interface DaemonWorkspaceServiceDeps {
  fsFactory: WorkspaceFileSystemFactory;
  deviceFlowRegistry: DeviceFlowRegistry;
  subagentManager: unknown; // tipo de workspaceAgents.ts — refinar durante implementação
  boundWorkspace: string;
  contextFilename: string;
  persistDisabledTools: (
    workspace: string,
    tool: string,
    enabled: boolean,
  ) => Promise<void>;

  // Callbacks transversais (infraestrutura derivada da sessão)
  publishWorkspaceEvent: (event: WorkspaceEvent) => void;
  knownClientIds: () => Set<string>;

  // Callbacks de delegação filha
  queryWorkspaceStatus: <T>(method: string, idle: () => T) => Promise<T>;
  invokeWorkspaceCommand: <T>(
    method: string,
    params?: Record<string, unknown>,
    opts?: { timeoutMs?: number },
  ) => Promise<T>;
}

// --- Tipos de resultado (refinar a partir do código existente durante implementação) ---

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
  state: string /* refinar a partir dos tipos existentes */;
}
export interface AuthStatusResult {
  authenticated: boolean /* refinar a partir dos existentes */;
}
export interface AgentSummary {
  agentType: string /* refinar */;
}
export interface AgentDetail {
  agentType: string /* refinar */;
}
export interface AgentCreateSpec {
  agentType: string;
  content: string /* refinar */;
}
export interface AgentUpdateSpec {
  content: string /* refinar */;
}
export interface MemoryEntry {
  key: string /* refinar */;
}
export interface MemoryContent {
  key: string;
  content: string;
}
export interface InitWorkspaceOpts {
  /* refinar a partir de bridge.ts:3256 */
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

> **Nota:** Tipos de resultado marcados com `/* refinar */` devem ser alinhados com as formas de resposta existentes durante a implementação. Leia os manipuladores de rota atuais para obter os campos exatos.

- [ ] **Passo 2: Verificar se os tipos compilam**

Execute: `cd packages/cli && npx tsc --noEmit src/serve/workspace-service/types.ts`
Esperado: Nenhum erro (pode ser necessário ajustar imports com base nos caminhos de exportação reais)

- [ ] **Passo 3: Commit**

```bash
git add packages/cli/src/serve/workspace-service/types.ts
git commit -m "feat(serve): adicionar definições de tipo do DaemonWorkspaceService"
```

---

## Tarefa 2: FileService (TDD)

**Arquivos:**

- Criar: `packages/cli/src/serve/workspace-service/__tests__/fileService.test.ts`
- Criar: `packages/cli/src/serve/workspace-service/fileService.ts`

- [ ] **Passo 1: Escrever testes com falha para FileService.read**

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
    it('chama fsFactory.forRequest com o contexto e delega para readFile', async () => {
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

    it('funciona sem originatorClientId (somente leitura, sem autenticação necessária)', async () => {
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

- [ ] **Passo 2: Executar teste para verificar falha**

Execute: `cd packages/cli && npx vitest run src/serve/workspace-service/__tests__/fileService.test.ts`
Esperado: FAIL — `createFileService` não encontrado

- [ ] **Passo 3: Implementar o FileService**

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

> **Importante:** Os nomes dos métodos em `WorkspaceFileSystem` (`readFile`, `readFileBytes`, `writeFile`, `editFile`, `glob`, `listDirectory`, `stat`) devem ser verificados em relação à interface real em `packages/cli/src/serve/fs/workspaceFileSystem.ts`. Ajuste se forem diferentes.

- [ ] **Passo 4: Executar teste para verificar aprovação**

Execute: `cd packages/cli && npx vitest run src/serve/workspace-service/__tests__/fileService.test.ts`
Esperado: PASS

- [ ] **Passo 5: Adicionar testes para write (trust gate valida clientId quando presente)**

Adicione ao arquivo de teste:

```ts
describe('write', () => {
  it('passa originatorClientId para forRequest para auditoria', async () => {
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

- [ ] **Passo 6: Executar todos os testes do FileService**

Execute: `cd packages/cli && npx vitest run src/serve/workspace-service/__tests__/fileService.test.ts`
Esperado: Todos PASS

- [ ] **Passo 7: Commit**

```bash
git add packages/cli/src/serve/workspace-service/fileService.ts packages/cli/src/serve/workspace-service/__tests__/fileService.test.ts
git commit -m "feat(serve): adicionar FileService encapsulando fsFactory (TDD)"
```

---

## Tarefa 3: AuthService (TDD)

**Arquivos:**

- Criar: `packages/cli/src/serve/workspace-service/__tests__/authService.test.ts`
- Criar: `packages/cli/src/serve/workspace-service/authService.ts`

- [ ] **Passo 1: Ler a lógica de rota de autenticação existente**

Leia: `packages/cli/src/serve/server.ts:794-966` (rotas de device flow) e `packages/cli/src/serve/auth/deviceFlow.ts` para entender a interface do DeviceFlowRegistry.

- [ ] **Passo 2: Escrever teste com falha**

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
  it('startFlow delega para registry.start e retorna flowId + verificationUri + userCode', async () => {
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

  it('cancelFlow delega para registry.cancel', async () => {
    const registry = { cancel: vi.fn().mockReturnValue({ cancelled: true }) };
    const service = createAuthService({ deviceFlowRegistry: registry as any });

    await service.cancelFlow(ctx, 'flow-1');

    expect(registry.cancel).toHaveBeenCalledWith('flow-1', undefined);
  });
});
```
- [ ] **Passo 3: Executar teste — verificar falha**

Execute: `cd packages/cli && npx vitest run src/serve/workspace-service/__tests__/authService.test.ts`
Esperado: FAIL

- [ ] **Passo 4: Implementar AuthService**

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

> **Note:** Os nomes dos métodos em `DeviceFlowRegistry` (`start`, `get`, `cancel`, `getStatus`) devem ser verificados em relação a `packages/cli/src/serve/auth/deviceFlow.ts`. Ajuste as assinaturas conforme necessário.

- [ ] **Passo 5: Executar teste — verificar aprovação**

Execute: `cd packages/cli && npx vitest run src/serve/workspace-service/__tests__/authService.test.ts`
Esperado: PASS

- [ ] **Passo 6: Commitar**

```bash
git add packages/cli/src/serve/workspace-service/authService.ts packages/cli/src/serve/workspace-service/__tests__/authService.test.ts
git commit -m "feat(serve): adiciona AuthService encapsulando DeviceFlowRegistry (TDD)"
```

---

## Tarefa 4: AgentsService (TDD)

**Arquivos:**

- Criar: `packages/cli/src/serve/workspace-service/__tests__/agentsService.test.ts`
- Criar: `packages/cli/src/serve/workspace-service/agentsService.ts`

- [ ] **Passo 1: Ler a lógica existente de agentes**

Leia: `packages/cli/src/serve/workspaceAgents.ts` — extraia a lógica de negócio (validação, chamadas ao SubagentManager, publicação de eventos). Nota: este arquivo tem ~700+ linhas com tratamento de rota misturado.

- [ ] **Passo 2: Escrever teste com falha — list + validação de clientId**

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
  it('list retorna agentes do subagentManager', async () => {
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

  it('create publica evento de workspace após sucesso', async () => {
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

  it('rejeita clientId desconhecido em mutação', async () => {
    const deps = {
      subagentManager: { create: vi.fn() },
      publishWorkspaceEvent: vi.fn(),
      knownClientIds: () => new Set(['c2']), // c1 não está no conjunto
    };
    const service = createAgentsService(deps as any);

    await expect(
      service.create(ctx, { agentType: 'x', content: '' }),
    ).rejects.toThrow(/not registered/);
  });
});
```

- [ ] **Passo 3: Executar teste — verificar falha**

Execute: `cd packages/cli && npx vitest run src/serve/workspace-service/__tests__/agentsService.test.ts`
Esperado: FAIL

- [ ] **Passo 4: Implementar AgentsService**

Extraia a lógica de negócio de `packages/cli/src/serve/workspaceAgents.ts` para:

```ts
// packages/cli/src/serve/workspace-service/agentsService.ts
import type {
  AgentsService,
  WorkspaceRequestContext,
  WorkspaceEvent,
} from './types.js';

export interface AgentsServiceDeps {
  subagentManager: any; // refinar tipo a partir de workspaceAgents.ts
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
      `Client id "${ctx.originatorClientId}" não está registrado para este workspace`,
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

> **Important:** A interface real do SubagentManager e os tipos de evento devem ser extraídos de `workspaceAgents.ts` durante a implementação. O código acima é o padrão; nomes de métodos/parâmetros exatos serão diferentes.

- [ ] **Passo 5: Executar teste — verificar aprovação**

Execute: `cd packages/cli && npx vitest run src/serve/workspace-service/__tests__/agentsService.test.ts`
Esperado: PASS

- [ ] **Passo 6: Commitar**

```bash
git add packages/cli/src/serve/workspace-service/agentsService.ts packages/cli/src/serve/workspace-service/__tests__/agentsService.test.ts
git commit -m "feat(serve): adiciona AgentsService com validação de clientId e publicação de evento (TDD)"
```

---

## Tarefa 5: MemoryService (TDD)

**Arquivos:**

- Criar: `packages/cli/src/serve/workspace-service/__tests__/memoryService.test.ts`
- Criar: `packages/cli/src/serve/workspace-service/memoryService.ts`

- [ ] **Passo 1: Ler a lógica existente de memória**

Leia: `packages/cli/src/serve/workspaceMemory.ts` — entenda como o CRUD de memória funciona (provavelmente baseado em arquivos com `writeWorkspaceContextFile` ou similar).

- [ ] **Passo 2: Escrever teste com falha**

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
  it('write publica evento de workspace', async () => {
    const publishWorkspaceEvent = vi.fn();
    const deps = {
      // mockar o backend de memória usado
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

  it('rejeita clientId desconhecido em write', async () => {
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

- [ ] **Passo 3: Implementar MemoryService**

Extraia a lógica de `packages/cli/src/serve/workspaceMemory.ts`. O padrão é idêntico ao AgentsService: validar clientId em mutações, delegar ao backend, publicar evento.

- [ ] **Passo 4: Executar testes — verificar aprovação**

Execute: `cd packages/cli && npx vitest run src/serve/workspace-service/__tests__/memoryService.test.ts`
Esperado: PASS

- [ ] **Passo 5: Commitar**

```bash
git add packages/cli/src/serve/workspace-service/memoryService.ts packages/cli/src/serve/workspace-service/__tests__/memoryService.test.ts
git commit -m "feat(serve): adiciona MemoryService com publicação de evento (TDD)"
```

---

## Tarefa 6: Facade + Métodos com Escopo de Workspace (TDD)

**Arquivos:**

- Criar: `packages/cli/src/serve/workspace-service/__tests__/facade.test.ts`
- Criar: `packages/cli/src/serve/workspace-service/index.ts`

- [ ] **Passo 1: Escrever teste com falha para construção da facade + delegação de status**

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

  it('expõe sub-serviços file, auth, agents, memory', () => {
    const service = createDaemonWorkspaceService(makeDeps());
    expect(service.file).toBeDefined();
    expect(service.auth).toBeDefined();
    expect(service.agents).toBeDefined();
    expect(service.memory).toBeDefined();
  });

  it('getMcpStatus delega para callback queryWorkspaceStatus', async () => {
    const idle = { servers: [] };
    const queryWorkspaceStatus = vi.fn().mockResolvedValue(idle);
    const service = createDaemonWorkspaceService(
      makeDeps({ queryWorkspaceStatus }),
    );

    const result = await service.getMcpStatus();

    expect(queryWorkspaceStatus).toHaveBeenCalled();
    expect(result).toBe(idle);
  });

  it('setToolEnabled chama persistDisabledTools + publica evento', async () => {
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

- [ ] **Passo 2: Executar teste — verificar falha**

Execute: `cd packages/cli && npx vitest run src/serve/workspace-service/__tests__/facade.test.ts`
Esperado: FAIL

- [ ] **Passo 3: Implementar fábrica da facade**

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
      // Migrar lógica de bridge.ts:3256 — criação de arquivo local via fsFactory
      const fs = deps.fsFactory.forRequest({
        originatorClientId: ctx.originatorClientId,
        route: ctx.route,
      });
      // ... validação de caminho + criação de arquivo (copiar de bridge.ts:3256-3350)
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

> **Critical:** A implementação de `initWorkspace` deve ser copiada de `bridge.ts:3256-3350` (validação de caminho, verificação de symlinks, criação de arquivo). Use `fsFactory.forRequest(ctx)` em vez de `node:fs/promises` raw — isso corrige o FIXME existente.

- [ ] **Passo 4: Executar teste — verificar aprovação**

Execute: `cd packages/cli && npx vitest run src/serve/workspace-service/__tests__/facade.test.ts`
Esperado: PASS

- [ ] **Passo 5: Commitar**

```bash
git add packages/cli/src/serve/workspace-service/index.ts packages/cli/src/serve/workspace-service/__tests__/facade.test.ts
git commit -m "feat(serve): adiciona facade DaemonWorkspaceService com status/tool/init/restart (TDD)"
```

---

## Tarefa 7: Bridge — Expor Delegação Filha + Remover Métodos de Workspace

**Arquivos:**

- Modificar: `packages/acp-bridge/src/bridge.ts`
- Modificar: `packages/acp-bridge/src/bridgeTypes.ts`

- [ ] **Passo 1: Adicionar `queryWorkspaceStatus` e `invokeWorkspaceCommand` à interface da bridge**

Em `packages/acp-bridge/src/bridgeTypes.ts`, adicionar à interface (que ainda se chama `HttpAcpBridge` neste momento):

```ts
  queryWorkspaceStatus<T>(method: string, idle: () => T): Promise<T>;
  invokeWorkspaceCommand<T>(method: string, params?: Record<string, unknown>, opts?: { timeoutMs?: number }): Promise<T>;
```

- [ ] **Passo 2: Implementá-los em bridge.ts**

Em `packages/acp-bridge/src/bridge.ts`, adicionar ao objeto retornado (próximo ao uso existente de `requestWorkspaceStatus`):

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

- [ ] **Passo 3: Remover os 8 métodos de workspace da bridge**

Remover de bridge.ts:

- `initWorkspace` (linhas ~3256-3550)
- `setWorkspaceToolEnabled` (linhas ~3071-3093)
- `getWorkspaceMcpStatus` / `getWorkspaceSkillsStatus` / `getWorkspaceProvidersStatus` / `getWorkspaceEnvStatus` / `getWorkspacePreflightStatus` (linhas ~2665-2790)
- `restartMcpServer` (linhas ~3093-3256)

Remover suas assinaturas de `bridgeTypes.ts`.

- [ ] **Passo 4: Executar testes da bridge para verificar se nada quebrou**

Execute: `cd packages/acp-bridge && npx vitest run`
Esperado: Alguns testes podem referenciar métodos removidos — corrija-os (eles agora devem testar via facade na integração).

- [ ] **Passo 5: Commitar**

```bash
git add packages/acp-bridge/src/bridge.ts packages/acp-bridge/src/bridgeTypes.ts
git commit -m "refactor(bridge): extrai métodos de workspace, expõe queryWorkspaceStatus + invokeWorkspaceCommand"
```

---

## Tarefa 8: Renomear Bridge (HttpAcpBridge → AcpSessionBridge)

**Arquivos:**

- Modificar: `packages/acp-bridge/src/bridgeTypes.ts`
- Modificar: `packages/acp-bridge/src/bridge.ts`
- Modificar: `packages/acp-bridge/src/bridgeOptions.ts`
- Modificar: `packages/acp-bridge/src/status.ts`
- Modificar: `packages/acp-bridge/src/index.ts`
- Renomear: `packages/cli/src/serve/httpAcpBridge.ts` → `packages/cli/src/serve/acpSessionBridge.ts`
- Modificar: `packages/cli/src/serve/runQwenServe.ts` (caminhos de import)
- Modificar: todos os arquivos que importam `HttpAcpBridge` ou `createHttpAcpBridge`

- [ ] **Passo 1: Renomear interface + função fábrica no pacote acp-bridge**

Em `bridgeTypes.ts`:

```ts
// Antes: export interface HttpAcpBridge {
// Depois:
export interface AcpSessionBridge {
```

Em `bridge.ts`:

```ts
// Antes: export function createHttpAcpBridge(
// Depois:
export function createAcpSessionBridge(
```

Adicionar re-export obsoleto para segurança:
```ts
/** @deprecated Use AcpSessionBridge */
export type HttpAcpBridge = AcpSessionBridge;
/** @deprecated Use createAcpSessionBridge */
export const createHttpAcpBridge = createAcpSessionBridge;
```

- [ ] **Passo 2: Renomear arquivo no pacote cli**

```bash
git mv packages/cli/src/serve/httpAcpBridge.ts packages/cli/src/serve/acpSessionBridge.ts
```

- [ ] **Passo 3: Atualizar todas as importações no projeto**

```bash
# Encontrar e corrigir todas as referências
grep -rn "HttpAcpBridge\|createHttpAcpBridge\|httpAcpBridge" packages/ --include="*.ts" | grep -v node_modules | grep -v ".test.ts"
```

Atualizar cada arquivo para usar os novos nomes. Arquivos principais:

- `packages/cli/src/serve/runQwenServe.ts`
- `packages/cli/src/serve/workspaceAgents.ts`
- `packages/cli/src/serve/workspaceMemory.ts`
- `packages/cli/src/serve/server.ts`
- `packages/acp-bridge/src/status.ts` (string de mensagem de erro)
- `packages/acp-bridge/src/bridgeOptions.ts` (JSDoc)

- [ ] **Passo 4: Executar typecheck**

Execute: `cd packages/cli && npx tsc --noEmit && cd ../acp-bridge && npx tsc --noEmit`
Esperado: Nenhum erro de tipo

- [ ] **Passo 5: Executar suítes de teste completas**

Execute: `cd packages/acp-bridge && npx vitest run && cd ../cli && npx vitest run`
Esperado: Todos passam (testes ainda usam alias obsoleto ou foram atualizados)

- [ ] **Passo 6: Commitar**

```bash
git add -A
git commit -m "refactor(bridge): rename HttpAcpBridge → AcpSessionBridge"
```

---

## Tarefa 9: Integrar Service no runQwenServe + Rotas REST

**Arquivos:**

- Modificar: `packages/cli/src/serve/runQwenServe.ts`
- Modificar: `packages/cli/src/serve/server.ts`
- Modificar: `packages/cli/src/serve/workspaceAgents.ts`
- Modificar: `packages/cli/src/serve/workspaceMemory.ts`
- Modificar: `packages/cli/src/serve/routes/workspaceFileRead.ts`
- Modificar: `packages/cli/src/serve/routes/workspaceFileWrite.ts`

- [ ] **Passo 1: Construir service no runQwenServe.ts**

Adicionar após a construção do bridge:

```ts
import { createDaemonWorkspaceService } from './workspace-service/index.js';

// Após o bridge ser criado:
const workspace = createDaemonWorkspaceService({
  fsFactory,
  deviceFlowRegistry,
  subagentManager, // da construção existente
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

Passar `workspace` para `createServeApp`.

- [ ] **Passo 2: Reconectar rotas de status do workspace no server.ts**

Substituir chamadas diretas ao bridge por chamadas ao service:

```ts
// Antes:
app.get('/workspace/mcp', async (_req, res) => {
  res.status(200).json(await bridge.getWorkspaceMcpStatus());
});

// Depois:
app.get('/workspace/mcp', async (_req, res) => {
  res.status(200).json(await workspace.getMcpStatus());
});
```

Repetir para `/workspace/skills`, `/workspace/providers`, `/workspace/env`, `/workspace/preflight`, `/workspace/init` e rota de alternância de ferramentas.

- [ ] **Passo 3: Reconectar rota workspaceAgents.ts**

Alterar `mountWorkspaceAgentsRoutes` para receber `workspace.agents` em vez de `bridge`:

```ts
// deps.bridge.publishWorkspaceEvent → service gerencia internamente
// deps.bridge.knownClientIds() → service gerencia internamente
// O handler da rota se torna enxuto: parse da requisição → constrói ctx → chama service → envia resposta
```

- [ ] **Passo 4: Reconectar rota workspaceMemory.ts**

Mesmo padrão do agents.

- [ ] **Passo 5: Reconectar rotas de arquivo**

`workspaceFileRead.ts` e `workspaceFileWrite.ts` — alterar de chamar `fsFactory.forRequest` diretamente para chamar `workspace.file.*`:

```ts
// Antes:
const fs = getFsFactory(req, res);
const result = await fs.readFile(path, maxBytes);

// Depois:
const ctx = buildRequestContext(req);
const result = await workspace.file.read(ctx, path, { maxBytes });
```

- [ ] **Passo 6: Executar suíte de teste completa**

Execute: `cd packages/cli && npx vitest run`
Esperado: Todos os testes de rota existentes passam (superfície HTTP inalterada)

- [ ] **Passo 7: Commitar**

```bash
git add -A
git commit -m "refactor(serve): wire DaemonWorkspaceService into REST routes"
```

---

## Tarefa 10: Despacho de Métodos Northbound /acp

**Arquivos:**

- Modificar: arquivo handler `/acp` relevante (localizar via `grep -rn "extMethod\|acpHttp\|acp-integration" packages/cli/src/`)
- Criar ou modificar: dispatcher de métodos northbound

- [ ] **Passo 1: Localizar o ponto de entrada de despacho de métodos /acp**

```bash
grep -rn "method.*dispatch\|handleMethod\|jsonrpc.*method" packages/cli/src/acp-integration/ packages/cli/src/serve/ --include="*.ts" | grep -v test | head -20
```

- [ ] **Passo 2: Adicionar despacho de métodos do workspace**

No handler /acp que roteia métodos JSON-RPC, adicionar um switch/map para `qwen/workspace/*`:

```ts
// Padrão (localização exata depende da estrutura do código):
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
// ... todos os 27 métodos
```

> Construa um helper `buildAcpRequestContext` que extrai o clientId da conexão ACP e constrói `WorkspaceRequestContext`.

- [ ] **Passo 3: Adicionar anúncio de capacidades**

Garanta que `_meta.qwen.methods` inclua todos os métodos `qwen/workspace/*` na resposta do `initialize`.

- [ ] **Passo 4: Executar typecheck**

Execute: `cd packages/cli && npx tsc --noEmit`
Esperado: Nenhum erro

- [ ] **Passo 5: Commitar**

```bash
git add -A
git commit -m "feat(serve): add /acp northbound workspace methods (27 qwen/workspace/* endpoints)"
```

---

## Tarefa 11: Testes de Equivalência E2E

**Arquivos:**

- Criar: `packages/cli/src/serve/workspace-service/__tests__/e2e.test.ts`

- [ ] **Passo 1: Construir helper de harness de teste /acp**

```ts
// Helper para enviar JSON-RPC ao endpoint /acp via supertest
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

- [ ] **Passo 2: Escrever testes de equivalência**

```ts
// packages/cli/src/serve/workspace-service/__tests__/e2e.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { createServeApp } from '../../server.js';
// ... setup com bridge mockado + workspace

describe('Equivalência REST ↔ /acp', () => {
  let app: any;

  beforeAll(() => {
    // Criar app com REST e /acp conectados ao mesmo workspace service
    app = createServeApp({
      /* ... deps de teste */
    });
  });

  describe('leitura de arquivo', () => {
    it('retorna o mesmo conteúdo por ambos os transports', async () => {
      const restRes = await request(app)
        .get('/file?path=README.md')
        .set('Authorization', 'Bearer tok');
      const acpRes = await acpCall(app, 'qwen/workspace/fs/read', {
        path: 'README.md',
      });

      expect(restRes.body.content).toBe(acpRes.result.content);
    });
  });

  describe('rejeição do trust gate', () => {
    it('rejeita clientId inválido via REST (400)', async () => {
      const res = await request(app)
        .post('/file/write')
        .set('Authorization', 'Bearer tok')
        .set('X-Qwen-Client-Id', 'unknown-client')
        .send({ path: 'x.ts', content: 'y' });
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('invalid_client_id');
    });

    it('rejeita clientId inválido via /acp (erro JSON-RPC)', async () => {
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

- [ ] **Passo 3: Executar testes e2e**

Execute: `cd packages/cli && npx vitest run src/serve/workspace-service/__tests__/e2e.test.ts`
Esperado: PASS

- [ ] **Passo 4: Commitar**

```bash
git add packages/cli/src/serve/workspace-service/__tests__/e2e.test.ts
git commit -m "test(serve): add REST ↔ /acp equivalence e2e tests"
```

---

## Tarefa 12: Verificação Final

- [ ] **Passo 1: Executar typecheck completo em todos os pacotes**

```bash
cd packages/acp-bridge && npx tsc --noEmit && cd ../cli && npx tsc --noEmit && cd ../sdk-typescript && npx tsc --noEmit
```

Esperado: Nenhum erro

- [ ] **Passo 2: Executar suítes de teste completas**

```bash
cd packages/acp-bridge && npx vitest run && cd ../cli && npx vitest run
```

Esperado: Todos passam. Testes do SDK devem passar SEM modificação (superfície REST inalterada).

- [ ] **Passo 3: Verificar que os testes do SDK passam sem modificação**

```bash
cd packages/sdk-typescript && npx vitest run
```

Esperado: Todos passam — confirma compatibilidade retroativa.

- [ ] **Passo 4: Executar lint**

```bash
cd packages/cli && npm run lint && cd ../acp-bridge && npm run lint
```

Esperado: Nenhum erro

- [ ] **Passo 5: Commit final (se precisar de limpeza)**

```bash
git status
# Se estiver limpo, nenhum commit necessário. Se houver correções de lint:
git add -A && git commit -m "chore: lint fixes"
```

- [ ] **Passo 6: Verificar se o git log está limpo**

```bash
git log --oneline -15
```

Confirme que os commits contam uma história coerente para o revisor do PR único.