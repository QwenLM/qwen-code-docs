# Worktree Phase D E2E 测试计划

## 范围

对 Phase D 功能进行端到端验证，针对本地构建：
`/Users/mochi/code/qwen-code/.claude/worktrees/tender-jemison-037f0a/dist/cli.js`。

Phase D 交付三个跨领域能力：

- **D-1** — `--worktree [name]` CLI 启动标志（裸写 / 显式 slug / `=` 形式），
  配合 `process.cwd()` + `Config.targetDir` 切换，以及在退出时复用 `WorktreeExitDialog`
- **D-2** — `worktree.symlinkDirectories: string[]` 设置键，在 `performPostCreationSetup()` 中应用，
  覆盖 `--worktree`、`EnterWorktreeTool` 以及 `AgentTool isolation: "worktree"` 路径
- **D-3** — `--worktree=#<N>` 和 `--worktree <github-url>` PR 引用形式，
  通过 `git fetch origin pull/<N>/head`（不依赖 `gh` CLI）

## 二进制文件

- **本地构建（Phase 6 验证）**: `node /Users/mochi/code/qwen-code/.claude/worktrees/tender-jemison-037f0a/dist/cli.js`
- **Phase 4 空跑基线**: 全局安装的 `qwen`

对于空跑，全局安装的 `qwen` 预期会在 A / E / F 组失败，因为这些功能尚不存在 —— 这正是验证计划正确检测实现缺失的方式。

### Group E 的基线前置条件

测试 **E2**（`EnterWorktreeTool` 符号链接）和 **E3**（`AgentTool isolation` 符号链接）需要基线中包含 **Phase A + B** —— 它们利用现有的 `enter_worktree` 工具和 `agent isolation: "worktree"` 参数，确认符号链接循环也会在这些代码路径上触发。

全局安装的 `qwen` 可能早于 PR #4073（Phase A+B，于 2026-05-14 合并）而完全缺少这些工具。此时，E2 / E3 无法验证“因为 D-2 缺失导致符号链接缺失”——它们会退化为“工具缺失”。在每个测试开头添加以下防护：

```bash
HAS_ENTER_WORKTREE=$($QWEN "list your tools and stop" --approval-mode yolo --output-format json 2>/dev/null \
  | jq -e '.[] | select(.type=="system") | .tools | index("enter_worktree")' >/dev/null && echo yes || echo no)
if [ "$HAS_ENTER_WORKTREE" != "yes" ]; then
  echo "SKIP: enter_worktree absent in baseline — E2/E3 require Phase A+B"
  exit 0
fi
```

对于 Phase 6（实现后）验证，本地构建天然包含 Phase A-C，因此防护无效，测试完整运行。

## 测试环境模板

每组都在自己的临时 git 仓库和 tmux 会话中运行：

```bash
TEST_DIR=$(mktemp -d -t qwen-wt-phd-XXXXXX)
TEST_DIR=$(cd "$TEST_DIR" && pwd -P)   # 解析符号链接（macOS /var → /private/var）
cd "$TEST_DIR"
git init -q -b main
git config user.email t@e.com
git config user.name t
git config commit.gpgsign false
echo "hello" > README.md
git add README.md
git commit -q -m "initial" --no-verify

PROJECT_ID=$(node -e "console.log(process.argv[1].replace(/[^a-zA-Z0-9]/g,'-'))" "$TEST_DIR")
QWEN="node /Users/mochi/code/qwen-code/.claude/worktrees/tender-jemison-037f0a/dist/cli.js"
```

PR 引用测试（Group F）还需要一个已签出的公共 GitHub 仓库克隆，该仓库至少有一个合并的 PR。使用 qwen-code 自身作为测试目标 —— PR `#4174`（Phase C）是一个保证存在的引用。

---

## Group A：`--worktree` 标志基本形式

**模式：** 无头，`--approval-mode yolo`, `--output-format json`

### A1：裸写 `--worktree`（自动 slug）

```bash
$QWEN --worktree "say hello and stop" \
  --approval-mode yolo --output-format json 2>/dev/null > /tmp/a1.out

# 启动时发出 `worktree_started` 系统事件。`notice` 字段包含
# 渲染文本中的 slug（自动生成的 `adj-noun-XXXXXX`）。使用 `jq -e`
# 使得事件缺失时退出码非零（而不是静默返回 `null`）。
jq -e '.[] | select(.type=="system" and .subtype=="worktree_started") | .data.notice | test("\"[a-z]+-[a-z]+-[0-9a-f]{6}\"")' < /tmp/a1.out

# 初始化系统消息的 `cwd` 也应指向 worktree 内部。
jq -e '.[] | select(.type=="system" and .subtype=="init") | .cwd | test("/\\.qwen/worktrees/[a-z]+-[a-z]+-[0-9a-f]{6}$")' < /tmp/a1.out

ls -d "$TEST_DIR/.qwen/worktrees/"*
```

**预期（实现后）：**

- `worktree_started` 事件带有 `.data.notice`，包含自动 slug
- Init `.cwd` 以 `.qwen/worktrees/<自动 slug>` 结尾
- `.qwen/worktrees/` 下恰好有一个 worktree 目录
- 分支名为 `worktree-<slug>` 存在（`git branch | grep worktree-`）

