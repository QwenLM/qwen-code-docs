# 在 Qwen Code 中使用 MCP 服务器

本文档提供在 Qwen Code 中配置和使用模型上下文协议（MCP）服务器的指南。

## 什么是 MCP 服务器？

MCP 服务器是一种应用程序，它通过模型上下文协议向 CLI 暴露工具和资源，使其能够与外部系统及数据源进行交互。MCP 服务器充当模型与你的本地环境或其他服务（如 API）之间的桥梁。

MCP 服务器使 CLI 能够：

- **发现工具：** 通过标准化的模式定义列出可用工具、它们的描述和参数。
- **执行工具：** 使用定义的参数调用特定工具，并接收结构化响应。
- **访问资源：** 从特定资源读取数据（尽管 CLI 主要专注于工具执行）。

借助 MCP 服务器，你可以扩展 CLI 的能力，执行超出其内置功能的操作，例如与数据库、API、自定义脚本或特定工作流进行交互。

## 核心集成架构

Qwen Code 通过一个复杂的发现和执行系统与 MCP 服务器集成，该系统构建于核心包（`packages/core/src/tools/`）之中：

### 发现层 (`mcp-client.ts`)

发现过程由 `discoverMcpTools()` 编排，其执行以下步骤：

1. **遍历已配置的服务器**，从你的 `settings.json` 的 `mcpServers` 配置中读取
2. **建立连接**，使用适当的传输机制（Stdio、SSE 或 Streamable HTTP）
3. **获取工具定义**，从每个服务器通过 MCP 协议获取
4. **清理并验证工具模式**，确保与 Qwen API 兼容
5. **将工具注册到全局工具注册表**，并进行冲突解决

### 执行层 (`mcp-tool.ts`)

每个发现的 MCP 工具都被封装在一个 `DiscoveredMCPTool` 实例中，该实例负责：

- **处理确认逻辑**，基于服务器信任设置和用户偏好
- **管理工具执行**，通过携带正确参数调用 MCP 服务器
- **处理响应**，兼顾 LLM 上下文和用户展示
- **维护连接状态**，并处理超时

### 传输机制

CLI 支持三种 MCP 传输类型：

- **Stdio 传输：** 启动一个子进程，通过 stdin/stdout 通信
- **SSE 传输：** 连接到 Server-Sent Events 端点
- **Streamable HTTP 传输：** 使用 HTTP 流式传输进行通信

## 如何设置你的 MCP 服务器

Qwen Code 使用 `settings.json` 文件中的 `mcpServers` 配置来定位并连接到 MCP 服务器。该配置支持使用不同传输机制的多个服务器。

### 在 settings.json 中配置 MCP 服务器

你可以通过两种主要方式在 `settings.json` 文件中配置 MCP 服务器：通过顶层 `mcpServers` 对象定义具体的服务器，以及通过 `mcp` 对象定义控制服务器发现和执行的全局设置。

#### 全局 MCP 设置 (`mcp`)

`settings.json` 中的 `mcp` 对象允许你定义适用于所有 MCP 服务器的全局规则。

- **`mcp.serverCommand`** (字符串)：启动 MCP 服务器的全局命令。
- **`mcp.allowed`** (字符串数组)：允许连接的 MCP 服务器名称列表。如果设置了此项，则只会连接此列表中的服务器（与 `mcpServers` 对象中的键匹配）。
- **`mcp.excluded`** (字符串数组)：要排除的 MCP 服务器名称列表。此列表中的服务器将不会被连接。

**示例：**

```json
{
  "mcp": {
    "allowed": ["my-trusted-server"],
    "excluded": ["experimental-server"]
  }
}
```

#### 服务器特定配置 (`mcpServers`)

`mcpServers` 对象用于定义你希望 CLI 连接的每个单独的 MCP 服务器。

### 配置结构

将 `mcpServers` 对象添加到你的 `settings.json` 文件中：

