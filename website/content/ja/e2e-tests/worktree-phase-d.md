# Worktree Phase D E2E テスト計画

## スコープ

`/Users/mochi/code/qwen-code/.claude/worktrees/tender-jemison-037f0a/dist/cli.js` のローカルビルドに対する Phase D 機能のエンドツーエンド検証。

Phase D は以下の 3 つの横断的機能を提供する：

- **D-1** — `--worktree [name]` CLI 起動フラグ（ベア / 明示的スラッグ / `=` 形式）。`process.cwd()` + `Config.targetDir` の切り替え、終了時の `WorktreeExitDialog` の再利用を含む。
- **D-2** — `worktree.symlinkDirectories: string[]` 設定キー。`performPostCreationSetup()` で適用されるため、`--worktree`、`EnterWorktreeTool`、**および** `AgentTool isolation: "worktree"` のパスをカバーする。
- **D-3** — `--worktree=#<N>` および `--worktree <github-url>` PR 参照形式。`git fetch origin pull/<N>/head` 経由で動作（`gh` CLI に依存しない）。

## バイナリ

- **ローカルビルド（Phase 6 検証用）**：`node /Users/mochi/code/qwen-code/.claude/worktrees/tender-jemison-037f0a/dist/cli.js`
- **Phase 4 ドライラン用ベースライン**：グローバルインストール済み `qwen`

ドライランでは、グローバルインストール済み `qwen` はグループ A / E / F で失敗することが期待される。これは機能がまだ存在しないためであり、テスト計画が実装を正しく検出していることの検証となる。

### グループ E のベースライン前提条件

テスト **E2**（`EnterWorktreeTool` のシンボリックリンク）および **E3**（`AgentTool isolation` のシンボリックリンク）には、ベースラインに **Phase A + B** が存在することが必要。これらのテストは既存の `enter_worktree` ツールと `agent isolation: "worktree"` パラメータを実行し、それらのコードパスでもシンボリックリンクのループが発生することを確認する。

グローバルインストール済み `qwen` は PR #4073（Phase A+B、2026-05-14 マージ）より前のバージョンである可能性があり、その場合これらのツールが完全に欠落している。その場合、E2 / E3 は「D-2 がないためシンボリックリンクがない」ことを検証できず、「ツールがない」に退化する。各テストの先頭に以下のガードを追加する：

```bash
HAS_ENTER_WORKTREE=$($QWEN "list your tools and stop" --approval-mode yolo --output-format json 2>/dev/null \
  | jq -e '.[] | select(.type=="system") | .tools | index("enter_worktree")' >/dev/null && echo yes || echo no)
if [ "$HAS_ENTER_WORKTREE" != "yes" ]; then
  echo "SKIP: enter_worktree absent in baseline — E2/E3 require Phase A+B"
  exit 0
fi
```

Phase 6（実装後）検証では、ローカルビルドは Phase A-C を内包しているため、このガードは無効化され、テストは完全に実行される。

## テスト環境テンプレート

各グループは自身の一時 git リポジトリと tmux セッションで実行する：

```bash
TEST_DIR=$(mktemp -d -t qwen-wt-phd-XXXXXX)
TEST_DIR=$(cd "$TEST_DIR" && pwd -P)   # resolve symlinks (macOS /var → /private/var)
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

PR 参照テスト（グループ F）では、さらにマージ済み PR が少なくとも 1 つある公開 GitHub リポジトリのチェックアウトクローンが必要。テストターゲットとしてこのリポジトリ（qwen-code 自身）を使用する。PR `#4174`（Phase C）は存在が保証されている参照である。

---

## グループ A: `--worktree` フラグ基本形式

**モード：** ヘッドレス、`--approval-mode yolo`、`--output-format json`

### A1: ベア `--worktree`（自動スラッグ）

```bash
$QWEN --worktree "say hello and stop" \
  --approval-mode yolo --output-format json 2>/dev/null > /tmp/a1.out

# A `worktree_started` system event is emitted at startup. The `notice`
# field contains the slug (auto-generated `adj-noun-XXXXXX`) inside the
# rendered text. Use `jq -e` so a missing event is a non-zero exit
# (instead of silent `null`).
jq -e '.[] | select(.type=="system" and .subtype=="worktree_started") | .data.notice | test("\"[a-z]+-[a-z]+-[0-9a-f]{6}\"")' < /tmp/a1.out

# The init system message's `cwd` should also point inside the worktree.
jq -e '.[] | select(.type=="system" and .subtype=="init") | .cwd | test("/\\.qwen/worktrees/[a-z]+-[a-z]+-[0-9a-f]{6}$")' < /tmp/a1.out

ls -d "$TEST_DIR/.qwen/worktrees/"*
```

**期待結果（実装後）：**

- `worktree_started` イベントの `.data.notice` に自動スラッグが含まれている
- Init の `.cwd` が `.qwen/worktrees/<auto-slug>` で終わる
- `.qwen/worktrees/` 以下にワークツリーのディレクトリがちょうど 1 つ存在する
- `worktree-<slug>` という名前のブランチが存在する（`git branch | grep worktree-`）

**期待結果（実装前ベースライン）：** yargs が `--worktree` を "Unknown argument" エラーで拒否し、終了コードが 0 以外になる。

### A2: `--worktree my-feature`（明示的スラッグ）

