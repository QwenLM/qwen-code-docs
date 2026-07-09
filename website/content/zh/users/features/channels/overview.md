# 频道

通过频道，你可以从 Telegram、微信、QQ、钉钉或飞书等消息平台与 Qwen Code agent 进行交互，而无需使用终端。你可以从手机或桌面聊天应用发送消息，agent 的响应方式与在 CLI 中完全一致。

## 工作原理

运行 `qwen channel start` 时，Qwen Code 会：

1. 从 `settings.json` 读取频道配置
2. 使用 [Agent Client Protocol (ACP)](../../../developers/architecture.md) 生成单个 agent 进程
3. 连接到各个消息平台并开始监听消息
4. 将接收到的消息路由给 agent，并将响应发送回对应的聊天

所有频道共享一个 agent 进程，但每个用户的会话是隔离的。每个频道可以拥有自己的工作目录、模型和指令。

## 快速开始

1. 在消息平台上设置机器人（请参阅各频道专属指南：[Telegram](./telegram)、[微信](./weixin)、[QQ Bot](./qqbot)、[钉钉](./dingtalk)、[飞书](./feishu)）
2. 将频道配置添加到 `~/.qwen/settings.json`
3. 运行 `qwen channel start` 启动所有频道，或运行 `qwen channel start <name>` 启动单个频道

想接入未内置的平台？请参阅 [插件](./plugins)，将自定义适配器作为扩展添加。

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

