# Qwen Code 設定

**新しい設定フォーマットについての注意**

`settings.json` ファイルのフォーマットが、より整理された新しい構造に更新されました。古いフォーマットは自動的に移行されます。

以前のフォーマットの詳細については、[v1 設定ドキュメント](./configuration-v1.md)を参照してください。

Qwen Code では、動作を設定する方法がいくつか用意されています。環境変数、コマンドライン引数、設定ファイルなどがあります。このドキュメントでは、それぞれの設定方法と利用可能な設定項目について説明します。

## 設定レイヤー

設定は以下の優先順位に従って適用されます（数字が小さいほど低優先度で、大きいほど高優先度）：

1.  **デフォルト値：** アプリケーション内にハードコードされたデフォルト値。
2.  **システムデフォルトファイル：** システム全体のデフォルト設定で、他の設定ファイルによって上書き可能。
3.  **ユーザ設定ファイル：** 現在のユーザー向けのグローバル設定。
4.  **プロジェクト設定ファイル：** プロジェクト固有の設定。
5.  **システム設定ファイル：** すべての他の設定ファイルを上書きするシステム全体の設定。
6.  **環境変数：** システム全体またはセッション固有の変数。`.env` ファイルから読み込まれる可能性あり。
7.  **コマンドライン引数：** CLI起動時に渡される値。

## 設定ファイル

Qwen Code は永続的な設定のために JSON 形式の設定ファイルを使用します。これらのファイルは以下の4つの場所に配置できます：

- **システムデフォルトファイル：**
  - **場所：** `/etc/qwen-code/system-defaults.json`（Linux）、`C:\ProgramData\qwen-code\system-defaults.json`（Windows）または `/Library/Application Support/QwenCode/system-defaults.json`（macOS）。パスは環境変数 `QWEN_CODE_SYSTEM_DEFAULTS_PATH` を使って上書き可能です。
  - **スコープ：** システム全体での基本的なデフォルト設定を提供します。これらの設定は最も低い優先度を持ち、ユーザー設定やプロジェクト設定、システムオーバーライド設定によって上書きされることを想定しています。

- **ユーザーセッティングファイル：**
  - **場所：** `~/.qwen/settings.json`（ここで `~` はホームディレクトリです）。
  - **スコープ：** 現在のユーザーに対するすべての Qwen Code セッションに適用されます。

- **プロジェクトセッティングファイル：**
  - **場所：** プロジェクトのルートディレクトリ内の `.qwen/settings.json`。
  - **スコープ：** 特定のプロジェクトから Qwen Code を実行している場合のみ適用されます。プロジェクト設定はユーザー設定よりも優先されます。

- **システムセッティングファイル：**
  - **場所：** `/etc/qwen-code/settings.json`（Linux）、`C:\ProgramData\qwen-code\settings.json`（Windows）または `/Library/Application Support/QwenCode/settings.json`（macOS）。パスは環境変数 `QWEN_CODE_SYSTEM_SETTINGS_PATH` を使って上書き可能です。
  - **スコープ：** システム上のすべてのユーザーに対して、すべての Qwen Code セッションに適用されます。システム設定はユーザーおよびプロジェクト設定よりも優先されます。エンタープライズ環境でシステム管理者がユーザーの Qwen Code のセットアップを制御するのに役立ちます。

**設定における環境変数についての注意点：** `settings.json` ファイル内の文字列値では、`$VAR_NAME` または `${VAR_NAME}` 構文を使って環境変数を参照できます。これらの変数は設定読み込み時に自動的に解決されます。例えば、環境変数 `MY_API_TOKEN` がある場合、次のように `settings.json` 内で使用できます：
```json
"apiKey": "$MY_API_TOKEN"
```

### プロジェクト内の `.qwen` ディレクトリ

プロジェクト設定ファイルに加えて、プロジェクトの `.qwen` ディレクトリには、Qwen Code の動作に関連するその他のプロジェクト固有のファイルを含めることができます。例えば：

