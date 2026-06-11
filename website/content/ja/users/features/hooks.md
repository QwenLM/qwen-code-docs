# Qwen Code Hooks

## 概要

Qwen Code フックは、Qwen Code アプリケーションの動作を拡張・カスタマイズするための強力なメカニズムを提供します。フックを使用すると、ツールの実行前後、セッションの開始/終了、その他の主要なイベントなど、アプリケーションライフサイクルの特定の時点でカスタムスクリプトやプログラムを実行できます。

フックはデフォルトで有効です。設定ファイルのトップレベル（`hooks` と同じ階層）で `disableAllHooks` を `true` に設定することで、すべてのフックを一時的に無効にできます。

```json
{
  "disableAllHooks": true,
  "hooks": {
    "PreToolUse": [...]
  }
}
```

これにより、設定を削除することなく、すべてのフックを無効にできます。

## フックとは

フックは、Qwen Code がアプリケーションフローの定義済みのポイントで自動的に実行するユーザー定義のスクリプトまたはプログラムです。フックを使用すると、以下のことが可能になります。

- ツールの使用状況を監視・監査する
- セキュリティポリシーを適用する
- 会話に追加のコンテキストを注入する
- イベントに基づいてアプリケーションの動作をカスタマイズする
- 外部システムやサービスと統合する
- ツールの入力やレスポンスをプログラムで変更する

## フックの種類

Qwen Code は、3 つのフック実行タイプをサポートしています。

| Type       | Description                                                                                    |
| :--------- | :--------------------------------------------------------------------------------------------- |
| `command`  | シェルコマンドを実行します。`stdin` 経由で JSON を受け取り、`stdout` 経由で結果を返します。              |
| `http`     | 指定された URL に JSON を `POST` リクエストボディとして送信します。HTTP レスポンスボディ経由で結果を返します。 |
| `function` | 登録済みの JavaScript 関数を直接呼び出します（セッションレベルのフックのみ）。                     |

### コマンドフック

コマンドフックは子プロセス経由でコマンドを実行します。入力 JSON は stdin を介して渡され、出力は stdout を介して返されます。

**設定項目:**

| Field           | Type                     | Required | Description                                 |
| :-------------- | :----------------------- | :------- | :------------------------------------------ |
| `type`          | `"command"`              | Yes      | フックの種類                                   |
| `command`       | `string`                 | Yes      | 実行するコマンド                          |
| `name`          | `string`                 | No       | フック名（ログ用）                     |
| `description`   | `string`                 | No       | フックの説明                            |
| `timeout`       | `number`                 | No       | タイムアウト時間（ミリ秒）。デフォルトは 60000      |
| `async`         | `boolean`                | No       | バックグラウンドで非同期実行するかどうか |
| `env`           | `Record<string, string>` | No       | 環境変数                       |
| `shell`         | `"bash" \| "powershell"` | No       | 使用するシェル                                |
| `statusMessage` | `string`                 | No       | 実行中に表示されるステータスメッセージ   |

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

HTTP フックは、フック入力を指定された URL への POST リクエストとして送信します。URL ホワイトリスト、DNS レベルの SSRF 保護、環境変数の展開、その他のセキュリティ機能をサポートしています。

**設定項目:**

| Field            | Type                     | Required | Description                                               |
| :--------------- | :----------------------- | :------- | :-------------------------------------------------------- |
| `type`           | `"http"`                 | Yes      | フックの種類                                                 |
| `url`            | `string`                 | Yes      | ターゲット URL                                                |
| `headers`        | `Record<string, string>` | No       | リクエストヘッダー（環境変数の展開をサポート）          |
| `allowedEnvVars` | `string[]`               | No       | URL/ヘッダーで許可される環境変数のホワイトリスト |
| `timeout`        | `number`                 | No       | タイムアウト時間（秒）。デフォルトは 600                           |
| `name`           | `string`                 | No       | フック名（ログ用）                                   |
| `statusMessage`  | `string`                 | No       | 実行中に表示されるステータスメッセージ                 |
| `once`           | `boolean`                | No       | セッション内のイベントごとに 1 回のみ実行するかどうか（HTTP フックのみ） |

