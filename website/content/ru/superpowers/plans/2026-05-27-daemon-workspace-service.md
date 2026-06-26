# План реализации DaemonWorkspaceService

> **Для агентных разработчиков:** ТРЕБУЕТСЯ ДОПОЛНИТЕЛЬНЫЙ НАВЫК: Используйте superpowers:subagent-driven-development (рекомендуется) или superpowers:executing-plans для реализации этого плана задача за задачей. Шаги используют синтаксис флажка (`- [ ]`) для отслеживания.

**Цель:** Извлечь все возможности уровня рабочей области из HttpAcpBridge в новый DaemonWorkspaceService, обеспечив паритет транспорта /acp и честное переименование в AcpSessionBridge.

**Архитектура:** Разделение по области видимости — операции уровня рабочей области переносятся в новый фасад (DaemonWorkspaceService) с 4 внутренними под-сервисами; операции уровня сессии остаются в мосте. Операции рабочей области, зависящие от дочерних процессов, делегируются через внедрённые обратные вызовы. Как REST, так и /acp вызывают один и тот же L2 сервис.

**Технологический стек:** TypeScript, Vitest, Express (REST-маршруты), JSON-RPC (ACP), supertest (интеграция)

**Спецификация:** `docs/superpowers/specs/2026-05-27-daemon-workspace-service-design.md`

---

## Карта файлов

### Новые файлы

| Файл                                                                       | Описание ответственности                                                     |
| -------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `packages/cli/src/serve/workspace-service/types.ts`                        | WorkspaceRequestContext, интерфейсы под-сервисов, интерфейс зависимостей, типы результатов |
| `packages/cli/src/serve/workspace-service/index.ts`                        | Фабрика фасада `createDaemonWorkspaceService`                                |
| `packages/cli/src/serve/workspace-service/fileService.ts`                  | FileService — обёртка над fsFactory                                          |
| `packages/cli/src/serve/workspace-service/authService.ts`                  | AuthService — обёртка над DeviceFlowRegistry                                 |
| `packages/cli/src/serve/workspace-service/agentsService.ts`                | AgentsService — обёртка над SubagentManager                                  |
| `packages/cli/src/serve/workspace-service/memoryService.ts`                | MemoryService — обёртка над операциями с файлами памяти                      |
| `packages/cli/src/serve/workspace-service/__tests__/fileService.test.ts`   | Модульные тесты FileService                                                  |
| `packages/cli/src/serve/workspace-service/__tests__/authService.test.ts`   | Модульные тесты AuthService                                                  |
| `packages/cli/src/serve/workspace-service/__tests__/agentsService.test.ts` | Модульные тесты AgentsService                                                |
| `packages/cli/src/serve/workspace-service/__tests__/memoryService.test.ts` | Модульные тесты MemoryService                                                |
| `packages/cli/src/serve/workspace-service/__tests__/facade.test.ts`        | Модульные тесты фасада + методов уровня рабочей области (status/tool/init/restart) |
| `packages/cli/src/serve/workspace-service/__tests__/e2e.test.ts`           | Сквозные тесты эквивалентности REST ↔ /acp                                   |

### Изменённые файлы

| Файл                                                                        | Изменение                                                                                            |
| --------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `packages/acp-bridge/src/bridgeTypes.ts`                                    | Переименование интерфейса + удаление 8 методов + добавление 2 новых методов                           |
| `packages/acp-bridge/src/bridge.ts`                                         | Удаление 8 методов рабочей области, добавление `queryWorkspaceStatus` + `invokeWorkspaceCommand`, переименование фабрики |
| `packages/acp-bridge/src/bridgeOptions.ts`                                  | Обновление ссылок в JSDoc                                                                             |
| `packages/acp-bridge/src/status.ts`                                         | Обновление имени класса в сообщении об ошибке                                                         |
| `packages/cli/src/serve/httpAcpBridge.ts` → переименовать в `acpSessionBridge.ts` | Обновление ре-экспортов                                                                           |
| `packages/cli/src/serve/runQwenServe.ts`                                    | Создание workspace service, внедрение обратных вызовов                                                |
| `packages/cli/src/serve/server.ts`                                          | Перенаправление маршрутов рабочей области на вызов сервиса                                           |
| `packages/cli/src/serve/workspaceAgents.ts`                                 | Извлечение бизнес-логики → agentsService, оставить как оболочку маршрута                              |
| `packages/cli/src/serve/workspaceMemory.ts`                                 | Извлечение бизнес-логики → memoryService, оставить как оболочку маршрута                              |
| `packages/cli/src/serve/routes/workspaceFileRead.ts`                        | Перенаправление на вызов FileService                                                                  |
| `packages/cli/src/serve/routes/workspaceFileWrite.ts`                       | Перенаправление на вызов FileService                                                                  |

