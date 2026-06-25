# Qwen Code フック

## 概要

Qwen Code のフックは、Qwen Code アプリケーションの動作を拡張・カスタマイズする強力な仕組みです。フックを使うと、ツール実行前後・セッション開始終了・その他の主要なイベントなど、アプリケーションのライフサイクルの特定のタイミングでカスタムスクリプトやプログラムを実行できます。

フックはデフォルトで有効です。設定ファイルのトップレベル（`hooks` と同じ階層）で `disableAllHooks` を `true` にすると、すべてのフックを一時的に無効化できます。

```json
{
  "disableAllHooks": true,
  "hooks": {
    "PreToolUse": [...]
  }
}
```

これにより、設定を削除せずにすべてのフックを無効化できます。

## フックとは

フックは、アプリケーションフローの事前定義されたタイミングで Qwen Code が自動的に実行するユーザー定義のスクリプトやプログラムです。フックを使うと以下のことが可能になります。

- ツール使用状況の監視と監査
- セキュリティポリシーの適用
- 会話への追加コンテキストの注入
- イベントに基づくアプリケーション動作のカスタマイズ
- 外部システムやサービスとの連携
- ツールの入力や応答をプログラムで変更

## フックの種類

Qwen Code は 4 種類のフックエグゼキュータをサポートしています。

| 種別       | 説明                                                                                    |
| :--------- | :-------------------------------------------------------------------------------------- |
| `command`  | シェルコマンドを実行します。`stdin` で JSON を受け取り、`stdout` で結果を返します。      |
| `http`     | 指定した URL に JSON を `POST` リクエストのボディとして送信します。HTTP レスポンスボディで結果を返します。 |
| `function` | 登録済みの JavaScript 関数を直接呼び出します（セッションレベルのフックのみ）。          |
| `prompt`   | LLM を使ってフック入力を評価し、判断を返します。                                        |

### コマンドフック

コマンドフックは子プロセス経由でコマンドを実行します。入力 JSON は stdin 経由で渡され、出力は stdout 経由で返されます。

**設定:**

| フィールド      | 型                       | 必須 | 説明                                 |
| :-------------- | :----------------------- | :--- | :----------------------------------- |
| `type`          | `"command"`              | Yes  | フックの種別                         |
| `command`       | `string`                 | Yes  | 実行するコマンド                     |
| `name`          | `string`                 | No   | フック名（ログ用）                   |
| `description`   | `string`                 | No   | フックの説明                         |
| `timeout`       | `number`                 | No   | タイムアウト（ミリ秒）、デフォルト 60000 |
| `async`         | `boolean`                | No   | バックグラウンドで非同期実行するか   |
| `env`           | `Record<string, string>` | No   | 環境変数                             |
| `shell`         | `"bash" \| "powershell"` | No   | 使用するシェル                       |
| `statusMessage` | `string`                 | No   | 実行中に表示するステータスメッセージ |

**例:**

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "WriteFile",
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

### HTTP フック

HTTP フックはフック入力を指定した URL への POST リクエストとして送信します。URL ホワイトリスト・DNS レベルの SSRF 保護・環境変数の展開などのセキュリティ機能をサポートしています。

**設定:**

| フィールド       | 型                       | 必須 | 説明                                                    |
| :--------------- | :----------------------- | :--- | :------------------------------------------------------ |
| `type`           | `"http"`                 | Yes  | フックの種別                                            |
| `url`            | `string`                 | Yes  | 送信先 URL                                              |
| `headers`        | `Record<string, string>` | No   | リクエストヘッダー（環境変数の展開に対応）              |
| `allowedEnvVars` | `string[]`               | No   | URL/ヘッダーで使用を許可する環境変数のホワイトリスト    |
| `timeout`        | `number`                 | No   | タイムアウト（秒）、デフォルト 600                      |
| `name`           | `string`                 | No   | フック名（ログ用）                                      |
| `statusMessage`  | `string`                 | No   | 実行中に表示するステータスメッセージ                    |
| `once`           | `boolean`                | No   | セッション中のイベントごとに一度だけ実行する（HTTP フックのみ） |

