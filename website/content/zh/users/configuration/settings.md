# Qwen Code 配置

> [!tip]
>
> **认证 / API 密钥：** 认证（Qwen OAuth 与 OpenAI 兼容的 API）以及相关的环境变量（如 `OPENAI_API_KEY`）在 **[认证](../configuration/auth)** 中有详细说明。

> [!note]
>
> **关于新配置格式的说明**：`settings.json` 文件的格式已更新为新的、更有组织的结构。旧格式将自动迁移。
> Qwen Code 提供了多种方式来配置其行为，包括环境变量、命令行参数和设置文件。本文档概述了不同的配置方法和可用设置。

## 配置层级

配置按以下优先级顺序应用（数字较小的会被数字较大的覆盖）：

| 级别 | 配置源               | 描述                                                         |
| ---- | -------------------- | ------------------------------------------------------------ |
| 1    | 默认值               | 应用程序内硬编码的默认值                                     |
| 2    | 系统默认文件         | 全局默认设置，可被其他设置文件覆盖                           |
| 3    | 用户设置文件         | 当前用户的全局设置                                           |
| 4    | 项目设置文件         | 特定项目的设置                                               |
| 5    | 系统设置文件         | 全局设置，会覆盖所有其他设置文件                             |
| 6    | 环境变量             | 全局或会话特定的变量，可能从 `.env` 文件加载                 |
| 7    | 命令行参数           | 启动 CLI 时传递的值                                          |

## 设置文件

Qwen Code 使用 JSON 设置文件进行持久化配置。这些文件有四个位置：

| 文件类型 | 位置 | 范围 |
|----------|------|------|
| 系统默认文件 | Linux: `/etc/qwen-code/system-defaults.json`<br>Windows: `C:\ProgramData\qwen-code\system-defaults.json`<br>macOS: `/Library/Application Support/QwenCode/system-defaults.json` <br>路径可以使用 `QWEN_CODE_SYSTEM_DEFAULTS_PATH` 环境变量覆盖。 | 提供系统范围的默认设置基础层。这些设置具有最低优先级，旨在被用户、项目或系统覆盖设置所覆盖。 |
| 用户设置文件 | `~/.qwen/settings.json`（其中 `~` 是你的主目录）。 | 应用于当前用户的所有 Qwen Code 会话。 |
| 项目设置文件 | 项目根目录下的 `.qwen/settings.json`。 | 仅在从该特定项目运行 Qwen Code 时生效。项目设置会覆盖用户设置。 |
| 系统设置文件 | Linux： `/etc/qwen-code/settings.json` <br>Windows: `C:\ProgramData\qwen-code\settings.json` <br>macOS: `/Library/Application Support/QwenCode/settings.json`<br>路径可以使用 `QWEN_CODE_SYSTEM_SETTINGS_PATH` 环境变量覆盖。 | 应用于系统上所有用户的全部 Qwen Code 会话。系统设置会覆盖用户和项目设置。对于企业中的系统管理员控制用户 Qwen Code 配置可能很有用。 |

> [!note]
>
> **关于设置中的环境变量：** 你 `settings.json` 文件中的字符串值可以使用 `$VAR_NAME` 或 `${VAR_NAME}` 语法引用环境变量。这些变量在加载设置时会自动解析。例如，如果你有一个环境变量 `MY_API_TOKEN`，你可以在 `settings.json` 中这样使用它：`"apiKey": "$MY_API_TOKEN"`。

### 项目中的 `.qwen` 目录

除了项目设置文件外，项目的 `.qwen` 目录还可以包含其他与 Qwen Code 运行相关的特定文件，例如：

- [自定义沙盒配置文件](../features/sandbox)（如 `.qwen/sandbox-macos-custom.sb`、`.qwen/sandbox.Dockerfile`）。
- `.qwen/skills/` 下的 [Agent 技能](../features/skills)（实验性功能）（每个技能都是一个包含 `SKILL.md` 的目录）。

### `settings.json` 中可用的设置

设置按类别组织。所有设置都应放置在 `settings.json` 文件中对应的顶级类别对象内。

#### general

| 设置                              | 类型      | 描述                                                                                                       | 默认值        |
| --------------------------------- | --------- | ---------------------------------------------------------------------------------------------------------- | ------------- |
| `general.preferredEditor`         | string    | 打开文件时首选的编辑器。                                                                                   | `undefined`   |
| `general.vimMode`                 | boolean   | 启用 Vim 键位绑定。                                                                                        | `false`       |
| `general.disableAutoUpdate`       | boolean   | 禁用自动更新。                                                                                             | `false`       |
| `general.disableUpdateNag`        | boolean   | 禁用更新通知提示。                                                                                         | `false`       |
| `general.gitCoAuthor`             | boolean   | 当通过 Qwen Code 提交代码时，自动在 Git 提交信息中添加 Co-authored-by 标记。                            | `true`        |
| `general.checkpointing.enabled`   | boolean   | 启用会话检查点以用于恢复。                                                                                 | `false`       |

#### 输出

| 设置            | 类型   | 描述               | 默认值   | 可能的值           |
| --------------- | ------ | ------------------ | -------- | ------------------ |
| `output.format` | string | CLI 输出的格式。   | `"text"` | `"text"`, `"json"` |

#### ui

| 设置                                     | 类型             | 描述                                                                                                                                                                                                                                                                                                                                                                                                              | 默认值      |
| ---------------------------------------- | ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- |
| `ui.theme`                               | string           | UI 的颜色主题。可用选项请参见[主题](../configuration/themes)。                                                                                                                                                                                                                                                                                                                                                     | `undefined` |
| `ui.customThemes`                        | object           | 自定义主题定义。                                                                                                                                                                                                                                                                                                                                                                                                  | `{}`        |
| `ui.hideWindowTitle`                     | boolean          | 隐藏窗口标题栏。                                                                                                                                                                                                                                                                                                                                                                                                  | `false`     |
| `ui.hideTips`                            | boolean          | 隐藏 UI 中的有用提示。                                                                                                                                                                                                                                                                                                                                                                                            | `false`     |
| `ui.hideBanner`                          | boolean          | 隐藏应用横幅。                                                                                                                                                                                                                                                                                                                                                                                                    | `false`     |
| `ui.hideFooter`                          | boolean          | 从 UI 中隐藏页脚。                                                                                                                                                                                                                                                                                                                                                                                                | `false`     |
| `ui.showMemoryUsage`                     | boolean          | 在 UI 中显示内存使用信息。                                                                                                                                                                                                                                                                                                                                                                                        | `false`     |
| `ui.showLineNumbers`                     | boolean          | 在 CLI 输出的代码块中显示行号。                                                                                                                                                                                                                                                                                                                                                                                   | `true`      |
| `ui.showCitations`                       | boolean          | 在聊天中显示生成文本的引用。                                                                                                                                                                                                                                                                                                                                                                                      | `true`      |
| `enableWelcomeBack`                      | boolean          | 当返回到有对话历史的项目时显示欢迎回来对话框。启用后，Qwen Code 将自动检测您是否返回到包含先前生成的项目摘要 (`.qwen/PROJECT_SUMMARY.md`) 的项目，并显示一个对话框，允许您继续之前的对话或重新开始。此功能与 `/summary` 命令和退出确认对话框集成。                                    | `true`      |
| `ui.accessibility.disableLoadingPhrases` | boolean          | 为无障碍功能禁用加载短语。                                                                                                                                                                                                                                                                                                                                                                                        | `false`     |
| `ui.accessibility.screenReader`          | boolean          | 启用屏幕阅读器模式，这会调整 TUI 以更好地兼容屏幕阅读器。                                                                                                                                                                                                                                                                                                                                                         | `false`     |
| `ui.customWittyPhrases`                  | array of strings | 在加载状态下显示的自定义短语列表。提供时，CLI 将循环显示这些短语而不是默认短语。                                                                                                                                                                                                                                                                                                                                  | `[]`        |

