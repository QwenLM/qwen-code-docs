# Typescript SDK

## @qwen-code/sdk

一个用于以编程方式访问 Qwen Code 的最小化实验性 TypeScript SDK。

欢迎提交功能请求/issue/PR。

## 安装

```bash
npm install @qwen-code/sdk
```

## 环境要求

- Node.js >= 22.0.0
- [Qwen Code](https://github.com/QwenLM/qwen-code) >= 0.4.0（稳定版）已安装并在 PATH 中可访问

> **nvm 用户注意**：如果你使用 nvm 管理 Node.js 版本，SDK 可能无法自动检测到 Qwen Code 可执行文件。你应该通过 `pathToQwenExecutable` 选项显式指定 `qwen` 二进制文件的完整路径。

## 快速开始

```typescript
import { query } from '@qwen-code/sdk';

// 单轮查询
const result = query({
  prompt: 'What files are in the current directory?',
  options: {
    cwd: '/path/to/project',
  },
});

// 遍历消息
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

| 选项                     | 类型                                           | 默认值           | 描述                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| ------------------------ | ---------------------------------------------- | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `cwd`                    | `string`                                       | `process.cwd()`  | 查询会话的工作目录，决定文件操作和命令的执行上下文。                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `model`                  | `string`                                       | -                | 使用的 AI 模型（如 `'qwen-max'`、`'qwen-plus'`、`'qwen-turbo'`），优先级高于 `OPENAI_MODEL` 和 `QWEN_MODEL` 环境变量。                                                                                                                                                                                                                                                                                                                                                                |
| `pathToQwenExecutable`   | `string`                                       | 自动检测         | Qwen Code 可执行文件路径，支持多种格式：`'qwen'`（PATH 中的原生二进制）、`'/path/to/qwen'`（显式路径）、`'/path/to/cli.js'`（Node.js 包）、`'node:/path/to/cli.js'`（强制使用 Node.js 运行时）、`'bun:/path/to/cli.js'`（强制使用 Bun 运行时）。未提供时按以下顺序自动检测：`QWEN_CODE_CLI_PATH` 环境变量、`~/.volta/bin/qwen`、`~/.npm-global/bin/qwen`、`/usr/local/bin/qwen`、`~/.local/bin/qwen`、`~/node_modules/.bin/qwen`、`~/.yarn/bin/qwen`。 |
| `permissionMode`         | `'default' \| 'plan' \| 'auto-edit' \| 'yolo'` | `'default'`      | 控制工具执行审批的权限模式，详见[权限模式](#permission-modes)。                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `canUseTool`             | `CanUseTool`                                   | -                | 用于工具执行审批的自定义权限处理器，在工具需要确认时调用。必须在 60 秒内响应，否则请求将被自动拒绝。详见[自定义权限处理器](#custom-permission-handler)。                                                                                                                                                                                                                                                                                                                              |
| `env`                    | `Record<string, string>`                       | -                | 传递给 Qwen Code 进程的环境变量，与当前进程环境合并。                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `systemPrompt`           | `string \| QuerySystemPromptPreset`            | -                | 主会话的系统提示词配置。使用字符串可完全覆盖 Qwen Code 内置系统提示词，使用预设对象可保留内置提示词并追加额外指令。                                                                                                                                                                                                                                                                                                                                                                  |
| `mcpServers`             | `Record<string, McpServerConfig>`              | -                | 要连接的 MCP（Model Context Protocol）服务器，支持外部服务器（stdio/SSE/HTTP）和 SDK 内嵌服务器。外部服务器通过 `command`、`args`、`url`、`httpUrl` 等传输选项配置，SDK 服务器使用 `{ type: 'sdk', name: string, instance: Server }`。                                                                                                                                                                                                                                                |
| `abortController`        | `AbortController`                              | -                | 用于取消查询会话的控制器，调用 `abortController.abort()` 可终止会话并清理资源。                                                                                                                                                                                                                                                                                                                                                                                                       |
| `debug`                  | `boolean`                                      | `false`          | 开启调试模式，输出 CLI 进程的详细日志。                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `maxSessionTurns`        | `number`                                       | `-1`（无限制）   | 会话自动终止前的最大对话轮数，每轮由一条用户消息和一条助手回复组成。                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `coreTools`              | `string[]`                                     | -                | 使用旧版 `coreTools` / CLI `--core-tools` 白名单语义。如果指定，只有匹配的核心工具才会在会话中注册。这与 `permissions.allow` 不同，后者会自动批准匹配的工具调用但不限制工具注册。示例：`['read_file', 'edit', 'run_shell_command']`。                                                                                                                                                                                                                                                |
| `excludeTools`           | `string[]`                                     | -                | 等同于 settings.json 中的 `permissions.deny`。被排除的工具会立即返回权限错误，优先级高于所有其他权限设置。支持工具名称别名和模式匹配：工具名（`'write_file'`）、shell 命令前缀（`'Bash(rm *)'`）或路径模式（`'Read(.env)'`、`'Edit(/src/**)'`）。                                                                                                                                                                                                                                    |
| `allowedTools`           | `string[]`                                     | -                | 等同于 settings.json 中的 `permissions.allow`。匹配的工具绕过 `canUseTool` 回调自动执行，仅适用于需要确认的工具。支持与 `excludeTools` 相同的模式匹配。示例：`['Bash(git status)', 'Bash(npm test)']`。                                                                                                                                                                                                                                                                              |
| `authType`               | `'openai' \| 'qwen-oauth'`                     | `'openai'`       | AI 服务的认证类型。Qwen OAuth 免费层已于 2026-04-15 停止服务，新的 SDK 集成应使用 OpenAI 兼容认证或其他受支持的提供商。                                                                                                                                                                                                                                                                                                                                                               |
| `agents`                 | `SubagentConfig[]`                             | -                | 会话期间可调用的子 agent 配置，子 agent 是针对特定任务或领域的专用 AI agent。                                                                                                                                                                                                                                                                                                                                                                                                         |
| `includePartialMessages` | `boolean`                                      | `false`          | 为 `true` 时，SDK 在消息生成过程中发出不完整消息，实现 AI 回复的实时流式传输。                                                                                                                                                                                                                                                                                                                                                                                                        |
| `resume`                 | `string`                                       | -                | 通过提供会话 ID 恢复之前的会话，等同于 CLI 的 `--resume` 标志。                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `sessionId`              | `string`                                       | -                | 为新会话指定会话 ID，确保 SDK 和 CLI 使用相同的 ID 而不恢复历史记录，等同于 CLI 的 `--session-id` 标志。                                                                                                                                                                                                                                                                                                                                                                              |

> [!note]
> 对于 `coreTools`，`Read`、`Edit`、`Bash` 等别名同样有效，但 `Bash(git *)` 等调用指定符会被忽略。`coreTools` 限制的是工具注册，而非调用模式。

### 超时配置

SDK 默认执行以下超时限制：

| 超时项           | 默认值  | 描述                                                                                                                                              |
| ---------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `canUseTool`     | 1 分钟  | `canUseTool` 回调的最大响应时间，超时后工具请求将被自动拒绝。                                                                                     |
| `mcpRequest`     | 1 分钟  | SDK MCP 工具调用的最大完成时间。                                                                                                                   |
| `controlRequest` | 1 分钟  | 控制操作（如 `initialize()`、`setModel()`、`setPermissionMode()`、`getContextUsage()` 和 `interrupt()`）的最大完成时间。                           |
| `streamClose`    | 1 分钟  | 在多轮模式下使用 SDK MCP 服务器时，等待初始化完成后关闭 CLI stdin 的最大时间。                                                                    |

可通过 `timeout` 选项自定义这些超时值：

```typescript
const query = qwen.query('Your prompt', {
  timeout: {
    canUseTool: 60000, // 60 seconds for permission callback
    mcpRequest: 600000, // 10 minutes for MCP tool calls
    controlRequest: 60000, // 60 seconds for control requests
    streamClose: 15000, // 15 seconds for stream close wait
  },
});
```

### 消息类型

SDK 提供类型守卫来识别不同的消息类型：

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
    // Handle assistant message
  } else if (isSDKResultMessage(message)) {
    // Handle result message
  }
}
```

### Query 实例方法

`query()` 返回的 `Query` 实例提供以下方法：

```typescript
const q = query({ prompt: 'Hello', options: {} });

// Get session ID
const sessionId = q.getSessionId();

// Check if closed
const closed = q.isClosed();

// Interrupt the current operation
await q.interrupt();

// Change permission mode mid-session
await q.setPermissionMode('yolo');

// Change model mid-session
await q.setModel('qwen-max');

// Get context window usage breakdown (token counts per category)
const usage = await q.getContextUsage();
// Pass true to hint that per-item details should be displayed
const detail = await q.getContextUsage(true);

// Close the session
await q.close();
```

## 权限模式

SDK 支持不同的权限模式来控制工具执行：

- **`default`**：写入工具默认拒绝，除非通过 `canUseTool` 回调或 `allowedTools` 批准；只读工具无需确认即可执行。
- **`plan`**：阻止所有写入工具，要求 AI 先呈现执行计划。
- **`auto-edit`**：自动批准编辑工具（`edit`、`write_file`、`notebook_edit`），其他工具仍需确认。
- **`yolo`**：所有工具自动执行，无需确认。

### 权限优先级链

决策优先级（从高到低）：`deny` > `ask` > `allow` > _（默认/交互模式）_

第一条匹配规则生效。

1. `excludeTools` / `permissions.deny` - 完全阻止工具（返回权限错误）
2. `permissions.ask` - 始终需要用户确认
3. `permissionMode: 'plan'` - 阻止所有非只读工具
4. `permissionMode: 'yolo'` - 自动批准所有工具
5. `allowedTools` / `permissions.allow` - 自动批准匹配的工具
6. `canUseTool` 回调 - 自定义审批逻辑（如果提供，已批准的工具不会触发此回调）
7. 默认行为 - SDK 模式下自动拒绝（写入工具需要显式批准）

## 示例

### 多轮对话

```typescript
import { query, type SDKUserMessage } from '@qwen-code/sdk';

async function* generateMessages(): AsyncIterable<SDKUserMessage> {
  yield {
    type: 'user',
    session_id: 'my-session',
    message: { role: 'user', content: 'Create a hello.txt file' },
    parent_tool_use_id: null,
  };

  // Wait for some condition or user input
  yield {
    type: 'user',
    session_id: 'my-session',
    message: { role: 'user', content: 'Now read the file back' },
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

### 自定义权限处理器

```typescript
import { query, type CanUseTool } from '@qwen-code/sdk';

const canUseTool: CanUseTool = async (toolName, input, { signal }) => {
  // Allow all read operations
  if (toolName.startsWith('read_')) {
    return { behavior: 'allow', updatedInput: input };
  }

  // Prompt user for write operations (in a real app)
  const userApproved = await promptUser(`Allow ${toolName}?`);

  if (userApproved) {
    return { behavior: 'allow', updatedInput: input };
  }

  return { behavior: 'deny', message: 'User denied the operation' };
};

const result = query({
  prompt: 'Create a new file',
  options: {
    canUseTool,
  },
});
```

### 使用外部 MCP 服务器

```typescript
import { query } from '@qwen-code/sdk';

const result = query({
  prompt: 'Use the custom tool from my MCP server',
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
  prompt: 'Say hello in one sentence.',
  options: {
    systemPrompt: 'You are a terse assistant. Answer in exactly one sentence.',
  },
});
```

### 追加到内置系统提示词

```typescript
import { query } from '@qwen-code/sdk';

const result = query({
  prompt: 'Review the current directory.',
  options: {
    systemPrompt: {
      type: 'preset',
      preset: 'qwen_code',
      append: 'Be terse and focus on concrete findings.',
    },
  },
});
```

### 使用 SDK 内嵌 MCP 服务器

SDK 提供 `tool` 和 `createSdkMcpServer` 来创建与 SDK 应用在同一进程中运行的 MCP 服务器。当你想向 AI 暴露自定义工具而不想运行独立的服务器进程时，这非常有用。

#### `tool(name, description, inputSchema, handler)`

使用 Zod schema 类型推断创建工具定义。

| 参数          | 类型                               | 描述                                                                     |
| ------------- | ---------------------------------- | ------------------------------------------------------------------------ |
| `name`        | `string`                           | 工具名称（1-64 个字符，以字母开头，仅含字母数字和下划线）                |
| `description` | `string`                           | 工具功能的可读描述                                                       |
| `inputSchema` | `ZodRawShape`                      | 定义工具输入参数的 Zod schema 对象                                       |
| `handler`     | `(args, extra) => Promise<Result>` | 执行工具并返回 MCP 内容块的异步函数                                      |

handler 必须返回具有以下结构的 `CallToolResult` 对象：

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

创建 SDK 内嵌 MCP 服务器实例。

| 选项      | 类型                     | 默认值    | 描述                                 |
| --------- | ------------------------ | --------- | ------------------------------------ |
| `name`    | `string`                 | 必填      | MCP 服务器的唯一名称                 |
| `version` | `string`                 | `'1.0.0'` | 服务器版本                           |
| `tools`   | `SdkMcpToolDefinition[]` | -         | 使用 `tool()` 创建的工具数组         |

返回可直接传入 `mcpServers` 选项的 `McpSdkServerConfigWithInstance` 对象。

#### 示例

```typescript
import { z } from 'zod';
import { query, tool, createSdkMcpServer } from '@qwen-code/sdk';

// Define a tool with Zod schema
const calculatorTool = tool(
  'calculate_sum',
  'Add two numbers',
  { a: z.number(), b: z.number() },
  async (args) => ({
    content: [{ type: 'text', text: String(args.a + args.b) }],
  }),
);

// Create the MCP server
const server = createSdkMcpServer({
  name: 'calculator',
  tools: [calculatorTool],
});

// Use the server in a query
const result = query({
  prompt: 'What is 42 + 17?',
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
  prompt: 'Long running task...',
  options: {
    abortController,
  },
});

// Abort after 5 seconds
setTimeout(() => abortController.abort(), 5000);

try {
  for await (const message of result) {
    console.log(message);
  }
} catch (error) {
  if (isAbortError(error)) {
    console.log('Query was aborted');
  } else {
    throw error;
  }
}
```

## 错误处理

SDK 提供 `AbortError` 类用于处理中止的查询：

```typescript
import { AbortError, isAbortError } from '@qwen-code/sdk';

try {
  // ... query operations
} catch (error) {
  if (isAbortError(error)) {
    // Handle abort
  } else {
    // Handle other errors
  }
}
```
