# 静默命令心跳

日期：2026-07-14
状态：已实现

## 问题

一个没有输出的前台 shell 命令在 spawn 到稳定之间不会发出任何事件。在交互式 TUI 使用中这没有问题——spinner 会持续转动——但对于无头模式消费者（如 DataAgent 这样的 ACP 网关、`--output-format stream-json` 管道），会话会在命令的整个持续期间完全静默。监视事件流的网关无法区分“一个 165 秒的 SQL 探测仍在运行”和“执行链已经死亡”，因此长时间运行的静默命令会被用户报告为 agent 挂起。

对这样一个会话的生产诊断（DataAgent 会话 `77255d98`，41 分钟任务，约 32 分钟花在工具等待中）将缺失的存活信号确定为三个 P0 可靠性修复之一，另外两个是 shell 超时语义（PR 1，独立变更）和 todo 停止守卫（PR 3）。

参考实现：Claude Code 每秒轮询输出文件，即使内容为空也会调用其进度回调，然后向 SDK 消费者暴露限流的、最小负载的 `tool_progress` 事件。进度从不进入模型上下文。

## 目标

- 在前台 shell 命令静默期间，周期性地向需要它的消费者（ACP 客户端、stream-json）发出结构化的存活信号。
- 只携带统计信息——已耗时间、输出年龄、行/字节数、有效超时。绝不携带命令输出。
- 绝不进入模型上下文；绝不打扰交互式消费者的实时输出显示。

## 非目标

- 超时自动转后台（作为 P1 项目单独跟踪）。
- 向 ACP 客户端流式传输实时命令输出（`content` 帧）。
- 通过 ACP 转发 MCP `mcp_tool_progress`、把子代理心跳传播进 `AgentResultDisplay`，或 TUI 显示增强——全部是后续工作。

## 设计

### 事件形态

`ShellProgressData` 加入 `packages/core/src/tools/tools.ts` 中的 `ToolResultDisplay` 联合类型，沿袭现有 `McpToolProgressData` 的先例，并带有共享导出的守卫 `isShellProgressData`：

```ts
interface ShellProgressData {
  type: 'shell_progress';
  elapsedMs: number; // monotonic, since post-PTY-init spawn
  lastOutputAgeMs?: number; // monotonic age of last output; absent = none yet
  totalLines?: number; // PTY/AnsiOutput path only
  totalBytes?: number; // PTY/AnsiOutput path only
  timeoutMs?: number; // effective timeout incl. 120s default; absent when disabled
}
```

时长是单调的（`performance.now()` 差值），因此 NTP 校正不会使其偏移；出于同样的原因，`lastOutputAgeMs` 是年龄而不是纪元时间戳。

### 生产者

`ShellToolInvocation.execute()` 在获得执行句柄之后（这样 PTY 动态导入耗时就不会为一个不存在的进程产生心跳）且仅当存在 `updateOutput` 回调时，启动一个 `setInterval`。每个滴答只在整整一个间隔内没有触发显示更新时才发出心跳——该检查复用现有的 `lastUpdateTime` 限流状态，因此有输出流动的命令从不会发心跳。定时器在与现有的尾部 flush/超时警告定时器相同的三处被清除：service 抛异常的 catch、结果的 `finally`，以及 `onAbort`（中止之后，在 kill 到稳定窗口期间发出“仍在运行”信号会是谎言）。

间隔来自 `tools.shell.heartbeatIntervalMs`（settings → CLI config → core `ConfigParameters` → `getShellHeartbeatIntervalMs()`，与 `defaultTimeoutMs` 相同的链路），默认 10 000 毫秒；`0` 表示禁用。

### 消费者

