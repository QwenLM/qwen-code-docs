# Qwen Code 配置

> [!tip]
>
> **身份验证 / API 密钥：** 身份验证（API Key、阿里云 Coding 计划）以及与身份验证相关的环境变量（如 `OPENAI_API_KEY`）记录在 **[身份验证](../configuration/auth)** 中。

> [!note]
>
> **关于新配置格式的说明**：`settings.json` 文件的格式已更新为新的、更有条理的结构。旧格式将自动迁移。
> Qwen Code 提供了多种配置其行为的方式，包括环境变量、命令行参数和设置文件。本文档概述了不同的配置方法和可用的设置。

## 配置层级

配置按以下优先级顺序应用（数字较小的会被数字较大的覆盖）：

| 级别 | 配置来源 | 描述 |
| --- | --- | --- |
| 1 | 默认值 | 应用程序内硬编码的默认值 |
| 2 | 系统默认文件 | 系统范围的默认设置，可被其他设置文件覆盖 |
| 3 | 用户设置文件 | 当前用户的全局设置 |
| 4 | 项目设置文件 | 特定于项目的设置 |
| 5 | 系统设置文件 | 覆盖所有其他设置文件的系统范围设置 |
| 6 | 环境变量 | 系统范围或特定于会话的变量，可能从 `.env` 文件加载 |
| 7 | 命令行参数 | 启动 CLI 时传递的值 |

## 设置文件

Qwen Code 使用 JSON 设置文件进行持久化配置。这些文件有四个位置：

| 文件类型 | 位置 | 作用域 |
| --- | --- | --- |
| 系统默认文件 | Linux: `/etc/qwen-code/system-defaults.json`<br>Windows: `C:\ProgramData\qwen-code\system-defaults.json`<br>macOS: `/Library/Application Support/QwenCode/system-defaults.json` <br>可以使用 `QWEN_CODE_SYSTEM_DEFAULTS_PATH` 环境变量覆盖该路径。 | 提供系统范围默认设置的基础层。这些设置的优先级最低，旨在被用户、项目或系统覆盖设置所覆盖。 |
| 用户设置文件 | `~/.qwen/settings.json`（其中 `~` 是你的主目录）。 | 应用于当前用户的所有 Qwen Code 会话。 |
| 项目设置文件 | 项目根目录下的 `.qwen/settings.json`。 | 仅在从该特定项目运行 Qwen Code 时应用。项目设置会覆盖用户设置。 |
| 系统设置文件 | Linux： `/etc/qwen-code/settings.json` <br>Windows: `C:\ProgramData\qwen-code\settings.json` <br>macOS: `/Library/Application Support/QwenCode/settings.json`<br>可以使用 `QWEN_CODE_SYSTEM_SETTINGS_PATH` 环境变量覆盖该路径。 | 应用于系统上所有用户的所有 Qwen Code 会话。系统设置会覆盖用户和项目设置。对于企业系统管理员来说，这可能有助于控制用户的 Qwen Code 设置。 |

> [!note]
>
> **关于设置中环境变量的说明**：`settings.json` 文件中的字符串值可以使用 `$VAR_NAME` 或 `${VAR_NAME}` 语法引用环境变量。这些变量将在加载设置时自动解析。例如，如果你有一个环境变量 `MY_API_TOKEN`，你可以在 `settings.json` 中这样使用它：`"apiKey": "$MY_API_TOKEN"`。

### 项目中的 `.qwen` 目录

除了项目设置文件外，项目的 `.qwen` 目录还可以包含与 Qwen Code 运行相关的其他特定于项目的文件，例如：

- [自定义沙盒配置](../features/sandbox)（例如 `.qwen/sandbox-macos-custom.sb`、`.qwen/sandbox.Dockerfile`）。
- `.qwen/skills/` 下的 [Agent Skills](../features/skills)（每个 Skill 是一个包含 `SKILL.md` 的目录）。

### 配置迁移

Qwen Code 会自动将旧版配置设置迁移到新格式。旧设置文件会在迁移前进行备份。以下设置已从否定命名（`disable*`）重命名为肯定命名（`enable*`）：

| 旧设置 | 新设置 | 说明 |
| --- | --- | --- |
| `disableAutoUpdate` + `disableUpdateNag` | `general.enableAutoUpdate` | 合并为单个设置 |
| `disableLoadingPhrases` | `ui.accessibility.enableLoadingPhrases` | |
| `disableFuzzySearch` | `context.fileFiltering.enableFuzzySearch` | |
| `disableCacheControl` | `model.generationConfig.enableCacheControl` | |

> [!note]
>
> **布尔值反转：** 迁移时，布尔值会被反转（例如，`disableAutoUpdate: true` 变为 `enableAutoUpdate: false`）。

#### `disableAutoUpdate` 和 `disableUpdateNag` 的合并策略

当两个旧设置同时存在且值不同时，迁移遵循以下策略：如果 `disableAutoUpdate` 或 `disableUpdateNag` 中**任意一个**为 `true`，则 `enableAutoUpdate` 变为 `false`：

| `disableAutoUpdate` | `disableUpdateNag` | 迁移后的 `enableAutoUpdate` |
| --- | --- | --- |
| `false` | `false` | `true` |
| `false` | `true` | `false` |
| `true` | `false` | `false` |
| `true` | `true` | `false` |

### `settings.json` 中的可用设置

设置被组织成不同的类别。大多数设置应放置在 `settings.json` 文件中对应的顶级类别对象内。为了保持兼容性，少数顶级设置（如 `proxy` 和 `plansDirectory`）仍保留为直接的根键。

#### general

| 设置 | 类型 | 描述 | 默认值 |
| --- | --- | --- | --- |
| `general.preferredEditor` | string | 用于打开文件的首选编辑器。 | `undefined` |
| `general.vimMode` | boolean | 启用 Vim 键绑定。 | `false` |
| `general.enableAutoUpdate` | boolean | 启用启动时的自动更新检查和安装。 | `true` |
| `general.showSessionRecap` | boolean | 离开终端后返回时，自动显示单行的“上次离开时的状态”回顾。默认关闭。无论此设置如何，均可使用 `/recap` 手动触发。 | `false` |
| `general.sessionRecapAwayThresholdMinutes` | number | 终端必须失去焦点的分钟数，才会在重新获得焦点时触发自动回顾。仅在启用 `showSessionRecap` 时使用。 | `5` |
| `general.gitCoAuthor.commit` | boolean | 在 git 提交信息中添加 Co-authored-by 尾部，并为通过 Qwen Code 进行的提交附加每个文件的 AI 归属 git note（`refs/notes/ai-attribution`）。禁用则跳过这两者。 | `true` |
| `general.gitCoAuthor.pr` | boolean | 在运行 `gh pr create` 时，将 Qwen Code 归属行追加到 pull request 描述中。 | `true` |
| `general.defaultFileEncoding` | enum | 新文件的默认编码。使用 `"utf-8"`（默认）表示无 BOM 的 UTF-8，或使用 `"utf-8-bom"` 表示带 BOM 的 UTF-8。仅当你的项目特别需要 BOM 时才更改此项。 | `"utf-8"` |
| `general.voice.enabled` | boolean | 在提示输入中启用语音听写。也可通过 `/voice` 命令切换。需要配置转录模型（`voiceModel`）。 | `false` |
| `general.voice.mode` | enum | 按键说话的行为方式：`"hold"` 表示按住按键时说话，或 `"tap"` 表示点击开始，再次点击（或暂停）停止并提交。 | `"hold"` |
| `general.voice.language` | string | 语音转录的首选口语语言（例如 `"english"`、`"chinese"`）。留空以自动检测。 | `""` |
| `general.voice.keytermsFile` | string | 自定义关键词文件的路径（每行一个词，`#` 表示注释），用于使语音转录偏向特定领域的术语。相对路径从工作区根目录解析；存在时默认为 `.qwen/voice-keyterms.txt`。仅在受信任的工作区中读取。仅适用于 Qwen ASR 模型（`qwen3-asr-*`）。 | `""` |
| `general.voice.refineTranscript` | boolean | 在插入语音转录之前，使用快速模型对其进行清理——去除填充词并修复识别错误，同时保留原意。失败时回退到原始转录，未配置快速模型时跳过此步骤。 | `true` |
| `general.cleanupPeriodDays` | number | 保留 `~/.qwen/file-history/` 会话备份的天数，这些备份由 `/rewind` 使用。超过此时间的备份将由后台任务移除，该任务每天最多运行一次。`0` = 最小保留时间（约 1 小时）：保留过去一小时内触及的会话以及当前活动的会话。更改在重启后生效。 | `30` |
| `general.language` | enum | 用户界面的语言。使用 `"auto"` 从系统设置中检测，或使用语言代码（例如 `"zh-CN"`、`"fr"`）。可以通过将 JS 语言环境文件放在 `~/.qwen/locales/` 中来添加自定义代码。请参阅 [i18n](../features/language)。需要重启。 | `"auto"` |
| `general.outputLanguage` | string | 模型输出的语言。使用 `"auto"` 从系统设置中检测，或设置特定语言。需要重启。 | `"auto"` |
| `general.dynamicCommandTranslation` | boolean | 启用动态斜杠命令描述的 AI 翻译。禁用时，动态命令保留其原始描述并跳过翻译模型调用。 | `false` |
| `general.terminalBell` | boolean | 当响应完成或需要批准时，播放终端提示音。 | `true` |
| `general.preventSystemSleep` | boolean | 在 Qwen Code 流式传输模型响应或执行工具时，防止系统进入睡眠状态。空闲提示时间和权限提示不会阻止睡眠。在启动时读取一次，因此更改在重启后生效。 | `true` |
| `general.chatRecording` | boolean | 将聊天记录保存到磁盘。禁用此功能也会阻止 `--continue` 和 `--resume` 工作。需要重启。 | `true` |
#### output

| 设置                    | 类型    | 描述                                                         | 默认值   | 可选值             |
| ----------------------- | ------- | ------------------------------------------------------------ | -------- | ------------------ |
| `output.format`         | string  | CLI 输出的格式。                                             | `"text"` | `"text"`, `"json"` |
| `output.showTimestamps` | boolean | 在每个助手响应前显示 `[HH:MM:SS]` 时间戳。                   | `false`  |                    |

#### ui

