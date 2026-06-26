# 命令

本文档详细介绍了 Qwen Code 支持的所有命令，帮助你高效管理会话、自定义界面以及控制其行为。

Qwen Code 命令通过特定前缀触发，分为三类：

| 前缀类型                  | 功能说明                                | 典型使用场景                               |
| ------------------------- | --------------------------------------- | ------------------------------------------ |
| 斜杠命令 (`/`)            | 对 Qwen Code 自身的元级别控制           | 管理会话、修改设置、获取帮助               |
| At 命令 (`@`)             | 快速将本地文件内容注入到对话中           | 让 AI 分析指定文件或目录下的代码           |
| 感叹号命令 (`!`)          | 直接与系统 Shell 交互                   | 执行系统命令，如 `git status`、`ls` 等     |

## 1. 斜杠命令 (`/`)

斜杠命令用于管理 Qwen Code 会话、界面和基本行为。

### 1.1 会话和项目管理

这些命令帮助你保存、恢复和总结工作进度。

| 命令                 | 说明                                             | 使用示例                                                                 |
| -------------------- | ------------------------------------------------ | ------------------------------------------------------------------------ |
| `/init`              | 分析当前目录并创建初始上下文文件                 | `/init`                                                                  |
| `/summary`           | 根据对话历史生成项目总结                         | `/summary`                                                               |
| `/compress`          | 用摘要替换聊天历史以节省 Token                   | `/compress` 或 `/summarize`                                              |
| `/compress-fast`     | 快速压缩（无需 AI）—— 去除旧工具输出和推理部分   | `/compress-fast`                                                         |
| `/resume`            | 恢复之前的对话会话                               | `/resume` 或 `/continue`                                                 |
| `/recap`             | 立即生成一行会话回顾                             | `/recap`                                                                 |
| `/restore`           | 将项目文件恢复到工具调用运行前的检查点           | `/restore`（列出）或 `/restore <ID>`                                     |
| `/delete`            | 删除之前的会话                                   | `/delete`                                                                |
| `/branch`            | 将当前对话分支到新会话中                         | `/branch`                                                                |
| `/fork`              | 衍生一个后台代理，继承完整对话                   | `/fork <directive>`                                                      |
| `/rewind`            | 回滚对话到之前的轮次                             | `/rewind` 或 `/rollback`                                                 |
| `/export`            | 将会话历史导出到文件                             | `/export html`, `/export md`, `/export json`, `/export jsonl`            |
| `/rename`            | 重命名或标记当前会话                             | `/rename My Feature` 或 `/tag`                                           |

> [!note]
>
> `/summarize` 是 `/compress` 的别名（它会压缩聊天历史——这是一个破坏性操作）。如需生成非破坏性的项目总结，请使用 `/summary`。

### 1.2 界面和工作区控制

调整界面外观和工作环境的命令。

| 命令                 | 说明                                                                                                                           | 使用示例                                                                             |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------ |
| `/clear`             | 清除对话历史并释放上下文                                                                                                       | `/clear`, `/reset`, `/new`                                                           |
| `/context`           | 显示上下文窗口占用情况                                                                                                         | `/context`                                                                            |
| → `detail`           | 显示逐项上下文占用情况                                                                                                         | `/context detail`                                                                     |
| `/history`           | 控制历史显示偏好和可见性                                                                                                       | `/history collapse-on-resume`, `/history expand-on-resume`, `/history expand-now`     |
| `/diff`              | 打开交互式 diff 查看器，显示未提交的更改和每轮 diff。使用 ←/→ 切换当前 git diff 和单个对话轮次，↑/↓ 浏览文件                 | `/diff`                                                                               |
| `/theme`             | 更改 Qwen Code 视觉主题                                                                                                        | `/theme`                                                                              |
| `/vim`               | 开启/关闭输入区 Vim 编辑模式                                                                                                   | `/vim`                                                                                |
| `/voice`             | 切换语音听写输入                                                                                                               | `/voice`, `/voice hold`, `/voice tap`, `/voice off`, `/voice status`                  |
| `/directory`         | 管理多目录支持的工作区                                                                                                         | `/dir add ./src,./tests`, `/dir show`                                                 |
| `/cd`                | 将会话移至新的工作目录                                                                                                         | `/cd ../other-project`                                                                |
| `/editor`            | 打开选择支持编辑器的对话框                                                                                                     | `/editor`                                                                             |
| `/statusline`        | 打开交互式[状态行](./status-line.md)预设对话框                                                                                 | `/statusline`                                                                         |
| `/statusline <text>` | 通过代理生成命令模式[状态行](./status-line.md)                                                                                  | `/statusline show model and git branch`                                               |
| `/terminal-setup`    | 配置终端快捷键以实现多行输入                                                                                                   | `/terminal-setup`                                                                     |

