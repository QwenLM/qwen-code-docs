# Qwen Code 観測性ガイド

テレメトリは、Qwen Code のパフォーマンス、健全性、使用状況に関するデータを提供します。これを有効にすることで、トレース、メトリクス、構造化ログを通じて、操作の監視、問題のデバッグ、ツール使用の最適化が可能になります。

Qwen Code のテレメトリシステムは **[OpenTelemetry] (OTEL)** 標準に基づいて構築されており、互換性のある任意のバックエンドにデータを送信できます。

[OpenTelemetry]: https://opentelemetry.io/

## テレメトリの有効化

テレメトリは複数の方法で有効化できます。設定は主に [`.qwen/settings.json` ファイル](./cli/configuration.md) と環境変数で管理されますが、CLI フラグで特定のセッションに対してこれらの設定を上書きできます。

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

1.  **ユーザー設定ファイル (`~/.qwen/settings.json`):** このグローバルなユーザー設定ファイル内の `telemetry` オブジェクトの値が使用されます。

1.  **デフォルト値:** 上記いずれの方法でも設定されていない場合に適用されます。
    - `telemetry.enabled`: `false`
    - `telemetry.target`: `local`
    - `telemetry.otlpEndpoint`: `http://localhost:4317`
    - `telemetry.logPrompts`: `true`

**`npm run telemetry -- --target=<gcp|local>` スクリプトについて:**
このスクリプトに渡す `--target` 引数は、そのスクリプトの実行中およびその目的（つまり、起動する collector の選択）においてのみ `telemetry.target` を上書きします。これは `settings.json` の設定を永続的に変更するものではありません。スクリプトはまず `settings.json` を参照し、`telemetry.target` のデフォルト値として使用します。

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

すべてのテレメトリデータをファイルにエクスポートして、ローカルで確認できます。

ファイルエクスポートを有効にするには、`--telemetry-outfile` フラグに任意の出力ファイルパスを指定して実行します。このとき、`--telemetry-target=local` を指定する必要があります。

