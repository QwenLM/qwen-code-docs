# 状态栏

> 在底部显示自定义信息。

状态栏会在底部左侧区域显示会话感知信息——模型名称、token 使用量、git 分支等。它有两种配置模式：

- **预设模式** — 通过交互式对话框或 JSON 配置从内置数据项中进行选择。无需编写脚本。
- **命令模式** — 运行一个 shell 命令，该命令通过 stdin 接收结构化的 JSON 上下文。提供完全的自定义格式灵活性。

```
单行状态（默认批准模式 — 1 行）：
┌─────────────────────────────────────────────────────────────────┐
│  user@host ~/project (main) ctx:34%   docker | Debug | 67%     │  ← 状态栏
└─────────────────────────────────────────────────────────────────┘

多行状态（最多 2 行 — 2 行）：
┌─────────────────────────────────────────────────────────────────┐
│  user@host ~/project (main) ctx:34%   docker | Debug | 67%     │  ← 状态栏 1
│  ████████░░░░░░░░░░ 34% context                                │  ← 状态栏 2
└─────────────────────────────────────────────────────────────────┘

多行状态 + 非默认模式（最多 3 行）：
┌─────────────────────────────────────────────────────────────────┐
│  user@host ~/project (main) ctx:34%   docker | Debug | 67%     │  ← 状态栏 1
│  ████████░░░░░░░░░░ 34% context                                │  ← 状态栏 2
│  auto-accept edits (shift + tab to cycle)                       │  ← 模式指示器
└─────────────────────────────────────────────────────────────────┘
```

配置后，状态栏会替换默认的 "? for shortcuts" 提示。高优先级消息（Ctrl+C/D 退出提示、Esc、vim INSERT 模式）会临时覆盖状态栏。状态栏文本会被截断以适应可用宽度。

## 快速设置

配置状态栏最简单的方法是使用 `/statusline` 命令。它会打开一个交互式对话框，你可以在其中选择预设项、切换主题颜色并查看实时预览：

```
/statusline
```

这将打开预设模式配置器。使用方向键导航，空格键切换选项，回车键确认。你的选择会自动保存到设置中。

你也可以向 `/statusline` 提供具体指令，让它生成命令模式配置：

```
/statusline show model name and context usage percentage
```

---

## 预设模式

预设模式提供了一组内置数据项，你可以挑选并组合它们——无需 shell 命令，无需 `jq`，无需编写脚本。各项会在一行内以 `item1 | item2 | item3` 的形式渲染。

### 配置

在 `~/.qwen/settings.json` 的 `ui` 键下添加 `statusLine` 对象：

```json
{
  "ui": {
    "statusLine": {
      "type": "preset",
      "items": [
        "model-with-reasoning",
        "git-branch",
        "context-remaining",
        "current-dir",
        "context-used"
      ],
      "useThemeColors": true
    }
  }
}
```

| 字段 | 类型 | 必填 | 描述 |
| --- | --- | --- | --- |
| `type` | `"preset"` | 是 | 必须为 `"preset"` |
| `items` | string[] | 是 | 要显示的预设项 ID 的有序列表（见下表）。各项之间使用 `\|` 作为分隔符连接。 |
| `useThemeColors` | boolean | 否 | 将当前 `/theme` 的颜色应用到状态栏文本。默认为 `true`。 |
| `hideContextIndicator` | boolean | 否 | 隐藏底部右侧区域内置的上下文使用指示器。默认为 `false`。 |

### 可用的预设项

| 项 ID | 默认 | 描述 |
| --- | --- | --- |
| `model-with-reasoning` | 是 | 当前模型名称及推理级别（例如 `qwen-3-235b high`） |
| `model` | | 当前模型名称，不含推理级别 |
| `git-branch` | 是 | 当前 Git 分支名称（不在 git 仓库中时隐藏） |
| `context-remaining` | 是 | 剩余上下文窗口百分比（例如 `Context 65.7% left`） |
| `total-input-tokens` | | 会话中累计使用的输入 token（例如 `30.0k total in`） |
| `total-output-tokens` | | 会话中累计使用的输出 token（例如 `5.0k total out`） |
| `current-dir` | 是 | 当前工作目录 |
| `project-name` | | 项目名称（工作目录的 basename） |
| `pull-request-number` | | 当前分支的未合并 PR 编号（需要 `gh` CLI） |
| `branch-changes` | | 会话文件变更统计（例如 `+120 -30`） |
| `context-used` | 是 | 已使用的上下文窗口百分比（例如 `Context 34.3% used`） |
| `run-state` | | 紧凑的会话状态（`Ready`、`Working` 或 `Confirm`） |
| `qwen-version` | | Qwen Code 版本（例如 `v0.14.1`） |
| `context-window-size` | | 总上下文窗口大小（例如 `131.1k window`） |
| `used-tokens` | | 当前 prompt 的 token 数量（例如 `45.0k used`） |
| `session-id` | | 当前会话标识符 |

