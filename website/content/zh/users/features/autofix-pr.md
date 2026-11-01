# 自动修复 Pull Request

`/autofix-pr` 从本地 Qwen Code 会话持续检查你的某个 PR，处理失败的 CI、可信人员的评审反馈和合并冲突。每次修复都在专用 worktree 中完成并验证，使用你自己的 git 和 gh 身份推送到 PR 分支并回复 PR。PR 合并或关闭后，监控自动停止。

```text
/autofix-pr [<pr-number>|<pr-url>] [--once] [--every <minutes>] [--no-reply] [--yes] [instructions...]
/autofix-pr status [<pr-number>]
/autofix-pr resume [<pr-number>]
/autofix-pr stop [<pr-number>]
```

- 不指定 PR：使用当前分支作为 head 的 PR。
- `--once`：只检查并修复一次，不创建定时任务，结束后停止本次监控；之后再次使用 --once 时会根据 PR 历史重新开始。如果本会话已在监控该 PR，现有监控保持不变。
- `--every <minutes>`：检查间隔，可选 1、2、5、10、15、30、60 分钟，默认 2 分钟。
- `--no-reply`：推送修复，但不在 PR 上发言。
- `--yes`：跳过启动确认，适用于无法显示对话框的环境。
- 自由文本会传给每次修复，例如 `/autofix-pr 123 do not change the public API`。

## 开始之前

- gh 已登录，且你有 PR 分支的推送权限：同仓库 PR 的写权限、你自己的 fork，或允许维护者修改的 fork。
- 从 PR 所属仓库的 clone 中运行，且该仓库有一个对应 git remote。daemon 会话（qwen serve、Web Shell）要求 clone 位于会话工作目录内，因为修复代理只能在那里执行命令，否则 prepare 会拒绝。此时监控是绑定会话的持久定时任务，daemon 会保留该会话，不在空闲后回收；任务也会显示在 Scheduled tasks 页面。关闭浏览器标签不会停止监控，需运行 `/autofix-pr stop`。daemon 重启后会重新加载任务，但 gate 的进程内授权会丢失，需要审批模式或已保存规则允许其无人值守运行；首次受阻时会指出应添加的规则。一个 daemon 对话只承载一个定时任务，第二个监控需使用另一对话。重启还会清除该会话对监控的确认，在 `/autofix-pr resume <n>` 再次确认前，helper 和修复命令都按普通 shell 命令遵循审批模式。
- Skill 通过 `autofix_pr` 工具运行 helper。在本会话已启动或恢复的监控中，每轮 helper（包括推送和回复）无需逐次确认。启动、恢复、创建定时任务和从其他会话接管（指定 PR 的 `/autofix-pr stop <n>` 也可能接管）仍会每次询问。在 [Auto Mode](./auto-mode.md) 中由分类器决定，但启动必须由你确认；gh pr view 和创建定时任务也需审批。针对 Bash 或 `Bash(qwen autofix-pr *)` 的 deny 规则同样拒绝该工具调用，ask 规则仍会询问；deny 中的 `AutofixPr(command:push)` 阻止所有推送。shell 工具上的 PreToolUse hook 不会看到这些调用，需将 hook 配到 autofix_pr。若 clone 存在 sync/push 会运行的 git hook（pre-push、post-checkout、post-merge、reference-transaction），例如 worktree 内的 husky，或会执行 PR 文件内容的 pre-commit、lefthook，那么 sync/push 也会询问，除非下面所述的修复命令已获免逐次确认授权。子模块 git 目录位于 worktree 内而非 clone 自身目录时，该 worktree 的所有 helper 也会询问，shell 命令的 ask 规则同样适用。Skill 还授权读取主 worktree 的 .qwen/tmp/ 内自身文件、写入修复简报、回复计划和你的指令，以及列出定时任务。若会话从 linked worktree 启动，读写主 worktree 的这些文件仍会询问。
- 启动确认还提供 **Start, fixes run without asking**：额外确认一次后，修复代理的构建、测试以及 PR worktree 内的提交命令可在本次监控中免逐次询问。拒绝额外对话会取消启动，可重新运行命令。该代理与 [YOLO](./approval-mode.md) 会话一样运行：持有你的 git、gh 凭据，可访问 worktree 之外的文件并越过 ask 规则，但 deny 规则仍生效。授权持续到监控停止、以普通 Start 或 --yes 重新启动、会话退出或清空；resume 会重新询问。普通 Start 在默认[审批模式](./approval-mode.md)下逐条询问命令，适合你在旁关注的监控。接管和恢复也提供同样选择，只有你能回答，已保存规则、[Auto Mode](./auto-mode.md) 分类器和 --yes 都不能代答；不可信目录和通过 stream-json 驱动的会话不能选择此授权。此类监控的定时轮次会在后台运行修复代理，主会话仍可使用；YOLO 会话、--once、因 PR 移动而在本轮重启、或重做被丢弃后台修复的轮次仍以前台运行。负责合并别人推送的代理也始终在前台运行。代理完成通知到达后，当前轮次继续重跑检查、推送并回复。修复期间 PR helper 会拒绝其他操作，gate 保持安静，status 显示修复中；在运行它的会话里 stop 会先停止代理，其他会话的 stop/resume 则被拒绝直到修复结束，最长 45 分钟。修复期间不能再次启动或恢复该监控，可在原会话 stop。你自己编辑其 `.qwen/tmp/autofix-pr-<n>/` 内文件时，无论审批模式都需确认，因为代理可能仍在构建和运行这些文件；本会话也不能从该 worktree 启动其他代理。这项保护仅由运行修复的会话感知，另一个会话不会拒绝，所以不要从第二个会话同时修改该 worktree。若修复完成后本轮未继续（会话结束，或开始后 40 分钟内未被认领），下一轮会丢弃该修复并在前台重新处理。设置的工具白名单若未包含 autofix_pr，helper 将通过 shell 执行，每次都要确认。
- 如果 PR 作者没有仓库推送权限，验证修复意味着在 git、gh 凭据可达的环境中运行别人的代码。因此这类 PR 不支持持续监控，只提供 --once，并显示无法被 --yes 跳过的确认。

