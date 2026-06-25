# ヘッドレスモード

ヘッドレスモードを使用すると、対話型 UI を介さずに、コマンドラインスクリプトや自動化ツールから Qwen Code をプログラム的に実行できます。スクリプティング、自動化、CI/CD パイプライン、AI 搭載ツールの構築に最適です。

## 概要

ヘッドレスモードは Qwen Code へのヘッドレスインターフェースを提供し、以下の機能を備えています。

- コマンドライン引数または stdin からプロンプトを受け取る
- 構造化された出力（テキストまたは JSON）を返す
- ファイルリダイレクトとパイプをサポート
- 自動化およびスクリプティングワークフローを有効化
- エラーハンドリングのための一貫した終了コードを提供
- 複数ステップの自動化のために、現在のプロジェクトにスコープされた前回のセッションを再開可能

## 基本的な使い方

### 直接プロンプト

`--prompt`（または `-p`）フラグを使用してヘッドレスモードで実行します。

```bash
qwen --prompt "What is machine learning?"
```

### 標準入力

ターミナルから Qwen Code にパイプで入力を渡します。

```bash
echo "Explain this code" | qwen
```

### ファイル入力との組み合わせ

ファイルを読み込んで Qwen Code で処理します。

```bash
cat README.md | qwen --prompt "Summarize this documentation"
```

### 前回のセッションの再開（ヘッドレス）

ヘッドレススクリプトで現在のプロジェクトの会話コンテキストを再利用します。

```bash
# このプロジェクトの最新セッションを引き継いで新しいプロンプトを実行する
qwen --continue -p "Run the tests again and summarize failures"

# 特定のセッション ID を直接再開する（UI なし）
qwen --resume 123e4567-e89b-12d3-a456-426614174000 -p "Apply the follow-up refactor"
```

> [!note]
>
> - セッションデータはプロジェクトスコープの JSONL として `~/.qwen/projects/<sanitized-cwd>/chats` に保存されます。
> - 新しいプロンプトを送信する前に、会話履歴、ツール出力、チャット圧縮チェックポイントを復元します。

## メインセッションプロンプトのカスタマイズ

共有メモリファイルを編集せずに、単一の CLI 実行でメインセッションのシステムプロンプトを変更できます。

### 組み込みシステムプロンプトの上書き

`--system-prompt` を使用して、現在の実行で Qwen Code の組み込みメインセッションプロンプトを置き換えます。

```bash
qwen -p "Review this patch" --system-prompt "You are a terse release reviewer. Report only blocking issues."
```

### 追加指示の付加

`--append-system-prompt` を使用して、組み込みプロンプトを維持しながら今回の実行に追加指示を加えます。

```bash
qwen -p "Review this patch" --append-system-prompt "Be terse and focus on concrete findings."
```

カスタムベースプロンプトと実行固有の追加指示を組み合わせる場合は、両方のフラグを使用できます。

```bash
qwen -p "Summarize this repository" \
  --system-prompt "You are a migration planner." \
  --append-system-prompt "Return exactly three bullets."
```

> [!note]
>
> - `--system-prompt` は現在の実行のメインセッションにのみ適用されます。
> - `QWEN.md` などのロードされたメモリおよびコンテキストファイルは、`--system-prompt` の後に引き続き付加されます。
> - `--append-system-prompt` は組み込みプロンプトとロードされたメモリの後に適用され、`--system-prompt` と併用できます。

## 出力フォーマット

Qwen Code はユースケースに応じた複数の出力フォーマットをサポートしています。

### テキスト出力（デフォルト）

標準的な人間が読みやすい出力です。

```bash
qwen -p "What is the capital of France?"
```

レスポンスフォーマット:

```
The capital of France is Paris.
```

### JSON 出力

構造化データを JSON 配列として返します。すべてのメッセージはバッファリングされ、セッション完了時にまとめて出力されます。このフォーマットはプログラムによる処理や自動化スクリプトに最適です。

