# ヘッドレスモード

ヘッドレスモードを使用すると、インタラクティブな UI を使用せずに、コマンドラインスクリプトや自動化ツールから Qwen Code をプログラムで実行できます。これは、スクリプティング、自動化、CI/CD パイプライン、および AI を活用したツールの構築に最適です。

## 概要

ヘッドレスモードは、Qwen Code へのヘッドレスインターフェースを提供します。

- コマンドライン引数または stdin 経由でプロンプトを受け付ける
- 構造化された出力（テキストまたは JSON）を返す
- ファイルのリダイレクトとパイプをサポートする
- 自動化とスクリプティングのワークフローを可能にする
- エラー処理のために一貫した終了コードを提供する
- 現在のプロジェクトにスコープされた以前のセッションを再開して、マルチステップの自動化を実現できる

## 基本的な使い方

### 直接プロンプト

ヘッドレスモードで実行するには、`--prompt`（または `-p`）フラグを使用します。

```bash
qwen --prompt "What is machine learning?"
```

### Stdin 入力

ターミナルから Qwen Code に入力をパイプします。

```bash
echo "Explain this code" | qwen
```

### ファイル入力との組み合わせ

ファイルから読み取り、Qwen Code で処理します。

```bash
cat README.md | qwen --prompt "Summarize this documentation"
```

### 以前のセッションの再開（ヘッドレス）

ヘッドレススクリプトで現在のプロジェクトの会話コンテキストを再利用します。

```bash
# このプロジェクトの最新のセッションを継続し、新しいプロンプトを実行する
qwen --continue -p "Run the tests again and summarize failures"

# 特定のセッション ID を直接再開する（UI なし）
qwen --resume 123e4567-e89b-12d3-a456-426614174000 -p "Apply the follow-up refactor"
```

> [!note]
>
> - セッションデータは、`~/.qwen/projects/<sanitized-cwd>/chats` 以下にプロジェクトスコープの JSONL として保存されます。
> - 新しいプロンプトを送信する前に、会話履歴、ツール出力、およびチャット圧縮のチェックポイントを復元します。

## メインセッションプロンプトのカスタマイズ

共有メモリファイルを編集せずに、1 回の CLI 実行のメインセッションシステムプロンプトを変更できます。

### 組み込みシステムプロンプトのオーバーライド

`--system-prompt` を使用して、現在の実行における Qwen Code の組み込みメインセッションプロンプトを置き換えます。

```bash
qwen -p "Review this patch" --system-prompt "You are a terse release reviewer. Report only blocking issues."
```

### 追加の指示の追記

`--append-system-prompt` を使用して、組み込みプロンプトを保持したまま、この実行に追加の指示を加えます。

```bash
qwen -p "Review this patch" --append-system-prompt "Be terse and focus on concrete findings."
```

カスタムのベースプロンプトと、実行固有の追加の指示を組み合わせたい場合は、両方のフラグを組み合わせることができます。

```bash
qwen -p "Summarize this repository" \
  --system-prompt "You are a migration planner." \
  --append-system-prompt "Return exactly three bullets."
```

> [!note]
>
> - `--system-prompt` は、現在の実行のメインセッションにのみ適用されます。
> - `QWEN.md` などの読み込まれたメモリおよびコンテキストファイルは、引き続き `--system-prompt` の後に追記されます。
> - `--append-system-prompt` は、組み込みプロンプトおよび読み込まれたメモリの後に適用され、`--system-prompt` と一緒に使用できます。

## 出力形式

Qwen Code は、さまざまなユースケースに合わせて複数の出力形式をサポートしています。

### テキスト出力（デフォルト）

標準の人間が読み取れる出力:

```bash
qwen -p "What is the capital of France?"
```

応答形式:

```
The capital of France is Paris.
```

### JSON 出力

構造化されたデータを JSON 配列として返します。すべてのメッセージはバッファリングされ、セッション完了時にまとめて出力されます。この形式は、プログラムによる処理や自動化スクリプトに最適です。

JSON 出力はメッセージオブジェクトの配列です。出力には、システムメッセージ（セッションの初期化）、アシスタントメッセージ（AI の応答）、および結果メッセージ（実行のサマリー）など、複数のメッセージタイプが含まれます。

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

Stream-JSON 形式は、実行中に JSON メッセージが発生するとすぐにそれを出力し、リアルタイムモニタリングを可能にします。この形式は行区切り JSON を使用し、各メッセージは 1 行の完全な JSON オブジェクトとなります。

