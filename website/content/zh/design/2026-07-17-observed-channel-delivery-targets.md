# 工作空间作用域的已观察 channel 联系人

## 问题

daemon 管理的 channel worker 在入站消息上接收平台用户、群组和话题标识符，但这些标识符是瞬时的。经过认证的工作空间客户端需要一个读取 API，列出最近观察到的 IM 联系人，这样用户就可以选择一个完整的平台投递目标，而无需手动查找或重新输入标识符。

## 范围

本变更观察已接受的入站消息，为每个 daemon 工作空间持久化一个有界的关系图，并返回钉钉、飞书、Telegram 和企业微信 channel 的完整平台标识符。

它不会修改 webhook 配置或主动投递，不查询平台目录，不声称返回完整的群组成员列表，不观察机器人输出，也不回填历史流量。独立的 `qwen channel start` 保持不变。

## 所有权与持久化

daemon 工作空间运行时拥有该注册表：

```text
$QWEN_HOME/channels/daemon/<workspaceHash>/observed-contacts.json
```

`QWEN_HOME` 是进程级的，但 `<workspaceHash>` 按规范化工作空间路径分区数据。该注册表不存储在工作空间 checkout 中，也不作为一个进程全局的图共享。其目录在支持的环境中使用模式 `0700`；原子写入的 JSON 文件使用模式 `0600`。

该注册表在整个工作空间的所有 channel 和会话中最多存储 500 条关系观察。每条观察包含 `channelName`、一个用户身份、一个可选的群组身份、一个可选的话题身份以及 `lastObservedAt`。去重键是 `[channelName, user.id, group?.id, topic?.id]`。因此一个嘈杂的会话可能逐出另一个会话的较旧观察。超过最长 365 天可读窗口的观察会在下一次被接受的写入时被移除。

## 观察边界

记录发生在共享的入站 preflight 接受一条真实 IM 消息之后、命令或 Agent 处理开始之前。因此私聊/群聊策略、提及、发送者白名单和配对拒绝都发生在持久化之前。

同一个 `Envelope` 对象最多被记录一次。后续消息会刷新匹配关系的时间戳和标签。持久化是尽力而为的：记录一条不含标识符的脱敏错误，并继续已接受消息的处理。

该注册表从不存储消息文本、消息 ID、附件、载荷、凭据、webhook 请求、主动发送或机器人输出。

## 关系模型

```ts
interface ObservedChannelContactObservation {
  user: { id: string; label: string };
  group?: { id: string; label: string };
  topic?: { id: string; label: string };
}
```

- 私聊消息从完整的平台 `senderId` 记录一个顶层用户。
- 群组消息从完整的平台 `chatId` 记录群组，并记录该群组内被观察到的用户。
- 带话题的群组消息还从 `threadId` 记录话题，并记录该话题内被观察到的用户。
- 只在群组中出现过的用户不会出现在顶层 `users` 中。如果同一用户还发送过私聊消息，它会同时出现在顶层和相关群组下。
- `groups[].users` 和 `groups[].topics[].users` 表示在那些会话中被观察到的用户。它们不是权威的平台成员列表。
- 发送者标签使用脱敏后的入站显示名，回退到完整的用户 ID。群组标签在被接受的入站 envelope 提供名称时使用脱敏后的名称；钉钉映射 `conversationTitle`，Telegram 映射 `chat.title`。飞书和企业微信的群组标签以及所有话题标签都回退到其完整 ID。

飞书将 `root_id` 映射为 `threadId`；Telegram 将 `message_thread_id` 映射为 `threadId`。当前的钉钉和企业微信 envelope 不暴露稳定的话题标识符，因此它们的观察止于群组级别。

## 新鲜度

人员、会话和关系都会变化。读取 API 会过滤观察结果，而不是把注册表当作永久事实呈现：

- 默认新鲜度：七天；
- 调用方可覆盖：`freshWithinSeconds`，从 1 秒到 365 天；
- 用户、群组用户、话题用户、群组和话题的时间戳各自独立地从最近的观察中推导；
- 被动观察无法立即检测出不产生新消息的退出、删除或改名，因此过期的关系只有在超出请求的窗口时才会消失。

## 读取 API

主工作空间：

```http
GET /workspace/channel/observed-contacts?freshWithinSeconds=604800
Authorization: Bearer <daemon token>
```

选定的已注册工作空间：

```http
GET /workspaces/:workspace/channel/observed-contacts?freshWithinSeconds=604800
Authorization: Bearer <daemon token>
```

示例：

```json
{
  "users": [
    {
      "channelName": "feishu-main",
      "label": "Example User",
      "id": "ou_complete_user_id",
      "lastObservedAt": "2026-07-17T08:00:00.000Z"
    }
  ],
  "groups": [
    {
      "channelName": "feishu-main",
      "label": "oc_complete_chat_id",
      "id": "oc_complete_chat_id",
      "lastObservedAt": "2026-07-17T08:05:00.000Z",
      "users": [
        {
          "label": "Example User",
          "id": "ou_complete_user_id",
          "lastObservedAt": "2026-07-17T08:05:00.000Z"
        }
      ],
      "topics": [
        {
          "label": "om_complete_root_id",
          "id": "om_complete_root_id",
          "lastObservedAt": "2026-07-17T08:05:00.000Z",
          "users": [
            {
              "label": "Example User",
              "id": "ou_complete_user_id",
              "lastObservedAt": "2026-07-17T08:05:00.000Z"
            }
          ]
        }
      ]
    }
  ]
}
```

响应使用 `Cache-Control: no-store`。主路由只读取主工作空间分区。限定路由要求一个精确的已注册、受信任的运行时，对于未知、不受信任、引导中、draining 或已移除的工作空间绝不回退到主工作空间。

缺失的注册表返回空图。格式错误的数据返回脱敏的 `500`，代码为 `channel_observed_contacts_unavailable`。删除该工作空间的 `observed-contacts.json` 文件可重置格式错误或不支持的注册表；被接受的流量会重新创建它。非法的新鲜度返回 `400 invalid_freshness`。

客户端通过 `workspace_channel_observed_contacts` serve capability 发现该路由。该路由是只读的，并在 daemon bearer 认证之后注册。

## 兼容性

webhook 解析、请求、目标解析和投递与 `main` 完全一致。此 API 只暴露已观察到的标识符；调用方决定如何使用它们。该注册表从 schema 版本 1 开始，因为更早的不透明引用原型从未发布。

## 测试策略

- 基础 channel 测试覆盖 preflight 边界、话题规范化、Envelope 去重和非阻塞的持久化失败。
- Store 测试覆盖私聊与群组语义、群组/话题关系、新鲜度、刷新、上限、权限和格式错误的数据。
- 路由测试覆盖完整标识符、no-store 响应、新鲜度校验、精确的工作空间所有权和脱敏的失败。
- 服务器测试覆盖 bearer 认证和能力宣告。
- webhook 回归测试验证没有任何行为与 `main` 不同。
