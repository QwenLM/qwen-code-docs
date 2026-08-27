# GitLab

本指南介绍如何设置一个 Qwen Code channel，用于监控 GitLab todos 并响应 issue 和 merge request 上的提及。

## 前提条件

- 一个 GitLab 账户（或专用的 bot 账户）
- 一个具有 `read_api` 和 `api` scope 的 GitLab 个人访问令牌

## 创建令牌

1. 前往 **Preferences → Access Tokens**
2. 创建具有以下 scope 的令牌：
   - **read_api** — 读取 todos 和项目数据
   - **api** — 在 issue/MR 上发布 note（评论）
3. 将令牌安全地保存为环境变量

## 配置

将 channel 添加到 `~/.qwen/settings.json`：

```json
{
  "channels": {
    "my-gitlab": {
      "type": "gitlab",
      "token": "$GITLAB_TOKEN",
      "pollInterval": 60000,
      "senderPolicy": "open",
      "sessionScope": "chat_thread",
      "cwd": "/path/to/your/project",
      "groupPolicy": "open",
      "action_prompt_template": {
        "mentioned": "Project: %project% | URL: %project_url% | Author: %author% | Type: %target_type% | IID: %iid% | Title: %title% | Description: %description% | TodoID: %todo_id%"
      }
    }
  }
}
```

将令牌设置为环境变量：

```bash
export GITLAB_TOKEN="glpat-your_token_here"
```

### 自托管 GitLab

对于自托管实例，请设置 `baseUrl`：

```json
{
  "baseUrl": "https://gitlab.example.com"
}
```

## 配置选项

| 选项                     | 默认值                    | 描述                                                   |
| ------------------------ | ------------------------- | ------------------------------------------------------ |
| `token`                  | （必需）                  | 具有 `read_api` + `api` scope 的 PAT                   |
| `pollInterval`           | `60000`                   | 轮询间隔（毫秒）                                       |
| `baseUrl`                | `https://gitlab.com`      | GitLab 实例 URL                                        |
| `action_prompt_template` | （处理时必需）            | 将 GitLab 操作名称映射到元数据模板                     |
| `groupPolicy`            | `"disabled"`              | 必须为 `"open"`、`"allowlist"`（需列出项目）或 `"pairing"`（需批准项目） |
| `senderPolicy`           | `"allowlist"`             | 谁可以触发 bot                                         |

## action_prompt_template

此字段控制处理哪些 todo 操作以及如何渲染元数据。只有配置了模板的操作才会被分发；其他所有操作都会被跳过并标记为已完成。

```json
{
  "action_prompt_template": {
    "mentioned": "Project: %project% | Author: %author% | Title: %title%"
  }
}
```

`directly_addressed` 操作（以 `@bot` 开头的评论）如果未显式配置，会自动回退到 `mentioned` 模板。

### 可用的操作键

| 键                    | 触发条件                                                               |
| --------------------- | ---------------------------------------------------------------------- |
| `mentioned`           | 有人在评论或描述中 @提及 bot（不在开头）                               |
| `directly_addressed`  | 评论**以** `@bot` **开头**（回退到 `mentioned` 模板）                  |
| `assigned`            | 有人将 bot 分配到 issue/MR                                             |
| `review_requested`    | 有人在 MR 上请求 bot 作为审查者                                        |
| `approval_required`   | MR 需要 bot 的批准（批准规则）                                         |
| `marked`              | 有人标记了 bot 的评论/issue/MR（星标）                                 |
| `build_failed`        | bot 的分支/MR 上的 CI/CD 流水线失败                                    |
| `unmergeable`         | bot 参与的 MR 变得不可合并（冲突）                                     |
| `merge_train_removed` | MR 从合并列车中移除                                                    |

仅处理 `action_prompt_template` 中存在的键。未配置的操作会被跳过并静默标记为已完成。

### 模板变量

| 变量            | 值                                |
| --------------- | --------------------------------- |
| `%project%`     | 项目路径（例如 `owner/repo`）     |
| `%project_url%` | 完整项目 URL                      |
| `%author%`      | Todo 作者用户名                   |
| `%target_type%` | `Issue` 或 `MergeRequest`         |
| `%iid%`         | Issue/MR 内部 ID                  |
| `%title%`       | Issue/MR 标题                     |
| `%description%` | Issue/MR 描述正文                 |
| `%todo_id%`     | GitLab todo ID                    |
| `%%`            | 字面量 `%`（转义）                |

未知变量在输出中保持原样。

### Prompt 组装

模板渲染到 `envelope.metadata`（结构化上下文）。触发文本（`todo.body` 或描述）进入 `envelope.text`（主要 prompt）。基类组装发送给 agent 的最终 prompt：

```
[alice] please fix this bug

Project: owner/repo | URL: https://gitlab.com/owner/repo | Author: alice | Type: Issue | IID: 42 | Title: Test Issue | Description: ... | TodoID: 100
```

