# 频道

频道允许你通过 Telegram、微信、QQ 或钉钉等消息平台与 Qwen Code agent 进行交互，而无需使用终端。你可以从手机或桌面聊天应用发送消息，agent 会像在 CLI 中一样进行响应。

## 工作原理

当你运行 `qwen channel start` 时，Qwen Code 会：

1. 从 `settings.json` 读取频道配置
2. 使用 [Agent Client Protocol (ACP)](../../../developers/architecture.md) 生成一个单一的 agent 进程
3. 连接到各个消息平台并开始监听消息
4. 将传入的消息路由到 agent，并将响应发送回正确的聊天

所有频道共享一个 agent 进程，每个用户拥有隔离的会话。每个频道可以有自己的工作目录、模型和指令。

## 快速开始

1. 在你的消息平台上设置一个 bot（参见特定频道指南：[Telegram](./telegram)、[微信](./weixin)、[QQ Bot](./qqbot)、[钉钉](./dingtalk)）
2. 将频道配置添加到 `~/.qwen/settings.json`
3. 运行 `qwen channel start` 启动所有频道，或运行 `qwen channel start <name>` 启动单个频道

想要连接未内置的平台？请参阅 [插件](./plugins) 以添加自定义适配器作为扩展。

## 配置

频道在 `settings.json` 的 `channels` 键下进行配置。每个频道都有一个名称和一组选项：

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