- [カスタムサンドボックスプロファイル](#sandboxing)（例：`.qwen/sandbox-macos-custom.sb`、`.qwen/sandbox.Dockerfile`）。

### `settings.json` で利用可能な設定

設定はカテゴリごとに整理されています。すべての設定は、`settings.json` ファイル内で対応するトップレベルのカテゴリオブジェクト内に配置してください。

#### `general`

- **`general.preferredEditor`** (string):
  - **説明:** ファイルを開く際に使用するエディタを指定します。
  - **デフォルト値:** `undefined`

- **`general.vimMode`** (boolean):
  - **説明:** Vimのキーバインドを有効にします。
  - **デフォルト値:** `false`

- **`general.disableAutoUpdate`** (boolean):
  - **説明:** 自動更新を無効にします。
  - **デフォルト値:** `false`

- **`general.disableUpdateNag`** (boolean):
  - **説明:** 更新通知のポップアップを無効にします。
  - **デフォルト値:** `false`

- **`general.checkpointing.enabled`** (boolean):
  - **説明:** セッションのチェックポイント機能を有効にして、復旧できるようにします。
  - **デフォルト値:** `false`

#### `output`

- **`output.format`** (string):
  - **説明:** CLI出力の形式を指定します。
  - **デフォルト値:** `"text"`
  - **選択可能値:** `"text"`, `"json"`

#### `ui`

- **`ui.theme`** (string):
  - **説明:** UI のカラーテーマ。利用可能なオプションについては [Themes](./themes.md) を参照してください。
  - **デフォルト値:** `undefined`

- **`ui.customThemes`** (object):
  - **説明:** カスタムテーマの定義。
  - **デフォルト値:** `{}`

- **`ui.hideWindowTitle`** (boolean):
  - **説明:** ウィンドウのタイトルバーを非表示にする。
  - **デフォルト値:** `false`

- **`ui.hideTips`** (boolean):
  - **説明:** UI 内の役立つヒントを非表示にする。
  - **デフォルト値:** `false`

- **`ui.hideBanner`** (boolean):
  - **説明:** アプリケーションのバナーを非表示にする。
  - **デフォルト値:** `false`

- **`ui.hideFooter`** (boolean):
  - **説明:** UI からフッターを非表示にする。
  - **デフォルト値:** `false`

- **`ui.showMemoryUsage`** (boolean):
  - **説明:** UI にメモリ使用量情報を表示する。
  - **デフォルト値:** `false`

- **`ui.showLineNumbers`** (boolean):
  - **説明:** チャットで行番号を表示する。
  - **デフォルト値:** `false`

- **`ui.showCitations`** (boolean):
  - **説明:** チャットで生成されたテキストの引用元を表示する。
  - **デフォルト値:** `true`

- **`enableWelcomeBack`** (boolean):
  - **説明:** 会話履歴があるプロジェクトに戻ってきたときに「お帰りなさい」ダイアログを表示する。
  - **デフォルト値:** `true`

- **`ui.accessibility.disableLoadingPhrases`** (boolean):
  - **説明:** アクセシビリティのためにロード中のフレーズを無効化する。
  - **デフォルト値:** `false`

- **`ui.customWittyPhrases`** (array of strings):
  - **説明:** ロード中に表示するカスタムフレーズのリスト。指定された場合、CLI はデフォルトのフレーズの代わりにこれらのフレーズを順番に表示します。
  - **デフォルト値:** `[]`

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
  - **デフォルト値:** `undefined`

- **`model.maxSessionTurns`** (number):
  - **説明:** セッション内で保持するユーザー/モデル/ツールの最大ターン数。-1 は無制限を意味します。
  - **デフォルト値:** `-1`

- **`model.summarizeToolOutput`** (object):
  - **説明:** ツール出力の要約機能を有効または無効にします。`tokenBudget` 設定を使用して、要約に使用するトークン予算を指定できます。注：現在サポートされているのは `run_shell_command` ツールのみです。例：`{"run_shell_command": {"tokenBudget": 2000}}`
  - **デフォルト値:** `undefined`

- **`model.chatCompression.contextPercentageThreshold`** (number):
  - **説明:** チャット履歴の圧縮を行う閾値を、モデルの最大トークン数に対する割合（パーセント）で設定します。この値は 0 から 1 の間で、自動圧縮と手動の `/compress` コマンドの両方に適用されます。例えば `0.6` を設定すると、チャット履歴がトークン上限の 60% を超えた時点で圧縮が実行されます。`0` を設定すると圧縮を完全に無効にします。
  - **デフォルト値:** `0.7`

- **`model.generationConfig`** (object):
  - **説明:** 下層のコンテンツ生成器に渡される高度なオーバーライド設定です。`timeout`、`maxRetries`、`disableCacheControl` などのリクエスト制御や、`samplingParams` 配下の調整用パラメータ（例：`temperature`、`top_p`、`max_tokens`）を指定できます。未設定の場合はプロバイダーのデフォルト値が使用されます。
  - **デフォルト値:** `undefined`
  - **例:**

    ```json
    {
      "model": {
        "generationConfig": {
          "timeout": 60000,
          "disableCacheControl": false,
          "samplingParams": {
            "temperature": 0.2,
            "top_p": 0.8,
            "max_tokens": 1024
          }
        }
      }
    }
    ```

- **`model.skipNextSpeakerCheck`** (boolean):
  - **説明:** 次の発話者チェックをスキップします。
  - **デフォルト値:** `false`

- **`model.skipLoopDetection`** (boolean):
  - **説明:** ループ検出チェックを無効にします。ループ検出は AI 応答の無限ループを防ぐための機能ですが、誤検知により正常なワークフローが中断されることがあります。頻繁に誤検知が発生する場合はこのオプションを有効にしてください。
  - **デフォルト値:** `false`

- **`model.skipStartupContext`** (boolean):
  - **説明:** 各セッション開始時にスタートアップワークスペースコンテキスト（環境概要および確認メッセージ）の送信をスキップします。コンテキストを手動で提供したい場合や、起動時のトークン消費を抑えたい場合に有効にしてください。
  - **デフォルト値:** `false`

- **`model.enableOpenAILogging`** (boolean):
  - **説明:** OpenAI API 呼び出しのログ記録を有効にし、デバッグや分析に役立てます。有効にすると、API のリクエストとレスポンスが JSON ファイルに記録されます。
  - **デフォルト値:** `false`

- **`model.openAILoggingDir`** (string):
  - **説明:** OpenAI API ログのカスタムディレクトリパス。指定しない場合、デフォルトではカレントディレクトリの `logs/openai` に保存されます。絶対パス、相対パス（カレントディレクトリからの相対）、および `~`（ホームディレクトリ）展開に対応しています。
  - **デフォルト値:** `undefined`
  - **例:**
    - `"~/qwen-logs"` - `~/qwen-logs` ディレクトリにログを保存
    - `"./custom-logs"` - カレントディレクトリの `./custom-logs` にログを保存
    - `"/tmp/openai-logs"` - 絶対パス `/tmp/openai-logs` にログを保存

#### `context`

- **`context.fileName`** (string または string の配列):
  - **説明:** コンテキストファイルの名前。
  - **デフォルト:** `undefined`

- **`context.importFormat`** (string):
  - **説明:** メモリをインポートする際に使用するフォーマット。
  - **デフォルト:** `undefined`

- **`context.discoveryMaxDirs`** (number):
  - **説明:** メモリ検索対象とするディレクトリの最大数。
  - **デフォルト:** `200`

- **`context.includeDirectories`** (array):
  - **説明:** ワークスペースのコンテキストに含める追加ディレクトリ。存在しないディレクトリは警告を出力してスキップされます。
  - **デフォルト:** `[]`

- **`context.loadFromIncludeDirectories`** (boolean):
  - **説明:** `/memory refresh` コマンドの動作を制御します。`true` に設定すると、追加されたすべてのディレクトリから `QWEN.md` ファイルを読み込みます。`false` に設定すると、カレントディレクトリからのみ `QWEN.md` を読み込みます。
  - **デフォルト:** `false`

- **`context.fileFiltering.respectGitIgnore`** (boolean):
  - **説明:** 検索時に .gitignore ファイルを尊重するかどうか。
  - **デフォルト:** `true`

- **`context.fileFiltering.respectQwenIgnore`** (boolean):
  - **説明:** 検索時に .qwenignore ファイルを尊重するかどうか。
  - **デフォルト:** `true`

- **`context.fileFiltering.enableRecursiveFileSearch`** (boolean):
  - **説明:** プロンプトで `@` プレフィックスの補完を行う際、現在のツリー配下のファイル名を再帰的に検索するかどうか。
  - **デフォルト:** `true`

#### `tools`

- **`tools.sandbox`** (boolean または string):
  - **説明:** サンドボックス実行環境（boolean またはパス文字列を指定可能）。
  - **デフォルト:** `undefined`

- **`tools.shell.enableInteractiveShell`** (boolean):

  インタラクティブなシェル体験のために `node-pty` を使用します。`child_process` へのフォールバックは引き続き有効です。デフォルトは `false`。

- **`tools.core`** (string の配列):
  - **説明:** 組み込みツールのセットを制限するために使用できます（[allowlist による制限](./enterprise.md#restricting-tool-access)）。コアツールの一覧については [Built-in Tools](../core/tools-api.md#built-in-tools) を参照してください。マッチングの仕様は `tools.allowed` と同じです。
  - **デフォルト:** `undefined`

- **`tools.exclude`** (string の配列):
  - **説明:** 検出から除外するツール名。
  - **デフォルト:** `undefined`

- **`tools.allowed`** (string の配列):
  - **説明:** 確認ダイアログをスキップするツール名のリスト。信頼できる、かつ頻繁に使うツールに対して便利です。例えば、`["run_shell_command(git)", "run_shell_command(npm test)"]` とすると、任意の `git` コマンドや `npm test` コマンドを実行する際に確認ダイアログが表示されません。プレフィックスマッチ、コマンドチェーンなどの詳細については [Shell Tool command restrictions](../tools/shell.md#command-restrictions) を参照してください。
  - **デフォルト:** `undefined`

- **`tools.approvalMode`** (string):
  - **説明:** ツール使用時のデフォルト承認モードを設定します。以下の値を受け付けます：
    - `plan`: 解析のみでファイル変更やコマンド実行は行いません。
    - `default`: ファイル編集やシェルコマンド実行前に承認が必要です。
    - `auto-edit`: ファイル編集は自動的に承認されます。
    - `yolo`: 全てのツール呼び出しを自動的に承認します。
  - **デフォルト:** `default`

- **`tools.discoveryCommand`** (string):
  - **説明:** ツール検出用に実行するコマンド。
  - **デフォルト:** `undefined`

- **`tools.callCommand`** (string):
  - **説明:** `tools.discoveryCommand` で検出した特定のツールを呼び出すためのカスタムシェルコマンドを定義します。このシェルコマンドは以下の条件を満たす必要があります：
    - 最初のコマンドライン引数として関数の `name`（[function declaration](https://ai.google.dev/gemini-api/docs/function-calling#function-declarations) におけるものと完全一致）を受け取ること。
    - `stdin` から JSON 形式で関数の引数を読み込むこと（[`functionCall.args`](https://cloud.google.com/vertex-ai/generative-ai/docs/model-reference/inference#functioncall) と同様）。
    - `stdout` に関数の出力を JSON 形式で返すこと（[`functionResponse.response.content`](https://cloud.google.com/vertex-ai/generative-ai/docs/model-reference/inference#functionresponse) と同様）。
  - **デフォルト:** `undefined`

- **`tools.useRipgrep`** (boolean):
  - **説明:** ファイル内容検索時に、フォールバック実装ではなく ripgrep を使用します。より高速な検索パフォーマンスを提供します。
  - **デフォルト:** `true`

- **`tools.useBuiltinRipgrep`** (boolean):
  - **説明:** 同梱されている ripgrep バイナリを使用します。`false` に設定すると、システムレベルの `rg` コマンドが代わりに使用されます。この設定は `tools.useRipgrep` が `true` の場合にのみ有効です。
  - **デフォルト:** `true`

- **`tools.enableToolOutputTruncation`** (boolean):
  - **説明:** 大きなツール出力の切り詰めを有効にします。
  - **デフォルト:** `true`
  - **再起動が必要:** はい

- **`tools.truncateToolOutputThreshold`** (number):
  - **説明:** この文字数を超えるツール出力を切り詰めます。Shell、Grep、Glob、ReadFile、ReadManyFiles ツールに適用されます。
  - **デフォルト:** `25000`
  - **再起動が必要:** はい

- **`tools.truncateToolOutputLines`** (number):
  - **説明:** ツール出力の切り詰め時に保持される最大行数またはエントリー数。Shell、Grep、Glob、ReadFile、ReadManyFiles ツールに適用されます。
  - **デフォルト:** `1000`
  - **再起動が必要:** はい

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
  - **説明:** フォルダ信頼が有効かどうかを追跡する設定。
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
  - **デフォルト値:** `false`

- **`advanced.dnsResolutionOrder`** (string):
  - **説明:** DNS 解決の順序を指定します。
  - **デフォルト値:** `undefined`

- **`advanced.excludedEnvVars`** (string の配列):
  - **説明:** プロジェクトコンテキストから除外する環境変数。
  - **デフォルト値:** `["DEBUG","DEBUG_MODE"]`

- **`advanced.bugCommand`** (object):
  - **説明:** バグレポートコマンドの設定。
  - **デフォルト値:** `undefined`

- **`advanced.tavilyApiKey`** (string):
  - **説明:** Tavily ウェブ検索サービス用の API キー。`web_search` ツール機能を有効化するために使用されます。
  - **注意:** これはレガシーな設定形式です。Qwen OAuth ユーザーの場合、特別な設定なしに DashScope プロバイダーが自動的に利用可能になります。他の認証タイプの場合は、新しい `webSearch` 設定形式を使って Tavily または Google プロバイダーを設定してください。
  - **デフォルト値:** `undefined`

#### `mcpServers`

カスタムツールを検出・利用するための、1つ以上の Model-Context Protocol (MCP) サーバーへの接続を設定します。Qwen Code は各 MCP サーバーに接続を試行し、利用可能なツールを探索します。複数の MCP サーバーで同じ名前のツールが公開されている場合、ツール名には設定で定義したサーバーエイリアスがプレフィックスとして付加され（例：`serverAlias__actualToolName`）、競合を回避します。システムは互換性のために MCP ツール定義から特定のスキーマプロパティを削除することがあります。`command`、`url`、`httpUrl` のうち少なくとも1つを指定する必要があります。複数が指定された場合は、優先順位が `httpUrl` → `url` → `command` となります。

- **`mcpServers.<SERVER_NAME>`** (object): 名前付きサーバーのサーバーパラメータ。
  - `command` (string, optional): 標準入出力を介して MCP サーバーを起動するコマンド。
  - `args` (array of strings, optional): コマンドに渡す引数。
  - `env` (object, optional): サーバープロセスに設定する環境変数。
  - `cwd` (string, optional): サーバーを起動する作業ディレクトリ。
  - `url` (string, optional): Server-Sent Events (SSE) を使用して通信する MCP サーバーの URL。
  - `httpUrl` (string, optional): ストリーム可能な HTTP を使用して通信する MCP サーバーの URL。
  - `headers` (object, optional): `url` または `httpUrl` へのリクエストと一緒に送信する HTTP ヘッダーのマップ。
  - `timeout` (number, optional): この MCP サーバーへのリクエストのタイムアウト（ミリ秒）。
  - `trust` (boolean, optional): このサーバーを信頼し、すべてのツール呼び出し確認をバイパスします。
  - `description` (string, optional): 表示目的などで使用されるサーバーの簡単な説明。
  - `includeTools` (array of strings, optional): この MCP サーバーから含めるツール名のリスト。指定された場合、ここにリストされたツールのみがこのサーバーから利用可能になります（allowlist の動作）。指定しない場合、デフォルトですべてのツールが有効になります。
  - `excludeTools` (array of strings, optional): この MCP サーバーから除外するツール名のリスト。ここにリストされたツールは、サーバーから公開されていてもモデルからは利用できなくなります。**注意:** `excludeTools` は `includeTools` よりも優先されます。両方のリストに同じツールがある場合、そのツールは除外されます。

#### `telemetry`

Qwen Code のロギングとメトリクス収集を設定します。詳細については、[Telemetry](../telemetry.md) を参照してください。

- **プロパティ:**
  - **`enabled`** (boolean): テレメトリが有効かどうか。
  - **`target`** (string): 収集されたテレメトリの送信先。サポートされる値は `local` と `gcp`。
  - **`otlpEndpoint`** (string): OTLP Exporter のエンドポイント。
  - **`otlpProtocol`** (string): OTLP Exporter で使用するプロトコル（`grpc` または `http`）。
  - **`logPrompts`** (boolean): ユーザーのプロンプト内容をログに含めるかどうか。
  - **`outfile`** (string): `target` が `local` のときにテレメトリを書き込むファイル。
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
    "enableOpenAILogging": false,
    "openAILoggingDir": "~/qwen-logs",
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
  - `<project_hash>` はプロジェクトのルートパスから生成される一意の識別子です。
  - 履歴は `shell_history` という名前のファイルに保存されます。

```markdown
## 環境変数と `.env` ファイル

環境変数は、アプリケーションの設定によく使われる方法で、特に API キーのような機密情報や、環境ごとに変わる可能性のある設定に適しています。認証のセットアップについては、利用可能なすべての認証方法を網羅した[認証ドキュメント](./authentication.md)をご確認ください。

CLI は自動的に `.env` ファイルから環境変数を読み込みます。読み込み順序は以下の通りです：

1.  カレントディレクトリにある `.env` ファイル。
2.  見つからない場合、親ディレクトリを上に向かって探索し、`.env` ファイルが見つかるか、プロジェクトルート（`.git` フォルダで識別）またはホームディレクトリに到達するまで続けます。
3.  それでも見つからない場合、`~/.env`（ユーザーのホームディレクトリ内）を探します。

**環境変数の除外：** 一部の環境変数（例：`DEBUG` や `DEBUG_MODE`）は、CLI の動作への干渉を防ぐため、デフォルトでプロジェクトの `.env` ファイルからは自動的に除外されます。`.qwen/.env` ファイルからの変数は除外されません。この動作は、`settings.json` ファイル内の `advanced.excludedEnvVars` 設定でカスタマイズできます。

- **`OPENAI_API_KEY`**:
  - 利用可能な[認証方法](./authentication.md)の一つ。
  - シェルプロファイル（例：`~/.bashrc`、`~/.zshrc`）または `.env` ファイルで設定してください。
- **`OPENAI_BASE_URL`**:
  - 利用可能な[認証方法](./authentication.md)の一つ。
  - シェルプロファイル（例：`~/.bashrc`、`~/.zshrc`）または `.env` ファイルで設定してください。
- **`OPENAI_MODEL`**:
  - 使用するデフォルトの OPENAI モデルを指定します。
  - ハードコードされたデフォルト値を上書きします。
  - 例: `export OPENAI_MODEL="qwen3-coder-plus"`
- **`GEMINI_TELEMETRY_ENABLED`**:
  - `true` または `1` を設定するとテレメトリが有効になります。それ以外の値は無効として扱われます。
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
  - `true` または `1` を設定すると、ユーザーのプロンプトログを有効または無効にします。それ以外の値は無効として扱われます。
  - `telemetry.logPrompts` 設定を上書きします。
- **`GEMINI_TELEMETRY_OUTFILE`**:
  - ターゲットが `local` のときにテレメトリを出力するファイルパスを設定します。
  - `telemetry.outfile` 設定を上書きします。
- **`GEMINI_TELEMETRY_USE_COLLECTOR`**:
  - `true` または `1` を設定すると外部 OTLP コレクターの使用を有効または無効にします。それ以外の値は無効として扱われます。
  - `telemetry.useCollector` 設定を上書きします。
- **`GEMINI_SANDBOX`**:
  - `settings.json` 内の `sandbox` 設定の代替。
  - `true`、`false`、`docker`、`podman`、またはカスタムコマンド文字列を受け入れます。
- **`SEATBELT_PROFILE`**（macOS 固有）:
  - macOS 上で Seatbelt（`sandbox-exec`）プロファイルを切り替えます。
  - `permissive-open`: （デフォルト）プロジェクトフォルダ（およびいくつかの他のフォルダ、詳細は `packages/cli/src/utils/sandbox-macos-permissive-open.sb` 参照）への書き込みを制限しますが、その他の操作は許可されます。
  - `strict`: デフォルトで操作を拒否する厳格なプロファイルを使用します。
  - `<profile_name>`: カスタムプロファイルを使用します。カスタムプロファイルを定義するには、プロジェクトの `.qwen/` ディレクトリに `sandbox-macos-<profile_name>.sb` という名前のファイルを作成してください（例：`my-project/.qwen/sandbox-macos-custom.sb`）。
- **`DEBUG` または `DEBUG_MODE`**（基盤となるライブラリや CLI 自体でよく使われる）:
  - `true` または `1` を設定すると、トラブルシューティングに役立つ詳細なデバッグログが出力されます。
  - **注意：** これらの変数は、CLI の動作への干渉を防ぐため、デフォルトでプロジェクトの `.env` ファイルからは自動的に除外されます。Qwen Code 専用にこれらの変数を設定する必要がある場合は、`.qwen/.env` ファイルを使用してください。
- **`NO_COLOR`**:
  - 任意の値を設定すると、CLI のすべてのカラー出力を無効にします。
- **`CLI_TITLE`**:
  - 文字列を設定して、CLI のタイトルをカスタマイズします。
- **`TAVILY_API_KEY`**:
  - Tavily ウェブ検索サービスの API キー。
  - `web_search` ツール機能を有効にするために使用されます。
  - **注意：** Qwen OAuth ユーザーの場合、DashScope プロバイダーは追加設定なしで自動的に利用可能です。他の認証タイプでは、ウェブ検索を有効にするために Tavily または Google プロバイダーを設定してください。
  - 例: `export TAVILY_API_KEY="tvly-your-api-key-here"`
```

## コマンドライン引数

CLI 実行時に直接渡された引数は、そのセッションにおいて他の設定を上書きできます。

- **`--model <model_name>`** (**`-m <model_name>`**):
  - このセッションで使用する Qwen モデルを指定します。
  - 例: `npm start -- --model qwen3-coder-plus`
- **`--prompt <your_prompt>`** (**`-p <your_prompt>`**):
  - プロンプトをコマンドに直接渡すために使用されます。これにより、Qwen Code が非対話モードで起動します。
  - スクリプトでの利用例では、構造化された出力を得るために `--output-format json` フラグを使用してください。
- **`--prompt-interactive <your_prompt>`** (**`-i <your_prompt>`**):
  - 指定したプロンプトを初期入力として対話セッションを開始します。
  - プロンプトは対話セッション内で処理され、事前に処理されることはありません。
  - stdin からのパイプ入力がある場合は使用できません。
  - 例: `qwen -i "explain this code"`
- **`--output-format <format>`** (**`-o <format>`**):
  - **説明:** 非対話モードにおける CLI 出力の形式を指定します。
  - **値:**
    - `text`: （デフォルト）人間が読める標準的なテキスト出力です。
    - `json`: 実行終了時に機械可読な JSON 形式で出力されます。
    - `stream-json`: 実行中に発生する JSON メッセージをストリーミング形式で出力します。
  - **注意:** 構造化された出力やスクリプト用途には、`--output-format json` または `--output-format stream-json` フラグを使用してください。詳細については [Headless Mode](../features/headless.md) を参照してください。
- **`--input-format <format>`**:
  - **説明:** 標準入力から受け取るデータの形式を指定します。
  - **値:**
    - `text`: （デフォルト）stdin やコマンドライン引数からの標準テキスト入力です。
    - `stream-json`: 双方向通信のために stdin 経由で送信される JSON メッセージプロトコルです。
  - **必須条件:** `--input-format stream-json` を使用するには、`--output-format stream-json` の設定が必要です。
  - **注意:** `stream-json` 使用時は stdin がプロトコルメッセージ専用になります。詳細については [Headless Mode](../features/headless.md) を参照してください。
- **`--include-partial-messages`**:
  - **説明:** `stream-json` 出力形式を使用している場合に、アシスタントの部分的なメッセージも含めて出力します。有効にすると、ストリームイベント（message_start、content_block_delta など）が発生するたびに出力されます。
  - **デフォルト:** `false`
  - **必須条件:** `--output-format stream-json` の設定が必要です。
  - **注意:** ストリームイベントに関する詳細情報については [Headless Mode](../features/headless.md) を参照してください。
- **`--sandbox`** (**`-s`**):
  - このセッションでサンドボックスモードを有効にします。
- **`--sandbox-image`**:
  - サンドボックスイメージの URI を設定します。
- **`--debug`** (**`-d`**):
  - このセッションでデバッグモードを有効にし、より詳細なログを出力します。
- **`--all-files`** (**`-a`**):
  - 設定されている場合、カレントディレクトリ内のすべてのファイルを再帰的にプロンプトのコンテキストとして含めます。
- **`--help`** (または **`-h`**):
  - コマンドライン引数に関するヘルプ情報を表示します。
- **`--show-memory-usage`**:
  - 現在のメモリ使用量を表示します。
- **`--yolo`**:
  - YOLO モードを有効にし、すべてのツール呼び出しを自動承認します。
- **`--approval-mode <mode>`**:
  - ツール呼び出しの承認モードを設定します。サポートされているモード：
    - `plan`: 解析のみ — ファイル変更やコマンド実行は行いません。
    - `default`: ファイル編集やシェルコマンド実行には承認が必要です（デフォルト動作）。
    - `auto-edit`: 編集系ツール（edit、write_file）は自動承認し、それ以外は確認を求めます。
    - `yolo`: すべてのツール呼び出しを自動承認します（`--yolo` と同等）。
  - `--yolo` とは同時に使用できません。新しい統一アプローチでは `--yolo` の代わりに `--approval-mode=yolo` を使用してください。
  - 例: `qwen --approval-mode auto-edit`
- **`--allowed-tools <tool1,tool2,...>`**:
  - 承認ダイアログをスキップするツール名をカンマ区切りで指定します。
  - 例: `qwen --allowed-tools "Shell(git status)"`
- **`--telemetry`**:
  - [telemetry](../telemetry.md) を有効にします。
- **`--telemetry-target`**:
  - テレメトリのターゲットを設定します。詳しくは [telemetry](../telemetry.md) を参照してください。
- **`--telemetry-otlp-endpoint`**:
  - テレメトリ用の OTLP エンドポイントを設定します。詳しくは [telemetry](../telemetry.md) を参照してください。
- **`--telemetry-otlp-protocol`**:
  - テレメトリ用の OTLP プロトコルを設定します（`grpc` または `http`）。デフォルトは `grpc` です。詳しくは [telemetry](../telemetry.md) を参照してください。
- **`--telemetry-log-prompts`**:
  - テレメトリ用にプロンプトのログ記録を有効にします。詳しくは [telemetry](../telemetry.md) を参照してください。
- **`--checkpointing`**:
  - [checkpointing](../checkpointing.md) を有効にします。
- **`--extensions <extension_name ...>`** (**`-e <extension_name ...>`**):
  - セッションで使用する拡張機能の一覧を指定します。指定がない場合は、利用可能なすべての拡張機能が使用されます。
  - 特殊なキーワード `qwen -e none` を使うことで、すべての拡張機能を無効にできます。
  - 例: `qwen -e my-extension -e my-other-extension`
- **`--list-extensions`** (**`-l`**):
  - 利用可能なすべての拡張機能をリスト表示して終了します。
- **`--proxy`**:
  - CLI で使用するプロキシを設定します。
  - 例: `--proxy http://localhost:7890`
- **`--include-directories <dir1,dir2,...>`**:
  - マルチディレクトリ対応のためにワークスペースに追加のディレクトリを含めます。
  - 複数回指定するか、カンマ区切りで指定可能です。
  - 最大で 5 つのディレクトリまで追加できます。
  - 例: `--include-directories /path/to/project1,/path/to/project2` または `--include-directories /path/to/project1 --include-directories /path/to/project2`
- **`--screen-reader`**:
  - スクリーンリーダー向けモードを有効にし、TUI をスクリーンリーダーとの互換性向上のために調整します。
- **`--version`**:
  - CLI のバージョンを表示します。
- **`--openai-logging`**:
  - OpenAI API 呼び出しのログ記録を有効にして、デバッグおよび分析を行えるようにします。このフラグは `settings.json` 内の `enableOpenAILogging` 設定よりも優先されます。
- **`--openai-logging-dir <directory>`**:
  - OpenAI API ログのカスタム保存ディレクトリパスを設定します。このフラグは `settings.json` 内の `openAILoggingDir` 設定よりも優先されます。絶対パス、相対パス、および `~` 展開に対応しています。
  - **例:** `qwen --openai-logging-dir "~/qwen-logs" --openai-logging`
- **`--tavily-api-key <api_key>`**:
  - このセッションでウェブ検索機能を使用するために Tavily API キーを設定します。
  - 例: `qwen --tavily-api-key tvly-your-api-key-here`

## コンテキストファイル（階層型インストラクショナルコンテキスト）

CLI の*動作*設定というよりは、コンテキストファイル（デフォルトでは `QWEN.md` だが、`context.fileName` 設定で変更可能）は、*インストラクショナルコンテキスト*（「メモリ」とも呼ばれる）の設定に不可欠です。この強力な機能により、プロジェクト固有の指示、コーディングスタイルガイド、または関連する背景情報を AI に提供し、あなたのニーズにより適した正確な応答を得ることができます。CLI には、アクティブなコンテキストに関する情報を提供するために、フッターにロードされたコンテキストファイル数を表示する UI 要素が含まれています。

- **目的：** これらの Markdown ファイルには、Qwen モデルとのやり取り中に認識してほしい指示、ガイドライン、またはコンテキストが含まれています。システムは、このインストラクショナルコンテキストを階層的に管理するように設計されています。

### コンテキストファイルの例（例：`QWEN.md`）

以下は、TypeScriptプロジェクトのルートにあるコンテキストファイルが含む内容の概念的な例です：

```markdown

# Project: My Awesome TypeScript Library

## 一般的な指示:

- 新しいTypeScriptコードを生成する際は、既存のコーディングスタイルに従ってください。
- すべての新しい関数とクラスにはJSDocコメントを付与してください。
- 適切な場所では関数型プログラミングのパラダイムを優先してください。
- すべてのコードはTypeScript 5.0およびNode.js 20+との互換性を保つ必要があります。

## コーディングスタイル:

- インデントにはスペース2つを使用してください。
- インターフェース名の先頭には`I`を付けてください（例：`IUserService`）。
- privateなクラスメンバの先頭にはアンダースコア（`_`）を付けてください。
- 常に厳密等価演算子（`===`と`!==`）を使用してください。

## 特定コンポーネント: `src/api/client.ts`

- このファイルはすべての外部APIリクエストを処理します。
- 新しいAPI呼び出し関数を追加する際は、堅牢なエラーハンドリングとロギングを必ず含めてください。
- すべてのGETリクエストには既存の`fetchWithRetry`ユーティリティを使用してください。

```markdown
## 依存関係について:

- 新しい外部依存関係の導入は、どうしても必要な場合を除き避けてください。
- 新しい依存関係が必要な場合は、その理由を明記してください。

この例では、プロジェクト全体のコンテキスト情報や特定のコーディング規約、特定ファイルやコンポーネントに関する注意点などをどのように提供できるかを示しています。コンテキストファイルがどれだけ関連性があり正確であるかによって、AIがあなたをどの程度効果的に支援できるかが決まります。プロジェクト固有のコンテキストファイルを作成し、規約やコンテキストを確立することを強く推奨します。

- **階層的な読み込みと優先順位:** CLIは、複数の場所からコンテキストファイル（例：`QWEN.md`）を読み込むことで、洗練された階層型メモリシステムを実装しています。このリストで下位にあるファイル（より具体的なもの）の内容は、通常上位にあるファイル（より一般的なもの）の内容をオーバーライドまたは補完します。結合順序および最終的なコンテキストは、`/memory show` コマンドで確認できます。典型的な読み込み順序は以下の通りです：
  1.  **グローバルコンテキストファイル:**
      - 場所: `~/.qwen/<設定されたコンテキストファイル名>` （例：ユーザーのホームディレクトリにある `~/.qwen/QWEN.md`）
      - 範囲: 全てのプロジェクトに対してデフォルトの指示を提供します。
  2.  **プロジェクトルートおよび祖先ディレクトリのコンテキストファイル:**
      - 場所: CLIは現在の作業ディレクトリから親ディレクトリに向かって、設定されたコンテキストファイルを探していきます。探索はプロジェクトルート（`.git` フォルダで識別される）またはホームディレクトリまで行われます。
      - 範囲: プロジェクト全体またはその主要部分に関連するコンテキスト情報を提供します。
  3.  **サブディレクトリのコンテキストファイル（コンテキスト依存／ローカル）:**
      - 場所: CLIは現在の作業ディレクトリより下層のサブディレクトリの中でも、設定されたコンテキストファイルを検索します（ただし `node_modules` や `.git` のような一般的な無視パターンは尊重されます）。この検索範囲はデフォルトで最大200ディレクトリに制限されていますが、`settings.json` ファイル内の `context.discoveryMaxDirs` 設定により変更可能です。
      - 範囲: 特定のコンポーネント、モジュール、またはプロジェクトの一部に対する非常に詳細な指示を可能にします。
- **連結とUI表示:** 見つかったすべてのコンテキストファイルの内容は連結され（元のパスと出典を示す区切り文字付き）、システムプロンプトの一部として提供されます。CLIのフッターには読み込まれたコンテキストファイル数が表示され、アクティブな指示コンテキストの概観を素早く把握できます。
- **コンテンツのインポート:** `@path/to/file.md` 構文を使用して他のMarkdownファイルをインポートすることで、コンテキストファイルをモジュール化できます。詳しくは[Memory Import Processor ドキュメント](../core/memport.md)をご参照ください。
- **メモリ管理用コマンド:**
  - `/memory refresh` を使用すると、すべての設定済み場所からコンテキストファイルを再スキャン・再読み込みできます。これによりAIへの指示コンテキストが更新されます。
  - `/memory show` を使用すると、現在読み込まれている統合された指示コンテキストを表示でき、AIが使用している階層構造と内容を確認できます。
  - `/memory` コマンドおよびそのサブコマンド（`show` および `refresh`）の詳細については、[Commands ドキュメント](./commands.md#memory)をご参照ください。

これらの設定レイヤーとコンテキストファイルの階層的特性を理解し活用することで、AIのメモリを効果的に管理し、Qwen Codeの応答をあなたのニーズやプロジェクトに合わせて調整することが可能になります。
```

## サンドボックス

Qwen Code は、システムを保護するために、サンドボックス環境内で潜在的に危険な操作（シェルコマンドやファイルの変更など）を実行できます。

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

Qwen Code の改善のために、匿名化された使用統計情報を収集しています。このデータは、CLI がどのように使われているかを理解し、一般的な問題を特定し、新機能の優先順位を決定するために役立てています。

**収集する情報:**

- **ツール呼び出し:** 呼び出されたツールの名前、成功または失敗の結果、実行にかかった時間などを記録します。ただし、ツールに渡される引数や、ツールから返されるデータそのものは収集しません。
- **API リクエスト:** 各リクエストで使用されたモデル、リクエストの処理時間、成功したかどうかを記録します。プロンプトやレスポンスの内容は収集しません。
- **セッション情報:** 有効になっているツールや承認モードなど、CLI の設定に関する情報を収集します。

**収集しない情報:**

- **個人を特定できる情報 (PII):** 氏名、メールアドレス、API キーなど、個人を特定できる情報は一切収集しません。
- **プロンプトおよびレスポンスの内容:** ユーザーが入力したプロンプトや、モデルからのレスポンス内容はログに記録しません。
- **ファイルの内容:** CLI によって読み書きされたファイルの中身は収集しません。

**収集をオプトアウトする方法:**

`settings.json` ファイルの `privacy` カテゴリにある `usageStatisticsEnabled` プロパティを `false` に設定することで、いつでも使用統計情報の収集を無効化できます：

```json
{
  "privacy": {
    "usageStatisticsEnabled": false
  }
}
```

注意: 使用統計情報が有効な場合、イベントは Alibaba Cloud の RUM 収集エンドポイントに送信されます。