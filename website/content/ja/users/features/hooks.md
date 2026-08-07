# Qwen Code Hooks

## Overview

Qwen Code フックは、Qwen Code アプリケーションの動作を拡張・カスタマイズするための強力な仕組みを提供します。フックを使用すると、ツール実行の前や後、セッションの開始/終了時、その他の重要なイベントなど、アプリケーションライフサイクルの特定の時点でカスタムスクリプトやプログラムを実行できます。

フックはデフォルトで有効になっています。設定ファイルのトップレベル（`hooks` と同じ階層）で `disableAllHooks` を `true` に設定すると、すべてのフックを一時的に無効にできます。

```json
{
  "disableAllHooks": true,
  "hooks": {
    "PreToolUse": [...]
  }
}
```

これにより、設定を削除せずにすべてのフックを無効にします。

## What are Hooks?

フックは、アプリケーションフローの事前定義された時点で Qwen Code によって自動的に実行される、ユーザー定義のスクリプトまたはプログラムです。これにより、ユーザーは以下のことが可能になります。

- ツールの使用状況の監視と監査
- セキュリティポリシーの適用
- 会話への追加コンテキストの注入
- イベントに基づいたアプリケーション動作のカスタマイズ
- 外部システムやサービスとの連携
- ツールの入力や応答のプログラムによる変更

## Hook Types

Qwen Code は 4 種類のフック実行タイプをサポートしています。

| Type       | Description                                                                                    |
| :--------- | :--------------------------------------------------------------------------------------------- |
| `command`  | シェルコマンドを実行します。`stdin` 経由で JSON を受け取り、`stdout` 経由で結果を返します。              |
| `http`     | 指定された URL に JSON を `POST` リクエストボディとして送信します。HTTP レスポンスボディ経由で結果を返します。 |
| `function` | 登録された JavaScript 関数を直接呼び出します（セッションレベルのフックのみ）。                     |
| `prompt`   | LLM を使用してフック入力を評価し、判断を返します。                                       |

### Command Hooks

コマンドフックは、子プロセス経由でコマンドを実行します。入力 JSON は stdin を介して渡され、出力は stdout を介して返されます。

**設定:**

| Field           | Type                     | Required | Description                                 |
| :-------------- | :----------------------- | :------- | :------------------------------------------ |
| `type`          | `"command"`              | Yes      | フックタイプ                                   |
| `command`       | `string`                 | Yes      | 実行するコマンド                          |
| `name`          | `string`                 | No       | フック名（ログ用）                     |
| `description`   | `string`                 | No       | フックの説明                            |
| `timeout`       | `number`                 | No       | タイムアウト（ミリ秒）、デフォルト 60000      |
| `async`         | `boolean`                | No       | バックグラウンドで非同期に実行するかどうか |
| `env`           | `Record<string, string>` | No       | 環境変数                       |
| `shell`         | `"bash" \| "powershell"` | No       | 使用するシェル                                |
| `statusMessage` | `string`                 | No       | 実行中に表示されるステータスメッセージ   |

**例:**

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "write_file",
        "hooks": [
          {
            "type": "command",
            "command": "$QWEN_PROJECT_DIR/.qwen/hooks/security-check.sh",
            "name": "security-check",
            "timeout": 10000
          }
        ]
      }
    ]
  }
}
```

### HTTP Hooks

HTTP フックは、フック入力を POST リクエストとして指定された URL に送信します。URL ホワイトリスト、DNS レベルの SSRF 保護、環境変数の補間、その他のセキュリティ機能をサポートしています。

**設定:**

| Field            | Type                     | Required | Description                                               |
| :--------------- | :----------------------- | :------- | :-------------------------------------------------------- |
| `type`           | `"http"`                 | Yes      | フックタイプ                                                 |
| `url`            | `string`                 | Yes      | ターゲット URL                                                |
| `headers`        | `Record<string, string>` | No       | リクエストヘッダー（環境変数の補間をサポート）          |
| `allowedEnvVars` | `string[]`               | No       | URL/ヘッダーで許可される環境変数のホワイトリスト |
| `timeout`        | `number`                 | No       | タイムアウト（秒）、デフォルト 600                           |
| `name`           | `string`                 | No       | フック名（ログ用）                                   |
| `statusMessage`  | `string`                 | No       | 実行中に表示されるステータスメッセージ                 |
| `once`           | `boolean`                | No       | セッションごとにイベントごとに 1 回だけ実行（HTTP フックのみ） |

**セキュリティ機能:**

- **URL ホワイトリスト**: `allowedUrls` を介して許可された URL パターンを設定します。
- **SSRF 保護**: プライベート IP（10.x.x.x、172.16-31.x.x、192.168.x.x など）をブロックしますが、ループバックアドレス（127.0.0.1、::1）は許可します。
- **DNS 検証**: DNS リバインディング攻撃を防ぐため、リクエスト前にドメイン解決を検証します。
- **環境変数の補間**: `${VAR}` 構文を使用し、`allowedEnvVars` ホワイトリストにある変数のみを許可します。

#### プライベートネットワークフックの許可（管理環境のみ）

デフォルトでは、HTTP フックはプライベートまたはリンクローカルの IP 範囲をターゲットにできません。フック受信者がファーストパーティの VPC 内部エンドポイント（例: `172.16.0.0/12` に解決される内部 API ゲートウェイ）であるプラットフォーム管理環境では、以下の設定で IP 範囲チェックを緩和できます。

```json
{
  "security": {
    "allowPrivateNetworkHooks": true
  }
}
```

- この設定は **User、System、および SystemDefaults の設定スコープからのみ尊重されます**。Workspace（プロジェクト）設定で設定された値は無視され、警告としてログに記録されるため、クローンされたリポジトリが自分でこのバイパスを付与することはできません。
- このフラグは一般的なプライベート/CGNAT/リンクローカルの**範囲**チェックのみを緩和します。クラウドメタデータエンドポイントはすべての設定でブロックされたままです。`BLOCKED_HOSTS` リストはリテラルにマッチし（`metadata.google.internal`、`metadata.azure.internal` など）、メタデータ IP `169.254.169.254` と `100.100.100.200` はすべてのシリアライズ形式（IPv4 マップ IPv6 の `::ffff:a9fe:a9fe` など）でブロックされ、DNS 解決後もブロックされます。
- `security.allowedHttpHookUrls` ホワイトリストは独立して適用されます。管理環境では、このフラグをホワイトリストと組み合わせて、意図した内部エンドポイントのみが到達可能になるようにします。

> **警告:** このフラグを有効にすると、フックがネットワーク上の内部インフラストラクチャにアクセスできるようになります。信頼できる管理設定でのみ有効にしてください。自分で管理していないリポジトリでは絶対に有効にしないでください。

**例:**

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "*",
        "hooks": [
          {
            "type": "http",
            "url": "http://127.0.0.1:8080/hooks/pre-tool-use",
            "headers": {
              "Authorization": "Bearer ${HOOK_API_KEY}"
            },
            "allowedEnvVars": ["HOOK_API_KEY"],
            "timeout": 10,
            "name": "remote-security-check"
          }
        ]
      }
    ]
  }
}
```

**例: 外部判定サービスアダプター**

上記の `remote-security-check` 設定は、`http://127.0.0.1:8080/hooks/pre-tool-use` でこの契約（POST `{tool_name, tool_input, ...}` を受け取り、`hookSpecificOutput.permissionDecision` を返す）を話すサービスがすでに稼働していることを前提としています。以下は、欠落している部分を補完する最小限の stdlib のみのアダプターで、1つの具体的な判定バックエンドに接続されており、スタブではなく完全に実行・テスト可能なものです。`review()` 関数のみがバックエンド固有です — その本体とリクエスト/レスポンスの形状を使用するサービスに合わせて入れ替えてください。それ以外（サーバー、fail-open 処理、フックレスポンスの形状）はバックエンドに関わらず同じです。