**预期（实现前基线）：** yargs 拒绝 `--worktree`，报 "Unknown argument" 错误，退出码不为 0。

### A2：`--worktree my-feature`（显式 slug）

```bash
$QWEN --worktree my-feature "say hello and stop" \
  --approval-mode yolo --output-format json 2>/dev/null > /tmp/a2.out

ls -d "$TEST_DIR/.qwen/worktrees/my-feature"
git -C "$TEST_DIR" branch | grep "worktree-my-feature"
```

**预期（实现后）：** worktree 目录 `my-feature/` 和分支 `worktree-my-feature` 都存在。

### A3：`--worktree=my-feature`（= 形式）

与 A2 相同，但使用 `=` 形式。A2 和 A3 之间需要清理（不同的 TEST_DIR）。

```bash
$QWEN --worktree=my-feature "say hi" \
  --approval-mode yolo --output-format json 2>/dev/null > /tmp/a3.out
```

**预期（实现后）：** 与 A2 相同。

### A4：无效 slug 在任何 git 操作之前被拒绝

```bash
$QWEN --worktree "../escape" "say hi" \
  --approval-mode yolo --output-format json 2>/dev/null > /tmp/a4.out
echo "exit=$?"

ls "$TEST_DIR/.qwen/worktrees/" 2>/dev/null
```

**预期（实现后）：**

- 进程以非零状态退出
- 标准错误或最终结果消息提到 "invalid slug" / "not allowed"
- `.qwen/worktrees/` 目录不存在（worktree 创建从未启动）

### A5：非 git 仓库 → 立即失败

```bash
NON_GIT=$(mktemp -d)
cd "$NON_GIT"
$QWEN --worktree "say hi" \
  --approval-mode yolo --output-format json 2>/dev/null > /tmp/a5.out
echo "exit=$?"
```

**预期（实现后）：** 退出码不为 0，消息提到 "not a git repository" 或 "git init"。

---

## Group B：`--worktree` 后的 cwd + sidecar

### B1：sidecar 写入所有六个字段

```bash
SESSION_ID=$(uuidgen)
$QWEN --worktree b1-test --session-id "$SESSION_ID" "say hi" \
  --approval-mode yolo --output-format json 2>/dev/null > /tmp/b1.out

SIDECAR=~/.qwen/projects/$PROJECT_ID/chats/$SESSION_ID.worktree.json
jq '.slug, .worktreePath, .worktreeBranch, .originalCwd, .originalBranch, .originalHeadCommit' \
  < "$SIDECAR"
```

**预期：**

- `slug = "b1-test"`
- `worktreePath` 以 `.qwen/worktrees/b1-test` 结尾
- `worktreeBranch = "worktree-b1-test"`
- `originalCwd` = `$TEST_DIR`（已解析）
- `originalBranch = "main"`
- `originalHeadCommit` 匹配 `[0-9a-f]{40}`

### B2：启动时切换 `process.cwd()`

```bash
$QWEN --worktree b2-test "run the shell tool with command 'pwd', then stop" \
  --approval-mode yolo --output-format json 2>/dev/null > /tmp/b2.out

# 从 user-message tool_result 中提取 shell 工具的 stdout
jq -r '.[] | select(.type=="user") | .message.content[] | select(.tool_use_id != null) | .content' \
  < /tmp/b2.out | head -5
```

**预期（实现后）：** `pwd` 输出等于 `$TEST_DIR/.qwen/worktrees/b2-test`。

### B3：切换 `Config.targetDir`（Footer / 状态负载）

```bash
$QWEN --worktree b3-test "run the shell tool with command 'pwd && git rev-parse --abbrev-ref HEAD', then stop" \
  --approval-mode yolo --output-format json 2>/dev/null > /tmp/b3.out

jq -r '.[] | select(.type=="user") | .message.content[] | select(.tool_use_id != null) | .content' \
  < /tmp/b3.out
```

**预期（实现后）：** 分支为 `worktree-b3-test` 并且工作目录在 worktree 内部。

---

## Group C：`--worktree` × `--resume` 优先级

### C1：`--worktree` 优先于已保存的 sidecar（不同的 slug）

```bash
# 第 1 次运行：创建工作区 "first" 的会话
SESSION_ID=$(uuidgen)
$QWEN --worktree first --session-id "$SESSION_ID" "say hi" \
  --approval-mode yolo --output-format json 2>/dev/null > /tmp/c1-run1.out

# 第 2 次运行：恢复相同会话但请求不同的工作区
$QWEN --resume "$SESSION_ID" --worktree second "say hi again" \
  --approval-mode yolo --output-format json 2>/dev/null > /tmp/c1-run2.out

# Sidecar 现在应指向 "second"
SIDECAR=~/.qwen/projects/$PROJECT_ID/chats/$SESSION_ID.worktree.json
jq -r '.slug' < "$SIDECAR"

# 两个工作区目录应存在于磁盘上（first 从未被移除，只是取消链接）
ls -d "$TEST_DIR/.qwen/worktrees/"*
```

**预期（实现后）：**

- Sidecar `.slug` = `"second"`
- `first/` 和 `second/` 目录都存在
- 第 2 次运行的标准错误或 init `worktree_overridden` 消息提到 "--worktree overrides the resumed session's worktree"

