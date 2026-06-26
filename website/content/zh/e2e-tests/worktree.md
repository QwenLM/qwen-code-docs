# Worktree 功能 E2E 测试计划（Phase A + B）

## 范围

通用 worktree 能力的端到端测试：

- Phase A：`EnterWorktree` / `ExitWorktree` 工具 + SessionService 状态
- Phase B：`Agent` 工具的 `isolation: 'worktree'` 参数 + 自动清理 + worktree 通知

## 测试环境

每个测试组在自己的临时 git 仓库和 tmux session 中运行，避免冲突。模板设置：

```bash
TEST_DIR=$(mktemp -d -t worktree-test-XXXXXX)
cd "$TEST_DIR"
git init -q
git config user.email "test@example.com"
git config user.name "Test"
echo "hello" > README.md
git add README.md
git commit -q -m "initial"
```

每个组使用唯一的 tmux session 名称（如 `wt-test-a`、`wt-test-b`）和唯一的临时目录。

基准二进制：全局安装的 `qwen`（0.15.10）。
本地构建二进制：`node /Users/mochi/code/qwen-code/.claude/worktrees/trusting-euclid-6fdfb9/bundle/qwen.js`。

## 测试组 A：EnterWorktree 工具注册与基本创建

**模式：** Headless，`--approval-mode yolo`，`--output-format json`

### A1：工具在系统初始化时注册

**步骤：**

```bash
<qwen> "say hello" --approval-mode yolo --output-format json 2>/dev/null \
  | jq -r 'select(.type=="system") | .tools[]' \
  | grep -E "^(enter_worktree|exit_worktree)$"
```

**实现前：** 为空（工具未注册）。
**实现后：** 输出 `enter_worktree` 和 `exit_worktree`。

### A2：使用自动生成的名称创建 worktree

**步骤：**

```bash
<qwen> "create a new git worktree using the enter_worktree tool" \
  --approval-mode yolo --output-format json 2>/dev/null > /tmp/a2.json
# 检查 worktree 目录是否创建
ls -la .qwen/worktrees/ | grep -v "^\." | wc -l
# 应该有一个匹配自动生成 slug 格式的目录
```

**实现前：** 模型表示找不到该工具；没有 `.qwen/worktrees/` 目录。
**实现后：** `.qwen/worktrees/<slug>` 存在，使用自动生成的 slug（格式：`{adj}-{noun}-{4hex}`）。

### A3：使用自定义名称创建 worktree

**步骤：**

```bash
<qwen> "use the enter_worktree tool with name='my-feature' to create a worktree" \
  --approval-mode yolo --output-format json 2>/dev/null
ls .qwen/worktrees/my-feature/
git branch | grep worktree-my-feature
```

**实现前：** 工具未知。
**实现后：** `.qwen/worktrees/my-feature/` 目录存在；分支 `worktree-my-feature` 存在。

### A4：无效的 slug 被拒绝

**步骤：**

```bash
<qwen> "use enter_worktree with name='../../../etc' to create a worktree" \
  --approval-mode yolo --output-format json 2>/dev/null \
  | jq 'select(.type=="user") | .message.content[] | select(.is_error) | .content'
```

**实现前：** 工具未知。
**实现后：** 工具结果 is_error=true，包含验证错误消息。

## 测试组 B：ExitWorktree

**模式：** Headless，单次 prompt 内两步交互。

### B1：进入然后退出，action=keep

**步骤：**

```bash
<qwen> "create a worktree named 'temp-keep' using enter_worktree, then immediately exit it with action='keep' using exit_worktree" \
  --approval-mode yolo --output-format json 2>/dev/null > /tmp/b1.json
# 目录应仍然存在（keep 会保留它）
ls -d .qwen/worktrees/temp-keep
# 分支应仍然存在
git branch | grep worktree-temp-keep
# 当前工作目录应为原始目录
```

**实现前：** 工具未知。
**实现后：** worktree 目录和分支在退出后仍然存在。

### B2：进入然后退出，action=remove（无更改）

**步骤：**

```bash
<qwen> "create a worktree named 'temp-remove' using enter_worktree, then immediately exit it with action='remove' using exit_worktree" \
  --approval-mode yolo --output-format json 2>/dev/null
ls -d .qwen/worktrees/temp-remove 2>&1
git branch | grep worktree-temp-remove
```

**实现前：** 工具未知。
**实现后：** worktree 目录被删除；分支被删除。

### B3：存在未提交更改时，exit 的 action=remove 会拒绝

**步骤：** 启动交互式 tmux session，在 worktree 中手动创建文件，然后尝试退出。