### 1.3 语言设置

专门控制界面和输出语言的命令。

| 命令                      | 说明                         | 使用示例                        |
| ------------------------- | ---------------------------- | ------------------------------- |
| `/language`               | 查看或更改语言设置           | `/language`                     |
| → `ui [language]`         | 设置界面语言                 | `/language ui zh-CN`            |
| → `output [language]`     | 设置 LLM 输出语言            | `/language output Chinese`      |

- 内置支持的界面语言：`zh-CN`（简体中文）、`en-US`（英语）、`ru-RU`（俄语）、`de-DE`（德语）、`ja-JP`（日语）、`pt-BR`（葡萄牙语 - 巴西）、`fr-FR`（法语）、`ca-ES`（加泰罗尼亚语）
- 输出语言示例：`Chinese`（中文）、`English`（英语）、`Japanese`（日语）等

### 1.4 工具和模型管理

管理 AI 工具和模型的命令。

| 命令                  | 说明                                   | 使用示例                                                                                                                     |
| --------------------- | -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `/mcp`                | 列出已配置的 MCP 服务器和工具          | `/mcp`, `/mcp desc`, `/mcp nodesc`, `/mcp schema`                                                                            |
| `/import-config`      | 从 Claude 配置导入 MCP 服务器          | `/import-config all`, `/import-config claude-code`, `/import-config claude-desktop --scope user\|project`                     |
| `/tools`              | 显示当前可用工具列表                   | `/tools`, `/tools desc`                                                                                                      |
| `/skills`             | 列出并运行可用的技能                   | `/skills`, `/skills <name>`                                                                                                  |
| `/plan`               | 切换到计划模式或退出计划模式           | `/plan`, `/plan <task>`, `/plan exit`                                                                                        |
| `/approval-mode`      | 更改工具审批模式（仅当前会话）         | `/approval-mode`, `/approval-mode auto-edit`                                                                                 |
| → `plan`              | 仅分析，不执行（安全审查）             | `/approval-mode plan`                                                                                                        |
| → `default`           | 编辑需审批（日常使用）                 | `/approval-mode default`                                                                                                     |
| → `auto-edit`         | 自动批准编辑（受信任环境）             | `/approval-mode auto-edit`                                                                                                   |
| → `auto`              | 分类器评估的审批（自主模式）           | `/approval-mode auto`                                                                                                        |
| → `yolo`              | 自动批准所有操作（快速原型设计）       | `/approval-mode yolo`                                                                                                        |
| `/model`              | 切换当前会话使用的模型                 | `/model`, `/model <model-id>`（立即切换）                                                                                    |
| `/model --fast`       | 为提示建议设置轻量模型                 | `/model --fast qwen3-coder-flash`                                                                                            |
| `/model --voice`      | 设置用于语音转录的模型                 | `/model --voice <model-id>`                                                                                                  |
| `/extensions`         | 管理扩展                               | `/extensions list`, `/extensions manage`                                                                                     |
| → `list`              | 列出已安装扩展                         | `/extensions list`                                                                                                           |
| → `manage`            | 管理已安装扩展（交互式）               | `/extensions manage`                                                                                                         |
| → `explore`           | 在浏览器中打开扩展页面                 | `/extensions explore <Gemini\|ClaudeCode>`                                                                                    |
| → `install`           | 从 git 仓库或路径安装扩展              | `/extensions install <repo-or-path>`                                                                                         |
| `/memory`             | 打开记忆管理器对话框                   | `/memory`                                                                                                                    |
| `/remember`           | 保存持久记忆                           | `/remember Prefer terse responses`                                                                                           |
| `/forget`             | 从自动记忆中移除匹配条目               | `/forget <query>`                                                                                                            |
| `/dream`              | 手动运行自动记忆整合                   | `/dream`                                                                                                                     |
| `/hooks`              | 管理 Qwen Code hooks                   | `/hooks`, `/hooks list`                                                                                                      |
| `/permissions`        | 管理权限规则                           | `/permissions`                                                                                                               |
| `/agents`             | 管理子代理                             | `/agents manage`, `/agents create`                                                                                           |
| `/arena`              | 管理 Arena 会话                        | `/arena start`, `/arena stop`, `/arena status`, `/arena select`（别名 `choose`）                                             |
| `/goal`               | 设置目标 —— 持续工作直到条件满足       | `/goal <condition>`, `/goal clear`                                                                                           |
| `/tasks`              | 列出后台任务                           | `/tasks`                                                                                                                     |
| `/workflows`          | 检查工作流运行                         | `/workflows`, `/workflows <runId>`                                                                                           |
| `/lsp`                | 显示 LSP 服务器状态                    | `/lsp`                                                                                                                       |
| `/trust`              | 管理文件夹信任设置                     | `/trust`                                                                                                                     |

