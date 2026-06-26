# Qwen Code 配置

> [!tip]
>
> **身份验证 / API 密钥：** 身份验证（API Key、阿里云编码计划）以及与身份验证相关的环境变量（如 `OPENAI_API_KEY`）的文档请参阅 **[身份验证](../configuration/auth)**。

> [!note]
>
> **关于新配置格式的说明：** `settings.json` 文件的格式已更新为一种更清晰的新结构。旧格式将会自动迁移。
> Qwen Code 提供了多种配置其行为的方式，包括环境变量、命令行参数和设置文件。本文档概述了不同的配置方法和可用的设置项。

## 配置层级

配置按以下优先级顺序应用（较低的数字可被较高的数字覆盖）：

| 层级 | 配置来源           | 描述                                                             |
| ---- | ------------------ | ---------------------------------------------------------------- |
| 1    | 默认值             | 应用程序内硬编码的默认值                                         |
| 2    | 系统默认值文件     | 系统范围的默认设置，可被其他设置文件覆盖                         |
| 3    | 用户设置文件       | 当前用户的全局设置                                               |
| 4    | 项目设置文件       | 特定项目的设置                                                   |
| 5    | 系统设置文件       | 覆盖所有其他设置文件的系统范围设置                               |
| 6    | 环境变量           | 系统范围或会话特定的变量，可能从 `.env` 文件加载                 |
| 7    | 命令行参数         | 启动 CLI 时传入的值                                              |

## 设置文件

Qwen Code 使用 JSON 设置文件进行持久化配置。共有四种位置：

| 文件类型         | 位置                                                                                                                                                                                                                                                                                                  | 作用范围                                                                                                                                                                                                         |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 系统默认值文件   | Linux：`/etc/qwen-code/system-defaults.json`<br>Windows：`C:\ProgramData\qwen-code\system-defaults.json`<br>macOS：`/Library/Application Support/QwenCode/system-defaults.json`<br>可通过 `QWEN_CODE_SYSTEM_DEFAULTS_PATH` 环境变量覆盖路径。                                                         | 提供系统范围的默认设置基础层。这些设置的优先级最低，旨在被用户、项目或系统覆盖设置所覆盖。                                                                                                                       |
| 用户设置文件     | `~/.qwen/settings.json`（其中 `~` 是你的主目录）                                                                                                                                                                                                                                                      | 应用于当前用户的所有 Qwen Code 会话。                                                                                                                                                                            |
| 项目设置文件     | 项目根目录下的 `.qwen/settings.json`                                                                                                                                                                                                                                                                  | 仅当从该特定项目运行 Qwen Code 时应用。项目设置会覆盖用户设置。                                                                                                                                                  |
| 系统设置文件     | Linux：`/etc/qwen-code/settings.json`<br>Windows：`C:\ProgramData\qwen-code\settings.json`<br>macOS：`/Library/Application Support/QwenCode/settings.json`<br>可通过 `QWEN_CODE_SYSTEM_SETTINGS_PATH` 环境变量覆盖路径。                                                                               | 应用于系统上所有用户的所有 Qwen Code 会话。系统设置会覆盖用户和项目设置。对于希望控制用户 Qwen Code 配置的企业系统管理员可能很有用。                                                                            |

> [!note]
>
> **关于设置中的环境变量的说明：** 你的 `settings.json` 文件中的字符串值可以通过 `$VAR_NAME` 或 `${VAR_NAME}` 语法引用环境变量。加载设置时，这些变量将自动解析。例如，如果你有一个环境变量 `MY_API_TOKEN`，你可以在 `settings.json` 中这样使用它：`"apiKey": "$MY_API_TOKEN"`。

### 项目中的 `.qwen` 目录

除了项目设置文件外，项目的 `.qwen` 目录还可以包含与 Qwen Code 运行相关的其他项目特定文件，例如：

- [自定义沙箱配置文件](../features/sandbox)（例如 `.qwen/sandbox-macos-custom.sb`、`.qwen/sandbox.Dockerfile`）。
- [Agent 技能](../features/skills) 位于 `.qwen/skills/` 目录下（每个技能是一个包含 `SKILL.md` 的目录）。

### 配置迁移

Qwen Code 会自动将旧版配置设置迁移到新格式。迁移前会备份旧设置文件。以下设置已从否定命名（`disable*`）重命名为肯定命名（`enable*`）：

| 旧设置                               | 新设置                                    | 说明                         |
| ------------------------------------ | ----------------------------------------- | ---------------------------- |
| `disableAutoUpdate` + `disableUpdateNag` | `general.enableAutoUpdate`                | 合并为一个设置               |
| `disableLoadingPhrases`              | `ui.accessibility.enableLoadingPhrases`   |                              |
| `disableFuzzySearch`                 | `context.fileFiltering.enableFuzzySearch` |                              |
| `disableCacheControl`                | `model.generationConfig.enableCacheControl` |                             |

> [!note]
>
> **布尔值反转：** 迁移时，布尔值会反转（例如，`disableAutoUpdate: true` 变为 `enableAutoUpdate: false`）。

#### `disableAutoUpdate` 和 `disableUpdateNag` 的合并策略

当两个旧设置都存在且值不同时，迁移遵循以下策略：如果 `disableAutoUpdate` **或** `disableUpdateNag` 中**任一**为 `true`，则 `enableAutoUpdate` 变为 `false`：

| `disableAutoUpdate` | `disableUpdateNag` | 迁移后的 `enableAutoUpdate` |
| ------------------- | ------------------ | --------------------------- |
| `false`             | `false`            | `true`                      |
| `false`             | `true`             | `false`                     |
| `true`              | `false`            | `false`                     |
| `true`              | `true`             | `false`                     |

### `settings.json` 中的可用设置

设置按类别组织。大多数设置应放在 `settings.json` 文件中相应顶层类别对象下。少数顶层设置（如 `proxy` 和 `plansDirectory`）为了兼容性仍保留为直接根键。

#### general

| 设置                                       | 类型      | 描述                                                                                                                                                                                                                                                                                                                                                                                               | 默认值        |
| ------------------------------------------ | --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------- |
| `general.preferredEditor`                  | string    | 首选打开文件的编辑器。                                                                                                                                                                                                                                                                                                                                                                             | `undefined`   |
| `general.vimMode`                          | boolean   | 启用 Vim 键绑定。                                                                                                                                                                                                                                                                                                                                                                                  | `false`       |
| `general.enableAutoUpdate`                 | boolean   | 启用启动时的自动更新检查和安装。                                                                                                                                                                                                                                                                                                                                                                   | `true`        |
| `general.showSessionRecap`                 | boolean   | 离开终端后返回时自动显示一行“上次离开位置”的回顾。默认关闭。使用 `/recap` 可手动触发，不受此设置影响。                                                                                                                                                                                                                                                                                            | `false`       |
| `general.sessionRecapAwayThresholdMinutes` | number    | 终端失焦多少分钟后，当重新聚焦时自动触发回顾。仅在 `showSessionRecap` 启用时有效。                                                                                                                                                                                                                                                                                                                | `5`           |
| `general.gitCoAuthor.commit`               | boolean   | 在通过 Qwen Code 提交的 git 提交消息中添加 Co-authored-by 尾部，并附加每文件的 AI 归属 git note（`refs/notes/ai-attribution`）。禁用则跳过两者。                                                                                                                                                                                                                                                  | `true`        |
| `general.gitCoAuthor.pr`                   | boolean   | 在运行 `gh pr create` 时，向拉取请求描述中添加 Qwen Code 归属行。                                                                                                                                                                                                                                                                                                                                  | `true`        |
| `general.defaultFileEncoding`              | string    | 新文件的默认编码。使用 `"utf-8"`（默认）表示不带 BOM 的 UTF-8，使用 `"utf-8-bom"` 表示带 BOM 的 UTF-8。仅在项目明确要求 BOM 时才更改。                                                                                                                                                                                                                                                             | `"utf-8"`     |
| `general.cleanupPeriodDays`                | number    | 保留 `/rewind` 使用的 `~/.qwen/file-history/` 会话备份的天数。早于此天数的备份将通过每日最多运行一次的后台通行程序移除。`0` = 最小保留（约1小时）：保留最近一小时内的会话以及当前活动会话。更改需重启生效。                                                                                                                                                                                         | `30`          |
| `general.language`                         | enum      | 用户界面的语言。使用 `"auto"` 从系统设置中检测，或使用语言代码（例如 `"zh-CN"`、`"fr"`）。可以通过将 JS 区域设置文件放置在 `~/.qwen/locales/` 下来添加自定义代码。参见 [i18n](../features/language)。需要重启。                                                                                                                                                                                 | `"auto"`      |
| `general.outputLanguage`                   | string    | 模型输出的语言。使用 `"auto"` 从系统设置中检测，或设置特定语言。需要重启。                                                                                                                                                                                                                                                                                                                         | `"auto"`      |
| `general.dynamicCommandTranslation`        | boolean   | 启用动态斜杠命令描述的 AI 翻译。禁用时，动态命令保留其原始描述，跳过翻译模型调用。                                                                                                                                                                                                                                                                                                                | `false`       |

#### output

| 设置                   | 类型      | 描述                                                        | 默认值     | 可能的值              |
| ---------------------- | --------- | ----------------------------------------------------------- | ---------- | --------------------- |
| `output.format`        | string    | CLI 输出的格式。                                            | `"text"`   | `"text"`、`"json"`    |
| `output.showTimestamps`| boolean   | 在每个助手响应前显示 `[HH:MM:SS]` 时间戳。                 | `false`    |                       |

#### ui

