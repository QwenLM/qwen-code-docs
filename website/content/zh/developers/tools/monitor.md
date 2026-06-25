# Monitor 工具（`monitor`）

本文档介绍 Qwen Code 的 `monitor` 工具。

## 描述

使用 `monitor` 启动一个长时运行的 shell 命令，将 stdout 和 stderr 的输出行以后台任务通知的形式实时传回 agent。该工具适用于需要持续观察输出的场景，例如追踪日志、观察构建输出、轮询健康检查端点或监控文件变化。

monitor 在后台运行，agent 可以在接收事件的同时继续执行其他任务。每一行非空输出都会成为一个通知事件，并受到限流控制。

### 参数

`monitor` 接受以下参数：

- `command`（string，必填）：要运行并监控的 shell 命令。
- `description`（string，可选）：对监控内容的简短描述，显示文本会被截断至 80 个字符。
- `max_events`（number，可选）：达到指定通知事件数后停止。必须为正整数，默认值为 `1000`，最大值为 `10000`（超出范围的值会被拒绝，不会静默截断）。
- `idle_timeout_ms`（number，可选）：若命令在指定毫秒数内没有任何输出则停止。必须为正整数，默认值为 `300000`（5 分钟），最大值为 `600000`（10 分钟），超出范围的值会被拒绝。
- `directory`（string，可选）：运行命令的绝对路径。解析后（含符号链接规范化）必须位于已注册的工作区目录内，且不得位于 user-skills 目录下。若省略，Qwen Code 将使用项目根目录。

## 如何在 Qwen Code 中使用 `monitor`

当模型需要持续观察某个进程的输出而非一次性获取结果时，会选择 `monitor` 工具。调用成功后会返回 monitor ID、命令内容、事件上限以及空闲超时时间。

用法示例：

```
monitor(command="tail -f logs/app.log", description="app log stream")
```

Monitor 的输出会以任务通知的形式显示在对话中。你也可以通过 `/tasks` 命令或交互式"后台任务"对话框查看正在运行和已完成的 monitor。

要停止正在运行的 monitor，请使用 `task_stop` 工具并传入 monitor ID：

```
task_stop(task_id="mon_abc123def4567890")
```

## `monitor` 示例

监控应用日志：

```
monitor(
  command="tail -f logs/app.log",
  description="application log stream",
  max_events=200
)
```

监控开发服务器或构建 watcher：

```
monitor(
  command="npm run build -- --watch",
  description="watch build output",
  idle_timeout_ms=600000
)
```

轮询本地健康检查端点：

```
monitor(
  command="while true; do curl -s http://localhost:8080/health; sleep 5; done",
  description="local health check",
  max_events=120
)
```

在指定工作区目录下运行：

```
monitor(
  command="npm run dev",
  description="frontend dev server",
  directory="/absolute/path/to/workspace/packages/web"
)
```

## Monitor 与后台 shell 命令的对比

当 agent 需要在命令持续运行期间响应流式输出时，使用 `monitor`。若只需获取一次性结果或完整命令输出，请改用 `run_shell_command`。

| 需求                                         | 使用                                     |
| :------------------------------------------- | :--------------------------------------- |
| 监控日志、构建输出或定期状态更新             | `monitor`                                |
| 一次性运行命令并读取完整输出                 | `run_shell_command(is_background=false)` |
| 启动不产生有意义输出的守护进程               | `run_shell_command(is_background=true)`  |

不要在 monitor 命令中添加 `&`。末尾的 `&`（例如 `tail -f log &`）会被自动去除，因为 monitor 自身管理后台化。非末尾的 `&`（例如 `cmd1 & cmd2`）会被直接拒绝，请将此类命令改写为不使用后台化的形式。

## 重要说明

- **自动停止行为：** Monitor 在达到 `max_events`、`idle_timeout_ms` 内无输出，或底层命令自行退出时会自动停止。Monitor 的状态反映命令的执行结果，而非工具错误：正常退出（`code 0`）对应 `completed`，非零退出码对应 `failed` 并显示消息 `Exit code N`，被信号终止对应 `failed` 并显示消息 `Killed by signal SIG`。命令不能是交互式的，因为 stdin 已关闭。当 monitor 停止时，Qwen Code 会向命令的进程组发送 `SIGTERM`，约 200 ms 后升级为 `SIGKILL`。在 Windows 上使用 `taskkill /f /t`。如果 Qwen Code 进程本身被强制终止、崩溃或内存耗尽，分离的进程组不会被自动清理；可在退出前通过 `task_stop` 停止 monitor，或手动终止进程组来恢复。
- **并发限制：** Qwen Code 每个 CLI 会话最多允许 16 个正在运行的 monitor，作为统一共享池管理。子 agent 启动的 monitor 与主 agent 启动的 monitor 共用同一上限。若达到上限，请先停止一个现有 monitor 再启动新的。
- **输出处理：** Stdout 和 stderr 合并为单一通知流，不带流标识前缀。空行会被忽略，ANSI 颜色和控制字符会被去除，超过 2000 个字符的单行会被截断。高频输出会受到限流控制，允许突发 5 个事件，之后约每秒 1 个事件；超出限流的行会被丢弃，不会缓冲。Monitor 的输出以 `<task-notification>` 内容的形式流入 agent 上下文。结构性通知标签会被转义，但模型仍会读取每行的文本内容，因此除非你信任模型能忽略其中的嵌入指令，否则请避免监控外部可写的流。
- **权限：** `monitor` 有其独立的权限边界和权限规则，例如 `Monitor(git status)`。只读命令会被自动允许；修改状态的命令需要用户批准；包含命令替换（`$(...)` 、反引号、`<(...)`  或 `>(...)`）的命令会被直接拒绝。`run_shell_command` 的 `tools.core` 和 `tools.exclude` 设置不适用于 `monitor`。
- **工作区限制：** 可选的 `directory` 必须是解析后位于已注册工作区目录内且不在 user-skills 目录下的绝对路径。指向工作区外部的符号链接会被拒绝。