> [!warning]
>
> 仅从你信任的源安装扩展（`/extensions install`）。扩展可能捆绑 MCP 服务器、技能和命令，这些组件拥有与 Qwen Code 本身相同的权限——它们可以访问你的文件、API 密钥和对话数据。`/extensions install` 不会提示确认。

> [!warning]
>
> `auto-edit`、`auto` 和 `yolo` 审批模式会绕过工具执行的审批提示。在 `yolo` 模式下，所有操作（包括 shell 命令、文件写入和网络请求）都将无确认直接运行。仅在受信任、沙盒化或一次性环境中使用这些模式。

> [!note]
>
> `/workflows`、`/lsp` 和 `/trust` 仅在其对应功能启用时注册——分别通过环境变量 `QWEN_CODE_ENABLE_WORKFLOWS=1`、CLI 标志 `--experimental-lsp` 和设置 `security.folderTrust.enabled`。禁用时它们不会出现，并会报告为未知命令。

### 1.5 内置技能

这些命令调用内置技能，提供专门的工作流。

| 命令          | 说明                                                         | 使用示例                                                |
| ------------- | ------------------------------------------------------------ | ------------------------------------------------------- |
| `/review`     | 使用 5 个并行代理 + 确定性分析审查代码变更                  | `/review`, `/review 123`, `/review 123 --comment`       |
| `/loop`       | 按重复计划运行提示                                           | `/loop 5m check the build`                              |
| `/simplify`   | 审查最近的更改，并直接应用安全清理编辑                       | `/simplify`, `/simplify focus on duplication`           |
| `/qc-helper`  | 回答关于 Qwen Code 使用和配置的问题                          | `/qc-helper how do I configure MCP?`                    |

完整 `/review` 文档请参见 [代码审查](./code-review.md)。

### 1.6 旁路问题 (`/btw`)

`/btw` 命令允许你快速询问旁路问题，而不会中断或影响主对话流程。

| 命令                      | 说明                   |
| ------------------------- | ---------------------- |
| `/btw <your question>`    | 快速提出旁路问题       |
| `?btw <your question>`    | 旁路问题的替代语法     |

**工作原理：**

- 旁路问题作为一个独立的 API 调用发送，携带最近的对话上下文（最多最近 20 条消息）
- 响应显示在 Composer 上方——你可以在等待时继续输入
- 主对话**不会被阻塞**——它独立继续
- 旁路问题的响应**不会**成为主对话历史的一部分
- 答案以完整 Markdown 格式呈现（支持代码块、列表、表格等）

**键盘快捷键（交互模式）：**

| 快捷键              | 操作                                           |
| ------------------- | ---------------------------------------------- |
| `Escape`            | 取消（加载中）或关闭（完成后）                 |
| `Space` 或 `Enter`  | 关闭答案（输入为空时）                         |
| `Ctrl+C` 或 `Ctrl+D`| 取消正在进行的旁路问题                         |

