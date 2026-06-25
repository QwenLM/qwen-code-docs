# Python SDK

## `qwen-code-sdk`

`qwen-code-sdk` は Qwen Code の実験的な Python SDK です。v1 は既存の `stream-json` CLI プロトコルを対象とし、トランスポート層を小さくテスト可能な形に保ちます。

## スコープ

- パッケージ名: `qwen-code-sdk`
- インポートパス: `qwen_code_sdk`
- 実行環境要件: Python `>=3.10`
- CLI 依存: v1 では外部の `qwen` 実行ファイルが必要
- トランスポートスコープ: プロセストランスポートのみ
- v1 未対応: ACP トランスポート、SDK 組み込みの MCP サーバー

## インストール

```bash
pip install qwen-code-sdk
```

プレビューリリースの場合:

```bash
pip install --pre qwen-code-sdk
```

`qwen` が `PATH` にない場合は、`path_to_qwen_executable` を明示的に指定してください。

SDK コードを書く前に、同じシェルで CLI が動作することを確認してください:

```bash
qwen --version
```

## クイックスタート

```python
import asyncio

from qwen_code_sdk import (
    is_sdk_assistant_message,
    is_sdk_result_message,
    query,
)


def extract_text(message):
    content = message.get("message", {}).get("content", [])
    if not isinstance(content, list):
        return repr(content)
    texts = [
        block.get("text", "")
        for block in content
        if isinstance(block, dict) and block.get("type") == "text"
    ]
    return "".join(texts) if texts else "[no text content]"


def print_result(message):
    if message.get("is_error"):
        error = message.get("error") or {}
        print(f"Error: {error.get('message', 'Unknown error')}")
        return
    print(message.get("result", ""))


async def main() -> None:
    async with query(
        "Explain the repository structure.",
        {
            "cwd": "/path/to/project",
            "path_to_qwen_executable": "qwen",
        },
    ) as result:
        async for message in result:
            if is_sdk_assistant_message(message):
                print(extract_text(message))
            elif is_sdk_result_message(message):
                print_result(message)


asyncio.run(main())
```

`asyncio.run()` はスタンドアロンスクリプトに適しています。Jupyter、FastAPI、pytest-asyncio など、すでにイベントループが動いているアプリケーションでは、代わりに `await main()` を呼び出してください。

## 同期での使用

ホストアプリケーションが非同期でない場合は `query_sync` を使用してください:

```python
from qwen_code_sdk import is_sdk_result_message, query_sync


with query_sync(
    "Summarize this repository in one paragraph.",
    {
        "cwd": "/path/to/project",
        "path_to_qwen_executable": "qwen",
    },
) as result:
    for message in result:
        if is_sdk_result_message(message):
            if message.get("is_error"):
                error = message.get("error") or {}
                print(f"Error: {error.get('message', 'Unknown error')}")
            else:
                print(message.get("result", ""))
```

## API サーフェス

### トップレベルエントリーポイント

- `query(prompt, options=None) -> Query`
- `query_sync(prompt, options=None) -> SyncQuery`

`prompt` は以下のいずれかをサポートします:

- `str`: シングルターンリクエスト
- `AsyncIterable[SDKUserMessage]`: マルチターンストリーム

### `Query`

- SDK メッセージの非同期イテラブル
- `close()`
- `interrupt()`
- `set_model(model)`
- `set_permission_mode(mode)`
- `supported_commands()`
- `mcp_server_status()`
- `get_session_id()`
- `is_closed()`

### `QueryOptions`

