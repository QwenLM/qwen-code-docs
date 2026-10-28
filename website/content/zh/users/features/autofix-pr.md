# 自动修复 Pull Request

`/autofix-pr` 在本地 Qwen Code 会话中监视你的某个 pull request，并修复出现的问题：失败的 CI 检查、来自你信任的人的 review 反馈，以及合并冲突。每次修复都在独立的 worktree 中完成并验证，然后推送到 PR 分支并在 PR 上回复，使用你自己的 git 和 `gh` 身份。当 PR 被合并或关闭时，它会自动停止。

```text
/autofix-pr [<pr-number>|<pr-url>] [--once] [--every <minutes>] [--no-reply] [--yes] [instructions...]
/autofix-pr status [<pr-number>]
/autofix-pr resume [<pr-number>]
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
- 你在 PR 仓库的一个 clone 中运行，且该 clone 有一个对应的 git remote。在守护进程会话（`qwen serve`、Web Shell）中，该 clone 必须位于会话的工作目录内：守护进程只在那里运行修复 agent 的命令，因此 `prepare` 会拒绝 clone 不在其中的 PR。在那里的监视是一个绑定到其会话的持久调度任务：守护进程保持该会话常驻而不是在空闲时回收它，任务会出现在 Scheduled tasks 页面上，因此关闭浏览器标签不会结束监视——`/autofix-pr stop` 才会。该任务在守护进程重启后会被重新激活；重启会丢弃 gate 的进程内审批，因此 gate 随后需要一个审批模式或一条允许其无人值守运行的已保存规则，而第一次被阻止的触发会指明要添加的规则。一个守护进程对话承载一个调度任务，因此在那里的第二个监视需要自己的对话。重启还会丢弃会话为该监视确认的内容：在 `/autofix-pr resume <n>` 再次确认之前，它的 helper 和修复会像 shell 命令一样遵循审批模式。
- 该 skill 通过 `autofix_pr` 工具运行其 helper。在你于本会话中启动或恢复的监视上，一轮的 helper——包括推送和回复——无需询问即可运行。启动或恢复监视、对其进行调度，以及从另一个会话接管——`/autofix-pr stop <n>` 指定 PR 即属于此类——每次仍然需要询问（在 [Auto Mode](./auto-mode.md) 中由其分类器决定，但启动始终由你确认），`gh pr view` 和创建调度任务也是如此。拒绝 shell 命令的规则（例如 `Bash` 或 `Bash(qwen autofix-pr *)`）同样会拒绝该工具的调用，针对它的询问规则会让调用继续询问，而你拒绝规则中的 `AutofixPr(command:push)` 会阻止所有推送。你在 shell 工具上设置的 PreToolUse hook 看不到这些调用；请在 `autofix_pr` 上设置。在带有 push 或 sync 会运行的 git hook（`pre-push`、`post-checkout`、`post-merge`、`reference-transaction`）的 clone 中——worktree 内的 hook 路径（例如 husky 的），或者运行 PR 中文件所指定的内容的 hook 管理器（例如 pre-commit 或 lefthook）——`sync` 和 `push` 也会询问，除非修复无需询问即可运行（见下文）。对于 git 目录位于 worktree 内（而非 clone 自身）的子模块的 worktree 的每个 helper 也是如此，而针对 shell 命令的询问规则在这里同样适用。该 skill 还授予读取 `.qwen/tmp/` 下自身文件的权限、在其中写入其修复简报、回复计划和你的指令，以及列出调度任务。这些文件位于 clone 的主 worktree 中；从链接 worktree 中启动的会话读写这些文件同样需要询问。
- 启动问题还提供**启动，修复无需询问即可运行**：修复 agent 的命令——PR worktree 中的构建、测试、提交——随后在该监视期间无需询问即可运行，但需再经过一个确认对话框（拒绝该对话框会取消启动；请再次运行 `/autofix-pr <n>`）。它的 agent 会像 [YOLO](./approval-mode.md) 会话那样运行：使用你的 `git` 和 `gh` 凭据，能够访问 worktree 之外的文件，绕过你的询问规则；你的拒绝规则仍然生效。这种状态持续到监视被停止、以普通的**启动**（或 `--yes`）重新启动，或者会话退出或被清除；`/autofix-pr resume` 会再次询问。选择普通的**启动**，则在默认的[审批模式](./approval-mode.md)下，它的每条命令都会先询问，这适合你持续关注的监视。接管监视和 `/autofix-pr resume` 会提供相同的选择。只有你能回答该对话框：没有已保存的规则、[Auto Mode](./auto-mode.md) 的分类器或 `--yes` 可以代替，并且在不受信任的文件夹中以及通过 stream-json 驱动 Qwen Code 的程序会被拒绝。在 `autofix_pr` 工具不可用的环境中（你设置中的工具允许列表可能会将其排除），helper 通过 shell 运行，并且每个都会先询问。
- 如果 PR 的作者无法向仓库推送，那么它实际上是在运行别人的代码，而你的 `gh` 和 `git` 凭据在修复验证时是可访问的。这样的 PR 永远不会被监视：只提供 `--once` 选项，并且在确认提示中会明确说明，且 `--yes` 不会跳过该确认。

启动时，它会请求一次确认，告知将推送到哪里、将在 PR 上回复，以及修复是否可以无需询问即运行其命令。

## 检查做什么

监视是一个[调度任务](./scheduled-tasks.md)，其 gate 在每次触发时运行 `qwen autofix-pr snapshot <n> --gate`，在模型之外执行。探针只打印自上次运行以来的变化，因此没有变化的 PR 不会消耗模型轮次。当有变化时，会运行一轮：

1. 已合并或已关闭的 PR 会结束监视。别人的推送会先被采纳。
2. 失败的检查、来自可信作者的新评论以及合并冲突会交给一个修复 agent，在 PR worktree 中工作。对于失败的检查，它会读取 job 日志；PR 之外的失败（网络、runner）会重跑一次而不是修复。
3. agent 使用仓库自身的检查验证其更改，只在通过时才提交。
4. 提交以 PR 头部的 fast-forward 方式推送，绝不强制推送。如果期间有人推送了，会先合并他们的工作。
5. 它处理的每个 review thread 都会收到回复——`Fixed in <sha>: …`、`Not changed: …` 或 `Needs a human decision: …`——每次推送会附带一条总结评论。

一轮过程永远不会向你提问。需要人工处理的内容会在 PR 上回复 "Needs a human decision"，在会话中报告，并由 `/autofix-pr status` 列出。

## 状态和恢复

`/autofix-pr status` 列出该 clone 的每个监视，无论由哪个会话运行：PR 及其分支、head、已使用的推送、其 gate 最后一次检查的时间和最后一轮运行的时间、是否由本会话运行，以及哪些内容在等待人工处理。它只读取监视的文件，不向 GitHub 发起任何请求。

当运行它的会话退出时，监视结束——在守护进程会话中，其任务是持久的并绑定到该会话，因此守护进程保持其常驻并且监视在守护进程重启后仍然存在——其调度任务默认在 7 天后过期（`experimental.cronRecurringMaxAgeDays` 设置，或 `QWEN_CODE_CRON_MAX_AGE_DAYS`）。其状态文件会保留。`/autofix-pr resume` 会在当前会话中重新启动本会话未运行的每个监视——或者你指定的那个——使用其启动时的间隔、`--no-reply` 和指令，并保留其推送、历史和配额。它会为所有这些请求一次确认，然后对每个运行一轮并重新调度。在守护进程会话中，一个对话承载一个调度任务，因此请逐个对话恢复其他监视。如果另一个会话仍在运行其中一个，该会话的任务会在下一次触发时停止；未指定 PR 时，`resume` 会跳过另一个会话最近检查过的监视，并说明原因。在其会话未运行期间 PR 被合并或关闭的监视会被其轮次移除。以 `--once` 启动的监视，或者 `stop` 在保留其 worktree 的情况下结束的监视，可以通过 `/autofix-pr <n>` 重新启动。

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

`/autofix-pr stop <n>` 会删除调度任务并移除 worktree、其分支和状态文件；gate 游标和 PR 历史会保留，因此后续的监视不会重复回复相同的评论。如果 worktree 中仍有未推送的工作，它会被保留，报告会说明原因；监视无论如何已经结束，而 `qwen autofix-pr cleanup <n> --force` 会丢弃这些工作。`/autofix-pr stop <n>` 同样会停止另一个会话留下的监视；不带参数的 `/autofix-pr stop` 会让另一个会话仍在运行的监视保持不变，而指定其 PR 则会结束它。调度任务默认在 7 天后过期（`experimental.cronRecurringMaxAgeDays` 设置，或 `QWEN_CODE_CRON_MAX_AGE_DAYS`），届时监视结束且不会生成报告；重新启动即可继续。任务已过期或终端会话已退出的监视会在没有报告的情况下结束；`/autofix-pr resume` 会重新启动它（见上文）。在新会话中启动 `/autofix-pr <n>`——或在 `/clear` 或 `/resume` 之后——同样会提议接管该监视，保留其推送记录和配额。

文件位于 clone 主 worktree 的 `.qwen/tmp/` 下：

| 文件                                       | 内容                                                              |
| ------------------------------------------ | ----------------------------------------------------------------- |
| `autofix-pr-<n>/`                          | PR worktree                                                       |
| `autofix-pr-<n>-state.json`                | 监视：已知 head、推送记录、已处理的 id、其调度任务                |
| `autofix-pr-<n>-gate.checked`              | 监视自身的 gate 最后一次检查 PR 的时间                            |
| `autofix-pr-<n>-gate.json`                 | gate 探针的游标                                                   |
| `autofix-pr-<n>-snapshot.json`             | 最近一轮的 PR 快照，由该轮读取                                    |
| `autofix-pr-<n>-replies.json`              | 哪些 bot 评论回复了哪条，以 GitHub 所述为准                       |
| `autofix-pr-<n>-history-*.json`            | 该 PR 早期监视发布和处理的内容，由 `stop` 保留                    |
| `autofix-pr-<n>-instructions.txt`          | 每轮使用的你的指令                                                |
| `autofix-pr-<n>-*.log`、`*.md`、`*.json`   | CI 日志、修复简报和回复计划                                       |

设计文档位于 [`docs/design/2026-10-21-autofix-pr-command.md`](../../design/2026-10-21-autofix-pr-command.md)。