标记为 **默认** 的项在首次打开 `/statusline` 对话框时会被预选。

`total-input-tokens` 和 `total-output-tokens` 是会话总计。它们会累加各轮次的 token 使用量，因此输入 token 可能会快速增长，因为每次新的模型请求都会再次包含当前的对话上下文。如果你想查看当前 prompt 的大小而不是累计的会话消耗，请使用 `used-tokens`。

### 输出示例

使用默认项时，状态栏看起来像这样：

```
qwen-3-235b high | main | Context 65.7% left | /home/user/project | Context 34.3% used
```

### 通过对话框自定义

运行 `/statusline` 会打开一个交互式多选对话框：

```
┌ Configure Status Line ────────────────────────────────────────┐
│ 选择要在状态栏中显示的项目。                                  │
│                                                               │
│ 输入以搜索                                                    │
│ >                                                             │
│                                                               │
│ [x] Use theme colors        应用当前 /theme 的颜色            │
│ ───────────────────────                                       │
│ [x] model-with-reasoning    包含推理级别的当前模型名称        │
│ [ ] model-only              不含推理级别的当前模型名称        │
│ [x] git-branch              可用时的当前 Git 分支             │
│ [x] context-remaining       剩余上下文百分比                  │
│ ...                                                           │
│                                                               │
│ 预览                                                          │
│ qwen-3-235b high | main | Context 65.7% left                 │
│                                                               │
│ 使用上下方向键导航，空格键选择，回车键确认                    │
└───────────────────────────────────────────────────────────────┘
```

- 输入以按名称或描述过滤项目
- 切换项目时实时预览会更新
- 按回车键保存配置

---

## 命令模式

命令模式运行一个 shell 命令，其 stdout 会显示在状态栏中。该命令通过 stdin 接收结构化的 JSON 上下文，以输出会话感知内容。

### 前提条件

