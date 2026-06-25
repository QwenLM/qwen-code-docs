# Agent Loop ラウンド削減：Skill 設計から始める

> `rt-optimization-design.md` と同ディレクトリに置き、互いに補完する関係にある。あちらは**フレームワーク機構**レベルのラウンド削減（D1 末尾総括ラウンドのスキップ、D2 fast ルーティング、D4 prevalidate）を扱うが、本ドキュメントは**ラウンド削減の真のレバレッジは skill/tool 設計層にある**と主張し、フレームワーク改造にも cache ヒット率データにも依存しない実装パスを提示する。

---

## 0. 検収 Spec（開発前置 gate）

> 本節は開発の**前置 gate** — どの spec を着手前に確定すべきか、どの spec をデータドリブンで後から確定すべきかを列挙する。spec を前置することで、(a) 完成後にメトリクスが計測不能であることが判明する、(b) 閾値が結果に引きずられて結論が歪む、(c) ストップロスが設定されず「作業しているように見えるが成果がない」状態に陥る、という問題を回避する。
>
> **本 spec フレームワークの適用範囲**：このフレームワークは P1.5 ベースライン計測後に方向性の正しさを判断できることを前提とする。「ラウンド削減」シナリオでは明確に計測可能なシグナル（ラウンド数、followup_rate、batch_size）があるためこの前提が成立する。**前提が成立しないシナリオ**（将来、同フレームワークを「品質最適化」など定量化困難な方向に適用する場合）では、spec 前置がむしろ迅速な学習を妨げる可能性がある。その際は §0.5 ガバナンスプロセスに戻って再評価し、本フレームワークを機械的に適用しないこと。

**spec は 4 層に分類 — タイミングが異なる**：

| 層 | 種別 | 確定タイミング |
| ---- | --------------------------------------- | -------------------------------- |
| §0.1 | エンジニアリング層 spec（データパイプライン・コード変更の正確性） | **前置**、即座に確定可能 |
| §0.2 | 統計層 spec（プロジェクトの「成功」指標） | **前置**、閾値は P1.5 ベースライン後に確定 |
| §0.3 | ストップロスライン（「発生したら中止」のハード条件） | **前置**、変更不可 |
| §0.4 | per-skill spec（具体的な変更対象と目標値） | **後置**、Layer 1 データドリブン |

### 0.1 エンジニアリング層 spec（前置必須 · 即座に確定可能）

データパイプラインとコード変更の正確性 spec — ビジネス判断やベースラインデータに依存せず、着手前に確定すべきもの：

- **qwen-logger パイプライン疎通**（§4.1.1b）：skill_launch イベントが OTLP と qwen-logger の両パイプラインに記録される
- **`prompt_id` の連結**：単一の user prompt が起点の `skill_launch` と後続の `tool_call` が同一の `prompt_id` で完全なトレイルとして grep できる
- **`batch_size` が undefined でない**（§4.3.2 方向 A）：単一ツールの batch は `batch_size = 1` / `batch_position = 0` を明示的に設定する
- **SQL が動作する**（§4.1.2）：オフライン SQL が実際の telemetry バックエンドで非空の結果を出力し、followup_rate が高い/低い skill を区別できる
- **ベースライン分散 < P50 × 20%**（P1.5）：ベースライン計測が安定している（でなければ後続の A/B 比較が信頼できない）— 注：本条は §0.1 エンジニアリング層に列挙しているが、**確定は P1.5 ベースラインデータに依存する**ため §0.1 中唯一の後置検証項である。P1.5 を通過しない場合、§0.2 の閾値を信頼できる形で確定できない
- **Skill サイズ予算**（Layer 2 改造）：followup を内部処理化した後、skill 説明のトークン数が改造前の 2× を超えず、かつ絶対値 ≤ 500 tokens（小さい方を採用）。超過する場合は §4.2 に従って skill を分割し、統合しないこと。本条は §7 第 2 条および §4.2 の既存制約と整合しており、spec 層に前置する
- **`npm run preflight` が全て通過**：各 PR のハード要件

### 0.2 統計層 spec（前置必須 · 閾値は P1.5 後に確定）

プロジェクトが「統計的に成功」と見なせる指標 — **方向**は前置確定、**閾値**はベースライン計測後に確定（根拠なく数値を設定することを避けるため）：

| 指標 | 方向 | 確定タイミング | 暫定閾値（要校正） |
| ---------------------------------- | -------- | --------- | ---------------------- |
| top-3 skill 加重 `followup_rate` | ↓ | P1.5 末 | ≥ 30% |
| skill を含むセッションの端到端 RT P50 | ↓ | P1.5 末 | ≥ 2s |
| `batch_size > 1` の tool_call 割合 | ↑ | P3 前 | ≥ 30% |
| 改造 skill の発動シナリオ A/B 有意性 | p < 0.05 | P2 完了前 | n は要確定 |

> **重要な制約**：暫定閾値はコミットメントではない。P1.5 ベースラインが「top-5 skill 加重 followup_rate < 30%」を示した場合（§0.3 ストップロスライン #1 の発動）、プロジェクトを終了する。**閾値を「達成」させるために spec を下方修正してはならない**。
>
> **計測方法**：各指標の計測方法、SQL テンプレート、A/B 設計は §5.1-§5.2 を参照。統計的有意性（p < 0.05）のサンプルサイズ計算は §5.1 を参照。

### 0.3 ストップロスライン（前置必須 · P-1 確定後は限定的に変更可）

§5.3 に列挙済み。これらは「発生したら中止」のハード条件 — **§0.2 統計層 spec を達成するためにストップロスラインを緩和することはいかなる場合も不可**。

- **結果指標**（3 件）：top-5 加重 `followup_rate < 30%` / 2 つの skill 改造後 RT P50 ↓ < 1s / Layer 3 後 `batch_size P50` が依然 = 1
- **プロセス指標**（3 件）：skill 命中率 ↓ ≥ 5pp / インライン followup 失敗率 ≥ 5% / ユーザーキャンセル率 ↑ ≥ 2pp

