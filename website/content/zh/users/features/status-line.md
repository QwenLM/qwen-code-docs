# 状态栏

> 使用 shell 命令在底部栏显示自定义信息。

状态栏允许你运行一个 shell 命令，其输出将显示在底部栏的左侧区域。该命令通过 stdin 接收结构化的 JSON 上下文，因此可以显示与当前会话相关的信息，例如当前模型、token 使用量、git 分支，或任何你可以通过脚本获取的内容。

```
Single-line status (default approval mode — 1 row):
┌─────────────────────────────────────────────────────────────────┐
│  user@host ~/project (main) ctx:34%   🔒 docker | Debug | 67%  │  ← status line
└─────────────────────────────────────────────────────────────────┘

Multi-line status (up to 2 lines — 2 rows):
┌─────────────────────────────────────────────────────────────────┐
│  user@host ~/project (main) ctx:34%   🔒 docker | Debug | 67%  │  ← status line 1
│  ████████░░░░░░░░░░ 34% context                                │  ← status line 2
└─────────────────────────────────────────────────────────────────┘

Multi-line status + non-default mode (3 rows max):
┌─────────────────────────────────────────────────────────────────┐
│  user@host ~/project (main) ctx:34%   🔒 docker | Debug | 67%  │  ← status line 1
│  ████████░░░░░░░░░░ 34% context                                │  ← status line 2
│  auto-accept edits (shift + tab to cycle)                       │  ← mode indicator
└─────────────────────────────────────────────────────────────────┘
```

配置后，状态栏将替换默认的“? 查看快捷键”提示。高优先级消息（Ctrl+C/D 退出提示、Esc、vim INSERT 模式）会临时覆盖状态栏。状态栏文本会被截断以适应可用宽度。

## 前置条件

