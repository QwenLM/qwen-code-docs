# 使用 Qwen Code 的 MCP 服务器

本文档提供了在 Qwen Code 中配置和使用模型上下文协议（MCP）服务器的指南。

## 什么是 MCP 服务器？

MCP 服务器是一种通过“模型上下文协议”（Model Context Protocol）向 CLI 暴露工具和资源的应用程序，使 CLI 能够与外部系统及数据源交互。MCP 服务器充当模型与本地环境或其他服务（例如 API）之间的桥梁。

借助 MCP 服务器，CLI 可以实现以下能力：

- **发现工具**：通过标准化的模式定义，列出可用工具及其描述和参数。
- **执行工具**：使用指定参数调用特定工具，并接收结构化的响应。
- **访问资源**：读取特定资源中的数据（不过 CLI 主要聚焦于工具执行）。

通过 MCP 服务器，您可以扩展 CLI 的功能，使其能够执行超出内置功能范围的操作，例如与数据库、API、自定义脚本或专用工作流进行交互。

## 核心集成架构

Qwen Code 通过内置在核心包（`packages/core/src/tools/`）中的复杂发现与执行系统，与 MCP 服务器集成：

### 发现层（`mcp-client.ts`）

发现流程由 `discoverMcpTools()` 函数协调完成，其主要步骤如下：

1. **遍历配置的服务器**：依次处理 `settings.json` 中 `mcpServers` 配置项所定义的服务器列表  
2. **建立连接**：使用适当的传输机制（标准输入输出 Stdio、服务器发送事件 SSE 或可流式传输的 HTTP）连接各服务器  
3. **获取工具定义**：依据 MCP 协议，从每个服务器拉取工具定义  
4. **清洗并校验**：对工具 Schema 进行清洗和校验，确保其与 Qwen API 兼容  
5. **注册工具**：将工具注册至全局工具注册表，并处理命名冲突

### 执行层（`mcp-tool.ts`）

每个发现的 MCP 工具都会被封装为一个 `DiscoveredMCPTool` 实例，该实例负责：

- **处理确认逻辑**：依据服务器信任设置和用户偏好决定是否需要确认  
- **管理工具执行**：使用正确的参数调用 MCP 服务器  
- **处理响应结果**：同时适配大语言模型（LLM）上下文与用户界面显示  
- **维护连接状态**：并处理超时等异常情况  

### 传输机制

CLI 支持三种 MCP 传输类型：

- **标准输入/输出（Stdio）传输**：启动子进程，并通过 `stdin`/`stdout` 进行通信  
- **服务端推送事件（SSE）传输**：连接至 Server-Sent Events 端点  
- **可流式 HTTP 传输**：使用 HTTP 流式传输进行通信  

## 如何配置你的 MCP 服务器

Qwen Code 通过 `settings.json` 文件中的 `mcpServers` 配置项来定位并连接 MCP 服务器。该配置支持多个服务器，且每个服务器可使用不同的传输机制。

### 在 `settings.json` 中配置 MCP 服务器

你可以在 `settings.json` 文件中通过两种主要方式配置 MCP 服务器：一种是通过顶层的 `mcpServers` 对象定义特定服务器；另一种是通过 `mcp` 对象配置控制服务器发现与执行的全局设置。

#### 全局 MCP 设置（`mcp`）

`settings.json` 中的 `mcp` 对象允许你为所有 MCP 服务器定义全局规则。

- **`mcp.serverCommand`**（字符串）：用于启动 MCP 服务器的全局命令。
- **`mcp.allowed`**（字符串数组）：允许连接的 MCP 服务器名称列表。若设置了该字段，则仅会连接此列表中包含的服务器（即与 `mcpServers` 对象中的键名匹配的服务器）。
- **`mcp.excluded`**（字符串数组）：禁止连接的 MCP 服务器名称列表。此列表中的服务器将不会被连接。

**示例：**

```json
{
  "mcp": {
    "allowed": ["my-trusted-server"],
    "excluded": ["experimental-server"]
  }
}
```

#### 服务器专属配置（`mcpServers`）

`mcpServers` 对象用于定义 CLI 需要连接的各个独立 MCP 服务器。

### 配置结构

在 `settings.json` 文件中添加一个 `mcpServers` 对象：

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

#### 必填项（以下任选其一）