_開示: 以下で使用しているバックエンド [invinoveritas](https://api.babyblueviper.com) は、著者が関与しているサービスです。この例でエンドツーエンドで検証できたものとして使用しており、推奨ではありません。JSON 判定を返す HTTP サービスであれば同等に機能します。`review()` のみを変更すれば済みます。_

_データ取り扱い: `matcher: "*"` では、**すべての**ツール呼び出しの完全な `tool_input` が判定バックエンドに送信されます。その入力を機密として扱ってください（ファイル内容、パス、秘密情報が含まれる可能性があります）。シェルコマンドのみを判定したい場合は、matcher を狭めてください（例: `run_shell_command` のみ）。_

```python
#!/usr/bin/env python3
# judgment_hook.py -- run: JUDGMENT_API_KEY=... python3 judgment_hook.py
import json, os, sys, urllib.request
from http.server import BaseHTTPRequestHandler, HTTPServer

JUDGMENT_API_KEY = os.environ["JUDGMENT_API_KEY"]
JUDGMENT_URL = os.environ.get("JUDGMENT_URL", "https://api.babyblueviper.com/review")

def review(tool_name, tool_input):
    """POST the call to the judgment backend and return its verdict. This is the
    one function to change for a different backend -- request/response shape
    below matches invinoveritas's /review; adapt both to your own backend's
    contract if you swap it out."""
    body = json.dumps({
        "artifact": json.dumps({"tool_name": tool_name, "tool_input": tool_input}),
        "artifact_type": "shell_command" if tool_name in ("run_shell_command", "shell") else "general",
        "context": f"qwen-code PreToolUse: {tool_name}",
    }).encode()
    req = urllib.request.Request(
        JUDGMENT_URL, data=body,
        headers={"Authorization": f"Bearer {JUDGMENT_API_KEY}", "Content-Type": "application/json"},
    )
    # Keep this below the HTTP hook's own timeout (10s in the config above), so a "deny"
    # verdict is always returned before the hook gives up and fails open on its own.
    with urllib.request.urlopen(req, timeout=8) as resp:
        return json.loads(resp.read())  # response includes a "verdict" field: "reject" denies, anything else allows

class Handler(BaseHTTPRequestHandler):
    def do_POST(self):
        payload = json.loads(self.rfile.read(int(self.headers.get("Content-Length", 0))) or b"{}")
        tool_name, tool_input = payload.get("tool_name", "unknown"), payload.get("tool_input", {})
        try:
            verdict = review(tool_name, tool_input)
            decision = "deny" if verdict.get("verdict") == "reject" else "allow"
            reason = verdict.get("summary", f"judgment verdict: {verdict.get('verdict')}")
        except Exception as e:
            decision, reason = "allow", "judgment backend unavailable, failing open"  # never block on a review-side outage
            print(f"judgment backend unavailable for {tool_name}, failing open: {e}", file=sys.stderr)
        out = {"continue": True, "decision": decision, "hookSpecificOutput": {
            "hookEventName": "PreToolUse", "permissionDecision": decision, "permissionDecisionReason": reason,
        }}
        body = json.dumps(out).encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)
    def log_message(self, *a): pass

if __name__ == "__main__":
    HTTPServer(("127.0.0.1", 8080), Handler).serve_forever()
```

上記の本番 API に対してエンドツーエンドでライブテストしました。本物の破壊的な入力（`{"tool_name": "run_shell_command", "tool_input": {"command": "rm -rf /important_data"}}`）は `permissionDecision: "deny"` と実際の説明を返し、無害なもの（`ls -la`）は `"allow"` を返しました。判定バックエンドからのネットワーク/タイムアウト/不正なレスポンスの問題では fail-open するため、停止が発生しても正当なツール呼び出しがブロックされることはありません — 上記の `command` フックの例が独自の終了コードで適用するのと同じ規律です。

### Function Hooks

関数フックは、登録された JavaScript/TypeScript 関数を直接呼び出します。これらは Skill システムによって内部的に使用されており、現在エンドユーザー向けのパブリック API としては公開されていません。

**注**: ほとんどのユースケースでは、設定ファイルで設定できる**コマンドフック**または **HTTP フック**を代わりに使用してください。

### Prompt Hooks

プロンプトフックは LLM を使用してフック入力を評価し、判断を返します。これは、操作を許可するかブロックするかを決定するなど、コンテキストに基づいたインテリジェントな判断を行う場合に便利です。

> **データ取り扱い:** プロンプトフックはイベント入力を設定されたモデルプロバイダーに送信します。ファイルバックのデバッグログが有効な場合、完全に展開されたプロンプトフックのリクエストもセッションデバッグログに書き込まれます。フック入力とデバッグログは機密性の高いものとして扱ってください。

**動作の仕組み:**

1. フック入力の JSON が `$ARGUMENTS` プレースホルダーを使用してプロンプトに注入されます。
2. プロンプトが LLM（デフォルト: 現在のモデル）に送信されます。
3. LLM が判断を含む JSON レスポンスを返します。
4. Qwen Code が判断を処理し、それに応じて実行を続行またはブロックします。

**設定:**

| Field           | Type       | Required | Description                                         |
| :-------------- | :--------- | :------- | :-------------------------------------------------- |
| `type`          | `"prompt"` | Yes      | フックタイプ                                           |
| `prompt`        | `string`   | Yes      | LLM に送信されるプロンプト。フック入力には `$ARGUMENTS` を使用します |
| `model`         | `string`   | No       | 使用するモデル（デフォルトは現在のモデル）       |
| `timeout`       | `number`   | No       | タイムアウト（秒）、デフォルト 30                      |
| `name`          | `string`   | No       | フック名（ログ用）                             |
| `description`   | `string`   | No       | フックの説明                                    |
| `statusMessage` | `string`   | No       | 実行中に表示されるステータスメッセージ           |

**レスポンス形式:**

LLM は以下の構造を持つ JSON を返す必要があります。

```json
{
  "ok": true,
  "reason": "Explanation of the decision",
  "additionalContext": "Optional context to inject into the conversation"
}
```

| Field               | Description                                                                |
| :------------------ | :------------------------------------------------------------------------- |
| `ok`                | 許可/続行する場合は `true`、ブロック/停止する場合は `false`                            |
| `reason`            | `ok` が `false` の場合に必須。ブロックの理由をモデルに示すために使用されます。     |
| `additionalContext` | オプション。許可する際に会話に注入する追加コンテキスト。 |

**サポートされているイベント:**

プロンプトフックは、以下のものを含むほとんどのフックイベントで使用できます。

- `PreToolUse` - ツール呼び出しを許可するかどうかを評価
- `PostToolUse` - ツールの結果を評価し、コンテキストを注入する可能性がある
- `Stop` - 続行するか停止するかを決定
- `SubagentStop` - サブエージェントの結果を評価
- `UserPromptSubmit` - 条件を満たすモデルバインドされたプロンプトを評価または拡張

**例: Stop フック**

```json
{
  "hooks": {
    "Stop": [
      {
        "hooks": [
          {
            "type": "prompt",
            "prompt": "You are evaluating whether Qwen Code should stop working. Context: $ARGUMENTS\n\nAnalyze the conversation and determine if:\n1. All user-requested tasks are complete\n2. Any errors need to be addressed\n3. Follow-up work is needed\n\nRespond with JSON: {\"ok\": true} to allow stopping, or {\"ok\": false, \"reason\": \"your explanation\"} to continue working.",
            "timeout": 30
          }
        ]
      }
    ]
  }
}
```

`ok` が `false` の場合、Qwen Code は作業を続行し、`reason` を次のレスポンスのコンテキストとして使用します。

**例: PreToolUse フック**

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "run_shell_command",
        "hooks": [
          {
            "type": "prompt",
            "prompt": "Evaluate this tool call for security concerns. Tool input: $ARGUMENTS\n\nCheck for:\n- Dangerous commands (rm -rf, curl | sh, etc.)\n- Unauthorized access attempts\n- Data exfiltration patterns\n\nRespond with {\"ok\": true} if safe, or {\"ok\": false, \"reason\": \"concern\"} if blocked.",
            "model": "sonnet",
            "timeout": 30,
            "name": "security-evaluator"
          }
        ]
      }
    ]
  }
}
```

## Hook Events

フックは、Qwen Code セッション中の特定の時点で発生します。イベントごとに、トリガー条件をフィルタリングするための異なる matcher がサポートされています。

| Event                | Triggered When                            | Matcher Target                                            |
| :------------------- | :---------------------------------------- | :-------------------------------------------------------- |
| `PreToolUse`         | ツール実行前                     | ツール ID（`write_file`、`read_file`、`run_shell_command` など） |
| `PostToolUse`        | ツールの正常な実行後           | ツール ID                                                 |
| `PostToolUseFailure` | ツール実行の失敗後                | ツール ID                                                 |
| `UserPromptSubmit`   | サポートされたモデル呼び出し前  | なし                                                       |
| `SessionStart`       | セッションの開始または再開時            | ソース（`startup`、`resume`、`clear`、`compact`）          |
| `SessionEnd`         | セッションの終了時                         | 理由（`clear`、`logout`、`prompt_input_exit` など）     |
| `SessionDelete`      | 明示的に選択されたセッションが削除された後 | なし                                                       |
| `MessageDisplay`     | 応答のストリーミング中に繰り返し  | なし（常に発生）                                          |
| `Stop`               | Claude がレスポンスの終了を準備しているとき | なし（常に発生）                                       |
| `SubagentStart`      | サブエージェントの開始時                      | エージェントタイプ（`Bash`、`Explorer`、`Plan` など）             |
| `SubagentStop`       | サブエージェントの停止時                       | エージェントタイプ                                                |
| `PreCompact`         | 会話の圧縮前            | トリガー（`manual`、`auto`）                                |
| `Notification`       | 通知の送信時               | タイプ（`permission_prompt`、`idle_prompt`、`auth_success`） |
| `PermissionRequest`  | 権限ダイアログの表示時           | ツール ID                                                  |
| `PermissionDenied`   | ツール権限が拒否された時         | ツール ID                                                  |
| `TodoCreated`        | 新しい todo アイテムが作成されたとき           | なし（常に発生）                                       |
| `TodoCompleted`      | todo アイテムが完了としてマークされたとき   | なし（常に発生）                                       |
### マッチャーパターン

`matcher` はトリガー条件をフィルタリングするために使用される正規表現です。

| イベントタイプ          | イベント                                                                                     | Matcher サポート | Matcher ターゲット                                           |
| :------------------ | :----------------------------------------------------------------------------------------- | :-------------- | :------------------------------------------------------- |
| ツールイベント         | `PreToolUse`, `PostToolUse`, `PostToolUseFailure`, `PermissionRequest`, `PermissionDenied` | ✅ 正規表現        | ツール ID: `write_file`, `read_file`, `run_shell_command` など |
| サブエージェントイベント     | `SubagentStart`, `SubagentStop`                                        | ✅ 正規表現        | エージェントタイプ: `Bash`, `Explorer` など                     |
| セッションイベント      | `SessionStart`                                                         | ✅ 正規表現        | ソース: `startup`, `resume`, `clear`, `compact`          |
| セッションイベント      | `SessionEnd`                                                           | ✅ 正規表現        | 理由: `clear`, `logout`, `prompt_input_exit` など     |
| セッションイベント      | `SessionDelete`                                                                            | ❌ なし           | N/A                                                      |
| 通知イベント | `Notification`                                                         | ✅ 完全一致  | タイプ: `permission_prompt`, `idle_prompt`, `auth_success` |
| コンパクトイベント      | `PreCompact`                                                           | ✅ 完全一致  | トリガー: `manual`, `auto`                                |
| Todo イベント         | `TodoCreated`, `TodoCompleted`                                         | ❌ なし           | N/A                                                      |
| プロンプトイベント       | `UserPromptSubmit`                                                     | ❌ なし           | N/A                                                      |
| 停止イベント         | `Stop`                                                                 | ❌ なし           | N/A                                                      |
| メッセージ表示     | `MessageDisplay`                                                                           | ❌ なし           | N/A                                                      |

**Matcher 構文:**

- 空文字列 `""` または `"*"` は、そのタイプのすべてのイベントにマッチします
- 標準的な正規表現構文がサポートされています（例: `^run_shell_command$`, `read_.*`, `(write_file|edit)`）
- ツールフックは `tool_name` 内のランタイムツール ID（例: `write_file`）を受け取ります。`WriteFile` や `ReadFile` などの組み込み表示名も互換性のために matcher エイリアスとして受け入れられますが、新しい設定ではランタイム ID を使用してください。

**例:**

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "^run_shell_command$",
        "hooks": [
          {
            "type": "command",
            "command": "echo 'bash check' >> /tmp/hooks.log"
          }
        ]
      },
      {
        "matcher": "write_.*",
        "hooks": [
          {
            "type": "command",
            "command": "echo 'write check' >> /tmp/hooks.log"
          }
        ]
      },
      {
        "matcher": "*",
        "hooks": [
          { "type": "command", "command": "echo 'all tools' >> /tmp/hooks.log" }
        ]
      }
    ],
    "SubagentStart": [
      {
        "matcher": "^(Bash|Explorer)$",
        "hooks": [
          {
            "type": "command",
            "command": "echo 'subagent check' >> /tmp/hooks.log"
          }
        ]
      }
    ]
  }
}
```

