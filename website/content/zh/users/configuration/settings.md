# Qwen Code 配置

> [!tip]
>
> **身份验证 / API 密钥：** 身份验证（API Key、阿里云 Coding 计划）及相关的身份验证环境变量（如 `OPENAI_API_KEY`）已在 **[身份验证](../configuration/auth)** 中详细说明。

> [!note]
>
> **关于新配置格式的说明**：`settings.json` 文件的格式已更新为更清晰的新结构。旧格式将自动迁移。
> Qwen Code 提供多种配置其行为的方式，包括环境变量、命令行参数和设置文件。本文档概述了不同的配置方法和可用的设置项。

## 配置层级

配置按以下优先级顺序应用（较低数字会被较高数字覆盖）：

| 层级 | 配置来源 | 描述 |
| ----- | ---------------------- | ------------------------------------------------------------------------------- |
| 1 | 默认值 | 应用程序内硬编码的默认值 |
| 2 | 系统默认文件 | 系统范围的默认设置，可被其他设置文件覆盖 |
| 3 | 用户设置文件 | 当前用户的全局设置 |
| 4 | 项目设置文件 | 特定于项目的设置 |
| 5 | 系统设置文件 | 覆盖所有其他设置文件的系统范围设置 |
| 6 | 环境变量 | 系统范围或特定于会话的变量，可能从 `.env` 文件加载 |
| 7 | 命令行参数 | 启动 CLI 时传入的值 |

## 设置文件

Qwen Code 使用 JSON 设置文件进行持久化配置。这些文件有四个存放位置：

| 文件类型 | 位置 | 作用域 |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 系统默认文件 | Linux: `/etc/qwen-code/system-defaults.json`<br>Windows: `C:\ProgramData\qwen-code\system-defaults.json`<br>macOS: `/Library/Application Support/QwenCode/system-defaults.json` <br>可使用 `QWEN_CODE_SYSTEM_DEFAULTS_PATH` 环境变量覆盖此路径。 | 提供系统范围默认设置的基础层。这些设置优先级最低，旨在被用户、项目或系统覆盖设置所取代。 |
| 用户设置文件 | `~/.qwen/settings.json`（其中 `~` 为你的主目录）。 | 应用于当前用户的所有 Qwen Code 会话。 |
| 项目设置文件 | 项目根目录下的 `.qwen/settings.json`。 | 仅在从该特定项目运行 Qwen Code 时应用。项目设置会覆盖用户设置。 |
| 系统设置文件 | Linux： `/etc/qwen-code/settings.json` <br>Windows: `C:\ProgramData\qwen-code\settings.json` <br>macOS: `/Library/Application Support/QwenCode/settings.json`<br>可使用 `QWEN_CODE_SYSTEM_SETTINGS_PATH` 环境变量覆盖此路径。 | 应用于系统上所有用户的所有 Qwen Code 会话。系统设置会覆盖用户和项目设置。企业系统管理员可使用此功能来控制用户的 Qwen Code 配置。 |

> [!note]
>
> **关于设置中环境变量的说明**：`settings.json` 文件中的字符串值可以使用 `$VAR_NAME` 或 `${VAR_NAME}` 语法引用环境变量。加载设置时会自动解析这些变量。例如，如果你有一个环境变量 `MY_API_TOKEN`，可以在 `settings.json` 中这样使用它：`"apiKey": "$MY_API_TOKEN"`。

### 项目中的 `.qwen` 目录

除了项目设置文件外，项目的 `.qwen` 目录还可以包含与 Qwen Code 运行相关的其他特定于项目的文件，例如：

- [自定义沙盒配置文件](../features/sandbox)（例如 `.qwen/sandbox-macos-custom.sb`、`.qwen/sandbox.Dockerfile`）。
- `.qwen/skills/` 下的 [Agent Skills](../features/skills)（每个 Skill 是一个包含 `SKILL.md` 的目录）。

### 配置迁移

Qwen Code 会自动将旧版配置设置迁移到新格式。迁移前会备份旧的设置文件。以下设置已从否定命名（`disable*`）更改为肯定命名（`enable*`）：

| 旧设置 | 新设置 | 备注 |
| ---------------------------------------- | ------------------------------------------- | ---------------------------------- |
| `disableAutoUpdate` + `disableUpdateNag` | `general.enableAutoUpdate` | 合并为单一设置 |
| `disableLoadingPhrases` | `ui.accessibility.enableLoadingPhrases` | |
| `disableFuzzySearch` | `context.fileFiltering.enableFuzzySearch` | |
| `disableCacheControl` | `model.generationConfig.enableCacheControl` | |

> [!note]
>
> **布尔值反转**：迁移时，布尔值会被反转（例如，`disableAutoUpdate: true` 会变为 `enableAutoUpdate: false`）。

#### `disableAutoUpdate` 和 `disableUpdateNag` 的合并策略

当两个旧版设置同时存在且值不同时，迁移遵循以下策略：如果 `disableAutoUpdate` 或 `disableUpdateNag` 中**任意一个**为 `true`，则 `enableAutoUpdate` 变为 `false`：

| `disableAutoUpdate` | `disableUpdateNag` | 迁移后的 `enableAutoUpdate` |
| ------------------- | ------------------ | --------------------------- |
| `false` | `false` | `true` |
| `false` | `true` | `false` |
| `true` | `false` | `false` |
| `true` | `true` | `false` |

### `settings.json` 中的可用设置

设置按类别组织。大多数设置应放置在 `settings.json` 文件中对应的顶级类别对象内。少数顶级设置（如 `proxy` 和 `plansDirectory`）为了兼容性仍保留为直接的根键。

#### general

| 设置 | 类型 | 描述 | 默认值 |
| ------------------------------------------ | ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- |
| `general.preferredEditor` | string | 打开文件时首选的编辑器。 | `undefined` |
| `general.vimMode` | boolean | 启用 Vim 键绑定。 | `false` |
| `general.enableAutoUpdate` | boolean | 启用启动时的自动更新检查和安装。 | `true` |
| `general.showSessionRecap` | boolean | 离开终端后返回时，自动显示单行的“上次进度”回顾。默认关闭。无论此设置如何，均可使用 `/recap` 手动触发。 | `false` |
| `general.sessionRecapAwayThresholdMinutes` | number | 终端必须失去焦点多少分钟后，在重新获取焦点时才会触发自动回顾。仅在启用 `showSessionRecap` 时使用。 | `5` |
| `general.gitCoAuthor.commit` | boolean | 在 git commit 信息中添加 Co-authored-by 尾注，**并**为通过 Qwen Code 进行的提交附加按文件的 AI 归属 git note (`refs/notes/ai-attribution`)。禁用则跳过这两者。 | `true` |
| `general.gitCoAuthor.pr` | boolean | 运行 `gh pr create` 时，在 pull request 描述中追加 Qwen Code 归属行。 | `true` |
| `general.defaultFileEncoding` | string | 新文件的默认编码。使用 `"utf-8"`（默认）表示无 BOM 的 UTF-8，或使用 `"utf-8-bom"` 表示带 BOM 的 UTF-8。仅当项目明确要求 BOM 时才更改此项。 | `"utf-8"` |
| `general.cleanupPeriodDays` | number | 保留 `~/.qwen/file-history/` 会话备份的天数，供 `/rewind` 使用。超过此时间的备份将由后台任务清理，该任务每天最多运行一次。`0` = 最短保留时间（约 1 小时）：保留过去一小时内修改过的会话以及当前活动的会话。更改在重启后生效。 | `30` |
| `general.language` | enum | 用户界面语言。使用 `"auto"` 从系统设置检测，或使用语言代码（例如 `"zh-CN"`、`"fr"`）。可通过将 JS locale 文件放入 `~/.qwen/locales/` 来添加自定义代码。请参阅 [i18n](../features/language)。需要重启。 | `"auto"` |
| `general.outputLanguage` | string | 模型输出的语言。使用 `"auto"` 从系统设置检测，或设置特定语言。需要重启。 | `"auto"` |
| `general.dynamicCommandTranslation` | boolean | 启用动态斜杠命令描述的 AI 翻译。禁用时，动态命令保留其原始描述并跳过翻译模型调用。 | `false` |
| `general.terminalBell` | boolean | 当响应完成或需要批准时，播放终端提示音。 | `true` |
| `general.preventSystemSleep` | boolean | 在 Qwen Code 流式传输模型响应或执行工具时，防止系统休眠。空闲提示时间和权限提示不会阻止休眠。启动时读取一次，因此更改在重启后生效。 | `true` |
| `general.chatRecording` | boolean | 将聊天记录保存到磁盘。禁用此功能也会导致 `--continue` 和 `--resume` 无法工作。需要重启。 | `true` |

#### output

| 设置 | 类型 | 描述 | 默认值 | 可选值 |
| ----------------------- | ------- | -------------------------------------------------------------- | -------- | ------------------ |
| `output.format` | string | CLI 输出的格式。 | `"text"` | `"text"`, `"json"` |
| `output.showTimestamps` | boolean | 在每个助手响应前显示 `[HH:MM:SS]` 时间戳。 | `false` | |

#### ui