- **`command`**（字符串）：用于 Stdio 传输的可执行文件路径  
- **`url`**（字符串）：SSE 端点 URL（例如 `"http://localhost:8080/sse"`）  
- **`httpUrl`**（字符串）：HTTP 流式传输端点 URL

#### 可选参数

- **`args`**（字符串数组）：Stdio 传输方式的命令行参数  
- **`headers`**（对象）：使用 `url` 或 `httpUrl` 时的自定义 HTTP 请求头  
- **`env`**（对象）：服务器进程的环境变量。值中可使用 `$VAR_NAME` 或 `${VAR_NAME}` 语法引用其他环境变量  
- **`cwd`**（字符串）：Stdio 传输方式的工作目录  
- **`timeout`**（数字）：请求超时时间（毫秒），默认为 `600000` 毫秒（即 10 分钟）  
- **`trust`**（布尔值）：若设为 `true`，则跳过对该服务器的所有工具调用确认（默认为 `false`）  
- **`includeTools`**（字符串数组）：从此 MCP 服务器中启用的工具名称列表。若指定该字段，则仅列表中所列工具对该服务器可用（白名单行为）；若未指定，则默认启用该服务器提供的全部工具。  
- **`excludeTools`**（字符串数组）：从此 MCP 服务器中禁用的工具名称列表。列表中所列工具对模型不可用，即使服务器本身暴露了这些工具。**注意：** `excludeTools` 的优先级高于 `includeTools` —— 若某工具同时出现在两个列表中，它将被排除。  
- **`targetAudience`**（字符串）：您尝试访问的 IAP 保护应用上已加入白名单的 OAuth 客户端 ID。与 `authProviderType: 'service_account_impersonation'` 配合使用。  
- **`targetServiceAccount`**（字符串）：要模拟的 Google Cloud 服务账号的邮箱地址。与 `authProviderType: 'service_account_impersonation'` 配合使用。

### 远程 MCP 服务器的 OAuth 支持

Qwen Code 支持通过 SSE 或 HTTP 传输协议，为远程 MCP 服务器使用 OAuth 2.0 认证。这使得能够安全访问需要身份验证的 MCP 服务器。

#### 自动 OAuth 发现

对于支持 OAuth 发现的服务器，你可以省略 OAuth 配置，交由 CLI 自动发现：

```json
{
  "mcpServers": {
    "discoveredServer": {
      "url": "https://api.example.com/sse"
    }
  }
}
```

CLI 将自动执行以下操作：

- 检测服务器是否需要 OAuth 认证（例如返回 401 响应）
- 从服务器元数据中发现 OAuth 端点
- 如受支持，则执行动态客户端注册
- 处理 OAuth 流程及令牌管理

#### 认证流程

连接到启用 OAuth 的服务器时：

1. **首次连接尝试** 会因“401 未授权”而失败  
2. **OAuth 发现机制** 查找授权端点和令牌端点  
3. **浏览器自动打开**，用于用户身份验证（需本地可访问浏览器）  
4. **授权码** 被交换为访问令牌（access token）  
5. **令牌被安全存储**，供后续请求复用  
6. **重试连接** 使用有效令牌后成功  

#### 浏览器重定向要求

**重要提示：** OAuth 认证要求你的本地机器满足以下条件：

- 可打开 Web 浏览器完成身份验证  
- 能接收发往 `http://localhost:7777/oauth/callback` 的重定向请求  

该功能在以下环境中**不可用**：

- 无浏览器访问能力的无头环境（headless environments）  
- 未启用 X11 转发的远程 SSH 会话  
- 不支持浏览器的容器化环境  

#### 管理 OAuth 认证

使用 `/mcp auth` 命令管理 OAuth 认证：

```bash

# 列出需要认证的服务器
/mcp auth

# 使用特定服务器进行身份验证
/mcp auth serverName

# 如果令牌过期则重新进行身份验证
/mcp auth serverName
```

#### OAuth 配置属性

