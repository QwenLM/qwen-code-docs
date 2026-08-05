# Java daemon SDK 0.1.0-alpha

## 状态

本文档定义了现有 `com.alibaba:qwencode-sdk` 工件中的第一个 daemon 传输。
它有意独立于 `com.alibaba.qwen.code.cli` 下的遗留 stdio 实现。

## 目标

- 为 `qwen serve` 增加 Java 11 API，而不创建另一个 Maven 工件。
- 按 daemon 顺序交付流式的 text、thought、tool、usage、permission 和 raw
  事件。
- 仅在匹配的可靠终结事件之后才返回 prompt 文本。
- 从准入（admission）水位线恢复 prompt 流，且没有重放间隙或重复的 observer
  投递。
- 使模糊的变更（mutation）结果和不完整的 prompt 结果显式化。
- 让客户端拥有的线程、流、session 和 detach 尝试保持有界。

## 公共接口面

`DaemonClient` 拥有 HTTP 和 worker 资源，读取能力（capabilities），并创建
session。Session 创建默认为 `sessionScope=thread`。阻塞的 prompt 观察使用
可配置的有界 worker 池，而不是全局或无界的执行器。
共享 timer 只分发 watchdog 动作。可能阻塞的 SSE 流关闭运行在一个独立的有界
池上，其大小按 prompt 并发上限设定，因此一个卡住的关闭不会延迟另一个
session 的 deadline 或空闲 watchdog。每个被准入的 prompt 都会预留有界的流
清理容量，直到其最终关闭任务完成。Prompt 在其 prompt 槽位被释放时、而自身
的流仍在关闭期间发布其终结（terminal），因此该容量允许每个 prompt 槽位一次
排空式（draining）清理；终结续接（continuation）即使在并发上限处也能启动
下一个 prompt。超出该余量仍卡住的关闭仍可能导致后续 `startPrompt` 调用以
`DaemonClientCapacityException` 失败，但它们不会静默丢弃由 deadline 触发的
关闭，也不会无界地增长清理工作。

`DaemonSessionClient` 拥有一个 daemon session，且一次至多准入一个本地
prompt。`startPrompt` 立即返回一个 `PromptCall`。它的准入 future 和终结
future 是独立的，因此调用方可以区分“daemon 接受了这个 prompt”和“该轮次
可靠地结束了”。
准入和终结 future 的续接通过一个独立的、客户端拥有的执行器分发，因此用户
续接不会延迟 SSE 观察、其本地超时或 prompt 传输容量。异常完成走相同的路径。
发布容量相对于 `maximumConcurrentPrompts` 有界；因此保持阻塞的续接可能导致
后续 `startPrompt` 调用以 `DaemonClientCapacityException` 失败，而不是创建
无界线程或排队工作。

不确定的完成并不是 session 复用边界。在准入变为未知或已准入的 prompt 以
不确定方式结束后，即使本地流清理成功，session client 也会永久拒绝后续
prompt。
本地观察超时会直接发布，而不会无限期等待流关闭；清理异步继续，并在完成前
保留有界的客户端容量。调用方关闭或销毁受影响的 session。

`PromptObserver` 接收类型化回调和 raw 事件。回调在客户端拥有的 daemon
线程上串行执行。事件游标仅在所有适用的回调成功返回后才前进。因此回调必须
快速返回，不得等待同一个 `PromptCall`，也不得从回调中关闭或销毁同一个
session。支持从其回调中响应 permission；当 daemon 报告该请求已被解决或
不再挂起时，响应方法返回 `false`。

`promptText` 是 `startPrompt` 之上的便捷方法。它只收集 assistant 文本，
强制 UTF-8 字节上限，并且仅在匹配的 `turn_complete` 时返回
`PromptTextResult`。`turn_error` 仍是可靠的终结，但报告为
`PromptTurnException`；任何没有可靠终结的结果都报告为
`PromptOutcomeIndeterminateException`，并在可用时附带显式不完整的部分文本。

Fastjson2 编码和严格的 Jackson Core 解码是实现细节。解码拒绝非标准 JSON
和重复的对象键。公共的 raw JSON 值使用 Java `Map`、`List`、标量和 null 值。

