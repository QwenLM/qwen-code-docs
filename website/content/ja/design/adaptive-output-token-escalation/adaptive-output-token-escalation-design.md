# 適応的出力トークンエスカレーション設計

> 出力トークンに対する「低いデフォルト＋切り捨て時にエスカレーション」戦略と、エスカレーション後も上限を超えた応答へのマルチターン回復により、GPU スロットの過剰予約を約 4 倍削減します。

## 問題

すべての API リクエストは `max_tokens` に比例した固定 GPU スロットを予約します。以前のデフォルト値 32K トークンでは、各リクエストが 32K の出力スロットを予約しますが、実際には 99% の応答は 5K トークン未満です。これにより GPU キャパシティが 4〜6 倍過剰予約され、サーバーの同時実行数が制限されてコストが増大します。

## 解決策

出力トークンのデフォルト上限を **8K** に設定します。応答が切り捨てられた場合（モデルが `max_tokens` に達した場合）：

1. モデルの最大出力上限まで**エスカレーション**する（未知のモデルの場合は 64K をフロアとして使用）
2. それでも切り捨てられる場合、部分応答をヒストリに保持して継続メッセージを注入する**回復**を最大 3 回実行する
3. 回復が尽きた場合は、ツールスケジューラの切り捨てガイダンスにフォールバックする

実際に切り捨てられるリクエストは 1% 未満なので、長い応答の出力品質を維持しつつ、平均スロット予約量を大幅に削減できます。

## アーキテクチャ

```
Request (max_tokens = 8K)
│
▼
┌─────────────────────────┐
│  Response truncated?     │──── No ──▶ Done ✓
│  (MAX_TOKENS)            │
└───────────┬──────────────┘
            │ Yes
            ▼
┌──────────────────────────────────────────────────┐
│  Layer 1: Escalate to model output limit         │
│  ┌────────────────────────────────────────────┐  │
│  │ Pop partial response from history          │  │
│  │ RETRY (isContinuation: false → reset UI)   │  │
│  │ Re-send at max(64K, model output limit)    │  │
│  └────────────────────────────────────────────┘  │
└───────────┬──────────────────────────────────────┘
            │
            ▼
┌─────────────────────────┐
│  Still truncated?        │──── No ──▶ Done ✓
│  (MAX_TOKENS)            │
└───────────┬──────────────┘
            │ Yes
            ▼
┌──────────────────────────────────────────────────┐
│  Layer 2: Multi-turn recovery (up to 3×)         │
│  ┌────────────────────────────────────────────┐  │
│  │ Keep partial response in history           │  │
│  │ Push user message: "Resume directly..."    │  │
│  │ RETRY (isContinuation: true → keep UI buf) │  │
│  │ Re-send with updated history               │  │
│  │ Model continues from where it left off     │  │
│  └──────────────┬─────────────────────────────┘  │
│                 │                                 │
│          ┌──────┴──────┐                          │
│          │ Succeeded?  │── Yes ──▶ Done ✓         │
│          └──────┬──────┘                          │
│                 │ No (still truncated)            │
│                 ▼                                 │
│          attempt < 3? ── Yes ──▶ loop back ↑      │
└───────────┬──────────────────────────────────────┘
            │ No (exhausted)
            ▼
┌──────────────────────────────────────────────────┐
│  Layer 3: Tool scheduler fallback                │
│  ┌────────────────────────────────────────────┐  │
│  │ Reject truncated Edit/Write tool calls     │  │
│  │ Return guidance: "You MUST split into      │  │
│  │ smaller parts — write skeleton first,      │  │
│  │ then edit incrementally."                  │  │
│  └────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────┘
```

## トークン上限の決定

有効な `max_tokens` は以下の優先順位で解決されます：

| 優先度 | ソース | 値（既知のモデル） | 値（未知のモデル） | エスカレーション動作 |
| ----------- | ---------------------------------------------------- | ---------------------------- | --------------------- | ----------------------------------------------- |
| 1（最高） | ユーザー設定（`samplingParams.max_tokens`） | `min(userValue, modelLimit)` | `userValue` | エスカレーションなし |
| 2 | 環境変数（`QWEN_CODE_MAX_OUTPUT_TOKENS`） | `min(envValue, modelLimit)` | `envValue` | エスカレーションなし |
| 3（最低） | キャップ付きデフォルト | `min(modelLimit, 8K)` | `min(32K, 8K)` = 8K | モデル上限までエスカレーション（64K フロア）＋回復 |

「既知のモデル」とは `OUTPUT_PATTERNS` に明示的なエントリが存在するモデル（`hasExplicitOutputLimit()` で確認）です。既知のモデルでは、API エラーを避けるため有効値は常にモデルの宣言上限でキャップされます。未知のモデル（カスタムデプロイメント、セルフホストエンドポイント）は、バックエンドがより大きな上限をサポートする可能性があるため、ユーザーの値をそのまま渡します。

このロジックは 3 つのコンテンツジェネレーターに実装されています：

- `DefaultOpenAICompatibleProvider.applyOutputTokenLimit()` — OpenAI 互換プロバイダー
- `DashScopeProvider` — デフォルトプロバイダーから `applyOutputTokenLimit()` を継承
- `AnthropicContentGenerator.buildSamplingParameters()` — Anthropic プロバイダー

