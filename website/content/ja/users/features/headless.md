---
description: "Qwen Code Headless モードで非対話型の AI コーディングタスクを実行し、CI/CD、スクリプト、バッチ分析、自動化に活用できます。"
---

# ヘッドレスモード

ヘッドレスモードを使用すると、インタラクティブな UI なしで、コマンドラインスクリプトや自動化ツールからプログラム的に Qwen Code を実行できます。スクリプティング、自動化、CI/CD パイプライン、AI 駆動ツールの構築に最適です。

## 概要

ヘッドレスモードは、以下の機能を提供する Qwen Code のヘッドレスインターフェースです：

- コマンドライン引数または stdin 経由でプロンプトを受け付ける
- 構造化された出力（テキストまたは JSON）を返す
- ファイルのリダイレクトとパイプ処理をサポートする
- 自動化およびスクリプティングワークフローを可能にする
- エラー処理のために一貫した終了コードを提供する
- 複数ステップの自動化のために、現在のプロジェクトにスコープされた以前のセッションを再開できる

## 基本的な使い方

### 直接プロンプト

ヘッドレスモードで実行するには、`--prompt`（または `-p`）フラグを使用します：

```bash
qwen --prompt "What is machine learning?"
```

### Stdin 入力

ターミナルから Qwen Code に入力をパイプします：

```bash
echo "Explain this code" | qwen
```

### ファイル入力との組み合わせ

ファイルから読み取り、Qwen Code で処理します：

```bash
cat README.md | qwen --prompt "Summarize this documentation"
```

### 以前のセッションの再開（ヘッドレス）

ヘッドレススクリプトで、現在のプロジェクトの会話コンテキストを再利用します：

```bash
# Continue the most recent session for this project and run a new prompt
qwen --continue -p "Run the tests again and summarize failures"

# Resume a specific session ID directly (no UI)
qwen --resume 123e4567-e89b-12d3-a456-426614174000 -p "Apply the follow-up refactor"
```

> [!note]
>
> - セッションデータは、`~/.qwen/projects/<sanitized-cwd>/chats` 配下のプロジェクトスコープの JSONL として保存されます。
> - 新しいプロンプトを送信する前に、会話履歴、ツール出力、チャット圧縮チェックポイントを復元します。

## メインセッションプロンプトのカスタマイズ

共有メモリファイルを編集することなく、単一の CLI 実行に対してメインセッションのシステムプロンプトを変更できます。

### 組み込みシステムプロンプトの上書き

現在の実行で Qwen Code の組み込みメインセッションプロンプトを置き換えるには、`--system-prompt` を使用します：

```bash
qwen -p "Review this patch" --system-prompt "You are a terse release reviewer. Report only blocking issues."
```

### 追加指示の付加

組み込みプロンプトを維持したまま、この実行用の追加指示を付加するには、`--append-system-prompt` を使用します：

```bash
qwen -p "Review this patch" --append-system-prompt "Be terse and focus on concrete findings."
```

カスタムベースプロンプトと実行固有の追加指示の両方を組み合わせたい場合は、両方のフラグを組み合わせることができます：

```bash
qwen -p "Summarize this repository" \
  --system-prompt "You are a migration planner." \
  --append-system-prompt "Return exactly three bullets."
```

> [!note]
>
> - `--system-prompt` は、現在の実行のメインセッションにのみ適用されます。
> - `QWEN.md` などの読み込まれたメモリおよびコンテキストファイルは、`--system-prompt` の後に引き続き追加されます。
> - `--append-system-prompt` は組み込みプロンプトおよび読み込まれたメモリの後に適用され、`--system-prompt` と組み合わせて使用できます。

## 出力フォーマット

Qwen Code は、さまざまなユースケースに対応する複数の出力フォーマットをサポートしています：

### テキスト出力（デフォルト）

標準の人間が読める形式の出力：

```bash
qwen -p "What is the capital of France?"
```

レスポンスフォーマット：

```
The capital of France is Paris.
```

### JSON 出力

構造化データを JSON 配列として返します。すべてのメッセージはバッファリングされ、セッション完了時にまとめて出力されます。このフォーマットは、プログラムによる処理や自動化スクリプトに最適です。

