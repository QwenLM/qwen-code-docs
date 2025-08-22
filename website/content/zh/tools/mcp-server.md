# 使用 Qwen Code 的 MCP 服务器

本文档提供了配置和使用 Model Context Protocol (MCP) 服务器与 Qwen Code 配合的指南。

## 什么是 MCP server？

MCP server 是一个通过 Model Context Protocol 向 CLI 暴露工具和资源的应用程序，使其能够与外部系统和数据源进行交互。MCP server 充当了模型与你的本地环境或其他服务（如 API）之间的桥梁。

MCP server 使 CLI 能够：

- **发现工具**：通过标准化的 schema 定义列出可用的工具、它们的描述和参数。
- **执行工具**：使用定义好的参数调用特定工具，并接收结构化的响应。
- **访问资源**：从特定资源中读取数据（尽管 CLI 主要专注于工具执行）。

通过 MCP server，你可以扩展 CLI 的功能，使其执行超出其内置特性之外的操作，例如与数据库、API、自定义脚本或专业工作流进行交互。

## 核心集成架构

Qwen Code 通过核心包（`packages/core/src/tools/`）中内置的一套复杂的发现与执行系统，与 MCP 服务器进行集成：

### 发现阶段（`mcp-client.ts`）

发现过程由 `discoverMcpTools()` 函数编排，其主要工作包括：

1. **遍历配置的服务器**：从你的 `settings.json` 中的 `mcpServers` 配置读取服务器列表  
2. **建立连接**：使用合适的传输机制（Stdio、SSE 或 Streamable HTTP）与各服务器建立连接  
3. **获取工具定义**：通过 MCP 协议从每个服务器获取工具定义信息  
4. **清理并验证 schema**：对工具 schema 进行清理和验证，确保其与 Gemini API 兼容  
5. **注册工具**：将工具注册到全局工具注册表中，并处理可能的命名冲突问题

### 执行层 (`mcp-tool.ts`)

每个发现的 MCP 工具都会被封装在一个 `DiscoveredMCPTool` 实例中，该实例：

- **处理确认逻辑**：根据服务器信任设置和用户偏好进行判断
- **管理工具执行**：通过正确的参数调用 MCP 服务器
- **处理响应**：为 LLM 上下文和用户展示分别处理返回结果
- **维护连接状态**：处理超时等连接问题

### 传输机制

CLI 支持三种 MCP 传输类型：

- **Stdio Transport**：启动一个子进程并通过 stdin/stdout 进行通信
- **SSE Transport**：连接到 Server-Sent Events 端点
- **Streamable HTTP Transport**：使用 HTTP 流进行通信

## 如何设置你的 MCP 服务器

Qwen Code 使用 `settings.json` 文件中的 `mcpServers` 配置来定位并连接到 MCP 服务器。该配置支持多个服务器，并可使用不同的传输机制。

### 在 settings.json 中配置 MCP 服务器

你可以在全局级别配置 MCP 服务器，编辑 `~/.qwen/settings.json` 文件，或者在你的项目根目录下创建或打开 `.qwen/settings.json` 文件。在文件中添加 `mcp_servers` 配置块。

### 配置结构

在你的 `settings.json` 文件中添加一个 `mcpServers` 对象：

```json
{ ...文件包含其他配置对象
  "mcpServers": {
    "serverName": {
      "command": "path/to/server",
      "args": ["--arg1", "value1"],
      "env": {
        "API_KEY": "$MY_API_TOKEN"
      },
      "cwd": "./server-directory",
      "timeout": 30000,
      "trust": false
    }
  }
}
```

### 配置属性

每个服务器配置支持以下属性：

#### 必填（以下任选其一）

- **`command`** (string): Stdio transport 的可执行文件路径
- **`url`** (string): SSE endpoint URL (例如 `"http://localhost:8080/sse"`)
- **`httpUrl`** (string): HTTP streaming endpoint URL

#### 可选参数

