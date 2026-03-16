# TypeScript SDK

## @qwen-code/sdk

一个最小化的实验性 TypeScript SDK，用于以编程方式访问 Qwen Code。

欢迎提交功能请求、问题或 PR。

## 安装

```bash
npm install @qwen-code/sdk
```

## 系统要求

- Node.js >= 20.0.0
- 已安装并可从 PATH 访问 [Qwen Code](https://github.com/QwenLM/qwen-code) >= 0.4.0（稳定版）

> **nvm 用户注意**：如果你使用 nvm 管理 Node.js 版本，SDK 可能无法自动检测到 Qwen Code 可执行文件。此时应显式设置 `pathToQwenExecutable` 选项为 `qwen` 二进制文件的完整路径。

## 快速开始

```typescript
import { query } from '@qwen-code/sdk';

// 单轮查询
const result = query({
  prompt: '当前目录下有哪些文件？',
  options: {
    cwd: '/path/to/project',
  },
});

// 遍历消息流
for await (const message of result) {
  if (message.type === 'assistant') {
    console.log('助手:', message.message.content);
  } else if (message.type === 'result') {
    console.log('结果:', message.result);
  }
}
```

## API 参考

### `query(config)`

创建一个与 Qwen Code 的新查询会话。

#### 参数

- `prompt`: `string | AsyncIterable<SDKUserMessage>` —— 要发送的提示词。单轮查询使用字符串；多轮对话则使用异步可迭代对象。
- `options`: `QueryOptions` —— 查询会话的配置选项。

#### QueryOptions

| 选项                   | 类型                                           | 默认值           | 描述                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| ---------------------- | ---------------------------------------------- | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `cwd`                  | `string`                                       | `process.cwd()`  | 查询会话的工作目录。决定文件操作和命令执行的上下文环境。                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `model`                | `string`                                       | —                | 要使用的 AI 模型（例如 `'qwen-max'`、`'qwen-plus'`、`'qwen-turbo'`）。优先级高于 `OPENAI_MODEL` 和 `QWEN_MODEL` 环境变量。                                                                                                                                                                                                                                                                                                                                                     |
| `pathToQwenExecutable` | `string`                                       | 自动检测         | Qwen Code 可执行文件的路径。支持多种格式：`'qwen'`（从 PATH 查找原生二进制文件）、`'/path/to/qwen'`（显式路径）、`'/path/to/cli.js'`（Node.js 打包文件）、`'node:/path/to/cli.js'`（强制使用 Node.js 运行时）、`'bun:/path/to/cli.js'`（强制使用 Bun 运行时）。若未提供，则按以下顺序自动检测：`QWEN_CODE_CLI_PATH` 环境变量、`~/.volta/bin/qwen`、`~/.npm-global/bin/qwen`、`/usr/local/bin/qwen`、`~/.local/bin/qwen`、`~/node_modules/.bin/qwen`、`~/.yarn/bin/qwen`。 |
| `permissionMode`       | `'default' \| 'plan' \| 'auto-edit' \| 'yolo'` | `'default'`      | 控制工具执行权限的模式。详见 [权限模式](#permission-modes)。                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `canUseTool`           | `CanUseTool`                                   | —                | 自定义工具执行权限处理器。当工具需要用户确认时被调用。必须在 60 秒内响应，否则请求将被自动拒绝。详见 [自定义权限处理器](#custom-permission-handler)。                                                                                                                                                                                                                                                                                                                      |
| `env`                  | `Record<string, string>`                       | —                | 传递给 Qwen Code 进程的环境变量。与当前进程环境变量合并。                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `mcpServers`           | `Record<string, McpServerConfig>`              | —                | 要连接的 MCP（Model Context Protocol）服务器。支持外部服务器（stdio/SSE/HTTP）和 SDK 内嵌服务器。外部服务器通过 `command`、`args`、`url`、`httpUrl` 等传输选项配置；SDK 服务器使用 `{ type: 'sdk', name: string, instance: Server }` 格式。                                                                                                                                                                                                                              |
| `abortController`      | `AbortController`                              | —                | 用于取消查询会话的控制器。调用 `abortController.abort()` 即可终止会话并清理资源。                                                                                                                                                                                                                                                                                                                                                                                              |
| `debug`                | `boolean`                                      | `false`          | 启用调试模式，使 CLI 进程输出详细日志。                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `maxSessionTurns`      | `number`                                       | `-1`（无限制）   | 会话自动终止前允许的最大对话轮数。一轮包含一条用户消息和一条助手响应。                                                                                                                                                                                                                                                                                                                                                                                                         |
| `coreTools`            | `string[]`                                     | —                | 等效于 `settings.json` 中的 `tool.core`。若指定，则仅这些工具对 AI 可用。示例：`['read_file', 'write_file', 'run_terminal_cmd']`。                                                                                                                                                                                                                                                                                                                                            |
| `excludeTools`         | `string[]`                                     | —                | 等效于 `settings.json` 中的 `tool.exclude`。被排除的工具将立即返回权限错误。该设置拥有最高优先级，覆盖所有其他权限配置。支持模式匹配：工具名（如 `'write_file'`）、工具类（如 `'ShellTool'`）、或 Shell 命令前缀（如 `'ShellTool(rm )'`）。                                                                                                                                                                                                                                          |
| `allowedTools`         | `string[]`                                     | —                | 等效于 `settings.json` 中的 `tool.allowed`。匹配的工具将绕过 `canUseTool` 回调，直接自动执行。仅对需要确认的工具生效。支持与 `excludeTools` 相同的模式匹配方式。                                                                                                                                                                                                                                                                                                            |
| `authType`             | `'openai' \| 'qwen-oauth'`                     | `'openai'`       | AI 服务的身份验证类型。在 SDK 中使用 `'qwen-oauth'` 不推荐，因为凭据存储在 `~/.qwen` 中，可能需要定期刷新。                                                                                                                                                                                                                                                                                                                                                                    |
| `agents`               | `SubagentConfig[]`                             | —                | 会话期间可调用的子代理（subagent）配置。子代理是针对特定任务或领域定制的专用 AI 代理。                                                                                                                                                                                                                                                                                                                                                                                         |
| `includePartialMessages` | `boolean`                                    | `false`          | 若为 `true`，SDK 将在 AI 响应生成过程中实时发出不完整的消息，实现响应流式传输。                                                                                                                                                                                                                                                                                                                                                                                                |

### 超时设置

SDK 强制执行以下默认超时时间：

| 超时类型         | 默认值   | 说明                                                                                                                                 |
| ---------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `canUseTool`     | 1 分钟   | `canUseTool` 回调函数响应的最大耗时。若超时，工具请求将被自动拒绝。                                                                 |
| `mcpRequest`     | 1 分钟   | SDK MCP 工具调用完成的最大耗时。                                                                                                     |
| `controlRequest` | 1 分钟   | 控制类操作（如 `initialize()`、`setModel()`、`setPermissionMode()` 和 `interrupt()`）完成的最大耗时。                                 |
| `streamClose`    | 1 分钟   | 在多轮对话模式下，与 SDK MCP 服务端交互时，等待初始化完成并关闭 CLI 标准输入前的最大等待时间。                                       |

您可通过 `timeout` 选项自定义这些超时值：

```typescript
const query = qwen.query('您的提示词', {
  timeout: {
    canUseTool: 60000, // 权限回调超时：60 秒
    mcpRequest: 600000, // MCP 工具调用超时：10 分钟
    controlRequest: 60000, // 控制请求超时：60 秒
    streamClose: 15000, // 流关闭等待超时：15 秒
  },
});
```

### 消息类型

SDK 提供了类型守卫（type guards），用于识别不同类型的消息：

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

### 查询实例方法

`query()` 返回的 `Query` 实例提供了若干方法：

```typescript
const q = query({ prompt: 'Hello', options: {} });

// 获取会话 ID
const sessionId = q.getSessionId();

// 检查是否已关闭
const closed = q.isClosed();

// 中断当前操作
await q.interrupt();

// 在会话中途更改权限模式
await q.setPermissionMode('yolo');

// 在会话中途切换模型
await q.setModel('qwen-max');

// 关闭会话
await q.close();
```

## 权限模式

SDK 支持多种权限模式，用于控制工具的执行：

- **`default`**：写入类工具默认被拒绝，除非通过 `canUseTool` 回调函数显式批准，或在 `allowedTools` 列表中声明；只读类工具无需确认即可执行。
- **`plan`**：阻止所有写入类工具，要求 AI 首先输出执行计划。
- **`auto-edit`**：自动批准编辑类工具（如 `edit`、`write_file`），其余工具仍需用户确认。
- **`yolo`**：所有工具均自动执行，无需任何确认。

### 权限优先级链

1. `excludeTools` —— 完全禁用指定工具  
2. `permissionMode: 'plan'` —— 禁用非只读类工具  
3. `permissionMode: 'yolo'` —— 自动批准所有工具  
4. `allowedTools` —— 自动批准列表中匹配的工具  
5. `canUseTool` 回调函数 —— 自定义审批逻辑  
6. 默认行为 —— 在 SDK 模式下默认拒绝未明确允许的工具  

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

  // 等待某个条件满足或用户输入
  yield {
    type: 'user',
    session_id: 'my-session',
    message: { role: 'user', content: '现在将该文件内容读取出来' },
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
  // 允许所有读取操作
  if (toolName.startsWith('read_')) {
    return { behavior: 'allow', updatedInput: input };
  }

  // 对写入操作向用户发起确认（在实际应用中）
  const userApproved = await promptUser(`是否允许执行 ${toolName}？`);

  if (userApproved) {
    return { behavior: 'allow', updatedInput: input };
  }

  return { behavior: 'deny', message: '用户拒绝了该操作' };
};

const result = query({
  prompt: '创建一个新文件',
  options: {
    canUseTool,
  },
});
```

### 使用外部 MCP 服务器

```typescript
import { query } from '@qwen-code/sdk';

const result = query({
  prompt: '使用我 MCP 服务器中的自定义工具',
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

### 使用 SDK 内嵌的 MCP 服务器

SDK 提供了 `tool` 和 `createSdkMcpServer`，用于创建与 SDK 应用运行在同一进程内的 MCP 服务器。当你希望向 AI 暴露自定义工具，而又不想启动独立的服务器进程时，这种方式非常有用。

#### `tool(name, description, inputSchema, handler)`

使用 Zod 模式进行类型推断，创建一个工具定义。

| 参数          | 类型                               | 描述                                                                     |
| ------------- | ---------------------------------- | ------------------------------------------------------------------------ |
| `name`        | `string`                           | 工具名称（1–64 个字符，必须以字母开头，仅允许字母、数字和下划线）       |
| `description` | `string`                           | 对该工具功能的可读性描述                                                 |
| `inputSchema` | `ZodRawShape`                      | 定义工具输入参数的 Zod 模式对象                                          |
| `handler`     | `(args, extra) => Promise<Result>` | 异步函数，用于执行工具并返回 MCP 内容块                                 |

`handler` 必须返回一个 `CallToolResult` 对象，其结构如下：

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

创建一个嵌入 SDK 的 MCP 服务器实例。

| 选项      | 类型                     | 默认值    | 描述                                 |
| --------- | ------------------------ | --------- | ------------------------------------ |
| `name`    | `string`                 | 必填      | MCP 服务器的唯一名称                 |
| `version` | `string`                 | `'1.0.0'` | 服务器版本                           |
| `tools`   | `SdkMcpToolDefinition[]` | -         | 使用 `tool()` 创建的工具数组         |

返回一个 `McpSdkServerConfigWithInstance` 对象，可直接传入 `mcpServers` 配置项。

#### 示例

```typescript
import { z } from 'zod';
import { query, tool, createSdkMcpServer } from '@qwen-code/sdk';

// 使用 Zod Schema 定义一个工具
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
  prompt: '42 加 17 等于多少？',
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

SDK 提供了 `AbortError` 类用于处理被中止的查询：

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