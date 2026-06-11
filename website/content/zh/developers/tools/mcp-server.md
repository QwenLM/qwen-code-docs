# 使用 Qwen Code 配置 MCP 服务器

本文档提供了在 Qwen Code 中配置和使用 Model Context Protocol (MCP) 服务器的指南。

## 什么是 MCP 服务器？

MCP 服务器是一个通过 Model Context Protocol 向 CLI 暴露工具和资源的应用程序，使其能够与外部系统和数据源进行交互。MCP 服务器充当模型与你的本地环境或其他服务（如 API）之间的桥梁。

MCP 服务器使 CLI 能够：

- **发现工具：** 通过标准化的 schema 定义列出可用工具、其描述和参数。
- **执行工具：** 使用定义的参数调用特定工具并接收结构化响应。
- **访问资源：** 从特定资源读取数据（尽管 CLI 主要专注于工具执行）。

借助 MCP 服务器，你可以扩展 CLI 的功能，执行超出其内置特性的操作，例如与数据库、API、自定义脚本或专用工作流进行交互。

## 核心集成架构

Qwen Code 通过内置于核心包（`packages/core/src/tools/`）的高级发现和执行系统与 MCP 服务器集成：

### 发现层（`mcp-client.ts`）

发现过程由 `discoverMcpTools()` 协调，该函数会：

1. **遍历已配置的服务器**：从你的 `settings.json` 中的 `mcpServers` 配置读取
2. **建立连接**：使用适当的传输机制（Stdio、SSE 或 Streamable HTTP）
3. **获取工具定义**：使用 MCP 协议从每个服务器获取
4. **清理并验证**工具 schema，以确保与 Qwen API 兼容
5. **注册工具**：在全局工具注册表中注册，并处理冲突

### 执行层（`mcp-tool.ts`）

每个发现的 MCP 工具都会被包装在一个 `DiscoveredMCPTool` 实例中，该实例会：

- **处理确认逻辑**：基于服务器信任设置和用户偏好
- **管理工具执行**：使用正确的参数调用 MCP 服务器
- **处理响应**：同时适配 LLM 上下文和用户显示
- **维护连接状态**并处理超时

### 传输机制

CLI 支持三种 MCP 传输类型：

- **Stdio 传输：** 生成子进程并通过 stdin/stdout 进行通信
- **SSE 传输：** 连接到 Server-Sent Events 端点
- **Streamable HTTP 传输：** 使用 HTTP 流进行通信

## 如何设置你的 MCP 服务器

Qwen Code 使用 `settings.json` 文件中的 `mcpServers` 配置来定位并连接 MCP 服务器。该配置支持使用不同传输机制的多个服务器。

### 在 settings.json 中配置 MCP 服务器

你可以通过两种主要方式在 `settings.json` 文件中配置 MCP 服务器：通过顶层的 `mcpServers` 对象定义特定服务器，以及通过 `mcp` 对象设置控制服务器发现和执行的全局配置。

#### 全局 MCP 设置（`mcp`）

`settings.json` 中的 `mcp` 对象允许你为所有 MCP 服务器定义全局规则。

- **`mcp.serverCommand`**（string）：用于启动 MCP 服务器的全局命令。
- **`mcp.allowed`**（string 数组）：允许连接的 MCP 服务器名称列表。如果设置了此项，则仅会连接此列表中的服务器（需匹配 `mcpServers` 对象中的键）。
- **`mcp.excluded`**（string 数组）：要排除的 MCP 服务器名称列表。此列表中的服务器将不会被连接。

**示例：**

```json
{
  "mcp": {
    "allowed": ["my-trusted-server"],
    "excluded": ["experimental-server"]
  }
}
```

#### 服务器特定配置（`mcpServers`）

在 `mcpServers` 对象中，你可以定义希望 CLI 连接的每个独立 MCP 服务器。

### 配置结构

将 `mcpServers` 对象添加到你的 `settings.json` 文件中：

