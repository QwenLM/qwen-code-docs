# OpenTelemetryによるオブザーバビリティ

Qwen CodeでOpenTelemetryを有効化・設定する方法を説明します。

- [OpenTelemetryによるオブザーバビリティ](#observability-with-opentelemetry)
  - [主なメリット](#key-benefits)
  - [OpenTelemetryインテグレーション](#opentelemetry-integration)
  - [設定](#configuration)
  - [Aliyunテレメトリ](#aliyun-telemetry)
    - [手動OTLPエクスポート](#manual-otlp-export)
  - [ローカルテレメトリ](#local-telemetry)
    - [ファイルベースの出力（推奨）](#file-based-output-recommended)
    - [コレクターベースのエクスポート（上級者向け）](#collector-based-export-advanced)
  - [ログとメトリクス](#logs-and-metrics)
    - [ログ](#logs)
    - [メトリクス](#metrics)

## 主なメリット

- **🔍 使用状況の分析**: チーム全体のインタラクションパターンや機能の活用状況を把握
- **⚡ パフォーマンス監視**: レスポンスタイム、トークン消費量、リソース使用率を追跡
- **🐛 リアルタイムデバッグ**: ボトルネック、障害、エラーパターンをリアルタイムで特定
- **📊 ワークフローの最適化**: 設定やプロセスを改善するための情報に基づいた意思決定
- **🏢 エンタープライズガバナンス**: チーム全体の使用状況を監視し、コストを追跡し、コンプライアンスを確保し、既存の監視インフラと統合

## OpenTelemetryインテグレーション

ベンダー中立の業界標準オブザーバビリティフレームワークである**[OpenTelemetry]**を基盤として構築されたQwen Codeのオブザーバビリティシステムは以下を提供します:

- **ユニバーサル互換性**: 任意のOpenTelemetryバックエンド（Aliyun、Jaeger、Prometheus、Datadogなど）へのエクスポート
- **標準化されたデータ**: ツールチェーン全体で一貫したフォーマットと収集方法を使用
- **将来を見据えたインテグレーション**: 既存および将来のオブザーバビリティインフラとの接続
- **ベンダーロックインなし**: インストルメンテーションを変更せずにバックエンドを切り替え可能

[OpenTelemetry]: https://opentelemetry.io/
[aliyun-opentelemetry-overview]: https://www.alibabacloud.com/help/en/arms/tracing-analysis/product-overview/what-is-tracing-analysis
[aliyun-opentelemetry-get-started]: https://www.alibabacloud.com/help/en/arms/tracing-analysis/before-you-begin
[aliyun-opentelemetry-console-cn]: https://trace.console.aliyun.com
[aliyun-opentelemetry-console-cn-legacy]: https://tracing.console.aliyun.com
[aliyun-opentelemetry-console-intl]: https://arms.console.alibabacloud.com

## 設定

すべてのテレメトリの動作は`.qwen/settings.json`ファイルで制御します。
これらの設定は環境変数またはCLIフラグで上書きできます。

| 設定                              | 環境変数                                               | CLIフラグ                                                 | 説明                                                                                                                          | 値                | デフォルト              |
| -------------------------------- | -------------------------------------------------- | -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | ----------------- | ----------------------- |
| `enabled`                        | `QWEN_TELEMETRY_ENABLED`                           | `--telemetry` / `--no-telemetry`                         | テレメトリの有効化または無効化                                                                                                          | `true`/`false`    | `false`                 |
| `target`                         | `QWEN_TELEMETRY_TARGET`                            | `--telemetry-target <local\|gcp>` _(deprecated)_         | 情報提供用の送信先ラベル。エクスポーターのルーティングは制御しません。データの送信先は`otlpEndpoint`または`outfile`で設定してください | `"gcp"`/`"local"` | `"local"`               |
| `otlpEndpoint`                   | `QWEN_TELEMETRY_OTLP_ENDPOINT`                     | `--telemetry-otlp-endpoint <URL>`                        | OTLPコレクターエンドポイント                                                                                                              | URL文字列        | `http://localhost:4317` |
| `otlpProtocol`                   | `QWEN_TELEMETRY_OTLP_PROTOCOL`                     | `--telemetry-otlp-protocol <grpc\|http>`                 | OTLPトランスポートプロトコル                                                                                                              | `"grpc"`/`"http"` | `"grpc"`                |
| `otlpTracesEndpoint`             | `QWEN_TELEMETRY_OTLP_TRACES_ENDPOINT`              | -                                                        | トレース用シグナルごとのエンドポイントオーバーライド（HTTPのみ）                                                                                  | URL文字列        | -                       |
| `otlpLogsEndpoint`               | `QWEN_TELEMETRY_OTLP_LOGS_ENDPOINT`                | -                                                        | ログ用シグナルごとのエンドポイントオーバーライド（HTTPのみ）                                                                                    | URL文字列        | -                       |
| `otlpMetricsEndpoint`            | `QWEN_TELEMETRY_OTLP_METRICS_ENDPOINT`             | -                                                        | メトリクス用シグナルごとのエンドポイントオーバーライド（HTTPのみ）                                                                                 | URL文字列        | -                       |
| `outfile`                        | `QWEN_TELEMETRY_OUTFILE`                           | `--telemetry-outfile <path>`                             | テレメトリをファイルに保存（OTLPエクスポートを上書き）                                                                                       | ファイルパス         | -                       |
| `logPrompts`                     | `QWEN_TELEMETRY_LOG_PROMPTS`                       | `--telemetry-log-prompts` / `--no-telemetry-log-prompts` | テレメトリログにプロンプトを含める                                                                                                    | `true`/`false`    | `true`                  |
| `includeSensitiveSpanAttributes` | `QWEN_TELEMETRY_INCLUDE_SENSITIVE_SPAN_ATTRIBUTES` | -                                                        | ユーザープロンプト、システムプロンプト、ツールのI/O、モデル出力をネイティブスパン属性として含める（ログからスパンへのブリッジスパンに加えて） | `true`/`false`    | `false`                 |
| `resourceAttributes`             | `OTEL_RESOURCE_ATTRIBUTES` (+ `OTEL_SERVICE_NAME`) | -                                                        | エクスポートされるすべてのスパン/ログ/メトリクスに付加される静的リソース属性。下記の[リソース属性](#resource-attributes)を参照    | `key=value,…`     | `{}`                    |
| `metrics.includeSessionId`       | `QWEN_TELEMETRY_METRICS_INCLUDE_SESSION_ID`        | -                                                        | メトリクスデータポイントに`session.id`を含める。メトリクスバックエンドの時系列ファンアウトを防ぐため、**デフォルトで無効**             | `true`/`false`    | `false`                 |

**ブール型環境変数について:** ブール型設定（`enabled`、`logPrompts`、`includeSensitiveSpanAttributes`）の場合、
対応する環境変数を`true`または`1`に設定すると機能が有効になります。それ以外の値では無効になります。

**センシティブなスパン属性:** `includeSensitiveSpanAttributes`を有効にすると、
以下の2つのことが起こります:

1. **ネイティブスパン属性（`qwen-code.interaction`、`api.generateContent*`、
   `tool.<name>`）** は会話内容をそのまま保持します:
   - ユーザープロンプト（`new_context`）
   - システムプロンプト（`system_prompt` — セッションごとに1回フルテキスト、
     SHA-256ハッシュで重複排除。以降のスパンは`system_prompt_hash` +
     `system_prompt_preview` + `system_prompt_length`のみ）
   - ツールスキーマ（`tool_schema`イベントとして発行、ハッシュ重複排除）
   - ツール入力（`tool_input`）とツール結果（`tool_result`）
   - モデル出力（`response.model_output`）

   各値は60KBで切り捨てられます。切り捨てが発生した場合、`*_truncated`および`*_original_length`
   フラグが表示されます。

2. **ログからスパンへのブリッジスパン**（ログエンドポイントなしでHTTPトレースをエクスポートする場合に使用）は、
   削除される代わりに既存の`prompt`、`function_args`、`response_text`フィールドを保持します。

⚠️ **セキュリティ警告:** このフラグを有効にすると、会話履歴全体、`read_file`で読み取ったファイルの内容、
シェルコマンドとその出力（env変数や引数のシークレットを含む）、モデルの応答が設定済みのOTLPバックエンドにストリーミングされます。
バックエンドを特権的なデータシンクとして扱ってください。このフラグはデフォルト`false`です。

**コスト/ペイロードサイズ:** 大きなターン（60KBのシステムプロンプト + 10回のツール呼び出し、
各最大60KBの入力 + 60KBの結果、さらに60KBのモデル出力）の場合、OTLPの圧縮前に最大約1.5MBの
属性ペイロードが生成されます。大きなファイルを読み取るツール（`read_file`など）を長時間実行セッションで使用する場合は、
エクスポーターのスループットを監視してください。

この設定はOTelログや他のテレメトリシンクのセンシティブデータを無効にしません。
内部以外のAPIレスポンステレメトリは`response_text`を生成することがあるため、
OTelログ、UIテレメトリ、チャット録音はこの設定に関わらず独立してレスポンステキストを受け取る場合があります。
QwenLoggerは`response_text`を含みません。

**HTTP OTLPシグナルルーティング:** HTTPプロトコル（`otlpProtocol: "http"`）を使用する場合、
Qwen Codeはベース`otlpEndpoint`にシグナル固有のパス（`/v1/traces`、`/v1/logs`、
`/v1/metrics`）を自動付加します。例えば、`http://collector:4318`はトレースに対して
`http://collector:4318/v1/traces`になります。URLがすでにシグナルパスで終わっている場合は、そのまま使用します。
シグナルごとのエンドポイントオーバーライド（`otlpTracesEndpoint`など）はベースエンドポイントより優先され、そのまま使用されます。
gRPCプロトコルはサービスベースのルーティングを使用し、パスを付加しません。

シグナルごとのエンドポイント環境変数は、標準のOpenTelemetry名も受け付けます:
`OTEL_EXPORTER_OTLP_TRACES_ENDPOINT`、`OTEL_EXPORTER_OTLP_LOGS_ENDPOINT`、`OTEL_EXPORTER_OTLP_METRICS_ENDPOINT`。
`QWEN_TELEMETRY_OTLP_*`系は`OTEL_*`系より優先されます。

すべての設定オプションの詳細については、[設定ガイド](../../users/configuration/settings.md)を参照してください。

### リソース属性

リソース属性は、OTLP経由でエクスポートされるすべてのスパン、ログ、メトリクスに付加される静的なキーバリューペアです。
チーム、環境、デプロイリージョン、またはバックエンドが必要とするその他のディメンションでテレメトリをスライスするために使用します。

優先順位（低から高）でマージされる2つのソース:

1. 標準の`OTEL_RESOURCE_ATTRIBUTES`環境変数
2. `.qwen/settings.json`の`telemetry.resourceAttributes`（キーが競合する場合、envを上書き）

`OTEL_SERVICE_NAME`は独立したエスケープハッチです。設定されている場合、他のソースの`service.name`を上書きします
（OpenTelemetryの仕様に従う）。

#### 例

**チーム/環境でテレメトリ全体をスライスする:**

```bash
export OTEL_RESOURCE_ATTRIBUTES="team=platform,env=prod,cost_center=eng-123"
```

**`service.name`経由でテナントごとのコレクターにルーティングする:**

```bash
export OTEL_SERVICE_NAME=qwen-code-ci
```

**フリートのベースライン（`~/.qwen/settings.json`）+ ホストごとのオーバーライド:**

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
# Add a one-off tag without touching settings:
export OTEL_RESOURCE_ATTRIBUTES="debug_run=true"
```

#### 予約済みキー

一部のキーはランタイムで制御されており、上書きできません:

- `service.version` — 常に実行中のCLIバージョンが設定されます。いずれかのソースから設定しても、警告とともに無視されます。
- `session.id` — セッションごとにランタイムが注入します。envまたは設定からのユーザー指定値は警告とともに削除されます。
  これは、リソース属性がすべてのメトリクスデータポイントに自動付加されるためです。ユーザーによる上書きを許可すると、
  下記の[カーディナリティ制御](#cardinality-controls)をバイパスすることになります。
  スパンとログには常に`session.id`が含まれます。

`service.name`は**予約済みではなく**、上記の優先順位チェーンに従います。

#### フォーマット

`OTEL_RESOURCE_ATTRIBUTES`はOpenTelemetry仕様に従います:
値はパーセントエンコードされた`key1=value1,key2=value2`形式です。値のスペースは
`%20`にエンコードする必要があります。**コンマは`%2C`にエンコードします**（エンコードされていないコンマは値を誤った境界で分割し、
後半が不正なものとして削除されます）。不正なペアはテレメトリの起動を失敗させずに警告とともにスキップされます。

#### トラブルシューティング: ユーザー指定の属性が反映されない場合

予約済みキー（`service.version`、`session.id`）、不正なペア、文字列以外の設定値、
無効なパーセントエンコードはすべて、OpenTelemetry診断チャネル経由でログに記録された警告とともに無視されます。
そのチャネルはデバッグログファイル（`~/.qwen/log/otel-*.log`）にルーティングされ、**コンソールには表示されません**。
そのため、無言の失敗のように見えることがあります。

カスタムリソース属性がエクスポートされたテレメトリに表示されない場合:

1. `~/.qwen/log/otel-*.log`で`cannot override`（予約済みキーが削除された）、
   `Skipping malformed`（env変数のペアが不正）、`must be a string`（文字列以外の設定値）に
   一致する行を確認してください。
2. env変数がqwen-codeプロセスの環境（シェルだけでなく）に設定されており、
   値がパーセントエンコードされていることを確認してください。
3. `telemetry.enabled`が`true`であることを確認してください。テレメトリの初期化は有効な場合のみ実行されます。

### カーディナリティ制御

メトリクスはバックエンドで属性セットごとに集計されます。属性値の組み合わせごとに新しい時系列が生成されます。
`session.id`のような高カーディナリティフィールドをメトリクスに付加すると、セッション数に比例した時系列ファンアウトが発生し、
メトリクスバックエンドのストレージがすぐに枯渇します。

これを防ぐため、Qwen Codeはデフォルトでメトリクスデータポイントから高カーディナリティ属性を除外します。
スパンとログはイベントごとのため影響を受けず、トレースとログの相関のために引き続き`session.id`を保持します。

#### `telemetry.metrics.includeSessionId`（デフォルト: `false`）

これを`true`に設定する（設定または`QWEN_TELEMETRY_METRICS_INCLUDE_SESSION_ID=true`経由）と、
すべてのメトリクスデータポイントに`session.id`が再付加されます。

⚠️ **警告:** 各CLIセッションは新しい値を作成します。フリート全体でこれをオンにすると、メトリクスストレージが爆発的に増加します。
短期的なデバッグのみに推奨します。長期的なセッション相関にはトレースまたはログバックエンドを使用してください。

#### 旧バージョンからの移行

このリリース以前は、`session.id`がデフォルトでメトリクスに付加されていました。
Prometheusクエリ/Grafanaダッシュボード/アラートルールがメトリクス上の`session_id`を参照している場合、2つの選択肢があります:

**オプションA** — 短期的なデバッグのために以前の動作を復元する:

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

**オプションB（推奨）** — セッションレベルの分析をメトリクスから移行する。スパンとログは
引き続き`session.id`を保持しており、トレース/ログバックエンド（Jaeger、Tempo、Loki、Aliyun SLS / ARMS Tracing）は
カーディナリティの負荷なしにセッションごとのスライスをネイティブに処理します。

### 送信フェッチ時のクライアントサイドHTTPスパン

テレメトリが有効な場合、Qwen Codeは`UndiciInstrumentation`を登録します。
これにより、プロセスが発信するすべての`fetch()`リクエスト（LLM SDK（`openai`、
`@google/genai`、`@anthropic-ai/sdk`）、MCP StreamableHTTPクライアント、
`WebFetch`ツール、IDE拡張機能のアウトプロセス呼び出しを含む）に対してクライアントサイドHTTPスパンが作成されます。
このスパンにより、既存の`api.generateContent`スパンだけでは区別できない、ネットワーク遅延（TTFB/レスポンスボディ転送）と
アップストリームモデル処理時間を分けて確認できます。

これらのスパンは他のテレメトリと同様に**自分の**OTLPコレクター（またはファイルアウトファイル）に送られます。
アウトバウンドHTTPリクエスト自体に書き込まれる内容には影響しません。W3Cの`traceparent`ヘッダーが
発信リクエストストリームにも書き込まれるかどうかは、下記の[アウトバウンド相関](#outbound-correlation-security-relevant)で
説明する**別のセキュリティ関連設定**で制御します。

**フィードバックループの回避。** OTel SDKはOTLPデータのアップロードに内部的に`fetch`を使用します。
保護なしに`fetch`をインストルメンテーションすると、これらのアップロード自体がトレースされ、それ自体がアップロードされ、
無限ループが発生します。Qwen Codeのundiciインストルメンテーションは、設定された`telemetry.otlpEndpoint` /
`telemetry.otlpTracesEndpoint` / `telemetry.otlpLogsEndpoint` /
`telemetry.otlpMetricsEndpoint`プレフィックスに一致するURLをスキップする`ignoreRequestHook`で設定されています。
ファイルアウトファイルモードではアウトバウンドHTTPアップロードがないため、フックはno-opです。

## アウトバウンド相関（セキュリティ関連）

これらの設定は意図的に`telemetry.*`とは**別のトップレベル名前空間**に存在します。
テレメトリはオペレーターのオブザーバビリティバックエンドへのデータフローを制御するのに対し、
`outboundCorrelation.*`はqwen-codeがサードパーティのLLMプロバイダーエンドポイント
（DashScope、OpenAI、Anthropicなど）に到達する**アウトバウンドLLM APIリクエストストリームに**書き込む
クライアントサイドの相関データを制御します。受信者が異なれば、同意の判断も異なります。**すべての値はデフォルトでオフです。**
フレーミングの根拠についてはPR #4390のレビューディスカッションを参照してください。

### `outboundCorrelation.propagateTraceContext`

```jsonc
"outboundCorrelation": {
  "propagateTraceContext": false // default
}
```

`false`（デフォルト）の場合、Qwen CodeはOTel SDKにno-op `TextMapPropagator`をインストールします。
UndiciInstrumentationはOTLPコレクター用のクライアントHTTPスパンを引き続き作成しますが、
`propagation.inject()`はno-opであるため、**アウトバウンドリクエストに`traceparent`は書き込まれません**。
トレースIDはオペレーターのコレクター内部に留まります。

`true`の場合、SDKのデフォルトW3Cコンポジットプロパゲーター
（`tracecontext` + `baggage`）がインストールされ、すべてのアウトバウンド`fetch`に標準の`traceparent`
ヘッダーが書き込まれます:

```
traceparent: 00-<32-hex traceId>-<16-hex parentSpanId>-<01-sampled | 00-not-sampled>
```

LLMプロバイダーも自分のOTelコレクターに報告してクロスプロセストレースのスティッチングを行う場合（例: ARMS TracingがDashScopeを提供する場合）のみオプトインしてください。
ほとんどのオペレーターの値は`false`です。クロスベンダーのトレース継続はニッチな用途です。

**`telemetry.enabled: true`が必要です。** OTel SDKはテレメトリが有効な場合のみ初期化されるため、
`propagateTraceContext`はその状態でのみ有効になります。テレメトリが無効な状態で`true`に設定しても
no-opです（SDKなし、プロパゲーターなし、ワイヤー上に`traceparent`なし）。
ARMS+DashScope相関のセットアップ時は両方のフラグを確認してください:

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

`X-Qwen-Code-Session-Id`と`X-Qwen-Code-Request-Id`は**このPRの対象外です**。
同じ`outboundCorrelation.*`名前空間の下、それぞれ独自の脅威モデルとオペレーター同意フローを持つ別のフォローアップPRで設計・提案されます。
PR #4390のレビュー（LaZzyMan）で「テレメトリの作業範囲にはLLMプロバイダーへの識別子送信は含まれない」という原則が確立されました。
相関ヘッダーの作業はテレメトリの下に組み込まれるのではなく、独自の設計ディスカッションに移行します。

## Aliyunテレメトリ

### 手動OTLPエクスポート

Alibaba Cloud Managed Service for OpenTelemetryでQwen Codeのテレメトリを表示するには、
ARMSが提供するOTLPエンドポイントへエクスポートするようQwen Codeを設定します。

`"target": "gcp"`を設定するだけではエクスポート先は設定されません。`otlpEndpoint`が設定されていない場合、
Qwen Codeは引き続き`http://localhost:4317`をデフォルトとして使用します。`outfile`が設定されている場合は
`otlpEndpoint`を上書きし、テレメトリはAlibaba Cloudに送信される代わりにファイルに書き込まれます。

1. `.qwen/settings.json`でテレメトリを有効化し、OTLPエンドポイントを設定します:

   **オプションA: gRPCプロトコル**（標準OTLPエンドポイント）:

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

   **オプションB: シグナルごとのエンドポイントを使用したHTTPプロトコル**（`/v1/traces`の代わりに
   `/api/otlp/traces`などの非標準パスを使用するバックエンドの場合）:

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

   > **Note:** `otlpEndpoint`のみを使用したHTTPプロトコル（シグナルごとのオーバーライドなし）の場合、
   > Qwen Codeはベースに標準OTLPパス（`/v1/traces`、`/v1/logs`、`/v1/metrics`）を付加します。
   > バックエンドが異なるパスを使用する場合は、オプションBに示すようにシグナルごとのエンドポイントオーバーライドを使用してください。

2. Alibaba Cloudのエンドポイントで認証が必要な場合は、`OTEL_EXPORTER_OTLP_HEADERS`（またはシグナル固有のバリアント）などの
   標準OpenTelemetry環境変数でOTLPヘッダーを提供してください。Qwen Codeは現在、
   `.qwen/settings.json`でOTLP認証ヘッダーを直接公開していません。
3. Qwen Codeを実行してプロンプトを送信します。
4. Managed Service for OpenTelemetryでテレメトリを確認します:
   - 製品概要:
     [Managed Service for OpenTelemetryとは?][aliyun-opentelemetry-overview]
   - 入門:
     [Managed Service for OpenTelemetryを始める][aliyun-opentelemetry-get-started]
   - コンソールエントリーポイント:
     - 中国本土:
       [trace.console.aliyun.com][aliyun-opentelemetry-console-cn]
       （旧コンソール:
       [tracing.console.aliyun.com][aliyun-opentelemetry-console-cn-legacy]）
     - 国際:
       [arms.console.alibabacloud.com][aliyun-opentelemetry-console-intl]
   - コンソールで`Applications`を使用してトレースとサービストポロジーを検査します。
   - OTLPエンドポイントとアクセス情報を確認するには:
     - **新コンソール**（`trace.console.aliyun.com`または国際）:
       `Integration Center`に移動します。
     - **旧コンソール**（`tracing.console.aliyun.com`）: `Cluster Configurations` → `Access point information`に移動します。

## ローカルテレメトリ

ローカル開発とデバッグのために、テレメトリデータをローカルでキャプチャできます:

### ファイルベースの出力（推奨）

1. `.qwen/settings.json`でテレメトリを有効化します:

   ```json
   {
     "telemetry": {
       "enabled": true,
       "outfile": ".qwen/telemetry.log"
     }
   }
   ```

   > **Note:** `outfile`が設定されている場合、OTLPエクスポートは自動的に無効化されます。
   > `target`および`otlpEndpoint`設定はファイルのみの出力には不要で、設定から安全に省略できます。

2. Qwen Codeを実行してプロンプトを送信します。
3. 指定したファイル（例: `.qwen/telemetry.log`）でログとメトリクスを確認します。

### コレクターベースのエクスポート（上級者向け）

1. 自動化スクリプトを実行します:
   ```bash
   npm run telemetry -- --target=local
   ```
   これにより以下が実行されます:
   - JaegerとOTELコレクターのダウンロードと起動
   - ローカルテレメトリ用のワークスペースの設定
   - http://localhost:16686 でのJaeger UIの提供
   - `~/.qwen/tmp/<projectHash>/otel/collector.log`へのログ/メトリクスの保存
   - 終了時（例: `Ctrl+C`）のコレクターの停止
2. Qwen Codeを実行してプロンプトを送信します。
3. http://localhost:16686 でトレースを確認し、コレクターログファイルでログ/メトリクスを確認します。

## ログとメトリクス

以下のセクションでは、Qwen Codeが生成するログとメトリクスの構造を説明します。

- `sessionId`はすべてのログとメトリクスの共通属性として含まれます。

### ログ

ログは特定イベントのタイムスタンプ付きレコードです。Qwen Codeでは以下のイベントがログに記録されます:

- `qwen-code.config`: このイベントはCLIの設定とともに起動時に1回発生します。
  - **属性**:
    - `model` (string)
    - `sandbox_enabled` (boolean)
    - `core_tools_enabled` (string)
    - `approval_mode` (string)
    - `file_filtering_respect_git_ignore` (boolean)
    - `debug_mode` (boolean)
    - `truncate_tool_output_threshold` (number)
    - `truncate_tool_output_lines` (number)
    - `hooks` (string, カンマ区切りのフックイベントタイプ、フックが無効な場合は省略)
    - `ide_enabled` (boolean)
    - `interactive_shell_enabled` (boolean)
    - `mcp_servers` (string)
    - `output_format` (string: "text"または"json")

- `qwen-code.user_prompt`: このイベントはユーザーがプロンプトを送信したときに発生します。
  - **属性**:
    - `prompt_length` (int)
    - `prompt_id` (string)
    - `prompt` (string, `log_prompts_enabled`が`false`に設定されている場合はこの属性は除外)
    - `auth_type` (string)

- `qwen-code.tool_call`: このイベントは各関数呼び出しで発生します。
  - **属性**:
    - `function_name`
    - `function_args`
    - `duration_ms`
    - `success` (boolean)
    - `decision` (string: "accept"、"reject"、"auto_accept"、または"modify"、該当する場合)
    - `error`（該当する場合）
    - `error_type`（該当する場合）
    - `content_length` (int、該当する場合)
    - `metadata`（該当する場合、string -> anyの辞書）

- `qwen-code.file_operation`: このイベントは各ファイル操作で発生します。
  - **属性**:
    - `tool_name` (string)
    - `operation` (string: "create"、"read"、"update")
    - `lines` (int、該当する場合)
    - `mimetype` (string、該当する場合)
    - `extension` (string、該当する場合)
    - `programming_language` (string、該当する場合)
    - `diff_stat` (json文字列、該当する場合): 以下のメンバーを持つJSON文字列:
      - `ai_added_lines` (int)
      - `ai_removed_lines` (int)
      - `user_added_lines` (int)
      - `user_removed_lines` (int)

- `qwen-code.api_request`: このイベントはQwen APIへのリクエスト時に発生します。
  - **属性**:
    - `model`
    - `request_text`（該当する場合）

- `qwen-code.api_error`: このイベントはAPIリクエストが失敗した場合に発生します。
  - **属性**:
    - `model`
    - `error`
    - `error_type`
    - `status_code`
    - `duration_ms`
    - `auth_type`

- `qwen-code.api_response`: このイベントはQwen APIからレスポンスを受け取ったときに発生します。
  - **属性**:
    - `model`
    - `status_code`
    - `duration_ms`
    - `error`（オプション）
    - `input_token_count`
    - `output_token_count`
    - `cached_content_token_count`
    - `thoughts_token_count`
    - `response_text`（該当する場合）
    - `auth_type`

- `qwen-code.tool_output_truncated`: このイベントはツール呼び出しの出力が大きすぎて切り捨てられた場合に発生します。
  - **属性**:
    - `tool_name` (string)
    - `original_content_length` (int)
    - `truncated_content_length` (int)
    - `threshold` (int)
    - `lines` (int)
    - `prompt_id` (string)

- `qwen-code.malformed_json_response`: このイベントはQwen APIからの`generateJson`レスポンスがJSONとしてパースできない場合に発生します。
  - **属性**:
    - `model`

- `qwen-code.flash_fallback`: このイベントはQwen Codeがフォールバックとしてflashに切り替えた場合に発生します。
  - **属性**:
    - `auth_type`

- `qwen-code.slash_command`: このイベントはユーザーがスラッシュコマンドを実行したときに発生します。
  - **属性**:
    - `command` (string)
    - `subcommand` (string、該当する場合)

- `qwen-code.extension_enable`: このイベントは拡張機能が有効化されたときに発生します
- `qwen-code.extension_install`: このイベントは拡張機能がインストールされたときに発生します
  - **属性**:
    - `extension_name` (string)
    - `extension_version` (string)
    - `extension_source` (string)
    - `status` (string)
- `qwen-code.extension_uninstall`: このイベントは拡張機能がアンインストールされたときに発生します

### メトリクス

メトリクスは時間経過による動作の数値測定値です。Qwen Codeでは以下のメトリクスが収集されます（互換性のためメトリクス名は`qwen-code.*`のまま）:

- `qwen-code.session.count` (Counter, Int): CLIの起動ごとに1回インクリメントされます。

- `qwen-code.tool.call.count` (Counter, Int): ツール呼び出しをカウントします。
  - **属性**:
    - `function_name`
    - `success` (boolean)
    - `decision` (string: "accept"、"reject"、または"modify"、該当する場合)
    - `tool_type` (string: "mcp"または"native"、該当する場合)

- `qwen-code.tool.call.latency` (Histogram, ms): ツール呼び出しのレイテンシを測定します。
  - **属性**:
    - `function_name`
    - `decision` (string: "accept"、"reject"、または"modify"、該当する場合)

- `qwen-code.api.request.count` (Counter, Int): すべてのAPIリクエストをカウントします。
  - **属性**:
    - `model`
    - `status_code`
    - `error_type`（該当する場合）

- `qwen-code.api.request.latency` (Histogram, ms): APIリクエストのレイテンシを測定します。
  - **属性**:
    - `model`

- `qwen-code.token.usage` (Counter, Int): 使用されたトークン数をカウントします。
  - **属性**:
    - `model`
    - `type` (string: "input"、"output"、"thought"、または"cache")

- `qwen-code.file.operation.count` (Counter, Int): ファイル操作をカウントします。
  - **属性**:
    - `operation` (string: "create"、"read"、"update"): ファイル操作の種類。
    - `lines` (Int、該当する場合): ファイルの行数。
    - `mimetype` (string、該当する場合): ファイルのMIMEタイプ。
    - `extension` (string、該当する場合): ファイルの拡張子。
    - `model_added_lines` (Int、該当する場合): モデルが追加/変更した行数。
    - `model_removed_lines` (Int、該当する場合): モデルが削除/変更した行数。
    - `user_added_lines` (Int、該当する場合): AIが提案した変更にユーザーが追加/変更した行数。
    - `user_removed_lines` (Int、該当する場合): AIが提案した変更にユーザーが削除/変更した行数。
    - `programming_language` (string、該当する場合): ファイルのプログラミング言語。

- `qwen-code.chat_compression` (Counter, Int): チャット圧縮操作をカウントします
  - **属性**:
    - `tokens_before`: (Int): 圧縮前のコンテキストのトークン数
    - `tokens_after`: (Int): 圧縮後のコンテキストのトークン数