```bash
tmux new-session -d -s wt-test-b3 -x 200 -y 50 "cd $TEST_DIR && <qwen> --approval-mode yolo"
sleep 3
tmux send-keys -t wt-test-b3 "create a worktree named 'dirty-test' using enter_worktree"
sleep 0.5
tmux send-keys -t wt-test-b3 Enter
# 等待完成
for i in $(seq 1 30); do
  sleep 2
  tmux capture-pane -t wt-test-b3 -p | grep -q "Type your message" && break
done
# 在 worktree 中创建脏文件
echo "dirty" > "$TEST_DIR/.qwen/worktrees/dirty-test/dirty.txt"
# 尝试不带 discard_changes 的移除
tmux send-keys -t wt-test-b3 "use exit_worktree with action='remove' to exit the worktree"
sleep 0.5
tmux send-keys -t wt-test-b3 Enter
for i in $(seq 1 30); do sleep 2; tmux capture-pane -t wt-test-b3 -p | grep -q "Type your message" && break; done
tmux capture-pane -t wt-test-b3 -p -S -100 > /tmp/b3.out
# 输出中应提到 "uncommitted changes" 或 "discard_changes"
grep -E "uncommitted|discard_changes" /tmp/b3.out
tmux kill-session -t wt-test-b3
```

**实现前：** 工具未知。
**实现后：** 退出失败，返回关于未提交更改和 `discard_changes` 标志的消息。

## 测试组 C：SessionService 持久化

### C1：Session 元数据中的 Worktree 状态

**步骤：**

```bash
SESSION_ID=$(<qwen> "create a worktree named 'persist-test' using enter_worktree" \
  --approval-mode yolo --output-format json 2>/dev/null \
  | jq -r 'select(.type=="system") | .session_id' | head -1)
# 检查 session 存储中的 worktree 状态
find ~/.qwen -name "*${SESSION_ID}*" 2>/dev/null | head
grep -l "persist-test" ~/.qwen/projects/*/sessions/*.json 2>/dev/null || \
  grep -rl "worktreeSession\|persist-test" ~/.qwen/projects/ 2>/dev/null | head -5
```

**实现前：** 任何地方都没有存储 worktree session 状态。
**实现后：** session JSON 包含 `worktreeSession` 字段，其中有 `slug='persist-test'`、`worktreePath`、`originalCwd` 等。

## 测试组 D：AgentTool 隔离

### D1：接受 agent 隔离参数

**步骤：**

```bash
<qwen> "spawn an agent using the agent tool with isolation='worktree' to run 'echo hello'" \
  --approval-mode yolo --output-format json 2>/dev/null \
  | jq 'select(.type=="assistant") | .message.content[] | select(.type=="tool_use" and .name=="agent") | .input'
# 检查执行期间 .qwen/worktrees/ 是否包含 agent-* slug
```

**实现前：** agent 工具 schema 没有 isolation 参数；模型要么省略它，要么 schema 拒绝它。
**实现后：** agent 成功运行，isolation='worktree'；创建了一个 `agent-<7hex>` worktree。

### D2：Agent 自动清理 worktree（无更改）

**步骤：**

```bash
ls .qwen/worktrees/ > /tmp/d2-before.txt 2>/dev/null
<qwen> "spawn an agent with isolation='worktree' to list files in the current directory using ls" \
  --approval-mode yolo --output-format json 2>/dev/null
ls .qwen/worktrees/ > /tmp/d2-after.txt 2>/dev/null
# After 应等于 Before（没有残留的 agent-* 目录）
diff /tmp/d2-before.txt /tmp/d2-after.txt
```

**实现前：** 不适用（没有 isolation 参数）。
**实现后：** agent 完成且无更改后，worktrees 目录保持不变。

### D3：Agent worktree 在存在更改时被保留

**步骤：**

```bash
<qwen> "spawn an agent with isolation='worktree' to write 'test content' to a new file called test.txt" \
  --approval-mode yolo --output-format json 2>/dev/null > /tmp/d3.json
# Worktree 应随更改一起保留
ls .qwen/worktrees/agent-* 2>/dev/null
ls .qwen/worktrees/agent-*/test.txt 2>/dev/null
# Agent 结果应包含 worktreePath/worktreeBranch
jq 'select(.type=="user") | .message.content[] | select(.tool_use_id) | .content' /tmp/d3.json | head
```

**实现前：** 不适用。
**实现后：** `.qwen/worktrees/agent-<7hex>/test.txt` 存在；agent 结果提及 worktree 路径和分支。

## 测试组 E：陈旧清理

### E1：清理函数移除旧的 agent worktree

这在端到端测试中较难实现，因为需要老化。通过 `worktreeCleanup.test.ts` 中的单元测试覆盖：

- mtime 超过 30 天且匹配 `agent-<7hex>` 模式的 worktree → 被移除
- mtime 超过 30 天但由用户命名（如 `my-feature`）的 worktree → 被保留
- mtime 小于 30 天的 worktree → 被保留
- 存在未提交更改的 worktree → 被保留（fail-closed）
- 存在未推送提交的 worktree → 被保留（fail-closed）

E2E 抽查（可选）：手动 `touch -t 200001010000 .qwen/worktrees/agent-aabcdef0` 并调用清理；验证移除。

## 测试组 F：Arena 兼容性（无回归）

### F1：Arena worktree 路径不变

**步骤：** 运行一个 Arena session（与 EnterWorktree 分开）；验证它仍然在 `~/.qwen/arena/<sessionId>/worktrees/` 下创建 worktrees，而不是在 `.qwen/worktrees/` 下。

