# Auto-Compaction Threshold Redesign（自動圧縮閾値の再設計）

**状態:** Draft · 2026-05-14

## 背景

> この節では、本 PR がマージされる**前**の状態（pre-redesign 時の動作）を説明します。以下に登場する `COMPRESSION_TOKEN_THRESHOLD`、`thinkingConfig.includeThoughts = true`、`hasFailedCompressionAttempt`、および具体的な file:line 参照は、PR #4345 のマージ前のコードを指しています。マージ後はこれらのシンボル・行番号は無効になります。

現在の qwen-code の自動圧縮では、単一の割合閾値 `COMPRESSION_TOKEN_THRESHOLD = 0.7`（`chatCompressionService.ts:33`）のみを使用しており、すべてのウィンドウサイズで同じ割合が適用されています。claude-code の「絶対トークン階段」（autoCompact.ts:62-65）と比較して、qwen-code には以下の 3 つの具体的な問題があります。

1. **大きなウィンドウで予約が多すぎる**: 1M モデルの 70% 閾値では 700K でトリガーされ、残り 300K は要約 + 出力に実際に必要な約 33K を大きく超えている
2. **1 回の失敗で永久ロック**: `hasFailedCompressionAttempt = true` になると、セッション全体で auto-compact が試行されなくなる（geminiChat.ts:504）。claude-code の「連続 3 回のサーキットブレーカー」よりも厳しい
3. **tip システムと auto 閾値の連動がない**: `tipRegistry.ts` の 3 つの `context-*` tip は固定の 50/80/95 パーセンテージを使用しており、auto-compact の閾値（70%）とは完全に独立している。その結果、「auto が正常に動作する」主パスでは 80% / 95% の tip がほとんどトリガーされず、「auto が失敗 / リアクティブなフォールバック」というエッジパスでは、閾値に合わせた意味付けが欠けている
4. **圧縮呼び出し自体に出力予算の制御がない**: [chatCompressionService.ts:374-376](packages/core/src/services/chatCompressionService.ts:374) で `thinkingConfig.includeThoughts = true` が明示的に有効化されており（コメント：「Compression quality drives every subsequent main turn」）、同時に sideQuery 呼び出しでは `maxOutputTokens` 上限が設定されていない。コードコメント（[:436-437](packages/core/src/services/chatCompressionService.ts:436)）でも `compressionOutputTokenCount may include non-persisted tokens (thoughts)` と認めている。圧縮がウィンドウ上限に近い場合、総出力が膨張する可能性があり、バッファ予約に予測可能な上限がない。<br/><br/>さらに悪いことに、プロバイダ間で動作が一貫していない: Anthropic の thinking budget は `max_tokens` と完全に独立している；OpenAI の reasoning tokens は `max_completion_tokens` の制限を受けない；Gemini の動作はモデルバージョンによって異なる。つまり、「単に `maxOutputTokens` を追加すれば総出力を制御できる」という前提は、qwen-code のようなマルチプロバイダプロジェクトでは成立しない

5. **閾値判定に使用される `lastPromptTokenCount` が系統的に下方バイアスされている。** [geminiChat.ts:1217-1232](packages/core/src/core/geminiChat.ts:1217) は、この値が前回の API レスポンスの `usageMetadata.totalTokenCount` から取得されていることを示している。2 つのギャップがある: (a) 今回追加されるユーザーメッセージが含まれていないため、cheap-gate 判定ごとに実際のプロンプトより小さくなる；(b) 初期値が 0 であるため、`--continue` で巨大なセッションを復元したり、sub-agent が大量の履歴を継承した場合、最初の send ではすべての閾値をすり抜ける。これに対し、claude-code の `tokenCountWithEstimation`（[query.ts:638](src/query.ts:638)）は「最後の assistant API usage + その後に追加されたメッセージの推定」という二重方式でこれらのギャップを解消している

## 設計目標