詳細は §5.3 を参照。

**変更可能性ルール**（データ根拠のない硬直した規律を避けるため）：

| フェーズ | 変更可否 | 変更方向 |
| --------------------- | ---------------------------------------- | ------------------------------------------------------------------------------- |
| P-1 確定時 | ✅ 任意変更可（過去の telemetry またはコンセンサスに基づく） | 任意 |
| P-1 確定後 → P1.5 末 | ❌ 変更不可 | — |
| P1.5 末（ベースライン公開時） | ✅ **緩和方向のみ**一度だけ許可 | 緩和（例：30% → 25%）にはデータ根拠 + 2 人レビューが必要。**収縮は不可**（事後のストップロス追加防止） |
| P1.5 以降 | ❌ 変更不可 | — |

> 閾値の暫定値（30% / 1s / 5pp 等）は現時点で**過去データの裏付けなし**、P-1 レビュー前のエンジニアの直感による。P-1 レビュー時に直近 4 週間の過去 telemetry を取得できる場合は、過去データに基づいてストップロスラインを校正すること。取得できない場合は暫定値を維持し、P1.5 末に上記の「一度だけ緩和」ルールを適用する。

### 0.4 per-skill spec（後置必須 · データドリブン）

具体的にどの skill を変更し、`followup_rate` の目標値をいくつにするか — **Layer 1 データが出るまで確定しない**。

確定しない理由：事前設計と事後データは大きく乖離することがある。前置強制すると `rt-optimization-design.md` §7 D2 路線の轍を踏む — 「fast モデルが 2-3s 速い」という事前仮定が、cache 実装という事後事実によって覆され、純収益がほぼゼロかマイナスになった先例がある。

**成果物の置き場**：per-skill spec は P1.5 末にデータドリブンで作成し、各 Layer 2 PR の description に独立して記載する（design ドキュメントには含めない。skill を一つ変更するたびにドキュメントを更新することを避けるため）。

**per-skill spec 構造テンプレート**（§4.2 の PR description 必須項目と対応 — この 2 つのリストは同一のもので、§4.2 はプロセス視点、本節は spec 視点）：

| フィールド | 内容 | データソース |
| --------------- | ------------------------------------------------------------------------------------------------------ | -------------------------------------- |
| 1. 現状データ | invocation_count、followup_rate、top followup tools | Layer 1 telemetry |
| 2. 目標 | followup_rate を X% から Y% に削減 | §0.2 の改善方向に基づき、絶対値は PR 内で自己定義 |
| 3. 改造範囲 | どの followup をインライン化するか（read/grep/shell read-only）、明示的に**インライン化しない**もの（write 操作 / 別 skill / 深い推論） | §4.2 改造モード表 |
| 4. 出力コントラクト更新 | skill 説明に追加する事前宣言（"Returns: ..."） | §3.2 改造例 |
| 5. A/B 計画 | 改造後 2 週間の followup_rate / RT P50 / プロセス指標の観察、§5.1 検収ラインとの対照 | §5.1 |
| 6. サイズ証明 | 改造前後の skill 説明トークン数（tiktoken で推定）、§0.1「Skill サイズ予算」を超えないこと | §0.1 第 6 条 |

### 0.5 spec ガバナンス

- **§0.1 / §0.3 spec の変更**には design ドキュメントの更新 + PR レビューが必要。§0.3 は §0.3「変更可能性ルール」に従い P1.5 末のウィンドウ内でのみ緩和可
- **§0.2 閾値の変更（P1.5 確定後）**には以下のデータ根拠を少なくとも 1 つ添付する：
  - (a) P1.5 ベースライン計測結果と確定済み閾値との乖離分析（元の計測記録へのリンク含む）
  - (b) 同種プロジェクトの公開 benchmark データ（ソースへのリンク含む）
  - (c) 社内 ≥ 2 人のレビュー署名付き乖離説明

  PR レビュー時に上記根拠が一切ない場合、レビュアーは **PR をブロックする義務がある** — 「エンジニアの直感による調整」は認めない

- **§0.4 per-skill spec** はデータドリブンで作成後、PR description に記載する（§0.4 の 6 項テンプレートに従い、design ドキュメントには含めない）

---

## 1. 背景と位置付け

### 1.1 問題

`rt-optimization-design.md` §1.2 に示されたベースライン：3 ラウンドの agent loop、13.4s 端到端、うち LLM 呼び出しが 78% を占める。各ラウンドは約 3-4s。

```
Round 1 (3.8s, 28%): LLM が skill を呼び出すことを決定
Round 2 (3.0s, 22%): LLM が shell を呼び出すことを決定
Round 3 (3.8s, 28%): LLM が総括
```

`rt-optimization-design.md` §6/§7 で 2 回のレビューを経た結果、D2/D4 は却下され、D1/D3 も「浮き油対応完了後に再評価」に格下げされた。しかし**元のドキュメント全体が末尾の Round 3（総括ラウンド）や単一ラウンド内のマイクロ最適化（D4）に集中しており、Round 1 → Round 2 という「中間ラウンド」がなぜ発生するのか、排除できるかどうかについては全く正面から議論していない**。

実際のところ：Round 2 が存在する理由は、**大多数のケースで Round 1 が呼び出した skill が完全な回答を返さなかった**ため、モデルが追加の shell クエリを発行して補完するからである。skill を「一度で完全な結果を返す」設計にすれば、3 ラウンド → 2 ラウンドになり、削減できるのは Round 2 の約 3s — これは D1 とは全く重複しない収益面である。

### 1.2 rt-optimization-design との関係

