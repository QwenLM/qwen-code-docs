# Agent Loop 減輪方案：Skill 設計から始める

> `rt-optimization-design.md` と同じディレクトリにあり、相互補完関係にあります。その文書は**フレームワーク機構**レベルでの減輪（D1 最後のサマリーラウンドをスキップ、D2 fast ルーティング、D4 prevalidate）について議論しています。この文書は**減輪の真のレバレッジは skill/tool 設計層にある**と主張し、フレームワーク改造や cache hit rate データに依存しない実施可能なパスを提案します。

---

## 0. 受け入れ仕様（開発前のゲート）

> このセクションは開発の**前提ゲート**です。つまり、着手前に確認すべき仕様と、データ駆動で待つべき仕様をリストアップしています。仕様を「あとで指標を見てから決める」のではなく事前に決めることで、(a) 書き終わってから指標が測定不能と判明する、(b) 結果に応じて閾値が変動し結論が歪む、(c) ストップロスラインを設定せず「やっているように見えて実際には効果がない」状態に陥る、を防ぎます。
>
> **本仕様フレームワークの適用範囲**：このフレームワークは、正しい方向性が P1.5 ベースライン測定後に判断できることを前提としています。この前提は「減輪」シナリオでは成立します。なぜなら明確な測定可能シグナル（ラウンド数、followup_rate、batch_size）があるからです。**この前提を超えるシナリオ**（例えば将来同じフレームワークを「品質最適化」など定量化が難しい方向に使う場合）では、仕様を事前に決めることがむしろ迅速な学習を妨げる可能性があります。その場合は §0.5 のガバナンスプロセスに戻って再評価し、このフレームワークを機械的に適用しないでください。

**仕様は 4 層に分かれます。各層のタイミングが異なります。**

| 層     | タイプ                                         | 確定タイミング                           |
| ------ | ---------------------------------------------- | ---------------------------------------- |
| §0.1 | エンジニアリング層仕様（データパイプライン、コード変更の正確性） | **事前**、すぐに確定可能                 |
| §0.2 | 統計層仕様（プロジェクトの「成功」指標）       | **事前**、閾値は P1.5 ベースライン後に確定 |
| §0.3 | ストップロスライン（「発生したら諦める」ハード条件） | **事前**、変更不可                       |
| §0.4 | skill ごとの仕様（具体的に何をどう変えるか、目標値） | **事後**、Layer 1 データ駆動            |

### 0.1 エンジニアリング層仕様（必ず事前、すぐに確定可能）

データパイプラインとコード変更の正確性に関する仕様。ビジネス判断やベースラインデータに依存せず、開発前に確定すべきです。

- **qwen-logger リンクの正常性**（§4.1.1b）：skill_launch イベントが OTLP と qwen-logger の両方のパイプラインに届くこと
- **`prompt_id` による連結**：単一の user prompt によって起動された `skill_launch` と後続の `tool_call` が同じ `prompt_id` で完全なトレイルを grep できること
- **`batch_size` が undefined でないこと**（§4.1.1 の方向 A）：単一ツールバッチは明示的に `batch_size = 1` / `batch_position = 0` を設定すること
- **SQL が実行可能であること**（§4.1.2）：オフライン SQL が本番 telemetry backend で空でない結果を返し、followup_rate が高い skill と低い skill を区別できること
- **ベースラインの分散が P50 の 20% 未満であること**（P1.5）：ベースライン測定が安定していること（そうでなければ後続の A/B 比較が信頼できない）。注：この項目は §0.1 エンジニアリング層に記載されていますが、**確定には P1.5 ベースラインデータが必要**であり、§0.1 の中で唯一の事後検証項目です。P1.5 が不合格の場合、§0.2 の閾値を信頼して確定できません。
- **Skill サイズ予算**（Layer 2 改造）：インライン followup 後、skill 説明のトークン数が改造前の 2 倍を超えず、かつ絶対値で 500 トークン以下（小さい方を採用）であること。超過した場合は skill をマージせず §4.2 に従って分割すること。本項目は §7 の第 2 条、§4.2 の既存制約と整合し、仕様層に事前化します。
- **`npm run preflight` が全て成功すること**：各 PR のハードな必須条件。

### 0.2 統計層仕様（必ず事前、閾値は P1.5 後に確定）

プロジェクトが「統計的に成功」と見なされるための指標。**方向**は事前に決め、**閾値**はベースライン測定後に確定します（適当な数値を事前に埋めることを避けるため）。

| 指標                                             | 方向     | 確定タイミング | 現在の仮の閾値（調整予定） |
| ------------------------------------------------ | -------- | -------------- | ------------------------- |
| トップ 3 skill の重み付き `followup_rate`          | ↓        | P1.5 終了時    | ≥ 30%                     |
| skill を含むセッションのエンドツーエンド RT P50   | ↓        | P1.5 終了時    | ≥ 2s                      |
| `batch_size > 1` の tool_call の割合              | ↑        | P3 前          | ≥ 30%                     |
| 改造した skill のトリガーシナリオでの A/B 有意性 | p < 0.05 | P2 改造完了前  | n 未定                    |

> **重要な制約**：仮の閾値はコミットメントではありません。P1.5 ベースラインで「トップ 5 skill の重み付き followup_rate < 30%」となった場合（§0.3 ストップロス #1 が発動）、プロジェクトは終了します。**閾値を「達成」させるために仕様を引き下げてはいけません。**
>
> **測定方法**：各指標の測定方法、SQL テンプレート、A/B デザインは §5.1-§5.2 を参照。統計的有意性（p < 0.05）のサンプルサイズ計算は §5.1 を参照。

### 0.3 ストップロスライン（必ず事前、P-1 で確定後は限定的に調整可能）

§5.3 で列挙済み。これらは「発生したら諦める」ハード条件です。**§0.2 統計層仕様を達成するために、ストップロスラインを緩めてはいけません。**

