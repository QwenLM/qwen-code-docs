# Qwen Code フック ドキュメント

## 概要

Qwen Code のフックは、Qwen Code アプリケーションの動作を拡張・カスタマイズするための強力なメカニズムを提供します。フックを使用すると、ツールの実行前後、セッションの開始/終了、その他の主要なイベントなど、アプリケーションライフサイクルの特定の時点でカスタムスクリプトやプログラムを実行できます。

フックはデフォルトで有効です。設定ファイルのトップレベル（`hooks` と同じ階層）で `disableAllHooks` を `true` に設定することで、すべてのフックを一時的に無効にできます。

```json
{
  "disableAllHooks": true,
  "hooks": {
    "PreToolUse": [...]
  }
}
```

これにより、設定を削除することなく、すべてのフックを無効化できます。

## フックとは？

フックは、Qwen Code がアプリケーションフローの定義済みのポイントで自動的に実行するユーザー定義のスクリプトまたはプログラムです。フックを使用することで、以下のことが可能になります。

- ツールの使用状況の監視と監査
- セキュリティポリシーの適用
- 会話への追加コンテキストの注入
- イベントに応じたアプリケーション動作のカスタマイズ
- 外部システムやサービスとの統合
- ツールの入力やレスポンスのプログラムによる変更

## フックのアーキテクチャ

Qwen Code のフックシステムは、以下の主要コンポーネントで構成されています。

1. **Hook Registry**: 設定されたすべてのフックを保存・管理
2. **Hook Planner**: 各イベントで実行すべきフックを決定
3. **Hook Runner**: 適切なコンテキストで個別のフックを実行
4. **Hook Aggregator**: 複数のフックからの結果を結合
5. **Hook Event Handler**: イベントに対するフックの発火を調整

## フックイベント

フックは Qwen Code セッション中の特定のポイントで発火します。イベントが発火し、マッチャーが一致すると、Qwen Code はイベントに関する JSON コンテキストをフックハンドラーに渡します。コマンドフックの場合、入力は stdin で受信されます。ハンドラーは入力を検査し、アクションを実行し、必要に応じて決定を返すことができます。一部のイベントはセッション中に 1 回だけ発火しますが、他のイベントはエージェントループ内で繰り返し発火します。

<div align="center">
<img src="https://img.alicdn.com/imgextra/i4/O1CN01sYWUTh1RDJl7Lz2ne_!!6000000002077-2-tps-812-1212.png" alt="Hook Lifecycle Diagram" width="400"/>
</div>

以下の表は、Qwen Code で利用可能なすべてのフックイベントを示しています。

| イベント名           | 説明                                 | ユースケース                                        |
| -------------------- | ------------------------------------------- | ----------------------------------------------- |
| `PreToolUse`         | ツール実行前に発火                 | 権限チェック、入力検証、ログ記録  |
| `PostToolUse`        | ツール実行成功後に発火       | ログ記録、出力処理、モニタリング          |
| `PostToolUseFailure` | ツール実行失敗時に発火             | エラーハンドリング、アラート通知、復旧処理           |
| `Notification`       | 通知送信時に発火           | 通知のカスタマイズ、ログ記録             |
| `UserPromptSubmit`   | ユーザーがプロンプトを送信したときに発火            | 入力処理、検証、コンテキスト注入 |
| `SessionStart`       | 新規セッション開始時に発火             | 初期化、コンテキスト設定                   |
| `Stop`               | Qwen がレスポンスを完了する前に発火    | 最終処理、クリーンアップ                           |
| `SubagentStart`      | サブエージェント開始時に発火                | サブエージェントの初期化                         |
| `SubagentStop`       | サブエージェント停止時に発火                 | サブエージェントの最終処理                           |
| `PreCompact`         | 会話のコンパクション前に発火        | コンパクション前処理                       |
| `SessionEnd`         | セッション終了時に発火                   | クリーンアップ、レポート作成                              |
| `PermissionRequest`  | 権限ダイアログ表示時に発火 | 権限の自動化、ポリシー適用       |

## 入出力ルール

### フックの入力構造

すべてのフックは、stdin を介して JSON 形式の標準化された入力を受け取ります。すべてのフックイベントに共通して含まれるフィールドは以下の通りです。

```json
{
  "session_id": "string",
  "transcript_path": "string",
  "cwd": "string",
  "hook_event_name": "string",
  "timestamp": "string"
}
```

イベント固有のフィールドはフックの種類に応じて追加されます。以下に、各フックイベントの固有フィールドを示します。

### 各フックイベントの詳細

#### PreToolUse

**目的**: 権限チェック、入力検証、コンテキスト注入を可能にするため、ツール使用の前に実行されます。