| 设置                                  | 类型             | 描述                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | 默认值        |
| ------------------------------------- | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------- |
| `ui.theme`                            | string           | UI 的颜色主题。可用选项请参见[主题](../configuration/themes)。                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | `"Qwen Dark"` |
| `ui.customThemes`                     | object           | 自定义主题定义。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | `{}`          |
| `ui.statusLine`                       | object           | 自定义状态栏配置。支持 `command`、`refreshInterval`、`respectUserColors` 和 `hideContextIndicator` 选项。请参见[状态栏](../features/status-line)。                                                                                                                                                                                                                                                                                                                                                                                            | `undefined`   |
| `ui.hideWindowTitle`                  | boolean          | 隐藏窗口标题栏。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | `false`       |
| `ui.hideTips`                         | boolean          | 隐藏 UI 中的所有提示（启动时和响应后）。请参见[上下文提示](../features/tips)。                                                                                                                                                                                                                                                                                                                                                                                                                                                              | `false`       |
| `ui.hideBanner`                       | boolean          | 隐藏启动时的 ASCII 徽标和信息面板。除非同时设置了 `ui.hideTips`，否则提示和聊天输入仍会渲染。                                                                                                                                                                                                                                                                                                                                                                                                                                               | `false`       |
| `ui.customBannerTitle`                | string           | 替换信息面板中默认的 `>_ Qwen Code` 标题。始终会追加 `(vX.Y.Z)` 版本后缀；身份验证、模型和路径行不受影响。经过清理；上限为 80 个字符。                                                                                                                                                                                                                                                                                                                                                                                                        | `""`          |
| `ui.customBannerSubtitle`             | string           | 可选的副标题行，渲染在徽标标题和身份验证/模型行之间，以替代空白间隔行。经过清理；上限为 160 个字符。为空（默认）则保留原始的空白间隔。                                                                                                                                                                                                                                                                                                                                                                                                        | `""`          |
| `ui.customAsciiArt`                   | string \| object | 替换信息面板中的 QWEN ASCII 徽标。接受内联字符串（同时用于两个宽度层级）、`{ "path": "./brand.txt" }`（相对路径相对于所属设置文件的目录解析；在 POSIX 上使用 `O_NOFOLLOW` 在启动时读取一次，上限为 64 KB），或 `{ "small": ..., "large": ... }` 以进行宽度感知选择。经过清理；每个层级上限为 200 行 × 200 列。                                                                                                                                                                | `undefined`   |
| `ui.showLineNumbers`                  | boolean          | 在 CLI 输出的代码块中显示行号。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | `true`        |
| `ui.renderMode`                       | string           | 默认的 Markdown 显示模式。使用 `"render"` 获得丰富的视觉预览，或使用 `"raw"` 默认显示面向源码的 Markdown。在会话期间使用 `Alt/Option+M` 切换；在 macOS 上，终端必须将 Option 作为 Meta 发送。请参见 [Markdown 渲染](../features/markdown-rendering)。                                                                                                                                                                                                                                                                                         | `"render"`    |
| `ui.showCitations`                    | boolean          | 在聊天中显示生成文本的引用。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | `false`       |
| `ui.history.collapseOnResume`         | boolean          | 恢复会话时是否默认折叠历史记录。可通过 `/history collapse-on-resume` 和 `/history expand-on-resume` 切换。                                                                                                                                                                                                                                                                                                                                                                                                                                  | `false`       |
| `ui.history.collapsePreviewCount`     | number           | 启用 `ui.history.collapseOnResume` 时保持可见的最近用户对话轮数。`0` 默认折叠所有恢复的历史记录；`-1` 显示所有恢复的历史记录。                                                                                                                                                                                                                                                                                                                                                                                                              | `0`           |
| `ui.compactMode`                      | boolean          | 在终端 UI 中已退役。CLI 现在始终在主转录中显示紧凑的、基于类型的工具视图；按 `Ctrl+O` 切换展开详情模式（展开或折叠所有思考块和工具输出内联），而不是切换模式。Web shell 仍然支持此设置。                                                                                                                                                                                                                                                                                                                                                             | `false`       |
| `ui.shellOutputMaxLines`              | number           | 内联显示的 shell 输出最大行数。设置为 `0` 可禁用上限并显示完整输出。隐藏的行通过 `+N lines` 指示器显示。错误、以 `!` 为前缀的用户发起命令、确认工具以及聚焦的嵌入式 shell 始终显示完整输出。                                                                                                                                                                                                                                                                                                                                              | `5`           |
| `ui.enableWelcomeBack`                | boolean          | 返回具有对话历史记录的项目时显示欢迎回来对话框。启用后，Qwen Code 将自动检测你是否返回到具有先前生成的项目摘要（`.qwen/PROJECT_SUMMARY.md`）的项目，并显示一个对话框，允许你继续之前的对话或重新开始。如果你选择**开始新的聊天会话**，该选择将被当前项目记住，直到项目摘要发生变化。此功能与 `/summary` 命令和退出确认对话框集成。                                                                                                                                                                                                                | `true`        |
| `ui.accessibility.enableLoadingPhrases` | boolean          | 启用加载提示语（可禁用以满足无障碍需求）。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | `true`        |
| `ui.accessibility.screenReader`       | boolean          | 启用屏幕阅读器模式，该模式会调整 TUI 以更好地兼容屏幕阅读器。                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | `false`       |
| `ui.customWittyPhrases`               | array of strings | 在加载状态下显示的自定义提示语列表。提供后，CLI 将循环显示这些提示语，而不是默认的提示语。                                                                                                                                                                                                                                                                                                                                                                                                                                                  | `[]`          |
| `ui.showResponseTokensPerSecond`      | boolean          | 在模型流式传输时，在响应 token 计数器旁边显示实时的 tokens/sec 估算值。这是一个生成速度提示，而非预计完成时间或完成百分比。在下一个会话中生效。                                                                                                                                                                                                                                                                                                                                                                                             | `false`       |
| `ui.enableFollowupSuggestions`        | boolean          | 启用[后续建议](../features/followup-suggestions)，在模型响应后预测你接下来想输入的内容。建议以占位符文本的形式出现，可通过 Tab、Enter 或右方向键接受（这会填充输入框——不会自动提交）。默认开启；设置为 `false` 可退出。                                                                                                                                                                                                                                                                                                                     | `true`        |
| `ui.enableCacheSharing`               | boolean          | 对建议生成使用缓存感知的分支查询。降低支持前缀缓存的提供商的成本（实验性）。                                                                                                                                                                                                                                                                                                                                                                                                                                                                | `true`        |
| `ui.enableSpeculation`                | boolean          | 在提交前推测性地执行已接受的建议。接受后结果会立即显示（实验性）。                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | `false`       |
| `ui.showStatusInTitle`                | boolean          | 在终端窗口标题中显示 Qwen Code 会话名称和状态。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | `true`        |
| `ui.disableWorkflowKeywordTrigger`    | boolean          | 当为 `true` 时，在提示中提及 `workflow` 一词不再会隐式地将对话转向 Workflow 工具（并且会抑制页脚的 `workflow active` 指示器）。仅在启用工作流时适用。                                                                                                                                                                                                                                                                                                                                                                                       | `false`       |
| `ui.enableUserFeedback`               | boolean          | 在对话后显示可选的反馈对话框，以帮助提升 Qwen 的性能。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | `true`        |
| `ui.compactInline`                    | boolean          | 在每个组内紧凑显示工具，而不是跨组合并。需要启用 `ui.compactMode`。需要重启。                                                                                                                                                                                                                                                                                                                                                                                                                                                               | `false`       |
| `ui.useTerminalBuffer`                | boolean          | 在应用内的可滚动视口中渲染对话历史记录，而不是使用终端的回滚缓冲区。在兼容的交互式终端中默认启用，以避免长会话中的闪烁、滚动风暴和界面冻结。使用 `Shift+↑/↓`（行）、`PgUp`/`PgDn`（页）、`Ctrl+Home/End`（顶部/底部）或鼠标滚轮进行滚动。启用时不使用主机终端的回滚缓冲区；拖动选择文本（双击/三击选择词/行），或拖动时按住 `Shift`（在 macOS 上为 `Option`）以使用终端自身的选择。鼠标交互（滚轮、拖动选择、点击、悬停）需要 `ui.mouseTracking`（默认开启）。                                                                                                                                | `true`        |
| `ui.showScrollbar`                    | boolean          | 在应用内的可滚动视口（虚拟化历史）中显示自动隐藏的滚动条。滚动时出现，空闲时淡出。禁用以完全隐藏。仅适用于交互式终端 UI。                                                                                                                                                                                                                                                                                                                                                                                                              | `true`        |
| `ui.mouseTracking`                    | boolean          | 启用应用内的 SGR 鼠标追踪，用于文本选择、文本输入中的点击定位、行悬停、历史项切换和视口滚动。启用时，终端将所有鼠标事件转发给应用，因此原生右键上下文菜单和 OSC 8 超链接点击不可用。禁用以恢复原生右键和可点击的 URL 链接；这会关闭所有应用内鼠标交互，并且在虚拟化历史中滚轮不再滚动转录——请改用 Shift+↑/↓、PgUp/PgDn 或 Ctrl+Home/End（配合 `ui.useTerminalBuffer: false` 以恢复原生终端回滚缓冲区）。仅适用于交互式终端 UI。                                                                                                    | `true`        |
| `ui.hideBuiltinWorktreeIndicator`     | boolean          | 隐藏页脚中内置的 `⎇ worktree-<branch> (<slug>)` 行。worktree 状态仍会通过 stdin 负载传递给自定义状态栏脚本。除非你的自定义状态栏自行渲染 worktree，否则请保持默认值。                                                                                                                                                                                                                                                                                                                                                                       | `false`       |
#### ide

| 设置                 | 类型    | 描述                             | 默认值    |
| -------------------- | ------- | -------------------------------- | --------- |
| `ide.enabled`        | boolean | 启用 IDE 集成模式。              | `false`   |
| `ide.hasSeenNudge`   | boolean | 用户是否已看过 IDE 集成提示。    | `false`   |

#### privacy

| 设置                             | 类型    | 描述                   | 默认值    |
| -------------------------------- | ------- | ---------------------- | --------- |
| `privacy.usageStatisticsEnabled` | boolean | 启用使用统计信息收集。 | `true`    |

#### model

| 设置                                               | 类型    | 描述                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | 默认值      |
| -------------------------------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- |
| `model.name`                                       | string  | 用于对话的 Qwen 模型。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | `undefined` |
| `model.reasoningEffort`                            | enum    | 具备推理能力的模型的思考深度，适用于所有提供商。通过 [`/effort`](../features/commands) 命令设置（`low`、`medium`、`high`、`xhigh`、`max`）。每个提供商会将其映射并限制在当前活动模型支持的范围内（例如，Gemini 最高限制为 `high`；Anthropic 会限制模型不支持的层级）。留空则使用模型/提供商的默认值。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | `undefined` |
| `model.baseUrl`                                    | string  | 由模型选择器自动持久化，用于在多个 `modelProviders` 条目共享相同模型 id 时进行消歧。不建议手动设置——请使用 `/model` 选择器或 `modelProviders` 条目代替；过时或手动编辑的值可能会将请求静默路由到具有相同 id 的其他提供商。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | `undefined` |
| `model.sessionTokenLimit`                          | number  | 发送下一条消息前允许记录的最大 prompt token 数量。`-1` 表示无限制；`0` 也被视为无限制（与 `model.maxToolCalls` 不同，后者 `0` 表示禁止所有调用）。当记录的 prompt 数量超过限制时，下一次发送将被丢弃（会话不会中止）。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | `-1`        |
| `model.maxSessionTurns`                            | integer | 会话中保留的 user/model/tool 轮次的最大数量。-1 表示无限制。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | `-1`        |
| `model.maxWallTimeSeconds`                         | number  | 无头/无人值守运行的实际时间预算，单位为秒。`-1` 表示无限制。可通过 `--max-wall-time` 在每次调用时覆盖，该参数需要正数时长（`90`、`30s`、`5m`、`1h`、`1.5h`）；最小值为 1 秒——小于 1 秒的值（`500ms`、`0.5`）会被视为拼写错误而拒绝。省略该标志将回退到此设置。超时时以退出码 55 中止。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | `-1`        |
| `model.maxToolCalls`                               | number  | 单次运行的累计工具调用预算（计算每次执行的工具，无论成功或失败；`--json-schema` 下的 `structured_output` 除外）。`-1` 表示无限制；`0` 表示“不允许工具调用”。上限为 1,000,000 以防止输入错误。可通过 `--max-tool-calls` 覆盖。超时时以退出码 55 中止。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | `-1`        |
| `model.maxSubagentDepth`                           | number  | 子代理的最大嵌套深度（基于 1 的层级：顶层子代理为第 1 级）。`1` 保持子代理可用但禁用嵌套——即嵌套功能引入前的行为。值会被限制在 1–100 范围内；非有限值将回退到默认值。无论此设置如何，Teammates、forks 和工作流生成的代理永远不会嵌套。可通过 `--max-subagent-depth` 覆盖。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | `5`         |
| `model.generationConfig`                           | object  | 传递给底层内容生成器的高级覆盖配置。支持请求控制，如 `timeout`、`maxRetries`、`retryInitialDelayMs`、`retryMaxDelayMs`、`enableCacheControl`、`splitToolMedia`（默认 `true`；将工具返回的媒体——包括内置 read_file 读取的图像——拆分为后续的用户消息，而不是违反规范的 `role: "tool"` 消息，以便 doubao / new-api / LM Studio 等严格的 OpenAI 兼容服务器能够识别；设置为 `false` 可恢复旧版嵌入工具的行为）、`toolResultContentFormat`（默认 `"parts"`；仅当旧版 OpenAI 兼容运行时的工具模板忽略文本内容部分时，才设置为 `"string"`）、`contextWindowSize`（覆盖模型的上下文窗口大小）、`modalities`（覆盖自动检测的输入模态）、`customHeaders`（API 请求的自定义 HTTP 标头）和 `extra_body`（仅适用于 OpenAI 兼容 API 请求的额外 body 参数），以及 `samplingParams` 下的微调旋钮（例如 `temperature`、`top_p`、`max_tokens`）。留空则依赖提供商默认值。 | `undefined` |
| `model.chatCompression.contextPercentageThreshold` | number  | **已移除。** 由 `context.autoCompactThreshold` 替代（参见下方 `#### context` 部分）。自动压缩现在使用三级阈值阶梯（warn / auto / hard），通过 `computeThresholds()` 函数根据模型的上下文窗口在内部计算。旧设置会被静默忽略（无启动警告）。有关重新设计的理由，请参阅 PR #4345 / `docs/design/auto-compaction-threshold-redesign.md`。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | `N/A`       |
| `model.chatCompression.maxRecentFilesToRetain`     | number  | 自动压缩后，恢复到历史记录中的最近修改的文件的数量（如果文件较小则嵌入内容，否则通过路径引用）。`0` 表示不恢复。环境变量覆盖：`QWEN_COMPACT_MAX_RECENT_FILES`。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | `5`         |
| `model.chatCompression.maxRecentImagesToRetain`    | number  | 自动压缩后，恢复到历史记录中的最近图像（工具截图 / 用户粘贴的图像）的数量。`0` 表示不恢复。环境变量覆盖：`QWEN_COMPACT_MAX_RECENT_IMAGES`。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | `3`         |
| `model.chatCompression.enableScreenshotTrigger`    | boolean | 当为 `true` 时，一旦历史记录中累积的工具返回图像数量达到 `screenshotTriggerThreshold`，自动压缩也会触发，与 token 使用量无关——旨在针对 computer-use 会话中频繁截图稀释模型注意力的问题。仅计算工具结果中返回的图像，不包括用户粘贴的图像。环境变量覆盖：`QWEN_COMPACT_SCREENSHOT_TRIGGER`（`1`/`true`/`0`/`false`）。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | `true`      |
| `model.chatCompression.screenshotTriggerThreshold` | number  | 触发截图触发器的工具返回图像数量阈值（仅在 `enableScreenshotTrigger` 为真时生效）。压缩会重置该计数——保留下来的图像会被重新嵌入为顶级部分，触发器不会计算这些部分——因此不会立即重新触发。环境变量覆盖：`QWEN_COMPACT_SCREENSHOT_THRESHOLD`。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | `20`        |
| `model.skipNextSpeakerCheck`                       | boolean | 跳过下一次发言者检查。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | `true`      |
| `model.skipLoopDetection`                          | boolean | 禁用流式循环检测检查。默认为 `true`（跳过循环检测），以避免误报中断合法的工作流。设置为 `false` 可重新启用流式循环检测——在无头/非交互式运行中，这可以作为一种安全护栏，防止卡死重复浪费预算。在 daemon/ACP 会话中（不运行其他流式检测器），重新启用还会激活全局重复工具调用停止机制；始终开启的每轮工具调用上限和无效工具参数停滞保护无论此设置如何都会运行。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | `true`      |
| `model.maxToolCallsPerTurn`                        | integer | 单轮工具调用上限（一个模型轮次及其工具结果延续；阻塞 Stop-hook 延续（如 `/goal` 迭代）会开启新的预算）。当显式设置时，该值为硬性上限：达到后下一次工具调用即终止该轮（已发布的行为）。当未设置时（默认 100），上限为自适应模式：一旦轮次超过 100，仅在模型持续重复相同调用（卡死循环）时才终止；生产性轮次（多样化调用）可继续到 1000 的硬性上限，该上限始终会终止。自适应默认值同时适用于交互式 TUI、非交互式（`-p` / JSON / stream-JSON）核心客户端运行以及 daemon/ACP 会话。Daemon/ACP 会话在每批工具执行前评估一次上限：会跨越显式上限或硬性回退值的批次会被整体跳过，因此轮次永远不会超过其中任何一个（最多差一批终止）；自适应软上限按设计可以超出，直到回退值。它们也没有会话内禁用机制。始终开启的防失控断路器，独立于 `model.skipLoopDetection`。设置为 `0` 或负值可禁用此上限。在检测到循环的对话框中选择"为此会话禁用循环检测"也会在会话的剩余时间内抑制它。 | `100`       |
| `model.skipStartupContext`                         | boolean | 跳过在每个会话开始时发送启动工作区上下文（环境摘要和确认信息）。如果你倾向于手动提供上下文或希望在启动时节省 token，请启用此选项。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | `false`     |
| `model.enableOpenAILogging`                        | boolean | 启用 OpenAI API 调用的日志记录，用于调试和分析。启用后，API 请求和响应将记录到 JSON 文件中。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | `false`     |
| `model.openAILoggingDir`                           | string  | OpenAI API 日志的自定义目录路径。如果未指定，则默认为当前工作目录下的 `logs/openai`。支持绝对路径、相对路径（从当前工作目录解析）和 `~` 展开（主目录）。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | `undefined` |
| `model.openAILogRetentionDays`                     | number  | 在 `model.enableOpenAILogging` 开启时，保留 OpenAI API 日志文件的天数。已完成的后台清理任务在交互式、无头、stream-json SDK 和 ACP 会话中每天最多运行一次。短暂的非交互式进程尽力推进，而持久进程会扫描到完成。`0` = 最小保留时间（约 1 小时）。对于自定义的 `model.openAILoggingDir`，请在用户或系统作用域配置保留时间；工作区作用域的保留时间会被跳过，因为一个自定义目录可以被多个工作区共享。更改在重启后生效。 | `7`         |

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

