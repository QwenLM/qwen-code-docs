# Auto-Compaction Threshold Redesign

**Status:** Draft · 2026-05-14

## 背景

> 本節では、この PR がマージされる**前**の状態（pre-redesign behavior）を説明します。以下に登場する `COMPRESSION_TOKEN_THRESHOLD`、`thinkingConfig.includeThoughts = true`、`hasFailedCompressionAttempt`、および具体的な file:line 参照は、PR #4345 マージ前のコードに対応しています。マージ後はこれらのシンボルや行番号は無効になります。

現在の qwen-code の自動圧縮は、単一の比率閾値 `COMPRESSION_TOKEN_THRESHOLD = 0.7`（`chatCompressionService.ts:33`）のみを使用しており、すべてのウィンドウサイズで同じ比率を共有しています。claude-code の「絶対 token ラダー」（autoCompact.ts:62-65）と比較すると、qwen-code には以下の具体的な問題が 3 つあります。

1. **大ウィンドウで余白を取りすぎる**：1M モデルで 70% 閾値は 700K で発火し、残り 300K はサマリー + 出力の実際の必要量 ~33K をはるかに超える
2. **失敗 1 回で永続ロック**：`hasFailedCompressionAttempt = true` 以降、セッション全体で auto-compact が試行されなくなる（geminiChat.ts:504）。claude-code の「連続 3 回でサーキットブレーク」より厳しい
3. **tip システムと auto 閾値が分離している**：`tipRegistry.ts` 内の 3 件の `context-*` tip は固定の 50/80/95 パーセンテージを使用しており、auto-compact 閾値（70%）とは完全に独立している。これにより、「auto が正常に動作する」メインパスでは 80% / 95% の tip がほとんど発火せず、「auto が失敗 / リアクティブなフォールバック」のエッジパスでは閾値に揃った意味がない
4. **圧縮呼び出し自体に出力バジェット制御がない**：[chatCompressionService.ts:374-376](packages/core/src/services/chatCompressionService.ts:374) では `thinkingConfig.includeThoughts = true` を明示的に有効化しており（コメント：「Compression quality drives every subsequent main turn」）、sideQuery 呼び出しに `maxOutputTokens` の上限が設定されていない。コード注釈（[:436-437](packages/core/src/services/chatCompressionService.ts:436)）も `compressionOutputTokenCount may include non-persisted tokens (thoughts)` を認めている。圧縮がウィンドウの上限に近い状態で発生すると、総出力が膨張し、バッファ予約の上限が予測できなくなる。<br/><br/>さらに悪いことに、プロバイダー間で動作が一致しない：Anthropic の thinking budget は max_tokens と完全に独立している；OpenAI の reasoning tokens は max_completion_tokens の制約を受けない；Gemini の動作はモデルバージョンによって異なる。つまり「maxOutputTokens を追加するだけで総出力を制御できる」というのは、qwen-code のようなマルチプロバイダーのプロジェクトでは成立しない

5. **閾値判定に使われる `lastPromptTokenCount` が系統的に過小評価されている。** [geminiChat.ts:1217-1232](packages/core/src/core/geminiChat.ts:1217) によれば、この値は前のラウンドの API response の `usageMetadata.totalTokenCount` から来ている。2 つのギャップがある：(a) 今回のラウンドで追加される user message を含まないため、cheap-gate の判定は毎回実際の prompt より少ない値になる；(b) 初回の初期値は 0 であり、`--continue` で大きなセッションを復元する場合や sub-agent が大量の履歴を引き継ぐ場合、最初の send では常にすべての閾値をバイパスしてしまう。claude-code の `tokenCountWithEstimation`（[query.ts:638](src/query.ts:638)）は「最後の assistant API usage + その後の新規 message の推定」という 2 トラック方式でこの 2 つのギャップを埋めている

## 設計目標

