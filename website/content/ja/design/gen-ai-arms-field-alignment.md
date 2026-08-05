# GenAI と ARMS のフィールド整合

## Scope and standards baseline

この設計は、OpenTelemetry GenAI セマンティック規約と Alibaba Cloud ARMS LLM Trace の間で名前、型、意味が一致する、最初の Qwen Code スパン属性のセットを整合させる。スパン名、スパン種別、親子関係、リトライトポロジは変更しない。また、オプトインの ARMS 専用エンドユーザー識別拡張も文書化する。

OpenTelemetry GenAI 規約は現在も Development ステータスである。この変更はコミット
[`2e994c6d59a93bb4fc1752c5378eedb9b8e14d6b`](https://github.com/open-telemetry/semantic-conventions-genai/tree/2e994c6d59a93bb4fc1752c5378eedb9b8e14d6b) に固定する:

- [Inference spans](https://raw.githubusercontent.com/open-telemetry/semantic-conventions-genai/2e994c6d59a93bb4fc1752c5378eedb9b8e14d6b/docs/gen-ai/gen-ai-spans.md)
- [Agent spans](https://raw.githubusercontent.com/open-telemetry/semantic-conventions-genai/2e994c6d59a93bb4fc1752c5378eedb9b8e14d6b/docs/gen-ai/gen-ai-agent-spans.md)
- [GenAI registry](https://raw.githubusercontent.com/open-telemetry/semantic-conventions-genai/2e994c6d59a93bb4fc1752c5378eedb9b8e14d6b/model/gen-ai/registry.yaml)

ストリーミング属性は、[OpenTelemetry Semantic Conventions v1.41.0](https://github.com/open-telemetry/semantic-conventions/blob/v1.41.0/docs/gen-ai/gen-ai-spans.md) に固定した狭い補足である。この補足は `gen_ai.request.stream` と `gen_ai.response.time_to_first_chunk` のみを採用し、上記ベースライン全体のアップグレードではない。

ARMS のベースラインは [LLM Trace field definitions](https://help.aliyun.com/zh/arms/application-monitoring/developer-reference/llm-trace-field-definition-description) である。いずれのベースラインのアップグレードにも、このマトリクスの再生成とレビューが必要である。

## Field contract

| スパン       | このフェーズで出力する標準属性                                                                                                                                                                                          | 出典と省略ルール                                                                                                                                                          |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| LLM          | `gen_ai.operation.name`, `gen_ai.provider.name`, `gen_ai.conversation.id`, `gen_ai.request.model`                                                                                                                        | スパン作成時に書き込む。Conversation ID は既存のセッション ID である。                                                                                                     |
| LLM request  | `gen_ai.request.choice.count`, `gen_ai.request.max_tokens`, `gen_ai.request.temperature`, `gen_ai.request.top_p`, `gen_ai.request.frequency_penalty`, `gen_ai.request.presence_penalty`, `gen_ai.request.stop_sequences` | 最初のプロバイダー最終 SDK リクエストオブジェクトから読み取る。無効または取得できない値は省略し、SDK やサーバーのデフォルトは推測しない。                                 |
| LLM stream   | `gen_ai.request.stream`, `gen_ai.response.time_to_first_chunk`                                                                                                                                                           | ストリーミングリクエストは `true` を出力し、非ストリーミングリクエストは標準のストリームフラグを省略する。最初のチャンク時刻は、最初の正規化レスポンス到着後に秒単位で出力する。 |
| LLM input    | `gen_ai.input.messages`, `gen_ai.system_instructions`, `gen_ai.tool.definitions`                                                                                                                                         | 同じ最初のプロバイダー最終リクエストからのセンシティブなコンパクト JSON。個々の完全な値は、無効またはサイズ超過の場合に独立して省略される。                                  |
| LLM response | `gen_ai.response.id`, `gen_ai.response.model`, `gen_ai.response.finish_reasons`                                                                                                                                          | プロバイダーレスポンスデータのみ。レスポンスモデルの欠落は、リクエストモデルへの置き換えではなく省略とする。候補の finish reason はすべて候補インデックス順に並べる。          |
| LLM output   | `gen_ai.output.type`, `gen_ai.output.messages`                                                                                                                                                                           | 出力タイプはサポートされている Gemini/Vertex リクエスト設定の場合に出力する。センシティブな出力メッセージは最終の物理リクエスト試行から取得し、すべての候補を保持する。     |
| LLM usage    | `gen_ai.usage.input_tokens`, `gen_ai.usage.output_tokens`, `gen_ai.usage.cache_read.input_tokens`, `gen_ai.usage.cache_creation.input_tokens`                                                                            | プロバイダーが報告した非負の安全な整数のみ。明示的なゼロは保持する。合計のみが報告された場合、input/output は推定せず省略する。                                            |
| Tool         | `gen_ai.operation.name=execute_tool`, `gen_ai.tool.name`, `gen_ai.tool.description`, `gen_ai.tool.type=function`, `gen_ai.tool.call.id`, `gen_ai.tool.call.arguments`, `gen_ai.tool.call.result`                         | description はセンシティブでない静的なレジストリメタデータである。センシティブな引数は実行された呼び出しを反映し、result は成功したツール呼び出しの場合のみ出力する。        |
| Agent        | `gen_ai.operation.name=invoke_agent`, `gen_ai.agent.name`, `gen_ai.agent.description`, `gen_ai.conversation.id`, 任意の `gen_ai.request.model`                                                                           | description は既存の 1024 UTF-16 コード単位の切り捨て閾値を使用し、サロゲートペアを分割しない。内部の呼び出し ID は非公開のままである。                                    |

完全な標準等価物を持たないプライベート属性は、以下で明示的に削除対象として列挙されない限り、互換性のために利用可能なまま残る。完全等価なプライベートエイリアスと無効な GenAI エイリアスは、デュアルライト期間なしで削除される:

| 削除される属性                                       | 代替                                                                                                                  |
| ------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------- |
| LLM `qwen-code.model`                                  | `gen_ai.request.model`。interaction スパンは GenAI inference スパンではないため、引き続き `qwen-code.model` を使用する |
| LLM `response_id`                                      | `gen_ai.response.id`。API レスポンス/エラーログは既存の `response_id` スキーマを保持する                              |
| LLM `input_tokens`                                     | プロバイダーが input の内訳を報告する場合の `gen_ai.usage.input_tokens`                                              |
| LLM `output_tokens`                                    | プロバイダーが output の内訳を報告する場合の `gen_ai.usage.output_tokens`                                            |
| LLM `cached_input_tokens`                              | プロバイダーがキャッシュ読み取りを報告する場合の `gen_ai.usage.cache_read.input_tokens`                              |
| `qwen-code.tool` スパンの `tool.name`                  | `gen_ai.tool.name`。ユーザーによるブロックとフックのスパンは引き続き `tool.name` を使用する                          |
| `gen_ai.usage.cached_tokens`                           | プロバイダーがキャッシュ読み取りを報告する場合の `gen_ai.usage.cache_read.input_tokens`                              |
| LLM `llm_request.stream`                               | `gen_ai.request.stream`。ストリーミングは `true` を出力し、非ストリーミングはセマンティック規約に従い属性を省略する        |
| `gen_ai.server.time_to_first_token`                    | 出力しない。標準の最初のチャンク属性と等価ではないため                                                               |
| `gen_ai.usage.reasoning_tokens`                        | このベースラインに ARMS/GenAI 共通属性はない。引き続きプライベートな `thoughts_token_count` を問い合わせる                     |
| LLM `system_prompt*`                                   | `gen_ai.system_instructions`。OpenAI の system/developer メッセージは `gen_ai.input.messages` で表現する             |
| LLM `tools`、`tool_schema` イベント                    | `gen_ai.tool.definitions`                                                                                             |
| LLM `response.model_output*`                           | `gen_ai.output.messages`                                                                                              |
| Tool `tool_input*`                                     | `gen_ai.tool.call.arguments`                                                                                          |
| Tool `tool_result*`                                    | `gen_ai.tool.call.result`                                                                                             |
| `tools_count`、ハッシュ/プレビュー/長さ/切り捨てメタデータ | 標準等価物なし。削除                                                                                       |

`gen_ai.response.finish_reasons` は、以前の Gemini 正規化値ではなく、すべての候補についてプロバイダーの生の文字列を保持するようになった。`STOP` や `MAX_TOKENS` などの値でフィルタリングする既存のクエリは、`stop`、`length`、`tool_calls`、`end_turn` などのプロバイダー値へ移行する必要がある。

`gen_ai.response.time_to_first_chunk` は、ラップされたプロバイダー呼び出しの直前から、`LoggingContentGenerator` が観測した最初の正規化 `GenerateContentResponse` までの単調タイマーを使用する。プロバイダーアダプターは、ログラッパーに到達する前に生プロトコルフレームをフィルタリングまたはマージする場合があるため、アダプターが破棄したフレーム（たとえば OpenAI パイプラインの空レスポンスフィルター）はこの測定から除外され、記録値は真の最初のネットワークフレームより遅くなる場合がある。アダプターのフィルタリングを通過したメタデータのみ、または usage のみの正規化レスポンスはチャンクとしてカウントされる。この属性はストリームが後で失敗、中断、またはタイムアウトしても保持され、チャンクが到着しなかった場合は省略される。

内部の `ttftMs` タイマーは引き続き最初のユーザー可視出力までのレイテンシであり、`ApiResponseEvent.ttft_ms`、`sampling_ms`、`output_tokens_per_second`、および API リクエスト内訳メトリクを駆動し続ける。したがって、`duration_ms - gen_ai.response.time_to_first_chunk * 1000` は `sampling_ms` ではない。

既存のストリーミングスパンのクエリは `llm_request.stream=true` を `gen_ai.request.stream=true` に置き換えるべきである。非ストリーミングのスパンは `gen_ai.request.stream` の不在で識別される（古い `llm_request.stream=false` フィルターはゼロ行にしかマッチしなくなる）。スパンの `ttft_ms` は引き続き最初のユーザー可視出力までのレイテンシとして利用可能であり、`gen_ai.response.time_to_first_chunk` は最初の正規化チャンクまでのレイテンシを秒単位で測定する独立した標準属性である。

## Provider and operation resolution

解決は、有効な content-generator 設定に対する純粋な関数である。URL、認証情報、任意のプロキシホスト名、またはモデル名から推測した値を返すことはない。

1. Qwen OAuth と `DASHSCOPE_PROXY_BASE_URL` の完全一致は `dashscope` に解決する。
2. 境界安全なホスト名マッチングが、Alibaba Model Studio エンドポイントと内部 Alibaba ゲートウェイ、Azure OpenAI、およびサポートされているサードパーティエンドポイント（DeepSeek、xAI、Mistral、MiniMax、Z.AI、ModelScope、MiMo、OpenRouter、Requesty）を認識する。
3. ホストが不明な場合、既知の `apiKeyEnvKey` が設定されたプロバイダーを識別する。競合時はホストの識別が優先される。
4. 不明なエンドポイントはプロトコルのプロバイダーへフォールバックする: `openai`、`anthropic`、`gcp.gemini`、`gcp.vertex_ai`。

OpenAI 互換、Anthropic、Qwen OAuth のリクエストは operation `chat` を使用する。Gemini と Vertex AI のリクエストは `generate_content` を使用する。

## Request parameters

リクエスト属性は、プロバイダーアダプターがデフォルト、上書き、サポート外フィールドの削除、出力ウィンドウのクランプを適用した後、プロバイダー SDK の呼び出し直前に収集される。これは Qwen Code に見える最終の SDK リクエストオブジェクトであり、元々の論理設定やシリアライズされた HTTP ボディではない。論理 LLM スパンは、そのような最初のリクエストスナップショットのみを記録する。

| 標準属性                             | OpenAI 互換および Qwen OAuth                                   | Anthropic          | Gemini と Vertex AI       |
| ---------------------------------- | ---------------------------------------------------------- | ------------------ | ------------------------- |
| `gen_ai.request.choice.count`      | `n`                                                        | 該当なし     | `config.candidateCount`   |
| `gen_ai.request.max_tokens`        | `max_tokens`、`max_completion_tokens`、または `max_new_tokens` | `max_tokens`       | `config.maxOutputTokens`  |
| `gen_ai.request.temperature`       | `temperature`                                              | `temperature`      | `config.temperature`      |
| `gen_ai.request.top_p`             | `top_p`                                                    | `top_p`            | `config.topP`             |
| `gen_ai.request.frequency_penalty` | `frequency_penalty`                                        | 現在は送信しない | `config.frequencyPenalty` |
| `gen_ai.request.presence_penalty`  | `presence_penalty`                                         | 現在は送信しない | `config.presencePenalty`  |
| `gen_ai.request.stop_sequences`    | `stop`                                                     | `stop_sequences`   | `config.stopSequences`    |

有限の数値と安全な整数は、失敗したプロバイダーリクエストでのゼロや負の値を含め、厳密に保持される。choice count が 1 の場合は省略される。stop sequences は完全な文字列配列でなければならず、OpenAI の単一文字列形式は 1 要素の配列に正規化される。空の配列は保持され、混在配列はフィルタリングではなく省略される。明示的なアダプターのデフォルトは記録されるが、暗黙の SDK やサーバーのデフォルトは推測されない。

複数の OpenAI 互換の出力バジェットエイリアスが存在する場合、存在するすべての値が有効な安全な整数で等しいときのみ、標準の maximum が出力される。値が競合する場合は省略される。互換エンドポイント間に共通の優先順位ルールがないためである。

## Content and tool payloads

センシティブな GenAI コンテンツは、`telemetry.includeSensitiveSpanAttributes` が有効な場合のみ収集される。Qwen Code は `OTEL_INSTRUMENTATION_GENAI_CAPTURE_MESSAGE_CONTENT` を読み取らないため、コンテンツキャプチャのスイッチは単一である。OpenAI 互換、Anthropic、Gemini、Vertex のアダプターは、プロバイダー最終の SDK リクエストと生レスポンス構造を、この設計で固定された JSON スキーマへ変換する。

最初の物理リクエスト試行が、入力メッセージ、システム指示、ツール定義を供給する。レスポンスは generation に紐づく: プロバイダーのフォールバックや required-thinking のリトライは新しいレスポンスアキュムレータを開始し、古い試行からの遅延チャンクは無視される。ストリーミングのアキュムレータは、生チャンクではなく正規化されたパーツを保持する。部分的な失敗は未完了の候補に `error` を付け、明示的な finish reason がない候補がある成功レスポンスは、完全な出力メッセージ属性を省略する。

各 JSON 属性はコンパクトにシリアライズされ、`telemetry.sensitiveSpanAttributeMaxLength` によって独立して制限される。無効、循環、不完全、またはサイズ超過の属性値は全体として省略され、JSON が切り詰められることはない。`gen_ai.tool.definitions` 内では `type` と `name` が必須の識別情報であるため、識別情報が無効な場合は属性全体を省略する。`parameters` は標準スキーマでは任意であり、プロバイダー提供のパラメータスキーマを Draft-07 に正規化できない場合は、その任意のプロパティのみを省略し、順序付きのツール識別情報リストは保持する。空の配列とオブジェクトは、プロバイダーが明示的に送信または返却した場合に保持する。デフォルトの 1 MiB 制限では、アプリケーション側の理論上の最大値は LLM スパンあたり約 4 MiB、Tool スパンあたり 2 MiB のセンシティブ属性である。コレクターやバックエンドはより低い制限を課せる。

ツール引数は、権限と編集フックの後、実行直前の最終呼び出しパラメータからキャプチャされる。ツール結果は、呼び出しと後処理の両方が成功した後、モデルへ返される最終の `FunctionResponse.response` オブジェクトからのみキャプチャされる。両方のルートは JSON オブジェクトでなければならない。`gen_ai.tool.description` は静的なレジストリの description に由来しセンシティブではない。4096 UTF-16 コード単位に制限され、サロゲートペアを保持し、短縮時は `…[truncated]` を付加する。Agent の description とスパンエラーは 1024 単位の制限を維持する。

## Response and usage provenance

プロバイダーコンバーターは、正規化された Gemini の usage オブジェクトに `WeakMap` で内部のプロベナンスを付与する。これは、キャッシュ読み取りフィールドが実際に存在したかどうかと、Anthropic のキャッシュ作成トークンを記録する。これにより公開レスポンスの JSON 形状が保持され、ガベージコレクションが正規化された usage オブジェクトに追随できる。

OpenAI 互換プロバイダーが `total_tokens` のみを報告する場合、正規化された合計は既存の内部コンシューマーが引き続き利用できるが、input/output の分割は合成されず、標準の usage 属性はいずれも出力されない。

OpenAI の `response.model`/`chunk.model` と Anthropic のメッセージモデルは `modelVersion` として保持される。プロバイダーモデルの欠落はトレースでも欠落のままであり、リクエストモデルへのフォールバックは既存の API ログと UI の挙動に限定される。ストリームのマージは、最後に判明しているプロバイダーモデルと usage プロベナンスを終端レスポンスへ引き継ぐ。Anthropic の `message_start` の input とキャッシュ usage は、その後に yield される最初のチャンクに付与され、部分的なストリーム失敗でもプロバイダー報告の usage が保持され、output 数を合成しない。

## ARMS configuration

ARMS の自動 GenAI アプリケーション認識には、このリソース属性が必要である:

```json
{
  "telemetry": {
    "resourceAttributes": {
      "acs.arms.service.feature": "genai_app"
    }
  }
}
```

Qwen Code は、そのベンダー固有のリソース属性や `gen_ai.span.kind` を注入しない。ARMS は `gen_ai.operation.name` から LLM、Tool、Agent のロールを推論できる。

### ARMS end-user identity extension

`gen_ai.user.id` は ARMS スパンの共通属性であり、上記の固定された OpenTelemetry GenAI ベースラインの一部ではない。Qwen Code は、オペレーターが `telemetry.userId` または `QWEN_TELEMETRY_USER_ID` を明示的に設定した場合のみこれを出力する。値は作成時に interaction スパンに設定され、既存のプロセス内コンテキストを通じて LLM、Tool、Agent スパンへ伝播され、ルートにリンクされたフォーク/バックグラウンドエージェントも含まれる。ツール結果の continuation は、スパンの親子関係を変更せず、prompt ID で同じ論理 interaction を解決する。その最小限の識別エントリは、既存の 30 分スパンセーフティネット TTL で期限切れとなる。

値は推測、生成、Resource/ログ/メトリクスへの書き込み、送信 Baggage への格納のいずれも行われない。Qwen Code は `enduser.id` や `user.id` のデュアルライトを行わない。以前の `telemetry.resourceAttributes.user.id` は汎用の Resource 次元のままであり、移行時は明示的に削除する必要がある。この設定はプロセス全体に適用されるため、1 プロセスが 1 エンドユーザーを表す場合のみサポートされる。共有デーモンおよびチャネルデプロイのためのリクエストスコープの識別は、信頼された呼び出し元識別をエンドツーエンドで接続できるまで先送りされる。

## Deferred work

- `seed` と `top_k` は、ベースラインにおいて ARMS と GenAI の型が非互換である。
- Embedding は、トレーシングの前に正しいリクエストモデルのライフサイクルが必要である。
- ARMS の time-to-first-token と OpenTelemetry の time-to-first-chunk は、名前、単位、意味が異なる。Qwen Code はプライベートな `ttft_ms` と並べて標準の `gen_ai.response.time_to_first_chunk` を出力し、ARMS の first-token ダッシュボードへの自動入力は約束しない。
- GenAI スパン命名全体、CLIENT スパン種別、論理リトライトポロジは、別のコンプライアンスプロジェクトである。
