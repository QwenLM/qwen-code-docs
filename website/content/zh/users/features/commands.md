# 命令

本文档详细列出了 Qwen Code 支持的所有命令，帮助你高效管理会话、自定义界面并控制其行为。

Qwen Code 命令通过特定前缀触发，分为以下三类：

| 前缀类型                | 功能说明                                | 典型使用场景                                                 |
| -------------------------- | --------------------------------------------------- | ---------------------------------------------------------------- |
| 斜杠命令 (`/`)       | 对 Qwen Code 本身的元级控制              | 管理会话、修改设置、获取帮助              |
| At 命令 (`@`)          | 快速将本地文件内容注入对话 | 让 AI 分析指定文件或目录下的代码 |
| 感叹号命令 (`!`) | 直接与系统 Shell 交互                | 执行 `git status`、`ls` 等系统命令          |

## 1. 斜杠命令 (`/`)

斜杠命令用于管理 Qwen Code 会话、界面和基本行为。

### 1.1 会话与项目管理

这些命令帮助你保存、恢复和总结工作进度。

| 命令     | 说明                                               | 使用示例                       |
| ----------- | --------------------------------------------------------- | ------------------------------------ |
| `/init`     | 分析当前目录并创建初始上下文文件 | `/init`                              |
| `/summary`  | 根据对话历史生成项目摘要    | `/summary`                           |
| `/compress` | 用摘要替换聊天记录以节省 Tokens          | `/compress`                          |
| `/resume`   | 恢复之前的对话会话                    | `/resume`                            |
| `/recap`    | 立即生成一行会话回顾                     | `/recap`                             |
| `/restore`  | 将文件恢复到工具执行前的状态              | `/restore` (列表) 或 `/restore <ID>` |

### 1.2 界面与工作区控制

用于调整界面外观和工作环境的命令。

| 命令      | 说明                              | 使用示例                |
| ------------ | ---------------------------------------- | ----------------------------- |
| `/clear`     | 清除终端屏幕内容            | `/clear` (快捷键: `Ctrl+L`) |
| `/context`   | 显示上下文窗口使用情况明细      | `/context`                    |
| → `detail`   | 显示逐项上下文使用情况明细    | `/context detail`             |
| `/theme`     | 更改 Qwen Code 视觉主题            | `/theme`                      |
| `/vim`       | 开启/关闭输入区域的 Vim 编辑模式  | `/vim`                        |
| `/directory` | 管理多目录支持的工作区 | `/dir add ./src,./tests`      |
| `/editor`    | 打开对话框以选择支持的编辑器   | `/editor`                     |

### 1.3 语言设置

专门用于控制界面和输出语言的命令。

| 命令               | 说明                      | 使用示例             |
| --------------------- | -------------------------------- | -------------------------- |
| `/language`           | 查看或更改语言设置 | `/language`                |
| → `ui [language]`     | 设置 UI 界面语言        | `/language ui zh-CN`       |
| → `output [language]` | 设置 LLM 输出语言          | `/language output Chinese` |

- 可用的内置 UI 语言：`zh-CN` (简体中文)、`en-US` (英文)、`ru-RU` (俄文)、`de-DE` (德文)
- 输出语言示例：`Chinese`、`English`、`Japanese` 等。

### 1.4 工具与模型管理

用于管理 AI 工具和模型的命令。

