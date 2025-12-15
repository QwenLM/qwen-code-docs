# Qwen Code 扩展

Qwen Code 扩展将提示、MCP 服务器和自定义命令打包成熟悉且用户友好的格式。通过扩展，你可以扩展 Qwen Code 的功能，并与他人共享这些功能。它们被设计为易于安装和共享。

## 扩展管理

我们提供了一套使用 `qwen extensions` 命令的扩展管理工具。

请注意，这些命令在 CLI 内部不受支持，但你可以使用 `/extensions list` 子命令列出已安装的扩展。

请注意，所有这些命令仅在重启后才会在活动的 CLI 会话中生效。

### 安装扩展

你可以使用 `qwen extensions install` 命令通过 GitHub URL 或本地路径来安装一个扩展。

请注意，我们会创建已安装扩展的副本，因此你需要运行 `qwen extensions update` 来从本地定义的扩展或 GitHub 上的扩展中拉取更改。

```
qwen extensions install https://github.com/qwen-cli-extensions/security
```

这将安装 Qwen 代码安全扩展，该扩展提供了对 `/security:analyze` 命令的支持。

### 卸载扩展

要卸载扩展，请运行 `qwen extensions uninstall 扩展名`，例如在上述安装示例中：

```
qwen extensions uninstall qwen-cli-security
```

### 禁用扩展

默认情况下，扩展会应用于所有工作区。你可以完全禁用某个扩展，也可以仅在特定工作区中禁用它。

例如，`qwen extensions disable extension-name` 会在用户级别禁用该扩展，因此它将在所有地方被禁用。而 `qwen extensions disable extension-name --scope=workspace` 只会禁用当前工作区中的扩展。

### 启用扩展

你可以使用 `qwen extensions enable extension-name` 来启用扩展。你也可以通过在特定工作区内运行 `qwen extensions enable extension-name --scope=workspace` 来只为该工作区启用扩展。

如果你在全局范围内禁用了某个扩展，但只希望在特定位置启用它，这个功能非常有用。

### 更新扩展

对于从本地路径或 Git 仓库安装的扩展，你可以通过 `qwen extensions update extension-name` 显式更新到最新版本（以 `qwen-extension.json` 中的 `version` 字段为准）。

你也可以通过以下命令更新所有扩展：

```
qwen extensions update --all
```

## 扩展开发

我们提供了一些命令来简化扩展的开发流程。

### 创建一个基础扩展

我们提供了几个示例扩展：`context`、`custom-commands`、`exclude-tools` 和 `mcp-server`。你可以在[这里](https://github.com/QwenLM/qwen-code/tree/main/packages/cli/src/commands/extensions/examples)查看这些示例。

要将其中一个示例复制到你选择的开发目录中，请运行：

```
qwen extensions new path/to/directory custom-commands
```

### 链接本地扩展

`qwen extensions link` 命令会在扩展安装目录与开发路径之间创建一个符号链接。

这样做的好处是，当你做出想要测试的更改时，无需每次都运行 `qwen extensions update`。

```
qwen extensions link path/to/directory
```

## 工作原理

启动时，Qwen Code 会在 `<home>/.qwen/extensions` 中查找扩展。

扩展会以包含 `qwen-extension.json` 文件的目录形式存在。例如：

`<home>/.qwen/extensions/my-extension/qwen-extension.json`

### `qwen-extension.json`

`qwen-extension.json` 文件包含扩展的配置。该文件具有以下结构：

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

- `name`：扩展的名称。用于唯一标识扩展，并在扩展命令与用户或项目命令同名时进行冲突解决。名称应为小写字母或数字，并使用短横线而不是下划线或空格。这是用户在 CLI 中引用你的扩展的方式。请注意，我们期望此名称与扩展目录名称匹配。
- `version`：扩展的版本。
- `mcpServers`：要配置的 MCP 服务器映射。键是服务器的名称，值是服务器配置。这些服务器将在启动时加载，就像在 [`settings.json` 文件](./cli/configuration.md) 中配置的 MCP 服务器一样。如果扩展和 `settings.json` 文件都配置了同名的 MCP 服务器，则以 `settings.json` 文件中定义的服务器为准。
  - 注意，除了 `trust` 外，所有 MCP 服务器配置选项均受支持。
- `contextFileName`：包含扩展上下文的文件名。将用于从扩展目录加载上下文。如果未使用此属性，但扩展目录中存在 `QWEN.md` 文件，则会加载该文件。
- `excludeTools`：要从模型中排除的工具名称数组。你还可以为支持它的工具（如 `run_shell_command` 工具）指定特定于命令的限制。例如，`"excludeTools": ["run_shell_command(rm -rf)"]` 将阻止 `rm -rf` 命令。请注意，这与 MCP 服务器 `excludeTools` 功能不同，后者可以在 MCP 服务器配置中列出。**重要提示：** 在 `excludeTools` 中指定的工具将在整个对话上下文中被禁用，并会影响当前会话中的所有后续查询。

当 Qwen Code 启动时，它会加载所有扩展并合并其配置。如果有任何冲突，工作区配置优先。

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

- `/deploy` - 在帮助中显示为 `[gcp] Custom command from deploy.toml`
- `/gcs:sync` - 在帮助中显示为 `[gcp] Custom command from sync.toml`

### 冲突解决

扩展命令的优先级最低。当与用户或项目命令发生冲突时：

1. **无冲突**：扩展命令使用其自然名称（例如，`/deploy`）
2. **有冲突**：扩展命令会以扩展前缀重命名（例如，`/gcp.deploy`）

例如，如果用户和 `gcp` 扩展都定义了一个 `deploy` 命令：

- `/deploy` - 执行用户的 deploy 命令
- `/gcp.deploy` - 执行扩展的 deploy 命令（标记为 `[gcp]` 标签）

## 变量

Qwen 代码扩展允许在 `qwen-extension.json` 中使用变量替换。例如，如果你需要当前目录来运行一个 MCP 服务器，可以使用 `"cwd": "${extensionPath}${/}run.ts"`。

**支持的变量：**

| 变量                       | 描述                                                                                                                                                        |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `${extensionPath}`         | 扩展在用户文件系统中的完整路径，例如 '/Users/username/.qwen/extensions/example-extension'。此路径不会解析符号链接。                                      |
| `${workspacePath}`         | 当前工作区的完整路径。                                                                                                                                      |
| `${/} or ${pathSeparator}` | 路径分隔符（因操作系统而异）。                                                                                                                              |