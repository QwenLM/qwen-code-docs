# Qwen Code 配置

> [!tip]
>
> **身份验证 / API key：** 身份验证（API Key、阿里云编码计划）及相关环境变量（如 `OPENAI_API_KEY`）的说明请参阅 **[身份验证](../configuration/auth)**。

> [!note]
>
> **新配置格式说明**：`settings.json` 文件已更新为更有条理的新结构，旧格式将自动迁移。
> Qwen Code 提供多种配置方式，包括环境变量、命令行参数和配置文件。本文介绍不同的配置方法及可用设置。

## 配置层级

配置按以下优先级顺序生效（编号越大优先级越高，会覆盖编号较小的配置）：

| 层级 | 配置来源           | 说明                                                           |
| ---- | ------------------ | -------------------------------------------------------------- |
| 1    | 默认值             | 应用内硬编码的默认值                                           |
| 2    | 系统默认文件       | 系统级默认设置，可被其他配置文件覆盖                           |
| 3    | 用户配置文件       | 当前用户的全局设置                                             |
| 4    | 项目配置文件       | 特定项目的设置                                                 |
| 5    | 系统配置文件       | 覆盖所有其他配置文件的系统级设置                               |
| 6    | 环境变量           | 系统级或会话级变量，可从 `.env` 文件加载                       |
| 7    | 命令行参数         | 启动 CLI 时传入的值                                            |

## 配置文件

Qwen Code 使用 JSON 配置文件进行持久化配置，共有四个存储位置：

| 文件类型       | 位置                                                                                                                                                                                                                                                                                                                | 作用范围                                                                                                                                   |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| 系统默认文件   | Linux: `/etc/qwen-code/system-defaults.json`<br>Windows: `C:\ProgramData\qwen-code\system-defaults.json`<br>macOS: `/Library/Application Support/QwenCode/system-defaults.json` <br>可通过 `QWEN_CODE_SYSTEM_DEFAULTS_PATH` 环境变量覆盖路径。 | 提供系统级默认设置的基础层，优先级最低，可被用户、项目或系统覆盖设置所覆盖。                                                               |
| 用户配置文件   | `~/.qwen/settings.json`（`~` 为你的主目录）。                                                                                                                                                                                                                                                                       | 适用于当前用户的所有 Qwen Code 会话。                                                                                                      |
| 项目配置文件   | 项目根目录下的 `.qwen/settings.json`。                                                                                                                                                                                                                                                                              | 仅在从该项目运行 Qwen Code 时生效，项目设置会覆盖用户设置。                                                                               |
| 系统配置文件   | Linux：`/etc/qwen-code/settings.json` <br>Windows: `C:\ProgramData\qwen-code\settings.json` <br>macOS: `/Library/Application Support/QwenCode/settings.json`<br>可通过 `QWEN_CODE_SYSTEM_SETTINGS_PATH` 环境变量覆盖路径。                                                                                          | 适用于系统中所有用户的所有 Qwen Code 会话，系统设置会覆盖用户和项目设置。适合企业系统管理员统一管控用户的 Qwen Code 配置。 |

> [!note]
>
> **配置文件中的环境变量：** `settings.json` 文件中的字符串值支持使用 `$VAR_NAME` 或 `${VAR_NAME}` 语法引用环境变量，加载设置时会自动解析。例如，若存在环境变量 `MY_API_TOKEN`，可在 `settings.json` 中这样使用：`"apiKey": "$MY_API_TOKEN"`。

### 项目中的 `.qwen` 目录

除了项目配置文件，项目的 `.qwen` 目录还可以包含其他与 Qwen Code 运行相关的项目特定文件，例如：

- [自定义沙箱配置文件](../features/sandbox)（如 `.qwen/sandbox-macos-custom.sb`、`.qwen/sandbox.Dockerfile`）。
- [Agent Skill](../features/skills)，位于 `.qwen/skills/` 下（每个 Skill 是一个包含 `SKILL.md` 的目录）。

### 配置迁移

Qwen Code 会自动将旧版配置设置迁移为新格式，迁移前会备份旧配置文件。以下设置已从否定形式（`disable*`）重命名为肯定形式（`enable*`）：

| 旧设置                                   | 新设置                                      | 备注             |
| ---------------------------------------- | ------------------------------------------- | ---------------- |
| `disableAutoUpdate` + `disableUpdateNag` | `general.enableAutoUpdate`                  | 合并为单一设置   |
| `disableLoadingPhrases`                  | `ui.accessibility.enableLoadingPhrases`     |                  |
| `disableFuzzySearch`                     | `context.fileFiltering.enableFuzzySearch`   |                  |
| `disableCacheControl`                    | `model.generationConfig.enableCacheControl` |                  |

> [!note]
>
> **布尔值取反：** 迁移时布尔值会取反（例如 `disableAutoUpdate: true` 变为 `enableAutoUpdate: false`）。

#### `disableAutoUpdate` 与 `disableUpdateNag` 的合并策略

当两个旧设置同时存在且值不同时，迁移遵循以下策略：若 `disableAutoUpdate` **或** `disableUpdateNag` 任一为 `true`，则 `enableAutoUpdate` 变为 `false`：

| `disableAutoUpdate` | `disableUpdateNag` | 迁移后的 `enableAutoUpdate` |
| ------------------- | ------------------ | --------------------------- |
| `false`             | `false`            | `true`                      |
| `false`             | `true`             | `false`                     |
| `true`              | `false`            | `false`                     |
| `true`              | `true`             | `false`                     |

### `settings.json` 中的可用设置

设置按类别组织。大多数设置应放在 `settings.json` 文件对应的顶级类别对象中。少数顶级设置（如 `proxy` 和 `plansDirectory`）为兼容性考虑保留为根级键。

#### general

| 设置                                       | 类型    | 说明                                                                                                                                                                                                                                                                 | 默认值      |
| ------------------------------------------ | ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- |
| `general.preferredEditor`                  | string  | 打开文件时首选的编辑器。                                                                                                                                                                                                                                             | `undefined` |
| `general.vimMode`                          | boolean | 启用 Vim 键位绑定。                                                                                                                                                                                                                                                   | `false`     |
| `general.enableAutoUpdate`                 | boolean | 启动时自动检查并安装更新。                                                                                                                                                                                                                                           | `true`      |
| `general.showSessionRecap`                 | boolean | 离开终端一段时间后返回时，自动显示一行"上次进度"摘要。默认关闭。无论此设置如何，均可通过 `/recap` 手动触发。                                                                                                                                                        | `false`     |
| `general.sessionRecapAwayThresholdMinutes` | number  | 终端失焦多少分钟后，聚焦时自动触发摘要。仅在启用 `showSessionRecap` 时生效。                                                                                                                                                                                         | `5`         |
| `general.gitCoAuthor.commit`               | boolean | 在通过 Qwen Code 提交的 git commit 消息中添加 Co-authored-by 尾注，并附加每文件 AI 归因 git note（`refs/notes/ai-attribution`）。禁用则跳过两者。                                                                                                                   | `true`      |
| `general.gitCoAuthor.pr`                   | boolean | 运行 `gh pr create` 时，在 pull request 描述中追加 Qwen Code 归因行。                                                                                                                                                                                               | `true`      |
| `general.defaultFileEncoding`              | string  | 新文件的默认编码。使用 `"utf-8"`（默认）表示无 BOM 的 UTF-8，或使用 `"utf-8-bom"` 表示带 BOM 的 UTF-8。仅在项目明确需要 BOM 时更改此设置。                                                                                                                         | `"utf-8"`   |
| `general.cleanupPeriodDays`                | number  | 保留 `~/.qwen/file-history/` 中供 `/rewind` 使用的会话备份的天数。超过此期限的备份将由每天最多运行一次的后台任务清理。`0` 表示最短保留（约 1 小时）：保留最近一小时内接触过的会话以及当前活跃会话。更改在重启后生效。                                                | `30`        |
| `general.language`                         | enum    | 用户界面语言。使用 `"auto"` 从系统设置自动检测，或指定语言代码（如 `"zh-CN"`、`"fr"`）。可将 JS 语言文件放入 `~/.qwen/locales/` 以添加自定义语言代码。参见 [i18n](../features/language)。需要重启。                                                                  | `"auto"`    |
| `general.outputLanguage`                   | string  | 模型输出的语言。使用 `"auto"` 从系统设置自动检测，或指定具体语言。需要重启。                                                                                                                                                                                        | `"auto"`    |
| `general.dynamicCommandTranslation`        | boolean | 启用动态斜杠命令描述的 AI 翻译。禁用时，动态命令保留原始描述，不调用翻译模型。                                                                                                                                                                                     | `false`     |

#### output

| 设置                    | 类型    | 说明                                              | 默认值   | 可选值             |
| ----------------------- | ------- | ------------------------------------------------- | -------- | ------------------ |
| `output.format`         | string  | CLI 输出格式。                                    | `"text"` | `"text"`, `"json"` |
| `output.showTimestamps` | boolean | 在每条助手回复前显示 `[HH:MM:SS]` 时间戳。       | `false`  |                    |

#### ui

