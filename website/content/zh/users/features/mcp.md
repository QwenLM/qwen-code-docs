# 通过 MCP 将 Qwen Code 连接到工具

Qwen Code 可通过 [模型上下文协议（MCP）](https://modelcontextprotocol.io/introduction) 连接到外部工具和数据源。MCP 服务器使 Qwen Code 能够访问您的工具、数据库和 API。

## 使用 MCP 可实现的功能

连接 MCP 服务器后，您可以要求 Qwen Code 执行以下操作：

- 操作文件与代码仓库（读取/搜索/写入，具体取决于您启用的工具）
- 查询数据库（检查数据库结构、执行查询、生成报告）
- 集成内部服务（将您的 API 封装为 MCP 工具）
- 自动化工作流（将可重复任务作为工具或提示词暴露出来）

> [!tip]
>
> 如果您想直接运行“一条命令快速开始”，请跳转至 [快速开始](#quick-start)。

## 快速开始

Qwen Code 从 `settings.json` 中的 `mcpServers` 字段加载 MCP 服务器。您可通过以下任一方式配置服务器：

- 直接编辑 `settings.json` 文件
- 使用 `qwen mcp` 命令（参见 [CLI 参考](#qwen-mcp-cli)）

### 添加你的第一台服务器

1. 添加一台服务器（示例：远程 HTTP MCP 服务器）：

```bash
qwen mcp add --transport http my-server http://localhost:3000/mcp
```

2. 打开 MCP 管理对话框，以查看和管理服务器：

```bash
qwen mcp
```

3. 在同一项目中重启 Qwen Code（如果尚未运行，则启动它），然后提示模型使用该服务器提供的工具。

## 配置的存储位置（作用域）

大多数用户只需关注以下两个作用域：

- **项目作用域（默认）**：位于项目根目录下的 `.qwen/settings.json`
- **用户作用域**：位于 `~/.qwen/settings.json`，对本机所有项目生效

写入用户作用域：

```bash
qwen mcp add --scope user --transport http my-server http://localhost:3000/mcp
```

> [!tip]
>
> 如需了解高级配置层级（如系统默认值、系统设置及其优先级规则），请参阅[设置](../configuration/settings)。

## 配置服务器

### 选择传输协议

| 传输协议 | 使用场景                                                                 | JSON 字段                                     |
| -------- | ------------------------------------------------------------------------ | --------------------------------------------- |
| `http`   | 推荐用于远程服务；适用于云端 MCP 服务器                                 | `httpUrl`（+ 可选 `headers`）                 |
| `sse`    | 仅支持服务器发送事件（Server-Sent Events）的旧版/已弃用服务器           | `url`（+ 可选 `headers`）                     |
| `stdio`  | 运行在本地机器上的进程（脚本、CLI、Docker）                             | `command`、`args`（+ 可选 `cwd`、`env`）     |

> [!note]
>
> 若服务器同时支持两种协议，请优先选用 **HTTP**，而非 **SSE**。

### 通过 `settings.json` 或 `qwen mcp add` 进行配置

两种方式均会在你的 `settings.json` 中生成相同的 `mcpServers` 条目——任选其一即可。

#### 标准输入输出（Stdio）服务器（本地进程）

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

#### HTTP 服务器（支持远程流式传输的 HTTP）

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

### 信任机制（跳过确认提示）

- **服务器信任**（`trust: true`）：对该服务器跳过所有确认提示（请谨慎使用）。

### 工具过滤（按服务器允许/拒绝工具）

使用 `includeTools` / `excludeTools` 限制服务器对外暴露的工具（从 Qwen Code 的视角）。

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

`settings.json` 中的 `mcp` 对象定义了适用于所有 MCP 服务器的全局规则：

- `mcp.allowed`：允许的 MCP 服务器名称列表（即 `mcpServers` 中的键）
- `mcp.excluded`：拒绝的 MCP 服务器名称列表

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

- **服务器在 `qwen mcp list` 中显示“已断开连接”**：请确认 URL 或命令是否正确，然后增大 `timeout` 值。
- **Stdio 服务器无法启动**：请使用绝对路径指定 `command`，并仔细检查 `cwd` 和 `env` 配置。
- **JSON 中的环境变量未被解析**：请确保这些环境变量存在于 Qwen Code 运行的环境中（Shell 环境与 GUI 应用程序环境可能不同）。

## 参考文档

### `settings.json` 结构

#### 服务器特定配置（`mcpServers`）

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

**必需（以下任选其一）：**

| 属性       | 描述                             |
| ---------- | -------------------------------- |
| `command`  | Stdio 传输所用可执行文件的路径   |
| `url`      | SSE 端点 URL（例如 `"http://localhost:8080/sse"`） |
| `httpUrl`  | HTTP 流式传输端点 URL            |

**可选：**

| 属性               | 类型/默认值                  | 描述                                                                                                                                                                                                                                                       |
| ------------------ | ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `args`             | 数组                         | Stdio 传输的命令行参数                                                                                                                                                                                                                                     |
| `headers`          | 对象                         | 使用 `url` 或 `httpUrl` 时自定义的 HTTP 请求头                                                                                                                                                                                                              |
| `env`              | 对象                         | 服务器进程的环境变量。变量值可使用 `$VAR_NAME` 或 `${VAR_NAME}` 语法引用环境变量                                                                                                                                                                             |
| `cwd`              | 字符串                       | Stdio 传输的工作目录                                                                                                                                                                                                                                       |
| `timeout`          | 数字<br>（默认：600,000）     | 请求超时时间（毫秒），默认为 600,000 毫秒（即 10 分钟）                                                                                                                                                                                                     |
| `trust`            | 布尔值<br>（默认：`false`）   | 若设为 `true`，则跳过对该服务器的所有工具调用确认（默认为 `false`）                                                                                                                                                                                          |
| `includeTools`     | 数组                         | 从此 MCP 服务器中启用的工具名称列表。若指定该字段，则仅列表中所列工具对该服务器可用（白名单行为）；若未指定，则默认启用该服务器提供的全部工具。                                                                                                                  |
| `excludeTools`     | 数组                         | 从此 MCP 服务器中禁用的工具名称列表。即使服务器暴露了这些工具，模型也无法调用它们。<br>注意：`excludeTools` 的优先级高于 `includeTools` —— 若某工具同时出现在两个列表中，它将被禁用。                                                                                   |
| `targetAudience`   | 字符串                       | 你尝试访问的 IAP 保护应用上已加入白名单的 OAuth 客户端 ID。与 `authProviderType: 'service_account_impersonation'` 配合使用。                                                                                                                                  |
| `targetServiceAccount` | 字符串                   | 要模拟的 Google Cloud 服务账号的邮箱地址。与 `authProviderType: 'service_account_impersonation'` 配合使用。                                                                                                                                                 |

<a id="qwen-mcp-cli"></a>

### 使用 `qwen mcp` 管理 MCP 服务器

你始终可以通过手动编辑 `settings.json` 来配置 MCP 服务器，但使用 CLI 通常更快。

#### 添加服务器（`qwen mcp add`）

```bash
qwen mcp add [选项] <名称> <命令或 URL> [参数...]
```

| 参数/选项           | 说明                                                                 | 默认值             | 示例                                       |
| ------------------- | -------------------------------------------------------------------- | ------------------ | ------------------------------------------ |
| `<名称>`            | 服务器的唯一名称。                                                   | —                  | `example-server`                           |
| `<命令或 URL>`      | 要执行的命令（适用于 `stdio`）或 URL（适用于 `http`/`sse`）。         | —                  | `/usr/bin/python` 或 `http://localhost:8` |
| `[参数...]`         | `stdio` 命令的可选参数。                                             | —                  | `--port 5000`                              |
| `-s`, `--scope`     | 配置作用域（用户级或项目级）。                                       | `project`          | `-s user`                                  |
| `-t`, `--transport` | 传输类型（`stdio`、`sse`、`http`）。                                   | `stdio`            | `-t sse`                                   |
| `-e`, `--env`       | 设置环境变量。                                                       | —                  | `-e KEY=value`                             |
| `-H`, `--header`    | 为 SSE 和 HTTP 传输设置 HTTP 请求头。                                | —                  | `-H "X-Api-Key: abc123"`                   |
| `--timeout`         | 设置连接超时时间（毫秒）。                                           | —                  | `--timeout 30000`                          |
| `--trust`           | 信任该服务器（跳过所有工具调用确认提示）。                             | —（`false`）        | `--trust`                                  |
| `--description`     | 设置服务器描述。                                                     | —                  | `--description "本地工具"`                 |
| `--include-tools`   | 要包含的工具列表（逗号分隔）。                                       | 包含全部工具       | `--include-tools mytool,othertool`         |
| `--exclude-tools`   | 要排除的工具列表（逗号分隔）。                                       | 不排除任何工具     | `--exclude-tools mytool`                   |

#### 移除服务器（`qwen mcp remove`）

```bash
qwen mcp remove <name>
```