- 「比率 + 絶対値」のハイブリッド閾値を導入し、大ウィンドウのモデルでは絶対値が主導し、小ウィンドウでは比率がフォールバックとして機能するようにする
- warn / hard の 2 層を追加し（auto はメインのトリガーとして維持）、3 層ラダーを形成する
- tip システムを新しい閾値のトリガー条件に合わせて書き直す
- 失敗処理を「1 回で永続ロック」から「3 回でサーキットブレーク + 自動回復」に升级する
- **圧縮呼び出しで thinking を無効化し `maxOutputTokens` の上限を追加する**：claude-code に合わせて、総出力を単一パラメーターで制約し、バッファバジェットを予測可能にする。圧縮品質が低下する可能性は許容する
- **token 推定補正を追加する**：`lastPromptTokenCount` の「1 ラウンド遅延」と「初回が 0」という 2 つの系統的な過小評価を排除し、閾値判定が実際の prompt サイズにより近くなるようにする
- settings の `contextPercentageThreshold` 設定エントリを削除する（内部の PCT 定数は保持）
- **env 上書きチャンネルは追加しない**、**明示的な enabled スイッチも追加しない**

## 3 層閾値ラダー

```
                       window  (raw context window)
                          │
                          │  ← SUMMARY_RESERVE = 20K
                          ▼
                    effectiveWindow
                          │
                          │  ← HARD_BUFFER = 3K
                          ▼
              hard_threshold = effectiveWindow - 3K
                          │
                          │  ← (AUTOCOMPACT_BUFFER - HARD_BUFFER) = 10K
                          ▼
auto_threshold = max(PCT * window, effectiveWindow - AUTOCOMPACT_BUFFER)
                          │
                          │  ← WARN_BUFFER = 20K
                          ▼
warn_threshold = max((PCT - WARN_OFFSET) * window, auto_threshold - WARN_BUFFER)
                          │
                          ▼
                          0
```

### 3 層の意味

| 層       | トリガー条件                   | 動作                                                                 |
| -------- | ------------------------------ | -------------------------------------------------------------------- |
| **warn** | `tokenCount >= warn_threshold` | UI に「自動圧縮まで残り X tokens」と表示、send 動作は変更しない      |
| **auto** | `tokenCount >= auto_threshold` | send 前に `tryCompress(force=false)` を実行、通常の圧縮フロー        |
| **hard** | `tokenCount >= hard_threshold` | send 前に `tryCompress(force=true)` を実行、失敗ロックをリセットして強制圧縮 |

`hard` 層は、既存のリアクティブオーバーフロー（geminiChat.ts:711）のフォールバックロジックを send 前に前倒しするものであり、失敗したオーバーサイズリクエストの往復を回避する。

## 内部定数

```ts
// chatCompressionService.ts
const DEFAULT_PCT = 0.7; // auto の比率フォールバック
const WARN_PCT_OFFSET = 0.1; // warn の比率 = PCT - WARN_OFFSET = 0.6
const COMPACT_MAX_OUTPUT_TOKENS = 20_000; // 圧縮 sideQuery 出力のハード上限（thinking + summary の合計）
const SUMMARY_RESERVE = 20_000; // ウィンドウ上限から差し引く出力予約 = maxOutput
const AUTOCOMPACT_BUFFER = 13_000; // auto と effectiveWindow の間隔
const WARN_BUFFER = 20_000; // warn と auto の間隔
const HARD_BUFFER = 3_000; // hard と effectiveWindow の間隔
const MAX_CONSECUTIVE_FAILURES = 3; // 失敗サーキットブレーカーの閾値
```

数値の根拠：すべて claude-code の実測値を踏襲（[autoCompact.ts:30,62-65](src/services/compact/autoCompact.ts:30)）。

`SUMMARY_RESERVE = COMPACT_MAX_OUTPUT_TOKENS` は重要な関係である：モデルは `maxOutputTokens` のハード制約を受けるため、出力が 20K を超えることはなく、reserve に追加の safety margin は不要。注意：本設計では thinking を無効化した後にこの等式が成立する（出力バジェットは全て summary に割り当てられる）。thinking を有効のままにすると、`thinking + summary` がバジェットを共有し（Gemini SDK / 多くのプロバイダーの `maxOutputTokens` のセマンティクス）、モデルが両者を自由に分配するため、summary が実際に使用できる空間は 20K 未満になる（「リスクと注意事項」の 1、2 項を参照）。

## 計算関数

```ts
export interface CompactionThresholds {
  warn: number;
  auto: number;
  hard: number; // hard < auto の場合は auto と等しい（小ウィンドウでの縮退）
  effectiveWindow: number;
}

export function computeThresholds(window: number): CompactionThresholds {
  const effectiveWindow = window - SUMMARY_RESERVE;

  const absAuto = effectiveWindow - AUTOCOMPACT_BUFFER;
  const auto = Math.max(DEFAULT_PCT * window, absAuto);

  const absWarn = auto - WARN_BUFFER;
  const warn = Math.max((DEFAULT_PCT - WARN_PCT_OFFSET) * window, absWarn);

  const rawHard = effectiveWindow - HARD_BUFFER;
  const hard = Math.max(rawHard, auto); // 小ウィンドウでは auto に縮退

  return { warn, auto, hard, effectiveWindow };
}
```

