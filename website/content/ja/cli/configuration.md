# Qwen Code 設定

**新しい設定形式についての注意**

`settings.json` ファイルの形式が、より整理された新しい構造に更新されました。古い形式は自動的に移行されます。

以前の形式の詳細については、[v1 設定ドキュメント](./configuration-v1.md)を参照してください。

Qwen Code は、動作を設定するためのいくつかの方法を提供します。これには、環境変数、コマンドライン引数、および設定ファイルが含まれます。このドキュメントでは、さまざまな設定方法と利用可能な設定項目について説明します。

## 設定レイヤー

設定は以下の優先順位に従って適用されます（数字が小さいほど低優先度で、大きいほど高優先度）:

1.  **デフォルト値:** アプリケーション内にハードコードされたデフォルト値。
2.  **システムデフォルトファイル:** 他の設定ファイルで上書き可能な、システム全体のデフォルト設定。
3.  **ユーザ設定ファイル:** 現在のユーザー向けのグローバル設定。
4.  **プロジェクト設定ファイル:** プロジェクト固有の設定。
5.  **システム設定ファイル:** すべての他の設定ファイルを上書きする、システム全体の設定。
6.  **環境変数:** システム全体またはセッション固有の変数。`.env` ファイルから読み込まれる可能性があります。
7.  **コマンドライン引数:** CLI 起動時に渡される値。

## 設定ファイル

Qwen Code は永続的な設定のために JSON 形式の設定ファイルを使用します。これらのファイルは以下の4つの場所に配置できます：

- **システムデフォルトファイル：**
  - **場所：** `/etc/qwen-code/system-defaults.json`（Linux）、`C:\ProgramData\qwen-code\system-defaults.json`（Windows）または `/Library/Application Support/QwenCode/system-defaults.json`（macOS）。このパスは環境変数 `QWEN_CODE_SYSTEM_DEFAULTS_PATH` を使用して上書き可能です。
  - **スコープ：** システム全体での基本的なデフォルト設定を提供します。これらの設定は最も低い優先度を持ち、ユーザー設定やプロジェクト設定、システムオーバーライド設定によって上書きされることを想定しています。

- **ユーザーセッティングファイル：**
  - **場所：** `~/.qwen/settings.json`（ここで `~` はホームディレクトリです）。
  - **スコープ：** 現在のユーザーに対するすべての Qwen Code セッションに適用されます。

- **プロジェクトセッティングファイル：**
  - **場所：** プロジェクトのルートディレクトリ内の `.qwen/settings.json`。
  - **スコープ：** 特定のプロジェクトから Qwen Code を実行するときのみ適用されます。プロジェクト設定はユーザーセッティングを上書きします。

- **システムセッティングファイル：**
  - **場所：** `/etc/qwen-code/settings.json`（Linux）、`C:\ProgramData\qwen-code\settings.json`（Windows）または `/Library/Application Support/QwenCode/settings.json`（macOS）。このパスは環境変数 `QWEN_CODE_SYSTEM_SETTINGS_PATH` を使用して上書き可能です。
  - **スコープ：** システム上のすべてのユーザーに対して、すべての Qwen Code セッションに適用されます。システム設定はユーザーおよびプロジェクト設定よりも優先されます。エンタープライズ環境でシステム管理者がユーザーの Qwen Code のセットアップを制御したい場合に便利です。

**設定における環境変数についての注意点：** `settings.json` ファイル内の文字列値では、`$VAR_NAME` または `${VAR_NAME}` 構文を使って環境変数を参照できます。これらの変数は設定読み込み時に自動的に解決されます。例えば、環境変数 `MY_API_TOKEN` がある場合、次のように `settings.json` 内で使用できます：
```json
"apiKey": "$MY_API_TOKEN"
```

### プロジェクト内の `.qwen` ディレクトリ

プロジェクト設定ファイルに加えて、プロジェクトの `.qwen` ディレクトリには Qwen Code の動作に関連するその他のプロジェクト固有のファイルを含めることができます。例えば：

