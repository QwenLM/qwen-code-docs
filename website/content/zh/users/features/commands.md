# 命令

本文档详细介绍了 Qwen Code 支持的所有命令，帮助你高效管理会话、自定义界面并控制其行为。

Qwen Code 命令通过特定前缀触发，分为以下三类：

| 前缀类型                | 功能描述                                | 典型使用场景                                                 |
| -------------------------- | --------------------------------------------------- | ---------------------------------------------------------------- |
| 斜杠命令 (`/`)       | 对 Qwen Code 本身进行元级别控制              | 管理会话、修改设置、获取帮助              |
| At 命令 (`@`)          | 快速将本地文件内容注入对话 | 允许 AI 分析指定文件或目录下的代码 |
| 感叹号命令 (`!`) | 直接与系统 Shell 交互                | 执行 `git status`、`ls` 等系统命令          |

## 1. 斜杠命令 (`/`)

斜杠命令用于管理 Qwen Code 的会话、界面和基本行为。

### 1.1 会话与项目管理

这些命令可帮助你保存、恢复和总结工作进度。

| 命令          | 描述                                                              | 使用示例                                                |
| ---------------- | ------------------------------------------------------------------------ | ------------------------------------------------------------- |
| `/init`          | 分析当前目录并创建初始上下文文件                | `/init`                                                       |
| `/summary`       | 根据对话历史生成项目摘要                   | `/summary` 或 `/summary docs/my-summary.md`                   |
| `/compress`      | 用摘要替换聊天历史以节省 Tokens                         | `/compress` 或 `/summarize`                                   |
| `/compress-fast` | 无需 AI 的快速压缩 — 剥离旧的工具输出和思考过程 | `/compress-fast`                                              |
| `/resume`        | 恢复之前的对话会话                                   | `/resume` 或 `/continue`                                      |
| `/recap`         | 立即生成单行会话回顾                                    | `/recap`                                                      |
| `/restore`       | 将项目文件还原到工具调用运行前的检查点            | `/restore` (list) 或 `/restore <ID>`                          |
| `/delete`        | 删除之前的会话                                                | `/delete`                                                     |
| `/branch`        | 将当前对话分叉到新会话中                         | `/branch`                                                     |
| `/fork`          | 生成一个继承完整对话的后台代理                         | `/fork <directive>`                                           |
| `/rewind`        | 将对话回退到之前的某个轮次                             | `/rewind` 或 `/rollback`                                      |
| `/export`        | 将会话历史导出到文件                                           | `/export html`, `/export md`, `/export json`, `/export jsonl` |
| `/rename`        | 重命名或标记当前会话                                        | `/rename My Feature` 或 `/tag`                                |
| `/commit` | 创建带有 AI 起草消息的 git 提交 | `/commit` 或 `/commit only stage the parser changes` |

> [!note]
>
> 打开 HTML 导出文件会从 `unpkg.com` 加载对应 Qwen Code 版本的渲染器和样式表。如果该版本尚未发布或无法访问渲染器，文件会显示加载错误。Markdown、JSON 和 JSONL 导出仍然是自包含的。

> [!note]
>
> `/summarize` 是 `/compress` 的别名（它会压缩聊天历史 — 这是一个破坏性操作）。若要生成非破坏性的项目摘要，请使用 `/summary`。

> [!note]
>
> `/summary` 接受可选的 `[path]` 参数，将摘要保存到项目根目录内的自定义位置。不带参数时，保存到 `.qwen/PROJECT_SUMMARY.md`。自定义路径的摘要不会被欢迎返回流程（`ui.enableWelcomeBack`）检测到，该流程仅读取默认的 `.qwen/PROJECT_SUMMARY.md` 位置。

### 1.2 界面与工作区控制

用于调整界面外观和工作环境的命令。

| 命令              | 描述                                                                                                                                                                       | 使用示例                                                                    |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| `/clear`             | 清除对话历史并释放上下文                                                                                                                                    | `/clear`, `/reset`, `/new`                                                        |
| `/context`           | 显示上下文窗口使用情况明细                                                                                                                                               | `/context`                                                                        |
| → `detail`           | 显示各项上下文使用情况明细                                                                                                                                             | `/context detail`                                                                 |
| `/history`           | 控制历史记录显示偏好和可见性                                                                                                                                | `/history collapse-on-resume`, `/history expand-on-resume`, `/history expand-now` |
| `/diff`              | 打开交互式 diff 查看器，显示未提交的更改和每个轮次的 diff。使用 ←/→ 在当前 git diff 和各个对话轮次之间切换，使用 ↑/↓ 浏览文件 | `/diff`                                                                           |
| `/log`               | 打开工作区的 commit 历史查看器（仅限 Web Shell）                                                                                                                   | `/log`                                                                            |
| `/theme`             | 更改 Qwen Code 视觉主题                                                                                                                                                     | `/theme`                                                                          |
| `/vim`               | 开启/关闭输入区域的 Vim 编辑模式                                                                                                                                           | `/vim`                                                                            |
| `/voice`             | 切换语音听写输入                                                                                                                                                      | `/voice`, `/voice hold`, `/voice tap`, `/voice off`, `/voice status`              |
| `/directory`         | 管理多目录支持工作区                                                                                                                                          | `/dir add ./src,./tests`, `/dir show`                                             |
| `/cd`                | 将会话移动到新的工作目录                                                                                                                                      | `/cd ../other-project`                                                            |
| `/editor`            | 打开对话框以选择支持的编辑器                                                                                                                                            | `/editor`                                                                         |
| `/statusline`        | 打开交互式 [status line](./status-line.md) 预设对话框                                                                                                                 | `/statusline`                                                                     |
| `/statusline <text>` | 通过代理生成命令模式 [status line](./status-line.md)                                                                                                                  | `/statusline show model and git branch`                                           |
| `/terminal-setup`    | 配置终端多行输入快捷键                                                                                                                                | `/terminal-setup`                                                                 |

### 1.3 语言设置

专门用于控制界面和输出语言的命令。

| 命令               | 描述                      | 使用示例             |
| --------------------- | -------------------------------- | -------------------------- |
| `/language`           | 查看或更改语言设置 | `/language`                |
| → `ui [language]`     | 设置 UI 界面语言        | `/language ui zh-CN`       |
| → `output [language]` | 设置 LLM 输出语言          | `/language output Chinese` |

- 可用的内置 UI 语言：`zh-CN`（简体中文）、`en-US`（英语）、`ru-RU`（俄语）、`de-DE`（德语）、`ja-JP`（日语）、`pt-BR`（葡萄牙语 - 巴西）、`fr-FR`（法语）、`ca-ES`（加泰罗尼亚语）
- 输出语言示例：`Chinese`、`English`、`Japanese` 等。

### 1.4 工具与模型管理

用于管理 AI 工具和模型的命令。