| 设置 | 类型 | 描述 | 默认值 |
| --------------------------------------- | ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------- |
| `ui.theme` | string | UI 的颜色主题。可用选项请参阅 [主题](../configuration/themes)。 | `"Qwen Dark"` |
| `ui.customThemes` | object | 自定义主题定义。 | `{}` |
| `ui.statusLine` | object | 自定义状态栏配置。支持 `command`、`refreshInterval`、`respectUserColors` 和 `hideContextIndicator` 选项。请参阅 [状态栏](../features/status-line)。 | `undefined` |
| `ui.hideWindowTitle` | boolean | 隐藏窗口标题栏。 | `false` |
| `ui.hideTips` | boolean | 隐藏 UI 中的所有提示（启动时和响应后）。请参阅 [上下文提示](../features/tips)。 | `false` |
| `ui.hideBanner` | boolean | 隐藏启动时的 ASCII 徽标和信息面板。除非同时设置 `ui.hideTips`，否则提示和聊天输入仍会渲染。 | `false` |
| `ui.customBannerTitle` | string | 替换信息面板中默认的 `>_ Qwen Code` 标题。`(vX.Y.Z)` 版本后缀始终会追加；身份验证、模型和路径行不受影响。经过清理；上限为 80 个字符。 | `""` |
| `ui.customBannerSubtitle` | string | 可选的副标题行，渲染在横幅标题和身份验证/模型行之间，替代空白间隔行。经过清理；上限为 160 个字符。为空（默认）则保留原始空白间隔。 | `""` |
| `ui.customAsciiArt` | string \| object | 替换横幅中的 QWEN ASCII 徽标。接受内联字符串（用于两个宽度层级）、`{ "path": "./brand.txt" }`（相对路径相对于所属设置文件的目录解析；在 POSIX 上使用 `O_NOFOLLOW` 启动时读取一次，上限 64 KB），或 `{ "small": ..., "large": ... }` 以进行宽度感知选择。经过清理；每个层级上限为 200 行 × 200 列。 | `undefined` |
| `ui.showLineNumbers` | boolean | 在 CLI 输出的代码块中显示行号。 | `true` |
| `ui.renderMode` | string | 默认 Markdown 显示模式。使用 `"render"` 获得丰富的视觉预览，或使用 `"raw"` 默认显示面向源码的 Markdown。在会话期间使用 `Alt/Option+M` 切换；在 macOS 上，终端必须将 Option 作为 Meta 发送。请参阅 [Markdown 渲染](../features/markdown-rendering)。 | `"render"` |
| `ui.showCitations` | boolean | 在聊天中显示生成文本的引用。 | `false` |
| `ui.history.collapseOnResume` | boolean | 恢复会话时是否默认折叠历史记录。可通过 `/history collapse-on-resume` 和 `/history expand-on-resume` 切换。 | `false` |
| `ui.history.collapsePreviewCount` | number | 启用 `ui.history.collapseOnResume` 时保持可见的最近用户轮次数。`0` 默认折叠所有恢复的历史记录；`-1` 显示所有恢复的历史记录。 | `0` |
| `ui.compactMode` | boolean | 隐藏工具输出和思考过程以获得更简洁的视图。在会话期间使用 `Ctrl+O` 或通过设置对话框切换。即使在紧凑模式下，工具批准提示也永远不会被隐藏。该设置跨会话持久化。 | `false` |
| `ui.shellOutputMaxLines` | number | 内联显示的 shell 输出最大行数。设置为 `0` 以禁用限制并显示完整输出。隐藏的行通过 `+N lines` 指示器显示。错误、`!` 前缀的用户发起命令、确认工具和聚焦的嵌入式 shell 始终显示完整输出。 | `5` |
| `ui.enableWelcomeBack` | boolean | 返回带有对话历史的项目时显示欢迎回来对话框。启用后，Qwen Code 将自动检测你是否返回到具有预先生成的项目摘要（`.qwen/PROJECT_SUMMARY.md`）的项目，并显示一个对话框，允许你继续之前的对话或重新开始。如果你选择 **Start new chat session**，该选择将被记住，直到项目摘要更改。此功能与 `/summary` 命令和退出确认对话框集成。 | `true` |
| `ui.accessibility.enableLoadingPhrases` | boolean | 启用加载提示语（为辅助功能禁用）。 | `true` |
| `ui.accessibility.screenReader` | boolean | 启用屏幕阅读器模式，调整 TUI 以更好地兼容屏幕阅读器。 | `false` |
| `ui.customWittyPhrases` | array of strings | 在加载状态下显示的自定义提示语列表。提供时，CLI 将循环显示这些提示语，而不是默认的提示语。 | `[]` |
| `ui.showResponseTokensPerSecond` | boolean | 在模型流式传输时，在响应 token 计数器旁显示实时的 tokens/sec 估算值。这是一个生成速度提示，不是 ETA 或完成百分比。在下一次会话中生效。 | `false` |
| `ui.enableFollowupSuggestions` | boolean | 启用 [后续建议](../features/followup-suggestions)，在模型响应后预测你接下来想输入的内容。建议显示为占位符文本，可通过 Tab、Enter 或 Right Arrow 接受（它们会填充输入框——不会自动提交）。默认开启；设置为 `false` 以退出。 | `true` |
| `ui.enableCacheSharing` | boolean | 对建议生成使用缓存感知的分叉查询。降低支持前缀缓存的提供商的成本（实验性）。 | `true` |
| `ui.enableSpeculation` | boolean | 在提交前推测性执行接受的建议。接受时结果会立即显示（实验性）。 | `false` |
| `ui.showStatusInTitle` | boolean | 在终端窗口标题中显示 Qwen Code 会话名称和状态。 | `true` |
| `ui.disableWorkflowKeywordTrigger` | boolean | 当为 `true` 时，在提示中提及 `workflow` 一词不再软性引导回合转向 Workflow 工具（并且 Footer 的 `workflow active` 指示器被抑制）。仅在启用 workflows 时适用。 | `false` |
| `ui.enableUserFeedback` | boolean | 在对话后显示可选的反馈对话框，以帮助提高 Qwen 性能。 | `true` |
| `ui.compactInline` | boolean | 在每个组内紧凑显示工具，而不是跨组合并。需要启用 `ui.compactMode`。需要重启。 | `false` |
| `ui.useTerminalBuffer` | boolean | 在应用内的可滚动视图中渲染对话历史，而不是终端回滚缓冲区。如果你在长会话中看到闪烁、滚动风暴或界面冻结，建议使用此功能。使用 `Shift+↑/↓`（行）、`PgUp`/`PgDn`（页）、`Ctrl+Home/End`（顶部/底部）或鼠标滚轮进行滚动。启用时不使用主机终端回滚；拖动时按住 `Shift`（或 macOS 上的 `Option`）以进行原生文本选择。 | `false` |
| `ui.hideBuiltinWorktreeIndicator` | boolean | 隐藏 Footer 中内置的 `⎇ worktree-<branch> (<slug>)` 行。worktree 状态仍通过 stdin payload 传递给自定义状态栏脚本。除非你的自定义状态栏自行渲染 worktree，否则请保持默认值。 | `false` |
#### ide

| 设置 | 类型 | 描述 | 默认值 |
| ------------------ | ------- | ---------------------------------------------------- | ------- |
| `ide.enabled`      | boolean | 启用 IDE 集成模式。                         | `false` |
| `ide.hasSeenNudge` | boolean | 用户是否已查看过 IDE 集成提示。 | `false` |

#### privacy

| 设置                          | 类型    | 描述                            | 默认值 |
| -------------------------------- | ------- | -------------------------------------- | ------- |
| `privacy.usageStatisticsEnabled` | boolean | 启用使用统计数据的收集。 | `true`  |

#### model

| 设置                                            | 类型    | 描述                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | 默认值     |
| -------------------------------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- |
| `model.name`                                       | string  | 用于对话的 Qwen 模型。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | `undefined` |
| `model.baseUrl`                                    | string  | 由模型选择器自动持久化，用于在多个 `modelProviders` 条目共享相同模型 id 时进行消歧。不建议手动设置——请使用 `/model` 选择器或 `modelProviders` 条目；过时的手动编辑值可能会将请求静默路由到具有相同 id 的不同提供商。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | `undefined` |
| `model.sessionTokenLimit`                          | number  | 发送下一条消息前允许记录的最大 prompt token 数量。`-1` 表示无限制；`0` 也被视为无限制（与 `model.maxToolCalls` 不同，后者 `0` 表示禁止所有调用）。当记录的 prompt 数量超过限制时，下一次发送将被丢弃（会话不会中止）。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | `-1`        |
| `model.maxSessionTurns`                            | number  | 会话中保留的 user/model/tool 轮次的最大数量。-1 表示无限制。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | `-1`        |
| `model.maxWallTimeSeconds`                         | number  | 无头/无人值守运行的挂钟时间预算，单位为秒。`-1` 表示无限制。可通过 `--max-wall-time` 在每次调用时覆盖，该参数需要正数时长（`90`、`30s`、`5m`、`1h`、`1.5h`）；最小值为 1 秒——小于 1 秒的值（`500ms`、`0.5`）会被视为拼写错误而拒绝。省略该标志将回退到此设置。超时时以退出码 55 中止。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | `-1`        |
| `model.maxToolCalls`                               | number  | 单次运行的累计工具调用预算（计算每次执行的工具，无论成功或失败；`--json-schema` 下的 `structured_output` 豁免）。`-1` 表示无限制；`0` 表示“不允许工具调用”。上限为 1,000,000 以防止拼写错误。可通过 `--max-tool-calls` 覆盖。超时时以退出码 55 中止。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | `-1`        |
| `model.generationConfig`                           | object  | 传递给底层内容生成器的高级覆盖配置。支持请求控制，如 `timeout`、`maxRetries`、`enableCacheControl`、`splitToolMedia`（默认 `true`；将工具返回的媒体——包括内置 read_file 读取的图像——拆分为后续的用户消息，而不是违反规范的 `role: "tool"` 消息，以便 doubao / new-api / LM Studio 等严格的 OpenAI 兼容服务器能够识别；设置为 `false` 可恢复旧版嵌入工具的行为）、`toolResultContentFormat`（默认 `"parts"`；仅当旧版 OpenAI 兼容运行时的工具模板忽略文本内容部分时设置为 `"string"`）、`contextWindowSize`（覆盖模型的上下文窗口大小）、`modalities`（覆盖自动检测的输入模态）、`customHeaders`（API 请求的自定义 HTTP 标头）和 `extra_body`（仅适用于 OpenAI 兼容 API 请求的额外 body 参数），以及 `samplingParams` 下的微调参数（例如 `temperature`、`top_p`、`max_tokens`）。保持未设置状态以依赖提供商默认值。 | `undefined` |
| `model.chatCompression.contextPercentageThreshold` | number  | **已移除。** 由 `context.autoCompactThreshold` 替代（参见下方 `#### context` 章节）。自动压缩现在使用三级阈值阶梯（warn / auto / hard），通过 `computeThresholds()` 函数根据模型的上下文窗口在内部计算。旧设置将被静默忽略（无启动警告）。有关重新设计的理由，请参阅 PR #4345 / `docs/design/auto-compaction-threshold-redesign.md`。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | `N/A`       |
| `model.chatCompression.maxRecentFilesToRetain`     | number  | 自动压缩后，将其当前内容恢复（如果较小则嵌入，否则通过路径引用）到历史记录中的最近修改的文件数量。`0` 表示不恢复。环境变量覆盖：`QWEN_COMPACT_MAX_RECENT_FILES`。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | `5`         |
| `model.chatCompression.maxRecentImagesToRetain`    | number  | 自动压缩后，恢复到历史记录中的最近图像（工具截图/用户粘贴）数量。`0` 表示不恢复。环境变量覆盖：`QWEN_COMPACT_MAX_RECENT_IMAGES`。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | `3`         |
| `model.chatCompression.enableScreenshotTrigger`    | boolean | 当为 `true` 时，一旦历史记录中累积的工具返回图像数量达到 `screenshotTriggerThreshold`，自动压缩也会触发，与 token 使用量无关——旨在针对频繁截图会分散模型注意力的 computer-use 会话。仅计算工具结果内返回的图像，不包括用户粘贴的图像。环境变量覆盖：`QWEN_COMPACT_SCREENSHOT_TRIGGER`（`1`/`true`/`0`/`false`）。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | `true`      |
| `model.chatCompression.screenshotTriggerThreshold` | number  | 触发截图触发器的工具返回图像数量阈值（仅在 `enableScreenshotTrigger` 为真时生效）。压缩会重置该计数——保留的图像会作为顶级部分重新嵌入，而触发器不会计算这些部分——因此不会立即再次触发。环境变量覆盖：`QWEN_COMPACT_SCREENSHOT_THRESHOLD`。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | `50`        |
| `model.skipNextSpeakerCheck`                       | boolean | 跳过下一次发言者检查。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | `true`      |
| `model.skipLoopDetection`                          | boolean | 禁用流式循环检测检查。默认为 `true`（跳过循环检测），以避免误报中断合法工作流。设置为 `false` 可重新启用流式循环检测——在无头/非交互式运行中作为安全护栏非常有用，否则卡住的重复会浪费预算。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | `true`      |
| `model.skipStartupContext`                         | boolean | 跳过在每个会话开始时发送启动工作区上下文（环境摘要和确认）。如果你倾向于手动提供上下文或希望在启动时节省 token，请启用此选项。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | `false`     |
| `model.enableOpenAILogging`                        | boolean | 启用 OpenAI API 调用的日志记录，用于调试和分析。启用后，API 请求和响应将记录到 JSON 文件中。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | `false`     |
| `model.openAILoggingDir`                           | string  | OpenAI API 日志的自定义目录路径。如果未指定，默认为当前工作目录下的 `logs/openai`。支持绝对路径、相对路径（从当前工作目录解析）和 `~` 展开（主目录）。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | `undefined` |
**Example model.generationConfig:**

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
      "toolResultContentFormat": "parts",
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