- 第 1 行：`[sender]` 前缀 + `envelope.text`（已去除 `@bot`）
- 第 3 行：`envelope.metadata`（渲染的模板，已清理）

你**不**需要 `%body%` 变量——评论/描述文本始终是主要 prompt 内容，模板在其下方提供补充上下文。

## ⚠️ 安全性

在**公共项目**上，设置 `senderPolicy: "open"` 允许**任何 GitLab 用户**通过 @提及 bot 来提交 prompt，驱动你 `cwd` 中的 agent。

在公共项目上始终使用 `senderPolicy: "allowlist"` 并显式设置 `allowedUsers`。

注意，在 `groupPolicy: "pairing"` 下，访问权限按项目授予：一旦项目被批准，**任何 GitLab 用户**都可以通过该项目的 issue 和 merge request 驱动 bot。所有 GitLab 流量都是群组流量，因此 `senderPolicy` 和 `allowedUsers` 不会限制已批准项目的成员。批准以项目路径（`owner/repo`）为键，重命名或转移时会发生变化——在任何项目重命名、转移或删除后，撤销过期的群组批准。

## 提及检测

适配器始终在分发的信封上设置 `isMentioned = true`，因为 GitLab 在创建 todo 时已经确定了提及。`action_prompt_template` 配置是真正的事件过滤器——只有配置了模板的操作才会被处理。`@bot` 提及在分发前通过 `stripBotMention` 从消息文本中去除。

### ⚠️ groupPolicy 必须为 "open"、"allowlist" 或 "pairing"

`groupPolicy` 必须设置为 `"open"`、`"allowlist"`（需显式列出项目）或 `"pairing"` 才能处理 todos。在 `"pairing"` 下，来自未批准项目的首次提及会创建群组配对请求；使用 `qwen channel pairing approve` 批准一次后，来自该项目的 todos 即会被分发。默认值 `"disabled"` 会丢弃所有提及：todos 被标记为已完成，游标推进，但不会进行分发。拒绝会被记录（`preflight rejected reason=group_disabled`），但 todo 仍会被消费。如果你的 bot 不响应提及，请检查 `groupPolicy` 是否不是 `"disabled"`。

## 工作原理

适配器使用 GitLab 的 Todos API 作为消息来源：

1. **轮询** `GET /todos?state=pending` 获取新 todos
2. **首次轮询排空**：如果游标从未初始化（`initialized: false`），所有 pending 的 todos 会被标记为已完成而不分发，游标推进到最大 todo ID。这可以防止首次启动时的积压洪水。
3. **清理过期 todos**：`id <= cursor` 的 todos 被标记为已完成（尽力而为），以防止在每次轮询时被重新获取
4. **过滤** 按 `id > cursor` 和配置的 `action_prompt_template`
5. **检测提及类型** 通过 `target_url` 锚点：
   - 存在 `#note_123` → 评论提及 → 文本为 `todo.body`（评论内容）
   - 无锚点 → 描述提及 → 文本为 issue/MR 描述
6. **分发** 信封通过 `handleInbound`（需要 `groupPolicy: "open"`、`"allowlist"`（需列出项目）或 `"pairing"`（需批准项目））
7. **推进游标**并**标记 todo 为已完成**（尽力而为）

游标（`lastProcessedId`）无论分发成功或失败都会推进。失败的分发会在 issue/MR 上发布 ⚠️ 错误评论，且不会重试——用户可以重新提及 bot 以触发新的 todo。

## 响应反馈

对于已接受的评论提及（带有 `#note_` 锚点的 note），channel 在 agent 工作时向 note 添加 👀 award emoji，然后在运行完成、失败或取消时移除它。两个操作都是尽力而为的：award emoji API 或权限失败会被记录，永远不会阻止最终响应。

描述提及（无 `#note_` 锚点）不会收到 award emoji，因为没有特定的 note 可以反应。

## 已知限制

- **首次启动会跳过现有的 pending todos。** 游标在首次启动时初始化为 `{ lastProcessedId: 0, initialized: false }`。在首次轮询周期中，所有预先存在的 pending todos 会被标记为已完成而不分发（`initialized` 标志控制这次性排空），防止积压洪水。
- bot 不会读取之前的对话历史——仅处理触发内容。
- **机密（内部）评论：** 如果有人在机密 note 中 @提及 bot，todo body 会包含该内部文本，agent 会处理它。bot 的回复始终作为**公开** note 发布，可能会暴露内部讨论。GitLab 的 todo API 不暴露 note 可见性，因此适配器无法过滤此问题。避免在机密 note 中 @提及 bot。
- 需要 `read_api` + `api` PAT scope。组级别或项目级别的令牌如果具有这些 scope 也可以使用。
- Epic、Design 和 Alert 的 todos 会被跳过（仅处理 Issue 和 MR）。

## 启动 Channel

```bash
qwen channel start my-gitlab
```