## 入出力ルール

### Hook 入力構造

すべての hook executor は、標準化されたイベント入力を受け取ります。配信境界は executor に応じて異なります。

| Hook タイプ  | 入力受信先                                                    |
| :--------- | :-------------------------------------------------------------- |
| `command`  | `stdin` 上の JSON を介した子プロセス                           |
| `http`     | JSON `POST` ボディを介した設定されたエンドポイント              |
| `function` | 信頼されたプロセス内コールバック                                |
| `prompt`   | 入力が `$ARGUMENTS` を置換した後の設定されたモデルプロバイダー |

関数フックは Qwen プロセス内で実行される信頼されたコードです。プロセス内オブジェクトを受け取るため、関数フックに対してフィールドを不変として扱うことはできません。

Qwen は、フックプロセス、エンドポイント、コールバック、またはモデルプロバイダーが入力を保持または転送するかどうかを制御しません。設定された各 executor のデータ取り扱いポリシーを確認してください。

**共通フィールド:**

```json
{
  "session_id": "string",
  "transcript_path": "string",
  "cwd": "string",
  "hook_event_name": "string",
  "timestamp": "string"
}
```

イベント固有のフィールドは hook タイプに基づいて追加されます。サブエージェント内で実行されている場合、`agent_id` と `agent_type` が追加で含まれます。

