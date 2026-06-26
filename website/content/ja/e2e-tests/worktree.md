# Worktree 機能 E2E テスト計画（フェーズ A + B）

## スコープ

汎用 Worktree 機能のエンドツーエンドテスト:

- フェーズ A: `EnterWorktree` / `ExitWorktree` ツール + SessionService 状態
- フェーズ B: `Agent` ツールの `isolation: 'worktree'` パラメータ + 自動クリーンアップ + worktree 通知

## テスト環境

各テストグループは、競合を避けるために独自の一時 Git リポジトリと tmux セッションで実行します。テンプレートセットアップ:

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

各グループは一意の tmux セッション名（例: `wt-test-a`、`wt-test-b`）と一意の一時ディレクトリを使用します。

ベースラインバイナリ: グローバルにインストールされた `qwen` (0.15.10)。
ローカルビルドバイナリ: `node /Users/mochi/code/qwen-code/.claude/worktrees/trusting-euclid-6fdfb9/bundle/qwen.js`。

## テストグループ A: EnterWorktree ツールの登録と基本作成

**モード:** Headless、`--approval-mode yolo`、`--output-format json`

### A1: システム初期化時にツールが登録される

**手順:**

```bash
<qwen> "say hello" --approval-mode yolo --output-format json 2>/dev/null \
  | jq -r 'select(.type=="system") | .tools[]' \
  | grep -E "^(enter_worktree|exit_worktree)$"
```

**実装前:** 空（ツール未登録）。
**実装後:** `enter_worktree` と `exit_worktree` が出力される。

### A2: 自動生成名で worktree を作成

**手順:**

```bash
<qwen> "create a new git worktree using the enter_worktree tool" \
  --approval-mode yolo --output-format json 2>/dev/null > /tmp/a2.json
# 作成された worktree ディレクトリを確認
ls -la .qwen/worktrees/ | grep -v "^\." | wc -l
# 自動生成されたスラッグパターンに一致するディレクトリがあるはず
```

**実装前:** モデルがツールを見つけられないと言う。`.qwen/worktrees/` ディレクトリが存在しない。
**実装後:** 自動生成スラッグ（形式: `{adj}-{noun}-{4hex}`）の `.qwen/worktrees/<slug>` が存在する。

### A3: カスタム名で worktree を作成

**手順:**

```bash
<qwen> "use the enter_worktree tool with name='my-feature' to create a worktree" \
  --approval-mode yolo --output-format json 2>/dev/null
ls .qwen/worktrees/my-feature/
git branch | grep worktree-my-feature
```

**実装前:** ツール不明。
**実装後:** `.qwen/worktrees/my-feature/` ディレクトリが存在。`worktree-my-feature` ブランチが存在。

### A4: 無効なスラッグが拒否される

**手順:**

```bash
<qwen> "use enter_worktree with name='../../../etc' to create a worktree" \
  --approval-mode yolo --output-format json 2>/dev/null \
  | jq 'select(.type=="user") | .message.content[] | select(.is_error) | .content'
```

**実装前:** ツール不明。
**実装後:** ツール結果が is_error=true で、バリデーションエラーメッセージが返る。

## テストグループ B: ExitWorktree

**モード:** Headless、1 回のプロンプト内での 2 段階のやり取り。

### B1: Enter してから action=keep で exit

**手順:**

```bash
<qwen> "create a worktree named 'temp-keep' using enter_worktree, then immediately exit it with action='keep' using exit_worktree" \
  --approval-mode yolo --output-format json 2>/dev/null > /tmp/b1.json
# keep はディレクトリを保持するため、ディレクトリは残るはず
ls -d .qwen/worktrees/temp-keep
# ブランチも残るはず
git branch | grep worktree-temp-keep
# CWD は元のまま
```

**実装前:** ツール不明。
**実装後:** worktree ディレクトリとブランチが exit 後も両方とも存在する。

### B2: Enter してから action=remove で exit（変更なし）

**手順:**