- 「割合 + 絶対」の混合閾値を導入し、大きなウィンドウのモデルでは絶対値が支配し、小さなウィンドウでは割合によるフォールバックを維持する
- warn / hard の 2 層を追加し（auto は主トリガーとして維持）、3 層の階段を形成する
- tip システムを新しい閾値に追随するトリガー条件に書き換える
- 失敗処理を「1 回で永久ロック」から「3 回のサーキットブレーカー + 自動復帰」にアップグレードする
- **圧縮呼び出しで thinking を無効にし、`maxOutputTokens` 上限を追加する**: claude-code と同様に、総出力を単一パラメータで制約し、バッファ予算を予測可能にする；圧縮品質が低下する可能性は許容する
- **トークン推定補償を追加する**: `lastPromptTokenCount` の「1 回遅れ」と「初回が 0」という 2 つの系統的下方バイアスを解消し、閾値判定を実際のプロンプトサイズに近づける
- 設定から `contextPercentageThreshold` 設定エントリを削除する（内部 PCT 定数は保持）
- **env オーバーライド経路を導入しない**、**新しい明示的な enabled スイッチを追加しない**

## 3 層閾値階段

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

| 層       | トリガー条件                  | 動作                                                     |
| -------- | ----------------------------- | -------------------------------------------------------- |
| **warn** | `tokenCount >= warn_threshold` | UI で「自動圧縮まであと X tokens」と表示する。send の動作は変更しない |
| **auto** | `tokenCount >= auto_threshold` | send 前に `tryCompress(force=false)` を実行する。通常の圧縮フロー |
| **hard** | `tokenCount >= hard_threshold` | send 前に `tryCompress(force=true)` を実行し、失敗ロックをリセットして強制圧縮する |

`hard` 層は、既存のリアクティブオーバーフロー（geminiChat.ts:711）のフォールバックロジックを send 前に前倒しするもので、1 回の oversized request のラウンドトリップを回避する。

## 内部定数

```ts
// chatCompressionService.ts
const DEFAULT_PCT = 0.7; // auto の割合フォールバック
const WARN_PCT_OFFSET = 0.1; // warn の割合 = PCT - WARN_OFFSET = 0.6
const COMPACT_MAX_OUTPUT_TOKENS = 20_000; // 圧縮 sideQuery の出力ハード上限（thinking + summary 合計）
const SUMMARY_RESERVE = 20_000; // 閾値階段がウィンドウ上限から差し引く出力予約 = maxOutput
const AUTOCOMPACT_BUFFER = 13_000; // auto と effectiveWindow の間隔
const WARN_BUFFER = 20_000; // warn と auto の間隔
const HARD_BUFFER = 3_000; // hard と effectiveWindow の間隔
const MAX_CONSECUTIVE_FAILURES = 3; // 失敗時のサーキットブレーカー閾値
```

数値の出典: すべて claude-code の実測値（[autoCompact.ts:30,62-65](src/services/compact/autoCompact.ts:30)）を踏襲。

`SUMMARY_RESERVE = COMPACT_MAX_OUTPUT_TOKENS` は重要な関係である。モデルは `maxOutputTokens` のハード制限に従うため、出力が 20K を超えることはなく、したがって reserve に追加の safety margin は不要である。注意: 本設計では thinking を無効にすることでこの等式が成立する（output budget はすべて summary に割り当てられる）。thinking を維持する場合、`thinking + summary` が予算を共有する（Gemini SDK / 多くのプロバイダの `maxOutputTokens` の意味論）、モデルが両者を自由に配分するため、summary の実際の利用可能スペースは 20K 未満になる（「リスクと注意事項」第 1、2 条を参照）。

## 計算関数

```ts
export interface CompactionThresholds {
  warn: number;
  auto: number;
  hard: number; // hard < auto の場合は auto に等しくなる（小ウィンドウでの退行）
  effectiveWindow: number;
}

export function computeThresholds(window: number): CompactionThresholds {
  const effectiveWindow = window - SUMMARY_RESERVE;

  const absAuto = effectiveWindow - AUTOCOMPACT_BUFFER;
  const auto = Math.max(DEFAULT_PCT * window, absAuto);

  const absWarn = auto - WARN_BUFFER;
  const warn = Math.max((DEFAULT_PCT - WARN_PCT_OFFSET) * window, absWarn);

  const rawHard = effectiveWindow - HARD_BUFFER;
  const hard = Math.max(rawHard, auto); // 小ウィンドウでは auto に退行

  return { warn, auto, hard, effectiveWindow };
}
```

