# Qwen Code フック

## 概要

Qwen Code フックは、Qwen Code アプリケーションの動作を拡張・カスタマイズするための強力なメカニズムを提供します。フックを使用すると、ツール実行前、ツール実行後、セッション開始/終了時、その他の主要なイベントといった、アプリケーションライフサイクルの特定の時点でカスタムスクリプトやプログラムを実行できます。

フックはデフォルトで有効です。設定ファイルで `disableAllHooks` を `true` に設定すると (`hooks` と同じ階層に配置)、すべてのフックを一時的に無効化できます:

```json
{
  "disableAllHooks": true,
  "hooks": {
    "PreToolUse": [...]
  }
}
```

これにより、フックの設定を削除せずにすべてのフックが無効化されます。

## フックとは

フックは、ユーザーが定義したスクリプトやプログラムで、アプリケーションフローの所定の時点で Qwen Code によって自動的に実行されます。フックを使用すると、以下のことが可能になります:

- ツール使用状況の監視と監査
- セキュリティポリシーの適用
- 会話への追加コンテキストの注入
- イベントに基づくアプリケーション動作のカスタマイズ
- 外部システムやサービスとの統合
- ツールへの入力や応答のプログラムによる変更

## フックの種類

Qwen Code は4つのフック実行タイプをサポートしています:

| タイプ      | 説明                                                                                           |
| :---------- | :--------------------------------------------------------------------------------------------- |
| `command`   | シェルコマンドを実行します。`stdin` 経由で JSON を受け取り、`stdout` 経由で結果を返します。     |
| `http`      | JSON を `POST` リクエストボディとして指定された URL に送信します。HTTP レスポンスボディで結果を返します。 |
| `function`  | 登録された JavaScript 関数を直接呼び出します（セッションレベルのフックのみ）。                 |
| `prompt`    | LLM を使用してフック入力を評価し、決定を返します。                                             |

### コマンドフック

コマンドフックは、子プロセス経由でコマンドを実行します。入力 JSON は stdin を介して渡され、出力は stdout を介して返されます。

**設定:**

| フィールド       | タイプ                   | 必須 | 説明                                    |
| :--------------- | :----------------------- | :--- | :-------------------------------------- |
| `type`           | `"command"`              | はい | フックのタイプ                          |
| `command`        | `string`                 | はい | 実行するコマンド                        |
| `name`           | `string`                 | いいえ | フック名（ログ用）                      |
| `description`    | `string`                 | いいえ | フックの説明                            |
| `timeout`        | `number`                 | いいえ | タイムアウト（ミリ秒）、デフォルト 60000 |
| `async`          | `boolean`                | いいえ | バックグラウンドで非同期実行するか      |
| `env`            | `Record<string, string>` | いいえ | 環境変数                                |
| `shell`          | `"bash" \| "powershell"` | いいえ | 使用するシェル                          |
| `statusMessage`  | `string`                 | いいえ | 実行中に表示するステータスメッセージ    |

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

HTTP フックは、フック入力を POST リクエストとして指定された URL に送信します。URL ホワイトリスト、DNS レベルの SSRF 対策、環境変数補間、その他のセキュリティ機能をサポートします。

**設定:**

| フィールド          | タイプ                     | 必須 | 説明                                                  |
| :------------------ | :------------------------- | :--- | :---------------------------------------------------- |
| `type`              | `"http"`                   | はい | フックのタイプ                                        |
| `url`               | `string`                   | はい | ターゲット URL                                        |
| `headers`           | `Record<string, string>`   | いいえ | リクエストヘッダー（環境変数補間をサポート）          |
| `allowedEnvVars`    | `string[]`                 | いいえ | URL/ヘッダーで許可される環境変数のホワイトリスト      |
| `timeout`           | `number`                   | いいえ | タイムアウト（秒）、デフォルト 600                    |
| `name`              | `string`                   | いいえ | フック名（ログ用）                                    |
| `statusMessage`     | `string`                   | いいえ | 実行中に表示するステータスメッセージ                  |
| `once`              | `boolean`                  | いいえ | イベントごとにセッション内で1回のみ実行（HTTPフックのみ） |

**セキュリティ機能:**