| 选项                     | 是否必需         | 描述                                                                                                                                                             |
| ------------------------ | ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `type`                   | 是               | 频道类型：`telegram`、`weixin`、`qq`、`dingtalk`、`feishu` 或来自扩展的自定义类型（参见 [插件](./plugins)）                                                       |
| `token`                  | Telegram         | 机器人 Token。支持 `$ENV_VAR` 语法从环境变量读取。微信、钉钉或飞书不需要此项                                                                                     |
| `clientId`               | 钉钉, 飞书       | 钉钉 AppKey 或飞书 App ID。支持 `$ENV_VAR` 语法                                                                                                                  |
| `clientSecret`           | 钉钉, 飞书       | 钉钉 AppSecret 或飞书 App Secret。支持 `$ENV_VAR` 语法                                                                                                           |
| `model`                  | 否               | 此频道使用的模型（例如 `qwen3.5-plus`）。覆盖默认模型。适用于支持图像输入的多模态模型                                                                            |
| `senderPolicy`           | 否               | 允许与机器人交互的用户：`allowlist`（默认）、`open` 或 `pairing`                                                                                                 |
| `allowedUsers`           | 否               | 允许使用机器人的用户 ID 列表（由 `allowlist` 和 `pairing` 策略使用）                                                                                             |
| `sessionScope`           | 否               | 会话作用域：`user`（默认）、`thread` 或 `single`                                                                                                                 |
| `cwd`                    | 否               | agent 的工作目录。默认为当前目录                                                                                                                                 |
| `instructions`           | 否               | 自定义指令，会追加到每个会话的第一条消息之前                                                                                                                     |
| `groupPolicy`            | 否               | 群聊访问权限：`disabled`（默认）、`allowlist` 或 `open`。参见 [群聊](#group-chats)                                                                               |
| `groupHistoryLimit`      | 否               | 可选的群聊历史回填。`0` 或省略则禁用。正整数表示在下次机器人被 @提及/回复时，持久化保存该数量的已授权且未被提及的群消息。                                          |
| `groups`                 | 否               | 每个群组的设置。键为群聊 ID 或 `"*"`（表示默认设置）。参见 [群聊](#group-chats)                                                                                  |
| `dispatchMode`           | 否               | 当机器人繁忙时发送消息的处理方式：`steer`（默认）、`collect` 或 `followup`。参见 [调度模式](#dispatch-modes)                                                       |
| `blockStreaming`         | 否               | 渐进式响应交付：`on` 或 `off`（默认）。参见 [分块流式输出](#block-streaming)                                                                                       |
| `blockStreamingChunk`    | 否               | 分块大小边界：`{ "minChars": 400, "maxChars": 1000 }`。参见 [分块流式输出](#block-streaming)                                                                       |
| `blockStreamingCoalesce` | 否               | 空闲刷新：`{ "idleMs": 1500 }`。参见 [分块流式输出](#block-streaming)                                                                                              |

### 发送者策略

控制谁可以与机器人交互：

- **`allowlist`**（默认）— 只有在 `allowedUsers` 中列出的用户才能发送消息。其他用户会被静默忽略。
- **`pairing`** — 未知发送者会收到一个配对码。机器人管理员通过 CLI 批准他们，并将其添加到持久化白名单中。`allowedUsers` 中的用户会完全跳过配对。参见下方的 [私聊配对](#dm-pairing)。
- **`open`** — 任何人都可以发送消息。请谨慎使用。

### 会话作用域

控制会话的管理方式：

- **`user`**（默认）— 每个用户一个会话。同一用户的所有消息共享一个对话。
- **`thread`** — 每个话题/线程一个会话。适用于支持话题的群聊。
- **`single`** — 所有用户共享一个会话。所有人共享同一个对话。

### 频道记忆

频道记忆允许已授权的频道成员为某个聊天或话题保存稳定的上下文。Qwen Code 会在新的频道会话开始时（包括执行 `/clear` 之后）注入该记忆。

自然语言示例：

- `记住：默认使用 staging 环境` 为当前聊天或话题保存记忆。
- `你记一下以后回复前要说 1122` 保存提取的持久记忆。
- `你现在都记住了什么` 显示当前聊天或话题已保存的记忆。
- `把这个聊天的记忆清空` 启动清除流程；`确认清空记忆` 确认清除。

群聊可以显示已保存的记忆，但禁止写入和清除操作，以避免将共享记忆变成其他参与者的提示词注入途径。

只有在 `allowedUsers` 中列出的用户才能读取、写入或清除频道记忆。如果 `allowedUsers` 为空，则所有人的频道记忆命令都会被禁用。

### Token 安全

机器人 Token 不应直接存储在 `settings.json` 中。请使用环境变量引用：

```json
{
  "token": "$TELEGRAM_BOT_TOKEN"
}
```

在 shell 环境或 `.env` 文件中设置实际的 Token，并确保在运行频道前加载该文件。

## 私聊配对

当 `senderPolicy` 设置为 `"pairing"` 时，未知发送者会经过以下审批流程：

1. 未知用户向机器人发送消息
2. 机器人回复一个 8 位字符的配对码（例如 `VEQDDWXJ`）
3. 用户将配对码分享给你（机器人管理员）
4. 你通过 CLI 批准该用户：

```bash
qwen channel pairing approve my-channel VEQDDWXJ
```

批准后，用户的 ID 会保存到 `~/.qwen/channels/<name>-allowlist.json`，后续所有消息均可正常通过。

### 配对 CLI 命令

```bash
# 列出待处理的配对请求
qwen channel pairing list my-channel

# 通过配对码批准请求
qwen channel pairing approve my-channel <CODE>
```

### 配对规则

- 配对码为 8 个大写字符，使用无歧义的字母表（不包含 `0`/`O`/`1`/`I`）
- 配对码 1 小时后过期
- 每个频道同时最多 3 个待处理请求 — 在有请求过期或被批准之前，额外的请求会被忽略
- `settings.json` 中 `allowedUsers` 列出的用户始终跳过配对
- 已批准的用户存储在 `~/.qwen/channels/<name>-allowlist.json` 中 — 请将此文件视为敏感文件

## 群聊

默认情况下，机器人仅在私聊中工作。要启用群聊支持，请将 `groupPolicy` 设置为 `"allowlist"` 或 `"open"`。

### 群聊策略

控制机器人是否参与群聊：

- **`disabled`**（默认）— 机器人忽略所有群消息。最安全的选项。
- **`allowlist`** — 机器人仅在 `groups` 中通过群聊 ID 明确列出的群组中响应。`"*"` 键提供默认设置，但**不**作为通配符允许所有群组。
- **`open`** — 机器人在其加入的所有群组中响应。请谨慎使用。

### @提及触发

在群聊中，机器人默认需要被 `@提及` 或回复其某条消息才会响应。这可以防止机器人对群聊中的每条消息都进行回复。

使用 `groups` 设置按群组进行配置：

```json
{
  "groups": {
    "*": { "requireMention": true },
    "-100123456": { "requireMention": false }
  }
}
```

- **`"*"`** — 所有群组的默认设置。仅设置配置默认值，并非白名单条目。
- **群聊 ID** — 覆盖特定群组的设置。覆盖 `"*"` 的默认值。
- **`requireMention`**（默认：`true`）— 为 `true` 时，机器人仅响应 `@提及` 它或回复其消息的内容。为 `false` 时，机器人响应所有消息（适用于专属任务群）。

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

- 省略或设置为 `0` 将禁用回填。
- 群组级别的 `groupHistoryLimit` 会覆盖频道级别的值。
- 仅持久化来自已授权发送者的消息。
- 被 `groupPolicy` 或群组白名单拒绝的消息不会被持久化。
- 待处理的群聊历史以本地 JSONL 格式存储在 `~/.qwen/channels/<channel-name>-group-history.jsonl` 或 `$QWEN_HOME/channels/<channel-name>-group-history.jsonl` 中。
- 缓存的消息会在下次实际触发时作为不受信任的上下文注入，且不会作为独立的会话轮次写入。

### 群聊消息评估流程

```
1. groupPolicy — 是否允许此群组？           (否 → 忽略)
2. requireMention — 机器人是否被 @提及/回复？ (否 → 忽略)
3. senderPolicy — 此发送者是否已获批准？     (否 → 配对流程)
4. 路由到会话
```

### Telegram 群聊设置

1. 将机器人添加到群组
2. 在 BotFather 中**禁用隐私模式**（`/mybots` → Bot Settings → Group Privacy → Turn Off）— 否则机器人将无法看到非命令消息
3. 更改隐私模式后，**将机器人移出并重新添加**到群组（Telegram 会缓存此设置）
### 查找群聊 ID

要为 `groups` 白名单查找群聊 ID：

1. 如果机器人正在运行，请先停止它
2. 在群聊中发送一条提及该机器人的消息
3. 使用 Telegram Bot API 检查排队的更新：

```bash
curl -s "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getUpdates" | python3 -m json.tool
```

在响应中查找 `message.chat.id` —— 群聊 ID 是负数（例如 `-5170296765`）。

## 媒体支持

频道支持向 agent 发送图片和文件，不仅限于文本。

### 图片

向机器人发送照片，agent 即可看到它 —— 这对于分享截图、错误信息或图表非常有用。图片会作为视觉输入直接发送给模型。

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

向机器人发送文档（PDF、代码文件、文本文件等）。文件会被下载并保存到临时目录，同时会将文件路径告知 agent，以便其使用文件读取工具读取内容。

文件功能适用于任何模型 —— 无需多模态支持。

### 平台差异

| 功能  | Telegram                                     | 微信                           | 钉钉                                      | 飞书                                                      |
| -------- | -------------------------------------------- | -------------------------------- | --------------------------------------------- | ----------------------------------------------------------- |
| 图片   | 通过 Bot API 直接下载                  | 通过 CDN 下载并进行 AES 解密 | downloadCode API（两步）                   | Open API 资源端点（需鉴权的 GET 请求，50MB 限制） |
| 文件    | 通过 Bot API 直接下载（20MB 限制）     | 通过 CDN 下载并进行 AES 解密 | downloadCode API（两步）                   | Open API 资源端点（50MB 限制）                    |
| 说明文字 | 图片/文件的说明文字作为消息文本包含在内 | 不适用                   | 富文本：单条消息中混合文本和图片 | 富文本（`post`）：提取文本；忽略嵌入的图片 |

> QQ Bot 不处理传入的媒体 —— 图片和贴纸消息会被忽略，因此上表中没有其媒体处理的相关行。

## 调度模式

控制在机器人仍在处理上一条消息时，发送新消息会发生什么。

- **`steer`**（默认） —— 机器人取消当前请求并开始处理你的新消息。最适合普通聊天，因为后续消息通常意味着你想纠正或重新引导机器人。
- **`collect`** —— 你的新消息会被缓冲。当前请求完成后，所有缓冲的消息会合并为一条后续提示。适合异步工作流，方便你排队输入想法。
- **`followup`** —— 每条消息按顺序排队，并作为独立的轮次进行处理。适用于批量工作流，其中每条消息都是独立的。

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

你还可以为每个群组单独设置调度模式，从而覆盖频道的默认设置：

```json
{
  "groups": {
    "*": { "requireMention": true, "dispatchMode": "steer" },
    "-100123456": { "dispatchMode": "collect" }
  }
}
```

## 分块流式输出

默认情况下，agent 会工作一段时间，然后发送一个完整的长回复。启用分块流式输出后，回复会在 agent 工作时以多条较短的消息陆续到达 —— 类似于 ChatGPT 或 Claude 展示渐进式输出的方式。

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

- agent 的回复会在段落边界处被拆分为多个块，并作为独立的消息发送
- `minChars`（默认 400） —— 块长度至少达到此值时才发送，以避免发送大量碎片化消息
- `maxChars`（默认 1000） —— 如果块长度达到此值且没有自然断点，则直接发送
- `idleMs`（默认 1500） —— 如果 agent 暂停（例如正在运行工具），则发送目前缓冲的内容
- 当 agent 完成时，任何剩余的文本会立即发送

只有 `blockStreaming` 是必填项。分块（chunk）和合并（coalesce）设置是可选的，并具有合理的默认值。

## 斜杠命令

频道支持斜杠命令。这些命令在本地处理（无需 agent 往返）：

- `/help` —— 列出可用命令
- `/clear` —— 清除当前会话并重新开始（别名：`/reset`、`/new`）
- `/status` —— 显示会话信息和访问策略

所有其他斜杠命令（例如 `/compress`、`/summary`）都会转发给 agent。

这些命令适用于所有频道类型（Telegram、微信、QQ、钉钉、飞书）。

## 运行

```bash
# 启动所有已配置的频道（共享 agent 进程）
qwen channel start

# 启动单个频道
qwen channel start my-channel

# 检查服务是否正在运行
qwen channel status

# 停止运行中的服务
qwen channel stop
```

机器人在前台运行。按 `Ctrl+C` 停止，或在另一个终端中使用 `qwen channel stop`。

### 实验性守护进程管理模式

你也可以在 `qwen serve` 下运行已配置的频道：

```bash
# 在守护进程生命周期下启动一个频道
qwen serve --channel my-channel

# 启动所有已配置的频道
qwen serve --channel all
```

此模式会启动一个由 `qwen serve` 管理的频道 worker 进程。worker 通过 SDK 连接回守护进程，并使用相同的频道适配器。它与守护进程是分离的，因此频道适配器崩溃不会导致守护进程崩溃。

`qwen serve --channel` 与 `qwen channel start` 不是同一个服务。独立的 `qwen channel start` 仍然使用 ACP 支持的频道服务，并且可以运行具有不同 `cwd` 值的频道配置。而守护进程管理的频道要求每个所选频道的 `cwd` 都解析到守护进程的工作区。

当频道由 serve 管理时，`qwen channel status` 会显示所有者为 `qwen serve`，并且 `qwen channel stop` 会提示你停止守护进程，而不是直接向 worker 发送信号。如果就绪的 worker 意外退出，守护进程会继续运行，并在 `/daemon/status` 中报告频道 worker 警告。

### 多频道模式

当你不带名称运行 `qwen channel start` 时，`settings.json` 中定义的所有频道会一起启动，并共享单个 agent 进程。每个频道维护自己的会话 —— Telegram 用户和微信用户会获得独立的对话，即使他们共享同一个 agent。

每个频道使用其配置中各自的 `cwd`，因此不同的频道可以同时处理不同的项目。

### 服务管理

频道服务使用 PID 文件（`~/.qwen/channels/service.pid`）来跟踪运行中的实例：

- **防止重复**：在服务已运行时执行 `qwen channel start` 会显示错误，而不会启动第二个实例
- **`qwen channel stop`**：从另一个终端优雅地停止运行中的服务
- **`qwen channel status`**：显示服务是否正在运行、运行时间以及每个频道的会话数

### 崩溃恢复

如果 agent 进程意外崩溃，频道服务会自动重启它并尝试恢复所有活动会话。用户可以继续他们的对话，而无需重新开始。

- 服务运行期间，会话会持久化到 `~/.qwen/channels/sessions.json`
- 崩溃时：agent 会在 3 秒内重启并重新加载已保存的会话
- 连续崩溃 3 次后，服务会报错退出
- 正常关闭时（Ctrl+C 或 `qwen channel stop`）：会话数据会被清除 —— 下次启动始终是全新的