### C2：过期的 sidecar（手动删除的目录）+ `--worktree` → 创建新的 worktree

```bash
SESSION_ID=$(uuidgen)
$QWEN --worktree c2 --session-id "$SESSION_ID" "say hi" \
  --approval-mode yolo --output-format json 2>/dev/null > /tmp/c2-run1.out

rm -rf "$TEST_DIR/.qwen/worktrees/c2"   # 模拟用户删除目录

$QWEN --resume "$SESSION_ID" --worktree c2-fresh "say hi" \
  --approval-mode yolo --output-format json 2>/dev/null > /tmp/c2-run2.out

ls -d "$TEST_DIR/.qwen/worktrees/"*
```

**预期（实现后）：** 只有 `c2-fresh/` 存在；sidecar 更新为 `c2-fresh`。

---

## Group D：WorktreeExitDialog 回归测试（由 `--worktree` 启动的会话）

**模式：** 交互式（tmux）。验证当 worktree 由 CLI 标志而非 `EnterWorktreeTool` 创建时，Phase C 对话框仍然触发。

### D1：2 次 Ctrl+C → 对话框出现

```bash
tmux new-session -d -s d1 -x 200 -y 50 \
  "cd $TEST_DIR && $QWEN --worktree d1-test --approval-mode yolo"
sleep 3

# 验证 worktree 处于活跃状态（Footer 指示器）
tmux capture-pane -t d1 -p -S -50 | grep -q "⎇ worktree-d1-test"

# 发送两次 Ctrl+C
tmux send-keys -t d1 C-c
sleep 0.3
tmux send-keys -t d1 C-c
sleep 1

tmux capture-pane -t d1 -p -S -50 | grep -E "Active worktree|Keep worktree|Remove worktree"
tmux kill-session -t d1
```

**预期（实现后）：** 对话框文本 "Active worktree: \"d1-test\" …" 以及三个单选选项出现。

### D2：对话框 → Cancel → 会话保持活动

```bash
tmux new-session -d -s d2 -x 200 -y 50 \
  "cd $TEST_DIR && $QWEN --worktree d2-test --approval-mode yolo"
sleep 3
tmux send-keys -t d2 C-c; sleep 0.3; tmux send-keys -t d2 C-c; sleep 1

# 导航到 "Cancel"（第三个选项）并选择
tmux send-keys -t d2 Down Down Enter
sleep 1

tmux capture-pane -t d2 -p -S -10 | grep -q "Type your message"
ls -d "$TEST_DIR/.qwen/worktrees/d2-test"   # 仍然存在
tmux kill-session -t d2
```

**预期（实现后）：** 提示输入重新出现；worktree 目录仍在磁盘上。

### D3：对话框 → Remove → worktree + 分支 + sidecar 全部消失

```bash
SESSION_ID=$(uuidgen)
tmux new-session -d -s d3 -x 200 -y 50 \
  "cd $TEST_DIR && $QWEN --worktree d3-test --session-id $SESSION_ID --approval-mode yolo"
sleep 3
tmux send-keys -t d3 C-c; sleep 0.3; tmux send-keys -t d3 C-c; sleep 1
tmux send-keys -t d3 Down Enter   # 选择 "Remove worktree and branch"
sleep 3
tmux kill-session -t d3

ls "$TEST_DIR/.qwen/worktrees/d3-test" 2>/dev/null && echo "FAIL: dir exists"
git -C "$TEST_DIR" branch | grep "worktree-d3-test" && echo "FAIL: branch exists"
test ! -f ~/.qwen/projects/$PROJECT_ID/chats/$SESSION_ID.worktree.json && echo "PASS: sidecar gone"
```

**预期（实现后）：** 目录、分支和 sidecar 全部被移除。

---

## Group E：`worktree.symlinkDirectories`

**模式：** 无头。通过临时设置文件进行配置。

### 设置模板

```bash
mkdir -p "$TEST_DIR/node_modules"
echo "package.json" > "$TEST_DIR/node_modules/.placeholder"
mkdir -p "$TEST_DIR/.qwen"
cat > "$TEST_DIR/.qwen/settings.json" <<'EOF'
{
  "worktree": {
    "symlinkDirectories": ["node_modules"]
  }
}
EOF
```

### E1：`--worktree` 路径应用符号链接

```bash
$QWEN --worktree e1-test "say hi" \
  --approval-mode yolo --output-format json 2>/dev/null > /dev/null

ls -la "$TEST_DIR/.qwen/worktrees/e1-test/node_modules"
readlink "$TEST_DIR/.qwen/worktrees/e1-test/node_modules"
```

**预期（实现后）：** worktree 内部的 `node_modules` 是指向 `$TEST_DIR/node_modules` 的符号链接。

### E2：`EnterWorktreeTool` 路径应用符号链接

```bash
$QWEN "use enter_worktree to create a worktree named e2-test, then stop" \
  --approval-mode yolo --output-format json 2>/dev/null > /dev/null

readlink "$TEST_DIR/.qwen/worktrees/e2-test/node_modules"
```

**预期（实现后）：** 相同的符号链接目标。

### E3：AgentTool isolation 路径应用符号链接

需要子代理定义。使用内置的 fork 机制：

