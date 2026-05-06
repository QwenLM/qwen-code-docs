# 適応型出力トークンエスカレーション設計

> 出力トークンに対して「低デフォルト + 切り捨て時にエスカレーション」戦略を採用し、GPUスロットの過剰予約を約4倍削減します。エスカレーション後の制限値を超えた応答に対しては、マルチターンリカバリ機能を提供します。

## 課題

各APIリクエストは `max_tokens` に比例した固定のGPUスロットを予約します。以前のデフォルト値である32Kトークンでは、各リクエストが32Kの出力スロットを予約していましたが、実際の応答の99%は5Kトークン未満です。これによりGPU容量が4〜6倍過剰に予約され、サーバーの同時実行数が制限され、コストが増加していました。

## 解決策

出力トークンのデフォルト値を **8K** に上限設定します。応答が切り捨てられた場合（モデルが `max_tokens` に到達した場合）：

1. モデルの最大出力制限まで**エスカレーション**する（不明なモデルの場合は64Kを下限とする）
2. それでも切り捨てられる場合は、部分的な応答を履歴に残し、継続メッセージを挿入して**リカバリ**する（最大3回まで）
3. リカバリ試行が尽きた場合は、ツールスケジューラの切り捨てガイダンスにフォールバックする

実際に切り捨てられるリクエストは1%未満であるため、平均スロット予約量を大幅に削減しつつ、長い応答の出力品質も維持できます。

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

## トークン制限値の決定

有効な `max_tokens` は、以下の優先順位で解決されます：

| 優先度      | ソース                                               | 値（既知のモデル）           | 値（不明なモデル）    | エスカレーション動作                            |
| ----------- | ---------------------------------------------------- | ---------------------------- | --------------------- | ----------------------------------------------- |
| 1（最高）   | ユーザー設定 (`samplingParams.max_tokens`)           | `min(userValue, modelLimit)` | `userValue`           | エスカレーションなし                            |
| 2           | 環境変数 (`QWEN_CODE_MAX_OUTPUT_TOKENS`)             | `min(envValue, modelLimit)`  | `envValue`            | エスカレーションなし                            |
| 3（最低）   | 上限付きデフォルト                                   | `min(modelLimit, 8K)`        | `min(32K, 8K)` = 8K   | モデル制限までエスカレーション（64K下限）+ リカバリ |

「既知のモデル」とは、`OUTPUT_PATTERNS` に明示的なエントリを持つモデルのことです（`hasExplicitOutputLimit()` で確認）。既知のモデルの場合、APIエラーを回避するため、有効値は常にモデルが宣言した出力制限値に上限設定されます。不明なモデル（カスタムデプロイメント、セルフホストエンドポイントなど）は、バックエンドがより大きな制限値をサポートしている可能性があるため、ユーザーの値をそのまま透過します。

このロジックは、以下の3つのコンテンツジェネレータに実装されています：

- `DefaultOpenAICompatibleProvider.applyOutputTokenLimit()` — OpenAI互換プロバイダ
- `DashScopeProvider` — デフォルトプロバイダから `applyOutputTokenLimit()` を継承
- `AnthropicContentGenerator.buildSamplingParameters()` — Anthropicプロバイダ

## エスカレーションメカニズム

エスカレーションロジックは `geminiChat.ts` に実装され、メインのリトライループの**外側**に配置されています。これは意図的な設計です：

1. リトライループは一時的なエラー（レート制限、無効なストリーム、コンテンツ検証）を処理する
2. 切り捨てはエラーではなく、途中で終了した成功応答である
3. エスカレーション後のストリームからのエラーは、リトライロジックで捕捉せず、呼び出し元に直接伝播させるべきである

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

エスカレーション後の応答も切り捨てられた場合（`finishReason === MAX_TOKENS`）、リカバリーループは `MAX_OUTPUT_RECOVERY_ATTEMPTS`（3）回まで実行されます：

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

### RETRY時の状態クリーンアップ（turn.ts）

`Turn` クラスが RETRY イベントを受信すると、不整合を防ぐために蓄積された状態をクリアします：

- `pendingToolCalls` — 最初の切り捨てられた応答に含まれていた完了済みツール呼び出しがエスカレーション後の応答で重複して実行されるのを防ぐためにクリア
- `pendingCitations` — 引用の重複を防ぐためにクリア
- `debugResponses` — 古いデバッグデータが残るのを防ぐためにクリア
- `finishReason` — 新しい応答の終了理由が使用されるように `undefined` にリセット

`isContinuation` フラグはUIに渡され、テキストバッファをリセットするか（エスカレーション）、保持するか（リカバリ）を決定できるようにします。

## 定数

`geminiChat.ts` および `tokenLimits.ts` で定義されています：

| 定数                           | 値     | 目的                                                    |
| ------------------------------ | ------ | ------------------------------------------------------- |
| `CAPPED_DEFAULT_MAX_TOKENS`    | 8,000  | ユーザーによる上書き設定がない場合のデフォルト出力トークン制限 |
| `ESCALATED_MAX_TOKENS`         | 64,000 | エスカレーションの下限値（モデルの制限値が不明な場合に使用） |
| `MAX_OUTPUT_RECOVERY_ATTEMPTS` | 3      | エスカレーション後のマルチターンリカバリの最大試行回数      |

有効なエスカレーション後の制限値は `max(ESCALATED_MAX_TOKENS, tokenLimit(model, 'output'))` です：

| モデル           | エスカレーション後の制限値 |
| ---------------- | --------------- |
| Claude Opus 4.6  | 131,072 (128K)  |
| GPT-5 / o-series | 131,072 (128K)  |
| Qwen3.x          | 65,536 (64K)    |
| 不明なモデル     | 64,000（下限）  |

## 設計上の判断

### デフォルトを8Kにした理由

- 応答の99%が5Kトークン未満である
- 8Kであれば、不要なリトライを発生させることなく、やや長い応答に対して適切な余裕を持たせられる
- 平均スロット予約量を32Kから8Kに削減（4倍の改善）

### 固定の64Kではなくモデルの制限値までエスカレーションする理由

- 出力制限値が高いモデル（Claude Opus 128K、GPT-5 128Kなど）が不要に64Kに制限されていた
- モデルの実際の制限値を使用することで、2回目のリトライなしに大半の長い出力をカバーできる
- `ESCALATED_MAX_TOKENS`（64K）は、`tokenLimit()` がデフォルトの32Kを返す不明なモデルに対する下限値として機能する

### 段階的エスカレーションではなくマルチターンリカバリを採用する理由

- 段階的エスカレーション（8K → 16K → 32K → 64K）では、毎回応答全体を再生成する必要がある
- マルチターンリカバリは部分的な応答を保持し、モデルに継続させることで、トークンとレイテンシを節約できる
- リカバリメッセージは、大規模な応答を再生成する場合に比べてコストが低い（各約40トークン）
- 3回の試行制限により、無限ループを防ぎつつ、実用上の大半のケースをカバーできる

### エスカレーションをリトライループの外側に配置する理由

- 切り捨てはエラーではなく、成功ケースである
- エスカレーション後のストリームからのエラー（レート制限、ネットワーク障害など）は、誤ったパラメータでサイレントにリトライされるのではなく、直接伝播されるべきである
- リトライループを本来の目的（一時的なエラーのリカバリ）に集中させられる
- リカバリ時のエラーは個別に捕捉され、会話全体が中断されるのを防ぐ