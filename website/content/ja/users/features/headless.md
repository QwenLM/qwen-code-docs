# ヘッドレスモード

ヘッドレスモードを使用すると、インタラクティブなUIなしで、コマンドラインスクリプトや自動化ツールからプログラムによってQwen Codeを実行できます。これは、スクリプト作成、自動化、CI/CDパイプライン、およびAIを活用したツールの構築に最適です。

## 概要

ヘッドレスモードは、以下の機能を提供するQwen Codeのヘッドレスインターフェースです：

- コマンドライン引数または標準入力からのプロンプトの受け付け
- 構造化出力（テキストまたはJSON）の返却
- ファイルリダイレクションとパイプのサポート
- 自動化とスクリプトワークフローの有効化
- エラーハンドリングのための一貫した終了コードの提供
- マルチステップ自動化のための現在のプロジェクトにスコープされた以前のセッションの再開

## 基本的な使い方

### 直接プロンプト

`--prompt`（または`-p`）フラグを使用してヘッドレスモードで実行します：

```bash
qwen --prompt "What is machine learning?"
```

### 標準入力

ターミナルからQwen Codeにパイプで入力します：

```bash
echo "Explain this code" | qwen
```

### ファイル入力との組み合わせ

ファイルから読み取り、Qwen Codeで処理します：

```bash
cat README.md | qwen --prompt "Summarize this documentation"
```

### 以前のセッションの再開（ヘッドレス）

ヘッドレススクリプトで現在のプロジェクトの会話コンテキストを再利用します：

```bash
# このプロジェクトの最新セッションを続けて、新しいプロンプトを実行
qwen --continue -p "Run the tests again and summarize failures"

# 特定のセッションIDを直接再開（UIなし）
qwen --resume 123e4567-e89b-12d3-a456-426614174000 -p "Apply the follow-up refactor"
```

> [!note]
>
> - セッションデータは`~/.qwen/projects/<サニタイズされたカレントディレクトリ>/chats`以下にプロジェクトスコープのJSONLとして保存されます。
> - 新しいプロンプトを送信する前に、会話履歴、ツール出力、チャット圧縮チェックポイントが復元されます。

## メインセッションプロンプトのカスタマイズ

共有メモリファイルを編集せずに、単一のCLI実行に対してメインセッションのシステムプロンプトを変更できます。

### 組み込みシステムプロンプトの上書き

`--system-prompt`を使用して、現在の実行においてQwen Codeの組み込みメインセッションプロンプトを置き換えます：

```bash
qwen -p "Review this patch" --system-prompt "You are a terse release reviewer. Report only blocking issues."
```

### 追加指示の追加

`--append-system-prompt`を使用して、組み込みプロンプトを維持しつつ、この実行用の追加指示を追加します：

```bash
qwen -p "Review this patch" --append-system-prompt "Be terse and focus on concrete findings."
```

両方のフラグを組み合わせて、カスタムベースプロンプトと実行固有の追加指示を同時に指定できます：

```bash
qwen -p "Summarize this repository" \
  --system-prompt "You are a migration planner." \
  --append-system-prompt "Return exactly three bullets."
```

> [!note]
>
> - `--system-prompt`は現在の実行のメインセッションにのみ適用されます。
> - `QWEN.md`などのロードされたメモリとコンテキストファイルは、`--system-prompt`の後にも追加されます。
> - `--append-system-prompt`は組み込みプロンプトとロードされたメモリの後に適用され、`--system-prompt`と一緒に使用できます。

## 出力フォーマット

Qwen Codeはさまざまなユースケースに対応する複数の出力フォーマットをサポートしています：

### テキスト出力（デフォルト）

標準の人間可読出力：

```bash
qwen -p "What is the capital of France?"
```

応答フォーマット：

```
The capital of France is Paris.
```

### JSON出力

構造化データをJSON配列として返します。すべてのメッセージはバッファリングされ、セッション完了時に一緒に出力されます。このフォーマットはプログラムによる処理や自動化スクリプトに最適です。

