# OOM 壓力テストと長タスクReplayレポート

**日付**: 2026-05-19
**ブランチ**: `codex/memory-diagnostics-local-run`
**テスター**: yiliang114
**結論**: 再現に成功し、根本原因を特定。v0.15.7 (#3735) で導入された auto-compaction により `structuredClone`
の呼び出し頻度が倍増し、ヒープ高圧時に正のフィードバックループを形成して OOM を引き起こしていた。実際のデバッグログがそのメカニズムを完全に裏付けている。

---

## 一、背景

複数の issue（#4309, #4276, #4185, #4315, #4322, #2868）で、qwen-code が長いセッション中に V8 ヒープ OOM クラッシュを起こすという報告が寄せられた：

```
FATAL ERROR: Ineffective mark-compacts near heap limit Allocation failed - JavaScript heap out of memory
```

ユーザー報告のクラッシュ特徴：
| Issue | クラッシュ時ヒープ | 稼働時間 | プラットフォーム |
|-------|--------------------|----------|------------------|
| #4276 | 4014 MB | ~110 分 | Linux x64 |
| #4315 | 2027 MB | ~19.6 時間 | macOS (デフォルト 2GB limit) |
| #4322 | 4023 MB | ~7 時間 | Windows |
| #2868 | 2035 MB | ~1.7 分 | Linux |
| #4309 | 7020 MB | 不明 | Windows (8GB limit 設定してもクラッシュ) |

---

## 二、方法論の修正

本レポートでは2種類のテストを区別する：

1. **低ヒープ圧力テスト**: `--max-old-space-size` を下げて問題を増幅し、迅速に「history が大きいときに全体コピーが瞬間的なピークを生む」コードパスを特定するためのテスト。診断ツールであり、ユーザーの現実の 4G/8G OOM 再現と等価ではない。
2. **デフォルトヒープ長タスク replay**: `NODE_OPTIONS` を設定せず、実際の JSONL history を復元して review タスクを継続実行すると同時に、プロセス外から process-tree RSS をサンプリングするテスト。この結果のみがユーザー側の実際のメモリ量を判断するために使用される。

よって、低ヒープの結果は単独で「実際の OOM は修正済み」の証明にはならない。history が十分大きいときにあるパスがピーク増幅を引き起こすことを示すに過ぎず、さらにデフォルトヒープ長タスクによる検証が必要である。

## 三、低ヒープ圧力テスト条件

| パラメータ | 値 |
| ------------------------ | ------------------------------------------------------------ |
| CLI バージョン | 0.15.11 (`codex/memory-diagnostics-local-run` ブランチから build) |
| Model | `qwen3.6-plus` (128K context window) |
| Heap limit | `--max-old-space-size=512` |
| Heap-pressure safety net | **無効** (HEAP_PRESSURE_COMPRESSION_RATIO を 99.0 に設定) |
| 操作モード | YOLO + 自動化マルチターン Read ファイルタスク |
| 作業ディレクトリ | qwen-code monorepo (3538 .ts ファイル, 1.26M 行) |

### キー設定変更

`packages/core/src/core/geminiChat.ts` において、heap-pressure compaction の閾値を 0.7 から 99.0 に変更（決して発動しない状態に）、#4186 修正前の状態をシミュレート。

---

## 四、低ヒープ圧力テスト結果

### クラッシュタイムライン

```
[21:26:59] #1 RSS:193.6MB Ctx:0%   → Read geminiChat.ts (1500 行)
[21:27:46] #2 RSS:270.4MB Ctx:4.2% → Read agent.ts
[21:28:32] #3 RSS:397.5MB Ctx:4.3% → grep + Read 3 ファイル
[21:29:18] #4 RSS:452.7MB Ctx:5.7% → Read slashCommandProcessor.ts
[21:30:04] #5 RSS:515.0MB Ctx:5.9% → Read chatCompressionService.ts
[21:30:50] #6 RSS:649.1MB Ctx:4.0% ← TOKEN COMPACTION トリガー (5.9%→4.0%)
                                       RSS が逆に 134MB 増加 (structuredClone ピーク)
[21:31:36] #7 RSS:666.7MB Ctx:3.2% ← 再度 compaction, RSS さらに上昇
[21:32:22] CRASH — FATAL ERROR: Ineffective mark-compacts near heap limit
```

**総所要時間**: ~5.5 分、7 ラウンドのタスク後にクラッシュ。

これは制限ヒープ下で、長い history + compaction/history clone が V8 ヒープ OOM を引き起こしうることを示している。
ただし、この結果はデフォルトヒープ下での実際のユーザー OOM が完全に再現されたことを意味するわけではない。

### より大きなヒープでの合成再現

512 MiB の低ヒープ結果のみに依存しないために、より大きなヒープでの合成ランタイム圧力テストを追加した。このテストではモデルを呼び出さず、長い review/subagent タスクと同様の history を構築する：

- root review turns: 10
- subagent calls: 30
- subagent transcript records: 780
- retained tool result bytes: 193,986,560
- serialized history bytes: 195,620,061
- pressure mode: 保持された `structuredClone(history)` コピー

| Heap limit | Clone pressure | 結果 | 主要 GC / stack |
| ---------- | -------------- | ---- | --------------- |
| 2 GiB | 8 保持 clone | クラッシュせず、RSS 2.42 GiB、heap used 1.87 GiB | ヒープ limit に近い |
| 2 GiB | 10 保持 clone | OOM | `Reached heap limit`, `ValueDeserializer`, `StructuredClone` |
| 4 GiB | 20 保持 clone | OOM | `Reached heap limit`, `ValueDeserializer`, `StructuredClone` |

2 GiB 再現時の GC サマリ：

```
Mark-Compact 2042.9 (2081.9) -> 2042.9 (2081.1) MB
Mark-Compact 2048.9 (2087.2) -> 2048.9 (2087.2) MB
FATAL ERROR: Reached heap limit Allocation failed - JavaScript heap out of memory
...
node::worker::(anonymous namespace)::StructuredClone
```

4 GiB 再現時の GC サマリ：

```
Mark-Compact 4082.5 (4126.8) -> 4082.5 (4126.3) MB
Mark-Compact 4095.1 (4139.0) -> 4095.1 (4139.0) MB
FATAL ERROR: Reached heap limit Allocation failed - JavaScript heap out of memory
...
node::worker::(anonymous namespace)::StructuredClone
```

この結果セットは 512 MiB 圧力テストよりもユーザー報告の 2 GiB / 4 GiB ヒープ OOM に近い。
history 内に十分多くの大きな tool result / subagent transcript が保持されていれば、history 全体に対する保持または瞬間的な clone は 2-4 GiB ヒープでも V8 OOM を引き起こすことができる。これは依然として合成再現であり、完全な業務長タスク replay と等価ではないが、問題が「小さいヒープの人為的なもの」ではないことを直接示している。

### クラッシュ時の GC 状態

```
[41381:0x130008000] 342468 ms: Mark-Compact 508.6 (526.7) -> 507.0 (526.9) MB,
  pooled: 1 MB, 86.42 / 0.00 ms  (average mu = 0.175, current mu = 0.150)
  task; scavenge might not succeed

[41381:0x130008000] 342568 ms: Mark-Compact 509.1 (526.9) -> 507.1 (528.2) MB,
  pooled: 0 MB, 93.79 / 0.12 ms  (average mu = 0.121, current mu = 0.068)
  allocation failure; scavenge might not succeed

FATAL ERROR: Ineffective mark-compacts near heap limit
Allocation failed - JavaScript heap out of memory
```

Mark-Compact では 1-2 MB しか回収できず（ほぼすべてのオブジェクトが reachable）、メモリが合法的に保持されたオブジェクトで占有されていることを示している。

---

## 五、デフォルトヒープ長タスク replay

低ヒープの結論の過度な一般化を避けるため、デフォルトヒープでの実際の JSONL replay を追加した：

- `NODE_OPTIONS` を設定しない
- 内部 runtime profiler も無効化（サンプラー自体がヒープに影響を与えないように）
- 各 CLI は同一の rewound JSONL から新規セッションを複製
- 一時的な `QWEN_HOME` を使用し、MCP と hooks を無効にしてローカルグローバル設定の汚染を防ぐ
- プロセス外サンプリングのみで process-tree RSS を収集

| CLI | 結果 | 時間 | Tree RSS ピーク | Root RSS ピーク | Worker RSS ピーク | 備考 |
| -------------------- | ---- | -----: | ------------: | ------------: | --------------: | ----------------------------------------------------------- |
| installed `qwen` | 成功 | 167.3s | 838.0 MiB | 230.2 MiB | 566.3 MiB | 最初の fresh run でモデルサーバー側エラーが発生したため、結論には含めず；リトライ成功 |
| local rebuilt bundle | 成功 | 106.3s | 527.5 MiB | 182.1 MiB | 345.4 MiB | ローカル clone ホットパスの修正を含む |

デフォルトヒープ replay の結論：

1. 今回の review JSONL では、数百 MiB から約 0.8 GiB の process-tree RSS を安定して発生させるが、4G/8G OOM は再現されなかった。
2. local rebuilt bundle は同一起点 replay で installed CLI よりもピークが低く、history clone ホットパスの削減が実際に効果があることを示している。
3. これですべてのユーザー OOM が解決されたことにはならない。実際の 4G/8G OOM はさらに長いタスク、より大きな tool-result 蓄積、あるいは MCP/tool schema 圧力を保持した replay による継続検証が必要である。

## 六、根本原因分析

### OOM の3層メカニズム

```
┌─────────────────────────────────────────────────────────┐
│ Layer 3: V8 Heap Limit (512MB/2GB/4GB)                  │ ← ユーザーが最終的に衝突する場所
├─────────────────────────────────────────────────────────┤
│ Layer 2: structuredClone() による瞬間的なピーク増幅 (~2x) │ ← 直接の誘因
├─────────────────────────────────────────────────────────┤
│ Layer 1: History 内の tool result の蓄積 (線形成長)       │ ← ベース成長
├─────────────────────────────────────────────────────────┤
│ Layer 0: Token compaction のトリガー条件                 │ ← 制御点
└─────────────────────────────────────────────────────────┘
```

### 正確なクラッシュパス

```
sendMessage()
  → tryCompress()
    → heapPressureRatio < threshold (safety net disabled)
    → ChatCompressionService.compress()
      → chat.getHistory(true)
        → structuredClone(this._history)   ← ピーク割り当て！
          → V8 は clone のために追加で ~N MB を必要とする
          → existing heap + N > limit の場合 → OOM
```

### 重要な証拠

| 観察 | 意味 |
| --------------------------------------- | ---------------------------------------------- |
| Task #5→#6: Context 5.9%→4.0% (減少) | Token compaction **正常に実行**された |
| Task #5→#6: RSS 515→649 MB (134MB 増加) | Compaction プロセスの `structuredClone` がピークを生み出した |
| GC は 1-2 MB しか回収できない | すべてのオブジェクトが live（history + clone 両方存在） |
| #4309 で 8GB limit 設定してもクラッシュ | history が十分大きい場合、clone ピークはあらゆる limit を超えうる |

注意：上記の証拠は低ヒープ圧力テストと issue 現象からの組み合わせ推論に基づく。デフォルトヒープ replay は現時点では「clone ホットパスがピーク RSS に顕著な影響を与える」ことを支持しているが、4G/8G OOM の単独再現には至っていない。

### なぜ 128K context window で発生しやすいのか

- 128K × 70% = ~90K tokens で compaction がトリガー
- 大きな context window (1M) の 70% = 700K tokens、ほとんどトリガーされない
- **compaction が頻繁になるほど structuredClone も頻繁 → OOM リスク増加**
- DeepSeek など contextWindowSize を設定していないモデルはデフォルト 128K であり、より発生しやすい

---

## 六.5、実際の実行ログによる裏付け

以下のログはローカル crash session のデバッグ出力から抽出した。ローカルパスや session id の漏洩を防ぐため、タイムラインと主要ログ内容のみを報告する。

session は `2026-05-19T13:26:35Z` (ローカル 21:26:35) に開始、`2026-05-19T13:32:10Z` (ローカル 21:32:10) にクラッシュ。

### Heap Pressure と Auto-Compaction イベントタイムライン

```
13:29:43 [WARN]  Heap pressure at 74.9%; attempting auto-compaction before token threshold.
13:30:06 [DEBUG] [FILE_READ_CACHE] clear after auto tryCompress    ← compaction #1 正常実行
13:30:13 [WARN]  Heap pressure at 70.7%; attempting auto-compaction before token threshold.
                 ← 圧縮直後、ヒープは 74.9% から 70.7% にしか下がらず、依然として閾値を超えているため即座に再試行
13:30:52 [DEBUG] Heap pressure at 86.0%; skipping heap-pressure auto-compaction during cooldown.
                 ← 30秒のクールダウン中は実行を拒否
13:30:56 [WARN]  Heap pressure at 85.3%; attempting auto-compaction before token threshold.
                 ← クールダウン終了、ヒープが 85.3% まで上昇
13:31:21 [DEBUG] [FILE_READ_CACHE] clear after auto tryCompress    ← compaction #2 正常実行
13:31:37 [WARN]  Heap pressure at 88.8%; attempting auto-compaction before token threshold.
                 ← 圧縮後、ヒープが 88.8% に跳ね返る
13:32:09 [DEBUG] Heap pressure at 90.2%; skipping heap-pressure auto-compaction during cooldown.
                 ← ヒープが 90.2% に達し、クールダウン中で実行できず
13:32:10 ← ログ終了（プロセスが OOM クラッシュ）
```

### ログ証拠の解釈

| ログ観察 | 意味 |
| ------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| 2.5 分間に **4 回**の heap-pressure auto-compaction 試行（うち 2 回はクールダウンで拒否） | #3735 で導入された `tryCompress` が高圧時に頻繁にトリガー |
| 各 compaction 実行後もヒープ割合が 70% を超えている | `structuredClone()` による一時的なピークが圧縮のメリットを相殺 |
| 74.9% → 70.7% → 86% → 85.3% → 88.8% → 90.2% → crash | 正のフィードバックループ：圧縮→clone ピーク→ヒープ上昇→再圧縮→さらに上昇 |
| ログが 90.2% の 1 秒後に途絶 | 次の `getHistory(true)` の `structuredClone()` が瞬間的に limit 超過 |
| `[FILE_READ_CACHE] clear after auto tryCompress` が 2 回出現 | compaction が完全な compress → setHistory パスを通過したことを確認 |

### 正のフィードバックループメカニズム

```
ヒープ割合高 (>70%)
  → heap-pressure auto-compaction がトリガー
    → tryCompress() 内部で getHistory(true) を呼び出し
      → structuredClone(this._history)  ← 瞬間的なヒープピーク +30~40%
        → compaction 成功、古い history 解放
          → しかし clone ピークがヒープをさらに危険な水位に押し上げる
            → 次の send でさらに蓄積
              → ヒープ割合がさらに高くなる → より頻繁にトリガー → crash
```

---

## 六.6、バージョン帰属：なぜ 0.15.7 ~ 0.15.11 で OOM 報告が増加したか

### 主要コミットタイムライン

| バージョン | PR | 変更 | `structuredClone` 呼び出し頻度への影響 |
| ------------ | ---------------------------------------------------- | ----------------------------------------------------------------------------------- | ----------------------------------- |
| **v0.15.6** | — | `getHistory(true)` は `sendMessage` のエントリで 1 回だけ呼ばれる | ベースライン：send ごとに clone 1 回 |
| **v0.15.7** | **#3735** `auto-compact subagent context` | `tryCompress()` を `GeminiChat` に導入し、**毎回の send の前に** compaction チェックを 1 回実行 | **+1 回**：send 前に compress チェック |
| **v0.15.10** | **#3879** `reactive compression on context overflow` | provider が context overflow を返したときに `tryCompress()` + `getHistory(true)` を再度トリガー | **+1~2 回**：overflow retry パス |
| **v0.15.10** | **#3985** `harden reactive compression` | reactive compression のリトライロジックを強化 | 同上 |

### v0.15.6 と v0.15.11 の `getHistory(true)` 呼び出し箇所の比較

**v0.15.6** (2箇所)：

```
L367: const requestContents = this.getHistory(true);          ← send リクエスト構築
L618: const recoveryContents = self.getHistory(true);         ← MAX_TOKENS escalation (ほとんど発生しない)
```

**v0.15.11** (5箇所)：

```
L467: ChatCompressionService.compress() 内部で呼び出し              ← #3735: send 前の auto-compact
L574: requestContents = this.getHistory(true);                ← send リクエスト構築
L724: reactive tryCompress() 内部で呼び出し                         ← #3879: context overflow 後の retry
L739: requestContents = self.getHistory(true);                ← #3879: retry で新しいリクエスト構築
L943: const recoveryContents = self.getHistory(true);         ← MAX_TOKENS escalation
```

### 最悪パス：1回の send で 4 回の `structuredClone` が発生可能性

```
sendMessage()
  → tryCompress()              ← #3735: getHistory(true) [clone #1]
  → getHistory(true)           ← リクエスト構築 [clone #2]
  → API が context overflow を返す
    → reactive tryCompress()   ← #3879: getHistory(true) [clone #3]
    → getHistory(true)         ← retry リクエスト [clone #4]
```

### 結論

**#3735 (v0.15.7)** は OOM 頻度の顕著な上昇の最も可能性の高い引き金（唯一の根本原因ではない）である——これにより毎回の `sendMessage` で最初に `tryCompress()` が実行され、`tryCompress` 内部の `ChatCompressionService.compress()` → `chat.getHistory(true)` を通じて全量の `structuredClone` が発生する。history が大きい場合、この「先に clone してから圧縮が必要か判断する」設計によりメモリピークが ~1.3x から ~2x+ に上昇する。注：issue history では #3735 以前から OOM 報告は存在したが、#3735 が structuredClone の呼び出し頻度を大幅に増やし、その結果 OOM の発生確率を著しく高めた。

**#3879 (v0.15.10)** は問題をさらに悪化させた——すでにヒープ境界にある状況（provider が context overflow を返す）で再度全量 clone をトリガーし、もともと危険だった session をクラッシュしやすくした。

---

## 七、#4186 修正効果の検証（比較テスト）

heap-pressure safety net (HEAP_PRESSURE_COMPRESSION_RATIO = 0.7) を有効にした場合の比較テスト：

| 指標 | safety net 無効 | safety net 有効 |
| --------------- | ------------------ | ------------------------- |
| OOM 発生 | あり（7 ラウンド後にクラッシュ） | なし（10 分以上継続実行） |
| RSS ピーク | 666 MB → クラッシュ | 555 MB → GC 回収で 280 MB |
| Compaction トリガー | token threshold のみ | heap 70% で事前にトリガー |
| Context 挙動 | 5.9%→4.0%→クラッシュ | 22.7%→17.0%（安全に低下） |

**結論**: #4186 の heap-pressure safety net は OOM を効果的に防いだが、これは**軽減策**であって根本的解決ではない。

- history 自体がすでにヒープの 60%+ を占めている場合、たとえ事前に compact しても、clone のピークが依然として limit を超える可能性がある
- これにより #4309 のユーザーが 8GB limit を設定してもクラッシュした理由が説明される

---

## 八、メモリ占有分布

テスト中の RSS 増加パターンに基づく推定：

| メモリ位置 | 割合 | 増加特性 |
| -------------------------------- | ------ | --------------------------- |
| `this._history[]` (tool results) | 40-50% | 線形蓄積、1 ラウンドあたり +30-100MB |
| `structuredClone()` 一時コピー | 30-40% | 瞬間ピーク、compaction 時に出現 |
| V8 runtime (GC metadata, code) | ~15% | ほぼ一定 |
| UI/logging/stream buffers | ~5% | 緩やかに増加 |

---

## 九、再現スクリプトと環境

### 自動化ドライバースクリプト

```bash
#!/bin/bash
# /tmp/oom-simple-driver.sh <tmux-session-name>
SESSION="$1"

TASKS=(
  "Read ツールを使って packages/core/src/core/geminiChat.ts を完全に読み込む"
  "Read ツールを使って packages/core/src/tools/agent/agent.ts を完全に読み込む"
  "grep -rn structuredClone packages/core/src を実行し、最初の3ファイルを Read"
  "Read ツールを使って packages/cli/src/ui/hooks/slashCommandProcessor.ts を完全に読み込む"
  "Read ツールを使って packages/core/src/services/chatCompressionService.ts を完全に読み込む"
  "find packages/cli/src/ui/commands -name '*.ts' を実行し、一つずつ Read"
  "Read ツールを使って packages/core/src/core/turn.ts を完全に読み込む"
  # ... さらにタスク
)

i=0
while true; do
  TASK="${TASKS[$((i % ${#TASKS[@]}))]}"
  i=$((i + 1))

  QWEN_PID=$(ps aux | grep "dist/index.js" | grep -v grep | awk '{print $2}' | sort -rn | head -1)
  RSS=$(ps -o rss= -p $QWEN_PID 2>/dev/null)
  [ -z "$RSS" ] && { echo "CRASH after $((i-1)) tasks!"; exit 0; }

  RSS_MB=$(echo "scale=1; $RSS/1024" | bc)
  CTX=$(tmux capture-pane -t "$SESSION:1" -p 2>/dev/null | grep -oE "[0-9]+\.[0-9]+% 已用" | tail -1)
  echo "[$(date +%H:%M:%S)] #$i RSS:${RSS_MB}MB Ctx:$CTX | ${TASK:0:55}"

  tmux send-keys -t "$SESSION:1" C-u
  sleep 0.2
  tmux send-keys -t "$SESSION:1" "$TASK" Enter
  sleep 0.5
  tmux send-keys -t "$SESSION:1" Enter
  sleep 45
done
```

### 起動コマンド

```bash
# 1. heap-pressure safety net を無効化
# geminiChat.ts: HEAP_PRESSURE_COMPRESSION_RATIO = 99.0

# 2. Build
npm run build --workspace=packages/core && npm run build --workspace=packages/cli

# 3. qwen を起動 (128K context model, 512MB heap)
SESSION="oom-test"
tmux new-session -d -s "$SESSION" -c "$REPO_DIR"
tmux send-keys -t "$SESSION" \
  "NODE_OPTIONS='--max-old-space-size=512' node packages/cli/dist/index.js --model 'qwen3.6-plus'" Enter

# 4. 起動後にドライバーを実行
sleep 10
bash /tmp/oom-simple-driver.sh "$SESSION"
```

---

## 十、今後の提案

### 短期的軽減策（既存）

- [x] #4186: heap-pressure auto-compaction safety net (0.7 threshold)
- [x] #4188: fileReadCache / crawlCache 上限設定

### 中期的修正（推奨）

- [ ] `structuredClone()` 呼び出しの削減 — `nextSpeakerChecker` は最後のメッセージだけ必要であり、全量 clone する必要はない
- [ ] Compaction で全量 deep clone の代わりに slice + 参照を使用
- [ ] 大きな tool result (>100KB) は一時ファイルに書き出し、history にはサマリ参照のみ保持

### 長期的方向性

- [ ] Tool result のディスクへのオフロード + lazy load (#4184)
- [ ] RSS ベースの段階的圧縮戦略（token count だけでなく）
- [ ] History の分割保存により、1回の全量操作を回避