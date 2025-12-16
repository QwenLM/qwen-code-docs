# ヘッドレスモード

ヘッドレスモードでは、対話型のUIなしに、コマンドラインスクリプトや自動化ツールからQwen Codeをプログラム的に実行できます。これは、スクリプト作成、自動化、CI/CDパイプライン、AI搭載ツール構築に最適です。

## 概要

ヘッドレスモードは、以下のような機能を持つQwen Codeのインターフェースを提供します：

- コマンドライン引数またはstdin経由でプロンプトを受け取る
- 構造化された出力（テキストまたはJSON）を返す
- ファイルリダイレクトおよびパイプをサポート
- 自動化およびスクリプトワークフローを可能にする
- エラー処理のために一貫した終了コードを提供
- 現在のプロジェクトにスコープされた前回セッションからの再開が可能なため、複数ステップの自動化に対応

## 基本的な使用方法

### 直接プロンプト入力

`--prompt`（または`-p`）フラグを使用してヘッドレスモードで実行します：

```bash
qwen --prompt "機械学習とは何ですか？"
```

### 標準入力からの入力

ターミナルからQwen Codeへパイプで入力します：

```bash
echo "このコードを説明してください" | qwen
```

### ファイル入力との組み合わせ

ファイルから読み取り、Qwen Codeで処理する：

```bash
cat README.md | qwen --prompt "このドキュメントを要約してください"
```

### 以前のセッションの再開（ヘッドレス）

ヘッドレススクリプトで現在のプロジェクトの会話コンテキストを再利用する：

```bash

# このプロジェクトの最新セッションを継続し、新しいプロンプトを実行
qwen --continue -p "再度テストを実行し、失敗を要約してください"

# 特定のセッションIDを直接再開（UIなし）
qwen --resume 123e4567-e89b-12d3-a456-426614174000 -p "フォローアップのリファクタリングを適用"
```

> [!note]
>
> - セッションデータは`~/.qwen/projects/<sanitized-cwd>/chats`配下のプロジェクトスコープのJSONLです。
> - 新しいプロンプトを送信する前に、会話履歴、ツール出力、チャット圧縮チェックポイントを復元します。

## 出力形式

Qwen Codeは異なるユースケースに対応する複数の出力形式をサポートしています：

### テキスト出力（デフォルト）

標準的な人間が読める形式の出力：

```bash
qwen -p "フランスの首都はどこですか？"
```

レスポンス形式：

```
フランスの首都はパリです。
```

### JSON 出力

構造化されたデータを JSON 配列として返します。すべてのメッセージはバッファリングされ、セッションが完了した時点で一緒に出力されます。この形式はプログラムによる処理や自動化スクリプトに最適です。

JSON 出力はメッセージオブジェクトの配列です。出力には複数のメッセージタイプが含まれます：システムメッセージ（セッション初期化）、アシスタントメッセージ（AI の応答）、結果メッセージ（実行サマリー）。

#### 使用例

```bash
qwen -p "フランスの首都はどこですか？" --output-format json
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
          "text": "フランスの首都はパリです。"
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
    "result": "フランスの首都はパリです。",
    "usage": {...}
  }
]
```

### Stream-JSON 出力

Stream-JSON 形式は、実行中に発生する JSON メッセージを即座に出力するため、リアルタイムでの監視が可能です。この形式では、各行に完全な JSON オブジェクトが含まれる、行区切りの JSON を使用します。

```bash
qwen -p "Explain TypeScript" --output-format stream-json
```

出力（イベント発生時にストリーミング）:

```json
{"type":"system","subtype":"session_start","uuid":"...","session_id":"..."}
{"type":"assistant","uuid":"...","session_id":"...","message":{...}}
{"type":"result","subtype":"success","uuid":"...","session_id":"..."}
```

`--include-partial-messages` と組み合わせると、追加のストリームイベント（message_start、content_block_delta など）がリアルタイムで出力され、リアルタイムの UI 更新が可能になります。

```bash
qwen -p "Write a Python script" --output-format stream-json --include-partial-messages
```

### 入力形式

`--input-format` パラメータは、Qwen Code が標準入力から入力を処理する方法を制御します：

- **`text`**（デフォルト）：stdin またはコマンドライン引数からの標準テキスト入力
- **`stream-json`**：双方向通信のための stdin 経由の JSON メッセージプロトコル