**示例：**

```
（当主对话正在讨论代码重构时）

> /btw What's the difference between let and var in JavaScript?

  ╭──────────────────────────────────────────╮
  │ /btw What's the difference between let   │
  │     and var in JavaScript?               │
  │                                          │
  │ + Answering...                           │
  │ Press Escape, Ctrl+C, or Ctrl+D to cancel│
  ╰──────────────────────────────────────────╯
  > （Composer 保持活动——继续输入）

（答案到达后）

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
  > （Composer 仍然活动）
```
**支持的执行模式：**

| 模式                  | 行为                                             |
| -------------------- | ------------------------------------------------ |
| 交互式               | 在 Composer 上方显示，带 Markdown 渲染               |
| 非交互式             | 返回文本结果：`btw> 问题\n答案`                     |
| ACP（代理协议）       | 返回 stream_messages 异步生成器                     |

> [!tip]
>
> 当需要快速答案但不想打断主要任务时，使用 `/btw`。它特别适合在专注于主要工作流的同时，澄清概念、核实事实或获取快速解释。

### 1.7 会话回顾（`/recap`）

`/recap` 命令会生成当前会话的简短“上次进度”摘要，这样你可以在不滚动浏览历史记录的情况下恢复旧会话。

| 命令     | 描述                                     |
| -------- | ---------------------------------------- |
| `/recap` | 生成并显示一行会话回顾摘要                   |

**工作原理：**

- 使用配置的快速模型（`fastModel` 设置），如果有的话，否则回退到主会话模型。一个小型、廉价的模型就足够生成回顾。
- 最近的对话（最多 30 条消息，仅文本——工具调用和工具响应会被过滤掉）连同紧凑的系统提示一起发送给模型。
- 回顾以暗色显示，并带有 `❯` 前缀，使其与真实的助手回复区分开来。
- 如果模型正在响应或另一个命令正在处理中，则会以内联错误形式拒绝。如果没有可用的对话，或者底层生成失败，`/recap` 会显示一条简短信息而非回顾——手动命令始终会返回一些内容。

**离开后返回时自动触发：**

如果终端失去焦点 **5 分钟以上** 并重新获得焦点，系统会自动生成并显示回顾（仅当没有模型响应正在进行时；否则会等待当前响应完成后触发）。与手动命令不同，自动触发在失败时完全静默：如果生成出错或没有可总结的内容，则不会在历史中添加任何消息。可通过 `general.showSessionRecap` 设置控制（默认：`false`）；手动 `/recap` 命令始终可用，不受此设置影响。

**示例：**

```
> /recap

❯ 重构 loopDetectionService.ts 以解决由未限定的 streamContentHistory 和 contentStats 导致的长时间会话 OOM 问题。下一步是实现方案 B（基于 FNV-1a 的 LRU 滑动窗口），待确认。
```

> [!tip]
>
> 通过 `/model --fast <model>`（例如 `qwen3-coder-flash`）配置快速模型，可使 `/recap` 快速且廉价。设置 `general.showSessionRecap` 为 `true` 以启用自动触发；手动 `/recap` 命令始终可用，不受此设置影响。

### 1.8 差异查看器（`/diff`）

`/diff` 命令打开一个交互式差异查看器，显示未提交的更改和每次对话回合的差异。使用 ←/→ 在当前的 git diff 和各个对话回合之间切换，↑/↓ 浏览文件，Enter 查看内联差异。

**工作原理：**

在交互模式下，`/diff` 打开一个对话框，顶部有一个**源选择器**：

- **Current** — 工作树与 HEAD 的差异（`git diff HEAD`）。显示所有未提交的更改，包括已暂存、未暂存和未跟踪的文件。
- **T1、T2、T3、…** — 每次模型回合的差异，每个修改文件的模型回合对应一个标签页。最近的回合显示在前面。每个标签页显示原始提示的预览作为上下文。

文件列表显示每个文件的统计信息（添加/删除的行数），并带有特殊状态标签（`new`、`deleted`、`untracked`、`binary`、`truncated`、`oversized`）。在文件上按 Enter 可查看其内联差异，带有语法高亮的代码块。

