# Worktree Phase C 端到端测试计划

## 范围

针对本地构建版本（位于 `/Users/mochi/code/qwen-code/.claude/worktrees/romantic-burnell-b6e48c/dist/cli.js`）的 Phase C 功能进行端到端验证。

Phase C 交付的内容：

- **任务 1、3、4** — `WorktreeSession` sidecar JSON 文件，位于 `~/.qwen/tmp/<projectHash>/chats/<sessionId>.worktree.json`
- **任务 2** — 在新 worktree 内配置 `core.hooksPath`
- **任务 5–6** — `useWorktreeSession` hook、`UIState.activeWorktree`、Footer worktree 指示器、`StatusLineCommandInput.worktree` 字段
- **任务 7** — 当活跃 worktree 仍存在时，`--resume` 注入一条 INFO 历史项；否则清理过期的 sidecar
- **任务 8** — `WorktreeExitDialog`，包含脏状态检查，在活跃 worktree 中拦截第二次 Ctrl+C

## 可执行文件

- **本地构建**: `node /Users/mochi/code/qwen-code/.claude/worktrees/romantic-burnell-b6e48c/dist/cli.js`
- **基线版本（如需与实现前对比）**: 全局安装的 `qwen`

## 测试环境模板

每个组都在自己的临时 git 仓库和 tmux 会话中运行：

```bash
TEST_DIR=$(mktemp -d -t qwen-wt-phc-XXXXXX)
TEST_DIR=$(cd "$TEST_DIR" && pwd -P)   # resolve symlinks (macOS /var → /private/var)
cd "$TEST_DIR"
git init -q -b main
git config user.email t@e.com
git config user.name t
git config commit.gpgsign false
echo "hello" > README.md
git add README.md
git commit -q -m "initial" --no-verify
```

`QWEN=/Users/mochi/code/qwen-code/.claude/worktrees/romantic-burnell-b6e48c/dist/cli.js`

---

## 组 A：WorktreeSession sidecar（无头模式）

**模式：** 无头，`--approval-mode yolo`，`--output-format json`

### A1：enter_worktree 写入包含所有字段的 sidecar

**步骤：**

```bash
SESSION=$(node $QWEN "use the enter_worktree tool with name='a1-test' to create a worktree" \
  --approval-mode yolo --output-format json 2>/dev/null \
  | jq -r '.[] | select(.type=="system") | .session_id' | head -1)

PROJECT_ID=$(node -e "console.log(process.argv[1].replace(/[^a-zA-Z0-9]/g,'-'))" "$TEST_DIR")
SIDECAR=~/.qwen/projects/$PROJECT_ID/chats/$SESSION.worktree.json

# Verify all fields present
cat "$SIDECAR" | jq '.slug, .worktreePath, .worktreeBranch, .originalCwd, .originalBranch, .originalHeadCommit'
```

**预期结果：**

- `slug` = "a1-test"
- `worktreePath` 以 `.qwen/worktrees/a1-test` 结尾
- `worktreeBranch` = "worktree-a1-test"
- `originalCwd` = `$TEST_DIR`（解析后）
- `originalBranch` = "main"
- `originalHeadCommit` 匹配 `[0-9a-f]{40}`

### A2：exit_worktree（keep）清除 sidecar

**步骤：**

```bash
SESSION=$(node $QWEN "create a worktree named 'a2-test' using enter_worktree, then immediately exit it with action='keep' using exit_worktree" \
  --approval-mode yolo --output-format json 2>/dev/null \
  | jq -r '.[] | select(.type=="system") | .session_id' | head -1)

SIDECAR=~/.qwen/projects/$PROJECT_ID/chats/$SESSION.worktree.json
test ! -f "$SIDECAR" && echo "PASS: sidecar removed" || echo "FAIL: sidecar still exists"
```

**预期结果：** 调用 `exit_worktree` 后 sidecar 文件不存在。

### A3：exit_worktree（remove）清除 sidecar

**步骤：**

```bash
SESSION=$(node $QWEN "create a worktree named 'a3-test' using enter_worktree, then immediately exit it with action='remove' and discard_changes=true using exit_worktree" \
  --approval-mode yolo --output-format json 2>/dev/null \
  | jq -r '.[] | select(.type=="system") | .session_id' | head -1)

SIDECAR=~/.qwen/projects/$PROJECT_ID/chats/$SESSION.worktree.json
test ! -f "$SIDECAR" && echo "PASS: sidecar removed" || echo "FAIL: sidecar still exists"
# Also verify the worktree dir is gone
test ! -d "$TEST_DIR/.qwen/worktrees/a3-test" && echo "PASS: worktree dir removed"
```

