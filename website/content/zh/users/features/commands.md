# Commands

本文档详细介绍 Qwen Code 支持的所有命令，帮助你高效管理会话、自定义界面并控制其行为。

Qwen Code 命令通过特定前缀触发，分为三类：

| 前缀类型                  | 功能描述                              | 典型使用场景                                         |
| ------------------------- | ------------------------------------- | ---------------------------------------------------- |
| 斜杠命令（`/`）           | 对 Qwen Code 本身进行元级别控制       | 管理会话、修改设置、获取帮助                         |
| At 命令（`@`）            | 快速将本地文件内容注入对话            | 让 AI 分析指定文件或目录下的代码                     |
| 感叹号命令（`!`）         | 直接与系统 Shell 交互                 | 执行 `git status`、`ls` 等系统命令                   |

## 1. 斜杠命令（`/`）

斜杠命令用于管理 Qwen Code 会话、界面和基本行为。

### 1.1 会话与项目管理

这些命令帮助你保存、恢复和汇总工作进度。

| 命令             | 描述                                               | 使用示例                                                      |
| ---------------- | -------------------------------------------------- | ------------------------------------------------------------- |
| `/init`          | 分析当前目录并创建初始上下文文件                   | `/init`                                                       |
| `/summary`       | 根据对话历史生成项目摘要                           | `/summary`                                                    |
| `/compress`      | 用摘要替换聊天历史以节省 Token                     | `/compress`                                                   |
| `/compress-fast` | 快速压缩（无 AI）——去除旧的工具输出和思考内容      | `/compress-fast`                                              |
| `/resume`        | 恢复之前的对话会话                                 | `/resume`                                                     |
| `/recap`         | 立即生成当前会话的一行摘要                         | `/recap`                                                      |
| `/restore`       | 将项目文件还原至某次工具调用前的检查点             | `/restore`（列表）或 `/restore <ID>`                          |
| `/delete`        | 删除之前的会话                                     | `/delete`                                                     |
| `/branch`        | 将当前对话分叉为新会话                             | `/branch`                                                     |
| `/fork`          | 启动一个继承完整对话的后台 agent                   | `/fork <directive>`                                           |
| `/rewind`        | 将对话回退到之前的某一轮                           | `/rewind` 或 `/rollback`                                      |
| `/export`        | 将会话历史导出为文件                               | `/export html`、`/export md`、`/export json`、`/export jsonl` |
| `/rename`        | 重命名或标记当前会话                               | `/rename My Feature` 或 `/tag`                                |

### 1.2 界面与工作区控制

用于调整界面外观和工作环境的命令。

| 命令                 | 描述                                                                                                                                         | 使用示例                                                                           |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `/clear`             | 清除终端屏幕内容                                                                                                                             | `/clear`（快捷键：`Ctrl+L`）                                                       |
| `/context`           | 显示上下文窗口使用详情                                                                                                                       | `/context`                                                                         |
| → `detail`           | 显示每项上下文使用详情                                                                                                                       | `/context detail`                                                                  |
| `/history`           | 控制历史记录显示偏好和可见性                                                                                                                 | `/history collapse-on-resume`、`/history expand-on-resume`、`/history expand-now`  |
| `/diff`              | 打开交互式 diff 查看器，显示未提交变更和每轮对话的 diff。使用 ←/→ 在当前 git diff 和各对话轮次之间切换，↑/↓ 浏览文件                       | `/diff`                                                                            |
| `/theme`             | 更改 Qwen Code 视觉主题                                                                                                                      | `/theme`                                                                           |
| `/vim`               | 开启/关闭输入区域的 Vim 编辑模式                                                                                                             | `/vim`                                                                             |
| `/voice`             | 切换语音听写输入                                                                                                                             | `/voice`、`/voice status`                                                          |
| `/directory`         | 管理多目录支持工作区                                                                                                                         | `/dir add ./src,./tests`                                                           |
| `/cd`                | 将当前会话切换到新的工作目录                                                                                                                 | `/cd ../other-project`                                                             |
| `/editor`            | 打开对话框以选择支持的编辑器                                                                                                                 | `/editor`                                                                          |
| `/statusline`        | 打开交互式[状态栏](./status-line.md)预设对话框                                                                                               | `/statusline`                                                                      |
| `/statusline <text>` | 通过 agent 生成命令模式[状态栏](./status-line.md)                                                                                            | `/statusline show model and git branch`                                            |
| `/terminal-setup`    | 配置终端按键绑定以支持多行输入                                                                                                               | `/terminal-setup`                                                                  |

