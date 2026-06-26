# 飞书（Lark）

本指南介绍如何在飞书（Lark）上设置 Qwen Code 频道。

## 前置条件

- 一个飞书企业账号
- 一个拥有 App ID 和 App Secret 的飞书应用（见下文）

## 创建应用

1. 前往[飞书开放平台](https://open.feishu.cn)
2. 创建新应用（或使用已有应用）

![](https://gw.alicdn.com/imgextra/i4/O1CN01ORb10i1JM0MQfhnsV_!!6000000001013-2-tps-2219-931.png)

3. 在应用下，开启**机器人**能力（添加应用能力 → 机器人）

![](https://gw.alicdn.com/imgextra/i4/O1CN01bClpxu1FZxyH4kNjJ_!!6000000000502-2-tps-2219-931.png)

4. 在**事件与回调**中，选择**使用长连接接收事件**

![](https://gw.alicdn.com/imgextra/i1/O1CN01uIwzbl1ph8Kwq7hTI_!!6000000005391-2-tps-2219-1166.png)

5. 添加事件 `im.message.receive_v1`（接收消息）

![](https://gw.alicdn.com/imgextra/i2/O1CN01n7sZmV28s6WX0aDhw_!!6000000007987-2-tps-2219-1090.png)

6. 在应用凭证页面记录 **App ID**（Client ID）和 **App Secret**（Client Secret）

![](https://gw.alicdn.com/imgextra/i2/O1CN01ag1yBh1DxfEUb4xmE_!!6000000000283-2-tps-2219-1166.png)

### 所需权限

在**权限管理**中启用以下权限：

- `im:message` — 读取和发送消息
- `im:message:send_as_bot` — 以机器人身份发送消息
- `im:resource` — 访问消息资源（图片、文件）

### 发布应用

配置权限和事件后，创建版本并发布。应用发布并审核通过后，机器人才能正常工作。

![](https://gw.alicdn.com/imgextra/i1/O1CN01GbNRcj1lVuACnkV6M_!!6000000004825-2-tps-2219-1090.png)

## 配置

将频道添加到 `~/.qwen/settings.json`：

```json
{
  "channels": {
    "my-feishu": {
      "type": "feishu",
      "clientId": "<your-app-id>",
      "clientSecret": "<your-app-secret>",
      "senderPolicy": "open",
      "sessionScope": "user",
      "cwd": "/path/to/your/project",
      "groupPolicy": "open",
      "collapsible": true,
      "groups": {
        "*": { "requireMention": true }
      }
    }
  }
}
```

### 配置项说明

| 选项                   | 描述                                                           |
| ---------------------- | -------------------------------------------------------------- |
| `clientId`             | 飞书应用 ID                                                    |
| `clientSecret`         | 飞书应用密钥                                                    |
| `collapsible`          | 将长回复折叠为可展开的区块（默认：`false`）                        |
| `collapsibleThreshold` | 折叠的字符阈值（默认：`500`）                                    |
| `webhookPort`          | 如果设置，则使用 HTTP Webhook 模式而非 WebSocket                |
| `verificationToken`    | Webhook 模式的验证令牌                                          |
| `encryptKey`           | Webhook 模式的加密密钥                                          |

## 运行

```bash
# Start only the Feishu channel
qwen channel start my-feishu

# Or start all configured channels together
qwen channel start
```

打开飞书，向机器人发送消息。你将看到带有流式响应的交互式卡片。

## 连接模式

### WebSocket（默认）

WebSocket 模式使用出站长连接，不需要公网 URL 或服务器。这是大多数部署场景的推荐模式。

### Webhook

如果需要 Webhook 模式（例如用于共享应用），请在配置中设置 `webhookPort`：

```json
{
  "channels": {
    "my-feishu": {
      "type": "feishu",
      "webhookPort": 9321,
      "verificationToken": "<from-feishu-console>",
      "encryptKey": "<from-feishu-console>"
    }
  }
}
```

然后在飞书开放平台中将请求 URL 设置为 `http://<your-server>:9321`。

## 群聊

飞书机器人在私聊和群聊中均可使用。要启用群聊支持：

1. 将频道配置中的 `groupPolicy` 设置为 `"allowlist"` 或 `"open"`
2. 将机器人添加到飞书群组
3. 在群组中 @提及 机器人以触发响应

默认情况下，机器人在群聊中需要 @提及（`requireMention: true`）。对特定群组设置 `"requireMention": false` 可使其响应所有消息。

## 功能

### 交互式卡片流式更新

回复将以飞书交互式卡片的形式呈现，并实时流式更新。在生成回复时，卡片会显示“生成中”指示器，并提供一个**停止**按钮用于取消生成。

### 引用/回复上下文

当你回复（引用）一条消息时，被引用的内容会自动作为上下文提供给智能体。这适用于：

- 文本和富文本消息
- 交互式卡片（机器人之前的回复）

### 图片和文件

你可以向机器人发送照片和文档：

- **图片：** 使用多模态视觉能力进行分析
- **文件：** 下载并保存在本地供智能体读取

### 并发消息

多个用户可以在同一群聊中同时发送消息。每条消息都有独立的卡片和回复，互不干扰。

## 与钉钉的主要区别

- **回复格式：** 使用飞书交互式卡片（v2 架构），原生支持 Markdown 渲染，包括表格
- **流式更新：** 通过节流的 PATCH 请求（间隔 1.5 秒）就地更新卡片内容
- **连接方式：** 通过 `@larksuiteoapi/node-sdk` 使用 WebSocket — 同样仅出站模式，无需公网 URL
- **处理指示：** 处理时会添加一个“OnIt”表情反应
- **引用上下文：** 支持引用文本消息和交互式卡片

## 故障排除

### 机器人无法连接

- 验证 App ID 和 App Secret 是否正确
- 确保在事件订阅中选择了**使用长连接接收事件**
- 检查是否订阅了 `im.message.receive_v1` 事件
- 检查终端输出中的连接错误

### 机器人在群聊中不响应

- 检查 `groupPolicy` 是否设置为 `"allowlist"` 或 `"open"`（默认为 `"disabled"`）
- 确保在群消息中 @提及 了机器人
- 验证机器人已添加到群组

### 卡片停留在“生成中”状态

- 这通常表示回复已完成，但最后的卡片更新失败
- 检查终端日志中的 API 错误（频率限制、卡片大小限制）
- 包含大量表格的超长回复可能达到飞书卡片元素限制

### 引用不包含卡片内容

- 机器人通过 `card_msg_content_type=user_card_content` API 参数读取卡片内容
- 确保机器人具有 `im:message` 权限以读取消息