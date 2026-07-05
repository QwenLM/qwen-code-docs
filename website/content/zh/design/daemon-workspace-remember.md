# Daemon Workspace Memory Tasks — 无会话托管内存

> **状态**：已提议 — 实现见 [PR #5884](https://github.com/QwenLM/qwen-code/pull/5884)（分支 `codex/sessionless-daemon-remember`），尚未合并。

---

## 1. 问题陈述

Daemon 的托管内存系统（自动提取、dream agent）以前需要活跃的聊天会话才能写入内存。这导致了两个问题：

1. **Settings UI 无法写入内存** — web-shell 设置面板需要保存用户提供的事实（例如“始终使用 TypeScript strict mode”），而不能创建或污染可见的聊天会话。
2. **会话列表污染** — 仅为了运行 `/remember` 命令而创建一个一次性会话，会给会话列表增加噪音，并让看到他们从未打开过的幽灵会话的用户感到困惑。

解决方案是一个**无会话的工作区级内存任务 API**，它排队 remember、forget 和 dream 任务，在不创建可见会话的情况下执行它们，并通过轮询暴露状态。

---

## 2. 设计概述

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

关键特性：

- **无需会话** — bridge 确保生成 ACP 子进程，但不创建/加载/恢复任何 ACP 会话。
- **串行执行** — 任务通过 promise-chain lane 一次执行一个，防止对托管内存文件系统进行并发写入。
- **隐藏** — remember/dream 通过隐藏的 agent 运行，forget 使用隐藏的内存配置；所有操作均不创建可见会话。
- **能力声明** — 在 daemon 的 `/capabilities` 响应中声明 `workspace_memory_remember`、`workspace_memory_forget` 和 `workspace_memory_dream`。Remember 还会声明 `modes: ['workspace', 'clean']`。

---

## 3. API 端点

### 3.1 `POST /workspace/memory/remember`

排队一个新的 remember 任务。

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
| `contextMode` | `string` | 否   | `"workspace"`（默认）— agent 可以看到工作区内存上下文。`"clean"` — agent 看不到任何先前的用户内存。           |

**请求头：**

- `Authorization: Bearer <token>`（必填）
- `X-Qwen-Client-Id: <clientId>`（可选 — 限制任务可见范围）

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

| 状态码 | 代码                         | 触发条件                                      |
| ------ | ---------------------------- | --------------------------------------------- |
| 400    | `invalid_content`            | content 缺失、为空或超大                      |
| 400    | `invalid_context_mode`       | 无法识别的 contextMode 值                     |
| 400    | `invalid_client_id`          | X-Qwen-Client-Id 未在 bridge 中注册           |
| 409    | `managed_memory_unavailable` | 工作区未配置托管内存                          |
| 429    | `remember_queue_full`        | 已排队 16 个 pending 任务                     |
| 500    | `remember_failed`            | 可用性检查意外抛出异常                        |

### 3.2 `GET /workspace/memory/remember/:taskId`

轮询任务状态。

**请求头：**

- `Authorization: Bearer <token>`（必填）
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

- `status` 将根据任务是否已开始执行显示为 `"queued"` 或 `"running"`。
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

| 状态码 | 代码                      | 触发条件                                       |
| ------ | ------------------------- | ---------------------------------------------- |
| 400    | `invalid_client_id`       | X-Qwen-Client-Id 未注册                        |
| 404    | `remember_task_not_found` | 任务不存在或属于其他 client                    |

---

### 3.3 `POST /workspace/memory/forget`

排队一个 forget 任务。Daemon 会选择匹配的托管自动内存条目并将其移除，而不创建会话。

**请求：**

```json
{
  "query": "old preference"
}
```

| 字段    | 类型     | 必填 | 描述                                                              |
| ------- | -------- | ---- | ----------------------------------------------------------------- |
| `query` | `string` | 是   | 需要忘记的自然语言描述。最大 64 KiB（UTF-8 字节长度）。           |

初始响应为 `202 Accepted`，带有 `forget-...` 任务 id。轮询 `GET /workspace/memory/forget/:taskId` 直到状态终止。

**完成结果：**

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
  "touchedTopics": ["project"]
}
```

### 3.4 `GET /workspace/memory/forget/:taskId`

轮询 forget 任务状态。结构与 remember 任务轮询相同，但没有 `contextMode` 字段，且终止失败时对未知或未授权的任务 id 使用 `forget_task_not_found`。

### 3.5 `POST /workspace/memory/dream`

排队一个 dream 任务。Daemon 会运行托管自动内存 dream 压缩流程，而不创建会话。

**请求：** 空的 JSON 对象或无 body。

初始响应为 `202 Accepted`，带有 `dream-...` 任务 id。轮询 `GET /workspace/memory/dream/:taskId` 直到状态终止。

**完成结果：**

```json
{
  "summary": "Managed auto-memory dream completed.",
  "touchedTopics": ["project"],
  "dedupedEntries": 1
}
```

### 3.6 `GET /workspace/memory/dream/:taskId`

轮询 dream 任务状态。结构与 remember 任务轮询相同，但没有 `contextMode` 字段，且终止失败时对未知或未授权的任务 id 使用 `dream_task_not_found`。

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
- **completed** — agent 成功完成；`result` 被填充。
- **failed** — agent 抛出异常或超时；`error` 被填充。

该 lane 最多存储 **1000 个任务**（达到上限时，终止的任务按 FIFO 顺序驱逐）。在任何时候，最多只能有 **16 个任务**处于 pending 状态（queued + running）。Forget 和 dream 任务共享一个较小的 **8 个 pending 任务**上限，因此突发的手动维护不会消耗掉自动 remember 工作所需的每个槽位。

---

## 5. 实现细节

### 5.1 串行任务 Lane (`WorkspaceRememberTaskLane`)

位于 `packages/cli/src/serve/workspace-remember.ts`。维护一个 `Map<taskId, TaskRecord>` 和一个单一的 promise chain (`this.tail`)。每个 `enqueue()` 会追加一个 `run` 函数，该函数：

1. 将状态设置为 `running`。
2. 调用匹配的 bridge 方法：`runWorkspaceMemoryRemember`、`runWorkspaceMemoryForget` 或 `runWorkspaceMemoryDream`。
3. 成功时：将状态设置为 `completed`，填充 `result`，并在任务实际触及托管内存时发布 `memory_changed` 事件。
4. 失败时：将状态设置为 `failed`，并使用稳定的公共错误代码填充 `error`。

该 lane 保证严格的串行化 — 一次只执行一个工作区内存任务，防止对托管内存进行并发文件系统写入。

### 5.2 Bridge 层 (`HttpAcpBridge`)

将工作区内存方法添加到 `BridgeInterface` (`packages/acp-bridge/src/bridgeTypes.ts`)：

- `isWorkspaceMemoryRememberAvailable()` — 在子进程上调用 `qwen/control/workspace/memory/remember/availability` ext-method。返回 `boolean`。用于在排队前快速失败返回 `409`。
- `runWorkspaceMemoryRemember(request)` — 调用 `qwen/control/workspace/memory/remember` ext-method。在 **300 秒** (`WORKSPACE_MEMORY_REMEMBER_TIMEOUT_MS`) 后超时。不创建或加载会话。
- `runWorkspaceMemoryForget(request)` — 调用 `qwen/control/workspace/memory/forget` ext-method 并使用相同的 bridge 超时。不创建或加载会话。
- `runWorkspaceMemoryDream()` — 调用 `qwen/control/workspace/memory/dream` ext-method 并使用相同的 bridge 超时。不创建或加载会话。

这些方法都会调用 `ensureChannel()`（如果需要则生成 ACP 子进程），并在之后如果没有活跃会话则重启空闲计时器。
### 5.3 ACP 子进程执行 (`QwenAgent.extMethod`)

在 `packages/cli/src/acp-integration/acpAgent.ts` 中，`workspaceMemoryRemember`、`workspaceMemoryForget` 和 `workspaceMemoryDream` 的处理程序：

1. 验证特定任务的输入（remember 的 `content`/`contextMode`，forget 的 `query`）。
2. 检查 `config.isManagedMemoryAvailable()`。
3. 使用 **295 秒** 的 abort signal 调用匹配的核心操作（`WORKSPACE_MEMORY_REMEMBER_CHILD_TIMEOUT_MS` —— 略小于 bridge 超时时间，以确保子进程在 bridge 兜底超时前中止）。对于 forget，该 signal 会贯穿 `MemoryManager.forget`、选择过程、模型侧查询以及应用时的文件系统变更。

### 5.4 核心 Remember 逻辑 (`packages/core/src/memory/remember.ts`)

`runManagedRememberByAgent()`：

1. 从项目的 managed memory 索引构建一个干净的 memory system prompt。
2. 可选地剥离先前的 user memory（如果 `contextMode === 'clean'`）。
3. 创建一个 `memoryScopedAgentConfig`，将文件 I/O 限制在 memory 目录内。
4. 运行一个 **forked headless agent** (`runForkedAgent`)，配置如下：
   - 名称：`managed-auto-memory-remember`
   - 工具：`read_file`、`grep`、`ls`、`write_file`、`edit`
   - 最大轮数：6
   - 最大时间：5 分钟
5. 验证所有修改的文件都在允许的 memory 路径内（`classifyTouchedScopes`）。如果 agent 写入到 memory 目录之外，则抛出 `remember_path_escape`。
6. 为所有修改过的 scope 重建 memory 索引。
7. 返回 `{ summary, filesTouched, touchedScopes }`。

### 5.5 Memory-Scoped Agent 配置 (`packages/core/src/memory/memory-scoped-agent-config.ts`)

`createMemoryScopedAgentConfig()` 创建一个受权限限制的 `Config` 包装器，其规则如下：

- **写入工具**（`write_file`、`edit`）：仅允许在项目 auto-memory 根目录或 user memory 根目录（`~/.qwen/memories`）内使用。
- **读取工具**（`read_file`、`grep`、`ls`）：当 `restrictReadsToMemoryPaths` 为 true 时，仅允许在 memory 目录内使用。
- **Shell**：默认禁用；如果启用，则仅允许只读命令。
- 解析符号链接以防止路径遍历逃逸。

---

## 6. 事件

### `memory_changed` (scope: `managed`)

当 workspace memory 任务成功完成并实际修改了 managed memory 时，会在 daemon SSE 事件流（`GET /session/:id/events`）上发布一个 `scope: 'managed'` 的 `memory_changed` 事件。订阅了该 session 事件流的客户端会收到此通知。

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

| 字段 | 类型 | 描述 |
| --- | --- | --- |
| `scope` | `"managed"` | 用于区分基于文件的 `memory_changed` 事件 |
| `source` | `string` | `"workspace_memory_remember"`、`"workspace_memory_forget"` 或 `"workspace_memory_dream"` |
| `taskId` | `string` | 与 POST 返回的任务关联 |
| `touchedScopes` | `string[]` | 被写入的 memory scope：`"user"`、`"project"` |

`originatorClientId`（如果在 POST 时提供）会附加到事件信封（envelope）中，以便事件总线将其路由到发起请求的客户端。

---

## 7. 错误处理

### 错误码

| 错误码 | 来源 | 含义 |
| --- | --- | --- |
| `invalid_content` | HTTP 路由 | Content 缺失、为空或超过 64 KiB |
| `invalid_context_mode` | HTTP 路由 | contextMode 不是 `"workspace"` 或 `"clean"` |
| `invalid_query` | HTTP 路由 | Forget 查询缺失、为空或超过 64 KiB |
| `invalid_client_id` | HTTP 路由 | Client-Id header 不在 bridge 的已知集合中 |
| `managed_memory_unavailable` | Bridge / ACP 子进程 | Workspace 未配置为使用 managed memory |
| `remember_queue_full` | 任务通道 | 达到 16 个待处理任务的上限 |
| `remember_path_escape` | Core remember 逻辑 | Agent 写入到了 managed memory 目录之外的路径 |
| `remember_failed` | 兜底捕获 | 未分类的 agent 失败、超时或内部错误 |
| `remember_task_not_found` | HTTP 路由 | GET 请求了未知或未授权的 task ID |
| `forget_task_not_found` | HTTP 路由 | GET 请求了未知或未授权的 forget task ID |
| `dream_task_not_found` | HTTP 路由 | GET 请求了未知或未授权的 dream task ID |

### 超时链路

```
Agent forked runner:   5 min maxTimeMinutes
Child abort signal:  295 s  (WORKSPACE_MEMORY_REMEMBER_CHILD_TIMEOUT_MS)
Bridge timeout:      300 s  (WORKSPACE_MEMORY_REMEMBER_TIMEOUT_MS)
```

子进程会在 bridge 超时前中止，从而确保传播的是清晰的错误信息，而不是传输层的超时。

---

## 8. SDK 集成

### TypeScript SDK (`@qwen-code/sdk-typescript`)

`DaemonClient` 上的 workspace memory 方法：

```typescript
// 将 remember 任务加入队列
const task = await client.rememberWorkspaceMemory(
  'The project uses pnpm workspaces',
  { contextMode: 'workspace' },
);
// task.taskId, task.status === 'queued'

