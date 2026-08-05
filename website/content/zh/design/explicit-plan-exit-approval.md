# 显式计划退出批准

## 问题

`exit_plan_mode` 以前把批准和执行混在一起。它的确认回调在 hook 和执行
完成之前就更改 `ApprovalMode`，而且 AUTO/YOLO 会话可以通过 LLM Plan
Approval Gate 绕过用户。权限管理器的 allow 规则、权限 hook 和同级自动批
准也可以在没有真实宿主/用户响应的情况下满足一个 `ask` 决定。这使得模型
发起的工具调用能够尝试在用户未做决定的情况下离开 Plan 模式，并且在后续
执行失败时产生误导性的模式通知。

## 设计

工具调用可以声明 `requiresUserInteraction()`。这是一个固有的交互要求，
不是另一个权限级别：固有拒绝或权限管理器拒绝仍然获胜，而 allow 规则和
自动审批模式无法满足它。主会话的 `exit_plan_mode` 声明该要求。Plan 必需
的 teammate 保留其 leader 批准路径，普通子代理保留既有的 lifecycle-tool
拒绝。

计划确认回调只记录四个决定之一：恢复 plan 前模式、切换到 auto-edit、切
换到 default，或取消。它从不改变模式。创建确认会冻结计划文本、plan 前
模式和当前审批模式修订号。`execute()` 在同步应用模式转换之前检查批准是
否存在、signal 是否活跃、会话是否仍在 Plan 模式，以及修订号是否仍然匹
配。这使得过期、重入和并发的退出 fail closed（失败即拒绝）。计划持久化
只在转换成功之后尽力而为地进行。

`Config` 拥有一个单调的审批模式修订号，只在模式真正变化时递增。审批模
式覆盖拥有独立的修订号。既有的可选 `enteredByModel` setter 参数暂时作
为被忽略的兼容参数保留；模型来源对批准没有影响。

LLM Plan Approval Gate 及其与 AskUserQuestion 元数据的耦合被移除。
`prePlanMode` 保留，因为它是用户可见的退出选项。`originalRequest` 和
`researchSummary` 保留，用于 Plan 必需的 teammate leader 评审。
`resolutionSummary` 仅作为已弃用的 TypeScript 输入属性保留以兼容源码，
运行时 schema 不再接受它。

## 宿主行为

CLI 和 IDE 确认、ACP `requestPermission`，以及 stream-json
`can_use_tool` 的 allow 响应算作显式交互。PermissionRequest allow
hook、PM allow 规则、YOLO/AUTO/AUTO_EDIT 和同级自动批准则不算。Hook 的
deny 决定仍具权威性。没有可批准宿主的非交互调用方会 fail closed。

当权限 pending 时，或当确认、hook、执行或转换失败时，ACP 不发送模式更
新。在成功的计划生命周期执行和真正的模式变更之后，它使用从 `Config` 读
取的模式发送一次更新。旧式通知失败仅是建议性的，扩展侧通道仍会尝试，并
携带准确的 `legacyFrameSent` 值。

## 失败行为

- 在 Plan 模式之外的调用会安全失败，并在观察到模式变化的任一边界给出可
  操作的状态指引。当会话不在 Plan 模式且没有批准快照时，`execute()`
  返回指引错误。在 Plan 模式之外调用 `getConfirmationDetails()`（例如
  通过 PM `ask` 规则，或在权限评估与确认构建之间发生 Plan 到非 Plan 的
  切换）会抛出相同的指引。默认权限是 `allow` —— 这是状态问题，不是安
  全问题。
- 无效的确认结果、取消、中止、过期修订号和转换失败都会让 Plan 模式保持
  活跃。
- 针对同一修订号批准的两个退出不能都成功。
- 如果 ACP 宿主无法呈现 `switch_mode`，Plan 模式保持活跃，错误会引导
  用户使用宿主模式选择器或 `/plan exit`。
- 保存已批准的计划是尽力而为的，不会回滚成功的模式转换。

## 兼容性与范围

本变更有意不放宽 Plan 模式下的通用 shell 执行，也不添加 DataWorks 专用
的读取工具。那些是单独的权限/工具变更。公开的调用方法是可选的，默认为
`false`，因此既有工具和外部实现保持兼容。