**セキュリティ機能:**

- **URL ホワイトリスト**: `allowedUrls` で許可する URL パターンを設定
- **SSRF 保護**: プライベート IP（10.x.x.x、172.16-31.x.x、192.168.x.x など）をブロックし、ループバックアドレス（127.0.0.1、::1）は許可
- **DNS 検証**: DNS リバインディング攻撃を防ぐため、リクエスト前にドメイン解決を検証
- **環境変数の展開**: `${VAR}` 構文で、`allowedEnvVars` ホワイトリストに含まれる変数のみ使用可能

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

### ファンクションフック

ファンクションフックは登録済みの JavaScript/TypeScript 関数を直接呼び出します。Skill システムが内部的に使用しており、現時点ではエンドユーザー向けのパブリック API としては公開されていません。

**注意**: ほとんどのユースケースでは、設定ファイルで構成できる**コマンドフック**または **HTTP フック**を使用してください。

### プロンプトフック

プロンプトフックは LLM を使ってフック入力を評価し、判断を返します。操作を許可するか拒否するかなど、コンテキストに基づいてインテリジェントな判断を下す際に便利です。

**動作の仕組み:**

1. フック入力の JSON が `$ARGUMENTS` プレースホルダーを使ってプロンプトに注入されます
2. プロンプトが LLM（デフォルト: 現在使用中のモデル）に送信されます
3. LLM が判断を含む JSON レスポンスを返します
4. Qwen Code が判断を処理し、実行を続けるか停止するかを決定します

**設定:**

| フィールド      | 型         | 必須 | 説明                                                    |
| :-------------- | :--------- | :--- | :------------------------------------------------------ |
| `type`          | `"prompt"` | Yes  | フックの種別                                            |
| `prompt`        | `string`   | Yes  | LLM に送信するプロンプト。フック入力には `$ARGUMENTS` を使用 |
| `model`         | `string`   | No   | 使用するモデル（デフォルト: 現在のモデル）              |
| `timeout`       | `number`   | No   | タイムアウト（秒）、デフォルト 30                       |
| `name`          | `string`   | No   | フック名（ログ用）                                      |
| `description`   | `string`   | No   | フックの説明                                            |
| `statusMessage` | `string`   | No   | 実行中に表示するステータスメッセージ                    |

**レスポンス形式:**

LLM は以下の構造の JSON を返す必要があります。

```json
{
  "ok": true,
  "reason": "判断の説明",
  "additionalContext": "会話に注入するオプションのコンテキスト"
}
```

| フィールド          | 説明                                                                   |
| :------------------ | :--------------------------------------------------------------------- |
| `ok`                | `true` で許可/続行、`false` でブロック/停止                            |
| `reason`            | `ok` が `false` のときに必須。ブロック理由をモデルに説明するために使用 |
| `additionalContext` | 省略可能。許可時に会話に注入する追加コンテキスト                       |

**対応するイベント:**

プロンプトフックはほとんどのフックイベントで使用できます。

- `PreToolUse` - ツール呼び出しを許可するか評価
- `PostToolUse` - ツールの結果を評価し、必要に応じてコンテキストを注入
- `Stop` - 続行するか停止するかを判断
- `SubagentStop` - サブエージェントの結果を評価
- `UserPromptSubmit` - ユーザーのプロンプトを評価または補完

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
        "matcher": "Bash",
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

## フックイベント

フックは Qwen Code セッションの特定のタイミングで発火します。イベントによってトリガー条件をフィルタリングするマッチャーが異なります。

