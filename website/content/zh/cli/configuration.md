# Qwen Code 配置

**关于新配置格式的说明**

`settings.json` 文件的格式已更新为一种新的、更有组织的结构。旧格式将自动迁移。

有关旧格式的详细信息，请参见 [v1 配置文档](./configuration-v1.md)。

Qwen Code 提供了多种方式来配置其行为，包括环境变量、命令行参数和设置文件。本文档概述了不同的配置方法和可用的设置项。

## 配置层级

配置按以下优先级顺序应用（数字越小优先级越低，会被数字越高的覆盖）：

1.  **默认值：** 应用程序内的硬编码默认值。
2.  **系统默认配置文件：** 系统范围的默认设置，可被其他配置文件覆盖。
3.  **用户配置文件：** 当前用户的全局设置。
4.  **项目配置文件：** 项目特定的设置。
5.  **系统配置文件：** 系统范围的设置，会覆盖所有其他配置文件。
6.  **环境变量：** 系统范围或会话特定的变量，可能从 `.env` 文件加载。
7.  **命令行参数：** 启动 CLI 时传入的值。

## 配置文件

Qwen Code 使用 JSON 配置文件来持久化配置。这些文件有四个不同的位置：

- **系统默认配置文件：**
  - **位置：** `/etc/qwen-code/system-defaults.json`（Linux）、`C:\ProgramData\qwen-code\system-defaults.json`（Windows）或 `/Library/Application Support/QwenCode/system-defaults.json`（macOS）。可以通过设置 `QWEN_CODE_SYSTEM_DEFAULTS_PATH` 环境变量来覆盖默认路径。
  - **作用范围：** 提供系统级的默认配置基础层。这些配置的优先级最低，预期会被用户、项目或系统覆盖配置所替代。

- **用户配置文件：**
  - **位置：** `~/.qwen/settings.json`（其中 `~` 表示你的用户主目录）。
  - **作用范围：** 应用于当前用户的所有 Qwen Code 会话。

- **项目配置文件：**
  - **位置：** 项目根目录下的 `.qwen/settings.json`。
  - **作用范围：** 仅在从该特定项目运行 Qwen Code 时生效。项目配置会覆盖用户配置。

- **系统配置文件：**
  - **位置：** `/etc/qwen-code/settings.json`（Linux）、`C:\ProgramData\qwen-code\settings.json`（Windows）或 `/Library/Application Support/QwenCode/settings.json`（macOS）。可以通过设置 `QWEN_CODE_SYSTEM_SETTINGS_PATH` 环境变量来覆盖默认路径。
  - **作用范围：** 应用于系统上所有用户的 Qwen Code 会话。系统配置会覆盖用户和项目配置。对于企业中的系统管理员来说，这可能是一个有用的机制，可以对用户的 Qwen Code 设置进行统一控制。

**关于配置中的环境变量说明：** 在你的 `settings.json` 文件中，字符串值可以使用 `$VAR_NAME` 或 `${VAR_NAME}` 语法来引用环境变量。这些变量在配置加载时会自动解析。例如，如果你有一个环境变量 `MY_API_TOKEN`，你可以在 `settings.json` 中这样使用它：`"apiKey": "$MY_API_TOKEN"`。

### 项目中的 `.qwen` 目录

除了项目设置文件之外，项目的 `.qwen` 目录还可以包含其他与 Qwen Code 运行相关的项目特定文件，例如：