### 実測データ

| ウィンドウ | warn        | auto        | hard         | 備考                                   |
| ---------- | ----------- | ----------- | ------------ | -------------------------------------- |
| 32K        | 19.2K (pct) | 22.4K (pct) | 22.4K (縮退) | 比率フォールバック                     |
| 64K        | 38.4K (pct) | 44.8K (pct) | 44.8K (縮退) | 比率フォールバック                     |
| 128K       | 76.8K (pct) | 95K (abs)   | 105K (abs)   | ハイブリッド（warn=pct, auto/hard=abs）|
| 200K       | 147K (abs)  | 167K (abs)  | 177K (abs)   | 絶対値が主導                           |
| 256K       | 203K (abs)  | 223K (abs)  | 233K (abs)   | 絶対値が主導                           |
| 1M         | 947K (abs)  | 967K (abs)  | 977K (abs)   | 全て絶対値                             |

`(pct)` はその層が比率式で決定されることを示し、`(abs)` は絶対値式で決定されることを示す。

## ユーザー設定

### ChatCompressionSettings の変更

```ts
// packages/core/src/config/config.ts:217
export interface ChatCompressionSettings {
  /** 保持（本設計とは無関係、compactionInputSlimming で使用） */
  imageTokenEstimate?: number;
}
```

**削除：** `contextPercentageThreshold` フィールド。理由：

1. 新しい計算式では、主流のウィンドウサイズ（>= 128K）においてこのフィールドはほぼ影響しない——絶対値が主導するため
2. 小ウィンドウではユーザー設定によって閾値が「より早く」圧縮を開始する可能性があり、token を節約するという直感と逆になる
3. claude-code はこのフィールドを公開しておらず、類似のユーザー向け設定の前例がない

### Breaking change の扱い

**ユーザー向け：** 起動時に `Config` ロードで `chatCompression.contextPercentageThreshold` が存在することが検出された場合：

- stderr に 1 行の警告を書き出す：`"chatCompression.contextPercentageThreshold has been removed and is now controlled by built-in thresholds."`
- エラーは**出さない**、起動は**ブロックしない**
- フィールドの値は無視される

**SDK 面（R5.4）：** `CompressOptions` の `hasFailedCompressionAttempt: boolean` フィールドを `consecutiveFailures: number` にリネームする。2 点の差異：

|      | 旧フィールド                   | 新フィールド                                                                      |
| ---- | ------------------------------ | --------------------------------------------------------------------------------- |
| 名前 | `hasFailedCompressionAttempt`  | `consecutiveFailures`                                                             |
| 型   | `boolean`                      | `number`                                                                          |
| 意味 | `true` = auto-compact を永続無効化 | `>= MAX_CONSECUTIVE_FAILURES`（デフォルト 3）= force 成功でリセットされるまで一時無効化 |

リポジトリ内では `GeminiChat.tryCompress` のみが内部で消費しているため、内部の migration リスクは低い。ただし `@qwen-code/qwen-code-core` は published package であり、`CompressOptions` は d.ts で可視である。下流の SDK で `service.compress({ ..., hasFailedCompressionAttempt: true })` を直接呼び出しているコードは TS コンパイルエラーになる。**移行ガイド：** `true` を `MAX_CONSECUTIVE_FAILURES`（または 3 以上の整数）に、`false` を `0` に変更する。呼び出し元が独自の失敗カウントを管理している場合はそのまま渡せばよい。

## Token 推定補正

qwen-code の `lastPromptTokenCount` は前のラウンドの API response の `usageMetadata.totalTokenCount` から来ている（[geminiChat.ts:1217-1232](packages/core/src/core/geminiChat.ts:1217)）。これにより：

1. **1 ラウンド遅延**：cheap-gate は `lastPromptTokenCount` で判定するが、今回の send の実際の prompt = それ + 今回の user message になる。不足分が閾値判定の false-negative を引き起こす可能性がある
2. **初回が 0**：初期値は 0 であり、最初の send 時は履歴がどれだけ多くても閾値がトリガーされない（`--continue` での復元 / sub-agent の継承シナリオを含む）

