# Qwen Code 設定

Qwen Code では、動作を設定する方法がいくつか用意されています。環境変数、コマンドライン引数、設定ファイルなどがあります。このドキュメントでは、それぞれの設定方法と利用可能な設定項目について説明します。

## 設定の優先順位

設定は以下の優先順位に従って適用されます（数字が小さいものほど優先度が低く、大きいものに上書きされます）：

1.  **Default values:** アプリケーション内にハードコードされたデフォルト値。
2.  **System defaults file:** 他の設定ファイルで上書き可能な、システム全体のデフォルト設定。
3.  **User settings file:** 現在のユーザー向けのグローバル設定。
4.  **Project settings file:** プロジェクト固有の設定。
5.  **System settings file:** すべての他の設定ファイルを上書きする、システム全体の設定。
6.  **Environment variables:** システム全体またはセッション固有の変数。`.env` ファイルから読み込まれる場合もあります。
7.  **Command-line arguments:** CLI 起動時に渡される値。

## 設定ファイル

Qwen Code は JSON 設定ファイルを使用して、永続的な設定を管理します。設定ファイルは以下の4つの場所に配置できます：

- **システムデフォルトファイル:**
  - **場所:** `/etc/qwen-code/system-defaults.json` (Linux)、`C:\ProgramData\qwen-code\system-defaults.json` (Windows)、または `/Library/Application Support/QwenCode/system-defaults.json` (macOS)。このパスは、環境変数 `QWEN_CODE_SYSTEM_DEFAULTS_PATH` を使用して上書きできます。
  - **スコープ:** システム全体のデフォルト設定のベースレイヤーを提供します。これらの設定は最も低い優先度を持ち、ユーザー設定、プロジェクト設定、またはシステムオーバーライド設定によって上書きされることを想定しています。

- **ユーザー設定ファイル:**
  - **場所:** `~/.qwen/settings.json`（`~` はホームディレクトリ）。
  - **スコープ:** 現在のユーザーのすべての Qwen Code セッションに適用されます。

- **プロジェクト設定ファイル:**
  - **場所:** プロジェクトのルートディレクトリ内の `.qwen/settings.json`。
  - **スコープ:** 特定のプロジェクトから Qwen Code を実行する場合にのみ適用されます。プロジェクト設定はユーザー設定を上書きします。

- **システム設定ファイル:**
  - **場所:** `/etc/qwen-code/settings.json` (Linux)、`C:\ProgramData\qwen-code\settings.json` (Windows)、または `/Library/Application Support/QwenCode/settings.json` (macOS)。このパスは、環境変数 `QWEN_CODE_SYSTEM_SETTINGS_PATH` を使用して上書きできます。
  - **スコープ:** システム上のすべてのユーザーに対して、すべての Qwen Code セッションに適用されます。システム設定はユーザー設定およびプロジェクト設定を上書きします。エンタープライズ環境のシステム管理者が、ユーザーの Qwen Code 環境を一元管理する際に役立ちます。

**設定における環境変数についての注意:** `settings.json` ファイル内の文字列値では、`$VAR_NAME` または `${VAR_NAME}` の構文を使って環境変数を参照できます。これらの変数は、設定が読み込まれる際に自動的に解決されます。例えば、環境変数 `MY_API_TOKEN` がある場合、次のように `settings.json` 内で使用できます：

```json
"apiKey": "$MY_API_TOKEN"
```

### プロジェクト内の `.qwen` ディレクトリ

プロジェクト設定ファイルに加えて、プロジェクトの `.qwen` ディレクトリには、Qwen Code の動作に関連するその他のプロジェクト固有のファイルを含めることができます。例えば：