#### ide

| 设置                 | 类型    | 描述                             | 默认值  |
| ------------------ | ------- | ------------------------------ | ----- |
| `ide.enabled`      | boolean | 启用 IDE 集成模式。                  | `false` |
| `ide.hasSeenNudge` | boolean | 用户是否已看到 IDE 集成提示。          | `false` |

#### privacy

| 设置                           | 类型    | 描述              | 默认值 |
| ---------------------------- | ------- | --------------- | ---- |
| `privacy.usageStatisticsEnabled` | boolean | 启用使用情况统计信息收集。 | `true` |

#### model

| 设置                                             | 类型    | 描述                                                                                                                                                                                                                                                                                                                                                                   | 默认值      |
| ------------------------------------------------ | ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- |
| `model.name`                                       | string  | 用于对话的 Qwen 模型。                                                                                                                                                                                                                                                                                                                                                 | `undefined` |
| `model.maxSessionTurns`                            | number  | 会话中保留的最大用户/模型/工具轮次数。-1 表示无限制。                                                                                                                                                                                                                                                                                                                    | `-1`        |
| `model.summarizeToolOutput`                        | object  | 启用或禁用工具输出的摘要功能。你可以使用 `tokenBudget` 设置指定摘要的 token 预算。注意：目前仅支持 `run_shell_command` 工具。例如 `{"run_shell_command": {"tokenBudget": 2000}}`                                                                                                                              | `undefined` |
| `model.generationConfig`                           | object  | 传递给底层内容生成器的高级覆盖选项。支持请求控制，如 `timeout`、`maxRetries`、`disableCacheControl` 和 `customHeaders`（API 请求的自定义 HTTP 头），以及 `samplingParams` 下的微调参数（例如 `temperature`、`top_p`、`max_tokens`）。留空则依赖提供者的默认设置。                                                 | `undefined` |
| `model.chatCompression.contextPercentageThreshold` | number  | 将聊天历史压缩阈值设置为模型总 token 限制的百分比。这是一个介于 0 到 1 之间的值，适用于自动压缩和手动 `/compress` 命令。例如，值为 `0.6` 时，当聊天历史超过 token 限制的 60% 时将触发压缩。使用 `0` 可完全禁用压缩。                                                                                             | `0.7`       |
| `model.skipNextSpeakerCheck`                       | boolean | 跳过下一位发言者检查。                                                                                                                                                                                                                                                                                                                                                 | `false`     |
| `model.skipLoopDetection`                          | boolean | 禁用循环检测检查。循环检测可防止 AI 回复中的无限循环，但可能产生误报并中断正常工作流。如果你经常遇到误报的循环检测中断，请启用此选项。                                                                                                                                                                                                                                 | `false`     |
| `model.skipStartupContext`                         | boolean | 跳过在每个会话开始时发送启动工作区上下文（环境摘要和确认信息）。如果你更喜欢手动提供上下文或希望节省启动时的 token，请启用此选项。                                                                                                                                                                                                                                  | `false`     |
| `model.enableOpenAILogging`                        | boolean | 启用 OpenAI API 调用的日志记录以进行调试和分析。启用后，API 请求和响应将记录到 JSON 文件中。                                                                                                                                                                                                                                                                          | `false`     |
| `model.openAILoggingDir`                           | string  | OpenAI API 日志的自定义目录路径。如果未指定，则默认为当前工作目录下的 `logs/openai`。支持绝对路径、相对路径（从当前工作目录解析）和 `~` 展开（主目录）。                                                                                                                                                                                                             | `undefined` |

**model.generationConfig 示例：**

```json
{
  "model": {
    "generationConfig": {
      "timeout": 60000,
      "disableCacheControl": false,
      "customHeaders": {
        "X-Request-ID": "req-123",
        "X-User-ID": "user-456"
      },
      "samplingParams": {
        "temperature": 0.2,
        "top_p": 0.8,
        "max_tokens": 1024
      }
    }
  }
}
```

`customHeaders` 字段允许你向所有 API 请求添加自定义 HTTP 头。这对于请求追踪、监控、API 网关路由或不同模型需要不同头信息时很有用。如果在 `modelProviders[].generationConfig.customHeaders` 中定义了 `customHeaders`，将直接使用；否则，将使用 `model.generationConfig.customHeaders` 中的头信息。两个层级之间不会发生合并。

**model.openAILoggingDir 示例：**

- `"~/qwen-logs"` - 记录到 `~/qwen-logs` 目录
- `"./custom-logs"` - 记录到相对于当前目录的 `./custom-logs`
- `"/tmp/openai-logs"` - 记录到绝对路径 `/tmp/openai-logs`

#### modelProviders

使用 `modelProviders` 为每种认证类型声明精选的模型列表，以便 `/model` 选择器可以在它们之间切换。键必须是有效的认证类型（如 `openai`、`anthropic`、`gemini`、`vertex-ai` 等）。每个条目都需要一个 `id` 并且**必须包含 `envKey`**，还可以选择性地包括 `name`、`description`、`baseUrl` 和 `generationConfig`。凭证永远不会保存在设置中；运行时会从 `process.env[envKey]` 中读取它们。Qwen OAuth 模型仍然是硬编码的，无法被覆盖。

##### 示例

