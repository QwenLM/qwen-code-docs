# Daemon Todo Stop Guard

## 问题

Daemon 和 ACP 客户端可以在模型轮次结束后让会话保持存活。当模型刚写下
一份未完成的顶层 Todo 列表时，一次自然的模型停止可能让 daemon 请求处于
未完成状态，尽管会话有足够的 trusted 状态可以继续。客户端目前没有有界、
内建的方式来区分这种情况和一个普通已完成轮次。

本设计增加一个 opt-in、仅限 daemon 的 stop guard。它有意不改变 TUI、
Core Todo 工具或通用 agent 循环。

## 配置与安全边界

`experimental.todoStopGuard` 默认为 `false`，需要重启生效，且不在 TUI
设置对话框中显示。该 guard 在 safe mode、bare mode 和 Approval `plan`
模式下被强制关闭。`disableAllHooks` 不会禁用这个内建 guard，因为它不是
外部 hook。

每个不间断的自动续接阶段最多可以创建两个额外的主模型流。轮次中的用户
消息显式开启一个全新的两次尝试阶段，因为它是新的用户输入；而
retry/continue 和后台结果保留当前阶段的预算。既有的权限检查、取消、
token 上限、循环保护、ACP 宽限期和 daemon 资源限制仍然具有权威性。特别
是，断开连接的客户端绝不意味着权限批准。

## Trusted 状态

CLI `Session` 拥有一个小的内存 `DaemonTodoStopGuard` 状态机。它存储当前
work chain 是否已武装、最新的未完成项计数、已承诺的续接尝试、
挂起/排队 prompt 状态，以及耗尽是否已被报告。Session 在 work chain 开始
时单独快照后台 agent、shell、monitor 和 wakeup 的 ID，包括在该边界处
已排队的终态通知和 wakeup。

只有一次成功的顶层 `TodoWriteTool.execute()` 结果，带有结构化的
`{ type: 'todo_list', todos: [...] }` 信封，才能武装 guard。观察发生在
工具执行和状态计算之后、Session `PostToolUse` hook 之前。参数、重放的
历史、磁盘状态、失败或重复的工具调用、子代理的 Todo 列表，以及影子使用
`todo_write` wire 名称的发现工具，都不被信任。最新的成功结果替换计数；
一个空的或全部完成的列表立即解除武装。解除武装阻止再一次自然停止续接；
它不会截断一个已由承诺的 Guard 流开启的工具循环。

一个新的普通用户 prompt 开启一个未武装的 work chain 并重置其后台基线。
即使 Todo 状态仍在内存中，它也不能继承先前请求的激活。Trusted
retry/continue 只在 trusted 未完成 Guard 状态仍然存在时保留 work chain；
在一次清除信任的生命周期事件之后，它以全新的后台基线开始，并且必须重新
武装。轮次中的用户消息保留其激活并开启一个全新的两次尝试阶段。这意味着
硬上界是没有新用户输入时连续两个自动流，而不是整个 work chain 生命周期
内两个流。Cron 和通知轮次可以通过一次成功的顶层 Todo 写入建立自己的
链路；当它们处理已武装链路的后台结果时，保留该链路的预算。关联的后台
结果也是一次 trusted 续接，可以清除 API/网络 retry 暂停，但不清除硬
挂起。

该 guard 不被持久化。Rewind 和历史恢复会清除信任，branch/fork、成功的
工作目录变更、新的 Session、磁盘恢复以及 daemon 或 agent 重启也一样。
实时客户端附加到同一个 Session 会保留内存状态；切换模型或非 Plan 审批
模式本身不会开启新的 work chain。生命周期失效还会阻止来自被取代的实时
轮次的迟到工具结果重新武装 guard；下一个独立的 prompt 或自动轮次建立
新的边界。延迟自动队列在一个失效的前台 prompt 落定后释放，包括该 prompt
通过错误路径退出的情况。

## 停止顺序

该 guard 只参与自然的模型停止。当它激活时，Session 应用以下顺序：

1. Drain 轮次中的用户消息。如果存在任何消息，跳过 Stop hook 和 guard，
   重置 guard 预算，并在当前循环中运行用户续接。
2. 如果 daemon FIFO 包含一个完整的、未中止的 prompt，结束当前请求并把
   旧链路标记为等待该 prompt。一个被取消的排队请求之后不能让后台活动
   复活旧链路。当最后一个排队 prompt 被中止时，桥接显式告知实时 Session
   终止等待中的 guard 并释放无关的自动队列。如果一次 drain 同时观察到
   轮次中的消息和排队的完整 prompt，轮次中的消息先运行，并且即使该续接
   完成了 Todo 列表或硬停止了 guard，FIFO 优先权仍然有效。
3. 在前台轮次中，按既有的上限和错误语义评估既有的外部 Stop hook。
4. 仅当 guard 已武装、未挂起、未在等待排队 prompt、有未完成项、不在
   Approval `plan` 中且没有相关后台输入时，才评估 guard。
