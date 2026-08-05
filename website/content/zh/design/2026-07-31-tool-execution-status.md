# 工具执行状态

## 动机

终态工具调用状态描述整体调用是成功、失败还是被取消。它不说明调度器是否
真的进入了 `invocation.execute()`。因此，校验失败、权限拒绝、执行失败和执行
后失败需要一个单独的执行结果，才能被准确测量。

## 契约

`ToolCallResponseInfo` 携带可选的 `executionStatus`，以保持源码和记录兼容性：

```ts
type ToolExecutionStatus = 'not_started' | 'success' | 'error' | 'cancelled';
```

Core 调度器（`CoreToolScheduler`）和 ACP `Session.runTool` 总是设置该字段。来自
较旧记录、第三方生产者和子代理结果投影（非交互式 `buildResponse` 路径，它重放
另一个代理报告的结果）的缺失值只在遥测边界变为 `unknown`，绝不从终态调用状态
推断。

终态轴和执行轴是刻意独立的：

| 终态状态      | 执行状态         | 示例                                                                                 |
| ------------- | ---------------- | ------------------------------------------------------------------------------------ |
| `success`     | `success`        | 正常工具完成                                                                         |
| `success`     | `not_started`    | 协议级合成的兄弟响应                                                                 |
| `error`       | 任意值           | 执行前拒绝、执行错误、后处理错误或 batch-hook 覆盖                                   |
| `cancelled`   | 任意值           | 执行前、执行中或执行后的取消                                                         |

把每行读作一个（终态，执行）对，唯一无效的组合是 `success/error` 和
`success/cancelled`：以 `success` 终止的调用只能携带执行状态 `success` 或
`not_started`。
执行状态在 `invocation.execute()` 落定时冻结；hook、结果桥接、持久化和批处理都
不能覆盖它。PostToolBatch 启用状态及其父工具 span 在调度器批次开始时快照，因此
运行时 hook 重新配置影响下一个批次，而不是改变在途批次的完成行为。

## 遥测

归一化的 `tool_call` 事件增加 `call_id` 和 `execution_status`。归一化在所有
sink 之前只发生一次：

- 空工具名变为 `unknown_tool`；
- `success` 从终态 `status` 重新计算；
- 没有错误类型的终态错误使用 `unknown`；
- 成功和取消省略调用级错误字段；
- 缺失的执行状态变为 `unknown`。

`qwen-code.tool.call.count` 上由终态遥测契约确立的终态 `status` 维度不被本设计
改变。新的 `qwen-code.tool.execution.count` 计数器只使用 `execution_status` 和
`tool_type` 事件特定维度。全局配置的通用指标属性，例如选择加入的 `session.id`，
也可能存在。执行失败率是：

```text
execution_status = error
────────────────────────────────────────
execution_status in {success, error}
```

取消、`not_started` 和 `unknown` 被排除。错误类型、函数名、调用 ID、消息和 MCP
server 名称保留在日志或 span 中，而不是指标标签。计数器刻意省略
`function_name`，因此仅从指标无法把执行失败率归因到特定工具；通过同时携带
`call_id` 和 `function_name` 的 `tool_call` 日志下钻。

执行 span 只在调度器尝试 `execute()` 之后才存在。它记录工具身份、冻结的执行
状态和执行错误类型。父工具 span 继续表示终态调用状态，被取消的 span 保持 unset
而不是 error。Core 在工具解析和调用校验之后打开父 span；更早的终态路径由归一化
事件和执行计数器覆盖，不从未解析的请求名称合成 span。

QwenLogger 接收归一化的终态状态、执行状态、调用 ID 和工具类型，但不接收 MCP
server 名称或函数参数。MCP server 名称保留在 QwenLogger 之外，对配置的遥测日志
和 span 导出器可用。

## 兼容性与范围

公开的响应和事件字段保持可选。内置生产者使用内部必填形态，而旧的 JSONL 记录
不被迁移或回填。新的 JSONL 记录在记录的工具结果中包含 `executionStatus`；该
字段是增量的，因此忽略未知字段的重放读取器不受影响。Core、ACP、TUI 和非交互
式模式中的手动记录投影复制新的标量，但不在面向用户的 JSON 输出中暴露它。在
工具解析之前被取消的调用可以在公开的 `CancelledToolCall` 变体中省略 `tool` 和
`invocation`，因此该变体的消费者必须在使用前守卫这些字段。当这种解析前取消通过
遥测发出时，`tool_type` 默认为 `"native"`，因为工具身份尚未解析；这是校验前
取消在 `tool_type` 维度上的已知偏差。

每调用的执行错误不再拒绝 `CoreToolScheduler.schedule()`；结果通过现有的更新和
完成回调以终态 `error` 调用交付，因此一个工具的失败不会中止其兄弟工具。该方法
仍返回 `Promise<void>`，并可能因调度器级设置或队列失败而拒绝。
`handleConfirmationResponse()` 在重新抛出之前把确认流程错误终态化，保留其现有
失败信号而不让调用留在 `awaiting_approval`。嵌入方应该从回调交付的调用读取终态
`status` 和 `executionStatus`，而不是期望任一公开入口点返回已完成的调用。

第一个发布覆盖 `CoreToolScheduler` 和 ACP `Session.runTool`。Speculation、直接
`/fork` 执行、MCP 内部重试、临时子代理结果调和、shell 退出元数据、可重试性、
所有权和通用失败阶段仍在范围之外。

Core 和 ACP 必须一起发布。仪表盘应按部署时间或 `service.version` 切换，单独
监控 `unknown`，绝不把旧版 `success` 指标用作执行失败 SLI。

## 已知维护隐患

执行前取消不变量（"执行前路径中的每个 `await` 之后都跟一个中止检查"）由
`CoreToolScheduler` 和 `Session.runTool` 中每个调用点的手工放置检查强制执行，
而不是由结构性机制强制。向任一路径添加新的 `await` 而不跟检查，会悄悄重新引入
本设计修复的过期执行 bug。未来的重构应把 await 包进带守卫的辅助函数；在那之前，
这些路径的评审者应手动验证该不变量。