### 実測データ

| ウィンドウ | warn        | auto        | hard         | 備考                              |
| ---------- | ----------- | ----------- | ------------ | --------------------------------- |
| 32K        | 19.2K (pct) | 22.4K (pct) | 22.4K (退行) | 割合フォールバック                |
| 64K        | 38.4K (pct) | 44.8K (pct) | 44.8K (退行) | 割合フォールバック                |
| 128K       | 76.8K (pct) | 95K (abs)   | 105K (abs)   | 混合（warn=pct, auto/hard=abs）   |
| 200K       | 147K (abs)  | 167K (abs)  | 177K (abs)   | 絶対値が支配                      |
| 256K       | 203K (abs)  | 223K (abs)  | 233K (abs)   | 絶対値が支配                      |
| 1M         | 947K (abs)  | 967K (abs)  | 977K (abs)   | すべて絶対値                      |

`(pct)` はその層が割合計算式で決定されることを示し、`(abs)` は絶対値計算式で決定されることを示す。

## ユーザー設定

### ChatCompressionSettings の変更

```ts
// packages/core/src/config/config.ts:217
export interface ChatCompressionSettings {
  /** 保持（本設計とは無関係、compactionInputSlimming が使用） */
  imageTokenEstimate?: number;
}
```

**削除:** `contextPercentageThreshold` フィールド。理由:

1. 新しい計算式では、主流のウィンドウ（>= 128K）ではこのフィールドはほとんど影響しない——絶対値が支配する
2. 小さいウィンドウでは、ユーザー設定によって逆に閾値が「より早く」圧縮される可能性があり、トークン節約の直感に反する
3. claude-code はこのフィールドを公開しておらず、類似のユーザー向け設定の前例はない

### Breaking change の処理

**ユーザー側:** 起動時に `Config` が `chatCompression.contextPercentageThreshold` を発見した場合:

- stderr に警告を 1 行出力: `"chatCompression.contextPercentageThreshold has been removed and is now controlled by built-in thresholds."`
- **エラーにはしない**、**起動をブロックしない**
- フィールド値は無視される

**SDK 側（R5.4）:** `CompressOptions` の `hasFailedCompressionAttempt: boolean` フィールドを `consecutiveFailures: number` に名称変更。2 つの違い:

|      | 旧フィールド                | 新フィールド                                                             |
| ---- | --------------------------- | ------------------------------------------------------------------------ |
| 名前 | `hasFailedCompressionAttempt` | `consecutiveFailures`                                                    |
| 型   | `boolean`                   | `number`                                                                 |
| 意味 | `true` = 自動圧縮を永久に無効 | `>= MAX_CONSECUTIVE_FAILURES`（デフォルト 3）= 一時的に無効、force が成功するまでリセットしない |

リポジトリ内では `GeminiChat.tryCompress` という 1 つの内部消費者のみであるため、内部移行のリスクは低い。しかし `@qwen-code/qwen-code-core` は公開パッケージであり、`CompressOptions` は d.ts で見えるため、下流の SDK が `service.compress({ ..., hasFailedCompressionAttempt: true })` のように直接呼び出すコードは TS コンパイルエラーになる。**移行ガイド:** `true` を `MAX_CONSECUTIVE_FAILURES`（または 3 以上の任意の整数）に、`false` を `0` に変更する。呼び出し側が独自の失敗カウンターを管理している場合は、その値をそのまま渡せばよい。

## トークン推定補償

qwen-code の `lastPromptTokenCount` は前回の API レスポンスの `usageMetadata.totalTokenCount` から取得される（[geminiChat.ts:1217-1232](packages/core/src/core/geminiChat.ts:1217)）。これにより以下の問題が生じる:

1. **1 回遅れ**: cheap-gate は `lastPromptTokenCount` で判定するが、今回送信する実際のプロンプトは「それ + 今回のユーザーメッセージ」である。過小評価により閾値判定が false-negative になる可能性がある
2. **初回が 0**: 初期値が 0 のため、最初の send では履歴のサイズにかかわらずどの閾値もトリガーされない（`--continue` で復元 / sub-agent 継承のシナリオを含む）

