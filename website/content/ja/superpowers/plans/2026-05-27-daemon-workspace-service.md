```markdown
# DaemonWorkspaceService 実装計画

> **エージェントワーカー向け:** 必須のサブスキル: `superpowers:subagent-driven-development`（推奨）または `superpowers:executing-plans` を使用して、タスクごとに計画を実装してください。ステップはチェックボックス（`- [ ]`）構文で追跡します。

**目標:** HttpAcpBridge からワークスペーススコープの全機能を新しい DaemonWorkspaceService に抽出し、/acp トランスポートのパリティを実現し、AcpSessionBridge への適切なリネームを行います。

**アーキテクチャ:** スコープベースの分割 — ワークスペーススコープの操作は4つの内部サブサービスを持つ新しいファサード（DaemonWorkspaceService）に移行し、セッションスコープの操作はブリッジに残します。子依存のワークスペース操作は注入されたコールバックを介して委譲します。REST と /acp の両方が同じ L2 サービスを呼び出します。

**技術スタック:** TypeScript、Vitest、Express (REST ルート)、JSON-RPC (ACP)、supertest (統合テスト)

**仕様:** `docs/superpowers/specs/2026-05-27-daemon-workspace-service-design.md`

---

## ファイルマップ

### 新規ファイル

| ファイル                                                                          | 責任                                                                     |
| --------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| `packages/cli/src/serve/workspace-service/types.ts`                               | WorkspaceRequestContext、サブサービスインターフェース、deps インターフェース、結果型 |
| `packages/cli/src/serve/workspace-service/index.ts`                               | ファサードファクトリ `createDaemonWorkspaceService`                      |
| `packages/cli/src/serve/workspace-service/fileService.ts`                         | FileService — fsFactory のラップ                                         |
| `packages/cli/src/serve/workspace-service/authService.ts`                         | AuthService — DeviceFlowRegistry のラップ                                |
| `packages/cli/src/serve/workspace-service/agentsService.ts`                       | AgentsService — SubagentManager のラップ                                 |
| `packages/cli/src/serve/workspace-service/memoryService.ts`                       | MemoryService — メモリファイル操作のラップ                                |
| `packages/cli/src/serve/workspace-service/__tests__/fileService.test.ts`          | FileService 単体テスト                                                    |
| `packages/cli/src/serve/workspace-service/__tests__/authService.test.ts`          | AuthService 単体テスト                                                    |
| `packages/cli/src/serve/workspace-service/__tests__/agentsService.test.ts`        | AgentsService 単体テスト                                                  |
| `packages/cli/src/serve/workspace-service/__tests__/memoryService.test.ts`        | MemoryService 単体テスト                                                  |
| `packages/cli/src/serve/workspace-service/__tests__/facade.test.ts`               | ファサード + ワークスペーススコープメソッド (status/tool/init/restart) 単体テスト |
| `packages/cli/src/serve/workspace-service/__tests__/e2e.test.ts`                  | REST ↔ /acp 等価性 e2e テスト                                            |

### 変更ファイル

| ファイル                                                                       | 変更内容                                                                                                    |
| ------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------- |
| `packages/acp-bridge/src/bridgeTypes.ts`                                       | インターフェース名を変更 + 8メソッド削除 + 2新メソッド追加                                                  |
| `packages/acp-bridge/src/bridge.ts`                                            | 8つのワークスペースメソッドを削除、`queryWorkspaceStatus` + `invokeWorkspaceCommand` を公開、ファクトリ名を変更 |
| `packages/acp-bridge/src/bridgeOptions.ts`                                     | JSDoc 参照を更新                                                                                            |
| `packages/acp-bridge/src/status.ts`                                            | エラーメッセージのクラス名を更新                                                                            |
| `packages/cli/src/serve/httpAcpBridge.ts` → `acpSessionBridge.ts` にリネーム  | 再エクスポートを更新                                                                                        |
| `packages/cli/src/serve/runQwenServe.ts`                                       | ワークスペースサービスを構築、コールバックを注入                                                            |
| `packages/cli/src/serve/server.ts`                                             | ワークスペースルートがサービスを呼び出すよう再配線                                                          |
| `packages/cli/src/serve/workspaceAgents.ts`                                    | ビジネスロジックを抽出して agentsService に移行、ルートシェルとして維持                                      |
| `packages/cli/src/serve/workspaceMemory.ts`                                    | ビジネスロジックを抽出して memoryService に移行、ルートシェルとして維持                                      |
| `packages/cli/src/serve/routes/workspaceFileRead.ts`                           | FileService を呼び出すよう再配線                                                                            |
| `packages/cli/src/serve/routes/workspaceFileWrite.ts`                          | FileService を呼び出すよう再配線                                                                            |

---

## タスク 1: 型とインターフェース

**ファイル:**

- 作成: `packages/cli/src/serve/workspace-service/types.ts`

- [ ] **ステップ 1: すべてのインターフェースを含む型ファイルを作成**

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

// --- リクエストコンテキスト ---

export interface WorkspaceRequestContext {
  originatorClientId?: string;
  sessionId?: string;
  route: string;
  workspaceCwd: string;
}

// --- サブサービスインターフェース ---

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

// --- ファサードインターフェース ---

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

// --- deps（コールバック注入） ---

export interface WorkspaceEvent {
  type: string;
  data: Record<string, unknown>;
  originatorClientId?: string;
}

export interface DaemonWorkspaceServiceDeps {
  fsFactory: WorkspaceFileSystemFactory;
  deviceFlowRegistry: DeviceFlowRegistry;
  subagentManager: unknown; // workspaceAgents.ts からの型 — 実装時に精緻化
  boundWorkspace: string;
  contextFilename: string;
  persistDisabledTools: (
    workspace: string,
    tool: string,
    enabled: boolean,
  ) => Promise<void>;

  // 横断的コールバック（セッション由来の基盤）
  publishWorkspaceEvent: (event: WorkspaceEvent) => void;
  knownClientIds: () => Set<string>;

  // 子委譲コールバック
  queryWorkspaceStatus: <T>(method: string, idle: () => T) => Promise<T>;
  invokeWorkspaceCommand: <T>(
    method: string,
    params?: Record<string, unknown>,
    opts?: { timeoutMs?: number },
  ) => Promise<T>;
}

// --- 結果型（実装時に既存コードから精緻化） ---

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
  state: string /* 既存型から精緻化 */;
}
export interface AuthStatusResult {
  authenticated: boolean /* 既存から精緻化 */;
}
export interface AgentSummary {
  agentType: string /* 精緻化 */;
}
export interface AgentDetail {
  agentType: string /* 精緻化 */;
}
export interface AgentCreateSpec {
  agentType: string;
  content: string /* 精緻化 */;
}
export interface AgentUpdateSpec {
  content: string /* 精緻化 */;
}
export interface MemoryEntry {
  key: string /* 精緻化 */;
}
export interface MemoryContent {
  key: string;
  content: string;
}
export interface InitWorkspaceOpts {
  /* bridge.ts:3256 から精緻化 */
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

> **注意:** `/* 精緻化 */` とマークされた結果型は、実装時に既存のレスポンス形状に合わせて調整してください。現在のルートハンドラを読んで正確なフィールドを取得してください。

- [ ] **ステップ 2: 型がコンパイルされることを確認**

実行: `cd packages/cli && npx tsc --noEmit src/serve/workspace-service/types.ts`
期待結果: エラーなし（実際のエクスポートパスに応じてインポートを調整する必要がある場合があります）

- [ ] **ステップ 3: コミット**

```bash
git add packages/cli/src/serve/workspace-service/types.ts
git commit -m "feat(serve): add DaemonWorkspaceService type definitions"
```

---

## タスク 2: FileService (TDD)

**ファイル:**

- 作成: `packages/cli/src/serve/workspace-service/__tests__/fileService.test.ts`
- 作成: `packages/cli/src/serve/workspace-service/fileService.ts`

- [ ] **ステップ 1: FileService.read の失敗テストを作成**

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
    it('fsFactory.forRequest をコンテキストで呼び出し、readFile に委譲する', async () => {
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

    it('originatorClientId なしでも動作する（読み取り専用、認証不要）', async () => {
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

- [ ] **ステップ 2: テストを実行して失敗を確認**

実行: `cd packages/cli && npx vitest run src/serve/workspace-service/__tests__/fileService.test.ts`
期待結果: FAIL — `createFileService` が見つからない

- [ ] **ステップ 3: FileService を実装**

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

> **重要:** `WorkspaceFileSystem` のメソッド名（`readFile`、`readFileBytes`、`writeFile`、`editFile`、`glob`、`listDirectory`、`stat`）は、`packages/cli/src/serve/fs/workspaceFileSystem.ts` の実際のインターフェースと照合する必要があります。異なる場合は調整してください。

- [ ] **ステップ 4: テストを実行して成功を確認**

実行: `cd packages/cli && npx vitest run src/serve/workspace-service/__tests__/fileService.test.ts`
期待結果: PASS

- [ ] **ステップ 5: write のテストを追加（trust gate が存在時に clientId を検証することを確認）**

テストファイルに追加:

```ts
describe('write', () => {
  it('監査のために originatorClientId を forRequest に渡す', async () => {
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

- [ ] **ステップ 6: FileService の全テストを実行**

実行: `cd packages/cli && npx vitest run src/serve/workspace-service/__tests__/fileService.test.ts`
期待結果: すべて PASS

- [ ] **ステップ 7: コミット**

```bash
git add packages/cli/src/serve/workspace-service/fileService.ts packages/cli/src/serve/workspace-service/__tests__/fileService.test.ts
git commit -m "feat(serve): add FileService wrapping fsFactory (TDD)"
```

---

## タスク 3: AuthService (TDD)

**ファイル:**

- 作成: `packages/cli/src/serve/workspace-service/__tests__/authService.test.ts`
- 作成: `packages/cli/src/serve/workspace-service/authService.ts`

- [ ] **ステップ 1: 既存の認証ルートロジックを読む**

`packages/cli/src/serve/server.ts:794-966`（デバイスフロールート）と `packages/cli/src/serve/auth/deviceFlow.ts` を読んで、DeviceFlowRegistry インターフェースを理解します。

- [ ] **ステップ 2: 失敗テストを作成**

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
  it('startFlow が registry.start に委譲し、flowId + verificationUri + userCode を返す', async () => {
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

  it('cancelFlow が registry.cancel に委譲する', async () => {
    const registry = { cancel: vi.fn().mockReturnValue({ cancelled: true }) };
    const service = createAuthService({ deviceFlowRegistry: registry as any });

    await service.cancelFlow(ctx, 'flow-1');

    expect(registry.cancel).toHaveBeenCalledWith('flow-1', undefined);
  });
});
```

(Note: The original content seems to cut off at this point. I will translate exactly what was provided, including the incomplete test file. The rest of the tasks for AuthService are not present, so I stop here.

Also note: The original translation output likely should include the rest of the document, but the user's content ends after the second test in step 2. I will only translate what is given.

But wait, the user provided a long content. The last line of the provided content is:

```
  it('cancelFlow delegates to registry.cancel', async () => {
    const registry = { cancel: vi.fn().mockReturnValue({ cancelled: true }) };
    const service = createAuthService({ deviceFlowRegistry: registry as any });

    await service.cancelFlow(ctx, 'flow-1');

    expect(registry.cancel).toHaveBeenCalledWith('flow-1', undefined);
  });
});
```

That is the end of the content. So I need to translate up to that point.

I will now output the full translated Markdown as per the instructions, preserving everything.
```
- [ ] **ステップ 3: テスト実行 — 失敗を確認**

実行: `cd packages/cli && npx vitest run src/serve/workspace-service/__tests__/authService.test.ts`
期待結果: FAIL

- [ ] **ステップ 4: AuthService を実装**

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

> **Note:** `DeviceFlowRegistry` のメソッド名 (`start`, `get`, `cancel`, `getStatus`) は `packages/cli/src/serve/auth/deviceFlow.ts` で実際の定義を確認してください。必要に応じてシグネチャを調整してください。

- [ ] **ステップ 5: テスト実行 — 成功を確認**

実行: `cd packages/cli && npx vitest run src/serve/workspace-service/__tests__/authService.test.ts`
期待結果: PASS

- [ ] **ステップ 6: コミット**

```bash
git add packages/cli/src/serve/workspace-service/authService.ts packages/cli/src/serve/workspace-service/__tests__/authService.test.ts
git commit -m "feat(serve): add AuthService wrapping DeviceFlowRegistry (TDD)"
```

---

## Task 4: AgentsService (TDD)

**ファイル:**

- 作成: `packages/cli/src/serve/workspace-service/__tests__/agentsService.test.ts`
- 作成: `packages/cli/src/serve/workspace-service/agentsService.ts`

- [ ] **ステップ 1: 既存のエージェントロジックを読む**

参照: `packages/cli/src/serve/workspaceAgents.ts` — ビジネスロジック（バリデーション、SubagentManager の呼び出し、イベント発行）を抽出します。注意: このファイルは 700 行以上あり、ルート処理が混在しています。

- [ ] **ステップ 2: 失敗するテストを記述 — list + clientId バリデーション**

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

- [ ] **ステップ 3: テスト実行 — 失敗を確認**

実行: `cd packages/cli && npx vitest run src/serve/workspace-service/__tests__/agentsService.test.ts`
期待結果: FAIL

- [ ] **ステップ 4: AgentsService を実装**

`packages/cli/src/serve/workspaceAgents.ts` からビジネスロジックを抽出し、以下に配置:

```ts
// packages/cli/src/serve/workspace-service/agentsService.ts
import type {
  AgentsService,
  WorkspaceRequestContext,
  WorkspaceEvent,
} from './types.js';

export interface AgentsServiceDeps {
  subagentManager: any; // workspaceAgents.ts から型を精緻化
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

> **Important:** 実際の SubagentManager インターフェースとイベントタイプは、実装時に `workspaceAgents.ts` から抽出する必要があります。上記はパターンです。正確なメソッド名やパラメータは異なります。

- [ ] **ステップ 5: テスト実行 — 成功を確認**

実行: `cd packages/cli && npx vitest run src/serve/workspace-service/__tests__/agentsService.test.ts`
期待結果: PASS

- [ ] **ステップ 6: コミット**

```bash
git add packages/cli/src/serve/workspace-service/agentsService.ts packages/cli/src/serve/workspace-service/__tests__/agentsService.test.ts
git commit -m "feat(serve): add AgentsService with clientId validation and event publish (TDD)"
```

---

## Task 5: MemoryService (TDD)

**ファイル:**

- 作成: `packages/cli/src/serve/workspace-service/__tests__/memoryService.test.ts`
- 作成: `packages/cli/src/serve/workspace-service/memoryService.ts`

- [ ] **ステップ 1: 既存のメモリロジックを読む**

参照: `packages/cli/src/serve/workspaceMemory.ts` — メモリの CRUD がどのように動作するか理解します（おそらく `writeWorkspaceContextFile` などを使用したファイルベース）。

- [ ] **ステップ 2: 失敗するテストを記述**

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
      // 使用されるメモリバックエンドをモック
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

- [ ] **ステップ 3: MemoryService を実装**

`packages/cli/src/serve/workspaceMemory.ts` からロジックを抽出。パターンは AgentsService と同じ: ミューテーション時に clientId を検証し、バックエンドに委譲し、イベントを発行します。

- [ ] **ステップ 4: テスト実行 — 成功を確認**

実行: `cd packages/cli && npx vitest run src/serve/workspace-service/__tests__/memoryService.test.ts`
期待結果: PASS

- [ ] **ステップ 5: コミット**

```bash
git add packages/cli/src/serve/workspace-service/memoryService.ts packages/cli/src/serve/workspace-service/__tests__/memoryService.test.ts
git commit -m "feat(serve): add MemoryService with event publish (TDD)"
```

---

## Task 6: Facade + ワークスペーススコープのメソッド (TDD)

**ファイル:**

- 作成: `packages/cli/src/serve/workspace-service/__tests__/facade.test.ts`
- 作成: `packages/cli/src/serve/workspace-service/index.ts`

- [ ] **ステップ 1: ファサード構築 + ステータス委譲の失敗テストを記述**

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

- [ ] **ステップ 2: テスト実行 — 失敗を確認**

実行: `cd packages/cli && npx vitest run src/serve/workspace-service/__tests__/facade.test.ts`
期待結果: FAIL

- [ ] **ステップ 3: ファサードファクトリを実装**

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
      // bridge.ts:3256 からロジックを移行 — fsFactory によるローカルファイル作成
      const fs = deps.fsFactory.forRequest({
        originatorClientId: ctx.originatorClientId,
        route: ctx.route,
      });
      // ... パス検証 + ファイル作成 (bridge.ts:3256-3350 からコピー)
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

> **Critical:** `initWorkspace` の実装は `bridge.ts:3256-3350` からコピーする必要があります（パス検証、シンボリックリンクチェック、ファイル作成）。`fsFactory.forRequest(ctx)` を使用し、生の `node:fs/promises` は使わないでください。これにより既存の FIXME が修正されます。

- [ ] **ステップ 4: テスト実行 — 成功を確認**

実行: `cd packages/cli && npx vitest run src/serve/workspace-service/__tests__/facade.test.ts`
期待結果: PASS

- [ ] **ステップ 5: コミット**

```bash
git add packages/cli/src/serve/workspace-service/index.ts packages/cli/src/serve/workspace-service/__tests__/facade.test.ts
git commit -m "feat(serve): add DaemonWorkspaceService facade with status/tool/init/restart (TDD)"
```

---

## Task 7: Bridge — 子委譲を公開 + ワークスペースメソッドを削除

**ファイル:**

- 変更: `packages/acp-bridge/src/bridge.ts`
- 変更: `packages/acp-bridge/src/bridgeTypes.ts`

- [ ] **ステップ 1: `queryWorkspaceStatus` と `invokeWorkspaceCommand` をブリッジインターフェースに追加**

`packages/acp-bridge/src/bridgeTypes.ts` で、インターフェース（この時点ではまだ `HttpAcpBridge` という名前）に以下を追加:

```ts
  queryWorkspaceStatus<T>(method: string, idle: () => T): Promise<T>;
  invokeWorkspaceCommand<T>(method: string, params?: Record<string, unknown>, opts?: { timeoutMs?: number }): Promise<T>;
```

- [ ] **ステップ 2: bridge.ts に実装**

`packages/acp-bridge/src/bridge.ts` で、返されるオブジェクト（既存の `requestWorkspaceStatus` の使用箇所の近く）に以下を追加:

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

- [ ] **ステップ 3: ブリッジから 8 つのワークスペースメソッドを削除**

bridge.ts から以下を削除:

- `initWorkspace` (行 ~3256-3550)
- `setWorkspaceToolEnabled` (行 ~3071-3093)
- `getWorkspaceMcpStatus` / `getWorkspaceSkillsStatus` / `getWorkspaceProvidersStatus` / `getWorkspaceEnvStatus` / `getWorkspacePreflightStatus` (行 ~2665-2790)
- `restartMcpServer` (行 ~3093-3256)

`bridgeTypes.ts` からそれらのシグネチャを削除。

- [ ] **ステップ 4: ブリッジテストを実行して壊れていないことを確認**

実行: `cd packages/acp-bridge && npx vitest run`
期待結果: 一部のテストは削除されたメソッドを参照している可能性があるため修正してください（これらはファサード経由で統合テストされるべきです）。

- [ ] **ステップ 5: コミット**

```bash
git add packages/acp-bridge/src/bridge.ts packages/acp-bridge/src/bridgeTypes.ts
git commit -m "refactor(bridge): extract workspace methods, expose queryWorkspaceStatus + invokeWorkspaceCommand"
```

---

## Task 8: ブリッジのリネーム (HttpAcpBridge → AcpSessionBridge)

**ファイル:**

- 変更: `packages/acp-bridge/src/bridgeTypes.ts`
- 変更: `packages/acp-bridge/src/bridge.ts`
- 変更: `packages/acp-bridge/src/bridgeOptions.ts`
- 変更: `packages/acp-bridge/src/status.ts`
- 変更: `packages/acp-bridge/src/index.ts`
- 名称変更: `packages/cli/src/serve/httpAcpBridge.ts` → `packages/cli/src/serve/acpSessionBridge.ts`
- 変更: `packages/cli/src/serve/runQwenServe.ts` (インポートパス)
- 変更: `HttpAcpBridge` または `createHttpAcpBridge` をインポートしているすべてのファイル

- [ ] **ステップ 1: acp-bridge パッケージ内のインターフェースとファクトリ関数をリネーム**

`bridgeTypes.ts`:

```ts
// 変更前: export interface HttpAcpBridge {
// 変更後:
export interface AcpSessionBridge {
```

`bridge.ts`:

```ts
// 変更前: export function createHttpAcpBridge(
// 変更後:
export function createAcpSessionBridge(
```

安全のため、非推奨の再エクスポートを追加:
```ts
/** @deprecated AcpSessionBridge を使用してください */
export type HttpAcpBridge = AcpSessionBridge;
/** @deprecated createAcpSessionBridge を使用してください */
export const createHttpAcpBridge = createAcpSessionBridge;
```

- [ ] **ステップ 2: cli パッケージ内のファイル名変更**

```bash
git mv packages/cli/src/serve/httpAcpBridge.ts packages/cli/src/serve/acpSessionBridge.ts
```

- [ ] **ステップ 3: プロジェクト全体の import を更新**

```bash
# すべての参照を検索して修正
grep -rn "HttpAcpBridge\|createHttpAcpBridge\|httpAcpBridge" packages/ --include="*.ts" | grep -v node_modules | grep -v ".test.ts"
```

各ファイルを新しい名前に更新します。主なファイル:

- `packages/cli/src/serve/runQwenServe.ts`
- `packages/cli/src/serve/workspaceAgents.ts`
- `packages/cli/src/serve/workspaceMemory.ts`
- `packages/cli/src/serve/server.ts`
- `packages/acp-bridge/src/status.ts` (エラーメッセージ文字列)
- `packages/acp-bridge/src/bridgeOptions.ts` (JSDoc)

- [ ] **ステップ 4: 型チェックを実行**

実行: `cd packages/cli && npx tsc --noEmit && cd ../acp-bridge && npx tsc --noEmit`
期待結果: 型エラーなし

- [ ] **ステップ 5: 全テストスイートを実行**

実行: `cd packages/acp-bridge && npx vitest run && cd ../cli && npx vitest run`
期待結果: すべてパス（テストは非推奨のエイリアスを使用しているか、更新済み）

- [ ] **ステップ 6: コミット**

```bash
git add -A
git commit -m "refactor(bridge): rename HttpAcpBridge → AcpSessionBridge"
```

---

## タスク 9: runQwenServe + REST ルートへのサービスの組み込み

**ファイル:**

- 修正: `packages/cli/src/serve/runQwenServe.ts`
- 修正: `packages/cli/src/serve/server.ts`
- 修正: `packages/cli/src/serve/workspaceAgents.ts`
- 修正: `packages/cli/src/serve/workspaceMemory.ts`
- 修正: `packages/cli/src/serve/routes/workspaceFileRead.ts`
- 修正: `packages/cli/src/serve/routes/workspaceFileWrite.ts`

- [ ] **ステップ 1: runQwenServe.ts でサービスを構築**

ブリッジ構築後に追加:

```ts
import { createDaemonWorkspaceService } from './workspace-service/index.js';

// ブリッジ作成後:
const workspace = createDaemonWorkspaceService({
  fsFactory,
  deviceFlowRegistry,
  subagentManager, // 既存の構築から
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

`workspace` を `createServeApp` に渡します。

- [ ] **ステップ 2: server.ts でワークスペースステータスルートを再配線**

ブリッジの直接呼び出しをサービス呼び出しに置き換え:

```ts
// 変更前:
app.get('/workspace/mcp', async (_req, res) => {
  res.status(200).json(await bridge.getWorkspaceMcpStatus());
});

// 変更後:
app.get('/workspace/mcp', async (_req, res) => {
  res.status(200).json(await workspace.getMcpStatus());
});
```

`/workspace/skills`、`/workspace/providers`、`/workspace/env`、`/workspace/preflight`、`/workspace/init`、ツール切り替えルートについても同様に繰り返します。

- [ ] **ステップ 3: workspaceAgents.ts ルートシェルを再配線**

`mountWorkspaceAgentsRoutes` が `bridge` の代わりに `workspace.agents` を受け取るように変更:

```ts
// deps.bridge.publishWorkspaceEvent → サービスが内部で処理
// deps.bridge.knownClientIds() → サービスが内部で処理
// ルートハンドラはシンプルに: リクエストを解析 → ctx を構築 → サービスを呼び出し → レスポンスを送信
```

- [ ] **ステップ 4: workspaceMemory.ts ルートシェルを再配線**

エージェントと同じパターン。

- [ ] **ステップ 5: ファイルルートを再配線**

`workspaceFileRead.ts` と `workspaceFileWrite.ts` — `fsFactory.forRequest` の直接呼び出しから `workspace.file.*` の呼び出しに変更:

```ts
// 変更前:
const fs = getFsFactory(req, res);
const result = await fs.readFile(path, maxBytes);

// 変更後:
const ctx = buildRequestContext(req);
const result = await workspace.file.read(ctx, path, { maxBytes });
```

- [ ] **ステップ 6: 全テストスイートを実行**

実行: `cd packages/cli && npx vitest run`
期待結果: 既存のルートテストがすべてパス（HTTP 表面は変更なし）

- [ ] **ステップ 7: コミット**

```bash
git add -A
git commit -m "refactor(serve): wire DaemonWorkspaceService into REST routes"
```

---

## タスク 10: /acp 北向きメソッドディスパッチ

**ファイル:**

- 修正: 該当する `/acp` ハンドラファイル (`grep -rn "extMethod\|acpHttp\|acp-integration" packages/cli/src/` で特定)
- 作成または修正: 北向きメソッドディスパッチャ

- [ ] **ステップ 1: /acp メソッドディスパッチのエントリポイントを特定**

```bash
grep -rn "method.*dispatch\|handleMethod\|jsonrpc.*method" packages/cli/src/acp-integration/ packages/cli/src/serve/ --include="*.ts" | grep -v test | head -20
```

- [ ] **ステップ 2: ワークスペースメソッドディスパッチを追加**

JSON-RPC メソッドをルーティングする /acp ハンドラ内で、`qwen/workspace/*` 用の switch/map を追加:

```ts
// パターン（正確な位置はコードベース構造による）:
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
// ... 全 27 メソッド
```

> ヘルパー `buildAcpRequestContext` を作成し、ACP 接続から clientId を抽出して `WorkspaceRequestContext` を構築します。

- [ ] **ステップ 3: 機能アドバタイズメントを追加**

`initialize` レスポンスの `_meta.qwen.methods` にすべての `qwen/workspace/*` メソッドが含まれていることを確認します。

- [ ] **ステップ 4: 型チェックを実行**

実行: `cd packages/cli && npx tsc --noEmit`
期待結果: エラーなし

- [ ] **ステップ 5: コミット**

```bash
git add -A
git commit -m "feat(serve): add /acp northbound workspace methods (27 qwen/workspace/* endpoints)"
```

---

## タスク 11: E2E 等価性テスト

**ファイル:**

- 作成: `packages/cli/src/serve/workspace-service/__tests__/e2e.test.ts`

- [ ] **ステップ 1: /acp テストハーネスヘルパーを構築**

```ts
// supertest を使用して /acp エンドポイントに JSON-RPC を送信するヘルパー
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

- [ ] **ステップ 2: 等価性テストを記述**

```ts
// packages/cli/src/serve/workspace-service/__tests__/e2e.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { createServeApp } from '../../server.js';
// ... モックの bridge + workspace を使用したセットアップ

describe('REST ↔ /acp 等価性', () => {
  let app: any;

  beforeAll(() => {
    // REST と /acp の両方を同じ workspace サービスに配線したアプリを作成
    app = createServeApp({
      /* ... テスト用依存関係 */
    });
  });

  describe('ファイル読み取り', () => {
    it('両方のトランスポートで同じコンテンツを返す', async () => {
      const restRes = await request(app)
        .get('/file?path=README.md')
        .set('Authorization', 'Bearer tok');
      const acpRes = await acpCall(app, 'qwen/workspace/fs/read', {
        path: 'README.md',
      });

      expect(restRes.body.content).toBe(acpRes.result.content);
    });
  });

  describe('トラストゲート拒否', () => {
    it('REST 経由で無効な clientId を拒否 (400)', async () => {
      const res = await request(app)
        .post('/file/write')
        .set('Authorization', 'Bearer tok')
        .set('X-Qwen-Client-Id', 'unknown-client')
        .send({ path: 'x.ts', content: 'y' });
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('invalid_client_id');
    });

    it('/acp 経由で無効な clientId を拒否 (JSON-RPC エラー)', async () => {
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

- [ ] **ステップ 3: E2E テストを実行**

実行: `cd packages/cli && npx vitest run src/serve/workspace-service/__tests__/e2e.test.ts`
期待結果: PASS

- [ ] **ステップ 4: コミット**

```bash
git add packages/cli/src/serve/workspace-service/__tests__/e2e.test.ts
git commit -m "test(serve): add REST ↔ /acp equivalence e2e tests"
```

---

## タスク 12: 最終確認

- [ ] **ステップ 1: 全パッケージで完全な型チェックを実行**

```bash
cd packages/acp-bridge && npx tsc --noEmit && cd ../cli && npx tsc --noEmit && cd ../sdk-typescript && npx tsc --noEmit
```

期待結果: エラーなし

- [ ] **ステップ 2: 全テストスイートを実行**

```bash
cd packages/acp-bridge && npx vitest run && cd ../cli && npx vitest run
```

期待結果: すべてパス。SDK テストは変更なしでパスする必要があります（REST 表面は変更されていません）。

- [ ] **ステップ 3: SDK テストが変更なしでパスすることを確認**

```bash
cd packages/sdk-typescript && npx vitest run
```

期待結果: すべてパス — 下位互換性を確認。

- [ ] **ステップ 4: Lint を実行**

```bash
cd packages/cli && npm run lint && cd ../acp-bridge && npm run lint
```

期待結果: エラーなし

- [ ] **ステップ 5: 最終コミット（クリーンアップが必要な場合）**

```bash
git status
# クリーンならコミット不要。lint 修正があれば:
git add -A && git commit -m "chore: lint fixes"
```

- [ ] **ステップ 6: git ログがクリーンであることを確認**

```bash
git log --oneline -15
```

コミットが単一 PR のレビュアーにとって一貫性のあるストーリーになっていることを確認します。