```bash

# 出力先ファイルパスを設定
TELEMETRY_FILE=".qwen/telemetry.log"

# ローカルテレメトリを有効にして Qwen Code を実行

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
CLI は OTLP/gRPC プロトコルを使用してデータを送信します。

OTEL エクスポーターの標準設定について詳しくは、[documentation][otel-config-docs] を参照してください。

[otel-config-docs]: https://opentelemetry.io/docs/languages/sdk-configuration/otlp-exporter/

### Local

`npm run telemetry -- --target=local` コマンドを使用して、ローカルのテレメトリーパイプラインをセットアップするプロセスを自動化できます。このコマンドは、`.qwen/settings.json` ファイルに必要な設定を行うことも含まれています。内部のスクリプトは `otelcol-contrib`（OpenTelemetry Collector）と `jaeger`（トレースを表示するためのJaeger UI）をインストールします。使用方法は以下の通りです：

1.  **コマンドを実行**：
    リポジトリのルートから以下のコマンドを実行してください：

    ```bash
    npm run telemetry -- --target=local
    ```

    スクリプトは以下の処理を行います：
    - 必要に応じて Jaeger と OTEL をダウンロード。
    - ローカルに Jaeger インスタンスを起動。
    - Qwen Code からのデータを受信するように設定された OTEL コレクターを起動。
    - ワークスペースの設定で自動的にテレメトリーを有効化。
    - 終了時にテレメトリーを無効化。

1.  **トレースの表示**：
    Webブラウザを開き、**http://localhost:16686** にアクセスして Jaeger UI を表示します。ここでは Qwen Code の操作に関する詳細なトレースを確認できます。

1.  **ログとメトリクスの確認**：
    スクリプトは OTEL コレクターの出力（ログとメトリクスを含む）を `~/.qwen/tmp/<projectHash>/otel/collector.log` にリダイレクトします。スクリプトは、テレメトリーデータ（トレース、メトリクス、ログ）をローカルで表示するためのリンクと、それらを tail するコマンドを提供します。

1.  **サービスの停止**：
    スクリプトを実行しているターミナルで `Ctrl+C` を押すと、OTEL Collector と Jaeger サービスを停止できます。

### Google Cloud

`npm run telemetry -- --target=gcp` コマンドを使用すると、ローカルに OpenTelemetry collector を自動でセットアップし、データを指定した Google Cloud プロジェクトに転送できます。この際に必要な設定を `.qwen/settings.json` ファイルに自動で追加します。内部では `otelcol-contrib` をインストールするスクリプトが実行されます。使用手順は以下の通りです：

1.  **前提条件**:
    - Google Cloud のプロジェクト ID を用意してください。
    - `GOOGLE_CLOUD_PROJECT` 環境変数をエクスポートし、OTEL collector から参照できるようにしてください。
      ```bash
      export OTLP_GOOGLE_CLOUD_PROJECT="your-project-id"
      ```
    - Google Cloud への認証を行ってください（例：`gcloud auth application-default login` を実行する、または `GOOGLE_APPLICATION_CREDENTIALS` が正しく設定されていることを確認してください）。
    - 使用する Google Cloud アカウントまたはサービスアカウントに、以下の IAM ロールが割り当てられていることを確認してください："Cloud Trace Agent"、"Monitoring Metric Writer"、"Logs Writer"。

1.  **コマンドを実行**:
    リポジトリのルートディレクトリから以下のコマンドを実行してください：

    ```bash
    npm run telemetry -- --target=gcp
    ```

    スクリプトの処理内容：
    - 必要に応じて `otelcol-contrib` のバイナリをダウンロードします。
    - Qwen Code からのデータを受信し、指定された Google Cloud プロジェクトにエクスポートするように設定された OTEL collector を起動します。
    - 自動的に telemetry を有効にし、workspace settings（`.qwen/settings.json`）の sandbox mode を無効化します。
    - Google Cloud Console 上で traces、metrics、logs を確認するための直接リンクを表示します。
    - 終了時（Ctrl+C）には、元の telemetry および sandbox 設定を復元しようとします。

1.  **Qwen Code を実行**:
    別のターミナルで Qwen Code のコマンドを実行してください。これにより、collector が取得する telemetry データが生成されます。

1.  **Google Cloud で telemetry を確認**:
    スクリプトが提供するリンクを使って Google Cloud Console にアクセスし、traces、metrics、logs を確認してください。

1.  **ローカル collector のログを確認**:
    ローカルの OTEL collector の出力は `~/.qwen/tmp/<projectHash>/otel/collector-gcp.log` にリダイレクトされます。スクリプトは、このログを表示するリンクおよび tail コマンドも提供します。

1.  **サービスを停止**:
    スクリプトを実行中のターミナルで `Ctrl+C` を押すと、OTEL Collector が停止します。

## ログとメトリクスのリファレンス

以下のセクションでは、Qwen Code 用に生成されるログとメトリクスの構造について説明します。

- すべてのログとメトリクスには、共通の属性として `sessionId` が含まれます。

### ログ

ログは、特定のイベントのタイムスタンプ付き記録です。Qwen Code では以下のイベントがログに記録されます：

- `qwen-code.config`: CLI の起動時に1回発生し、CLI の設定情報を含みます。
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

- `qwen-code.user_prompt`: ユーザーがプロンプトを送信したときに発生します。
  - **属性**:
    - `prompt_length`
    - `prompt` (`log_prompts_enabled` が `false` の場合はこの属性は除外されます)
    - `auth_type`

- `qwen-code.tool_call`: 各関数呼び出し時に発生します。
  - **属性**:
    - `function_name`
    - `function_args`
    - `duration_ms`
    - `success` (boolean)
    - `decision` (string: "accept"、"reject"、"auto_accept"、または "modify"。適用される場合)
    - `error` (適用される場合)
    - `error_type` (適用される場合)
    - `metadata` (適用される場合、string → any の辞書形式)

- `qwen-code.api_request`: Gemini API へのリクエスト時に発生します。
  - **属性**:
    - `model`
    - `request_text` (適用される場合)

- `qwen-code.api_error`: API リクエストが失敗した場合に発生します。
  - **属性**:
    - `model`
    - `error`
    - `error_type`
    - `status_code`
    - `duration_ms`
    - `auth_type`

- `qwen-code.api_response`: Gemini API からレスポンスを受信したときに発生します。
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
    - `response_text` (適用される場合)
    - `auth_type`

- `qwen-code.flash_fallback`: Qwen Code がフォールバックとして flash に切り替えたときに発生します。
  - **属性**:
    - `auth_type`

- `qwen-code.slash_command`: ユーザーがスラッシュコマンドを実行したときに発生します。
  - **属性**:
    - `command` (string)
    - `subcommand` (string, 適用される場合)

### Metrics

Metrics は時間経過に伴う行動の数値的な測定値です。Qwen Code では以下の Metrics が収集されます（互換性のため、メトリクス名は `qwen-code.*` のままです）：

- `qwen-code.session.count` (Counter, Int): CLI の起動ごとに 1 ずつ増加します。

- `qwen-code.tool.call.count` (Counter, Int): ツール呼び出しの回数をカウントします。
  - **Attributes**:
    - `function_name`
    - `success` (boolean)
    - `decision` (string: "accept", "reject", または "modify"。該当する場合のみ)

- `qwen-code.tool.call.latency` (Histogram, ms): ツール呼び出しのレイテンシを測定します。
  - **Attributes**:
    - `function_name`
    - `decision` (string: "accept", "reject", または "modify"。該当する場合のみ)

- `qwen-code.api.request.count` (Counter, Int): すべての API リクエストの回数をカウントします。
  - **Attributes**:
    - `model`
    - `status_code`
    - `error_type` (該当する場合のみ)

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
    - `lines` (Int, 該当する場合のみ): ファイル内の行数。
    - `mimetype` (string, 該当する場合のみ): ファイルの mimetype。
    - `extension` (string, 該当する場合のみ): ファイルの拡張子。
    - `ai_added_lines` (Int, 該当する場合のみ): AI によって追加・変更された行数。
    - `ai_removed_lines` (Int, 該当する場合のみ): AI によって削除・変更された行数。
    - `user_added_lines` (Int, 該当する場合のみ): ユーザーが AI の提案変更で追加・変更した行数。
    - `user_removed_lines` (Int, 該当する場合のみ): ユーザーが AI の提案変更で削除・変更した行数。