軽量なローカル推定関数 `estimatePromptTokens` を導入し、send 前の cheap-gate / hard 判定でこの 2 つの欠落を補う:

```ts
// chatCompressionService.ts（または新ファイル packages/core/src/services/tokenEstimation.ts）

const BYTES_PER_TOKEN = 4; // 一般的な char/4 推定（claude-code も同じ）
const BYTES_PER_TOKEN_JSON = 2; // JSON / tool_call input はより密

/**
 * Content の配列のトークン数を推定する。API usage metadata の遅延を補償するために使用する。
 * image / document には既存の imageTokenEstimate（デフォルト 1600）を再利用する。
 */
export function estimateContentTokens(
  contents: Content[],
  imageTokenEstimate = DEFAULT_IMAGE_TOKEN_ESTIMATE,
): number {
  // estimateContentChars（compactionInputSlimming.ts）を再利用し、bytesPerToken で割る
  // 内部的に functionCall / functionResponse には BYTES_PER_TOKEN_JSON を使用
  // ...
}

/**
 * cheap-gate と hard 判定の統一エントリポイント。
 * 主パス: lastPromptTokenCount が正確 + 今回のユーザーメッセージの推定
 * 初回パス: 全 history の推定
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

適用箇所:

- `chatCompressionService.compress()` の cheap-gate: `originalTokenCount` の取得元を `estimatePromptTokens(history, userMessage, lastPromptTokenCount)` に変更する
- `geminiChat.sendMessageStream` 入口の hard 判定（次の節を参照）

**推定はトリガーを早めるためだけに使用し、「トリガーをスキップする」ためには使用しない。** char/4 は大まかな下界推定であり、false-positive 側（少しでも早く圧縮する）は安全だが、false-negative 側は信頼できない。

## トリガー連鎖の変更

### chatCompressionService.ts

1. **`computeThresholds` をエクスポート**し、cheap-gate / UI / コマンドで再利用できるようにする
2. **`compress()` の cheap-gate**（line 221-249）:
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
3. **`compress()` の runSideQuery 呼び出し**（line 356-380）: thinking を無効にし、`maxOutputTokens` を追加する:

   ```ts
   const summaryResult = await runSideQuery(config, {
     // ...
     config: {
       thinkingConfig: { includeThoughts: false }, // thinking を無効にする（claude-code と同一）
       maxOutputTokens: COMPACT_MAX_OUTPUT_TOKENS, // ハード上限 20K
     },
     // ...
   });
   ```

   または、`thinkingConfig` を削除して `runSideQuery` のデフォルト値（[sideQuery.ts:118](packages/core/src/utils/sideQuery.ts:118) のデフォルト `includeThoughts: false`）に任せることもできる。

   thinking を無効にすることで、`maxOutputTokens` が直接総出力を制約する（thinking に個別の budget がある問題はなくなる）。`SUMMARY_RESERVE = maxOutput = 20K` はクリーンなハードな関係になる。

   同時に [chatCompressionService.ts:374-376](packages/core/src/services/chatCompressionService.ts:374) のコメントを更新し、「Compression quality drives every subsequent main turn — keep reasoning on」から「プロバイダ間で予測可能な出力上限を確保するため、claude-code の設計に合わせる」という説明に変更する。

   token math の部分（[:436-437](packages/core/src/services/chatCompressionService.ts:436)）にある "may include non-persisted tokens (thoughts)" のコメントも合わせて削除できる

### geminiChat.ts: `sendMessageStream` 入口（line 562）

```ts
// 置き換え前: tryCompress(force=false)
// 置き換え後: 推定トークンを使用して hard トリガーを判定し、force フラグを決定する

const { hard } = computeThresholds(contextLimit);
const effectiveTokens = estimatePromptTokens(
  this.getHistory(true),
  createUserContent(params.message),
  this.lastPromptTokenCount,
);
const shouldForceFromHard = effectiveTokens >= hard;

if (shouldForceFromHard) {
  // サーキットブレーカーをリセットし、force compress と同等にする
  this.consecutiveFailures = 0;
}

