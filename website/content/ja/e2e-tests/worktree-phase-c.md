# Worktree Phase C E2E テスト計画

## スコープ

ローカルビルド `/Users/mochi/code/qwen-code/.claude/worktrees/romantic-burnell-b6e48c/dist/cli.js` に対する Phase C 機能のエンドツーエンド検証。

Phase C で提供される機能:

- **Task 1, 3, 4** — `WorktreeSession` サイドカーJSONファイル (`~/.qwen/tmp/<projectHash>/chats/<sessionId>.worktree.json`)
- **Task 2** — 新しい worktree内で `core.hooksPath` が設定される
- **Task 5–6** — `useWorktreeSession` フック、`UIState.activeWorktree`、Footer の worktree インジケータ、`StatusLineCommandInput.worktree` フィールド
- **Task 7** — `--resume` はアクティブな worktree がまだ存在する場合に INFO 履歴アイテムを注入する。そうでなければ、古くなったサイドカーをクリーンアップする。
- **Task 8** — `WorktreeExitDialog` によるダーティ状態の検査。アクティブな worktree での2回目の Ctrl+C をインターセプトする。

## バイナリ

- **ローカルビルド**: `node /Users/mochi/code/qwen-code/.claude/worktrees/romantic-burnell-b6e48c/dist/cli.js`
- **ベースライン（実装前の比較が必要な場合）**: グローバルにインストールされた `qwen`

## テスト環境テンプレート

各グループは、自身の一時的な Git リポジトリと tmux セッションで実行します:

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

## Group A: WorktreeSession サイドカー（ヘッドレス）

**モード:** ヘッドレス、`--approval-mode yolo`、`--output-format json`

### A1: enter_worktree ですべてのフィールドを含むサイドカーを書き込む

**手順:**

```bash
SESSION=$(node $QWEN "use the enter_worktree tool with name='a1-test' to create a worktree" \
  --approval-mode yolo --output-format json 2>/dev/null \
  | jq -r '.[] | select(.type=="system") | .session_id' | head -1)

PROJECT_ID=$(node -e "console.log(process.argv[1].replace(/[^a-zA-Z0-9]/g,'-'))" "$TEST_DIR")
SIDECAR=~/.qwen/projects/$PROJECT_ID/chats/$SESSION.worktree.json

# すべてのフィールドが存在することを確認
cat "$SIDECAR" | jq '.slug, .worktreePath, .worktreeBranch, .originalCwd, .originalBranch, .originalHeadCommit'
```

**期待される結果:**

- `slug` = "a1-test"
- `worktreePath` の末尾は `.qwen/worktrees/a1-test`
- `worktreeBranch` = "worktree-a1-test"
- `originalCwd` = `$TEST_DIR` (解決済み)
- `originalBranch` = "main"
- `originalHeadCommit` は `[0-9a-f]{40}` に一致

### A2: exit_worktree (keep) でサイドカーをクリア

**手順:**

```bash
SESSION=$(node $QWEN "create a worktree named 'a2-test' using enter_worktree, then immediately exit it with action='keep' using exit_worktree" \
  --approval-mode yolo --output-format json 2>/dev/null \
  | jq -r '.[] | select(.type=="system") | .session_id' | head -1)

SIDECAR=~/.qwen/projects/$PROJECT_ID/chats/$SESSION.worktree.json
test ! -f "$SIDECAR" && echo "PASS: sidecar removed" || echo "FAIL: sidecar still exists"
```

**期待される結果:** exit_worktree 呼び出し後、サイドカーファイルは存在しない。

### A3: exit_worktree (remove) でサイドカーをクリア

**手順:**

```bash
SESSION=$(node $QWEN "create a worktree named 'a3-test' using enter_worktree, then immediately exit it with action='remove' and discard_changes=true using exit_worktree" \
  --approval-mode yolo --output-format json 2>/dev/null \
  | jq -r '.[] | select(.type=="system") | .session_id' | head -1)

SIDECAR=~/.qwen/projects/$PROJECT_ID/chats/$SESSION.worktree.json
test ! -f "$SIDECAR" && echo "PASS: sidecar removed" || echo "FAIL: sidecar still exists"
# さらに、worktree ディレクトリが削除されたことを確認
test ! -d "$TEST_DIR/.qwen/worktrees/a3-test" && echo "PASS: worktree dir removed"
```