| 命令          | 说明                                   | 使用示例                                |
| ---------------- | --------------------------------------------- | --------------------------------------------- |
| `/mcp`           | 列出已配置的 MCP 服务器和工具         | `/mcp`, `/mcp desc`                           |
| `/tools`         | 显示当前可用的工具列表         | `/tools`, `/tools desc`                       |
| `/skills`        | 列出并运行可用的 skill                 | `/skills`, `/skills <name>`                   |
| `/plan`          | 切换到 plan 模式或退出 plan 模式         | `/plan`, `/plan <task>`, `/plan exit`         |
| `/approval-mode` | 更改工具使用的审批模式           | `/approval-mode <mode (auto-edit)> --project` |
| →`plan`          | 仅分析，不执行                   | 安全审查                                 |
| →`default`       | 编辑需审批                    | 日常使用                                     |
| →`auto-edit`     | 自动批准编辑                   | 受信任环境                           |
| →`yolo`          | 自动批准所有操作                     | 快速原型开发                             |
| `/model`         | 切换当前会话使用的模型          | `/model`                                      |
| `/model --fast`  | 为提示建议设置更轻量的模型    | `/model --fast qwen3-coder-flash`             |
| `/extensions`    | 列出当前会话中所有活跃的扩展 | `/extensions`                                 |
| `/memory`        | 打开 Memory Manager 对话框                | `/memory`                                     |
| `/remember`      | 保存一条持久记忆                         | `/remember Prefer terse responses`            |
| `/forget`        | 从自动记忆中移除匹配条目      | `/forget <query>`                             |
| `/dream`         | 手动运行自动记忆整合        | `/dream`                                      |

### 1.5 内置 Skill

这些命令调用内置的 skill，提供专门的工作流。

| 命令      | 说明                                                         | 使用示例                                    |
| ------------ | ------------------------------------------------------------------- | ------------------------------------------------- |
| `/review`    | 使用 5 个并行 agent + 确定性分析审查代码变更 | `/review`, `/review 123`, `/review 123 --comment` |
| `/loop`      | 按重复计划运行提示                                | `/loop 5m check the build`                        |
| `/qc-helper` | 回答关于 Qwen Code 使用和配置的问题            | `/qc-helper how do I configure MCP?`              |

完整 `/review` 文档请参阅 [Code Review](./code-review.md)。

### 1.6 侧边提问 (`/btw`)

`/btw` 命令允许你快速提出侧边问题，而不会中断或影响主对话流程。

| 命令                | 说明                           |
| ---------------------- | ------------------------------------- |
| `/btw <your question>` | 提出快速侧边问题             |
| `?btw <your question>` | 侧边问题的替代语法 |

**工作原理：**

- 侧边问题会作为单独的 API 调用发送，并附带最近的对话上下文（最多 20 条消息）
- 响应显示在 Composer 上方——你可以在等待时继续输入
- 主对话**不会被阻塞**——它会独立继续
- 侧边问题的响应**不会**成为主对话历史的一部分
- 答案支持完整的 Markdown 渲染（代码块、列表、表格等）

**键盘快捷键（交互模式）：**

| 快捷键             | 操作                                              |
| -------------------- | --------------------------------------------------- |
| `Escape`             | 取消（加载中）或关闭（完成后） |
| `Space` 或 `Enter`   | 关闭答案（输入为空时）            |
| `Ctrl+C` 或 `Ctrl+D` | 取消进行中的侧边问题                   |

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

| 模式                 | 行为                                     |
| -------------------- | -------------------------------------------- |
| Interactive          | 在 Composer 上方显示，支持 Markdown 渲染 |
| Non-interactive      | 返回文本结果：`btw> question\nanswer` |
| ACP (Agent Protocol) | 返回 `stream_messages` 异步生成器      |

> [!tip]
>
> 当你需要快速答案且不想偏离主任务时，请使用 `/btw`。它在澄清概念、核实事实或获取快速解释时特别有用，能让你专注于主要工作流。

### 1.7 会话回顾 (`/recap`)

`/recap` 命令会生成当前会话的简短“上次进度”摘要，让你无需翻阅大量历史记录即可恢复旧对话。

| 命令  | 说明                                |
| -------- | ------------------------------------------ |
| `/recap` | 生成并显示一行会话回顾 |

**工作原理：**