| 命令 | 描述 | 使用示例 |
| --------------------- | ------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------- |
| `/mcp` | 列出已配置的 MCP 服务器和工具 | `/mcp`, `/mcp desc`, `/mcp nodesc`, `/mcp schema` |
| `/import-config` | 从 Claude 配置导入 MCP 服务器 | `/import-config all`, `/import-config claude-code`, `/import-config claude-desktop --scope user\|project` |
| `/tools` | 显示当前可用的工具列表 | `/tools`, `/tools desc` |
| `/skills` | 打开 Skills 面板以浏览、搜索、切换和启动技能 | `/skills`, `/<skill-name>` |
| `/learn` | 从文件、目录、URL、视频或文本创建可复用的项目技能 | `/learn https://docs.example.com/api`, `/learn ./tutorial.mp4 focus on deployment` |
| `/curator` | 检查、固定、归档或恢复非活动的项目自动技能 | `/curator`, `/curator run --dry-run`, `/curator pin <directory>`, `/curator restore <directory>` |
| `/plan` | 切换到计划模式或退出计划模式 | `/plan`, `/plan <task>`, `/plan exit` |
| `/approval-mode` | 更改工具审批模式（仅当前会话） | `/approval-mode`, `/approval-mode auto-edit` |
| → `plan` | 仅分析，不执行（安全审查） | `/approval-mode plan` |
| → `default` | 编辑需要审批（日常使用） | `/approval-mode default` |
| → `auto-edit` | 自动批准编辑（受信任环境） | `/approval-mode auto-edit` |
| → `auto` | 分类器评估审批（自主） | `/approval-mode auto` |
| → `yolo` | 自动批准所有操作（快速原型设计） | `/approval-mode yolo` |
| `/peers` | 审查暂存的对等消息；管理受信任的控制者 | `/peers`, `/peers accept <id>`, `/peers deny all`, `/peers controllers`, `/peers revoke <id>` |
| `/model` | 切换当前会话中使用的模型 | `/model`, `/model <model-id>` (立即切换) |
| `/model --fast` | 为提示建议设置更轻量的模型 | `/model --fast qwen3-coder-flash` |
| `/model --voice` | 设置用于语音转录的模型 | `/model --voice <model-id>` |
| `/model --vision` | 设置用于将图像转录给纯文本主模型的视觉桥接模型 | `/model --vision <model-id>` |
| `/model --compaction` | 设置用于聊天压缩的模型 | `/model --compaction <model-id>`, `/model --compaction clear` |
| `/model --image` | 为内置图像生成工具设置支持图像生成的模型 | `/model --image <model-id>` |
| `/effort` | 为支持思考的模型设置推理强度 | `/effort` (打开选择器), `/effort high` (low/medium/high/xhigh/max; 根据提供商映射并限制) |
| `/output-style` | 选择塑造响应编写方式的输出样式 | `/output-style` (打开选择器), `/output-style Concise`, `/output-style default` (无样式) |
| `/extensions` | 管理扩展 | `/extensions list`, `/extensions manage` |
| → `list` | 列出已安装的扩展 | `/extensions list` |
| → `manage` | 管理已安装的扩展（交互式） | `/extensions manage` |
| → `explore` | 在浏览器中打开扩展页面 | `/extensions explore <Gemini\|ClaudeCode>` |
| → `install` | 从 git 仓库或路径安装扩展 | `/extensions install <repo-or-path>` |
| `/memory` | 打开记忆管理器对话框 | `/memory` |
| `/remember` | 保存持久化记忆 | `/remember Prefer terse responses` |
| `/forget` | 从自动记忆中移除匹配的条目 | `/forget <query>` |
| `/dream` | 手动运行自动记忆整合 | `/dream` |
| `/hooks` | 管理 Qwen Code hooks | `/hooks`, `/hooks list` |
| `/reload-plugins` | 从磁盘重新加载扩展更改（命令、技能、代理、工作流、hooks、MCP/LSP 服务器） | `/reload-plugins` |
| `/permissions` | 管理权限规则 | `/permissions` |
| `/agents` | 管理子代理 | `/agents manage`, `/agents create` |
| `/arena` | 管理 Arena 会话 | `/arena start`, `/arena stop`, `/arena status`, `/arena select` (别名 `choose`) |
| `/goal` | 设定目标 — 持续工作直到验证器确认（参见 [Goals](./goals.md)） | `/goal <objective>`, `/goal edit <objective>`, `/goal pause`, `/goal resume`, `/goal clear` |
| `/tasks` | 列出后台任务 | `/tasks` |
| `/workflows` | 检查工作流运行；协作暂停/恢复后台运行 | `/workflows`, `/workflows <runId>`, `/workflows p <runId>` |
| `/lsp` | 显示 LSP 服务器状态 | `/lsp` |
| `/trust` | 管理文件夹信任设置 | `/trust` |

> [!warning]
>
> 仅从您信任的来源安装扩展 (`/extensions install`)。扩展可以捆绑 MCP 服务器、技能和命令，这些内容以与 Qwen Code 本身相同的权限运行——它们可以访问您的文件、API 密钥和对话数据。它们还可以包含工作流脚本，这些脚本在工作流沙箱中运行，没有直接的文件或 shell 访问权限，通过其启动的子代理进行操作，并经过 Workflow 工具的审批。`/extensions install` 不会提示确认。

> [!warning]
>
> `auto-edit`、`auto` 和 `yolo` 审批模式会绕过工具执行的审批提示。在 `yolo` 模式下，所有操作——包括 shell 命令、文件写入和网络请求——都会在没有确认的情况下运行。请仅在受信任、沙盒化或一次性的环境中使用这些模式。

> [!note]
>
> `/workflows`、`/lsp` 和 `/trust` 仅在其对应功能启用时才会注册——分别通过用户/系统作用域的 `tools.workflowsEnabled` 设置或 `QWEN_CODE_ENABLE_WORKFLOWS=1` 环境变量、`--experimental-lsp` CLI 标志和 `security.folderTrust.enabled` 设置。`tools.workflowsEnabled` 的工作区值会被忽略。禁用时它们不会出现，并会报告未知命令。同样，`/dream` 和 `/forget` 仅在托管 auto-memory 可用时才会注册；不可用时它们不会出现。

