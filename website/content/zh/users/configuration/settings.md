# Qwen Code 配置

> [!tip]
>
> **身份验证 / API 密钥：** 身份验证（Qwen OAuth 与 OpenAI 兼容的 API）以及相关的环境变量（如 `OPENAI_API_KEY`）在 **[身份验证](../users/configuration/auth)** 文档中有详细说明。

> [!note]
>
> **关于新配置格式的说明：** `settings.json` 文件的格式已更新为一种新的、更有组织的结构。旧格式将自动迁移。
> Qwen Code 提供了多种方式来配置其行为，包括环境变量、命令行参数和设置文件。本文档概述了不同的配置方法和可用的设置项。

## 配置层级

配置按以下优先级顺序应用（数字越小优先级越低，会被数字越高的覆盖）：

| 层级 | 配置来源             | 描述                                                                 |
| ---- | -------------------- | -------------------------------------------------------------------- |
| 1    | 默认值               | 应用程序内的硬编码默认值                                             |
| 2    | 系统默认配置文件     | 系统范围的默认设置，可被其他配置文件覆盖                             |
| 3    | 用户配置文件         | 当前用户的全局设置                                                   |
| 4    | 项目配置文件         | 特定于项目的设置                                                     |
| 5    | 系统配置文件         | 系统范围的设置，会覆盖所有其他配置文件                               |
| 6    | 环境变量             | 系统范围或会话特定的变量，可能从 `.env` 文件中加载                   |
| 7    | 命令行参数           | 启动 CLI 时传递的值                                                  |

## 配置文件

Qwen Code 使用 JSON 配置文件进行持久化配置。这些文件有四个位置：

| 文件类型         | 位置                                                                                                                                                                                                                                                                            | 作用域                                                                                                                                                                                                                         |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 系统默认文件     | Linux: `/etc/qwen-code/system-defaults.json`<br>Windows: `C:\ProgramData\qwen-code\system-defaults.json`<br>macOS: `/Library/Application Support/QwenCode/system-defaults.json` <br>可以使用 `QWEN_CODE_SYSTEM_DEFAULTS_PATH` 环境变量覆盖路径。 | 提供系统范围的默认设置基础层。这些设置优先级最低，预期会被用户、项目或系统覆盖设置所替代。                                                                                                                                       |
| 用户设置文件     | `~/.qwen/settings.json`（其中 `~` 是你的主目录）。                                                                                                                                                                                                                             | 应用于当前用户的所有 Qwen Code 会话。                                                                                                                                                                                           |
| 项目设置文件     | 项目根目录中的 `.qwen/settings.json`。                                                                                                                                                                                                                                          | 仅在从该特定项目运行 Qwen Code 时应用。项目设置会覆盖用户设置。                                                                                                                                                                  |
| 系统设置文件     | Linux： `/etc/qwen-code/settings.json` <br>Windows: `C:\ProgramData\qwen-code\settings.json` <br>macOS: `/Library/Application Support/QwenCode/settings.json`<br>可以使用 `QWEN_CODE_SYSTEM_SETTINGS_PATH` 环境变量覆盖路径。                    | 应用于系统上所有用户的 Qwen Code 会话。系统设置会覆盖用户和项目设置。对于企业中的系统管理员来说，这可能有助于控制用户的 Qwen Code 设置。                                                                                        |

> [!note]
>
> **关于设置中环境变量的说明：** 在你的 `settings.json` 文件中，字符串值可以通过 `$VAR_NAME` 或 `${VAR_NAME}` 语法引用环境变量。当加载设置时，这些变量将自动解析。例如，如果你有一个环境变量 `MY_API_TOKEN`，你可以在 `settings.json` 中这样使用它：`"apiKey": "$MY_API_TOKEN"`。

### 项目中的 `.qwen` 目录

除了项目设置文件外，项目的 `.qwen` 目录还可以包含其他与 Qwen Code 操作相关的项目特定文件，例如：

- [自定义沙箱配置文件](../users/features/sandbox)（例如 `.qwen/sandbox-macos-custom.sb`、`.qwen/sandbox.Dockerfile`）。

### `settings.json` 中可用的设置

设置按类别组织。所有设置都应放置在 `settings.json` 文件中对应的顶层分类对象内。

#### 通用

| 设置                              | 类型    | 描述                                   | 默认值       |
| --------------------------------- | ------- | -------------------------------------- | ------------ |
| `general.preferredEditor`         | string  | 打开文件时首选的编辑器。               | `undefined`  |
| `general.vimMode`                 | boolean | 启用 Vim 快捷键绑定。                  | `false`      |
| `general.disableAutoUpdate`       | boolean | 禁用自动更新。                         | `false`      |
| `general.disableUpdateNag`        | boolean | 禁用更新通知提示。                     | `false`      |
| `general.checkpointing.enabled`   | boolean | 启用会话检查点以支持恢复功能。         | `false`      |

#### output

| 设置            | 类型   | 描述                     | 默认值   | 可能的值           |
| --------------- | ------ | ------------------------ | -------- | ------------------ |
| `output.format` | string | CLI 输出的格式。         | `"text"` | `"text"`, `"json"` |

#### ui