```json
{ ...file contains other config objects
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

#### 必填（以下之一）

- **`command`**（string）：Stdio 传输的可执行文件路径
- **`url`**（string）：SSE 端点 URL（例如 `"http://localhost:8080/sse"`）
- **`httpUrl`**（string）：HTTP 流端点 URL

#### 可选

- **`args`**（string[]）：Stdio 传输的命令行参数
- **`headers`**（object）：使用 `url` 或 `httpUrl` 时的自定义 HTTP 请求头
- **`env`**（object）：服务器进程的环境变量。值可以使用 `$VAR_NAME` 或 `${VAR_NAME}` 语法引用环境变量
- **`cwd`**（string）：Stdio 传输的工作目录
- **`timeout`**（number）：请求超时时间（毫秒）（默认值：600,000ms = 10 分钟）
- **`trust`**（boolean）：当为 `true` 时，跳过该服务器的所有工具调用确认（默认值：`false`）
- **`includeTools`**（string[]）：从此 MCP 服务器包含的工具名称列表。指定后，仅此处列出的工具对该服务器可用（白名单行为）。如果未指定，默认启用服务器的所有工具。
- **`excludeTools`**（string[]）：从此 MCP 服务器排除的工具名称列表。即使服务器暴露了这些工具，此处列出的工具也不会对模型可用。**注意：** `excludeTools` 的优先级高于 `includeTools`——如果某个工具同时出现在两个列表中，它将被排除。
- **`targetAudience`**（string）：你尝试访问的受 IAP 保护的应用程序上允许列表中的 OAuth Client ID。与 `authProviderType: 'service_account_impersonation'` 配合使用。
- **`targetServiceAccount`**（string）：要模拟的 Google Cloud Service Account 的电子邮件地址。与 `authProviderType: 'service_account_impersonation'` 配合使用。

### 远程 MCP 服务器的 OAuth 支持

Qwen Code 支持使用 SSE 或 HTTP 传输的远程 MCP 服务器的 OAuth 2.0 身份验证。这实现了对需要身份验证的 MCP 服务器的安全访问。

#### 自动 OAuth 发现

对于支持 OAuth 发现的服务器，你可以省略 OAuth 配置，让 CLI 自动发现：

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

连接到启用 OAuth 的服务器时：

1. **初始连接尝试** 因 401 Unauthorized 失败
2. **OAuth 发现** 找到授权和令牌端点
3. **打开浏览器** 进行用户身份验证（需要本地浏览器访问权限）
4. **授权码** 交换为访问令牌
5. **安全存储令牌** 以供将来使用
6. **连接重试** 使用有效令牌成功

#### 浏览器重定向要求

**重要：** OAuth 身份验证要求重定向 URI 可访问：

- **默认行为**：重定向到 `http://localhost:7777/oauth/callback`（适用于本地设置）
- **自定义重定向 URI**：使用 `--oauth-redirect-uri` 或在 settings.json 中配置 `redirectUri` 以指定其他 URL

对于**远程/云服务器部署**（例如 Web 终端、SSH 会话、云 IDE）：

- 默认的 `localhost` 重定向将**无法**工作
- 你**必须**配置指向公开可访问 URL 的自定义 `redirectUri`
- 用户的浏览器必须能够访问此 URL 并重定向回服务器

远程服务器示例：

```bash
qwen mcp add --transport sse remote-server https://api.example.com/sse/ \
  --oauth-redirect-uri https://your-remote-server.example.com/oauth/callback
```

OAuth 在以下环境中将无法工作：

- 没有浏览器访问权限的无头环境
- 用户浏览器无法访问配置的 `redirectUri` 的环境

#### 管理 OAuth 身份验证

使用 `/mcp auth` 命令管理 OAuth 身份验证：

```bash
# List servers requiring authentication
/mcp auth

# Authenticate with a specific server
/mcp auth serverName

# Re-authenticate if tokens expire
/mcp auth serverName
```

#### OAuth 配置属性