**max_tokens (output token limit):**

当未设置 `samplingParams.max_tokens` 和 `QWEN_CODE_MAX_OUTPUT_TOKENS` 时，Qwen Code 通常使用所选模型声明的输出限制作为请求的默认输出限制。如果响应仍然触及该限制，Qwen Code 可能会使用提升后的限制（下限为 64K）进行重试，并在后续续写轮次中恢复。

对于兼容 OpenAI 的提供商，`samplingParams` 也是一种透传参数的逃生舱：设置后，其键值将原样传递，Qwen Code 不会合成默认的 `max_tokens`。可用于传递特定提供商的参数，例如 `max_completion_tokens`。

若要强制使用固定的输出限制，请在设置中配置 `samplingParams.max_tokens` 或使用 `QWEN_CODE_MAX_OUTPUT_TOKENS` 环境变量。显式限制会禁用自动输出 token 升级机制。

**toolResultContentFormat:**

控制在兼容 OpenAI 的请求中，纯文本工具结果的序列化方式。默认值 `"parts"` 保持标准的 content-part 数组结构。仅当使用旧版兼容 OpenAI 的运行时（其工具模板会忽略文本 content parts，例如旧版 GLM-5.1 vLLM/SGLang 模板）时，才将其设置为 `"string"`。工具返回的媒体内容仍由 `splitToolMedia` 控制。

**contextWindowSize:**

覆盖所选模型的默认上下文窗口大小。Qwen Code 通过匹配模型名称使用内置默认值来确定上下文窗口，并带有一个固定的回退值。当提供商的实际上下文限制与 Qwen Code 的默认值不同时，请使用此设置。此值定义的是模型假设的最大上下文容量，而不是单次请求的 token 限制。

当所选模型在 `modelProviders` 中定义时，请在该提供商条目的 `generationConfig` 中设置
`contextWindowSize`，而不是在顶层的 `model.generationConfig` 中设置。提供商模型条目是封闭的，因此
顶层的生成设置不会填充缺失的提供商字段。

**modalities:**

覆盖所选模型自动检测到的输入模态。Qwen Code 基于模型名称模式匹配自动检测支持的模态（图像、PDF、音频、视频）。当自动检测不正确时（例如，为支持但未识别出 `pdf` 的模型启用 `pdf`），请使用此设置。格式：`{ "image": true, "pdf": true, "audio": true, "video": true }`。对于不支持的类型，请省略该键或将其设置为 `false`。

**customHeaders:**

允许你向所有 API 请求添加自定义 HTTP 标头。这对于请求追踪、监控、API 网关路由，或者不同模型需要不同标头的场景非常有用。对于提供商模型，请在 `modelProviders[].generationConfig.customHeaders` 中定义 `customHeaders`。对于没有匹配提供商条目的运行时模型，请在 `model.generationConfig.customHeaders` 中定义。这两个层级之间不会进行合并。

`extra_body` 字段允许你向发送到 API 的请求体中添加自定义参数。这对于标准配置字段未涵盖的特定提供商选项非常有用。**注意：此字段仅支持兼容 OpenAI 的提供商（`openai`、`qwen-oauth`）。对于 Anthropic 和 Gemini 提供商，此字段将被忽略。** 对于提供商模型，请在 `modelProviders[].generationConfig.extra_body` 中定义 `extra_body`。对于没有匹配提供商条目的运行时模型，请在 `model.generationConfig.extra_body` 中定义。

**model.openAILoggingDir examples:**

- `"~/qwen-logs"` - 记录到 `~/qwen-logs` 目录
- `"./custom-logs"` - 记录到相对于当前目录的 `./custom-logs`
- `"/tmp/openai-logs"` - 记录到绝对路径 `/tmp/openai-logs`

#### fastModel

| Setting     | Type   | Description                                                                                                                                                                                                                                                      | Default |
| ----------- | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| `fastModel` | string | 用于生成[提示建议](../features/followup-suggestions)和推测执行的模型。留空则使用主模型。使用更小/更快的模型（例如 `qwen3-coder-flash`）可降低延迟和成本。也可通过 `/model --fast` 设置。 | `""`    |

#### visionModel

| Setting       | Type   | Description                                                                                                                                                                                                                        | Default |
| ------------- | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| `visionModel` | string | 具备图像能力的模型，用作视觉桥梁：当纯文本主模型接收到图像时，会先由该模型进行转录。留空则自动选择同一提供商的视觉模型。也可通过 `/model --vision` 设置。 | `""`    |

#### voiceModel

| Setting      | Type   | Description                                                                                                                                             | Default |
| ------------ | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| `voiceModel` | string | 用于语音转录的模型。留空则保持语音听写处于禁用状态，直到选择了语音模型。也可通过 `/model --voice` 设置。 | `""`    |

#### context

| Setting                                                     | Type                       | Description                                                                                                                                                                                                                                                                                                                                                                                                                       | Default                         |
| ----------------------------------------------------------- | -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------- |
| `context.fileName`                                          | string or array of strings | 上下文文件的名称。                                                                                                                                                                                                                                                                                                                                                                                                  | `undefined`                     |
| `context.autoCompactThreshold`                              | number                     | 触发自动压缩的上下文窗口比例。必须大于 0 且最大为 1。默认值为 `0.7` (70%)。对于大型上下文窗口（>110K tokens），三级阈值系统的绝对分支占主导地位，因此低于 ~0.7 的值可能没有明显效果。自定义阈值主要影响小窗口模型（≤128K）。替代了旧的 `model.chatCompression.contextPercentageThreshold`。 | `undefined` (uses internal 0.7) |
| `context.importFormat`                                      | string                     | 导入记忆时使用的格式。                                                                                                                                                                                                                                                                                                                                                                                          | `undefined`                     |
| `context.includeDirectories`                                | array                      | 包含在工作区上下文中的附加目录。指定要包含在工作区上下文中的附加绝对或相对路径数组。默认情况下，缺失的目录将被跳过并显示警告。路径可以使用 `~` 来指代用户的主目录。此设置可与 `--include-directories` 命令行标志结合使用。                                                             | `[]`                            |
| `context.loadFromIncludeDirectories`                        | boolean                    | 控制 `/memory refresh` 命令的行为。如果设置为 `true`，则应从所有添加的目录中加载 `QWEN.md` 文件。如果设置为 `false`，则应仅从当前目录加载 `QWEN.md`。                                                                                                                                                                                                    | `false`                         |
| `context.fileFiltering.respectGitIgnore`                    | boolean                    | 搜索时遵循 .gitignore 文件。                                                                                                                                                                                                                                                                                                                                                                                          | `true`                          |
| `context.fileFiltering.respectQwenIgnore`                   | boolean                    | 搜索时遵循 .qwenignore 和配置的自定义忽略文件。                                                                                                                                                                                                                                                                                                                                                            | `true`                          |
| `context.fileFiltering.customIgnoreFiles`                   | array                      | 当启用 `respectQwenIgnore` 时，使用相对于项目根目录的忽略文件来替代默认的兼容性文件（`.agentignore`、`.aiignore`）。`.qwenignore` 始终包含在内。                                                                                                                                                                                                                                         | `[".agentignore", ".aiignore"]` |
| `context.fileFiltering.enableRecursiveFileSearch`           | boolean                    | 在提示中补全 `@` 前缀时，是否启用递归搜索当前目录树下的文件名。                                                                                                                                                                                                                                                                                                          | `true`                          |
| `context.fileFiltering.enableFuzzySearch`                   | boolean                    | 当为 `true` 时，在搜索文件时启用模糊搜索功能。设置为 `false` 可提高包含大量文件的项目的性能。                                                                                                                                                                                                                                                                          | `true`                          |
| `context.clearContextOnIdle.toolResultsThresholdMinutes`    | number                     | 清除旧工具结果内容前的空闲分钟数。使用 `-1` 禁用空闲触发器。                                                                                                                                                                                                                                                                                                                              | `60`                            |
| `context.clearContextOnIdle.toolResultsNumToKeep`           | integer                    | 清除时保留的最近可压缩工具结果的整数数量。低于 1 的值将被向下取整为 1。                                                                                                                                                                                                                                                                                                                | `5`                             |
| `context.clearContextOnIdle.toolResultsTotalCharsThreshold` | number                     | 在清除最旧结果之前，历史记录中允许的可压缩工具结果输出总字符数。使用 `-1` 禁用大小触发器。这是一个软阈值：受保护的最近工具结果可能会使总数超过此阈值。                                                                                                                                                                                                     | `500000`                        |

#### Troubleshooting File Search Performance

