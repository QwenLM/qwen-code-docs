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

### Function Hooks

関数フックは、登録された JavaScript/TypeScript 関数を直接呼び出します。これらは Skill システムによって内部的に使用されており、現在エンドユーザー向けのパブリック API としては公開されていません。

**注**: ほとんどのユースケースでは、設定ファイルで設定できる**コマンドフック**または **HTTP フック**を代わりに使用してください。

### Prompt Hooks

プロンプトフックは LLM を使用してフック入力を評価し、判断を返します。これは、操作を許可するかブロックするかを決定するなど、コンテキストに基づいたインテリジェントな判断を行う場合に便利です。

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
- `UserPromptSubmit` - ユーザープロンプトを評価または拡張

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

## Hook Events

フックは、Qwen Code セッション中の特定の時点で発生します。イベントごとに、トリガー条件をフィルタリングするための異なる matcher がサポートされています。

| Event                | Triggered When                            | Matcher Target                                            |
| :------------------- | :---------------------------------------- | :-------------------------------------------------------- |
| `PreToolUse`         | ツール実行前                     | ツール名（`WriteFile`、`ReadFile`、`Bash` など）         |
| `PostToolUse`        | ツールの正常な実行後           | ツール名                                                 |
| `PostToolUseFailure` | ツール実行の失敗後                | ツール名                                                 |
| `UserPromptSubmit`   | ユーザーがプロンプトを送信した後                 | なし（常に発生）                                       |
| `SessionStart`       | セッションの開始または再開時            | ソース（`startup`、`resume`、`clear`、`compact`）          |
| `SessionEnd`         | セッションの終了時                         | 理由（`clear`、`logout`、`prompt_input_exit` など）     |
| `Stop`               | Claude がレスポンスの終了を準備しているとき | なし（常に発生）                                       |
| `SubagentStart`      | サブエージェントの開始時                      | エージェントタイプ（`Bash`、`Explorer`、`Plan` など）             |
| `SubagentStop`       | サブエージェントの停止時                       | エージェントタイプ                                                |
| `PreCompact`         | 会話の圧縮前            | トリガー（`manual`、`auto`）                                |
| `Notification`       | 通知の送信時               | タイプ（`permission_prompt`、`idle_prompt`、`auth_success`） |
| `PermissionRequest`  | 権限ダイアログの表示時           | ツール名                                                 |
| `TodoCreated`        | 新しい todo アイテムが作成されたとき           | なし（常に発生）                                       |
| `TodoCompleted`      | todo アイテムが完了としてマークされたとき   | なし（常に発生）                                       |
### マッチャーパターン

`matcher` はトリガー条件をフィルタリングするために使用される正規表現です。

| イベントタイプ          | イベント                                                                 | Matcher サポート | Matcher ターゲット                                           |
| :------------------ | :--------------------------------------------------------------------- | :-------------- | :------------------------------------------------------- |
| ツールイベント         | `PreToolUse`, `PostToolUse`, `PostToolUseFailure`, `PermissionRequest` | ✅ 正規表現        | ツール名: `WriteFile`, `ReadFile`, `Bash` など         |
| サブエージェントイベント     | `SubagentStart`, `SubagentStop`                                        | ✅ 正規表現        | エージェントタイプ: `Bash`, `Explorer` など                     |
| セッションイベント      | `SessionStart`                                                         | ✅ 正規表現        | ソース: `startup`, `resume`, `clear`, `compact`          |
| セッションイベント      | `SessionEnd`                                                           | ✅ 正規表現        | 理由: `clear`, `logout`, `prompt_input_exit` など     |
| 通知イベント | `Notification`                                                         | ✅ 完全一致  | タイプ: `permission_prompt`, `idle_prompt`, `auth_success` |
| コンパクトイベント      | `PreCompact`                                                           | ✅ 完全一致  | トリガー: `manual`, `auto`                                |
| Todo イベント         | `TodoCreated`, `TodoCompleted`                                         | ❌ なし           | N/A                                                      |
| プロンプトイベント       | `UserPromptSubmit`                                                     | ❌ なし           | N/A                                                      |
| 停止イベント         | `Stop`                                                                 | ❌ なし           | N/A                                                      |

**Matcher 構文:**

- 空文字列 `""` または `"*"` は、そのタイプのすべてのイベントにマッチします
- 標準的な正規表現構文がサポートされています（例: `^Bash$`, `Read.*`, `(WriteFile|Edit)`）

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

### Hook 入力構造

すべての hook は、stdin（command）または POST ボディ（http）を通じて JSON 形式の標準化された入力を受け取ります。

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

**目的**: ユーザーがプロンプトを送信したときに実行され、入力の修正、検証、または拡張を行います。

**イベント固有のフィールド**:

```json
{
  "prompt": "the user's submitted prompt text"
}
```

**出力オプション**:

- `decision`: "allow"、"deny"、"block"、または "ask"
- `reason`: 決定に関する人間が読める形式の説明
- `hookSpecificOutput.additionalContext`: プロンプトに追加する追加コンテキスト（オプション）

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

**目的**: API エラーによってターンが終了したときに実行されます（`Stop` の代わりに）。これは「投げっぱなし（fire-and-forget）」イベントであり、hook の出力と終了コードは無視されます。

**イベント固有のフィールド**:

```json
{
  "error": "rate_limit | authentication_failed | billing_error | invalid_request | server_error | max_output_tokens | unknown",
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

### 例3: ユーザープロンプト検証フック

ユーザープロンプト内の機密情報を検証し、長いプロンプトに対してコンテキストを提供する `UserPromptSubmit` フック:

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

- フック実行の詳細についてはアプリケーションログを確認してください
- フックスクリプトの権限と実行可能性を確認してください
- フックの出力でJSONフォーマットが正しいことを確認してください
- 意図しないフック実行を避けるために、特定の `matcher` パターンを使用してください
- `--debug` モードを使用して、フックのマッチングと実行の詳細情報を確認してください
- すべてのフックを一時的に無効にする: 設定で `"disableAllHooks": true` を追加します