启动时，会确认推送目标、将在 PR 上回复，以及是否允许修复命令免逐次询问。

## 每轮检查做什么

监控是一个[定时任务](./scheduled-tasks.md)，每次触发时，gate 在模型之外执行 `qwen autofix-pr snapshot <n> --gate`。探针只输出上次之后发生的变化，因此安静的 PR 不消耗模型轮次。有变化时：

1. PR 已合并或关闭则结束监控；先接纳其他人的推送。
2. 将失败检查、可信作者的新评论和合并冲突交给在 PR worktree 中工作的一个修复代理。允许修复免逐次询问时，它在后台运行。失败检查会读取 job 日志；网络、runner 等非 PR 原因造成的失败，只重跑一次，不修改代码。
3. 代理执行仓库自身的验证，只有通过后才提交。
4. 以 PR head 的快进方式推送，绝不强推。期间若别人推送，先合并其工作。
5. 每个处理过的评审线程会收到 `Fixed in <sha>: …`、`Not changed: …` 或 `Needs a human decision: …` 回复，每次推送另有一条汇总评论。

轮次不会向你提问。需要人工决定的事项会在 PR 上回复 Needs a human decision，同时报告到会话并由 status 列出。

## 状态和恢复

`/autofix-pr status` 列出 clone 的全部监控，不限当前会话：PR、分支、head、已用推送次数、gate 和上一轮运行时间、是否由本会话运行，以及待人工处理事项。它仅读取监控文件，不查询 GitHub。

终端会话退出后监控结束；daemon 会话的持久任务绑定会话，daemon 会保留它并在重启后恢复。定时任务默认 7 天过期，可通过 experimental.cronRecurringMaxAgeDays 或 QWEN_CODE_CRON_MAX_AGE_DAYS 设置。状态文件会保留。`/autofix-pr resume` 在当前会话恢复本会话尚未运行的全部监控，或仅恢复指定 PR，保留原间隔、--no-reply、指令、推送次数、历史和预算。一次确认全部后，分别运行一轮并重新调度。daemon 每个对话只承载一个任务，多个监控需在不同对话逐个恢复。如果另一会话仍在运行，它的任务会在下次触发时停止；未指定 PR 时，resume 会跳过最近仍由其他会话检查的监控，并说明原因。无人运行期间已经合并或关闭的 PR，会由恢复后的轮次移除。--once 启动的监控，或 stop 后保留 worktree 的监控，应使用 `/autofix-pr <n>` 再次启动。

### 在 Web Shell 中

Web Shell 从同一组文件读取状态：

