# Qwen Code Extensions

Qwen Code extensions 将 prompts、MCP servers 和自定义命令打包成熟悉且用户友好的格式。通过 extensions，你可以扩展 Qwen Code 的功能，并与他人分享这些功能。它们被设计为易于安装和共享。

## Extension 管理

我们提供了一套 extension 管理工具，使用 `qwen extensions` 命令。

请注意，这些命令在 CLI 内部不被支持，尽管你可以使用 `/extensions list` 子命令列出已安装的 extensions。

请注意，所有这些命令只有在重启后才会在活跃的 CLI 会话中生效。

### 安装扩展

你可以使用 `qwen extensions install` 命令通过 GitHub URL 或本地路径来安装一个扩展。

需要注意的是，我们会创建已安装扩展的一个副本，因此你需要运行 `qwen extensions update` 来同步本地定义的扩展或 GitHub 上的扩展所做的更改。

```
qwen extensions install https://github.com/qwen-cli-extensions/security
```

这将安装 Qwen Code Security 扩展，该扩展提供了对 `/security:analyze` 命令的支持。

### 卸载扩展

要卸载扩展，请运行 `qwen extensions uninstall extension-name`，例如在上面的安装示例中：

```
qwen extensions uninstall qwen-cli-security
```

### 禁用扩展

默认情况下，扩展在所有 workspace 中都是启用的。你可以完全禁用某个扩展，或者仅在特定 workspace 中禁用。

例如，`qwen extensions disable extension-name` 会在用户级别禁用该扩展，因此它在所有地方都会被禁用。而 `qwen extensions disable extension-name --scope=workspace` 只会在当前 workspace 中禁用该扩展。

### 启用扩展

你可以通过 `qwen extensions enable extension-name` 来启用扩展。你也可以在特定 workspace 中启用扩展，只需在该 workspace 内执行 `qwen extensions enable extension-name --scope=workspace`。

如果你在顶层禁用了某个扩展，只在特定地方启用它，这个功能会非常有用。

### 更新扩展

对于从本地路径或 git 仓库安装的扩展，你可以使用 `qwen extensions update extension-name` 显式更新到最新版本（以 `qwen-extension.json` 中的 `version` 字段为准）。

你也可以通过以下命令更新所有扩展：

```
qwen extensions update --all
```

## 扩展开发

我们提供了一些命令来简化扩展的开发流程。

### 创建一个基础扩展模板

我们提供了几个示例扩展：`context`、`custom-commands`、`exclude-tools` 和 `mcp-server`。你可以在[这里](https://github.com/QwenLM/qwen-code/tree/main/packages/cli/src/commands/extensions/examples)查看这些示例。

要将其中一个示例复制到你的开发目录中，请运行：

```
qwen extensions new path/to/directory custom-commands
```

### 链接本地扩展

`qwen extensions link` 命令会在扩展安装目录和开发路径之间创建一个符号链接。

这样做的好处是，当你想要测试代码变更时，无需每次都运行 `qwen extensions update`。

```
qwen extensions link path/to/directory
```

## 工作原理

在启动时，Qwen Code 会从 `<home>/.qwen/extensions` 路径下查找扩展。

每个扩展都是一个包含 `qwen-extension.json` 文件的目录。例如：

`<home>/.qwen/extensions/my-extension/qwen-extension.json`

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

- `name`：扩展的名称。用于唯一标识扩展，并在扩展命令与用户或项目命令同名时进行冲突解析。名称应使用小写字母或数字，并用短横线（dash）代替下划线或空格。这是用户在 CLI 中引用你的扩展的方式。注意，我们期望这个名称与扩展目录名称一致。
- `version`：扩展的版本号。
- `mcpServers`：要配置的 MCP server 映射表。键是 server 的名称，值是 server 的配置。这些 server 将在启动时加载，就像在 [`settings.json` 文件](./cli/configuration.md)中配置的 MCP server 一样。如果扩展和 `settings.json` 文件都配置了同名的 MCP server，则以 `settings.json` 文件中的定义为准。
  - 注意，除了 `trust` 外，所有 MCP server 配置选项均支持。
- `contextFileName`：包含扩展上下文内容的文件名。系统将从扩展目录中加载此文件作为上下文。若未指定该属性但扩展目录中存在 `QWEN.md` 文件，则会自动加载该文件。
- `excludeTools`：一个工具名称数组，表示需要从模型中排除的工具。你也可以对支持命令级限制的工具（如 `run_shell_command`）指定具体命令限制。例如，`"excludeTools": ["run_shell_command(rm -rf)"]` 会阻止执行 `rm -rf` 命令。请注意这与 MCP server 中的 `excludeTools` 功能不同，后者是在 MCP server 配置中列出的。**重要提示：** 在 `excludeTools` 中指定的工具将在整个对话上下文中被禁用，并会影响当前 session 中后续的所有查询。

当 Qwen Code 启动时，它会加载所有扩展并合并它们的配置。如果有任何冲突，工作区配置优先。

### 自定义命令

扩展可以通过在扩展目录内的 `commands/` 子目录中放置 TOML 文件来提供[自定义命令](./cli/commands.md#custom-commands)。这些命令遵循与用户和项目自定义命令相同的格式，并使用标准命名约定。

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

Extension commands 的优先级最低。当与用户或项目 commands 发生冲突时：

1. **无冲突**：Extension command 使用其自然名称（例如，`/deploy`）
2. **有冲突**：Extension command 会以 extension 前缀重命名（例如，`/gcp.deploy`）

举个例子，如果用户和 `gcp` extension 都定义了一个 `deploy` command：

- `/deploy` - 执行用户的 deploy command
- `/gcp.deploy` - 执行 extension 的 deploy command（标记为 `[gcp]` 标签）

## 变量

Qwen Code 扩展支持在 `qwen-extension.json` 中使用变量替换。例如，如果你需要使用当前目录来运行一个 MCP 服务器，可以这样写：`"cwd": "${extensionPath}${/}run.ts"`。

**支持的变量：**

| 变量                        | 描述                                                                                                                                                        |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `${extensionPath}`          | 扩展在用户文件系统中的完整路径，例如：'/Users/username/.qwen/extensions/example-extension'。该路径不会解析符号链接。                                      |
| `${workspacePath}`          | 当前工作区的完整路径。                                                                                                                                     |
| `${/} or ${pathSeparator}`  | 路径分隔符（因操作系统而异）。                                                                                                                             |