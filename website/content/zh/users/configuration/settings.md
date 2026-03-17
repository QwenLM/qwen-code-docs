# Qwen Code 配置

> [!tip]
>
> **认证 / API 密钥**：认证方式（Qwen OAuth、阿里云编码计划或 API Key）及相关环境变量（例如 `OPENAI_API_KEY`）的说明详见 **[认证](../configuration/auth)**。

> [!note]
>
> **关于新配置格式的说明**：`settings.json` 文件的格式已更新为一种更清晰、更有条理的新结构。旧格式将自动迁移。
> Qwen Code 提供了多种配置其行为的方式，包括环境变量、命令行参数和设置文件。本文档概述了各种配置方法及可用的设置项。

## 配置层级

配置按以下优先级顺序应用（数字越小，其值越容易被数字更大的层级覆盖）：

| 层级 | 配置来源             | 描述                                                                           |
| ---- | -------------------- | ------------------------------------------------------------------------------ |
| 1    | 默认值               | 应用程序内硬编码的默认值                                                       |
| 2    | 系统默认配置文件     | 全局默认设置，可被其他配置文件覆盖                                             |
| 3    | 用户配置文件         | 当前用户的全局设置                                                             |
| 4    | 项目配置文件         | 特定于当前项目的设置                                                           |
| 5    | 系统配置文件         | 全局设置，会覆盖所有其他配置文件                                               |
| 6    | 环境变量             | 全局或会话级变量，可能从 `.env` 文件中加载                                     |
| 7    | 命令行参数           | 启动 CLI 时传入的参数值                                                        |

## 设置文件

Qwen Code 使用 JSON 格式的设置文件进行持久化配置。这些文件共有四个存放位置：

| 文件类型             | 位置                                                                                                                                                                                                                                                                        | 作用范围                                                                                                                                                                                                                     |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 系统默认文件  | Linux：`/etc/qwen-code/system-defaults.json`<br>Windows：`C:\ProgramData\qwen-code\system-defaults.json`<br>macOS：`/Library/Application Support/QwenCode/system-defaults.json`<br>路径可通过环境变量 `QWEN_CODE_SYSTEM_DEFAULTS_PATH` 覆盖。 | 提供系统级默认设置的基础层。这些设置优先级最低，旨在被用户、项目或系统覆盖设置所替代。                                         |
| 用户设置文件    | `~/.qwen/settings.json`（其中 `~` 表示你的主目录）。                                                                                                                                                                                                                     | 对当前用户的所有 Qwen Code 会话生效。                                                                                                                                                                   |
| 项目设置文件 | 位于项目根目录下的 `.qwen/settings.json`。                                                                                                                                                                                                                     | 仅当从该特定项目中运行 Qwen Code 时生效。项目设置会覆盖用户设置。                                                                                                                  |
| 系统设置文件  | Linux：`/etc/qwen-code/settings.json` <br>Windows：`C:\ProgramData\qwen-code\settings.json` <br>macOS：`/Library/Application Support/QwenCode/settings.json`<br>路径可通过环境变量 `QWEN_CODE_SYSTEM_SETTINGS_PATH` 覆盖。                    | 对系统上所有用户的全部 Qwen Code 会话生效。系统设置会覆盖用户设置和项目设置。企业系统管理员可利用此机制统一管控用户的 Qwen Code 配置。 |

> [!note]
>
> **关于设置文件中的环境变量：** `settings.json` 文件内的字符串值可使用 `$VAR_NAME` 或 `${VAR_NAME}` 语法引用环境变量。这些变量将在加载设置时自动解析。例如，若存在环境变量 `MY_API_TOKEN`，你可在 `settings.json` 中这样使用：`"apiKey": "$MY_API_TOKEN"`。

### 项目中的 `.qwen` 目录

除了项目设置文件外，项目的 `.qwen` 目录还可包含其他与 Qwen Code 运行相关的项目专属文件，例如：

- [自定义沙箱配置文件](../features/sandbox)（如 `.qwen/sandbox-macos-custom.sb`、`.qwen/sandbox.Dockerfile`）。
- 位于 `.qwen/skills/` 下的[智能体技能（Agent Skills）](../features/skills)（每个 Skill 均为一个目录，内含 `SKILL.md` 文件）。

### 配置迁移

Qwen Code 会自动将旧版配置设置迁移到新格式。迁移前，旧的配置文件会被备份。以下设置已从否定式命名（`disable*`）更改为肯定式命名（`enable*`）：

| 旧设置                                     | 新设置                                           | 说明                     |
| ------------------------------------------ | ------------------------------------------------ | ------------------------ |
| `disableAutoUpdate` + `disableUpdateNag`   | `general.enableAutoUpdate`                       | 合并为单个设置           |
| `disableLoadingPhrases`                    | `ui.accessibility.enableLoadingPhrases`         |                          |
| `disableFuzzySearch`                       | `context.fileFiltering.enableFuzzySearch`       |                          |
| `disableCacheControl`                      | `model.generationConfig.enableCacheControl`     |                          |

> [!note]
>
> **布尔值取反：** 迁移过程中，布尔值会被取反（例如，`disableAutoUpdate: true` 将变为 `enableAutoUpdate: false`）。

#### `disableAutoUpdate` 和 `disableUpdateNag` 的合并策略

当两个旧版设置同时存在且值不同时，迁移遵循以下策略：**只要** `disableAutoUpdate` **或** `disableUpdateNag` 中**任意一个为 `true`**，则 `enableAutoUpdate` 即设为 `false`：

| `disableAutoUpdate` | `disableUpdateNag` | 迁移后的 `enableAutoUpdate` |
| ------------------- | ------------------ | --------------------------- |
| `false`             | `false`            | `true`                      |
| `false`             | `true`             | `false`                     |
| `true`              | `false`            | `false`                     |
| `true`              | `true`             | `false`                     |

### `settings.json` 中可用的设置

设置按类别组织。所有设置均需放入 `settings.json` 文件中其对应的一级类别对象内。

#### 常规

| 设置                                 | 类型    | 描述                                                                                                                                                                     | 默认值      |
| ------------------------------------ | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------- |
| `general.preferredEditor`            | 字符串  | 用于打开文件的首选编辑器。                                                                                                                                               | `undefined` |
| `general.vimMode`                    | 布尔值  | 启用 Vim 键绑定。                                                                                                                                                        | `false`     |
| `general.enableAutoUpdate`           | 布尔值  | 启动时自动检查并安装更新。                                                                                                                                               | `true`      |
| `general.gitCoAuthor`                | 布尔值  | 当通过 Qwen Code 提交代码时，自动在 Git 提交信息中添加 `Co-authored-by` 追加行。                                                                                          | `true`      |
| `general.checkpointing.enabled`      | 布尔值  | 启用会话检查点功能以支持恢复。                                                                                                                                           | `false`     |
| `general.defaultFileEncoding`        | 字符串  | 新建文件的默认编码。使用 `"utf-8"`（默认）表示无 BOM 的 UTF-8 编码，或使用 `"utf-8-bom"` 表示带 BOM 的 UTF-8 编码。仅当项目明确需要 BOM 时才修改此项。                     | `"utf-8"`   |