**イベント固有フィールド**:

```json
{
  "permission_mode": "default | plan | auto_edit | yolo",
  "tool_name": "name of the tool being executed",
  "tool_input": "object containing the tool's input parameters",
  "tool_use_id": "unique identifier for this tool use instance"
}
```

**出力オプション**:

- `hookSpecificOutput.permissionDecision`: "allow", "deny", or "ask"（必須）
- `hookSpecificOutput.permissionDecisionReason`: 決定の理由（必須）
- `hookSpecificOutput.updatedInput`: 元の代わりに使用する変更後のツール入力パラメータ
- `hookSpecificOutput.additionalContext`: 追加のコンテキスト情報

**注記**: 基盤クラスでは `decision` や `reason` などの標準フック出力フィールドも技術的にサポートされていますが、公式インターフェースでは `permissionDecision` と `permissionDecisionReason` を含む `hookSpecificOutput` が期待されます。

**出力例**:

```json
{
  "hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "permissionDecision": "allow",
    "permissionDecisionReason": "My reason here",
    "updatedInput": {
      "field_to_modify": "new value"
    },
    "additionalContext": "Current environment: production. Proceed with caution."
  }
}
```

#### PostToolUse

**目的**: ツールが正常に完了した後に実行され、結果の処理、結果のログ記録、追加コンテキストの注入を行います。

**イベント固有フィールド**:

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

- `decision`: "allow", "deny", "block"（指定しない場合はデフォルトで "allow"）
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

**目的**: ツール実行が失敗した際に実行され、エラーハンドリング、アラート送信、失敗の記録を行います。

**イベント固有フィールド**:

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

- `hookSpecificOutput.additionalContext`: エラーハンドリング情報
- 標準フック出力フィールド

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

**イベント固有フィールド**:

```json
{
  "prompt": "the user's submitted prompt text"
}
```

**出力オプション**:

- `decision`: "allow", "deny", "block", or "ask"
- `reason`: 決定の人間が読める形式の説明
- `hookSpecificOutput.additionalContext`: プロンプトに追加するコンテキスト（任意）

**注記**: `UserPromptSubmitOutput` は `HookOutput` を継承しているため、すべての標準フィールドが利用可能ですが、このイベントで特に定義されているのは `hookSpecificOutput` 内の `additionalContext` のみです。

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

**目的**: 新規セッション開始時に実行され、初期化タスクを実行します。

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

- `hookSpecificOutput.additionalContext`: セッション内で利用可能にするコンテキスト
- 標準フック出力フィールド

**出力例**:

```json
{
  "hookSpecificOutput": {
    "additionalContext": "Session started with security policies enabled."
  }
}
```

#### SessionEnd

**目的**: セッション終了時に実行され、クリーンアップタスクを実行します。

**イベント固有フィールド**:

```json
{
  "reason": "clear | logout | prompt_input_exit | bypass_permissions_disabled | other"
}
```

**出力オプション**:

- 標準フック出力フィールド（通常、ブロック目的では使用されません）

#### Stop

**目的**: Qwen がレスポンスを完了する前に実行され、最終フィードバックや要約を提供します。

**イベント固有フィールド**:

```json
{
  "stop_hook_active": "boolean indicating if stop hook is active",
  "last_assistant_message": "the last message from the assistant"
}
```

**出力オプション**:

- `decision`: "allow", "deny", "block", or "ask"
- `reason`: 決定の人間が読める形式の説明
- `stopReason`: 停止レスポンスに含めるフィードバック
- `continue`: 実行を停止する場合は false に設定
- `hookSpecificOutput.additionalContext`: 追加のコンテキスト情報

**注記**: `StopOutput` は `HookOutput` を継承しているため、すべての標準フィールドが利用可能ですが、このイベントでは `stopReason` フィールドが特に重要です。

**出力例**:

```json
{
  "decision": "block",
  "reason": "Must be provided when Qwen Code is blocked from stopping"
}
```

#### SubagentStart

**目的**: サブエージェント（Task ツールなど）が開始された際に実行され、コンテキストや権限の設定を行います。

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
- 標準フック出力フィールド

**出力例**:

```json
{
  "hookSpecificOutput": {
    "additionalContext": "Subagent initialized with restricted permissions."
  }
}
```

#### SubagentStop

**目的**: サブエージェントが終了した際に実行され、最終処理タスクを実行します。

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

- `decision`: "allow", "deny", "block", or "ask"
- `reason`: 決定の人間が読める形式の説明

**出力例**:

```json
{
  "decision": "block",
  "reason": "Must be provided when Qwen Code is blocked from stopping"
}
```

#### PreCompact