| 设置                                     | 类型             | 描述                                                                                                                                                                                                                                                                                                                                                                                                                | 默认值      |
| ---------------------------------------- | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- |
| `ui.theme`                               | 字符串           | UI 的颜色主题。有关可用选项，请参见[主题](../users/configuration/themes)。                                                                                                                                                                                                                                                                                                                                             | `undefined` |
| `ui.customThemes`                        | 对象             | 自定义主题定义。                                                                                                                                                                                                                                                                                                                                                                                                    | `{}`        |
| `ui.hideWindowTitle`                     | 布尔值           | 隐藏窗口标题栏。                                                                                                                                                                                                                                                                                                                                                                                                    | `false`     |
| `ui.hideTips`                            | 布尔值           | 隐藏 UI 中的提示信息。                                                                                                                                                                                                                                                                                                                                                                                              | `false`     |
| `ui.hideBanner`                          | 布尔值           | 隐藏应用横幅。                                                                                                                                                                                                                                                                                                                                                                                                      | `false`     |
| `ui.hideFooter`                          | 布尔值           | 隐藏 UI 中的页脚。                                                                                                                                                                                                                                                                                                                                                                                                  | `false`     |
| `ui.showMemoryUsage`                     | 布尔值           | 在 UI 中显示内存使用情况信息。                                                                                                                                                                                                                                                                                                                                                                                      | `false`     |
| `ui.showLineNumbers`                     | 布尔值           | 在 CLI 输出的代码块中显示行号。                                                                                                                                                                                                                                                                                                                                                                                     | `true`      |
| `ui.showCitations`                       | 布尔值           | 在聊天中显示生成文本的引用来源。                                                                                                                                                                                                                                                                                                                                                                                    | `true`      |
| `enableWelcomeBack`                      | 布尔值           | 当返回到有对话历史的项目时，显示“欢迎回来”对话框。启用后，Qwen Code 会自动检测你是否回到一个之前已生成项目摘要（`.qwen/PROJECT_SUMMARY.md`）的项目，并显示一个对话框，允许你继续之前的对话或重新开始。此功能与 `/summary` 命令和退出确认对话框集成。                                                                                                           | `true`      |
| `ui.accessibility.disableLoadingPhrases` | 布尔值           | 禁用加载状态下的提示语，以提升无障碍体验。                                                                                                                                                                                                                                                                                                                                                                          | `false`     |
| `ui.accessibility.screenReader`          | 布尔值           | 启用屏幕阅读器模式，该模式会调整 TUI 以更好地兼容屏幕阅读器。                                                                                                                                                                                                                                                                                                                                                        | `false`     |
| `ui.customWittyPhrases`                  | 字符串数组       | 在加载状态下显示的自定义短语列表。提供后，CLI 将循环显示这些短语而不是默认内容。                                                                                                                                                                                                                                                                                                                                    | `[]`        |

#### ide

| 设置               | 类型    | 描述                                           | 默认值  |
| ------------------ | ------- | ---------------------------------------------- | ------- |
| `ide.enabled`      | boolean | 启用 IDE 集成模式。                             | `false` |
| `ide.hasSeenNudge` | boolean | 用户是否已看到 IDE 集成提示。                    | `false` |

#### privacy

| 设置                             | 类型    | 描述                           | 默认值  |
| -------------------------------- | ------- | ------------------------------ | ------- |
| `privacy.usageStatisticsEnabled` | boolean | 启用使用统计信息收集。          | `true`  |

#### model

| 设置项                                             | 类型    | 描述                                                                                                                                                                                                                                                                                                                                                                   | 默认值      |
| -------------------------------------------------- | ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- |
| `model.name`                                       | string  | 用于对话的 Qwen 模型名称。                                                                                                                                                                                                                                                                                                                                             | `undefined` |
| `model.maxSessionTurns`                            | number  | 会话中保留的最大用户/模型/工具交互轮数。-1 表示无限制。                                                                                                                                                                                                                                                                                                                 | `-1`        |
| `model.summarizeToolOutput`                        | object  | 启用或禁用工具输出的摘要功能。你可以使用 `tokenBudget` 设置来指定摘要的 token 预算。注意：目前仅支持 `run_shell_command` 工具。例如：`{"run_shell_command": {"tokenBudget": 2000}}`                                                                                                                                                                                      | `undefined` |
| `model.generationConfig`                           | object  | 传递给底层内容生成器的高级覆盖配置。支持请求控制参数如 `timeout`、`maxRetries` 和 `disableCacheControl`，以及 `samplingParams` 下的微调参数（例如 `temperature`、`top_p`、`max_tokens`）。留空以依赖提供方默认设置。                                                                                                                                                    | `undefined` |
| `model.chatCompression.contextPercentageThreshold` | number  | 设置聊天历史压缩阈值，表示为模型总 token 限制的百分比。该值介于 0 到 1 之间，适用于自动压缩和手动 `/compress` 命令。例如，值为 `0.6` 时，当聊天历史超过 token 限制的 60% 时将触发压缩。设为 `0` 可完全禁用压缩功能。                                                                                                                                                     | `0.7`       |
| `model.skipNextSpeakerCheck`                       | boolean | 跳过下一个发言者检查。                                                                                                                                                                                                                                                                                                                                                 | `false`     |
| `model.skipLoopDetection`                          | boolean | 禁用循环检测检查。循环检测可防止 AI 回复中的无限循环，但可能会产生误报并中断正常工作流。如果你频繁遇到误报导致的循环检测中断，请启用此选项。                                                                                                                                                                                                                           | `false`     |
| `model.skipStartupContext`                         | boolean | 在每次会话开始时跳过发送启动工作区上下文（环境摘要和确认信息）。如果你希望手动提供上下文或想节省启动时的 token 使用量，请启用此选项。                                                                                                                                                                                                                                   | `false`     |
| `model.enableOpenAILogging`                        | boolean | 启用 OpenAI API 调用的日志记录功能，便于调试与分析。启用后，API 请求和响应将被记录到 JSON 文件中。                                                                                                                                                                                                                                                                     | `false`     |
| `model.openAILoggingDir`                           | string  | 自定义 OpenAI API 日志目录路径。如果未指定，则默认为当前工作目录下的 `logs/openai` 目录。支持绝对路径、相对路径（相对于当前工作目录解析）以及 `~` 扩展（主目录）。                                                                                                                                                                                                   | `undefined` |

**model.generationConfig 示例：**