- [カスタムサンドボックスプロファイル](#sandboxing)（例：`.qwen/sandbox-macos-custom.sb`、`.qwen/sandbox.Dockerfile`）など。

### `settings.json` で利用可能な設定:

- **`contextFileName`** (文字列または文字列の配列):
  - **説明:** コンテキストファイルのファイル名を指定します（例: `QWEN.md`, `AGENTS.md`）。単一のファイル名、または許可するファイル名のリストを指定できます。
  - **デフォルト:** `QWEN.md`
  - **例:** `"contextFileName": "AGENTS.md"`

- **`bugCommand`** (object):
  - **説明:** `/bug` コマンドで使用されるデフォルトの URL を上書きします。
  - **デフォルト:** `"urlTemplate": "https://github.com/QwenLM/qwen-code/issues/new?template=bug_report.yml&title={title}&info={info}"`
  - **プロパティ:**
    - **`urlTemplate`** (string): `{title}` および `{info}` プレースホルダーを含むことができる URL。
  - **例:**
    ```json
    "bugCommand": {
      "urlTemplate": "https://bug.example.com/new?title={title}&info={info}"
    }
    ```

- **`fileFiltering`** (object):
  - **説明:** @ コマンドやファイル検出ツールにおける git を意識したファイルフィルタリングの動作を制御します。
  - **デフォルト:** `"respectGitIgnore": true, "enableRecursiveFileSearch": true`
  - **プロパティ:**
    - **`respectGitIgnore`** (boolean): ファイル検出時に .gitignore のパターンを尊重するかどうか。`true` に設定すると、git で無視されたファイル（例: `node_modules/`, `dist/`, `.env`）は @ コマンドやファイル一覧操作から自動的に除外されます。
    - **`enableRecursiveFileSearch`** (boolean): プロンプトで @ プレフィックスの補完中に、現在のディレクトリツリー以下を再帰的に探索するかどうか。
    - **`disableFuzzySearch`** (boolean): `true` に設定すると、ファイル検索時のファジー検索機能を無効にします。これにより、ファイル数の多いプロジェクトでのパフォーマンスが向上する可能性があります。
  - **例:**
    ```json
    "fileFiltering": {
      "respectGitIgnore": true,
      "enableRecursiveFileSearch": false,
      "disableFuzzySearch": true
    }
    ```

### ファイル検索パフォーマンスのトラブルシューティング

ファイル検索（例：`@` 補完）でパフォーマンスの問題が発生している場合、特に非常に多くのファイルを持つプロジェクトで問題が起きやすいです。以下に、推奨順に試してみるべき対策をいくつか紹介します：

1. **`.qwenignore` を使用する：** プロジェクトのルートに `.qwenignore` ファイルを作成し、参照する必要がない大量のファイルを含むディレクトリ（例：ビルド成果物、ログ、`node_modules`）を除外します。クロール対象のファイル数を減らすことが、パフォーマンス向上の最も効果的な方法です。

2. **ファジー検索を無効にする：** ファイルを無視するだけでは不十分な場合、`settings.json` ファイルで `disableFuzzySearch` を `true` に設定してファジー検索を無効にできます。これにより、シンプルなファジーでないマッチングアルゴリズムが使用され、高速化される場合があります。

3. **再帰的なファイル検索を無効にする：** 最後の手段として、`enableRecursiveFileSearch` を `false` に設定して、再帰的なファイル検索を完全に無効にできます。これにより、プロジェクト全体の再帰的なクロールを回避するため、最も高速なオプションになります。ただし、`@` 補完を使用する際にはファイルのフルパスを入力する必要があるため、注意が必要です。

- **`coreTools`** (文字列の配列):
  - **説明:** モデルで使用可能にするコアツール名のリストを指定できます。これにより、組み込みツールのセットを制限できます。コアツールの一覧については [Built-in Tools](../core/tools-api.md#built-in-tools) を参照してください。また、`ShellTool` のように対応しているツールについては、コマンド単位での制限を指定できます。例：`"coreTools": ["ShellTool(ls -l)"]` とすると、`ls -l` コマンドのみが実行可能になります。
  - **デフォルト:** モデルで使用可能なすべてのツール。
  - **例:** `"coreTools": ["ReadFileTool", "GlobTool", "ShellTool(ls)"]`。

- **`allowedTools`** (文字列の配列):
  - **デフォルト:** `undefined`
  - **説明:** 確認ダイアログをバイパスするツール名のリストです。頻繁に使用する信頼できるツールに便利です。マッチングの仕組みは `coreTools` と同じです。
  - **例:** `"allowedTools": ["ShellTool(git status)"]`。

- **`excludeTools`** (文字列の配列):
  - **説明:** モデルから除外するコアツール名のリストを指定できます。`excludeTools` と `coreTools` の両方に記載されたツールは除外されます。また、`ShellTool` のように対応しているツールについては、コマンド単位での制限を指定できます。例：`"excludeTools": ["ShellTool(rm -rf)"]` とすると、`rm -rf` コマンドがブロックされます。
  - **デフォルト:** 除外されるツールはありません。
  - **例:** `"excludeTools": ["run_shell_command", "findFiles"]`。
  - **セキュリティに関する注意:** `run_shell_command` の `excludeTools` におけるコマンド単位の制限は、単純な文字列マッチに基づいているため、簡単にバイパス可能です。この機能は**セキュリティメカニズムではない**ため、信頼できないコードを安全に実行するために依存すべきではありません。実行可能なコマンドを明示的に選択するには、`coreTools` を使用することを推奨します。

- **`allowMCPServers`** (文字列の配列):
  - **説明:** モデルで使用可能にする MCP サーバー名のリストを指定できます。これにより、接続する MCP サーバーのセットを制限できます。`--allowed-mcp-server-names` が設定されている場合、この設定は無視されます。
  - **デフォルト:** モデルで使用可能なすべての MCP サーバー。
  - **例:** `"allowMCPServers": ["myPythonServer"]`。
  - **セキュリティに関する注意:** MCP サーバー名の単純な文字列マッチを使用しており、変更可能です。ユーザーによるバイパスを防ぎたいシステム管理者は、システム設定レベルで `mcpServers` を構成し、ユーザーが独自の MCP サーバーを設定できないようにすることを検討してください。これは堅牢なセキュリティメカニズムとしては使用しないでください。

- **`excludeMCPServers`** (文字列の配列):
  - **説明:** モデルから除外する MCP サーバー名のリストを指定できます。`excludeMCPServers` と `allowMCPServers` の両方に記載されたサーバーは除外されます。`--allowed-mcp-server-names` が設定されている場合、この設定は無視されます。
  - **デフォルト:** 除外される MCP サーバーはありません。
  - **例:** `"excludeMCPServers": ["myNodeServer"]`。
  - **セキュリティに関する注意:** MCP サーバー名の単純な文字列マッチを使用しており、変更可能です。ユーザーによるバイパスを防ぎたいシステム管理者は、システム設定レベルで `mcpServers` を構成し、ユーザーが独自の MCP サーバーを設定できないようにすることを検討してください。これは堅牢なセキュリティメカニズムとしては使用しないでください。

- **`autoAccept`** (boolean):
  - **説明:** CLI が安全と判断されるツール呼び出し（例：読み取り専用操作）を、明示的なユーザー確認なしに自動的に受け入れて実行するかどうかを制御します。`true` に設定すると、CLI は安全と判断されたツールの確認プロンプトをバイパスします。
  - **デフォルト:** `false`
  - **例:** `"autoAccept": true`

- **`theme`** (string):
  - **説明:** Qwen Code の視覚的な [テーマ](./themes.md) を設定します。
  - **デフォルト:** `"Default"`
  - **例:** `"theme": "GitHub"`

- **`vimMode`** (boolean):
  - **説明:** 入力編集用の vim モードを有効または無効にします。有効にすると、入力エリアで vim スタイルのナビゲーションと編集コマンド（NORMAL モードと INSERT モード）がサポートされます。vim モードの状態はフッターに表示され、セッション間で保持されます。
  - **デフォルト:** `false`
  - **例:** `"vimMode": true`

- **`sandbox`** (boolean または string):
  - **説明:** ツール実行時のサンドボックスの使用方法を制御します。`true` に設定すると、Qwen Code は事前にビルドされた `qwen-code-sandbox` Docker イメージを使用します。詳細については [Sandboxing](#sandboxing) を参照してください。
  - **デフォルト:** `false`
  - **例:** `"sandbox": "docker"`

- **`toolDiscoveryCommand`** (string):
  - **説明:** **Gemini CLI と連携。** プロジェクトからツールを検出するためのカスタムシェルコマンドを定義します。シェルコマンドは `stdout` に [function declarations](https://ai.google.dev/gemini-api/docs/function-calling#function-declarations) の JSON 配列を返す必要があります。ツールラッパーはオプションです。
  - **デフォルト:** 空
  - **例:** `"toolDiscoveryCommand": "bin/get_tools"`

- **`toolCallCommand`** (string):
  - **説明:** **Gemini CLI と連携。** `toolDiscoveryCommand` で検出した特定のツールを呼び出すためのカスタムシェルコマンドを定義します。シェルコマンドは以下の条件を満たす必要があります：
    - 最初のコマンドライン引数として関数 `name`（[function declaration](https://ai.google.dev/gemini-api/docs/function-calling#function-declarations) と完全一致）を受け取る必要があります。
    - `stdin` から JSON 形式の関数引数を読み取る必要があります（[`functionCall.args`](https://cloud.google.com/vertex-ai/generative-ai/docs/model-reference/inference#functioncall) と同様）。
    - `stdout` に JSON 形式の関数出力を返す必要があります（[`functionResponse.response.content`](https://cloud.google.com/vertex-ai/generative-ai/docs/model-reference/inference#functionresponse) と同様）。
  - **デフォルト:** 空
  - **例:** `"toolCallCommand": "bin/call_tool"`

- **`mcpServers`** (object):
  - **説明:** カスタムツールを検出して使用するための 1 つ以上の Model-Context Protocol (MCP) サーバーへの接続を構成します。Qwen Code は、構成された各 MCP サーバーに接続し、利用可能なツールを検出しようとします。複数の MCP サーバーが同じ名前のツールを公開している場合、競合を避けるために、構成で定義したサーバーエイリアスがツール名の前に付加されます（例：`serverAlias__actualToolName`）。システムは互換性のために MCP ツール定義から特定のスキーマプロパティを削除する場合があります。`command`、`url`、`httpUrl` のうち少なくとも 1 つを指定する必要があります。複数が指定された場合、優先順位は `httpUrl`、`url`、`command` の順になります。
  - **デフォルト:** 空
  - **プロパティ:**
    - **`<SERVER_NAME>`** (object): 指定されたサーバーのパラメータ。
      - `command` (string, optional): 標準 I/O 経由で MCP サーバーを起動するコマンド。
      - `args` (文字列の配列, optional): コマンドに渡す引数。
      - `env` (object, optional): サーバープロセスに設定する環境変数。
      - `cwd` (string, optional): サーバーを起動する作業ディレクトリ。
      - `url` (string, optional): Server-Sent Events (SSE) を使用して通信する MCP サーバーの URL。
      - `httpUrl` (string, optional): ストリーム可能な HTTP を使用して通信する MCP サーバーの URL。
      - `headers` (object, optional): `url` または `httpUrl` へのリクエストで送信する HTTP ヘッダーのマップ。
      - `timeout` (number, optional): この MCP サーバーへのリクエストのタイムアウト（ミリ秒）。
      - `trust` (boolean, optional): このサーバーを信頼し、すべてのツール呼び出し確認をバイパスします。
      - `description` (string, optional): 表示目的で使用されるサーバーの簡単な説明。
      - `includeTools` (文字列の配列, optional): この MCP サーバーから含めるツール名のリスト。指定された場合、ここにリストされたツールのみがこのサーバーから利用可能になります（ホワイトリスト動作）。指定しない場合、デフォルトではサーバーからのすべてのツールが有効になります。
      - `excludeTools` (文字列の配列, optional): この MCP サーバーから除外するツール名のリスト。ここにリストされたツールは、サーバーが公開していてもモデルでは利用できません。**注意:** `excludeTools` は `includeTools` よりも優先されます。両方のリストにツールが含まれている場合、除外されます。
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

- **`checkpointing`** (object):
  - **説明:** 会話とファイルの状態を保存および復元するチェックポイント機能を構成します。詳細については [Checkpointing documentation](../checkpointing.md) を参照してください。
  - **デフォルト:** `{"enabled": false}`
  - **プロパティ:**
    - **`enabled`** (boolean): `true` の場合、`/restore` コマンドが利用可能になります。

- **`preferredEditor`** (string):
  - **説明:** diff 表示に使用するエディタを指定します。
  - **デフォルト:** `vscode`
  - **例:** `"preferredEditor": "vscode"`

- **`telemetry`** (object)
  - **説明:** Qwen Code のログとメトリクス収集を構成します。詳細については [Telemetry](../telemetry.md) を参照してください。
  - **デフォルト:** `{"enabled": false, "target": "local", "otlpEndpoint": "http://localhost:4317", "logPrompts": true}`
  - **プロパティ:**
    - **`enabled`** (boolean): テレメトリが有効かどうか。
    - **`target`** (string): 収集されたテレメトリの送信先。サポートされる値は `local` と `gcp`。
    - **`otlpEndpoint`** (string): OTLP Exporter のエンドポイント。
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
  - **説明:** CLI インターフェースの役立つヒントを有効または無効にします。
  - **デフォルト:** `false`
  - **例:**

    ```json
    "hideTips": true
    ```

- **`hideBanner`** (boolean):
  - **説明:** CLI インターフェースの起動バナー（ASCII アートロゴ）を有効または無効にします。
  - **デフォルト:** `false`
  - **例:**

    ```json
    "hideBanner": true
    ```

- **`maxSessionTurns`** (number):
  - **説明:** セッションの最大ターン数を設定します。セッションがこの制限を超えると、CLI は処理を停止し、新しいチャットを開始します。
  - **デフォルト:** `-

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
  "skipNextSpeakerCheck": false,
  "skipLoopDetection": false,
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

## Shell 履歴

CLI は実行した shell コマンドの履歴を保持します。異なるプロジェクト間での競合を避けるため、この履歴はユーザーのホームフォルダ内のプロジェクト固有のディレクトリに保存されます。

- **場所:** `~/.qwen/tmp/<project_hash>/shell_history`
  - `<project_hash>` はプロジェクトのルートパスから生成される一意の識別子です。
  - 履歴は `shell_history` という名前のファイルに保存されます。

```markdown
## 環境変数と `.env` ファイル

環境変数は、アプリケーションを設定する一般的な方法であり、特にAPIキーのような機密情報や、環境によって変わる可能性のある設定に使われます。認証のセットアップについては、利用可能なすべての認証方法を網羅した[認証ドキュメント](./authentication.md)を参照してください。

CLIは自動的に `.env` ファイルから環境変数を読み込みます。読み込み順序は以下の通りです：

1. カレントディレクトリにある `.env` ファイル。
2. 見つからない場合、親ディレクトリを上に向かって探索し、`.env` ファイルが見つかるか、プロジェクトルート（`.git` フォルダで識別）またはホームディレクトリに到達するまで続けます。
3. それでも見つからない場合は、`~/.env`（ユーザーのホームディレクトリ内）を探します。

**環境変数の除外：** 一部の環境変数（例：`DEBUG` や `DEBUG_MODE`）は、CLIの動作への干渉を防ぐため、デフォルトではプロジェクトの `.env` ファイルからは自動的に除外されます。`.qwen/.env` ファイルからの変数は一切除外されません。この動作は、`settings.json` ファイル内の `excludedProjectEnvVars` 設定を使ってカスタマイズできます。

- **`OPENAI_API_KEY`**：
  - 利用可能な複数の[認証方法](./authentication.md)の一つ。
  - シェルプロファイル（例：`~/.bashrc`、`~/.zshrc`）または `.env` ファイルで設定してください。
- **`OPENAI_BASE_URL`**：
  - 利用可能な複数の[認証方法](./authentication.md)の一つ。
  - シェルプロファイル（例：`~/.bashrc`、`~/.zshrc`）または `.env` ファイルで設定してください。
- **`OPENAI_MODEL`**：
  - 使用するデフォルトの OPENAI モデルを指定します。
  - ハードコードされたデフォルト値を上書きします。
  - 例：`export OPENAI_MODEL="qwen3-coder-plus"`
- **`GEMINI_SANDBOX`**：
  - `settings.json` の `sandbox` 設定の代替手段。
  - `true`、`false`、`docker`、`podman`、またはカスタムコマンド文字列を受け取ります。
- **`SEATBELT_PROFILE`**（macOS専用）：
  - macOS 上で Seatbelt（`sandbox-exec`）プロファイルを切り替えます。
  - `permissive-open`：（デフォルト）プロジェクトフォルダ（およびその他のいくつかのフォルダ。詳細は `packages/cli/src/utils/sandbox-macos-permissive-open.sb` を参照）への書き込みを制限しますが、それ以外の操作は許可されます。
  - `strict`：デフォルトで操作を拒否する厳格なプロファイルを使用します。
  - `<profile_name>`：カスタムプロファイルを使用します。カスタムプロファイルを定義するには、プロジェクトの `.qwen/` ディレクトリに `sandbox-macos-<profile_name>.sb` という名前のファイルを作成してください（例：`my-project/.qwen/sandbox-macos-custom.sb`）。
- **`DEBUG` または `DEBUG_MODE`**（多くの場合、下位ライブラリやCLI自体で使用）：
  - `true` または `1` に設定すると、詳細なデバッグログを有効にし、トラブルシューティングに役立ちます。
  - **注意：** これらの変数は、CLIの動作への干渉を防ぐため、デフォルトではプロジェクトの `.env` ファイルからは自動的に除外されます。Qwen Code 専用にこれらを設定する必要がある場合は、`.qwen/.env` ファイルを使用してください。
- **`NO_COLOR`**：
  - 任意の値を設定することで、CLIでのすべてのカラー出力を無効にします。
- **`CLI_TITLE`**：
  - 文字列を設定して、CLIのタイトルをカスタマイズします。
- **`CODE_ASSIST_ENDPOINT`**：
  - コードアシストサーバーのエンドポイントを指定します。
  - 開発やテスト時に便利です。
- **`TAVILY_API_KEY`**：
  - Tavilyウェブ検索サービスのAPIキー。
  - `web_search` ツール機能を有効にするために必須です。
  - 設定されていない場合、ウェブ検索ツールは無効化されスキップされます。
  - 例：`export TAVILY_API_KEY="tvly-your-api-key-here"`
```

## コマンドライン引数

CLI 実行時に直接渡す引数により、そのセッションにおける他の設定を上書きできます。

- **`--model <model_name>`** (**`-m <model_name>`**):
  - このセッションで使用する Qwen モデルを指定します。
  - 例: `npm start -- --model qwen3-coder-plus`
- **`--prompt <your_prompt>`** (**`-p <your_prompt>`**):
  - プロンプトを直接コマンドに渡すために使用します。これにより、Qwen Code が非インタラクティブモードで起動します。
- **`--prompt-interactive <your_prompt>`** (**`-i <your_prompt>`**):
  - 指定されたプロンプトを初期入力としてインタラクティブセッションを開始します。
  - プロンプトはセッション開始前に処理されるのではなく、セッション内で処理されます。
  - stdin からのパイプ入力時には使用できません。
  - 例: `qwen -i "explain this code"`
- **`--sandbox`** (**`-s`**):
  - このセッションでサンドボックスモードを有効にします。
- **`--sandbox-image`**:
  - サンドボックスイメージの URI を設定します。
- **`--debug`** (**`-d`**):
  - このセッションでデバッグモードを有効にし、より詳細な出力を提供します。
- **`--all-files`** (**`-a`**):
  - 設定すると、現在のディレクトリ内のすべてのファイルを再帰的にプロンプトのコンテキストに含めます。
- **`--help`** (または **`-h`**):
  - コマンドライン引数に関するヘルプ情報を表示します。
- **`--show-memory-usage`**:
  - 現在のメモリ使用量を表示します。
- **`--yolo`**:
  - YOLO モードを有効にし、すべてのツール呼び出しを自動的に承認します。
- **`--approval-mode <mode>`**:
  - ツール呼び出しの承認モードを設定します。サポートされるモード:
    - `plan`: 分析のみ—ファイルの変更やコマンドの実行は行いません。
    - `default`: ファイル編集やシェルコマンド実行には承認が必要（デフォルトの動作）。
    - `auto-edit`: 編集系ツール（edit、write_file）は自動承認し、それ以外は確認を求めます。
    - `yolo`: すべてのツール呼び出しを自動承認（`--yolo` と同等）。
  - `--yolo` と同時に使用することはできません。新しい統一アプローチでは、`--yolo` の代わりに `--approval-mode=yolo` を使用してください。
  - 例: `qwen --approval-mode auto-edit`
- **`--allowed-tools <tool1,tool2,...>`**:
  - 確認ダイアログをスキップするツール名のカンマ区切りリスト。
  - 例: `qwen --allowed-tools "ShellTool(git status)"`
- **`--telemetry`**:
  - [telemetry](../telemetry.md) を有効にします。
- **`--telemetry-target`**:
  - テレメトリーターゲットを設定します。詳細は [telemetry](../telemetry.md) を参照してください。
- **`--telemetry-otlp-endpoint`**:
  - テレメトリー用の OTLP エンドポイントを設定します。詳細は [telemetry](../telemetry.md) を参照してください。
- **`--telemetry-otlp-protocol`**:
  - テレメトリー用の OTLP プロトコルを設定します（`grpc` または `http`）。デフォルトは `grpc` です。詳細は [telemetry](../telemetry.md) を参照してください。
- **`--telemetry-log-prompts`**:
  - テレメトリー用にプロンプトのログを有効にします。詳細は [telemetry](../telemetry.md) を参照してください。
- **`--checkpointing`**:
  - [checkpointing](../checkpointing.md) を有効にします。
- **`--extensions <extension_name ...>`** (**`-e <extension_name ...>`**):
  - セッションで使用する拡張機能のリストを指定します。指定しない場合、利用可能なすべての拡張機能が使用されます。
  - 特殊なキーワード `qwen -e none` を使用して、すべての拡張機能を無効にできます。
  - 例: `qwen -e my-extension -e my-other-extension`
- **`--list-extensions`** (**`-l`**):
  - 利用可能なすべての拡張機能をリスト表示して終了します。
- **`--proxy`**:
  - CLI 用のプロキシを設定します。
  - 例: `--proxy http://localhost:7890`
- **`--include-directories <dir1,dir2,...>`**:
  - マルチディレクトリ対応のためにワークスペースに追加のディレクトリを含めます。
  - 複数回指定するか、カンマ区切りで指定できます。
  - 最大5つのディレクトリを追加できます。
  - 例: `--include-directories /path/to/project1,/path/to/project2` または `--include-directories /path/to/project1 --include-directories /path/to/project2`
- **`--screen-reader`**:
  - アクセシビリティのためのスクリーンリーダーモードを有効にします。
- **`--version`**:
  - CLI のバージョンを表示します。
- **`--openai-logging`**:
  - デバッグおよび分析のために OpenAI API 呼び出しのログを有効にします。このフラグは `settings.json` の `enableOpenAILogging` 設定よりも優先されます。
- **`--tavily-api-key <api_key>`**:
  - このセッションでウェブ検索機能に使用する Tavily API キーを設定します。
  - 例: `qwen --tavily-api-key tvly-your-api-key-here`

## コンテキストファイル（階層型指示コンテキスト）

CLI の**動作**設定というわけではありませんが、コンテキストファイル（デフォルトでは `QWEN.md`、`contextFileName` 設定で変更可能）は、**指示コンテキスト**（「メモリ」とも呼ばれます）の設定に不可欠です。この強力な機能により、プロジェクト固有の指示、コーディングスタイルガイド、その他の関連する背景情報を AI に提供でき、あなたのニーズにより適した正確な応答を得ることができます。CLI には、現在アクティブなコンテキストファイルの数をフッターに表示する UI 要素などがあり、使用中のコンテキスト状態を常に確認できます。

- **目的：** これらの Markdown ファイルには、Qwen モデルとのやり取り中に参照してほしい指示、ガイドライン、またはコンテキスト情報を記述します。システムは、この指示コンテキストを階層的に管理するように設計されています。

### コンテキストファイルの例（例：`QWEN.md`）

以下は、TypeScriptプロジェクトのルートにあるコンテキストファイルが含むかもしれない内容の概念的な例です：

```markdown

# Project: My Awesome TypeScript Library

## 一般的な指示:

- 新しいTypeScriptコードを生成する際は、既存のコーディングスタイルに従ってください。
- 新しい関数やクラスには、必ずJSDocコメントを付与してください。
- 適切な場所では、関数型プログラミングのパラダイムを優先してください。
- すべてのコードは、TypeScript 5.0およびNode.js 20+との互換性を保つ必要があります。

## コーディングスタイル:

- インデントにはスペース2つを使用してください。
- インターフェース名には`I`を接頭辞として付けてください（例：`IUserService`）。
- privateなクラスメンバには、アンダースコア（`_`）を接頭辞として付けてください。
- 常に厳密等価演算子（`===`および`!==`）を使用してください。

## 特定のコンポーネント: `src/api/client.ts`

- このファイルは、すべての外部APIリクエストを処理します。
- 新しいAPI呼び出し関数を追加する際は、堅牢なエラーハンドリングとロギングを含めるようにしてください。
- すべてのGETリクエストには、既存の`fetchWithRetry`ユーティリティを使用してください。

```markdown
## 依存関係について:

- 新しい外部依存関係の導入は、どうしても必要な場合を除き避けてください。
- 新しい依存関係が必要な場合は、その理由を明記してください。

この例では、プロジェクト全体のコンテキスト情報や特定のコーディング規約、特定ファイルやコンポーネントに関する注意書きなどをどのように提供できるかを示しています。コンテキストファイルがどれだけ関連性があり、正確であるかによって、AIがあなたをどの程度効果的に支援できるかが決まります。プロジェクト固有のコンテキストファイルを作成し、積極的に活用することを強く推奨します。

- **階層的な読み込みと優先順位:** CLIは、複数の場所からコンテキストファイル（例：`QWEN.md`）を読み込むことで、洗練された階層型メモリシステムを実装しています。このリストで下位（より具体的な）に位置するファイルの内容は、通常、上位（より一般的な）ファイルの内容をオーバーライドまたは補完します。結合順序および最終的なコンテキストは、`/memory show` コマンドを使用して確認できます。典型的な読み込み順序は以下の通りです：
  1.  **グローバル・コンテキストファイル:**
      - 場所: `~/.qwen/<contextFileName>` （例：ユーザーのホームディレクトリにある `~/.qwen/QWEN.md`）
      - 範囲: 全てのプロジェクトに対してデフォルトの指示を提供します。
  2.  **プロジェクトルートおよび祖先ディレクトリのコンテキストファイル:**
      - 場所: CLIは現在の作業ディレクトリから開始し、各親ディレクトリを探索して設定されたコンテキストファイルを探します。探索は、`.git` フォルダで識別されるプロジェクトルートか、ホームディレクトリまで続きます。
      - 範囲: プロジェクト全体またはその主要部分に関連するコンテキスト情報を提供します。
  3.  **サブディレクトリのコンテキストファイル（コンテキスト依存／ローカル）:**
      - 場所: CLIは、現在の作業ディレクトリ以下のサブディレクトリにも設定されたコンテキストファイルがないかスキャンします（`node_modules` や `.git` などの一般的な無視パターンは尊重されます）。この検索範囲はデフォルトで最大200ディレクトリに制限されていますが、`settings.json` ファイル内の `memoryDiscoveryMaxDirs` フィールドで変更可能です。
      - 範囲: 特定のコンポーネント、モジュール、またはプロジェクトの一部に対する非常に詳細な指示を可能にします。
- **連結とUI表示:** 見つかったすべてのコンテキストファイルの内容は、それぞれの出典とパスを示す区切り文字とともに連結され、システムプロンプトの一部として提供されます。CLIのフッターには読み込まれたコンテキストファイル数が表示され、アクティブな指示コンテキストを視覚的に把握できます。
- **コンテンツのインポート:** `@path/to/file.md` 構文を使って他のMarkdownファイルをインポートすることで、コンテキストファイルをモジュール化できます。詳しくは[Memory Import Processor のドキュメント](../core/memport.md)をご参照ください。
- **メモリ管理コマンド:**
  - `/memory refresh` を使用すると、すべての設定済み場所からコンテキストファイルを強制的に再スキャン・再読み込みできます。これにより、AIへの指示コンテキストが更新されます。
  - `/memory show` を使用すると、現在読み込まれている統合された指示コンテキストを表示でき、AIが使用している階層構造と内容を確認できます。
  - `/memory` コマンドおよびそのサブコマンド（`show` および `refresh`）の詳細については、[Commands documentation](./commands.md#memory) をご参照ください。

これらの設定レイヤーとコンテキストファイルの階層的性質を理解し活用することで、AIのメモリを効果的に管理し、Qwen Codeの応答をあなたの特定のニーズやプロジェクトに合わせて調整することが可能になります。
```

## Sandboxing

Qwen Code は、システムを保護するために、サンドボックス環境内で潜在的に危険な操作（シェルコマンドやファイルの変更など）を実行できます。

サンドボックス機能はデフォルトでは無効になっていますが、以下の方法で有効にできます：

- `--sandbox` または `-s` フラグを使用する
- `GEMINI_SANDBOX` 環境変数を設定する
- `--yolo` または `--approval-mode=yolo` を使用する場合、デフォルトでサンドボックスが有効になります

デフォルトでは、事前にビルドされた `qwen-code-sandbox` Docker イメージが使用されます。

プロジェクト固有のサンドボックス要件がある場合は、プロジェクトのルートディレクトリに `.qwen/sandbox.Dockerfile` というカスタム Dockerfile を作成できます。この Dockerfile はベースとなるサンドボックスイメージを元に作成できます：

```dockerfile
FROM qwen-code-sandbox

# ここにカスタムの依存関係や設定を追加してください

# 例：

# RUN apt-get update && apt-get install -y some-package
```

# COPY ./my-config /app/my-config
```

`.qwen/sandbox.Dockerfile` が存在する場合、Qwen Code を実行する際に `BUILD_SANDBOX` 環境変数を使用して、カスタム sandbox イメージを自動ビルドできます：

```bash
BUILD_SANDBOX=1 qwen -s
```

## 使用統計情報

Qwen Code の改善のため、匿名化された使用統計情報を収集しています。このデータは、CLI の利用状況の把握、一般的な問題の特定、新機能の優先順位付けに役立てています。

**収集する情報:**

- **ツール呼び出し:** 呼び出されたツールの名前、成功または失敗の結果、実行にかかった時間などを記録します。ツールに渡された引数や、ツールから返されたデータは収集しません。
- **API リクエスト:** 各リクエストで使用されたモデル、リクエストの所要時間、成功したかどうかを記録します。プロンプトやレスポンスの内容は収集しません。
- **セッション情報:** 有効化されているツールや承認モードなど、CLI の設定に関する情報を収集します。

**収集しない情報:**

- **個人を特定できる情報 (PII):** 氏名、メールアドレス、API キーなど、個人を特定できる情報は一切収集しません。
- **プロンプトおよびレスポンスの内容:** ユーザーが入力したプロンプトや、モデルからのレスポンスの内容は記録しません。
- **ファイルの内容:** CLI が読み書きしたファイルの内容は記録しません。

**収集をオプトアウトする方法:**

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