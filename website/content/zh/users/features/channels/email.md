# Email

使用专用邮箱通过 IMAP 向 Qwen Code 发送任务，并通过 SMTP 接收纯文本回复。首次连接会跳过所选文件夹中已有的邮件，后续连接从保存的 UID 游标处继续。

## 配置与启动

为邮箱启用 IMAP 和 SMTP，并将其凭据导出到运行 Qwen Code 的进程环境中。将此 channel 添加到 `settings.json`：

```json
{
  "channels": {
    "agent-mail": {
      "type": "email",
      "address": "agent@example.com",
      "imapHost": "imap.example.com",
      "imapUser": "agent@example.com",
      "imapPassword": "$AGENT_IMAP_PASSWORD",
      "smtpHost": "smtp.example.com",
      "smtpUser": "agent@example.com",
      "smtpPassword": "$AGENT_SMTP_PASSWORD",
      "privatePolicy": "allowlist",
      "allowedUsers": ["you@example.com"],
      "sessionScope": "chat_thread",
      "cwd": "/path/to/workspace"
    }
  }
}
```

运行 `qwen channel start agent-mail`。密码字段支持现有的 `$ENV_VAR` 引用；请勿在设置中保留明文密码。适配器会禁用协议日志，并在不暴露凭据的情况下报告连接失败。

Implicit TLS 默认使用 IMAP 端口 993 和 SMTP 端口 465。如需 STARTTLS，将 `imapSecure` 或 `smtpSecure` 设为 `false`；默认端口分别变为 143 和 587。STARTTLS 和证书验证始终为强制要求。必要时可覆盖 `imapPort` 和 `smtpPort`。对于私有 CA，请在启动 Qwen Code 之前配置 Node 的 `NODE_EXTRA_CA_CERTS`。

| 选项                  | 默认值     | 含义                                                               |
| --------------------- | ---------- | ------------------------------------------------------------------ |
| `folder`              | `INBOX`    | 一个只读 IMAP 文件夹                                               |
| `pollInterval`        | `60000`    | 轮询间隔（毫秒）                                                   |
| `maxMessageBytes`     | `10485760` | 原始邮件最大大小；超过的邮件将被跳过                               |
| `maxAttachmentBytes`  | `5242880`  | 单个附件最大大小；超过的附件将被省略                               |
| `maxTextLength`       | `32000`    | 引用历史/签名裁剪前的最大文本字符数                                |
| `proactiveRecipients` | `[]`       | 允许主动投递的精确裸邮箱地址                                       |

最多转发 16 个附件。PNG、JPEG、GIF 和 WebP 图片使用现有的图片输入；其他文件在任务期间存储在生成的私有路径下。不支持日历和封装的邮件/报告部分。HTML 转换为文本时不加载远程资源。通用的 channel `cwd`、`model`、`instructions` 和 `sessionScope` 选项适用。默认的 `chat_thread` 作用域按发件人和会话线程分离；选择 `single` 则显式共享一个代理会话。

## 访问与回复

`privatePolicy` 支持 `allowlist`（默认）、`open` 和 `disabled`；旧版 `senderPolicy` 也可识别。此初始版本不支持配对。`allowedUsers` 和 `operators` 中的地址会被规范化为小写；显示名称不会授予访问权限。支持裸 ASCII 地址。请使用能过滤伪造邮件的邮箱提供商：发件人白名单无法验证发件人身份。

回复代理的邮件以继续对话。`Message-ID`、`In-Reply-To` 和 `References` 将对话与其发件人关联。回复仅针对该发件人；`Reply-To`、CC、BCC 以及任务内部的地址无法更改 SMTP 收件人。后台任务结果在发起轮次结束后通过保存的已接受会话线程回复。无回复发件人可以启动任务但不会收到响应。代理生成的邮件、自动邮件、邮件列表邮件和投递报告邮件会被忽略。

文本命令如 `/help`、`/status` 和权限回复可在邮件正文中使用。邮件默认为 `followup` 模式并支持 `steer`。`collect` 会被拒绝，因为缓冲的邮件生命周期超过其准入处理器，无法保留单独的持久化完成声明。任务等待期间准入保持活跃。最多可有 32 个普通投递在进行中；额外的一个槽位用于控制回复和繁忙响应。达到容量上限时，新任务会收到在活动任务完成后重新发送的请求。

除非 `proactiveRecipients` 包含精确目标，否则主动投递处于禁用状态。线程化的主动目标还必须解析为已知的、当前允许的发件人/会话线程。未知目标会失败，不会选择其他收件人或创建替代会话线程。适配器保留 256 条最近的回复路由，每条路由最多 64 个标识符，以及 1024 个最近的入站身份。IMAP UID 进度在这些元数据条目过期后继续防止旧投递的重放；被驱逐的会话线程路由在另一封已接受的邮件恢复它之前无法接收主动回复。

## 恢复

状态存储在 `$QWEN_HOME/channels/<workspace>/email-<account-hash>/state.json` 下（默认 QWEN_HOME 为 `~/.qwen`）。channel 名称、规范工作区和邮箱端点/用户/文件夹决定存储位置。只有一个进程可以拥有它。切换账户会建立单独的基线；UIDVALIDITY 变更也会跳过现有文件夹内容。

适配器在启动任务之前持久化一个进行中的 UID，并在每次 SMTP 发送（包括主动发送）之前持久化一个 `outboundPending` 消息 ID。相应操作完成后会移除每条记录。如果进程在执行期间停止或 SMTP 返回不确定的结果，记录将保留。重启时会报告状态路径、待处理的 UID 和传出消息 ID，并拒绝重放它们。停止 channel，检查邮箱和任务副作用，然后仅从状态的 `pending` 数组中移除已调和的 UID，从 `outboundPending` 中移除已调和的传出 ID，之后再重启。保持游标和会话线程元数据完整。不要将删除状态文件作为重试机制：其缺失会创建新基线并跳过现有邮件。

邮件会话线程标识符和准入进度在重启后保留。代理历史恢复遵循 channel 运行时：当前独立的 `channel start` 路径在冷启动时不会恢复其保存的代理会话，而守护进程 worker 会恢复其路由。

代理副作用、SMTP 接受和本地游标无法在一个事务中提交。停止 channel 会在排队的轮次开始代理工作之前阻止它们。已在代理中运行的操作可能仍会完成。此恢复策略避免自动重新执行不确定的工作；它需要操作员在中断后进行调和。损坏/不可读的状态也会阻止启动。旧的附件目录在调和之后、接收新工作之前被移除。

提供商 OAuth、富文本 HTML 输出、邮箱管理、S/MIME、PGP 和日历处理不在本版本范围内。