JSON 出力はメッセージオブジェクトの配列です。出力には複数のメッセージタイプが含まれます: システムメッセージ（セッション初期化）、アシスタントメッセージ（AI レスポンス）、結果メッセージ（実行サマリー）。

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

Stream-JSON フォーマットは、実行中にイベントが発生するとすぐに JSON メッセージを出力し、リアルタイムモニタリングを可能にします。このフォーマットは行区切り JSON を使用し、各メッセージは 1 行の完全な JSON オブジェクトです。

```bash
qwen -p "Explain TypeScript" --output-format stream-json
```

出力（イベント発生時にストリーミング）:

```json
{"type":"system","subtype":"session_start","uuid":"...","session_id":"..."}
{"type":"assistant","uuid":"...","session_id":"...","message":{...}}
{"type":"result","subtype":"success","uuid":"...","session_id":"..."}
```

`--include-partial-messages` と組み合わせると、リアルタイム UI 更新のための追加ストリームイベント（message_start、content_block_delta など）がリアルタイムで出力されます。

```bash
qwen -p "Write a Python script" --output-format stream-json --include-partial-messages
```

### 入力フォーマット

`--input-format` パラメータは、Qwen Code が標準入力からどのように入力を受け取るかを制御します。

- **`text`**（デフォルト）: stdin またはコマンドライン引数からの標準テキスト入力
- **`stream-json`**: 双方向通信のための stdin 経由 JSON メッセージプロトコル

> **Note:** Stream-json 入力モードは現在開発中であり、SDK 連携を目的としています。`--output-format stream-json` の設定が必要です。

### ファイルリダイレクト

出力をファイルに保存したり、他のコマンドにパイプしたりできます。

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

| オプション                     | 説明                                                                     | 例                                                                       |
| ------------------------------ | ------------------------------------------------------------------------ | ------------------------------------------------------------------------ |
| `--prompt`, `-p`               | ヘッドレスモードで実行                                                   | `qwen -p "query"`                                                        |
| `--output-format`, `-o`        | 出力フォーマットを指定（text、json、stream-json）                        | `qwen -p "query" --output-format json`                                   |
| `--input-format`               | 入力フォーマットを指定（text、stream-json）                              | `qwen --input-format text --output-format stream-json`                   |
| `--include-partial-messages`   | stream-json 出力に部分メッセージを含める                                 | `qwen -p "query" --output-format stream-json --include-partial-messages` |
| `--system-prompt`              | 今回の実行のメインセッションシステムプロンプトを上書き                   | `qwen -p "query" --system-prompt "You are a terse reviewer."`            |
| `--append-system-prompt`       | 今回の実行のメインセッションシステムプロンプトに追加指示を付加           | `qwen -p "query" --append-system-prompt "Focus on concrete findings."`   |
| `--debug`, `-d`                | デバッグモードを有効化                                                   | `qwen -p "query" --debug`                                                |
| `--all-files`, `-a`            | コンテキストにすべてのファイルを含める                                   | `qwen -p "query" --all-files`                                            |
| `--include-directories`        | 追加ディレクトリを含める                                                 | `qwen -p "query" --include-directories src,docs`                         |
| `--yolo`, `-y`                 | すべてのアクションを自動承認                                             | `qwen -p "query" --yolo`                                                 |
| `--approval-mode`              | 承認モードを設定                                                         | `qwen -p "query" --approval-mode auto_edit`                              |
| `--continue`                   | このプロジェクトの最新セッションを再開                                   | `qwen --continue -p "Pick up where we left off"`                         |
| `--resume [sessionId]`         | 特定のセッションを再開（またはインタラクティブに選択）                   | `qwen --resume 123e... -p "Finish the refactor"`                         |
| `--max-session-turns`          | 実行中のユーザー/モデル/ツールターン数の上限を設定                       | `qwen -p "..." --max-session-turns 30`                                   |
| `--max-wall-time`              | 経過時間の予算。`90`（秒）、`30s`、`5m`、`1h`、`1.5h` の形式を受け付ける | `qwen -p "..." --max-wall-time 10m`                                      |
| `--max-tool-calls`             | 実行中の累計ツール呼び出し回数の予算                                     | `qwen -p "..." --max-tool-calls 50`                                      |