- **URL ホワイトリスト**: `allowedUrls` で許可する URL パターンを設定可能
- **SSRF 対策**: プライベート IP (10.x.x.x、172.16-31.x.x、192.168.x.x など) をブロックするが、ループバックアドレス (127.0.0.1、::1) は許可
- **DNS 検証**: DNS リバインディング攻撃を防ぐため、リクエスト前にドメイン解決を検証
- **環境変数補間**: `${VAR}` 構文、`allowedEnvVars` ホワイトリストに含まれる変数のみ許可

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

関数フックは、登録された JavaScript/TypeScript 関数を直接呼び出します。これは主にスキルシステム内部で使用され、現在エンドユーザー向けの公開 API としては公開されていません。

**注意**: ほとんどのユースケースでは、設定ファイルで設定可能な **コマンドフック** または **HTTP フック** を使用してください。

### プロンプトフック

プロンプトフックは LLM を使用してフック入力を評価し、決定を返します。これは、操作を許可するかブロックするかの判断など、コンテキストに基づいたインテリジェントな決定を行うのに便利です。

**動作の仕組み:**

1. フック入力 JSON は、`$ARGUMENTS` プレースホルダーを使用してプロンプトに注入されます
2. プロンプトが LLM に送信されます（デフォルト: 現在のモデル）
3. LLM が決定を含む JSON レスポンスを返します
4. Qwen Code が決定を処理し、実行を続行またはブロックします

**設定:**

| フィールド         | タイプ     | 必須 | 説明                                             |
| :----------------- | :--------- | :--- | :----------------------------------------------- |
| `type`             | `"prompt"` | はい | フックのタイプ                                   |
| `prompt`           | `string`   | はい | LLM に送信するプロンプト。`$ARGUMENTS` でフック入力を使用 |
| `model`            | `string`   | いいえ | 使用するモデル（デフォルトは現在のモデル）       |
| `timeout`          | `number`   | いいえ | タイムアウト（秒）、デフォルト 30                |
| `name`             | `string`   | いいえ | フック名（ログ用）                               |
| `description`      | `string`   | いいえ | フックの説明                                     |
| `statusMessage`    | `string`   | いいえ | 実行中に表示するステータスメッセージ             |

**レスポンス形式:**

LLM は以下の構造の JSON を返す必要があります:

```json
{
  "ok": true,
  "reason": "決定の説明",
  "additionalContext": "会話に注入するオプションのコンテキスト"
}
```

| フィールド            | 説明                                                                 |
| :-------------------- | :------------------------------------------------------------------- |
| `ok`                  | `true` で許可/続行、`false` でブロック/停止                          |
| `reason`              | `ok` が `false` の場合に必須。ブロックの理由をモデルに伝える         |
| `additionalContext`   | 任意。許可時に会話に注入する追加コンテキスト                         |

**サポートされるイベント:**

プロンプトフックは以下のようなほとんどのフックイベントで使用できます:

- `PreToolUse` - ツール呼び出しを許可するか評価
- `PostToolUse` - ツール結果を評価し、コンテキストを注入
- `Stop` - 続行するか停止するかを決定
- `SubagentStop` - サブエージェント結果を評価
- `UserPromptSubmit` - ユーザープロンプトを評価または補完

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

フックは Qwen Code セッション中の特定の時点で発火します。イベントによって、トリガー条件をフィルタリングするための異なるマッチャーをサポートします。

| イベント               | トリガーされるタイミング                              | マッチャー対象                                                 |
| :--------------------- | :---------------------------------------------------- | :------------------------------------------------------------- |
| `PreToolUse`           | ツール実行前                                          | ツール名 (`WriteFile`, `ReadFile`, `Bash` など)                |
| `PostToolUse`          | ツール実行成功後                                      | ツール名                                                       |
| `PostToolUseFailure`   | ツール実行失敗後                                      | ツール名                                                       |
| `UserPromptSubmit`     | ユーザーがプロンプトを送信した後                      | なし（常に発火）                                               |
| `SessionStart`         | セッション開始または再開時                            | ソース (`startup`, `resume`, `clear`, `compact`)               |
| `SessionEnd`           | セッション終了時                                      | 理由 (`clear`, `logout`, `prompt_input_exit` など)             |
| `Stop`                 | Claude がレスポンスの結論を準備する時                  | なし（常に発火）                                               |
| `SubagentStart`        | サブエージェント開始時                                | エージェントタイプ (`Bash`, `Explorer`, `Plan` など)           |
| `SubagentStop`         | サブエージェント停止時                                | エージェントタイプ                                             |
| `PreCompact`           | 会話のコンパクション前                                | トリガー (`manual`, `auto`)                                    |
| `Notification`         | 通知送信時                                            | タイプ (`permission_prompt`, `idle_prompt`, `auth_success`)     |
| `PermissionRequest`    | 許可ダイアログ表示時                                  | ツール名                                                       |
| `TodoCreated`          | 新しい TODO アイテム作成時                            | なし（常に発火）                                               |
| `TodoCompleted`        | TODO アイテムが完了とマークされた時                   | なし（常に発火）                                               |