每个回合的差异需要启用文件检查点（在交互模式下默认启用）。当文件检查点关闭时，只有“Current”源可用。

**键盘快捷键：**

| 键          | 操作                     |
| ----------- | ------------------------ |
| `←` / `→`   | 在源之间切换（Current / T1 / T2…） |
| `↑` / `↓`   | 浏览文件列表             |
| `j` / `k`   | 浏览文件列表（vim 风格）   |
| Enter       | 查看所选文件的内联差异     |
| `←` / Esc   | 从内联差异视图返回文件列表 |
| Esc         | 关闭对话框               |

**示例：**

```
┌ /diff · 回合 3 "重构认证中间件" ──── 3 个文件 +45 -12 ┐
│                                                                     │
│ ◀ Current · T3 · T2 · T1 ▶                                         │
│                                                                     │
│ › src/utils/parser.ts                              +30 -8           │
│   src/utils/parser.test.ts                         +12 -2           │
│   README.md                                        +3 -2            │
│                                                                     │
│ ←/→ 源 · ↑/↓ 文件 · Enter 查看 · Esc 关闭                          │
└─────────────────────────────────────────────────────────────────────┘
```

**非交互模式：**

在 headless（`--prompt`）或非交互上下文中，`/diff` 会打印工作树与 HEAD 的纯文本摘要。无法按回合导航。

```
3 个文件已更改，+45 / -12
  +30  -8  src/utils/parser.ts
  +12  -2  src/utils/parser.test.ts
   +3  -2  README.md
```

### 1.9 信息、设置与帮助

用于获取信息和进行系统设置的命令。

| 命令              | 描述                                                                                             | 使用示例                                                                                     |
| ---------------- | ------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------- |
| `/help`          | 显示可用命令的帮助信息                                                                             | `/help` 或 `/?`                                                                              |
| `/status`        | 显示版本信息                                                                                     | `/status` 或 `/about`                                                                        |
| `/status paths`  | 显示当前会话文件和日志路径                                                                         | `/status paths`                                                                              |
| `/stats`         | 打开交互式使用统计仪表盘（会话、活动和效率标签页）                                                 | `/stats` 或 `/usage`                                                                         |
| `/stats model`   | 显示每个模型的 token 消耗明细和预估成本                                                             | `/stats model`                                                                               |
| `/stats tools`   | 显示每个工具的调用次数                                                                             | `/stats tools`                                                                               |
| `/stats skills`  | 显示当前实时会话中每个技能的调用次数（仅实时会话；不包括跨会话的每日/每月活动）                       | `/stats skills`                                                                              |
| `/stats daily`   | 显示每日 token 使用统计                                                                           | `/stats daily`（别名 `day`），`/stats day [YYYY-MM-DD]`                                      |
| `/stats monthly` | 显示每月 token 使用统计                                                                           | `/stats monthly`（别名 `month`），`/stats month [YYYY-MM]`                                   |
| `/stats export`  | 将使用统计导出为 CSV 或 JSON 格式                                                                  | `/stats export <daily|monthly> [date|month] [--format csv|json] [--output path]`             |
| `/settings`      | 打开设置编辑器                                                                                    | `/settings`                                                                                  |
| `/auth`          | 更改认证方法                                                                                      | `/auth`、`/connect`、`/login`                                                               |
| `/doctor`        | 运行安装和环境诊断                                                                                | `/doctor`、`/doctor memory`                                                                  |
| → `memory`       | 显示当前进程内存诊断信息                                                                           | `/doctor memory [--json] [--sample] [--snapshot]`                                            |
| → `cpu-profile`  | 录制 CPU 性能分析文件供 Chrome DevTools 分析                                                       | `/doctor cpu-profile [--duration <秒>]`                                                      |
| → `rollback`     | 将独立 CLI 二进制文件回退到上一版本（仅限独立安装；如需回退对话历史，请使用 `/rewind`）              | `/doctor rollback`                                                                           |
| `/docs`          | 在浏览器中打开完整的 Qwen Code 文档                                                                 | `/docs`                                                                                      |
| `/ide`           | 管理 IDE 集成                                                                                     | `/ide status`、`/ide install`、`/ide enable`、`/ide disable`                                 |
| `/insight`       | 从聊天历史生成编程洞察                                                                              | `/insight`                                                                                   |
| `/setup-github`  | 设置 GitHub Actions                                                                               | `/setup-github`                                                                              |
| `/bug`           | 提交关于 Qwen Code 的问题                                                                          | `/bug 按钮点击无响应`                                                                        |
| `/copy`          | 复制到剪贴板：回复（倒数第 N 条）、代码（按语言）、LaTeX 或 Mermaid                                 | `/copy`、`/copy 2`、`/copy python`、`/copy latex`、`/copy mermaid`                          |
| `/quit`          | 立即退出 Qwen Code                                                                                | `/quit` 或 `/exit`                                                                           |