利用可能なすべての設定オプション、設定ファイル、環境変数の詳細については、[設定ガイド](../configuration/settings)を参照してください。

## 無人実行時の安全性

ヘッドレス / CI 実行で `--yolo`（または `--approval-mode=yolo`）を使用すると、`shell`、`write`、`edit` を含むすべてのツール呼び出しが自動承認されます。**`--yolo` はサンドボックスを有効にしません** — これらのツールはホストプロセスの権限レベルで実行されます。Qwen Code がサンドボックスを設定せずにこの組み合わせを検出した場合、起動時に stderr へ 1 行の警告を出力します。トレードオフを確認した上で `QWEN_CODE_SUPPRESS_YOLO_WARNING=1` を設定することで警告を非表示にできます。

### 実行レベルの予算

Qwen Code は、以下のしきい値のいずれかを超えた場合に無人実行を中断できます。デフォルトはそれぞれ `-1`（無制限）であり、いずれか一つを設定するだけで暴走を抑制できます。これらは SIGINT と同じ `AbortController` に対して協調的に適用されるため、予算超過時は構造化された `FatalBudgetExceededError`（終了コード **55**）が発生します — ターンキャップの終了コード 53 や SIGINT の 130 とは区別されるため、CI スクリプトで理由に応じた分岐処理が可能です。

