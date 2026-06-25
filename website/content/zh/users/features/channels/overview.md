# Channels

Channels 让你可以从 Telegram、微信、QQ 或钉钉等消息平台与 Qwen Code agent 交互，而无需使用终端。你在手机或桌面聊天应用中发送消息，agent 的响应方式与 CLI 中完全相同。

## 工作原理

当你运行 `qwen channel start` 时，Qwen Code 会：

1. 从 `settings.json` 中读取 channel 配置
2. 使用 [Agent Client Protocol (ACP)](../../../developers/architecture.md) 启动一个 agent 进程
3. 连接到各消息平台并开始监听消息
4. 将收到的消息路由到 agent，并将响应发送回对应的聊天会话

所有 channel 共享一个 agent 进程，每个用户拥有独立的会话。每个 channel 可以有自己的工作目录、模型和指令。

## 快速开始

1. 在消息平台上设置 bot（参见各平台指南：[Telegram](./telegram)、[WeChat](./weixin)、[QQ Bot](./qqbot)、[DingTalk](./dingtalk)）
2. 在 `~/.qwen/settings.json` 中添加 channel 配置
3. 运行 `qwen channel start` 启动所有 channel，或 `qwen channel start <name>` 启动单个 channel

想接入未内置的平台？参见 [Plugins](./plugins) 了解如何以扩展形式添加自定义适配器。

## 配置

Channel 在 `settings.json` 的 `channels` 键下配置。每个 channel 有一个名称和一组选项：

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