```json
{
  "modelProviders": {
    "openai": [
      {
        "id": "gpt-4o",
        "name": "GPT-4o",
        "envKey": "OPENAI_API_KEY",
        "baseUrl": "https://api.openai.com/v1",
        "generationConfig": {
          "timeout": 60000,
          "maxRetries": 3,
          "customHeaders": {
            "X-Model-Version": "v1.0",
            "X-Request-Priority": "high"
          },
          "samplingParams": { "temperature": 0.2 }
        }
      }
    ],
    "anthropic": [
      {
        "id": "claude-3-5-sonnet",
        "envKey": "ANTHROPIC_API_KEY",
        "baseUrl": "https://api.anthropic.com/v1"
      }
    ],
    "gemini": [
      {
        "id": "gemini-2.0-flash",
        "name": "Gemini 2.0 Flash",
        "envKey": "GEMINI_API_KEY",
        "baseUrl": "https://generativelanguage.googleapis.com"
      }
    ],
    "vertex-ai": [
      {
        "id": "gemini-1.5-pro-vertex",
        "envKey": "GOOGLE_API_KEY",
        "baseUrl": "https://generativelanguage.googleapis.com"
      }
    ]
  }
}
```

> [!note]
> 只有 `/model` 命令暴露非默认的认证类型。Anthropic、Gemini、Vertex AI 等必须通过 `modelProviders` 定义。`/auth` 命令有意只列出内置的 Qwen OAuth 和 OpenAI 流程。

##### 解析层级和原子性

有效的 auth/model/credential 值按字段选择，使用以下优先级（首先出现的生效）。你可以将 `--auth-type` 与 `--model` 结合使用，直接指向提供程序条目；这些 CLI 标志在其他层级之前运行。

| 层级（最高 → 最低） | authType | model | apiKey | baseUrl | apiKeyEnvKey | proxy |
| ------------------- | -------- | ----- | ------ | ------- | ------------ | ----- |
| 编程覆盖 | `/auth ` | `/auth` 输入 | `/auth` 输入 | `/auth` 输入 | — | — |
| 模型提供程序选择 | — | `modelProvider.id` | `env[modelProvider.envKey]` | `modelProvider.baseUrl` | `modelProvider.envKey` | — |
| CLI 参数 | `--auth-type` | `--model` | `--openaiApiKey`（或提供程序特定的等价项） | `--openaiBaseUrl`（或提供程序特定的等价项） | — | — |
| 环境变量 | — | 提供程序特定映射（如 `OPENAI_MODEL`） | 提供程序特定映射（如 `OPENAI_API_KEY`） | 提供程序特定映射（如 `OPENAI_BASE_URL`） | — | — |
| 设置（`settings.json`） | `security.auth.selectedType` | `model.name` | `security.auth.apiKey` | `security.auth.baseUrl` | — | — |
| 默认值/计算值 | 回退到 `AuthType.QWEN_OAUTH` | 内置默认值（OpenAI ⇒ `qwen3-coder-plus`） | — | — | — | 配置时为 `Config.getProxy()` |

\* 当存在时，CLI 认证标志会覆盖设置。否则，`security.auth.selectedType` 或隐式默认值确定认证类型。Qwen OAuth 和 OpenAI 是唯一无需额外配置即可显示的认证类型。

模型提供程序来源的值以原子方式应用：一旦提供程序模型激活，它定义的每个字段都会受到保护，免受较低层级的影响，直到你通过 `/auth` 手动清除凭据。最终的 `generationConfig` 是跨所有层级的投影——较低层级仅填充较高级别留下的空白，而提供程序层级保持不可穿透。

`modelProviders` 的合并策略是 REPLACE：项目设置中的整个 `modelProviders` 将覆盖用户设置中的相应部分，而不是合并两者。

##### 生成配置分层

`generationConfig` 的字段优先级：

1. 编程覆盖（例如运行时的 `/model`、`/auth` 更改）
2. `modelProviders[authType][].generationConfig`
3. `settings.model.generationConfig`
4. 内容生成器默认值（OpenAI 的 `getDefaultGenerationConfig`，Gemini 的 `getParameterValue` 等）

`samplingParams` 和 `customHeaders` 都被视为原子对象；提供者值会替换整个对象。如果 `modelProviders[].generationConfig` 定义了这些字段，则直接使用它们；否则，使用来自 `model.generationConfig` 的值。提供者和全局配置级别之间不会发生合并。内容生成器的默认值最后应用，因此每个提供者都能保持其调优的基础配置。

##### 选择持久化和建议

> [!重要]
> 尽可能在用户范围的 `~/.qwen/settings.json` 中定义 `modelProviders`，避免在任何范围内持久化凭证覆盖。将提供程序目录保存在用户设置中可以防止项目范围和用户范围之间的合并/覆盖冲突，并确保 `/auth` 和 `/model` 更新始终写回到一致的范围。

- `/model` 和 `/auth` 将 `model.name`（如适用）和 `security.auth.selectedType` 持久化到最近的已定义 `modelProviders` 的可写范围；否则回退到用户范围。这使工作区/用户文件与活动的提供程序目录保持同步。
- 没有 `modelProviders` 时，解析器会混合 CLI/env/settings 层，这对于单提供程序设置来说是可以的，但在频繁切换时会很麻烦。当多模型工作流程很常见时，请定义提供程序目录，以便切换保持原子性、源归因和可调试性。

#### context

| 设置                                              | 类型                       | 描述                                                                                                                                                                                                                                                                                                                                                                | 默认值      |
| ------------------------------------------------- | -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- |
| `context.fileName`                                | 字符串或字符串数组         | 上下文文件的名称。                                                                                                                                                                                                                                                                                                                                                  | `undefined` |
| `context.importFormat`                            | 字符串                     | 导入内存时使用的格式。                                                                                                                                                                                                                                                                                                                                              | `undefined` |
| `context.discoveryMaxDirs`                        | 数字                       | 搜索内存的最大目录数。                                                                                                                                                                                                                                                                                                                                              | `200`       |
| `context.includeDirectories`                      | 数组                       | 在工作区上下文中包含的额外目录。指定要在工作区上下文中包含的额外绝对路径或相对路径数组。默认情况下，缺失的目录将被跳过并显示警告。路径可以使用 `~` 来引用用户的主目录。此设置可以与 `--include-directories` 命令行标志结合使用。                                                        | `[]`        |
| `context.loadFromIncludeDirectories`              | 布尔值                     | 控制 `/memory refresh` 命令的行为。如果设置为 `true`，应该从所有添加的目录中加载 `QWEN.md` 文件。如果设置为 `false`，则应仅从当前目录加载 `QWEN.md`。                                                                                                                                                   | `false`     |
| `context.fileFiltering.respectGitIgnore`          | 布尔值                     | 搜索时是否遵循 .gitignore 文件。                                                                                                                                                                                                                                                                                                                                      | `true`      |
| `context.fileFiltering.respectQwenIgnore`         | 布尔值                     | 搜索时是否遵循 .qwenignore 文件。                                                                                                                                                                                                                                                                                                                                     | `true`      |
| `context.fileFiltering.enableRecursiveFileSearch` | 布尔值                     | 是否在提示中完成 `@` 前缀时，在当前树下递归搜索文件名。                                                                                                                                                                                                                                                                                                             | `true`      |
| `context.fileFiltering.disableFuzzySearch`        | 布尔值                     | 当为 `true` 时，在搜索文件时禁用模糊搜索功能，这可以在具有大量文件的项目上提高性能。                                                                                                                                                                                                                                                                                | `false`     |