JSON 出力はメッセージオブジェクトの配列です。出力には複数のメッセージタイプが含まれます：システムメッセージ（セッション初期化）、アシスタントメッセージ（AI レスポンス）、および結果メッセージ（実行サマリー）。

#### 使用例

```bash
qwen -p "What is the capital of France?" --output-format json
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

Stream-JSON フォーマットは、実行中に発生した JSON メッセージを即座に出力し、リアルタイムモニタリングを可能にします。このフォーマットは行区切りの JSON を使用し、各メッセージが単一行の完全な JSON オブジェクトとなります。

```bash
qwen -p "Explain TypeScript" --output-format stream-json
```

出力（イベント発生時のストリーミング）：

```json
{"type":"system","subtype":"session_start","uuid":"...","session_id":"..."}
{"type":"assistant","uuid":"...","session_id":"...","message":{...}}
{"type":"result","subtype":"success","uuid":"...","session_id":"..."}
```

`--include-partial-messages` と組み合わせると、リアルタイム UI 更新のために追加のストリームイベント（`message_start`、`content_block_delta` など）がリアルタイムで出力されます。

```bash
qwen -p "Write a Python script" --output-format stream-json --include-partial-messages
```

### 入力フォーマット

`--input-format` パラメータは、Qwen Code が標準入力から入力をどのように消費するかを制御します：

- **`text`**（デフォルト）：stdin またはコマンドライン引数からの標準テキスト入力
- **`stream-json`**：双方向通信のための stdin 経由の JSON メッセージプロトコル

> **注：** Stream-json 入力モードは現在構築中であり、SDK 統合を目的としています。`--output-format stream-json` の設定が必要です。

### ファイルリダイレクト

出力をファイルに保存するか、他のコマンドにパイプします：

```bash
# Save to file
qwen -p "Explain Docker" > docker-explanation.txt
qwen -p "Explain Docker" --output-format json > docker-explanation.json

# Append to file
qwen -p "Add more details" >> docker-explanation.txt

# Pipe to other tools
qwen -p "What is Kubernetes?" --output-format json | jq '.response'
qwen -p "Explain microservices" | wc -w
qwen -p "List programming languages" | grep -i "python"

