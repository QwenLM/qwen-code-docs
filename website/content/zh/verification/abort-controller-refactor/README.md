# AbortController 重构 — 验证计划

在提交 PR 之前，用于手动验证更改的场景。每个场景通过 `tmux pipe-pane -o 'cat >> <log>'` 捕获其 tmux 窗格。

## 一次性设置

```sh
# 将 WT 指向你本地正在审查的分支的代码仓库。
WT=/path/to/qwen-code/worktree
LOGDIR=$WT/docs/verification/abort-controller-refactor/logs
mkdir -p "$LOGDIR"

# 构建一次 CLI（跳过 sandbox 镜像和 vscode）。
( cd "$WT" && npm run build:packages )
```

## 场景

对于每个场景：

```sh
tmux new-session -d -s qwen-verify-XX
tmux pipe-pane -t qwen-verify-XX -o "cat >> $LOGDIR/XX-name.log"
tmux send-keys -t qwen-verify-XX "cd /path/to/your/test/workspace && exec node $WT/packages/cli/dist/index.js" C-m
tmux attach -t qwen-verify-XX
```

然后根据下面的矩阵手动驱动会话。完成后按 `C-b d` 分离；使用 `tmux kill-session -t qwen-verify-XX` 停止窗格。

### 00 — 基线（修复前）

- **设置：** 切换到 `main` 分支，构建，使用 `NODE_OPTIONS=--trace-warnings` 运行。
- **输入：** 一个长时间运行的 50 轮混合工具会话（shell + edit + grep + agent）。
- **预期：** 大约 30-40 轮后，stderr 打印 `MaxListenersExceededWarning: ... 1500+ abort listeners added to [AbortSignal]`。
- **日志：** `00-baseline-reproduction.log`。

### 01 — 长时间会话，DEBUG 模式（此分支）

- **设置：** `NODE_OPTIONS=--trace-warnings DEBUG=1 qwen`。
- **输入：** 与 #00 相同的 50 轮脚本。
- **预期：** 不打印 `MaxListenersExceededWarning`；其他警告仍然打印。
- **日志：** `01-long-session-debug.log`。

### 02 — 长时间会话，生产模式（此分支）

- **设置：** `qwen`（无 debug 环境变量）。
- **输入：** 相同的 50 轮脚本。
- **预期：** 输出干净；在 handler 内临时添加一个 `console.error` 探针（添加后移除），确认过滤器触发。
- **日志：** `02-long-session-prod.log`。

### 03 — Ctrl-C 中途中断

- **设置：** 此分支，交互模式。
- **输入：** 请求一个长生成（>30 秒）；中途按 Ctrl-C。
- **预期：** 流在约 200ms 内停止，显示 "Cancelled" 横幅，下一提示接受输入。`process._getActiveHandles()` 计数恢复到基线（使用 `:debug handles` 检查）。
- **日志：** `03-ctrlc-streaming.log`。

### 04 — 取消长时间运行的 shell 命令

- **设置：** 此分支。
- **输入：** 通过 shell 工具运行 `sleep 60`；中途取消执行。
- **预期：** 子进程被杀死（用 `pgrep -f sleep` 检查返回空），工具结果显示取消，agent 接受下一提示。
- **日志：** `04-shell-cancel.log`。

### 05 — 子 agent 的取消

- **设置：** 此分支。
- **输入：** 通过 agent 工具派生一个长时间运行的 agent 任务；从父 agent 取消。
- **预期：** 子 agent 正在进行的工具调用中止，子 agent 的模型流停止，父 agent 收到取消事件。
- **日志：** `05-subagent-cancel.log`。

### 06 — 无头/非交互模式的中断

- **设置：** `qwen --prompt "do a long task"`；从外部通过 `kill -INT <pid>` 发送 `SIGINT`。
- **预期：** 干净退出，退出码 130，无警告。
- **日志：** `06-headless-abort.log`。

### 07 — 后台 agent 流

- **设置：** 交互模式。
- **输入：** 启动一个后台 agent（`run_in_background: true`）；让其完成；启动第二个；中途取消第二个。
- **预期：** 第一个 agent 正常完成；第二个干净中止；两个 agent 之间没有监听器泄漏。
- **日志：** `07-background-agent.log`。

### 08 — 内存基线

- **设置：** `qwen --inspect`，连接 Chrome 开发者工具。
- **输入：** 100 轮会话。
- **预期：** 在第 0/50/100 轮拍摄堆快照。`AbortSignal` 实例计数和每个信号的监听器计数稳定（无单调增长）。
- **日志：** `08-memory-snapshots/`。

### 09 — 已存在的 combinedAbortSignal 消费者

- **设置：** 同时使用外部信号和超时触发一个 HTTP hook。
- **输入：** (a) 在 hook 中途取消外部信号；(b) 在单独运行中让超时触发。
- **预期：** 两种情况下 hook 都干净中止；弃用的 shim 路径被调用。
- **日志：** `09-http-hook-shim.log`。

## 自动（非交互）验证

以下自动化检查在开发期间运行，并记录在 `automated-results.md` 中：

- 所有 abortController 单元测试通过（`abortController.test.ts`，26 个测试；1 个 GC 测试在非 `--expose-gc` 下跳过）。
- 所有 warningHandler 测试通过（`warningHandler.test.ts`，13 个测试，包括一个子进程 stderr 集成测试）。
- 所有 `combineAbortSignals` 消费者测试通过（`httpHookRunner.test.ts`）；一旦唯一的调用者迁移后，已弃用的 `createCombinedAbortSignal` shim 及其测试文件被移除。
- 所有 agent runtime / followup / openaiContentGenerator / hooks 测试通过。
- 迁移范围（有意为之）：仅 agent-runtime 的父→子链（`agent-interactive.ts`、`agent-core.ts`、`agent-headless.ts`）以及 `promptHookRunner.ts`（实际的清理泄漏）切换为使用辅助函数。独立的短生命周期控制器（每个 shell 命令、每个 fetch、每个 recall 等）仍使用原生的 `new AbortController()`——它们很快被垃圾回收，不会在父对象上累积监听器。请参阅 `migration-completeness.txt` 了解捕获的 grep 结果和理由。
- TypeScript 严格模式类型检查通过 `packages/core` 和 `packages/cli`。
- Prettier 检查通过所有修改过的文件。

详情请参见 `automated-results.md` 中的实际命令输出。

## 如何为 PR 正文收集产物

运行每个场景后，将转录文件（或相关摘录）附加到 PR 中。对于 #08（内存），导出堆快照并包含快照之间监听器数量的差值。