## エスカレーションメカニズム

エスカレーションロジックは `geminiChat.ts` に実装されており、メインのリトライループの**外側**に配置されています。これは意図的な設計です：

1. リトライループは一時的なエラー（レート制限、無効なストリーム、コンテンツ検証）を処理する
2. 切り捨てはエラーではなく、短く終わった成功応答である
3. エスカレーション済みストリームからのエラーはリトライロジックに捕捉されず、呼び出し元に直接伝播すべき

### エスカレーション手順（geminiChat.ts）

```
1. Stream completes successfully (lastError === null)
2. Last chunk has finishReason === MAX_TOKENS
3. Guard checks pass:
   - maxTokensEscalated === false (prevent infinite escalation)
   - hasUserMaxTokensOverride === false (respect user intent)
4. Compute escalated limit: max(ESCALATED_MAX_TOKENS, tokenLimit(model, 'output'))
5. Pop the partial model response from chat history
6. Yield RETRY event (isContinuation: false) → UI discards partial output and resets buffers
7. Re-send the same request with maxOutputTokens: escalatedLimit
```

### リカバリ手順（geminiChat.ts）

エスカレーション済み応答も切り捨てられた場合（finishReason === MAX_TOKENS）、回復ループが `MAX_OUTPUT_RECOVERY_ATTEMPTS`（3）回まで実行されます：

```
1. Partial model response is already in history (pushed by processStreamResponse)
2. Push a recovery user message: OUTPUT_RECOVERY_MESSAGE
3. Yield RETRY event (isContinuation: true) → UI keeps text buffer for continuation
4. Re-send with updated history (model sees its partial output + recovery instruction)
5. If still truncated and attempts remain, loop back to step 1
6. If recovery attempt throws (empty response, network error):
   - Pop the dangling recovery message from history
   - Break out of recovery loop
```

### RETRY 時の状態クリーンアップ（turn.ts）

`Turn` クラスが RETRY イベントを受け取ると、不整合を防ぐために累積状態をクリアします：

- `pendingToolCalls` — 最初の切り捨て応答に含まれた完了済みツール呼び出しがエスカレーション応答で繰り返された場合の重複を防ぐためクリア
- `pendingCitations` — 重複引用を防ぐためクリア
- `finishReason` — 新しい応答の終了理由が使用されるよう `undefined` にリセット

`isContinuation` フラグは UI に渡され、テキストバッファをリセットするか（エスカレーション）保持するか（回復）を決定します。

## 定数

`geminiChat.ts` と `tokenLimits.ts` で定義されています：

| 定数 | 値 | 目的 |
| ------------------------------ | ------ | ------------------------------------------------------- |
| `CAPPED_DEFAULT_MAX_TOKENS` | 8,000 | ユーザー上書きがない場合のデフォルト出力トークン上限 |
| `ESCALATED_MAX_TOKENS` | 64,000 | エスカレーションのフロア（モデル上限が不明な場合に使用） |
| `MAX_OUTPUT_RECOVERY_ATTEMPTS` | 3 | エスカレーション後のマルチターン回復の最大試行回数 |

有効なエスカレーション上限は `max(ESCALATED_MAX_TOKENS, tokenLimit(model, 'output'))` です：

| モデル | エスカレーション上限 |
| ---------------- | --------------- |
| Claude Opus 4.6 | 131,072 (128K) |
| GPT-5 / o-series | 131,072 (128K) |
| Qwen3.x | 65,536 (64K) |
| 未知のモデル | 64,000 (フロア) |

## 設計上の決定

### なぜデフォルトを 8K にするのか？

- 99% の応答は 5K トークン未満
- 8K は不必要なリトライを発生させずに、やや長い応答に十分な余裕を提供する
- 平均スロット予約を 32K から 8K に削減（4 倍の改善）

### なぜ固定 64K ではなくモデル上限にエスカレーションするのか？

- より高い出力上限を持つモデル（Claude Opus 128K、GPT-5 128K）が不必要に 64K に制限されていた
- モデルの実際の上限を使用することで、2 回目のリトライなしにほぼすべての長い出力をカバーできる
- `ESCALATED_MAX_TOKENS`（64K）は `tokenLimit()` がデフォルト 32K を返す未知のモデルのフロアとして機能する

### なぜ段階的エスカレーションではなくマルチターン回復なのか？

- 段階的エスカレーション（8K → 16K → 32K → 64K）は毎回完全な応答の再生成が必要
- マルチターン回復は部分応答を保持してモデルが続きから再開でき、トークンとレイテンシを節約できる
- 回復メッセージはコストが低い（各約 40 トークン）のに対し、大きな応答の再生成は高コスト
- 3 回の試行制限により無限ループを防ぎつつ、ほぼすべての実用的なケースをカバーする

### なぜエスカレーションはリトライループの外側にあるのか？

- 切り捨てはエラーではなく成功ケース
- エスカレーション済みストリームからのエラー（レート制限、ネットワーク障害）は、誤ったパラメーターで暗黙的にリトライされるのではなく直接伝播すべき
- リトライループを本来の目的（一時的エラーの回復）に集中させる
- 回復エラーは会話全体の中断を避けるため別途捕捉される