# 工具调用终态遥测契约

## 问题

工具调用终态事件由 Core 调度器和 ACP 双方产生。它们已经暴露了
`status`、`success`、`error` 和 `error_type`，但这些字段可能不一致或缺失。
特别是，工具可能返回一个没有错误类型的软错误，而 ACP 可能在不构造
`ToolCallEvent` 的情况下调用遥测日志记录器。

这使得日志、使用统计、指标、hook 和聊天记录对同一个终态结果有不同的
视图。

## PR1 范围

PR1 在两个边界上建立运行时契约：

1. Core 调度器在构建已完成的调用之前，将未分类的 `ToolResult.error`
   转换为 `ToolErrorType.UNKNOWN`。
2. `logToolCall` 在将事件发送给任何遥测消费者之前对其进行归一化。

终态契约如下：

| `status`    | `success` | `error`   | `error_type`                |
| ----------- | --------- | --------- | --------------------------- |
| `success`   | `true`    | 缺失      | 缺失                        |
| `error`     | `false`   | 保留      | 显式值或 `unknown`          |
| `cancelled` | `false`   | 缺失      | 缺失                        |

`status` 是权威的。空白的 `function_name` 变为 `unknown_tool`。非空的工具
名和非空的错误类型原样保留。归一化器返回一个副本，且是幂等的。

Core 边界有意保持私有。公共工具实现可以继续省略 `ToolResult.error.type`，
并且 `ToolCallResponseInfo.errorType` 保持可选，因为成功和已取消的调用没
有错误分类。

## 消费者

归一化后的事件被 UI 遥测、聊天记录 UI 事件、QwenLogger、OpenTelemetry
日志和工具调用指标使用。OpenTelemetry 的 `error.message` 和 `error.type`
别名独立填充。

工具调用计数器添加低基数的 `status` 属性，同时保留 `success`。公共的
`recordToolCallMetrics` 输入接受可选的 status 以保持源兼容性；省略它的调
用者会从传统的 success 布尔值映射而来。延迟直方图仍然只以
`function_name` 为键，`error_type` 不会添加到指标中。

QwenLogger 接收 `status` 和 `tool_type`。作为本改动的一部分，它不接收
`mcp_server_name`、函数参数、结果或堆栈跟踪。

## 兼容性与后续工作

本改动对日志和指标是增量式的，但它把 PostToolBatch 和 Core 聊天记录中
未分类的 Core 错误从缺失值改为 `unknown`。历史查询应将缺失的错误类型合
并为 `unknown`；不需要数据回填。

以下内容不在 PR1 范围内：

- 修正 ACP 权限取消及其他生产者侧的终态状态 bug；
- 归一化 ACP 独立的原始 `tool_result` 记录；
- 向 PostToolUseFailure hook 契约添加 `error_type`；
- 向主工具 span 添加错误分类；
- 对各个内置和 MCP 错误位置进行分类；
- 改变传统 UI 的 `totalFail` 语义。

在 ACP 终态状态修复合入之前，新的 `status` 指标不得成为稳定性 SLO 的
来源。

## 推广检查

对于新的服务版本，运维人员应验证：

- 错误类工具调用日志的 `error_type` 绝不为空；
- 工具调用日志的 `function_name` 绝不为空；
- success 和 cancelled 事件不携带错误字段；
- 显式分类的错误保留其原有类型；
- 工具调用计数器总量仍与工具调用日志量保持一致；以及
- `unknown` 的增加量对应于先前缺失的桶。