- **結果指標**（3 つ）：トップ 5 の重み付き `followup_rate < 30%` / 2 つの skill 改造後 RT P50 減少 < 1s / Layer 3 後も `batch_size P50` が 1 のまま
- **プロセス指標**（3 つ）：skill ヒット率減少 ≥ 5pp / インライン followup 失敗率 ≥ 5% / ユーザーキャンセル率増加 ≥ 2pp

詳細は §5.3 を参照。

**調整可能性ルール**（データなしで規律が過度に硬直的になるのを防ぐ）：

| フェーズ               | 調整可否                                     | 調整方向                                                                                 |
| ---------------------- | -------------------------------------------- | ---------------------------------------------------------------------------------------- |
| P-1 確定時             | ✅ 任意に調整可能（過去 telemetry または合意に基づく） | 任意                                                                               |
| P-1 確定後 → P1.5 終了 | ❌ 調整不可                                  | —                                                                                        |
| P1.5 終了時（ベースライン取得時） | ✅ **一度だけ緩和**可能                     | 緩和（例：30% → 25%）にはデータ証拠と 2 名のレビューが必要。**厳格化は不可**（事後的にストップロスを追加することを防ぐ） |
| P1.5 以降              | ❌ 調整不可                                  | —                                                                                        |

> 仮の閾値（30% / 1s / 5pp など）は現在**過去データによる裏付けがなく**、P-1 レビュー前のエンジニアの直感に基づいています。P-1 レビュー時に過去 4 週間の telemetry が入手可能であれば、それに基づいてストップロスラインを調整すべきです。入手できない場合は仮の値を保持し、P1.5 終了時に上記の「一度だけ緩和」ルールを適用します。

### 0.4 skill ごとの仕様（必ず事後、データ駆動）

どの skill をどのように変更するか、目標 `followup_rate` をいくつにするかは、**Layer 1 データが出るまで確定しません**。

確定しない理由：事前設計と事後データは大きく乖離する可能性があります。無理に事前に決めると、`rt-optimization-design.md` §7 の D2 ルートと同じ轍を踏むことになります。事前の仮定「fast モデルが 2-3 秒速い」が、キャッシュ実装という事後の事実によって覆され、正味効果がほぼゼロまたはマイナスになったのです。

**成果物の場所**：skill ごとの仕様は P1.5 終了時にデータ駆動で生成され、各 Layer 2 PR の description 内で独立して宣言されます（design ドキュメントには入れません。skill が変わるたびにドキュメントを更新するのを避けるため）。

**skill ごとの仕様テンプレート**（§4.2 の PR description 必須項目と整合。これら二つのリストは同一のもので、§4.2 はプロセス視点、本節は仕様視点です。）

| フィールド     | 内容                                                                                                       | データソース                |
| -------------- | ---------------------------------------------------------------------------------------------------------- | --------------------------- |
| 1. 現在のデータ | invocation_count、followup_rate、トップ followup tools                                                     | Layer 1 telemetry           |
| 2. 目標        | followup_rate を X% から Y% に下げる                                                                       | §0.2 の改善方向に基づき、絶対値は PR 内で自己決定 |
| 3. 改造範囲    | どの followup をインライン化するか（read/grep/shell read-only）、**インライン化しない**ものを明記（write操作 / 他 skill / 深い推論） | §4.2 改造パターン表         |
| 4. 出力契約更新 | skill 説明に追加する事前宣言（"Returns: ..."）                                                             | §3.2 改造例                 |
| 5. A/B 計画    | 改造後 2 週間の followup_rate / RT P50 / プロセス指標の観測、§5.1 の合格ラインとの比較                     | §5.1                        |
| 6. サイズ証明  | 改造前後の skill 説明トークン数（tiktoken で見積もり）、§0.1「Skill サイズ予算」を超えないこと              | §0.1 第 6 条                |

### 0.5 仕様ガバナンス

- **§0.1 / §0.3 の仕様変更**には design ドキュメントの更新と PR レビューが必要。§0.3 は §0.3「調整可能性ルール」に従い、P1.5 終了時のウィンドウ内でのみ緩和可能。
- **§0.2 の閾値変更（P1.5 確定後）**には、以下のデータ証拠のうち少なくとも 1 つが必要：
  - (a) P1.5 ベースライン測定結果と確定済み閾値との偏差分析（元の測定記録へのリンクを含む）
  - (b) 類似プロジェクトの公開ベンチマークデータ（ソースリンクを含む）
  - (c) 社内 2 名以上のレビュー署名付きの偏差説明

  PR レビュー時にこれらの証拠が全くない場合、レビュアーは**PR をブロックする義務がある**。エンジニアの直感による調整は受け入れない。

- **§0.4 の skill ごとの仕様**はデータ駆動で生成された後、PR description に書き込む（§0.4 の 6 項目テンプレートに従う）。design ドキュメントには入れない。

---

## 1. 背景と位置付け

### 1.1 問題

`rt-optimization-design.md` §1.2 のベースライン：3 ラウンドの agent loop、13.4s エンドツーエンド、うち LLM 呼び出しが 78% を占める。各ラウンドは約 3-4s。

```
Round 1 (3.8s, 28%): LLM が skill 呼び出しを決定
Round 2 (3.0s, 22%): LLM が shell 呼び出しを決定
Round 3 (3.8s, 28%): LLM がまとめ
```

`rt-optimization-design.md` §6/§7 は 2 ラウンドのレビューを経て、D2/D4 は却下、D1/D3 も「バタフライが終わってから再評価」に格下げされました。しかし、**元のドキュメント全体は最後の Round 3（サマリーラウンド）または単一ラウンド内のマイクロ最適化（D4）に焦点を当てており、Round 1 → Round 2 という「中間ラウンド」がなぜ存在するのか、それを消せるのかについて正面から議論していません。**

実際には、Round 2 が存在する理由は、**圧倒的に、Round 1 で呼び出された skill が完全な答えを返さなかったため**、モデルが追加で shell クエリで補完しているからです。skill が「一度で完全な結果を取得する」ように設計されていれば、3 ラウンド → 2 ラウンドになり、Round 2 の約 3s を節約できます。これは D1 とまったく重ならない利益範囲です。