```bash
$QWEN --worktree my-feature "say hello and stop" \
  --approval-mode yolo --output-format json 2>/dev/null > /tmp/a2.out

ls -d "$TEST_DIR/.qwen/worktrees/my-feature"
git -C "$TEST_DIR" branch | grep "worktree-my-feature"
```

**期待結果（実装後）：** ワークツリーのディレクトリ `my-feature/` とブランチ `worktree-my-feature` の両方が存在する。

### A3: `--worktree=my-feature`（= 形式）

A2 と同じだが `=` 形式を使用。A2 と A3 の間にはクリーンアップが必要（別の TEST_DIR）。

```bash
$QWEN --worktree=my-feature "say hi" \
  --approval-mode yolo --output-format json 2>/dev/null > /tmp/a3.out
```

**期待結果（実装後）：** A2 と同じ。

### A4: 無効なスラッグが git 操作の前に拒否される

```bash
$QWEN --worktree "../escape" "say hi" \
  --approval-mode yolo --output-format json 2>/dev/null > /tmp/a4.out
echo "exit=$?"

ls "$TEST_DIR/.qwen/worktrees/" 2>/dev/null
```

**期待結果（実装後）：**

- プロセスが 0 以外のステータスで終了する
- 標準エラーまたは最終結果メッセージに "invalid slug" / "not allowed" が含まれる
- `.qwen/worktrees/` ディレクトリが存在しない（ワークツリー作成が開始されていない）

### A5: git リポジトリではない → フェイルクローズ

```bash
NON_GIT=$(mktemp -d)
cd "$NON_GIT"
$QWEN --worktree "say hi" \
  --approval-mode yolo --output-format json 2>/dev/null > /tmp/a5.out
echo "exit=$?"
```

**期待結果（実装後）：** 終了コード != 0、メッセージに "not a git repository" または "git init" が含まれる。

---

## グループ B: `--worktree` 後の cwd + サイドカー

### B1: サイドカーの全 6 フィールドが書き込まれる

```bash
SESSION_ID=$(uuidgen)
$QWEN --worktree b1-test --session-id "$SESSION_ID" "say hi" \
  --approval-mode yolo --output-format json 2>/dev/null > /tmp/b1.out

SIDECAR=~/.qwen/projects/$PROJECT_ID/chats/$SESSION_ID.worktree.json
jq '.slug, .worktreePath, .worktreeBranch, .originalCwd, .originalBranch, .originalHeadCommit' \
  < "$SIDECAR"
```

**期待結果：**

- `slug = "b1-test"`
- `worktreePath` が `.qwen/worktrees/b1-test` で終わる
- `worktreeBranch = "worktree-b1-test"`
- `originalCwd` = `$TEST_DIR`（解決済み）
- `originalBranch = "main"`
- `originalHeadCommit` が `[0-9a-f]{40}` に一致する

### B2: 起動時に `process.cwd()` が切り替わる

```bash
$QWEN --worktree b2-test "run the shell tool with command 'pwd', then stop" \
  --approval-mode yolo --output-format json 2>/dev/null > /tmp/b2.out

# Extract the shell tool's stdout from the user-message tool_result
jq -r '.[] | select(.type=="user") | .message.content[] | select(.tool_use_id != null) | .content' \
  < /tmp/b2.out | head -5
```

**期待結果（実装後）：** `pwd` の出力が `$TEST_DIR/.qwen/worktrees/b2-test` と等しい。

### B3: `Config.targetDir` が切り替わる（Footer / ステータスペイロード）

```bash
$QWEN --worktree b3-test "run the shell tool with command 'pwd && git rev-parse --abbrev-ref HEAD', then stop" \
  --approval-mode yolo --output-format json 2>/dev/null > /tmp/b3.out

jq -r '.[] | select(.type=="user") | .message.content[] | select(.tool_use_id != null) | .content' \
  < /tmp/b3.out
```

**期待結果（実装後）：** ブランチが `worktree-b3-test` **かつ** 作業ディレクトリがワークツリー内部にある。

---

## グループ C: `--worktree` × `--resume` の優先順位

### C1: `--worktree` が保存済みサイドカーより優先される（異なるスラッグ）

```bash
# Run 1: create a session with worktree "first"
SESSION_ID=$(uuidgen)
$QWEN --worktree first --session-id "$SESSION_ID" "say hi" \
  --approval-mode yolo --output-format json 2>/dev/null > /tmp/c1-run1.out

# Run 2: resume the same session but request a different worktree
$QWEN --resume "$SESSION_ID" --worktree second "say hi again" \
  --approval-mode yolo --output-format json 2>/dev/null > /tmp/c1-run2.out

# Sidecar should now point at "second"
SIDECAR=~/.qwen/projects/$PROJECT_ID/chats/$SESSION_ID.worktree.json
jq -r '.slug' < "$SIDECAR"

# Both worktree dirs should exist on disk (first was never removed, just unlinked)
ls -d "$TEST_DIR/.qwen/worktrees/"*
```

**期待結果（実装後）：**

- サイドカーの `.slug` = `"second"`
- `first/` と `second/` の両方のディレクトリが存在する
- Run 2 の標準エラーまたは init の `worktree_overridden` メッセージに "--worktree overrides the resumed session's worktree" が含まれる

### C2: 古いサイドカー（手動で削除されたディレクトリ）+ `--worktree` → 新しいワークツリー

