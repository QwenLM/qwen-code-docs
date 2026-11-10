# CLI 命令参考

在终端执行 `qwen --help`，在交互会话中执行 `/help`。这两类命令属于不同入口。下列内容覆盖公开帮助中的根参数、用户斜杠命令与扩展子命令；隐藏的宿主协议和开发诊断入口不作为稳定公共 API。

```sh
qwen
qwen "Explain this project"
qwen -p "Summarize the README"
qwen --help
qwen --version
```

位置参数是初始提示；`-p` 是打印模式开关。含多个工具名等变长参数后，用 `--` 隔开提示，避免被参数吞掉。示例要求已经配置可用模型。

## 根参数

| 语法 | 用途 |
| --- | --- |
| `-d, --debug` | 调试模式 |
| `-m, --model <model>` | 本次会话的模型 |
| `--reasoning-effort <level>` | 推理强度 |
| `--thinking <mode>` | 思考模式：auto/adaptive/enabled/disabled |
| `--thinking-budget <tokens>` | 固定思考 token 预算，并启用 thinking |
| `--context-window <size>` | 支持模型的显式上下文窗口 |
| `--list-models` | 列出当前用户可用模型 |
| `-i, --prompt-interactive <text>` | 执行提示后继续交互 |
| `-w, --cwd <dir>` | 启动前切换目录 |
| `--config-dir <dir>` | 本次用户配置根目录 |
| `--worktree [name]` | 启动新的 Git worktree，可指定名称 |
| `--permission-mode <mode>` | 权限模式 |
| `--dangerously-skip-permissions` | 跳过普通授权请求；不可跳过的检查仍适用 |
| `--allowed-mcp-server-names <name>` | 允许的 MCP 服务名，可重复 |
| `--tools <tools...>` | 限制内置工具；空字符串禁用全部，default 使用全部 |
| `--allowed-tools <tool>` | 允许的工具，可重复 |
| `--disallowed-tools <tool>` | 拒绝的工具，可重复 |
| `--attachment <file>` | 向初始提示添加文件附件 |
| `--plugin-dir <dir>` | 本次额外插件目录 |
| `-c, --continue` | 继续最近会话 |
| `--fork-session` | 恢复时派生为新会话 |
| `-r, --resume [id]` | 恢复指定会话或选择会话 |
| `-n, --name <name>` | 会话名称 |
| `--session-id <id>` | 指定会话 UUID |
| `--list-sessions` | 列出会话 |
| `--delete-session <index>` | 删除会话 |
| `--add-dir <dir>` | 额外工作目录 |
| `-o, --output-format <format>` | 输出格式 |
| `--input-format <format>` | 输入格式 |
| `--max-output-tokens <size>` | 最大输出 token 数 |
| `-p, --print` | 打印模式，处理请求后退出 |
| `--no-session-persistence` | 不持久化本次会话 |
| `--agent <name>` | 使用指定 Agent |
| `--agents <json>` | JSON 格式 Agent 定义 |
| `--append-system-prompt <text>` | 追加系统提示 |
| `--system-prompt <text>` | 替换系统提示 |
| `--output-style <style>` | 输出风格 |
| `--max-model-request-retries <count>` | 模型请求最大重试次数 |
| `--mcp-config <config>` | MCP 配置 JSON 或文件 |
| `--strict-mcp-config` | 仅使用显式 MCP 配置 |
| `--setting-sources <source>` | 启用的设置来源 |
| `--settings <json>` | 本次覆盖设置：JSON 或文件 |

`--help` 与 `--version` 由命令框架提供。工具允许规则不会替代项目信任或组织限制。`--dangerously-skip-permissions` 会跳过普通权限确认，应先阅读[权限](/zh/users/permissions/)。模型是否支持思考与上下文参数取决于所选模型。

## 交互式斜杠命令

