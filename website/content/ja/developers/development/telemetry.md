# OpenTelemetry を使った観測性

Qwen Code で OpenTelemetry を有効化および設定する方法を学びます。

- [OpenTelemetry を使った観測性](#opentelemetry-を使った観測性)
  - [主なメリット](#主なメリット)
  - [OpenTelemetry の統合](#opentelemetry-の統合)
  - [設定](#設定)
  - [Alibaba Cloud Telemetry](#alibaba-cloud-telemetry)
    - [前提条件](#前提条件)
    - [直接エクスポート（推奨）](#直接エクスポート推奨)
  - [ローカル Telemetry](#ローカル-telemetry)
    - [ファイル出力（推奨）](#ファイル出力推奨)
    - [Collector を使ったエクスポート（上級者向け）](#collector-を使ったエクスポート上級者向け)
  - [ログとメトリクス](#ログとメトリクス)
    - [ログ](#ログ)
    - [メトリクス](#メトリクス)

## 主なメリット

- **🔍 使用状況分析**: チーム全体におけるユーザーの操作パターンや機能の採用状況を把握
- **⚡ パフォーマンス監視**: 応答時間、トークン消費量、リソース使用率を追跡
- **🐛 リアルタイムデバッグ**: ボトルネック、障害、エラーの傾向を発生時に即座に特定
- **📊 ワークフロー最適化**: 設定やプロセスの改善に役立つ、根拠に基づいた意思決定を実現
- **🏢 エンタープライズガバナンス**: チーム単位での利用状況の監視、コストの追跡、コンプライアンスの確保、および既存のモニタリング基盤との統合

## OpenTelemetry 統合

業界標準のベンダー非依存型観測性フレームワークである **[OpenTelemetry]** を基盤として構築された Qwen Code の観測性システムは、以下の機能を提供します。

- **普遍的な互換性**: 任意の OpenTelemetry バックエンド（Alibaba Cloud、Jaeger、Prometheus、Datadog など）へエクスポート可能
- **標準化されたデータ**: ツールチェーン全体で一貫したフォーマットと収集方法を採用
- **将来にわたって有効な統合**: 既存および将来登場する観測性インフラストラクチャとの接続が可能
- **ベンダーへの依存なし**: インストルメンテーションを変更することなく、バックエンド間の切り替えが可能

[OpenTelemetry]: https://opentelemetry.io/

## 設定

> [!note]
>
> **⚠️ 特記事項：この機能には対応するコード変更が必要です。本ドキュメントは事前に提供されています。実際の機能については、今後のコード更新を参照してください。**

すべてのテレメトリ動作は、`.qwen/settings.json` ファイルで制御されます。  
これらの設定は、環境変数または CLI フラグによって上書きできます。

| 設定名             | 環境変数                             | CLI フラグ                                                      | 説明                                                     | 値                    | デフォルト値            |
| ------------------ | ------------------------------------ | --------------------------------------------------------------- | -------------------------------------------------------- | --------------------- | ----------------------- |
| `enabled`          | `QWEN_TELEMETRY_ENABLED`             | `--telemetry` / `--no-telemetry`                                | テレメトリの有効化／無効化                               | `true`/`false`        | `false`                 |
| `target`           | `QWEN_TELEMETRY_TARGET`              | `--telemetry-target <local\|qwen>`                            | テレメトリデータの送信先                                 | `"qwen"`/`"local"`    | `"local"`               |
| `otlpEndpoint`     | `QWEN_TELEMETRY_OTLP_ENDPOINT`       | `--telemetry-otlp-endpoint <URL>`                              | OTLP コレクターのエンドポイント                          | URL 文字列            | `http://localhost:4317` |
| `otlpProtocol`     | `QWEN_TELEMETRY_OTLP_PROTOCOL`       | `--telemetry-otlp-protocol <grpc\|http>`                      | OTLP 通信プロトコル                                      | `"grpc"`/`"http"`     | `"grpc"`                |
| `outfile`          | `QWEN_TELEMETRY_OUTFILE`             | `--telemetry-outfile <path>`                                  | テレメトリをファイルに保存（`otlpEndpoint` を上書き）    | ファイルパス          | -                       |
| `logPrompts`       | `QWEN_TELEMETRY_LOG_PROMPTS`         | `--telemetry-log-prompts` / `--no-telemetry-log-prompts`      | テレメトリログにプロンプトを含める                       | `true`/`false`        | `true`                  |
| `useCollector`     | `QWEN_TELEMETRY_USE_COLLECTOR`       | -                                                             | 外部 OTLP コレクターを使用（高度な設定）                 | `true`/`false`        | `false`                 |

**ブール型環境変数に関する注意点：** ブール型の設定項目（`enabled`、`logPrompts`、`useCollector`）について、対応する環境変数を `true` または `1` に設定すると、その機能が有効になります。それ以外の値は無効とみなされます。

すべての設定オプションに関する詳細情報は、[設定ガイド](./cli/configuration.md) を参照してください。

## アリババ・クラウド テレメトリ

### 直接エクスポート（推奨）

テレメトリデータをアリババ・クラウドのサービスに直接送信します。コレクターは不要です。

1. `.qwen/settings.json` でテレメトリを有効化します：
   ```json
   {
     "telemetry": {
       "enabled": true,
       "target": "qwen"
     }
   }
   ```
2. Qwen Code を実行し、プロンプトを送信します。
3. アリババ・クラウドコンソールでログおよびメトリクスを確認します。

## ローカルテレメトリ

ローカル開発およびデバッグ用に、テレメトリデータをローカルで収集できます。

### ファイル出力方式（推奨）

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
3. 指定されたファイル（例：`.qwen/telemetry.log`）でログおよびメトリクスを確認します。

### コレクターに基づくエクスポート（高度な設定）

1. 自動化スクリプトを実行します：
   ```bash
   npm run telemetry -- --target=local
   ```
   これにより、以下の処理が行われます：
   - Jaeger および OpenTelemetry（OTEL）コレクターのダウンロードと起動
   - ワークスペースをローカルテレメトリ用に設定
   - Jaeger UI を `http://localhost:16686` で提供
   - ログおよびメトリクスを `~/.qwen/tmp/<projectHash>/otel/collector.log` に保存
   - 終了時（例：`Ctrl+C`）にコレクターを停止

2. Qwen Code を実行し、プロンプトを送信します。

3. トレースは `http://localhost:16686` で確認でき、ログおよびメトリクスはコレクターのログファイルで確認できます。

## ログおよびメトリクス

以下では、Qwen Code によって生成されるログおよびメトリクスの構造について説明します。

- すべてのログおよびメトリクスには、共通属性として `sessionId` が含まれます。

### ログ

ログは、特定のイベントをタイムスタンプ付きで記録したものです。Qwen Code では、以下のイベントがログに記録されます。

- `qwen-code.config`: CLI の設定を起動時に 1 回記録します。
  - **属性**:
    - `model`（文字列）
    - `sandbox_enabled`（ブール値）
    - `core_tools_enabled`（文字列）
    - `approval_mode`（文字列）
    - `file_filtering_respect_git_ignore`（ブール値）
    - `debug_mode`（ブール値）
    - `truncate_tool_output_threshold`（数値）
    - `truncate_tool_output_lines`（数値）
    - `hooks`（文字列：カンマ区切りのフックイベントタイプ。フックが無効な場合は省略）
    - `ide_enabled`（ブール値）
    - `interactive_shell_enabled`（ブール値）
    - `mcp_servers`（文字列）
    - `output_format`（文字列："text" または "json"）

- `qwen-code.user_prompt`: ユーザーがプロンプトを送信したときに記録されます。
  - **属性**:
    - `prompt_length`（整数）
    - `prompt_id`（文字列）
    - `prompt`（文字列：ただし `log_prompts_enabled` が `false` に設定されている場合はこの属性は除外されます）
    - `auth_type`（文字列）

- `qwen-code.tool_call`: 各関数呼び出しに対して記録されます。
  - **属性**:
    - `function_name`
    - `function_args`
    - `duration_ms`
    - `success`（ブール値）
    - `decision`（文字列："accept"、"reject"、"auto_accept"、または "modify"。該当する場合）
    - `error`（該当する場合）
    - `error_type`（該当する場合）
    - `content_length`（整数：該当する場合）
    - `metadata`（該当する場合：文字列 → 任意の型の辞書）

- `qwen-code.file_operation`: 各ファイル操作に対して記録されます。
  - **属性**:
    - `tool_name`（文字列）
    - `operation`（文字列："create"、"read"、"update"）
    - `lines`（整数：該当する場合）
    - `mimetype`（文字列：該当する場合）
    - `extension`（文字列：該当する場合）
    - `programming_language`（文字列：該当する場合）
    - `diff_stat`（JSON 文字列：該当する場合）：以下のメンバを持つ JSON 文字列
      - `ai_added_lines`（整数）
      - `ai_removed_lines`（整数）
      - `user_added_lines`（整数）
      - `user_removed_lines`（整数）

- `qwen-code.api_request`: Qwen API へのリクエスト送信時に記録されます。
  - **属性**:
    - `model`
    - `request_text`（該当する場合）

- `qwen-code.api_error`: API リクエストが失敗した場合に記録されます。
  - **属性**:
    - `model`
    - `error`
    - `error_type`
    - `status_code`
    - `duration_ms`
    - `auth_type`

- `qwen-code.api_response`: Qwen API からの応答受信時に記録されます。
  - **属性**:
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

- `qwen-code.tool_output_truncated`: ツール呼び出しの出力が大きすぎて切り捨てられた場合に記録されます。
  - **属性**:
    - `tool_name`（文字列）
    - `original_content_length`（整数）
    - `truncated_content_length`（整数）
    - `threshold`（整数）
    - `lines`（整数）
    - `prompt_id`（文字列）

- `qwen-code.malformed_json_response`: Qwen API からの `generateJson` 応答が JSON として解析できない場合に記録されます。
  - **属性**:
    - `model`

- `qwen-code.flash_fallback`: Qwen Code がフォールバックとして Flash に切り替わった場合に記録されます。
  - **属性**:
    - `auth_type`

- `qwen-code.slash_command`: ユーザーがスラッシュコマンドを実行したときに記録されます。
  - **属性**:
    - `command`（文字列）
    - `subcommand`（文字列：該当する場合）

- `qwen-code.extension_enable`: 拡張機能が有効化されたときに記録されます。
- `qwen-code.extension_install`: 拡張機能がインストールされたときに記録されます。
  - **属性**:
    - `extension_name`（文字列）
    - `extension_version`（文字列）
    - `extension_source`（文字列）
    - `status`（文字列）
- `qwen-code.extension_uninstall`: 拡張機能がアンインストールされたときに記録されます。

### メトリクス

メトリクスは、時間経過に伴う動作の数値による測定値です。Qwen Code では、以下のメトリクスが収集されます（互換性のため、メトリクス名は `qwen-code.*` のままです）。

- `qwen-code.session.count`（カウンター、整数型）：CLI 起動ごとに 1 回インクリメントされます。

- `qwen-code.tool.call.count`（カウンター、整数型）：ツール呼び出しの回数をカウントします。  
  - **属性**:  
    - `function_name`  
    - `success`（ブール値）  
    - `decision`（文字列："accept"、"reject"、または "modify"。該当する場合）  
    - `tool_type`（文字列："mcp" または "native"。該当する場合）

- `qwen-code.tool.call.latency`（ヒストグラム、ミリ秒単位）：ツール呼び出しの遅延を計測します。  
  - **属性**:  
    - `function_name`  
    - `decision`（文字列："accept"、"reject"、または "modify"。該当する場合）

- `qwen-code.api.request.count`（カウンター、整数型）：すべての API リクエストの回数をカウントします。  
  - **属性**:  
    - `model`  
    - `status_code`  
    - `error_type`（該当する場合）

- `qwen-code.api.request.latency`（ヒストグラム、ミリ秒単位）：API リクエストの遅延を計測します。  
  - **属性**:  
    - `model`

- `qwen-code.token.usage`（カウンター、整数型）：使用されたトークン数をカウントします。  
  - **属性**:  
    - `model`  
    - `type`（文字列："input"、"output"、"thought"、"cache"、または "tool"）

- `qwen-code.file.operation.count`（カウンター、整数型）：ファイル操作の回数をカウントします。  
  - **属性**:  
    - `operation`（文字列："create"、"read"、"update"）：ファイル操作の種類。  
    - `lines`（整数型、該当する場合）：ファイル内の行数。  
    - `mimetype`（文字列、該当する場合）：ファイルの MIME タイプ。  
    - `extension`（文字列、該当する場合）：ファイルの拡張子。  
    - `model_added_lines`（整数型、該当する場合）：モデルによって追加／変更された行数。  
    - `model_removed_lines`（整数型、該当する場合）：モデルによって削除／変更された行数。  
    - `user_added_lines`（整数型、該当する場合）：ユーザーが AI 提案の変更に対して追加／変更した行数。  
    - `user_removed_lines`（整数型、該当する場合）：ユーザーが AI 提案の変更に対して削除／変更した行数。  
    - `programming_language`（文字列、該当する場合）：ファイルのプログラミング言語。

- `qwen-code.chat_compression`（カウンター、整数型）：チャット圧縮操作の回数をカウントします。  
  - **属性**:  
    - `tokens_before`（整数型）：圧縮前のコンテキスト内のトークン数。  
    - `tokens_after`（整数型）：圧縮後のコンテキスト内のトークン数。