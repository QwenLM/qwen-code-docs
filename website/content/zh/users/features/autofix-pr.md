# 自动修复 Pull Request

`/autofix-pr` 在本地 Qwen Code 会话中监视你的某个 pull request，并修复出现的问题：失败的 CI 检查、来自你信任的人的 review 反馈，以及合并冲突。每次修复都在独立的 worktree 中完成并验证，然后推送到 PR 分支并在 PR 上回复，使用你自己的 git 和 `gh` 身份。当 PR 被合并或关闭时，它会自动停止。

```text
/autofix-pr [<pr-number>|<pr-url>] [--once] [--every <minutes>] [--no-reply] [--yes] [instructions...]
/autofix-pr status
/autofix-pr stop [<pr-number>]
```

- 不传 PR 参数：监视当前分支头部所在的 PR。
- `--once`：检查并修复一次，不安排后续任务，监视结束后退出（后续的 `--once` 会从头开始，基于 PR 的历史）。如果本会话已经在监视该 PR，则保持现有监视不变。
- `--every <minutes>`：检查频率，可选值为 1、2、5、10、15、30 或 60。默认 2。
- `--no-reply`：推送修复，但不在 PR 上发布任何回复。
- `--yes`：跳过启动确认。在无法显示对话框的环境中必须使用。
- 自由文本会传递给每次修复，例如 `/autofix-pr 123 do not change the public API`。

## 开始之前

- `gh` 已登录，并且对 PR 分支有推送权限：对同仓库 PR 有写权限，或者是你自己的 fork，或者是允许维护者编辑的 fork。
- 你在 PR 仓库的一个 clone 中运行，且该 clone 有一个对应的 git remote。
- 在默认的[审批模式](./approval-mode.md)下，每条 shell 命令都会先征求确认：helper 调用（包括 push）、`gh pr view`，以及每次修复运行的命令。这适合你随时关注的监视场景。如果要让它无人值守运行，选择一个允许命令直接执行的模式，例如 [Auto Mode](./auto-mode.md)，并注意修复会运行仓库自身的构建和测试命令。该 skill 本身只授予以下权限：读取 `.qwen/tmp/` 下自己的文件、在其中写入修复简报和回复计划，以及列出已调度的任务。这些文件位于 clone 的主 worktree 中；如果会话在关联的 worktree 中启动，读写这些文件同样需要确认。
- 如果 PR 的作者无法向仓库推送，那么它实际上是在运行别人的代码，而你的 `gh` 和 `git` 凭据在修复验证时是可访问的。这样的 PR 永远不会被监视：只提供 `--once` 选项，并且在确认提示中会明确说明，且 `--yes` 不会跳过该确认。

启动时，它会请求一次确认，告知将推送到哪里以及将在 PR 上回复。

## 检查做什么

监视是一个[调度任务](./scheduled-tasks.md)，其 gate 在每次触发时运行 `qwen autofix-pr snapshot <n> --gate`，在模型之外执行。探针只打印自上次运行以来的变化，因此没有变化的 PR 不会消耗模型轮次。当有变化时，会运行一轮：

1. 已合并或已关闭的 PR 会结束监视。别人的推送会先被采纳。
2. 失败的检查、来自可信作者的新评论以及合并冲突会交给一个修复 agent，在 PR worktree 中工作。对于失败的检查，它会读取 job 日志；PR 之外的失败（网络、runner）会重跑一次而不是修复。
3. agent 使用仓库自身的检查验证其更改，只在通过时才提交。
4. 提交以 PR 头部的 fast-forward 方式推送，绝不强制推送。如果期间有人推送了，会先合并他们的工作。
5. 它处理的每个 review thread 都会收到回复——`Fixed in <sha>: …`、`Not changed: …` 或 `Needs a human decision: …`——每次推送会附带一条总结评论。

一轮过程永远不会向你提问。需要人工处理的内容会在 PR 上回复 "Needs a human decision" 并在会话中报告。

## 哪些反馈会被采纳

当评论作者是仓库的 owner、member 或 collaborator、PR 作者，或 bot 时（仅限 review 和 review thread），评论会被处理。其他任何人的评论只会被列出，不会被处理或回复。bot 在开启 thread 的评论或 review 中被听取，但不包括其回复（回复是在回应他人）。GitHub 无法启动的 workflow（例如无效的 workflow 文件）没有可供修复的日志，会被回复需要人工处理。每条评论、review 和 CI 日志都被视为数据：由可信作者决定哪些反馈会被处理，而不是由工具决定。要求泄露密钥、削弱测试或 CI 检查、强制推送或修改无关代码的请求会被回复 "Needs a human decision"。

## 它绝不会做的事

- 触碰你的工作目录或当前分支：所有操作都在 `.qwen/tmp/autofix-pr-<n>/` 中进行。
- 强制推送、重写 PR 历史，或推送到默认分支。
- 回复自己的回复（每条都以 `<!-- qwen-autofix-pr:v1 -->` 结尾）或回复不可信作者。
- 解决 review thread，或编辑 PR 标题或描述。

## 限制

| 限制                                     | 值   | 后果                     |
| ---------------------------------------- | ---- | ------------------------ |
| 每次监视的推送次数                       | 10   | 监视停止                 |
| 同一 head 上失败检查的重跑次数           | 1    | 下一次失败即为真实失败   |
| 每条评论的修复尝试次数                   | 1    | 不再提供                 |
| 一轮中他人的推送次数                     | 2    | 监视停止                 |

## 停止和文件

`/autofix-pr stop <n>` 会删除调度任务并移除 worktree、其分支和状态文件；gate 游标和 PR 历史会保留，因此后续的监视不会重复回复相同的评论。如果 worktree 中仍有未推送的工作，它会被保留，报告会说明原因；`qwen autofix-pr cleanup <n> --force` 可以丢弃它。调度任务默认在 7 天后过期（`experimental.cronRecurringMaxAgeDays` 设置，或 `QWEN_CODE_CRON_MAX_AGE_DAYS`），届时监视结束且不会生成报告；重新启动即可继续。会话退出时监视也会结束；其状态文件会保留，归属于该会话。在新会话中启动 `/autofix-pr <n>`——或在 `/clear` 或 `/resume` 之后——会提议接管该监视，保留其推送记录和配额。

文件位于 clone 主 worktree 的 `.qwen/tmp/` 下：

| 文件                                       | 内容                                                              |
| ------------------------------------------ | ----------------------------------------------------------------- |
| `autofix-pr-<n>/`                          | PR worktree                                                       |
| `autofix-pr-<n>-state.json`                | 监视状态：已知 head、推送记录、已处理的 id                        |
| `autofix-pr-<n>-gate.json`                 | gate 探针的游标                                                   |
| `autofix-pr-<n>-snapshot.json`             | 最近一轮的 PR 快照，由该轮读取                                    |
| `autofix-pr-<n>-replies.json`              | 哪些 bot 评论回复了哪条，以 GitHub 所述为准                       |
| `autofix-pr-<n>-history-*.json`            | 该 PR 早期监视发布和处理的内容，由 `stop` 保留                    |
| `autofix-pr-<n>-*.log`、`*.md`、`*.json`   | CI 日志、修复简报和回复计划                                       |

设计文档位于 [`docs/design/2026-10-21-autofix-pr-command.md`](../../design/2026-10-21-autofix-pr-command.md)。