| ラウンド削減方向 | 対象ラウンド | レバレッジ位置 | 本ドキュメントの位置付け |
| -------------------- | ------------------------------- | ---------------------------- | ---------------------------- |
| D1 `skipLlmRound` | 末尾総括ラウンド | フレームワーク機構 + per-tool opt-in | フォールバック、**Layer 2 以降に実施** |
| D2 fast ルーティング | 単一ラウンドのレイテンシ | フレームワーク機構 | defer 済み、**本ドキュメントの範囲外** |
| D3 Summarizing 状態 | 末尾総括ラウンド（知覚層） | UI ステートマシン | オプション、本方案と直交 |
| D4 prevalidate | 単一ラウンドのレイテンシ | フレームワーク機構 | defer 済み、**本ドキュメントの範囲外** |
| **本方案 Layer 1-3** | **中間決定ラウンド + 並列未発動ラウンド** | **skill 設計 + プロンプトエンジニアリング** | **新規追加方向** |

### 1.3 核心的な主張

ラウンド削減の真のレバレッジは skill/tool 設計層にあり、agent フレームワークにはない。3 つの理由：

1. **§1.2 のベースライン自体が問題の所在を skill に示している** — Round 1 → Round 2 への遷移は skill が不完全な返答をしたために発生しており、フレームワークは正しいが、skill が誤っている
2. **フレームワークレベルのラウンド削減も最終的には per-tool opt-in が必要** — D1 の `skipLlmRound` は各ツールで明示的にマークする必要があり、一回りして skill エンジニアリングに戻る。さらに追加の不変量修正とデシジョンゲートコストが生じる
3. **ROI が局所的に計測可能でグレイリリースが容易** — 1 つの skill を変更すれば、その skill の発動回数分だけラウンドが削減される。cache ヒット率データもシステム横断的な変更も不要

> **実装前に §0 検収 Spec 前置レビュー（P-1 フェーズ、0.5d）を必ず実施すること** — §0.1 エンジニアリング層 spec と §0.3 ストップロスラインは着手前に確定必須。§0.2 統計層閾値の方向性も前置確認が必要（具体的な数値は P1.5 ベースライン後に確定）。§0 をスキップして P0 実装に入ることは「完成後に指標を確認する」アンチパターンを黙認することと同義であり、本ドキュメントはそのアプローチを推奨しない。

---

## 2. 設計原則

1. **agent フレームワークを変更しない** — `useGeminiStream` / `coreToolScheduler` / `geminiChat` のコアパスには触れない
2. **データドリブンで優先順位を決める** — まず telemetry を構築し、どの skill を変更すべきかをデータに語らせる。直感に頼らない
3. **per-skill で計測可能・グレイリリース可能** — 各 skill の改造は独立して A/B 検証し、失敗時は局所的にロールバック
4. **複利優先** — 収益 = 単一ラウンド削減の収益 × 発動頻度。高頻度 skill を優先
5. **D1 に依存しない** — 本方案の成功は D1 の実装に依存しない

---

## 3. 三層方案

### 3.1 Layer 1：ラウンド削減 Telemetry（金脈を探す）

**目標**：どの skill が最も改造価値があるかをデータに示させる — つまり「この skill を使った後、モデルが追加のツール呼び出しを行う確率がどれだけ高いか」を把握する。

**コアフィールド**（per-turn、per-skill-invocation）：

```typescript
interface SkillFollowupRecord {
  skill_name: string;
  prompt_id: string; // 同一 user prompt 内の全イベントを関連付ける
  turn_index: number; // この skill が loop の何ラウンド目か
  followup_tool_names: string[]; // 同一 prompt_id で skill 以降に呼び出されたツール
  followup_count: number; // followup_tool_names.length
  followup_kinds: Kind[]; // Read/Edit/Execute/...
  next_turn_is_terminal: boolean; // skill の次のラウンドがテキスト出力（ツール呼び出しなし）
  user_followup_within_30s: boolean; // 結果表示から 30s 以内にユーザーが新しい prompt を追加（品質回帰シグナル）
}
```

**主要指標**：

- `skill_followup_rate = sum(followup_count > 0) / total_invocations`
- `terminal_after_skill_rate = sum(next_turn_is_terminal) / total_invocations`
- `(skill_name, top followup tool)` で集計 — どの skill の後に最もよく追加されるツールを特定

**金脈の判定**：

```
(invocation_count_weekly × skill_followup_rate) ≥ threshold
↓
この skill はラウンド削減の金脈、Layer 2 改造を優先
```

閾値の推奨：上記の式でソートした top-3 skill のうち、最初の 2 つから着手する。

### 3.2 Layer 2：Skill 出力の完全化

**目標**：金脈として識別された skill が一度で完全な回答を返すようにし、Round 1 → Round 2 への遷移を排除する。

**改造モード（followup タイプ別）**：

| Followup パターン | 典型的なシナリオ | 改造方向 |
| --------------------------- | -------------------------- | ---------------------------------- |
| skill → `read_file` | skill がパスを返し、モデルが再度読み込む | skill 内部で直接読み込み、内容を返す |
| skill → `grep/glob` | skill がディレクトリを返し、モデルが再度検索 | skill 内部で検索し、マッチ結果を返す |
| skill → `shell` (read-only) | skill がコマンドを返し、モデルが再度実行 | skill 内部でコマンドを実行し、出力を返す |
| skill → `shell` (write) | skill が方案を返し、モデルが書き込みを実行 | **保留**（書き込み操作は確認が必要、統合すべきでない） |
| skill → another skill | チェーン呼び出し | **統合しない**（組み合わせ可能性を保持） |

**改造チェックリスト（per-skill PR テンプレート）**：

1. skill 説明に**出力コントラクトを事前宣言**：「Returns: full file content / matched lines / command output」と明記し、モデルが追加クエリを発行する必要がないことを示す
2. skill 内部で**全 read-only followup を完了**：telemetry が > 50% の追加率を示す read/search 操作を skill 内部にインライン化する
3. **write 操作をインライン化しない**：書き込み操作はユーザー確認が必要であり、独立したラウンドにする必要がある
4. **深い推論 followup をインライン化しない**：followup が「この結果を元にさらに分析する」という内容であれば、それはモデルの仕事であり skill の仕事ではない
5. **A/B telemetry を付与**：改造後 2 週間で `followup_rate` が < 20% に低下したかを比較する