```bash
<qwen> "create a worktree named 'temp-remove' using enter_worktree, then immediately exit it with action='remove' using exit_worktree" \
  --approval-mode yolo --output-format json 2>/dev/null
ls -d .qwen/worktrees/temp-remove 2>&1
git branch | grep worktree-temp-remove
```

**実装前:** ツール不明。
**実装後:** worktree ディレクトリが削除される。ブランチが削除される。

### B3: 未コミットの変更がある場合、action=remove での exit を拒否する

**手順:** 対話型 tmux セッションを起動し、worktree 内に手動でファイルを作成し、exit を試みる。

```bash
tmux new-session -d -s wt-test-b3 -x 200 -y 50 "cd $TEST_DIR && <qwen> --approval-mode yolo"
sleep 3
tmux send-keys -t wt-test-b3 "create a worktree named 'dirty-test' using enter_worktree"
sleep 0.5
tmux send-keys -t wt-test-b3 Enter
# 完了を待つ
for i in $(seq 1 30); do
  sleep 2
  tmux capture-pane -t wt-test-b3 -p | grep -q "Type your message" && break
done
# worktree 内にダーティファイルを作成
echo "dirty" > "$TEST_DIR/.qwen/worktrees/dirty-test/dirty.txt"
# discard_changes なしで削除を試みる
tmux send-keys -t wt-test-b3 "use exit_worktree with action='remove' to exit the worktree"
sleep 0.5
tmux send-keys -t wt-test-b3 Enter
for i in $(seq 1 30); do sleep 2; tmux capture-pane -t wt-test-b3 -p | grep -q "Type your message" && break; done
tmux capture-pane -t wt-test-b3 -p -S -100 > /tmp/b3.out
# 出力に "uncommitted changes" または "discard_changes" が含まれているはず
grep -E "uncommitted|discard_changes" /tmp/b3.out
tmux kill-session -t wt-test-b3
```

**実装前:** ツール不明。
**実装後:** exit が失敗し、未コミットの変更と `discard_changes` フラグに関するメッセージが表示される。

## テストグループ C: SessionService 永続化

### C1: セッションメタデータ内の Worktree 状態

**手順:**

```bash
SESSION_ID=$(<qwen> "create a worktree named 'persist-test' using enter_worktree" \
  --approval-mode yolo --output-format json 2>/dev/null \
  | jq -r 'select(.type=="system") | .session_id' | head -1)
# セッションストレージで worktree 状態を確認
find ~/.qwen -name "*${SESSION_ID}*" 2>/dev/null | head
grep -l "persist-test" ~/.qwen/projects/*/sessions/*.json 2>/dev/null || \
  grep -rl "worktreeSession\|persist-test" ~/.qwen/projects/ 2>/dev/null | head -5
```

**実装前:** どの場所にも worktree セッション状態が保存されていない。
**実装後:** セッション JSON に `worktreeSession` フィールドが含まれ、`slug='persist-test'`、`worktreePath`、`originalCwd` などが格納される。

## テストグループ D: AgentTool の分離

### D1: Agent 分離パラメータが受け入れられる

**手順:**

```bash
<qwen> "spawn an agent using the agent tool with isolation='worktree' to run 'echo hello'" \
  --approval-mode yolo --output-format json 2>/dev/null \
  | jq 'select(.type=="assistant") | .message.content[] | select(.type=="tool_use" and .name=="agent") | .input'
# 実行中に .qwen/worktrees/ に agent-* スラッグが含まれていることを確認
```

**実装前:** agent ツールスキーマに isolation パラメータがなく、モデルが省略するか、スキーマが拒否する。
**実装後:** agent が isolation='worktree' で正常に実行される。`agent-<7hex>` worktree が作成される。

### D2: Agent が worktree を自動クリーンアップ（変更なし）

**手順:**