**期待される結果:** サイドカーと worktree ディレクトリの両方が削除される。

---

## Group B: hooksPath 設定（ヘッドレス）

### B1: `.husky/` がない場合、hooksPath = `<repo>/.git/hooks`

**手順:**

```bash
node $QWEN "use enter_worktree with name='b1-test' to create a worktree" \
  --approval-mode yolo --output-format json 2>/dev/null > /dev/null

HOOKS_PATH=$(git -C "$TEST_DIR/.qwen/worktrees/b1-test" config --local core.hooksPath)
echo "Got hooksPath: $HOOKS_PATH"
test "$HOOKS_PATH" = "$TEST_DIR/.git/hooks" && echo "PASS" || echo "FAIL"
```

**期待される結果:** `$TEST_DIR/.git/hooks`

### B2: `.husky/` がある場合、hooksPath = `<repo>/.husky`

**手順:**

```bash
mkdir -p "$TEST_DIR/.husky"
echo '#!/bin/sh' > "$TEST_DIR/.husky/pre-commit"
chmod +x "$TEST_DIR/.husky/pre-commit"

node $QWEN "use enter_worktree with name='b2-test' to create a worktree" \
  --approval-mode yolo --output-format json 2>/dev/null > /dev/null

HOOKS_PATH=$(git -C "$TEST_DIR/.qwen/worktrees/b2-test" config --local core.hooksPath)
test "$HOOKS_PATH" = "$TEST_DIR/.husky" && echo "PASS" || echo "FAIL got=$HOOKS_PATH"
```

**期待される結果:** `$TEST_DIR/.husky`

### B3: メインリポジトリのフックが worktree 内部から実際に起動する

**手順:**

```bash
# マーカーファイルを書き込むフックを設定
mkdir -p "$TEST_DIR/.git/hooks"
cat > "$TEST_DIR/.git/hooks/pre-commit" <<'EOF'
#!/bin/sh
echo "hook-fired" > /tmp/qwen-wt-hook-marker
EOF
chmod +x "$TEST_DIR/.git/hooks/pre-commit"

node $QWEN "use enter_worktree with name='b3-test' to create a worktree" \
  --approval-mode yolo --output-format json 2>/dev/null > /dev/null

# worktree 内でコミットを実行
WT="$TEST_DIR/.qwen/worktrees/b3-test"
echo "x" > "$WT/file.txt"
git -C "$WT" add file.txt
rm -f /tmp/qwen-wt-hook-marker
git -C "$WT" commit -m "trigger hook" 2>&1
test -f /tmp/qwen-wt-hook-marker && echo "PASS: hook fired" || echo "FAIL: hook did not fire"
rm -f /tmp/qwen-wt-hook-marker
```

**期待される結果:** コミット後に `/tmp/qwen-wt-hook-marker` が存在する。

---

## Group C: --resume による worktree 復元（ヘッドレス）

### C1: --resume でサイドカーが存在しディレクトリが生きている場合、worktree コンテキストを注入する

**手順:**

```bash
# 最初のセッションを worktree で作成
INIT_OUT=$(node $QWEN "use enter_worktree with name='c1-test' to create a worktree" \
  --approval-mode yolo --output-format json 2>/dev/null)
SESSION=$(echo "$INIT_OUT" | jq -r '.[] | select(.type=="system") | .session_id' | head -1)

# セッションを再開し「私のコンテキストは？」と尋ねる
RESUMED=$(node $QWEN --resume "$SESSION" "say SIDECAR-CONFIRM" \
  --approval-mode yolo --output-format json 2>/dev/null)

# 会話内に注入された INFO メッセージテキストを探す
echo "$RESUMED" | grep -q "Resumed.*Active worktree.*c1-test" && echo "PASS" || echo "FAIL: no context injection"
```

**期待される結果:** JSON ストリームに `c1-test` を参照する INFO メッセージが含まれている。

### C2: --resume で worktree ディレクトリが削除された場合、古いサイドカーをクリーンアップする

**手順:**

