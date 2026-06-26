# DaemonWorkspaceService 实现计划

> **针对代理工作者的说明：** 必选子技能：使用超能力：subagent-driven-development（推荐）或 superpowers:executing-plans 来逐步实现此计划。步骤使用复选框（`- [ ]`）语法进行跟踪。

**目标：** 将 HttpAcpBridge 中所有工作空间级别的能力提取到新的 DaemonWorkspaceService 中，实现 /acp 传输的对等支持，并重命名为 AcpSessionBridge。

**架构：** 基于范围进行拆分 —— 工作空间级别的操作转移到新的外观层（DaemonWorkspaceService），包含 4 个内部子服务；会话级别的操作保留在 bridge 中。依赖子工作空间的操通过注入的回调进行委托。REST 和 /acp 都调用同一个 L2 服务。

**技术栈：** TypeScript, Vitest, Express (REST 路由), JSON-RPC (ACP), supertest (集成测试)

**规格文档：** `docs/superpowers/specs/2026-05-27-daemon-workspace-service-design.md`

---

## 文件映射

### 新文件

| 文件                                                                                     | 职责                                                         |
| ---------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| `packages/cli/src/serve/workspace-service/types.ts`                                      | WorkspaceRequestContext, 子服务接口, 依赖接口, 结果类型      |
| `packages/cli/src/serve/workspace-service/index.ts`                                      | 外观工厂 `createDaemonWorkspaceService`                      |
| `packages/cli/src/serve/workspace-service/fileService.ts`                                | FileService —— 封装 fsFactory                                |
| `packages/cli/src/serve/workspace-service/authService.ts`                                | AuthService —— 封装 DeviceFlowRegistry                       |
| `packages/cli/src/serve/workspace-service/agentsService.ts`                              | AgentsService —— 封装 SubagentManager                        |
| `packages/cli/src/serve/workspace-service/memoryService.ts`                              | MemoryService —— 封装 memory 文件操作                        |
| `packages/cli/src/serve/workspace-service/__tests__/fileService.test.ts`                  | FileService 单元测试                                         |
| `packages/cli/src/serve/workspace-service/__tests__/authService.test.ts`                  | AuthService 单元测试                                         |
| `packages/cli/src/serve/workspace-service/__tests__/agentsService.test.ts`                | AgentsService 单元测试                                       |
| `packages/cli/src/serve/workspace-service/__tests__/memoryService.test.ts`                | MemoryService 单元测试                                       |
| `packages/cli/src/serve/workspace-service/__tests__/facade.test.ts`                       | 外观层 + 工作空间相关方法 (status/tool/init/restart) 单元测试 |
| `packages/cli/src/serve/workspace-service/__tests__/e2e.test.ts`                          | REST ↔ /acp 等价性端到端测试                                 |

### 修改的文件

| 文件                                                                                         | 变更                                                                                      |
| -------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `packages/acp-bridge/src/bridgeTypes.ts`                                                     | 重命名接口 + 移除 8 个方法 + 新增 2 个方法                                               |
| `packages/acp-bridge/src/bridge.ts`                                                          | 移除 8 个工作空间方法, 暴露 `queryWorkspaceStatus` + `invokeWorkspaceCommand`, 重命名工厂 |
| `packages/acp-bridge/src/bridgeOptions.ts`                                                   | 更新 JSDoc 引用                                                                           |
| `packages/acp-bridge/src/status.ts`                                                          | 更新错误消息类名                                                                          |
| `packages/cli/src/serve/httpAcpBridge.ts` → 重命名为 `acpSessionBridge.ts`                    | 更新重新导出                                                                              |
| `packages/cli/src/serve/runQwenServe.ts`                                                    | 构建 workspace 服务, 注入回调                                                             |
| `packages/cli/src/serve/server.ts`                                                           | 重新连接工作空间路由以调用服务                                                            |
| `packages/cli/src/serve/workspaceAgents.ts`                                                 | 提取业务逻辑 → agentsService, 保留为路由外壳                                              |
| `packages/cli/src/serve/workspaceMemory.ts`                                                 | 提取业务逻辑 → memoryService, 保留为路由外壳                                              |
| `packages/cli/src/serve/routes/workspaceFileRead.ts`                                        | 重新连接以调用 FileService                                                                |
| `packages/cli/src/serve/routes/workspaceFileWrite.ts`                                       | 重新连接以调用 FileService                                                                |