#### 输出

| 设置               | 类型   | 描述                     | 默认值   | 可选值         |
| ------------------ | ------ | ------------------------ | -------- | -------------- |
| `output.format`    | 字符串 | CLI 输出的格式。           | `"text"` | `"text"`, `"json"` |

#### UI

| 设置                                     | 类型     | 描述                                                                                                                                                                                                                                                                                                                                                                                                         | 默认值      |
| ---------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------- |
| `ui.theme`                               | 字符串   | UI 的颜色主题。可用选项请参阅 [主题](../configuration/themes)。                                                                                                                                                                                                                                                                                                                                              | `undefined` |
| `ui.customThemes`                        | 对象     | 自定义主题定义。                                                                                                                                                                                                                                                                                                                                                                                             | `{}`        |
| `ui.hideWindowTitle`                     | 布尔值   | 隐藏窗口标题栏。                                                                                                                                                                                                                                                                                                                                                                                             | `false`     |
| `ui.hideTips`                            | 布尔值   | 隐藏 UI 中的提示信息。                                                                                                                                                                                                                                                                                                                                                                                       | `false`     |
| `ui.hideBanner`                          | 布尔值   | 隐藏应用横幅。                                                                                                                                                                                                                                                                                                                                                                                               | `false`     |
| `ui.hideFooter`                          | 布尔值   | 隐藏 UI 底部页脚。                                                                                                                                                                                                                                                                                                                                                                                           | `false`     |
| `ui.showMemoryUsage`                     | 布尔值   | 在 UI 中显示内存使用情况信息。                                                                                                                                                                                                                                                                                                                                                                               | `false`     |
| `ui.showLineNumbers`                     | 布尔值   | 在 CLI 输出的代码块中显示行号。                                                                                                                                                                                                                                                                                                                                                                              | `true`      |
| `ui.showCitations`                       | 布尔值   | 在聊天中为生成的文本显示引用来源。                                                                                                                                                                                                                                                                                                                                                                           | `true`      |
| `enableWelcomeBack`                      | 布尔值   | 当返回一个带有对话历史的项目时，显示“欢迎回来”对话框。启用后，Qwen Code 将自动检测你是否正在返回一个已生成过项目摘要（`.qwen/PROJECT_SUMMARY.md`）的项目，并弹出对话框，允许你继续之前的对话或重新开始。该功能与 `/summary` 命令及退出确认对话框集成。                                                                                                                                              | `true`      |
| `ui.accessibility.enableLoadingPhrases` | 布尔值   | 启用加载状态提示语（如需无障碍支持，请禁用）。                                                                                                                                                                                                                                                                                                                                                                | `true`      |
| `ui.accessibility.screenReader`          | 布尔值   | 启用屏幕阅读器模式，调整 TUI 以提升与屏幕阅读器的兼容性。                                                                                                                                                                                                                                                                                                                                                    | `false`     |
| `ui.customWittyPhrases`                  | 字符串数组 | 加载状态下显示的自定义提示语列表。若提供此设置，CLI 将循环显示这些短语，而非默认短语。                                                                                                                                                                                                                                                                                                                      | `[]`        |

#### IDE

| 设置                     | 类型    | 描述                                     | 默认值  |
| ------------------------ | ------- | ---------------------------------------- | ------- |
| `ide.enabled`            | boolean | 启用 IDE 集成模式。                      | `false` |
| `ide.hasSeenNudge`       | boolean | 用户是否已看到 IDE 集成提示。            | `false` |

#### 隐私

| 设置                                 | 类型    | 描述                             | 默认值  |
| ------------------------------------ | ------- | -------------------------------- | ------- |
| `privacy.usageStatisticsEnabled`     | boolean | 启用使用情况统计信息的收集。     | `true`  |

#### 模型

| 设置                                             | 类型    | 描述                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | 默认值      |
| ------------------------------------------------ | ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- |
| `model.name`                                     | 字符串  | 用于对话的 Qwen 模型。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | `undefined` |
| `model.maxSessionTurns`                          | 数字    | 单次会话中保留的用户/模型/工具交互轮数上限。`-1` 表示无限制。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | `-1`        |
| `model.generationConfig`                         | 对象    | 传递给底层内容生成器的高级覆盖配置。支持请求控制参数，例如 `timeout`（超时）、`maxRetries`（最大重试次数）、`enableCacheControl`（启用缓存控制）、`contextWindowSize`（覆盖模型默认上下文窗口大小）、`modalities`（覆盖自动检测的输入模态）、`customHeaders`（为 API 请求添加自定义 HTTP 头）、`extra_body`（仅适用于 OpenAI 兼容 API 的额外请求体参数），以及 `samplingParams` 下的细粒度调优参数（例如 `temperature`、`top_p`、`max_tokens`）。留空则使用服务提供商的默认值。 | `undefined` |
| `model.chatCompression.contextPercentageThreshold` | 数字    | 设置聊天历史压缩触发阈值，以模型总 token 限制的百分比表示。该值为 0 到 1 之间的浮点数，同时适用于自动压缩和手动 `/compress` 命令。例如，设为 `0.6` 表示当聊天历史占用超过 token 限制的 60% 时触发压缩。设为 `0` 可完全禁用压缩。                                                                                                                                                                                                                                                                                                                               | `0.7`       |
| `model.skipNextSpeakerCheck`                     | 布尔值  | 跳过下一轮发言者检查。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | `false`     |
| `model.skipLoopDetection`                        | 布尔值  | 禁用循环检测。循环检测可防止 AI 响应陷入无限循环，但可能产生误报并中断合法工作流。若频繁遭遇误报导致流程中断，可启用此选项。                                                                                                                                                                                                                                                                                                                                                                                                                                              | `false`     |
| `model.skipStartupContext`                       | 布尔值  | 跳过在每次会话开始时发送启动工作区上下文（环境摘要及确认信息）。若倾向于手动提供上下文，或希望节省启动阶段的 token 开销，可启用此选项。                                                                                                                                                                                                                                                                                                                                                                                                                     | `false`     |
| `model.enableOpenAILogging`                      | 布尔值  | 启用 OpenAI API 调用日志记录，用于调试与分析。启用后，API 请求与响应将被写入 JSON 文件。                                                                                                                                                                                                                                                                                                                                                                                                                                   | `false`     |
| `model.openAILoggingDir`                         | 字符串  | 自定义 OpenAI API 日志目录路径。若未指定，则默认为当前工作目录下的 `logs/openai`。支持绝对路径、相对路径（相对于当前工作目录解析）以及 `~` 展开（指向用户主目录）。                                                                                                                                                                                                                                                                                                                      | `undefined` |