### マッチャーパターン

`matcher` はトリガー条件をフィルタリングするための正規表現です。

| イベントタイプ     | イベント                                                                    | マッチャーサポート | マッチャー対象                                                |
| :----------------- | :-------------------------------------------------------------------------- | :----------------- | :------------------------------------------------------------ |
| ツールイベント     | `PreToolUse`, `PostToolUse`, `PostToolUseFailure`, `PermissionRequest`       | ✅ 正規表現        | ツール名: `WriteFile`, `ReadFile`, `Bash` など                |
| サブエージェントイベント | `SubagentStart`, `SubagentStop`                                            | ✅ 正規表現        | エージェントタイプ: `Bash`, `Explorer` など                   |
| セッションイベント | `SessionStart`                                                              | ✅ 正規表現        | ソース: `startup`, `resume`, `clear`, `compact`               |
| セッションイベント | `SessionEnd`                                                                | ✅ 正規表現        | 理由: `clear`, `logout`, `prompt_input_exit` など             |
| 通知イベント       | `Notification`                                                              | ✅ 完全一致        | タイプ: `permission_prompt`, `idle_prompt`, `auth_success`    |
| コンパクションイベント | `PreCompact`                                                            | ✅ 完全一致        | トリガー: `manual`, `auto`                                    |
| TODO イベント      | `TodoCreated`, `TodoCompleted`                                              | ❌ なし            | N/A                                                           |
| プロンプトイベント | `UserPromptSubmit`                                                          | ❌ なし            | N/A                                                           |
| Stop イベント      | `Stop`                                                                      | ❌ なし            | N/A                                                           |

**マッチャー構文:**

- 空文字列 `""` または `"*"` はそのタイプのすべてのイベントにマッチ
- 標準的な正規表現構文をサポート（例: `^Bash$`, `Read.*`, `(WriteFile|Edit)`）

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

## 入力/出力ルール

### フック入力構造

すべてのフックは標準化された JSON 形式の入力を、コマンドでは stdin 経由、HTTP では POST ボディ経由で受け取ります。

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

イベント固有のフィールドはフックの種類に応じて追加されます。サブエージェント内で実行される場合は、`agent_id` と `agent_type` も追加で含まれます。

### フック出力構造

フックの出力は、コマンドでは `stdout`、HTTP では HTTP レスポンスボディを介して JSON として返されます。

**終了コードの動作（コマンドフック）:**

| 終了コード | 動作                                                                                   |
| :--------- | :------------------------------------------------------------------------------------- |
| `0`        | 成功。`stdout` の JSON を解析して動作を制御します。                                    |
| `2`        | **ブロッキングエラー**。`stdout` を無視し、`stderr` をエラーフィードバックとしてモデルに渡します。 |
| その他     | 非ブロッキングエラー。`stderr` はデバッグモードでのみ表示され、実行は継続されます。    |

**出力構造:**

フック出力は3つのカテゴリのフィールドをサポートします:

1. **共通フィールド**: `continue`, `stopReason`, `suppressOutput`, `systemMessage`
2. **トップレベルの決定**: `decision`, `reason`（一部のイベントで使用）
3. **イベント固有の制御**: `hookSpecificOutput`（`hookEventName` を含める必要あり）

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

### 個別のフックイベント詳細

#### PreToolUse

**目的**: ツールが使用される前に実行され、許可チェック、入力検証、コンテキスト注入を可能にします。

**イベント固有のフィールド:**

