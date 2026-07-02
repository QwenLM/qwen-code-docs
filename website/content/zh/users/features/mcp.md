# 通过 MCP 将 Qwen Code 连接到工具

Qwen Code 可以通过 [Model Context Protocol (MCP)](https://modelcontextprotocol.io/introduction) 连接到外部工具和数据源。MCP 服务器使 Qwen Code 能够访问你的工具、数据库和 API。

## 使用 MCP 可以做什么

连接 MCP 服务器后，你可以要求 Qwen Code：

- 处理文件和仓库（读取/搜索/写入，具体取决于你启用的工具）
- 查询数据库（检查 schema、执行查询、生成报告）
- 集成内部服务（将你的 API 封装为 MCP 工具）
- 自动化工作流（将可重复的任务暴露为工具/prompt）

> [!tip]
>
> 如果你在寻找“一键开始”的命令，请直接跳转到[快速开始](#quick-start)。

## 快速开始

Qwen Code 从 `settings.json` 中的 `mcpServers` 加载 MCP 服务器。你可以通过以下两种方式配置服务器：

- 直接编辑 `settings.json`
- 使用 `qwen mcp` 命令（参见 [CLI 参考](#manage-mcp-servers-with-qwen-mcp)）

### 添加你的第一个服务器

1. 添加服务器（示例：远程 HTTP MCP 服务器）：

```bash
qwen mcp add --transport http my-server http://localhost:3000/mcp
```

2. 启动 Qwen Code 并打开 MCP 管理对话框以查看和管理服务器：

```bash
qwen
```

然后输入：

```text
/mcp
```

3. 如果在添加服务器之前 Qwen Code 已经在运行，请在同一项目中重启它。然后要求模型使用该服务器中的工具。

## 配置存储位置（作用域）

大多数用户只需要以下两个作用域：

- **User 作用域（默认）**：机器上所有项目的 `~/.qwen/settings.json`
- **Project 作用域**：项目根目录下的 `.qwen/settings.json`

写入 user 作用域：

```bash
qwen mcp add --scope user --transport http my-server http://localhost:3000/mcp
```

> [!tip]
>
> 有关高级配置层（系统默认值/系统设置和优先级规则），请参见[设置](../configuration/settings)。

## 配置服务器

### 选择传输方式

| 传输方式 | 使用场景                                                       | JSON 字段                               |
| --------- | ----------------------------------------------------------------- | ------------------------------------------- |
| `http`    | 推荐用于远程服务；非常适合云端 MCP 服务器 | `httpUrl`（+ 可选 `headers`）            |
| `sse`     | 仅支持 Server-Sent Events 的旧版/已弃用服务器    | `url`（+ 可选 `headers`）                |
| `stdio`   | 你机器上的本地进程（脚本、CLI、Docker）             | `command`、`args`（+ 可选 `cwd`、`env`） |

> [!note]
>
> 如果服务器同时支持两者，请优先选择 **HTTP** 而不是 **SSE**。

### 通过 `settings.json` 还是 `qwen mcp add` 进行配置

这两种方法都会在 `settings.json` 中生成相同的 `mcpServers` 条目——使用你偏好的任何一种即可。

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

CLI（默认写入 user 作用域）：

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

## 使用 MCP prompt 和 resource

除了工具，Qwen Code 还会发现并展示另外两种 MCP 原语。

### Prompt（斜杠命令）

服务器通过 `prompts/list` 广播的任何 prompt 都会变成可执行的**斜杠命令**。发现后，输入 `/`，你会看到列出的 prompt（标记为 `MCP: <server>`）；像运行其他命令一样运行它：

```text
/my_prompt --arg1="value" --arg2="value"
# 位置参数形式同样有效：
/my_prompt "value" "value"
# 显示 prompt 的参数：
/my_prompt help
```

prompt 的消息会被发送给模型，然后模型会对其采取行动。

> 发现机制对声明的 `prompts` 能力非常宽容：有些服务器实现了 `prompts/list`，但在其 `initialize` 能力中省略了 `prompts`。Qwen Code 无论如何都会尝试调用 `prompts/list`，因此这些 prompt 仍然会出现。如果服务器确实没有 prompt，它只会返回 `Method not found`，这会被忽略。

### Resource

服务器通过 `resources/list` 广播的 resource 会按服务器进行发现。使用 `/mcp` 打开管理对话框并选择一个服务器，即可在其工具和 prompt 旁边看到其 **Resource** 数量。选择 **View resources** 浏览该服务器的 resource URI；选择一个 resource 会显示其描述和 MIME 类型，以及要粘贴到消息中的确切 `@server:uri` 引用。与 prompt 一样，不需要声明 `resources` 能力。

使用 `@server:uri` 语法将 resource 的内容注入到你的消息中——输入 `@`，然后是服务器名称、冒号和 resource URI：

```text
summarize @myserver:file:///docs/spec.md and list the open questions
```

输入 `@myserver:` 会显示该服务器 resource 的自动补全列表；继续输入进行过滤，不区分大小写地匹配 resource URI 或其友好名称/标题。你不必记住 URI——在输入冒号之前，输入部分服务器名称也会建议暴露 resource 的匹配服务器，因此你可以选择一个并直接深入其 resource 列表。提交时，会读取引用的 resource 并将其内容追加到你的消息中（文本内联，二进制 blob 作为附件）；`@server:uri` 引用会保留在 prompt 中，以便模型知道它正在查看什么。`server` 前缀必须匹配已配置的 MCP 服务器——否则该 token 将被视为普通文件路径，因此现有的 `@path/to/file` 引用不受影响。在不受信任的文件夹中，resource 读取会被禁用。

## 渐进式可用性与发现超时

在 UI 已经可交互之后，Qwen Code 会在后台发现 MCP 服务器。即使你的某个 MCP 服务器需要几秒钟（或永远不响应），你也会在几百毫秒内看到 CLI 的第一个提示，并且模型的 tool 列表会在每个服务器完成发现握手后的大约一帧（~16 毫秒）内更新。

- **交互模式**：UI 立即出现；右下角的 MCP 状态指示器在发现过程中显示 `N/M MCP servers ready`。在 MCP 完成之前发送 prompt 仅意味着模型看到的是*当时*已就绪的工具；随着服务器上线，后续的 prompt 会看到更多工具。
- **非交互模式**（`--prompt`、stream-json、ACP）：CLI 仍然会等待 MCP 发现稳定后再发送第一个 prompt，因此脚本化/管道调用会看到与旧版同步行为产生的相同完整工具集。

### 每个服务器的 `discoveryTimeoutMs`

每个 MCP 服务器都有一个仅用于发现的超时时间，它限制了初始握手（`connect` + `tools/list` + `prompts/list` + `resources/list`）允许花费的最长时间。默认值：

- **stdio 服务器**：30 秒
- **远程 HTTP / SSE 服务器**：5 秒（网络风险较高）

必要时可针对每个服务器进行覆盖：

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

现有的 `timeout` 字段是 **tool-call** 超时（用于每个 `tools/call` 请求，默认 10 分钟），不受 `discoveryTimeoutMs` 影响——长时间运行的工具调用不是启动问题。

### 回退渐进式 MCP

如果你需要旧的同步行为（CLI 在显示任何 UI 之前等待每个 MCP 服务器），请在你的环境中设置 `QWEN_CODE_LEGACY_MCP_BLOCKING=1`。这至少会作为一个逃生舱保留一个版本。

## 安全与控制

### 信任（跳过确认）

- **服务器信任**（`trust: true`）：绕过该服务器的确认提示（请谨慎使用）。

### OAuth 身份验证

Qwen Code 支持 MCP 服务器的 OAuth 2.0 身份验证。这在访问需要身份验证的远程服务器时非常有用。

#### 基本用法

当你添加带有 OAuth 凭据的 MCP 服务器时，Qwen Code 将自动处理身份验证流程：

```bash
qwen mcp add --transport sse oauth-server https://api.example.com/sse/ \
  --oauth-client-id your-client-id \
  --oauth-redirect-uri https://your-server.com/oauth/callback \
  --oauth-authorization-url https://provider.example.com/authorize \
  --oauth-token-url https://provider.example.com/token
```

#### 重要提示：Redirect URI 配置

OAuth 流程需要一个 redirect URI，授权提供者会将身份验证代码发送到该 URI。

- **本地开发**：默认情况下，Qwen Code 使用 `http://localhost:7777/oauth/callback`。这在本地机器上使用本地浏览器运行 Qwen Code 时有效。

- **远程/云端部署**：在远程服务器、云端 IDE 或 Web 终端上运行 Qwen Code 时，默认的 `localhost` 重定向**不起作用**。你**必须**将 `--oauth-redirect-uri` 配置为指向可以接收 OAuth 回调的公开可访问 URL。

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

| 属性           | 描述                                                                                                           |
| ------------------ | --------------------------------------------------------------------------------------------------------------------- |
| `enabled`          | 为此服务器启用 OAuth（布尔值）                                                                                |
| `clientId`         | OAuth 客户端标识符（字符串，动态注册时可选）                                                  |
| `clientSecret`     | OAuth 客户端密钥（字符串，公共客户端可选）                                                             |
| `authorizationUrl` | OAuth 授权端点（字符串，如果省略则自动发现）                                                     |
| `tokenUrl`         | OAuth 令牌端点（字符串，如果省略则自动发现）                                                             |
| `scopes`           | 必需的 OAuth 作用域（字符串数组）                                                                              |
| `redirectUri`      | 自定义 redirect URI（字符串）。**对远程部署至关重要**。默认为 `http://localhost:7777/oauth/callback` |
| `tokenParamName`   | SSE URL 中令牌的查询参数名称（字符串）                                                                  |
| `audiences`        | 令牌有效的受众（字符串数组）                                                                   |

#### 令牌管理

OAuth 令牌会自动：

- **存储**在 `~/.qwen/mcp-oauth-tokens.json`（明文，权限 0600）中（默认情况下）。如果设置了 `QWEN_CODE_FORCE_ENCRYPTED_FILE_STORAGE=true`，Qwen Code 会在可用的情况下使用钥匙串支持的存储，或者使用 AES-256-GCM 加密的 `~/.qwen/mcp-oauth-tokens-v2.json`。
- **刷新**：过期时（如果有 refresh token 可用）
- **验证**：在每次连接尝试之前

> [!WARNING]
> 默认情况下，OAuth 令牌以未加密形式存储在磁盘上。在共享或多用户机器上，请设置 `QWEN_CODE_FORCE_ENCRYPTED_FILE_STORAGE=true` 以保护凭据。

使用 Qwen Code 中的 `/mcp` 对话框检查 MCP 服务器并交互式管理身份验证。

### 工具过滤（允许/拒绝每个服务器的工具）

使用 `includeTools` / `excludeTools` 限制服务器暴露的工具（从 Qwen Code 的角度来看）。

示例：仅包含几个工具：

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

你的 `settings.json` 中的 `mcp` 对象定义了所有 MCP 服务器的全局规则：

- `mcp.allowed`：MCP 服务器名称的允许列表（`mcpServers` 中的键）
- `mcp.excluded`：MCP 服务器名称的拒绝列表

这两个列表都支持 glob 模式：`*` 匹配任意字符序列，`?` 匹配单个字符（例如，`"*puppeteer*"` 匹配名称中包含 `puppeteer` 的每个服务器）。没有 glob 字符的条目会进行精确匹配。当服务器同时匹配两个列表时，`mcp.excluded` 优先。

示例：

```json
{
  "mcp": {
    "allowed": ["my-trusted-server", "*-internal"],
    "excluded": ["experimental-server"]
  }
}
```

## 故障排除

- **服务器在 `qwen mcp list` 中显示“Disconnected”**：验证 URL/命令是否正确，然后增加 `timeout`。
- **Stdio 服务器无法启动**：使用绝对 `command` 路径，并仔细检查 `cwd`/`env`。
- **JSON 中的环境变量无法解析**：确保它们存在于 Qwen Code 运行的环境中（shell 与 GUI 应用程序环境可能不同）。

## 参考

### `settings.json` 结构

#### 服务器特定配置（`mcpServers`）

将 `mcpServers` 对象添加到你的 `settings.json` 文件中：

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

| 属性  | 描述                                            |
| --------- | ------------------------------------------------------ |
| `command` | Stdio 传输的可执行文件路径             |
| `url`     | SSE 端点 URL（例如，`"http://localhost:8080/sse"`） |
| `httpUrl` | HTTP 流式端点 URL                            |

可选：

| 属性               | 类型/默认值                 | 描述                                                                                                                                                                                                                                                       |
| ---------------------- | ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `args`                 | array                        | Stdio 传输的命令行参数                                                                                                                                                                                                                        |
| `headers`              | object                       | 使用 `url` 或 `httpUrl` 时的自定义 HTTP 标头                                                                                                                                                                                                                 |
| `env`                  | object                       | 服务器进程的环境变量。值可以使用 `$VAR_NAME` 或 `${VAR_NAME}` 语法引用环境变量                                                                                                                                |
| `cwd`                  | string                       | Stdio 传输的工作目录                                                                                                                                                                                                                             |
| `timeout`              | number<br>(default: 600,000) | 请求超时时间（毫秒）（默认值：600,000 毫秒 = 10 分钟）                                                                                                                                                                                                 |
| `trust`                | boolean<br>(default: false)  | 当为 `true` 时，绕过该服务器的所有工具调用确认（默认值：`false`）                                                                                                                                                                              |
| `includeTools`         | array                        | 从此 MCP 服务器包含的工具名称列表。指定后，仅此处的工具将从该服务器可用（白名单行为）。如果未指定，默认启用服务器的所有工具。                                       |
| `excludeTools`         | array                        | 从此 MCP 服务器排除的工具名称列表。此处列出的工具将对模型不可用，即使它们由服务器暴露。<br>注意：`excludeTools` 优先于 `includeTools` - 如果工具同时存在于两个列表中，它将被排除。 |
| `targetAudience`       | string                       | 在你尝试访问的受 IAP 保护的应用程序上允许列表的 OAuth Client ID。与 `authProviderType: 'service_account_impersonation'` 一起使用。                                                                                                         |
| `targetServiceAccount` | string                       | 要模拟的 Google Cloud Service Account 的电子邮件地址。与 `authProviderType: 'service_account_impersonation'` 一起使用。                                                                                                                              |

<a id="qwen-mcp-cli"></a>

### 使用 `qwen mcp` 管理 MCP 服务器

你始终可以通过手动编辑 `settings.json` 来配置 MCP 服务器，但 CLI 通常更快。

#### 添加服务器（`qwen mcp add`）

```bash
qwen mcp add [options] <name> <commandOrUrl> [args...]
```

| 参数/选项             | 描述                                                         | 默认值                                | 示例                                                            |
| --------------------------- | ------------------------------------------------------------------- | -------------------------------------- | ------------------------------------------------------------------ |
| `<name>`                    | 服务器的唯一名称。                                       | —                                      | `example-server`                                                   |
| `<commandOrUrl>`            | 要执行的命令（对于 `stdio`）或 URL（对于 `http`/`sse`）。 | —                                      | `/usr/bin/python` 或 `http://localhost:8`                          |
| `[args...]`                 | `stdio` 命令的可选参数。                           | —                                      | `--port 5000`                                                      |
| `-s`, `--scope`             | 配置作用域（user 或 project）。                              | `user`                                 | `-s user`                                                          |
| `-t`, `--transport`         | 传输类型（`stdio`、`sse`、`http`）。                            | `stdio`                                | `-t sse`                                                           |
| `-e`, `--env`               | 设置环境变量。                                          | —                                      | `-e KEY=value`                                                     |
| `-H`, `--header`            | 为 SSE 和 HTTP 传输设置 HTTP 标头。                       | —                                      | `-H "X-Api-Key: abc123"`                                           |
| `--timeout`                 | 设置连接超时时间（毫秒）。                             | —                                      | `--timeout 30000`                                                  |
| `--trust`                   | 信任服务器（绕过所有工具调用确认提示）。       | — (`false`)                            | `--trust`                                                          |
| `--description`             | 设置服务器的描述。                                 | —                                      | `--description "Local tools"`                                      |
| `--include-tools`           | 要包含的工具的逗号分隔列表。                         | all tools included                     | `--include-tools mytool,othertool`                                 |
| `--exclude-tools`           | 要排除的工具的逗号分隔列表。                         | none                                   | `--exclude-tools mytool`                                           |
| `--oauth-client-id`         | 用于 MCP 服务器身份验证的 OAuth client ID。                      | —                                      | `--oauth-client-id your-client-id`                                 |
| `--oauth-client-secret`     | 用于 MCP 服务器身份验证的 OAuth client secret。                  | —                                      | `--oauth-client-secret your-client-secret`                         |
| `--oauth-redirect-uri`      | 用于身份验证回调的 OAuth redirect URI。                     | `http://localhost:7777/oauth/callback` | `--oauth-redirect-uri https://your-server.com/oauth/callback`      |
| `--oauth-authorization-url` | OAuth authorization URL。                                            | —                                      | `--oauth-authorization-url https://provider.example.com/authorize` |
| `--oauth-token-url`         | OAuth token URL。                                                    | —                                      | `--oauth-token-url https://provider.example.com/token`             |
| `--oauth-scopes`            | OAuth scopes（逗号分隔）。                                     | —                                      | `--oauth-scopes scope1,scope2`                                     |
> `--oauth-*` 参数仅适用于 `--transport sse` 和 `--transport http`。将其与 `--transport stdio` 组合使用将被拒绝。

#### 移除服务器 (`qwen mcp remove`)

```bash
qwen mcp remove <name>
```