**timeout（请求超时）：**

`timeout` 是每次请求的超时时间，单位为毫秒（默认值为 `120000`）。将其设置为 `0` 可禁用请求超时（与 `QWEN_STREAM_IDLE_TIMEOUT_MS=0` 的约定一致），而不是中止请求。也可以通过 `QWEN_CODE_API_TIMEOUT_MS` 环境变量进行设置。这与下方的两个流式传输守卫不同。

**流式传输守卫（仅限 OpenAI 兼容提供商）：**

两个守卫约束流式响应，均可设置为 `0` 以禁用。Anthropic/Gemini 生成器未实现这两个守卫，因此下方的滴注式流式传输没有上限。

- `QWEN_STREAM_IDLE_TIMEOUT_MS`（默认 `240000`）约束流式 chunk _之间_ 的不活动时间：如果流在此时间内静默，则会以可重试的 `ETIMEDOUT` 中止。
- `QWEN_STREAM_MAX_LIFETIME_MS`（默认 `900000`）限制一个流式响应的_总_上游等待时间，无论 chunk 流量如何——这是滴注式流永远无法完成时无法重置的边界。

这些**仅为环境变量（或对于嵌入方，`ContentGeneratorConfig.streamIdleTimeoutMs` / `streamMaxLifetimeMs`）——没有 settings.json 键**；在 settings.json 中写入 `"streamMaxLifetimeMs"` 无效。升级说明：之前设置 `QWEN_STREAM_IDLE_TIMEOUT_MS=0`（或在 `ContentGeneratorConfig` 中传入 `streamIdleTimeoutMs: 0`）以退出流中止的部署，现在还需要设置 `QWEN_STREAM_MAX_LIFETIME_MS=0`（或 `streamMaxLifetimeMs: 0`）才能保持该行为；并且 15 分钟的生命周期上限约束了即使你将空闲超时提高到其之上的流（例如 `QWEN_STREAM_IDLE_TIMEOUT_MS=1800000`）——如果你依赖更长的窗口，请同样提高上限或将其设置为 `0`。

**max_tokens（输出 token 限制）：**

当未设置 `samplingParams.max_tokens` 和 `QWEN_CODE_MAX_OUTPUT_TOKENS` 时，Qwen Code 通常会使用所选模型声明的输出限制作为请求的默认输出限制。如果响应仍然达到该限制，Qwen Code 可能会使用提升后的限制（下限为 64K）进行重试，并在后续对话轮次中恢复。

对于兼容 OpenAI 的提供商，`samplingParams` 也是一种直接透传参数的机制：设置后，其键值将原样传递，Qwen Code 不会合成默认的 `max_tokens`。可用于传递特定于提供商的参数，例如 `max_completion_tokens`。

要强制使用固定的输出限制，请在设置中配置 `samplingParams.max_tokens` 或使用 `QWEN_CODE_MAX_OUTPUT_TOKENS` 环境变量。显式设置限制会禁用自动输出 token 升级机制。

**toolResultContentFormat：**

控制在兼容 OpenAI 的请求中如何序列化纯文本工具结果。默认值 `"parts"` 保持标准的内容部分（content-part）数组结构。仅当使用旧版兼容 OpenAI 的运行时（其工具模板会忽略文本内容部分，例如旧版 GLM-5.1 vLLM/SGLang 模板）时，才将其设置为 `"string"`。工具返回的媒体内容仍由 `splitToolMedia` 控制。

**contextWindowSize：**

覆盖所选模型的默认上下文窗口大小。Qwen Code 通过基于模型名称匹配的内置默认值以及一个固定的回退值来确定上下文窗口。当提供商的有效上下文限制与 Qwen Code 的默认值不同时，请使用此设置。此值定义的是模型假设的最大上下文容量，而不是每次请求的 token 限制。

当所选模型在 `modelProviders` 中定义时，请在该提供商条目的 `generationConfig` 中设置 `contextWindowSize`，而不是在顶层的 `model.generationConfig` 中设置。提供商模型条目是封闭的，因此顶层生成设置不会填充缺失的提供商字段。

**modalities：**

覆盖所选模型自动检测到的输入模态。Qwen Code 会根据模型名称模式匹配自动检测支持的模态（图像、PDF、音频、视频）。当自动检测不正确时（例如，为支持 `pdf` 但未被识别的模型启用 `pdf`），请使用此设置。格式：`{ "image": true, "pdf": true, "audio": true, "video": true }`。对于不支持的类型，请省略该键或将其设置为 `false`。

**customHeaders：**

允许向所有 API 请求添加自定义 HTTP 标头。这对于请求追踪、监控、API 网关路由，或者不同模型需要不同标头的场景非常有用。对于提供商模型，请在 `modelProviders[].generationConfig.customHeaders` 中定义 `customHeaders`。对于没有匹配提供商条目的运行时模型，请在 `model.generationConfig.customHeaders` 中定义。这两个级别之间不会进行合并。

`extra_body` 字段允许向发送到 API 的请求体中添加自定义参数。这对于标准配置字段未涵盖的特定于提供商的选项非常有用。**注意：此字段仅支持兼容 OpenAI 的提供商（`openai`、`qwen-oauth`）。对于 Anthropic 和 Gemini 提供商，此字段将被忽略。** 对于提供商模型，请在 `modelProviders[].generationConfig.extra_body` 中定义 `extra_body`。对于没有匹配提供商条目的运行时模型，请在 `model.generationConfig.extra_body` 中定义。

**model.openAILoggingDir 示例：**

- `"~/qwen-logs"` - 记录到 `~/qwen-logs` 目录
- `"./custom-logs"` - 记录到相对于当前目录的 `./custom-logs` 目录
- `"/tmp/openai-logs"` - 记录到绝对路径 `/tmp/openai-logs`

#### fastModel

| 设置 | 类型 | 描述 | 默认值 |
| --- | --- | --- | --- |
| `fastModel` | string | 用于生成[提示建议](../features/followup-suggestions)和推测执行的模型。留空则使用主模型。使用更小/更快的模型（例如 `qwen3-coder-flash`）可降低延迟和成本。也可以通过 `/model --fast` 进行设置。 | `""` |

#### visionModel

| 设置 | 类型 | 描述 | 默认值 |
| --- | --- | --- | --- |
| `visionModel` | string | 用作视觉桥接的图像能力模型：当仅支持文本的主模型接收到图像，或 `read_file` 需要有界 PDF 视觉回退时，首先由该模型进行转录。显式设置此选项会授权对该模型的桥接调用，即使它使用其他提供商；工具显示会披露端点。留空则自动选择同一提供商的视觉模型。也可以通过 `/model --vision` 进行设置。 | `""`    |

#### compactionModel

| 设置 | 类型 | 描述 | 默认值 |
| --- | --- | --- | --- |
| `compactionModel` | string | 用于聊天压缩（自动压缩）的模型。留空则回退到主模型。使用更小或更快的模型可以降低压缩延迟和成本。也可以通过 `/model --compaction` 进行设置或清除。 | `""` |

#### imageModel

| 设置 | 类型 | 描述 | 默认值 |
| --- | --- | --- | --- |
| `imageModel` | string | 内置 `image_gen` 工具使用的模型。所选模型必须具有 `imageOnly: true`、HTTPS `baseUrl` 和 `modelProviders` 中的 `envKey`。留空则保持该工具不可用。也可以通过 `/model --image` 进行设置。 | `""` |

#### visionBridgeTimeoutMs

| 设置 | 类型 | 描述 | 默认值 |
| --- | --- | --- | --- |
| `visionBridgeTimeoutMs` | integer | 视觉桥接图像转录调用的每次尝试超时时间（毫秒）（正整数，最大 2147483647；桥接会对超时的尝试使用新的超时时间重试一次）。未设置时使用内置的 30 秒。对于较慢或代理的视觉端点，请提高此值。 | unset |

#### voiceModel

| 设置 | 类型 | 描述 | 默认值 |
| --- | --- | --- | --- |
| `voiceModel` | string | 用于语音转录的模型。留空则保持语音听写功能禁用，直到选择了语音模型。也可以通过 `/model --voice` 进行设置。 | `""` |

#### modelFallbacks

| 设置 | 类型 | 描述 | 默认值 |
| --- | --- | --- | --- |
| `modelFallbacks` | string | 当主模型遇到容量错误（429/503/529）时，按顺序尝试的回退模型 ID 列表（逗号分隔，最多 3 个）。示例：`"qwen-plus,qwen-turbo"`。也可以通过 `--fallback-model` CLI 标志进行设置。需要重启。 | `""` |

#### modelPricing

| 设置 | 类型 | 描述 | 默认值 |
| --- | --- | --- | --- |
| `modelPricing` | object | 用于在 `/stats model` 中进行成本估算的可选单模型定价。示例：`{ "qwen3-coder": { "inputPerMillionTokens": 0.30, "outputPerMillionTokens": 1.20 } }`。 | `undefined` |

#### context

