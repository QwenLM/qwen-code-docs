# AbortController リファクタリング — 検証計画

PR を開く前に手動で変更を検証するためのシナリオ。各シナリオは、`tmux pipe-pane -o 'cat >> <log>'` を使用して tmux ペインをキャプチャします。

## 一度だけのセットアップ

```sh
# Point WT at your local checkout of the branch under review.
WT=/path/to/qwen-code/worktree
LOGDIR=$WT/docs/verification/abort-controller-refactor/logs
mkdir -p "$LOGDIR"

# Build the CLI once (skip sandbox image, skip vscode).
( cd "$WT" && npm run build:packages )
```

## シナリオ

各シナリオについて:

```sh
tmux new-session -d -s qwen-verify-XX
tmux pipe-pane -t qwen-verify-XX -o "cat >> $LOGDIR/XX-name.log"
tmux send-keys -t qwen-verify-XX "cd /path/to/your/test/workspace && exec node $WT/packages/cli/dist/index.js" C-m
tmux attach -t qwen-verify-XX
```

次に、以下のマトリックスに従って手動でセッションを操作します。完了したら `C-b d` でデタッチし、`tmux kill-session -t qwen-verify-XX` でペインを停止します。

### 00 — ベースライン (修正前)

- **Setup:** `main` をチェックアウトし、ビルドし、`NODE_OPTIONS=--trace-warnings` で実行します。
- **Input:** 長い 50 ラウンドの複数ツールセッション (shell + edit + grep + agent)。
- **Expected:** 約 30-40 ラウンド後に、`MaxListenersExceededWarning: ... 1500+ abort listeners added to [AbortSignal]` が stderr に出力される。
- **Log:** `00-baseline-reproduction.log`。

### 01 — 長時間セッション、DEBUG モード (このブランチ)

- **Setup:** `NODE_OPTIONS=--trace-warnings DEBUG=1 qwen`。
- **Input:** #00 と同じ 50 ラウンドのスクリプト。
- **Expected:** `MaxListenersExceededWarning` が出力されない。その他の警告は引き続き出力される。
- **Log:** `01-long-session-debug.log`。

### 02 — 長時間セッション、プロダクションモード (このブランチ)

- **Setup:** `qwen` (デバッグ環境変数なし)。
- **Input:** 同じ 50 ラウンドのスクリプト。
- **Expected:** クリーンな出力。ハンドラ内に一時的に追加された `console.error` プローブ (追加後削除) によってフィルタが機能していることが確認できる。
- **Log:** `02-long-session-prod.log`。

### 03 — Ctrl-C による途中中断

- **Setup:** このブランチ、対話モード。
- **Input:** 長い生成 (>30秒) を要求し、途中で Ctrl-C を押す。
- **Expected:** ストリームが約 200ms 以内に停止し、"Cancelled" バナーが表示され、次のプロンプトが入力を受理する。`process._getActiveHandles()` のカウントがベースラインに戻る (`:debug handles` を使用)。
- **Log:** `03-ctrlc-streaming.log`。

### 04 — 長時間実行中のシェルのキャンセル

- **Setup:** このブランチ。
- **Input:** シェルツールで `sleep 60` を実行し、実行中にキャンセルする。
- **Expected:** 子プロセスが強制終了され (`pgrep -f sleep` が空を返すことで確認)、ツール結果にキャンセルが表示され、エージェントが次のプロンプトを受理する。
- **Log:** `04-shell-cancel.log`。

### 05 — サブエージェントのキャンセル

- **Setup:** このブランチ。
- **Input:** エージェントツールを使用して長時間のエージェントタスクを生成し、親からキャンセルする。
- **Expected:** サブエージェントの実行中のツール呼び出しが中断され、サブエージェントのモデルストリームが停止し、親がキャンセルイベントを受信する。
- **Log:** `05-subagent-cancel.log`。

### 06 — ヘッドレス / 非対話型の中断

- **Setup:** `qwen --prompt "do a long task"` を実行し、外部から `kill -INT <pid>` で `SIGINT` を送信する。
- **Expected:** クリーンにシャットダウンし、終了コード 130、警告なし。
- **Log:** `06-headless-abort.log`。

### 07 — バックグラウンドエージェントフロー

- **Setup:** 対話モード。
- **Input:** バックグラウンドエージェントを起動し (`run_in_background: true`)、完了させる。2 つ目を起動し、途中で 2 つ目をキャンセルする。
- **Expected:** 最初のエージェントは正常に完了。2 つ目はクリーンに中断。2 つのエージェント間でリスナーリークは発生しない。
- **Log:** `07-background-agent.log`。

### 08 — メモリベースライン

- **Setup:** `qwen --inspect` で起動し、Chrome DevTools をアタッチする。
- **Input:** 100 ラウンドのセッション。
- **Expected:** ラウンド 0/50/100 でのヒープスナップショット。`AbortSignal` インスタンス数とシグナルごとのリスナー数が安定している (単調増加なし)。
- **Log:** `08-memory-snapshots/`。

### 09 — 既存の combinedAbortSignal コンシューマー

- **Setup:** 外部シグナルとタイムアウトの両方を持つ HTTP フックをトリガーする。
- **Input:** (a) フックの途中で外部シグナルをキャンセル。(b) 別の実行でタイムアウトを発生させる。
- **Expected:** 両方のケースでフックがクリーンに中断される。非推奨のシムパスが実行される。
- **Log:** `09-http-hook-shim.log`。

## 自動化された (非対話型) 検証

以下の自動化チェックは開発中に実行され、`automated-results.md` に記録されました。

- すべての abortController ユニットテストがパス (`abortController.test.ts`、26 テスト。`--expose-gc` なしで 1 つの GC テストはスキップ)。
- すべての warningHandler テストがパス (`warningHandler.test.ts`、13 テスト。サブプロセスの stderr 統合テストを含む)。
- すべての `combineAbortSignals` コンシューマーテストがパス (`httpHookRunner.test.ts`)。非推奨の `createCombinedAbortSignal` シムとそのテストファイルは、唯一の呼び出し元が移行した後に削除されました。
- すべてのエージェントランタイム / followup / openaiContentGenerator / hooks テストがパス。
- 移行範囲 (意図的): agent-runtime の親→子チェーン (`agent-interactive.ts`、`agent-core.ts`、`agent-headless.ts`) と `promptHookRunner.ts` (実際のクリーンアップリーク) のみがヘルパーに切り替えられました。独立した短命のコントローラー (シェルコマンドごと、fetch ごと、recall ごとなど) は、そのままの `new AbortController()` を使用し続けます。これらはすぐに GC され、長時間存続する親にリスナーを蓄積しません。キャプチャした grep と理由については `migration-completeness.txt` を参照してください。
- TypeScript の厳格モード型チェックが `packages/core` と `packages/cli` の両方でパス。
- Prettier チェックが変更されたすべてのファイルでパス。

実際のコマンド出力は `automated-results.md` を参照してください。

## PR 本文用のアーティファクトをキャプチャする方法

各シナリオを実行した後、トランスクリプトファイル (または関連する抜粋) を PR に添付します。#08 (メモリ) の場合は、ヒープスナップショットをエクスポートし、スナップショット間のリスナー数の差分を含めます。