**目的**: 会話のコンパクション前に実行され、コンパクションの準備やログ記録を行います。

**イベント固有フィールド**:

```json
{
  "trigger": "manual | auto",
  "custom_instructions": "custom instructions currently set"
}
```

**出力オプション**:

- `hookSpecificOutput.additionalContext`: コンパクション前に含めるコンテキスト
- 標準フック出力フィールド

**出力例**:

```json
{
  "hookSpecificOutput": {
    "additionalContext": "Compacting conversation to maintain optimal context window."
  }
}
```

#### Notification

**目的**: 通知送信時に実行され、通知のカスタマイズやインターセプトを行います。

**イベント固有フィールド**:

```json
{
  "message": "notification message content",
  "title": "notification title (optional)",
  "notification_type": "permission_prompt | idle_prompt | auth_success"
}
```

> **注記**: `elicitation_dialog` タイプは定義されていますが、現在実装されていません。

**出力オプション**:

- `hookSpecificOutput.additionalContext`: 含める追加情報
- 標準フック出力フィールド

**出力例**:

```json
{
  "hookSpecificOutput": {
    "additionalContext": "Notification processed by monitoring system."
  }
}
```

#### PermissionRequest

**目的**: 権限ダイアログ表示時に実行され、決定の自動化や権限の更新を行います。

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

- `hookSpecificOutput.decision`: 権限決定の詳細を含む構造化オブジェクト:
  - `behavior`: "allow" または "deny"
  - `updatedInput`: 変更後のツール入力（任意）
  - `updatedPermissions`: 変更後の権限（任意）
  - `message`: ユーザーに表示するメッセージ（任意）
  - `interrupt`: ワークフローを中断するかどうか（任意）

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

フックは Qwen Code の設定（通常は `.qwen/settings.json` またはユーザー設定ファイル）で構成します。

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "^bash$", // Regex to match tool names
        "sequential": false, // Whether to run hooks sequentially
        "hooks": [
          {
            "type": "command",
            "command": "/path/to/script.sh",
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

### マッチャーパターン

マッチャーを使用すると、コンテキストに基づいてフックをフィルタリングできます。すべてのフックイベントがマッチャーをサポートしているわけではありません。

| イベントタイプ          | イベント                                                                 | マッチャーサポート | マッチャー対象（値）                                                                |
| ------------------- | ---------------------------------------------------------------------- | --------------- | -------------------------------------------------------------------------------------- |
| ツールイベント         | `PreToolUse`, `PostToolUse`, `PostToolUseFailure`, `PermissionRequest` | ✅ あり（正規表現）  | ツール名: `bash`, `read_file`, `write_file`, `edit`, `glob`, `grep_search` など      |
| サブエージェントイベント     | `SubagentStart`, `SubagentStop`                                        | ✅ あり（正規表現）  | エージェントタイプ: `Bash`, `Explorer` など                                                   |
| セッションイベント      | `SessionStart`                                                         | ✅ あり（正規表現）  | ソース: `startup`, `resume`, `clear`, `compact`                                        |
| セッションイベント      | `SessionEnd`                                                           | ✅ あり（正規表現）  | 理由: `clear`, `logout`, `prompt_input_exit`, `bypass_permissions_disabled`, `other` |
| 通知イベント | `Notification`                                                         | ✅ あり（完全一致）  | タイプ: `permission_prompt`, `idle_prompt`, `auth_success`                               |
| コンパクションイベント      | `PreCompact`                                                           | ✅ あり（完全一致）  | トリガー: `manual`, `auto`                                                              |
| プロンプトイベント       | `UserPromptSubmit`                                                     | ❌ なし           | N/A                                                                                    |
| 停止イベント         | `Stop`                                                                 | ❌ なし           | N/A                                                                                    |

**マッチャー構文**:

- 対象フィールドに対してマッチする正規表現パターン
- 空文字列 `""` または `"*"` は、そのタイプのすべてのイベントにマッチ
- 標準的な正規表現構文をサポート（例: `^bash$`, `read.*`, `(bash|run_shell_command)`）

**例**:

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "^bash$",           // bash ツールのみにマッチ
        "hooks": [...]
      },
      {
        "matcher": "read.*",           // read_file, read_multiple_files などにマッチ
        "hooks": [...]
      },
      {
        "matcher": "",                 // すべてのツールにマッチ（"*" と同じ、またはマッチャーを省略した場合）
        "hooks": [...]
      }
    ],
    "SubagentStart": [
      {
        "matcher": "^(Bash|Explorer)$", // Bash と Explorer エージェントのみにマッチ
        "hooks": [...]
      }
    ],
    "SessionStart": [
      {
        "matcher": "^(startup|resume)$", // startup と resume ソースのみにマッチ
        "hooks": [...]
      }
    ]
  }
}
```

## フックの実行

### 並列実行と逐次実行

- デフォルトでは、パフォーマンス向上のためフックは並列で実行されます
- 順序依存の実行を強制するには、フック定義で `sequential: true` を使用します
- 逐次フックは、チェーン内の後続のフックへの入力を変更できます

### セキュリティモデル

- フックはユーザーの権限でユーザー環境内で実行されます
- プロジェクトレベルのフックには、信頼済みフォルダーのステータスが必要です
- タイムアウトによりフックのハングを防ぎます（デフォルト: 60 秒）

### 終了コード

フックスクリプトは終了コードを通じて結果を伝えます。

| 終了コード | 意味            | 動作                                        |
| --------- | ------------------ | ----------------------------------------------- |
| `0`       | 成功            | stdout/stderr は表示されない                         |
| `2`       | ブロックエラー     | stderr をモデルに表示し、ツール呼び出しをブロック        |
| その他     | 非ブロックエラー | stderr をユーザーのみに表示し、ツール呼び出しは継続 |

**例**:

```bash
#!/bin/bash

