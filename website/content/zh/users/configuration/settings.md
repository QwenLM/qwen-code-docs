# Qwen Code 配置

> [!tip]
>
> **身份验证 / API 密钥：** 身份验证（API Key、阿里云编码计划）及与身份验证相关的环境变量（如 `OPENAI_API_KEY`）请参阅 **[身份验证](../configuration/auth)**。

> [!note]
>
> **关于新配置格式的说明：** `settings.json` 文件的格式已更新为更清晰的新结构。旧格式将自动迁移。
Qwen Code 提供多种配置其行为的方式，包括环境变量、命令行参数和设置文件。本文档概述了不同的配置方法及可用设置。

## 配置层级

配置按以下优先级顺序应用（数字较小的会被数字较大的覆盖）：

| 层级 | 配置来源   | 说明                                                                     |
| ----- | ---------------------- | ------------------------------------------------------------------------------- |
| 1     | 默认值         | 应用程序内硬编码的默认值                                       |
| 2     | 系统默认文件   | 系统范围的默认设置，可被其他设置文件覆盖     |
| 3     | 用户设置文件     | 当前用户的全局设置                                            |
| 4     | 项目设置文件  | 项目特定的设置                                                       |
| 5     | 系统设置文件   | 系统范围的设置，覆盖所有其他设置文件                     |
| 6     | 环境变量  | 系统范围或会话特定的变量，可能从 `.env` 文件加载 |
| 7     | 命令行参数 | 启动 CLI 时传入的值                                            |

## 设置文件

Qwen Code 使用 JSON 设置文件进行持久化配置。这些文件有四个存放位置：

| 文件类型             | 位置                                                                                                                                                                                                                                                                        | 作用范围                                                                                                                                                                                                                     |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 系统默认文件  | Linux: `/etc/qwen-code/system-defaults.json`<br>Windows: `C:\ProgramData\qwen-code\system-defaults.json`<br>macOS: `/Library/Application Support/QwenCode/system-defaults.json` <br>路径可通过 `QWEN_CODE_SYSTEM_DEFAULTS_PATH` 环境变量覆盖。 | 提供系统范围的默认设置基础层。这些设置优先级最低，旨在被用户、项目或系统覆盖设置所覆盖。                                         |
| 用户设置文件    | `~/.qwen/settings.json`（其中 `~` 是你的主目录）。                                                                                                                                                                                                                     | 适用于当前用户的所有 Qwen Code 会话。                                                                                                                                                                   |
| 项目设置文件 | `.qwen/settings.json`，位于项目根目录内。                                                                                                                                                                                                                     | 仅在该特定项目中运行 Qwen Code 时生效。项目设置会覆盖用户设置。                                                                                                                  |
| 系统设置文件  | Linux： `/etc/qwen-code/settings.json` <br>Windows: `C:\ProgramData\qwen-code\settings.json` <br>macOS: `/Library/Application Support/QwenCode/settings.json`<br>路径可通过 `QWEN_CODE_SYSTEM_SETTINGS_PATH` 环境变量覆盖。                    | 适用于系统上所有用户的所有 Qwen Code 会话。系统设置会覆盖用户和项目设置。企业系统管理员可使用此设置来控制用户的 Qwen Code 配置。 |

> [!note]
>
> **设置中的环境变量说明：** `settings.json` 文件中的字符串值可以使用 `$VAR_NAME` 或 `${VAR_NAME}` 语法引用环境变量。加载设置时，这些变量将自动解析。例如，如果你有一个环境变量 `MY_API_TOKEN`，可以在 `settings.json` 中这样使用：`"apiKey": "$MY_API_TOKEN"`。

### 项目中的 `.qwen` 目录

除了项目设置文件外，项目的 `.qwen` 目录还可以包含其他与 Qwen Code 运行相关的项目特定文件，例如：

- [自定义沙盒配置文件](../features/sandbox)（例如 `.qwen/sandbox-macos-custom.sb`、`.qwen/sandbox.Dockerfile`）。
- `.qwen/skills/` 下的 [Agent Skills](../features/skills)（每个 Skill 是一个包含 `SKILL.md` 的目录）。

### 配置迁移

Qwen Code 会自动将旧版配置设置迁移到新格式。迁移前会备份旧设置文件。以下设置已从否定命名（`disable*`）更改为肯定命名（`enable*`）：

| 旧设置                              | 新设置                                 | 说明                              |
| ---------------------------------------- | ------------------------------------------- | ---------------------------------- |
| `disableAutoUpdate` + `disableUpdateNag` | `general.enableAutoUpdate`                  | 合并为单个设置 |
| `disableLoadingPhrases`                  | `ui.accessibility.enableLoadingPhrases`     |                                    |
| `disableFuzzySearch`                     | `context.fileFiltering.enableFuzzySearch`   |                                    |
| `disableCacheControl`                    | `model.generationConfig.enableCacheControl` |                                    |

> [!note]
>
> **布尔值反转：** 迁移时，布尔值会取反（例如，`disableAutoUpdate: true` 会变为 `enableAutoUpdate: false`）。

#### `disableAutoUpdate` 和 `disableUpdateNag` 的合并策略

当两个旧版设置同时存在且值不同时，迁移遵循以下策略：如果 `disableAutoUpdate` 或 `disableUpdateNag` 中**任意一个**为 `true`，则 `enableAutoUpdate` 将变为 `false`：

| `disableAutoUpdate` | `disableUpdateNag` | 迁移后的 `enableAutoUpdate` |
| ------------------- | ------------------ | --------------------------- |
| `false`             | `false`            | `true`                      |
| `false`             | `true`             | `false`                     |
| `true`              | `false`            | `false`                     |
| `true`              | `true`             | `false`                     |

### `settings.json` 中的可用设置

设置按类别组织。大多数设置应放置在 `settings.json` 文件中对应的顶级类别对象内。少数兼容性设置（如 `proxy`）为顶级键。

#### top-level

| 设置 | 类型   | 说明                                                                                                                                                                | 默认值     |
| ------- | ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- |
| `proxy` | string | CLI HTTP 请求的代理 URL。优先级顺序为 `--proxy` > `settings.json` 中的 `proxy` > `HTTPS_PROXY` / `https_proxy` / `HTTP_PROXY` / `http_proxy` 环境变量。 | `undefined` |

#### general

| 设置                                    | 类型    | 说明                                                                                                                                                                     | 默认值     |
| ------------------------------------------ | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- |
| `general.preferredEditor`                  | string  | 打开文件时首选的编辑器。                                                                                                                                          | `undefined` |
| `general.vimMode`                          | boolean | 启用 Vim 键位绑定。                                                                                                                                                         | `false`     |
| `general.enableAutoUpdate`                 | boolean | 启动时启用自动更新检查和安装。                                                                                                                    | `true`      |
| `general.showSessionRecap`                 | boolean | 离开终端一段时间后返回时，自动显示一行“上次进度”摘要。默认关闭。无论此设置如何，均可使用 `/recap` 手动触发。   | `false`     |
| `general.sessionRecapAwayThresholdMinutes` | number  | 终端必须失去焦点的分钟数，以便在重新获得焦点时触发自动摘要。仅在启用 `showSessionRecap` 时生效。                                                      | `5`         |
| `general.gitCoAuthor`                      | boolean | 通过 Qwen Code 提交代码时，自动在 git commit 消息中添加 Co-authored-by 尾注。                                                                      | `true`      |
| `general.checkpointing.enabled`            | boolean | 启用会话检查点以便恢复。                                                                                                                                      | `false`     |
| `general.defaultFileEncoding`              | string  | 新文件的默认编码。使用 `"utf-8"`（默认）表示不带 BOM 的 UTF-8，或使用 `"utf-8-bom"` 表示带 BOM 的 UTF-8。仅在你的项目明确要求 BOM 时才更改此项。 | `"utf-8"`   |

#### output

| 设置         | 类型   | 说明                   | 默认值  | 可能值    |
| --------------- | ------ | ----------------------------- | -------- | ------------------ |
| `output.format` | string | CLI 输出的格式。 | `"text"` | `"text"`, `"json"` |

#### ui