| 设置                                    | 类型             | 说明                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | 默认值        |
| --------------------------------------- | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------- |
| `ui.theme`                              | string           | UI 的颜色主题。可用选项参见 [主题](../configuration/themes)。                                                                                                                                                                                                                                                                                                                                                                                                                        | `"Qwen Dark"` |
| `ui.customThemes`                       | object           | 自定义主题定义。                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | `{}`          |
| `ui.statusLine`                         | object           | 自定义状态栏配置。支持 `command`、`refreshInterval`、`respectUserColors` 和 `hideContextIndicator` 选项。参见 [状态栏](../features/status-line)。                                                                                                                                                                                                                                                                                                                                   | `undefined`   |
| `ui.hideWindowTitle`                    | boolean          | 隐藏窗口标题栏。                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | `false`       |
| `ui.hideTips`                           | boolean          | 隐藏 UI 中的所有提示（启动提示和响应后提示）。参见 [上下文提示](../features/tips)。                                                                                                                                                                                                                                                                                                                                                                                                 | `false`       |
| `ui.hideBanner`                         | boolean          | 隐藏启动时的 ASCII logo 和信息面板。除非同时设置了 `ui.hideTips`，否则提示和聊天输入框仍会显示。                                                                                                                                                                                                                                                                                                                                                                                    | `false`       |
| `ui.customBannerTitle`                  | string           | 替换横幅信息面板中默认的 `>_ Qwen Code` 标题。`(vX.Y.Z)` 版本后缀始终追加；身份验证、模型和路径行不受影响。经过净化处理，最多 80 个字符。                                                                                                                                                                                                                                                                                                                                           | `""`          |
| `ui.customBannerSubtitle`               | string           | 可选的副标题行，显示在横幅标题和身份验证/模型行之间，替代原有的空行。经过净化处理，最多 160 个字符。默认为空，保留原有空行。                                                                                                                                                                                                                                                                                                                                                        | `""`          |
| `ui.customAsciiArt`                     | string \| object | 替换横幅中的 QWEN ASCII logo。接受内联字符串（用于两种宽度档），`{ "path": "./brand.txt" }`（相对路径以所属配置文件目录为基准；在 POSIX 上使用 `O_NOFOLLOW` 在启动时读取一次，最大 64 KB），或 `{ "small": ..., "large": ... }` 用于感知宽度的选择。经过净化处理，每档最多 200 行 × 200 列。                                                                                                                                                                                         | `undefined`   |
| `ui.showLineNumbers`                    | boolean          | 在 CLI 输出的代码块中显示行号。                                                                                                                                                                                                                                                                                                                                                                                                                                                      | `true`        |
| `ui.renderMode`                         | string           | 默认 Markdown 显示模式。使用 `"render"` 获得富视觉预览，使用 `"raw"` 默认显示面向源码的 Markdown。会话中可通过 `Alt/Option+M` 切换；在 macOS 上终端须将 Option 键发送为 Meta 键。参见 [Markdown 渲染](../features/markdown-rendering)。                                                                                                                                                                                                                                              | `"render"`    |
| `ui.showCitations`                      | boolean          | 在聊天中显示生成文本的引用来源。                                                                                                                                                                                                                                                                                                                                                                                                                                                     | `false`       |
| `ui.history.collapseOnResume`           | boolean          | 恢复会话时是否默认折叠历史记录。可通过 `/history collapse-on-resume` 和 `/history expand-on-resume` 切换。                                                                                                                                                                                                                                                                                                                                                                          | `false`       |
| `ui.compactMode`                        | boolean          | 隐藏工具输出和思考过程，界面更简洁。会话中可通过 `Ctrl+O` 切换，或通过设置对话框操作。工具审批提示在紧凑模式下永不隐藏。该设置跨会话持久保存。                                                                                                                                                                                                                                                                                                                                      | `false`       |
| `ui.shellOutputMaxLines`                | number           | 内联显示的 Shell 输出最大行数。设为 `0` 取消限制，显示完整输出。超出部分通过 `+N lines` 指示器呈现。错误、`!` 前缀的用户命令、确认工具以及聚焦的嵌入式 Shell 始终显示完整输出。                                                                                                                                                                                                                                                                                                     | `5`           |
| `ui.enableWelcomeBack`                  | boolean          | 返回有对话历史的项目时显示欢迎回来对话框。启用后，Qwen Code 会自动检测你是否返回了包含之前生成的项目摘要（`.qwen/PROJECT_SUMMARY.md`）的项目，并弹出对话框让你选择继续上次对话或重新开始。选择**开始新聊天会话**后，该选择会在项目摘要变更前对当前项目保持记忆。此功能与 `/summary` 命令和退出确认对话框集成。                                                                                                                                                                      | `true`        |
| `ui.accessibility.enableLoadingPhrases` | boolean          | 启用加载提示语（辅助功能需求可禁用）。                                                                                                                                                                                                                                                                                                                                                                                                                                               | `true`        |
| `ui.accessibility.screenReader`         | boolean          | 启用屏幕阅读器模式，调整 TUI 以更好地兼容屏幕阅读器。                                                                                                                                                                                                                                                                                                                                                                                                                               | `false`       |
| `ui.customWittyPhrases`                 | array of strings | 加载状态下显示的自定义短语列表。提供后，CLI 将循环显示这些短语而非默认短语。                                                                                                                                                                                                                                                                                                                                                                                                        | `[]`          |
| `ui.showResponseTokensPerSecond`        | boolean          | 模型流式输出时，在响应 token 计数器旁显示实时 tokens/sec 估算值。这是生成速度参考值，不是预计完成时间或完成百分比。下次会话后生效。                                                                                                                                                                                                                                                                                                                                                  | `false`       |
| `ui.enableFollowupSuggestions`          | boolean          | 启用[后续建议](../features/followup-suggestions)，在模型响应后预测你接下来想输入的内容。建议以占位文本显示，通过 Tab、Enter 或右箭头键接受（填入输入框，不自动提交）。默认开启；设为 `false` 可关闭。                                                                                                                                                                                                                                                                               | `true`        |
| `ui.enableCacheSharing`                 | boolean          | 为建议生成使用感知缓存的分叉查询，在支持前缀缓存的提供商上可降低成本（实验性）。                                                                                                                                                                                                                                                                                                                                                                                                    | `true`        |
| `ui.enableSpeculation`                  | boolean          | 在提交前投机式执行已接受的建议，接受时结果即时显示（实验性）。                                                                                                                                                                                                                                                                                                                                                                                                                      | `false`       |

#### ide

| 设置               | 类型    | 说明                             | 默认值  |
| ------------------ | ------- | -------------------------------- | ------- |
| `ide.enabled`      | boolean | 启用 IDE 集成模式。              | `false` |
| `ide.hasSeenNudge` | boolean | 用户是否已看过 IDE 集成提示。    | `false` |

#### privacy

| 设置                             | 类型    | 说明                       | 默认值 |
| -------------------------------- | ------- | -------------------------- | ------ |
| `privacy.usageStatisticsEnabled` | boolean | 启用使用统计数据收集。     | `true` |

#### model

| 设置                                               | 类型    | 说明                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | 默认值      |
| -------------------------------------------------- | ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- |
| `model.name`                                       | string  | 对话使用的 Qwen 模型。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | `undefined` |
| `model.maxSessionTurns`                            | number  | 会话中保留的用户/模型/工具轮次上限。-1 表示无限制。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | `-1`        |
| `model.maxWallTimeSeconds`                         | number  | 无人值守运行的挂钟时间预算（秒）。`-1` 表示无限制。可通过 `--max-wall-time` 按调用覆盖，需为正值（`90`、`30s`、`5m`、`1h`、`1.5h`）；最小值为 1 秒，亚秒级值（`500ms`、`0.5`）会被拒绝。不传该参数则回退到本设置。超出时以退出码 55 中止。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | `-1`        |
| `model.maxToolCalls`                               | number  | 本次运行的累计工具调用预算（统计每次执行的工具，无论成功或失败；`--json-schema` 下的 `structured_output` 豁免）。`-1` 表示无限制；`0` 表示"禁止工具调用"。上限 1,000,000 以防笔误。可通过 `--max-tool-calls` 覆盖。超出时以退出码 55 中止。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | `-1`        |
| `model.generationConfig`                           | object  | 传递给底层内容生成器的高级覆盖参数。支持请求控制项，如 `timeout`、`maxRetries`、`enableCacheControl`、`splitToolMedia`（默认 `true`；将工具返回的媒体（含内置 read_file 读取的图片）拆分到后续用户消息，而非违反规范的 `role: "tool"` 消息，以便 doubao / new-api / LM Studio 等严格兼容 OpenAI 的服务器能看到；设为 `false` 恢复旧的嵌入工具行为）、`toolResultContentFormat`（默认 `"parts"`；仅对工具模板忽略文本内容部分的旧版 OpenAI 兼容运行时（如旧版 GLM-5.1 vLLM/SGLang 模板）设为 `"string"`。工具返回的媒体仍由 `splitToolMedia` 控制）、`contextWindowSize`（覆盖模型上下文窗口大小）、`modalities`（覆盖自动检测的输入模态）、`customHeaders`（API 请求的自定义 HTTP 头）和 `extra_body`（仅适用于 OpenAI 兼容 API 请求的额外请求体参数），以及 `samplingParams` 下的微调旋钮（如 `temperature`、`top_p`、`max_tokens`）。不设置则依赖提供商默认值。 | `undefined` |
| `model.chatCompression.contextPercentageThreshold` | number  | **已移除。** 自动压缩现在使用三级阈值阶梯（警告/自动/硬上限），通过 `computeThresholds()` 函数根据模型上下文窗口内部计算，不再支持用户配置。在 `settings.json` 中设置此字段会被静默忽略（无启动警告）。目前没有"完全禁用压缩"的替代方案——如果压缩本身失败，API 层的被动溢出恢复仍是安全网。（设计变更原因见 PR #4345 / `docs/design/auto-compaction-threshold-redesign.md`。）                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | `N/A`       |
| `model.chatCompression.maxRecentFilesToRetain`     | number  | 自动压缩后，恢复（若文件较小则嵌入，否则按路径引用）到历史记录中的最近接触文件数量。`0` 表示不恢复。环境变量覆盖：`QWEN_COMPACT_MAX_RECENT_FILES`。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | `5`         |
| `model.chatCompression.maxRecentImagesToRetain`    | number  | 自动压缩后恢复到历史记录中的最近图片数量（工具截图/用户粘贴）。`0` 表示不恢复。环境变量覆盖：`QWEN_COMPACT_MAX_RECENT_IMAGES`。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | `3`         |
| `model.chatCompression.enableScreenshotTrigger`    | boolean | 为 `true` 时，当历史记录中工具返回的图片数量达到 `screenshotTriggerThreshold` 时也会触发自动压缩，不依赖 token 用量——针对频繁截图会分散模型注意力的 computer-use 会话。仅统计工具结果中返回的图片，不含用户粘贴的图片。环境变量覆盖：`QWEN_COMPACT_SCREENSHOT_TRIGGER`（`1`/`true`/`0`/`false`）。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | `true`      |
| `model.chatCompression.screenshotTriggerThreshold` | number  | 触发截图触发器的工具返回图片数量阈值（仅在 `enableScreenshotTrigger` 开启时）。压缩会重置计数——存活图片作为顶级部分重新嵌入，触发器不再计数——因此不会立即再次触发。环境变量覆盖：`QWEN_COMPACT_SCREENSHOT_THRESHOLD`。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | `50`        |
| `model.skipNextSpeakerCheck`                       | boolean | 跳过下一发言者检查。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | `true`      |
| `model.skipLoopDetection`                          | boolean | 禁用流式循环检测。默认 `true`（跳过循环检测）以避免误报打断正常工作流。设为 `false` 可重新启用——在无人值守/非交互式运行中，卡死重复可能浪费预算，此时作为保护措施很有用。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | `true`      |
| `model.skipStartupContext`                         | boolean | 跳过每次会话开始时发送的启动工作区上下文（环境摘要和确认）。如果你希望手动提供上下文或想节省启动时的 token，可启用此选项。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | `false`     |
| `model.enableOpenAILogging`                        | boolean | 启用 OpenAI API 调用日志记录，用于调试和分析。启用后，API 请求和响应会记录到 JSON 文件中。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | `false`     |
| `model.openAILoggingDir`                           | string  | OpenAI API 日志的自定义目录路径。未指定时默认为当前工作目录下的 `logs/openai`。支持绝对路径、相对路径（从当前工作目录解析）和 `~` 展开（主目录）。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | `undefined` |

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

