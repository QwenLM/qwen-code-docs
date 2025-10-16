# Qwen Code 可観測性ガイド

テレメトリは、Qwen Code のパフォーマンス、健全性、使用状況に関するデータを提供します。これを有効にすることで、トレース、メトリクス、構造化ログを通じて操作の監視、問題のデバッグ、ツール使用の最適化が可能になります。

Qwen Code のテレメトリシステムは **[OpenTelemetry] (OTEL)** 標準に基づいて構築されており、任意の互換性のあるバックエンドにデータを送信できます。

[OpenTelemetry]: https://opentelemetry.io/

## テレメトリの有効化

テレメトリは複数の方法で有効化できます。設定は主に [`.qwen/settings.json` ファイル](./cli/configuration.md) と環境変数で管理されますが、CLIフラグで特定のセッションに対してこれらの設定を上書きすることも可能です。

### 優先順位

テレメトリ設定の適用順序は以下の通りで、上位に記載された項目ほど優先度が高いです：

1.  **CLI フラグ (`qwen` コマンド用):**
    - `--telemetry` / `--no-telemetry`: `telemetry.enabled` を上書きします。
    - `--telemetry-target <local|gcp>`: `telemetry.target` を上書きします。
    - `--telemetry-otlp-endpoint <URL>`: `telemetry.otlpEndpoint` を上書きします。
    - `--telemetry-log-prompts` / `--no-telemetry-log-prompts`: `telemetry.logPrompts` を上書きします。
    - `--telemetry-outfile <path>`: テレメトリ出力をファイルにリダイレクトします。詳しくは [Exporting to a file](#exporting-to-a-file) を参照してください。

1.  **環境変数:**
    - `OTEL_EXPORTER_OTLP_ENDPOINT`: `telemetry.otlpEndpoint` を上書きします。

1.  **ワークスペース設定ファイル (`.qwen/settings.json`):** このプロジェクト固有のファイル内の `telemetry` オブジェクトの値が使用されます。

1.  **ユーザー設定ファイル (`~/.qwen/settings.json`):** このグローバルなユーザーファイル内の `telemetry` オブジェクトの値が使用されます。

1.  **デフォルト値:** 上記いずれにも設定されていない場合に適用されます。
    - `telemetry.enabled`: `false`
    - `telemetry.target`: `local`
    - `telemetry.otlpEndpoint`: `http://localhost:4317`
    - `telemetry.logPrompts`: `true`

**`npm run telemetry -- --target=<gcp|local>` スクリプトについて:**
このスクリプトへの `--target` 引数は、そのスクリプト実行中のみ `telemetry.target` を上書きします（つまり、起動するコレクターを選択するためだけです）。これは `settings.json` の設定を永続的に変更するものではありません。スクリプトはまず `settings.json` を参照し、そこにある `telemetry.target` をデフォルトとして使用します。

### 設定例

以下のコードをワークスペース (`.qwen/settings.json`) またはユーザー (`~/.qwen/settings.json`) の設定に追加することで、テレメトリを有効化し、出力を Google Cloud に送信できます。

```json
{
  "telemetry": {
    "enabled": true,
    "target": "gcp"
  },
  "sandbox": false
}
```

### ファイルへのエクスポート

すべてのテレメトリデータをファイルにエクスポートして、ローカルで確認することができます。

ファイルエクスポートを有効にするには、`--telemetry-outfile` フラグを使用して出力先ファイルのパスを指定します。このとき、`--telemetry-target=local` を指定して実行する必要があります。

```bash

# 出力先ファイルパスを設定
TELEMETRY_FILE=".qwen/telemetry.log"

# ローカルテレメトリを使って Qwen Code を実行

# 注意: デフォルトの OTLP エクスポーターを上書きし、

# テレメトリがローカルファイルに確実に書き込まれるようにするために

# --telemetry-otlp-endpoint="" が必要です。
qwen --telemetry \
  --telemetry-target=local \
  --telemetry-otlp-endpoint="" \
  --telemetry-outfile="$TELEMETRY_FILE" \
  --prompt "What is OpenTelemetry?"
```

## OTEL Collector の実行

OTEL Collector は、テレメトリデータを受信、処理、エクスポートするサービスです。  
CLI は OTLP/gRPC または OTLP/HTTP プロトコルのいずれかを使ってデータを送信できます。  
使用するプロトコルは、`--telemetry-otlp-protocol` フラグまたは `settings.json` ファイル内の  
`telemetry.otlpProtocol` 設定で指定できます。詳細については  
[configuration docs](./cli/configuration.md#--telemetry-otlp-protocol) を参照してください。

OTEL exporter の標準設定について詳しくは、[documentation][otel-config-docs] をご覧ください。

[otel-config-docs]: https://opentelemetry.io/docs/languages/sdk-configuration/otlp-exporter/

### ローカル環境

ローカルのテレメトリーパイプラインをセットアップするプロセスを自動化するには、`npm run telemetry -- --target=local` コマンドを使用します。このコマンドは、`.qwen/settings.json` ファイルに必要な設定を行う処理も含みます。内部で実行されるスクリプトは、`otelcol-contrib`（OpenTelemetry Collector）と `jaeger`（トレースを表示するためのJaeger UI）をインストールします。使用方法は以下の通りです：

1.  **コマンドを実行**：
    リポジトリのルートディレクトリから以下のコマンドを実行してください：

    ```bash
    npm run telemetry -- --target=local
    ```

    スクリプトは以下のことを行います：
    - 必要に応じて Jaeger と OTEL をダウンロードします。
    - ローカルに Jaeger インスタンスを起動します。
    - Qwen Code からのデータ受信が可能なように設定された OTEL コレクターを起動します。
    - 自動的にワークスペース設定でテレメトリーを有効にします。
    - 終了時にはテレメトリーを無効に戻します。

1.  **トレースの確認**：
    Webブラウザを開き、**http://localhost:16686** にアクセスして Jaeger UI を開いてください。ここでは Qwen Code の操作に関する詳細なトレース情報を確認できます。

1.  **ログとメトリクスの確認**：
    スクリプトは OTEL コレクターの出力（ログおよびメトリクスを含む）を `~/.qwen/tmp/<projectHash>/otel/collector.log` へリダイレクトします。また、テレメトリーデータ（トレース・メトリクス・ログ）をローカルで閲覧するためのリンクと、それらを tail するためのコマンドも提供されます。

1.  **サービスの停止**：
    スクリプトが動作しているターミナルで `Ctrl+C` を押すことで、OTEL Collector および Jaeger サービスを停止できます。

### Google Cloud

`npm run telemetry -- --target=gcp` コマンドを使用して、ローカルの OpenTelemetry コレクターを自動でセットアップし、データをあなたの Google Cloud プロジェクトに転送できます。このコマンドは、`.qwen/settings.json` ファイルに必要な設定を行う処理も含みます。内部では `otelcol-contrib` をインストールするスクリプトが実行されます。使用手順は以下の通りです：

1.  **前提条件**：
    - Google Cloud のプロジェクト ID を用意してください。
    - 環境変数 `GOOGLE_CLOUD_PROJECT` をエクスポートし、OTEL コレクターからアクセスできるようにします。
      ```bash
      export OTLP_GOOGLE_CLOUD_PROJECT="your-project-id"
      ```
    - Google Cloud への認証を行ってください（例：`gcloud auth application-default login` を実行するか、`GOOGLE_APPLICATION_CREDENTIALS` が正しく設定されていることを確認してください）。
    - 使用する Google Cloud アカウントまたはサービスアカウントに、以下の IAM ロールが割り当てられている必要があります："Cloud Trace Agent"、"Monitoring Metric Writer"、および "Logs Writer"。

1.  **コマンドを実行**：
    リポジトリのルートディレクトリから以下のコマンドを実行してください：

    ```bash
    npm run telemetry -- --target=gcp
    ```

    このスクリプトは以下のことを行います：
    - 必要に応じて `otelcol-contrib` のバイナリをダウンロードします。
    - Qwen Code からのデータを受信し、指定された Google Cloud プロジェクトにエクスポートするよう設定された OTEL コレクターを起動します。
    - 自動的にワークスペース設定（`.qwen/settings.json`）でテレメトリを有効にし、サンドボックスモードを無効にします。
    - Google Cloud Console 上でトレース、メトリクス、ログを表示するための直接リンクを提供します。
    - 終了時（Ctrl+C）には、元のテレメトリおよびサンドボックス設定に戻す処理を試みます。

1.  **Qwen Code を実行**：
    別のターミナルで Qwen Code のコマンドを実行してください。これにより、コレクターがキャプチャするテレメトリデータが生成されます。

1.  **Google Cloud でテレメトリを確認**：
    スクリプトが出力したリンクを使って Google Cloud Console へ移動し、トレース、メトリクス、ログを確認できます。

1.  **ローカルのコレクターログを確認**：
    ローカルの OTEL コレクターの出力は `~/.qwen/tmp/<projectHash>/otel/collector-gcp.log` にリダイレクトされます。スクリプトはログを表示したり、tail コマンドでリアルタイムに追跡するためのリンクやコマンドも提供します。

1.  **サービスを停止**：
    スクリプトが動作しているターミナルで `Ctrl+C` を押すと、OTEL コレクターを停止します。

## ログとメトリクスのリファレンス

このセクションでは、Qwen Code 用に生成されるログとメトリクスの構造について説明します。

- すべてのログとメトリクスには、共通の属性として `sessionId` が含まれます。

### ログ

ログは特定のイベントのタイムスタンプ付き記録です。Qwen Code では以下のイベントがログ出力されます：

- `qwen-code.config`: このイベントは CLI の起動時に1回発生し、CLI の設定情報を含みます。
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

- `qwen-code.user_prompt`: このイベントはユーザーがプロンプトを送信したときに発生します。
  - **属性**:
    - `prompt_length` (int)
    - `prompt_id` (string)
    - `prompt` (string, この属性は `log_prompts_enabled` が `false` の場合に除外されます)
    - `auth_type` (string)

- `qwen-code.tool_call`: このイベントは各関数呼び出しで発生します。
  - **属性**:
    - `function_name`
    - `function_args`
    - `duration_ms`
    - `success` (boolean)
    - `decision` (string: "accept", "reject", "auto_accept", または "modify"。該当する場合のみ)
    - `error` (該当する場合)
    - `error_type` (該当する場合)
    - `metadata` (該当する場合、string → any の辞書形式)

- `qwen-code.api_request`: このイベントは Qwen API へのリクエスト時に発生します。
  - **属性**:
    - `model`
    - `request_text` (該当する場合)

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
    - `response_text` (該当する場合)
    - `auth_type`

- `qwen-code.flash_fallback`: このイベントは Qwen Code が flash にフォールバックした際に発生します。
  - **属性**:
    - `auth_type`

- `qwen-code.slash_command`: このイベントはユーザーがスラッシュコマンドを実行したときに発生します。
  - **属性**:
    - `command` (string)
    - `subcommand` (string, 該当する場合)

### Metrics

Metrics は時間経過に伴う行動の数値的な測定値です。Qwen Code では以下の Metrics が収集されます（互換性のため、メトリクス名は `qwen-code.*` のままです）：

- `qwen-code.session.count` (Counter, Int): CLI の起動ごとに 1 ずつ増加します。

- `qwen-code.tool.call.count` (Counter, Int): ツール呼び出しの回数をカウントします。
  - **Attributes**:
    - `function_name`
    - `success` (boolean)
    - `decision` (string: "accept", "reject", または "modify"。該当する場合)
    - `tool_type` (string: "mcp" または "native"。該当する場合)

- `qwen-code.tool.call.latency` (Histogram, ms): ツール呼び出しのレイテンシを測定します。
  - **Attributes**:
    - `function_name`
    - `decision` (string: "accept", "reject", または "modify"。該当する場合)

- `qwen-code.api.request.count` (Counter, Int): すべての API リクエストの回数をカウントします。
  - **Attributes**:
    - `model`
    - `status_code`
    - `error_type` (該当する場合)

- `qwen-code.api.request.latency` (Histogram, ms): API リクエストのレイテンシを測定します。
  - **Attributes**:
    - `model`

- `qwen-code.token.usage` (Counter, Int): 使用されたトークン数をカウントします。
  - **Attributes**:
    - `model`
    - `type` (string: "input", "output", "thought", "cache", または "tool")

- `qwen-code.file.operation.count` (Counter, Int): ファイル操作の回数をカウントします。
  - **Attributes**:
    - `operation` (string: "create", "read", "update"): ファイル操作の種類。
    - `lines` (Int, 該当する場合): ファイル内の行数。
    - `mimetype` (string, 該当する場合): ファイルの mimetype。
    - `extension` (string, 該当する場合): ファイルの拡張子。
    - `ai_added_lines` (Int, 該当する場合): AI によって追加・変更された行数。
    - `ai_removed_lines` (Int, 該当する場合): AI によって削除・変更された行数。
    - `user_added_lines` (Int, 該当する場合): AI が提案した変更に対してユーザーが追加・変更した行数。
    - `user_removed_lines` (Int, 該当する場合): AI が提案した変更に対してユーザーが削除・変更した行数。
    - `programming_language` (string, 該当する場合): ファイルのプログラミング言語。

- `qwen-code.chat_compression` (Counter, Int): チャット圧縮操作の回数をカウントします。
  - **Attributes**:
    - `tokens_before`: (Int): 圧縮前のコンテキスト内のトークン数。
    - `tokens_after`: (Int): 圧縮後のコンテキスト内のトークン数。