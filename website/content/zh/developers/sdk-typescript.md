---
description: "使用 Qwen Code TypeScript SDK 构建 AI 编程集成，掌握安装、认证、类型接口和调用示例，适合 Web、Node.js 与工具链开发。"
---

# TypeScript SDK

## @qwen-code/sdk

一个极简的实验性 TypeScript SDK，用于以编程方式访问 Qwen Code。

欢迎提交功能请求、Issue 或 PR。

## 安装

```bash
npm install @qwen-code/sdk
```

## 环境要求

- Node.js >= 20.0.0
- [Qwen Code](https://github.com/QwenLM/qwen-code) >= 0.4.0（稳定版）已安装且可在 PATH 中访问

> **nvm 用户注意**：如果你使用 nvm 管理 Node.js 版本，SDK 可能无法自动检测到 Qwen Code 可执行文件。你需要显式设置 `pathToQwenExecutable` 选项为 `qwen` 二进制的完整路径。

## 快速开始

```typescript
import { query } from '@qwen-code/sdk';

// Single-turn query
const result = query({
  prompt: 'What files are in the current directory?',
  options: {
    cwd: '/path/to/project',
  },
});

// Iterate over messages
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

创建一个新的 Qwen Code 查询会话。

#### 参数

- `prompt`: `string | AsyncIterable<SDKUserMessage>` - 要发送的提示词。单轮查询使用字符串，多轮对话使用异步可迭代对象。
- `options`: `QueryOptions` - 查询会话的配置选项。

#### QueryOptions

| Option                   | Type                                           | Default          | Description                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| ------------------------ | ---------------------------------------------- | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `cwd`                    | `string`                                       | `process.cwd()`  | 查询会话的工作目录。决定文件操作和命令执行的上下文。                                                                                                                                                                                                                                                                                                                                                               |
| `model`                  | `string`                                       | -                | 要使用的 AI 模型（例如 `'qwen-max'`、`'qwen-plus'`、`'qwen-turbo'`）。优先级高于 `OPENAI_MODEL` 和 `QWEN_MODEL` 环境变量。                                                                                                                                                                                                                                                                                                                                 |
| `pathToQwenExecutable`   | `string`                                       | 自动检测    | Qwen Code 可执行文件的路径。支持多种格式：`'qwen'`（PATH 中的原生二进制文件）、`'/path/to/qwen'`（显式路径）、`'/path/to/cli.js'`（Node.js 打包文件）、`'node:/path/to/cli.js'`（强制 Node.js 运行时）、`'bun:/path/to/cli.js'`（强制 Bun 运行时）。如果未提供，将按以下顺序自动检测：`QWEN_CODE_CLI_PATH` 环境变量、`~/.volta/bin/qwen`、`~/.npm-global/bin/qwen`、`/usr/local/bin/qwen`、`~/.local/bin/qwen`、`~/node_modules/.bin/qwen`、`~/.yarn/bin/qwen`。 |
| `permissionMode`         | `'default' \| 'plan' \| 'auto-edit' \| 'yolo'` | `'default'`      | 控制工具执行审批的权限模式。详见 [权限模式](#permission-modes)。                                                                                                                                                                                                                                                                                                                                                                           |
| `canUseTool`             | `CanUseTool`                                   | -                | 用于工具执行审批的自定义权限处理器。当工具需要确认时调用。必须在 60 秒内响应，否则请求将被自动拒绝。详见 [自定义权限处理器](#custom-permission-handler)。                                                                                                                                                                                                                                                     |
| `env`                    | `Record<string, string>`                       | -                | 传递给 Qwen Code 进程的环境变量。将与当前进程的环境变量合并。                                                                                                                                                                                                                                                                                                                                                                                  |
| `systemPrompt`           | `string \| QuerySystemPromptPreset`            | -                | 主会话的系统提示词配置。使用字符串可完全覆盖内置的 Qwen Code 系统提示词，或使用预设对象以保留内置提示词并追加额外指令。                                                                                                                                                                                                                                                                                  |
| `mcpServers`             | `Record<string, McpServerConfig>`              | -                | 要连接的 MCP（Model Context Protocol）服务器。支持外部服务器（stdio/SSE/HTTP）和 SDK 内置服务器。外部服务器通过 `command`、`args`、`url`、`httpUrl` 等传输选项进行配置。SDK 服务器使用 `{ type: 'sdk', name: string, instance: Server }`。                                                                                                                                                                                        |
| `abortController`        | `AbortController`                              | -                | 用于取消查询会话的控制器。调用 `abortController.abort()` 可终止会话并清理资源。                                                                                                                                                                                                                                                                                                                                                                |
| `debug`                  | `boolean`                                      | `false`          | 启用调试模式，输出 CLI 进程的详细日志。                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `maxSessionTurns`        | `number`                                       | `-1`（无限制） | 会话自动终止前的最大对话轮数。一轮包含一条用户消息和一条助手响应。                                                                                                                                                                                                                                                                                                                                        |
| `coreTools`              | `string[]`                                     | -                | 等同于 settings.json 中的 `tool.core`。如果指定，AI 将仅可使用这些工具。示例：`['read_file', 'write_file', 'run_terminal_cmd']`。                                                                                                                                                                                                                                                                                                                   |
| `excludeTools`           | `string[]`                                     | -                | 等同于 settings.json 中的 `tool.exclude`。被排除的工具将立即返回权限错误。优先级高于所有其他权限设置。支持模式匹配：工具名称（`'write_file'`）、工具类（`'ShellTool'`）或 Shell 命令前缀（`'ShellTool(rm )'`）。                                                                                                                                                                                      |
| `allowedTools`           | `string[]`                                     | -                | 等同于 settings.json 中的 `tool.allowed`。匹配的工具将绕过 `canUseTool` 回调并自动执行。仅在工具需要确认时生效。支持与 `excludeTools` 相同的模式匹配。                                                                                                                                                                                                                                                                 |
| `authType`               | `'openai' \| 'qwen-oauth'`                     | `'openai'`       | AI 服务的认证类型。不建议在 SDK 中使用 `'qwen-oauth'`，因为凭据存储在 `~/.qwen` 中且可能需要定期刷新。                                                                                                                                                                                                                                                                                                                          |
| `agents`                 | `SubagentConfig[]`                             | -                | 可在会话期间调用的子代理（subagent）配置。子代理是用于特定任务或领域的专用 AI 代理。                                                                                                                                                                                                                                                                                                                                                |
| `includePartialMessages` | `boolean`                                      | `false`          | 当为 `true` 时，SDK 会在 AI 生成响应时实时发出不完整的消息，支持流式输出。                                                                                                                                                                                                                                                                                                                                                        |

### 超时设置

SDK 强制执行以下默认超时设置：

| Timeout          | Default  | Description                                                                                                                                       |
| ---------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `canUseTool`     | 1 分钟 | `canUseTool` 回调响应的最大时间。如果超时，工具请求将被自动拒绝。                                                  |
| `mcpRequest`     | 1 分钟 | SDK MCP 工具调用完成的最大时间。                                                                                                  |
| `controlRequest` | 1 分钟 | 控制操作（如 `initialize()`、`setModel()`、`setPermissionMode()`、`getContextUsage()` 和 `interrupt()`）完成的最大时间。 |
| `streamClose`    | 1 分钟 | 在带有 SDK MCP 服务器的多轮模式下，关闭 CLI stdin 前等待初始化完成的最大时间。                             |

你可以通过 `timeout` 选项自定义这些超时时间：

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

SDK 提供了类型守卫（type guards）用于识别不同的消息类型：

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

`query()` 返回的 `Query` 实例提供了以下方法：

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

SDK 支持不同的权限模式以控制工具执行：

- **`default`**：除非通过 `canUseTool` 回调批准或在 `allowedTools` 中配置，否则写入工具将被拒绝。只读工具无需确认即可执行。
- **`plan`**：阻止所有写入工具，指示 AI 先提供计划。
- **`auto-edit`**：自动批准编辑工具（edit、write_file），其他工具需要确认。
- **`yolo`**：所有工具自动执行，无需确认。

### 权限优先级链

1. `excludeTools` - 完全阻止工具
2. `permissionMode: 'plan'` - 阻止非只读工具
3. `permissionMode: 'yolo'` - 自动批准所有工具
4. `allowedTools` - 自动批准匹配的工具
5. `canUseTool` 回调 - 自定义审批逻辑
6. 默认行为 - SDK 模式下自动拒绝

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

### 使用 SDK 内置的 MCP 服务器

SDK 提供了 `tool` 和 `createSdkMcpServer`，用于创建与你的 SDK 应用运行在同一进程中的 MCP 服务器。当你希望向 AI 暴露自定义工具而无需运行单独的服务器进程时，这非常有用。

#### `tool(name, description, inputSchema, handler)`

创建带有 Zod 模式类型推断的工具定义。

| Parameter     | Type                               | Description                                                              |
| ------------- | ---------------------------------- | ------------------------------------------------------------------------ |
| `name`        | `string`                           | 工具名称（1-64 个字符，以字母开头，仅包含字母数字和下划线） |
| `description` | `string`                           | 工具功能的人类可读描述                         |
| `inputSchema` | `ZodRawShape`                      | 定义工具输入参数的 Zod 模式对象                   |
| `handler`     | `(args, extra) => Promise<Result>` | 执行工具并返回 MCP 内容块的异步函数     |

处理器必须返回具有以下结构的 `CallToolResult` 对象：

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

创建一个 SDK 内置的 MCP 服务器实例。

| Option    | Type                     | Default   | Description                          |
| --------- | ------------------------ | --------- | ------------------------------------ |
| `name`    | `string`                 | 必需  | MCP 服务器的唯一名称       |
| `version` | `string`                 | `'1.0.0'` | 服务器版本                       |
| `tools`   | `SdkMcpToolDefinition[]` | -         | 通过 `tool()` 创建的工具数组 |

返回一个 `McpSdkServerConfigWithInstance` 对象，可直接传递给 `mcpServers` 选项。

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

SDK 提供了 `AbortError` 类用于处理被中止的查询：

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