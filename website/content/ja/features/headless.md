```markdown
# Headless Mode

Headless モードでは、Qwen Code を対話的な UI を使用せずに、コマンドラインスクリプトや自動化ツールからプログラム的に実行できます。これは、スクリプティング、自動化、CI/CD パイプライン、AI を活用したツール構築に最適です。

- [Headless Mode](#headless-mode)
  - [概要](#overview)
  - [基本的な使い方](#basic-usage)
    - [直接プロンプト入力](#direct-prompts)
    - [Stdin からの入力](#stdin-input)
    - [ファイル入力との組み合わせ](#combining-with-file-input)
  - [出力形式](#output-formats)
    - [テキスト出力（デフォルト）](#text-output-default)
    - [JSON 出力](#json-output)
      - [使用例](#example-usage)
    - [Stream-JSON 出力](#stream-json-output)
    - [入力形式](#input-format)
    - [ファイルリダイレクト](#file-redirection)
  - [設定オプション](#configuration-options)
  - [使用例](#examples)
    - [コードレビュー](#code-review)
    - [コミットメッセージの生成](#generate-commit-messages)
    - [API ドキュメント作成](#api-documentation)
    - [一括コード解析](#batch-code-analysis)
    - [PR コードレビュー](#pr-code-review)
    - [ログ分析](#log-analysis)
    - [リリースノートの生成](#release-notes-generation)
    - [モデルおよびツール利用状況のトラッキング](#model-and-tool-usage-tracking)
  - [関連リソース](#resources)
```

## 概要

headless モードでは、Qwen Code に対して以下のような headless インターフェースが提供されます：

- コマンドライン引数または stdin 経由でプロンプトを受け取る
- 構造化された出力（テキストまたは JSON）を返す
- ファイルのリダイレクトやパイプに対応
- 自動化やスクリプト処理のワークフローを可能にする
- エラーハンドリング用に一貫した終了コードを提供

## 基本的な使い方

### 直接プロンプトを渡す

headless モードで実行するには、`--prompt`（または `-p`）フラグを使用します：

```bash
qwen --prompt "What is machine learning?"
```

### Stdin からの入力

ターミナルから Qwen Code にパイプで入力できます：

```bash
echo "Explain this code" | qwen
```

### ファイル入力との組み合わせ

ファイルから読み込んで Qwen Code で処理することも可能です：

```bash
cat README.md | qwen --prompt "Summarize this documentation"
```

## 出力形式

Qwen Code は用途に応じて複数の出力形式をサポートしています：

### テキスト出力（デフォルト）

標準的な人間が読める形式の出力です：

```bash
qwen -p "What is the capital of France?"
```

レスポンス例：

```
The capital of France is Paris.
```

### JSON Output

構造化されたデータを JSON 配列として返します。すべてのメッセージはバッファリングされ、セッションが完了した時点でまとめて出力されます。この形式は、プログラムによる処理や自動化スクリプトに最適です。

JSON 出力は、メッセージオブジェクトの配列です。出力には複数のメッセージタイプが含まれます：システムメッセージ（セッション初期化）、アシスタントメッセージ（AI の応答）、結果メッセージ（実行サマリ）です。

#### 使用例

```bash
qwen -p "What is the capital of France?" --output-format json
```

出力（実行終了時）:

```json
[
  {
    "type": "system",
    "subtype": "session_start",
    "uuid": "...",
    "session_id": "...",
    "model": "qwen3-coder-plus",
    ...
  },
  {
    "type": "assistant",
    "uuid": "...",
    "session_id": "...",
    "message": {
      "id": "...",
      "type": "message",
      "role": "assistant",
      "model": "qwen3-coder-plus",
      "content": [
        {
          "type": "text",
          "text": "The capital of France is Paris."
        }
      ],
      "usage": {...}
    },
    "parent_tool_use_id": null
  },
  {
    "type": "result",
    "subtype": "success",
    "uuid": "...",
    "session_id": "...",
    "is_error": false,
    "duration_ms": 1234,
    "result": "The capital of France is Paris.",
    "usage": {...}
  }
]
```

### Stream-JSON 出力

Stream-JSON 形式は、実行中にイベントが発生するたびに即座に JSON メッセージを出力するため、リアルタイムでの監視が可能です。この形式では、各行に完全な JSON オブジェクトが含まれる line-delimited JSON を使用します。

```bash
qwen -p "Explain TypeScript" --output-format stream-json
```

出力（イベント発生時にストリーミング）:

```json
{"type":"system","subtype":"session_start","uuid":"...","session_id":"..."}
{"type":"assistant","uuid":"...","session_id":"...","message":{...}}
{"type":"result","subtype":"success","uuid":"...","session_id":"..."}
```

`--include-partial-messages` と組み合わせると、追加のストリームイベント（message_start、content_block_delta など）がリアルタイムで出力されるため、UI のリアルタイム更新が可能になります。

```bash
qwen -p "Write a Python script" --output-format stream-json --include-partial-messages
```

### 入力形式

`--input-format` パラメータは、Qwen Code が標準入力から入力を処理する方法を制御します：

- **`text`**（デフォルト）：stdin またはコマンドライン引数からの標準テキスト入力
- **`stream-json`**：双方向通信のための stdin 経由の JSON メッセージプロトコル

> **注意：** `stream-json` 入力モードは現在開発中であり、SDK との連携を目的としています。このモードを使用するには、`--output-format stream-json` の指定が必要です。

### ファイルリダイレクト

出力をファイルに保存したり、他のコマンドにパイプで渡したりできます：