### 1.3 语言设置

专门用于控制界面和输出语言的命令。

| 命令                  | 描述                       | 使用示例                       |
| --------------------- | -------------------------- | ------------------------------ |
| `/language`           | 查看或更改语言设置         | `/language`                    |
| → `ui [language]`     | 设置 UI 界面语言           | `/language ui zh-CN`           |
| → `output [language]` | 设置 LLM 输出语言          | `/language output Chinese`     |

- 内置 UI 语言：`zh-CN`（简体中文）、`en-US`（英语）、`ru-RU`（俄语）、`de-DE`（德语）、`ja-JP`（日语）、`pt-BR`（葡萄牙语 - 巴西）、`fr-FR`（法语）、`ca-ES`（加泰罗尼亚语）
- 输出语言示例：`Chinese`、`English`、`Japanese` 等

### 1.4 工具与模型管理

用于管理 AI 工具和模型的命令。

| 命令             | 描述                                        | 使用示例                                                                      |
| ---------------- | ------------------------------------------- | ----------------------------------------------------------------------------- |
| `/mcp`           | 列出已配置的 MCP 服务器和工具               | `/mcp`、`/mcp desc`                                                           |
| `/import-config` | 从 Claude 配置导入 MCP 服务器               | `/import-config claude-code`、`/import-config claude-desktop --scope project` |
| `/tools`         | 显示当前可用工具列表                        | `/tools`、`/tools desc`                                                       |
| `/skills`        | 列出并运行可用的 skill                      | `/skills`、`/skills <name>`                                                   |
| `/plan`          | 切换到 plan 模式或退出 plan 模式            | `/plan`、`/plan <task>`、`/plan exit`                                         |
| `/approval-mode` | 更改工具使用的审批模式                      | `/approval-mode <mode (auto-edit)> --project`                                 |
| →`plan`          | 仅分析，不执行                              | 安全审查                                                                      |
| →`default`       | 编辑前需要审批                              | 日常使用                                                                      |
| →`auto-edit`     | 自动审批编辑操作                            | 可信环境                                                                      |
| →`auto`          | 分类器评估后审批                            | 带安全护栏的自主会话                                                          |
| →`yolo`          | 自动审批所有操作                            | 快速原型开发                                                                  |
| `/model`         | 切换当前会话使用的模型                      | `/model`、`/model <model-id>`（立即切换）                                     |
| `/model --fast`  | 为提示词建议设置更轻量的模型                | `/model --fast qwen3-coder-flash`                                             |
| `/model --voice` | 设置语音转录使用的模型                      | `/model --voice <model-id>`                                                   |
| `/extensions`    | 列出当前会话中所有已激活的扩展              | `/extensions`                                                                 |
| `/memory`        | 打开 Memory Manager 对话框                  | `/memory`                                                                     |
| `/remember`      | 保存一条持久化记忆                          | `/remember Prefer terse responses`                                            |
| `/forget`        | 从自动记忆中删除匹配条目                    | `/forget <query>`                                                             |
| `/dream`         | 手动运行自动记忆整合                        | `/dream`                                                                      |
| `/hooks`         | 管理 Qwen Code hooks                        | `/hooks`、`/hooks list`                                                       |
| `/permissions`   | 管理权限规则                                | `/permissions`                                                                |
| `/agents`        | 管理子 agent                                | `/agents manage`、`/agents create`                                            |
| `/arena`         | 管理 Arena 会话                             | `/arena start`、`/arena status`                                               |
| `/goal`          | 设置目标——持续工作直到条件满足              | `/goal <condition>`、`/goal clear`                                            |
| `/tasks`         | 列出后台任务                                | `/tasks`                                                                      |
| `/workflows`     | 查看 workflow 运行情况                      | `/workflows`、`/workflows <runId>`                                            |
| `/lsp`           | 显示 LSP 服务器状态                         | `/lsp`                                                                        |
| `/trust`         | 管理文件夹信任设置                          | `/trust`                                                                      |

