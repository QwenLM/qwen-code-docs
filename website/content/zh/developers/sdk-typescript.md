# TypeScript SDK

## @qwen-code/sdk

一个最小化的实验性 TypeScript SDK，用于以编程方式访问 Qwen Code。

欢迎提交功能请求/问题/PR。

## 安装

```bash
npm install @qwen-code/sdk
```

## 要求

- Node.js >= 22.0.0
- [Qwen Code](https://github.com/QwenLM/qwen-code) >= 0.4.0（稳定版）。SDK 默认使用其捆绑的 CLI；仅当你需要运行自定义 `qwen` 二进制文件或 CLI 打包时，才设置 `pathToQwenExecutable`。

## 快速开始

```typescript
import { query } from '@qwen-code/sdk';

// 单轮查询
const result = query({
  prompt: '当前目录中有哪些文件？',
  options: {
    cwd: '/path/to/project',
  },
});

// 迭代处理消息
for await (const message of result) {
  if (message.type === 'assistant') {
    console.log('Assistant:', message.message.content);
  } else if (message.type === 'result') {
    console.log('Result:', message.result);
  }
}
```

## API 参考

### `query(config)`

创建一个与 Qwen Code 的新查询会话。

#### 参数

- `prompt`: `string | AsyncIterable<SDKUserMessage>` - 要发送的提示词。单轮查询使用字符串，多轮对话使用异步可迭代对象。
- `options`: `QueryOptions` - 查询会话的配置选项。

#### QueryOptions

| 选项                     | 类型                                           | 默认值            | 描述                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| ------------------------ | ---------------------------------------------- | ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `cwd`                    | `string`                                       | `process.cwd()`  | 查询会话的工作目录。决定文件操作和命令执行的上下文。                                                                                                                                                                                                                                                                                                                                                                      |
| `model`                  | `string`                                       | -                | 要使用的 AI 模型（例如 `'qwen-max'`、`'qwen-plus'`、`'qwen-turbo'`）。优先级高于 `OPENAI_MODEL` 和 `QWEN_MODEL` 环境变量。                                                                                                                                                                                                                                                                                               |
| `pathToQwenExecutable`   | `string`                                       | 捆绑 CLI         | Qwen Code 可执行文件的路径。支持多种格式：`'qwen'`（从 PATH 获取的原生二进制文件）、`'/path/to/qwen'`（显式路径）、`'/path/to/cli.js'`（Node.js 打包文件）、`'node:/path/to/cli.js'`（强制使用 Node.js 运行时）、`'bun:/path/to/cli.js'`（强制使用 Bun 运行时）。如果未提供，SDK 使用随包附带的捆绑 CLI。 |
| `permissionMode`         | `'default' \| 'plan' \| 'auto-edit' \| 'auto' \| 'yolo'` | `'default'`      | 控制工具执行审批的权限模式。详见[权限模式](#权限模式)。                                                                                                                                                                                                                                                                                                                                                                      |
| `canUseTool`             | `CanUseTool`                                   | -                | 自定义工具执行审批处理函数。当某个工具需要确认时被调用。必须在 60 秒内响应，否则请求将被自动拒绝。详见[自定义权限处理函数](#自定义权限处理函数)。                                                                                                                                                                                                                                                                              |
| `env`                    | `Record<string, string>`                       | -                | 传递给 Qwen Code 进程的环境变量。会与当前进程的环境变量合并。                                                                                                                                                                                                                                                                                                                                                         |
| `systemPrompt`           | `string \| QuerySystemPromptPreset`            | -                | 主会话的系统提示配置。使用字符串可以完全覆盖内置的 Qwen Code 系统提示，使用预设对象可以保留内置提示并附加额外指令。                                                                                                                                                                                                                                                                                                      |
| `mcpServers`             | `Record<string, McpServerConfig>`              | -                | 要连接的 MCP（模型上下文协议）服务器。支持外部服务器（stdio/SSE/HTTP）和 SDK 内嵌服务器。外部服务器通过传输选项（如 `command`、`args`、`url`、`httpUrl` 等）配置。SDK 服务器使用 `{ type: 'sdk', name: string, instance: Server }`。                                                                                                                                                                                           |
| `abortController`        | `AbortController`                              | -                | 用于取消查询会话的控制器。调用 `abortController.abort()` 可终止会话并清理资源。                                                                                                                                                                                                                                                                                                                                          |
| `debug`                  | `boolean`                                      | `false`          | 开启调试模式，打印 CLI 进程的详细日志。                                                                                                                                                                                                                                                                                                                                                                                   |
| `maxSessionTurns`        | `number`                                       | `-1`（无限制）   | 会话在自动终止前最大对话轮数。一轮包括一条用户消息和一条助手响应。                                                                                                                                                                                                                                                                                                                                                      |
| `coreTools`              | `string[]`                                     | -                | 使用旧版 `coreTools` / CLI `--core-tools` 允许列表语义。如果指定，只有匹配的核心工具会被注册到会话中。这是唯一限制内置工具注册的允许列表风格选项；整工具的 `permissions.deny` / `excludeTools` 规则（以及 settings.json 中的 `tools.disabled`）也会将工具从注册表中移除。settings.json 中的 `permissions.allow` 是纯粹的自动审批，永远不会移除、降级或隐藏工具（#10075）。要将工具的 schema 排除在初始模型请求之外，请在 settings.json 中使用 `tools.eager`（需要重启，#9827）；要完全移除，请使用整工具的 `excludeTools` / `permissions.deny` 规则——带有说明符的规则（如 `'Bash(rm *)'`）仅在运行时拒绝匹配的调用。MCP 工具不受基于 deny 的移除影响：请改用每服务器的 `excludeTools` / `tools.disabled` 过滤器来隐藏它们（deny 仍然会在运行时阻止其调用）。示例：`['read_file', 'edit', 'run_shell_command']`。 |
| `excludeTools`           | `string[]`                                     | -                | 等同于 settings.json 中的 `permissions.deny`。被排除的工具会立即返回权限错误。优先级高于所有其他权限设置。支持工具名称别名和模式匹配：工具名称（`'write_file'`）、shell 命令前缀（`'Bash(rm *)'`）或路径模式（`'Read(.env)'`、`'Edit(/src/**)'`）。                                                                                                                                                                    |
| `allowedTools`           | `string[]`                                     | -                | 等同于 settings.json 中的 `permissions.allow`，用于自动审批。匹配的工具绕过 `canUseTool` 回调自动执行。仅在工具需要确认时生效。与 `permissions.allow` 一样，这是纯粹的自动审批，永远不会影响注册了哪些工具或发送了哪些 schema（#10075）。支持与 `excludeTools` 相同的模式匹配。示例：`['Bash(git status)', 'Bash(npm test)']`。 |
| `authType`               | `'openai' \| 'anthropic' \| 'qwen-oauth' \| 'gemini' \| 'vertex-ai'` | -                | AI 服务的认证类型。提供时，SDK 会将其作为 `--auth-type` 转发给 CLI。                                                                                                                                                                                                                                                                                                                                                      |
| `agents`                 | `SubagentConfig[]`                             | -                | 可在会话期间调用的子代理配置。子代理是用于特定任务或领域的专门 AI 代理。                                                                                                                                                                                                                                                                                                                                                 |
| `includePartialMessages` | `boolean`                                      | `false`          | 当设置为 `true` 时，SDK 会在生成过程中发出未完成的消息，从而实现 AI 响应的实时流式传输。                                                                                                                                                                                                                                                                                                                                   |
| `resume`                 | `string`                                       | -                | 通过会话 ID 恢复之前的会话。相当于 CLI 的 `--resume` 标志。                                                                                                                                                                                                                                                                                                                                                             |
| `sessionId`              | `string`                                       | -                | 为新会话指定会话 ID。确保 SDK 和 CLI 使用相同 ID 而不恢复历史。相当于 CLI 的 `--session-id` 标志。                                                                                                                                                                                                                                                                                                                       |

> [!note]
> 对于 `coreTools`，别名如 `Read`、`Edit` 和 `Bash` 也可以使用，但类似 `Bash(git *)` 的调用说明符会被剥离。`coreTools` 限制的是工具注册，而不是调用模式。

### 超时设置

SDK 强制执行以下默认超时：

| 超时             | 默认值   | 描述                                                                                                                            |
| ---------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `canUseTool`     | 1 分钟  | `canUseTool` 回调的最大响应时间。如果超时，工具请求将被自动拒绝。                                                              |
| `mcpRequest`     | 1 分钟  | SDK MCP 工具调用的最大完成时间。                                                                                               |
| `controlRequest` | 1 分钟  | 控制操作（如 `initialize()`、`setModel()`、`setPermissionMode()`、`getContextUsage()` 和 `interrupt()`）的最大完成时间。       |
| `streamClose`    | 1 分钟  | 在多轮模式下使用 SDK MCP 服务器时，关闭 CLI 标准输入前等待初始化完成的最大时间。                                                |

你可以通过 `timeout` 选项自定义这些超时：

```typescript
import { query } from '@qwen-code/sdk';

const q = query({
  prompt: 'Your prompt',
  options: {
    timeout: {
      canUseTool: 60000, // 权限回调 60 秒
      mcpRequest: 600000, // MCP 工具调用 10 分钟
      controlRequest: 60000, // 控制请求 60 秒
      streamClose: 15000, // 流关闭等待 15 秒
    },
  },
});
```

### 消息类型

SDK 提供了类型守卫来识别不同的消息类型：

```typescript
import {
  isSDKUserMessage,
  isSDKAssistantMessage,
  isSDKSystemMessage,
  isSDKResultMessage,
  isSDKPartialAssistantMessage,
} from '@qwen-code/sdk';

for await (const message of result) {
  if (isSDKAssistantMessage(message)) {
    // 处理助手消息
  } else if (isSDKResultMessage(message)) {
    // 处理结果消息
  }
}
```

### Query 实例方法

`query()` 返回的 `Query` 实例提供了多种方法：

```typescript
const q = query({ prompt: 'Hello', options: {} });

// 获取会话 ID
const sessionId = q.getSessionId();

// 检查是否已关闭
const closed = q.isClosed();

// 中断当前操作
await q.interrupt();

// 在会话中更改权限模式
await q.setPermissionMode('yolo');

// 在会话中更改模型
await q.setModel('qwen-max');

// 获取上下文窗口使用情况细分（各类别的 token 数）
const usage = await q.getContextUsage();
// 传入 true 以提示显示每项细节
const detail = await q.getContextUsage(true);

// 关闭会话
await q.close();
```

`interrupt()` 仅取消当前活跃的轮次。对于通过异步可迭代对象创建的多轮查询，查询及其输入流仍然保持打开，后续来自可迭代对象的消息会被正常处理。当你想结束整个会话时，使用 `close()` 或调用已配置的 `AbortController` 的 `abort()` 方法。

## Daemon 调用方提供的会话 ID

`DaemonClient.createOrAttachSession` 接受一个可选的 `sessionId`，供需要在会话创建前持久化身份的调用方使用：

```typescript
import { DaemonClient } from '@qwen-code/sdk';

const daemon = new DaemonClient({ baseUrl: 'http://127.0.0.1:4170' });
const session = await daemon.createOrAttachSession({
  workspaceCwd: '/path/to/project',
  sessionId: '550E8400-E29B-41D4-A716-446655440000',
});

console.log(session.sessionId); // 550e8400-e29b-41d4-a716-446655440000
```

SDK 在发送变更之前要求 daemon 具备 `session_id_override` 能力。REST 模式直接序列化 `sessionId`；活跃的 ACP 适配器将其映射为 `session/new._meta["qwen-code/sessionId"]`。SDK 会验证成功响应，如果 daemon 返回不同的 ID 则抛出 `DaemonSessionIdProtocolError`。

此选项始终创建新的线程会话，而非幂等附加。如果创建结果不明确，请使用已知 ID 进行加载或恢复。省略此选项则保留现有的创建或附加行为。

## 权限模式

SDK 支持不同的权限模式来控制工具执行：

- **`default`**：写工具被拒绝，除非通过 `canUseTool` 回调或 `allowedTools` 批准。只读工具无需确认即可执行。
- **`plan`**：阻止所有写工具，指示 AI 先提出计划。
- **`auto-edit`**：自动批准编辑工具（`edit`、`write_file`、`notebook_edit`），其他工具需要确认。
- **`auto`**：使用内置分类器自动批准安全的工具调用并阻止高风险调用，在多次策略阻止或分类器不可用后回退到手动审批。
- **`yolo`**：所有工具自动执行，无需确认。

### 权限优先级链

决策优先级（高到低）：`deny` > `ask` > `allow` > _（默认/交互模式）_

第一个匹配的规则胜出。

1. `excludeTools` / `permissions.deny` - 完全阻止工具（返回权限错误）
2. `permissions.ask` - 始终需要用户确认
3. `permissionMode: 'plan'` - 阻止所有非只读工具
4. `permissionMode: 'yolo'` - 自动批准所有工具
5. `allowedTools` / `permissions.allow` - 自动批准匹配的工具
6. `permissionMode: 'auto'` - 对剩余工具进行分类器中介的审批
7. `canUseTool` 回调 - 自定义批准逻辑（如果提供，已允许的工具不会调用此回调）
8. 默认行为 - SDK 模式下自动拒绝（写工具需要显式批准）

## 示例

### 多轮对话

```typescript
import { query, type SDKUserMessage } from '@qwen-code/sdk';

async function* generateMessages(): AsyncIterable<SDKUserMessage> {
  yield {
    type: 'user',
    session_id: 'my-session',
    message: { role: 'user', content: '创建一个 hello.txt 文件' },
    parent_tool_use_id: null,
  };

  // 等待某个条件或用户输入
  yield {
    type: 'user',
    session_id: 'my-session',
    message: { role: 'user', content: '现在读取该文件的内容' },
    parent_tool_use_id: null,
  };
}

const result = query({
  prompt: generateMessages(),
  options: {
    permissionMode: 'auto-edit',
  },
});

for await (const message of result) {
  console.log(message);
}
```

### 自定义权限处理函数

```typescript
import { query, type CanUseTool } from '@qwen-code/sdk';

const canUseTool: CanUseTool = async (toolName, input, { signal }) => {
  // 允许所有读取操作
  if (toolName.startsWith('read_')) {
    return { behavior: 'allow', updatedInput: input };
  }

  // 提示用户确认写操作（在实际应用中）
  const userApproved = await promptUser(`允许 ${toolName} 吗？`);

  if (userApproved) {
    return { behavior: 'allow', updatedInput: input };
  }

  return { behavior: 'deny', message: '用户拒绝了该操作' };
};

const result = query({
  prompt: '创建新文件',
  options: {
    canUseTool,
  },
});
```

### 使用外部 MCP 服务器

```typescript
import { query } from '@qwen-code/sdk';

const result = query({
  prompt: '使用我的 MCP 服务器中的自定义工具',
  options: {
    mcpServers: {
      'my-server': {
        command: 'node',
        args: ['path/to/mcp-server.js'],
        env: { PORT: '3000' },
      },
    },
  },
});
```

### 覆盖系统提示词

```typescript
import { query } from '@qwen-code/sdk';

const result = query({
  prompt: '用一句话问好。',
  options: {
    systemPrompt: '你是一个简洁的助手。请用一句话回答。',
  },
});
```

### 追加到内置系统提示词

```typescript
import { query } from '@qwen-code/sdk';

const result = query({
  prompt: '审查当前目录。',
  options: {
    systemPrompt: {
      type: 'preset',
      preset: 'qwen_code',
      append: '保持简洁，专注于具体发现。',
    },
  },
});
```
### 使用 SDK 嵌入式 MCP 服务器

SDK 提供了 `tool` 和 `createSdkMcpServer` 来创建与 SDK 应用程序运行在同一进程中的 MCP 服务器。当你想向 AI 暴露自定义工具而无需运行单独的服务器进程时，这非常有用。

#### `tool(name, description, inputSchema, handler)`

创建一个带有 Zod 模式类型推断的工具定义。

| 参数          | 类型                               | 描述                                                         |
| ------------- | ---------------------------------- | ------------------------------------------------------------ |
| `name`        | `string`                           | 工具名称（1-64 个字符，以字母开头，支持字母数字和下划线）    |
| `description` | `string`                           | 对工具功能的人类可读描述                                      |
| `inputSchema` | `ZodRawShape`                      | 定义工具输入参数的 Zod 模式对象                               |
| `handler`     | `(args, extra) => Promise<Result>` | 异步函数，执行工具并返回 MCP 内容块                           |

处理程序必须返回一个 `CallToolResult` 对象，结构如下：

```typescript
{
  content: Array<
    | { type: 'text'; text: string }
    | { type: 'image'; data: string; mimeType: string }
    | { type: 'resource'; uri: string; mimeType?: string; text?: string }
  >;
  isError?: boolean;
}
```

#### `createSdkMcpServer(options)`

创建一个 SDK 嵌入式的 MCP 服务器实例。

| 选项      | 类型                     | 默认值     | 描述                          |
| --------- | ------------------------ | ---------- | ----------------------------- |
| `name`    | `string`                 | 必须       | MCP 服务器的唯一名称          |
| `version` | `string`                 | `'1.0.0'`  | 服务器版本                    |
| `tools`   | `SdkMcpToolDefinition[]` | -          | 通过 `tool()` 创建的工具数组   |

返回一个 `McpSdkServerConfigWithInstance` 对象，可直接传递给 `mcpServers` 选项。

#### 示例

```typescript
import { z } from 'zod';
import { query, tool, createSdkMcpServer } from '@qwen-code/sdk';

// 使用 Zod 模式定义工具
const calculatorTool = tool(
  'calculate_sum',
  '将两个数字相加',
  { a: z.number(), b: z.number() },
  async (args) => ({
    content: [{ type: 'text', text: String(args.a + args.b) }],
  }),
);

// 创建 MCP 服务器
const server = createSdkMcpServer({
  name: 'calculator',
  tools: [calculatorTool],
});

// 在查询中使用该服务器
const result = query({
  prompt: '42 + 17 等于多少？',
  options: {
    permissionMode: 'yolo',
    mcpServers: {
      calculator: server,
    },
  },
});

for await (const message of result) {
  console.log(message);
}
```

### 中止查询

```typescript
import { query, isAbortError } from '@qwen-code/sdk';

const abortController = new AbortController();

const result = query({
  prompt: '长时间运行的任务...',
  options: {
    abortController,
  },
});

// 5 秒后中止
setTimeout(() => abortController.abort(), 5000);

try {
  for await (const message of result) {
    console.log(message);
  }
} catch (error) {
  if (isAbortError(error)) {
    console.log('查询已被中止');
  } else {
    throw error;
  }
}
```

## 错误处理

SDK 提供了 `AbortError` 类来处理中止的查询：

```typescript
import { AbortError, isAbortError } from '@qwen-code/sdk';

try {
  // ... 查询操作
} catch (error) {
  if (isAbortError(error)) {
    // 处理中止情况
  } else {
    // 处理其他错误
  }
}
```