**max_tokens（自适应输出 token）：**

当 `samplingParams.max_tokens` 未设置时，Qwen Code 使用自适应输出 token 策略以优化 GPU 资源利用：

1. 请求以默认 **8K** 输出 token 上限开始
2. 如果响应被截断（模型达到上限），Qwen Code 自动以 **64K** token 重试
3. 丢弃部分输出，以重试的完整响应替代

这对用户透明——若触发重试，你可能会短暂看到重试指示器。由于 99% 的响应不超过 5K token，重试极少发生（< 1% 的请求）。

如需覆盖此行为，可在设置中指定 `samplingParams.max_tokens`，或使用 `QWEN_CODE_MAX_OUTPUT_TOKENS` 环境变量。

**toolResultContentFormat：**

控制纯文本工具结果在 OpenAI 兼容请求中的序列化方式。默认 `"parts"` 保持标准内容部分数组形式。仅对工具模板忽略文本内容部分的旧版 OpenAI 兼容运行时（如旧版 GLM-5.1 vLLM/SGLang 模板）设为 `"string"`。工具返回的媒体仍由 `splitToolMedia` 控制。

**contextWindowSize：**

覆盖所选模型的默认上下文窗口大小。Qwen Code 使用基于模型名称匹配的内置默认值来确定上下文窗口，并有固定回退值。当提供商的实际上下文限制与 Qwen Code 的默认值不同时，使用此设置。此值定义模型假定的最大上下文容量，而非每次请求的 token 限制。

当所选模型在 `modelProviders` 中定义时，应在该提供商条目的 `generationConfig` 中设置 `contextWindowSize`，而非顶级 `model.generationConfig`。提供商模型条目是封闭的，顶级生成设置不会填补提供商字段的缺失值。

**modalities：**

覆盖所选模型自动检测的输入模态。Qwen Code 根据模型名称模式匹配自动检测支持的模态（image、PDF、audio、video）。当自动检测结果不正确时使用此设置——例如，为某个支持 PDF 但未被识别的模型启用 `pdf`。格式：`{ "image": true, "pdf": true, "audio": true, "video": true }`。不支持的类型可省略键或设为 `false`。

**customHeaders：**

允许为所有 API 请求添加自定义 HTTP 头。适用于请求追踪、监控、API 网关路由，或不同模型需要不同头的场景。对于提供商模型，在 `modelProviders[].generationConfig.customHeaders` 中定义 `customHeaders`。对于没有匹配提供商条目的运行时模型，在 `model.generationConfig.customHeaders` 中定义。两个层级之间不会合并。

`extra_body` 字段允许向发送给 API 的请求体添加自定义参数，适用于标准配置字段未覆盖的提供商特定选项。**注意：此字段仅支持 OpenAI 兼容提供商（`openai`、`qwen-oauth`），对 Anthropic 和 Gemini 提供商无效。** 对于提供商模型，在 `modelProviders[].generationConfig.extra_body` 中定义。对于没有匹配提供商条目的运行时模型，在 `model.generationConfig.extra_body` 中定义。

**model.openAILoggingDir 示例：**

- `"~/qwen-logs"` - 日志写入 `~/qwen-logs` 目录
- `"./custom-logs"` - 日志写入相对于当前目录的 `./custom-logs`
- `"/tmp/openai-logs"` - 日志写入绝对路径 `/tmp/openai-logs`

#### fastModel

| 设置        | 类型   | 说明                                                                                                                                                                              | 默认值 |
| ----------- | ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| `fastModel` | string | 用于生成[提示建议](../features/followup-suggestions)和投机式执行的模型。留空则使用主模型。使用更小/更快的模型（如 `qwen3-coder-flash`）可降低延迟和成本。也可通过 `/model --fast` 设置。 | `""`   |

#### context

| 设置                                                        | 类型                       | 说明                                                                                                                                                                                                                                                                  | 默认值                          |
| ----------------------------------------------------------- | -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------- |
| `context.fileName`                                          | string or array of strings | 上下文文件名。                                                                                                                                                                                                                                                        | `undefined`                     |
| `context.importFormat`                                      | string                     | 导入记忆时使用的格式。                                                                                                                                                                                                                                                | `undefined`                     |
| `context.includeDirectories`                                | array                      | 要包含在工作区上下文中的额外目录。指定额外的绝对或相对路径数组以包含在工作区上下文中。缺失的目录默认会跳过并发出警告。路径可使用 `~` 引用用户主目录。此设置可与 `--include-directories` 命令行参数组合使用。                                                         | `[]`                            |
| `context.loadFromIncludeDirectories`                        | boolean                    | 控制 `/memory refresh` 命令的行为。若设为 `true`，则从所有已添加的目录加载 `QWEN.md` 文件；若设为 `false`，则仅从当前目录加载 `QWEN.md`。                                                                                                                            | `false`                         |
| `context.fileFiltering.respectGitIgnore`                    | boolean                    | 搜索时遵循 .gitignore 文件。                                                                                                                                                                                                                                          | `true`                          |
| `context.fileFiltering.respectQwenIgnore`                   | boolean                    | 搜索时遵循 .qwenignore 和已配置的自定义忽略文件。                                                                                                                                                                                                                    | `true`                          |
| `context.fileFiltering.customIgnoreFiles`                   | array                      | 启用 `respectQwenIgnore` 时，使用的项目根目录相对路径忽略文件，替代默认兼容文件（`.agentignore`、`.aiignore`）。`.qwenignore` 始终包含。                                                                                                                              | `[".agentignore", ".aiignore"]` |
| `context.fileFiltering.enableRecursiveFileSearch`           | boolean                    | 在提示符中补全 `@` 前缀时，是否递归搜索当前目录树下的文件名。                                                                                                                                                                                                        | `true`                          |
| `context.fileFiltering.enableFuzzySearch`                   | boolean                    | 为 `true` 时，搜索文件时启用模糊搜索。对于文件数量庞大的项目，可设为 `false` 以提升性能。                                                                                                                                                                            | `true`                          |
| `context.clearContextOnIdle.toolResultsThresholdMinutes`    | number                     | 空闲多少分钟后清除旧工具结果内容。使用 `-1` 禁用空闲触发器。                                                                                                                                                                                                         | `60`                            |
| `context.clearContextOnIdle.toolResultsNumToKeep`           | integer                    | 清除时保留的最近可压缩工具结果数量（整数）。小于 1 的值会被调整为 1。                                                                                                                                                                                                | `5`                             |
| `context.clearContextOnIdle.toolResultsTotalCharsThreshold` | number                     | 历史记录中允许的可压缩工具结果输出总字符数上限，超出时清除最旧的结果。使用 `-1` 禁用大小触发器。这是软阈值：受保护的近期工具结果可能使总量超出该阈值。                                                                                                               | `500000`                        |

#### 文件搜索性能问题排查

如果你遇到文件搜索性能问题（如 `@` 补全较慢），尤其是在文件数量非常多的项目中，可按以下顺序尝试：