如果你在文件搜索（例如 `@` 补全）时遇到性能问题，特别是在包含大量文件的项目中，可以按照以下推荐顺序尝试几种方法：

1. **使用忽略文件：** 在项目根目录创建 `.qwenignore` 或配置的自定义忽略文件，以排除包含大量不需要引用的文件的目录（例如构建产物、日志、`node_modules`）。减少爬取的文件总数是提高性能的最有效方法。
2. **禁用模糊搜索：** 如果忽略文件不够，可以在 `settings.json` 文件中将 `enableFuzzySearch` 设置为 `false` 来禁用模糊搜索。这将使用更简单的非模糊匹配算法，速度可能会更快。
3. **禁用递归文件搜索：** 作为最后的手段，你可以通过将 `enableRecursiveFileSearch` 设置为 `false` 来完全禁用递归文件搜索。这将是最快的选项，因为它避免了对项目的递归爬取。但是，这意味着在使用 `@` 补全时，你需要输入文件的完整路径。

#### tools

| Setting                               | Type              | Description                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | Default     | Notes                                                                                                                                                                                                                                                                                                                       |
| ------------------------------------- | ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tools.sandbox`                       | boolean or string | 沙盒执行环境（可以是布尔值或路径字符串）。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | `undefined` |                                                                                                                                                                                                                                                                                                                             |
| `tools.sandboxImage`                  | string            | 当未设置 `--sandbox-image` 和 `QWEN_SANDBOX_IMAGE` 时，Docker/Podman 使用的沙盒镜像 URI。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | `undefined` |                                                                                                                                                                                                                                                                                                                             |
| `tools.shell.enableInteractiveShell`  | boolean           | 使用 `node-pty` 获得交互式 shell 体验。仍会回退到 `child_process`。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | `true`      |                                                                                                                                                                                                                                                                                                                             |
| `tools.core`                          | array of strings  | **已弃用。** 将在下一版本中移除。请改用 `permissions.allow` + `permissions.deny`。将内置工具限制为白名单。不在列表中的所有工具都将被禁用。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | `undefined` |                                                                                                                                                                                                                                                                                                                             |
| `tools.exclude`                       | array of strings  | **已弃用。** 请改用 `permissions.deny`。要从发现中排除的工具名称。在首次加载时会自动迁移到 `permissions` 格式。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | `undefined` |                                                                                                                                                                                                                                                                                                                             |
| `tools.allowed`                       | array of strings  | **已弃用。** 请改用 `permissions.allow`。绕过确认对话框的工具名称。在首次加载时会自动迁移到 `permissions` 格式。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | `undefined` |                                                                                                                                                                                                                                                                                                                             |
| `tools.approvalMode`                  | string            | 设置工具使用的默认审批模式。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | `default`   | 可能的值：`plan`（仅分析，不修改文件或执行命令）、`default`（在编辑文件或运行 shell 命令前需要审批）、`auto-edit`（自动批准文件编辑）、`auto`（LLM 分类器自动批准安全操作，阻止高风险操作）、`yolo`（自动批准所有工具调用） |
| `tools.discoveryCommand`              | string            | 用于工具发现的运行命令。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | `undefined` |                                                                                                                                                                                                                                                                                                                             |
| `tools.callCommand`                   | string            | 定义用于调用通过 `tools.discoveryCommand` 发现的特定工具的自定义 shell 命令。该 shell 命令必须满足以下条件：它必须将函数 `name`（与[函数声明](https://ai.google.dev/gemini-api/docs/function-calling#function-declarations)中完全一致）作为第一个命令行参数。它必须在 `stdin` 上以 JSON 格式读取函数参数，类似于 [`functionCall.args`](https://cloud.google.com/vertex-ai/generative-ai/docs/model-reference/inference#functioncall)。它必须在 `stdout` 上以 JSON 格式返回函数输出，类似于 [`functionResponse.response.content`](https://cloud.google.com/vertex-ai/generative-ai/docs/model-reference/inference#functionresponse)。 | `undefined` |                                                                                                                                                                                                                                                                                                                             |
| `tools.useRipgrep`                    | boolean           | 使用 ripgrep 进行文件内容搜索，而不是回退实现。提供更快的搜索性能。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | `true`      |                                                                                                                                                                                                                                                                                                                             |
| `tools.useBuiltinRipgrep`             | boolean           | 使用捆绑的 ripgrep 二进制文件。当设置为 `false` 时，将改用系统级的 `rg` 命令。此设置仅在 `tools.useRipgrep` 为 `true` 时生效。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | `true`      |                                                                                                                                                                                                                                                                                                                             |
| `tools.truncateToolOutputThreshold`   | number            | 如果工具输出大于此字符数，则进行截断。适用于 Shell、Grep、Glob、ReadFile 和 ReadManyFiles 工具。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | `25000`     | 需要重启：是                                                                                                                                                                                                                                                                                                       |
| `tools.truncateToolOutputLines`       | number            | 截断工具输出时保留的最大行数或条目数。适用于 Shell、Grep、Glob、ReadFile 和 ReadManyFiles 工具。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | `1000`      | 需要重启：是                                                                                                                                                                                                                                                                                                       |
| `tools.computerUse.enabled`           | boolean           | 启用内置的 Computer Use 工具（cua-driver 原生桌面自动化）。当为 `true`（默认值）时，`computer_use__*` 工具将注册为延迟内置工具；首次调用时会将固定的、签名的 cua-driver 二进制文件下载到 `~/.qwen/computer-use/` 中，并引导完成 macOS 辅助功能/屏幕录制权限设置。                                                                                                                                                                                                                                                                                                                                                                                                       | `true`      | 需要重启：是                                                                                                                                                                                                                                                                                                       |
| `tools.computerUse.maxImageDimension` | number            | 应用于 cua-driver 截图的最长边像素上限（通过 `set_config` 的 `max_image_dimension`）。`-1`（默认值）保留 cua-driver 的内置默认值（1568）；`0` 禁用调整大小（全分辨率）；正值限制最长边。较低的上限会以牺牲细节为代价降低视觉 token 成本。                                                                                                                                                                                                                                                                                                                                                                                                                                     | `-1`        | 需要重启：是。环境变量覆盖：`QWEN_COMPUTER_USE_MAX_IMAGE_DIMENSION`（非负整数；优先于此设置）                                                                                                                                                                                   |
| `tools.toolSearch.enabled`            | boolean           | 通过 ToolSearch 按需加载 MCP 工具以减少提示大小。对于依赖基于前缀的 KV 缓存的模型（例如 DeepSeek），请禁用此功能以保持提示前缀稳定并最大化缓存命中率。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | `true`      | 需要重启：是                                                                                                                                                                                                                                                                                                       |
> [!note]
>
> **从 `tools.core` / `tools.exclude` / `tools.allowed` 迁移：** 这些旧版设置已**弃用**，并在首次加载时自动迁移到新的 `permissions` 格式。建议直接配置 `permissions.allow` / `permissions.deny`。使用 `/permissions` 交互式管理规则。

#### memory

| 设置                          | 类型    | 描述                                                                                                                                                                                           | 默认值 |
| -------------------------------- | ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| `memory.enableManagedAutoMemory` | boolean | 启用从对话中后台提取记忆。                                                                                                                                          | `true`  |
| `memory.enableManagedAutoDream`  | boolean | 启用收集记忆的自动整合（去重和清理）。                                                                                                                     | `true`  |
| `memory.enableAutoSkill`         | boolean | 在工具密集型会话后，启用对可复用项目 skill 的后台审查。                                                                                                                       | `true`  |
| `memory.autoSkillConfirm`        | boolean | 在自动生成的 skill 添加到 skill 库之前请求确认。关闭时，自动生成的 skill 会立即保存。                                                                        | `true`  |
| `memory.enableTeamMemory`        | boolean | 启用项目记忆层，通过 git 跟踪的 `.qwen/team-memory/` 目录与协作者共享。对其的写入会进行密钥扫描，并可在 git diff 中审查。                            | `false` |
| `memory.enableTeamMemorySync`    | boolean | 启用团队记忆后，在会话开始时自动 commit、fast-forward-pull 并 push `.qwen/team-memory/` 目录，以便协作者保持同步。需要配置 git upstream。 | `false` |

有关 auto-memory 的工作原理以及如何使用 `/memory`、`/remember` 和 `/dream` 命令的详细信息，请参阅 [Memory](../features/memory)。

#### permissions

权限系统提供了细粒度的控制，决定哪些工具可以运行、哪些需要确认、哪些被阻止。

**决策优先级（从高到低）：`deny` > `ask` > `allow` > _（默认/交互模式）_**

第一个匹配的规则生效。规则使用 `"ToolName"` 或 `"ToolName(specifier)"` 格式。

| 设置             | 类型             | 描述                                                                                                      | 默认值     |
| ------------------- | ---------------- | ---------------------------------------------------------------------------------------------------------------- | ----------- |
| `permissions.allow` | array of strings | 自动批准的工具调用规则（无需确认）。在所有作用域（用户 + 项目 + 系统）中合并。 | `undefined` |
| `permissions.ask`   | array of strings | 始终需要用户确认的工具调用规则。优先级高于 `allow`。                         | `undefined` |
| `permissions.deny`  | array of strings | 被阻止的工具调用规则。最高优先级——覆盖 `allow` 和 `ask`。                               | `undefined` |

**工具名称别名（规则中可使用以下任意名称）：**

| 别名                 | 规范工具      | 说明                     |
| --------------------- | ------------------- | ------------------------- |
| `Bash`, `Shell`       | `run_shell_command` |                           |
| `Read`, `ReadFile`    | `read_file`         | 元类别 — 见下文 |
| `Edit`, `EditFile`    | `edit`              | 元类别 — 见下文 |
| `Write`, `WriteFile`  | `write_file`        |                           |
| `NotebookEdit`        | `notebook_edit`     |                           |
| `NotebookEditTool`    | `notebook_edit`     |                           |
| `Grep`, `SearchFiles` | `grep_search`       |                           |
| `Glob`, `FindFiles`   | `glob`              |                           |
| `ListFiles`           | `list_directory`    |                           |
| `WebFetch`            | `web_fetch`         |                           |
| `Agent`               | `task`              |                           |
| `Skill`               | `skill`             |                           |

**元类别：**

某些规则名称会自动涵盖多个工具：

| 规则名称 | 涵盖的工具                                        |
| --------- | ---------------------------------------------------- |
| `Read`    | `read_file`, `grep_search`, `glob`, `list_directory` |
| `Edit`    | `edit`, `write_file`, `notebook_edit`                |

> [!important]
> `Read(/path/**)` 匹配**所有四个**读取工具（文件读取、grep、glob 和目录列表）。
> 要仅限制文件读取，请使用 `ReadFile(/path/**)` 或 `read_file(/path/**)`。

**规则语法示例：**

| 规则                          | 含义                                                        |
| ----------------------------- | -------------------------------------------------------------- |
| `"Bash"`                      | 所有 shell 命令                                             |
| `"Bash(git *)"`               | 以 `git` 开头的 shell 命令（单词边界：不包含 `gitk`） |
| `"Bash(git push *)"`          | 类似 `git push origin main` 的 shell 命令                     |
| `"Bash(npm run *)"`           | 任何 `npm run` 脚本                                           |
| `"Read"`                      | 所有文件读取操作（read、grep、glob、list）              |
| `"Read(./secrets/**)"`        | 递归读取 `./secrets/` 下的任何文件                   |
| `"Edit(/src/**/*.ts)"`        | 编辑项目根目录 `/src/` 下的 TypeScript 文件               |
| `"WebFetch(api.example.com)"` | 从 `api.example.com` 及其所有子域名获取数据            |
| `"mcp__puppeteer"`            | 来自 puppeteer MCP 服务器的所有工具                        |