**典型的な改造例（概要）**：

改造前：

```
skill "list-workspaces" returns: ["ws_a", "ws_b"]
→ Round 2: model calls shell to get details for each workspace
```

改造後：

```
skill "list-workspaces" returns:
  - ws_a (owner: foo, last_active: 2026-05-20, status: active)
  - ws_b (owner: bar, last_active: 2026-05-01, status: archived)
description updated: "Returns workspaces with owner, last_active, status"
→ Round 2 disappears for ~80% of queries
```

### 3.3 Layer 3：プロンプトでモデルの並列実行を促す

**目標**：独立したツール（複数ファイルの読み込み、複数ディレクトリの検索）に対し、モデルが同一ラウンドで並列に tool_calls を発行し、N ラウンドを 1 ラウンドに圧縮できるようにする。

**前提**：基盤インフラは既に整っている — `tools/tools.ts:818` の `CONCURRENCY_SAFE_KINDS` と `coreToolScheduler` の `partitionToolCalls` は同一 batch 内の read/search/fetch ツールを並列実行できる。**不足しているのはモデルが並列 tool_calls を積極的に発行する意欲だけ**であり、qwen-coder はデフォルトでシリアル実行を好む。

**変更場所**：`packages/core/src/core/prompts.ts`（監査済み。`# Final Reminder` セクション L396 付近に追加してもキャッシュヒット以外には影響しない — 一度限りのウォームアップコストのみ）。

**ガイダンステキスト（概要、A/B 調整が必要）**：

```
When you need to call multiple independent read-only tools (read_file,
grep, glob, web_fetch), emit them in a SINGLE tool_calls batch — do NOT
call them sequentially across rounds. They will execute concurrently.

Examples:
- Reading 3 files for comparison: emit 3 read_file calls in one batch
- Searching for 2 patterns: emit 2 grep calls in one batch

Do NOT batch when the second call depends on the first call's result.
```

**効果の計測**：新たに telemetry フィールド `batch_size`（同一ターン内の tool_calls 数）を追加し、プロンプト変更前後の分布を比較する。

#### 3.3.1 `CONCURRENCY_SAFE_KINDS` の拡張（Layer 3 のサブ項目）

プロンプトでモデルの並列実行を促すのは供給側（モデルが一度に複数の tool_calls を発行する意欲）だが、`tools/tools.ts:818` の `CONCURRENCY_SAFE_KINDS = { Read, Search, Fetch }` が**実際に並列実行できるツールの範囲**を決定する：`partitionToolCalls`（`coreToolScheduler.ts:775`）は「連続する安全なツール」をまとめて concurrent batch にし、それ以外は個別にシリアル実行する。

モデルがガイダンスに従って 3 つの tool_calls を一度に発行しても、そのうち 1 つが `Kind.Execute` で安全集合に含まれない場合、batch 全体が分割されてシリアル実行になる — Layer 3 のプロンプト変更による収益がランタイムスケジューリングによって相殺される。

**拡張候補**（リスクの低い順）：

- `Kind.Think`（save_memory / todo_write を含む）—— **追加しない**、暗黙の書き込みがある
- 読み取り専用 shell（`isShellCommandReadOnly()` が true を返す Execute）—— `partitionToolCalls` には既に特別処理がある（`coreToolScheduler.ts` の `partitionToolCalls` コメントに「Execute (shell) is safe only when isShellCommandReadOnly() returns true」と記載）。現状で既に対応済みのため `CONCURRENCY_SAFE_KINDS` の変更は不要
- MCP ツールを `Kind` で分類 —— 各 MCP server の動作の差異が大きく、ツール登録時に明示的な opt-in が必要

**結論**：現在の集合は合理的であり、**Layer 3 は `CONCURRENCY_SAFE_KINDS` の拡張に依存しない**。本節が存在する意義は：`batch_size` telemetry データ収集後、**「並列 batch P50 が期待値を下回る」場合、モデルが並列化しないのではなく `partitionToolCalls` によって分割されているのではないかを先に確認する**ためである。これは Layer 3 A/B が失敗した際の診断パスであり、必須作業ではない。

> クレジット：codex レビューが「`CONCURRENCY_SAFE_KINDS` の拡張は見落とされたレバレッジ」と指摘。確認した結果、現状に `isShellCommandReadOnly` の特別処理が最大の部分をカバーしており、集合の拡張自体は収益が小さくリスクが大きいと判断。診断パスとして保留。

---

## 4. 詳細実装

### 4.1 Layer 1：Telemetry 拡張（1-2d）

#### 4.1.1 `SkillLaunchEvent` に `prompt_id` を追加

**場所**：`packages/core/src/telemetry/types.ts:896`

現状の `SkillLaunchEvent` は `skill_name` + `success` のみを含み、**`prompt_id` がない** — 同一ターン内の他の `ToolCallEvent` と関連付けることができない。

```typescript
// types.ts:896
export class SkillLaunchEvent implements BaseTelemetryEvent {
  'event.name': 'skill_launch';
  'event.timestamp': string;
  skill_name: string;
  success: boolean;
  prompt_id: string;                    // 新規追加
  turn_index?: number;                  // 新規追加

  constructor(
    skill_name: string,
    success: boolean,
    prompt_id: string,                  // 新規追加
    turn_index?: number,                // 新規追加
  ) { ... }
}
```