```bash
ls .qwen/worktrees/ > /tmp/d2-before.txt 2>/dev/null
<qwen> "spawn an agent with isolation='worktree' to list files in the current directory using ls" \
  --approval-mode yolo --output-format json 2>/dev/null
ls .qwen/worktrees/ > /tmp/d2-after.txt 2>/dev/null
# after は before と等しい（agent-* ディレクトリが残っていない）
diff /tmp/d2-before.txt /tmp/d2-after.txt
```

**実装前:** N/A（isolation パラメータなし）。
**実装後:** agent が変更なしで完了した後、worktrees ディレクトリは変更されていない。

### D3: 変更が行われた場合、Agent worktree が保持される

**手順:**

```bash
<qwen> "spawn an agent with isolation='worktree' to write 'test content' to a new file called test.txt" \
  --approval-mode yolo --output-format json 2>/dev/null > /tmp/d3.json
# worktree は変更とともに保持されるはず
ls .qwen/worktrees/agent-* 2>/dev/null
ls .qwen/worktrees/agent-*/test.txt 2>/dev/null
# agent の結果に worktreePath/worktreeBranch が含まれているはず
jq 'select(.type=="user") | .message.content[] | select(.tool_use_id) | .content' /tmp/d3.json | head
```

**実装前:** N/A。
**実装後:** `.qwen/worktrees/agent-<7hex>/test.txt` が存在。agent の結果に worktree パスとブランチが含まれる。

## テストグループ E: 古い worktree のクリーンアップ

### E1: クリーンアップ関数が古い agent worktree を削除する

これは経過時間が必要なため、e2e でテストするのは難しい。`worktreeCleanup.test.ts` のユニットテストでカバーする:

- mtime が 30 日以上前で、`agent-<7hex>` パターンに一致する worktree → 削除
- mtime が 30 日以上前だが、ユーザーが名前を付けた（例: `my-feature`）worktree → 保持
- mtime が 30 日未満の worktree → 保持
- 未コミットの変更がある worktree → 保持（フェイルクローズ）
- プッシュされていないコミットがある worktree → 保持（フェイルクローズ）

E2E スポットチェック（オプション）: 手動で `touch -t 200001010000 .qwen/worktrees/agent-aabcdef0` を実行し、クリーンアップを呼び出して削除を確認。

## テストグループ F: Arena との互換性（リグレッションなし）

### F1: Arena worktree パスが変更されていない

**手順:** Arena セッション（EnterWorktree とは別）を実行し、依然として `~/.qwen/arena/<sessionId>/worktrees/` の下に worktree を作成し、`.qwen/worktrees/` の下には作成しないことを確認。

```bash
# セットアップ: Arena が有効な設定が必要。詳細は Arena CLI の呼び出し方に依存。
# 実装前: arena worktree は ~/.qwen/arena/ の下にある。
# 実装後: 同じ — arena パスは独立している。
```

（Arena がヘッドレスモードから簡単に到達できない場合、このグループは、`ArenaManager.ts:125`（`this.arenaBaseDir = arenaSettings?.worktreeBaseDir ?? path.join(Storage.getGlobalQwenDir(), 'arena')`）が変更されていないことを確認するユニットテストによって検証される。）

## ユニットテストのカバレッジ（実装と併置）

E2E 計画とは別に、以下のユニットテストを実装に含める必要がある:

- `EnterWorktreeTool.test.ts`: スキーマ検証、スラッグ拒否、ネストされた worktree の拒否、cwd 変更、SessionService 書き込み
- `ExitWorktreeTool.test.ts`: keep と remove のパス、ダーティ状態ガード、discard_changes バイパス、cwd 復元
- `gitWorktreeService.test.ts` の拡張: `createUserWorktree`、`removeUserWorktree`、`createAgentWorktree`、`removeAgentWorktree`
- `sessionService.test.ts` の拡張: WorktreeSession フィールドの読み取り/書き込み、再開時の復元
- `worktreeCleanup.test.ts`: クリーンアップのパターンマッチング、経過時間フィルター、フェイルクローズ条件
- `agent.test.ts` の拡張: isolation パラメータが受け入れられる、worktree が作成される（場合によってはクリーンアップされる）

