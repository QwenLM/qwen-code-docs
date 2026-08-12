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
| `/rewind`        | 将对话回退到上一轮                                   | `/rewind` 或 `/rollback`                                      |
| `/export`        | 将会话历史导出到文件                                           | `/export html`, `/export md`, `/export json`, `/export jsonl` |
| `/rename`        | 重命名或标记当前会话                                        | `/rename My Feature` 或 `/tag`                                |

> [!note]
>
> `/summarize` 是 `/compress` 的别名（它会压缩聊天历史 — 这是一个破坏性操作）。若要生成非破坏性的项目摘要，请使用 `/summary`。

> [!note]
>
> `/summary` 接受可选的 `[path]` 参数，将摘要保存到项目根目录内的自定义位置。不带参数时，保存到 `.qwen/PROJECT_SUMMARY.md`。自定义路径的摘要不会被欢迎回流程（`ui.enableWelcomeBack`）检测到，该流程仅读取默认的 `.qwen/PROJECT_SUMMARY.md` 位置。

### 1.2 界面与工作区控制

用于调整界面外观和工作环境的命令。

| 命令              | 描述                                                                                                                                                                       | 使用示例                                                                    |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| `/clear`             | 清除对话历史并释放上下文                                                                                                                                    | `/clear`, `/reset`, `/new`                                                        |
| `/context`           | 显示上下文窗口使用情况明细                                                                                                                                               | `/context`                                                                        |
| → `detail`           | 显示各项上下文使用情况明细                                                                                                                                             | `/context detail`                                                                 |
| `/history`           | 控制历史记录显示偏好和可见性                                                                                                                                | `/history collapse-on-resume`, `/history expand-on-resume`, `/history expand-now` |
| `/diff`              | 打开交互式 diff 查看器，显示未提交的更改和每轮 diff。使用 ←/→ 在当前 git diff 和各个对话轮次之间切换，使用 ↑/↓ 浏览文件 | `/diff`                                                                           |
| `/log`               | 打开工作区的 commit 历史查看器（仅限 Web Shell）                                                                                                                   | `/log`                                                                            |
| `/theme`             | 更改 Qwen Code 视觉主题                                                                                                                                                     | `/theme`                                                                          |
| `/vim`               | 开启/关闭输入区域的 Vim 编辑模式                                                                                                                                           | `/vim`                                                                            |
| `/voice`             | 切换语音听写输入                                                                                                                                                      | `/voice`, `/voice hold`, `/voice tap`, `/voice off`, `/voice status`              |
| `/directory`         | 管理多目录支持工作区                                                                                                                                          | `/dir add ./src,./tests`, `/dir show`                                             |
| `/cd`                | 将会话移动到新的工作目录                                                                                                                                      | `/cd ../other-project`                                                            |
| `/editor`            | 打开对话框以选择支持的编辑器                                                                                                                                            | `/editor`                                                                         |
| `/statusline`        | 打开交互式[状态栏](./status-line.md)预设对话框                                                                                                                    | `/statusline`                                                                     |
| `/statusline <text>` | 通过代理生成命令模式的[状态栏](./status-line.md)                                                                                                                 | `/statusline show model and git branch`                                           |
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

