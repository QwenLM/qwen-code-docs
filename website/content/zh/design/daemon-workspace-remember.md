# Daemon Workspace Remember — 无会话记忆摄入

> **状态**：已提议 — 实现见 [PR #5884](https://github.com/QwenLM/qwen-code/pull/5884)（分支 `codex/sessionless-daemon-remember`），尚未合并。

---

## 1. 问题陈述

Daemon 的托管内存系统（自动提取、dream agent）之前需要活跃的聊天会话才能写入记忆。这导致了两个问题：

1. **设置 UI 无法写入记忆** — web-shell 设置面板需要保存用户提供的事实（例如“始终使用 TypeScript 严格模式”），而无需创建或污染可见的聊天会话。
2. **会话列表污染** — 仅仅为了运行 `/remember` 命令而创建一个一次性会话，会给会话列表增加噪音，并让看到他们从未打开过的幽灵会话的用户感到困惑。

解决方案是一个**无会话的工作区级别 remember 端点**，它对记忆写入任务进行排队，通过隐藏的 `AgentHeadless` fork（不创建会话）执行它们，并通过轮询暴露状态。

---

## 2. 设计概述

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

关键特性：

- **无需会话** — bridge 确保生成 ACP 子进程，但不创建/加载/恢复任何 ACP 会话。
- **串行执行** — 任务通过 promise-chain lane 逐个执行，防止对托管内存文件系统进行并发写入。
- **隐藏** — fork 出的 agent 以 `name: 'managed-auto-memory-remember'` 运行，对会话列表不可见。
- **能力声明** — 在 daemon 的 `/capabilities` 响应中包含 `workspace_memory_remember`，支持的 `modes: ['workspace', 'clean']`。

---

## 3. API 端点

### 3.1 `POST /workspace/memory/remember`

将新的 remember 任务加入队列。

**请求：**

```json
{
  "content": "The user prefers dark mode in all editors",
  "contextMode": "workspace"
}
```

| 字段          | 类型     | 必填 | 描述                                                                                                        |
| ------------- | -------- | ---- | ----------------------------------------------------------------------------------------------------------- |
| `content`     | `string` | 是   | 需要记住的事实。最大 64 KiB（UTF-8 字节长度）。                                                             |
| `contextMode` | `string` | 否   | `"workspace"`（默认）— agent 查看工作区内存上下文。`"clean"` — agent 不查看先前的用户记忆。                 |

**请求头：**

- `Authorization: Bearer <token>`（必需）
- `X-Qwen-Client-Id: <clientId>`（可选 — 限制任务可见性）

**响应 `202 Accepted`：**

```json
{
  "taskId": "remember-a1b2c3d4-...",
  "status": "queued",
  "contextMode": "workspace",
  "createdAt": "2026-06-01T12:00:00.000Z",
  "updatedAt": "2026-06-01T12:00:00.000Z"
}
```

**错误响应：**

| 状态码 | 代码                         | 条件                                        |
| ------ | ---------------------------- | ------------------------------------------- |
| 400    | `invalid_content`            | 内容缺失、为空或超大                        |
| 400    | `invalid_context_mode`       | 无法识别的 contextMode 值                   |
| 400    | `invalid_client_id`          | X-Qwen-Client-Id 未在 bridge 中注册         |
| 409    | `managed_memory_unavailable` | 工作区未配置托管内存                        |
| 429    | `remember_queue_full`        | 已排队 16 个待处理任务                      |
| 500    | `remember_failed`            | 可用性检查意外抛出异常                      |

### 3.2 `GET /workspace/memory/remember/:taskId`

轮询任务状态。

**请求头：**

- `Authorization: Bearer <token>`（必需）
- `X-Qwen-Client-Id: <clientId>`（可选 — 必须与发起方匹配才能查看任务）

**响应 `200 OK`（queued/running）：**

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

- `status` 将为 `"queued"` 或 `"running"`，具体取决于任务是否已开始执行。
- `result`：仅当 `status === "completed"` 时存在（非 null）。
- `error`：仅当 `status === "failed"` 时存在（非 null）。

**响应 `200 OK`（completed）：**

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

**响应 `200 OK`（failed）：**

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

**错误响应：**

| 状态码 | 代码                      | 条件                                               |
| ------ | ------------------------- | -------------------------------------------------- |
| 400    | `invalid_client_id`       | X-Qwen-Client-Id 未注册                            |
| 404    | `remember_task_not_found` | 任务不存在或属于其他客户端                         |

---

## 4. 任务生命周期

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

- **queued** — 任务已创建并在串行 lane 中等待。
- **running** — bridge 调用正在进行中；fork 出的 agent 正在执行。
- **completed** — agent 成功完成；`result` 已填充。
- **failed** — agent 抛出异常或超时；`error` 已填充。

lane 最多存储 **1000 个任务**（达到上限时，终态任务按 FIFO 顺序淘汰）。任何时刻最多允许 **16 个任务**处于待处理状态（queued + running）。

---

## 5. 实现细节

### 5.1 串行任务 Lane (`WorkspaceRememberTaskLane`)

位于 `packages/cli/src/serve/workspace-remember.ts`。维护一个 `Map<taskId, TaskRecord>` 和一个单一的 promise chain (`this.tail`)。每次 `enqueue()` 会追加一个 `run` 函数，该函数：

1. 将状态设置为 `running`。
2. 调用 `bridge.runWorkspaceMemoryRemember({ content, contextMode })`。
3. 成功时：将状态设置为 `completed`，填充 `result`，发布 `memory_changed` 事件。
4. 失败时：将状态设置为 `failed`，使用稳定的公开错误代码填充 `error`。

lane 保证严格的串行化 — 一次只执行一个 remember 任务，防止对托管内存进行并发文件系统写入。

### 5.2 Bridge 层 (`HttpAcpBridge`)

在 `BridgeInterface` (`packages/acp-bridge/src/bridgeTypes.ts`) 中添加了两个方法：

- `isWorkspaceMemoryRememberAvailable()` — 在子进程上调用 `qwen/control/workspace/memory/remember/availability` ext-method。返回 `boolean`。用于在排队前快速失败返回 `409`。
- `runWorkspaceMemoryRemember(request)` — 调用 `qwen/control/workspace/memory/remember` ext-method。超时时间为 **300 秒** (`WORKSPACE_MEMORY_REMEMBER_TIMEOUT_MS`)。不会创建或加载会话。

这两个方法都会调用 `ensureChannel()`（如果需要则生成 ACP 子进程），并在之后如果没有活跃会话则重启空闲计时器。

### 5.3 ACP 子进程执行 (`QwenAgent.extMethod`)

在 `packages/cli/src/acp-integration/acpAgent.ts` 中，`workspaceMemoryRemember` 的处理程序：

1. 验证 `content`（非空字符串，≤64 KiB）和 `contextMode`。
2. 检查 `config.isManagedMemoryAvailable()`。
3. 使用 **295 秒**的中止信号调用 `runManagedRememberByAgent()` (`WORKSPACE_MEMORY_REMEMBER_CHILD_TIMEOUT_MS` — 略小于 bridge 超时时间，以确保子进程在 bridge 兜底前中止)。

### 5.4 核心 Remember 逻辑 (`packages/core/src/memory/remember.ts`)

`runManagedRememberByAgent()`：

1. 从项目的托管内存索引构建一个干净的内存系统提示词。
2. 可选地剥离先前的用户记忆（如果 `contextMode === 'clean'`）。
3. 创建一个 `memoryScopedAgentConfig`，将文件 I/O 限制为仅限内存目录。
4. 运行一个 **fork 出的无头 agent** (`runForkedAgent`)，配置如下：
   - 名称：`managed-auto-memory-remember`
   - 工具：`read_file`、`grep`、`ls`、`write_file`、`edit`
   - 最大轮数：6
   - 最大时间：5 分钟
5. 验证所有触及的文件都在允许的内存路径内 (`classifyTouchedScopes`)。如果 agent 写入内存目录之外的路径，则抛出 `remember_path_escape`。
6. 为任何触及的范围重建内存索引。
7. 返回 `{ summary, filesTouched, touchedScopes }`。

### 5.5 内存范围 Agent 配置 (`packages/core/src/memory/memory-scoped-agent-config.ts`)

`createMemoryScopedAgentConfig()` 创建一个权限受限的 `Config` 包装器，该包装器：

- **写入工具** (`write_file`、`edit`)：仅允许在项目自动内存根目录或用户内存根目录 (`~/.qwen/memories`) 内使用。
- **读取工具** (`read_file`、`grep`、`ls`)：当 `restrictReadsToMemoryPaths` 为 true 时，仅允许在内存目录内使用。
- **Shell**：默认禁用；如果启用，仅允许只读命令。
- 解析符号链接以防止路径遍历逃逸。

---

## 6. 事件

### `memory_changed` (scope: `managed`)

当 remember 任务成功完成时，在 daemon SSE 事件流 (`GET /session/:id/events`) 上作为 `memory_changed` 事件发布，其 `scope: 'managed'`。订阅了每个会话事件流的客户端会收到此通知。

**Payload：**

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

| 字段            | 类型        | 描述                                                |
| --------------- | ----------- | --------------------------------------------------- |
| `scope`         | `"managed"` | 与基于文件的 `memory_changed` 事件区分              |
| `source`        | `string`    | 此功能始终为 `"workspace_memory_remember"`          |
| `taskId`        | `string`    | 与 POST 返回的任务关联                              |
| `touchedScopes` | `string[]`  | 写入了哪些内存范围：`"user"`、`"project"`           |

如果在 POST 时提供了 `originatorClientId`，它会附加到事件信封上，以便事件总线将其路由到发起客户端。

---

## 7. 错误处理

### 错误代码

| 代码                         | 来源                | 含义                                                   |
| ---------------------------- | ------------------- | ------------------------------------------------------ |
| `invalid_content`            | HTTP 路由           | 内容缺失、为空或超过 64 KiB                            |
| `invalid_context_mode`       | HTTP 路由           | contextMode 不是 `"workspace"` 或 `"clean"`            |
| `invalid_client_id`          | HTTP 路由           | Client-Id 请求头不在 bridge 的已知集合中               |
| `managed_memory_unavailable` | Bridge / ACP 子进程 | 工作区未配置托管内存                                   |
| `remember_queue_full`        | 任务 lane           | 达到 16 个待处理任务上限                               |
| `remember_path_escape`       | 核心 remember 逻辑  | Agent 写入到托管内存目录之外的路径                     |
| `remember_failed`            | 兜底                | 未分类的 agent 失败、超时或内部错误                    |
| `remember_task_not_found`    | HTTP 路由           | GET 请求未知或未授权的任务 ID                          |

### 超时链

```
Agent forked runner:   5 min maxTimeMinutes
Child abort signal:  295 s  (WORKSPACE_MEMORY_REMEMBER_CHILD_TIMEOUT_MS)
Bridge timeout:      300 s  (WORKSPACE_MEMORY_REMEMBER_TIMEOUT_MS)
```

子进程在 bridge 超时前中止，确保传播干净的错误，而不是传输层超时。

---

## 8. SDK 集成

### TypeScript SDK (`@qwen-code/sdk-typescript`)

在 `DaemonClient` 上新增两个方法：

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

### UI 事件标准化

SDK 标准化器将原始的 `memory_changed` SSE 事件（带有 `scope: 'managed'`）映射为 `DaemonUiWorkspaceMemoryChangedEvent`：

```typescript
{
  type: 'workspace.memory.changed',
  scope: 'managed',
  source: 'workspace_memory_remember',
  taskId: 'remember-...',
  touchedScopes: ['user', 'project']
}
```

这扩展了现有的 `workspace.memory.changed` 事件类型，该类型之前仅携带 `scope: 'workspace' | 'global'` 用于基于文件的 QWEN.md 写入。

---

## 9. 设计原理

### 为什么无会话？

CLI 中的 `/remember` 斜杠命令已经在会话中工作。但是，设置 UI 和编程式 SDK 调用者不应该仅仅为了持久化一个事实就需要创建一个会话。会话意味着对话历史、轮次跟踪以及在会话列表中的可见性 — 这些都不适用于即发即弃的记忆写入。

### 为什么串行执行？

托管内存系统将事实存储在带有索引的 markdown 文件中。来自多个 remember 任务的并发写入可能会损坏索引或产生合并冲突。单线程 lane 是最简单且正确的解决方案。

### 为什么使用任务队列（而非同步）？

记忆写入涉及 LLM agent 决定将事实存储在_哪里_以及_如何_存储（在 user 和 project 范围之间选择，挑选合适的文件，格式化）。这需要 2-30 秒。同步 HTTP 请求要么会超时，要么会阻塞客户端。异步队列 + 轮询模式保持了 HTTP 契约的简单性，并允许客户端显示进度 UI。

### 为什么需要 contextMode？

- `"workspace"`（默认）— remember agent 将现有记忆作为上下文查看，使其能够去重或更新现有条目。
- `"clean"` — agent 不查看先前的用户记忆，当调用者希望强制进行全新写入而不使用去重逻辑时（例如批量导入），这非常有用。

### 为什么将读取限制在内存路径？

remember agent 应该只在托管内存目录内读取/写入。这可以防止提示词注入场景，即精心构造的 `content` 欺骗 agent 读取敏感的项目文件并将其泄露到记忆条目中。