### 1.2 rt-optimization-design との関係

| 減輪の方向                    | ヒットするラウンド                | レバレッジの場所                 | 本ドキュメントの位置付け                           |
| ----------------------------- | -------------------------------- | ------------------------------- | ------------------------------------------------ |
| D1 `skipLlmRound`             | 最後のサマリーラウンド             | フレームワーク機構 + per-tool opt-in | セーフティネット。**Layer 2 の後に実施**        |
| D2 fast ルーティング           | 単一ラウンドの遅延               | フレームワーク機構               | 延期済み。**本ドキュメントの範囲外**              |
| D3 Summarizing 状態           | 最後のサマリーラウンド（認識層）  | UI ステートマシン               | オプション。本方式とは直交                       |
| D4 prevalidate                | 単一ラウンドの遅延               | フレームワーク機構               | 延期済み。**本ドキュメントの範囲外**              |
| **本方式 Layer 1-3**           | **中間決定ラウンド + 並行化されていないラウンド** | **skill 設計 + プロンプトエンジニアリング** | **新規方向**            |

### 1.3 核となる主張

減輪の真のレバレッジは skill/tool 設計層にあり、agent フレームワークにはありません。3 つの理由：

1. **§1.2 のベースラインはそもそも問題が skill にあることを露呈している** — Round 1 → Round 2 のジャンプは、skill の戻り値が不完全だったために発生します。フレームワークは正しく動作していて、skill が間違っているのです。
2. **フレームワークレベルの減輪も結局 per-tool opt-in が必要** — D1 の `skipLlmRound` はすべてのツールを明示的にマークする必要があり、skill エンジニアリングに戻ってきて、さらに不変条件の修復と決定ゲーティングのコストが追加でかかります。
3. **ROI が局所的に測定可能で、段階的リリースが容易** — 1 つの skill を変更すれば、その skill がトリガーされる回数だけ 1 ラウンド減ります。cache hit rate データに依存せず、システム間の変更に依存しません。

> **実施前に §0 の受け入れ仕様事前レビュー（P-1 フェーズ、0.5d）を必ず実施してください**。§0.1 エンジニアリング層仕様と §0.3 ストップロスラインは着手前に確定する必要があります。§0.2 統計層の閾値の方向も事前に確定し（具体的な数値は P1.5 ベースライン後）、数値は後で確定します。§0 をスキップして P0 の実装に入ることは、「やった後に指標を見る」というアンチパターンをデフォルトで選択することになり、本ドキュメントはそのような方法を推奨しません。

---

## 2. 設計原則

1. **agent フレームワークは変更しない** — `useGeminiStream` / `coreToolScheduler` / `geminiChat` のコアパスには手を触れません。
2. **データ駆動で優先順位を決める** — まず telemetry を構築し、データがどの skill を変更すべきかを教えてくれるようにします。勘に頼りません。
3. **skill ごとに測定可能で段階的リリース可能** — 各 skill の改造は独立した A/B テストが可能で、失敗した場合は局所的にロールバックします。
4. **複利効果を優先** — 利益 = 1 回の減輪利益 × トリガー頻度。高頻度 skill を優先します。
5. **D1 に依存しない** — 本方式の成功は D1 の導入に依存しません。

---

## 3. 3 層のアプローチ

### 3.1 Layer 1：減輪 Telemetry（金鉱を探す）

**目標**：データに基づいてどの skill が最も変更に値するかを明らかにする。つまり「この skill を使った後、モデルが追加のツール呼び出しを行う確率」を把握します。

**コアフィールド**（turn ごと、skill 呼び出しごと）：

```typescript
interface SkillFollowupRecord {
  skill_name: string;
  prompt_id: string; // 同じ user prompt 内の全イベントを関連付ける
  turn_index: number; // loop の中でその skill が何番目のラウンドか
  followup_tool_names: string[]; // 同じ prompt_id で、skill の後に呼ばれたツールのリスト
  followup_count: number; // followup_tool_names.length
  followup_kinds: Kind[]; // Read/Edit/Execute/...
  next_turn_is_terminal: boolean; // skill の次のラウンドでテキスト出力（ツール呼び出しなし）になったか
  user_followup_within_30s: boolean; // 結果表示後 30 秒以内にユーザーが新しいプロンプトを送信したか（品質悪化シグナル）
}
```

**主要指標**：

- `skill_followup_rate = sum(followup_count > 0) / total_invocations`
- `terminal_after_skill_rate = sum(next_turn_is_terminal) / total_invocations`
- `(skill_name, top followup tool)` で集計 — 各 skill の後にどのツールが最も頻繁に呼ばれるかを確認。

**金鉱判定**：

```
(invocation_count_weekly × skill_followup_rate) ≥ threshold
↓
その skill は減輪の金鉱。Layer 2 改造の優先対象。
```

閾値の提案：上記の式でソートしたトップ 3 のうち、最初の 2 つを変更します。

### 3.2 Layer 2：Skill 出力の完全化

**目標**：金鉱と判定された skill が一度で完全な答えを返すようにし、Round 1 → Round 2 のジャンプを排除します。

**改造パターン（followup タイプ別）**：

| Followup パターン               | 典型的なシナリオ           | 改造方向                                              |
| ------------------------------- | ------------------------- | ----------------------------------------------------- |
| skill → `read_file`             | skill がパスを返し、モデルが読む | skill 内部で直接読み込み、内容を返す                 |
| skill → `grep/glob`             | skill がディレクトリを返し、モデルが検索 | skill 内部で検索し、マッチを返す                     |
| skill → `shell` (read-only)     | skill がコマンドを返し、モデルが実行 | skill 内部でコマンドを実行し、出力を返す              |
| skill → `shell` (write)         | skill が計画を返し、モデルが書き込み実行 | **そのまま**（書き込み操作は確認が必要であり、マージすべきでない） |
| skill → another skill           | チェーン呼び出し           | **マージしない**（コンポーザビリティを維持する）      |

