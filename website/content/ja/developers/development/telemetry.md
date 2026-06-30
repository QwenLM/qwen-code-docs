# OpenTelemetryによるオブザーバビリティ

Qwen CodeでOpenTelemetryを有効化し、セットアップする方法について説明します。

- [OpenTelemetryによるオブザーバビリティ](#observability-with-opentelemetry)
  - [主な利点](#key-benefits)
  - [OpenTelemetryとの統合](#opentelemetry-integration)
  - [設定](#configuration)
  - [Aliyun Telemetry](#aliyun-telemetry)
    - [手動OTLPエクスポート](#manual-otlp-export)
  - [ローカルTelemetry](#local-telemetry)
    - [ファイルベースの出力（推奨）](#file-based-output-recommended)
    - [コレクターベースのエクスポート（上級者向け）](#collector-based-export-advanced)
  - [ログとメトリクス](#logs-and-metrics)
    - [ログ](#logs)
    - [メトリクス](#metrics)
    - [デーモンメトリクス](#daemon-metrics)
    - [スパン](#spans)
    - [リソースメトリクス](#resource-metrics)
    - [パフォーマンスモニタリング（予約済み）](#performance-monitoring-reserved)

## 移行に関する注意事項

- `tool_output_truncated` は名前空間の一貫性のため `qwen-code.tool_output_truncated` に改名されました。古い名前でフィルタリングしているダウンストリームの利用者はクエリを更新する必要があります。

- `tool.call.latency` ヒストグラムのドキュメントには以前 `decision` 属性が記載されていましたが、これはヒストグラムに設定されたことはありません（`function_name` のみが記録されます）。`tool.call.count` カウンターには引き続き `decision` が含まれます。

- `qwen-code.file_operation` ログイベントと `file.operation.count` メトリクスのドキュメントには以前 diff-stat属性（`model_added_lines`, `model_removed_lines`, `user_added_lines`, `user_removed_lines`）が記載されていましたが、これらも設定されたことはありません。diff-statデータは `tool_call` ログイベントの `metadata` 属性から利用可能です。

## 主な利点

- **🔍 利用状況分析**: チーム全体のインタラクションパターンと機能の採用状況を把握できます
- **⚡ パフォーマンスモニタリング**: 応答時間、トークン消費量、リソース使用率を追跡できます
- **🐛 リアルタイムデバッグ**: ボトルネック、障害、エラーパターンを発生時に特定できます
- **📊 ワークフローの最適化**: 設定とプロセスを改善するための情報に基づいた意思決定を行えます
- **🏢 エンタープライズガバナンス**: チーム間の利用状況を監視し、コストを追跡し、コンプライアンスを確保し、既存のモニタリングインフラと統合できます

## OpenTelemetryとの統合

ベンダーニュートラルで業界標準のオブザーバビリティフレームワークである **[OpenTelemetry]** をベースに、Qwen Codeのオブザーバビリティシステムは以下を提供します:

- **普遍的な互換性**: OpenTelemetryバックエンド（Aliyun、Jaeger、Prometheus、Datadogなど）にエクスポート可能
- **標準化されたデータ**: ツールチェーン全体で一貫した形式と収集方法を使用可能
- **将来にわたる統合**: 既存および将来のオブザーバビリティインフラと接続可能
- **ベンダーロックインなし**: 計装を変更せずにバックエンドを切り替え可能

[OpenTelemetry]: https://opentelemetry.io/
[aliyun-opentelemetry-overview]: https://www.alibabacloud.com/help/en/arms/tracing-analysis/product-overview/what-is-tracing-analysis
[aliyun-opentelemetry-get-started]: https://www.alibabacloud.com/help/en/arms/tracing-analysis/before-you-begin
[aliyun-opentelemetry-console-cn]: https://trace.console.aliyun.com
[aliyun-opentelemetry-console-cn-legacy]: https://tracing.console.aliyun.com
[aliyun-opentelemetry-console-intl]: https://arms.console.alibabacloud.com

## 設定

すべてのTelemetryの動作は `.qwen/settings.json` ファイルを通じて制御されます。これらの設定は環境変数またはCLIフラグでオーバーライドできます。

| Setting                           | Environment Variable                                 | CLI Flag                                                 | Description                                                                                                                                    | Values            | Default                 |
| --------------------------------- | ---------------------------------------------------- | -------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | ----------------- | ----------------------- |
| `enabled`                         | `QWEN_TELEMETRY_ENABLED`                             | `--telemetry` / `--no-telemetry`                         | Telemetryの有効化または無効化                                                                                                                  | `true`/`false`    | `false`                 |
| `target`                          | `QWEN_TELEMETRY_TARGET`                              | `--telemetry-target <local\|gcp>` _(deprecated)_         | 情報提供用の宛先ラベル。エクスポートルーティングは制御しません。データ送信先を設定するには `otlpEndpoint` または `outfile` を設定してください  | `"gcp"`/`"local"` | `"local"`               |
| `otlpEndpoint`                    | `QWEN_TELEMETRY_OTLP_ENDPOINT`                       | `--telemetry-otlp-endpoint <URL>`                        | OTLPコレクターエンドポイント                                                                                                                   | URL string        | `http://localhost:4317` |
| `otlpProtocol`                    | `QWEN_TELEMETRY_OTLP_PROTOCOL`                       | `--telemetry-otlp-protocol <grpc\|http>`                 | OTLPトランスポートプロトコル                                                                                                                   | `"grpc"`/`"http"` | `"grpc"`                |
| `otlpTracesEndpoint`              | `QWEN_TELEMETRY_OTLP_TRACES_ENDPOINT`                | -                                                        | トレース用のシグナル別エンドポイントオーバーライド（HTTPのみ）                                                                                 | URL string        | -                       |
| `otlpLogsEndpoint`                | `QWEN_TELEMETRY_OTLP_LOGS_ENDPOINT`                  | -                                                        | ログ用のシグナル別エンドポイントオーバーライド（HTTPのみ）                                                                                     | URL string        | -                       |
| `otlpMetricsEndpoint`             | `QWEN_TELEMETRY_OTLP_METRICS_ENDPOINT`               | -                                                        | メトリクス用のシグナル別エンドポイントオーバーライド（HTTPのみ）                                                                               | URL string        | -                       |
| `outfile`                         | `QWEN_TELEMETRY_OUTFILE`                             | `--telemetry-outfile <path>`                             | Telemetryをファイルに保存（OTLPエクスポートをオーバーライド）                                                                                  | file path         | -                       |
| `logPrompts`                      | `QWEN_TELEMETRY_LOG_PROMPTS`                         | `--telemetry-log-prompts` / `--no-telemetry-log-prompts` | Telemetryログにプロンプトを含める                                                                                                              | `true`/`false`    | `true`                  |
| `includeSensitiveSpanAttributes`  | `QWEN_TELEMETRY_INCLUDE_SENSITIVE_SPAN_ATTRIBUTES`   | -                                                        | ユーザープロンプト、システムプロンプト、ツールI/O、モデル出力をネイティブスパン属性として含める（ログからスパンへのブリッジスパンに加えて）    | `true`/`false`    | `false`                 |
| `sensitiveSpanAttributeMaxLength` | `QWEN_TELEMETRY_SENSITIVE_SPAN_ATTRIBUTE_MAX_LENGTH` | -                                                        | 各センシティブなネイティブスパン属性コンテンツペイロードの最大JavaScript文字列長。バックエンドが大きな属性を拒否する場合は低く設定してください | `1..104857600`    | `1048576`               |
| `resourceAttributes`              | `OTEL_RESOURCE_ATTRIBUTES` (+ `OTEL_SERVICE_NAME`)   | -                                                        | エクスポートされるすべてのスパン/ログ/メトリクスに付加される静的リソース属性。以下の[リソース属性](#resource-attributes)を参照してください     | `key=value,…`     | `{}`                    |
| `metrics.includeSessionId`        | `QWEN_TELEMETRY_METRICS_INCLUDE_SESSION_ID`          | -                                                        | メトリクスデータポイントに `session.id` を含めます。時系列のファンアウトからメトリクスバックエンドを保護するため、**デフォルトでは無効**です   | `true`/`false`    | `false`                 |

**ブール値の環境変数に関する注意:** ブール値の設定（`enabled`、`logPrompts`、`includeSensitiveSpanAttributes`）について、対応する環境変数を `true` または `1` に設定すると機能が有効になります。それ以外の値では無効になります。

**整数の環境変数に関する注意:** `QWEN_TELEMETRY_SENSITIVE_SPAN_ATTRIBUTE_MAX_LENGTH` は設定時に正の整数である必要があります。無効な値はサイレントにフォールバックするのではなく、Telemetry設定の解決を失敗させます。

**センシティブなスパン属性:** `includeSensitiveSpanAttributes` が有効な場合、以下の2つのことが起こります:

1. **ネイティブスパン属性（`qwen-code.interaction`、`api.generateContent*`、`tool.<name>`）** は会話コンテンツをそのまま保持します:
   - ユーザープロンプト（`new_context`）
   - システムプロンプト（`system_prompt` — セッションごとに1回だけフルテキスト、SHA-256ハッシュで重複排除。後続のスパンは `system_prompt_hash` + `system_prompt_preview` + `system_prompt_length` のみ保持）
   - ツールスキーマ（`tool_schema` イベントとして発行され、同様にハッシュで重複排除）
   - ツール入力（`tool_input`）とツール結果（`tool_result`）
   - モデル出力（`response.model_output`）

   各コンテンツペイロードは `sensitiveSpanAttributeMaxLength` JavaScript文字列単位で切り詰められます。デフォルトは1 MiB（`1048576`）で、以前の60 KiBのデフォルトから引き上げられました。古い上限を維持するには `61440` を設定します。上限は `1` から `104857600`（100 MiB）の間である必要があります。ラベル付き属性の場合、`[USER PROMPT]`、`[TOOL INPUT: ...]`、`[TOOL RESULT: ...]` などの固定ラベルも上限にカウントされ、切り詰めマーカーも上限にカウントされます。上限はUTF-8バイト数ではなくJavaScript文字列長として測定されます。したがって、非ASCIIコンテンツはOTLPエクスポート後にバイト数が増加する可能性があります。ほとんどのペイロードタイプでは、切り詰めにより `*_truncated` と `*_original_length` の両方が追加されます。システムプロンプトも切り詰められた場合に `system_prompt_truncated` を設定しますが、元の長さには常に存在する `system_prompt_length` を使用します。

2. **ログからスパンへのブリッジスパン**（ログエンドポイントなしでHTTPトレースがエクスポートされる場合に使用）は、ドロップされる代わりに既存の `prompt`、`function_args`、`response_text` フィールドを保持します。

⚠️ **セキュリティ警告:** このフラグを有効にすると、完全な会話履歴、`read_file` によって読み取られたファイルの内容、シェルコマンドとその出力（環境変数や引数に含まれるシークレットを含む）、およびモデルの応答が設定されたOTLPバックエンドにストリーミングされます。バックエンドは特権的なデータシンクとして扱ってください。このフラグのデフォルトは `false` です。

**コスト / ペイロードサイズ:** デフォルトの上限（1 MiBのシステムプロンプトと、それぞれ最大1 MiBの入力+1 MiBの結果の10回のツール呼び出し、さらに1 MiBのモデル出力）での重いターンは、OTLP圧縮前に最大約22 MiBの属性ペイロードを生成する可能性があり、さらに大きなツール定義を持つワークスペースでは発行されるツールスキーマごとに最大1 MiBが追加されます。これはQwen Codeのアプリケーション側の上限であり、すべてのコレクターやバックエンドがそれほど大きな単一の属性を受け入れるという保証ではありません。スパンが拒否またはドロップされる場合は、`sensitiveSpanAttributeMaxLength` を下げ（例: `61440`）、エクスポートのスループットを監視してください。

この設定はOTelログやその他のTelemetryシンク内のセンシティブデータを無効にするものではありません。非内部API応答のTelemetryは `response_text` を設定する可能性があるため、OTelログ、UI Telemetry、およびチャット記録は、この設定とは独立して応答テキストを受け取る可能性があります。QwenLoggerには `response_text` は含まれません。

**HTTP OTLPシグナルルーティング:** HTTPプロトコル（`otlpProtocol: "http"`）を使用する場合、Qwen Codeはベースの `otlpEndpoint` にシグナル固有のパス（`/v1/traces`、`/v1/logs`、`/v1/metrics`）を自動的に追加します。たとえば、`http://collector:4318` はトレースの場合 `http://collector:4318/v1/traces` になります。URLがすでにシグナルパスで終わっている場合は、そのまま使用されます。シグナル別のエンドポイントオーバーライド（`otlpTracesEndpoint` など）はベースエンドポイントより優先され、そのまま使用されます。gRPCプロトコルはサービスベースのルーティングを使用し、パスを追加しません。

シグナル別のエンドポイント環境変数は、標準のOpenTelemetry名も受け付けます: `OTEL_EXPORTER_OTLP_TRACES_ENDPOINT`、`OTEL_EXPORTER_OTLP_LOGS_ENDPOINT`、`OTEL_EXPORTER_OTLP_METRICS_ENDPOINT`。`QWEN_TELEMETRY_OTLP_*` 変数は `OTEL_*` 変数より優先されます。

すべての設定オプションの詳細については、[設定ガイド](../../users/configuration/settings.md)を参照してください。

### リソース属性

リソース属性は、OTLP経由でエクスポートされるすべてのスパン、ログ、メトリクスに付加される静的なキーと値のペアです。チーム、環境、デプロイリージョン、またはバックエンドが関心を持つその他のディメンションでTelemetryをスライスするために使用します。

2つのソースがあり、優先順位順（低→高）にマージされます:

1. 標準の `OTEL_RESOURCE_ATTRIBUTES` 環境変数
2. `.qwen/settings.json` 内の `telemetry.resourceAttributes`（キーの競合時に環境変数をオーバーライド）

`OTEL_SERVICE_NAME` は別のエスケープハッチです。設定すると、（OpenTelemetry仕様に従い）他のソースからの `service.name` をオーバーライドします。

#### 例

**チーム/環境ですべてのTelemetryをスライス:**

```bash
export OTEL_RESOURCE_ATTRIBUTES="team=platform,env=prod,cost_center=eng-123"
```

**`service.name` 経由でテナント別コレクターにルーティング:**

```bash
export OTEL_SERVICE_NAME=qwen-code-ci
```

**フリートベースライン（`~/.qwen/settings.json`）+ ホスト別のオーバーライド:**

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
# 設定に触れずにワンオフのタグを追加:
export OTEL_RESOURCE_ATTRIBUTES="debug_run=true"
```

#### 予約済みキー

一部のキーはランタイム制御されており、オーバーライドできません:

- `service.version` — 常に実行中のCLIバージョンに設定されます。どのソースから設定しても警告とともにサイレントに破棄されます。
- `session.id` — セッションごとにランタイム注入されます。環境変数または設定からのユーザー提供値は警告とともに破棄されます。その理由は、リソース属性がすべてのメトリクスデータポイントに自動付加されるため、ユーザーによるオーバーライドを許可すると、以下の[カーディナリティ制御](#cardinality-controls)を回避してしまうからです。スパンとログは常に `session.id` を保持します。

`service.name` は予約済み**ではなく**、上記の優先順位チェーンに従います。

#### 形式

`OTEL_RESOURCE_ATTRIBUTES` はOpenTelemetry仕様に従います: `key1=value1,key2=value2` で、値はパーセントエンコードされます。値内のスペースは `%20` としてエンコードする必要があり、**カンマは `%2C` としてエンコードする必要があります**（エンコードされていないカンマは値を誤った境界で分割し、後半が不正な形式として破棄されます）。不正な形式のペアは、Telemetryの起動を失敗させるのではなく、警告とともにスキップされます。

#### トラブルシューティング: ユーザー提供の属性が有効にならないように見える場合

予約済みキー（`service.version`、`session.id`）、不正な形式のペア、非文字列の設定値、および無効なパーセントエンコードは、OpenTelemetry診断チャネル経由でログに記録される警告とともにサイレントに破棄されます。そのチャネルはデバッグログファイル（`~/.qwen/log/otel-*.log`）にルーティングされ、コンソールには出力**されない**ため、サイレントな失敗のように見えることがあります。

カスタムリソース属性がエクスポートされたTelemetryに表示されない場合:

1. `~/.qwen/log/otel-*.log` で `cannot override`（予約済みキーが破棄）、`Skipping malformed`（不正な環境変数ペア）、または `must be a string`（非文字列の設定値）に一致する行を確認します。
2. 環境変数がqwen-codeプロセスの環境（シェルだけでなく）で設定されており、値がパーセントエンコードされていることを確認します。
3. `telemetry.enabled` が `true` であることを確認します。Telemetryの初期化は有効な場合にのみ実行されます。

### カーディナリティ制御

メトリクスはバックエンドで属性セットごとに集計されます。属性値のすべての異なる組み合わせが新しい時系列を生成します。`session.id` のような高カーディナリティフィールドをメトリクスに付加すると、セッション数に比例した時系列のファンアウトが発生し、メトリクスバックエンドのストレージをすぐに枯渇させてしまいます。

これを防ぐため、Qwen Codeはデフォルトでメトリクスデータポイントから高カーディナリティ属性を除外します。スパンとログはイベントごとであり影響を受けないため、トレースとログの相関のために引き続き `session.id` を保持します。

#### `telemetry.metrics.includeSessionId`（デフォルト: `false`）

これを `true` に設定する（設定または `QWEN_TELEMETRY_METRICS_INCLUDE_SESSION_ID=true` 経由）と、`session.id` がすべてのメトリクスデータポイントに再付加されます。

⚠️ **警告:** 各CLIセッションは新しい値を作成します。フリートでこれを有効にすると、メトリクスストレージが爆発します。短期間のデバッグのみに推奨します。長期的なセッション相関には、代わりにトレースまたはログバックエンドをクエリしてください。

#### 以前のバージョンからの移行

このリリース以前は、`session.id` がデフォルトでメトリクスに付加されていました。Prometheusクエリ/Grafanaダッシュボード/アラートルールがメトリクスの `session_id` を参照している場合、2つの選択肢があります:

**オプションA** — 短期間のデバッグのために以前の動作を復元:

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

**オプションB（推奨）** — セッションレベルの分析をメトリクスから移動します。スパンとログは引き続き `session.id` を保持し、トレース/ログバックエンド（Jaeger、Tempo、Loki、Aliyun SLS / ARMS Tracing）はカーディナリティのプレッシャーなしにセッションごとのスライスをネイティブに処理します。

### アウトバウンドフェッチ時のクライアント側HTTPスパン

Telemetryが有効な場合、Qwen Codeは `UndiciInstrumentation` を登録し、プロセスによって発信されるすべてのアウトバウンド `fetch()` リクエスト（LLM SDK（`openai`、`@google/genai`、`@anthropic-ai/sdk`）、MCP StreamableHTTPクライアント、`WebFetch` ツール、およびIDE拡張のプロセス外呼び出しを含む）に対してクライアント側HTTPスパンを作成します。このスパンにより、既存の `api.generateContent` スパン単独では区別できない上流のモデル処理時間から、ネットワークレイテンシ（TTFB / レスポンスボディ転送）を分けて確認できます。

これらのスパンは、他のTelemetryと同様に**独自の**OTLPコレクター（またはファイルアウトファイル）に送信されます。アウトバウンドHTTPリクエスト自体に書き込まれる内容には影響しません。W3C `traceparent` ヘッダーが送信リクエストストリームにも書き込まれるかどうかは、以下の[アウトバウンド相関（セキュリティ関連）](#outbound-correlation-security-relevant)で説明されている**別のセキュリティ関連設定**によって制御されます。

**フィードバックループの回避。** OTel SDKはOTLPデータをアップロードするために内部的に `fetch` を使用します。保護がない場合、`fetch` を計装するとそれらのアップロードもトレースされ、それ自体がアップロードされることで無限ループを引き起こします。Qwen Codeのundici計装は、設定された `telemetry.otlpEndpoint` / `telemetry.otlpTracesEndpoint` / `telemetry.otlpLogsEndpoint` / `telemetry.otlpMetricsEndpoint` プレフィックスに一致するURLをスキップする `ignoreRequestHook` で構成されています。ファイルアウトファイルモードではアウトバウンドHTTPアップロードがないため、フックはノーオペレーションになります。

## アウトバウンド相関（セキュリティ関連）

これらの設定は、意図的に `telemetry.*` とは**別のトップレベル名前空間**に存在します。Telemetryはオペレーターの独自のオブザーバビリティバックエンドへのデータフローを制御しますが、`outboundCorrelation.*` はqwen-codeがサードパーティのLLMプロバイダーエンドポイント（DashScope、OpenAI、Anthropicなど）に到達する**アウトバウンドLLM APIリクエストストリームに書き込む**クライアント側相関データを制御します。異なる受信者、異なる同意の決定。**すべての値はデフォルトでオフです。** フレーミングの根拠についてはPR #4390のレビュー議論を参照してください。
### `outboundCorrelation.propagateTraceContext`

```jsonc
"outboundCorrelation": {
  "propagateTraceContext": false // default
}
```

`false`（デフォルト）の場合、Qwen Code は OTel SDK に no-op の `TextMapPropagator` をインストールします。UndiciInstrumentation は OTLP コレクター用のクライアント HTTP スパンを引き続き作成しますが、`propagation.inject()` は no-op となるため、**アウトバウンドリクエストに `traceparent` は書き込まれません**。トレース ID はオペレーターのコレクター内部に留まります。

`true` の場合、SDK のデフォルトの W3C 複合プロパゲーター（`tracecontext` + `baggage`）がインストールされ、すべてのアウトバウンド `fetch` に標準の `traceparent` ヘッダーが書き込まれます。

```
traceparent: 00-<32-hex traceId>-<16-hex parentSpanId>-<01-sampled | 00-not-sampled>
```

さらに、シェルの子プロセス（Bash ツール、フック、モニター）で `TRACEPARENT` および `TRACESTATE` 環境変数が設定されるため、生成されたコマンドが同じ分散トレースに参加できるようになります。

LLM プロバイダーもクロスプロセスのトレース結合のために OTLP コレクターにレポートを送信する場合（例：DashScope を提供する ARMS Tracing）にのみオプトインしてください。ほとんどのオペレーターでは値は `false` です。クロスベンダーのトレース継続はニッチなユースケースです。

**`telemetry.enabled: true` に依存します。** OTel SDK はテレメトリが有効な場合にのみ初期化されるため、`propagateTraceContext` もその状態でのみ有効になります。テレメトリが無効な状態で `true` に設定しても、サイレントな no-op となります（SDK もプロパゲーターも存在せず、ネットワーク上に `traceparent` も送信されません）。ARMS+DashScope の相関設定を構築する際は、両方のフラグを確認してください。

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

`X-Qwen-Code-Session-Id` と `X-Qwen-Code-Request-Id` は **この PR の対象外です**。これらは、同じ `outboundCorrelation.*` 名前空間の下で、それぞれ独自の脅威モデルとオペレーターの同意フローを備えた後続の PR で設計・提案される予定です。PR #4390 のレビュー（LaZzyMan）で、「テレメトリの作業範囲には LLM プロバイダーへの識別子の送信は含まれない」という原則が確立されました。相関ヘッダーの作業は、テレメトリの下に実装するのではなく、独自の設計議論に移行されます。

## Aliyun Telemetry

### 手動 OTLP エクスポート

Alibaba Cloud Managed Service for OpenTelemetry で Qwen Code のテレメトリを表示するには、ARMS が提供する OTLP エンドポイントにエクスポートするように Qwen Code を構成します。

`"target": "gcp"` を設定するだけでは、エクスポート先は構成されません。`otlpEndpoint` が設定されていない場合、Qwen Code はデフォルトで `http://localhost:4317` に設定されます。`outfile` が設定されている場合、それは `otlpEndpoint` をオーバーライドし、テレメトリは Alibaba Cloud に送信される代わりにファイルに書き込まれます。

1. `.qwen/settings.json` でテレメトリを有効にし、OTLP エンドポイントを設定します。

   **オプション A: gRPC プロトコル**（標準 OTLP エンドポイント）:

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

   **オプション B: シグナルごとのエンドポイントを持つ HTTP プロトコル**（`/v1/traces` の代わりに `/api/otlp/traces` など、非標準のパスを使用するバックエンド用）:

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

   > **注:** `otlpEndpoint` のみを使用し（シグナルごとのオーバーライドなし）、HTTP プロトコルを使用する場合、Qwen Code はベース URL に標準の OTLP パス（`/v1/traces`、`/v1/logs`、`/v1/metrics`）を追加します。バックエンドが異なるパスを使用する場合は、オプション B に示すようにシグナルごとのエンドポイントオーバーライドを使用してください。

2. Alibaba Cloud のエンドポイントで認証が必要な場合は、`OTEL_EXPORTER_OTLP_HEADERS`（またはシグナル固有のバリアント）などの標準的な OpenTelemetry 環境変数を通じて OTLP ヘッダーを指定します。Qwen Code は現在、`.qwen/settings.json` で OTLP 認証ヘッダーを直接公開していません。
3. Qwen Code を実行し、プロンプトを送信します。
4. Managed Service for OpenTelemetry でテレメトリを表示します。
   - 製品概要:
     [What is Managed Service for OpenTelemetry?][aliyun-opentelemetry-overview]
   - 利用開始:
     [Get started with Managed Service for OpenTelemetry][aliyun-opentelemetry-get-started]
   - コンソールエントリーポイント:
     - 中国本土:
       [trace.console.aliyun.com][aliyun-opentelemetry-console-cn]
       （レガシーコンソール:
       [tracing.console.aliyun.com][aliyun-opentelemetry-console-cn-legacy]）
     - 国際:
       [arms.console.alibabacloud.com][aliyun-opentelemetry-console-intl]
   - コンソールで `Applications` を使用して、トレースとサービストポロジを検査します。
   - OTLP エンドポイントとアクセス情報の場所を確認するには:
     - **新しいコンソール**（`trace.console.aliyun.com` または国際版）:
       `Integration Center` に移動します。
     - **レガシーコンソール**（`tracing.console.aliyun.com`）:
       `Cluster Configurations` → `Access point information` に移動します。

## ローカルテレメトリ

ローカル開発およびデバッグのために、テレメトリデータをローカルでキャプチャできます。

### ファイルベースの出力（推奨）

1. `.qwen/settings.json` でテレメトリを有効にします。

   ```json
   {
     "telemetry": {
       "enabled": true,
       "outfile": ".qwen/telemetry.log"
     }
   }
   ```

   > **注:** `outfile` が設定されると、OTLP エクスポートは自動的に無効になります。
   > ファイルのみの出力には `target` と `otlpEndpoint` の設定は不要であり、設定から安全に省略できます。

2. Qwen Code を実行し、プロンプトを送信します。
3. 指定されたファイル（例: `.qwen/telemetry.log`）でログとメトリクスを表示します。

### コレクターベースのエクスポート（上級者向け）

1. 自動化スクリプトを実行します。
   ```bash
   npm run telemetry -- --target=local
   ```
   これにより以下の処理が行われます。
   - Jaeger と OTEL コレクターをダウンロードして起動します
   - ローカルテレメトリ用にワークスペースを構成します
   - http://localhost:16686 で Jaeger UI を提供します
   - ログ/メトリクスを `~/.qwen/tmp/<projectHash>/otel/collector.log` に保存します
   - 終了時にコレクターを停止します（例: `Ctrl+C`）
2. Qwen Code を実行し、プロンプトを送信します。
3. http://localhost:16686 でトレースを、コレクターのログファイルでログ/メトリクスを表示します。

## ログとメトリクス

以下のセクションでは、Qwen Code 用に生成されるログ、メトリクス、およびスパンの構造について説明します。

- すべてのログとメトリクスには、共通属性として `sessionId` が含まれます。

### ログ

ログは、特定のイベントのタイムスタンプ付きレコードです。すべてのログレコードには、`event.name` と `event.timestamp` 属性が自動的に含まれます。

以下のイベントがログに記録されます。

#### コアセッションイベント

- `qwen-code.config`: 起動時に CLI 構成とともに 1 回だけ発行されます。
  - **属性**: `model`, `sandbox_enabled`, `core_tools_enabled`, `approval_mode`, `file_filtering_respect_git_ignore`, `debug_mode`, `truncate_tool_output_threshold`, `truncate_tool_output_lines`, `hooks`（カンマ区切り、無効な場合は省略）, `ide_enabled`, `interactive_shell_enabled`, `mcp_servers`, `mcp_servers_count`, `mcp_tools`, `mcp_tools_count`, `output_format`, `skills`, `subagents`

- `qwen-code.user_prompt`: ユーザーがプロンプトを送信します。
  - **属性**: `prompt_length` (int), `prompt_id` (string), `prompt` (string, `log_prompts_enabled` が false の場合は除外), `auth_type` (string)

- `qwen-code.user_retry`: ユーザーが最後のプロンプトを再試行します。
  - **属性**: `prompt_id` (string)

- `qwen-code.conversation_finished`: 会話のターンシーケンスが完了します。
  - **属性**: `approvalMode` (string), `turnCount` (int)

- `qwen-code.user_feedback`: ユーザーがセッションフィードバックを送信します。
  - **属性**: `session_id` (string), `rating` (int: 1=bad, 2=fine, 3=good), `model` (string), `approval_mode` (string), `prompt_id` (string, オプション)

#### ツールイベント

- `qwen-code.tool_call`: 各関数/ツールの呼び出し。
  - **属性**: `function_name` (string), `function_args` (object), `duration_ms` (int), `status` (string: "success", "error", または "cancelled"), `success` (boolean), `decision` (string: "accept", "reject", "auto_accept", または "modify"、オプション), `error` (string, オプション), `error_type` (string, オプション), `prompt_id` (string), `response_id` (string, オプション), `content_length` (int, オプション), `tool_type` (string: "native" または "mcp"), `mcp_server_name` (string, オプション), `metadata` (object, オプション — ファイル書き込みツールの場合、`model_added_lines`, `model_removed_lines`, `user_added_lines`, `user_removed_lines`, `model_added_chars`, `model_removed_chars`, `user_added_chars`, `user_removed_chars` を含む)

- `qwen-code.file_operation`: 各ファイル操作。
  - **属性**: `tool_name` (string), `operation` (string: "create", "read", "update"), `lines` (int, オプション), `mimetype` (string, オプション), `extension` (string, オプション), `programming_language` (string, オプション)

- `qwen-code.tool_output_truncated`: ツールの出力がサイズ閾値を超過しました。
  - **属性**: `tool_name` (string), `original_content_length` (int), `truncated_content_length` (int), `threshold` (int), `lines` (int), `prompt_id` (string)

#### API イベント

- `qwen-code.api_request`: LLM API への送信リクエスト。
  - **属性**: `model` (string), `prompt_id` (string), `request_text` (string, オプション), `subagent_name` (string, オプション)

- `qwen-code.api_response`: LLM API から受信したレスポンス。
  - **属性**: `response_id` (string), `model` (string), `status_code` (int/string, オプション), `duration_ms` (int), `input_token_count` (int), `output_token_count` (int), `cached_content_token_count` (int), `thoughts_token_count` (int), `total_token_count` (int), `prompt_id` (string), `auth_type` (string, オプション), `response_text` (string, オプション), `subagent_name` (string, オプション)

- `qwen-code.api_error`: API リクエストが失敗しました。
  - **属性**: `model` (string), `prompt_id` (string), `duration_ms` (int), `error_message` (string), `response_id` (string, オプション), `auth_type` (string, オプション), `error_type` (string, オプション), `status_code` (int/string, オプション), `subagent_name` (string, オプション)

  さらに、互換性のために OTel 標準のエイリアス（`http.status_code`, `error.message`, `model_name`, `duration`）が発行されます。

- `qwen-code.api_cancel`: API リクエストがユーザーによってキャンセルされました。
  - **属性**: `model` (string), `prompt_id` (string), `auth_type` (string, オプション), `loop_wakeups_cancelled` (int, オプション)

- `qwen-code.api_retry`: LLM 呼び出しサイトでの HTTP ステータスリトライ（429/5xx）。別の予算で `InvalidStreamError` リトライを処理する `chat.content_retry` とは区別されます。
  - **属性**: `model` (string), `prompt_id` (string, オプション), `attempt_number` (int), `error_type` (string, オプション), `error_message` (string), `status_code` (int/string, オプション), `retry_delay_ms` (int), `duration_ms` (int, retry_delay_ms と等しい — HTTP ラウンドトリップではなくバックオフスリープ時間。試行期間については qwen-code.llm_request スパンを参照), `subagent_name` (string, オプション)

- `qwen-code.malformed_json_response`: `generateJson` のレスポンスを解析できませんでした。
  - **属性**: `model` (string)

- `qwen-code.flash_fallback`: フォールバックとして flash モデルに切り替えました。
  - **属性**: `auth_type` (string)

- `qwen-code.ripgrep_fallback`: フォールバックとして grep に切り替えました。
  - **属性**: `use_ripgrep` (boolean), `use_builtin_ripgrep` (boolean), `error` (string, オプション)

#### レジリエンスイベント

- `qwen-code.chat.content_retry`: コンテンツエラーのリトライ（例: 空のストリーム）。
  - **属性**: `attempt_number` (int), `error_type` (string), `retry_delay_ms` (int), `model` (string)

- `qwen-code.chat.content_retry_failure`: すべてのコンテンツリトライが使い果たされました。
  - **属性**: `total_attempts` (int), `final_error_type` (string), `total_duration_ms` (int, オプション), `model` (string)

- `qwen-code.chat.invalid_chunk`: ストリームから無効なチャンクを受信しました。
  - **属性**: `error.message` (string, オプション)

#### コマンド＆拡張機能イベント

- `qwen-code.slash_command`: ユーザーがスラッシュコマンドを実行します。
  - **属性**: `command` (string), `subcommand` (string, オプション), `status` (string: "success" または "error"、オプション)

- `qwen-code.slash_command.model`: ユーザーが `/model` コマンドを介してモデルを切り替えます。
  - **属性**: `model_name` (string)

- `qwen-code.skill_launch`: スキルが起動されます。
  - **属性**: `skill_name` (string), `success` (boolean), `prompt_id` (string)

- `qwen-code.extension_install`: 拡張機能がインストールされました。
  - **属性**: `extension_name` (string), `extension_version` (string), `extension_source` (string), `status` (string: "success"/"error")

- `qwen-code.extension_uninstall`: 拡張機能がアンインストールされました。
  - **属性**: `extension_name` (string), `status` (string)

- `qwen-code.extension_enable`: 拡張機能が有効化されました。
  - **属性**: `extension_name` (string), `setting_scope` (string)

- `qwen-code.extension_disable`: 拡張機能が無効化されました。
  - **属性**: `extension_name` (string), `setting_scope` (string)

- `qwen-code.extension_update`: 拡張機能が更新されました。
  - **属性**: `extension_name` (string), `extension_id` (string), `extension_previous_version` (string), `extension_version` (string), `extension_source` (string), `status` (string: "success"/"error")

- `qwen-code.ide_connection`: IDE 接続イベント。
  - **属性**: `connection_type` (string: "start" または "session")

- `qwen-code.auth`: 認証イベント。
  - **属性**: `auth_type` (string), `action_type` ("auto", "manual", "coding-plan"), `status` ("success", "error", "cancelled"), `error_message` (オプション)

#### サブエージェントイベント

- `qwen-code.subagent_execution`: サブエージェントのライフサイクルイベント。
  - **属性**: `subagent_name` (string), `status` ("started", "completed", "failed", "cancelled"), `terminate_reason` (オプション), `result` (オプション), `execution_summary` (オプション)

#### Arena イベント

- `qwen-code.arena_session_started`: Arena セッションが開始されます。
  - **属性**: `arena_session_id` (string), `model_ids` (JSON 文字列配列), `task_length` (int)

- `qwen-code.arena_agent_completed`: Arena エージェントが完了します。
  - **属性**: `arena_session_id` (string), `agent_session_id` (string), `agent_model_id` (string), `status` (string: "completed"/"failed"/"cancelled"), `duration_ms` (int), `rounds` (int), `total_tokens` (int), `input_tokens` (int), `output_tokens` (int), `tool_calls` (int), `successful_tool_calls` (int), `failed_tool_calls` (int)

- `qwen-code.arena_session_ended`: Arena セッションが完了します。
  - **属性**: `arena_session_id` (string), `status` (string: "selected"/"discarded"/"failed"/"cancelled"), `duration_ms` (int), `display_backend` (string, オプション), `agent_count` (int), `completed_agents` (int), `failed_agents` (int), `cancelled_agents` (int), `winner_model_id` (string, オプション)

#### ワークフローイベント

- `qwen-code.workflow_keyword`: ワークフローのキーワードトリガーが発火しました。

- `qwen-code.workflow_run`: ワークフローの実行が終了状態に達しました。
  - **属性**: `status` (string), `agents_dispatched` (int), `agents_completed` (int), `phase_count` (int), `tokens_spent` (int), `duration_ms` (int)

#### 自動メモリイベント

- `qwen-code.memory.extract`: メモリ抽出の実行が完了しました。
  - **属性**: `trigger` ("auto"/"manual"), `status` ("completed"/"skipped"/"failed"), `skipped_reason` (オプション), `patches_count` (int), `touched_topics` (string), `duration_ms` (int)

- `qwen-code.memory.dream`: メモリ統合（ドリーム）の実行が完了しました。
  - **属性**: `trigger` ("auto"/"manual"), `status` ("updated"/"noop"/"failed"/"cancelled"), `deduped_entries` (int), `touched_topics_count` (int), `touched_topics` (string), `duration_ms` (int)

- `qwen-code.memory.recall`: メモリリコール操作が完了しました。
  - **属性**: `query_length` (int), `docs_scanned` (int), `docs_selected` (int), `strategy` ("none"/"heuristic"/"model"), `duration_ms` (int)

#### プロンプト提案＆推測イベント

- `qwen-code.prompt_suggestion`: プロンプト提案の結果。
  - **属性**: `outcome` ("accepted"/"ignored"/"suppressed"), `prompt_id` (オプション), `accept_method` ("tab"/"enter"/"right", オプション), `accept_source` ("live"/"fallback", オプション), `time_to_accept_ms` (オプション), `time_to_ignore_ms` (オプション), `time_to_first_keystroke_ms` (オプション), `suggestion_length` (オプション), `similarity` (オプション), `was_focused_when_shown` (オプション), `reason` (オプション)

- `qwen-code.speculation`: 投機実行の結果。
  - **属性**: `outcome` ("accepted"/"aborted"/"failed"), `turns_used` (int), `files_written` (int), `tool_use_count` (int), `duration_ms` (int), `boundary_type` (オプション), `had_pipelined_suggestion` (boolean)

#### その他のイベント

- `qwen-code.chat_compression`: チャットコンテキストが圧縮されました。
  - **属性**: `tokens_before` (int), `tokens_after` (int), `compression_input_token_count` (int, オプション), `compression_output_token_count` (int, オプション)

- `qwen-code.next_speaker_check`: 次の発言者の決定。
  - **属性**: `prompt_id` (string), `finish_reason` (string), `result` (string)

- `loop_detected`: エージェントの実行中にループが検出されました。_（注: `qwen-code.` プレフィックスなしで発行されます — 既存の不整合です。）_
  - **属性**: `loop_type` (string), `prompt_id` (string)

- `kitty_sequence_overflow`: Kitty グラフィックスプロトコルのシーケンスがバッファサイズを超過しました。_（注: `qwen-code.` プレフィックスなしで発行されます — 既存の不整合です。）_
  - **属性**: `sequence_length` (int), `truncated_sequence` (string, 最初の 20 文字)

### メトリクス

メトリクスは、時間の経過に伴う動作の数値測定値です。メトリクス名には `qwen-code.*` プレフィックスが使用されます。

#### コアメトリクス

- `qwen-code.session.count` (Counter, Int): CLI の起動ごとに 1 回ずつインクリメントされます。

- `qwen-code.tool.call.count` (Counter, Int): ツール呼び出しをカウントします。
  - **属性**: `function_name`, `success` (boolean), `decision` ("accept"/"reject"/"auto_accept"/"modify", オプション), `tool_type` ("mcp"/"native", オプション)

- `qwen-code.tool.call.latency` (Histogram, ms): ツール呼び出しのレイテンシを測定します。
  - **属性**: `function_name` (string)

- `qwen-code.api.request.count` (Counter, Int): すべての API リクエストをカウントします。
  - **属性**: `model`, `status_code`, `error_type` (オプション)

- `qwen-code.api.request.latency` (Histogram, ms): API リクエストのレイテンシを測定します。
  - **属性**: `model` (string)

- `qwen-code.token.usage` (Counter, Int): 使用されたトークンをカウントします。
  - **属性**: `model`, `type` ("input"/"output"/"thought"/"cache")

- `qwen-code.file.operation.count` (Counter, Int): ファイル操作をカウントします。
  - **属性**: `operation` ("create"/"read"/"update"), `lines` (オプション), `mimetype` (オプション), `extension` (オプション), `programming_language` (オプション)

- `qwen-code.chat_compression` (Counter, Int): チャット圧縮操作をカウントします。
  - **属性**: `tokens_before` (int), `tokens_after` (int)

- `qwen-code.slash_command.model.call_count` (Counter, Int): モデルスラッシュコマンドの呼び出しをカウントします。
  - **属性**: `slash_command.model.model_name` (string)

- `qwen-code.subagent.execution.count` (Counter, Int): サブエージェントの実行イベントをカウントします。
  - **属性**: `subagent_name`, `status` ("started"/"completed"/"failed"/"cancelled"), `terminate_reason` (オプション)

#### レジリエンスメトリクス

- `qwen-code.api.retry.count` (Counter, Int): LLM 呼び出しサイトでの HTTP ステータスリトライ（429/5xx）。
  - **属性**: `model` (string)

- `qwen-code.chat.content_retry.count` (Counter, Int): コンテンツエラーによるリトライ。

- `qwen-code.chat.content_retry_failure.count` (Counter, Int): すべてのコンテンツリトライが使い果たされました。

- `qwen-code.chat.invalid_chunk.count` (Counter, Int): ストリームからの無効なチャンク。

#### Arena メトリクス

- `qwen-code.arena.session.count` (Counter, Int): ステータス別の Arena セッション。
  - **属性**: `status`, `display_backend` (オプション)
- `qwen-code.arena.session.duration` (Histogram, ms): Arena セッションの所要時間。
  - **Attributes**: `status`

- `qwen-code.arena.agent.count` (Counter, Int): Arena エージェントの完了数。
  - **Attributes**: `status`, `model_id`

- `qwen-code.arena.agent.duration` (Histogram, ms): Arena エージェントの実行時間。
  - **Attributes**: `model_id`

- `qwen-code.arena.agent.tokens` (Counter, Int): Arena エージェントによるトークン使用量。
  - **Attributes**: `model_id`, `type` ("input"/"output")

- `qwen-code.arena.result.selected` (Counter, Int): Arena 結果の選択数。
  - **Attributes**: `model_id`

#### Auto-Memory Metrics

- `qwen-code.memory.extract.count` (Counter, Int): Auto-memory の抽出実行回数。
  - **Attributes**: `trigger` ("auto"/"manual"), `status`

- `qwen-code.memory.extract.duration` (Histogram, ms): 抽出の所要時間。
  - **Attributes**: `trigger`, `status`

- `qwen-code.memory.dream.count` (Counter, Int): Auto-memory の dream 実行回数。
  - **Attributes**: `trigger` ("auto"/"manual"), `status`

- `qwen-code.memory.dream.duration` (Histogram, ms): dream 実行の所要時間。
  - **Attributes**: `trigger`, `status`

- `qwen-code.memory.recall.count` (Counter, Int): Auto-memory の recall 操作回数。
  - **Attributes**: `strategy` ("none"/"heuristic"/"model")

- `qwen-code.memory.recall.duration` (Histogram, ms): recall の所要時間。
  - **Attributes**: `strategy`

#### API Request Breakdown

- `qwen-code.api.request.breakdown` (Histogram, ms): フェーズ別の API リクエスト時間の内訳。
  - **Attributes**: `model`, `phase` ("request_preparation"/"network_latency"/"response_processing"/"token_processing")

### Daemon Metrics

デーモンプロセス（長時間稼働する HTTP サーバーモード）は、独自のメトリクスを公開します。

> **Note:** 3 つの Observable Gauge (`daemon.session.active`, `daemon.sse.active`, `daemon.process.heap_used`) は、各収集間隔で更新されるコールバックベースのメトリクスです。観測コールバックを登録するには、デーモン初期化時に `registerDaemonGaugeCallbacks()` を呼び出す必要があります。

#### HTTP

- `qwen-code.daemon.http.request.count` (Counter, Int): ルートおよびステータスクラス別のリクエスト数。
  - **Attributes**: `route`, `status_class` ("2xx"/"4xx"/"5xx")

- `qwen-code.daemon.http.request.duration` (Histogram, ms): リクエストの所要時間。
  - **Attributes**: `route`
  - **Buckets**: 1, 2, 5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000, 30000

#### Sessions

- `qwen-code.daemon.session.active` (ObservableGauge, Int): 現在アクティブなセッション数。

- `qwen-code.daemon.session.lifecycle` (Counter, Int): セッションのライフサイクルイベント。
  - **Attributes**: `action` ("spawn"/"close"/"die")

#### Channels

- `qwen-code.daemon.channel.lifecycle` (Counter, Int): ACP チャネルのライフサイクルイベント。
  - **Attributes**: `action` ("spawn"/"exit"), `expected` (boolean, optional)

#### Prompts

- `qwen-code.daemon.prompt.queue_wait` (Histogram, ms): プロンプト FIFO キューの待機時間。
  - **Buckets**: 1, 5, 10, 50, 100, 500, 1000, 5000, 10000, 30000, 60000

- `qwen-code.daemon.prompt.duration` (Histogram, ms): エンドツーエンドのプロンプト所要時間。
  - **Buckets**: 100, 500, 1000, 2500, 5000, 10000, 30000, 60000, 120000, 300000, 600000

#### Errors

- `qwen-code.daemon.bridge.error.count` (Counter, Int): 種類別のブリッジエラー数。
  - **Attributes**: `error_type` (既知のクラス名または "unknown")

- `qwen-code.daemon.cancel.count` (Counter, Int): キャンセルリクエスト数。

#### Resources

- `qwen-code.daemon.sse.active` (ObservableGauge, Int): アクティブな SSE 接続数。

- `qwen-code.daemon.process.heap_used` (ObservableGauge, Int, bytes): ヒープメモリ使用量。

### Spans

分散トレースの span は `qwen-code.interaction` をルートとするツリーを形成します。各 interaction は独自の `traceId` を持つトレースルートであり、プロンプト間の相関には `session.id` 属性が使用されます。

- `qwen-code.interaction`: 各ユーザープロンプトターンのルート span。
  - **Attributes**: `session.id`, `qwen-code.prompt_id`, `qwen-code.message_type`, `qwen-code.model`, `qwen-code.approval_mode`, `interaction.sequence`, `interaction.duration_ms`, `qwen-code.turn_status` ("ok"/"error"/"cancelled")

- `qwen-code.llm_request`: 単一の LLM API 呼び出しをラップします。
  - **Attributes**: `session.id`, `qwen-code.model`, `qwen-code.prompt_id`, `llm_request.context` ("subagent"/"interaction"/"standalone"), `gen_ai.request.model`, `duration_ms`, `input_tokens`, `output_tokens`, `cached_input_tokens`, `ttft_ms`, `request_setup_ms`, `attempt`, `retry_total_delay_ms`, `sampling_ms`, `output_tokens_per_second`, `success`, `error`, `response_id`, `finish_reason`, `thoughts_token_count`, `subagent_name`, `error_type`, `error_status_code`

- `qwen-code.tool`: ツールの完全なライフサイクル（承認待機 + 実行）をラップします。
  - **Attributes**: `session.id`, `tool.name`, `duration_ms`, `success`, `error`

- `qwen-code.tool.execution`: ツール実行フェーズ（承認後）をラップします。
  - **Attributes**: `session.id`, `duration_ms`, `success`, `error`

- `qwen-code.tool.blocked_on_user`: ツールがユーザー承認を待機している時間。
  - **Attributes**: `session.id`, `tool.name`, `tool.call_id`, `duration_ms`, `decision` ("proceed_once"/"proceed_always"/"cancel"/"aborted"/"auto_approved"/"error"), `source` ("cli"/"ide"/"hook"/"auto"/"system")

- `qwen-code.hook`: 各 pre/post-tool-use フックの発火サイトをラップします。
  - **Attributes**: `session.id`, `hook_event` ("PreToolUse"/"PostToolUse"/"PostToolUseFailure"/"PostToolBatch"), `tool.name`, `tool.use_id` (optional), `is_interrupt` (boolean, optional), `duration_ms`, `success`, `should_proceed` (optional), `should_stop` (optional), `block_type` (optional), `error` (optional)

- `qwen-code.subagent`: 単一のサブエージェント呼び出しをラップします。
  - **Attributes**: `gen_ai.operation.name`, `gen_ai.provider.name`, `gen_ai.agent.id`, `gen_ai.agent.name`, `gen_ai.conversation.id`, `qwen-code.subagent.id`, `qwen-code.subagent.name`, `qwen-code.subagent.invocation_kind` ("foreground"/"fork"/"background"), `qwen-code.subagent.is_built_in`, `qwen-code.subagent.depth`, `qwen-code.subagent.status`, `qwen-code.subagent.terminate_reason`, `qwen-code.subagent.duration_ms`

- `qwen-code.daemon.request`: デーモン HTTP リクエストをラップします。
  - **Attributes**: `http.request.method`, `http.route`, `qwen-code.daemon.operation`, `session.id`, `http.response.status_code`

- `qwen-code.daemon.bridge`: デーモンブリッジ操作をラップします。
  - **Attributes**: `qwen-code.daemon.operation`

#### Resource Metrics

- `qwen-code.memory.usage` (Histogram, bytes): メモリ使用量。テレメトリが有効な場合、メモリプレッシャーモニターによって記録されます。
  - **Attributes**: `memory_type` (string: "heap_used"/"rss")

- `qwen-code.cpu.usage` (Histogram, percent): CPU 使用率。テレメトリが有効な場合、メモリプレッシャーモニターによって記録されます。
  - **Attributes**: (none)

### Performance Monitoring (Reserved)

以下のメトリクスは定義されていますが、**本番環境ではまだ有効化されていません**。専用のパフォーマンスモニタリング設定フラグの背後で有効化される予定です。

- `qwen-code.startup.duration` (Histogram, ms): フェーズ別の CLI 起動時間。
  - **Attributes**: `phase` (string)

- `qwen-code.tool.queue.depth` (Histogram, count): 実行キュー内のツール数。

- `qwen-code.tool.execution.breakdown` (Histogram, ms): フェーズ別のツール実行時間。
  - **Attributes**: `function_name`, `phase` ("validation"/"preparation"/"execution"/"result_processing")

- `qwen-code.token.efficiency` (Histogram, ratio): トークン効率メトリクス。
  - **Attributes**: `model`, `metric`, `context` (optional)

- `qwen-code.performance.score` (Histogram, score): 複合パフォーマンススコア (0-100)。
  - **Attributes**: `category`, `baseline` (optional)

- `qwen-code.performance.regression` (Counter, Int): 回帰検出イベント。
  - **Attributes**: `metric`, `severity` ("low"/"medium"/"high"), `current_value`, `baseline_value`

- `qwen-code.performance.regression.percentage_change` (Histogram, percent): ベースラインに対する変化率。
  - **Attributes**: `metric`, `severity`, `current_value`, `baseline_value`

- `qwen-code.performance.baseline.comparison` (Histogram, percent): ベースラインに対するパフォーマンス。
  - **Attributes**: `metric`, `category`, `current_value`, `baseline_value`