```
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

**model.openAILoggingDir 示例：**

- `"~/qwen-logs"` - 日志写入到 `~/qwen-logs` 目录
- `"./custom-logs"` - 日志写入到当前目录下的 `./custom-logs` 目录
- `"/tmp/openai-logs"` - 日志写入到绝对路径 `/tmp/openai-logs`

#### context

| 设置                                                  | 类型             | 描述                                                                                                                                                                                                                                                                                                                                                                               | 默认值        |
| ----------------------------------------------------- | ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------- |
| `context.fileName`                                    | 字符串或字符串数组 | 上下文文件的名称。                                                                                                                                                                                                                                                                                                                                                                 | `undefined`   |
| `context.importFormat`                                | 字符串           | 导入记忆时使用的格式。                                                                                                                                                                                                                                                                                                                                                             | `undefined`   |
| `context.discoveryMaxDirs`                            | 数字             | 搜索记忆时要查找的最大目录数。                                                                                                                                                                                                                                                                                                                                                     | `200`         |
| `context.includeDirectories`                          | 数组             | 要包含在工作区上下文中的附加目录。指定一个附加绝对路径或相对路径的数组，以包含在工作区上下文中。默认情况下，缺失的目录将被跳过并显示警告。路径可以使用 `~` 来引用用户的主目录。此设置可与 `--include-directories` 命令行标志结合使用。                                                                                                                                           | `[]`          |
| `context.loadFromIncludeDirectories`                  | 布尔值           | 控制 `/memory refresh` 命令的行为。如果设置为 `true`，应从所有添加的目录中加载 `QWEN.md` 文件。如果设置为 `false`，则只应从当前目录加载 `QWEN.md`。                                                                                                                                                                                                                         | `false`       |
| `context.fileFiltering.respectGitIgnore`              | 布尔值           | 在搜索时是否遵循 .gitignore 文件。                                                                                                                                                                                                                                                                                                                                                 | `true`        |
| `context.fileFiltering.respectQwenIgnore`             | 布尔值           | 在搜索时是否遵循 .qwenignore 文件。                                                                                                                                                                                                                                                                                                                                                | `true`        |
| `context.fileFiltering.enableRecursiveFileSearch`     | 布尔值           | 是否在提示中补全 `@` 前缀时启用递归搜索当前树下的文件名。                                                                                                                                                                                                                                                                                                                           | `true`        |
| `context.fileFiltering.disableFuzzySearch`            | 布尔值           | 当设置为 `true` 时，在搜索文件时禁用模糊搜索功能，这可以在具有大量文件的项目上提高性能。                                                                                                                                                                                                                                                                                         | `false`       |

#### 文件搜索性能问题排查

如果你在文件搜索（例如使用 `@` 补全）时遇到性能问题，特别是在包含大量文件的项目中，可以尝试以下几种方法（按推荐顺序排列）：

1. **使用 `.qwenignore`：** 在项目根目录下创建一个 `.qwenignore` 文件，用于排除那些包含大量非必要引用文件的目录（例如构建产物、日志、`node_modules`）。减少被索引的文件总数是提升性能最有效的方式。
2. **禁用模糊搜索：** 如果忽略文件仍无法满足需求，可以在 `settings.json` 文件中将 `disableFuzzySearch` 设置为 `true` 来禁用模糊搜索。这将使用一种更简单的非模糊匹配算法，可能会更快。
3. **禁用递归文件搜索：** 作为最后的手段，你可以通过将 `enableRecursiveFileSearch` 设置为 `false` 来完全禁用递归文件搜索。这是最快的选择，因为它避免了对整个项目的递归遍历。但这也意味着你在使用 `@` 补全时需要输入完整的文件路径。

#### 工具

| 设置                                 | 类型              | 描述                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | 默认值      | 备注                                                                                                                                                                                                                                                 |
| ---------------------------------- | ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tools.sandbox`                    | 布尔值或字符串    | 沙盒执行环境（可以是布尔值或路径字符串）。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | `undefined` |                                                                                                                                                                                                                                                      |
| `tools.shell.enableInteractiveShell` | 布尔值           | 使用 `node-pty` 实现交互式 shell 体验。仍然会回退到 `child_process`。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | `false`     |                                                                                                                                                                                                                                                      |
| `tools.core`                       | 字符串数组        | 可用于通过白名单限制内置工具集。你还可以为支持该功能的工具指定命令级限制，例如 `run_shell_command` 工具。例如，`"tools.core": ["run_shell_command(ls -l)"]` 将只允许执行 `ls -l` 命令。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | `undefined` |                                                                                                                                                                                                                                                      |
| `tools.exclude`                    | 字符串数组        | 要从发现中排除的工具名称。你还可以为支持该功能的工具指定命令级限制，例如 `run_shell_command` 工具。例如，`"tools.exclude": ["run_shell_command(rm -rf)"]` 将阻止执行 `rm -rf` 命令。**安全提示：** 对于 `run_shell_command`，`tools.exclude` 中的命令级限制基于简单的字符串匹配，很容易被绕过。此功能**不是一种安全机制**，不应依赖它来安全地执行不受信任的代码。建议使用 `tools.core` 明确选择可执行的命令。                                                                                                                             | `undefined` |                                                                                                                                                                                                                                                      |
| `tools.allowed`                    | 字符串数组        | 绕过确认对话框的工具名称列表。这适用于你信任并经常使用的工具。例如，`["run_shell_command(git)", "run_shell_command(npm test)"]` 将跳过运行任何 `git` 和 `npm test` 命令的确认对话框。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | `undefined` |                                                                                                                                                                                                                                                      |
| `tools.approvalMode`               | 字符串            | 设置工具使用的默认审批模式。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | `default`   | 可能的值：`plan`（仅分析，不修改文件或执行命令），`default`（在编辑文件或运行 shell 命令前需要批准），`auto-edit`（自动批准文件编辑），`yolo`（自动批准所有工具调用） |
| `tools.discoveryCommand`           | 字符串            | 用于工具发现的命令。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | `undefined` |                                                                                                                                                                                                                                                      |
| `tools.callCommand`                | 字符串            | 定义一个自定义 shell 命令，用于调用通过 `tools.discoveryCommand` 发现的特定工具。shell 命令必须满足以下条件：必须将函数 `name`（与[函数声明](https://ai.google.dev/gemini-api/docs/function-calling#function-declarations)中的完全一致）作为第一个命令行参数；必须从 `stdin` 读取 JSON 格式的函数参数，类似于 [`functionCall.args`](https://cloud.google.com/vertex-ai/generative-ai/docs/model-reference/inference#functioncall)；必须将函数输出以 JSON 形式写入 `stdout`，类似于 [`functionResponse.response.content`](https://cloud.google.com/vertex-ai/generative-ai/docs/model-reference/inference#functionresponse)。 | `undefined` |                                                                                                                                                                                                                                                      |
| `tools.useRipgrep`                 | 布尔值            | 使用 ripgrep 进行文件内容搜索，而不是使用备用实现。提供更快的搜索性能。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | `true`      |                                                                                                                                                                                                                                                      |
| `tools.useBuiltinRipgrep`          | 布尔值            | 使用捆绑的 ripgrep 二进制文件。设置为 `false` 时，将改用系统级的 `rg` 命令。此设置仅在 `tools.useRipgrep` 为 `true` 时生效。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | `true`      |                                                                                                                                                                                                                                                      |
| `tools.enableToolOutputTruncation` | 布尔值            | 启用大工具输出的截断。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | `true`      | 需要重启：是                                                                                                                                                                                                                                         |
| `tools.truncateToolOutputThreshold`| 数字              | 如果工具输出超过此字符数，则进行截断。适用于 Shell、Grep、Glob、ReadFile 和 ReadManyFiles 工具。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | `25000`     | 需要重启：是                                                                                                                                                                                                                                         |
| `tools.truncateToolOutputLines`    | 数字              | 截断工具输出时保留的最大行数或条目数。适用于 Shell、Grep、Glob、ReadFile 和 ReadManyFiles 工具。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | `1000`      | 需要重启：是                                                                                                                                                                                                                                         |
| `tools.autoAccept`                 | 布尔值            | 控制 CLI 是否自动接受并执行被认为是安全的工具调用（例如，只读操作），而无需用户明确确认。如果设置为 `true`，CLI 将跳过被认为安全的工具的确认提示。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | `false`     |                                                                                                                                                                                                                                                      |

#### mcp

| 设置                | 类型             | 描述                                                                                                                                                                                                                                                                           | 默认值      |
| ------------------- | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------- |
| `mcp.serverCommand` | 字符串           | 启动 MCP 服务器的命令。                                                                                                                                                                                                                                                        | `undefined` |
| `mcp.allowed`       | 字符串数组       | 允许的 MCP 服务器白名单。允许你指定一个应向模型开放的 MCP 服务器名称列表。可用于限制可连接的 MCP 服务器集合。注意，如果设置了 `--allowed-mcp-server-names`，此设置将被忽略。                                                                                                     | `undefined` |
| `mcp.excluded`      | 字符串数组       | 要排除的 MCP 服务器黑名单。若某个服务器同时出现在 `mcp.excluded` 和 `mcp.allowed` 中，则会被排除。注意，如果设置了 `--allowed-mcp-server-names`，此设置将被忽略。                                                                                                             | `undefined` |

> [!note]
>
> **MCP 服务器安全说明：** 这些设置使用简单的字符串匹配来识别 MCP 服务器名称，而这些名称可能被修改。如果你是希望防止用户绕过该限制的系统管理员，请考虑在系统设置层面配置 `mcpServers`，以使用户无法自行配置任何 MCP 服务器。这不应被视为绝对的安全机制。

#### 安全

| 设置项                         | 类型    | 描述                                           | 默认值      |
| ------------------------------ | ------- | ---------------------------------------------- | ----------- |
| `security.folderTrust.enabled` | boolean | 用于跟踪是否启用了文件夹信任功能的设置。         | `false`     |
| `security.auth.selectedType`   | string  | 当前选择的身份验证类型。                       | `undefined` |
| `security.auth.enforcedType`   | string  | 必须使用的身份验证类型（对企业用户很有用）。     | `undefined` |
| `security.auth.useExternal`    | boolean | 是否使用外部身份验证流程。                     | `undefined` |

#### 高级

| 设置                           | 类型             | 描述                                                                                                                                                                                                                                                                                                                        | 默认值                   |
| ------------------------------ | ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------ |
| `advanced.autoConfigureMemory` | boolean          | 自动配置 Node.js 内存限制。                                                                                                                                                                                                                                                                                                     | `false`                  |
| `advanced.dnsResolutionOrder`  | string           | DNS 解析顺序。                                                                                                                                                                                                                                                                                                                  | `undefined`              |
| `advanced.excludedEnvVars`     | array of strings | 要从项目上下文中排除的环境变量。指定应从项目 `.env` 文件中排除加载的环境变量。这可以防止特定于项目的环境变量（如 `DEBUG=true`）干扰 CLI 行为。来自 `.qwen/.env` 文件的变量永远不会被排除。                                                                                                                                    | `["DEBUG","DEBUG_MODE"]` |
| `advanced.bugCommand`          | object           | 错误报告命令的配置。覆盖 `/bug` 命令的默认 URL。属性：`urlTemplate`（字符串）：可包含 `{title}` 和 `{info}` 占位符的 URL。示例：`"bugCommand": { "urlTemplate": "https://bug.example.com/new?title={title}&info={info}" }`                                                                                                   | `undefined`              |
| `advanced.tavilyApiKey`        | string           | Tavily 网络搜索服务的 API 密钥。用于启用 `web_search` 工具功能。                                                                                                                                                                                                                                                                | `undefined`              |

> [!note]
>
> **关于 advanced.tavilyApiKey 的说明：** 这是一种旧版配置格式。对于使用 Qwen OAuth 的用户，DashScope 提供程序会自动可用，无需任何配置。对于其他身份验证类型，请使用新的 `webSearch` 配置格式来配置 Tavily 或 Google 提供程序。

#### mcpServers

配置与一个或多个模型上下文协议（MCP）服务器的连接，用于发现和使用自定义工具。Qwen Code 会尝试连接到每个已配置的 MCP 服务器以发现可用工具。如果多个 MCP 服务器提供了同名工具，则工具名称将加上你在配置中定义的服务器别名前缀（例如：`serverAlias__actualToolName`），以避免冲突。请注意，系统可能会为了兼容性而去除某些 MCP 工具定义中的模式属性。必须至少提供 `command`、`url` 或 `httpUrl` 中的一项。如果有多个被指定，则优先顺序为 `httpUrl` > `url` > `command`。

| 属性                                     | 类型             | 描述                                                                                                                                                                                                                                                               | 可选 |
| ---------------------------------------- | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---- |
| `mcpServers.<SERVER_NAME>.command`       | 字符串           | 启动 MCP 服务器的标准输入输出命令。                                                                                                                                                                                                                                | 是   |
| `mcpServers.<SERVER_NAME>.args`          | 字符串数组       | 要传递给该命令的参数列表。                                                                                                                                                                                                                                         | 是   |
| `mcpServers.<SERVER_NAME>.env`           | 对象             | 设置服务器进程所需的环境变量。                                                                                                                                                                                                                                     | 是   |
| `mcpServers.<SERVER_NAME>.cwd`           | 字符串           | 启动服务器的工作目录路径。                                                                                                                                                                                                                                         | 是   |
| `mcpServers.<SERVER_NAME>.url`           | 字符串           | 使用服务器发送事件（SSE）进行通信的 MCP 服务器 URL。                                                                                                                                                                                                              | 是   |
| `mcpServers.<SERVER_NAME>.httpUrl`       | 字符串           | 使用可流式 HTTP 进行通信的 MCP 服务器 URL。                                                                                                                                                                                                                        | 是   |
| `mcpServers.<SERVER_NAME>.headers`       | 对象             | 发送到 `url` 或 `httpUrl` 的请求所附带的 HTTP 头部映射表。                                                                                                                                                                                                        | 是   |
| `mcpServers.<SERVER_NAME>.timeout`       | 数字             | 请求此 MCP 服务器时的超时时间（毫秒）。                                                                                                                                                                                                                            | 是   |
| `mcpServers.<SERVER_NAME>.trust`         | 布尔值           | 是否信任该服务器并跳过所有工具调用确认步骤。                                                                                                                                                                                                                       | 是   |
| `mcpServers.<SERVER_NAME>.description`   | 字符串           | 关于该服务器的简要描述信息，可能用于展示目的。                                                                                                                                                                                                                     | 是   |
| `mcpServers.<SERVER_NAME>.includeTools`  | 字符串数组       | 指定从该 MCP 服务器包含的工具名称列表。当指定了此项后，仅列出的这些工具会被启用（白名单行为）。若未指定，默认情况下将启用来自该服务器的所有工具。                                                                                                               | 是   |
| `mcpServers.<SERVER_NAME>.excludeTools`  | 字符串数组       | 指定从该 MCP 服务器排除的工具名称列表。即使服务器暴露了这些工具，它们也不会对模型可见。**注意：** `excludeTools` 的优先级高于 `includeTools` —— 如果某个工具同时出现在两个列表中，它将被排除在外。                                                           | 是   |

#### 遥测

配置 Qwen Code 的日志记录和指标收集。更多信息，请参见[遥测](/developers/development/telemetry)。

| 设置                     | 类型    | 描述                                                                           | 默认值 |
| ------------------------ | ------- | ------------------------------------------------------------------------------ | ------ |
| `telemetry.enabled`      | boolean | 是否启用遥测功能。                                                             |        |
| `telemetry.target`       | string  | 收集的遥测数据的目标位置。支持的值为 `local` 和 `gcp`。                        |        |
| `telemetry.otlpEndpoint` | string  | OTLP 导出器的端点。                                                            |        |
| `telemetry.otlpProtocol` | string  | OTLP 导出器使用的协议（`grpc` 或 `http`）。                                    |        |
| `telemetry.logPrompts`   | boolean | 是否在日志中包含用户提示的内容。                                               |        |
| `telemetry.outfile`      | string  | 当 `target` 为 `local` 时，用于写入遥测数据的文件。                            |        |
| `telemetry.useCollector` | boolean | 是否使用外部 OTLP 收集器。                                                     |        |

### 示例 `settings.json`

以下是一个 `settings.json` 文件的示例，展示了从 v0.3.0 开始支持的嵌套结构：

```
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
      "你每天都会忘记一千件事。确保这是其中之一",
      "正在连接到 AGI"
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

CLI 会保存你运行的 Shell 命令历史。为了避免不同项目之间的冲突，这些历史记录存储在用户主目录下的项目特定目录中。

- **位置：** `~/.qwen/tmp/<project_hash>/shell_history`
  - `<project_hash>` 是根据你的项目根路径生成的唯一标识符。
  - 历史记录存储在一个名为 `shell_history` 的文件中。

## 环境变量与 `.env` 文件

环境变量是配置应用程序的常见方式，尤其适用于敏感信息（如令牌）或在不同环境之间可能发生变化的设置。

Qwen Code 可以自动从 `.env` 文件中加载环境变量。  
有关身份验证相关的变量（如 `OPENAI_*`）以及推荐的 `.qwen/.env` 方法，请参阅 **[身份验证](../users/configuration/auth)**。

> [!tip]
>
> **环境变量排除：** 默认情况下，某些环境变量（如 `DEBUG` 和 `DEBUG_MODE`）会自动从项目的 `.env` 文件中排除，以防止干扰 CLI 行为。来自 `.qwen/.env` 文件的变量永远不会被排除。你可以通过在 `settings.json` 文件中使用 `advanced.excludedEnvVars` 设置来自定义此行为。

### 环境变量表

| 变量名                           | 描述                                                                                                                                                | 备注                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GEMINI_TELEMETRY_ENABLED`       | 设置为 `true` 或 `1` 以启用遥测功能。其他任何值都将被视为禁用。                                                                                     | 覆盖 `telemetry.enabled` 配置项。                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `GEMINI_TELEMETRY_TARGET`        | 设置遥测目标（`local` 或 `gcp`）。                                                                                                                   | 覆盖 `telemetry.target` 配置项。                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `GEMINI_TELEMETRY_OTLP_ENDPOINT` | 设置遥测的 OTLP 端点。                                                                                                                              | 覆盖 `telemetry.otlpEndpoint` 配置项。                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `GEMINI_TELEMETRY_OTLP_PROTOCOL` | 设置 OTLP 协议（`grpc` 或 `http`）。                                                                                                                | 覆盖 `telemetry.otlpProtocol` 配置项。                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `GEMINI_TELEMETRY_LOG_PROMPTS`   | 设置为 `true` 或 `1` 以启用或禁用用户提示的日志记录。其他任何值都将被视为禁用。                                                                     | 覆盖 `telemetry.logPrompts` 配置项。                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `GEMINI_TELEMETRY_OUTFILE`       | 当目标为 `local` 时，设置用于写入遥测数据的文件路径。                                                                                                | 覆盖 `telemetry.outfile` 配置项。                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `GEMINI_TELEMETRY_USE_COLLECTOR` | 设置为 `true` 或 `1` 以启用或禁用使用外部 OTLP 收集器。其他任何值都将被视为禁用。                                                                   | 覆盖 `telemetry.useCollector` 配置项。                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `GEMINI_SANDBOX`                 | 替代 `settings.json` 中的 `sandbox` 配置项。                                                                                                        | 接受 `true`、`false`、`docker`、`podman` 或自定义命令字符串。                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `SEATBELT_PROFILE`               | （仅限 macOS）在 macOS 上切换 Seatbelt（`sandbox-exec`）配置文件。                                                                                  | `permissive-open`：（默认）限制对项目文件夹（及其他少数文件夹，详见 `packages/cli/src/utils/sandbox-macos-permissive-open.sb`）的写入操作，但允许其他操作。`strict`：使用严格配置文件，默认拒绝所有操作。`<profile_name>`：使用自定义配置文件。要定义自定义配置文件，请在项目的 `.qwen/` 目录下创建名为 `sandbox-macos-<profile_name>.sb` 的文件（例如：`my-project/.qwen/sandbox-macos-custom.sb`）。 |
| `DEBUG` 或 `DEBUG_MODE`          | （通常由底层库或 CLI 自身使用）设置为 `true` 或 `1` 以启用详细的调试日志，有助于排查问题。                                                          | **注意：** 默认情况下，这些变量会自动从项目 `.env` 文件中排除，以防干扰 CLI 行为。如需为 Qwen Code 特别设置这些变量，请使用 `.qwen/.env` 文件。                                                                                                                                                                                                                                                                |
| `NO_COLOR`                       | 设置任意值以禁用 CLI 中的所有颜色输出。                                                                                                               |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `CLI_TITLE`                      | 设置一个字符串来自定义 CLI 的标题。                                                                                                                   |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `CODE_ASSIST_ENDPOINT`           | 指定代码辅助服务器的端点。                                                                                                                           | 这对于开发和测试非常有用。                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `TAVILY_API_KEY`                 | 你的 Tavily 网络搜索服务的 API 密钥。                                                                                                                | 用于启用 `web_search` 工具功能。示例：`export TAVILY_API_KEY="tvly-your-api-key-here"`                                                                                                                                                                                                                                                                                                                                                                                         |

## 命令行参数

在运行 CLI 时直接传递的参数可以覆盖该特定会话的其他配置。

### 命令行参数表

| 参数                         | 别名  | 描述                                                                                                                                                                             | 可能值                             | 备注                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| ---------------------------- | ----- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--model`                    | `-m`  | 指定本次会话使用的 Qwen 模型。                                                                                                                                       | 模型名称                           | 示例：`npm start -- --model qwen3-coder-plus`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `--prompt`                   | `-p`  | 直接将提示传递给命令。这将以非交互模式调用 Qwen Code。                                                                                                                       | 提示文本                           | 对于脚本示例，请使用 `--output-format json` 标志以获取结构化输出。                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `--prompt-interactive`       | `-i`  | 使用提供的提示作为初始输入启动交互式会话。                                                                                                            | 提示文本                           | 提示将在交互式会话中处理，而不是在会话开始前处理。不能与从 stdin 管道输入一起使用。示例：`qwen -i "explain this code"`                                                                                                                                                                                                                                                                                                                                                                                                          |
| `--output-format`            | `-o`  | 指定非交互模式下 CLI 输出的格式。                                                                                                                        | `text`, `json`, `stream-json`          | `text`：（默认）标准的人类可读输出。`json`：执行结束时发出的机器可读 JSON 输出。`stream-json`：在执行过程中实时发出的流式 JSON 消息。对于结构化输出和脚本编写，请使用 `--output-format json` 或 `--output-format stream-json` 标志。详见 [Headless Mode](../users/features/headless)。                                                                                                                                                                     |
| `--input-format`             |       | 指定从标准输入中消费的数据格式。                                                                                                                                      | `text`, `stream-json`                  | `text`：（默认）来自 stdin 或命令行参数的标准文本输入。`stream-json`：通过 stdin 的 JSON 消息协议用于双向通信。要求：`--input-format stream-json` 需要设置 `--output-format stream-json`。当使用 `stream-json` 时，stdin 被保留用于协议消息。详见 [Headless Mode](../users/features/headless)。                                                                                                                                                                  |
| `--include-partial-messages` |       | 在使用 `stream-json` 输出格式时包含部分助手消息。启用后，在流式传输期间实时发出流事件（如 message_start、content_block_delta 等）。 |                                        | 默认：`false`。要求：需要设置 `--output-format stream-json`。有关流事件的详细信息，请参见 [Headless Mode](../users/features/headless)。                                                                                                                                                                                                                                                                                                                                                                                        |
| `--sandbox`                  | `-s`  | 启用本次会话的沙箱模式。                                                                                                                                                  |                                        |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `--sandbox-image`            |       | 设置沙箱镜像 URI。                                                                                                                                                             |                                        |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `--debug`                    | `-d`  | 启用本次会话的调试模式，提供更详细的输出。                                                                                                                     |                                        |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `--all-files`                | `-a`  | 如果设置，则递归地将当前目录中的所有文件作为上下文包含到提示中。                                                                                          |                                        |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `--help`                     | `-h`  | 显示关于命令行参数的帮助信息。                                                                                                                                 |                                        |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `--show-memory-usage`        |       | 显示当前内存使用情况。                                                                                                                                                      |                                        |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `--yolo`                     |       | 启用 YOLO 模式，自动批准所有工具调用。                                                                                                                         |                                        |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `--approval-mode`            |       | 设置工具调用的审批模式。                                                                                                                                                  | `plan`, `default`, `auto-edit`, `yolo` | 支持的模式：`plan`：仅分析——不修改文件或执行命令。`default`：对文件编辑或 shell 命令需要审批（默认行为）。`auto-edit`：自动批准编辑工具（edit、write_file），其他工具仍需确认。`yolo`：自动批准所有工具调用（等同于 `--yolo`）。不能与 `--yolo` 同时使用。请改用 `--approval-mode=yolo` 来采用新的统一方式。示例：`qwen --approval-mode auto-edit`<br>详见 [Approval Mode](../users/features/approval-mode)。 |
| `--allowed-tools`            |       | 工具名称列表，逗号分隔，这些工具将跳过确认对话框。                                                                                                          | 工具名称                           | 示例：`qwen --allowed-tools "Shell(git status)"`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `--telemetry`                |       | 启用 [遥测](/developers/development/telemetry)。                                                                                                                                 |                                        |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `--telemetry-target`         |       | 设置遥测目标。                                                                                                                                                              |                                        | 更多信息请参见 [遥测](/developers/development/telemetry)。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `--telemetry-otlp-endpoint`  |       | 设置遥测的 OTLP 端点。                                                                                                                                                   |                                        | 更多信息请参见 [遥测](/developers/development/telemetry)。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `--telemetry-otlp-protocol`  |       | 设置遥测的 OTLP 协议（`grpc` 或 `http`）。                                                                                                                                |                                        | 默认为 `grpc`。更多信息请参见 [遥测](/developers/development/telemetry)。                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `--telemetry-log-prompts`    |       | 启用遥测的日志记录功能，记录提示内容。                                                                                                                                               |                                        | 更多信息请参见 [遥测](/developers/development/telemetry)。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `--checkpointing`            |       | 启用 [检查点](../users/features/checkpointing) 功能。                                                                                                                                 |                                        |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `--extensions`               | `-e`  | 指定本次会话使用的扩展列表。                                                                                                                                  | 扩展名称                           | 如果未指定，默认使用所有可用扩展。使用特殊术语 `qwen -e none` 可禁用所有扩展。示例：`qwen -e my-extension -e my-other-extension`                                                                                                                                                                                                                                                                                                                                                                                            |
| `--list-extensions`          | `-l`  | 列出所有可用扩展并退出。                                                                                                                                               |                                        |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `--proxy`                    |       | 设置 CLI 的代理。                                                                                                                                                             | 代理 URL                           | 示例：`--proxy http://localhost:7890`。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `--include-directories`      |       | 将额外目录添加到工作区中，支持多目录场景。                                                                                                           | 目录路径                           | 可多次指定或以逗号分隔的形式传入。最多可以添加 5 个目录。示例：`--include-directories /path/to/project1,/path/to/project2` 或 `--include-directories /path/to/project1 --include-directories /path/to/project2`                                                                                                                                                                                                                                                                                                      |
| `--screen-reader`            |       | 启用屏幕阅读器模式，调整 TUI 以便更好地兼容屏幕阅读器。                                                                                         |                                        |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `--version`                  |       | 显示 CLI 版本。                                                                                                                                                        |                                        |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `--openai-logging`           |       | 启用 OpenAI API 调用日志记录，便于调试和分析。                                                                                                                         |                                        | 此标志会覆盖 `settings.json` 中的 `enableOpenAILogging` 设置。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `--openai-logging-dir`       |       | 设置自定义的 OpenAI API 日志目录路径。                                                                                                                                       | 目录路径                           | 此标志会覆盖 `settings.json` 中的 `openAILoggingDir` 设置。支持绝对路径、相对路径以及 `~` 展开。示例：`qwen --openai-logging-dir "~/qwen-logs" --openai-logging`                                                                                                                                                                                                                                                                                                                                                              |
| `--tavily-api-key`           |       | 为此会话设置 Tavily API 密钥，用于网页搜索功能。                                                                                                                  | API 密钥                           | 示例：`qwen --tavily-api-key tvly-your-api-key-here`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |

## 上下文文件（分层指令上下文）

虽然严格来说不是 CLI 的*行为*配置，但上下文文件（默认为 `QWEN.md`，可通过 `context.fileName` 设置进行配置）对于配置*指令上下文*（也称为“记忆”）至关重要。这一强大功能允许你向 AI 提供项目特定的指令、编码风格指南或任何相关的背景信息，从而使它的响应更贴合你的需求并更加准确。CLI 包含一些 UI 元素，例如页脚中显示已加载上下文文件数量的指示器，以让你随时了解当前激活的上下文。

- **用途：** 这些 Markdown 文件包含你希望 Qwen 模型在交互过程中了解的指令、指南或上下文信息。系统被设计为以分层方式管理这些指令上下文。

### 示例上下文文件内容（例如 `QWEN.md`）

以下是一个概念性示例，展示了一个位于 TypeScript 项目根目录的上下文文件可能包含的内容：

```

# 项目：我超棒的 TypeScript 库

## 通用说明：
- 在生成新的 TypeScript 代码时，请遵循现有的编码风格。
- 确保所有新增的函数和类都具有 JSDoc 注释。
- 在适当的情况下优先使用函数式编程范式。
- 所有代码应与 TypeScript 5.0 和 Node.js 20+ 兼容。

## 编码风格：
- 使用 2 个空格进行缩进。
- 接口名称应以 `I` 为前缀（例如，`IUserService`）。
- 私有类成员应以下划线（`_`）为前缀。
- 始终使用严格相等（`===` 和 `!==`）。

## 特定组件：`src/api/client.ts`
- 此文件处理所有出站 API 请求。
- 添加新 API 调用函数时，请确保其包括健壮的错误处理和日志记录。
- 对于所有 GET 请求，请使用现有的 `fetchWithRetry` 工具函数。
```

## 关于依赖项：
- 避免引入新的外部依赖，除非绝对必要。
- 如果需要新依赖，请说明原因。
```

此示例展示了如何提供通用项目背景、特定编码规范，甚至关于特定文件或组件的说明。上下文文件越相关且精确，AI 就能更好地协助你。强烈建议使用项目特定的上下文文件来建立规范和背景。

- **分层加载与优先级：** CLI 通过从多个位置加载上下文文件（例如 `QWEN.md`）实现了一套复杂的分层内存系统。列表中较低位置的文件内容（更具体）通常会覆盖或补充较高位置的文件内容（更通用）。可以使用 `/memory show` 命令检查确切的拼接顺序和最终上下文。典型的加载顺序如下：
  1. **全局上下文文件：**
     - 位置：`~/.qwen/<configured-context-filename>`（例如用户主目录中的 `~/.qwen/QWEN.md`）。
     - 范围：为所有项目提供默认指令。
  2. **项目根目录及祖先目录上下文文件：**
     - 位置：CLI 在当前工作目录中搜索配置的上下文文件，然后逐级向上搜索每个父目录，直到项目根目录（由 `.git` 文件夹标识）或你的主目录为止。
     - 范围：提供与整个项目或其重要部分相关的上下文。
  3. **子目录上下文文件（上下文相关/本地）：**
     - 位置：CLI 还会在当前工作目录下方的子目录中扫描配置的上下文文件（遵循如 `node_modules`、`.git` 等常见忽略模式）。默认情况下，此搜索范围限制为 200 个目录，但可以通过在 `settings.json` 文件中设置 `context.discoveryMaxDirs` 来配置。
     - 范围：允许针对项目的某个特定组件、模块或子部分提供高度具体的指令。
- **拼接与界面提示：** 所有找到的上下文文件内容会被拼接在一起（带有标明来源和路径的分隔符），并作为系统提示的一部分提供给模型。CLI 底部会显示已加载的上下文文件数量，让你快速了解当前激活的指令上下文。
- **导入内容：** 你可以通过使用 `@path/to/file.md` 语法导入其他 Markdown 文件来模块化你的上下文文件。更多详情请参阅[内存导入处理器文档](../users/configuration/memory)。
- **内存管理命令：**
  - 使用 `/memory refresh` 强制重新扫描并从所有配置的位置重新加载所有上下文文件。这将更新 AI 的指令上下文。
  - 使用 `/memory show` 显示当前加载的组合指令上下文，以便验证 AI 正在使用的层级结构和内容。
  - 更多关于 `/memory` 命令及其子命令（`show` 和 `refresh`）的详细信息，请参阅[命令文档](../users/reference/cli-reference)。

通过理解并利用这些配置层级以及上下文文件的层次特性，你可以有效地管理 AI 的内存，并根据你的具体需求和项目定制 Qwen Code 的响应。

## 沙盒

Qwen Code 可以在沙盒环境中执行潜在的不安全操作（如 shell 命令和文件修改），以保护您的系统。

[Sandbox](../users/features/sandbox) 默认是禁用的，但您可以通过以下几种方式启用它：

- 使用 `--sandbox` 或 `-s` 标志。
- 设置 `GEMI_SANDBOX` 环境变量。
- 当使用 `--yolo` 或 `--approval-mode=yolo` 时，默认会启用沙盒。

默认情况下，它使用预构建的 `qwen-code-sandbox` Docker 镜像。

对于项目特定的沙盒需求，您可以在项目的根目录下创建一个自定义的 Dockerfile，路径为 `.qwen/sandbox.Dockerfile`。这个 Dockerfile 可以基于基础沙盒镜像：

```
FROM qwen-code-sandbox

# 在这里添加您的自定义依赖项或配置

# 例如：

# RUN apt-get update && apt-get install -y some-package
```

# COPY ./my-config /app/my-config
```

当 `.qwen/sandbox.Dockerfile` 存在时，你可以在运行 Qwen Code 时使用 `BUILD_SANDBOX` 环境变量来自动构建自定义沙箱镜像：

```
BUILD_SANDBOX=1 qwen -s
```

## 使用统计

为了帮助我们改进 Qwen Code，我们会收集匿名化的使用统计数据。这些数据有助于我们了解 CLI 的使用情况，识别常见问题，并优先开发新功能。

**我们会收集的内容：**

- **工具调用：** 我们会记录被调用的工具名称、执行成功或失败以及执行耗时。但我们不会收集传递给工具的参数或工具返回的任何数据。
- **API 请求：** 我们会记录每次请求所使用的模型、请求持续时间以及是否成功。但我们不会收集提示词或响应的内容。
- **会话信息：** 我们会收集有关 CLI 配置的信息，例如启用的工具和审批模式。

**我们不会收集的内容：**

- **个人身份信息（PII）：** 我们不会收集任何个人信息，例如您的姓名、电子邮件地址或 API 密钥。
- **提示词与响应内容：** 我们不会记录您提示词的内容或模型返回的响应。
- **文件内容：** 我们不会记录 CLI 读取或写入的任何文件的内容。

**如何退出：**

您可以随时通过在 `settings.json` 文件中的 `privacy` 类别下将 `usageStatisticsEnabled` 属性设置为 `false` 来选择退出使用统计信息收集：

```
{
  "privacy": {
    "usageStatisticsEnabled": false
  }
}
```

> [!note]
>
> 当启用使用统计时，事件会被发送到阿里云 RUM 收集端点。