- 在可用时使用配置的快速模型（`fastModel` 设置），否则回退到主会话模型。对于回顾来说，小型、低成本的模型已足够。
- 最近的对话（最多 30 条消息，仅文本——会过滤掉工具调用和工具响应）会连同严格的系统提示一起发送给模型。
- 回顾内容以暗色渲染并带有 `❯` 前缀，以便与真实的助手回复区分开。
- 如果模型正在处理中或另一个命令正在执行，则会以内联错误拒绝。如果没有可用的对话或底层生成失败，`/recap` 会显示简短提示信息而非回顾——手动命令始终会有响应。

**离开后返回时自动触发：**

如果终端失去焦点 **5 分钟以上** 并重新获得焦点，系统会自动生成并显示回顾（仅当没有模型响应正在进行时；否则它会等待当前轮次完成后再触发）。与手动命令不同，自动触发在失败时完全静默：如果生成出错或没有可总结的内容，不会向历史添加任何消息。由 `general.showSessionRecap` 设置控制（默认：`true`）；手动 `/recap` 命令始终有效，不受此设置影响。

**示例：**

```
> /recap

❯ Refactoring loopDetectionService.ts to address long-session OOM caused by
  unbounded streamContentHistory and contentStats. The next step is to
  implement option B (LRU sliding window with FNV-1a) pending confirmation.
```

> [!tip]
>
> 通过 `/model --fast <model>`（例如 `qwen3-coder-flash`）配置快速模型，可使 `/recap` 更快且更节省成本。将 `general.showSessionRecap` 设置为 `false` 可禁用自动触发，同时保留手动命令可用。

### 1.8 信息、设置与帮助

用于获取信息和执行系统设置的命令。

| 命令     | 说明                                     | 使用示例                   |
| ----------- | ----------------------------------------------- | -------------------------------- |
| `/help`     | 显示可用命令的帮助信息 | `/help` 或 `/?`                  |
| `/about`    | 显示版本信息                     | `/about`                         |
| `/stats`    | 显示当前会话的详细统计信息 | `/stats`                         |
| `/settings` | 打开设置编辑器                            | `/settings`                      |
| `/auth`     | 更改身份验证方法                    | `/auth`                          |
| `/bug`      | 提交关于 Qwen Code 的问题                    | `/bug Button click unresponsive` |
| `/copy`     | 将最后一次输出的内容复制到剪贴板           | `/copy`                          |
| `/quit`     | 立即退出 Qwen Code                      | `/quit` 或 `/exit`               |

### 1.9 常用快捷键

| 快捷键           | 功能                | 备注                   |
| ------------------ | ----------------------- | ---------------------- |
| `Ctrl/cmd+L`       | 清屏            | 等同于 `/clear` |
| `Ctrl/cmd+T`       | 切换工具描述 | MCP 工具管理    |
| `Ctrl/cmd+C`×2     | 退出确认       | 安全退出机制  |
| `Ctrl/cmd+Z`       | 撤销输入              | 文本编辑           |
| `Ctrl/cmd+Shift+Z` | 重做输入              | 文本编辑           |

### 1.10 CLI 身份验证子命令

除了会话内的 `/auth` 斜杠命令外，Qwen Code 还提供了独立的 CLI 子命令，允许你直接在终端中管理身份验证：

| 命令                                              | 说明                                                   |
| ---------------------------------------------------- | ------------------------------------------------------------- |
| `qwen auth`                                          | 交互式身份验证设置                              |
| `qwen auth coding-plan`                              | 使用阿里云 Coding Plan 进行身份验证                   |
| `qwen auth coding-plan --region china --key sk-sp-…` | 非交互式 Coding Plan 设置（适用于脚本）             |
| `qwen auth api-key`                                  | 使用 API key 进行身份验证                                  |
| `qwen auth qwen-oauth`                               | ~~使用 Qwen OAuth 进行身份验证~~（已于 2026-04-15 停用） |
| `qwen auth status`                                   | 显示当前身份验证状态                            |

> [!tip]
>
> 这些命令在 Qwen Code 会话之外运行。在启动会话前，或在脚本和 CI 环境中使用它们来配置身份验证。完整详情请参阅 [Authentication](../configuration/auth) 页面。

