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
      "useConnectionManager": true,
      "senderPolicy": "open",
      "sessionScope": "user",
      "cwd": "/path/to/your/project",
      "instructions": "你是一个通过钉钉响应的简洁编码助手。",
      "groupPolicy": "open",
      "atSender": true,
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

### 互动卡片

添加 `interactiveCards` 对象以启用钉钉状态和问题卡片。省略该对象则禁用互动卡片。当该对象存在时，总开关和两种卡片类型默认启用，问题卡片在 270,000 毫秒（270 秒）后超时。

```json
{
  "channels": {
    "my-dingtalk": {
      "type": "dingtalk",
      "clientId": "$DINGTALK_CLIENT_ID",
      "clientSecret": "$DINGTALK_CLIENT_SECRET",
      "interactiveCards": {
        "enabled": true,
        "statusCard": { "enabled": true },
        "questionCard": {
          "enabled": true,
          "timeoutMs": 270000
        }
      }
    }
  }
}
```

将 `interactiveCards.enabled` 设为 `false` 可禁用所有互动卡片。使用 `statusCard.enabled` 或 `questionCard.enabled` 可禁用某一种卡片类型，设置 `questionCard.timeoutMs` 为一个有限的正整数可更改 Qwen Code 等待问题卡片响应的时间。超过 2,147,483,647 毫秒（约 24.8 天）的值会被限制在该最大值。互动卡片通过 `settings.json` 或管理 API 配置；Web Shell 频道编辑器不会渲染它们，编辑其他字段时会保留已存储的对象。

### 连接恢复

`useConnectionManager` 默认为 `true`。连接管理器监控 Stream WebSocket，并在连接停止响应时替换 DingTalk SDK 客户端。通常应保持启用状态。

设置 `"useConnectionManager": false` 可禁用 Qwen Code 的连接管理器，并回退到 SDK 的保活和自动重连行为。

## 运行

```bash
# 仅启动钉钉频道
qwen channel start my-dingtalk

# 或者一起启动所有已配置的频道
qwen channel start
```

打开钉钉并向机器人发送消息。你应该会看到 👀 表情反应出现，表示代理正在处理，随后返回响应。

## Daemon Webhook 投递

当频道在 `qwen serve` 下运行时，经过身份验证的外部 Webhook 事件可以触发无人值守的代理任务，并将最终的 Markdown 响应投递给钉钉用户或群组。使用现有的 Webhook 目标字段，无需单独的频道类型：

```json
{
  "webhooks": {
    "sources": {
      "manual-test": {
        "secretEnv": "QWEN_CHANNEL_DINGTALK_TEST_SECRET",
        "targets": {
          "operator": {
            "chatId": "DINGTALK_USER_ID",
            "senderId": "webhook:manual-test",
            "isGroup": false
          },
          "team": {
            "chatId": "OPEN_CONVERSATION_ID",
            "senderId": "webhook:manual-test",
            "isGroup": true
          }
        }
      }
    }
  }
}
```

