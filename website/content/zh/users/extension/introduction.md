# Qwen Code 扩展

Qwen Code 扩展将 prompt、MCP 服务器、子智能体、skill 和自定义命令打包成简单易用的格式。借助扩展，你可以扩展 Qwen Code 的能力，并与他人共享。扩展的设计目标是易于安装和分发。

来自 [Gemini CLI Extensions Gallery](https://geminicli.com/extensions/) 和 [Claude Code Marketplace](https://claudemarketplaces.com/) 的扩展与插件可以直接安装到 Qwen Code 中。这种跨平台兼容性让你能访问丰富的扩展生态，大幅拓展 Qwen Code 的能力，而无需扩展作者维护单独的版本。

## 扩展管理

我们提供了一套完整的扩展管理工具，包括 `qwen extensions` CLI 命令和交互式 CLI 中的 `/extensions` slash 命令。

### 运行时扩展管理（Slash 命令）

你可以在交互式 CLI 中使用 `/extensions` slash 命令实时管理扩展。这些命令支持热重载，即更改立即生效，无需重启应用。

| 命令                                  | 说明                                                                                             |
| ------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `/extensions` 或 `/extensions manage` | 管理所有已安装的扩展                                                                             |
| `/extensions install <source>`        | 从 git URL、本地路径或归档、归档 URL、npm 包或市场安装扩展                                       |
| `/extensions explore [source]`        | 在浏览器中打开扩展来源页面（Gemini 或 ClaudeCode）                                               |

#### 交互式扩展管理器

运行 `/extensions`（或 `/extensions manage`）会打开一个包含三个标签页的交互式管理器。按 `Tab` 或 `←`/`→` 方向键在标签页之间切换。

- **Discover** — 浏览来自已配置市场的插件。输入关键词搜索，按 `Enter` 查看插件详情并安装（安装时会提示选择作用域）。按 `Ctrl+R` 重新拉取列表，按 `Esc` 返回。
- **Installed** — 已安装的扩展，按作用域分组（**用户级别**、**项目级别**和收藏）。使用 `↑`/`↓` 导航，`Space` 启用/禁用扩展，`f` 收藏，`Enter` 打开详情。扩展内置的 MCP 服务器以嵌套形式显示在父扩展下，并显示实时连接状态；可在此单独启用或禁用每个服务器。
- **Sources** — 管理为 Discover 标签页提供数据的市场来源。使用 `↑`/`↓` 导航，`Enter` 选择来源，`d` 删除来源。这些来源与下方 `qwen extensions sources` CLI 命令管理的来源相同。

此处所做的更改会立即热重载，无需重启 Qwen Code。

### CLI 扩展管理

你也可以使用 `qwen extensions` CLI 命令管理扩展。注意，通过 CLI 命令所做的更改会在下次重启活跃 CLI 会话后生效。

### 安装扩展

你可以使用 `qwen extensions install` 从多种来源安装扩展：

#### 从 Claude Code Marketplace 安装

Qwen Code 支持来自 [Claude Code Marketplace](https://claudemarketplaces.com/) 的插件。从市场安装并选择一个插件：

```bash
qwen extensions install <marketplace-name>
# 或
qwen extensions install <marketplace-github-url>
```

如需安装特定插件，可以使用带插件名称的格式：

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

Claude 插件在安装时会自动转换为 Qwen Code 格式：

- `claude-plugin.json` 转换为 `qwen-extension.json`
- Agent 配置转换为 Qwen 子智能体格式
- Skill 配置转换为 Qwen skill 格式
- 工具映射自动处理

你可以使用 `/extensions explore` 命令快速浏览不同市场的可用扩展：

```bash
# 打开 Gemini CLI Extensions 市场
/extensions explore Gemini

# 打开 Claude Code 市场
/extensions explore ClaudeCode
```

该命令会在默认浏览器中打开对应市场，帮助你发现新扩展以增强 Qwen Code 体验。

> **跨平台兼容性**：这让你可以充分利用 Gemini CLI 和 Claude Code 的丰富扩展生态，大幅拓展 Qwen Code 用户可用的功能。

#### 从 Gemini CLI Extensions 安装

Qwen Code 完全支持来自 [Gemini CLI Extensions Gallery](https://geminicli.com/extensions/) 的扩展。直接使用 git URL 安装：

```bash
qwen extensions install <gemini-cli-extension-github-url>
# 或
qwen extensions install <owner>/<repo>
```

Gemini 扩展在安装时会自动转换为 Qwen Code 格式：

- `gemini-extension.json` 转换为 `qwen-extension.json`
- TOML 命令文件自动迁移为 Markdown 格式
- MCP 服务器、上下文文件和设置保持不变

#### 从 npm Registry 安装

Qwen Code 支持使用 scoped 包名从 npm registry 安装扩展。对于已有认证、版本管理和发布基础设施的私有 registry 团队来说，这是理想选择。

```bash
# 安装最新版本
qwen extensions install @scope/my-extension

# 安装指定版本
qwen extensions install @scope/my-extension@1.2.0

# 从自定义 registry 安装
qwen extensions install @scope/my-extension --registry https://your-registry.com
```

仅支持 scoped 包（`@scope/package-name`），以避免与 `owner/repo` GitHub 简写格式产生歧义。

**Registry 解析**按以下优先级进行：

1. `--registry` CLI 参数（显式覆盖）
2. `.npmrc` 中的 scoped registry（例如 `@scope:registry=https://...`）
3. `.npmrc` 中的默认 registry
4. 回退：`https://registry.npmjs.org/`

**认证**通过 `NPM_TOKEN` 环境变量或 `.npmrc` 文件中特定 registry 的 `_authToken` 条目自动处理。

> **Note:** npm 扩展必须在包根目录包含 `qwen-extension.json` 文件，格式与其他 Qwen Code 扩展相同。打包详情参见 [Extension Releasing](./extension-releasing.md#releasing-through-npm-registry)。

#### 从 Git 仓库安装

```bash
qwen extensions install https://github.com/github/github-mcp-server
```

这会安装 github mcp server 扩展。

#### 从本地路径安装

```bash
qwen extensions install /path/to/your/extension
```

也支持本地 `.zip` 和 `.tar.gz` 归档：

```bash
qwen extensions install /path/to/your/extension.zip
qwen extensions install /path/to/your/extension.tar.gz
```

归档的根目录必须包含完整的扩展，或包含一个存放扩展的顶层目录。

注意，安装时会复制一份扩展，因此如需同步本地扩展或 GitHub 上的变更，需要运行 `qwen extensions update`。

#### 从归档 URL 安装

```bash
qwen extensions install https://example.com/your/extension.zip
qwen extensions install https://example.com/your/extension.tar.gz
```

只要 URL 持续指向同一扩展的更新归档，归档 URL 后续可以更新。

#### 选择安装作用域

默认情况下，安装的扩展在全局（用户作用域）启用。传入 `--scope project` 可仅在当前工作区启用：

```bash
qwen extensions install <source> --scope project
```

`--scope workspace` 是 `--scope project` 的别名。这与在 `/extensions manage` 的 Discover 标签页安装时提供的作用域选项一致。

### 管理市场来源

市场来源（Claude 插件市场）为 `/extensions manage` 中的 Discover 标签页提供数据。你也可以通过 CLI 管理：

```bash
# 添加市场（owner/repo、git URL、marketplace.json 的 https URL 或本地路径）
qwen extensions sources add <source>

# 列出已配置的市场
qwen extensions sources list

# 重新拉取某个市场的插件列表
qwen extensions sources update <name>

# 移除市场
qwen extensions sources remove <name>
```

### 卸载扩展

运行 `qwen extensions uninstall extension-name` 即可卸载。以安装示例为例：

```
qwen extensions uninstall qwen-cli-security
```

### 禁用扩展

扩展默认在所有工作区启用。你可以完全禁用某个扩展，或仅在特定工作区禁用。

例如，`qwen extensions disable extension-name` 会在用户级别禁用该扩展，即在所有地方禁用。`qwen extensions disable extension-name --scope=workspace` 仅在当前工作区禁用该扩展。

### 启用扩展

使用 `qwen extensions enable extension-name` 可启用扩展。也可以在某个工作区内运行 `qwen extensions enable extension-name --scope=workspace` 来仅在该工作区启用扩展。

这在你将某个扩展在顶层禁用、仅在特定地方启用时很有用。

### 更新扩展

对于从本地路径或归档、归档 URL、git 仓库或 npm registry 安装的扩展，可以使用 `qwen extensions update extension-name` 显式更新到最新版本。对于未固定版本（如 `@scope/pkg`）安装的 npm 扩展，更新会检查 `latest` dist-tag。对于以特定 dist-tag 安装的扩展（如 `@scope/pkg@beta`），更新会追踪该 tag。固定到精确版本的扩展（如 `@scope/pkg@1.2.0`）始终被视为最新。

使用以下命令更新所有扩展：

```
qwen extensions update --all
```

## 工作原理

启动时，Qwen Code 会在 `<home>/.qwen/extensions` 中查找扩展。

扩展是一个包含 `qwen-extension.json` 文件的目录，例如：

`<home>/.qwen/extensions/my-extension/qwen-extension.json`

### `qwen-extension.json`

`qwen-extension.json` 文件包含扩展的配置。文件结构如下：

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

- `name`：扩展名称，用于唯一标识扩展，以及当扩展命令与用户或项目命令同名时进行冲突解决。名称应使用小写字母或数字，以短横线代替下划线或空格。用户在 CLI 中将通过此名称引用你的扩展。注意，该名称需与扩展目录名一致。
- `version`：扩展版本。
- `mcpServers`：要配置的 MCP 服务器映射表。键为服务器名称，值为服务器配置。这些服务器会在启动时加载，与 [`settings.json` 文件](../configuration/settings.md) 中配置的 MCP 服务器方式相同。如果扩展和 `settings.json` 文件配置了同名 MCP 服务器，`settings.json` 中定义的服务器优先。
  - 注意，除 `trust` 外，所有 MCP 服务器配置选项均受支持。
- `channels`：自定义 channel 适配器映射表。键为 channel 类型名称，值包含 `entry`（编译后 JS 入口点的路径）和可选的 `displayName`。入口点必须导出一个符合 `ChannelPlugin` 接口的 `plugin` 对象。完整指南参见 [Channel Plugins](../features/channels/plugins)。
- `contextFileName`：包含扩展上下文的文件名。用于从扩展目录加载上下文。如果未使用该属性，但扩展目录中存在 `QWEN.md` 文件，则会加载该文件。
- `commands`：包含自定义命令的目录（默认：`commands`）。命令是定义 prompt 的 `.md` 文件。
- `skills`：包含自定义 skill 的目录（默认：`skills`）。Skill 会自动被发现，并通过 `/skills` 命令使用。
- `agents`：包含自定义子智能体的目录（默认：`agents`）。子智能体是定义专用 AI 助手的 `.yaml` 或 `.md` 文件。
- `settings`：扩展所需设置的数组。安装时会提示用户提供这些设置的值。值会安全存储，并作为环境变量传递给 MCP 服务器。
  - 每个设置包含以下属性：
    - `name`：设置的显示名称
    - `description`：该设置用途的说明
    - `envVar`：将被设置的环境变量名
    - `sensitive`：布尔值，表示是否应隐藏该值（如 API key、密码）

### 管理扩展设置

扩展可能需要通过设置（如 API key 或凭证）进行配置。可以使用 `qwen extensions settings` CLI 命令管理这些设置：

**设置某个值：**

```bash
qwen extensions settings set <extension-name> <setting-name> [--scope user|workspace]
```

**列出扩展的所有设置及当前值：**

```bash
qwen extensions settings list <extension-name>
```

设置可以在两个级别配置：

- **用户级别**（默认）：设置对所有项目生效（`~/.qwen/.env`）
- **工作区级别**：设置仅对当前项目生效（`.qwen/.env`）

工作区设置优先于用户设置。敏感设置安全存储，不以明文显示。

Qwen Code 启动时会加载所有扩展并合并配置。如有冲突，工作区配置优先。

### 自定义命令

扩展可以通过在扩展目录的 `commands/` 子目录中放置 Markdown 文件来提供[自定义命令](../features/commands.md#4-custom-commands)。这些命令与用户和项目自定义命令格式相同，遵循标准命名规范。

> **Note:** 命令格式已从 TOML 更新为 Markdown。TOML 文件已废弃但仍受支持。检测到 TOML 文件时会出现自动迁移提示，可将现有 TOML 命令迁移。

**示例**

名为 `gcp` 的扩展，目录结构如下：

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

扩展可以通过在扩展目录的 `skills/` 子目录中放置 skill 文件来提供自定义 skill。每个 skill 应有一个 `SKILL.md` 文件，其 YAML frontmatter 定义了 skill 的名称和描述。

**示例**

```
.qwen/extensions/my-extension/
├── qwen-extension.json
└── skills/
    └── pdf-processor/
        └── SKILL.md
```

扩展激活时，该 skill 可通过 `/skills` 命令使用。

### 自定义子智能体

扩展可以通过在扩展目录的 `agents/` 子目录中放置 agent 配置文件来提供自定义子智能体。Agent 使用 YAML 或 Markdown 文件定义。

**示例**

```
.qwen/extensions/my-extension/
├── qwen-extension.json
└── agents/
    └── testing-expert.yaml
```

扩展子智能体会显示在子智能体管理对话框的"Extension Agents"部分。

### 冲突解决

扩展命令的优先级最低。当与用户或项目命令发生冲突时：

1. **无冲突**：扩展命令使用其原始名称（如 `/deploy`）
2. **有冲突**：扩展命令添加扩展前缀（如 `/gcp.deploy`）

例如，如果用户和 `gcp` 扩展都定义了 `deploy` 命令：

- `/deploy` - 执行用户的 deploy 命令
- `/gcp.deploy` - 执行扩展的 deploy 命令（带 `[gcp]` 标签）

## 变量

Qwen Code 扩展支持在 `qwen-extension.json` 中进行变量替换。例如，需要使用当前目录运行 MCP 服务器时，可以写成 `"cwd": "${extensionPath}${/}run.ts"`。

**支持的变量：**

| 变量                         | 说明                                                                                                                       |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `${extensionPath}`           | 扩展在用户文件系统中的完整路径，例如 `/Users/username/.qwen/extensions/example-extension`。不会解析符号链接。              |
| `${workspacePath}`           | 当前工作区的完整路径。                                                                                                     |
| `${/}` 或 `${pathSeparator}` | 路径分隔符（因操作系统而异）。                                                                                             |