### 1.5 内置 Skill

这些命令调用内置 skill，提供专用工作流。

| 命令         | 描述                                                          | 使用示例                                              |
| ------------ | ------------------------------------------------------------- | ----------------------------------------------------- |
| `/review`    | 使用 5 个并行 agent + 确定性分析进行代码审查                  | `/review`、`/review 123`、`/review 123 --comment`     |
| `/loop`      | 按周期计划重复运行提示词                                      | `/loop 5m check the build`                            |
| `/simplify`  | 审查近期变更并直接应用安全的清理编辑                          | `/simplify`、`/simplify focus on duplication`         |
| `/qc-helper` | 回答关于 Qwen Code 使用和配置的问题                           | `/qc-helper how do I configure MCP?`                  |

完整的 `/review` 文档请参见 [Code Review](./code-review.md)。

### 1.6 旁白提问（`/btw`）

`/btw` 命令允许你快速提问，而不会打断或影响主对话流程。

| 命令                   | 描述                     |
| ---------------------- | ------------------------ |
| `/btw <your question>` | 提一个快速的旁白问题     |
| `?btw <your question>` | 旁白提问的另一种语法     |

**工作原理：**

- 旁白问题以独立 API 调用发送，包含近期对话上下文（最多最近 20 条消息）
- 响应显示在 Composer 上方——等待过程中可继续输入
- 主对话**不会被阻塞**——独立继续进行
- 旁白问题的响应**不会**成为主对话历史的一部分
- 回答支持完整 Markdown 渲染（代码块、列表、表格等）

**键盘快捷键（交互模式）：**

| 快捷键               | 动作                                       |
| -------------------- | ------------------------------------------ |
| `Escape`             | 取消（加载中）或关闭（完成后）             |
| `Space` 或 `Enter`   | 关闭回答（输入为空时）                     |
| `Ctrl+C` 或 `Ctrl+D` | 取消正在进行的旁白提问                     |

**示例：**

```
（主对话正在重构代码时）

> /btw What's the difference between let and var in JavaScript?

  ╭──────────────────────────────────────────╮
  │ /btw What's the difference between let   │
  │     and var in JavaScript?               │
  │                                          │
  │ + Answering...                           │
  │ Press Escape, Ctrl+C, or Ctrl+D to cancel│
  ╰──────────────────────────────────────────╯
  > (Composer remains active — keep typing)

（回答到达后）

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

| 模式                 | 行为                                         |
| -------------------- | -------------------------------------------- |
| 交互模式             | 在 Composer 上方显示，支持 Markdown 渲染     |
| 非交互模式           | 返回文本结果：`btw> question\nanswer`        |
| ACP（Agent Protocol）| 返回 stream_messages 异步生成器              |

> [!tip]
>
> 当你需要快速获得答案又不想打断主要任务时，使用 `/btw`。它特别适合在专注于主工作流的同时澄清概念、核实信息或获取快速解释。

### 1.7 会话摘要（`/recap`）

`/recap` 命令为当前会话生成简短的"你上次做到哪里"摘要，让你无需翻看大量历史记录即可恢复旧对话。

| 命令     | 描述                         |
| -------- | ---------------------------- |
| `/recap` | 生成并显示一行会话摘要       |

**工作原理：**

- 优先使用已配置的快速模型（`fastModel` 设置），若无则回退到主会话模型。摘要只需小型、低成本的模型即可。
- 近期对话（最多 30 条消息，仅文本——工具调用和工具响应会被过滤）连同简洁的系统提示词一起发送给模型。
- 摘要以暗色渲染，带有 `❯` 前缀，与真实的 assistant 回复区分开来。
- 若有模型轮次正在进行或其他命令正在处理，则拒绝执行并显示内联错误。若没有可用对话，或底层生成失败，`/recap` 会显示简短提示信息而非摘要——手动命令始终会有响应。

**离开后返回时自动触发：**

若终端失焦 **5 分钟以上**后重新聚焦，将自动生成并显示摘要（仅在无模型响应进行时；否则等待当前轮次完成后再触发）。与手动命令不同，自动触发在失败时完全静默：若生成出错或无内容可摘要，不会向历史记录添加任何消息。由 `general.showSessionRecap` 设置控制（默认值：`false`）；手动 `/recap` 命令无论该设置如何均始终可用。

**示例：**

```
> /recap