**呼び出し元の更新**：`packages/core/src/tools/skill.ts` の 4 つの `logSkillLaunch` 呼び出しポイント（L386, L399, L426, L482）で `this.params` から `prompt_id` を取得できない — `BaseToolInvocation` は `params` のみを保持し、`request.prompt_id` フィールドがない。**実際の実装**ではダックタイピングでの注入を使用：`SkillToolInvocation` が `setPromptId(id)` setter + プライベート `promptId` フィールドを公開し、`CoreToolScheduler.buildInvocation`（`coreToolScheduler.ts:1253`）がビルド後にダックタイプで `setPromptId(request.prompt_id)` を呼び出す。これは既存の `setCallId` フックのパターンと整合している。invocation の `execute()` 内の 4 つの `logSkillLaunch` はすべて `this.promptId` を渡す。**初期バージョンの本節の記述（「BaseToolInvocation は既に request.prompt_id を持つ」）は誤りであり**、PR #4565 のレビュー後に修正済み。

#### 4.1.1b qwen-logger パイプラインの修復（前置）

`prompt_id` を追加する前に、**既存のパイプラインの断点**を解消する必要がある：`packages/core/src/telemetry/qwen-logger/qwen-logger.ts:908` に `logSkillLaunchEvent(event)` メソッドが定義されているが、**リポジトリ内に呼び出し元が一切存在しない** — `loggers.ts:958` の `logSkillLaunch` は `logs.getLogger(SERVICE_NAME).emit()` という OTLP パスを直接使用しており、qwen-logger をバイパスしている。

影響：

- OTLP パス上の skill_launch イベントは OTLP コレクターに届いている（動作中）が、qwen-logger の専用上報パイプラインは現在デッドである
- telemetry バックエンドが OTLP ではなく qwen-logger から消費している場合、skill_launch イベントが**完全に上報されない**
- §4.1.2 のオフライン SQL が `SkillFollowupRecord` を派生させるには skill_launch イベントのデータベース書き込みが必要 — **まず skill_launch がバックエンドで可視かどうかを検証する必要がある**

修復方向（2 択）：

- **A**（推奨）`loggers.ts:958` の `logSkillLaunch` に `QwenLogger.getInstance(config)?.logSkillLaunchEvent(event)` の 1 行を追加し、`loggers.ts:230` の `logToolCall` の書き方と整合させる
- **B** バックエンドが OTLP のみから消費していることを確認し、qwen-logger 内の `logSkillLaunchEvent` を `@deprecated` マークするか削除する

**なぜ QwenLogger の 1 パスだけを追加し、`logToolCall` の 4 パス全てに合わせないのか**：

`logToolCall`（`loggers.ts:220-247`）には実際に 4 つの出口がある：

1. `uiTelemetryService.addEvent(...)` — UI 表示
2. `config.getChatRecordingService()?.recordUiTelemetryEvent(...)` — チャット履歴
3. `QwenLogger.getInstance(config)?.logToolCallEvent(...)` — qwen-logger バックエンドテレメトリー
4. OTLP `logger.emit(...)` — OpenTelemetry

skill_launch は**純粋なバックエンドテレメトリーイベント**であり、UI 上に表示する必要はない（ユーザーは SkillTool の returnDisplay を既に見ている）、また ChatRecording のターン履歴にも入れる必要はない（skill 内部のツール呼び出しはそれぞれ recordUiTelemetryEvent で記録済み）。したがって第 3 パス（QwenLogger）のみを追加し、第 4 パス（OTLP）を保持し、1/2 をスキップするのは意図的であり、見落としではない。

**フィールドの透過的な伝達**：`loggers.ts:961-966` の `{ ...event }` スプレッドで新フィールドは自動的に透過される（`prompt_id` を `SkillLaunchEvent` に追加すれば自動的に有効）。ただし `qwen-logger.ts:908` の `logSkillLaunchEvent` 内部が `event.skill_name` / `event.success` を明示的に分割代入している場合、新フィールドは自動的に含まれないため手動での同期が必要。

工数：A パス約 0.5d（バックエンド確認含む）；B パス約 0.2d（コード削除 + ドキュメント説明）。

#### 4.1.2 `SkillFollowupRecord` の派生（オフライン集計）

新しいイベントタイプは不要 — `ToolCallEvent` と `SkillLaunchEvent` はどちらも `prompt_id` を持ち、オフライン SQL で派生できる：

```sql
-- 擬似 SQL、実際の telemetry バックエンドに合わせて調整
WITH skill_events AS (
  SELECT prompt_id, skill_name, timestamp FROM events
  WHERE event_name = 'skill_launch' AND success = true
),
tool_events AS (
  SELECT prompt_id, function_name, timestamp FROM events
  WHERE event_name = 'tool_call'
),
followups AS (
  SELECT s.skill_name, s.prompt_id,
         COUNT(t.function_name) AS followup_count,
         ARRAY_AGG(t.function_name) AS followup_tool_names
  FROM skill_events s
  LEFT JOIN tool_events t
    ON s.prompt_id = t.prompt_id AND t.timestamp > s.timestamp
  GROUP BY s.skill_name, s.prompt_id
)
SELECT skill_name,
       COUNT(*) AS invocations,
       AVG(followup_count) AS avg_followup,
       SUM(CASE WHEN followup_count > 0 THEN 1 ELSE 0 END)::FLOAT / COUNT(*) AS followup_rate
FROM followups
GROUP BY skill_name
ORDER BY invocations * followup_rate DESC;
```

#### 4.1.3 1 週間 telemetry を実行してデータを収集

- ユーザー向けの動作は変更しない
- 設定スイッチは不要 — telemetry には opt-in フレームワークが既にある（`telemetry.target` 設定項目）
- 1 週間後に skill ランキングレポートを生成

### 4.2 Layer 2：Skill 改造（per-skill 0.5-1d）

Layer 1 データに基づき top-down で改造する。各 skill は独立した PR とし、PR description に以下を必ず含めること：

1. **データ**：現在の invocation_count、followup_rate、top followup tools
2. **改造範囲**：インライン化した followup（明示的にインライン化しないものも記載）
3. **出力コントラクト更新**：skill 説明に追加した事前宣言
4. **A/B 計画**：改造後 2 週間後に followup_rate を再観察

**注意事項**：