#### 故障排除：文件搜索性能

如果你在进行文件搜索时遇到性能问题（例如，使用 `@` 补全时），尤其是在包含大量文件的项目中，你可以按以下建议尝试解决：

1. **使用 `.qwenignore`：** 在项目根目录创建一个 `.qwenignore` 文件，以排除那些包含大量你不需要引用的文件的目录（例如，构建产物、日志、`node_modules`）。减少被爬取的文件总数是提高性能的最有效方法。
2. **禁用模糊搜索：** 如果忽略文件还不够，你可以在 `settings.json` 文件中将 `disableFuzzySearch` 设置为 `true` 来禁用模糊搜索。这将使用更简单、非模糊匹配的算法，速度可能更快。
3. **禁用递归文件搜索：** 作为最后的手段，你可以通过将 `enableRecursiveFileSearch` 设置为 `false` 来完全禁用递归文件搜索。这将是最快的选择，因为它避免了对项目的递归遍历。但是，这意味着你在使用 `@` 补全时需要输入文件的完整路径。

#### 工具

| 设置                                 | 类型              | 描述                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | 默认值      | 备注                                                                                                                                                                                                                                               |
| ------------------------------------ | ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tools.sandbox`                      | boolean 或 string | 沙箱执行环境（可以是布尔值或路径字符串）。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | `undefined` |                                                                                                                                                                                                                                                      |
| `tools.shell.enableInteractiveShell` | boolean           | 使用 `node-pty` 提供交互式 shell 体验。后备到 `child_process` 的方式仍然适用。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | `false`     |                                                                                                                                                                                                                                                      |
| `tools.core`                         | string 数组       | 可用于通过白名单限制内置工具集。您还可以为支持该功能的工具指定特定命令限制，比如 `run_shell_command` 工具。例如，`"tools.core": ["run_shell_command(ls -l)"]` 将只允许执行 `ls -l` 命令。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | `undefined` |                                                                                                                                                                                                                                                      |
| `tools.exclude`                      | string 数组       | 从发现中排除的工具名称。您还可以为支持该功能的工具指定特定命令限制，比如 `run_shell_command` 工具。例如，`"tools.exclude": ["run_shell_command(rm -rf)"]` 将阻止 `rm -rf` 命令。**安全说明：** `tools.exclude` 中针对 `run_shell_command` 的特定命令限制基于简单的字符串匹配，容易被绕过。此功能**不是安全机制**，不应依赖它来安全地执行不受信任的代码。建议使用 `tools.core` 明确选择可执行的命令。 | `undefined` |                                                                                                                                                                                                                                                      |
| `tools.allowed`                      | string 数组       | 将跳过确认对话框的工具名称列表。这对于您信任且频繁使用的工具很有用。例如，`["run_shell_command(git)", "run_shell_command(npm test)"]` 将跳过运行任何 `git` 和 `npm test` 命令的确认对话框。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | `undefined` |                                                                                                                                                                                                                                                      |
| `tools.approvalMode`                 | string            | 设置工具使用的默认审批模式。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | `default`   | 可能的值：`plan`（仅分析，不修改文件或执行命令）、`default`（在文件编辑或 shell 命令运行前需要审批）、`auto-edit`（自动批准文件编辑）、`yolo`（自动批准所有工具调用）                    |
| `tools.discoveryCommand`             | string            | 用于工具发现的命令。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | `undefined` |                                                                                                                                                                                                                                                      |
| `tools.callCommand`                  | string            | 定义用于调用使用 `tools.discoveryCommand` 发现的特定工具的自定义 shell 命令。shell 命令必须满足以下条件：必须将函数 `name`（与[函数声明](https://ai.google.dev/gemini-api/docs/function-calling#function-declarations)中的完全相同）作为第一个命令行参数。必须在 `stdin` 上以 JSON 格式读取函数参数，类似于 [`functionCall.args`](https://cloud.google.com/vertex-ai/generative-ai/docs/model-reference/inference#functioncall)。必须在 `stdout` 上以 JSON 格式返回函数输出，类似于 [`functionResponse.response.content`](https://cloud.google.com/vertex-ai/generative-ai/docs/model-reference/inference#functionresponse)。 | `undefined` |                                                                                                                                                                                                                                                      |
| `tools.useRipgrep`                   | boolean           | 使用 ripgrep 进行文件内容搜索，而不是后备实现。提供更快的搜索性能。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | `true`      |                                                                                                                                                                                                                                                      |
| `tools.useBuiltinRipgrep`            | boolean           | 使用捆绑的 ripgrep 二进制文件。当设置为 `false` 时，将改用系统级的 `rg` 命令。此设置仅在 `tools.useRipgrep` 为 `true` 时有效。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | `true`      |                                                                                                                                                                                                                                                      |
| `tools.enableToolOutputTruncation`   | boolean           | 启用大工具输出的截断。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | `true`      | 需要重启：是                                                                                                                                                                                                                                       |
| `tools.truncateToolOutputThreshold`  | number            | 如果工具输出大于此字符数，则进行截断。适用于 Shell、Grep、Glob、ReadFile 和 ReadManyFiles 工具。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | `25000`     | 需要重启：是                                                                                                                                                                                                                                       |
| `tools.truncateToolOutputLines`      | number            | 截断工具输出时保留的最大行数或条目数。适用于 Shell、Grep、Glob、ReadFile 和 ReadManyFiles 工具。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | `1000`      | 需要重启：是                                                                                                                                                                                                                                       |
| `tools.autoAccept`                   | boolean           | 控制 CLI 是否自动接受并执行被认为是安全的工具调用（例如，只读操作），而无需明确的用户确认。如果设置为 `true`，CLI 将跳过对被认为安全的工具的确认提示。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | `false`     |                                                                                                                                                                                                                                                      |

#### mcp

| 设置                  | 类型             | 描述                                                                                                                                                                                                                                                                 | 默认值      |
| ------------------- | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| `mcp.serverCommand` | 字符串           | 启动 MCP 服务器的命令。                                                                                                                                                                                                                                                | `undefined` |
| `mcp.allowed`       | 字符串数组        | 允许的 MCP 服务器白名单。允许你指定应提供给模型的一组 MCP 服务器名称。这可用于限制要连接的 MCP 服务器集合。注意，如果设置了 `--allowed-mcp-server-names`，此设置将被忽略。                                                                                                           | `undefined` |
| `mcp.excluded`      | 字符串数组        | 排除的 MCP 服务器黑名单。同时在 `mcp.excluded` 和 `mcp.allowed` 中列出的服务器将被排除。注意，如果设置了 `--allowed-mcp-server-names`，此设置将被忽略。                                                                                                                     | `undefined` |

> [!note]
>
> **MCP 服务器安全说明：** 这些设置对 MCP 服务器名称使用简单的字符串匹配，而这些名称是可以被修改的。如果你是系统管理员，希望防止用户绕过此限制，请考虑在系统设置级别配置 `mcpServers`，这样用户就无法配置自己的任何 MCP 服务器。这不应作为严密的安全机制来使用。

#### 安全性

| 设置                             | 类型    | 描述                                     | 默认值      |
| -------------------------------- | ------- | ---------------------------------------- | ----------- |
| `security.folderTrust.enabled`   | boolean | 跟踪是否启用了文件夹信任的设置。         | `false`     |
| `security.auth.selectedType`     | string  | 当前选择的身份验证类型。                 | `undefined` |
| `security.auth.enforcedType`     | string  | 所需的身份验证类型（对企业有用）。       | `undefined` |
| `security.auth.useExternal`      | boolean | 是否使用外部身份验证流程。               | `undefined` |

#### 高级

| 设置                             | 类型             | 描述                                                                                                                                                                                                                                                                                                               | 默认值                   |
| ------------------------------ | -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------- |
| `advanced.autoConfigureMemory` | boolean        | 自动配置 Node.js 内存限制。                                                                                                                                                                                                                                                                                              | `false`                |
| `advanced.dnsResolutionOrder`  | string         | DNS 解析顺序。                                                                                                                                                                                                                                                                                                        | `undefined`            |
| `advanced.excludedEnvVars`     | array of strings | 从项目上下文中排除的环境变量。指定应从项目 `.env` 文件中排除加载的环境变量。这可以防止特定于项目的环境变量（如 `DEBUG=true`）干扰 CLI 行为。来自 `.qwen/.env` 文件的变量永远不会被排除。                                                                                                                               | `["DEBUG","DEBUG_MODE"]` |
| `advanced.bugCommand`          | object         | 错误报告命令的配置。覆盖 `/bug` 命令的默认 URL。属性：`urlTemplate` (string)：可以包含 `{title}` 和 `{info}` 占位符的 URL。示例：`"bugCommand": { "urlTemplate": "https://bug.example.com/new?title={title}&info={info}" }`                                                                    | `undefined`            |
| `advanced.tavilyApiKey`        | string         | Tavily 网络搜索服务的 API 密钥。用于启用 `web_search` 工具功能。                                                                                                                                                                                                                                                            | `undefined`            |

> [!note]
>
> **关于 advanced.tavilyApiKey 的说明：** 这是一种遗留的配置格式。对于 Qwen OAuth 用户，DashScope 提供商会自动可用，无需任何配置。对于其他认证类型，请使用新的 `webSearch` 配置格式来配置 Tavily 或 Google 提供商。

#### mcpServers

配置到一个或多个模型上下文协议（MCP）服务器的连接，用于发现和使用自定义工具。Qwen Code 尝试连接到每个配置的 MCP 服务器以发现可用的工具。如果多个 MCP 服务器暴露了相同名称的工具，则工具名称将被添加你在配置中定义的服务器别名前缀（例如，`serverAlias__actualToolName`），以避免冲突。请注意，系统可能会从 MCP 工具定义中删除某些模式属性以确保兼容性。必须提供 `command`、`url` 或 `httpUrl` 中至少一项。如果指定了多个选项，优先级顺序为 `httpUrl`、`url`、然后是 `command`。

| 属性                                    | 类型             | 描述                                                                                                                                                                                                                                                               | 可选   |
| --------------------------------------- | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------ |
| `mcpServers.<SERVER_NAME>.command`      | string           | 通过标准 I/O 启动 MCP 服务器要执行的命令。                                                                                                                                                                                                                         | 是     |
| `mcpServers.<SERVER_NAME>.args`         | array of strings | 要传递给命令的参数。                                                                                                                                                                                                                                               | 是     |
| `mcpServers.<SERVER_NAME>.env`          | object           | 为服务器进程设置的环境变量。                                                                                                                                                                                                                                       | 是     |
| `mcpServers.<SERVER_NAME>.cwd`          | string           | 启动服务器的工作目录。                                                                                                                                                                                                                                             | 是     |
| `mcpServers.<SERVER_NAME>.url`          | string           | 使用服务器发送事件（SSE）进行通信的 MCP 服务器的 URL。                                                                                                                                                                                                             | 是     |
| `mcpServers.<SERVER_NAME>.httpUrl`      | string           | 使用可流式 HTTP 进行通信的 MCP 服务器的 URL。                                                                                                                                                                                                                      | 是     |
| `mcpServers.<SERVER_NAME>.headers`      | object           | 发送到 `url` 或 `httpUrl` 的请求时要发送的 HTTP 头映射。                                                                                                                                                                                                           | 是     |
| `mcpServers.<SERVER_NAME>.timeout`      | number           | 对此 MCP 服务器请求的超时时间（毫秒）。                                                                                                                                                                                                                            | 是     |
| `mcpServers.<SERVER_NAME>.trust`        | boolean          | 信任此服务器并绕过所有工具调用确认。                                                                                                                                                                                                                               | 是     |
| `mcpServers.<SERVER_NAME>.description`  | string           | 服务器的简短描述，可能用于显示目的。                                                                                                                                                                                                                               | 是     |
| `mcpServers.<SERVER_NAME>.includeTools` | array of strings | 从此 MCP 服务器包含的工具名称列表。当指定时，仅列出的工具将从此服务器可用（白名单行为）。如果未指定，默认情况下启用服务器的所有工具。                                                                                                                               | 是     |
| `mcpServers.<SERVER_NAME>.excludeTools` | array of strings | 从此 MCP 服务器排除的工具名称列表。即使服务器暴露了此处列出的工具，它们对模型也不可用。**注意：** `excludeTools` 优先于 `includeTools` — 如果某个工具同时在两个列表中，它将被排除。 | 是     |

#### telemetry

为 Qwen Code 配置日志记录和指标收集。更多信息，请参见 [telemetry](/developers/development/telemetry)。

| 设置                     | 类型    | 描述                                                                 | 默认值 |
| ------------------------ | ------- | -------------------------------------------------------------------- | ------ |
| `telemetry.enabled`      | boolean | 是否启用遥测。                                                         |        |
| `telemetry.target`       | string  | 收集的遥测数据的目标位置。支持的值为 `local` 和 `gcp`。                 |        |
| `telemetry.otlpEndpoint` | string  | OTLP 导出器的端点。                                                    |        |
| `telemetry.otlpProtocol` | string  | OTLP 导出器的协议（`grpc` 或 `http`）。                                |        |
| `telemetry.logPrompts`   | boolean | 是否在日志中包含用户提示的内容。                                        |        |
| `telemetry.outfile`      | string  | 当 `target` 为 `local` 时，写入遥测数据的文件。                         |        |
| `telemetry.useCollector` | boolean | 是否使用外部 OTLP 收集器。                                             |        |

### 示例 `settings.json`

以下是 v0.3.0 版本新增的嵌套结构 `settings.json` 文件示例：

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
      "You forget a thousand things every day. Make sure this is one of 'em",
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

CLI 会保存你运行的 shell 命令历史记录。为了避免不同项目之间的冲突，这些历史记录存储在用户主文件夹内的项目特定目录中。

- **位置：** `~/.qwen/tmp/<project_hash>/shell_history`
  - `<project_hash>` 是根据你的项目根路径生成的唯一标识符。
  - 历史记录存储在一个名为 `shell_history` 的文件中。

## 环境变量和 `.env` 文件

环境变量是配置应用程序的常用方式，特别是对于敏感信息（如令牌）或可能在不同环境之间变化的设置。

Qwen Code 可以从 `.env` 文件中自动加载环境变量。
关于认证相关变量（如 `OPENAI_*`）和推荐的 `.qwen/.env` 方法，请参见 **[认证](../configuration/auth)**。

> [!tip]
>
> **环境变量排除：** 某些环境变量（如 `DEBUG` 和 `DEBUG_MODE`）默认情况下会从项目 `.env` 文件中自动排除，以防止干扰 CLI 行为。来自 `.qwen/.env` 文件的变量永远不会被排除。你可以通过 `settings.json` 文件中的 `advanced.excludedEnvVars` 设置来自定义此行为。

### 环境变量表

| 变量                             | 描述                                                                                                                                                   | 备注                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GEMINI_TELEMETRY_ENABLED`       | 设置为 `true` 或 `1` 以启用遥测。任何其他值都将被视为禁用。                                                                                          | 覆盖 `telemetry.enabled` 设置。                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `GEMINI_TELEMETRY_TARGET`        | 设置遥测目标（`local` 或 `gcp`）。                                                                                                                     | 覆盖 `telemetry.target` 设置。                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `GEMINI_TELEMETRY_OTLP_ENDPOINT` | 设置遥测的 OTLP 端点。                                                                                                                                 | 覆盖 `telemetry.otlpEndpoint` 设置。                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `GEMINI_TELEMETRY_OTLP_PROTOCOL` | 设置 OTLP 协议（`grpc` 或 `http`）。                                                                                                                   | 覆盖 `telemetry.otlpProtocol` 设置。                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `GEMINI_TELEMETRY_LOG_PROMPTS`   | 设置为 `true` 或 `1` 以启用或禁用用户提示日志记录。任何其他值都将被视为禁用。                                                                        | 覆盖 `telemetry.logPrompts` 设置。                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `GEMINI_TELEMETRY_OUTFILE`       | 当目标为 `local` 时，设置写入遥测数据的文件路径。                                                                                                      | 覆盖 `telemetry.outfile` 设置。                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `GEMINI_TELEMETRY_USE_COLLECTOR` | 设置为 `true` 或 `1` 以启用或禁用使用外部 OTLP 收集器。任何其他值都将被视为禁用。                                                                    | 覆盖 `telemetry.useCollector` 设置。                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `GEMINI_SANDBOX`                 | `settings.json` 中 `sandbox` 设置的替代选项。                                                                                                          | 接受 `true`、`false`、`docker`、`podman` 或自定义命令字符串。                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `SEATBELT_PROFILE`               | （macOS 特有）在 macOS 上切换 Seatbelt（`sandbox-exec`）配置文件。                                                                                     | `permissive-open`：（默认）限制对项目文件夹的写入（以及其他几个文件夹，参见 `packages/cli/src/utils/sandbox-macos-permissive-open.sb`），但允许其他操作。`strict`：使用严格的配置文件，默认拒绝操作。`<profile_name>`：使用自定义配置文件。要定义自定义配置文件，请在项目的 `.qwen/` 目录中创建名为 `sandbox-macos-<profile_name>.sb` 的文件（例如 `my-project/.qwen/sandbox-macos-custom.sb`）。 |
| `DEBUG` 或 `DEBUG_MODE`          | （通常由底层库或 CLI 本身使用）设置为 `true` 或 `1` 以启用详细调试日志，这有助于故障排除。                                                           | **注意：** 这些变量默认会自动从项目 `.env` 文件中排除，以防止干扰 CLI 行为。如果需要专门为 Qwen Code 设置这些变量，请使用 `.qwen/.env` 文件。                                                                                                                                                                                                                                                                      |
| `NO_COLOR`                       | 设置为任意值以禁用 CLI 中的所有颜色输出。                                                                                                            |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `CLI_TITLE`                      | 设置为字符串以自定义 CLI 的标题。                                                                                                                      |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `CODE_ASSIST_ENDPOINT`           | 指定代码辅助服务器的端点。                                                                                                                             | 这对于开发和测试很有用。                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `TAVILY_API_KEY`                 | Tavily 网络搜索服务的 API 密钥。                                                                                                                       | 用于启用 `web_search` 工具功能。示例：`export TAVILY_API_KEY="tvly-your-api-key-here"`                                                                                                                                                                                                                                                                                                                                                                                         |

