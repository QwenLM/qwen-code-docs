# 频道 (Channels)

频道让你能从 Telegram、微信、QQ 或钉钉等消息平台与 Qwen Code 代理交互，而不必一直守着终端。你可以从手机或桌面聊天应用发送消息，代理会像在 CLI 中一样做出响应。

## 工作原理

当你运行 `qwen channel start` 时，Qwen Code 会执行以下操作：

1. 从 `settings.json` 中读取频道配置
2. 使用[代理客户端协议 (ACP)](../../../developers/architecture.md) 启动一个独立的代理进程
3. 连接到每个消息平台并开始监听消息
4. 将收到的消息路由到代理，并将响应发送回对应的聊天会话

所有频道共享同一个代理进程，但每个用户拥有独立的会话。每个频道可以设置自己的工作目录、模型和指令。

## 快速开始

1. 在你的消息平台上创建一个机器人（请参考各平台的特定指南：[Telegram](./telegram)、[微信](./weixin)、[QQ 机器人](./qqbot)、[钉钉](./dingtalk)）
2. 将频道配置添加到 `~/.qwen/settings.json`
3. 运行 `qwen channel start` 启动所有频道，或 `qwen channel start <name>` 启动单个频道

想接入一个未内置的平台？请参阅[插件](./plugins)，以扩展方式添加自定义适配器。

## 配置

频道在 `settings.json` 的 `channels` 键下配置。每个频道都有一个名称和一组选项：

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