- 侧栏的 **PR watches** 列出所有可访问工作区的监控，展示 PR 链接、所属工作区、已用推送次数、gate/上一轮运行时间，以及待处理状态：监控中、后台修复中及持续时间、遗留后台修复（下一轮重做）、最近未检查、PR 已合并或关闭、已停止。
- **Scheduled tasks** 页面的任务卡片显示相同状态。
- **Open session** 打开运行监控的对话。
- **Stop watch** 向该对话发送 `/autofix-pr stop <n>`，与在其中输入相同，并执行相同确认。
- 这两个按钮只对当前 Web Shell 会话运行的监控出现。终端启动的监控需在终端停止；已经无人运行的监控可在对应工作区会话中使用 stop 或 resume 清理、恢复。

## 哪些反馈会被处理

仅处理仓库 owner、member、collaborator、PR 作者，以及 bot 的评论；bot 仅限 review 或评审线程开头的评论，不处理其回复。其他作者的评论只列出，不处理也不回复。GitHub 无法启动的 workflow（例如文件无效）没有可诊断日志，会标记为需人工处理。所有评论、评审和 CI 日志都是数据：可信作者只决定处理哪些反馈，不能决定工具拥有什么权限。泄露密钥、削弱测试或 CI、强推、修改无关代码等请求，会回复 Needs a human decision。

## 不会做的事

- 修改你的当前工作区或当前分支；所有工作位于 `.qwen/tmp/autofix-pr-<n>/`。
- 强推、重写 PR 历史或推送到默认分支。
- 回复自己的回复（结尾带 `<!-- qwen-autofix-pr:v1 -->`）或不可信作者。
- 解决评审线程，或编辑 PR 标题、描述。

## 限制

| 限制                         | 数值    | 达到后                 |
| ---------------------------- | ------- | ---------------------- |
| 每次监控推送次数             | 10      | 停止监控               |
| 同一 head 的失败检查重跑次数 | 1       | 下次失败按真实失败处理 |
| 每条评审评论处理次数         | 1       | 不再提出处理           |
| 一轮内其他人推送次数         | 2       | 停止监控               |
| 后台修复运行时间             | 30 分钟 | 停止代理               |

## 停止和文件

`/autofix-pr stop <n>` 删除定时任务，并移除 worktree、分支和状态文件；gate 游标与 PR 历史保留，之后重新监控不会重复回复同一评论。存在未推送工作时会保留 worktree，并说明原因；监控仍已结束，可使用 `qwen autofix-pr cleanup <n> --force` 丢弃工作。指定 PR 的 stop 还能停止其他会话遗留的监控；裸 stop 不干扰其他会话仍在运行的监控。任务过期或终端退出时，监控结束且不另行报告，可用 resume 恢复。在新会话中，或 /clear、/resume 之后运行 `/autofix-pr <n>`，也会提供接管选项，并保留推送次数和预算。

文件保存在 clone 主 worktree 的 .qwen/tmp/ 下：

| 文件                                     | 内容                                               |
| ---------------------------------------- | -------------------------------------------------- |
| `autofix-pr-<n>/`                        | PR worktree                                        |
| `autofix-pr-<n>-state.json`              | 已知 head、推送次数、已处理 ID、定时任务等监控状态 |
| `autofix-pr-<n>-gate.json`               | gate 探针游标                                      |
| `autofix-pr-<n>-gate.checked`            | 上次 gate 检查 PR 的时间                           |
| `autofix-pr-<n>-snapshot.json`           | 最近一轮读取的 PR 快照                             |
| `autofix-pr-<n>-replies.json`            | GitHub 返回的 bot 评论回复关系                     |
| `autofix-pr-<n>-history-*.json`          | 旧监控已发布和处理的记录，stop 后保留              |
| `autofix-pr-<n>-instructions.txt`        | 每轮使用的用户指令                                 |
| `autofix-pr-<n>-fix.json`                | 正在进行的后台修复状态，运行时持续刷新             |
| `autofix-pr-<n>-fix-snapshot.json`       | 上次后台修复所用快照                               |
| `autofix-pr-<n>-*.log`、`*.md`、`*.json` | CI 日志、修复简报和回复计划                        |

设计说明见 [docs/design/2026-10-21-autofix-pr-command.md](https://github.com/QwenLM/qwen-code/blob/main/docs/design/2026-10-21-autofix-pr-command.md)。