# 成功（exit 0 はデフォルトのため省略可能）
echo '{"decision": "allow"}'
exit 0

# ブロックエラー - 操作を防止
echo "Dangerous operation blocked by security policy" >&2
exit 2
```

> **注記**: 終了コードが指定されていない場合、スクリプトはデフォルトで `0`（成功）になります。

## ベストプラクティス

### 例 1: セキュリティ検証フック

危険なコマンドをログに記録し、必要に応じてブロックする PreToolUse フック:

**security_check.sh**

```bash
#!/bin/bash

# stdin から入力を読み取る
INPUT=$(cat)

# 入力を解析してツール情報を抽出
TOOL_NAME=$(echo "$INPUT" | jq -r '.tool_name')
TOOL_INPUT=$(echo "$INPUT" | jq -r '.tool_input')

# 危険な操作の可能性をチェック
if echo "$TOOL_INPUT" | grep -qiE "(rm.*-rf|mv.*\/|chmod.*777)"; then
  echo '{
    "decision": "deny",
    "reason": "Potentially dangerous operation detected",
    "hookSpecificOutput": {
      "hookEventName": "PreToolUse",
      "permissionDecision": "deny",
      "permissionDecisionReason": "Dangerous command blocked by security policy"
    }
  }'
  exit 2  # ブロックエラー
fi

# 操作を許可し、ログを記録
echo "INFO: Tool $TOOL_NAME executed safely at $(date)" >> /var/log/qwen-security.log

# 追加コンテキスト付きで許可
echo '{
  "decision": "allow",
  "reason": "Operation approved by security checker",
  "hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "permissionDecision": "allow",
    "permissionDecisionReason": "Security check passed",
    "additionalContext": "Command approved by security policy"
  }
}'
exit 0
```

`.qwen/settings.json` での設定:

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

### 例 2: ユーザープロンプト検証フック

機密情報の有無を検証し、長いプロンプトに対してコンテキストを提供する UserPromptSubmit フック:

**prompt_validator.py**

```python
import json
import sys
import re

# stdin から入力を読み込む
try:
    input_data = json.load(sys.stdin)
except json.JSONDecodeError as e:
    print(f"Error: Invalid JSON input: {e}", file=sys.stderr)
    exit(1)

user_prompt = input_data.get("prompt", "")

# 機密単語リスト
sensitive_words = ["password", "secret", "token", "api_key"]

# 機密情報のチェック
for word in sensitive_words:
    if re.search(rf"\b{word}\b", user_prompt.lower()):
        # 機密情報を含むプロンプトをブロック
        output = {
            "decision": "block",
            "reason": f"Prompt contains sensitive information '{word}'. Please remove sensitive content and resubmit.",
            "hookSpecificOutput": {
                "hookEventName": "UserPromptSubmit"
            }
        }
        print(json.dumps(output))
        exit(0)

# プロンプトの長さをチェックし、長すぎる場合は警告コンテキストを追加
if len(user_prompt) > 1000:
    output = {
        "hookSpecificOutput": {
            "hookEventName": "UserPromptSubmit",
            "additionalContext": "Note: User submitted a long prompt. Please read carefully and ensure all requirements are understood."
        }
    }
    print(json.dumps(output))
    exit(0)

# 通常時は処理不要
exit(0)
```

## トラブルシューティング

- アプリケーションログでフック実行の詳細を確認する
- フックスクリプトの権限と実行可能性を確認する
- フック出力の JSON 形式が正しいことを確認する
- 意図しないフック実行を避けるため、特定のマッチャーパターンを使用する