| オプション                  | 型 / 値                                                    | 説明                                                                                                               |
| -------------------------- | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `cwd`                      | `str`                                                      | CLI プロセスの作業ディレクトリ。                                                                                    |
| `model`                    | `str`                                                      | この SDK セッションのモデルオーバーライド。                                                                         |
| `path_to_qwen_executable`  | `str`                                                      | `qwen`、明示的なバイナリパス、または `.js` CLI バンドル。                                                           |
| `permission_mode`          | `default`, `plan`, `auto-edit`, `yolo`                     | ツール実行の承認モード。`yolo` はすべてのツールを自動承認します。信頼済みまたはサンドボックス環境でのみ使用してください。 |
| `can_use_tool`             | 非同期コールバック                                          | ツールリクエストのカスタム権限コールバック。                                                                         |
| `env`                      | `dict[str, str]`                                           | CLI プロセスに渡す追加の環境変数。                                                                                  |
| `system_prompt`            | `str`                                                      | システムプロンプトをオーバーライドします。                                                                           |
| `append_system_prompt`     | `str`                                                      | システムプロンプトに追加の指示を付加します。                                                                         |
| `debug`                    | `bool`                                                     | `stderr` フックがない場合、CLI の stderr を stderr に転送します。                                                    |
| `max_session_turns`        | `int`                                                      | CLI がセッションを終了するまでの最大ターン数。                                                                       |
| `core_tools`               | `list[str]`                                                | 利用可能なツールセットを制限します。                                                                                 |
| `exclude_tools`            | `list[str]`                                                | 一致するツールを除外します。                                                                                         |
| `allowed_tools`            | `list[str]`                                                | コールバック承認なしで一致するツールを許可します。                                                                    |
| `auth_type`                | `openai`, `anthropic`, `qwen-oauth`, `gemini`, `vertex-ai` | CLI に渡す認証モード。                                                                                              |
| `include_partial_messages` | `bool`                                                     | アシスタントのストリームイベントを部分的に出力します。                                                               |
| `resume`                   | UUID 文字列                                                | 既知のセッション ID でセッションを再開します。                                                                       |
| `continue_session`         | `bool`                                                     | 最新の CLI セッションを継続します。                                                                                  |
| `session_id`               | UUID 文字列                                                | 既知の ID でセッションを開始または関連付けます。                                                                     |
| `timeout`                  | マッピング                                                  | 秒単位のタイムアウト。                                                                                              |
| `stderr`                   | callable                                                   | CLI の stderr 行を受け取ります。                                                                                    |

`resume`、`continue_session`、`session_id` は、1 つのリクエストでいずれか 1 つのみ使用してください。これらのセッションオプションを組み合わせた場合、SDK は `ValidationError` を発生させます。

v1 未対応:

- `mcp_servers`

### 共通設定

```python
options = {
    "cwd": "/path/to/project",
    "path_to_qwen_executable": "qwen",
    "model": "qwen-plus",
    "permission_mode": "plan",
    "max_session_turns": 1,
    "env": {
        "OPENAI_MODEL": "qwen-plus",
    },
    "timeout": {
        "control_request": 60,
        "can_use_tool": 60,
        "stream_close": 60,
    },
}
```

タイムアウト値は秒単位です。`env` は親プロセスの環境変数にマージされるため、この SDK セッションで変更が必要な変数のみ渡してください。`OPENAI_API_KEY` などのシークレットは、ソースコードにハードコードするのではなく、親環境またはシークレットマネージャーで設定してください。

## 権限処理

CLI が `can_use_tool` コントロールリクエストを送信すると、SDK はそれを `can_use_tool(tool_name, tool_input, context)` 経由でルーティングします。

- デフォルト動作: 拒否
- デフォルトタイムアウト: 60 秒（`timeout.can_use_tool` で設定可能）
- タイムアウト時のフォールバック: 拒否
- コールバック例外: エラーメッセージとともに拒否に変換
- コールバックコンテキスト: `cancel_event`、`suggestions`、`blocked_path`
- コールバックの要件: `can_use_tool` は 3 つの位置引数を持つ非同期関数であること。`stderr` は 1 つの位置引数（文字列）を受け取ること

例:

```python
import asyncio
from pathlib import Path

from qwen_code_sdk import is_sdk_result_message, query

PROJECT_ROOT = Path("/path/to/project").resolve()


def project_path(tool_name, tool_input):
    key = "path" if tool_name == "list_directory" else "file_path"
    raw_path = tool_input.get(key)
    if not isinstance(raw_path, str) or not raw_path:
        return None

    resolved = (PROJECT_ROOT / raw_path).resolve()
    try:
        resolved.relative_to(PROJECT_ROOT)
    except ValueError:
        return None
    return resolved


async def can_use_tool(tool_name, tool_input, context):
    if tool_name in {"read_file", "list_directory", "write_file"}:
        resolved = project_path(tool_name, tool_input)
        if resolved is None:
            return {
                "behavior": "deny",
                "message": "Only project-local paths are allowed",
            }

        if tool_name == "write_file" and resolved.suffix != ".md":
            return {"behavior": "deny", "message": "Only .md files can be written"}

        return {"behavior": "allow", "updatedInput": tool_input}

    return {
        "behavior": "deny",
        "message": f"{tool_name} is not allowed by this application",
    }


async def main():
    async with query(
        "Update README.md with a short summary.",
        {
            "cwd": str(PROJECT_ROOT),
            "path_to_qwen_executable": "qwen",
            "can_use_tool": can_use_tool,
        },
    ) as result:
        async for message in result:
            if is_sdk_result_message(message):
                if message.get("is_error"):
                    error = message.get("error") or {}
                    print(f"Error: {error.get('message', 'Unknown error')}")
                else:
                    print(message.get("result", ""))


asyncio.run(main())
```

`can_use_tool` を渡さない場合、SDK はデフォルトで権限リクエストを拒否します。

## マルチターンセッション

マルチターンセッションには、`SDKUserMessage` オブジェクトの非同期イテラブルを渡してください:

```python
import asyncio

from qwen_code_sdk import SDKUserMessage, is_sdk_result_message, query

SESSION_ID = "123e4567-e89b-12d3-a456-426614174000"


async def prompts():
    first: SDKUserMessage = {
        "type": "user",
        "session_id": SESSION_ID,
        "message": {
            "role": "user",
            "content": "Create a concise project summary.",
        },
        "parent_tool_use_id": None,
    }
    yield first

    second: SDKUserMessage = {
        "type": "user",
        "session_id": SESSION_ID,
        "message": {
            "role": "user",
            "content": "Also list the test files.",
        },
        "parent_tool_use_id": None,
    }
    yield second


async def main():
    async with query(
        prompts(),
        {
            "cwd": "/path/to/project",
            "path_to_qwen_executable": "qwen",
            "session_id": SESSION_ID,
        },
    ) as result:
        async for message in result:
            if is_sdk_result_message(message):
                if message.get("is_error"):
                    error = message.get("error") or {}
                    print(f"Error: {error.get('message', 'Unknown error')}")
                else:
                    print(message.get("result", ""))


asyncio.run(main())
```

非同期イテラブル内のすべてのメッセージは事前に確定している必要があります。SDK はそれらを順番に CLI へ送信しますが、前のレスポンスをジェネレーターにフィードバックすることはできません。会話型のターンテイキングが必要な場合は、各ターンを個別の `query()` 呼び出しとして管理してください。

## ランタイムコントロール

返された `Query` オブジェクトを使って、実行中の CLI プロセスを制御できます:

```python
import asyncio

from qwen_code_sdk import is_sdk_result_message, query


async def main():
    async with query(
        "Inspect this repository and explain the test layout.",
        {
            "cwd": "/path/to/project",
            "path_to_qwen_executable": "qwen",
        },
    ) as result:
        commands = await result.supported_commands()
        print(commands)

        await result.set_permission_mode("plan")
        await result.set_model("qwen-plus")

        async for message in result:
            if is_sdk_result_message(message):
                if message.get("is_error"):
                    error = message.get("error") or {}
                    print(f"Error: {error.get('message', 'Unknown error')}")
                else:
                    print(message.get("result", ""))


asyncio.run(main())
```