- **`args`** (string[]): 用于 Stdio 传输的命令行参数
- **`headers`** (object): 使用 `url` 或 `httpUrl` 时的自定义 HTTP headers
- **`env`** (object): 服务器进程的环境变量。值可以使用 `$VAR_NAME` 或 `${VAR_NAME}` 语法引用环境变量
- **`cwd`** (string): Stdio 传输的工作目录
- **`timeout`** (number): 请求超时时间，单位为毫秒（默认值：600,000ms = 10分钟）
- **`trust`** (boolean): 当设置为 `true` 时，将跳过此服务器的所有 tool call 确认（默认值：`false`）
- **`includeTools`** (string[]): 从该 MCP 服务器包含的工具名称列表。指定后，只有此处列出的工具才可从此服务器使用（白名单行为）。未指定时，默认启用服务器提供的所有工具。
- **`excludeTools`** (string[]): 从该 MCP 服务器排除的工具名称列表。即使服务器提供了这些工具，模型也无法使用。**注意：** `excludeTools` 的优先级高于 `includeTools` —— 如果某个工具同时出现在两个列表中，它将被排除。

### 远程 MCP 服务器的 OAuth 支持

Qwen Code 支持通过 SSE 或 HTTP 传输方式对远程 MCP 服务器进行 OAuth 2.0 认证。这使得你可以安全地访问需要认证的 MCP 服务器。

#### 自动 OAuth 发现

对于支持 OAuth 发现的服务器，你可以省略 OAuth 配置，让 CLI 自动完成发现：

```json
{
  "mcpServers": {
    "discoveredServer": {
      "url": "https://api.example.com/sse"
    }
  }
}
```

CLI 将自动：

- 检测服务器是否需要 OAuth 认证（401 响应）
- 从服务器元数据中发现 OAuth 端点
- 如果支持，执行动态客户端注册
- 处理 OAuth 流程和 token 管理

#### Authentication Flow

当连接到启用 OAuth 的服务器时：

1. **初始连接尝试** 失败，返回 401 Unauthorized
2. **OAuth discovery** 找到 authorization 和 token endpoints
3. **浏览器打开** 进行用户认证（需要本地浏览器访问权限）
4. **Authorization code** 换取 access tokens
5. **Tokens 被安全存储** 供后续使用
6. **连接重试** 使用有效 tokens 成功连接

#### Browser Redirect Requirements

**重要提示：** OAuth 认证要求你的本地机器能够：

- 打开网页浏览器进行认证
- 接收来自 `http://localhost:7777/oauth/callback` 的重定向

以下环境将无法使用此功能：

- 无浏览器访问权限的 headless 环境
- 未启用 X11 forwarding 的远程 SSH 会话
- 不支持浏览器的容器化环境

#### Managing OAuth Authentication

使用 `/mcp auth` 命令管理 OAuth 认证：

```bash

# 列出需要认证的服务器
/mcp auth
```

```markdown
# 与特定服务器进行身份验证
/mcp auth serverName

# 如果 token 过期则重新认证
/mcp auth serverName
```

#### OAuth 配置属性