## 命令行参数

在运行 CLI 时直接传递的参数可以覆盖该特定会话的其他配置。

### 命令行参数表

| 参数                         | 别名  | 描述                                                                                                                                                                                    | 可能的值                               | 备注                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| ---------------------------- | ----- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--model`                    | `-m`  | 指定此会话使用的 Qwen 模型。                                                                                                                                                            | 模型名称                               | 示例：`npm start -- --model qwen3-coder-plus`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `--prompt`                   | `-p`  | 用于直接向命令传递提示。这将以非交互模式调用 Qwen Code。                                                                                                                                | 你的提示文本                           | 对于脚本示例，使用 `--output-format json` 标志以获取结构化输出。                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `--prompt-interactive`       | `-i`  | 使用提供的提示作为初始输入启动交互式会话。                                                                                                                                             | 你的提示文本                           | 提示在交互式会话中处理，而不是在此之前。当从标准输入管道传输输入时不能使用。示例：`qwen -i "explain this code"`                                                                                                                                                                                                                                                                                                                                                                                      |
| `--output-format`            | `-o`  | 指定非交互模式下 CLI 输出的格式。                                                                                                                                                       | `text`, `json`, `stream-json`          | `text`: (默认) 标准的人类可读输出。`json`: 执行结束时发出的机器可读 JSON 输出。`stream-json`: 执行过程中发生时发出的流式 JSON 消息。对于结构化输出和脚本，请使用 `--output-format json` 或 `--output-format stream-json` 标志。有关详细信息，请参见[无头模式](../features/headless)。                                                                                                                                                                    |
| `--input-format`             |       | 指定从标准输入消费的格式。                                                                                                                                                              | `text`, `stream-json`                  | `text`: (默认) 来自标准输入或命令行参数的标准文本输入。`stream-json`: 通过标准输入进行双向通信的 JSON 消息协议。要求：`--input-format stream-json` 需要设置 `--output-format stream-json`。使用 `stream-json` 时，标准输入保留用于协议消息。有关详细信息，请参见[无头模式](../features/headless)。                                                                                                                                                                 |
| `--include-partial-messages` |       | 在使用 `stream-json` 输出格式时包含部分助手消息。启用后，在流式传输期间按发生顺序发出流事件（message_start、content_block_delta 等）。                                                 |                                        | 默认：`false`。要求：需要设置 `--output-format stream-json`。有关流事件的详细信息，请参见[无头模式](../features/headless)。                                                                                                                                                                                                                                                                                                                                                                           |
| `--sandbox`                  | `-s`  | 为此会话启用沙盒模式。                                                                                                                                                                  |                                        |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `--sandbox-image`            |       | 设置沙盒镜像 URI。                                                                                                                                                                      |                                        |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `--debug`                    | `-d`  | 为此会话启用调试模式，提供更详细的输出。                                                                                                                                                |                                        |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `--all-files`                | `-a`  | 如果设置，则递归包含当前目录中的所有文件作为提示的上下文。                                                                                                                             |                                        |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `--help`                     | `-h`  | 显示关于命令行参数的帮助信息。                                                                                                                                                          |                                        |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `--show-memory-usage`        |       | 显示当前内存使用情况。                                                                                                                                                                  |                                        |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `--yolo`                     |       | 启用 YOLO 模式，自动批准所有工具调用。                                                                                                                                                  |                                        |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `--approval-mode`            |       | 设置工具调用的审批模式。                                                                                                                                                                | `plan`, `default`, `auto-edit`, `yolo` | 支持的模式：`plan`: 仅分析—不修改文件或执行命令。`default`: 需要批准文件编辑或 shell 命令（默认行为）。`auto-edit`: 自动批准编辑工具（edit, write_file），同时对其他工具进行提示。`yolo`: 自动批准所有工具调用（等同于 `--yolo`）。不能与 `--yolo` 一起使用。对于新的统一方法，请使用 `--approval-mode=yolo` 而不是 `--yolo`。示例：`qwen --approval-mode auto-edit`<br>有关[审批模式](../features/approval-mode)的更多信息。 |
| `--allowed-tools`            |       | 绕过确认对话框的工具名称逗号分隔列表。                                                                                                                                                  | 工具名称                               | 示例：`qwen --allowed-tools "Shell(git status)"`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `--telemetry`                |       | 启用[遥测](/developers/development/telemetry)。                                                                                                                                         |                                        |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `--telemetry-target`         |       | 设置遥测目标。                                                                                                                                                                          |                                        | 有关更多信息，请参见[遥测](/developers/development/telemetry)。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `--telemetry-otlp-endpoint`  |       | 设置遥测的 OTLP 端点。                                                                                                                                                                  |                                        | 有关更多信息，请参见[遥测](../../developers/development/telemetry)。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `--telemetry-otlp-protocol`  |       | 设置遥测的 OTLP 协议（`grpc` 或 `http`）。                                                                                                                                             |                                        | 默认为 `grpc`。有关更多信息，请参见[遥测](../../developers/development/telemetry)。                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `--telemetry-log-prompts`    |       | 启用遥测的提示日志记录。                                                                                                                                                                |                                        | 有关更多信息，请参见[遥测](../../developers/development/telemetry)。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `--checkpointing`            |       | 启用[检查点](../features/checkpointing)。                                                                                                                                               |                                        |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `--acp`                      |       | 启用 ACP 模式（代理客户端协议）。对于像 [Zed](../integration-zed) 这样的 IDE/编辑器集成很有用。                                                                                       |                                        | 稳定版。取代已弃用的 `--experimental-acp` 标志。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `--experimental-skills`      |       | 启用实验性[代理技能](../features/skills)（注册 `skill` 工具并从 `.qwen/skills/` 和 `~/.qwen/skills/` 加载技能）。                                                                    |                                        | 实验性。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `--extensions`               | `-e`  | 指定会话要使用的扩展列表。                                                                                                                                                              | 扩展名称                               | 如果未提供，则使用所有可用扩展。使用特殊术语 `qwen -e none` 禁用所有扩展。示例：`qwen -e my-extension -e my-other-extension`                                                                                                                                                                                                                                                                                                                                                                       |
| `--list-extensions`          | `-l`  | 列出所有可用扩展并退出。                                                                                                                                                                |                                        |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `--proxy`                    |       | 设置 CLI 的代理。                                                                                                                                                                       | 代理 URL                               | 示例：`--proxy http://localhost:7890`。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `--include-directories`      |       | 在工作区中包含额外目录以支持多目录。                                                                                                                                                    | 目录路径                               | 可以多次指定或作为逗号分隔值。最多可以添加 5 个目录。示例：`--include-directories /path/to/project1,/path/to/project2` 或 `--include-directories /path/to/project1 --include-directories /path/to/project2`                                                                                                                                                                                                                                                                                 |
| `--screen-reader`            |       | 启用屏幕阅读器模式，调整 TUI 以更好地兼容屏幕阅读器。                                                                                                                                  |                                        |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `--version`                  |       | 显示 CLI 版本。                                                                                                                                                                         |                                        |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `--openai-logging`           |       | 启用 OpenAI API 调用的日志记录以进行调试和分析。                                                                                                                                        |                                        | 此标志覆盖 `settings.json` 中的 `enableOpenAILogging` 设置。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `--openai-logging-dir`       |       | 为 OpenAI API 日志设置自定义目录路径。                                                                                                                                                  | 目录路径                               | 此标志覆盖 `settings.json` 中的 `openAILoggingDir` 设置。支持绝对路径、相对路径和 `~` 展开。示例：`qwen --openai-logging-dir "~/qwen-logs" --openai-logging`                                                                                                                                                                                                                                                                                                                                 |
| `--tavily-api-key`           |       | 为此会话设置网络搜索功能的 Tavily API 密钥。                                                                                                                                            | API 密钥                               | 示例：`qwen --tavily-api-key tvly-your-api-key-here`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |

## 上下文文件（分层指令上下文）

虽然严格来说不是 CLI _行为_ 的配置，但上下文文件（默认为 `QWEN.md`，可通过 `context.fileName` 设置进行配置）对于配置 _指令上下文_（也称为"记忆"）至关重要。这个强大功能允许你向 AI 提供特定于项目的说明、编码风格指南或任何相关背景信息，使其响应更符合你的需求并更加准确。CLI 包含 UI 元素，例如页脚中的指示器显示已加载的上下文文件数量，让你了解当前活动的上下文。

- **用途：** 这些 Markdown 文件包含你在交互过程中希望 Qwen 模型了解的指令、指南或上下文。该系统设计为以分层方式管理此指令上下文。

### 上下文文件内容示例（例如 `QWEN.md`）

以下是一个概念性示例，展示了 TypeScript 项目根目录中的上下文文件可能包含的内容：

```

# 项目：我的超棒 TypeScript 库

## 一般说明：
- 生成新的 TypeScript 代码时，请遵循现有的编码风格。
- 确保所有新函数和类都有 JSDoc 注释。
- 在适当情况下优先使用函数式编程范式。
- 所有代码应与 TypeScript 5.0 和 Node.js 20+ 兼容。

## 编码风格：
- 使用 2 个空格进行缩进。
- 接口名称应以 `I` 为前缀（例如 `IUserService`）。
- 私有类成员应以下划线 (`_`) 为前缀。
- 始终使用严格相等性（`===` 和 `!==`）。

## 特定组件：`src/api/client.ts`
- 此文件处理所有出站 API 请求。
- 添加新的 API 调用函数时，确保它们包含健壮的错误处理和日志记录。
- 所有 GET 请求都使用现有的 `fetchWithRetry` 实用程序。
```

