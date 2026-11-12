# DingTalk Webhook 发送

使用钉钉自定义机器人向群组发布通知和任务结果。
此发送模式不需要应用机器人、长连接、公共回调服务器或会话 ID。
与代理对话请使用 [DingTalk 应用机器人](./dingtalk)。

## 创建机器人

1. 在目标钉钉群组中添加自定义机器人。
2. 复制其 webhook URL，以
   `https://oapi.dingtalk.com/robot/send?access_token=...` 开头。
3. 配置机器人的安全设置。如果启用了加签，还需复制其加签密钥。关键字和 IP 限制仍然适用于每条消息。

webhook URL 包含凭据。将其存储为密钥或环境变量引用，而不是存储在定时任务的提示或发送目标中。

## 配置 Channel

将命名实例添加到工作区的 Channel 设置中：

```json
{
  "channels": {
    "team-notices": {
      "type": "dingtalk-webhook",
      "webhookUrl": "$DINGTALK_WEBHOOK_URL",
      "signingSecret": "$DINGTALK_WEBHOOK_SECRET"
    }
  }
}
```

在启动 Qwen Code 的环境中设置引用的变量。当机器人不需要加签时省略
`signingSecret`。此密钥是自定义机器人的加签密钥，而非应用的 Client Secret。

在该工作区中运行守护进程：

```bash
qwen serve --channel team-notices
```

一个命名实例代表一个已配置的群组。为其他群组创建额外实例。更新实例的 URL 会改变引用它的后续发送的目标地址。

## 显式 API 发送

Notify 和显式提示/定时发送使用现有的 Channel 目标格式。此适配器将 `chat/default` 定义为唯一的逻辑目标：

```json
{
  "text": "The daily report is ready.",
  "delivery": {
    "kind": "channel",
    "target": {
      "channelName": "team-notices",
      "type": "chat",
      "id": "default"
    }
  }
}
```

这是一个工作区 Notify 请求体。`default` 是适配器拥有的别名，
而非钉钉会话 ID。其他 ID 和用户目标会被拒绝；适配器不会忽略任意请求的目标。webhook URL 和
加签密钥保留在 Channel 配置中。

## 发送行为

- 以 Markdown 格式发送消息，标题取自第一行。
  也接受普通文本。适配器保留提供的 Markdown，
  包括表格语法；渲染由钉钉客户端处理。
- 不接收消息、不运行入站 webhook 任务或启用 Channel 循环。
- 同时检查 HTTP 状态和钉钉的业务响应。签名被拒绝、
  凭据问题、安全规则和速率限制都会作为失败返回，并附带脱敏错误信息。
- 不会自动重试。超时可能导致远程接受状态未知。
- 使用工作区代理配置，包括 `NO_PROXY` 绕过。
- Channel 停止时取消正在进行的发送。重新加载使用更新后的
  已保存配置。
- 保留共享的发送大小保护，该保护会标记截断的结果。
  首个版本将结果作为一条消息发送，并让钉钉拒绝
  超大内容。拒绝会被报告为发送失败；适配器
  不会发送缩短的副本、拆分消息或重试。钉钉的确切
  Markdown 大小限制及其单位尚未验证，因此通过共享
  大小检查并不能保证发送成功。保持定时报告简洁。
- 定时发送保留其现有的尽力交付最终成功结果的
  行为。这不会引入失败/取消警报、持久重试
  队列、附件或通用 webhook 负载契约。

有关平台要求，请参阅钉钉的[发送 API](https://open.dingtalk.com/document/orgapp/custom-robots-send-group-messages)、
[消息类型](https://open.dingtalk.com/document/orgapp/custom-bot-send-message-type)
和[安全设置](https://open.dingtalk.com/document/orgapp/customize-robot-security-settings)。