**预期结果：** sidecar 和 worktree 目录均已删除。

---

## 组 B：hooksPath 配置（无头模式）

### B1：没有 `.husky/` 时，hooksPath = `<repo>/.git/hooks`

**步骤：**

```bash
node $QWEN "use enter_worktree with name='b1-test' to create a worktree" \
  --approval-mode yolo --output-format json 2>/dev/null > /dev/null

HOOKS_PATH=$(git -C "$TEST_DIR/.qwen/worktrees/b1-test" config --local core.hooksPath)
echo "Got hooksPath: $HOOKS_PATH"
test "$HOOKS_PATH" = "$TEST_DIR/.git/hooks" && echo "PASS" || echo "FAIL"
```

**预期结果：** `$TEST_DIR/.git/hooks`

### B2：有 `.husky/` 时，hooksPath = `<repo>/.husky`

**步骤：**

```bash
mkdir -p "$TEST_DIR/.husky"
echo '#!/bin/sh' > "$TEST_DIR/.husky/pre-commit"
chmod +x "$TEST_DIR/.husky/pre-commit"

node $QWEN "use enter_worktree with name='b2-test' to create a worktree" \
  --approval-mode yolo --output-format json 2>/dev/null > /dev/null

HOOKS_PATH=$(git -C "$TEST_DIR/.qwen/worktrees/b2-test" config --local core.hooksPath)
test "$HOOKS_PATH" = "$TEST_DIR/.husky" && echo "PASS" || echo "FAIL got=$HOOKS_PATH"
```

**预期结果：** `$TEST_DIR/.husky`

### B3：主仓库的 hooks 在 worktree 内部实际触发

**步骤：**

```bash
# Set up a hook that writes a marker file
mkdir -p "$TEST_DIR/.git/hooks"
cat > "$TEST_DIR/.git/hooks/pre-commit" <<'EOF'
#!/bin/sh
echo "hook-fired" > /tmp/qwen-wt-hook-marker
EOF
chmod +x "$TEST_DIR/.git/hooks/pre-commit"

node $QWEN "use enter_worktree with name='b3-test' to create a worktree" \
  --approval-mode yolo --output-format json 2>/dev/null > /dev/null

# Commit something inside the worktree
WT="$TEST_DIR/.qwen/worktrees/b3-test"
echo "x" > "$WT/file.txt"
git -C "$WT" add file.txt
rm -f /tmp/qwen-wt-hook-marker
git -C "$WT" commit -m "trigger hook" 2>&1
test -f /tmp/qwen-wt-hook-marker && echo "PASS: hook fired" || echo "FAIL: hook did not fire"
rm -f /tmp/qwen-wt-hook-marker
```

**预期结果：** 提交后 `/tmp/qwen-wt-hook-marker` 存在。

---

## 组 C：--resume worktree 恢复（无头模式）

### C1：--resume 在 sidecar 存在且目录存活时注入 worktree 上下文

**步骤：**

```bash
# Create initial session with worktree
INIT_OUT=$(node $QWEN "use enter_worktree with name='c1-test' to create a worktree" \
  --approval-mode yolo --output-format json 2>/dev/null)
SESSION=$(echo "$INIT_OUT" | jq -r '.[] | select(.type=="system") | .session_id' | head -1)

# Resume the session and ask "what's my context?"
RESUMED=$(node $QWEN --resume "$SESSION" "say SIDECAR-CONFIRM" \
  --approval-mode yolo --output-format json 2>/dev/null)

# Look for the injected INFO message text in the conversation
echo "$RESUMED" | grep -q "Resumed.*Active worktree.*c1-test" && echo "PASS" || echo "FAIL: no context injection"
```

**预期结果：** JSON 流中包含引用 `c1-test` 的 INFO 消息。

### C2：--resume 在 worktree 目录消失时清理过期的 sidecar

**步骤：**