# Stream-JSON output for real-time processing
qwen -p "Explain Docker" --output-format stream-json | jq '.type'
qwen -p "Write code" --output-format stream-json --include-partial-messages | jq '.event.type'
```

## 設定オプション

ヘッドレス使用のための主要なコマンドラインオプション：

| オプション                       | 説明                                                              | 例                                                                  |
| ---------------------------- | ------------------------------------------------------------------------ | ------------------------------------------------------------------------ |
| `--prompt`, `-p`             | ヘッドレスモードで実行する                                                     | `qwen -p "query"`                                                        |
| `--output-format`, `-o`      | 出力フォーマットを指定する（text, json, stream-json）                          | `qwen -p "query" --output-format json`                                   |
| `--input-format`             | 入力フォーマットを指定する（text, stream-json）                                 | `qwen --input-format text --output-format stream-json`                   |
| `--include-partial-messages` | stream-json 出力に部分的なメッセージを含める                           | `qwen -p "query" --output-format stream-json --include-partial-messages` |
| `--system-prompt`            | この実行のメインセッションシステムプロンプトを上書きする                     | `qwen -p "query" --system-prompt "You are a terse reviewer."`            |
| `--append-system-prompt`     | この実行のメインセッションシステムプロンプトに追加指示を付加する | `qwen -p "query" --append-system-prompt "Focus on concrete findings."`   |
| `--debug`, `-d`              | デバッグモードを有効にする                                                        | `qwen -p "query" --debug`                                                |
| `--all-files`, `-a`          | コンテキストにすべてのファイルを含める                                             | `qwen -p "query" --all-files`                                            |
| `--include-directories`      | 追加のディレクトリを含める                                           | `qwen -p "query" --include-directories src,docs`                         |
| `--yolo`, `-y`               | すべてのアクションを自動承認する                                                 | `qwen -p "query" --yolo`                                                 |
| `--approval-mode`            | 承認モードを設定する                                                        | `qwen -p "query" --approval-mode auto_edit`                              |
| `--continue`                 | このプロジェクトの最新のセッションを再開する                          | `qwen --continue -p "Pick up where we left off"`                         |
| `--resume [sessionId]`       | 特定のセッションを再開する（または対話的に選択）                      | `qwen --resume 123e... -p "Finish the refactor"`                         |

利用可能なすべての設定オプション、設定ファイル、環境変数の詳細については、[設定ガイド](../configuration/settings) を参照してください。

## 使用例

### コードレビュー

```bash
cat src/auth.py | qwen -p "Review this authentication code for security issues" > security-review.txt
```

### コミットメッセージの生成

```bash
result=$(git diff --cached | qwen -p "Write a concise commit message for these changes" --output-format json)
echo "$result" | jq -r '.response'
```

### API ドキュメント

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

### PR コードレビュー

```bash
result=$(git diff origin/main...HEAD | qwen -p "Review these changes for bugs, security issues, and code quality" --output-format json)
echo "$result" | jq -r '.response' > pr-review.json
```

### ログ分析

```bash
grep "ERROR" /var/log/app.log | tail -20 | qwen -p "Analyze these errors and suggest root cause and fixes" > error-analysis.txt
```

### リリースノートの生成

```bash
result=$(git log --oneline v1.0.0..HEAD | qwen -p "Generate release notes from these commits" --output-format json)
response=$(echo "$result" | jq -r '.response')
echo "$response"
echo "$response" >> CHANGELOG.md
```

### モデルおよびツールの使用状況追跡

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

## 永続リトライモード

Qwen Code が CI/CD パイプラインやバックグラウンドデーモンとして実行されている場合、一時的な API 停止（レート制限または過負荷）によって数時間かかるタスクが中断されるべきではありません。**永続リトライモード**を使用すると、サービスが回復するまで、Qwen Code が一時的な API エラーを無期限にリトライします。

### 動作原理

- **一時的なエラーのみ**: HTTP 429（レート制限）および 529（過負荷）は無期限にリトライされます。その他のエラー（400、500 など）は通常通り失敗します。
- **上限付き指数バックオフ**: リトライ遅延は指数関数的に増加しますが、リトライごとに **5 分** で上限が設定されます。
- **ハートビートキープアライブ**: 長時間の待機中、非アクティブによる CI ランナーのプロセス強制終了を防ぐため、ステータス行が **30 秒** ごとに stderr に出力されます。
- **グレースフルデグラデーション**: 一時的でないエラーおよびインタラクティブモードは完全に影響を受けません。

### 有効化

`QWEN_CODE_UNATTENDED_RETRY` 環境変数を `true` または `1` に設定します（厳密な一致、大文字小文字を区別）：

```bash
export QWEN_CODE_UNATTENDED_RETRY=1
```

> [!important]
> 永続リトライには**明示的なオプトイン**が必要です。`CI=true` だけでは有効化され**ません**——高速失敗する CI ジョブを無限待機ジョブに静かに変換するのは危険です。パイプライン設定では常に `QWEN_CODE_UNATTENDED_RETRY` を明示的に設定してください。

### 使用例

#### GitHub Actions

```yaml
- name: Automated code review
  env:
    QWEN_CODE_UNATTENDED_RETRY: '1'
  run: |
    qwen -p "Review all files in src/ for security issues" \
      --output-format json \
      --yolo > review.json
```

#### 夜間バッチ処理

```bash
export QWEN_CODE_UNATTENDED_RETRY=1
qwen -p "Migrate all callback-style functions to async/await in src/" --yolo
```

#### バックグラウンドデーモン

```bash
QWEN_CODE_UNATTENDED_RETRY=1 nohup qwen -p "Audit all dependencies for known CVEs" \
  --output-format json > audit.json 2> audit.log &
```

### モニタリング

永続リトライ中、ハートビートメッセージが **stderr** に出力されます：

```
[qwen-code] Waiting for API capacity... attempt 3, retry in 45s
[qwen-code] Waiting for API capacity... attempt 3, retry in 15s
```

これらのメッセージは CI ランナーを維持し、進捗をモニタリングできるようにします。stdout には表示されないため、他のツールにパイプされる JSON 出力はクリーンなままです。

## リソース

- [CLI 設定](../configuration/settings#command-line-arguments) - 完全な設定ガイド
- [認証](../configuration/settings#environment-variables-for-api-access) - 認証の設定
- [コマンド](../features/commands) - インタラクティブコマンドリファレンス
- [チュートリアル](../quickstart) - ステップバイステップの自動化ガイド