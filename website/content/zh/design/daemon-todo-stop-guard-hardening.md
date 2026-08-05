# Daemon Todo Stop Guard 加固

## 背景

Daemon 的 Todo Stop Guard 可以在模型轮次留下未完成的 trusted Todo 项时，
追加一次有界的自动续接。桥接可能在当前轮次正在 drain 时接纳另一个用户
prompt，同时后台 agent、monitor、通知和 cron 任务也可能同时完成。Guard
不得抢先于已接纳的用户工作，不得复活来自其他工作空间或其他 prompt 的
工作，并且不得在自动发送失败时丢失用户和工具内容。

## 续接所有权

`craft/claimTodoStopGuardContinuation` 是桥接 prompt 队列与 Guard 续接之间
的排序边界。请求包含会话 ID，对于桥接拥有的 prompt，还包含由桥接注入的
trusted `InvocationContextV1.promptId`。会话本地的 provider prompt ID 不是
owner。

对于桥接拥有的 prompt，daemon 只在该 prompt 仍是活跃、未中止的运行中
条目时认领。一个存活的已排队 prompt 会产生
`{ claimed: false, hasQueuedPrompt: true }`，并把等待绑定到当前 owner 的
prompt ID。缺失、被替换或竞争的 owner 会 fail closed（失败即拒绝），且不
改变其他 owner 的状态。无 owner 的自动轮次只有在不存在存活的桥接 prompt
时才能认领。

Channel 和桌面共享 agent 没有 daemon FIFO。它们校验当前会话并为该会话返回
成功的认领；未知会话和无 owner 的回退处理器会 fail closed。未实现该方法
的客户端、格式错误的响应以及两秒的认领截止时间，都只会禁用续接的 Guard
部分；一个独立阻塞的外部 Stop hook 仍可能继续。一个已确认存活的 FIFO
prompt 则会立即结束旧轮次，不显示也不计入已经过期的 hook 响应。

`craft/todoStopGuardQueueReleased` 携带 Guard owner 的 prompt ID。迟到的
release 只能清除匹配的等待。FIFO 晋升同样会清除 owner 作用域的等待，因为
排队的用户 prompt 已经接管了所有权。Session 还会跟踪进行中的认领：如果
匹配的 release 在认领响应的续接之前被处理，它会记录一个短命的墓碑，应用
终态 release 状态，并拒绝从过期响应中安装等待。当该 owner 最后一个进行
中的认领落定时，墓碑被移除。

## 发送顺序与保留

drain 结果中的 `hasQueuedPrompt` 字段是一个提示。正向提示由认领确认：
仍然存活的队列让出轮次，而已消失的队列允许 Stop 处理继续。如果同一次
drain 还移除了轮次中的用户内容，让出会在排队 prompt 运行之前把该内容
存入聊天历史，使排序边界不会变成数据丢失边界。失败或格式错误的 drain 在
存在被恢复的用户内容时优先保留这些内容；否则它会硬挂起 Guard，但不压制
独立的外部 Stop hook。

在 Guard 署名的模型流之前，Session 会 drain 输入、构建图片部分、选择
full-turn vision 模型、刷新 PLAN 模式和后台状态、刷新 Guard 决策，并认领
续接。压缩、token 上限检查和 provider 发送都只在该认领之后进行。每一次
额外的 Guard 流都单独认领。在认领之前被接纳的 prompt 获胜；在认领之后
被接纳的 prompt 排在已经承诺的续接之后。

如果准备、压缩、认领、token 上限校验、流创建或 provider 发送失败，未发送
的 Guard 指令会在历史保留之前被移除。被 drain 的用户部分、成功的函数
响应以及其他独立的 Stop 内容会保留。Session 在添加历史之前比较用户内容
推送计数器，这样已经持久化了该内容的下层不会造成重复。

## 硬挂起

在 Guard 耗尽、显式会话销毁、工作目录迁移开始、终态的排队 prompt
release、没有恢复出用户输入的不可靠 drain，以及无法安全继续链路的受控
取消或失败路径之后，会进入硬挂起。它会清除已有的排队所有权，并阻止迟到
的 Todo 写入重新武装旧链路。一次与挂起竞争的完整 FIFO 观察仍可能为其
owner 确立 prompt 排序优先权，但该优先权不会恢复 Guard 信任，也不允许
Guard 发送。

只有新的普通 prompt 才会开启新的链路。trusted retry 可以恢复因 retry 而
暂停的链路，但后台结果、cron 轮次、通知轮次、设置刷新和迟到的工具完成
都无法清除硬挂起。进入 PLAN 模式会清除 Guard 信任并阻止自动续接。

## 后台 lineage

Session 在每个 work chain 开始时捕获后台基线，并把基线和显式的关联
agent 集合一起重置。

- 新创建的顶层 agent 是关联的。
- 新的子 agent 从父级递归继承。缺失的父级和环路会 fail closed。
- 基线 agent 是无关的，除非链路通过 `send_message(task_id)` 成功延续了
  它。
- `send_message(task_id)` 在权限和 `PreToolUse` 检查之后、执行之前临时
  标记目标，这样快速完成通知能被正确分类。成功在 `PostToolUse` 之前
  提交；错误、取消或抛出只回滚该调用引入的标记。
- 面向团队的 `send_message(to)` 不改变任务 lineage。
- 有 owner 的 monitor 无论其自身基线成员资格如何，都继承 owner 的关联
  关系。无 owner 的 monitor 使用自己的 monitor ID。

通知的关联关系在入队时存储，因此后续的注册表删除或状态变化不会重新
分类一个已经投递的结果。存活扫描、优先级选择和溢出保护使用相同的
lineage 规则。启动新的普通 prompt 会有意把队列中已有的所有通知重置为
无关：这些结果是在新的 work chain 边界之前入队的，不能继承其先前链路的
分类。

## 会话生命周期与有界队列

`/cd` 在获取既有的会话关闭闸门之前校验并规范化目标。表面上的 no-op
也会获取闸门并重新检查当前目录，因此不会与并发迁移竞争；除非它变成一次
真实的移动，否则不会硬挂起 Guard。一旦移动被闸门确认，它会硬挂起
Guard，等待前台、cron 和通知轮次落定，执行迁移，刷新模型上下文，并在
`finally` 中释放闸门。Prompt 接纳在写入者准入前后都检查闸门。落定循环
在每次完成后重新检查所有权，因此在等待前序 prompt 时于闸门之前被接纳的
prompt 也会被包含在内。迁移失败会让旧的 Guard 保持挂起。

`dispose()` 保持同步，但会用专用的受控取消原因中止前台控制器，硬挂起
Guard，并阻止迟到的工具结果复活它。生产关闭路径仍负责等待轮次落定。

在持久化会话加载或恢复时，历史重放、worktree 恢复、暂停 agent 恢复和
goal 恢复都在重写器和持久 cron 调度器启动之前完成。这防止了一个立即到期
的 cron 触发与恢复竞争，并把先前存在的暂停 agent 分类为已恢复链路的新
工作。

延迟 cron 溢出在去重之后计算。一个关联的传入项可以保留二十个无关项；
一个无关的传入项先修剪到十九个，然后自己成为第二十个。关联条目永远不会
被驱逐，多条目修剪只发出一条诊断。

通知队列中所有有界条目都是关联的情况仍然搁置。用一个唯一的关联结果
替换另一个仍是无声的数据丢失。后续设计必须为每个被省略的关联结果提供
可恢复的结果，或提供模型和用户都可见的持久缺口提示。在
[#7805](https://github.com/QwenLM/qwen-code/issues/7805) 中跟踪该项
工作。
