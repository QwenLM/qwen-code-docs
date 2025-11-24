# Qwen Code 配置

**关于新配置格式的说明**

`settings.json` 文件的格式已更新为一种新的、更有组织的结构。旧格式将自动迁移。

有关之前格式的详细信息，请参阅 [v1 配置文档](./configuration-v1.md)。

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

Qwen Code 使用 JSON 配置文件来保存持久化设置。这些文件可以存在于以下四个位置：

- **系统默认配置文件：**
  - **路径：** `/etc/qwen-code/system-defaults.json`（Linux）、`C:\ProgramData\qwen-code\system-defaults.json`（Windows）或 `/Library/Application Support/QwenCode/system-defaults.json`（macOS）。可通过环境变量 `QWEN_CODE_SYSTEM_DEFAULTS_PATH` 覆盖该路径。
  - **作用范围：** 提供系统级的默认配置基础层。这些配置优先级最低，预期会被用户、项目或系统覆盖配置所替代。

- **用户配置文件：**
  - **路径：** `~/.qwen/settings.json`（其中 `~` 表示你的用户主目录）。
  - **作用范围：** 应用于当前用户的所有 Qwen Code 会话。

- **项目配置文件：**
  - **路径：** 项目根目录下的 `.qwen/settings.json`。
  - **作用范围：** 仅在从该项目目录运行 Qwen Code 时生效。项目配置会覆盖用户配置。

- **系统配置文件：**
  - **路径：** `/etc/qwen-code/settings.json`（Linux）、`C:\ProgramData\qwen-code\settings.json`（Windows）或 `/Library/Application Support/QwenCode/settings.json`（macOS）。可通过环境变量 `QWEN_CODE_SYSTEM_SETTINGS_PATH` 覆盖该路径。
  - **作用范围：** 应用于系统中所有用户的 Qwen Code 会话。系统配置会覆盖用户和项目配置。企业中的系统管理员可利用此机制对用户的 Qwen Code 设置进行统一控制。

**关于配置中的环境变量说明：** 在你的 `settings.json` 文件中，字符串值可以通过 `$VAR_NAME` 或 `${VAR_NAME}` 的语法引用环境变量。这些变量会在配置加载时自动解析。例如，如果你有一个名为 `MY_API_TOKEN` 的环境变量，则可以在 `settings.json` 中这样使用它：`"apiKey": "$MY_API_TOKEN"`。

### 项目中的 `.qwen` 目录

除了项目设置文件之外，项目的 `.qwen` 目录还可以包含其他与 Qwen Code 操作相关的项目特定文件，例如：