**`model.generationConfig` 示例：**

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

**`contextWindowSize`：**  
覆盖所选模型的默认上下文窗口大小。Qwen Code 依据模型名称匹配内置默认值，并设有固定后备值来确定上下文窗口。当服务提供商的实际上下文限制与 Qwen Code 默认值不一致时，请使用此设置。该值定义的是模型**假设的最大上下文容量**，而非单次请求的 token 限制。

**`modalities`：**  
覆盖所选模型自动检测的输入模态。Qwen Code 会基于模型名称模式匹配，自动识别支持的模态（图像、PDF、音频、视频）。当自动检测结果不正确时，请使用此设置 —— 例如，为一个实际支持 PDF 但未被识别的模型显式启用 `pdf`。格式为：`{ "image": true, "pdf": true, "audio": true, "video": true }`。对不支持的模态，可省略对应键名或将其设为 `false`。

**`customHeaders`：**  
允许为所有 API 请求添加自定义 HTTP 头。这在请求追踪、监控、API 网关路由，或不同模型需不同请求头时非常有用。若在 `modelProviders[].generationConfig.customHeaders` 中定义了 `customHeaders`，则直接使用该值；否则使用 `model.generationConfig.customHeaders` 中的值。**两个层级之间不会合并**。

`extra_body` 字段允许向 API 请求体中添加自定义参数，适用于标准配置字段未涵盖的供应商特定选项。**注意：该字段仅支持 OpenAI 兼容的供应商（`openai`、`qwen-oauth`），对 Anthropic 和 Gemini 供应商将被忽略。** 若在 `modelProviders[].generationConfig.extra_body` 中定义了 `extra_body`，则直接使用该值；否则使用 `model.generationConfig.extra_body` 中的值。

**`model.openAILoggingDir` 示例：**

- `"~/qwen-logs"` —— 日志写入 `~/qwen-logs` 目录  
- `"./custom-logs"` —— 日志写入当前目录下的 `./custom-logs` 目录  
- `"/tmp/openai-logs"` —— 日志写入绝对路径 `/tmp/openai-logs`

#### 上下文

| 设置                                             | 类型                       | 说明                                                                                                                                                                                                                                                                                                                                                           | 默认值      |
| ------------------------------------------------ | -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- |
| `context.fileName`                               | 字符串或字符串数组         | 上下文文件的名称。                                                                                                                                                                                                                                                                                                                                              | `undefined` |
| `context.importFormat`                           | 字符串                     | 导入记忆时使用的格式。                                                                                                                                                                                                                                                                                                                                           | `undefined` |
| `context.includeDirectories`                     | 数组                       | 需要额外包含在工作区上下文中的目录。指定一个额外的绝对路径或相对路径数组，以纳入工作区上下文。缺失的目录默认会跳过并发出警告。路径中可使用 `~` 表示用户主目录。此设置可与 `--include-directories` 命令行标志结合使用。                                                                                                                                               | `[]`        |
| `context.loadFromIncludeDirectories`             | 布尔值                     | 控制 `/memory refresh` 命令的行为。若设为 `true`，则应从所有已添加的目录中加载 `QWEN.md` 文件；若设为 `false`，则仅从当前目录加载 `QWEN.md` 文件。                                                                                                                                                                                                                   | `false`     |
| `context.fileFiltering.respectGitIgnore`         | 布尔值                     | 在搜索时尊重 `.gitignore` 文件。                                                                                                                                                                                                                                                                                                                                 | `true`      |
| `context.fileFiltering.respectQwenIgnore`        | 布尔值                     | 在搜索时尊重 `.qwenignore` 文件。                                                                                                                                                                                                                                                                                                                                | `true`      |
| `context.fileFiltering.enableRecursiveFileSearch` | 布尔值                     | 是否在提示中补全 `@` 前缀时，启用在当前目录树下递归搜索文件名。                                                                                                                                                                                                                                                                                                  | `true`      |
| `context.fileFiltering.enableFuzzySearch`        | 布尔值                     | 当设为 `true` 时，在搜索文件时启用模糊搜索功能；设为 `false` 可提升文件数量庞大的项目中的搜索性能。                                                                                                                                                                                                                                                              | `true`      |

#### 文件搜索性能问题排查

如果在进行文件搜索（例如使用 `@` 补全）时遇到性能问题，尤其是在包含大量文件的项目中，可按以下推荐顺序尝试以下方法：

1. **使用 `.qwenignore` 文件：** 在项目根目录下创建 `.qwenignore` 文件，排除那些包含大量无需引用的文件的目录（例如构建产物、日志、`node_modules`）。减少被扫描的文件总数是提升性能最有效的方式。
2. **禁用模糊搜索：** 如果仅忽略文件仍不足以改善性能，可在 `settings.json` 文件中将 `enableFuzzySearch` 设为 `false` 来禁用模糊搜索。这将改用更简单、非模糊的匹配算法，从而加快搜索速度。
3. **禁用递归文件搜索：** 作为最后手段，可将 `enableRecursiveFileSearch` 设为 `false`，完全禁用递归文件搜索。这是最快的选择，因为它避免了对整个项目的递归遍历；但代价是使用 `@` 补全时需手动输入文件的完整路径。

#### 工具