- **`enabled`**（boolean）：为此服务器启用 OAuth
- **`clientId`**（string）：OAuth 客户端标识符（动态注册时为可选）
- **`clientSecret`**（string）：OAuth 客户端密钥（公共客户端为可选）
- **`authorizationUrl`**（string）：OAuth 授权端点（省略时自动发现）
- **`tokenUrl`**（string）：OAuth 令牌端点（省略时自动发现）
- **`scopes`**（string[]）：所需的 OAuth 作用域
- **`redirectUri`**（string）：自定义重定向 URI。**对远程部署至关重要**：默认为 `http://localhost:7777/oauth/callback`。在远程/云服务器上运行 Qwen Code 时，请将其设置为公开可访问的 URL（例如 `https://your-server.com/oauth/callback`）。可通过 `qwen mcp add --oauth-redirect-uri` 或直接在 settings.json 中配置。
- **`tokenParamName`**（string）：SSE URL 中令牌的查询参数名称
- **`audiences`**（string[]）：令牌有效的受众

#### 令牌管理

OAuth 令牌将自动：

- **安全存储** 在 `~/.qwen/mcp-oauth-tokens.json` 中
- **刷新** 过期时（如果提供刷新令牌）
- **验证** 每次连接尝试前
- **清理** 无效或过期时

#### 身份验证提供程序类型

你可以使用 `authProviderType` 属性指定身份验证提供程序类型：

- **`authProviderType`**（string）：指定身份验证提供程序。可以是以下之一：
  - **`dynamic_discovery`**（默认）：CLI 将自动从服务器发现 OAuth 配置。
  - **`google_credentials`**：CLI 将使用 Google Application Default Credentials (ADC) 向服务器进行身份验证。使用此提供程序时，必须指定所需的作用域。
  - **`service_account_impersonation`**：CLI 将模拟 Google Cloud Service Account 向服务器进行身份验证。这对于访问受 IAP 保护的服务非常有用（专为 Cloud Run 服务设计）。

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

#### 服务账号模拟

要使用服务账号模拟向服务器进行身份验证，你必须将 `authProviderType` 设置为 `service_account_impersonation` 并提供以下属性：

- **`targetAudience`**（string）：你尝试访问的受 IAP 保护的应用程序上允许列表中的 OAuth Client ID。
- **`targetServiceAccount`**（string）：要模拟的 Google Cloud Service Account 的电子邮件地址。

CLI 将使用你本地的 Application Default Credentials (ADC) 为指定的服务账号和受众生成 OIDC ID 令牌。然后，该令牌将用于向 MCP 服务器进行身份验证。

#### 设置说明