```bash

# ファイルに保存
qwen -p "Explain Docker" > docker-explanation.txt
qwen -p "Explain Docker" --output-format json > docker-explanation.json

# ファイルに追記
qwen -p "Add more details" >> docker-explanation.txt

# 他のツールにパイプ
qwen -p "What is Kubernetes?" --output-format json | jq '.response'
qwen -p "Explain microservices" | wc -w
qwen -p "List programming languages" | grep -i "python"
```

# リアルタイム処理のための Stream-JSON 出力
```bash
qwen -p "Explain Docker" --output-format stream-json | jq '.type'
qwen -p "Write code" --output-format stream-json --include-partial-messages | jq '.event.type'
```

## 設定オプション

headless モードで使用する主要なコマンドラインオプション:

| オプション                     | 説明                                           | 例                                                                      |
| ------------------------------ | ---------------------------------------------- | ----------------------------------------------------------------------- |
| `--prompt`, `-p`               | headless モードで実行                          | `qwen -p "query"`                                                       |
| `--output-format`, `-o`        | 出力形式を指定 (text, json, stream-json)       | `qwen -p "query" --output-format json`                                  |
| `--input-format`               | 入力形式を指定 (text, stream-json)             | `qwen --input-format text --output-format stream-json`                  |
| `--include-partial-messages`   | stream-json 出力に部分メッセージを含める       | `qwen -p "query" --output-format stream-json --include-partial-messages`|
| `--debug`, `-d`                | デバッグモードを有効化                         | `qwen -p "query" --debug`                                               |
| `--all-files`, `-a`            | コンテキストにすべてのファイルを含める         | `qwen -p "query" --all-files`                                           |
| `--include-directories`        | 追加のディレクトリを含める                     | `qwen -p "query" --include-directories src,docs`                        |
| `--yolo`, `-y`                 | すべてのアクションを自動承認                   | `qwen -p "query" --yolo`                                                |
| `--approval-mode`              | 承認モードを設定                               | `qwen -p "query" --approval-mode auto_edit`                             |

利用可能なすべての設定オプション、設定ファイル、環境変数の詳細については、[Configuration Guide](./cli/configuration.md) を参照してください。

## 例

### コードレビュー

```bash
cat src/auth.py | qwen -p "Review this authentication code for security issues" > security-review.txt
```

### コミットメッセージの生成

```bash
result=$(git diff --cached | qwen -p "Write a concise commit message for these changes" --output-format json)
echo "$result" | jq -r '.response'
```

### APIドキュメント

```bash
result=$(cat api/routes.js | qwen -p "Generate OpenAPI spec for these routes" --output-format json)
echo "$result" | jq -r '.response' > openapi.json
```

### バッチコード分析

```bash
for file in src/*.py; do
    echo "Analyzing $file..."
    result=$(cat "$file" | qwen -p "Find potential bugs and suggest improvements" --output-format json)
    echo "$result" | jq -r '.response' > "reports/$(basename "$file").analysis"
    echo "Completed analysis for $(basename "$file")" >> reports/progress.log
done
```

### PRコードレビュー

```bash
result=$(git diff origin/main...HEAD | qwen -p "Review these changes for bugs, security issues, and code quality" --output-format json)
echo "$result" | jq -r '.response' > pr-review.json
```

### ログ分析

```bash
grep "ERROR" /var/log/app.log | tail -20 | qwen -p "Analyze these errors and suggest root cause and fixes" > error-analysis.txt
```

### リリースノート生成

```bash
result=$(git log --oneline v1.0.0..HEAD | qwen -p "Generate release notes from these commits" --output-format json)
response=$(echo "$result" | jq -r '.response')
echo "$response"
echo "$response" >> CHANGELOG.md
```

### モデルとツールの利用状況トラッキング

```bash
result=$(qwen -p "Explain this database schema" --include-directories db --output-format json)
total_tokens=$(echo "$result" | jq -r '.stats.models // {} | to_entries | map(.value.tokens.total) | add // 0')
models_used=$(echo "$result" | jq -r '.stats.models // {} | keys | join(", ") | if . == "" then "none" else . end')
tool_calls=$(echo "$result" | jq -r '.stats.tools.totalCalls // 0')
tools_used=$(echo "$result" | jq -r '.stats.tools.byName // {} | keys | join(", ") | if . == "" then "none" else . end')
echo "$(date): $total_tokens tokens, $tool_calls tool calls ($tools_used) used with models: $models_used" >> usage.log
echo "$result" | jq -r '.response' > schema-docs.md
echo "Recent usage trends:"
tail -5 usage.log
```

このスクリプトでは、Qwen CLI を使ってデータベーススキーマの説明を生成し、使用されたモデルやツールの統計情報を取得しています。具体的には：

- `qwen` コマンドで指定したディレクトリ（ここでは `db`）以下のファイルを含めてプロンプトを実行し、結果を JSON 形式で出力
- 結果からトークン数、使用されたモデル名、ツール呼び出し回数、使用されたツール名を抽出
- これらの情報を `usage.log` に記録
- 生成されたレスポンス本文を `schema-docs.md` に出力
- 最後に最近の利用傾向としてログの最新5行を表示

これにより、どのモデルやツールがどれくらい使われているかを追跡できます。

## リソース

- [CLI Configuration](./cli/configuration.md) - 完全な設定ガイド
- [Authentication](./cli/authentication.md) - 認証のセットアップ
- [Commands](./cli/commands.md) - インタラクティブコマンドリファレンス
- [Tutorials](./cli/tutorials.md) - ステップバイステップの自動化ガイド