# OpenTelemetry による可観測性

Qwen Code で OpenTelemetry を有効化し、設定する方法を学びます。

- [OpenTelemetry による可観測性](#opentelemetry-による可観測性)
  - [主な利点](#主な利点)
  - [OpenTelemetry 統合](#opentelemetry-統合)
  - [設定](#設定)
  - [Alibaba Cloud Telemetry](#alibaba-cloud-telemetry)
    - [手動 OTLP エクスポート](#手動-otlp-エクスポート)
  - [ローカル Telemetry](#ローカル-telemetry)
    - [ファイルベース出力（推奨）](#ファイルベース出力推奨)
    - [コレクターベースエクスポート（上級者向け）](#コレクターベースエクスポート上級者向け)
  - [ログとメトリクス](#ログとメトリクス)
    - [ログ](#ログ)
    - [メトリクス](#メトリクス)

## 主な利点

- **🔍 使用状況分析**: チーム全体でのインタラクションパターンや機能採用状況を把握
- **⚡ パフォーマンス監視**: 応答時間、トークン消費、リソース使用率を追跡
- **🐛 リアルタイムデバッグ**: ボトルネック、障害、エラーパターンを発生時に特定
- **📊 ワークフロー最適化**: 設定やプロセスを改善するための情報に基づいた意思決定
- **🏢 エンタープライズガバナンス**: チーム間の使用状況監視、コスト追跡、コンプライアンス確保、既存の監視インフラとの統合

## OpenTelemetry 統合

ベンダーニュートラルで業界標準の可観測性フレームワークである **[OpenTelemetry]** 上に構築された Qwen Code の可観測性システムは、以下を提供します。

- **ユニバーサル互換性**: あらゆる OpenTelemetry バックエンド（Alibaba Cloud、Jaeger、Prometheus、Datadog など）にエクスポート可能
- **標準化データ**: ツールチェーン全体で一貫したフォーマットと収集方法を使用
- **将来性のある統合**: 既存および将来の可観測性インフラと接続
- **ベンダーロックインなし**: インストルメンテーションを変更せずにバックエンドを切り替え可能

[OpenTelemetry]: https://opentelemetry.io/
[aliyun-opentelemetry-overview]: https://www.alibabacloud.com/help/en/arms/tracing-analysis/product-overview/what-is-tracing-analysis
[aliyun-opentelemetry-get-started]: https://www.alibabacloud.com/help/en/arms/tracing-analysis/before-you-begin
[aliyun-opentelemetry-console-cn]: https://trace.console.aliyun.com
[aliyun-opentelemetry-console-cn-legacy]: https://tracing.console.aliyun.com
[aliyun-opentelemetry-console-intl]: https://arms.console.alibabacloud.com

## 設定

すべてのテレメトリ動作は `.qwen/settings.json` ファイルで制御されます。これらの設定は環境変数または CLI フラグで上書きできます。

| 設定                               | 環境変数                                             | CLI フラグ                                                | 説明                                                                                                                                                | 値                   | デフォルト               |
| ---------------------------------- | ---------------------------------------------------- | --------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------- | ------------------------ |
| `enabled`                          | `QWEN_TELEMETRY_ENABLED`                            | `--telemetry` / `--no-telemetry`                          | テレメトリの有効/無効                                                                                                                                 | `true`/`false`       | `false`                  |
| `target`                           | `QWEN_TELEMETRY_TARGET`                             | `--telemetry-target <local\|gcp>` _(非推奨)_               | 情報用の送信先ラベル。エクスポータのルーティングは制御しません。データの送信先は `otlpEndpoint` または `outfile` で設定してください。                   | `"gcp"`/`"local"`    | `"local"`                |
| `otlpEndpoint`                     | `QWEN_TELEMETRY_OTLP_ENDPOINT`                      | `--telemetry-otlp-endpoint <URL>`                         | OTLP コレクターエンドポイント                                                                                                                       | URL 文字列           | `http://localhost:4317` |
| `otlpProtocol`                     | `QWEN_TELEMETRY_OTLP_PROTOCOL`                      | `--telemetry-otlp-protocol <grpc\|http>`                  | OTLP トランスポートプロトコル                                                                                                                       | `"grpc"`/`"http"`    | `"grpc"`                 |
| `otlpTracesEndpoint`               | `QWEN_TELEMETRY_OTLP_TRACES_ENDPOINT`               | -                                                         | トレース用のシグナル別エンドポイント上書き（HTTP のみ）                                                                                             | URL 文字列           | -                        |
| `otlpLogsEndpoint`                 | `QWEN_TELEMETRY_OTLP_LOGS_ENDPOINT`                 | -                                                         | ログ用のシグナル別エンドポイント上書き（HTTP のみ）                                                                                                 | URL 文字列           | -                        |
| `otlpMetricsEndpoint`              | `QWEN_TELEMETRY_OTLP_METRICS_ENDPOINT`              | -                                                         | メトリクス用のシグナル別エンドポイント上書き（HTTP のみ）                                                                                            | URL 文字列           | -                        |
| `outfile`                          | `QWEN_TELEMETRY_OUTFILE`                            | `--telemetry-outfile <path>`                              | テレメトリをファイルに保存（OTLP エクスポートを上書き）                                                                                             | ファイルパス         | -                        |
| `logPrompts`                       | `QWEN_TELEMETRY_LOG_PROMPTS`                        | `--telemetry-log-prompts` / `--no-telemetry-log-prompts`  | プロンプトをテレメトリログに含める                                                                                                                   | `true`/`false`       | `true`                   |
| `includeSensitiveSpanAttributes`   | `QWEN_TELEMETRY_INCLUDE_SENSITIVE_SPAN_ATTRIBUTES`  | -                                                         | ユーザープロンプト、システムプロンプト、ツール I/O、モデル出力をネイティブスパン属性として含める（ログ-スパンブリッジスパンに加えて）                | `true`/`false`       | `false`                  |
| `sensitiveSpanAttributeMaxLength`  | `QWEN_TELEMETRY_SENSITIVE_SPAN_ATTRIBUTE_MAX_LENGTH`| -                                                         | 機密性の高いネイティブスパン属性の各コンテンツペイロードの最大 JavaScript 文字列長。バックエンドが大きな属性を拒否する場合は低く設定します。           | `1..104857600`       | `1048576`                |
| `resourceAttributes`               | `OTEL_RESOURCE_ATTRIBUTES` (+ `OTEL_SERVICE_NAME`)  | -                                                         | エクスポートされるすべてのスパン/ログ/メトリクスに付与される静的なリソース属性。以下の「リソース属性」を参照。                                        | `key=value,…`        | `{}`                     |
| `metrics.includeSessionId`         | `QWEN_TELEMETRY_METRICS_INCLUDE_SESSION_ID`         | -                                                         | メトリクスデータポイントに `session.id` を含める。**デフォルトでは無効**。メトリクスバックエンドの時系列ファンアウトを防ぐため。                    | `true`/`false`       | `false`                  |

**真偽値の環境変数に関する注意:** 真偽値の設定（`enabled`、`logPrompts`、`includeSensitiveSpanAttributes`）では、対応する環境変数を `true` または `1` に設定すると機能が有効になります。それ以外の値は無効になります。

**整数の環境変数に関する注意:** `QWEN_TELEMETRY_SENSITIVE_SPAN_ATTRIBUTE_MAX_LENGTH` は設定する場合、正の整数でなければなりません。無効な値の場合、テレメトリ設定の解決に失敗し、エラーとなります（静かにフォールバックしません）。

**機密スパン属性:** `includeSensitiveSpanAttributes` が有効な場合、次の2つのことが起こります。

1. **ネイティブスパン属性（`qwen-code.interaction`、`api.generateContent*`、`tool.<name>`）** が会話内容をそのまま保持します。
   - ユーザープロンプト（`new_context`）
   - システムプロンプト（`system_prompt` — セッションごとに1回フルテキスト、SHA-256 ハッシュで重複排除。以降のスパンでは `system_prompt_hash` + `system_prompt_preview` + `system_prompt_length` のみ保持）
   - ツールスキーマ（`tool_schema` イベントとして出力。こちらもハッシュ重複排除）
   - ツール入力（`tool_input`）とツール結果（`tool_result`）
   - モデル出力（`response.model_output`）

   各コンテンツペイロードは `sensitiveSpanAttributeMaxLength` の JavaScript 文字列単位で切り捨てられます。デフォルトは 1 MiB（`1048576`）（以前の 60 KiB から引き上げ）。古い上限を維持するには `61440` を設定します。制限は `1` から `104857600`（100 MiB）の間である必要があります。ラベル付き属性の場合、`[USER PROMPT]`、`[TOOL INPUT: ...]`、`[TOOL RESULT: ...]` などの固定ラベルは上限にカウントされます。切り捨てマーカーもカウントされます。制限は JavaScript 文字列長で測定され、UTF-8 バイトではありません。そのため、非 ASCII コンテンツは OTLP エクスポート後により多くのバイトを占める可能性があります。ほとんどのペイロードタイプでは、切り捨てられると `*_truncated` と `*_original_length` の両方が追加されます。システムプロンプトは切り捨て時に `system_prompt_truncated` も設定しますが、元の長さには常に存在する `system_prompt_length` を使用します。

2. **ログ-スパンブリッジスパン**（ログエンドポイントなしで HTTP トレースをエクスポートする際に使用）は、削除される代わりに既存の `prompt`、`function_args`、`response_text` フィールドを保持します。

⚠️ **セキュリティ警告:** このフラグを有効にすると、会話履歴全体、`read_file` で読み取られたファイル内容、シェルコマンドとその出力（環境変数や引数内のシークレットを含む）、モデル応答が設定された OTLP バックエンドにストリーミングされます。バックエンドは特権データシンクとして扱ってください。フラグのデフォルトは `false` です。

**コスト / ペイロードサイズ:** デフォルトの上限（1 MiB のシステムプロンプト + 10 のツールコール、各ツールコールは最大 1 MiB の入力 + 1 MiB の結果 + 1 MiB のモデル出力）では、OTLP 圧縮前に最大約 22 MiB の属性ペイロードが生成される可能性があります（さらに、ツール定義が大きいワークスペースでは、出力されるツールスキーマごとに最大 1 MiB）。これは Qwen Code のアプリケーション側の上限であり、すべてのコレクターやバックエンドが単一の属性としてそのサイズを受け入れることを保証するものではありません。スパンが拒否またはドロップされる場合は、`sensitiveSpanAttributeMaxLength` を低く設定し（例：`61440`）、エクスポーターのスループットを監視してください。

この設定では、OTel ログや他のテレメトリシンク内の機密データは無効になりません。非内部 API 応答テレメトリは `response_text` を埋める可能性があるため、OTel ログ、UI テレメトリ、チャット記録はこの設定とは無関係に応答テキストを受信する可能性があります。QwenLogger は `response_text` を含みません。

**HTTP OTLP シグナルルーティング:** HTTP プロトコル（`otlpProtocol: "http"`）を使用する場合、Qwen Code はベースの `otlpEndpoint` にシグナル固有のパス（`/v1/traces`、`/v1/logs`、`/v1/metrics`）を自動的に追加します。例えば、`http://collector:4318` はトレースの場合 `http://collector:4318/v1/traces` になります。URL が既にシグナルパスで終わっている場合はそのまま使用されます。シグナル別エンドポイントの上書き（`otlpTracesEndpoint` など）はベースエンドポイントよりも優先され、そのまま使用されます。gRPC プロトコルはサービスベースのルーティングを使用し、パスは追加しません。

シグナル別エンドポイントの環境変数は、標準の OpenTelemetry 名も受け入れます：`OTEL_EXPORTER_OTLP_TRACES_ENDPOINT`、`OTEL_EXPORTER_OTLP_LOGS_ENDPOINT`、`OTEL_EXPORTER_OTLP_METRICS_ENDPOINT`。`QWEN_TELEMETRY_OTLP_*` のバリアントが `OTEL_*` のバリアントよりも優先されます。

すべての設定オプションの詳細については、[設定ガイド](../../users/configuration/settings.md) を参照してください。

### リソース属性

リソース属性は、OTLP 経由でエクスポートされるすべてのスパン、ログ、メトリクスに付与される静的なキーと値のペアです。これらを使用して、チーム、環境、デプロイメントリージョン、またはバックエンドが関心を持つその他の次元でテレメトリをスライスできます。

2 つのソースがあり、優先順位（低→高）でマージされます。

1. 標準の `OTEL_RESOURCE_ATTRIBUTES` 環境変数
2. `.qwen/settings.json` の `telemetry.resourceAttributes`（キーが競合する場合に環境変数を上書き）

`OTEL_SERVICE_NAME` は別のエスケープハッチです。設定されている場合、他のソースの `service.name` を上書きします（OpenTelemetry 仕様に準拠）。

#### 例

**すべてのテレメトリをチーム/環境でスライス:**

```bash
export OTEL_RESOURCE_ATTRIBUTES="team=platform,env=prod,cost_center=eng-123"
```

**`service.name` を使用してテナントごとのコレクターにルーティング:**

```bash
export OTEL_SERVICE_NAME=qwen-code-ci
```

**共通ベースライン（`~/.qwen/settings.json`）+ ホストごとの上書き:**

```json
{
  "telemetry": {
    "resourceAttributes": {
      "deployment.environment": "production",
      "service.namespace": "engineering-tooling"
    }
  }
}
```

```bash
# 設定を変更せずに一時的なタグを追加:
export OTEL_RESOURCE_ATTRIBUTES="debug_run=true"
```

#### 予約キー

一部のキーは実行時に制御されるため、上書きできません。

- `service.version` — 常に実行中の CLI バージョンに設定されます。任意のソースから設定しようとすると、警告とともに静かに無視されます。
- `session.id` — セッションごとに実行時に注入されます。環境変数または設定からのユーザー提供値は、警告とともに無視されます。理由は、リソース属性はすべてのメトリクスデータポイントに自動的に付与されるため、ユーザーによる上書きを許可すると、以下の「カーディナリティ制御」を回避してしまうからです。スパンとログは常に `session.id` を保持します。

`service.name` は **予約されておらず**、上記の優先順位チェーンに従います。

#### フォーマット

`OTEL_RESOURCE_ATTRIBUTES` は OpenTelemetry 仕様に従います：`key1=value1,key2=value2`。値はパーセントエンコードされます。値内のスペースは `%20` として、**カンマは `%2C`** としてエンコードする必要があります（エンコードされていないカンマは誤った境界で値を分割し、後半は不正としてドロップされます）。不正なペアはテレメトリの起動を失敗させるのではなく、警告とともにスキップされます。

#### トラブルシューティング：ユーザー提供の属性が反映されない場合

予約キー（`service.version`、`session.id`）、不正なペア、非文字列の設定値、無効なパーセントエンコーディングはすべて、OpenTelemetry 診断チャネルを介して警告とともに静かにドロップされます。そのチャネルはデバッグログファイル（`~/.qwen/log/otel-*.log`）にルーティングされ、**コンソールには出力されません**。そのため、静かに失敗しているように見えることがあります。

カスタムリソース属性がエクスポートされるテレメトリに現れない場合：

1. `~/.qwen/log/otel-*.log` で `cannot override`（予約キードロップ）、`Skipping malformed`（不正な環境変数ペア）、または `must be a string`（非文字列設定値）に一致する行を確認します。
2. 環境変数が qwen-code プロセスの環境（シェルだけでなく）に設定され、値がパーセントエンコードされていることを確認します。
3. `telemetry.enabled` が `true` であることを確認します。テレメトリ初期化は有効な場合のみ実行されます。

### カーディナリティ制御

メトリクスはバックエンドで属性セットによって集約されます。属性値の組み合わせが異なるたびに新しい時系列が生成されます。`session.id` のようなカーディナリティの高いフィールドをメトリクスに付与すると、セッション数に比例した時系列ファンアウトが発生し、メトリクスバックエンドのストレージをすぐに枯渇させます。

これを防ぐため、Qwen Code はデフォルトでメトリクスデータポイントからカーディナリティの高い属性を除外します。スパンとログはイベントごとであり影響を受けないため、トレースとログの相関のために `session.id` を引き続き保持します。

#### `telemetry.metrics.includeSessionId`（デフォルト: `false`）

これを `true` に設定すると（設定または `QWEN_TELEMETRY_METRICS_INCLUDE_SESSION_ID=true`）、`session.id` がすべてのメトリクスデータポイントに再び付与されます。

⚠️ **警告:** CLI セッションごとに新しい値が作成されます。この設定をフリートで有効にしたままにすると、メトリクスストレージが爆発します。短期的なデバッグにのみ推奨します。長期的なセッション相関には、代わりにトレースまたはログバックエンドをクエリしてください。

#### 以前のバージョンからの移行

このリリース以前は、`session.id` はデフォルトでメトリクスに付与されていました。Prometheus クエリ / Grafana ダッシュボード / アラートルールがメトリクスの `session_id` を参照している場合、2 つのオプションがあります。

**オプション A** — 短期的なデバッグのために以前の動作を復元:

```bash
export QWEN_TELEMETRY_METRICS_INCLUDE_SESSION_ID=true
```

または:

```json
{
  "telemetry": {
    "metrics": { "includeSessionId": true }
  }
}
```

**オプション B（推奨）** — セッションレベルの分析をメトリクスから移動します。スパンとログは依然として `session.id` を保持し、トレース/ログバックエンド（Jaeger、Tempo、Loki、Alibaba Cloud SLS / ARMS Tracing）はカーディナリティのプレッシャーなしでセッションごとのスライシングをネイティブに処理します。

### 送信 fetch のクライアントサイド HTTP スパン

テレメトリが有効な場合、Qwen Code は `UndiciInstrumentation` を登録し、プロセスが発信するすべての送信 `fetch()` リクエストに対してクライアントサイド HTTP スパンを作成します。これには、LLM SDK（`openai`、`@google/genai`、`@anthropic-ai/sdk`）、MCP StreamableHTTP クライアント、`WebFetch` ツール、IDE 拡張のプロセス外呼び出しが含まれます。このスパンにより、上流のモデル処理時間とは別に、ネットワークレイテンシ（TTFB / 応答本文転送）を確認できます。これは既存の `api.generateContent` スパンだけでは区別できません。

これらのスパンは、他のテレメトリと同様に**自身の** OTLP コレクター（またはファイル出力）に送られます。送信 HTTP リクエスト自体に何が書き込まれるかには影響しません。W3C `traceparent` ヘッダーが送信リクエストストリームにも書き込まれるかどうかは、以下の「送信相関（セキュリティ関連）」で説明する**別の、セキュリティ関連の設定**によって制御されます。

**フィードバックループの回避。** OTel SDK は内部で `fetch` を使用して OTLP データをアップロードします。保護がないと、`fetch` をインストルメントするとこれらのアップロードもトレースされ、それら自体がアップロードされることで無限ループが発生します。Qwen Code の undici インストルメンテーションは、設定された `telemetry.otlpEndpoint` / `telemetry.otlpTracesEndpoint` / `telemetry.otlpLogsEndpoint` / `telemetry.otlpMetricsEndpoint` プレフィックスに一致する URL をスキップする `ignoreRequestHook` を使用して構成されています。ファイル出力モードでは送信 HTTP アップロードがないため、フックは何も行いません。

## 送信相関（セキュリティ関連）

これらの設定は意図的に `telemetry.*` とは**別のトップレベル名前空間**にあります。テレメトリはオペレーター自身の可観測性バックエンドへのデータフローを制御するのに対し、`outboundCorrelation.*` は qwen-code が**サードパーティの LLM プロバイダーエンドポイント（DashScope、OpenAI、Anthropic など）に到達する送信 LLM API リクエストストリームに**クライアントサイド相関データを書き込むかどうかを制御します。受信者が異なり、同意の判断も異なります。**すべての値はデフォルトでオフです。** 根拠の詳細については PR #4390 のレビュー議論を参照してください。

### `outboundCorrelation.propagateTraceContext`

```jsonc
"outboundCorrelation": {
  "propagateTraceContext": false // デフォルト
}
```

`false`（デフォルト）の場合、Qwen Code は OTel SDK に No-op の `TextMapPropagator` をインストールします。UndiciInstrumentation は依然として OTLP コレクター用のクライアント HTTP スパンを作成しますが、`propagation.inject()` は No-op であるため、送信リクエストに **`traceparent` は書き込まれません**。トレース ID はオペレーターのコレクター内に留まります。

`true` の場合、SDK のデフォルトの W3C 複合プロパゲーター（`tracecontext` + `baggage`）がインストールされ、標準の `traceparent` ヘッダーがすべての送信 `fetch` に書き込まれます。

```
traceparent: 00-<32-hex traceId>-<16-hex parentSpanId>-<01-sampled | 00-not-sampled>
```

LLM プロバイダーもオペレーターの OTel コレクターにレポートを送信し、クロスプロセストレースの結合を行う場合（例：DashScope を提供する ARMS Tracing）にのみオプトインしてください。ほとんどのオペレーターにとって値は `false` です。クロスベンダーのトレース継続はニッチな機能です。
**`telemetry.enabled: true` に依存します。** OTel SDK はテレメトリーが有効な場合にのみ初期化されるため、`propagateTraceContext` はその状態でのみ有効になります。テレメトリーが無効な状態で `true` に設定すると、サイレントな no-op になります — SDK なし、プロパゲーターなし、ワイヤー上の `traceparent` なし。ARMS+DashScope の連携設定を行う際は、両方のフラグを確認してください。

```jsonc
{
  "telemetry": {
    "enabled": true,
    "otlpTracesEndpoint": "http://tracing-analysis-...",
  },
  "outboundCorrelation": {
    "propagateTraceContext": true,
  },
}
```

### その他のアウトバウンド相関ヘッダー

`X-Qwen-Code-Session-Id` と `X-Qwen-Code-Request-Id` は、**この PR の対象ではありません**。これらは、同じ `outboundCorrelation.*` 名前空間の下で、それぞれの脅威モデルとオペレーター同意フローを持つ個別のフォローアップ PR で設計・提案される予定です。PR #4390 のレビュー (LaZzyMan) により、次の原則が確立されました。「テレメトリーのスコープに LLM プロバイダーへの識別子送信は含まれない」; 相関ヘッダーの作業は、テレメトリーの下に置くのではなく、独自の設計議論に移ります。

## Aliyun Telemetry

### 手動 OTLP エクスポート

Alibaba Cloud Managed Service for OpenTelemetry で Qwen Code テレメトリーを表示するには、ARMS が提供する OTLP エンドポイントにエクスポートするよう Qwen Code を設定します。

`"target": "gcp"` を設定するだけでは、エクスポート先は構成されません。`otlpEndpoint` が設定されていない場合、Qwen Code はデフォルトで `http://localhost:4317` を使用します。`outfile` が設定されている場合、`otlpEndpoint` より優先され、テレメトリーは Alibaba Cloud に送信されずにファイルに書き込まれます。

1. `.qwen/settings.json` でテレメトリーを有効にし、OTLP エンドポイントを設定します。

   **オプション A: gRPC プロトコル** (標準の OTLP エンドポイント):

   ```json
   {
     "telemetry": {
       "enabled": true,
       "target": "gcp",
       "otlpEndpoint": "https://<your-otlp-endpoint>",
       "otlpProtocol": "grpc"
     }
   }
   ```

   **オプション B: シグナル別エンドポイントを使用した HTTP プロトコル** (例: `/v1/traces` の代わりに `/api/otlp/traces` など、標準以外のパスを使用するバックエンド向け):

   ```json
   {
     "telemetry": {
       "enabled": true,
       "otlpProtocol": "http",
       "otlpTracesEndpoint": "http://<host>/<token>/api/otlp/traces",
       "otlpLogsEndpoint": "http://<host>/<token>/api/otlp/logs",
       "otlpMetricsEndpoint": "http://<host>/<token>/api/otlp/metrics"
     }
   }
   ```

   > **Note:** HTTP プロトコルで `otlpEndpoint` のみを使用する場合 (シグナル別の上書きなし)、Qwen Code は標準の OTLP パス (`/v1/traces`, `/v1/logs`, `/v1/metrics`) をベース URL に追加します。バックエンドが異なるパスを使用する場合は、オプション B に示すようにシグナル別のエンドポイント上書きを使用してください。

2. Alibaba Cloud エンドポイントが認証を必要とする場合は、`OTEL_EXPORTER_OTLP_HEADERS` などの標準的な OpenTelemetry 環境変数を通じて OTLP ヘッダーを指定します (またはシグナル固有のバリアント)。Qwen Code は現在、`.qwen/settings.json` で OTLP 認証ヘッダーを直接公開していません。
3. Qwen Code を実行し、プロンプトを送信します。
4. Managed Service for OpenTelemetry でテレメトリーを表示します:
   - 製品概要:
     [Managed Service for OpenTelemetry とは][aliyun-opentelemetry-overview]
   - はじめよう:
     [Managed Service for OpenTelemetry を使ってみる][aliyun-opentelemetry-get-started]
   - コンソールエントリポイント:
     - 中国本土:
       [trace.console.aliyun.com][aliyun-opentelemetry-console-cn]
       (レガシーコンソール:
       [tracing.console.aliyun.com][aliyun-opentelemetry-console-cn-legacy])
     - インターナショナル:
       [arms.console.alibabacloud.com][aliyun-opentelemetry-console-intl]
   - コンソールで `Applications` を使用してトレースとサービストポロジーを検査します。
   - OTLP エンドポイントとアクセス情報を見つけるには:
     - **新しいコンソール** (`trace.console.aliyun.com` またはインターナショナル): `Integration Center` に移動します。
     - **レガシーコンソール** (`tracing.console.aliyun.com`): `Cluster Configurations` → `Access point information` に移動します。

## Local Telemetry

ローカルでの開発とデバッグのために、テレメトリーデータをローカルにキャプチャできます:

### ファイルベースの出力 (推奨)

1. `.qwen/settings.json` でテレメトリーを有効にします:

   ```json
   {
     "telemetry": {
       "enabled": true,
       "outfile": ".qwen/telemetry.log"
     }
   }
   ```

   > **Note:** `outfile` が設定されている場合、OTLP エクスポートは自動的に無効になります。ファイルのみの出力には `target` や `otlpEndpoint` の設定は不要であり、安全に設定から省略できます。

2. Qwen Code を実行し、プロンプトを送信します。
3. 指定されたファイル (例: `.qwen/telemetry.log`) でログとメトリクスを表示します。

### コレクタベースのエクスポート (上級者向け)

1. 自動化スクリプトを実行します:
   ```bash
   npm run telemetry -- --target=local
   ```
   これにより以下が行われます:
   - Jaeger と OTEL コレクタをダウンロードして起動
   - ローカルテレメトリー用にワークスペースを設定
   - http://localhost:16686 で Jaeger UI を提供
   - ログ/メトリクスを `~/.qwen/tmp/<projectHash>/otel/collector.log` に保存
   - 終了時にコレクタを停止 (例: `Ctrl+C`)
2. Qwen Code を実行し、プロンプトを送信します。
3. http://localhost:16686 でトレースを表示し、コレクタログファイルでログとメトリクスを表示します。

## ログとメトリクス

以下のセクションでは、Qwen Code に対して生成されるログとメトリクスの構造について説明します。

- すべてのログとメトリクスに共通の属性として `sessionId` が含まれます。

### ログ

ログは、特定のイベントのタイムスタンプ付きレコードです。Qwen Code では以下のイベントがログに記録されます:

- `qwen-code.config`: このイベントは、CLI の設定で起動時に 1 回発生します。
  - **属性**:
    - `model` (string)
    - `sandbox_enabled` (boolean)
    - `core_tools_enabled` (string)
    - `approval_mode` (string)
    - `file_filtering_respect_git_ignore` (boolean)
    - `debug_mode` (boolean)
    - `truncate_tool_output_threshold` (number)
    - `truncate_tool_output_lines` (number)
    - `hooks` (string, カンマ区切りのフックイベントタイプ。フックが無効の場合は省略)
    - `ide_enabled` (boolean)
    - `interactive_shell_enabled` (boolean)
    - `mcp_servers` (string)
    - `output_format` (string: "text" または "json")

- `qwen-code.user_prompt`: このイベントは、ユーザーがプロンプトを送信したときに発生します。
  - **属性**:
    - `prompt_length` (int)
    - `prompt_id` (string)
    - `prompt` (string, この属性は `log_prompts_enabled` が `false` に設定されている場合は除外されます)
    - `auth_type` (string)

- `qwen-code.tool_call`: このイベントは、関数呼び出しごとに発生します。
  - **属性**:
    - `function_name`
    - `function_args`
    - `duration_ms`
    - `success` (boolean)
    - `decision` (string: "accept", "reject", "auto_accept", または "modify" (該当する場合))
    - `error` (該当する場合)
    - `error_type` (該当する場合)
    - `content_length` (int, 該当する場合)
    - `metadata` (該当する場合, string -> any の辞書)

- `qwen-code.file_operation`: このイベントは、ファイル操作ごとに発生します。
  - **属性**:
    - `tool_name` (string)
    - `operation` (string: "create", "read", "update")
    - `lines` (int, 該当する場合)
    - `mimetype` (string, 該当する場合)
    - `extension` (string, 該当する場合)
    - `programming_language` (string, 該当する場合)
    - `diff_stat` (json string, 該当する場合): 以下のメンバーを含む JSON 文字列:
      - `ai_added_lines` (int)
      - `ai_removed_lines` (int)
      - `user_added_lines` (int)
      - `user_removed_lines` (int)

- `qwen-code.api_request`: このイベントは、Qwen API にリクエストを行うときに発生します。
  - **属性**:
    - `model`
    - `request_text` (該当する場合)

- `qwen-code.api_error`: このイベントは、API リクエストが失敗した場合に発生します。
  - **属性**:
    - `model`
    - `error`
    - `error_type`
    - `status_code`
    - `duration_ms`
    - `auth_type`

- `qwen-code.api_response`: このイベントは、Qwen API から応答を受信したときに発生します。
  - **属性**:
    - `model`
    - `status_code`
    - `duration_ms`
    - `error` (optional)
    - `input_token_count`
    - `output_token_count`
    - `cached_content_token_count`
    - `thoughts_token_count`
    - `response_text` (該当する場合)
    - `auth_type`

- `qwen-code.tool_output_truncated`: このイベントは、ツール呼び出しの出力が大きすぎて切り詰められた場合に発生します。
  - **属性**:
    - `tool_name` (string)
    - `original_content_length` (int)
    - `truncated_content_length` (int)
    - `threshold` (int)
    - `lines` (int)
    - `prompt_id` (string)

- `qwen-code.malformed_json_response`: このイベントは、Qwen API からの `generateJson` 応答を JSON として解析できない場合に発生します。
  - **属性**:
    - `model`

- `qwen-code.flash_fallback`: このイベントは、Qwen Code がフォールバックとして flash に切り替わったときに発生します。
  - **属性**:
    - `auth_type`

- `qwen-code.slash_command`: このイベントは、ユーザーがスラッシュコマンドを実行したときに発生します。
  - **属性**:
    - `command` (string)
    - `subcommand` (string, 該当する場合)

- `qwen-code.extension_enable`: このイベントは、拡張機能が有効になったときに発生します
- `qwen-code.extension_install`: このイベントは、拡張機能がインストールされたときに発生します
  - **属性**:
    - `extension_name` (string)
    - `extension_version` (string)
    - `extension_source` (string)
    - `status` (string)
- `qwen-code.extension_uninstall`: このイベントは、拡張機能がアンインストールされたときに発生します

### メトリクス

メトリクスは、時間経過に伴う動作の数値測定値です。Qwen Code では以下のメトリクスが収集されます (メトリクス名は互換性のため `qwen-code.*` のままです):

- `qwen-code.session.count` (Counter, Int): CLI 起動ごとに 1 回インクリメントされます。

- `qwen-code.tool.call.count` (Counter, Int): ツール呼び出しをカウントします。
  - **属性**:
    - `function_name`
    - `success` (boolean)
    - `decision` (string: "accept", "reject", または "modify" (該当する場合))
    - `tool_type` (string: "mcp" または "native" (該当する場合))

- `qwen-code.tool.call.latency` (Histogram, ms): ツール呼び出しのレイテンシーを測定します。
  - **属性**:
    - `function_name`
    - `decision` (string: "accept", "reject", または "modify" (該当する場合))

- `qwen-code.api.request.count` (Counter, Int): すべての API リクエストをカウントします。
  - **属性**:
    - `model`
    - `status_code`
    - `error_type` (該当する場合)

- `qwen-code.api.request.latency` (Histogram, ms): API リクエストのレイテンシーを測定します。
  - **属性**:
    - `model`

- `qwen-code.token.usage` (Counter, Int): 使用されたトークンの数をカウントします。
  - **属性**:
    - `model`
    - `type` (string: "input", "output", "thought", または "cache")

- `qwen-code.file.operation.count` (Counter, Int): ファイル操作をカウントします。
  - **属性**:
    - `operation` (string: "create", "read", "update"): ファイル操作の種類。
    - `lines` (Int, 該当する場合): ファイルの行数。
    - `mimetype` (string, 該当する場合): ファイルの MIME タイプ。
    - `extension` (string, 該当する場合): ファイルの拡張子。
    - `model_added_lines` (Int, 該当する場合): モデルによって追加/変更された行数。
    - `model_removed_lines` (Int, 該当する場合): モデルによって削除/変更された行数。
    - `user_added_lines` (Int, 該当する場合): AI が提案した変更でユーザーが追加/変更した行数。
    - `user_removed_lines` (Int, 該当する場合): AI が提案した変更でユーザーが削除/変更した行数。
    - `programming_language` (string, 該当する場合): ファイルのプログラミング言語。

- `qwen-code.chat_compression` (Counter, Int): チャット圧縮操作をカウントします
  - **属性**:
    - `tokens_before`: (Int): 圧縮前のコンテキスト内トークン数
    - `tokens_after`: (Int): 圧縮後のコンテキスト内トークン数