```json
{ ...文件中包含其他配置对象
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

#### 必需（以下之一）

- **`command`** (字符串)：Stdio 传输的可执行文件路径
- **`url`** (字符串)：SSE 端点 URL（例如 `"http://localhost:8080/sse"`）
- **`httpUrl`** (字符串)：HTTP 流式传输端点 URL

#### 可选

- **`args`** (字符串数组)：Stdio 传输的命令行参数
- **`headers`** (对象)：使用 `url` 或 `httpUrl` 时的自定义 HTTP 头
- **`env`** (对象)：服务器进程的环境变量。值可以使用 `$VAR_NAME` 或 `${VAR_NAME}` 语法引用环境变量
- **`cwd`** (字符串)：Stdio 传输的工作目录
- **`timeout`** (数字)：请求超时时间（毫秒，默认 600,000 毫秒 = 10 分钟）
- **`trust`** (布尔值)：为 `true` 时，绕过此服务器的所有工具调用确认（默认 `false`）
- **`includeTools`** (字符串数组)：从此 MCP 服务器中包含的工具名称列表。指定后，只有此处列出的工具才可从此服务器使用（白名单行为）。如果未指定，则默认启用该服务器的所有工具。
- **`excludeTools`** (字符串数组)：从此 MCP 服务器中排除的工具名称列表。即使服务器暴露了这些工具，它们也不会对模型可用。**注意：** `excludeTools` 优先于 `includeTools`——如果一个工具同时出现在两个列表中，它将被排除。
- **`targetAudience`** (字符串)：在受 IAP 保护的应用程序上白名单的 OAuth 客户端 ID。与 `authProviderType: 'service_account_impersonation'` 一起使用。
- **`targetServiceAccount`** (字符串)：要模拟的 Google Cloud 服务账户的电子邮件地址。与 `authProviderType: 'service_account_impersonation'` 一起使用。

### 远程 MCP 服务器的 OAuth 支持

Qwen Code 支持通过 SSE 或 HTTP 传输的远程 MCP 服务器的 OAuth 2.0 身份验证。这允许安全地访问需要身份验证的 MCP 服务器。

#### 自动 OAuth 发现

对于支持 OAuth 发现的服务器，你可以省略 OAuth 配置，让 CLI 自动发现它：

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

- 检测服务器何时需要 OAuth 身份验证（401 响应）
- 从服务器元数据中发现 OAuth 端点
- 如果支持，执行动态客户端注册
- 处理 OAuth 流程和令牌管理

#### 身份验证流程

当连接到启用 OAuth 的服务器时：

1. **初始连接尝试**失败，返回 401 Unauthorized
2. **OAuth 发现**找到授权和令牌端点
3. **浏览器打开**以进行用户身份验证（需要本地浏览器访问）
4. **授权码**换取访问令牌
5. **令牌被安全存储**以供将来使用
6. **连接重试**在有效令牌下成功

#### 浏览器重定向要求

**重要：** OAuth 身份验证要求重定向 URI 是可访问的：

- **默认行为**：重定向到 `http://localhost:7777/oauth/callback`（适用于本地设置）
- **自定义重定向 URI**：使用 `--oauth-redirect-uri` 或在 settings.json 中配置 `redirectUri` 以指定不同的 URL

对于**远程/云服务器部署**（例如 Web 终端、SSH 会话、云 IDE）：

- 默认的 `localhost` 重定向**不起作用**
- 你**必须**配置一个指向可公开访问 URL 的自定义 `redirectUri`
- 用户的浏览器必须能够访问此 URL 并重定向回服务器

远程服务器示例：

```bash
qwen mcp add --transport sse remote-server https://api.example.com/sse/ \
  --oauth-redirect-uri https://your-remote-server.example.com/oauth/callback
```

在以下环境中 OAuth 将无法工作：

- 无浏览器访问的无头环境
- 配置的 `redirectUri` 无法从用户浏览器访问的环境

#### 管理 OAuth 身份验证