1. **使用忽略文件：** 在项目根目录创建 `.qwenignore` 或已配置的自定义忽略文件，排除包含大量无需引用文件的目录（如构建产物、日志、`node_modules`）。减少爬取的文件总数是提升性能最有效的方式。
2. **禁用模糊搜索：** 如果忽略文件效果不足，可在 `settings.json` 中将 `enableFuzzySearch` 设为 `false` 以禁用模糊搜索。这将使用更简单的非模糊匹配算法，速度更快。
3. **禁用递归文件搜索：** 作为最后手段，可将 `enableRecursiveFileSearch` 设为 `false` 以完全禁用递归文件搜索。这是速度最快的选项，因为避免了对项目的递归爬取。但这意味着使用 `@` 补全时需要输入文件的完整路径。

#### tools

| 设置                                  | 类型              | 说明                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | 默认值      | 备注                                                                                                                                                                                              |
| ------------------------------------- | ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tools.sandbox`                       | boolean or string | 沙箱执行环境（可为布尔值或路径字符串）。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | `undefined` |                                                                                                                                                                                                   |
| `tools.sandboxImage`                  | string            | 未设置 `--sandbox-image` 和 `QWEN_SANDBOX_IMAGE` 时，Docker/Podman 使用的沙箱镜像 URI。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | `undefined` |                                                                                                                                                                                                   |
| `tools.shell.enableInteractiveShell`  | boolean           | 使用 `node-pty` 提供交互式 Shell 体验。仍可回退到 `child_process`。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | `true`      |                                                                                                                                                                                                   |
| `tools.core`                          | array of strings  | **已弃用。** 将在下一版本移除。请改用 `permissions.allow` + `permissions.deny`。将内置工具限制为允许列表，列表外的工具均禁用。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | `undefined` |                                                                                                                                                                                                   |
| `tools.exclude`                       | array of strings  | **已弃用。** 请改用 `permissions.deny`。从发现中排除的工具名称。首次加载时自动迁移为 `permissions` 格式。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | `undefined` |                                                                                                                                                                                                   |
| `tools.allowed`                       | array of strings  | **已弃用。** 请改用 `permissions.allow`。绕过确认对话框的工具名称。首次加载时自动迁移为 `permissions` 格式。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | `undefined` |                                                                                                                                                                                                   |
| `tools.approvalMode`                  | string            | 设置工具使用的默认审批模式。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | `default`   | 可选值：`plan`（仅分析，不修改文件或执行命令）、`default`（文件编辑或 Shell 命令前需审批）、`auto-edit`（自动批准文件编辑）、`auto`（LLM 分类器自动批准安全操作，拦截风险操作）、`yolo`（自动批准所有工具调用） |
| `tools.discoveryCommand`              | string            | 运行工具发现的命令。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | `undefined` |                                                                                                                                                                                                   |
| `tools.callCommand`                   | string            | 定义调用通过 `tools.discoveryCommand` 发现的特定工具的自定义 Shell 命令。该 Shell 命令须满足以下条件：第一个命令行参数为函数 `name`（与[函数声明](https://ai.google.dev/gemini-api/docs/function-calling#function-declarations)中完全一致）；从 `stdin` 读取 JSON 格式的函数参数，类似 [`functionCall.args`](https://cloud.google.com/vertex-ai/generative-ai/docs/model-reference/inference#functioncall)；在 `stdout` 以 JSON 格式返回函数输出，类似 [`functionResponse.response.content`](https://cloud.google.com/vertex-ai/generative-ai/docs/model-reference/inference#functionresponse)。 | `undefined` |                                                                                                                                                                                                   |
| `tools.useRipgrep`                    | boolean           | 使用 ripgrep 进行文件内容搜索，而非回退实现。提供更快的搜索性能。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | `true`      |                                                                                                                                                                                                   |
| `tools.useBuiltinRipgrep`             | boolean           | 使用捆绑的 ripgrep 二进制文件。设为 `false` 时使用系统级 `rg` 命令。仅在 `tools.useRipgrep` 为 `true` 时生效。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | `true`      |                                                                                                                                                                                                   |
| `tools.truncateToolOutputThreshold`   | number            | 工具输出超过此字符数时进行截断。适用于 Shell、Grep、Glob、ReadFile 和 ReadManyFiles 工具。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | `25000`     | 需要重启：是                                                                                                                                                                                      |
| `tools.truncateToolOutputLines`       | number            | 截断工具输出时保留的最大行数或条目数。适用于 Shell、Grep、Glob、ReadFile 和 ReadManyFiles 工具。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | `1000`      | 需要重启：是                                                                                                                                                                                      |
| `tools.computerUse.enabled`           | boolean           | 启用内置 Computer Use 工具（cua-driver 原生桌面自动化）。为 `true`（默认）时，`computer_use__*` 工具注册为延迟内置工具；首次调用时下载固定版本的已签名 cua-driver 二进制文件到 `~/.qwen/computer-use/`，并引导完成 macOS 辅助功能/屏幕录制权限设置。                                                                                                                                                                                                                                                                                                                                                                                                                                            | `true`      | 需要重启：是                                                                                                                                                                                      |
| `tools.computerUse.maxImageDimension` | number            | 应用于 cua-driver 截图的最长边像素上限（通过 `set_config` 的 `max_image_dimension`）。`-1`（默认）保留 cua-driver 的内置默认值（1568）；`0` 禁用缩放（全分辨率）；正值限制最长边。较低的上限可减少视觉 token 成本，但会损失细节。                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | `-1`        | 需要重启：是。环境变量覆盖：`QWEN_COMPUTER_USE_MAX_IMAGE_DIMENSION`（非负整数，优先于此设置）                                                                                                     |

> [!note]
>
> **从 `tools.core` / `tools.exclude` / `tools.allowed` 迁移：** 这些旧设置已**弃用**，首次加载时会自动迁移为新的 `permissions` 格式。建议直接配置 `permissions.allow` / `permissions.deny`。使用 `/permissions` 交互式管理规则。

#### memory

| 设置                             | 类型    | 说明                                                                         | 默认值 |
| -------------------------------- | ------- | ---------------------------------------------------------------------------- | ------ |
| `memory.enableManagedAutoMemory` | boolean | 启用从对话中后台提取记忆。                                                   | `true` |
| `memory.enableManagedAutoDream`  | boolean | 启用对收集记忆的自动整合（去重和清理）。                                     | `true` |
| `memory.enableAutoSkill`         | boolean | 工具密集型会话后，启用后台审查以提炼可复用的项目 skill。                     | `true` |
| `memory.autoSkillConfirm`        | boolean | 自动生成的 skill 添加到 skill 库前请求确认。关闭后，自动 skill 会立即保存。  | `true` |

自动记忆的工作原理及 `/memory`、`/remember`、`/dream` 命令的使用方法，参见 [Memory](../features/memory)。

#### permissions

权限系统提供对工具运行权限的精细控制，可指定哪些工具可以运行、哪些需要确认、哪些被拦截。

**决策优先级（从高到低）：`deny` > `ask` > `allow` > _(默认/交互模式)_**

第一条匹配规则生效。规则格式为 `"ToolName"` 或 `"ToolName(specifier)"`。

| 设置                | 类型             | 说明                                                                                   | 默认值      |
| ------------------- | ---------------- | -------------------------------------------------------------------------------------- | ----------- |
| `permissions.allow` | array of strings | 自动批准的工具调用规则（无需确认）。跨所有范围（用户 + 项目 + 系统）合并。             | `undefined` |
| `permissions.ask`   | array of strings | 始终需要用户确认的工具调用规则。优先于 `allow`。                                       | `undefined` |
| `permissions.deny`  | array of strings | 被拦截的工具调用规则。最高优先级——覆盖 `allow` 和 `ask`。                              | `undefined` |

**工具名称别名（规则中均可使用）：**

| 别名                  | 规范工具名          | 备注               |
| --------------------- | ------------------- | ------------------ |
| `Bash`, `Shell`       | `run_shell_command` |                    |
| `Read`, `ReadFile`    | `read_file`         | 元类别——见下文     |
| `Edit`, `EditFile`    | `edit`              | 元类别——见下文     |
| `Write`, `WriteFile`  | `write_file`        |                    |
| `NotebookEdit`        | `notebook_edit`     |                    |
| `NotebookEditTool`    | `notebook_edit`     |                    |
| `Grep`, `SearchFiles` | `grep_search`       |                    |
| `Glob`, `FindFiles`   | `glob`              |                    |
| `ListFiles`           | `list_directory`    |                    |
| `WebFetch`            | `web_fetch`         |                    |
| `Agent`               | `task`              |                    |
| `Skill`               | `skill`             |                    |

**元类别：**

某些规则名自动覆盖多个工具：

| 规则名 | 覆盖的工具                                           |
| ------ | ---------------------------------------------------- |
| `Read` | `read_file`, `grep_search`, `glob`, `list_directory` |
| `Edit` | `edit`, `write_file`, `notebook_edit`                |

> [!important]
> `Read(/path/**)` 匹配**全部四个**读取工具（文件读取、grep、glob 和目录列表）。
> 如需仅限制文件读取，使用 `ReadFile(/path/**)` 或 `read_file(/path/**)`。

**规则语法示例：**

| 规则                          | 含义                                                        |
| ----------------------------- | ----------------------------------------------------------- |
| `"Bash"`                      | 所有 Shell 命令                                             |
| `"Bash(git *)"`               | 以 `git` 开头的 Shell 命令（词边界：不匹配 `gitk`）        |
| `"Bash(git push *)"`          | 如 `git push origin main` 之类的 Shell 命令                 |
| `"Bash(npm run *)"`           | 任意 `npm run` 脚本                                         |
| `"Read"`                      | 所有文件读取操作（read、grep、glob、list）                  |
| `"Read(./secrets/**)"`        | 递归读取 `./secrets/` 下的任意文件                          |
| `"Edit(/src/**/*.ts)"`        | 编辑项目根目录 `/src/` 下的 TypeScript 文件                 |
| `"WebFetch(api.example.com)"` | 从 `api.example.com` 及其所有子域名获取内容                 |
| `"mcp__puppeteer"`            | puppeteer MCP 服务器的所有工具                              |