```bash
qwen -p "Explain TypeScript" --output-format stream-json
```

出力（イベント発生時にストリーミング）:

```json
{"type":"system","subtype":"session_start","uuid":"...","session_id":"..."}
{"type":"assistant","uuid":"...","session_id":"...","message":{...}}
{"type":"result","subtype":"success","uuid":"...","session_id":"..."}
```

`--include-partial-messages` と組み合わせると、リアルタイムの UI 更新のために、追加のストリームイベント（message_start、content_block_delta など）がリアルタイムで出力されます。

```bash
qwen -p "Write a Python script" --output-format stream-json --include-partial-messages
```

### 入力形式

`--input-format` パラメータは、Qwen Code が標準入力から入力を消費する方法を制御します。

- **`text`**（デフォルト）: stdin またはコマンドライン引数からの標準テキスト入力
- **`stream-json`**: 双方向通信のための stdin 経由の JSON メッセージプロトコル

> **注:** Stream-json 入力モードは現在構築中であり、SDK 統合を目的としています。これには `--output-format stream-json` の設定が必要です。

### ファイルのリダイレクト

出力をファイルに保存するか、他のコマンドにパイプします。

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

# リアルタイム処理のための Stream-JSON 出力
qwen -p "Explain Docker" --output-format stream-json | jq '.type'
qwen -p "Write code" --output-format stream-json --include-partial-messages | jq '.event.type'
```

## 設定オプション

ヘッドレス使用のための主要なコマンドラインオプション:

| オプション                       | 説明                                                                                                                                                                                                                                                                                                                                                                                                                    | 例                                                                  |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------ |
| `--prompt`, `-p`             | ヘッドレスモードで実行する                                                                                                                                                                                                                                                                                                                                                                                                           | `qwen -p "query"`                                                        |
| `--output-format`, `-o`      | 出力形式を指定する（text, json, stream-json）                                                                                                                                                                                                                                                                                                                                                                                | `qwen -p "query" --output-format json`                                   |
| `--input-format`             | 入力形式を指定する（text, stream-json）                                                                                                                                                                                                                                                                                                                                                                                       | `qwen --input-format text --output-format stream-json`                   |
| `--include-partial-messages` | stream-json 出力に部分メッセージを含める                                                                                                                                                                                                                                                                                                                                                                                 | `qwen -p "query" --output-format stream-json --include-partial-messages` |
| `--system-prompt`            | この実行のメインセッションシステムプロンプトをオーバーライドする                                                                                                                                                                                                                                                                                                                                                                           | `qwen -p "query" --system-prompt "You are a terse reviewer."`            |
| `--append-system-prompt`     | この実行のメインセッションシステムプロンプトに追加の指示を追記する                                                                                                                                                                                                                                                                                                                                                       | `qwen -p "query" --append-system-prompt "Focus on concrete findings."`   |
| `--debug`, `-d`              | デバッグモードを有効にする                                                                                                                                                                                                                                                                                                                                                                                                              | `qwen -p "query" --debug`                                                |
| `--safe-mode`                | 問題を切り分けるために、すべてのカスタマイズ（コンテキストファイル、フック、拡張機能、skill、MCP サーバー、カスタムサブエージェント（組み込みサブエージェントのみロード）、権限ルール、設定由来の承認モードのオーバーライド、メモリ機能、サンドボックス設定）を無効にします。CLI フラグ `--yolo` と `--approval-mode` は引き続き有効です。[Troubleshooting](../support/troubleshooting) を参照してください。`QWEN_CODE_SAFE_MODE=true` で設定することもできます。 | `qwen -p "query" --safe-mode`                                            |
| `--model`, `-m`              | この実行に使用するモデル                                                                                                                                                                                                                                                                                                                                                                                                      | `qwen -p "query" --model qwen3-coder-plus`                               |
| `--include-directories`      | 追加のディレクトリを含める                                                                                                                                                                                                                                                                                                                                                                                                 | `qwen -p "query" --include-directories src,docs`                         |
| `--yolo`, `-y`               | すべてのアクションを自動承認する                                                                                                                                                                                                                                                                                                                                                                                                       | `qwen -p "query" --yolo`                                                 |
| `--approval-mode`            | 承認モードを設定する（`plan`, `default`, `auto-edit`, `auto`, `yolo`）                                                                                                                                                                                                                                                                                                                                                             | `qwen -p "query" --approval-mode auto-edit`                              |
| `--continue`                 | このプロジェクトの最新のセッションを再開する                                                                                                                                                                                                                                                                                                                                                                                | `qwen --continue -p "Pick up where we left off"`                         |
| `--resume [sessionId]`       | 特定のセッションを再開する（または対話的に選択する）                                                                                                                                                                                                                                                                                                                                                                            | `qwen --resume 123e... -p "Finish the refactor"`                         |
| `--max-session-turns`        | 実行中のユーザー/モデル/ツールのターン数の上限を設定する                                                                                                                                                                                                                                                                                                                                                                             | `qwen -p "..." --max-session-turns 30`                                   |
| `--max-wall-time`            | 経過時間（wall-clock）の予算。`90`（秒）、`30s`、`5m`、`1h`、`1.5h` を受け付ける                                                                                                                                                                                                                                                                                                                                                                 | `qwen -p "..." --max-wall-time 10m`                                      |
| `--max-tool-calls`           | 実行の累積ツール呼び出し予算                                                                                                                                                                                                                                                                                                                                                                                        | `qwen -p "..." --max-tool-calls 50`                                      |
利用可能なすべての設定オプション、設定ファイル、および環境変数の詳細については、[設定ガイド](../configuration/settings)を参照してください。

## 無人実行時の安全性

ヘッドレス / CI 実行で `--yolo`（または `--approval-mode=yolo`）を組み合わせると、`shell`、`write`、`edit` を含むすべてのツール呼び出しが自動承認されます。**`--yolo` はサンドボックスを有効にしません** — これらのツールはホストプロセスの権限レベルで実行されます。Qwen Code はサンドボックスが設定されていない状態でこの組み合わせを検出すると、起動時に stderr に 1 行の警告を出力します。トレードオフを確認した後は、`QWEN_CODE_SUPPRESS_YOLO_WARNING=1` で警告を抑制できます。

### 実行レベルのバジェット

Qwen Code は、無人実行が以下のしきい値のいずれかを超えたときに実行を中止できます。デフォルトはそれぞれ `-1`（無制限）です。いずれか 1 つを設定するだけで、暴走動作を制限できます。これらは SIGINT をすでに処理している同じ `AbortController` に対して協調的に適用されるため、バジェットによる中止は構造化された `FatalBudgetExceededError`（終了コード **55**）を出力します。これはターン上限の終了コード 53 や SIGINT の 130 とは区別されるため、CI スクリプトで理由に応じて分岐できます。

| フラグ | 設定キー | 制限対象 |
| --------------------- | -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--max-wall-time` | `model.maxWallTimeSeconds` | 実行全体の経過時間（壁時計時間）。フラグは `90`（秒）、`30s`、`5m`、`1h`、`1.5h`（小数単位をサポート）を受け付けます。最小は 1 秒です。1 秒未満の値はタイプミスとして拒否されます。設定値の単位は秒です。 |
| `--max-tool-calls` | `model.maxToolCalls` | メインの実行ループによってディスパッチされる累積のトップレベルツール呼び出し（成功_および_失敗をカウントします。モデルはエラー時にもトークンを消費します）。サブエージェント / 構造化出力の免除については、以下の「スコープ」を参照してください。 |
| `--max-session-turns` | `model.maxSessionTurns` | ユーザー/モデル/ツールのターン数。既存の機能です。上限超過時にコード 53 で終了します（バジェットによる終了 55 とは異なります）。 |

