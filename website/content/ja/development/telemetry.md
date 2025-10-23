```markdown
# OpenTelemetry によるオブザーバビリティ

Qwen Code で OpenTelemetry を有効化・セットアップする方法について学びます。

- [OpenTelemetry によるオブザーバビリティ](#observability-with-opentelemetry)
  - [主なメリット](#key-benefits)
  - [OpenTelemetry 連携](#opentelemetry-integration)
  - [設定](#configuration)
  - [Google Cloud Telemetry](#google-cloud-telemetry)
    - [前提条件](#prerequisites)
    - [ダイレクトエクスポート（推奨）](#direct-export-recommended)
    - [Collector ベースのエクスポート（高度な設定）](#collector-based-export-advanced)
  - [ローカルテレメトリ](#local-telemetry)
    - [ファイル出力（推奨）](#file-based-output-recommended)
    - [Collector ベースのエクスポート（高度な設定）](#collector-based-export-advanced-1)
  - [ログとメトリクス](#logs-and-metrics)
    - [ログ](#logs)
    - [メトリクス](#metrics)
```

## 主要なメリット

- **🔍 利用状況分析**: チーム全体でのインタラクションパターンや機能の採用状況を把握
- **⚡ パフォーマンス監視**: レスポンスタイム、トークン消費量、リソース利用状況を追跡
- **🐛 リアルタイムデバッグ**: ボトルネック、失敗、エラーパターンを発生時に即座に特定
- **📊 ワークフロー最適化**: 設定やプロセス改善のためのデータドリブンな意思決定を実現
- **🏢 エンタープライズガバナンス**: チーム横断での利用状況監視、コスト追跡、コンプライアンス確保、既存の監視インフラとの統合

## OpenTelemetry 連携

ベンダー中立の業界標準な可観測性フレームワークである **[OpenTelemetry]** を基盤として構築された、Qwen Code の可観測性システムは以下の機能を提供します：

- **ユニバーサル互換性**: 任意の OpenTelemetry バックエンド（Google Cloud、Jaeger、Prometheus、Datadog など）にエクスポート可能
- **標準化されたデータ形式**: ツールチェーン全体で一貫したフォーマットと収集方法を利用
- **将来を見据えた統合**: 既存および将来の可観測性インフラストラクチャとの接続に対応
- **ベンダーロックインフリー**: インスツルメンテーションコードの変更なしにバックエンドを切り替え可能

[OpenTelemetry]: https://opentelemetry.io/

## 設定

すべてのテレメトリ動作は、`.qwen/settings.json` ファイルで管理されます。  
これらの設定は、環境変数または CLI フラグによって上書きできます。

| 設定項目        | 環境変数                          | CLI フラグ                                                | 説明                                           | 値                 | デフォルト値             |
| -------------- | ---------------------------------- | --------------------------------------------------------- | ---------------------------------------------- | ------------------ | ----------------------- |
| `enabled`      | `GEMINI_TELEMETRY_ENABLED`         | `--telemetry` / `--no-telemetry`                          | テレメトリを有効／無効にする                   | `true`/`false`     | `false`                 |
| `target`       | `GEMINI_TELEMETRY_TARGET`          | `--telemetry-target <local\|gcp>`                         | テレメトリデータの送信先                       | `"gcp"`/`"local"`  | `"local"`               |
| `otlpEndpoint` | `GEMINI_TELEMETRY_OTLP_ENDPOINT`   | `--telemetry-otlp-endpoint <URL>`                         | OTLP コレクターのエンドポイント                | URL 文字列         | `http://localhost:4317` |
| `otlpProtocol` | `GEMINI_TELEMETRY_OTLP_PROTOCOL`   | `--telemetry-otlp-protocol <grpc\|http>`                  | OTLP の転送プロトコル                          | `"grpc"`/`"http"`  | `"grpc"`                |
| `outfile`      | `GEMINI_TELEMETRY_OUTFILE`         | `--telemetry-outfile <path>`                              | テレメトリをファイルに保存（`otlpEndpoint` より優先） | ファイルパス       | -                       |
| `logPrompts`   | `GEMINI_TELEMETRY_LOG_PROMPTS`     | `--telemetry-log-prompts` / `--no-telemetry-log-prompts`  | テレメトリログにプロンプトを含める             | `true`/`false`     | `true`                  |
| `useCollector` | `GEMINI_TELEMETRY_USE_COLLECTOR`   | -                                                         | 外部 OTLP コレクターを使用する（上級者向け）   | `true`/`false`     | `false`                 |