compressionInfo = await this.tryCompress(
  prompt_id,
  model,
  shouldForceFromHard,
  params.config?.abortSignal,
);
```

### 失敗処理のアップグレード (`geminiChat.ts:504-510`)

```ts
// 置き換え前
hasFailedCompressionAttempt: boolean;

// 置き換え後
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

`force=true` での呼び出しが失敗してもカウントに加算しない（既存のリアクティブ / 手動圧縮が「枠を消費しない」という意味を維持する）。

## UI の変更

### tipRegistry.ts の 3 つの context-\* tip を書き換え

3 層閾値は 3 つの tip に 1 対 1 で対応する。マッピング（トークン数が低い順）:

| Tip ID             | 現在の条件                                  | 新しい条件                                                          | 文言の変更                                                        |
| ------------------ | ------------------------------------------- | ------------------------------------------------------------------- | ----------------------------------------------------------------- |
| `compress-intro`   | `pct >= 50 && < 80 && sessionPromptCount > 5` | `tokenCount >= warn && tokenCount < auto && sessionPromptCount > 5` | 変更なし                                                          |
| `context-high`     | `pct >= 80 && < 95`                         | `tokenCount >= auto && tokenCount < hard`                           | 変更なし                                                          |
| `context-critical` | `pct >= 95`                                 | `tokenCount >= hard`                                                | 新しい hard 層の動作を反映するため、`「Auto-compact will force on next send.」`を追加 |

**トリガー頻度への影響:**

- 主パス（auto が正常に動作）: `tokenCount` が auto を超えるとすぐに圧縮がトリガーされ、次のラウンドで `tokenCount` が減少するため、`context-high` は「トリガーから圧縮が有効になるまでの間」のみ短時間表示される
- エッジパス（auto 失敗 / サーキットブレーカー / リアクティブが間に合わない）: `tokenCount` が上昇し続け、warn → auto → hard と順に 3 つの tip がトリガーされる。ユーザーから見ると「コンテキストがどんどん緊迫している」と一貫して感じられる
- `context-critical` がトリガーされるとき、hard 層はすでに send 前に force compress を実行している（仕様「トリガー連鎖の変更」節を参照）。そのため、この tip は実質的に「post-rescue 通知」であり「pre-rescue 警告」ではない。文言にその旨を補足する

`TipContext` インターフェースに以下を追加:

```ts
export interface TipContext {
  lastPromptTokenCount: number;
  contextWindowSize: number;
  sessionPromptCount: number;
  sessionCount: number;
  platform: string;
  // 新規: isRelevant 関数が閾値を取得できるようにする。
  // computeThresholds は呼び出し側で計算して注入する。tipRegistry が core に直接依存するのを避けるため。
  thresholds?: CompactionThresholds;
}
```

`AppContainer.tsx:1150` で `TipContext` を構築する際に同時に注入する。

### /context コマンドの同期 (`contextCommand.ts:177-183`)

```ts
// ハードコードされた (1 - threshold) * contextWindowSize を置き換え
const { warn, auto, hard, effectiveWindow } =
  computeThresholds(contextWindowSize);

// 4 行を表示:
//   Effective window:   180K   (window − 20K reserve)
//   Warn threshold:     147K   (...)
//   Auto threshold:     167K   ← 現在位置
//   Hard threshold:     177K
// 現在の token count がどの tier にあるかをマークする
```

### フッターでの継続的な表示（オプションの follow-up）

本仕様ではフッターでの継続的な表示は強制しない。理由:

- 既存の tip システムで history 内にヒントを表示できる
- フッターでの継続表示は ink レンダリングの変更と再描画頻度の増加が必要
- 本仕様の後続 follow-up（独立した PR）として対応可能

もし将来実装する場合は、トリガー条件を `tokenCount >= warn && tokenCount < auto` とし、auto を超えたら非表示にする（圧縮が開始されたため）ことを推奨する。

## テストカバレッジ

### ユニットテスト（chatCompressionService.test.ts）

