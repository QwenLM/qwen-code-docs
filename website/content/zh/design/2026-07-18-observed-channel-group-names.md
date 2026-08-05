# 已观察 channel 的群组名称

## 问题

由 #7109 引入的工作空间作用域已观察联系人图保留了完整的平台群组 ID，但目前每个 `groups[].label` 都回退到该 ID。一些入站 channel 回调已经携带人类可读的群组名称，而适配器在共享观察边界之前就丢弃了它。

选择主动投递目标的用户需要在完整、稳定的平台 ID 旁边看到可读的名称。该名称是观察性元数据，而不是路由键。

## 范围

为共享入站 envelope 添加一个可选的群组名称，且只从已接受的入站消息中已有的元数据填充它。

- 钉钉映射 Stream 回调的 `conversationTitle`。
- Telegram 为群组和超级群组映射入站会话的 `title`。
- 飞书保留完整 `chat_id` 回退，因为 `im.message.receive_v1` 不包含会话显示名称。
- 其他适配器保留 ID 回退，除非其现有的入站载荷具有文档化的群组名称字段。

本变更不调用平台目录、群组详情或会话信息 API；不添加权限；不改变路由或会话身份；不发现权威成员列表；不观察机器人输出；也不添加话题名称。

## 契约

`Envelope` 新增一个可选字段：

```ts
chatName?: string;
```

该字段描述在该消息上观察到的 `chatId` 的显示名称。私聊消息会忽略它。`chatId` 仍然是完整的平台投递键，并继续决定会话、去重和图身份。

公共观察路径使用脱敏后的非空 `chatName` 作为群组标签。缺失或不可用的值回退到完整的 `chatId`。现有的注册表存储把持久化标签限制在 256 个 UTF-16 码元内，且不拆分代理对。

## 刷新语义

同一 channel、用户和群组被接受的后续消息会刷新观察。如果它携带不同的可用 `chatName`，现有的存储替换语义会更新派生的群组标签，而不会创建另一个群组节点。新鲜度仍然基于 `lastObservedAt`；名称不被视为永久的或权威的。

在后续消息中省略群组名称的平台会为该观察贡献 ID 回退。图的派生已经选择最新的观察，因此返回的标签代表最新接受的证据，而不是一个隐藏的长期名称缓存。

## 平台证据

- 钉钉的 Stream 机器人消息示例在入站回调中包含 `conversationTitle`：[DingTalk Stream protocol](https://opensource.dingtalk.com/developerpedia/docs/learn/stream/protocol/#%E5%9B%9E%E8%B0%83%E6%8E%A8%E9%80%81)。
- Telegram 将 `Message.chat` 定义为 `Chat`，其 `title` 对群组会话和超级群组可用：[Telegram Bot API — Chat](https://core.telegram.org/bots/api/#chat)。
- 飞书的接收消息事件列举了 `chat_id`、`chat_type` 和 `thread_id`，但没有会话显示名称：[Feishu Open Platform — Receive message](https://open.feishu.cn/document/uAjLw4CM/ukTMukTMukTM/reference/im-v1/message/events/receive)。

## 测试策略

- 基础 channel 测试证明可用的群组名称会传播，不可用的名称回退到完整 ID，私聊消息忽略 `chatName`，且后续观察可以刷新标签。
- 钉钉适配器测试证明 `conversationTitle` 进入 envelope，且不改变回调处理。
- Telegram 适配器测试证明群组和超级群组的标题进入 envelope，同时私聊会话保持不变。
- 现有的飞书测试继续证明 ID 回退路径，且无需 API 流量。
- 专门的 store 测试覆盖较新标签的替换；不需要 schema 迁移，因为持久化的观察已经包含 `group.label`。