**改造チェックリスト（skill ごと PR テンプレート）**：

1. skill 説明で**出力契約を事前宣言**："Returns: full file content / matched lines / command output" のように明記し、モデルが追加クエリを必要としないことを伝える。
2. skill 内部で**すべての read-only フォローアップを完了する**：telemetry が 50% 以上の追加速度を示す read/search 操作を skill にインライン化する。
3. **write 操作はインライン化しない**：書き込み操作はユーザー確認が必要であり、独立したラウンドでなければならない。
4. **深い推論を伴うフォローアップはインライン化しない**：フォローアップが「これに基づいてさらに分析する」というものであれば、それはモデルの仕事であり、skill の仕事ではない。
5. **A/B telemetry を添付する**：改造後 2 週間の `followup_rate` が < 20% に低下したかを比較する。

**典型的な改造例**：

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

### 3.3 Layer 3：プロンプトでモデルに並行実行を教育

**目標**：独立したツール（複数ファイル読み取り、複数ディレクトリ検索）に対して、モデルが同一ラウンド内で並行に tool_calls を発行し、N ラウンドを 1 ラウンドに圧縮するようにする。

**前提**：インフラはすでに整っています。`tools/tools.ts:818` の `CONCURRENCY_SAFE_KINDS` と `coreToolScheduler` の `partitionToolCalls` は、同じバッチ内の read/search/fetch ツールを並行実行できます。**不足しているのはモデルが自発的に並行 tool_calls を開始する意思だけ**で、qwen-coder はデフォルトで直列実行傾向があります。

**変更箇所**：`packages/core/src/core/prompts.ts`（すでに監査済み。`# Final Reminder` セクション L396 付近に追加しても、cache ヒット以外には影響しません。一度だけのウォームアップコストだけです。）

**指示テキスト（例、A/B テストで調整）**：

```
複数の独立した読み取り専用ツール（read_file, grep, glob, web_fetch）を
呼び出す必要がある場合、それらを SINGLE tool_calls batch として出力してください。
ラウンドをまたいで逐次的に呼び出さないでください。これらは並行実行されます。

例：
- 比較のために 3 つのファイルを読む：1 つのバッチで 3 つの read_file 呼び出しを出力
- 2 つのパターンを検索：1 つのバッチで 2 つの grep 呼び出しを出力

2 つ目の呼び出しが 1 つ目の結果に依存する場合はバッチ化しないでください。
```

**効果測定**：新しい telemetry フィールド `batch_size`（同ターン内の tool_calls 数）を追加。プロンプト変更前後で分布を比較します。

#### 3.3.1 `CONCURRENCY_SAFE_KINDS` の拡張（Layer 3 のサブ項目）

プロンプトでモデルに並行実行を教育するのは供給側の対策（モデルが一度に複数の tool_calls を発行するようにする）ですが、`tools/tools.ts:818` の `CONCURRENCY_SAFE_KINDS = { Read, Search, Fetch }` が**実際に並行実行できるツールの範囲**を決定します。`partitionToolCalls`（`coreToolScheduler.ts:775`）は「連続する安全なツール」を並行バッチにまとめ、それ以外は各々逐次実行します。

モデルが指示に従って 3 つの tool_calls を一度に発行したとしても、そのうち 1 つが `Kind.Execute` で安全セットに含まれていなければ、バッチ全体が分解されて逐次実行されます。Layer 3 のプロンプト変更の効果がランタイムのスケジューリングによって相殺されます。

**拡張候補（リスクの低い順）**：

- `Kind.Think`（save_memory / todo_write を含む）—— **追加しない**。暗黙的な書き込みがあるため。
- 読み取り専用 shell（`isShellCommandReadOnly()` が true を返す Execute）—— `partitionToolCalls` にすでに特別な処理がある（`coreToolScheduler.ts` の `partitionToolCalls` コメントに「Execute (shell) は isShellCommandReadOnly() が true を返す場合のみ安全」と記載）。現在の実装でカバー済み。`CONCURRENCY_SAFE_KINDS` の変更は不要。
- MCP ツールを `Kind` で分類 —— MCP サーバーごとに動作が大きく異なるため、ツール登録時に明示的な opt-in が必要。

**結論**：現在のセットはすでに妥当であり、**Layer 3 は `CONCURRENCY_SAFE_KINDS` の拡張に依存しません**。本セクションの存在意義は、`batch_size` telemetry データを収集した後、**「並行バッチ P50 が期待値より低い」場合、モデルが並行実行しないのではなく、`partitionToolCalls` によって分解されている可能性を先にチェックするための診断パス**としてです。Layer 3 A/B が失敗したときの診断パスであり、必ず実施するものではありません。

> クレジット：codex レビューで「`CONCURRENCY_SAFE_KINDS` の拡張は見過ごされたレバレッジである」という指摘がありました。確認した結果、現状では `isShellCommandReadOnly` の特別処理が最大の部分をカバーしており、拡張自体の利益は小さくリスクは大きいと判断しました。診断パスとして残します。

---

## 4. 詳細実装

### 4.1 Layer 1：Telemetry 拡張（1-2d）

#### 4.1.1 `prompt_id` を `SkillLaunchEvent` に追加

**場所**：`packages/core/src/telemetry/types.ts:896`

現在の `SkillLaunchEvent` は `skill_name` + `success` のみ含み、**`prompt_id` がありません**。同じターン内の他の `ToolCallEvent` と関連付けることができません。

```typescript
// types.ts:896
export class SkillLaunchEvent implements BaseTelemetryEvent {
  'event.name': 'skill_launch';
  'event.timestamp': string;
  skill_name: string;
  success: boolean;
  prompt_id: string;                    // 追加
  turn_index?: number;                  // 追加

  constructor(
    skill_name: string,
    success: boolean,
    prompt_id: string,                  // 追加
    turn_index?: number,                // 追加
  ) { ... }
}
```