- **`enabled`** (boolean): 为此服务器启用 OAuth
- **`clientId`** (string): OAuth client ID（使用动态注册时可选）
- **`clientSecret`** (string): OAuth client secret（对于公共客户端可选）
- **`authorizationUrl`** (string): OAuth 授权端点（如果省略则自动发现）
- **`tokenUrl`** (string): OAuth token 端点（如果省略则自动发现）
- **`scopes`** (string[]): 必需的 OAuth scopes
- **`redirectUri`** (string): 自定义 redirect URI（默认为 `http://localhost:7777/oauth/callback`）
- **`tokenParamName`** (string): SSE URLs 中 token 的查询参数名称
- **`audiences`** (string[]): token 有效的 audiences
```

#### Token 管理

OAuth tokens 会自动：

- **安全存储** 在 `~/.qwen/mcp-oauth-tokens.json` 中
- **自动刷新**（如果提供了 refresh token，则在过期时自动刷新）
- **连接前验证** 每次连接尝试前都会进行有效性验证
- **清理无效或过期的 token** 当 token 无效或过期时会被自动清除

#### 认证提供者类型

你可以使用 `authProviderType` 属性来指定认证提供者类型：

- **`authProviderType`** (string)：指定认证提供者。可以是以下值之一：
  - **`dynamic_discovery`**（默认）：CLI 将自动从服务器发现 OAuth 配置。
  - **`google_credentials`**：CLI 将使用 Google Application Default Credentials (ADC) 来与服务器进行认证。使用此提供者时，你必须指定所需的 scopes。

```json
{
  "mcpServers": {
    "googleCloudServer": {
      "httpUrl": "https://my-gcp-service.run.app/mcp",
      "authProviderType": "google_credentials",
      "oauth": {
        "scopes": ["https://www.googleapis.com/auth/userinfo.email"]
      }
    }
  }
}
```

### 示例配置

#### Python MCP Server (Stdio)

```json
{
  "mcpServers": {
    "pythonTools": {
      "command": "python",
      "args": ["-m", "my_mcp_server", "--port", "8080"],
      "cwd": "./mcp-servers/python",
      "env": {
        "DATABASE_URL": "$DB_CONNECTION_STRING",
        "API_KEY": "${EXTERNAL_API_KEY}"
      },
      "timeout": 15000
    }
  }
}
```

#### Node.js MCP Server (Stdio)

```json
{
  "mcpServers": {
    "nodeServer": {
      "command": "node",
      "args": ["dist/server.js", "--verbose"],
      "cwd": "./mcp-servers/node",
      "trust": true
    }
  }
}
```

#### 基于 Docker 的 MCP Server

```json
{
  "mcpServers": {
    "dockerizedServer": {
      "command": "docker",
      "args": [
        "run",
        "-i",
        "--rm",
        "-e",
        "API_KEY",
        "-v",
        "${PWD}:/workspace",
        "my-mcp-server:latest"
      ],
      "env": {
        "API_KEY": "$EXTERNAL_SERVICE_TOKEN"
      }
    }
  }
}
```

#### 基于 HTTP 的 MCP Server

```json
{
  "mcpServers": {
    "httpServer": {
      "httpUrl": "http://localhost:3000/mcp",
      "timeout": 5000
    }
  }
}
```

#### 带自定义 Headers 的基于 HTTP 的 MCP Server

```json
{
  "mcpServers": {
    "httpServerWithAuth": {
      "httpUrl": "http://localhost:3000/mcp",
      "headers": {
        "Authorization": "Bearer your-api-token",
        "X-Custom-Header": "custom-value",
        "Content-Type": "application/json"
      },
      "timeout": 5000
    }
  }
}
```

#### 带 Tool 过滤的 MCP Server

```json
{
  "mcpServers": {
    "filteredServer": {
      "command": "python",
      "args": ["-m", "my_mcp_server"],
      "includeTools": ["safe_tool", "file_reader", "data_processor"],
      // "excludeTools": ["dangerous_tool", "file_deleter"],
      "timeout": 30000
    }
  }
}
```

## Discovery Process Deep Dive

当 Qwen Code 启动时，它会通过以下详细流程执行 MCP server 的 discovery：

### 1. 服务器迭代与连接

对于 `mcpServers` 中配置的每个 server：

1. **状态跟踪开始：** Server 状态被设置为 `CONNECTING`
2. **Transport 选择：** 根据配置属性：
   - `httpUrl` → `StreamableHTTPClientTransport`
   - `url` → `SSEClientTransport`
   - `command` → `StdioClientTransport`
3. **建立连接：** MCP client 尝试在配置的 timeout 内建立连接
4. **错误处理：** 连接失败会被记录日志，server 状态被设置为 `DISCONNECTED`

### 2. 工具发现

连接成功后：

1. **工具列表获取：** 客户端调用 MCP 服务器的工具列表 endpoint
2. **Schema 验证：** 验证每个工具的 function 声明
3. **工具过滤：** 根据 `includeTools` 和 `excludeTools` 配置过滤工具
4. **名称清理：** 清理工具名称以满足 Gemini API 要求：
   - 将无效字符（非字母数字、下划线、点、连字符）替换为下划线
   - 超过 63 个字符的名称会被截断并用中间替换法处理（`___`）

### 3. 冲突解决

当多个服务器暴露同名工具时：

1. **首次注册优先：** 第一个注册工具名称的服务器获得无前缀的名称
2. **自动添加前缀：** 后续服务器的工具名称会被自动添加前缀：`serverName__toolName`
3. **注册表跟踪：** 工具注册表维护服务器名称与其工具之间的映射关系

### 4. Schema 处理

工具参数 schema 会经过清理以确保 API 兼容性：

- **`$schema` 属性** 会被移除
- **`additionalProperties`** 会被剥离
- **包含 `default` 的 `anyOf`** 会移除默认值（为了兼容 Vertex AI）
- **递归处理** 会应用到嵌套的 schema

### 5. 连接管理

在发现阶段之后：

- **持久连接：** 成功注册工具的服务器会保持连接
- **清理：** 没有提供可用工具的服务器连接会被关闭
- **状态更新：** 最终服务器状态会被设置为 `CONNECTED` 或 `DISCONNECTED`

## 工具执行流程

当模型决定使用某个 MCP 工具时，会按照以下流程执行：

### 1. 工具调用

模型会生成一个 `FunctionCall`，包含：

- **工具名称：** 已注册的名称（可能带有前缀）
- **参数：** 符合工具参数 schema 的 JSON 对象

### 2. 确认流程

每个 `DiscoveredMCPTool` 都实现了复杂的确认逻辑：

#### 基于信任的跳过机制

```typescript
if (this.trust) {
  return false; // 无需确认
}
```

#### 动态白名单管理

系统维护以下内部白名单：

- **服务器级别：** `serverName` → 来自此服务器的所有工具都被信任
- **工具级别：** `serverName.toolName` → 此特定工具被信任

#### 用户选择处理

当需要确认时，用户可以选择：

- **仅本次执行：** 只执行这一次
- **始终允许此工具：** 添加到工具级别白名单
- **始终允许此服务器：** 添加到服务器级别白名单
- **取消：** 中止执行

### 3. 执行

确认后（或绕过信任机制）：

1. **参数准备：** 参数会根据工具的 schema 进行验证
2. **MCP 调用：** 底层的 `CallableTool` 会向服务器发起调用：

   ```typescript
   const functionCalls = [
     {
       name: this.serverToolName, // 原始服务器工具名称
       args: params,
     },
   ];
   ```

3. **响应处理：** 结果会被格式化，分别用于 LLM 上下文和用户展示

### 4. 响应处理

执行结果包含：

- **`llmContent`：** 供语言模型使用的原始响应内容
- **`returnDisplay`：** 供用户展示的格式化输出（通常是 markdown 代码块中的 JSON）

## 如何与你的 MCP 服务器交互

### 使用 `/mcp` 命令

`/mcp` 命令提供关于你的 MCP 服务器设置的完整信息：

```bash
/mcp
```

该命令会显示以下内容：

- **服务器列表：** 所有已配置的 MCP 服务器
- **连接状态：** `CONNECTED`、`CONNECTING` 或 `DISCONNECTED`
- **服务器详情：** 配置摘要（不包含敏感数据）
- **可用工具：** 每个服务器提供的工具列表及其描述
- **发现状态：** 整体 discovery 过程的状态

### 示例 `/mcp` 输出

```
MCP Servers Status:

📡 pythonTools (CONNECTED)
  Command: python -m my_mcp_server --port 8080
  Working Directory: ./mcp-servers/python
  Timeout: 15000ms
  Tools: calculate_sum, file_analyzer, data_processor

🔌 nodeServer (DISCONNECTED)
  Command: node dist/server.js --verbose
  Error: Connection refused

🐳 dockerizedServer (CONNECTED)
  Command: docker run -i --rm -e API_KEY my-mcp-server:latest
  Tools: docker__deploy, docker__status

Discovery State: COMPLETED
```

### 工具使用

一旦被发现，MCP 工具就会像内置工具一样提供给 Gemini 模型使用。模型将自动：

1. **根据你的请求选择合适的工具**
2. **显示确认对话框**（除非服务器是受信任的）
3. **使用正确的参数执行工具**
4. **以用户友好的格式显示结果**

## 状态监控和故障排除

### 连接状态

MCP 集成会跟踪几种状态：

#### 服务器状态 (`MCPServerStatus`)

- **`DISCONNECTED`:** 服务器未连接或出现错误
- **`CONNECTING`:** 正在尝试连接
- **`CONNECTED`:** 服务器已连接并准备就绪

#### 发现阶段 (`MCPDiscoveryState`)

- **`NOT_STARTED`:** 发现尚未开始
- **`IN_PROGRESS`:** 正在发现服务器
- **`COMPLETED`:** 发现已完成（无论是否有错误）

### 常见问题和解决方案

#### 服务器无法连接

**症状：** 服务器显示 `DISCONNECTED` 状态

**排查步骤：**

1. **检查配置：** 确认 `command`、`args` 和 `cwd` 配置正确
2. **手动测试：** 直接运行服务器命令，确保可以正常工作
3. **检查依赖：** 确保所有必需的 packages 都已安装
4. **查看日志：** 检查 CLI 输出中的错误信息
5. **验证权限：** 确保 CLI 可以执行服务器命令

#### 未发现工具

**症状：** 服务器连接成功但没有可用工具

**排查步骤：**

1. **验证工具注册：** 确保你的服务器实际注册了工具
2. **检查 MCP 协议：** 确认你的服务器正确实现了 MCP 工具列表功能
3. **查看服务器日志：** 检查 stderr 输出中的服务器端错误
4. **测试工具列表：** 手动测试服务器的工具发现 endpoint

#### 工具无法执行

**症状：** 工具被发现但执行时失败

**排查步骤：**

1. **参数验证：** 确保你的 tool 能接受预期的参数
2. **Schema 兼容性：** 验证你的 input schemas 是有效的 JSON Schema
3. **错误处理：** 检查你的 tool 是否抛出了未处理的异常
4. **超时问题：** 考虑增加 `timeout` 设置

#### 沙盒兼容性

**症状：** 启用沙盒时 MCP servers 失败

**解决方案：**

1. **基于 Docker 的 servers：** 使用包含所有依赖的 Docker 容器
2. **路径可访问性：** 确保 server 可执行文件在沙盒中可用
3. **网络访问：** 配置沙盒以允许必要的网络连接
4. **环境变量：** 验证所需的环境变量已正确传递

### 调试技巧

1. **启用调试模式：** 使用 `--debug` 参数运行 CLI 以获取详细输出
2. **检查 stderr：** MCP 服务器的 stderr 输出会被捕获并记录（INFO 级别消息会被过滤）
3. **独立测试：** 在集成之前，先独立测试你的 MCP 服务器
4. **增量配置：** 从简单工具开始，再逐步添加复杂功能
5. **频繁使用 `/mcp`：** 在开发过程中监控服务器状态

## 重要说明

### 安全注意事项

- **信任设置：** `trust` 选项会跳过所有确认对话框。请谨慎使用，仅用于你完全控制的服务器
- **访问令牌：** 配置包含 API key 或 token 的环境变量时要注意安全性
- **沙盒兼容性：** 使用沙盒时，确保 MCP 服务器在沙盒环境中可用
- **私有数据：** 使用范围过广的 personal access token 可能导致不同仓库间的信息泄露

### 性能与资源管理

- **连接持久化：** CLI 会对成功注册工具的服务器保持持久连接
- **自动清理：** 对于不提供任何工具的服务器，其连接会被自动关闭
- **超时管理：** 根据服务器响应特性配置合适的超时时间
- **资源监控：** MCP 服务器作为独立进程运行，会消耗系统资源

### Schema 兼容性

- **属性剥离：** 为兼容 Gemini API，系统会自动移除某些 schema 属性（如 `$schema`、`additionalProperties`）
- **名称清理：** 工具名称会自动清理以满足 API 要求
- **冲突解决：** 通过自动添加前缀来解决不同服务器之间的工具名称冲突

这种全面的集成使 MCP 服务器成为扩展 CLI 功能的强大方式，同时保证了安全性、可靠性和易用性。

## 从 Tools 返回富内容

MCP tools 不仅限于返回简单的文本。你可以返回丰富的多部分的内容，包括文本、图像、音频和其他二进制数据，所有这些都可以在单个 tool response 中完成。这使你能够构建强大的 tools，可以在一次交互中向模型提供多样化的信息。

所有从 tool 返回的数据都会被处理并作为上下文发送给模型，用于下一次生成，使模型能够对提供的信息进行推理或总结。

### 工作原理

要返回富内容，你的 tool 的响应必须遵循 MCP 规范中的 [`CallToolResult`](https://modelcontextprotocol.io/specification/2025-06-18/server/tools#tool-result) 结构。结果的 `content` 字段应该是一个 `ContentBlock` 对象数组。CLI 会正确处理这个数组，将文本与二进制数据分离，并打包传递给模型。

你可以在 `content` 数组中混合使用不同类型的 content block。支持的 block 类型包括：

- `text`
- `image`
- `audio`
- `resource`（嵌入内容）
- `resource_link`

### 示例：返回文本和图像

以下是一个有效的 MCP 工具 JSON 响应示例，该响应同时返回文本描述和图像：

```json
{
  "content": [
    {
      "type": "text",
      "text": "Here is the logo you requested."
    },
    {
      "type": "image",
      "data": "BASE64_ENCODED_IMAGE_DATA_HERE",
      "mimeType": "image/png"
    },
    {
      "type": "text",
      "text": "The logo was created in 2025."
    }
  ]
}
```

当 Qwen Code 接收到此响应时，它将：

1.  提取所有文本并将其合并为单个 `functionResponse` 部分，供模型使用。
2.  将图像数据作为单独的 `inlineData` 部分呈现。
3.  在 CLI 中提供简洁、用户友好的摘要，表明已接收到文本和图像。

这使你能够构建复杂的工具，为 Gemini 模型提供丰富的多模态上下文。

## MCP Prompts 作为 Slash Commands

除了 tools 之外，MCP servers 还可以暴露预定义的 prompts，这些 prompts 可以作为 slash commands 在 Qwen Code 中执行。这允许你为常见或复杂的查询创建快捷方式，通过名称即可轻松调用。

### 在服务器端定义 Prompts

下面是一个定义了 prompts 的 stdio MCP 服务器的小例子：

```ts
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