❯ Refactoring loopDetectionService.ts to address long-session OOM caused by
  unbounded streamContentHistory and contentStats. The next step is to
  implement option B (LRU sliding window with FNV-1a) pending confirmation.
```

> [!tip]
>
> 通过 `/model --fast <model>`（例如 `qwen3-coder-flash`）配置快速模型，让 `/recap` 又快又省。将 `general.showSessionRecap` 设为 `true` 可启用自动触发；手动 `/recap` 命令无论该设置如何均始终可用。

### 1.8 Diff 查看器（`/diff`）

`/diff` 命令打开一个交互式 diff 查看器，显示未提交变更和每轮对话的 diff。使用 ←/→ 在当前 git diff 和各对话轮次之间切换，↑/↓ 浏览文件，Enter 查看内联 diff。

**工作原理：**

在交互模式下，`/diff` 打开一个带有顶部**来源选择器**的对话框：

- **Current** — 工作树与 HEAD 的对比（`git diff HEAD`）。显示所有未提交变更，包括已暂存、未暂存和未跟踪的文件。
- **T1、T2、T3、……** — 每轮 diff，每个修改过文件的模型轮次对应一个标签。最近的轮次显示在最前。每个标签显示原始提示词的预览以供参考。

文件列表显示每个文件的统计信息（新增/删除行数），并为特殊状态添加标签（`new`、`deleted`、`untracked`、`binary`、`truncated`、`oversized`）。按 Enter 查看所选文件的内联 diff（带语法高亮的 hunk）。

每轮 diff 需要启用文件检查点功能（交互模式下默认开启）。若文件检查点关闭，则只有"Current"来源可用。

**键盘快捷键：**

| 按键       | 动作                                       |
| ---------- | ------------------------------------------ |
| `←` / `→` | 切换来源（Current / T1 / T2……）            |
| `↑` / `↓` | 浏览文件列表                               |
| `j` / `k` | 浏览文件列表（vim 风格）                   |
| Enter      | 查看所选文件的内联 diff                    |
| `←` / Esc | 从内联 diff 视图返回文件列表               |
| Esc        | 关闭对话框                                 |

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

在无头模式（`--prompt`）或非交互上下文中，`/diff` 打印工作树与 HEAD 对比的纯文本摘要。不支持每轮切换导航。

```
3 files changed, +45 / -12
  +30  -8  src/utils/parser.ts
  +12  -2  src/utils/parser.test.ts
   +3  -2  README.md