**路径模式前缀：**

| 前缀 | 含义                               | 示例             |
| ------ | ------------------------------------- | ------------------- |
| `//`   | 从文件系统根目录开始的绝对路径    | `//etc/passwd`      |
| `~/`   | 相对于主目录            | `~/Documents/*.pdf` |
| `/`    | 相对于项目根目录              | `/src/**/*.ts`      |
| `./`   | 相对于当前工作目录 | `./secrets/**`      |
| (无) | 与 `./` 相同                          | `secrets/**`        |

**Shell 命令绕过防护：**

针对 `Read`、`Edit` 和 `WebFetch` 的权限规则在 agent 运行等效 shell 命令时同样生效。例如，如果 `deny` 中包含 `Read(./.env)`，agent 无法通过 shell 命令中的 `cat .env` 来绕过此限制。支持的 shell 命令包括 `cat`、`grep`、`curl`、`wget`、`cp`、`mv`、`rm`、`chmod` 等。未知/安全的命令（如 `git`）不受文件/网络规则的影响。

**从旧版设置迁移：**

| 旧版设置  | 等效的 `permissions` 规则   | 说明                                                        |
| --------------- | ------------------------------- | ------------------------------------------------------------ |
| `tools.allowed` | `permissions.allow`             | 首次加载时自动迁移                                  |
| `tools.exclude` | `permissions.deny`              | 首次加载时自动迁移                                  |
| `tools.core`    | `permissions.allow` (allowlist) | 自动迁移；未列出的工具在注册表级别被禁用 |

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
> 在交互式 CLI 中使用 `/permissions` 查看、添加和删除规则，无需直接编辑 `settings.json`。

#### slashCommands

控制 CLI 中可用的斜杠命令。适用于在多租户或企业部署中锁定命令范围。

| 设置                  | 类型             | 描述                                                                                                                                                                                                                                                                                                                 | 默认值     |
| ------------------------ | ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- |
| `slashCommands.disabled` | array of strings | 要隐藏并拒绝执行的斜杠命令名称。与最终命令名称进行不区分大小写的匹配（对于扩展命令，这是消歧形式，例如 `myext.deploy`）。**在各作用域中作为并集合并**，因此工作区设置可以添加但不能移除用户或系统设置中定义的条目。 | `undefined` |

相同的拒绝列表也可以通过 `--disabled-slash-commands` CLI 标志（逗号分隔或重复）和 `QWEN_DISABLED_SLASH_COMMANDS` 环境变量提供；来自所有三个来源的值将合并为并集。

**示例 — 为沙盒部署锁定内置命令：**

```json
{
  "slashCommands": {
    "disabled": ["auth", "mcp", "extensions", "ide", "quit"]
  }
}
```

在系统级 `settings.json`（`/etc/qwen-code/settings.json` 或 `QWEN_CODE_SYSTEM_SETTINGS_PATH`）中配置这些值后，用户无法从其自身作用域缩小拒绝列表，且被禁用的命令不会出现在自动补全中，输入时也不会执行。

> [!note]
> 此设置仅控制斜杠命令（例如 `/auth`、`/mcp`）。它不影响
> 工具权限——相关配置请参阅 `permissions.deny`。它也不会
> 拦截 `Ctrl+C` 或 `Esc` 等键盘快捷键。

#### mcp

| 设置             | 类型             | 描述                                                                                                                                                                                                                                                                                                                                                                                                                                 | 默认值     |
| ------------------- | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- |
| `mcp.serverCommand` | string           | 启动 MCP 服务器的命令。                                                                                                                                                                                                                                                                                                                                                                                                             | `undefined` |
| `mcp.allowed`       | array of strings | 允许的 MCP 服务器白名单。允许你指定应向模型提供的 MCP 服务器名称列表。这可用于限制要连接的 MCP 服务器集合。支持 glob 模式（`*` 匹配任意序列，`?` 匹配单个字符——例如 `"*puppeteer*"`）；不包含 glob 字符的条目将精确匹配。请注意，如果设置了 `--allowed-mcp-server-names`，此配置将被忽略。 | `undefined` |
| `mcp.excluded`      | array of strings | 排除的 MCP 服务器黑名单。同时列在 `mcp.excluded` 和 `mcp.allowed` 中的服务器将被排除。支持 glob 模式（`*`、`?`），方式与 `mcp.allowed` 相同。请注意，如果设置了 `--allowed-mcp-server-names`，此配置将被忽略。                                                                                                                                                                                         | `undefined` |

> [!note]
>
> **MCP 服务器安全说明：** 这些设置对 MCP 服务器名称使用简单的字符串匹配，而名称是可以被修改的。如果你是希望防止用户绕过此限制的系统管理员，请考虑在系统设置级别配置 `mcpServers`，使用户无法配置自己的任何 MCP 服务器。这不应被视为绝对严密的安全机制。

#### lsp

> [!warning]
> **实验性功能**：LSP 支持目前处于实验阶段，默认禁用。请使用 `--experimental-lsp` 命令行标志启用它。

Language Server Protocol (LSP) 提供代码智能功能，如跳转到定义、查找引用和诊断。

LSP 服务器配置通过项目根目录下的 `.lsp.json` 文件进行，而不是通过 `settings.json`。有关配置详细信息和示例，请参阅 [LSP 文档](../features/lsp)。

#### security

| 设置                        | 类型    | 描述                                                                                                                                                 | 默认值     |
| ------------------------------ | ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- |
| `security.folderTrust.enabled` | boolean | 用于跟踪是否启用文件夹信任的设置。                                                                                                           | `false`     |
| `security.auth.selectedType`   | string  | 当前选择的身份验证类型。                                                                                                                 | `undefined` |
| `security.auth.enforcedType`   | string  | 强制要求的身份验证类型（对企业用户很有用）。                                                                                                            | `undefined` |
| `security.auth.useExternal`    | boolean | 是否使用外部身份验证流程。                                                                                                             | `undefined` |
| `security.auth.apiKey`         | string  | **已弃用。** 用于 OpenAI 兼容身份验证的 API key。请迁移到带有 `envKey` 的 `modelProviders`——请参阅 [Model Providers](./model-providers)。 | `undefined` |
| `security.auth.baseUrl`        | string  | **已弃用。** OpenAI 兼容 API 的 Base URL。请迁移到 `modelProviders`——请参阅 [Model Providers](./model-providers)。                     | `undefined` |

#### advanced

| 设置                        | 类型             | 描述                                                                                                                                                                                                                                                                                                                              | 默认值                  |
| ------------------------------ | ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------ |
| `advanced.autoConfigureMemory` | boolean          | 自动配置 Node.js 内存限制。                                                                                                                                                                                                                                                                                           | `false`                  |
| `advanced.dnsResolutionOrder`  | string           | DNS 解析顺序。                                                                                                                                                                                                                                                                                                                | `undefined`              |
| `advanced.excludedEnvVars`     | array of strings | 从项目上下文中排除的环境变量。指定不应从项目 `.env` 文件加载的环境变量。这可以防止特定于项目的环境变量（如 `DEBUG=true`）干扰 CLI 行为。来自 `.qwen/.env` 文件的变量永远不会被排除。       | `["DEBUG","DEBUG_MODE"]` |
| `advanced.bugCommand`          | object           | bug 报告命令的配置。覆盖 `/bug` 命令的默认 URL。属性：`urlTemplate`（string）：可包含 `{title}` 和 `{info}` 占位符的 URL。示例：`"bugCommand": { "urlTemplate": "https://bug.example.com/new?title={title}&info={info}" }`                                          | `undefined`              |
| `plansDirectory`               | string           | 已批准的 Plan Mode 文件的自定义目录。相对路径从项目根目录解析，且解析后的路径必须保留在项目根目录内。如果未设置，plan 文件将存储在 `~/.qwen/plans` 中。**需要重启。** 如果该目录位于项目根目录内，请将其添加到 `.gitignore` 以避免提交 plan 文件。 | `undefined`              |

#### experimental

> [!warning]
>
> **实验性功能。** 这些开关控制开发中的功能，可能会在未来的版本中更改或移除。

| 设置                             | 类型    | 描述                                                                                                                                                                                                                                                                                          | 默认值 |
| ----------------------------------- | ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| `experimental.cron`                 | boolean | 启用会话内的 cron/loop 工具（`cron_create`、`cron_list`、`cron_delete`），使模型能够创建循环提示。可通过 `QWEN_CODE_DISABLE_CRON=1` 环境变量禁用。需要重启。                                                                                  | `true`  |
| `experimental.agentTeam`            | boolean | 启用 agent-team 协作工具（`team_create`、`task_create`、`task_update`、`send_message` 等）以进行多 agent 协调。也可通过 `QWEN_CODE_ENABLE_AGENT_TEAM=1` 启用。需要重启。                                                                                   | `false` |
| `experimental.artifact`             | boolean | 启用 Artifact 工具，允许模型发布独立的 HTML 页面并在浏览器中打开。仅限交互式、非 SDK 会话。通过 `QWEN_CODE_ENABLE_ARTIFACT=1` / `QWEN_CODE_DISABLE_ARTIFACT=1` 切换。需要重启。                                                          | `false` |
| `experimental.emitToolUseSummaries` | boolean | 在每批工具调用完成后生成一个基于 LLM 的简短标签。请参阅 [Tool-Use Summaries](../features/tool-use-summaries)。需要配置快速模型（`fastModel`）；否则将静默跳过。可通过 `QWEN_CODE_EMIT_TOOL_USE_SUMMARIES=0` 或 `=1` 在每次会话中覆盖。 | `true`  |
#### mcpServers

