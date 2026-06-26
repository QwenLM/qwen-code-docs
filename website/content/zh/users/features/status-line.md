# 状态行

> 在底部脚注区域显示自定义信息。

状态行在脚注左侧区域显示与会话相关的信息——模型名称、token 用量、Git 分支等。有两种配置模式：

- **预设模式** — 通过交互式对话框或 JSON 配置从内置数据项中选择。无需编写脚本。
- **命令模式** — 运行一个 shell 命令，该命令通过 stdin 接收结构化的 JSON 上下文。提供完全灵活的自定义格式。

```
单行状态（默认审批模式 — 1 行）：
┌─────────────────────────────────────────────────────────────────┐
│  user@host ~/project (main) ctx:34%   🔒 docker | Debug | 67%  │  ← 状态行
└─────────────────────────────────────────────────────────────────┘

多行状态（最多 2 行 — 2 行）：
┌─────────────────────────────────────────────────────────────────┐
│  user@host ~/project (main) ctx:34%   🔒 docker | Debug | 67%  │  ← 状态行 1
│  ████████░░░░░░░░░░ 34% context                                │  ← 状态行 2
└─────────────────────────────────────────────────────────────────┘

多行状态 + 非默认模式（最多 3 行）：
┌─────────────────────────────────────────────────────────────────┐
│  user@host ~/project (main) ctx:34%   🔒 docker | Debug | 67%  │  ← 状态行 1
│  ████████░░░░░░░░░░ 34% context                                │  ← 状态行 2
│  auto-accept edits (shift + tab to cycle)                       │  ← 模式指示器
└─────────────────────────────────────────────────────────────────┘
```

配置后，状态行将替换默认的 "? for shortcuts" 提示。高优先级消息（Ctrl+C/D 退出提示、Esc、vim INSERT 模式）会临时覆盖状态行。状态行文本会被截断以适应当前可用宽度。

## 快速设置

配置状态行的最简单方式是使用 `/statusline` 命令。它会打开一个交互式对话框，您可以在其中选择预设项、切换主题颜色并查看实时预览：

```
/statusline
```

这将打开预设模式配置器。使用方向键导航，空格键切换选项，回车键确认。您的选择会自动保存到设置中。

您也可以为 `/statusline` 提供具体指令，让它生成一个命令模式配置：

```
/statusline show model name and context usage percentage
```

---

## 预设模式

预设模式提供了一组内置数据项，您可以挑选并组合——无需 shell 命令、无需 `jq`、无需脚本编写。项目以 `item1 | item2 | item3` 的形式显示在一行中。

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

| 字段                  | 类型         | 必需   | 描述                                                                                 |
| ---------------------- | ------------ | ------ | ------------------------------------------------------------------------------------ |
| `type`                 | `"preset"`   | 是     | 必须为 `"preset"`                                                                    |
| `items`                | string[]     | 是     | 要显示的有序预设项 ID 列表（见下表）。各项之间以 `\|` 作为分隔符。                  |
| `useThemeColors`       | boolean      | 否     | 将当前 `/theme` 颜色应用到状态行文本。默认值为 `true`。                             |
| `hideContextIndicator` | boolean      | 否     | 隐藏脚注右侧区域的内置上下文使用指示器。默认值为 `false`。                          |

### 可用预设项

| 项 ID                | 默认   | 描述                                      |
| -------------------- | ------ | ----------------------------------------- |
| `model-with-reasoning` | 是     | 当前模型名称及推理级别（如 `qwen-3-235b high`） |
| `model`                |        | 当前模型名称（不含推理级别）                        |
| `git-branch`           | 是     | 当前 Git 分支名称（不在 git 仓库中时隐藏）         |
| `context-remaining`    | 是     | 上下文窗口剩余百分比（如 `Context 65.7% left`）    |
| `total-input-tokens`   |        | 会话中累计使用的输入 token 数（如 `30.0k total in`）|
| `total-output-tokens`  |        | 会话中累计使用的输出 token 数（如 `5.0k total out`）|
| `current-dir`          | 是     | 当前工作目录                                |
| `project-name`         |        | 项目名称（工作目录的基名）                  |
| `pull-request-number`  |        | 当前分支对应的待处理 PR 编号（需要 `gh` CLI） |
| `branch-changes`       |        | 会话文件变更统计（如 `+120 -30`）           |
| `context-used`         | 是     | 上下文窗口已使用百分比（如 `Context 34.3% used`）|
| `run-state`            |        | 紧凑会话状态（`Ready`、`Working` 或 `Confirm`）|
| `qwen-version`         |        | Qwen Code 版本号（如 `v0.14.1`）           |
| `context-window-size`  |        | 总上下文窗口大小（如 `131.1k window`）      |
| `used-tokens`          |        | 当前提示的 token 数量（如 `45.0k used`）    |
| `session-id`           |        | 当前会话标识符                              |