フック入力は前方拡張可能な JSON 契約です。既存のイベントに新しいオプションフィールドが追加される可能性があります。コンシューマーは未知のフィールドを無視してください。未知のプロパティを拒否する厳密なデコーダーは、Qwen Code をアップグレードする前に、新しいオプションフィールドごとに明示的に許可するように更新する必要があります。セキュリティに敏感なフックでは、デコーダーの失敗が fail-open または fail-closed の動作を変更する可能性があるため、管理者はロールアウト前にアップグレードされたペイロードをデプロイされたフックに対して検証する必要があります。

### Hook 出力構造

Hook の出力は、`stdout`（command）または HTTP レスポンスボディ（http）を通じて JSON として返されます。

**終了コードの動作（Command Hooks）:**

| 終了コード | 動作                                                                              |
| :-------- | :------------------------------------------------------------------------------------ |
| `0`       | 成功。`stdout` の JSON をパースして動作を制御します。                                  |
| `2`       | **ブロッキングエラー**。`stdout` を無視し、`stderr` をエラーフィードバックとしてモデルに渡します。 |
| その他     | 非ブロッキングエラー。`stderr` はデバッグモードでのみ表示され、実行は継続されます。           |

**出力構造:**

Hook の出力は 3 つのフィールドカテゴリをサポートしています:

1. **共通フィールド**: `continue`, `stopReason`, `suppressOutput`, `systemMessage`
2. **トップレベルの決定**: `decision`, `reason`（一部のイベントで使用）
3. **イベント固有の制御**: `hookSpecificOutput`（`hookEventName` を含む必要があります）

```json
{
  "continue": true,
  "decision": "allow",
  "reason": "Operation approved",
  "hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "additionalContext": "Additional context information"
  }
}
```

### 各 Hook イベントの詳細

#### PreToolUse

**目的**: ツールが使用される前に実行され、権限チェック、入力検証、またはコンテキストの注入を可能にします。

**イベント固有のフィールド**:

```json
{
  "permission_mode": "default | plan | auto_edit | yolo",
  "tool_name": "name of the tool being executed",
  "tool_input": "object containing the tool's input parameters",
  "tool_use_id": "unique identifier for this tool use instance (internal format, e.g., toolu_xxx)",
  "tool_call_id": "original API call ID from the LLM provider (e.g., call_xxx for OpenAI/Qwen) (optional)"
}
```

**出力オプション**:

- `hookSpecificOutput.permissionDecision`: "allow"、"deny"、または "ask"（必須）
- `hookSpecificOutput.permissionDecisionReason`: 決定の理由（必須）
- `hookSpecificOutput.updatedInput`: 元の代わりに使用する、変更されたツール入力パラメータ
- `hookSpecificOutput.additionalContext`: 追加のコンテキスト情報

`permissionDecision` の値は、ツールが実行されるかどうかを制御します:

- `"allow"` — 通常の承認プロンプトなしでツールを実行します。
- `"deny"` — ツールをブロックします。実行されず、モデルにエラーが返されます。
- `"ask"` — 一時停止し、TUI でツール呼び出しの確認をユーザーに求めます。確認するとツールが 1 回実行され、拒否するとキャンセルされます。確認をプロンプトできないコンテキスト（ヘッドレス（`--prompt`）実行やバックグラウンドサブエージェント）では、"ask" は "deny" にフォールバックします。

`"ask"` の場合、TUI は `permissionDecisionReason` をインライン Markdown として解釈するのではなく、リテラルテキストとして表示します。これにより、フォーマットマーカーやリンクターゲットがユーザーに表示されたままになります。

**注**: `decision` や `reason` などの標準的な hook 出力フィールドは基盤クラスによって技術的にサポートされていますが、公式インターフェースは `permissionDecision` と `permissionDecisionReason` を含む `hookSpecificOutput` を期待しています。

**出力例**:

```json
{
  "hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "permissionDecision": "deny",
    "permissionDecisionReason": "Security policy blocks database writes",
    "additionalContext": "Current environment: production. Proceed with caution."
  }
}
```

#### PostToolUse

**目的**: ツールが正常に完了した後に実行され、結果の処理、結果のログ記録、または追加コンテキストの注入を行います。

**イベント固有のフィールド**:

```json
{
  "permission_mode": "default | plan | auto_edit | yolo",
  "tool_name": "name of the tool that was executed",
  "tool_input": "object containing the tool's input parameters",
  "tool_response": "object containing the tool's response",
  "tool_use_id": "unique identifier for this tool use instance (internal format, e.g., toolu_xxx)",
  "tool_call_id": "original API call ID from the LLM provider (e.g., call_xxx for OpenAI/Qwen) (optional)"
}
```

**出力オプション**:

- `decision`: "allow"、"deny"、"block"（指定されていない場合はデフォルトで "allow"）
- `reason`: 決定の理由
- `hookSpecificOutput.additionalContext`: 含める追加情報

**出力例**:

```json
{
  "decision": "allow",
  "reason": "Tool executed successfully",
  "hookSpecificOutput": {
    "additionalContext": "File modification recorded in audit log"
  }
}
```

#### PostToolUseFailure

**目的**: ツールの実行が失敗したときに実行され、エラーの処理、アラートの送信、または失敗の記録を行います。

**イベント固有のフィールド**:

```json
{
  "permission_mode": "default | plan | auto_edit | yolo",
  "tool_use_id": "unique identifier for the tool use (internal format, e.g., toolu_xxx)",
  "tool_call_id": "original API call ID from the LLM provider (e.g., call_xxx for OpenAI/Qwen) (optional)",
  "tool_name": "name of the tool that failed",
  "tool_input": "object containing the tool's input parameters",
  "error": "error message describing the failure",
  "is_interrupt": "boolean indicating if failure was due to user interruption (optional)"
}
```

**出力オプション**:

- `hookSpecificOutput.additionalContext`: エラー処理情報
- 標準的な hook 出力フィールド

**出力例**:

```json
{
  "hookSpecificOutput": {
    "additionalContext": "Error: File not found. Failure logged in monitoring system."
  }
}
```

#### UserPromptSubmit

**目的**: サポートされたモデル呼び出しの前に実行され、現在のモデルバインドされたプロンプトの検証、ブロック、または拡張を行います。このイベントは現在 `UserQuery`、`ToolResult`、および `Hook` の送信をカバーし、`Retry`、`Steer`、`Cron`、`Notification`、および `Teammate` の送信はスキップされます。したがって継続パスで発生する可能性があり、`prompt` は生のユーザー入力であると想定してはなりません。

**イベント固有のフィールド**:

```json
{
  "prompt": "current model-bound prompt for this hook invocation",
  "submitted_prompt": "optional user text captured at a supported interactive TUI submission boundary"
}
```

`submitted_prompt` はオプションです。Qwen がサポートされたインタラクティブ TUI 送信から新しい `UserQuery` に出所を伝達できる場合にのみ存在します。サポートされていないプロデューサーや、同じターンの steering、ツール結果の継続、リトライ、cron、通知、チメイトトラフィックなどのマシン駆動パスでは省略されます。ACP、ヘッドレス、`serve`、SDK、およびリモート入力パスでは、このバージョンでは生成されません。

遅延入力は、出所が完全に維持されている場合にフィールドを保持することがあります。結合されたバッチは、構成要素の各項目に出所がある場合にのみ出所を保持します。編集された、部分的に既知の、またはその他の曖昧な入力はフィールドを省略します。プロンプト、コマンド、およびシェルの履歴ナビゲーションまたは選択された検索マッチ、クロス再起動のスタッシュ復元、および会話の rewind 復元も、出所なしでモデルバインドされたテキストを表面に出す可能性があるため、フィールドを省略します。ユーザー送信テキストを必要とするコンシューマーは、不在を `prompt` にフォールバックするのではなく、利用不可として扱うべきです。

