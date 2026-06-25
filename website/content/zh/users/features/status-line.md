# 状态栏

> 在底部栏显示自定义信息。

状态栏在底部栏左侧区域显示与会话相关的信息——模型名称、token 用量、Git 分支等。共有两种配置模式：

- **预设模式** — 通过交互对话框或 JSON 配置选择内置数据项，无需编写脚本。
- **命令模式** — 运行 shell 命令，通过 stdin 接收结构化 JSON 上下文，完全自由地自定义格式。

```
单行状态栏（默认审批模式 — 1 行）：
┌─────────────────────────────────────────────────────────────────┐
│  user@host ~/project (main) ctx:34%   🔒 docker | Debug | 67%  │  ← status line
└─────────────────────────────────────────────────────────────────┘

多行状态栏（最多 2 行）：
┌─────────────────────────────────────────────────────────────────┐
│  user@host ~/project (main) ctx:34%   🔒 docker | Debug | 67%  │  ← status line 1
│  ████████░░░░░░░░░░ 34% context                                │  ← status line 2
└─────────────────────────────────────────────────────────────────┘

多行状态栏 + 非默认模式（最多 3 行）：
┌─────────────────────────────────────────────────────────────────┐
│  user@host ~/project (main) ctx:34%   🔒 docker | Debug | 67%  │  ← status line 1
│  ████████░░░░░░░░░░ 34% context                                │  ← status line 2
│  auto-accept edits (shift + tab to cycle)                       │  ← mode indicator
└─────────────────────────────────────────────────────────────────┘
```

配置后，状态栏会替换默认的"? for shortcuts"提示。高优先级消息（Ctrl+C/D 退出提示、Esc、vim INSERT 模式）会临时覆盖状态栏内容。状态栏文本会被截断以适应可用宽度。

## 快速配置

配置状态栏最简单的方式是使用 `/statusline` 命令，它会打开一个交互对话框，你可以选择预设项、切换主题颜色并实时预览效果：

```
/statusline
```

这将打开预设模式配置器。使用方向键导航，空格键切换选项，回车键确认。你的选择会自动保存到设置中。

你也可以给 `/statusline` 提供具体指令，让它生成命令模式配置：

```
/statusline show model name and context usage percentage
```

---

## 预设模式

预设模式提供一组内置数据项，你可以自由选择和组合——无需 shell 命令、无需 `jq`、无需编写脚本。各项以 `item1 | item2 | item3` 的格式显示在同一行。

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

| 字段                   | 类型       | 是否必填 | 说明                                                                                        |
| ---------------------- | ---------- | -------- | ------------------------------------------------------------------------------------------- |
| `type`                 | `"preset"` | 是       | 必须为 `"preset"`                                                                           |
| `items`                | string[]   | 是       | 按顺序排列的预设项 ID 列表（见下表），各项以 `\|` 分隔。                                    |
| `useThemeColors`       | boolean    | 否       | 将当前 `/theme` 颜色应用到状态栏文本。默认为 `true`。                                       |
| `hideContextIndicator` | boolean    | 否       | 隐藏底部栏右侧区域的内置上下文用量指示器。默认为 `false`。                                  |

### 可用预设项

| 项 ID                  | 默认启用 | 说明                                                               |
| ---------------------- | -------- | ------------------------------------------------------------------ |
| `model-with-reasoning` | 是       | 当前模型名称及推理级别（例如 `qwen-3-235b high`）                   |
| `model`                |          | 当前模型名称（不含推理级别）                                       |
| `git-branch`           | 是       | 当前 Git 分支名称（不在 git 仓库中时隐藏）                         |
| `context-remaining`    | 是       | 剩余上下文窗口百分比（例如 `Context 65.7% left`）                  |
| `total-input-tokens`   |          | 本次会话累计输入 token 数（例如 `30.0k total in`）                 |
| `total-output-tokens`  |          | 本次会话累计输出 token 数（例如 `5.0k total out`）                 |
| `current-dir`          | 是       | 当前工作目录                                                       |
| `project-name`         |          | 项目名称（工作目录的 basename）                                    |
| `pull-request-number`  |          | 当前分支的开放 PR 编号（需要 `gh` CLI）                            |
| `branch-changes`       |          | 会话文件变更统计（例如 `+120 -30`）                                |
| `context-used`         | 是       | 已使用上下文窗口百分比（例如 `Context 34.3% used`）                |
| `run-state`            |          | 紧凑会话状态（`Ready`、`Working` 或 `Confirm`）                    |
| `qwen-version`         |          | Qwen Code 版本（例如 `v0.14.1`）                                   |
| `context-window-size`  |          | 上下文窗口总大小（例如 `131.1k window`）                           |
| `used-tokens`          |          | 当前提示词 token 数量（例如 `45.0k used`）                         |
| `session-id`           |          | 当前会话标识符                                                     |