| 设置                                      | 类型              | 描述                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | 默认值      | 说明                                                                                                                                                                                                                                                                                                                                 |
| ----------------------------------------- | ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `tools.sandbox`                           | 布尔值或字符串      | 沙箱执行环境（可以是布尔值，也可以是路径字符串）。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | `undefined` |                                                                                                                                                                                                                                                                                                                                    |
| `tools.shell.enableInteractiveShell`      | 布尔值             | 使用 `node-pty` 提供交互式 Shell 体验；若不可用，则自动回退至 `child_process`。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | `false`     |                                                                                                                                                                                                                                                                                                                                    |
| `tools.core`                              | 字符串数组          | 可用于通过白名单限制内置工具集。对于支持命令级限制的工具（例如 `run_shell_command`），还可指定具体命令限制。例如 `"tools.core": ["run_shell_command(ls -l)"]` 将仅允许执行 `ls -l` 命令。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | `undefined` |                                                                                                                                                                                                                                                                                                                                    |
| `tools.exclude`                           | 字符串数组          | 要从工具发现中排除的工具名称。对于支持命令级限制的工具（例如 `run_shell_command`），也可指定具体命令限制。例如 `"tools.exclude": ["run_shell_command(rm -rf)"]` 将阻止执行 `rm -rf` 命令。**安全提示：** `tools.exclude` 中针对 `run_shell_command` 的命令级限制基于简单字符串匹配，极易被绕过。该功能**并非安全机制**，不应依赖其来安全地执行不受信任的代码。建议使用 `tools.core` 显式声明允许执行的命令。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | `undefined` |                                                                                                                                                                                                                                                                                                                                    |
| `tools.allowed`                           | 字符串数组          | 将跳过确认对话框的工具名称列表。适用于您信任且频繁使用的工具。例如 `["run_shell_command(git)", "run_shell_command(npm test)"]` 将跳过所有 `git` 和 `npm test` 命令执行前的确认对话框。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | `undefined` |                                                                                                                                                                                                                                                                                                                                    |
| `tools.approvalMode`                      | 字符串             | 设置工具调用的默认审批模式。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | `default`   | 可选值：`plan`（仅分析，不修改文件或执行命令）、`default`（对文件编辑或 Shell 命令执行前均需人工确认）、`auto-edit`（自动批准文件编辑）、`yolo`（自动批准所有工具调用）                                                                                                                                                                                                                     |
| `tools.discoveryCommand`                  | 字符串             | 用于工具发现的命令。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | `undefined` |                                                                                                                                                                                                                                                                                                                                    |
| `tools.callCommand`                       | 字符串             | 定义一个自定义 Shell 命令，用于调用通过 `tools.discoveryCommand` 发现的特定工具。该 Shell 命令必须满足以下条件：第一个命令行参数必须为函数名（与 [函数声明](https://ai.google.dev/gemini-api/docs/function-calling#function-declarations) 中完全一致）；必须从 `stdin` 读取 JSON 格式的函数参数（类似于 [`functionCall.args`](https://cloud.google.com/vertex-ai/generative-ai/docs/model-reference/inference#functioncall)）；必须将函数输出以 JSON 格式写入 `stdout`（类似于 [`functionResponse.response.content`](https://cloud.google.com/vertex-ai/generative-ai/docs/model-reference/inference#functionresponse)）。 | `undefined` |                                                                                                                                                                                                                                                                                                                                    |
| `tools.useRipgrep`                        | 布尔值             | 使用 ripgrep 进行文件内容搜索，而非备用实现。可提供更快的搜索性能。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | `true`      |                                                                                                                                                                                                                                                                                                                                    |
| `tools.useBuiltinRipgrep`                 | 布尔值             | 使用内置的 ripgrep 二进制文件。设为 `false` 时，将改用系统级 `rg` 命令。此设置仅在 `tools.useRipgrep` 为 `true` 时生效。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | `true`      |                                                                                                                                                                                                                                                                                                                                    |
| `tools.truncateToolOutputThreshold`       | 数值               | 若工具输出超过此字符数，则进行截断。适用于 Shell、Grep、Glob、ReadFile 和 ReadManyFiles 工具。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | `25000`     | 需重启：是                                                                                                                                                                                                                                                                                                                                                                                   |
| `tools.truncateToolOutputLines`           | 数值               | 截断工具输出时保留的最大行数或条目数。适用于 Shell、Grep、Glob、ReadFile 和 ReadManyFiles 工具。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | `1000`      | 需重启：是                                                                                                                                                                                                                                                                                                                                                                                   |

#### MCP

| 设置                     | 类型             | 说明                                                                                                                                                                                                                                                               | 默认值      |
| ------------------------ | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------- |
| `mcp.serverCommand`      | 字符串           | 启动 MCP 服务器的命令。                                                                                                                                                                                                                                              | `undefined` |
| `mcp.allowed`            | 字符串数组       | 允许连接的 MCP 服务器白名单。可用于指定一组应向模型开放的 MCP 服务器名称，从而限制可连接的 MCP 服务器集合。注意：若设置了 `--allowed-mcp-server-names` 命令行参数，此设置将被忽略。                                                                                   | `undefined` |
| `mcp.excluded`           | 字符串数组       | 禁止连接的 MCP 服务器黑名单。若某服务器同时出现在 `mcp.excluded` 和 `mcp.allowed` 中，则该服务器将被排除。注意：若设置了 `--allowed-mcp-server-names` 命令行参数，此设置将被忽略。                                                                                      | `undefined` |

> [!note]
>
> **MCP 服务器安全提示：** 这些设置仅基于 MCP 服务器名称进行简单字符串匹配，而服务器名称本身可被修改。若您是系统管理员，希望防止用户绕过此限制，请考虑在系统级设置中配置 `mcpServers`，使用户无法自行配置任何 MCP 服务器。此机制不应被视为严密的安全防护手段。

#### LSP

> [!warning]
> **实验性功能**：LSP 支持目前为实验性功能，默认处于禁用状态。请使用 `--experimental-lsp` 命令行参数启用该功能。

语言服务器协议（LSP）提供代码智能功能，例如跳转到定义、查找引用以及诊断信息。

LSP 服务器的配置通过项目根目录下的 `.lsp.json` 文件完成，而非通过 `settings.json` 文件。有关配置详情和示例，请参阅 [LSP 文档](../features/lsp)。

#### 安全性

| 设置                                 | 类型    | 描述                                             | 默认值      |
| ------------------------------------ | ------- | ------------------------------------------------ | ----------- |
| `security.folderTrust.enabled`       | boolean | 用于跟踪文件夹信任是否已启用的设置。             | `false`     |
| `security.auth.selectedType`         | string  | 当前选定的身份验证类型。                         | `undefined` |
| `security.auth.enforcedType`         | string  | 所需的身份验证类型（对企业用户很有用）。         | `undefined` |
| `security.auth.useExternal`          | boolean | 是否使用外部身份验证流程。                       | `undefined` |

#### 高级配置

| 设置                             | 类型             | 描述                                                                                                                                                                                                                                                                                                                                 | 默认值                   |
| -------------------------------- | ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------ |
| `advanced.autoConfigureMemory`   | boolean          | 自动配置 Node.js 内存限制。                                                                                                                                                                                                                                                                                                         | `false`                  |
| `advanced.dnsResolutionOrder`    | string           | DNS 解析顺序。                                                                                                                                                                                                                                                                                                                     | `undefined`              |
| `advanced.excludedEnvVars`       | 字符串数组       | 从项目上下文中排除的环境变量。指定应从项目 `.env` 文件中排除加载的环境变量，防止项目特定的环境变量（例如 `DEBUG=true`）干扰 CLI 行为。来自 `.qwen/.env` 文件的环境变量永远不会被排除。                                                                                                                               | `["DEBUG","DEBUG_MODE"]` |
| `advanced.bugCommand`            | 对象             | 错误报告命令的配置。覆盖 `/bug` 命令的默认 URL。属性：`urlTemplate`（字符串）：一个可包含 `{title}` 和 `{info}` 占位符的 URL。示例：`"bugCommand": { "urlTemplate": "https://bug.example.com/new?title={title}&info={info}" }`                                                                                      | `undefined`              |
| `advanced.tavilyApiKey`          | string           | Tavily 网络搜索服务的 API 密钥。用于启用 `web_search` 工具功能。                                                                                                                                                                                                                                                                  | `undefined`              |

> [!note]
>
> **关于 `advanced.tavilyApiKey` 的说明：** 这是一种旧版配置格式。对于使用 Qwen OAuth 的用户，DashScope 提供商会自动可用，无需任何配置。对于其他认证方式，请使用新的 `webSearch` 配置格式来配置 Tavily 或 Google 提供商。

#### mcpServers

配置与一个或多个模型上下文协议（MCP）服务器的连接，用于发现和使用自定义工具。Qwen Code 会尝试连接每个已配置的 MCP 服务器以发现可用工具。若多个 MCP 服务器暴露了同名工具，则工具名将被加上你在配置中定义的服务器别名前缀（例如 `serverAlias__actualToolName`），以避免冲突。请注意，系统可能会为兼容性目的从 MCP 工具定义中移除某些 schema 属性。`command`、`url` 和 `httpUrl` 中至少需提供一项；若同时指定多项，则优先级顺序为：`httpUrl` > `url` > `command`。

| 属性                                      | 类型             | 描述                                                                                                                                                                                                                                                               | 可选     |
| ----------------------------------------- | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------- |
| `mcpServers.<SERVER_NAME>.command`        | 字符串           | 通过标准输入/输出执行以启动 MCP 服务器的命令。                                                                                                                                                                                                                     | 是       |
| `mcpServers.<SERVER_NAME>.args`           | 字符串数组       | 传递给命令的参数。                                                                                                                                                                                                                                                 | 是       |
| `mcpServers.<SERVER_NAME>.env`            | 对象             | 为服务器进程设置的环境变量。                                                                                                                                                                                                                                       | 是       |
| `mcpServers.<SERVER_NAME>.cwd`            | 字符串           | 启动服务器时的工作目录。                                                                                                                                                                                                                                             | 是       |
| `mcpServers.<SERVER_NAME>.url`            | 字符串           | 使用服务端发送事件（SSE）进行通信的 MCP 服务器 URL。                                                                                                                                                                                                               | 是       |
| `mcpServers.<SERVER_NAME>.httpUrl`        | 字符串           | 使用可流式传输 HTTP 进行通信的 MCP 服务器 URL。                                                                                                                                                                                                                    | 是       |
| `mcpServers.<SERVER_NAME>.headers`        | 对象             | 发送至 `url` 或 `httpUrl` 请求时所携带的 HTTP 头部映射表。                                                                                                                                                                                                          | 是       |
| `mcpServers.<SERVER_NAME>.timeout`        | 数值             | 对该 MCP 服务器请求的超时时间（毫秒）。                                                                                                                                                                                                                             | 是       |
| `mcpServers.<SERVER_NAME>.trust`          | 布尔值           | 信任此服务器，并跳过所有工具调用确认步骤。                                                                                                                                                                                                                         | 是       |
| `mcpServers.<SERVER_NAME>.description`    | 字符串           | 服务器的简要描述，可能用于界面显示。                                                                                                                                                                                                                               | 是       |
| `mcpServers.<SERVER_NAME>.includeTools`   | 字符串数组       | 从此 MCP 服务器中启用的工具名称列表。若指定此项，则仅列表中所列工具对该服务器可用（白名单行为）；若未指定，则默认启用该服务器提供的全部工具。                                                                                                                       | 是       |
| `mcpServers.<SERVER_NAME>.excludeTools`   | 字符串数组       | 从此 MCP 服务器中禁用的工具名称列表。即使服务器暴露了这些工具，它们也不会对模型可用。**注意：** `excludeTools` 的优先级高于 `includeTools` —— 若某工具同时出现在两个列表中，则该工具将被禁用。                                                              | 是       |

#### 遥测（Telemetry）

配置 Qwen Code 的日志记录与指标收集功能。更多信息，请参阅[遥测（Telemetry）](/developers/development/telemetry)。

| 设置                     | 类型    | 描述                                                                             | 默认值 |
| ------------------------ | ------- | -------------------------------------------------------------------------------- | ------ |
| `telemetry.enabled`      | boolean | 是否启用遥测功能。                                                               |        |
| `telemetry.target`       | string  | 收集的遥测数据的目标位置。支持的值为 `local` 和 `gcp`。                          |        |
| `telemetry.otlpEndpoint` | string  | OTLP 导出器的端点地址。                                                          |        |
| `telemetry.otlpProtocol` | string  | OTLP 导出器使用的协议（`grpc` 或 `http`）。                                      |        |
| `telemetry.logPrompts`   | boolean | 是否在日志中包含用户提示词（prompt）的内容。                                     |        |
| `telemetry.outfile`      | string  | 当 `target` 设为 `local` 时，遥测数据写入的目标文件路径。                        |        |
| `telemetry.useCollector` | boolean | 是否使用外部 OTLP 收集器。                                                       |        |

### 示例 `settings.json`

以下是 v0.3.0 版本起引入的嵌套结构 `settings.json` 文件示例：

```
{
  "general": {
    "vimMode": true,
    "preferredEditor": "code"
  },
  "ui": {
    "theme": "GitHub",
    "hideTips": false,
    "customWittyPhrases": [
      "你每天都会忘记上千件事。确保这件事也在其中",
      "正在连接 AGI"
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
    "openAILoggingDir": "~/qwen-logs"
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

CLI 会保存你执行过的 Shell 命令历史。为避免不同项目之间的冲突，该历史记录存储在用户主目录下、与项目对应的特定目录中。

- **位置：** `~/.qwen/tmp/<project_hash>/shell_history`
  - `<project_hash>` 是根据项目根路径生成的唯一标识符。
  - 历史记录保存在名为 `shell_history` 的文件中。

## 环境变量与 `.env` 文件

环境变量是一种常见的应用程序配置方式，尤其适用于敏感信息（例如令牌）或在不同环境中可能发生变化的设置。

Qwen Code 可自动从 `.env` 文件加载环境变量。  
有关身份验证相关变量（如 `OPENAI_*`）以及推荐的 `.qwen/.env` 配置方式，请参阅 **[身份验证](../configuration/auth)**。

> [!tip]
>
> **环境变量排除机制：** 某些环境变量（例如 `DEBUG` 和 `DEBUG_MODE`）默认会自动从项目级 `.env` 文件中排除，以避免干扰 CLI 的行为。而来自 `.qwen/.env` 文件的变量则永远不会被排除。您可通过 `settings.json` 文件中的 `advanced.excludedEnvVars` 设置来自定义此行为。

### 环境变量表

| 变量                             | 描述                                                                                                                                              | 说明                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `QWEN_TELEMETRY_ENABLED`         | 设为 `true` 或 `1` 以启用遥测；其他任意值均视为禁用遥测。                                                                                          | 覆盖 `telemetry.enabled` 配置项。                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `QWEN_TELEMETRY_TARGET`          | 设置遥测目标（`local` 或 `gcp`）。                                                                                                                 | 覆盖 `telemetry.target` 配置项。                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `QWEN_TELEMETRY_OTLP_ENDPOINT`   | 设置遥测使用的 OTLP 端点。                                                                                                                         | 覆盖 `telemetry.otlpEndpoint` 配置项。                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `QWEN_TELEMETRY_OTLP_PROTOCOL`   | 设置 OTLP 协议（`grpc` 或 `http`）。                                                                                                               | 覆盖 `telemetry.otlpProtocol` 配置项。                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `QWEN_TELEMETRY_LOG_PROMPTS`     | 设为 `true` 或 `1` 以启用或禁用用户提示词的日志记录；其他任意值均视为禁用日志记录。                                                                     | 覆盖 `telemetry.logPrompts` 配置项。                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `QWEN_TELEMETRY_OUTFILE`         | 当遥测目标为 `local` 时，设置遥测数据写入的文件路径。                                                                                                 | 覆盖 `telemetry.outfile` 配置项。                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `QWEN_TELEMETRY_USE_COLLECTOR`   | 设为 `true` 或 `1` 以启用或禁用使用外部 OTLP 收集器；其他任意值均视为禁用收集器。                                                                      | 覆盖 `telemetry.useCollector` 配置项。                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `QWEN_SANDBOX`                   | 替代 `settings.json` 中的 `sandbox` 配置项。                                                                                                        | 可接受值：`true`、`false`、`docker`、`podman` 或自定义命令字符串。                                                                                                                                                                                                                                                                                                                                                                                                   |
| `SEATBELT_PROFILE`               | （仅 macOS）切换 macOS 上 Seatbelt（`sandbox-exec`）的沙箱配置文件。                                                                                 | `permissive-open`：（默认）仅限制对项目目录（及少数其他目录，详见 `packages/cli/src/utils/sandbox-macos-permissive-open.sb`）的写入操作，其余操作均允许。<br>`strict`：采用严格配置文件，默认拒绝所有操作。<br>`<profile_name>`：使用自定义配置文件。如需定义自定义配置文件，请在项目 `.qwen/` 目录下创建名为 `sandbox-macos-<profile_name>.sb` 的文件（例如：`my-project/.qwen/sandbox-macos-custom.sb`）。                                                                                                           |
| `DEBUG` 或 `DEBUG_MODE`          | （常由底层库或 CLI 自身使用）设为 `true` 或 `1` 以启用详细调试日志，有助于问题排查。                                                                    | **注意**：默认情况下，这些变量会自动从项目 `.env` 文件中排除，以避免干扰 CLI 行为。如需为 Qwen Code 特定设置这些变量，请使用 `.qwen/.env` 文件。                                                                                                                                                                                                                                                                                                                  |
| `NO_COLOR`                       | 设为任意值即可禁用 CLI 中的所有彩色输出。                                                                                                            |                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `CLI_TITLE`                      | 设为字符串，用于自定义 CLI 的标题。                                                                                                                  |                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `CODE_ASSIST_ENDPOINT`           | 指定代码辅助服务（code assist server）的端点。                                                                                                       | 此配置适用于开发与测试场景。                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `TAVILY_API_KEY`                 | Tavily 网络搜索服务的 API 密钥。                                                                                                                    | 用于启用 `web_search` 工具功能。示例：`export TAVILY_API_KEY="tvly-your-api-key-here"`                                                                                                                                                                                                                                                                                                                                                                             |

## 命令行参数

在运行 CLI 时直接传入的参数，可覆盖该次会话中的其他配置。

### 命令行参数表

| 参数                         | 别名  | 描述                                                                                                                                                                                                 | 可选值                                 | 说明                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| ---------------------------- | ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--model`                    | `-m`  | 指定本次会话所使用的 Qwen 模型。                                                                                                                                                                     | 模型名称                               | 示例：`npm start -- --model qwen3-coder-plus`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `--prompt`                   | `-p`  | 直接向命令传入提示词（prompt）。此模式下 Qwen Code 以非交互方式运行。                                                                                                                               | 提示词文本                             | 脚本调用示例：使用 `--output-format json` 标志获取结构化输出。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `--prompt-interactive`       | `-i`  | 使用提供的提示词作为初始输入，启动一个交互式会话。                                                                                                                                                   | 提示词文本                             | 提示词在交互式会话中被处理，而非会话开始前。不能与标准输入（stdin）管道输入同时使用。示例：`qwen -i "解释这段代码"`                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `--output-format`            | `-o`  | 指定非交互模式下 CLI 输出的格式。                                                                                                                                                                    | `text`、`json`、`stream-json`          | `text`：（默认）标准人类可读输出；`json`：执行结束时输出机器可读的 JSON；`stream-json`：执行过程中实时流式输出 JSON 消息。如需结构化输出或脚本集成，请使用 `--output-format json` 或 `--output-format stream-json`。详见 [无头模式（Headless Mode）](../features/headless)。                                                                                                                                                                                                                                                                                                     |
| `--input-format`             |       | 指定从标准输入（stdin）读取的数据格式。                                                                                                                                                              | `text`、`stream-json`                  | `text`：（默认）从 stdin 或命令行参数读取标准文本；`stream-json`：通过 stdin 使用 JSON 消息协议实现双向通信。要求：启用 `--input-format stream-json` 时，必须同时设置 `--output-format stream-json`。启用 `stream-json` 后，stdin 将专用于协议消息。详见 [无头模式（Headless Mode）](../features/headless)。                                                                                                                                                                                                                                                                                      |
| `--include-partial-messages` |       | 在使用 `stream-json` 输出格式时，包含不完整的助手消息。启用后，将在流式响应过程中实时发出流事件（如 `message_start`、`content_block_delta` 等）。                                                 |                                        | 默认值：`false`。要求：必须同时设置 `--output-format stream-json`。有关流事件的详细信息，请参阅 [无头模式（Headless Mode）](../features/headless)。                                                                                                                                                                                                                                                                                                                                                                                        |
| `--sandbox`                  | `-s`  | 为本次会话启用沙箱模式。                                                                                                                                                                             |                                        |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `--sandbox-image`            |       | 设置沙箱镜像 URI。                                                                                                                                                                                   |                                        |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `--debug`                    | `-d`  | 为本次会话启用调试模式，提供更详细的日志输出。                                                                                                                                                       |                                        |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `--all-files`                | `-a`  | 若启用，将递归包含当前目录下的所有文件作为提示词上下文。                                                                                                                                              |                                        |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `--help`                     | `-h`  | 显示命令行参数的帮助信息。                                                                                                                                                                           |                                        |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `--show-memory-usage`        |       | 显示当前内存使用情况。                                                                                                                                                                               |                                        |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `--yolo`                     |       | 启用 YOLO 模式，自动批准所有工具调用。                                                                                                                                                               |                                        |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `--approval-mode`            |       | 设置工具调用的审批模式。                                                                                                                                                                             | `plan`、`default`、`auto-edit`、`yolo` | 支持的模式：<br>`plan`：仅分析，不修改文件或执行命令；<br>`default`：对文件编辑或 Shell 命令等操作需人工确认（默认行为）；<br>`auto-edit`：自动批准编辑类工具（如 `edit`、`write_file`），其余工具仍需确认；<br>`yolo`：自动批准所有工具调用（等效于 `--yolo`）。不可与 `--yolo` 同时使用；请统一使用 `--approval-mode=yolo`。示例：`qwen --approval-mode auto-edit`<br>更多关于 [审批模式（Approval Mode）](../features/approval-mode) 的信息。 |
| `--allowed-tools`            |       | 以逗号分隔的工具名称列表，这些工具调用将跳过确认对话框。                                                                                                                                             | 工具名称                               | 示例：`qwen --allowed-tools "Shell(git status)"`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `--telemetry`                |       | 启用 [遥测（telemetry）](/developers/development/telemetry)。                                                                                                                                        |                                        |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `--telemetry-target`         |       | 设置遥测目标。                                                                                                                                                                                       |                                        | 更多信息请参阅 [遥测（telemetry）](/developers/development/telemetry)。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `--telemetry-otlp-endpoint`  |       | 设置遥测的 OTLP 终端地址。                                                                                                                                                                           |                                        | 更多信息请参阅 [遥测（telemetry）](../../developers/development/telemetry)。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `--telemetry-otlp-protocol`  |       | 设置遥测的 OTLP 协议（`grpc` 或 `http`）。                                                                                                                                                           |                                        | 默认值：`grpc`。更多信息请参阅 [遥测（telemetry）](../../developers/development/telemetry)。                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `--telemetry-log-prompts`    |       | 启用遥测中的提示词日志记录。                                                                                                                                                                         |                                        | 更多信息请参阅 [遥测（telemetry）](../../developers/development/telemetry)。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `--checkpointing`            |       | 启用 [检查点（checkpointing）](../features/checkpointing)。                                                                                                                                          |                                        |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `--acp`                      |       | 启用 ACP 模式（Agent Client Protocol），适用于 Zed 等 IDE/编辑器集成。                                                                                                                                |                                        | 稳定功能，替代已弃用的 `--experimental-acp` 标志。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `--experimental-lsp`         |       | 启用实验性 [LSP（语言服务器协议）](../features/lsp) 功能，提供代码智能支持（如跳转定义、查找引用、诊断等）。                                                                                          |                                        | 实验性功能，需提前安装对应语言服务器。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `--extensions`               | `-e`  | 指定本次会话所使用的扩展列表。                                                                                                                                                                       | 扩展名称                               | 若未指定，则启用所有可用扩展。使用特殊指令 `qwen -e none` 可禁用全部扩展。示例：`qwen -e my-extension -e my-other-extension`                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `--list-extensions`          | `-l`  | 列出所有可用扩展并退出。                                                                                                                                                                             |                                        |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `--proxy`                    |       | 为 CLI 设置代理。                                                                                                                                                                                    | 代理 URL                               | 示例：`--proxy http://localhost:7890`。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `--include-directories`      |       | 为多目录工作区支持添加额外目录。                                                                                                                                                                     | 目录路径                               | 可多次指定，或以逗号分隔。最多支持添加 5 个目录。示例：`--include-directories /path/to/project1,/path/to/project2` 或 `--include-directories /path/to/project1 --include-directories /path/to/project2`                                                                                                                                                                                                                                                                                                                                                      |
| `--screen-reader`            |       | 启用屏幕阅读器模式，调整 TUI 以提升与屏幕阅读器的兼容性。                                                                                                                                            |                                        |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `--version`                  |       | 显示 CLI 版本号。                                                                                                                                                                                    |                                        |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `--openai-logging`           |       | 启用 OpenAI API 调用日志，用于调试与分析。                                                                                                                                                           |                                        | 此标志将覆盖 `settings.json` 中的 `enableOpenAILogging` 设置。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `--openai-logging-dir`       |       | 设置 OpenAI API 日志的自定义存储目录。                                                                                                                                                               | 目录路径                               | 此标志将覆盖 `settings.json` 中的 `openAILoggingDir` 设置。支持绝对路径、相对路径及 `~` 展开。示例：`qwen --openai-logging-dir "~/qwen-logs" --openai-logging`                                                                                                                                                                                                                                                                                                                                                                                              |
| `--tavily-api-key`           |       | 为本次会话设置 Tavily API 密钥，以启用网页搜索功能。                                                                                                                                                 | API 密钥                               | 示例：`qwen --tavily-api-key tvly-your-api-key-here`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |

## 上下文文件（分层指令上下文）

虽然上下文文件（默认为 `QWEN.md`，但可通过 `context.fileName` 配置项自定义）并非严格意义上的 CLI _行为_ 配置，但它对配置 _指令上下文_（也称为“记忆”）至关重要。这一强大功能允许你向 AI 提供项目特定的指令、编码风格指南或任何相关背景信息，从而使其响应更贴合你的实际需求且更加准确。CLI 提供了若干 UI 元素（例如页脚中显示已加载上下文文件数量的指示器），以便让你随时掌握当前生效的上下文。

- **用途：** 这些 Markdown 文件包含你希望 Qwen 模型在交互过程中知晓的指令、指南或上下文信息。系统采用分层方式管理此类指令上下文。

### 示例上下文文件内容（例如 `QWEN.md`）

以下是一个概念性示例，展示 TypeScript 项目根目录下上下文文件可能包含的内容：

```

# 项目：我的优秀 TypeScript 库

## 通用说明：
- 生成新的 TypeScript 代码时，请遵循现有编码风格。
- 确保所有新函数和类均带有 JSDoc 注释。
- 在合适的情况下优先采用函数式编程范式。
- 所有代码需兼容 TypeScript 5.0 和 Node.js 20+。

## 编码风格：
- 使用 2 个空格进行缩进。
- 接口名称应以 `I` 开头（例如：`IUserService`）。
- 私有类成员应以下划线 `_` 开头（例如：`_privateField`）。
- 始终使用严格相等比较（`===` 和 `!==`）。

## 特定组件：`src/api/client.ts`
- 该文件负责处理所有出站 API 请求。
- 新增 API 调用函数时，须确保包含健壮的错误处理与日志记录。
- 所有 GET 请求均应使用现有的 `fetchWithRetry` 工具函数。
```

## 关于依赖项：
- 尽量避免引入新的外部依赖，除非绝对必要。
- 如果确实需要新依赖，请说明具体原因。

此示例展示了如何提供通用的项目背景、特定的编码规范，甚至关于特定文件或组件的备注。您的上下文文件越相关、越精准，AI 对您的帮助就越有效。我们强烈建议创建项目专属的上下文文件，以确立统一的规范和上下文。

- **分层加载与优先级：** CLI 通过从多个位置加载上下文文件（例如 `QWEN.md`）实现分层记忆系统。列表中靠后的文件（更具体）内容通常会覆盖或补充靠前的文件（更通用）内容。确切的拼接顺序及最终上下文可通过 `/memory show` 命令查看。典型的加载顺序如下：
  1. **全局上下文文件：**
     - 位置：`~/.qwen/<configured-context-filename>`（例如，您用户主目录下的 `~/.qwen/QWEN.md`）。
     - 作用范围：为所有项目提供默认指令。
  2. **项目根目录及祖先目录中的上下文文件：**
     - 位置：CLI 会在当前工作目录中查找配置的上下文文件；若未找到，则逐级向上搜索父目录，直至抵达项目根目录（由 `.git` 文件夹标识）或您的主目录。
     - 作用范围：为整个项目或其大部分内容提供相关上下文。
- **拼接与 UI 提示：** 所有已找到上下文文件的内容将被拼接（各段内容之间用分隔符标明其来源与路径），并作为系统提示的一部分提供给模型。CLI 底部状态栏会显示已加载上下文文件的数量，为您提供当前生效的指令上下文的直观提示。
- **内容导入：** 您可使用 `@path/to/file.md` 语法在上下文文件中导入其他 Markdown 文件，从而实现上下文文件的模块化。更多细节请参阅 [Memory Import Processor 文档](../configuration/memory)。
- **内存管理命令：**
  - 使用 `/memory refresh` 强制重新扫描并从所有已配置位置重新加载全部上下文文件，从而更新 AI 的指令上下文。
  - 使用 `/memory show` 查看当前已加载的完整指令上下文，以便验证 AI 正在使用的上下文层级与具体内容。
  - 有关 `/memory` 命令及其子命令（`show` 和 `refresh`）的完整说明，请参阅 [Commands 文档](../features/commands)。

通过理解并善用这些配置层级以及上下文文件的分层特性，您可以高效地管理 AI 的记忆，并使 Qwen Code 的响应精准契合您的具体需求与项目场景。

## 沙箱

Qwen Code 可在沙箱环境中执行潜在的不安全操作（例如 shell 命令和文件修改），以保护您的系统。

[沙箱](../features/sandbox) 默认处于禁用状态，但您可通过以下几种方式启用它：

- 使用 `--sandbox` 或 `-s` 参数。
- 设置 `QWEN_SANDBOX` 环境变量。
- 当使用 `--yolo` 或 `--approval-mode=yolo` 时，沙箱默认启用。

默认情况下，它使用预构建的 `qwen-code-sandbox` Docker 镜像。

如需满足项目特定的沙箱需求，您可在项目根目录下的 `.qwen/sandbox.Dockerfile` 中创建自定义 Dockerfile。该 Dockerfile 可基于基础沙箱镜像构建：

```
FROM qwen-code-sandbox

# 在此处添加您的自定义依赖项或配置

# 例如：

# RUN apt-get update && apt-get install -y some-package
```

# COPY ./my-config /app/my-config

当存在 `.qwen/sandbox.Dockerfile` 文件时，运行 Qwen Code 时可设置 `BUILD_SANDBOX` 环境变量，以自动构建自定义沙箱镜像：

```
BUILD_SANDBOX=1 qwen -s
```

## 使用统计信息

为了帮助我们改进 Qwen Code，我们会收集匿名化的使用统计信息。这些数据有助于我们了解 CLI 的使用方式、识别常见问题，并为新功能的开发优先级提供依据。

**我们收集的内容：**

- **工具调用：** 我们记录被调用工具的名称、调用是否成功以及执行耗时。我们**不会**收集传递给工具的参数或工具返回的任何数据。
- **API 请求：** 我们记录每次请求所使用的模型、请求耗时以及请求是否成功。我们**不会**收集提示词（prompt）或响应（response）的内容。
- **会话信息：** 我们收集 CLI 的配置信息，例如已启用的工具和审批模式。

**我们明确不收集的内容：**

- **个人身份信息（PII）：** 我们不会收集任何个人信息，例如您的姓名、电子邮件地址或 API 密钥。
- **提示词与响应内容：** 我们不会记录您输入的提示词或模型返回的响应内容。
- **文件内容：** 我们不会记录 CLI 读取或写入的任何文件的内容。

**如何退出统计收集：**

您可随时通过在 `settings.json` 文件中 `privacy` 类别下将 `usageStatisticsEnabled` 属性设为 `false`，来退出使用统计信息的收集：

```
{
  "privacy": {
    "usageStatisticsEnabled": false
  }
}
```

> [!note]
>
> 当启用使用统计信息收集时，相关事件将发送至阿里云 RUM 数据采集端点。