# 多代理协调

Qwen Code 可以使用实验性的 Agent Team 运行时协调多个 teammate。Teammate 接收独立的任务、共享任务列表、交换消息，并出现在现有的 Agent View 标签页中。`/coordinate` 默认将调查 worker 限制为强制只读工具集，并可以在一个由 leader 拥有的 Git worktree 中放置一个 writer。

## 启用 Agent Team

在 Qwen Code 设置中将 `experimental.agentTeam` 设置为 `true` 并重启，或使用 `QWEN_CODE_ENABLE_AGENT_TEAM=1` 启动 Qwen Code。

## 运行协调任务

使用内置 skill 并附带目标：

```text
/coordinate investigate the authentication regression and propose the smallest fix
```

Leader 会创建一个团队，分配最多三个独立的工作流，并使用现有的团队工具进行消息传递和任务状态管理。Teammate 的对话和审批仍然通过现有的 Agent View UI 可见。只读 teammate 无法执行 shell 命令或写入文件。如果需要实现代码更改，leader 可以创建一个 Git worktree 并将一个 writer teammate 固定到该 worktree；leader 仍然是当前分支的唯一合并权威。

如果 Agent Team 被禁用，`/coordinate` 仍然可以使用普通的 foreground agent 进行只读并行调查。这种回退是委派，而非协作团队：worker 仅向 leader 报告。

## 选择合适的多代理模式

| 模式                          | 适用场景                                                  | 通信                              | 工作区行为                                                  |
| ----------------------------- | --------------------------------------------------------- | --------------------------------- | ----------------------------------------------------------- |
| `/coordinate` 配合 Agent Team | 不同工作流共同贡献一个结果                                | 共享任务和 teammate 消息           | 强制只读 worker；可选的单个 worktree writer                  |
| 子代理                        | 小型委派任务                                              | Worker 向父代理报告                | 取决于所选的 agent                                           |
| Arena                         | 多个模型在同一任务上竞争                                  | 代理之间不协作                     | 隔离的 worktree；选择一个胜者                                |
| Herdr                         | 协调不同的 CLI 产品或远程终端会话                         | 外部终端级控制                     | 在 Qwen Code 外部管理                                        |

当前的工作流有意复用进程内的 Agent Team 运行时和 Agent View UI。Teammate 通常继承会话模型，尽管 agent 定义可以覆盖它。持久化的独立 PTY 会话、跨厂商 worker 和远程连接是独立的产品关注点，`/coordinate` 未实现这些功能。