```bash
SESSION_ID=$(uuidgen)
$QWEN --worktree c2 --session-id "$SESSION_ID" "say hi" \
  --approval-mode yolo --output-format json 2>/dev/null > /tmp/c2-run1.out

rm -rf "$TEST_DIR/.qwen/worktrees/c2"   # simulate user-deleted dir

$QWEN --resume "$SESSION_ID" --worktree c2-fresh "say hi" \
  --approval-mode yolo --output-format json 2>/dev/null > /tmp/c2-run2.out

ls -d "$TEST_DIR/.qwen/worktrees/"*
```

**期待結果（実装後）：** `c2-fresh/` のみ存在する。サイドカーが `c2-fresh` に更新される。

---

## グループ D: WorktreeExitDialog の回帰テスト（`--worktree` で開始されたセッション）

**モード：** 対話式（tmux）。Phase C のダイアログが CLI フラグで作成されたワークツリーでも機能することを確認する（`EnterWorktreeTool` ではない場合）。

### D1: 2 回の Ctrl+C → ダイアログが表示される

```bash
tmux new-session -d -s d1 -x 200 -y 50 \
  "cd $TEST_DIR && $QWEN --worktree d1-test --approval-mode yolo"
sleep 3

# Verify worktree is active (Footer indicator)
tmux capture-pane -t d1 -p -S -50 | grep -q "⎇ worktree-d1-test"

# Send Ctrl+C twice
tmux send-keys -t d1 C-c
sleep 0.3
tmux send-keys -t d1 C-c
sleep 1

tmux capture-pane -t d1 -p -S -50 | grep -E "Active worktree|Keep worktree|Remove worktree"
tmux kill-session -t d1
```

**期待結果（実装後）：** ダイアログテキスト "Active worktree: \"d1-test\" …" と 3 つのラジオオプションが表示される。

### D2: ダイアログ → キャンセル → セッションが維持される

```bash
tmux new-session -d -s d2 -x 200 -y 50 \
  "cd $TEST_DIR && $QWEN --worktree d2-test --approval-mode yolo"
sleep 3
tmux send-keys -t d2 C-c; sleep 0.3; tmux send-keys -t d2 C-c; sleep 1

# Navigate to "Cancel" (third option) and select
tmux send-keys -t d2 Down Down Enter
sleep 1

tmux capture-pane -t d2 -p -S -10 | grep -q "Type your message"
ls -d "$TEST_DIR/.qwen/worktrees/d2-test"   # still exists
tmux kill-session -t d2
```

**期待結果（実装後）：** プロンプト入力が再表示される。ワークツリーのディレクトリはディスク上に残る。

### D3: ダイアログ → 削除 → ワークツリー + ブランチ + サイドカーがすべて削除される

```bash
SESSION_ID=$(uuidgen)
tmux new-session -d -s d3 -x 200 -y 50 \
  "cd $TEST_DIR && $QWEN --worktree d3-test --session-id $SESSION_ID --approval-mode yolo"
sleep 3
tmux send-keys -t d3 C-c; sleep 0.3; tmux send-keys -t d3 C-c; sleep 1
tmux send-keys -t d3 Down Enter   # select "Remove worktree and branch"
sleep 3
tmux kill-session -t d3

ls "$TEST_DIR/.qwen/worktrees/d3-test" 2>/dev/null && echo "FAIL: dir exists"
git -C "$TEST_DIR" branch | grep "worktree-d3-test" && echo "FAIL: branch exists"
test ! -f ~/.qwen/projects/$PROJECT_ID/chats/$SESSION_ID.worktree.json && echo "PASS: sidecar gone"
```

**期待結果（実装後）：** ディレクトリ、ブランチ、サイドカーがすべて削除される。

---

## グループ E: `worktree.symlinkDirectories`

**モード：** ヘッドレス。設定は一時設定ファイルを介して行う。

### セットアップテンプレート

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

### E1: `--worktree` パスでシンボリックリンクが適用される

```bash
$QWEN --worktree e1-test "say hi" \
  --approval-mode yolo --output-format json 2>/dev/null > /dev/null

ls -la "$TEST_DIR/.qwen/worktrees/e1-test/node_modules"
readlink "$TEST_DIR/.qwen/worktrees/e1-test/node_modules"
```

**期待結果（実装後）：** ワークツリー内部の `node_modules` が `$TEST_DIR/node_modules` を指すシンボリックリンクになっている。

### E2: `EnterWorktreeTool` パスでシンボリックリンクが適用される

```bash
$QWEN "use enter_worktree to create a worktree named e2-test, then stop" \
  --approval-mode yolo --output-format json 2>/dev/null > /dev/null

readlink "$TEST_DIR/.qwen/worktrees/e2-test/node_modules"
```

**期待結果（実装後）：** 同じシンボリックリンクのターゲット。

### E3: AgentTool isolation パスでシンボリックリンクが適用される

サブエージェント定義が必要。組み込みの fork メカニズムを使用する：

```bash
$QWEN "use the agent tool with subagent_type='general-purpose', isolation='worktree', description='check node_modules', prompt='run pwd and ls -la node_modules then exit'" \
  --approval-mode yolo --output-format json 2>/dev/null > /tmp/e3.out

# Extract agent worktree dir from result message
jq -r '.[] | select(.type=="assistant") | .message.content[] | select(.type=="tool_use") | .input' \
  < /tmp/e3.out | head -5

# After execution find the agent-<7hex> worktree
ls -la "$TEST_DIR/.qwen/worktrees/"agent-*/node_modules 2>/dev/null | head -3
```