```bash
INIT_OUT=$(node $QWEN "use enter_worktree with name='c2-test' to create a worktree" \
  --approval-mode yolo --output-format json 2>/dev/null)
SESSION=$(echo "$INIT_OUT" | jq -r '.[] | select(.type=="system") | .session_id' | head -1)
SIDECAR=~/.qwen/projects/$PROJECT_ID/chats/$SESSION.worktree.json

# worktree ディレクトリを帯域外で削除
rm -rf "$TEST_DIR/.qwen/worktrees/c2-test"
test -f "$SIDECAR" || { echo "SKIP: sidecar was already gone"; exit 0; }

# 再開 — 古いサイドカーをクリーンアップするはず
node $QWEN --resume "$SESSION" "hello" --approval-mode yolo --output-format json 2>/dev/null > /dev/null
test ! -f "$SIDECAR" && echo "PASS: stale sidecar cleaned" || echo "FAIL: stale sidecar still present"
```

**期待される結果:** サイドカーファイルが削除される。

---

## Group D: Footer の worktree インジケータ（対話型 tmux）

### D1: Footer が enter_worktree 後に worktree インジケータを表示する

**手順:**

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

# Footer エリアの worktree インジケータ行をキャプチャ
tmux capture-pane -t wt-d1 -p -S -100 > /tmp/wt-d1.out
grep -E "⎇.*worktree-d1-test.*\(d1-test\)" /tmp/wt-d1.out && echo "PASS" || \
  { echo "FAIL — captured output:"; cat /tmp/wt-d1.out; }
tmux kill-session -t wt-d1
```

**期待される結果:** Footer に `⎇ worktree-d1-test (d1-test)` のような行が含まれる。

### D2: exit_worktree (keep) 後に Footer インジケータが消える

**手順:**

```bash
tmux new-session -d -s wt-d2 -x 200 -y 50 \
  "cd $TEST_DIR && node $QWEN --approval-mode yolo"
sleep 3

tmux send-keys -t wt-d2 "use enter_worktree with name='d2-test'"
sleep 0.5
tmux send-keys -t wt-d2 Enter
for i in $(seq 1 30); do sleep 2; tmux capture-pane -t wt-d2 -p | grep -q "Type your message" && break; done

# インジケータが表示されたことを確認
tmux capture-pane -t wt-d2 -p -S -100 | grep -q "⎇.*d2-test" || { echo "FAIL: indicator missing before exit"; tmux kill-session -t wt-d2; exit 1; }

# worktree を終了 (keep)
tmux send-keys -t wt-d2 "use exit_worktree with name='d2-test' action='keep'"
sleep 0.5
tmux send-keys -t wt-d2 Enter
for i in $(seq 1 30); do sleep 2; tmux capture-pane -t wt-d2 -p | grep -q "Kept worktree" && break; done

sleep 2  # Footer がサイドカー削除後に更新されるのを待つ
tmux capture-pane -t wt-d2 -p -S -100 > /tmp/wt-d2-after.out
# 終了後、インジケータが下部パネル領域から消えているはず
tail -5 /tmp/wt-d2-after.out | grep -q "⎇.*d2-test" && \
  echo "FAIL: indicator still showing" || echo "PASS"
tmux kill-session -t wt-d2
```

**期待される結果:** `exit_worktree` 後約2秒以内に worktree インジケータが Footer から消える。

---

## Group E: WorktreeExitDialog（対話型 tmux）

### E1: worktree での2回目の Ctrl+C がダイアログを表示し、終了しない

**手順:**

```bash
tmux new-session -d -s wt-e1 -x 200 -y 50 \
  "cd $TEST_DIR && node $QWEN --approval-mode yolo"
sleep 3

tmux send-keys -t wt-e1 "use enter_worktree with name='e1-test'"
sleep 0.5
tmux send-keys -t wt-e1 Enter
for i in $(seq 1 30); do sleep 2; tmux capture-pane -t wt-e1 -p | grep -q "Type your message" && break; done

# 1回目の Ctrl+C（クリーンアップ; 「Press Ctrl+C again to exit」が表示されるはず）
tmux send-keys -t wt-e1 C-c
sleep 0.3
tmux capture-pane -t wt-e1 -p | grep -q "Press Ctrl+C again" || \
  { echo "FAIL: first Ctrl+C didn't show warning"; tmux kill-session -t wt-e1; exit 1; }

