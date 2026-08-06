# GitHub

本指南介绍如何设置一个 Qwen Code channel，用于监控 GitHub 通知并响应提及、审查请求、分配和关注的线程活动。

## 前提条件

- 一个具有读取通知和发布评论所需权限的 GitHub 账户
- 使用本地 `gh` 身份验证时，在运行 Qwen Code 的主机上安装 [GitHub CLI](https://cli.github.com/)

当认证账户还需要操作 channel 时，请使用专用的 bot 账户。GitHub 不会为账户自身的活动生成通知，且适配器会忽略自己的评论以防止回复循环。

## 身份验证

要在 Qwen Code 主机上复用 GitHub CLI 登录，请认证 `gh` 并在 channel 配置中显式设置 `useLocalGh: true`：

```bash
gh auth login
```

本地 `gh` 身份验证是账户级别的，可能会暴露该 GitHub 账户可见的所有仓库的通知。仅当 workspace 操作员被信任使用该账户时才启用它。否则，请配置专用的 PAT。

对于 GitHub Enterprise Server，请认证 `baseUrl` 使用的同一主机：

```bash
gh auth login --hostname github.example.com
```

你也可以配置经典个人访问令牌（PAT）。显式的 `token` 会覆盖本地 `gh` 身份验证。PAT 需要以下 scope：

- **notifications** — 读取通知线程
- **public_repo**（私有仓库需要 **repo**）— 发布评论

## 配置

将 channel 添加到 `~/.qwen/settings.json`：

```json
{
  "channels": {
    "my-github": {
      "type": "github",
      "useLocalGh": true,
      "pollInterval": 60000,
      "reasonFilter": ["mention", "review_requested", "assign"],
      "senderPolicy": "allowlist",
      "allowedUsers": ["operator-github-username"],
      "sessionScope": "chat_thread",
      "cwd": "/path/to/your/project",
      "blockStreaming": "off",
      "groupPolicy": "open",
      "groups": {
        "*": { "requireMention": true }
      }
    }
  }
}
```

要使用 PAT 覆盖本地 `gh` 身份验证，请在 channel 中添加 `"token": "$GITHUB_TOKEN"` 并在启动 Qwen Code 前设置环境变量：

```bash
export GITHUB_TOKEN="ghp_your_token_here"
```

认证账户无法触发自身的 channel。如果该账户需要操作 channel，请认证一个单独的 bot 账户，并仅将操作员账户放入 `allowedUsers`。启动时会拒绝仅包含认证账户的允许列表，并在其与其他操作员同时出现时发出警告。

### GitHub Enterprise

对于 GitHub Enterprise Server，请设置 `baseUrl`：

```json
{
  "baseUrl": "https://github.example.com/api/v3"
}
```

本地 `gh` 身份验证需要 HTTPS 的 `baseUrl`，以防止 daemon 主机凭据通过明文 HTTP 发送。

## 配置选项

| 选项                      | 默认值                   | 描述                                                                                        |
| ------------------------- | ------------------------ | ------------------------------------------------------------------------------------------- |
| `token`                   | 未设置                   | 可选的经典 PAT，需要 `notifications` scope；覆盖本地 `gh` 身份验证                          |
| `useLocalGh`              | `false`                  | 显式复用 daemon 主机的账户级别 GitHub CLI 身份验证                                          |
| `pollInterval`            | `60000`                  | 轮询间隔（毫秒）                                                                            |
| `baseUrl`                 | `https://api.github.com` | API base URL（用于 GHE）                                                                    |
| `groupPolicy`             | `"disabled"`             | 必须为 `"open"` 才能接收通知                                                                |
| `senderPolicy`            | `"allowlist"`            | 谁可以触发 bot                                                                              |
| `groups.*.requireMention` | `true`                   | 普通评论需要 @提及；定向通知原因仍会运行                                                    |
| `blockStreaming`          | `"off"`                  | 始终强制为 `"off"`；中间模型片段不会发布；不支持 `"on"`                                     |
| `reasonFilter`            | 未设置                   | 可选的 GitHub 通知原因允许列表                                                              |

使用 `reasonFilter` 过滤掉嘈杂的通知类别，如 `ci_activity` 或 `state_change`。不要使用 `reasonFilter: ["mention"]` 替代 `groups.*.requireMention`：GitHub 的 `mention` 原因在线程级别是粘性的，因此新的 @提及可能会在 `comment`、`subscribed`、`author` 或其他原因下到达，并被跳过。

有效的 `reasonFilter` 值为 `mention`、`review_requested`、`assign`、`author`、`comment`、`ci_activity`、`manual`、`state_change`、`subscribed`、`team_mention`、`security_alert`、`approval_requested`、`invitation`、`member_feature_requested` 和 `security_advisory_credit`。

被过滤的通知在所有接受的工作在轮询窗口完成后才被标记为已读。稍后移除过滤器不会重放 channel 已跳过的通知。

## ⚠️ 安全性

在**公共仓库**上，设置 `senderPolicy: "open"` 允许**任何 GitHub 用户**触发支持的通知原因来提交 prompt，驱动你 `cwd` 中的 agent。这包括读取代码、消耗 token、发布评论以及（根据权限策略）运行工具。

在公共仓库上始终使用 `senderPolicy: "allowlist"` 并显式设置 `allowedUsers`。

允许列表和配对条目遵循**用户名**，而非不可变的账户 ID。如果允许列表中的用户重命名了其 GitHub 账户，请移除旧条目——GitHub 会释放旧用户名供任何人认领，新的持有者将继承允许列表/配对授权。

## 提及检测

适配器通过扫描评论文本和首次接触的 issue 或 PR 正文中的 `@bot-username`（使用不区分大小写的正则表达式）来检测提及。它不单独信任 `reason: "mention"`，因为该值在线程级别是粘性的。其他原因选择审查、分类、关注线程或回退 prompt。

## 工作原理

适配器使用 GitHub 的 Notifications API 作为唤醒信号：

1. **轮询** `GET /notifications` 获取未读线程
2. **枚举** 基于游标时间窗口内通过 `listComments` 获取的评论
3. **在接受工作前持久化**，包括来源信封和去重键
4. **按通知原因分发**：严格提及匹配、pull request 审查、issue 分类、关注线程评论聚合，或逐评论回退
5. **在接受的工作完成后提交轮询窗口**：标记通知为已读并推进游标
6. **首次接触回退**：当没有评论被分发时，可以处理全新的未读 issue/PR 正文；提及通知仍需要实际的正文提及

评论窗口为 `(previousCursor, currentMaxUpdatedAt]`。已接受、运行中和失败的任务存储在 `~/.qwen/channels/<workspace-scope>/` 下，具有私有文件权限。重启时，channel 在再次轮询 GitHub 之前恢复这些任务。失败的任务最多尝试三次，然后变为终态；已取消的任务是终态的，不会重新运行。最终回复已发布、已抑制或排队等待确定不写入重试的任务不会重新运行。

当存在可恢复的任务，或入站任务状态无法读取或写入时，通知游标不会推进。这可以防止崩溃或 agent 失败导致丢失已接受的评论，并保留避免从通知源进行第二次分发所需的去重键。

非评论活动（推送、标签更改）会更新通知的 `updated_at`，但在窗口中不会产生新的评论，因此重新获取的线程会被跳过而不触发 agent。

## 响应反馈

对于已接受的 issue 或 pull request 评论，channel 在 agent 工作时添加 GitHub 的 `👀` 反应，然后在运行完成、失败或取消时移除它。两个操作都是尽力而为的：反应 API 或权限失败会被记录，永远不会阻止最终响应。

### 仅最终输出

GitHub channel 始终强制仅最终交付。适配器将 `blockStreaming` 设置为 `"off"`，因此中间模型片段永远不会作为单独的评论发布，且不支持 `blockStreaming: "on"`。

```json
{
  "blockStreaming": "off"
}
```

如果 GitHub 返回确定的不写入交付失败（如速率限制响应），channel 会将最终回复存储在
`~/.qwen/channels/<workspace-scope>/<channel>-<name-hash>-github-pending-deliveries.json`
中，具有私有文件权限，并在下次 channel 启动时重试。相应的入站任务保持 `reply_pending` 状态，直到该交付成功或达到确定的终态失败。模糊的交付失败不会自动重试，因为 GitHub 可能已创建了评论。

## 已知限制

- **首次启动会跳过现有的未读通知。** 游标在首次启动时初始化为"现在"。在 bot 启动前创建的通知不会被处理，除非线程之后有新活动。
- 如果用户在 bot 的轮询周期之前在 github.com 上将通知标记为已读，bot 将不会处理它。
- bot 不会读取当前轮询窗口之前的评论；`author` 和 `comment` 通知可能会从该窗口中聚合最多 20 条评论。
- 内联 PR 审查评论和审查摘要正文不会被枚举；仅处理 issue/PR 评论。
- 所选凭据必须支持 Notifications API。细粒度 PAT 不支持它；请使用本地 `gh` 身份验证或具有 `notifications` scope 的经典 PAT。

## 启动 Channel

```bash
qwen channel start my-github
```
