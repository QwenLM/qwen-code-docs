# 实验性会话计划与评审

## 目标

让普通会话的 Workflow 可视化变为 opt-in，并让用户在执行之前评审确切的
Todo 依赖图。复用 Plan Mode、Todo 快照和既有的权限生命周期。

## 推出

`experimental.sessionWorkflow` 默认禁用。禁用时，Web Shell 保持既有的
Todo 列表和 Plan Mode 行为，但不渲染 Workflow DAG，也不重命名 Plan
Mode。该设置只改变呈现方式；它不注册工具、不改变 Todo 语义，也不创建
另一种审批模式。

启用时，既有的 `plan` 模式呈现为 **Plan & Review**（计划与评审）。Plan
Mode 仍是执行闸门：允许只读调查，变更类工具保持阻塞，拒绝
`exit_plan_mode` 留在 Plan Mode，批准则退出 Plan Mode。

## 交付

### Phase 1：opt-in 呈现

- 通过既有的 daemon 工作空间设置路由暴露默认关闭的设置。
- 从 Web Shell 的活跃工作空间读取生效设置，并一致地应用到其主聊天、分
  屏面板和侧边任务面板。
- Todo 列表渲染保持不变，同时对 Workflow DAG 输入设闸门。
- 仅在设置启用时重命名既有的 Plan 入口。

### Phase 2：修订绑定的批准

- 在 Plan & Review 中，要求一个结构化的 Todo 执行快照，其节点在批准前
  保持 pending。
- 在 `exit_plan_mode` 批准请求中携带 Todo 计划身份和源工具调用身份。
- 从该身份而不是最新的活跃 Todo 列表解析批准 DAG。
- 复用既有的 plan ID lineage，使后续快照和 Agent 执行继续更新同一个
  Workflow，无需另一个存储。
- 当没有匹配的快照时，回退到既有的纯文本批准。

## 边界

Workflow 保持观察性质。它不调度依赖、不重试 Agent、不传播完成状态，也
不添加 Workflow 存储。在 Plan & Review 之外的会话中，`blockedBy` 和
`todo_id` 保持可选。