```

### 1.9 信息、设置与帮助

用于获取信息和执行系统设置的命令。

| 命令            | 描述                                                                                                                                                                                                           | 使用示例                         |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------- |
| `/help`         | 显示可用命令的帮助信息                                                                                                                                                                                         | `/help` 或 `/?`                  |
| `/status`       | 显示版本信息                                                                                                                                                                                                   | `/status` 或 `/about`            |
| `/status paths` | 显示当前会话文件和日志路径                                                                                                                                                                                     | `/status paths`                  |
| `/stats`        | 打开交互式使用统计仪表盘，包含三个标签：Session（实时指标）、Activity（热力图、token 趋势、项目排名）和 Efficiency（缓存率、工具排行榜、模型对比）。使用 `tab` 切换标签，`r` 循环切换时间范围，`←→` 平移月份，`esc` 关闭。 | `/stats`                         |
| `/stats model`  | 显示每个模型的 token 分布和预估费用                                                                                                                                                                            | `/stats model`                   |
| `/stats tools`  | 显示每个工具的调用次数                                                                                                                                                                                         | `/stats tools`                   |
| `/stats skills` | 显示当前实时会话中每个 skill 的调用次数，不包含跨会话的日/月活动。                                                                                                                                             | `/stats skills`                  |
| `/settings`     | 打开设置编辑器                                                                                                                                                                                                 | `/settings`                      |
| `/auth`         | 更改认证方式                                                                                                                                                                                                   | `/auth`                          |
| `/doctor`       | 运行安装和环境诊断                                                                                                                                                                                             | `/doctor`、`/doctor memory`      |
| `/docs`         | 在浏览器中打开完整的 Qwen Code 文档                                                                                                                                                                            | `/docs`                          |
| `/ide`          | 管理 IDE 集成                                                                                                                                                                                                  | `/ide status`、`/ide install`    |
| `/insight`      | 从聊天历史生成编程洞察                                                                                                                                                                                         | `/insight`                       |
| `/setup-github` | 设置 GitHub Actions                                                                                                                                                                                            | `/setup-github`                  |
| `/bug`          | 提交关于 Qwen Code 的问题                                                                                                                                                                                      | `/bug Button click unresponsive` |
| `/copy`         | 将 AI 输出复制到剪贴板（`/copy N` = 倒数第 N 条 AI 消息）                                                                                                                                                     | `/copy` 或 `/copy 2`             |
| `/quit`         | 立即退出 Qwen Code                                                                                                                                                                                             | `/quit` 或 `/exit`               |

### 1.10 常用快捷键

| 快捷键             | 功能             | 备注                    |
| ------------------ | ---------------- | ----------------------- |
| `Ctrl/cmd+L`       | 清屏             | 等同于 `/clear`         |
| `Ctrl/cmd+T`       | 切换工具描述     | MCP 工具管理            |
| `Ctrl/cmd+C`×2     | 退出确认         | 安全退出机制            |
| `Ctrl/cmd+Z`       | 撤销输入         | 文本编辑                |
| `Ctrl/cmd+Shift+Z` | 重做输入         | 文本编辑                |

### 1.11 认证命令

在 Qwen Code 会话内使用 `/auth` 配置认证。使用 `/doctor` 查看当前认证和环境状态。

| 命令      | 描述                         |
| --------- | ---------------------------- |
| `/auth`   | 交互式配置认证               |
| `/doctor` | 显示认证和环境检查结果       |

> [!note]
>
> 独立的 `qwen auth` CLI 命令已移除。调用 `qwen auth status` 等旧命令时会打印移除通知并提供迁移指引。完整详情请参见[认证](../configuration/auth)页面。

## 2. @ 命令（引入文件）

@ 命令用于快速将本地文件或目录内容添加到对话中。

| 命令格式            | 描述                             | 示例                                             |
| ------------------- | -------------------------------- | ------------------------------------------------ |
| `@<文件路径>`       | 注入指定文件的内容               | `@src/main.py Please explain this code`          |
| `@<目录路径>`       | 递归读取目录下所有文本文件       | `@docs/ Summarize content of this document`      |
| 单独使用 `@`        | 用于讨论 `@` 符号本身时          | `@ What is this symbol used for in programming?` |

注意：路径中的空格需使用反斜杠转义（例如 `@My\ Documents/file.txt`）

## 3. 感叹号命令（`!`）——Shell 命令执行

感叹号命令允许你在 Qwen Code 中直接执行系统命令。

| 命令格式           | 描述                                              | 示例                                   |
| ------------------ | ------------------------------------------------- | -------------------------------------- |
| `!<shell 命令>`    | 在子 Shell 中执行命令                             | `!ls -la`、`!git status`               |
| 单独使用 `!`       | 切换 Shell 模式，所有输入直接作为 Shell 命令执行  | `!`（进入）→ 输入命令 → `!`（退出）    |

环境变量：通过 `!` 执行的命令会设置 `QWEN_CODE=1` 环境变量。

## 4. 自定义命令

将常用提示词保存为快捷命令，提升工作效率并保证一致性。

> [!note]
>
> 自定义命令现在使用带可选 YAML frontmatter 的 Markdown 格式。TOML 格式已废弃，但为向后兼容仍支持。检测到 TOML 文件时，将显示自动迁移提示。

### 快速概览

| 功能         | 描述                                       | 优势                       | 优先级 | 适用场景                             |
| ------------ | ------------------------------------------ | -------------------------- | ------ | ------------------------------------ |
| 命名空间     | 子目录创建以冒号命名的命令                 | 更好的命令组织             |        |                                      |
| 全局命令     | `~/.qwen/commands/`                        | 在所有项目中可用           | 低     | 个人常用命令、跨项目使用             |
| 项目命令     | `<项目根目录>/.qwen/commands/`             | 项目专属，可版本控制       | 高     | 团队共享、项目特定命令               |

优先级规则：项目命令 > 用户命令（同名时使用项目命令）

### 命令命名规则

#### 文件路径到命令名称的映射表

| 文件位置                                 | 生成命令          | 示例调用              |
| ---------------------------------------- | ----------------- | --------------------- |
| `~/.qwen/commands/test.md`               | `/test`           | `/test 参数`          |
| `<project>/.qwen/commands/git/commit.md` | `/git:commit`     | `/git:commit 消息`    |

命名规则：路径分隔符（`/` 或 `\`）转换为冒号（`:`）

### Markdown 文件格式规范（推荐）

自定义命令使用带可选 YAML frontmatter 的 Markdown 文件：

```markdown
---
description: 可选描述（显示在 /help 中）
---