---

## 任务 1：类型与接口

**文件：**

- 创建：`packages/cli/src/serve/workspace-service/types.ts`

- [ ] **步骤 1：创建包含所有接口的类型文件**

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

// --- 请求上下文 ---

export interface WorkspaceRequestContext {
  originatorClientId?: string;
  sessionId?: string;
  route: string;
  workspaceCwd: string;
}

// --- 子服务接口 ---

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

// --- 外观接口 ---

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

// --- 依赖（回调注入） ---

export interface WorkspaceEvent {
  type: string;
  data: Record<string, unknown>;
  originatorClientId?: string;
}

export interface DaemonWorkspaceServiceDeps {
  fsFactory: WorkspaceFileSystemFactory;
  deviceFlowRegistry: DeviceFlowRegistry;
  subagentManager: unknown; // 类型来自 workspaceAgents.ts — 实现时细化
  boundWorkspace: string;
  contextFilename: string;
  persistDisabledTools: (
    workspace: string,
    tool: string,
    enabled: boolean,
  ) => Promise<void>;

  // 横切回调（基于会话的基础设施）
  publishWorkspaceEvent: (event: WorkspaceEvent) => void;
  knownClientIds: () => Set<string>;

  // 子委托回调
  queryWorkspaceStatus: <T>(method: string, idle: () => T) => Promise<T>;
  invokeWorkspaceCommand: <T>(
    method: string,
    params?: Record<string, unknown>,
    opts?: { timeoutMs?: number },
  ) => Promise<T>;
}