**セキュリティ機能:**

- **URL Whitelist**: `allowedUrls` を介して許可された URL パターンを設定
- **SSRF Protection**: プライベート IP（10.x.x.x、172.16-31.x.x、192.168.x.x など）をブロックしますが、ループバックアドレス（127.0.0.1、::1）は許可します
- **DNS Validation**: DNS リバインディング攻撃を防ぐため、リクエスト前にドメインの解決を検証
- **Environment Variable Interpolation**: `${VAR}` 構文。`allowedEnvVars` ホワイトリストにある変数のみ許可

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

### 関数フック

関数フックは、登録済みの JavaScript/TypeScript 関数を直接呼び出します。Skill システム内部で使用されており、現時点ではエンドユーザー向けの公開 API としては公開されていません。

**注**: ほとんどのユースケースでは、設定ファイルで構成可能な **コマンドフック** または **HTTP フック** を使用してください。

## フックイベント

フックは Qwen Code セッション中の特定のポイントで発火します。異なるイベントは、トリガー条件をフィルタリングするための異なるマッチャーをサポートしています。

| Event                | Triggered When                            | Matcher Target                                            |
| :------------------- | :---------------------------------------- | :-------------------------------------------------------- |
| `PreToolUse`         | ツール実行前                     | ツール名（`WriteFile`、`ReadFile`、`Bash` など）         |
| `PostToolUse`        | ツール実行成功後           | ツール名                                                 |
| `PostToolUseFailure` | ツール実行失敗後                | ツール名                                                 |
| `UserPromptSubmit`   | ユーザーがプロンプトを送信した後                 | なし（常に発火）                                       |
| `SessionStart`       | セッションの開始または再開時            | ソース（`startup`、`resume`、`clear`、`compact`）          |
| `SessionEnd`         | セッション終了時                         | 理由（`clear`、`logout`、`prompt_input_exit` など）     |
| `Stop`               | Claude がレスポンスの結論を準備する際 | なし（常に発火）                                       |
| `SubagentStart`      | サブエージェント開始時                      | エージェントタイプ（`Bash`、`Explorer`、`Plan` など）             |
| `SubagentStop`       | サブエージェント停止時                       | エージェントタイプ                                                |
| `PreCompact`         | 会話の圧縮前            | トリガー（`manual`、`auto`）                                |
| `Notification`       | 通知送信時               | タイプ（`permission_prompt`、`idle_prompt`、`auth_success`） |
| `PermissionRequest`  | 権限ダイアログ表示時           | ツール名                                                 |

### マッチャーパターン

`matcher` はトリガー条件をフィルタリングするために使用される正規表現です。

| Event Type          | Events                                                                 | Matcher Support | Matcher Target                                           |
| :------------------ | :--------------------------------------------------------------------- | :-------------- | :------------------------------------------------------- |
| Tool Events         | `PreToolUse`, `PostToolUse`, `PostToolUseFailure`, `PermissionRequest` | ✅ Regex        | ツール名: `WriteFile`, `ReadFile`, `Bash`, etc.         |
| Subagent Events     | `SubagentStart`, `SubagentStop`                                        | ✅ Regex        | エージェントタイプ: `Bash`, `Explorer`, etc.                     |
| Session Events      | `SessionStart`                                                         | ✅ Regex        | ソース: `startup`, `resume`, `clear`, `compact`          |
| Session Events      | `SessionEnd`                                                           | ✅ Regex        | 理由: `clear`, `logout`, `prompt_input_exit`, etc.     |
| Notification Events | `Notification`                                                         | ✅ Exact match  | タイプ: `permission_prompt`, `idle_prompt`, `auth_success` |
| Compact Events      | `PreCompact`                                                           | ✅ Exact match  | トリガー: `manual`, `auto`                                |
| Prompt Events       | `UserPromptSubmit`                                                     | ❌ No           | N/A                                                      |
| Stop Events         | `Stop`                                                                 | ❌ No           | N/A                                                      |