你的提示词内容写在这里。
使用 {{args}} 进行参数注入。
```

| 字段          | 是否必填 | 描述                             | 示例                                       |
| ------------- | -------- | -------------------------------- | ------------------------------------------ |
| `description` | 可选     | 命令描述（显示在 /help 中）      | `description: Code analysis tool`          |
| 提示词正文    | 必填     | 发送给模型的提示词内容           | frontmatter 之后的任意 Markdown 内容       |

### TOML 文件格式（已废弃）

> [!warning]
>
> **已废弃：** TOML 格式仍受支持，但将在未来版本中移除。请迁移至 Markdown 格式。

| 字段          | 是否必填 | 描述                             | 示例                                       |
| ------------- | -------- | -------------------------------- | ------------------------------------------ |
| `prompt`      | 必填     | 发送给模型的提示词内容           | `prompt = "Please analyze code: {{args}}"` |
| `description` | 可选     | 命令描述（显示在 /help 中）      | `description = "Code analysis tool"`       |

### 参数处理机制

| 处理方式         | 语法               | 适用场景               | 安全特性                     |
| ---------------- | ------------------ | ---------------------- | ---------------------------- |
| 上下文感知注入   | `{{args}}`         | 需要精确控制参数时     | 自动 Shell 转义              |
| 默认参数处理     | 无特殊标记         | 简单命令、参数追加     | 原样追加                     |
| Shell 命令注入   | `!{command}`       | 需要动态内容时         | 执行前需用户确认             |

#### 1. 上下文感知注入（`{{args}}`）

| 场景           | TOML 配置                               | 调用方式              | 实际效果                 |
| -------------- | --------------------------------------- | --------------------- | ------------------------ |
| 原始注入       | `prompt = "Fix: {{args}}"`              | `/fix "Button issue"` | `Fix: "Button issue"`    |
| 在 Shell 命令中 | `prompt = "Search: !{grep {{args}} .}"` | `/search "hello"`     | 执行 `grep "hello" .`    |

#### 2. 默认参数处理

| 输入情况   | 处理方式                                       | 示例                                           |
| ---------- | ---------------------------------------------- | ---------------------------------------------- |
| 有参数     | 追加到提示词末尾（以两个换行符分隔）           | `/cmd 参数` → 原始提示词 + 参数                |
| 无参数     | 原样发送提示词                                 | `/cmd` → 原始提示词                            |

🚀 动态内容注入

| 注入类型       | 语法           | 处理顺序     | 用途                         |
| -------------- | -------------- | ------------ | ---------------------------- |
| 文件内容       | `@{文件路径}`  | 最先处理     | 注入静态参考文件             |
| Shell 命令     | `!{command}`   | 中间处理     | 注入动态执行结果             |
| 参数替换       | `{{args}}`     | 最后处理     | 注入用户参数                 |

#### 3. Shell 命令执行（`!{...}`）

| 操作                    | 用户交互         |
| ----------------------- | ---------------- |
| 1. 解析命令和参数       | -                |
| 2. 自动 Shell 转义      | -                |
| 3. 显示确认对话框       | ✅ 用户确认      |
| 4. 执行命令             | -                |
| 5. 将输出注入提示词     | -                |

示例：Git Commit 消息生成

````markdown
---
description: 根据已暂存的变更生成 Commit 消息
---

请根据以下 diff 生成一条 Commit 消息：

```diff
!{git diff --staged}
```
````

#### 4. 文件内容注入（`@{...}`）

| 文件类型     | 支持状态           | 处理方式                   |
| ------------ | ------------------ | -------------------------- |
| 文本文件     | ✅ 完全支持        | 直接注入内容               |
| 图片/PDF     | ✅ 多模态支持      | 编码后注入                 |
| 二进制文件   | ⚠️ 有限支持        | 可能被跳过或截断           |
| 目录         | ✅ 递归注入        | 遵循 .gitignore 规则       |

示例：代码审查命令

```markdown
---
description: 基于最佳实践进行代码审查
---