## 合否基準

| グループ | ビルド前の期待値            | ビルド後の期待値                                        |
| -------- | --------------------------- | ------------------------------------------------------- |
| A1       | ツールがリストされない      | 両方のツールがリストされる                              |
| A2       | エラー/何もしない           | `.qwen/worktrees/<auto-slug>` が作成される              |
| A3       | エラー/何もしない           | `.qwen/worktrees/my-feature` が作成され、ブランチが存在 |
| A4       | エラー/何もしない           | ツール結果が is_error でバリデーションメッセージ        |
| B1       | エラー/何もしない           | worktree ディレクトリ + ブランチが保持される            |
| B2       | エラー/何もしない           | worktree ディレクトリ + ブランチが削除される            |
| B3       | エラー/何もしない           | exit が未コミット変更メッセージで拒否される             |
| C1       | worktree 状態なし            | セッションに worktreeSession フィールド                 |
| D1       | isolation パラメータなし     | agent が `agent-<7hex>` worktree 内で実行される         |
| D2       | N/A                         | agent が変更なしで完了後、worktrees ディレクトリが不変 |
| D3       | N/A                         | `agent-<7hex>` が変更とともに保持される                |

## 実装後の再現レポート

`dist/cli.js` のローカルビルド（`claude/trusting-euclid-6fdfb9` の先端コミット）。

| グループ | 結果                                 | 備考                                                                                                                                                                 |
| -------- | ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A1       | ✅                                   | `system.tools` に `enter_worktree` と `exit_worktree` がリストされる                                                                                                  |
| A3       | ✅                                   | `.qwen/worktrees/my-feature` が作成され、`worktree-my-feature` ブランチが存在                                                                                            |
| A4       | ユニットテストでカバー               | `validateUserWorktreeSlug` がパストラバーサルなどを拒否（`enter-worktree.test.ts`）                                                                                     |
| B1       | ✅                                   | `keep` アクションがディレクトリとブランチの両方を保持                                                                                                                 |
| B2       | ✅                                   | `remove` アクションがディレクトリとブランチを削除                                                                                                                     |
| B3       | ✅                                   | `remove` が拒否、メッセージ: `Refusing to remove worktree "dirty-test" — it has 0 tracked change(s) and 1 untracked file(s).`                                                |
| C1       | 範囲外                               | SessionService の永続化はフェーズ A から延期（`docs/design/worktree.md` のスコープ注記参照）                                                                       |
| D1       | ✅                                   | Agent 呼び出しが `isolation: 'worktree'` を受け入れ、`agent-2c4e759` を作成                                                                                            |
| D2       | ✅                                   | Agent が変更なしで完了後、worktrees ディレクトリは空                                                                                                                 |
| D3       | ✅                                   | Agent が `test.txt` を書き込んだ後、worktree `agent-bad55bd` とブランチ `worktree-agent-bad55bd` が保持される。結果に `[worktree preserved: ... (branch ...)]` サフィックスが含まれる |
| E1       | ユニットテストでカバー               | `worktreeCleanup.test.ts` で `isEphemeralSlug` が `agent-<7hex>` のみに一致することを確認                                                                              |
| F1       | 範囲外（この実行では Arena E2E なし） | Arena コードパスは未変更: `ArenaManager.ts:125` および `setupWorktrees()` は変更なし                                                                                   |

### テスト計画からの範囲の逸脱

- **C1**（SessionService 永続化）はフェーズ A から延期されました。最小限のフェーズ A では、絶対 worktree パスを返すことで、モデルが機械的に `Config.targetDir` を切り替える代わりに絶対パスを直接使用できるようにします。再開サポートには SessionService の拡張が必要であり、将来のフェーズで対応予定です。
- **A2**（自動生成名）は D1/D3 で間接的に検証済み。これらのテストは agent 分離フローを通じて同じ自動スラッグパスを実行します。