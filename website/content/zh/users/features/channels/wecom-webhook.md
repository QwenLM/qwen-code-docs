# WeCom Webhook 发送

使用内部 WeCom 群的消息推送 webhook（旧称群机器人）发送通知和任务结果。这只需要群的 webhook URL，无需 Bot ID/Secret、应用凭据、长连接或公共入站服务器。与 agent 对话请使用 [WeCom 智能机器人](./wecom)；自建应用请参考 [WeCom Callback](./wecom-callback)。

## 创建群目标

1. 打开内部 WeCom 群的设置，找到消息推送。
2. 创建自定义消息推送，复制其 webhook URL，以 `https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=` 开头。
3. 如果入口不可用，请检查组织的创建权限。管理员可以限制哪些成员可以创建消息推送，群主管理的群可以将入口限制为仅群主可用。

此设置不支持外部群。官方创建条件描述的是内部群和管理员权限，并未建立通用的企业认证要求或豁免。

URL 包含发送凭据。请将其保存在 Channel 配置或环境变量中，切勿放在任务 prompt 或 delivery target 中。使用 WeCom 签发的原始 URL。本地验证仅允许一个 `key` 参数，包含字母、数字、`-`、`.`、`_` 或 `~`；不接受百分号编码、片段和额外参数。没有单独的签名密钥。

## 配置 Channel

在 [Web Shell](#use-web-shell) 或 `settings.json` 中按以下方式配置此集成。

将命名实例添加到 workspace 的 Channel 设置中：

```json
{
  "channels": {
    "team-notices": {
      "type": "wecom-webhook",
      "webhookUrl": "$WECOM_WEBHOOK_URL"
    }
  }
}
```

在启动 Qwen Code 的环境中设置 `WECOM_WEBHOOK_URL`，然后在该 workspace 中运行 daemon：

```bash
qwen serve --channel team-notices
```

一个命名实例代表一个群。为其他群创建额外实例。更改实例的 URL 会影响通过它的后续 delivery。

启动使 Channel 在本地准备好发送。它不会发送测试消息或验证远程凭据。停止会取消进行中的发送；重启或重新加载会应用已保存的配置更改。

## 使用 Web Shell

如果你的构建包含后端支持但早于 Web 集成，Channels 不会列出此方法或现有的 `wecom-webhook` 实例。请继续使用上述 `settings.json` 和 `qwen serve --channel` 步骤，直到升级到包含 Web 集成的构建。

在 Channels 中，选择 WeCom，然后选择 Webhook（仅发送）。选择 workspace，保存 webhook URL 并启动 Channel。无需签名密钥。接收、配对和 agent 会话设置不适用于此方法。智能机器人方法保留在 WeCom 下；WeCom Callback 保留其单独入口。

在 Scheduled Tasks 中，选择持久化任务会话并选择此 Channel 作为 delivery 目标。Web Shell 会自动填充其配置的群；无需观察到的联系人或手动输入的 chat ID。现有的每次运行和手动触发 delivery 限制仍然有效。

当宿主启用 Channels 和 Scheduled Tasks 并提供 daemon workspace 时，可通过 `WebShellWithProviders` 使用相同的控制。

## 显式 API delivery

Notify 和显式 prompt/scheduled delivery 使用现有的 Channel target。此 adapter 拥有一个逻辑目标 `chat/default`：

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

这是一个 workspace Notify 请求体。`default` 命名已配置的群；它不是 WeCom chat ID。其他 ID、用户目标和线程会被拒绝。任务存储逻辑目标；凭据保留在 Channel 设置中。

持久化 scheduled tasks 使用相同的目标。Delivery 保留现有的尽力交付成功最终结果行为，包括当前的每次运行和手动触发限制。

## 消息格式和限制

- 以原始文本发送 `markdown_v2`。其支持的子集包括标题、列表、链接、围栏代码和表格；普通文本、中文和 emoji 是有效输入。不保证完全兼容 GitHub 风格的 Markdown。
- 此格式不支持 @提及或字体颜色标记。adapter 不发送 mention 数组，也不会将任务文本转换为提及。类似提及的字符串（如 `< @all>`）保留在正文中。
- 4.1.36 之前的客户端（Android 4.1.38 之前）将消息显示为纯文本。请使用当前客户端进行 Markdown 渲染。
- 最终的 **content** 限制为 **4096 UTF-8 字节**，在 JSON 转义之前计算。中文和 emoji 占用的字节数多于 ASCII。这不是 4096 字符的限制，也不是对整个 JSON 请求的限制。
- 超大内容会在发送前显式失败。adapter 不会静默截断、自动拆分或重试。在平台特定检查之前，共享的 delivery 边界仍然适用。
- WeCom 允许**每个 webhook 每分钟 20 条消息**。保持 scheduled reports 简洁并避免突发；被限流的 delivery 会报告失败而不会排队。

## 失败和传输

同时检查 HTTP 状态和 WeCom 数字 `errcode`。无效或禁用的凭据、被拒绝的群目标和速率限制会产生可观察的失败。诊断信息省略 URL、key、消息内容和原始 provider 错误文本。

每次尝试最多发出一个请求，超时时间为 15 秒。API 接受不是已读回执；超时或取消可能导致远程接受状态未知。传输遵循已解析的 workspace proxy 和现有的 `NO_PROXY` 行为。

此模式不接收消息、运行入站 webhook 任务或启动 Channel 循环。它不添加附件、交互卡片、自动失败/取消警报、持久重试或通用 webhook 协议。

有关当前平台要求，请参阅官方[消息推送协议](https://developer.work.weixin.qq.com/document/path/91770)和[设置指南](https://open.work.weixin.qq.com/help2/pc/14931)。