| 选项                     | 是否必填  | 描述                                                                                                                                           |
| ------------------------ | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `type`                   | 是       | Channel 类型：`telegram`、`weixin`、`qq`、`dingtalk`、`feishu`，或扩展中的自定义类型（参见 [Plugins](./plugins)）                              |
| `token`                  | Telegram | Bot token。支持 `$ENV_VAR` 语法从环境变量读取。WeChat 或 DingTalk 不需要此项                                                                   |
| `clientId`               | DingTalk | DingTalk AppKey。支持 `$ENV_VAR` 语法                                                                                                          |
| `clientSecret`           | DingTalk | DingTalk AppSecret。支持 `$ENV_VAR` 语法                                                                                                       |
| `model`                  | 否       | 该 channel 使用的模型（如 `qwen3.5-plus`）。覆盖默认模型。适用于支持图片输入的多模态模型                                                        |
| `senderPolicy`           | 否       | 可与 bot 交互的用户范围：`allowlist`（默认）、`open` 或 `pairing`                                                                              |
| `allowedUsers`           | 否       | 允许使用 bot 的用户 ID 列表（由 `allowlist` 和 `pairing` 策略使用）                                                                            |
| `sessionScope`           | 否       | 会话作用域：`user`（默认）、`thread` 或 `single`                                                                                               |
| `cwd`                    | 否       | agent 的工作目录。默认为当前目录                                                                                                                |
| `instructions`           | 否       | 自定义指令，会在每个会话的第一条消息前插入                                                                                                      |
| `groupPolicy`            | 否       | 群聊访问策略：`disabled`（默认）、`allowlist` 或 `open`。参见 [群聊](#group-chats)                                                             |
| `groups`                 | 否       | 每个群的设置。键为群聊 ID 或 `"*"` 表示默认值。参见 [群聊](#group-chats)                                                                       |
| `dispatchMode`           | 否       | bot 繁忙时发送新消息的处理方式：`steer`（默认）、`collect` 或 `followup`。参见 [Dispatch Modes](#dispatch-modes)                               |
| `blockStreaming`         | 否       | 渐进式响应投递：`on` 或 `off`（默认）。参见 [Block Streaming](#block-streaming)                                                                |
| `blockStreamingChunk`    | 否       | 分块大小限制：`{ "minChars": 400, "maxChars": 1000 }`。参见 [Block Streaming](#block-streaming)                                                |
| `blockStreamingCoalesce` | 否       | 空闲刷新：`{ "idleMs": 1500 }`。参见 [Block Streaming](#block-streaming)                                                                       |

### Sender Policy

控制谁可以与 bot 交互：

- **`allowlist`**（默认）—— 只有 `allowedUsers` 中列出的用户可以发送消息。其他用户会被静默忽略。
- **`pairing`** —— 未知发送者会收到一个配对码。bot 运营者通过 CLI 审批后，该用户会被加入持久化白名单。在 `allowedUsers` 中列出的用户会直接跳过配对流程。参见下方 [DM Pairing](#dm-pairing)。
- **`open`** —— 任何人都可以发送消息。请谨慎使用。

### Session Scope

控制会话的管理方式：

- **`user`**（默认）—— 每个用户一个会话。同一用户的所有消息共享一个对话。
- **`thread`** —— 每个 thread/话题一个会话。适用于有话题功能的群聊。
- **`single`** —— 所有用户共享一个会话。所有人共用同一个对话。

### Token 安全

Bot token 不应直接存储在 `settings.json` 中。请使用环境变量引用：

```json
{
  "token": "$TELEGRAM_BOT_TOKEN"
}
```

在 shell 环境中或在运行 channel 前加载的 `.env` 文件中设置实际 token。

## DM Pairing

当 `senderPolicy` 设置为 `"pairing"` 时，未知发送者需经过审批流程：

1. 未知用户向 bot 发送消息
2. Bot 回复一个 8 位配对码（例如 `VEQDDWXJ`）
3. 用户将配对码分享给 bot 运营者（即你）
4. 通过 CLI 审批：

```bash
qwen channel pairing approve my-channel VEQDDWXJ
```

审批通过后，该用户的 ID 会保存到 `~/.qwen/channels/<name>-allowlist.json`，后续消息将正常处理。

### Pairing CLI 命令

```bash
# 列出待审批的配对请求
qwen channel pairing list my-channel

# 通过配对码审批请求
qwen channel pairing approve my-channel <CODE>
```

### Pairing 规则

- 配对码为 8 位大写字母，使用无歧义字母表（不含 `0`/`O`/`1`/`I`）
- 配对码 1 小时后过期
- 每个 channel 最多同时有 3 个待审批请求——超出的请求会被忽略，直到有请求过期或被审批
- 在 `settings.json` 的 `allowedUsers` 中列出的用户始终跳过配对
- 已审批用户存储在 `~/.qwen/channels/<name>-allowlist.json` 中——请将此文件视为敏感信息

## 群聊 {#group-chats}

默认情况下，bot 只在私信中工作。要启用群聊支持，请将 `groupPolicy` 设置为 `"allowlist"` 或 `"open"`。

### Group Policy

控制 bot 是否参与群聊：

- **`disabled`**（默认）—— Bot 忽略所有群消息。最安全的选项。
- **`allowlist`** —— Bot 只在 `groups` 中通过群聊 ID 明确列出的群中响应。`"*"` 键提供默认设置，但**不**作为通配符白名单。
- **`open`** —— Bot 在被添加到的所有群中响应。请谨慎使用。

### Mention Gating

在群聊中，bot 默认需要 `@mention` 或回复其消息才会响应。这可以防止 bot 回复群聊中的每一条消息。

通过 `groups` 设置按群配置：

```json
{
  "groups": {
    "*": { "requireMention": true },
    "-100123456": { "requireMention": false }
  }
}
```

- **`"*"`** —— 所有群的默认设置。仅设置配置默认值，不作为白名单条目。
- **群聊 ID** —— 覆盖特定群的设置。会覆盖 `"*"` 的默认值。
- **`requireMention`**（默认：`true`）—— 为 `true` 时，bot 只响应 @mention 它或回复其消息的消息。为 `false` 时，bot 响应所有消息（适用于专用任务群）。

### 群消息的处理流程

```
1. groupPolicy —— 该群是否被允许？           （否 → 忽略）
2. requireMention —— bot 是否被 mention/回复？ （否 → 忽略）
3. senderPolicy —— 该发送者是否已审批？         （否 → 进入配对流程）
4. 路由到会话
```

### Telegram 群聊设置

1. 将 bot 添加到群聊
2. 在 BotFather 中**关闭隐私模式**（`/mybots` → Bot Settings → Group Privacy → Turn Off）——否则 bot 无法看到非命令消息
3. 修改隐私模式后**将 bot 从群中移除并重新添加**（Telegram 会缓存此设置）

### 查找群聊 ID

要获取群聊 ID 用于 `groups` 白名单：

1. 如果 bot 正在运行，先停止它
2. 在群中发送一条 mention bot 的消息
3. 使用 Telegram Bot API 查看队列中的更新：

```bash
curl -s "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getUpdates" | python3 -m json.tool
```

在响应中查找 `message.chat.id`——群 ID 为负数（如 `-5170296765`）。

## 媒体支持

Channel 支持向 agent 发送图片和文件，而不仅仅是文本。

### 图片

向 bot 发送照片，agent 即可看到——适用于分享截图、错误信息或图表。图片会作为视觉输入直接发送给模型。

要使用图片支持，请为 channel 配置多模态模型：

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

向 bot 发送文档（PDF、代码文件、文本文件等）。文件会被下载并保存到临时目录，agent 会收到文件路径，可以使用其文件读取工具读取内容。

文件功能适用于任何模型——不需要多模态支持。

### 平台差异

| 功能     | Telegram                                     | WeChat                           | DingTalk                                      |
| -------- | -------------------------------------------- | -------------------------------- | --------------------------------------------- |
| 图片     | 通过 Bot API 直接下载                         | CDN 下载（AES 解密）              | downloadCode API（两步）                       |
| 文件     | 通过 Bot API 直接下载（20MB 限制）            | CDN 下载（AES 解密）              | downloadCode API（两步）                       |
| 说明文字 | 照片/文件说明文字作为消息文本包含             | 不适用                            | 富文本：文本与图片混排在同一消息中              |

## Dispatch Modes

控制在 bot 仍在处理上一条消息时发送新消息的行为。

- **`steer`**（默认）—— Bot 取消当前请求，开始处理新消息。适用于普通聊天场景，因为后续消息通常意味着你想纠正或重定向 bot。
- **`collect`** —— 新消息会被缓冲。当前请求完成后，所有缓冲消息会合并为一条后续提示。适用于希望排队发送想法的异步工作流。
- **`followup`** —— 每条消息都会入队并作为独立的轮次按顺序处理。适用于每条消息相互独立的批量工作流。

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

也可以按群设置 dispatch mode，覆盖 channel 的默认值：

```json
{
  "groups": {
    "*": { "requireMention": true, "dispatchMode": "steer" },
    "-100123456": { "dispatchMode": "collect" }
  }
}
```

## Block Streaming

默认情况下，agent 工作完成后会发送一条完整的响应。启用 block streaming 后，响应会在 agent 仍在工作时以多条较短的消息形式逐步发送——类似于 ChatGPT 或 Claude 显示渐进输出的方式。

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

- Agent 的响应在段落边界处分割成块，作为独立消息发送
- `minChars`（默认 400）—— 块达到此长度前不发送，避免发送过多小消息
- `maxChars`（默认 1000）—— 块达到此长度且没有自然分割点时强制发送
- `idleMs`（默认 1500）—— agent 暂停时（如执行工具），将已缓冲的内容发送出去
- Agent 完成后，剩余文本会立即发送

只有 `blockStreaming` 是必填项。分块和合并设置是可选的，已有合理的默认值。

## Slash 命令

Channel 支持 slash 命令。这些命令在本地处理（无需 agent 往返）：

- `/help` —— 列出可用命令
- `/clear` —— 清除会话并重新开始（别名：`/reset`、`/new`）
- `/status` —— 显示会话信息和访问策略

其他所有 slash 命令（如 `/compress`、`/summary`）会转发给 agent。

这些命令适用于所有 channel 类型（Telegram、WeChat、QQ、DingTalk）。

## 运行

```bash
# 启动所有已配置的 channel（共享 agent 进程）
qwen channel start

# 启动单个 channel
qwen channel start my-channel

# 检查服务是否在运行
qwen channel status

# 停止正在运行的服务
qwen channel stop
```

Bot 在前台运行。按 `Ctrl+C` 停止，或从另一个终端使用 `qwen channel stop`。

### 多 Channel 模式

当运行 `qwen channel start` 而不指定名称时，`settings.json` 中定义的所有 channel 会共享一个 agent 进程一起启动。每个 channel 维护自己的会话——Telegram 用户和微信用户会有独立的对话，即使它们共享同一个 agent。

每个 channel 使用其配置中的 `cwd`，因此不同 channel 可以同时在不同项目上工作。

### 服务管理

Channel 服务使用 PID 文件（`~/.qwen/channels/service.pid`）跟踪运行实例：

- **防止重复启动**：在服务已运行时再次运行 `qwen channel start` 会显示错误，而不是启动第二个实例
- **`qwen channel stop`**：从另一个终端优雅地停止正在运行的服务
- **`qwen channel status`**：显示服务是否在运行、运行时长以及每个 channel 的会话数

### 崩溃恢复

如果 agent 进程意外崩溃，channel 服务会自动重启并尝试恢复所有活跃会话。用户无需重新开始即可继续对话。

- 服务运行期间，会话持久化到 `~/.qwen/channels/sessions.json`
- 崩溃后：agent 在 3 秒内重启并重新加载已保存的会话
- 连续崩溃 3 次后，服务会报错退出
- 正常关闭（Ctrl+C 或 `qwen channel stop`）时：会话数据会被清除——下次启动始终是全新开始