| 选项                    | 必需    | 描述                                                                                                                          |
| ----------------------- | ------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `type`                  | 是      | 频道类型：`telegram`、`weixin`、`qq`、`dingtalk`、`feishu`，或来自扩展的自定义类型（请参阅[插件](./plugins)）                  |
| `token`                 | Telegram | 机器人令牌。支持 `$ENV_VAR` 语法从环境变量读取。微信和钉钉不需要                               |
| `clientId`              | 钉钉    | 钉钉 AppKey。支持 `$ENV_VAR` 语法                                                                                           |
| `clientSecret`          | 钉钉    | 钉钉 AppSecret。支持 `$ENV_VAR` 语法                                                                                        |
| `model`                 | 否      | 此频道使用的模型（例如 `qwen3.5-plus`）。覆盖默认模型。适用于支持图像输入的多模态模型                                          |
| `senderPolicy`          | 否      | 谁可以和机器人对话：`allowlist`（默认）、`open` 或 `pairing`                                                               |
| `allowedUsers`          | 否      | 允许使用机器人的用户 ID 列表（由 `allowlist` 和 `pairing` 策略使用）                                                         |
| `sessionScope`          | 否      | 会话的作用域：`user`（默认）、`thread` 或 `single`                                                                         |
| `cwd`                   | 否      | 代理的工作目录。默认为当前目录                                                                                                |
| `instructions`          | 否      | 自定义指令，在每个会话的第一条消息之前添加                                                                                   |
| `groupPolicy`           | 否      | 群聊访问权限：`disabled`（默认）、`allowlist` 或 `open`。请参阅[群聊](#群聊)                                               |
| `groups`                | 否      | 按群组设置的参数。键为群聊 ID 或 `"*"` 表示默认设置。请参阅[群聊](#群聊)                                                   |
| `dispatchMode`          | 否      | 当机器人在忙于处理前一条消息时，你发送新消息会发生什么：`steer`（默认）、`collect` 或 `followup`。请参阅[调度模式](#调度模式) |
| `blockStreaming`        | 否      | 渐进式响应交付：`on` 或 `off`（默认）。请参阅[块式流式输出](#块式流式输出)                                                  |
| `blockStreamingChunk`   | 否      | 块大小范围：`{ "minChars": 400, "maxChars": 1000 }`。请参阅[块式流式输出](#块式流式输出)                                    |
| `blockStreamingCoalesce` | 否     | 空闲刷新：`{ "idleMs": 1500 }`。请参阅[块式流式输出](#块式流式输出)                                                         |

### 发送者策略

控制谁能与机器人交互：

- **`allowlist`**（默认）— 只有 `allowedUsers` 列表中包含的用户可以发送消息。其他用户被静默忽略。
- **`pairing`**— 未知用户会收到一个配对码。机器人操作员通过 CLI 批准他们，然后他们会被添加到一个持久的允许列表中。`allowedUsers` 中的用户完全跳过配对。请参阅下面的[私聊配对](#私聊配对)。
- **`open`**— 任何人都可以发送消息。请谨慎使用。

### 会话作用域

控制会话的管理方式：

- **`user`**（默认）— 每个用户一个会话。同一用户的所有消息共享一个对话。
- **`thread`**— 每个线程/话题一个会话。适用于带有线程的群聊。
- **`single`**— 所有用户共享一个会话。所有人的消息都在同一个对话中。

### 令牌安全性

机器人令牌不应直接存储在 `settings.json` 中。请使用环境变量引用：

```json
{
  "token": "$TELEGRAM_BOT_TOKEN"
}
```

在 shell 环境或运行频道前加载的 `.env` 文件中设置实际的令牌。

## 私聊配对

当 `senderPolicy` 设置为 `"pairing"` 时，未知用户会经过一个审批流程：

1. 未知用户向机器人发送一条消息
2. 机器人回复一个 8 字符的配对码（例如 `VEQDDWXJ`）
3. 用户将该配对码分享给你（机器人操作员）
4. 你通过 CLI 批准他们：

```bash
qwen channel pairing approve my-channel VEQDDWXJ
```

一旦批准，用户的 ID 将被保存到 `~/.qwen/channels/<name>-allowlist.json`，之后所有消息将正常处理。

### 配对 CLI 命令

```bash
# 列出待处理的配对请求
qwen channel pairing list my-channel

# 通过配对码批准请求
qwen channel pairing approve my-channel <CODE>
```

### 配对规则

- 配对码为 8 个字符，大写，使用无歧义的字母表（没有 `0`/`O`/`1`/`I`）
- 配对码 1 小时后过期
- 每个频道最多同时有 3 个待处理请求——更多请求将被忽略，直到其中一个过期或被批准
- `settings.json` 中 `allowedUsers` 列表中的用户始终跳过配对
- 已批准的用户存储在 `~/.qwen/channels/<name>-allowlist.json` 中——请将此文件视为敏感信息

## 群聊

默认情况下，机器人只在私聊中工作。要启用群聊支持，请将 `groupPolicy` 设置为 `"allowlist"` 或 `"open"`。

### 群组策略

控制机器人是否参与群聊：

- **`disabled`**（默认）— 机器人忽略所有群消息。最安全的选项。
- **`allowlist`**— 机器人只响应 `groups` 中按聊天 ID 列出的群组。`"*"` 键提供默认设置，但**不**作为通配符允许。
- **`open`**— 机器人在它被添加到的所有群组中响应。请谨慎使用。

### @提及限制

在群组中，机器人默认需要 `@提及` 或回复它的某条消息才能响应。这可以防止机器人响应群聊中的每一条消息。

使用 `groups` 设置进行群组级配置：

```json
{
  "groups": {
    "*": { "requireMention": true },
    "-100123456": { "requireMention": false }
  }
}
```

- **`"*"`** — 所有群组的默认设置。仅设置配置默认值，不是允许列表条目。
- **群聊 ID** — 覆盖特定群组的设置。覆盖 `"*"` 的默认值。
- **`requireMention`**（默认：`true`）— 当为 `true` 时，机器人只响应 @ 提及它或回复其消息的消息。当为 `false` 时，机器人响应所有消息（适用于专属任务群）。

### 群消息的评估流程

```
1. groupPolicy — 这个群组是否被允许？              （否 → 忽略）
2. requireMention — 机器人是否被提及/回复？          （否 → 忽略）
3. senderPolicy — 这个发送者是否被批准？             （否 → 配对流程）
4. 路由到会话
```

### Telegram 群组设置

1. 将机器人添加到群组
2. 在 BotFather 中**关闭隐私模式**（`/mybots` → Bot Settings → Group Privacy → Turn Off）— 否则机器人将看不到非命令消息
3. 更改隐私模式后，**移除并重新添加机器人**到群组中（Telegram 会缓存此设置）

### 查找群聊 ID

要查找群聊的 ID 以用于 `groups` 列表：

1. 如果机器人正在运行，先停止它
2. 在群组中发送一条提及机器人的消息
3. 使用 Telegram Bot API 检查排队的更新：

```bash
curl -s "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getUpdates" | python3 -m json.tool
```

在响应中查找 `message.chat.id`——群组 ID 是负数（例如 `-5170296765`）。

## 媒体支持

频道支持向代理发送图片和文件，而不仅仅是文本。

### 图片

向机器人发送一张照片，代理将能够看到它——适用于分享截图、错误消息或图表。图片作为视觉输入直接发送给模型。

要使用图片支持，请为该频道配置多模态模型：

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

向机器人发送文档（PDF、代码文件、文本文件等）。文件将被下载并保存到临时目录，代理会被告知文件路径，从而可以使用其文件读取工具读取内容。

文件支持任何模型——不需要多模态支持。

### 平台差异

| 功能   | Telegram                               | 微信                       | 钉钉                                    |
| ------ | -------------------------------------- | -------------------------- | --------------------------------------- |
| 图片   | 通过 Bot API 直接下载                    | CDN 下载 + AES 解密         | downloadCode API（两步）                |
| 文件   | 通过 Bot API 直接下载（20MB 限制）        | CDN 下载 + AES 解密         | downloadCode API（两步）                |
| 说明   | 图片/文件说明作为消息文本包含             | 不适用                     | 富文本：文本和图片混合在同一条消息中    |

## 调度模式

控制当你在机器人仍在处理上一条消息时发送新消息会发生什么。

- **`steer`**（默认）— 机器人取消当前请求，开始处理你的新消息。适用于正常聊天，此时后续消息通常表示你想纠正或重定向机器人。
- **`collect`**— 你的新消息被缓冲。当前请求完成后，所有缓冲的消息合并成一个后续提示。适用于异步工作流，你想排队输入想法。
- **`followup`**— 每条消息按顺序排队，并作为独立轮次处理。适用于批处理工作流，每条消息彼此独立。

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

你也可以按群组设置调度模式，覆盖频道默认值：

```json
{
  "groups": {
    "*": { "requireMention": true, "dispatchMode": "steer" },
    "-100123456": { "dispatchMode": "collect" }
  }
}
```

## 块式流式输出

默认情况下，代理会工作一段时间，然后发送一条大的响应。启用块式流式输出后，响应会在代理仍在工作时分成多条较短的消息逐步发送——类似于 ChatGPT 或 Claude 显示渐进输出的方式。

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

- 代理的响应在段落边界处被分割成块，作为独立消息发送
- `minChars`（默认 400）— 在块达到此长度之前不发送，以避免频繁发送微小消息
- `maxChars`（默认 1000）— 如果块未遇到自然断点但达到此长度，则强制发送
- `idleMs`（默认 1500）— 如果代理暂停（例如运行工具），则发送当前缓冲的内容
- 代理完成时，剩余文本立即发送

只有 `blockStreaming` 是必需的。块和合并设置是可选的，具有合理的默认值。

## 斜杠命令

频道支持斜杠命令。这些命令由本地处理（不涉及代理往返）：

- `/help` — 列出可用命令
- `/clear` — 清除你的会话并重新开始（别名：`/reset`、`/new`）
- `/status` — 显示会话信息和访问策略

所有其他斜杠命令（例如 `/compress`、`/summary`）将转发给代理。

这些命令在所有频道类型（Telegram、微信、QQ、钉钉）上均有效。

## 运行

```bash
# 启动所有已配置的频道（共享代理进程）
qwen channel start

# 启动单个频道
qwen channel start my-channel

# 检查服务是否在运行
qwen channel status

# 停止正在运行的服务
qwen channel stop
```

机器人在前台运行。按 `Ctrl+C` 停止，或从另一个终端使用 `qwen channel stop`。

### 多频道模式

当你运行 `qwen channel start` 而不指定名称时，`settings.json` 中定义的所有频道将一起启动，共享一个代理进程。每个频道维护自己的会话——一个 Telegram 用户和一个微信用户将获得独立的对话，即使它们共享同一个代理。

每个频道使用其配置中的 `cwd`，因此不同的频道可以同时处理不同的项目。

### 服务管理

频道服务使用 PID 文件（`~/.qwen/channels/service.pid`）来跟踪正在运行的实例：

- **防止重复启动**：如果服务已在运行，再次运行 `qwen channel start` 将显示错误，而不是启动第二个实例
- **`qwen channel stop`**：从另一个终端优雅地停止正在运行的服务
- **`qwen channel status`**：显示服务是否正在运行、运行时长以及每个频道的会话计数

### 崩溃恢复

如果代理进程意外崩溃，频道服务会自动重启它，并尝试恢复所有活动会话。用户可以继续对话，无需从头开始。

- 服务运行时，会话会被持久化到 `~/.qwen/channels/sessions.json`
- 崩溃时：代理在 3 秒内重启并重新加载已保存的会话
- 连续 3 次崩溃后，服务将退出并报错
- 正常关闭（Ctrl+C 或 `qwen channel stop`）时：会话数据将被清除——下次启动总是全新的