**マッチャー構文:**

- 空文字列 `""` または `"*"` は、そのタイプのすべてのイベントに一致します
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

## 入出力ルール

### フック入力構造

すべてのフックは、stdin（コマンド）または POST ボディ（http）を介して JSON 形式の標準化された入力を受け取ります。

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

イベント固有のフィールドはフックの種類に応じて追加されます。サブエージェント内で実行される場合、`agent_id` と `agent_type` も追加で含まれます。

### フック出力構造

フックの出力は、`stdout`（コマンド）または HTTP レスポンスボディ（http）を介して JSON として返されます。

**終了コードの動作（コマンドフック）:**

| Exit Code | Behavior                                                                              |
| :-------- | :------------------------------------------------------------------------------------ |
| `0`       | 成功。`stdout` の JSON を解析して動作を制御します。                                  |
| `2`       | **ブロッキングエラー**。`stdout` を無視し、`stderr` をモデルへのエラーフィードバックとして渡します。 |
| Other     | 非ブロッキングエラー。`stderr` はデバッグモードでのみ表示され、実行は継続されます。           |

**出力構造:**

フック出力は、以下の 3 つのカテゴリのフィールドをサポートしています。

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

### 各フックイベントの詳細

#### PreToolUse

**目的**: ツールが使用される前に実行され、権限チェック、入力検証、またはコンテキストの注入を可能にします。

**イベント固有のフィールド**:

```json
{
  "permission_mode": "default | plan | auto_edit | yolo",
  "tool_name": "name of the tool being executed",
  "tool_input": "object containing the tool's input parameters",
  "tool_use_id": "unique identifier for this tool use instance"
}
```

**出力オプション**:

- `hookSpecificOutput.permissionDecision`: "allow", "deny", or "ask" (REQUIRED)
- `hookSpecificOutput.permissionDecisionReason`: explanation for the decision (REQUIRED)
- `hookSpecificOutput.updatedInput`: modified tool input parameters to use instead of original
- `hookSpecificOutput.additionalContext`: additional context information