标有**默认**的项在您首次打开 `/statusline` 对话框时已被预选。

`total-input-tokens` 和 `total-output-tokens` 是会话累计值。它们累加多轮对话中的 token 用量，因此输入 token 会快速增长，因为每个新模型请求都会再次包含当前对话上下文。如果您希望获取当前提示的大小而不是累计会话消耗，请使用 `used-tokens`。

### 示例输出

使用默认项时，状态行显示类似：

```
qwen-3-235b high | main | Context 65.7% left | /home/user/project | Context 34.3% used
```

### 通过对话框自定义

运行 `/statusline` 会打开一个交互式多选对话框：

```
┌ Configure Status Line ────────────────────────────────────────┐
│ Select which items to display in the status line.             │
│                                                               │
│ Type to search                                                │
│ >                                                             │
│                                                               │
│ [x] Use theme colors        Apply colors from the active /theme│
│ ───────────────────────                                       │
│ [x] model-with-reasoning    Current model name with reasoning │
│ [ ] model-only              Current model name without reason │
│ [x] git-branch              Current Git branch when available │
│ [x] context-remaining       Percentage of context remaining   │
│ ...                                                           │
│                                                               │
│ Preview                                                       │
│ qwen-3-235b high | main | Context 65.7% left                 │
│                                                               │
│ Use up/down to navigate, space to select, enter to confirm    │
└───────────────────────────────────────────────────────────────┘
```

- 输入可过滤项目名称或描述
- 实时预览随切换项目而更新
- 按回车键保存配置

---

## 命令模式

命令模式运行一个 shell 命令，其标准输出显示在状态行中。该命令通过 stdin 接收结构化的 JSON 上下文，以便生成会话感知的输出。

### 前提条件

