# 监控工具 (`monitor`)

本文档介绍 Qwen Code 的 `monitor` 工具。

## 描述

使用 `monitor` 启动一个长时间运行的 shell 命令，该命令将 stdout 和 stderr 行以背景任务通知的形式流式返回给 agent。适用于需要随时间观察新输出的 watch 风格命令，例如跟踪日志、观察构建输出、轮询健康端点或监视文件变化。

监控器在后台运行，因此 agent 可以在事件到达时继续工作。每个非空输出行都成为一个通知事件，并受节流限制。

### 参数

`monitor` 接受以下参数：

- `command`（字符串，必需）：要运行和监控的 shell 命令。
- `description`（字符串，可选）：对监控器正在观察内容的简要描述。显示文本会被截断至 80 个字符。
- `max_events`（数字，可选）：达到此数量的通知事件后停止。必须为正整数。默认值为 `1000`；最大值为 `10000`（超出此范围的值会被拒绝，不会静默截断）。
- `idle_timeout_ms`（数字，可选）：命令在此毫秒数内未产生输出则停止。必须为正整数。默认值为 `300000`（5 分钟）；最大值为 `600000`（10 分钟），超出此范围的值会被拒绝。
- `directory`（字符串，可选）：运行命令的绝对路径。必须解析（经过符号链接规范解析后）到已注册的工作区目录之一，且不能位于用户技能目录内。如果省略，Qwen Code 将使用项目根目录。

## 如何将 `monitor` 与 Qwen Code 结合使用

当模型需要随时间观察某个进程而不是收集单次命令结果时，会选择 `monitor` 工具。成功调用会返回一个监控器 ID、命令、事件限制和空闲超时。

用法：

```
monitor(command="tail -f logs/app.log", description="应用日志流")
```

监控器输出在对话中以任务通知形式可见。你也可以通过 `/tasks` 或交互式背景任务对话框检查正在运行和已完成的监控器。

要停止正在运行的监控器，请使用 `task_stop` 工具并提供监控器 ID：

```
task_stop(task_id="mon_abc123def4567890")
```

## `monitor` 示例

观察应用程序日志：

```
monitor(
  command="tail -f logs/app.log",
  description="应用程序日志流",
  max_events=200
)
```

监视开发服务器或构建观察器：

```
monitor(
  command="npm run build -- --watch",
  description="观察构建输出",
  idle_timeout_ms=600000
)
```

轮询本地健康端点：

```
monitor(
  command="while true; do curl -s http://localhost:8080/health; sleep 5; done",
  description="本地健康检查",
  max_events=120
)
```

从特定工作区目录运行：

```
monitor(
  command="npm run dev",
  description="前端开发服务器",
  directory="/absolute/path/to/workspace/packages/web"
)
```

## Monitor 与后台 shell 命令的区别

当 agent 需要在命令持续运行的同时响应流式输出时，使用 `monitor`。当需要一次性结果或完整命令输出时，请改用 `run_shell_command`。

| 需求                                                   | 使用方式                                      |
| :----------------------------------------------------- | :-------------------------------------------- |
| 观察日志、构建输出或周期性状态更新                      | `monitor`                                     |
| 运行一次性命令并读取完整输出                            | `run_shell_command(is_background=false)`      |
| 启动不产生有意义输出的守护进程                          | `run_shell_command(is_background=true)`       |

不要在 monitor 命令中添加 `&`。尾部的 `&`（例如 `tail -f log &`）会被移除，因为 monitor 自行管理后台化。非最终的 `&`（例如 `cmd1 & cmd2`）会被直接拒绝；请重构这样的命令，避免使用后台化。

## 重要说明

- **自动停止行为：** 当达到 `max_events`、在 `idle_timeout_ms` 时间内无输出、或底层命令自行退出时，监控器会自动停止。监控器的状态反映命令的结果，而非工具错误：正常退出（code 0）变为 `completed`，非零退出码变为 `failed` 并附带消息 `Exit code N`，由信号终止变为 `failed` 并附带消息 `Killed by signal SIG`。命令不能是交互式的，因为 stdin 已关闭。监控器停止时，Qwen Code 向命令的进程组发送 `SIGTERM`，约 200 毫秒后升级为 `SIGKILL`。在 Windows 上，使用 `taskkill /f /t`。如果 Qwen Code 进程本身被强制终止、崩溃或内存不足，则分离的进程组不会自动清理；请在退出前使用 `task_stop` 停止监控器，或手动终止进程组。
- **并发限制：** Qwen Code 允许每个 CLI 会话最多同时运行 16 个监控器，作为一个共享池。由子 agent 启动的监控器与主 agent 启动的监控器共用同一上限。如果达到限制，请先停止现有监控器再启动新的。
- **输出处理：** stdout 和 stderr 合并为一个通知流，不带流前缀。空行被忽略，ANSI 颜色和控制字符被移除，超过 2000 个字符的单行会被截断。高音量输出受速率限制，突发 5 个事件后大约每秒 1 个事件；超出速率限制的行会被丢弃，不会缓存。监控器输出以 `<task-notification>` 内容流入 agent 上下文。结构性通知标签已被清除，但模型仍会读取每行的文本，因此避免监控可由外部写入的流，除非你信任模型会忽略嵌入的指令。
- **权限：** `monitor` 有自己的权限边界和权限规则，例如 `Monitor(git status)`。只读命令自动允许；修改状态的命令需要用户批准；包含命令替换（`$(...)`、反引号、`<(...)` 或 `>(...)`）的命令会被直接拒绝。`run_shell_command` 的 `tools.core` 和 `tools.exclude` 设置不适用于 `monitor`。
- **工作区限制：** 可选的 `directory` 必须是绝对路径，且解析后位于已注册的工作区目录内，同时位于用户技能目录之外。指向工作区外部的符号链接会被拒绝。