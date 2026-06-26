# DingTalk（钉钉）

本指南介绍如何在钉钉（DingTalk）上设置 Qwen Code 频道。

## 前置条件

- 一个钉钉组织账号
- 一个具有 AppKey 和 AppSecret 的钉钉机器人应用（请参见下文）

## 创建机器人

1. 前往 [DingTalk 开发者平台](https://open-dev.dingtalk.com)
2. 创建一个新应用（或使用已有应用）
3. 在应用下，启用 **机器人** 能力
4. 在机器人设置中，启用 **Stream 模式**（机器人协议 → Stream 模式）
5. 在应用凭证页面记下 **AppKey**（Client ID）和 **AppSecret**（Client Secret）

### Stream 模式

钉钉 Stream 模式使用出站 WebSocket 连接——无需公共 URL 或服务器。机器人连接到钉钉服务器，服务器通过 WebSocket 推送消息。这是最简单的部署模型。

## 配置

将频道添加到 `~/.qwen/settings.json`：

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
      "instructions": "你是一个通过钉钉响应的简洁编码助手。",
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

或者在 `settings.json` 的 `env` 部分中定义：

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

# 或者一起启动所有已配置的频道
qwen channel start
```

打开钉钉并向机器人发送消息。你应该会看到 👀 表情反应出现，表示代理正在处理，随后返回响应。

## 群聊

钉钉机器人支持私聊和群聊。要启用群聊支持：

1. 在频道配置中将 `groupPolicy` 设置为 `"allowlist"` 或 `"open"`
2. 将机器人添加到钉钉群组
3. 在群组中 @提及 机器人以触发响应

默认情况下，机器人在群聊中需要 @提及（`requireMention: true`）。将特定群组的 `"requireMention": false` 可使其响应所有消息。参见[群聊](./overview#group-chats)了解完整详情。

### 查找群聊的 Conversation ID

钉钉使用 `conversationId` 来标识群组。你可以在频道服务日志中找到它——当有人在群组中发送消息时，在日志输出中查找 `conversationId` 字段。

## 图片与文件

你可以向机器人发送照片和文档，而不仅仅是文本。

**图片：** 发送图片（截图、图表等），代理将利用其视觉能力进行分析。这需要多模态模型——在频道配置中添加 `"model": "qwen3.5-plus"`（或其他支持视觉的模型）。钉钉支持直接发送图片或作为富文本消息（图文混合）的一部分。

**文件：** 发送 PDF、代码文件或任何文档。机器人从钉钉服务器下载并本地保存，以便代理使用其文件工具读取。也支持音频和视频文件。此功能适用于任何模型。

## 与 Telegram 的主要区别

- **认证：** 使用 AppKey + AppSecret 而非静态的机器人令牌。SDK 会自动管理访问令牌刷新。
- **连接：** WebSocket 流而非轮询——无需公共 IP 或 webhook URL。
- **格式化：** 响应使用钉钉的 markdown 方言（有限子集）。由于钉钉不支持表格，表格会自动转换为纯文本。长消息会在约 3800 字符处分块。
- **工作指示：** 处理过程中，会在用户消息上添加 👀 表情反应，发送响应后移除。
- **媒体下载：** 两步流程——从消息中获取 `downloadCode`，再通过钉钉 API 换取临时下载 URL。
- **群组：** 钉钉使用 `isInAtList` 检测 @提及，而非解析消息实体。

## 提示

- **使用钉钉 markdown 感知指令**——钉钉支持有限的 markdown 子集（标题、粗体、链接、代码块，但不支持表格）。添加类似“使用钉钉 markdown。避免使用表格。”的指令有助于代理正确格式化响应。
- **限制访问**——在组织环境下，`senderPolicy: "open"` 可能可以接受。如需更严格的控制，使用 `"allowlist"` 或 `"pairing"`。参见[私聊配对](./overview#dm-pairing)了解详情。
- **引用消息**——引用（回复）用户消息会将引用的文本作为上下文提供给代理。暂不支持引用机器人回复。

## 故障排查

### 机器人无法连接

- 确保 AppKey 和 AppSecret 正确
- 检查在运行 `qwen channel start` 前是否已设置环境变量
- 确认在钉钉开发者平台的机器人设置中已启用 **Stream 模式**
- 检查终端输出中的连接错误

### 机器人在群聊中无响应

- 检查 `groupPolicy` 是否设置为 `"allowlist"` 或 `"open"`（默认为 `"disabled"`）
- 确保在群消息中 @提及 了机器人
- 确认机器人已添加到群组

### "No sessionWebhook in message"

这意味着钉钉在消息回调中未包含回复端点。可能是机器人权限配置错误。请检查开发者平台中的机器人设置。

### "Sorry, something went wrong processing your message"

这通常意味着代理遇到了错误。检查终端输出以获取详细信息。