復元または出所利用不可のモデルバインドされた入力がクリアまたは送信された後、composer はその undo および redo 履歴もクリアします。これにより、マーカーまたはサイドカーが消費された後に undo が展開されたテキストを復元するのを防ぎます。

大きなペーストプレースホルダーは `submitted_prompt` 内でコンパクトなままです。展開されたペースト内容は `prompt` にのみ表示されます。コンシューマーはフィールドをクリップボード入力のバイト単位の記録ではなく、TUI テキスト投影として扱うべきです。

Vim モードが有効になっている間に存在する空でない入力は、Vim が無効にされた後も `submitted_prompt` を省略します。これは、このバージョンでは Vim レジスタが出所を伝達しないためです。この保守的なルールは、Vim を有効にする前に記入された下書きもカバーします。composer をクリアすると、新しい対象入力が開始されます。

このフィールドは出所であり、認証、テナント ID、認可、または DLP ではありません。呼び出し元から提供されたデータです。このイベント用に設定されたすべての executor がそれを受け取ります。特に、HTTP フックはそれをエンドポイントに送信し、プロンプトフックはそれをモデルプロバイダーに送信します。

両方のフィールドが存在する場合、プロンプトフックのペイロードには重複するテキストが含まれ、追加のモデル入力トークンを消費する可能性があります。このバージョンにはフックごとのフィールド抑制はありません。

連続する UserPromptSubmit フックは `additionalContext` を `prompt` に追加できます。`submitted_prompt` はキャプチャされた送信を引き続き表します。関数フックは信頼された同一プロセス内のコードであり、不変性保証によって制約されません。

**出力オプション**:

- `decision`: "allow", "deny", "block", または "ask"
- `reason`: 決定に関する人間が読める形式の説明
- `hookSpecificOutput.additionalContext`: プロンプトに追加する追加コンテキスト（オプション）

モデルに送信されると、注入された `additionalContext` は予約された `<qwen:user-prompt-submit-context>...</qwen:user-prompt-submit-context>` タグでラップされた独自のメッセージパートとして追加されるため、モデル履歴とセッションのトランスクリプトでユーザーが作成したテキストと区別できるようになります。フック出力内の山括弧はラッピング前にエスケープされるため、フックの内容がタグを閉じたり偽造したりすることはできません。セッションのトランスクリプトはユーザーの元のプロンプトテキストも個別に記録し、インタラクティブ TUI と ACP/エクスポートのトランスクリプト再生パスは注入されたコンテキストではなく元のテキストを表示します。

**注**: `UserPromptSubmitOutput` は `HookOutput` を継承しているため、すべての標準フィールドが利用可能ですが、`hookSpecificOutput` 内の `additionalContext` のみがこのイベントに対して具体的に定義されています。

**出力例**:

```json
{
  "decision": "allow",
  "reason": "Prompt reviewed and approved",
  "hookSpecificOutput": {
    "additionalContext": "Remember to follow company coding standards."
  }
}
```

#### SessionStart

**目的**: 新しいセッションが開始されたときに実行され、初期化タスクを実行します。

**イベント固有のフィールド**:

```json
{
  "permission_mode": "default | plan | auto_edit | yolo",
  "source": "startup | resume | clear | compact",
  "model": "the model being used",
  "agent_type": "the type of agent if applicable (optional)"
}
```

**出力オプション**:

- `hookSpecificOutput.additionalContext`: セッションで利用可能にするコンテキスト
- 標準的な hook 出力フィールド

**出力例**:

```json
{
  "hookSpecificOutput": {
    "additionalContext": "Session started with security policies enabled."
  }
}
```

#### SessionEnd

**目的**: セッションが終了したときに実行され、クリーンアップタスクを実行します。

**イベント固有のフィールド**:

```json
{
  "reason": "clear | logout | prompt_input_exit | bypass_permissions_disabled | other"
}
```

**出力オプション**:

- 標準的な hook 出力フィールド（通常、ブロッキングには使用されません）

#### SessionDelete

**目的**: 明示的に選択されたセッションが完全に削除された後に実行されます。このイベントは fire-and-forget です。出力や失敗によって削除を取り消すことはできません。

**イベント固有のフィールド**:

```json
{
  "deleted_session_id": "the session that was deleted"
}
```

フックは削除側のランタイムの通常のセッションフィールド（`session_id`、`transcript_path`、`cwd`）を使用します。ACP 経由では、削除側のランタイムは独自のトランスクリプトを持たないため、`transcript_path` は空です。`SessionDelete` は現在、インタラクティブな `/delete` フローと ACP の明示的な `deleteSession` メソッドで発生します。デーモン REST バッチ削除と内部クリーンアップでは発生しません。

#### MessageDisplay

**目的**: アシスタントの応答がストリーミングされる中で繰り返し発生します — ターンの最後に1回だけ発生する `Stop` の前に便利です。ライブナレーション、増分ログ記録、または応答が書かれている間にリアルタイムで反応したいコンシューマーに適しています。これは **fire-and-forget** イベントであり、フックの出力と終了コードは無視されます。

**イベント固有のフィールド**:

```json
{
  "message_id": "stable id for the whole streamed message",
  "displayed_text": "the CUMULATIVE text streamed so far for this message (not a delta)",
  "is_final": "true on the last firing for this message, false otherwise"
}
```

`displayed_text` はデルタではなく累積です。各発生にそれまでの全テキストが含まれるため、フックスクリプトはチャンクを自分で再組み立てする必要がありません。発生はデバウンスされます（最大約200ms間隔）が、最終発生（`is_final: true`）はメッセージが終了したときに常に発生するため、デバウンスウィンドウを待って応答の末尾が削除されることはありません。

**配信セマンティクス** — フックスクリプトが依存できるもの:

- **遅いフックはより少なく、より新しいペイロードを受け取ります。** メッセージごとに実行中のミッドストリームフック実行は最大1つです。1つが実行中の間、より新しいデバウンスされたペイロードは後ろに積み重なるのではなく、キューに入れられたものを**置き換えます**。デバウンスウィンドウより遅いフックは中間スナップショットをスキップします。各ペイロードが完全な累積テキストを持つため、損失はありません。
- **`is_final` は古い配信の背後でキューに入れられることはありません。** 最終ペイロードはメッセージが終了した瞬間にディスパッチされます。まだ実行中のミッドストリーム実行がある場合でも同じです（1つずつのルールの唯一の例外で、同じ理由で正当化されます。最終累積テキストはその実行が処理しているものを厳密に置き換えます）。フックは常に `is_final` ペイロードを受け取り、`Stop` フックが発生する前に受け取ります。ステートフルフックに対する1つの結果。最終実行が置き換えられたミッドストリーム実行と重なるとき、それらの**完了**順序は不定です。古い実行が最終実行の後に完了する可能性があります（`Stop` の後でも）。`is_final` を `message_id` ごとに終端として扱い、最後の実行が最新の状態を持つと想定するのではなく、累積テキストを優先してください。
- **ターンは `is_final` 配信の完了を待ちます — しかし永遠ではありません。** ターンの終了（および `Stop` フックが発生するとき）は、最終配信の完了まで最大5秒待ちます。その予算内で完了するフックは最も強い保証を保持します。ヘッドレス実行（`qwen -p ...`）はフックが完了した後にのみ終了し、`is_final` 実行は `Stop` が開始する前に完了します。それより遅いフックも最初に `is_final` を受け取ります。完了の待ち時間だけが制限されます。ターミナル UI または ACP セッションでは、実行はバックグラウンドで単に完了し、ヘッドレス実行は待たずに終了します。フックプロセスは終了時に kill されません。自分で完了するように残されます。そのため、`qwen -p … && next-step` をチェーンするスクリプトは、遅いフックがまだ実行中でも `next-step` が開始されるのを観察できます。このタイムアウトに達すると、stderr に警告が出力されます。
- **キャンセルの動作はタイミングに依存します。** **`is_final` がディスパッチされる前**にキャンセルされたターンは `is_final` を発生させません。メッセージは放棄されたものとして扱われ、`is_final` までバッファリングするコンシューマーはキャンセルの沈黙をフラッシュ/破棄シグナルとして扱うべきです（例: タイムアウトフォールバック）。基準は、すべてのチャンクがすでにストリーミングされたかどうかではなく、ターンが終了した時点での abort シグナルの状態です。そのチェックの直前のギャップに到達した abort でも、実際にはテキストの到着が完了していたメッセージの `is_final` を抑制する可能性があります。**`is_final` がディスパッチされた後**（drain 待ち中）にキャンセルするのは異なります。まだ実行中のフック実行は途中で終了させられる可能性がありますが（SIGTERM）、ペイロード自体はすでに配信されています。
- **`displayed_text` は `is_final` まで暫定的です。** それまでにストリーミングされた内容を反映します。中間ペイロードは表示状態として扱い、権威ある最終内容としては扱わないでください。
- **ツールを使用するターンは複数のメッセージを生成します。** 各モデル呼び出しは独自の `message_id` と独自の `is_final: true` 発生を持ちます。ツール呼び出し前のテキストが1つのメッセージで、ツール結果後の継続が別のメッセージです。表示テキストを生成しないモデル呼び出し（ツール呼び出しのみ）は何も発生させません。

**注**: ターミナル UI、ヘッドレス（`-p`）、および ACP（IDE/エディター/`qwen serve`）セッションで発生し、すべてのサーフェスで同じペイロード契約が適用されます。

#### Stop

**目的**: Qwen が応答を完了する前に実行され、最終的なフィードバックや要約を提供します。

**イベント固有のフィールド**:

```json
{
  "stop_hook_active": "boolean indicating if stop hook is active",
  "last_assistant_message": "the last message from the assistant",
  "context_usage": "ratio of context window used (may exceed 1 when tokens exceed window; optional)",
  "context_limit": "context window size in tokens (optional)",
  "input_tokens": "prompt token count (may include output tokens depending on provider; optional)"
}
```

`context_usage`、`context_limit`、および `input_tokens` フィールドを使用すると、hook スクリプトはコンテキストの使用状況を監視し、カスタムのコンパクト戦略を実装できます。たとえば、使用量がカスタム閾値を超えたときに `/compact` を実行するようリマインダーを出力するスクリプトなどです。

**出力オプション**:

- `decision`: "allow"、"deny"、"block"、または "ask"
- `reason`: 決定に関する人間が読める形式の説明
- `stopReason`: 停止レスポンスに含めるフィードバック
- `continue`: 実行を停止するために false に設定
- `hookSpecificOutput.additionalContext`: 追加のコンテキスト情報

**注**: `StopOutput` は `HookOutput` を継承しているため、すべての標準フィールドが利用可能ですが、`stopReason` フィールドはこのイベントにおいて特に重要です。

**出力例**:

```json
{
  "decision": "block",
  "reason": "Must be provided when Qwen Code is blocked from stopping"
}
```

#### StopFailure

**目的**: API エラーまたはループ検出によってターンが終了したときに実行されます（`Stop` の代わりに）。これは「投げっぱなし（fire-and-forget）」イベントであり、hook の出力と終了コードは無視されます。

**イベント固有のフィールド**:

```json
{
  "error": "rate_limit | authentication_failed | billing_error | invalid_request | server_error | max_output_tokens | loop_detected | unknown",
  "error_details": "detailed error message (optional)",
  "last_assistant_message": "the last message from the assistant before the error (optional)"
}
```
**Matcher**: `error` フィールドに対してマッチングを行います。例えば、`"matcher": "rate_limit"` と指定すると、レートリミットエラーの場合のみトリガーされます。

**出力オプション**:

- **None** - StopFailure は fire-and-forget（投げっぱなし）です。すべてのフック出力と終了コードは無視されます。

**終了コードの処理**:

| 終了コード | 動作 |
| --------- | ------------------------- |
| Any       | 無視される（fire-and-forget） |

**設定例**:

```json
{
  "hooks": {
    "StopFailure": [
      {
        "matcher": "rate_limit",
        "hooks": [
          {
            "type": "command",
            "command": "/path/to/rate-limit-alert.sh",
            "name": "rate-limit-alerter"
          }
        ]
      }
    ]
  }
}
```

**ユースケース**:

- レートリミットの監視とアラート
- 認証失敗のログ記録
- 課金エラーの通知
- エラー統計の収集

#### SubagentStart

**目的**: サブエージェント（Task ツールなど）が起動した際に、コンテキストや権限を設定するために実行されます。

**イベント固有のフィールド**:

```json
{
  "permission_mode": "default | plan | auto_edit | yolo",
  "agent_id": "identifier for the subagent",
  "agent_type": "type of agent (Bash, Explorer, Plan, Custom, etc.)"
}
```

**出力オプション**:

- `hookSpecificOutput.additionalContext`: サブエージェントの初期コンテキスト
- 標準的なフック出力フィールド

**出力例**:

```json
{
  "hookSpecificOutput": {
    "additionalContext": "Subagent initialized with restricted permissions."
  }
}
```

#### SubagentStop

**目的**: サブエージェントが終了した際に、最終処理を行うために実行されます。

**イベント固有のフィールド**:

```json
{
  "permission_mode": "default | plan | auto_edit | yolo",
  "stop_hook_active": "boolean indicating if stop hook is active",
  "agent_id": "identifier for the subagent",
  "agent_type": "type of agent",
  "agent_transcript_path": "path to the subagent's transcript",
  "last_assistant_message": "the last message from the subagent"
}
```

**出力オプション**:

- `decision`: "allow", "deny", "block", または "ask"
- `reason`: 決定に対する人間が読める形式の説明

**出力例**:

```json
{
  "decision": "block",
  "reason": "Must be provided when Qwen Code is blocked from stopping"
}
```

#### PreCompact

**目的**: 会話のコンパクション（圧縮）前に、コンパクションの準備やログ記録を行うために実行されます。

**イベント固有のフィールド**:

```json
{
  "trigger": "manual | auto",
  "custom_instructions": "custom instructions currently set"
}
```

**出力オプション**:

- `hookSpecificOutput.additionalContext`: コンパクション前に含めるコンテキスト
- 標準的なフック出力フィールド

**出力例**:

```json
{
  "hookSpecificOutput": {
    "additionalContext": "Compacting conversation to maintain optimal context window."
  }
}
```

#### PostCompact

**目的**: 会話のコンパクション完了後に、サマリーのアーカイブや使用状況の追跡を行うために実行されます。

**イベント固有のフィールド**:

```json
{
  "trigger": "manual | auto",
  "compact_summary": "the summary generated by the compaction process"
}
```

**Matcher**: `trigger` フィールドに対してマッチングを行います。例えば、`"matcher": "manual"` と指定すると、`/compact` コマンドによる手動コンパクションの場合のみトリガーされます。

**出力オプション**:

- `hookSpecificOutput.additionalContext`: 追加のコンテキスト（ログ記録用）
- 標準的なフック出力フィールド（ログ記録用）