- **`enabled`**（布尔值）：为此服务器启用 OAuth
- **`clientId`**（字符串）：OAuth 客户端标识符（使用动态注册时可选）
- **`clientSecret`**（字符串）：OAuth 客户端密钥（公开客户端可选）
- **`authorizationUrl`**（字符串）：OAuth 授权端点（如省略则自动发现）
- **`tokenUrl`**（字符串）：OAuth 令牌端点（如省略则自动发现）
- **`scopes`**（字符串数组）：必需的 OAuth 权限范围
- **`redirectUri`**（字符串）：自定义重定向 URI（默认为 `http://localhost:7777/oauth/callback`）
- **`tokenParamName`**（字符串）：SSE URL 中用于传递令牌的查询参数名
- **`audiences`**（字符串数组）：令牌有效的受众列表

#### 令牌管理

OAuth 令牌会自动执行以下操作：

- **安全存储**在 `~/.qwen/mcp-oauth-tokens.json` 中  
- **过期时刷新**（若存在刷新令牌）  
- **每次连接前验证**有效性  
- **失效或过期时清理**

#### 认证提供程序类型

你可以通过 `authProviderType` 属性指定认证提供程序类型：

- **`authProviderType`**（字符串）：指定认证提供程序。可选值如下：
  - **`dynamic_discovery`**（默认）：CLI 将自动从服务器发现 OAuth 配置。
  - **`google_credentials`**：CLI 将使用 Google 应用默认凭据（ADC）向服务器进行身份验证。使用此提供程序时，你必须指定所需的访问范围（scopes）。
  - **`service_account_impersonation`**：CLI 将以 Google Cloud 服务账号的身份进行模拟，从而向服务器进行身份验证。该方式适用于访问受 IAP 保护的服务（专为 Cloud Run 服务设计）。

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

若要使用服务账号模拟对服务器进行身份验证，必须将 `authProviderType` 设置为 `service_account_impersonation`，并提供以下属性：

- **`targetAudience`**（字符串）：OAuth 客户端 ID，该 ID 已在您尝试访问的 IAP 保护应用中加入白名单。
- **`targetServiceAccount`**（字符串）：要模拟的 Google Cloud 服务账号的电子邮件地址。

CLI 将使用本地的应用默认凭据（ADC）为指定的服务账号和受众生成 OIDC ID 令牌。该令牌随后将用于向 MCP 服务器进行身份验证。

#### 设置说明