```bash
INIT_OUT=$(node $QWEN "use enter_worktree with name='c2-test' to create a worktree" \
  --approval-mode yolo --output-format json 2>/dev/null)
SESSION=$(echo "$INIT_OUT" | jq -r '.[] | select(.type=="system") | .session_id' | head -1)
SIDECAR=~/.qwen/projects/$PROJECT_ID/chats/$SESSION.worktree.json

# Delete the worktree directory out-of-band
rm -rf "$TEST_DIR/.qwen/worktrees/c2-test"
test -f "$SIDECAR" || { echo "SKIP: sidecar was already gone"; exit 0; }

# Resume — should clean up the stale sidecar
node $QWEN --resume "$SESSION" "hello" --approval-mode yolo --output-format json 2>/dev/null > /dev/null
test ! -f "$SIDECAR" && echo "PASS: stale sidecar cleaned" || echo "FAIL: stale sidecar still present"
```

**预期结果：** sidecar 文件被删除。

---

## 组 D：Footer worktree 指示器（交互式 tmux）

### D1：Footer 在 enter_worktree 后显示 worktree 指示器

**步骤：**

```bash
tmux new-session -d -s wt-d1 -x 200 -y 50 \
  "cd $TEST_DIR && node $QWEN --approval-mode yolo"
sleep 3

tmux send-keys -t wt-d1 "use enter_worktree with name='d1-test'"
sleep 0.5
tmux send-keys -t wt-d1 Enter

for i in $(seq 1 30); do
  sleep 2
  tmux capture-pane -t wt-d1 -p | grep -q "Type your message" && break
done

# Capture and look for the worktree indicator line in Footer area
tmux capture-pane -t wt-d1 -p -S -100 > /tmp/wt-d1.out
grep -E "⎇.*worktree-d1-test.*\(d1-test\)" /tmp/wt-d1.out && echo "PASS" || \
  { echo "FAIL — captured output:"; cat /tmp/wt-d1.out; }
tmux kill-session -t wt-d1
```

**预期结果：** Footer 包含类似 `⎇ worktree-d1-test (d1-test)` 的行。

### D2：Footer 指示器在 exit_worktree（keep）后消失

**步骤：**

```bash
tmux new-session -d -s wt-d2 -x 200 -y 50 \
  "cd $TEST_DIR && node $QWEN --approval-mode yolo"
sleep 3

tmux send-keys -t wt-d2 "use enter_worktree with name='d2-test'"
sleep 0.5
tmux send-keys -t wt-d2 Enter
for i in $(seq 1 30); do sleep 2; tmux capture-pane -t wt-d2 -p | grep -q "Type your message" && break; done

# Verify indicator showed
tmux capture-pane -t wt-d2 -p -S -100 | grep -q "⎇.*d2-test" || { echo "FAIL: indicator missing before exit"; tmux kill-session -t wt-d2; exit 1; }

# Exit the worktree (keep)
tmux send-keys -t wt-d2 "use exit_worktree with name='d2-test' action='keep'"
sleep 0.5
tmux send-keys -t wt-d2 Enter
for i in $(seq 1 30); do sleep 2; tmux capture-pane -t wt-d2 -p | grep -q "Kept worktree" && break; done

sleep 2  # give Footer a tick to refresh after sidecar removal
tmux capture-pane -t wt-d2 -p -S -100 > /tmp/wt-d2-after.out
# After exit, the indicator should be gone from the bottom panel area
tail -5 /tmp/wt-d2-after.out | grep -q "⎇.*d2-test" && \
  echo "FAIL: indicator still showing" || echo "PASS"
tmux kill-session -t wt-d2
```

**预期结果：** worktree 指示器在 `exit_worktree` 后约 2 秒内从 Footer 消失。

---

## 组 E：WorktreeExitDialog（交互式 tmux）

### E1：在 worktree 中第二次 Ctrl+C 显示对话框而非退出

**步骤：**