> [!note]
> PostCompact は、公式の decision モードでサポートされているイベントリストには含まれて**いません**。 `decision` フィールドやその他の制御フィールドは制御効果を生成せず、ログ記録の目的でのみ使用されます。

**終了コードの処理**:

| 終了コード | 動作                                                  |
| --------- | --------------------------------------------------------- |
| 0         | 成功 - 詳細モードでユーザーに stdout が表示される            |
| Other     | 非ブロッキングエラー - 詳細モードでユーザーに stderr が表示される |

**設定例**:

```json
{
  "hooks": {
    "PostCompact": [
      {
        "matcher": "manual",
        "hooks": [
          {
            "type": "command",
            "command": "/path/to/save-compact-summary.sh",
            "name": "save-summary"
          }
        ]
      }
    ]
  }
}
```

**ユースケース**:

- サマリーのファイルやデータベースへのアーカイブ
- 使用状況統計の追跡
- コンテキスト変更の監視
- コンパクション操作の監査ログ

#### Notification

**目的**: 通知が送信される際に、通知をカスタマイズまたはインターセプトするために実行されます。

**イベント固有のフィールド**:

```json
{
  "message": "notification message content",
  "title": "notification title (optional)",
  "notification_type": "permission_prompt | idle_prompt | auth_success"
}
```

> [!note]
> `elicitation_dialog` タイプは定義されていますが、現在実装されていません。

**出力オプション**:

- `hookSpecificOutput.additionalContext`: 含める追加情報
- 標準的なフック出力フィールド

**出力例**:

```json
{
  "hookSpecificOutput": {
    "additionalContext": "Notification processed by monitoring system."
  }
}
```

#### PermissionRequest

**目的**: 権限ダイアログが表示される際に、決定を自動化したり権限を更新したりするために実行されます。

**イベント固有のフィールド**:

```json
{
  "permission_mode": "default | plan | auto_edit | yolo",
  "tool_name": "name of the tool requesting permission",
  "tool_input": "object containing the tool's input parameters",
  "permission_suggestions": "array of suggested permissions (optional)"
}
```

**出力オプション**:

- `hookSpecificOutput.decision`: 権限決定の詳細を含む構造化オブジェクト:
  - `behavior`: "allow" または "deny"
  - `updatedInput`: 変更されたツール入力（オプション）
  - `updatedPermissions`: 変更された権限（オプション）
  - `message`: ユーザーに表示するメッセージ（オプション）
  - `interrupt`: ワークフローを中断するかどうか（オプション）

**出力例**:

```json
{
  "hookSpecificOutput": {
    "decision": {
      "behavior": "allow",
      "message": "Permission granted based on security policy",
      "interrupt": false
    }
  }
}
```

#### TodoCreated

**目的**: `todo_write` ツール経由で新しい todo アイテムが作成された際に実行されます。todo の作成に対するバリデーション、ログ記録、またはブロックを可能にします。

Todo フックは 2 つのフェーズで実行されます:

- `validation`: 永続化前に実行されます。このフェーズはバリデーション専用です。`block` または `deny` を返すと書き込みが防止されます。
- `postWrite`: 永続化後に実行されます。このフェーズはログ記録や同期などの副作用専用です。`block` または `deny` はこのフェーズでは無視されます。

**イベント固有のフィールド**:

```json
{
  "todo_id": "unique identifier for the todo item",
  "todo_content": "content/description of the todo item",
  "todo_status": "pending | in_progress | completed",
  "all_todos": "array of all todo items in the current list",
  "phase": "validation | postWrite"
}
```

**出力オプション**:

- `decision`: "allow", "block", または "deny"
- `reason`: 決定に対する人間が読める形式の説明（ブロック時に必須）

**ブロック動作**:

`validation` フェーズ中、`decision` が `block` または `deny`（終了コード 2）の場合、todo の作成が防止されます。todo リストは変更されず、理由はモデルへのフィードバックとして提供されます。

`postWrite` フェーズ中、todo はすでに永続化されています。フックは引き続き出力を返すことができますが、`block` / `deny` は書き込みを取り消さず、バリデーションに使用すべきではありません。

**出力例（許可）**:

```json
{
  "decision": "allow",
  "reason": "Todo content validated successfully"
}
```

**出力例（ブロック）**:

```json
{
  "decision": "block",
  "reason": "Todo content too short. Minimum 5 characters required."
}
```

**フックスクリプト例**:

```bash
#!/bin/bash
# ~/.qwen/hooks/todo-validator.sh
# Validates todo content before creation

INPUT=$(cat)
CONTENT=$(echo "$INPUT" | jq -r '.todo_content')

# Check minimum length
if [ ${#CONTENT} -lt 5 ]; then
  echo '{"decision": "block", "reason": "Todo content must be at least 5 characters"}'
  exit 2
fi

# Block test-related todos
if [[ "$CONTENT" =~ "test" ]]; then
  echo '{"decision": "block", "reason": "Test todos are not allowed in production"}'
  exit 2
fi

echo '{"decision": "allow"}'
exit 0
```

**設定例**:

```json
{
  "hooks": {
    "TodoCreated": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "$HOME/.qwen/hooks/todo-validator.sh",
            "name": "todo-validator",
            "timeout": 5000
          }
        ]
      }
    ]
  }
}
```

#### TodoCompleted

**目的**: todo アイテムが完了としてマークされた際に実行されます。todo の完了に対するバリデーション、ログ記録、またはブロックを可能にします。

Todo フックは 2 つのフェーズで実行されます:

- `validation`: 永続化前に実行されます。このフェーズはバリデーション専用です。`block` または `deny` を返すと書き込みが防止されます。
- `postWrite`: 永続化後に実行されます。このフェーズはログ記録や同期などの副作用専用です。`block` または `deny` はこのフェーズでは無視されます。

**イベント固有のフィールド**:

```json
{
  "todo_id": "unique identifier for the todo item",
  "todo_content": "content/description of the todo item",
  "previous_status": "pending | in_progress (status before completion)",
  "all_todos": "array of all todo items in the current list",
  "phase": "validation | postWrite"
}
```

**出力オプション**:

- `decision`: "allow", "block", または "deny"
- `reason`: 決定に対する人間が読める形式の説明（ブロック時に必須）

**ブロック動作**:

`validation` フェーズ中、`decision` が `block` または `deny`（終了コード 2）の場合、todo の完了が防止されます。todo アイテムは前のステータスのままとなり、理由はモデルへのフィードバックとして提供されます。

`postWrite` フェーズ中、todo はすでに永続化されています。フックは引き続き出力を返すことができますが、`block` / `deny` は書き込みを取り消さず、バリデーションに使用すべきではありません。

**出力例（許可）**:

```json
{
  "decision": "allow",
  "reason": "Todo completion approved"
}
```

**出力例（ブロック）**:

```json
{
  "decision": "block",
  "reason": "Cannot complete this todo until dependent tasks are finished."
}
```

**フックスクリプト例**:

```bash
#!/bin/bash
# ~/.qwen/hooks/todo-completion-validator.sh
# Validates todo completion conditions

INPUT=$(cat)
TODO_ID=$(echo "$INPUT" | jq -r '.todo_id')
ALL_TODOS=$(echo "$INPUT" | jq -r '.all_todos')

# Check if there are incomplete dependent todos (example logic)
INCOMPLETE_COUNT=$(echo "$ALL_TODOS" | jq '[.[] | select(.status != "completed")] | length')

if [ "$INCOMPLETE_COUNT" -gt 5 ]; then
  echo '{"decision": "block", "reason": "Too many incomplete todos. Complete other tasks first."}'
  exit 2
fi

echo '{"decision": "allow"}'
exit 0
```