5. 如果外部 hook 和 guard 同时阻塞同一次停止，把它们的理由合并为一次
   续接模型调用。它们的计数器保持独立。

相关后台输入指 ID 不在 work chain 基线中的仍然存活的后台 agent、shell、
monitor 或 `@wakeup`，加上具有相同关联关系的排队通知或 wakeup。从更早
请求继承的后台工作和普通 cron 任务不阻塞新请求。自动 cron/通知轮次只
运行内建 guard；它们不引入外部 Stop hook 调用。关联结果保留当前预算，
而旧任务通知或普通 cron 轮次会被推迟，直到活跃链路无法再恢复，然后开启
一个独立的未武装链路。延迟的无关周期性 cron 触发按任务合并并有界，这样
停滞的后台依赖不能无限增长队列。在 Guard 链路仍可恢复或完整 FIFO
prompt 具有优先权时，Daemon 后续建议也被抑制，因此未完成的工作不会触发
竞争的 suggestion 模型调用。

硬性终态路径挂起当前 work chain：用户或权限取消、
`PostToolUse.shouldStop`、循环或重复调用保护、token 上限，以及外部
Stop hook 上限。API 和网络错误为显式的 trusted retry/continue 保留
状态。

## 续接与可观测性

第一次 guard 续接发送：

> [Todo Stop Guard] N todo item(s) are still pending or in progress. Continue executing the current task now. Do not ask the user whether to continue. If progress requires user input, use the structured question or permission flow. If progress depends on external state, report the blocker explicitly.

第二次还会发送：

> This is the final automatic continuation. Before ending, either complete/update the todos or report the completed progress and the exact blocker.

计数器只在 `responseStream` 成功返回后才承诺。在那之前的取消、压缩失败
或 token 拒绝不消耗一次尝试；之后的流失败才消耗。自由格式的阻塞文本不被
解析。压缩失败挂起该 guard 链路，使其不会把自动队列阻塞在一个不可达的
retry 之后；当一个外部 Stop hook 被合并时，其理由仍可按 hook 的既有
语义继续。预算计入每一股可归因于 guard 的主模型流，包括发送前一个
guard 流的工具结果的后续流。如果第二个流返回更多工具调用，Session 执行
并保留其结果，但不开启第三个可归因于 guard 的流。如果第一个流通过工具
调用完成了所有 Todo，剩余尝试可以发送工具结果而无需另一个未完成 Todo
prompt，让模型完成其响应。轮次中的输入改为赞助那次工具结果发送并优先
处理，不消耗剩余的 Guard 尝试。当该流与外部 Stop hook 合并时，hook
既有的工具循环仍可发送这些结果，无需另一个 Guard prompt 或 Guard 尝试；
启用 Guard 不得截断外部 hook 续接。

每个已承诺的续接发出一个可重放的离散 `agent_message_chunk`，带有
`_meta.source = 'todo_stop_guard'` 以及尝试次数、最大尝试次数和未完成
计数。耗尽同样发出：

> [Todo Stop Guard] Automatic continuation stopped after 2 attempts; N todo item(s) remain unfinished.

Todo 文本从不包含在 guard 遥测中。正常用量元数据仍核算额外的调用。重放
压缩独立保留同时携带 `qwenDiscreteMessage` 和 Guard source 的 Guard
事件，因此在实时事件环滚动之后不会合并尝试或丢弃其每次尝试的元数据。

## 桥接兼容性

`craft/drainMidTurnQueue` 新增可选的 `hasQueuedPrompt`。桥接只在其
pending prompt 列表包含一个状态为 `queued` 且 abort signal 未中止的完整
条目时设置它。较旧的 Desktop/channel 客户端可能省略该字段；Session 将
省略视为 `false`。如果 drain 超时，迟到的响应可以恢复消息内容，但其排队
prompt 快照会被丢弃，因为它可能已经过期。

REST/SSE 断开行为和事件环保持不变。ACP HTTP 保留既有的十秒宽限期和
重放路径；宽限期到期和显式 close/cancel 保留当前的终止行为。

## 验证

单元测试覆盖严格激活、生命周期重置、挂起、预算和流承诺语义、桥接队列
报告、配置闸门、Stop hook 合并和终态路径。并发测试覆盖 prompt FIFO
优先权、迟到 drain 恢复、后台基线隔离和自动轮次。Daemon E2E 测试覆盖
没有 SSE 订阅者时的 prompt 接纳，以及有界尝试之后的环重放。既有的 ACP
传输回归覆盖宽限窗口内的重连、宽限期到期和权限往返；手动 E2E 计划也在
guard 武装时执行这些路径。在设置禁用时，既有的 Stop hook、cron、通知和
prompt 行为必须保持不变。
