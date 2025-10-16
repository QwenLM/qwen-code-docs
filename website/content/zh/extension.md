# Qwen Code Extensions

Qwen Code 支持扩展，可用于配置和扩展其功能。

## 工作原理

启动时，Qwen Code 会在两个位置查找扩展：

1.  `<workspace>/.qwen/extensions`
2.  `<home>/.qwen/extensions`

Qwen Code 会从这两个位置加载所有扩展。如果两个位置存在同名的扩展，则工作区目录中的扩展会优先加载。

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

- `name`：扩展的名称。用于唯一标识扩展，并在扩展命令与用户或项目命令重名时进行冲突处理。
- `version`：扩展的版本。
- `mcpServers`：需要配置的 MCP server 映射。键为 server 名称，值为对应的 server 配置。这些 servers 会在启动时加载，就像在 [`settings.json` 文件](./cli/configuration.md) 中配置的 MCP servers 一样。如果某个 server 在扩展和 `settings.json` 中都被定义了，则以 `settings.json` 中的配置为准。
- `contextFileName`：包含扩展上下文内容的文件名。系统将使用此文件从 workspace 中加载上下文。如果未指定该属性，但扩展目录中存在 `QWEN.md` 文件，则会自动加载该文件。
- `excludeTools`：要从模型中排除的工具名称数组。你也可以对支持命令级限制的工具（如 `run_shell_command`）指定具体命令限制。例如，`"excludeTools": ["run_shell_command(rm -rf)"]` 将阻止执行 `rm -rf` 命令。

当 Qwen Code 启动时，它会加载所有扩展并合并它们的配置。如果有任何配置冲突，workspace 中的配置优先级更高。

## 扩展命令

扩展可以通过在扩展目录内的 `commands/` 子目录中放置 TOML 文件来提供[自定义命令](./cli/commands.md#custom-commands)。这些命令遵循与用户和项目自定义命令相同的格式，并使用标准命名约定。

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

Extension commands 的优先级最低。当与用户或项目 commands 发生冲突时：

1. **无冲突**：Extension command 使用其自然名称（例如，`/deploy`）
2. **有冲突**：Extension command 会以 extension 前缀重命名（例如，`/gcp.deploy`）

举个例子，如果用户和 `gcp` extension 都定义了一个 `deploy` command：

- `/deploy` - 执行用户的 deploy command
- `/gcp.deploy` - 执行 extension 的 deploy command（标记为 `[gcp]` tag）

## 安装 Extensions

你可以使用 `install` command 来安装 extensions。该 command 允许你从 Git repository 或本地路径安装 extensions。

### 用法

`qwen extensions install <source> | [options]`

### 选项

- `source <url> positional argument`：Git 仓库的 URL，用于安装扩展。该仓库的根目录下必须包含一个 `qwen-extension.json` 文件。
- `--path <path>`：本地目录的路径，用于安装为扩展。该目录下必须包含一个 `qwen-extension.json` 文件。

# 变量

Qwen Code 扩展支持在 `qwen-extension.json` 中使用变量替换。例如，如果你需要使用当前目录来运行一个 MCP 服务器，可以这样写：`"cwd": "${extensionPath}${/}run.ts"`。

**支持的变量：**

| 变量                       | 描述                                                                                                                                                        |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `${extensionPath}`         | 扩展在用户文件系统中的完整路径，例如：'/Users/username/.qwen/extensions/example-extension'。该路径不会解析符号链接。                                      |
| `${/} or ${pathSeparator}` | 路径分隔符（因操作系统而异）。                                                                                                                              |