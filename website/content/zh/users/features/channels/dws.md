# 钉钉工作区（DWS）

DWS 频道使用已由钉钉工作区 CLI 认证的账号。它可以接收私聊和群聊消息，识别钉钉文档提及通知卡片，并将 agent 的响应发布回原始消息或文档评论。

这与[钉钉机器人频道](./dingtalk)不同。专用应用机器人请继续使用 `type: "dingtalk"`；当 Qwen Code 需要通过已有的 DWS 登录身份操作时，使用 `type: "dws"`。

## 前提条件

在运行 Qwen Code 的主机上安装 DWS CLI 1.0.57 或更新版本，并确保 `dws` 可从该进程的 `PATH` 中解析：

```bash
dws version --format json
```

在同一主机上进行认证：

```bash
dws auth login
dws profile list --format json
dws auth status --format json
```

在无头服务器上，使用 `dws auth login --device`。频道在启动时固定恰好一个已有的 profile。将 `profile` 设置为确切的 profile 名称或 corpId，或省略它以固定标记为 `isCurrent` 的条目。频道对所有 DWS 登录一视同仁，不依赖 `user_id` 元数据。

## 配置

在 `~/.qwen/settings.json` 中添加一个频道：

```json
{
  "channels": {
    "dws-work": {
      "type": "dws",
      "profile": "profile-name-or-corp-id",
      "senderPolicy": "pairing",
      "groupPolicy": "pairing",
      "watchTodos": true,
      "startReaction": "🤔",
      "endReaction": "赞",
      "groups": {
        "*": { "requireMention": true }
      },
      "sessionScope": "chat_thread",
      "cwd": "/path/to/your/project"
    }
  }
}
```

YOLO 审批模式适用于无需交互确认即可运行工具调用的应答机器人：

```json
{
  "channels": {
    "dws-answers": {
      "type": "dws",
      "senderPolicy": "pairing",
      "groupPolicy": "pairing",
      "approvalMode": "yolo",
      "cwd": "/path/to/answer-bot"
    }
  }
}
```

YOLO 模式自动批准每个工具调用。请仅在受信任的机器人账号和工作区中使用。

`startReaction` 是在已接受任务运行时添加的表情字符或钉钉反应名称；省略或为空时使用默认值 `🤔`。`endReaction` 在任务完成、失败或取消后替换起始反应；省略或为空则禁用结束反应。

对于新托管的 DWS 频道，`senderPolicy` 和 `groupPolicy` 默认为 `pairing`。使用频道返回的码批准用户或群组：

```bash
qwen channel pairing approve dws-work CODE
```

`senderPolicy` 控制私聊发送者、文档通知作者、原生待办创建者以及 `open` 或 `allowlist` 群组中的发送者。`groupPolicy` 控制群聊。已批准的配对群组遵循共享频道行为并授权其成员；open 和 allowlist 群组还必须通过 `senderPolicy`。

`groups` 控制提及行为。具体的群组 ID 会覆盖 `"*"`。当 `requireMention: true` 时，只有 @消息才会唤醒频道。当 `requireMention: false` 时，在群组和发送者策略通过后，普通消息也会被接收。

群聊提及优先使用实时个人事件流。频道还会每五秒检查最近的 `@` 消息历史，因此当钉钉从个人事件流中省略外部群的提及时，这些提及可以被恢复。消息在两条路径上按会话和消息 ID 去重。

普通私聊消息也以同样的方式恢复：每五秒的历史检查会重新驱动实时流遗漏的任何私聊消息，在两条路径上按会话和消息 ID 去重。

当一条消息引用了另一条钉钉消息时，引用文本会作为回复上下文提供给 agent，适用于实时路径和历史回退路径。

## 文档提及

没有文档或知识库监控列表。要启动文档任务：

1. 添加一条钉钉文档评论，@提及已认证的账号。
2. 启用向该账号发送钉钉通知的选项。
3. DWS 通过该账号的私聊历史投递通知卡片。

频道从该通知中提取文档 ID、评论键和请求内容。它会读取被引用的文档作为上下文，在任务运行时添加配置的起始反应，并在原始文档评论下回复。当实时 DWS 事件流包含该卡片时使用实时流；每五秒的增量历史检查覆盖当前事件流遗漏的卡片。

不会生成通知的评论会被有意忽略。同一文档评论的重复通知消息只执行一次。文档任务遵循 `senderPolicy`，并支持 `approvalMode` `default`、`plan` 或 `yolo`；省略时使用 `default`。

## 原生待办变更

设置 `watchTodos: true` 以轮询所选 DWS profile 中该账号作为执行者的待处理原生待办。该选项默认为 `false`，因此添加 DWS 频道不会隐式执行已有的待办。

首次成功扫描会建立基线，不会启动历史待办。后续扫描在待办被新分配、重新打开或其可操作字段（包括标题、优先级、截止日期或执行者）发生变更时运行任务。最终响应会作为评论添加到原始待办上。仅评论的元数据和修改时间戳被排除在变更检测之外，因此频道自身的响应不会触发循环。完成或移除会将待办从待处理集中删除；重新打开会创建新的触发。

原生待办使用待办创建者身份遵循 `senderPolicy`。在 `pairing` 下，频道添加一条配对码评论并保持待办为待处理状态；创建者在本地被批准后，后续轮询可以处理未变更的待办。轮询每 30 秒运行一次，并限定在固定 profile 的当前组织范围内。

## 启动与验证

直接运行频道：

```bash
qwen channel start dws-work
```

或让守护进程管理它：

```bash
qwen serve --workspace /path/to/your/project --channel dws-work
```

不要同时运行两种形式，因为它们共享频道服务租约。

进行本地验证时，从另一个账号发送私聊消息，如需要则批准配对，并验证任务运行时配置的起始反应是否出现。如果配置了结束反应，验证它在之后替换了起始反应。然后添加一条启用了 @提及通知的文档评论。频道应当对通知消息做出反应、读取文档，并在原始评论下发布最终答案。禁用通知的评论不应产生任何任务。

频道会忽略 DWS 识别为已认证账号的发送者 ID 的事件，从而防止回复和配对循环，而无需从消息文本推断身份。启动 IM 源需要该权威自身份：如果已认证账号未暴露 openDingTalkId，且同一 profile 下的早期会话也未记录过，频道将拒绝连接。暂时丢失 ID 的重连会继续沿用之前记录的自身发送者 ID 进行过滤。