現在の操作をキャンセルするには `interrupt()`、基盤プロセスをクリーンアップするには `close()`、後で使うセッション ID を取得するには `get_session_id()` を使用してください。

## セッションの再開

```python
import asyncio

from qwen_code_sdk import is_sdk_result_message, query


async def main():
    # Resume a known session by its id.
    async with query(
        "Continue from this session.",
        {
            "path_to_qwen_executable": "qwen",
            "resume": "123e4567-e89b-12d3-a456-426614174000",
        },
    ) as known:
        async for message in known:
            if is_sdk_result_message(message):
                if message.get("is_error"):
                    error = message.get("error") or {}
                    print(f"Error: {error.get('message', 'Unknown error')}")
                else:
                    print(message.get("result", ""))


asyncio.run(main())
```

最新のセッションを継続する場合:

```python
import asyncio

from qwen_code_sdk import is_sdk_result_message, query


async def main():
    async with query(
        "Continue the latest session.",
        {
            "path_to_qwen_executable": "qwen",
            "continue_session": True,
        },
    ) as latest:
        async for message in latest:
            if is_sdk_result_message(message):
                if message.get("is_error"):
                    error = message.get("error") or {}
                    print(f"Error: {error.get('message', 'Unknown error')}")
                else:
                    print(message.get("result", ""))


asyncio.run(main())
```

`resume` はアプリケーションがセッション ID を保存している場合に便利です。`continue_session` は最新セッションの選択を CLI に委ねます。

## エラーモデル

- `ValidationError`: 無効なオプション、無効な UUID、未サポートの組み合わせ
- `ControlRequestTimeoutError`: 初期化、割り込み、またはその他のコントロールリクエストがタイムアウト
- `ProcessExitError`: CLI が非ゼロで終了
- `AbortError`: コントロールリクエストまたはセッションがキャンセルされた

```python
from qwen_code_sdk import (
    ProcessExitError,
    ValidationError,
    is_sdk_result_message,
    query_sync,
)

try:
    with query_sync("Say hello", {"path_to_qwen_executable": "qwen"}) as result:
        for message in result:
            if is_sdk_result_message(message):
                if message.get("is_error"):
                    error = message.get("error") or {}
                    print(f"Error: {error.get('message', 'Unknown error')}")
                else:
                    print(message.get("result", ""))
except ValidationError as exc:
    print(f"Invalid SDK options: {exc}")
except ProcessExitError as exc:
    print(f"qwen exited with {exc.exit_code}: {exc}")
```

## トラブルシューティング

SDK が CLI を起動できない場合:

- 対象環境で `qwen --version` が動作することを確認してください
- シェルが `nvm`、`pyenv`、またはその他の非標準 PATH 設定を使用している場合は `path_to_qwen_executable` を渡してください
- デバッグ中は `debug=True` または `stderr=print` を使用して CLI の stderr を確認してください

セッションコントロール呼び出しがタイムアウトする場合:

- 対象の `qwen` バージョンが `--input-format stream-json` をサポートしていることを確認してください
- `timeout.control_request` を増やしてください
- ラッパースクリプトが stdout/stderr を吸収していないことを確認してください

## リポジトリ統合

リポジトリレベルのヘルパーコマンド:

- `npm run test:sdk:python`
- `npm run lint:sdk:python`
- `npm run typecheck:sdk:python`
- `npm run smoke:sdk:python -- --qwen qwen`

## 実際の E2E スモークテスト

実際のランタイムチェック（実際の `qwen` プロセスと実際のモデル呼び出し）を行うには、リポジトリルートから実行してください。npm ヘルパーは `python3` を使用するため、Python `>=3.10` インタープリターとして解決されることを確認してください:

```bash
npm run smoke:sdk:python -- --qwen qwen
```

このスクリプトは以下を実行します:

- 非同期シングルターンクエリ
- 非同期コントロールフロー（`supported_commands`、権限モード更新）
- 同期 `query_sync` クエリ

JSON を出力し、失敗時には非ゼロを返します。
