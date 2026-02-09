# 通过 MCP 将 Qwen Code 连接到工具

Qwen Code 可以通过 [Model Context Protocol (MCP)](https://modelcontextprotocol.io/introduction) 连接到外部工具和数据源。MCP 服务器使 Qwen Code 能够访问你的工具、数据库和 API。

## 使用 MCP 可以做什么

连接 MCP 服务器后，你可以让 Qwen Code：

- 处理文件和代码仓库（读取/搜索/写入，取决于启用的工具）
- 查询数据库（模式检查、查询、报告）
- 集成内部服务（将你的 API 包装为 MCP 工具）
- 自动化工作流（将可重复任务暴露为工具/提示）

> [!tip]
>
> 如果你想找“一条命令快速开始”，请跳转到[快速开始](#quick-start)。

## 快速开始

Qwen Code 从 `settings.json` 中的 `mcpServers` 加载 MCP 服务器。你可以通过以下方式配置服务器：

- 直接编辑 `settings.json`
- 使用 `qwen mcp` 命令（参见 [CLI 参考](#qwen-mcp-cli)）

### 添加你的第一个服务器

1. 添加一个服务器（例如：远程 HTTP MCP 服务器）：

```bash
qwen mcp add --transport http my-server http://localhost:3000/mcp
```

2. 验证它是否显示出来：

```bash
qwen mcp list
```

3. 在同一项目中重启 Qwen Code（或者如果尚未运行则启动它），然后让模型使用来自该服务器的工具。

## 配置存储位置（作用域）

大多数用户只需要以下两个作用域：

- **项目作用域（默认）**：项目根目录下的 `.qwen/settings.json`
- **用户作用域**：你机器上所有项目的 `~/.qwen/settings.json`

写入用户作用域：

```bash
qwen mcp add --scope user --transport http my-server http://localhost:3000/mcp
```

> [!tip]
>
> 关于高级配置层（系统默认值/系统设置和优先级规则），请参见 [设置](../configuration/settings)。

## 配置服务器

### 选择传输方式

| 传输方式  | 使用场景                                                         | JSON 字段                                  |
| --------- | ---------------------------------------------------------------- | ------------------------------------------ |
| `http`    | 推荐用于远程服务；适用于云 MCP 服务器                           | `httpUrl`（+ 可选的 `headers`）            |
| `sse`     | 仅支持服务器发送事件（Server-Sent Events）的旧版/已弃用服务器    | `url`（+ 可选的 `headers`）                |
| `stdio`   | 本机上的本地进程（脚本、CLI、Docker）                            | `command`，`args`（+ 可选的 `cwd`，`env`） |

> [!note]
>
> 如果服务器同时支持两种方式，请优先使用 **HTTP** 而非 **SSE**。

### 通过 `settings.json` 与 `qwen mcp add` 进行配置

两种方式都会在你的 `settings.json` 中生成相同的 `mcpServers` 条目——你可以根据喜好任选其一。

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

CLI（默认写入项目范围）：

```bash
qwen mcp add pythonTools -e DATABASE_URL=$DB_CONNECTION_STRING -e API_KEY=$EXTERNAL_API_KEY \
  --timeout 15000 python -m my_mcp_server --port 8080
```

#### HTTP 服务器（远程可流式 HTTP）

JSON:

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

CLI:

```bash
qwen mcp add --transport http httpServerWithAuth http://localhost:3000/mcp \
  --header "Authorization: Bearer your-api-token" --timeout 5000
```

#### SSE 服务器（远程服务器发送事件）

JSON:

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

CLI:

```bash
qwen mcp add --transport sse sseServer http://localhost:8080/sse --timeout 30000
```

## 安全与控制

### 信任（跳过确认）

- **服务器信任** (`trust: true`)：为该服务器跳过确认提示（请谨慎使用）。

### 工具过滤（按服务器允许/拒绝工具）

使用 `includeTools` / `excludeTools` 来限制服务器暴露的工具（从 Qwen Code 的角度来看）。

示例：仅包含少数几个工具：

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

在你的 `settings.json` 中，`mcp` 对象定义了适用于所有 MCP 服务器的全局规则：

- `mcp.allowed`：MCP 服务器名称的允许列表（即 `mcpServers` 中的键）
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

- **在 `qwen mcp list` 中显示“Disconnected”**：验证 URL/命令是否正确，然后增加 `timeout`。
- **Stdio 服务器启动失败**：使用绝对路径的 `command`，并仔细检查 `cwd`/`env`。
- **JSON 中的环境变量未解析**：确保它们存在于运行 Qwen Code 的环境中（shell 与 GUI 应用程序环境可能不同）。

## 参考

### `settings.json` 结构

#### 服务器特定配置 (`mcpServers`)

在你的 `settings.json` 文件中添加一个 `mcpServers` 对象：

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

| 属性      | 描述                                  |
| --------- | ------------------------------------- |
| `command` | Stdio 传输的可执行文件路径            |
| `url`     | SSE 端点 URL（例如，`"http://localhost:8080/sse"`） |
| `httpUrl` | HTTP 流式传输端点 URL                 |

可选：

| 属性                   | 类型/默认值                     | 描述                                                                                                                                                                                                                                                           |
| ---------------------- | ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `args`                 | 数组                            | Stdio 传输的命令行参数                                                                                                                                                                                                                                        |
| `headers`              | 对象                            | 使用 `url` 或 `httpUrl` 时的自定义 HTTP 头部                                                                                                                                                                                                                  |
| `env`                  | 对象                            | 服务器进程的环境变量。值可以使用 `$VAR_NAME` 或 `${VAR_NAME}` 语法引用环境变量                                                                                                                                                                                  |
| `cwd`                  | 字符串                          | Stdio 传输的工作目录                                                                                                                                                                                                                                          |
| `timeout`              | 数字<br>（默认：600,000）       | 请求超时时间（毫秒），默认为 600,000 毫秒（即 10 分钟）                                                                                                                                                                                                       |
| `trust`                | 布尔值<br>（默认：false）       | 当设置为 `true` 时，将跳过该服务器的所有工具调用确认（默认为 `false`）                                                                                                                                                                                        |
| `includeTools`         | 数组                            | 要从该 MCP 服务器包含的工具名称列表。指定后，仅此处列出的工具将可用（白名单行为）。如果未指定，则默认启用服务器提供的所有工具。                                                                                                                               |
| `excludeTools`         | 数组                            | 要从该 MCP 服务器排除的工具名称列表。即使服务器暴露了这些工具，模型也无法访问。<br>注意：`excludeTools` 的优先级高于 `includeTools` —— 如果某个工具同时出现在两个列表中，它将被排除。                                                                      |
| `targetAudience`       | 字符串                          | 你尝试访问的受 IAP 保护的应用程序上列入白名单的 OAuth 客户端 ID。与 `authProviderType: 'service_account_impersonation'` 配合使用。                                                                                                                             |
| `targetServiceAccount` | 字符串                          | 要模拟的 Google Cloud 服务账户的电子邮件地址。与 `authProviderType: 'service_account_impersonation'` 配合使用。                                                                                                                                               |

<a id="qwen-mcp-cli"></a>

### 使用 `qwen mcp` 管理 MCP 服务器

你始终可以通过手动编辑 `settings.json` 来配置 MCP 服务器，但使用 CLI 通常更快。

#### 添加服务器 (`qwen mcp add`)

```bash
qwen mcp add [options] <name> <commandOrUrl> [args...]
```

| 参数/选项           | 描述                                                               | 默认值             | 示例                                     |
| ------------------- | ------------------------------------------------------------------ | ------------------ | ---------------------------------------- |
| `<name>`            | 服务器的唯一名称。                                                 | —                  | `example-server`                         |
| `<commandOrUrl>`    | 要执行的命令（用于 `stdio`）或 URL（用于 `http`/`sse`）。          | —                  | `/usr/bin/python` 或 `http://localhost:8` |
| `[args...]`         | `stdio` 命令的可选参数。                                           | —                  | `--port 5000`                            |
| `-s`, `--scope`     | 配置范围（用户或项目）。                                            | `project`          | `-s user`                                |
| `-t`, `--transport` | 传输类型（`stdio`、`sse`、`http`）。                               | `stdio`            | `-t sse`                                 |
| `-e`, `--env`       | 设置环境变量。                                                      | —                  | `-e KEY=value`                           |
| `-H`, `--header`    | 为 SSE 和 HTTP 传输设置 HTTP 头。                                   | —                  | `-H "X-Api-Key: abc123"`                 |
| `--timeout`         | 设置连接超时时间（毫秒）。                                          | —                  | `--timeout 30000`                        |
| `--trust`           | 信任该服务器（跳过所有工具调用确认提示）。                          | — (`false`)        | `--trust`                                |
| `--description`     | 设置服务器描述。                                                    | —                  | `--description "Local tools"`            |
| `--include-tools`   | 包含的工具列表，以逗号分隔。                                        | 包含所有工具       | `--include-tools mytool,othertool`       |
| `--exclude-tools`   | 排除的工具列表，以逗号分隔。                                        | 无                 | `--exclude-tools mytool`                 |

#### 列出服务器 (`qwen mcp list`)

```bash
qwen mcp list
```

#### 删除服务器 (`qwen mcp remove`)

```bash
qwen mcp remove <name>
```