创建时的模型选择在本 alpha 中有意不暴露。当 `modelServiceId` 被拒绝时，
daemon 会以默认模型保活新建的 session，并且仅通过在 create 响应之前发出的
SSE 事件报告该拒绝。每个 prompt 的订阅从更晚的准入水位线开始，因此如果不
增加独立的 session-event 生命周期，就无法证明请求的模型被选中。

在创建 session 之前，SDK 要求 daemon 通告 REST 和 `session_scope_override`；
当较旧的 daemon 可能静默忽略请求的 scope 时，它拒绝变更。当 session 保持
打开时，SDK 只在 daemon 通告 `client_heartbeat` 时按配置的间隔（默认一分钟）
发送一次新的心跳变更，并在 detach 或 destroy 时停止。每个心跳都有普通的
有限请求 deadline 且不重试；将间隔设为零即禁用自动保活。
同样，携带 `deadlineMs` 的 prompt 在准入之前会被拒绝，除非 daemon 通告
`prompt_absolute_deadline`，因此请求的服务端 deadline 不会被静默忽略。本地
观察超时保持独立，且始终由 SDK 强制执行。

## 线上流程

1. 发送一个不重试的 `POST /session/:id/prompt`。
2. 要求 `202` 并校验 `{promptId,lastEventId,eventEpoch?}`。
3. 打开 `GET /session/:id/events`，将 `Last-Event-ID` 设为水位线，并在
   daemon 提供了 epoch 时设置 `X-Qwen-Event-Epoch`。
4. 重放并只观察与该 prompt 关联的事件，同时将 session 级失败帧视为致命。
5. 仅在匹配的 `turn_complete` 或 `turn_error` 时停止。

这个每 prompt 的订阅覆盖了在 `202` 响应到达客户端之前发出的内容和终结事件。
它不需要未知 prompt 缓存或长生命周期的 session pump。

## 传输契约

JDK `HttpClient` 使用 HTTP/1.1 且绝不跟随重定向。每个请求都发送 JSON 或
event-stream `Accept` 头、配置后的 bearer 认证，以及 session 创建后 daemon
签发的 `X-Qwen-Client-Id`。SSE 额外发送 `Accept-Encoding: identity`、
`Cache-Control: no-cache` 和 `Last-Event-ID`。可用时，`X-Qwen-Event-Epoch`
随该游标一起传输。客户端从 prompt 准入中获得种子值，为兼容起见从校验过的
SSE 响应头中学习它，在响应省略该头时保留已知值，并在 prompt 观察期间该值
发生变化时 fail closed（失败即拒绝）。

有限的 JSON 和错误体由有界的订阅者消费，并通过 `sendAsync` 与请求 deadline
竞速；接收到响应头并不结束该 deadline。非成功的 SSE 体由请求预算和 prompt
观察预算中较短者单独限定。

SSE 解析器接受 LF 和 CRLF 帧结构、注释和多行 `data:`。UTF-8 解码是严格的。
帧、事件名、envelope 版本、数字 ID 以及 SSE/envelope ID 一致性都会被校验。
畸形帧、ID 间隙、`state_resync_required`、session 死亡、observer 失败、
空闲超时或重连耗尽都会 fail closed。

等于或低于已提交游标的 ID 是重复的，不会被投递。下一个数字事件必须恰好是
`cursor + 1`。合成的无 ID 事件仅为 daemon 文档中列出的控制帧所接受，且不
移动游标；无 ID 的内容或终结事件会 fail closed。实现只重连 SSE GET，使用
有界的指数全抖动退避、流断开后的 SSE `retry` 指令，以及可重试 HTTP 响应上
的 `Retry-After`。变更绝不自动重试。

## 模糊与终结结果

如果 prompt 传输在分发后失败且没有校验过的 `202`，或返回 HTTP 408 或 5xx，
准入 future 以 `PromptAdmissionUnknownException` 失败；SDK 绝不重新提交
prompt。Session 创建通过 `SessionCreationOutcomeUnknownException` 应用相同
的保守分类。Permission、cancel、heartbeat、detach 和 delete 应用相同的
分类，因为中间响应并不能证明 daemon 拒绝了该变更。Detach 使用更具体的
`DetachOutcomeUnknownException`。每次方法调用对每个变更至多尝试一次。