**設定例**:

```json
{
  "hooks": {
    "TodoCompleted": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "$HOME/.qwen/hooks/todo-completion-validator.sh",
            "name": "completion-validator",
            "timeout": 5000
          }
        ]
      }
    ]
  }
}
```

**ユースケース**:

- **ログ記録**: 監査や分析のために todo の作成と完了を追跡する
- **バリデーション**: コンテンツの品質基準（最小文字数、必須キーワードなど）を強制する
- **ワークフロー制御**: 前提条件が満たされるまで完了をブロックする
- **連携**: todo を外部のタスク管理システム（Jira、Trello など）と同期する

## フックの設定

フックは Qwen Code の設定、通常は `.qwen/settings.json` またはユーザー設定ファイルで設定されます:

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "^run_shell_command$",
        "sequential": false,
        "hooks": [
          {
            "type": "command",
            "command": "/path/to/security-check.sh",
            "name": "security-check",
            "description": "Run security checks before tool execution",
            "timeout": 30000
          }
        ]
      }
    ],
    "SessionStart": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "echo 'Session started'",
            "name": "session-init"
          }
        ]
      }
    ]
  }
}
```

## フックの実行
### 並列実行と逐次実行

- デフォルトでは、パフォーマンス向上のためフックは並列で実行されます
- 順序に依存する実行を強制するには、フック定義で `sequential: true` を使用します
- 逐次フックは、チェーン内の後続フックの入力を変更できます

### 非同期フック

非同期実行をサポートするのは `command` 型のみです。`"async": true` を設定すると、メインフローをブロックせずにバックグラウンドでフックが実行されます。

**機能:**

- 決定制御を返すことはできません（操作はすでに発生しています）
- 結果は、次の会話ターンで `systemMessage` または `additionalContext` を介して注入されます
- 監査、ログ記録、バックグラウンドテストなどに適しています

**例:**

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "write_file|edit",
        "hooks": [
          {
            "type": "command",
            "command": "$QWEN_PROJECT_DIR/.qwen/hooks/run-tests-async.sh",
            "async": true,
            "timeout": 300000
          }
        ]
      }
    ]
  }
}
```

```bash
#!/bin/bash
INPUT=$(cat)
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // empty')
if [[ "$FILE_PATH" != *.ts && "$FILE_PATH" != *.js ]]; then exit 0; fi
RESULT=$(npm test 2>&1)
if [ $? -eq 0 ]; then
  echo "{\"systemMessage\": \"Tests passed after editing $FILE_PATH\"}"
else
  echo "{\"systemMessage\": \"Tests failed: $RESULT\"}"
fi
```

### セキュリティモデル

- フックはユーザー権限でユーザー環境内で実行されます
- プロジェクトレベルのフックには、信頼されたフォルダの状態が必要です
- タイムアウトにより、ハングするフックを防ぎます（デフォルト: 60秒）

## ベストプラクティス

### 例1: セキュリティ検証フック

危険なコマンドをログに記録し、場合によってはブロックする `PreToolUse` フック:

**security_check.sh**

```bash
#!/bin/bash

# Read input from stdin
INPUT=$(cat)

# Parse the input to extract tool info
TOOL_NAME=$(echo "$INPUT" | jq -r '.tool_name')
TOOL_INPUT=$(echo "$INPUT" | jq -r '.tool_input')

# Check for potentially dangerous operations
if echo "$TOOL_INPUT" | grep -qiE "(rm.*-rf|mv.*\/|chmod.*777)"; then
  echo '{
    "hookSpecificOutput": {
      "hookEventName": "PreToolUse",
      "permissionDecision": "deny",
      "permissionDecisionReason": "Security policy blocks dangerous command"
    }
  }'
  exit 2  # Blocking error
fi

# Log the operation
echo "INFO: Tool $TOOL_NAME executed safely at $(date)" >> /var/log/qwen-security.log

# Allow with additional context
echo '{
  "hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "permissionDecision": "allow",
    "permissionDecisionReason": "Security check passed",
    "additionalContext": "Command approved by security policy"
  }
}'
exit 0
```

`.qwen/settings.json` で設定します:

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "${SECURITY_CHECK_SCRIPT}",
            "name": "security-checker",
            "description": "Security validation for bash commands",
            "timeout": 10000
          }
        ]
      }
    ]
  }
}
```

### 例2: HTTP 監査フック

すべてのツール実行レコードをリモート監査サービスに送信する `PostToolUse` HTTP フック:

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "*",
        "hooks": [
          {
            "type": "http",
            "url": "https://audit.example.com/api/tool-execution",
            "headers": {
              "Authorization": "Bearer ${AUDIT_API_TOKEN}",
              "Content-Type": "application/json"
            },
            "allowedEnvVars": ["AUDIT_API_TOKEN"],
            "timeout": 10,
            "name": "audit-logger"
          }
        ]
      }
    ]
  }
}
```

### 例3: インタラクティブ TUI 送信プロンプト検証フック

現在のモデルバインドされた内容を確認するには、代わりに `prompt` を読んでください。そのフィールドには生成または展開された内容が含まれる可能性があり、元のユーザー入力ではなく、`UserPromptSubmit` がすべてのモデル送信をカバーすることを意味するものではありません。ソースの出所が必要な場合に `submitted_prompt` から `prompt` に黙ってフォールバックしないでください。

サポートされたインタラクティブ TUI 送信に対して機密情報の検証を行い、長いプロンプトに対してコンテキストを提供する `UserPromptSubmit` フック。ソースの出所が利用できない呼び出しはスキップします。キーワードチェックは例示であり、完全な DLP ポリシーではありません。

**prompt_validator.py**

```python
import json
import sys
import re

# Load input from stdin
try:
    input_data = json.load(sys.stdin)
except json.JSONDecodeError as e:
    print(f"Error: Invalid JSON input: {e}", file=sys.stderr)
    sys.exit(1)

user_prompt = input_data.get("submitted_prompt")
if user_prompt is None:
    # Do not mistake model-bound or machine-generated content for raw input.
    sys.exit(0)

# Sensitive words list
sensitive_words = ["password", "secret", "token", "api_key"]

# Check for sensitive information
for word in sensitive_words:
    if re.search(rf"\b{word}\b", user_prompt.lower()):
        # Block prompts containing sensitive information
        output = {
            "decision": "block",
            "reason": f"Prompt contains sensitive information '{word}'. Please remove sensitive content and resubmit.",
            "hookSpecificOutput": {
                "hookEventName": "UserPromptSubmit"
            }
        }
        print(json.dumps(output))
        sys.exit(0)

# Check prompt length and add warning context if too long
if len(user_prompt) > 1000:
    output = {
        "hookSpecificOutput": {
            "hookEventName": "UserPromptSubmit",
            "additionalContext": "Note: User submitted a long prompt. Please read carefully and ensure all requirements are understood."
        }
    }
    print(json.dumps(output))
    sys.exit(0)

# No processing needed for normal cases
sys.exit(0)
```

## トラブルシューティング

- フック実行の詳細についてはアプリケーションログを確認してください
- フックスクリプトの権限と実行可能性を確認してください
- フックの出力でJSONフォーマットが正しいことを確認してください
- 意図しないフック実行を避けるために、特定の `matcher` パターンを使用してください
- `--debug` モードを使用して、フックのマッチングと実行の詳細情報を確認してください。プロンプトフックの入力はセッションデバッグログに書き込まれる可能性があるため、適切なアクセスと保持の制御を適用してください。
- すべてのフックを一時的に無効にする: 設定で `"disableAllHooks": true` を追加します