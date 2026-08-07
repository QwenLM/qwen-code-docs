# 频道

通过频道，你可以从 Telegram、微信、QQ、钉钉、企业微信或飞书等消息平台与 Qwen Code agent 进行交互，而无需使用终端。你可以从手机或桌面聊天应用发送消息，agent 的响应方式与在 CLI 中完全一致。

代码托管平台（目前支持 [GitHub](./github)）也通过轮询适配器支持 —— agent 会监控通知并响应 issue 和 pull request 中的 @提及。

## 工作原理

运行 `qwen channel start` 时，Qwen Code 会：

1. 从 `settings.json` 读取频道配置
2. 使用 [Agent Client Protocol (ACP)](../../../developers/architecture.md) 生成单个 agent 进程
3. 连接到各个消息平台并开始监听消息
4. 将接收到的消息路由给 agent，并将响应发送回对应的聊天

所有频道共享一个 agent 进程，但每个用户的会话是隔离的。每个频道可以拥有自己的工作目录、模型和指令。

## 快速开始

1. 在消息平台上设置机器人（请参阅各频道专属指南：[Telegram](./telegram)、[微信](./weixin)、[QQ Bot](./qqbot)、[钉钉](./dingtalk)、[企业微信](./wecom)、[飞书](./feishu)、[GitHub](./github)）
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
      "dmPolicy": "open",
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
| `type`                   | 是               | 频道类型：`telegram`、`weixin`、`qq`、`dingtalk`、`wecom`、`feishu`、`github` 或来自扩展的自定义类型（参见 [插件](./plugins)）                                     |
| `token`                  | Telegram         | 机器人 Token。支持 `$ENV_VAR` 语法从环境变量读取。微信、钉钉、企业微信或飞书不需要此项                                                                             |
| `clientId`               | 钉钉, 飞书       | 钉钉 AppKey 或飞书 App ID。支持 `$ENV_VAR` 语法                                                                                                                  |
| `clientSecret`           | 钉钉, 飞书       | 钉钉 AppSecret 或飞书 App Secret。支持 `$ENV_VAR` 语法                                                                                                           |
| `botId`                  | 企业微信         | 企业微信智能机器人 Bot ID。支持 `$ENV_VAR` 语法。参见 [企业微信](./wecom)                                                                                          |
| `secret`                 | 企业微信         | 企业微信智能机器人 Secret。支持 `$ENV_VAR` 语法。参见 [企业微信](./wecom)                                                                                          |
| `model`                  | 否               | 此频道使用的模型（例如 `qwen3.5-plus`）。覆盖默认模型。适用于支持图像输入的多模态模型                                                                            |
| `senderPolicy`           | 否               | 允许与机器人交互的用户：`allowlist`（默认）、`open` 或 `pairing`                                                                                                 |
| `allowedUsers`           | 否               | 允许使用机器人的用户 ID 列表（由 `allowlist` 和 `pairing` 策略使用）                                                                                             |
| `sessionScope`           | 否               | 会话作用域：`user`（默认）、`thread` 或 `single`                                                                                                                 |
| `cwd`                    | 否               | agent 的工作目录。默认为当前目录                                                                                                                                 |
| `approvalMode`           | 否               | 频道会话的工具审批模式。无人值守的 webhook 任务需要 `yolo`；该设置应用于频道上的每个会话                                                                          |
| `instructions`           | 否               | 自定义指令，会追加到每个会话的第一条消息之前                                                                                                                     |
| `webhooks`               | 否               | 守护进程管理频道的 webhook 来源和投递目标。参见 [Webhook 触发的任务](#webhook-triggered-tasks)                                                                  |
| `groupPolicy`            | 否               | 群聊访问权限：`disabled`（默认）、`allowlist` 或 `open`。参见 [群聊](#group-chats)                                                                               |
| `dmPolicy`               | 否               | 私聊/DM 访问权限：`open`（默认）或 `disabled`（静默丢弃所有私聊）。适用于仅限群聊的机器人                                                                         |
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

频道记忆为某个聊天或话题存储持久上下文。每条记忆都有稳定的 ID，因此列表响应可用于确定性的后续操作。

- `记住：默认使用 staging 环境` 是确定性形式，为当前聊天或话题恰好保存一条标量记忆。
- 要在一个请求中保存多条独立的事实，请使用通过分类器路由的自然语言短语。例如：`请记住这三条约定：使用 staging；发布前测试；优先中文回复` 会创建可独立管理的记忆。完全重复的事实会被跳过并报告，不会创建重复条目。包含类似凭证文本的请求会被拒绝；请移除敏感信息后单独保存非敏感事实。
- `查看记忆` 列出记忆及其稳定 ID。使用 `查看第 2 页记忆` 查看后续页面，`查看记忆 <id>` 查看单条记忆，或使用自然过滤请求如 `只看中文偏好` 列出匹配的记忆。
- `查看刚才那条记忆`、`把关于 staging 的记忆改成默认使用 production` 和 `忘掉刚才那条` 在自然引用恰好解析为一条记忆时生效。自然更新和移除操作会先显示拟议的变更。在 60 秒内使用 `确认更新记忆` 或 `confirm memory update` 确认更新，或使用 `确认删除记忆` 或 `confirm memory removal` 确认移除。精确 ID 的更新和移除仍然是即时的，无需确认。
- `清空记忆` 启动全部清除确认流程；`确认清空记忆` 完成清除。

当自然的查看、更新或移除请求匹配多条记忆时，机器人会返回候选 ID 和预览，而不会修改记忆。模糊结果没有待定的选择：请使用一个精确 ID 重试请求，例如 `忘掉 m-a31f0d82c7e4`。精确 ID 操作仍然是确定性的快速路径。没有匹配的自然请求会报告未找到匹配的记忆。

待定的更新、移除和清除确认仅适用于创建它们的发送者以及对应的聊天或话题。较新的清除、自然更新或自然移除提议会替换同一发送者和目标的较旧待定操作。待定确认在频道进程重启时会被丢弃。

旧版斜杠命令别名 `/remember-channel`、`/channel-memory` 和 `/forget-channel` 已被移除。它们不再是频道记忆命令。

频道记忆遵循频道访问门控。任何被 `senderPolicy`、`dmPolicy`、`groupPolicy`、群组设置、配对和 @提及要求接受的消息都可以读取、写入、更新或清除该聊天或话题的记忆。同一群组的已接受成员共享该群组的目标存储。当群组记忆应限于受信任的发送者时，请使用 `allowlist` 或 `pairing` 策略。

旧版 `CHANNEL.md` 记忆会在首次变更时自动迁移到结构化的 `CHANNEL.json` 存储。结构化记忆在独立频道和守护进程管理频道的重启间持久化，并在新目标作用域会话启动时（包括 `/clear` 之后）注入。

在初始注入之后，每条被接受的消息还会召回最多三条与该消息相关的记忆。这使持久事实在长时间运行的会话中保持可用，而无需将每条存储的记忆添加到每个轮次。召回基于当前消息，不会修改存储的记忆。

记忆仍然以当前聊天或话题为键。它不会在 `sessionScope: single` 会话中注入或召回，因为该会话在整个频道间共享，而非作用于单个目标。

频道记忆不会自动从普通对话中学习事实，也不会接受 `第一个` 作为模糊自然引用的确认。当自然引用模糊时，请使用清晰的记忆请求和精确的记忆 ID。

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

批准后，用户的 ID 会保存到频道的按工作区作用域的白名单（`~/.qwen/channels/<workspace-scope>/<name>-allowlist.json`），后续所有消息均可正常通过。配对状态按工作区作用域管理，因此两个使用相同频道名称的工作区会维护各自独立的批准记录。

### 配对 CLI 命令

```bash
# 列出待处理的配对请求
qwen channel pairing list my-channel

# 通过配对码批准请求
qwen channel pairing approve my-channel <CODE>
```

从频道的工作区目录运行这些命令（或传递 `--cwd <dir>`）—— 配对状态按工作区存储。

### 配对规则

- 配对码为 8 个大写字符，使用无歧义的字母表（不包含 `0`/`O`/`1`/`I`）
- 配对码 1 小时后过期
- 每个频道同时最多 3 个待处理请求 — 在有请求过期或被批准之前，额外的请求会被忽略
- `settings.json` 中 `allowedUsers` 列出的用户始终跳过配对
- 已批准的用户按工作区存储在 `~/.qwen/channels/<workspace-scope>/<name>-allowlist.json` 中 — 请将此文件视为敏感文件

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
2. dmPolicy  — 是否允许此私聊？             (disabled → 忽略)
3. requireMention — 机器人是否被 @提及/回复？ (否 → 忽略)
4. senderPolicy — 此发送者是否已获批准？     (否 → 配对流程)
5. 路由到会话
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
>
> 企业微信支持文本、图片、文本混合图片、文件、视频和语音消息（转写后传入）。图片作为附件传递给 agent；文件和视频下载到临时本地路径。详见 [企业微信](./wecom#images-and-files)。

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

## 定时频道循环

频道内置持久化调度器，用于延迟执行提示并将结果推送回创建它的同一聊天。你可以用自然语言向 agent 提出请求，例如 `每 15 分钟检查一次部署情况并报告任何变化`，也可以直接使用本地命令：

```text
/loop add "*/15 * * * *" check the deployment and report any change
/loop list
/loop inspect <id>
/loop cancel <id>
```

当 agent 为你管理这些任务时，会使用 `channel_loop_create`、`channel_loop_list` 和 `channel_loop_cancel` 工具。调度使用标准的五字段 cron 表达式，基于机器的本地时间。任务在无人值守的情况下运行，最终响应会自动投递到创建它的聊天中。

频道循环与 [定时运行提示](../scheduled-tasks) 中描述的会话作用域任务不同：

- 它们存储在 `$QWEN_HOME/channels/` 下 —— 独立频道直接使用 `cron.json`，而守护进程管理的频道使用 `daemon/` 下的按工作区文件。两者在频道重启后仍然保留。
- 它们作用于当前频道聊天或话题。每个目标最多可以有 10 个启用的循环，每条提示限制为 4,000 个字符。
- 它们需要支持主动投递的适配器和目标。Telegram、钉钉、飞书和企业微信已选择加入，但受各平台特定的目标限制约束。
- 在 `sessionScope: "single"` 下不可用，因为该作用域不绑定到单个聊天目标。
- 如果目标的授权在循环到期时已被撤销，则已保存的循环会被禁用。

## 后台子代理结果

当 agent 将工作委派给后台子代理或 fork 时，完成结果会投递回拥有该会话的频道聊天。投递可能在原始轮次结束后发生，因此在后台工作活跃期间请保持频道服务或守护进程运行。

## 斜杠命令

频道支持斜杠命令。这些命令在本地处理（无需 agent 往返）：

- `/help` —— 列出可用命令
- `/clear` —— 清除当前会话并重新开始（别名：`/reset`、`/new`）
- `/status` —— 显示会话信息和访问策略
- `/loop add "<cron>" <prompt>` —— 创建持久化的定时频道循环
- `/loop list` —— 列出当前聊天的循环
- `/loop inspect <id>` —— 显示循环状态和运行详情
- `/loop cancel <id>` —— 禁用循环

所有其他斜杠命令（例如 `/compress`、`/summary`）都会转发给 agent。

这些命令适用于所有频道类型（Telegram、微信、QQ、钉钉、企业微信、飞书、GitHub），但循环创建还需要当前适配器和目标支持主动投递。

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

# 或在受 token 保护的守护进程上稍后启用频道
QWEN_SERVER_TOKEN=secret qwen serve
qwen channel set my-channel --token secret

# 查询或停止守护进程管理的频道
qwen channel status --daemon-url http://127.0.0.1:4170 --token secret
qwen channel stop --daemon-url http://127.0.0.1:4170 --token secret
```

此模式启动由 `qwen serve` 管理的按工作区分组的频道 worker 进程。worker 通过 SDK 连接回守护进程，并使用相同的频道适配器。它们与守护进程是分离的，因此频道适配器崩溃不会导致守护进程崩溃。未使用 `--channel` 启动的守护进程不会加载频道适配器，也不会预留频道服务的 PID 租约，直到第一次执行 `qwen channel set`。

`qwen serve --channel` 与 `qwen channel start` 不是同一个服务。独立的 `qwen channel start` 仍然使用 ACP 支持的频道服务，并且可以运行具有不同 `cwd` 值的频道配置。守护进程管理的频道要求每个所选频道的 `cwd` 都解析到守护进程注册的工作区。在多工作区模式下，选择替换会保留工作区有序频道列表未变化的 worker；`all` 仍然仅限于主工作区。

不带 `--daemon-url` 时，`qwen channel status` 和 `qwen channel stop` 保留独立的 pidfile 行为。它们的 `--daemon-url` 变体用于查询或停止守护进程管理器。运行时选择不会写入设置，也不会在守护进程重启后保留。如果就绪的 worker 意外退出，守护进程会继续运行，并在 `/daemon/status` 中报告频道 worker 警告。

## Webhook 触发的任务

守护进程管理的频道还可以接受经过鉴权的 webhook 事件。Qwen 接收事件作为上下文，进行摘要并决定哪些内容重要，然后将最终响应投递到配置的聊天目标。这不是原始通知中继。
Webhook 任务需要 `approvalMode: "yolo"`，因为它们在没有交互式审批的情况下运行。该设置应用于整个频道，而不仅仅是 webhook 轮次，因此请使用专用的 webhook 频道，或严格限制该频道的普通聊天发送者。

频道配置示例：

```json
{
  "channels": {
    "dingtalk-main": {
      "type": "dingtalk",
      "clientId": "$DINGTALK_CLIENT_ID",
      "clientSecret": "$DINGTALK_CLIENT_SECRET",
      "cwd": "/repo",
      "senderPolicy": "allowlist",
      "allowedUsers": ["12345"],
      "approvalMode": "yolo",
      "sessionScope": "user",
      "webhooks": {
        "sources": {
          "github-ci": {
            "secretEnv": "QWEN_CHANNEL_GITHUB_CI_SECRET",
            "targets": {
              "operator": {
                "chatId": "DINGTALK_USER_ID",
                "senderId": "webhook:github-ci",
                "isGroup": false
              },
              "team": {
                "chatId": "OPEN_CONVERSATION_ID",
                "senderId": "webhook:github-ci",
                "isGroup": true
              }
            }
          }
        }
      }
    }
  }
}
```

对于钉钉，请在每个目标上明确设置 `isGroup`。私聊目标使用钉钉用户 ID 作为 `chatId`，并设置 `isGroup: false`；群聊目标使用群组 `openConversationId`，并设置 `isGroup: true`。其他适配器可能需要各自的主动投递目标格式。

守护进程管理的钉钉、飞书、Telegram 和企业微信频道会从已授权的入站消息中动态观察联系人。列出在默认七天新鲜度窗口内主工作区中观察到的联系人：

```bash
curl -H "Authorization: Bearer $QWEN_SERVER_TOKEN" \
  http://127.0.0.1:4170/workspace/channel/observed-contacts
```

使用 `GET /workspaces/:workspace/channel/observed-contacts` 选择另一个已注册的受信任工作区。添加 `?freshWithinSeconds=N` 可选择从一秒到 365 天的窗口。守护进程通过 `workspace_channel_observed_contacts` 能力通告此 API。

响应返回完整的平台 ID 和标签。群组标签使用已接受的入站消息中已有的名称（如果可用）：钉钉提供 `conversationTitle`，Telegram 提供 `chat.title`。飞书和企业微信的群组标签目前回退到完整 ID；不查询平台目录或群组详情 API。话题标签也回退到完整 ID。每个 `lastObservedAt` 是规范的 ISO 8601 UTC 时间戳，精确到毫秒；客户端可以将其转换为用户的本地时区进行显示。顶层 `users` 包含在私聊中观察到的用户。`groups` 包含观察到的群聊，`groups[].users` 包含在每个群组中观察到的用户，`groups[].topics[].users` 包含在飞书或 Telegram 话题中观察到的用户：

```json
{
  "users": [
    {
      "channelName": "feishu-main",
      "label": "Example User",
      "id": "ou_complete_user_id",
      "lastObservedAt": "2026-07-17T08:00:00.000Z"
    }
  ],
  "groups": [
    {
      "channelName": "feishu-main",
      "label": "oc_complete_chat_id",
      "id": "oc_complete_chat_id",
      "lastObservedAt": "2026-07-17T08:05:00.000Z",
      "users": [
        {
          "label": "Example User",
          "id": "ou_complete_user_id",
          "lastObservedAt": "2026-07-17T08:05:00.000Z"
        }
      ],
      "topics": []
    }
  ]
}
```

这些嵌套用户是被观察到的参与者，而非权威的群组成员关系。只有通过了私聊/群组、@提及、发送者和配对门控的消息才会被记录。重复观察会刷新标签和时间戳；被动观察无法检测退出或删除，直到关系变得过时。消息内容永远不会被存储。有界的注册表存储在 `$QWEN_HOME/channels/daemon/<workspaceHash>/observed-contacts.json` 中，位于工作区检出之外，并按工作区隔离。其 500 条观察限制由该工作区中的所有频道和对话共享，超过 365 天的观察会在下次接受的写入时被移除。如果注册表损坏或使用了不受支持的版本，请删除该文件以重置；接受的流量会重新创建它。Webhook 配置和投递不受影响。

启动 `qwen serve` 并启用频道 worker：

```bash
QWEN_SERVER_TOKEN="$QWEN_SERVER_TOKEN" qwen serve --require-auth --channel dingtalk-main
```

请求示例：

```bash
curl -X POST "http://127.0.0.1:4170/channels/dingtalk-main/webhooks/github-ci" \
  -H "x-qwen-webhook-secret: $QWEN_CHANNEL_GITHUB_CI_SECRET" \
  -H "Content-Type: application/json" \
  -d '{
    "eventType": "push",
    "targetRef": "operator",
    "title": "CI pipeline finished",
    "payload": {
      "targetRef": "refs/heads/main",
      "repository": "qwen-code",
      "status": "success"
    }
  }'
```

Webhook 路由通过 webhook secret 请求头进行鉴权，即使 `qwen serve` 已启用 bearer auth。不要将守护进程 bearer token 分享给 webhook 提供者。Webhook 配置和 `secretEnv` 值在守护进程启动时加载；更改 webhook 来源或轮换 secret 后请重启 `qwen serve`。`202 {"accepted": true}` 响应表示频道 worker 已接受该任务的所有权，而非最终响应已投递到聊天。排查投递失败时，请检查守护进程和频道 worker 日志以及 `/daemon/status`。

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
- 崩溃时：agent 在 3 秒内重启并重新加载已保存的会话
- 连续 3 次崩溃后，服务会退出并报错
- 正常关闭（Ctrl+C 或 `qwen channel stop`）时：会话数据会被清除 —— 下次启动始终是全新的
