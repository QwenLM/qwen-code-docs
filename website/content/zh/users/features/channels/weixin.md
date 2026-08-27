# 微信 (WeChat)

本指南介绍如何通过官方 iLink Bot API 在微信上配置 Qwen Code 频道。

## 前置条件

- 一个可扫描二维码的微信账号（移动端应用）
- 可访问 iLink Bot 平台（微信官方机器人 API）

## 配置步骤

### 1. 通过二维码登录

微信使用二维码认证而非静态机器人 token。运行以下登录命令：

```bash
qwen channel configure-weixin
```

该命令会显示一个二维码 URL。使用微信移动端应用扫描二维码完成认证。认证凭据会保存到 `~/.qwen/channels/weixin/account.json`。

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

注意：微信频道不使用 `token` 字段——认证凭据来自二维码登录步骤。

### 3. 启动频道

```bash
# 仅启动微信频道
qwen channel start my-weixin

# 或同时启动所有已配置的频道
qwen channel start
```

打开微信并向机器人发送消息。您应该会看到输入状态指示符（"..."）在代理处理消息时出现，随后显示回复。

## 图片与文件

您可以向机器人发送照片和文档，而不仅仅是文本。

**图片：** 发送图片（截图、照片等），代理将利用其视觉能力进行分析。这需要多模态模型——在频道配置中添加 `"model": "qwen3.5-plus"`（或其他支持视觉的模型）。当图片下载和处理时，会显示输入状态指示符。

**文件：** 发送 PDF、代码文件或任何文档。机器人会从微信 CDN 下载并解密文件，保存到本地，代理再使用文件工具读取。此功能适用于任何模型。

## 配置选项

微信频道支持所有标准频道选项（参见[频道概览](./overview#options)），此外还支持：

| 选项名     | 描述                                                              |
| ---------- | ----------------------------------------------------------------- |
| `baseUrl`  | 覆盖 iLink Bot API 的基础 URL（默认值：`https://ilinkai.weixin.qq.com`） |

## 与 Telegram 的关键区别

- **认证方式：** 二维码登录而非静态机器人 token。会话可能会过期——过期时频道会暂停并记录一条消息。
- **格式：** 微信仅支持纯文本。代理回复中的 Markdown 会被自动移除。
- **输入状态指示符：** 微信原生支持"..."输入状态指示符，而非"正在工作……"的文本消息。
- **群组：** 微信 iLink Bot 仅支持私聊——不支持群聊。
- **媒体加密：** 图片和文件在微信 CDN 上使用 AES-128-ECB 加密。频道会自动处理解密过程。

## 使用技巧

- **使用纯文本指令**——由于微信会移除所有 Markdown，请添加类似"仅使用纯文本"的指令，避免代理生成格式杂乱的回复。
- **保持回复简短**——微信消息气泡适合简洁的文本。在指令中添加字符限制会有帮助（例如"保持回复在 500 字符以内"）。
- **会话过期**——如果在日志中看到"Session expired (errcode -14)"，表明微信登录已过期。停止频道并重新运行 `qwen channel configure-weixin` 来重新登录。
- **限制访问**——使用 `senderPolicy: "pairing"` 或 `"allowlist"` 来控制可以与机器人对话的成员。详情请参阅[私聊配对](./overview#dm-pairing)。

## 故障排除

### "WeChat account not configured"

请先运行 `qwen channel configure-weixin` 通过二维码登录。

### "Session expired (errcode -14)"

您的微信登录会话已过期。停止频道并重新运行 `qwen channel configure-weixin`。

### 机器人无响应

- 检查终端输出中的错误信息
- 确认频道正在运行（`qwen channel start my-weixin`）
- 如果使用了 `senderPolicy: "allowlist"`，请确保您的微信用户 ID 在 `allowedUsers` 中

### 图片无法正常使用

- 确保频道配置中使用了支持视觉的 `model`（例如 `qwen3.5-plus`）
- 检查终端中的 CDN 下载错误——可能表明存在网络问题