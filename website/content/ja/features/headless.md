```markdown
# Headless Mode

Headless モードでは、インタラクティブな UI を使用せずに、コマンドラインスクリプトや自動化ツールから Qwen Code をプログラムで実行できます。これは、スクリプティング、自動化、CI/CD パイプライン、AI を活用したツール構築に最適です。

- [Headless Mode](#headless-mode)
  - [概要](#overview)
  - [基本的な使い方](#basic-usage)
    - [直接プロンプトを入力](#direct-prompts)
    - [Stdin からの入力](#stdin-input)
    - [ファイル入力との組み合わせ](#combining-with-file-input)
  - [出力形式](#output-formats)
    - [テキスト出力（デフォルト）](#text-output-default)
    - [JSON 出力](#json-output)
      - [レスポンススキーマ](#response-schema)
      - [使用例](#example-usage)
    - [ファイルへのリダイレクト](#file-redirection)
  - [設定オプション](#configuration-options)
  - [使用例](#examples)
    - [コードレビュー](#code-review)
    - [コミットメッセージの生成](#generate-commit-messages)
    - [API ドキュメント](#api-documentation)
    - [バッチでのコード分析](#batch-code-analysis)
    - [コードレビュー](#code-review-1)
    - [ログ分析](#log-analysis)
    - [リリースノートの生成](#release-notes-generation)
    - [モデルとツールの利用状況トラッキング](#model-and-tool-usage-tracking)
  - [リソース](#resources)
```

## 概要

headless モードは、Qwen Code に対して以下のような機能を提供するインターフェースです：

- コマンドライン引数または stdin 経由でプロンプトを受け取る
- 構造化された出力（テキストまたは JSON）を返す
- ファイルのリダイレクトとパイプをサポート
- 自動化およびスクリプト処理のワークフローに対応
- エラー処理のために一貫した終了コードを提供

## 基本的な使い方

### 直接プロンプトを渡す

`--prompt`（または `-p`）フラグを使って headless モードで実行します：

```bash
qwen --prompt "What is machine learning?"
```

### 標準入力（stdin）からの入力

ターミナルから Qwen Code にパイプで入力できます：

```bash
echo "Explain this code" | qwen
```

### ファイル入力との組み合わせ

ファイルを読み込んで Qwen Code で処理できます：

```bash
cat README.md | qwen --prompt "Summarize this documentation"
```

## 出力形式

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

レスポンス、統計情報、メタデータを含む構造化されたデータを返します。このフォーマットは、プログラムによる処理や自動化スクリプトに最適です。

#### Response Schema

JSON の出力は以下の高レベル構造に従います：

```json
{
  "response": "string", // プロンプトに回答するメインの AI 生成コンテンツ
  "stats": {
    // 使用状況メトリクスとパフォーマンスデータ
    "models": {
      // モデルごとの API およびトークン使用統計
      "[model-name]": {
        "api": {
          /* リクエスト数、エラー、レイテンシ */
        },
        "tokens": {
          /* プロンプト、レスポンス、キャッシュ、合計数 */
        }
      }
    },
    "tools": {
      // ツール実行統計
      "totalCalls": "number",
      "totalSuccess": "number",
      "totalFail": "number",
      "totalDurationMs": "number",
      "totalDecisions": {
        /* accept、reject、modify、auto_accept のカウント */
      },
      "byName": {
        /* ツールごとの詳細な統計 */
      }
    },
    "files": {
      // ファイル変更統計
      "totalLinesAdded": "number",
      "totalLinesRemoved": "number"
    }
  },
  "error": {
    // エラーが発生した場合のみ存在
    "type": "string", // エラータイプ（例："ApiError"、"AuthError"）
    "message": "string", // 人間が読めるエラーの説明
    "code": "number" // オプションのエラーコード
  }
}
```

#### 使用例

```bash
qwen -p "What is the capital of France?" --output-format json
```

レスポンス:

```json
{
  "response": "The capital of France is Paris.",
  "stats": {
    "models": {
      "qwen3-coder-plus": {
        "api": {
          "totalRequests": 2,
          "totalErrors": 0,
          "totalLatencyMs": 5053
        },
        "tokens": {
          "prompt": 24939,
          "candidates": 20,
          "total": 25113,
          "cached": 21263,
          "thoughts": 154,
          "tool": 0
        }
      }
    },
    "tools": {
      "totalCalls": 1,
      "totalSuccess": 1,
      "totalFail": 0,
      "totalDurationMs": 1881,
      "totalDecisions": {
        "accept": 0,
        "reject": 0,
        "modify": 0,
        "auto_accept": 1
      },
      "byName": {
        "google_web_search": {
          "count": 1,
          "success": 1,
          "fail": 0,
          "durationMs": 1881,
          "decisions": {
            "accept": 0,
            "reject": 0,
            "modify": 0,
            "auto_accept": 1
          }
        }
      }
    },
    "files": {
      "totalLinesAdded": 0,
      "totalLinesRemoved": 0
    }
  }
}
```

### ファイルリダイレクト

出力をファイルに保存したり、他のコマンドにパイプしたりできます：

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

## 設定オプション

headless モードで使用する主要なコマンドラインオプション:

| Option                  | Description                        | Example                                          |
| ----------------------- | ---------------------------------- | ------------------------------------------------ |
| `--prompt`, `-p`        | headless モードで実行               | `qwen -p "query"`                                |
| `--output-format`       | 出力形式を指定 (text, json)         | `qwen -p "query" --output-format json`           |
| `--model`, `-m`         | Qwen モデルを指定                   | `qwen -p "query" -m qwen3-coder-plus`            |
| `--debug`, `-d`         | デバッグモードを有効化              | `qwen -p "query" --debug`                        |
| `--all-files`, `-a`     | すべてのファイルをコンテキストに含める | `qwen -p "query" --all-files`                    |
| `--include-directories` | 追加のディレクトリを含める          | `qwen -p "query" --include-directories src,docs` |
| `--yolo`, `-y`          | すべてのアクションを自動承認        | `qwen -p "query" --yolo`                         |
| `--approval-mode`       | 承認モードを設定                    | `qwen -p "query" --approval-mode auto_edit`      |

すべての設定オプション、設定ファイル、環境変数の詳細については、[Configuration Guide](./cli/configuration.md) を参照してください。

## 例

#### コードレビュー

```bash
cat src/auth.py | qwen -p "Review this authentication code for security issues" > security-review.txt
```

#### コミットメッセージの生成

```bash
result=$(git diff --cached | qwen -p "Write a concise commit message for these changes" --output-format json)
echo "$result" | jq -r '.response'
```

#### APIドキュメント

```bash
result=$(cat api/routes.js | qwen -p "Generate OpenAPI spec for these routes" --output-format json)
echo "$result" | jq -r '.response' > openapi.json
```

#### バッチコード分析

```bash
for file in src/*.py; do
    echo "Analyzing $file..."
    result=$(cat "$file" | qwen -p "Find potential bugs and suggest improvements" --output-format json)
    echo "$result" | jq -r '.response' > "reports/$(basename "$file").analysis"
    echo "Completed analysis for $(basename "$file")" >> reports/progress.log
done
```

#### コードレビュー

```bash
result=$(git diff origin/main...HEAD | qwen -p "Review these changes for bugs, security issues, and code quality" --output-format json)
echo "$result" | jq -r '.response' > pr-review.json
```

#### ログ分析

```bash
grep "ERROR" /var/log/app.log | tail -20 | qwen -p "Analyze these errors and suggest root cause and fixes" > error-analysis.txt
```

#### リリースノートの生成

```bash
result=$(git log --oneline v1.0.0..HEAD | qwen -p "Generate release notes from these commits" --output-format json)
response=$(echo "$result" | jq -r '.response')
echo "$response"
echo "$response" >> CHANGELOG.md
```

#### モデルとツールの利用状況トラッキング

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

## リソース

- [CLI Configuration](./cli/configuration.md) - 完全な設定ガイド
- [Authentication](./cli/authentication.md) - 認証のセットアップ
- [Commands](./cli/commands.md) - インタラクティブなコマンドリファレンス
- [Tutorials](./cli/tutorials.md) - ステップバイステップの自動化ガイド