- [自定义沙箱配置文件](#sandboxing)（例如，`.qwen/sandbox-macos-custom.sb`、`.qwen/sandbox.Dockerfile`）。

### `settings.json` 中可用的设置

设置按类别组织。所有设置都应放置在 `settings.json` 文件中对应的顶层分类对象内。

#### `general`

- **`general.preferredEditor`** (string):
  - **描述:** 用于打开文件的首选编辑器。
  - **默认值:** `undefined`

- **`general.vimMode`** (boolean):
  - **描述:** 启用 Vim 快捷键绑定。
  - **默认值:** `false`

- **`general.disableAutoUpdate`** (boolean):
  - **描述:** 禁用自动更新。
  - **默认值:** `false`

- **`general.disableUpdateNag`** (boolean):
  - **描述:** 禁用更新通知提示。
  - **默认值:** `false`

- **`general.checkpointing.enabled`** (boolean):
  - **描述:** 启用会话检查点功能以支持恢复。
  - **默认值:** `false`

#### `output`

- **`output.format`** (string):
  - **描述:** CLI 输出的格式。
  - **默认值:** `"text"`
  - **可选值:** `"text"`, `"json"`

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
  - **说明：** 自定义加载状态下显示的提示语列表。如果提供此选项，CLI 将循环显示这些自定义提示语，而不是默认的提示语。
  - **默认值：** `[]`

#### `ide`

- **`ide.enabled`** (boolean):
  - **描述：** 启用 IDE 集成模式。
  - **默认值：** `false`

- **`ide.hasSeenNudge`** (boolean):
  - **描述：** 用户是否已经看到过 IDE 集成提示。
  - **默认值：** `false`

#### `privacy`

- **`privacy.usageStatisticsEnabled`** (boolean):
  - **描述：** 启用使用统计信息收集。
  - **默认值：** `true`

#### `model`

- **`model.name`** (string):
  - **说明：** 用于对话的 Qwen 模型名称。
  - **默认值：** `undefined`

- **`model.maxSessionTurns`** (number):
  - **说明：** 单个会话中保留的最大用户/模型/tool 轮次。设置为 -1 表示无限制。
  - **默认值：** `-1`

- **`model.summarizeToolOutput`** (object):
  - **说明：** 启用或禁用对工具输出内容的摘要功能。你可以通过 `tokenBudget` 参数指定摘要使用的 token 预算。注意：目前仅支持 `run_shell_command` 工具。例如：`{"run_shell_command": {"tokenBudget": 2000}}`
  - **默认值：** `undefined`

- **`model.chatCompression.contextPercentageThreshold`** (number):
  - **说明：** 设置聊天历史压缩触发阈值（占模型总 token 上限的百分比）。该值范围是 0 到 1，适用于自动压缩和手动 `/compress` 命令。例如，设为 `0.6` 表示当聊天记录超过 token 上限的 60% 时开始压缩。设置为 `0` 可完全关闭压缩功能。
  - **默认值：** `0.7`

- **`model.generationConfig`** (object):
  - **说明：** 传递给底层内容生成器的高级参数覆盖项。支持请求控制选项如 `timeout`、`maxRetries` 和 `disableCacheControl`，以及在 `samplingParams` 下的调优参数（比如 `temperature`、`top_p`、`max_tokens`）。留空则使用 provider 的默认配置。
  - **默认值：** `undefined`
  - **示例：**

    ```json
    {
      "model": {
        "generationConfig": {
          "timeout": 60000,
          "disableCacheControl": false,
          "samplingParams": {
            "temperature": 0.2,
            "top_p": 0.8,
            "max_tokens": 1024
          }
        }
      }
    }
    ```

- **`model.skipNextSpeakerCheck`** (boolean):
  - **说明：** 跳过下一位发言者检查。
  - **默认值：** `false`

- **`model.skipLoopDetection`** (boolean):
  - **说明：** 禁用循环检测机制。循环检测可防止 AI 回复中的无限循环问题，但可能误判并中断正常流程。如果你频繁遇到误报导致的工作流中断，请启用此选项。
  - **默认值：** `false`

- **`model.skipStartupContext`** (boolean):
  - **说明：** 在每次会话开始时不发送初始工作区上下文信息（包括环境概要与确认消息）。若你希望手动提供上下文或者节省启动阶段的 token 使用量，则可以开启此项。
  - **默认值：** `false`

- **`model.enableOpenAILogging`** (boolean):
  - **说明：** 开启 OpenAI API 请求日志记录以供调试和分析。启用后，API 的请求与响应将被写入 JSON 文件。
  - **默认值：** `false`

- **`model.openAILoggingDir`** (string):
  - **说明：** 自定义 OpenAI API 日志文件存储路径。未指定时，默认保存到当前目录下的 `logs/openai` 目录。支持绝对路径、相对路径（基于当前工作目录解析）及 `~` 展开符（表示主目录）。
  - **默认值：** `undefined`
  - **示例：**
    - `"~/qwen-logs"` - 将日志写入用户主目录下的 `qwen-logs` 文件夹
    - `"./custom-logs"` - 写入相对于当前目录的 `custom-logs` 文件夹
    - `"/tmp/openai-logs"` - 写入绝对路径 `/tmp/openai-logs`

#### `context`

- **`context.fileName`** (string 或 string 数组):
  - **说明：** context 文件的名称。
  - **默认值：** `undefined`

- **`context.importFormat`** (string):
  - **说明：** 导入 memory 时使用的格式。
  - **默认值：** `undefined`

- **`context.discoveryMaxDirs`** (number):
  - **说明：** 搜索 memory 时要查找的最大目录数。
  - **默认值：** `200`

- **`context.includeDirectories`** (array):
  - **说明：** 在 workspace context 中包含的额外目录。缺失的目录将被跳过，并显示警告信息。
  - **默认值：** `[]`

- **`context.loadFromIncludeDirectories`** (boolean):
  - **说明：** 控制 `/memory refresh` 命令的行为。如果设置为 `true`，则应从所有已添加的目录中加载 `QWEN.md` 文件；如果设置为 `false`，则只应从当前目录加载 `QWEN.md`。
  - **默认值：** `false`

- **`context.fileFiltering.respectGitIgnore`** (boolean):
  - **说明：** 搜索时是否遵循 `.gitignore` 文件。
  - **默认值：** `true`

- **`context.fileFiltering.respectQwenIgnore`** (boolean):
  - **说明：** 搜索时是否遵循 `.qwenignore` 文件。
  - **默认值：** `true`

- **`context.fileFiltering.enableRecursiveFileSearch`** (boolean):
  - **说明：** 在提示词中补全 `@` 前缀时，是否启用递归搜索当前目录树下的文件名。
  - **默认值：** `true`

#### `tools`

- **`tools.sandbox`** (boolean 或 string):
  - **说明：** 沙箱执行环境（可以是布尔值或路径字符串）。
  - **默认值：** `undefined`

- **`tools.shell.enableInteractiveShell`** (boolean):

  使用 `node-pty` 提供交互式 shell 体验。如果失败则回退到 `child_process`。默认为 `false`。

- **`tools.core`** (字符串数组):
  - **说明：** 可用于限制内置工具的集合 [通过白名单方式](./enterprise.md#restricting-tool-access)。核心工具列表请参见 [Built-in Tools](../core/tools-api.md#built-in-tools)。匹配语义与 `tools.allowed` 相同。
  - **默认值：** `undefined`

- **`tools.exclude`** (字符串数组):
  - **说明：** 要从发现过程中排除的工具名称。
  - **默认值：** `undefined`

- **`tools.allowed`** (字符串数组):
  - **说明：** 绕过确认对话框的工具名称列表。这适用于你信任并经常使用的工具。例如，`["run_shell_command(git)", "run_shell_command(npm test)"]` 将跳过运行任何 `git` 和 `npm test` 命令时的确认对话框。关于前缀匹配、命令链等详细信息，请参阅 [Shell Tool command restrictions](../tools/shell.md#command-restrictions)。
  - **默认值：** `undefined`

- **`tools.approvalMode`** (string):
  - **说明：** 设置工具使用时的默认审批模式。可接受的值包括：
    - `plan`: 仅分析，不修改文件或执行命令。
    - `default`: 在编辑文件或运行 shell 命令之前需要批准。
    - `auto-edit`: 自动批准文件编辑操作。
    - `yolo`: 自动批准所有工具调用。
  - **默认值：** `default`

- **`tools.discoveryCommand`** (string):
  - **说明：** 用于工具发现的命令。
  - **默认值：** `undefined`

- **`tools.callCommand`** (string):
  - **说明：** 定义一个自定义 shell 命令，用于调用通过 `tools.discoveryCommand` 发现的特定工具。该 shell 命令必须满足以下条件：
    - 必须将函数名（完全按照 [function declaration](https://ai.google.dev/gemini-api/docs/function-calling#function-declarations) 中的形式）作为第一个命令行参数。
    - 必须从 `stdin` 读取 JSON 格式的函数参数，类似于 [`functionCall.args`](https://cloud.google.com/vertex-ai/generative-ai/docs/model-reference/inference#functioncall)。
    - 必须在 `stdout` 返回 JSON 格式的函数输出，类似于 [`functionResponse.response.content`](https://cloud.google.com/vertex-ai/generative-ai/docs/model-reference/inference#functionresponse)。
  - **默认值：** `undefined`

- **`tools.useRipgrep`** (boolean):
  - **说明：** 使用 ripgrep 进行文件内容搜索而不是备用实现。提供更快的搜索性能。
  - **默认值：** `true`

- **`tools.useBuiltinRipgrep`** (boolean):
  - **说明：** 使用捆绑的 ripgrep 二进制文件。当设置为 `false` 时，会改用系统级的 `rg` 命令。此设置仅在 `tools.useRipgrep` 为 `true` 时生效。
  - **默认值：** `true`

- **`tools.enableToolOutputTruncation`** (boolean):
  - **说明：** 启用对大型工具输出进行截断。
  - **默认值：** `true`
  - **需重启：** 是

- **`tools.truncateToolOutputThreshold`** (number):
  - **说明：** 如果工具输出超过指定字符数，则进行截断。适用于 Shell、Grep、Glob、ReadFile 和 ReadManyFiles 工具。
  - **默认值：** `25000`
  - **需重启：** 是

- **`tools.truncateToolOutputLines`** (number):
  - **说明：** 截断工具输出时保留的最大行数或条目数量。适用于 Shell、Grep、Glob、ReadFile 和 ReadManyFiles 工具。
  - **默认值：** `1000`
  - **需重启：** 是

#### `mcp`

- **`mcp.serverCommand`** (string):
  - **描述：** 启动 MCP server 的命令。
  - **默认值：** `undefined`

- **`mcp.allowed`** (字符串数组):
  - **描述：** 允许连接的 MCP server 白名单。
  - **默认值：** `undefined`

- **`mcp.excluded`** (字符串数组):
  - **描述：** 禁止连接的 MCP server 黑名单。
  - **默认值：** `undefined`

#### `security`

- **`security.folderTrust.enabled`** (boolean):
  - **描述：** 是否启用 Folder trust 功能。
  - **默认值：** `false`

- **`security.auth.selectedType`** (string):
  - **描述：** 当前选择的认证类型。
  - **默认值：** `undefined`

- **`security.auth.enforcedType`** (string):
  - **描述：** 强制要求使用的认证类型（适用于企业环境）。
  - **默认值：** `undefined`

- **`security.auth.useExternal`** (boolean):
  - **描述：** 是否使用外部认证流程。
  - **默认值：** `undefined`

#### `advanced`

- **`advanced.autoConfigureMemory`** (boolean):
  - **说明：** 自动配置 Node.js 的内存限制。
  - **默认值：** `false`

- **`advanced.dnsResolutionOrder`** (string):
  - **说明：** DNS 解析顺序。
  - **默认值：** `undefined`

- **`advanced.excludedEnvVars`** (array of strings):
  - **说明：** 需要从项目上下文中排除的环境变量。
  - **默认值：** `["DEBUG","DEBUG_MODE"]`

- **`advanced.bugCommand`** (object):
  - **说明：** bug 报告命令的配置。
  - **默认值：** `undefined`

- **`advanced.tavilyApiKey`** (string):
  - **说明：** Tavily 网络搜索服务的 API key。用于启用 `web_search` 工具功能。
  - **注意：** 这是旧版配置格式。对于使用 Qwen OAuth 的用户，DashScope provider 会自动可用，无需任何配置。对于其他认证类型，请使用新的 `webSearch` 配置格式来配置 Tavily 或 Google providers。
  - **默认值：** `undefined`

#### `mcpServers`

配置与一个或多个 Model-Context Protocol (MCP) 服务器的连接，用于发现和使用自定义工具。Qwen Code 会尝试连接到每个已配置的 MCP 服务器以发现可用工具。如果有多个 MCP 服务器暴露了同名工具，则工具名称会被加上你在配置中定义的服务器别名前缀（例如：`serverAlias__actualToolName`）以避免冲突。注意，系统可能会为了兼容性而从 MCP 工具定义中移除某些 schema 属性。必须至少提供 `command`、`url` 或 `httpUrl` 中的一项。如果指定了多个选项，则优先级顺序为 `httpUrl` > `url` > `command`。

- **`mcpServers.<SERVER_NAME>`** (object)：指定名称的服务器参数。
  - `command` (string, 可选)：通过标准 I/O 启动 MCP 服务器要执行的命令。
  - `args` (字符串数组, 可选)：传递给该命令的参数列表。
  - `env` (object, 可选)：为服务器进程设置的环境变量。
  - `cwd` (string, 可选)：启动服务器时的工作目录。
  - `url` (string, 可选)：使用 Server-Sent Events (SSE) 进行通信的 MCP 服务器 URL。
  - `httpUrl` (string, 可选)：使用可流式 HTTP 进行通信的 MCP 服务器 URL。
  - `headers` (object, 可选)：发送至 `url` 或 `httpUrl` 的请求头键值对映射。
  - `timeout` (number, 可选)：针对此 MCP 服务器请求的超时时间（毫秒）。
  - `trust` (boolean, 可选)：信任该服务器并跳过所有工具调用确认步骤。
  - `description` (string, 可选)：对该服务器的简短描述，可用于展示目的。
  - `includeTools` (字符串数组, 可选)：从此 MCP 服务器包含的工具名称列表。当指定此项后，仅列出的工具将可用（白名单行为）。若未指定，默认启用服务器提供的所有工具。
  - `excludeTools` (字符串数组, 可选)：从此 MCP 服务器排除的工具名称列表。即使服务器提供了这些工具，模型也无法访问它们。**注意：** `excludeTools` 的优先级高于 `includeTools` —— 如果某个工具同时出现在两个列表中，它将被排除。

#### `telemetry`

配置 Qwen Code 的日志记录和指标收集。更多信息请参见 [Telemetry](../telemetry.md)。

- **属性：**
  - **`enabled`** (boolean)：是否启用遥测功能。
  - **`target`** (string)：遥测数据的发送目标。支持的值为 `local` 和 `gcp`。
  - **`otlpEndpoint`** (string)：OTLP Exporter 的 endpoint。
  - **`otlpProtocol`** (string)：OTLP Exporter 使用的协议（`grpc` 或 `http`）。
  - **`logPrompts`** (boolean)：是否在日志中包含用户 prompt 的内容。
  - **`outfile`** (string)：当 `target` 设置为 `local` 时，用于写入遥测数据的文件路径。
  - **`useCollector`** (boolean)：是否使用外部的 OTLP collector。

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
    "enableOpenAILogging": false,
    "openAILoggingDir": "~/qwen-logs",
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

## Shell 历史记录

CLI 会保存你运行的 shell 命令历史。为了避免不同项目之间的冲突，这些历史记录存储在用户主目录下的项目特定目录中。

- **位置：** `~/.qwen/tmp/<project_hash>/shell_history`
  - `<project_hash>` 是根据你的项目根路径生成的唯一标识符。
  - 历史记录存储在一个名为 `shell_history` 的文件中。

## 环境变量与 `.env` 文件

环境变量是配置应用的常见方式，尤其适用于敏感信息（如 API 密钥）或在不同环境中可能变化的设置。关于认证配置，请参考 [认证文档](./authentication.md)，其中涵盖了所有可用的认证方法。

CLI 会自动从 `.env` 文件中加载环境变量。加载顺序如下：

1. 当前工作目录中的 `.env` 文件。
2. 如果未找到，则向上级父目录逐层查找，直到找到 `.env` 文件，或者到达项目根目录（以 `.git` 文件夹为标识）或用户主目录为止。
3. 若仍未找到，则尝试读取 `~/.env`（即用户主目录下的 `.env` 文件）。

**排除特定环境变量：** 某些环境变量（例如 `DEBUG` 和 `DEBUG_MODE`）默认会被自动排除在项目的 `.env` 文件之外，以防干扰 CLI 的行为。而来自 `.qwen/.env` 文件的变量则永远不会被排除。你可以通过修改 `settings.json` 中的 `advanced.excludedEnvVars` 设置来自定义这一行为。

- **`OPENAI_API_KEY`**：
  - 多种可选 [认证方法](./authentication.md) 之一。
  - 可在 shell 配置文件（如 `~/.bashrc`、`~/.zshrc`）或 `.env` 文件中进行设置。
- **`OPENAI_BASE_URL`**：
  - 多种可选 [认证方法](./authentication.md) 之一。
  - 同样可在 shell 配置文件或 `.env` 文件中设置。
- **`OPENAI_MODEL`**：
  - 指定默认使用的 OPENAI 模型。
  - 覆盖硬编码的默认值。
  - 示例：`export OPENAI_MODEL="qwen3-coder-plus"`
- **`GEMINI_TELEMETRY_ENABLED`**：
  - 设为 `true` 或 `1` 表示启用遥测功能；其他任意值均视为禁用。
  - 将覆盖 `telemetry.enabled` 设置项。
- **`GEMINI_TELEMETRY_TARGET`**：
  - 设置遥测目标（支持 `local` 或 `gcp`）。
  - 覆盖 `telemetry.target` 设置项。
- **`GEMINI_TELEMETRY_OTLP_ENDPOINT`**：
  - 设置遥测所使用的 OTLP endpoint。
  - 覆盖 `telemetry.otlpEndpoint` 设置项。
- **`GEMINI_TELEMETRY_OTLP_PROTOCOL`**：
  - 设置 OTLP 协议类型（支持 `grpc` 或 `http`）。
  - 覆盖 `telemetry.otlpProtocol` 设置项。
- **`GEMINI_TELEMETRY_LOG_PROMPTS`**：
  - 设为 `true` 或 `1` 来开启或关闭记录用户 prompt 日志的功能；其他任意值均视为禁用。
  - 覆盖 `telemetry.logPrompts` 设置项。
- **`GEMINI_TELEMETRY_OUTFILE`**：
  - 当遥测目标设为 `local` 时，指定写入遥测数据的日志文件路径。
  - 覆盖 `telemetry.outfile` 设置项。
- **`GEMINI_TELEMETRY_USE_COLLECTOR`**：
  - 设为 `true` 或 `1` 开启使用外部 OTLP collector；其他任意值均视为禁用。
  - 覆盖 `telemetry.useCollector` 设置项。
- **`GEMINI_SANDBOX`**：
  - 替代 `settings.json` 中的 `sandbox` 设置项。
  - 支持传入 `true`、`false`、`docker`、`podman` 或自定义命令字符串。
- **`SEATBELT_PROFILE`**（仅限 macOS 平台）：
  - 在 macOS 上切换 Seatbelt（`sandbox-exec`）策略配置。
  - `permissive-open`：（默认）限制对项目目录及其他少数几个目录的写操作（详见 `packages/cli/src/utils/sandbox-macos-permissive-open.sb`），但允许其余操作。
  - `strict`：采用严格模式，默认拒绝所有操作请求。
  - `<profile_name>`：使用自定义策略。要添加自定义策略，请在项目 `.qwen/` 目录下创建名为 `sandbox-macos-<profile_name>.sb` 的文件（例如：`my-project/.qwen/sandbox-macos-custom.sb`）。
- **`DEBUG` 或 `DEBUG_MODE`**（通常由底层库或 CLI 自身使用）：
  - 设为 `true` 或 `1` 启用详细调试日志输出，有助于排查问题。
  - **注意：** 这两个变量默认会被自动排除在项目 `.env` 文件外，防止影响 CLI 正常运行。如果你需要专门为 Qwen Code 设置这些变量，请改用 `.qwen/.env` 文件。
- **`NO_COLOR`**：
  - 设置任意值即可关闭 CLI 所有彩色输出。
- **`CLI_TITLE`**：
  - 设置一个字符串来自定义 CLI 标题显示内容。
- **`TAVILY_API_KEY`**：
  - Tavily 网络搜索服务的 API Key。
  - 用于启用 `web_search` 工具功能。
  - **注意：** 对于使用 Qwen OAuth 登录的用户来说，DashScope 提供商会自动生效无需额外配置；对于其它认证方式，需手动配置 Tavily 或 Google 提供商才能启用网络搜索能力。
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
  - 使用提供的 prompt 启动一个交互式会话作为初始输入。
  - prompt 是在交互式会话中处理，而不是在其之前处理。
  - 当从 stdin 管道输入时不能使用此选项。
  - 示例：`qwen -i "explain this code"`

- **`--output-format <format>`** (**`-o <format>`**)：
  - **说明：** 指定非交互模式下 CLI 输出格式。
  - **可选值：**
    - `text`：（默认）标准的人类可读输出。
    - `json`：执行结束时输出机器可读的 JSON。
    - `stream-json`：执行过程中实时输出流式的 JSON 消息。
  - **注意：** 如需结构化输出和脚本支持，请使用 `--output-format json` 或 `--output-format stream-json` 标志。详见 [Headless Mode](../features/headless.md)。

- **`--input-format <format>`**：
  - **说明：** 指定从标准输入读取的数据格式。
  - **可选值：**
    - `text`：（默认）来自 stdin 或命令行参数的标准文本输入。
    - `stream-json`：通过 stdin 的双向通信 JSON 协议消息。
  - **要求：** 使用 `--input-format stream-json` 必须同时设置 `--output-format stream-json`。
  - **注意：** 使用 `stream-json` 时，stdin 被保留用于协议消息。详见 [Headless Mode](../features/headless.md)。

- **`--include-partial-messages`**：
  - **说明：** 在使用 `stream-json` 输出格式时包含部分助手消息。启用后，在流式传输期间发生事件时立即发出流事件（如 message_start、content_block_delta 等）。
  - **默认值：** `false`
  - **要求：** 需要设置 `--output-format stream-json`。
  - **注意：** 关于流事件的详细信息请参见 [Headless Mode](../features/headless.md)。

- **`--sandbox`** (**`-s`**)：
  - 为当前会话启用沙箱模式。

- **`--sandbox-image`**：
  - 设置沙箱镜像 URI。

- **`--debug`** (**`-d`**)：
  - 为当前会话启用调试模式，提供更详细的输出。

- **`--all-files`** (**`-a`**)：
  - 如果设置了此项，则递归地将当前目录中的所有文件作为上下文加入到 prompt 中。

- **`--help`** （或 **`-h`**）：
  - 显示有关命令行参数的帮助信息。

- **`--show-memory-usage`**：
  - 显示当前内存使用情况。

- **`--yolo`**：
  - 启用 YOLO 模式，自动批准所有的工具调用。

- **`--approval-mode <mode>`**：
  - 设置工具调用的审批模式。支持以下几种模式：
    - `plan`：仅分析，不修改文件也不执行命令。
    - `default`：对文件编辑或 shell 命令需要手动确认（默认行为）。
    - `auto-edit`：自动批准编辑类工具（edit、write_file），其他仍需提示用户确认。
    - `yolo`：自动批准所有工具调用（等同于 `--yolo`）。
  - 不可与 `--yolo` 共同使用。建议统一采用新方式 `--approval-mode=yolo` 替代旧的 `--yolo`。
  - 示例：`qwen --approval-mode auto-edit`

- **`--allowed-tools <tool1,tool2,...>`**：
  - 工具名称列表（逗号分隔），这些工具将跳过确认对话框。
  - 示例：`qwen --allowed-tools "Shell(git status)"`

- **`--telemetry`**：
  - 启用 [遥测功能](../telemetry.md)。

- **`--telemetry-target`**：
  - 设置遥测目标。更多信息请查看 [遥测文档](../telemetry.md)。

- **`--telemetry-otlp-endpoint`**：
  - 设置遥测使用的 OTLP 终端地址。更多信息请查看 [遥测文档](../telemetry.md)。

- **`--telemetry-otlp-protocol`**：
  - 设置遥测使用的 OTLP 协议（`grpc` 或 `http`）。默认是 `grpc`。更多信息请查看 [遥测文档](../telemetry.md)。

- **`--telemetry-log-prompts`**：
  - 启用遥测记录 prompts 功能。更多信息请查看 [遥测文档](../telemetry.md)。

- **`--checkpointing`**：
  - 启用 [检查点机制](../checkpointing.md)。

- **`--extensions <extension_name ...>`** (**`-e <extension_name ...>`**)：
  - 指定本次会话要加载的一组扩展插件。如果未指定，默认加载全部可用扩展。
  - 可使用特殊关键字 `qwen -e none` 来禁用所有扩展。
  - 示例：`qwen -e my-extension -e my-other-extension`

- **`--list-extensions`** (**`-l`**)：
  - 列出所有可用扩展并退出程序。

- **`--proxy`**：
  - 设置 CLI 所使用的代理服务器。
  - 示例：`--proxy http://localhost:7890`

- **`--include-directories <dir1,dir2,...>`**：
  - 将额外目录添加进工作区以实现多目录支持。
  - 支持多次指定或者以逗号分隔的形式一次性指定多个路径。
  - 最多允许添加 5 个目录。
  - 示例：`--include-directories /path/to/project1,/path/to/project2` 或者 `--include-directories /path/to/project1 --include-directories /path/to/project2`

- **`--screen-reader`**：
  - 启用屏幕阅读器模式，优化 TUI 以便更好地兼容屏幕阅读设备。

- **`--version`**：
  - 显示 CLI 版本号。

- **`--openai-logging`**：
  - 开启 OpenAI API 请求日志记录，便于调试和分析。此标志优先级高于 settings.json 中的 `enableOpenAILogging` 设置项。

- **`--openai-logging-dir <directory>`**：
  - 自定义 OpenAI API 日志存储路径。此标志优先级高于 settings.json 中的 `openAILoggingDir` 设置项。支持绝对路径、相对路径以及 `~` 展开形式。
  - **示例：** `qwen --openai-logging-dir "~/qwen-logs" --openai-logging`

- **`--tavily-api-key <api_key>`**：
  - 为此会话设置 Tavily API 密钥，用于网页搜索功能。
  - 示例：`qwen --tavily-api-key tvly-your-api-key-here`

## Context Files（分层指令上下文）

虽然 Context Files 并不是严格意义上的 CLI 行为配置，但它们对于配置“指令上下文”（也称为 “memory”）至关重要。这些文件默认为 `QWEN.md`，但可通过 `context.fileName` 设置进行自定义。这一强大的功能允许你向 AI 提供项目特定的指令、编码风格指南或任何相关的背景信息，从而使它的响应更贴合你的需求。CLI 包含一些 UI 元素，例如底部显示已加载 Context Files 数量的指示器，以便让你随时了解当前激活的上下文状态。

- **用途：** 这些 Markdown 文件包含你希望 Qwen 模型在交互过程中了解的指令、指南或上下文信息。系统设计支持对这类指令上下文进行分层管理。

### 示例上下文文件内容（例如：`QWEN.md`）

以下是一个位于 TypeScript 项目根目录的上下文文件的概念示例：

```markdown

# Project: My Awesome TypeScript Library

## General Instructions:

- 当生成新的 TypeScript 代码时，请遵循现有的编码风格。
- 确保所有新增的函数和类都包含 JSDoc 注释。
- 在适当的情况下优先使用函数式编程范式。
- 所有代码应兼容 TypeScript 5.0 和 Node.js 20+。

## Coding Style:

- 使用 2 个空格进行缩进。
- 接口名称应以 `I` 为前缀（例如：`IUserService`）。
- 类的私有成员应以下划线（`_`）为前缀。
- 始终使用严格相等（`===` 和 `!==`）。

## Specific Component: `src/api/client.ts`

- 此文件处理所有对外的 API 请求。
- 添加新 API 调用函数时，确保包含完善的错误处理和日志记录。
- 对于所有的 GET 请求，请使用现有的 `fetchWithRetry` 工具函数。
```

```markdown
## 关于依赖项：

- 除非绝对必要，否则应避免引入新的外部依赖。
- 如果确实需要新依赖，请说明原因。

```

这个示例展示了如何提供通用的项目背景、具体的编码规范，甚至针对特定文件或组件的注意事项。你提供的上下文信息越相关且精确，AI 就能更好地协助你。我们强烈建议为每个项目创建特定的上下文文件，以建立一致的约定和共享背景。

- **分层加载与优先级：** CLI 实现了一个复杂的分层内存系统，它会从多个位置加载上下文文件（例如 `QWEN.md`）。列表中靠后的位置（更具体）的内容通常会覆盖或补充靠前位置（更通用）的内容。你可以使用 `/memory show` 命令查看实际的拼接顺序以及最终使用的上下文内容。典型的加载顺序如下：
  1.  **全局上下文文件：**
      - 路径：`~/.qwen/<configured-context-filename>` （例如在用户主目录下的 `~/.qwen/QWEN.md`）。
      - 作用范围：为所有项目提供默认指令。
  2.  **项目根目录及祖先目录中的上下文文件：**
      - 路径：CLI 会在当前工作目录及其上级目录中查找已配置的上下文文件，直到遇到项目的根目录（由 `.git` 文件夹标识）或者用户的家目录为止。
      - 作用范围：提供适用于整个项目或其重要部分的相关上下文。
  3.  **子目录中的上下文文件（局部/情境化）：**
      - 路径：CLI 还会在当前工作目录之下的子目录中搜索已配置的上下文文件（遵循如 `node_modules`、`.git` 等常见的忽略规则）。默认情况下该搜索限制最多扫描 200 个目录，但可以通过修改 `settings.json` 中的 `context.discoveryMaxDirs` 设置进行调整。
      - 作用范围：允许对某个特定组件、模块或项目的一个小节提供高度定制化的指导。
- **内容拼接与界面提示：** 所有找到的上下文文件内容会被依次拼接起来（并用分隔符标明来源路径），然后作为系统提示的一部分传给 AI。CLI 的底部状态栏会显示当前加载的上下文文件数量，让你可以快速了解当前生效的指令环境。
- **导入内容：** 你可以通过在 Markdown 文件中使用 `@path/to/file.md` 语法来将其他 Markdown 文件模块化地引入到上下文中。详情请参阅 [Memory Import Processor 文档](../core/memport.md)。
- **用于管理记忆的命令：**
  - 使用 `/memory refresh` 强制重新扫描并从所有配置的位置重新加载上下文文件。这将更新 AI 当前所依据的指令上下文。
  - 使用 `/memory show` 显示当前已加载的所有指令上下文内容，方便你确认 AI 正在使用的层级结构和具体内容。
  - 更多关于 `/memory` 命令及其子命令（`show` 和 `refresh`）的信息，请参见 [Commands 文档](./commands.md#memory)。

理解并善用这些配置层级以及上下文文件的层次特性，可以帮助你有效地管理 AI 的“记忆”，从而让 Qwen Code 的响应更加贴合你的具体需求和项目场景。
```

## 沙箱机制

Qwen Code 可以在一个沙箱环境中执行潜在的不安全操作（如 shell 命令和文件修改），以保护你的系统。

沙箱机制默认是关闭的，但你可以通过以下几种方式启用它：

- 使用 `--sandbox` 或 `-s` 参数。
- 设置 `GEMINI_SANDBOX` 环境变量。
- 当使用 `--yolo` 或 `--approval-mode=yolo` 时，沙箱机制会默认启用。

默认情况下，它会使用一个预构建的 `qwen-code-sandbox` Docker 镜像。

如果你有项目特定的沙箱需求，可以在项目的根目录下创建一个自定义的 Dockerfile，路径为 `.qwen/sandbox.Dockerfile`。这个 Dockerfile 可以基于基础沙箱镜像进行构建：

```dockerfile
FROM qwen-code-sandbox

# 在这里添加你自定义的依赖或配置

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
- **API 请求：** 我们会记录每次请求所使用的模型、请求持续时间以及是否成功。但我们不会收集 prompt 或 response 的具体内容。
- **会话信息：** 我们会收集有关 CLI 配置的信息，例如启用的工具和审批模式。

**我们不收集的数据包括：**

- **个人身份信息（PII）：** 我们不会收集任何个人信息，如您的姓名、电子邮件地址或 API key。
- **Prompt 和 Response 内容：** 我们不会记录您提交的 prompt 或模型返回的 response 内容。
- **文件内容：** 我们不会记录 CLI 读取或写入的任何文件的内容。

**如何退出数据收集：**

您可以随时通过在 `settings.json` 文件中的 `privacy` 类别下将 `usageStatisticsEnabled` 属性设置为 `false` 来选择退出使用统计信息收集：

```json
{
  "privacy": {
    "usageStatisticsEnabled": false
  }
}
```

注意：当启用使用统计时，事件会被发送到阿里云 RUM 数据收集端点。