| 命令           | 描述                                                                      | 使用示例                                                                                            |
| ----------------- | -------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `/mcp`            | 列出已配置的 MCP 服务器和工具                                            | `/mcp`, `/mcp desc`, `/mcp nodesc`, `/mcp schema`                                                         |
| `/import-config`  | 从 Claude 配置中导入 MCP 服务器                                           | `/import-config all`, `/import-config claude-code`, `/import-config claude-desktop --scope user\|project` |
| `/tools`          | 显示当前可用的工具列表                                            | `/tools`, `/tools desc`                                                                                   |
| `/skills`         | 打开 Skills 面板以浏览、搜索、切换和启动 skills               | `/skills`, `/<skill-name>`                                                                                |
| `/learn`          | 从文件、目录、URL、视频或文本创建可复用的项目 skill             | `/learn https://docs.example.com/api`, `/learn ./tutorial.mp4 focus on deployment`                        |
| `/curator`        | 检查、固定、归档或恢复不活跃的项目自动 skills                  | `/curator`, `/curator run --dry-run`, `/curator pin <directory>`, `/curator restore <directory>`          |
| `/plan`           | 切换到计划模式或退出计划模式                                            | `/plan`, `/plan <task>`, `/plan exit`                                                                     |
| `/approval-mode`  | 更改工具审批模式（仅限当前会话）                             | `/approval-mode`, `/approval-mode auto-edit`                                                              |
| → `plan`          | 仅分析，不执行（安全审查）                                      | `/approval-mode plan`                                                                                     |
| → `default`       | 编辑需要审批（日常使用）                                           | `/approval-mode default`                                                                                  |
| → `auto-edit`     | 自动批准编辑（受信任环境）                                         | `/approval-mode auto-edit`                                                                                |
| → `auto`          | 分类器评估审批（自主）                                       | `/approval-mode auto`                                                                                     |
| → `yolo`          | 自动批准所有操作（快速原型开发）                                      | `/approval-mode yolo`                                                                                     |
| `/model`          | 切换当前会话使用的模型                                             | `/model`, `/model <model-id>` (立即切换)                                                        |
| `/model --fast`   | 为提示建议设置更轻量的模型                                       | `/model --fast qwen3-coder-flash`                                                                         |
| `/model --voice`  | 设置用于语音转录的模型                                       | `/model --voice <model-id>`                                                                               |
| `/model --vision` | 设置 vision-bridge 模型，用于为纯文本主模型转录图像 | `/model --vision <model-id>`                                                                              |
| `/model --compaction` | 设置用于聊天压缩的模型                                                                 | `/model --compaction <model-id>`, `/model --compaction clear`                                             |
| `/model --image`  | 为内置图片生成工具设置纯图片模型                                                           | `/model --image <model-id>`                                                                               |
| `/effort`         | 设置具备思考能力的模型的推理 effort                                 | `/effort` (打开选择器), `/effort high` (low/medium/high/xhigh/max；根据提供商进行映射和限制)       |
| `/extensions`     | 管理扩展                                                                | `/extensions list`, `/extensions manage`                                                                  |
| → `list`          | 列出已安装的扩展                                                        | `/extensions list`                                                                                        |
| → `manage`        | 管理已安装的扩展（交互式）                                        | `/extensions manage`                                                                                      |
| → `explore`       | 在浏览器中打开扩展页面                                                  | `/extensions explore <Gemini\|ClaudeCode>`                                                                |
| → `install`       | 从 git 仓库或路径安装扩展                                     | `/extensions install <repo-or-path>`                                                                      |
| `/memory`         | 打开 Memory Manager 对话框                                                   | `/memory`                                                                                                 |
| `/remember`       | 保存持久化 memory                                                            | `/remember Prefer terse responses`                                                                        |
| `/forget`         | 从 auto-memory 中移除匹配的条目                                         | `/forget <query>`                                                                                         |
| `/dream`          | 手动运行 auto-memory 整合                                           | `/dream`                                                                                                  |
| `/hooks`          | 管理 Qwen Code hooks                                                           | `/hooks`, `/hooks list`                                                                                   |
| `/reload-plugins` | 从磁盘重新加载扩展变更（命令、skills、agents、hooks、MCP/LSP 服务器）           | `/reload-plugins`                                                                                         |
| `/permissions`    | 管理权限规则                                                          | `/permissions`                                                                                            |
| `/agents`         | 管理 subagents                                                                 | `/agents manage`, `/agents create`                                                                        |
| `/arena`          | 管理 Arena 会话                                                            | `/arena start`, `/arena stop`, `/arena status`, `/arena select` (别名 `choose`)                          |
| `/goal`           | 设置目标 — 持续工作直到满足条件                                    | `/goal <condition>`, `/goal clear`                                                                        |
| `/tasks`          | 列出后台任务                                                            | `/tasks`                                                                                                  |
| `/workflows`      | 检查 workflow 运行；协作式暂停/恢复后台运行                                  | `/workflows`, `/workflows <runId>`, `/workflows p <runId>`                                                |
| `/lsp`            | 显示 LSP 服务器状态                                                           | `/lsp`                                                                                                    |
| `/trust`          | 管理文件夹信任设置                                                     | `/trust`                                                                                                  |
> [!warning]
>
> 仅从你信任的来源安装扩展（`/extensions install`）。扩展可以捆绑 MCP 服务器、skill 和命令，它们以与 Qwen Code 本身相同的权限运行——它们可以访问你的文件、API key 和对话数据。`/extensions install` 不会提示确认。