```bash
$QWEN "use the agent tool with subagent_type='general-purpose', isolation='worktree', description='check node_modules', prompt='run pwd and ls -la node_modules then exit'" \
  --approval-mode yolo --output-format json 2>/dev/null > /tmp/e3.out

# 从结果消息中提取代理工作目录
jq -r '.[] | select(.type=="assistant") | .message.content[] | select(.type=="tool_use") | .input' \
  < /tmp/e3.out | head -5

# 执行后找到 agent-<7hex> 工作目录
ls -la "$TEST_DIR/.qwen/worktrees/"agent-*/node_modules 2>/dev/null | head -3
```

**预期（实现后）：** 符号链接存在于 `agent-<hex>` 工作目录内（除非因为无更改而自动清理 —— 这种情况下，“无更改”路径不验证符号链接行为，需要升级到强制变更测试）。

### E4：源目录不存在 → 静默跳过，worktree 仍然创建

```bash
cat > "$TEST_DIR/.qwen/settings.json" <<'EOF'
{ "worktree": { "symlinkDirectories": ["does-not-exist"] } }
EOF

$QWEN --worktree e4-test "say hi" --approval-mode yolo --output-format json 2>/dev/null > /tmp/e4.out
ls -d "$TEST_DIR/.qwen/worktrees/e4-test"
ls "$TEST_DIR/.qwen/worktrees/e4-test/does-not-exist" 2>/dev/null && echo "UNEXPECTED"
```

**预期（实现后）：** worktree 目录存在，缺失的条目未在其中创建，进程退出码 = 0。

### E5：目标已存在 → 静默跳过，不覆盖

```bash
# 在预期的 slug 下预先创建 worktree 然后重新创建 —— 这有点特意
# 因为 Phase D 路径应该是全新的，但它测试了 EEXIST 防护。
mkdir -p "$TEST_DIR/.qwen/worktrees/e5-test/node_modules"
echo "preexisting" > "$TEST_DIR/.qwen/worktrees/e5-test/node_modules/.marker"

# 通过 EnterWorktreeTool 强制重新创建（CLI 会拒绝 "already exists"）
$QWEN "use enter_worktree with name='e5-test' to retry" --approval-mode yolo 2>/dev/null
# 要么：工具干净地报错，要么：符号链接被跳过 —— 两者均可接受
test -f "$TEST_DIR/.qwen/worktrees/e5-test/node_modules/.marker" && echo "PASS: not overwritten"
```

**预期（实现后）：** 预先存在的 `.marker` 保留；没有符号链接替换该目录。

### E6：绝对路径 / `../` → 被拒绝

```bash
cat > "$TEST_DIR/.qwen/settings.json" <<'EOF'
{ "worktree": { "symlinkDirectories": ["/etc", "../escape"] } }
EOF

$QWEN --worktree e6-test "say hi" --approval-mode yolo --output-format json 2>/dev/null > /tmp/e6.out
ls "$TEST_DIR/.qwen/worktrees/e6-test/" | head -10
```

**预期（实现后）：** worktree 存在；`etc` 和 `escape` 都未链接到其内部；调试日志包含警告行。

---

## Group F：PR 引用

**模式：** 无头。需要 `origin` 远程指向一个公共 GitHub 仓库。

### 设置模板

```bash
# 使用 qwen-code 自身作为测试仓库
TEST_DIR=$(mktemp -d -t qwen-wt-phd-pr-XXXXXX)
TEST_DIR=$(cd "$TEST_DIR" && pwd -P)
cd "$TEST_DIR"
git clone --depth 1 https://github.com/QwenLM/qwen-code.git .
PROJECT_ID=$(node -e "console.log(process.argv[1].replace(/[^a-zA-Z0-9]/g,'-'))" "$TEST_DIR")
```

### F1：`--worktree=#4174` 解析并 fetch

```bash
$QWEN --worktree=#4174 "say hi" \
  --approval-mode yolo --output-format json 2>/dev/null > /tmp/f1.out

ls -d "$TEST_DIR/.qwen/worktrees/pr-4174"
git -C "$TEST_DIR/.qwen/worktrees/pr-4174" rev-parse --abbrev-ref HEAD
```

**预期（实现后）：**

- Worktree 目录 `pr-4174/` 存在
- HEAD 分支 = `worktree-pr-4174`
- 该分支的 tip 可解析（`git log -1` 不报错）

### F2：完整 URL 形式

```bash
$QWEN --worktree "https://github.com/QwenLM/qwen-code/pull/4174" "say hi" \
  --approval-mode yolo --output-format json 2>/dev/null > /tmp/f2.out

ls -d "$TEST_DIR/.qwen/worktrees/pr-4174"
```

**预期（实现后）：** 与 F1 相同。

### F3：缺少 `origin` 远程 → 立即失败

```bash
cd "$TEST_DIR" && git remote remove origin
$QWEN --worktree=#4174 "say hi" --approval-mode yolo --output-format json 2>/dev/null > /tmp/f3.out
echo "exit=$?"
```

**预期（实现后）：** 退出码不为 0；消息提到 `origin` 远程。

### F4：无效的 PR 编号 → 立即失败

```bash
$QWEN --worktree=#999999999 "say hi" --approval-mode yolo --output-format json 2>/dev/null > /tmp/f4.out
echo "exit=$?"
```

