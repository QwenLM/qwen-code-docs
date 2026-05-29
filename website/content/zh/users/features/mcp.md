---
description: "通过 MCP 将 Qwen Code 连接数据库、API、Google Drive、Jira、Figma 等外部工具，快速扩展 AI 编程助手的上下文和自动化能力。"
---

# 通过 MCP 将 Qwen Code 连接到工具

Qwen Code 可以通过 [Model Context Protocol (MCP)](https://modelcontextprotocol.io/introduction) 连接到外部工具和数据源。MCP 服务器使 Qwen Code 能够访问你的工具、数据库和 API。

## 使用 MCP 可以做什么

连接 MCP 服务器后，你可以要求 Qwen Code：

- 处理文件和仓库（读取/搜索/写入，具体取决于你启用的工具）
- 查询数据库（检查 schema、执行查询、生成报告）
- 集成内部服务（将你的 API 封装为 MCP 工具）
- 自动化工作流（将可重复任务暴露为工具/prompt）

> [!tip]
>
> 如果你在寻找“一键上手”的命令，请直接跳转到 [快速开始](#quick-start)。

## 快速开始

Qwen Code 会从 `settings.json` 中的 `mcpServers` 字段加载 MCP 服务器。你可以通过以下两种方式配置服务器：

- 直接编辑 `settings.json`
- 使用 `qwen mcp` 命令（参见 [CLI 参考](#qwen-mcp-cli)）

### 添加你的第一个服务器

1. 添加一个服务器（示例：远程 HTTP MCP 服务器）：

```bash
qwen mcp add --transport http my-server http://localhost:3000/mcp
```

2. 打开 MCP 管理对话框以查看和管理服务器：

```bash
qwen mcp
```

3. 在同一项目中重启 Qwen Code（如果尚未运行则启动它），然后要求模型使用该服务器中的工具。

## 配置存储位置（作用域）

大多数用户只需要以下两个作用域：

- **项目作用域（默认）**：项目根目录下的 `.qwen/settings.json`
- **用户作用域**：你机器上所有项目共享的 `~/.qwen/settings.json`

写入用户作用域：

```bash
qwen mcp add --scope user --transport http my-server http://localhost:3000/mcp
```

> [!tip]
>
> 如需了解高级配置层级（系统默认值/系统设置及优先级规则），请参阅 [设置](../configuration/settings)。

## 配置服务器

### 选择传输协议

| 传输协议 | 适用场景 | JSON 字段 |
| --------- | ----------------------------------------------------------------- | ------------------------------------------- |
| `http`    | 推荐用于远程服务；适用于云 MCP 服务器 | `httpUrl`（+ 可选的 `headers`）            |
| `sse`     | 仅支持 Server-Sent Events 的旧版/已弃用服务器    | `url`（+ 可选的 `headers`）                |
| `stdio`   | 你机器上的本地进程（脚本、CLI、Docker）             | `command`、`args`（+ 可选的 `cwd`、`env`） |

> [!note]
>
> 如果服务器同时支持两者，请优先选择 **HTTP** 而非 **SSE**。

### 通过 `settings.json` 配置 vs `qwen mcp add`

两种方法都会在 `settings.json` 中生成相同的 `mcpServers` 条目——请根据你的偏好选择。

#### Stdio 服务器（本地进程）

JSON（`.qwen/settings.json`）：

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

CLI（默认写入项目作用域）：

```bash
qwen mcp add pythonTools -e DATABASE_URL=$DB_CONNECTION_STRING -e API_KEY=$EXTERNAL_API_KEY \
  --timeout 15000 python -m my_mcp_server --port 8080
```

#### HTTP 服务器（远程可流式传输 HTTP）

JSON：

```json
{
  "mcpServers": {
    "httpServerWithAuth": {
      "httpUrl": "http://localhost:3000/mcp",
      "headers": {
        "Authorization": "Bearer your-api-token"
      },
      "timeout": 5000
    }
  }
}
```

CLI：

```bash
qwen mcp add --transport http httpServerWithAuth http://localhost:3000/mcp \
  --header "Authorization: Bearer your-api-token" --timeout 5000
```

#### SSE 服务器（远程 Server-Sent Events）

JSON：

```json
{
  "mcpServers": {
    "sseServer": {
      "url": "http://localhost:8080/sse",
      "timeout": 30000
    }
  }
}
```

CLI：

```bash
qwen mcp add --transport sse sseServer http://localhost:8080/sse --timeout 30000
```

## 安全与控制

### 信任（跳过确认）

- **服务器信任**（`trust: true`）：跳过该服务器的确认提示（请谨慎使用）。

### OAuth 认证

Qwen Code 支持 MCP 服务器的 OAuth 2.0 认证。这在访问需要认证的远程服务器时非常有用。

#### 基本用法

当你添加带有 OAuth 凭据的 MCP 服务器时，Qwen Code 会自动处理认证流程：

```bash
qwen mcp add --transport sse oauth-server https://api.example.com/sse/ \
  --oauth-client-id your-client-id \
  --oauth-redirect-uri https://your-server.com/oauth/callback \
  --oauth-authorization-url https://provider.example.com/authorize \
  --oauth-token-url https://provider.example.com/token
```

#### 重要提示：重定向 URI 配置

OAuth 流程需要一个重定向 URI，授权提供商会将认证代码发送到该地址。

- **本地开发**：默认情况下，Qwen Code 使用 `http://localhost:7777/oauth/callback`。当你在本地机器上使用本地浏览器运行 Qwen Code 时，此配置有效。

- **远程/云部署**：当你在远程服务器、云 IDE 或 Web 终端上运行 Qwen Code 时，默认的 `localhost` 重定向将**无法**工作。你**必须**配置 `--oauth-redirect-uri`，使其指向一个可公开访问且能接收 OAuth 回调的 URL。

远程服务器示例：

```bash
qwen mcp add --transport sse remote-server https://api.example.com/sse/ \
  --oauth-redirect-uri https://your-remote-server.example.com/oauth/callback
```

#### 通过 settings.json 手动配置

你也可以通过直接编辑 `settings.json` 来配置 OAuth：

```json
{
  "mcpServers": {
    "oauthServer": {
      "url": "https://api.example.com/sse/",
      "oauth": {
        "enabled": true,
        "clientId": "your-client-id",
        "clientSecret": "your-client-secret",
        "authorizationUrl": "https://provider.example.com/authorize",
        "tokenUrl": "https://provider.example.com/token",
        "redirectUri": "https://your-server.com/oauth/callback",
        "scopes": ["read", "write"]
      }
    }
  }
}
```

OAuth 配置属性：

| 属性 | 说明 |
| ------------------ | --------------------------------------------------------------------------------------------------------------------- |
| `enabled`          | 为此服务器启用 OAuth（布尔值）                                                                                |
| `clientId`         | OAuth 客户端标识符（字符串，动态注册时为可选）                                                  |
| `clientSecret`     | OAuth 客户端密钥（字符串，公共客户端为可选）                                                             |
| `authorizationUrl` | OAuth 授权端点（字符串，省略时自动发现）                                                     |
| `tokenUrl`         | OAuth 令牌端点（字符串，省略时自动发现）                                                             |
| `scopes`           | 所需的 OAuth 作用域（字符串数组）                                                                              |
| `redirectUri`      | 自定义重定向 URI（字符串）。**对远程部署至关重要**。默认为 `http://localhost:7777/oauth/callback` |
| `tokenParamName`   | SSE URL 中令牌的查询参数名称（字符串）                                                                  |
| `audiences`        | 令牌有效的受众（字符串数组）                                                                   |

#### 令牌管理

OAuth 令牌会自动：

- **安全存储**在 `~/.qwen/mcp-oauth-tokens.json` 中
- **过期时自动刷新**（如果提供了刷新令牌）
- **在每次连接尝试前进行验证**

在 Qwen Code 中使用 `/mcp auth` 命令可交互式管理 OAuth 认证。

### 工具过滤（按服务器允许/拒绝工具）

使用 `includeTools` / `excludeTools` 限制服务器暴露的工具（从 Qwen Code 的视角）。

示例：仅包含部分工具：

```json
{
  "mcpServers": {
    "filteredServer": {
      "command": "python",
      "args": ["-m", "my_mcp_server"],
      "includeTools": ["safe_tool", "file_reader", "data_processor"],
      "timeout": 30000
    }
  }
}
```

### 全局允许/拒绝列表

`settings.json` 中的 `mcp` 对象为所有 MCP 服务器定义全局规则：

- `mcp.allowed`：MCP 服务器名称的允许列表（`mcpServers` 中的键）
- `mcp.excluded`：MCP 服务器名称的拒绝列表

示例：

```json
{
  "mcp": {
    "allowed": ["my-trusted-server"],
    "excluded": ["experimental-server"]
  }
}
```

## 故障排查

- **在 `qwen mcp list` 中服务器显示“Disconnected”**：验证 URL/命令是否正确，然后增加 `timeout`。
- **Stdio 服务器无法启动**：使用绝对 `command` 路径，并仔细检查 `cwd`/`env`。
- **JSON 中的环境变量未解析**：确保它们在 Qwen Code 运行的环境中存在（Shell 环境与 GUI 应用环境可能不同）。

## 参考

### `settings.json` 结构

#### 服务器特定配置（`mcpServers`）

在 `settings.json` 文件中添加 `mcpServers` 对象：

```json
// ... file contains other config objects
{
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

配置属性：

必填（以下之一）：

| 属性 | 说明 |
| --------- | ------------------------------------------------------ |
| `command` | Stdio 传输协议的可执行文件路径 |
| `url`     | SSE 端点 URL（例如 `"http://localhost:8080/sse"`） |
| `httpUrl` | HTTP 流式传输端点 URL |

可选：

| 属性 | 类型/默认值 | 说明 |
| ---------------------- | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `args`                 | array                        | Stdio 传输协议的命令行参数                                                                                                                                                                                                                        |
| `headers`              | object                       | 使用 `url` 或 `httpUrl` 时的自定义 HTTP 请求头                                                                                                                                                                                                                 |
| `env`                  | object                       | 服务器进程的环境变量。值可以使用 `$VAR_NAME` 或 `${VAR_NAME}` 语法引用环境变量                                                                                                                                |
| `cwd`                  | string                       | Stdio 传输协议的工作目录                                                                                                                                                                                                                             |
| `timeout`              | number<br>（默认值：600,000） | 请求超时时间（毫秒）（默认值：600,000ms = 10 分钟）                                                                                                                                                                                                 |
| `trust`                | boolean<br>（默认值：false）  | 设为 `true` 时，跳过该服务器的所有工具调用确认提示（默认值：`false`）                                                                                                                                                                              |
| `includeTools`         | array                        | 从此 MCP 服务器包含的工具名称列表。指定后，仅此处列出的工具对该服务器可用（白名单行为）。若未指定，默认启用该服务器的所有工具。                                       |
| `excludeTools`         | array                        | 从此 MCP 服务器排除的工具名称列表。此处列出的工具将对模型不可用，即使服务器已暴露它们。<br>注意：`excludeTools` 优先级高于 `includeTools`——如果工具同时出现在两个列表中，它将被排除。 |
| `targetAudience`       | string                       | 你尝试访问的受 IAP 保护的应用程序上列入白名单的 OAuth 客户端 ID。与 `authProviderType: 'service_account_impersonation'` 配合使用。                                                                                                         |
| `targetServiceAccount` | string                       | 要模拟的 Google Cloud 服务账号的电子邮件地址。与 `authProviderType: 'service_account_impersonation'` 配合使用。                                                                                                                              |

<a id="qwen-mcp-cli"></a>

### 使用 `qwen mcp` 管理 MCP 服务器

你始终可以通过手动编辑 `settings.json` 来配置 MCP 服务器，但使用 CLI 通常更快。

#### 添加服务器（`qwen mcp add`）

```bash
qwen mcp add [options] <name> <commandOrUrl> [args...]
```

| 参数/选项 | 说明 | 默认值 | 示例 |
| --------------------------- | ------------------------------------------------------------------- | -------------------------------------- | ------------------------------------------------------------------ |
| `<name>`                    | 服务器的唯一名称。                                       | —                                      | `example-server`                                                   |
| `<commandOrUrl>`            | 要执行的命令（用于 `stdio`）或 URL（用于 `http`/`sse`）。 | —                                      | `/usr/bin/python` 或 `http://localhost:8`                          |
| `[args...]`                 | `stdio` 命令的可选参数。                           | —                                      | `--port 5000`                                                      |
| `-s`, `--scope`             | 配置作用域（user 或 project）。                              | `project`                              | `-s user`                                                          |
| `-t`, `--transport`         | 传输协议类型（`stdio`、`sse`、`http`）。                            | `stdio`                                | `-t sse`                                                           |
| `-e`, `--env`               | 设置环境变量。                                          | —                                      | `-e KEY=value`                                                     |
| `-H`, `--header`            | 为 SSE 和 HTTP 传输协议设置 HTTP 请求头。                       | —                                      | `-H "X-Api-Key: abc123"`                                           |
| `--timeout`                 | 设置连接超时时间（毫秒）。                             | —                                      | `--timeout 30000`                                                  |
| `--trust`                   | 信任该服务器（跳过所有工具调用确认提示）。       | —（`false`）                            | `--trust`                                                          |
| `--description`             | 设置服务器的描述。                                 | —                                      | `--description "Local tools"`                                      |
| `--include-tools`           | 要包含的工具列表（逗号分隔）。                         | 包含所有工具                     | `--include-tools mytool,othertool`                                 |
| `--exclude-tools`           | 要排除的工具列表（逗号分隔）。                         | 无                                   | `--exclude-tools mytool`                                           |
| `--oauth-client-id`         | 用于 MCP 服务器认证的 OAuth 客户端 ID。                      | —                                      | `--oauth-client-id your-client-id`                                 |
| `--oauth-client-secret`     | 用于 MCP 服务器认证的 OAuth 客户端密钥。                  | —                                      | `--oauth-client-secret your-client-secret`                         |
| `--oauth-redirect-uri`      | 用于认证回调的 OAuth 重定向 URI。                     | `http://localhost:7777/oauth/callback` | `--oauth-redirect-uri https://your-server.com/oauth/callback`      |
| `--oauth-authorization-url` | OAuth 授权 URL。                                            | —                                      | `--oauth-authorization-url https://provider.example.com/authorize` |
| `--oauth-token-url`         | OAuth 令牌 URL。                                                    | —                                      | `--oauth-token-url https://provider.example.com/token`             |
| `--oauth-scopes`            | OAuth 作用域（逗号分隔）。                                     | —                                      | `--oauth-scopes scope1,scope2`                                     |

> `--oauth-*` 标志仅适用于 `--transport sse` 和 `--transport http`。与 `--transport stdio` 组合使用将被拒绝。

#### 移除服务器（`qwen mcp remove`）

```bash
qwen mcp remove <name>
```
