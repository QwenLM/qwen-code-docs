# Qwen Code 設定

Qwen Code では、動作を設定する方法がいくつか用意されています。環境変数、コマンドライン引数、設定ファイルなどがあります。このドキュメントでは、それぞれの設定方法と利用可能な設定項目について説明します。

## 設定の優先順位

設定は以下の優先順位に従って適用されます（数字が小さいほど優先度が低く、大きいものに上書きされます）：

1.  **デフォルト値:** アプリケーション内にハードコードされたデフォルト値。
2.  **ユーザー設定ファイル:** 現在のユーザー向けのグローバル設定。
3.  **プロジェクト設定ファイル:** プロジェクト固有の設定。
4.  **システム設定ファイル:** システム全体に適用される設定。
5.  **環境変数:** システム全体またはセッション固有の変数。`.env` ファイルから読み込まれる場合もあります。
6.  **コマンドライン引数:** CLI 起動時に渡される値。

## 設定ファイル

Qwen Code は永続的な設定のために `settings.json` ファイルを使用します。このファイルの配置場所は次の3つです：

- **ユーザー設定ファイル:**
  - **場所:** `~/.qwen/settings.json`（`~` はホームディレクトリ）
  - **適用範囲:** 現在のユーザーのすべての Qwen Code セッションに適用されます。
- **プロジェクト設定ファイル:**
  - **場所:** プロジェクトのルートディレクトリ内の `.qwen/settings.json`
  - **適用範囲:** その特定のプロジェクトから Qwen Code を実行するときのみ適用されます。プロジェクト設定はユーザー設定より優先されます。

- **システム設定ファイル:**
  - **場所:** `/etc/qwen-code/settings.json`（Linux）、`C:\ProgramData\qwen-code\settings.json`（Windows）または `/Library/Application Support/QwenCode/settings.json`（macOS）。パスは環境変数 `QWEN_CODE_SYSTEM_SETTINGS_PATH` で上書きできます。
  - **適用範囲:** システム上のすべてのユーザーの Qwen Code セッションに適用されます。システム設定はユーザー設定およびプロジェクト設定より優先されます。エンタープライズ環境でシステム管理者がユーザーの Qwen Code 環境を一元管理したい場合に便利です。

**設定における環境変数についての注意:** `settings.json` ファイル内の文字列値では、`$VAR_NAME` または `${VAR_NAME}` 構文を使って環境変数を参照できます。これらの変数は設定読み込み時に自動的に解決されます。例えば、環境変数 `MY_API_TOKEN` がある場合、次のように `settings.json` で使用できます：`"apiKey": "$MY_API_TOKEN"`。

### プロジェクト内の `.qwen` ディレクトリ

プロジェクト設定ファイルに加えて、プロジェクトの `.qwen` ディレクトリには、Qwen Code の動作に関連するその他のプロジェクト固有のファイルを含めることができます。例:

- [カスタムサンドボックスプロファイル](#sandboxing) (例: `.qwen/sandbox-macos-custom.sb`、`.qwen/sandbox.Dockerfile`)

### `settings.json` で利用可能な設定:

- **`contextFileName`** (文字列または文字列の配列):
  - **説明:** コンテキストファイルのファイル名を指定します（例: `QWEN.md`, `AGENTS.md`）。単一のファイル名、または許可するファイル名のリストを指定できます。
  - **デフォルト:** `QWEN.md`
  - **例:** `"contextFileName": "AGENTS.md"`

- **`bugCommand`** (オブジェクト):
  - **説明:** `/bug` コマンドのデフォルトURLを上書きします。
  - **デフォルト:** `"urlTemplate": "https://github.com/QwenLM/qwen-code/issues/new?template=bug_report.yml&title={title}&info={info}"`
  - **プロパティ:**
    - **`urlTemplate`** (文字列): `{title}` および `{info}` プレースホルダーを含むことができるURL。
  - **例:**
    ```json
    "bugCommand": {
      "urlTemplate": "https://bug.example.com/new?title={title}&info={info}"
    }
    ```

- **`fileFiltering`** (オブジェクト):
  - **説明:** @ コマンドやファイル検出ツールにおける git-aware なファイルフィルタリングの動作を制御します。
  - **デフォルト:** `"respectGitIgnore": true, "enableRecursiveFileSearch": true`
  - **プロパティ:**
    - **`respectGitIgnore`** (boolean): ファイル検出時に .gitignore のパターンを尊重するかどうか。`true` に設定すると、git で無視されたファイル（`node_modules/`, `dist/`, `.env` など）は @ コマンドやファイルリスト操作から自動的に除外されます。
    - **`enableRecursiveFileSearch`** (boolean): プロンプトで @ プレフィックスを補完する際に、現在のツリー配下のファイル名を再帰的に検索するかどうか。
  - **例:**
    ```json
    "fileFiltering": {
      "respectGitIgnore": true,
      "enableRecursiveFileSearch": false
    }
    ```

- **`coreTools`** (文字列の配列):
  - **説明:** モデルで利用可能にするコアツール名のリストを指定できます。これにより、組み込みツールのセットを制限できます。コアツールの一覧については [Built-in Tools](../core/tools-api.md#built-in-tools) を参照してください。また、`ShellTool` のように対応しているツールについては、コマンド単位での制限を指定できます。例: `"coreTools": ["ShellTool(ls -l)"]` は `ls -l` コマンドのみを許可します。
  - **デフォルト:** モデルで利用可能なすべてのツール。
  - **例:** `"coreTools": ["ReadFileTool", "GlobTool", "ShellTool(ls)"]`

- **`excludeTools`** (文字列の配列):
  - **説明:** モデルから除外するコアツール名のリストを指定できます。`excludeTools` と `coreTools` の両方に記載されたツールは除外されます。`ShellTool` のように対応しているツールについては、コマンド単位での制限を指定できます。例: `"excludeTools": ["ShellTool(rm -rf)"]` は `rm -rf` コマンドをブロックします。
  - **デフォルト:** 除外されるツールはありません。
  - **例:** `"excludeTools": ["run_shell_command", "findFiles"]`
  - **セキュリティに関する注意:** `excludeTools` における `run_shell_command` のコマンド単位の制限は、単純な文字列マッチに基づいているため、簡単に回避可能です。この機能は**セキュリティメカニズムではありません**。信頼できないコードを安全に実行するためにこの機能に依存しないでください。実行可能なコマンドを明示的に選択するには `coreTools` を使用することを推奨します。

- **`allowMCPServers`** (文字列の配列):
  - **説明:** モデルで利用可能にする MCP サーバー名のリストを指定できます。これにより、接続する MCP サーバーのセットを制限できます。`--allowed-mcp-server-names` が設定されている場合、この設定は無視されます。
  - **デフォルト:** モデルで利用可能なすべての MCP サーバー。
  - **例:** `"allowMCPServers": ["myPythonServer"]`
  - **セキュリティに関する注意:** この設定は MCP サーバー名の単純な文字列マッチを使用しており、変更可能です。ユーザーによるバイパスを防ぎたいシステム管理者は、システム設定レベルで `mcpServers` を構成し、ユーザーが独自の MCP サーバーを設定できないようにすることを検討してください。これは堅牢なセキュリティメカニズムとして使用すべきではありません。

- **`excludeMCPServers`** (文字列の配列):
  - **説明:** モデルから除外する MCP サーバー名のリストを指定できます。`excludeMCPServers` と `allowMCPServers` の両方に記載されたサーバーは除外されます。`--allowed-mcp-server-names` が設定されている場合、この設定は無視されます。
  - **デフォルト:** 除外される MCP サーバーはありません。
  - **例:** `"excludeMCPServers": ["myNodeServer"]`
  - **セキュリティに関する注意:** この設定は MCP サーバー名の単純な文字列マッチを使用しており、変更可能です。ユーザーによるバイパスを防ぎたいシステム管理者は、システム設定レベルで `mcpServers` を構成し、ユーザーが独自の MCP サーバーを設定できないようにすることを検討してください。これは堅牢なセキュリティメカニズムとして使用すべきではありません。

- **`autoAccept`** (boolean):
  - **説明:** CLI が安全と見なされるツール呼び出し（例: 読み取り専用操作）を、ユーザーの明示的な確認なしに自動的に受け入れて実行するかどうかを制御します。`true` に設定すると、CLI は安全と判断されたツールに対して確認プロンプトをスキップします。
  - **デフォルト:** `false`
  - **例:** `"autoAccept": true`

- **`theme`** (文字列):
  - **説明:** Qwen Code の視覚的な [テーマ](./themes.md) を設定します。
  - **デフォルト:** `"Default"`
  - **例:** `"theme": "GitHub"`

- **`vimMode`** (boolean):
  - **説明:** 入力編集用の vim モードを有効または無効にします。有効にすると、入力エリアで vim スタイルのナビゲーションおよび編集コマンド（NORMAL モードと INSERT モード）がサポートされます。vim モードの状態はフッターに表示され、セッション間で保持されます。
  - **デフォルト:** `false`
  - **例:** `"vimMode": true`

- **`sandbox`** (boolean または文字列):
  - **説明:** ツール実行時のサンドボックスの使用方法を制御します。`true` に設定すると、Qwen Code は事前にビルドされた `qwen-code-sandbox` Docker イメージを使用します。詳細については [Sandboxing](#sandboxing) を参照してください。
  - **デフォルト:** `false`
  - **例:** `"sandbox": "docker"`

- **`toolDiscoveryCommand`** (文字列):
  - **説明:** プロジェクトからツールを検出するためのカスタムシェルコマンドを定義します。シェルコマンドは `stdout` に [function declarations](https://ai.google.dev/gemini-api/docs/function-calling#function-declarations) の JSON 配列を返す必要があります。ツールラッパーはオプションです。
  - **デフォルト:** 空
  - **例:** `"toolDiscoveryCommand": "bin/get_tools"`

- **`toolCallCommand`** (文字列):
  - **説明:** `toolDiscoveryCommand` を使用して検出された特定のツールを呼び出すためのカスタムシェルコマンドを定義します。シェルコマンドは以下の条件を満たす必要があります:
    - 最初のコマンドライン引数として関数の `name`（[function declaration](https://ai.google.dev/gemini-api/docs/function-calling#function-declarations) と完全に一致するもの）を受け取る。
    - `stdin` から JSON 形式の関数引数を読み取る（[`functionCall.args`](https://cloud.google.com/vertex-ai/generative-ai/docs/model-reference/inference#functioncall) と同様）。
    - `stdout` に JSON 形式の関数出力を返す（[`functionResponse.response.content`](https://cloud.google.com/vertex-ai/generative-ai/docs/model-reference/inference#functionresponse) と同様）。
  - **デフォルト:** 空
  - **例:** `"toolCallCommand": "bin/call_tool"`

- **`mcpServers`** (オブジェクト):
  - **説明:** カスタムツールを検出して使用するための Model-Context Protocol (MCP) サーバーへの接続を構成します。Qwen Code は構成された各 MCP サーバーに接続し、利用可能なツールを検出しようとします。複数の MCP サーバーが同じ名前のツールを公開している場合、ツール名は構成で定義したサーバーエイリアスでプレフィックスが付けられ（例: `serverAlias__actualToolName`）、競合を回避します。システムは互換性のために MCP ツール定義から特定のスキーマプロパティを削除する場合があります。`command`、`url`、`httpUrl` のうち少なくとも1つを指定する必要があります。複数が指定された場合、優先順位は `httpUrl` > `url` > `command` です。
  - **デフォルト:** 空
  - **プロパティ:**
    - **`<SERVER_NAME>`** (オブジェクト): 指定されたサーバーのパラメータ。
      - `command` (文字列, 任意): 標準入出力を介して MCP サーバーを起動するコマンド。
      - `args` (文字列の配列, 任意): コマンドに渡す引数。
      - `env` (オブジェクト, 任意): サーバープロセスに設定する環境変数。
      - `cwd` (文字列, 任意): サーバーを起動する作業ディレクトリ。
      - `url` (文字列, 任意): Server-Sent Events (SSE) を使用して通信する MCP サーバーの URL。
      - `httpUrl` (文字列, 任意): ストリーム可能な HTTP を使用して通信する MCP サーバーの URL。
      - `headers` (オブジェクト, 任意): `url` または `httpUrl` へのリクエストで送信する HTTP ヘッダーのマップ。
      - `timeout` (数値, 任意): この MCP サーバーへのリクエストのタイムアウト（ミリ秒）。
      - `trust` (boolean, 任意): このサーバーを信頼し、すべてのツール呼び出し確認をバイパスします。
      - `description` (文字列, 任意): 表示目的で使用されるサーバーの簡単な説明。
      - `includeTools` (文字列の配列, 任意): この MCP サーバーから含めるツール名のリスト。指定された場合、ここにリストされたツールのみがこのサーバーから利用可能になります（ホワイトリスト動作）。指定されていない場合、デフォルトでサーバーのすべてのツールが有効になります。
      - `excludeTools` (文字列の配列, 任意): この MCP サーバーから除外するツール名のリスト。ここにリストされたツールは、サーバーが公開していてもモデルでは利用できません。**注意:** `excludeTools` は `includeTools` よりも優先されます。両方のリストにツールが含まれている場合、除外されます。
  - **例:**
    ```json
    "mcpServers": {
      "myPythonServer": {
        "command": "python",
        "args": ["mcp_server.py", "--port", "8080"],
        "cwd": "./mcp_tools/python",
        "timeout": 5000,
        "includeTools": ["safe_tool", "file_reader"],
      },
      "myNodeServer": {
        "command": "node",
        "args": ["mcp_server.js"],
        "cwd": "./mcp_tools/node",
        "excludeTools": ["dangerous_tool", "file_deleter"]
      },
      "myDockerServer": {
        "command": "docker",
        "args": ["run", "-i", "--rm", "-e", "API_KEY", "ghcr.io/foo/bar"],
        "env": {
          "API_KEY": "$MY_API_TOKEN"
        }
      },
      "mySseServer": {
        "url": "http://localhost:8081/events",
        "headers": {
          "Authorization": "Bearer $MY_SSE_TOKEN"
        },
        "description": "An example SSE-based MCP server."
      },
      "myStreamableHttpServer": {
        "httpUrl": "http://localhost:8082/stream",
        "headers": {
          "X-API-Key": "$MY_HTTP_API_KEY"
        },
        "description": "An example Streamable HTTP-based MCP server."
      }
    }
    ```

- **`checkpointing`** (オブジェクト):
  - **説明:** 会話およびファイルの状態を保存・復元するチェックポイント機能を構成します。詳細については [Checkpointing documentation](../checkpointing.md) を参照してください。
  - **デフォルト:** `{"enabled": false}`
  - **プロパティ:**
    - **`enabled`** (boolean): `true` の場合、`/restore` コマンドが利用可能になります。

- **`preferredEditor`** (文字列):
  - **説明:** diff 表示に使用するエディタを指定します。
  - **デフォルト:** `vscode`
  - **例:** `"preferredEditor": "vscode"`

- **`telemetry`** (オブジェクト)
  - **説明:** Qwen Code のロギングおよびメトリクス収集を構成します。詳細については [Telemetry](../telemetry.md) を参照してください。
  - **デフォルト:** `{"enabled": false, "target": "local", "otlpEndpoint": "http://localhost:4317", "logPrompts": true}`
  - **プロパティ:**
    - **`enabled`** (boolean): テレメトリが有効かどうか。
    - **`target`** (文字列): 収集されたテレメトリの送信先。サポートされる値は `local` および `gcp`。
    - **`otlpEndpoint`** (文字列): OTLP Exporter のエンドポイント。
    - **`logPrompts`** (boolean): ユーザープロンプトの内容をログに含めるかどうか。
  - **例:**
    ```json
    "telemetry": {
      "enabled": true,
      "target": "local",
      "otlpEndpoint": "http://localhost:16686",
      "logPrompts": false
    }
    ```

- **`usageStatisticsEnabled`** (boolean):
  - **説明:** 使用統計情報の収集を有効または無効にします。詳細については [Usage Statistics](#usage-statistics) を参照してください。
  - **デフォルト:** `true`
  - **例:**
    ```json
    "usageStatisticsEnabled": false
    ```

- **`hideTips`** (boolean):
  - **説明:** CLI インターフェースでの役立つヒントの表示を有効または無効にします。
  - **デフォルト:** `false`
  - **例:**
    ```json
    "hideTips": true
    ```

- **`hideBanner`** (boolean):
  - **説明:** CLI インターフェースでの起動バナー（ASCII アートロゴ）の表示を有効または無効にします。
  - **デフォルト:** `false`
  - **例:**
    ```json
    "hideBanner": true
    ```

- **`maxSessionTurns`** (数値

### `settings.json` の例:

```json
{
  "theme": "GitHub",
  "sandbox": "docker",
  "toolDiscoveryCommand": "bin/get_tools",
  "toolCallCommand": "bin/call_tool",
  "tavilyApiKey": "$TAVILY_API_KEY",
  "mcpServers": {
    "mainServer": {
      "command": "bin/mcp_server.py"
    },
    "anotherServer": {
      "command": "node",
      "args": ["mcp_server.js", "--verbose"]
    }
  },
  "telemetry": {
    "enabled": true,
    "target": "local",
    "otlpEndpoint": "http://localhost:4317",
    "logPrompts": true
  },
  "usageStatisticsEnabled": true,
  "hideTips": false,
  "hideBanner": false,
  "maxSessionTurns": 10,
  "summarizeToolOutput": {
    "run_shell_command": {
      "tokenBudget": 100
    }
  },
  "excludedProjectEnvVars": ["DEBUG", "DEBUG_MODE", "NODE_ENV"],
  "includeDirectories": ["path/to/dir1", "~/path/to/dir2", "../path/to/dir3"],
  "loadMemoryFromIncludeDirectories": true
}
```

## Shell History

CLI は実行した shell コマンドの履歴を保持します。異なるプロジェクト間での競合を避けるため、この履歴はユーザーのホームフォルダ内のプロジェクト固有のディレクトリに保存されます。

- **Location:** `~/.qwen/tmp/<project_hash>/shell_history`
  - `<project_hash>` はプロジェクトのルートパスから生成される一意の識別子です。
  - 履歴は `shell_history` という名前のファイルに保存されます。

## 環境変数と `.env` ファイル

環境変数は、アプリケーションを設定する一般的な方法です。特に API キーのような機密情報や、環境によって変わる設定に使われます。認証の設定については、[認証ドキュメント](./authentication.md)を参照してください。利用可能なすべての認証方法が記載されています。

CLI は `.env` ファイルから自動的に環境変数を読み込みます。読み込み順序は以下の通りです：

1.  カレントディレクトリにある `.env` ファイル。
2.  見つからない場合、親ディレクトリを上に向かって探索し、`.env` ファイルが見つかるか、プロジェクトルート（`.git` フォルダで識別）またはホームディレクトリに到達するまで続けます。
3.  それでも見つからない場合、`~/.env`（ユーザーのホームディレクトリ内）を探します。

**環境変数の除外：** 一部の環境変数（例：`DEBUG` や `DEBUG_MODE`）は、CLI の動作に干渉するのを防ぐため、プロジェクトの `.env` ファイルからはデフォルトで除外されます。`.qwen/.env` ファイルからの変数は除外されません。この動作は、`settings.json` ファイルの `excludedProjectEnvVars` 設定でカスタマイズできます。

- **`OPENAI_API_KEY`**:
  - 利用可能な[認証方法](./authentication.md)の一つ。
  - シェルプロファイル（例：`~/.bashrc`、`~/.zshrc`）または `.env` ファイルで設定します。
- **`OPENAI_BASE_URL`**:
  - 利用可能な[認証方法](./authentication.md)の一つ。
  - シェルプロファイル（例：`~/.bashrc`、`~/.zshrc`）または `.env` ファイルで設定します。
- **`OPENAI_MODEL`**:
  - 使用するデフォルトの OPENAI モデルを指定します。
  - ハードコードされたデフォルト値を上書きします。
  - 例: `export OPENAI_MODEL="qwen3-coder-plus"`
- **`GEMINI_SANDBOX`**:
  - `settings.json` の `sandbox` 設定の代替。
  - `true`、`false`、`docker`、`podman`、またはカスタムコマンド文字列を受け取ります。
- **`SEATBELT_PROFILE`**（macOS 固有）:
  - macOS で Seatbelt（`sandbox-exec`）プロファイルを切り替えます。
  - `permissive-open`: （デフォルト）プロジェクトフォルダ（およびいくつかの他のフォルダ）への書き込みを制限しますが、その他の操作は許可されます（詳細は `packages/cli/src/utils/sandbox-macos-permissive-open.sb` を参照）。
  - `strict`: デフォルトで操作を拒否する厳格なプロファイルを使用します。
  - `<profile_name>`: カスタムプロファイルを使用します。カスタムプロファイルを定義するには、プロジェクトの `.qwen/` ディレクトリに `sandbox-macos-<profile_name>.sb` という名前のファイルを作成します（例：`my-project/.qwen/sandbox-macos-custom.sb`）。
- **`DEBUG` または `DEBUG_MODE`**（CLI 自体や内部ライブラリでよく使われる）:
  - `true` または `1` に設定すると、詳細なデバッグログを有効にします。トラブルシューティングに役立ちます。
  - **注意：** これらの変数は、CLI の動作に干渉するのを防ぐため、プロジェクトの `.env` ファイルからはデフォルトで除外されます。Qwen Code でこれらの変数を使用する必要がある場合は、`.qwen/.env` ファイルを使用してください。
- **`NO_COLOR`**:
  - 任意の値を設定すると、CLI のすべてのカラー出力を無効にします。
- **`CLI_TITLE`**:
  - 文字列を設定して、CLI のタイトルをカスタマイズします。
- **`CODE_ASSIST_ENDPOINT`**:
  - コードアシストサーバーのエンドポイントを指定します。
  - 開発やテストに役立ちます。
- **`TAVILY_API_KEY`**:
  - Tavily ウェブ検索サービスの API キー。
  - `web_search` ツール機能を有効にするために必要です。
  - 設定されていない場合、ウェブ検索ツールは無効化されスキップされます。
  - 例: `export TAVILY_API_KEY="tvly-your-api-key-here"`

## コマンドライン引数

CLI 実行時に直接渡された引数は、そのセッションにおいて他の設定を上書きできます。

- **`--model <model_name>`** (**`-m <model_name>`**):
  - このセッションで使用する Qwen モデルを指定します。
  - 例: `npm start -- --model qwen3-coder-plus`
- **`--prompt <your_prompt>`** (**`-p <your_prompt>`**):
  - プロンプトをコマンドに直接渡すために使用します。これにより、Qwen Code が非インタラクティブモードで起動します。
- **`--prompt-interactive <your_prompt>`** (**`-i <your_prompt>`**):
  - 指定したプロンプトを初期入力としてインタラクティブセッションを開始します。
  - プロンプトはセッション開始前に処理されるのではなく、セッション内で処理されます。
  - stdin からの入力をパイプで渡す場合には使用できません。
  - 例: `qwen -i "explain this code"`
- **`--sandbox`** (**`-s`**):
  - このセッションでサンドボックスモードを有効にします。
- **`--sandbox-image`**:
  - サンドボックスイメージの URI を設定します。
- **`--debug`** (**`-d`**):
  - このセッションでデバッグモードを有効にし、より詳細な出力を提供します。
- **`--all-files`** (**`-a`**):
  - 設定すると、現在のディレクトリ内のすべてのファイルを再帰的にプロンプトのコンテキストに含めます。
- **`--help`** (**`-h`**):
  - コマンドライン引数に関するヘルプ情報を表示します。
- **`--show-memory-usage`**:
  - 現在のメモリ使用量を表示します。
- **`--yolo`**:
  - YOLO モードを有効にし、すべてのツール呼び出しを自動的に承認します。
- **`--approval-mode <mode>`**:
  - ツール呼び出しの承認モードを設定します。利用可能なモード:
    - `default`: 各ツール呼び出しで承認を求める（デフォルトの動作）
    - `auto_edit`: 編集系ツール（edit、write_file）は自動承認し、それ以外は承認を求める
    - `yolo`: すべてのツール呼び出しを自動承認（`--yolo` と同等）
  - `--yolo` と同時に使用することはできません。新しい統一されたアプローチでは、`--yolo` の代わりに `--approval-mode=yolo` を使用してください。
  - 例: `qwen --approval-mode auto_edit`
- **`--telemetry`**:
  - [telemetry](../telemetry.md) を有効にします。
- **`--telemetry-target`**:
  - テレメトリのターゲットを設定します。詳細は [telemetry](../telemetry.md) を参照してください。
- **`--telemetry-otlp-endpoint`**:
  - テレメトリ用の OTLP エンドポイントを設定します。詳細は [telemetry](../telemetry.md) を参照してください。
- **`--telemetry-otlp-protocol`**:
  - テレメトリ用の OTLP プロトコルを設定します（`grpc` または `http`）。デフォルトは `grpc` です。詳細は [telemetry](../telemetry.md) を参照してください。
- **`--telemetry-log-prompts`**:
  - テレメトリ用にプロンプトのログを有効にします。詳細は [telemetry](../telemetry.md) を参照してください。
- **`--checkpointing`**:
  - [checkpointing](../checkpointing.md) を有効にします。
- **`--extensions <extension_name ...>`** (**`-e <extension_name ...>`**):
  - セッションで使用する拡張機能のリストを指定します。指定しない場合、利用可能なすべての拡張機能が使用されます。
  - 特殊なキーワード `qwen -e none` を使用して、すべての拡張機能を無効にできます。
  - 例: `qwen -e my-extension -e my-other-extension`
- **`--list-extensions`** (**`-l`**):
  - 利用可能なすべての拡張機能をリスト表示して終了します。
- **`--proxy`**:
  - CLI のプロキシを設定します。
  - 例: `--proxy http://localhost:7890`
- **`--include-directories <dir1,dir2,...>`**:
  - マルチディレクトリ対応のためにワークスペースに追加のディレクトリを含めます。
  - 複数回指定するか、カンマ区切りで指定できます。
  - 最大で 5 つのディレクトリを追加できます。
  - 例: `--include-directories /path/to/project1,/path/to/project2` または `--include-directories /path/to/project1 --include-directories /path/to/project2`
- **`--version`**:
  - CLI のバージョンを表示します。
- **`--openai-logging`**:
  - OpenAI API 呼び出しのログを有効にして、デバッグや分析に役立てます。このフラグは `settings.json` の `enableOpenAILogging` 設定を上書きします。
- **`--tavily-api-key <api_key>`**:
  - このセッションでウェブ検索機能に使用する Tavily API キーを設定します。
  - 例: `qwen --tavily-api-key tvly-your-api-key-here`

## Context ファイル（階層型インストラクショナルコンテキスト）

CLI の**動作**を直接設定するものではありませんが、Context ファイル（デフォルトでは `QWEN.md`、`contextFileName` 設定で変更可能）は、**インストラクショナルコンテキスト**（「メモリ」とも呼ばれます）を設定するために非常に重要です。この強力な機能により、プロジェクト固有の指示、コーディングスタイルガイド、または関連する背景情報を AI に提供でき、あなたのニーズにより適切で正確な応答を得ることができます。CLI には、フッターにロードされた Context ファイル数を表示するインジケータなど、アクティブなコンテキストの状態を確認できる UI 要素も含まれています。

- **目的：** これらの Markdown ファイルには、Qwen モデルとのやり取り中に参照してほしい指示、ガイドライン、またはコンテキスト情報を記述します。システムは、このインストラクショナルコンテキストを階層的に管理するように設計されています。

### コンテキストファイルの例（例：`QWEN.md`）

以下は、TypeScriptプロジェクトのルートにあるコンテキストファイルが含む内容の概念的な例です：

```markdown

# Project: My Awesome TypeScript Library

## 一般的な指示:

- 新しいTypeScriptコードを生成する際は、既存のコーディングスタイルに従ってください。
- 新しい関数やクラスには、必ずJSDocコメントを付与してください。
- 適切な場面では、関数型プログラミングのパラダイムを優先してください。
- すべてのコードは、TypeScript 5.0およびNode.js 20+と互換性がある必要があります。

## コーディングスタイル:

- インデントにはスペース2つを使用してください。
- インターフェース名の先頭には`I`を付けてください（例：`IUserService`）。
- クラスのプライベートメンバーの先頭にはアンダースコア（`_`）を付けてください。
- 常に厳密等価演算子（`===`および`!==`）を使用してください。

## 特定のコンポーネント: `src/api/client.ts`

- このファイルは、すべての外部APIリクエストを処理します。
- 新しいAPI呼び出し関数を追加する際は、堅牢なエラーハンドリングとロギングを必ず含めてください。
- GETリクエストには、既存の`fetchWithRetry`ユーティリティを使用してください。

```markdown
## 依存関係について:

- 新しい外部依存関係の導入は、どうしても必要な場合を除き避けてください。
- 新しい依存関係が必要な場合は、その理由を明記してください。

この例は、プロジェクト全体のコンテキスト情報や特定のコーディング規約、特定のファイルやコンポーネントに関する注意書きなどをどのように提供するかを示しています。コンテキストファイルがどれだけ関連性が高く正確であるかによって、AIがあなたをどれだけ効果的に支援できるかが決まります。プロジェクト固有のコンテキストファイルの作成を強く推奨します。これにより、プロジェクト内での規約やコンテキストを確立できます。

- **階層的なロードと優先順位:** CLIは、複数の場所からコンテキストファイル（例: `QWEN.md`）をロードすることで、洗練された階層的なメモリシステムを実装しています。このリストの下位（より具体的な）ファイルの内容は、通常、上位（より一般的な）ファイルの内容を上書きまたは補完します。結合順序や最終的なコンテキストの詳細は、`/memory show` コマンドで確認できます。一般的なロード順序は以下の通りです:
  1.  **グローバルコンテキストファイル:**
      - 場所: `~/.qwen/<contextFileName>`（例: ユーザーのホームディレクトリにある `~/.qwen/QWEN.md`）。
      - 範囲: すべてのプロジェクトに対してデフォルトの指示を提供します。
  2.  **プロジェクトルートおよび祖先ディレクトリのコンテキストファイル:**
      - 場所: CLIは、現在の作業ディレクトリから設定されたコンテキストファイルを検索し、次に各親ディレクトリを `.git` フォルダで識別されるプロジェクトルートまたはホームディレクトリまで検索します。
      - 範囲: プロジェクト全体またはその主要な部分に関連するコンテキストを提供します。
  3.  **サブディレクトリのコンテキストファイル（コンテキスト依存/ローカル）:**
      - 場所: CLIは、現在の作業ディレクトリ以下のサブディレクトリ（`node_modules`、`.git` などの一般的な無視パターンを尊重して）からも設定されたコンテキストファイルをスキャンします。この検索の深さはデフォルトでは200ディレクトリに制限されていますが、`settings.json` ファイルの `memoryDiscoveryMaxDirs` フィールドで設定可能です。
      - 範囲: 特定のコンポーネント、モジュール、またはプロジェクトのサブセクションに関連する非常に具体的な指示を可能にします。
- **結合とUI表示:** 見つかったすべてのコンテキストファイルの内容は、（その出所とパスを示すセパレータとともに）結合され、システムプロンプトの一部として提供されます。CLIのフッターにはロードされたコンテキストファイルの数が表示され、現在アクティブな指示コンテキストを視覚的に確認できます。
- **コンテンツのインポート:** `@path/to/file.md` 構文を使用して、他のMarkdownファイルをインポートすることで、コンテキストファイルをモジュール化できます。詳細については、[Memory Import Processor documentation](../core/memport.md) を参照してください。
- **メモリ管理用コマンド:**
  - `/memory refresh` を使用して、すべての設定された場所からすべてのコンテキストファイルを強制的に再スキャンおよび再ロードできます。これにより、AIの指示コンテキストが更新されます。
  - `/memory show` を使用して、現在ロードされている結合された指示コンテキストを表示し、AIが使用している階層と内容を確認できます。
  - `/memory` コマンドとそのサブコマンド（`show` および `refresh`）の詳細については、[Commands documentation](./commands.md#memory) を参照してください。

これらの設定レイヤーとコンテキストファイルの階層構造を理解し活用することで、AIのメモリを効果的に管理し、Qwen Codeの応答をあなたの特定のニーズやプロジェクトに合わせて調整できます。
```

## サンドボックス

Qwen Code は、システムを保護するために、サンドボックス環境内で潜在的に危険な操作（シェルコマンドやファイルの変更など）を実行できます。

サンドボックスはデフォルトでは無効になっていますが、以下の方法で有効にできます：

- `--sandbox` または `-s` フラグを使用する
- `GEMINI_SANDBOX` 環境変数を設定する
- `--yolo` または `--approval-mode=yolo` を使用する場合、デフォルトでサンドボックスが有効になります

デフォルトでは、事前にビルドされた `qwen-code-sandbox` Docker イメージを使用します。

プロジェクト固有のサンドボックス要件がある場合は、プロジェクトのルートディレクトリに `.qwen/sandbox.Dockerfile` というカスタム Dockerfile を作成できます。この Dockerfile はベースとなるサンドボックスイメージを元に作成できます：

```dockerfile
FROM qwen-code-sandbox

# ここにカスタムの依存関係や設定を追加してください

# 例：

# RUN apt-get update && apt-get install -y some-package
```

# COPY ./my-config /app/my-config
```

`.qwen/sandbox.Dockerfile` が存在する場合、Qwen Code を実行する際に `BUILD_SANDBOX` 環境変数を使用することで、カスタム sandbox イメージを自動的にビルドできます：

```bash
BUILD_SANDBOX=1 qwen -s
```

## 使用統計情報

Qwen Code の改善のために、匿名化された使用統計情報を収集しています。このデータは、CLI がどのように使われているかを理解し、一般的な問題を特定し、新機能の優先順位を決定するために役立ちます。

**収集する情報:**

- **ツール呼び出し:** 呼び出されたツールの名前、成功または失敗の結果、実行にかかった時間などを記録します。ただし、ツールに渡された引数や、ツールが返したデータは収集しません。
- **API リクエスト:** 各リクエストで使用されたモデル、リクエストの所要時間、成功したかどうかを記録します。プロンプトやレスポンスの内容は収集しません。
- **セッション情報:** 有効化されているツールや承認モードなど、CLI の設定に関する情報を収集します。

**収集しない情報:**

- **個人を特定できる情報 (PII):** 氏名、メールアドレス、API キーなど、個人を特定できる情報は一切収集しません。
- **プロンプトおよびレスポンスの内容:** ユーザーが入力したプロンプトや、モデルからのレスポンスの内容は記録しません。
- **ファイルの内容:** CLI によって読み書きされたファイルの内容は記録しません。

**使用統計情報の収集をオプトアウトする方法:**

`settings.json` ファイルで `usageStatisticsEnabled` プロパティを `false` に設定することで、いつでも使用統計情報の収集をオプトアウトできます：

```json
{
  "usageStatisticsEnabled": false
}
```

注意: 使用統計情報が有効になっている場合、イベントは Alibaba Cloud の RUM 収集エンドポイントに送信されます。

- **`enableWelcomeBack`** (boolean):
  - **説明:** 会話履歴のあるプロジェクトに戻ってきたときに「Welcome back」ダイアログを表示します。
  - **デフォルト:** `true`
  - **カテゴリ:** UI
  - **再起動が必要:** いいえ
  - **例:** `"enableWelcomeBack": false`
  - **詳細:** 有効にすると、Qwen Code は以前に生成されたプロジェクトサマリー（`.qwen/PROJECT_SUMMARY.md`）があるプロジェクトに戻ってきたことを自動的に検出し、以前の会話を続けるか、新たに開始するかを選択できるダイアログを表示します。この機能は `/chat summary` コマンドおよび終了確認ダイアログと連携しています。詳しくは [Welcome Back ドキュメント](./welcome-back.md) を参照してください。