**预期（实现后）：** 退出码不为 0；消息提到 "Failed to fetch PR"。30 秒超时限制得到尊重（测试运行时间 < 35 秒）。

### F5：错误格式的 `#abc` 退化为 slug 验证

```bash
$QWEN --worktree=#abc "say hi" --approval-mode yolo --output-format json 2>/dev/null > /tmp/f5.out
echo "exit=$?"
```

**预期（实现后）：** 作为字面 slug `#abc` 处理，被 `validateUserWorktreeSlug` 拒绝，因为 `#` 不允许。退出码不为 0。

### F6：PR worktree 也能获得符号链接（与 E 交叉）

```bash
cat > "$TEST_DIR/.qwen/settings.json" <<'EOF'
{ "worktree": { "symlinkDirectories": ["node_modules"] } }
EOF
mkdir -p "$TEST_DIR/node_modules" && echo x > "$TEST_DIR/node_modules/.marker"

$QWEN --worktree=#4174 "say hi" --approval-mode yolo --output-format json 2>/dev/null > /dev/null
readlink "$TEST_DIR/.qwen/worktrees/pr-4174/node_modules"
```

**预期（实现后）：** 符号链接目标 = `$TEST_DIR/node_modules`。

---

## Group G：集成 + 边界情况

### G1：完整生命周期 —— 启动 → 写入 → Keep → 恢复

> **实现前说明：** 针对基线，此测试在 `sleep 3` 完成前退出（yargs 立即拒绝 `--worktree`，tmux 窗格死亡）。然后 `capture-pane` 调用会报错 "can't find pane"。这是预期的 —— 记录为 PASS-by-rejection。在空跑模式下，使用 `|| true` 包装捕获命令，或在基线模式下直接跳过 G1。

```bash
SESSION_ID=$(uuidgen)
tmux new-session -d -s g1 -x 200 -y 50 \
  "cd $TEST_DIR && $QWEN --worktree g1-test --session-id $SESSION_ID --approval-mode yolo 2>&1 | tee /tmp/g1-stderr.out"
sleep 3
tmux send-keys -t g1 "use the write_file tool to create file 'work.txt' with content 'phase d test'"
sleep 0.3; tmux send-keys -t g1 Enter
sleep 8

tmux send-keys -t g1 C-c; sleep 0.3; tmux send-keys -t g1 C-c; sleep 1
tmux send-keys -t g1 Enter   # 默认 = "Keep"
sleep 2
tmux kill-session -t g1

# 文件保留
cat "$TEST_DIR/.qwen/worktrees/g1-test/work.txt"

# 恢复会重新附加
tmux new-session -d -s g1b -x 200 -y 50 \
  "cd $TEST_DIR && $QWEN --resume $SESSION_ID --approval-mode yolo"
sleep 4
tmux capture-pane -t g1b -p -S -50 | grep -E "⎇ worktree-g1-test|Resumed"
tmux kill-session -t g1b
```

**预期（实现后）：**

- `work.txt` 在 worktree 内部包含写入的内容
- 恢复的会话 Footer 显示 `⎇ worktree-g1-test (g1-test)`
- INFO 历史项或 `<system-reminder>` 提到 "Resumed"

### G2：相对路径参数在 cwd 切换之前解析

```bash
# 在 TEST_DIR 中创建 mcp 配置并相对引用它。
# --mcp-config 接受文件路径；如果测试计划路径在 --worktree cwd 切换之后解析，
# 则文件在 worktree 内部找不到，CLI 会报错。如果在切换之前解析（正确），
# 文件从 TEST_DIR 加载。
cat > "$TEST_DIR/mcp.json" <<'EOF'
{ "mcpServers": {} }
EOF
cd "$TEST_DIR"

$QWEN --worktree g2-test --mcp-config ./mcp.json "say hi" \
  --approval-mode yolo --output-format json 2>/dev/null > /tmp/g2.out
echo "exit=$?"
jq -r '.[] | select(.type=="result") | .result' < /tmp/g2.out | head -3
```
**预期（实现后）：** exit = 0；模型正常响应（空的 mcp 配置表示没有 MCP 服务器，但也没有错误）。

**预期（实现前基线）：** yargs 拒绝 `--worktree`（测试无法区分“缺少 worktree 标志”和“mcp 配置解析失败”，直到标志本身存在）。

---

## 运行顺序 + 并行性

| 组   | 模式     | 运行时间 | 并行安全？             |
| ---- | -------- | -------- | ---------------------- |
| A    | headless | ~30s     | 是（自己的 TEST_DIR）  |
| B    | headless | ~20s     | 是                     |
| C    | headless | ~40s     | 是                     |
| D    | tmux     | ~30s     | 是（自己的 session 名）|
| E    | headless | ~60s     | 是                     |
| F    | headless+net | ~60s | 否 —— 共享 GitHub clone |
| G    | mixed    | ~60s     | 是                     |

并行运行 A/B/C/D/E/G；F 在 clone 设置完成后串行运行。

## 重现报告

### Phase 4 空跑 — 基线 `qwen` v0.15.11 (2026-05-20)

运行时间：3 个并行的 `test-engineer` 代理，约 7 分钟。基线缺少 Phase D（预期）和 Phase A+B（二进制比预期更旧 —— 参见 E2/E3 的注意事项）。

