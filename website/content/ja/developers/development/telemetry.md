# OpenTelemetry による観測性

Qwen Code で OpenTelemetry を有効化およびセットアップする方法について学びます。

- [OpenTelemetry による観測性](#observability-with-opentelemetry)
  - [主な利点](#key-benefits)
  - [OpenTelemetry 統合](#opentelemetry-integration)
  - [設定](#configuration)
  - [Aliyun テレメトリ](#aliyun-telemetry)
    - [前提条件](#prerequisites)
    - [直接エクスポート（推奨）](#direct-export-recommended)
  - [ローカルテレメトリ](#local-telemetry)
    - [ファイルベースの出力（推奨）](#file-based-output-recommended)
    - [コレクターベースのエクスポート（高度）](#collector-based-export-advanced)
  - [ログとメトリクス](#logs-and-metrics)
    - [ログ](#logs)
    - [メトリクス](#metrics)

## 主な利点

- **🔍 利用状況分析**: チーム全体でのインタラクションパターンや機能の採用状況を把握
- **⚡ パフォーマンス監視**: レスポンスタイム、トークン消費量、リソース使用率を追跡
- **🐛 リアルタイムデバッグ**: ボトルネック、障害、エラーパターンを発生時に特定
- **📊 ワークフロー最適化**: 設定とプロセス改善のための情報に基づいた意思決定
- **🏢 エンタープライズガバナンス**: チーム間の利用状況監視、コスト追跡、コンプライアンス確保、既存の監視インフラとの統合

## OpenTelemetry 連携

ベンダー中立で業界標準の可観測性フレームワークである **[OpenTelemetry]** を基盤として構築された、Qwen Code の可観測性システムは以下を提供します：

- **普遍的な互換性**：任意の OpenTelemetry バックエンド（Aliyun、Jaeger、Prometheus、Datadog など）にエクスポート可能
- **標準化されたデータ**：ツールチェーン全体で一貫した形式と収集方法を使用
- **将来を見据えた統合**：既存および将来の可観測性インフラストラクチャとの接続
- **ベンダーロックインなし**：計装コードを変更することなくバックエンドを切り替え可能

[OpenTelemetry]: https://opentelemetry.io/

## 設定

> [!note]
>
> **⚠️ 特記事項：この機能には対応するコード変更が必要です。このドキュメントは事前に提供されており、実際の機能については今後のコード更新を参照してください。**

すべてのテレメトリ動作は、`.qwen/settings.json` ファイルを通じて制御されます。
これらの設定は、環境変数または CLI フラグによって上書きできます。

| 設定項目        | 環境変数                        | CLI フラグ                                                | 説明                                           | 値                  | デフォルト値              |
| -------------- | ------------------------------ | -------------------------------------------------------- | --------------------------------------------- | ------------------- | ----------------------- |
| `enabled`      | `QWEN_TELEMETRY_ENABLED`       | `--telemetry` / `--no-telemetry`                         | テレメトリを有効または無効にする                | `true`/`false`     | `false`                 |
| `target`       | `QWEN_TELEMETRY_TARGET`        | `--telemetry-target <local\|qwen>`                       | テレメトリデータの送信先                        | `"qwen"`/`"local"` | `"local"`               |
| `otlpEndpoint` | `QWEN_TELEMETRY_OTLP_ENDPOINT` | `--telemetry-otlp-endpoint <URL>`                        | OTLP コレクターエンドポイント                   | URL 文字列          | `http://localhost:4317` |
| `otlpProtocol` | `QWEN_TELEMETRY_OTLP_PROTOCOL` | `--telemetry-otlp-protocol <grpc\|http>`                 | OTLP トランスポートプロトコル                   | `"grpc"`/`"http"`  | `"grpc"`                |
| `outfile`      | `QWEN_TELEMETRY_OUTFILE`       | `--telemetry-outfile <path>`                             | テレメトリをファイルに保存（`otlpEndpoint` を上書き） | ファイルパス           | -                       |
| `logPrompts`   | `QWEN_TELEMETRY_LOG_PROMPTS`   | `--telemetry-log-prompts` / `--no-telemetry-log-prompts` | テレメトリログにプロンプトを含める               | `true`/`false`     | `true`                  |
| `useCollector` | `QWEN_TELEMETRY_USE_COLLECTOR` | -                                                        | 外部 OTLP コレクターを使用（高度な設定）         | `true`/`false`     | `false`                 |

**ブール型環境変数に関する注意：** ブール型の設定（`enabled`、`logPrompts`、`useCollector`）では、対応する環境変数を `true` または `1` に設定することで機能が有効になります。それ以外の値では無効になります。

すべての設定オプションの詳細については、[設定ガイド](./cli/configuration.md)を参照してください。

## Aliyun テレメトリ

### 直接エクスポート（推奨）

テレメトリをAliyunサービスに直接送信します。コレクターは不要です。

1. `.qwen/settings.json`でテレメトリを有効化：
   ```json
   {
     "telemetry": {
       "enabled": true,
       "target": "qwen"
     }
   }
   ```
2. Qwen Codeを実行し、プロンプトを送信。
3. Aliyunコンソールでログとメトリクスを確認。

## ローカルテレメトリ

ローカル開発およびデバッグ用に、テレメトリデータをローカルにキャプチャできます：

### ファイルベースの出力（推奨）

1. `.qwen/settings.json`でテレメトリを有効化：
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
2. Qwen Codeを実行し、プロンプトを送信。
3. 指定されたファイル（例：`.qwen/telemetry.log`）でログとメトリクスを確認。

### コレクターベースのエクスポート（上級者向け）

1. 自動化スクリプトを実行します：
   ```bash
   npm run telemetry -- --target=local
   ```
   これにより以下の処理が行われます：
   - Jaeger と OTEL コレクターをダウンロードして起動
   - ローカルテレメトリ用にワークスペースを設定
   - http://localhost:16686 で Jaeger UI を提供
   - ログ・メトリクスを `~/.qwen/tmp/<projectHash>/otel/collector.log` に保存
   - 終了時にコレクターを停止（例：`Ctrl+C`）
2. Qwen Code を実行し、プロンプトを送信します。
3. http://localhost:16686 でトレースを確認し、コレクターログファイルでログ・メトリクスを参照します。

## ログとメトリクス

以下のセクションでは、Qwen Code によって生成されるログとメトリクスの構造について説明します。

- `sessionId` は、すべてのログとメトリクスに共通の属性として含まれます。

### ログ

ログは特定のイベントのタイムスタンプ付き記録です。Qwen Code では以下のイベントがログに記録されます：

- `qwen-code.config`：このイベントは起動時に CLI の設定とともに一度だけ発生します。
  - **属性**：
    - `model`（文字列）
    - `embedding_model`（文字列）
    - `sandbox_enabled`（真偽値）
    - `core_tools_enabled`（文字列）
    - `approval_mode`（文字列）
    - `api_key_enabled`（真偽値）
    - `vertex_ai_enabled`（真偽値）
    - `code_assist_enabled`（真偽値）
    - `log_prompts_enabled`（真偽値）
    - `file_filtering_respect_git_ignore`（真偽値）
    - `debug_mode`（真偽値）
    - `mcp_servers`（文字列）
    - `output_format`（文字列："text" または "json"）

- `qwen-code.user_prompt`：このイベントはユーザーがプロンプトを送信したときに発生します。
  - **属性**：
    - `prompt_length`（整数）
    - `prompt_id`（文字列）
    - `prompt`（文字列、この属性は `log_prompts_enabled` が `false` に設定されている場合は除外されます）
    - `auth_type`（文字列）

- `qwen-code.tool_call`：このイベントは各関数呼び出しで発生します。
  - **属性**：
    - `function_name`
    - `function_args`
    - `duration_ms`
    - `success`（真偽値）
    - `decision`（文字列："accept"、"reject"、"auto_accept"、または "modify"、該当する場合）
    - `error`（該当する場合）
    - `error_type`（該当する場合）
    - `content_length`（整数、該当する場合）
    - `metadata`（該当する場合、文字列→任意の型の辞書）

- `qwen-code.file_operation`：このイベントは各ファイル操作で発生します。
  - **属性**：
    - `tool_name`（文字列）
    - `operation`（文字列："create"、"read"、"update"）
    - `lines`（整数、該当する場合）
    - `mimetype`（文字列、該当する場合）
    - `extension`（文字列、該当する場合）
    - `programming_language`（文字列、該当する場合）
    - `diff_stat`（JSON 文字列、該当する場合）：以下のメンバーを持つ JSON 文字列：
      - `ai_added_lines`（整数）
      - `ai_removed_lines`（整数）
      - `user_added_lines`（整数）
      - `user_removed_lines`（整数）

- `qwen-code.api_request`：このイベントは Qwen API へのリクエスト時に発生します。
  - **属性**：
    - `model`
    - `request_text`（該当する場合）

- `qwen-code.api_error`：このイベントは API リクエストが失敗した場合に発生します。
  - **属性**：
    - `model`
    - `error`
    - `error_type`
    - `status_code`
    - `duration_ms`
    - `auth_type`

- `qwen-code.api_response`：このイベントは Qwen API からのレスポンス受信時に発生します。
  - **属性**：
    - `model`
    - `status_code`
    - `duration_ms`
    - `error`（オプション）
    - `input_token_count`
    - `output_token_count`
    - `cached_content_token_count`
    - `thoughts_token_count`
    - `tool_token_count`
    - `response_text`（該当する場合）
    - `auth_type`

- `qwen-code.tool_output_truncated`：このイベントはツール呼び出しの出力が大きすぎて切り捨てられた場合に発生します。
  - **属性**：
    - `tool_name`（文字列）
    - `original_content_length`（整数）
    - `truncated_content_length`（整数）
    - `threshold`（整数）
    - `lines`（整数）
    - `prompt_id`（文字列）

- `qwen-code.malformed_json_response`：このイベントは Qwen API からの `generateJson` レスポンスが JSON として解析できない場合に発生します。
  - **属性**：
    - `model`

- `qwen-code.flash_fallback`：このイベントは Qwen Code がフォールバックとしてフラッシュに切り替えた場合に発生します。
  - **属性**：
    - `auth_type`

- `qwen-code.slash_command`：このイベントはユーザーがスラッシュコマンドを実行したときに発生します。
  - **属性**：
    - `command`（文字列）
    - `subcommand`（文字列、該当する場合）

- `qwen-code.extension_enable`：このイベントは拡張機能が有効化されたときに発生します。
- `qwen-code.extension_install`：このイベントは拡張機能がインストールされたときに発生します。
  - **属性**：
    - `extension_name`（文字列）
    - `extension_version`（文字列）
    - `extension_source`（文字列）
    - `status`（文字列）
- `qwen-code.extension_uninstall`：このイベントは拡張機能がアンインストールされたときに発生します。

### メトリクス

メトリクスとは、時間経過に伴う行動の数値的な測定値です。Qwen Code では以下のメトリクスが収集されます（互換性のため、メトリクス名は `qwen-code.*` のままです）。

- `qwen-code.session.count`（カウンター、整数）：CLI起動ごとに1ずつ増加します。

- `qwen-code.tool.call.count`（カウンター、整数）：ツール呼び出しの回数をカウントします。
  - **属性**：
    - `function_name`
    - `success`（真偽値）
    - `decision`（文字列："accept"、"reject"、または "modify"。該当する場合）
    - `tool_type`（文字列："mcp"、または "native"。該当する場合）

- `qwen-code.tool.call.latency`（ヒストグラム、ミリ秒）：ツール呼び出しのレイテンシを測定します。
  - **属性**：
    - `function_name`
    - `decision`（文字列："accept"、"reject"、または "modify"。該当する場合）

- `qwen-code.api.request.count`（カウンター、整数）：すべてのAPIリクエストの回数をカウントします。
  - **属性**：
    - `model`
    - `status_code`
    - `error_type`（該当する場合）

- `qwen-code.api.request.latency`（ヒストグラム、ミリ秒）：APIリクエストのレイテンシを測定します。
  - **属性**：
    - `model`

- `qwen-code.token.usage`（カウンター、整数）：使用されたトークン数をカウントします。
  - **属性**：
    - `model`
    - `type`（文字列："input"、"output"、"thought"、"cache"、または "tool"）

- `qwen-code.file.operation.count`（カウンター、整数）：ファイル操作の回数をカウントします。
  - **属性**：
    - `operation`（文字列："create"、"read"、"update"）：ファイル操作の種類。
    - `lines`（整数、該当する場合）：ファイル内の行数。
    - `mimetype`（文字列、該当する場合）：ファイルのMIMEタイプ。
    - `extension`（文字列、該当する場合）：ファイルの拡張子。
    - `model_added_lines`（整数、該当する場合）：モデルによって追加・変更された行数。
    - `model_removed_lines`（整数、該当する場合）：モデルによって削除・変更された行数。
    - `user_added_lines`（整数、該当する場合）：ユーザーがAI提案の変更で追加・変更した行数。
    - `user_removed_lines`（整数、該当する場合）：ユーザーがAI提案の変更で削除・変更した行数。
    - `programming_language`（文字列、該当する場合）：ファイルのプログラミング言語。

- `qwen-code.chat_compression`（カウンター、整数）：チャット圧縮操作の回数をカウントします。
  - **属性**：
    - `tokens_before`（整数）：圧縮前のコンテキスト内のトークン数。
    - `tokens_after`（整数）：圧縮後のコンテキスト内のトークン数。