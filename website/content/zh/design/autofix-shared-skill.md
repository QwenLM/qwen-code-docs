# 本地与 CI 运行共用一个 Autofix skill

## 背景

Qwen Code 已经有一个由仓库持有、供 GitHub Actions 使用的 Autofix skill。
它包含评审反馈分诊和验证规则，而工作流持有调度、信任过滤、凭据、GitHub 写入和轮次预算。

本地 Autofix 应该复用该 skill，而不是新增一个捆绑 skill 或第二套维护引擎。它的输入是当前工作树，而不是远端 pull request：已暂存、未暂存和未跟踪的变更会被一起评审。

## 设计

现有的 `.qwen/skills/autofix/SKILL.md` 仍是唯一的 Autofix skill。它有两条入口路径：

- 直接调用 `/autofix` 会同步评审并修复当前工作树。
- 现有的 Actions 运行器提供 `assess-candidates`、`develop-issue` 或 `address-review` 之一，外加可信的工作流预置文件。

本地路径反复运行现有的机器可读评审命令：

```bash
env -u SANDBOX QWEN_SANDBOX=true "${QWEN_CODE_CLI:-qwen}" review run --approval-mode auto --effort high --json --quiet
```

该命令以托管后台 shell 的方式运行，使其自身的超时（而非更短的前台工具限制）保持权威。Autofix 仍会同步等待它：交互式 TUI 从终端任务通知恢复，而 ACP、stream-json 和无头模式会话以有界、递增的节奏检查状态边车文件。评审前后和收敛前一刻的工作树指纹，会让任何评审副作用或并发编辑成为一个可见的 `BLOCKED` 结果。

嵌套的无头模式评审在 Qwen 沙箱内使用 Auto 审批模式。Autofix 在启动前清除继承来的 `SANDBOX` 标记，使其无法绕过隔离；审批分类器或沙箱不可用会产生一次不完整的评审并 fail closed（失败即拒绝）。启动前，Autofix 会说明评审可能在沙箱化进程中执行仓库定义的检查，且该进程保留模型凭据和网络访问，然后要求用户明确确认信任该仓库。如果存在未跟踪、未被忽略的文件，Autofix 还会在其内容进入评审模型上下文之前列出它们。非交互运行在无法获得确认时以 `BLOCKED` 停止。在 Windows 上，本地 Autofix 要求 Git Bash/MSYS，因为捆绑的评审工作流使用 POSIX shell 语法；原生 cmd.exe 和 PowerShell 会在评审开始前 fail closed。

每次完整评审之后，Autofix 读取输出的报告，对照代码验证每一条发现，应用一个最小且内聚的修复批次，运行范围最窄的相关检查，然后再次评审结果工作树。它不轮询 GitHub，也不使用 `/loop`。

本地没有固定的轮次数。该过程基于证据停止：

- `NO_CHANGES`：评审前工作树是干净的。
- `CONVERGED`：一次完整的、不设上限的评审没有可执行的发现，且所有必需检查通过。
- `BLOCKED`：评审证据不完整、某个必需检查在范围内没有安全的修复，或需要维护者/产品决定。
- `STALLED`：同一个可执行发现在没有新假设的情况下持续存在、工作树没有进展，或变更反复震荡。

本地 Autofix 绝不暂存、提交、推送、重写历史、修改索引或写入 GitHub。用户已有的暂存状态保持原样；修复以工作树变更的形式留下供检查。

## 工作流边界

GitHub Actions 保留所有确定性策略：触发器、授权、checkout、可信反馈选择、重试和轮次预算、水位线、提交、推送、评论和最终门禁。只有模型决策策略才属于 skill。特别是，工作流可以把反馈标记为延迟，而 skill 决定代理必须如何对待该部分。

## 被否决的替代方案

- 捆绑的 Autofix skill 会与仓库 skill 冲突，并分裂模型契约。
- `on`、`off` 或 `status` 会去控制远端工作流，而不是修复本地变更。
- 新的 watcher、调度器或运行时状态机会重复现有的评审和 Actions 基础设施。
- 固定的本地轮次上限可能终止一个正在进展的修复；基于进展的停止条件约束了不收敛的运行，而不施加任意的总量。