| 设置                                       | 类型             | 描述                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | 默认值          |
| ------------------------------------------ | ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------- |
| `ui.theme`                                 | string           | UI 的颜色主题。参见[主题](../configuration/themes)了解可用选项。                                                                                                                                                                                                                                                                                                                                                                                                                                | `"Qwen Dark"`   |
| `ui.customThemes`                          | object           | 自定义主题定义。                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | `{}`            |
| `ui.statusLine`                            | object           | 自定义状态行配置。支持 `command`、`refreshInterval`、`respectUserColors` 和 `hideContextIndicator` 选项。参见[状态行](../features/status-line)。                                                                                                                                                                                                                                                                                                                                                | `undefined`     |
| `ui.hideWindowTitle`                       | boolean          | 隐藏窗口标题栏。                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | `false`         |
| `ui.hideTips`                              | boolean          | 隐藏 UI 中的所有提示（启动时和响应后）。参见[上下文提示](../features/tips)。                                                                                                                                                                                                                                                                                                                                                                                                                   | `false`         |
| `ui.hideBanner`                            | boolean          | 隐藏启动时的 ASCII 徽标和信息面板。除非同时设置 `ui.hideTips`，否则提示和聊天输入仍然显示。                                                                                                                                                                                                                                                                                                                                                                                                    | `false`         |
| `ui.customBannerTitle`                     | string           | 替换横幅信息面板中的默认 `>_ Qwen Code` 标题。始终会附加 `(vX.Y.Z)` 版本后缀；认证、模型和路径行不受影响。已清理；最长 80 个字符。                                                                                                                                                                                                                                                                                                                                                             | `""`            |
| `ui.customBannerSubtitle`                  | string           | 可选的副标题行，显示在横幅标题和认证/模型行之间，替代空白间隔行。已清理；最长 160 个字符。空（默认）保持原有的空白间隔。                                                                                                                                                                                                                                                                                                                                                                         | `""`            |
| `ui.customAsciiArt`                        | string \| object | 替换横幅中的 QWEN ASCII 徽标。接受内联字符串（用于两种宽度层级）、`{ "path": "./brand.txt" }`（相对路径根据所属设置文件目录解析；启动时以 `O_NOFOLLOW` 读取一次，POSIX 上最大 64 KB）或 `{ "small": ..., "large": ... }` 用于宽度感知选择。已清理；每个层级最大 200 行 × 200 列。                                                                                                                                                                                                                 | `undefined`     |
| `ui.showLineNumbers`                       | boolean          | 在 CLI 输出的代码块中显示行号。                                                                                                                                                                                                                                                                                                                                                                                                                                                                | `true`          |
| `ui.renderMode`                            | string           | 默认 Markdown 显示模式。使用 `"render"` 进行丰富的可视化预览，或使用 `"raw"` 默认显示面向源码的 Markdown。在会话期间可用 `Alt/Option+M` 切换；在 macOS 上，终端必须将 Option 作为 Meta 发送。参见[Markdown 渲染](../features/markdown-rendering)。                                                                                                                                                                                                                                             | `"render"`      |
| `ui.showCitations`                         | boolean          | 在聊天中显示生成文本的引用来源。                                                                                                                                                                                                                                                                                                                                                                                                                                                               | `false`         |
| `ui.history.collapseOnResume`              | boolean          | 恢复会话时是否默认折叠历史记录。可通过 `/history collapse-on-resume` 和 `/history expand-on-resume` 切换。                                                                                                                                                                                                                                                                                                                                                                                     | `false`         |
| `ui.compactMode`                           | boolean          | 隐藏工具输出和思考过程以获得更简洁的视图。在会话期间用 `Ctrl+O` 切换或通过设置对话框切换。即使处于紧凑模式，工具审批提示也永不隐藏。该设置在会话间持久化。                                                                                                                                                                                                                                                                                                                                    | `false`         |
| `ui.shellOutputMaxLines`                   | number           | 内联显示的最大 shell 输出行数。设为 `0` 以禁用上限并显示完整输出。隐藏的行通过 `+N 行` 指示器呈现。错误、`!` 前缀的用户启动命令、确认工具和聚焦的内嵌 shell 总是显示完整输出。                                                                                                                                                                                                                                                                                                                 | `5`             |
| `ui.enableWelcomeBack`                     | boolean          | 返回具有对话历史的项目时显示“欢迎回来”对话框。启用后，Qwen Code 会自动检测你是否返回一个存在之前生成的项目摘要（`.qwen/PROJECT_SUMMARY.md`）的项目，并显示对话框让你选择继续之前的对话或开始新对话。如果选择**开始新的聊天会话**，该选择会为当前项目记住，直到项目摘要更改。此功能与 `/summary` 命令和退出确认对话框集成。                                                                                                                                                                 | `true`          |
| `ui.accessibility.enableLoadingPhrases`    | boolean          | 启用加载提示语（为无障碍禁用）。                                                                                                                                                                                                                                                                                                                                                                                                                                                               | `true`          |
| `ui.accessibility.screenReader`            | boolean          | 启用屏幕阅读器模式，调整 TUI 以更好地兼容屏幕阅读器。                                                                                                                                                                                                                                                                                                                                                                                                                                         | `false`         |
| `ui.customWittyPhrases`                    | array of strings | 在加载状态期间显示的自定义短语列表。提供后，CLI 将循环显示这些短语而不是默认短语。                                                                                                                                                                                                                                                                                                                                                                                                             | `[]`            |
| `ui.showResponseTokensPerSecond`           | boolean          | 在模型流式输出时，在响应 token 计数器旁边显示实时的 token/秒估算值。这是一个生成速度提示，而非预计完成时间或完成百分比。下次会话生效。                                                                                                                                                                                                                                                                                                                                                         | `false`         |
| `ui.enableFollowupSuggestions`             | boolean          | 启用[后续建议](../features/followup-suggestions)，在模型响应后预测你接下来想输入的内容。建议以占位符文本形式出现，可通过 Tab、Enter 或右箭头键接受（它们会填充输入框，不会自动提交）。默认开启；设为 `false` 可退出。                                                                                                                                                                                                                                                                           | `true`          |
| `ui.enableCacheSharing`                    | boolean          | 使用支持缓存感知的分叉查询来生成建议。在支持前缀缓存的提供商处降低成本（实验性）。                                                                                                                                                                                                                                                                                                                                                                                                             | `true`          |
| `ui.enableSpeculation`                     | boolean          | 在提交前推测性地执行已接受的建议。接受后结果立即出现（实验性）。                                                                                                                                                                                                                                                                                                                                                                                                                               | `false`         |
#### IDE

| 设置                 | 类型      | 描述                                         | 默认值    |
| ------------------ | ------- | -------------------------------------------- | ------- |
| `ide.enabled`      | boolean | 启用IDE集成模式。                              | `false` |
| `ide.hasSeenNudge` | boolean | 用户是否已看到IDE集成提示。                       | `false` |

#### 隐私

| 设置                               | 类型      | 描述                 | 默认值   |
| -------------------------------- | ------- | -------------------- | ------- |
| `privacy.usageStatisticsEnabled` | boolean | 启用使用统计信息收集。 | `true`  |

#### 模型

| 设置                                                          | 类型     | 描述                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | 默认值        |
| ------------------------------------------------------------ | ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- |
| `model.name`                                                 | string  | 用于对话的Qwen模型。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | `undefined` |
| `model.maxSessionTurns`                                      | number  | 会话中保留的用户/模型/工具轮次的最大数量。-1表示无限制。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | `-1`        |
| `model.maxWallTimeSeconds`                                   | number  | 无头/无人值守运行的挂钟时间预算（秒）。`-1`表示无限制。可通过`--max-wall-time`按调用覆盖，该参数需要正数时长（`90`、`30s`、`5m`、`1h`、`1.5h`）；最小值为1秒——亚秒值（`500ms`、`0.5`）会被视为错误拒绝。省略该标志则回退到此设置。超过时以退出码55终止。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | `-1`        |
| `model.maxToolCalls`                                         | number  | 一次运行的累积工具调用预算（统计每个已执行的工具，成功或失败；`--json-schema`下的`structured_output`除外）。`-1`表示无限制；`0`表示“不允许工具调用”。上限为1,000,000以防止误输入。可通过`--max-tool-calls`覆盖。超过时以退出码55终止。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | `-1`        |
| `model.generationConfig`                                     | object  | 传递给底层内容生成器的高级覆盖项。支持请求控制，例如`timeout`、`maxRetries`、`enableCacheControl`、`splitToolMedia`（默认`true`；将工具返回的媒体（包括内置 read_file 读取的图像）拆分为后续的用户消息，而不是违反规范的`role: "tool"`消息，以便像 doubao / new-api / LM Studio 这样严格的 OpenAI 兼容服务器能够看到它；设置为`false`可恢复旧的嵌入工具行为）、`toolResultContentFormat`（默认`"parts"`；仅对于其工具模板忽略文本内容部分的旧版 OpenAI 兼容运行时设置`"string"`）、`contextWindowSize`（覆盖模型的上下文窗口大小）、`modalities`（覆盖自动检测的输入模态）、`customHeaders`（API 请求的自定义HTTP头）和`extra_body`（仅适用于OpenAI兼容API请求的额外主体参数），以及`samplingParams`下的微调参数（例如`temperature`、`top_p`、`max_tokens`）。保持未设置以使用提供商的默认值。 | `undefined` |
| `model.chatCompression.contextPercentageThreshold`           | number  | **已移除。** 自动压缩现在使用基于模型上下文窗口通过`computeThresholds()`函数内部计算的三级阈值阶梯（warn / auto / hard）——不再可由用户配置。在`settings.json`中设置此字段将被静默忽略（无启动警告）。目前没有“完全禁用压缩”的替代方案——如果压缩本身失败，响应式溢出恢复仍然作为API层的安全网。（重设计理由请参见PR #4345 / `docs/design/auto-compaction-threshold-redesign.md`。）                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | `N/A`       |
| `model.chatCompression.maxRecentFilesToRetain`               | number  | 自动压缩后，将最近触达的文件的当前内容恢复到历史记录中的数量（如果较小则嵌入，否则通过路径引用）。`0`表示不恢复任何文件。环境变量覆盖：`QWEN_COMPACT_MAX_RECENT_FILES`。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | `5`         |
| `model.chatCompression.maxRecentImagesToRetain`              | number  | 自动压缩后，将最近的图像（工具截图/用户粘贴）恢复到历史记录中的数量。`0`表示不恢复任何图像。环境变量覆盖：`QWEN_COMPACT_MAX_RECENT_IMAGES`。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | `3`         |
| `model.chatCompression.enableScreenshotTrigger`              | boolean | 当为`true`时，一旦历史中累积的工具返回的图像数量达到`screenshotTriggerThreshold`，自动压缩也会触发，与token使用无关——适用于计算机使用会话，其中频繁的截图会稀释模型注意力。仅统计工具结果内返回的图像，不包括用户粘贴的图像。环境变量覆盖：`QWEN_COMPACT_SCREENSHOT_TRIGGER`（`1`/true/`0`/false）。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | `true`      |
| `model.chatCompression.screenshotTriggerThreshold`           | number  | 截图触发器的触发阈值的工具返回图像数量（仅当`enableScreenshotTrigger`启用时）。压缩会重置计数器——保留下来的图像作为顶级部分重新嵌入，触发器不计数——因此不会立即再次触发。环境变量覆盖：`QWEN_COMPACT_SCREENSHOT_THRESHOLD`。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | `50`        |
| `model.skipNextSpeakerCheck`                                 | boolean | 跳过下一说话者检查。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | `true`      |
| `model.skipLoopDetection`                                    | boolean | 禁用流式循环检测检查。默认值为`true`（跳过循环检测），以避免误报中断正常的工作流程。设置为`false`以重新启用流式循环检测——在无头/非交互式运行中作为护栏，否则卡住的重复可能会浪费预算。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | `true`      |
| `model.skipStartupContext`                                   | boolean | 跳过在每个会话开始时发送启动工作区上下文（环境摘要和确认）。如果你更愿意手动提供上下文或想在启动时节省token，请启用此选项。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | `false`     |
| `model.enableOpenAILogging`                                  | boolean | 启用OpenAI API调用的日志记录以便调试和分析。启用后，API请求和响应将被记录到JSON文件中。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | `false`     |
| `model.openAILoggingDir`                                     | string  | OpenAI API日志的自定义目录路径。如果未指定，默认为当前工作目录下的`logs/openai`。支持绝对路径、相对路径（从当前工作目录解析）和`~`展开（家目录）。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | `undefined` |
**示例 model.generationConfig：**

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