- [カスタムサンドボックスプロファイル](#sandboxing)（例：`.qwen/sandbox-macos-custom.sb`、`.qwen/sandbox.Dockerfile`）。

### `settings.json` で利用可能な設定

設定はカテゴリ別に整理されています。すべての設定は、`settings.json` ファイル内で対応するトップレベルのカテゴリオブジェクト内に配置してください。

#### `general`

- **`general.preferredEditor`** (string):
  - **説明:** ファイルを開く際に使用するエディタを指定します。
  - **デフォルト:** `undefined`

- **`general.vimMode`** (boolean):
  - **説明:** Vimのキーバインドを有効にします。
  - **デフォルト:** `false`

- **`general.disableAutoUpdate`** (boolean):
  - **説明:** 自動更新を無効にします。
  - **デフォルト:** `false`

- **`general.disableUpdateNag`** (boolean):
  - **説明:** 更新通知のプロンプトを無効にします。
  - **デフォルト:** `false`

- **`general.checkpointing.enabled`** (boolean):
  - **説明:** セッションのチェックポイント機能を有効にして、復旧できるようにします。
  - **デフォルト:** `false`

#### `output`

- **`output.format`** (string):
  - **説明:** CLI出力の形式を指定します。
  - **デフォルト:** `"text"`
  - **選択可能値:** `"text"`, `"json"`

#### `ui`

- **`ui.theme`** (string):
  - **説明:** UI のカラーテーマ。利用可能なオプションについては [Themes](./themes.md) を参照してください。
  - **デフォルト:** `undefined`

- **`ui.customThemes`** (object):
  - **説明:** カスタムテーマの定義。
  - **デフォルト:** `{}`

- **`ui.hideWindowTitle`** (boolean):
  - **説明:** ウィンドウのタイトルバーを非表示にする。
  - **デフォルト:** `false`

- **`ui.hideTips`** (boolean):
  - **説明:** UI 内の役立つヒントを非表示にする。
  - **デフォルト:** `false`

- **`ui.hideBanner`** (boolean):
  - **説明:** アプリケーションのバナーを非表示にする。
  - **デフォルト:** `false`

- **`ui.hideFooter`** (boolean):
  - **説明:** UI からフッターを非表示にする。
  - **デフォルト:** `false`

- **`ui.showMemoryUsage`** (boolean):
  - **説明:** UI にメモリ使用量情報を表示する。
  - **デフォルト:** `false`

- **`ui.showLineNumbers`** (boolean):
  - **説明:** チャットに行番号を表示する。
  - **デフォルト:** `false`

- **`ui.showCitations`** (boolean):
  - **説明:** チャットで生成されたテキストの引用を表示する。
  - **デフォルト:** `true`

- **`enableWelcomeBack`** (boolean):
  - **説明:** 会話履歴があるプロジェクトに戻ってきたときに「Welcome back」ダイアログを表示する。
  - **デフォルト:** `true`

- **`ui.accessibility.disableLoadingPhrases`** (boolean):
  - **説明:** アクセシビリティのためにロード中のフレーズを無効化する。
  - **デフォルト:** `false`

- **`ui.customWittyPhrases`** (array of strings):
  - **説明:** ロード中に表示するカスタムフレーズのリスト。指定された場合、CLI はデフォルトのフレーズの代わりにこれらのフレーズを順番に表示します。
  - **デフォルト:** `[]`

#### `ide`

- **`ide.enabled`** (boolean):
  - **説明:** IDE連携モードを有効にします。
  - **デフォルト:** `false`

- **`ide.hasSeenNudge`** (boolean):
  - **説明:** ユーザーがIDE連携の案内を表示したかどうか。
  - **デフォルト:** `false`

#### `privacy`

- **`privacy.usageStatisticsEnabled`** (boolean):
  - **説明:** 使用統計情報の収集を有効にします。
  - **デフォルト:** `true`

#### `model`

- **`model.name`** (string):
  - **説明:** 会話で使用する Qwen モデル。
  - **デフォルト:** `undefined`

- **`model.maxSessionTurns`** (number):
  - **説明:** セッション内に保持するユーザー/モデル/ツールの最大ターン数。-1 は無制限を意味します。
  - **デフォルト:** `-1`

- **`model.summarizeToolOutput`** (object):
  - **説明:** ツール出力の要約機能を有効または無効にします。`tokenBudget` 設定を使用して、要約に使用するトークン予算を指定できます。注：現在サポートされているのは `run_shell_command` ツールのみです。例：`{"run_shell_command": {"tokenBudget": 2000}}`
  - **デフォルト:** `undefined`

- **`model.chatCompression.contextPercentageThreshold`** (number):
  - **説明:** モデルの総トークン上限に対するチャット履歴圧縮のしきい値をパーセンテージで設定します。これは 0 から 1 の間の値であり、自動圧縮と手動の `/compress` コマンドの両方に適用されます。例えば、`0.6` を設定すると、チャット履歴がトークン上限の 60% を超えたときに圧縮が開始されます。
  - **デフォルト:** `0.7`

- **`model.skipNextSpeakerCheck`** (boolean):
  - **説明:** 次の発話者チェックをスキップします。
  - **デフォルト:** `false`

- **`model.skipLoopDetection`**(boolean):
  - **説明:** ループ検出チェックを無効にします。ループ検出は AI 応答内の無限ループを防ぐための機能ですが、誤検知により正当なワークフローが中断されることがあります。頻繁に誤検知による中断が発生する場合はこのオプションを有効にしてください。
  - **デフォルト:** `false`

#### `context`

- **`context.fileName`** (string または string の配列):
  - **説明:** コンテキストファイルの名前。
  - **デフォルト:** `undefined`

- **`context.importFormat`** (string):
  - **説明:** メモリをインポートする際に使用するフォーマット。
  - **デフォルト:** `undefined`

- **`context.discoveryMaxDirs`** (number):
  - **説明:** メモリ検索時に探索するディレクトリの最大数。
  - **デフォルト:** `200`

- **`context.includeDirectories`** (array):
  - **説明:** ワークスペースのコンテキストに含める追加ディレクトリ。存在しないディレクトリは警告とともにスキップされる。
  - **デフォルト:** `[]`

- **`context.loadFromIncludeDirectories`** (boolean):
  - **説明:** `/memory refresh` コマンドの動作を制御する。`true` に設定すると、追加されたすべてのディレクトリから `QWEN.md` ファイルを読み込む。`false` に設定すると、カレントディレクトリからのみ `QWEN.md` を読み込む。
  - **デフォルト:** `false`

- **`context.fileFiltering.respectGitIgnore`** (boolean):
  - **説明:** 検索時に .gitignore ファイルを尊重するかどうか。
  - **デフォルト:** `true`

- **`context.fileFiltering.respectQwenIgnore`** (boolean):
  - **説明:** 検索時に .qwenignore ファイルを尊重するかどうか。
  - **デフォルト:** `true`

- **`context.fileFiltering.enableRecursiveFileSearch`** (boolean):
  - **説明:** プロンプトで `@` プレフィックスを補完する際に、現在のツリー以下のファイル名を再帰的に検索するかどうか。
  - **デフォルト:** `true`

#### `tools`

- **`tools.sandbox`** (boolean または string):
  - **説明:** サンドボックス実行環境（boolean またはパス文字列を指定可能）。
  - **デフォルト:** `undefined`

- **`tools.shell.enableInteractiveShell`** (boolean):

  インタラクティブなシェル体験を提供するために `node-pty` を使用します。フォールバックとして `child_process` が引き続き使用されます。デフォルトは `false`。

- **`tools.core`** (string の配列):
  - **説明:** 組み込みツールのセットを制限するために使用できます（[allowlist による制限](./enterprise.md#restricting-tool-access)）。コアツールの一覧については [Built-in Tools](../core/tools-api.md#built-in-tools) を参照してください。マッチングの仕様は `tools.allowed` と同じです。
  - **デフォルト:** `undefined`

- **`tools.exclude`** (string の配列):
  - **説明:** 検出から除外するツール名。
  - **デフォルト:** `undefined`

- **`tools.allowed`** (string の配列):
  - **説明:** 確認ダイアログをスキップするツール名のリスト。信頼できる、かつ頻繁に使用するツールに対して有効です。例えば、`["run_shell_command(git)", "run_shell_command(npm test)"]` と指定すると、任意の `git` コマンドや `npm test` コマンドの実行時に確認ダイアログが表示されません。プレフィックスマッチ、コマンドチェーンなどの詳細については [Shell Tool command restrictions](../tools/shell.md#command-restrictions) を参照してください。
  - **デフォルト:** `undefined`

- **`tools.approvalMode`** (string):
  - **説明:** ツール使用時のデフォルト承認モードを設定します。指定可能な値は以下の通りです：
    - `plan`: 分析のみで、ファイルの変更やコマンドの実行は行いません。
    - `default`: ファイル編集やシェルコマンド実行前に承認を要求します。
    - `auto-edit`: ファイル編集を自動的に承認します。
    - `yolo`: 全てのツール呼び出しを自動的に承認します。
  - **デフォルト:** `default`

- **`tools.discoveryCommand`** (string):
  - **説明:** ツール検出のために実行するコマンド。
  - **デフォルト:** `undefined`

- **`tools.callCommand`** (string):
  - **説明:** `tools.discoveryCommand` で検出した特定のツールを呼び出すためのカスタムシェルコマンドを定義します。シェルコマンドは以下の条件を満たす必要があります：
    - 最初のコマンドライン引数として関数の `name`（[function declaration](https://ai.google.dev/gemini-api/docs/function-calling#function-declarations) と完全に一致する形式）を受け取ること。
    - 関数の引数を `stdin` から JSON 形式で読み取ること（[`functionCall.args`](https://cloud.google.com/vertex-ai/generative-ai/docs/model-reference/inference#functioncall) と同様）。
    - 関数の出力を `stdout` に JSON 形式で返すこと（[`functionResponse.response.content`](https://cloud.google.com/vertex-ai/generative-ai/docs/model-reference/inference#functionresponse) と同様）。
  - **デフォルト:** `undefined`

#### `mcp`

- **`mcp.serverCommand`** (string):
  - **説明:** MCP サーバーを起動するコマンド。
  - **デフォルト:** `undefined`

- **`mcp.allowed`** (string の配列):
  - **説明:** 許可する MCP サーバーの許可リスト。
  - **デフォルト:** `undefined`

- **`mcp.excluded`** (string の配列):
  - **説明:** 除外する MCP サーバーの拒否リスト。
  - **デフォルト:** `undefined`

#### `security`

- **`security.folderTrust.enabled`** (boolean):
  - **説明:** Folder Trust が有効かどうかを追跡する設定。
  - **デフォルト:** `false`

- **`security.auth.selectedType`** (string):
  - **説明:** 現在選択されている認証タイプ。
  - **デフォルト:** `undefined`

- **`security.auth.enforcedType`** (string):
  - **説明:** 必須の認証タイプ（エンタープライズ向けに有用）。
  - **デフォルト:** `undefined`

- **`security.auth.useExternal`** (boolean):
  - **説明:** 外部認証フローを使用するかどうか。
  - **デフォルト:** `undefined`

#### `advanced`

- **`advanced.autoConfigureMemory`** (boolean):
  - **説明:** Node.js のメモリ制限を自動的に設定します。
  - **デフォルト:** `false`

- **`advanced.dnsResolutionOrder`** (string):
  - **説明:** DNS 解決の順序を指定します。
  - **デフォルト:** `undefined`

- **`advanced.excludedEnvVars`** (string の配列):
  - **説明:** プロジェクトコンテキストから除外する環境変数。
  - **デフォルト:** `["DEBUG","DEBUG_MODE"]`

- **`advanced.bugCommand`** (object):
  - **説明:** バグレポートコマンドの設定。
  - **デフォルト:** `undefined`

- **`advanced.tavilyApiKey`** (string):
  - **説明:** Tavily ウェブ検索サービス用の API key。`web_search` ツール機能を有効にするために必要です。設定されていない場合、ウェブ検索ツールは無効化されスキップされます。
  - **デフォルト:** `undefined`

#### `mcpServers`

カスタムツールを検出・利用するための、1つ以上の Model-Context Protocol (MCP) サーバーへの接続を設定します。Qwen Code は各 MCP サーバーに接続を試行し、利用可能なツールを探索します。複数の MCP サーバーで同じ名前のツールが公開されている場合、競合を避けるために、設定で定義したサーバーエイリアスがツール名のプレフィックスとして付加されます（例: `serverAlias__actualToolName`）。システムは互換性のために、MCP ツール定義から特定のスキーマプロパティを削除することがあります。`command`、`url`、`httpUrl` のうち少なくとも1つが指定されている必要があります。複数が指定された場合は、優先順位が `httpUrl` > `url` > `command` となります。

- **`mcpServers.<SERVER_NAME>`** (object): 名前付きサーバーのパラメータ。
  - `command` (string, optional): 標準I/O経由でMCPサーバーを起動するコマンド。
  - `args` (array of strings, optional): コマンドに渡す引数。
  - `env` (object, optional): サーバープロセスに設定する環境変数。
  - `cwd` (string, optional): サーバーを起動する作業ディレクトリ。
  - `url` (string, optional): Server-Sent Events (SSE) を使用して通信する MCP サーバーの URL。
  - `httpUrl` (string, optional): ストリーム可能な HTTP を使用して通信する MCP サーバーの URL。
  - `headers` (object, optional): `url` または `httpUrl` へのリクエスト時に送信する HTTP ヘッダーのマップ。
  - `timeout` (number, optional): この MCP サーバーへのリクエストのタイムアウト（ミリ秒）。
  - `trust` (boolean, optional): このサーバーを信頼し、すべてのツール呼び出し確認をバイパスします。
  - `description` (string, optional): 表示目的などで使用されるサーバーの簡単な説明。
  - `includeTools` (array of strings, optional): この MCP サーバーから含めるツール名のリスト。指定された場合、ここにリストされたツールのみがこのサーバーから利用可能になります（allowlist の動作）。指定がない場合、デフォルトですべてのツールが有効になります。
  - `excludeTools` (array of strings, optional): この MCP サーバーから除外するツール名のリスト。ここにリストされたツールは、サーバーによって公開されていてもモデルからは利用できなくなります。**注意:** `excludeTools` は `includeTools` よりも優先されます。両方のリストに同じツールが含まれている場合、そのツールは除外されます。

#### `telemetry`

Qwen Code のロギングとメトリクス収集を設定します。詳細については、[Telemetry](../telemetry.md) を参照してください。

- **Properties:**
  - **`enabled`** (boolean): telemetry を有効にするかどうか。
  - **`target`** (string): 収集された telemetry の送信先。サポートされている値は `local` と `gcp`。
  - **`otlpEndpoint`** (string): OTLP Exporter のエンドポイント。
  - **`otlpProtocol`** (string): OTLP Exporter で使用するプロトコル（`grpc` または `http`）。
  - **`logPrompts`** (boolean): ユーザーのプロンプト内容をログに含めるかどうか。
  - **`outfile`** (string): `target` が `local` の場合に telemetry を書き込むファイル。
  - **`useCollector`** (boolean): 外部の OTLP コレクターを使用するかどうか。

### `settings.json` の例

以下は、v0.3.0 から新たに導入されたネスト構造を持つ `settings.json` ファイルの例です：

```json
{
  "general": {
    "vimMode": true,
    "preferredEditor": "code"
  },
  "ui": {
    "theme": "GitHub",
    "hideBanner": true,
    "hideTips": false,
    "customWittyPhrases": [
      "You forget a thousand things every day. Make sure this is one of ’em",
      "Connecting to AGI"
    ]
  },
  "tools": {
    "approvalMode": "yolo",
    "sandbox": "docker",
    "discoveryCommand": "bin/get_tools",
    "callCommand": "bin/call_tool",
    "exclude": ["write_file"]
  },
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
  "privacy": {
    "usageStatisticsEnabled": true
  },
  "model": {
    "name": "qwen3-coder-plus",
    "maxSessionTurns": 10,
    "summarizeToolOutput": {
      "run_shell_command": {
        "tokenBudget": 100
      }
    }
  },
  "context": {
    "fileName": ["CONTEXT.md", "QWEN.md"],
    "includeDirectories": ["path/to/dir1", "~/path/to/dir2", "../path/to/dir3"],
    "loadFromIncludeDirectories": true,
    "fileFiltering": {
      "respectGitIgnore": false
    }
  },
  "advanced": {
    "excludedEnvVars": ["DEBUG", "DEBUG_MODE", "NODE_ENV"]
  }
}
```

## Shell 履歴

CLI は実行した shell コマンドの履歴を保持します。異なるプロジェクト間での競合を避けるため、この履歴はユーザーのホームフォルダ内のプロジェクト固有のディレクトリに保存されます。

- **場所:** `~/.qwen/tmp/<project_hash>/shell_history`
  - `<project_hash>` はプロジェクトのルートパスから生成された一意の識別子です。
  - 履歴は `shell_history` という名前のファイルに保存されます。

```markdown
## 環境変数と `.env` ファイル

環境変数は、アプリケーションを設定する一般的な方法です。特に API キーのような機密情報や、環境によって変わる設定に使われます。認証の設定については、[認証ドキュメント](./authentication.md) を参照してください。利用可能なすべての認証方法が記載されています。

CLI は `.env` ファイルから自動的に環境変数を読み込みます。読み込み順序は以下の通りです：

1. 現在の作業ディレクトリにある `.env` ファイル。
2. 見つからない場合、親ディレクトリを上に向かって探索し、`.env` ファイルが見つかるか、プロジェクトルート（`.git` フォルダで識別）またはホームディレクトリに到達するまで続けます。
3. それでも見つからない場合、`~/.env`（ユーザーのホームディレクトリ内）を探します。

**環境変数の除外：** 一部の環境変数（例：`DEBUG` や `DEBUG_MODE`）は、CLI の動作に干渉するのを防ぐため、プロジェクトの `.env` ファイルからはデフォルトで除外されます。`.qwen/.env` ファイルからの変数は除外されません。この動作は、`settings.json` ファイル内の `advanced.excludedEnvVars` 設定でカスタマイズできます。

- **`OPENAI_API_KEY`**:
  - 利用可能な複数の[認証方法](./authentication.md)の一つ。
  - シェルプロファイル（例：`~/.bashrc`、`~/.zshrc`）または `.env` ファイルで設定します。
- **`OPENAI_BASE_URL`**:
  - 利用可能な複数の[認証方法](./authentication.md)の一つ。
  - シェルプロファイル（例：`~/.bashrc`、`~/.zshrc`）または `.env` ファイルで設定します。
- **`OPENAI_MODEL`**:
  - 使用するデフォルトの OPENAI モデルを指定します。
  - ハードコードされたデフォルト値を上書きします。
  - 例: `export OPENAI_MODEL="qwen3-coder-plus"`
- **`GEMINI_TELEMETRY_ENABLED`**:
  - `true` または `1` に設定するとテレメトリを有効にします。それ以外の値は無効として扱われます。
  - `telemetry.enabled` 設定を上書きします。
- **`GEMINI_TELEMETRY_TARGET`**:
  - テレメトリのターゲットを設定します（`local` または `gcp`）。
  - `telemetry.target` 設定を上書きします。
- **`GEMINI_TELEMETRY_OTLP_ENDPOINT`**:
  - テレメトリ用の OTLP エンドポイントを設定します。
  - `telemetry.otlpEndpoint` 設定を上書きします。
- **`GEMINI_TELEMETRY_OTLP_PROTOCOL`**:
  - OTLP プロトコルを設定します（`grpc` または `http`）。
  - `telemetry.otlpProtocol` 設定を上書きします。
- **`GEMINI_TELEMETRY_LOG_PROMPTS`**:
  - `true` または `1` に設定すると、ユーザーのプロンプトのログを有効または無効にします。それ以外の値は無効として扱われます。
  - `telemetry.logPrompts` 設定を上書きします。
- **`GEMINI_TELEMETRY_OUTFILE`**:
  - ターゲットが `local` の場合に、テレメトリを書き込むファイルパスを設定します。
  - `telemetry.outfile` 設定を上書きします。
- **`GEMINI_TELEMETRY_USE_COLLECTOR`**:
  - `true` または `1` に設定すると、外部の OTLP コレクターの使用を有効または無効にします。それ以外の値は無効として扱われます。
  - `telemetry.useCollector` 設定を上書きします。
- **`GEMINI_SANDBOX`**:
  - `settings.json` の `sandbox` 設定の代替。
  - `true`、`false`、`docker`、`podman`、またはカスタムコマンド文字列を受け入れます。
- **`SEATBELT_PROFILE`**（macOS 固有）:
  - macOS で Seatbelt（`sandbox-exec`）プロファイルを切り替えます。
  - `permissive-open`: （デフォルト）プロジェクトフォルダ（およびいくつかの他のフォルダ）への書き込みを制限しますが、その他の操作は許可されます（詳細は `packages/cli/src/utils/sandbox-macos-permissive-open.sb` を参照）。
  - `strict`: デフォルトで操作を拒否する厳格なプロファイルを使用します。
  - `<profile_name>`: カスタムプロファイルを使用します。カスタムプロファイルを定義するには、プロジェクトの `.qwen/` ディレクトリに `sandbox-macos-<profile_name>.sb` という名前のファイルを作成します（例：`my-project/.qwen/sandbox-macos-custom.sb`）。
- **`DEBUG` または `DEBUG_MODE`**（多くの場合、下位ライブラリや CLI 自体で使用）:
  - `true` または `1` に設定すると、詳細なデバッグログを有効にし、トラブルシューティングに役立ちます。
  - **注意:** これらの変数は、CLI の動作に干渉するのを防ぐため、プロジェクトの `.env` ファイルからはデフォルトで除外されます。Qwen Code でこれらの変数を使用する必要がある場合は `.qwen/.env` ファイルを使用してください。
- **`NO_COLOR`**:
  - 任意の値を設定すると、CLI のすべてのカラー出力を無効にします。
- **`CLI_TITLE`**:
  - 文字列を設定して、CLI のタイトルをカスタマイズします。
- **`TAVILY_API_KEY`**:
  - Tavily ウェブ検索サービスの API キー。
  - `web_search` ツール機能を有効にするために必要です。
  - 設定されていない場合、ウェブ検索ツールは無効化され、スキップされます。
  - 例: `export TAVILY_API_KEY="tvly-your-api-key-here"`
```

## コマンドライン引数

CLI 実行時に直接渡す引数は、そのセッションにおいて他の設定を上書きできます。

- **`--model <model_name>`** (**`-m <model_name>`**):
  - このセッションで使用する Qwen モデルを指定します。
  - 例: `npm start -- --model qwen3-coder-plus`
- **`--prompt <your_prompt>`** (**`-p <your_prompt>`**):
  - プロンプトをコマンドに直接渡すために使用します。これにより、Qwen Code が非対話モードで起動されます。
  - スクリプトでの利用例として、構造化された出力を得るために `--output-format json` フラグを使用できます。
- **`--prompt-interactive <your_prompt>`** (**`-i <your_prompt>`**):
  - 指定したプロンプトを初期入力として、インタラクティブセッションを開始します。
  - プロンプトはインタラクティブセッション内で処理され、事前に処理されることはありません。
  - stdin からのパイプ入力がある場合は使用できません。
  - 例: `qwen -i "explain this code"`
- **`--output-format <format>`**:
  - **説明:** 非対話モードにおける CLI の出力形式を指定します。
  - **値:**
    - `text`: （デフォルト）人間が読める標準のテキスト出力です。
    - `json`: 機械が読み取れる JSON 形式の出力です。
  - **注意:** 構造化された出力やスクリプト用途では、`--output-format json` フラグを使用してください。
- **`--sandbox`** (**`-s`**):
  - このセッションでサンドボックスモードを有効にします。
- **`--sandbox-image`**:
  - サンドボックスイメージの URI を設定します。
- **`--debug`** (**`-d`**):
  - このセッションでデバッグモードを有効にし、より詳細なログを出力します。
- **`--all-files`** (**`-a`**):
  - 設定すると、現在のディレクトリ内のすべてのファイルを再帰的にプロンプトのコンテキストに含めます。
- **`--help`** (または **`-h`**):
  - コマンドライン引数に関するヘルプ情報を表示します。
- **`--show-memory-usage`**:
  - 現在のメモリ使用量を表示します。
- **`--yolo`**:
  - YOLO モードを有効にし、すべてのツール呼び出しを自動承認します。
- **`--approval-mode <mode>`**:
  - ツール呼び出しの承認モードを設定します。サポートされるモード:
    - `plan`: 分析のみ—ファイル変更やコマンド実行は行いません。
    - `default`: ファイル編集やシェルコマンドには承認が必要（デフォルト動作）。
    - `auto-edit`: 編集系ツール（edit, write_file）は自動承認し、それ以外は確認を求めます。
    - `yolo`: すべてのツール呼び出しを自動承認（`--yolo` と同等）。
  - `--yolo` とは同時に使用できません。新しい統一アプローチでは、`--yolo` の代わりに `--approval-mode=yolo` を使用してください。
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
  - テレメトリー用にプロンプトのログ記録を有効にします。詳細は [telemetry](../telemetry.md) を参照してください。
- **`--checkpointing`**:
  - [checkpointing](../checkpointing.md) を有効にします。
- **`--extensions <extension_name ...>`** (**`-e <extension_name ...>`**):
  - セッションで使用する拡張機能のリストを指定します。指定しない場合、利用可能なすべての拡張機能が使用されます。
  - 特殊なキーワード `qwen -e none` を使用して、すべての拡張機能を無効にできます。
  - 例: `qwen -e my-extension -e my-other-extension`
- **`--list-extensions`** (**`-l`**):
  - 利用可能なすべての拡張機能を一覧表示して終了します。
- **`--proxy`**:
  - CLI で使用するプロキシを設定します。
  - 例: `--proxy http://localhost:7890`
- **`--include-directories <dir1,dir2,...>`**:
  - マルチディレクトリ対応のためにワークスペースに追加のディレクトリを含めます。
  - 複数回指定するか、カンマ区切りで指定できます。
  - 最大で 5 つのディレクトリを追加できます。
  - 例: `--include-directories /path/to/project1,/path/to/project2` または `--include-directories /path/to/project1 --include-directories /path/to/project2`
- **`--screen-reader`**:
  - スクリーンリーダーモードを有効にし、TUI をスクリーンリーダーとの互換性向上のために調整します。
- **`--version`**:
  - CLI のバージョンを表示します。
- **`--openai-logging`**:
  - OpenAI API 呼び出しのログ記録を有効にし、デバッグおよび分析に役立てます。このフラグは `settings.json` 内の `enableOpenAILogging` 設定よりも優先されます。
- **`--tavily-api-key <api_key>`**:
  - このセッションでウェブ検索機能に使用する Tavily API キーを設定します。
  - 例: `qwen --tavily-api-key tvly-your-api-key-here`

## コンテキストファイル（階層型指示コンテキスト）

CLI の**動作**設定というわけではありませんが、コンテキストファイル（デフォルトでは `QWEN.md`、`context.fileName` 設定で変更可）は、**指示コンテキスト**（「メモリ」とも呼ばれます）の設定に不可欠です。この強力な機能により、プロジェクト固有の指示、コーディングスタイルガイド、または関連する背景情報を AI に提供し、あなたのニーズにより適した正確な応答を得ることができます。CLI には、フッターにロードされたコンテキストファイル数を表示する UI 要素などがあり、アクティブなコンテキストの状態を確認できます。

- **目的：** これらの Markdown ファイルには、Qwen モデルとのやり取り中に参照してほしい指示、ガイドライン、またはコンテキスト情報を記述します。システムは、この指示コンテキストを階層的に管理するように設計されています。

### コンテキストファイルの例（例：`QWEN.md`）

以下は、TypeScriptプロジェクトのルートにあるコンテキストファイルが含むかもしれない内容の概念的な例です：

```markdown

# Project: My Awesome TypeScript Library

## 一般的な指示:

- 新しいTypeScriptコードを生成する際は、既存のコーディングスタイルに従ってください。
- すべての新しい関数とクラスには、JSDocコメントを必ず付与してください。
- 適切な場所では、関数型プログラミングのパラダイムを優先してください。
- すべてのコードは、TypeScript 5.0およびNode.js 20+との互換性を保つ必要があります。

## コーディングスタイル:

- インデントにはスペース2つを使用してください。
- インターフェース名の先頭には`I`を付けてください（例：`IUserService`）。
- privateなクラスメンバの先頭にはアンダースコア（`_`）を付けてください。
- 常に厳密等価演算子（`===`および`!==`）を使用してください。

## 特定のコンポーネント: `src/api/client.ts`

- このファイルは、すべての外部APIリクエストを処理します。
- 新しいAPI呼び出し関数を追加する際は、堅牢なエラーハンドリングとロギングを必ず含めてください。
- すべてのGETリクエストには、既存の`fetchWithRetry`ユーティリティを使用してください。

```markdown
## 依存関係について:

- 新しい外部依存関係の導入は、どうしても必要な場合を除き避けてください。
- 新しい依存関係が必要な場合は、その理由を明記してください。

この例は、プロジェクト全体のコンテキスト情報、特定のコーディング規約、特定のファイルやコンポーネントに関する注意書きなどをどのように提供するかを示しています。コンテキストファイルがどれだけ関連性が高く正確であるかによって、AIがあなたをどれだけ効果的に支援できるかが決まります。プロジェクト固有のコンテキストファイルの作成を強く推奨します。これにより、プロジェクト内での規約やコンテキストを確立できます。

- **階層的なロードと優先順位:** CLIは、複数の場所からコンテキストファイル（例: `QWEN.md`）をロードすることで、洗練された階層的なメモリシステムを実装しています。このリストの下位（より具体的な）ファイルの内容は、通常、上位（より一般的な）ファイルの内容を上書きまたは補完します。結合順序および最終的なコンテキストは、`/memory show` コマンドで確認できます。一般的なロード順序は以下の通りです：
  1.  **グローバルコンテキストファイル:**
      - 場所: `~/.qwen/<設定されたコンテキストファイル名>`（例: ユーザーのホームディレクトリにある `~/.qwen/QWEN.md`）。
      - 範囲: すべてのプロジェクトに対してデフォルトの指示を提供します。
  2.  **プロジェクトルートおよび祖先ディレクトリのコンテキストファイル:**
      - 場所: CLIは、現在の作業ディレクトリから親ディレクトリに向かって、`.git` フォルダで識別されるプロジェクトルートまたはホームディレクトリまで、設定されたコンテキストファイルを検索します。
      - 範囲: プロジェクト全体またはその主要な部分に関連するコンテキストを提供します。
  3.  **サブディレクトリのコンテキストファイル（コンテキスト依存/ローカル）:**
      - 場所: CLIは、現在の作業ディレクトリ以下のサブディレクトリでも設定されたコンテキストファイルをスキャンします（`node_modules` や `.git` などの一般的な無視パターンを尊重します）。この検索の広さはデフォルトでは200ディレクトリに制限されていますが、`settings.json` ファイルの `context.discoveryMaxDirs` 設定で変更できます。
      - 範囲: 特定のコンポーネント、モジュール、またはプロジェクトのサブセクションに関連する非常に具体的な指示を可能にします。
- **結合とUI表示:** 見つかったすべてのコンテキストファイルの内容は結合され（元の場所とパスを示すセパレータ付きで）、システムプロンプトの一部として提供されます。CLIのフッターにはロードされたコンテキストファイルの数が表示され、現在アクティブな指示コンテキストを視覚的に確認できます。
- **コンテンツのインポート:** `@path/to/file.md` 構文を使用して、他のMarkdownファイルをインポートすることで、コンテキストファイルをモジュール化できます。詳細については、[Memory Import Processor documentation](../core/memport.md) を参照してください。
- **メモリ管理用コマンド:**
  - `/memory refresh` を使用して、すべての設定された場所からすべてのコンテキストファイルを強制的に再スキャンおよび再ロードできます。これにより、AIの指示コンテキストが更新されます。
  - `/memory show` を使用して、現在ロードされている結合された指示コンテキストを表示し、AIが使用している階層と内容を確認できます。
  - `/memory` コマンドおよびそのサブコマンド（`show` および `refresh`）の詳細については、[Commands documentation](./commands.md#memory) を参照してください。

これらの設定レイヤーとコンテキストファイルの階層構造を理解し活用することで、AIのメモリを効果的に管理し、Qwen Codeの応答をあなたの特定のニーズやプロジェクトに合わせて調整できます。
```

## サンドボックス

Qwen Code は、システムを保護するために、潜在的に安全でない操作（シェルコマンドやファイルの変更など）をサンドボックス環境内で実行できます。

サンドボックスはデフォルトでは無効になっていますが、以下の方法で有効にできます：

- `--sandbox` または `-s` フラグを使用する
- `GEMINI_SANDBOX` 環境変数を設定する
- `--yolo` または `--approval-mode=yolo` を使用している場合、デフォルトでサンドボックスが有効になります

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

`.qwen/sandbox.Dockerfile` が存在する場合、Qwen Code を実行する際に `BUILD_SANDBOX` 環境変数を使用して、カスタム sandbox イメージを自動ビルドできます：

```bash
BUILD_SANDBOX=1 qwen -s
```

## 使用統計情報

Qwen Code の改善のために、匿名化された使用統計情報を収集しています。このデータは、CLI の利用状況を把握し、一般的な問題を特定し、新機能の優先順位を決定するのに役立ちます。

**収集する情報:**

- **ツール呼び出し:** 呼び出されたツールの名前、成功または失敗の結果、実行にかかった時間などを記録します。ただし、ツールに渡される引数やツールから返されるデータは収集しません。
- **API リクエスト:** 各リクエストで使用されたモデル、リクエストの所要時間、成功したかどうかを記録します。プロンプトやレスポンスの内容は収集しません。
- **セッション情報:** 有効になっているツールや承認モードなど、CLI の設定に関する情報を収集します。

**収集しない情報:**

- **個人を特定できる情報 (PII):** 氏名、メールアドレス、API キーなど、個人を特定できる情報は一切収集しません。
- **プロンプトおよびレスポンスの内容:** ユーザーが入力したプロンプトやモデルからのレスポンスの内容は記録しません。
- **ファイルの内容:** CLI によって読み書きされたファイルの内容は記録しません。

**オプトアウト方法:**

`settings.json` ファイルの `privacy` カテゴリにある `usageStatisticsEnabled` プロパティを `false` に設定することで、いつでも使用統計情報の収集を無効化できます：

```json
{
  "privacy": {
    "usageStatisticsEnabled": false
  }
}
```

注意: 使用統計情報が有効になっている場合、イベントは Alibaba Cloud RUM 収集エンドポイントに送信されます。