# 2回目の Ctrl+C — WorktreeExitDialog を表示し、終了しない
tmux send-keys -t wt-e1 C-c
sleep 2

# ダイアログがレンダリングされたことを確認
tmux capture-pane -t wt-e1 -p -S -50 > /tmp/wt-e1.out
grep -q "Active worktree.*e1-test" /tmp/wt-e1.out && \
  grep -q "Keep worktree" /tmp/wt-e1.out && \
  grep -q "Remove worktree" /tmp/wt-e1.out && \
  echo "PASS" || { echo "FAIL — captured:"; cat /tmp/wt-e1.out; }
tmux kill-session -t wt-e1
```

**期待される結果:** ダイアログに3つのオプション（Keep / Remove / Cancel）が表示され、プロセスは生き続ける。

### E2: ダイアログにダーティ状態のカウント（コミット数 + ファイル数）が表示される

**手順:**

```bash
tmux new-session -d -s wt-e2 -x 200 -y 50 \
  "cd $TEST_DIR && node $QWEN --approval-mode yolo"
sleep 3

tmux send-keys -t wt-e2 "use enter_worktree with name='e2-test'"
sleep 0.5
tmux send-keys -t wt-e2 Enter
for i in $(seq 1 30); do sleep 2; tmux capture-pane -t wt-e2 -p | grep -q "Type your message" && break; done

# worktree をダーティにする: 1つの新しいコミット + 1つの未コミットファイル
WT="$TEST_DIR/.qwen/worktrees/e2-test"
echo "new" > "$WT/new.txt"
git -C "$WT" add new.txt
git -C "$WT" commit -q -m "test commit" --no-verify
echo "dirty" > "$WT/uncommitted.txt"

# Ctrl+C ダブルプレスで終了ダイアログをトリガー
tmux send-keys -t wt-e2 C-c
sleep 0.3
tmux send-keys -t wt-e2 C-c
sleep 3   # git status / rev-list の時間を確保

tmux capture-pane -t wt-e2 -p -S -50 > /tmp/wt-e2.out
grep -qE "new commit|uncommitted file" /tmp/wt-e2.out && echo "PASS" || \
  { echo "FAIL — captured:"; cat /tmp/wt-e2.out; }
tmux kill-session -t wt-e2
```

**期待される結果:** ダイアログ本文に「X 新しいコミット」と「Y 未コミットファイル」の両方が含まれる。

### E3: Cancel オプションで終了せずにダイアログを閉じる

**手順:**

```bash
tmux new-session -d -s wt-e3 -x 200 -y 50 \
  "cd $TEST_DIR && node $QWEN --approval-mode yolo"
sleep 3

tmux send-keys -t wt-e3 "use enter_worktree with name='e3-test'"
sleep 0.5
tmux send-keys -t wt-e3 Enter
for i in $(seq 1 30); do sleep 2; tmux capture-pane -t wt-e3 -p | grep -q "Type your message" && break; done

# ダイアログをトリガー
tmux send-keys -t wt-e3 C-c
sleep 0.3
tmux send-keys -t wt-e3 C-c
sleep 3

# Cancel に移動 (DOWN DOWN) して Enter
tmux send-keys -t wt-e3 Down
sleep 0.2
tmux send-keys -t wt-e3 Down
sleep 0.2
tmux send-keys -t wt-e3 Enter
sleep 2

# ダイアログが消え、入力プロンプトが戻ってくるはず
tmux capture-pane -t wt-e3 -p | grep -q "Type your message" && echo "PASS" || \
  { echo "FAIL — captured:"; tmux capture-pane -t wt-e3 -p; }

# worktree が削除されていないことを確認
test -d "$TEST_DIR/.qwen/worktrees/e3-test" && echo "worktree intact" || echo "FAIL: worktree gone"
tmux kill-session -t wt-e3
```

**期待される結果:** ダイアログが閉じ、入力プロンプトが戻り、worktree ディレクトリは存在し続ける。

### E4: Keep オプションでセッションは終了するが worktree は保持される

**手順:**

```bash
tmux new-session -d -s wt-e4 -x 200 -y 50 \
  "cd $TEST_DIR && node $QWEN --approval-mode yolo"
