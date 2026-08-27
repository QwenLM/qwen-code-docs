# WeCom (企业微信)

本指南介绍如何配置 Qwen Code 接入 WeCom 智能机器人。

## 前提条件

- 一个 WeCom 组织账号
- 一个以 API 模式创建的 WeCom 智能机器人
- 机器人的 Bot ID 和 Secret

## 创建机器人

1. 打开 WeCom 管理后台并创建一个智能机器人。

![](https://gw.alicdn.com/imgextra/i2/O1CN017w1jWj1TTvNBcfya8_!!6000000002384-2-tps-2212-887.png)

2. 选择 API 模式。

![](https://gw.alicdn.com/imgextra/i3/O1CN01buuik0207paQUuLQW_!!6000000006803-1-tps-1276-720.gif)

3. 复制 Bot ID 和 Secret。
4. 将机器人添加到需要使用的单聊或群聊中。

智能机器人使用从 Qwen Code 到 WeCom 的 WebSocket 连接。你无需配置公网回调 URL、Token、EncodingAESKey、Corp ID 或 Agent ID。

## 配置

将 channel 添加到 `~/.qwen/settings.json`：

```json
{
  "channels": {
    "my-wecom": {
      "type": "wecom",
      "botId": "$WECOM_BOT_ID",
      "secret": "$WECOM_SECRET",
      "senderPolicy": "allowlist",
      "allowedUsers": ["zhangsan"],
      "sessionScope": "user",
      "cwd": "/path/to/your/project",
      "instructions": "You are a concise coding assistant responding via WeCom.",
      "groupPolicy": "open"
    }
  }
}
```

将凭证设置为环境变量：

```bash
export WECOM_BOT_ID=<your-bot-id>
export WECOM_SECRET=<your-secret>
```

或者在 `settings.json` 的 `env` 部分中定义它们：

```json
{
  "env": {
    "WECOM_BOT_ID": "your-bot-id",
    "WECOM_SECRET": "your-secret"
  }
}
```

## 运行

```bash
qwen channel start my-wecom
```

打开 WeCom 并向智能机器人发送消息。

## 访问控制

`senderPolicy` 的工作方式与其他 IM 通道相同：

- `allowlist`：仅 `allowedUsers` 中的用户可以使用该机器人。这是推荐的企业默认设置。
- `pairing`：用户必须先完成配对才能使用该机器人。
- `open`：任何可以向机器人发送消息的人都可以使用它。

对于群聊，将 `groupPolicy` 设置为 `"allowlist"`、`"pairing"` 或 `"open"`。在 `"pairing"` 模式下，群聊中首次提及时会创建一个配对请求，需要审批一次后才能开始响应。请注意，在 `groupPolicy: "pairing"` 下，访问权限按群聊授予：一旦某个群聊被批准，**该群聊的任何成员**都可以使用该机器人；`senderPolicy` 和 `allowedUsers` 不会限制已批准群聊的成员。WeCom 仅投递提及智能机器人的群消息，因此每个投递的群回调都被视为已提及。`requireMention` 设置无法启用对未提及群消息的响应，因为这些消息不会投递到机器人。

### 群提及兼容性

早期版本的 Qwen Code 在 WeCom 投递群回调后还会应用通用的 `requireMention` 门控。由于回调不包含单独的提及元数据，`requireMention: true`（包括默认值）可能会拒绝每个已投递的群消息，导致群聊看似无法正常工作。

Qwen Code 现在依赖 WeCom 的提及范围投递，不再应用第二次提及决策。现有的 WeCom 配置中包含 `requireMention: true` 或 `requireMention: false` 仍然有效，不会产生配置错误。这两个值对 WeCom 具有相同的行为，因此可以移除该字段。同一群组条目中的其他设置（如 `dispatchMode`）仍然适用。`groupHistoryLimit` 仍然被接受，但无法收集新的 WeCom 历史，因为未提及的群消息不会被投递。

## 图片与文件

用户可以发送文本、带转录的语音消息、图片、图文混合消息、文件和视频。图片会作为图像附件传递给 agent。文件和视频会被下载到本地临时路径，以便 agent 使用文件工具读取它们。

助手的响应会以 WeCom Markdown 格式发送。要发送由 agent 生成的本地图片，请在代码块外包含以下标记：

```text
[IMAGE: /absolute/path/to/image.png]
```

出于安全考虑，本地图片路径必须位于系统临时目录下的 channel 文件目录中，例如 Linux 上的 `/tmp/channel-files/...`。通用的文件、视频和语音上传标记会被忽略，因为模型生成的文件路径可能会上传任意工作区文件。

## 故障排除

### 机器人无法连接

- 验证 Bot ID 和 Secret。
- 确保机器人是以 API 模式创建的。
- 检查运行 `qwen channel start` 的 shell 中是否可用这些环境变量。

### 机器人在群聊中不响应

- 检查 `groupPolicy`。
- 在群聊中提及机器人。
- 确认机器人已被添加到群聊中。

### 自建应用凭证无效

此 channel 专用于 WeCom 智能机器人。此 channel 不使用自建应用的回调凭证，如 Corp ID、Agent ID、Token 和 EncodingAESKey。