配置与一个或多个模型上下文协议 (MCP) 服务器的连接，以发现和使用自定义工具。Qwen Code 会尝试连接到每个配置的 MCP 服务器以发现可用工具。如果多个 MCP 服务器暴露了同名工具，工具名称将加上你在配置中定义的服务器别名作为前缀（例如 `serverAlias__actualToolName`），以避免冲突。请注意，为了兼容性，系统可能会从 MCP 工具定义中剥离某些 schema 属性。必须至少提供 `command`、`url` 或 `httpUrl` 中的一个。如果指定了多个，优先级顺序为 `httpUrl`，其次是 `url`，最后是 `command`。

| Property                                | Type             | Description                                                                                                                                                                                                                                                        | Optional |
| --------------------------------------- | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------- |
| `mcpServers.<SERVER_NAME>.command`      | string           | 用于通过标准 I/O 启动 MCP 服务器的执行命令。                                                                                                                                                                                                                       | Yes      |
| `mcpServers.<SERVER_NAME>.args`         | array of strings | 传递给命令的参数。                                                                                                                                                                                                                                                 | Yes      |
| `mcpServers.<SERVER_NAME>.env`          | object           | 为服务器进程设置的环境变量。                                                                                                                                                                                                                                       | Yes      |
| `mcpServers.<SERVER_NAME>.cwd`          | string           | 启动服务器的工作目录。                                                                                                                                                                                                                                             | Yes      |
| `mcpServers.<SERVER_NAME>.url`          | string           | 使用 Server-Sent Events (SSE) 进行通信的 MCP 服务器的 URL。                                                                                                                                                                                                        | Yes      |
| `mcpServers.<SERVER_NAME>.httpUrl`      | string           | 使用可流式 HTTP 进行通信的 MCP 服务器的 URL。                                                                                                                                                                                                                      | Yes      |
| `mcpServers.<SERVER_NAME>.headers`      | object           | 随请求发送到 `url` 或 `httpUrl` 的 HTTP 标头映射。                                                                                                                                                                                                                 | Yes      |
| `mcpServers.<SERVER_NAME>.timeout`      | number           | 对此 MCP 服务器请求的超时时间（毫秒）。                                                                                                                                                                                                                            | Yes      |
| `mcpServers.<SERVER_NAME>.trust`        | boolean          | 信任此服务器并绕过所有工具调用确认。                                                                                                                                                                                                                               | Yes      |
| `mcpServers.<SERVER_NAME>.description`  | string           | 服务器的简短描述，可用于显示目的。                                                                                                                                                                                                                                 | Yes      |
| `mcpServers.<SERVER_NAME>.includeTools` | array of strings | 从此 MCP 服务器包含的工具名称列表。指定后，仅此列表中列出的工具可从该服务器使用（白名单行为）。如果未指定，默认启用该服务器的所有工具。                                                                                                                            | Yes      |
| `mcpServers.<SERVER_NAME>.excludeTools` | array of strings | 从此 MCP 服务器排除的工具名称列表。此处列出的工具将不可用于模型，即使它们由服务器暴露。**注意：** `excludeTools` 优先于 `includeTools` - 如果一个工具同时存在于两个列表中，它将被排除。                                                                          | Yes      |

#### telemetry

配置 Qwen Code 的日志记录和指标收集。有关更多信息，请参阅 [telemetry](../../developers/development/telemetry.md)。

| Setting                                     | Type    | Description                                                                                                                                                                                                                                                                              | Default   |
| ------------------------------------------- | ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| `telemetry.enabled`                         | boolean | 是否启用遥测。                                                                                                                                                                                                                                                                           |           |
| `telemetry.target`                          | string  | 遥测目标的信息标签（`local` 或 `gcp`）。不控制导出器路由；设置 `telemetry.otlpEndpoint` 或 `telemetry.outfile` 以配置数据发送位置。                                                                                                                                                      |           |
| `telemetry.otlpEndpoint`                    | string  | OTLP Exporter 的端点。                                                                                                                                                                                                                                                                   |           |
| `telemetry.otlpProtocol`                    | string  | OTLP Exporter 的协议（`grpc` 或 `http`）。                                                                                                                                                                                                                                               |           |
| `telemetry.logPrompts`                      | boolean | 是否在日志中包含用户提示的内容。                                                                                                                                                                                                                                                         |           |
| `telemetry.includeSensitiveSpanAttributes`  | boolean | 启用后，会将逐字用户提示、系统提示、工具输入/输出和模型响应附加到原生 OTel span 属性（除了 log-to-span 桥接 span）。⚠️ 会将敏感数据（文件内容、shell 命令、对话历史）流式传输到你的 OTLP 后端。                                                                                         | `false`   |
| `telemetry.sensitiveSpanAttributeMaxLength` | number  | 每个敏感原生 OTel span 属性内容负载的最大 JavaScript 字符串长度。必须介于 `1` 和 `104857600`（100 MiB）之间。如果你的收集器或后端拒绝大属性，请设置较低的值。                                                                                                                            | `1048576` |
| `telemetry.outfile`                         | string  | 将遥测数据写入文件的路径。设置后，将覆盖 OTLP 导出。                                                                                                                                                                                                                                     |           |

### Example `settings.json`

以下是具有嵌套结构的 `settings.json` 文件示例，该结构自 v0.3.0 起新增：