```json
{
  "permission_mode": "default | plan | auto_edit | yolo",
  "tool_name": "実行されるツールの名前",
  "tool_input": "ツールの入力パラメータを含むオブジェクト",
  "tool_use_id": "このツール使用インスタンスの一意識別子（内部形式、例: toolu_xxx）",
  "tool_call_id": "LLM プロバイダーからの元の API 呼び出し ID（例: OpenAI/Qwen の call_xxx）（オプション）"
}
```

**出力オプション:**

- `hookSpecificOutput.permissionDecision`: "allow"、"deny"、または "ask"（必須）
- `hookSpecificOutput.permissionDecisionReason`: 決定の説明（必須）
- `hookSpecificOutput.updatedInput`: 元の代わりに使用する変更されたツール入力パラメータ
- `hookSpecificOutput.additionalContext`: 追加コンテキスト情報

**注意**: 標準的なフック出力フィールド（`decision` や `reason`）は基盤のクラスで技術的にサポートされていますが、公式インターフェースは `hookSpecificOutput` 内の `permissionDecision` と `permissionDecisionReason` を期待しています。

**出力例:**

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

**目的**: ツールが正常に完了した後に実行され、結果の処理、結果のログ記録、追加コンテキストの注入を行います。

**イベント固有のフィールド:**

```json
{
  "permission_mode": "default | plan | auto_edit | yolo",
  "tool_name": "実行されたツールの名前",
  "tool_input": "ツールの入力パラメータを含むオブジェクト",
  "tool_response": "ツールの応答を含むオブジェクト",
  "tool_use_id": "このツール使用インスタンスの一意識別子（内部形式、例: toolu_xxx）",
  "tool_call_id": "LLM プロバイダーからの元の API 呼び出し ID（例: OpenAI/Qwen の call_xxx）（オプション）"
}
```

**出力オプション:**

- `decision`: "allow"、"deny"、"block"（指定がない場合はデフォルトで "allow"）
- `reason`: 決定の理由
- `hookSpecificOutput.additionalContext`: 追加情報

**出力例:**

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

**目的**: ツール実行が失敗したときに実行され、エラー処理、アラート送信、障害記録を行います。

**イベント固有のフィールド:**

```json
{
  "permission_mode": "default | plan | auto_edit | yolo",
  "tool_use_id": "ツール使用の一意識別子（内部形式、例: toolu_xxx）",
  "tool_call_id": "LLM プロバイダーからの元の API 呼び出し ID（例: OpenAI/Qwen の call_xxx）（オプション）",
  "tool_name": "失敗したツールの名前",
  "tool_input": "ツールの入力パラメータを含むオブジェクト",
  "error": "障害を説明するエラーメッセージ",
  "is_interrupt": "ユーザーによる割り込みが原因かどうかを示すブール値（オプション）"
}
```
**出力オプション**:

- `hookSpecificOutput.additionalContext`: エラー処理情報
- 標準フック出力フィールド

**出力例**:

```json
{
  "hookSpecificOutput": {
    "additionalContext": "エラー: ファイルが見つかりません。監視システムに障害が記録されました。"
  }
}
```

#### UserPromptSubmit

**目的**: ユーザーがプロンプトを送信した際に、入力を修正、検証、または拡充するために実行されます。

**イベント固有のフィールド**:

```json
{
  "prompt": "ユーザーが送信したプロンプトテキスト"
}
```

**出力オプション**:

- `decision`: "allow"、"deny"、"block"、"ask" のいずれか
- `reason`: 決定内容の人間が読める説明
- `hookSpecificOutput.additionalContext`: プロンプトに追加するコンテキスト（オプション）

**注**: UserPromptSubmitOutput は HookOutput を拡張するため、すべての標準フィールドが利用可能ですが、`hookSpecificOutput` 内の `additionalContext` のみがこのイベント用に定義されています。

**出力例**:

```json
{
  "decision": "allow",
  "reason": "プロンプトをレビューし、承認しました。",
  "hookSpecificOutput": {
    "additionalContext": "会社のコーディング標準に従うことを忘れないでください。"
  }
}
```

#### SessionStart

**目的**: 新しいセッションが開始されたときに、初期化タスクを実行するために実行されます。

**イベント固有のフィールド**:

```json
{
  "permission_mode": "default | plan | auto_edit | yolo",
  "source": "startup | resume | clear | compact",
  "model": "使用中のモデル",
  "agent_type": "該当する場合、エージェントの種類（オプション）"
}
```