| 命令 | 用途 |
| --- | --- |
| `/about` | 版本信息 |
| `/add-dir` | 添加工作目录 |
| `/agents` | 管理 Agent |
| `/branch` | 从当前对话创建分支 |
| `/btw` | 不打断主对话的旁支提问 |
| `/clear` | 清屏并开始新对话 |
| `/commands` | 重新加载并列出斜杠命令 |
| `/compact` | 将上下文压缩为摘要 |
| `/context` | 显示上下文占用 |
| `/context-window` | 设置当前模型上下文窗口 |
| `/continue` | 继续当前项目最近会话 |
| `/copy` | 复制最近回答；/copy N 复制倒数第 N 条 |
| `/corgi` | 切换 corgi 模式 |
| `/diff` | 查看未提交 Git 差异 |
| `/editor` | 设置外部编辑器 |
| `/effort` | 设置推理强度 |
| `/export` | 导出对话到文件或剪贴板 |
| `/goal` | 设置和管理持续目标 |
| `/help` | 查看帮助与快捷键 |
| `/hooks` | 管理 Hooks |
| `/init` | 分析项目并生成上下文指令文件 |
| `/insights` | 分析本地会话并生成报告 |
| `/marketplace` | 管理插件市场 |
| `/mcp` | 管理 MCP 服务 |
| `/memory` | 管理记忆 |
| `/model` | 选择或配置模型 |
| `/new` | 开始新对话 |
| `/output-style` | 配置下一次对话的输出风格 |
| `/permissions` | 管理权限 |
| `/plan` | 切换规划模式 |
| `/plugins` | 管理插件 |
| `/quit` | 退出 |
| `/release-notes` | 查看近期版本说明 |
| `/rename` | 重命名会话 |
| `/resume` | 按标识恢复会话或打开浏览器 |
| `/review` | 审查代码差异 |
| `/rewind` | 打开回退选择器 |
| `/settings` | 查看与编辑设置 |
| `/shortcuts` | 切换快捷键面板 |
| `/skills` | 管理 Skills |
| `/status` | 查看会话状态 |
| `/statusline` | 借助子 Agent 生成状态栏脚本 |
| `/subtask` | 以完整上下文启动后台子任务 |
| `/tasks` | 查看后台任务面板 |
| `/theme` | 切换主题 |
| `/tools` | 查看工具 |
| `/usage` | 查看本次会话用量 |
| `/vim` | 切换 Vim 模式 |
| `/workflows` | 浏览 Workflow 任务 |
| `/auth` | 连接或切换账号/提供商；别名 `/connect`、`/login` |
| `/logout` | 退出当前账号登录；别名 `/signout` |
| `/terminal-setup` | 在支持的交互终端中配置终端集成 |

常用别名包括 `/compact` 的 `/summarize`、`/compress`，`/rewind` 的 `/checkpoint`，`/tasks` 的 `/bg`、`/background`，`/settings` 的 `/config`，以及 `/quit` 的 `/exit`。

命令列表不是所有环境都启用的承诺：规划和 Agent 可被设置关闭；`/subtask` 需要完成首次对话且不支持嵌套 fork；`/terminal-setup` 不用于 ACP 会话。Skills、插件和工作流还可动态注册命令，通过 `/commands` 查看当前结果。

## 终端子命令

每组支持的操作如下。先运行对应 `--help` 查看参数和作用域，再按指南操作。

| 入口 | 操作 | 指南 |
| --- | --- | --- |
| `qwen mcp` | `add`, `add-json`, `remove`, `get`, `list`, `enable`, `disable`, `reset-project-choices` | [MCP](/zh/users/mcp/) |
| `qwen plugins` | `list`, `validate`, `install`, `uninstall`, `enable`, `disable`, `update`, `marketplace` | [Plugins](/zh/users/plugins/) |
| `qwen skills` | `list`, `enable`, `disable`, `install`, `link`, `uninstall` | [Skills](/zh/users/skills/) |
| `qwen agents` | `list` | [Agents](/zh/users/subagents/) |
| `qwen hooks` | `migrate` | [Hooks](/zh/users/hooks/) |
| `qwen update` | `--check` | [Installation](/zh/users/installation/) |
| `qwen rollback` | `--to` | [Installation](/zh/users/installation/) |

更新和回退依赖安装状态及可用发行源。安装方法见[安装与更新](/zh/users/installation/)。有关脚本输入输出见[非交互模式](/zh/users/headless/)。
