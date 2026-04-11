# Qwen Code 扩展

Qwen Code 扩展将 prompt、MCP server、subagent、skill 和自定义命令打包成一种熟悉且易于使用的格式。借助扩展，你可以增强 Qwen Code 的能力并与他人共享。它们的设计目标是易于安装和分发。

来自 [Gemini CLI Extensions Gallery](https://geminicli.com/extensions/) 和 [Claude Code Marketplace](https://claudemarketplaces.com/) 的扩展和插件可以直接安装到 Qwen Code 中。这种跨平台兼容性让你能够访问丰富的扩展和插件生态，在无需扩展作者维护独立版本的情况下，大幅扩展 Qwen Code 的功能。

## 扩展管理

我们提供了一套扩展管理工具，支持通过 `qwen extensions` CLI 命令以及交互式 CLI 中的 `/extensions` 斜杠命令进行管理。

### 运行时扩展管理（斜杠命令）

你可以在交互式 CLI 中使用 `/extensions` 斜杠命令在运行时管理扩展。这些命令支持热重载，这意味着更改会立即生效，无需重启应用。

| Command                               | Description                                                                  |
| ------------------------------------- | ---------------------------------------------------------------------------- |
| `/extensions` or `/extensions manage` | 管理所有已安装的扩展                                              |
| `/extensions install <source>`        | 从 git URL、本地路径、npm 包或市场安装扩展 |
| `/extensions explore [source]`        | 在浏览器中打开扩展源页面（Gemini 或 ClaudeCode）            |

### CLI 扩展管理

你也可以使用 `qwen extensions` CLI 命令管理扩展。请注意，通过 CLI 命令进行的更改将在重启后反映在活跃的 CLI 会话中。

### 安装扩展

你可以通过多种来源使用 `qwen extensions install` 安装扩展：

#### 从 Claude Code Marketplace 安装

Qwen Code 还支持来自 [Claude Code Marketplace](https://claudemarketplaces.com/) 的插件。从市场安装并选择插件：

```bash
qwen extensions install <marketplace-name>
# or
qwen extensions install <marketplace-github-url>
```

如果你想安装特定插件，可以使用包含插件名称的格式：

```bash
qwen extensions install <marketplace-name>:<plugin-name>
# or
qwen extensions install <marketplace-github-url>:<plugin-name>
```

例如，要从 [f/awesome-chatgpt-prompts](https://claudemarketplaces.com/plugins/f-awesome-chatgpt-prompts) 市场安装 `prompts.chat` 插件：

```bash
qwen extensions install f/awesome-chatgpt-prompts:prompts.chat
# or
qwen extensions install https://github.com/f/awesome-chatgpt-prompts:prompts.chat
```

Claude 插件在安装过程中会自动转换为 Qwen Code 格式：

- `claude-plugin.json` 转换为 `qwen-extension.json`
- Agent 配置转换为 Qwen subagent 格式
- Skill 配置转换为 Qwen skill 格式
- Tool 映射会自动处理

你可以使用 `/extensions explore` 命令快速浏览不同市场的可用扩展：

```bash
# Open Gemini CLI Extensions marketplace
/extensions explore Gemini

# Open Claude Code marketplace
/extensions explore ClaudeCode
```

该命令会在默认浏览器中打开对应的市场页面，方便你发现新扩展以增强 Qwen Code 的使用体验。

> **跨平台兼容性**：这让你能够利用 Gemini CLI 和 Claude Code 丰富的扩展生态，大幅扩展 Qwen Code 用户可用的功能。

#### 从 Gemini CLI Extensions 安装

Qwen Code 完全支持来自 [Gemini CLI Extensions Gallery](https://geminicli.com/extensions/) 的扩展。只需使用 git URL 安装即可：

```bash
qwen extensions install <gemini-cli-extension-github-url>
# or
qwen extensions install <owner>/<repo>
```

Gemini 扩展在安装过程中会自动转换为 Qwen Code 格式：

- `gemini-extension.json` 转换为 `qwen-extension.json`
- TOML 命令文件会自动迁移为 Markdown 格式
- MCP server、context 文件和设置会保留

#### 从 npm Registry 安装

Qwen Code 支持使用 scoped 包名从 npm registry 安装扩展。这非常适合已经具备认证、版本控制和发布基础设施的私有 registry 团队。

```bash
# Install the latest version
qwen extensions install @scope/my-extension

# Install a specific version
qwen extensions install @scope/my-extension@1.2.0

# Install from a custom registry
qwen extensions install @scope/my-extension --registry https://your-registry.com
```

仅支持 scoped 包（`@scope/package-name`），以避免与 `owner/repo` GitHub 简写格式产生歧义。

**Registry 解析**遵循以下优先级：

1. `--registry` CLI 标志（显式覆盖）
2. `.npmrc` 中的 scoped registry（例如 `@scope:registry=https://...`）
3. `.npmrc` 中的默认 registry
4. 回退：`https://registry.npmjs.org/`

**认证**会通过 `NPM_TOKEN` 环境变量或 `.npmrc` 文件中 registry 特定的 `_authToken` 条目自动处理。

> **注意：** npm 扩展必须在包根目录包含 `qwen-extension.json` 文件，格式与其他 Qwen Code 扩展相同。打包详情请参阅 [Extension Releasing](./extension-releasing.md#releasing-through-npm-registry)。

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

要卸载，请运行 `qwen extensions uninstall extension-name`。以安装示例为例：

```
qwen extensions uninstall qwen-cli-security
```

### 禁用扩展

默认情况下，扩展在所有 workspace 中均处于启用状态。你可以完全禁用某个扩展，或仅针对特定 workspace 禁用。

例如，`qwen extensions disable extension-name` 会在用户级别禁用该扩展，使其在所有位置均失效。`qwen extensions disable extension-name --scope=workspace` 仅会在当前 workspace 中禁用该扩展。

### 启用扩展

你可以使用 `qwen extensions enable extension-name` 启用扩展。你也可以在特定 workspace 内使用 `qwen extensions enable extension-name --scope=workspace` 为该 workspace 启用扩展。

如果你在顶层禁用了某个扩展，但只想在特定位置启用它，这会非常有用。

### 更新扩展

对于从本地路径、git 仓库或 npm registry 安装的扩展，你可以使用 `qwen extensions update extension-name` 显式更新到最新版本。对于未锁定版本的 npm 扩展（例如 `@scope/pkg`），更新会检查 `latest` dist-tag。对于使用特定 dist-tag 安装的扩展（例如 `@scope/pkg@beta`），更新会跟踪该 tag。锁定到确切版本的扩展（例如 `@scope/pkg@1.2.0`）始终被视为已是最新。

你可以使用以下命令更新所有扩展：

```
qwen extensions update --all
```

## 工作原理

启动时，Qwen Code 会在 `<home>/.qwen/extensions` 中查找扩展。

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
  "channels": {
    "my-platform": {
      "entry": "dist/index.js",
      "displayName": "My Platform Channel"
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

- `name`: 扩展的名称。用于唯一标识扩展，并在扩展命令与用户或项目命令同名时解决冲突。名称应为小写字母或数字，并使用连字符（dash）代替下划线或空格。这是用户在 CLI 中引用扩展的方式。请注意，我们期望此名称与扩展目录名称匹配。
- `version`: 扩展的版本。
- `mcpServers`: 要配置的 MCP server 映射。键为 server 名称，值为 server 配置。这些 server 将在启动时加载，就像在 [`settings.json` 文件](./cli/configuration.md) 中配置的 MCP server 一样。如果扩展和 `settings.json` 文件都配置了同名的 MCP server，则以 `settings.json` 文件中定义的 server 为准。
  - 请注意，除 `trust` 外，支持所有 MCP server 配置选项。
- `channels`: 自定义 channel adapter 的映射。键为 channel 类型名称，值包含 `entry`（编译后的 JS 入口点路径）和可选的 `displayName`。入口点必须导出符合 `ChannelPlugin` 接口的 `plugin` 对象。完整指南请参阅 [Channel Plugins](../features/channels/plugins)。
- `contextFileName`: 包含扩展 context 的文件名。将用于从扩展目录加载 context。如果未使用此属性但扩展目录中存在 `QWEN.md` 文件，则会加载该文件。
- `commands`: 包含自定义命令的目录（默认：`commands`）。命令是定义 prompt 的 `.md` 文件。
- `skills`: 包含自定义 skill 的目录（默认：`skills`）。Skill 会被自动发现，并可通过 `/skills` 命令使用。
- `agents`: 包含自定义 subagent 的目录（默认：`agents`）。Subagent 是定义专用 AI 助手的 `.yaml` 或 `.md` 文件。
- `settings`: 扩展所需的设置数组。安装时，系统会提示用户为这些设置提供值。这些值会被安全存储，并作为环境变量传递给 MCP server。
  - 每个设置包含以下属性：
    - `name`: 设置的显示名称
    - `description`: 该设置用途的描述
    - `envVar`: 将被设置的环境变量名称
    - `sensitive`: 布尔值，指示是否应隐藏该值（例如 API key、密码）

### 管理扩展设置

扩展可能需要通过设置（如 API key 或凭证）进行配置。你可以使用 `qwen extensions settings` CLI 命令管理这些设置：

**设置值：**

```bash
qwen extensions settings set <extension-name> <setting-name> [--scope user|workspace]
```

**列出扩展的所有设置：**

```bash
qwen extensions settings list <extension-name>
```

**查看当前值（用户和 workspace）：**

```bash
qwen extensions settings show <extension-name> <setting-name>
```

**移除设置值：**

```bash
qwen extensions settings unset <extension-name> <setting-name> [--scope user|workspace]
```

设置可以在两个级别进行配置：

- **用户级别**（默认）：设置适用于所有项目（`~/.qwen/.env`）
- **Workspace 级别**：设置仅适用于当前项目（`.qwen/.env`）

Workspace 设置优先于用户设置。敏感设置会安全存储，且绝不会以明文显示。

Qwen Code 启动时，会加载所有扩展并合并其配置。如果存在冲突，workspace 配置优先。

### 自定义命令

扩展可以通过在扩展目录内的 `commands/` 子目录中放置 Markdown 文件来提供[自定义命令](./cli/commands.md#custom-commands)。这些命令遵循与用户和项目自定义命令相同的格式，并使用标准命名约定。

> **注意：** 命令格式已从 TOML 更新为 Markdown。TOML 文件已弃用但仍受支持。当检测到 TOML 文件时，你可以使用出现的自动迁移提示来迁移现有的 TOML 命令。

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

- `/deploy` - 在帮助中显示为 `[gcp] Custom command from deploy.md`
- `/gcs:sync` - 在帮助中显示为 `[gcp] Custom command from sync.md`

### 自定义 skill

扩展可以通过在扩展目录内的 `skills/` 子目录中放置 skill 文件来提供自定义 skill。每个 skill 应包含一个 `SKILL.md` 文件，其 YAML frontmatter 定义了 skill 的名称和描述。

**示例**

```
.qwen/extensions/my-extension/
├── qwen-extension.json
└── skills/
    └── pdf-processor/
        └── SKILL.md
```

当扩展处于活动状态时，该 skill 将通过 `/skills` 命令可用。

### 自定义 subagent

扩展可以通过在扩展目录内的 `agents/` 子目录中放置 agent 配置文件来提供自定义 subagent。Agent 使用 YAML 或 Markdown 文件定义。

**示例**

```
.qwen/extensions/my-extension/
├── qwen-extension.json
└── agents/
    └── testing-expert.yaml
```

扩展 subagent 会显示在 subagent 管理器对话框的 "Extension Agents" 部分下。

### 冲突解决

扩展命令的优先级最低。当与用户或项目命令发生冲突时：

1. **无冲突**：扩展命令使用其原始名称（例如 `/deploy`）
2. **有冲突**：扩展命令会重命名为带扩展前缀的名称（例如 `/gcp.deploy`）

例如，如果用户和 `gcp` 扩展都定义了 `deploy` 命令：

- `/deploy` - 执行用户的 deploy 命令
- `/gcp.deploy` - 执行扩展的 deploy 命令（标记为 `[gcp]` 标签）

## 变量

Qwen Code 扩展允许在 `qwen-extension.json` 中进行变量替换。例如，如果你需要使用当前目录运行 MCP server（如 `"cwd": "${extensionPath}${/}run.ts"`），这会非常有用。

**支持的变量：**

| variable                   | description                                                                                                                                                   |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `${extensionPath}`         | 扩展在用户文件系统中的完整路径，例如 `/Users/username/.qwen/extensions/example-extension`。此路径不会解析符号链接。 |
| `${workspacePath}`         | 当前 workspace 的完整路径。                                                                                                            |
| `${/} or ${pathSeparator}` | 路径分隔符（因操作系统而异）。                                                                                                                          |