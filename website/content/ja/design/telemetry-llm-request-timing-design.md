# LLM リクエストタイミング分解設計 (P3 Phase 4)

> Issue #3731 — 階層セッショントレーシングのフェーズ4。time-to-first-token、リクエストセットアップ時間、サンプリング時間、試行ごとのリトライテレメトリを `qwen-code.llm_request` スパンに追加し、オペレータが「このLLM呼び出しはなぜ遅かったのか？」を推測せずに判断できるようにする。
>
> フェーズ1 (#4126)、フェーズ1.5 (#4302)、フェーズ2 (#4321) を基盤とする。フェーズ3 (#4410、レビュー中) とは独立 — フェーズ3を先にマージすることで、フェーズ4の試行ごとのフィールドがサブエージェントサブツリー下でクリーンに集約されるため、先にフェーズ3を適用することを推奨する。

## 問題

現在の `qwen-code.llm_request` スパンは、`model`、`prompt_id`、`input_tokens`、`output_tokens`、`success`、`error`、`duration_ms` のみを保持する。単一のトレースを読むオペレータは以下の点を判断できない：

1. **`duration_ms` のうち、モデルの思考時間とネットワークセットアップ時間はそれぞれどの程度か。** 12秒の `duration_ms` は、11秒のリトライ後に1秒の高速生成、または100msのセットアップ後に12秒の低速ストリーミング — トレースからは判断できない。
2. **ユーザーが最初のトークンを見たのはいつか。** TTFT（time-to-first-token）はチャットUIの標準的なレイテンシSLOである。現在はそれを計算できず、キャプチャもしていない。
3. **リトライ中に何が起こったか。** `retryWithBackoff` (`utils/retry.ts:285`) は `debugLogger.warn` を呼び出すのみ — OTelイベントもスパン属性もなし。これを経由する4つのLLM呼び出し箇所 (`client.ts:1540`、`baseLlmClient.ts:193,282`、`geminiChat.ts:1039`) はトレースやメトリクスにリトライの可視性が全くない。`ContentRetryEvent` は `geminiChat.ts:806,830` 内のコンテンツリカバリーリトライ用に存在するが、より一般的なレート制限/5xxリトライには適用されない。
4. **`api.request.breakdown` はデッドコードである。** メトリクスは `metrics.ts:242-251` で4つの `ApiRequestPhase` 値とともに定義され、`index.ts:117` からエクスポートされ、`metrics.test.ts:646-675` でテストされている — しかし `recordApiRequestBreakdown()` の呼び出し元はプロダクションコードに存在しない。メトリクスインフラはコストがかかっているが、データフローは一度も接続されていない。

これらのギャップにより、`qwen-code.llm_request` はトレースツリーの中で最も情報量の少ないスパンとなっている。ツールスパン (#4126/#4321) とサブエージェントスパン (#4410) はどちらもライフサイクルフェーズを明らかにするが、LLMスパンはリクエスト全体を単一の不透明な時間にまとめてしまう。

## 既存の対象範囲 (変更なし)

| コンポーネント                                                | 場所                                                             | なぜ触らないか                                                                                                                                                                                                           |
| ------------------------------------------------------------ | ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| LLM リクエストスパンライフサイクル                            | `session-tracing.ts` `startLLMRequestSpan` / `endLLMRequestSpan` | フェーズ1 (#4126) でヘルパーが確立された。メタデータインターフェースを拡張するが、再構築は行わない                                                                                                                        |
| アクティブスパンのプロバイダージェネレーターへの伝搬        | `loggingContentGenerator.ts:213,287`                             | フェーズ1 (#4126) で `withSpan('api.*')` をネイティブヘルパーに置き換え、アクティブコンテキストはすでにストリームラッパーに到達している                                                                                  |
| `ContentRetryEvent` スキーマ + コンシューマー                | `types.ts:626`、`qwen-logger.ts:947`、`loggers.ts:717`           | 既存のイベントはその形状と下流を維持。`retryWithBackoff` パスに兄弟イベントクラスを追加する                                                                                                                               |
| `LogToSpanProcessor` ログブリッジスパン                      | `log-to-span-processor.ts`                                       | ContentRetryEvent の既存ブリッジは引き続きアクティブなLLMスパンの下にネストされる。フェーズ4はこれを変更しない                                                                                                            |
| `ApiRequestPhase` 列挙                                       | `metrics.ts:330-334`                                             | 公開インターフェース (4つの値)。プロダクションコードから3つの値を入力。互換性のために列挙は変更しない                                                                                                                    |
| プロバイダーごとのチャンク正規化 → `GenerateContentResponse` | `loggingContentGenerator.ts:286-393`                             | 各プロバイダーはすでにGoogleの `GenerateContentResponse` 形状に正規化してからLoggingContentGeneratorがストリームを見る。TTFT検出はこの正規化された形状を中心に一元実行。プロバイダーごとのコードは不要                       |
| `retryWithBackoff` 汎用リトライ                              | `utils/retry.ts:140`                                             | LLM呼び出し元と非LLM (`channels/weixin/src/api.ts`) の両方で使用。LLMテレメトリへのハードカップリングではなく、オプトインの `onRetry` コールバックで拡張する                                                    |
| 非ストリーミング `generateContent`                           | `loggingContentGenerator.ts:212`                                 | 非ストリーミングではTTFTは意味を持たないため、新しいフィールドは `undefined` のまま。スパンライフサイクルと既存の属性は変更なし                                                                                                |

## 対象外 (延期)

- **SDKレベルのリトライ** (openai SDK `maxRetries=3`、google-genai SDK内部リトライ)。これらはサードパーティSDK内で完全に発生する。観測するにはSDKリトライを無効化し、`retryWithBackoff` で再実装する必要がある。別の判断事項であり、フェーズ4では扱わない。
- **トークンごとのストリーミングメトリクス** (トークン間レイテンシ、チャンクごとのサイズ)。推論エンジンのパフォーマンスデバッグに有用だが、フェーズ4が対象とするユーザー体感レイテンシの質問には関係しない。
- **推論/思考ブロックの個別TTFT**。「最初のトークン」には思考コンテンツが含まれる (D1参照)。将来の拡張として `ttft_to_reasoning_ms` と `ttft_to_answer_ms` を分割することは可能だが、需要が確認された後にのみ行う。
- **サンプリングフェーズを専用の子スパンとして実装。** `duration_ms - ttft_ms - request_setup_ms` から計算可能。子スパンはOTel専用バックエンドでは何も追加しない (claude-codeはPerfetto用に使用)。代わりにスパン属性として保存 — D6参照。
- **永続リトライモード (`QWEN_CODE_UNATTENDED_RETRY`) のイベントレベルレート制限。** 単一のLLMリクエストで永続リトライ下で50以上の `ContentRetryEvent` / `ApiRetryEvent` レコードが生成される可能性がある。出力制限はフォローアップ — フェーズ4はすべてのイベントを出力。本番ボリュームが許容できない場合は、後続PRでスパンごとの出力制限と "+N more attempts (truncated)" サマリーイベントを追加する。
- **`TOKEN_PROCESSING` 分解フェーズ。** 列挙値は存在するが、qwen-code には測定する価値のある実際のポストストリームローカル処理はない (通常10ms未満)。本番呼び出し元ではスキップ。列挙値は将来の使用または制御不能な呼び出し元のために保持。
- **`ContentRetryEvent` をLLMスパンのスパンイベントとして移行。** フェーズ3の `subagent_execution` LogRecord と同じ理由：既存のコンシューマー (qwen-logger RUM、将来のメトリクス) はLogRecordに密結合。ブリッジスパンのカバレッジで十分。

## 参考文献 (決定根拠)

| ソース                                                                                                                      | 重要なポイント                                                                                                                                                                                                                                                                                                                                                         |
| --------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| claude-code (Anthropic) `claude.ts:1762, 1789, 1982, 2882`                                                                  | TTFTは `message_start` SSEイベントで `Date.now() - start` としてキャプチャ。`start` はリトライ試行ごとにリセット。`requestSetupMs = start - startIncludingRetries`。`attemptStartTimes` 配列は試行ごとに保持。アプローチの実現可能性を確認。彼らのTTFTセマンティクスは「最初のストリームイベント」(我々は「最初のコンテンツ」で分岐 — D1参照) |
| claude-code `perfettoTracing.ts:549-671`                                                                                    | リクエストセットアップ → 試行N (リトライ) → 最初のトークン → サンプリングをネストされたB/Eペアとしてレンダリング。視覚的分解を示す。qwen-code はPerfettoがないため、同じ分解をOTel属性で行う                                                                                                                                |
| claude-code `sessionTracing.ts:447`                                                                                         | `ttft_ms` のみがOTelスパンに含まれる (`requestSetupMs`、`samplingMs`、試行ごとのタイミングは含まれない)。我々は意図的にスパンに多くの情報を入れる — claude-code は視覚化用のPerfettoを持っているが、我々は持っていない                                                                                         |
| opencode (sst/opencode) `session/llm.ts`、`route/client.ts`                                                                   | TTFT測定なし。単一の `LLM.run` Effect スパンがすべてをカバー。競合ツール間でギャップが存在することを確認。行動の参考にはならない                                                                                                                                                                              |
| [OTel GenAI Semantic Conventions](https://opentelemetry.io/docs/specs/semconv/gen-ai/) (ステータス: Development / Experimental) | `gen_ai.usage.input_tokens` (安定)、`gen_ai.usage.output_tokens` (安定)、`gen_ai.usage.cached_tokens` (実験)、`gen_ai.request.model` (安定)、`gen_ai.server.time_to_first_token` (実験、秒を倍精度浮動小数点数)。デュアルエミットパターンは #4410 の先例に従う                                                               |
| [OTel Trace Spec — Span Events](https://opentelemetry.io/docs/specs/otel/trace/api/#add-events)                             | "イベントは、スパン属性としてより適切にキャプチャされる情報を記録するために使用すべきではない (SHOULD NOT)。" 試行ごとの情報は親のスパンイベントではなく、LLMスパン属性 + ログブリッジスパンに属することを確認                                                                                                                    |
| フェーズ3設計ドキュメント (`telemetry-subagent-spans-design.md`)                                                                   | デュアルエミットパターン (`qwen-code.subagent.id` + `gen_ai.agent.id`) と「プライベート名が権威」ルールを確立。フェーズ4はTTFTとトークンフィールドで同じ規則に従う                                                                                                                                        |

## 設計 — 7つの決定、それぞれに正当性

### D1 — TTFTセマンティクス: 「ユーザーに表示されるコンテンツを含む最初のチャンク」

TTFTは、**成功した試行**のリクエストディスパッチから、**ユーザーに見える出力を含む最初のストリームチャンク**までの壁掛け時間を測定する。チャンクが「ユーザーに見える」のは、正規化された `Part` のいずれかが `candidates[0].content.parts` 内で以下の条件を満たす場合：

- `text` で空でない文字列
- `functionCall` (ツール使用)
- `inlineData` (画像、バイナリ)
- `executableCode`
- `thought` / 推論コンテンツ (プロバイダーが公開するもの — Geminiの `thought`、Anthropicの `<thinking>` ブロック、OpenAI o1推論チャンク)

`role` メタデータのみまたは `usageMetadata` のみ (最終使用量サマリーチャンク) を含むチャンクはTTFTをトリガーしない。

**なぜ「任意の種類の最初のストリームイベント」(claude-codeの選択) ではないのか**: claude-code は `message_start` (Anthropic固有のメタデータイベントで、実際のコンテンツより50〜300ms早く発生) でTTFTを測定する。彼らの内部の `headlessProfiler.ts` はすでに `time_to_first_response_ms` を「ユーザーが何かを見た」セマンティクスとして分離しており、違いを認識している。qwen-code は複数のプロバイダー (Anthropic、OpenAI、Gemini、Qwen) にまたがる — メタデータイベントセマンティクスを選択すると、AnthropicのTTFTは (類似のメタデータのみの最初のイベントがない) OpenAIのTTFTと根本的に異なることになる。ユーザー可視コンテンツセマンティクスは4プロバイダーすべてで統一されており、「time-to-first-token」に文字通り一致する。

**なぜ `thought` / 推論を含めるのか**: オペレータの視点では、推論チャンクも「モデルが出力を生成した」ことに変わりはない。除外すると、推論重視モデル (o1、Qwen思考バリアント) のTTFTを過小評価する。将来の `ttft_to_reasoning_ms` 対 `ttft_to_answer_ms` への分割は可能。フェーズ4では行わない。

**なぜツール呼び出しのみのチャンクを含めるのか**: エージェントのツール決定LLM呼び出し (テキストなしで `tool_use` のみ) は、qwen-code のワークフローで一般的。除外すると、これらのリクエストではTTFTが未定義になる。`functionCall` Partは意味のある出力である。

**クロスプロダクト比較の注意**: 設計ドキュメントは、`qwen-code.ttft_ms ≈ claude-code.time_to_first_response_ms ≠ claude-code.ttft_ms` であることを明示的に示す。製品間で比較するオペレータは、ユーザー可視コンテンツセマンティクスに合わせる必要がある。

### D2 — TTFT計測サイト: `LoggingContentGenerator.generateContentStream` のメソッドローカル変数

最初のチャンク検出は、既存のストリームラッパー `loggingContentGenerator.ts:393` (`async function* processStreamGenerator`) 内で実行される。呼び出しごとの変数 (`start`、`ttftMs`) はメソッドのクロージャに存在し、**インスタンスフィールドとしては決して持たない**。

**なぜ決してインスタンスフィールドにしてはいけないのか**: `LoggingContentGenerator` は `ContentGenerator` ごとに**1回**インスタンス化され (`contentGenerator.ts:377`)、すべての同時 `generateContentStream` 呼び出し (サブエージェントファンアウト、ウォームアップクエリ、`geminiChat` からのサイドクエリ) で共有される。インスタンスフィールドは同時呼び出し間で上書きされ、インターリーブされた2つのリクエストのうち1つで無意味なTTFTを生成する。

**なぜ AsyncLocalStorage ではないのか**: ALSは機能するが、メソッドからエスケープする必要のない状態に対してコンテキスト管理レイヤーを追加することになる。メソッドローカルの方がシンプルで、オーバーヘッドがゼロ、リークのリスクもゼロ。

```ts
// loggingContentGenerator.ts — generateContentStream 内
const attemptStart = Date.now(); // 呼び出しごとのローカル
const requestEntryTime = Date.now(); // 呼び出しごとのローカル — D3参照
let ttftMs: number | undefined;
const attemptStartTimes: number[] = [attemptStart];
let retryTotalDelayMs = 0;
let finalAttempt = 1;
// ストリームラッパーは各チャンクを検査。hasUserVisibleContent に一致する最初のチャンク:
//   ttftMs = Date.now() - attemptStart;
```

`hasUserVisibleContent(chunk)` は、ラッパーと同じ場所に配置された小さなスタンドアロンヘルパーで、テスト用にエクスポートされる：

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
      // @ts-expect-error — `thought` はすべてのSDKバージョンにあるわけではないが、プロバイダーは出力する
      p.thought !== undefined,
  );
}
```

### D3 — `request_setup_ms` の計算: エントリー時間と成功試行開始時間

`request_setup_ms` は、`generateContentStream`/`generateContent` のエントリーから**成功した試行の開始**までの壁掛け時間を測定する — 失敗したすべてのリトライ、バックオフスリープ、リトライ前の準備作業を含む。

```ts
request_setup_ms = attemptStart_of_successful_attempt - requestEntryTime;
```

`attempt === 1` でリトライがない場合、`request_setup_ms` は小さい (SDKセットアップのみ)。リトライが発生した場合、リトライバジェット全体のオーバーヘッドをキャプチャする。

**OTelスパンに配置する (claude-code とは異なり、claude-code はPerfettoにのみ配置)**: 3つのレベルの理由：

1. **Perfettoがない** — qwen-code には帯域外の可視化レイヤーがない。OTel属性が唯一のチャネルである。
2. **単一トレースデバッグ** — オペレータは `duration_ms=12000, request_setup_ms=11500, ttft_ms=200, sampling_ms=300` を見て、即座に「リトライが11.5秒かかった。モデル自体は高速だった」と診断できる。他のフィールドから `request_setup_ms` を計算するには、`sampling_ms` も公開する必要があるが、それはすでに行っている (D6)。
3. **コストは無視できる** — 1つのINT64属性。既存の `input_tokens`、`output_tokens` 属性と同じオーダー。バックエンド取り込みコストは問題にならない。

### D4 — リトライテレメトリ: `retryWithBackoff` の `onRetry` コールバックオプション + `ApiRetryEvent` + AsyncLocalStorage 伝搬

> **フェーズ4b更新 (設計後の発見)**: このセクションは元々、claude-code の「1つのLLMスパンがリトライループを所有する」パターンを前提として書かれていた。フェーズ4bの実装中に、qwen-code の4つの `retryWithBackoff` 呼び出し箇所 (`client.ts:2109`、`baseLlmClient.ts:235,333`、`geminiChat.ts:2035` — マージ時点の行番号) がすべて `apiCall = () => contentGenerator.generateContent(...)` をラップしていることが判明した。リトライレイヤーは LoggingContentGenerator の**上**に位置する。各リトライ試行は `apiCall()` を新たに呼び出す → 新しい `qwen-code.llm_request` スパン。試行間で共有される単一スパンは存在しない。LoggingContentGenerator 内のアキュムレータは機能しない。
>
> **解決策**: `AsyncLocalStorage` (`packages/core/src/utils/retryContext.ts` の `retryContext`) を介してリトライ状態を伝搬する。`retryWithBackoff` は各 `await fn()` を `retryContext.run({ attempt, requestSetupMs, retryTotalDelayMs }, fn)` でラップする。`LoggingContentGenerator` は同期的な前置きでALSを読み取り、値を `endLLMRequestSpan` に転送する。これにより、元の計画よりも**より豊かな**可観測性が得られる — 試行ごとの各スパンは、独自の `duration_ms` / `ttft_ms` / エラー詳細を持ち、さらに試行ごとの `attempt` / `requestSetupMs` / `retryTotalDelayMs` 属性を介してリトライバジェット内の位置を認識する。
>
> ALSのアプローチは、コードベースの既存のパターン (`promptIdContext`、`subagentNameContext`、`agent-context`) と一致する — 最小限の新しいインターフェースで、よく理解されたセマンティクス。Planモードのレビュープロセスでこの改訂を3ラウンドのレビューで捉え、22の問題をすべてマージ前に解決した。

`retryWithBackoff` は現在 `logRetryAttempt` (`retry.ts:343`) を呼び出しているが、これは `debugLogger.warn` にのみ書き込む。`RetryOptions` インターフェースをオプトインコールバックで拡張する：

```ts
// utils/retry.ts
interface RetryOptions<T> {
  // ... 既存のフィールド ...
  /**
   * オプション。失敗した試行ごとに、バックオフスリープの前に1回呼び出される。
   * 試行番号（1ベース）、エラー、および次の試行までの遅延を受け取る。
   * LLM呼び出しサイトのテレメトリイベントを出力するために使用する。
   * 非LLM呼び出し元 (例: channels/weixin) には undefined を指定し、
   * LLM固有のテレメトリチャネルでサイレントにする。
   */
  onRetry?: (info: RetryAttemptInfo) => void;
}

interface RetryAttemptInfo {
  attempt: number; // 1ベース、debugLogger の出力と一致
  error: unknown;
  errorStatus?: number;
  delayMs: number; // 次の試行までのバックオフ遅延
}
```

4つのLLM呼び出し箇所 (`client.ts:1540`、`baseLlmClient.ts:193,282`、`geminiChat.ts:1039`) は、新しい `ApiRetryEvent` を出力するコールバックを登録する：
```ts
// types.ts — 新しいイベントクラス、ContentRetryEvent と同階層
export class ApiRetryEvent implements BaseTelemetryEvent {
  'event.name': typeof EVENT_API_RETRY;
  'event.timestamp': string;
  model: string;
  prompt_id?: string;
  attempt_number: number; // 1始まり
  error_type: string;
  error_message: string; // 256文字に切り詰め
  status_code?: number;
  retry_delay_ms: number;
  // ... duration_ms は retry_delay_ms に設定されるため、LogToSpanProcessor は
  // 意味のある幅のブリッジスパンを描画する
  duration_ms: number;
}
```

**なぜ新しいイベントクラスで、`ContentRetryEvent` を拡張しないのか**：

- `ContentRetryEvent` には2つの下流コンシューマー（qwen-logger、log-record エクスポート）が存在します。ペイロードを変更すると、それらが壊れるリスクがあります。
- "content retry" という命名は、意味的にコンテンツ回復のリトライ（無効なストリーム、スキーマ修復）を指しており、レート制限リトライまでカバーするように拡張するとスキーマが曖昧になります。
- 新しいイベントは追加的なものであり、コンシューマーに驚きを与えません。

**なぜ `retry.ts` 内部にコールバックを埋め込まないのか**：`retry.ts` は `channels/weixin/src/api.ts`（microsoft メッセージング API リトライ）からも呼び出されます。LLM テレメトリを retry.ts にハードコードすると、非 LLM のリトライに対しても `ApiRetryEvent` が出力されてしまいます。`onRetry` コールバックは呼び出し元ごとにオプトイン方式であり、LLM 呼び出し元はオプトインし、weixin 呼び出し元はオプトインしません。

**ContentRetryEvent との共存**：ContentRetryEvent はそのまま維持され、`geminiChat.ts:806,830` 内のコンテンツ回復リトライをカバーします。ApiRetryEvent は `retryWithBackoff` からのレート制限 / 5xx リトライをカバーします。2つのイベントは異なるレイヤーから発火し、決して重複しません。両方のイベントの既存のログブリッジ動作は `LogToSpanProcessor` によって維持されます。どちらのイベントもアクティブな LLM スパンの下に自動的にネストされます（Phase 1 の配線により、リトライ中は LLM スパンがアクティブであることが保証されています）。

**永続リトライモード（`QWEN_CODE_UNATTENDED_RETRY`）**：単一の 429 ループリクエストで 50 以上のイベントが出力される可能性があります。Phase 4 では出力をレート制限する範囲外とします。本番ボリュームが耐え難い場合は、フォローアップ PR でスパンあたりの上限と集約イベントを追加します。親 LLM スパン（D5）上の集約された `attempt` と `retry_total_delay_ms` は、イベント上限の有無にかかわらず正確なままです。

### D5 — 親 LLM スパンの集約：スカラー属性のみ（マップ型属性は不可）

OTel スパン属性はスカラー（`string | number | boolean | これらの配列`）です。マップ型属性（例：`retry_count_by_status: {429:2, 503:1}`）は JSON シリアル化が必要で、クエリが扱いにくくなります。スキップします。

| 属性                          | 型     | セマンティクス                                                                                                             |
| ----------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------- |
| `attempt`                     | int    | `retryContext.attempt` から取得する 1 始まりの単調増加カウンター（この試行のイテレーション）。常に設定される（リトライコンテキストがない場合はデフォルト 1） |
| `retry_total_delay_ms`        | int    | この試行が開始される前の累積バックオフスリープ時間。直接呼び出しの場合は未定義。attempt 1 の場合は 0。それ以降のリトライ試行では >0 |
| `ttft_ms`                     | int    | D1 に従った TTFT。非ストリーミングまたは最初のチャンクより前に中断されたリクエストでは未定義                             |
| `request_setup_ms`            | int    | D3 に従う                                                                                                               |
| `sampling_ms`                 | int    | D6 に従う                                                                                                               |
| `output_tokens_per_second`    | double | 派生値；`output_tokens / (sampling_ms / 1000)`；`sampling_ms === 0` の場合は未定義                                        |

試行ごとのステータスコード分布（例：「3 回中 2 回が 429 だった」）は、`ApiRetryEvent` レコードのログブリッジスパンからクエリ可能です。親スパンにフラット属性として複製する必要はありません。

**なぜ `sampling_ms` と `output_tokens_per_second` をスパンに含めるのか**：導出可能ですが、多くのスパンをまたいでバックエンドクエリで計算するのは面倒です。`request_setup_ms`（D3）と同様のコストベネフィットです。

### D6 — 4 つのフェーズのうち 3 つで `recordApiRequestBreakdown()` を有効化

`endLLMRequestSpan`（またはそれを呼び出すラッパー）内で、TTFT/セットアップ/サンプリングを計算した後、以下を出力します：

```ts
recordApiRequestBreakdown(config, model, [
  { phase: ApiRequestPhase.REQUEST_PREPARATION, durationMs: requestSetupMs },
  { phase: ApiRequestPhase.NETWORK_LATENCY, durationMs: ttftMs }, // ttftMs = ネットワーク + 最初のトークン生成
  { phase: ApiRequestPhase.RESPONSE_PROCESSING, durationMs: samplingMs },
]);
```

**なぜ `TOKEN_PROCESSING` をスキップするのか**：qwen-code はストリームチャンク処理をインラインで行います（統合は `loggingContentGenerator.ts:644` のラッパーで行われます）。ストリーム後の後処理フェーズは 10ms 未満であり、アーキテクチャ的に明確ではありません。意味のない値を設定するとヒストグラムが汚染されます。enum 値を使用しないままにしても安全です。`apiRequestBreakdownHistogram.record(value, {model, phase})` は単に `phase` をラベルとするヒストグラムであり、欠落したラベルはクエリで単に存在しないだけです。

**なぜ `NETWORK_LATENCY` を再定義しないのか**：仕様名はやや誤解を招きます（純粋なネットワークレイテンシではなく、ネットワーク + 最初のトークン生成です）。しかし：

- この enum は `metrics.ts:330-334` の一部であり、`index.ts:117` からエクスポートされ、テストされています。
- バックエンドのダッシュボードは既にこれらのフェーズ名を参照している可能性があります。
- 名前の変更や新しいフェーズの追加は、ごくわずかな精度向上のために破壊的変更となります。

設計ドキュメントでセマンティクスを文書化し、enum は変更しないでください。

**なぜスパン上で、並列ではないのか**：`recordApiRequestBreakdown` をスパン属性の書き込みと同じ場所に配置し、単一のゲート付き出力ポイント（D7 の冪等性を参照）、単一の順序不変条件を維持します。

### D7 — `endLLMRequestSpan` の冪等性：既存の二重終了ガードによるメトリクス記録のゲート

Phase 1.5（#4302）では、`endLLMRequestSpan` が2回呼び出される可能性があることが確立されました（中止パスとエラーパスの衝突）。`session-tracing.ts:~470` の既存ガード（`if (!activeSpans.has(...)) return;`）は、二重の `span.end()` を防ぎます。Phase 4 のメトリクス記録（D6）は、**同じガードブロック内かつ `span.end()` の前に配置する必要があります**：

```ts
// session-tracing.ts — endLLMRequestSpan
const llmCtx = activeSpans.get(spanRef);
if (!llmCtx) return;            // 既に終了 — 二重終了ガード
activeSpans.delete(spanRef);    // 終了を主張

// ... 期間を計算し、属性を設定 ...
if (metadata) {
  recordApiRequestBreakdown(config, llmCtx.attributes.model, [...]);   // 新規 — ゲート付き
  recordTokenUsageMetrics(...); // 既存
}

span.end();
```

これにより、メトリクスが LLM リクエストごとに **正確に1回** 記録されることが保証され、スパンのライフサイクルと一致します。

**なぜ `loggingContentGenerator` で記録しないのか**：中止パスを認識しません。スパンライフサイクルレイヤーで記録することで、成功/失敗/中止に関わらず、スパンを開いたすべての LLM リクエストが1つのブレークダウンサンプルを生成します。

### D8 — GenAI セマンティックコンベンションの二重出力（プライベート名を正規とする）

OTel GenAI セマンティックコンベンション（セマコンブ）属性に対応する各 Phase 4 属性は、スパン上で2回書き込まれます：

| qwen-code プライベート（正規）            | GenAI セマコンブ（互換層）                    | 単位変換        | 仕様ステータス |
| ----------------------------------------- | --------------------------------------------- | --------------- | -------------- |
| `ttft_ms` (ms, int)                       | `gen_ai.server.time_to_first_token` (s, double) | `ttftMs / 1000` | Experimental   |
| `input_tokens` (int)                      | `gen_ai.usage.input_tokens` (int)              | 同一            | Stable         |
| `output_tokens` (int)                     | `gen_ai.usage.output_tokens` (int)             | 同一            | Stable         |
| `cached_input_tokens` (int)（存在する場合） | `gen_ai.usage.cached_tokens` (int)             | 同一            | Experimental   |
| `qwen-code.model` (string)                | `gen_ai.request.model` (string)                | 同一            | Stable         |

**LLM スパン上の既存のトークン属性名**（Phase 4 より前の `endLLMRequestSpan` で設定）：qwen-code は既に `input_tokens` および `output_tokens` というベアの名前を使用しています。Phase 4 では、`gen_ai.usage.*` の兄弟を追加して #4410 のパターンに合わせます。ベアの名前はそのままにし、**名前を変更しないでください**。

GenAI セマコンブに相当するものがないフィールド（`request_setup_ms`、`sampling_ms`、`retry_total_delay_ms`、`attempt`、`output_tokens_per_second`）は、qwen-code 名前空間の下でのみ出力されます。

**なぜ「プライベートを正規とし、セマコンブを互換とする」のか**：

- 内部ダッシュボード、SLO、debugLogger 出力、qwen-logger RUM、ARMS クエリはすべて `ttft_ms` などを参照します。これらを正規とすることで、フラグ日移行を回避できます。
- Experimental の GenAI セマコンブは、Stable に達する前に `gen_ai.server.time_to_first_token` がリネームされる可能性があります。もしリネームされた場合、セマコンブの出力を更新します。qwen-code の名前は動きません。
- 将来、仕様を認識するバックエンド（Datadog AI ビュー、Honeycomb AI、ARMS GenAI ダッシュボード）は、私たちの関与なしに自動的に `gen_ai.*` 属性を取得します。

**なぜ二重出力で単位変換（ms ↔ 秒）を行うのか**：GenAI セマコンブはレイテンシに double の秒を選択しました。qwen-code は ms の int（スパン上の既存の `duration_ms` と一致）を選択しました。どちらの表現にも価値があり、変換はコストが低いです。

## ヘルパー API（`session-tracing.ts` への追加）

```ts
// session-tracing.ts — LLMRequestMetadata インターフェースを拡張（追加的）
export interface LLMRequestMetadata {
  // ... 既存フィールド: inputTokens, outputTokens, cachedInputTokens, success, error, ...

  /** 成功した試行の開始から最初のユーザー可視コンテンツチャンクまでの時間（ms）。非ストリーミングまたは最初のチャンクより前に中断されたリクエストでは未定義。 */
  ttftMs?: number;

  /** generateContent エントリから成功した試行の開始までの時間（ms）。すべての失敗リトライ＋バックオフを含む。 */
  requestSetupMs?: number;

  /** 最終試行番号（1始まり）。1 = リトライなし。 */
  attempt?: number;

  /** 成功した試行までのすべてのバックオフ遅延の合計（ms）。 */
  retryTotalDelayMs?: number;
}

// 新しいエクスポートヘルパーは不要 — Phase 4 は拡張されたメタデータを使用して既存の startLLMRequestSpan / endLLMRequestSpan を再利用する。
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
  duration_ms: number;  // = retry_delay_ms、LogToSpanProcessor ブリッジスパンの幅を制御

  constructor(opts: { model: string; promptId?: string; attemptNumber: number; error: unknown; statusCode?: number; retryDelayMs: number }) { ... }
}

// constants.ts
export const EVENT_API_RETRY = 'qwen-code.api_retry';

// loggers.ts
export function logApiRetry(config: Config, event: ApiRetryEvent): void { ... }
```

```ts
// utils/retry.ts — RetryOptions 拡張
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

// Inside retryWithBackoff, where logRetryAttempt is called today:
options.onRetry?.({ attempt, error, errorStatus, delayMs: actualDelay });
logRetryAttempt(attempt, error, errorStatus); // 既存の debugLogger 呼び出しは変更なし
```

## ライフサイクルの配線

### ストリーミングパス（一般的なケース）

```ts
// loggingContentGenerator.ts:283 — generateContentStream
async generateContentStream(req, userPromptId): Promise<AsyncGenerator<GenerateContentResponse>> {
  const requestEntryTime = Date.now();
  let attemptStart = requestEntryTime;
  const attemptStartTimes: number[] = [attemptStart];
  let retryTotalDelayMs = 0;
  let finalAttempt = 1;

  // 既存の startLLMRequestSpan を使用（Phase 1）
  // 使用中のリトライレイヤーに onRetry コールバックを渡す：
  const onRetry: RetryAttemptInfo & { invoke: ... } = (info) => {
    finalAttempt = info.attempt + 1;        // これから attempt N+1 を開始する
    retryTotalDelayMs += info.delayMs;
    attemptStart = Date.now() + info.delayMs; // 概算；実際のリセットは次の試行の先頭で行われる
    attemptStartTimes.push(attemptStart);
    // ApiRetryEvent を出力
    logApiRetry(this.config, new ApiRetryEvent({
      model: req.model,
      promptId: userPromptId,
      attemptNumber: info.attempt,
      error: info.error,
      statusCode: info.errorStatus,
      retryDelayMs: info.delayMs,
    }));
  };

  // ストリームラッパーが最初のユーザー可視チャンクを検出：
  return this.processStreamGenerator(stream, ..., {
    onFirstUserVisibleChunk: (now) => {
      ttftMs = now - attemptStart;
    },
  });
}
```

スパン終了時（既に Phase 1 の `endLLMRequestSpan` フロー内）、新しいフィールドを `LLMRequestMetadata` に含めます：

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

`generateContent`（`loggingContentGenerator.ts:212`）はストリーミングチャンクを生成しません。TTFT は `undefined` です。`request_setup_ms` は依然として意味を持ちます（リトライオーバーヘッドをキャプチャ）。ブレークダウンメトリクスは 3 フェーズではなく 2 フェーズ（REQUEST_PREPARATION + RESPONSE_PROCESSING。ここで `RESPONSE_PROCESSING = duration_ms - request_setup_ms`）を記録します。

### リトライレイヤー統合（4ヶ所）

4 つの LLM `retryWithBackoff` 呼び出しサイトのそれぞれに `onRetry` を追加します：

```ts
// client.ts:1540（baseLlmClient.ts:193, 282、geminiChat.ts:1039 も同様）
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
    // LoggingContentGenerator のローカルリトライアキュムレータにもフィードバックする
    // （スコープ内の場合 — LoggingContentGenerator を経由しない呼び出し元の場合、
    // LLM スパンはメタデータパスを通じて依然として `attempt` と `retry_total_delay_ms` を取得する。
    // endLLMRequestSpan は LLM レイヤーで呼び出されるため）
  },
});
```

非 LLM 呼び出し元（`channels/weixin/src/api.ts`）は **`onRetry` を登録しません** — そのリトライに対して `ApiRetryEvent` は出力されず、現在の動作と一致します。

## 並行安全性 — 重要な保証

`LoggingContentGenerator` インスタンスは共有されます（`ContentGenerator` ごとに1つ、`contentGenerator.ts:377`）。3つの同時 `generateContentStream` 呼び出し（例：3つのサブエージェントが `coreToolScheduler.runConcurrently` 経由でファンアウト）は、`generateContentStream` の3つの独立したクロージャを実行します：

```
call_A: attemptStart_A, ttftMs_A, ... (クロージャ)
call_B: attemptStart_B, ttftMs_B, ... (クロージャ)
call_C: attemptStart_C, ttftMs_C, ... (クロージャ)
```

呼び出しごとのローカル変数は決して重複しません。ストリームチャンクは各呼び出しのローカル `attemptStart` に対して検出されます。スパン属性は各呼び出し自身の `endLLMRequestSpan` で設定されます。

`AsyncLocalStorageContextManager`（NodeSDK によって `sdk.ts:273` で登録）は、アクティブな OTel コンテキスト、したがって `startLLMRequestSpan` に渡される親スパンがファイバーごとに正しいことを既に保証しています。

## 変更するファイル

| ファイル                                                                         | 変更内容                                                                                                                                                                                                                                    | 推定LOC |
| -------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| `packages/core/src/telemetry/constants.ts`                                       | `EVENT_API_RETRY` 定数を追加                                                                                                                                                                                                               | +2      |
| `packages/core/src/telemetry/types.ts`                                           | `ApiRetryEvent` クラス＋ユニオンメンバーを追加                                                                                                                                                                                              | +40     |
| `packages/core/src/telemetry/loggers.ts`                                         | `logApiRetry()` 関数を追加                                                                                                                                                                                                                  | +20     |
| `packages/core/src/telemetry/qwen-logger/qwen-logger.ts`                         | RUM 下流の一貫性のために `logApiRetryEvent()` を追加                                                                                                                                                                                        | +20     |
| `packages/core/src/telemetry/session-tracing.ts`                                 | `LLMRequestMetadata` を拡張（ttftMs、requestSetupMs、attempt、retryTotalDelayMs）；`endLLMRequestSpan` を拡張して新しい属性、ブレークダウンメトリクス、二重出力 gen_ai.* を設定                                                                    | +60     |
| `packages/core/src/telemetry/metrics.ts`                                         | `endLLMRequestSpan` 内部の `recordApiRequestBreakdown` 呼び出しサイトを配線（既存のレコーダーに変更なし）                                                                                                                                     | 0       |
| `packages/core/src/utils/retry.ts`                                               | `onRetry?: (info: RetryAttemptInfo) => void` を RetryOptions に追加；`RetryAttemptInfo` をエクスポート；既存の logRetryAttempt サイトでコールバックを呼び出し                                                                                     | +25     |
| `packages/core/src/core/loggingContentGenerator/loggingContentGenerator.ts`      | TTFT キャプチャ：メソッドローカルアキュムレータ＋`hasUserVisibleContent` ヘルパー＋ストリームラッパー内の最初のチャンク検出；新しいメタデータを `endLLMRequestSpan` に渡す                                                                      | +80     |
| `packages/core/src/core/client.ts`                                               | `client.ts:1540` の `retryWithBackoff` 呼び出しサイトで `onRetry` コールバックを配線                                                                                                                                                          | +15     |
| `packages/core/src/core/baseLlmClient.ts`                                        | 2つの `retryWithBackoff` 呼び出しサイトで `onRetry` コールバックを配線                                                                                                                                                                     | +25     |
| `packages/core/src/core/geminiChat.ts`                                           | `geminiChat.ts:1039` の `retryWithBackoff` 呼び出しサイトで `onRetry` コールバックを配線                                                                                                                                                     | +15     |
| `packages/core/src/telemetry/session-tracing.test.ts`                            | `endLLMRequestSpan` が ttft_ms / request_setup_ms / attempt / retry_total_delay_ms / sampling_ms / output_tokens_per_second + gen_ai 二重出力 + ブレークダウンメトリクス（各フェーズ）+ 冪等終了を設定することをテスト                                     | +120    |
| `packages/core/src/core/loggingContentGenerator/loggingContentGenerator.test.ts` | `hasUserVisibleContent`（text / functionCall / inlineData / executableCode / thought / role-only / usage-only）；同時呼び出しが相互汚染しない；最初のチャンクより前に中断された場合 TTFT は未定義；非ストリーミングでは TTFT 未定義                   | +100    |
| `packages/core/src/utils/retry.test.ts`                                          | `onRetry` が失敗した試行ごとに正しい `attempt`、`delayMs`、`error`、`errorStatus` で呼び出されることをテスト；`onRetry` がない場合はサイレント（テレメトリ出力なし）                                                                             | +50     |
| `packages/core/src/telemetry/loggers.test.ts`                                    | `logApiRetry` が期待されるペイロードで LogRecord を出力すること；LogToSpanProcessor を介してアクティブな LLM スパン下のネストされたスパンにブリッジすることをテスト                                                                              | +40     |
```
合計: 14ファイル、約610 LOC。フェーズ2 (#4321) より大きいですが、フェーズ3 (#4410) と同等であり、統合範囲（4つのリトライ箇所 + テレメトリー配管 + ストリーミングラッパー）の広さを考慮すると妥当です。

レビューでサイズが問題になった場合は、**フェーズ4a + 4b + 4c** に分割します:

- **4a** (~200 LOC): TTFTキャプチャ + 拡張された `LLMRequestMetadata` + デュアルエミット。それ単体で価値があります（初日からTTFTの可視性が得られます）。
- **4b** (~250 LOC): `onRetry` コールバック + `ApiRetryEvent` + 4つの呼び出し元への配線。**独立したバグ修正**であり、`retryWithBackoff` のテレメトリーギャップを埋めます。
- **4c** (~160 LOC): `recordApiRequestBreakdown` の有効化 + 親スパン集約属性（`attempt`、`retry_total_delay_ms`、`sampling_ms`、`output_tokens_per_second`）。4a + 4b に依存します。

## テスト戦略

| テスト                                                                                                                                         | 何を証明するか                        |
| -------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------- |
| `hasUserVisibleContent` が text/functionCall/inlineData/executableCode/thought に対して true を返す                                            | パートタイプ間でのD1セマンティクス        |
| `hasUserVisibleContent` が role-only および usage-only チャンクに対して false を返す                                                             | D1の negative ケース                     |
| ストリーミング: TTFTが試行開始から最初のユーザー可視チャンクまで測定される                                                                      | エンドツーエンドのTTFT検出             |
| ストリーミング: ユーザー可視チャンクの前にストリームが中断された場合、TTFTは未定義                                                                    | エッジケース                             |
| ストリーミング: TTFTが（最初の試行ではなく）最終試行の開始から計算される                                                                      | D3 — リトライ時のTTFTリセット          |
| 非ストリーミング: TTFTは未定義のまま                                                                                                        | S3の決定                           |
| 同時の `generateContentStream` 呼び出しがTTFTを相互汚染しない                                                                        | D2 — メソッドローカルな保証           |
| `endLLMRequestSpan` がすべてのフェーズ4属性（ttft_ms、request_setup_ms、sampling_ms、attempt、retry_total_delay_ms、output_tokens_per_second）を設定する | 属性の存在                    |
| `endLLMRequestSpan` が gen_ai.server.time_to_first_token + gen_ai.usage.\* + gen_ai.request.model をデュアルエミットする                                    | D8 デュアルエミット                          |
| `endLLMRequestSpan` がストリーミングでは3フェーズ、非ストリーミングでは2フェーズで breakdown メトリクスを記録する                                                | D6                                    |
| `endLLMRequestSpan` が2回呼び出される: メトリクスは正確に1回記録され、属性は再設定されない                                                             | D7 冪等性                        |
| `retryWithBackoff` と `onRetry`: 失敗した試行ごとに正しい引数でコールバックが呼び出される                                                     | D4 コールバック契約                  |
| `onRetry` なしの `retryWithBackoff`: テレメトリーは出力されない（非LLM呼び出し元ではサイレント）                                                      | P2 — channels/weixin スコープの保護 |
| `client.ts` / `baseLlmClient.ts` / `geminiChat.ts` のリトライ呼び出し箇所が、リトライ時に `ApiRetryEvent` を出力する                                             | 4箇所でのD4統合          |
| `ApiRetryEvent` LogRecord が LogToSpanProcessor を介して、アクティブなLLMスパンの下の子スパンにブリッジされる                                               | トレースツリーの正確性                |
| LLMスパンの `attempt` フィールドがリトライ時の最終試行番号を正しく反映する                                                               | D5 集約                        |
| LLMスパンの `retry_total_delay_ms` が onRetry の遅延を正しく合計する                                                                                | D5 集約                        |
| `sampling_ms === 0`（ストリーミングなし）の場合、`output_tokens_per_second` は未定義                                                                 | ゼロ除算の回避                  |

## エッジケース

| ケース                                                                    | 処理                                                                                                                                                                                                                 |
| ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| チャンクが到着する前にストリームが中断される                                  | `ttftMs = undefined`、`sampling_ms = undefined`、`output_tokens_per_second = undefined`となります。`attempt`、`request_setup_ms`は設定されたままです。`success = false`                                                                      |
| 最初のチャンク到着後にストリームが中断される                                         | `ttftMs`が設定されます; `sampling_ms` = `duration_ms - ttftMs - request_setup_ms`; 部分的な応答時間を反映します。`success = false`                                                                                               |
| リトライが試行1で成功する（リトライなし）                                | `attempt = 1`、`retry_total_delay_ms = 0`、`ApiRetryEvent`は出力されず、breakdownメトリクスは `request_setup_ms` が0に近い値を記録します                                                                                            |
| 永続リトライモードで50回以上の試行                                      | 50以上の `ApiRetryEvent` レコードが出力されます（上限設定はスコープ外で延期）; LLMスパン `attempt = 51`、`retry_total_delay_ms = 全遅延の合計`。オペレーターはスパンで集約ビューを確認; 完全な試行ごとの詳細はログブリッジスパンで確認可能 |
| 非LLMの `retryWithBackoff` 呼び出し元（channels/weixin）                     | `onRetry` が登録されていません; 既存の `debugLogger.warn` のみが発火します。`ApiRetryEvent` は出力されません; breakdownメトリクスも出力されません（呼び出し元がLLMサイトではないため）                                                                                      |
| `endLLMRequestSpan` が2回呼び出される（abort + error の競合）                   | フェーズ1.5のガードにより、`activeSpans.delete()` が2回目の呼び出しで早期リターンします; `recordApiRequestBreakdown` はガード内にあり、正確に1回記録されます                                                                           |
| Anthropicの `message_start` チャンクがコンテンツより先に到着する                   | `hasUserVisibleContent` はこれに対して false を返します（text/functionCallなどのパートがないため）; TTFTは後続の `content_block_delta` チャンクまでトリガーされません                                                                     |
| OpenAIの最初のチャンクに空の `delta.content` と `role` のみが含まれる           | `hasUserVisibleContent` は false を返します; TTFTは空でないデルタを持つ最初のチャンクまでトリガーされません                                                                                                                         |
| ツール呼び出しのみの応答（テキストなし）                                       | `functionCall` パートを含む最初のチャンクがTTFTをトリガーします; `output_tokens_per_second` はツール呼び出しのトークン数に対して計算されます                                                                                                    |
| 同時サブエージェント（3つの進行中の呼び出し）                                | 各呼び出しのクロージャは、独自の `attemptStart`、`ttftMs`、`attemptStartTimes` を持ちます。呼び出しごとのスパンは、`endLLMRequestSpan` で独自のメタデータを受け取ります。インターリーブは発生しません（D2）                                                      |
| openai-sdk 内でのSDKレベルのリトライ（`maxRetries=3`）                    | qwen-code テレメトリーからは不可視 — retryWithBackoff がリクエストを認識する前にSDK内で完全に発生します。`attempt` は retryWithBackoff の試行のみを反映します。スコープ外です（「スコープ外」を参照）                              |
| `gen_ai.server.time_to_first_token` の仕様変更がStableになる前のリネーム | 単一ファイルの更新: `session-tracing.ts:endLLMRequestSpan`。qwen-code ネイティブの `ttft_ms` は信頼できるソースのままです — ダウンストリームへの影響はありません                                                                                    |
| サブエージェントのLLMリクエスト                                                  | 親はサブエージェントスパンです（フェーズ3）。フェーズ4のフィールドは正しくネストされます。`qwen-code.subagent.id` でグループ化された集約により、サブエージェントごとのLLMパフォーマンスが得られます — 設計ドキュメントで将来対応、簡単なフォローアップです                                     |
| 長い思考ブロックを持つ推論モデル                                | 最初の `thought` パートがTTFTをトリガーします; `sampling_ms` には思考フェーズと回答フェーズの両方が含まれます。別々のメトリクスへの分割は延期されます                                                                                           |

## ロールバック

この変更は、OTelおよびメトリクスレベルで追加的です — すべての新しい属性はオプションであり、すべての新しいイベントは新しいクラスです。新しいフィールドでフィルタリングしない既存のダッシュボードは、変更なく動作し続けます。

動作に影響を与える変更:

- 新しい `ApiRetryEvent` LogRecord が流れ始める → ログボリュームがリトライ率に比例して増加します（通常、リクエストの1%未満がリトライします）。必要に応じてSDKレイヤーでLogRecordをサンプリングすることで軽減できます。
- 新しい breakdown メトリクス `qwen-code.api.request.breakdown` が時系列を生成し始める → Prometheusのカーディナリティが若干増加します（`{model, phase}` — 制限付き）。
- `output_tokens_per_second` 派生属性は、「すべての属性」でフィルタリングするダッシュボードでは異常に見える可能性があります — 文書化します。

ロールバックパス: 単一のPR（または4a/4b/4cのそれぞれ独立して）を元に戻します。すべての新しいフィールドは防御的なデフォルト値（undefined / 0）を使用し、スパン構造を変更しません。

## シーケンス

- **フェーズ3 (#4410、レビュー中) の後**: ハードな依存関係ではありません。フェーズ4の属性は、親が `qwen-code.subagent`（フェーズ3）であろうと `qwen-code.interaction`（フェーズ1）であろうと、`qwen-code.llm_request` スパンにアタッチされます。フェーズ3を先に導入して、サブエージェントサブツリー下での試行ごとの集約が自然に機能するようにすることを推奨します。
- **#4384 から独立**（`traceparent` + `X-Qwen-Code-Session-Id` のアウトバウンド伝搬）。これらはHTTPレイヤーに影響します; フェーズ4はストリーム/リトライ/メトリクスレイヤーに影響します。
- **`clearDetailedSpanState` チャット圧縮フォローアップから独立** (#4097 フォローアップ)。対象領域が異なります。

## 未解決の質問

1. **`onRetry` コールバックの発火セマンティクス**: バックオフスリープ**前**（現在の提案）と**後**（次の試行が開始されようとしているとき）、どちらで呼び出されるべきか？ 前者の方がシンプルです — コールバックはすべての情報を即座に利用できます; 後者の場合、完了したばかりの遅延を個別にキャプチャする必要があります。スリープ前が推奨です; コールバック契約に文書化します。
2. **LLMスパン上の試行ごとのタイミング**: `attempt_durations_ms: number[]` 配列を追加すべきか？ OTelはプリミティブ属性の配列をサポートしています。「N回目の試行のうち、どれが遅かったか」の診断に役立ちます。同等の情報はログブリッジスパンがすでに保持しているため、本番データが需要を示すまで延期します。
3. **永続リトライモードの出力上限**: `attempt > N` のどの閾値でサンプリングを開始すべきか？ `N = 5` で1/10? `N = 10` でサマリーのみ？ 本番ボリュームデータが得られるまで延期します。
4. **`TOKEN_PROCESSING` フェーズ**: 列挙値を休眠状態のままにするか、何か（例: 統合時間）に配線するか？ 延期 — 実際のユースケースを待ちます。
5. **サブエージェントレベルのLLMロールアップ**: フェーズ4が導入されれば、簡単なフォローアップです — サブエージェントサブツリーごとに `ttft_ms`/`output_tokens`/`input_tokens` を合計します。フェーズ4のスコープではありませんが、データフローによって可能になります。