## 2. @ 命令（引入文件）

@ 命令用于快速将本地文件或目录内容添加到对话中。

| 命令格式      | 说明                                  | 示例                                         |
| ------------------- | -------------------------------------------- | ------------------------------------------------ |
| `@<file path>`      | 注入指定文件的内容             | `@src/main.py Please explain this code`          |
| `@<directory path>` | 递归读取目录中的所有文本文件 | `@docs/ Summarize content of this document`      |
| 独立 `@`      | 在讨论 `@` 符号本身时使用       | `@ What is this symbol used for in programming?` |

注意：路径中的空格需要使用反斜杠转义（例如 `@My\ Documents/file.txt`）

## 3. 感叹号命令 (`!`) - Shell 命令执行

感叹号命令允许你在 Qwen Code 中直接执行系统命令。

| 命令格式     | 说明                                                        | 示例                               |
| ------------------ | ------------------------------------------------------------------ | -------------------------------------- |
| `!<shell command>` | 在子 Shell 中执行命令                                       | `!ls -la`, `!git status`               |
| 独立 `!`     | 切换 Shell 模式，任何输入都将直接作为 Shell 命令执行 | `!`(回车) → 输入命令 → `!`(退出) |

环境变量：通过 `!` 执行的命令将设置 `QWEN_CODE=1` 环境变量。

## 4. 自定义命令

将常用提示词保存为快捷命令，以提高工作效率并确保一致性。

> [!note]
>
> 自定义命令现在使用 Markdown 格式，并支持可选的 YAML frontmatter。TOML 格式已弃用，但仍为向后兼容而保留。检测到 TOML 文件时，将显示自动迁移提示。

### 快速概览

| 功能         | 说明                                | 优势                             | 优先级 | 适用场景                                 |
| ---------------- | ------------------------------------------ | -------------------------------------- | -------- | ---------------------------------------------------- |
| 命名空间        | 子目录创建以冒号命名的命令  | 更好的命令组织            |          |                                                      |
| 全局命令  | `~/.qwen/commands/`                        | 在所有项目中可用              | 低      | 个人常用命令，跨项目使用 |
| 项目命令 | `<project root directory>/.qwen/commands/` | 项目专属，支持版本控制 | 高     | 团队共享，项目专属命令              |

优先级规则：项目命令 > 用户命令（名称相同时使用项目命令）

### 命令命名规则

#### 文件路径到命令名称映射表

| 文件位置                            | 生成的命令 | 调用示例          |
| ---------------------------------------- | ----------------- | --------------------- |
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

| 字段         | 是否必需 | 说明                              | 示例                                    |
| ------------- | -------- | ---------------------------------------- | ------------------------------------------ |
| `description` | 可选 | 命令描述（在 /help 中显示） | `description: Code analysis tool`          |
| 提示词主体   | 必需 | 发送给模型的提示词内容             | frontmatter 之后的任意 Markdown 内容 |

### TOML 文件格式（已弃用）

> [!warning]
>
> **已弃用：** TOML 格式目前仍受支持，但将在未来版本中移除。请迁移至 Markdown 格式。

| 字段         | 是否必需 | 说明                              | 示例                                    |
| ------------- | -------- | ---------------------------------------- | ------------------------------------------ |
| `prompt`      | 必需 | 发送给模型的提示词内容             | `prompt = "Please analyze code: {{args}}"` |
| `description` | 可选 | 命令描述（在 /help 中显示） | `description = "Code analysis tool"`       |

### 参数处理机制

| 处理方式            | 语法             | 适用场景                 | 安全特性                      |
| ---------------------------- | ------------------ | ------------------------------------ | -------------------------------------- |
| 上下文感知注入      | `{{args}}`         | 需要精确控制参数       | 自动 Shell 转义               |
| 默认参数处理 | 无特殊标记 | 简单命令，参数追加 | 原样追加                           |
| Shell 命令注入      | `!{command}`       | 需要动态内容                 | 执行前需确认 |