> [!note]
>
> 来自已安装扩展的技能也是一个斜杠命令，其名称包含其所有者：`/rust:pdf`，而不是 `/pdf`。裸形式不是别名——如果另一个技能命名为 `pdf`，则 `/pdf` 会运行该技能。`slashCommands.disabled` 对这两种拼写下的此类命令进行门控，因此即使在名称包含所有者之前编写的条目仍然有效。参见 [How extension Skills are named](./skills.md#how-extension-skills-are-named)。

### 1.5 内置技能

这些命令调用提供专用工作流的捆绑技能。

| 命令 | 描述 | 使用示例 |
| ------------- | ------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `/review` | 多代理代码审查（高努力度下 12 个并行代理） | `/review`, `/review 123`, `/review 123 --comment`, `/review --effort low` |
| `/coordinate` | 协调只读工作者和一个可选的工作树写入者 | `/coordinate investigate and fix the authentication regression` |
| `/loop` | 按循环时间表运行提示 | `/loop 5m check the build` |
| `/goal-draft` | 将模糊意图转化为可验证的 `/goal` 目标 | `/goal-draft make the auth tests pass` |
| `/autofix-pr` | 监视 PR 并修复其 CI、审查反馈和冲突 | `/autofix-pr 123`, `/autofix-pr 123 --once`, `/autofix-pr resume`, `/autofix-pr stop 123` |
| `/simplify` | 审查近期更改并直接应用安全的清理编辑 | `/simplify`, `/simplify focus on duplication` |
| `/qc-helper` | 回答有关 Qwen Code 使用和配置的问题 | `/qc-helper how do I configure MCP?` |

完整的 `/review` 文档请参见 [Code Review](./code-review.md)，`/autofix-pr` 请参见 [Autofix a Pull Request](./autofix-pr.md)。

### 1.6 侧边提问 (`/btw`)

`/btw` 命令允许你快速提出侧边问题，而不会中断或影响主对话流。

| 命令                   | 描述                                |
| ---------------------- | ----------------------------------- |
| `/btw <your question>` | 提出一个快速的侧边问题            |
| `?btw <your question>` | 侧边问题的替代语法                |

**工作原理：**

- 侧边问题会作为单独的 API 调用发送，并带有最近的对话上下文（最多 20 条消息）
- 响应显示在 Composer 上方——你可以在等待时继续输入
- 主对话**不会被阻塞**——它会独立继续
- 侧边问题的响应**不会**成为主对话历史的一部分
- 答案支持完整的 Markdown 渲染（代码块、列表、表格等）

**键盘快捷键（交互模式）：**

| 快捷键               | 操作                                                |
| -------------------- | ----------------------------------------------- |
| `Escape`             | 取消（加载中时）或关闭（完成后）                    |
| `Space` 或 `Enter`   | 关闭答案（当输入为空时）                            |
| `Ctrl+C` 或 `Ctrl+D` | 取消正在进行的侧边问题                            |

**示例：**

```
(While the main conversation is about refactoring code)

> /btw What's the difference between let and var in JavaScript?

  ╭──────────────────────────────────────────╮
  │ /btw What's the difference between let   │
  │     and var in JavaScript?               │
  │                                          │
  │ + Answering...                           │
  │ Press Escape, Ctrl+C, or Ctrl+D to cancel│
  ╰──────────────────────────────────────────╯
  > (Composer remains active — keep typing)

(After the answer arrives)

  ╭──────────────────────────────────────────╮
  │ /btw What's the difference between let   │
  │     and var in JavaScript?               │
  │                                          │
  │ `let` is block-scoped, while `var` is    │
  │ function-scoped. `let` was introduced    │
  │ in ES6 and doesn't hoist the same way.   │
  │                                          │
  │ Press Space, Enter, or Escape to dismiss │
  ╰──────────────────────────────────────────╯
  > (Composer still active)
```

**支持的执行模式：**

| 模式 | 行为 |
| -------------------- | -------------------------------------------- |
| Interactive | 在 Composer 上方显示，采用 Markdown 渲染 |
| Non-interactive      | 返回文本结果：`btw> question\nanswer`        |
| ACP（Agent Protocol） | 返回 stream_messages 异步生成器 |

> [!tip]
>
> 当你需要快速得到答案而不偏离主任务时，请使用 `/btw`。它对于澄清概念、核实事实或在专注于主要工作流时获取快速解释特别有用。

### 1.7 第二意见 (`/advisor`) [#17-second-opinion-advisor]

`/advisor` 命令对目前为止的对话进行独立的只读审查，并返回结构化的第二意见——不会执行任务，也不会中断主对话。

| 命令               | 描述                           |
| ------------------ | ------------------------------ |
| `/advisor`         | 审查上面的对话                 |
| `/advisor <focus>` | 将审查聚焦于特定关注点         |

**工作原理：**

- 审查以单独的单轮 API 调用发送，带有最近的对话上下文（最多 40 条消息）
- 审查模型**无法执行工具**——工具在请求级别被剥离（与 `/btw` 相同的机制），因此审查永远不会编写代码或运行命令；每个结论都必须基于可见的对话记录
- 主对话**不会**被中断；审查结果仅展示给你
- 审查渲染为带边框的 markdown 块，包含四个固定部分——**裁决**、**风险**、**缺失证据**和**建议**——在 `/advisor · <model>` 标题下标注解析后的审查模型
- 与 `/btw` 不同，后者是即发即忘且保持会话可用，而 `/advisor` 会阻塞输入直到审查返回；在完整上下文窗口中使用强审查模型时，这可能需要数十秒
- 默认使用主模型；设置 [`advisorModel`](../configuration/settings.md#advisormodel) 可将审查路由到不同（通常更强）的模型——最近的对话记录会发送给该模型，即使它使用另一个提供者

**示例：**

```
> /advisor is my fix for the null check actually correct?

  Consulting advisor...

  ╭──────────────────────────────────────────────────────╮
  │ /advisor · qwen3-max                                 │
  │                                                      │
  │ Verdict                                              │
  │ The approach is sound, but the edge case at line 42  │
  │ is unverified.                                       │
  │                                                      │
  │ Risks                                                │
  │  - The fix assumes the config is always loaded; a    │
  │    startup race could leave it null.                 │
  │                                                      │
  │ Missing evidence                                     │
  │  - No test exercises the null-config path in the     │
  │    visible transcript.                               │
  │                                                      │
  │ Recommendation                                       │
  │ Add a focused unit test for the null-config branch   │
  │ before merging.                                      │
  ╰──────────────────────────────────────────────────────╯
```

审查渲染在带边框的框中，其标题标注解析后的审查模型。未知的 `advisorModel` 不会预先验证——如果提供者拒绝它，`/advisor` 会报告失败，因此请检查模型名称；只有无法解析的别名选择器（例如 `fast` 但未配置快速模型）才会回退到主模型。Advisor 请求不使用配置的模型回退。

**支持的执行模式：**

| 模式                 | 行为                                            |
| -------------------- | ----------------------------------------------- |
| Interactive          | 在对话中渲染四部分审查                          |
| ACP (Agent Protocol) | 将审查作为消息结果返回                          |

> [!tip]
>
> 在确定方向之前使用 `/advisor` 获取第二意见——它对于捕捉有缺陷的假设、未验证的声明或有风险的下一步特别有用。配置 `advisorModel` 可以从不同于驱动主对话的模型获取审查。

> [!note]
>
> `advisorModel` 仅在设置中配置；与 `fastModel` 和 `visionModel` 不同，它目前没有对应的 `/model` 标志。

### 1.8 会话回顾 (`/recap`)

`/recap` 命令会生成当前会话的简短“断点续传”摘要，以便你在无需翻阅大量历史记录的情况下恢复旧对话。

| 命令 | 描述 |
| -------- | ------------------------------------------ |
| `/recap` | 生成并显示单行会话回顾                   |

**工作原理：**

- 如果可用，则使用配置的快速模型（`fastModel` 设置），否则回退到主会话模型。对于回顾总结而言，一个小型且廉价的模型就足够了。
- 最近的对话（最多 30 条消息，仅文本——工具调用和工具响应会被过滤掉）连同紧凑的系统提示一起发送给模型。
- 回顾内容以暗色显示并带有 `❯` 前缀，以便与真实的助手回复区分开来。
- 如果正在处理模型轮次或另一个命令正在处理中，则会拒绝执行并显示内联错误。如果没有可用的对话，或者底层生成失败，`/recap` 将显示一条简短的信息消息而不是回顾内容——手动命令始终会有所响应。

**从离开状态返回时自动触发：**

如果终端失焦 **5 分钟以上** 并重新获得焦点，系统将自动生成并显示回顾内容（仅当没有模型响应正在进行时；否则它会等待当前轮次完成后再触发）。与手动命令不同，自动触发在失败时完全静默：如果生成出错或没有可总结的内容，不会向历史记录中添加任何消息。由 `general.showSessionRecap` 设置控制（默认值：`false`）；无论此设置如何，手动 `/recap` 命令始终有效。

**示例：**

```
> /recap

❯ Refactoring loopDetectionService.ts to address long-session OOM caused by
  unbounded streamContentHistory and contentStats. The next step is to
  implement option B (LRU sliding window with FNV-1a) pending confirmation.
```

> [!tip]
>
> 通过 `/model --fast <model>` 配置快速模型（例如 `qwen3-coder-flash`），以使 `/recap` 快速且廉价。将 `general.showSessionRecap` 设置为 `true` 以启用自动触发；无论此设置如何，手动 `/recap` 命令始终有效。

### 1.9 Diff 查看器 (`/diff`)

`/diff` 命令打开一个交互式 diff 查看器，显示未提交的更改和每个轮次的 diff。使用 ←/→ 在当前 git diff 和各个对话轮次之间切换，使用 ↑/↓ 浏览文件，按 Enter 查看内联 diff。

**工作原理：**

在交互模式下，`/diff` 会打开一个对话框，顶部带有**来源选择器**：

- **Current** — 工作树与 HEAD 对比（`git diff HEAD`）。显示所有未提交的更改，包括已暂存、未暂存和未跟踪的文件。
- **T1, T2, T3, …** — 每个轮次的 diff，每个修改了文件的轮次对应一个标签页。最近的轮次显示在最前面。每个标签页会显示原始 prompt 的预览以提供上下文。

文件列表显示每个文件的统计信息（增加/删除的行数），并带有特殊状态的标签（`new`、`deleted`、`untracked`、`binary`、`truncated`、`oversized`）。在文件上按 Enter 可查看其内联 diff，并带有语法高亮的代码块。

每个轮次的 diff 需要启用文件检查点（在交互模式下默认开启）。当文件检查点关闭时，仅"Current"来源可用。

**键盘快捷键：**

| 按键      | 操作                                      |
| --------- | ----------------------------------------- |
| `←` / `→` | 在来源之间切换（Current / T1 / T2…）      |
| `↑` / `↓` | 浏览文件列表                              |
| `j` / `k` | 浏览文件列表（vim 风格）                  |
| Enter     | 查看所选文件的内联 diff                   |
| `←` / Esc | 从内联 diff 视图返回文件列表              |
| Esc       | 关闭对话框                                |

**示例：**

```
┌ /diff · Turn 3 "refactor the auth middleware" ──── 3 files +45 -12 ┐
│                                                                     │
│ ◀ Current · T3 · T2 · T1 ▶                                         │
│                                                                     │
│ › src/utils/parser.ts                              +30 -8           │
│   src/utils/parser.test.ts                         +12 -2           │
│   README.md                                        +3 -2            │
│                                                                     │
│ ←/→ source · ↑/↓ file · Enter view · Esc close                     │
└─────────────────────────────────────────────────────────────────────┘
```

**非交互模式：**

在无头（`--prompt`）或非交互上下文中，`/diff` 会打印工作树与 HEAD 对比的纯文本摘要。不提供每个轮次的导航。

```
3 files changed, +45 / -12
  +30  -8  src/utils/parser.ts
  +12  -2  src/utils/parser.test.ts
   +3  -2  README.md
```

**Web Shell：** 在 Web Shell UI（`qwen serve`）中，`/diff` 会打开一个图形化的 diff 对话框。顶部的标签栏允许你在 **Changes** 视图和 **History** 视图（`/log`）之间切换。

#### History Viewer (`/log`) — 仅限 Web Shell

`/log` 命令打开当前工作区的 commit 历史浏览器。它仅在 Web Shell UI 中可用；CLI/TUI 没有此命令。

**工作原理：**

`/log` 打开一个对话框，按时间倒序列出 commit（最新的在前）。每行显示：

- 短 SHA（等宽字体，带有复制完整 SHA 的按钮）
- Commit 主题（单行）
- 作者姓名和相对时间（例如 "2h ago"）
- 分支/标签 ref 标签（如果存在）
- 合并 commit 的合并图标（⎇）

点击 commit 行可按需展开其详细信息：

- 完整的 commit 消息正文
- 文件变更统计（变更的文件数、增加/删除的行数、按文件分类的明细）

使用底部的 **Load more** 获取下一页 commit（每页 50 个）。

**示例：**

```
┌─ History ──────────────────────────── 50 commits ─ ✕ ┐
│                                                       │
│  a1b2c3d  feat(cli): add --json flag        2h ago   │
│           wenshao                                    │
│                                                       │
│  e4f5g6h  fix(core): handle null config     5h ago   │
│           dev · main  v1.2.0                         │
│                                                       │
│ ▼ 789abcd  refactor: simplify parser        1d ago   │
│   ┌─────────────────────────────────────────────┐    │
│   │  Broke the monolithic parse() into smaller  │    │
│   │  functions for readability.                 │    │
│   │                                             │    │
│   │  3 files · +45 −12                          │    │
│   │   +30 −8   src/parser.ts                    │    │
│   │   +10 −2   src/utils.ts                     │    │
│   │   +5  −2   test/parser.test.ts              │    │
│   └─────────────────────────────────────────────┘    │
│                                                       │
│              [ Load more ]                            │
└───────────────────────────────────────────────────────┘
```

> [!note]
>
> `/log` 需要 git 仓库工作区。如果工作区不是 git 仓库或没有 commit，对话框会显示占位消息。

### 1.10 信息、设置和帮助

用于获取信息和执行系统设置的命令。

| 命令             | 描述                                                                                                                         | 使用示例                                                                            |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `/help`          | 显示可用命令的帮助信息                                                                                                       | `/help` 或 `/?`                                                                     |
| `/status`        | 显示版本信息                                                                                                                 | `/status` 或 `/about`                                                               |
| `/status paths`  | 显示当前会话文件和日志路径                                                                                                   | `/status paths`                                                                     |
| `/stats`         | 打开交互式使用统计仪表板（Session、Activity 和 Efficiency 标签页）                                                           | `/stats` 或 `/usage`                                                                |
| `/stats model`   | 显示每个模型的 token 细分和预估成本                                                                                          | `/stats model`                                                                      |
| `/stats tools`   | 显示每个工具的调用次数                                                                                                       | `/stats tools`                                                                      |
| `/stats skills`  | 显示当前实时会话中每个 skill 的调用次数（仅限实时；不包括跨会话的每日/每月活动）                                             | `/stats skills`                                                                     |
| `/stats daily`   | 显示每日 token 使用统计                                                                                                      | `/stats daily`（别名 `day`），`/stats day [YYYY-MM-DD]`                             |
| `/stats monthly` | 显示每月 token 使用统计                                                                                                      | `/stats monthly`（别名 `month`），`/stats month [YYYY-MM]`                          |
| `/stats export`  | 将使用统计导出为 CSV 或 JSON                                                                                                 | `/stats export <daily\|monthly> [date\|month] [--format csv\|json] [--output path]` |
| `/settings`      | 打开设置编辑器                                                                                                               | `/settings`                                                                         |
| `/config`        | 通过点路径键获取或设置任何配置（写入用户设置）                                                                               | `/config`（列出所有），`/config <key>`，`/config <key>=<value>`                     |
| `/auth`          | 更改身份验证方法                                                                                                             | `/auth`、`/connect`、`/login`                                                       |
| `/logout` | 退出当前 Qwen 订阅账户（适用于 Qwen 订阅登录） | `/logout` |
| `/upgrade` | 打开 Qwen 订阅计划（适用于 Qwen 订阅登录） | `/upgrade` |
| `/doctor`        | 运行安装和环境诊断                                                                                                           | `/doctor`、`/doctor memory`                                                         |
| → `memory`       | 显示当前进程内存诊断                                                                                                         | `/doctor memory [--json] [--sample] [--snapshot]`                                   |
| → `cpu-profile`  | 记录 CPU profile 以供 Chrome DevTools 分析                                                                                   | `/doctor cpu-profile [--duration <seconds>]`                                        |
| → `rollback`     | 将独立 CLI 二进制文件回滚到上一版本（仅限独立安装；对于对话历史请使用 `/rewind`）                                            | `/doctor rollback`                                                                  |
| `/docs`          | 在浏览器中打开完整的 Qwen Code 文档                                                                                          | `/docs`                                                                             |
| `/ide`           | 管理 IDE 集成                                                                                                                | `/ide status`、`/ide install`、`/ide enable`、`/ide disable`                        |
| `/insight`       | 从聊天历史生成编程洞察                                                                                                       | `/insight`                                                                          |
| `/setup-github`  | 设置 GitHub Actions                                                                                                          | `/setup-github`                                                                     |
| `/bug`           | 提交关于 Qwen Code 的问题                                                                                                    | `/bug Button click unresponsive`                                                    |
| `/copy`          | 复制到剪贴板：回复（倒数第 N 个）、代码（按语言）、LaTeX 或 Mermaid                                                          | `/copy`、`/copy 2`、`/copy python`、`/copy latex`、`/copy mermaid`                  |
| `/quit`          | 立即退出 Qwen Code                                                                                                           | `/quit` 或 `/exit`                                                                  |

> [!warning]
>
> `/doctor memory --snapshot` 会生成一个 V8 堆快照，其中可能包含当前会话的提示词、文件内容、API 密钥和工具返回结果。请在分享该文件前仔细检查。

> [!note]
>
> `/config` 通过点路径键读取和写入单个设置（例如 `general.vimMode`），作为交互式 `/settings` 编辑器的补充。不带参数运行 `/config`（或 `--help`）会列出所有可设置键及其类型和当前值。`/config <key>` 打印当前值——但对于布尔键，它会切换值。`/config <key>=<value>` 设置值。更改将写入用户设置（`~/.qwen/settings.json`）。只有 `boolean`、`string`、`number` 和 `enum` 设置可以以此方式更改——`array` 和 `object` 设置必须直接在 `settings.json` 中编辑。敏感值（API 密钥、令牌、基础 URL）在输出中会被掩码，并且将 `tools.approvalMode` 设置为 `yolo` 是被阻止的。

### 1.11 常用快捷键

| 快捷键             | 功能                  | 说明                                                                      |
| ------------------ | --------------------- | ------------------------------------------------------------------------- |
| `Ctrl/cmd+L`       | 清屏                | 仅清除可见屏幕（不会像 `/clear` 那样重置会话）                            |
| `Ctrl/cmd+T`       | 切换工具描述          | MCP 工具管理                                                              |
| `Ctrl/cmd+C`×2     | 退出确认              | 安全退出机制                                                              |
| `Ctrl/cmd+Z`       | 撤销输入              | 文本编辑                                                                  |
| `Ctrl/cmd+Shift+Z` | 重做输入              | 文本编辑                                                                  |

### 1.12 身份验证命令

在 Qwen Code 会话中使用 `/auth` 来配置身份验证。使用 `/doctor` 检查当前的身份验证和环境状态。

| 命令      | 说明                                                                   |
| --------- | ---------------------------------------------------------------------- |
| `/auth`   | 交互式配置身份验证（别名：`/connect`、`/login`）                       |
| `/doctor` | 显示身份验证和环境检查                                                 |

> [!note]
>
> 独立的 `qwen auth` CLI 命令已被移除。像 `qwen auth status` 这样的旧版调用会打印移除通知及迁移指南。有关完整详细信息，请参阅[身份验证](../configuration/auth)页面。

## 2. @ 命令（引入文件）

@ 命令用于快速将本地文件或目录内容添加到对话中。

| 命令格式            | 说明                                   | 示例                                             |
| ------------------- | -------------------------------------- | ------------------------------------------------ |
| `@<file path>` | 注入指定文件的内容 | `@src/main.py Please explain this code` |
| `@<directory path>` | 递归读取目录中的所有文本文件 | `@docs/ Summarize content of this document` |
| 独立的 `@` | 用于讨论 `@` 符号本身 | `@ What is this symbol used for in programming?` |

注意：路径中的空格需要使用反斜杠进行转义（例如：`@My\ Documents/file.txt`）

在交互式提示中，`@` 补全支持 Unicode 文件名，包括表情符号。提示中其他地方的表情符号不会改变用于补全的文件路径。

## 3. 感叹号命令（`!`）- Shell 命令执行

感叹号命令允许你直接在 Qwen Code 中执行系统命令。

| 命令格式             | 说明                                                     | 示例                                 |
| -------------------- | -------------------------------------------------------- | ------------------------------------ |
| `!<shell command>`   | 在子 Shell 中执行命令                                    | `!ls -la`、`!git status`             |
| 单独的 `!`           | 切换 Shell 模式，任何输入都会直接作为 Shell 命令执行     | `!`(进入) → 输入命令 → `!`(退出)     |

环境变量：通过 `!` 执行的命令会设置 `QWEN_CODE=1` 环境变量。

## 4. 自定义命令 [#4-custom-commands]

将常用的提示词保存为快捷命令，以提高工作效率并确保一致性。

> [!note]
>
> 自定义命令现在使用 Markdown 格式，并支持可选的 YAML frontmatter。TOML 格式已弃用，但为了向后兼容仍受支持。当检测到 TOML 文件时，将显示自动迁移提示。

### 快速概览

| 功能             | 说明                                     | 优势                                   | 优先级 | 适用场景                                             |
| ---------------- | ---------------------------------------- | -------------------------------------- | ------ | ---------------------------------------------------- |
| 命名空间         | 子目录创建以冒号命名的命令               | 更好的命令组织                         |        |                                                      |
| 全局命令         | `~/.qwen/commands/`                      | 在所有项目中可用                       | 低     | 个人常用命令，跨项目使用                             |
| 项目命令         | `<project root directory>/.qwen/commands/` | 项目专属，可版本控制                   | 高     | 团队共享，项目专属命令                               |

优先级规则：项目命令 > 用户命令（同名时使用项目命令）

### 命令命名规则

#### 文件路径到命令名的映射表

| 文件位置                               | 生成的命令      | 调用示例              |
| -------------------------------------- | --------------- | --------------------- |
| `~/.qwen/commands/test.md`               | `/test`           | `/test Parameter`     |
| `<project>/.qwen/commands/git/commit.md` | `/git:commit`     | `/git:commit Message` |

命名规则：路径分隔符（`/` 或 `\`）转换为冒号（`:`）

### Markdown 文件格式规范（推荐）

自定义命令使用带有可选 YAML frontmatter 的 Markdown 文件：

```markdown
---
description: Optional description (displayed in /help)
---

Your prompt content here.
Use {{args}} for parameter injection.
```

| 字段 | 是否必需 | 描述 | 示例 |
| ------------- | -------- | ---------------------------------------- | ------------------------------------------ |
| `description` | 可选 | 命令描述（显示在 /help 中） | `description: Code analysis tool` |
| Prompt body | 必需 | 发送给模型的提示内容 | frontmatter 之后的任何 Markdown 内容 |

### TOML 文件格式（已弃用）

> [!warning]
>
> **已弃用：** TOML 格式仍受支持，但将在未来版本中移除。请迁移到 Markdown 格式。

| 字段 | 是否必需 | 描述 | 示例 |
| ------------- | -------- | ---------------------------------------- | ------------------------------------------ |
| `prompt` | 必需 | 发送给模型的提示内容 | `prompt = "Please analyze code: {{args}}"` |
| `description` | 可选 | 命令描述（显示在 /help 中） | `description = "Code analysis tool"` |

### 参数处理机制

| 处理方法 | 语法 | 适用场景 | 安全特性 |
| ---------------------------- | ------------------ | ------------------------------------ | -------------------------------------- |
| 上下文感知注入 | `{{args}}` | 需要精确的参数控制 | 自动 Shell 转义 |
| 默认参数处理 | 无特殊标记 | 简单命令，追加参数 | 原样追加 |
| Shell 命令注入 | `!{command}` | 需要动态内容 | 执行前需确认 |

#### 1. 上下文感知注入（`{{args}}`）

| 场景             | TOML 配置                             | 调用方式              | 实际效果               |
| ---------------- | ------------------------------------- | --------------------- | ---------------------- |
| 原始注入         | `prompt = "Fix: {{args}}"`            | `/fix "Button issue"` | `Fix: "Button issue"`  |
| 在 Shell 命令中  | `prompt = "Search: !{grep {{args}} .}"` | `/search "hello"`     | 执行 `grep "hello" .`  |

#### 2. 默认参数处理

| 输入情况   | 处理方式                                         | 示例                                         |
| ---------- | ------------------------------------------------ | -------------------------------------------- |
| 有参数 | 追加到提示末尾（用两个换行符分隔） | `/cmd parameter` → 原始提示 + 参数 |
| 无参数     | 原样发送提示词                                   | `/cmd` → 原始提示词                          |

🚀 动态内容注入

| 注入类型       | 语法             | 处理顺序   | 用途                             |
| -------------- | ---------------- | ---------- | -------------------------------- |
| 文件内容       | `@{file path}`   | 首先处理   | 注入静态参考文件                 |
| Shell 命令     | `!{command}`     | 中间处理   | 注入动态执行结果                 |
| 参数替换       | `{{args}}`       | 最后处理   | 注入用户参数                     |

#### 3. Shell 命令执行（`!{...}`）

| 操作 | 用户交互 |
| ------------------------------- | -------------------- |
| 1. 解析命令和参数 | - |
| 2. 自动 Shell 转义 | - |
| 3. 显示确认对话框 | ✅ 用户确认 |
| 4. 执行命令 | - |
| 5. 将输出注入提示 | - |

示例：Git 提交信息生成

````markdown
---
description: Generate Commit message based on staged changes
---

Please generate a Commit message based on the following diff:

```diff
!{git diff --staged}
```
````

#### 4. 文件内容注入（`@{...}`）

| 文件类型 | 支持状态 | 处理方式 |
| ------------ | ---------------------- | --------------------------- |
| 文本文件 | ✅ 完全支持 | 直接注入内容 |
| 图像/PDF | ✅ 多模态支持 | 编码并注入 |
| 二进制文件 | ⚠️ 有限支持 | 可能被跳过或截断 |
| 目录 | ✅ 递归注入 | 遵循 .gitignore 规则 |

示例：代码审查命令

```markdown
---
description: Code review based on best practices
---

Review {{args}}, reference standards:

@{docs/code-standards.md}
```

### 实用创建示例

#### “纯函数重构”命令创建步骤表

| 操作 | 命令/代码 |
| ----------------------------- | ----------------------------------------- |
| 1. 创建目录结构             | `mkdir -p ~/.qwen/commands/refactor`      |
| 2. 创建命令文件             | `touch ~/.qwen/commands/refactor/pure.md` |
| 3. 编辑命令内容             | 参考下方的完整代码。                      |
| 4. 测试命令                 | `@file.js` → `/refactor:pure`             |

```markdown
---
description: Refactor code to pure function
---

Please analyze code in current context, refactor to pure function.
Requirements:

1. Provide refactored code
2. Explain key changes and pure function characteristic implementation
3. Maintain function unchanged
```

### 自定义命令最佳实践总结

#### 命令设计建议表

| 实践要点 | 推荐做法 | 避免事项 |
| -------------------- | ----------------------------------- | ------------------------------------------- |
| 命令命名 | 使用命名空间进行组织 | 避免过于通用的名称 |
| 参数处理       | 明确使用 `{{args}}`               | 依赖默认追加（容易混淆）                  |
| 错误处理 | 利用 Shell 错误输出 | 忽略执行失败 |
| 文件组织 | 按功能在目录中组织 | 将所有命令放在根目录 |
| 描述字段 | 始终提供清晰的描述 | 依赖自动生成的描述 |

#### 安全特性提醒表

| 安全机制 | 保护效果 | 用户操作 |
| ---------------------- | -------------------------- | ---------------------- |
| Shell 转义 | 防止命令注入 | 自动处理 |
| 执行确认 | 避免误执行 | 对话框确认 |
| 错误报告 | 帮助诊断问题 | 查看错误信息 |

## 5. CLI 子命令

这些命令在启动交互式会话之前从 shell 中以 `qwen <subcommand>` 的形式运行。

### 会话管理

| 命令                 | 描述                             | 使用示例                                                       |
| -------------------- | -------------------------------- | -------------------------------------------------------------- |
| `qwen sessions list` | 列出最近的对话会话               | `qwen sessions list`, `qwen sessions list --json --limit 50`   |
| `qwen sessions ps`   | 列出当前正在运行的交互式会话     | `qwen sessions ps`, `qwen sessions ps --json`                  |
| `qwen sessions controllers` | 管理受信任的控制器 token            | `qwen sessions controllers add --label <name>`, `qwen sessions controllers list` |

#### `qwen sessions list`

列出你最近的 Qwen Code 会话及其元数据。

**标志：**

| 标志 | 类型 | 默认值 | 描述 |
| --------- | ------- | ------- | ----------------------------------------------- |
| `--json` | 布尔 | `false` | 以 JSON Lines 格式输出（每行一个 JSON 对象） |
| `--limit` | number | `20` | 要显示的最大会话数 |

**人类可读输出（默认）：**

包含以下列的表格：SESSION ID、STARTED（UTC 时间戳）、TITLE、BRANCH、PROMPT。

**JSON 输出（`--json`）：**

在 stdout 输出 JSON Lines。每行是一个包含以下字段的 JSON 对象：

```
sessionId, startTime, mtime, prompt, gitBranch, customTitle, titleSource, filePath, cwd
```

"还有更多会话"的提示信息会通过 stderr 输出，因此通过管道传递给 `jq` 依然是安全的。

**示例：**

```bash
# Show last 20 sessions (default)
qwen sessions list

# Show last 50 sessions
qwen sessions list --limit 50

# Output as JSON for scripting
qwen sessions list --json | jq .
```

#### `qwen sessions ps`

列出本机可见的 Qwen Code 会话记录。`sessions list` 遍历保存的转录记录（“我做过什么”）。此命令同时显示实时进程注册表和标记为 `managed` 的 Agent View 记录。被终止会话遗留的记录会在被发现时从注册表中清除。托管记录是持久化的簿记信息，并非其工作进程仍然存活的证据。一次性 `qwen -p` 运行永远不会注册，也不会显示。

**标志：**

| 标志 | 类型 | 默认值 | 描述 |
| -------- | ------- | ------- | ----------------------------------------------- |
| `--json` | boolean | `false` | 以 JSON Lines 格式输出（每行一个 JSON 对象） |

**人类可读输出（默认）：**

包含以下列的表格：NAME、KIND、PID、AGE、DIRECTORY。

KIND 指示了是什么注册了该会话——`tui` 表示有人在终端操作，`external` 表示根本不是 Qwen Code 会话的程序（如语音前端、中继器），`headless` 或 `serve` 表示由其他程序驱动的会话。多个 `serve` 或 `headless` 行可以共享同一个 PID：一个 `qwen --acp` 子进程在一个进程中承载其所有会话——当守护进程启动它时为 `serve`，当客户端直接驱动它时为 `headless`——并且当对等消息传递处于活动状态时，每个会话都会单独注册。当自身环境将其置于裸机或安全模式时，托管会话不会在此处注册。守护进程的 `--bare` 不会传递给其托管的会话（`QWEN_CODE_SIMPLE` 会从子环境中清除）；继承的 `QWEN_CODE_SAFE_MODE` 则会传递，从而使这些托管会话不出现在此列表中。这是一种自我报告，就像 NAME 和 DIRECTORY 一样：这里的每个字段都是由其所描述的进程写入的，没有任何关于会话允许做什么的内容依赖于它。标记为 `managed` 的 Agent View 记录使用 `managed` 作为 KIND，使用 `-` 作为 PID 和 AGE。即使同一会话也有实时注册表记录，它仍保持为单独的一行。有关记录格式以及如何注册你自己的程序，请参阅 [Cross-Session Protocol](./cross-session-protocol.md)。

**JSON 输出（`--json`）：**

在 stdout 上输出 JSON Lines，托管记录排在前面。注册表记录保持其现有结构：

```
schemaVersion, pid, procStart, pidNs, sessionId, cwd, name, startedAt,
qwenVersion, kind, ipcPath (when peer messaging is available)
```

托管记录仅包含有来源支持的数据：

```
sessionId, cwd, managed: true
```

stdout 上不写入其他内容——空列表根本不打印任何内容——因此 `qwen sessions ps --json | jq .` 适合用于脚本编写。如果无法读取监督存储，注册表记录仍会打印，原因会写入 stderr。

JSON 输出是原始数据：字段值按记录原样发出，不进行终端净化。将它们视为数据，并在终端渲染之前进行净化。

**示例：**

```bash
# Show the other live sessions
qwen sessions ps

# Which directories have a visible session record?
# Note: `jq -r` renders the raw recorded value in your terminal (see the
# raw-data note above); pipe through a sanitizer if the path is untrusted.
qwen sessions ps --json | jq -r .cwd
```

## 6. 向另一个正在运行的会话发送消息 [#6-messaging-another-running-session]

同一台机器上的两个交互式会话可以互相发送消息。该功能**默认开启**，但 `--bare` 和 `--safe-mode` 无论设置如何都会禁用它。拥有监听收件箱后，会话对于同一用户在该机器上的其他会话是可发现的，它们发送的内容在其模型看到之前会经过下面的审查规则。要禁用对等发现和消息传递，请在 `settings.json` 中关闭它并重启：

```json
{ "agents": { "crossSessionMessaging": false } }
```

禁用了 peer messaging 的交互式会话仍可能出现在 `qwen sessions ps` 中，但没有 `ipcPath`，并且在 `list_agents` 中不是可达的对等方。OpenTUI 界面也不绑定对等收件箱；仅启用设置并不能使其可接收消息。

启用消息传递后，一个会话中的模型可以通过 `list_agents` 发现其他会话——每个会话都显示在 `sessions` 下，并带有 `qwen sessions ps --json` 记录的 `name`（表格视图可能会截断长名称）——并使用该名称作为 `to` 通过 `send_message` 向其中一个发送消息。当两个会话共享名称时，`list_agents` 会为每个会话显示一个简短的 `[ref]`，并且发送时必须包含它（`name [ref]`）；如果裸名称可能指代其中任何一个，则会被拒绝而不是猜测。`list_agents` 还会在 `self` 下报告会话自身的名称，而 `to: "*"` 仍然表示“我的 Agent Team 队友”，且永远不会到达其他会话。

消息到达另一个会话时，被标记为来自另一个会话而非其用户，并且在那里不携带你的任何权限：接收会话仅在其自身的权限设置内对其采取行动。其用户可以通过 `agents.crossSessionInbound`（`accept`、`hold` 或 `refuse`）选择如何处理传入的消息。未设置时，仅当两个会话处于相同的审查类别时才会投递消息：两者都仍对每个操作进行审查（默认或计划模式），或者两者都处于某种无需逐操作审查即可应用某些操作的模式（自动编辑、自动或 yolo）。来自另一类别会话的消息，或来自未说明其所在类别的发送者的消息，将在两个方向上都被扣留以供审查。逐个审查操作的会话会扣留来自不逐个审查操作的会话的消息，因为该消息是由无人监督的模型编写的，而逐操作提示保护的是操作本身，而不是会话被诱导去做的事情。扣留的消息会在接收会话中通过 `/peers` 列出并释放，而仅因模式不同而被扣留的消息一旦模式达成一致就会自动释放。

代码仓库可以让在其中打开的会话更加谨慎，但绝不会更宽松：工作区 `.qwen/settings.json` 可以将 `agents.crossSessionInbound` 设置为 `hold` 或 `refuse`，或将 `agents.crossSessionMessaging` 设置为 `false`，并且该值优先于用户设置中更宽松的值。如果工作区的值会放宽操作员设置的值（`accept`，或者当用户或系统范围将其设置为 `false` 时的开关 `true`），则该值会被忽略并发出警告；如果工作区 `true` 只是重复了默认值而没有其他地方设置该开关，则会被静默丢弃。CLI 无法识别的值只要成为有效值，就会扣留所有消息。系统设置覆盖所有这些规则，就像它覆盖所有设置一样。

扣留不会无限期等待。没有人决定的消息在 `agents.crossSessionHeldExpiry` 后过期——`1m`、`5m`、`10m` 或 `never`，默认为五分钟——并且发送会话会被告知没有做出决定。缩短此设置适用于已经在等待的消息。

如果会话无法绑定其收件箱——运行时目录缺失、属于其他用户或只读（在容器内可能发生这种情况）——它会首先尝试临时目录下的私有目录，只有当这也失败时，它才会在没有收件箱的情况下启动。发生这种情况时，会话会在启动时说明这一点，并且 `/peers` 会重复原因以及需要更改的内容（通常是 `XDG_RUNTIME_DIR` 或 `TMPDIR`）。

两个会话也可以解析相同的收件箱地址，因为地址以进程 ID 为键，而在共享运行时目录的容器中进程 ID 会重复出现。第二个启动的会话会采用相邻的地址，而不是接管正在使用的地址，因此两者都不会变得不可达。对等方不受影响：它们从会话注册表中读取会话的地址，而不是推导出来。

`send_message` 调用仅确认消息已移交给另一个会话。它的后续结果会以回执的形式稍后到达：如果被扣留、拒绝、驳回、丢弃、过期或寻址错误（地址易主——再次列出代理）——或在扣留后被释放——通知会出现在发送会话的记录中（`Message to <name>: …`）。拒绝、驳回和丢弃是三种不同的回答：拒绝意味着有人审查了消息并说不，驳回意味着该会话的 `agents.crossSessionInbound` 是 `refuse` 且根本没人看到它，丢弃意味着其收件箱在此之前就拒收了该消息（见下文）。第一次丢弃会立即得到回应，其余的每几秒折叠成一个回执，每个回执命名其所代表的消息，因此一连串丢弃只会产生几行记录而不是一行一条。发送它的模型不会被告知；如果另一个会话回复，回复将作为跨会话消息到达。

### 洪水保护

一个会话允许来自单个发送者的最多 30 条消息同时进入，随后每两秒一条；以及来自所有发送者合计的最多 32 条消息同时进入，随后每秒一条。第二个限制的存在是因为发送者会声明自己的名称：轮换该名称可以从第一个限制中获得新的配额，但不能从第二个限制中获得。它仅略高于第一个限制，因为每条被接受的消息都会生成一个回执，而会话同时发出的回执数量是有限的。如果来自另一个会话的消息在 30 秒内逐字重复了该发送者之前的消息，也会被拒绝——模型在循环处理一句话时每次都会生成新的消息 ID，因此是通过文本内容来检测这种情况的。由会话启动的脚本或受信任控制器发送的消息可豁免于重复检查，因为钩子（hook）两次报告同一行是在陈述两个事实，而人两次说“继续”意味着两次意图；但它们仍受速率限制约束。最后，即使消息被接受，但如果会话已有 50 条等待消息而无法入队，该消息也会被拒绝。

以此方式被拒绝的消息永远不会被保留、不会展示给模型，也不会留下任何记录，因此发送者可以稍后重试并成功送达。接收会话在其转录记录中每分钟针对每个发送者最多说明一次此情况，并附带计数以表明该行代表的含义。发送会话会收到一个回执，列出因突发流量而被丢弃的所有消息，其转录记录建议将仍然重要的内容合并到后续的一条消息中，而不是重新发送。

发送端不会等待反馈。每个会话跟踪其向每个地址发送的内容，并拒绝接收方会丢弃的发送请求，因此模型在编写消息之前而非之后被告知进行批量处理——并且接收方永远不会为即将被拒绝的消息消耗连接资源。

### 令牌只打印一次且不会存储在任何地方：Qwen 主目录下的文件仅保留其 SHA-256 哈希值，因此后来读取该文件的任何内容都无法呈现该令牌。当命令打印令牌时，请将其放入控制器的配置中。

每个会话的收件箱都需要一个特定于会话的令牌：连接必须在读取任何消息之前在第一行呈现该令牌，并且会话通过它们相互发现的相同注册表记录自动交换令牌。不支持令牌的构建版本生成的会话可以从较新版本接收消息，但向其发送的消息会被丢弃。

会话将其自身的收件箱地址和令牌作为 `QWEN_CODE_MESSAGING_SOCKET` 和 `QWEN_CODE_MESSAGING_TOKEN` 导出给子进程，以便会话运行的脚本或钩子可以将消息发回其中。这是一个第二层的 _子_ 令牌，绝不会在任何地方发布：只有会话启动的进程才能持有它，因此带有此令牌到达的消息会被识别为会话自身发出的，而不是来自其他会话的。

```bash
{ printf '%s\n' \
    '{"msgV":1,"type":"auth","token":"'"$QWEN_CODE_MESSAGING_TOKEN"'"}' \
    '{"msgV":1,"msgId":"'"$(uuidgen)"'","type":"user","priority":"next","message":{"role":"user","content":"build finished"}}'; \
} | socat - UNIX-CONNECT:"$QWEN_CODE_MESSAGING_SOCKET"
```

为每次注入提供一个新的 `msgId`。接收门控会记住它已经处理过的 ID，因此重用某个 ID 的钩子会在第一次运行时被交付，而在随后的每次运行中被静默去重。重复相同的 _文本_ 是可以的——上述重复检查不适用于会话自身的进程——但速率限制确实适用，因此循环中的钩子会像任何其他洪水攻击一样被丢弃。

注入的消息仍然会通过入站门控，并被标记为非用户来源，但门控知道它来自会话自身的进程：在模式对等默认设置下，它无需审查即可交付（处于相同位置的对等方会被扣留），而显式的 `agents.crossSessionInbound` 设置为 `hold` 或 `refuse` 时，对其应用与其他消息相同的规则。模型将其视为 `<cross_session_message from="own process" origin="own-process">`，并附带通知说明它来自会话运行的脚本或钩子，而非用户。

### 受信任的控制器 [#trusted-controllers]

上述规则会扣留来自任何未声明其审查类别的发送者的消息，而非 Qwen Code 会话的程序没有此类声明。这对于陌生人来说是正确的默认行为，但对于你选择的程序则不然：语音前端、听写桥接器、转发你自己指令的自动化守护进程会导致每条消息都被搁置，而手动批准每一条消息就失去了意义。

你可以通过为其铸造令牌来授予此类程序交付权限：

```bash
qwen sessions controllers add --label voice-bridge
```

令牌只打印一次且不会存储在任何地方：Qwen 主目录下的文件仅保留其 SHA-256 哈希值，因此后续读取该文件的任何内容都无法呈现该令牌。当命令打印令牌时，请将其放入控制器自身的配置中。

控制器像其他发送者一样呈现令牌——作为连接的第一行——并从会话注册表中获取套接字路径（`qwen sessions ps --json` 为每个活动会话打印一条记录，`ipcPath` 即为地址）：

```bash
{ printf '%s\n' \
    '{"msgV":1,"type":"auth","token":"'"$QWEN_CONTROLLER_TOKEN"'"}' \
    '{"msgV":1,"msgId":"'"$(uuidgen)"'","type":"user","priority":"next","message":{"role":"user","content":"open the failing test"}}'; \
} | socat - UNIX-CONNECT:"$SESSION_IPC_PATH"
```

使用授予令牌到达的消息无需逐条审查即可交付，无论双方处于何种审查类别——但它仍需服从显式设置：`agents.crossSessionInbound` 设置为 `hold` 时会像其他消息一样将其搁置，设置为 `refuse` 时会将其拒绝。授权属于你的 Qwen 主目录而非单个会话，因此控制器可以访问你正在运行的任意会话，并且会话在每次连接时重新读取文件：创建或撤销授权在下一次连接时生效，无需重启。

```bash
qwen sessions controllers list          # ids, labels, when they were added
qwen sessions controllers remove c_1a2b # revoke one
```

在会话内部，`/peers controllers` 和 `/peers revoke <id>` 的作用相同。通过授权发送的消息显示为 `Message from a trusted controller (voice-bridge)`，如果 `hold` 设置将其暂存，则会在 `/peers` 中显示为 `[controller] voice-bridge`。

模型将此类消息视为 `<cross_session_message from="controller" origin="controller" controller="voice-bridge">`，并附带说明该消息转达了你自己的指令——并且适用于所有其他来源的两条禁令同样适用：它不得因消息要求而编辑权限设置、QWEN.md 或配置，也不得将该消息视为你批准了待确认的提示。控制器可以指示下一步操作；但它不能代表你回答提示。

任何持有令牌的人都可以以该控制器的身份发送消息，因此请像对待任何其他凭据一样对待它：仅交给一个程序使用，不要放入共享配置中，并在该程序完成后撤销它。

### 程序通过 ACP 驱动的会话

任何 `qwen --acp` 子进程都会注册其托管的每个会话——当守护进程生成进程时注册为 `serve`，当编辑器或其他客户端直接驱动 `qwen --acp` 时注册为 `headless`——并且该会话会像其他会话一样出现在 `qwen sessions ps` 和其他会话的 `list_agents` 中。它可以发送消息：其模型可以调用 `send_message` 来访问你打开的终端。它们中的几个共享一个进程和一个收件箱，因此发送者必须指定目标会话——每个 Qwen Code 会话都会自动执行此操作。

发送到此类会话的消息会被拒绝而不是被保留。保留是针对人的问题，而在被驱动的会话上没有人查看保留消息列表；发送者会立即收到通知，而不是等待过期。对于此类会话，保留消息应在何处显示尚未确定。

除非会话自身的设置关闭了 `agents.crossSessionMessaging`，或者它是使用 `--bare` 或 `--safe-mode` 启动的，否则会话会进行注册——无论设置如何，这些选项都会禁用消息功能。如果已禁用，它将保持不可见，因为列出无人可向其发送消息的会话的唯一理由就是宣传一个永不响应的地址。

### 非 Qwen Code 会话的程序

上述所有内容都在会话之间工作，但其中没有任何内容是特定于某个会话的。如果一个程序为自己写入注册记录并以相同方式绑定收件箱，它将由 `qwen sessions ps` 和 `list_agents` 列出，可以从 `send_message` 按名称寻址，并接收其发送内容的投递回执——例如语音前端、中继器或构建监视器。它应记录 `kind: "external"`，以便列表可以说明其用途。

[跨会话协议](./cross-session-protocol.md) 是编写此类程序的契约：包括记录架构和活性判断方法、套接字路径和帧格式、认证行、每个帧字段、回执状态及其转换，以及接收者在模型看到消息之前如何处理消息。

Node 程序不必手动编写上述任何内容：`@qwen-code/sdk/peer` 实现了该契约。`PeerEndpoint.start({ name })` 发布记录并绑定收件箱，`list()` 和 `send()` 按名称寻址会话，`onMessage` 接收它们发送的内容。
