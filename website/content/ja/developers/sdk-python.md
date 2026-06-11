# Python SDK

## `qwen-code-sdk`

`qwen-code-sdk` は Qwen Code 向けの試験的な Python SDK です。v1 は既存の `stream-json` CLI プロトコルを対象とし、トランスポートのインターフェースを最小限かつテストしやすい状態に保ちます。

## スコープ

- パッケージ名: `qwen-code-sdk`
- インポートパス: `qwen_code_sdk`
- 実行環境要件: Python `>=3.10`
- CLI 依存関係: v1 では外部の `qwen` 実行ファイルが必要
- トランスポート範囲: プロセストランスポートのみ
- v1 に含まれないもの: ACP トランスポート、SDK 組み込みの MCP サーバー

## インストール

```bash
pip install qwen-code-sdk
```

`qwen` が `PATH` に含まれていない場合は、`path_to_qwen_executable` を明示的に指定してください。

## クイックスタート

```python
import asyncio

from qwen_code_sdk import is_sdk_result_message, query


async def main() -> None:
    result = query(
        "Explain the repository structure.",
        {
            "cwd": "/path/to/project",
            "path_to_qwen_executable": "qwen",
        },
    )

    async for message in result:
        if is_sdk_result_message(message):
            print(message["result"])


asyncio.run(main())
```

## API サーフェス

### トップレベルのエントリポイント

- `query(prompt, options=None) -> Query`
- `query_sync(prompt, options=None) -> SyncQuery`

`prompt` は以下のいずれかをサポートします：

- シングルターンリクエスト用の `str`
- マルチターンストリーム用の `AsyncIterable[SDKUserMessage]`

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

v1 でサポートされるオプション：

- `cwd`
- `model`
- `path_to_qwen_executable`
- `permission_mode`
- `can_use_tool`
- `env`
- `system_prompt`
- `append_system_prompt`
- `debug`
- `max_session_turns`
- `core_tools`
- `exclude_tools`
- `allowed_tools`
- `auth_type`
- `include_partial_messages`
- `resume`
- `continue_session`
- `session_id`
- `timeout`
- `mcp_servers`
- `stderr`

セッション引数の優先順位は以下で固定されています：

1. `resume`
2. `continue_session`
3. `session_id`

## パーミッションの処理

CLI が `can_use_tool` コントロールリクエストを発行すると、SDK はそれを `can_use_tool(tool_name, tool_input, context)` にルーティングします。

- デフォルトの動作: 拒否
- デフォルトのタイムアウト: 60 秒
- タイムアウト時のフォールバック: 拒否
- コールバックの例外: エラーメッセージ付きの拒否に変換
- コールバックのコンテキスト: `cancel_event`、`suggestions`、`blocked_path`
- コールバックの仕様: `can_use_tool` は 3 つの位置引数を取る非同期関数である必要があります。`stderr` は 1 つの位置引数（文字列）を受け取る必要があります。

## エラーモデル

- `ValidationError`: 無効なオプション、無効な UUID、サポートされていない組み合わせ
- `ControlRequestTimeoutError`: 初期化、割り込み、またはその他のコントロールリクエストがタイムアウト
- `ProcessExitError`: CLI が 0 以外で終了
- `AbortError`: コントロールリクエストまたはセッションがキャンセルされた

## トラブルシューティング

SDK が CLI を起動できない場合：

- ターゲット環境で `qwen --version` が動作するか確認する
- シェルが `nvm`、`pyenv`、またはその他の非標準の PATH 設定を使用している場合は、`path_to_qwen_executable` を指定する
- デバッグ時に CLI の stderr を出力するには、`debug=True` または `stderr=print` を使用する

セッションコントロールの呼び出しがタイムアウトする場合：

- ターゲットの `qwen` バージョンが `--input-format stream-json` をサポートしているか確認する
- `timeout.control_request` の値を増やす
- stdout/stderr を隠蔽するラッパースクリプトが存在しないか確認する

## リポジトリ統合

リポジトリレベルのヘルパーコマンド：

- `npm run test:sdk:python`
- `npm run lint:sdk:python`
- `npm run typecheck:sdk:python`
- `npm run smoke:sdk:python -- --qwen qwen`

## E2E スモークテスト（実環境）

実際のランタイムチェック（実際の `qwen` プロセス + 実際のモデル呼び出し）を行うには、リポジトリのルートから実行してください。npm ヘルパーは `python3` を使用するため、Python `>=3.10` のインタープリタに解決されることを確認してください：

```bash
npm run smoke:sdk:python -- --qwen qwen
```

このスクリプトは以下を実行します：

- 非同期シングルターンクエリ
- 非同期コントロールフロー（`supported_commands`、パーミッションモードの更新）
- 同期 `query_sync` クエリ

JSON を出力し、失敗した場合は 0 以外の終了コードを返します。