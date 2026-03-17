# Qwen Code 扩展

Qwen Code 扩展将提示词、MCP 服务器、子智能体、技能和自定义命令打包为一种熟悉且用户友好的格式。借助扩展，您可以增强 Qwen Code 的功能，并与他人共享这些能力。扩展设计为易于安装和分发。

来自 [Gemini CLI 扩展画廊](https://geminicli.com/extensions/) 和 [Claude Code 应用市场](https://claudemarketplaces.com/) 的扩展与插件可直接安装到 Qwen Code 中。这种跨平台兼容性让您能够访问丰富多样的扩展与插件生态，从而大幅拓展 Qwen Code 的能力，而无需扩展作者维护多个独立版本。

## 扩展管理

我们提供了一套扩展管理工具，既支持通过 `qwen extensions` 命令行指令，也支持在交互式 CLI 中使用 `/extensions` 斜杠命令进行操作。

### 运行时扩展管理（斜杠命令）

你可以在交互式 CLI 中使用 `/extensions` 斜杠命令，在运行时管理扩展。这些命令支持热重载，即更改会立即生效，无需重启应用。

| 命令                                   | 描述                                                             |
| -------------------------------------- | ---------------------------------------------------------------- |
| `/extensions` 或 `/extensions manage` | 管理所有已安装的扩展                                             |
| `/extensions install <source>`         | 从 Git URL、本地路径或市场安装扩展                               |
| `/extensions explore [source]`         | 在浏览器中打开扩展源页面（Gemini 或 ClaudeCode）                 |

### CLI 扩展管理

你还可以使用 `qwen extensions` CLI 命令来管理扩展。请注意，通过 CLI 命令所做的更改将在重启后反映在当前的 CLI 会话中。

### 安装扩展

你可以通过 `qwen extensions install` 命令从多个来源安装扩展：

#### 从 Claude Code 商店安装

Qwen Code 还支持来自 [Claude Code 商店](https://claudemarketplaces.com/) 的插件。从商店安装并选择一个插件：

```bash
qwen extensions install <marketplace-name>
# 或
qwen extensions install <marketplace-github-url>
```

如需安装特定插件，可使用带插件名称的格式：

```bash
qwen extensions install <marketplace-name>:<plugin-name>
# 或
qwen extensions install <市场 GitHub URL>:<插件名称>
```

例如，要从 [f/awesome-chatgpt-prompts](https://claudemarketplaces.com/plugins/f-awesome-chatgpt-prompts) 市场安装 `prompts.chat` 插件：

```bash
qwen extensions install f/awesome-chatgpt-prompts:prompts.chat
# 或
qwen extensions install https://github.com/f/awesome-chatgpt-prompts:prompts.chat
```

Claude 插件在安装过程中会自动转换为 Qwen Code 格式：

- `claude-plugin.json` 被转换为 `qwen-extension.json`
- Agent 配置被转换为 Qwen 子 Agent 格式
- Skill 配置被转换为 Qwen Skill 格式
- 工具映射由系统自动处理

你可以使用 `/extensions explore` 命令快速浏览不同市场中可用的扩展：

```bash

# 打开 Gemini CLI Extensions 市场
/extensions explore Gemini

# 打开 Claude Code 市场
/extensions 探索 Claude Code
```

该命令将在你的默认浏览器中打开对应的市场，助你发现新扩展，从而提升 Qwen Code 使用体验。

> **跨平台兼容性**：此功能使你能同时利用 Gemini CLI 和 Claude Code 丰富的扩展生态，极大拓展 Qwen Code 用户可用的功能范围。

#### 来自 Gemini CLI 的扩展

Qwen Code 完全支持 [Gemini CLI 扩展画廊](https://geminicli.com/extensions/) 中的扩展。只需使用 Git URL 安装即可：

```bash
qwen extensions install <gemini-cli-extension-github-url>

# 或
qwen extensions install <owner>/<repo>
```

Gemini 扩展在安装过程中会自动转换为 Qwen Code 格式：

- `gemini-extension.json` 转换为 `qwen-extension.json`
- TOML 格式的命令文件自动迁移为 Markdown 格式
- MCP 服务器、上下文文件和设置均予以保留

#### 从 Git 仓库安装

```bash
qwen extensions install https://github.com/github/github-mcp-server
```

这将安装 GitHub MCP 服务器扩展。

#### 从本地路径安装

```bash
qwen extensions install /path/to/your/extension
```

注意：我们会为已安装的扩展创建一份副本，因此你需要运行 `qwen extensions update` 来同步本地定义的扩展以及 GitHub 上扩展的变更。

### 卸载扩展

要卸载扩展，请运行 `qwen extensions uninstall 扩展名称`。例如，针对上述安装示例：

```
qwen extensions uninstall qwen-cli-security
```

### 禁用扩展

默认情况下，扩展在所有工作区中均处于启用状态。你可以完全禁用某个扩展，或仅在特定工作区中禁用它。

例如，`qwen extensions disable extension-name` 将在用户级别禁用该扩展，使其在所有位置均被禁用；而 `qwen extensions disable extension-name --scope=workspace` 则仅在当前工作区中禁用该扩展。

### 启用扩展

你可以使用 `qwen extensions enable extension-name` 启用扩展。你也可以在特定工作区中运行 `qwen extensions enable extension-name --scope=workspace`，仅在该工作区中启用该扩展。

当某个扩展在顶层被禁用，而你仅希望在某些特定位置启用它时，此功能非常有用。

### 更新扩展

对于从本地路径或 Git 仓库安装的扩展，你可以通过运行 `qwen extensions update extension-name` 显式更新至最新版本（即 `qwen-extension.json` 文件中 `version` 字段所指定的版本）。

你也可以一次性更新所有扩展：

```
qwen extensions update --all
```

## 工作原理

Qwen Code 启动时，会在 `<home>/.qwen/extensions` 目录下查找扩展。

每个扩展以一个目录形式存在，该目录中必须包含 `qwen-extension.json` 文件。例如：

`<home>/.qwen/extensions/my-extension/qwen-extension.json`

### `qwen-extension.json`

`qwen-extension.json` 文件包含该扩展的配置信息。该文件结构如下：

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
      "description": "服务所需的 API 密钥",
      "envVar": "MY_API_KEY",
      "sensitive": true
    }
  ]
}
```

- `name`：扩展的名称。用于唯一标识该扩展，并在扩展命令与用户或项目命令同名时解决冲突。名称应全部小写或仅含数字，且使用短横线（`-`）而非下划线（`_`）或空格。用户将在 CLI 中以此名称引用你的扩展。注意：我们期望该名称与扩展所在目录名一致。
- `version`：扩展的版本号。
- `mcpServers`：待配置的 MCP 服务器映射表。键为服务器名称，值为服务器配置。这些服务器将在启动时加载，方式与 [`settings.json` 文件](./cli/configuration.md) 中配置的 MCP 服务器相同。若扩展与 `settings.json` 文件均配置了同名的 MCP 服务器，则以 `settings.json` 文件中定义的服务器为准。
  - 注意：除 `trust` 外，所有 MCP 服务器配置选项均受支持。
- `contextFileName`：包含扩展上下文内容的文件名。系统将从此扩展目录中加载该文件。若未指定此属性，但扩展目录中存在 `QWEN.md` 文件，则自动加载该文件。
- `commands`：存放自定义命令的目录（默认值：`commands`）。命令为 `.md` 文件，用于定义提示词（prompt）。
- `skills`：存放自定义技能的目录（默认值：`skills`）。技能将被自动发现，并通过 `/skills` 命令提供使用。
- `agents`：存放自定义子智能体（subagent）的目录（默认值：`agents`）。子智能体为 `.yaml` 或 `.md` 文件，用于定义专用 AI 助手。
- `settings`：扩展所需设置项的数组。安装时，用户将被提示输入这些设置项的值。值将被安全存储，并作为环境变量传递给 MCP 服务器。
  - 每个设置项包含以下属性：
    - `name`：设置项的显示名称
    - `description`：该设置项用途的说明
    - `envVar`：将被设置的环境变量名
    - `sensitive`：布尔值，表示该值是否应隐藏（例如 API 密钥、密码等）

### 管理扩展设置

扩展可能需要通过设置（例如 API 密钥或凭据）进行配置。这些设置可通过 `qwen extensions settings` CLI 命令进行管理：

**设置某个配置项的值：**

```bash
qwen extensions settings set <扩展名称> <配置项名称> [--scope user|workspace]
```

**列出某扩展的所有配置项：**

```bash
qwen extensions settings list <扩展名称>
```

**查看当前值（用户级和工作区级）：**

```bash
qwen extensions settings show <扩展名称> <配置项名称>
```

**移除某个配置项的值：**

```bash
qwen extensions settings unset <扩展名称> <配置项名称> [--scope user|workspace]
```

配置项可在两个层级上设置：

- **用户级**（默认）：设置对所有项目生效（`~/.qwen/.env`）
- **工作区级**：设置仅对当前项目生效（`.qwen/.env`）

工作区级设置优先于用户级设置。敏感配置项将被安全存储，绝不会以明文形式显示。

Qwen Code 启动时，会加载所有扩展并合并其配置。若存在冲突，工作区配置将优先生效。

### 自定义命令

扩展可通过在扩展目录下的 `commands/` 子目录中放置 Markdown 文件来提供[自定义命令](./cli/commands.md#custom-commands)。这些命令的格式与用户及项目级自定义命令相同，并遵循标准命名约定。

> **注意：** 命令格式已从 TOML 更新为 Markdown。TOML 文件已被弃用，但仍受支持。当检测到 TOML 文件时，系统会显示自动迁移提示，帮助你将现有 TOML 命令迁移到 Markdown 格式。

**示例**

一个名为 `gcp` 的扩展，其目录结构如下：

```
.qwen/extensions/gcp/
├── qwen-extension.json
└── commands/
    ├── deploy.md
    └── gcs/
        └── sync.md
```

将提供以下命令：

- `/deploy` —— 在帮助信息中显示为 `[gcp] Custom command from deploy.md`
- `/gcs:sync` —— 在帮助信息中显示为 `[gcp] Custom command from sync.md`

### 自定义技能

扩展可通过在扩展目录内的 `skills/` 子目录中放置技能文件来提供自定义技能。每个技能都应包含一个 `SKILL.md` 文件，其 YAML 前置元数据需定义该技能的名称和描述。

**示例**

```
.qwen/extensions/my-extension/
├── qwen-extension.json
└── skills/
    └── pdf-processor/
        └── SKILL.md
```

当扩展启用时，该技能将可通过 `/skills` 命令调用。

### 自定义子智能体

扩展可通过在扩展目录内的 `agents/` 子目录中放置智能体配置文件来提供自定义子智能体。智能体使用 YAML 或 Markdown 文件定义。

**示例**

```
.qwen/extensions/my-extension/
├── qwen-extension.json
└── agents/
    └── testing-expert.yaml
```

扩展提供的子智能体将在子智能体管理器对话框的“扩展智能体”部分中显示。

### 冲突解决

扩展命令的优先级最低。当与用户命令或项目命令发生冲突时：

1. **无冲突**：扩展命令使用其自然名称（例如 `/deploy`）
2. **发生冲突**：扩展命令将添加扩展前缀进行重命名（例如 `/gcp.deploy`）

例如，若用户和 `gcp` 扩展均定义了 `deploy` 命令：

- `/deploy` — 执行用户的 deploy 命令  
- `/gcp.deploy` — 执行扩展的 deploy 命令（带 `[gcp]` 标签）

## 变量

Qwen Code 扩展支持在 `qwen-extension.json` 中进行变量替换。例如，若需使用当前目录运行 MCP 服务器（如 `"cwd": "${extensionPath}${/}run.ts"`），该功能将非常有用。

**支持的变量：**

| 变量                         | 描述                                                                                                                                                     |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `${extensionPath}`           | 扩展在用户文件系统中的完整路径，例如 `/Users/username/.qwen/extensions/example-extension`。该路径不会解析符号链接。                                          |
| `${workspacePath}`           | 当前工作区的完整路径。                                                                                                                                    |
| `${/}` 或 `${pathSeparator}` | 路径分隔符（因操作系统而异）。                                                                                                                             |