| 设置 | 类型 | 描述 | 默认值 |
| --- | --- | --- | --- |
| `context.fileName` | string 或 string 数组 | 上下文文件的名称。 | `undefined` |
| `context.autoCompactThreshold` | number | 触发自动压缩的上下文窗口目标比例。必须大于 0 且最大为 1。默认值为 `0.85`（85%）。作为触发上限：在大型窗口上它是有效触发点（约 85%），而在较小窗口上压缩可能会更早触发以留出摘要空间。替代旧的 `model.chatCompression.contextPercentageThreshold`。 | `undefined`（使用内部 0.85） |
| `context.importFormat` | string | 导入记忆时使用的格式。 | `undefined` |
| `context.includeDirectories` | array | 要包含在工作区上下文中的附加目录。指定要包含在工作区上下文中的附加绝对或相对路径数组。默认情况下，缺失的目录将被跳过并显示警告。路径可以使用 `~` 来引用用户的主目录。此设置可与 `--include-directories` 命令行标志结合使用。 | `[]` |
| `context.loadFromIncludeDirectories` | boolean | 控制 `/memory refresh` 命令的行为。如果设置为 `true`，则应从所有添加的目录中加载 `QWEN.md` 文件。如果设置为 `false`，则应仅从当前目录加载 `QWEN.md`。 | `false` |
| `context.fileFiltering.respectGitIgnore` | boolean | 搜索时遵循 .gitignore 文件。 | `true` |
| `context.fileFiltering.respectQwenIgnore` | boolean | 搜索时遵循 .qwenignore 和配置的自定义忽略文件。 | `true` |
| `context.fileFiltering.customIgnoreFiles` | array | 当启用 `respectQwenIgnore` 时，使用的项目根目录相对忽略文件，用于替代默认的兼容文件（`.agentignore`、`.aiignore`）。`.qwenignore` 始终包含在内。 | `[".agentignore", ".aiignore"]` |
| `context.fileFiltering.enableRecursiveFileSearch` | boolean | 在提示中补全 `@` 前缀时，是否启用递归搜索当前目录树下的文件名。 | `true` |
| `context.fileFiltering.enableFuzzySearch` | boolean | 当为 `true` 时，在搜索文件时启用模糊搜索功能。设置为 `false` 可提高包含大量文件的项目的性能。 | `true` |
| `context.clearContextOnIdle.toolResultsThresholdMinutes` | number | 清除旧工具结果内容前的不活动分钟数。使用 `-1` 禁用空闲触发器。 | `60` |
| `context.clearContextOnIdle.toolResultsNumToKeep` | integer | 清除时要保留的最近可压缩工具结果的整数数量。低于 1 的值将按 1 处理。 | `5` |
| `context.clearContextOnIdle.toolResultsTotalCharsThreshold` | number | 在清除最旧结果之前，历史记录中允许的可压缩工具结果输出总字符数。超过阈值时，最旧的结果会被清除到该阈值的一半（尽力而为），以便后续轮次继续重用提供商的 prompt 缓存，而不是每轮都重写历史记录。使用 `-1` 禁用大小触发器。这是一个软阈值：受保护的最近工具结果可能会使总数保持在该阈值之上。 | `500000` |
#### 排查文件搜索性能问题

如果你在文件搜索（例如 `@` 补全）时遇到性能问题，尤其是在包含大量文件的项目中，可以按照以下推荐顺序尝试一些解决方法：

1. **使用 ignore 文件：** 在项目根目录创建 `.qwenignore` 或配置自定义的 ignore 文件，以排除包含大量无需引用文件的目录（例如构建产物、日志、`node_modules`）。减少被抓取的文件总数是提升性能最有效的方法。
2. **禁用模糊搜索：** 如果忽略文件仍不够，你可以在 `settings.json` 文件中将 `enableFuzzySearch` 设置为 `false` 来禁用模糊搜索。这将使用更简单的非模糊匹配算法，速度可能会更快。
3. **禁用递归文件搜索：** 作为最后的手段，你可以通过将 `enableRecursiveFileSearch` 设置为 `false` 来完全禁用递归文件搜索。这是最快的选项，因为它避免了对项目的递归抓取。但是，这意味着在使用 `@` 补全时，你需要输入文件的完整路径。

#### tools