> [!warning]
>
> `auto-edit`、`auto` 和 `yolo` 审批模式会绕过工具执行的审批提示。在 `yolo` 模式下，所有操作——包括 shell 命令、文件写入和网络请求——都会在没有确认的情况下运行。请仅在受信任、沙盒化或一次性的环境中使用这些模式。

> [!note]
>
> `/workflows`、`/lsp` 和 `/trust` 仅在其对应功能启用时才会注册——分别通过 `QWEN_CODE_ENABLE_WORKFLOWS=1` 环境变量、`--experimental-lsp` CLI 标志和 `security.folderTrust.enabled` 设置。禁用时它们不会出现，并会报告未知命令。同样，`/dream` 和 `/forget` 仅在托管 auto-memory 可用时才会注册；不可用时它们不会出现。

### 1.5 内置 Skills

这些命令调用内置的 skill，提供专门的工作流。

| 命令         | 描述                                                        | 使用示例                                          |
| ------------ | ----------------------------------------------------------- | ------------------------------------------------- |
| `/review`    | 多代理代码审查（high effort 下 12 个并行代理）         | `/review`, `/review 123`, `/review 123 --comment`, `/review --effort low` |
| `/coordinate`| 协调只读 worker 和一个可选的 worktree writer            | `/coordinate investigate and fix the authentication regression`           |
| `/loop`      | 按定期计划运行 prompt                                       | `/loop 5m check the build`                        |
| `/simplify`  | 审查最近的更改并直接应用安全的清理编辑                      | `/simplify`, `/simplify focus on duplication`     |
| `/qc-helper` | 回答有关 Qwen Code 使用和配置的问题                         | `/qc-helper how do I configure MCP?`              |

有关 `/review` 的完整文档，请参阅 [Code Review](./code-review.md)。

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
| -------------------- | --------------------------------------------------- |
| `Escape`             | 取消（加载中时）或关闭（完成后）                    |
| `Space` 或 `Enter`   | 关闭答案（当输入为空时）                            |
| `Ctrl+C` 或 `Ctrl+D` | 取消正在进行的侧边问题                            |

**示例：**

```
（当主对话正在重构代码时）

> /btw JavaScript 中 let 和 var 有什么区别？

  ╭──────────────────────────────────────────╮
  │ /btw JavaScript 中 let 和 var 有什么     │
  │     区别？                               │
  │                                          │
  │ + 正在回答...                            │
  │ 按 Escape、Ctrl+C 或 Ctrl+D 取消         │
  ╰──────────────────────────────────────────╯
  > (Composer 保持活跃——继续输入)

（答案到达后）

  ╭──────────────────────────────────────────╮
  │ /btw JavaScript 中 let 和 var 有什么     │
  │     区别？                               │
  │                                          │
  │ `let` 是块级作用域，而 `var` 是          │
  │ 函数作用域。`let` 在 ES6 中引入，        │
  │ 且不会以相同的方式提升。                 │
  │                                          │
  │ 按 Space、Enter 或 Escape 关闭           │
  ╰──────────────────────────────────────────╯
  > (Composer 仍然活跃)
```

**支持的执行模式：**

| 模式                 | 行为                                         |
| -------------------- | -------------------------------------------- |
| Interactive          | 在 Composer 上方显示，支持 Markdown 渲染     |
| Non-interactive      | 返回文本结果：`btw> question\nanswer`        |
| ACP (Agent Protocol) | 返回 `stream_messages` 异步生成器            |

> [!tip]
>
> 当你需要快速得到答案而不偏离主任务时，请使用 `/btw`。它对于澄清概念、核实事实或在专注于主要工作流时获取快速解释特别有用。

### 1.7 会话回顾 (`/recap`)

`/recap` 命令会生成当前会话的简短“上次离开时”摘要，以便你可以恢复旧对话，而无需向上翻阅数页历史记录。