审查 {{args}}，参考标准：

@{docs/code-standards.md}
```

### 实践创建示例

#### "纯函数重构"命令创建步骤表

| 操作                  | 命令/代码                                 |
| --------------------- | ----------------------------------------- |
| 1. 创建目录结构       | `mkdir -p ~/.qwen/commands/refactor`      |
| 2. 创建命令文件       | `touch ~/.qwen/commands/refactor/pure.md` |
| 3. 编辑命令内容       | 参考下方完整代码                          |
| 4. 测试命令           | `@file.js` → `/refactor:pure`             |

```markdown
---
description: 将代码重构为纯函数
---

请分析当前上下文中的代码，重构为纯函数。
要求：

1. 提供重构后的代码
2. 说明关键变更及纯函数特性的实现方式
3. 保持函数功能不变
```

### 自定义命令最佳实践总结

#### 命令设计建议表

| 实践要点     | 推荐做法                         | 避免                                         |
| ------------ | -------------------------------- | -------------------------------------------- |
| 命令命名     | 使用命名空间进行组织             | 避免过于通用的名称                           |
| 参数处理     | 明确使用 `{{args}}`              | 依赖默认追加（容易混淆）                     |
| 错误处理     | 利用 Shell 错误输出              | 忽略执行失败                                 |
| 文件组织     | 按功能分目录组织                 | 所有命令放在根目录                           |
| 描述字段     | 始终提供清晰描述                 | 依赖自动生成的描述                           |

#### 安全特性提示表

| 安全机制     | 防护效果           | 用户操作         |
| ------------ | ------------------ | ---------------- |
| Shell 转义   | 防止命令注入       | 自动处理         |
| 执行确认     | 避免误操作执行     | 对话框确认       |
| 错误报告     | 帮助诊断问题       | 查看错误信息     |

## 5. CLI 子命令

这些命令在启动交互式会话前，从 shell 以 `qwen <subcommand>` 的形式运行。

### 会话管理

| 命令                 | 描述                       | 使用示例                                                     |
| -------------------- | -------------------------- | ------------------------------------------------------------ |
| `qwen sessions list` | 列出最近的对话会话         | `qwen sessions list`、`qwen sessions list --json --limit 50` |

#### `qwen sessions list`

列出你最近的 Qwen Code 会话及元数据。

**参数：**

| 参数      | 类型    | 默认值  | 描述                                    |
| --------- | ------- | ------- | --------------------------------------- |
| `--json`  | boolean | `false` | 以 JSON Lines 格式输出（每行一个 JSON 对象） |
| `--limit` | number  | `20`    | 最多显示的会话数量                      |

**可读格式输出（默认）：**

表格列：SESSION ID、STARTED（UTC 时间戳）、TITLE、BRANCH、PROMPT。

**JSON 输出（`--json`）：**

在 stdout 输出 JSON Lines，每行是一个包含以下字段的 JSON 对象：

```
sessionId, startTime, mtime, prompt, gitBranch, customTitle, titleSource, filePath, cwd
```

"has more sessions" 提示通过 stderr 输出，确保管道传给 `jq` 时不受影响。

**示例：**

```bash
# 显示最近 20 个会话（默认）
qwen sessions list

# 显示最近 50 个会话
qwen sessions list --limit 50

# 以 JSON 格式输出，用于脚本处理
qwen sessions list --json | jq .
```