每个目标都必须显式设置 `isGroup`。对于私聊消息，`chatId` 是收件人的钉钉用户 ID。对于群聊消息，`chatId` 是群组的 `openConversationId`。不支持线程目标和传入机器人 Webhook URL 进行主动投递。完整的频道配置和请求格式请参见 [Webhook 触发的任务](./overview#webhook-triggered-tasks)。

## 群聊

钉钉机器人支持私聊和群聊。要启用群聊支持：

1. 在频道配置中将 `groupPolicy` 设置为 `"allowlist"`、`"pairing"` 或 `"open"`
2. 将机器人添加到钉钉群组
3. 在群组中 @提及 机器人以触发响应
4. 如果使用 `groupPolicy: "pairing"`，在响应开始前批准该群组的配对请求

默认情况下，机器人在群聊中需要 @提及（`requireMention: true`）。将特定群组的 `"requireMention": false` 可使其响应所有消息。参见[群聊](./overview#group-chats)了解完整详情。

设置 `"atSender": true` 可使机器人在回复时 @提及触发其响应的群成员。默认关闭，且仅适用于具有钉钉员工 ID 的代理回复。无论是否带有提及，回复均以钉钉 markdown 发送；提及前缀包含在第一条消息块中。

### 查找群聊的 Conversation ID

钉钉使用 `conversationId` 来标识群组。你可以在频道服务日志中找到它——当有人在群组中发送消息时，在日志输出中查找 `conversationId` 字段。

## 图片与文件

你可以向机器人发送照片和文档，而不仅仅是文本。

**图片：** 发送图片（截图、图表等），代理将利用其视觉能力进行分析。这需要多模态模型——在频道配置中添加 `"model": "qwen3.5-plus"`（或其他支持视觉的模型）。钉钉支持直接发送图片或作为富文本消息（图文混合）的一部分。

**文件：** 发送 PDF、代码文件或任何文档。机器人从钉钉服务器下载并本地保存，以便代理使用其文件工具读取。也支持音频和视频文件。此功能适用于任何模型。

## 转发聊天记录

你可以将另一个聊天中的一系列消息合并转发给机器人（钉钉的"合并转发"），可以作为独立消息或你正在回复的消息。机器人将记录展开为文本供代理使用：记录的标题和摘要成为一行标题，每条转发消息在 `[Chat record messages]` 下列出，格式为 `发送者：消息`。正文不是文本的转发消息会显示为占位符——`[image]`、`[file: <name>]`、`[audio]`、`[video]`。

长记录**有上限，且会公告上限**：最多 50 条消息，总共最多 4000 个字符，每条消息最多 500 个字符。被截断的内容会在同一文本中报告给代理——被丢弃的消息会显示一行尾部的 `[N more message(s) not shown]`，被缩短的消息会带有 ` [truncated]` 标记。因此代理知道它在回答一个不完整的记录；如果你需要完整内容，请分批转发。

你**回复的**记录会被引用而非发送，且引用文本在所有频道上都被限制为 500 个字符——因此记录按 500 字符的预算渲染，而非 4000 字符的预算，同样的上限公告也适用。被回复的记录预计只携带标题和前一两条评论；将其作为独立消息转发以提供完整内容。

由于转发的记录是由其他人编写的，从中提取的所有内容——标题、发送者名称、消息正文——在到达代理之前都会被中和，因此转发消息无法冒充对机器人的指令。

上述多行布局是代理在私聊中看到的内容。在群聊中，整个消息在到达代理之前会被再次中和，将其折叠为一行并去掉标记周围的方括号；内容和上限公告在两种情况下相同。

## 与 Telegram 的主要区别

- **认证：** 使用 AppKey + AppSecret 而非静态的机器人令牌。SDK 会自动管理访问令牌刷新。
- **连接：** WebSocket 流而非轮询——无需公共 IP 或 webhook URL。
- **格式化：** 响应使用钉钉的 markdown 方言。Markdown 表格会直接传递给钉钉客户端；长消息会在约 3800 字符处分块。
- **工作指示：** 处理过程中，会在用户消息上添加 👀 表情反应，发送响应后移除。
- **媒体下载：** 两步流程——从消息中获取 `downloadCode`，再通过钉钉 API 换取临时下载 URL。
- **群组：** 钉钉使用 `isInAtList` 检测 @提及，而非解析消息实体。

## 提示

- **使用钉钉 markdown 感知指令**——钉钉支持标题、粗体、链接、代码块和表格。由于窄屏可能会水平滚动，请保持表格紧凑。
- **限制访问**——在组织环境下，`senderPolicy: "open"` 可能可以接受。如需更严格的控制，使用 `"allowlist"` 或 `"pairing"`。参见[私聊配对](./overview#dm-pairing)了解详情。
- **引用消息**——引用（回复）用户消息会将引用的文本作为上下文提供给代理。如果引用的消息是图片、文件、音频或视频消息，机器人会以与直接发送时相同的方式下载并附加它。暂不支持引用机器人回复。

## 故障排查

### 机器人无法连接

- 确保 AppKey 和 AppSecret 正确
- 检查在运行 `qwen channel start` 前是否已设置环境变量
- 确认在钉钉开发者平台的机器人设置中已启用 **Stream 模式**
- 检查终端输出中的连接错误

### 机器人在群聊中无响应

- 检查 `groupPolicy` 是否设置为 `"allowlist"`、`"pairing"` 或 `"open"`（默认为 `"disabled"`）
- 如果使用 `"pairing"`，确认群组的配对请求已被批准
- 确保在群消息中 @提及 了机器人
- 确认机器人已添加到群组

### "No sessionWebhook in message"

这意味着钉钉在消息回调中未包含回复端点。可能是机器人权限配置错误。请检查开发者平台中的机器人设置。

### "Unable to process this message"

该回复会标识失败类别并建议下一步操作。如果问题持续存在，请将回复中显示的引用提供给机器人管理员；同一引用也会出现在频道进程日志中详细错误的旁边。