| 命令     | 描述                                     |
| -------- | ---------------------------------------- |
| `/recap` | 生成并显示单行会话回顾                   |

**工作原理：**

- 可用时使用配置的快速模型（`fastModel` 设置），否则回退到主会话模型。对于回顾来说，一个小巧、低成本的模型就足够了。
- 最近的对话（最多 30 条消息，仅限文本——工具调用和工具响应会被过滤掉）会连同严格的 system prompt 一起发送给模型。
- 回顾内容以暗色渲染，并带有 `❯` 前缀，以便与真实的助手回复区分开来。
- 如果模型轮次正在进行或另一个命令正在处理，则会以内联错误拒绝。如果没有可用的对话，或者底层生成失败，`/recap` 会显示一条简短的信息消息而不是回顾——手动命令始终会返回某些内容。

**离开后返回时自动触发：**

如果终端失去焦点 **5 分钟以上**并重新获得焦点，会自动生成并显示回顾（仅在没有模型响应正在进行时；否则会等待当前轮次完成后再触发）。与手动命令不同，自动触发在失败时完全静默：如果生成出错或没有可总结的内容，则不会向历史记录中添加任何消息。由 `general.showSessionRecap` 设置控制（默认值：`false`）；手动 `/recap` 命令始终有效，不受此设置影响。

**示例：**

```
> /recap

❯ 重构 loopDetectionService.ts 以解决由无界的 streamContentHistory 和
  contentStats 引起的长会话 OOM 问题。下一步是实施选项 B（使用 FNV-1a
  的 LRU 滑动窗口），等待确认。
```

> [!tip]
>
> 通过 `/model --fast <model>`（例如 `qwen3-coder-flash`）配置快速模型，以使 `/recap` 快速且低成本。将 `general.showSessionRecap` 设置为 `true` 以启用自动触发；手动 `/recap` 命令始终有效，不受此设置影响。

### 1.8 Diff 查看器 (`/diff`)

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
┌ /diff · 轮次 3 "重构 auth 中间件" ──── 3 个文件 +45 -12 ──────────┐
│                                                                     │
│ ◀ Current · T3 · T2 · T1 ▶                                         │
│                                                                     │
│ › src/utils/parser.ts                              +30 -8           │
│   src/utils/parser.test.ts                         +12 -2           │
│   README.md                                        +3 -2            │
│                                                                     │
│ ←/→ 来源 · ↑/↓ 文件 · Enter 查看 · Esc 关闭                        │
└─────────────────────────────────────────────────────────────────────┘
```

**非交互模式：**

在无头（`--prompt`）或非交互上下文中，`/diff` 会打印工作树与 HEAD 对比的纯文本摘要。不提供每个轮次的导航。

```
3 个文件已更改，+45 / -12
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

### 1.9 信息、设置和帮助

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
> `/config` 通过点分路径键（如 `general.vimMode`）读写各项设置，作为交互式 `/settings` 编辑器的补充。不带参数（或带 `--help`）运行 `/config` 会列出所有可设置的键及其类型和当前值。`/config <key>` 会打印当前值——但对于布尔键，它会切换该值。`/config <key>=<value>` 用于设置值。更改会写入用户设置文件（`~/.qwen/settings.json`）。只有 `boolean`、`string`、`number` 和 `enum` 类型的设置可以通过这种方式修改——`array` 和 `object` 类型的设置必须直接在 `settings.json` 中编辑。敏感值（API 密钥、token、base URL）在输出中会被掩码处理，并且禁止将 `tools.approvalMode` 设置为 `yolo`。

### 1.10 常用快捷键

| 快捷键             | 功能                  | 说明                                                                      |
| ------------------ | --------------------- | ------------------------------------------------------------------------- |
| `Ctrl/cmd+L`       | 清屏                | 仅清除可见屏幕（不会像 `/clear` 那样重置会话）                            |
| `Ctrl/cmd+T`       | 切换工具描述          | MCP 工具管理                                                              |
| `Ctrl/cmd+C`×2     | 退出确认              | 安全退出机制                                                              |
| `Ctrl/cmd+Z`       | 撤销输入              | 文本编辑                                                                  |
| `Ctrl/cmd+Shift+Z` | 重做输入              | 文本编辑                                                                  |