軽量なローカル推定関数 `estimatePromptTokens` を導入し、send 前の cheap-gate / hard 判定時にこの 2 つの欠落を補う：

```ts
// chatCompressionService.ts（または新ファイル packages/core/src/services/tokenEstimation.ts）

const BYTES_PER_TOKEN = 4; // 汎用 char/4 推定（claude-code と同じ）
const BYTES_PER_TOKEN_JSON = 2; // JSON / tool_call input はより密度が高い

/**
 * Content の配列の token 数を推定し、API usage metadata の遅延を補正する。
 * image / document は既存の imageTokenEstimate（デフォルト 1600）を再利用する。
 */
export function estimateContentTokens(
  contents: Content[],
  imageTokenEstimate = DEFAULT_IMAGE_TOKEN_ESTIMATE,
): number {
  // estimateContentChars（compactionInputSlimming.ts）を再利用し、bytesPerToken で割る
  // functionCall / functionResponse には BYTES_PER_TOKEN_JSON を使用
  // ...
}

/**
 * cheap-gate と hard 判定の統一エントリポイント。
 * メインパス：lastPromptTokenCount が正確 + 今回の user message の推定
 * 初回パス：全履歴の推定
 */
export function estimatePromptTokens(
  history: Content[],
  userMessage: Content,
  lastPromptTokenCount: number,
): number {
  if (lastPromptTokenCount > 0) {
    return lastPromptTokenCount + estimateContentTokens([userMessage]);
  }
  return estimateContentTokens([...history, userMessage]);
}
```

適用箇所：

- `chatCompressionService.compress()` の cheap-gate：`originalTokenCount` の取得元を `estimatePromptTokens(history, userMessage, lastPromptTokenCount)` に変更
- `geminiChat.sendMessageStream` エントリの hard 判定（次節を参照）

**推定は早期トリガーにのみ使用し、「トリガーのスキップ」には使用しない。** char/4 は粗い下限推定であり、false-positive 側（早めに圧縮する）は安全だが、false-negative としては信頼できないため。

## トリガーフローの変更

### chatCompressionService.ts

1. **`computeThresholds` をエクスポートする**。cheap-gate / UI / コマンドで再利用するため
2. **`compress()` cheap-gate**（line 221-249）：
   ```ts
   if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES && !force) {
     return NOOP;
   }
   const { auto } = computeThresholds(contextLimit);
   const effectiveTokens = estimatePromptTokens(
     curatedHistory,
     userMessage,
     originalTokenCount,
   );
   if (!force && effectiveTokens < auto) return NOOP;
   ```
3. **`compress()` の runSideQuery 呼び出し**（line 356-380）：thinking を無効化し `maxOutputTokens` を追加する：

   ```ts
   const summaryResult = await runSideQuery(config, {
     // ...
     config: {
       thinkingConfig: { includeThoughts: false }, // thinking を無効化（claude-code と一致）
       maxOutputTokens: COMPACT_MAX_OUTPUT_TOKENS, // ハード上限 20K
     },
     // ...
   });
   ```

   または `thinkingConfig` を削除して `runSideQuery` のデフォルト値（[sideQuery.ts:118](packages/core/src/utils/sideQuery.ts:118) デフォルト `includeThoughts: false`）に委ねる。

   thinking を無効化すると、`maxOutputTokens` が総出力を直接制約し（thinking の別バジェット問題がなくなる）、`SUMMARY_RESERVE = maxOutput = 20K` はクリーンなハード関係になる。

   同時に [chatCompressionService.ts:374-376](packages/core/src/services/chatCompressionService.ts:374) のコメントを「Compression quality drives every subsequent main turn — keep reasoning on」から「クロスプロバイダーで予測可能な出力上限を保証するため、claude-code の設計に合わせた」という説明に更新する。

   token math のセクション（[:436-437](packages/core/src/services/chatCompressionService.ts:436)）の "may include non-persisted tokens (thoughts)" コメントも合わせてクリーンアップ可能

### geminiChat.ts: `sendMessageStream` エントリ（line 562）