const server = new McpServer({
  name: 'prompt-server',
  version: '1.0.0',
});

server.registerPrompt(
  'poem-writer',
  {
    title: 'Poem Writer',
    description: 'Write a nice haiku',
    argsSchema: { title: z.string(), mood: z.string().optional() },
  },
  ({ title, mood }) => ({
    messages: [
      {
        role: 'user',
        content: {
          type: 'text',
          text: `Write a haiku${mood ? ` with the mood ${mood}` : ''} called ${title}. Note that a haiku is 5 syllables followed by 7 syllables followed by 5 syllables `,
        },
      },
    ],
  }),
);

const transport = new StdioServerTransport();
await server.connect(transport);
```

这段代码可以通过以下方式添加到 `settings.json` 的 `mcpServers` 配置项中：

```json
"nodeServer": {
  "command": "node",
  "args": ["filename.ts"],
}
```

### 调用 Prompts

一旦发现某个 prompt，你可以通过其名称作为斜杠命令来调用它。CLI 会自动处理参数解析。

```bash
/poem-writer --title="Qwen Code" --mood="reverent"
```

或者，使用位置参数：

```bash
/poem-writer "Qwen Code" reverent
```

当你运行这个命令时，CLI 会在 MCP 服务器上执行 `prompts/get` 方法，并传入提供的参数。服务器负责将参数替换到 prompt 模板中并返回最终的 prompt 文本。然后 CLI 会将这个 prompt 发送给模型执行。这为自动化和共享常见工作流提供了一种便捷的方式。

## 使用 `qwen mcp` 管理 MCP 服务器

虽然你可以通过手动编辑 `settings.json` 文件来配置 MCP 服务器，但 CLI 提供了一套便捷的命令，可以让你以编程方式管理服务器配置。这些命令简化了添加、列出和删除 MCP 服务器的过程，无需直接编辑 JSON 文件。

### 添加服务器 (`qwen mcp add`)

`add` 命令用于在你的 `settings.json` 中配置一个新的 MCP 服务器。根据作用域 (`-s, --scope`)，该配置将被添加到用户配置文件 `~/.qwen/settings.json` 或项目配置文件 `.qwen/settings.json` 中。

**命令：**

```bash
qwen mcp add [options] <name> <commandOrUrl> [args...]
```

- `<name>`: 服务器的唯一名称。
- `<commandOrUrl>`: 要执行的命令（用于 `stdio`）或 URL（用于 `http`/`sse`）。
- `[args...]`: 可选参数，用于 `stdio` 命令。

**选项（Flags）：**

- `-s, --scope`: 配置作用域（user 或 project）。[默认: "project"]
- `-t, --transport`: 传输类型（stdio, sse, http）。[默认: "stdio"]
- `-e, --env`: 设置环境变量（例如 -e KEY=value）。
- `-H, --header`: 为 SSE 和 HTTP 传输设置 HTTP headers（例如 -H "X-Api-Key: abc123" -H "Authorization: Bearer abc123"）。
- `--timeout`: 设置连接超时时间（毫秒）。
- `--trust`: 信任该服务器（跳过所有工具调用确认提示）。
- `--description`: 设置服务器的描述信息。
- `--include-tools`: 包含的工具列表，以逗号分隔。
- `--exclude-tools`: 排除的工具列表，以逗号分隔。

#### 添加 stdio server

这是运行本地 server 的默认传输方式。

```bash

