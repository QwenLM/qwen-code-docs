# 飞书 Webhook 发送

使用飞书自定义机器人向群组发送通知和任务结果。
此方法需要 webhook URL，以及（如果在机器人上启用）签名密钥。
它不需要应用、长连接或入站服务器。
与代理对话，请使用[飞书应用机器人](./feishu)。

## 创建机器人

1. 在目标飞书群组中添加自定义机器人。
2. 复制 webhook URL，以
   `https://open.feishu.cn/open-apis/bot/v2/hook/` 开头。
3. 配置机器人的安全设置。如果启用了签名验证，
   还需复制签名密钥。关键词和 IP 限制仍然适用。

URL 中包含凭据。请将其保存在 Channel 配置或环境变量中，
不要放在任务提示或送达目标中。此集成支持
`open.feishu.cn`；不包含 Lark 端点。

使用飞书签发的原始 URL。本地验证需要一个 token
路径段，包含字母、数字、`-`、`.`、`_` 或 `~`，
不含百分号编码、查询参数或片段。

## 配置 Channel

在 [Web Shell](#use-web-shell) 或 `settings.json` 中配置此集成，
如下所示。

向工作区的 Channel 设置添加命名实例：

```json
{
  "channels": {
    "team-notices": {
      "type": "feishu-webhook",
      "webhookUrl": "$FEISHU_WEBHOOK_URL",
      "signingSecret": "$FEISHU_WEBHOOK_SECRET"
    }
  }
}
```

在启动 Qwen Code 的环境中设置这些变量。如果机器人不需要签名，
省略 `signingSecret`。使用自定义机器人的签名密钥，
而非应用的 App Secret。

在该工作区中运行守护进程：

```bash
qwen serve --channel team-notices
```

一个命名实例代表一个群组。为其他群组创建额外实例。
更改实例的 URL 会改变引用它的后续送达的目标。

启动 Channel 使其在本地准备好发送；它不会发送测试消息
或验证远程凭据。停止会取消进行中的发送。重启
或重新加载会应用已保存的配置更改。

## 使用 Web Shell

在 Channels 中，选择 Feishu，然后选择 Webhook（仅发送）。选择工作区，
保存 webhook URL 和可选的签名密钥，然后启动 Channel。
接收、配对和代理会话设置不适用于此方法。
应用机器人方法在同一飞书平台下仍然可用。

在 Scheduled Tasks 中，选择持久化任务会话并选择此 Channel
作为送达目标。Web Shell 会自动填充其配置的群组；
不需要观察到的联系人或手动输入的聊天 ID。现有的每次运行
和手动触发送达限制仍然有效。

当宿主启用 Channels 和 Scheduled Tasks 并提供守护进程工作区时，
可通过 `WebShellWithProviders` 使用相同的控制。

## 显式 API 送达

Notify 和显式提示/计划送达使用现有的 Channel 目标格式。
此适配器拥有一个逻辑目的地 `chat/default`：

```json
{
  "text": "# Daily report\n\nThe checks passed.",
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

这是一个工作区 Notify 请求体。`default` 是配置群组的别名，
不是飞书聊天 ID。其他 ID 和用户目标会被拒绝。端点
和签名密钥保留在 Channel 配置中。

持久化计划任务使用相同的目标元组。送达保留
现有的尽力而为成功最终结果行为，包括当前每次运行
和手动触发限制。

## 消息格式和限制

- 以静态 schema 2.0 卡片发送纯文本和 Markdown。标题、列表、
  链接、围栏代码、表格、中文和表情符号仍然是有效输入。卡片没有
  按钮、流式更新或重复的预览摘要。
- 使用飞书的 Markdown 子集；不保证完全兼容 GitHub 风格 Markdown。
  表格在同一卡片内使用独立元素。飞书
  在每个表格五个数据行后分页。
- 使用数字 HTML 实体转义完整的 `<at ...>` 和 `</at>` 标签，
  以便任务提供的提及标记作为字面文本发送。这也适用于
  代码示例内。不支持可配置提及和收件人查找。
  应在群组中检查客户端渲染和通知行为。
- 对**完整的序列化 UTF-8 JSON 请求**（包括转义、
  卡片结构和可选签名）检查 **20,000 字节的本地预算**。
  飞书的自定义机器人指南说明 20 KB 但未指定确切字节数；
  此保守的本地限制不是测量的平台最大值。
- 在发送前拒绝超大请求，并明确标记送达失败。
  适配器不会静默截断、拆分成多个请求或重试。
  共享的送达大小保护在此平台检查之前仍然适用。
  保持报告足够简洁，使完整请求能够适配。

## 失败和传输

同时检查 HTTP 状态和飞书的数字 `code`。关键词、IP、
签名和速率限制拒绝都是可观察的失败。错误信息省略
webhook URL、密钥、消息内容和原始提供者响应。

每次尝试最多发送一个请求，超时时间为 15 秒。超时或
取消可能导致远程接受状态未知。Channel 使用已解析的
工作区代理和现有的 `NO_PROXY` 绕过行为。

此模式不接收消息、运行入站 webhook 任务或启动 Channel
循环。它不添加附件、失败/取消警报、持久重试队列
或通用 webhook 协议。

请参阅官方[自定义机器人指南](https://open.feishu.cn/document/client-docs/bot-v3/add-custom-bot)
和 [Markdown 组件文档](https://open.feishu.cn/document/feishu-cards/card-json-v2-components/content-components/rich-text?lang=zh-CN)
了解平台配置和渲染要求。