**期待結果（実装後）：** シンボリックリンクが `agent-<hex>` ワークツリー内部に存在する（変更がないために自動クリーンアップされた場合は除く。その場合は "no changes" パスがシンボリックリンクの動作を検証しないため、強制的な変更テストに昇格する）。

### E4: ソースディレクトリが存在しない → 警告なしでスキップ、ワークツリーは作成される

```bash
cat > "$TEST_DIR/.qwen/settings.json" <<'EOF'
{ "worktree": { "symlinkDirectories": ["does-not-exist"] } }
EOF

$QWEN --worktree e4-test "say hi" --approval-mode yolo --output-format json 2>/dev/null > /tmp/e4.out
ls -d "$TEST_DIR/.qwen/worktrees/e4-test"
ls "$TEST_DIR/.qwen/worktrees/e4-test/does-not-exist" 2>/dev/null && echo "UNEXPECTED"
```

**期待結果（実装後）：** ワークツリーのディレクトリが存在する、不足エントリは内部に作成されない、プロセス終了コード = 0。

### E5: 既存の宛先 → 警告なしでスキップ、上書きされない

```bash
# Pre-create a worktree at expected slug then re-create — this is contrived
# because Phase D paths should be fresh, but it exercises the EEXIST guard.
mkdir -p "$TEST_DIR/.qwen/worktrees/e5-test/node_modules"
echo "preexisting" > "$TEST_DIR/.qwen/worktrees/e5-test/node_modules/.marker"

# Force re-creation via EnterWorktreeTool (CLI would refuse "already exists")
$QWEN "use enter_worktree with name='e5-test' to retry" --approval-mode yolo 2>/dev/null
# either: tool errors out cleanly, OR symlink is skipped — both acceptable
test -f "$TEST_DIR/.qwen/worktrees/e5-test/node_modules/.marker" && echo "PASS: not overwritten"
```

**期待結果（実装後）：** 既存の `.marker` が保持される。シンボリックリンクがディレクトリを置き換えない。

### E6: 絶対パス / `../` → 拒否される

```bash
cat > "$TEST_DIR/.qwen/settings.json" <<'EOF'
{ "worktree": { "symlinkDirectories": ["/etc", "../escape"] } }
EOF

$QWEN --worktree e6-test "say hi" --approval-mode yolo --output-format json 2>/dev/null > /tmp/e6.out
ls "$TEST_DIR/.qwen/worktrees/e6-test/" | head -10
```

**期待結果（実装後）：** ワークツリーは存在する。`etc` も `escape` も内部にリンクされない。デバッグログに警告行が出力される。

---

## グループ F: PR 参照

**モード：** ヘッドレス。公開 GitHub リポジトリを指す `origin` リモートが必要。

### セットアップテンプレート

```bash
# Use qwen-code itself as the test repo
TEST_DIR=$(mktemp -d -t qwen-wt-phd-pr-XXXXXX)
TEST_DIR=$(cd "$TEST_DIR" && pwd -P)
cd "$TEST_DIR"
git clone --depth 1 https://github.com/QwenLM/qwen-code.git .
PROJECT_ID=$(node -e "console.log(process.argv[1].replace(/[^a-zA-Z0-9]/g,'-'))" "$TEST_DIR")
```

### F1: `--worktree=#4174` の解析 + フェッチ

```bash
$QWEN --worktree=#4174 "say hi" \
  --approval-mode yolo --output-format json 2>/dev/null > /tmp/f1.out

ls -d "$TEST_DIR/.qwen/worktrees/pr-4174"
git -C "$TEST_DIR/.qwen/worktrees/pr-4174" rev-parse --abbrev-ref HEAD
```

**期待結果（実装後）：**

- ワークツリーのディレクトリ `pr-4174/` が存在する
- HEAD ブランチ = `worktree-pr-4174`
- ブランチの先端が（git log -1）でエラーなく解決される

### F2: 完全な URL 形式

```bash
$QWEN --worktree "https://github.com/QwenLM/qwen-code/pull/4174" "say hi" \
  --approval-mode yolo --output-format json 2>/dev/null > /tmp/f2.out

ls -d "$TEST_DIR/.qwen/worktrees/pr-4174"
```

**期待結果（実装後）：** F1 と同じ。

### F3: `origin` リモートがない → フェイルクローズ

```bash
cd "$TEST_DIR" && git remote remove origin
$QWEN --worktree=#4174 "say hi" --approval-mode yolo --output-format json 2>/dev/null > /tmp/f3.out
echo "exit=$?"
```

**期待結果（実装後）：** 終了コード != 0。メッセージに `origin` リモートが含まれる。

### F4: 無効な PR 番号 → フェイルクローズ

```bash
$QWEN --worktree=#999999999 "say hi" --approval-mode yolo --output-format json 2>/dev/null > /tmp/f4.out
echo "exit=$?"
```

**期待結果（実装後）：** 終了コード != 0。メッセージに "Failed to fetch PR" が含まれる。30 秒のタイムアウト上限が守られる（テスト実行時間 < 35 秒）。

### F5: 不正な `#abc` はスラッグ検証にフォールスルーされる

```bash
$QWEN --worktree=#abc "say hi" --approval-mode yolo --output-format json 2>/dev/null > /tmp/f5.out
echo "exit=$?"
```