| 消费者                               | 行为                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `CoreToolScheduler` liveOutputCallback | 将心跳转发给 `outputUpdateHandler`，但跳过 liveOutput 替换和更新通知——统计对象不得清空累积的实时视图。                                                                                                                                                                                                                                                                                                                                                                       |
| `useReactToolScheduler`（TUI）          | 忽略心跳；TUI 已经显示 spinner。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `agent-core`（子代理运行时）        | 忽略心跳；广播心跳会覆盖子代理视图的 `liveOutputs`。                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ACP `Session.runTool`                  | 向 `invocation.execute()` 传入更新回调。心跳变成即发即忘、仅含 meta 的 `tool_call_update { status: 'in_progress', _meta: { toolName, shellProgress } }` 帧。在 `execute()` 返回（包括抛异常）的那一刻设置的 `toolSettled` 门控会丢弃与稳定路径竞争的滴答，因此客户端绝不可能在 `completed` 之后观察到 `in_progress`。心跳计数和最后输出年龄被记录为现有工具执行 span 上的 `shell.heartbeat_count` / `shell.last_output_age_ms` span 属性。 |
| stream-json                            | `createToolProgressHandler` 通过现有的 `emitToolProgress` 管道转发心跳（`tool_progress` 流事件，由 `--include-partial-messages` 门控）。`ToolProgressStreamEvent.content` 放宽为 `McpToolProgressData \| ShellProgressData`。                                                                                                                                                                                                                                                                           |
| desktop `QwenAgent`                    | 在 `handleToolCallUpdate` 中跳过 `status: in_progress` 更新——它之前会把每个 `tool_call_update` 转换为终态的 `tool_result`，这会在第一个心跳时就用空结果过早地完成命令。                                                                                                                                                                                                                                                                                            |
| channels `DaemonChannelBridge`         | 丢弃无 kind 的 `in_progress` 帧，而不是将其标记为格式错误（那里的 `tool_call_update` 要求 `kind`，而仅含 meta 的心跳不携带）。                                                                                                                                                                                                                                                                                                                                                                            |
| web-shell daemon UI 规范化器         | 丢弃心跳帧——规范化它会用从 `_meta.toolName` 派生的裸工具名覆盖工具块的人类可读标题。                                                                                                                                                                                                                                                                                                                                                                                      |

ACP 的 `ToolCallUpdate` 将除 id 之外的所有字段定义为可选，并把 `_meta` 作为扩展点，因此符合协议的客户端会忽略新帧。但该契约并不自我强制：对仓库内 `tool_call_update` 消费者的一次全面排查发现三个错误处理了这些帧（desktop agent、daemon channel bridge、web-shell 规范化器——已在上方修复，每个都有回归测试），其余的（VS Code companion、acp-bridge 压缩、会话导出、daemon TUI 适配器）有条件地合并，本身对心跳是安全的。在权限请求路径上（目前不发出开始通知），心跳可能是客户端对某个工具调用看到的第一次更新——与现有的仅 completed 更新相同的顺序契约。

### 为什么不放在 ShellExecutionService

service 能提供稍微更精确的 `lastOutputAt`，但工具层已经观察到每个输出事件，而把定时器放在那里意味着要跨 PTY/child_process/promote 生命周期管理它，同时 PR 1 正在并发重构同一文件的中止前语义。面向用户的 `!` shell 不需要心跳，因此没有损失。

## 验证

- 单元测试：生产者节奏/形态/清理（包括 `performance` 的假定时器）、调度器转发但不替换 liveOutput、TUI hook 保留、ACP 仅 meta 帧 + 迟到心跳门控、stream-json 事件形态和 partial-messages 门控。
- E2E stream-json：`sleep 15` 产生了带 `{type:'shell_progress', elapsedMs:10001, timeoutMs:30000}` 的 `tool_progress`，且没有输出统计字段。
- E2E ACP（stdio JSON-RPC）：`tool_call` → 心跳 `tool_call_update`（仅 meta，10 秒）→ `completed`，且没有尾随的 `in_progress`。
- TUI（tmux）：静默命令显示正常的 spinner/耗时行；运行期间和最终 transcript 中没有 JSON 泄漏。
