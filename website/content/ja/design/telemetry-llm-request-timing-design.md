# LLMリクエストタイミング分解設計 (P3 フェーズ4)

> Issue #3731 — 階層型セッショントレーシングのフェーズ4。`qwen-code.llm_request` スパンに time-to-first-token、リクエストセットアップ時間、サンプリング時間、試行ごとのリトライテレメトリを追加し、オペレーターが「なぜこのLLM呼び出しは遅かったのか？」を推測なしに分析できるようにする。
>
> フェーズ1 (#4126)、フェーズ1.5 (#4302)、フェーズ2 (#4321) に基づく。フェーズ3 (#4410、レビュー中) とは独立しているが、フェーズ4の試行ごとのフィールドがサブエージェントサブツリー配下でクリーンに集計できるよう、フェーズ3を先にリリースすることを推奨する。

## 問題

現状の `qwen-code.llm_request` スパンには `model`、`prompt_id`、`input_tokens`、`output_tokens`、`success`、`error`、`duration_ms` しか含まれていない。単一のトレースを読んでも以下を判断できない:

1. **`duration_ms` のうちどれだけがモデルの思考時間でどれだけがネットワークセットアップ時間か。** 12秒の `duration_ms` は「11秒のリトライ＋1秒の高速生成」かもしれないし、「100msのセットアップ＋12秒の低速ストリーミング」かもしれないが、トレースからは分からない。
2. **ユーザーが最初のトークンを受け取ったタイミング。** TTFT (time-to-first-token) はチャットUIの標準レイテンシSLOだが、取得も計測もできていない。
3. **リトライ中に何が起きたか。** `retryWithBackoff` (`utils/retry.ts:285`) は `debugLogger.warn` を呼ぶだけで、OTelイベントもスパン属性もない。これを通る4つのLLM呼び出しサイト (`client.ts:1540`、`baseLlmClient.ts:193,282`、`geminiChat.ts:1039`) はトレースにもメトリクスにもリトライの可視性がゼロ。`ContentRetryEvent` は `geminiChat.ts:806,830` 内のコンテンツ復旧リトライには存在するが、より一般的なレート制限/5xx リトライには存在しない。
4. **`api.request.breakdown` がデッドコードであること。** このメトリクスは `metrics.ts:242-251` で4つの `ApiRequestPhase` 値として定義され、`index.ts:117` からエクスポートされ、`metrics.test.ts:646-675` でテストされているが、本番コードで `recordApiRequestBreakdown()` を呼び出す箇所がゼロ。メトリクスのインフラは用意されているが、データフローは接続されていなかった。

これらのギャップにより、`qwen-code.llm_request` はトレースツリーの中で最も情報量の少ないスパンとなっている。ツールスパン (#4126/#4321) やサブエージェントスパン (#4410) はライフサイクルフェーズを公開しているが、LLMスパンはリクエスト全体を一つの不透明な duration に押しつぶしている。

## 変更しない既存の面

| コンポーネント                                               | 場所                                                             | 変更しない理由                                                                                                                                                                                              |
| ------------------------------------------------------------ | ---------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| LLMリクエストスパンライフサイクル                            | `session-tracing.ts` `startLLMRequestSpan` / `endLLMRequestSpan` | フェーズ1 (#4126) でヘルパーが確立された。メタデータインターフェースを拡張するが、構造は変更しない                                                                                                        |
| プロバイダージェネレーターへのアクティブスパン伝播           | `loggingContentGenerator.ts:213,287`                             | フェーズ1 (#4126) で `withSpan('api.*')` をネイティブヘルパーに置き換えた。アクティブコンテキストはすでにストリームラッパーに届いている                                                                   |
| `ContentRetryEvent` スキーマ＋コンシューマー                 | `types.ts:626`、`qwen-logger.ts:947`、`loggers.ts:717`           | 既存のイベントはその形状とダウンストリームを維持する。`retryWithBackoff` パス用に兄弟イベントクラスを追加する                                                                                              |
| `LogToSpanProcessor` ログブリッジスパン                      | `log-to-span-processor.ts`                                       | ContentRetryEvent の既存ブリッジはアクティブなLLMスパン配下へのネストを継続する。フェーズ4はこれを変更しない                                                                                              |
| `ApiRequestPhase` enum                                       | `metrics.ts:330-334`                                             | パブリックな面 (4値)。本番コードから4値のうち3値を設定する。後方互換性のためenumは変更しない                                                                                                              |
| プロバイダーごとのチャンク正規化 → `GenerateContentResponse` | `loggingContentGenerator.ts:286-393`                             | 各プロバイダーはすでにGoogleの `GenerateContentResponse` 形状に正規化してからLoggingContentGeneratorに渡す。TTFT検出はこの正規化済み形状に対して集中的に行われるため、プロバイダーごとのコードは不要     |
| `retryWithBackoff` 汎用リトライ                              | `utils/retry.ts:140`                                             | LLM呼び出し元と非LLM (`channels/weixin/src/api.ts`) の両方で使用されている。LLMテレメトリへのハードカップリングの代わりに、オプトインの `onRetry` コールバックで拡張する                                  |
| 非ストリーミング `generateContent`                           | `loggingContentGenerator.ts:212`                                 | 非ストリーミングではTTFTは無意味なため、新しいフィールドは `undefined` のままとなる。スパンライフサイクルと既存の属性は変更なし                                                                           |

## スコープ外 (延期)

- **SDKレベルのリトライ** (openai SDK `maxRetries=3`、google-genai SDK内部リトライ)。これらはサードパーティSDK内で完結するため、観測するにはSDKリトライを無効化して `retryWithBackoff` で再実装する必要がある。フェーズ4の対象外。
- **トークンごとのストリーミングメトリクス** (トークン間レイテンシ、チャンクサイズ)。推論エンジンのパフォーマンスデバッグには有用だが、フェーズ4が対象とするユーザー体感レイテンシの問題には該当しない。
- **思考/reasoningブロックの別途TTFT。** 「最初のトークン」には思考コンテンツが含まれる (D1参照)。将来の拡張として `ttft_to_reasoning_ms` と `ttft_to_answer_ms` の分割が可能だが、需要が確認されてから対応する。
- **専用子スパンとしてのサンプリングフェーズ。** `duration_ms - ttft_ms - request_setup_ms` で算出可能。子スパンはOTelのみのバックエンドでは何も追加しない (claude-code はPerfettoのみ使用)。スパン属性として保存する — D6参照。
- **永続的リトライモード (`QWEN_CODE_UNATTENDED_RETRY`) のイベントレベルのレート制限。** 単一のLLMリクエストで50件以上の `ContentRetryEvent` / `ApiRetryEvent` レコードが発生する可能性がある。フェーズ4ではすべてのイベントを送出する。本番ボリュームが問題になった場合は、スパンごとの送出上限と「+N件以上の試行 (切り捨て)」サマリーイベントをフォローアップPRで追加する。
- **`TOKEN_PROCESSING` フェーズ。** enum値は存在するが、qwen-codeはポストストリームのローカル処理が実質的に計測する価値がない (<10ms 典型)。本番呼び出し元ではスキップ。enum値は将来の利用のために保持する。
- **`ContentRetryEvent` をLLMスパンのスパンイベントに移行すること。** フェーズ3の `subagent_execution` LogRecordと同じ理由: 既存コンシューマー (qwen-logger RUM、将来のメトリクス) がLogRecordに密結合している。ブリッジスパンのカバレッジで十分。

## 参考文献 (意思決定の根拠)

| ソース                                                                                                                      | 主な知見                                                                                                                                                                                                                                                                                                                             |
| --------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| claude-code (Anthropic) `claude.ts:1762, 1789, 1982, 2882`                                                                  | TTFTは `message_start` SSEイベントで `Date.now() - start` として取得。`start` はリトライ試行ごとにリセット。`requestSetupMs = start - startIncludingRetries`。`attemptStartTimes` 配列は試行ごとに保持。アプローチの実現可能性を確認。TTFTのセマンティクスは「最初のストリームイベント」(qwen-codeは「最初のコンテンツ」に相違 — D1参照) |
| claude-code `perfettoTracing.ts:549-671`                                                                                    | Request Setup → Attempt N (リトライ) → First Token → Sampling をネストされたB/Eペアとしてレンダリング。視覚的な分解を示す。qwen-codeはPerfettoがないため、OTel属性で同様の分解を行う                                                                                                                                              |
| claude-code `sessionTracing.ts:447`                                                                                         | OTelスパンには `ttft_ms` のみが付与される (`requestSetupMs`、`samplingMs`、試行ごとのタイミングはなし)。qwen-codeはスパンにより多くの情報を意図的に付与する — claude-codeは可視化にPerfettoを持つが、qwen-codeには存在しない                                                                                                       |
| opencode (sst/opencode) `session/llm.ts`、`route/client.ts`                                                                 | TTFT計測なし。単一の `LLM.run` EffectスパンですべてをカバーするAこのギャップが競合ツールにも存在することを確認。参考実装としては不適切                                                                                                                                                                                             |
| [OTel GenAI Semantic Conventions](https://opentelemetry.io/docs/specs/semconv/gen-ai/) (ステータス: 開発中/実験的)          | `gen_ai.usage.input_tokens` (Stable)、`gen_ai.usage.output_tokens` (Stable)、`gen_ai.usage.cached_tokens` (Experimental)、`gen_ai.request.model` (Stable)、`gen_ai.server.time_to_first_token` (Experimental、double型の秒)。デュアルエミットパターンは #4410 の先例に倣う                                                         |
| [OTel Trace Spec — Span Events](https://opentelemetry.io/docs/specs/otel/trace/api/#add-events)                             | 「スパン属性として取得する方が適切な情報にはイベントを使用すべきでない。」試行ごとの情報はLLMスパン属性＋ログブリッジスパンに属し、親のスパンイベントとしてではないことを確認                                                                                                                                                  |
| フェーズ3設計文書 (`telemetry-subagent-spans-design.md`)                                                                    | デュアルエミットパターン (`qwen-code.subagent.id` + `gen_ai.agent.id`) と「プライベート名が正規」ルールを確立した。フェーズ4はTTFTとトークンフィールドについて同じ規約に従う                                                                                                                                                       |

## 設計 — 7つの決定とその根拠

### D1 — TTFTのセマンティクス: 「ユーザーが見える最初のコンテンツを含むチャンク」

TTFTは**成功した試行の**リクエスト送信から**ユーザーが見える出力を含む最初のストリームチャンク**までのウォールクロック時間を計測する。チャンクが「ユーザーが見える」とは、`candidates[0].content.parts` に含まれる正規化された `Part` が以下のいずれかの場合:

- `text`: 空でない文字列
- `functionCall` (ツール使用)
- `inlineData` (画像、バイナリ)
- `executableCode`
- `thought` / reasoningコンテンツ (プロバイダーが公開するもの — Geminiの `thought`、Anthropicの `<thinking>` ブロック、OpenAI o1 reasoningチャンク)

`role` メタデータのみ、または `usageMetadata` のみ (最終的な使用サマリーチャンク) を含むチャンクはTTFTをトリガーしない。

**「任意の種類の最初のストリームイベント」(claude-codeの選択) としない理由**: claude-codeはAnthropicプロセス固有のメタデータイベントである `message_start` でTTFTを計測している。これは実際のコンテンツより50〜300ms前に発火する。claude-codeの内部 `headlessProfiler.ts` は「ユーザーが何かを見た」というセマンティクスのために `time_to_first_response_ms` を別途分離しており、この区別を認識している。qwen-codeは複数のプロバイダー (Anthropic、OpenAI、Gemini、Qwen) にまたがっている。メタデータイベントのセマンティクスを選ぶと、AnthropicのTTFTがOpenAI (同様のメタデータのみの最初のイベントがない) のTTFTと本質的に異なるものになる。ユーザーが見えるコンテンツのセマンティクスは4つのプロバイダーで均一であり、「time-to-first-token」を文字通りに解釈したものに一致する。

**`thought` / reasoningを含める理由**: オペレーターの観点からは、reasoningチャンクも「モデルが出力を生成した」という事実。除外するとreasoningが多いモデル (o1、Qwen thinkingバリアント) のTTFTが過小評価される。将来の拡張として `ttft_to_reasoning_ms` と `ttft_to_answer_ms` への分割は可能だが、フェーズ4の対象外。

**ツール呼び出しのみのチャンクを含める理由**: エージェントのツール決定LLM呼び出し (1つの `tool_use`、テキストなし) はqwen-codeのワークフローで一般的。除外するとこれらのリクエストでTTFTが未定義になる。`functionCall` Partは意味のある出力。

**製品間比較の注記**: 設計文書は `qwen-code.ttft_ms ≈ claude-code.time_to_first_response_ms ≠ claude-code.ttft_ms` と明記する。製品をまたいで比較するオペレーターはユーザーが見えるコンテンツのセマンティクスで揃えるべき。

### D2 — TTFT計測の場所: `LoggingContentGenerator.generateContentStream` のメソッドローカル変数

最初のチャンク検出は `loggingContentGenerator.ts:393` の既存ストリームラッパー (`async function* processStreamGenerator`) 内で実行される。呼び出しごとの変数 (`start`、`ttftMs`) はメソッドのクロージャ内に存在し、**インスタンスフィールドには絶対に格納しない**。

**インスタンスフィールドにしない理由**: `LoggingContentGenerator` は **`ContentGenerator` ごとに1回インスタンス化** (`contentGenerator.ts:377`) され、すべての並行する `generateContentStream` 呼び出し (サブエージェントのファンアウト、ウォームアップクエリ、`geminiChat` からのサイドクエリ) で共有される。インスタンスフィールドは並行する呼び出し間で上書きされ、インターリーブされたリクエストの片方でTTFTが無意味な値になる。

**AsyncLocalStorage にしない理由**: ALSは機能するが、メソッドを外に出る必要のない状態にコンテキスト管理レイヤーを追加することになる。メソッドローカルはよりシンプルで、オーバーヘッドゼロ、リークリスクゼロ。

```ts
// loggingContentGenerator.ts — generateContentStream 内
const attemptStart = Date.now(); // 呼び出しごとのローカル
const requestEntryTime = Date.now(); // これも呼び出しごとのローカル — D3参照
let ttftMs: number | undefined;
const attemptStartTimes: number[] = [attemptStart];
let retryTotalDelayMs = 0;
let finalAttempt = 1;
// ストリームラッパーは各チャンクを検査し、hasUserVisibleContent に一致する最初のチャンクで:
//   ttftMs = Date.now() - attemptStart;
```

`hasUserVisibleContent(chunk)` はラッパーと同じ場所にある小さなスタンドアロンヘルパーで、テスト用にエクスポートされる:

```ts
function hasUserVisibleContent(chunk: GenerateContentResponse): boolean {
  const parts = chunk.candidates?.[0]?.content?.parts;
  if (!parts?.length) return false;
  return parts.some(
    (p) =>
      (typeof p.text === 'string' && p.text.length > 0) ||
      p.functionCall !== undefined ||
      p.inlineData !== undefined ||
      p.executableCode !== undefined ||
      // @ts-expect-error — `thought` はすべてのSDKバージョンにはないがプロバイダーが送出する
      p.thought !== undefined,
  );
}
```

### D3 — `request_setup_ms` の計算: エントリー時刻 vs 成功した試行の開始時刻

`request_setup_ms` は `generateContentStream`/`generateContent` のエントリーから**成功した試行の開始**までのウォールクロック時間を計測する。失敗したリトライ、バックオフスリープ、リトライ前の準備作業をすべて含む。

```ts
request_setup_ms = attemptStart_of_successful_attempt - requestEntryTime;
```

`attempt === 1` でリトライが発生しなかった場合、`request_setup_ms` は小さい (SDKセットアップのみ)。リトライが発生した場合、リトライバジェット全体のオーバーヘッドを捉える。

**OTelスパンに含める理由 (Perfettoにのみ含めるclaude-codeからの乖離)**: 3つのレベルで根拠がある:

1. **Perfettoがない** — qwen-codeには帯域外の可視化レイヤーがない。OTel属性が唯一のチャネル。
2. **シングルトレースデバッグ** — オペレーターは `duration_ms=12000, request_setup_ms=11500, ttft_ms=200, sampling_ms=300` を見て即座に「リトライが11.5秒を費やし、モデル自体は高速だった」と診断できる。他のフィールドから `request_setup_ms` を計算するには `sampling_ms` も公開する必要があり、それはいずれにせよ行う (D6)。
3. **無視できるコスト** — 1つのINT64属性。既存の `input_tokens`、`output_tokens` 属性と同等のオーダー。バックエンドの取り込みコストは重要でない。

### D4 — リトライテレメトリ: `retryWithBackoff` の `onRetry` コールバックオプション + `ApiRetryEvent` + AsyncLocalStorage伝播

> **フェーズ4b更新 (設計後の発見)**: このセクションは当初、claude-codeの「1つのLLMスパンがリトライループを所有する」パターンを前提として書かれていた。フェーズ4bの実装中に、qwen-codeの4つの `retryWithBackoff` 呼び出しサイト (`client.ts:2109`、`baseLlmClient.ts:235,333`、`geminiChat.ts:2035` — マージ時の行番号) がすべて `apiCall = () => contentGenerator.generateContent(...)` をラップしていることが判明した。リトライレイヤーはLoggingContentGeneratorの**上位**に位置する。各リトライ試行は `apiCall()` を新たに呼び出す → 新しい `qwen-code.llm_request` スパン。試行をまたがる単一の共有スパンは存在しない。LoggingContentGenerator内のアキュムレーターは機能しない。
>
> **解決策**: `AsyncLocalStorage` (`packages/core/src/utils/retryContext.ts` の `retryContext`) 経由でリトライ状態を伝播する。`retryWithBackoff` は各 `await fn()` を `retryContext.run({ attempt, requestSetupMs, retryTotalDelayMs }, fn)` でラップする。`LoggingContentGenerator` は同期的なプリアンブルでALSを読み取り、値を `endLLMRequestSpan` に転送する。これにより当初の計画よりも**豊富な**観測性が得られる — 試行ごとのスパンは独自の `duration_ms` / `ttft_ms` / エラー詳細を持ち、さらに試行ごとの `attempt` / `requestSetupMs` / `retryTotalDelayMs` 属性を通じてリトライバジェット内の位置も把握できる。
>
> ALSアプローチはコードベースの既存パターン (`promptIdContext`、`subagentNameContext`、`agent-context`) と一致する — 新しい面を最小限にし、十分に理解されたセマンティクスを持つ。プランモードレビュープロセスで3回のレビューラウンドを通じて22件の問題が発見され、マージ前にすべて対応された。

`retryWithBackoff` は現在 `logRetryAttempt` (`retry.ts:343`) を呼び出し、これは `debugLogger.warn` にのみ書き込む。`RetryOptions` インターフェースをオプトインコールバックで拡張する:

```ts
// utils/retry.ts
interface RetryOptions<T> {
  // ... 既存フィールド ...
  /**
   * オプション。各失敗した試行の後、バックオフスリープの前に1回呼び出される。
   * 試行番号 (1始まり)、エラー、次の試行前の遅延を受け取る。
   * LLM呼び出しサイトのテレメトリイベントを送出するために使用する。
   * 非LLM呼び出し元 (例: channels/weixin) では undefined のままにして
   * LLM専用テレメトリチャネルへの出力を避ける。
   */
  onRetry?: (info: RetryAttemptInfo) => void;
}

interface RetryAttemptInfo {
  attempt: number; // 1始まり、debugLogger出力と一致
  error: unknown;
  errorStatus?: number;
  delayMs: number; // 次の試行前のバックオフ遅延
}
```

4つのLLM呼び出しサイト (`client.ts:1540`、`baseLlmClient.ts:193,282`、`geminiChat.ts:1039`) は新しい `ApiRetryEvent` を送出するコールバックを登録する:

```ts
// types.ts — ContentRetryEvent の兄弟となる新しいイベントクラス
export class ApiRetryEvent implements BaseTelemetryEvent {
  'event.name': typeof EVENT_API_RETRY;
  'event.timestamp': string;
  model: string;
  prompt_id?: string;
  attempt_number: number; // 1始まり
  error_type: string;
  error_message: string; // 256文字に切り捨て
  status_code?: number;
  retry_delay_ms: number;
  // ... duration_ms は retry_delay_ms に設定され、LogToSpanProcessor が
  // 意味のある幅のブリッジスパンをレンダリングできるようにする
  duration_ms: number;
}
```

**新しいイベントクラスとして定義し `ContentRetryEvent` を拡張しない理由**:

- `ContentRetryEvent` には2つのダウンストリームコンシューマー (qwen-logger、ログレコードエクスポート) がある。ペイロードを変更すると破壊的変更のリスクがある。
- 「content retry」という命名はセマンティクス的にコンテンツ復旧リトライ (無効なストリーム、スキーマ修復) を指す — レート制限リトライを含めるとスキーマが曖昧になる。
- 新しいイベントは加算的であり、コンシューマーへの驚きがない。

**`retry.ts` にコールバックをハードコードしない理由**: `retry.ts` は `channels/weixin/src/api.ts` (Microsoftメッセージング APIリトライ) からも呼び出される。retry.ts にLLMテレメトリをハードカップリングすると、非LLMリトライで `ApiRetryEvent` が送出される。`onRetry` コールバックは呼び出し元ごとのオプトイン — LLM呼び出し元はオプトイン、weixin呼び出し元はオプトアウト。

**ContentRetryEvent との共存**: ContentRetryEvent は `geminiChat.ts:806,830` 内のコンテンツ復旧リトライのためにそのまま残る。ApiRetryEvent は `retryWithBackoff` からのレート制限/5xx リトライをカバーする。2つのイベントは異なるレイヤーから発火され、重複することはない。両イベントの既存のログブリッジ動作は `LogToSpanProcessor` 経由で維持される — 両イベントはフェーズ1の配線により自動的にアクティブなLLMスパン配下にネストされる。

**永続的リトライモード (`QWEN_CODE_UNATTENDED_RETRY`)**: 単一の429ループリクエストで50件以上のイベントが送出される可能性がある。フェーズ4での送出レート制限はスコープ外 — 本番ボリュームが問題になった場合は、スパンごとの上限とサマリーイベントをフォローアップPRで追加する。親LLMスパンの集計 `attempt` と `retry_total_delay_ms` (D5) はイベント上限に関係なく正確なまま。

### D5 — 親LLMスパンの集計: スカラー属性のみ (マップ型属性なし)

OTelスパン属性はスカラー (`string | number | boolean | これらの配列`)。マップ型属性 (例: `retry_count_by_status: {429:2, 503:1}`) はJSONシリアライズが必要でクエリが煩雑。スキップする。

| 属性                       | 型     | セマンティクス                                                                                                                                               |
| -------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `attempt`                  | int    | `retryContext.attempt` からの1始まりの単調カウンター (この試行のイテレーション)。常に設定される (リトライコンテキストがない場合はデフォルト1)               |
| `retry_total_delay_ms`     | int    | この試行が開始される前の累積バックオフスリープ。直接呼び出しの場合は未定義。試行1では0。後続のリトライ試行では > 0                                         |
| `ttft_ms`                  | int    | D1によるTTFT。非ストリーミングまたは最初のチャンク前に中断されたリクエストの場合は未定義                                                                    |
| `request_setup_ms`         | int    | D3による                                                                                                                                                     |
| `sampling_ms`              | int    | D6による                                                                                                                                                     |
| `output_tokens_per_second` | double | 派生値。`output_tokens / (sampling_ms / 1000)`。`sampling_ms === 0` の場合は未定義                                                                          |

試行ごとのステータスコード分布 (例: 「3回の試行のうち2回が429」) は `ApiRetryEvent` レコードのログブリッジスパンからクエリ可能。親にフラット化された属性として重複させる必要はない。

**`sampling_ms` と `output_tokens_per_second` をスパンに含める理由**: 多くのスパンを集計するバックエンドクエリで計算するのは派生可能だが煩雑。`request_setup_ms` と同じコストベネフィット (D3)。

### D6 — `recordApiRequestBreakdown()` を4フェーズのうち3フェーズで有効化

`endLLMRequestSpan` (またはそれを呼び出すラッパー) で、TTFT/セットアップ/サンプリングを計算した後に送出する:

```ts
recordApiRequestBreakdown(config, model, [
  { phase: ApiRequestPhase.REQUEST_PREPARATION, durationMs: requestSetupMs },
  { phase: ApiRequestPhase.NETWORK_LATENCY, durationMs: ttftMs }, // ttftMs = ネットワーク + 最初のトークン生成
  { phase: ApiRequestPhase.RESPONSE_PROCESSING, durationMs: samplingMs },
]);
```

**`TOKEN_PROCESSING` をスキップする理由**: qwen-codeはストリームチャンク処理をインライン (`loggingContentGenerator.ts:644` のラッパーで統合) で行う。ポストストリームのラップアップフェーズは <10ms であり、アーキテクチャ的に区別する価値がない。無意味な値を入れるとヒストグラムが汚染される。enum値を未使用のままにするのは安全 — `apiRequestBreakdownHistogram.record(value, {model, phase})` は `phase` をラベルとするヒストグラムであり、欠損ラベルはクエリに存在しないだけ。

**`NETWORK_LATENCY` を再定義しない理由**: スペックの名前は若干誤解を招く (純粋なネットワークレイテンシではなく、ネットワーク + 最初のトークン生成) が:

- enumは `metrics.ts:330-334` に含まれ、`index.ts:117` からエクスポートされ、テストされている。
- バックエンドダッシュボードはすでにこれらのフェーズ名を参照している可能性がある。
- リネームや新しいフェーズの追加は、わずかな精度向上のための破壊的変更になる。

設計文書でセマンティクスを文書化し、enumは変更しない。

**スパンパスに置き、並列でなくする理由**: `recordApiRequestBreakdown` をスパン属性の書き込みと同じ場所に置くことで — 単一のゲートされた送出ポイント (D7のべき等性参照)、単一の順序制約となる。

### D7 — `endLLMRequestSpan` のべき等性: 既存のダブルエンドガードでゲートされたメトリクス記録

フェーズ1.5 (#4302) で `endLLMRequestSpan` が2回呼び出される可能性があることが確立された (中断パス + エラーパスの衝突)。`session-tracing.ts:~470` の既存ガード (`if (!activeSpans.has(...)) return;`) はダブル `span.end()` を防ぐ。フェーズ4のメトリクス記録 (D6) は **同じガードブロック内、`span.end()` の前に位置しなければならない**:

```ts
// session-tracing.ts — endLLMRequestSpan
const llmCtx = activeSpans.get(spanRef);
if (!llmCtx) return;            // すでに終了 — ダブルエンドガード
activeSpans.delete(spanRef);    // 終了を確定

// ... durationを計算し、属性を設定 ...
if (metadata) {
  recordApiRequestBreakdown(config, llmCtx.attributes.model, [...]);   // 新規 — ゲートされている
  recordTokenUsageMetrics(...); // 既存
}

span.end();
```

これにより、LLMリクエストごとにメトリクスが**正確に1回**記録され、スパンライフサイクルと一致することが保証される。

**`loggingContentGenerator` で記録しない理由**: 中断パスを検知できない。スパンライフサイクルレイヤーで記録することで、スパンを開いたすべてのLLMリクエストが成功/失敗/中断に関わらず正確に1つのbreakdownサンプルを生成することが保証される。

### D8 — GenAI セマンティックコンベンション デュアルエミット (プライベート名が正規)

GenAI semconv属性に対応するフェーズ4の各属性はスパンに2回書き込まれる:

| qwen-code プライベート (正規)              | GenAI semconv (互換レイヤー)                    | 単位変換         | スペックステータス |
| ------------------------------------------ | ----------------------------------------------- | ---------------- | ------------------ |
| `ttft_ms` (ms、int)                        | `gen_ai.server.time_to_first_token` (秒、double) | `ttftMs / 1000` | Experimental       |
| `input_tokens` (int)                       | `gen_ai.usage.input_tokens` (int)               | 同一             | Stable             |
| `output_tokens` (int)                      | `gen_ai.usage.output_tokens` (int)              | 同一             | Stable             |
| `cached_input_tokens` (int) (存在する場合) | `gen_ai.usage.cached_tokens` (int)              | 同一             | Experimental       |
| `qwen-code.model` (string)                 | `gen_ai.request.model` (string)                 | 同一             | Stable             |

**LLMスパンの既存トークン属性名** (`endLLMRequestSpan` でフェーズ4より前に設定): qwen-codeはすでにベア名の `input_tokens` と `output_tokens` を使用している。フェーズ4は #4410 のパターンに合わせて `gen_ai.usage.*` の兄弟を追加する。ベア名は残す。**リネームしない**。

GenAI semconv に相当するものがないフィールド — `request_setup_ms`、`sampling_ms`、`retry_total_delay_ms`、`attempt`、`output_tokens_per_second` — はqwen-code名前空間のみで送出される。

**「プライベートが正規、semconv は互換」の理由**:

- 内部ダッシュボード、SLO、debugLogger出力、qwen-logger RUM、ARMSクエリ — すべて `ttft_ms` 等を参照する。これらを正規として扱うことで、一斉移行が不要になる。
- Experimental GenAI semconv は Stable に達する前に `gen_ai.server.time_to_first_token` をリネームする可能性がある。その場合はsemconv送出を更新するが、qwen-codeの名前は変わらない。
- 将来のスペック対応バックエンド (Datadog AI views、Honeycomb AI、ARMS GenAI dashboards) は私たちの関与なしに `gen_ai.*` 属性を自動的に取得する。

**デュアルエミット単位変換の理由** (ms ↔ 秒): GenAI semconv はレイテンシに秒をdoubleとして選択したが、qwen-codeはms-as-int を選択した (スパン上の既存の `duration_ms` と一致)。両方の表現に価値があり、変換は安価。

## ヘルパーAPI (`session-tracing.ts` への加算)

```ts
// session-tracing.ts — LLMRequestMetadata インターフェースの拡張 (加算)
export interface LLMRequestMetadata {
  // ... 既存フィールド: inputTokens、outputTokens、cachedInputTokens、success、error、...

  /** 成功した試行の開始からユーザーが見える最初のコンテンツチャンクまでの時間 (ms)。非ストリーミングまたは最初のチャンク前に中断されたリクエストの場合は未定義。 */
  ttftMs?: number;

  /** generateContent エントリーから成功した試行の開始までの時間 (ms)。失敗したリトライ+バックオフをすべて含む。 */
  requestSetupMs?: number;

  /** 最終試行番号 (1始まり)。1 = リトライなし。 */
  attempt?: number;

  /** 成功した試行の前のすべてのバックオフ遅延の合計 (ms)。 */
  retryTotalDelayMs?: number;
}

// 新しいエクスポートヘルパーなし — フェーズ4は拡張されたメタデータで startLLMRequestSpan / endLLMRequestSpan を再利用する。
```

```ts
// types.ts — 新しいイベントクラス
export class ApiRetryEvent implements BaseTelemetryEvent {
  'event.name': typeof EVENT_API_RETRY = EVENT_API_RETRY;
  'event.timestamp': string;
  model: string;
  prompt_id?: string;
  attempt_number: number;
  error_type: string;
  error_message: string;
  status_code?: number;
  retry_delay_ms: number;
  duration_ms: number;  // = retry_delay_ms、LogToSpanProcessor ブリッジスパンの幅を決定

  constructor(opts: { model: string; promptId?: string; attemptNumber: number; error: unknown; statusCode?: number; retryDelayMs: number }) { ... }
}

// constants.ts
export const EVENT_API_RETRY = 'qwen-code.api_retry';

// loggers.ts
export function logApiRetry(config: Config, event: ApiRetryEvent): void { ... }
```

```ts
// utils/retry.ts — RetryOptions の拡張
interface RetryOptions<T> {
  // ... 既存 ...
  onRetry?: (info: RetryAttemptInfo) => void;
}

interface RetryAttemptInfo {
  attempt: number;
  error: unknown;
  errorStatus?: number;
  delayMs: number;
}

// retryWithBackoff 内、今日 logRetryAttempt が呼び出されている箇所:
options.onRetry?.({ attempt, error, errorStatus, delayMs: actualDelay });
logRetryAttempt(attempt, error, errorStatus); // 既存の debugLogger 呼び出しは変更なし
```

## ライフサイクルの配線

### ストリーミングパス (一般的なケース)

```ts
// loggingContentGenerator.ts:283 — generateContentStream
async generateContentStream(req, userPromptId): Promise<AsyncGenerator<GenerateContentResponse>> {
  const requestEntryTime = Date.now();
  let attemptStart = requestEntryTime;
  const attemptStartTimes: number[] = [attemptStart];
  let retryTotalDelayMs = 0;
  let finalAttempt = 1;

  // 既存の startLLMRequestSpan を使用 (フェーズ1)
  // 使用中のリトライレイヤーに onRetry コールバックを渡す:
  const onRetry: RetryAttemptInfo & { invoke: ... } = (info) => {
    finalAttempt = info.attempt + 1;        // 試行 N+1 を開始しようとしている
    retryTotalDelayMs += info.delayMs;
    attemptStart = Date.now() + info.delayMs; // 近似値。実際のリセットは次の試行の先頭
    attemptStartTimes.push(attemptStart);
    // ApiRetryEvent を送出
    logApiRetry(this.config, new ApiRetryEvent({
      model: req.model,
      promptId: userPromptId,
      attemptNumber: info.attempt,
      error: info.error,
      statusCode: info.errorStatus,
      retryDelayMs: info.delayMs,
    }));
  };

  // ストリームラッパーが最初のユーザーが見えるチャンクを検出:
  return this.processStreamGenerator(stream, ..., {
    onFirstUserVisibleChunk: (now) => {
      ttftMs = now - attemptStart;
    },
  });
}
```

スパン終了時 (フェーズ1の `endLLMRequestSpan` フローにすでにある)、`LLMRequestMetadata` に新しいフィールドを含める:

```ts
endLLMRequestSpan(llmSpan, {
  success: true,
  inputTokens,
  outputTokens,
  cachedInputTokens,
  ttftMs,
  requestSetupMs: attemptStart - requestEntryTime,
  attempt: finalAttempt,
  retryTotalDelayMs,
});
```

### 非ストリーミングパス

`generateContent` (`loggingContentGenerator.ts:212`) はストリーミングチャンクを生成しない。TTFTは `undefined`。`request_setup_ms` は引き続き意味を持つ (リトライオーバーヘッドを捉える)。breakdownメトリクスは3フェーズではなく2フェーズ (REQUEST_PREPARATION + RESPONSE_PROCESSING、`RESPONSE_PROCESSING = duration_ms - request_setup_ms`) を記録する。

### リトライレイヤーの統合 (4サイト)

4つのLLM `retryWithBackoff` 呼び出しサイトそれぞれに `onRetry` を追加する:

```ts
// client.ts:1540 (baseLlmClient.ts:193、282、geminiChat.ts:1039 でも同様)
const result = await retryWithBackoff(apiCall, {
  ...existingOptions,
  onRetry: (info) => {
    logApiRetry(
      this.config,
      new ApiRetryEvent({
        model,
        promptId: userPromptId,
        attemptNumber: info.attempt,
        error: info.error,
        statusCode: info.errorStatus,
        retryDelayMs: info.delayMs,
      }),
    );
    // LoggingContentGenerator のローカルリトライアキュムレーターにもフィードバック
    // (スコープ内にある場合 — LoggingContentGenerator を経由しない呼び出し元では、
    // endLLMRequestSpan がLLMレイヤーで呼び出されるため、LLMスパンはメタデータパス経由で
    // `attempt` と `retry_total_delay_ms` を受け取る)
  },
});
```

非LLM呼び出し元 (`channels/weixin/src/api.ts`) は `onRetry` を**登録しない** — そのリトライで `ApiRetryEvent` は送出されず、今日の動作と一致する。

## 並行安全性 — 主要な保証

`LoggingContentGenerator` インスタンスは共有される (`ContentGenerator` ごとに1つ、`contentGenerator.ts:377`)。3つの並行する `generateContentStream` 呼び出し (例: `coreToolScheduler.runConcurrently` 経由で3つのサブエージェントがファンアウト) は `generateContentStream` の3つの独立したクロージャを実行する:

```
call_A: attemptStart_A、ttftMs_A、... (クロージャ)
call_B: attemptStart_B、ttftMs_B、... (クロージャ)
call_C: attemptStart_C、ttftMs_C、... (クロージャ)
```

呼び出しごとのローカルは重なることがない。ストリームチャンクは各呼び出しのローカル `attemptStart` に対して検出される。スパン属性は各呼び出し自身の `endLLMRequestSpan` で設定される。

`AsyncLocalStorageContextManager` (NodeSDKにより `sdk.ts:273` で登録) はアクティブなOTelコンテキスト — したがって `startLLMRequestSpan` に渡される親スパン — がファイバーごとに正しいことをすでに保証している。

## 変更ファイル

| ファイル                                                                         | 変更                                                                                                                                                                                                                                      | LOC 見積もり |
| -------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ |
| `packages/core/src/telemetry/constants.ts`                                       | `EVENT_API_RETRY` 定数を追加                                                                                                                                                                                                              | +2           |
| `packages/core/src/telemetry/types.ts`                                           | `ApiRetryEvent` クラス + ユニオンメンバーを追加                                                                                                                                                                                           | +40          |
| `packages/core/src/telemetry/loggers.ts`                                         | `logApiRetry()` 関数を追加                                                                                                                                                                                                                | +20          |
| `packages/core/src/telemetry/qwen-logger/qwen-logger.ts`                         | RUMダウンストリームの一貫性のために `logApiRetryEvent()` を追加                                                                                                                                                                           | +20          |
| `packages/core/src/telemetry/session-tracing.ts`                                 | `LLMRequestMetadata` を拡張 (ttftMs、requestSetupMs、attempt、retryTotalDelayMs)。`endLLMRequestSpan` を拡張して新しい属性 + breakdownメトリクス + デュアルエミット gen_ai.\* を設定                                                       | +60          |
| `packages/core/src/telemetry/metrics.ts`                                         | `endLLMRequestSpan` 内の `recordApiRequestBreakdown` 呼び出しサイトを配線 (既存レコーダーに変更なし)                                                                                                                                     | 0            |
| `packages/core/src/utils/retry.ts`                                               | `RetryOptions` に `onRetry?: (info: RetryAttemptInfo) => void` を追加。`RetryAttemptInfo` をエクスポート。既存の logRetryAttempt サイトでコールバックを呼び出す                                                                           | +25          |
| `packages/core/src/core/loggingContentGenerator/loggingContentGenerator.ts`      | TTFTキャプチャ: メソッドローカルアキュムレーター + `hasUserVisibleContent` ヘルパー + ストリームラッパーでの最初のチャンク検出。`endLLMRequestSpan` に新しいメタデータを渡す                                                              | +80          |
| `packages/core/src/core/client.ts`                                               | `retryWithBackoff` 呼び出しサイト (`client.ts:1540`) で `onRetry` コールバックを配線                                                                                                                                                     | +15          |
| `packages/core/src/core/baseLlmClient.ts`                                        | 2つの `retryWithBackoff` 呼び出しサイトで `onRetry` コールバックを配線                                                                                                                                                                   | +25          |
| `packages/core/src/core/geminiChat.ts`                                           | `retryWithBackoff` 呼び出しサイト (`geminiChat.ts:1039`) で `onRetry` コールバックを配線                                                                                                                                                 | +15          |
| `packages/core/src/telemetry/session-tracing.test.ts`                            | `endLLMRequestSpan` が ttft_ms / request_setup_ms / attempt / retry_total_delay_ms / sampling_ms / output_tokens_per_second を設定 + gen_ai デュアルエミット + breakdownメトリクス (各フェーズ) + べき等な終了                            | +120         |
| `packages/core/src/core/loggingContentGenerator/loggingContentGenerator.test.ts` | `hasUserVisibleContent` (text / functionCall / inlineData / executableCode / thought / role-only / usage-only)。並行呼び出しが TTFT を汚染しない。最初のチャンク前に中断した場合はTTFT未定義。非ストリーミングではTTFT未定義              | +100         |
| `packages/core/src/utils/retry.test.ts`                                          | `onRetry` が失敗した各試行で正しい `attempt`、`delayMs`、`error`、`errorStatus` と共に呼び出される。`onRetry` が存在しない場合はサイレント (テレメトリ未送出)                                                                            | +50          |
| `packages/core/src/telemetry/loggers.test.ts`                                    | `logApiRetry` が期待されるペイロードのLogRecordを送出し、LogToSpanProcessor経由でアクティブなLLMスパン配下のネストされたスパンにブリッジされる                                                                                           | +40          |

合計: 14ファイル、約610 LOC。フェーズ2 (#4321) より大きいが、フェーズ3 (#4410) と同等であり、統合の広さ (4つのリトライサイト + テレメトリ配管 + ストリーミングラッパー) によって正当化される。

レビューでサイズへの懸念が出た場合: **フェーズ4a + 4b + 4c** に分割:

- **4a** (~200 LOC): TTFTキャプチャ + 拡張された `LLMRequestMetadata` + デュアルエミット。自己完結した価値 (初日からTTFT可視性)。
- **4b** (~250 LOC): `onRetry` コールバック + `ApiRetryEvent` + 4つの呼び出し元の配線。**独立したバグフィックス** として `retryWithBackoff` テレメトリのギャップを修正する。
- **4c** (~160 LOC): `recordApiRequestBreakdown` の有効化 + 親スパン集計属性 (`attempt`、`retry_total_delay_ms`、`sampling_ms`、`output_tokens_per_second`)。4a + 4b に依存。

## テスト戦略

| テスト                                                                                                                                     | 証明すること                           |
| ------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------- |
| `hasUserVisibleContent` が text/functionCall/inlineData/executableCode/thought に対して true を返す                                         | D1 セマンティクス (各パートタイプ)     |
| `hasUserVisibleContent` が role-only と usage-only チャンクに対して false を返す                                                            | D1 ネガティブケース                    |
| ストリーミング: TTFTが試行開始から最初のユーザーが見えるチャンクまで計測される                                                              | エンドツーエンドのTTFT検出             |
| ストリーミング: ユーザーが見えるチャンクの前にストリームが中断した場合はTTFT未定義                                                         | エッジケース                           |
| ストリーミング: TTFTが最終試行の開始から計算される (最初の試行からではない)                                                                 | D3 — リトライ時のTTFTリセット          |
| 非ストリーミング: TTFT が undefined のまま                                                                                                  | S3 の決定                              |
| 並行する `generateContentStream` 呼び出しがTTFTを汚染しない                                                                                 | D2 — メソッドローカルの保証            |
| `endLLMRequestSpan` がフェーズ4のすべての属性を設定する (ttft_ms、request_setup_ms、sampling_ms、attempt、retry_total_delay_ms、output_tokens_per_second) | 属性の存在                             |
| `endLLMRequestSpan` が gen_ai.server.time_to_first_token + gen_ai.usage.\* + gen_ai.request.model をデュアルエミットする                   | D8 デュアルエミット                    |
| `endLLMRequestSpan` がストリーミングでは3フェーズ、非ストリーミングでは2フェーズのbreakdownメトリクスを記録する                            | D6                                     |
| `endLLMRequestSpan` が2回呼び出された場合: メトリクスは正確に1回記録され、属性は再設定されない                                             | D7 べき等性                            |
| `onRetry` ありの `retryWithBackoff`: コールバックが失敗した各試行で正しい引数と共に呼び出される                                             | D4 コールバック契約                    |
| `onRetry` なしの `retryWithBackoff`: テレメトリ未送出 (非LLM呼び出し元のサイレント)                                                        | P2 — channels/weixin スコープ保護      |
| `client.ts` / `baseLlmClient.ts` / `geminiChat.ts` のリトライ呼び出しサイトがリトライ時に `ApiRetryEvent` を送出する                       | 4サイトでのD4の統合                    |
| `ApiRetryEvent` LogRecordがLogToSpanProcessor経由でアクティブなLLMスパン配下の子スパンにブリッジされる                                     | トレースツリーの正確性                 |
| LLMスパンの `attempt` フィールドがリトライ下で正しい最終試行番号を反映する                                                                  | D5 集計                                |
| LLMスパンの `retry_total_delay_ms` が onRetry の遅延を正しく合計する                                                                       | D5 集計                                |
| `sampling_ms === 0` (非ストリーミング) の場合に `output_tokens_per_second` が未定義                                                         | ゼロ除算を防ぐ                         |

## エッジケース

| ケース                                                              | 処理                                                                                                                                                                                                                         |
| ------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| チャンクが届く前にストリームが中断した場合                          | `ttftMs = undefined`、`sampling_ms = undefined`、`output_tokens_per_second = undefined`。`attempt`、`request_setup_ms` は引き続き設定される。`success = false`                                                               |
| 最初のチャンク後にストリームが中断した場合                          | `ttftMs` は設定される。`sampling_ms` = `duration_ms - ttftMs - request_setup_ms`。部分的な応答時間を反映。`success = false`                                                                                                  |
| 試行1で成功 (リトライなし)                                          | `attempt = 1`、`retry_total_delay_ms = 0`、`ApiRetryEvent` は送出されない。breakdownメトリクスは `request_setup_ms` をほぼ0として記録                                                                                        |
| 永続的リトライモード 50回以上の試行                                 | 50件以上の `ApiRetryEvent` レコードが送出される (スコープ外のキャップは延期)。LLMスパンの `attempt = 51`、`retry_total_delay_ms = すべての遅延の合計`。オペレーターはスパンで集計ビューを確認し、ログブリッジスパンで試行ごとの詳細を確認できる |
| 非LLM `retryWithBackoff` 呼び出し元 (channels/weixin)              | `onRetry` が登録されていない。既存の `debugLogger.warn` のみ発火。`ApiRetryEvent` なし。breakdownメトリクスなし (呼び出し元はLLMサイトではない)                                                                             |
| `endLLMRequestSpan` が2回呼び出された場合 (中断 + エラーの競合)    | フェーズ1.5のガードが `activeSpans.delete()` で2回目の呼び出しを早期リターン。`recordApiRequestBreakdown` はガード内にあり、正確に1回記録される                                                                              |
| コンテンツの前に Anthropic の `message_start` チャンクが届く場合   | `hasUserVisibleContent` はそれに対してfalseを返す (text/functionCall等を含むpartsがない)。後続の `content_block_delta` チャンクが届くまでTTFTはトリガーされない                                                             |
| `delta.content` が空で `role` のみの OpenAI 最初のチャンク         | `hasUserVisibleContent` はfalseを返す。空でない delta を含む最初のチャンクが届くまでTTFTはトリガーされない                                                                                                                   |
| ツール呼び出しのみのレスポンス (テキストなし)                       | `functionCall` Partを含む最初のチャンクがTTFTをトリガー。`output_tokens_per_second` はツール呼び出しのトークン数に対して計算される                                                                                           |
| 並行サブエージェント (3つの呼び出しが進行中)                        | 各呼び出しのクロージャは独自の `attemptStart`、`ttftMs`、`attemptStartTimes` を持つ。呼び出しごとのスパンは `endLLMRequestSpan` で独自のメタデータを受け取る。インターリーブなし (D2)                                         |
| openai-sdk内のSDKレベルのリトライ (`maxRetries=3`)                  | qwen-codeのテレメトリには不可視 — retryWithBackoffがリクエストを見る前にSDK内で完結する。`attempt` は retryWithBackoffの試行のみを反映。スコープ外 (スコープ外参照)                                                          |
| `gen_ai.server.time_to_first_token` スペックが Stable 到達前にリネームされた場合 | シングルファイルの更新: `session-tracing.ts:endLLMRequestSpan`。qwen-codeネイティブの `ttft_ms` は正規のまま — ダウンストリームへの影響なし                                                                                 |
| サブエージェントのLLMリクエスト                                     | 親はサブエージェントスパン (フェーズ3)。フェーズ4のフィールドは正しくネストされる。`qwen-code.subagent.id` でグループ化した集計により、サブエージェントごとのLLMパフォーマンスが得られる — 設計文書の将来の展望として実装が容易 |
| 長い思考ブロックを持つreasoningモデル                               | 最初の `thought` PartがTTFTをトリガー。`sampling_ms` には思考フェーズと回答フェーズの両方が含まれる。別々のメトリクスへの分割は延期                                                                                          |

## ロールバック

変更はOTelとメトリクスレベルで加算的 — すべての新しい属性はオプションで、すべての新しいイベントは新しいクラス。新しいフィールドでフィルタリングしない既存のダッシュボードは変更なしで動作し続ける。

動作に影響する変更:

- 新しい `ApiRetryEvent` LogRecordが流れ始める → リトライ率に比例してログ量が増加する (通常リクエストの <1% がリトライする)。必要に応じてSDKレイヤーでLogRecordをサンプリングして緩和する。
- 新しいbreakdownメトリクス `qwen-code.api.request.breakdown` が時系列を生成し始める → Prometheusのカーディナリティがわずかに増加する (`{model, phase}` — 有界)。
- `output_tokens_per_second` 派生属性は「すべての属性」をフィルタリングするダッシュボードで異常に見える可能性がある — ドキュメント化すること。

ロールバックパス: 単一のPR (または4a/4b/4cそれぞれ独立して) をリバートする。すべての新しいフィールドは防御的なデフォルト (undefined / 0) を使用し、スパン構造を変更しない。

## シーケンシング

- **フェーズ3 (#4410、レビュー中) の後**: ハードな依存ではない。フェーズ4の属性は `qwen-code.llm_request` スパンに付与され、`qwen-code.subagent` (フェーズ3) 配下にあるか `qwen-code.interaction` (フェーズ1) 配下にあるかに関わらず機能する。サブエージェントサブツリー配下での試行ごとの集計が自然に機能するよう、フェーズ3を先にリリースすることを推奨する。
- **#4384 (`traceparent` + `X-Qwen-Code-Session-Id` アウトバウンド伝播) とは独立**: HTTPレイヤーに触れる。フェーズ4はストリーム/リトライ/メトリクスレイヤーに触れる。
- **`clearDetailedSpanState` チャット圧縮フォローアップ (#4097 フォローアップ) とは独立**: 異なる面。

## 未解決の問題

1. **`onRetry` コールバックの発火セマンティクス**: バックオフスリープの**前** (現在の提案) か**後** (次の試行が開始される直前) に呼び出すか？前は簡単 — コールバックはすぐにすべての情報を持つ。後は、完了したばかりの遅延を別途捉える必要がある。スリープ前を推奨。コールバック契約に文書化する。
2. **LLMスパンの試行ごとのタイミング**: `attempt_durations_ms: number[]` 配列を追加するか？OTelはプリミティブの配列属性をサポートする。「N回の試行のうちどれが遅かった」の診断に有用。本番データが需要を示すまで延期 — ログブリッジスパンがすでに同等の情報を持つ。
3. **永続的リトライモードの送出上限**: `attempt > N` のどのしきい値でサンプリングを開始するか？`N = 5` で1/10回？`N = 10` でサマリーのみ？本番ボリュームデータが得られるまで延期。
4. **`TOKEN_PROCESSING` フェーズ**: enum値を休眠状態のままにするか、何か (例: 統合時間) に配線するか？延期 — 実際のユースケースを待つ。
5. **サブエージェントレベルのLLMロールアップ**: フェーズ4がリリースされれば trivial なフォローアップ — サブエージェントサブツリーごとに `ttft_ms`/`output_tokens`/`input_tokens` を合計する。フェーズ4のスコープではないが、データフローはそれを可能にする。