- 建议使用 [`jq`](https://jqlang.github.io/jq/) 来解析 JSON 输入（通过 `brew install jq`、`apt install jq` 等安装）
- 不需要 JSON 数据的简单命令（例如 `git branch --show-current`）无需 `jq` 即可工作

### 配置

在 `~/.qwen/settings.json` 的 `ui` 键下添加 `statusLine` 对象：

```json
{
  "ui": {
    "statusLine": {
      "type": "command",
      "command": "input=$(cat); model=$(echo \"$input\" | jq -r '.model.display_name'); pct=$(echo \"$input\" | jq -r '.context_window.used_percentage'); echo \"$model  ctx:${pct}%\""
    }
  }
}
```

| 字段 | 类型 | 必填 | 描述 |
| --- | --- | --- | --- |
| `type` | `"command"` | 是 | 必须为 `"command"` |
| `command` | string | 是 | 要执行的 Shell 命令。通过 stdin 接收 JSON，stdout 会被显示（最多 2 行）。 |
| `refreshInterval` | number | 否 | 每 N 秒重新运行一次命令（最小为 1）。适用于在没有 Agent 状态事件时发生变化的数据（时钟、配额、运行时间）。 |
| `respectUserColors` | boolean | 否 | 保留命令输出中的 ANSI 颜色代码，而不是应用变暗的底部样式。默认为 `false`。 |
| `hideContextIndicator` | boolean | 否 | 隐藏底部右侧区域内置的上下文使用指示器。默认为 `false`。 |

### JSON 输入

该命令通过 stdin 接收一个包含以下字段的 JSON 对象：

```json
{
  "session_id": "abc-123",
  "version": "0.14.1",
  "model": {
    "display_name": "qwen-3-235b"
  },
  "context_window": {
    "context_window_size": 131072,
    "used_percentage": 34.3,
    "remaining_percentage": 65.7,
    "current_usage": 45000,
    "total_input_tokens": 30000,
    "total_output_tokens": 5000
  },
  "workspace": {
    "current_dir": "/home/user/project"
  },
  "git": {
    "branch": "main"
  },
  "worktree": {
    "name": "fix-auth",
    "path": "/home/user/project/.qwen/worktrees/fix-auth",
    "branch": "fix-auth",
    "original_cwd": "/home/user/project",
    "original_branch": "main"
  },
  "metrics": {
    "models": {
      "qwen-3-235b": {
        "api": {
          "total_requests": 10,
          "total_errors": 0,
          "total_latency_ms": 5000
        },
        "tokens": {
          "prompt": 30000,
          "completion": 5000,
          "total": 35000,
          "cached": 10000,
          "thoughts": 2000
        }
      }
    },
    "files": {
      "total_lines_added": 120,
      "total_lines_removed": 30
    }
  },
  "vim": {
    "mode": "INSERT"
  }
}
```

| 字段 | 类型 | 描述 |
| --- | --- | --- |
| `session_id` | string | 唯一的会话标识符 |
| `version` | string | Qwen Code 版本 |
| `model.display_name` | string | 当前模型名称 |
| `context_window.context_window_size` | number | 上下文窗口总大小（以 token 为单位） |
| `context_window.used_percentage` | number | 上下文窗口使用百分比（0–100） |
| `context_window.remaining_percentage` | number | 上下文窗口剩余百分比（0–100） |
| `context_window.current_usage` | number | 上次 API 调用的 token 数量（当前上下文大小） |
| `context_window.total_input_tokens` | number | 本次会话消耗的总输入 token |
| `context_window.total_output_tokens` | number | 本次会话消耗的总输出 token |
| `workspace.current_dir` | string | 当前工作目录 |
| `git` | object \| absent | 仅在 git 仓库内时存在。 |
| `git.branch` | string | 当前分支名称 |
| `worktree` | object \| absent | 仅在处于活动 worktree（由 `enter_worktree` 创建）内时存在。 |
| `worktree.name` | string | Worktree 的 slug 名称 |
| `worktree.path` | string | worktree 目录的绝对路径 |
| `worktree.branch` | string | 在 worktree 中检出的分支 |
| `worktree.original_cwd` | string | 进入 worktree 前的工作目录 |
| `worktree.original_branch` | string | 进入 worktree 前活动的分支 |
| `metrics.models.<id>.api` | object | 每个模型的 API 统计：`total_requests`、`total_errors`、`total_latency_ms` |
| `metrics.models.<id>.tokens` | object | 每个模型的 token 使用量：`prompt`、`completion`、`total`、`cached`、`thoughts` |
| `metrics.files` | object | 文件变更统计：`total_lines_added`、`total_lines_removed` |
| `vim` | object \| absent | 仅在启用 vim 模式时存在。包含 `mode`（`"INSERT"` 或 `"NORMAL"`）。 |

> **重要：** stdin 只能读取一次。请务必先将其存储在变量中：`input=$(cat)`。

### 示例

#### 模型和 token 使用量

```json
{
  "ui": {
    "statusLine": {
      "type": "command",
      "command": "input=$(cat); model=$(echo \"$input\" | jq -r '.model.display_name'); pct=$(echo \"$input\" | jq -r '.context_window.used_percentage'); echo \"$model  ctx:${pct}%\""
    }
  }
}
```

输出：`qwen-3-235b  ctx:34%`

#### Git 分支 + 目录

```json
{
  "ui": {
    "statusLine": {
      "type": "command",
      "command": "input=$(cat); branch=$(echo \"$input\" | jq -r '.git.branch // empty'); dir=$(basename \"$(echo \"$input\" | jq -r '.workspace.current_dir')\"); echo \"$dir${branch:+ ($branch)}\""
    }
  }
}
```

输出：`my-project (main)`

> 注意：`git.branch` 字段已直接在 JSON 输入中提供——无需通过 shell 调用 `git`。

#### 文件变更统计

```json
{
  "ui": {
    "statusLine": {
      "type": "command",
      "command": "input=$(cat); added=$(echo \"$input\" | jq -r '.metrics.files.total_lines_added'); removed=$(echo \"$input\" | jq -r '.metrics.files.total_lines_removed'); echo \"+$added/-$removed lines\""
    }
  }
}
```

输出：`+120/-30 lines`

#### 实时时钟和 git 分支

当状态栏显示的数据在没有 Agent 事件的情况下发生变化时（例如时钟、运行时间或速率限制计数器），请使用 `refreshInterval`：

```json
{
  "ui": {
    "statusLine": {
      "type": "command",
      "command": "input=$(cat); branch=$(echo \"$input\" | jq -r '.git.branch // \"no-git\"'); echo \"$(date +%H:%M:%S)  ($branch)\"",
      "refreshInterval": 1
    }
  }
}
```

输出（每秒刷新）：`14:32:07  (main)`

#### 用于复杂命令的脚本文件

对于较长的命令，可以在 `~/.qwen/statusline-command.sh` 保存一个脚本文件：

```bash
#!/bin/bash
input=$(cat)
model=$(echo "$input" | jq -r '.model.display_name')
pct=$(echo "$input" | jq -r '.context_window.used_percentage')
branch=$(echo "$input" | jq -r '.git.branch // empty')
added=$(echo "$input" | jq -r '.metrics.files.total_lines_added')
removed=$(echo "$input" | jq -r '.metrics.files.total_lines_removed')

parts=()
[ -n "$model" ] && parts+=("$model")
[ -n "$branch" ] && parts+=("($branch)")
[ "$pct" != "0" ] 2>/dev/null && parts+=("ctx:${pct}%")
([ "$added" -gt 0 ] || [ "$removed" -gt 0 ]) 2>/dev/null && parts+=("+${added}/-${removed}")

echo "${parts[*]}"
```

然后在设置中引用它：

```json
{
  "ui": {
    "statusLine": {
      "type": "command",
      "command": "bash ~/.qwen/statusline-command.sh"
    }
  }
}
```

## 行为

**两种模式共有：**

- **更新触发**：当模型更改、发送新消息（token 计数变化）、切换 vim 模式、git 分支更改、工具调用完成或文件发生更改时，状态栏会更新。更新会进行防抖处理（300ms）。
- **输出**：最多 2 行。每一行都会在底部左侧区域渲染为单独的一行。超出可用宽度的行会被截断。
- **热重载**：设置中 `ui.statusLine` 的更改会立即生效——无需重启。
- **移除**：从设置中删除 `ui.statusLine` 键即可禁用。"? for shortcuts" 提示将恢复。

**仅命令模式：**

- **超时**：执行时间超过 5 秒的命令会被终止。失败时状态栏会清空。
- **刷新**：设置 `refreshInterval`（秒）以额外在定时器上重新运行命令——适用于在没有 Agent 事件时发生变化的数据（时钟、速率限制、构建状态）。
- **Shell**：命令在 macOS/Linux 上通过 `/bin/sh` 运行。在 Windows 上，默认使用 `cmd.exe`——请将 POSIX 命令包装在 `bash -c "..."` 中，或指向一个 bash 脚本（例如 `bash ~/.qwen/statusline-command.sh`）。

**仅预设模式：**

- **无外部依赖**：预设项在内部计算——无需 shell 命令，无需 `jq`，无超时问题。
- **主题集成**：当 `useThemeColors` 为 `true`（默认）时，状态栏文本使用当前 `/theme` 的颜色。当为 `false` 时，应用变暗的底部样式。
- **PR 查找**：`pull-request-number` 项会在后台运行 `gh pr view`（2 秒超时）。它仅在分支更改时触发，而不是在每次更新时触发。

## 故障排除

| 问题 | 原因 | 修复方法 |
| --- | --- | --- |
| 状态栏未显示 | 配置路径错误 | 必须位于 `ui.statusLine` 下，而不是根级别的 `statusLine` |
| 输出为空（命令模式） | 命令静默失败 | 手动测试：`echo '{"session_id":"test","version":"0.14.1","model":{"display_name":"test"},"context_window":{"context_window_size":0,"used_percentage":0,"remaining_percentage":100,"current_usage":0,"total_input_tokens":0,"total_output_tokens":0},"workspace":{"current_dir":"/tmp"},"metrics":{"models":{},"files":{"total_lines_added":0,"total_lines_removed":0}}}' \| sh -c 'your_command'` |
| 数据过时（命令模式） | 未触发更新 | 发送消息或切换模型以触发更新——或设置 `refreshInterval` 以在定时器上重新运行命令 |
| 命令执行过慢 | 脚本复杂 | 优化脚本或将繁重的工作移至后台缓存 |
| 预设项缺失 | 条件项没有数据 | `git-branch` 在 git 仓库外隐藏；当使用量为 0 时 `context-used` 隐藏；当没有文件更改时 `branch-changes` 隐藏。这是预期行为——一旦数据可用，这些项就会出现 |
| PR 编号未显示 | 未安装 `gh` CLI | 安装 [GitHub CLI](https://cli.github.com/) 并使用 `gh auth login` 进行身份验证。查找操作带有 2 秒超时 |