JSON出力はメッセージオブジェクトの配列です。出力には複数のメッセージタイプが含まれます：システムメッセージ（セッション初期化）、アシスタントメッセージ（AI応答）、結果メッセージ（実行サマリー）。

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

### Stream-JSON出力

Stream-JSONフォーマットは、実行中にJSONメッセージをリアルタイムで出力し、即時監視を可能にします。このフォーマットは改行区切りのJSONを使用し、各メッセージは1行に完全なJSONオブジェクトとして出力されます。

```bash
qwen -p "Explain TypeScript" --output-format stream-json
```

出力（イベント発生ごとにストリーミング）：

```json
{"type":"system","subtype":"session_start","uuid":"...","session_id":"..."}
{"type":"assistant","uuid":"...","session_id":"...","message":{...}}
{"type":"result","subtype":"success","uuid":"...","session_id":"..."}
```

`--include-partial-messages`と組み合わせると、リアルタイムUI更新のために追加のストリームイベント（message_start、content_block_deltaなど）がリアルタイムで出力されます。

```bash
qwen -p "Write a Python script" --output-format stream-json --include-partial-messages
```

### 入力フォーマット

`--input-format`パラメータは、Qwen Codeが標準入力から入力をどのように消費するかを制御します：

- **`text`**（デフォルト）：標準入力またはコマンドライン引数からの標準テキスト入力
- **`stream-json`**：双方向通信のための標準入力経由のJSONメッセージプロトコル

> **注記：** stream-json入力モードは現在構築中であり、SDK統合を目的としています。`--output-format stream-json`を設定する必要があります。

### ファイルリダイレクション

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

