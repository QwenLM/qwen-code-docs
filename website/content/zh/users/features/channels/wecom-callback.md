# WeCom 自建应用回调

通过 `wecom-callback` 可以使用企业微信自建应用与 Qwen Code 进行对话。它接收加密的 HTTP 回调并通过应用 API 发送文本回复。对于具有 Bot ID 和 Secret 的智能机器人，请使用独立的 [WeCom WebSocket channel](./wecom)。

## 前提条件

- 需要一位企业微信管理员和一个有权接收消息、发送应用消息的自建应用。
- 企业 Corp ID、应用 Agent ID 和 Secret，以及在应用消息接收设置中配置的回调 Token 和 EncodingAESKey。
- 一个转发到本地监听器的公开 HTTPS 回调 URL。根据租户要求配置应用的可信出站 IP 和可见成员范围。保持 Qwen 主机的时钟同步。

请参阅官方[回调加密](https://developer.work.weixin.qq.com/document/path/90968)和[应用消息 API](https://developer.work.weixin.qq.com/document/path/90236)文档了解平台要求。

## 配置

在 `~/.qwen/settings.json` 中添加一个命名 channel：

```json
{
  "channels": {
    "my-wecom-app": {
      "type": "wecom-callback",
      "corpId": "$WECOM_CORP_ID",
      "agentId": "$WECOM_AGENT_ID",
      "corpSecret": "$WECOM_APP_SECRET",
      "token": "$WECOM_CALLBACK_TOKEN",
      "encodingAESKey": "$WECOM_ENCODING_AES_KEY",
      "webhookHost": "127.0.0.1",
      "webhookPort": 8645,
      "privatePolicy": "allowlist",
      "allowedUsers": ["zhangsan"],
      "sessionScope": "user",
      "groupPolicy": "disabled",
      "cwd": "/path/to/your/project"
    }
  }
}
```

在启动 Qwen Code 的进程中设置这五个环境变量。Agent ID 是正整数**字符串**，如 `"1000002"`。EncodingAESKey 是企业微信控制台中的 43 位密钥。回调 Token 与应用 Secret 和 API 访问令牌不同；Qwen 会自动获取 API 访问令牌。这三个密钥字段在 channel 管理中会被遮蔽。

监听器默认绑定到 `127.0.0.1:8645`，路径固定为 `/wecom/callback`。将公开 URL 转发到该路径，保留其查询字符串和请求体。对于容器部署，显式绑定到可达的网络接口。多个应用需使用不同的 channel 名称和端口。

## 运行与平台验证

1. 运行 `qwen channel start my-wecom-app`。
2. 在自建应用的消息接收设置中，输入以 `/wecom/callback` 结尾的公开 HTTPS URL、Token 和 EncodingAESKey。保存设置；Qwen 会解密并返回验证挑战。
3. 将测试成员加入应用的可见范围，并将其企业微信 User ID 填入 `allowedUsers`。向应用发送文本消息，预期会收到该应用的文本回复。
4. 从 `allowedUsers` 之外的可见成员发送消息，预期不会触发 agent 任务或回复。Qwen 仍会确认回调以避免平台重试。
5. 请求包含中文文本和表情的长回复，预期收到按顺序发送的文本消息，每条不超过平台的 2048 字节限制。
6. 停止 channel 并确认本地监听器已关闭。

如果 URL 验证失败，检查反向代理、回调路径、时钟、Corp ID、Token 和 EncodingAESKey。如果回调到达但回复失败，检查 Agent ID、应用 Secret、应用可见性和可信出站 IP。应用密钥和回调密钥绝不能出现在日志或 issue 中。

## 支持的行为与限制

- 文本私聊和文本回复。共享访问策略、配对、命令、权限和会话适用。使用成员 User ID 配置访问规则。
- 主动消息可以针对单个用户。不支持群组、话题、媒体、应用事件和流式回复。
- 回调在 agent 执行完成前进行身份验证、解密和确认。回复使用应用消息 API，而非回调的同步响应。已接受的消息 ID 在内存中至少抑制五分钟，直至其签名时间戳窗口过期；签名时间戳窗口超出五分钟的请求会失败。被拒绝的发送者不消耗重试缓存容量。
- 进行中的工作不会持久排队。在确认回调后重启进程可能会丢失该任务，重启还会清除重试缓存。

## 无需企业租户的测试

在 `packages/channels/wecom` 目录下运行：

```bash
npx vitest run src/wecom-callback-crypto.test.ts src/wecom-callback-adapter.test.ts src/callback-plugin.test.ts src/WeComAdapter.test.ts
```

测试使用独立发布的 SDK 加密工具、真实的本地回环 HTTP 请求、共享的入站访问检查和模拟的应用 API 响应。它们覆盖握手验证、身份验证失败、重试、接收者隔离、Unicode 分割和关闭场景。测试不需要真实凭证，也不会向企业微信发送消息。上述平台验证步骤仍需用于验证真实租户的公开 URL、权限和网络配置。