```ts
// 変更前：tryCompress(force=false)
// 変更後：推定 token で hard をトリガーするか判定し、force フラグを決定

const { hard } = computeThresholds(contextLimit);
const effectiveTokens = estimatePromptTokens(
  this.getHistory(true),
  createUserContent(params.message),
  this.lastPromptTokenCount,
);
const shouldForceFromHard = effectiveTokens >= hard;

if (shouldForceFromHard) {
  // サーキットブレーカーをリセット、force compress と同等
  this.consecutiveFailures = 0;
}

compressionInfo = await this.tryCompress(
  prompt_id,
  model,
  shouldForceFromHard,
  params.config?.abortSignal,
);
```

### 失敗処理の改善（`geminiChat.ts:504-510`）

```ts
// 変更前
hasFailedCompressionAttempt: boolean;

// 変更後
consecutiveFailures: number;  // デフォルト 0

// 失敗ブランチ
} else if (isCompressionFailureStatus(info.compressionStatus)) {
  if (!force) {
    this.consecutiveFailures += 1;
  }
}

// 成功ブランチ
this.consecutiveFailures = 0;
```

`force=true` の呼び出しが失敗してもカウントに含めない（既存のリアクティブ / 手動が「枠を使わない」というセマンティクスを維持する）。

## UI の変更

### tipRegistry.ts の context-\* tip 3 件の書き直し

3 層の閾値はちょうど 3 件の tip と 1 対 1 で対応する。マッピング関係（token 数が低い順）：

| Tip ID             | 現在の条件                                    | 新しい条件                                                          | 文言の変化                                                               |
| ------------------ | --------------------------------------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| `compress-intro`   | `pct >= 50 && < 80 && sessionPromptCount > 5` | `tokenCount >= warn && tokenCount < auto && sessionPromptCount > 5` | 変更なし                                                                 |
| `context-high`     | `pct >= 80 && < 95`                           | `tokenCount >= auto && tokenCount < hard`                           | 変更なし                                                                 |
| `context-critical` | `pct >= 95`                                   | `tokenCount >= hard`                                                | 「Auto-compact will force on next send.」を追加し、新しい hard 層の動作を反映 |

**トリガー頻度への影響：**

- メインパス（auto が正常に動作）：`tokenCount` が auto を超えた直後に圧縮がトリガーされ、次のラウンドで `tokenCount` が下がるため、`context-high` は「トリガーから圧縮が有効になるまでの間」だけ短時間表示される
- エッジパス（auto 失敗 / サーキットブレーク / リアクティブが間に合わない）：`tokenCount` が継続的に増加し、warn → auto → hard の順に 3 件の tip がトリガーされる。ユーザー視点の「コンテキストがどんどん逼迫する」感覚と一致する
- `context-critical` がトリガーされた時点で、hard 層は send 前に force compress を実行済み（仕様のトリガーフローの変更の節を参照）。そのため、この tip は「救済前の警告」ではなく「救済後の通知」であり、文言にその旨を補足する

`TipContext` インターフェースに追加：

```ts
export interface TipContext {
  lastPromptTokenCount: number;
  contextWindowSize: number;
  sessionPromptCount: number;
  sessionCount: number;
  platform: string;
  // 新規追加：isRelevant 関数が閾値を参照できるようにする。
  // computeThresholds は呼び出し元で計算して注入し、tipRegistry が core に直接依存しないようにする。
  thresholds?: CompactionThresholds;
}
```

`AppContainer.tsx:1150` で `TipContext` を構築する際に同期して注入する。

### /context コマンドの同期（`contextCommand.ts:177-183`）

```ts
// ハードコードされた (1 - threshold) * contextWindowSize を置き換える
const { warn, auto, hard, effectiveWindow } =
  computeThresholds(contextWindowSize);

// 4 行を表示：
//   Effective window:   180K   (window − 20K reserve)
//   Warn threshold:     147K   (...)
//   Auto threshold:     167K   ← 現在位置
//   Hard threshold:     177K
// 現在の token count がどの tier に属するかをマークする
```

### フッターの継続的な表示（オプションのフォローアップ）

本仕様ではフッターの継続的な表示を強制実装しない。理由：

- 既存の tip システムが履歴内でヒントを提供できている
- フッターの継続表示には ink のレンダリング変更と再描画頻度の増加が必要
- 本仕様の後続フォローアップとして対応可能（独立した PR）

後続で対応する場合、トリガー条件を `tokenCount >= warn && tokenCount < auto` とし、auto を超えたら非表示にする（圧縮が開始されたため）ことを推奨する。

