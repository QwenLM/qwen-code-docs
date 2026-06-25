# 飞书（Lark）

本指南介绍如何在飞书（Feishu）/ Lark 上配置 Qwen Code channel。

## 前提条件

- 飞书组织账号
- 一个包含 App ID 和 App Secret 的飞书应用（见下文）

## 创建应用

1. 前往[飞书开放平台](https://open.feishu.cn)
2. 创建一个新应用（或使用已有应用）

![](https://gw.alicdn.com/imgextra/i4/O1CN01ORb10i1JM0MQfhnsV_!!6000000001013-2-tps-2219-931.png)

3. 在应用中开启**机器人**能力（添加应用能力 → 机器人）

![](https://gw.alicdn.com/imgextra/i4/O1CN01bClpxu1FZxyH4kNjJ_!!6000000000502-2-tps-2219-931.png)

4. 在**事件与回调**中，选择**使用长连接接收事件**

![](https://gw.alicdn.com/imgextra/i1/O1CN01uIwzbl1ph8Kwq7hTI_!!6000000005391-2-tps-2219-1166.png)

5. 添加事件 `im.message.receive_v1`（接收消息）

![](https://gw.alicdn.com/imgextra/i2/O1CN01n7sZmV28s6WX0aDhw_!!6000000007987-2-tps-2219-1090.png)

6. 在应用凭证页面记录 **App ID**（Client ID）和 **App Secret**（Client Secret）

![](https://gw.alicdn.com/imgextra/i2/O1CN01ag1yBh1DxfEUb4xmE_!!6000000000283-2-tps-2219-1166.png)

### 所需权限

在**权限管理**（Permissions & Scopes）中开启以下权限：

- `im:message` — 读取和发送消息
- `im:message:send_as_bot` — 以机器人身份发送消息
- `im:resource` — 访问消息资源（图片、文件）

### 发布应用

配置完权限和事件后，创建版本并发布。应用在发布并审核通过前，机器人将无法正常使用。

![](https://gw.alicdn.com/imgextra/i1/O1CN01GbNRcj1lVuACnkV6M_!!6000000004825-2-tps-2219-1090.png)

## 配置

将 channel 添加到 `~/.qwen/settings.json`：

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

| 选项                   | 说明                                                              |
| ---------------------- | ----------------------------------------------------------------- |
| `clientId`             | 飞书 App ID                                                       |
| `clientSecret`         | 飞书 App Secret                                                   |
| `collapsible`          | 将长回复折叠为可展开的区块（默认值：`false`）                    |
| `collapsibleThreshold` | 触发折叠的字符数阈值（默认值：`500`）                            |
| `webhookPort`          | 如果设置，则使用 HTTP webhook 模式而非 WebSocket                  |
| `verificationToken`    | webhook 模式的验证 token                                          |
| `encryptKey`           | webhook 模式的加密密钥                                            |

## 运行

```bash
# 仅启动飞书 channel
qwen channel start my-feishu

# 或同时启动所有已配置的 channel
qwen channel start
```

打开飞书，向机器人发送消息。你将看到一个带有流式内容的交互式卡片。

## 连接模式

### WebSocket（默认）

WebSocket 模式使用出站长连接，无需公网 URL 或服务器，是大多数场景下推荐使用的模式。

### Webhook

如果需要使用 webhook 模式（例如用于共享应用），请在配置中设置 `webhookPort`：

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

然后在飞书开放平台将请求 URL 设置为 `http://<your-server>:9321`。

## 群聊

飞书机器人支持私聊和群聊。要启用群聊支持：

1. 在 channel 配置中将 `groupPolicy` 设置为 `"allowlist"` 或 `"open"`
2. 将机器人添加到飞书群
3. 在群中 @mention 机器人以触发回复

默认情况下，机器人在群聊中需要 @mention（`requireMention: true`）。可针对特定群将 `"requireMention"` 设为 `false`，使其响应所有消息。

## 功能特性

### 交互式卡片流式输出

回复以飞书交互式卡片的形式呈现，支持实时流式更新。生成过程中卡片显示"生成中"状态提示，并提供**停止**按钮用于取消生成。

### 引用/回复上下文

当你引用一条消息进行回复时，被引用的内容会自动作为上下文传递给 agent。支持以下类型：

- 文本和富文本消息
- 交互式卡片（机器人的历史回复）

### 图片和文件

你可以向机器人发送照片和文档：

- **图片：** 使用多模态视觉能力进行分析
- **文件：** 下载并保存到本地供 agent 读取

### 并发消息

同一群聊中的多个用户可以同时发送消息。每条消息都有独立的卡片和回复，互不干扰。

## 与钉钉的主要差异

- **回复格式：** 使用飞书交互式卡片（v2 schema），支持原生 markdown 渲染，包括表格
- **流式输出：** 卡片内容通过限频的 PATCH 请求（间隔 1.5 秒）原地更新
- **连接方式：** 通过 `@larksuiteoapi/node-sdk` 使用 WebSocket，同样无需公网 URL
- **处理指示：** 处理过程中会添加"OnIt" emoji reaction
- **引用上下文：** 支持引用文本消息和交互式卡片

## 故障排查

### 机器人无法连接

- 确认 App ID 和 App Secret 填写正确
- 确认事件订阅中已选择**长连接**模式
- 确认已订阅 `im.message.receive_v1` 事件
- 查看终端输出中的连接错误信息

### 机器人在群聊中不响应

- 检查 `groupPolicy` 是否设置为 `"allowlist"` 或 `"open"`（默认值为 `"disabled"`）
- 确认在群消息中 @mention 了机器人
- 确认机器人已被添加到该群

### 卡片一直处于"生成中"状态

- 通常表示回复已完成但最终卡片更新失败
- 查看终端日志中的 API 报错（频率限制、卡片大小限制等）
- 包含大量表格的超长回复可能超出飞书卡片的元素数量限制

### 引用内容未包含卡片内容

- 机器人通过 `card_msg_content_type=user_card_content` API 参数读取卡片内容
- 确认机器人具有 `im:message` 权限以读取消息