> [!warning]
>
> `/doctor memory --snapshot` 写出的 V8 堆快照可能包含当前会话的提示、文件内容、API key 和工具结果。分享前请检查文件内容。

### 1.10 常见快捷键

| 快捷键                | 功能             | 说明                                                                 |
| -------------------- | ---------------- | -------------------------------------------------------------------- |
| `Ctrl/cmd+L`         | 清屏             | 仅清除可见屏幕（不会像 `/clear` 那样重置会话）                          |
| `Ctrl/cmd+T`         | 切换工具描述      | MCP 工具管理                                                         |
| `Ctrl/cmd+C`×2       | 退出确认         | 安全退出机制                                                         |
| `Ctrl/cmd+Z`         | 撤销输入         | 文本编辑                                                             |
| `Ctrl/cmd+Shift+Z`   | 重做输入         | 文本编辑                                                             |

### 1.11 认证命令

在 Qwen Code 会话中使用 `/auth` 配置认证。使用 `/doctor` 检查当前认证和环境状态。

| 命令     | 描述                                      |
| -------- | ----------------------------------------- |
| `/auth`  | 交互式配置认证（别名：`/connect`、`/login`） |
| `/doctor` | 显示认证和环境检查结果                      |

> [!note]
>
> 独立的 `qwen auth` CLI 命令已被移除。旧调用方式如 `qwen auth status` 会打印移除通知并提供迁移指南。详情请参阅[认证](../configuration/auth)页面。

## 2. @ 命令（引入文件）

@ 命令用于快速将本地文件或目录内容添加到对话中。

| 命令格式             | 描述                             | 示例                                               |
| ------------------- | -------------------------------- | -------------------------------------------------- |
| `@<文件路径>`        | 注入指定文件的内容                 | `@src/main.py 请解释这段代码`                      |
| `@<目录路径>`        | 递归读取目录中所有文本文件           | `@docs/ 总结这个文档的内容`                        |
| 单独的 `@`          | 用于讨论 `@` 符号本身               | `@ 这个符号在编程中有什么用途？`                   |

注意：路径中的空格需要用反斜杠转义（例如 `@My\ Documents/file.txt`）

## 3. 感叹号命令（`!`）- Shell 命令执行

感叹号命令允许你在 Qwen Code 中直接执行系统命令。

| 命令格式            | 描述                                              | 示例                        |
| ------------------ | ------------------------------------------------- | --------------------------- |
| `!<shell 命令>`     | 在子 Shell 中执行命令                               | `!ls -la`、`!git status`     |
| 单独的 `!`         | 切换 Shell 模式，任何输入都将直接作为 Shell 命令执行  | `!`（回车）→ 输入命令 → `!`（退出） |

环境变量：通过 `!` 执行的命令会设置 `QWEN_CODE=1` 环境变量。

## 4. 自定义命令

将常用提示保存为快捷命令，以提高工作效率并确保一致性。

> [!note]
>
> 自定义命令现在使用 Markdown 格式，并支持可选的 YAML 前置元数据。TOML 格式已弃用，但为了向后兼容仍然支持。当检测到 TOML 文件时，会显示自动迁移提示。

### 快速概览

| 功能       | 描述                     | 优势                       | 优先级 | 适用场景                         |
| ---------- | ------------------------ | -------------------------- | ------ | -------------------------------- |
| 命名空间   | 子目录创建带冒号的命令     | 更好的命令组织             |        |                                  |
| 全局命令   | `~/.qwen/commands/`      | 在所有项目中可用           | 低     | 个人常用命令，跨项目使用           |
| 项目命令   | `<项目根目录>/.qwen/commands/` | 项目专属，可版本控制       | 高     | 团队共享，项目特定命令             |