## テストカバレッジ

### ユニットテスト（chatCompressionService.test.ts）

- `computeThresholds(32K)` → 比率フォールバックブランチ（warn/auto ともに pct、hard は縮退）
- `computeThresholds(128K)` → ハイブリッドブランチ（warn=pct、auto=abs、hard=abs）
- `computeThresholds(200K)` → 絶対値主導ブランチ（warn/auto/hard ともに abs）
- `computeThresholds(1M)` → 全て絶対値ブランチ
- `computeThresholds(window=10K)` → 極小ウィンドウ（絶対値が全て負）、計算式がクラッシュしない
- 3 層の閾値が常に `warn <= auto <= hard` を満たす
- max() 計算式が境界点（pct \* window == abs）で安定している

### ユニットテスト（tokenEstimation.test.ts）

- `estimateContentTokens` が純テキスト / json / functionCall / functionResponse / image / document それぞれに対応する bytesPerToken を使用する
- `estimatePromptTokens` が `lastPromptTokenCount > 0` の場合「メインパス」、0 の場合「初回パス」を使用する
- 大きな user message が cheap-gate フェーズで加算された後に auto 閾値を超えられる
- 推定と実際の API usage の誤差が ±30% 以内（実際の履歴サンプルによる回帰テスト）

### 統合テスト（geminiChat.test.ts / chatCompressionService.test.ts）

- 連続 3 回失敗後に cheap-gate が NOOP になる；次回の force 後に回復する
- 1 回の失敗では永続ロックしなくなった
- 推定 token が hard を超えると send が自動的に force compress になる
- 圧縮 sideQuery の呼び出しで `maxOutputTokens = COMPACT_MAX_OUTPUT_TOKENS` が `runSideQuery` に正しく伝わり、`thinkingConfig.includeThoughts` が `false`（または sideQuery のデフォルト値が引き継ぐ）になっている
- **初回カバレッジ**：`lastPromptTokenCount = 0` だが履歴が大きい chat を構築し（`--continue` での復元をシミュレート）、最初の send 時に auto 閾値が推定パスでトリガーされることを確認

### 互換性テスト

- `contextPercentageThreshold = 0.5` を設定して起動 → stderr に警告 + フィールドが無視され、動作が内部の PCT 定数に従う

### tip システムテスト（tipRegistry.test.ts）

- 3 件の context-\* tip が warn/auto/hard を超えた際に正しくトリガーされ、区間が重複しない
- メインパスで auto 閾値が圧縮をトリガーした後、`context-high` が継続して表示されない
- エッジパス（サーキットブレーク + token が増加し続ける）で 3 件の tip が順番にトリガーされる
- TipContext に `thresholds` がない場合（フォールバック）の動作が合理的である

## 実装フェーズ

| Phase | 内容                                                                                              | 独立性                      |
| ----- | ------------------------------------------------------------------------------------------------- | --------------------------- |
| 1     | 内部定数 + `computeThresholds` + cheap-gate の変更（推定補正を除く）                              | 独立してマージ可能          |
| 2     | 失敗処理の改善（1 → 3 サーキットブレーク）                                                        | 独立してマージ可能          |
| 3     | hard 層の force compress を前倒し                                                                 | P1 + P7 に依存              |
| 4     | 設定面の変更 + breaking change の警告                                                             | P1 に依存                   |
| 5     | UI（tip の書き直し + /context）                                                                   | P1 に依存                   |
| 6     | 圧縮 sideQuery の thinking を無効化 + `maxOutputTokens` 上限を追加                                | P1 より先に独立してマージ可能|
| 7     | Token 推定補正（`estimateContentTokens` + `estimatePromptTokens`、cheap-gate / hard に適用）       | P1 と並行して独立可能       |

各 Phase は独立した PR にできる。推奨マージ順序は **P6 → P7 → P1 → P2 → P4 → P3 → P5**：まず圧縮呼び出しに `maxOutputTokens` 上限を付けて（バッファ仮定を信頼できるものにする）、次に推定補正を追加し（token 数の判定をより信頼できるものにする）、閾値の基盤インフラを落とす。その後、失敗サーキットブレーク、設定面の変更を行い、最後に hard 層のアクティブな救済を有効にする（この時点で信頼できる token 数 + サーキットブレーカーが揃っている）。各 PR は独立して検証・ロールバック可能。

## リスクと注意事項