- skill 内部での read 操作インライン化で、read_file のすべての境界ケース処理（エンコード、バイナリ検出など）を重複して実装しないこと — `read_file` ツール自体を呼び出し、再実装しない
- grep/glob のインライン化も同様
- shell コマンドのインライン化は `executeToolCall` の標準パスを使用すること（telemetry を保持）
- **skill のサイズを爆発させない**：followup をインライン化した後、skill 説明が > 500 tokens になる場合は統合ではなく分割する

### 4.3 Layer 3：プロンプト教育（0.5d 変更 + 実測チューニング）

#### 4.3.1 並列実行ガイダンスの追加

**場所**：`packages/core/src/core/prompts.ts` の `# Final Reminder` セクション（L396）

§3.3 のガイダンステキストを追加する。具体的な文言は A/B が必要 — まず最もシンプルなバージョンから始め、並列率の改善程度に応じて調整する。

#### 4.3.2 `batch_size` telemetry の追加

**場所**：`packages/core/src/telemetry/types.ts` の `ToolCallEvent` または新規軽量 `ToolBatchEvent`

```typescript
// 選択肢 A：ToolCallEvent にフィールドを追加（侵入度が小さい）
export class ToolCallEvent {
  ...
  batch_size?: number;        // 同一 batch 内の tool_call 数
  batch_position?: number;    // batch 内での位置（0 始まり）
}

// 選択肢 B：ToolBatchEvent を新規追加（セマンティクスが明確、完全な新イベントタイプのフロー必要）
```

**選択肢 A を推奨** — 変更が小さく、クエリ時の集計が便利。

**状態伝達パス**（重要 — 初期バージョンではこのステップのコストが過小評価されていた）：

`coreToolScheduler.ts:2456` の `partitionToolCalls(callsToExecute)` が `batches` を返すが、**batch 情報はスケジューリングパス上で即座に失われる**：

```
executeToolCalls
  └─ batches = partitionToolCalls(...)           // batch.calls.length がわかる
     └─ for batch of batches:
        └─ this.runConcurrently(batch.calls, ...) // batch.calls.length がわかる
           └─ executeSingleToolCall(call, ...)   // ❌ batch がわからない
              └─ ...
                 └─ finalizeToolCalls
                    └─ logToolCall(config, new ToolCallEvent(call)) // ❌ batch コンテキストなし
```

`ToolCallEvent` のコンストラクタ（`types.ts:189`）は単一の `CompletedToolCall` のみを受け取り、batch フィールドがない。

修復方向：

- **方向 A**（推奨）：`ScheduledToolCall` に `batchSize?: number` + `batchPosition?: number` を追加。2 つの分岐でそれぞれ設定：
  - 並列分岐（`coreToolScheduler.ts:2459-2460`、`batch.calls.length > 1`）：`runConcurrently(batch.calls, ...)` のループに入る前に各 `call` に `batchSize = batch.calls.length`、`batchPosition = i` を設定
  - シリアル分岐（`L2462-2464` の `for (const call of batch.calls)`）：単一ツール batch は `batchSize = 1`、`batchPosition = 0` を明示的に設定（**undefined をデフォルトにしない**。でなければ下流の telemetry 集計で並列化未発動のラウンドをデータ欠損と誤判定する）

  `new ToolCallEvent(call)` のコンストラクタで `call` からこれらの 2 フィールドを読み取る

- **方向 B**：`ToolCallEvent` コンストラクタのシグネチャを `new ToolCallEvent(call, batchInfo?)` に変更し、全ての呼び出し元を同期変更する（4 つの logToolCall 呼び出しポイント + テスト）。方向 A より変更範囲が大きい

工数：方向 A 約 0.5d（ユニットテスト含む）；方向 B 約 1d（呼び出し元が多い）。

**「モデルの並列実行意欲」の同時計測** — Layer 3 で prompts.ts を変更する前後で `batch_size > 1 の tool_call 割合` の分布を比較する。これは Layer 3 が有効かどうかの重要指標であり、このデータがなければ Layer 3 A/B を締めくくることができない。

#### 4.3.3 cache への影響評価

`prompts.ts` の変更により DashScope のエフェメラルキャッシュが一度だけ無効になる（初回リクエストは cache miss、その後は回復）。これは既知の一度限りのコストであり、`rt-optimization-design.md` §7.8 のプロンプト定常状態監査を参照。

---

## 5. 検収と計測

> **本節は §0 検収 Spec の「方法論」の補完** — §0 が「成功の指標 + 閾値の前置/後置タイミング」を宣言し、§5 が「どう計測するか、SQL をどう書くか、A/B をどう設計するか」を説明する。本節の閾値は §0.2 の現在の暫定値であり、最終値は P1.5 ベースライン計測後に確定する。

### 5.1 per-skill A/B 指標（改造後 2 週間）

| 指標 | 検収ライン | 備考 |
| ----------------------------------------- | ------------------------ | -------------------------- |
| その skill の `followup_rate` | < 20%（改造前が 70%+ の場合） | 主指標 |
| その skill 発動シナリオの端到端 RT P50 | ≥ 2s 低下 | LLM 呼び出し 1 ラウンド削減による |
| その skill の `user_followup_within_30s` 率 | 上昇しないこと | ユーザーが追加質問をしない = 回答が完全 |
| その skill の `success` 率 | 低下しないこと | followup インライン化が新たな失敗を招かない |

### 5.2 全体 RT 指標

| 指標 | ベースライン | Layer 2 top-3 skill 改造完了後の目標 |
| ---------------------------------- | ------------------------------------- | -------------------------------- |
| 端到端 RT P50（skill を含むセッション） | 13.4s（単一採用）/ ≥3 シナリオのベースライン要補完 | 2-3s 低下 |
| Tool batch P50 サイズ（Layer 3） | 要計測 | ≥ 1.3（> 30% の呼び出しが並列 batch を含む） |
| Skill 全体 followup_rate（加重平均） | 要計測 | ≥ 30% 低下 |