**ブール型環境変数について：**  
ブール型の設定（`enabled`、`logPrompts`、`useCollector`）では、対応する環境変数に `true` または `1` を設定すると機能が有効になります。それ以外の値では無効になります。

すべての設定オプションの詳細については、[設定ガイド](./cli/configuration.md)をご参照ください。

## Google Cloud Telemetry

### 前提条件

以下のいずれかの方法を使用する前に、次の手順を完了してください：

1. Google Cloud プロジェクト ID を設定します：
   - 推論とは別のプロジェクトでテレメトリを使用する場合：
     ```bash
     export OTLP_GOOGLE_CLOUD_PROJECT="your-telemetry-project-id"
     ```
   - 推論と同じプロジェクトでテレメトリを使用する場合：
     ```bash
     export GOOGLE_CLOUD_PROJECT="your-project-id"
     ```

2. Google Cloud で認証を行います：
   - ユーザーアカウントを使用する場合：
     ```bash
     gcloud auth application-default login
     ```
   - サービスアカウントを使用する場合：
     ```bash
     export GOOGLE_APPLICATION_CREDENTIALS="/path/to/your/service-account.json"
     ```
3. アカウントまたはサービスアカウントに以下の IAM ロールが付与されていることを確認してください：
   - Cloud Trace Agent
   - Monitoring Metric Writer
   - Logs Writer

4. 必要な Google Cloud API を有効にします（まだ有効になっていない場合）：
   ```bash
   gcloud services enable \
     cloudtrace.googleapis.com \
     monitoring.googleapis.com \
     logging.googleapis.com \
     --project="$OTLP_GOOGLE_CLOUD_PROJECT"
   ```

### ダイレクトエクスポート（推奨）

テレメトリをGoogle Cloudサービスに直接送信します。コレクターは不要です。

1. `.qwen/settings.json`でテレメトリを有効化：
   ```json
   {
     "telemetry": {
       "enabled": true,
       "target": "gcp"
     }
   }
   ```
2. Qwen Codeを実行してプロンプトを送信。
3. ログとメトリクスを確認：
   - プロンプト送信後にブラウザでGoogle Cloud Consoleを開く：
     - Logs: https://console.cloud.google.com/logs/
     - Metrics: https://console.cloud.google.com/monitoring/metrics-explorer
     - Traces: https://console.cloud.google.com/traces/list

### Collector を使ったエクスポート（上級者向け）

カスタム処理、フィルタリング、ルーティングを行うには、OpenTelemetry Collector を使って Google Cloud にデータを転送します。

1. `.qwen/settings.json` を設定します：
   ```json
   {
     "telemetry": {
       "enabled": true,
       "target": "gcp",
       "useCollector": true
     }
   }
   ```
2. 自動化スクリプトを実行します：
   ```bash
   npm run telemetry -- --target=gcp
   ```
   このコマンドは以下を行います：
   - Google Cloud へ転送するローカルの OTEL コレクターを起動
   - ワークスペースを設定
   - Google Cloud Console でトレース、メトリクス、ログを表示するためのリンクを提供
   - コレクターログを `~/.qwen/tmp/<projectHash>/otel/collector-gcp.log` に保存
   - 終了時にコレクターを停止（例：`Ctrl+C`）
3. Qwen Code を実行してプロンプトを送信します。
4. ログとメトリクスを確認します：
   - プロンプト送信後にブラウザで Google Cloud Console を開きます：
     - ログ: https://console.cloud.google.com/logs/
     - メトリクス: https://console.cloud.google.com/monitoring/metrics-explorer
     - トレース: https://console.cloud.google.com/traces/list
   - ローカルのコレクターログを見るには `~/.qwen/tmp/<projectHash>/otel/collector-gcp.log` を開きます。

## ローカルテレメトリ

