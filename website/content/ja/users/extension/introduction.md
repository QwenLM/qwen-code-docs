# Qwen Code 拡張機能

Qwen Code 拡張機能は、プロンプト、MCP サーバー、サブエージェント、スキル、およびカスタムコマンドを、使い慣れた直感的な形式にパッケージ化します。拡張機能を利用することで、Qwen Code の機能を拡張し、他のユーザーとその機能を共有できます。また、インストールや共有が容易になるよう設計されています。

[Gemini CLI Extensions Gallery](https://geminicli.com/extensions/) および [Claude Code Marketplace](https://claudemarketplaces.com/) から提供される拡張機能やプラグインは、Qwen Code に直接インストール可能です。このクロスプラットフォーム互換性により、拡張機能作者が別々のバージョンを管理する必要なく、豊富な拡張機能・プラグインエコシステムにアクセスでき、Qwen Code の機能を劇的に拡張できます。

## 拡張機能の管理

拡張機能の管理には、`qwen extensions` CLI コマンドと、対話型 CLI 内の `/extensions` スラッシュコマンドの両方を用いた一連のツールをご提供しています。

### ランタイム拡張機能管理（スラッシュコマンド）

対話型 CLI 内で `/extensions` スラッシュコマンドを使用して、実行時に拡張機能を管理できます。これらのコマンドはホットリロードをサポートしており、アプリケーションを再起動することなく変更を即座に適用できます。

| コマンド                                 | 説明                                                                 |
| ---------------------------------------- | -------------------------------------------------------------------- |
| `/extensions` または `/extensions manage` | インストール済みのすべての拡張機能を管理します                         |
| `/extensions install <source>`           | Git URL、ローカルパス、またはマーケットプレイスから拡張機能をインストールします |
| `/extensions explore [source]`           | 拡張機能のソースページ（Gemini または ClaudeCode）をブラウザで開きます       |

### CLI 拡張機能の管理

`qwen extensions` CLI コマンドを使用して、拡張機能を管理することもできます。CLI コマンドで行った変更は、再起動後にアクティブな CLI セッションに反映されます。

### 拡張機能のインストール

`qwen extensions install` コマンドを使用して、複数のソースから拡張機能をインストールできます。

#### Claude Code Marketplace からのインストール

Qwen Code では、[Claude Code Marketplace](https://claudemarketplaces.com/) のプラグインもサポートしています。Marketplace からプラグインをインストールし、目的のプラグインを選択します：

```bash
qwen extensions install <marketplace-name>

# または
qwen extensions install <marketplace-github-url>
```

特定のプラグインをインストールする場合は、プラグイン名を含む形式を使用できます：

```bash
qwen extensions install <marketplace-name>:<plugin-name>
```

# または
qwen extensions install <マーケットプレイスのGitHub URL>:<プラグイン名>
```

たとえば、[f/awesome-chatgpt-prompts](https://claudemarketplaces.com/plugins/f-awesome-chatgpt-prompts) マーケットプレイスから `prompts.chat` プラグインをインストールするには、以下のコマンドを実行します：

```bash
qwen extensions install f/awesome-chatgpt-prompts:prompts.chat

# または
qwen extensions install https://github.com/f/awesome-chatgpt-prompts:prompts.chat
```

Claude プラグインは、インストール時に自動的に Qwen Code 形式に変換されます：

- `claude-plugin.json` は `qwen-extension.json` に変換されます
- エージェント設定は Qwen のサブエージェント形式に変換されます
- スキル設定は Qwen のスキル形式に変換されます
- ツールのマッピングは自動的に処理されます

`/extensions explore` コマンドを使用すると、さまざまなマーケットプレイスで利用可能な拡張機能をすばやく閲覧できます：

```bash

# Gemini CLI Extensions マーケットプレイスを開く
/extensions explore Gemini

# Claude Code マーケットプレイスを開く
/extensions を実行して Claude Code を探索する
```

このコマンドは、デフォルトのブラウザで対応するマーケットプレイスを開き、Qwen Code の体験を向上させる新しい拡張機能を発見できるようにします。

> **クロスプラットフォーム互換性**: これにより、Gemini CLI および Claude Code の豊富な拡張機能エコシステムを活用でき、Qwen Code ユーザーが利用可能な機能を大幅に拡張します。

#### Gemini CLI 拡張機能から

Qwen Code は、[Gemini CLI Extensions Gallery](https://geminicli.com/extensions/) からの拡張機能を完全にサポートしています。以下の git URL を使用して、簡単にインストールできます。

```bash
qwen extensions install <gemini-cli-extension-github-url>

# または
qwen extensions install <owner>/<repo>
```

Gemini 拡張機能は、インストール時に自動的に Qwen Code 形式に変換されます。

- `gemini-extension.json` は `qwen-extension.json` に変換されます
- TOML 形式のコマンドファイルは、自動的に Markdown 形式に移行されます
- MCP サーバー、コンテキストファイル、設定は保持されます

#### Git リポジトリからのインストール

```bash
qwen extensions install https://github.com/github/github-mcp-server
```

これにより、GitHub MCP サーバー拡張機能がインストールされます。

#### ローカルパスからのインストール

```bash
qwen extensions install /path/to/your/extension
```

インストールされた拡張機能はコピーが作成されるため、ローカルで定義された拡張機能や GitHub 上の拡張機能に加えられた変更を反映するには、`qwen extensions update` を実行する必要があります。

### 拡張機能のアンインストール

アンインストールするには、`qwen extensions uninstall 拡張機能名` を実行します。先ほどのインストール例の場合、以下のコマンドを実行します：

```
qwen extensions uninstall qwen-cli-security
```

### 拡張機能の無効化

拡張機能はデフォルトで、すべてのワークスペースで有効になっています。拡張機能を完全に無効化するか、特定のワークスペースのみで無効化することができます。

たとえば、`qwen extensions disable extension-name` はユーザー単位で拡張機能を無効化し、すべての場所で無効になります。一方、`qwen extensions disable extension-name --scope=workspace` は現在のワークスペース内でのみ拡張機能を無効化します。

### 拡張機能の有効化

`qwen extensions enable extension-name` を使用して、拡張機能を有効化できます。また、そのワークスペース内で `qwen extensions enable extension-name --scope=workspace` を実行することで、特定のワークスペースでのみ拡張機能を有効化することもできます。

これは、拡張機能を最上位レベルで無効化しており、特定の場所でのみ有効化したい場合に便利です。

### 拡張機能の更新

ローカルパスまたは Git リポジトリからインストールされた拡張機能については、`qwen-extension.json` の `version` フィールドに記載された最新バージョンへ明示的に更新できます。コマンドは以下の通りです。

```
qwen extensions update extension-name
```

すべての拡張機能を一括で更新するには、以下のコマンドを実行します。

```
qwen extensions update --all
```

## 動作原理

起動時、Qwen Code は `<home>/.qwen/extensions` ディレクトリ内に拡張機能を探します。

拡張機能は、`qwen-extension.json` ファイルを含むディレクトリとして存在します。たとえば、以下のようになります。

`<home>/.qwen/extensions/my-extension/qwen-extension.json`

### `qwen-extension.json`

`qwen-extension.json` ファイルには、拡張機能の設定が含まれています。このファイルの構造は以下の通りです。

```json
{
  "name": "my-extension",
  "version": "1.0.0",
  "mcpServers": {
    "my-server": {
      "command": "node my-server.js"
    }
  },
  "contextFileName": "QWEN.md",
  "commands": "commands",
  "skills": "skills",
  "agents": "agents",
  "settings": [
    {
      "name": "API Key",
      "description": "サービスを利用するための API キー",
      "envVar": "MY_API_KEY",
      "sensitive": true
    }
  ]
}
```

- `name`: 拡張機能の名前です。これは拡張機能を一意に識別するために使用され、また、拡張機能のコマンド名がユーザーまたはプロジェクトのコマンドと重複した場合の競合解決にも用いられます。名前は小文字または数字のみを使用し、アンダースコアや空白の代わりにハイフン（`-`）を使用してください。ユーザーは CLI でこの名前を使って拡張機能を参照します。なお、この名前は拡張機能のディレクトリ名と一致する必要があります。
- `version`: 拡張機能のバージョンです。
- `mcpServers`: 設定する MCP サーバーのマップです。キーはサーバー名、値はサーバーの設定です。これらのサーバーは、[`settings.json` ファイル](./cli/configuration.md) で設定された MCP サーバーと同様に、起動時に読み込まれます。拡張機能と `settings.json` の両方で同じ名前の MCP サーバーが設定されている場合、`settings.json` で定義されたサーバーが優先されます。
  - ただし、`trust` を除くすべての MCP サーバー設定オプションがサポートされています。
- `contextFileName`: 拡張機能のコンテキストを含むファイルの名前です。このファイルは拡張機能ディレクトリからコンテキストを読み込むために使用されます。このプロパティが指定されておらず、かつ拡張機能ディレクトリに `QWEN.md` ファイルが存在する場合は、そのファイルが読み込まれます。
- `commands`: カスタムコマンド（デフォルト: `commands`）を格納するディレクトリです。コマンドは、プロンプトを定義する `.md` ファイルです。
- `skills`: カスタムスキル（デフォルト: `skills`）を格納するディレクトリです。スキルは自動的に検出され、`/skills` コマンド経由で利用可能になります。
- `agents`: カスタムサブエージェント（デフォルト: `agents`）を格納するディレクトリです。サブエージェントは、専門化された AI アシスタントを定義する `.yaml` または `.md` ファイルです。
- `settings`: 拡張機能が必要とする設定の配列です。インストール時に、ユーザーはこれらの設定値の入力を求められます。入力された値は安全に保存され、MCP サーバーに環境変数として渡されます。
  - 各設定には以下のプロパティがあります：
    - `name`: 設定の表示名
    - `description`: この設定の用途に関する説明
    - `envVar`: 設定される環境変数名
    - `sensitive`: 値を非表示にするかどうかを示すブール値（例：API キーやパスワードなど）

### 拡張機能の設定の管理

拡張機能は、設定（例：API キーや認証情報など）による構成を必要とする場合があります。これらの設定は、`qwen extensions settings` CLI コマンドを使用して管理できます。

**設定値を設定する:**

```bash
qwen extensions settings set <拡張機能名> <設定名> [--scope user|workspace]
```

**拡張機能のすべての設定を一覧表示する:**

```bash
qwen extensions settings list <拡張機能名>
```

**現在の値（ユーザー設定およびワークスペース設定）を表示する:**

```bash
qwen extensions settings show <拡張機能名> <設定名>
```

**設定値を削除する:**

```bash
qwen extensions settings unset <拡張機能名> <設定名> [--scope user|workspace]
```

設定は以下の 2 つのレベルで構成できます。

- **ユーザー レベル**（デフォルト）：すべてのプロジェクトに適用される設定（`~/.qwen/.env`）
- **ワークスペース レベル**：現在のプロジェクトのみに適用される設定（`.qwen/.env`）

ワークスペース設定は、ユーザー設定よりも優先されます。機密性の高い設定は安全に保存され、平文で表示されることはありません。

Qwen Code を起動すると、すべての拡張機能が読み込まれ、その設定が統合されます。設定に競合がある場合は、ワークスペースの設定が優先されます。

### カスタムコマンド

拡張機能は、拡張機能ディレクトリ内の `commands/` サブディレクトリに Markdown ファイルを配置することで、[カスタムコマンド](./cli/commands.md#custom-commands) を提供できます。これらのコマンドは、ユーザーおよびプロジェクトのカスタムコマンドと同じ形式に従い、標準的な命名規則を使用します。

> **注意:** コマンドの形式は TOML から Markdown に更新されました。TOML ファイルは非推奨ですが、引き続きサポートされています。既存の TOML コマンドは、TOML ファイルが検出された際に表示される自動移行プロンプトを使用して移行できます。

**例**

以下の構造を持つ `gcp` という名前の拡張機能:

```
.qwen/extensions/gcp/
├── qwen-extension.json
└── commands/
    ├── deploy.md
    └── gcs/
        └── sync.md
```

次のコマンドを提供します:

- `/deploy` — ヘルプでは `[gcp] deploy.md からのカスタムコマンド` として表示されます
- `/gcs:sync` — ヘルプでは `[gcp] sync.md からのカスタムコマンド` として表示されます

### カスタムスキル

拡張機能は、拡張機能ディレクトリ内の `skills/` サブディレクトリにスキルファイルを配置することで、カスタムスキルを提供できます。各スキルには、YAML フロントマターでスキル名と説明を定義した `SKILL.md` ファイルが必要です。

**例**

```
.qwen/extensions/my-extension/
├── qwen-extension.json
└── skills/
    └── pdf-processor/
        └── SKILL.md
```

拡張機能が有効な状態で `/skills` コマンドを実行すると、そのスキルが利用可能になります。

### カスタムサブエージェント

拡張機能は、拡張機能ディレクトリ内の `agents/` サブディレクトリにエージェント設定ファイルを配置することで、カスタムサブエージェントを提供できます。エージェントは YAML または Markdown ファイルで定義します。

**例**

```
.qwen/extensions/my-extension/
├── qwen-extension.json
└── agents/
    └── testing-expert.yaml
```

拡張機能のサブエージェントは、サブエージェントマネージャーのダイアログ内「拡張機能エージェント」セクションに表示されます。

### 競合の解決

拡張機能のコマンドは、優先度が最も低くなります。ユーザーまたはプロジェクトのコマンドと競合が発生した場合：

1. **競合がない場合**：拡張機能のコマンドは、その自然な名前（例：`/deploy`）を使用します。
2. **競合がある場合**：拡張機能のコマンドは、拡張機能のプレフィックスを付けて名前が変更されます（例：`/gcp.deploy`）。

たとえば、ユーザーと `gcp` 拡張機能の両方が `deploy` コマンドを定義している場合：

- `/deploy` — ユーザーの deploy コマンドを実行します。
- `/gcp.deploy` — 拡張機能の deploy コマンドを実行します（`[gcp]` タグでマークされています）。

## 変数

Qwen Code 拡張機能では、`qwen-extension.json` 内で変数置換が可能です。たとえば、MCP サーバーを実行する際に現在のディレクトリを指定する必要がある場合、「`"cwd": "${extensionPath}${/}run.ts"`」のように記述できます。

**サポートされている変数:**

| 変数                         | 説明                                                                                                                                                            |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `${extensionPath}`           | ユーザーのファイルシステム内における拡張機能の完全修飾パス（例：`/Users/username/.qwen/extensions/example-extension`）。シンボリックリンクは展開されません。 |
| `${workspacePath}`           | 現在のワークスペースの完全修飾パス。                                                                                                                            |
| `${/}` または `${pathSeparator}` | パス区切り文字（OS によって異なります）。                                                                                                                       |