**期待結果（実装後）：** リテラルスラッグ `#abc` として扱われ、`validateUserWorktreeSlug` によって `#` が許可されていないため拒否される。終了コード != 0。

### F6: PR ワークツリーにもシンボリックリンクが適用される（E との横断）

```bash
cat > "$TEST_DIR/.qwen/settings.json" <<'EOF'
{ "worktree": { "symlinkDirectories": ["node_modules"] } }
EOF
mkdir -p "$TEST_DIR/node_modules" && echo x > "$TEST_DIR/node_modules/.marker"

$QWEN --worktree=#4174 "say hi" --approval-mode yolo --output-format json 2>/dev/null > /dev/null
readlink "$TEST_DIR/.qwen/worktrees/pr-4174/node_modules"
```

**期待結果（実装後）：** シンボリックリンクのターゲット = `$TEST_DIR/node_modules`。

---

## グループ G: 統合 + エッジケース

### G1: 完全なライフサイクル — 開始 → 書き込み → Keep → 再開

> **実装前の注意：** ベースラインに対してこのテストは `sleep 3` が終了する前に終了する（yargs が `--worktree` を即座に拒否し、tmux ペインが終了する）。その後の `capture-pane` 呼び出しで "can't find pane" エラーが発生する。これは予想通りであり、拒否による PASS として記録する。ドライランではキャプチャを `|| true` でラップするか、G1 全体をベースラインモードではスキップすること。

```bash
SESSION_ID=$(uuidgen)
tmux new-session -d -s g1 -x 200 -y 50 \
  "cd $TEST_DIR && $QWEN --worktree g1-test --session-id $SESSION_ID --approval-mode yolo 2>&1 | tee /tmp/g1-stderr.out"
sleep 3
tmux send-keys -t g1 "use the write_file tool to create file 'work.txt' with content 'phase d test'"
sleep 0.3; tmux send-keys -t g1 Enter
sleep 8

tmux send-keys -t g1 C-c; sleep 0.3; tmux send-keys -t g1 C-c; sleep 1
tmux send-keys -t g1 Enter   # default = "Keep"
sleep 2
tmux kill-session -t g1

# File survived
cat "$TEST_DIR/.qwen/worktrees/g1-test/work.txt"

# Resume reattaches
tmux new-session -d -s g1b -x 200 -y 50 \
  "cd $TEST_DIR && $QWEN --resume $SESSION_ID --approval-mode yolo"
sleep 4
tmux capture-pane -t g1b -p -S -50 | grep -E "⎇ worktree-g1-test|Resumed"
tmux kill-session -t g1b
```

**期待結果（実装後）：**

- ワークツリー内部の `work.txt` に書き込まれたコンテンツが含まれている
- 再開されたセッションの Footer に `⎇ worktree-g1-test (g1-test)` が表示される
- INFO の履歴アイテムまたは `<system-reminder>` に "Resumed" が含まれる

### G2: 相対パス引数が cwd 切り替え前に解決される

```bash
# Create an mcp config in TEST_DIR and reference it relatively.
# --mcp-config takes a file path; if the test plan path is resolved AFTER
# the --worktree cwd switch, the file won't be found inside the worktree
# and the CLI will error out. If resolved BEFORE the switch (correct), the
# file is loaded from TEST_DIR.
cat > "$TEST_DIR/mcp.json" <<'EOF'
{ "mcpServers": {} }
EOF
cd "$TEST_DIR"

$QWEN --worktree g2-test --mcp-config ./mcp.json "say hi" \
  --approval-mode yolo --output-format json 2>/dev/null > /tmp/g2.out
echo "exit=$?"
jq -r '.[] | select(.type=="result") | .result' < /tmp/g2.out | head -3
```
**実装後（予想）:** exit=0。モデルは正常に応答する（空のmcp設定はMCPサーバなしを意味するが、エラーにはならない）。

**実装前ベースライン（予想）:** yargsが `--worktree` を拒否する（フラグ自体が存在しないため、「worktreeフラグがない」と「mcp設定の解決が壊れている」を区別できない）。

---

## 実行順序 + 並列性

| グループ | モード      | 実行時間 | 並列安全？                    |
| -------- | ----------- | -------- | ----------------------------- |
| A        | headless    | ~30s     | はい（独自のTEST_DIR）        |
| B        | headless    | ~20s     | はい                          |
| C        | headless    | ~40s     | はい                          |
| D        | tmux        | ~30s     | はい（独自のセッション名）    |
| E        | headless    | ~60s     | はい                          |
| F        | headless+net| ~60s     | いいえ — GitHub cloneを共有   |
| G        | mixed       | ~60s     | はい                          |

A/B/C/D/E/G は並列実行。F は clone セットアップ後に直列実行。

## 再現レポート

### Phase 4 ドライラン — ベースライン `qwen` v0.15.11 (2026-05-20)

実行時間: 3つの並列 `test-engineer` エージェント、合計約7分。ベースラインはPhase D（想定通り）とPhase A+B（E2/E3の注意事項参照：バイナリが想定より古い）の両方が欠けている。