| 设置                                 | 类型             | 说明                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | 默认值     |
| --------------------------------------- | ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- |
| `ui.theme`                              | string           | UI 的颜色主题。可用选项请参阅 [主题](../configuration/themes)。                                                                                                                                                                                                                                                                                                                                                                                                                                                           | `undefined` |
| `ui.customThemes`                       | object           | 自定义主题定义。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | `{}`        |
| `ui.statusLine`                         | object           | 自定义状态栏配置。一个 shell 命令，其输出显示在页脚左侧。请参阅 [状态栏](../features/status-line)。                                                                                                                                                                                                                                                                                                                                                                                                  | `undefined` |
| `ui.hideWindowTitle`                    | boolean          | 隐藏窗口标题栏。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | `false`     |
| `ui.hideTips`                           | boolean          | 隐藏 UI 中的所有提示（启动提示和响应后提示）。请参阅 [上下文提示](../features/tips)。                                                                                                                                                                                                                                                                                                                                                                                                                                                      | `false`     |
| `ui.hideBanner`                         | boolean          | 隐藏应用程序横幅。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | `false`     |
| `ui.hideFooter`                         | boolean          | 隐藏 UI 页脚。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | `false`     |
| `ui.showMemoryUsage`                    | boolean          | 在 UI 中显示内存使用情况信息。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | `false`     |
| `ui.showLineNumbers`                    | boolean          | 在 CLI 输出的代码块中显示行号。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | `true`      |
| `ui.showCitations`                      | boolean          | 在聊天中显示生成文本的引用来源。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | `true`      |
| `ui.compactMode`                        | boolean          | 隐藏工具输出和思考过程，以获得更简洁的视图。可在会话期间按 `Ctrl+O` 或通过设置对话框切换。即使在紧凑模式下，工具批准提示也永远不会隐藏。该设置跨会话保留。                                                                                                                                                                                                                                                                                                                            | `false`     |
| `ui.shellOutputMaxLines`                | number           | 内联显示的 shell 输出最大行数。设置为 `0` 可取消限制并显示完整输出。隐藏的行将通过 `+N lines` 指示器显示。错误、`!` 前缀的用户发起命令、确认工具以及聚焦的嵌入式 shell 始终显示完整输出。                                                                                                                                                                                                                                                                      | `5`         |
| `enableWelcomeBack`                     | boolean          | 返回带有对话历史记录的项目时显示欢迎返回对话框。启用后，Qwen Code 会自动检测你是否正在返回一个已生成项目摘要（`.qwen/PROJECT_SUMMARY.md`）的项目，并显示一个对话框，允许你继续之前的对话或重新开始。如果选择 **Start new chat session**，该选择将针对当前项目保留，直到项目摘要发生变化。此功能与 `/summary` 命令和退出确认对话框集成。 | `true`      |
| `ui.accessibility.enableLoadingPhrases` | boolean          | 启用加载提示语（为提升无障碍体验可禁用）。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | `true`      |
| `ui.accessibility.screenReader`         | boolean          | 启用屏幕阅读器模式，调整 TUI 以更好地兼容屏幕阅读器。                                                                                                                                                                                                                                                                                                                                                                                                                                                    | `false`     |
| `ui.customWittyPhrases`                 | array of strings | 在加载状态期间显示的自定义提示语列表。提供后，CLI 将循环显示这些提示语，而非默认提示语。                                                                                                                                                                                                                                                                                                                                                                                                    | `[]`        |
| `ui.enableFollowupSuggestions`          | boolean          | 启用 [后续建议](../features/followup-suggestions)，在模型响应后预测你接下来想输入的内容。建议以幽灵文本形式出现，可通过 Tab、Enter 或右箭头键接受。                                                                                                                                                                                                                                                                                                                            | `true`      |
| `ui.enableCacheSharing`                 | boolean          | 使用缓存感知的分叉查询来生成建议。降低支持前缀缓存的提供商的成本（实验性）。                                                                                                                                                                                                                                                                                                                                                                                                                    | `true`      |
| `ui.enableSpeculation`                  | boolean          | 在接受建议后、提交前进行推测性执行。接受后结果将立即显示（实验性）。                                                                                                                                                                                                                                                                                                                                                                                                                             | `false`     |
| `experimental.emitToolUseSummaries`     | boolean          | 生成简短的基于 LLM 的标签，总结每个工具调用批次。请参阅 [工具使用摘要](../features/tool-use-summaries)。需要配置 `fastModel`，否则将静默跳过。可通过 `QWEN_CODE_EMIT_TOOL_USE_SUMMARIES=0` 或 `=1` 按会话覆盖。                                                                                                                                                                                                                                                                   | `true`      |

#### ide

| 设置            | 类型    | 说明                                          | 默认值 |
| ------------------ | ------- | ---------------------------------------------------- | ------- |
| `ide.enabled`      | boolean | 启用 IDE 集成模式。                         | `false` |
| `ide.hasSeenNudge` | boolean | 用户是否已看到 IDE 集成提示。 | `false` |

#### privacy

| 设置                          | 类型    | 说明                            | 默认值 |
| -------------------------------- | ------- | -------------------------------------- | ------- |
| `privacy.usageStatisticsEnabled` | boolean | 启用使用统计信息收集。 | `true`  |

#### model