### 5.3 失敗シグナル — この方向をいつ諦めるか

**結果指標ストップロスライン**：

- Layer 1 データ公開後、**top-5 skill の加重 followup_rate < 30%** → ラウンド削減の余地が小さく、Layer 2 を継続する価値がない
- Layer 2 で 2 つの skill を改造後、**端到端 RT P50 の低下 < 1s** → 改造方向が誤り（followup が write 操作で統合すべきでない可能性）、停止して振り返る
- Layer 3 プロンプト変更から 2 週間後も **batch_size P50 が依然 = 1** → モデルが並列実行ガイダンスを受け入れない、Layer 3 を諦めて Layer 1+2 のみ保持

**プロセス指標ストップロスライン（前置警告、「作業しているように見えるが成果がない」状態を避けるため）**：

- **Skill 命中率（意図した skill vs 実際に選択された skill）が ≥ 5pp 低下** → skill 説明の変更でモデルが誤った skill を選択するようになった。典型的なシナリオ：改造前はユーザーが X と聞くと常に skill_a にヒットしていたが、改造後は時々 skill_b にルーティングされるがエラーは発生しない（モデルが誤った skill を使うが辛うじて回答を作り出す）、結果指標は正常に見えるが followup_rate が逆に上昇する。**計測方法**：telemetry に `skill_invocation_pattern` を追加 — user prompt の先頭 N キーワードでクラスタリングし、各クラスターが主にどの skill を発動するかを確認。改造前後で top-1 のシフトを比較
- **Skill のインライン followup 失敗率 ≥ 5%** → skill 改造で元々存在しなかった失敗モード（例：`read_file` のインライン化で大きなファイルがメモリを使い果たす）が発生。計測：`SkillLaunchEvent.success` の改造前後比較
- **per-skill のユーザーキャンセル率（Ctrl+C）が ≥ 2pp 上昇** → skill の出力が遅くなったり長くなったりしてユーザーが待ちきれなくなった。計測：`ToolCallEvent.status === 'cancelled'` の割合

---

## 6. D1/D3 との接続

### 6.1 D1 との関係

Layer 2 で top skill を改造した後、**残りの followup が多い skill こそが D1 `skipLlmRound` の真の適用シナリオ** — それらの skill は出力が既に完全（Round 2 が不要）であり、かつ終端クエリである（Round 3 の総括も無駄）。

実施順序：

1. Layer 1 telemetry をリリース → 1 週間データ収集
2. Layer 2 で top 2-3 skill を改造 → A/B 2 週間
3. Layer 3 プロンプト並列化 → 実測 1 週間
4. **この時点で** D1 を評価：残りの高頻度 skill のうちどれだけが「出力完全 + 終端クエリ」の形態か → 2-3d のフレームワーク改造に値するか

### 6.2 D3 との関係

D3（`StreamingState.Summarizing`）は知覚層の最適化であり、本方案と完全に直交する。Layer 1-3 が削減するのは**実際のラウンド数**であり、D3 が削減するのは**ユーザーが感じる待機時間**である。Layer 2 で RT がユーザーが許容できるレベルまで低下した場合、D3 の価値は下がる。逆の場合は D3 を重ねて適用できる。

---

## 7. 制限と既知のリスク

1. **カバレッジが改造範囲に制限される** — 10 の skill を改造すれば、その 10 のシナリオのみカバーされる。ただし収益は確実に計測可能で複利効果がある
2. **skill 内部への followup インライン化で単一 skill が重くなる可能性がある** — 説明が膨張し、ロードが遅くなり、再利用性が低下する。Layer 2 チェックリスト第 5 条で防御
3. **Layer 3 でモデルが並列実行ガイダンスを聞かない可能性がある** — qwen-coder の学習データはシリアル実行に偏っている。A/B データがプロンプト変更の無効を示す可能性があり、既知の失敗モードとして認識
4. **Telemetry のプライバシー境界** — `SkillFollowupRecord` はツールパラメータを記録すべきでない（既にデフォルトで `ToolCallEvent.function_args` から取得しているが、skill_name がユーザーの意図を漏らさないか監査が必要）
5. **サブエージェント / cron / notification には適用されない** — これらのパスは skill システムを経由せず、本方案はカバーしない
6. **ベースラインデータが薄い** — `rt-optimization-design.md` §1.2 の単一採用データを踏襲しており、Layer 2 実装前に ≥3 シナリオのベースラインを補完する必要がある
7. **`logSkillLaunch` のフィールド拡張により既存の telemetry コンシューマが壊れる** — 4 つの呼び出しポイントと下流の logger を同期変更する必要がある
8. **`qwen-logger.ts:908` の `logSkillLaunchEvent` は現在デッドコード** — リポジトリ内に呼び出し元が一切なく、§4.1.1b に前置修復項目として列挙済み

### 7.1 既存のフレームワーク機構との境界（本方案の範囲外）

リポジトリには既にラウンド削減と間接的に関連するフレームワーク機構がいくつか存在する。**本方案はそれらを再発明せず、代替もしない**：

| 既存機構 | 場所 | 本方案との関係 |
| ---------------------------------------------------- | ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------- |
| `partitionToolCalls` + `runConcurrently`（並列実行） | `coreToolScheduler.ts:775, 2473` | Layer 3 で直接再利用。本方案は変更しない |
| `CONCURRENCY_SAFE_KINDS`（並列実行可能なツールを決定） | `tools/tools.ts:818` | §3.3.1 で現状が合理的であることを論証済み。拡張しない |
| `FileReadCache`（同一ファイルの重複読み込みを回避） | `services/fileReadCache.ts` | 「モデルがファイルを重複読み込みする」ラウンドに間接的な影響があり、既に有効。本方案は依存せず、強化もしない |
| `chatCompressionService`（履歴圧縮） | `services/chatCompressionService.ts` | ラウンドとは直交（単一ラウンドのコストに影響し、ラウンド数には影響しない）。`rt-optimization-design.md` §3.2 の fast ルーティングの `wouldTriggerCompression` gate と同一コンポーネント |