| フラグ                | 設定キー                   | 制限対象                                                                                                                                                                                                       |
| --------------------- | -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--max-wall-time`     | `model.maxWallTimeSeconds` | 実行全体の経過時間。フラグは `90`（秒）、`30s`、`5m`、`1h`、`1.5h`（小数単位対応）を受け付ける。最小 1 秒 — サブ秒の値はタイポとして拒否。設定値は秒単位。                                                    |
| `--max-tool-calls`    | `model.maxToolCalls`       | メインの実行ループがディスパッチした累計トップレベルのツール呼び出し回数（成功と失敗の両方をカウント — エラー時もモデルはトークンを消費）。サブエージェント / 構造化出力の除外については「スコープ」を参照。   |
| `--max-session-turns` | `model.maxSessionTurns`    | ユーザー/モデル/ツールターン数。超過時は終了コード 53 で終了（予算超過の終了コード 55 とは異なる）。                                                                                                           |

#### スコープ

- **`--max-tool-calls` はトップレベルのディスパッチのみをカウントします。** モデルが `agent` ツールを呼び出すと、そのディスパッチは **1** としてカウントされます。スポーンされたサブエージェントが実行する内部ツール呼び出しはカウント**されません**。サブエージェントを通じて作業を行うモデルは、小さなトップレベル予算のもとで内部的に無制限の作業を行える可能性があります。より厳格な制限が必要な場合は `--exclude-tools agent` と組み合わせてください。
- **`structured_output` は `--max-tool-calls` から除外されます。** `--json-schema` 下では、モデルの最終的な `structured_output` 呼び出しは「完了」を示す契約であり、実際の作業ではありません — `--max-tool-calls` にカウントされないため、予算ギリギリの完了が誤検知で中断されることはありません。この除外は（Ajv バリデーション失敗を含む）無条件に適用されるため、不正な出力形式でリトライループに入ったモデルは `--max-tool-calls` で制限**されません**。リトライを制限するには `--max-session-turns` または `--max-wall-time` と組み合わせてください。
- **`structured_output` は `--max-session-turns` から除外されません。** このカウンターは既存のものであり、最終契約を含むすべてのターンでインクリメントされます。`--json-schema` 下で `N` 回の実際の作業ターンを許可する場合は、`--max-session-turns` を `N+1` に設定してください。
- **シングルショット vs `--input-format stream-json`:** stream-json 入力モードでは、デーモンは各ユーザーメッセージの開始時に予算カウンターをリセットします。予算はプロセス単位ではなくメッセージ単位です。
- **`qwen serve` / ACP セッション:** デーモン ACP セッションパスは現在、settings.json の `--max-wall-time` / `--max-tool-calls` を参照**しません**。これらの予算は、シングルショットの `qwen -p` 実行と `--input-format stream-json` セッションにのみ適用されます。（`qwen serve` は、settings に `tools.approvalMode: 'yolo'` が設定されている場合、起動時に YOLO-no-sandbox 警告を出力します。）

### 推奨の組み合わせ

- **信頼済みの隔離環境（エフェメラル CI ランナー、コンテナ）:** `qwen -p "..." --yolo --max-session-turns N --max-wall-time 10m --output-format json`。スタックしたエージェントが CI 時間を消費しないようにターン予算とウォールクロック予算を設定し、実行後の使用状況/ツール呼び出し監査のために `--output-format json` をキャプチャします。
- **ローカルマシンまたは共有インフラ:** `--sandbox`（または `QWEN_SANDBOX=1`）も渡すことで、shell / write / edit ツールをサンドボックスイメージ内で実行します。
- **レート制限時のリトライを伴う長時間 CI:** `QWEN_CODE_UNATTENDED_RETRY=1` と `--max-wall-time` を組み合わせます。リトライ環境変数により一時的な 429 / 529 レスポンスを超えて実行を継続し、ウォールクロック予算により永続的に失敗するプロバイダーがジョブを無期限に延長するのを防ぎます。
- **制限付き監査 / 調査:** 読み取り専用タスクには `--max-tool-calls 25` でモデルが grep / read を積極的に行うことを制限します。`--exclude-tools shell,write,edit` と組み合わせることで制限をより意味のあるものにします。

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

Qwen Code が CI/CD パイプラインまたはバックグラウンドデーモンとして実行されている場合、短い API 停止（レート制限または過負荷）によって数時間かかるタスクが中断されるべきではありません。**永続的リトライモード**により、Qwen Code はサービスが回復するまで一時的な API エラーを無期限にリトライします。

### 動作の仕組み

- **一時的なエラーのみ**: HTTP 429（レート制限）と 529（過負荷）のみが無期限にリトライされます。その他のエラー（400、500 など）は通常通り失敗します。
- **上限付き指数バックオフ**: リトライの間隔は指数的に増加しますが、1 回のリトライあたり最大 **5 分** で上限が設けられています。
- **ハートビートキープアライブ**: 長い待機中は、CI ランナーが非アクティブによってプロセスを終了しないよう、**30 秒**ごとに stderr にステータス行が出力されます。
- **グレースフルデグラデーション**: 一時的でないエラーおよびインタラクティブモードは完全に影響を受けません。

### 有効化

`QWEN_CODE_UNATTENDED_RETRY` 環境変数を `true` または `1`（厳密一致、大文字小文字を区別）に設定します。

```bash
export QWEN_CODE_UNATTENDED_RETRY=1
```

> [!important]
> 永続的リトライは**明示的なオプトイン**が必要です。`CI=true` だけでは有効化されません — 高速失敗の CI ジョブを無限待機ジョブに暗黙的に変えることは危険です。パイプライン設定で必ず `QWEN_CODE_UNATTENDED_RETRY` を明示的に設定してください。

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

永続的リトライ中、ハートビートメッセージが **stderr** に出力されます。

```
[qwen-code] Waiting for API capacity... attempt 3, retry in 45s
[qwen-code] Waiting for API capacity... attempt 3, retry in 15s
```

これらのメッセージにより CI ランナーが稼働し続け、進行状況を監視できます。stdout には表示されないため、他のツールにパイプされた JSON 出力はクリーンな状態を保ちます。

## リソース

- [CLI 設定](../configuration/settings#command-line-arguments) - 完全な設定ガイド
- [認証](../configuration/auth.md) - 認証のセットアップ
- [コマンド](../features/commands) - インタラクティブコマンドリファレンス
- [チュートリアル](../quickstart) - ステップバイステップの自動化ガイド