---

## Задача 1: Типы и интерфейсы

**Файлы:**

- Создать: `packages/cli/src/serve/workspace-service/types.ts`

- [ ] **Шаг 1: Создать файл типов со всеми интерфейсами**

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

> **Примечание:** Типы результатов, помеченные `/* refine */`, должны быть согласованы с существующими формами ответов в ходе реализации. Прочитайте текущие обработчики маршрутов, чтобы получить точные поля.

- [ ] **Шаг 2: Проверить, что типы компилируются**

Выполнить: `cd packages/cli && npx tsc --noEmit src/serve/workspace-service/types.ts`
Ожидается: Без ошибок (возможно, потребуется скорректировать импорты в зависимости от фактических путей экспорта)

- [ ] **Шаг 3: Закоммитить**

```bash
git add packages/cli/src/serve/workspace-service/types.ts
git commit -m "feat(serve): add DaemonWorkspaceService type definitions"
```

---

## Задача 2: FileService (TDD)

**Файлы:**

- Создать: `packages/cli/src/serve/workspace-service/__tests__/fileService.test.ts`
- Создать: `packages/cli/src/serve/workspace-service/fileService.ts`

- [ ] **Шаг 1: Написать падающие тесты для FileService.read**

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

- [ ] **Шаг 2: Запустить тест, чтобы убедиться, что он падает**

Выполнить: `cd packages/cli && npx vitest run src/serve/workspace-service/__tests__/fileService.test.ts`
Ожидается: FAIL — не найден `createFileService`

- [ ] **Шаг 3: Реализовать FileService**

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

> **Важно:** Имена методов `WorkspaceFileSystem` (`readFile`, `readFileBytes`, `writeFile`, `editFile`, `glob`, `listDirectory`, `stat`) необходимо проверить по фактическому интерфейсу в `packages/cli/src/serve/fs/workspaceFileSystem.ts`. При необходимости скорректировать.

- [ ] **Шаг 4: Запустить тест, чтобы убедиться, что он проходит**

Выполнить: `cd packages/cli && npx vitest run src/serve/workspace-service/__tests__/fileService.test.ts`
Ожидается: PASS

- [ ] **Шаг 5: Добавить тесты для write (trust gate проверяет clientId, если он есть)**

Добавить в файл теста:

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

- [ ] **Шаг 6: Запустить все тесты FileService**

Выполнить: `cd packages/cli && npx vitest run src/serve/workspace-service/__tests__/fileService.test.ts`
Ожидается: Все PASS

- [ ] **Шаг 7: Закоммитить**

```bash
git add packages/cli/src/serve/workspace-service/fileService.ts packages/cli/src/serve/workspace-service/__tests__/fileService.test.ts
git commit -m "feat(serve): add FileService wrapping fsFactory (TDD)"
```

---

## Задача 3: AuthService (TDD)

**Файлы:**

- Создать: `packages/cli/src/serve/workspace-service/__tests__/authService.test.ts`
- Создать: `packages/cli/src/serve/workspace-service/authService.ts`

- [ ] **Шаг 1: Прочитать существующую логику маршрутов аутентификации**

Прочитать: `packages/cli/src/serve/server.ts:794-966` (маршруты device flow) и `packages/cli/src/serve/auth/deviceFlow.ts`, чтобы понять интерфейс DeviceFlowRegistry.

- [ ] **Шаг 2: Написать падающий тест**

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
- [ ] **Шаг 3: Запустить тест — проверить, что падает**

Выполните: `cd packages/cli && npx vitest run src/serve/workspace-service/__tests__/authService.test.ts`
Ожидаемый результат: FAIL

- [ ] **Шаг 4: Реализовать AuthService**

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