**注**: `decision` や `reason` などの標準フック出力フィールドは基盤クラスで技術的にサポートされていますが、公式インターフェースでは `permissionDecision` と `permissionDecisionReason` を含む `hookSpecificOutput` が期待されます。

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
  "tool_use_id": "unique identifier for this tool use instance"
}
```

**出力オプション**:

- `decision`: "allow", "deny", "block" (defaults to "allow" if not specified)
- `reason`: reason for the decision
- `hookSpecificOutput.additionalContext`: additional information to be included

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

**目的**: ツール実行が失敗した際に実行され、エラーの処理、アラートの送信、または失敗の記録を行います。

**イベント固有のフィールド**:

```json
{
  "permission_mode": "default | plan | auto_edit | yolo",
  "tool_use_id": "unique identifier for the tool use",
  "tool_name": "name of the tool that failed",
  "tool_input": "object containing the tool's input parameters",
  "error": "error message describing the failure",
  "is_interrupt": "boolean indicating if failure was due to user interruption (optional)"
}
```

**出力オプション**:

- `hookSpecificOutput.additionalContext`: error handling information
- Standard hook output fields

**出力例**:

```json
{
  "hookSpecificOutput": {
    "additionalContext": "Error: File not found. Failure logged in monitoring system."
  }
}
```

#### UserPromptSubmit

**目的**: ユーザーがプロンプトを送信した際に実行され、入力の修正、検証、または拡張を行います。

**イベント固有のフィールド**:

```json
{
  "prompt": "the user's submitted prompt text"
}
```

**出力オプション**:

- `decision`: "allow", "deny", "block", or "ask"
- `reason`: human-readable explanation for the decision
- `hookSpecificOutput.additionalContext`: additional context to append to the prompt (optional)

**注**: `UserPromptSubmitOutput` は `HookOutput` を継承しているため、すべての標準フィールドが利用可能ですが、このイベントに固有に定義されているのは `hookSpecificOutput` 内の `additionalContext` のみです。

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

**目的**: 新しいセッションが開始された際に実行され、初期化タスクを実行します。

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

- `hookSpecificOutput.additionalContext`: context to be available in the session
- Standard hook output fields

**出力例**:

```json
{
  "hookSpecificOutput": {
    "additionalContext": "Session started with security policies enabled."
  }
}
```

#### SessionEnd

**目的**: セッションが終了した際に実行され、クリーンアップタスクを実行します。

**イベント固有のフィールド**:

```json
{
  "reason": "clear | logout | prompt_input_exit | bypass_permissions_disabled | other"
}
```

**出力オプション**:

- Standard hook output fields (typically not used for blocking)

#### Stop

**目的**: Qwen がレスポンスを結論付ける前に実行され、最終フィードバックや要約を提供します。

**イベント固有のフィールド**:

```json
{
  "stop_hook_active": "boolean indicating if stop hook is active",
  "last_assistant_message": "the last message from the assistant"
}
```

**出力オプション**:

- `decision`: "allow", "deny", "block", or "ask"
- `reason`: human-readable explanation for the decision
- `stopReason`: feedback to include in the stop response
- `continue`: set to false to stop execution
- `hookSpecificOutput.additionalContext`: additional context information

**注**: `StopOutput` は `HookOutput` を継承しているため、すべての標準フィールドが利用可能ですが、`stopReason` フィールドはこのイベントに特に重要です。

**出力例**:

```json
{
  "decision": "block",
  "reason": "Must be provided when Qwen Code is blocked from stopping"
}
```

#### StopFailure

**目的**: API エラーによりターンが終了した場合に実行されます（`Stop` の代わりに）。これは **fire-and-forget** イベントです。フックの出力と終了コードは無視されます。

**イベント固有のフィールド**:

```json
{
  "error": "rate_limit | authentication_failed | billing_error | invalid_request | server_error | max_output_tokens | unknown",
  "error_details": "detailed error message (optional)",
  "last_assistant_message": "the last message from the assistant before the error (optional)"
}
```

**マッチャー**: `error` フィールドに対してマッチします。例: `"matcher": "rate_limit"` はレート制限エラーに対してのみトリガーされます。

**出力オプション**:

- **None** - StopFailure is fire-and-forget. All hook output and exit codes are ignored.

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

- Rate limit monitoring and alerting
- Authentication failure logging
- Billing error notifications
- Error statistics collection

#### SubagentStart

**目的**: サブエージェント（Task ツールなど）が開始された際に実行され、コンテキストや権限の設定を行います。

**イベント固有のフィールド**:

```json
{
  "permission_mode": "default | plan | auto_edit | yolo",
  "agent_id": "identifier for the subagent",
  "agent_type": "type of agent (Bash, Explorer, Plan, Custom, etc.)"
}
```

**出力オプション**:

- `hookSpecificOutput.additionalContext`: initial context for the subagent
- Standard hook output fields

**出力例**:

```json
{
  "hookSpecificOutput": {
    "additionalContext": "Subagent initialized with restricted permissions."
  }
}
```

#### SubagentStop

**目的**: サブエージェントが終了した際に実行され、最終化タスクを実行します。

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

- `decision`: "allow", "deny", "block", or "ask"
- `reason`: human-readable explanation for the decision

**出力例**:

```json
{
  "decision": "block",
  "reason": "Must be provided when Qwen Code is blocked from stopping"
}
```

#### PreCompact

**目的**: 会話の圧縮前に実行され、圧縮の準備またはログ記録を行います。

**イベント固有のフィールド**:

```json
{
  "trigger": "manual | auto",
  "custom_instructions": "custom instructions currently set"
}
```

**出力オプション**:

- `hookSpecificOutput.additionalContext`: context to include before compaction
- Standard hook output fields

**出力例**:

```json
{
  "hookSpecificOutput": {
    "additionalContext": "Compacting conversation to maintain optimal context window."
  }
}
```

#### PostCompact

**目的**: 会話の圧縮が完了した後に実行され、要約のアーカイブや使用状況の追跡を行います。

**イベント固有のフィールド**:

```json
{
  "trigger": "manual | auto",
  "compact_summary": "the summary generated by the compaction process"
}
```

**マッチャー**: `trigger` フィールドに対してマッチします。例: `"matcher": "manual"` は `/compact` コマンドによる手動圧縮に対してのみトリガーされます。

**出力オプション**:

- `hookSpecificOutput.additionalContext`: additional context (for logging only)
- Standard hook output fields (for logging only)

**注**: `PostCompact` は公式の決定モードサポートイベントリストには含まれていません。`decision` フィールドやその他の制御フィールドは制御効果を生成せず、ログ記録目的でのみ使用されます。

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

- Summary archiving to files or databases
- Usage statistics tracking
- Context change monitoring
- Audit logging for compaction operations

#### Notification

**目的**: 通知が送信された際に実行され、通知のカスタマイズやインターセプトを行います。

**イベント固有のフィールド**:

```json
{
  "message": "notification message content",
  "title": "notification title (optional)",
  "notification_type": "permission_prompt | idle_prompt | auth_success"
}
```

> **注**: `elicitation_dialog` タイプは定義されていますが、現時点では実装されていません。

**出力オプション**:

- `hookSpecificOutput.additionalContext`: additional information to include
- Standard hook output fields

**出力例**:

```json
{
  "hookSpecificOutput": {
    "additionalContext": "Notification processed by monitoring system."
  }
}
```

#### PermissionRequest

**目的**: 権限ダイアログが表示された際に実行され、決定の自動化や権限の更新を行います。

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

- `hookSpecificOutput.decision`: structured object with permission decision details:
  - `behavior`: "allow" or "deny"
  - `updatedInput`: modified tool input (optional)
  - `updatedPermissions`: modified permissions (optional)
  - `message`: message to show to user (optional)
  - `interrupt`: whether to interrupt the workflow (optional)

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

## フックの設定

フックは Qwen Code の設定（通常は `.qwen/settings.json` またはユーザー設定ファイル）で構成されます。

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

### 並列実行と逐次実行

- デフォルトでは、パフォーマンス向上のためフックは並列で実行されます
- フック定義で `sequential: true` を使用して、順序依存の実行を強制します
- 逐次フックは、チェーン内の後続のフックへの入力を変更できます

### 非同期フック

非同期実行は `command` タイプのみがサポートしています。`"async": true` を設定すると、メインフローをブロックせずにバックグラウンドでフックが実行されます。

**機能:**

- 決定制御を返すことはできません（操作はすでに発生しているため）
- 結果は `systemMessage` または `additionalContext` を介して次の会話ターンに注入されます
- 監査、ログ記録、バックグラウンドテストなどに適しています

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
- プロジェクトレベルのフックには信頼済みフォルダーのステータスが必要です
- タイムアウトによりフックのハングを防ぎます（デフォルト: 60 秒）

## ベストプラクティス

### 例 1: セキュリティ検証フック

危険なコマンドをログに記録し、必要に応じてブロックする `PreToolUse` フック:

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

`.qwen/settings.json` で設定:

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

### 例 3: ユーザープロンプト検証フック

ユーザープロンプトの機密情報を検証し、長いプロンプトに対してコンテキストを提供する `UserPromptSubmit` フック:

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

- アプリケーションログでフック実行の詳細を確認する
- フックスクリプトの権限と実行可能性を確認する
- フック出力の JSON 形式が正しいことを確認する
- 意図しないフック実行を避けるため、特定のマッチャーパターンを使用する
- `--debug` モードを使用して、フックのマッチングと実行の詳細情報を確認する
- すべてのフックを一時的に無効にする: 設定に `"disableAllHooks": true` を追加する