- 推荐安装 [`jq`](https://jqlang.github.io/jq/) 来解析 JSON 输入（安装方式：`brew install jq`、`apt install jq` 等）
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

| 字段                  | 类型        | 必需   | 描述                                                                                                |
| --------------------- | ----------- | ------ | --------------------------------------------------------------------------------------------------- |
| `type`                | `"command"` | 是     | 必须为 `"command"`                                                                                  |
| `command`             | string      | 是     | 要执行的 shell 命令。通过 stdin 接收 JSON，标准输出最多显示 2 行。                                  |
| `refreshInterval`     | number      | 否     | 每隔 N 秒重新运行命令（最小 1 秒）。适用于那些不依赖 Agent 状态事件而变化的数据（时钟、配额、运行时间）。 |
| `respectUserColors`   | boolean     | 否     | 保留命令输出中的 ANSI 颜色代码，而不是应用暗色脚注样式。默认值为 `false`。                          |
| `hideContextIndicator`| boolean     | 否     | 隐藏脚注右侧区域的内置上下文使用指示器。默认值为 `false`。                                          |

### JSON 输入

命令通过 stdin 接收一个 JSON 对象，包含以下字段：

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

| 字段                                 | 类型             | 描述                                               |
| ------------------------------------ | ---------------- | -------------------------------------------------- |
| `session_id`                         | string           | 唯一会话标识符                                     |
| `version`                            | string           | Qwen Code 版本                                     |
| `model.display_name`                 | string           | 当前模型名称                                       |
| `context_window.context_window_size` | number           | 上下文窗口总大小（token 数）                       |
| `context_window.used_percentage`     | number           | 上下文窗口使用百分比（0–100）                      |
| `context_window.remaining_percentage`| number           | 上下文窗口剩余百分比（0–100）                      |
| `context_window.current_usage`       | number           | 上一次 API 调用的 token 数（当前上下文大小）       |
| `context_window.total_input_tokens`  | number           | 本会话中消耗的输入 token 总数                      |
| `context_window.total_output_tokens` | number           | 本会话中消耗的输出 token 总数                      |
| `workspace.current_dir`              | string           | 当前工作目录                                       |
| `git`                                | object \| absent | 仅在 git 仓库内时存在。                            |
| `git.branch`                         | string           | 当前分支名称                                       |
| `worktree`                           | object \| absent | 仅在处于活跃工作树（由 `enter_worktree` 创建）内时存在。 |
| `worktree.name`                      | string           | 工作树 slug 名称                                   |
| `worktree.path`                      | string           | 工作树目录的绝对路径                               |
| `worktree.branch`                    | string           | 工作树中检出的分支                                 |
| `worktree.original_cwd`              | string           | 进入工作树前的工作目录                             |
| `worktree.original_branch`           | string           | 进入工作树前活跃的分支                             |
| `metrics.models.<id>.api`            | object           | 每个模型的 API 统计信息：`total_requests`、`total_errors`、`total_latency_ms` |
| `metrics.models.<id>.tokens`         | object           | 每个模型的 token 使用情况：`prompt`、`completion`、`total`、`cached`、`thoughts` |
| `metrics.files`                      | object           | 文件变更统计：`total_lines_added`、`total_lines_removed` |
| `vim`                                | object \| absent | 仅在启用了 vim 模式时存在。包含 `mode`（`"INSERT"` 或 `"NORMAL"`）。|

> **重要提示：** stdin 只能读取一次。请务必先将其存储到变量中：`input=$(cat)`。

### 示例

#### 模型和 token 用量

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

> 注意：`git.branch` 字段直接由 JSON 输入提供——无需从 shell 中调用 `git`。

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

#### 实时时钟和 Git 分支

当状态行显示不依赖 Agent 事件而变化的数据（如时钟、运行时间或速率限制计数器）时，请使用 `refreshInterval`：

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

对于较长的命令，将脚本保存在 `~/.qwen/statusline-command.sh`：

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

- **更新触发条件**：状态行在以下情况下更新：模型改变、发送新消息（token 数变化）、vim 模式切换、git 分支变更、工具调用完成或文件发生更改。更新会进行防抖处理（300ms）。
- **输出**：最多 2 行。每一行在脚注左侧区域显示为单独的一行。超过可用宽度的行会被截断。
- **热重载**：对 `ui.statusLine` 的修改会立即生效——无需重启。
- **移除**：从设置中删除 `ui.statusLine` 键即可禁用。此时 "? for shortcuts" 提示会重新出现。

**仅命令模式：**

- **超时**：执行时间超过 5 秒的命令会被终止。失败时状态行会清除。
- **刷新**：设置 `refreshInterval`（秒）可以额外按定时器重新运行命令——适用于那些不依赖 Agent 事件而变化的数据（时钟、速率限制、构建状态）。
- **Shell**：在 macOS/Linux 上通过 `/bin/sh` 运行命令。在 Windows 上，默认使用 `cmd.exe`——请将 POSIX 命令包裹在 `bash -c "..."` 中或指向一个 bash 脚本（例如 `bash ~/.qwen/statusline-command.sh`）。

**仅预设模式：**

- **无外部依赖**：预设项在内部计算——无需 shell 命令、无需 `jq`、无超时。
- **主题集成**：当 `useThemeColors` 为 `true`（默认）时，状态行文本使用当前 `/theme` 颜色。当为 `false` 时，应用暗色脚注样式。
- **PR 查找**：`pull-request-number` 项会在后台运行 `gh pr view`（2 秒超时）。它仅在分支更改时触发，而不是每次更新。

## 故障排查

| 问题                         | 原因                     | 修复方法                                                                                                                                                                                                                                                                                                                                        |
| ---------------------------- | ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 状态行不显示                 | 配置路径错误             | 必须位于 `ui.statusLine` 下，而非根级 `statusLine`                                                                                                                                                                                                                                                                                              |
| 输出为空（命令模式）         | 命令静默失败             | 手动测试：`echo '{"session_id":"test","version":"0.14.1","model":{"display_name":"test"},"context_window":{"context_window_size":0,"used_percentage":0,"remaining_percentage":100,"current_usage":0,"total_input_tokens":0,"total_output_tokens":0},"workspace":{"current_dir":"/tmp"},"metrics":{"models":{},"files":{"total_lines_added":0,"total_lines_removed":0}}}' \| sh -c 'your_command'` |
| 数据过时（命令模式）         | 未触发更新事件           | 发送一条消息或切换模型以触发更新——或者设置 `refreshInterval` 来定时重新运行命令                                                                                                                                                                                                                                                                |
| 命令执行太慢                 | 脚本复杂                 | 优化脚本，或将繁重的工作移至后台缓存                                                                                                                                                                                                                                                                                                            |
| 预设项缺失                   | 条件项无数据             | `git-branch` 在 git 仓库外隐藏；`context-used` 在使用量为 0 时隐藏；`branch-changes` 在无文件更改时隐藏。这是预期行为——一旦数据可用，这些项就会显示                                                                                                                                                                                              |
| PR 编号未显示                | 未安装 `gh` CLI          | 安装 [GitHub CLI](https://cli.github.com/) 并通过 `gh auth login` 进行身份验证。查找操作有 2 秒超时                                                                                                                                                                                                                                              |