# リアルタイム処理のためのStream-JSON出力
qwen -p "Explain Docker" --output-format stream-json | jq '.type'
qwen -p "Write code" --output-format stream-json --include-partial-messages | jq '.event.type'
```

## 設定オプション

ヘッドレス使用時の主要なコマンドラインオプション：

| オプション                       | 説明                                                              | 例                                                                    |
| -------------------------------- | ----------------------------------------------------------------- | ---------------------------------------------------------------------- |
| `--prompt`, `-p`                 | ヘッドレスモードで実行                                            | `qwen -p "query"`                                                      |
| `--output-format`, `-o`          | 出力フォーマットを指定（text, json, stream-json）                 | `qwen -p "query" --output-format json`                                 |
| `--input-format`                 | 入力フォーマットを指定（text, stream-json）                       | `qwen --input-format text --output-format stream-json`                 |
| `--include-partial-messages`     | stream-json出力に部分メッセージを含める                           | `qwen -p "query" --output-format stream-json --include-partial-messages` |
| `--system-prompt`                | この実行のメインセッションシステムプロンプトを上書き              | `qwen -p "query" --system-prompt "You are a terse reviewer."`          |
| `--append-system-prompt`         | この実行のメインセッションシステムプロンプトに追加指示を追加      | `qwen -p "query" --append-system-prompt "Focus on concrete findings."` |
| `--debug`, `-d`                  | デバッグモードを有効化                                            | `qwen -p "query" --debug`                                              |
| `--all-files`, `-a`              | すべてのファイルをコンテキストに含める                            | `qwen -p "query" --all-files`                                          |
| `--include-directories`          | 追加のディレクトリを含める                                        | `qwen -p "query" --include-directories src,docs`                       |
| `--yolo`, `-y`                   | すべてのアクションを自動承認                                      | `qwen -p "query" --yolo`                                               |
| `--approval-mode`                | 承認モードを設定                                                  | `qwen -p "query" --approval-mode auto_edit`                            |
| `--continue`                     | このプロジェクトの最新セッションを再開                            | `qwen --continue -p "Pick up where we left off"`                       |
| `--resume [sessionId]`           | 特定のセッションを再開（または対話的に選択）                      | `qwen --resume 123e... -p "Finish the refactor"`                       |
| `--max-session-turns`            | 実行におけるユーザー/モデル/ツールのターン数を制限                | `qwen -p "..." --max-session-turns 30`                                 |
| `--max-wall-time`                | ウォールクロック予算；`90`（秒）、`30s`、`5m`、`1h`、`1.5h`を許可 | `qwen -p "..." --max-wall-time 10m`                                    |
| `--max-tool-calls`               | 実行における累積ツール呼び出し予算                                | `qwen -p "..." --max-tool-calls 50`                                    |

利用可能なすべての設定オプション、設定ファイル、環境変数の詳細については、[設定ガイド](../configuration/settings)を参照してください。

## 無人実行時の安全性

ヘッドレス/CI実行と`--yolo`（または`--approval-mode=yolo`）を組み合わせると、`shell`、`write`、`edit`を含むすべてのツール呼び出しが自動承認されます。**`--yolo`はサンドボックスを有効にしません** — これらのツールはホストプロセスの権限レベルで実行されます。Qwen Codeがこの組み合わせを検出し、サンドボックスが設定されていない場合、起動時にstderrに1行の警告を出力します。トレードオフを確認した上で、`QWEN_CODE_SUPPRESS_YOLO_WARNING=1`を設定して警告を抑制できます。

### 実行レベルの予算

Qwen Codeは、以下のいずれかのしきい値を超えた場合に無人実行を中断できます。各予算はデフォルトで`-1`（無制限）です。ひとつでも設定すれば、暴走動作を抑えるのに十分です。これらは協調的に、SIGINTと同じ`AbortController`に対して適用されるため、予算による中断は構造化された`FatalBudgetExceededError`（終了コード**55**）を出力します。これはターンキャップの終了コード53やSIGINTの130とは異なるため、CIスクリプトが理由に応じて分岐できます。

| フラグ                  | 設定キー                    | 制限内容                                                                                                                                                                                                                                                                                       |
| ----------------------- | --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--max-wall-time`       | `model.maxWallTimeSeconds`  | 実行全体のウォールクロック時間。フラグは`90`（秒）、`30s`、`5m`、`1h`、`1.5h`（小数単位対応）を受け付けます。最小1秒 — 1秒未満の値はタイプミスとして拒否されます。設定は秒単位。                                                                                                                |
| `--max-tool-calls`      | `model.maxToolCalls`        | メイン実行ループがディスパッチする累積トップレベルツール呼び出し（成功と失敗の両方をカウント — エラー時にもモデルはトークンを消費します）。以下の「スコープ」を参照し、サブエージェント/構造化出力の除外を確認してください。                                                                    |
| `--max-session-turns`   | `model.maxSessionTurns`     | ユーザー/モデル/ツールのターン数。既存の設定。超過時は終了コード53で終了します（予算超過の55とは異なります）。                                                                                                                                                                                  |

#### スコープ

- **`--max-tool-calls`はトップレベルのディスパッチのみをカウントします。** モデルが`agent`ツールを呼び出した場合、そのディスパッチは**1**としてカウントされます。起動されたサブエージェントが実行する内部ツール呼び出しはカウント**されません**。サブエージェントに作業を委譲するモデルは、小さなトップレベル予算の下で無制限の内部作業を行う可能性があります。より厳しい制限が必要な場合は、`--exclude-tools agent`を組み合わせてください。
- **`structured_output`は`--max-tool-calls`の対象外です。** `--json-schema`のもとでは、モデルの最終的な`structured_output`呼び出しは「完了」の契約であり、実際の作業ではありません。そのため、予算ぎりぎりの完了が誤検出で中断されないように、`--max-tool-calls`の対象外となります。この除外は無条件です（失敗したAjv検証も含む）。したがって、不正な出力のリトライループに陥ったモデルは`--max-tool-calls`で制限されません。リトライを制限するには`--max-session-turns`または`--max-wall-time`を組み合わせてください。
- **`structured_output`は`--max-session-turns`の対象外ではありません。** そのカウンターは既存のもので、最終契約を含むすべてのターンごとに増加します。`--json-schema`のもとで`N`回の実作業ターンを許可したい場合は、`--max-session-turns`を`N+1`に設定してください。
- **単発実行 vs `--input-format stream-json`：** stream-json入力モードでは、デーモンは各ユーザーメッセージの開始時に予算カウンターをリセットします。予算はプロセス単位ではなく、メッセージ単位です。
- **`qwen serve` / ACPセッション：** デーモンのACPセッションパスは、現在`settings.json`の`--max-wall-time` / `--max-tool-calls`を参照しません。これらの予算は、単発の`qwen -p`実行と`--input-format stream-json`セッションにのみ適用されます。（`qwen serve`は、設定で`tools.approvalMode: 'yolo'`が設定されている場合、起動時にYOLOサンドボックスなしの警告を出力します。）