在交互式 Qwen Code 会话中，使用 `/mcp` 对话框检查 MCP
服务器并管理 OAuth 身份验证。

#### OAuth 配置属性

- **`enabled`** (布尔值)：为此服务器启用 OAuth
- **`clientId`** (字符串)：OAuth 客户端标识符（对于动态注册是可选的）
- **`clientSecret`** (字符串)：OAuth 客户端密钥（对于公共客户端是可选的）
- **`authorizationUrl`** (字符串)：OAuth 授权端点（如果省略则自动发现）
- **`tokenUrl`** (字符串)：OAuth 令牌端点（如果省略则自动发现）
- **`scopes`** (字符串数组)：所需的 OAuth 范围
- **`redirectUri`** (字符串)：自定义重定向 URI。**对于远程部署至关重要**：默认为 `http://localhost:7777/oauth/callback`。当在远程/云服务器上运行 Qwen Code 时，请设置为可公开访问的 URL（例如 `https://your-server.com/oauth/callback`）。可以通过 `qwen mcp add --oauth-redirect-uri` 或在 settings.json 中直接配置。
- **`tokenParamName`** (字符串)：SSE URL 中令牌的查询参数名称
- **`audiences`** (字符串数组)：令牌有效的受众

#### 令牌管理

OAuth 令牌会自动：

- **存储**在 `~/.qwen/mcp-oauth-tokens.json` 中（明文，模式 0600）。如果设置了 `QWEN_CODE_FORCE_ENCRYPTED_FILE_STORAGE=true`，Qwen Code 会使用基于密钥链的存储（如果可用），否则使用带有 AES-256-GCM 加密的 `~/.qwen/mcp-oauth-tokens-v2.json`。
- **刷新**（如果刷新令牌可用且令牌已过期）
- **验证**每次连接尝试之前
- **清理**当令牌无效或过期时

> [!WARNING]
> 默认情况下，OAuth 令牌以未加密方式存储在磁盘上。在共享或多用户机器上，设置 `QWEN_CODE_FORCE_ENCRYPTED_FILE_STORAGE=true` 以保护凭据。

#### 身份验证提供者类型

你可以使用 `authProviderType` 属性指定身份验证提供者类型：

- **`authProviderType`** (字符串)：指定身份验证提供者。可以是以下之一：
  - **`dynamic_discovery`** (默认)：CLI 将自动从服务器发现 OAuth 配置。
  - **`google_credentials`**：CLI 将使用 Google 应用默认凭据 (ADC) 对服务器进行身份验证。使用此提供者时，你必须指定所需的范围。
  - **`service_account_impersonation`**：CLI 将模拟一个 Google Cloud 服务账户来对服务器进行身份验证。这对于访问受 IAP 保护的服务非常有用（这是专门为 Cloud Run 服务设计的）。

#### Google 凭据

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

#### 服务账户模拟

要使用服务账户模拟对服务器进行身份验证，你必须将 `authProviderType` 设置为 `service_account_impersonation`，并提供以下属性：

- **`targetAudience`** (字符串)：在受 IAP 保护的应用程序上白名单的 OAuth 客户端 ID。
- **`targetServiceAccount`** (字符串)：要模拟的 Google Cloud 服务账户的电子邮件地址。

CLI 将使用你的本地应用默认凭据 (ADC) 为指定的服务账户和受众生成一个 OIDC ID 令牌。该令牌随后将用于对 MCP 服务器进行身份验证。

#### 设置说明

