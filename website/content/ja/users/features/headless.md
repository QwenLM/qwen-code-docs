# ヘッドレスモード

ヘッドレスモードを使用すると、対話的なUIなしにコマンドラインスクリプトや
自動化ツールからQwen Codeをプログラム的に実行できます。これは
スクリプティング、自動化、CI/CDパイプライン、およびAI搭載ツールの構築に最適です。

## 概要

ヘッドレスモードは、Qwen Codeに対するヘッドレスインターフェースを提供し、以下を実現します。

- コマンドライン引数または標準入力経由でのプロンプト受け入れ
- 構造化された出力（テキストまたはJSON）の返却
- ファイルリダイレクトおよびパイプのサポート
- 自動化およびスクリプティングワークフローの有効化
- エラーハンドリングのための一貫した終了コードの提供
- 複数ステップの自動化のために現在のプロジェクトにスコープされた以前のセッションの再開が可能

## 基本的な使用法

### 直接プロンプト

`--prompt`（または`-p`）フラグを使用してヘッドレスモードで実行します。

```bash
qwen --prompt "機械学習とは何ですか？"
```

### 標準入力からの入力

ターミナルからQwen Codeへ入力をパイプします。

```bash
echo "このコードを説明してください" | qwen
```

### ファイル入力との組み合わせ

ファイルから読み込んで Qwen Code で処理する:

```bash
cat README.md | qwen --prompt "このドキュメントを要約してください"
```

### 前回のセッションを再開（ヘッドレス）

ヘッドレススクリプトで現在のプロジェクトから会話コンテキストを再利用する:

```bash

# このプロジェクトの最も最近のセッションを継続して新しいプロンプトを実行
qwen --continue -p "テストを再実行して失敗を要約してください"

# 特定のセッション ID を直接再開（UI なし）
qwen --resume 123e4567-e89b-12d3-a456-426614174000 -p "後続のリファクタリングを適用してください"
```

> [!note]
>
> - セッションデータは `~/.qwen/projects/<sanitized-cwd>/chats` 配下のプロジェクトスコープな JSONL です。
> - 新しいプロンプトを送信する前に、会話履歴、ツール出力、チャット圧縮チェックポイントを復元します。

## 出力形式

Qwen Code は異なるユースケース向けに複数の出力形式をサポートしています:

### テキスト出力（デフォルト）

標準の人が読める形式の出力:

```bash
qwen -p "フランスの首都はどこですか？"
```

レスポンス形式:

```
フランスの首都はパリです。
```

### JSON出力

構造化されたデータをJSON配列として返します。すべてのメッセージはバッファリングされ、セッションが完了した時点で一緒に出力されます。この形式は、プログラムによる処理や自動化スクリプトに最適です。

JSON出力はメッセージオブジェクトの配列です。出力には複数のメッセージタイプが含まれます: システムメッセージ（セッション初期化）、アシスタントメッセージ（AIの応答）、および結果メッセージ（実行概要）。

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

Stream-JSON 形式は、実行中に発生したイベントに応じて即座に JSON メッセージを出力し、リアルタイム監視を可能にします。この形式では行区切り JSON を使用し、各行に完全な JSON オブジェクトが含まれます。

```bash
qwen -p "Explain TypeScript" --output-format stream-json
```

出力 (イベント発生時にストリーミング):

```json
{"type":"system","subtype":"session_start","uuid":"...","session_id":"..."}
{"type":"assistant","uuid":"...","session_id":"...","message":{...}}
{"type":"result","subtype":"success","uuid":"...","session_id":"..."}
```

`--include-partial-messages` と組み合わせると、リアルタイム UI 更新のために追加のストリームイベント (message_start、content_block_delta など) がリアルタイムに出力されます。

```bash
qwen -p "Write a Python script" --output-format stream-json --include-partial-messages
```

### 入力形式

`--input-format` パラメータは、Qwen Code が標準入力から入力をどのように受け取るかを制御します。

- **`text`** (デフォルト): stdin またはコマンドライン引数からの標準テキスト入力
- **`stream-json`**: 双方向通信のための stdin 経由の JSON メッセージプロトコル

> **注:** Stream-json 入力モードは現在開発中であり、SDK 統合を想定しています。これには `--output-format stream-json` の設定が必要です。

### ファイルリダイレクト

出力をファイルに保存するか、他のコマンドにパイプします。

