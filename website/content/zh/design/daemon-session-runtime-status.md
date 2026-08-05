# Daemon 会话运行时状态

## 问题

Daemon 客户端可以通过 `GET /session/:id/status` 轮询实时会话，并通过
`GET /workspace/:id/sessions` 枚举会话，但如今唯一的运行时活动信号是
`hasActivePrompt`。客户端无法区分等待普通权限的轮次、等待
`ask_user_question` 回复的轮次，以及错误应一直保持可见直到工作恢复的失败
轮次。

## 设计

ACP 桥接在每个实时 `SessionEntry` 上拥有一个小的内存状态扩展：

- `hasTurnError` 和 `turnError` 存储最近一次失败轮次的终态错误。
- `pendingInteractions` 将 pending 权限请求 id 映射为规范化、可直接渲染的
  权限动作或用户问题。

现有的 prompt 生命周期仍是 `hasActivePrompt` 的来源。失败的轮次在发出既有
`turn_error` SSE 事件时记录其清洗过的 `message`、可选的 `code` 和可选的
`errorKind`。该错误一直保持可见，直到下一个排队的 prompt 到达 dispatch 并
真正开始执行；已被接受但仍在排队的 prompt 不会清除它。

ACP 子进程在 tool-call 元数据中显式标记 `ask_user_question` 权限请求。
桥接只读取这个稳定的标记，而不是从 UI 文本或工具名推断类别。

## API

现有的实时摘要新增可选的附加字段：

- `isWaitingForPermission`
- `isWaitingForUserQuestion`
- `pendingInteractionCount`
- `hasTurnError`
- `turnError`（`message`、可选的 `code`、可选的 `errorKind`）
- `pendingInteractions`：权限的动作标题/内容/input 和可选项；
  `ask_user_question` 的问题和可选项。每个问题携带一个 `answerKey`，对应
  `answers: Record<string, string>` 权限投票载荷。

`GET /session/:id/status` 返回实时会话的所有字段。工作空间会话列表对实时
条目携带相同的运行时字段，包括 `turnError` 和 `pendingInteractions`，这样
调用方可以在批量轮询时直接渲染并批准交互。非实时的持久化会话省略新字段，
以免调用方把不可用的运行时状态误认为已知的空闲状态。

## 范围

本设计不会在 daemon 重启之间持久化运行时状态，不会新增端点，也不会取代
SSE 用于详细事件消费。现有的 `POST /session/:id/permission/:requestId`
投票路由负责解决 pending 项；问题回答使用其现有的 `answers` 扩展。