ローカル開発およびデバッグ用に、テレメトリデータをローカルにキャプチャできます：

### ファイル出力（推奨）

1. `.qwen/settings.json` でテレメトリを有効化します：
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
3. 指定されたファイル（例：`.qwen/telemetry.log`）でログとメトリクスを確認します。

### Collector-Based Export (Advanced)

1. 自動化スクリプトを実行します：
   ```bash
   npm run telemetry -- --target=local
   ```
   このコマンドは以下を行います：
   - Jaeger と OTEL collector をダウンロードして起動
   - ローカルテレメトリ用にワークスペースを設定
   - Jaeger UI を http://localhost:16686 で提供
   - ログ/メトリクスを `~/.qwen/tmp/<projectHash>/otel/collector.log` に保存
   - 終了時に collector を停止（例：`Ctrl+C`）
2. Qwen Code を実行してプロンプトを送信します。
3. トレースは http://localhost:16686 で、ログ/メトリクスは collector log ファイルで確認できます。

## Logs and Metrics

以下のセクションでは、Qwen Code によって生成されるログとメトリクスの構造について説明します。

- すべてのログとメトリクスには、共通の属性として `sessionId` が含まれます。

### ログ

ログは、特定のイベントのタイムスタンプ付き記録です。Qwen Code では以下のイベントがログに記録されます：

- `qwen-code.config`: このイベントは起動時に CLI の設定とともに一度だけ発生します。
  - **属性**:
    - `model` (string)
    - `embedding_model` (string)
    - `sandbox_enabled` (boolean)
    - `core_tools_enabled` (string)
    - `approval_mode` (string)
    - `api_key_enabled` (boolean)
    - `vertex_ai_enabled` (boolean)
    - `code_assist_enabled` (boolean)
    - `log_prompts_enabled` (boolean)
    - `file_filtering_respect_git_ignore` (boolean)
    - `debug_mode` (boolean)
    - `mcp_servers` (string)
    - `output_format` (string: "text" または "json")

- `qwen-code.user_prompt`: このイベントはユーザーがプロンプトを送信したときに発生します。
  - **属性**:
    - `prompt_length` (int)
    - `prompt_id` (string)
    - `prompt` (string, この属性は `log_prompts_enabled` が `false` に設定されている場合は除外されます)
    - `auth_type` (string)

- `qwen-code.tool_call`: このイベントは各関数呼び出しに対して発生します。
  - **属性**:
    - `function_name`
    - `function_args`
    - `duration_ms`
    - `success` (boolean)
    - `decision` (string: "accept", "reject", "auto_accept", または "modify", 適用可能な場合)
    - `error` (適用可能な場合)
    - `error_type` (適用可能な場合)
    - `content_length` (int, 適用可能な場合)
    - `metadata` (適用可能な場合, string → any の辞書形式)

- `qwen-code.file_operation`: このイベントは各ファイル操作に対して発生します。
  - **属性**:
    - `tool_name` (string)
    - `operation` (string: "create", "read", "update")
    - `lines` (int, 適用可能な場合)
    - `mimetype` (string, 適用可能な場合)
    - `extension` (string, 適用可能な場合)
    - `programming_language` (string, 適用可能な場合)
    - `diff_stat` (JSON 文字列, 適用可能な場合): 以下のメンバーを持つ JSON 文字列：
      - `ai_added_lines` (int)
      - `ai_removed_lines` (int)
      - `user_added_lines` (int)
      - `user_removed_lines` (int)

- `qwen-code.api_request`: このイベントは Qwen API へのリクエストを行う際に発生します。
  - **属性**:
    - `model`
    - `request_text` (適用可能な場合)

- `qwen-code.api_error`: このイベントは API リクエストが失敗した場合に発生します。
  - **属性**:
    - `model`
    - `error`
    - `error_type`
    - `status_code`
    - `duration_ms`
    - `auth_type`

- `qwen-code.api_response`: このイベントは Qwen API からレスポンスを受け取った際に発生します。
  - **属性**:
    - `model`
    - `status_code`
    - `duration_ms`
    - `error` (任意)
    - `input_token_count`
    - `output_token_count`
    - `cached_content_token_count`
    - `thoughts_token_count`
    - `tool_token_count`
    - `response_text` (適用可能な場合)
    - `auth_type`

