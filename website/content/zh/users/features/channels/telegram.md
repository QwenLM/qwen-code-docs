# Telegram

本指南介绍如何在 Telegram 上设置 Qwen Code 频道。

## 前提条件

- 一个 Telegram 账号
- 一个 Telegram Bot Token（参见下文）

## 创建机器人

1. 打开 Telegram，搜索 [@BotFather](https://t.me/BotFather)
2. 发送 `/newbot` 并按提示选择名称和用户名
3. BotFather 会给你一个 Bot Token——请妥善保存

## 查找你的用户 ID

使用 `senderPolicy: "allowlist"` 或 `"pairing"` 时，你需要提供 Telegram 用户 ID（一个数字 ID，不是用户名）。

最简单的查找方法：

1. 在 Telegram 中搜索 [@userinfobot](https://t.me/userinfobot)
2. 向其发送任意消息——它就会回复你的用户 ID

## 配置

将频道添加到 `~/.qwen/settings.json`：

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

或者将其添加到运行前会加载的 `.env` 文件中。

## 运行

```bash
# 仅启动 Telegram 频道
qwen channel start my-telegram

# 或者启动所有已配置的频道
qwen channel start
```

然后在 Telegram 中打开你的机器人并发送一条消息。你应该会立即看到 "Working..." 字样，随后是 agent 的回复。

## 群聊

要在 Telegram 群组中使用机器人：

1. 在频道配置中将 `groupPolicy` 设置为 `"allowlist"` 或 `"open"`
2. **在 BotFather 中关闭隐私模式**：`/mybots` → 选择你的机器人 → Bot Settings → Group Privacy → 关闭
3. 将机器人添加到群组。如果它已经在群组中，请**移除并重新添加**（Telegram 会缓存机器人加入时的隐私设置）
4. 如果使用 `groupPolicy: "allowlist"`，请将群组的聊天 ID 添加到配置的 `groups` 中

默认情况下，机器人在群组中需要通过 @提及或回复来响应。如果希望特定群组对所有消息都响应（适用于专用任务群组），可设置 `"requireMention": false`。详见[群聊](./overview#group-chats)。

## 图片与文件

你可以向机器人发送照片和文档，而不仅仅是文本。

**照片：** 发送照片后，agent 会利用其视觉能力进行分析。这需要多模态模型——请在频道配置中添加 `"model": "qwen3.5-plus"`（或其他支持视觉的模型）。照片的说明文字会作为消息文本传递。

**文档：** 发送 PDF、代码文件或任何文档。机器人会下载并保存到本地，以便 agent 使用文件工具读取。此功能适用于任何模型。Telegram 的文件大小限制为 20MB。

## 提示

- **保持指令简洁聚焦**——Telegram 有 4096 字符的消息限制。添加类似 "keep responses short" 的指令有助于 agent 保持在限制内。
- **使用 `sessionScope: "user"`**——这样每个用户都有独立的对话。使用 `/clear` 重新开始。
- **限制访问**——使用 `senderPolicy: "allowlist"` 限制为固定用户集，或使用 `"pairing"` 让新用户通过你通过 CLI 批准的代码请求访问。详见[私聊配对](./overview#dm-pairing)。

## 消息格式

agent 的 Markdown 响应会自动转换为 Telegram 兼容的 HTML。代码块、粗体、斜体、链接和列表都支持。

## 故障排除

### 机器人无响应

- 检查 Bot Token 是否正确，以及环境变量是否已设置
- 如果使用 `senderPolicy: "allowlist"`，确认你的用户 ID 在 `allowedUsers` 中；如果使用 `"pairing"`，确认已获得批准
- 检查终端输出中的错误信息

### 机器人在群组中无响应

- 确保 `groupPolicy` 设置为 `"allowlist"` 或 `"open"`（默认是 `"disabled"`）
- 如果使用 `"allowlist"`，确认群组的聊天 ID 已添加到 `groups` 配置中
- 确保在 BotFather 中**关闭了 Group Privacy**——如果没有关闭，机器人无法看到群组中的非命令消息
- 如果在将机器人加入群组后更改了隐私模式，请**移除并重新添加机器人**到群组
- 默认情况下，机器人需要 @提及或回复。发送 `@yourbotname hello` 进行测试

### "Sorry, something went wrong processing your message"

这通常意味着 agent 遇到了错误。请查看终端输出以获取详细信息。

### 机器人响应时间过长

agent 可能正在执行多个工具调用（读取文件、搜索等）。处理过程中会显示 "Working..." 指示器。复杂任务可能需要一分钟或更长时间。