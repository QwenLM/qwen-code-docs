# ヘッドレスモード

ヘッドレスモードでは、インタラクティブな UI を一切使用せずに、コマンドラインスクリプトや自動化ツールから Qwen Code をプログラム的に実行できます。これは、スクリプト作成、自動化、CI/CD パイプライン、および AI 搭載ツールの構築に最適です。

## 概要

ヘッドレスモードは、Qwen Code に対するヘッドレスなインターフェースを提供します。具体的には以下の機能を備えています：

- コマンドライン引数または標準入力（stdin）経由でプロンプトを受け付けます
- 構造化された出力（テキストまたは JSON）を返します
- ファイルのリダイレクトおよびパイプ処理をサポートします
- 自動化およびスクリプトによるワークフローを可能にします
- エラー処理のための一貫した終了コードを提供します
- マルチステップの自動化に対応し、現在のプロジェクトにスコープを限定した以前のセッションを再開できます

## 基本的な使い方

### 直接プロンプト

ヘッドレスモードで実行するには、`--prompt`（または `-p`）フラグを使用します：

```bash
qwen --prompt "機械学習とは何ですか？"
```

### 標準入力（stdin）からの入力

ターミナルから Qwen Code へ入力をパイプで渡します：

```bash
echo "このコードを説明してください" | qwen
```

### ファイル入力との組み合わせ

ファイルから読み込んで Qwen Code で処理します：

```bash
cat README.md | qwen --prompt "このドキュメントを要約してください"
```

### 以前のセッションの再開（ヘッドレス）

ヘッドレススクリプト内で、現在のプロジェクトの会話コンテキストを再利用します：

```bash

# このプロジェクトの最新のセッションを継続し、新しいプロンプトを実行
qwen --continue -p "テストを再度実行し、失敗した項目を要約してください"

# 特定のセッション ID を直接再開（UI なし）
qwen --resume 123e4567-e89b-12d3-a456-426614174000 -p "後続のリファクタリングを適用してください"
```

> [!note]
>
> - セッションデータは、`~/.qwen/projects/<正規化されたカレントワーキングディレクトリ>/chats` 下のプロジェクト単位の JSONL 形式で保存されます。
> - 新しいプロンプトを送信する前に、会話履歴、ツール出力、およびチャット圧縮のチェックポイントを復元します。

## 出力形式

Qwen Code は、さまざまなユースケースに対応する複数の出力形式をサポートしています：

### テキスト出力（デフォルト）

標準の、人間が読み取れる出力形式：

```bash
qwen -p "フランスの首都はどこですか？"
```

応答形式：

```
フランスの首都はパリです。
```

### JSON 出力

構造化されたデータを JSON 配列として返します。すべてのメッセージはバッファリングされ、セッション完了時にまとめて出力されます。この形式は、プログラムによる処理や自動化スクリプトに最適です。

JSON 出力は、メッセージオブジェクトの配列です。出力には、システムメッセージ（セッション初期化時）、アシスタントメッセージ（AI の応答）、および結果メッセージ（実行の要約）の複数種類のメッセージが含まれます。

#### 使用例

```bash
qwen -p "フランスの首都は何ですか？" --output-format json
```

出力（実行終了時）：

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

Stream-JSON 形式では、実行中に発生した JSON メッセージを即座に出力します。これにより、リアルタイムでの監視が可能になります。この形式では、各行が完全な JSON オブジェクトである行区切り JSON（line-delimited JSON）が使用されます。

```bash
qwen -p "TypeScript を説明してください" --output-format stream-json
```

出力（イベント発生に応じてストリーミング）：

```json
{"type":"system","subtype":"session_start","uuid":"...","session_id":"..."}
{"type":"assistant","uuid":"...","session_id":"...","message":{...}}
{"type":"result","subtype":"success","uuid":"...","session_id":"..."}
```

`--include-partial-messages` オプションと組み合わせると、リアルタイムの UI 更新に対応するため、追加のストリームイベント（`message_start`、`content_block_delta` など）がリアルタイムで出力されます。

```bash
qwen -p "Python スクリプトを書いてください" --output-format stream-json --include-partial-messages
```

### 入力フォーマット

`--input-format` パラメーターは、Qwen Code が標準入力（stdin）から入力をどのように読み取るかを制御します。

- **`text`**（デフォルト）：標準入力（stdin）またはコマンドライン引数からの通常のテキスト入力  
- **`stream-json`**：双方向通信のための、標準入力（stdin）経由の JSON メッセージプロトコル  

> **注意:** `stream-json` 入力モードは現在開発中であり、SDK 統合を目的としています。このモードを使用するには、`--output-format stream-json` も併せて指定する必要があります。

### ファイルへのリダイレクト

出力をファイルに保存したり、他のコマンドにパイプで渡したりできます。