// --- 结果类型（实现时从现有代码中细化） ---

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
  state: string /* 从现有类型中细化 */;
}
export interface AuthStatusResult {
  authenticated: boolean /* 从现有中细化 */;
}
export interface AgentSummary {
  agentType: string /* 细化 */;
}
export interface AgentDetail {
  agentType: string /* 细化 */;
}
export interface AgentCreateSpec {
  agentType: string;
  content: string /* 细化 */;
}
export interface AgentUpdateSpec {
  content: string /* 细化 */;
}
export interface MemoryEntry {
  key: string /* 细化 */;
}
export interface MemoryContent {
  key: string;
  content: string;
}
export interface InitWorkspaceOpts {
  /* 从 bridge.ts:3256 细化 */
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

> **注意：** 标记为 `/* 细化 */` 的结果类型应在实现过程中与现有响应形状对齐。阅读当前路由处理器以获取确切字段。

- [ ] **步骤 2：验证类型编译通过**

运行：`cd packages/cli && npx tsc --noEmit src/serve/workspace-service/types.ts`
预期：无错误（可能需要根据实际导出路径调整导入）

- [ ] **步骤 3：提交**

```bash
git add packages/cli/src/serve/workspace-service/types.ts
git commit -m "feat(serve): add DaemonWorkspaceService type definitions"
```

---

## 任务 2：FileService (TDD)

**文件：**

- 创建：`packages/cli/src/serve/workspace-service/__tests__/fileService.test.ts`
- 创建：`packages/cli/src/serve/workspace-service/fileService.ts`

- [ ] **步骤 1：编写 FileService.read 的失败测试**

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
    it('使用上下文调用 fsFactory.forRequest 并委托给 readFile', async () => {
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

    it('在没有 originatorClientId 时正常工作（只读，无需认证）', async () => {
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

- [ ] **步骤 2：运行测试以验证其失败**

运行：`cd packages/cli && npx vitest run src/serve/workspace-service/__tests__/fileService.test.ts`
预期：FAIL — 未找到 `createFileService`

- [ ] **步骤 3：实现 FileService**

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

> **重要：** `WorkspaceFileSystem` 上的方法名称（`readFile`, `readFileBytes`, `writeFile`, `editFile`, `glob`, `listDirectory`, `stat`）必须与 `packages/cli/src/serve/fs/workspaceFileSystem.ts` 中的实际接口进行核对。如有不同请调整。

- [ ] **步骤 4：运行测试以验证通过**

运行：`cd packages/cli && npx vitest run src/serve/workspace-service/__tests__/fileService.test.ts`
预期：PASS

- [ ] **步骤 5：为 write 添加测试（信任门控验证存在 clientId）**

添加到测试文件中：

```ts
describe('write', () => {
  it('将 originatorClientId 传递给 forRequest 进行审计', async () => {
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

- [ ] **步骤 6：运行完整的 FileService 测试**

运行：`cd packages/cli && npx vitest run src/serve/workspace-service/__tests__/fileService.test.ts`
预期：全部 PASS

- [ ] **步骤 7：提交**

```bash
git add packages/cli/src/serve/workspace-service/fileService.ts packages/cli/src/serve/workspace-service/__tests__/fileService.test.ts
git commit -m "feat(serve): add FileService wrapping fsFactory (TDD)"
```

---

## 任务 3：AuthService (TDD)

**文件：**

- 创建：`packages/cli/src/serve/workspace-service/__tests__/authService.test.ts`
- 创建：`packages/cli/src/serve/workspace-service/authService.ts`

- [ ] **步骤 1：阅读现有 auth 路由逻辑**

阅读：`packages/cli/src/serve/server.ts:794-966`（设备流路由）和 `packages/cli/src/serve/auth/deviceFlow.ts` 以理解 DeviceFlowRegistry 接口。

- [ ] **步骤 2：编写失败测试**

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
  it('startFlow 委托给 registry.start 并返回 flowId + verificationUri + userCode', async () => {
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

  it('cancelFlow 委托给 registry.cancel', async () => {
    const registry = { cancel: vi.fn().mockReturnValue({ cancelled: true }) };
    const service = createAuthService({ deviceFlowRegistry: registry as any });

    await service.cancelFlow(ctx, 'flow-1');

    expect(registry.cancel).toHaveBeenCalledWith('flow-1', undefined);
  });
});
```
- [ ] **第 3 步：运行测试 — 验证失败**

运行：`cd packages/cli && npx vitest run src/serve/workspace-service/__tests__/authService.test.ts`
预期：FAIL

- [ ] **第 4 步：实现 AuthService**

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

> **注意：** `DeviceFlowRegistry` 上的方法名（`start`、`get`、`cancel`、`getStatus`）必须与 `packages/cli/src/serve/auth/deviceFlow.ts` 中的定义保持一致。如有必要，请调整签名。

- [ ] **第 5 步：运行测试 — 验证通过**

运行：`cd packages/cli && npx vitest run src/serve/workspace-service/__tests__/authService.test.ts`
预期：PASS

- [ ] **第 6 步：提交**

```bash
git add packages/cli/src/serve/workspace-service/authService.ts packages/cli/src/serve/workspace-service/__tests__/authService.test.ts
git commit -m "feat(serve): add AuthService wrapping DeviceFlowRegistry (TDD)"
```

---

## 任务 4：AgentsService（TDD）

**文件：**

- 新建：`packages/cli/src/serve/workspace-service/__tests__/agentsService.test.ts`
- 新建：`packages/cli/src/serve/workspace-service/agentsService.ts`

- [ ] **第 1 步：阅读现有 agent 逻辑**

阅读：`packages/cli/src/serve/workspaceAgents.ts` — 提取业务逻辑（校验、SubagentManager 调用、事件发布）。注意：该文件约 700+ 行，混杂了路由处理。

- [ ] **第 2 步：编写测试（预期失败）— list + clientId 校验**

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
  it('list 返回 subagentManager 中的 agents', async () => {
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

  it('create 在成功后发布 workspace 事件', async () => {
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

  it('在 mutation 操作中拒绝未知 clientId', async () => {
    const deps = {
      subagentManager: { create: vi.fn() },
      publishWorkspaceEvent: vi.fn(),
      knownClientIds: () => new Set(['c2']), // c1 不在集合中
    };
    const service = createAgentsService(deps as any);

    await expect(
      service.create(ctx, { agentType: 'x', content: '' }),
    ).rejects.toThrow(/not registered/);
  });
});
```

- [ ] **第 3 步：运行测试 — 验证失败**

运行：`cd packages/cli && npx vitest run src/serve/workspace-service/__tests__/agentsService.test.ts`
预期：FAIL

- [ ] **第 4 步：实现 AgentsService**

从 `packages/cli/src/serve/workspaceAgents.ts` 中提取业务逻辑到：

```ts
// packages/cli/src/serve/workspace-service/agentsService.ts
import type {
  AgentsService,
  WorkspaceRequestContext,
  WorkspaceEvent,
} from './types.js';

export interface AgentsServiceDeps {
  subagentManager: any; // 根据 workspaceAgents.ts 细化类型
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
      `客户端 ID "${ctx.originatorClientId}" 未在此工作区注册`,
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

> **重要：** 实际的 SubagentManager 接口和事件类型需在实现时从 `workspaceAgents.ts` 中提取。上述代码仅为模式示例；具体方法名/参数会有所不同。

- [ ] **第 5 步：运行测试 — 验证通过**

运行：`cd packages/cli && npx vitest run src/serve/workspace-service/__tests__/agentsService.test.ts`
预期：PASS

- [ ] **第 6 步：提交**

```bash
git add packages/cli/src/serve/workspace-service/agentsService.ts packages/cli/src/serve/workspace-service/__tests__/agentsService.test.ts
git commit -m "feat(serve): add AgentsService with clientId validation and event publish (TDD)"
```

---

## 任务 5：MemoryService（TDD）

**文件：**

- 新建：`packages/cli/src/serve/workspace-service/__tests__/memoryService.test.ts`
- 新建：`packages/cli/src/serve/workspace-service/memoryService.ts`

- [ ] **第 1 步：阅读现有 memory 逻辑**

阅读：`packages/cli/src/serve/workspaceMemory.ts` — 了解 memory 的 CRUD 实现方式（可能基于文件，使用 `writeWorkspaceContextFile` 或类似方法）。

- [ ] **第 2 步：编写测试（预期失败）**

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
  it('write 发布 workspace 事件', async () => {
    const publishWorkspaceEvent = vi.fn();
    const deps = {
      // 模拟所使用的 memory 后端
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

  it('在 write 中拒绝未知 clientId', async () => {
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

- [ ] **第 3 步：实现 MemoryService**

从 `packages/cli/src/serve/workspaceMemory.ts` 中提取逻辑。模式与 AgentsService 相同：对 mutation 操作校验 clientId，委托给后端，发布事件。

- [ ] **第 4 步：运行测试 — 验证通过**

运行：`cd packages/cli && npx vitest run src/serve/workspace-service/__tests__/memoryService.test.ts`
预期：PASS

- [ ] **第 5 步：提交**

```bash
git add packages/cli/src/serve/workspace-service/memoryService.ts packages/cli/src/serve/workspace-service/__tests__/memoryService.test.ts
git commit -m "feat(serve): add MemoryService with event publish (TDD)"
```

---

## 任务 6：Facade + 工作区作用域方法（TDD）

**文件：**

- 新建：`packages/cli/src/serve/workspace-service/__tests__/facade.test.ts`
- 新建：`packages/cli/src/serve/workspace-service/index.ts`

- [ ] **第 1 步：为 facade 构建及状态委托编写测试（预期失败）**

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

  it('暴露 file、auth、agents、memory 子服务', () => {
    const service = createDaemonWorkspaceService(makeDeps());
    expect(service.file).toBeDefined();
    expect(service.auth).toBeDefined();
    expect(service.agents).toBeDefined();
    expect(service.memory).toBeDefined();
  });

  it('getMcpStatus 委托给 queryWorkspaceStatus 回调', async () => {
    const idle = { servers: [] };
    const queryWorkspaceStatus = vi.fn().mockResolvedValue(idle);
    const service = createDaemonWorkspaceService(
      makeDeps({ queryWorkspaceStatus }),
    );

    const result = await service.getMcpStatus();

    expect(queryWorkspaceStatus).toHaveBeenCalled();
    expect(result).toBe(idle);
  });

  it('setToolEnabled 调用 persistDisabledTools 并发布事件', async () => {
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

- [ ] **第 2 步：运行测试 — 验证失败**

运行：`cd packages/cli && npx vitest run src/serve/workspace-service/__tests__/facade.test.ts`
预期：FAIL

- [ ] **第 3 步：实现 facade 工厂**

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
      // 从 bridge.ts:3256 迁移逻辑 — 通过 fsFactory 创建本地文件
      const fs = deps.fsFactory.forRequest({
        originatorClientId: ctx.originatorClientId,
        route: ctx.route,
      });
      // ... 路径校验 + 文件创建（从 bridge.ts:3256-3350 复制）
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

> **关键：** `initWorkspace` 的实现必须从 `bridge.ts:3256-3350` 复制（路径校验、符号链接检查、文件创建）。使用 `fsFactory.forRequest(ctx)` 而非原生的 `node:fs/promises` — 这可以修复现有的 FIXME。

- [ ] **第 4 步：运行测试 — 验证通过**

运行：`cd packages/cli && npx vitest run src/serve/workspace-service/__tests__/facade.test.ts`
预期：PASS

- [ ] **第 5 步：提交**

```bash
git add packages/cli/src/serve/workspace-service/index.ts packages/cli/src/serve/workspace-service/__tests__/facade.test.ts
git commit -m "feat(serve): add DaemonWorkspaceService facade with status/tool/init/restart (TDD)"
```

---

## 任务 7：Bridge — 暴露子委托 + 移除 Workspace 方法

**文件：**

- 修改：`packages/acp-bridge/src/bridge.ts`
- 修改：`packages/acp-bridge/src/bridgeTypes.ts`

- [ ] **第 1 步：将 `queryWorkspaceStatus` 和 `invokeWorkspaceCommand` 添加到 bridge 接口**

在 `packages/acp-bridge/src/bridgeTypes.ts` 中，添加到接口（此时仍名为 `HttpAcpBridge`）：

```ts
  queryWorkspaceStatus<T>(method: string, idle: () => T): Promise<T>;
  invokeWorkspaceCommand<T>(method: string, params?: Record<string, unknown>, opts?: { timeoutMs?: number }): Promise<T>;
```

- [ ] **第 2 步：在 bridge.ts 中实现它们**

在 `packages/acp-bridge/src/bridge.ts` 中，添加到返回的对象（在现有的 `requestWorkspaceStatus` 用法附近）：

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

- [ ] **第 3 步：从 bridge 中移除 8 个 workspace 方法**

从 bridge.ts 中移除：

- `initWorkspace`（约第 3256-3550 行）
- `setWorkspaceToolEnabled`（约第 3071-3093 行）
- `getWorkspaceMcpStatus` / `getWorkspaceSkillsStatus` / `getWorkspaceProvidersStatus` / `getWorkspaceEnvStatus` / `getWorkspacePreflightStatus`（约第 2665-2790 行）
- `restartMcpServer`（约第 3093-3256 行）

同时在 `bridgeTypes.ts` 中移除对应的方法签名。

- [ ] **第 4 步：运行 bridge 测试以确保没有破坏**

运行：`cd packages/acp-bridge && npx vitest run`
预期：部分测试可能引用了已移除的方法 — 修复它们（这些测试现在应该通过 facade 在集成测试中验证）。

- [ ] **第 5 步：提交**

```bash
git add packages/acp-bridge/src/bridge.ts packages/acp-bridge/src/bridgeTypes.ts
git commit -m "refactor(bridge): extract workspace methods, expose queryWorkspaceStatus + invokeWorkspaceCommand"
```

---

## 任务 8：Bridge 重命名（HttpAcpBridge → AcpSessionBridge）

**文件：**

- 修改：`packages/acp-bridge/src/bridgeTypes.ts`
- 修改：`packages/acp-bridge/src/bridge.ts`
- 修改：`packages/acp-bridge/src/bridgeOptions.ts`
- 修改：`packages/acp-bridge/src/status.ts`
- 修改：`packages/acp-bridge/src/index.ts`
- 重命名：`packages/cli/src/serve/httpAcpBridge.ts` → `packages/cli/src/serve/acpSessionBridge.ts`
- 修改：`packages/cli/src/serve/runQwenServe.ts`（导入路径）
- 修改：所有导入了 `HttpAcpBridge` 或 `createHttpAcpBridge` 的文件

- [ ] **第 1 步：重命名 acp-bridge 包中的接口和工厂函数**

在 `bridgeTypes.ts` 中：

```ts
// 之前：export interface HttpAcpBridge {
// 之后：
export interface AcpSessionBridge {
```

在 `bridge.ts` 中：

```ts
// 之前：export function createHttpAcpBridge(
// 之后：
export function createAcpSessionBridge(
```

添加安全的废弃重新导出：
```ts
/** @deprecated 使用 AcpSessionBridge */
export type HttpAcpBridge = AcpSessionBridge;
/** @deprecated 使用 createAcpSessionBridge */
export const createHttpAcpBridge = createAcpSessionBridge;
```

- [ ] **步骤 2：在 cli 包中重命名文件**

```bash
git mv packages/cli/src/serve/httpAcpBridge.ts packages/cli/src/serve/acpSessionBridge.ts
```

- [ ] **步骤 3：全项目更新所有导入**

```bash
# 查找并修复所有引用
grep -rn "HttpAcpBridge\|createHttpAcpBridge\|httpAcpBridge" packages/ --include="*.ts" | grep -v node_modules | grep -v ".test.ts"
```

更新每个文件以使用新名称。关键文件：

- `packages/cli/src/serve/runQwenServe.ts`
- `packages/cli/src/serve/workspaceAgents.ts`
- `packages/cli/src/serve/workspaceMemory.ts`
- `packages/cli/src/serve/server.ts`
- `packages/acp-bridge/src/status.ts`（错误信息字符串）
- `packages/acp-bridge/src/bridgeOptions.ts`（JSDoc）

- [ ] **步骤 4：运行类型检查**

运行：`cd packages/cli && npx tsc --noEmit && cd ../acp-bridge && npx tsc --noEmit`
预期：无类型错误

- [ ] **步骤 5：运行完整测试套件**

运行：`cd packages/acp-bridge && npx vitest run && cd ../cli && npx vitest run`
预期：全部通过（测试仍使用已弃用的别名或已更新）

- [ ] **步骤 6：提交**

```bash
git add -A
git commit -m "refactor(bridge): rename HttpAcpBridge → AcpSessionBridge"
```

---

## 任务 9：将服务注入 runQwenServe + REST 路由

**文件：**

- 修改：`packages/cli/src/serve/runQwenServe.ts`
- 修改：`packages/cli/src/serve/server.ts`
- 修改：`packages/cli/src/serve/workspaceAgents.ts`
- 修改：`packages/cli/src/serve/workspaceMemory.ts`
- 修改：`packages/cli/src/serve/routes/workspaceFileRead.ts`
- 修改：`packages/cli/src/serve/routes/workspaceFileWrite.ts`

- [ ] **步骤 1：在 runQwenServe.ts 中构造服务**

在桥接构造之后添加：

```ts
import { createDaemonWorkspaceService } from './workspace-service/index.js';

// 桥接创建之后：
const workspace = createDaemonWorkspaceService({
  fsFactory,
  deviceFlowRegistry,
  subagentManager, // 来自现有构造代码
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

将 `workspace` 传递给 `createServeApp`。

- [ ] **步骤 2：在 server.ts 中重新连接工作区状态路由**

将直接的桥接调用替换为服务调用：

```ts
// 之前：
app.get('/workspace/mcp', async (_req, res) => {
  res.status(200).json(await bridge.getWorkspaceMcpStatus());
});

// 之后：
app.get('/workspace/mcp', async (_req, res) => {
  res.status(200).json(await workspace.getMcpStatus());
});
```

对 `/workspace/skills`、`/workspace/providers`、`/workspace/env`、`/workspace/preflight`、`/workspace/init`、工具切换路由重复相同操作。

- [ ] **步骤 3：重新连接 workspaceAgents.ts 路由外壳**

修改 `mountWorkspaceAgentsRoutes` 使其接收 `workspace.agents` 而不是 `bridge`：

```ts
// deps.bridge.publishWorkspaceEvent → 服务内部处理
// deps.bridge.knownClientIds() → 服务内部处理
// 路由处理程序变得轻量：解析请求 → 构建上下文 → 调用服务 → 发送响应
```

- [ ] **步骤 4：重新连接 workspaceMemory.ts 路由外壳**

与 agents 相同的模式。

- [ ] **步骤 5：重新连接文件路由**

`workspaceFileRead.ts` 和 `workspaceFileWrite.ts` — 从直接调用 `fsFactory.forRequest` 改为调用 `workspace.file.*`：

```ts
// 之前：
const fs = getFsFactory(req, res);
const result = await fs.readFile(path, maxBytes);

// 之后：
const ctx = buildRequestContext(req);
const result = await workspace.file.read(ctx, path, { maxBytes });
```

- [ ] **步骤 6：运行完整测试套件**

运行：`cd packages/cli && npx vitest run`
预期：所有现有路由测试通过（HTTP 接口不变）

- [ ] **步骤 7：提交**

```bash
git add -A
git commit -m "refactor(serve): wire DaemonWorkspaceService into REST routes"
```

---

## 任务 10：/acp 北向方法分发

**文件：**

- 修改：相关的 `/acp` 处理程序文件（通过 `grep -rn "extMethod\|acpHttp\|acp-integration" packages/cli/src/` 定位）
- 创建或修改：北向方法分发器

- [ ] **步骤 1：定位 /acp 方法分发入口点**

```bash
grep -rn "method.*dispatch\|handleMethod\|jsonrpc.*method" packages/cli/src/acp-integration/ packages/cli/src/serve/ --include="*.ts" | grep -v test | head -20
```

- [ ] **步骤 2：添加工作区方法分发**

在路由 JSON-RPC 方法的 /acp 处理程序中，为 `qwen/workspace/*` 添加 switch/map：

```ts
// 模式（具体位置取决于代码库结构）：
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
// ... 所有 27 个方法
```

> 构建一个辅助函数 `buildAcpRequestContext`，从 ACP 连接中提取 clientId 并构建 `WorkspaceRequestContext`。

- [ ] **步骤 3：添加能力通告**

确保 `initialize` 响应的 `_meta.qwen.methods` 包含所有 `qwen/workspace/*` 方法。

- [ ] **步骤 4：运行类型检查**

运行：`cd packages/cli && npx tsc --noEmit`
预期：无错误

- [ ] **步骤 5：提交**

```bash
git add -A
git commit -m "feat(serve): add /acp northbound workspace methods (27 qwen/workspace/* endpoints)"
```

---

## 任务 11：端到端等价性测试

**文件：**

- 创建：`packages/cli/src/serve/workspace-service/__tests__/e2e.test.ts`

- [ ] **步骤 1：构建 /acp 测试辅助工具**

```ts
// 使用 supertest 向 /acp 端点发送 JSON-RPC 的辅助函数
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

- [ ] **步骤 2：编写等价性测试**

```ts
// packages/cli/src/serve/workspace-service/__tests__/e2e.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { createServeApp } from '../../server.js';
// ... 使用模拟的 bridge + workspace 进行设置

describe('REST ↔ /acp 等价性', () => {
  let app: any;

  beforeAll(() => {
    // 创建同时通过 REST 和 /acp 连接到同一 workspace 服务的应用
    app = createServeApp({
      /* ... 测试依赖 */
    });
  });

  describe('文件读取', () => {
    it('通过两种传输返回相同内容', async () => {
      const restRes = await request(app)
        .get('/file?path=README.md')
        .set('Authorization', 'Bearer tok');
      const acpRes = await acpCall(app, 'qwen/workspace/fs/read', {
        path: 'README.md',
      });

      expect(restRes.body.content).toBe(acpRes.result.content);
    });
  });

  describe('信任门禁拒绝', () => {
    it('REST 拒绝无效 clientId（400）', async () => {
      const res = await request(app)
        .post('/file/write')
        .set('Authorization', 'Bearer tok')
        .set('X-Qwen-Client-Id', 'unknown-client')
        .send({ path: 'x.ts', content: 'y' });
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('invalid_client_id');
    });

    it('/acp 拒绝无效 clientId（JSON-RPC 错误）', async () => {
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

- [ ] **步骤 3：运行端到端测试**

运行：`cd packages/cli && npx vitest run src/serve/workspace-service/__tests__/e2e.test.ts`
预期：通过

- [ ] **步骤 4：提交**

```bash
git add packages/cli/src/serve/workspace-service/__tests__/e2e.test.ts
git commit -m "test(serve): add REST ↔ /acp equivalence e2e tests"
```

---

## 任务 12：最终验证

- [ ] **步骤 1：跨所有包运行完整类型检查**

```bash
cd packages/acp-bridge && npx tsc --noEmit && cd ../cli && npx tsc --noEmit && cd ../sdk-typescript && npx tsc --noEmit
```

预期：无错误

- [ ] **步骤 2：运行完整测试套件**

```bash
cd packages/acp-bridge && npx vitest run && cd ../cli && npx vitest run
```

预期：全部通过。SDK 测试应未修改就通过（REST 接口不变）。

- [ ] **步骤 3：验证 SDK 测试无需修改即通过**

```bash
cd packages/sdk-typescript && npx vitest run
```

预期：全部通过 — 确认向后兼容。

- [ ] **步骤 4：运行 lint**

```bash
cd packages/cli && npm run lint && cd ../acp-bridge && npm run lint
```

预期：无错误

- [ ] **步骤 5：最终提交（如需清理）**

```bash
git status
# 如果干净则无需提交。如有 lint 修复：
git add -A && git commit -m "chore: lint fixes"
```

- [ ] **步骤 6：验证 git 日志干净**

```bash
git log --oneline -15
```

确认提交为单 PR 评审者提供了连贯的故事。