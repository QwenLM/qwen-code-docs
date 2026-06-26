# 通过 MCP 将 Qwen Code 连接到工具

Qwen Code 可以通过 [模型上下文协议 (Model Context Protocol, MCP)](https://modelcontextprotocol.io/introduction) 连接到外部工具和数据源。MCP 服务器让 Qwen Code 能够访问你的工具、数据库和 API。

## 使用 MCP 可以实现的功能

连接 MCP 服务器后，你可以让 Qwen Code 执行以下操作：

- 处理文件和仓库（根据你启用的工具，可进行读取/搜索/写入）
- 查询数据库（模式检查、查询、报表生成）
- 集成内部服务（将你的 API 封装为 MCP 工具）
- 自动化工作流（将可重复的任务暴露为工具/提示）

> [!tip]
>
> 如果你想快速上手，请直接跳转到 [快速开始](#quick-start)。

## 快速开始

Qwen Code 从你的 `settings.json` 中的 `mcpServers` 加载 MCP 服务器。你可以通过以下两种方式进行配置：

- 直接编辑 `settings.json`
- 使用 `qwen mcp` 命令（参见 [CLI 参考](#使用-qwen-mcp-管理-mcp-服务器)）

### 添加你的第一个服务器

1. 添加一个服务器（示例：远程 HTTP MCP 服务器）：

```bash
qwen mcp add --transport http my-server http://localhost:3000/mcp
```

2. 启动 Qwen Code 并打开 MCP 管理对话框来查看和管理服务器：

```bash
qwen
```

然后输入：

```text
/mcp
```

3. 如果在添加服务器之前 Qwen Code 已经在运行，请在同一个项目中重新启动它。然后让模型使用该服务器上的工具。

## 配置存储位置（作用域）

大多数用户只需要以下两个作用域：

- **用户作用域（默认）**：`~/.qwen/settings.json`，适用于你机器上的所有项目
- **项目作用域**：项目根目录下的 `.qwen/settings.json`

写入用户作用域：

```bash
qwen mcp add --scope user --transport http my-server http://localhost:3000/mcp
```

> [!tip]
>
> 关于高级配置层（系统默认/系统设置及优先级规则），请参见 [设置](../configuration/settings)。

## 配置服务器

### 选择传输协议

| 传输协议 | 使用场景                                                                 | JSON 字段                            |
| -------- | ------------------------------------------------------------------------ | ------------------------------------ |
| `http`   | 推荐用于远程服务；适用于云 MCP 服务器                                    | `httpUrl` (+ 可选的 `headers`)       |
| `sse`    | 仅支持 Server-Sent Events 的旧版/弃用服务器                              | `url` (+ 可选的 `headers`)           |
| `stdio`  | 本地进程（脚本、CLI、Docker）                                              | `command`、`args` (+ 可选的 `cwd`、`env`) |

> [!note]
>
> 如果一个服务器同时支持两者，请优先选择 **HTTP** 而不是 **SSE**。

### 通过 `settings.json` 和 `qwen mcp add` 进行配置

两种方式都会在 `settings.json` 中生成相同的 `mcpServers` 条目——按照你的偏好选择即可。

#### Stdio 服务器（本地进程）

JSON (`.qwen/settings.json`)：

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

CLI（默认写入用户作用域）：

```bash
qwen mcp add pythonTools -e DATABASE_URL=$DB_CONNECTION_STRING -e API_KEY=$EXTERNAL_API_KEY \
  --timeout 15000 python -m my_mcp_server --port 8080
```

#### HTTP 服务器（远程可流式 HTTP）

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

## 使用 MCP 提示词和资源

除了工具之外，Qwen Code 还会发现并提供另外两种 MCP 原语。

### 提示词（斜杠命令）

服务器通过 `prompts/list` 发布的任何提示词都会成为可执行的 **斜杠命令**。发现之后，输入 `/` 即可看到列出的提示词（标记为 `MCP: <server>`）；像运行其他命令一样运行它：

```text
/my_prompt --arg1="value" --arg2="value"
# 同时也支持位置参数形式：
/my_prompt "value" "value"
# 查看提示词的参数：
/my_prompt help
```

提示词的消息会被发送给模型，模型随后会据此执行操作。

> 发现过程对已声明的 `prompts` 能力比较宽容：有些服务器实现了 `prompts/list` 但未在 `initialize` 能力中声明 `prompts`。Qwen Code 仍然会尝试 `prompts/list`，因此这些提示词依然会显示。如果一个服务器确实没有提示词，它会返回 `Method not found`，该错误会被忽略。

### 资源

服务器通过 `resources/list` 发布的资源会按服务器进行发现。使用 `/mcp` 打开管理对话框，选择一个服务器，便能看到其 **Resources** 数量，以及它提供的工具和提示词。选择 **View resources** 可以浏览该服务器的资源 URI；选中一个资源会显示其描述和 MIME 类型，以及要粘贴到消息中的确切 `@server:uri` 引用。与提示词一样，`resources` 能力也不是必须声明的。

使用 `@server:uri` 语法将资源内容注入到你的消息中——输入 `@`，然后输入服务器名、冒号和资源 URI：

```text
summarize @myserver:file:///docs/spec.md and list the open questions
```

输入 `@myserver:` 会显示该服务器资源的自动补全列表；继续输入以过滤，匹配（不区分大小写）资源 URI 或其友好名称/标题。你不需要记住 URI——在输入冒号之前，即使只输入部分服务器名称，也会建议匹配的公开资源的服务器，因此你可以选择一个并直接进入其资源列表。提交后，引用的资源将被读取，其内容会附加到你的消息中（文本内联，二进制 blob 作为附件）；`@server:uri` 引用会保留在提示词中，以便模型知道它看到的是什么。`server` 前缀必须匹配一个已配置的 MCP 服务器——否则该标记将被视为普通文件路径，因此现有的 `@path/to/file` 引用不受影响。在不受信任的文件夹中，资源读取被禁用。

## 渐进式可用性和发现超时

Qwen Code 在 UI 已可交互之后，会在后台发现 MCP 服务器。即使某个 MCP 服务器需要几秒钟（或根本不响应），你也能在几百毫秒内看到 CLI 的第一个提示；并且模型工具列表会在每个服务器完成发现握手后的大约一帧（约 16 毫秒）内更新。

- **交互模式**：UI 立即出现；发现过程中，右下角的 MCP 状态指示器会显示 `N/M MCP servers ready`。在 MCP 完成之前发送提示词，模型只会看到当时已准备好的工具；后续提示词会看到更多工具（随着服务器上线）。
- **非交互模式**（`--prompt`、stream-json、ACP）：CLI 仍然会等待 MCP 发现稳定后才发送第一个提示词，因此脚本/管道调用会看到与旧同步行为相同的完整工具集。

### 每服务器 `discoveryTimeoutMs`

每个 MCP 服务器都有一个仅用于发现的超时时间，用于限制初始握手（`connect` + `tools/list` + `prompts/list` + `resources/list`）允许的时间。默认值：

- **stdio 服务器**：30 秒
- **远程 HTTP / SSE 服务器**：5 秒（网络风险较高）

需要时可按服务器覆盖：

```jsonc
{
  "mcpServers": {
    "slow-stdio": {
      "command": "node",
      "args": ["./slow-server.js"],
      "discoveryTimeoutMs": 60000,
    },
    "flaky-remote": {
      "httpUrl": "https://example.com/mcp",
      "discoveryTimeoutMs": 10000,
    },
  },
}
```

现有的 `timeout` 字段是 **工具调用** 超时（用于每次 `tools/call` 请求，默认为 10 分钟），不受 `discoveryTimeoutMs` 影响——长时间运行的工具调用不属于启动异常。

### 回退渐进式 MCP

如果你需要旧的同步行为（CLI 等待每个 MCP 服务器后才显示任何 UI），可以在环境中设置 `QWEN_CODE_LEGACY_MCP_BLOCKING=1`。该机制至少会保留一个发布版本作为逃生舱。

## 安全与控制

### 信任（跳过确认）

- **服务器信任**（`trust: true`）：跳过该服务器的确认提示（请谨慎使用）。

### OAuth 认证

Qwen Code 支持 MCP 服务器的 OAuth 2.0 认证。这在访问需要认证的远程服务器时非常有用。

#### 基本用法

当你使用 OAuth 凭据添加 MCP 服务器时，Qwen Code 会自动处理认证流程：

```bash
qwen mcp add --transport sse oauth-server https://api.example.com/sse/ \
  --oauth-client-id your-client-id \
  --oauth-redirect-uri https://your-server.com/oauth/callback \
  --oauth-authorization-url https://provider.example.com/authorize \
  --oauth-token-url https://provider.example.com/token
```

#### 重要：重定向 URI 配置

OAuth 流程需要一个重定向 URI，授权提供方通过它将认证码发送过来。

- **本地开发**：默认情况下，Qwen Code 使用 `http://localhost:7777/oauth/callback`。这适用于在本地机器上使用本地浏览器运行 Qwen Code 的情况。

- **远程/云部署**：当 Qwen Code 运行在远程服务器、云 IDE 或 Web 终端上时，默认的 `localhost` 重定向将无法使用。你**必须**配置 `--oauth-redirect-uri`，使其指向一个能够接收 OAuth 回调的公开可访问的 URL。

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

| 属性                | 描述                                                                                                          |
| ------------------- | ------------------------------------------------------------------------------------------------------------- |
| `enabled`           | 启用该服务器的 OAuth（布尔值）                                                                                |
| `clientId`          | OAuth 客户端标识符（字符串，如果使用动态注册则可选）                                                          |
| `clientSecret`      | OAuth 客户端密钥（字符串，公共客户端可选）                                                                    |
| `authorizationUrl`  | OAuth 授权端点（字符串，省略时自动发现）                                                                      |
| `tokenUrl`          | OAuth 令牌端点（字符串，省略时自动发现）                                                                      |
| `scopes`            | 所需的 OAuth 作用域（字符串数组）                                                                             |
| `redirectUri`       | 自定义重定向 URI（字符串）。**远程部署时必须设置**。默认为 `http://localhost:7777/oauth/callback`             |
| `tokenParamName`    | SSE URL 中令牌的查询参数名（字符串）                                                                          |
| `audiences`         | 令牌有效的受众（字符串数组）                                                                                  |

#### 令牌管理

OAuth 令牌会自动：

- **默认存储**在 `~/.qwen/mcp-oauth-tokens.json`（明文，模式 0600）。如果设置了 `QWEN_CODE_FORCE_ENCRYPTED_FILE_STORAGE=true`，Qwen Code 将使用基于密钥链的存储（如果可用）或使用 AES-256-GCM 加密的 `~/.qwen/mcp-oauth-tokens-v2.json`。
- **过期时自动刷新**（如果有刷新令牌）
- **每次连接尝试前进行验证**

> [!WARNING]
> 默认情况下，OAuth 令牌以未加密的形式存储在磁盘上。在共享或多用户机器上，请设置 `QWEN_CODE_FORCE_ENCRYPTED_FILE_STORAGE=true` 以保护凭据。

使用 Qwen Code 中的 `/mcp` 对话框可以检查 MCP 服务器并以交互方式管理认证。

### 工具过滤（按服务器允许/拒绝工具）

使用 `includeTools` / `excludeTools` 限制服务器暴露的工具（从 Qwen Code 的角度）。

示例：只包含几个工具：

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

`settings.json` 中的 `mcp` 对象定义了所有 MCP 服务器的全局规则：

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

## 故障排除

- **服务器在 `qwen mcp list` 中显示“Disconnected”**：验证 URL/命令是否正确，然后增加 `timeout`。
- **Stdio 服务器启动失败**：使用绝对 `command` 路径，并仔细检查 `cwd`/`env`。
- **JSON 中的环境变量未解析**：确保它们在 Qwen Code 运行的环境中存在（shell 与 GUI 应用的环境可能不同）。

## 参考

### `settings.json` 结构

#### 服务器特定配置 (`mcpServers`)

在 `settings.json` 文件中添加一个 `mcpServers` 对象：

```json
// ... 文件包含其他配置对象
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

必需（以下之一）：

| 属性      | 描述                                      |
| --------- | ----------------------------------------- |
| `command` | Stdio 传输的可执行文件路径                |
| `url`     | SSE 端点 URL（例如 `"http://localhost:8080/sse"`） |
| `httpUrl` | HTTP 流式端点 URL                         |

可选：

| 属性                   | 类型/默认值                | 描述                                                                                                                                                                                                                                                         |
| ---------------------- | ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `args`                 | 数组                      | Stdio 传输的命令行参数                                                                                                                                                                                                                                       |
| `headers`              | 对象                      | 使用 `url` 或 `httpUrl` 时的自定义 HTTP 头                                                                                                                                                                                                                  |
| `env`                  | 对象                      | 服务器进程的环境变量。值可以使用 `$VAR_NAME` 或 `${VAR_NAME}` 语法引用环境变量                                                                                                                                                                               |
| `cwd`                  | 字符串                    | Stdio 传输的工作目录                                                                                                                                                                                                                                         |
| `timeout`              | 数字<br>(默认值: 600,000) | 请求超时时间（毫秒）（默认值：600,000 毫秒 = 10 分钟）                                                                                                                                                                                                       |
| `trust`                | 布尔值<br>(默认值: false) | 当为 `true` 时，跳过该服务器所有工具调用的确认提示（默认值：`false`）                                                                                                                                                                                       |
| `includeTools`         | 数组                      | 从该 MCP 服务器包含的工具名称列表。指定后，只有此处列出的工具才可从该服务器使用（允许列表行为）。如果未指定，默认启用该服务器的所有工具。                                                                                                                     |
| `excludeTools`         | 数组                      | 从该 MCP 服务器排除的工具名称列表。此处列出的工具将不会提供给模型使用，即使服务器暴露了它们。<br>注意：`excludeTools` 优先级高于 `includeTools`——如果某个工具同时出现在两个列表中，它将被排除。                                                            |
| `targetAudience`       | 字符串                    | 你尝试访问的 IAP 保护应用程序上允许的 OAuth 客户端 ID。与 `authProviderType: 'service_account_impersonation'` 一起使用。                                                                                                                                     |
| `targetServiceAccount` | 字符串                    | 要模拟的 Google Cloud 服务账户的电子邮件地址。与 `authProviderType: 'service_account_impersonation'` 一起使用。                                                                                                                                              |

<a id="qwen-mcp-cli"></a>

### 使用 `qwen mcp` 管理 MCP 服务器

你总是可以通过手动编辑 `settings.json` 来配置 MCP 服务器，但使用 CLI 通常更快。

#### 添加服务器 (`qwen mcp add`)

```bash
qwen mcp add [options] <name> <commandOrUrl> [args...]
```

| 参数/选项                  | 描述                                                      | 默认值                                 | 示例                                                            |
| -------------------------- | --------------------------------------------------------- | -------------------------------------- | ---------------------------------------------------------------- |
| `<name>`                   | 服务器的唯一名称。                                        | —                                      | `example-server`                                                 |
| `<commandOrUrl>`           | 要执行的命令（对于 `stdio`）或 URL（对于 `http`/`sse`）。 | —                                      | `/usr/bin/python` 或 `http://localhost:8`                        |
| `[args...]`                | `stdio` 命令的可选参数。                                  | —                                      | `--port 5000`                                                    |
| `-s`, `--scope`            | 配置作用域（user 或 project）。                           | `user`                                 | `-s user`                                                        |
| `-t`, `--transport`        | 传输类型（`stdio`、`sse`、`http`）。                      | `stdio`                                | `-t sse`                                                         |
| `-e`, `--env`              | 设置环境变量。                                            | —                                      | `-e KEY=value`                                                   |
| `-H`, `--header`           | 为 SSE 和 HTTP 传输设置 HTTP 头。                         | —                                      | `-H "X-Api-Key: abc123"`                                         |
| `--timeout`                | 设置连接超时时间（毫秒）。                                | —                                      | `--timeout 30000`                                                |
| `--trust`                  | 信任服务器（跳过所有工具调用确认提示）。                  | — (`false`)                            | `--trust`                                                        |
| `--description`            | 设置服务器描述。                                          | —                                      | `--description "Local tools"`                                    |
| `--include-tools`          | 要包含的以逗号分隔的工具列表。                            | 包含所有工具                           | `--include-tools mytool,othertool`                               |
| `--exclude-tools`          | 要排除的以逗号分隔的工具列表。                            | 无                                     | `--exclude-tools mytool`                                         |
| `--oauth-client-id`        | MCP 服务器认证的 OAuth 客户端 ID。                        | —                                      | `--oauth-client-id your-client-id`                               |
| `--oauth-client-secret`    | MCP 服务器认证的 OAuth 客户端密钥。                       | —                                      | `--oauth-client-secret your-client-secret`                       |
| `--oauth-redirect-uri`     | 用于认证回调的 OAuth 重定向 URI。                         | `http://localhost:7777/oauth/callback` | `--oauth-redirect-uri https://your-server.com/oauth/callback`    |
| `--oauth-authorization-url` | OAuth 授权 URL。                                          | —                                      | `--oauth-authorization-url https://provider.example.com/authorize` |
| `--oauth-token-url`        | OAuth 令牌 URL。                                          | —                                      | `--oauth-token-url https://provider.example.com/token`           |
| `--oauth-scopes`           | OAuth 作用域（逗号分隔）。                                | —                                      | `--oauth-scopes scope1,scope2`                                   |
> `--oauth-*` 标志仅适用于 `--transport sse` 和 `--transport http`。将它们与 `--transport stdio` 结合使用将被拒绝。

#### 移除服务器（`qwen mcp remove`）

```bash
qwen mcp remove <name>
```