#### 1. 上下文感知注入 (`{{args}}`)

| 场景         | TOML 配置                      | 调用方式           | 实际效果            |
| ---------------- | --------------------------------------- | --------------------- | ------------------------ |
| 原始注入    | `prompt = "Fix: {{args}}"`              | `/fix "Button issue"` | `Fix: "Button issue"`    |
| 在 Shell 命令中 | `prompt = "Search: !{grep {{args}} .}"` | `/search "hello"`     | 执行 `grep "hello" .` |

#### 2. 默认参数处理

| 输入情况 | 处理方式                                      | 示例                                        |
| --------------- | ------------------------------------------------------ | ---------------------------------------------- |
| 有参数  | 追加到提示词末尾（以两个换行符分隔） | `/cmd parameter` → 原始提示词 + 参数 |
| 无参数   | 原样发送提示词                                      | `/cmd` → 原始提示词                       |

🚀 动态内容注入

| 注入类型        | 语法         | 处理顺序    | 用途                          |
| --------------------- | -------------- | ------------------- | -------------------------------- |
| 文件内容          | `@{file path}` | 最先处理     | 注入静态参考文件    |
| Shell 命令        | `!{command}`   | 中间处理 | 注入动态执行结果 |
| 参数替换 | `{{args}}`     | 最后处理      | 注入用户参数           |

#### 3. Shell 命令执行 (`!{...}`)

| 操作                       | 用户交互     |
| ------------------------------- | -------------------- |
| 1. 解析命令和参数 | -                    |
| 2. 自动 Shell 转义     | -                    |
| 3. 显示确认对话框     | ✅ 用户确认 |
| 4. 执行命令              | -                    |
| 5. 将输出注入提示词      | -                    |

示例：生成 Git Commit Message

````markdown
---
description: Generate Commit message based on staged changes
---

Please generate a Commit message based on the following diff:

```diff
!{git diff --staged}
```
````

#### 4. 文件内容注入 (`@{...}`)

| 文件类型    | 支持状态         | 处理方式           |
| ------------ | ---------------------- | --------------------------- |
| 文本文件   | ✅ 完全支持        | 直接注入内容     |
| 图片/PDF   | ✅ 多模态支持 | 编码后注入           |
| 二进制文件 | ⚠️ 有限支持     | 可能被跳过或截断 |
| 目录    | ✅ 递归注入 | 遵循 .gitignore 规则     |

示例：代码审查命令

```markdown
---
description: Code review based on best practices
---

Review {{args}}, reference standards:

@{docs/code-standards.md}
```

### 实际创建示例

#### “纯函数重构”命令创建步骤表

| 操作                     | 命令/代码                              |
| ----------------------------- | ----------------------------------------- |
| 1. 创建目录结构 | `mkdir -p ~/.qwen/commands/refactor`      |
| 2. 创建命令文件        | `touch ~/.qwen/commands/refactor/pure.md` |
| 3. 编辑命令内容       | 参考下方的完整代码。         |
| 4. 测试命令               | `@file.js` → `/refactor:pure`             |

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

| 实践要点      | 推荐做法                | 避免                                       |
| -------------------- | ----------------------------------- | ------------------------------------------- |
| 命令命名       | 使用命名空间进行组织     | 避免过于通用的名称                  |
| 参数处理 | 明确使用 `{{args}}`              | 依赖默认追加（容易混淆） |
| 错误处理       | 利用 Shell 错误输出          | 忽略执行失败                    |
| 文件组织    | 按功能在目录中组织 | 所有命令放在根目录              |
| 描述字段    | 始终提供清晰的描述    | 依赖自动生成的描述          |

#### 安全特性提醒表

| 安全机制     | 防护效果          | 用户操作         |
| ---------------------- | -------------------------- | ---------------------- |
| Shell 转义         | 防止命令注入  | 自动处理   |
| 执行确认 | 避免意外执行 | 对话框确认    |
| 错误报告        | 帮助诊断问题       | 查看错误信息 |