**路径模式前缀：**

| 前缀   | 含义                         | 示例                |
| ------ | ---------------------------- | ------------------- |
| `//`   | 从文件系统根开始的绝对路径   | `//etc/passwd`      |
| `~/`   | 相对于主目录                 | `~/Documents/*.pdf` |
| `/`    | 相对于项目根                 | `/src/**/*.ts`      |
| `./`   | 相对于当前工作目录           | `./secrets/**`      |
| （无） | 同 `./`                      | `secrets/**`        |

**Shell 命令绕过防护：**

`Read`、`Edit` 和 `WebFetch` 的权限规则在 agent 运行等效 Shell 命令时同样强制执行。例如，若 `Read(./.env)` 在 `deny` 中，agent 无法通过 Shell 命令中的 `cat .env` 绕过。支持的 Shell 命令包括 `cat`、`grep`、`curl`、`wget`、`cp`、`mv`、`rm`、`chmod` 等。未知/安全命令（如 `git`）不受文件/网络规则影响。

**从旧设置迁移：**

| 旧设置          | 等效 `permissions` 规则         | 备注                                     |
| --------------- | ------------------------------- | ---------------------------------------- |
| `tools.allowed` | `permissions.allow`             | 首次加载时自动迁移                       |
| `tools.exclude` | `permissions.deny`              | 首次加载时自动迁移                       |
| `tools.core`    | `permissions.allow`（允许列表） | 自动迁移；未列出的工具在注册表层级被禁用 |

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

控制 CLI 中可用的斜杠命令。适用于多租户或企业部署中锁定命令范围。

| 设置                     | 类型             | 说明                                                                                                                                                                                                                                                           | 默认值      |
| ------------------------ | ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- |
| `slashCommands.disabled` | array of strings | 要隐藏并拒绝执行的斜杠命令名称。与最终命令名不区分大小写匹配（扩展命令使用消歧义形式，如 `myext.deploy`）。**跨范围作为并集合并**，工作区设置可追加条目但不能删除用户或系统设置中定义的条目。 | `undefined` |

同一禁止列表也可通过 `--disabled-slash-commands` CLI 参数（逗号分隔或重复使用）和 `QWEN_DISABLED_SLASH_COMMANDS` 环境变量提供；三个来源的值取并集。

**示例——为沙箱部署锁定内置命令：**

```json
{
  "slashCommands": {
    "disabled": ["auth", "mcp", "extensions", "ide", "quit"]
  }
}
```

将这些值写入系统级 `settings.json`（`/etc/qwen-code/settings.json` 或 `QWEN_CODE_SYSTEM_SETTINGS_PATH`），用户无法从自己的范围缩小禁止列表，被禁用的命令不会出现在自动补全中，输入后也不会执行。

> [!note]
> 此设置仅控制斜杠命令（如 `/auth`、`/mcp`），不影响工具权限——工具权限请参见 `permissions.deny`。也不拦截键盘快捷键，如 `Ctrl+C` 或 `Esc`。

#### mcp

| 设置                | 类型             | 说明                                                                                                                                                                                                                         | 默认值      |
| ------------------- | ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- |
| `mcp.serverCommand` | string           | 启动 MCP 服务器的命令。                                                                                                                                                                                                      | `undefined` |
| `mcp.allowed`       | array of strings | MCP 服务器允许列表。指定可向模型提供的 MCP 服务器名称列表，用于限制连接的 MCP 服务器范围。注意：若设置了 `--allowed-mcp-server-names`，此项被忽略。                                                                         | `undefined` |
| `mcp.excluded`      | array of strings | MCP 服务器禁止列表。同时出现在 `mcp.excluded` 和 `mcp.allowed` 中的服务器将被排除。注意：若设置了 `--allowed-mcp-server-names`，此项被忽略。                                                                                 | `undefined` |

> [!note]
>
> **MCP 服务器安全说明：** 这些设置使用简单的字符串匹配来匹配 MCP 服务器名称，而名称是可修改的。若你是系统管理员，希望防止用户绕过此限制，可考虑在系统设置层级配置 `mcpServers`，使用户无法自行配置 MCP 服务器。请勿将此作为严密的安全机制。

#### lsp

> [!warning]
> **实验性功能**：LSP 支持目前为实验性功能，默认禁用。使用 `--experimental-lsp` 命令行参数启用。

Language Server Protocol（LSP）提供代码智能功能，如跳转到定义、查找引用和诊断。

LSP 服务器配置通过项目根目录中的 `.lsp.json` 文件完成，而非通过 `settings.json`。配置详情和示例请参见 [LSP 文档](../features/lsp)。

#### security

| 设置                           | 类型    | 说明                                 | 默认值      |
| ------------------------------ | ------- | ------------------------------------ | ----------- |
| `security.folderTrust.enabled` | boolean | 跟踪目录信任是否已启用的设置。       | `false`     |
| `security.auth.selectedType`   | string  | 当前选定的身份验证类型。             | `undefined` |
| `security.auth.enforcedType`   | string  | 必须使用的身份验证类型（适合企业）。 | `undefined` |
| `security.auth.useExternal`    | boolean | 是否使用外部身份验证流程。           | `undefined` |

#### advanced

| 设置                           | 类型             | 说明                                                                                                                                                                                                                                                              | 默认值                   |
| ------------------------------ | ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------ |
| `advanced.autoConfigureMemory` | boolean          | 自动配置 Node.js 内存限制。                                                                                                                                                                                                                                       | `false`                  |
| `advanced.dnsResolutionOrder`  | string           | DNS 解析顺序。                                                                                                                                                                                                                                                    | `undefined`              |
| `advanced.excludedEnvVars`     | array of strings | 从项目上下文中排除的环境变量。指定不应从项目 `.env` 文件加载的环境变量，防止项目特定环境变量（如 `DEBUG=true`）干扰 CLI 行为。`.qwen/.env` 文件中的变量永不排除。                                                                                                 | `["DEBUG","DEBUG_MODE"]` |
| `advanced.bugCommand`          | object           | bug 报告命令的配置。覆盖 `/bug` 命令的默认 URL。属性：`urlTemplate`（string）：可包含 `{title}` 和 `{info}` 占位符的 URL。示例：`"bugCommand": { "urlTemplate": "https://bug.example.com/new?title={title}&info={info}" }`                                        | `undefined`              |
| `plansDirectory`               | string           | 已批准 Plan Mode 文件的自定义目录。相对路径从项目根目录解析，解析后的路径必须在项目根目录内。未设置时，plan 文件存储在 `~/.qwen/plans`。**需要重启。** 若目录在项目根目录内，请将其添加到 `.gitignore` 以避免提交 plan 文件。                                       | `undefined`              |

#### experimental

> [!warning]
>
> **实验性功能。** 这些开关控制开发中的能力，未来版本中可能更改或移除。

| 设置                                | 类型    | 说明                                                                                                                                                                                                                         | 默认值  |
| ----------------------------------- | ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| `experimental.cron`                 | boolean | 启用会话内 cron/loop 工具（`cron_create`、`cron_list`、`cron_delete`），允许模型创建定期提示。可通过 `QWEN_CODE_DISABLE_CRON=1` 环境变量禁用。需要重启。                                                                     | `true`  |
| `experimental.agentTeam`            | boolean | 启用 agent 团队协作工具（`team_create`、`task_create`、`task_update`、`send_message` 等），用于多 agent 协调。也可通过 `QWEN_CODE_ENABLE_AGENT_TEAM=1` 启用。需要重启。                                                       | `false` |
| `experimental.artifact`             | boolean | 启用 Artifact 工具，允许模型发布独立 HTML 页面并在浏览器中打开。仅限交互式非 SDK 会话。可通过 `QWEN_CODE_ENABLE_ARTIFACT=1` / `QWEN_CODE_DISABLE_ARTIFACT=1` 切换。需要重启。                                               | `false` |
| `experimental.emitToolUseSummaries` | boolean | 每批工具调用完成后，生成基于 LLM 的简短标签。参见 [工具使用摘要](../features/tool-use-summaries)。需要配置快速模型（`fastModel`）；否则静默跳过。可通过 `QWEN_CODE_EMIT_TOOL_USE_SUMMARIES=0` 或 `=1` 按会话覆盖。          | `true`  |

#### mcpServers

配置与一个或多个 Model-Context Protocol（MCP）服务器的连接，用于发现和使用自定义工具。Qwen Code 会尝试连接每个已配置的 MCP 服务器以发现可用工具。若多个 MCP 服务器暴露同名工具，工具名称将加上配置中定义的服务器别名前缀（如 `serverAlias__actualToolName`）以避免冲突。注意系统可能会为兼容性去除 MCP 工具定义中的某些 schema 属性。`command`、`url` 和 `httpUrl` 中至少须提供一个。若同时指定多个，优先级顺序为 `httpUrl` > `url` > `command`。