1. **[创建](https://cloud.google.com/iap/docs/oauth-client-creation)或使用现有的 OAuth 2.0 客户端 ID。** 要使用现有的 OAuth 2.0 客户端 ID，请按照 [如何共享 OAuth 客户端](https://cloud.google.com/iap/docs/sharing-oauth-clients) 中的步骤操作。
2. **将 OAuth ID 添加到应用程序的 [编程访问](https://cloud.google.com/iap/docs/sharing-oauth-clients#programmatic_access) 允许列表中。** 由于 Cloud Run 尚未在 gcloud iap 中作为受支持的资源类型，你必须在项目级别将 Client ID 加入允许列表。
3. **创建服务账号。** [文档](https://cloud.google.com/iam/docs/service-accounts-create#creating)，[Cloud Console 链接](https://console.cloud.google.com/iam-admin/serviceaccounts)
4. **将服务账号和用户添加到 IAP 策略中**，可在 Cloud Run 服务本身的“安全”选项卡中或通过 gcloud 操作。
5. **授予所有将访问 MCP 服务器的用户和组** [模拟服务账号](https://cloud.google.com/docs/authentication/use-service-account-impersonation) 所需的权限（即 `roles/iam.serviceAccountTokenCreator`）。
6. **为你的项目[启用](https://console.cloud.google.com/apis/library/iamcredentials.googleapis.com) IAM Credentials API**。

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

#### 带自定义请求头的基于 HTTP 的 MCP 服务器

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

#### 带工具过滤的 MCP 服务器

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

### 带服务账号模拟的 SSE MCP 服务器

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

## 深入解析发现流程

当 Qwen Code 启动时，它会通过以下详细流程执行 MCP 服务器发现：

### 1. 服务器遍历与连接

对于 `mcpServers` 中配置的每个服务器：

1. **开始状态跟踪：** 服务器状态设置为 `CONNECTING`
2. **选择传输方式：** 基于配置属性：
   - `httpUrl` → `StreamableHTTPClientTransport`
   - `url` → `SSEClientTransport`
   - `command` → `StdioClientTransport`
3. **建立连接：** MCP 客户端尝试在配置的超时时间内连接
4. **错误处理：** 记录连接失败，并将服务器状态设置为 `DISCONNECTED`

### 2. 工具发现

连接成功后：

1. **列出工具：** 客户端调用 MCP 服务器的工具列表端点
2. **Schema 验证：** 验证每个工具的函数声明
3. **过滤工具：** 根据 `includeTools` 和 `excludeTools` 配置过滤工具
4. **名称清理：** 清理工具名称以满足 Qwen API 要求：
   - 无效字符（非字母数字、下划线、点、连字符）将替换为下划线
   - 超过 63 个字符的名称将被截断，中间替换为 `___`

### 3. 冲突解决

当多个服务器暴露同名工具时：

1. **先注册者优先：** 第一个注册工具名称的服务器获得无前缀的名称
2. **自动添加前缀：** 后续服务器获得带前缀的名称：`serverName__toolName`
3. **注册表跟踪：** 工具注册表维护服务器名称与其工具之间的映射

### 4. Schema 处理

工具参数 schema 会经过清理以确保 API 兼容性：

- **移除 `$schema` 属性**
- **剥离 `additionalProperties`**
- **移除带有 `default` 的 `anyOf` 的默认值**（Vertex AI 兼容性）
- **递归处理** 应用于嵌套 schema

### 5. 连接管理

发现完成后：

- **持久连接：** 成功注册工具的服务器将保持连接
- **清理：** 未提供可用工具的服务器将关闭连接
- **状态更新：** 最终服务器状态设置为 `CONNECTED` 或 `DISCONNECTED`

## 工具执行流程

当模型决定使用 MCP 工具时，将发生以下执行流程：

### 1. 工具调用

模型会生成一个包含以下内容的 `FunctionCall`：

- **工具名称：** 注册名称（可能带有前缀）
- **参数：** 与工具参数 schema 匹配的 JSON 对象

### 2. 确认流程

每个 `DiscoveredMCPTool` 都实现了复杂的确认逻辑：

#### 基于信任的绕过

```typescript
if (this.trust) {
  return false; // No confirmation needed
}
```

#### 动态白名单

系统维护内部白名单用于：

- **服务器级别：** `serverName` → 信任该服务器的所有工具
- **工具级别：** `serverName.toolName` → 信任该特定工具

#### 用户选择处理

当需要确认时，用户可以选择：

- **仅执行一次：** 仅本次执行
- **始终允许此工具：** 添加到工具级别白名单
- **始终允许此服务器：** 添加到服务器级别白名单
- **取消：** 中止执行

### 3. 执行

确认后（或信任绕过）：

1. **参数准备：** 根据工具的 schema 验证参数
2. **MCP 调用：** 底层的 `CallableTool` 使用以下参数调用服务器：

   ```typescript
   const functionCalls = [
     {
       name: this.serverToolName, // Original server tool name
       args: params,
     },
   ];
   ```

3. **响应处理：** 将结果格式化为 LLM 上下文和用户显示格式

### 4. 响应处理

执行结果包含：

- **`llmContent`：** 语言模型上下文的原始响应部分
- **`returnDisplay`：** 供用户显示的格式化输出（通常是 Markdown 代码块中的 JSON）

## 如何与你的 MCP 服务器交互

### 使用 `/mcp` 命令

`/mcp` 命令提供有关你的 MCP 服务器设置的全面信息：

```bash
/mcp
```

这将显示：

- **服务器列表：** 所有已配置的 MCP 服务器
- **连接状态：** `CONNECTED`、`CONNECTING` 或 `DISCONNECTED`
- **服务器详情：** 配置摘要（排除敏感数据）
- **可用工具：** 每个服务器的工具列表及其描述
- **发现状态：** 整体发现流程状态

### `/mcp` 输出示例

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

发现后，MCP 工具将像内置工具一样对 Qwen 模型可用。模型将自动：

1. **根据你的请求选择合适的工具**
2. **显示确认对话框**（除非服务器受信任）
3. **使用正确的参数执行工具**
4. **以用户友好的格式显示结果**

## 状态监控与故障排除

### 连接状态

MCP 集成会跟踪多种状态：

#### 服务器状态（`MCPServerStatus`）

- **`DISCONNECTED`：** 服务器未连接或存在错误
- **`CONNECTING`：** 正在尝试连接
- **`CONNECTED`：** 服务器已连接并准备就绪

#### 发现状态（`MCPDiscoveryState`）

- **`NOT_STARTED`：** 尚未开始发现
- **`IN_PROGRESS`：** 正在发现服务器
- **`COMPLETED`：** 发现已完成（无论是否有错误）

### 常见问题与解决方案

#### 服务器无法连接

**症状：** 服务器显示 `DISCONNECTED` 状态

**故障排除：**

1. **检查配置：** 验证 `command`、`args` 和 `cwd` 是否正确
2. **手动测试：** 直接运行服务器命令以确保其正常工作
3. **检查依赖项：** 确保已安装所有必需的包
4. **查看日志：** 在 CLI 输出中查找错误消息
5. **验证权限：** 确保 CLI 可以执行服务器命令

#### 未发现工具

**症状：** 服务器已连接但无可用工具

**故障排除：**

1. **验证工具注册：** 确保你的服务器实际注册了工具
2. **检查 MCP 协议：** 确认你的服务器正确实现了 MCP 工具列表功能
3. **查看服务器日志：** 检查 stderr 输出以查找服务器端错误
4. **测试工具列表：** 手动测试服务器的工具发现端点

#### 工具无法执行

**症状：** 工具已发现但在执行期间失败

**故障排除：**

1. **参数验证：** 确保你的工具接受预期的参数
2. **Schema 兼容性：** 验证你的输入 schema 是否为有效的 JSON Schema
3. **错误处理：** 检查你的工具是否抛出了未处理的异常
4. **超时问题：** 考虑增加 `timeout` 设置

#### 沙盒兼容性

**症状：** 启用沙盒时 MCP 服务器失败

**解决方案：**

1. **基于 Docker 的服务器：** 使用包含所有依赖项的 Docker 容器
2. **路径可访问性：** 确保服务器可执行文件在沙盒中可用
3. **网络访问：** 配置沙盒以允许必要的网络连接
4. **环境变量：** 验证所需的环境变量是否已传递

### 调试技巧

1. **启用调试模式：** 使用 `--debug` 运行 CLI 以获取详细输出
2. **检查 stderr：** MCP 服务器的 stderr 会被捕获并记录（INFO 消息已过滤）
3. **隔离测试：** 在集成之前独立测试你的 MCP 服务器
4. **渐进式设置：** 在添加复杂功能之前，先从简单工具开始
5. **频繁使用 `/mcp`：** 在开发期间监控服务器状态

## 重要说明

### 安全注意事项

- **信任设置：** `trust` 选项会绕过所有确认对话框。请谨慎使用，仅用于你完全控制的服务器
- **访问令牌：** 在配置包含 API 密钥或令牌的环境变量时，请保持安全意识
- **沙盒兼容性：** 使用沙盒时，确保 MCP 服务器在沙盒环境中可用
- **私有数据：** 使用作用域过宽的个人访问令牌可能导致仓库之间的信息泄露

### 性能与资源管理

- **连接持久化：** CLI 会保持与成功注册工具的服务器的持久连接
- **自动清理：** 与未提供工具的服务器的连接将自动关闭
- **超时管理：** 根据服务器的响应特性配置适当的超时时间
- **资源监控：** MCP 服务器作为独立进程运行并消耗系统资源

### Schema 兼容性

- **Schema 合规模式：** 默认情况下（`schemaCompliance: "auto"`），工具 schema 将原样传递。在 `settings.json` 中设置 `"model": { "generationConfig": { "schemaCompliance": "openapi_30" } }` 可将模型转换为严格的 OpenAPI 3.0 格式。
- **OpenAPI 3.0 转换：** 启用 `openapi_30` 模式时，系统会处理：
  - 可空类型：`["string", "null"]` -> `type: "string", nullable: true`
  - 常量值：`const: "foo"` -> `enum: ["foo"]`
  - 独占限制：数值型 `exclusiveMinimum` -> 带 `minimum` 的布尔形式
  - 关键字移除：`$schema`、`$id`、`dependencies`、`patternProperties`
- **名称清理：** 工具名称会自动清理以满足 API 要求
- **冲突解决：** 服务器之间的工具名称冲突通过自动添加前缀解决

这种全面的集成使 MCP 服务器成为扩展 CLI 功能的强大方式，同时保持了安全性、可靠性和易用性。

## 从工具返回富文本内容

MCP 工具不仅限于返回简单文本。你可以在单个工具响应中返回丰富的多部分内容，包括文本、图像、音频和其他二进制数据。这使你能够构建强大的工具，在单次交互中为模型提供多样化的信息。

从工具返回的所有数据都会被处理并作为上下文发送给模型，用于其下一次生成，使其能够推理或总结所提供的信息。

### 工作原理

要返回富文本内容，你的工具响应必须遵循 MCP 规范中的 [`CallToolResult`](https://modelcontextprotocol.io/specification/2025-06-18/server/tools#tool-result)。结果的 `content` 字段应为 `ContentBlock` 对象数组。CLI 将正确处理此数组，将文本与二进制数据分离并打包发送给模型。

你可以在 `content` 数组中混合搭配不同的内容块类型。支持的块类型包括：

- `text`
- `image`
- `audio`
- `resource`（嵌入内容）
- `resource_link`

### 示例：返回文本和图像

以下是 MCP 工具返回文本描述和图像的有效 JSON 响应示例：

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

当 Qwen Code 收到此响应时，它将：

1. 提取所有文本并将其合并为单个 `functionResponse` 部分发送给模型。
2. 将图像数据作为单独的 `inlineData` 部分呈现。
3. 在 CLI 中提供清晰、用户友好的摘要，表明已收到文本和图像。

这使你能够构建复杂的工具，为 Qwen 模型提供丰富的多模态上下文。

## 将 MCP 提示词作为斜杠命令

除了工具之外，MCP 服务器还可以暴露预定义的提示词，这些提示词可以在 Qwen Code 中作为斜杠命令执行。这使你能够为常见或复杂的查询创建快捷方式，并通过名称轻松调用。

### 在服务器上定义提示词

以下是定义提示词的 stdio MCP 服务器的小型示例：

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

可以通过以下方式将其包含在 `settings.json` 的 `mcpServers` 下：

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

### 调用提示词

发现提示词后，你可以使用其名称作为斜杠命令来调用它。CLI 将自动处理参数解析。

```bash
/poem-writer --title="Qwen Code" --mood="reverent"
```

或使用位置参数：

```bash
/poem-writer "Qwen Code" reverent
```

运行此命令时，CLI 会使用提供的参数在 MCP 服务器上执行 `prompts/get` 方法。服务器负责将参数替换到提示词模板中并返回最终的提示词文本。然后，CLI 将此提示词发送给模型执行。这提供了一种自动化和共享常见工作流的便捷方式。

## 使用 `qwen mcp` 管理 MCP 服务器

虽然你始终可以通过手动编辑 `settings.json` 文件来配置 MCP 服务器，但 CLI 提供了一组便捷的命令，以编程方式管理你的服务器配置。这些命令简化了添加、列出和删除 MCP 服务器的流程，无需直接编辑 JSON 文件。

### 添加服务器（`qwen mcp add`）

`add` 命令在你的 `settings.json` 中配置新的 MCP 服务器。根据作用域（`-s, --scope`），它将被添加到用户配置 `~/.qwen/settings.json` 或项目配置 `.qwen/settings.json` 文件中。

**命令：**

```bash
qwen mcp add [options] <name> <commandOrUrl> [args...]
```

- `<name>`：服务器的唯一名称。
- `<commandOrUrl>`：要执行的命令（用于 `stdio`）或 URL（用于 `http`/`sse`）。
- `[args...]`：`stdio` 命令的可选参数。

**选项（标志）：**

- `-s, --scope`：配置作用域（用户或项目）。[默认值："project"]
- `-t, --transport`：传输类型（stdio、sse、http）。[默认值："stdio"]
- `-e, --env`：设置环境变量（例如 `-e KEY=value`）。
- `-H, --header`：为 SSE 和 HTTP 传输设置 HTTP 请求头（例如 `-H "X-Api-Key: abc123" -H "Authorization: Bearer abc123"`）。
- `--timeout`：设置连接超时时间（毫秒）。
- `--trust`：信任服务器（绕过所有工具调用确认提示）。
- `--description`：设置服务器的描述。
- `--include-tools`：要包含的工具的逗号分隔列表。
- `--exclude-tools`：要排除的工具的逗号分隔列表。
- `--oauth-client-id`：用于 MCP 服务器身份验证的 OAuth 客户端 ID。
- `--oauth-client-secret`：用于 MCP 服务器身份验证的 OAuth 客户端密钥。
- `--oauth-redirect-uri`：OAuth 重定向 URI（例如 `https://your-server.com/oauth/callback`）。本地设置默认为 `http://localhost:7777/oauth/callback`。**对远程部署至关重要**：在远程/云服务器上运行 Qwen Code 时，请将其设置为公开可访问的 URL。
- `--oauth-authorization-url`：OAuth 授权 URL。
- `--oauth-token-url`：OAuth 令牌 URL。
- `--oauth-scopes`：OAuth 作用域（逗号分隔）。

#### 添加 stdio 服务器

这是运行本地服务器的默认传输方式。

```bash
# Basic syntax
qwen mcp add <name> <command> [args...]

# Example: Adding a local server
qwen mcp add my-stdio-server -e API_KEY=123 /path/to/server arg1 arg2 arg3

# Example: Adding a local python server
qwen mcp add python-server python server.py --port 8080
```

#### 添加 HTTP 服务器

此传输方式适用于使用 streamable HTTP 传输的服务器。

```bash
# Basic syntax
qwen mcp add --transport http <name> <url>

# Example: Adding an HTTP server
qwen mcp add --transport http http-server https://api.example.com/mcp/

# Example: Adding an HTTP server with an authentication header
qwen mcp add --transport http secure-http https://api.example.com/mcp/ --header "Authorization: Bearer abc123"
```

#### 添加 SSE 服务器

此传输方式适用于使用 Server-Sent Events (SSE) 的服务器。

```bash
# Basic syntax
qwen mcp add --transport sse <name> <url>

# Example: Adding an SSE server
qwen mcp add --transport sse sse-server https://api.example.com/sse/

# Example: Adding an SSE server with an authentication header
qwen mcp add --transport sse secure-sse https://api.example.com/sse/ --header "Authorization: Bearer abc123"

# Example: Adding an OAuth-enabled SSE server
qwen mcp add --transport sse oauth-server https://api.example.com/sse/ \
  --oauth-client-id your-client-id \
  --oauth-redirect-uri https://your-server.com/oauth/callback \
  --oauth-authorization-url https://provider.example.com/authorize \
  --oauth-token-url https://provider.example.com/token
```

### 管理服务器（`qwen mcp`）

要查看和管理当前配置的所有 MCP 服务器，请使用 `manage` 命令或直接运行 `qwen mcp`。这将打开一个交互式 TUI 对话框，你可以在其中：

- 查看所有 MCP 服务器及其连接状态
- 启用/禁用服务器
- 重新连接已断开的服务器
- 查看每个服务器提供的工具和提示词
- 查看服务器日志

**命令：**

```bash
qwen mcp
# or
qwen mcp manage
```

管理对话框提供了一个可视化界面，显示每个服务器的名称、配置详情、连接状态以及可用的工具/提示词。

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

这将根据作用域（`-s, --scope`）在相应的 `settings.json` 文件的 `mcpServers` 对象中查找并删除 "my-server" 条目。