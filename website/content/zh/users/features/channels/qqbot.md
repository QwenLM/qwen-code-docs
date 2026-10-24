# QQ Bot (QQ机器人)

本指南介绍如何通过 QQ 官方 Bot 开放平台 API 设置 Qwen Code 频道。

## 前置条件

- 一个 QQ 账号（需使用手机应用扫描二维码）

## 设置方式

### 二维码登录

启动频道——首次启动会显示一个二维码。用你的 QQ 应用扫描即可激活。无需开发者账号或手动注册。凭证会自动保存并复用。

```json
{
  "channels": {
    "my-qq": {
      "type": "qq"
    }
  }
}
```

```bash
qwen channel start my-qq
# 使用你的 QQ 应用扫描终端中的二维码
```

### 手动配置（开发者后台）

如果你已经在 [QQ Bot 开放平台](https://q.qq.com/) 注册了应用，也可以使用该平台的凭证：

```json
{
  "channels": {
    "my-qq": {
      "type": "qq",
      "appID": "YOUR_APP_ID",
      "appSecret": "$QQ_APP_SECRET"
    }
  }
}
```

将 Secret 设置为环境变量：

```bash
export QQ_APP_SECRET=<your-app-secret>
```

## 配置

```json
{
  "channels": {
    "my-qq": {
      "type": "qq",
      "appID": "YOUR_APP_ID",
      "appSecret": "$QQ_APP_SECRET",
      "sandbox": false,
      "privatePolicy": "open",
      "sessionScope": "thread",
      "cwd": "/path/to/your/project",
      "instructions": "你是一个通过 QQ Bot 对话的 AI 助手。回复控制在 2000 字符以内。",
      "groupPolicy": "disabled",
      "groups": {
        "*": { "requireMention": true }
      }
    }
  }
}
```

> `sessionScope` 默认值为 `"thread"`。配合 `groupPolicy: "disabled"` 时这是一个仅私聊的设置，其中 `"thread"` 和 `"user"` 都会为每条私聊分配独立的上下文。此处展示 `"thread"` 是为了与下方[会话隔离](#session-isolation)部分保持一致——在修改现有频道的作用域之前，请先阅读该部分的升级说明。

### QQ 特有选项

| 选项          | 默认值    | 描述                                                                 |
| ------------- | --------- | -------------------------------------------------------------------- |
| `appID`       | —         | 来自开发者后台的 QQ Bot AppID。如省略，则使用二维码登录。            |
| `appSecret`   | —         | QQ Bot AppSecret。支持 `$ENV_VAR` 语法。如省略，则使用二维码登录。   |
| `sandbox`             | `false` | 设为 `true` 以使用 QQ 沙箱 API 环境（`sandbox.api.sgroup.qq.com`） |
| `purgeLegacySessions` | `false` | 删除旧版的单作用域和用户作用域会话路由——见下文。               |

所有标准频道选项（见[频道概览](./overview#options)）同样支持：
`privatePolicy`、`allowedUsers`、`sessionScope`、`cwd`、`instructions`、`groupPolicy`、`groups`、`dispatchMode`。

## 运行

```bash
# 仅启动 QQ 频道
qwen channel start my-qq

# 或同时启动所有已配置的频道
qwen channel start
```

打开 QQ 并向你的机器人发送一条消息。你将看到回复出现在聊天中。

## 群聊

要在 QQ 群中使用机器人：

1. 在频道配置中将 `groupPolicy` 设置为 `"allowlist"`、`"pairing"` 或 `"open"`
2. 通过 QQ Bot 开放平台后台或让群管理员邀请，将机器人添加到 QQ 群
3. 群成员必须 **@提及** 机器人才能触发回复
4. 如果使用 `groupPolicy: "pairing"`，请在回复开始前批准该群组的配对请求。注意，一旦群组被批准，**该群组的任何成员**默认都可以使用机器人（可通过群组的 `senders: "allowlist"` 和 `allowedUsers` 进行限制）；`privatePolicy` 和顶层的 `allowedUsers` 不会限制已批准群组的成员。

QQ Bot API V2 仅投递 @提及 了机器人的群消息——机器人看不到所有群消息。默认情况下 `requireMention` 为 `true`，在 QQ 上应保持此设置。

### 会话隔离

QQ 频道默认使用 `sessionScope: "thread"`：同一群组的成员共享一个以 `<channel>:<group_openid>` 为键的对话上下文，而不同群组之间相互隔离。每条私聊获得一个以 `<channel>:<user_openid>` 为键的独立上下文。

群组线程会话是一个**共享会话**：群组中的每个成员都读取并继续同一个对话历史。对该会话执行的操作命令（`/clear`、`/cancel`、`/who`、`/status`、`/loop`、`/btw`）、权限应答（`/approve`、`/approve-always`、`/deny`）以及转向正在进行的轮次（成员的普通消息会排在正在运行的轮次之后，而不是转向它）都仅限于频道 `operators` 中列出的成员；`allowedUsers` 和 `senderPolicy` **不会**授予这些权限。`operators` 默认未设置，因此开箱即用时共享群组会话中**没有**成员被授权运行这些命令——而群组中提出的权限请求也无人可以应答。将 `operators` 设置为应该能够控制群组会话的成员的 QQ id。对于群组消息，网关比较的是该成员的 `member_openid`——与上方群组作用域的 `allowedUsers` 相同的 id 空间——而非私聊的 `user_openid`；用 `user_openid` 填充的列表匹配不到任何人，而且由于列表非空，启动警告保持沉默，因此上述所有命令都会被简单拒绝。`single` 或 `chat_thread` 作用域的频道也会受到同样的影响，因为这些作用域同样共享私聊会话。`!` 宿主 shell 前缀在每个 QQ 群聊中都被禁用，无论作用域如何；在私聊中由相同的作用域规则决定——`!` 仅在作用域将会话保持为单个发送者私有时（`"thread"` 或 `"user"`）才会运行，在 `"single"` 或 `"chat_thread"` 下的私聊以及所有群组消息中都会被拒绝。如果群组成员不应共享历史或控制彼此的轮次，请设置 `sessionScope: "user"`（每个成员获得一个私有的会话——在切换现有频道之前请参阅下方的升级说明），或者通过群组作用域的 `senders` / `allowedUsers` 控制来限制谁可以与机器人交谈——例如 `groups: {"*": {"senders": "allowlist", "allowedUsers": ["<member_openid>"]}}`。顶层的 `senderPolicy`、`allowedUsers` 和 `privatePolicy` 仅管理私聊；它们不会限制已批准群组的成员。

对于完整消息模式，默认设置已经是你需要的——配合 `groupAllPolicy: "all"` 时，保持 `"thread"` 可以在群组内获得共享上下文，并在群组之间保持隔离。如果你改为设置 `sessionScope: "user"`，完整消息流量会按发送者分散（每个成员一个独立会话），这不适合群组完整消息场景。

其他共享作用域并不是等价替代。`sessionScope: "chat_thread"` 对群组消息的路由方式与 `"thread"` 完全相同（QQ 不提供线程 id，所以两者都以 `<channel>:<chatId>` 为键），但它对**所有**聊天都被视为共享：每条私聊都变成受 `operators` 门控的共享会话，因此私聊中的 `/clear` 会被拒绝，私聊中提出的工具调用也无人可以应答。`sessionScope: "single"` 同样共享私聊，并且还将**每个**群组和**每条**私聊都以唯一的上下文 `<channel>:__single__` 为键，因此群组 A 的历史会与群组 B 和私聊历史一起被回复——这正是本节所讨论的跨群组泄露问题。当 `groupAllPolicy` 为 `"keyword"` 或 `"all"` 且作用域不是 `"thread"` 时，频道会在启动时发出警告。启用 `multiSession` 后，作用域被固定为 `"user"`，因此该警告会将这两个设置列为互斥，并告知操作员更改 `groupAllPolicy` 或关闭 `multiSession`，而不再建议设置为 `"thread"`。

**从旧版 QQ 频道升级。** 默认作用域已从 `"user"` 改为 `"thread"`。（配置了 `groupAllPolicy: "keyword"` 或 `"all"` 的频道之前会被强制为 `"single"`——一个全局会话。未固定 `sessionScope` 的频道现在会解析为 `"thread"`，除非 `multiSession` 已开启，此时会解析为 `"user"`——每个发送者的会话是 `multiSession` 唯一支持的形态，因此它优先于插件默认值；对于没有 `multiSession` 的频道，实际变化是从那个全局会话变为每个群组一个会话。明确固定了 `sessionScope` 的频道不再被覆盖，因此显式的 `"user"` 现在会生效，并将群组完整消息流量按发送者分散——请手动将其改为 `"thread"`。）旧版会话路由不会被自动删除：当 `purgeLegacySessions` 关闭时，每次启动都会统计清理所覆盖的路由数量——单作用域时代的 `<channel>:__single__` 键和该频道的旧版用户作用域 `<channel>:<senderId>:<chatId>` 键——并保持它们及其守护进程侧的会话不变。`chat_thread` 时代的 `<channel>:<chatId>:<threadId>` 路由不在覆盖范围内：它既不会被统计也不会被清理。要删除被覆盖的路由，请在频道上将 `purgeLegacySessions` 设置为 `true`。启用后，每个这样的路由都会被释放，其守护进程侧的会话被丢弃，因此旧的对话映射将不再存在；只要该选项保持开启，清理就会在每次启动时运行。除非救援副本写入磁盘，否则不会删除任何内容：在第一次删除之前，频道会将即将删除的路由追加到频道状态目录中的 `<channel>-sessions-purged.json`（例如 `~/.qwen/channels/my-qq-sessions-purged.json`；频道名称中不在 `A-Za-z0-9_-` 范围内的字符会变为 `_`），如果该写入失败，则不删除任何内容并保持路由不变。该文件仅在实际发生删除时才会写入——在什么都不动的启动时永远不会写入。它是一个清理记录的 JSON 列表，每条记录包含其 `purgedAt` 时间戳、`sessionScope` 和 `routes`；每个路由携带其 `kind`、`key`、`sessionId`、`target`，以及——当路由器的持久化会话状态仍然记录了它们时——`cwd`、`turns`、`startedAt`、`isolation` 和 `workspaceCwd`。记录是追加而非覆盖的，因此早期清理的记录会在后来的清理中保留下来（一旦列表超过 20 条，最旧的记录会被丢弃）；无法读取或不包含清理记录列表的文件会在日志中报告，并被重命名为同级的 `<path>.corrupt-<timestamp>` 文件，然后才写入新记录，因此损坏的副本会被保留以供手动恢复，新记录也永远不会丢失。这只是路由元数据——不包含对话内容——因此它可以显示被删除的内容，并让你手动重新创建映射：记录中包含 `cwd` 且没有 `isolation` 的路由在恢复时会解析到同一个工作区；当记录还携带 `isolation: "worktree"` 时，`cwd` 是（通常已被移除的）每个会话的 worktree，因此请对照记录的 `workspaceCwd` 进行恢复并保持 `isolation`，以便路由器通过托管加载路径重新附加它。当路由的存储状态没有 `cwd` 时（条目缺失，或早于该字段），记录会简单地省略 `cwd` 而不是猜测，因此手动恢复这样的路由也需要频道的工作区路径。在清理之后设置 `sessionScope: "user"` **不会**自动恢复旧的对话——那些路由已经被删除，不会自动恢复。

有关群组策略和提及门控的完整详情，请参见[群聊](./overview#group-chats)。

## Markdown 支持

QQ Bot 频道支持 Markdown 格式（`msg_type=2`）。智能体的 Markdown 回复会原样发送，QQ 会以富文本格式（加粗、斜体、代码块、链接、列表）渲染。

如果 QQ 服务器因任何原因拒绝 Markdown 消息，频道会自动以纯文本重试——因此即使机器人的 Markdown 能力在服务端受限，消息也始终能送达。

这与微信频道相反（微信会去除所有 Markdown）。在 QQ 频道中，你可以让智能体自由使用 Markdown。

## 图片、视频、文件与语音

用户可以向机器人发送图片、视频、文件和语音消息。图片会作为视觉输入传递给智能体，因此智能体能看到图片本身——截图、错误信息和图表都可以——同时该文件也会保存到临时本地路径，以备模型无法处理图片时使用。视频、文件或语音消息会保存到临时本地路径，并告知智能体该路径。

媒体消息不需要任何文本——纯图片、纯视频、纯文件或纯语音消息即可开始一个轮次，频道会使用 `(image)`、`(video)`、`(file)` 或 `(voice)` 作为占位符。当消息包含文本时，该文本会作为说明文字保留。

文件是指平台以 `content_type: file` 形式交付的任何内容——Word 文档、PDF、电子表格、压缩包、源文件。QQ 不报告文件的 MIME 类型，因此频道保留发送方自带的扩展名（仅限字母和数字，没有扩展名时回退为 `.bin`），并将字节保存到系统临时目录下的 `channel-files/<uuid>/` 中；智能体的读取工具会根据该扩展名决定如何打开文档。

语音消息以 `content_type: voice` 的形式到达。除了原始的 SILK URL，QQ 还会提供 `voice_wav_url`——同一段音频已转换为 WAV 格式——频道优先使用它；当平台未提供时，频道回退到原始 URL。字节保存到 `channel-files/<uuid>/` 下，文件名为 `qq_voice.wav`（使用了 WAV URL 时）或 `qq_voice.silk`（使用了原始 SILK URL 时），并告知智能体该路径。平台的 ASR 文本不会被使用；智能体基于保存的音频文件进行工作。

- 图片限制为 8 MB，视频、文件和语音消息限制为 20 MB，每条消息最多处理五个附件。超出限制的内容会被跳过并记录到频道的 stderr。
- 下载的文件不会被删除。它们保留在系统临时目录下，由系统按自己的计划清理。

图片输入需要支持图片的模型。当模型是多模态但未被按名称识别时，需声明该能力。该字段应放在提供该模型的 provider 条目上，因为顶层的 `model.generationConfig` 值对于 provider 支持的模型会被忽略：

```json
{
  "modelProviders": {
    "openai": [
      {
        "id": "your-model-id",
        "baseUrl": "https://example.invalid/v1",
        "generationConfig": {
          "modalities": { "image": true }
        }
      }
    ]
  }
}
```

使用纯文本模型时，智能体会收到"不支持的图片"提示以及保存的路径，而非图片本身。

不支持向 QQ 发送图片、视频、文件或语音消息。

## Token 管理

访问令牌约 2 小时后过期。频道会在其 TTL 达到 80%（约 1.6 小时）时自动刷新。如果刷新失败，会在 60 秒后重试。

Token 刷新会跨越 WebSocket 重连持续进行——只要 AppID 和 AppSecret 有效，频道就不会因令牌过期而离线。

## 连接韧性

- **自动重连：** WebSocket 断开后，频道会以指数退避方式重试（最多 20 次，每次重试间隔最大 30 秒）
- **会话恢复：** 如果 WebSocket 短暂断开，频道会使用 QQ 的 `RESUME` opcode 恢复会话，不会丢失正在传输的消息
- **跨服务器上下文延续：** 聊天会话和路由状态会持久化到磁盘。如果守护进程重启，对话可从断点继续
- **心跳监控：** 检测到 HEARTBEAT_ACK 超时会强制重连，避免僵尸连接
- **消息去重：** 重连后重播的消息会被检测并跳过

## 提示

- **自由使用 Markdown** — 与微信不同，QQ 原生渲染 Markdown。加粗、代码块、列表和链接均有效。
- **回复控制在 2000 字符以内** — 超过长度限制的回复会自动拆分。在指令中添加长度提示有助于智能体保持简洁。
- **沙箱用于测试** — 设置 `"sandbox": true` 在开发阶段使用沙箱 API，不会影响生产消息。
- **限制访问** — 使用 `privatePolicy: "allowlist"` 限制为固定的 QQ 用户，或使用 `"pairing"` 通过 CLI 批准新用户。详见[私聊配对](./overview#dm-pairing)。

## 与 Telegram 的主要区别

| 领域           | QQ Bot                                      | Telegram                                      |
| -------------- | ------------------------------------------- | --------------------------------------------- |
| 身份认证       | 二维码登录或 AppID/AppSecret                | BotFather 提供的静态 Bot Token                |
| Markdown       | 原生 QQ Markdown，平替为纯文本              | 从智能体 Markdown 转为 HTML 格式              |
| Token 生命周期 | 2 小时 TTL，80% 时自动刷新                  | 永久 Bot Token                                |
| 群消息         | 仅 @提及 的消息会投递给机器人                | 机器人能看到所有消息（关闭隐私模式时）        |
| 输入状态指示   | 不支持（QQ API 限制）                       | "正在输入..." 消息                            |
| 沙箱模式       | 支持测试                                     | 不支持                                        |

## 故障排查

### 机器人不响应

- 检查终端输出中的错误
- 确认频道正在运行（`qwen channel status`）
- 如果使用了 `privatePolicy: "allowlist"`，请确认你的 QQ 用户 ID 在 `allowedUsers` 中
- 首次启动时终端会显示二维码——用你的 QQ 应用扫描

### 机器人在群中不响应

- 检查 `groupPolicy` 是否设为 `"allowlist"`、`"pairing"` 或 `"open"`（默认为 `"disabled"`）
- 如果使用 `"pairing"`，请确认该群组的配对请求已被批准
- **你必须 @提及 机器人** —— QQ 只投递标记了机器人的消息
- 确认机器人已添加到群组

### 二维码登录卡住

- 二维码显示在终端中。请用你的 QQ 手机应用（我 → 扫一扫）扫描
- 如果二维码过期（通常几分钟后），重新启动频道以获得新二维码

### Markdown 消息显示为纯文本

- QQ 服务器可能拒绝了 Markdown 消息，频道静默降级为纯文本。检查终端中是否有 `"Markdown rejected"` 日志消息
- 这在 QQ Bot 开放平台中不常见，但如果机器人的 Markdown 能力在服务端受限时可能发生

### 长时间离线后 Token 过期

- 如果频道离线超过 2 小时，访问令牌将会过期。频道在重连时会获取新令牌——无需操作
- 如果 AppSecret 本身无效（例如在开发者后台轮换过），请更新 `appSecret` 字段，或删除 `~/.qwen/channels/<name>-credentials.json` 以重新触发二维码登录