| 设置项 | 类型 | 描述 | 默认值 | 备注 |
| --- | --- | --- | --- | --- |
| `tools.sandbox` | boolean 或 string | 沙盒执行环境（可以是 boolean 或路径字符串）。 | `undefined` | |
| `tools.sandboxImage` | string | 当未设置 `--sandbox-image` 和 `QWEN_SANDBOX_IMAGE` 时，Docker/Podman 使用的沙盒镜像 URI。 | `undefined` | |
| `tools.shell.enableInteractiveShell` | boolean | 使用 `node-pty` 获得交互式 shell 体验。仍会回退到 `child_process`。 | `true` | |
| `tools.shell.defaultTimeoutMs` | number | agent 启动的前台 shell 命令的默认超时时间（毫秒）。shell 工具的每次调用超时设置会覆盖此值。未设置时，前台命令在 120000 毫秒（2 分钟）后超时。设置为 0 可禁用超时。 | `undefined` | |
| `tools.shell.heartbeatIntervalMs` | number | 前台 shell 命令无输出时，发出的活性心跳之间的间隔时间（毫秒）。心跳会转发给 ACP 客户端和 stream-json 消费者，以便它们区分静默命令和已死会话。未设置时，心跳每 10000 毫秒（10 秒）发出一次。设置为 0 可禁用心跳。 | `undefined` | |
| `tools.core` | string 数组 | **已弃用。** 将在下一版本中移除。请改用 `permissions.allow` + `permissions.deny`。将内置工具限制为白名单。不在列表中的所有工具都将被禁用。 | `undefined` | |
| `tools.exclude` | string 数组 | **已弃用。** 请改用 `permissions.deny`。要从发现中排除的工具名称。首次加载时会自动迁移到 `permissions` 格式。 | `undefined` | |
| `tools.disabled` | string 数组 | 从注册表中完全隐藏的工具名称。与 `permissions.deny`（在运行时阻止调用）不同，禁用的工具不会被注册，因此不会出现在 `/tools` 中，模型也无法发现或调用它们。例如，`["enter_plan_mode"]` 可防止模型自行切换到 plan 模式。在各作用域中作为并集合并。 | `undefined` | |
| `tools.visible` | string 数组 | 在启动时无需 `tool_search` 即可见的延迟工具名称。列出的工具会在初始会话中与核心工具一起显示。在各作用域中作为并集合并。 | `undefined` | |
| `tools.allowed` | string 数组 | **已弃用。** 请改用 `permissions.allow`。绕过确认对话框的工具名称。首次加载时会自动迁移到 `permissions` 格式。 | `undefined` | |
| `tools.approvalMode` | string | 设置工具使用的默认审批模式。 | `auto` | 可选值：`plan`（仅分析，不修改文件或执行命令）、`default`（在编辑文件或运行 shell 命令前需要审批）、`auto-edit`（自动批准文件编辑）、`auto`（LLM 分类器自动批准安全操作，阻止高风险操作）、`yolo`（自动批准所有工具调用） |
| `tools.discoveryCommand` | string | 用于工具发现的运行命令。 | `undefined` | |
| `tools.callCommand` | string | 定义用于调用通过 `tools.discoveryCommand` 发现的特定工具的自定义 shell 命令。该 shell 命令必须满足以下条件：它必须将函数 `name`（与[函数声明](https://ai.google.dev/gemini-api/docs/function-calling#function-declarations)中完全一致）作为第一个命令行参数。它必须在 `stdin` 上以 JSON 格式读取函数参数，类似于 [`functionCall.args`](https://cloud.google.com/vertex-ai/generative-ai/docs/model-reference/inference#functioncall)。它必须在 `stdout` 上以 JSON 格式返回函数输出，类似于 [`functionResponse.response.content`](https://cloud.google.com/vertex-ai/generative-ai/docs/model-reference/inference#functionresponse)。 | `undefined` | |
| `tools.useRipgrep` | boolean | 使用 ripgrep 进行文件内容搜索，而不是回退实现。提供更快的搜索性能。 | `true` | |
| `tools.useBuiltinRipgrep` | boolean | 使用内置的 ripgrep 二进制文件。当设置为 `false` 时，将改用系统级的 `rg` 命令。此设置仅在 `tools.useRipgrep` 为 `true` 时生效。 | `true` | |
| `tools.truncateToolOutputThreshold` | number | 如果工具输出大于此字符数，则进行截断。适用于 Shell、Grep、Glob、ReadFile 和 ReadManyFiles 工具。 | `25000` | 需要重启：是 |
| `tools.truncateToolOutputLines` | number | 截断工具输出时保留的最大行数或条目数。适用于 Shell、Grep、Glob、ReadFile 和 ReadManyFiles 工具。 | `1000` | 需要重启：是 |
| `tools.computerUse.enabled` | boolean | 启用内置的 Computer Use 工具（cua-driver 原生桌面自动化）。当为 `true`（默认）时，`computer_use__*` 工具将注册为延迟加载的内置工具；首次调用时会将固定且签名的 cua-driver 二进制文件下载到 `~/.qwen/computer-use/`，并引导完成 macOS 辅助功能/屏幕录制权限设置。 | `true` | 需要重启：是 |
| `tools.computerUse.maxImageDimension` | number | 应用于 cua-driver 截图的最长边像素上限（通过 `set_config` 的 `max_image_dimension`）。`-1`（默认）保留 cua-driver 的内置默认值（1568）；`0` 禁用调整大小（全分辨率）；正值限制最长边。较低的上限会以牺牲细节为代价降低 vision-token 成本。 | `-1` | 需要重启：是。环境变量覆盖：`QWEN_COMPUTER_USE_MAX_IMAGE_DIMENSION`（非负整数；优先于此设置） |
| `tools.computerUse.idleTimeoutMs` | number | 在最后一次 `computer_use__*` 调用后保持 cua-driver 进程存活的毫秒数。默认值为 `300000`（5 分钟）。设置为 `0` 可使其保持运行直到 Qwen Code 退出。 | `300000` | 需要重启：是 |
| `tools.toolSearch.enabled` | boolean | 通过 ToolSearch 按需加载 MCP 工具以减小 prompt 大小。对于依赖基于前缀的 KV 缓存的模型（例如 DeepSeek），请禁用此功能以保持 prompt 前缀稳定并最大化缓存命中率。 | `true` | 需要重启：是 |
| `tools.toolSearch.threshold` | number | 用作会话启动预算的上下文窗口百分比，用于预加载延迟工具（包括内置和 MCP）。当所有延迟工具的 schema 总和在此预算内时，它们会全部预先声明，而不是通过 ToolSearch 按需加载——稳定的声明列表可使前缀 KV 缓存在整个会话中保持有效。设置为 `0` 则始终按需加载延迟工具。 | `10` | 需要重启：是 |
> [!note]
>
> **从 `tools.core` / `tools.exclude` / `tools.allowed` 迁移：** 这些旧版设置已**废弃**，并在首次加载时自动迁移到新的 `permissions` 格式。建议直接配置 `permissions.allow` / `permissions.deny`。使用 `/permissions` 可以交互式地管理规则。

#### memory

| 设置项                          | 类型    | 描述                                                                                                                                                                                           | 默认值 |
| -------------------------------- | ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| `memory.enableManagedAutoMemory` | boolean | 启用从对话中后台提取记忆。                                                                                                                                          | `true`  |
| `memory.enableManagedAutoDream`  | boolean | 启用对收集到的记忆进行自动整合（去重和清理）。                                                                                                                     | `true`  |
| `memory.enableAutoSkill`         | boolean | 在大量使用工具的任务结束后，启用后台审查以生成可复用的项目 skill。                                                                                                                       | `true`  |
| `memory.autoSkillConfirm`        | boolean | 在自动生成的 skill 添加到 skill 库之前请求确认。关闭时，自动生成的 skill 会立即保存。                                                                        | `true`  |
| `memory.enableTeamMemory`        | boolean | 启用项目级记忆层，通过 git 跟踪的 `.qwen/team-memory/` 目录与协作者共享。对该目录的写入会进行密钥扫描，并可在 git diff 中审查。                            | `false` |
| `memory.enableTeamMemorySync`    | boolean | 启用团队记忆后，在会话开始时自动 commit、fast-forward pull 并 push `.qwen/team-memory/` 目录，以保持协作者之间的同步。需要配置 git upstream。 | `false` |
| `memory.agentTimeoutMinutes`     | number  | 后台记忆 agent（提取、整合、回忆、skill 审查）的最大运行时间（分钟）。未设置时使用每个 agent 的内置默认值（2–5 分钟）；`0` 禁用时间限制。 | unset |
| `memory.agentMaxTurns`           | number  | 后台记忆 agent（提取、整合、回忆、skill 审查）的最大轮次。未设置时使用每个 agent 的内置默认值（5–8）；`0` 禁用轮次限制。 | unset |

有关 auto-memory 的工作原理以及如何使用 `/memory`、`/remember` 和 `/dream` 命令的详细信息，请参阅 [Memory](../features/memory)。

#### agents

| 设置 | 类型 | 描述 | 默认值 |
| --- | --- | --- | --- |
| `agents.builtin.exploreModel` | string | 内置 Explore subagent 的模型选择器。使用 `inherit` 继承主会话模型，`fast` 使用 `fastModel`，或模型 ID，或 `authType:model-id` 选择器。自定义的同名 Explore agent 保留其自身的模型配置。需要重启。 | `inherit` |
| `agents.modelGrades` | object | 将语义等级名称映射到模型选择器，供 Agent 工具使用。需要重启。 | `undefined` |
| `agents.allowedGrades` | array of strings | Agent 工具可使用的已配置模型等级的可选白名单。需要重启。 | `undefined` |

#### permissions

permissions 系统提供了细粒度的控制，用于决定哪些工具可以运行、哪些需要确认、哪些被阻止。

**决策优先级（从高到低）：`deny` > `ask` > `allow` > _（默认/交互模式）_**

第一个匹配的规则生效。规则使用 `"ToolName"` 或 `"ToolName(specifier)"` 格式。

| 设置项             | 类型             | 描述                                                                                                      | 默认值     |
| ------------------- | ---------------- | ---------------------------------------------------------------------------------------------------------------- | ----------- |
| `permissions.allow` | array of strings | 自动批准的工具调用规则（无需确认）。在所有作用域（用户 + 项目 + 系统）中合并。 | `undefined` |
| `permissions.ask`   | array of strings | 始终需要用户确认的工具调用规则。优先级高于 `allow`。                         | `undefined` |
| `permissions.deny`  | array of strings | 被阻止的工具调用规则。优先级最高——覆盖 `allow` 和 `ask`。                               | `undefined` |

**工具名称别名（在规则中使用以下任意一个均可）：**

| 别名                 | 标准工具      | 备注                     |
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

某些规则名称会自动覆盖多个工具：

| 规则名称 | 覆盖的工具                                        |
| --------- | ---------------------------------------------------- |
| `Read`    | `read_file`, `grep_search`, `glob`, `list_directory` |
| `Edit`    | `edit`, `write_file`, `notebook_edit`                |

> [!important]
> `Read(/path/**)` 会匹配**所有四个**读取工具（文件读取、grep、glob 和目录列表）。
> 若要仅限制文件读取，请使用 `ReadFile(/path/**)` 或 `read_file(/path/**)`。

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
| `"mcp__puppeteer"`            | 来自 puppeteer MCP server 的所有工具                        |

**路径模式前缀：**

| 前缀 | 含义                               | 示例             |
| ------ | ------------------------------------- | ------------------- |
| `//`   | 从文件系统根目录开始的绝对路径    | `//etc/passwd`      |
| `~/`   | 相对于主目录            | `~/Documents/*.pdf` |
| `/`    | 相对于项目根目录              | `/src/**/*.ts`      |
| `./`   | 相对于当前工作目录 | `./secrets/**`      |
| (无) | 与 `./` 相同                          | `secrets/**`        |

**防止绕过 shell 命令：**

当 agent 运行等效的 shell 命令时，也会强制执行 `Read`、`Edit` 和 `WebFetch` 的权限规则。例如，如果 `Read(./.env)` 在 `deny` 中，agent 无法通过 shell 命令中的 `cat .env` 来绕过它。支持的 shell 命令包括 `cat`、`grep`、`curl`、`wget`、`cp`、`mv`、`rm`、`chmod` 等。未知/安全的命令（如 `git`）不受文件/网络规则的影响。

**从旧版设置迁移：**

| 旧版设置  | 等效的 `permissions` 规则   | 备注                                                        |
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
> 在交互式 CLI 中使用 `/permissions` 来查看、添加和删除规则，而无需直接编辑 `settings.json`。

#### slashCommands

控制在 CLI 中可用的 slash commands。在多租户或企业级部署中锁定命令范围时非常有用。

| 设置项                  | 类型             | 描述                                                                                                                                                                                                                                                                                                                 | 默认值     |
| ------------------------ | ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- |
| `slashCommands.disabled` | array of strings | 要隐藏并拒绝执行的 slash command 名称。与最终命令名称进行不区分大小写的匹配（对于扩展命令，这是消歧后的形式，例如 `myext.deploy`）。**在各作用域中作为并集合并**，因此工作区设置可以添加但不能移除用户或系统设置中定义的条目。 | `undefined` |

相同的拒绝列表也可以通过 `--disabled-slash-commands` CLI 参数（逗号分隔或重复使用）和 `QWEN_DISABLED_SLASH_COMMANDS` 环境变量提供；来自所有这三个来源的值会合并为并集。

**示例 — 在沙盒部署中锁定内置命令：**

```json
{
  "slashCommands": {
    "disabled": ["auth", "mcp", "extensions", "ide", "quit"]
  }
}
```

将这些值配置在系统级的 `settings.json`（`/etc/qwen-code/settings.json` 或 `QWEN_CODE_SYSTEM_SETTINGS_PATH`）中后，用户无法从其自身的作用域缩小拒绝列表，并且被禁用的命令不会出现在自动补全中，输入时也不会执行。

> [!note]
> 此设置仅控制 slash commands（例如 `/auth`、`/mcp`）。它不影响工具权限——相关配置请参阅 `permissions.deny`。它也不会拦截 `Ctrl+C` 或 `Esc` 等键盘快捷键。

#### skills

控制向模型暴露哪些 [Skills](../features/skills)。

| 设置项 | 类型 | 描述 | 默认值 |
| --- | --- | --- | --- |
| `skills.disabledLevels` | array of strings | 完全跳过的 skill 发现层级。支持的值有 `project`、`user`、`extension` 和 `bundled`。在各设置作用域中作为并集合并。使用 `["bundled"]` 可隐藏所有内置 skill 同时保留宿主提供的 skill。注意：`skills.directories` 条目在 `user` 层级发现，因此 `["user"]` 也会隐藏它们。 | `undefined` |
| `skills.disabled` | array of strings | 硬性禁用的 skill 名称。不区分大小写匹配，**在各设置作用域中作为并集合并**，因此项目设置无法覆盖用户或系统条目。隐藏的 skill 不会出现在 `<available_skills>` 中，也不会作为 `/<name>` slash commands 出现。 | `undefined` |
| `skills.defaultDisabled` | array of strings | 默认禁用但可通过 `skills.enabled` 启用的 skill 名称。不区分大小写匹配，在各设置作用域中作为并集合并。 | `undefined` |
| `skills.enabled` | array of strings | 覆盖匹配的 `skills.defaultDisabled` 条目的显式启用。不区分大小写匹配，在各设置作用域中作为并集合并。此设置无法覆盖 `skills.disabled` 或重新启用被 `skills.disabledLevels` 排除的层级中的 skill。 | `undefined` |

优先级为 `skills.disabled` > `skills.enabled` > `skills.defaultDisabled`。例如，用户可以将 skill 放入 `defaultDisabled`，项目可以将相同名称添加到 `enabled`；任何作用域的硬性 `disabled` 条目仍然优先。

#### mcp

| 设置项             | 类型             | 描述                                                                                                                                                                                                                                                                                                                                                                                                                                 | 默认值     |
| ------------------- | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- |
| `mcp.serverCommand` | string           | 启动 MCP server 的命令。                                                                                                                                                                                                                                                                                                                                                                                                             | `undefined` |
| `mcp.allowed`       | array of strings | 允许的 MCP server 白名单。允许你指定应向模型提供的一组 MCP server 名称。这可用于限制要连接的 MCP server 集合。支持 glob 模式（`*` 匹配任意序列，`?` 匹配单个字符 — 例如 `"*puppeteer*"`）；不包含 glob 字符的条目将进行精确匹配。请注意，如果设置了 `--allowed-mcp-server-names`，此配置将被忽略。 | `undefined` |
| `mcp.excluded`      | array of strings | 要排除的 MCP server 黑名单。同时列在 `mcp.excluded` 和 `mcp.allowed` 中的 server 将被排除。支持 glob 模式（`*`、`?`），方式与 `mcp.allowed` 相同。请注意，如果设置了 `--allowed-mcp-server-names`，此配置将被忽略。                                                                                                                                                                                         | `undefined` |
| `mcp.toolIdleTimeoutMs` | number       | MCP 工具调用的空闲超时时间（毫秒）。如果 MCP server 在此时间内未产生任何响应或进度更新，则调用将中止。必须在 `10000` 到 `3600000` 之间。可通过 `QWEN_CODE_MCP_TOOL_IDLE_TIMEOUT_MS` 环境变量覆盖。                                                                                                                                                     | `300000`    |
> [!note]
>
> **MCP 服务器的安全说明：** 这些设置对 MCP 服务器名称使用简单的字符串匹配，而服务器名称是可以被修改的。如果你是希望防止用户绕过此限制的系统管理员，请考虑在系统设置级别配置 `mcpServers`，这样用户将无法自行配置任何 MCP 服务器。这不应被视为绝对严密的安全机制。

#### lsp

> [!warning]
> **实验性功能**：LSP 支持目前处于实验阶段，默认禁用。请使用 `--experimental-lsp` 命令行参数启用它。

语言服务器协议 (LSP) 提供代码智能功能，如跳转到定义、查找引用和诊断。

LSP 服务器配置通过项目根目录下的 `.lsp.json` 文件进行，而不是通过 `settings.json`。有关配置详情和示例，请参阅 [LSP 文档](../features/lsp)。

#### security

| 设置 | 类型 | 描述 | 默认值 |
| --- | --- | --- | --- |
| `security.folderTrust.enabled` | boolean | 用于跟踪是否启用文件夹信任的设置。 | `false` |
| `security.auth.selectedType` | string | 当前选择的身份验证类型。 | `undefined` |
| `security.auth.enforcedType` | string | 强制要求的身份验证类型（对企业用户很有用）。 | `undefined` |
| `security.auth.useExternal` | boolean | 是否使用外部身份验证流程。 | `undefined` |
| `security.auth.apiKey` | string | **已弃用。** 用于兼容 OpenAI 身份验证的 API key。请迁移到带有 `envKey` 的 `modelProviders` —— 请参阅[模型提供商](./model-providers)。 | `undefined` |
| `security.auth.baseUrl` | string | **已弃用。** 兼容 OpenAI API 的 Base URL。请迁移到 `modelProviders` —— 请参阅[模型提供商](./model-providers)。 | `undefined` |
| `security.allowedInsecureVoiceBaseUrls` | array of strings | 允许使用 HTTP 或解析到私有网络地址的完整语音提供商 Base URL 列表。每个条目必须包含显式的 `http://` 或 `https://` scheme 以及完整路径（例如 `/v1`）；仅对 URL 序列化和尾部斜杠进行规范化。不支持通配符；元数据地址、链路本地地址、本地使用 NAT64、6to4 和 Teredo 地址即使被列入也仍然被阻止，解析到环回地址的主机名也是如此；IPv4 映射、IPv4 兼容和知名 NAT64（`64:ff9b::/96`）字面量按其嵌入的 IPv4 地址分类。仅 User、System 和 SystemDefaults 作用域会被采纳。仅用于受管私有网络中的受信任端点。明文 HTTP 还会暴露在 Authorization 头中传输的提供商 API 密钥。被列入的主机名的可信度不超过其 DNS 的可信度；当网关地址稳定时，优先使用 IP 字面量条目。精确匹配覆盖批量请求 URL；流式传输传输连接到从中派生的 WebSocket URL（相同 scheme、host 和 port，`/api-ws/v1/...` 路径），而不是被列入的路径本身。 | `[]` |

#### serve

[`qwen serve`](../qwen-serve) 的持久子会话并发设置。更改后需要重启守护进程。非正整数或非整数的并发限制会产生警告并回退到内置默认值。

| 设置 | 类型 | 描述 | 默认值 |
| --- | --- | --- | --- |
| `serve.maxConcurrentSubSessionsPerCaller` | integer | 一个调用方会话通过 `create_sub_session` 创建的最大进行中子会话数。必须至少为 `1`。 | `16` |
| `serve.maxConcurrentSubSessionsTotal` | integer | 一个工作区中所有调用方的最大进行中子会话总数。必须为 `1` 到 `1024` 之间的整数。超过 `1024` 的值会被静默限制为 `1024`。 | `24` |

#### advanced

| 设置 | 类型 | 描述 | 默认值 |
| --- | --- | --- | --- |
| `advanced.autoConfigureMemory` | boolean | 自动配置 Node.js 内存限制。 | `false` |
| `advanced.dnsResolutionOrder` | string | DNS 解析顺序。 | `undefined` |
| `advanced.excludedEnvVars` | array of strings | 从项目上下文中排除的环境变量。指定不应从项目 `.env` 文件中加载的环境变量。这可以防止特定于项目的环境变量（如 `DEBUG=true`）干扰 CLI 行为。来自 `.qwen/.env` 文件的变量永远不会被此列表排除；影响加载器的变量始终从每个 `.env` 作用域中被拒绝（见下文）。 | `["DEBUG","DEBUG_MODE"]` |
| `advanced.bugCommand` | object | Bug 报告命令的配置。覆盖 `/bug` 命令的默认 URL。属性：`urlTemplate` (string)：可包含 `{title}` 和 `{info}` 占位符的 URL。示例：`"bugCommand": { "urlTemplate": "https://bug.example.com/new?title={title}&info={info}" }` | `undefined` |
| `plansDirectory` | string | 已批准的 Plan Mode 文件的自定义目录。相对路径从项目根目录解析，且解析后的路径必须保留在项目根目录内。如果未设置，plan 文件将存储在 `~/.qwen/plans` 中。**需要重启。** 如果该目录位于项目根目录内，请将其添加到 `.gitignore` 以避免提交 plan 文件。 | `undefined` |

#### experimental

> [!warning]
>
> **实验性功能。** 这些开关控制正在开发中的功能，可能会在未来的版本中更改或移除。

| 设置 | 类型 | 描述 | 默认值 |
| --- | --- | --- | --- |
| `experimental.cron` | boolean | 启用会话内的 cron/loop 工具（`cron_create`、`cron_list`、`cron_delete`），以便模型可以创建循环提示。可通过 `QWEN_CODE_DISABLE_CRON=1` 环境变量禁用。需要重启。 | `true` |
| `experimental.todoStopGuard` | boolean | 当当前 work chain 成功写入了未完成的顶级 Todo 列表时，允许 daemon 和 ACP 会话在模型自然停止后继续。最多添加两次连续的 primary-model 调用（无新用户输入）；轮次中的用户输入会开启新的两次尝试阶段。进程重启后不会恢复，在 safe、bare 和 Approval `plan` 模式下强制关闭。需要重启。 | `false` |
| `experimental.sessionWriterLease` | boolean | 为持久化的 ACP 和 daemon 会话启用跨进程写入栅栏。该值在 ACP 或 daemon 进程启动时冻结。所有并发 ACP 写入方都必须启用此设置；混合版本或配置仍然不安全。交互式和 headless 记录器不受影响。需要重启进程。 | `false` |
| `experimental.cronRecurringMaxAgeDays` | number | 循环 cron/loop 任务在自动过期前存活的天数（它会最后一次触发，然后被删除）。设置为 `0` 可禁用过期，使任务一直运行直到被删除 —— 适用于长时间运行的守护进程部署。可通过 `QWEN_CODE_CRON_MAX_AGE_DAYS` 环境变量覆盖。需要重启。 | `7` |
| `experimental.agentTeam` | boolean | 启用 agent-team 协作工具（`team_create`、`task_create`、`task_update`、`send_message` 等）以进行多智能体协调。也可通过 `QWEN_CODE_ENABLE_AGENT_TEAM=1` 启用。需要重启。 | `false` |
| `experimental.artifact` | boolean | 启用 Artifact 工具。默认启用。在交互式、非 SDK 会话中，模型可以发布自包含的 HTML 页面作为交互式 Artifact 并在浏览器中打开。非 SDK 守护进程会话可以使用仅包含元数据的 `record_artifact`。设置为 `false` 或使用 `QWEN_CODE_DISABLE_ARTIFACT=1` 可同时禁用两者。需要重启。 | `true` |
| `experimental.emitToolUseSummaries` | boolean | 在每次工具调用批次完成后生成一个基于 LLM 的简短标签。请参阅[工具使用摘要](../features/tool-use-summaries)。需要配置快速模型（`fastModel`）；否则将静默跳过。可通过 `QWEN_CODE_EMIT_TOOL_USE_SUMMARIES=0` 或 `=1` 在每个会话中覆盖。 | `true` |

#### mcpServers

配置与一个或多个模型上下文协议 (MCP) 服务器的连接，以发现和使用自定义工具。Qwen Code 会尝试连接到每个配置的 MCP 服务器以发现可用工具。如果多个 MCP 服务器公开了同名工具，工具名称将加上你在配置中定义的服务器别名前缀（例如 `serverAlias__actualToolName`）以避免冲突。请注意，为了兼容性，系统可能会从 MCP 工具定义中剥离某些 schema 属性。必须至少提供 `command`、`url` 或 `httpUrl` 之一。如果指定了多个，优先级顺序为 `httpUrl`，其次是 `url`，最后是 `command`。

| 属性 | 类型 | 描述 | 可选 |
| --- | --- | --- | --- |
| `mcpServers.<SERVER_NAME>.command` | string | 用于通过标准 I/O 启动 MCP 服务器的执行命令。 | 是 |
| `mcpServers.<SERVER_NAME>.args` | array of strings | 传递给命令的参数。 | 是 |
| `mcpServers.<SERVER_NAME>.env` | object | 为服务器进程设置的环境变量。 | 是 |
| `mcpServers.<SERVER_NAME>.cwd` | string | 启动服务器的工作目录。 | 是 |
| `mcpServers.<SERVER_NAME>.url` | string | 使用服务器发送事件 (SSE) 进行通信的 MCP 服务器的 URL。 | 是 |
| `mcpServers.<SERVER_NAME>.httpUrl` | string | 使用可流式 HTTP 进行通信的 MCP 服务器的 URL。 | 是 |
| `mcpServers.<SERVER_NAME>.headers` | object | 随请求发送到 `url` 或 `httpUrl` 的 HTTP 标头映射。 | 是 |
| `mcpServers.<SERVER_NAME>.timeout` | number | 对此 MCP 服务器请求的超时时间（毫秒）。 | 是 |
| `mcpServers.<SERVER_NAME>.trust` | boolean | 信任此服务器并在受信任的工作区中绕过其工具调用确认。 | 是 |
| `mcpServers.<SERVER_NAME>.description` | string | 服务器的简短描述，可能用于显示目的。 | 是 |
| `mcpServers.<SERVER_NAME>.includeTools` | array of strings | 从此 MCP 服务器包含的工具名称列表。指定后，仅此列表中列出的工具将从此服务器可用（白名单行为）。如果未指定，默认启用该服务器的所有工具。 | 是 |
| `mcpServers.<SERVER_NAME>.excludeTools` | array of strings | 从此 MCP 服务器排除的工具名称列表。此处列出的工具将对模型不可用，即使它们由服务器公开。**注意：** `excludeTools` 优先于 `includeTools` —— 如果一个工具同时存在于两个列表中，它将被排除。 | 是 |
#### telemetry

配置 Qwen Code 的日志和指标收集。更多信息，请参阅 [telemetry](../../developers/development/telemetry.md)。

| 设置                                        | 类型    | 描述                                                                                                                                                                                                                                                                                     | 默认值    |
| ------------------------------------------- | ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| `telemetry.enabled`                         | boolean | 是否启用遥测。                                                                                                                                                                                                                                                     |           |
| `telemetry.target`                          | string  | 遥测目标的信息标签（`local` 或 `gcp`）。不控制导出器路由；请设置 `telemetry.otlpEndpoint` 或 `telemetry.outfile` 来配置数据发送位置。                                                                                            |           |
| `telemetry.otlpEndpoint`                    | string  | OTLP Exporter 的端点。                                                                                                                                                                                                                                                      |           |
| `telemetry.otlpProtocol`                    | string  | OTLP Exporter 的协议（`grpc` 或 `http`）。                                                                                                                                                                                                                                   |           |
| `telemetry.logPrompts`                      | boolean | 是否在日志中包含用户提示词的内容。                                                                                                                                                                                                                       |           |
| `telemetry.userId`                          | string  | 写入 GenAI span 的稳定最终用户标识符，作为 ARMS 扩展 `gen_ai.user.id`。建议使用 pseudonymous 值。不要为共享的多用户 daemon 或 channel 实例设置进程范围的值。                                                                               |           |
| `telemetry.includeSensitiveSpanAttributes`  | boolean | 启用后，会将原样的用户提示词、系统提示词、工具输入/输出和模型响应附加到原生 OTel span 属性（除了 log-to-span 桥接 span 之外）。⚠️ 会将敏感数据（文件内容、shell 命令、对话历史）流式传输到你的 OTLP 后端。 | `false`   |
| `telemetry.sensitiveSpanAttributeMaxLength` | number  | 每个敏感原生 OTel span 属性内容负载的最大 JavaScript 字符串长度。必须在 `1` 和 `104857600`（100 MiB）之间。如果你的收集器或后端拒绝大属性，请设置较小的值。                                                                          | `1048576` |
| `telemetry.outfile`                         | string  | 将遥测数据写入文件的路径。设置后，将覆盖 OTLP 导出。                                                                                                                                                                                                                      |           |

### settings.json 示例

以下是具有嵌套结构的 `settings.json` 文件示例，该结构自 v0.3.0 起引入：

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
    "userId": "user-079458",
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

## Shell 历史记录

CLI 会保留你运行的 shell 命令历史记录。为了避免不同项目之间的冲突，此历史记录存储在用户主目录下的项目特定目录中。

- **位置：** `~/.qwen/tmp/<project_hash>/shell_history`
  - `<project_hash>` 是根据项目根路径生成的唯一标识符。
  - 历史记录存储在名为 `shell_history` 的文件中。

## 环境变量与 `.env` 文件

环境变量是配置应用程序的常用方式，特别适用于敏感信息（如 token）或可能在不同环境之间更改的设置。

Qwen Code 可以自动从 `.env` 文件加载环境变量。
有关身份验证相关的变量（如 `OPENAI_*`）以及推荐的 `.qwen/.env` 方法，请参阅 **[Authentication](../configuration/auth)**。

> [!tip]
>
> **环境变量排除：** 默认情况下，某些环境变量（如 `DEBUG` 和 `DEBUG_MODE`）会自动从项目 `.env` 文件中排除，以防止干扰 CLI 行为。来自 `.qwen/.env` 文件的变量永远不会被排除。你可以使用 `settings.json` 文件中的 `advanced.excludedEnvVars` 设置来自定义此行为。

> [!warning]
>
> **影响加载器的变量始终被拒绝：** 使生成的 Node.js 进程或操作系统加载器执行攻击者选择的文件的变量——`NODE_OPTIONS`、`npm_config_node_options`（以及 npm 的配置文件重定向 `npm_config_userconfig`、`npm_config_globalconfig`、`npm_config_script_shell`、`npm_config_prefix`）、`NODE_PATH`、`OPENSSL_CONF`（在启动时 dlopen 攻击者的 OpenSSL 引擎）、`NODE_REPL_EXTERNAL_MODULE`、`npm_config_node_gyp`、`npm_config_init_module`、`LD_PRELOAD`、`LD_AUDIT`、`DYLD_INSERT_LIBRARIES`、`BASH_ENV`、`ZDOTDIR` 以及导出的 bash 函数定义（`BASH_FUNC_*`）——永远不会从 `.env` 文件（任何作用域，包括 `.qwen/.env` 和用户级文件）或顶层 `settings.json` 的 `env` 部分加载。工作区控制的值可能会劫持 Qwen Code 生成的每个子进程的模块解析，因此 Qwen Code 在拒绝此类键时会打印警告（每个进程每个键和来源打印一次——在多工作区守护进程中，每个工作区的拒绝会单独报告）。要使用这些变量之一，请在启动 Qwen Code 的环境中将其导出；由 `qwen serve` 托管的会话故意不继承它们，而直接编辑器（ACP）会话和普通 CLI 保留导出的值。库_搜索_路径（`LD_LIBRARY_PATH`、`DYLD_LIBRARY_PATH`）和仅限交互式 shell 的 `ENV` 故意不在此列表中——拒绝它们会破坏主流工具链（`ENV=production`、conda/CUDA 库目录）——但项目 `.env` 仍然无法在重新加载时应用它们。此拒绝仅适用于顶层 `env` 部分：每个 server 的 `mcpServers[].env` 和每个 hook 的 `hooks[].env` 故意限定在该 server 或 hook 范围内，仍然适用（两个入口都通过 trusted folder 对工作区提供的配置进行门控）。另外，项目 `.env` 永远不能设置 `QWEN_CLI_ENTRY`（守护进程的会话进程入口点）、`QWEN_CDP_MCP_COMMAND`（守护进程作为浏览器自动化 MCP 适配器生成的命令）、`QWEN_SERVE_CDP_TUNNEL_OVER_WS`（切换该隧道表面开关）、`DEV`（开发环境启动标记），TLS 信任锚变量（`NODE_EXTRA_CA_CERTS`、`SSL_CERT_FILE`、`SSL_CERT_DIR`、`CURL_CA_BUNDLE`、`REQUESTS_CA_BUNDLE`、`GIT_SSL_CAINFO`、`GIT_SSL_CAPATH`、`npm_config_cafile`、`npm_config_ca`、`npm_config_strict_ssl`、`PIP_CERT` —— 攻击者 CA 在那里，或 `npm_config_strict_ssl=false`，将启用对会话的 `git`/`npm`/`pip`/`curl` 调用所承载的 token 流量的中间人攻击），git 命令执行变量（`GIT_SSH_COMMAND`、`GIT_SSH`、`GIT_EXEC_PATH`、`GIT_TEMPLATE_DIR`、`GIT_ASKPASS`、`GIT_PROXY_COMMAND`、`GIT_EDITOR`、`GIT_SEQUENCE_EDITOR`、`GIT_EXTERNAL_DIFF`、`GIT_CONFIG_GLOBAL`、`GIT_CONFIG_SYSTEM`、`GIT_CONFIG_COUNT`、`GIT_CONFIG_PARAMETERS` 以及编号的 `GIT_CONFIG_KEY_<n>`/`GIT_CONFIG_VALUE_<n>` 对 —— git 在任何会话 `git` 调用时都会运行这些变量），以及 `XDG_CONFIG_HOME`（它将 `$XDG_CONFIG_HOME/git/config` 重定向到与 `~/.gitconfig` 合并的 git 配置），curl/wget rc 文件重定向（`CURL_HOME`、`WGETRC` —— 它们的 rc 文件可以安装攻击者代理或 CA），`PIP_CONFIG_FILE`（重定向 pip 的所有配置 —— 攻击者文件中的 `index-url`、`trusted-host`、代理或证书设置会将会话 pip 流量或凭据发送到攻击者基础设施），`SSH_ASKPASS`（git/ssh 在认证挑战时将其作为回退密码提示程序执行），`LESSOPEN` 和 `LESSCLOSE`（`less` 将它们作为输入预处理器对会话查看的每个文件执行），node-gyp 解释器选择变量（`NODE_GYP_FORCE_PYTHON`、`npm_config_python`、`PYTHON`——在本机附加组件安装期间作为构建 Python 运行——以及 `npm_config_git`，作为 npm 的 git 二进制文件运行），编辑器和启动钩子（`VISUAL`、`EDITOR`——git 的编辑器回退链，也由 CLI 自身的外部编辑器流程生成——以及 `PYTHONSTARTUP`，CPython 在交互式启动时执行），或 `BROWSER`（CLI 通过安全浏览器启动器执行它）。这些变量仍然可以从 shell 环境或用户级 `.env` 设置；与上面的加载器列表不同，它们仅从项目文件中被拒绝，因此你自行导出的值会被保留。它们还在启动时从用户级 `.env` 冻结：设置重新加载不会应用对它们的编辑（或移除），直到进程重启。以及 `NODE_COMPILE_CACHE`；这些仍然可以从 shell 环境或用户级 `.env` 设置。升级说明：在此拒绝列表存在之前，其中一些键可以从某些路径上的 `.env` 文件或 `settings.json` 的 `env` 加载；现在它们会在所有地方被拒绝并显示警告，并且 `qwen serve` 守护进程不再将它们继承的值传递给会话子进程。

### 环境变量表

| Variable                                             | Description                                                                                                                                                                                                                                                                                                                                                                                                      | Notes                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `QWEN_HOME`                                          | 自定义全局配置目录（默认：`~/.qwen`）。接受绝对或相对路径（相对路径从当前工作目录解析）。前导 `~` 会展开为用户的主目录。                                                                                                                                                                                 | 存储凭据、设置、内存、技能和其他全局状态。设置后，项目级别的 `.qwen/` 目录不受影响。空字符串被视为未设置。                                                                                                                                                                                                                                                                                                            |
| `QWEN_RUNTIME_DIR`                                   | 覆盖运行时输出目录（对话、日志、todos）。未设置时，默认为 `QWEN_HOME` 目录。                                                                                                                                                                                                                                                                                          | 使用此变量将临时运行时数据与持久化配置分离。当 `QWEN_HOME` 位于共享/缓慢的文件系统上时非常有用。                                                                                                                                                                                                                                                                                                                                                        |
| `QWEN_USAGE_STATISTICS_ENABLED`                      | 设置为 `true` 或 `1` 以启用使用统计。任何其他值均被视为禁用。                                                                                                                                                                                                                                                                                                    | 覆盖 `privacy.usageStatisticsEnabled` 设置。两者均未配置时默认为启用。                                                                                                                                                                                                                                                                                                                                                                     |
| `QWEN_TELEMETRY_ENABLED`                             | 设置为 `true` 或 `1` 以启用遥测。任何其他值均被视为禁用。                                                                                                                                                                                                                                                                                                                            | 覆盖 `telemetry.enabled` 设置。                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `QWEN_TELEMETRY_TARGET`                              | 设置遥测目标的信息标签（`local` 或 `gcp`）。不控制路由；请使用 `QWEN_TELEMETRY_OTLP_ENDPOINT` 或 `QWEN_TELEMETRY_OUTFILE` 来配置数据发送位置。                                                                                                                                                                                                          | 覆盖 `telemetry.target` 设置。                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `QWEN_TELEMETRY_OTLP_ENDPOINT`                       | 设置遥测的 OTLP 端点。                                                                                                                                                                                                                                                                                                                                                                            | 覆盖 `telemetry.otlpEndpoint` 设置。                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `QWEN_TELEMETRY_OTLP_PROTOCOL`                       | 设置 OTLP 协议（`grpc` 或 `http`）。                                                                                                                                                                                                                                                                                                                                                                       | 覆盖 `telemetry.otlpProtocol` 设置。                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `QWEN_TELEMETRY_LOG_PROMPTS`                         | 设置为 `true` 或 `1` 以启用或禁用用户提示词的日志记录。任何其他值均被视为禁用。                                                                                                                                                                                                                                                                                                   | 覆盖 `telemetry.logPrompts` 设置。                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `QWEN_TELEMETRY_USER_ID`                             | 在交互、LLM、Tool 和 Agent span 上设置稳定的最终用户标识符为 `gen_ai.user.id`。建议使用 pseudonymous 值。                                                                                                                                                                                                                                    | 去除空白后覆盖 `telemetry.userId`。空白值回退到设置。此为进程范围，不得在共享的多用户进程中用作每请求身份。                                                                                                                                                                                                                                                                                                                                                              |
| `QWEN_TELEMETRY_INCLUDE_SENSITIVE_SPAN_ATTRIBUTES`   | 设置为 `true` 或 `1` 以将原样的用户提示词、系统提示词、工具 I/O 和模型响应附加到原生 OTel span 属性（并在 log-to-span 桥接 span 上保留 `prompt` / `function_args` / `response_text`）。任何其他值均禁用此功能。                                                                                                                                                             | 覆盖 `telemetry.includeSensitiveSpanAttributes` 设置。⚠️ 会将敏感数据流式传输到你的 OTLP 后端。                                                                                                                                                                                                                                                                                                                                                                  |
| `QWEN_TELEMETRY_SENSITIVE_SPAN_ATTRIBUTE_MAX_LENGTH` | 设置每个敏感原生 OTel span 属性内容负载的最大 JavaScript 字符串长度。必须是不大于 `104857600`（100 MiB）的正整数。                                                                                                                                                                                                                                       | 覆盖 `telemetry.sensitiveSpanAttributeMaxLength` 设置。默认值为 `1048576`（1 MiB）；如果你的收集器或后端拒绝大型 span 属性，请降低此值。                                                                                                                                                                                                                                                                                                              |
| `QWEN_TELEMETRY_OUTFILE`                             | 设置写入遥测数据的文件路径。设置后，将覆盖 OTLP 导出。                                                                                                                                                                                                                                                                                                                                       | 覆盖 `telemetry.outfile` 设置。                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `QWEN_SANDBOX`                                       | 替代 `settings.json` 中的 `sandbox` 设置。                                                                                                                                                                                                                                                                                                                                                         | 接受 `true`、`false`、`docker`、`podman` 或自定义命令字符串。                                                                                                                                                                                                                                                                                                                                                                                                           |
| `QWEN_SANDBOX_IMAGE`                                 | 覆盖 Docker/Podman 的沙箱镜像选择。                                                                                                                                                                                                                                                                                                                                                             | 优先于 `tools.sandboxImage`。                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `SEATBELT_PROFILE`                                   | （macOS 特定）切换 macOS 上的 Seatbelt (`sandbox-exec`) 配置文件。                                                                                                                                                                                                                                                                                                                                        | `permissive-open`：（默认）限制对项目文件夹（及其他几个文件夹，请参阅 `packages/cli/src/utils/sandbox-macos-permissive-open.sb`）的写入，但允许其他操作。`strict`：使用默认拒绝操作的严格配置文件。`<profile_name>`：使用自定义配置文件。要定义自定义配置文件，请在项目的 `.qwen/` 目录中创建一个名为 `sandbox-macos-<profile_name>.sb` 的文件（例如，`my-project/.qwen/sandbox-macos-custom.sb`）。 |
| `DEBUG` or `DEBUG_MODE`                              | （通常由底层库或 CLI 本身使用）设置为 `true` 或 `1` 以启用详细的调试日志记录，这有助于故障排除。                                                                                                                                                                                                                                                           | **注意：** 默认情况下，这些变量会自动从项目 `.env` 文件中排除，以防止干扰 CLI 行为。如果需要专门为 Qwen Code 设置这些变量，请使用 `.qwen/.env` 文件。                                                                                                                                                                                                                                                               |
| `NO_COLOR`                                           | 设置为任何值以禁用 CLI 中的所有颜色输出。                                                                                                                                                                                                                                                                                                                                                         |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `FORCE_HYPERLINK`                                    | 覆盖 Markdown 渲染器中的 OSC 8 可点击链接检测。设置为 `1`（或任何非零整数，或空字符串）以强制启用；设置为 `0` 或非数字值（如 `false` / `off`）以强制禁用。遵循其上方的 `NO_COLOR` / `QWEN_DISABLE_HYPERLINKS` 退出选项。                                                                                                                        | 使用此选项可在 `tmux` / GNU `screen` 内部启用 OSC 8（默认情况下自动检测会拒绝，因为主终端的功能隐藏在多路复用器后面）。在 tmux 3.3+ 上需要 `set -g allow-passthrough on`。同时启用未自动检测到的 Hyper。                                                                                                                                                                                                        |
| `QWEN_DISABLE_HYPERLINKS`                            | 设置为 `1` 以在 Markdown 渲染器中强制禁用 OSC 8 可点击超链接，即使在自动检测为支持该功能的终端上也是如此。                                                                                                                                                                                                                                                                                    | 当终端宣传支持但在长 URL 上崩溃时，或者当通过破坏转义序列的中间件管道输出时，此选项非常有用。渲染器将回退到纯文本 `label (url)` 渲染。                                                                                                                                                                                                                                                                          |
| `CLI_TITLE`                                          | 设置为字符串以自定义 CLI 的标题。                                                                                                                                                                                                                                                                                                                                                               |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `CODE_ASSIST_ENDPOINT`                               | 指定代码辅助服务器的端点。                                                                                                                                                                                                                                                                                                                                                               | 这对于开发和测试非常有用。                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `QWEN_CODE_MAX_OUTPUT_TOKENS`                        | 覆盖每个响应的默认最大输出 token 数。未设置时，Qwen Code 默认使用模型声明的输出限制，如果响应被截断，会自动提升（下限 64K）并在多轮中恢复。将其设置为特定值（例如 `16000`）以使用固定限制——这对于希望降低每个请求槽位预留的容量受限的自托管后端非常有用。 | 优先于模型限制默认值，但会被设置中的 `samplingParams.max_tokens` 覆盖。设置后会禁用自动提升。示例：`export QWEN_CODE_MAX_OUTPUT_TOKENS=16000`                                                                                                                                                                                                                                                                            |
| `QWEN_CODE_UNATTENDED_RETRY`                         | 设置为 `true` 或 `1` 以启用持久重试模式。启用后，瞬态 API 容量错误（HTTP 429 Rate Limit 和 529 Overloaded）将无限期重试，采用指数退避（每次重试上限为 5 分钟），并在 stderr 上每 30 秒发送一次心跳保活。                                                                                                                                | 专为 CI/CD 管道和后台自动化设计，在这些场景中，长时间运行的任务应能在临时 API 中断中存活。必须显式设置——仅设置 `CI=true` **不会**激活此模式。详情请参阅 [Headless Mode](../features/headless#persistent-retry-mode)。示例：`export QWEN_CODE_UNATTENDED_RETRY=1`                                                                                                                                                        |
| `QWEN_CODE_ACP_REPEATED_TOOL_FAILURE_GUARD`          | ACP 重复工具执行失败防护的运维发布模式。接受 `off`、`shadow`、`warn` 或 `enforce`；缺失或无效的值默认为 `shadow`。                                                                                                                                                                                                                         | 仅适用于交互式前台 ACP prompt；频道驱动和自动路由保持关闭。项目和工作区环境文件无法设置此运维策略。Shadow 不修改模型续写和消息，但会将排队 prompt 监视标志添加到 `craft/drainMidTurnQueue`；每个非 off 模式都需要可靠的排队 prompt 状态。非空的无效值会输出诊断信息；请在进程环境或用户级文件中导出该变量。 |
| `QWEN_CODE_PROFILE_STARTUP`                          | 设置为 `1` 以启用启动性能分析。将包含各阶段耗时的 JSON 计时报告写入 `~/.qwen/startup-perf/`。                                                                                                                                                                                                                                                                             | 仅在沙箱子进程内部（或使用 `QWEN_CODE_PROFILE_STARTUP_OUTER=1` 时）处于活动状态。未设置时零开销。示例：`export QWEN_CODE_PROFILE_STARTUP=1`                                                                                                                                                                                                                                                                                                              |
| `QWEN_CODE_PROFILE_STARTUP_OUTER`                    | 与 `QWEN_CODE_PROFILE_STARTUP=1` 一起设置为 `1`，以在外层（沙箱前）进程中也收集启动分析。外层进程报告会获得 `outer-` 文件名前缀，以使其与沙箱子进程的报告区分开来。                                                                                                                                                                        | 默认关闭——仅沙箱子进程收集，以避免重复报告。对于 CLI 不会重新启动到沙箱中的本地开发非常有用。                                                                                                                                                                                                                                                                                                                          |
| `QWEN_CODE_PROFILE_STARTUP_NO_HEAP`                  | 与 `QWEN_CODE_PROFILE_STARTUP=1` 一起设置为 `1`，以跳过每个检查点的 `process.memoryUsage()` 快照。在测量分析器自身的海森堡开销时非常有用。                                                                                                                                                                                                                               | 默认关闭。堆快照每次耗时约 50 µs（远低于总启动时间的 1%），因此大多数用户应保持原样。                                                                                                                                                                                                                                                                                                                                                            |
| `QWEN_CODE_LEGACY_MCP_BLOCKING`                      | 设置为 `1` 以恢复渐进式 MCP 之前的行为，即 `Config.initialize()` 在返回前同步等待每个配置的 MCP 服务器的 discover 握手。                                                                                                                                                                                                                                    | 默认关闭。现代 qwen-code 允许 MCP 服务器在后台上线，而 UI 已经可以交互；模型在服务器稳定后约 16 毫秒内看到每批新工具。此标志作为 ≥ 1 个版本的回滚逃生舱保留。示例：`export QWEN_CODE_LEGACY_MCP_BLOCKING=1`                                                                                                                                                                  |
当两个用户级 `.env` 文件定义了相同的变量时，Qwen 专属文件优先：`<QWEN_HOME>/.env`（当 `QWEN_HOME` 未设置时为 `~/.qwen/.env`）会在 `~/.env` 之前加载，且不会覆盖现有的环境变量值。

## 命令行参数

在运行 CLI 时直接传递的参数可以覆盖该特定会话的其他配置。

对于沙箱镜像选择，优先级为：
`--sandbox-image` > `QWEN_SANDBOX_IMAGE` > `tools.sandboxImage` > 内置默认镜像。

### 命令行参数表

| 参数 | 别名 | 描述 | 可选值 | 备注 |
| --- | --- | --- | --- | --- |
| `--model` | `-m` | 指定本次会话使用的 Qwen 模型。 | 模型名称 | 示例：`npm start -- --model qwen3-coder-plus` |
| `--prompt` | `-p` | 用于直接向命令传递 prompt。这将以非交互模式调用 Qwen Code。 | 你的 prompt 文本 | 对于脚本示例，使用 `--output-format json` 标志以获取结构化输出。 |
| `--prompt-interactive` | `-i` | 启动一个交互会话，并将提供的 prompt 作为初始输入。 | 你的 prompt 文本 | prompt 在交互会话内部处理，而不是在此之前。当从 stdin 管道输入时不能使用。示例：`qwen -i "explain this code"` |
| `--system-prompt` | | 覆盖本次运行的内置主会话 system prompt。 | 你的 prompt 文本 | 加载的上下文文件（如 `QWEN.md`）仍会在此覆盖之后追加。可与 `--append-system-prompt` 结合使用。 |
| `--append-system-prompt` | | 为本次运行的主会话 system prompt 追加额外指令。 | 你的 prompt 文本 | 在内置 prompt 和加载的上下文文件之后应用。可与 `--system-prompt` 结合使用。示例请参见 [Headless Mode](../features/headless)。 |
| `--output-format` | `-o` | 指定非交互模式下 CLI 输出的格式。 | `text`, `json`, `stream-json` | `text`：（默认）标准的人类可读输出。`json`：在执行结束时发出的机器可读 JSON 输出。`stream-json`：在执行期间发生时发出的流式 JSON 消息。对于结构化输出和脚本，使用 `--output-format json` 或 `--output-format stream-json` 标志。详细信息请参见 [Headless Mode](../features/headless)。 |
| `--input-format` | | 指定从标准输入消耗的格式。 | `text`, `stream-json` | `text`：（默认）来自 stdin 或命令行参数的标准文本输入。`stream-json`：通过 stdin 进行双向通信的 JSON 消息协议。要求：`--input-format stream-json` 需要设置 `--output-format stream-json`。使用 `stream-json` 时，stdin 保留用于协议消息。详细信息请参见 [Headless Mode](../features/headless)。 |
| `--include-partial-messages` | | 使用 `stream-json` 输出格式时包含部分 assistant 消息。启用后，会在流式传输过程中发出流事件（message_start、content_block_delta 等）。 | | 默认值：`false`。要求：需要设置 `--output-format stream-json`。有关流事件的详细信息，请参见 [Headless Mode](../features/headless)。 |
| `--sandbox` | `-s` | 为本次会话启用沙箱模式。 | | |
| `--sandbox-image` | | 设置沙箱镜像 URI。 | | |
| `--debug` | `-d` | 为本次会话启用调试模式，提供更详细的输出。 | | |
| `--help` | `-h` | 显示有关命令行参数的帮助信息。 | | |
| `--yolo` | | 启用 YOLO 模式，自动批准所有 tool calls。 | | |
| `--approval-mode` | | 设置 tool calls 的批准模式。 | `plan`, `default`, `auto-edit`, `auto`, `yolo` | 支持的模式：`plan`：仅分析——不修改文件或执行命令。`default`：文件编辑或 shell 命令需要批准（默认行为）。`auto-edit`：自动批准编辑工具（`edit`、`write_file`、`notebook_edit`），其他工具则提示。`auto`：LLM 分类器自动批准安全操作并阻止危险操作。`yolo`：自动批准所有 tool calls（等同于 `--yolo`）。不能与 `--yolo` 一起使用。对于新的统一方法，请使用 `--approval-mode=yolo` 而不是 `--yolo`。示例：`qwen --approval-mode auto-edit`<br>有关 [Approval Mode](../features/approval-mode) 的更多信息。 |
| `--allowed-tools` | | 以逗号分隔的 tool 名称列表，将绕过确认对话框。 | Tool 名称 | 示例：`qwen --allowed-tools "Shell(git status)"` |
| `--disabled-slash-commands` | | 要隐藏/禁用的 slash command 名称（逗号分隔或重复）。与 `slashCommands.disabled` 设置和 `QWEN_DISABLED_SLASH_COMMANDS` 环境变量合并。与最终命令名称进行不区分大小写的匹配。 | 命令名称 | 示例：`qwen --disabled-slash-commands "auth,mcp,extensions"` |
| `--telemetry` | | 启用 [telemetry](../../developers/development/telemetry.md)。 | | |
| `--telemetry-target` | | 设置 telemetry 目标。 | | 有关更多信息，请参见 [telemetry](../../developers/development/telemetry.md)。 |
| `--telemetry-otlp-endpoint` | | 设置 telemetry 的 OTLP 端点。 | | 有关更多信息，请参见 [telemetry](../../developers/development/telemetry.md)。 |
| `--telemetry-otlp-protocol` | | 设置 telemetry 的 OTLP 协议（`grpc` 或 `http`）。 | | 默认为 `grpc`。有关更多信息，请参见 [telemetry](../../developers/development/telemetry.md)。 |
| `--telemetry-log-prompts` | | 启用 telemetry 的 prompt 日志记录。 | | 有关更多信息，请参见 [telemetry](../../developers/development/telemetry.md)。 |
| `--acp` | | 启用 ACP 模式（Agent Client Protocol）。适用于 [Zed](../integration-zed) 等 IDE/编辑器集成。 | | 稳定版。取代已弃用的 `--experimental-acp` 标志。 |
| `--experimental-lsp` | | 启用实验性的 [LSP (Language Server Protocol)](../features/lsp) 功能，用于代码智能（跳转到定义、查找引用、诊断等）。 | | 实验性。需要安装 language servers。 |
| `--extensions` | `-e` | 指定本次会话要使用的 extensions 列表。 | Extension 名称 | 如果未提供，则使用所有可用的 extensions。使用特殊命令 `qwen -e none` 可禁用所有 extensions。示例：`qwen -e my-extension -e my-other-extension` |
| `--list-extensions` | `-l` | 列出所有可用的 extensions 并退出。 | | |
| `--proxy` | | 设置 CLI 的代理。 | 代理 URL | 示例：`--proxy http://localhost:7890`。 |
| `--include-directories` | | 在工作区中包含额外的目录以支持多目录。 | 目录路径 | 可多次指定或作为逗号分隔的值。示例：`--include-directories /path/to/project1,/path/to/project2` 或 `--include-directories /path/to/project1 --include-directories /path/to/project2` |
| `--screen-reader` | | 启用屏幕阅读器模式，调整 TUI 以更好地兼容屏幕阅读器。 | | |
| `--version` | | 显示 CLI 的版本。 | | |
| `--openai-logging` | | 启用 OpenAI API 调用的日志记录，用于调试和分析。 | | 此标志会覆盖 `settings.json` 中的 `enableOpenAILogging` 设置。 |
| `--openai-logging-dir` | | 设置 OpenAI API 日志的自定义目录路径。 | 目录路径 | 此标志会覆盖 `settings.json` 中的 `openAILoggingDir` 设置。支持绝对路径、相对路径和 `~` 展开。示例：`qwen --openai-logging-dir "~/qwen-logs" --openai-logging` |
## 上下文文件（分层指令上下文）

虽然上下文文件严格来说不是用于配置 CLI _行为_ 的，但上下文文件（默认为 `QWEN.md`，可通过 `context.fileName` 设置进行配置）对于配置 _指令上下文_（也称为“记忆”）至关重要。这个强大的功能允许你向 AI 提供特定于项目的指令、编码风格指南或任何相关的背景信息，使其响应更贴合你的需求并更加准确。CLI 包含一些 UI 元素，例如在页脚显示已加载上下文文件数量的指示器，让你随时了解当前激活的上下文。

- **用途：** 这些 Markdown 文件包含你希望 Qwen 模型在交互过程中了解的指令、指南或上下文。该系统被设计为分层管理这些指令上下文。

### 上下文文件内容示例（例如 `QWEN.md`）

以下是一个概念性示例，展示了 TypeScript 项目根目录下的上下文文件可能包含的内容：

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
     - 作用域：为你的所有项目提供默认指令。
  2. **项目根目录及祖先目录上下文文件：**
     - 位置：CLI 会在当前工作目录中搜索配置的上下文文件，然后向上搜索每个父目录，直到项目根目录（通过 `.git` 文件夹识别）或你的主目录。
     - 作用域：提供与整个项目或其重要部分相关的上下文。
- **拼接与 UI 指示：** 所有找到的上下文文件的内容会被拼接在一起（带有指示其来源和路径的分隔符），并作为系统提示词的一部分提供。CLI 页脚会显示已加载上下文文件的数量，让你快速直观地了解当前激活的指令上下文。
- **导入内容：** 你可以使用 `@path/to/file.md` 语法导入其他 Markdown 文件，从而将上下文文件模块化。更多详情请参阅[记忆文档](../features/memory.md)。
- **记忆管理命令：**
  - 使用 `/memory` 打开记忆管理对话框。
  - 在对话框中刷新记忆，以重新扫描并从所有配置的位置重新加载上下文文件。
  - 有关 `/memory` 命令的完整详细信息，请参阅[命令文档](../features/commands.md)。

通过理解并利用这些配置层以及上下文文件的分层特性，你可以有效地管理 AI 的记忆，并使 Qwen Code 的响应量身定制以满足你的特定需求和项目。

## 沙盒

Qwen Code 可以在沙盒环境中执行潜在的不安全操作（如 shell 命令和文件修改），以保护你的系统。

[沙盒](../features/sandbox) 默认处于禁用状态，但你可以通过以下几种方式启用它：

- 使用 `--sandbox` 或 `-s` 标志。
- 设置 `QWEN_SANDBOX` 环境变量。
- 在设置中配置 `tools.sandbox`。

> ⚠️ **`--yolo` _不会_ 自动启用沙盒。** YOLO 模式仅自动批准工具调用；仍必须通过 `--sandbox`、`QWEN_SANDBOX` 或 `tools.sandbox` 来选择启用沙盒。在使用 `--yolo`（或 `--approval-mode=yolo`）且没有沙盒的无头/非交互式运行中，模型可以在当前进程的权限级别执行 shell、写入和编辑工具——在这种情况下，Qwen Code 会向 stderr 打印警告。在权衡利弊后，可以使用 `QWEN_CODE_SUPPRESS_YOLO_WARNING=1` 来抑制此警告。

默认情况下，它使用预构建的 `qwen-code-sandbox` Docker 镜像。

对于特定于项目的沙盒需求，你可以在项目根目录的 `.qwen/sandbox.Dockerfile` 处创建一个自定义 Dockerfile。此 Dockerfile 可以基于基础沙盒镜像：

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

- **工具调用：** 我们会记录被调用的工具名称和类别（原生或 MCP）、其最终状态（成功、错误或已取消），以及执行所需的时间。我们不会收集传递给工具的参数或它们返回的任何数据。
- **API 请求：** 我们会记录每次请求使用的模型、请求的持续时间以及是否成功。我们不会收集提示词或响应的内容。
- **会话信息：** 我们会收集有关 CLI 配置的信息，例如启用的工具和批准模式。

**我们不收集的内容：**

- **个人身份信息 (PII)：** 我们不会收集任何个人信息，例如你的姓名、电子邮件地址或 API 密钥。
- **提示词和响应内容：** 我们不会记录你的提示词内容或模型的响应内容。
- **文件内容：** 我们不会记录 CLI 读取或写入的任何文件的内容。

**如何退出：**

你可以随时通过在 `settings.json` 文件的 `privacy` 类别下将 `usageStatisticsEnabled` 属性设置为 `false` 来退出使用统计数据的收集：

```
{
  "privacy": {
    "usageStatisticsEnabled": false
  }
}
```

或者，在环境中设置 `QWEN_USAGE_STATISTICS_ENABLED=false`（或 `0`）。环境变量优先于该设置。更改任一值后请重启 Qwen Code。

> [!note]
>
> 启用使用统计后，事件将被发送到阿里云 RUM 收集端点。