```
{
  "proxy": "http://localhost:7890",
  "plansDirectory": "./.qwen/plans",
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
    "logPrompts": true,
    "includeSensitiveSpanAttributes": false,
    "sensitiveSpanAttributeMaxLength": 1048576
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

## Shell History

CLI 会保留你运行的 shell 命令历史记录。为了避免不同项目之间的冲突，此历史记录存储在用户主文件夹内的项目特定目录中。

- **位置：** `~/.qwen/tmp/<project_hash>/shell_history`
  - `<project_hash>` 是从项目根路径生成的唯一标识符。
  - 历史记录存储在名为 `shell_history` 的文件中。

## Environment Variables & `.env` Files

环境变量是配置应用程序的常用方法，特别适用于敏感信息（如 token）或可能在不同环境之间更改的设置。

Qwen Code 可以自动从 `.env` 文件加载环境变量。
有关身份验证相关的变量（如 `OPENAI_*`）和推荐的 `.qwen/.env` 方法，请参阅 **[Authentication](../configuration/auth)**。

> [!tip]
>
> **环境变量排除：** 默认情况下，某些环境变量（如 `DEBUG` 和 `DEBUG_MODE`）会自动从项目 `.env` 文件中排除，以防止干扰 CLI 行为。来自 `.qwen/.env` 文件的变量永远不会被排除。你可以使用 `settings.json` 文件中的 `advanced.excludedEnvVars` 设置来自定义此行为。

### 环境变量表

| Variable                                             | Description                                                                                                                                                                                                                                                                                                                                                                                                      | Notes                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `QWEN_HOME`                                          | 自定义全局配置目录（默认值：`~/.qwen`）。接受绝对或相对路径（相对路径从当前工作目录解析）。前导 `~` 会展开为用户的主目录。                                                                                                                                                                                                                         | 存储凭据、设置、内存、技能和其他全局状态。设置后，项目级别的 `.qwen/` 目录不受影响。空字符串被视为未设置。                                                                                                                                                                                                                                                                                                                                                                            |
| `QWEN_RUNTIME_DIR`                                   | 覆盖运行时输出目录（对话、日志、todos）。未设置时，默认为 `QWEN_HOME` 目录。                                                                                                                                                                                                                                                                     | 使用此变量将临时运行时数据与持久配置分离。当 `QWEN_HOME` 位于共享/缓慢的文件系统上时非常有用。                                                                                                                                                                                                                                                                                                                                                                                        |
| `QWEN_TELEMETRY_ENABLED`                             | 设置为 `true` 或 `1` 以启用遥测。任何其他值都被视为禁用。                                                                                                                                                                                                                                                                                        | 覆盖 `telemetry.enabled` 设置。                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `QWEN_TELEMETRY_TARGET`                              | 设置遥测目标的信息标签（`local` 或 `gcp`）。不控制路由；使用 `QWEN_TELEMETRY_OTLP_ENDPOINT` 或 `QWEN_TELEMETRY_OUTFILE` 来配置数据发送位置。                                                                                                                                                                                                     | 覆盖 `telemetry.target` 设置。                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `QWEN_TELEMETRY_OTLP_ENDPOINT`                       | 设置遥测的 OTLP 端点。                                                                                                                                                                                                                                                                                                                                                                                           | 覆盖 `telemetry.otlpEndpoint` 设置。                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `QWEN_TELEMETRY_OTLP_PROTOCOL`                       | 设置 OTLP 协议（`grpc` 或 `http`）。                                                                                                                                                                                                                                                                                                                                                                             | 覆盖 `telemetry.otlpProtocol` 设置。                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `QWEN_TELEMETRY_LOG_PROMPTS`                         | 设置为 `true` 或 `1` 以启用或禁用用户提示的日志记录。任何其他值都被视为禁用。                                                                                                                                                                                                                                                                    | 覆盖 `telemetry.logPrompts` 设置。                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `QWEN_TELEMETRY_INCLUDE_SENSITIVE_SPAN_ATTRIBUTES`   | 设置为 `true` 或 `1` 以将逐字用户提示、系统提示、工具 I/O 和模型响应附加到原生 OTel span 属性（并在 log-to-span 桥接 span 上保留 `prompt` / `function_args` / `response_text`）。任何其他值都会禁用它。                                                                                                                                             | 覆盖 `telemetry.includeSensitiveSpanAttributes` 设置。⚠️ 会将敏感数据流式传输到你的 OTLP 后端。                                                                                                                                                                                                                                                                                                                                                                                    |
| `QWEN_TELEMETRY_SENSITIVE_SPAN_ATTRIBUTE_MAX_LENGTH` | 设置每个敏感原生 OTel span 属性内容负载的最大 JavaScript 字符串长度。必须是不大于 `104857600`（100 MiB）的正整数。                                                                                                                                                                                                                               | 覆盖 `telemetry.sensitiveSpanAttributeMaxLength` 设置。默认值为 `1048576`（1 MiB）；如果你的收集器或后端拒绝大型 span 属性，请降低该值。                                                                                                                                                                                                                                                                                                                                           |
| `QWEN_TELEMETRY_OUTFILE`                             | 设置写入遥测数据的文件路径。设置后，将覆盖 OTLP 导出。                                                                                                                                                                                                                                                                                                                                                           | 覆盖 `telemetry.outfile` 设置。                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `QWEN_SANDBOX`                                       | `settings.json` 中 `sandbox` 设置的替代方案。                                                                                                                                                                                                                                                                                                                                                                    | 接受 `true`、`false`、`docker`、`podman` 或自定义命令字符串。                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `QWEN_SANDBOX_IMAGE`                                 | 覆盖 Docker/Podman 的沙箱镜像选择。                                                                                                                                                                                                                                                                                                                                                                              | 优先于 `tools.sandboxImage`。                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `SEATBELT_PROFILE`                                   | （macOS 特定）切换 macOS 上的 Seatbelt (`sandbox-exec`) 配置文件。                                                                                                                                                                                                                                                                                                                                               | `permissive-open`：（默认）限制对项目文件夹（以及其他几个文件夹，请参阅 `packages/cli/src/utils/sandbox-macos-permissive-open.sb`）的写入，但允许其他操作。`strict`：使用默认拒绝操作的严格配置文件。`<profile_name>`：使用自定义配置文件。要定义自定义配置文件，请在项目的 `.qwen/` 目录中创建一个名为 `sandbox-macos-<profile_name>.sb` 的文件（例如 `my-project/.qwen/sandbox-macos-custom.sb`）。 |
| `DEBUG` or `DEBUG_MODE`                              | （通常由底层库或 CLI 本身使用）设置为 `true` 或 `1` 以启用详细的调试日志记录，这有助于故障排除。                                                                                                                                                                                                                                                   | **注意：** 默认情况下，这些变量会自动从项目 `.env` 文件中排除，以防止干扰 CLI 行为。如果你需要专门为 Qwen Code 设置这些变量，请使用 `.qwen/.env` 文件。                                                                                                                                                                                                                                                                                                                              |
| `NO_COLOR`                                           | 设置为任何值以禁用 CLI 中的所有颜色输出。                                                                                                                                                                                                                                                                                                                                                                        |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `FORCE_HYPERLINK`                                    | 覆盖 markdown 渲染器中的 OSC 8 可点击链接检测。设置为 `1`（或任何非零整数，或空字符串）以强制启用；设置为 `0` 或非数字值（如 `false` / `off`）以强制禁用。遵循其上方的 `NO_COLOR` / `QWEN_DISABLE_HYPERLINKS` 退出选项。                                                                                                                        | 使用此选项在 `tmux` / GNU `screen` 内启用 OSC 8（默认情况下自动检测会拒绝，因为主终端的功能隐藏在多路复用器后面）。在 tmux 3.3+ 上需要 `set -g allow-passthrough on`。同时启用未被自动检测到的 Hyper。                                                                                                                                                                                                                                                                                |
| `QWEN_DISABLE_HYPERLINKS`                            | 设置为 `1` 以在 markdown 渲染器中强制禁用 OSC 8 可点击超链接，即使在自动检测为支持该功能的终端上也是如此。                                                                                                                                                                                                                                       | 当终端宣传支持但在长 URL 上崩溃时，或者当通过破坏转义序列的中间件管道输出时，此选项非常有用。渲染器将回退到纯 `label (url)` 渲染。                                                                                                                                                                                                                                                                                                                                                  |
| `CLI_TITLE`                                          | 设置为字符串以自定义 CLI 的标题。                                                                                                                                                                                                                                                                                                                                                                                |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `CODE_ASSIST_ENDPOINT`                               | 指定代码辅助服务器的端点。                                                                                                                                                                                                                                                                                                                                                                                       | 这对于开发和测试非常有用。                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `QWEN_CODE_MAX_OUTPUT_TOKENS`                        | 覆盖每个响应的默认最大输出 token 数。未设置时，Qwen Code 默认使用模型声明的输出限制，如果响应被截断，会自动提升（下限 64K）并在多轮中恢复。将其设置为特定值（例如 `16000`）以使用固定限制——这对于希望降低每次请求槽位预留的容量受限的自托管后端非常有用。                                                                                         | 优先于模型限制默认值，但会被设置中的 `samplingParams.max_tokens` 覆盖。设置后会禁用自动提升。示例：`export QWEN_CODE_MAX_OUTPUT_TOKENS=16000`                                                                                                                                                                                                                                                                                                                                      |
| `QWEN_CODE_UNATTENDED_RETRY`                         | 设置为 `true` 或 `1` 以启用持久重试模式。启用后，瞬态 API 容量错误（HTTP 429 Rate Limit 和 529 Overloaded）将无限期重试，采用指数退避（每次重试上限为 5 分钟），并在 stderr 上每 30 秒发送一次心跳保活。                                                                                                                                        | 专为 CI/CD 管道和后台自动化设计，在这些场景中，长时间运行的任务应能在临时 API 中断中存活。必须显式设置——仅设置 `CI=true` **不会**激活此模式。有关详细信息，请参阅 [Headless Mode](../features/headless#persistent-retry-mode)。示例：`export QWEN_CODE_UNATTENDED_RETRY=1`                                                                                                                                                                                                        |
| `QWEN_CODE_PROFILE_STARTUP`                          | 设置为 `1` 以启用启动性能分析。将包含各阶段耗时的 JSON 计时报告写入 `~/.qwen/startup-perf/`。                                                                                                                                                                                                                                                     | 仅在沙箱子进程内部有效（或与 `QWEN_CODE_PROFILE_STARTUP_OUTER=1` 一起使用）。未设置时零开销。示例：`export QWEN_CODE_PROFILE_STARTUP=1`                                                                                                                                                                                                                                                                                                                                              |
| `QWEN_CODE_PROFILE_STARTUP_OUTER`                    | 与 `QWEN_CODE_PROFILE_STARTUP=1` 一起设置为 `1`，以在外层（沙箱前）进程中也收集启动配置文件。外层进程报告会获得 `outer-` 文件名前缀，以使其与沙箱子进程的报告区分开来。                                                                                                                                                                          | 默认关闭——仅沙箱子进程收集，以避免重复报告。对于 CLI 不会重新启动到沙箱中的本地开发非常有用。                                                                                                                                                                                                                                                                                                                                                                                        |
| `QWEN_CODE_PROFILE_STARTUP_NO_HEAP`                  | 与 `QWEN_CODE_PROFILE_STARTUP=1` 一起设置为 `1`，以跳过每个检查点的 `process.memoryUsage()` 快照。在测量分析器自身的海森堡开销时非常有用。                                                                                                                                                                                                       | 默认关闭。堆快照每次耗时约 50 µs（远低于总启动时间的 1%），因此大多数用户应保持原样。                                                                                                                                                                                                                                                                                                                                                                                                |
| `QWEN_CODE_LEGACY_MCP_BLOCKING`                      | 设置为 `1` 以恢复渐进式 MCP 之前的行为，即 `Config.initialize()` 在返回前同步等待每个配置的 MCP 服务器的发现握手。                                                                                                                                                                                                                               | 默认关闭。现代 qwen-code 允许 MCP 服务器在 UI 已可交互时在后台上线；模型会在服务器稳定后约 16 毫秒内看到每批新工具。保留此标志作为 ≥ 1 个版本的回退机制。示例：`export QWEN_CODE_LEGACY_MCP_BLOCKING=1`                                                                                                                                                                                                                                                                            |
当两个用户级 `.env` 文件定义了相同的变量时，Qwen 专属文件优先：`<QWEN_HOME>/.env`（如果未设置 `QWEN_HOME` 则为 `~/.qwen/.env`）会在 `~/.env` 之前加载，且不会覆盖已有的环境变量值。

## 命令行参数

运行 CLI 时直接传入的参数可以覆盖该特定会话的其他配置。

对于沙箱镜像选择，优先级为：
`--sandbox-image` > `QWEN_SANDBOX_IMAGE` > `tools.sandboxImage` > 内置默认镜像。

### 命令行参数表

| 参数 | 别名 | 描述 | 可选值 | 备注 |
| --- | --- | --- | --- | --- |
| `--model` | `-m` | 指定本次会话使用的 Qwen 模型。 | 模型名称 | 示例：`npm start -- --model qwen3-coder-plus` |
| `--prompt` | `-p` | 用于直接向命令传递 prompt。这将以非交互模式调用 Qwen Code。 | 你的 prompt 文本 | 对于脚本示例，请使用 `--output-format json` 标志以获取结构化输出。 |
| `--prompt-interactive` | `-i` | 启动一个交互会话，并将提供的 prompt 作为初始输入。 | 你的 prompt 文本 | prompt 会在交互会话内部处理，而不是在此之前。从 stdin 管道输入时不能使用此参数。示例：`qwen -i "explain this code"` |
| `--system-prompt` | | 覆盖本次运行的内置主会话 system prompt。 | 你的 prompt 文本 | 加载的上下文文件（如 `QWEN.md`）仍会在此覆盖之后追加。可与 `--append-system-prompt` 结合使用。 |
| `--append-system-prompt` | | 为本次运行向主会话 system prompt 追加额外指令。 | 你的 prompt 文本 | 在内置 prompt 和加载的上下文文件之后应用。可与 `--system-prompt` 结合使用。示例请参见[无头模式](../features/headless)。 |
| `--output-format` | `-o` | 指定非交互模式下 CLI 输出的格式。 | `text`, `json`, `stream-json` | `text`：（默认）标准的人类可读输出。`json`：在执行结束时发出的机器可读 JSON 输出。`stream-json`：在执行过程中实时发出的流式 JSON 消息。对于结构化输出和脚本编写，请使用 `--output-format json` 或 `--output-format stream-json` 标志。详细信息请参见[无头模式](../features/headless)。 |
| `--input-format` | | 指定从标准输入消耗的格式。 | `text`, `stream-json` | `text`：（默认）来自 stdin 或命令行参数的标准文本输入。`stream-json`：通过 stdin 进行双向通信的 JSON 消息协议。要求：`--input-format stream-json` 需要设置 `--output-format stream-json`。使用 `stream-json` 时，stdin 保留用于协议消息。详细信息请参见[无头模式](../features/headless)。 |
| `--include-partial-messages` | | 使用 `stream-json` 输出格式时包含部分 assistant 消息。启用后，会在流式传输过程中实时发出流事件（message_start、content_block_delta 等）。 | | 默认值：`false`。要求：需要设置 `--output-format stream-json`。有关流事件的详细信息，请参见[无头模式](../features/headless)。 |
| `--sandbox` | `-s` | 为本次会话启用沙箱模式。 | | |
| `--sandbox-image` | | 设置沙箱镜像 URI。 | | |
| `--debug` | `-d` | 为本次会话启用调试模式，提供更详细的输出。 | | |
| `--all-files` | `-a` | 如果设置，将递归包含当前目录下的所有文件作为 prompt 的上下文。 | | |
| `--help` | `-h` | 显示有关命令行参数的帮助信息。 | | |
| `--show-memory-usage` | | 显示当前的内存使用情况。 | | |
| `--yolo` | | 启用 YOLO 模式，自动批准所有工具调用。 | | |
| `--approval-mode` | | 设置工具调用的审批模式。 | `plan`, `default`, `auto-edit`, `auto`, `yolo` | 支持的模式：`plan`：仅分析——不修改文件或执行命令。`default`：文件编辑或 shell 命令需要审批（默认行为）。`auto-edit`：自动批准编辑工具（`edit`、`write_file`、`notebook_edit`），其他工具则提示审批。`auto`：LLM 分类器自动批准安全操作并阻止高风险操作。`yolo`：自动批准所有工具调用（等同于 `--yolo`）。不能与 `--yolo` 同时使用。对于新的统一方法，请使用 `--approval-mode=yolo` 代替 `--yolo`。示例：`qwen --approval-mode auto-edit`<br>有关[审批模式](../features/approval-mode)的更多信息。 |
| `--allowed-tools` | | 以逗号分隔的工具名称列表，这些工具将绕过确认对话框。 | 工具名称 | 示例：`qwen --allowed-tools "Shell(git status)"` |
| `--disabled-slash-commands` | | 要隐藏/禁用的斜杠命令名称（逗号分隔或重复）。与 `slashCommands.disabled` 设置和 `QWEN_DISABLED_SLASH_COMMANDS` 环境变量取并集。与最终命令名称进行不区分大小写的匹配。 | 命令名称 | 示例：`qwen --disabled-slash-commands "auth,mcp,extensions"` |
| `--telemetry` | | 启用 [telemetry](../../developers/development/telemetry.md)。 | | |
| `--telemetry-target` | | 设置 telemetry 目标。 | | 有关更多信息，请参见 [telemetry](../../developers/development/telemetry.md)。 |
| `--telemetry-otlp-endpoint` | | 设置 telemetry 的 OTLP 端点。 | | 有关更多信息，请参见 [telemetry](../../developers/development/telemetry.md)。 |
| `--telemetry-otlp-protocol` | | 设置 telemetry 的 OTLP 协议（`grpc` 或 `http`）。 | | 默认为 `grpc`。有关更多信息，请参见 [telemetry](../../developers/development/telemetry.md)。 |
| `--telemetry-log-prompts` | | 启用 telemetry 的 prompt 日志记录。 | | 有关更多信息，请参见 [telemetry](../../developers/development/telemetry.md)。 |
| `--acp` | | 启用 ACP 模式（Agent Client Protocol）。适用于 [Zed](../integration-zed) 等 IDE/编辑器集成。 | | 稳定版。取代已弃用的 `--experimental-acp` 标志。 |
| `--experimental-lsp` | | 启用实验性的 [LSP (Language Server Protocol)](../features/lsp) 功能，用于代码智能（跳转到定义、查找引用、诊断等）。 | | 实验性功能。需要安装语言服务器。 |
| `--extensions` | `-e` | 指定本次会话要使用的扩展列表。 | 扩展名称 | 如果未提供，则使用所有可用的扩展。使用特殊参数 `qwen -e none` 可禁用所有扩展。示例：`qwen -e my-extension -e my-other-extension` |
| `--list-extensions` | `-l` | 列出所有可用的扩展并退出。 | | |
| `--proxy` | | 设置 CLI 的代理。 | 代理 URL | 示例：`--proxy http://localhost:7890`。 |
| `--include-directories` | | 在工作区中包含额外的目录以支持多目录。 | 目录路径 | 可多次指定或使用逗号分隔的值。最多可添加 5 个目录。示例：`--include-directories /path/to/project1,/path/to/project2` 或 `--include-directories /path/to/project1 --include-directories /path/to/project2` |
| `--screen-reader` | | 启用屏幕阅读器模式，调整 TUI 以更好地兼容屏幕阅读器。 | | |
| `--version` | | 显示 CLI 的版本。 | | |
| `--openai-logging` | | 启用 OpenAI API 调用日志记录，用于调试和分析。 | | 此标志会覆盖 `settings.json` 中的 `enableOpenAILogging` 设置。 |
| `--openai-logging-dir` | | 设置 OpenAI API 日志的自定义目录路径。 | 目录路径 | 此标志会覆盖 `settings.json` 中的 `openAILoggingDir` 设置。支持绝对路径、相对路径和 `~` 展开。示例：`qwen --openai-logging-dir "~/qwen-logs" --openai-logging` |
## 上下文文件（分层指令上下文）

