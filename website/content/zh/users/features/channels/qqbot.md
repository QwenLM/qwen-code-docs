# QQ 机器人

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
      "senderPolicy": "open",
      "sessionScope": "user",
      "cwd": "/path/to/your/project",
      "instructions": "你是一个通过 QQ Bot 对话的 AI 助手。回复控制在 2000 字符以内。",
      "blockStreaming": "on",
      "groupPolicy": "disabled",
      "groups": {
        "*": { "requireMention": true }
      }
    }
  }
}
```

### QQ 特有选项

| 选项          | 默认值    | 描述                                                                 |
| ------------- | --------- | -------------------------------------------------------------------- |
| `appID`       | —         | 来自开发者后台的 QQ Bot AppID。如省略，则使用二维码登录。            |
| `appSecret`   | —         | QQ Bot AppSecret。支持 `$ENV_VAR` 语法。如省略，则使用二维码登录。   |
| `sandbox`     | `false`   | 设为 `true` 以使用 QQ 沙箱 API 环境（`sandbox.api.sgroup.qq.com`）   |

所有标准频道选项（见[频道概览](./overview#options)）同样支持：
`senderPolicy`、`allowedUsers`、`sessionScope`、`cwd`、`instructions`、`groupPolicy`、`groups`、`dispatchMode`、`blockStreaming`、`blockStreamingChunk`、`blockStreamingCoalesce`。

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

1. 在频道配置中将 `groupPolicy` 设置为 `"allowlist"` 或 `"open"`
2. 通过 QQ Bot 开放平台后台或让群管理员邀请，将机器人添加到 QQ 群
3. 群成员必须 **@提及** 机器人才能触发回复

QQ Bot API V2 仅投递 @提及 了机器人的群消息——机器人看不到所有群消息。默认情况下 `requireMention` 为 `true`，在 QQ 上应保持此设置。

完整群组策略和提及限制说明请参见[群聊](./overview#group-chats)。

## Markdown 支持

QQ Bot 频道支持 Markdown 格式（`msg_type=2`）。智能体的 Markdown 回复会原样发送，QQ 会以富文本格式（加粗、斜体、代码块、链接、列表）渲染。

如果 QQ 服务器因任何原因拒绝 Markdown 消息，频道会自动以纯文本重试——因此即使机器人的 Markdown 能力在服务端受限，消息也始终能送达。

这与微信频道相反（微信会去除所有 Markdown）。在 QQ 频道中，你可以让智能体自由使用 Markdown。

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
- **限制访问** — 使用 `senderPolicy: "allowlist"` 限制为固定的 QQ 用户，或使用 `"pairing"` 通过 CLI 批准新用户。详见[私聊配对](./overview#dm-pairing)。

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
- 如果使用了 `senderPolicy: "allowlist"`，请确认你的 QQ 用户 ID 在 `allowedUsers` 中
- 首次启动时终端会显示二维码——用你的 QQ 应用扫描

### 机器人在群中不响应

- 检查 `groupPolicy` 是否设为 `"allowlist"` 或 `"open"`（默认为 `"disabled"`）
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