sleep 3

tmux send-keys -t wt-e4 "use enter_worktree with name='e4-test'"
sleep 0.5
tmux send-keys -t wt-e4 Enter
for i in $(seq 1 30); do sleep 2; tmux capture-pane -t wt-e4 -p | grep -q "Type your message" && break; done

# ダイアログをトリガーして Keep（最初のオプション、既に選択済み）を選択
tmux send-keys -t wt-e4 C-c
sleep 0.3
tmux send-keys -t wt-e4 C-c
sleep 3
tmux send-keys -t wt-e4 Enter

# プロセスが終了するのを待つ
for i in $(seq 1 20); do
  sleep 1
  tmux has-session -t wt-e4 2>/dev/null || break
  tmux capture-pane -t wt-e4 -p | grep -q "\$ " && break  # シェルプロンプトが戻った
done

# worktree ディレクトリはまだ存在しているはず
test -d "$TEST_DIR/.qwen/worktrees/e4-test" && echo "PASS: worktree preserved" || \
  echo "FAIL: worktree was removed"
tmux kill-session -t wt-e4 2>/dev/null || true
```

**期待される結果:** プロセスは終了するが、worktree ディレクトリはディスク上に残る。

### E5: Remove オプションでセッションが終了し、worktree が削除される

**手順:**

```bash
tmux new-session -d -s wt-e5 -x 200 -y 50 \
  "cd $TEST_DIR && node $QWEN --approval-mode yolo"
sleep 3

tmux send-keys -t wt-e5 "use enter_worktree with name='e5-test'"
sleep 0.5
tmux send-keys -t wt-e5 Enter
for i in $(seq 1 30); do sleep 2; tmux capture-pane -t wt-e5 -p | grep -q "Type your message" && break; done

# ダイアログをトリガーして Remove を選択 (DOWN, Enter)
tmux send-keys -t wt-e5 C-c
sleep 0.3
tmux send-keys -t wt-e5 C-c
sleep 3
tmux send-keys -t wt-e5 Down
sleep 0.2
tmux send-keys -t wt-e5 Enter

# 終了を待つ
for i in $(seq 1 20); do
  sleep 1
  tmux has-session -t wt-e5 2>/dev/null || break
  tmux capture-pane -t wt-e5 -p | grep -q "\$ " && break
done

# worktree ディレクトリは削除されているはず
test ! -d "$TEST_DIR/.qwen/worktrees/e5-test" && echo "PASS: worktree removed" || \
  echo "FAIL: worktree still on disk"
# ブランチも削除されているはず
git -C "$TEST_DIR" branch --list | grep -q "worktree-e5-test" && \
  echo "FAIL: branch still present" || echo "PASS: branch removed"
tmux kill-session -t wt-e5 2>/dev/null || true
```

**期待される結果:** プロセスは終了し、worktree ディレクトリが削除され、ブランチ `worktree-e5-test` も削除される。

---

## Group F: 実ユーザーワークフローシミュレーション（対話型 tmux）

### F1: 完全な enter → edit → commit → resume → exit (keep) フロー

**手順:**

```bash
tmux new-session -d -s wt-f1 -x 200 -y 50 \
  "cd $TEST_DIR && node $QWEN --approval-mode yolo"
sleep 3

# Step 1: enter worktree
tmux send-keys -t wt-f1 "use enter_worktree with name='f1-feature' to create a worktree"
sleep 0.5
tmux send-keys -t wt-f1 Enter
for i in $(seq 1 30); do sleep 2; tmux capture-pane -t wt-f1 -p | grep -q "Type your message" && break; done

# Step 2: モデルが書き込み先を知るために絶対 worktree パスを読み取る
WT="$TEST_DIR/.qwen/worktrees/f1-feature"
tmux send-keys -t wt-f1 "write the file $WT/hello.txt with content 'hi from worktree'"
sleep 0.5
tmux send-keys -t wt-f1 Enter
for i in $(seq 1 60); do sleep 2; tmux capture-pane -t wt-f1 -p | grep -q "Type your message" && break; done