| 选项                     | 必填 | 描述                                                                                                                                                             |
| ------------------------ | ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `type`                   | 是   | 频道类型：`telegram`、`weixin`、`qq`、`dingtalk`、`feishu` 或来自扩展的自定义类型（参见 [插件](./plugins)）                                                       |
| `token`                  | Telegram | Bot token。支持 `$ENV_VAR` 语法以从环境变量读取。微信或钉钉不需要此项                                                                                              |
| `clientId`               | 钉钉 | 钉钉 AppKey。支持 `$ENV_VAR` 语法                                                                                                                                |
| `clientSecret`           | 钉钉 | 钉钉 AppSecret。支持 `$ENV_VAR` 语法                                                                                                                             |
| `model`                  | 否   | 用于此频道的模型（例如 `qwen3.5-plus`）。覆盖默认模型。适用于支持图像输入的多模态模型                                                                              |
| `senderPolicy`           | 否   | 谁可以与 bot 交谈：`allowlist`（默认）、`open` 或 `pairing`                                                                                                      |
| `allowedUsers`           | 否   | 允许使用 bot 的用户 ID 列表（由 `allowlist` 和 `pairing` 策略使用）                                                                                              |
| `sessionScope`           | 否   | 会话的作用域：`user`（默认）、`thread` 或 `single`                                                                                                               |
| `cwd`                    | 否   | agent 的工作目录。默认为当前目录                                                                                                                                 |
| `instructions`           | 否   | 自定义指令，附加到每个会话的第一条消息之前                                                                                                                         |
| `groupPolicy`            | 否   | 群聊访问权限：`disabled`（默认）、`allowlist` 或 `open`。参见 [群聊](#group-chats)                                                                                 |
| `groupHistoryLimit`      | 否   | 可选的群聊历史回填。`0` 或省略则禁用。正整数会持久化那么多条已授权的、未被提及的群消息，用于下一次 bot 被提及/回复时。                                               |
| `groups`                 | 否   | 每个群组的设置。键为群聊 ID 或 `"*"` 表示默认值。参见 [群聊](#group-chats)                                                                                         |
| `dispatchMode`           | 否   | 当 bot 繁忙时发送消息会发生什么：`steer`（默认）、`collect` 或 `followup`。参见 [分发模式](#dispatch-modes)                                                        |
| `blockStreaming`         | 否   | 渐进式响应交付：`on` 或 `off`（默认）。参见 [分块流式传输](#block-streaming)                                                                                       |
| `blockStreamingChunk`    | 否   | 块大小边界：`{ "minChars": 400, "maxChars": 1000 }`。参见 [分块流式传输](#block-streaming)                                                                         |
| `blockStreamingCoalesce` | 否   | 空闲刷新：`{ "idleMs": 1500 }`。参见 [分块流式传输](#block-streaming)                                                                                              |

### 发送者策略

控制谁可以与 bot 交互：

- **`allowlist`**（默认）— 仅 `allowedUsers` 中列出的用户可以发送消息。其他人会被静默忽略。
- **`pairing`** — 未知的发送者会收到一个配对码。bot 操作员通过 CLI 批准他们，他们会被添加到持久化的白名单中。`allowedUsers` 中的用户会完全跳过配对。参见下方的 [私聊配对](#dm-pairing)。
- **`open`** — 任何人都可以发送消息。请谨慎使用。

### 会话作用域

控制如何管理对话会话：

- **`user`**（默认）— 每个用户一个会话。来自同一用户的所有消息共享一个对话。
- **`thread`** — 每个线程/话题一个会话。适用于带有线程的群聊。
- **`single`** — 所有用户共享一个会话。所有人共享同一个对话。

### 频道记忆

频道记忆允许已授权的频道成员为某个聊天或线程保存稳定的上下文。当新的频道会话开始时（包括执行 `/clear` 后），Qwen Code 会注入该记忆。

命令：

- `/remember-channel <text>` 为当前聊天或线程保存一条记忆。
- `/channel-memory` 显示当前聊天或线程已保存的记忆。
- `/forget-channel confirm` 清除当前聊天或线程已保存的记忆。

只有 `allowedUsers` 中列出的用户才能读取、写入或清除频道记忆。如果 `allowedUsers` 为空，则所有人的频道记忆命令都会被禁用。

### Token 安全

Bot token 不应直接存储在 `settings.json` 中。请改用环境变量引用：

```json
{
  "token": "$TELEGRAM_BOT_TOKEN"
}
```

在你的 shell 环境或运行频道前加载的 `.env` 文件中设置实际的 token。

## 私聊配对

当 `senderPolicy` 设置为 `"pairing"` 时，未知的发送者会经过一个审批流程：

1. 未知用户向 bot 发送消息
2. bot 回复一个 8 字符的配对码（例如 `VEQDDWXJ`）
3. 用户将配对码分享给你（bot 操作员）
4. 你通过 CLI 批准他们：

```bash
qwen channel pairing approve my-channel VEQDDWXJ
```

一旦批准，用户的 ID 将保存到 `~/.qwen/channels/<name>-allowlist.json`，并且未来的所有消息都会正常通过。

### 配对 CLI 命令

```bash
# 列出待处理的配对请求
qwen channel pairing list my-channel

# 通过配对码批准请求
qwen channel pairing approve my-channel <CODE>
```

### 配对规则

- 配对码为 8 个字符，大写，使用无歧义的字母表（不包含 `0`/`O`/`1`/`I`）
- 配对码在 1 小时后过期
- 每个频道最多同时有 3 个待处理请求——额外的请求将被忽略，直到有请求过期或被批准
- `settings.json` 中 `allowedUsers` 列出的用户始终跳过配对
- 已批准的用户存储在 `~/.qwen/channels/<name>-allowlist.json` 中——请将此文件视为敏感文件

## 群聊

默认情况下，bot 仅在私聊中工作。要启用群聊支持，请将 `groupPolicy` 设置为 `"allowlist"` 或 `"open"`。

### 群组策略

控制 bot 是否参与群聊：

- **`disabled`**（默认）— bot 忽略所有群消息。最安全的选项。
- **`allowlist`** — bot 仅在 `groups` 中通过聊天 ID 明确列出的群组中响应。`"*"` 键提供默认设置，但**不**作为通配符白名单。
- **`open`** — bot 在其加入的所有群组中响应。请谨慎使用。

### @提及门控

在群组中，bot 默认需要 `@提及` 或回复其某条消息。这可以防止 bot 响应群聊中的每条消息。

使用 `groups` 设置按群组进行配置：

```json
{
  "groups": {
    "*": { "requireMention": true },
    "-100123456": { "requireMention": false }
  }
}
```

- **`"*"`** — 所有群组的默认设置。仅设置配置默认值，不是白名单条目。
- **群聊 ID** — 覆盖特定群组的设置。覆盖 `"*"` 默认值。
- **`requireMention`**（默认：`true`）— 当为 `true` 时，bot 仅响应 @提及它或回复其消息的消息。当为 `false` 时，bot 响应所有消息（适用于专用任务群组）。

### 群聊历史回填

默认情况下，Qwen 会忽略未被提及的群消息，且不将其存储为会话轮次。要让下一次 `@提及` 包含最近的群聊上下文，请将 `groupHistoryLimit` 设置为正整数。

```json
{
  "channels": {
    "my-dingtalk": {
      "type": "dingtalk",
      "clientId": "$DINGTALK_CLIENT_ID",
      "clientSecret": "$DINGTALK_CLIENT_SECRET",
      "groupPolicy": "open",
      "groupHistoryLimit": 50,
      "groups": {
        "*": { "requireMention": true },
        "sensitive-group-id": {
          "requireMention": true,
          "groupHistoryLimit": 0
        }
      }
    }
  }
}
```

- 省略或 `0` 会禁用回填。
- 群组级别的 `groupHistoryLimit` 会覆盖频道级别的值。
- 仅持久化来自已授权发送者的消息。
- 被 `groupPolicy` 或群组白名单拒绝的消息不会被持久化。
- 待处理的群聊历史作为本地 JSONL 存储在 `~/.qwen/channels/<channel-name>-group-history.jsonl` 或 `$QWEN_HOME/channels/<channel-name>-group-history.jsonl` 下。
- 缓存的消息在下次真实触发时作为不受信任的上下文注入，不会作为独立的会话轮次写入。

### 群消息的评估方式

```
1. groupPolicy — 此群组是否被允许？           (否 → 忽略)
2. requireMention — bot 是否被提及/被回复？    (否 → 忽略)
3. senderPolicy — 此发送者是否已获批准？       (否 → 进入配对流程)
4. 路由到会话
```

### Telegram 群组设置

1. 将 bot 添加到群组
2. 在 BotFather 中**禁用隐私模式**（`/mybots` → Bot Settings → Group Privacy → Turn Off）——否则 bot 将无法看到非命令消息
3. 更改隐私模式后，**将 bot 从群组中移除并重新添加**（Telegram 会缓存此设置）

### 查找群聊 ID

要查找 `groups` 白名单的群聊 ID：

1. 如果 bot 正在运行，请停止它
2. 在群组中发送一条提及 bot 的消息
3. 使用 Telegram Bot API 检查排队的更新：

```bash
curl -s "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getUpdates" | python3 -m json.tool
```

在响应中查找 `message.chat.id`——群组 ID 是负数（例如 `-5170296765`）。

## 媒体支持

频道支持向 agent 发送图像和文件，而不仅仅是文本。

### 图像

向 bot 发送照片，agent 就能看到它——适用于分享截图、错误信息或图表。图像会作为视觉输入直接发送给模型。

要使用图像支持，请为频道配置多模态模型：

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

向 bot 发送文档（PDF、代码文件、文本文件等）。文件会被下载并保存到临时目录，agent 会被告知文件路径，以便它可以使用其文件读取工具读取内容。

文件适用于任何模型——无需多模态支持。

### 平台差异

| 功能     | Telegram                                     | 微信                             | 钉钉                                          |
| -------- | -------------------------------------------- | -------------------------------- | --------------------------------------------- |
| 图像     | 通过 Bot API 直接下载                        | 带有 AES 解密的 CDN 下载         | downloadCode API（两步）                      |
| 文件     | 通过 Bot API 直接下载（20MB 限制）           | 带有 AES 解密的 CDN 下载         | downloadCode API（两步）                      |
| 说明文字 | 图片/文件说明文字作为消息文本包含在内        | 不适用                           | 富文本：一条消息中混合文本和图像              |

## 分发模式

控制在 bot 仍在处理上一条消息时发送新消息会发生什么。

- **`steer`**（默认）— bot 取消当前请求并开始处理你的新消息。最适合普通聊天，因为后续消息通常意味着你想纠正或重定向 bot。
- **`collect`** — 你的新消息会被缓冲。当前请求完成后，所有缓冲的消息会合并为一个后续提示。适用于想要排队想法的异步工作流。
- **`followup`** — 每条消息都会排队并按顺序作为自己独立的轮次进行处理。适用于每条消息都独立的批处理工作流。

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

你还可以按群组设置分发模式，覆盖频道默认值：

```json
{
  "groups": {
    "*": { "requireMention": true, "dispatchMode": "steer" },
    "-100123456": { "dispatchMode": "collect" }
  }
}
```

## 分块流式传输

默认情况下，agent 会工作一段时间然后发送一个大的响应。启用分块流式传输后，响应会在 agent 仍在工作时以多条较短的消息到达——类似于 ChatGPT 或 Claude 显示渐进式输出的方式。

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

- agent 的响应在段落边界处被拆分为块，并作为单独的消息发送
- `minChars`（默认 400）— 在块达到此长度之前不发送，以避免发送大量微小消息
- `maxChars`（默认 1000）— 如果块达到此长度而没有自然中断，则无论如何都发送它
- `idleMs`（默认 1500）— 如果 agent 暂停（例如运行工具），则发送目前缓冲的内容
- 当 agent 完成时，任何剩余的文本会立即发送

只需要 `blockStreaming`。chunk 和 coalesce 设置是可选的，并具有合理的默认值。

## 斜杠命令

频道支持斜杠命令。这些命令在本地处理（无需 agent 往返）：

- `/help` — 列出可用命令
- `/clear` — 清除你的会话并重新开始（别名：`/reset`、`/new`）
- `/status` — 显示会话信息和访问策略

所有其他斜杠命令（例如 `/compress`、`/summary`）都会转发给 agent。

这些命令适用于所有频道类型（Telegram、微信、QQ、钉钉）。

## 运行

```bash
# 启动所有配置好的频道（共享 agent 进程）
qwen channel start

# 启动单个频道
qwen channel start my-channel

# 检查服务是否正在运行
qwen channel status

# 停止运行中的服务
qwen channel stop
```

bot 在前台运行。按 `Ctrl+C` 停止，或从另一个终端使用 `qwen channel stop`。

### 实验性守护进程管理模式

你也可以在 `qwen serve` 下运行配置好的频道：

```bash
# 在守护进程生命周期下启动一个频道
qwen serve --channel my-channel

# 启动所有配置好的频道
qwen serve --channel all
```

此模式启动一个由 `qwen serve` 拥有的频道 worker 进程。worker 通过 SDK 连接回守护进程并使用相同的频道适配器。它独立于守护进程，因此频道适配器崩溃不会导致守护进程崩溃。

`qwen serve --channel` 与 `qwen channel start` 不是同一个服务。独立的 `qwen channel start` 仍然使用 ACP 支持的频道服务，并且可以运行具有不同 `cwd` 值的频道配置。守护进程管理的频道要求每个选定频道的 `cwd` 解析到守护进程工作区。

当频道由 serve 管理时，`qwen channel status` 会显示所有者为 `qwen serve`，并且 `qwen channel stop` 会提示你停止守护进程，而不是直接向 worker 发送信号。如果就绪的 worker 意外退出，守护进程会继续运行并在 `/daemon/status` 中报告频道 worker 警告。

### 多频道模式

当你不带名称运行 `qwen channel start` 时，`settings.json` 中定义的所有频道会一起启动并共享单个 agent 进程。每个频道维护自己的会话——Telegram 用户和微信用户会获得独立的对话，即使他们共享同一个 agent。

每个频道使用其配置中的 `cwd`，因此不同的频道可以同时处理不同的项目。

### 服务管理

频道服务使用 PID 文件（`~/.qwen/channels/service.pid`）来跟踪运行中的实例：

- **防止重复**：在服务已运行时运行 `qwen channel start` 会显示错误，而不是启动第二个实例
- **`qwen channel stop`**：从另一个终端优雅地停止运行中的服务
- **`qwen channel status`**：显示服务是否正在运行、其运行时间以及每个频道的会话数

### 崩溃恢复

如果 agent 进程意外崩溃，频道服务会自动重启它并尝试恢复所有活动会话。用户可以继续他们的对话而无需重新开始。

- 会话在服务运行期间持久化到 `~/.qwen/channels/sessions.json`
- 崩溃时：agent 会在 3 秒内重启并重新加载已保存的会话
- 连续崩溃 3 次后，服务会报错退出
- 干净关闭时（Ctrl+C 或 `qwen channel stop`）：会话数据会被清除——下次启动始终是全新的