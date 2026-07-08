# Prompt 队列背压

## 概述

`qwen serve` 现在应用了基于每个 session 的 prompt 准入背压机制。每个 session 的默认限制为 `5` 个 pending prompt。pending prompt 是指 daemon 已通过 `sendPrompt` 接受但尚未 settled 的 prompt，包括在 per-session FIFO 中等待的 prompt 以及当前正在执行的 prompt。

`branchSession` 仍然在同一个 per-session FIFO 背后进行串行化处理，但它不是 prompt，因此不会消耗此 prompt 限制。

## 语义

- 默认值：`maxPendingPromptsPerSession = 5`。
- 禁用：`0` 或 `Infinity` 表示无限制。
- 无效值：负数、小数和 `NaN` 会被 bridge 构建和 `runQwenServe` 拒绝。CLI flag 接受非负整数；`0` 表示禁用上限。
- 权威性：bridge 是准入网关。SDK 端的计数是快速失败保护，不能替代服务端的强制执行。
- Prompt 截止时间：`--prompt-deadline-ms` 仍然仅适用于已被接受的 prompt。它不是队列准入上限。

## Bridge 行为

`SessionEntry` 跟踪 `pendingPromptCount`。`sendPrompt` 故意设计为非 `async`，因此准入检查可以在 HTTP 路由返回 `202 Accepted` 之前同步抛出异常。

准入流程：

1. 查找 session。
2. 在增加计数器之前，拒绝已提前 abort 的信号。
3. 如果 `pendingPromptCount >= maxPendingPromptsPerSession`，则抛出 `PromptQueueFullError`。
4. 增加计数器并将 prompt 入队到 FIFO。
5. 当对调用方可见的 prompt promise settled 时，准确释放一次该槽位。

失败不会污染 FIFO，因为队列尾部仍然会消化每个 prompt 的结果。原始调用方仍然会收到 prompt 被拒绝的通知。

## HTTP 行为

`POST /session/:id/prompt` 在发出 accepted 响应之前会捕获同步的 `PromptQueueFullError`。该路由返回：

- 状态码：`503`
- Header：`Retry-After: 5`
- Body：`{ code: 'prompt_queue_full', error, sessionId, limit, pendingCount }`

准入失败时不会返回 `promptId`。

`/capabilities` 声明：

```json
{
  "limits": {
    "maxPendingPromptsPerSession": 5
  }
}
```

当禁用上限时，声明的值为 `null`。

## ACP HTTP 行为

ACP JSON-RPC 传输层将 `PromptQueueFullError` 映射为稳定的错误结构，而不是透传为无结构的内部错误：

```json
{
  "data": {
    "errorKind": "prompt_queue_full",
    "sessionId": "...",
    "limit": 5,
    "pendingCount": 5
  }
}
```

## SDK 行为

`DaemonClient` 为 `prompt()` 调用提供了本地的 per-session 预留机制。它在发送 HTTP 请求前进行预留，并在以下情况释放：

- 旧版阻塞式 `200` 完成，
- 非阻塞式 `202` 轮次完成，
- `turn_error`，
- 调用方 abort，
- SSE 结束，
- fetch 或响应解析失败。

`DaemonPendingPromptLimitError` 表示 SDK 在本地进行了拒绝，并未发送 prompt 请求。

SDK 选项直接接受数字类型的 capability 值；`null` 会禁用本地上限，以匹配 `/capabilities.limits.maxPendingPromptsPerSession`。

`DaemonSessionClient` 对长连接订阅路径应用相同的本地限制。静态方法 `createOrAttach`、`load` 和 `resume` 保持其现有的参数位置；直接构造可能会覆盖本地上限。