```bash
tmux new-session -d -s wt-e1 -x 200 -y 50 \
  "cd $TEST_DIR && node $QWEN --approval-mode yolo"
sleep 3

tmux send-keys -t wt-e1 "use enter_worktree with name='e1-test'"
sleep 0.5
tmux send-keys -t wt-e1 Enter
for i in $(seq 1 30); do sleep 2; tmux capture-pane -t wt-e1 -p | grep -q "Type your message" && break; done

# First Ctrl+C (cleanup; should show "Press Ctrl+C again to exit")
tmux send-keys -t wt-e1 C-c
sleep 0.3
tmux capture-pane -t wt-e1 -p | grep -q "Press Ctrl+C again" || \
  { echo "FAIL: first Ctrl+C didn't show warning"; tmux kill-session -t wt-e1; exit 1; }

# Second Ctrl+C — should show the WorktreeExitDialog, NOT quit
tmux send-keys -t wt-e1 C-c
sleep 2

# Verify the dialog rendered
tmux capture-pane -t wt-e1 -p -S -50 > /tmp/wt-e1.out
grep -q "Active worktree.*e1-test" /tmp/wt-e1.out && \
  grep -q "Keep worktree" /tmp/wt-e1.out && \
  grep -q "Remove worktree" /tmp/wt-e1.out && \
  echo "PASS" || { echo "FAIL — captured:"; cat /tmp/wt-e1.out; }
tmux kill-session -t wt-e1
```

**预期结果：** 对话框显示三个选项（Keep / Remove / Cancel），进程仍然存活。

### E2：对话框显示脏状态计数（提交数 + 文件数）

**步骤：**

```bash
tmux new-session -d -s wt-e2 -x 200 -y 50 \
  "cd $TEST_DIR && node $QWEN --approval-mode yolo"
sleep 3

tmux send-keys -t wt-e2 "use enter_worktree with name='e2-test'"
sleep 0.5
tmux send-keys -t wt-e2 Enter
for i in $(seq 1 30); do sleep 2; tmux capture-pane -t wt-e2 -p | grep -q "Type your message" && break; done

# Make the worktree dirty: 1 new commit + 1 uncommitted file
WT="$TEST_DIR/.qwen/worktrees/e2-test"
echo "new" > "$WT/new.txt"
git -C "$WT" add new.txt
git -C "$WT" commit -q -m "test commit" --no-verify
echo "dirty" > "$WT/uncommitted.txt"

# Trigger exit dialog via Ctrl+C double-press
tmux send-keys -t wt-e2 C-c
sleep 0.3
tmux send-keys -t wt-e2 C-c
sleep 3   # allow time for git status / rev-list

tmux capture-pane -t wt-e2 -p -S -50 > /tmp/wt-e2.out
grep -qE "new commit|uncommitted file" /tmp/wt-e2.out && echo "PASS" || \
  { echo "FAIL — captured:"; cat /tmp/wt-e2.out; }
tmux kill-session -t wt-e2
```

**预期结果：** 对话框正文同时包含“X new commit(s)”和“Y uncommitted file(s)”。

### E3：Cancel 选项关闭对话框而不退出

**步骤：**

```bash
tmux new-session -d -s wt-e3 -x 200 -y 50 \
  "cd $TEST_DIR && node $QWEN --approval-mode yolo"
sleep 3

tmux send-keys -t wt-e3 "use enter_worktree with name='e3-test'"
sleep 0.5
tmux send-keys -t wt-e3 Enter
for i in $(seq 1 30); do sleep 2; tmux capture-pane -t wt-e3 -p | grep -q "Type your message" && break; done

# Trigger dialog
tmux send-keys -t wt-e3 C-c
sleep 0.3
tmux send-keys -t wt-e3 C-c
sleep 3

# Navigate to Cancel (DOWN DOWN) and press Enter
tmux send-keys -t wt-e3 Down
sleep 0.2
tmux send-keys -t wt-e3 Down
sleep 0.2
tmux send-keys -t wt-e3 Enter
sleep 2

# Dialog should be gone; input prompt should be back
tmux capture-pane -t wt-e3 -p | grep -q "Type your message" && echo "PASS" || \
  { echo "FAIL — captured:"; tmux capture-pane -t wt-e3 -p; }

# Verify the worktree was NOT removed
test -d "$TEST_DIR/.qwen/worktrees/e3-test" && echo "worktree intact" || echo "FAIL: worktree gone"
tmux kill-session -t wt-e3
```

**预期结果：** 对话框关闭，输入提示返回，worktree 目录仍然存在。

### E4：Keep 选项退出会话但保留 worktree

**步骤：**

