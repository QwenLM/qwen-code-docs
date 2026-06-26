# Qwen Code 扩展

Qwen Code 扩展将提示词、MCP 服务器、子代理、技能和自定义指令打包成熟悉且用户友好的格式。通过扩展，你可以扩展 Qwen Code 的能力，并与他人共享这些能力。它们被设计为易于安装和共享。

来自 [Gemini CLI Extensions Gallery](https://geminicli.com/extensions/) 和 [Claude Code Marketplace](https://claudemarketplaces.com/) 的扩展和插件可以直接安装到 Qwen Code 中。这种跨平台兼容性让你能够访问丰富的扩展和插件生态，极大地扩展 Qwen Code 的功能，而无需扩展作者维护单独的版本。

## 扩展管理

我们提供了一套扩展管理工具，包括 `qwen extensions` CLI 命令以及交互式 CLI 中的 `/extensions` 斜杠命令。

### 运行时扩展管理（斜杠命令）

你可以在交互式 CLI 中使用 `/extensions` 斜杠命令在运行时管理扩展。这些命令支持热重载，即更改会立即生效，无需重启应用。

| 命令                                | 描述                                                             |
| ----------------------------------- | ---------------------------------------------------------------- |
| `/extensions` 或 `/extensions manage` | 管理所有已安装的扩展                                              |
| `/extensions install <source>`       | 从 git URL、本地路径或归档、归档 URL、npm 包或市场安装扩展          |
| `/extensions explore [source]`       | 在浏览器中打开扩展来源页面（Gemini 或 ClaudeCode）                  |

#### 交互式扩展管理器

运行 `/extensions`（或 `/extensions manage`）会打开一个带有三个选项卡的交互式管理器。按 `Tab` 或 `←`/`→` 箭头键在它们之间切换。

- **发现** — 浏览来自已配置市场来源的插件。输入进行搜索，按 `Enter` 查看插件详情并安装（系统会要求你选择安装范围）。按 `Ctrl+R` 重新获取列表，按 `Esc` 返回。
- **已安装** — 已安装的扩展，按范围分组（**用户级别**、**项目级别**和收藏夹）。使用 `↑`/`↓` 导航，按 `Space` 启用/禁用扩展，按 `f` 收藏，按 `Enter` 打开详情。扩展捆绑的 MCP 服务器会嵌套显示在父扩展下，并显示实时连接状态；你可以在此处单独启用或禁用每个服务器。
- **来源** — 管理“发现”选项卡所使用的市场来源。使用 `↑`/`↓` 导航，按 `Enter` 选择来源，按 `d` 删除来源。这些来源与下述 `qwen extensions sources` CLI 命令管理的来源相同。

在此处所做的更改会立即热重载，无需重启 Qwen Code。

### CLI 扩展管理

你也可以使用 `qwen extensions` CLI 命令管理扩展。请注意，通过 CLI 命令所做的更改将在重启后反映到活动的 CLI 会话中。

### 安装扩展

你可以使用 `qwen extensions install` 从多个来源安装扩展：

#### 从 Claude Code 市场

Qwen Code 也支持来自 [Claude Code Marketplace](https://claudemarketplaces.com/) 的插件。从市场安装并选择一个插件：

```bash
qwen extensions install <marketplace-name>
# 或
qwen extensions install <marketplace-github-url>
```

如果你想安装特定的插件，可以使用带插件名称的格式：

```bash
qwen extensions install <marketplace-name>:<plugin-name>
# 或
qwen extensions install <marketplace-github-url>:<plugin-name>
```

例如，从 [f/awesome-chatgpt-prompts](https://claudemarketplaces.com/plugins/f-awesome-chatgpt-prompts) 市场安装 `prompts.chat` 插件：

```bash
qwen extensions install f/awesome-chatgpt-prompts:prompts.chat
# 或
qwen extensions install https://github.com/f/awesome-chatgpt-prompts:prompts.chat
```

Claude 插件在安装过程中会自动转换为 Qwen Code 格式：

- `claude-plugin.json` 转换为 `qwen-extension.json`
- 代理配置转换为 Qwen 子代理格式
- 技能配置转换为 Qwen 技能格式
- 工具映射会自动处理

你可以使用 `/extensions explore` 命令快速浏览不同市场的可用扩展：

```bash
# 打开 Gemini CLI Extensions 市场
/extensions explore Gemini

# 打开 Claude Code 市场
/extensions explore ClaudeCode
```

该命令会在默认浏览器中打开相应的市场，让你发现新的扩展来增强 Qwen Code 体验。

> **跨平台兼容性**：这让你能够利用来自 Gemini CLI 和 Claude Code 的丰富扩展生态，极大地扩展 Qwen Code 用户可用的功能。

#### 从 Gemini CLI Extensions

Qwen Code 完全支持来自 [Gemini CLI Extensions Gallery](https://geminicli.com/extensions/) 的扩展。只需使用 git URL 安装它们：

```bash
qwen extensions install <gemini-cli-extension-github-url>
# 或
qwen extensions install <owner>/<repo>
```

Gemini 扩展在安装过程中会自动转换为 Qwen Code 格式：

- `gemini-extension.json` 转换为 `qwen-extension.json`
- TOML 命令文件自动迁移为 Markdown 格式
- MCP 服务器、上下文文件和设置保持不变

#### 从 npm 注册表

Qwen Code 支持使用 scoped 包名从 npm 注册表安装扩展。这对于拥有私有注册表、且已有认证、版本管理和发布基础设施的团队来说非常理想。

```bash
# 安装最新版本
qwen extensions install @scope/my-extension

# 安装特定版本
qwen extensions install @scope/my-extension@1.2.0

# 从自定义注册表安装
qwen extensions install @scope/my-extension --registry https://your-registry.com
```

仅支持 scoped 包（`@scope/package-name`），以避免与 `owner/repo` GitHub 简写格式产生歧义。

**注册表解析**按以下优先级顺序进行：

1. `--registry` CLI 标志（显式覆盖）
2. 来自 `.npmrc` 的 scope 注册表（例如 `@scope:registry=https://...`）
3. 来自 `.npmrc` 的默认注册表
4. 回退：`https://registry.npmjs.org/`

**身份认证**会自动通过 `NPM_TOKEN` 环境变量或 `.npmrc` 中的注册表特定 `_authToken` 条目处理。

> **注意：** npm 扩展必须在包根目录包含一个 `qwen-extension.json` 文件，其格式与任何其他 Qwen Code 扩展相同。有关打包细节，请参阅 [扩展发布](./extension-releasing.md#releasing-through-npm-registry)。

#### 从 Git 仓库

```bash
qwen extensions install https://github.com/github/github-mcp-server
```

这将安装 github mcp 服务器扩展。

#### 从本地路径

```bash
qwen extensions install /path/to/your/extension
```

也支持本地的 `.zip` 和 `.tar.gz` 归档：

```bash
qwen extensions install /path/to/your/extension.zip
qwen extensions install /path/to/your/extension.tar.gz
```

归档必须在其根目录包含一个完整的扩展，或者包含一个包含扩展的顶级目录。

请注意，我们会创建已安装扩展的副本，因此你需要运行 `qwen extensions update` 来拉取本地定义的扩展以及 GitHub 上的扩展的更改。

#### 从归档 URL

```bash
qwen extensions install https://example.com/your/extension.zip
qwen extensions install https://example.com/your/extension.tar.gz
```

只要 URL 持续指向同一扩展的新归档，就可以稍后更新归档 URL。

#### 选择安装范围

默认情况下，已安装的扩展在全局范围内启用（用户范围）。传递 `--scope project` 以仅针对当前工作区启用：

```bash
qwen extensions install <source> --scope project
```

`--scope workspace` 可以作为 `--scope project` 的别名接受。这与从 `/extensions manage` 的“发现”选项卡安装时提供的范围选择相匹配。

### 管理市场来源

市场来源（Claude 插件市场）为 `/extensions manage` 中的“发现”选项卡提供支持。你也可以从 CLI 管理它们：

```bash
# 添加市场（owner/repo、git URL、marketplace.json 的 https URL 或本地路径）
qwen extensions sources add <source>

# 列出已配置的市场
qwen extensions sources list

# 重新获取市场的插件列表
qwen extensions sources update <name>

# 删除市场
qwen extensions sources remove <name>
```

### 卸载扩展

要卸载，运行 `qwen extensions uninstall extension-name`，以安装示例为例：

```
qwen extensions uninstall qwen-cli-security
```

### 禁用扩展

默认情况下，扩展在所有工作区中均启用。你可以完全禁用某个扩展，或针对特定工作区禁用。

例如，`qwen extensions disable extension-name` 将在用户级别禁用该扩展，因此它将在所有地方被禁用。`qwen extensions disable extension-name --scope=workspace` 将仅在当前工作区中禁用该扩展。

### 启用扩展

你可以使用 `qwen extensions enable extension-name` 启用扩展。也可以从特定工作区内使用 `qwen extensions enable extension-name --scope=workspace` 为该工作区启用扩展。

如果你在顶层禁用了某个扩展，但希望在特定位置启用它，这将非常有用。

### 更新扩展

对于从本地路径或归档、归档 URL、git 仓库或 npm 注册表安装的扩展，你可以使用 `qwen extensions update extension-name` 显式更新到最新版本。对于未固定版本（例如 `@scope/pkg`）安装的 npm 扩展，更新会检查 `latest` 发行标签。对于使用特定发行标签（例如 `@scope/pkg@beta`）安装的扩展，更新会跟踪该标签。固定到确切版本（例如 `@scope/pkg@1.2.0`）的扩展始终被视为最新。

你可以使用以下命令更新所有扩展：

```
qwen extensions update --all
```

## 工作原理

在启动时，Qwen Code 会在 `<home>/.qwen/extensions` 中查找扩展。

扩展作为一个包含 `qwen-extension.json` 文件的目录存在。例如：

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

- `name`：扩展的名称。用于唯一标识扩展，并在扩展命令与用户或项目命令同名时进行冲突解决。名称应为小写或数字，并使用短横线代替下划线或空格。这是用户在 CLI 中引用扩展的方式。注意，我们期望此名称与扩展目录名称匹配。
- `version`：扩展的版本。
- `mcpServers`：要配置的 MCP 服务器映射。键是服务器名称，值是服务器配置。这些服务器将在启动时加载，就像在 [`settings.json` 文件](../configuration/settings.md) 中配置的 MCP 服务器一样。如果扩展和 `settings.json` 文件都配置了同名的 MCP 服务器，则以 `settings.json` 文件中定义的服务器为准。
  - 注意，除了 `trust` 之外，所有 MCP 服务器配置选项均受支持。
- `channels`：自定义通道适配器的映射。键是通道类型名称，值包含 `entry`（编译后的 JS 入口点的路径）和可选的 `displayName`。入口点必须导出一个符合 `ChannelPlugin` 接口的 `plugin` 对象。请参阅 [通道插件](../features/channels/plugins) 以获取完整指南。
- `contextFileName`：包含扩展上下文的文件名。用于从扩展目录加载上下文。如果未使用此属性但扩展目录中存在 `QWEN.md` 文件，则将加载该文件。
- `commands`：包含自定义指令的目录（默认值：`commands`）。指令是定义提示词的 `.md` 文件。
- `skills`：包含自定义技能的目录（默认值：`skills`）。技能会自动发现，并通过 `/skills` 命令可用。
- `agents`：包含自定义子代理的目录（默认值：`agents`）。子代理是定义专门的 AI 助手的 `.yaml` 或 `.md` 文件。
- `settings`：扩展所需的设置数组。安装时，系统会提示用户为这些设置提供值。这些值会安全存储，并作为环境变量传递给 MCP 服务器。
  - 每个设置具有以下属性：
    - `name`：设置的显示名称
    - `description`：此设置用途的描述
    - `envVar`：将要设置的环境变量名称
    - `sensitive`：布尔值，指示是否应隐藏该值（例如 API key、密码）

### 管理扩展设置

扩展可能需要通过设置（例如 API key 或凭证）进行配置。这些设置可以使用 `qwen extensions settings` CLI 命令进行管理：

**设置设置值：**

```bash
qwen extensions settings set <extension-name> <setting-name> [--scope user|workspace]
```

**列出扩展的所有设置和当前值：**

```bash
qwen extensions settings list <extension-name>
```

设置可以在两个级别进行配置：

- **用户级别**（默认）：设置适用于所有项目（`~/.qwen/.env`）
- **工作区级别**：设置仅适用于当前项目（`.qwen/.env`）

工作区设置优先于用户设置。敏感设置会安全存储，绝不会以明文形式显示。

当 Qwen Code 启动时，它会加载所有扩展并合并其配置。如果存在任何冲突，则以工作区配置为准。

### 自定义指令

扩展可以通过在扩展目录内的 `commands/` 子目录中放置 Markdown 文件来提供[自定义指令](../features/commands.md#4-custom-commands)。这些指令遵循与用户和项目自定义指令相同的格式，并使用标准命名约定。

> **注意：** 指令格式已从 TOML 更新为 Markdown。TOML 文件已弃用，但仍受支持。你可以使用检测到 TOML 文件时出现的自动迁移提示来迁移现有的 TOML 指令。

**示例**

名为 `gcp` 的扩展具有以下结构：

```
.qwen/extensions/gcp/
├── qwen-extension.json
└── commands/
    ├── deploy.md
    └── gcs/
        └── sync.md
```

将提供以下指令：

- `/deploy` - 在帮助中显示为 `[gcp] Custom command from deploy.md`
- `/gcs:sync` - 在帮助中显示为 `[gcp] Custom command from sync.md`

### 自定义技能

扩展可以通过在扩展目录内的 `skills/` 子目录中放置技能文件来提供自定义技能。每个技能应包含一个带有 YAML 前置元数据的 `SKILL.md` 文件，定义技能的名称和描述。

**示例**

```
.qwen/extensions/my-extension/
├── qwen-extension.json
└── skills/
    └── pdf-processor/
        └── SKILL.md
```

当扩展处于活动状态时，该技能可通过 `/skills` 命令使用。

### 自定义子代理

扩展可以通过在扩展目录内的 `agents/` 子目录中放置代理配置文件来提供自定义子代理。代理使用 YAML 或 Markdown 文件定义。

**示例**

```
.qwen/extensions/my-extension/
├── qwen-extension.json
└── agents/
    └── testing-expert.yaml
```

扩展子代理会出现在子代理管理器对话框的“扩展代理”部分。

### 冲突解决

扩展指令的优先级最低。当与用户或项目指令发生冲突时：

1. **无冲突**：扩展指令使用其自然名称（例如 `/deploy`）
2. **有冲突**：扩展指令被重命名为带有扩展前缀（例如 `/gcp.deploy`）

例如，如果用户和 `gcp` 扩展都定义了 `deploy` 指令：

- `/deploy` - 执行用户的 deploy 指令
- `/gcp.deploy` - 执行扩展的 deploy 指令（标记有 `[gcp]` 标签）

## 变量

Qwen Code 扩展允许在 `qwen-extension.json` 中进行变量替换。例如，如果你需要使用 `"cwd": "${extensionPath}${/}run.ts"` 来运行 MCP 服务器，这将非常有用。

**支持的变量：**

| 变量                              | 描述                                                                             |
| --------------------------------- | -------------------------------------------------------------------------------- |
| `${extensionPath}`                | 扩展在用户文件系统中的完整路径，例如 '/Users/username/.qwen/extensions/example-extension'。不会解引用符号链接。 |
| `${workspacePath}`                | 当前工作区的完整路径。                                                            |
| `${/} 或 ${pathSeparator}`        | 路径分隔符（因操作系统而异）。                                                      |