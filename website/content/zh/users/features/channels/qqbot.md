# QQ Bot（QQ 机器人）

本指南介绍如何通过 QQ Bot 开放平台官方 API 在 QQ 上配置 Qwen Code channel。

## 前提条件

- 一个 QQ 账号（用于手机扫描二维码）

## 配置

### 二维码登录

启动 channel——首次启动会显示一个二维码。使用 QQ 扫描即可激活，无需开发者账号或手动注册。凭证会自动保存并复用。

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
# 使用 QQ 扫描终端中的二维码
```

### 手动配置（开发者平台）

如果你已在 [QQ Bot 开放平台](https://q.qq.com/) 注册了应用，也可以使用开发者平台的凭证：

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

将密钥设置为环境变量：

```bash
export QQ_APP_SECRET=<your-app-secret>
```

## 配置项

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

### QQ 专属选项

| 选项        | 默认值  | 说明                                                                              |
| ----------- | ------- | --------------------------------------------------------------------------------- |
| `appID`     | —       | 开发者平台的 QQ Bot AppID。省略时使用二维码登录。                                  |
| `appSecret` | —       | QQ Bot AppSecret，支持 `$ENV_VAR` 语法。省略时使用二维码登录。                    |
| `sandbox`   | `false` | 设为 `true` 时使用 QQ 沙盒 API 环境（`sandbox.api.sgroup.qq.com`）               |

所有标准 channel 选项（参见 [Channel 概览](./overview#options)）同样适用：
`senderPolicy`、`allowedUsers`、`sessionScope`、`cwd`、`instructions`、`groupPolicy`、`groups`、`dispatchMode`、`blockStreaming`、`blockStreamingChunk`、`blockStreamingCoalesce`。

## 运行

```bash
# 仅启动 QQ channel
qwen channel start my-qq

# 或同时启动所有已配置的 channel
qwen channel start
```

打开 QQ，向机器人发送消息，即可在聊天中看到回复。

## 群聊

在 QQ 群中使用机器人：

1. 在 channel 配置中将 `groupPolicy` 设为 `"allowlist"` 或 `"open"`
2. 通过 QQ Bot 开放平台控制台将机器人添加到 QQ 群，或由群管理员邀请
3. 群成员必须 **@提及** 机器人才能触发回复

QQ Bot API V2 只推送 @提及机器人的群消息——机器人无法看到全部群消息。默认情况下 `requireMention` 为 `true`，QQ 场景下请保持此设置。

完整的群策略和提及门控说明，参见 [群聊](./overview#group-chats)。

## Markdown 支持

QQ Bot channel 支持 Markdown 格式（`msg_type=2`）。Agent 的 Markdown 回复会原样发送，QQ 会以富文本格式渲染（粗体、斜体、代码块、链接、列表）。

若 QQ 服务器因任何原因拒绝 Markdown 消息，channel 会自动降级为纯文本重试，确保消息始终能送达——即使服务器端限制了机器人的 Markdown 能力。

这与微信 channel 相反——微信会去除所有 Markdown。使用 QQ channel 时，可以让 agent 自由使用完整的 Markdown。

## Token 管理

访问 token 约 2 小时后过期。channel 会在 TTL 的 80%（约 1.6 小时）时自动刷新。若刷新失败，60 秒后重试。

Token 刷新在 WebSocket 重连期间持续进行——只要 AppID 和 AppSecret 有效，channel 就不会因 token 过期而下线。

## 连接稳定性

- **自动重连：** WebSocket 断开后，channel 以指数退避策略重试（最多 20 次，最大间隔 30 秒）
- **会话恢复：** WebSocket 短暂断开时，channel 使用 QQ 的 `RESUME` 操作码恢复会话，不丢失进行中的消息
- **跨服务器上下文延续：** 聊天会话和路由状态持久化到磁盘。daemon 重启后，对话从中断处继续
- **心跳监控：** 检测 HEARTBEAT_ACK 超时并强制重连，避免僵尸连接
- **消息去重：** 重连后重放的消息会被检测并跳过

## 使用建议

- **自由使用 Markdown** — 与微信不同，QQ 原生支持 Markdown 渲染。粗体、代码块、列表、链接均可正常显示。
- **回复控制在 2000 字符以内** — 超长回复会自动拆分发送。在 instructions 中加入长度提示有助于 agent 保持简洁。
- **沙盒用于测试** — 开发期间设置 `"sandbox": true` 使用沙盒 API，不影响生产消息。
- **限制访问** — 使用 `senderPolicy: "allowlist"` 限定固定的 QQ 用户，或使用 `"pairing"` 从 CLI 审批新用户。详见 [DM 配对](./overview#dm-pairing)。

## 与 Telegram 的主要差异

| 方面          | QQ Bot                                   | Telegram                                      |
| ------------- | ---------------------------------------- | --------------------------------------------- |
| 认证方式      | 二维码登录或 AppID/AppSecret              | BotFather 颁发的静态 bot token                |
| Markdown      | 原生 QQ Markdown，降级为纯文本兜底        | Agent Markdown 转换为 HTML 格式               |
| Token 生命周期 | 2 小时 TTL，80% 时自动刷新               | 永久 bot token                                |
| 群消息        | 仅推送 @提及机器人的消息                  | 机器人可见所有消息（隐私模式关闭时）           |
| 输入指示器    | 不支持（QQ API 限制）                     | 显示"Working..."消息                          |
| 沙盒模式      | 支持测试用沙盒                            | 不支持                                        |

## 故障排查

### 机器人不响应

- 检查终端输出是否有报错
- 确认 channel 正在运行（`qwen channel status`）
- 若使用 `senderPolicy: "allowlist"`，确认你的 QQ 用户 ID 在 `allowedUsers` 中
- 首次启动时，终端会显示二维码——使用 QQ 扫描

### 机器人在群里不响应

- 检查 `groupPolicy` 是否设为 `"allowlist"` 或 `"open"`（默认为 `"disabled"`）
- **必须 @提及机器人** — QQ 只推送 @机器人的消息
- 确认机器人已被添加到群中

### 二维码登录卡住

- 二维码显示在终端中，使用 QQ 手机端扫描（我 → 扫一扫）
- 若二维码过期（通常几分钟后），重启 channel 获取新二维码

### Markdown 消息显示为纯文本

- QQ 服务器可能拒绝了 Markdown 消息，channel 自动降级为纯文本。检查终端是否有 `"Markdown rejected"` 日志
- 这在 QQ Bot 开放平台上较为少见，但若服务器端限制了机器人的 Markdown 能力则可能出现

### 长时间离线后 token 过期

- 若 channel 离线超过 2 小时，访问 token 将过期。channel 重连时会自动获取新 token，无需手动操作
- 若 AppSecret 本身已失效（如在开发者平台轮换），请更新 `appSecret` 字段，或删除 `~/.qwen/channels/<name>-credentials.json` 以重新触发二维码登录
