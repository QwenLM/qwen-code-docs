# 手动退出 Plan 模式的通知投递

## 问题

Plan 模式由模型方向用户轮次上的循环提醒强化。当审批模式在已批准的
`exit_plan_mode` 流程之外发生变化时，仅仅停止该提醒并不是 Plan 模式已结束
的可靠信号。

现有的一次性通知由 `GeminiClient` 为 UserQuery 和 Cron 轮次组装。这个边界
会漏掉通过其他路径发送的模型请求，包括工具结果续接、steering、hook、
ACP/daemon 直接发送和交互式代理。`Config` 上的单个待处理布尔值也会让一个
对话消费掉本应发给所有共享该模式的活跃对话的通知。

## 范围

该保证适用于当前进程中的活跃对话。它不跨进程重启持久化通知，也不改变审批
检查、plan 审批或工具执行。

通知对以下场景启用：

- 由 `GeminiClient.startChat` 创建的主对话，包括 TUI、非交互式、ACP、
  daemon/Web UI，以及压缩后的替换对话；
- 由 `AgentCore.createChat` 以 `interactive: true` 创建的对话。

对 fork/speculation、无头代理、workflow、内存和压缩旁路查询，以及所有其他
未显式启用的 `GeminiChat`，通知保持禁用。

## 状态与所有权

`Config` 保留两块独立的内存状态：

- 模式事件 `{ version, kind }`，其中 `kind` 为 `clear` 或 `manual-exit`；
- 对话游标 `{ seenVersion }`。

事件与审批模式一起被拥有。通过 `Object.create(parent)` 创建的 `Config` 会
继承父级的审批模式和当前事件。在第一次创建自有审批模式的写入时，它会复制
当前事件，之后与父级后续事件隔离。

游标始终由接收方的 `Config` 惰性拥有。因此主对话和每个交互式代理可以独立
认领同一个继承的事件。用相同的 `Config` 重建对话会保留其游标，不会再次
投递该事件。

模式转换按如下方式更新事件：

- 非 Plan 到 Plan：递增版本并写入 `clear`；
- Plan 到非 Plan：递增版本并写入 `manual-exit`，但已批准的 `exit_plan_mode`
  写入 `clear`；
- 非 Plan 到非 Plan：不创建事件。

进入 Plan 会清除未投递的旧退出事件。投递时读取最新的审批模式，因此后续的
非 Plan 到非 Plan 切换会改变待投递通知中提到的模式名，而不会创建新的通知。

## 投递与失败语义

`GeminiChat` 暴露一个幂等的选择加入。每次发送时，它先完成异步压缩和硬救援
检查，然后在把用户内容提交到历史之前立即同步认领待处理事件。通知作为最后
一个 text part 添加，保留其之前的所有 function response part。

线性化点是包含该通知的成功历史提交。Provider 重试和回退复用该已提交的
请求，不会向历史追加第二个通知。如果同步发送准备抛错并回滚了历史推入，
只有当同一个 manual-exit 事件仍是当前事件、模式仍是非 Plan、且游标仍指向
该版本时，认领才会被恢复。更晚的模式事件会使旧的恢复过期且无害。

实现无法确定 provider 是否收到了一个传输失败的请求。传输重试可能把同一个
请求发送多次，但活跃对话历史中该通知至多出现一次。

上下文溢出恢复是复用原始请求的例外：反应式压缩在重建重试载荷之前会替换
活跃历史。如果其压缩后的历史不再包含已提交的通知，对话会在重试前重新追加
那段完全相同的文本。当压缩已经以一个用户轮次结束时，通知作为其最后一个
part 添加，而不是创建相邻的用户轮次。

## 通知

```text
<system-reminder>
The approval mode changed outside the approved exit_plan_mode flow.
The current approval mode is: ${currentMode}.
Plan mode is no longer active. This notice supersedes any earlier reminder that Plan mode is active. Do not call exit_plan_mode; no plan approval is pending. Continue under the current mode's permissions and confirmation requirements.
</system-reminder>
```

## 验证

单元测试覆盖转换语义、继承事件的所有权、独立的对话游标、过期恢复行为、
选择加入投递、part 顺序、准备回滚、重试、对话重建和对话所有权。E2E 计划
覆盖 PTY、ACP、交互式代理和已批准的 plan 退出。