优先级规则：项目命令 > 用户命令（同名时使用项目命令）

### 命令命名规则

#### 文件路径到命令名称的映射表

| 文件位置                                 | 生成的命令     | 调用示例                  |
| ---------------------------------------- | -------------- | ------------------------- |
| `~/.qwen/commands/test.md`               | `/test`        | `/test 参数`              |
| `<项目>/.qwen/commands/git/commit.md`    | `/git:commit`  | `/git:commit 提交信息`    |

命名规则：路径分隔符（`/` 或 `\`）转换为冒号（`:`）

### Markdown 文件格式规范（推荐）

自定义命令使用带有可选 YAML 前置元数据的 Markdown 文件：

```markdown
---
description: 可选描述（显示在 /help 中）
---

你的提示内容。
使用 {{args}} 进行参数注入。
```

| 字段         | 是否必须 | 描述                             | 示例                            |
| ------------ | -------- | -------------------------------- | ------------------------------- |
| `description` | 可选     | 命令描述（显示在 /help 中）        | `description: 代码分析工具`      |
| 提示正文     | 必须     | 发送给模型的提示内容              | 前置元数据后的任何 Markdown 内容 |

### TOML 文件格式（已弃用）

> [!warning]
>
> **已弃用：** TOML 格式仍然支持，但将在未来版本中移除。请迁移到 Markdown 格式。

| 字段         | 是否必须 | 描述                             | 示例                                    |
| ------------ | -------- | -------------------------------- | --------------------------------------- |
| `prompt`     | 必须     | 发送给模型的提示内容              | `prompt = "请分析代码：{{args}}"`        |
| `description` | 可选     | 命令描述（显示在 /help 中）        | `description = "代码分析工具"`           |

### 参数处理机制

| 处理方法             | 语法               | 适用场景                 | 安全特性                         |
| -------------------- | ------------------ | ------------------------ | -------------------------------- |
| 上下文感知注入        | `{{args}}`         | 需要精确参数控制           | 自动 Shell 转义                  |
| 默认参数处理          | 无特殊标记          | 简单命令，参数追加         | 原样追加                         |
| Shell 命令注入        | `!{command}`       | 需要动态内容              | 执行前需确认                     |

#### 1. 上下文感知注入（`{{args}}`）

| 场景             | TOML 配置                             | 调用方法                 | 实际效果                     |
| ---------------- | ------------------------------------- | ------------------------ | --------------------------- |
| 原始注入         | `prompt = "修复：{{args}}"`            | `/fix "按钮问题"`        | `修复："按钮问题"`           |
| 在 Shell 命令中  | `prompt = "搜索：!{grep {{args}} .}"`  | `/search "hello"`       | 执行 `grep "hello" .`       |

#### 2. 默认参数处理

| 输入情况     | 处理方法                                           | 示例                                       |
| ------------ | -------------------------------------------------- | ------------------------------------------ |
| 有参数       | 追加到提示末尾（以两个换行符分隔）                     | `/cmd 参数` → 原始提示 + 参数                |
| 无参数       | 直接发送提示                                         | `/cmd` → 原始提示                           |
🚀 动态内容注入

| 注入类型           | 语法              | 处理顺序        | 用途                     |
| ------------------ | ----------------- | --------------- | ------------------------ |
| 文件内容           | `@{文件路径}`     | 最先处理        | 注入静态参考文件         |
| Shell 命令         | `!{命令}`         | 中间处理        | 注入动态执行结果         |
| 参数替换           | `{{args}}`        | 最后处理        | 注入用户参数             |

#### 3. Shell 命令执行 (`!{...}`)

| 操作                           | 用户交互           |
| ------------------------------ | ------------------ |
| 1. 解析命令及参数              | -                  |
| 2. 自动 Shell 转义             | -                  |
| 3. 显示确认对话框              | ✅ 用户确认        |
| 4. 执行命令                    | -                  |
| 5. 将输出注入到提示词           | -                  |

示例：Git 提交信息生成

````markdown
---
description: 根据暂存更改生成提交信息
---

请根据以下 diff 生成一条提交信息：

```diff
!{git diff --staged}
```
````

#### 4. 文件内容注入 (`@{...}`)

| 文件类型   | 支持状态               | 处理方法               |
| ---------- | ---------------------- | ---------------------- |
| 文本文件   | ✅ 完全支持            | 直接注入内容           |
| 图片/PDF   | ✅ 多模态支持          | 编码后注入             |
| 二进制文件 | ⚠️ 有限支持            | 可能跳过或截断         |
| 目录       | ✅ 递归注入            | 遵循 .gitignore 规则   |

示例：代码审查命令

```markdown
---
description: 基于最佳实践进行代码审查
---