```bash
tmux new-session -d -s wt-e4 -x 200 -y 50 \
  "cd $TEST_DIR && node $QWEN --approval-mode yolo"
sleep 3

tmux send-keys -t wt-e4 "use enter_worktree with name='e4-test'"
sleep 0.5
tmux send-keys -t wt-e4 Enter
for i in $(seq 1 30); do sleep 2; tmux capture-pane -t wt-e4 -p | grep -q "Type your message" && break; done

# Trigger dialog and pick Keep (first option, already selected)
tmux send-keys -t wt-e4 C-c
sleep 0.3
tmux send-keys -t wt-e4 C-c
sleep 3
tmux send-keys -t wt-e4 Enter

# Wait for process to exit
for i in $(seq 1 20); do
  sleep 1
  tmux has-session -t wt-e4 2>/dev/null || break
  tmux capture-pane -t wt-e4 -p | grep -q "\$ " && break  # shell prompt back
done

# Worktree directory should still exist
test -d "$TEST_DIR/.qwen/worktrees/e4-test" && echo "PASS: worktree preserved" || \
  echo "FAIL: worktree was removed"
tmux kill-session -t wt-e4 2>/dev/null || true
```

**预期结果：** 进程退出，worktree 目录保留在磁盘上。

### E5：Remove 选项退出会话并删除 worktree

**步骤：**

```bash
tmux new-session -d -s wt-e5 -x 200 -y 50 \
  "cd $TEST_DIR && node $QWEN --approval-mode yolo"
sleep 3

tmux send-keys -t wt-e5 "use enter_worktree with name='e5-test'"
sleep 0.5
tmux send-keys -t wt-e5 Enter
for i in $(seq 1 30); do sleep 2; tmux capture-pane -t wt-e5 -p | grep -q "Type your message" && break; done

# Trigger dialog and pick Remove (DOWN, Enter)
tmux send-keys -t wt-e5 C-c
sleep 0.3
tmux send-keys -t wt-e5 C-c
sleep 3
tmux send-keys -t wt-e5 Down
sleep 0.2
tmux send-keys -t wt-e5 Enter

# Wait for exit
for i in $(seq 1 20); do
  sleep 1
  tmux has-session -t wt-e5 2>/dev/null || break
  tmux capture-pane -t wt-e5 -p | grep -q "\$ " && break
done

# Worktree directory should be GONE
test ! -d "$TEST_DIR/.qwen/worktrees/e5-test" && echo "PASS: worktree removed" || \
  echo "FAIL: worktree still on disk"
# Branch should also be deleted
git -C "$TEST_DIR" branch --list | grep -q "worktree-e5-test" && \
  echo "FAIL: branch still present" || echo "PASS: branch removed"
tmux kill-session -t wt-e5 2>/dev/null || true
```

**预期结果：** 进程退出，worktree 目录删除，分支 `worktree-e5-test` 删除。

---

## 组 F：真实用户工作流模拟（交互式 tmux）

### F1：完整流程：进入 → 编辑 → 提交 → 恢复 → 退出（keep）

**步骤：**

```bash
tmux new-session -d -s wt-f1 -x 200 -y 50 \
  "cd $TEST_DIR && node $QWEN --approval-mode yolo"
sleep 3

# Step 1: enter worktree
tmux send-keys -t wt-f1 "use enter_worktree with name='f1-feature' to create a worktree"
sleep 0.5
tmux send-keys -t wt-f1 Enter
for i in $(seq 1 30); do sleep 2; tmux capture-pane -t wt-f1 -p | grep -q "Type your message" && break; done

# Step 2: read the absolute worktree path so the model knows where to write
WT="$TEST_DIR/.qwen/worktrees/f1-feature"
tmux send-keys -t wt-f1 "write the file $WT/hello.txt with content 'hi from worktree'"
sleep 0.5
tmux send-keys -t wt-f1 Enter
for i in $(seq 1 60); do sleep 2; tmux capture-pane -t wt-f1 -p | grep -q "Type your message" && break; done

# Verify the file was actually written INSIDE the worktree
test -f "$WT/hello.txt" && grep -q "hi from worktree" "$WT/hello.txt" && \
  echo "PASS: file written inside worktree" || echo "FAIL: file not in worktree"

# Step 3: Exit with keep via the tool
tmux send-keys -t wt-f1 "use exit_worktree with name='f1-feature' action='keep'"
sleep 0.5
tmux send-keys -t wt-f1 Enter
for i in $(seq 1 30); do sleep 2; tmux capture-pane -t wt-f1 -p | grep -q "Kept worktree" && break; done

# Step 4: Verify worktree still on disk after exit
test -d "$WT" && echo "PASS: worktree kept" || echo "FAIL: worktree removed"
test -f "$WT/hello.txt" && echo "PASS: file persists" || echo "FAIL"

tmux kill-session -t wt-f1
```

