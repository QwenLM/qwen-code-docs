# 微信 (Weixin)

本指南介绍如何通过官方 iLink Bot API 在微信上配置 Qwen Code 频道。

## 前置条件

- 一个支持扫描二维码的微信账号（手机端）
- 能够访问 iLink Bot 平台（微信官方 Bot API）

## 配置步骤

### 1. 通过二维码登录

微信使用二维码认证，而非静态 Bot Token。运行以下登录命令：

```bash
qwen channel configure-weixin
```

该命令将显示一个二维码 URL。使用微信手机端扫描该二维码完成认证。你的凭证将保存至 `~/.qwen/channels/weixin/account.json`。

### 2. 配置频道

将频道配置添加到 `~/.qwen/settings.json`：

```json
{
  "channels": {
    "my-weixin": {
      "type": "weixin",
      "senderPolicy": "pairing",
      "allowedUsers": [],
      "sessionScope": "user",
      "cwd": "/path/to/your/project",
      "model": "qwen3.5-plus",
      "instructions": "You are a concise coding assistant responding via WeChat. Keep responses under 500 characters. Use plain text only."
    }
  }
}
```

注意：微信频道不使用 `token` 字段——凭证来自二维码登录步骤。

### 3. 启动频道

```bash
# 仅启动微信频道
qwen channel start my-weixin

# 或同时启动所有已配置的频道
qwen channel start
```

打开微信并向 Bot 发送消息。在 Agent 处理期间，你应该会看到输入指示器（“...”），随后会收到回复。

## 图片与文件

除了文本，你还可以向 Bot 发送照片和文档。

**图片：** 发送图像（截图、照片等），Agent 将使用其视觉能力进行分析。这需要多模态模型支持——请在频道配置中添加 `"model": "qwen3.5-plus"`（或其他支持视觉的模型）。在图片下载和处理期间，会显示输入指示器。

**文件：** 发送 PDF、代码文件或任何文档。Bot 会从微信 CDN 下载并解密文件，保存到本地，随后 Agent 会使用文件工具读取它。此功能适用于任何模型。

## 配置选项

微信频道支持所有标准频道选项（参见 [Channel Overview](./overview#options)），此外还支持：

| 选项      | 描述                                                                           |
| --------- | ------------------------------------------------------------------------------ |
| `baseUrl` | 覆盖 iLink Bot API 的基础 URL（默认值：`https://ilinkai.weixin.qq.com`）       |

## 与 Telegram 的主要区别

- **认证方式：** 使用二维码登录，而非静态 Bot Token。会话可能会过期——若发生此情况，频道将暂停运行并记录日志。
- **格式支持：** 微信仅支持纯文本。Agent 回复中的 Markdown 格式会被自动移除。
- **输入指示器：** 微信原生支持“...”输入指示器，而非显示“Working...”文本消息。
- **群聊：** 微信 iLink Bot 仅支持私聊（DM）——不支持群聊。
- **媒体加密：** 图片和文件在微信 CDN 上使用 AES-128-ECB 加密。频道会透明处理解密过程。

## 使用建议

- **使用纯文本指令** —— 由于微信会移除所有 Markdown 格式，建议在指令中添加“仅使用纯文本”（Use plain text only），以避免 Agent 生成格式混乱的回复。
- **保持回复简短** —— 微信消息气泡更适合简洁的文本。在指令中添加字符数限制会有所帮助（例如：“回复控制在 500 字符以内”）。
- **会话过期** —— 如果在日志中看到“Session expired (errcode -14)”，说明你的微信登录已过期。请停止频道并重新运行 `qwen channel configure-weixin` 进行登录。
- **限制访问** —— 使用 `senderPolicy: "pairing"` 或 `"allowlist"` 来控制谁可以与 Bot 对话。详见 [DM Pairing](./overview#dm-pairing)。

## 故障排查

### "WeChat account not configured"

请先运行 `qwen channel configure-weixin` 通过二维码登录。

### "Session expired (errcode -14)"

你的微信登录会话已过期。请停止频道并再次运行 `qwen channel configure-weixin`。

### Bot 无响应

- 检查终端输出是否有错误信息
- 确认频道正在运行（`qwen channel start my-weixin`）
- 如果使用了 `senderPolicy: "allowlist"`，请确保你的微信用户 ID 已添加到 `allowedUsers` 中

### 图片无法使用

- 确保频道配置中的 `model` 支持视觉能力（例如 `qwen3.5-plus`）
- 检查终端是否有 CDN 下载错误——这通常表明存在网络问题