只有匹配的 `turn_complete` 和 `turn_error` 是终结的。Queue 和
`prompt_cancelled` 事件是建议性的。本地超时停止观察但不会自动取消 daemon
轮次。协作式 daemon 取消会以 `stopReason=cancelled` 完成为 `turn_complete`，
而取消期间的 agent 或 provider 失败可能产生 `turn_error`。`promptText()`
返回完整结果并将错误终结呈现为 `PromptTurnException`；两种情况下调用方都
必须等待终结。当取消、deadline、拆除（teardown）或 agent 结算竞争时，
daemon 的 exactly-once 闩锁发布第一个正式终结并抑制后续候选。因此 SDK 将
收到的终结视为权威，而不是从它最后发送的控制变更推导结果。

`close()` 在本地是幂等的，停止本地观察，并至多尝试一次 detach。丢失的
detach 响应不会重试。`destroySession()` 是唯一发出 `DELETE /session/:id`
的 API；它可以在 detach 之后调用。

## 兼容性与非目标

整个工件现在要求 Java 11。Java 8 用户必须停留在 `0.0.3-alpha`。stdio API
保持源码兼容，但现在运行于 Java 11 并通过 `slf4j-api` 获取日志；应用自行
选择 SLF4J provider，因为 Logback 仅用于测试。

兼容的 daemon 是与 SDK 从同一源码修订版构建发布的 qwen-code 版本。它包含
来自 #7386 的每客户端 detach 账本、来自 #7400 的每 epoch 终结保证、来自
#7458 的重启安全事件游标 epoch，以及本次发布的已确认准入取消和 FIFO
cancel-drain 栅栏。仅 #7400 这个 commit 仍可能在 agent 分发之前确认 cancel
而不停止已准入的 prompt，或让未确认的 session 级 cancel 到达排队中的后继者。
捆绑的 ACP 子进程通过一次已确认的、感知准入的握手处理 daemon 的内部取消
请求。未实现该扩展的自定义标准兼容 ACP 子进程会改为收到一个标准的
`session/cancel` 通知。daemon 不通告任何能在相同 REST/SSE 功能集下区分
这两种实现的能力，因此 SDK 无法在运行时协商这个最低要求，并在缺少正式终结
时 fail closed。

握手有意等待目标 prompt 调用结算后才允许 FIFO 分发其后继者。增加一个仅
确认的超时将允许迟到的 session 级 cancel 到达该后继者，并破坏顺序保证。
因此，无限期忽略其 `AbortSignal` 的 provider、工具或自定义集成可能使
cancel 变更的结果未知且 session 不可用。在不终止兄弟 session 的情况下回收
卡住的共享 ACP 子进程需要更强的运行时隔离，不在本 alpha 范围内。

该 alpha 会检测被观察 prompt 期间的 event-epoch 变化并 fail closed，但不
承诺跨 daemon 重启的 exactly-once 执行、自动 epoch 恢复、快照/重同步、
持久化游标或真正的按 prompt ID 定向取消。在 daemon 能够返回确定性结果或
SDK 拥有从 `Last-Event-ID: 0` 开始的 session-event 生命周期之前，它也不
暴露创建时的模型选择。模糊的 create 可能留下一个调用方无法识别或 detach 的
daemon session，直到 daemon 端回收。这些情况需要更强的 daemon 契约。

## 验证

单元测试使用进程内 HTTP 服务器注入 SSE 分片、慢速单行投递、重放、重复、
间隙、冲突的 prompt ID、不透明的未来事件数据、水位线重放、断开、压缩响应、
卡住的有限体、event-epoch 传播与不匹配、重同步、observer 失败、终结缺失
以及模糊的变更响应。生命周期测试覆盖单本地 prompt 准入、准入/关闭串行化、
deadline 终结后的 session 复用、取消完成、拆除终结顺序、有界文本、自动
心跳、幂等关闭、detach 客户端身份、detach 一次以及显式 destroy。

CI 在 Linux 上用 Java 11、17 和 21 编译并测试，并在 macOS 和 Windows 上
做 Java 21 冒烟覆盖。Linux CI 和受保护的发布工作流针对真实的 `qwen serve`
进程（使用临时工作区和模型 stub）运行 E2E。