**呼び出し元の更新**：`packages/core/src/tools/skill.ts` の 4 つの `logSkillLaunch` 呼び出し箇所（L386, L399, L426, L482）。`this.params` から `prompt_id` を取得できません。`BaseToolInvocation` は `params` のみを保持し、`request.prompt_id` フィールドを持ちません。**実際の実装**ではダックタイピングで注入します。`SkillToolInvocation` に `setPromptId(id)` セッターとプライベート `promptId` フィールドを公開し、`CoreToolScheduler.buildInvocation`（`coreToolScheduler.ts:1253`）で build 後にダックタイプで `setPromptId(request.prompt_id)` を呼び出します。既存の `setCallId` フックのパターンに合わせます。invocation の `execute()` 内の 4 つの `logSkillLaunch` はすべて `this.promptId` を渡します。**このセクションの初期バージョンの説明（「BaseToolInvocation はすでに request.prompt_id を持つ」）は誤りであり、PR #4565 のレビュー後に修正されました。**

#### 4.1.1b qwen-logger リンクの修正（事前）

`prompt_id` を追加する前に、既存の**リンク断絶**に対処する必要があります。`packages/core/src/telemetry/qwen-logger/qwen-logger.ts:908` で `logSkillLaunchEvent(event)` メソッドが定義されていますが、**リポジトリ全体でこのメソッドを呼び出すコードがどこにもありません**。`loggers.ts:958` の `logSkillLaunch` は直接 `logs.getLogger(SERVICE_NAME).emit()` という OTLP パスを使用しており、qwen-logger をバイパスしています。

結果：

- OTLP パス上の skill_launch イベントは OTLP collector に到達します（既に動作中）。しかし、qwen-logger の専用報告リンクは現在デッドです。
- telemetry backend が qwen-logger から消費している場合（OTLP ではなく）、skill_launch イベントは**全く報告されません**。
- §4.1.2 のオフライン SQL で `SkillFollowupRecord` を導出するには、skill_launch イベントのデータベースへの格納が必要です。**まず現在 skill_launch が backend で見えるかどうかを確認する必要があります。**

修復方向は 2 つ：

- **A**（推奨）：`loggers.ts:958` の `logSkillLaunch` 内に `QwenLogger.getInstance(config)?.logSkillLaunchEvent(event)` の 1 行を追加します。`logToolCall` の `loggers.ts:230` の書き方に合わせます。
- **B**：backend が OTLP からのみ消費していることを確認し、qwen-logger 内の `logSkillLaunchEvent` を `@deprecated` とマークするか削除します。

**なぜ QwenLogger の 1 パスのみ追加し、`logToolCall` のような 4 パス全てにはしないのか**：

`logToolCall`（`loggers.ts:220-247`）は実際には 4 つの出力先を持っています。

1. `uiTelemetryService.addEvent(...)` — UI 表示
2. `config.getChatRecordingService()?.recordUiTelemetryEvent(...)` — チャット履歴
3. `QwenLogger.getInstance(config)?.logToolCallEvent(...)` — qwen-logger バックエンドテレメトリ
4. OTLP `logger.emit(...)` — OpenTelemetry

skill_launch は**純粋なバックエンドテレメトリイベント**であり、UI に表示する必要はなく（ユーザーはすでに SkillTool の returnDisplay で確認済み）、ChatRecording のターン履歴に入れる必要もありません（skill 内部のツール呼び出しは各々がすでに recordUiTelemetryEvent で記録されています）。したがって、3 番目（QwenLogger）のみを追加し、4 番目（OTLP）は維持し、1/2 は意図的にスキップします。これは見落としではありません。

**フィールド透過の詳細**：`loggers.ts:961-966` は `{ ...event }` スプレッドを使用して新しいフィールドを自動的に透過します。`prompt_id` を `SkillLaunchEvent` に追加すると、このパスで自動的に有効になります。ただし、`qwen-logger.ts:908` の `logSkillLaunchEvent` 内部で明示的に `event.skill_name` / `event.success` をデストラクチャリングしている場合、新しいフィールドは自動的に含まれないため、手動で同期する必要があります。

作業量：A パスは約 0.5d（バックエンド側の確認を含む）。B パスは約 0.2d（コード削除＋ドキュメント説明）。

#### 4.1.2 `SkillFollowupRecord` の導出（オフライン集計）

新しいイベントタイプは不要です。`ToolCallEvent` と `SkillLaunchEvent` は両方とも `prompt_id` を持っており、オフライン SQL で導出できます。

```sql
-- 疑似 SQL、実際の telemetry backend に合わせて調整
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

#### 4.1.3 telemetry を 1 週間実行してデータ収集

- ユーザー向け動作は変更しません。
- 設定スイッチは不要 — telemetry には既存の opt-in フレームワークがあります（`telemetry.target` 設定）。
- 1 週間後に skill ランキングレポートを生成します。

### 4.2 Layer 2：Skill 改造（skill ごとに 0.5-1d）

Layer 1 のデータに基づいて、上位から順に改造します。各 skill は独立した PR とし、PR description には以下を必ず含めます：

1. **データ**：現在の invocation_count、followup_rate、トップ followup tools
2. **改造範囲**：どの followup をインライン化したか（インライン化しないものを明確に）
3. **出力契約の更新**：skill 説明に追加した事前宣言
4. **A/B 計画**：改造後 2 週間、再び followup_rate を観測

**注意事項**：

- Skill 内で read 操作をインライン化する場合、read_file のすべてのエッジケース（エンコーディング、バイナリ検出など）を再実装しないでください。`read_file` ツール自体を呼び出し、再実装しないでください。
- Skill 内での grep/glob も同様です。
- Skill 内での shell コマンドは `executeToolCall` 標準パスを使用します（telemetry を保持するため）。
- **skill のサイズを爆発させない**：followup をインライン化した結果、skill 説明が 500 トークンを超える場合、skill を分割し、マージしないでください。

### 4.3 Layer 3：プロンプト教育（0.5d の変更 ＋ 実測による調整）

#### 4.3.1 並行実行ガイダンスの追加

**場所**：`packages/core/src/core/prompts.ts` の `# Final Reminder` セクション（L396）