> **注記：** Stream-json 入力モードは現在構築中であり、SDK 統合を目的としています。このモードを使用するには、`--output-format stream-json` を設定する必要があります。

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

# リアルタイム処理のための Stream-JSON 出力
qwen -p "Explain Docker" --output-format stream-json | jq '.type'
qwen -p "Write code" --output-format stream-json --include-partial-messages | jq '.event.type'
```

## 設定オプション

ヘッドレスモードで使用する主要なコマンドラインオプション:

| オプション                     | 説明                                               | 例                                                                      |
| ------------------------------ | -------------------------------------------------- | ------------------------------------------------------------------------ |
| `--prompt`, `-p`               | ヘッドレスモードで実行                             | `qwen -p "query"`                                                        |
| `--output-format`, `-o`        | 出力形式を指定 (text, json, stream-json)           | `qwen -p "query" --output-format json`                                   |
| `--input-format`               | 入力形式を指定 (text, stream-json)                 | `qwen --input-format text --output-format stream-json`                   |
| `--include-partial-messages`   | stream-json出力に部分メッセージを含める            | `qwen -p "query" --output-format stream-json --include-partial-messages` |
| `--debug`, `-d`                | デバッグモードを有効化                             | `qwen -p "query" --debug`                                                |
| `--all-files`, `-a`            | コンテキストにすべてのファイルを含める             | `qwen -p "query" --all-files`                                            |
| `--include-directories`        | 追加のディレクトリを含める                         | `qwen -p "query" --include-directories src,docs`                         |
| `--yolo`, `-y`                 | すべてのアクションを自動承認                       | `qwen -p "query" --yolo`                                                 |
| `--approval-mode`              | 承認モードを設定                                   | `qwen -p "query" --approval-mode auto_edit`                              |
| `--continue`                   | このプロジェクトの最新セッションを再開             | `qwen --continue -p "Pick up where we left off"`                         |
| `--resume [sessionId]`         | 特定のセッションを再開（または対話的に選択）        | `qwen --resume 123e... -p "Finish the refactor"`                         |

利用可能なすべての設定オプション、設定ファイル、環境変数の詳細については、[設定ガイド](/users/configuration/settings)を参照してください。

## 例

### コードレビュー

```bash
cat src/auth.py | qwen -p "この認証コードのセキュリティ問題をレビューしてください" > security-review.txt
```

### コミットメッセージの生成

```bash
result=$(git diff --cached | qwen -p "これらの変更に対する簡潔なコミットメッセージを書いてください" --output-format json)
echo "$result" | jq -r '.response'
```

### APIドキュメント

```bash
result=$(cat api/routes.js | qwen -p "これらのルートに対するOpenAPI仕様を生成してください" --output-format json)
echo "$result" | jq -r '.response' > openapi.json
```

### バッチコード分析

```bash
for file in src/*.py; do
    echo "Analyzing $file..."
    result=$(cat "$file" | qwen -p "潜在的なバグを見つけ、改善点を提案してください" --output-format json)
    echo "$result" | jq -r '.response' > "reports/$(basename "$file").analysis"
    echo "Completed analysis for $(basename "$file")" >> reports/progress.log
done
```

### PR コードレビュー

```bash
result=$(git diff origin/main...HEAD | qwen -p "これらの変更について、バグ、セキュリティ問題、コード品質をレビューしてください" --output-format json)
echo "$result" | jq -r '.response' > pr-review.json
```

### ログ分析

```bash
grep "ERROR" /var/log/app.log | tail -20 | qwen -p "これらのエラーを分析し、根本原因と修正方法を提案してください" > error-analysis.txt
```

### リリースノート生成

```bash
result=$(git log --oneline v1.0.0..HEAD | qwen -p "これらのコミットからリリースノートを生成してください" --output-format json)
response=$(echo "$result" | jq -r '.response')
echo "$response"
echo "$response" >> CHANGELOG.md
```

### モデルとツールの使用状況の追跡

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

- [CLI 設定](/users/configuration/settings#command-line-arguments) - 完全な設定ガイド
- [認証](/users/configuration/settings#environment-variables-for-api-access) - 認証のセットアップ
- [コマンド](/users/reference/cli-reference) - インタラクティブなコマンドリファレンス
- [チュートリアル](/users/quickstart) - ステップバイステップの自動化ガイド