| イベント             | 発火するタイミング                              | マッチャーの対象                                                |
| :------------------- | :---------------------------------------------- | :-------------------------------------------------------------- |
| `PreToolUse`         | ツール実行前                                    | ツール名（`WriteFile`、`ReadFile`、`Bash` など）                |
| `PostToolUse`        | ツール実行が成功した後                          | ツール名                                                        |
| `PostToolUseFailure` | ツール実行が失敗した後                          | ツール名                                                        |
| `UserPromptSubmit`   | ユーザーがプロンプトを送信した後                | なし（常に発火）                                                |
| `SessionStart`       | セッション開始または再開時                      | ソース（`startup`、`resume`、`clear`、`compact`）               |
| `SessionEnd`         | セッション終了時                                | 理由（`clear`、`logout`、`prompt_input_exit` など）             |
| `Stop`               | Qwen がレスポンスの締めくくりを準備するとき     | なし（常に発火）                                                |
| `SubagentStart`      | サブエージェント開始時                          | エージェントの種別（`Bash`、`Explorer`、`Plan` など）           |
| `SubagentStop`       | サブエージェント停止時                          | エージェントの種別                                              |
| `PreCompact`         | 会話の圧縮前                                    | トリガー（`manual`、`auto`）                                    |
| `Notification`       | 通知送信時                                      | 種別（`permission_prompt`、`idle_prompt`、`auth_success`）      |
| `PermissionRequest`  | 権限ダイアログ表示時                            | ツール名                                                        |
| `TodoCreated`        | 新しい Todo アイテムが作成されたとき            | なし（常に発火）                                                |
| `TodoCompleted`      | Todo アイテムが完了としてマークされたとき       | なし（常に発火）                                                |

### マッチャーパターン

`matcher` はトリガー条件をフィルタリングするための正規表現です。

| イベント種別        | イベント                                                               | マッチャーのサポート | マッチャーの対象                                                 |
| :------------------ | :--------------------------------------------------------------------- | :------------------- | :--------------------------------------------------------------- |
| ツールイベント      | `PreToolUse`、`PostToolUse`、`PostToolUseFailure`、`PermissionRequest` | ✅ 正規表現          | ツール名: `WriteFile`、`ReadFile`、`Bash` など                   |
| サブエージェントイベント | `SubagentStart`、`SubagentStop`                                   | ✅ 正規表現          | エージェント種別: `Bash`、`Explorer` など                        |
| セッションイベント  | `SessionStart`                                                         | ✅ 正規表現          | ソース: `startup`、`resume`、`clear`、`compact`                  |
| セッションイベント  | `SessionEnd`                                                           | ✅ 正規表現          | 理由: `clear`、`logout`、`prompt_input_exit` など                |
| 通知イベント        | `Notification`                                                         | ✅ 完全一致          | 種別: `permission_prompt`、`idle_prompt`、`auth_success`         |
| 圧縮イベント        | `PreCompact`                                                           | ✅ 完全一致          | トリガー: `manual`、`auto`                                       |
| Todo イベント       | `TodoCreated`、`TodoCompleted`                                         | ❌ なし              | N/A                                                              |
| プロンプトイベント  | `UserPromptSubmit`                                                     | ❌ なし              | N/A                                                              |
| 停止イベント        | `Stop`                                                                 | ❌ なし              | N/A                                                              |

**マッチャーの構文:**

- 空文字列 `""` または `"*"` はその種別のすべてのイベントにマッチ
- 標準的な正規表現構文をサポート（例: `^Bash$`、`Read.*`、`(WriteFile|Edit)`）

