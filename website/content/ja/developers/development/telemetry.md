# OpenTelemetry によるオブザーバビリティ

Qwen Code で OpenTelemetry を有効化および設定する方法を学びます。

- [OpenTelemetry によるオブザーバビリティ](#observability-with-opentelemetry)
  - [主なメリット](#key-benefits)
  - [OpenTelemetry 統合](#opentelemetry-integration)
  - [設定](#configuration)
  - [Aliyun テレメトリ](#aliyun-telemetry)
    - [手動 OTLP エクスポート](#manual-otlp-export)
  - [ローカルテレメトリ](#local-telemetry)
    - [ファイルベースの出力（推奨）](#file-based-output-recommended)
    - [コレクターベースのエクスポート（上級者向け）](#collector-based-export-advanced)
  - [ログとメトリクス](#logs-and-metrics)
    - [ログ](#logs)
    - [メトリクス](#metrics)

## 主なメリット

- **🔍 利用状況の分析**: チーム全体のインタラクションパターンや機能の採用状況を把握
- **⚡ パフォーマンスモニタリング**: 応答時間、トークン消費量、リソース使用率を追跡
- **🐛 リアルタイムデバッグ**: ボトルネック、障害、エラーパターンを発生時に特定
- **📊 ワークフローの最適化**: 設定やプロセスを改善するためのデータに基づく意思決定
- **🏢 エンタープライズガバナンス**: チーム間の使用状況を監視、コストを追跡、コンプライアンスを確保し、既存のモニタリングインフラと統合

## OpenTelemetry 統合

ベンダーニュートラルで業界標準のオブザーバビリティフレームワークである **[OpenTelemetry]** をベースに構築された Qwen Code のオブザーバビリティシステムは、以下を提供します：

- **汎用的な互換性**: 任意の OpenTelemetry バックエンド（Aliyun、Jaeger、Prometheus、Datadog など）にエクスポート可能
- **標準化されたデータ**: ツールチェーン全体で一貫した形式と収集方法を使用
- **将来を見据えた統合**: 既存および将来のオブザーバビリティインフラと接続
- **ベンダーロックインの回避**: インストルメンテーションを変更せずにバックエンドを切り替え可能

[OpenTelemetry]: https://opentelemetry.io/
[aliyun-opentelemetry-overview]: https://www.alibabacloud.com/help/en/arms/tracing-analysis/product-overview/what-is-tracing-analysis
[aliyun-opentelemetry-get-started]: https://www.alibabacloud.com/help/en/arms/tracing-analysis/before-you-begin
[aliyun-opentelemetry-console-cn]: https://trace.console.aliyun.com
[aliyun-opentelemetry-console-cn-legacy]: https://tracing.console.aliyun.com
[aliyun-opentelemetry-console-intl]: https://arms.console.alibabacloud.com

## Configuration

> [!note]
>
> **⚠️ 特記事項: この機能には対応するコードの変更が必要です。このドキュメントは事前に提供されるものであり、実際の機能については今後のコード更新を参照してください。**

すべてのテレメトリ動作は `.qwen/settings.json` ファイルで制御されます。これらの設定は、環境変数または CLI フラグで上書きできます。

| 設定               | 環境変数                   | CLI フラグ                                                 | 説明                                          | 値            | デフォルト                 |
| --------------------- | -------------------------------------- | -------------------------------------------------------- | ---------------------------------------------------- | ----------------- | ----------------------- |
| `enabled`             | `QWEN_TELEMETRY_ENABLED`               | `--telemetry` / `--no-telemetry`                         | テレメトリの有効化または無効化                          | `true`/`false`    | `false`                 |
| `target`              | `QWEN_TELEMETRY_TARGET`                | `--telemetry-target <local\|gcp>`                        | テレメトリデータの送信先                         | `"gcp"`/`"local"` | `"local"`               |
| `otlpEndpoint`        | `QWEN_TELEMETRY_OTLP_ENDPOINT`         | `--telemetry-otlp-endpoint <URL>`                        | OTLP コレクターのエンドポイント                              | URL 文字列        | `http://localhost:4317` |
| `otlpProtocol`        | `QWEN_TELEMETRY_OTLP_PROTOCOL`         | `--telemetry-otlp-protocol <grpc\|http>`                 | OTLP トランスポートプロトコル                              | `"grpc"`/`"http"` | `"grpc"`                |
| `otlpTracesEndpoint`  | `QWEN_TELEMETRY_OTLP_TRACES_ENDPOINT`  | -                                                        | トレース用のシグナル別エンドポイントの上書き（HTTP のみ）  | URL 文字列        | -                       |
| `otlpLogsEndpoint`    | `QWEN_TELEMETRY_OTLP_LOGS_ENDPOINT`    | -                                                        | ログ用のシグナル別エンドポイントの上書き（HTTP のみ）    | URL 文字列        | -                       |
| `otlpMetricsEndpoint` | `QWEN_TELEMETRY_OTLP_METRICS_ENDPOINT` | -                                                        | メトリクス用のシグナル別エンドポイントの上書き（HTTP のみ） | URL 文字列        | -                       |
| `outfile`             | `QWEN_TELEMETRY_OUTFILE`               | `--telemetry-outfile <path>`                             | テレメトリをファイルに保存（`otlpEndpoint` を上書き）    | ファイルパス         | -                       |
| `logPrompts`          | `QWEN_TELEMETRY_LOG_PROMPTS`           | `--telemetry-log-prompts` / `--no-telemetry-log-prompts` | テレメトリログにプロンプトを含める                    | `true`/`false`    | `true`                  |
| `useCollector`        | `QWEN_TELEMETRY_USE_COLLECTOR`         | -                                                        | 外部 OTLP コレクターを使用（上級者向け）               | `true`/`false`    | `false`                 |

**ブール型環境変数に関する注意:** ブール型設定（`enabled`、`logPrompts`、`useCollector`）の場合、対応する環境変数を `true` または `1` に設定すると機能が有効になります。それ以外の値は無効になります。

**HTTP OTLP シグナルルーティング:** HTTP プロトコル（`otlpProtocol: "http"`）を使用する場合、Qwen Code はベースの `otlpEndpoint` にシグナル固有のパス（`/v1/traces`、`/v1/logs`、`/v1/metrics`）を自動的に追加します。例えば、トレースの場合 `http://collector:4318` は `http://collector:4318/v1/traces` になります。URL が既にシグナルパスで終わっている場合は、そのまま使用されます。シグナル別エンドポイントの上書き（`otlpTracesEndpoint` など）はベースエンドポイントより優先され、そのまま使用されます。gRPC プロトコルはサービスベースのルーティングを使用し、パスは追加されません。

シグナル別エンドポイントの環境変数は、標準の OpenTelemetry 名（`OTEL_EXPORTER_OTLP_TRACES_ENDPOINT`、`OTEL_EXPORTER_OTLP_LOGS_ENDPOINT`、`OTEL_EXPORTER_OTLP_METRICS_ENDPOINT`）も受け入れます。`QWEN_TELEMETRY_OTLP_*` 変数は `OTEL_*` 変数より優先されます。

すべての設定オプションの詳細については、[設定ガイド](./cli/configuration.md) を参照してください。

## Aliyun テレメトリ

### 手動 OTLP エクスポート

Alibaba Cloud Managed Service for OpenTelemetry で Qwen Code のテレメトリを表示するには、ARMS が提供する OTLP エンドポイントにエクスポートするよう Qwen Code を設定します。

`"target": "gcp"` のみを設定しても、エクスポート先は構成されません。`otlpEndpoint` が設定されていない場合、Qwen Code は引き続き `http://localhost:4317` をデフォルトとして使用します。`outfile` が設定されている場合、`otlpEndpoint` が上書きされ、テレメトリは Alibaba Cloud に送信される代わりにファイルに書き込まれます。

1. `.qwen/settings.json` でテレメトリを有効にし、OTLP エンドポイントを設定します：

   **オプション A: gRPC プロトコル**（標準 OTLP エンドポイント）：

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

   **オプション B: HTTP プロトコルとシグナル別エンドポイント**（`/v1/traces` の代わりに `/api/otlp/traces` などの非標準パスを使用するバックエンド向け）：

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

   > **注意:** HTTP プロトコルを使用し、`otlpEndpoint` のみ（シグナル別の上書きなし）を設定する場合、Qwen Code は標準の OTLP パス（`/v1/traces`、`/v1/logs`、`/v1/metrics`）をベース URL に追加します。バックエンドが異なるパスを使用している場合は、オプション B に示すようにシグナル別エンドポイントの上書きを使用してください。

2. Alibaba Cloud のエンドポイントで認証が必要な場合は、`OTEL_EXPORTER_OTLP_HEADERS`（またはシグナル固有のバリアント）などの標準 OpenTelemetry 環境変数を通じて OTLP ヘッダーを提供します。Qwen Code は現在、`.qwen/settings.json` で OTLP 認証ヘッダーを直接公開していません。
3. Qwen Code を実行し、プロンプトを送信します。
4. Managed Service for OpenTelemetry でテレメトリを表示します：
   - 製品概要:
     [Managed Service for OpenTelemetry とは][aliyun-opentelemetry-overview]
   - 開始方法:
     [Managed Service for OpenTelemetry の利用開始][aliyun-opentelemetry-get-started]
   - コンソールエントリーポイント:
     - 中国本土:
       [trace.console.aliyun.com][aliyun-opentelemetry-console-cn]
       （レガシーコンソール:
       [tracing.console.aliyun.com][aliyun-opentelemetry-console-cn-legacy]）
     - インターナショナル:
       [arms.console.alibabacloud.com][aliyun-opentelemetry-console-intl]
   - コンソールでは、`Applications` を使用してトレースとサービストポロジを検査します。
   - OTLP エンドポイントとアクセス情報の確認方法:
     - **新コンソール**（`trace.console.aliyun.com` またはインターナショナル）: `Integration Center` に移動します。
     - **レガシーコンソール**（`tracing.console.aliyun.com`）: `Cluster Configurations` → `Access point information` に移動します。

## ローカルテレメトリ

ローカル開発およびデバッグ用に、テレメトリデータをローカルでキャプチャできます：

### ファイルベースの出力（推奨）

1. `.qwen/settings.json` でテレメトリを有効にします：
   ```json
   {
     "telemetry": {
       "enabled": true,
       "target": "local",
       "otlpEndpoint": "",
       "outfile": ".qwen/telemetry.log"
     }
   }
   ```
2. Qwen Code を実行し、プロンプトを送信します。
3. 指定されたファイル（例: `.qwen/telemetry.log`）でログとメトリクスを表示します。

### コレクターベースのエクスポート（上級者向け）

1. 自動化スクリプトを実行します：
   ```bash
   npm run telemetry -- --target=local
   ```
   これにより以下が実行されます：
   - Jaeger と OTEL コレクターをダウンロードして起動
   - ローカルテレメトリ用にワークスペースを構成
   - http://localhost:16686 で Jaeger UI を提供
   - ログ/メトリクスを `~/.qwen/tmp/<projectHash>/otel/collector.log` に保存
   - 終了時にコレクターを停止（例: `Ctrl+C`）
2. Qwen Code を実行し、プロンプトを送信します。
3. http://localhost:16686 でトレースを表示し、コレクターログファイルでログ/メトリクスを表示します。

## ログとメトリクス

以下のセクションでは、Qwen Code 用に生成されるログとメトリクスの構造について説明します。

- `sessionId` は、すべてのログとメトリクスに共通属性として含まれます。

### ログ

ログは、特定のイベントのタイムスタンプ付きレコードです。Qwen Code では以下のイベントがログに記録されます：

- `qwen-code.config`: CLI の構成とともに起動時に 1 回発生するイベント。
  - **属性**:
    - `model` (string)
    - `sandbox_enabled` (boolean)
    - `core_tools_enabled` (string)
    - `approval_mode` (string)
    - `file_filtering_respect_git_ignore` (boolean)
    - `debug_mode` (boolean)
    - `truncate_tool_output_threshold` (number)
    - `truncate_tool_output_lines` (number)
    - `hooks` (string, フックイベントタイプのカンマ区切りリスト。フックが無効な場合は省略)
    - `ide_enabled` (boolean)
    - `interactive_shell_enabled` (boolean)
    - `mcp_servers` (string)
    - `output_format` (string: "text" または "json")

- `qwen-code.user_prompt`: ユーザーがプロンプトを送信したときに発生するイベント。
  - **属性**:
    - `prompt_length` (int)
    - `prompt_id` (string)
    - `prompt` (string, `log_prompts_enabled` が `false` に設定されている場合はこの属性は除外されます)
    - `auth_type` (string)

- `qwen-code.tool_call`: 関数呼び出しごとに発生するイベント。
  - **属性**:
    - `function_name`
    - `function_args`
    - `duration_ms`
    - `success` (boolean)
    - `decision` (string: "accept"、"reject"、"auto_accept"、または "modify"。該当する場合)
    - `error` (該当する場合)
    - `error_type` (該当する場合)
    - `content_length` (int, 該当する場合)
    - `metadata` (該当する場合、string -> any の辞書)

- `qwen-code.file_operation`: ファイル操作ごとに発生するイベント。
  - **属性**:
    - `tool_name` (string)
    - `operation` (string: "create"、"read"、"update")
    - `lines` (int, 該当する場合)
    - `mimetype` (string, 該当する場合)
    - `extension` (string, 該当する場合)
    - `programming_language` (string, 該当する場合)
    - `diff_stat` (json string, 該当する場合): 以下のメンバーを持つ JSON 文字列：
      - `ai_added_lines` (int)
      - `ai_removed_lines` (int)
      - `user_added_lines` (int)
      - `user_removed_lines` (int)

- `qwen-code.api_request`: Qwen API へのリクエスト時に発生するイベント。
  - **属性**:
    - `model`
    - `request_text` (該当する場合)

- `qwen-code.api_error`: API リクエストが失敗した場合に発生するイベント。
  - **属性**:
    - `model`
    - `error`
    - `error_type`
    - `status_code`
    - `duration_ms`
    - `auth_type`

- `qwen-code.api_response`: Qwen API からのレスポンス受信時に発生するイベント。
  - **属性**:
    - `model`
    - `status_code`
    - `duration_ms`
    - `error` (オプション)
    - `input_token_count`
    - `output_token_count`
    - `cached_content_token_count`
    - `thoughts_token_count`
    - `response_text` (該当する場合)
    - `auth_type`

- `qwen-code.tool_output_truncated`: ツール呼び出しの出力が大きすぎて切り捨てられた場合に発生するイベント。
  - **属性**:
    - `tool_name` (string)
    - `original_content_length` (int)
    - `truncated_content_length` (int)
    - `threshold` (int)
    - `lines` (int)
    - `prompt_id` (string)

- `qwen-code.malformed_json_response`: Qwen API からの `generateJson` レスポンスが JSON として解析できない場合に発生するイベント。
  - **属性**:
    - `model`

- `qwen-code.flash_fallback`: Qwen Code がフォールバックとして flash に切り替えた場合に発生するイベント。
  - **属性**:
    - `auth_type`

- `qwen-code.slash_command`: ユーザーがスラッシュコマンドを実行したときに発生するイベント。
  - **属性**:
    - `command` (string)
    - `subcommand` (string, 該当する場合)

- `qwen-code.extension_enable`: 拡張機能が有効化されたときに発生するイベント
- `qwen-code.extension_install`: 拡張機能がインストールされたときに発生するイベント
  - **属性**:
    - `extension_name` (string)
    - `extension_version` (string)
    - `extension_source` (string)
    - `status` (string)
- `qwen-code.extension_uninstall`: 拡張機能がアンインストールされたときに発生するイベント

### メトリクス

メトリクスは、時間経過に伴う動作の数値測定値です。Qwen Code では以下のメトリクスが収集されます（互換性のため、メトリクス名は `qwen-code.*` のまま維持されます）：

- `qwen-code.session.count` (Counter, Int): CLI 起動ごとに 1 回インクリメントされます。

- `qwen-code.tool.call.count` (Counter, Int): ツール呼び出しをカウントします。
  - **属性**:
    - `function_name`
    - `success` (boolean)
    - `decision` (string: "accept"、"reject"、または "modify"。該当する場合)
    - `tool_type` (string: "mcp"、または "native"。該当する場合)

- `qwen-code.tool.call.latency` (Histogram, ms): ツール呼び出しのレイテンシを測定します。
  - **属性**:
    - `function_name`
    - `decision` (string: "accept"、"reject"、または "modify"。該当する場合)

- `qwen-code.api.request.count` (Counter, Int): すべての API リクエストをカウントします。
  - **属性**:
    - `model`
    - `status_code`
    - `error_type` (該当する場合)

- `qwen-code.api.request.latency` (Histogram, ms): API リクエストのレイテンシを測定します。
  - **属性**:
    - `model`

- `qwen-code.token.usage` (Counter, Int): 使用されたトークン数をカウントします。
  - **属性**:
    - `model`
    - `type` (string: "input"、"output"、"thought"、または "cache")

- `qwen-code.file.operation.count` (Counter, Int): ファイル操作をカウントします。
  - **属性**:
    - `operation` (string: "create"、"read"、"update"): ファイル操作のタイプ。
    - `lines` (Int, 該当する場合): ファイル内の行数。
    - `mimetype` (string, 該当する場合): ファイルの MIME タイプ。
    - `extension` (string, 該当する場合): ファイルの拡張子。
    - `model_added_lines` (Int, 該当する場合): モデルによって追加/変更された行数。
    - `model_removed_lines` (Int, 該当する場合): モデルによって削除/変更された行数。
    - `user_added_lines` (Int, 該当する場合): AI が提案した変更に対してユーザーによって追加/変更された行数。
    - `user_removed_lines` (Int, 該当する場合): AI が提案した変更に対してユーザーによって削除/変更された行数。
    - `programming_language` (string, 該当する場合): ファイルのプログラミング言語。

- `qwen-code.chat_compression` (Counter, Int): チャット圧縮操作をカウントします
  - **属性**:
    - `tokens_before`: (Int): 圧縮前のコンテキスト内のトークン数
    - `tokens_after`: (Int): 圧縮後のコンテキスト内のトークン数