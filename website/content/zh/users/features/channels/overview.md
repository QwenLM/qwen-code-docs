# 频道

频道允许你通过 Telegram、微信或钉钉等消息平台与 Qwen Code Agent 进行交互，而无需使用终端。你只需在手机或桌面聊天应用中发送消息，Agent 就会像在 CLI 中一样进行回复。

## 工作原理

运行 `qwen channel start` 时，Qwen Code 会：

1. 从你的 `settings.json` 读取频道配置
2. 使用 [Agent Client Protocol (ACP)](../../developers/architecture) 生成单个 Agent 进程
3. 连接到各个消息平台并开始监听消息
4. 将收到的消息路由给 Agent，并将响应发送回对应的聊天窗口

所有频道共享同一个 Agent 进程，但每个用户的会话是相互隔离的。每个频道可以拥有独立的工作目录、模型和指令。

## 快速开始

1. 在消息平台上创建机器人（参见各频道专属指南：[Telegram](./telegram)、[WeChat](./weixin)、[DingTalk](./dingtalk)）
2. 将频道配置添加到 `~/.qwen/settings.json`
3. 运行 `qwen channel start` 启动所有频道，或运行 `qwen channel start <name>` 启动单个频道

想要连接未内置的平台？请参阅 [Plugins](./plugins) 以扩展形式添加自定义适配器。

## 配置

频道在 `settings.json` 的 `channels` 键下进行配置。每个频道包含一个名称和一组选项：

```json
{
  "channels": {
    "my-channel": {
      "type": "telegram",
      "token": "$MY_BOT_TOKEN",
      "senderPolicy": "allowlist",
      "allowedUsers": ["123456789"],
      "sessionScope": "user",
      "cwd": "/path/to/working/directory",
      "instructions": "Optional system instructions for the agent.",
      "groupPolicy": "disabled",
      "groups": {
        "*": { "requireMention": true }
      }
    }
  }
}
```

### 选项