- `computeThresholds(32K)` → 割合フォールバックブランチ（warn/auto とも pct、hard は退行）
- `computeThresholds(128K)` → 混合ブランチ（warn=pct, auto=abs, hard=abs）
- `computeThresholds(200K)` → 絶対値支配ブランチ（warn/auto/hard とも abs）
- `computeThresholds(1M)` → 全絶対値ブランチ
- `computeThresholds(window=10K)` → 極小ウィンドウ（絶対値がすべて負になる）、式が崩れないこと
- 3 層の閾値が常に `warn <= auto <= hard` を満たすこと
- max() の式が境界点（`pct * window == abs`）で安定していること

### ユニットテスト（tokenEstimation.test.ts）

- `estimateContentTokens` がプレーンテキスト / json / functionCall / functionResponse / image / document に対してそれぞれ適切な bytesPerToken を使用すること
- `estimatePromptTokens` が `lastPromptTokenCount > 0` の場合に「主パス」、0 の場合に「初回パス」を実行すること
- 大きなユーザーメッセージが cheap-gate 段階で追加され、auto 閾値を超えること
- 推定値と実際の API usage の乖離が ±30% 以内であること（実際の履歴サンプルによる回帰テスト）

### 統合テスト（geminiChat.test.ts / chatCompressionService.test.ts）

- 3 回連続失敗後、cheap-gate が NOOP を返すこと；次の force 呼び出しで復帰すること
- 単一の失敗で永久ロックにならないこと
- 推定トークンが hard を超えた場合、send で自動的に force compress が実行されること
- 圧縮 sideQuery 呼び出しで `maxOutputTokens = COMPACT_MAX_OUTPUT_TOKENS` が `runSideQuery` に正しく伝達され、`thinkingConfig.includeThoughts` が `false` であること（または sideQuery のデフォルト値で上書きされること）
- **初回カバレッジ**: `lastPromptTokenCount = 0` だが履歴が巨大なチャット（`--continue` での復元をシミュレート）を構築し、初回 send で auto 閾値が推定パスによってトリガーされること

### 互換性テスト

- `contextPercentageThreshold = 0.5` を設定して起動 → stderr に警告 + フィールドが無視され、動作は内部 PCT 定数に従うこと

### Tip システムテスト（tipRegistry.test.ts）

- 3 つの context-\* tip が warn/auto/hard をまたぐときに正しくトリガーされ、区間が重複しないこと
- 主パスでは auto 閾値が圧縮をトリガーした後、`context-high` が継続して表示されないこと
- エッジパス（サーキットブレーカー + トークン上昇継続）では 3 つの tip が順にトリガーされること
- TipContext に `thresholds` がない場合（フォールバック）の動作が妥当であること

## 実装フェーズ

| Phase | 内容                                                                                             | 独立性               |
| ----- | ------------------------------------------------------------------------------------------------ | -------------------- |
| 1     | 内部定数 + `computeThresholds` + cheap-gate 変更（推定補償は含まない）                             | 独立マージ可能       |
| 2     | 失敗処理のアップグレード（1 → 3 サーキットブレーカー）                                           | 独立マージ可能       |
| 3     | hard 層の force compress 先行実行                                                                | P1 + P7 に依存       |
| 4     | 設定面の変更 + breaking change 警告                                                              | P1 に依存            |
| 5     | UI（tip 書き換え + /context）                                                                    | P1 に依存            |
| 6     | 圧縮 sideQuery で thinking を無効化 + `maxOutputTokens` 上限追加                                 | 独立して P1 より先にマージ可能 |
| 7     | トークン推定補償（`estimateContentTokens` + `estimatePromptTokens`、cheap-gate / hard に適用） | 独立して P1 と並行して進められる |

各 Phase は独立した PR として発行可能。推奨マージ順序: **P6 → P7 → P1 → P2 → P4 → P3 → P5**。まず圧縮呼び出しに `maxOutputTokens` 上限を適用し（バッファ仮定を信頼できるものにする）、次に推定補償を追加し（トークン数の判定の信頼性を高める）、その後に閾値の基盤を導入し、失敗サーキットブレーカー、設定面の変更を行い、最後に hard 層の能動的救済を有効にする（この時点で信頼できるトークン数 + サーキットブレーカーが整っている）。各 PR は独立に検証・ロールバックが可能。

## リスクと注意事項