**max_tokens（自适应输出令牌数）：**

当未设置 `samplingParams.max_tokens` 时，Qwen Code 使用自适应输出令牌策略以优化 GPU 资源使用：

1. 请求开始时默认限制为 **8K** 输出令牌
2. 如果响应被截断（模型达到限制），Qwen Code 自动使用 **64K** 令牌重试
3. 部分输出被丢弃，并用重试后的完整响应替换

这对用户是透明的——如果发生升级，您可能会短暂看到重试指示器。由于 99% 的响应低于 5K 令牌，因此重试很少发生（<1% 的请求）。

若要覆盖此行为，请在设置中设置 `samplingParams.max_tokens`，或使用 `QWEN_CODE_MAX_OUTPUT_TOKENS` 环境变量。

**toolResultContentFormat：**

控制仅文本工具结果在 OpenAI 兼容请求中的序列化方式。默认值 `"parts"` 保持标准的内容片段数组形状。仅当旧版 OpenAI 兼容运行时的工具模板忽略文本内容片段时（例如较旧的 GLM-5.1 vLLM/SGLang 模板），才设置为 `"string"`。工具返回的媒体仍由 `splitToolMedia` 控制。

**contextWindowSize：**

覆盖所选模型的默认上下文窗口大小。Qwen Code 根据内置默认值（基于模型名称匹配）确定上下文窗口，并带有常量回退值。当某个提供者的有效上下文限制与 Qwen Code 的默认值不同时，使用此设置。此值定义模型的假定最大上下文容量，而非每个请求的令牌限制。

当所选模型在 `modelProviders` 中定义时，请在该提供者条目的 `generationConfig` 中设置 `contextWindowSize`，而不是在顶层 `model.generationConfig` 中设置。提供者模型条目是密封的，因此顶层生成设置不会填充缺失的提供者字段。

**modalities：**

覆盖所选模型的自动检测输入模态。Qwen Code 根据模型名称模式匹配自动检测支持的模态（图像、PDF、音频、视频）。当自动检测不正确时——例如，为支持的模型启用 `pdf` 但未被识别——使用此设置。格式：`{ "image": true, "pdf": true, "audio": true, "video": true }`。对于不支持的类型，省略键或将其设置为 `false`。

**customHeaders：**

允许您向所有 API 请求添加自定义 HTTP 标头。这对于请求跟踪、监控、API 网关路由或当不同模型需要不同标头时非常有用。对于提供者模型，在 `modelProviders[].generationConfig.customHeaders` 中定义 `customHeaders`。对于没有匹配提供者条目的运行时模型，在 `model.generationConfig.customHeaders` 中定义它。两个级别之间不会进行合并。

`extra_body` 字段允许您向发送到 API 的请求体添加自定义参数。这对于标准配置字段未涵盖的提供者特定选项非常有用。**注意：此字段仅适用于 OpenAI 兼容的提供者（`openai`、`qwen-oauth`）。对于 Anthropic 和 Gemini 提供者，它会被忽略。** 对于提供者模型，在 `modelProviders[].generationConfig.extra_body` 中定义 `extra_body`。对于没有匹配提供者条目的运行时模型，在 `model.generationConfig.extra_body` 中定义它。

**model.openAILoggingDir 示例：**

- `"~/qwen-logs"` - 将日志记录到 `~/qwen-logs` 目录
- `"./custom-logs"` - 将日志记录到相对于当前目录的 `./custom-logs`
- `"/tmp/openai-logs"` - 将日志记录到绝对路径 `/tmp/openai-logs`

#### fastModel

| 设置 | 类型 | 描述 | 默认值 |
| --- | --- | --- | --- |
| `fastModel` | string | 用于生成[提示建议](../features/followup-suggestions)和推测性执行的模型。留空则使用主模型。更小/更快的模型（例如 `qwen3-coder-flash`）可减少延迟和成本。也可以通过 `/model --fast` 设置。 | `""` |

#### context

| 设置 | 类型 | 描述 | 默认值 |
| --- | --- | --- | --- |
| `context.fileName` | string 或 string 数组 | 上下文文件的名称。 | `undefined` |
| `context.importFormat` | string | 导入记忆时使用的格式。 | `undefined` |
| `context.includeDirectories` | array | 要包含在工作区上下文中的额外目录。指定要包含在工作区上下文中的额外绝对或相对路径数组。默认情况下，缺失的目录将以警告跳过。路径可以使用 `~` 引用用户的主目录。此设置可以与 `--include-directories` 命令行标志结合使用。 | `[]` |
| `context.loadFromIncludeDirectories` | boolean | 控制 `/memory refresh` 命令的行为。如果设置为 `true`，则应从所有添加的目录加载 `QWEN.md` 文件。如果设置为 `false`，则只应从当前目录加载 `QWEN.md`。 | `false` |
| `context.fileFiltering.respectGitIgnore` | boolean | 搜索时尊重 .gitignore 文件。 | `true` |
| `context.fileFiltering.respectQwenIgnore` | boolean | 搜索时尊重 .qwenignore 和配置的自定义忽略文件。 | `true` |
| `context.fileFiltering.customIgnoreFiles` | array | 当 `respectQwenIgnore` 启用时，用于替代默认兼容性文件（`.agentignore`、`.aiignore`）的相对于项目根目录的忽略文件。`.qwenignore` 始终包含在内。 | `[".agentignore", ".aiignore"]` |
| `context.fileFiltering.enableRecursiveFileSearch` | boolean | 是否在提示中完成 `@` 前缀时启用对当前目录树下的文件名进行递归搜索。 | `true` |
| `context.fileFiltering.enableFuzzySearch` | boolean | 当为 `true` 时，启用搜索文件时的模糊搜索功能。设置为 `false` 可提高项目文件数量较多时的性能。 | `true` |
| `context.clearContextOnIdle.toolResultsThresholdMinutes` | number | 清除旧工具结果内容之前的空闲分钟数。使用 `-1` 禁用空闲触发器。 | `60` |
| `context.clearContextOnIdle.toolResultsNumToKeep` | integer | 清除时保留的最新的可压缩工具结果的整数数量。低于 1 的值将向下取整为 1。 | `5` |
| `context.clearContextOnIdle.toolResultsTotalCharsThreshold` | number | 在清除最旧结果之前，历史记录中允许的可压缩工具结果输出的总字符数。使用 `-1` 禁用大小触发器。这是一个软阈值：受保护的最新工具结果可能使总字符数保持在此阈值之上。 | `500000` |

#### 文件搜索性能故障排除

如果您在文件搜索（例如 `@` 补全）时遇到性能问题，特别是在文件数量非常多的项目中，可以按照推荐顺序尝试以下几种方法：

1. **使用忽略文件：** 在项目根目录中创建一个 `.qwenignore` 或配置的自定义忽略文件，以排除包含大量不需要引用的文件（例如构建产物、日志、`node_modules`）的目录。减少被爬取的文件总数是提高性能最有效的方法。
2. **禁用模糊搜索：** 如果忽略文件还不够，可以通过在 `settings.json` 文件中将 `enableFuzzySearch` 设置为 `false` 来禁用模糊搜索。这将使用更简单的非模糊匹配算法，速度可能更快。
3. **禁用递归文件搜索：** 作为最后手段，可以通过将 `enableRecursiveFileSearch` 设置为 `false` 来完全禁用递归文件搜索。这将是最快的选项，因为它避免了递归爬取您的项目。但这意味着在使用 `@` 补全时，您需要键入文件的完整路径。

