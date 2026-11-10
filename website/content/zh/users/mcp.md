# MCP 服务器

MCP 让 Qwen Code 使用外部服务器提供的工具、资源和提示词。服务器必须可连接且已启用，能力才能使用。配置服务器不会授予服务凭据，也不会绕过工具权限。

## 添加服务器

已经安装的本地服务器程序：

```bash
qwen mcp add --scope user local-tools /absolute/path/to/mcp-server
```

远程 Streamable HTTP 服务器：

```bash
qwen mcp add --scope user --transport http team-tools https://mcp.example.com/mcp
```

请替换为实际路径和 URL。未指定 `--transport` 时，形如 URL 的参数（以 `http://`、`https://` 或 `localhost` 开头，或以 `/sse`、`/mcp` 结尾）使用 `http`，其他参数使用 stdio。使用 `sse` 或 `ws` 时需显式传入 `--transport sse` 或 `--transport ws`。可执行文件后的参数会传给服务器；与 CLI 参数可能混淆时，使用 `--` 分隔服务器参数。完整选项见 `qwen mcp add --help`。

```bash
qwen mcp list
qwen mcp get team-tools
qwen mcp disable team-tools
qwen mcp enable team-tools
qwen mcp remove team-tools
```

交互会话中使用 `/mcp` 查看服务器及连接状态。连接失败影响对应服务器，应先检查诊断消息，再决定是否需要修改模型配置。

## 配置作用域

| 作用域 | 写入位置 |
| --- | --- |
| `user` | `~/.qwen/settings.json` 的 `mcpServers` |
| `local`（默认） | `.qwen/settings.local.json` 的 `mcpServers` |
| `project` | 项目根目录的 `.mcp.json` |

`--config-dir` 改变用户配置根目录。新增项目服务器写入 `.mcp.json`；仍会读取 `.qwen/settings.json` 中的旧配置，项目配置内同名时 `.mcp.json` 优先。当前目录为用户主目录时，不能写入 local 或 project 作用域。

在交互会话中，项目服务器受项目信任和服务器批准控制。非交互运行（`-p`、管道输入输出、CI）会直接启动未被拒绝的项目服务器，不再询问。仓库中提交了 `.mcp.json`，不代表其中所有命令都已获准执行。`qwen mcp reset-project-choices` 可以重置记住的项目服务器选择。本地配置应排除在版本控制之外。

`.mcp.json` 示例：

```json
{
  "mcpServers": {
    "local-tools": {
      "command": "/absolute/path/to/mcp-server",
      "args": ["--read-only"]
    }
  }
}
```

程序路径和 `--read-only` 仅为示意，必须换成服务器真正支持的值。也可以通过 JSON 添加单个服务器：

```bash
qwen mcp add-json --scope user local-tools '{"command":"/absolute/path/to/mcp-server","args":[]}'
```

此参数直接传入单个服务器配置，不包含外层 `mcpServers`。

## 认证与隔离

`--env` 设置 stdio 进程环境，`--header` 设置 HTTP/SSE 请求头。这些值可能持久保存，避免把真实密钥写入共享文件或 Shell 历史。`--headers-helper` 可通过外部脚本获得动态 HTTP 请求头。HTTP/SSE OAuth 支持 `--client-id`、`--client-secret`（交互输入或 `MCP_CLIENT_SECRET`）和 `--callback-port`；能否使用取决于服务器认证能力。

单次运行也可以不创建持久条目：

```bash
qwen --mcp-config ./mcp-for-task.json --strict-mcp-config
```

`mcp-for-task.json` 使用上面的 `mcpServers` 结构。`--mcp-config` 接受 JSON 文件或内联 JSON，可重复指定。`--strict-mcp-config` 只使用显式提供的 MCP 配置，不再加载常规服务器来源。工具访问范围仍需通过权限及工具配置单独限制。

## 故障排查

- **Stdio 无法启动：**独立运行程序，检查绝对路径、运行时依赖和环境；stdout 必须承载 MCP 协议，诊断输出应写入 stderr。
- **HTTP 连接或认证失败：**检查 URL、传输类型、代理和服务认证；普通网页不是 MCP 端点。
- **配置了但列表没有：**检查作用域、项目信任、已保存的批准、启用状态，以及是否被 `--strict-mcp-config` 排除。
- **缺少工具：**检查服务器声明了哪些能力，以及工具允许/禁止配置；连接成功不代表所有能力都属于工具。
- **服务器重名：**使用 `get` 查看已有条目，移除或改名后再向同一作用域添加。

插件提供的服务器见[插件](/zh/users/plugins/)，自动化使用见[非交互脚本](/zh/users/headless/)。