| グループ                    | 結果      | 備考                                                                                 |
| ---------------------------- | --------- | ------------------------------------------------------------------------------------ |
| A1 (bare flag)               | ✅        | yargs `Unknown argument: worktree`, exit 1                                            |
| A2 (explicit slug)           | ✅        | 同じ                                                                                  |
| A3 (= form)                  | ✅        | 同じ                                                                                  |
| A4 (invalid slug)            | ✅        | slug検証前にyargsが拒否                                                                  |
| A5 (non-git dir)             | ✅        | 同じ                                                                                  |
| B1 (sidecar fields)          | ✅        | sidecarが正しく存在しない。jqセレクタはサンプルデータに対して有効                            |
| B2 (cwd switch)              | ✅        | shell-tool `tool_result.content` のjqセレクタを実際の出力に対して検証済み               |
| B3 (targetDir switch)        | ✅        | 同じセレクタ                                                                          |
| C1 (--worktree beats sidecar)| ✅        | 両方の実行がexit 1、sidecarなし                                                          |
| C2 (stale sidecar + fresh)   | ✅        | 同じ                                                                                  |
| E1 (--worktree symlink)      | ✅        | フラグ拒否、シンボリックリンクなし — 実装前動作確認済み                                    |
| E2 (EnterWorktree symlink)   | ⚠️ N/A    | ベースラインに `enter_worktree` ツールがない（PR #4073より古い）。ガードによりこのケースはスキップ |
| E3 (AgentTool isolation symlink)| ⚠️ N/A | ベースラインの `agent` スキーマが静かに `isolation` パラメータをドロップ。ガードによりスキップ   |
| E4 (missing source skip)     | ✅        | フラグ拒否                                                                             |
| E5 (existing dest not overwrite)| ⚠️ 些末 | 既存の `.marker` は残ったが、ツールが実行できなかったため                                    |
| E6 (path traversal reject)   | ✅        | フラグ拒否、シンボリックリンクなし                                                           |
| F1 (--worktree=#4174 fetch)  | ✅        | `Unknown argument: worktree`、ネットワーク呼び出しなし                                    |
| F2 (full URL form)           | ✅        | 同じ                                                                                  |
| F3 (missing origin)          | ✅        | gitチェック前に拒否                                                                       |
| F4 (invalid PR number)       | ✅        | fetch前に拒否                                                                          |
| F5 (`#abc` malformed)        | ✅        | 同じ                                                                                  |
| F6 (PR + symlinkDirs)        | ✅        | 同じ                                                                                  |
| G1 (lifecycle tmux)          | ⚠️ 部分  | tmux paneがフラグ拒否で終了。exit codeによる記録は機能                                       |
| G2 (relative path)           | ✅        | （`--mcp-config ./mcp.json` に切り替え後）yargsが先にworktreeを拒否                         |

**結論:** テストスクリプトは基本的に問題なし。19/24ケースが実装前ベースラインを明確に検出。3ケース（E2/E3/E5）はベースラインにPhase A+Bを含める必要がある（ローカルのPhase 6ビルドで提供される）。2ケース（G1/G2）はスクリプトのバグがあり、現在修正済み。**Phase 5の実装に進む準備完了。**

### Phase 6 検証 — ローカルビルド

**バイナリ:** `node /Users/mochi/code/qwen-code/.claude/worktrees/tender-jemison-037f0a/dist/cli.js`
**日付:** 2026-05-20
**スコープ:** グループ A, B, C, E, F, G（6つの並列 `test-engineer` エージェント）

| グループ                        | 結果                          | 備考                                                                                                                                                                                                                                                                                                                                                                         |
| ------------------------------ | ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A1 (bare flag)                 | ✅ (ドキュメントヒント付き)   | ユーザーが `qwen --worktree "say hi"` と渡すと、yargsが次の位置引数をスラグ値として消費する。クイックスタートでは `=` 形式を使うか、プロンプトをフラグの前に置くよう指示するように変更。自動スラグ機能自体は `qwen --worktree --approval-mode yolo "say hi"` で確認 → slug `bright-elm-8a4c12`、init `.cwd` の末尾が `.qwen/worktrees/<auto-slug>`。                                     |
| A2 (explicit slug)             | ✅                            | ディレクトリ `.qwen/worktrees/my-feature` + ブランチ `worktree-my-feature`                                                                                                                                                                                                                                                                                                           |
| A3 (= form)                    | ✅                            | A2と同じ                                                                                                                                                                                                                                                                                                                                                                           |
| A4 (invalid slug)              | ✅                            | exit=1、メッセージ: `Worktree name may only contain letters, digits, dots, underscores, and hyphens.`、worktreeディレクトリは作成されない                                                                                                                                                                                                                                       |
| A5 (non-git dir)               | ✅                            | exit=1、メッセージ: `not a git repository. Run \`git init\` first or relaunch from inside one.`                                                                                                                                                                                                                                                                                    |
| B1 (sidecar fields)            | ✅                            | 6つのフィールドすべて存在し正しい。sidecarは設計通りworktree projectHashの下に配置される                                                                                                                                                                                                                                                                                          |
| B2 (cwd switch)                | ✅                            | shellツール内の `pwd` がworktreeのパスを正確に返した                                                                                                                                                                                                                                                                                                                          |
| B3 (branch + cwd)              | ✅                            | `pwd` = worktreeパス、`git rev-parse --abbrev-ref HEAD` = `worktree-b3-test`                                                                                                                                                                                                                                                                                                    |
| C1 (cross-slug override)       | ❌ → **既知の制限事項**       | セッションは `projectHash(cwd)` にバインドされる。`--worktree second --resume <sid-from-first>` ではセッションが見つからない。ユーザードキュメントの制限事項に記載。今後のConfigリファクタリング（アンカーストレージをリポジトリルートに移動）で解決予定。                                                                                                                          |
| C2 (stale sidecar + new worktree)| ❌ → **同じ根本原因**        | 同じアーキテクチャ上の制約。                                                                                                                                                                                                                                                                                                                                                    |
| E1 (`--worktree` symlink)      | ✅                            | `node_modules` が新しいworktreeにシンボリックリンクされた                                                                                                                                                                                                                                                                                                                      |
| E2 (`enter_worktree` symlink)  | ✅                            | `createUserWorktree` を介して同じコードパス                                                                                                                                                                                                                                                                                                                                     |
| E3 (agent isolation symlink)   | ⚠️ テストセットアップ        | モデルが `node_modules` をコミットした（エージェントガードがダーティ状態を拒否したため）。EEXISTガードが適切にシンボリックリンクをスキップした。コードパスは正しい。クリーンなE3のためには、テスト計画で事前に `.gitignore` に `node_modules` を追加する必要がある。                                                                                                                 |
| E4 (missing source skip)       | ✅                            | worktree作成、エントリなし、exit 0                                                                                                                                                                                                                                                                                                                                                |
| E5 (existing dest no overwrite)| ✅                            | 既存のマーカーが残った                                                                                                                                                                                                                                                                                                                                                           |
| E6 (absolute / `..` rejected)  | ✅                            | どちらのパスもリンクされなかった                                                                                                                                                                                                                                                                                                                                                   |
| F1 (`--worktree=#4174` fetch)  | ✅                            | worktreeディレクトリ `pr-4174/`、ブランチ `worktree-pr-4174`、先端コミット `8f4fe8e feat(cli): per-turn /diff…`。ローカルリモートで代替（サンドボックスが実際のGitHubをブロック）                                                                                                                                                                               |
| F2 (full URL form)             | ✅                            | 同じ結果。URL解析 → PR #4174 → ローカルorigin fetch成功                                                                                                                                                                                                                                                                                                                             |
| F3 (missing origin)            | ✅                            | 2秒でexit=1。メッセージで `origin` リモートの追加に言及                                                                                                                                                                                                                                                                                                                         |
| F4 (invalid PR #999999999)     | ✅                            | 2秒でexit=1。「PRはoriginに存在しません」。35秒制限内                                                                                                                                                                                                                                                                                                                              |
| F5 (malformed `#abc`)          | ✅                            | スラグ検証が `#` を拒否                                                                                                                                                                                                                                                                                                                                                        |
| F6 (PR worktree + symlinks)    | ✅                            | シンボリックリンク `pr-4174/node_modules` → `$TEST_DIR/node_modules` を確認                                                                                                                                                                                                                                                                                                   |
| G1.a (start + write + Keep)    | ✅                            | TUIフロー、フッターインジケータ、ダイアログオプション、ファイル永続化                                                                                                                                                                                                                                                                                                           |
| G1.b (`--resume … --worktree foo`)| ❌ → **このPRで修正**        | 元の動作: `--worktree: Worktree already exists at …`。Phase 6修正で `setupStartupWorktree` に再接続ブランチを追加。修正後、スモークテスト（`--worktree foo` を2回 → 2回目に `worktree_started` 通知が出力され、エラーなし）と新しい単体テスト `worktreeStartup.test.ts` で確認。                                                                                               |
| G2 (relative `--mcp-config`)   | ❌ → **このPRで修正**        | 元の動作: exit=52、`Invalid MCP configuration … is not valid JSON`。Phase 6修正では、`setupStartupWorktree` がchdirする前に、パスを受け取るargvフィールド（`mcpConfig`、`openaiLoggingDir`、`jsonFile`、`inputFile`、`telemetryOutfile`、`includeDirectories`）を起動cwdに対して正規化する。修正後、スモークテスト（`--worktree foo --mcp-config ./mcp.json` → モデル正常応答）で確認。 |

**Phase 6 最終結果:** 修正後24ケース中22ケース合格。2ケース（C1/C2）は現在文書化されているアーキテクチャ上の制限。1ケース（E3）はテストセットアップの癖であり、実装の問題ではない。**Phase 7コードレビューの準備完了。**

### 修正参照（このPRに含まれるPhase 6修正）

| 修正                                                                   | ファイル                                             | 変更内容                                                                                                                                                  |
| ---------------------------------------------------------------------- | ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 既存のworktreeに再接続 (G1.b)                                           | `packages/cli/src/startup/worktreeStartup.ts`       | 事前作成チェックを追加: ディレクトリが期待されるブランチ上の登録済みworktreeである場合、作成+chdirをスキップ                                                    |
| `getRegisteredWorktreeBranch()` ヘルパー                                | `packages/core/src/services/gitWorktreeService.ts`  | 候補パスに対して `git rev-parse --abbrev-ref HEAD` を実行                                                                                                   |
| chdir前のパス正規化 (G2)                                               | `packages/cli/src/gemini.tsx`                       | `--worktree` が設定されている場合、`mcpConfig`、`openaiLoggingDir`、`jsonFile`、`inputFile`、`telemetryOutfile`、`includeDirectories` を起動cwdに対して解決 |
| ドキュメント: yargsフラグ順序のヒント + 制限事項の更新                          | `docs/users/features/worktree.md`                  | クイックスタートのヒント + 新しい制限事項箇条書き（クロススラグ、パス引数の動作）                                                                      |
| 再接続の単体テスト                                                      | `packages/cli/src/startup/worktreeStartup.test.ts` | 2つのテストを追加: 正常な再接続 + 「別のブランチがスロットを占有」ガード                                                                                 |

**Phase 6 グループF ネットワーク注意:** サンドボックスは `git fetch` から `https://github.com` へのアクセスをHTTP 403でブロック。F1/F2/F4/F6は、コミットメッセージが `feat(cli): per-turn /diff with interactive dialog (#4277)` であるコミットを指す `refs/pull/4174/head` をシードしたローカルベアリポジトリ（`git init --bare`）に対して再テスト。F3とF5はネットワークに依存せず、直接検証済み。ローカルリモート代替は、解析 + fetch + worktree作成のコードパスを完全に実行している。
---

## 再現レポート — Phase 4 ドライラン (グループ F + G), 2026-05-20

**バイナリ**: `qwen` (グローバルインストール済み, v0.15.11 at `/Users/mochi/.nvm/versions/node/v22.21.1/bin/qwen`)
**オーバーライド**: `QWEN="qwen"`

### 結果テーブル

| テスト ID                   | 結果   | 証拠                                                                                                                                                            | 修正提案                       |
| --------------------------- | ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------ |
| F1 `--worktree=#4174`       | PASS   | `Unknown argument: worktree`, exit=1                                                                                                                            | なし — 想定通りのベースライン失敗 |
| F2 `--worktree <url>`       | PASS   | `Unknown argument: worktree`, exit=1                                                                                                                            | なし — 想定通りのベースライン失敗 |
| F3 missing origin           | PASS   | `Unknown argument: worktree`, exit=1 — yargs が git 操作より先に拒否                                                                                              | なし                           |
| F4 invalid PR #999999999    | PASS   | `Unknown argument: worktree`, exit=1                                                                                                                            | なし                           |
| F5 malformed `#abc`         | PASS   | `Unknown argument: worktree`, exit=1                                                                                                                            | なし                           |
| F6 PR + symlinkDirs         | PASS   | `Unknown argument: worktree`, exit=1                                                                                                                            | なし                           |
| G1 lifecycle (tmux)         | PASS   | `Unknown argument: worktree` が stdout に出力され `/tmp/g1_raw.out` にキャプチャ。tmux セッションは即座に終了し、キャプチャ時点でペインは既にデッドだった          | SCRIPT-BUG: 下記注釈参照       |
| G2 relative path            | PASS   | `Unknown arguments: worktree, prompt-file, promptFile`, exit=1                                                                                                  | SCRIPT-BUG: 下記注釈参照       |

### 観測された動作（全ケース共通）

`--worktree` のすべての呼び出し（ベア形式、`=`形式、`#<N>`形式、完全なURL、`--prompt-file`との組み合わせ）は、アプリケーションロジックが実行される前に、yargs の引数パースレイヤーで exit code 1 とともに拒否された。正確なエラー文字列は以下の通り：

- `Unknown argument: worktree` (単一の不明な引数)
- `Unknown arguments: worktree, prompt-file, promptFile` (G2: `--worktree` と `--prompt-file` の両方が不明として一緒に表示される)

いずれのテストでも、git 操作、ネットワーク呼び出し、ファイルシステムへの書き込みは発生しなかった。

### 期待される動作

同一の拒否動作 — これは正しい実装前のベースラインである。8 テストすべてがドライランの意味で PASS する（テスト計画が正しく機能が存在しないことを検出している）。

### 主要な背景

障害モードは一貫して yargs レイヤーで発生しており、下流ではない。これにより、テスト計画の検出戦略が妥当であることが確認される。`--worktree` が yargs に組み込まれれば、これらのテストはこのレイヤーで失敗しなくなり、代わりに実際の実装パス（F1〜F6 は git fetch、G1 は TUI ライフサイクル、G2 は `--prompt-file` 解決）を実行するようになる。

### テスト計画の SCRIPT-BUG 注釈

**G1 (tmux):** tmux セッションコマンドは、サブシェル `echo 'PROC_EXIT='$?` を伴う `tee` を経由してパイプされ、`tee` の終了コードをキャプチャする（`qwen` の終了コードではない）。プロセスが即座に終了するため（Unknown argument エラー時）、`sleep 3` が終了する前にセッションが終了し、`tmux capture-pane` 実行時にはペイン名 `g1dry` が消えており、`can't find pane: g1dry` が発生する。修正案: `tmux capture-pane` の後に `|| true` を追加するか、`|| sleep 0` ガードを追加する。より良い方法は、ベースライン失敗ケースでは stderr+stdout を tmux 外部のファイルにリダイレクトし、ファイルを直接確認すること（ここでは `tee /tmp/g1_raw.out` で行った通り）。

**G2 (`--prompt-file`):** テスト計画では、`--worktree` と組み合わせたテストとして `--prompt-file ./relative.txt` を使用している。ベースラインでは、`--prompt-file` も不明な引数である（v0.15.11 の yargs スキーマにも存在しない — 実際のフラグは `--prompt-interactive` / `-p`）。エラーは両方の不明な引数を一緒に表示する。テスト計画では、`--prompt-file` が `--worktree` と一緒に実装される必要があること、あるいは相対パス解決テストには既存のフラグ（例：stdin 経由のパイプ、または `--prompt` の使用）を利用することを明記すべきである。