```bash

# ファイルに保存
qwen -p "Docker を説明してください" > docker-explanation.txt
qwen -p "Docker を説明してください" --output-format json > docker-explanation.json

# ファイルに追記
qwen -p "さらに詳細を追加してください" >> docker-explanation.txt

# 他のツールにパイプ
qwen -p "Kubernetes とは何ですか？" --output-format json | jq '.response'
qwen -p "マイクロサービスについて説明してください" | wc -w
qwen -p "プログラミング言語の一覧を表示してください" | grep -i "python"

# リアルタイム処理向けの Stream-JSON 出力
qwen -p "Docker を説明してください" --output-format stream-json | jq '.type'
qwen -p "コードを書いてください" --output-format stream-json --include-partial-messages | jq '.event.type'

## 設定オプション

ヘッドレス使用時の主なコマンドラインオプション：

| オプション                       | 説明                                                 | 例                                                                          |
| -------------------------------- | ---------------------------------------------------- | --------------------------------------------------------------------------- |
| `--prompt`, `-p`                 | ヘッドレスモードで実行                               | `qwen -p "クエリ"`                                                          |
| `--output-format`, `-o`          | 出力形式を指定（text、json、stream-json）             | `qwen -p "クエリ" --output-format json`                                     |
| `--input-format`                 | 入力形式を指定（text、stream-json）                  | `qwen --input-format text --output-format stream-json`                     |
| `--include-partial-messages`     | stream-json 出力に部分的なメッセージを含める         | `qwen -p "クエリ" --output-format stream-json --include-partial-messages`   |
| `--debug`, `-d`                  | デバッグモードを有効化                               | `qwen -p "クエリ" --debug`                                                  |
| `--all-files`, `-a`              | コンテキストにすべてのファイルを含める               | `qwen -p "クエリ" --all-files`                                              |
| `--include-directories`          | 追加のディレクトリを含める                           | `qwen -p "クエリ" --include-directories src,docs`                           |
| `--yolo`, `-y`                   | すべての操作を自動承認                               | `qwen -p "クエリ" --yolo`                                                   |
| `--approval-mode`                | 承認モードを設定                                     | `qwen -p "クエリ" --approval-mode auto_edit`                                |
| `--continue`                     | このプロジェクトの直近のセッションを再開           | `qwen --continue -p "中断したところから再開"`                               |
| `--resume [sessionId]`           | 特定のセッションを再開（または対話的に選択）         | `qwen --resume 123e... -p "リファクタリングを完了"`                         |

利用可能なすべての設定オプション、設定ファイル、環境変数の詳細については、[設定ガイド](../configuration/settings) を参照してください。

## 例

### コードレビュー

```bash
cat src/auth.py | qwen -p "この認証コードをセキュリティ上の問題についてレビューしてください" > security-review.txt
```

### コミットメッセージの生成

```bash
result=$(git diff --cached | qwen -p "これらの変更に対する簡潔なコミットメッセージを作成してください" --output-format json)
echo "$result" | jq -r '.response'
```

### API ドキュメント

```bash
result=$(cat api/routes.js | qwen -p "これらのルートに対する OpenAPI スペックを生成してください" --output-format json)
echo "$result" | jq -r '.response' > openapi.json
```

### バッチコード分析

```bash
for file in src/*.py; do
    echo "$file を分析中..."
    result=$(cat "$file" | qwen -p "潜在的なバグを特定し、改善策を提案してください" --output-format json)
    echo "$result" | jq -r '.response' > "reports/$(basename "$file").analysis"
    echo "$(basename "$file") の分析が完了しました" >> reports/progress.log
done
```

### PR のコードレビュー

```bash
result=$(git diff origin/main...HEAD | qwen -p "これらの変更をバグ、セキュリティ問題、およびコード品質の観点からレビューしてください" --output-format json)
echo "$result" | jq -r '.response' > pr-review.json
```

### ログ分析

```bash
grep "ERROR" /var/log/app.log | tail -20 | qwen -p "これらのエラーを分析し、根本原因と修正方法を提案してください" > error-analysis.txt
```

### リリースノートの生成

```bash
result=$(git log --oneline v1.0.0..HEAD | qwen -p "これらのコミットからリリースノートを生成してください" --output-format json)
response=$(echo "$result" | jq -r '.response')
echo "$response"
echo "$response" >> CHANGELOG.md
```

### モデルおよびツールの使用状況の追跡

```bash
result=$(qwen -p "このデータベーススキーマを説明してください" --include-directories db --output-format json)
total_tokens=$(echo "$result" | jq -r '.stats.models // {} | to_entries | map(.value.tokens.total) | add // 0')
models_used=$(echo "$result" | jq -r '.stats.models // {} | keys | join(", ") | if . == "" then "none" else . end')
tool_calls=$(echo "$result" | jq -r '.stats.tools.totalCalls // 0')
tools_used=$(echo "$result" | jq -r '.stats.tools.byName // {} | keys | join(", ") | if . == "" then "none" else . end')
echo "$(date): $total_tokens トークン、$tool_calls 回のツール呼び出し ($tools_used)、使用モデル: $models_used" >> usage.log
echo "$result" | jq -r '.response' > schema-docs.md
echo "最近の使用傾向:"
tail -5 usage.log
```

## リソース

- [CLI の設定](../configuration/settings#command-line-arguments) — 設定の完全ガイド
- [認証](../configuration/settings#environment-variables-for-api-access) — 認証のセットアップ
- [コマンド](../features/commands) — 対話型コマンドのリファレンス
- [チュートリアル](../quickstart) — ステップ・バイ・ステップの自動化ガイド