#### スコープ

- **`--max-tool-calls` はトップレベルのディスパッチのみをカウントします。** モデルが `agent` ツールを呼び出すと、そのディスパッチは **1** としてカウントされ、生成されたサブエージェントによって実行される内部ツール呼び出しはカウント**されません**。サブエージェントを介して作業を委任するモデルは、小さなトップレベルバジェットの下で無制限の内部作業を実行できてしまいます。より厳しい上限が必要な場合は、`--exclude-tools agent` と組み合わせてください。
- **`structured_output` は `--max-tool-calls` の対象外です。** `--json-schema` の下では、モデルの最終的な `structured_output` 呼び出しは実際の作業ではなく「完了」の契約です。そのため、`--max-tool-calls` に対してカウントされず、バジェット際での完了が誤って中止されることはありません。この免除は無条件です（Ajv の検証失敗を含む）。したがって、不正な出力の再試行ループに陥ったモデルは `--max-tool-calls` によって制限**されません**。再試行を制限するには、`--max-session-turns` または `--max-wall-time` と組み合わせてください。
- **`structured_output` は `--max-session-turns` の対象外ではあり**ません。このカウンターは既存の機能であり、最終的な契約を含むすべてのターンで加算されます。`--json-schema` の下で `N` 回の実際の作業ターンを許可したい場合は、`--max-session-turns` を `N+1` に設定してください。
- **シングルショットと `--input-format stream-json`:** stream-json 入力モードでは、デーモンは各ユーザーメッセージの開始時にバジェットカウンターをリセットします。バジェットはプロセスごとではなく、メッセージごとになります。
- **`qwen serve` / ACP セッション:** デーモンの ACP セッションパスは、現在 settings.json からの `--max-wall-time` / `--max-tool-calls` を参照**していません**。これらのバジェットは、シングルショットの `qwen -p` 実行と `--input-format stream-json` セッションにのみ適用されます。（`qwen serve` は、settings で `tools.approvalMode: 'yolo'` が設定されている場合、起動時に YOLO-no-sandbox 警告を出力します。）