// 轮询直到任务结束
const result = await client.getWorkspaceMemoryRememberTask(task.taskId);
// result.status === 'completed' | 'failed'

const forget = await client.forgetWorkspaceMemory('old preference');
const forgetResult = await client.getWorkspaceMemoryForgetTask(forget.taskId);

const dream = await client.dreamWorkspaceMemory();
const dreamResult = await client.getWorkspaceMemoryDreamTask(dream.taskId);
```

### UI 事件标准化

SDK 标准化器将原始的 `memory_changed` SSE 事件（`scope: 'managed'`）映射为 `DaemonUiWorkspaceMemoryChangedEvent`：

```typescript
{
  type: 'workspace.memory.changed',
  scope: 'managed',
  source: 'workspace_memory_remember',
  taskId: 'remember-...',
  touchedScopes: ['user', 'project']
}
```

这扩展了现有的 `workspace.memory.changed` 事件类型，该类型此前仅包含用于基于文件的 QWEN.md 写入的 `scope: 'workspace' | 'global'`。

---

## 9. 设计考量

### 为什么采用无 session 设计？

CLI 中的 `/remember` 斜杠命令已经在 session 内运行。但 Settings UI 和通过 SDK 编程调用的客户端不应该仅仅为了持久化一个事实就去创建一个 session。Session 意味着对话历史、轮次跟踪以及在 session 列表中的可见性——这些都不适用于即发即弃（fire-and-forget）的 memory 写入。

### 为什么采用串行执行？

managed memory 系统将事实存储在带有索引的 markdown 文件中。来自多个 remember 任务的并发写入可能会破坏索引或产生合并冲突。单线程队列是最简单且正确的解决方案。

### 为什么使用任务队列（而非同步）？

Memory 写入涉及 LLM agent 决定将事实存储在_哪里_以及_如何_存储（在 user 和 project scope 之间选择、挑选合适的文件、格式化）。这需要 2 到 30 秒。同步 HTTP 请求要么会超时，要么会阻塞客户端。异步队列 + 轮询模式保持了 HTTP 契约的简单性，并允许客户端展示进度 UI。

### 为什么需要 `contextMode`？

- `"workspace"`（默认）—— remember agent 将现有的 memories 作为上下文，从而能够去重或更新现有条目。
- `"clean"` —— agent 看不到先前的 user memory，适用于调用方希望强制进行全新写入而不使用去重逻辑的场景（例如批量导入）。

### 为什么将读取限制在 memory 路径内？

remember agent 应该只在 managed memory 目录内进行读写。这可以防止提示词注入场景，即精心构造的 `content` 诱骗 agent 读取敏感的项目文件并将其泄露到 memory 条目中。