セクション 3.3 の指示テキストを追加します。具体的な文言は A/B テストで調整します。まずは最もシンプルなバージョンを使用し、並行率の向上度合いに応じて詳細化します。

#### 4.3.2 `batch_size` telemetry の追加

**場所**：`packages/core/src/telemetry/types.ts` の `ToolCallEvent` または新しい軽量 `ToolBatchEvent`

```typescript
// オプション A：ToolCallEvent にフィールドを追加（影響が少ない）
export class ToolCallEvent {
  ...
  batch_size?: number;        // 同じバッチ内の tool_call 数
  batch_position?: number;    // バッチ内での位置 (0-indexed)
}

// オプション B：新しい ToolBatchEvent を追加（セマンティクスはより明確だが、新しいイベントタイプの全手順が必要）
```

**推奨はオプション A** — 変更が小さく、クエリ時に集計しやすい。

**状態の受け渡しパス（重要 — このステップのコストは初期バージョンで過小評価されていました）**：

`coreToolScheduler.ts:2456` の `partitionToolCalls(callsToExecute)` は `batches` を返しますが、**バッチ情報はスケジューリングパス上で即座に失われます**：

```
executeToolCalls
  └─ batches = partitionToolCalls(...)           // batch.calls.length を知っている
     └─ for batch of batches:
        └─ this.runConcurrently(batch.calls, ...) // batch.calls.length を知っている
           └─ executeSingleToolCall(call, ...)   // ❌ バッチ情報を知らない
              └─ ...
                 └─ finalizeToolCalls
                    └─ logToolCall(config, new ToolCallEvent(call)) // ❌ batch context なし
```

`ToolCallEvent` のコンストラクタ（`types.ts:189`）は単一の `CompletedToolCall` のみを受け取り、バッチフィールドはありません。

修正方向：

- **方向 A**（推奨）：`ScheduledToolCall` に `batchSize?: number` + `batchPosition?: number` を追加。2 つの分岐でそれぞれ値を設定します。
  - 並行分岐（`coreToolScheduler.ts:2459-2460`、`batch.calls.length > 1`）：`runConcurrently(batch.calls, ...)` がループに入る前に、各 `call` に `batchSize = batch.calls.length`、`batchPosition = i` を設定。
  - 直列分岐（`L2462-2464` の `for (const call of batch.calls)`）：単一ツールバッチは明示的に `batchSize = 1`、`batchPosition = 0` を設定（**デフォルトで undefined にしない**。そうしないと、下流の telemetry 集計で並行実行が有効でないラウンドをデータ欠損と誤判定する可能性があります）。

  `new ToolCallEvent(call)` のコンストラクタで `call` からこれらのフィールドを読み取ります。

- **方向 B**：`ToolCallEvent` コンストラクタのシグネチャを `new ToolCallEvent(call, batchInfo?)` に変更し、すべての呼び出し元（4 つの logToolCall 呼び出し箇所 + テスト）を同時に修正。方向 A より影響範囲が大きい。

作業量：方向 A はユニットテスト含めて約 0.5d。方向 B は約 1d（呼び出し元が多いため）。

**「モデルの並行実行意欲」を同時に測定** — Layer 3 で prompts.ts を変更する前後で、`batch_size > 1 の tool_call の割合` の分布を比較します。これは Layer 3 が効果を発揮したかどうかの重要な指標であり、このデータがなければ Layer 3 の A/B テストを完了できません。

#### 4.3.3 cache への影響評価

`prompts.ts` の変更により、DashScope ephemeral cache が一度だけ無効になります（最初のリクエストで cache miss、その後復旧）。これは既知の一度だけのコストです。`rt-optimization-design.md` §7.8 のプロンプト定常状態監査を参照してください。

---

## 5. 受け入れと測定

> **このセクションは §0 受け入れ仕様の「方法論」を補完するものです。** §0 では「成功の指標＋閾値の事前／事後タイミング」を宣言し、§5 では「どのように測定するか、SQL はどう書くか、A/B はどう設計するか」を説明します。このセクションの閾値は §0.2 の現在の仮の値であり、最終的な値は P1.5 ベースライン測定後に確定します。

### 5.1 skill ごとの A/B 指標（改造後 2 週間）

| 指標                                              | 合格ライン                          | 備考                                      |
| ------------------------------------------------- | ---------------------------------- | ----------------------------------------- |
| その skill の `followup_rate`                       | < 20%（改造前が 70%+ の場合）         | 主指標                                      |
| その skill がトリガーするシナリオのエンドツーエンド RT P50 | 減少 ≥ 2s                        | 1 ラウンド少ない LLM 呼び出しに由来        |
| その skill の `user_followup_within_30s` 率         | 上昇しない                         | ユーザーが追及しない＝答えが完全であること |
| その skill の `success` 率                          | 低下しない                         | インライン followup が新しい失敗を導入しない |
### 5.2 全体 RT 指標

| 指標                               | ベースライン                          | Layer 2 改修後 top-3 skill 目標 |
| ---------------------------------- | ------------------------------------- | -------------------------------- |
| エンドツーエンド RT P50（skill を含むセッション） | 13.4s（単回サンプル）/ 後日補完 ≥3 クラスシナリオベースライン | 2〜3s 削減                      |
| Tool batch P50 size（Layer 3）     | 未測定                                | ≥ 1.3（>30% の呼び出しが並行 batch に関与） |
| Skill 全体 followup_rate（加重平均） | 未測定                                | 30% 以上削減                     |

### 5.3 失敗シグナル — いつこの方向を諦めるか

**結果指標のストップロスライン**：