これらを列挙するのは、「本方案が既存の機構を無視している」という誤解を避けるためである。

---

## 8. 実施タイムライン

> **前提：本タイムラインは P-1 から開始し、スキップ不可**。P-1 は §0 検収 Spec の前置レビューであり、0.5d の工数だが**強制的** — 通過しない場合は P0 に進まない。この制約は「先にコードを書いて後から spec を補う」アンチパターンを避けるためである：spec の後置は「成功かどうかの判断」を結果が出てから行うことと同義であり、「指標を良く見せるために spec を調整する」歪みが発生しやすい（`rt-optimization-design.md` §7 D2 路線の轍を参照）。

| フェーズ | 内容 | 工数 | 成果物 | spec 確定アクション |
| -------- | ---------------------------------------------------------------------- | --------------------- | ------------------------------ | --------------------------------------- |
| **P-1** | spec 前置レビュー | 0.5d | §0.1 / §0.3 確定 | **§0.1 エンジニアリング層 spec + §0.3 ストップロスライン確定** |
| **P0** | qwen-logger パイプライン修復（§4.1.1b 前置） | 0.5d | skill_launch イベントの可視性確認 | §0.1 第 1 条の検証 |
| **P1** | Layer 1 telemetry：`prompt_id` フィールド追加 + オフライン SQL | 1-2d | skill ランキングレポート | §0.1 第 2/3/4 条の検証 |
| **P1.5** | 1 週間データ収集 + ベースライン計測（≥3 シナリオ × ≥10 回） | 1w | 改造する 2-3 skill を決定 | **§0.2 閾値確定 + §0.1 第 5 条の検証** |
| **P2** | Layer 2 で top-1 skill 改造（PR + A/B） | 0.5-1d 改造 + 2w 観察 | followup_rate ↓、RT P50 ↓ の検証 | **PR 内で §0.4 per-skill spec を宣言** |
| **P3** | Layer 3 プロンプト並列化ガイダンス + `batch_size` telemetry（§4.3.2 状態伝達含む） | 1-1.5d 変更 + 1w 実測 | batch_size 分布 | §0.2 第 3 条の検証 |
| **P4** | Layer 2 で top-2 / top-3 skill を引き続き改造（P3 と並行） | 0.5-1d × N | 累積 RT P50 ↓ | PR 毎に §0.4 を宣言 |
| **P5** | D1 が依然として価値があるかを評価 | 意思決定会議 | ロードマップ更新 | — |

**重要な意思決定ポイント（§0.3 ストップロスラインとの照合）**：

- **P-1 末**：§0.1 / §0.3 のいずれかでコンセンサスが得られない → P0 に進まない
- **P1.5 末**：§0.3 結果指標 #1 発動（top-5 加重 followup_rate < 30%）→ 方向を終了。そうでなければ §0.2 閾値を確定
- **P2 末**：§0.3 結果指標 #2 発動（top-1 改造後 RT P50 ↓ < 1s）またはプロセス指標のいずれか → 停止して振り返る
- **P3 末**：§0.3 結果指標 #3 発動（batch_size P50 が依然 = 1）→ Layer 3 を諦める
- **P5**：残りの skill の形態に応じて D1 の ROI を判断

---

## 9. 重要なコード位置

| ファイル | 重要なシンボル | 場所 |
| -------------------------------------------------------- | ------------------------------------------------------------- | --------------------------------- |
| `packages/core/src/telemetry/types.ts` | `ToolCallEvent`（`prompt_id` / `duration_ms` 含む） | L170 |
| `packages/core/src/telemetry/types.ts` | `SkillLaunchEvent`（`prompt_id` 追加が必要） | L896 |
| `packages/core/src/telemetry/loggers.ts` | `logToolCall` | L220 |
| `packages/core/src/telemetry/loggers.ts` | `logSkillLaunch`（OTLP を経由。qwen-logger 転送が欠落） | L958 |
| `packages/core/src/telemetry/loggers.ts` | `logToolCall`（デュアルパス：OTLP + qwen-logger、修復サンプルとして） | L220, L230 |
| `packages/core/src/telemetry/qwen-logger/qwen-logger.ts` | `logSkillLaunchEvent`（**現在デッドコード**、§4.1.1b 前置修復対象） | L908 |
| `packages/core/src/core/coreToolScheduler.ts` | `partitionToolCalls` | L775 |
| `packages/core/src/core/coreToolScheduler.ts` | `runConcurrently` / batch スケジューリング | L2456, L2473 |
| `packages/core/src/core/coreToolScheduler.ts` | `logToolCall` 呼び出しポイント（batch_size 状態伝達の終点） | L3163 |
| `packages/core/src/services/fileReadCache.ts` | `FileReadCache`（既存、重複読み込みラウンドに影響） | L135 |
| `packages/core/src/tools/skill.ts` | `SkillTool` + 4 つの `logSkillLaunch` 呼び出しポイント | L386, L399, L426, L482 |
| `packages/core/src/skills/skill-manager.ts` | `SkillManager`（skill の登録/ロード） | ファイル全体 |
| `packages/core/src/skills/skill-load.ts` | skill 説明のロード（出力コントラクト変更の入口） | ファイル全体 |
| `packages/core/src/tools/tools.ts` | `Kind` + `CONCURRENCY_SAFE_KINDS` | L793, L818 |
| `packages/core/src/core/coreToolScheduler.ts` | `partitionToolCalls` + `runConcurrently`（既存の並列実行基盤） | rt-optimization-design.md §5.7 を参照 |
| `packages/core/src/core/prompts.ts` | `# Final Reminder` セクション（Layer 3 の並列実行ガイダンス追加箇所） | L396 |
| `.qwen/skills/` | 各 skill 定義ディレクトリ（Layer 2 改造対象） | ディレクトリ |