### 1.11 身份验证命令

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
| `@<file path>`      | 注入指定文件的内容                     | `@src/main.py 请解释这段代码`                    |
| `@<directory path>` | 递归读取目录下的所有文本文件           | `@docs/ 总结该文档的内容`                        |
| 单独的 `@`          | 用于讨论 `@` 符号本身时使用            | `@ 这个符号在编程中是用来做什么的？`             |

注意：路径中的空格需要使用反斜杠进行转义（例如：`@My\ Documents/file.txt`）

## 3. 感叹号命令（`!`）- Shell 命令执行

感叹号命令允许你直接在 Qwen Code 中执行系统命令。

| 命令格式             | 说明                                                     | 示例                                 |
| -------------------- | -------------------------------------------------------- | ------------------------------------ |
| `!<shell command>`   | 在子 Shell 中执行命令                                    | `!ls -la`、`!git status`             |
| 单独的 `!`           | 切换 Shell 模式，任何输入都会直接作为 Shell 命令执行     | `!`(进入) → 输入命令 → `!`(退出)     |

环境变量：通过 `!` 执行的命令会设置 `QWEN_CODE=1` 环境变量。

## 4. 自定义命令

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
| `~/.qwen/commands/test.md`             | `/test`         | `/test 参数`          |
| `<project>/.qwen/commands/git/commit.md` | `/git:commit`   | `/git:commit 信息`    |

命名规则：路径分隔符（`/` 或 `\`）转换为冒号（`:`）

### Markdown 文件格式规范（推荐）

自定义命令使用带有可选 YAML frontmatter 的 Markdown 文件：

```markdown
---
description: 可选的描述（在 /help 中显示）
---

你的提示词内容。
使用 {{args}} 进行参数注入。
```

| 字段          | 是否必填 | 说明                                   | 示例                                       |
| ------------- | -------- | -------------------------------------- | ------------------------------------------ |
| `description` | 可选     | 命令描述（在 /help 中显示）            | `description: 代码分析工具`                |
| 提示词正文    | 必填     | 发送给模型的提示词内容                 | frontmatter 之后的任意 Markdown 内容       |

### TOML 文件格式（已弃用）

> [!warning]
>
> **已弃用：** TOML 格式仍受支持，但将在未来版本中移除。请迁移到 Markdown 格式。

| 字段          | 是否必填 | 说明                                   | 示例                                       |
| ------------- | -------- | -------------------------------------- | ------------------------------------------ |
| `prompt`      | 必填     | 发送给模型的提示词内容                 | `prompt = "请分析代码：{{args}}"`          |
| `description` | 可选     | 命令描述（在 /help 中显示）            | `description = "代码分析工具"`             |

### 参数处理机制

| 处理方式                 | 语法               | 适用场景                             | 安全特性                               |
| ------------------------ | ------------------ | ------------------------------------ | -------------------------------------- |
| 上下文感知注入           | `{{args}}`         | 需要精确控制参数                     | 自动进行 Shell 转义                    |
| 默认参数处理             | 无特殊标记         | 简单命令，追加参数                   | 原样追加                               |
| Shell 命令注入           | `!{command}`       | 需要动态内容                         | 执行前需要确认                         |

#### 1. 上下文感知注入（`{{args}}`）

| 场景             | TOML 配置                             | 调用方式              | 实际效果               |
| ---------------- | ------------------------------------- | --------------------- | ---------------------- |
| 原始注入         | `prompt = "Fix: {{args}}"`            | `/fix "Button issue"` | `Fix: "Button issue"`  |
| 在 Shell 命令中  | `prompt = "Search: !{grep {{args}} .}"` | `/search "hello"`     | 执行 `grep "hello" .`  |

#### 2. 默认参数处理

| 输入情况   | 处理方式                                         | 示例                                         |
| ---------- | ------------------------------------------------ | -------------------------------------------- |
| 有参数     | 追加到提示词末尾（用两个换行符分隔）             | `/cmd 参数` → 原始提示词 + 参数              |
| 无参数     | 原样发送提示词                                   | `/cmd` → 原始提示词                          |

🚀 动态内容注入

| 注入类型       | 语法             | 处理顺序   | 用途                             |
| -------------- | ---------------- | ---------- | -------------------------------- |
| 文件内容       | `@{file path}`   | 首先处理   | 注入静态参考文件                 |
| Shell 命令     | `!{command}`     | 中间处理   | 注入动态执行结果                 |
| 参数替换       | `{{args}}`       | 最后处理   | 注入用户参数                     |

#### 3. Shell 命令执行（`!{...}`）

| 操作                          | 用户交互             |
| ----------------------------- | -------------------- |
| 1. 解析命令和参数             | -                    |
| 2. 自动 Shell 转义            | -                    |
| 3. 显示确认对话框             | ✅ 用户确认          |
| 4. 执行命令                   | -                    |
| 5. 将输出注入到提示词中       | -                    |

示例：生成 Git Commit 信息

````markdown
---
description: 基于暂存区的更改生成 Commit 信息
---

请根据以下 diff 生成 Commit 信息：

```diff
!{git diff --staged}
```
````

#### 4. 文件内容注入（`@{...}`）

| 文件类型   | 支持状态             | 处理方式                  |
| ---------- | -------------------- | ------------------------- |
| 文本文件   | ✅ 完全支持          | 直接注入内容              |
| 图片/PDF   | ✅ 多模态支持        | 编码并注入                |
| 二进制文件 | ⚠️ 有限支持          | 可能会被跳过或截断        |
| 目录       | ✅ 递归注入          | 遵循 .gitignore 规则      |

示例：代码审查命令

```markdown
---
description: 基于最佳实践的代码审查
---

