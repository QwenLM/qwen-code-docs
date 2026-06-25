# 通过 MCP 将 Qwen Code 连接到工具

Qwen Code 可以通过 [Model Context Protocol (MCP)](https://modelcontextprotocol.io/introduction) 连接外部工具和数据源。MCP 服务器让 Qwen Code 能够访问你的工具、数据库和 API。

## MCP 能做什么

连接 MCP 服务器后，你可以让 Qwen Code：

- 操作文件和仓库（读取/搜索/写入，取决于你启用的工具）
- 查询数据库（schema 检查、查询、报表）
- 集成内部服务（将你的 API 封装为 MCP 工具）
- 自动化工作流（将可重复任务暴露为 tools/prompts）

> [!tip]
>
> 如果你想直接上手，跳转到 [快速开始](#quick-start)。

## 快速开始

Qwen Code 从 `settings.json` 的 `mcpServers` 中加载 MCP 服务器。你可以通过以下两种方式配置服务器：

- 直接编辑 `settings.json`
- 使用 `qwen mcp` 命令（参见 [CLI 参考](#manage-mcp-servers-with-qwen-mcp)）

### 添加第一个服务器

1. 添加一个服务器（示例：远程 HTTP MCP 服务器）：

```bash
qwen mcp add --transport http my-server http://localhost:3000/mcp
```

2. 启动 Qwen Code，打开 MCP 管理对话框查看和管理服务器：

```bash
qwen
```

然后输入：

```text
/mcp
```

3. 如果在添加服务器之前 Qwen Code 已经在运行，请在同一项目中重启它，然后让模型使用该服务器的工具。

## 配置存储位置（作用域）

大多数用户只需要以下两个作用域：

- **用户作用域（默认）**：`~/.qwen/settings.json`，对本机所有项目生效
- **项目作用域**：项目根目录下的 `.qwen/settings.json`

写入用户作用域：

```bash
qwen mcp add --scope user --transport http my-server http://localhost:3000/mcp
```

> [!tip]
>
> 关于高级配置层（系统默认值/系统设置和优先级规则），参见 [Settings](../configuration/settings)。

## 配置服务器

### 选择传输方式

| 传输方式  | 适用场景                                          | JSON 字段                                   |
| --------- | ------------------------------------------------- | ------------------------------------------- |
| `http`    | 推荐用于远程服务；适合云端 MCP 服务器              | `httpUrl`（+ 可选 `headers`）               |
| `sse`     | 仅支持 Server-Sent Events 的旧版/废弃服务器        | `url`（+ 可选 `headers`）                   |
| `stdio`   | 本机本地进程（脚本、CLI、Docker）                  | `command`、`args`（+ 可选 `cwd`、`env`）    |

> [!note]
>
> 如果服务器同时支持两种方式，优先选择 **HTTP** 而非 **SSE**。

### 通过 `settings.json` 或 `qwen mcp add` 配置

两种方式在 `settings.json` 中生成相同的 `mcpServers` 条目，选择你喜欢的方式即可。

#### Stdio 服务器（本地进程）

JSON（`.qwen/settings.json`）：

```json
{
  “mcpServers”: {
    “pythonTools”: {
      “command”: “python”,
      “args”: [“-m”, “my_mcp_server”, “--port”, “8080”],
      “cwd”: “./mcp-servers/python”,
      “env”: {
        “DATABASE_URL”: “$DB_CONNECTION_STRING”,
        “API_KEY”: “${EXTERNAL_API_KEY}”
      },
      “timeout”: 15000
    }
  }
}
```

CLI（默认写入用户作用域）：

```bash
qwen mcp add pythonTools -e DATABASE_URL=$DB_CONNECTION_STRING -e API_KEY=$EXTERNAL_API_KEY \
  --timeout 15000 python -m my_mcp_server --port 8080
```

#### HTTP 服务器（远程 streamable HTTP）

JSON：

```json
{
  “mcpServers”: {
    “httpServerWithAuth”: {
      “httpUrl”: “http://localhost:3000/mcp”,
      “headers”: {
        “Authorization”: “Bearer your-api-token”
      },
      “timeout”: 5000
    }
  }
}
```

CLI：

```bash
qwen mcp add --transport http httpServerWithAuth http://localhost:3000/mcp \
  --header “Authorization: Bearer your-api-token” --timeout 5000
```

#### SSE 服务器（远程 Server-Sent Events）

JSON：

```json
{
  “mcpServers”: {
    “sseServer”: {
      “url”: “http://localhost:8080/sse”,
      “timeout”: 30000
    }
  }
}
```

CLI：

```bash
qwen mcp add --transport sse sseServer http://localhost:8080/sse --timeout 30000
```

## 使用 MCP prompts 和 resources

除工具外，Qwen Code 还会发现并呈现另外两种 MCP 原语。

### Prompts（斜杠命令）

服务器通过 `prompts/list` 声明的任何 prompt 都会成为可执行的**斜杠命令**。发现后，输入 `/` 即可看到该 prompt（标记为 `MCP: <server>`）；像其他命令一样运行它：

```text
/my_prompt --arg1=”value” --arg2=”value”
# 位置参数形式同样有效：
/my_prompt “value” “value”
# 查看 prompt 的参数：
/my_prompt help
```

prompt 的消息会发送给模型，由模型执行相应操作。

> 发现机制对声明的 `prompts` capability 比较宽松：部分服务器实现了 `prompts/list`，但在 `initialize` capabilities 中省略了 `prompts`。Qwen Code 仍会尝试 `prompts/list`，因此这些 prompts 依然会出现。真正没有 prompts 的服务器只会返回 `Method not found`，此响应会被忽略。

### Resources

服务器通过 `resources/list` 声明的 resources 会按服务器粒度进行发现。使用 `/mcp` 打开管理对话框，选择一个服务器即可查看其 **Resources** 数量（与 tools 和 prompts 并列显示）。选择 **View resources** 可浏览该服务器的 resource URI；选中一个后会显示其描述和 MIME 类型，以及可粘贴到消息中的 `@server:uri` 引用。与 prompts 一样，`resources` capability 无需声明。

使用 `@server:uri` 语法将 resource 内容注入消息——输入 `@`，然后是服务器名称、冒号和 resource URI：

```text
summarize @myserver:file:///docs/spec.md and list the open questions
```

输入 `@myserver:` 会显示该服务器所有 resources 的自动补全列表；继续输入可过滤，匹配（不区分大小写）resource URI 或其友好名称/标题。你不需要记住 URI——在输入冒号之前，输入部分服务器名称也会提示匹配的、暴露了 resources 的服务器，让你直接进入其 resource 列表。提交后，引用的 resource 会被读取并将内容追加到你的消息中（文本内联，二进制文件作为附件）；`@server:uri` 引用保留在 prompt 中，让模型知道它在查看什么。`server` 前缀必须匹配已配置的 MCP 服务器——否则该 token 会被当作普通文件路径处理，现有的 `@path/to/file` 引用不受影响。在不受信任的文件夹中，resource 读取功能被禁用。

## 渐进式可用性与发现超时

Qwen Code 在 UI 已经可交互后在后台发现 MCP 服务器。即使某个 MCP 服务器需要几秒钟才能响应（或始终无响应），CLI 的第一个提示符也会在几百毫秒内出现；每个服务器完成发现握手后，模型的工具列表会在约一帧（~16 ms）内更新。

- **交互模式**：UI 立即显示；右下角的 MCP 状态指示器在发现过程中显示 `N/M MCP servers ready`。在 MCP 完成之前发送 prompt，模型只能看到_此刻_已就绪的工具；随着服务器上线，后续 prompt 能看到更多工具。
- **非交互模式**（`--prompt`、stream-json、ACP）：CLI 在发送第一个 prompt 前仍会等待 MCP 发现完成，因此脚本/管道调用能看到与原来同步行为相同的完整工具集。

### 每个服务器的 `discoveryTimeoutMs`

每个 MCP 服务器有一个仅用于发现阶段的超时，限制初始握手（`connect` + `tools/list` + `prompts/list` + `resources/list`）的最长时间。默认值：

- **stdio 服务器**：30 秒
- **远程 HTTP / SSE 服务器**：5 秒（网络风险较高）

按需为单个服务器覆盖此值：

```jsonc
{
  “mcpServers”: {
    “slow-stdio”: {
      “command”: “node”,
      “args”: [“./slow-server.js”],
      “discoveryTimeoutMs”: 60000,
    },
    “flaky-remote”: {
      “httpUrl”: “https://example.com/mcp”,
      “discoveryTimeoutMs”: 10000,
    },
  },
}
```

现有的 `timeout` 字段是**工具调用**超时（用于每个 `tools/call` 请求，默认 10 分钟），不受 `discoveryTimeoutMs` 影响——长时间运行的工具调用不属于启动问题。

### 回退到同步 MCP

如果你需要旧的同步行为（CLI 等待所有 MCP 服务器就绪后再显示任何 UI），在环境中设置 `QWEN_CODE_LEGACY_MCP_BLOCKING=1`。此选项作为逃生通道至少保留一个版本。

## 安全与控制

### 信任（跳过确认）

- **服务器信任**（`trust: true`）：跳过该服务器的确认提示（谨慎使用）。

### OAuth 认证

Qwen Code 支持 MCP 服务器的 OAuth 2.0 认证，适用于访问需要认证的远程服务器。

#### 基本用法

添加带有 OAuth 凭据的 MCP 服务器时，Qwen Code 会自动处理认证流程：

```bash
qwen mcp add --transport sse oauth-server https://api.example.com/sse/ \
  --oauth-client-id your-client-id \
  --oauth-redirect-uri https://your-server.com/oauth/callback \
  --oauth-authorization-url https://provider.example.com/authorize \
  --oauth-token-url https://provider.example.com/token
```

#### 重要：重定向 URI 配置

OAuth 流程需要一个重定向 URI，授权提供商将认证码发送到该地址。

- **本地开发**：默认情况下，Qwen Code 使用 `http://localhost:7777/oauth/callback`。在本地机器上使用本地浏览器运行 Qwen Code 时有效。

- **远程/云端部署**：在远程服务器、云端 IDE 或 Web 终端上运行 Qwen Code 时，默认的 `localhost` 重定向**无法使用**。你**必须**将 `--oauth-redirect-uri` 配置为可公开访问的、能接收 OAuth 回调的 URL。

远程服务器示例：

```bash
qwen mcp add --transport sse remote-server https://api.example.com/sse/ \
  --oauth-redirect-uri https://your-remote-server.example.com/oauth/callback
```

#### 通过 settings.json 手动配置

你也可以直接编辑 `settings.json` 来配置 OAuth：

```json
{
  “mcpServers”: {
    “oauthServer”: {
      “url”: “https://api.example.com/sse/”,
      “oauth”: {
        “enabled”: true,
        “clientId”: “your-client-id”,
        “clientSecret”: “your-client-secret”,
        “authorizationUrl”: “https://provider.example.com/authorize”,
        “tokenUrl”: “https://provider.example.com/token”,
        “redirectUri”: “https://your-server.com/oauth/callback”,
        “scopes”: [“read”, “write”]
      }
    }
  }
}
```

OAuth 配置属性：

| 属性               | 描述                                                                                                                  |
| ------------------ | --------------------------------------------------------------------------------------------------------------------- |
| `enabled`          | 为该服务器启用 OAuth（boolean）                                                                                        |
| `clientId`         | OAuth 客户端标识符（string，动态注册时可选）                                                                           |
| `clientSecret`     | OAuth 客户端密钥（string，公共客户端可选）                                                                             |
| `authorizationUrl` | OAuth 授权端点（string，省略时自动发现）                                                                               |
| `tokenUrl`         | OAuth token 端点（string，省略时自动发现）                                                                             |
| `scopes`           | 所需的 OAuth scopes（字符串数组）                                                                                      |
| `redirectUri`      | 自定义重定向 URI（string）。**远程部署时至关重要**。默认为 `http://localhost:7777/oauth/callback`                      |
| `tokenParamName`   | SSE URL 中 token 的查询参数名（string）                                                                                |
| `audiences`        | token 有效的受众（字符串数组）                                                                                         |

#### Token 管理

OAuth token 会自动：

- **存储**至 `~/.qwen/mcp-oauth-tokens.json`（明文，权限 0600）。如果设置了 `QWEN_CODE_FORCE_ENCRYPTED_FILE_STORAGE=true`，Qwen Code 会优先使用 keychain 存储，否则使用经过 AES-256-GCM 加密的 `~/.qwen/mcp-oauth-tokens-v2.json`。
- **刷新**（token 过期且有 refresh token 时）
- **验证**（每次连接前）

> [!WARNING]
> 默认情况下，OAuth token 以明文形式存储在磁盘上。在共享或多用户机器上，请设置 `QWEN_CODE_FORCE_ENCRYPTED_FILE_STORAGE=true` 以保护凭据。

在 Qwen Code 中使用 `/mcp` 对话框可以查看 MCP 服务器并以交互方式管理认证。

### 工具过滤（按服务器允许/拒绝工具）

使用 `includeTools` / `excludeTools` 限制服务器暴露的工具（从 Qwen Code 的视角）。

示例：仅包含部分工具：

```json
{
  “mcpServers”: {
    “filteredServer”: {
      “command”: “python”,
      “args”: [“-m”, “my_mcp_server”],
      “includeTools”: [“safe_tool”, “file_reader”, “data_processor”],
      “timeout”: 30000
    }
  }
}
```

### 全局允许/拒绝列表

`settings.json` 中的 `mcp` 对象定义了对所有 MCP 服务器生效的全局规则：

- `mcp.allowed`：MCP 服务器名称的允许列表（`mcpServers` 中的 key）
- `mcp.excluded`：MCP 服务器名称的拒绝列表

示例：

```json
{
  “mcp”: {
    “allowed”: [“my-trusted-server”],
    “excluded”: [“experimental-server”]
  }
}
```

## 故障排查

- **服务器在 `qwen mcp list` 中显示”Disconnected”**：检查 URL/命令是否正确，然后增大 `timeout`。
- **Stdio 服务器启动失败**：使用绝对路径的 `command`，并仔细检查 `cwd`/`env`。
- **JSON 中的环境变量未解析**：确保它们在 Qwen Code 运行的环境中存在（shell 与 GUI 应用的环境可能不同）。

## 参考

### `settings.json` 结构

#### 服务器级配置（`mcpServers`）

在 `settings.json` 中添加 `mcpServers` 对象：

```json
// ... file contains other config objects
{
  “mcpServers”: {
    “serverName”: {
      “command”: “path/to/server”,
      “args”: [“--arg1”, “value1”],
      “env”: {
        “API_KEY”: “$MY_API_TOKEN”
      },
      “cwd”: “./server-directory”,
      “timeout”: 30000,
      “trust”: false
    }
  }
}
```

配置属性：

必填（以下之一）：

| 属性      | 描述                                                   |
| --------- | ------------------------------------------------------ |
| `command` | Stdio 传输的可执行文件路径                              |
| `url`     | SSE 端点 URL（例如 `”http://localhost:8080/sse”`）      |
| `httpUrl` | HTTP 流式端点 URL                                       |

可选：

| 属性                   | 类型/默认值                   | 描述                                                                                                                                                                                                                                                              |
| ---------------------- | ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `args`                 | array                         | Stdio 传输的命令行参数                                                                                                                                                                                                                                             |
| `headers`              | object                        | 使用 `url` 或 `httpUrl` 时的自定义 HTTP headers                                                                                                                                                                                                                   |
| `env`                  | object                        | 服务器进程的环境变量。值可使用 `$VAR_NAME` 或 `${VAR_NAME}` 语法引用环境变量                                                                                                                                                                                      |
| `cwd`                  | string                        | Stdio 传输的工作目录                                                                                                                                                                                                                                               |
| `timeout`              | number<br>（默认：600,000）   | 请求超时时间，单位毫秒（默认：600,000ms = 10 分钟）                                                                                                                                                                                                               |
| `trust`                | boolean<br>（默认：false）    | 为 `true` 时，跳过该服务器的所有工具调用确认（默认：`false`）                                                                                                                                                                                                     |
| `includeTools`         | array                         | 从该 MCP 服务器包含的工具名称列表。指定后，仅该列表中的工具可用（allowlist 行为）。未指定时，默认启用服务器的所有工具。                                                                                                                                             |
| `excludeTools`         | array                         | 从该 MCP 服务器排除的工具名称列表。列表中的工具不会提供给模型，即使服务器暴露了它们。<br>注意：`excludeTools` 优先于 `includeTools`——若一个工具同时出现在两个列表中，将被排除。                                                                                    |
| `targetAudience`       | string                        | IAP 保护应用上允许的 OAuth Client ID。与 `authProviderType: 'service_account_impersonation'` 配合使用。                                                                                                                                                           |
| `targetServiceAccount` | string                        | 要模拟的 Google Cloud Service Account 邮件地址。与 `authProviderType: 'service_account_impersonation'` 配合使用。                                                                                                                                                 |

<a id=”qwen-mcp-cli”></a>

### 使用 `qwen mcp` 管理 MCP 服务器

你随时可以通过手动编辑 `settings.json` 来配置 MCP 服务器，但使用 CLI 通常更快。

#### 添加服务器（`qwen mcp add`）

```bash
qwen mcp add [options] <name> <commandOrUrl> [args...]
```

| 参数/选项                   | 描述                                                                | 默认值                                 | 示例                                                               |
| --------------------------- | ------------------------------------------------------------------- | -------------------------------------- | ------------------------------------------------------------------ |
| `<name>`                    | 服务器的唯一名称。                                                   | —                                      | `example-server`                                                   |
| `<commandOrUrl>`            | 要执行的命令（`stdio`）或 URL（`http`/`sse`）。                     | —                                      | `/usr/bin/python` 或 `http://localhost:8`                          |
| `[args...]`                 | `stdio` 命令的可选参数。                                             | —                                      | `--port 5000`                                                      |
| `-s`, `--scope`             | 配置作用域（user 或 project）。                                      | `user`                                 | `-s user`                                                          |
| `-t`, `--transport`         | 传输类型（`stdio`、`sse`、`http`）。                                 | `stdio`                                | `-t sse`                                                           |
| `-e`, `--env`               | 设置环境变量。                                                       | —                                      | `-e KEY=value`                                                     |
| `-H`, `--header`            | 为 SSE 和 HTTP 传输设置 HTTP headers。                               | —                                      | `-H “X-Api-Key: abc123”`                                           |
| `--timeout`                 | 设置连接超时时间，单位毫秒。                                          | —                                      | `--timeout 30000`                                                  |
| `--trust`                   | 信任该服务器（跳过所有工具调用确认提示）。                            | —（`false`）                           | `--trust`                                                          |
| `--description`             | 设置服务器描述。                                                     | —                                      | `--description “Local tools”`                                      |
| `--include-tools`           | 要包含的工具列表（逗号分隔）。                                        | 包含所有工具                            | `--include-tools mytool,othertool`                                 |
| `--exclude-tools`           | 要排除的工具列表（逗号分隔）。                                        | 无                                     | `--exclude-tools mytool`                                           |
| `--oauth-client-id`         | MCP 服务器认证的 OAuth client ID。                                   | —                                      | `--oauth-client-id your-client-id`                                 |
| `--oauth-client-secret`     | MCP 服务器认证的 OAuth client secret。                               | —                                      | `--oauth-client-secret your-client-secret`                         |
| `--oauth-redirect-uri`      | 认证回调的 OAuth 重定向 URI。                                        | `http://localhost:7777/oauth/callback` | `--oauth-redirect-uri https://your-server.com/oauth/callback`      |
| `--oauth-authorization-url` | OAuth 授权 URL。                                                     | —                                      | `--oauth-authorization-url https://provider.example.com/authorize` |
| `--oauth-token-url`         | OAuth token URL。                                                    | —                                      | `--oauth-token-url https://provider.example.com/token`             |
| `--oauth-scopes`            | OAuth scopes（逗号分隔）。                                           | —                                      | `--oauth-scopes scope1,scope2`                                     |

> `--oauth-*` 标志仅适用于 `--transport sse` 和 `--transport http`。与 `--transport stdio` 组合使用会被拒绝。

#### 移除服务器（`qwen mcp remove`）

```bash
qwen mcp remove <name>
```