# 普通会话计划执行

## 目标

将普通会话的 Todo 计划展示为依赖图，并将每个节点连接到实现它的 Agent
执行。复用现有的 ACP plan 流、会话任务快照和子代理详情会话。

该功能是观察性的。它不调度、重试、解除阻塞或完成工作。

## 数据契约

`todo_write` 接受可选的 `blockedBy` Todo ID。运行时校验 ID 唯一、引用
存在、依赖不重复且不自引用，并且图无环。

Todo sidecar 将运行时生成的 `planId` 与当前快照一起存储。在激活计划被
修订期间，该 ID 保持稳定。清除计划，或在前一个计划完成后开始非空工作，
都会开启一个新计划。

Todo 结果展示携带 `planId`，因此实时 ACP 投影和普通转录重放路径保留相同
的计划元数据：

- 计划更新 `_meta.qwenTodoPlan.id`：稳定的计划身份
- 计划更新 `_meta.qwenTranscript.planToolCallId`：源 Todo 工具调用
- 计划条目 `_meta.qwenTodo.id`：原始 Todo ID
- 计划条目 `_meta.qwenTodo.blockedBy`：存在时的依赖 ID

忽略 `_meta` 的客户端继续接收标准 ACP plan 条目。

Agent 工具接受可选的 `todo_id`。它是指导，不是运行时门禁：当存在激活的
Todo 图时，顶层 Agent 调用应提供它。现有的 `AgentTask.toolUseId` 将 Agent
工具调用与实时任务状态连接，因此任务 API 不需要额外字段。

## UI 流程

激活的 Todo 胶囊继续渲染现有的紧凑列表。点击它会打开现有的 Tasks 对话框。
当存在计划元数据时，该对话框在现有任务树上方添加一个原生 CSS 计划执行
区块：

1. 依据 `blockedBy` 对节点进行拓扑分层。
2. 按 `args.todo_id` 对顶层 Agent 工具调用分组。
3. 通过 `task.toolUseId === tool.callId` 连接实时任务行。
4. 通过 `parentAgentId` 将嵌套 Agent 行保留在根之下。
5. 选择一个工作流节点，在图下方检查其完整 Todo 内容、状态、依赖和关联的
   Agent 执行。
6. 从关联的 Agent 执行打开现有的实时子代理详情面板；它仍然是流式进度、
   工具调用和最终输出的来源。
7. 将缺失或未知 `todo_id` 的绑定放入 Unassigned 组。

不添加图论库。没有依赖元数据的计划保持列表式呈现。

## 计划模式审批

计划模式是可选启用的执行门禁，面向希望在工作开始前审查工作流的用户。当
`exit_plan_mode` 请求权限时，Web Shell 在现有审批面板中先展示权威的 ACP
plan 正文，随后是激活的 Todo 工作流。Todo 视图是补充性的，因为其快照可能
与提交的计划文本不同。带依赖的工作流渲染为与 Tasks 对话框相同的 DAG；没有
依赖的工作流保持列表呈现。

现有的权限生命周期仍然是权威的：批准会退出计划模式并开始执行，拒绝则让
会话保持在计划模式。如果没有激活的 Todo 快照，审批保持其现有的纯文本呈现，
使用 ACP 携带的计划正文。未进入计划模式的会话不受影响。

## 状态合成

Todo 状态仍然是业务权威来源。Agent 状态是执行覆盖层：

1. 任一关联执行正在运行：Running
2. 否则，任一关联执行已暂停：Paused
3. Todo 已完成：Completed
4. 任一依赖 Todo 未完成：Blocked
5. Todo 进行中：In progress
6. 否则：Ready

失败或被取消的执行会增加一个 Needs attention 徽章，但不改变 Todo 状态。

## 兼容性与边界

- 没有 ID 或依赖的旧 Todo 快照仍然可读。
- 没有 `todo_id` 的 Agent 调用仍然有效。
- 空的 Todo 快照必须立即清除激活状态。
- 完整的子代理结果不进入三秒任务轮询响应。
- Todo 节点不虚构步骤输出；执行详情来自关联的 Agent 工具调用和现有的
  子代理详情会话。
- 对每个会话强制严格的计划优先仍然不在范围内，因为会话级存在性检查可能
  接受过期的计划。