#### tools

| 设置 | 类型 | 描述 | 默认值 | 备注 |
| --- | --- | --- | --- | --- |
| `tools.sandbox` | boolean 或 string | 沙箱执行环境（可以是布尔值或路径字符串）。 | `undefined` | |
| `tools.sandboxImage` | string | 当未设置 `--sandbox-image` 和 `QWEN_SANDBOX_IMAGE` 时，Docker/Podman 使用的沙箱镜像 URI。 | `undefined` | |
| `tools.shell.enableInteractiveShell` | boolean | 使用 `node-pty` 提供交互式 Shell 体验。仍会回退到 `child_process`。 | `true` | |
| `tools.core` | string 数组 | **已弃用。** 将在下一个版本中移除。请改用 `permissions.allow` + `permissions.deny`。将内置工具限制为允许列表。不在列表中的所有工具都将被禁用。 | `undefined` | |
| `tools.exclude` | string 数组 | **已弃用。** 请改用 `permissions.deny`。要从发现中排除的工具名称。首次加载时会自动迁移到 `permissions` 格式。 | `undefined` | |
| `tools.allowed` | string 数组 | **已弃用。** 请改用 `permissions.allow`。绕过确认对话框的工具名称。首次加载时会自动迁移到 `permissions` 格式。 | `undefined` | |
| `tools.approvalMode` | string | 设置工具使用的默认批准模式。 | `default` | 可能的值：`plan`（仅分析，不修改文件或执行命令）、`default`（在文件编辑或 Shell 命令运行前要求批准）、`auto-edit`（自动批准文件编辑）、`auto`（LLM 分类器自动批准安全操作，阻止风险操作）、`yolo`（自动批准所有工具调用） |
| `tools.discoveryCommand` | string | 用于工具发现的命令。 | `undefined` | |
| `tools.callCommand` | string | 定义用于调用通过 `tools.discoveryCommand` 发现的特定工具的自定义 shell 命令。shell 命令必须满足以下条件：必须以函数 `name`（与[函数声明](https://ai.google.dev/gemini-api/docs/function-calling#function-declarations)中的完全一致）作为第一个命令行参数。必须从 `stdin` 读取 JSON 格式的函数参数，类似于 [`functionCall.args`](https://cloud.google.com/vertex-ai/generative-ai/docs/model-reference/inference#functioncall)。必须将 JSON 格式的函数输出返回到 `stdout`，类似于 [`functionResponse.response.content`](https://cloud.google.com/vertex-ai/generative-ai/docs/model-reference/inference#functionresponse)。 | `undefined` | |
| `tools.useRipgrep` | boolean | 使用 ripgrep 进行文件内容搜索，而不是回退实现。提供更快的搜索性能。 | `true` | |
| `tools.useBuiltinRipgrep` | boolean | 使用捆绑的 ripgrep 二进制文件。当设置为 `false` 时，将改用系统级的 `rg` 命令。此设置仅在 `tools.useRipgrep` 为 `true` 时生效。 | `true` | |
| `tools.truncateToolOutputThreshold` | number | 如果工具输出超过此字符数，则截断。适用于 Shell、Grep、Glob、ReadFile 和 ReadManyFiles 工具。 | `25000` | 需要重启：是 |
| `tools.truncateToolOutputLines` | number | 截断工具输出时保留的最大行数或条目数。适用于 Shell、Grep、Glob、ReadFile 和 ReadManyFiles 工具。 | `1000` | 需要重启：是 |
| `tools.computerUse.enabled` | boolean | 启用内置的计算机使用工具（cua-driver 原生桌面自动化）。当为 `true`（默认）时，`computer_use__*` 工具将注册为延迟内置工具；首次调用会下载经固定签名的 cua-driver 二进制文件到 `~/.qwen/computer-use/`，并引导 macOS 辅助功能/屏幕录制权限。 | `true` | 需要重启：是 |
| `tools.computerUse.maxImageDimension` | number | 应用于 cua-driver 屏幕截图的最长边像素上限（通过 `set_config` 的 `max_image_dimension`）。`-1`（默认）保持 cua-driver 的内置默认值（1568）；`0` 禁用调整大小（全分辨率）；正数上限设置最长边。较低的上限会减少视觉令牌成本，但会牺牲精细细节。 | `-1` | 需要重启：是。环境变量覆盖：`QWEN_COMPUTER_USE_MAX_IMAGE_DIMENSION`（非负整数；优先于此设置） |
> [!note]
>
> **从 `tools.core` / `tools.exclude` / `tools.allowed` 迁移：** 这些旧版设置已**弃用**，并在首次加载时自动迁移到新的 `permissions` 格式。建议直接配置 `permissions.allow` / `permissions.deny`。可使用 `/permissions` 交互式管理规则。

#### memory

| 设置                          | 类型    | 描述                                                                                                                    | 默认值 |
| -------------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------ | ------- |
| `memory.enableManagedAutoMemory` | boolean | 启用从对话中后台提取记忆。                                                                   | `true`  |
| `memory.enableManagedAutoDream`  | boolean | 启用自动整合（去重和清理）收集到的记忆。                                              | `true`  |
| `memory.enableAutoSkill`         | boolean | 启用工具密集型会话后的后台审查，以发现可重用的项目技能。                                                | `true`  |
| `memory.autoSkillConfirm`        | boolean | 在自动生成的技能添加到技能库之前请求确认。关闭后，自动技能将立即保存。 | `true`  |

有关自动记忆的工作原理以及如何使用 `/memory`、`/remember` 和 `/dream` 命令的详细信息，请参阅 [记忆](../features/memory)。

#### permissions

权限系统提供对哪些工具可以运行、哪些需要确认、哪些被阻止的精细控制。

**决策优先级（从高到低）：`deny` > `ask` > `allow` > _(默认/交互模式)_**

第一个匹配的规则生效。规则使用 `"ToolName"` 或 `"ToolName(specifier)"` 格式。

| 设置             | 类型             | 描述                                                                                                      | 默认值     |
| ------------------- | ---------------- | ---------------------------------------------------------------------------------------------------------------- | ----------- |
| `permissions.allow` | array of strings | 自动批准的工具调用规则（无需确认）。合并所有作用域（用户 + 项目 + 系统）。 | `undefined` |
| `permissions.ask`   | array of strings | 始终需要用户确认的工具调用规则。优先级高于 `allow`。                         | `undefined` |
| `permissions.deny`  | array of strings | 被阻止的工具调用规则。最高优先级 — 覆盖 `allow` 和 `ask`。                               | `undefined` |

**工具名称别名（规则中均可使用）：**

| 别名                 | 规范工具      | 备注                     |
| --------------------- | ------------------- | ------------------------- |
| `Bash`, `Shell`       | `run_shell_command` |                           |
| `Read`, `ReadFile`    | `read_file`         | 元类别 — 见下方 |
| `Edit`, `EditFile`    | `edit`              | 元类别 — 见下方 |
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
| `"Bash(git *)"`               | 以 `git` 开头的 shell 命令（单词边界：不匹配 `gitk`） |
| `"Bash(git push *)"`          | 类似 `git push origin main` 的 shell 命令                     |
| `"Bash(npm run *)"`           | 任何 `npm run` 脚本                                           |
| `"Read"`                      | 所有文件读取操作（read, grep, glob, list）              |
| `"Read(./secrets/**)"`        | 递归读取 `./secrets/` 下的任何文件                   |
| `"Edit(/src/**/*.ts)"`        | 编辑项目根目录 `/src/` 下的 TypeScript 文件               |
| `"WebFetch(api.example.com)"` | 从 `api.example.com` 及其所有子域名获取内容            |
| `"mcp__puppeteer"`            | 来自 puppeteer MCP 服务器的所有工具                        |

**路径模式前缀：**

| 前缀 | 含义                               | 示例             |
| ------ | ------------------------------------- | ------------------- |
| `//`   | 文件系统根目录的绝对路径    | `//etc/passwd`      |
| `~/`   | 相对于 home 目录            | `~/Documents/*.pdf` |
| `/`    | 相对于项目根目录              | `/src/**/*.ts`      |
| `./`   | 相对于当前工作目录 | `./secrets/**`      |
| (无) | 等同于 `./`                          | `secrets/**`        |

**Shell 命令绕过阻止说明：**

当代理执行等效的 shell 命令时，也会强制执行 `Read`、`Edit` 和 `WebFetch` 的权限规则。例如，如果 `Read(./.env)` 在 `deny` 中，代理无法通过 shell 命令中的 `cat .env` 绕过它。支持的 shell 命令包括 `cat`、`grep`、`curl`、`wget`、`cp`、`mv`、`rm`、`chmod` 等。未知/安全的命令（例如 `git`）不受文件/网络规则影响。

**从旧版设置迁移：**

| 旧版设置  | 等效的 `permissions` 规则   | 备注                                                        |
| --------------- | ------------------------------- | ------------------------------------------------------------ |
| `tools.allowed` | `permissions.allow`             | 首次加载时自动迁移                                  |
| `tools.exclude` | `permissions.deny`              | 首次加载时自动迁移                                  |
| `tools.core`    | `permissions.allow` (白名单) | 自动迁移；未列出的工具在注册表级别被禁用 |

**示例配置：**

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

控制 CLI 中哪些斜杠命令可用。用于在多租户或企业部署中锁定命令面。

| 设置                  | 类型             | 描述                                                                                                                                                                                                                                                                                                                 | 默认值     |
| ------------------------ | ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- |
| `slashCommands.disabled` | array of strings | 要隐藏并拒绝执行的斜杠命令名称。不区分大小写地匹配最终命令名称（对于扩展命令，这是消歧形式，例如 `myext.deploy`）。**跨作用域合并为并集**，因此工作区设置可以添加但不能删除在用户或系统设置中定义的条目。 | `undefined` |

同一拒绝列表也可以通过 `--disabled-slash-commands` CLI 标志（逗号分隔或重复）和 `QWEN_DISABLED_SLASH_COMMANDS` 环境变量提供；来自三个来源的值合并为并集。

**示例 — 为沙盒部署锁定内置命令：**

```json
{
  "slashCommands": {
    "disabled": ["auth", "mcp", "extensions", "ide", "quit"]
  }
}
```

使用这些值在系统级 `settings.json`（`/etc/qwen-code/settings.json` 或 `QWEN_CODE_SYSTEM_SETTINGS_PATH`）中，用户无法从其自己的作用域缩小拒绝列表，禁用的命令将不会出现在自动补全或执行中。

> [!note]
> 此设置仅阻止斜杠命令（例如 `/auth`、`/mcp`）。它不影响工具权限 — 请参见 `permissions.deny`。它也不会拦截键盘快捷键，例如 `Ctrl+C` 或 `Esc`。

#### mcp

| 设置             | 类型             | 描述                                                                                                                                                                                                                                                                  | 默认值     |
| ------------------- | ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- |
| `mcp.serverCommand` | string           | 启动 MCP 服务器的命令。                                                                                                                                                                                                                                              | `undefined` |
| `mcp.allowed`       | array of strings | 允许的 MCP 服务器白名单。允许你指定一个应提供给模型的 MCP 服务器名称列表。这可用于限制要连接的 MCP 服务器集合。请注意，如果设置了 `--allowed-mcp-server-names`，则会忽略此项。 | `undefined` |
| `mcp.excluded`      | array of strings | 要排除的 MCP 服务器黑名单。同时出现在 `mcp.excluded` 和 `mcp.allowed` 中的服务器将被排除。请注意，如果设置了 `--allowed-mcp-server-names`，则会忽略此项。                                                                                           | `undefined` |

> [!note]
>
> **MCP 服务器的安全说明：** 这些设置使用 MCP 服务器名称的简单字符串匹配，可能被修改。如果你是系统管理员，希望防止用户绕过此设置，请考虑在系统设置级别配置 `mcpServers`，以便用户将无法配置自己的任何 MCP 服务器。这不应被用作严密的安全机制。

#### lsp

> [!warning]
> **实验性功能**：LSP 支持目前是实验性的，默认禁用。使用 `--experimental-lsp` 命令行标志启用。

语言服务器协议 (LSP) 提供代码智能功能，如转到定义、查找引用和诊断。

LSP 服务器配置通过项目根目录中的 `.lsp.json` 文件完成，而不是通过 `settings.json`。有关配置详细信息和示例，请参阅 [LSP 文档](../features/lsp)。

#### security

| 设置                        | 类型    | 描述                                       | 默认值     |
| ------------------------------ | ------- | ------------------------------------------------- | ----------- |
| `security.folderTrust.enabled` | boolean | 跟踪是否启用了文件夹信任的设置。 | `false`     |
| `security.auth.selectedType`   | string  | 当前选定的认证类型。       | `undefined` |
| `security.auth.enforcedType`   | string  | 必需的认证类型（对企业有用）。  | `undefined` |
| `security.auth.useExternal`    | boolean | 是否使用外部认证流程。   | `undefined` |

#### advanced

| 设置                        | 类型             | 描述                                                                                                                                                                                                                                                                                                                              | 默认值                  |
| ------------------------------ | ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------ |
| `advanced.autoConfigureMemory` | boolean          | 自动配置 Node.js 内存限制。                                                                                                                                                                                                                                                                                           | `false`                  |
| `advanced.dnsResolutionOrder`  | string           | DNS 解析顺序。                                                                                                                                                                                                                                                                                                                | `undefined`              |
| `advanced.excludedEnvVars`     | array of strings | 从项目上下文中排除的环境变量。指定应从项目 `.env` 文件中加载时排除的环境变量。这可以防止项目特定的环境变量（如 `DEBUG=true`）干扰 CLI 行为。来自 `.qwen/.env` 文件的变量永不排除。       | `["DEBUG","DEBUG_MODE"]` |
| `advanced.bugCommand`          | object           | 错误报告命令的配置。覆盖 `/bug` 命令的默认 URL。属性：`urlTemplate` (string)：可包含 `{title}` 和 `{info}` 占位符的 URL。示例：`"bugCommand": { "urlTemplate": "https://bug.example.com/new?title={title}&info={info}" }`                                          | `undefined`              |
| `plansDirectory`               | string           | 经批准的规划模式文件的自定义目录。相对路径从项目根目录解析，解析后的路径必须保持在项目根目录内。如果未设置，规划文件存储在 `~/.qwen/plans`。**需要重启。** 如果目录在项目根目录内，将其添加到 `.gitignore` 以避免提交规划文件。 | `undefined`              |

#### experimental

> [!warning]
>
> **实验性功能。** 这些开关控制正在开发中的功能，可能在未来的版本中更改或删除。

| 设置                             | 类型    | 描述                                                                                                                                                                                                                                                                                          | 默认值 |
| ----------------------------------- | ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| `experimental.cron`                 | boolean | 启用在会话中的 cron/循环工具（`cron_create`、`cron_list`、`cron_delete`），以便模型可以创建定期提示。可通过环境变量 `QWEN_CODE_DISABLE_CRON=1` 禁用。需要重启。                                                                                  | `true`  |
| `experimental.agentTeam`            | boolean | 启用代理团队协作工具（`team_create`、`task_create`、`task_update`、`send_message` 等）用于多代理协调。也可通过 `QWEN_CODE_ENABLE_AGENT_TEAM=1` 启用。需要重启。                                                                                   | `false` |
| `experimental.artifact`             | boolean | 启用 Artifact 工具，让模型发布一个独立的 HTML 页面并在浏览器中打开。仅限交互式、非 SDK 会话。通过 `QWEN_CODE_ENABLE_ARTIFACT=1` / `QWEN_CODE_DISABLE_ARTIFACT=1` 切换。需要重启。                                                          | `false` |
| `experimental.emitToolUseSummaries` | boolean | 在每个工具调用批次完成后生成一个简短的基于 LLM 的标签。参见 [工具使用摘要](../features/tool-use-summaries)。需要配置一个快速模型（`fastModel`），否则静默跳过。可通过 `QWEN_CODE_EMIT_TOOL_USE_SUMMARIES=0` 或 `=1` 在每个会话中覆盖。 | `true`  |

#### mcpServers

配置到一个或多个模型上下文协议 (MCP) 服务器的连接，以发现和使用自定义工具。Qwen Code 尝试连接到每个配置的 MCP 服务器以发现可用工具。如果多个 MCP 服务器暴露了同名的工具，工具名称将使用你在配置中定义的服务器别名作为前缀（例如 `serverAlias__actualToolName`）以避免冲突。请注意，系统可能会为了兼容性而去除 MCP 工具定义中的某些 schema 属性。必须提供 `command`、`url` 或 `httpUrl` 中的至少一个。如果指定了多个，优先顺序为 `httpUrl`，然后是 `url`，最后是 `command`。

| 属性                                | 类型             | 描述                                                                                                                                                                                                                                                        | 可选 |
| --------------------------------------- | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------- |
| `mcpServers.<SERVER_NAME>.command`      | string           | 用于通过标准 I/O 启动 MCP 服务器的命令。                                                                                                                                                                                                   | 是      |
| `mcpServers.<SERVER_NAME>.args`         | array of strings | 传递给命令的参数。                                                                                                                                                                                                                                  | 是      |
| `mcpServers.<SERVER_NAME>.env`          | object           | 为服务器进程设置的环境变量。                                                                                                                                                                                                               | 是      |
| `mcpServers.<SERVER_NAME>.cwd`          | string           | 启动服务器的工作目录。                                                                                                                                                                                                                | 是      |
| `mcpServers.<SERVER_NAME>.url`          | string           | 使用服务器发送事件 (SSE) 进行通信的 MCP 服务器的 URL。                                                                                                                                                                                     | 是      |
| `mcpServers.<SERVER_NAME>.httpUrl`      | string           | 使用可流式 HTTP 进行通信的 MCP 服务器的 URL。                                                                                                                                                                                              | 是      |
| `mcpServers.<SERVER_NAME>.headers`      | object           | 发送给 `url` 或 `httpUrl` 的 HTTP 头部映射。                                                                                                                                                                                                 | 是      |
| `mcpServers.<SERVER_NAME>.timeout`      | number           | 对此 MCP 服务器请求的超时时间（毫秒）。                                                                                                                                                                                                           | 是      |
| `mcpServers.<SERVER_NAME>.trust`        | boolean          | 信任此服务器并绕过所有工具调用确认。                                                                                                                                                                                                          | 是      |
| `mcpServers.<SERVER_NAME>.description`  | string           | 服务器的简短描述，可能用于显示目的。                                                                                                                                                                                         | 是      |
| `mcpServers.<SERVER_NAME>.includeTools` | array of strings | 从此 MCP 服务器包含的工具名称列表。指定后，只有这里列出的工具会从此服务器可用（白名单行为）。如果未指定，默认启用服务器的所有工具。                                        | 是      |
| `mcpServers.<SERVER_NAME>.excludeTools` | array of strings | 从此 MCP 服务器排除的工具名称列表。这里列出的工具将不会对模型可用，即使它们被服务器暴露。**注意：** `excludeTools` 优先于 `includeTools` — 如果一个工具同时出现在两个列表中，它将被排除。 | 是      |
#### telemetry

配置 Qwen Code 的日志记录和指标收集。更多信息请参阅 [telemetry](../../developers/development/telemetry.md)。

| 设置                                     | 类型    | 描述                                                                                                                                                                                                                                                                                     | 默认值    |
| --------------------------------------- | ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| `telemetry.enabled`                     | boolean | 是否启用 telemetry。                                                                                                                                                                                                                                                                     |           |
| `telemetry.target`                      | string  | 用于标识 telemetry 目标的信息标签（`local` 或 `gcp`）。不控制导出路由；请设置 `telemetry.otlpEndpoint` 或 `telemetry.outfile` 来配置数据发送位置。                                                                                                                                    |           |
| `telemetry.otlpEndpoint`                | string  | OTLP Exporter 的端点。                                                                                                                                                                                                                                                               |           |
| `telemetry.otlpProtocol`                | string  | OTLP Exporter 的协议（`grpc` 或 `http`）。                                                                                                                                                                                                                                            |           |
| `telemetry.logPrompts`                  | boolean | 是否在日志中包含用户提示的内容。                                                                                                                                                                                                                                                         |           |
| `telemetry.includeSensitiveSpanAttributes` | boolean | 启用时，将逐字用户提示、系统提示、工具输入/输出以及模型响应附加到原生 OTel span 属性中（除了日志到 span 的桥接 span）。⚠️ 会将敏感数据（文件内容、shell 命令、对话历史）流式传输到您的 OTLP 后端。                                                                                     | `false`   |
| `telemetry.sensitiveSpanAttributeMaxLength` | number  | 每个敏感原生 OTel span 属性内容负载的最大 JavaScript 字符串长度。必须在 `1` 到 `104857600`（100 MiB）之间。如果您的收集器或后端拒绝大型属性，请设置更小的值。                                                                                                                              | `1048576` |
| `telemetry.outfile`                     | string  | 将 telemetry 写入文件的路径。设置后将覆盖 OTLP 导出。                                                                                                                                                                                                                                  |           |

### 示例 `settings.json`

以下是一个使用嵌套结构的 `settings.json` 文件示例（自 v0.3.0 起新增）：

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

## Shell 历史

CLI 会记录您运行过的 shell 命令历史。为避免不同项目之间的冲突，此历史记录存储在用户主文件夹中特定于项目的目录下。

- **位置：** `~/.qwen/tmp/<project_hash>/shell_history`
  - `<project_hash>` 是项目根路径生成的唯一标识符。
  - 历史记录存储在名为 `shell_history` 的文件中。

## 环境变量与 `.env` 文件

环境变量是配置应用程序的常用方式，尤其适用于敏感信息（如令牌）或在不同环境之间可能变化的设置。

Qwen Code 可以自动从 `.env` 文件加载环境变量。
关于身份验证相关变量（如 `OPENAI_*`）以及推荐的 `.qwen/.env` 方式，请参阅 **[身份验证](../configuration/auth)**。

> [!tip]
>
> **环境变量排除：** 默认情况下，某些环境变量（例如 `DEBUG` 和 `DEBUG_MODE`）会自动从项目 `.env` 文件中排除，以防止干扰 CLI 行为。来自 `.qwen/.env` 文件的变量不会排除。您可以通过 `settings.json` 文件中的 `advanced.excludedEnvVars` 设置自定义此行为。

### 环境变量表

| 变量                                             | 描述                                                                                                                                                                                                                                                                                           | 备注                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| ------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `QWEN_HOME`                                      | 自定义全局配置目录（默认：`~/.qwen`）。接受绝对路径或相对路径（相对路径从当前工作目录解析）。开头的 `~` 会扩展为用户主目录。                                                                                                                               | 存储凭证、设置、内存、技能和其他全局状态。设置后，项目级 `.qwen/` 目录不受影响。空字符串视为未设置。                                                                                                                                                                                                                                                                                                                  |
| `QWEN_RUNTIME_DIR`                               | 覆盖运行时输出目录（对话、日志、待办事项）。未设置时，默认为 `QWEN_HOME` 目录。                                                                                                                                                                                                             | 用于将临时运行时数据与持久配置分离。当 `QWEN_HOME` 位于共享/慢速文件系统时很有用。                                                                                                                                                                                                                                                                                                                                           |
| `QWEN_TELEMETRY_ENABLED`                         | 设置为 `true` 或 `1` 以启用 telemetry。任何其他值视为禁用。                                                                                                                                                                                                                                  | 覆盖 `telemetry.enabled` 设置。                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `QWEN_TELEMETRY_TARGET`                          | 设置用于标识 telemetry 目标的信息标签（`local` 或 `gcp`）。不控制路由；请使用 `QWEN_TELEMETRY_OTLP_ENDPOINT` 或 `QWEN_TELEMETRY_OUTFILE` 配置数据发送位置。                                                                                                                            | 覆盖 `telemetry.target` 设置。                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `QWEN_TELEMETRY_OTLP_ENDPOINT`                   | 设置 telemetry 的 OTLP 端点。                                                                                                                                                                                                                                                              | 覆盖 `telemetry.otlpEndpoint` 设置。                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `QWEN_TELEMETRY_OTLP_PROTOCOL`                   | 设置 OTLP 协议（`grpc` 或 `http`）。                                                                                                                                                                                                                                                         | 覆盖 `telemetry.otlpProtocol` 设置。                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `QWEN_TELEMETRY_LOG_PROMPTS`                     | 设置为 `true` 或 `1` 以启用或禁用用户提示的日志记录。任何其他值视为禁用。                                                                                                                                                                                                                   | 覆盖 `telemetry.logPrompts` 设置。                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `QWEN_TELEMETRY_INCLUDE_SENSITIVE_SPAN_ATTRIBUTES` | 设置为 `true` 或 `1` 以将逐字用户提示、系统提示、工具 I/O 和模型响应附加到原生 OTel span 属性（并在日志到 span 的桥接 span 上保留 `prompt` / `function_args` / `response_text`）。任何其他值禁用。                                                                                        | 覆盖 `telemetry.includeSensitiveSpanAttributes` 设置。⚠️ 会将敏感数据流式传输到您的 OTLP 后端。                                                                                                                                                                                                                                                                                                                           |
| `QWEN_TELEMETRY_SENSITIVE_SPAN_ATTRIBUTE_MAX_LENGTH` | 设置每个敏感原生 OTel span 属性内容负载的最大 JavaScript 字符串长度。必须是一个不超过 `104857600`（100 MiB）的正整数。                                                                                               | 覆盖 `telemetry.sensitiveSpanAttributeMaxLength` 设置。默认值为 `1048576`（1 MiB）；如果收集器或后端拒绝大的 span 属性，请降低此值。                                                                                                                                                                                                                                                                                       |
| `QWEN_TELEMETRY_OUTFILE`                         | 设置将 telemetry 写入文件的路径。设置后将覆盖 OTLP 导出。                                                                                                                                                                                                                                  | 覆盖 `telemetry.outfile` 设置。                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `QWEN_SANDBOX`                                   | 替代 `settings.json` 中的 `sandbox` 设置。                                                                                                                                                                                                                                                  | 接受 `true`、`false`、`docker`、`podman` 或自定义命令字符串。                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `QWEN_SANDBOX_IMAGE`                             | 覆盖 Docker/Podman 的沙箱镜像选择。                                                                                                                                                                                                                                                         | 优先于 `tools.sandboxImage`。                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `SEATBELT_PROFILE`                               | （macOS 专用）在 macOS 上切换 Seatbelt（`sandbox-exec`）配置文件。                                                                                                                                                                                                                           | `permissive-open`：（默认）限制对项目文件夹（以及少数其他文件夹，请参阅 `packages/cli/src/utils/sandbox-macos-permissive-open.sb`）的写入，但允许其他操作。`strict`：使用严格配置文件，默认拒绝操作。`<profile_name>`：使用自定义配置文件。要定义自定义配置文件，需在项目的 `.qwen/` 目录中创建名为 `sandbox-macos-<profile_name>.sb` 的文件（例如 `my-project/.qwen/sandbox-macos-custom.sb`）。                                             |
| `DEBUG` 或 `DEBUG_MODE`                          | （通常由底层库或 CLI 自身使用）设置为 `true` 或 `1` 以启用详细调试日志记录，有助于故障排除。                                                                                                                                                                                               | **注意：** 默认情况下，这些变量会自动从项目 `.env` 文件中排除，以防止干扰 CLI 行为。如果您需要为 Qwen Code 专门设置这些变量，请使用 `.qwen/.env` 文件。                                                                                                                                                                                                                                                                     |
| `NO_COLOR`                                       | 设置为任意值以禁用 CLI 中所有颜色输出。                                                                                                                                                                                                                                                                |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `FORCE_HYPERLINK`                                | 覆盖 Markdown 渲染器中的 OSC 8 可点击链接检测。设置为 `1`（或任何非零整数，或空字符串）强制启用；设置为 `0` 或非数字值（如 `false` / `off`）强制禁用。会优先考虑其上层 `NO_COLOR` / `QWEN_DISABLE_HYPERLINKS` 的退出选择。 | 用于在 `tmux` / GNU `screen` 中启用 OSC 8（自动检测默认拒绝，因为主机终端的能力被多路复用器隐藏）。需要 `tmux 3.3+` 中设置 `set -g allow-passthrough on`。还会启用 Hyper，它不会被自动检测到。                                                                                                                                                                                                                                           |
| `QWEN_DISABLE_HYPERLINKS`                        | 设置为 `1` 可硬性禁用 Markdown 渲染器中的 OSC 8 可点击超链接，即使在自动检测为支持的终端上也是如此。                                                                                                                                                                                    | 当终端声称支持但长 URL 中断，或通过中间管道输出破坏转义序列时很有用。渲染器会回退到纯文本 `label (url)` 渲染。                                                                                                                                                                                                                                                                                                           |
| `CLI_TITLE`                                      | 设置为一个字符串以自定义 CLI 的标题。                                                                                                                                                                                                                                                       |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `CODE_ASSIST_ENDPOINT`                           | 指定代码辅助服务器的端点。                                                                                                                                                                                                                                                                   | 用于开发和测试。                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `QWEN_CODE_MAX_OUTPUT_TOKENS`                    | 覆盖每次响应的默认最大输出 token 数。未设置时，Qwen Code 使用自适应策略：以 8K token 开始，如果响应被截断，则自动重试 64K。设置为特定值（例如 `16000`）可使用固定限制。                                                      | 优先于带上限的默认值（8K），但会被设置中的 `samplingParams.max_tokens` 覆盖。设置后禁用自动升级。示例：`export QWEN_CODE_MAX_OUTPUT_TOKENS=16000`                                                                                                                                                                                                                                                                       |
| `QWEN_CODE_UNATTENDED_RETRY`                     | 设置为 `true` 或 `1` 以启用持久重试模式。启用后，瞬态 API 容量错误（HTTP 429 速率限制和 529 过载）会无限重试，带有指数退避（每次重试上限为 5 分钟）以及每 30 秒在 stderr 上心跳保活。                                                                                          | 设计用于 CI/CD 管道和后台自动化中，长时间运行的任务应能承受临时 API 中断。必须显式设置 —— 仅仅 `CI=true` 不会激活此模式。有关详细信息，请参阅 [Headless Mode](../features/headless#persistent-retry-mode)。示例：`export QWEN_CODE_UNATTENDED_RETRY=1`                                                                                                                                                              |
| `QWEN_CODE_PROFILE_STARTUP`                      | 设置为 `1` 以启用启动性能分析。将 JSON 定时报告写入 `~/.qwen/startup-perf/`，包含各阶段持续时间。                                                                                                                                                                                         | 仅在沙箱子进程（或使用 `QWEN_CODE_PROFILE_STARTUP_OUTER=1`）中生效。未设置时零开销。示例：`export QWEN_CODE_PROFILE_STARTUP=1`                                                                                                                                                                                                                                                                                           |
| `QWEN_CODE_PROFILE_STARTUP_OUTER`                | 与 `QWEN_CODE_PROFILE_STARTUP=1` 一起设置为 `1`，以在外部（沙箱前）进程中也收集启动分析。外部进程报告的文件名前缀为 `outer-`，以便与沙箱子进程的报告区分。                                                                                                                 | 默认关闭 —— 仅沙箱子进程收集，避免重复报告。对于 CLI 未重新启动进入沙箱的本地开发有用。                                                                                                                                                                                                                                                                                                                               |
| `QWEN_CODE_PROFILE_STARTUP_NO_HEAP`              | 与 `QWEN_CODE_PROFILE_STARTUP=1` 一起设置为 `1`，以跳过每个检查点的 `process.memoryUsage()` 快照。当需要测量分析器自身 Heisenberg 开销时有用。                                                                                                                                          | 默认关闭。堆快照每次约花费 50 µs（远低于总启动时间的 1%），所以大多数用户应保持默认。                                                                                                                                                                                                                                                                                                                               |
| `QWEN_CODE_LEGACY_MCP_BLOCKING`                  | 设置为 `1` 以恢复渐进式 MCP 之前的行为：`Config.initialize()` 会同步等待每个配置的 MCP 服务器的发现握手完成后才返回。                                                                                                      | 默认关闭。现代 qwen-code 让 MCP 服务器在后台上线，同时 UI 已经可以交互；模型在服务器稳定后约 16 ms 内看到每批新工具。此标志作为回滚逃生口保留至少一个发布版本。示例：`export QWEN_CODE_LEGACY_MCP_BLOCKING=1`                                                                                                                                             |
当用户级的 `.env` 文件中定义了相同的变量时，Qwen 专属文件优先级更高：`<QWEN_HOME>/.env`（或未设置 `QWEN_HOME` 时的 `~/.qwen/.env`）会在 `~/.env` 之前加载，且不会覆盖已有的环境变量值。

## 命令行参数

直接通过 CLI 运行时传入的参数可以覆盖本次会话的其他配置。

对于沙箱镜像选择，优先级顺序为：
`--sandbox-image` > `QWEN_SANDBOX_IMAGE` > `tools.sandboxImage` > 内置默认镜像。

### 命令行参数表

| 参数                           | 别名 | 描述                                                                                                                                                                                                                                     | 可能的值                                       | 备注                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| ------------------------------ | ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--model`                      | `-m` | 指定本次会话使用的 Qwen 模型。                                                                                                                                                                                                           | 模型名称                                       | 示例：`npm start -- --model qwen3-coder-plus`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `--prompt`                     | `-p` | 用于将提示直接传递给命令。这会以非交互模式调用 Qwen Code。                                                                                                                                                                               | 你的提示文本                                   | 对于脚本编写场景，请使用 `--output-format json` 标志获取结构化输出。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `--prompt-interactive`         | `-i` | 启动一个交互式会话，并将提供的提示作为初始输入。                                                                                                                                                                                         | 你的提示文本                                   | 提示在交互会话内部处理，而非会话之前。不能与通过 stdin 管道输入同时使用。示例：`qwen -i "解释这段代码"`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `--system-prompt`              |      | 覆盖本次运行的内置主会话系统提示。                                                                                                                                                                                                       | 你的提示文本                                   | 加载的上下文文件（如 `QWEN.md`）仍会在本次覆盖之后追加。可与 `--append-system-prompt` 结合使用。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `--append-system-prompt`       |      | 为本次运行的主会话系统提示追加额外指令。                                                                                                                                                                                                 | 你的提示文本                                   | 在内置提示和加载的上下文文件之后应用。可与 `--system-prompt` 结合使用。示例见[无头模式](../features/headless)。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `--output-format`              | `-o` | 指定非交互模式下 CLI 输出的格式。                                                                                                                                                                                                        | `text`，`json`，`stream-json`                   | `text`：（默认）标准人类可读输出。`json`：在执行结束时输出的机器可读 JSON。`stream-json`：在执行过程中事件发生时实时流式输出的 JSON 消息。如需结构化输出和脚本编写，请使用 `--output-format json` 或 `--output-format stream-json` 标志。详细信息见[无头模式](../features/headless)。                                                                                                                                                                                                                                                                   |
| `--input-format`               |      | 指定从标准输入读取的格式。                                                                                                                                                                                                               | `text`，`stream-json`                          | `text`：（默认）来自 stdin 或命令行参数的标准文本输入。`stream-json`：通过 stdin 实现双向通信的 JSON 消息协议。要求：使用 `--input-format stream-json` 时必须同时设置 `--output-format stream-json`。使用 `stream-json` 时，stdin 保留给协议消息。详细信息见[无头模式](../features/headless)。                                                                                                                                                                                                                                                                |
| `--include-partial-messages`   |      | 使用 `stream-json` 输出格式时包含部分助手消息。启用后，会在流式传输过程中发出流事件（message_start、content_block_delta 等）。                                                                                                            |                                                | 默认值：`false`。要求：必须同时设置 `--output-format stream-json`。有关流事件的详细信息，见[无头模式](../features/headless)。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `--sandbox`                    | `-s` | 启用本次会话的沙箱模式。                                                                                                                                                                                                                 |                                                |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `--sandbox-image`              |      | 设置沙箱镜像 URI。                                                                                                                                                                                                                       |                                                |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `--debug`                      | `-d` | 启用本次会话的调试模式，提供更详细的输出。                                                                                                                                                                                               |                                                |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `--all-files`                  | `-a` | 如果设置，递归地将当前目录下的所有文件作为上下文包含进来。                                                                                                                                                                               |                                                |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `--help`                       | `-h` | 显示关于命令行参数的帮助信息。                                                                                                                                                                                                           |                                                |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `--show-memory-usage`          |      | 显示当前内存使用情况。                                                                                                                                                                                                                   |                                                |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `--yolo`                       |      | 启用 YOLO 模式，自动批准所有工具调用。                                                                                                                                                                                                   |                                                |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `--approval-mode`              |      | 设置工具调用的审批模式。                                                                                                                                                                                                                 | `plan`，`default`，`auto-edit`，`auto`，`yolo` | 支持的模式：`plan`：仅分析——不修改文件或执行命令。`default`：对文件编辑或 shell 命令需要审批（默认行为）。`auto-edit`：自动批准编辑工具（`edit`、`write_file`、`notebook_edit`），其他工具则提示审批。`auto`：LLM 分类器自动批准安全操作并阻止高风险操作。`yolo`：自动批准所有工具调用（等同于 `--yolo`）。不能与 `--yolo` 同时使用。请使用 `--approval-mode=yolo` 代替 `--yolo` 以采用新的统一方式。示例：`qwen --approval-mode auto-edit`<br>详见[审批模式](../features/approval-mode)。 |
| `--allowed-tools`              |      | 以逗号分隔的工具名称列表，这些工具将绕过确认对话框。                                                                                                                                                                                     | 工具名称                                       | 示例：`qwen --allowed-tools "Shell(git status)"`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `--disabled-slash-commands`    |      | 要隐藏/禁用的斜杠命令名称（逗号分隔或重复指定）。与 `slashCommands.disabled` 设置和 `QWEN_DISABLED_SLASH_COMMANDS` 环境变量合并。对最终命令名称进行不区分大小写的匹配。                                                                 | 命令名称                                       | 示例：`qwen --disabled-slash-commands "auth,mcp,extensions"`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `--telemetry`                  |      | 启用[遥测](../../developers/development/telemetry.md)。                                                                                                                                                                                   |                                                |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `--telemetry-target`           |      | 设置遥测目标。                                                                                                                                                                                                                           |                                                | 更多信息见[遥测](../../developers/development/telemetry.md)。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `--telemetry-otlp-endpoint`    |      | 设置遥测的 OTLP 端点。                                                                                                                                                                                                                   |                                                | 更多信息见[遥测](../../developers/development/telemetry.md)。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `--telemetry-otlp-protocol`    |      | 设置遥测的 OTLP 协议（`grpc` 或 `http`）。                                                                                                                                                                                               |                                                | 默认值：`grpc`。更多信息见[遥测](../../developers/development/telemetry.md)。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `--telemetry-log-prompts`      |      | 启用将提示记录到遥测中。                                                                                                                                                                                                                 |                                                | 更多信息见[遥测](../../developers/development/telemetry.md)。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `--acp`                        |      | 启用 ACP 模式（Agent Client Protocol）。适用于 IDE/编辑器集成，如 [Zed](../integration-zed)。                                                                                                                                             |                                                | 稳定。取代已弃用的 `--experimental-acp` 标志。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `--experimental-lsp`           |      | 启用实验性的 [LSP（语言服务器协议）](../features/lsp) 功能，用于代码智能（跳转到定义、查找引用、诊断等）。                                                                                                                               |                                                | 实验性功能。需要安装语言服务器。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `--extensions`                 | `-e` | 指定本次会话要使用的扩展列表。                                                                                                                                                                                                           | 扩展名称                                       | 如果未提供，则使用所有可用的扩展。使用特殊标记 `qwen -e none` 可以禁用所有扩展。示例：`qwen -e my-extension -e my-other-extension`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `--list-extensions`            | `-l` | 列出所有可用的扩展并退出。                                                                                                                                                                                                               |                                                |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `--proxy`                      |      | 设置 CLI 的代理。                                                                                                                                                                                                                        | 代理 URL                                       | 示例：`--proxy http://localhost:7890`。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `--include-directories`        |      | 将额外的目录包含到工作区，以支持多目录。                                                                                                                                                                                                 | 目录路径                                       | 可以多次指定或以逗号分隔的值形式指定。最多可添加 5 个目录。示例：`--include-directories /path/to/project1,/path/to/project2` 或 `--include-directories /path/to/project1 --include-directories /path/to/project2`                                                                                                                                                                                                                                                                                                                                                                                                |
| `--screen-reader`              |      | 启用屏幕阅读器模式，调整 TUI 以更好地兼容屏幕阅读器。                                                                                                                                                                                    |                                                |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `--version`                    |      | 显示 CLI 的版本。                                                                                                                                                                                                                        |                                                |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `--openai-logging`             |      | 启用 OpenAI API 调用的日志记录，用于调试和分析。                                                                                                                                                                                          |                                                | 该标志会覆盖 `settings.json` 中的 `enableOpenAILogging` 设置。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `--openai-logging-dir`         |      | 设置 OpenAI API 日志的自定义目录路径。                                                                                                                                                                                                   | 目录路径                                       | 该标志会覆盖 `settings.json` 中的 `openAILoggingDir` 设置。支持绝对路径、相对路径以及 `~` 展开。示例：`qwen --openai-logging-dir "~/qwen-logs" --openai-logging`                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
## 上下文文件（层级化指令上下文）

虽然严格来说不属于 CLI _行为_ 的配置，但上下文文件（默认名为 `QWEN.md`，可通过 `context.fileName` 设置配置）对于配置 _指令上下文_（也称为“记忆”）至关重要。这一强大功能允许你向 AI 提供项目特定的指令、编码风格指南或任何相关的背景信息，使其响应更贴合你的需求。CLI 包含一些 UI 元素，例如页脚中显示已加载上下文文件数量的指示器，让你随时了解活跃的上下文状态。

- **作用：** 这些 Markdown 文件包含你希望 Qwen 模型在交互过程中了解到的指令、指南或上下文。系统设计为以层级方式管理此指令上下文。

### 上下文文件内容示例（例如 `QWEN.md`）

下面是一个概念性示例，展示了在 TypeScript 项目根目录下的上下文文件可能包含的内容：

```
# 项目：我的超棒 TypeScript 库

## 通用指令：
- 生成新的 TypeScript 代码时，请遵循现有的编码风格。
- 确保所有新函数和类都包含 JSDoc 注释。
- 在适当的情况下优先使用函数式编程范式。
- 所有代码应兼容 TypeScript 5.0 和 Node.js 22+。

## 编码风格：
- 使用 2 个空格进行缩进。
- 接口名称应以 `I` 为前缀（例如 `IUserService`）。
- 私有类成员应以下划线 (`_`) 为前缀。
- 始终使用严格相等（`===` 和 `!==`）。

## 特定组件：`src/api/client.ts`
- 此文件处理所有出站 API 请求。
- 添加新的 API 调用函数时，请确保包含健壮的错误处理和日志记录。
- 所有 GET 请求使用现有的 `fetchWithRetry` 工具。

## 关于依赖项：
- 除非绝对必要，否则避免引入新的外部依赖项。
- 如果必须添加新依赖项，请说明原因。
```

此示例展示了如何提供通用项目上下文、特定编码约定，甚至关于特定文件或组件的说明。你的上下文文件越相关、越精确，AI 就越能更好地帮助你。强烈建议使用项目特定的上下文文件来建立约定和上下文。

- **层级加载与优先级：** CLI 通过从多个位置加载上下文文件（例如 `QWEN.md`）来实现层级化记忆系统。列表中较低位置（更具体）的文件内容通常会覆盖或补充较高位置（更通用）的文件内容。确切的拼接顺序和最终上下文可通过 `/memory` 对话框查看。典型的加载顺序为：
  1. **全局上下文文件：**
     - 位置：`~/.qwen/<配置的上下文文件名>`（例如，用户主目录下的 `~/.qwen/QWEN.md`）。
     - 作用范围：为所有项目提供默认指令。
  2. **项目根目录及祖先目录的上下文文件：**
     - 位置：CLI 会在当前工作目录以及每个父目录（直到由 `.git` 文件夹标识的项目根目录或你的主目录）中搜索配置的上下文文件。
     - 作用范围：提供与整个项目或其重要部分相关的上下文。
- **拼接与 UI 指示：** 所有找到的上下文文件的内容会被拼接（并添加指示其来源和路径的分隔符），然后作为系统提示的一部分提供。CLI 页脚会显示已加载的上下文文件数量，让你快速了解活跃的指令上下文。
- **导入内容：** 你可以使用 `@path/to/file.md` 语法导入其他 Markdown 文件，从而将上下文文件模块化。更多详情请参阅[记忆文档](../features/memory.md)。
- **记忆管理命令：**
  - 使用 `/memory` 打开记忆管理对话框。
  - 在对话框中刷新记忆，以重新扫描并重新加载所有配置位置中的上下文文件。
  - 关于 `/memory` 命令的完整详情，请参阅[命令文档](../features/commands.md)。

通过理解并利用这些配置层以及上下文文件的层级特性，你可以有效管理 AI 的记忆，并使 Qwen Code 的响应更贴合你的特定需求和项目。

## 沙箱

Qwen Code 可以在沙箱化环境中执行潜在不安全的操作（如 shell 命令和文件修改），以保护你的系统。

[沙箱](../features/sandbox) 默认禁用，但你可以通过以下几种方式启用它：

- 使用 `--sandbox` 或 `-s` 标志。
- 设置 `QWEN_SANDBOX` 环境变量。
- 在设置中设置 `tools.sandbox`。

> ⚠️ **`--yolo` 不会自动启用沙箱。** YOLO 模式仅自动批准工具调用；沙箱仍需通过 `--sandbox`、`QWEN_SANDBOX` 或 `tools.sandbox` 选择启用。在无头/非交互式运行中，如果使用 `--yolo`（或 `--approval-mode=yolo`）且未启用沙箱，模型可以以当前进程的权限级别执行 shell、写入和编辑工具——在这种情况下，Qwen Code 会向 stderr 打印警告。一旦你已审查了相关权衡，可通过设置 `QWEN_CODE_SUPPRESS_YOLO_WARNING=1` 来抑制该警告。

默认情况下，它使用预构建的 `qwen-code-sandbox` Docker 镜像。

如果需要对特定项目进行沙箱定制，你可以在项目根目录下创建自定义 Dockerfile 文件 `.qwen/sandbox.Dockerfile`。此 Dockerfile 可以基于基本沙箱镜像：

```
FROM qwen-code-sandbox
# 在此处添加自定义依赖项或配置
# 例如：
# RUN apt-get update && apt-get install -y some-package
# COPY ./my-config /app/my-config
```

当 `.qwen/sandbox.Dockerfile` 存在时，你可以使用 `BUILD_SANDBOX` 环境变量运行 Qwen Code，以自动构建自定义沙箱镜像：

```
BUILD_SANDBOX=1 qwen -s
```

## 使用统计数据

为了帮助我们改进 Qwen Code，我们会收集匿名化的使用统计数据。这些数据有助于我们了解 CLI 的使用方式、识别常见问题并优先处理新功能。

**我们收集的内容：**

- **工具调用：** 我们记录调用的工具名称、调用是否成功以及执行耗时。我们不会收集传递给工具的参数或工具返回的任何数据。
- **API 请求：** 我们记录每次请求使用的模型、请求耗时以及是否成功。我们不会收集提示或响应的内容。
- **会话信息：** 我们收集有关 CLI 配置的信息，例如已启用的工具和审批模式。

**我们不收集的内容：**

- **个人身份信息 (PII)：** 我们不会收集任何个人信息，例如你的姓名、电子邮件地址或 API 密钥。
- **提示和响应内容：** 我们不会记录你的提示内容或模型的响应。
- **文件内容：** 我们不会记录 CLI 读取或写入的任何文件的内容。

**如何选择退出：**

你可以随时通过在 `settings.json` 文件中的 `privacy` 类别下将 `usageStatisticsEnabled` 属性设置为 `false` 来退出使用统计数据的收集：

```
{
  "privacy": {
    "usageStatisticsEnabled": false
  }
}
```

> [!note]
>
> 当使用统计数据启用时，事件会被发送到阿里云 RUM 采集端点。