- [自定义沙箱配置文件](#sandboxing)（例如：`.qwen/sandbox-macos-custom.sb`、`.qwen/sandbox.Dockerfile`）。

### `settings.json` 中可用的设置项

设置项按类别组织。所有设置都应放置在 `settings.json` 文件中对应的顶层分类对象内。

#### `general`

- **`general.preferredEditor`** (string):
  - **描述：** 用于打开文件的首选编辑器。
  - **默认值：** `undefined`

- **`general.vimMode`** (boolean):
  - **描述：** 启用 Vim 快捷键绑定。
  - **默认值：** `false`

- **`general.disableAutoUpdate`** (boolean):
  - **描述：** 禁用自动更新。
  - **默认值：** `false`

- **`general.disableUpdateNag`** (boolean):
  - **描述：** 禁用更新通知提示。
  - **默认值：** `false`

- **`general.checkpointing.enabled`** (boolean):
  - **描述：** 启用会话检查点功能以支持恢复。
  - **默认值：** `false`

#### `output`

- **`output.format`** (string):
  - **描述：** CLI 输出的格式。
  - **默认值：** `"text"`
  - **可选值：** `"text"`, `"json"`

#### `ui`

- **`ui.theme`** (string):
  - **说明：** UI 的颜色主题。可用选项请参见 [Themes](./themes.md)。
  - **默认值：** `undefined`

- **`ui.customThemes`** (object):
  - **说明：** 自定义主题定义。
  - **默认值：** `{}`

- **`ui.hideWindowTitle`** (boolean):
  - **说明：** 隐藏窗口标题栏。
  - **默认值：** `false`

- **`ui.hideTips`** (boolean):
  - **说明：** 隐藏 UI 中的提示信息。
  - **默认值：** `false`

- **`ui.hideBanner`** (boolean):
  - **说明：** 隐藏应用横幅。
  - **默认值：** `false`

- **`ui.hideFooter`** (boolean):
  - **说明：** 隐藏 UI 中的页脚。
  - **默认值：** `false`

- **`ui.showMemoryUsage`** (boolean):
  - **说明：** 在 UI 中显示内存使用情况信息。
  - **默认值：** `false`

- **`ui.showLineNumbers`** (boolean):
  - **说明：** 在聊天界面中显示行号。
  - **默认值：** `false`

- **`ui.showCitations`** (boolean):
  - **说明：** 在聊天界面中显示生成文本的引用来源。
  - **默认值：** `true`

- **`enableWelcomeBack`** (boolean):
  - **说明：** 当返回到有对话历史的项目时，显示欢迎回来对话框。
  - **默认值：** `true`

- **`ui.accessibility.disableLoadingPhrases`** (boolean):
  - **说明：** 为无障碍功能禁用加载时的提示语。
  - **默认值：** `false`

- **`ui.customWittyPhrases`** (array of strings):
  - **说明：** 自定义加载时显示的提示语列表。如果提供此选项，CLI 将循环显示这些自定义提示语，而不是默认的提示语。
  - **默认值：** `[]`

#### `ide`

- **`ide.enabled`** (boolean):
  - **Description:** 启用 IDE 集成模式。
  - **Default:** `false`

- **`ide.hasSeenNudge`** (boolean):
  - **Description:** 用户是否已经看到过 IDE 集成提示。
  - **Default:** `false`

#### `privacy`

- **`privacy.usageStatisticsEnabled`** (boolean):
  - **Description:** 启用使用统计信息收集。
  - **Default:** `true`

#### `model`

- **`model.name`** (string):
  - **Description:** 用于对话的 Qwen 模型。
  - **Default:** `undefined`

- **`model.maxSessionTurns`** (number):
  - **Description:** 一个 session 中保留的最大用户/模型/tool 交互轮数。-1 表示无限制。
  - **Default:** `-1`

- **`model.summarizeToolOutput`** (object):
  - **Description:** 启用或禁用 tool 输出的摘要功能。你可以通过 `tokenBudget` 设置来指定摘要的 token 预算。注意：目前仅支持 `run_shell_command` 工具。例如：`{"run_shell_command": {"tokenBudget": 2000}}`
  - **Default:** `undefined`

- **`model.chatCompression.contextPercentageThreshold`** (number):
  - **Description:** 设置聊天历史压缩的阈值，以模型总 token 限制的百分比表示。该值介于 0 和 1 之间，适用于自动压缩和手动 `/compress` 命令。例如，设置为 `0.6` 时，当聊天历史超过 token 限制的 60% 时将触发压缩。
  - **Default:** `0.7`

- **`model.skipNextSpeakerCheck`** (boolean):
  - **Description:** 跳过下一个发言者检查。
  - **Default:** `false`

- **`model.skipLoopDetection`** (boolean):
  - **Description:** 禁用循环检测检查。循环检测用于防止 AI 回复中的无限循环，但可能会产生误报，从而中断正常的工作流程。如果你频繁遇到误报导致的循环检测中断，可以启用此选项。
  - **Default:** `false`

#### `context`

- **`context.fileName`** (string 或 string 数组):
  - **说明：** 上下文文件的名称。
  - **默认值：** `undefined`

- **`context.importFormat`** (string):
  - **说明：** 导入记忆时使用的格式。
  - **默认值：** `undefined`

- **`context.discoveryMaxDirs`** (number):
  - **说明：** 搜索记忆时最多查找的目录数量。
  - **默认值：** `200`

- **`context.includeDirectories`** (array):
  - **说明：** 需要包含在工作区上下文中的额外目录。缺失的目录将被跳过，并显示警告信息。
  - **默认值：** `[]`

- **`context.loadFromIncludeDirectories`** (boolean):
  - **说明：** 控制 `/memory refresh` 命令的行为。如果设置为 `true`，应从所有已添加的目录中加载 `QWEN.md` 文件；如果设置为 `false`，则只应从当前目录加载 `QWEN.md`。
  - **默认值：** `false`

- **`context.fileFiltering.respectGitIgnore`** (boolean):
  - **说明：** 在搜索时是否遵循 `.gitignore` 文件。
  - **默认值：** `true`

- **`context.fileFiltering.respectQwenIgnore`** (boolean):
  - **说明：** 在搜索时是否遵循 `.qwenignore` 文件。
  - **默认值：** `true`

- **`context.fileFiltering.enableRecursiveFileSearch`** (boolean):
  - **说明：** 在提示中补全 `@` 前缀时，是否启用递归搜索当前目录树下的文件名。
  - **默认值：** `true`

#### `tools`

- **`tools.sandbox`** (boolean 或 string):
  - **说明：** 沙盒执行环境（可以是布尔值或路径字符串）。
  - **默认值：** `undefined`

- **`tools.shell.enableInteractiveShell`** (boolean):

  使用 `node-pty` 来启用交互式 shell 体验。如果失败则回退到 `child_process`。默认为 `false`。

- **`tools.core`** (字符串数组):
  - **说明：** 可用于限制内置工具的集合 [通过白名单方式](./enterprise.md#restricting-tool-access)。核心工具列表请参见 [Built-in Tools](../core/tools-api.md#built-in-tools)。匹配语义与 `tools.allowed` 相同。
  - **默认值：** `undefined`

- **`tools.exclude`** (字符串数组):
  - **说明：** 要从发现过程中排除的工具名称。
  - **默认值：** `undefined`

- **`tools.allowed`** (字符串数组):
  - **说明：** 绕过确认对话框的工具名称列表。这适用于你信任并经常使用的工具。例如，`["run_shell_command(git)", "run_shell_command(npm test)"]` 将跳过运行任何 `git` 和 `npm test` 命令时的确认提示。关于前缀匹配、命令链等详细信息，请参阅 [Shell Tool command restrictions](../tools/shell.md#command-restrictions)。
  - **默认值：** `undefined`

- **`tools.approvalMode`** (string):
  - **说明：** 设置工具使用时的默认审批模式。可接受的值包括：
    - `plan`: 仅分析，不修改文件也不执行命令。
    - `default`: 在编辑文件或运行 shell 命令之前需要审批。
    - `auto-edit`: 自动批准文件编辑操作。
    - `yolo`: 自动批准所有工具调用。
  - **默认值：** `default`

- **`tools.discoveryCommand`** (string):
  - **说明：** 用于工具发现的命令。
  - **默认值：** `undefined`

- **`tools.callCommand`** (string):
  - **说明：** 定义一个自定义 shell 命令，用来调用通过 `tools.discoveryCommand` 发现的特定工具。该 shell 命令必须满足以下条件：
    - 必须将函数名（与 [function declaration](https://ai.google.dev/gemini-api/docs/function-calling#function-declarations) 中完全一致）作为第一个命令行参数。
    - 必须从 `stdin` 读取 JSON 格式的函数参数，类似于 [`functionCall.args`](https://cloud.google.com/vertex-ai/generative-ai/docs/model-reference/inference#functioncall)。
    - 必须在 `stdout` 上返回 JSON 格式的函数输出结果，类似于 [`functionResponse.response.content`](https://cloud.google.com/vertex-ai/generative-ai/docs/model-reference/inference#functionresponse)。
  - **默认值：** `undefined`

#### `mcp`

- **`mcp.serverCommand`** (string):
  - **描述：** 启动 MCP server 的命令。
  - **默认值：** `undefined`

- **`mcp.allowed`** (字符串数组):
  - **描述：** 允许的 MCP server 白名单。
  - **默认值：** `undefined`

- **`mcp.excluded`** (字符串数组):
  - **描述：** 排除的 MCP server 黑名单。
  - **默认值：** `undefined`

#### `security`

- **`security.folderTrust.enabled`** (boolean):
  - **描述：** 是否启用文件夹信任功能。
  - **默认值：** `false`

- **`security.auth.selectedType`** (string):
  - **描述：** 当前选择的认证类型。
  - **默认值：** `undefined`

- **`security.auth.enforcedType`** (string):
  - **描述：** 强制要求的认证类型（适用于企业环境）。
  - **默认值：** `undefined`

- **`security.auth.useExternal`** (boolean):
  - **描述：** 是否使用外部认证流程。
  - **默认值：** `undefined`

#### `advanced`

- **`advanced.autoConfigureMemory`** (boolean):
  - **说明：** 自动配置 Node.js 内存限制。
  - **默认值：** `false`

- **`advanced.dnsResolutionOrder`** (string):
  - **说明：** DNS 解析顺序。
  - **默认值：** `undefined`

- **`advanced.excludedEnvVars`** (array of strings):
  - **说明：** 从项目上下文中排除的环境变量。
  - **默认值：** `["DEBUG","DEBUG_MODE"]`

- **`advanced.bugCommand`** (object):
  - **说明：** bug 报告命令的配置。
  - **默认值：** `undefined`

- **`advanced.tavilyApiKey`** (string):
  - **说明：** Tavily 网络搜索服务的 API key。需要此 key 来启用 `web_search` 工具功能。如果未配置，网络搜索工具将被禁用并跳过。
  - **默认值：** `undefined`

#### `mcpServers`

配置与一个或多个 Model-Context Protocol (MCP) 服务器的连接，用于发现和使用自定义工具。Qwen Code 会尝试连接到每个配置的 MCP 服务器以发现可用工具。如果多个 MCP 服务器暴露了同名工具，工具名称将会加上你在配置中定义的服务器别名前缀（例如 `serverAlias__actualToolName`）以避免冲突。注意，系统可能会为了兼容性而从 MCP 工具定义中移除某些 schema 属性。必须提供 `command`、`url` 或 `httpUrl` 中的至少一个。如果多个都被指定，则优先级顺序为 `httpUrl` > `url` > `command`。

- **`mcpServers.<SERVER_NAME>`** (object)：指定名称的服务器参数。
  - `command` (string, optional)：通过标准 I/O 启动 MCP 服务器的命令。
  - `args` (array of strings, optional)：传递给命令的参数列表。
  - `env` (object, optional)：为服务器进程设置的环境变量。
  - `cwd` (string, optional)：启动服务器时使用的工作目录。
  - `url` (string, optional)：使用 Server-Sent Events (SSE) 进行通信的 MCP 服务器 URL。
  - `httpUrl` (string, optional)：使用可流式 HTTP 进行通信的 MCP 服务器 URL。
  - `headers` (object, optional)：发送到 `url` 或 `httpUrl` 的请求中包含的 HTTP headers 映射。
  - `timeout` (number, optional)：对此 MCP 服务器请求的超时时间（毫秒）。
  - `trust` (boolean, optional)：信任此服务器并跳过所有工具调用确认。
  - `description` (string, optional)：服务器的简要描述，可用于展示目的。
  - `includeTools` (array of strings, optional)：从此 MCP 服务器包含的工具名称列表。指定后，仅此列表中的工具会从该服务器可用（白名单行为）。未指定时，默认启用服务器的所有工具。
  - `excludeTools` (array of strings, optional)：从此 MCP 服务器排除的工具名称列表。即使服务器暴露了这些工具，模型也无法使用。**注意：** `excludeTools` 优先级高于 `includeTools` —— 如果某个工具同时出现在两个列表中，它将被排除。

#### `telemetry`

配置 Qwen Code 的日志记录和指标收集。更多信息请参见 [Telemetry](../telemetry.md)。

- **属性：**
  - **`enabled`** (boolean)：是否启用遥测功能。
  - **`target`** (string)：遥测数据的发送目标。支持的值为 `local` 和 `gcp`。
  - **`otlpEndpoint`** (string)：OTLP Exporter 的 endpoint。
  - **`otlpProtocol`** (string)：OTLP Exporter 使用的协议（`grpc` 或 `http`）。
  - **`logPrompts`** (boolean)：是否在日志中包含用户 prompt 的内容。
  - **`outfile`** (string)：当 `target` 设置为 `local` 时，用于写入遥测数据的文件路径。
  - **`useCollector`** (boolean)：是否使用外部 OTLP collector。

### 示例 `settings.json`

以下是一个 `settings.json` 文件的示例，展示了从 v0.3.0 开始支持的嵌套结构：

```json
{
  "general": {
    "vimMode": true,
    "preferredEditor": "code"
  },
  "ui": {
    "theme": "GitHub",
    "hideBanner": true,
    "hideTips": false,
    "customWittyPhrases": [
      "You forget a thousand things every day. Make sure this is one of ’em",
      "Connecting to AGI"
    ]
  },
  "tools": {
    "approvalMode": "yolo",
    "sandbox": "docker",
    "discoveryCommand": "bin/get_tools",
    "callCommand": "bin/call_tool",
    "exclude": ["write_file"]
  },
  "mcpServers": {
    "mainServer": {
      "command": "bin/mcp_server.py"
    },
    "anotherServer": {
      "command": "node",
      "args": ["mcp_server.js", "--verbose"]
    }
  },
  "telemetry": {
    "enabled": true,
    "target": "local",
    "otlpEndpoint": "http://localhost:4317",
    "logPrompts": true
  },
  "privacy": {
    "usageStatisticsEnabled": true
  },
  "model": {
    "name": "qwen3-coder-plus",
    "maxSessionTurns": 10,
    "summarizeToolOutput": {
      "run_shell_command": {
        "tokenBudget": 100
      }
    }
  },
  "context": {
    "fileName": ["CONTEXT.md", "QWEN.md"],
    "includeDirectories": ["path/to/dir1", "~/path/to/dir2", "../path/to/dir3"],
    "loadFromIncludeDirectories": true,
    "fileFiltering": {
      "respectGitIgnore": false
    }
  },
  "advanced": {
    "excludedEnvVars": ["DEBUG", "DEBUG_MODE", "NODE_ENV"]
  }
}
```

## Shell History

CLI 会保存你运行的 shell 命令历史记录。为了避免不同项目之间的冲突，这些历史记录会存储在用户主目录下的项目专属目录中。

- **位置：** `~/.qwen/tmp/<project_hash>/shell_history`
  - `<project_hash>` 是根据你的项目根路径生成的唯一标识符。
  - 历史记录会保存在一个名为 `shell_history` 的文件中。

## 环境变量与 `.env` 文件

环境变量是配置应用的常见方式，尤其适用于敏感信息（如 API key）或在不同环境中可能变化的设置。关于认证配置，请参考 [Authentication documentation](./authentication.md)，其中涵盖了所有可用的认证方法。

CLI 会自动从 `.env` 文件中加载环境变量。加载顺序如下：

1. 当前工作目录中的 `.env` 文件。
2. 如果未找到，则向上级目录查找，直到找到 `.env` 文件，或者到达项目根目录（以 `.git` 文件夹为标识）或用户主目录为止。
3. 若仍未找到，则尝试读取 `~/.env`（即用户主目录下的 `.env` 文件）。

**环境变量排除机制：** 某些环境变量（例如 `DEBUG` 和 `DEBUG_MODE`）默认会被自动排除在项目的 `.env` 文件之外，以防干扰 CLI 的行为。而来自 `.qwen/.env` 文件的变量则永远不会被排除。你可以通过修改 `settings.json` 中的 `advanced.excludedEnvVars` 设置来自定义这一行为。

- **`OPENAI_API_KEY`**：
  - 多种可选 [认证方式](./authentication.md) 之一。
  - 可在 shell 配置文件（如 `~/.bashrc`、`~/.zshrc`）或 `.env` 文件中设置。
- **`OPENAI_BASE_URL`**：
  - 多种可选 [认证方式](./authentication.md) 之一。
  - 可在 shell 配置文件（如 `~/.bashrc`、`~/.zshrc`）或 `.env` 文件中设置。
- **`OPENAI_MODEL`**：
  - 指定默认使用的 OPENAI 模型。
  - 覆盖硬编码的默认值。
  - 示例：`export OPENAI_MODEL="qwen3-coder-plus"`
- **`GEMINI_TELEMETRY_ENABLED`**：
  - 设为 `true` 或 `1` 启用遥测功能；其他任意值视为禁用。
  - 覆盖 `telemetry.enabled` 设置项。
- **`GEMINI_TELEMETRY_TARGET`**：
  - 设置遥测目标（`local` 或 `gcp`）。
  - 覆盖 `telemetry.target` 设置项。
- **`GEMINI_TELEMETRY_OTLP_ENDPOINT`**：
  - 设置遥测所使用的 OTLP endpoint。
  - 覆盖 `telemetry.otlpEndpoint` 设置项。
- **`GEMINI_TELEMETRY_OTLP_PROTOCOL`**：
  - 设置 OTLP 协议类型（`grpc` 或 `http`）。
  - 覆盖 `telemetry.otlpProtocol` 设置项。
- **`GEMINI_TELEMETRY_LOG_PROMPTS`**：
  - 设为 `true` 或 `1` 来启用或禁用记录用户 prompt 日志的功能；其他任意值视为禁用。
  - 覆盖 `telemetry.logPrompts` 设置项。
- **`GEMINI_TELEMETRY_OUTFILE`**：
  - 当遥测目标为 `local` 时，指定写入遥测数据的文件路径。
  - 覆盖 `telemetry.outfile` 设置项。
- **`GEMINI_TELEMETRY_USE_COLLECTOR`**：
  - 设为 `true` 或 `1` 来启用或禁用外部 OTLP collector；其他任意值视为禁用。
  - 覆盖 `telemetry.useCollector` 设置项。
- **`GEMINI_SANDBOX`**：
  - 替代 `settings.json` 中的 `sandbox` 设置项。
  - 接受 `true`、`false`、`docker`、`podman` 或自定义命令字符串作为参数。
- **`SEATBELT_PROFILE`**（仅限 macOS）：
  - 在 macOS 上切换 Seatbelt（`sandbox-exec`）策略。
  - `permissive-open`：（默认）限制对项目目录及其他少数目录的写操作（详见 `packages/cli/src/utils/sandbox-macos-permissive-open.sb`），但允许其余操作。
  - `strict`：使用严格模式，默认拒绝所有操作。
  - `<profile_name>`：使用自定义策略。要定义一个自定义策略，请在项目 `.qwen/` 目录下创建名为 `sandbox-macos-<profile_name>.sb` 的文件（例如：`my-project/.qwen/sandbox-macos-custom.sb`）。
- **`DEBUG` 或 `DEBUG_MODE`**（通常由底层库或 CLI 自身使用）：
  - 设为 `true` 或 `1` 开启详细调试日志输出，有助于排查问题。
  - **注意：** 这两个变量默认会被自动排除在项目 `.env` 文件外，防止影响 CLI 行为。如果你需要专门针对 Qwen Code 设置这些变量，请使用 `.qwen/.env` 文件。
- **`NO_COLOR`**：
  - 设置任意值即可关闭 CLI 所有颜色输出。
- **`CLI_TITLE`**：
  - 设置该值可以自定义 CLI 标题显示内容。
- **`TAVILY_API_KEY`**：
  - Tavily 网络搜索服务的 API key。
  - 必须配置才能启用 `web_search` 工具功能。
  - 如未配置，则网络搜索工具将被跳过并禁用。
  - 示例：`export TAVILY_API_KEY="tvly-your-api-key-here"`

## 命令行参数

在运行 CLI 时直接传入的参数可以覆盖该特定会话的其他配置。

- **`--model <model_name>`** (**`-m <model_name>`**)：
  - 指定本次会话使用的 Qwen 模型。
  - 示例：`npm start -- --model qwen3-coder-plus`
- **`--prompt <your_prompt>`** (**`-p <your_prompt>`**)：
  - 直接将 prompt 传递给命令。这将以非交互模式调用 Qwen Code。
  - 对于脚本示例，请使用 `--output-format json` 标志以获取结构化输出。
- **`--prompt-interactive <your_prompt>`** (**`-i <your_prompt>`**)：
  - 使用提供的 prompt 作为初始输入启动一个交互式会话。
  - prompt 将在交互式会话中处理，而不是在其之前处理。
  - 当从 stdin 管道输入时不能使用此选项。
  - 示例：`qwen -i "explain this code"`
- **`--output-format <format>`**：
  - **说明：** 指定非交互模式下 CLI 输出的格式。
  - **可选值：**
    - `text`：（默认）标准的人类可读输出。
    - `json`：机器可读的 JSON 输出。
  - **注意：** 要获得结构化输出和用于脚本编写，请使用 `--output-format json` 标志。
- **`--sandbox`** (**`-s`**)：
  - 为本次会话启用沙盒模式。
- **`--sandbox-image`**：
  - 设置沙盒镜像 URI。
- **`--debug`** (**`-d`**)：
  - 启用调试模式，提供更详细的输出信息。
- **`--all-files`** (**`-a`**)：
  - 如果设置，则递归地包含当前目录中的所有文件作为 prompt 的上下文。
- **`--help`** （或 **`-h`**）：
  - 显示关于命令行参数的帮助信息。
- **`--show-memory-usage`**：
  - 显示当前内存使用情况。
- **`--yolo`**：
  - 启用 YOLO 模式，自动批准所有工具调用。
- **`--approval-mode <mode>`**：
  - 设置工具调用的审批模式。支持的模式包括：
    - `plan`：仅分析——不修改文件或执行命令。
    - `default`：需要对文件编辑或 shell 命令进行审批（默认行为）。
    - `auto-edit`：自动批准编辑工具（如 edit、write_file），而对其它操作提示用户确认。
    - `yolo`：自动批准所有工具调用（等同于 `--yolo`）。
  - 不可与 `--yolo` 同时使用。请改用 `--approval-mode=yolo` 来采用新的统一方式。
  - 示例：`qwen --approval-mode auto-edit`
- **`--allowed-tools <tool1,tool2,...>`**：
  - 工具名称列表（逗号分隔），这些工具将跳过确认对话框。
  - 示例：`qwen --allowed-tools "ShellTool(git status)"`
- **`--telemetry`**：
  - 启用 [遥测功能](../telemetry.md)。
- **`--telemetry-target`**：
  - 设置遥测目标。更多信息请参见 [遥测](../telemetry.md)。
- **`--telemetry-otlp-endpoint`**：
  - 设置遥测的 OTLP 终端地址。更多信息请参见 [遥测](../telemetry.md)。
- **`--telemetry-otlp-protocol`**：
  - 设置遥测所使用的 OTLP 协议（`grpc` 或 `http`）。默认是 `grpc`。更多信息请参见 [遥测](../telemetry.md)。
- **`--telemetry-log-prompts`**：
  - 启用遥测日志记录 prompt 功能。更多信息请参见 [遥测](../telemetry.md)。
- **`--checkpointing`**：
  - 启用 [检查点机制](../checkpointing.md)。
- **`--extensions <extension_name ...>`** (**`-e <extension_name ...>`**)：
  - 指定本次会话要使用的扩展列表。如果未指定，则使用所有可用扩展。
  - 可使用特殊关键字 `qwen -e none` 禁用所有扩展。
  - 示例：`qwen -e my-extension -e my-other-extension`
- **`--list-extensions`** (**`-l`**)：
  - 列出所有可用扩展并退出程序。
- **`--proxy`**：
  - 设置 CLI 所使用的代理服务器。
  - 示例：`--proxy http://localhost:7890`。
- **`--include-directories <dir1,dir2,...>`**：
  - 在工作区中添加额外目录以支持多目录项目。
  - 支持多次指定或者通过逗号分隔多个路径。
  - 最多允许添加 5 个目录。
  - 示例：`--include-directories /path/to/project1,/path/to/project2` 或者 `--include-directories /path/to/project1 --include-directories /path/to/project2`
- **`--screen-reader`**：
  - 启用屏幕阅读器模式，调整 TUI 以便更好地兼容屏幕阅读器。
- **`--version`**：
  - 显示 CLI 版本信息。
- **`--openai-logging`**：
  - 启用 OpenAI API 调用的日志记录功能，便于调试和分析。此标志优先级高于 `settings.json` 中的 `enableOpenAILogging` 配置项。
- **`--tavily-api-key <api_key>`**：
  - 为此会话设置 Tavily API 密钥以启用网页搜索功能。
  - 示例：`qwen --tavily-api-key tvly-your-api-key-here`

## Context Files (分层指令上下文)

虽然严格来说不是 CLI 行为的配置，但 context files（默认为 `QWEN.md`，可通过 `context.fileName` 设置进行自定义）对于配置“指令上下文”（也称为“记忆”）至关重要。这一强大功能允许你向 AI 提供项目特定的指令、编码风格指南或任何相关的背景信息，从而使它的响应更贴合你的需求。CLI 包含一些 UI 元素，例如底部显示已加载 context files 数量的指示器，以便让你随时了解当前激活的上下文。

- **用途：** 这些 Markdown 文件包含你希望 Qwen 模型在交互过程中了解的指令、指南或上下文信息。系统设计支持对这类指令上下文进行分层管理。

### 示例上下文文件内容（例如，`QWEN.md`）

以下是一个概念性示例，展示了一个位于 TypeScript 项目根目录的上下文文件可能包含的内容：

```markdown

# Project: My Awesome TypeScript Library

## General Instructions:

- 当生成新的 TypeScript 代码时，请遵循现有的编码风格。
- 确保所有新函数和类都有 JSDoc 注释。
- 在适当的情况下优先使用函数式编程范式。
- 所有代码应兼容 TypeScript 5.0 和 Node.js 20+。

## Coding Style:

- 使用 2 个空格进行缩进。
- 接口名称应以 `I` 为前缀（例如：`IUserService`）。
- 类的私有成员应以下划线（`_`）为前缀。
- 始终使用严格相等（`===` 和 `!==`）。

## Specific Component: `src/api/client.ts`

- 此文件处理所有对外的 API 请求。
- 添加新的 API 调用函数时，确保包含健壮的错误处理和日志记录。
- 对于所有的 GET 请求，请使用现有的 `fetchWithRetry` 工具函数。
```

## 关于依赖项：

- 尽量避免引入新的外部依赖，除非绝对必要。
- 如果确实需要新增依赖，请说明原因。

```

这个示例展示了如何提供通用的项目背景、具体的编码规范，甚至针对特定文件或组件的注意事项。你提供的上下文文件越相关且精确，AI 就能更好地协助你。我们强烈建议为项目创建特定的上下文文件，以建立一致的约定和共享背景。

- **分层加载与优先级：** CLI 实现了一套复杂的分层内存系统，它会从多个位置加载上下文文件（例如 `QWEN.md`）。列表中靠后的位置（更具体）的内容通常会覆盖或补充靠前位置（更通用）的内容。你可以使用 `/memory show` 命令查看实际的拼接顺序以及最终使用的上下文内容。典型的加载顺序如下：
  1.  **全局上下文文件：**
      - 路径：`~/.qwen/<configured-context-filename>` （例如在用户主目录下的 `~/.qwen/QWEN.md`）。
      - 作用范围：为所有项目提供默认指令。
  2.  **项目根目录及祖先目录中的上下文文件：**
      - 路径：CLI 会在当前工作目录及其上级目录中查找配置的上下文文件，直到遇到项目的根目录（由 `.git` 文件夹标识）或者用户的家目录为止。
      - 作用范围：提供对整个项目或其重要部分相关的上下文信息。
  3.  **子目录中的上下文文件（局部/情境化）：**
      - 路径：CLI 还会在当前工作目录之下的子目录中搜索配置的上下文文件（遵循如 `node_modules`、`.git` 等常见的忽略规则）。默认情况下最多扫描 200 个目录，但可以通过修改 `settings.json` 中的 `context.discoveryMaxDirs` 设置来调整这一限制。
      - 作用范围：允许为某个特定组件、模块或项目的一个小节提供高度定制化的指令。
- **内容拼接与界面提示：** 所有找到的上下文文件内容会被依次拼接起来（每个片段之间插入标明来源和路径的分隔符），并作为系统提示的一部分传给模型。CLI 的底部状态栏会显示已加载的上下文文件数量，让你可以快速了解当前生效的指令环境。
- **导入内容：** 你可以通过在 Markdown 文件中使用 `@path/to/file.md` 语法来将其他 Markdown 文件模块化地引入到上下文中。详情请参阅 [Memory Import Processor 文档](../core/memport.md)。
- **用于管理记忆的命令：**
  - 使用 `/memory refresh` 强制重新扫描并从所有配置的位置重新加载上下文文件。这将更新 AI 当前所用的指令上下文。
  - 使用 `/memory show` 显示当前已加载的所有指令上下文内容，方便你确认 AI 正在使用的层级结构和具体内容。
  - 更多关于 `/memory` 命令及其子命令（`show` 和 `refresh`）的信息，请参见 [Commands 文档](./commands.md#memory)。

理解并善用这些配置层级以及上下文文件的层次特性，可以帮助你有效地管理 AI 的“记忆”，从而让 Qwen Code 的响应更加贴合你的具体需求和项目场景。

## 沙箱机制

Qwen Code 可以在沙箱环境中执行潜在的不安全操作（如 shell 命令和文件修改），以保护你的系统。

沙箱机制默认是禁用的，但你可以通过以下几种方式启用它：

- 使用 `--sandbox` 或 `-s` 参数。
- 设置 `GEMI_SANDBOX` 环境变量。
- 当使用 `--yolo` 或 `--approval-mode=yolo` 时，沙箱机制会默认启用。

默认情况下，它使用预构建的 `qwen-code-sandbox` Docker 镜像。

如果你的项目有特定的沙箱需求，可以在项目根目录下创建一个自定义的 Dockerfile，路径为 `.qwen/sandbox.Dockerfile`。这个 Dockerfile 可以基于基础沙箱镜像：

```dockerfile
FROM qwen-code-sandbox

# 在这里添加你自定义的依赖项或配置

# 例如：

# RUN apt-get update && apt-get install -y some-package
```

# COPY ./my-config /app/my-config
```

当 `.qwen/sandbox.Dockerfile` 存在时，你可以在运行 Qwen Code 时使用 `BUILD_SANDBOX` 环境变量来自动构建自定义 sandbox 镜像：

```bash
BUILD_SANDBOX=1 qwen -s
```

## 使用统计

为了帮助我们改进 Qwen Code，我们会收集匿名化的使用统计数据。这些数据有助于我们了解 CLI 的使用情况，识别常见问题，并确定新功能的优先级。

**我们收集的数据包括：**

- **工具调用：** 我们会记录被调用的工具名称、执行成功或失败的状态以及执行耗时。但我们不会收集传递给工具的参数或工具返回的任何数据。
- **API 请求：** 我们会记录每次请求所使用的模型、请求持续时间以及是否成功。但我们不会收集 prompt 或响应的内容。
- **会话信息：** 我们会收集有关 CLI 配置的信息，例如启用的工具和审批模式。

**我们不收集的数据包括：**

- **个人身份信息（PII）：** 我们不会收集任何个人信息，如您的姓名、电子邮件地址或 API key。
- **Prompt 和响应内容：** 我们不会记录您提交的 prompt 内容或模型返回的响应内容。
- **文件内容：** 我们不会记录 CLI 读取或写入的任何文件的内容。

**如何退出数据收集：**

您可以随时通过在 `settings.json` 文件中的 `privacy` 分类下将 `usageStatisticsEnabled` 属性设置为 `false` 来选择退出使用统计收集：

```json
{
  "privacy": {
    "usageStatisticsEnabled": false
  }
}
```

注意：当启用使用统计时，事件会被发送到阿里云 RUM 数据收集端点。