虽然上下文文件（默认为 `QWEN.md`，可通过 `context.fileName` 设置进行配置）严格来说不是 CLI _行为_ 的配置，但它们对于配置 _指令上下文_（也称为“记忆”）至关重要。这个强大的功能允许你向 AI 提供特定于项目的指令、编码风格指南或任何相关的背景信息，使其响应更贴合你的需求并更加准确。CLI 包含一些 UI 元素，例如页脚中显示已加载上下文文件数量的指示器，让你随时了解当前激活的上下文。

- **用途：** 这些 Markdown 文件包含你希望 Qwen 模型在交互过程中了解的指令、指南或上下文。该系统旨在分层管理这些指令上下文。

### 上下文文件内容示例（例如 `QWEN.md`）

以下是 TypeScript 项目根目录下的上下文文件可能包含的概念性示例：

```
# Project: My Awesome TypeScript Library

## General Instructions:
- When generating new TypeScript code, please follow the existing coding style.
- Ensure all new functions and classes have JSDoc comments.
- Prefer functional programming paradigms where appropriate.
- All code should be compatible with TypeScript 5.0 and Node.js 22+.

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

此示例展示了如何提供通用的项目上下文、特定的编码约定，甚至关于特定文件或组件的说明。你的上下文文件越相关、越精确，AI 就越能更好地协助你。强烈建议使用特定于项目的上下文文件来建立约定和上下文。

- **分层加载与优先级：** CLI 通过从多个位置加载上下文文件（例如 `QWEN.md`）来实现分层记忆系统。此列表中位置靠后（更具体）的文件内容通常会覆盖或补充位置靠前（更通用）的文件内容。确切的拼接顺序和最终上下文可以通过 `/memory` 对话框进行检查。典型的加载顺序如下：
  1. **全局上下文文件：**
     - 位置：`~/.qwen/<configured-context-filename>`（例如用户主目录中的 `~/.qwen/QWEN.md`）。
     - 范围：为你的所有项目提供默认指令。
  2. **项目根目录及祖先目录上下文文件：**
     - 位置：CLI 会在当前工作目录中搜索配置的上下文文件，然后依次向上搜索每个父目录，直到项目根目录（由 `.git` 文件夹标识）或你的主目录。
     - 范围：提供与整个项目或项目重要部分相关的上下文。
- **拼接与 UI 指示：** 所有找到的上下文文件的内容会被拼接在一起（带有指示其来源和路径的分隔符），并作为系统提示词的一部分提供。CLI 页脚会显示已加载上下文文件的数量，让你快速直观地了解当前激活的指令上下文。
- **导入内容：** 你可以使用 `@path/to/file.md` 语法导入其他 Markdown 文件，从而将上下文文件模块化。有关更多详细信息，请参阅[记忆文档](../features/memory.md)。
- **记忆管理命令：**
  - 使用 `/memory` 打开记忆管理对话框。
  - 从对话框中刷新记忆，以重新扫描并从所有配置的位置重新加载上下文文件。
  - 有关 `/memory` 命令的完整详细信息，请参阅[命令文档](../features/commands.md)。

通过理解并利用这些配置层以及上下文文件的分层特性，你可以有效地管理 AI 的记忆，并使 Qwen Code 的响应量身定制以满足你的特定需求和项目。

## 沙盒

Qwen Code 可以在沙盒环境中执行潜在的不安全操作（如 shell 命令和文件修改），以保护你的系统。

[沙盒](../features/sandbox) 默认处于禁用状态，但你可以通过以下几种方式启用它：

- 使用 `--sandbox` 或 `-s` 标志。
- 设置 `QWEN_SANDBOX` 环境变量。
- 在设置中配置 `tools.sandbox`。

> ⚠️ **`--yolo` 不会自动启用沙盒。** YOLO 模式仅自动批准工具调用；仍必须通过 `--sandbox`、`QWEN_SANDBOX` 或 `tools.sandbox` 来启用沙盒。在使用 `--yolo`（或 `--approval-mode=yolo`）且没有沙盒的无头/非交互式运行中，模型可以以当前进程的权限级别执行 shell、写入和编辑工具——在这种情况下，Qwen Code 会向 stderr 打印警告。在权衡利弊后，可以使用 `QWEN_CODE_SUPPRESS_YOLO_WARNING=1` 来抑制此警告。

默认情况下，它使用预构建的 `qwen-code-sandbox` Docker 镜像。

对于特定于项目的沙盒需求，你可以在项目根目录下的 `.qwen/sandbox.Dockerfile` 创建一个自定义 Dockerfile。此 Dockerfile 可以基于基础沙盒镜像：

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

为了帮助我们改进 Qwen Code，我们会收集匿名化的使用统计数据。这些数据有助于我们了解 CLI 的使用方式、识别常见问题并确定新功能的优先级。

**我们收集的内容：**

- **工具调用：** 我们会记录被调用的工具名称、它们是成功还是失败，以及执行所需的时间。我们不会收集传递给工具的参数或它们返回的任何数据。
- **API 请求：** 我们会记录每个请求使用的模型、请求的持续时间以及是否成功。我们不会收集提示词或响应的内容。
- **会话信息：** 我们会收集有关 CLI 配置的信息，例如启用的工具和批准模式。

**我们不收集的内容：**

- **个人身份信息 (PII)：** 我们不会收集任何个人信息，例如你的姓名、电子邮件地址或 API key。
- **提示词和响应内容：** 我们不会记录你的提示词内容或模型的响应内容。
- **文件内容：** 我们不会记录 CLI 读取或写入的任何文件的内容。

**如何禁用：**

你可以随时通过在 `settings.json` 文件的 `privacy` 类别下将 `usageStatisticsEnabled` 属性设置为 `false` 来禁用使用统计数据的收集：

```
{
  "privacy": {
    "usageStatisticsEnabled": false
  }
}
```

> [!note]
>
> 启用使用统计后，事件将被发送到阿里云 RUM 收集端点。