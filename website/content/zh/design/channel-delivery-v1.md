# Channel Delivery V1

## 目标

允许定时任务、守护进程 prompt 以及一个直接的 Notify API，通过拥有所选工作空间的 Channel Worker，把文本发送到显式的 IM 目标。投递是即时且尽力而为的：没有持久 outbox、重放、重试或全局最终答案 hook。

## 公共契约

```ts
interface ChannelDelivery {
  kind: 'channel';
  target: {
    channelName: string;
    type: 'user' | 'chat';
    id: string;
  };
}
```

定时任务创建和 `POST /session/:id/prompt` 接受一个可选的顶层 `delivery`。直接通知使用：

```http
POST /workspace/notify
POST /workspaces/:workspace/notify

{
  "text": "alert text",
  "delivery": {
    "kind": "channel",
    "target": {
      "channelName": "dingtalk",
      "type": "user",
      "id": "platform-user-id"
    }
  }
}
```

守护进程在其信任边界把公共目标归一化为内部 worker 请求 `{ deliveryId, channelName, target: { type, id }, text }`。发送给 worker 的文本必须非空，并在 IPC 之前限制在 100,000 个 UTF-16 码元以内。Prompt 和定时反向控制只有为了把一次成功轮次但没有可投递最终答案报告为 `skipped` 时才可以携带空字符串；该路径永远不会到达 worker IPC。

## 执行边界

定时任务和 Prompt 各自持有其最终答案语义。Session 只在当前调用携带投递元数据时才捕获文本。每次模型发送持有一个响应块：非思考流式块在该块内拼接，非续接的重试或模型回退丢弃被取代的块，任何请求工具的块都是中间块，不能成为投递载荷。较后的自动续接替换较早的终结候选。在完整轮次到达成功的 `end_turn` 之后，Session 恰好提交一个反向控制请求，其中只包含最后一个无工具的助手响应块。工具间叙述和所有更早的响应块都被排除。

成功的 `end_turn` 总是提交反向控制请求，包括最终块为空或仅含空白时。守护进程首先消费钉住的授权，返回 `skipped` 而不解析 worker，并发布 `channel_delivery_result` 事件。取消、Agent 失败和令牌上限终止不提交任何东西。因此空输出可以与一次从未符合投递条件的轮次区分开。

Prompt 准入仍为 `202`；Agent 完成仍为 `turn_complete` 或 `turn_error`。Channel 完成是较后的 `channel_delivery_result` 事件，绝不把 Agent 成功转换为 `turn_error`。

Notify 绕过 Session 和 Agent。它等待一次 worker 投递尝试，并把无效输入映射为 400、worker 不可用或已满映射为 503、超时映射为 504、适配器失败映射为 502。超时的投递结果未知，且不重试。

Webhook 仍是独立的异步路径，有自己的密钥和 `202` worker 准入契约。它可以复用 `ChannelBase` 的发送原语和错误分类，但不复用 Prompt/Notify 的控制流。后台通知 prompt 仍是本地 Agent 工作，不会自动发送到 IM。

## 工作空间归属

守护进程在构建每个 ACP 桥接时绑定工作空间。Prompt 准入记录守护进程签发的投递 ID 和钉住的目标，而定时投递从持久化的任务获得授权。子进程回调必须与该授权匹配，不能选择 `workspaceCwd` 或替换目标。宿主回调在决定 `skipped` 还是 worker 投递之前先消费授权，因此空的最终答案无法伪造事件，也无法让一次性/单调的授权状态保持不变。非空文本只路由到规范工作空间的 worker 组。缺失、引导中、draining、已停止或已移除的所有者返回 `channel_worker_unavailable`；没有回退到主运行时，也没有惰性 worker 启动。

## 可靠性与隐私

授权在检查 worker 可用性之前消费，因此消费之后的一次短暂 worker 抖动会永久丢弃那一次投递；这与即时、尽力而为、不重试的契约一致。

这个 V1 没有持久化、启动重放、历史扫描、重试或幂等保证。没有 delivery 的现有任务绝不发送。现有的调度器补偿行为不变。正常执行只在任务本身已包含 delivery 时才携带它；合成的历史漏发 one-shot 批次会显式清除 delivery，因此之后启用 Channel 不会造成旧告警的爆发。

V1 只观察 Channel 发送 Promise。拒绝会被清洗并映射为 `channel_delivery_failed`，但已经提供类型化永久处置的适配器映射为 `channel_delivery_rejected`。跨 IM 适配器的提供方专属响应解析和一致的错误原因语义是后续工作；守护进程和 worker 不包含平台专属的错误处理。

投递结果事件和日志包含关联标识符、来源、状态和清洗后的错误数据。它们绝不包含消息文本、目标 ID、凭据或 webhook 密钥。`delivered` 表示适配器发送 Promise 已解析；它不断言提供方接受了消息，也不断言用户收到或阅读了它。

## 能力

守护进程在支持这些契约和路由时广播 `channel_delivery`。这是协议支持，不是对任何 worker 或适配器的存活健康断言。
