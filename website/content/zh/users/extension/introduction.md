# Qwen Code 扩展

Qwen Code 扩展包将提示词、MCP 服务器、子代理、技能和自定义命令打包成一种熟悉且用户友好的格式。通过扩展，你可以扩展 Qwen Code 的功能，并与他人分享这些功能。它们被设计为易于安装和共享。

来自 [Gemini CLI 扩展库](https://geminicli.com/extensions/) 和 [Claude Code 市场](https://claudemarketplaces.com/) 的扩展和插件可以直接安装到 Qwen Code 中。这种跨平台兼容性让你能够访问丰富的扩展和插件生态系统，在无需扩展作者维护单独版本的情况下显著扩展 Qwen Code 的功能。

## 扩展管理

我们提供了一套扩展管理工具，既可以通过 `qwen extensions` CLI 命令，也可以在交互式 CLI 中使用 `/extensions` 斜杠命令。

### 运行时扩展管理（斜杠命令）

你可以在交互式 CLI 中使用 `/extensions` 斜杠命令在运行时管理扩展。这些命令支持热重载，意味着更改会立即生效，无需重启应用程序。

| 命令                                                   | 描述                                                              |
| ------------------------------------------------------ | ----------------------------------------------------------------- |
| `/extensions` 或 `/extensions list`                    | 列出所有已安装的扩展及其状态                                      |
| `/extensions install <source>`                         | 从 git URL、本地路径或市场安装扩展                                |
| `/extensions uninstall <name>`                         | 卸载扩展                                                          |
| `/extensions enable <name> --scope <user\|workspace>`  | 启用扩展                                                          |
| `/extensions disable <name> --scope <user\|workspace>` | 禁用扩展                                                          |
| `/extensions update <name>`                            | 更新特定扩展                                                      |
| `/extensions update --all`                             | 更新所有有可用更新的扩展                                          |
| `/extensions detail <name>`                            | 显示扩展详情                                                      |
| `/extensions explore [source]`                         | 在浏览器中打开扩展源页面（Gemini 或 ClaudeCode）                  |

### CLI 扩展管理

你也可以使用 `qwen extensions` CLI 命令来管理扩展。请注意，通过 CLI 命令所做的更改将在重启后反映在活动的 CLI 会话中。

### 安装扩展

你可以从多个来源使用 `qwen extensions install` 来安装扩展：

#### 从 Claude Code 市场

Qwen Code 还支持来自 [Claude Code 市场](https://claudemarketplaces.com/) 的插件。从市场安装并选择一个插件：

```bash
qwen extensions install <marketplace-name>

# 或者
qwen extensions install <marketplace-github-url>
```

如果你想安装特定的插件，可以使用包含插件名称的格式：

```bash
qwen extensions install <marketplace-name>:<plugin-name>
```

# 或者
qwen extensions install <marketplace-github-url>:<plugin-name>
```

例如，要从 [f/awesome-chatgpt-prompts](https://claudemarketplaces.com/plugins/f-awesome-chatgpt-prompts) 市场安装 `prompts.chat` 插件：

```bash
qwen extensions install f/awesome-chatgpt-prompts:prompts.chat

# 或者
qwen extensions install https://github.com/f/awesome-chatgpt-prompts:prompts.chat
```

Claude 插件在安装过程中会自动转换为 Qwen Code 格式：

- `claude-plugin.json` 转换为 `qwen-extension.json`
- Agent 配置转换为 Qwen 子 agent 格式
- Skill 配置转换为 Qwen skill 格式
- Tool 映射自动处理

你可以使用 `/extensions explore` 命令快速浏览不同市场中的可用扩展：

```bash

# 打开 Gemini CLI Extensions 市场
/extensions explore Gemini

# 打开 Claude Code 市场
/extensions 探索 ClaudeCode
```

此命令在默认浏览器中打开相应的市场，让你可以发现新的扩展来增强你的 Qwen Code 体验。

> **跨平台兼容性**: 这允许你利用来自 Gemini CLI 和 Claude Code 的丰富扩展生态系统，极大地扩展 Qwen Code 用户可用的功能。

#### 来自 Gemini CLI 扩展

Qwen Code 完全支持来自 [Gemini CLI 扩展库](https://geminicli.com/extensions/) 的扩展。只需使用 git URL 安装它们：

```bash
qwen extensions install <gemini-cli-extension-github-url>

# 或者
qwen extensions install <owner>/<repo>
```

Gemini 扩展在安装过程中会自动转换为 Qwen Code 格式：

- `gemini-extension.json` 被转换为 `qwen-extension.json`
- TOML 命令文件会自动迁移到 Markdown 格式
- MCP 服务器、上下文文件和设置会被保留

#### 从 Git 仓库安装

```bash
qwen extensions install https://github.com/github/github-mcp-server
```

这将安装 github mcp server 扩展。

#### 从本地路径安装

```bash
qwen extensions install /path/to/your/extension
```

请注意，我们会创建已安装扩展的副本，因此你需要运行 `qwen extensions update` 来拉取本地定义的扩展和 GitHub 上扩展的更改。

### 卸载扩展

要卸载，请运行 `qwen extensions uninstall extension-name`，所以，在安装示例的情况下：

```
qwen extensions uninstall qwen-cli-security
```

### 禁用扩展

默认情况下，扩展在所有工作区中都是启用的。你可以完全禁用一个扩展或仅为特定工作区禁用。

例如，`qwen extensions disable extension-name` 将在用户级别禁用该扩展，因此它会在所有地方被禁用。`qwen extensions disable extension-name --scope=workspace` 只会在当前工作区中禁用该扩展。

### 启用扩展

你可以使用 `qwen extensions enable extension-name` 来启用扩展。你也可以使用 `qwen extensions enable extension-name --scope=workspace` 从该工作区内部为特定工作区启用扩展。

如果你有一个在顶层禁用但在特定位置启用的扩展，这将非常有用。

### 更新扩展

对于从本地路径或 Git 仓库安装的扩展，你可以通过 `qwen extensions update extension-name` 明确更新到最新版本（反映在 `qwen-extension.json` 的 `version` 字段中）。

你可以使用以下命令更新所有扩展：

```
qwen extensions update --all
```

## 工作原理

启动时，Qwen Code 会在 `<home>/.qwen/extensions` 中查找扩展

扩展以包含 `qwen-extension.json` 文件的目录形式存在。例如：

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
  "commands": "commands",
  "skills": "skills",
  "agents": "agents",
  "settings": [
    {
      "name": "API Key",
      "description": "Your API key for the service",
      "envVar": "MY_API_KEY",
      "sensitive": true
    }
  ]
}
```

- `name`: 扩展的名称。用于唯一标识扩展，并在扩展命令与用户或项目命令同名时进行冲突解决。名称应为小写字母或数字，使用短横线而不是下划线或空格。这是用户在 CLI 中引用你扩展的方式。请注意，我们期望此名称与扩展目录名称匹配。
- `version`: 扩展的版本。
- `mcpServers`: 要配置的 MCP 服务器映射。键是服务器名称，值是服务器配置。这些服务器将在启动时加载，就像在 [`settings.json` 文件](./cli/configuration.md) 中配置的 MCP 服务器一样。如果扩展和 `settings.json` 文件都配置了同名的 MCP 服务器，则 `settings.json` 文件中定义的服务器优先。
  - 请注意，除了 `trust` 之外的所有 MCP 服务器配置选项都受支持。
- `contextFileName`: 包含扩展上下文的文件名称。这将用于从扩展目录加载上下文。如果未使用此属性但扩展目录中存在 `QWEN.md` 文件，则会加载该文件。
- `commands`: 包含自定义命令的目录（默认：`commands`）。命令是定义提示的 `.md` 文件。
- `skills`: 包含自定义技能的目录（默认：`skills`）。技能会自动发现并通过 `/skills` 命令提供。
- `agents`: 包含自定义子代理的目录（默认：`agents`）。子代理是定义专业 AI 助手的 `.yaml` 或 `.md` 文件。
- `settings`: 扩展所需的设置数组。安装时，用户将被提示提供这些设置的值。值会被安全存储并作为环境变量传递给 MCP 服务器。
  - 每个设置具有以下属性：
    - `name`: 设置的显示名称
    - `description`: 此设置用途的描述
    - `envVar`: 将要设置的环境变量名称
    - `sensitive`: 布尔值，指示值是否应该隐藏（例如 API 密钥、密码）

### 管理扩展设置

扩展可能需要通过设置（例如 API 密钥或凭证）进行配置。这些设置可以使用 `qwen extensions settings` CLI 命令进行管理：

**设置一个设置值：**

```bash
qwen extensions settings set <extension-name> <setting-name> [--scope user|workspace]
```

**列出扩展的所有设置：**

```bash
qwen extensions settings list <extension-name>
```

**查看当前值（用户和工作区）：**

```bash
qwen extensions settings show <extension-name> <setting-name>
```

**移除一个设置值：**

```bash
qwen extensions settings unset <extension-name> <setting-name> [--scope user|workspace]
```

设置可以在两个级别上进行配置：

- **用户级别**（默认）：设置应用于所有项目（`~/.qwen/.env`）
- **工作区级别**：设置仅应用于当前项目（`.qwen/.env`）

工作区设置优先于用户设置。敏感设置会安全存储，永远不会以纯文本形式显示。

当 Qwen Code 启动时，它会加载所有扩展并合并它们的配置。如果存在任何冲突，工作区配置将优先。

### 自定义命令

扩展可以通过在扩展目录内的 `commands/` 子目录中放置 Markdown 文件来提供[自定义命令](./cli/commands.md#custom-commands)。这些命令遵循与用户和项目自定义命令相同的格式，并使用标准命名约定。

> **注意：** 命令格式已从 TOML 更新为 Markdown。TOML 文件已被弃用但仍受支持。你可以在检测到 TOML 文件时使用自动迁移提示来迁移现有的 TOML 命令。

**示例**

一个名为 `gcp` 的扩展，具有以下结构：

```
.qwen/extensions/gcp/
├── qwen-extension.json
└── commands/
    ├── deploy.md
    └── gcs/
        └── sync.md
```

将提供以下命令：

- `/deploy` - 在帮助中显示为 `[gcp] 来自 deploy.md 的自定义命令`
- `/gcs:sync` - 在帮助中显示为 `[gcp] 来自 sync.md 的自定义命令`

### 自定义技能

扩展可以通过在扩展目录内的 `skills/` 子目录中放置技能文件来提供自定义技能。每个技能都应该有一个 `SKILL.md` 文件，其中包含 YAML 前置内容以定义技能的名称和描述。

**示例**

```
.qwen/extensions/my-extension/
├── qwen-extension.json
└── skills/
    └── pdf-processor/
        └── SKILL.md
```

当扩展激活时，该技能将可通过 `/skills` 命令使用。

### 自定义子代理

扩展可以通过在扩展目录内的 `agents/` 子目录中放置代理配置文件来提供自定义子代理。代理使用 YAML 或 Markdown 文件定义。

**示例**

```
.qwen/extensions/my-extension/
├── qwen-extension.json
└── agents/
    └── testing-expert.yaml
```

扩展子代理会出现在子代理管理器对话框中的"扩展代理"部分。

### 冲突解决

扩展命令具有最低优先级。当与用户或项目命令发生冲突时：

1. **无冲突**：扩展命令使用其自然名称（例如，`/deploy`）
2. **有冲突**：扩展命令使用扩展前缀重命名（例如，`/gcp.deploy`）

例如，如果用户和 `gcp` 扩展都定义了一个 `deploy` 命令：

- `/deploy` - 执行用户的部署命令
- `/gcp.deploy` - 执行扩展的部署命令（标记有 `[gcp]` 标签）

## 变量

Qwen Code 扩展允许在 `qwen-extension.json` 中进行变量替换。例如，如果你需要当前目录来运行 MCP 服务器，可以使用 `"cwd": "${extensionPath}${/}run.ts"`。

**支持的变量：**

| 变量                       | 描述                                                                                                                                                 |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `${extensionPath}`         | 用户文件系统中扩展的完全限定路径，例如 '/Users/username/.qwen/extensions/example-extension'。这不会解压符号链接。                                      |
| `${workspacePath}`         | 当前工作区的完全限定路径。                                                                                                                           |
| `${/} 或 ${pathSeparator}` | 路径分隔符（因操作系统而异）。                                                                                                                       |