## 关于依赖项：
- 除非绝对必要，否则避免引入新的外部依赖。
- 如果需要新依赖，请说明原因。

```

此示例展示了如何提供通用项目上下文、特定编码约定，甚至关于特定文件或组件的注释。你的上下文文件越相关和精确，AI 就能更好地协助你。强烈建议使用项目特定的上下文文件来建立约定和上下文。

- **分层加载和优先级：** CLI 通过从多个位置加载上下文文件（例如 `QWEN.md`）实现了一个复杂的分层内存系统。此列表中较低位置（更具体）的文件内容通常会覆盖或补充较高位置（更通用）的文件内容。可以使用 `/memory show` 命令检查确切的连接顺序和最终上下文。典型的加载顺序为：
  1. **全局上下文文件：**
     - 位置：`~/.qwen/<configured-context-filename>`（例如，用户主目录中的 `~/.qwen/QWEN.md`）。
     - 范围：为所有项目提供默认指令。
  2. **项目根目录和祖先目录上下文文件：**
     - 位置：CLI 在当前工作目录以及每个父目录中搜索配置的上下文文件，直到项目根目录（由 `.git` 文件夹标识）或你的主目录。
     - 范围：提供与整个项目或其重要部分相关的上下文。
  3. **子目录上下文文件（上下文/本地）：**
     - 位置：CLI 还会在当前工作目录之下的子目录中扫描配置的上下文文件（遵循常见的忽略模式，如 `node_modules`、`.git` 等）。此搜索的范围默认限制为 200 个目录，但可以在 `settings.json` 文件中使用 `context.discoveryMaxDirs` 设置进行配置。
     - 范围：允许针对项目的特定组件、模块或子部分提供高度具体的指令。
- **连接和 UI 指示：** 所有找到的上下文文件的内容都会被连接（带有分隔符表示其来源和路径）并作为系统提示的一部分提供。CLI 页脚显示已加载的上下文文件数量，让你快速了解当前活动的指令上下文。
- **导入内容：** 你可以使用 `@path/to/file.md` 语法导入其他 Markdown 文件来模块化你的上下文文件。更多详情请参见[内存导入处理器文档](../configuration/memory)。
- **内存管理命令：**
  - 使用 `/memory refresh` 强制重新扫描和重新加载所有配置位置的所有上下文文件。这将更新 AI 的指令上下文。
  - 使用 `/memory show` 显示当前加载的组合指令上下文，让你验证 AI 正在使用的层次结构和内容。
  - 有关 `/memory` 命令及其子命令（`show` 和 `refresh`）的完整详细信息，请参见[命令文档](../features/commands)。

通过理解和利用这些配置层和上下文文件的分层特性，你可以有效管理 AI 的内存，并根据你的特定需求和项目定制 Qwen Code 的响应。

## 沙箱

Qwen Code 可以在沙箱环境中执行潜在的不安全操作（如 shell 命令和文件修改），以保护你的系统。

[沙箱](../features/sandbox) 默认是禁用的，但你可以通过以下几种方式启用它：

- 使用 `--sandbox` 或 `-s` 标志。
- 设置 `GEMINI_SANDBOX` 环境变量。
- 使用 `--yolo` 或 `--approval-mode=yolo` 时默认启用沙箱。

默认情况下，它使用预构建的 `qwen-code-sandbox` Docker 镜像。

对于特定项目的沙箱需求，你可以在项目根目录下的 `.qwen/sandbox.Dockerfile` 创建自定义 Dockerfile。这个 Dockerfile 可以基于基础沙箱镜像：

```
FROM qwen-code-sandbox

