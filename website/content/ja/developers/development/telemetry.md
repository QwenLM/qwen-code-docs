# OpenTelemetry によるオブザーバビリティ

Qwen Code で OpenTelemetry を有効化および設定する方法を学びます。

- [OpenTelemetry によるオブザーバビリティ](#observability-with-opentelemetry)
  - [主な利点](#key-benefits)
  - [OpenTelemetry 統合](#opentelemetry-integration)
  - [設定](#configuration)
  - [Aliyun Telemetry](#aliyun-telemetry)
    - [前提条件](#prerequisites)
    - [直接エクスポート（推奨）](#direct-export-recommended)
  - [ローカル Telemetry](#local-telemetry)
    - [ファイルベースの出力（推奨）](#file-based-output-recommended)
    - [コレクターベースのエクスポート（上級者向け）](#collector-based-export-advanced)
  - [ログとメトリクス](#logs-and-metrics)
    - [ログ](#logs)
    - [メトリクス](#metrics)

## 主な利点

- **🔍 利用状況分析**: チーム全体のインタラクションパターンや機能の採用状況を把握
- **⚡ パフォーマンスモニタリング**: 応答時間、トークン消費量、リソース使用率を追跡
- **🐛 リアルタイムデバッグ**: 発生したボトルネック、障害、エラーパターンを特定
- **📊 ワークフローの最適化**: 設定やプロセスを改善するためのデータに基づく意思決定
- **🏢 エンタープライズガバナンス**: チーム間の利用状況を監視し、コストを追跡、コンプライアンスを確保し、既存のモニタリングインフラと統合

## OpenTelemetry 統合

ベンダーニュートラルで業界標準のオブザーバビリティフレームワークである **[OpenTelemetry]** を基盤とし、Qwen Code のオブザーバビリティシステムは以下を提供します：

- **ユニバーサルな互換性**: 任意の OpenTelemetry バックエンド（Aliyun、Jaeger、Prometheus、Datadog など）にエクスポート可能
- **標準化されたデータ**: ツールチェーン全体で一貫したフォーマットと収集方法を使用
- **将来を見据えた統合**: 既存および将来のオブザーバビリティインフラと接続
- **ベンダーロックインの回避**: インストルメンテーションを変更せずにバックエンドを切り替え可能

[OpenTelemetry]: https://opentelemetry.io/

## 設定

> [!note]
>
> **⚠️ 特記事項: この機能には対応するコード変更が必要です。本ドキュメントは事前に提供されています。実際の機能については、今後のコードアップデートを参照してください。**

すべての telemetry 動作は `.qwen/settings.json` ファイルを通じて制御されます。
これらの設定は、環境変数または CLI フラグで上書きできます。

| 設定        | 環境変数           | CLI フラグ                                                 | 説明                                       | 値             | デフォルト                 |
| -------------- | ------------------------------ | -------------------------------------------------------- | ------------------------------------------------- | ------------------ | ----------------------- |
| `enabled`      | `QWEN_TELEMETRY_ENABLED`       | `--telemetry` / `--no-telemetry`                         | telemetry を有効化または無効化                       | `true`/`false`     | `false`                 |
| `target`       | `QWEN_TELEMETRY_TARGET`        | `--telemetry-target <local\|qwen>`                       | telemetry データの送信先                      | `"qwen"`/`"local"` | `"local"`               |
| `otlpEndpoint` | `QWEN_TELEMETRY_OTLP_ENDPOINT` | `--telemetry-otlp-endpoint <URL>`                        | OTLP コレクターのエンドポイント                           | URL 文字列         | `http://localhost:4317` |
| `otlpProtocol` | `QWEN_TELEMETRY_OTLP_PROTOCOL` | `--telemetry-otlp-protocol <grpc\|http>`                 | OTLP トランスポートプロトコル                           | `"grpc"`/`"http"`  | `"grpc"`                |
| `outfile`      | `QWEN_TELEMETRY_OUTFILE`       | `--telemetry-outfile <path>`                             | telemetry をファイルに保存（`otlpEndpoint` を上書き） | ファイルパス          | -                       |
| `logPrompts`   | `QWEN_TELEMETRY_LOG_PROMPTS`   | `--telemetry-log-prompts` / `--no-telemetry-log-prompts` | telemetry ログにプロンプトを含める                 | `true`/`false`     | `true`                  |
| `useCollector` | `QWEN_TELEMETRY_USE_COLLECTOR` | -                                                        | 外部 OTLP コレクターを使用（上級者向け）            | `true`/`false`     | `false`                 |

**ブール型環境変数に関する注意:** ブール型設定（`enabled`、`logPrompts`、`useCollector`）の場合、対応する環境変数を `true` または `1` に設定すると機能が有効になります。それ以外の値は無効になります。

すべての設定オプションの詳細については、[設定ガイド](./cli/configuration.md) を参照してください。

## Aliyun Telemetry

### 直接エクスポート（推奨）

telemetry を Aliyun サービスに直接送信します。コレクターは不要です。

1. `.qwen/settings.json` で telemetry を有効化します：
   ```json
   {
     "telemetry": {
       "enabled": true,
       "target": "qwen"
     }
   }
   ```
2. Qwen Code を実行し、プロンプトを送信します。
3. Aliyun コンソールでログとメトリクスを確認します。

## ローカル Telemetry

ローカル開発およびデバッグ用に、telemetry データをローカルでキャプチャできます：

### ファイルベースの出力（推奨）

1. `.qwen/settings.json` で telemetry を有効化します：
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

### コレクターベースのエクスポート（上級者向け）

1. 自動化スクリプトを実行します：
   ```bash
   npm run telemetry -- --target=local
   ```
   これにより以下が実行されます：
   - Jaeger と OTEL コレクターをダウンロードして起動
   - ローカル telemetry 用にワークスペースを設定
   - http://localhost:16686 で Jaeger UI を提供
   - ログ/メトリクスを `~/.qwen/tmp/<projectHash>/otel/collector.log` に保存
   - 終了時にコレクターを停止（例：`Ctrl+C`）
2. Qwen Code を実行し、プロンプトを送信します。
3. http://localhost:16686 でトレースを確認し、コレクターのログファイルでログ/メトリクスを確認します。

## ログとメトリクス

以下のセクションでは、Qwen Code によって生成されるログとメトリクスの構造について説明します。

- `sessionId` がすべてのログとメトリクスに共通属性として含まれます。

### ログ

ログは特定のイベントのタイムスタンプ付きレコードです。Qwen Code では以下のイベントがログに記録されます：

- `qwen-code.config`: このイベントは、CLI の設定とともに起動時に 1 回発生します。
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

- `qwen-code.user_prompt`: このイベントは、ユーザーがプロンプトを送信したときに発生します。
  - **属性**:
    - `prompt_length` (int)
    - `prompt_id` (string)
    - `prompt` (string, `log_prompts_enabled` が `false` に設定されている場合は除外されます)
    - `auth_type` (string)

- `qwen-code.tool_call`: このイベントは、各関数呼び出しに対して発生します。
  - **属性**:
    - `function_name`
    - `function_args`
    - `duration_ms`
    - `success` (boolean)
    - `decision` (string: "accept", "reject", "auto_accept", または "modify"。該当する場合)
    - `error` (該当する場合)
    - `error_type` (該当する場合)
    - `content_length` (int, 該当する場合)
    - `metadata` (該当する場合, string -> any の辞書)

- `qwen-code.file_operation`: このイベントは、各ファイル操作に対して発生します。
  - **属性**:
    - `tool_name` (string)
    - `operation` (string: "create", "read", "update")
    - `lines` (int, 該当する場合)
    - `mimetype` (string, 該当する場合)
    - `extension` (string, 該当する場合)
    - `programming_language` (string, 該当する場合)
    - `diff_stat` (json string, 該当する場合): 以下のメンバーを含む JSON 文字列：
      - `ai_added_lines` (int)
      - `ai_removed_lines` (int)
      - `user_added_lines` (int)
      - `user_removed_lines` (int)

- `qwen-code.api_request`: このイベントは、Qwen API へのリクエスト時に発生します。
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

- `qwen-code.api_response`: このイベントは、Qwen API からのレスポンス受信時に発生します。
  - **属性**:
    - `model`
    - `status_code`
    - `duration_ms`
    - `error` (オプション)
    - `input_token_count`
    - `output_token_count`
    - `cached_content_token_count`
    - `thoughts_token_count`
    - `tool_token_count`
    - `response_text` (該当する場合)
    - `auth_type`

- `qwen-code.tool_output_truncated`: このイベントは、ツール呼び出しの出力が大きすぎて切り捨てられた場合に発生します。
  - **属性**:
    - `tool_name` (string)
    - `original_content_length` (int)
    - `truncated_content_length` (int)
    - `threshold` (int)
    - `lines` (int)
    - `prompt_id` (string)

- `qwen-code.malformed_json_response`: このイベントは、Qwen API からの `generateJson` レスポンスが JSON として解析できない場合に発生します。
  - **属性**:
    - `model`

- `qwen-code.flash_fallback`: このイベントは、Qwen Code がフォールバックとして flash に切り替えた場合に発生します。
  - **属性**:
    - `auth_type`

- `qwen-code.slash_command`: このイベントは、ユーザーがスラッシュコマンドを実行したときに発生します。
  - **属性**:
    - `command` (string)
    - `subcommand` (string, 該当する場合)

- `qwen-code.extension_enable`: このイベントは、拡張機能が有効化されたときに発生します
- `qwen-code.extension_install`: このイベントは、拡張機能がインストールされたときに発生します
  - **属性**:
    - `extension_name` (string)
    - `extension_version` (string)
    - `extension_source` (string)
    - `status` (string)
- `qwen-code.extension_uninstall`: このイベントは、拡張機能がアンインストールされたときに発生します

### メトリクス

メトリクスは、時間経過に伴う動作の数値測定値です。Qwen Code では以下のメトリクスが収集されます（互換性のためメトリクス名は `qwen-code.*` のままです）：

- `qwen-code.session.count` (Counter, Int): CLI 起動ごとに 1 回インクリメントされます。

- `qwen-code.tool.call.count` (Counter, Int): ツール呼び出しをカウントします。
  - **属性**:
    - `function_name`
    - `success` (boolean)
    - `decision` (string: "accept", "reject", または "modify"。該当する場合)
    - `tool_type` (string: "mcp" または "native"。該当する場合)

- `qwen-code.tool.call.latency` (Histogram, ms): ツール呼び出しのレイテンシを測定します。
  - **属性**:
    - `function_name`
    - `decision` (string: "accept", "reject", または "modify"。該当する場合)

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
    - `type` (string: "input", "output", "thought", "cache", または "tool")

- `qwen-code.file.operation.count` (Counter, Int): ファイル操作をカウントします。
  - **属性**:
    - `operation` (string: "create", "read", "update"): ファイル操作の種類。
    - `lines` (Int, 該当する場合): ファイル内の行数。
    - `mimetype` (string, 該当する場合): ファイルの MIME タイプ。
    - `extension` (string, 該当する場合): ファイルの拡張子。
    - `model_added_lines` (Int, 該当する場合): モデルによって追加/変更された行数。
    - `model_removed_lines` (Int, 該当する場合): モデルによって削除/変更された行数。
    - `user_added_lines` (Int, 該当する場合): AI が提案した変更に対してユーザーが追加/変更した行数。
    - `user_removed_lines` (Int, 該当する場合): AI が提案した変更に対してユーザーが削除/変更した行数。
    - `programming_language` (string, 該当する場合): ファイルのプログラミング言語。

- `qwen-code.chat_compression` (Counter, Int): チャット圧縮操作をカウントします
  - **属性**:
    - `tokens_before`: (Int): 圧縮前のコンテキスト内のトークン数
    - `tokens_after`: (Int): 圧縮後のコンテキスト内のトークン数