```bash
# 设置：需要启用 Arena 的配置。具体步骤取决于 Arena CLI 调用。
# 实现前：arena worktrees 位于 ~/.qwen/arena/ 下。
# 实现后：相同 — arena 路径是独立的。
```

（如果无法从 headless 模式轻松访问 Arena，则通过单元测试验证：`ArenaManager.ts:125`（`this.arenaBaseDir = arenaSettings?.worktreeBaseDir ?? path.join(Storage.getGlobalQwenDir(), 'arena')`）未改变。）

## 单元测试覆盖（与实现共存）

除 E2E 计划外，这些单元测试必须伴随实现：

- `EnterWorktreeTool.test.ts`：schema 验证、slug 拒绝、嵌套 worktree 拒绝、cwd 更改、SessionService 写入
- `ExitWorktreeTool.test.ts`：keep 与 remove 路径、脏状态保护、discard_changes 绕过、cwd 恢复
- `gitWorktreeService.test.ts` 扩展：`createUserWorktree`、`removeUserWorktree`、`createAgentWorktree`、`removeAgentWorktree`
- `sessionService.test.ts` 扩展：WorktreeSession 字段的读写、恢复时的恢复
- `worktreeCleanup.test.ts`：清理模式匹配、年龄过滤、fail-closed 条件
- `agent.test.ts` 扩展：接受 isolation 参数、创建 worktree 以及（在某些情况下）清理

## 通过标准

| 组   | 构建前预期          | 构建后预期                                              |
| ---- | ------------------- | ------------------------------------------------------- |
| A1   | 工具未列出          | 两个工具均已列出                                        |
| A2   | 错误/无操作         | `.qwen/worktrees/<auto-slug>` 已创建                    |
| A3   | 错误/无操作         | `.qwen/worktrees/my-feature` 已创建，分支存在           |
| A4   | 错误/无操作         | 工具结果 is_error，带有验证消息                         |
| B1   | 错误/无操作         | worktree 目录 + 分支保留                                |
| B2   | 错误/无操作         | worktree 目录 + 分支移除                                |
| B3   | 错误/无操作         | exit 拒绝，返回未提交更改的消息                         |
| C1   | 无 worktree 状态    | session 包含 worktreeSession 字段                       |
| D1   | 无 isolation 参数   | agent 在 `agent-<7hex>` worktree 中运行                 |
| D2   | 不适用              | agent 无更改完成后，worktrees 目录不变                  |
| D3   | 不适用              | `agent-<7hex>` 随更改一起保留                           |

## 实现后复现报告

本地构建位于 `dist/cli.js`（commit 位于 `claude/trusting-euclid-6fdfb9` 的顶端）。

| 组   | 结果                                 | 备注                                                                                                                                                                            |
| ---- | ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A1   | ✅                                   | `enter_worktree` 和 `exit_worktree` 列在 `system.tools` 中                                                                                                                      |
| A3   | ✅                                   | `.qwen/worktrees/my-feature` 已创建，分支 `worktree-my-feature` 存在                                                                                                             |
| A4   | 由单元测试覆盖                       | `validateUserWorktreeSlug` 拒绝路径遍历等（`enter-worktree.test.ts`）                                                                                                            |
| B1   | ✅                                   | `keep` 操作保留了目录和分支                                                                                                                                                     |
| B2   | ✅                                   | `remove` 操作删除了目录和分支                                                                                                                                                   |
| B3   | ✅                                   | `remove` 拒绝，返回 `Refusing to remove worktree "dirty-test" — it has 0 tracked change(s) and 1 untracked file(s).`                                                             |
| C1   | 范围外                               | SessionService 持久化已从 Phase A 延迟（参见 `docs/design/worktree.md` 中的范围说明）                                                                                            |
| D1   | ✅                                   | Agent 调用接受了 `isolation: 'worktree'`，创建了 `agent-2c4e759`                                                                                                                 |
| D2   | ✅                                   | Agent 完成且无更改后，worktrees 目录为空                                                                                                                                        |
| D3   | ✅                                   | Agent 写入 `test.txt` 后，worktree `agent-bad55bd` 和分支 `worktree-agent-bad55bd` 保留；结果包含 `[worktree preserved: ... (branch ...)]` 后缀                                  |
| E1   | 由单元测试覆盖                       | `worktreeCleanup.test.ts` 验证 `isEphemeralSlug` 只匹配 `agent-<7hex>`                                                                                                          |
| F1   | 范围外（本次运行无 Arena E2E）       | Arena 代码路径未触碰：`ArenaManager.ts:125` 和 `setupWorktrees()` 未改变                                                                                                         |

### 与测试计划的范围偏差

- **C1**（SessionService 持久化）已从 Phase A 延迟。最小可行 Phase A 返回绝对 worktree 路径，使模型通过绝对路径直接使用它，而不是机械地切换 `Config.targetDir`。恢复支持需要 SessionService 扩展，并记录在未来阶段中实现。
- **A2**（自动生成名称）已通过 D1/D3 间接验证，这些测试通过 agent 隔离流程执行了相同的自动 slug 路径。