### 推奨される組み合わせ

- **信頼された隔離環境（エフェメラルCIランナー、コンテナ）：** `qwen -p "..." --yolo --max-session-turns N --max-wall-time 10m --output-format json`。ターン予算とウォールクロック予算を設定することで、スタックしたエージェントがCI分を消費し尽くすのを防ぎ、`--output-format json`で実行後の使用状況やツール呼び出しの監査を取得します。
- **ローカルマシンまたは共有インフラ：** `--sandbox`も指定するか（または`QWEN_SANDBOX=1`を設定）、shell/write/editツールがサンドボックスイメージ内で実行されるようにします。
- **リトライ可能な長時間実行CI：** `QWEN_CODE_UNATTENDED_RETRY=1`と`--max-wall-time`を組み合わせます。リトライ環境変数により、一時的な429/529応答があっても実行を継続します。ウォールクロック予算により、永続的に失敗するプロバイダーがジョブを無制限に延長することを防ぎます。
- **制限付きの監査/探索：** 読み取り専用タスクでは、`--max-tool-calls 25`により、モデルがgrep/readを行う頻度を制限します。`--exclude-tools shell,write,edit`を組み合わせて制限を意味のあるものにします。

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

## 永続的リトライモード

Qwen CodeがCI/CDパイプラインやバックグラウンドデーモンとして実行される場合、短時間のAPI障害（レート制限や過負荷）によって長時間のタスクが中断されるべきではありません。**永続的リトライモード**は、サービスが回復するまで、Qwen Codeが一時的なAPIエラーを無期限にリトライします。

### 動作仕様

- **一時的なエラーのみ：** HTTP 429（レート制限）および529（過負荷）は無期限にリトライされます。その他のエラー（400、500など）は通常どおり失敗します。
- **キャップ付き指数バックオフ：** リトライ遅延は指数関数的に増加しますが、リトライごとに最大**5分**でキャップされます。
- **ハートビートキープアライブ：** 長い待機中、30秒ごとにステータス行がstderrに出力され、CIランナーが非アクティブのためにプロセスを強制終了するのを防ぎます。
- **グレースフルデグラデーション：** 非一時的なエラーやインタラクティブモードは完全に影響を受けません。

### 有効化

環境変数`QWEN_CODE_UNATTENDED_RETRY`を`true`または`1`に設定します（厳密一致、大文字小文字区別）：

```bash
export QWEN_CODE_UNATTENDED_RETRY=1
```

> [!important]
> 永続的リトライには**明示的なオプトイン**が必要です。`CI=true`だけでは**有効になりません** — 高速失敗のCIジョブを無期限待機ジョブに静かに変更するのは危険です。パイプライン設定で常に`QWEN_CODE_UNATTENDED_RETRY`を明示的に設定してください。

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

永続的リトライ中、ハートビートメッセージが**stderr**に出力されます：

```
[qwen-code] Waiting for API capacity... attempt 3, retry in 45s
[qwen-code] Waiting for API capacity... attempt 3, retry in 15s
```

これらのメッセージによりCIランナーが存続し、進捗状況を監視できます。これらはstdoutには表示されないため、他のツールにパイプされたJSON出力はクリーンな状態が保たれます。

## リソース

- [CLI設定](../configuration/settings#command-line-arguments) - 完全な設定ガイド
- [認証](../configuration/auth.md) - 認証の設定
- [コマンド](../features/commands) - インタラクティブコマンドリファレンス
- [チュートリアル](../quickstart) - ステップバイステップの自動化ガイド