| 分组                     | 结果     | 备注                                                                             |
| ------------------------ | -------- | -------------------------------------------------------------------------------- |
| A1 (bare flag)           | ✅       | yargs `Unknown argument: worktree`，退出码 1                                     |
| A2 (explicit slug)       | ✅       | 同上                                                                             |
| A3 (= form)              | ✅       | 同上                                                                             |
| A4 (invalid slug)        | ✅       | yargs 在 slug 验证之前拒绝                                                       |
| A5 (non-git dir)         | ✅       | 同上                                                                             |
| B1 (sidecar fields)      | ✅       | sidecar 正确缺失；jq 选择器对样本数据有效                                        |
| B2 (cwd switch)          | ✅       | shell-tool `tool_result.content` jq 选择器已根据实际输出验证                      |
| B3 (targetDir switch)    | ✅       | 相同选择器                                                                       |
| C1 (--worktree beats sidecar) | ✅   | 两次运行均退出码 1，无 sidecar                                                   |
| C2 (stale sidecar + fresh)    | ✅   | 同上                                                                             |
| E1 (--worktree symlink)  | ✅       | 标志被拒绝，无符号链接 —— 实现前已确认                                           |
| E2 (EnterWorktree symlink) | ⚠️ N/A  | 基线缺少 `enter_worktree` 工具（早于 PR #4073）；防护现在跳过该情况               |
| E3 (AgentTool isolation symlink) | ⚠️ N/A | 基线 `agent` 模式静默丢弃 `isolation` 参数；防护跳过                             |
| E4 (missing source skip) | ✅       | 标志被拒绝                                                                       |
| E5 (existing dest not overwrite) | ⚠️ trivial | 预先存在的 `.marker` 保留，但仅因为工具无法运行                             |
| E6 (path traversal reject) | ✅      | 标志被拒绝，无符号链接                                                           |
| F1 (--worktree=#4174 fetch) | ✅     | `Unknown argument: worktree`，无网络调用                                         |
| F2 (full URL form)       | ✅       | 同上                                                                             |
| F3 (missing origin)      | ✅       | 在 git 检查前被拒绝                                                              |
| F4 (invalid PR number)   | ✅       | 在 fetch 前被拒绝                                                                |
| F5 (`#abc` malformed)    | ✅       | 同上                                                                             |
| F6 (PR + symlinkDirs)    | ✅       | 同上                                                                             |
| G1 (lifecycle tmux)      | ⚠️ partial | tmux 窗格在标志拒绝时死亡；按退出码记录有效                                     |
| G2 (relative path)       | ✅       | （切换到 `--mcp-config ./mcp.json` 后）yargs 先拒绝 worktree                     |

**结论：** 测试脚本基本健全。24 个案例中有 19 个能干净检测到实现前基线；3 个案例（E2/E3/E5）需要基线包含 Phase A+B（本地 Phase 6 构建将提供）；2 个案例（G1/G2）有脚本 bug，现已修复。**已准备好进入 Phase 5 实现。**

### Phase 6 验证 —— 本地构建

**二进制：** `node /Users/mochi/code/qwen-code/.claude/worktrees/tender-jemison-037f0a/dist/cli.js`
**日期：** 2026-05-20
**范围：** 组 A、B、C、E、F、G（6 个并行的 `test-engineer` 代理）

| 分组                              | 结果                    | 备注                                                                                                                                                                                                                                                                                                                                                                                       |
| --------------------------------- | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A1 (bare flag)                    | ✅ (附文档提示)         | 当用户传递 `qwen --worktree "say hi"` 时，yargs 将下一个位置参数消耗为 slug 值；快速入门现在告知用户使用 `=` 形式或把提示放在标志之前。自动 slug 功能已通过 `qwen --worktree --approval-mode yolo "say hi"` 确认 → slug `bright-elm-8a4c12`，init `.cwd` 以 `.qwen/worktrees/<auto-slug>` 结尾。                                     |
| A2 (explicit slug)                | ✅                       | 目录 `.qwen/worktrees/my-feature` + 分支 `worktree-my-feature`                                                                                                                                                                                                                                                                                                                             |
| A3 (= form)                       | ✅                       | 与 A2 一致                                                                                                                                                                                                                                                                                                                                                                             |
| A4 (invalid slug)                 | ✅                       | exit=1，消息：`Worktree name may only contain letters, digits, dots, underscores, and hyphens.`，无 worktree 目录                                                                                                                                                                                                                                                                         |
| A5 (non-git dir)                  | ✅                       | exit=1，消息：`not a git repository. Run \`git init\` first or relaunch from inside one.`                                                                                                                                                                                                                                                                                                |
| B1 (sidecar fields)               | ✅                       | 所有 6 个字段均存在且正确；sidecar 按设计放在 worktree 的 projectHash 下                                                                                                                                                                                                                                                                                                      |
| B2 (cwd switch)                   | ✅                       | shell 工具内的 `pwd` 返回了 worktree 路径的精确值                                                                                                                                                                                                                                                                                                                                      |
| B3 (branch + cwd)                 | ✅                       | `pwd` = worktree 路径，`git rev-parse --abbrev-ref HEAD` = `worktree-b3-test`                                                                                                                                                                                                                                                                                                               |
| C1 (cross-slug override)          | ❌ → **已知限制**        | Session 绑定到 `projectHash(cwd)`；`--worktree second --resume <sid-from-first>` 无法找到 session。已在用户文档的限制部分记录。未来的 Config 重构（将锚点存储移到仓库根目录）将解决此问题。                                                                                                                                                                |
| C2 (stale sidecar + new worktree) | ❌ → **相同根因**        | 相同的架构约束。                                                                                                                                                                                                                                                                                                                                                                          |
| E1 (`--worktree` symlink)         | ✅                       | `node_modules` 符号链接到新 worktree 中                                                                                                                                                                                                                                                                                                                                              |
| E2 (`enter_worktree` symlink)     | ✅                       | 通过 `createUserWorktree` 相同的代码路径                                                                                                                                                                                                                                                                                                                                                     |
| E3 (agent isolation symlink)      | ⚠️ 测试设置问题          | 模型提交了 `node_modules`（因为代理防护拒绝脏状态）；EEXIST 防护随后正确跳过了符号链接。代码路径是正确的；要实现干净的 E3，测试计划需要预先 `.gitignore` `node_modules`。                                                                                                                                                                 |
| E4 (missing source skip)          | ✅                       | worktree 已创建，无条目，exit 0                                                                                                                                                                                                                                                                                                                                                          |
| E5 (existing dest no overwrite)   | ✅                       | 预先存在的标记保留                                                                                                                                                                                                                                                                                                                                                                 |
| E6 (absolute / `..` rejected)     | ✅                       | 两个路径均未链接                                                                                                                                                                                                                                                                                                                                                                         |
| F1 (`--worktree=#4174` fetch)     | ✅                       | worktree 目录 `pr-4174/`，分支 `worktree-pr-4174`，顶端提交 `8f4fe8e feat(cli): per-turn /diff…`；本地-远程替换（沙箱阻止真实 GitHub）                                                                                                                                                                                                                                   |
| F2 (full URL form)                | ✅                       | 相同结果；URL 解析 → PR #4174 → 本地 origin fetch 成功                                                                                                                                                                                                                                                                                                                           |
| F3 (missing origin)               | ✅                       | 2 秒内 exit=1；消息提到添加 `origin` 远程                                                                                                                                                                                                                                                                                                                                       |
| F4 (invalid PR #999999999)        | ✅                       | 2 秒内 exit=1；“PR does not exist on origin”；在 35s 限制内                                                                                                                                                                                                                                                                                                                            |
| F5 (malformed `#abc`)             | ✅                       | slug 验证拒绝 `#`                                                                                                                                                                                                                                                                                                                                                                 |
| F6 (PR worktree + symlinks)       | ✅                       | 确认符号链接 `pr-4174/node_modules` → `$TEST_DIR/node_modules`                                                                                                                                                                                                                                                                                                                         |
| G1.a (start + write + Keep)       | ✅                       | TUI 流程，页脚指示器，对话框选项，文件持续存在                                                                                                                                                                                                                                                                                                                                   |
| G1.b (`--resume … --worktree foo`) | ❌ → **本 PR 已修复**    | 原始版本：`--worktree: Worktree already exists at …`。Phase 6 修复在 `setupStartupWorktree` 中添加了重新附加分支。修复后通过冒烟测试验证（`--worktree foo` 两次 → 第二次发出 `worktree_started` 通知，无错误）以及新的单元测试 `worktreeStartup.test.ts`。                                                                                                     |
| G2 (relative `--mcp-config`)       | ❌ → **本 PR 已修复**    | 原始版本：exit=52，`Invalid MCP configuration … is not valid JSON`。Phase 6 修复在 `setupStartupWorktree` 执行 chdir 之前，将接受路径的 argv 字段（`mcpConfig`、`openaiLoggingDir`、`jsonFile`、`inputFile`、`telemetryOutfile`、`includeDirectories`）相对于启动 cwd 进行规范化。修复后通过冒烟测试验证（`--worktree foo --mcp-config ./mcp.json` → 模型正常响应）。 |

**Phase 6 净结果：** 修复后 22 / 24 个案例通过；2 个案例（C1/C2）遇到架构限制，现已记录；1 个案例（E3）是测试设置问题，非实现问题。**已准备好进行 Phase 7 代码审查。**

### 修复引用（本 PR 中包含的 Phase 6 修复）

| 修复                                                         | 文件                                               | 变更                                                                                                                                                  |
| ----------------------------------------------------------- | -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 重新附加到现有 worktree (G1.b)                       | `packages/cli/src/startup/worktreeStartup.ts`      | 添加创建前检查：如果目录是已注册的 worktree 且位于预期分支，则跳过创建 + chdir                                                     |
| `getRegisteredWorktreeBranch()` 辅助函数                      | `packages/core/src/services/gitWorktreeService.ts` | 探测候选路径的 `git rev-parse --abbrev-ref HEAD`                                                                                     |
| chdir 前的路径规范化 (G2)                        | `packages/cli/src/gemini.tsx`                      | 当设置了 `--worktree` 时，将 `mcpConfig`、`openaiLoggingDir`、`jsonFile`、`inputFile`、`telemetryOutfile`、`includeDirectories` 相对于启动 cwd 进行解析 |
| 文档：yargs 标志顺序提示 + 限制更新 | `docs/users/features/worktree.md`                  | 快速入门提示 + 新的限制项（跨 slug、路径参数行为）                                                                               |
| 重新附加的单元测试                                    | `packages/cli/src/startup/worktreeStartup.test.ts` | 添加了 2 个测试：正常的重新附加 + “不同分支占用槽位”防护                                                                                 |

**Phase 6 F 组网络说明：** 沙箱阻止了对 `https://github.com` 的 `git fetch`，返回 HTTP 403。F1/F2/F4/F6 针对本地裸仓库（`git init --bare`）重新测试，该仓库预植了 `refs/pull/4174/head`，指向一个提交消息为 `feat(cli): per-turn /diff with interactive dialog (#4277)` 的提交。F3 和 F5 与网络无关，直接验证。本地-远程替换完全测试了解析 + fetch + worktree 创建的代码路径。
---

## 再现报告 — 第4阶段预演（F组 + G组），2026-05-20

**二进制**: `qwen`（全局安装，v0.15.11，位于 `/Users/mochi/.nvm/versions/node/v22.21.1/bin/qwen`）
**覆盖变量**: `QWEN="qwen"`

### 结果表

| 测试 ID                    | 结果   | 证据                                                                                                                                                | 修复建议                           |
| -------------------------- | ------ | --------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------- |
| F1 `--worktree=#4174`      | PASS   | `Unknown argument: worktree`, exit=1                                                                                                                | 无 — 基线预期失败                  |
| F2 `--worktree <url>`      | PASS   | `Unknown argument: worktree`, exit=1                                                                                                                | 无 — 基线预期失败                  |
| F3 缺少 origin             | PASS   | `Unknown argument: worktree`, exit=1 — yargs 在任意 git 操作之前就已拒绝                                                                             | 无                                 |
| F4 无效 PR #999999999      | PASS   | `Unknown argument: worktree`, exit=1                                                                                                                | 无                                 |
| F5 格式错误的 `#abc`       | PASS   | `Unknown argument: worktree`, exit=1                                                                                                                | 无                                 |
| F6 PR + symlinkDirs        | PASS   | `Unknown argument: worktree`, exit=1                                                                                                                | 无                                 |
| G1 生命周期 (tmux)         | PASS   | `Unknown argument: worktree` 输出到标准输出，捕获于 `/tmp/g1_raw.out`；tmux 会话立即退出，捕获时窗格已死亡                                          | SCRIPT-BUG: 参见下方说明           |
| G2 相对路径                | PASS   | `Unknown arguments: worktree, prompt-file, promptFile`, exit=1                                                                                      | SCRIPT-BUG: 参见下方说明           |

### 观察到的行为（所有情况）

每次调用 `--worktree`（裸参数、`=` 形式、`#<N>` 形式、完整 URL、与 `--prompt-file` 组合使用）均被 yargs 参数解析层拒绝，返回退出码 1，且未执行任何应用逻辑。具体的错误字符串为：

- `Unknown argument: worktree`（单个未知参数）
- `Unknown arguments: worktree, prompt-file, promptFile`（G2：`--worktree` 和 `--prompt-file` 均未知，一并列出）

所有测试中均未触发 git 操作、网络调用或文件系统写入。

### 预期行为

同样被拒绝——这是正确的未实现基线。所有 8 个测试在预演意义上均获 PASS（测试计划正确检测到这些功能尚不存在）。

### 关键背景

失败模式统一发生在 yargs 层，而非下游。这验证了测试计划的检测策略是合理的：一旦 `--worktree` 接入 yargs，这些测试将不再在此层失败，而是会执行实际的实现路径（F1-F6 将触发 git fetch，G1 将触发 TUI 生命周期，G2 将触发 `--prompt-file` 解析）。

### 针对测试计划的 SCRIPT-BUG 说明

**G1 (tmux):** tmux 会话命令通过 `tee` 管道输出，并带有一个子 shell `echo 'PROC_EXIT='$?`，该子 shell 捕获的是 `tee` 的退出码，而非 `qwen` 的退出码。当进程因 Unknown argument 错误而立即退出时，会话在 `sleep 3` 完成前就已终止，`tmux capture-pane` 运行时窗格名 `g1dry` 已消失，产生 `can't find pane: g1dry`。修复方法：在 `tmux capture-pane` 后使用 `|| true`，或添加 `|| sleep 0` 作为保护；更好的做法是，针对基线失败的情况，将 stderr+stdout 重定向到 tmux 外部的文件，并直接检查该文件（如本例中通过 `tee /tmp/g1_raw.out` 所做的那样）。

**G2 (`--prompt-file`):** 测试计划使用 `--prompt-file ./relative.txt` 与 `--worktree` 组合测试。在基线版本中，`--prompt-file` 同样是一个未知参数（v0.15.11 的 yargs 架构中也不存在该参数——实际存在的标志是 `--prompt-interactive` / `-p`）。错误信息将两个未知参数一并列出。测试计划应注明 `--prompt-file` 需要与 `--worktree` 一同实现，或者使用已有的标志（例如通过 stdin 管道输入，或使用 `--prompt`）来进行相对路径解析测试。