- `qwen-code.tool_output_truncated`: このイベントはツール呼び出しの出力が大きすぎて切り捨てられた場合に発生します。
  - **属性**:
    - `tool_name` (string)
    - `original_content_length` (int)
    - `truncated_content_length` (int)
    - `threshold` (int)
    - `lines` (int)
    - `prompt_id` (string)

- `qwen-code.malformed_json_response`: このイベントは Qwen API からの `generateJson` レスポンスが JSON としてパースできない場合に発生します。
  - **属性**:
    - `model`

- `qwen-code.flash_fallback`: このイベントは Qwen Code が Flash にフォールバックする際に発生します。
  - **属性**:
    - `auth_type`

- `qwen-code.slash_command`: このイベントはユーザーがスラッシュコマンドを実行したときに発生します。
  - **属性**:
    - `command` (string)
    - `subcommand` (string, 適用可能な場合)

- `qwen-code.extension_enable`: このイベントは拡張機能が有効化されたときに発生します。
- `qwen-code.extension_install`: このイベントは拡張機能がインストールされたときに発生します。
  - **属性**:
    - `extension_name` (string)
    - `extension_version` (string)
    - `extension_source` (string)
    - `status` (string)
- `qwen-code.extension_uninstall`: このイベントは拡張機能がアンインストールされたときに発生します。

### メトリクス

メトリクスとは、時間経過に伴う行動の数値的な測定値です。Qwen Code では以下のメトリクスが収集されます（互換性維持のため、メトリクス名は `qwen-code.*` のままです）：

- `qwen-code.session.count` (Counter, Int): CLI 起動時に1回インクリメントされます。

- `qwen-code.tool.call.count` (Counter, Int): ツール呼び出しの回数をカウントします。
  - **属性**:
    - `function_name`
    - `success` (boolean)
    - `decision` (string: "accept", "reject", または "modify"。該当する場合のみ)
    - `tool_type` (string: "mcp" または "native"。該当する場合のみ)

- `qwen-code.tool.call.latency` (Histogram, ms): ツール呼び出しのレイテンシを測定します。
  - **属性**:
    - `function_name`
    - `decision` (string: "accept", "reject", または "modify"。該当する場合のみ)

- `qwen-code.api.request.count` (Counter, Int): 全ての API リクエストの回数をカウントします。
  - **属性**:
    - `model`
    - `status_code`
    - `error_type` (該当する場合のみ)

- `qwen-code.api.request.latency` (Histogram, ms): API リクエストのレイテンシを測定します。
  - **属性**:
    - `model`

- `qwen-code.token.usage` (Counter, Int): 使用されたトークン数をカウントします。
  - **属性**:
    - `model`
    - `type` (string: "input", "output", "thought", "cache", または "tool")

- `qwen-code.file.operation.count` (Counter, Int): ファイル操作の回数をカウントします。
  - **属性**:
    - `operation` (string: "create", "read", "update"): ファイル操作の種類。
    - `lines` (Int, 該当する場合のみ): ファイル内の行数。
    - `mimetype` (string, 該当する場合のみ): ファイルの mimetype。
    - `extension` (string, 該当する場合のみ): ファイルの拡張子。
    - `model_added_lines` (Int, 該当する場合のみ): モデルによって追加・変更された行数。
    - `model_removed_lines` (Int, 該当する場合のみ): モデルによって削除・変更された行数。
    - `user_added_lines` (Int, 該当する場合のみ): AI 提案の変更でユーザーが追加・変更した行数。
    - `user_removed_lines` (Int, 該当する場合のみ): AI 提案の変更でユーザーが削除・変更した行数。
    - `programming_language` (string, 該当する場合のみ): ファイルのプログラミング言語。

- `qwen-code.chat_compression` (Counter, Int): チャット圧縮操作の回数をカウントします。
  - **属性**:
    - `tokens_before`: (Int): 圧縮前のコンテキスト内のトークン数。
    - `tokens_after`: (Int): 圧縮後のコンテキスト内のトークン数。