> **Примечание:** Имена методов `DeviceFlowRegistry` (`start`, `get`, `cancel`, `getStatus`) необходимо сверить с `packages/cli/src/serve/auth/deviceFlow.ts`. При необходимости скорректируйте сигнатуры.

- [ ] **Шаг 5: Запустить тест — проверить, что проходит**

Выполните: `cd packages/cli && npx vitest run src/serve/workspace-service/__tests__/authService.test.ts`
Ожидаемый результат: PASS

- [ ] **Шаг 6: Закоммитить**

```bash
git add packages/cli/src/serve/workspace-service/authService.ts packages/cli/src/serve/workspace-service/__tests__/authService.test.ts
git commit -m "feat(serve): add AuthService wrapping DeviceFlowRegistry (TDD)"
```

---

## Задача 4: AgentsService (TDD)

**Файлы:**

- Создать: `packages/cli/src/serve/workspace-service/__tests__/agentsService.test.ts`
- Создать: `packages/cli/src/serve/workspace-service/agentsService.ts`

- [ ] **Шаг 1: Прочитать существующую логику агентов**

Прочитайте: `packages/cli/src/serve/workspaceAgents.ts` — извлеките бизнес-логику (валидацию, вызовы SubagentManager, публикацию событий). Примечание: этот файл содержит ~700+ строк, в которые вкраплена обработка маршрутов.