**例:**

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "^Bash$",
        "hooks": [
          {
            "type": "command",
            "command": "echo 'bash check' >> /tmp/hooks.log"
          }
        ]
      },
      {
        "matcher": "Write.*",
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

## 入出力のルール

### フック入力の構造

すべてのフックは標準化された JSON 形式の入力を stdin（command）または POST ボディ（http）経由で受け取ります。

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

フックの種別に応じてイベント固有のフィールドが追加されます。サブエージェント内で実行される場合は、`agent_id` と `agent_type` も追加されます。

### フック出力の構造

フックの出力は `stdout`（command）または HTTP レスポンスボディ（http）経由で JSON として返されます。

**終了コードの動作（コマンドフック）:**

| 終了コード | 動作                                                                              |
| :--------- | :-------------------------------------------------------------------------------- |
| `0`        | 成功。`stdout` の JSON を解析して動作を制御します。                               |
| `2`        | **ブロッキングエラー**。`stdout` を無視し、`stderr` をエラーフィードバックとしてモデルに渡します。 |
| その他     | 非ブロッキングエラー。`stderr` はデバッグモードのみ表示され、実行は続行します。   |

**出力構造:**

フックの出力は 3 種類のフィールドカテゴリをサポートしています。

1. **共通フィールド**: `continue`、`stopReason`、`suppressOutput`、`systemMessage`
2. **トップレベルの判断**: `decision`、`reason`（一部のイベントで使用）
3. **イベント固有の制御**: `hookSpecificOutput`（`hookEventName` を含む必要あり）

```json
{
  "continue": true,
  "decision": "allow",
  "reason": "操作が承認されました",
  "hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "additionalContext": "追加のコンテキスト情報"
  }
}
```

### 各フックイベントの詳細

#### PreToolUse

**目的**: ツールが使用される前に実行され、権限チェック・入力検証・コンテキスト注入などを行います。

**イベント固有フィールド**:

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

- `hookSpecificOutput.permissionDecision`: "allow"、"deny"、"ask"（必須）
- `hookSpecificOutput.permissionDecisionReason`: 判断の理由（必須）
- `hookSpecificOutput.updatedInput`: 元の入力の代わりに使用する変更済みツール入力パラメータ
- `hookSpecificOutput.additionalContext`: 追加のコンテキスト情報

**注意**: 基底クラスでは `decision` や `reason` といった標準のフック出力フィールドも技術的にはサポートされていますが、公式インターフェースは `permissionDecision` と `permissionDecisionReason` を含む `hookSpecificOutput` を期待しています。

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

**目的**: ツールが正常に完了した後に実行され、結果の処理・ログ記録・追加コンテキストの注入などを行います。

**イベント固有フィールド**:

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

- `decision`: "allow"、"deny"、"block"（指定しない場合は "allow"）
- `reason`: 判断の理由
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

**目的**: ツールの実行が失敗したときに実行され、エラー処理・アラート送信・失敗の記録などを行います。

**イベント固有フィールド**:

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

- `hookSpecificOutput.additionalContext`: エラー処理に関する情報
- 標準のフック出力フィールド

**出力例**:

```json
{
  "hookSpecificOutput": {
    "additionalContext": "Error: File not found. Failure logged in monitoring system."
  }
}
```

#### UserPromptSubmit

**目的**: ユーザーがプロンプトを送信したときに実行され、入力の変更・検証・補完などを行います。

**イベント固有フィールド**:

```json
{
  "prompt": "the user's submitted prompt text"
}
```

**出力オプション**:

- `decision`: "allow"、"deny"、"block"、"ask"
- `reason`: 判断の理由（人間が読める形式）
- `hookSpecificOutput.additionalContext`: プロンプトに追加する追加コンテキスト（省略可能）

**注意**: `UserPromptSubmitOutput` は `HookOutput` を継承しているため、すべての標準フィールドが使用できますが、このイベントに固有の定義があるのは `hookSpecificOutput` 内の `additionalContext` のみです。

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

**目的**: 新しいセッションが開始するときに実行され、初期化タスクを行います。

**イベント固有フィールド**:

```json
{
  "permission_mode": "default | plan | auto_edit | yolo",
  "source": "startup | resume | clear | compact",
  "model": "the model being used",
  "agent_type": "the type of agent if applicable (optional)"
}
```

**出力オプション**:

- `hookSpecificOutput.additionalContext`: セッションで利用可能なコンテキスト
- 標準のフック出力フィールド

**出力例**:

```json
{
  "hookSpecificOutput": {
    "additionalContext": "Session started with security policies enabled."
  }
}
```

#### SessionEnd

**目的**: セッションが終了するときに実行され、クリーンアップタスクを行います。

**イベント固有フィールド**:

```json
{
  "reason": "clear | logout | prompt_input_exit | bypass_permissions_disabled | other"
}
```

**出力オプション**:

- 標準のフック出力フィールド（通常はブロッキングには使用しません）

#### Stop

**目的**: Qwen がレスポンスを締めくくる前に実行され、最終的なフィードバックやサマリーを提供します。

**イベント固有フィールド**:

```json
{
  "stop_hook_active": "boolean indicating if stop hook is active",
  "last_assistant_message": "the last message from the assistant"
}
```

**出力オプション**:

- `decision`: "allow"、"deny"、"block"、"ask"
- `reason`: 判断の理由（人間が読める形式）
- `stopReason`: 停止レスポンスに含めるフィードバック
- `continue`: `false` に設定すると実行を停止
- `hookSpecificOutput.additionalContext`: 追加のコンテキスト情報

**注意**: `StopOutput` は `HookOutput` を継承しているため、すべての標準フィールドが使用できますが、このイベントでは特に `stopReason` フィールドが重要です。

**出力例**:

```json
{
  "decision": "block",
  "reason": "Must be provided when Qwen Code is blocked from stopping"
}
```

#### StopFailure

**目的**: API エラーによってターンが終了したとき（Stop の代わりに）実行されます。これは**ファイア・アンド・フォーゲット**イベントであり、フックの出力と終了コードは無視されます。

**イベント固有フィールド**:

```json
{
  "error": "rate_limit | authentication_failed | billing_error | invalid_request | server_error | max_output_tokens | unknown",
  "error_details": "detailed error message (optional)",
  "last_assistant_message": "the last message from the assistant before the error (optional)"
}
```

**マッチャー**: `error` フィールドに対してマッチします。例えば `"matcher": "rate_limit"` はレートリミットエラーのみでトリガーされます。

**出力オプション**:

- **なし** - StopFailure はファイア・アンド・フォーゲットです。すべてのフック出力と終了コードは無視されます。

**終了コードの処理**:

| Exit Code | Behavior                  |
| --------- | ------------------------- |
| Any       | Ignored (fire-and-forget) |

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

**目的**: サブエージェント（Task ツールなど）が開始するときに実行され、コンテキストや権限を設定します。

**イベント固有フィールド**:

```json
{
  "permission_mode": "default | plan | auto_edit | yolo",
  "agent_id": "identifier for the subagent",
  "agent_type": "type of agent (Bash, Explorer, Plan, Custom, etc.)"
}
```

**出力オプション**:

- `hookSpecificOutput.additionalContext`: サブエージェントの初期コンテキスト
- 標準のフック出力フィールド

**出力例**:

```json
{
  "hookSpecificOutput": {
    "additionalContext": "Subagent initialized with restricted permissions."
  }
}
```

#### SubagentStop

**目的**: サブエージェントが終了するときに実行され、後処理タスクを行います。

**イベント固有フィールド**:

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

- `decision`: "allow"、"deny"、"block"、"ask"
- `reason`: 判断の理由（人間が読める形式）

**出力例**:

```json
{
  "decision": "block",
  "reason": "Must be provided when Qwen Code is blocked from stopping"
}
```

#### PreCompact

**目的**: 会話の圧縮前に実行され、圧縮の準備やログ記録を行います。

**イベント固有フィールド**:

```json
{
  "trigger": "manual | auto",
  "custom_instructions": "custom instructions currently set"
}
```

**出力オプション**:

- `hookSpecificOutput.additionalContext`: 圧縮前に含めるコンテキスト
- 標準のフック出力フィールド

**出力例**:

```json
{
  "hookSpecificOutput": {
    "additionalContext": "Compacting conversation to maintain optimal context window."
  }
}
```

#### PostCompact

**目的**: 会話の圧縮完了後に実行され、サマリーのアーカイブや使用状況の追跡などを行います。

**イベント固有フィールド**:

```json
{
  "trigger": "manual | auto",
  "compact_summary": "the summary generated by the compaction process"
}
```

**マッチャー**: `trigger` フィールドに対してマッチします。例えば `"matcher": "manual"` は `/compact` コマンドによる手動圧縮のみでトリガーされます。

**出力オプション**:

- `hookSpecificOutput.additionalContext`: 追加のコンテキスト（ログ用のみ）
- 標準のフック出力フィールド（ログ用のみ）

**注意**: PostCompact は公式の決定モード対応イベントリストに含まれていません。`decision` フィールドなどの制御フィールドは制御効果を持たず、ログ目的のみで使用されます。

**終了コードの処理**:

| Exit Code | Behavior                                                  |
| --------- | --------------------------------------------------------- |
| 0         | Success - stdout shown to user in verbose mode            |
| Other     | Non-blocking error - stderr shown to user in verbose mode |

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

- ファイルやデータベースへのサマリーアーカイブ
- 使用統計の追跡
- コンテキスト変更の監視
- 圧縮操作の監査ログ

#### Notification

**目的**: 通知が送信されるときに実行され、通知のカスタマイズやインターセプトを行います。

**イベント固有フィールド**:

```json
{
  "message": "notification message content",
  "title": "notification title (optional)",
  "notification_type": "permission_prompt | idle_prompt | auth_success"
}
```

> **Note**: `elicitation_dialog` タイプは定義されていますが、現時点では未実装です。

**出力オプション**:

- `hookSpecificOutput.additionalContext`: 含める追加情報
- 標準のフック出力フィールド

**出力例**:

```json
{
  "hookSpecificOutput": {
    "additionalContext": "Notification processed by monitoring system."
  }
}
```

#### PermissionRequest

**目的**: 権限ダイアログが表示されるときに実行され、判断の自動化や権限の更新などを行います。

**イベント固有フィールド**:

```json
{
  "permission_mode": "default | plan | auto_edit | yolo",
  "tool_name": "name of the tool requesting permission",
  "tool_input": "object containing the tool's input parameters",
  "permission_suggestions": "array of suggested permissions (optional)"
}
```

**出力オプション**:

- `hookSpecificOutput.decision`: 権限の判断詳細を含む構造化オブジェクト:
  - `behavior`: "allow" または "deny"
  - `updatedInput`: 変更済みのツール入力（省略可能）
  - `updatedPermissions`: 変更済みの権限（省略可能）
  - `message`: ユーザーに表示するメッセージ（省略可能）
  - `interrupt`: ワークフローを中断するか（省略可能）

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

**目的**: `todo_write` ツールで新しい Todo アイテムが作成されたときに実行されます。Todo 作成の検証・ログ記録・ブロックが可能です。

Todo フックは 2 つのフェーズで実行されます。

- `validation`: 永続化前に実行されます。このフェーズは検証のみに使用してください。`block` または `deny` を返すと書き込みが防止されます。
- `postWrite`: 永続化後に実行されます。このフェーズはログ記録や同期などのサイドエフェクトに使用してください。`block` や `deny` はこのフェーズでは無視されます。

**イベント固有フィールド**:

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

- `decision`: "allow"、"block"、"deny"
- `reason`: 判断の理由（人間が読める形式、ブロック時は必須）

**ブロッキングの動作**:

`validation` フェーズで `decision` が `block` または `deny`（終了コード 2）の場合、Todo の作成が防止されます。Todo リストは変更されず、理由がモデルへのフィードバックとして提供されます。

`postWrite` フェーズでは Todo はすでに永続化されています。フックは引き続き出力を返せますが、`block` / `deny` は書き込みを元に戻さないため、検証には使用しないでください。

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

**目的**: Todo アイテムが完了としてマークされたときに実行されます。Todo 完了の検証・ログ記録・ブロックが可能です。

Todo フックは 2 つのフェーズで実行されます。

- `validation`: 永続化前に実行されます。このフェーズは検証のみに使用してください。`block` または `deny` を返すと書き込みが防止されます。
- `postWrite`: 永続化後に実行されます。このフェーズはログ記録や同期などのサイドエフェクトに使用してください。`block` や `deny` はこのフェーズでは無視されます。

**イベント固有フィールド**:

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

- `decision`: "allow"、"block"、"deny"
- `reason`: 判断の理由（人間が読める形式、ブロック時は必須）

**ブロッキングの動作**:

`validation` フェーズで `decision` が `block` または `deny`（終了コード 2）の場合、Todo の完了が防止されます。Todo アイテムは以前のステータスのままとなり、理由がモデルへのフィードバックとして提供されます。

`postWrite` フェーズでは Todo はすでに永続化されています。フックは引き続き出力を返せますが、`block` / `deny` は書き込みを元に戻さないため、検証には使用しないでください。

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

- **ログ記録**: 監査や分析のために Todo の作成・完了を追跡
- **検証**: コンテンツ品質基準の適用（最小文字数、必須キーワードなど）
- **ワークフロー制御**: 前提条件が満たされるまで完了をブロック
- **連携**: 外部タスク管理システム（Jira、Trello など）と Todo を同期

## フックの設定

フックは Qwen Code の設定（通常は `.qwen/settings.json` またはユーザー設定ファイル）で構成します。

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "^Bash$",
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

### 並列実行と順次実行

- デフォルトでは、パフォーマンス向上のためフックは並列で実行されます
- 順序依存の実行を強制するには、フック定義で `sequential: true` を指定します
- 順次実行のフックはチェーン内の後続フックへの入力を変更できます

### 非同期フック

非同期実行をサポートするのは `command` タイプのみです。`"async": true` を設定すると、メインフローをブロックせずにバックグラウンドでフックを実行します。

**特徴:**

- 判断の制御は返せません（操作はすでに発生しています）
- 結果は `systemMessage` または `additionalContext` を通じて次の会話ターンで注入されます
- 監査・ログ記録・バックグラウンドテストなどに適しています

**例:**

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "WriteFile|Edit",
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

- フックはユーザーの環境でユーザー権限で実行されます
- プロジェクトレベルのフックには信頼済みフォルダーステータスが必要です
- タイムアウトにより、フックのハングを防止します（デフォルト: 60 秒）

## ベストプラクティス

### 例 1: セキュリティ検証フック

危険なコマンドをログに記録し、必要に応じてブロックする PreToolUse フックです。

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

`.qwen/settings.json` で設定します。

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

### 例 2: HTTP 監査フック

すべてのツール実行記録をリモートの監査サービスに送信する PostToolUse HTTP フックです。

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

### 例 3: ユーザープロンプト検証フック

ユーザーのプロンプトに含まれる機密情報を検証し、長いプロンプトにはコンテキストを追加する UserPromptSubmit フックです。

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
    exit(1)

user_prompt = input_data.get("prompt", "")

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
        exit(0)

# Check prompt length and add warning context if too long
if len(user_prompt) > 1000:
    output = {
        "hookSpecificOutput": {
            "hookEventName": "UserPromptSubmit",
            "additionalContext": "Note: User submitted a long prompt. Please read carefully and ensure all requirements are understood."
        }
    }
    print(json.dumps(output))
    exit(0)

# No processing needed for normal cases
exit(0)
```

## トラブルシューティング

- フックの実行詳細はアプリケーションログで確認してください
- フックスクリプトのパーミッションと実行可能性を確認してください
- フックの出力が適切な JSON 形式になっているか確認してください
- 意図しないフックの実行を避けるため、具体的なマッチャーパターンを使用してください
- `--debug` モードを使用すると、フックのマッチングと実行に関する詳細情報が表示されます
- すべてのフックを一時的に無効化するには、設定に `"disableAllHooks": true` を追加してください