| 属性                                    | 类型             | 说明                                                                                                                                                                                      | 可选 |
| --------------------------------------- | ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- |
| `mcpServers.<SERVER_NAME>.command`      | string           | 通过标准 I/O 启动 MCP 服务器执行的命令。                                                                                                                                                 | 是   |
| `mcpServers.<SERVER_NAME>.args`         | array of strings | 传递给命令的参数。                                                                                                                                                                        | 是   |
| `mcpServers.<SERVER_NAME>.env`          | object           | 为服务器进程设置的环境变量。                                                                                                                                                              | 是   |
| `mcpServers.<SERVER_NAME>.cwd`          | string           | 启动服务器的工作目录。                                                                                                                                                                    | 是   |
| `mcpServers.<SERVER_NAME>.url`          | string           | 使用 Server-Sent Events（SSE）通信的 MCP 服务器 URL。                                                                                                                                    | 是   |
| `mcpServers.<SERVER_NAME>.httpUrl`      | string           | 使用流式 HTTP 通信的 MCP 服务器 URL。                                                                                                                                                    | 是   |
| `mcpServers.<SERVER_NAME>.headers`      | object           | 发送到 `url` 或 `httpUrl` 的请求中包含的 HTTP 头映射。                                                                                                                                   | 是   |
| `mcpServers.<SERVER_NAME>.timeout`      | number           | 向该 MCP 服务器发起请求的超时时间（毫秒）。                                                                                                                                              | 是   |
| `mcpServers.<SERVER_NAME>.trust`        | boolean          | 信任该服务器并绕过所有工具调用确认。                                                                                                                                                     | 是   |
| `mcpServers.<SERVER_NAME>.description`  | string           | 服务器的简要描述，可用于显示目的。                                                                                                                                                       | 是   |
| `mcpServers.<SERVER_NAME>.includeTools` | array of strings | 要从该 MCP 服务器包含的工具名称列表。指定后，仅列出的工具可用（允许列表行为）。未指定时，服务器的所有工具默认启用。                                                                       | 是   |
| `mcpServers.<SERVER_NAME>.excludeTools` | array of strings | 要从该 MCP 服务器排除的工具名称列表。列出的工具对模型不可用，即使服务器暴露了这些工具。**注意：** `excludeTools` 优先于 `includeTools`——同时出现在两个列表中的工具将被排除。              | 是   |

#### telemetry

配置 Qwen Code 的日志和指标收集。详情参见 [遥测](../../developers/development/telemetry.md)。

| 设置                                       | 类型    | 说明                                                                                                                                                                                             | 默认值  |
| ------------------------------------------ | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------- |
| `telemetry.enabled`                        | boolean | 是否启用遥测。                                                                                                                                                                                   |         |
| `telemetry.target`                         | string  | 遥测目标的信息标签（`local` 或 `gcp`）。不控制导出路由；设置 `telemetry.otlpEndpoint` 或 `telemetry.outfile` 来配置数据发送位置。                                                               |         |
| `telemetry.otlpEndpoint`                   | string  | OTLP 导出器的端点。                                                                                                                                                                              |         |
| `telemetry.otlpProtocol`                   | string  | OTLP 导出器的协议（`grpc` 或 `http`）。                                                                                                                                                          |         |
| `telemetry.logPrompts`                     | boolean | 是否在日志中包含用户提示内容。                                                                                                                                                                   |         |
| `telemetry.includeSensitiveSpanAttributes` | boolean | 启用后，将用户提示、系统提示、工具输入/输出和模型响应的原文附加到原生 OTel span 属性（以及 log-to-span 桥接 span）。⚠️ 会将敏感数据（文件内容、Shell 命令、对话历史）流式传输到你的 OTLP 后端。  | `false` |
| `telemetry.outfile`                        | string  | 将遥测数据写入文件的路径。设置后覆盖 OTLP 导出。                                                                                                                                                |         |

### `settings.json` 示例

以下是 v0.3.0 新增的嵌套结构 `settings.json` 文件示例：

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
    "includeSensitiveSpanAttributes": false
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

CLI 会保存你运行过的 Shell 命令历史记录。为避免不同项目间的冲突，历史记录存储在用户主目录下的项目专属目录中。

- **位置：** `~/.qwen/tmp/<project_hash>/shell_history`
  - `<project_hash>` 是从项目根路径生成的唯一标识符。
  - 历史记录存储在名为 `shell_history` 的文件中。

## 环境变量与 `.env` 文件

环境变量是配置应用程序的常见方式，尤其适用于敏感信息（如 token）或在不同环境间变化的设置。

Qwen Code 可自动从 `.env` 文件加载环境变量。
身份验证相关变量（如 `OPENAI_*`）和推荐的 `.qwen/.env` 方式，请参见 **[身份验证](../configuration/auth)**。

> [!tip]
>
> **环境变量排除：** 某些环境变量（如 `DEBUG` 和 `DEBUG_MODE`）默认自动从项目 `.env` 文件中排除，以防止干扰 CLI 行为。`.qwen/.env` 文件中的变量永不排除。可通过 `settings.json` 中的 `advanced.excludedEnvVars` 设置自定义此行为。

### 环境变量表