- 推荐使用 [`jq`](https://jqlang.github.io/jq/) 解析 JSON 输入（可通过 `brew install jq`、`apt install jq` 等安装）
- 不需要 JSON 数据的简单命令（例如 `git branch --show-current`）无需 `jq` 即可运行

## 快速配置

配置状态栏最简单的方式是使用 `/statusline` 命令。它会启动一个配置代理，读取你的 shell PS1 配置并生成匹配的状态栏：

```
/statusline
```

你也可以提供具体的指令：

```
/statusline show model name and context usage percentage
```

## 手动配置

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

| 字段              | 类型        | 是否必填 | 说明                                                                                                                       |
| ----------------- | ----------- | -------- | -------------------------------------------------------------------------------------------------------------------------- |
| `type`            | `"command"` | 是       | 必须为 `"command"`                                                                                                         |
| `command`         | string      | 是       | 要执行的 shell 命令。通过 stdin 接收 JSON，stdout 输出将被显示（最多 2 行）。                                              |
| `refreshInterval` | number      | 否       | 每 N 秒重新运行一次命令（最小值为 1）。适用于在没有 Agent 状态事件时也会变化的数据（如时钟、配额、运行时间）。             |

## JSON 输入

命令通过 stdin 接收包含以下字段的 JSON 对象：

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

| 字段                                  | 类型             | 说明                                                                        |
| ------------------------------------- | ---------------- | --------------------------------------------------------------------------- |
| `session_id`                          | string           | 唯一会话标识符                                                              |
| `version`                             | string           | Qwen Code 版本                                                              |
| `model.display_name`                  | string           | 当前模型名称                                                                |
| `context_window.context_window_size`  | number           | 上下文窗口总大小（token 数）                                                |
| `context_window.used_percentage`      | number           | 上下文窗口使用百分比（0–100）                                               |
| `context_window.remaining_percentage` | number           | 上下文窗口剩余百分比（0–100）                                               |
| `context_window.current_usage`        | number           | 上次 API 调用的 token 数量（当前上下文大小）                                |
| `context_window.total_input_tokens`   | number           | 本次会话消耗的总输入 token 数                                               |
| `context_window.total_output_tokens`  | number           | 本次会话消耗的总输出 token 数                                               |
| `workspace.current_dir`               | string           | 当前工作目录                                                                |
| `git`                                 | object \| absent | 仅在 git 仓库内存在。                                                       |
| `git.branch`                          | string           | 当前分支名称                                                                |
| `metrics.models.<id>.api`             | object           | 单模型 API 统计：`total_requests`、`total_errors`、`total_latency_ms`       |
| `metrics.models.<id>.tokens`          | object           | 单模型 token 使用量：`prompt`、`completion`、`total`、`cached`、`thoughts`  |
| `metrics.files`                       | object           | 文件变更统计：`total_lines_added`、`total_lines_removed`                    |
| `vim`                                 | object \| absent | 仅在启用 vim 模式时存在。包含 `mode`（`"INSERT"` 或 `"NORMAL"`）。          |

> **重要：** stdin 只能读取一次。请务必先将其存储到变量中：`input=$(cat)`。

## 示例

### 模型与 token 使用量

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

### Git 分支与目录

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

> 注意：`git.branch` 字段已直接在 JSON 输入中提供——无需调用 `git` 命令。

### 文件变更统计

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

### 实时时钟与 git 分支

当状态栏显示的数据在没有 Agent 事件时也会变化（例如时钟、运行时间或速率限制计数器）时，请使用 `refreshInterval`：

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

### 复杂命令使用脚本文件

对于较长的命令，可将脚本文件保存在 `~/.qwen/statusline-command.sh`：

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

然后在配置中引用它：

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

- **更新触发条件**：当模型切换、发送新消息（token 数量变化）、vim 模式切换、git 分支变更、工具调用完成或文件发生变更时，状态栏会更新。更新具有防抖机制（300ms）。设置 `refreshInterval`（秒）可额外按定时器重新运行命令——适用于在没有 Agent 事件时也会变化的数据（如时钟、速率限制、构建状态）。
- **超时**：执行时间超过 5 秒的命令将被终止。失败时状态栏会清空。
- **输出**：支持多行输出（最多 2 行；多余行将被丢弃）。每行将作为独立行渲染在底部栏左侧区域，颜色较暗。超出可用宽度的行将被截断。
- **热重载**：修改配置中的 `ui.statusLine` 会立即生效——无需重启。
- **Shell**：在 macOS/Linux 上通过 `/bin/sh` 运行命令。在 Windows 上默认使用 `cmd.exe`——请使用 `bash -c "..."` 包装 POSIX 命令，或指向 bash 脚本（例如 `bash ~/.qwen/statusline-command.sh`）。
- **移除**：从配置中删除 `ui.statusLine` 键即可禁用。将恢复显示“? 查看快捷键”提示。

## 故障排查

| 问题                 | 原因                  | 解决方法                                                                                                                                                                                                                                                                                                                                                                                                    |
| ----------------------- | ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 状态栏未显示 | 配置路径错误   | 必须位于 `ui.statusLine` 下，而非根级别的 `statusLine`                                                                                                                                                                                                                                                                                                                                             |
| 输出为空            | 命令静默失败 | 手动测试：`echo '{"session_id":"test","version":"0.14.1","model":{"display_name":"test"},"context_window":{"context_window_size":0,"used_percentage":0,"remaining_percentage":100,"current_usage":0,"total_input_tokens":0,"total_output_tokens":0},"workspace":{"current_dir":"/tmp"},"metrics":{"models":{},"files":{"total_lines_added":0,"total_lines_removed":0}}}' \| sh -c 'your_command'` |
| 数据未更新              | 未触发更新       | 发送消息或切换模型以触发更新——或设置 `refreshInterval` 按定时器重新运行命令                                                                                                                                                                                                                                                                                       |
| 命令执行过慢        | 脚本过于复杂         | 优化脚本或将耗时操作移至后台缓存                                                                                                                                                                                                                                                                                                                                           |