### 推奨される組み合わせ

- **信頼された分離環境（一時的な CI ランナー、コンテナ）:** `qwen -p "..." --yolo --max-session-turns N --max-wall-time 10m --output-format json`。ターンバジェットと壁時計時間バジェットを固定することで、スタックしたエージェントが CI 時間を無駄に消費するのを防ぎ、実行後の使用状況 / ツール呼び出しの監査のために `--output-format json` を取得します。
- **ローカルマシンまたは共有インフラ:** `--sandbox` を渡す（または `QWEN_SANDBOX=1` を設定する）ことで、shell / write / edit ツールがサンドボックスイメージ内で実行されるようにします。
- **レートリミットでリトライする長時間実行 CI:** `QWEN_CODE_UNATTENDED_RETRY=1` を `--max-wall-time` と組み合わせます。リトライ環境変数は、一時的な 429 / 529 レスポンスを過ぎても実行を継続させます。壁時計時間バジェットは、継続的に失敗するプロバイダーがジョブを無期限に延長できないようにします。
- **制限付きの監査 / 探索:** 読み取り専用タスクの場合、`--max-tool-calls 25` はモデルが grep / read をどれだけ積極的に行えるかを制限します。制限を意味のあるものにするために、`--exclude-tools shell,write,edit` と組み合わせてください。

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

### モデルとツールの使用状況追跡

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

Qwen Code が CI/CD パイプラインまたはバックグラウンドデーモンとして実行されている場合、短い API 障害（レート制限や過負荷）によって数時間にわたるタスクが中断されるべきではありません。**永続リトライモード**は、サービスが回復するまで、Qwen Code に一時的な API エラーを無期限にリトライさせます。

### 動作の仕組み

- **一時的なエラーのみ**: HTTP 429（レート制限）および 529（過負荷）は無期限にリトライされます。他のエラー（400、500 など）は通常通り失敗します。
- **上限付きの指数バックオフ**: リトライ遅延は指数関数的に増加しますが、1 リトライあたり**5 分**に上限が設定されています。
- **ハートビートキープアライブ**: 長時間の待機中、CI ランナーが非アクティブのためにプロセスを強制終了するのを防ぐため、**30 秒**ごとに stderr にステータス行が出力されます。
- **グレースフルデグラデーション**: 一時的でないエラーおよびインタラクティブモードには完全に影響を与えません。

### 有効化

`QWEN_CODE_UNATTENDED_RETRY` 環境変数を `true` または `1`（厳密な一致、大文字と小文字を区別）に設定します。

```bash
export QWEN_CODE_UNATTENDED_RETRY=1
```

> [!important]
> 永続リトライには**明示的なオプトイン**が必要です。`CI=true` だけでは有効化**されません** — 高速失敗する CI ジョブを無限待機ジョブにサイレントに変更することは危険です。パイプライン設定で常に `QWEN_CODE_UNATTENDED_RETRY` を明示的に設定してください。

### 例

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

永続リトライ中、ハートビートメッセージは **stderr** に出力されます。

```
[qwen-code] Waiting for API capacity... attempt 3, retry in 45s
[qwen-code] Waiting for API capacity... attempt 3, retry in 15s
```

これらのメッセージは CI ランナーを生存させ、進捗をモニタリングできるようにします。これらは stdout には出力されないため、他のツールにパイプされる JSON 出力はクリーンなまま保たれます。

## リソース

- [CLI 設定](../configuration/settings#command-line-arguments) - 完全な設定ガイド
- [認証](../configuration/auth.md) - 認証の設定
- [コマンド](../features/commands) - インタラクティブコマンドリファレンス
- [チュートリアル](../quickstart) - 段階的な自動化ガイド