| 变量                                               | 说明                                                                                                                                                                                                                 | 备注                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| -------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `QWEN_HOME`                                        | 自定义全局配置目录（默认：`~/.qwen`）。接受绝对或相对路径（相对路径从当前工作目录解析）。开头的 `~` 会展开为用户主目录。                                                                                             | 存储凭证、设置、记忆、skill 和其他全局状态。设置后，项目级 `.qwen/` 目录不受影响。空字符串视为未设置。                                                                                                                                                                                                                                                                                                                                                            |
| `QWEN_RUNTIME_DIR`                                 | 覆盖运行时输出目录（对话、日志、待办）。未设置时默认使用 `QWEN_HOME` 目录。                                                                                                                                          | 用于将临时运行时数据与持久化配置分离。当 `QWEN_HOME` 位于共享/慢速文件系统时很有用。                                                                                                                                                                                                                                                                                                                                                                             |
| `QWEN_TELEMETRY_ENABLED`                           | 设为 `true` 或 `1` 启用遥测。其他任意值视为禁用。                                                                                                                                                                   | 覆盖 `telemetry.enabled` 设置。                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `QWEN_TELEMETRY_TARGET`                            | 设置遥测目标的信息标签（`local` 或 `gcp`）。不控制路由；使用 `QWEN_TELEMETRY_OTLP_ENDPOINT` 或 `QWEN_TELEMETRY_OUTFILE` 配置数据发送位置。                                                                          | 覆盖 `telemetry.target` 设置。                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `QWEN_TELEMETRY_OTLP_ENDPOINT`                     | 设置遥测的 OTLP 端点。                                                                                                                                                                                               | 覆盖 `telemetry.otlpEndpoint` 设置。                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `QWEN_TELEMETRY_OTLP_PROTOCOL`                     | 设置 OTLP 协议（`grpc` 或 `http`）。                                                                                                                                                                                 | 覆盖 `telemetry.otlpProtocol` 设置。                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `QWEN_TELEMETRY_LOG_PROMPTS`                       | 设为 `true` 或 `1` 启用或禁用用户提示日志记录。其他任意值视为禁用。                                                                                                                                                 | 覆盖 `telemetry.logPrompts` 设置。                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `QWEN_TELEMETRY_INCLUDE_SENSITIVE_SPAN_ATTRIBUTES` | 设为 `true` 或 `1`，将用户提示、系统提示、工具 I/O 和模型响应的原文附加到原生 OTel span 属性（以及 log-to-span 桥接 span 上的 `prompt` / `function_args` / `response_text`）。其他任意值禁用。                       | 覆盖 `telemetry.includeSensitiveSpanAttributes` 设置。⚠️ 会将敏感数据流式传输到你的 OTLP 后端。                                                                                                                                                                                                                                                                                                                                                                   |
| `QWEN_TELEMETRY_OUTFILE`                           | 设置写入遥测数据的文件路径。设置后覆盖 OTLP 导出。                                                                                                                                                                  | 覆盖 `telemetry.outfile` 设置。                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `QWEN_SANDBOX`                                     | `settings.json` 中 `sandbox` 设置的替代方式。                                                                                                                                                                       | 接受 `true`、`false`、`docker`、`podman` 或自定义命令字符串。                                                                                                                                                                                                                                                                                                                                                                                                     |
| `QWEN_SANDBOX_IMAGE`                               | 覆盖 Docker/Podman 的沙箱镜像选择。                                                                                                                                                                                  | 优先于 `tools.sandboxImage`。                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `SEATBELT_PROFILE`                                 | （仅 macOS）切换 macOS 上的 Seatbelt（`sandbox-exec`）配置文件。                                                                                                                                                     | `permissive-open`：（默认）限制对项目文件夹（及少数其他文件夹，见 `packages/cli/src/utils/sandbox-macos-permissive-open.sb`）的写入，但允许其他操作。`strict`：使用默认拒绝操作的严格配置文件。`<profile_name>`：使用自定义配置文件。定义自定义配置文件时，在项目的 `.qwen/` 目录中创建名为 `sandbox-macos-<profile_name>.sb` 的文件（如 `my-project/.qwen/sandbox-macos-custom.sb`）。 |
| `DEBUG` 或 `DEBUG_MODE`                            | （通常由底层库或 CLI 本身使用）设为 `true` 或 `1` 启用详细调试日志，有助于排查问题。                                                                                                                                | **注意：** 这些变量默认自动从项目 `.env` 文件中排除，以防止干扰 CLI 行为。若需为 Qwen Code 专门设置这些变量，请使用 `.qwen/.env` 文件。                                                                                                                                                                                                                                                                                                                           |
| `NO_COLOR`                                         | 设为任意值禁用 CLI 中的所有颜色输出。                                                                                                                                                                               |                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `FORCE_HYPERLINK`                                  | 覆盖 Markdown 渲染器中的 OSC 8 可点击链接检测。设为 `1`（或任意非零整数，或空字符串）强制启用；设为 `0` 或非数字值（如 `false` / `off`）强制禁用。遵循其上层的 `NO_COLOR` / `QWEN_DISABLE_HYPERLINKS` 退出选项。    | 用于在 `tmux` / GNU `screen` 中启用 OSC 8（自动检测默认拒绝，因为宿主终端的能力被多路复用器隐藏）。在 tmux 3.3+ 上需要 `set -g allow-passthrough on`。也启用未自动检测到的 Hyper。                                                                                                                                                                                                                                                                               |
| `QWEN_DISABLE_HYPERLINKS`                          | 设为 `1`，即使在自动检测为支持的终端上也强制禁用 Markdown 渲染器中的 OSC 8 可点击超链接。                                                                                                                           | 当终端声称支持但在长 URL 上出现问题，或通过会破坏转义序列的中间件管道输出时很有用。渲染器回退为纯 `label (url)` 渲染。                                                                                                                                                                                                                                                                                                                                            |
| `CLI_TITLE`                                        | 设为字符串以自定义 CLI 标题。                                                                                                                                                                                        |                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `CODE_ASSIST_ENDPOINT`                             | 指定代码辅助服务器的端点。                                                                                                                                                                                           | 适用于开发和测试。                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `QWEN_CODE_MAX_OUTPUT_TOKENS`                      | 覆盖每次响应的默认最大输出 token 数。未设置时，Qwen Code 使用自适应策略：从 8K token 开始，响应被截断时自动以 64K 重试。设为具体值（如 `16000`）则使用固定上限。                                                      | 优先于默认上限（8K），但被设置中的 `samplingParams.max_tokens` 覆盖。设置后禁用自动升级。示例：`export QWEN_CODE_MAX_OUTPUT_TOKENS=16000`                                                                                                                                                                                                                                                                                                                          |
| `QWEN_CODE_UNATTENDED_RETRY`                       | 设为 `true` 或 `1` 启用持久重试模式。启用后，瞬时 API 容量错误（HTTP 429 限流和 529 过载）会以指数退避（每次重试上限 5 分钟）无限重试，并每 30 秒向 stderr 发送心跳 keepalive。                                       | 为 CI/CD 流水线和后台自动化设计，用于在临时 API 中断期间维持长时间运行任务。须显式设置——单独 `CI=true` **不**激活此模式。详情见 [无头模式](../features/headless#persistent-retry-mode)。示例：`export QWEN_CODE_UNATTENDED_RETRY=1`                                                                                                                                                                                                                               |
| `QWEN_CODE_PROFILE_STARTUP`                        | 设为 `1` 启用启动性能分析。将带有各阶段耗时的 JSON 时序报告写入 `~/.qwen/startup-perf/`。                                                                                                                            | 仅在沙箱子进程内生效（或配合 `QWEN_CODE_PROFILE_STARTUP_OUTER=1`）。未设置时零开销。示例：`export QWEN_CODE_PROFILE_STARTUP=1`                                                                                                                                                                                                                                                                                                                                    |
| `QWEN_CODE_PROFILE_STARTUP_OUTER`                  | 与 `QWEN_CODE_PROFILE_STARTUP=1` 同时设为 `1`，也会在外层（沙箱前）进程收集启动分析。外层进程报告文件名加 `outer-` 前缀，与沙箱子进程报告区分。                                                                      | 默认关闭——仅沙箱子进程收集，避免重复报告。适用于 CLI 未重启到沙箱中的本地开发。                                                                                                                                                                                                                                                                                                                                                                                  |
| `QWEN_CODE_PROFILE_STARTUP_NO_HEAP`                | 与 `QWEN_CODE_PROFILE_STARTUP=1` 同时设为 `1`，跳过每个检查点的 `process.memoryUsage()` 快照。适用于测量分析器本身的海森堡开销。                                                                                      | 默认关闭。堆快照每次约 50 µs（远低于总启动时间的 1%），大多数用户无需调整。                                                                                                                                                                                                                                                                                                                                                                                       |
| `QWEN_CODE_LEGACY_MCP_BLOCKING`                    | 设为 `1` 恢复渐进式 MCP 之前的行为，即 `Config.initialize()` 在返回前同步等待每个已配置 MCP 服务器的发现握手完成。                                                                                                    | 默认关闭。现代 qwen-code 允许 MCP 服务器在 UI 已交互时在后台上线；模型在服务器稳定后约 16 ms 内即可看到每批新工具。此参数作为至少一个发布周期内的回滚逃生通道保留。示例：`export QWEN_CODE_LEGACY_MCP_BLOCKING=1`                                                                                                                                                                                                                                                |

当用户级 `.env` 文件定义了相同变量时，Qwen 专属文件优先：`<QWEN_HOME>/.env`（未设置 `QWEN_HOME` 时为 `~/.qwen/.env`）在 `~/.env` 之前加载，且不会覆盖已存在的环境值。

## 命令行参数

直接运行 CLI 时传入的参数可覆盖该特定会话的其他配置。

沙箱镜像选择的优先级为：
`--sandbox-image` > `QWEN_SANDBOX_IMAGE` > `tools.sandboxImage` > 内置默认镜像。

### 命令行参数表

| 参数                         | 别名  | 说明                                                                                                                                                                              | 可选值                                         | 备注                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| ---------------------------- | ----- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--model`                    | `-m`  | 指定本次会话使用的 Qwen 模型。                                                                                                                                                    | 模型名称                                       | 示例：`npm start -- --model qwen3-coder-plus`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `--prompt`                   | `-p`  | 直接向命令传入提示词，以非交互模式调用 Qwen Code。                                                                                                                               | 提示词文本                                     | 如需脚本化输出，可使用 `--output-format json` 参数获取结构化输出。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `--prompt-interactive`       | `-i`  | 以提供的提示词作为初始输入启动交互式会话。                                                                                                                                       | 提示词文本                                     | 提示词在交互式会话内处理，而非在会话开始前处理。不能与 stdin 管道输入同时使用。示例：`qwen -i "explain this code"`                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `--system-prompt`            |       | 覆盖本次运行的内置主会话系统提示。                                                                                                                                               | 提示词文本                                     | 上下文文件（如 `QWEN.md`）在此覆盖后仍会追加。可与 `--append-system-prompt` 组合使用。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `--append-system-prompt`     |       | 向本次运行的主会话系统提示追加额外指令。                                                                                                                                         | 提示词文本                                     | 在内置提示和已加载上下文文件之后应用。可与 `--system-prompt` 组合使用。参见[无头模式](../features/headless)示例。                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `--output-format`            | `-o`  | 指定非交互模式下的 CLI 输出格式。                                                                                                                                                | `text`, `json`, `stream-json`                  | `text`：（默认）标准人类可读输出。`json`：执行结束时输出的机器可读 JSON。`stream-json`：执行过程中实时输出的流式 JSON 消息。结构化输出和脚本化场景请使用 `--output-format json` 或 `--output-format stream-json`。详情参见[无头模式](../features/headless)。                                                                                                                                                                                                                                                                                                                 |
| `--input-format`             |       | 指定从标准输入消费的格式。                                                                                                                                                       | `text`, `stream-json`                          | `text`：（默认）来自 stdin 或命令行参数的标准文本输入。`stream-json`：通过 stdin 进行双向通信的 JSON 消息协议。要求：`--input-format stream-json` 需同时设置 `--output-format stream-json`。使用 `stream-json` 时，stdin 保留给协议消息。详情参见[无头模式](../features/headless)。                                                                                                                                                                                                                                                                                          |
| `--include-partial-messages` |       | 使用 `stream-json` 输出格式时包含部分助手消息。启用后，流式传输过程中实时发出流式事件（message_start、content_block_delta 等）。                                                  |                                                | 默认：`false`。要求：需同时设置 `--output-format stream-json`。流式事件详情参见[无头模式](../features/headless)。                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `--sandbox`                  | `-s`  | 为本次会话启用沙箱模式。                                                                                                                                                         |                                                |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `--sandbox-image`            |       | 设置沙箱镜像 URI。                                                                                                                                                               |                                                |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `--debug`                    | `-d`  | 为本次会话启用调试模式，输出更详细的信息。                                                                                                                                       |                                                |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `--all-files`                | `-a`  | 若设置，将当前目录下的所有文件递归包含为提示词的上下文。                                                                                                                         |                                                |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `--help`                     | `-h`  | 显示命令行参数的帮助信息。                                                                                                                                                       |                                                |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `--show-memory-usage`        |       | 显示当前内存使用情况。                                                                                                                                                           |                                                |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `--yolo`                     |       | 启用 YOLO 模式，自动批准所有工具调用。                                                                                                                                           |                                                |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `--approval-mode`            |       | 设置工具调用的审批模式。                                                                                                                                                         | `plan`, `default`, `auto-edit`, `auto`, `yolo` | 支持的模式：`plan`：仅分析——不修改文件或执行命令。`default`：文件编辑或 Shell 命令需要审批（默认行为）。`auto-edit`：自动批准编辑工具（`edit`、`write_file`、`notebook_edit`），其他工具仍提示确认。`auto`：LLM 分类器自动批准安全操作，拦截风险操作。`yolo`：自动批准所有工具调用（等同于 `--yolo`）。不可与 `--yolo` 同时使用。推荐使用 `--approval-mode=yolo` 代替 `--yolo`。示例：`qwen --approval-mode auto-edit`<br>详情参见[审批模式](../features/approval-mode)。 |
| `--allowed-tools`            |       | 逗号分隔的工具名称列表，这些工具将绕过确认对话框。                                                                                                                              | 工具名称                                       | 示例：`qwen --allowed-tools "Shell(git status)"`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `--disabled-slash-commands`  |       | 要隐藏/禁用的斜杠命令名称（逗号分隔或重复使用）。与 `slashCommands.disabled` 设置和 `QWEN_DISABLED_SLASH_COMMANDS` 环境变量取并集。与最终命令名不区分大小写匹配。               | 命令名称                                       | 示例：`qwen --disabled-slash-commands "auth,mcp,extensions"`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `--telemetry`                |       | 启用[遥测](../../developers/development/telemetry.md)。                                                                                                                           |                                                |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `--telemetry-target`         |       | 设置遥测目标。                                                                                                                                                                   |                                                | 详情参见[遥测](../../developers/development/telemetry.md)。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `--telemetry-otlp-endpoint`  |       | 设置遥测的 OTLP 端点。                                                                                                                                                           |                                                | 详情参见[遥测](../../developers/development/telemetry.md)。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `--telemetry-otlp-protocol`  |       | 设置遥测的 OTLP 协议（`grpc` 或 `http`）。                                                                                                                                       |                                                | 默认为 `grpc`。详情参见[遥测](../../developers/development/telemetry.md)。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `--telemetry-log-prompts`    |       | 启用遥测的提示词日志记录。                                                                                                                                                       |                                                | 详情参见[遥测](../../developers/development/telemetry.md)。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `--acp`                      |       | 启用 ACP 模式（Agent Client Protocol）。适用于 IDE/编辑器集成，如 [Zed](../integration-zed)。                                                                                    |                                                | 稳定版。替代已弃用的 `--experimental-acp` 参数。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `--experimental-lsp`         |       | 启用实验性 [LSP（Language Server Protocol）](../features/lsp)功能，提供代码智能（跳转到定义、查找引用、诊断等）。                                                                |                                                | 实验性。需要安装语言服务器。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `--extensions`               | `-e`  | 指定本次会话使用的扩展列表。                                                                                                                                                     | 扩展名称                                       | 未提供时使用所有可用扩展。使用特殊词 `qwen -e none` 禁用所有扩展。示例：`qwen -e my-extension -e my-other-extension`                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `--list-extensions`          | `-l`  | 列出所有可用扩展并退出。                                                                                                                                                         |                                                |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `--proxy`                    |       | 设置 CLI 的代理。                                                                                                                                                                | 代理 URL                                       | 示例：`--proxy http://localhost:7890`。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `--include-directories`      |       | 在工作区中包含额外目录，支持多目录。                                                                                                                                             | 目录路径                                       | 可多次指定或以逗号分隔。最多添加 5 个目录。示例：`--include-directories /path/to/project1,/path/to/project2` 或 `--include-directories /path/to/project1 --include-directories /path/to/project2`                                                                                                                                                                                                                                                                                                                                                                           |
| `--screen-reader`            |       | 启用屏幕阅读器模式，调整 TUI 以更好地兼容屏幕阅读器。                                                                                                                           |                                                |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `--version`                  |       | 显示 CLI 版本。                                                                                                                                                                  |                                                |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `--openai-logging`           |       | 启用 OpenAI API 调用日志记录，用于调试和分析。                                                                                                                                   |                                                | 此参数覆盖 `settings.json` 中的 `enableOpenAILogging` 设置。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `--openai-logging-dir`       |       | 设置 OpenAI API 日志的自定义目录路径。                                                                                                                                           | 目录路径                                       | 此参数覆盖 `settings.json` 中的 `openAILoggingDir` 设置。支持绝对路径、相对路径和 `~` 展开。示例：`qwen --openai-logging-dir "~/qwen-logs" --openai-logging`                                                                                                                                                                                                                                                                                                                                                                                                               |

## 上下文文件（分层指令上下文）

虽然上下文文件严格来说不是 CLI _行为_ 的配置，但它们（默认为 `QWEN.md`，可通过 `context.fileName` 设置修改）对于配置 _指令上下文_（也称"记忆"）至关重要。这一强大功能让你可以为 AI 提供项目特定的指令、编码风格指南或任何相关背景信息，使其响应更贴合你的需求。CLI 包含 UI 元素，如页脚中显示已加载上下文文件数量的指示器，让你随时了解当前上下文状态。

- **用途：** 这些 Markdown 文件包含你希望 Qwen 模型在交互过程中了解的指令、指南或上下文。该系统设计为分层管理此类指令上下文。

### 上下文文件内容示例（如 `QWEN.md`）

以下是 TypeScript 项目根目录下上下文文件的概念性示例：

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

此示例展示了如何提供通用项目上下文、特定编码规范，以及关于特定文件或组件的说明。上下文文件越相关、越精确，AI 就能更好地协助你。强烈建议为项目创建专属上下文文件，以建立约定和背景。

- **分层加载与优先级：** CLI 通过从多个位置加载上下文文件（如 `QWEN.md`）实现分层记忆系统。列表中靠后（更具体）的文件内容通常会覆盖或补充靠前（更通用）的内容。确切的连接顺序和最终上下文可从 `/memory` 对话框查看。典型加载顺序为：
  1. **全局上下文文件：**
     - 位置：`~/.qwen/<配置的上下文文件名>`（如用户主目录下的 `~/.qwen/QWEN.md`）。
     - 范围：为你的所有项目提供默认指令。
  2. **项目根目录及父目录上下文文件：**
     - 位置：CLI 在当前工作目录及其每个父目录中搜索已配置的上下文文件，直到项目根目录（由 `.git` 文件夹标识）或你的主目录。
     - 范围：提供与整个项目或其重要部分相关的上下文。
- **连接与 UI 指示：** 所有找到的上下文文件内容会连接（加上表明来源和路径的分隔符）并作为系统提示的一部分提供。CLI 页脚显示已加载上下文文件的数量，给你提供关于活跃指令上下文的快速视觉提示。
- **导入内容：** 你可以使用 `@path/to/file.md` 语法导入其他 Markdown 文件，使上下文文件模块化。详情参见 [Memory 文档](../features/memory.md)。
- **记忆管理命令：**
  - 使用 `/memory` 打开记忆管理对话框。
  - 从对话框中刷新记忆，以重新扫描并从所有已配置位置重新加载上下文文件。
  - `/memory` 命令的完整说明参见 [命令文档](../features/commands.md)。

通过理解并利用这些配置层级和上下文文件的分层特性，你可以有效管理 AI 的记忆，并将 Qwen Code 的响应定制化以满足你的特定需求和项目要求。

## 沙箱

Qwen Code 可在沙箱环境中执行潜在不安全的操作（如 Shell 命令和文件修改），以保护你的系统。

[沙箱](../features/sandbox) 默认禁用，可通过以下方式启用：

- 使用 `--sandbox` 或 `-s` 参数。
- 设置 `QWEN_SANDBOX` 环境变量。
- 在设置中配置 `tools.sandbox`。

> ⚠️ **`--yolo` 不会自动启用沙箱。** YOLO 模式仅自动批准工具调用；沙箱仍须通过 `--sandbox`、`QWEN_SANDBOX` 或 `tools.sandbox` 显式启用。在使用 `--yolo`（或 `--approval-mode=yolo`）且无沙箱的无头/非交互式运行中，模型可以当前进程的权限级别执行 Shell、写入和编辑工具——Qwen Code 在此情况下会向 stderr 打印警告。确认权衡后可通过 `QWEN_CODE_SUPPRESS_YOLO_WARNING=1` 抑制警告。

默认使用预构建的 `qwen-code-sandbox` Docker 镜像。

对于项目特定的沙箱需求，可在项目根目录的 `.qwen/sandbox.Dockerfile` 创建自定义 Dockerfile，该 Dockerfile 可基于基础沙箱镜像：

```
FROM qwen-code-sandbox
# Add your custom dependencies or configurations here
# For example:
# RUN apt-get update && apt-get install -y some-package
# COPY ./my-config /app/my-config
```

当 `.qwen/sandbox.Dockerfile` 存在时，可在运行 Qwen Code 时使用 `BUILD_SANDBOX` 环境变量自动构建自定义沙箱镜像：

```
BUILD_SANDBOX=1 qwen -s
```

## 使用统计

为帮助我们改进 Qwen Code，我们收集匿名使用统计数据。这些数据帮助我们了解 CLI 的使用方式、发现常见问题并确定新功能的优先级。

**我们收集的内容：**

- **工具调用：** 我们记录被调用工具的名称、是否成功以及执行时长。我们不收集传递给工具的参数或工具返回的任何数据。
- **API 请求：** 我们记录每次请求使用的模型、请求时长以及是否成功。我们不收集提示词或响应的内容。
- **会话信息：** 我们收集关于 CLI 配置的信息，如已启用的工具和审批模式。

**我们不收集的内容：**

- **个人身份信息（PII）：** 我们不收集任何个人信息，如姓名、邮箱地址或 API key。
- **提示词和响应内容：** 我们不记录你的提示词内容或模型的响应内容。
- **文件内容：** 我们不记录 CLI 读取或写入的任何文件内容。

**如何退出：**

你可随时通过在 `settings.json` 的 `privacy` 类别下将 `usageStatisticsEnabled` 属性设为 `false` 来退出使用统计收集：

```
{
  "privacy": {
    "usageStatisticsEnabled": false
  }
}
```

> [!note]
>
> 启用使用统计后，事件将发送至阿里云 RUM 采集端点。