审查 {{args}}，参考标准：

@{docs/code-standards.md}
```

### 实际创建示例

#### “纯函数重构”命令创建步骤表

| 操作                        | 命令/代码                                 |
| --------------------------- | ----------------------------------------- |
| 1. 创建目录结构             | `mkdir -p ~/.qwen/commands/refactor`      |
| 2. 创建命令文件             | `touch ~/.qwen/commands/refactor/pure.md` |
| 3. 编辑命令内容             | 参考下方的完整代码。                      |
| 4. 测试命令                 | `@file.js` → `/refactor:pure`             |

```markdown
---
description: 将代码重构为纯函数
---

请分析当前上下文中的代码，将其重构为纯函数。
要求：

1. 提供重构后的代码
2. 解释关键更改以及纯函数特性的实现
3. 保持函数功能不变
```

### 自定义命令最佳实践总结

#### 命令设计建议表

| 实践要点       | 推荐做法                          | 避免做法                                  |
| -------------- | --------------------------------- | ----------------------------------------- |
| 命令命名       | 使用命名空间进行组织              | 避免使用过于通用的名称                    |
| 参数处理       | 明确使用 `{{args}}`               | 依赖默认追加（容易混淆）                  |
| 错误处理       | 利用 Shell 错误输出               | 忽略执行失败                              |
| 文件组织       | 在目录中按功能进行组织            | 所有命令都放在根目录                      |
| 描述字段       | 始终提供清晰的描述                | 依赖自动生成的描述                        |
#### 安全特性提醒表

| 安全机制 | 防护效果 | 用户操作 |
| ---------------------- | -------------------------- | ---------------------- |
| Shell 转义 | 防止命令注入 | 自动处理 |
| 执行确认 | 避免误执行 | 对话框确认 |
| 错误报告 | 帮助诊断问题 | 查看错误信息 |

## 5. CLI 子命令

这些命令在启动交互式会话之前从 shell 中以 `qwen <subcommand>` 的形式运行。

### 会话管理

| 命令 | 描述 | 使用示例 |
| -------------------- | --------------------------------- | ------------------------------------------------------------ |
| `qwen sessions list` | 列出最近的对话会话 | `qwen sessions list`, `qwen sessions list --json --limit 50` |

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

“还有更多会话”的提示信息会通过 stderr 输出，因此通过管道传递给 `jq` 依然是安全的。

**示例：**

```bash
# 显示最近 20 个会话（默认）
qwen sessions list

# 显示最近 50 个会话
qwen sessions list --limit 50

# 以 JSON 格式输出，便于脚本处理
qwen sessions list --json | jq .
```