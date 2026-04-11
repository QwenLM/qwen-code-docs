# DingTalk (钉钉)

本指南介绍如何在 DingTalk（钉钉）上配置 Qwen Code 频道。

## 前置条件

- 一个钉钉组织账号
- 一个已获取 AppKey 和 AppSecret 的钉钉机器人应用（见下文）

## 创建机器人

1. 访问 [钉钉开放平台开发者后台](https://open-dev.dingtalk.com)
2. 创建新应用（或使用现有应用）
3. 在应用中启用 **机器人** 能力
4. 在机器人设置中，启用 **Stream 模式**（机器人协议 → Stream 模式）
5. 在应用凭证页面记录 **AppKey**（Client ID）和 **AppSecret**（Client Secret）

### Stream 模式

钉钉 Stream 模式使用出站 WebSocket 连接——无需公网 URL 或服务器。机器人会主动连接钉钉服务器，消息通过 WebSocket 推送。这是最简单的部署模型。

## 配置

将频道配置添加到 `~/.qwen/settings.json`：

```json
{
  "channels": {
    "my-dingtalk": {
      "type": "dingtalk",
      "clientId": "$DINGTALK_CLIENT_ID",
      "clientSecret": "$DINGTALK_CLIENT_SECRET",
      "senderPolicy": "open",
      "sessionScope": "user",
      "cwd": "/path/to/your/project",
      "instructions": "You are a concise coding assistant responding via DingTalk.",
      "groupPolicy": "open",
      "groups": {
        "*": { "requireMention": true }
      }
    }
  }
}
```

将凭证设置为环境变量：

```bash
export DINGTALK_CLIENT_ID=<your-app-key>
export DINGTALK_CLIENT_SECRET=<your-app-secret>
```

或者在 `settings.json` 的 `env` 字段中定义：

```json
{
  "env": {
    "DINGTALK_CLIENT_ID": "your-app-key",
    "DINGTALK_CLIENT_SECRET": "your-app-secret"
  }
}
```

## 运行

```bash
# 仅启动钉钉频道
qwen channel start my-dingtalk

# 或同时启动所有已配置的频道
qwen channel start
```

打开钉钉并向机器人发送消息。在 Agent 处理期间，你应该会看到消息上出现 👀 表情回应，处理完成后会显示回复内容。

## 群聊

钉钉机器人支持单聊和群聊。要启用群聊支持：

1. 在频道配置中将 `groupPolicy` 设置为 `"allowlist"` 或 `"open"`
2. 将机器人添加到钉钉群
3. 在群内 @机器人 以触发回复

默认情况下，机器人在群聊中需要被 @mention（`requireMention: true`）。为特定群设置 `"requireMention": false` 可使其响应所有消息。完整详情请参阅 [群聊](./overview#group-chats)。

### 查找群的 Conversation ID

钉钉使用 `conversationId` 标识群聊。当有人在群内发送消息时，你可以在频道服务日志中找到它——在日志输出中查找 `conversationId` 字段即可。

## 图片与文件

除了文本，你还可以向机器人发送图片和文档。

**图片：** 发送图像（截图、图表等），Agent 将使用其视觉能力进行分析。这需要多模态模型——在频道配置中添加 `"model": "qwen3.5-plus"`（或其他支持视觉的模型）。钉钉支持直接发送图片，或作为富文本消息的一部分（图文混排）。

**文件：** 发送 PDF、代码文件或任意文档。机器人会从钉钉服务器下载文件并保存到本地，以便 Agent 使用文件工具读取。同时也支持音频和视频文件。此功能适用于任意模型。

## 与 Telegram 的主要区别

- **认证方式：** 使用 AppKey + AppSecret 替代静态 Bot Token。SDK 会自动管理 Access Token 的刷新。
- **连接方式：** 采用 WebSocket 流式连接而非轮询——无需公网 IP 或 Webhook URL。
- **格式排版：** 回复使用钉钉的 Markdown 方言（有限子集）。由于钉钉不支持渲染表格，表格会自动转换为纯文本。长消息会在约 3800 字符处自动分段。
- **处理状态指示：** 处理期间会在用户消息上添加 👀 表情回应，回复发送后自动移除。
- **媒体下载：** 两步流程——通过钉钉 API 将消息中的 `downloadCode` 交换为临时下载 URL。
- **群聊：** 钉钉使用 `isInAtList` 字段检测 @mention，而非解析消息实体。

## 使用建议

- **使用适配钉钉 Markdown 的提示词** —— 钉钉仅支持有限的 Markdown 子集（标题、加粗、链接、代码块，不支持表格）。添加类似“使用钉钉 Markdown 格式。避免使用表格。”的指令有助于 Agent 正确格式化回复。
- **限制访问权限** —— 在企业组织场景下，`senderPolicy: "open"` 通常可以接受。如需更严格的控制，请使用 `"allowlist"` 或 `"pairing"`。详情请参阅 [单聊配对](./overview#dm-pairing)。
- **引用消息** —— 引用（回复）用户消息时，被引用的文本会作为上下文提供给 Agent。目前尚不支持引用机器人的回复。

## 故障排查

### 机器人无法连接

- 确认 AppKey 和 AppSecret 正确无误
- 确保在运行 `qwen channel start` 前已正确设置环境变量
- 确认在钉钉开放平台开发者后台的机器人设置中已启用 **Stream 模式**
- 检查终端输出中的连接错误信息

### 机器人在群聊中无响应

- 确认 `groupPolicy` 已设置为 `"allowlist"` 或 `"open"`（默认为 `"disabled"`）
- 确保在群消息中 @机器人
- 确认机器人已被添加到该群

### "No sessionWebhook in message"

这表示钉钉在消息回调中未包含回复端点。通常是因为机器人权限配置有误。请检查开发者后台中的机器人设置。

### "Sorry, something went wrong processing your message"

这通常表示 Agent 在处理过程中遇到了错误。请查看终端输出以获取详细信息。