1. **thinking を無効にすることで要約品質が低下する可能性がある。** 元の作者のコメント "Compression quality drives every subsequent main turn — keep reasoning on" はこの懸念を示している。本仕様の判断は「予測可能なトークン上限」を「品質の最大化」より優先するというものだが、実装後は telemetry の `compression_input_token_count` / `compression_output_token_count` の分布、および主対話における圧縮後の品質変化（ユーザーフィードバック、`COMPRESSION_FAILED_*` ステータス率）を観測する必要がある。品質の低下が顕著な場合は、thinking 有効 + provider-specific な thinkingBudget 制御に戻すことを検討する。

2. **`maxOutputTokens` に達すると summary が途中で切れる可能性がある。** thinking を無効にした後、20K は summary 本体を直接制限する。claude-code の実測値 p99.99 ≈ 17K であり、約 3K の安全余裕が残る。しかし qwen-code の圧縮プロンプトは claude-code と異なるため、分布を観測する必要がある。圧縮失敗ブランチ（[chatCompressionService.ts:464-491](packages/core/src/services/chatCompressionService.ts:464)）に「finish_reason = MAX_TOKENS を検出した場合の NOOP パス」を追加し、中途半端な summary が永続化されるのを防ぐことを推奨する。

3. **プロバイダ間の maxOutputTokens マッピングの違い。** OpenAI compat (dashscope) → `max_tokens`、Anthropic → `max_tokens`、Gemini SDK → `maxOutputTokens`。現在の qwen-code はこのマッピングを既に持っている（[contentGenerator.ts:94](packages/core/src/core/contentGenerator.ts:94) など）。P6 実装時に、sideQuery パスで `maxOutputTokens` フィールドがすべてのプロバイダのリクエストボディに正しく伝達されることを確認する必要がある。

4. **トークン推定は大まかな下界であり、「トリガーをスキップする」方向の判断に使用してはならない。** `char/4` と各プロバイダの実際のトークナイザーとの乖離は ±30% の可能性がある。本仕様では推定を「閾値をより早くトリガーする」ためにのみ使用する（false-positive 方向、早めに圧縮するほうが安全）。「トークン数を減らす / 圧縮をスキップする」コードパスでは、引き続き `lastPromptTokenCount`（API の権威値）を使用する必要がある。

5. **推定関数と既存の `estimateContentChars` の関係。** [compactionInputSlimming.ts](packages/core/src/services/compactionInputSlimming.ts) には既に `estimateContentChars`（圧縮分割ポイントの計算に使用）が存在する。新しく追加する `estimateContentTokens` は、これを再利用して（bytesPerToken で割る）実装し、2 つの推定方式が乖離しないようにする必要がある。

## 本仕様の対象外

- Env 変数オーバーライド経路（D 案）: 「設定面を最小限に」の原則を維持
- フッター常時表示: follow-up に残す
- 要約プロンプトの改善、`MIN_COMPRESSION_FRACTION` の調整: 閾値設計とは直交する

## 未解決の問題（レビュー待ち）

1. **breaking change の強度**: 警告 + フィールド無視 vs 起動エラー。現在は警告を選択。企業デプロイ / チーム設定に対して十分に親切かどうか確認が必要

## クローズ済み

2. **小さいウィンドウ（≤ 約76.7K）では hard と auto が同じ値に退行する** — `/context` で明示しないことを決定。理由:
   - 退行する範囲は 32K だけではない。`effectiveWindow - HARD_BUFFER ≤ 0.7 × window` となるすべてのウィンドウで退行する（64K も含む）
   - ユーザーの動作は変わらない: 退行ウィンドウでは `currentTier` は `'auto'` をスキップして `'hard'` を報告する（`contextCommand.ts:43-44` で `>= hard` を先にチェック）。`context-high` バンド（`auto ≤ t < hard`）は空帯域になる。小さいウィンドウで 1 段階のヒントが減るのは妥当である——ウィンドウ自体が小さく、ユーザーはおそらく手動でコンテキストを管理する
   - 将来、実際のユーザーから「小さいウィンドウで中間段階のヒントが見えない」という報告があれば、その時点で UI に注釈を追加するか、`context-high` のトリガー条件を調整するかを決定する（これは UI の作業であり、仕様の作業ではない）。現時点では UI の複雑さを増やさない選択をする