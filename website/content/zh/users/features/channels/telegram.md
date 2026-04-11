# Telegram

本指南介绍如何在 Telegram 上配置 Qwen Code 频道。

## 前置条件

- 一个 Telegram 账号
- 一个 Telegram Bot Token（见下文）

## 创建 Bot

1. 打开 Telegram 并搜索 [@BotFather](https://t.me/BotFather)
2. 发送 `/newbot` 并按照提示设置名称和用户名
3. BotFather 会提供一个 Bot Token，请妥善保存

## 获取你的 User ID

要使用 `senderPolicy: "allowlist"` 或 `"pairing"`，你需要获取 Telegram 的 User ID（数字 ID，而非用户名）。

获取方法如下：

1. 在 Telegram 中搜索 [@userinfobot](https://t.me/userinfobot)
2. 发送任意消息，它会回复你的 User ID

## 配置

将频道配置添加到 `~/.qwen/settings.json`：

```json
{
  "channels": {
    "my-telegram": {
      "type": "telegram",
      "token": "$TELEGRAM_BOT_TOKEN",
      "senderPolicy": "allowlist",
      "allowedUsers": ["YOUR_USER_ID"],
      "sessionScope": "user",
      "cwd": "/path/to/your/project",
      "instructions": "You are a concise coding assistant responding via Telegram. Keep responses short.",
      "groupPolicy": "disabled",
      "groups": {
        "*": { "requireMention": true }
      }
    }
  }
}
```

将 Bot Token 设置为环境变量：

```bash
export TELEGRAM_BOT_TOKEN=<your-token-from-botfather>
```

或者将其添加到运行前加载的 `.env` 文件中。

## 运行

```bash
# 仅启动 Telegram 频道
qwen channel start my-telegram

# 或同时启动所有已配置的频道
qwen channel start
```

然后在 Telegram 中打开你的 Bot 并发送消息。你应该会立即看到 "Working..." 提示，随后是 Agent 的回复。

## 群组聊天

要在 Telegram 群组中使用该 Bot：

1. 在频道配置中将 `groupPolicy` 设置为 `"allowlist"` 或 `"open"`
2. 在 BotFather 中**关闭隐私模式**：`/mybots` → 选择你的 Bot → Bot Settings → Group Privacy → Turn Off
3. 将 Bot 添加到群组。如果它已经在群组中，请**先移除再重新添加**（Telegram 会缓存 Bot 加入时的隐私设置）
4. 如果使用 `groupPolicy: "allowlist"`，请将群组的 Chat ID 添加到配置的 `groups` 中

默认情况下，Bot 在群组中需要 @提及 或回复才会响应。为特定群组设置 `"requireMention": false` 可使其响应所有消息（适用于专用任务群组）。完整详情请参阅 [群组聊天](./overview#group-chats)。

## 图片与文件

除了文本，你还可以向 Bot 发送图片和文档。

**图片：** 发送图片后，Agent 将使用视觉能力进行分析。这需要多模态模型支持——在频道配置中添加 `"model": "qwen3.5-plus"`（或其他支持视觉的模型）。图片说明文字会作为消息文本传递。

**文档：** 发送 PDF、代码文件或任意文档。Bot 会将其下载并保存到本地，以便 Agent 使用文件工具读取。此功能适用于所有模型。Telegram 的文件大小限制为 20MB。

## 使用建议

- **保持指令简洁** — Telegram 的消息长度限制为 4096 个字符。添加类似“保持回复简短”的指令有助于 Agent 控制在限制范围内。
- **使用 `sessionScope: "user"`** — 这将为每个用户提供独立的会话。使用 `/clear` 可重新开始。
- **限制访问权限** — 使用 `senderPolicy: "allowlist"` 固定允许的用户列表，或使用 `"pairing"` 让新用户通过你经 CLI 审批的配对码申请访问。详情请参阅 [私聊配对](./overview#dm-pairing)。

## 消息格式

Agent 的 Markdown 回复会自动转换为 Telegram 兼容的 HTML 格式。代码块、粗体、斜体、链接和列表均受支持。

## 故障排查

### Bot 无响应

- 检查 Bot Token 是否正确且环境变量已设置
- 如果使用 `senderPolicy: "allowlist"`，请确认你的 User ID 已加入 `allowedUsers`；如果使用 `"pairing"`，请确认你已通过审批
- 检查终端输出是否有错误信息

### Bot 在群组中无响应

- 检查 `groupPolicy` 是否设置为 `"allowlist"` 或 `"open"`（默认为 `"disabled"`）
- 如果使用 `"allowlist"`，请确认群组的 Chat ID 已添加到 `groups` 配置中
- 确保在 BotFather 中**已关闭 Group Privacy** — 否则 Bot 无法看到群组中的非命令消息
- 如果在将 Bot 加入群组后修改了隐私模式，请**将 Bot 从群组中移除并重新添加**
- 默认情况下，Bot 需要 @提及 或回复才会响应。可发送 `@yourbotname hello` 进行测试

### "Sorry, something went wrong processing your message"

这通常表示 Agent 在处理时遇到了错误。请查看终端输出获取详细信息。

### Bot 响应时间较长

Agent 可能正在执行多次工具调用（读取文件、搜索等）。Agent 处理期间会显示 "Working..." 提示。复杂任务可能需要一分钟或更长时间。