审查 {{args}}，参考标准：

@{docs/code-standards.md}
```

### 实用创建示例

#### “纯函数重构”命令创建步骤表

| 操作                       | 命令/代码                                  |
| -------------------------- | ------------------------------------------ |
| 1. 创建目录结构            | `mkdir -p ~/.qwen/commands/refactor`       |
| 2. 创建命令文件            | `touch ~/.qwen/commands/refactor/pure.md`  |
| 3. 编辑命令内容            | 参考下方完整代码。                         |
| 4. 测试命令                | `@file.js` → `/refactor:pure`              |

```markdown
---
description: 将代码重构为纯函数
---

请分析当前上下文中的代码，并将其重构为纯函数。
要求：

1. 提供重构后的代码
2. 解释关键更改及纯函数特性的实现
3. 保持函数功能不变
```

### 自定义命令最佳实践总结

#### 命令设计建议表

| 实践要点         | 推荐做法                 | 避免                     |
| ---------------- | ------------------------ | ------------------------ |
| 命令命名         | 使用命名空间进行组织     | 避免过于通用的名称       |
| 参数处理         | 明确使用 `{{args}}`      | 依赖默认追加（容易混淆） |
| 错误处理         | 利用 Shell 错误输出      | 忽略执行失败             |
| 文件组织         | 按功能分目录整理         | 所有命令放在根目录       |
| 描述字段         | 始终提供清晰描述         | 依赖自动生成的描述       |

#### 安全机制提醒表

| 安全机制         | 保护效果                 | 用户操作                 |
| ---------------- | ------------------------ | ------------------------ |
| Shell 转义       | 防止命令注入             | 自动处理                 |
| 执行确认         | 避免意外执行             | 对话框确认               |
| 错误报告         | 帮助诊断问题             | 查看错误信息             |

## 5. CLI 子命令

这些命令以 `qwen <子命令>` 形式在 shell 中运行，用于在启动交互会话之前执行操作。

### 会话管理

| 命令                    | 描述                       | 使用示例                                                       |
| ----------------------- | -------------------------- | -------------------------------------------------------------- |
| `qwen sessions list`    | 列出最近的对话会话         | `qwen sessions list`，`qwen sessions list --json --limit 50`   |

#### `qwen sessions list`

列出最近的 Qwen Code 会话及其元数据。

**标志：**

| 标志       | 类型    | 默认值  | 描述                                  |
| ---------- | ------- | ------- | ------------------------------------- |
| `--json`   | boolean | `false` | 以 JSON Lines 格式输出（每行一个 JSON 对象） |
| `--limit`  | number  | `20`    | 显示的最大会话数                      |

**人类可读输出（默认）：**

包含以下列的表格：SESSION ID、STARTED (UTC 时间戳)、TITLE、BRANCH、PROMPT。

**JSON 输出 (`--json`)：**

通过 stdout 输出 JSON Lines。每行是一个 JSON 对象，包含以下字段：

```
sessionId, startTime, mtime, prompt, gitBranch, customTitle, titleSource, filePath, cwd
```

“有更多会话”的提示通过 stderr 发出，因此管道传输到 `jq` 依然安全。

**示例：**

```bash
# 显示最近 20 个会话（默认）
qwen sessions list

# 显示最近 50 个会话
qwen sessions list --limit 50

# 以 JSON 格式输出，用于脚本处理
qwen sessions list --json | jq .
```