1. **thinking を無効化すると、サマリーの品質が低下する可能性がある。** 元の作者のコメント「Compression quality drives every subsequent main turn — keep reasoning on」はこの懸念を表明している。本仕様の判断は「予測可能な token 上限」を「品質の最大化」より優先するものだが、落地後は telemetry の `compression_input_token_count` / `compression_output_token_count` の分布、および圧縮後のメイン会話の品質変化（ユーザーフィードバック、`COMPRESSION_FAILED_*` ステータス率）を観察する必要がある。品質の低下が顕著な場合は、thinking を有効に戻してプロバイダー固有の thinkingBudget 制御を検討する。

2. **`maxOutputTokens` に達するとサマリーが切り捨てられる可能性がある。** thinking を無効化すると、20K が直接 summary 本体を制約する。claude-code の実測では p99.99 ≈ 17K であり、~3K の安全マージンが残る。ただし qwen-code の圧縮プロンプトは claude-code と異なるため、分布を観測する必要がある。圧縮失敗ブランチ（[chatCompressionService.ts:464-491](packages/core/src/services/chatCompressionService.ts:464)）に「finish_reason = MAX_TOKENS を検出した場合の NOOP パス」を追加し、半端な summary が永続化されないようにすることを推奨する。

3. **クロスプロバイダーの maxOutputTokens マッピングの差異。** OpenAI compat (dashscope) → `max_tokens`、Anthropic → `max_tokens`、Gemini SDK → `maxOutputTokens`。現在の qwen-code にはこの層のマッピングがすでにある（[contentGenerator.ts:94](packages/core/src/core/contentGenerator.ts:94) 等）。P6 の実装時に、sideQuery パスで `maxOutputTokens` フィールドが全プロバイダーのリクエストボディに確実に伝わることを検証する必要がある。

4. **Token 推定は粗い下限であり、「トリガーのスキップ」の根拠として逆用してはならない。** `char/4` と各プロバイダーの実際の tokenizer の誤差は ±30% になる可能性がある。本仕様では推定を「閾値をより早くトリガーする」（false-positive 方向、早めに圧縮する方が良い）ためにのみ使用する。「token 数を減らす / 圧縮をスキップする」コードパスでは引き続き `lastPromptTokenCount`（API の権威ある値）を使用すること。

5. **推定関数と既存の `estimateContentChars` の関係。** [compactionInputSlimming.ts](packages/core/src/services/compactionInputSlimming.ts) にはすでに `estimateContentChars`（圧縮の split point 計算に使用）がある。新しく追加する `estimateContentTokens` はこれを再利用（bytesPerToken で割る）すべきであり、別の実装を新たに書かないこと。2 系統の推定口径が乖離するのを避けるため。

## 本仕様の対象外

- env 変数の上書きチャンネル（D 方案）：「設定面の最小化」原則を維持
- フッターの常駐ビジュアライゼーション：フォローアップに残す
- サマリープロンプトの改善、`MIN_COMPRESSION_FRACTION` の調整：閾値設計とは直交する

## オープン問題（レビュー待ち）

1. **breaking change の強度**：警告 + フィールドの無視 vs 起動エラー。現在は警告を選択しているが、エンタープライズデプロイ / チーム設定にとって十分にフレンドリーかどうか確認が必要

## クローズ済み

2. **小ウィンドウ（≤ ~76.7K）で hard と auto が同じ値に縮退する** — **`/context` で明示しない**ことを決定。理由：
   - 縮退するのは 32K だけでなく、`effectiveWindow - HARD_BUFFER ≤ 0.7 × window` となる全てのウィンドウ（64K を含む）
   - ユーザーの動作は変わらない：縮退するウィンドウでは `currentTier` が `'auto'` をスキップして直接 `'hard'` を報告する（`contextCommand.ts:43-44` が先に `>= hard` を判定する）。`context-high` バンド（`auto ≤ t < hard`）が空になり、中間の段階の表示がなくなるが、小ウィンドウではそれが妥当——ウィンドウ自体が小さいため、ユーザーは手動でコンテキストを管理していることが多い
   - 将来的に「小ウィンドウで中間の表示がない」というユーザー報告があれば、UI のアノテーションを追加するか `context-high` のトリガー条件を調整することを検討する（これは UI の作業であり、仕様の作業ではない）。現時点では UI の複雑さを増やさない方針を選択する