- [ ] **Шаг 2: Написать падающий тест — list + валидация clientId**

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
  it('list возвращает агентов из subagentManager', async () => {
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

  it('create публикует событие workspace после успеха', async () => {
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

  it('отклоняет неизвестный clientId при мутации', async () => {
    const deps = {
      subagentManager: { create: vi.fn() },
      publishWorkspaceEvent: vi.fn(),
      knownClientIds: () => new Set(['c2']), // c1 отсутствует в наборе
    };
    const service = createAgentsService(deps as any);

    await expect(
      service.create(ctx, { agentType: 'x', content: '' }),
    ).rejects.toThrow(/not registered/);
  });
});
```

- [ ] **Шаг 3: Запустить тест — проверить, что падает**

Выполните: `cd packages/cli && npx vitest run src/serve/workspace-service/__tests__/agentsService.test.ts`
Ожидаемый результат: FAIL

- [ ] **Шаг 4: Реализовать AgentsService**

Извлеките бизнес-логику из `packages/cli/src/serve/workspaceAgents.ts` в:

```ts
// packages/cli/src/serve/workspace-service/agentsService.ts
import type {
  AgentsService,
  WorkspaceRequestContext,
  WorkspaceEvent,
} from './types.js';

export interface AgentsServiceDeps {
  subagentManager: any; // уточнить тип из workspaceAgents.ts
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

> **Важно:** Фактический интерфейс SubagentManager и типы событий необходимо извлечь из `workspaceAgents.ts` в процессе реализации. Выше показан шаблон; точные имена методов/параметры могут отличаться.

- [ ] **Шаг 5: Запустить тест — проверить, что проходит**

Выполните: `cd packages/cli && npx vitest run src/serve/workspace-service/__tests__/agentsService.test.ts`
Ожидаемый результат: PASS

- [ ] **Шаг 6: Закоммитить**

```bash
git add packages/cli/src/serve/workspace-service/agentsService.ts packages/cli/src/serve/workspace-service/__tests__/agentsService.test.ts
git commit -m "feat(serve): add AgentsService with clientId validation and event publish (TDD)"
```

---

## Задача 5: MemoryService (TDD)

**Файлы:**

- Создать: `packages/cli/src/serve/workspace-service/__tests__/memoryService.test.ts`
- Создать: `packages/cli/src/serve/workspace-service/memoryService.ts`

- [ ] **Шаг 1: Прочитать существующую логику памяти**

Прочитайте: `packages/cli/src/serve/workspaceMemory.ts` — поймите, как работает CRUD для памяти (скорее всего, на основе файлов с помощью `writeWorkspaceContextFile` или подобного).

- [ ] **Шаг 2: Написать падающий тест**

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
  it('write публикует событие workspace', async () => {
    const publishWorkspaceEvent = vi.fn();
    const deps = {
      // замокать используемый бэкенд памяти
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

  it('отклоняет неизвестный clientId при записи', async () => {
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

- [ ] **Шаг 3: Реализовать MemoryService**

Извлеките логику из `packages/cli/src/serve/workspaceMemory.ts`. Шаблон идентичен AgentsService: валидация clientId при мутациях, делегирование бэкенду, публикация события.

- [ ] **Шаг 4: Запустить тесты — проверить, что проходят**

Выполните: `cd packages/cli && npx vitest run src/serve/workspace-service/__tests__/memoryService.test.ts`
Ожидаемый результат: PASS

- [ ] **Шаг 5: Закоммитить**

```bash
git add packages/cli/src/serve/workspace-service/memoryService.ts packages/cli/src/serve/workspace-service/__tests__/memoryService.test.ts
git commit -m "feat(serve): add MemoryService with event publish (TDD)"
```

---

## Задача 6: Фасад + методы с областью видимости рабочей области (TDD)

**Файлы:**

- Создать: `packages/cli/src/serve/workspace-service/__tests__/facade.test.ts`
- Создать: `packages/cli/src/serve/workspace-service/index.ts`

- [ ] **Шаг 1: Написать падающий тест для конструирования фасада + делегирования статуса**

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

  it('предоставляет подсервисы file, auth, agents, memory', () => {
    const service = createDaemonWorkspaceService(makeDeps());
    expect(service.file).toBeDefined();
    expect(service.auth).toBeDefined();
    expect(service.agents).toBeDefined();
    expect(service.memory).toBeDefined();
  });

  it('getMcpStatus делегирует вызов к queryWorkspaceStatus', async () => {
    const idle = { servers: [] };
    const queryWorkspaceStatus = vi.fn().mockResolvedValue(idle);
    const service = createDaemonWorkspaceService(
      makeDeps({ queryWorkspaceStatus }),
    );

    const result = await service.getMcpStatus();

    expect(queryWorkspaceStatus).toHaveBeenCalled();
    expect(result).toBe(idle);
  });

  it('setToolEnabled вызывает persistDisabledTools + публикует событие', async () => {
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

- [ ] **Шаг 2: Запустить тест — проверить, что падает**

Выполните: `cd packages/cli && npx vitest run src/serve/workspace-service/__tests__/facade.test.ts`
Ожидаемый результат: FAIL

- [ ] **Шаг 3: Реализовать фабрику фасада**

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
      // Перенести логику из bridge.ts:3256 — создание локального файла через fsFactory
      const fs = deps.fsFactory.forRequest({
        originatorClientId: ctx.originatorClientId,
        route: ctx.route,
      });
      // ... валидация пути + создание файла (скопировать из bridge.ts:3256-3350)
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

> **Критично:** Реализация `initWorkspace` должна быть скопирована из `bridge.ts:3256-3350` (валидация пути, проверка символических ссылок, создание файла). Используйте `fsFactory.forRequest(ctx)` вместо чистого `node:fs/promises` — это исправляет существующий FIXME.

- [ ] **Шаг 4: Запустить тест — проверить, что проходит**

Выполните: `cd packages/cli && npx vitest run src/serve/workspace-service/__tests__/facade.test.ts`
Ожидаемый результат: PASS

- [ ] **Шаг 5: Закоммитить**

```bash
git add packages/cli/src/serve/workspace-service/index.ts packages/cli/src/serve/workspace-service/__tests__/facade.test.ts
git commit -m "feat(serve): add DaemonWorkspaceService facade with status/tool/init/restart (TDD)"
```

---

## Задача 7: Bridge — Добавить делегирование дочерних процессов + удалить методы рабочей области

**Файлы:**

- Изменить: `packages/acp-bridge/src/bridge.ts`
- Изменить: `packages/acp-bridge/src/bridgeTypes.ts`

- [ ] **Шаг 1: Добавить `queryWorkspaceStatus` и `invokeWorkspaceCommand` в интерфейс bridge**

В `packages/acp-bridge/src/bridgeTypes.ts` добавьте в интерфейс (который на данный момент все еще называется `HttpAcpBridge`):

```ts
  queryWorkspaceStatus<T>(method: string, idle: () => T): Promise<T>;
  invokeWorkspaceCommand<T>(method: string, params?: Record<string, unknown>, opts?: { timeoutMs?: number }): Promise<T>;
```

- [ ] **Шаг 2: Реализовать их в bridge.ts**

В `packages/acp-bridge/src/bridge.ts` добавьте в возвращаемый объект (рядом с существующим использованием `requestWorkspaceStatus`):

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

- [ ] **Шаг 3: Удалить 8 методов рабочей области из bridge**

Удалите из bridge.ts:

- `initWorkspace` (строки ~3256-3550)
- `setWorkspaceToolEnabled` (строки ~3071-3093)
- `getWorkspaceMcpStatus` / `getWorkspaceSkillsStatus` / `getWorkspaceProvidersStatus` / `getWorkspaceEnvStatus` / `getWorkspacePreflightStatus` (строки ~2665-2790)
- `restartMcpServer` (строки ~3093-3256)

Удалите их сигнатуры из `bridgeTypes.ts`.

- [ ] **Шаг 4: Запустить тесты bridge, чтобы убедиться, что ничего не сломано**

Выполните: `cd packages/acp-bridge && npx vitest run`
Ожидаемый результат: Некоторые тесты могут ссылаться на удалённые методы — исправьте их (теперь они должны тестироваться через фасад в интеграции).

- [ ] **Шаг 5: Закоммитить**

```bash
git add packages/acp-bridge/src/bridge.ts packages/acp-bridge/src/bridgeTypes.ts
git commit -m "refactor(bridge): extract workspace methods, expose queryWorkspaceStatus + invokeWorkspaceCommand"
```

---

## Задача 8: Переименование Bridge (HttpAcpBridge → AcpSessionBridge)

**Файлы:**

- Изменить: `packages/acp-bridge/src/bridgeTypes.ts`
- Изменить: `packages/acp-bridge/src/bridge.ts`
- Изменить: `packages/acp-bridge/src/bridgeOptions.ts`
- Изменить: `packages/acp-bridge/src/status.ts`
- Изменить: `packages/acp-bridge/src/index.ts`
- Переименовать: `packages/cli/src/serve/httpAcpBridge.ts` → `packages/cli/src/serve/acpSessionBridge.ts`
- Изменить: `packages/cli/src/serve/runQwenServe.ts` (пути импорта)
- Изменить: все файлы, импортирующие `HttpAcpBridge` или `createHttpAcpBridge`

- [ ] **Шаг 1: Переименовать интерфейс и фабричную функцию в пакете acp-bridge**

В `bridgeTypes.ts`:

```ts
// Было: export interface HttpAcpBridge {
// Стало:
export interface AcpSessionBridge {
```

В `bridge.ts`:

```ts
// Было: export function createHttpAcpBridge(
// Стало:
export function createAcpSessionBridge(
```

Добавьте устаревший re-export для безопасности:
```ts
/** @deprecated Используйте AcpSessionBridge */
export type HttpAcpBridge = AcpSessionBridge;
/** @deprecated Используйте createAcpSessionBridge */
export const createHttpAcpBridge = createAcpSessionBridge;
```

- [ ] **Шаг 2: Переименование файла в пакете cli**

```bash
git mv packages/cli/src/serve/httpAcpBridge.ts packages/cli/src/serve/acpSessionBridge.ts
```

- [ ] **Шаг 3: Обновление всех импортов по всему проекту**

```bash
# Найти и исправить все ссылки
grep -rn "HttpAcpBridge\|createHttpAcpBridge\|httpAcpBridge" packages/ --include="*.ts" | grep -v node_modules | grep -v ".test.ts"
```

Обновите каждый файл, используя новые имена. Ключевые файлы:

- `packages/cli/src/serve/runQwenServe.ts`
- `packages/cli/src/serve/workspaceAgents.ts`
- `packages/cli/src/serve/workspaceMemory.ts`
- `packages/cli/src/serve/server.ts`
- `packages/acp-bridge/src/status.ts` (строка сообщения об ошибке)
- `packages/acp-bridge/src/bridgeOptions.ts` (JSDoc)

- [ ] **Шаг 4: Запуск typecheck**

Запустите: `cd packages/cli && npx tsc --noEmit && cd ../acp-bridge && npx tsc --noEmit`
Ожидается: отсутствие ошибок типов

- [ ] **Шаг 5: Запуск полных тестовых наборов**

Запустите: `cd packages/acp-bridge && npx vitest run && cd ../cli && npx vitest run`
Ожидается: все тесты проходят (тесты либо используют устаревший псевдоним, либо обновлены)

- [ ] **Шаг 6: Коммит**

```bash
git add -A
git commit -m "refactor(bridge): rename HttpAcpBridge → AcpSessionBridge"
```

---

## Задача 9: Подключение сервиса к runQwenServe + REST маршруты

**Файлы:**

- Изменить: `packages/cli/src/serve/runQwenServe.ts`
- Изменить: `packages/cli/src/serve/server.ts`
- Изменить: `packages/cli/src/serve/workspaceAgents.ts`
- Изменить: `packages/cli/src/serve/workspaceMemory.ts`
- Изменить: `packages/cli/src/serve/routes/workspaceFileRead.ts`
- Изменить: `packages/cli/src/serve/routes/workspaceFileWrite.ts`

- [ ] **Шаг 1: Создание сервиса в runQwenServe.ts**

Добавить после создания bridge:

```ts
import { createDaemonWorkspaceService } from './workspace-service/index.js';

// После создания bridge:
const workspace = createDaemonWorkspaceService({
  fsFactory,
  deviceFlowRegistry,
  subagentManager, // из существующей конструкции
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

Передать `workspace` в `createServeApp`.

- [ ] **Шаг 2: Перенаправление маршрутов статуса workspace в server.ts**

Заменить прямые вызовы bridge на вызовы сервиса:

```ts
// До:
app.get('/workspace/mcp', async (_req, res) => {
  res.status(200).json(await bridge.getWorkspaceMcpStatus());
});

// После:
app.get('/workspace/mcp', async (_req, res) => {
  res.status(200).json(await workspace.getMcpStatus());
});
```

Повторить для `/workspace/skills`, `/workspace/providers`, `/workspace/env`, `/workspace/preflight`, `/workspace/init`, маршрута переключения инструментов.

- [ ] **Шаг 3: Перенаправление маршрута workspaceAgents.ts**

Изменить `mountWorkspaceAgentsRoutes`, чтобы он принимал `workspace.agents` вместо `bridge`:

```ts
// deps.bridge.publishWorkspaceEvent → сервис обрабатывает внутри
// deps.bridge.knownClientIds() → сервис обрабатывает внутри
// Обработчик маршрута становится тонким: разобрать запрос → построить ctx → вызвать сервис → отправить ответ
```

- [ ] **Шаг 4: Перенаправление маршрута workspaceMemory.ts**

Та же схема, что и для agents.

- [ ] **Шаг 5: Перенаправление файловых маршрутов**

`workspaceFileRead.ts` и `workspaceFileWrite.ts` — изменить с вызова `fsFactory.forRequest` напрямую на вызов `workspace.file.*`:

```ts
// До:
const fs = getFsFactory(req, res);
const result = await fs.readFile(path, maxBytes);

// После:
const ctx = buildRequestContext(req);
const result = await workspace.file.read(ctx, path, { maxBytes });
```

- [ ] **Шаг 6: Запуск полного тестового набора**

Запустите: `cd packages/cli && npx vitest run`
Ожидается: все существующие тесты маршрутов проходят (HTTP-поверхность не изменилась)

- [ ] **Шаг 7: Коммит**

```bash
git add -A
git commit -m "refactor(serve): wire DaemonWorkspaceService into REST routes"
```

---

## Задача 10: Диспетчеризация методов северного направления /acp

**Файлы:**

- Изменить: соответствующий файл обработчика `/acp` (найти через `grep -rn "extMethod\|acpHttp\|acp-integration" packages/cli/src/`)
- Создать или изменить: диспетчер методов северного направления

- [ ] **Шаг 1: Найти точку входа диспетчеризации методов /acp**

```bash
grep -rn "method.*dispatch\|handleMethod\|jsonrpc.*method" packages/cli/src/acp-integration/ packages/cli/src/serve/ --include="*.ts" | grep -v test | head -20
```

- [ ] **Шаг 2: Добавить диспетчеризацию методов workspace**

В обработчике /acp, который маршрутизирует JSON-RPC методы, добавить switch/map для `qwen/workspace/*`:

```ts
// Шаблон (точное расположение зависит от структуры кодовой базы):
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
// ... все 27 методов
```

> Создайте вспомогательную функцию `buildAcpRequestContext`, которая извлекает clientId из ACP-соединения и создает `WorkspaceRequestContext`.

- [ ] **Шаг 3: Добавить объявление возможностей**

Убедитесь, что `_meta.qwen.methods` включает все методы `qwen/workspace/*` в ответе `initialize`.

- [ ] **Шаг 4: Запуск typecheck**

Запустите: `cd packages/cli && npx tsc --noEmit`
Ожидается: отсутствие ошибок

- [ ] **Шаг 5: Коммит**

```bash
git add -A
git commit -m "feat(serve): add /acp northbound workspace methods (27 qwen/workspace/* endpoints)"
```

---

## Задача 11: E2E тесты эквивалентности

**Файлы:**

- Создать: `packages/cli/src/serve/workspace-service/__tests__/e2e.test.ts`

- [ ] **Шаг 1: Создать вспомогательную функцию для тестового стенда /acp**

```ts
// Вспомогательная функция для отправки JSON-RPC на конечную точку /acp через supertest
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

- [ ] **Шаг 2: Написать тесты эквивалентности**

```ts
// packages/cli/src/serve/workspace-service/__tests__/e2e.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { createServeApp } from '../../server.js';
// ... настройка с мокированным bridge + workspace

describe('Эквивалентность REST ↔ /acp', () => {
  let app: any;

  beforeAll(() => {
    // Создать приложение с обоими REST и /acp, подключенными к одному сервису workspace
    app = createServeApp({
      /* ... тестовые зависимости */
    });
  });

  describe('чтение файла', () => {
    it('возвращает одинаковое содержимое через оба транспорта', async () => {
      const restRes = await request(app)
        .get('/file?path=README.md')
        .set('Authorization', 'Bearer tok');
      const acpRes = await acpCall(app, 'qwen/workspace/fs/read', {
        path: 'README.md',
      });

      expect(restRes.body.content).toBe(acpRes.result.content);
    });
  });

  describe('отклонение доверительного шлюза', () => {
    it('отклоняет недопустимый clientId через REST (400)', async () => {
      const res = await request(app)
        .post('/file/write')
        .set('Authorization', 'Bearer tok')
        .set('X-Qwen-Client-Id', 'unknown-client')
        .send({ path: 'x.ts', content: 'y' });
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('invalid_client_id');
    });

    it('отклоняет недопустимый clientId через /acp (ошибка JSON-RPC)', async () => {
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

- [ ] **Шаг 3: Запуск e2e тестов**

Запустите: `cd packages/cli && npx vitest run src/serve/workspace-service/__tests__/e2e.test.ts`
Ожидается: PASS

- [ ] **Шаг 4: Коммит**

```bash
git add packages/cli/src/serve/workspace-service/__tests__/e2e.test.ts
git commit -m "test(serve): add REST ↔ /acp equivalence e2e tests"
```

---

## Задача 12: Финальная проверка

- [ ] **Шаг 1: Запустить полную проверку типов во всех пакетах**

```bash
cd packages/acp-bridge && npx tsc --noEmit && cd ../cli && npx tsc --noEmit && cd ../sdk-typescript && npx tsc --noEmit
```

Ожидается: отсутствие ошибок

- [ ] **Шаг 2: Запустить полные тестовые наборы**

```bash
cd packages/acp-bridge && npx vitest run && cd ../cli && npx vitest run
```

Ожидается: все тесты проходят. Тесты SDK должны проходить БЕЗ изменений (REST-поверхность не изменилась).

- [ ] **Шаг 3: Убедиться, что тесты SDK проходят без изменений**

```bash
cd packages/sdk-typescript && npx vitest run
```

Ожидается: все проходят — подтверждает обратную совместимость.

- [ ] **Шаг 4: Запустить линтер**

```bash
cd packages/cli && npm run lint && cd ../acp-bridge && npm run lint
```

Ожидается: отсутствие ошибок

- [ ] **Шаг 5: Финальный коммит (если требуется очистка)**

```bash
git status
# Если чисто, коммит не нужен. Если исправления линтера:
git add -A && git commit -m "chore: lint fixes"
```

- [ ] **Шаг 6: Проверить, что история git чиста**

```bash
git log --oneline -15
```

Убедитесь, что коммиты образуют связную историю для рецензента одного PR.