# 基本语法
qwen mcp add <name> <command> [args...]

# 示例：添加本地 server
qwen mcp add my-stdio-server -e API_KEY=123 /path/to/server arg1 arg2 arg3

# 示例：添加本地 python server
qwen mcp add python-server python server.py --port 8080
```

#### 添加 HTTP server

此传输方式适用于使用可流式 HTTP 传输的 server。

```bash

# 基本语法
qwen mcp add --transport http <name> <url>

# 示例：添加 HTTP server
qwen mcp add --transport http http-server https://api.example.com/mcp/

# 示例：添加带认证 header 的 HTTP server
qwen mcp add --transport http secure-http https://api.example.com/mcp/ --header "Authorization: Bearer abc123"
```

#### 添加 SSE server

此传输方式适用于使用 Server-Sent Events (SSE) 的 server。

```bash

# 基本语法
qwen mcp add --transport sse <name> <url>
```

# 示例：添加一个 SSE 服务器
```bash
qwen mcp add --transport sse sse-server https://api.example.com/sse/
```

# 示例：添加一个带认证 header 的 SSE 服务器
```bash
qwen mcp add --transport sse secure-sse https://api.example.com/sse/ --header "Authorization: Bearer abc123"
```

### 列出服务器 (`qwen mcp list`)

要查看当前配置的所有 MCP 服务器，可以使用 `list` 命令。该命令会显示每个服务器的名称、配置详情以及连接状态。

**命令：**

```bash
qwen mcp list
```

**示例输出：**

```sh
✓ stdio-server: command: python3 server.py (stdio) - Connected
✓ http-server: https://api.example.com/mcp (http) - Connected
✗ sse-server: https://api.example.com/sse (sse) - Disconnected
```

### 删除服务器 (`qwen mcp remove`)

要从配置中删除一个服务器，请使用 `remove` 命令并指定服务器名称。

**命令：**

```bash
qwen mcp remove <name>
```

**示例：**

```bash
qwen mcp remove my-server
```

该命令会根据作用域 (`-s, --scope`) 在相应的 `settings.json` 文件中找到并删除 `mcpServers` 对象里的 "my-server" 条目。