# ファイルが実際に worktree 内部に書き込まれたことを確認
test -f "$WT/hello.txt" && grep -q "hi from worktree" "$WT/hello.txt" && \
  echo "PASS: file written inside worktree" || echo "FAIL: file not in worktree"

# Step 3: ツールを使って keep で終了
tmux send-keys -t wt-f1 "use exit_worktree with name='f1-feature' action='keep'"
sleep 0.5
tmux send-keys -t wt-f1 Enter
for i in $(seq 1 30); do sleep 2; tmux capture-pane -t wt-f1 -p | grep -q "Kept worktree" && break; done

# Step 4: 終了後も worktree がディスク上に残っていることを確認
test -d "$WT" && echo "PASS: worktree kept" || echo "FAIL: worktree removed"
test -f "$WT/hello.txt" && echo "PASS: file persists" || echo "FAIL"

tmux kill-session -t wt-f1
```

**期待される結果:**

- ファイルが worktree ディレクトリ（メインリポジトリではない）に書き込まれる
- `keep` で終了後、worktree ディレクトリとファイルの両方が残る

### F2: カスタム statusline が `worktree` ペイロードを受け取る

**手順:**

```bash
# 標準入力で受け取った JSON を表示する statusline スクリプトを作成
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
sleep 5  # statusline には余分な時間が必要

tmux send-keys -t wt-f2 "use enter_worktree with name='f2-test'"
sleep 0.5
tmux send-keys -t wt-f2 Enter
for i in $(seq 1 30); do sleep 2; tmux capture-pane -t wt-f2 -p | grep -q "Type your message" && break; done

sleep 3  # サイドカー変更後に statusline が更新されるのを待つ

# キャプチャしたペイロードを検査
cat /tmp/qwen-wt-statusline-input.json | jq '.worktree.name, .worktree.path, .worktree.branch'

# カスタム statusline がアクティブな場合、組み込みの Footer インジケータが非表示になっていることを確認
tmux capture-pane -t wt-f2 -p -S -100 > /tmp/wt-f2.out
grep -q "WT=f2-test" /tmp/wt-f2.out && echo "PASS: custom statusline rendered" || echo "FAIL"
tmux kill-session -t wt-f2

# 設定を復元
cp -f /tmp/qwen-settings-backup.json "$SETTINGS_FILE" 2>/dev/null || rm -f "$SETTINGS_FILE"
```

**期待される結果:**

- `/tmp/qwen-wt-statusline-input.json` に `.worktree.name == "f2-test"`、`.path`、`.branch` が設定されている
- カスタム statusline の出力 `WT=f2-test` が Footer に表示される
- 組み込みの `⎇ worktree-...` 行はレンダリングされない（カスタム statusline によって抑制される）

---

## 合格基準のまとめ

| グループ | テスト | 期待される結果 |
| ------- | ------ | ------------- |
| A | A1 enter でサイドカー書き込み | 6つのフィールドすべてが設定される |
| A | A2 keep でサイドカーをクリア | ファイルが削除される |
| A | A3 remove でサイドカーをクリア | ファイル + ディレクトリが削除される |
| B | B1 hooksPath フォールバック | `<repo>/.git/hooks` |
| B | B2 hooksPath husky | `<repo>/.husky` |
| B | B3 worktree内でフックが起動 | マーカーファイルが書き込まれる |
| C | C1 resume でコンテキスト注入 | INFO メッセージが存在する |
| C | C2 古いサイドカーのクリーンアップ | サイドカーが削除される |
| D | D1 Footer に worktree 表示 | `⎇ worktree-...` がレンダリングされる |
| D | D2 終了後に Footer が非表示 | インジケータが消える |
| E | E1 2回目の Ctrl+C でダイアログ | ダイアログが表示され、プロセスは生きている |
| E | E2 ダーティ状態のカウント | コミット数 + ファイル数が表示される |
| E | E3 Cancel | ダイアログが閉じ、セッションは生きている |
| E | E4 Keep | セッションは終了、worktree は保持される |
| E | E5 Remove | セッションは終了、worktree は削除される |
| F | F1 完全なワークフロー | worktree 内にファイルが作成され、keep 後も保持される |
| F | F2 カスタム statusline | worktree ペイロードが受信され、Footer が抑制される |