| 设置                                            | 类型    | 说明                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | 默认值     |
| -------------------------------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------- |
| `model.name`                                       | string  | 用于对话的 Qwen 模型。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | `undefined` |
| `model.maxSessionTurns`                            | number  | 会话中保留的用户/模型/工具轮次最大数量。-1 表示无限制。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | `-1`        |
| `model.generationConfig`                           | object  | 传递给底层内容生成器的高级覆盖配置。支持请求控制，如 `timeout`、`maxRetries`、`enableCacheControl`、`splitToolMedia`（对于像 LM Studio 这样拒绝 `role: "tool"` 消息中非文本内容的严格 OpenAI 兼容服务器，设置为 `true` —— 将媒体拆分为后续的用户消息）、`contextWindowSize`（覆盖模型的上下文窗口大小）、`modalities`（覆盖自动检测的输入模态）、`customHeaders`（API 请求的自定义 HTTP 标头）、`extra_body`（仅适用于 OpenAI 兼容 API 请求的额外请求体参数），以及 `reasoning`（`{ effort: 'low' \| 'medium' \| 'high' \| 'max', budget_tokens?: number }` 用于控制思考强度，或 `false` 禁用；`'max'` 是 DeepSeek 扩展 —— 请参阅 [推理/思考配置](./model-providers.md#reasoning--thinking-configuration) 了解各提供商的行为。**注意：** 当在 OpenAI 兼容提供商上设置 `samplingParams` 时，管道会原样传递这些键，并丢弃单独的顶级 `reasoning` 字段 —— 此时请将 `reasoning_effort` 放入 `samplingParams`（或 `extra_body`）中），以及 `samplingParams` 下的微调旋钮（例如 `temperature`、`top_p`、`max_tokens`）。保持未设置以依赖提供商默认值。 | `undefined` |
| `model.chatCompression.contextPercentageThreshold` | number  | 将聊天历史压缩阈值设置为模型总 token 限制的百分比。这是一个介于 0 和 1 之间的值，适用于自动压缩和手动 `/compress` 命令。例如，值 `0.6` 将在聊天历史超过 token 限制的 60% 时触发压缩。使用 `0` 可完全禁用压缩。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | `0.7`       |
| `model.skipNextSpeakerCheck`                       | boolean | 跳过下一次发言者检查。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | `false`     |
| `model.skipLoopDetection`                          | boolean | 禁用循环检测检查。循环检测可防止 AI 响应中的无限循环，但可能产生误报从而中断正常工作流。如果你经常遇到误报中断，请启用此选项。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | `false`     |
| `model.skipStartupContext`                         | boolean | 跳过在每个会话开始时发送启动工作区上下文（环境摘要和确认）。如果你希望手动提供上下文或想在启动时节省 token，请启用此选项。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | `false`     |
| `model.enableOpenAILogging`                        | boolean | 启用 OpenAI API 调用日志记录，用于调试和分析。启用后，API 请求和响应将记录到 JSON 文件中。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | `false`     |
| `model.openAILoggingDir`                           | string  | OpenAI API 日志的自定义目录路径。如果未指定，默认为当前工作目录下的 `logs/openai`。支持绝对路径、相对路径（从当前工作目录解析）和 `~` 展开（主目录）。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | `undefined` |

**model.generationConfig 示例：**

```json
{
  "model": {
    "generationConfig": {
      "timeout": 60000,
      "contextWindowSize": 128000,
      "modalities": {
        "image": true
      },
      "enableCacheControl": true,
      "customHeaders": {
        "X-Client-Request-ID": "req-123"
      },
      "extra_body": {
        "enable_thinking": true
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

**max_tokens（自适应输出 token）：**

当未设置 `samplingParams.max_tokens` 时，Qwen Code 使用自适应输出 token 策略来优化 GPU 资源使用：

1. 请求以 **8K** 输出 token 的默认限制开始
2. 如果响应被截断（模型达到限制），Qwen Code 会自动使用 **64K** token 重试
3. 部分输出将被丢弃，并替换为重试后的完整响应

这对用户是透明的 —— 如果发生升级，你可能会短暂看到重试指示器。由于 99% 的响应低于 5K token，重试很少发生（<1% 的请求）。

要覆盖此行为，请在设置中设置 `samplingParams.max_tokens` 或使用 `QWEN_CODE_MAX_OUTPUT_TOKENS` 环境变量。

**contextWindowSize：**

覆盖所选模型的默认上下文窗口大小。Qwen Code 根据模型名称匹配使用内置默认值确定上下文窗口，并带有常量回退值。当提供商的有效上下文限制与 Qwen Code 的默认值不同时，请使用此设置。此值定义模型假设的最大上下文容量，而非每次请求的 token 限制。

**modalities：**

覆盖所选模型的自动检测输入模态。Qwen Code 根据模型名称模式匹配自动检测支持的模态（图像、PDF、音频、视频）。当自动检测不正确时使用此设置 —— 例如，为支持但未识别的模型启用 `pdf`。格式：`{ "image": true, "pdf": true, "audio": true, "video": true }`。省略键或将其设置为 `false` 表示不支持的类型。

**customHeaders：**

允许你向所有 API 请求添加自定义 HTTP 标头。这对于请求追踪、监控、API 网关路由或不同模型需要不同标头时非常有用。如果 `modelProviders[].generationConfig.customHeaders` 中定义了 `customHeaders`，将直接使用；否则将使用 `model.generationConfig.customHeaders` 中的标头。两个级别之间不会合并。

`extra_body` 字段允许你向发送到 API 的请求体添加自定义参数。这对于标准配置字段未涵盖的提供商特定选项非常有用。**注意：此字段仅支持 OpenAI 兼容提供商（`openai`、`qwen-oauth`）。Anthropic 和 Gemini 提供商将忽略此字段。** 如果 `modelProviders[].generationConfig.extra_body` 中定义了 `extra_body`，将直接使用；否则将使用 `model.generationConfig.extra_body` 中的值。

**model.openAILoggingDir 示例：**

- `"~/qwen-logs"` - 记录到 `~/qwen-logs` 目录
- `"./custom-logs"` - 记录到相对于当前目录的 `./custom-logs`
- `"/tmp/openai-logs"` - 记录到绝对路径 `/tmp/openai-logs`

#### fastModel

| 设置     | 类型   | 说明                                                                                                                                                                                                                                                      | 默认值 |
| ----------- | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| `fastModel` | string | 用于生成 [提示建议](../features/followup-suggestions) 和推测性执行的模型。留空以使用主模型。较小/较快的模型（例如 `qwen3-coder-flash`）可降低延迟和成本。也可通过 `/model --fast` 设置。 | `""`    |

#### context

| 设置                                                  | 类型                       | 说明                                                                                                                                                                                                                                                                                                                                                           | 默认值     |
| -------------------------------------------------------- | -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- |
| `context.fileName`                                       | string or array of strings | 上下文文件的名称。                                                                                                                                                                                                                                                                                                                                      | `undefined` |
| `context.importFormat`                                   | string                     | 导入记忆时使用的格式。                                                                                                                                                                                                                                                                                                                              | `undefined` |
| `context.includeDirectories`                             | array                      | 要包含在工作区上下文中的附加目录。指定要包含在工作区上下文中的附加绝对或相对路径数组。默认情况下，缺失的目录将被跳过并显示警告。路径可以使用 `~` 引用用户的主目录。此设置可与 `--include-directories` 命令行标志结合使用。 | `[]`        |
| `context.loadFromIncludeDirectories`                     | boolean                    | 控制 `/memory refresh` 命令的行为。如果设置为 `true`，应从所有添加的目录加载 `QWEN.md` 文件。如果设置为 `false`，应仅从当前目录加载 `QWEN.md`。                                                                                                                                        | `false`     |
| `context.fileFiltering.respectGitIgnore`                 | boolean                    | 搜索时遵循 .gitignore 文件。                                                                                                                                                                                                                                                                                                                              | `true`      |
| `context.fileFiltering.respectQwenIgnore`                | boolean                    | 搜索时遵循 .qwenignore 文件。                                                                                                                                                                                                                                                                                                                             | `true`      |
| `context.fileFiltering.enableRecursiveFileSearch`        | boolean                    | 是否在提示中完成 `@` 前缀时，在当前树下递归搜索文件名。                                                                                                                                                                                                                                              | `true`      |
| `context.fileFiltering.enableFuzzySearch`                | boolean                    | 当为 `true` 时，在搜索文件时启用模糊搜索功能。在文件数量庞大的项目中设置为 `false` 可提高性能。                                                                                                                                                                                                              | `true`      |
| `context.clearContextOnIdle.toolResultsThresholdMinutes` | number                     | 清除旧工具结果内容前的空闲分钟数。使用 `-1` 禁用。                                                                                                                                                                                                                                                                                   | `60`        |
| `context.clearContextOnIdle.toolResultsNumToKeep`        | number                     | 清除时保留的最近可压缩工具结果数量。下限为 1。                                                                                                                                                                                                                                                                                 | `5`         |

#### 排查文件搜索性能问题

如果你在文件搜索（例如 `@` 补全）时遇到性能问题，尤其是在文件数量非常多的项目中，可以尝试以下方法（按推荐顺序）：

1. **使用 `.qwenignore`：** 在项目根目录创建 `.qwenignore` 文件，以排除包含大量无需引用文件的目录（例如构建产物、日志、`node_modules`）。减少爬取的文件总数是提高性能最有效的方法。
2. **禁用模糊搜索：** 如果忽略文件仍不够，可以在 `settings.json` 中将 `enableFuzzySearch` 设置为 `false` 来禁用模糊搜索。这将使用更简单的非模糊匹配算法，速度更快。
3. **禁用递归文件搜索：** 作为最后手段，你可以通过将 `enableRecursiveFileSearch` 设置为 `false` 完全禁用递归文件搜索。这将是最快的选项，因为它避免了对项目的递归爬取。但这也意味着在使用 `@` 补全时需要输入文件的完整路径。

#### tools

| 设置                              | 类型              | 说明                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | 默认值     | 备注                                                                                                                                                                                                                                                |
| ------------------------------------ | ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tools.sandbox`                      | boolean or string | 沙盒执行环境（可以是布尔值或路径字符串）。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | `undefined` |                                                                                                                                                                                                                                                      |
| `tools.sandboxImage`                 | string            | 当未设置 `--sandbox-image` 和 `QWEN_SANDBOX_IMAGE` 时，Docker/Podman 使用的沙盒镜像 URI。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | `undefined` |                                                                                                                                                                                                                                                      |
| `tools.shell.enableInteractiveShell` | boolean           | 使用 `node-pty` 提供交互式 shell 体验。仍会回退到 `child_process`。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | `false`     |                                                                                                                                                                                                                                                      |
| `tools.core`                         | array of strings  | **已弃用。** 将在下一版本中移除。请改用 `permissions.allow` + `permissions.deny`。将内置工具限制为允许列表。列表中未包含的所有工具将被禁用。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | `undefined` |                                                                                                                                                                                                                                                      |
| `tools.exclude`                      | array of strings  | **已弃用。** 请改用 `permissions.deny`。要从发现中排除的工具名称。首次加载时会自动迁移到 `permissions` 格式。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | `undefined` |                                                                                                                                                                                                                                                      |
| `tools.allowed`                      | array of strings  | **已弃用。** 请改用 `permissions.allow`。绕过确认对话框的工具名称。首次加载时会自动迁移到 `permissions` 格式。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | `undefined` |                                                                                                                                                                                                                                                      |
| `tools.approvalMode`                 | string            | 设置工具使用的默认批准模式。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | `default`   | 可能值：`plan`（仅分析，不修改文件或执行命令）、`default`（在文件编辑或 shell 命令运行前要求批准）、`auto-edit`（自动批准文件编辑）、`yolo`（自动批准所有工具调用） |
| `tools.discoveryCommand`             | string            | 用于工具发现的命令。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | `undefined` |                                                                                                                                                                                                                                                      |
| `tools.callCommand`                  | string            | 定义用于调用使用 `tools.discoveryCommand` 发现的特定工具的自定义 shell 命令。该 shell 命令必须满足以下条件：它必须将函数 `name`（与 [函数声明](https://ai.google.dev/gemini-api/docs/function-calling#function-declarations) 中完全一致）作为第一个命令行参数。它必须在 `stdin` 上以 JSON 格式读取函数参数，类似于 [`functionCall.args`](https://cloud.google.com/vertex-ai/generative-ai/docs/model-reference/inference#functioncall)。它必须在 `stdout` 上以 JSON 格式返回函数输出，类似于 [`functionResponse.response.content`](https://cloud.google.com/vertex-ai/generative-ai/docs/model-reference/inference#functionresponse)。 | `undefined` |                                                                                                                                                                                                                                                      |
| `tools.useRipgrep`                   | boolean           | 使用 ripgrep 进行文件内容搜索，而非回退实现。提供更快的搜索性能。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | `true`      |                                                                                                                                                                                                                                                      |
| `tools.useBuiltinRipgrep`            | boolean           | 使用内置的 ripgrep 二进制文件。设置为 `false` 时，将改用系统级的 `rg` 命令。此设置仅在 `tools.useRipgrep` 为 `true` 时生效。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | `true`      |                                                                                                                                                                                                                                                      |
| `tools.truncateToolOutputThreshold`  | number            | 如果工具输出超过此字符数，则进行截断。适用于 Shell、Grep、Glob、ReadFile 和 ReadManyFiles 工具。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | `25000`     | 需要重启：是                                                                                                                                                                                                                                |
| `tools.truncateToolOutputLines`      | number            | 截断工具输出时保留的最大行数或条目数。适用于 Shell、Grep、Glob、ReadFile 和 ReadManyFiles 工具。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | `1000`      | 需要重启：是                                                                                                                                                                                                                                |

> [!note]
>
> **从 `tools.core` / `tools.exclude` / `tools.allowed` 迁移：** 这些旧版设置**已弃用**，并在首次加载时自动迁移到新的 `permissions` 格式。建议直接配置 `permissions.allow` / `permissions.deny`。使用 `/permissions` 可交互式管理规则。

#### memory

| 设置                          | 类型    | 说明                                                                       | 默认值 |
| -------------------------------- | ------- | --------------------------------------------------------------------------------- | ------- |
| `memory.enableManagedAutoMemory` | boolean | 启用从对话中后台提取记忆。                      | `true`  |
| `memory.enableManagedAutoDream`  | boolean | 启用已收集记忆的自动整合（去重和清理）。 | `false` |

请参阅 [记忆](../features/memory) 了解自动记忆的工作原理以及如何使用 `/memory`、`/remember` 和 `/dream` 命令。

#### permissions

权限系统提供对哪些工具可以运行、哪些需要确认以及哪些被阻止的细粒度控制。

**决策优先级（从高到低）：`deny` > `ask` > `allow` > _(默认/交互模式)_**

第一个匹配的规则生效。规则使用 `"ToolName"` 或 `"ToolName(specifier)"` 格式。

| 设置             | 类型             | 说明                                                                                                      | 默认值     |
| ------------------- | ---------------- | ---------------------------------------------------------------------------------------------------------------- | ----------- |
| `permissions.allow` | array of strings | 自动批准的工具调用规则（无需确认）。跨所有作用域（用户 + 项目 + 系统）合并。 | `undefined` |
| `permissions.ask`   | array of strings | 始终需要用户确认的工具调用规则。优先级高于 `allow`。                         | `undefined` |
| `permissions.deny`  | array of strings | 被阻止的工具调用规则。最高优先级 —— 覆盖 `allow` 和 `ask`。                               | `undefined` |

**工具名称别名（规则中均可使用）：**

| 别名                 | 标准工具名      | 说明                     |
| --------------------- | ------------------- | ------------------------- |
| `Bash`, `Shell`       | `run_shell_command` |                           |
| `Read`, `ReadFile`    | `read_file`         | 元类别 —— 见下文 |
| `Edit`, `EditFile`    | `edit`              | 元类别 —— 见下文 |
| `Write`, `WriteFile`  | `write_file`        |                           |
| `Grep`, `SearchFiles` | `grep_search`       |                           |
| `Glob`, `FindFiles`   | `glob`              |                           |
| `ListFiles`           | `list_directory`    |                           |
| `WebFetch`            | `web_fetch`         |                           |
| `Agent`               | `task`              |                           |
| `Skill`               | `skill`             |                           |

**元类别：**

某些规则名称会自动覆盖多个工具：

| 规则名称 | 覆盖的工具                                        |
| --------- | ---------------------------------------------------- |
| `Read`    | `read_file`, `grep_search`, `glob`, `list_directory` |
| `Edit`    | `edit`, `write_file`                                 |

> [!important]
> `Read(/path/**)` 匹配**所有四个**读取工具（文件读取、grep、glob 和目录列表）。
> 要仅限制文件读取，请使用 `ReadFile(/path/**)` 或 `read_file(/path/**)`。

**规则语法示例：**

| 规则                          | 含义                                                        |
| ----------------------------- | -------------------------------------------------------------- |
| `"Bash"`                      | 所有 shell 命令                                             |
| `"Bash(git *)"`               | 以 `git` 开头的 shell 命令（单词边界：不包括 `gitk`） |
| `"Bash(git push *)"`          | 类似 `git push origin main` 的 shell 命令                     |
| `"Bash(npm run *)"`           | 任何 `npm run` 脚本                                           |
| `"Read"`                      | 所有文件读取操作（read、grep、glob、list）              |
| `"Read(./secrets/**)"`        | 递归读取 `./secrets/` 下的任何文件                   |
| `"Edit(/src/**/*.ts)"`        | 编辑项目根目录 `/src/` 下的 TypeScript 文件               |
| `"WebFetch(api.example.com)"` | 从 `api.example.com` 及其所有子域获取            |
| `"mcp__puppeteer"`            | 来自 puppeteer MCP 服务器的所有工具                        |

**路径模式前缀：**

| 前缀 | 含义                               | 示例             |
| ------ | ------------------------------------- | ------------------- |
| `//`   | 从文件系统根目录开始的绝对路径    | `//etc/passwd`      |
| `~/`   | 相对于主目录            | `~/Documents/*.pdf` |
| `/`    | 相对于项目根目录              | `/src/**/*.ts`      |
| `./`   | 相对于当前工作目录 | `./secrets/**`      |
| (无) | 同 `./`                          | `secrets/**`        |

**Shell 命令绕过防护：**

当代理运行等效的 shell 命令时，也会强制执行 `Read`、`Edit` 和 `WebFetch` 的权限规则。例如，如果 `deny` 中包含 `Read(./.env)`，代理无法通过 shell 命令中的 `cat .env` 绕过它。支持的 shell 命令包括 `cat`、`grep`、`curl`、`wget`、`cp`、`mv`、`rm`、`chmod` 等。未知/安全的命令（如 `git`）不受文件/网络规则影响。

**从旧版设置迁移：**

| 旧版设置  | 等效的 `permissions` 规则   | 说明                                                        |
| --------------- | ------------------------------- | ------------------------------------------------------------ |
| `tools.allowed` | `permissions.allow`             | 首次加载时自动迁移                                  |
| `tools.exclude` | `permissions.deny`              | 首次加载时自动迁移                                  |
| `tools.core`    | `permissions.allow`（允许列表） | 自动迁移；未列出的工具在注册表级别被禁用 |

**配置示例：**

```json
{
  "permissions": {
    "allow": ["Bash(git *)", "Bash(npm run *)", "Read(//Users/alice/code/**)"],
    "ask": ["Bash(git push *)", "Edit"],
    "deny": ["Bash(rm -rf *)", "Read(.env)", "WebFetch(malicious.com)"]
  }
}
```

> [!tip]
> 在交互式 CLI 中使用 `/permissions` 可查看、添加和删除规则，无需直接编辑 `settings.json`。

#### slashCommands

控制 CLI 中可用的斜杠命令。适用于在多租户或企业部署中锁定命令范围。

| 设置                  | 类型             | 说明                                                                                                                                                                                                                                                                                                                 | 默认值     |
| ------------------------ | ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- |
| `slashCommands.disabled` | array of strings | 要隐藏并拒绝执行的斜杠命令名称。与最终命令名称进行不区分大小写的匹配（对于扩展命令，这是消除歧义后的形式，例如 `myext.deploy`）。**跨作用域合并为并集**，因此工作区设置可以添加但不能移除用户或系统设置中定义的条目。 | `undefined` |

相同的拒绝列表也可以通过 `--disabled-slash-commands` CLI 标志（逗号分隔或重复）和 `QWEN_DISABLED_SLASH_COMMANDS` 环境变量提供；来自所有三个来源的值将合并为并集。

**示例 —— 为沙盒化部署锁定内置命令：**

```json
{
  "slashCommands": {
    "disabled": ["auth", "mcp", "extensions", "ide", "quit"]
  }
}
```

在系统级 `settings.json`（`/etc/qwen-code/settings.json` 或 `QWEN_CODE_SYSTEM_SETTINGS_PATH`）中配置这些值后，用户无法从其自身作用域缩小拒绝列表，且禁用的命令不会出现在自动补全中，输入时也不会执行。

> [!note]
> 此设置仅控制斜杠命令（例如 `/auth`、`/mcp`）。它不影响工具权限 —— 请参阅 `permissions.deny`。它也不会拦截 `Ctrl+C` 或 `Esc` 等键盘快捷键。

#### mcp

| 设置             | 类型             | 说明                                                                                                                                                                                                                                                                  | 默认值     |
| ------------------- | ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- |
| `mcp.serverCommand` | string           | 启动 MCP 服务器的命令。                                                                                                                                                                                                                                              | `undefined` |
| `mcp.allowed`       | array of strings | 允许使用的 MCP 服务器允许列表。允许你指定应向模型提供的一组 MCP 服务器名称。这可用于限制要连接的 MCP 服务器集合。请注意，如果设置了 `--allowed-mcp-server-names`，此设置将被忽略。 | `undefined` |
| `mcp.excluded`      | array of strings | 要排除的 MCP 服务器拒绝列表。同时列在 `mcp.excluded` 和 `mcp.allowed` 中的服务器将被排除。请注意，如果设置了 `--allowed-mcp-server-names`，此设置将被忽略。                                                                                           | `undefined` |

> [!note]
>
> **MCP 服务器的安全说明：** 这些设置使用简单的字符串匹配来匹配 MCP 服务器名称，该名称可被修改。如果你是希望防止用户绕过此限制的系统管理员，请考虑在系统设置级别配置 `mcpServers`，这样用户将无法配置自己的任何 MCP 服务器。这不应被视为绝对的安全机制。

#### lsp

> [!warning]
> **实验性功能**：LSP 支持目前处于实验阶段，默认禁用。请使用 `--experimental-lsp` 命令行标志启用它。

语言服务器协议（LSP）提供代码智能功能，如转到定义、查找引用和诊断。

LSP 服务器配置通过项目根目录中的 `.lsp.json` 文件完成，而非通过 `settings.json`。有关配置详情和示例，请参阅 [LSP 文档](../features/lsp)。

#### security

| 设置                        | 类型    | 说明                                       | 默认值     |
| ------------------------------ | ------- | ------------------------------------------------- | ----------- |
| `security.folderTrust.enabled` | boolean | 用于跟踪是否启用文件夹信任的设置。 | `false`     |
| `security.auth.selectedType`   | string  | 当前选择的身份验证类型。       | `undefined` |
| `security.auth.enforcedType`   | string  | 必需的身份验证类型（适用于企业）。  | `undefined` |
| `security.auth.useExternal`    | boolean | 是否使用外部身份验证流程。   | `undefined` |

#### advanced

| 设置                        | 类型             | 说明                                                                                                                                                                                                                                                                                                                        | 默认值                  |
| ------------------------------ | ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------ |
| `advanced.autoConfigureMemory` | boolean          | 自动配置 Node.js 内存限制。                                                                                                                                                                                                                                                                                     | `false`                  |
| `advanced.dnsResolutionOrder`  | string           | DNS 解析顺序。                                                                                                                                                                                                                                                                                                          | `undefined`              |
| `advanced.excludedEnvVars`     | array of strings | 要从项目上下文中排除的环境变量。指定不应从项目 `.env` 文件加载的环境变量。这可以防止项目特定的环境变量（如 `DEBUG=true`）干扰 CLI 行为。来自 `.qwen/.env` 文件的变量永远不会被排除。 | `["DEBUG","DEBUG_MODE"]` |
| `advanced.bugCommand`          | object           | 错误报告命令的配置。覆盖 `/bug` 命令的默认 URL。属性：`urlTemplate`（字符串）：可包含 `{title}` 和 `{info}` 占位符的 URL。示例：`"bugCommand": { "urlTemplate": "https://bug.example.com/new?title={title}&info={info}" }`                                    | `undefined`              |

#### mcpServers

配置与一个或多个模型上下文协议（MCP）服务器的连接，用于发现和使用自定义工具。Qwen Code 会尝试连接到每个配置的 MCP 服务器以发现可用工具。如果多个 MCP 服务器公开同名的工具，工具名称将使用你在配置中定义的服务器别名作为前缀（例如 `serverAlias__actualToolName`）以避免冲突。请注意，系统可能会出于兼容性目的从 MCP 工具定义中剥离某些 schema 属性。必须提供 `command`、`url` 或 `httpUrl` 中的至少一个。如果指定了多个，优先级顺序为 `httpUrl`，然后是 `url`，最后是 `command`。

| 属性                                | 类型             | 说明                                                                                                                                                                                                                                                        | 可选 |
| --------------------------------------- | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------- |
| `mcpServers.<SERVER_NAME>.command`      | string           | 通过标准 I/O 启动 MCP 服务器要执行的命令。                                                                                                                                                                                                   | 是      |
| `mcpServers.<SERVER_NAME>.args`         | array of strings | 传递给命令的参数。                                                                                                                                                                                                                                  | 是      |
| `mcpServers.<SERVER_NAME>.env`          | object           | 为服务器进程设置的环境变量。                                                                                                                                                                                                               | 是      |
| `mcpServers.<SERVER_NAME>.cwd`          | string           | 启动服务器的工作目录。                                                                                                                                                                                                                | 是      |
| `mcpServers.<SERVER_NAME>.url`          | string           | 使用服务器发送事件（SSE）进行通信的 MCP 服务器的 URL。                                                                                                                                                                                     | 是      |
| `mcpServers.<SERVER_NAME>.httpUrl`      | string           | 使用可流式传输的 HTTP 进行通信的 MCP 服务器的 URL。                                                                                                                                                                                              | 是      |
| `mcpServers.<SERVER_NAME>.headers`      | object           | 随请求发送到 `url` 或 `httpUrl` 的 HTTP 标头映射。                                                                                                                                                                                                 | 是      |
| `mcpServers.<SERVER_NAME>.timeout`      | number           | 对此 MCP 服务器请求的超时时间（毫秒）。                                                                                                                                                                                                           | 是      |
| `mcpServers.<SERVER_NAME>.trust`        | boolean          | 信任此服务器并绕过所有工具调用确认。                                                                                                                                                                                                          | 是      |
| `mcpServers.<SERVER_NAME>.description`  | string           | 服务器的简要描述，可用于显示目的。                                                                                                                                                                                         | 是      |
| `mcpServers.<SERVER_NAME>.includeTools` | array of strings | 要从此 MCP 服务器包含的工具名称列表。指定后，仅此处列出的工具从此服务器可用（允许列表行为）。如果未指定，默认启用服务器的所有工具。                                        | 是      |
| `mcpServers.<SERVER_NAME>.excludeTools` | array of strings | 要从此 MCP 服务器排除的工具名称列表。此处列出的工具将不可用于模型，即使服务器已公开它们。**注意：** `excludeTools` 优先级高于 `includeTools` —— 如果工具同时出现在两个列表中，将被排除。 | 是      |

#### telemetry

配置 Qwen Code 的日志记录和指标收集。有关更多信息，请参阅 [遥测](/developers/development/telemetry)。

| 设置                  | 类型    | 说明                                                                      | 默认值 |
| ------------------------ | ------- | -------------------------------------------------------------------------------- | ------- |
| `telemetry.enabled`      | boolean | 是否启用遥测。                                             |         |
| `telemetry.target`       | string  | 收集遥测的目标。支持的值包括 `local` 和 `gcp`。 |         |
| `telemetry.otlpEndpoint` | string  | OTLP 导出器的端点。                                              |         |
| `telemetry.otlpProtocol` | string  | OTLP 导出器的协议（`grpc` 或 `http`）。                           |         |
| `telemetry.logPrompts`   | boolean | 是否在日志中包含用户提示的内容。               |         |
| `telemetry.outfile`      | string  | 当 `target` 为 `local` 时写入遥测的文件。                         |         |
| `telemetry.useCollector` | boolean | 是否使用外部 OTLP 收集器。                                       |         |

### `settings.json` 示例

以下是具有嵌套结构的 `settings.json` 文件示例（自 v0.3.0 起新增）：

```
{
  "proxy": "http://localhost:7890",
  "general": {
    "vimMode": true,
    "preferredEditor": "code"
  },
  "ui": {
    "theme": "GitHub",
    "hideTips": false,
    "customWittyPhrases": [
      "You forget a thousand things every day. Make sure this is one of 'em",
      "Connecting to AGI"
    ]
  },
  "tools": {
    "approvalMode": "yolo",
    "sandbox": "docker",
    "sandboxImage": "ghcr.io/qwenlm/qwen-code:0.14.1",
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

CLI 会保留你运行的 shell 命令历史记录。为避免不同项目之间的冲突，此历史记录存储在你用户主文件夹内的项目特定目录中。

- **位置：** `~/.qwen/tmp/<project_hash>/shell_history`
  - `<project_hash>` 是根据项目根路径生成的唯一标识符。
  - 历史记录存储在名为 `shell_history` 的文件中。

## 环境变量与 `.env` 文件

环境变量是配置应用程序的常用方式，尤其适用于敏感信息（如 token）或可能在不同环境之间更改的设置。

Qwen Code 可以自动从 `.env` 文件加载环境变量。
有关身份验证相关的变量（如 `OPENAI_*`）和推荐的 `.qwen/.env` 方法，请参阅 **[身份验证](../configuration/auth)**。

> [!tip]
>
> **环境变量排除：** 某些环境变量（如 `DEBUG` 和 `DEBUG_MODE`）默认会自动从项目 `.env` 文件中排除，以防止干扰 CLI 行为。来自 `.qwen/.env` 文件的变量永远不会被排除。你可以在 `settings.json` 文件中使用 `advanced.excludedEnvVars` 设置自定义此行为。

### 环境变量表

| 变量                       | 说明                                                                                                                                                                                                                                                                       | 备注                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `QWEN_TELEMETRY_ENABLED`       | 设置为 `true` 或 `1` 以启用遥测。任何其他值均视为禁用。                                                                                                                                                                                             | 覆盖 `telemetry.enabled` 设置。                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `QWEN_TELEMETRY_TARGET`        | 设置遥测目标（`local` 或 `gcp`）。                                                                                                                                                                                                                                     | 覆盖 `telemetry.target` 设置。                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `QWEN_TELEMETRY_OTLP_ENDPOINT` | 设置遥测的 OTLP 端点。                                                                                                                                                                                                                                             | 覆盖 `telemetry.otlpEndpoint` 设置。                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `QWEN_TELEMETRY_OTLP_PROTOCOL` | 设置 OTLP 协议（`grpc` 或 `http`）。                                                                                                                                                                                                                                        | 覆盖 `telemetry.otlpProtocol` 设置。                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `QWEN_TELEMETRY_LOG_PROMPTS`   | 设置为 `true` 或 `1` 以启用或禁用用户提示日志记录。任何其他值均视为禁用。                                                                                                                                                                    | 覆盖 `telemetry.logPrompts` 设置。                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `QWEN_TELEMETRY_OUTFILE`       | 当目标为 `local` 时，设置写入遥测的文件路径。                                                                                                                                                                                                              | 覆盖 `telemetry.outfile` 设置。                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `QWEN_TELEMETRY_USE_COLLECTOR` | 设置为 `true` 或 `1` 以启用或禁用外部 OTLP 收集器。任何其他值均视为禁用。                                                                                                                                                           | 覆盖 `telemetry.useCollector` 设置。                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `QWEN_SANDBOX`                 | `settings.json` 中 `sandbox` 设置的替代方案。                                                                                                                                                                                                                          | 接受 `true`、`false`、`docker`、`podman` 或自定义命令字符串。                                                                                                                                                                                                                                                                                                                                                                                                           |
| `QWEN_SANDBOX_IMAGE`           | 覆盖 Docker/Podman 的沙盒镜像选择。                                                                                                                                                                                                                              | 优先级高于 `tools.sandboxImage`。                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `SEATBELT_PROFILE`             | （macOS 专用）切换 macOS 上的 Seatbelt（`sandbox-exec`）配置文件。                                                                                                                                                                                                         | `permissive-open`：（默认）限制对项目文件夹（及其他少数文件夹，请参阅 `packages/cli/src/utils/sandbox-macos-permissive-open.sb`）的写入，但允许其他操作。`strict`：使用默认拒绝操作的严格配置文件。`<profile_name>`：使用自定义配置文件。要定义自定义配置文件，请在项目的 `.qwen/` 目录中创建名为 `sandbox-macos-<profile_name>.sb` 的文件（例如 `my-project/.qwen/sandbox-macos-custom.sb`）。 |
| `DEBUG` 或 `DEBUG_MODE`        | （通常由底层库或 CLI 本身使用）设置为 `true` 或 `1` 以启用详细调试日志记录，有助于故障排查。                                                                                                                            | **注意：** 这些变量默认会自动从项目 `.env` 文件中排除，以防止干扰 CLI 行为。如果需要专门为 Qwen Code 设置这些变量，请使用 `.qwen/.env` 文件。                                                                                                                                                                                                                                                               |
| `NO_COLOR`                     | 设置为任意值以禁用 CLI 中的所有颜色输出。                                                                                                                                                                                                                          |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `CLI_TITLE`                    | 设置为字符串以自定义 CLI 的标题。                                                                                                                                                                                                                                |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `CODE_ASSIST_ENDPOINT`         | 指定代码辅助服务器的端点。                                                                                                                                                                                                                                | 适用于开发和测试。                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `QWEN_CODE_MAX_OUTPUT_TOKENS`  | 覆盖每次响应的默认最大输出 token 数。未设置时，Qwen Code 使用自适应策略：从 8K token 开始，如果响应被截断则自动重试 64K。将其设置为特定值（例如 `16000`）以使用固定限制。    | 优先级高于 capped 默认值（8K），但会被设置中的 `samplingParams.max_tokens` 覆盖。设置后将禁用自动升级。示例：`export QWEN_CODE_MAX_OUTPUT_TOKENS=16000`                                                                                                                                                                                                                                                                            |
| `QWEN_CODE_UNATTENDED_RETRY`   | 设置为 `true` 或 `1` 以启用持久重试模式。启用后，瞬态 API 容量错误（HTTP 429 速率限制和 529 过载）将使用指数退避（每次重试上限 5 分钟）无限重试，并在 stderr 上每 30 秒发送心跳保活。 | 专为 CI/CD 管道和后台自动化设计，使长时间运行的任务能够抵御临时 API 中断。必须显式设置 —— 仅 `CI=true` **不会**激活此模式。有关详情，请参阅 [无头模式](../features/headless#persistent-retry-mode)。示例：`export QWEN_CODE_UNATTENDED_RETRY=1`                                                                                                                                                        |
| `QWEN_CODE_PROFILE_STARTUP`    | 设置为 `1` 以启用启动性能分析。将 JSON 计时报告写入 `~/.qwen/startup-perf/`，包含各阶段耗时。                                                                                                                                              | 仅在沙盒子进程内生效。未设置时零开销。示例：`export QWEN_CODE_PROFILE_STARTUP=1`                                                                                                                                                                                                                                                                                                                                                            |

## 命令行参数

运行 CLI 时直接传入的参数可以覆盖该特定会话的其他配置。

对于沙盒镜像选择，优先级顺序为：
`--sandbox-image` > `QWEN_SANDBOX_IMAGE` > `tools.sandboxImage` > 内置默认镜像。

### 命令行参数表

| 参数                     | 别名 | 说明                                                                                                                                                                                                                                  | 可能值                        | 备注                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| ---------------------------- | ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--model`                    | `-m`  | 指定此会话使用的 Qwen 模型。                                                                                                                                                                                            | 模型名称                             | 示例：`npm start -- --model qwen3-coder-plus`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `--prompt`                   | `-p`  | 用于直接将提示传递给命令。这会以非交互模式调用 Qwen Code。                                                                                                                                             | 你的提示文本                       | 有关脚本示例，请使用 `--output-format json` 标志获取结构化输出。                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `--prompt-interactive`       | `-i`  | 使用提供的提示作为初始输入启动交互式会话。                                                                                                                                                                 | 你的提示文本                       | 提示在交互式会话中处理，而非在之前处理。不能与从 stdin 管道输入一起使用。示例：`qwen -i "explain this code"`                                                                                                                                                                                                                                                                                                                                                                                                      |
| `--system-prompt`            |       | 覆盖此运行的内置主会话系统提示。                                                                                                                                                                              | 你的提示文本                       | 加载的上下文文件（如 `QWEN.md`）仍会追加到此覆盖之后。可与 `--append-system-prompt` 结合使用。                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `--append-system-prompt`     |       | 为此运行的主会话系统提示追加额外指令。                                                                                                                                                                   | 你的提示文本                       | 在内置提示和加载的上下文文件之后应用。可与 `--system-prompt` 结合使用。有关示例，请参阅 [无头模式](../features/headless)。                                                                                                                                                                                                                                                                                                                                                                                                     |
| `--output-format`            | `-o`  | 指定非交互模式下 CLI 输出的格式。                                                                                                                                                                             | `text`, `json`, `stream-json`          | `text`：（默认）标准人类可读输出。`json`：执行结束时发出的机器可读 JSON 输出。`stream-json`：执行期间流式传输的 JSON 消息。对于结构化输出和脚本编写，请使用 `--output-format json` 或 `--output-format stream-json` 标志。有关详细信息，请参阅 [无头模式](../features/headless)。                                                                                                                                                                     |
| `--input-format`             |       | 指定从标准输入消费的格式。                                                                                                                                                                                           | `text`, `stream-json`                  | `text`：（默认）来自 stdin 或命令行参数的标准文本输入。`stream-json`：通过 stdin 进行双向通信的 JSON 消息协议。要求：`--input-format stream-json` 需要设置 `--output-format stream-json`。使用 `stream-json` 时，stdin 保留用于协议消息。有关详细信息，请参阅 [无头模式](../features/headless)。                                                                                                                                                                  |
| `--include-partial-messages` |       | 使用 `stream-json` 输出格式时包含部分助手消息。启用后，会在流式传输期间发出流事件（message_start、content_block_delta 等）。                                                      |                                        | 默认：`false`。要求：需要设置 `--output-format stream-json`。有关流事件的详细信息，请参阅 [无头模式](../features/headless)。                                                                                                                                                                                                                                                                                                                                                                                        |
| `--sandbox`                  | `-s`  | 为此会话启用沙盒模式。                                                                                                                                                                                                       |                                        |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `--sandbox-image`            |       | 设置沙盒镜像 URI。                                                                                                                                                                                                                  |                                        |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `--debug`                    | `-d`  | 为此会话启用调试模式，提供更详细的输出。                                                                                                                                                                          |                                        |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `--all-files`                | `-a`  | 如果设置，递归包含当前目录中的所有文件作为提示的上下文。                                                                                                                                               |                                        |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `--help`                     | `-h`  | 显示有关命令行参数的帮助信息。                                                                                                                                                                                      |                                        |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `--show-memory-usage`        |       | 显示当前内存使用情况。                                                                                                                                                                                                           |                                        |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `--yolo`                     |       | 启用 YOLO 模式，自动批准所有工具调用。                                                                                                                                                                              |                                        |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `--approval-mode`            |       | 设置工具调用的批准模式。                                                                                                                                                                                                       | `plan`, `default`, `auto-edit`, `yolo` | 支持的模式：`plan`：仅分析 —— 不修改文件或执行命令。`default`：文件编辑或 shell 命令需要批准（默认行为）。`auto-edit`：自动批准编辑工具（edit、write_file），同时提示其他工具。`yolo`：自动批准所有工具调用（等同于 `--yolo`）。不能与 `--yolo` 一起使用。请使用 `--approval-mode=yolo` 替代 `--yolo` 以获得新的统一方法。示例：`qwen --approval-mode auto-edit`<br>有关更多信息，请参阅 [批准模式](../features/approval-mode)。 |
| `--allowed-tools`            |       | 绕过确认对话框的工具名称逗号分隔列表。                                                                                                                                                               | 工具名称                             | 示例：`qwen --allowed-tools "Shell(git status)"`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `--disabled-slash-commands`  |       | 要隐藏/禁用的斜杠命令名称（逗号分隔或重复）。与 `slashCommands.disabled` 设置和 `QWEN_DISABLED_SLASH_COMMANDS` 环境变量合并。与最终命令名称进行不区分大小写的匹配。 | 命令名称                          | 示例：`qwen --disabled-slash-commands "auth,mcp,extensions"`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `--telemetry`                |       | 启用 [遥测](/developers/development/telemetry)。                                                                                                                                                                                      |                                        |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `--telemetry-target`         |       | 设置遥测目标。                                                                                                                                                                                                                   |                                        | 有关更多信息，请参阅 [遥测](/developers/development/telemetry)。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `--telemetry-otlp-endpoint`  |       | 设置遥测的 OTLP 端点。                                                                                                                                                                                                        |                                        | 有关更多信息，请参阅 [遥测](../../developers/development/telemetry)。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `--telemetry-otlp-protocol`  |       | 设置遥测的 OTLP 协议（`grpc` 或 `http`）。                                                                                                                                                                                     |                                        | 默认为 `grpc`。有关更多信息，请参阅 [遥测](../../developers/development/telemetry)。                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `--telemetry-log-prompts`    |       | 启用提示日志记录以用于遥测。                                                                                                                                                                                                    |                                        | 有关更多信息，请参阅 [遥测](../../developers/development/telemetry)。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `--checkpointing`            |       | 启用 [检查点](../features/checkpointing)。                                                                                                                                                                                          |                                        |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `--acp`                      |       | 启用 ACP 模式（Agent Client Protocol）。适用于 IDE/编辑器集成，如 [Zed](../integration-zed)。                                                                                                                                 |                                        | 稳定版。替代已弃用的 `--experimental-acp` 标志。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `--experimental-lsp`         |       | 启用实验性 [LSP（语言服务器协议）](../features/lsp) 功能，用于代码智能（转到定义、查找引用、诊断等）。                                                                                 |                                        | 实验性。需要安装语言服务器。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `--extensions`               | `-e`  | 指定此会话使用的扩展列表。                                                                                                                                                                                       | 扩展名称                        | 如果未提供，则使用所有可用扩展。使用特殊术语 `qwen -e none` 可禁用所有扩展。示例：`qwen -e my-extension -e my-other-extension`                                                                                                                                                                                                                                                                                                                                                                                        |
| `--list-extensions`          | `-l`  | 列出所有可用扩展并退出。                                                                                                                                                                                                    |                                        |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `--proxy`                    |       | 设置 CLI 的代理。                                                                                                                                                                                                                  | 代理 URL                              | 示例：`--proxy http://localhost:7890`。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `--include-directories`      |       | 在工作区中包含附加目录以支持多目录。                                                                                                                                                                | 目录路径                        | 可多次指定或作为逗号分隔值。最多可添加 5 个目录。示例：`--include-directories /path/to/project1,/path/to/project2` 或 `--include-directories /path/to/project1 --include-directories /path/to/project2`                                                                                                                                                                                                                                                                                                  |
| `--screen-reader`            |       | 启用屏幕阅读器模式，调整 TUI 以更好地兼容屏幕阅读器。                                                                                                                                              |                                        |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `--version`                  |       | 显示 CLI 的版本。                                                                                                                                                                                                             |                                        |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `--openai-logging`           |       | 启用 OpenAI API 调用日志记录，用于调试和分析。                                                                                                                                                                              |                                        | 此标志覆盖 `settings.json` 中的 `enableOpenAILogging` 设置。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `--openai-logging-dir`       |       | 设置 OpenAI API 日志的自定义目录路径。                                                                                                                                                                                            | 目录路径                         | 此标志覆盖 `settings.json` 中的 `openAILoggingDir` 设置。支持绝对路径、相对路径和 `~` 展开。示例：`qwen --openai-logging-dir "~/qwen-logs" --openai-logging`                                                                                                                                                                                                                                                                                                                                                          |

## 上下文文件（分层指令上下文）

虽然严格来说不是 CLI _行为_ 的配置，但上下文文件（默认为 `QWEN.md`，但可通过 `context.fileName` 设置配置）对于配置 _指令上下文_（也称为“记忆”）至关重要。此强大功能允许你向 AI 提供项目特定的指令、编码风格指南或任何相关背景信息，使其响应更贴合你的需求且更准确。CLI 包含 UI 元素，例如页脚中显示已加载上下文文件数量的指示器，以便你了解当前活动的上下文。

- **目的：** 这些 Markdown 文件包含你希望 Qwen 模型在交互过程中知晓的指令、指南或上下文。该系统旨在分层管理此指令上下文。

### 上下文文件内容示例（例如 `QWEN.md`）

以下是 TypeScript 项目根目录下上下文文件可能包含的概念示例：

```
# Project: My Awesome TypeScript Library

## General Instructions:
- When generating new TypeScript code, please follow the existing coding style.
- Ensure all new functions and classes have JSDoc comments.
- Prefer functional programming paradigms where appropriate.
- All code should be compatible with TypeScript 5.0 and Node.js 20+.

## Coding Style:
- Use 2 spaces for indentation.
- Interface names should be prefixed with `I` (e.g., `IUserService`).
- Private class members should be prefixed with an underscore (`_`).
- Always use strict equality (`===` and `!==`).

## Specific Component: `src/api/client.ts`
- This file handles all outbound API requests.
- When adding new API call functions, ensure they include robust error handling and logging.
- Use the existing `fetchWithRetry` utility for all GET requests.

## Regarding Dependencies:
- Avoid introducing new external dependencies unless absolutely necessary.
- If a new dependency is required, please state the reason.
```

此示例展示了如何提供通用项目上下文、特定编码约定，甚至关于特定文件或组件的说明。你的上下文文件越相关、越精确，AI 就能越好地协助你。强烈建议使用项目特定的上下文文件来建立约定和上下文。

- **分层加载与优先级：** CLI 通过从多个位置加载上下文文件（例如 `QWEN.md`）实现分层记忆系统。此列表中较低位置（更具体）的文件内容通常会覆盖或补充较高位置（更通用）的文件内容。确切的连接顺序和最终上下文可使用 `/memory show` 命令检查。典型的加载顺序为：
  1. **全局上下文文件：**
     - 位置：`~/.qwen/<configured-context-filename>`（例如用户主目录中的 `~/.qwen/QWEN.md`）。
     - 作用范围：为所有项目提供默认指令。
  2. **项目根目录及祖先目录上下文文件：**
     - 位置：CLI 会在当前工作目录中搜索配置的上下文文件，然后向上搜索每个父目录，直到项目根目录（由 `.git` 文件夹标识）或你的主目录。
     - 作用范围：提供与整个项目或项目重要部分相关的上下文。
- **连接与 UI 指示：** 所有找到的上下文文件的内容会被连接起来（带有指示其来源和路径的分隔符），并作为系统提示的一部分提供。CLI 页脚显示已加载上下文文件的数量，为你提供关于活动指令上下文的快速视觉提示。
- **导入内容：** 你可以使用 `@path/to/file.md` 语法导入其他 Markdown 文件来模块化上下文文件。有关更多详情，请参阅 [记忆导入处理器文档](../configuration/memory)。
- **记忆管理命令：**
  - 使用 `/memory refresh` 强制重新扫描并从所有配置位置重新加载所有上下文文件。这将更新 AI 的指令上下文。
  - 使用 `/memory show` 显示当前加载的组合指令上下文，允许你验证 AI 使用的层次结构和内容。
  - 有关 `/memory` 命令及其子命令（`show` 和 `refresh`）的完整详情，请参阅 [命令文档](../features/commands)。

通过了解并利用这些配置层以及上下文文件的分层特性，你可以有效管理 AI 的记忆，并根据你的特定需求和项目定制 Qwen Code 的响应。

## 沙盒

Qwen Code 可以在沙盒环境中执行潜在的不安全操作（如 shell 命令和文件修改），以保护你的系统。

[沙盒](../features/sandbox) 默认处于禁用状态，但你可以通过以下几种方式启用它：

- 使用 `--sandbox` 或 `-s` 标志。
- 设置 `QWEN_SANDBOX` 环境变量。
- 默认情况下，使用 `--yolo` 或 `--approval-mode=yolo` 时会启用沙盒。

默认情况下，它使用预构建的 `qwen-code-sandbox` Docker 镜像。

对于项目特定的沙盒需求，你可以在项目根目录创建自定义 Dockerfile：`.qwen/sandbox.Dockerfile`。此 Dockerfile 可以基于基础沙盒镜像：

```
FROM qwen-code-sandbox
# Add your custom dependencies or configurations here
# For example:
# RUN apt-get update && apt-get install -y some-package
# COPY ./my-config /app/my-config
```

当 `.qwen/sandbox.Dockerfile` 存在时，你可以在运行 Qwen Code 时使用 `BUILD_SANDBOX` 环境变量来自动构建自定义沙盒镜像：

```
BUILD_SANDBOX=1 qwen -s
```

## 使用统计

为了帮助我们改进 Qwen Code，我们会收集匿名使用统计信息。这些数据有助于我们了解 CLI 的使用方式、识别常见问题并优先开发新功能。

**我们收集的内容：**

- **工具调用：** 我们记录被调用的工具名称、成功或失败状态以及执行耗时。我们不会收集传递给工具的参数或工具返回的任何数据。
- **API 请求：** 我们记录每次请求使用的模型、请求持续时间以及是否成功。我们不会收集提示或响应的内容。
- **会话信息：** 我们收集有关 CLI 配置的信息，例如启用的工具和批准模式。

**我们不收集的内容：**

- **个人身份信息（PII）：** 我们不会收集任何个人信息，如你的姓名、电子邮件地址或 API 密钥。
- **提示和响应内容：** 我们不会记录你的提示内容或模型的响应内容。
- **文件内容：** 我们不会记录 CLI 读取或写入的任何文件的内容。

**如何退出：**

你可以随时通过在 `settings.json` 文件的 `privacy` 类别下将 `usageStatisticsEnabled` 属性设置为 `false` 来退出使用统计信息收集：

```
{
  "privacy": {
    "usageStatisticsEnabled": false
  }
}
```

> [!note]
>
> 启用使用统计信息后，事件将发送到阿里云 RUM 收集端点。