| Option                   | Required | Description                                                                                                                                    |
| ------------------------ | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `type`                   | Yes      | 频道类型：`telegram`、`weixin`、`dingtalk`，或来自扩展的自定义类型（参见 [Plugins](./plugins)）                                  |
| `token`                  | Telegram | 机器人 Token。支持 `$ENV_VAR` 语法从环境变量读取。微信或钉钉无需此项                                    |
| `clientId`               | DingTalk | 钉钉 AppKey。支持 `$ENV_VAR` 语法                                                                                                    |
| `clientSecret`           | DingTalk | 钉钉 AppSecret。支持 `$ENV_VAR` 语法                                                                                                 |
| `model`                  | No       | 该频道使用的模型（例如 `qwen3.5-plus`）。会覆盖默认模型。适用于支持图像输入的多模态模型       |
| `senderPolicy`           | No       | 允许谁与机器人对话：`allowlist`（默认）、`open` 或 `pairing`                                                                           |
| `allowedUsers`           | No       | 允许使用机器人的用户 ID 列表（由 `allowlist` 和 `pairing` 策略使用）                                                           |
| `sessionScope`           | No       | 会话作用域：`user`（默认）、`thread` 或 `single`                                                                               |
| `cwd`                    | No       | Agent 的工作目录。默认为当前目录                                                                             |
| `instructions`           | No       | 自定义指令，会追加到每个会话的首条消息前                                                                             |
| `groupPolicy`            | No       | 群聊访问权限：`disabled`（默认）、`allowlist` 或 `open`。参见 [Group Chats](#group-chats)                                               |
| `groups`                 | No       | 按群聊配置的设置。键为群聊 ID 或 `"*"`（表示默认值）。参见 [Group Chats](#group-chats)                                             |
| `dispatchMode`           | No       | 当机器人仍在处理上一条消息时发送新消息的处理方式：`steer`（默认）、`collect` 或 `followup`。参见 [Dispatch Modes](#dispatch-modes) |
| `blockStreaming`         | No       | 渐进式响应输出：`on` 或 `off`（默认）。参见 [Block Streaming](#block-streaming)                                                |
| `blockStreamingChunk`    | No       | 分块大小限制：`{ "minChars": 400, "maxChars": 1000 }`。参见 [Block Streaming](#block-streaming)                                            |
| `blockStreamingCoalesce` | No       | 空闲刷新：`{ "idleMs": 1500 }`。参见 [Block Streaming](#block-streaming)                                                                      |

### 发送者策略 (Sender Policy)

控制谁可以与机器人交互：

- **`allowlist`**（默认）— 仅 `allowedUsers` 列表中的用户可以发送消息。其他用户的消息将被静默忽略。
- **`pairing`** — 未知发送者将收到一个配对码。机器人操作员通过 CLI 批准后，他们会被加入持久化的白名单。`allowedUsers` 中的用户完全跳过配对流程。参见下方的 [DM Pairing](#dm-pairing)。
- **`open`** — 任何人都可以发送消息。请谨慎使用。

### 会话作用域 (Session Scope)

控制对话会话的管理方式：

- **`user`**（默认）— 每个用户一个会话。同一用户的所有消息共享同一个对话。
- **`thread`** — 每个线程/话题一个会话。适用于支持线程的群聊。
- **`single`** — 所有用户共享一个会话。所有人共用同一个对话。

### Token 安全

机器人 Token 不应直接存储在 `settings.json` 中。请改用环境变量引用：

```json
{
  "token": "$TELEGRAM_BOT_TOKEN"
}
```

将实际的 Token 设置在 Shell 环境变量中，或放在运行频道前加载的 `.env` 文件里。

## DM 配对 (DM Pairing)

当 `senderPolicy` 设置为 `"pairing"` 时，未知发送者将进入审批流程：

1. 未知用户向机器人发送消息
2. 机器人回复一个 8 位配对码（例如 `VEQDDWXJ`）
3. 用户将该配对码分享给你（机器人操作员）
4. 你通过 CLI 批准他们：

```bash
qwen channel pairing approve my-channel VEQDDWXJ
```

批准后，该用户的 ID 将保存至 `~/.qwen/channels/<name>-allowlist.json`，后续所有消息将正常处理。

### 配对 CLI 命令

```bash
# 列出待处理的配对请求
qwen channel pairing list my-channel

# 通过配对码批准请求
qwen channel pairing approve my-channel <CODE>
```

### 配对规则

- 配对码为 8 位大写字母，使用无歧义字符集（不含 `0`/`O`/`1`/`I`）
- 配对码 1 小时后过期
- 每个频道同时最多处理 3 个待处理请求——在某个请求过期或被批准前，额外的请求将被忽略
- `settings.json` 中 `allowedUsers` 列表内的用户始终跳过配对流程
- 已批准的用户存储在 `~/.qwen/channels/<name>-allowlist.json` 中——请将该文件视为敏感信息妥善保管

## 群聊 (Group Chats)

默认情况下，机器人仅在私聊中工作。要启用群聊支持，请将 `groupPolicy` 设置为 `"allowlist"` 或 `"open"`。

### 群聊策略 (Group Policy)

控制机器人是否参与群聊：

- **`disabled`**（默认）— 机器人忽略所有群消息。最安全的选项。
- **`allowlist`** — 机器人仅响应 `groups` 中通过聊天 ID 明确列出的群聊。`"*"` 键仅提供默认设置，**不**作为通配符放行。
- **`open`** — 机器人响应其加入的所有群聊。请谨慎使用。

### @提及限制 (Mention Gating)

在群聊中，默认情况下机器人需要被 `@提及` 或回复其某条消息才会响应。这可以防止机器人回复群聊中的每条消息。

通过 `groups` 设置按群配置：

```json
{
  "groups": {
    "*": { "requireMention": true },
    "-100123456": { "requireMention": false }
  }
}
```

- **`"*"`** — 所有群的默认设置。仅设置配置默认值，不作为白名单条目。
- **群聊 ID** — 覆盖特定群的设置。会覆盖 `"*"` 的默认值。
- **`requireMention`**（默认：`true`）— 为 `true` 时，机器人仅响应 @提及它或回复其消息的内容。为 `false` 时，机器人响应所有消息（适用于专属任务群）。

### 群消息评估流程

```
1. groupPolicy — 是否允许该群？           (否 → 忽略)
2. requireMention — 是否 @提及/回复了机器人？ (否 → 忽略)
3. senderPolicy — 发送者是否已获批准？         (否 → 进入配对流程)
4. 路由到会话
```

### Telegram 群聊设置

1. 将机器人添加到群聊
2. 在 BotFather 中**关闭隐私模式**（`/mybots` → Bot Settings → Group Privacy → Turn Off）— 否则机器人将无法看到非命令消息
3. 更改隐私模式后，**将机器人移出群聊并重新添加**（Telegram 会缓存此设置）

### 获取群聊 ID

要获取用于 `groups` 白名单的群聊 ID：

1. 如果机器人正在运行，请先停止它
2. 在群聊中发送一条 @提及机器人的消息
3. 使用 Telegram Bot API 检查排队的更新：

```bash
curl -s "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getUpdates" | python3 -m json.tool
```

在响应中查找 `message.chat.id` — 群聊 ID 为负数（例如 `-5170296765`）。

## 媒体支持

频道支持向 Agent 发送图片和文件，而不仅仅是文本。

### 图片

向机器人发送照片，Agent 即可看到——非常适合分享截图、报错信息或图表。图片会作为视觉输入直接发送给模型。

要使用图片支持，请为频道配置多模态模型：

```json
{
  "channels": {
    "my-channel": {
      "type": "telegram",
      "model": "qwen3.5-plus",
      ...
    }
  }
}
```

### 文件

向机器人发送文档（PDF、代码文件、文本文件等）。文件会被下载并保存到临时目录，Agent 会收到文件路径，以便使用其文件读取工具读取内容。

文件功能适用于任何模型——无需多模态支持。

### 平台差异

| Feature  | Telegram                                     | WeChat                           | DingTalk                                      |
| -------- | -------------------------------------------- | -------------------------------- | --------------------------------------------- |
| Images   | 通过 Bot API 直接下载                  | CDN 下载并 AES 解密 | downloadCode API（两步）                   |
| Files    | 通过 Bot API 直接下载（20MB 限制）     | CDN 下载并 AES 解密 | downloadCode API（两步）                   |
| Captions | 图片/文件说明文字作为消息文本包含在内 | 不适用                   | 富文本：单条消息混合文本与图片 |

## 调度模式 (Dispatch Modes)

控制当机器人仍在处理上一条消息时，你发送新消息会发生什么。

- **`steer`**（默认）— 机器人取消当前请求，开始处理你的新消息。最适合日常聊天，因为后续消息通常意味着你想纠正或重定向机器人。
- **`collect`** — 你的新消息会被缓存。当前请求完成后，所有缓存的消息会合并为一条后续提示词。适用于希望排队输入想法的异步工作流。
- **`followup`** — 每条消息都会按顺序入队，并作为独立的轮次依次处理。适用于每条消息相互独立的批处理工作流。

```json
{
  "channels": {
    "my-channel": {
      "type": "telegram",
      "dispatchMode": "steer",
      ...
    }
  }
}
```

你也可以按群设置调度模式，覆盖频道默认值：

```json
{
  "groups": {
    "*": { "requireMention": true, "dispatchMode": "steer" },
    "-100123456": { "dispatchMode": "collect" }
  }
}
```

## 分块流式输出 (Block Streaming)

默认情况下，Agent 会工作一段时间后发送一条完整的长回复。启用分块流式输出后，响应会在 Agent 仍在处理时以多条较短的消息陆续到达——类似于 ChatGPT 或 Claude 的渐进式输出效果。

```json
{
  "channels": {
    "my-channel": {
      "type": "telegram",
      "blockStreaming": "on",
      "blockStreamingChunk": { "minChars": 400, "maxChars": 1000 },
      "blockStreamingCoalesce": { "idleMs": 1500 },
      ...
    }
  }
}
```

### 工作原理

- Agent 的回复会在段落边界处拆分为多个块，并作为独立消息发送
- `minChars`（默认 400）— 块长度未达到此值前不发送，避免频繁发送极短消息
- `maxChars`（默认 1000）— 如果块达到此长度仍未遇到自然分段，则强制发送
- `idleMs`（默认 1500）— 如果 Agent 暂停（例如正在运行工具），则发送当前已缓存的内容
- Agent 完成后，剩余文本会立即发送

仅需配置 `blockStreaming`。分块和合并设置均为可选，且已提供合理的默认值。

## 斜杠命令 (Slash Commands)

频道支持斜杠命令。这些命令在本地处理（无需与 Agent 往返通信）：

- `/help` — 列出可用命令
- `/clear` — 清除当前会话并重新开始（别名：`/reset`、`/new`）
- `/status` — 显示会话信息和访问策略

所有其他斜杠命令（例如 `/compress`、`/summary`）将转发给 Agent。

这些命令适用于所有频道类型（Telegram、微信、钉钉）。

## 运行

```bash
# 启动所有已配置的频道（共享 Agent 进程）
qwen channel start

# 启动单个频道
qwen channel start my-channel

# 检查服务是否正在运行
qwen channel status

# 停止运行中的服务
qwen channel stop
```

机器人以前台模式运行。按 `Ctrl+C` 停止，或在另一个终端中使用 `qwen channel stop`。

### 多频道模式

运行不带名称的 `qwen channel start` 时，`settings.json` 中定义的所有频道将同时启动，并共享同一个 Agent 进程。每个频道维护独立的会话——即使共享同一个 Agent，Telegram 用户和微信用户也会拥有独立的对话。

每个频道使用其配置中指定的 `cwd`，因此不同频道可以同时处理不同的项目。

### 服务管理

频道服务使用 PID 文件（`~/.qwen/channels/service.pid`）来跟踪运行中的实例：

- **防重复启动**：服务已在运行时再次执行 `qwen channel start` 会显示错误，而不会启动第二个实例
- **`qwen channel stop`**：从另一个终端优雅地停止运行中的服务
- **`qwen channel status`**：显示服务是否正在运行、运行时长以及各频道的会话数量

### 崩溃恢复

如果 Agent 进程意外崩溃，频道服务会自动重启它并尝试恢复所有活跃会话。用户可以继续对话，无需从头开始。

- 服务运行期间，会话会持久化到 `~/.qwen/channels/sessions.json`
- 崩溃时：Agent 会在 3 秒内重启并重新加载已保存的会话
- 连续崩溃 3 次后，服务将报错退出
- 正常关闭时（`Ctrl+C` 或 `qwen channel stop`）：会话数据会被清除——下次启动始终为全新状态