```bash

# ファイルに保存
qwen -p "Docker を説明してください" > docker-explanation.txt
qwen -p "Docker を説明してください" --output-format json > docker-explanation.json

# ファイルに追記
qwen -p "詳細を追加" >> docker-explanation.txt

# 他のツールにパイプ
qwen -p "Kubernetes とは?" --output-format json | jq '.response'
qwen -p "マイクロサービスを説明してください" | wc -w
qwen -p "プログラミング言語を一覧表示" | grep -i "python"
```

# ストリームJSON出力によるリアルタイム処理
qwen -p "Dockerを説明してください" --output-format stream-json | jq '.type'
qwen -p "コードを書いてください" --output-format stream-json --include-partial-messages | jq '.event.type'
```

## 設定オプション

ヘッドレス使用のための主要コマンドラインオプション:

| オプション                     | 説明                                                    | 例                                                                      |
| ---------------------------- | ------------------------------------------------------- | ------------------------------------------------------------------------ |
| `--prompt`, `-p`             | ヘッドレスモードで実行                                  | `qwen -p "query"`                                                        |
| `--output-format`, `-o`      | 出力形式を指定 (text, json, stream-json)                | `qwen -p "query" --output-format json`                                   |
| `--input-format`             | 入力形式を指定 (text, stream-json)                      | `qwen --input-format text --output-format stream-json`                   |
| `--include-partial-messages` | stream-json 出力に部分的なメッセージを含める            | `qwen -p "query" --output-format stream-json --include-partial-messages` |
| `--debug`, `-d`              | デバッグモードを有効化                                  | `qwen -p "query" --debug`                                                |
| `--all-files`, `-a`          | コンテキストにすべてのファイルを含める                  | `qwen -p "query" --all-files`                                            |
| `--include-directories`      | 追加のディレクトリを含める                              | `qwen -p "query" --include-directories src,docs`                         |
| `--yolo`, `-y`               | すべてのアクションを自動承認                            | `qwen -p "query" --yolo`                                                 |
| `--approval-mode`            | 承認モードを設定                                        | `qwen -p "query" --approval-mode auto_edit`                              |
| `--continue`                 | このプロジェクトの最新セッションを再開                  | `qwen --continue -p "Pick up where we left off"`                         |
| `--resume [sessionId]`       | 特定のセッションを再開 (または対話的に選択)             | `qwen --resume 123e... -p "Finish the refactor"`                         |
| `--experimental-skills`      | 実験的なスキルを有効化 (`skill` ツールを登録)           | `qwen --experimental-skills -p "What Skills are available?"`             |

利用可能なすべての設定オプション、設定ファイル、環境変数の詳細については、[設定ガイド](../configuration/settings)を参照してください。

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
result=$(cat api/routes.js | qwen -p "これらのルート用のOpenAPI仕様を生成してください" --output-format json)
echo "$result" | jq -r '.response' > openapi.json
```

### バッチコード解析

```bash
for file in src/*.py; do
    echo "Analyzing $file..."
    result=$(cat "$file" | qwen -p "潜在的なバグを発見して改善提案をしてください" --output-format json)
    echo "$result" | jq -r '.response' > "reports/$(basename "$file").analysis"
    echo "$(basename "$file") の解析が完了しました" >> reports/progress.log
done
```

### PR コードレビュー

```bash
result=$(git diff origin/main...HEAD | qwen -p "これらの変更に含まれるバグ、セキュリティ問題、およびコード品質をレビューしてください" --output-format json)
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

### モデルおよびツール使用状況の追跡

```bash
result=$(qwen -p "このデータベーススキーマを説明してください" --include-directories db --output-format json)
total_tokens=$(echo "$result" | jq -r '.stats.models // {} | to_entries | map(.value.tokens.total) | add // 0')
models_used=$(echo "$result" | jq -r '.stats.models // {} | keys | join(", ") | if . == "" then "none" else . end')
tool_calls=$(echo "$result" | jq -r '.stats.tools.totalCalls // 0')
tools_used=$(echo "$result" | jq -r '.stats.tools.byName // {} | keys | join(", ") | if . == "" then "none" else . end')
echo "$(date): $total_tokens トークン, $tool_calls ツール呼び出し ($tools_used) を以下のモデルで使用: $models_used" >> usage.log
echo "$result" | jq -r '.response' > schema-docs.md
echo "最近の使用傾向:"
tail -5 usage.log
```

## リソース

- [CLI 設定](../configuration/settings#command-line-arguments) - 完全な設定ガイド
- [認証](../configuration/settings#environment-variables-for-api-access) - 認証のセットアップ
- [コマンド](../features/commands) - 対話型コマンドリファレンス
- [チュートリアル](../quickstart) - ステップバイステップの自動化ガイド