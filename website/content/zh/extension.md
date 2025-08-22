# Qwen Code Extensions

Qwen Code 支持扩展，可用于配置和扩展其功能。

## 工作原理

启动时，Qwen Code 会在两个位置查找扩展：

1.  `<workspace>/.qwen/extensions`
2.  `<home>/.qwen/extensions`

Qwen Code 会从这两个位置加载所有扩展。如果两个位置存在同名扩展，则工作区目录中的扩展优先级更高。

在每个位置中，单个扩展以包含 `qwen-extension.json` 文件的目录形式存在。例如：

`<workspace>/.qwen/extensions/my-extension/qwen-extension.json`

### `qwen-extension.json`

`qwen-extension.json` 文件包含扩展的配置信息。该文件具有以下结构：

```json
{
  "name": "my-extension",
  "version": "1.0.0",
  "mcpServers": {
    "my-server": {
      "command": "node my-server.js"
    }
  },
  "contextFileName": "QWEN.md",
  "excludeTools": ["run_shell_command"]
}
```

- `name`：扩展的名称。用于唯一标识扩展，并在扩展命令与用户或项目命令同名时进行冲突处理。
- `version`：扩展的版本。
- `mcpServers`：需要配置的 MCP 服务器映射。键为服务器名称，值为服务器配置。这些服务器将在启动时加载，就像在 [`settings.json` 文件](./cli/configuration.md) 中配置的 MCP 服务器一样。如果扩展和 `settings.json` 文件都配置了同名的 MCP 服务器，则以 `settings.json` 文件中定义的服务器为准。
- `contextFileName`：包含扩展上下文的文件名。将用于从工作区加载上下文。如果未指定此属性，但扩展目录中存在 `QWEN.md` 文件，则会自动加载该文件。
- `excludeTools`：要从模型中排除的工具名称数组。你还可以对支持该功能的工具（如 `run_shell_command`）指定命令级别的限制。例如，`"excludeTools": ["run_shell_command(rm -rf)"]` 将阻止执行 `rm -rf` 命令。

当 Qwen Code 启动时，它会加载所有扩展并合并它们的配置。如果存在任何冲突，工作区配置将具有更高的优先级。

## 扩展命令

扩展可以通过在扩展目录内的 `commands/` 子目录中放置 TOML 文件来提供 [自定义命令](./cli/commands.md#custom-commands)。这些命令遵循与用户和项目自定义命令相同的格式，并使用标准命名约定。

### 示例

一个名为 `gcp` 的扩展，具有以下结构：

```
.qwen/extensions/gcp/
├── qwen-extension.json
└── commands/
    ├── deploy.toml
    └── gcs/
        └── sync.toml
```

将提供以下命令：

- `/deploy` - 在帮助信息中显示为 `[gcp] Custom command from deploy.toml`
- `/gcs:sync` - 在帮助信息中显示为 `[gcp] Custom command from sync.toml`

### 冲突解决

Extension commands 的优先级最低。当与 user 或 project commands 发生冲突时：

1. **无冲突**：Extension command 使用其自然名称（例如，`/deploy`）
2. **有冲突**：Extension command 会以 extension 前缀重命名（例如，`/gcp.deploy`）

例如，如果 user 和 `gcp` extension 都定义了一个 `deploy` command：

- `/deploy` - 执行 user 的 deploy command
- `/gcp.deploy` - 执行 extension 的 deploy command（标记为 `[gcp]` tag）