- Layer 1 データ取得後、**top-5 skill の加重 followup_rate < 30%** → ラウンド削減余地が小さく、Layer 2 に進む価値なし
- Layer 2 で 2 つの skill を改修後、**エンドツーエンド RT P50 削減幅 < 1s** → 改修方向が誤り（followup が書き込み操作であり、統合すべきでない可能性）、中断して再検討
- Layer 3 prompt 変更から 2 週間経過後も **batch_size P50 が = 1** → モデルが並行指示を受け入れず、Layer 3 を放棄し Layer 1+2 のみ維持

**プロセス指標のストップロスライン（事前警告：対策が「一見進んでいるが効果がない」状況を防ぐ）**：

- **Skill ヒット率（intended skill vs selected skill）が 5pp 以上低下** → skill 説明の変更が原因でモデルが間違った skill を選択。典型的なシナリオ：改修前はユーザーが X を質問すると常に skill_a がヒットしていたが、改修後は時々 skill_b にルーティングされてエラーは発生しない（モデルが間違った skill を使ってもなんとか回答を生成）。結果指標は一見正常だが、followup_rate がむしろ上昇。**測定方法**：telemetry に `skill_invocation_pattern` を追加 — ユーザー prompt の先頭 N キーワードでクラスタリングし、各クラスタがどの skill を主にトリガーしているかを把握；改修前後で top-1 の偏移を比較
- **Skill インライン followup 失敗率 ≥ 5%** → skill 改修により、元々存在しなかった失敗パターンが導入された（例：インライン `read_file` で大ファイルを処理してメモリオーバーフロー）。測定：`SkillLaunchEvent.success` を改修前後で比較
- **Per-skill ユーザーキャンセル率（Ctrl+C）が 2pp 以上上昇** → skill 出力が遅くなったり長くなったりしてユーザーが忍耐を失った。測定：`ToolCallEvent.status === 'cancelled'` の比率

---

## 6. D1/D3 との連携

### 6.1 D1 との関係

Layer 2 で top skill を改修した後、**残りの followup が多い skill こそが D1 `skipLlmRound` の真の適用シナリオ** — それらの skill 出力は既に完全（Round 2 が不要）であり、かつ本当に最終状態のクエリである（Round 3 での要約も無駄）。

実行順序：

1. Layer 1 telemetry 導入 → 1 週間データ
2. Layer 2 で top 2-3 skill を改修 → A/B 2 週間
3. Layer 3 prompt 並行化 → 実測 1 週間
4. **この時点で** D1 を再評価：残っている高頻度 skill のうち、「出力完全 + 最終状態クエリ」の形態がどれだけあるか → 2〜3日間のフレームワーク改修に価値があるか判断

### 6.2 D3 との関係

D3（`StreamingState.Summarizing`）は知覚層の最適化であり、本提案とは完全に直交する。Layer 1〜3 は実際のラウンド数を削減し、D3 はユーザーが知覚する待ち時間を削減する。Layer 2 によって RT がユーザーが許容できる範囲にまで低下すれば、D3 の価値は下がる。逆に、低下しなければ D3 を重ねることができる。

---

## 7. 制約と既知のリスク

1. **カバレッジは改修範囲に制限される** — 10 個の skill を改修しても、その 10 個のシナリオにしか影響しない。ただし、効果は確定して測定可能で複利的である
2. **Skill インライン followup により単一 skill が重くなる可能性** — 説明の肥大化、読み込みの遅延、再利用性の低下。Layer 2 のチェックリスト第 5 項で防御
3. **Layer 3 でモデルが並行指示に従わない可能性** — qwen-coder の学習データは逐次処理志向；A/B データで prompt 変更が無効であることが判明する可能性があり、既知の失敗パターンとして扱う
4. **Telemetry のプライバシー境界** — `SkillFollowupRecord` にツールパラメータを記録してはならない（デフォルトで `ToolCallEvent.function_args` から取得するが、`skill_name` がユーザーの意図を漏洩しないか監査する必要あり）
5. **サブエージェント / cron / notification には非適用** — これらのパスは skill システムを経由しないため、本提案の対象外
6. **ベースラインデータが薄い** — `rt-optimization-design.md` §1.2 の単回サンプルを継承；Layer 2 実装前に ≥3 クラス × ≥10 回のベースラインを補完する必要あり
7. **`logSkillLaunch` のフィールド拡張は既存の telemetry consumer を破壊する** — 4 箇所の呼び出しポイントと下流の logger を同時に変更する必要あり
8. **`qwen-logger.ts:908` の `logSkillLaunchEvent` は現在デッドコード** — リポジトリ内に呼び出し元が存在しない；§4.1.1b に事前修正を記載済み

### 7.1 既存フレームワーク機構との境界（本提案の範囲外）

リポジトリにはラウンド削減に間接的に関連する既存のフレームワーク機構がいくつか存在する。**本提案で再発明せず、代替もしない**：

| 既存機構                                            | 位置                                | 本提案との関係                                                                                                               |
| --------------------------------------------------- | ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `partitionToolCalls` + `runConcurrently`（並行実行） | `coreToolScheduler.ts:775, 2473`    | Layer 3 で直接再利用；本提案では変更しない                                                                                   |
| `CONCURRENCY_SAFE_KINDS`（どのツールが並行可能かを決定） | `tools/tools.ts:818`                | §3.3.1 で現状が妥当と論証済み、拡張しない                                                                                    |
| `FileReadCache`（同一ファイルの重複読み取りを回避） | `services/fileReadCache.ts`         | 「モデルが同じファイルを繰り返し読み取るラウンド」に間接的に影響；既に有効。本提案では依存せず強化もしない                    |
| `chatCompressionService`（履歴圧縮）                | `services/chatCompressionService.ts`| ラウンド数とは直交（単一ラウンドのコストに影響し、ラウンド数には影響しない）；`rt-optimization-design.md` §3.2 fast ルートの `wouldTriggerCompression` gate と同じコンポーネント |

これらを列挙することで、「本提案が既存機構を無視している」と誤解されるのを防ぐ。

---

## 8. 実装タイムライン