**出力オプション**:

- `hookSpecificOutput.additionalContext`: セッション内で利用可能にするコンテキスト
- 標準フック出力フィールド

**出力例**:

```json
{
  "hookSpecificOutput": {
    "additionalContext": "セキュリティポリシーを有効にしてセッションを開始しました。"
  }
}
```

#### SessionEnd

**目的**: セッションが終了したときに、クリーンアップタスクを実行するために実行されます。

**イベント固有のフィールド**:

```json
{
  "reason": "clear | logout | prompt_input_exit | bypass_permissions_disabled | other"
}
```

**出力オプション**:

- 標準フック出力フィールド（通常はブロックには使用されません）

#### Stop

**目的**: Qwen が応答を終了する前に、最終的なフィードバックやサマリーを提供するために実行されます。

**イベント固有のフィールド**:

```json
{
  "stop_hook_active": "ストップフックがアクティブかどうかを示すブール値",
  "last_assistant_message": "アシスタントからの最後のメッセージ"
}
```

**出力オプション**:

- `decision`: "allow"、"deny"、"block"、"ask" のいずれか
- `reason`: 決定内容の人間が読める説明
- `stopReason`: ストップ応答に含めるフィードバック
- `continue`: false に設定すると実行を停止
- `hookSpecificOutput.additionalContext`: 追加のコンテキスト情報

**注**: StopOutput は HookOutput を拡張するため、すべての標準フィールドが利用可能ですが、`stopReason` フィールドはこのイベントに特に関連します。

**出力例**:

```json
{
  "decision": "block",
  "reason": "Qwen Code が停止をブロックされた場合に指定する必要があります。"
}
```

#### StopFailure

**目的**: API エラーによりターンが終了したときに、Stop の代わりに実行されます。これは**ファイア・アンド・フォーゲット**イベントです。フック出力と終了コードは無視されます。

**イベント固有のフィールド**:

```json
{
  "error": "rate_limit | authentication_failed | billing_error | invalid_request | server_error | max_output_tokens | unknown",
  "error_details": "詳細なエラーメッセージ（オプション）",
  "last_assistant_message": "エラー発生直前のアシスタントからの最後のメッセージ（オプション）"
}
```

**マッチャー**: `error` フィールドに対してマッチします。たとえば、`"matcher": "rate_limit"` と設定すると、レート制限エラーの場合のみトリガーされます。

**出力オプション**:

- **なし** - StopFailure はファイア・アンド・フォーゲットです。すべてのフック出力と終了コードは無視されます。

**終了コードの扱い**:

| 終了コード | 動作                  |
| --------- | ---------------------- |
| 任意       | 無視（ファイア・アンド・フォーゲット） |

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

- レート制限の監視とアラート
- 認証失敗のログ記録
- 課金エラー通知
- エラー統計の収集

#### SubagentStart

**目的**: サブエージェント（Task ツールなど）が起動されたときに、コンテキストや権限を設定するために実行されます。

**イベント固有のフィールド**:

```json
{
  "permission_mode": "default | plan | auto_edit | yolo",
  "agent_id": "サブエージェントの識別子",
  "agent_type": "エージェントの種類（Bash、Explorer、Plan、Custom など）"
}
```

**出力オプション**:

- `hookSpecificOutput.additionalContext`: サブエージェントの初期コンテキスト
- 標準フック出力フィールド

**出力例**:

```json
{
  "hookSpecificOutput": {
    "additionalContext": "サブエージェントを制限付き権限で初期化しました。"
  }
}
```

#### SubagentStop

**目的**: サブエージェントが終了したときに、後処理タスクを実行するために実行されます。

**イベント固有のフィールド**:

```json
{
  "permission_mode": "default | plan | auto_edit | yolo",
  "stop_hook_active": "ストップフックがアクティブかどうかを示すブール値",
  "agent_id": "サブエージェントの識別子",
  "agent_type": "エージェントの種類",
  "agent_transcript_path": "サブエージェントのトランスクリプトへのパス",
  "last_assistant_message": "サブエージェントからの最後のメッセージ"
}
```

**出力オプション**:

- `decision`: "allow"、"deny"、"block"、"ask" のいずれか
- `reason`: 決定内容の人間が読める説明

**出力例**:

```json
{
  "decision": "block",
  "reason": "Qwen Code が停止をブロックされた場合に指定する必要があります。"
}
```

#### PreCompact

**目的**: 会話の圧縮前に、圧縮の準備やログ記録のために実行されます。

**イベント固有のフィールド**:

```json
{
  "trigger": "manual | auto",
  "custom_instructions": "現在設定されているカスタム指示"
}
```

**出力オプション**:

- `hookSpecificOutput.additionalContext`: 圧縮前に含めるコンテキスト
- 標準フック出力フィールド

**出力例**:

```json
{
  "hookSpecificOutput": {
    "additionalContext": "最適なコンテキストウィンドウを維持するため、会話を圧縮しています。"
  }
}
```

#### PostCompact

**目的**: 会話の圧縮が完了した後に、サマリーのアーカイブや使用状況の追跡のために実行されます。

**イベント固有のフィールド**:

```json
{
  "trigger": "manual | auto",
  "compact_summary": "圧縮処理で生成されたサマリー"
}
```

**マッチャー**: `trigger` フィールドに対してマッチします。たとえば、`"matcher": "manual"` と設定すると、`/compact` コマンドによる手動圧縮の場合のみトリガーされます。

**出力オプション**:

- `hookSpecificOutput.additionalContext`: 追加のコンテキスト（ログ記録専用）
- 標準フック出力フィールド（ログ記録専用）

**注**: PostCompact は、公式の decision モード対応イベントリストには**含まれていません**。`decision` フィールドやその他の制御フィールドは、制御効果を生じません。ログ記録目的でのみ使用されます。

**終了コードの扱い**:

| 終了コード | 動作                                                  |
| --------- | ------------------------------------------------------ |
| 0         | 成功 - 詳細モードでは stdout がユーザーに表示されます |
| その他    | 非ブロッキングエラー - 詳細モードでは stderr がユーザーに表示されます |

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
- 使用統計の追跡
- コンテキスト変更の監視
- 圧縮操作の監査ログ

#### Notification

**目的**: 通知が送信されたときに、カスタマイズやインターセプトのために実行されます。

**イベント固有のフィールド**:

```json
{
  "message": "通知メッセージの内容",
  "title": "通知のタイトル（オプション）",
  "notification_type": "permission_prompt | idle_prompt | auth_success"
}
```

> **注**: `elicitation_dialog` タイプは定義されていますが、現在は実装されていません。

**出力オプション**:

- `hookSpecificOutput.additionalContext`: 含める追加情報
- 標準フック出力フィールド

**出力例**:

```json
{
  "hookSpecificOutput": {
    "additionalContext": "監視システムによって処理された通知。"
  }
}
```

#### PermissionRequest

**目的**: 権限ダイアログが表示されたときに、決定の自動化や権限の更新のために実行されます。

**イベント固有のフィールド**:

```json
{
  "permission_mode": "default | plan | auto_edit | yolo",
  "tool_name": "権限を要求しているツールの名前",
  "tool_input": "ツールの入力パラメータを含むオブジェクト",
  "permission_suggestions": "推奨される権限の配列（オプション）"
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
      "message": "セキュリティポリシーに基づき権限を付与しました。",
      "interrupt": false
    }
  }
}
```

#### TodoCreated

**目的**: `todo_write` ツールを使用して新しい Todo アイテムが作成されたときに実行されます。Todo 作成の検証、ログ記録、ブロックを可能にします。

Todo フックは 2 つのフェーズで実行されます:

- `validation`: 永続化の前に実行されます。このフェーズは検証のみに使用します。`block` または `deny` を返すと、書き込みが防止されます。
- `postWrite`: 永続化後に実行されます。このフェーズはログ記録や同期などの副作用に使用します。このフェーズでは `block` や `deny` は無視されます。

**イベント固有のフィールド**:

```json
{
  "todo_id": "Todo アイテムの一意識別子",
  "todo_content": "Todo アイテムの内容/説明",
  "todo_status": "pending | in_progress | completed",
  "all_todos": "現在のリスト内のすべての Todo アイテムの配列",
  "phase": "validation | postWrite"
}
```

**出力オプション**:

- `decision`: "allow"、"block"、"deny" のいずれか
- `reason`: 決定内容の人間が読める説明（ブロック時に必須）

**ブロック動作**:

`validation` フェーズ中で、`decision` が `block` または `deny`（終了コード 2）の場合、Todo 作成は防止されます。Todo リストは変更されず、理由がモデルへのフィードバックとして提供されます。

`postWrite` フェーズ中では、Todo は既に永続化されています。フックは出力を返すことはできますが、`block` / `deny` は書き込みを取り消さず、検証に使用すべきではありません。

**出力例（許可）**:

```json
{
  "decision": "allow",
  "reason": "Todo の内容を検証しました。"
}
```

**出力例（ブロック）**:

```json
{
  "decision": "block",
  "reason": "Todo の内容が短すぎます。最低 5 文字必要です。"
}
```

**フックスクリプト例**:

```bash
#!/bin/bash
# ~/.qwen/hooks/todo-validator.sh
# Todo 作成前に内容を検証

INPUT=$(cat)
CONTENT=$(echo "$INPUT" | jq -r '.todo_content')

# 最小文字数をチェック
if [ ${#CONTENT} -lt 5 ]; then
  echo '{"decision": "block", "reason": "Todo の内容は少なくとも 5 文字必要です。"}'
  exit 2
fi

# テスト関連の Todo をブロック
if [[ "$CONTENT" =~ "test" ]]; then
  echo '{"decision": "block", "reason": "テスト用 Todo は本番環境では許可されていません。"}'
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

**目的**: Todo アイテムが完了としてマークされたときに実行されます。Todo 完了の検証、ログ記録、ブロックを可能にします。

Todo フックは 2 つのフェーズで実行されます:

- `validation`: 永続化の前に実行されます。このフェーズは検証のみに使用します。`block` または `deny` を返すと、書き込みが防止されます。
- `postWrite`: 永続化後に実行されます。このフェーズはログ記録や同期などの副作用に使用します。このフェーズでは `block` や `deny` は無視されます。

**イベント固有のフィールド**:

```json
{
  "todo_id": "Todo アイテムの一意識別子",
  "todo_content": "Todo アイテムの内容/説明",
  "previous_status": "pending | in_progress（完了前のステータス）",
  "all_todos": "現在のリスト内のすべての Todo アイテムの配列",
  "phase": "validation | postWrite"
}
```

**出力オプション**:

- `decision`: "allow"、"block"、"deny" のいずれか
- `reason`: 決定内容の人間が読める説明（ブロック時に必須）

**ブロック動作**:

`validation` フェーズ中で、`decision` が `block` または `deny`（終了コード 2）の場合、Todo 完了は防止されます。Todo アイテムは以前のステータスのままで、理由がモデルへのフィードバックとして提供されます。

`postWrite` フェーズ中では、Todo は既に永続化されています。フックは出力を返すことはできますが、`block` / `deny` は書き込みを取り消さず、検証に使用すべきではありません。

**出力例（許可）**:

```json
{
  "decision": "allow",
  "reason": "Todo の完了を承認しました。"
}
```

**出力例（ブロック）**:

```json
{
  "decision": "block",
  "reason": "依存するタスクが完了するまで、この Todo を完了できません。"
}
```

**フックスクリプト例**:

```bash
#!/bin/bash
# ~/.qwen/hooks/todo-completion-validator.sh
# Todo 完了条件を検証

INPUT=$(cat)
TODO_ID=$(echo "$INPUT" | jq -r '.todo_id')
ALL_TODOS=$(echo "$INPUT" | jq -r '.all_todos')

# 未完了の依存 Todo があるかチェック（例）
INCOMPLETE_COUNT=$(echo "$ALL_TODOS" | jq '[.[] | select(.status != "completed")] | length')

if [ "$INCOMPLETE_COUNT" -gt 5 ]; then
  echo '{"decision": "block", "reason": "未完了の Todo が多すぎます。先に他のタスクを完了してください。"}'
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

- **ログ記録**: 監査や分析のために Todo の作成と完了を追跡
- **検証**: コンテンツの品質基準（最小文字数、必須キーワード）を強制
- **ワークフロー制御**: 前提条件が満たされるまで完了をブロック
- **統合**: 外部タスク管理システム（Jira、Trello など）と Todo を同期

## フック設定

フックは Qwen Code の設定（通常は `.qwen/settings.json` またはユーザー設定ファイル）で構成します:

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
            "description": "ツール実行前にセキュリティチェックを実行",
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

