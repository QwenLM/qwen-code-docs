# Qwen Code Extensions

Qwen Code Extensions 将 prompts、MCP servers 和自定义命令打包成一种熟悉且用户友好的格式。通过 extensions，你可以扩展 Qwen Code 的功能，并与他人共享这些功能。它们被设计为易于安装和分享。

## Extension 管理

我们提供了一套 extension 管理工具，使用 `qwen extensions` 命令。

请注意，这些命令不支持在 CLI 内部使用，不过你可以使用 `/extensions list` 子命令来列出已安装的 extensions。

请注意，所有这些命令只有在 CLI 会话重启后才会生效。

### 安装扩展

你可以使用 `qwen extensions install` 命令通过 GitHub URL 或本地路径来安装一个扩展。

需要注意的是，我们会创建所安装扩展的一个副本，因此你需要运行 `qwen extensions update` 来同步本地定义的扩展或 GitHub 上扩展的变更。

```
qwen extensions install https://github.com/qwen-cli-extensions/security
```

这将安装 Qwen Code Security 扩展，该扩展提供了对 `/security:analyze` 命令的支持。

### 卸载扩展

要卸载扩展，请运行 `qwen extensions uninstall extension-name`，例如对于上面安装的扩展：

```
qwen extensions uninstall qwen-cli-security
```

### 禁用扩展

扩展默认在所有 workspace 中都是启用的。你可以完全禁用某个扩展，或者仅在特定 workspace 中禁用。

例如，`qwen extensions disable extension-name` 会在用户级别禁用该扩展，因此它在所有地方都会被禁用。而 `qwen extensions disable extension-name --scope=workspace` 只会在当前 workspace 中禁用该扩展。

### 启用扩展

你可以使用 `qwen extensions enable extension-name` 来启用扩展。你也可以在特定 workspace 中启用扩展，只需在该 workspace 内执行 `qwen extensions enable extension-name --scope=workspace`。

如果你在全局禁用了某个扩展，但只希望在特定地方启用它，这个功能会非常有用。

### 更新扩展

对于从本地路径或 Git 仓库安装的扩展，你可以通过 `qwen extensions update extension-name` 显式更新到最新版本（以 `qwen-extension.json` 中的 `version` 字段为准）。

你也可以一次性更新所有扩展：

```
qwen extensions update --all
```

## 扩展开发

我们提供了一些命令来简化扩展的开发流程。

### 创建一个基础扩展模板

我们内置了几个示例扩展：`context`、`custom-commands`、`exclude-tools` 和 `mcp-server`。你可以在[这里](https://github.com/QwenLM/qwen-code/tree/main/packages/cli/src/commands/extensions/examples)查看这些示例。

如果你想将其中一个示例复制到你的开发目录中，可以运行以下命令（以 `custom-commands` 为例）：

```
qwen extensions new path/to/directory custom-commands
```

### 链接本地扩展

`qwen extensions link` 命令会在扩展安装目录和开发路径之间创建一个符号链接。

这样做的好处是，当你想要测试代码变更时，不需要每次都运行 `qwen extensions update`。

```
qwen extensions link path/to/directory
```

## 工作原理

在启动时，Qwen Code 会从 `<home>/.qwen/extensions` 目录下查找扩展。

扩展会以包含 `qwen-extension.json` 文件的目录形式存在。例如：

`<home>/.qwen/extensions/my-extension/qwen-extension.json`

### `qwen-extension.json`

`qwen-extension.json` 文件包含了 extension 的配置信息。该文件的结构如下：

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

- `name`：extension 的名称。用于唯一标识该 extension，并在 extension 命令与用户或项目命令重名时进行冲突处理。名称应使用小写字母或数字，并使用短横线（-）代替下划线（_）或空格。这是用户在 CLI 中引用你的 extension 的方式。注意，我们期望这个名称与 extension 目录名称一致。
- `version`：extension 的版本号。
- `mcpServers`：需要配置的 MCP server 映射。键为 server 名称，值为 server 的配置。这些 server 会在启动时加载，就像在 [`settings.json` 文件](./cli/configuration.md) 中配置的 MCP server 一样。如果 extension 和 `settings.json` 文件都配置了同名的 MCP server，则以 `settings.json` 文件中的配置为准。
  - 注意，除了 `trust` 选项外，所有 MCP server 的配置选项均支持。
- `contextFileName`：包含 extension 上下文信息的文件名。系统会从 extension 目录中加载该文件。如果未指定该属性，但 extension 目录中存在 `QWEN.md` 文件，则会自动加载该文件。
- `excludeTools`：要从模型中排除的工具名称数组。你也可以对支持该功能的工具指定命令级别的限制，例如 `run_shell_command` 工具。例如，`"excludeTools": ["run_shell_command(rm -rf)"]` 会阻止执行 `rm -rf` 命令。注意，这与 MCP server 配置中的 `excludeTools` 功能不同，后者是在 MCP server 配置中列出的。

当 Qwen Code 启动时，它会加载所有 extension 并合并它们的配置。如果存在配置冲突，workspace 的配置优先级更高。

### 自定义命令

扩展可以通过在扩展目录内的 `commands/` 子目录中放置 TOML 文件来提供 [自定义命令](./cli/commands.md#custom-commands)。这些命令遵循与用户和项目自定义命令相同的格式，并使用标准命名约定。

**示例**

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

## 变量

Qwen Code 扩展支持在 `qwen-extension.json` 中使用变量替换。例如，如果你需要使用 `"cwd": "${extensionPath}${/}run.ts"` 来运行一个 MCP 服务器，这将非常有用。

**支持的变量：**

| 变量                       | 描述                                                                                                                                                        |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `${extensionPath}`         | 扩展在用户文件系统中的完整路径，例如 '/Users/username/.qwen/extensions/example-extension'。该路径不会解析符号链接。                                      |
| `${workspacePath}`         | 当前工作区的完整路径。                                                                                                                                      |
| `${/} or ${pathSeparator}` | 路径分隔符（因操作系统而异）。                                                                                                                              |