> **前提：本タイムラインは P-1 から開始し、スキップ不可**。P-1 は §0 の acceptance spec の事前レビューであり、0.5日分の工数だが**必須** — 通過しなければ P0 に進まない。この制約は「コードを先に書いて後から spec を補う」というアンチパターンを防ぐため：spec 後置は「成功」の判断を結果が出た後に先送りすることになり、「指標を良く見せるために spec を調整する」というバイアスを生みやすい（`rt-optimization-design.md` §7 D2 ルートの轍を参照）。

| Phase    | 内容                                                                    | 投入                    | 成果                               | spec 確定アクション                    |
| -------- | ----------------------------------------------------------------------- | ----------------------- | ---------------------------------- | -------------------------------------- |
| **P-1**  | spec 事前レビュー                                                       | 0.5d                    | §0.1 / §0.3 を確定                 | **§0.1 工学的 spec + §0.3 ストップロスラインを確定** |
| **P0**   | qwen-logger リンク修復（§4.1.1b 事前対応）                             | 0.5d                    | skill_launch イベントの可視性確認   | §0.1 第 1 条を検証                      |
| **P1**   | Layer 1 telemetry：`prompt_id` フィールド補完 + オフライン SQL          | 1-2d                    | skill ranking レポート             | §0.1 第 2/3/4 条を検証                |
| **P1.5** | 1 週間データ収集 + ベースライン測定（≥3 クラス × ≥10 回）              | 1w                      | どの 2〜3 skill を改修するか決定    | **§0.2 閾値を確定 + §0.1 第5条を検証**     |
| **P2**   | Layer 2 で top-1 skill 改修（PR + A/B）                                | 0.5〜1d 改修 + 2w 観察  | followup_rate ↓、RT P50 ↓ を検証  | **PR 内で §0.4 per-skill spec を宣言**     |
| **P3**   | Layer 3 prompt 並行指示 + `batch_size` telemetry（§4.3.2 状態伝達を含む） | 1〜1.5d 変更 + 1w 実測 | batch_size 分布                   | §0.2 第 3 条を検証                      |
| **P4**   | Layer 2 で top-2 / top-3 skill を継続改修（P3 と並行）                 | 0.5〜1d × N            | 累積 RT P50 ↓                      | 各 PR 内で §0.4 を宣言                  |
| **P5**   | D1 にまだ価値があるか評価                                               | 意思決定会議            | ロードマップ更新                   | —                                      |

**主要な意思決定ポイント（§0.3 ストップロスラインと対照）**：

- **P-1 終了時**：§0.1 / §0.3 のいずれかで合意に達しない → P0 に進まない
- **P1.5 終了時**：§0.3 結果指標 #1（top-5 加重 followup_rate < 30%）をトリガー → 方向性を中止；それ以外は §0.2 閾値を確定
- **P2 終了時**：§0.3 結果指標 #2（top-1 改修後 RT P50 削減幅 < 1s）またはいずれかのプロセス指標をトリガー → 中断して再検討
- **P3 終了時**：§0.3 結果指標 #3（batch_size P50 が = 1）をトリガー → Layer 3 を放棄
- **P5**：残りの skill の形態に基づいて D1 の ROI を判断

---

## 9. 主要コード位置

| ファイル                                                  | 主要シンボル                                                   | 位置                              |
| --------------------------------------------------------- | -------------------------------------------------------------- | --------------------------------- |
| `packages/core/src/telemetry/types.ts`                    | `ToolCallEvent`（`prompt_id` / `duration_ms` を含む）          | L170                              |
| `packages/core/src/telemetry/types.ts`                    | `SkillLaunchEvent`（`prompt_id` を追加する必要あり）           | L896                              |
| `packages/core/src/telemetry/loggers.ts`                  | `logToolCall`                                                  | L220                              |
| `packages/core/src/telemetry/loggers.ts`                  | `logSkillLaunch`（OTLP 経由；qwen-logger への転送が欠落）       | L958                              |
| `packages/core/src/telemetry/loggers.ts`                  | `logToolCall`（二重パス：OTLP + qwen-logger、修復のサンプルとして） | L220, L230                        |
| `packages/core/src/telemetry/qwen-logger/qwen-logger.ts`  | `logSkillLaunchEvent`（**現在デッドコード**、§4.1.1b 事前修復対象） | L908                              |
| `packages/core/src/core/coreToolScheduler.ts`             | `partitionToolCalls`                                           | L775                              |
| `packages/core/src/core/coreToolScheduler.ts`             | `runConcurrently` / batch スケジューリング                      | L2456, L2473                      |
| `packages/core/src/core/coreToolScheduler.ts`             | `logToolCall` 呼び出しポイント（batch_size 状態伝達の終端）      | L3163                             |
| `packages/core/src/services/fileReadCache.ts`             | `FileReadCache`（既存、重複読み取りラウンドに影響）             | L135                              |
| `packages/core/src/tools/skill.ts`                        | `SkillTool` + 4 つの `logSkillLaunch` 呼び出しポイント        | L386, L399, L426, L482            |
| `packages/core/src/skills/skill-manager.ts`               | `SkillManager`（skill 登録/読み込み）                          | ファイル全体                      |
| `packages/core/src/skills/skill-load.ts`                  | skill 説明読み込み（出力契約変更のエントリポイント）           | ファイル全体                      |
| `packages/core/src/tools/tools.ts`                        | `Kind` + `CONCURRENCY_SAFE_KINDS`                              | L793, L818                        |
| `packages/core/src/core/coreToolScheduler.ts`             | `partitionToolCalls` + `runConcurrently`（既存の並行基盤）     | 参照 rt-optimization-design.md §5.7 |
| `packages/core/src/core/prompts.ts`                       | `# Final Reminder` セクション（Layer 3 で並行指示を追加する場所） | L396                              |
| `.qwen/skills/`                                           | 各 skill 定義ディレクトリ（Layer 2 改修対象）                  | ディレクトリ                      |