# 在这里添加你的自定义依赖或配置

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

为了帮助我们改进 Qwen Code，我们会收集匿名的使用统计数据。这些数据帮助我们了解 CLI 的使用方式，识别常见问题，并确定新功能的优先级。

**我们收集的内容：**

- **工具调用：** 我们记录被调用的工具名称、它们是否成功以及执行所需的时间。我们不会收集传递给工具的参数或它们返回的任何数据。
- **API 请求：** 我们记录每个请求使用的模型、请求持续时间以及是否成功。我们不会收集提示内容或响应内容。
- **会话信息：** 我们收集有关 CLI 配置的信息，例如启用的工具和审批模式。

**我们不收集的内容：**

- **个人身份信息 (PII)：** 我们不会收集任何个人信息，如您的姓名、电子邮件地址或 API 密钥。
- **提示和响应内容：** 我们不会记录您提示的内容或模型的响应。
- **文件内容：** 我们不会记录 CLI 读取或写入的任何文件内容。

**如何退出：**

您可以通过在 `settings.json` 文件中的 `privacy` 类别下将 `usageStatisticsEnabled` 属性设置为 `false` 来随时退出使用统计收集：

```
{
  "privacy": {
    "usageStatisticsEnabled": false
  }
}
```

> [!note]
>
> 启用使用统计后，事件将发送到阿里云 RUM 收集端点。