**预期结果：**

- 文件已写入 worktree 目录（而非主仓库）
- 退出 `keep` 后，worktree 目录和文件均保留

### F2：自定义状态栏接收 `worktree` 负载

**步骤：**

```bash
# Create a statusline script that prints the JSON it receives via stdin
SETTINGS_DIR=~/.qwen
SETTINGS_FILE=$SETTINGS_DIR/settings.json
cp -f "$SETTINGS_FILE" /tmp/qwen-settings-backup.json 2>/dev/null || true
mkdir -p "$SETTINGS_DIR"
SL_SCRIPT=/tmp/qwen-wt-statusline.sh
cat > $SL_SCRIPT <<'EOF'
#!/bin/sh
INPUT=$(cat)
echo "$INPUT" > /tmp/qwen-wt-statusline-input.json
WT_NAME=$(echo "$INPUT" | jq -r '.worktree.name // "no-worktree"')
echo "WT=$WT_NAME"
EOF
chmod +x $SL_SCRIPT

cat > "$SETTINGS_FILE" <<EOF
{"ui":{"statusLine":{"type":"command","command":"$SL_SCRIPT"}}}
EOF

tmux new-session -d -s wt-f2 -x 200 -y 50 \
  "cd $TEST_DIR && node $QWEN --approval-mode yolo"
sleep 5  # statusline needs an extra tick

tmux send-keys -t wt-f2 "use enter_worktree with name='f2-test'"
sleep 0.5
tmux send-keys -t wt-f2 Enter
for i in $(seq 1 30); do sleep 2; tmux capture-pane -t wt-f2 -p | grep -q "Type your message" && break; done

sleep 3  # let statusline refresh after sidecar change

# Inspect the captured payload
cat /tmp/qwen-wt-statusline-input.json | jq '.worktree.name, .worktree.path, .worktree.branch'

# Verify built-in Footer indicator is HIDDEN when custom statusline is active
tmux capture-pane -t wt-f2 -p -S -100 > /tmp/wt-f2.out
grep -q "WT=f2-test" /tmp/wt-f2.out && echo "PASS: custom statusline rendered" || echo "FAIL"
tmux kill-session -t wt-f2

# Restore settings
cp -f /tmp/qwen-settings-backup.json "$SETTINGS_FILE" 2>/dev/null || rm -f "$SETTINGS_FILE"
```

**预期结果：**

- `/tmp/qwen-wt-statusline-input.json` 具有 `.worktree.name == "f2-test"`、`.path`、`.branch` 已设置
- 自定义状态栏输出 `WT=f2-test` 出现在 Footer 中
- 内置的 `⎇ worktree-...` 行未渲染（被自定义状态栏抑制）

---

## 通过标准总结

| 组   | 测试                         | 预期结果                                     |
| ---- | ---------------------------- | -------------------------------------------- |
| A    | A1 enter 写入 sidecar        | 所有 6 个字段均已填充                        |
| A    | A2 keep 清除 sidecar         | 文件已删除                                   |
| A    | A3 remove 清除 sidecar       | 文件 + 目录已删除                            |
| B    | B1 hooksPath 回退            | `<repo>/.git/hooks`                          |
| B    | B2 hooksPath husky           | `<repo>/.husky`                              |
| B    | B3 hook 在 worktree 中触发   | marker 文件已写入                            |
| C    | C1 resume 注入上下文         | INFO 消息存在                                |
| C    | C2 过期 sidecar 清理         | sidecar 已删除                               |
| D    | D1 footer 显示 worktree      | `⎇ worktree-...` 已渲染                      |
| D    | D2 footer 在退出后隐藏       | 指示器消失                                   |
| E    | E1 第二次 Ctrl+C 显示对话框  | 对话框可见，会话存活                         |
| E    | E2 脏状态计数               | 显示提交数 + 文件数                          |
| E    | E3 Cancel                    | 对话框消失，会话存活                         |
| E    | E4 Keep                      | 会话退出，worktree 保留                      |
| E    | E5 Remove                    | 会话退出，worktree 删除                      |
| F    | F1 完整工作流                | 文件在 worktree 中，keep 后保留              |
| F    | F2 自定义状态栏              | 收到 worktree 负载，内置 footer 被抑制       |