1. **[创建](https://cloud.google.com/iap/docs/oauth-client-creation) OAuth 2.0 客户端 ID，或复用已有的客户端 ID。** 若复用现有 OAuth 2.0 客户端 ID，请参阅 [如何共享 OAuth 客户端](https://cloud.google.com/iap/docs/sharing-oauth-clients) 中的步骤。
2. **将 OAuth 客户端 ID 添加到应用的 [程序化访问](https://cloud.google.com/iap/docs/sharing-oauth-clients#programmatic_access) 允许列表中。** 由于 Cloud Run 当前尚不被 `gcloud iap` 命令支持为资源类型，因此必须在项目级别对客户端 ID 进行允许列表设置。
3. **创建服务账号。** [相关文档](https://cloud.google.com/iam/docs/service-accounts-create#creating)，[Cloud Console 链接](https://console.cloud.google.com/iam-admin/serviceaccounts)
4. **在 Cloud Run 服务自身的“安全”标签页中，或通过 `gcloud` 命令，将服务账号和用户均添加至 IAP 策略。**
5. **向所有将访问 MCP Server 的用户和用户组授予必要的权限，使其能够 [代入该服务账号](https://cloud.google.com/docs/authentication/use-service-account-impersonation)（即 `roles/iam.serviceAccountTokenCreator` 角色）。**
6. **为您的项目 [启用](https://console.cloud.google.com/apis/library/iamcredentials.googleapis.com) IAM 凭据 API。**

### 示例配置

#### Python MCP 服务器（标准输入/输出）

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

#### Node.js MCP 服务器（标准输入/输出）

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

#### 支持工具过滤的 MCP 服务器

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

### 使用服务账号模拟的 SSE MCP 服务器

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

Qwen Code 启动时，会通过以下详细流程执行 MCP 服务器发现：

### 1. 服务端迭代与连接

对 `mcpServers` 中配置的每个服务端：

1. **开始状态跟踪：** 将服务端状态设为 `CONNECTING`
2. **传输方式选择：** 根据配置属性决定：
   - `httpUrl` → `StreamableHTTPClientTransport`
   - `url` → `SSEClientTransport`
   - `command` → `StdioClientTransport`
3. **建立连接：** MCP 客户端尝试在配置的超时时间内完成连接
4. **错误处理：** 连接失败将被记录，且服务端状态设为 `DISCONNECTED`

### 2. 工具发现

连接成功后：

1. **工具列表获取：** 客户端调用 MCP 服务器的工具列表接口
2. **Schema 校验：** 对每个工具的函数声明进行校验
3. **工具过滤：** 根据 `includeTools` 和 `excludeTools` 配置对工具进行过滤
4. **名称规范化：** 对工具名称进行清洗以满足 Qwen API 要求：
   - 将非法字符（非字母、数字、下划线、点号、短横线）替换为下划线
   - 名称长度超过 63 个字符时，采用中间截断方式并用 `___` 替代（即保留前缀和后缀，中间替换为 `___`）

### 3. 冲突解决

当多个服务器暴露同名工具时：

1. **先注册者优先：** 首个注册该工具名称的服务器获得无前缀的原始名称
2. **自动添加前缀：** 后续注册的服务器所暴露的同名工具将被自动加上前缀：`serverName__toolName`
3. **注册表追踪：** 工具注册表维护服务器名称与其所暴露工具之间的映射关系

### 4. 模式处理

工具参数模式会经过清理，以确保与 API 兼容：

- 移除 **`$schema`** 属性
- 移除 **`additionalProperties`**
- 对于含 `default` 的 **`anyOf`**，移除其默认值（适配 Vertex AI）
- 对嵌套模式执行 **递归处理**

### 5. 连接管理

完成发现后：

- **持久连接：** 成功注册工具的服务器将保持其连接
- **清理：** 未提供任何可用工具的服务器，其连接将被关闭
- **状态更新：** 各服务器的最终状态被设为 `CONNECTED` 或 `DISCONNECTED`

## 工具执行流程

当模型决定使用 MCP 工具时，将按以下流程执行：

### 1. 工具调用

模型生成一个 `FunctionCall`，其中包含：

- **工具名称：** 已注册的名称（可能带有前缀）
- **参数：** 符合该工具参数模式的 JSON 对象

### 2. 确认流程

每个 `DiscoveredMCPTool` 都实现了复杂的确认逻辑：

#### 基于信任的绕过

```typescript
if (this.trust) {
  return false; // 无需确认
}
```

#### 动态白名单机制

系统在内部维护以下白名单：

- **服务端级别：** `serverName` → 来自该服务端的所有工具均被信任  
- **工具级别：** `serverName.toolName` → 仅该特定工具被信任

#### 用户选择处理

当需要确认时，用户可选择：

- **仅本次执行：** 仅在当前执行一次  
- **始终允许此工具：** 将其加入工具级白名单  
- **始终允许此服务端：** 将其加入服务端级白名单  
- **取消：** 中止执行

### 3. 执行

确认（或跳过信任检查）后：

1. **参数准备：** 根据工具的 Schema 对参数进行校验  
2. **MCP 调用：** 底层 `CallableTool` 向服务器发起调用，传入如下数据：

   ```typescript
   const functionCalls = [
     {
       name: this.serverToolName, // 原始服务器工具名称
       args: params,
     },
   ];
   ```

3. **响应处理：** 将结果分别格式化为供大语言模型（LLM）上下文使用和供用户显示的内容  

### 4. 响应处理

执行结果包含以下字段：

- **`llmContent`：** 供语言模型上下文使用的原始响应内容  
- **`returnDisplay`：** 供用户显示的格式化输出（通常为 Markdown 代码块中的 JSON 格式）

## 如何与你的 MCP 服务器交互

### 使用 `/mcp` 命令

`/mcp` 命令提供有关你的 MCP 服务器配置的完整信息：

```bash
/mcp
```

该命令输出以下内容：

- **服务器列表**：所有已配置的 MCP 服务器  
- **连接状态**：`CONNECTED`（已连接）、`CONNECTING`（正在连接）或 `DISCONNECTED`（未连接）  
- **服务器详情**：配置摘要（不包含敏感数据）  
- **可用工具**：各服务器提供的工具列表及其说明  
- **发现状态**：整体服务发现流程的状态  

### `/mcp` 命令输出示例

```
MCP 服务器状态：

📡 pythonTools（已连接）
  命令：python -m my_mcp_server --port 8080
  工作目录：./mcp-servers/python
  超时时间：15000ms
  工具：calculate_sum、file_analyzer、data_processor

🔌 nodeServer（未连接）
  命令：node dist/server.js --verbose
  错误：连接被拒绝

🐳 dockerizedServer（已连接）
  命令：docker run -i --rm -e API_KEY my-mcp-server:latest
  工具：docker__deploy、docker__status

发现状态：已完成
```

### 工具使用

发现 MCP 工具后，Qwen 模型即可像使用内置工具一样调用它们。模型将自动执行以下操作：

1. **根据你的请求选择合适的工具**
2. **弹出确认对话框**（除非服务器已被标记为可信）
3. **使用正确的参数执行工具**
4. **以用户友好的格式展示结果**

## 状态监控与故障排查

### 连接状态

MCP 集成会跟踪多种状态：

#### 服务器状态（`MCPServerStatus`）

- **`DISCONNECTED`（已断开）：** 服务器未连接或发生错误
- **`CONNECTING`（正在连接）：** 正在尝试建立连接
- **`CONNECTED`（已连接）：** 服务器已成功连接并就绪

#### 发现状态（`MCPDiscoveryState`）

- **`NOT_STARTED`（未开始）：** 尚未启动发现流程
- **`IN_PROGRESS`（进行中）：** 正在发现服务器
- **`COMPLETED`（已完成）：** 发现流程已完成（无论是否出现错误）

### 常见问题与解决方案

#### 服务器无法连接

**现象：** 服务器状态显示为 `DISCONNECTED`

**排查步骤：**

1. **检查配置：** 确认 `command`、`args` 和 `cwd` 配置正确
2. **手动测试：** 直接运行服务器命令，验证其能否正常启动
3. **检查依赖项：** 确保所有必需的包均已安装
4. **查看日志：** 检查 CLI 输出中是否存在错误信息
5. **验证权限：** 确保 CLI 具有执行服务器命令的权限

#### 未发现任何工具

**现象：** 服务器已连接，但无任何工具可用

**排查步骤：**

1. **验证工具注册：** 确保服务器确实注册了工具
2. **检查 MCP 协议：** 确认服务器正确实现了 MCP 工具列表功能
3. **查看服务器日志：** 检查 stderr 输出中是否存在服务端错误
4. **测试工具列表功能：** 手动调用服务器的工具发现端点进行测试

#### 工具未执行

**现象：** 工具被成功发现，但在执行时失败

**排查步骤：**

1. **参数验证：** 确保你的工具接受预期的参数  
2. **Schema 兼容性：** 验证你的输入 Schema 符合有效的 JSON Schema 规范  
3. **错误处理：** 检查工具是否抛出了未捕获的异常  
4. **超时问题：** 考虑增大 `timeout` 配置值  

#### 沙箱兼容性

**现象：** 启用沙箱后，MCP 服务器启动失败  

**解决方案：**

1. **基于 Docker 的服务器：** 使用包含所有依赖项的 Docker 容器  
2. **路径可访问性：** 确保服务器可执行文件在沙箱环境中可用  
3. **网络访问：** 配置沙箱以允许必要的网络连接  
4. **环境变量：** 确认所需环境变量已正确传递至沙箱

### 调试技巧

1. **启用调试模式：** 使用 `--debug` 参数运行 CLI，以获取详细输出  
2. **检查 stderr：** MCP 服务器的 stderr 输出会被捕获并记录（INFO 级别日志会被过滤）  
3. **独立测试：** 在集成前，先独立测试你的 MCP 服务器  
4. **渐进式搭建：** 先从简单工具开始，再逐步添加复杂功能  
5. **频繁使用 `/mcp`：** 开发过程中定期通过 `/mcp` 查看服务器状态  

## 重要说明  

### 安全注意事项  

- **信任设置：** `trust` 选项会跳过所有确认对话框。请谨慎使用，仅限完全可控的服务器  
- **访问令牌：** 配置包含 API 密钥或令牌的环境变量时，请注意安全风险  
- **沙箱兼容性：** 使用沙箱时，请确保 MCP 服务器在沙箱环境中可用  
- **私有数据：** 使用作用域过宽的个人访问令牌可能导致跨仓库的信息泄露

### 性能与资源管理

- **连接持久化**：CLI 会与成功注册了工具的服务器保持持久连接  
- **自动清理**：对未提供任何工具的服务器的连接将被自动关闭  
- **超时管理**：请根据服务器的响应特性配置合适的超时时间  
- **资源监控**：MCP 服务器以独立进程方式运行，并占用系统资源

### 架构兼容性

- **架构合规模式：** 默认情况下（`schemaCompliance: "auto"`），工具架构将原样透传。如需将模型转换为严格的 OpenAPI 3.0 格式，请在 `settings.json` 中设置 `"model": { "generationConfig": { "schemaCompliance": "openapi_30" } }`。
- **OpenAPI 3.0 转换：** 启用 `openapi_30` 模式后，系统会处理以下内容：
  - 可空类型：`["string", "null"]` → `type: "string", nullable: true`
  - 常量值：`const: "foo"` → `enum: ["foo"]`
  - 排他性限制：数值型 `exclusiveMinimum` → 布尔形式配合 `minimum`
  - 关键字移除：`$schema`、`$id`、`dependencies`、`patternProperties`
- **名称规范化：** 工具名称将自动进行规范化处理，以满足 API 要求
- **冲突解决：** 当不同服务器间出现工具名称冲突时，系统将通过自动添加前缀的方式解决

这一全面的集成机制使 MCP 服务器成为扩展 CLI 功能的强大方式，同时兼顾安全性、可靠性与易用性。

## 从工具返回富媒体内容

MCP 工具不仅限于返回纯文本。你可以在单个工具响应中返回丰富、多部分的内容，包括文本、图像、音频及其他二进制数据。这使你能构建功能强大的工具，在单次调用中向模型提供多样化信息。

工具返回的所有数据都会被处理，并作为上下文发送给模型，供其进行下一轮生成。这使得模型能够对所提供的信息进行推理或生成摘要。

### 工作原理

为了返回富文本内容，你的工具响应必须遵循 MCP 规范中关于 [`CallToolResult`](https://modelcontextprotocol.io/specification/2025-06-18/server/tools#tool-result) 的定义。该结果的 `content` 字段应为一个 `ContentBlock` 对象数组。CLI 将正确处理该数组，将文本内容与二进制数据分离，并将其打包供模型使用。

你可以在 `content` 数组中混合使用不同类型的内容块。支持的块类型包括：

- `text`
- `image`
- `audio`
- `resource`（内嵌内容）
- `resource_link`

### 示例：返回文本和图像

以下是一个有效的 MCP 工具 JSON 响应示例，该响应同时返回文本描述和图像：

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

当 Qwen Code 接收到此响应时，将执行以下操作：

1.  提取全部文本内容，并将其合并为一个供模型使用的 `functionResponse` 部分。
2.  将图像数据作为独立的 `inlineData` 部分呈现。
3.  在 CLI 中提供简洁、用户友好的摘要，表明已同时接收到文本和图像。

这使您能够构建功能强大的工具，为 Qwen 模型提供丰富、多模态的上下文信息。

## MCP 提示词作为斜杠命令

除了工具之外，MCP 服务器还可以暴露预定义的提示词，这些提示词可在 Qwen Code 中作为斜杠命令执行。这使你能为常用或复杂的查询创建快捷方式，并通过名称轻松调用。

### 在服务器端定义提示词

以下是一个定义提示词的 stdio MCP 服务器的小型示例：

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
    title: '诗歌生成器',
    description: '创作一首优美的俳句',
    argsSchema: { title: z.string(), mood: z.string().optional() },
  },
  ({ title, mood }) => ({
    messages: [
      {
        role: 'user',
        content: {
          type: 'text',
          text: `写一首俳句${mood ? `，主题情绪为 ${mood}` : ''}，标题为 ${title}。注意：俳句由 5-7-5 音节结构组成`,
        },
      },
    ],
  }),
);

const transport = new StdioServerTransport();
await server.connect(transport);
```

该服务器可在 `settings.json` 的 `mcpServers` 字段中按如下方式配置：

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

发现提示词后，可通过其名称作为斜杠命令来调用。CLI 将自动处理参数解析。

```bash
/poem-writer --title="Qwen Code" --mood="reverent"
```

或者使用位置参数：

```bash
/poem-writer "Qwen Code" reverent
```

执行该命令时，CLI 会向 MCP 服务器调用 `prompts/get` 方法，并传入指定参数。服务器负责将参数代入提示词模板，生成最终的提示词文本并返回。随后，CLI 将该提示词发送给模型执行。这种方式为自动化和共享常用工作流提供了便捷途径。

## 使用 `qwen mcp` 管理 MCP 服务器

虽然你始终可以通过手动编辑 `settings.json` 文件来配置 MCP 服务器，但 CLI 提供了一组便捷的命令，用于以编程方式管理服务器配置。这些命令可简化添加、列出和移除 MCP 服务器的操作，无需直接编辑 JSON 文件。

### 添加服务器（`qwen mcp add`）

`add` 命令用于在你的 `settings.json` 中配置一个新的 MCP 服务器。根据作用域（`-s, --scope`），该服务器将被添加到用户配置文件 `~/.qwen/settings.json` 或项目配置文件 `.qwen/settings.json` 中。

**命令：**

```bash
qwen mcp add [选项] <名称> <命令或 URL> [参数...]
```

- `<名称>`：服务器的唯一名称。
- `<命令或 URL>`：要执行的命令（适用于 `stdio`）或 URL（适用于 `http`/`sse`）。
- `[参数...]`：`stdio` 命令的可选参数。

**选项（标志）：**

- `-s, --scope`：配置作用域（用户或项目）。[默认值：`"project"`]
- `-t, --transport`：传输类型（`stdio`、`sse`、`http`）。[默认值：`"stdio"`]
- `-e, --env`：设置环境变量（例如：`-e KEY=value`）。
- `-H, --header`：为 SSE 和 HTTP 传输设置 HTTP 请求头（例如：`-H "X-Api-Key: abc123" -H "Authorization: Bearer abc123"`）。
- `--timeout`：设置连接超时时间（毫秒）。
- `--trust`：信任该服务器（跳过所有工具调用确认提示）。
- `--description`：设置服务器描述。
- `--include-tools`：以逗号分隔的需启用的工具列表。
- `--exclude-tools`：以逗号分隔的需禁用的工具列表。

#### 添加 stdio 服务器

这是运行本地服务器的默认传输方式。

```bash

# 基本语法
qwen mcp add <name> <command> [args...]

# 示例：添加本地服务器
qwen mcp add my-stdio-server -e API_KEY=123 /path/to/server arg1 arg2 arg3

# 示例：添加本地 Python 服务器
qwen mcp add python-server python server.py --port 8080
```

#### 添加 HTTP 服务器

此传输方式适用于使用可流式传输 HTTP 协议的服务器。

```bash

# 基本语法
qwen mcp add --transport http <name> <url>

# 示例：添加 HTTP 服务器
qwen mcp add --transport http http-server https://api.example.com/mcp/

# 示例：添加带身份验证请求头的 HTTP 服务器
qwen mcp add --transport http secure-http https://api.example.com/mcp/ --header "Authorization: Bearer abc123"
```

#### 添加 SSE 服务器

此传输方式适用于使用服务端发送事件（SSE）的服务器。

```bash

# 基本语法
qwen mcp add --transport sse <name> <url>
```

# 示例：添加一个 SSE 服务器
qwen mcp add --transport sse sse-server https://api.example.com/sse/

# 示例：添加一个带认证请求头的 SSE 服务器
qwen mcp add --transport sse secure-sse https://api.example.com/sse/ --header "Authorization: Bearer abc123"
```

### 管理服务器（`qwen mcp`）

要查看和管理当前已配置的所有 MCP 服务器，请使用 `manage` 命令，或直接运行 `qwen mcp`。这将打开一个交互式的 TUI 对话框，您可在其中：

- 查看所有 MCP 服务器及其连接状态  
- 启用/禁用服务器  
- 重新连接已断开的服务器  
- 查看各服务器提供的工具和提示词（prompts）  
- 查看服务器日志  

**命令：**

```bash
qwen mcp

# 或
qwen mcp manage
```

该管理对话框提供可视化界面，显示每个服务器的名称、配置详情、连接状态以及可用的工具/提示词。

### 移除服务器（`qwen mcp remove`）

要从配置中删除一个服务器，请使用 `remove` 命令并指定服务器名称。

**命令：**

```bash
qwen mcp remove <name>
```

**示例：**

```bash
qwen mcp remove my-server
```

该命令将根据作用域（`-s, --scope`）在对应的 `settings.json` 文件中查找并删除 `mcpServers` 对象内的 `"my-server"` 条目。