**默认启用**的项会在你首次打开 `/statusline` 对话框时预先选中。

`total-input-tokens` 和 `total-output-tokens` 是整个会话的累计值，会将每轮的 token 用量叠加，因此输入 token 可能增长较快，因为每次新的模型请求都会包含当前的完整对话上下文。如果你想查看当前提示词大小而非会话累计消耗，请使用 `used-tokens`。

### 示例输出

使用默认项时，状态栏显示如下：

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

- 输入文字可按名称或描述筛选项目
- 切换选项时实时更新预览
- 按回车保存配置

---

## 命令模式

命令模式运行一个 shell 命令，其 stdout 输出显示在状态栏中。命令通过 stdin 接收结构化 JSON 上下文，从而实现与会话状态感知的输出。

### 前置条件

- 推荐安装 [`jq`](https://jqlang.github.io/jq/) 用于解析 JSON 输入（通过 `brew install jq`、`apt install jq` 等方式安装）
- 不需要 JSON 数据的简单命令（例如 `git branch --show-current`）无需 `jq` 即可使用

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

| 字段                   | 类型        | 是否必填 | 说明                                                                                                          |
| ---------------------- | ----------- | -------- | ------------------------------------------------------------------------------------------------------------- |
| `type`                 | `"command"` | 是       | 必须为 `"command"`                                                                                            |
| `command`              | string      | 是       | 要执行的 shell 命令。通过 stdin 接收 JSON，stdout 输出将被显示（最多 2 行）。                                  |
| `refreshInterval`      | number      | 否       | 每隔 N 秒重新运行命令（最小值为 1）。适用于在没有 Agent 状态事件时也会变化的数据（时钟、配额、运行时间等）。  |
| `respectUserColors`    | boolean     | 否       | 保留命令输出中的 ANSI 颜色代码，而不应用底部栏的灰色样式。默认为 `false`。                                    |
| `hideContextIndicator` | boolean     | 否       | 隐藏底部栏右侧区域的内置上下文用量指示器。默认为 `false`。                                                    |

### JSON 输入

命令通过 stdin 接收以下格式的 JSON 对象：

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

| 字段                                  | 类型             | 说明                                                                               |
| ------------------------------------- | ---------------- | ---------------------------------------------------------------------------------- |
| `session_id`                          | string           | 唯一会话标识符                                                                     |
| `version`                             | string           | Qwen Code 版本                                                                     |
| `model.display_name`                  | string           | 当前模型名称                                                                       |
| `context_window.context_window_size`  | number           | 上下文窗口总 token 数                                                              |
| `context_window.used_percentage`      | number           | 上下文窗口已使用百分比（0–100）                                                    |
| `context_window.remaining_percentage` | number           | 上下文窗口剩余百分比（0–100）                                                      |
| `context_window.current_usage`        | number           | 上次 API 调用的 token 数量（当前上下文大小）                                       |
| `context_window.total_input_tokens`   | number           | 本次会话累计消耗的输入 token 数                                                    |
| `context_window.total_output_tokens`  | number           | 本次会话累计消耗的输出 token 数                                                    |
| `workspace.current_dir`               | string           | 当前工作目录                                                                       |
| `git`                                 | object \| absent | 仅在 git 仓库中存在。                                                              |
| `git.branch`                          | string           | 当前分支名称                                                                       |
| `worktree`                            | object \| absent | 仅在活跃 worktree 中存在（由 `enter_worktree` 创建）。                             |
| `worktree.name`                       | string           | Worktree slug 名称                                                                 |
| `worktree.path`                       | string           | Worktree 目录的绝对路径                                                            |
| `worktree.branch`                     | string           | Worktree 中检出的分支                                                              |
| `worktree.original_cwd`               | string           | 进入 worktree 之前的工作目录                                                       |
| `worktree.original_branch`            | string           | 进入 worktree 之前活跃的分支                                                       |
| `metrics.models.<id>.api`             | object           | 按模型统计的 API 指标：`total_requests`、`total_errors`、`total_latency_ms`        |
| `metrics.models.<id>.tokens`          | object           | 按模型统计的 token 用量：`prompt`、`completion`、`total`、`cached`、`thoughts`     |
| `metrics.files`                       | object           | 文件变更统计：`total_lines_added`、`total_lines_removed`                           |
| `vim`                                 | object \| absent | 仅在 vim 模式启用时存在，包含 `mode`（`"INSERT"` 或 `"NORMAL"`）。                 |

> **Important:** stdin 只能读取一次。请始终先将其存储到变量中：`input=$(cat)`。

### 示例

#### 模型与 token 用量

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

> Note: `git.branch` 字段直接在 JSON 输入中提供——无需再调用 `git` 命令。

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

#### 实时时钟与 Git 分支

当状态栏需要显示在没有 Agent 事件时也会变化的数据（如时钟、运行时间或速率限制计数器）时，请使用 `refreshInterval`：

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

#### 复杂命令使用脚本文件

对于较长的命令，可将脚本保存至 `~/.qwen/statusline-command.sh`：

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

## 行为说明

**两种模式通用：**

- **更新触发条件**：模型切换、发送新消息（token 数变化）、切换 vim 模式、Git 分支变更、工具调用完成或文件发生变化时，状态栏会更新。更新有防抖处理（300ms）。
- **输出**：最多 2 行，每行在底部栏左侧区域单独渲染为一行。超出可用宽度的内容会被截断。
- **热重载**：修改设置中的 `ui.statusLine` 后立即生效，无需重启。
- **禁用方式**：从设置中删除 `ui.statusLine` 键即可禁用，"? for shortcuts"提示会恢复显示。

**仅命令模式：**

- **超时**：执行时间超过 5 秒的命令会被终止，状态栏在失败后清空。
- **刷新**：设置 `refreshInterval`（单位：秒）可按定时器周期性重新运行命令，适用于在没有 Agent 事件时也会变化的数据（时钟、速率限制、构建状态等）。
- **Shell**：命令在 macOS/Linux 上通过 `/bin/sh` 运行。在 Windows 上默认使用 `cmd.exe`——如需运行 POSIX 命令，请使用 `bash -c "..."` 包裹，或指向 bash 脚本（例如 `bash ~/.qwen/statusline-command.sh`）。

**仅预设模式：**

- **无外部依赖**：预设项在内部计算，无需 shell 命令、无需 `jq`、无超时问题。
- **主题集成**：当 `useThemeColors` 为 `true`（默认值）时，状态栏文本使用当前 `/theme` 颜色；为 `false` 时应用底部栏的灰色样式。
- **PR 查询**：`pull-request-number` 项会在后台运行 `gh pr view`（2s 超时），仅在分支变更时触发，不会在每次更新时都执行。

## 故障排查

| 问题                       | 原因                         | 解决方法                                                                                                                                                                                                                                                                                                                                                                                               |
| -------------------------- | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 状态栏未显示               | 配置路径错误                 | 必须配置在 `ui.statusLine` 下，而不是根级别的 `statusLine`                                                                                                                                                                                                                                                                                                                                             |
| 输出为空（命令模式）       | 命令静默失败                 | 手动测试：`echo '{"session_id":"test","version":"0.14.1","model":{"display_name":"test"},"context_window":{"context_window_size":0,"used_percentage":0,"remaining_percentage":100,"current_usage":0,"total_input_tokens":0,"total_output_tokens":0},"workspace":{"current_dir":"/tmp"},"metrics":{"models":{},"files":{"total_lines_added":0,"total_lines_removed":0}}}' \| sh -c 'your_command'` |
| 数据陈旧（命令模式）       | 无触发事件                   | 发送消息或切换模型以触发更新——或设置 `refreshInterval` 按定时器重新运行命令                                                                                                                                                                                                                                                                                                                           |
| 命令执行过慢               | 脚本过于复杂                 | 优化脚本或将耗时操作移至后台缓存                                                                                                                                                                                                                                                                                                                                                                       |
| 预设项缺失                 | 条件项暂无数据               | `git-branch` 在非 git 仓库中隐藏；`context-used` 在用量为 0 时隐藏；`branch-changes` 在无文件变更时隐藏。这是预期行为——数据就绪后项目会自动显示                                                                                                                                                                                                                                                      |
| PR 编号未显示              | 未安装 `gh` CLI              | 安装 [GitHub CLI](https://cli.github.com/) 并通过 `gh auth login` 完成认证。查询超时时间为 2s                                                                                                                                                                                                                                                                                                         |