- デフォルトでは、パフォーマンス向上のためフックは並列に実行されます。
- フック定義で `sequential: true` を指定すると、順序に依存する実行が強制されます。
- 逐次フックは、チェーン内の後続のフックのために入力を変更できます。

### 非同期フック

非同期実行をサポートするのは `command` タイプのみです。`"async": true` を設定すると、フックはメインフローをブロックせずにバックグラウンドで実行されます。

**特徴**:

- 決定制御を返すことはできません（操作は既に発生しています）。
- 結果は次の会話ターンで `systemMessage` または `additionalContext` を介して注入されます。
- 監査、ログ記録、バックグラウンドテストなどに適しています。

**例**:

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

- フックはユーザーの環境で、ユーザーの権限で実行されます。
- プロジェクトレベルのフックには信頼されたフォルダステータスが必要です。
- タイムアウトによりハングしたフックを防止します（デフォルト: 60秒）。

## ベストプラクティス

### 例 1: セキュリティ検証フック

危険なコマンドをログ記録し、ブロックする可能性のある PreToolUse フック:

**security_check.sh**

```bash
#!/bin/bash

# 標準入力から入力を読み取る
INPUT=$(cat)

# 入力を解析してツール情報を抽出
TOOL_NAME=$(echo "$INPUT" | jq -r '.tool_name')
TOOL_INPUT=$(echo "$INPUT" | jq -r '.tool_input')

# 潜在的に危険な操作をチェック
if echo "$TOOL_INPUT" | grep -qiE "(rm.*-rf|mv.*\/|chmod.*777)"; then
  echo '{
    "hookSpecificOutput": {
      "hookEventName": "PreToolUse",
      "permissionDecision": "deny",
      "permissionDecisionReason": "セキュリティポリシーにより危険なコマンドをブロックします"
    }
  }'
  exit 2  # ブロッキングエラー
fi

# 操作をログに記録
echo "INFO: ツール $TOOL_NAME が $(date) に安全に実行されました" >> /var/log/qwen-security.log

# 追加コンテキスト付きで許可
echo '{
  "hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "permissionDecision": "allow",
    "permissionDecisionReason": "セキュリティチェックに合格しました",
    "additionalContext": "コマンドはセキュリティポリシーにより承認されました"
  }
}'
exit 0
```

`.qwen/settings.json` に設定:

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
            "description": "bash コマンドのセキュリティ検証",
            "timeout": 10000
          }
        ]
      }
    ]
  }
}
```

### 例 2: HTTP 監査フック

すべてのツール実行レコードをリモート監査サービスに送信する PostToolUse HTTP フック:

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

ユーザープロンプトの機密情報を検証し、長いプロンプトにコンテキストを提供する UserPromptSubmit フック:

**prompt_validator.py**

```python
import json
import sys
import re

# 標準入力から入力を読み込む
try:
    input_data = json.load(sys.stdin)
except json.JSONDecodeError as e:
    print(f"エラー: 無効なJSON入力: {e}", file=sys.stderr)
    exit(1)

user_prompt = input_data.get("prompt", "")

# 機密ワードリスト
sensitive_words = ["password", "secret", "token", "api_key"]

# 機密情報をチェック
for word in sensitive_words:
    if re.search(rf"\b{word}\b", user_prompt.lower()):
        # 機密情報を含むプロンプトをブロック
        output = {
            "decision": "block",
            "reason": f"プロンプトに機密情報 '{word}' が含まれています。機密コンテンツを削除して再送信してください。",
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
            "additionalContext": "注: ユーザーが長いプロンプトを送信しました。注意深く読み、すべての要件を理解していることを確認してください。"
        }
    }
    print(json.dumps(output))
    exit(0)

# 通常のケースでは処理不要
exit(0)
```
## トラブルシューティング

- フックの実行詳細についてアプリケーションのログを確認する
- フックスクリプトのパーミッションと実行可能性を確認する
- フックの出力におけるJSONフォーマットが適切であることを確認する
- 特定のマッチャーパターンを使用して、意図しないフックの実行を回避する
- `--debug` モードを使用して、詳細なフックのマッチングと実行情報を表示する
- すべてのフックを一時的に無効にするには、設定に `"disableAllHooks": true` を追加する