1. **[创建](https://cloud.google.com/iap/docs/oauth-client-creation)或使用现有的 OAuth 2.0 客户端 ID。** 要使用现有的 OAuth 2.0 客户端 ID，请遵循[如何共享 OAuth 客户端](https://cloud.google.com/iap/docs/sharing-oauth-clients)中的步骤。
2. **将 OAuth ID 添加到应用程序的[编程访问](https://cloud.google.com/iap/docs/sharing-oauth-clients#programmatic_access)白名单中。** 由于 gcloud iap 尚未支持 Cloud Run 作为资源类型，你必须在项目中白名单该客户端 ID。
3. **创建一个服务账户。** [文档](https://cloud.google.com/iam/docs/service-accounts-create#creating)，[Cloud Console 链接](https://console.cloud.google.com/iam-admin/serviceaccounts)
4. **将服务账户和用户都添加到 IAP 策略**中，可以在 Cloud Run 服务本身的“安全”选项卡中进行，也可以通过 gcloud 进行。
5. **授予所有将访问 MCP 服务器的用户和组**模拟该服务账户所需的权限（即 `roles/iam.serviceAccountTokenCreator`）。
6. **为你的项目[启用](https://console.cloud.google.com/apis/library/iamcredentials.googleapis.com)IAM 凭据 API**。

### 配置示例

#### Python MCP 服务器（Stdio）

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

#### Node.js MCP 服务器（Stdio）

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

#### 基于 Docker 的 MCP 服务器

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

#### 基于 HTTP 的 MCP 服务器

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

#### 带有自定义请求头的基于 HTTP 的 MCP 服务器

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

#### 带有工具过滤的 MCP 服务器

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

### 带有 SA 模拟的 SSE MCP 服务器

```json
{
  "mcpServers": {
    "myIapProtectedServer": {
      "url": "https://my-iap-service.run.app/sse",
      "authProviderType": "service_account_impersonation",
      "targetAudience": "YOUR_IAP_CLIENT_ID.apps.googleusercontent.com",
      "targetServiceAccount": "your-sa@your-project.iam.gserviceaccount.com"
    }
  }
}
```

## 发现过程深入解析

当 Qwen Code 启动时，它会通过以下详细过程执行 MCP 服务器发现：

### 1. 服务器迭代与连接

对于每个在 `mcpServers` 中配置的服务器：

1. **状态跟踪开始：** 服务器状态设置为 `CONNECTING`
2. **传输选择：** 基于配置属性：
   - `httpUrl` → `StreamableHTTPClientTransport`
   - `url` → `SSEClientTransport`
   - `command` → `StdioClientTransport`
3. **连接建立：** MCP 客户端尝试在配置的超时时间内连接
4. **错误处理：** 连接失败被记录，服务器状态设置为 `DISCONNECTED`

### 2. 工具发现

成功连接后：

1. **工具列表：** 客户端调用 MCP 服务器的工具列表端点
2. **模式验证：** 每个工具的函数声明被验证
3. **工具过滤：** 根据 `includeTools` 和 `excludeTools` 配置过滤工具
4. **名称清理：** 工具名称被清理以满足 Qwen API 要求：
   - 无效字符（非字母数字、下划线、点、连字符）被替换为下划线
   - 长度超过 63 个字符的名称被截断，并使用中间替换（`___`）

### 3. 冲突解决

当多个服务器暴露具有相同名称的工具时：

1. **首次注册优先：** 第一个注册工具名称的服务器获得无前缀的名称
2. **自动前缀：** 后续服务器获得带前缀的名称：`serverName__toolName`
3. **注册表跟踪：** 工具注册表维护服务器名称与其工具之间的映射

### 4. 模式处理

工具参数模式会被清理以确保 API 兼容性：

- **`$schema` 属性**被移除
- **`additionalProperties`** 被剥离
- **带有 `default` 的 `anyOf`** 会移除默认值（为了 Vertex AI 兼容性）
- **递归处理**应用于嵌套模式

### 5. 连接管理

发现之后：

- **持久连接：** 成功注册工具的服务器保持其连接
- **清理：** 未提供可用工具的服务器会关闭其连接
- **状态更新：** 最终服务器状态设置为 `CONNECTED` 或 `DISCONNECTED`

## 工具执行流程

当模型决定使用 MCP 工具时，会执行以下流程：

### 1. 工具调用

模型生成一个 `FunctionCall`，包含：

- **工具名称：** 已注册的名称（可能带有前缀）
- **参数：** 与工具参数模式匹配的 JSON 对象

### 2. 确认过程

每个 `DiscoveredMCPTool` 实现复杂的确认逻辑：

#### 基于信任的跳过

```typescript
if (this.trust) {
  return false; // 无需确认
}
```

#### 动态白名单

系统维护内部白名单，针对：

- **服务器级别：** `serverName` → 来自此服务器的所有工具都受信任
- **工具级别：** `serverName.toolName` → 此特定工具受信任

#### 用户选择处理

当需要确认时，用户可以选择：

- **仅执行一次：** 仅本次执行
- **始终允许此工具：** 添加到工具级别白名单
- **始终允许此服务器：** 添加到服务器级别白名单
- **取消：** 中止执行

### 3. 执行

确认后（或信任跳过）：

1. **参数准备：** 参数根据工具的模式进行验证
2. **MCP 调用：** 底层的 `CallableTool` 使用以下格式调用服务器：

   ```typescript
   const functionCalls = [
     {
       name: this.serverToolName, // 原始服务器工具名称
       args: params,
     },
   ];
   ```

3. **响应处理：** 结果格式化为 LLM 上下文和用户展示

### 4. 响应处理

执行结果包含：

- **`llmContent`：** 原始响应部分，供语言模型上下文使用
- **`returnDisplay`：** 格式化的用户展示输出（通常是在 markdown 代码块中的 JSON）

## 如何与你的 MCP 服务器交互

### 使用 `/mcp` 命令

`/mcp` 命令提供关于 MCP 服务器设置的全面信息：

```bash
/mcp
```

它将显示：

- **服务器列表：** 所有已配置的 MCP 服务器
- **连接状态：** `CONNECTED`、`CONNECTING` 或 `DISCONNECTED`
- **服务器详情：** 配置摘要（排除敏感数据）
- **可用工具：** 来自每个服务器的工具列表及其描述
- **发现状态：** 整个发现过程的当前状态

### 示例 `/mcp` 输出

```
MCP 服务器状态：

📡 pythonTools (CONNECTED)
  命令: python -m my_mcp_server --port 8080
  工作目录: ./mcp-servers/python
  超时: 15000ms
  工具: calculate_sum, file_analyzer, data_processor

🔌 nodeServer (DISCONNECTED)
  命令: node dist/server.js --verbose
  错误: 连接被拒绝

🐳 dockerizedServer (CONNECTED)
  命令: docker run -i --rm -e API_KEY my-mcp-server:latest
  工具: docker__deploy, docker__status

发现状态: COMPLETED
```
### 工具使用

MCP 工具被发现后，Qwen 模型可像内置工具一样使用。模型将自动完成以下操作：

1. **根据你的请求选择合适的工具**
2. **显示确认对话框**（除非服务器受信任）
3. **使用正确的参数执行工具**
4. **以友好的格式显示结果**

## 状态监控与故障排除

### 连接状态

MCP 集成会跟踪以下几种状态：

#### 服务器状态（`MCPServerStatus`）

- **`DISCONNECTED`：** 服务器未连接或出错
- **`CONNECTING`：** 正在尝试连接
- **`CONNECTED`：** 服务器已连接并准备就绪

#### 发现状态（`MCPDiscoveryState`）

- **`NOT_STARTED`：** 尚未开始发现
- **`IN_PROGRESS`：** 正在发现服务器
- **`COMPLETED`：** 发现已完成（可能有错误或没有错误）

### 常见问题及解决方法

#### 服务器无法连接

**症状：** 服务器显示 `DISCONNECTED` 状态

**故障排除：**

1. **检查配置：** 确认 `command`、`args` 和 `cwd` 是否正确
2. **手动测试：** 直接运行服务器命令，确保它能正常工作
3. **检查依赖：** 确保所有必需的软件包已安装
4. **查看日志：** 在 CLI 输出中查找错误消息
5. **验证权限：** 确保 CLI 有权限执行服务器命令

#### 未发现任何工具

**症状：** 服务器已连接，但没有任何工具可用

**故障排除：**

1. **验证工具注册：** 确保你的服务器确实注册了工具
2. **检查 MCP 协议：** 确认你的服务器正确实现了 MCP 工具列表功能
3. **查看服务器日志：** 检查 stderr 输出是否有服务器端错误
4. **测试工具列表：** 手动测试服务器上的工具发现端点

#### 工具无法执行

**症状：** 工具被发现，但在执行时失败

**故障排除：**

1. **参数验证：** 确保你的工具接受预期的参数
2. **Schema 兼容性：** 验证你的输入 schema 是否是有效的 JSON Schema
3. **错误处理：** 检查你的工具是否抛出了未捕获的异常
4. **超时问题：** 考虑增加 `timeout` 设置

#### 沙盒兼容性

**症状：** 启用沙盒后 MCP 服务器失败

**解决方法：**

1. **基于 Docker 的服务器：** 使用包含所有依赖的 Docker 容器
2. **路径可访问性：** 确保服务器可执行文件在沙盒中可用
3. **网络访问：** 配置沙盒以允许必要的网络连接
4. **环境变量：** 验证所需的环境变量已传递

### 调试技巧

1. **启用调试模式：** 使用 `--debug` 运行 CLI 以获取详细输出
2. **检查 stderr：** MCP 服务器的 stderr 会被捕获并记录（INFO 消息会被过滤）
3. **隔离测试：** 在集成之前独立测试你的 MCP 服务器
4. **渐进式设置：** 从简单的工具开始，然后再添加复杂功能
5. **频繁使用 `/mcp`：** 开发过程中持续监控服务器状态

## 重要注意事项

### 安全考虑

- **信任设置：** `trust` 选项会绕过所有确认对话框。谨慎使用，仅用于你完全控制的服务器
- **访问令牌：** 配置包含 API 密钥或令牌的环境变量时要注意安全
- **沙盒兼容性：** 使用沙盒时，确保 MCP 服务器在沙盒环境中可用
- **私有数据：** 使用范围过大的个人访问令牌可能导致仓库之间的信息泄露

### 性能与资源管理

- **连接持久性：** CLI 会保持与成功注册工具的服务器之间的持久连接
- **自动清理：** 未提供任何工具的服务器连接会被自动关闭
- **超时管理：** 根据服务器的响应特征配置适当的超时时间
- **资源监控：** MCP 服务器作为独立进程运行，会消耗系统资源

### Schema 兼容性

- **Schema 合规模式：** 默认情况下（`schemaCompliance: "auto"`），工具 schema 会原样传递。在 `settings.json` 中设置 `"model": { "generationConfig": { "schemaCompliance": "openapi_30" } }` 可将模型转换为严格的 OpenAPI 3.0 格式。
- **OpenAPI 3.0 转换：** 启用 `openapi_30` 模式后，系统会处理：
  - Nullable 类型：`["string", "null"]` → `type: "string", nullable: true`
  - Const 值：`const: "foo"` → `enum: ["foo"]`
  - 边界限制：数字类型的 `exclusiveMinimum` → 布尔形式与 `minimum`
  - 关键字移除：`$schema`、`$id`、`dependencies`、`patternProperties`
- **名称清理：** 工具名称会自动清理以满足 API 要求
- **冲突解决：** 服务器之间的工具名称冲突通过自动添加前缀来解决

此综合集成使 MCP 服务器成为一种强大的方式，可以在保持安全性、可靠性和易用性的同时扩展 CLI 的能力。

## 从工具返回丰富的内容

MCP 工具不限于返回简单的文本。你可以在一次工具响应中返回丰富的多部分内容，包括文本、图片、音频以及其他二进制数据。这使得你可以构建功能强大的工具，在一次交互中向模型提供多样化的信息。

从工具返回的所有数据都会被处理并作为上下文发送给模型用于后续生成，从而使模型能够对提供的信息进行推理或总结。

### 工作原理

要返回丰富的内容，你的工具响应必须符合 MCP 规范中的 [`CallToolResult`](https://modelcontextprotocol.io/specification/2025-06-18/server/tools#tool-result)。结果的 `content` 字段应是一个 `ContentBlock` 对象的数组。CLI 会正确处理该数组，将文本与二进制数据分开，并为模型打包。

你可以在 `content` 数组中混合搭配不同的内容块类型。支持的内容块类型包括：

- `text`
- `image`
- `audio`
- `resource`（嵌入内容）
- `resource_link`

### 示例：返回文本和图片

下面是一个有效的 JSON 响应示例，来自一个同时返回文本描述和图片的 MCP 工具：

```json
{
  "content": [
    {
      "type": "text",
      "text": "这是您请求的 Logo。"
    },
    {
      "type": "image",
      "data": "BASE64_ENCODED_IMAGE_DATA_HERE",
      "mimeType": "image/png"
    },
    {
      "type": "text",
      "text": "该 Logo 创建于 2025 年。"
    }
  ]
}
```

当 Qwen Code 收到此响应时，它会：

1. 提取所有文本并将其合并为一个 `functionResponse` 部分提供给模型。
2. 将图片数据作为一个单独的 `inlineData` 部分呈现。
3. 在 CLI 中提供一个干净、友好的摘要，表明已同时收到文本和图片。

这使你可以构建复杂的工具，为 Qwen 模型提供丰富的多模态上下文。

## MCP 提示作为斜杠命令

除了工具之外，MCP 服务器还可以暴露预定义的提示，这些提示可以在 Qwen Code 中作为斜杠命令执行。这使你可以为常见或复杂的查询创建快捷方式，并通过名称轻松调用。

### 在服务器上定义提示

以下是一个 stdio MCP 服务器的小示例，它定义了提示：

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

此提示可以在 `settings.json` 的 `mcpServers` 下添加，如下所示：

```json
{
  "mcpServers": {
    "nodeServer": {
      "command": "node",
      "args": ["filename.ts"]
    }
  }
}
```

### 调用提示

一旦提示被发现，你可以使用其名称作为斜杠命令来调用它。CLI 会自动处理参数解析。

```bash
/poem-writer --title="Qwen Code" --mood="reverent"
```

或者使用位置参数：

```bash
/poem-writer "Qwen Code" reverent
```

运行此命令时，CLI 会在 MCP 服务器上执行 `prompts/get` 方法，并传入提供的参数。服务器负责将参数替换到提示模板中，并返回最终的提示文本。然后 CLI 将该提示发送给模型执行。这提供了一种自动化并共享常见工作流程的便捷方式。

## 使用 `qwen mcp` 管理 MCP 服务器

虽然你可以始终通过手动编辑 `settings.json` 来配置 MCP 服务器，但 CLI 提供了一套方便的命令来以编程方式管理服务器配置。这些命令简化了添加、列出和删除 MCP 服务器的过程，无需直接编辑 JSON 文件。

### 添加服务器（`qwen mcp add`）

`add` 命令会在你的 `settings.json` 中配置一个新的 MCP 服务器。根据作用域（`-s, --scope`），它会被添加到用户配置 `~/.qwen/settings.json` 或项目配置 `.qwen/settings.json` 中。

**命令：**

```bash
qwen mcp add [options] <name> <commandOrUrl> [args...]
```

- `<name>`：服务器的唯一名称。
- `<commandOrUrl>`：要执行的命令（用于 `stdio`）或 URL（用于 `http`/`sse`）。
- `[args...]`：`stdio` 命令的可选参数。

**选项（标志）：**

- `-s, --scope`：配置作用域（user 或 project）。[默认值："project"]
- `-t, --transport`：传输类型（stdio, sse, http）。[默认值："stdio"]
- `-e, --env`：设置环境变量（例如 -e KEY=value）。
- `-H, --header`：为 SSE 和 HTTP 传输设置 HTTP 头部（例如 -H "X-Api-Key: abc123" -H "Authorization: Bearer abc123"）。
- `--timeout`：设置连接超时时间（毫秒）。
- `--trust`：信任服务器（跳过所有工具调用确认提示）。
- `--description`：设置服务器的描述。
- `--include-tools`：一个逗号分隔的列表，包含要包含的工具。
- `--exclude-tools`：一个逗号分隔的列表，包含要排除的工具。
- `--oauth-client-id`：MCP 服务器认证的 OAuth 客户端 ID。
- `--oauth-client-secret`：MCP 服务器认证的 OAuth 客户端密钥。
- `--oauth-redirect-uri`：OAuth 重定向 URI（例如 `https://your-server.com/oauth/callback`）。对于本地设置，默认为 `http://localhost:7777/oauth/callback`。**对于远程部署很重要**：当在远程/云服务器上运行 Qwen Code 时，请设置一个可公开访问的 URL。
- `--oauth-authorization-url`：OAuth 授权 URL。
- `--oauth-token-url`：OAuth 令牌 URL。
- `--oauth-scopes`：OAuth 作用域（逗号分隔）。

#### 添加 stdio 服务器

这是运行本地服务器的默认传输方式。

```bash
# 基本语法
qwen mcp add <name> <command> [args...]

# 示例：添加一个本地服务器
qwen mcp add my-stdio-server -e API_KEY=123 /path/to/server arg1 arg2 arg3

# 示例：添加一个本地 Python 服务器
qwen mcp add python-server python server.py --port 8080
```

#### 添加 HTTP 服务器

此传输方式适用于使用可流式 HTTP 传输的服务器。

```bash
# 基本语法
qwen mcp add --transport http <name> <url>

# 示例：添加一个 HTTP 服务器
qwen mcp add --transport http http-server https://api.example.com/mcp/

# 示例：添加一个带有认证头部的 HTTP 服务器
qwen mcp add --transport http secure-http https://api.example.com/mcp/ --header "Authorization: Bearer abc123"
```

#### 添加 SSE 服务器

此传输方式适用于使用服务器推送事件（SSE）的服务器。

```bash
# 基本语法
qwen mcp add --transport sse <name> <url>

# 示例：添加一个 SSE 服务器
qwen mcp add --transport sse sse-server https://api.example.com/sse/

# 示例：添加一个带有认证头部的 SSE 服务器
qwen mcp add --transport sse secure-sse https://api.example.com/sse/ --header "Authorization: Bearer abc123"

# 示例：添加一个启用 OAuth 的 SSE 服务器
qwen mcp add --transport sse oauth-server https://api.example.com/sse/ \
  --oauth-client-id your-client-id \
  --oauth-redirect-uri https://your-server.com/oauth/callback \
  --oauth-authorization-url https://provider.example.com/authorize \
  --oauth-token-url https://provider.example.com/token
```

### 管理服务器（`/mcp`）

要查看和管理所有已配置的 MCP 服务器，请在交互式 Qwen Code 会话中打开 `/mcp` 对话框。该对话框允许你：

- 查看所有 MCP 服务器及其连接状态
- 启用/禁用服务器
- 重新连接断开的服务器
- 查看每个服务器提供的工具和提示
- 查看服务器日志

**命令：**

```bash
qwen
```

然后输入：

```text
/mcp
```

管理对话框提供了一个可视化界面，显示每个服务器的名称、配置详情、连接状态以及可用的工具/提示。

### 删除服务器（`qwen mcp remove`）

要从配置中删除服务器，请使用 `remove` 命令并指定服务器名称。

**命令：**

```bash
qwen mcp remove <name>
```

**示例：**

```bash
qwen mcp remove my-server
```

这将根据作用域（`-s, --scope`）在相应的 `settings.json` 文件中找到并删除 `mcpServers` 对象中的 "my-server" 条目。