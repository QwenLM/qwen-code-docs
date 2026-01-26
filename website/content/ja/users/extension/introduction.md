# Qwen Code 拡張機能

Qwen Code 拡張機能パッケージは、プロンプト、MCPサーバー、サブエージェント、スキル、およびカスタムコマンドを、馴染み深くユーザーフレンドリーな形式にまとめます。拡張機能を使用することで、Qwen Code の機能を拡張し、その機能を他の人と共有できます。これらは簡単にインストールおよび共有できるように設計されています。

[Gemini CLI Extensions Gallery](https://geminicli.com/extensions/) および [Claude Code Marketplace](https://claudemarketplaces.com/) から提供される拡張機能やプラグインは、Qwen Code に直接インストールできます。このクロスプラットフォーム互換性により、拡張機能の作成者が別バージョンを管理する必要なく、Qwen Code の機能を大幅に拡張できる豊富な拡張機能・プラグインエコシステムを利用できます。

## 拡張機能の管理

拡張機能管理ツール群として、`qwen extensions` CLI コマンドと、対話型 CLI 内の `/extensions` スラッシュコマンドの両方を提供しています。

### ランタイム拡張機能管理（スラッシュコマンド）

対話型CLI内で `/extensions` スラッシュコマンドを使用して、実行時に拡張機能を管理できます。これらのコマンドはホットリロードをサポートしており、アプリケーションを再起動することなく変更が即座に反映されます。

| コマンド                                               | 説明                                                              |
| ------------------------------------------------------ | ----------------------------------------------------------------- |
| `/extensions` または `/extensions list`                | インストールされているすべての拡張機能とそのステータスを一覧表示   |
| `/extensions install <source>`                         | Git URL、ローカルパス、またはマーケットプレイスから拡張機能をインストール |
| `/extensions uninstall <name>`                         | 拡張機能をアンインストール                                         |
| `/extensions enable <name> --scope <user\|workspace>`  | 拡張機能を有効化                                                  |
| `/extensions disable <name> --scope <user\|workspace>` | 拡張機能を無効化                                                  |
| `/extensions update <name>`                            | 特定の拡張機能を更新                                              |
| `/extensions update --all`                             | 利用可能な更新があるすべての拡張機能を更新                        |
| `/extensions detail <name>`                            | 拡張機能の詳細を表示                                              |
| `/extensions explore [source]`                         | ブラウザで拡張機能ソースページ（Gemini または ClaudeCode）を開く    |

### CLI 拡張機能管理

`qwen extensions` CLI コマンドを使用して、拡張機能を管理することもできます。CLI コマンドで行った変更は、再起動時にアクティブな CLI セッションに反映されることに注意してください。

### 拡張機能のインストール

複数のソースから `qwen extensions install` を使用して拡張機能をインストールできます。

#### Claude Code Marketplace から

Qwen Code は [Claude Code Marketplace](https://claudemarketplaces.com/) のプラグインもサポートしています。マーケットプレースからインストールし、プラグインを選択します：

```bash
qwen extensions install <marketplace-name>

# または
qwen extensions install <marketplace-github-url>
```

特定のプラグインをインストールしたい場合は、プラグイン名を含む形式を使用できます：

```bash
qwen extensions install <marketplace-name>:<plugin-name>
```

# または
qwen extensions install <マーケットプレース-GitHub-URL>:<プラグイン名>
```

たとえば、[f/awesome-chatgpt-prompts](https://claudemarketplaces.com/plugins/f-awesome-chatgpt-prompts) マーケットプレースから `prompts.chat` プラグインをインストールする場合：

```bash
qwen extensions install f/awesome-chatgpt-prompts:prompts.chat

# または
qwen extensions install https://github.com/f/awesome-chatgpt-prompts:prompts.chat
```

Claude プラグインはインストール時に自動的に Qwen Code 形式に変換されます：

- `claude-plugin.json` は `qwen-extension.json` に変換されます
- エージェント設定は Qwen サブエージェント形式に変換されます
- スキル設定は Qwen スキル形式に変換されます
- ツールマッピングは自動的に処理されます

`/extensions explore` コマンドを使用して、さまざまなマーケットプレースで利用可能な拡張機能をすばやく参照できます：

```bash

# Gemini CLI Extensions マーケットプレースを開く
/extensions explore Gemini

# Claude Codeマーケットプレイスを開く
/extensions explore ClaudeCode
```

このコマンドは、デフォルトブラウザでそれぞれのマーケットプレイスを開き、Qwen Code体験を強化する新しいエクステンションを見つけることができます。

> **クロスプラットフォーム互換性**: これにより、Gemini CLIとClaude Codeの両方の豊富なエクステンションエコシステムを活用でき、Qwen Codeユーザーが利用できる機能が大幅に拡張されます。

#### Gemini CLIエクステンションについて

Qwen Codeは[Gemini CLIエクステンショングラレリー](https://geminicli.com/extensions/)のエクステンションを完全にサポートしています。git URLを使用してインストールしてください：

```bash
qwen extensions install <gemini-cli-extension-github-url>

# または
qwen extensions install <owner>/<repo>
```

Geminiエクステンションはインストール時に自動的にQwen Code形式に変換されます：

- `gemini-extension.json` は `qwen-extension.json` に変換されます
- TOMLコマンドファイルは自動的にMarkdown形式に移行されます
- MCPサーバー、コンテキストファイル、設定は保持されます

#### Git リポジトリから

```bash
qwen extensions install https://github.com/github/github-mcp-server
```

これにより、github mcp server 拡張機能がインストールされます。

#### ローカルパスから

```bash
qwen extensions install /path/to/your/extension
```

インストールされた拡張機能のコピーを作成するため、ローカルで定義された拡張機能と GitHub 上の拡張機能の変更を取り込むには、`qwen extensions update` を実行する必要があります。

### 拡張機能のアンインストール

アンインストールするには、`qwen extensions uninstall 拡張機能名` を実行します。したがって、インストール例の場合：

```
qwen extensions uninstall qwen-cli-security
```

### 拡張機能の無効化

デフォルトでは、拡張機能はすべてのワークスペースで有効になっています。拡張機能を完全に無効にするか、特定のワークスペースでのみ無効にすることができます。

たとえば、`qwen extensions disable extension-name` はユーザー レベルで拡張機能を無効にするため、どこでも無効になります。`qwen extensions disable extension-name --scope=workspace` は現在のワークスペースでのみ拡張機能を無効にします。

### 拡張機能の有効化

`qwen extensions enable extension-name` を使用して拡張機能を有効にすることができます。また、そのワークスペース内で `qwen extensions enable extension-name --scope=workspace` を実行することで、特定のワークスペースでのみ拡張機能を有効にすることもできます。

これは、最上位レベルで拡張機能が無効になっており、特定の場所でのみ有効にしたい場合に便利です。

### 拡張機能の更新

ローカルパスまたはGitリポジトリからインストールされた拡張機能については、`qwen extensions update 拡張機能名` を使用して、明示的に最新バージョン（`qwen-extension.json` の `version` フィールドに反映されているバージョン）へ更新できます。

すべての拡張機能を更新するには、以下を実行します：

```
qwen extensions update --all
```

## 動作原理

起動時に、Qwen Code は `<ホーム>/.qwen/extensions` 内の拡張機能を探します。

拡張機能は `qwen-extension.json` ファイルを含むディレクトリとして存在します。例：

`<ホーム>/.qwen/extensions/my-extension/qwen-extension.json`

### `qwen-extension.json`

`qwen-extension.json` ファイルには、拡張機能の設定が含まれています。ファイルは以下の構造を持っています。

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
      "description": "Your API key for the service",
      "envVar": "MY_API_KEY",
      "sensitive": true
    }
  ]
}
```

- `name`: 拡張機能の名前です。この名前は、拡張機能を一意に識別し、拡張機能のコマンドとユーザーまたはプロジェクトのコマンドの名前が重複した場合の競合解決に使用されます。名前は小文字または数字で、アンダースコアやスペースの代わりにハイフンを使用してください。これは、CLI でユーザーが拡張機能を参照する方法です。この名前は拡張機能ディレクトリ名と一致することを想定しています。
- `version`: 拡張機能のバージョンです。
- `mcpServers`: 設定する MCP サーバーのマップです。キーはサーバーの名前、値はサーバーの設定です。これらのサーバーは、[`settings.json` ファイル](./cli/configuration.md) で設定された MCP サーバーと同様に起動時に読み込まれます。拡張機能と `settings.json` ファイルの両方が同じ名前の MCP サーバーを設定している場合、`settings.json` ファイルで定義されたサーバーが優先されます。
  - `trust` を除くすべての MCP サーバー設定オプションがサポートされています。
- `contextFileName`: 拡張機能のコンテキストを含むファイル名です。これを使用して、拡張機能ディレクトリからコンテキストを読み込みます。このプロパティが使用されておらず、拡張機能ディレクトリに `QWEN.md` ファイルが存在する場合、そのファイルが読み込まれます。
- `commands`: カスタムコマンドを含むディレクトリ（デフォルト: `commands`）。コマンドはプロンプトを定義する `.md` ファイルです。
- `skills`: カスタムスキルを含むディレクトリ（デフォルト: `skills`）。スキルは自動的に検出され、`/skills` コマンド経由で利用可能になります。
- `agents`: カスタムサブエージェントを含むディレクトリ（デフォルト: `agents`）。サブエージェントは、専門的な AI アシスタントを定義する `.yaml` または `.md` ファイルです。
- `settings`: 拡張機能が必要とする設定の配列です。インストール時に、ユーザーにはこれらの設定の値を入力するよう求められます。値は安全に保存され、環境変数として MCP サーバーに渡されます。
  - 各設定には以下のプロパティがあります：
    - `name`: 設定の表示名
    - `description`: この設定の用途に関する説明
    - `envVar`: 設定される環境変数名
    - `sensitive`: 値を非表示にする必要があるかどうかを示すブール値（例：API キー、パスワード）

### 拡張機能の設定管理

拡張機能は、設定（API キーや認証情報など）を通じて構成を必要とする場合があります。これらの設定は、`qwen extensions settings` CLI コマンドを使用して管理できます。

**設定値を設定する:**

```bash
qwen extensions settings set <extension-name> <setting-name> [--scope user|workspace]
```

**拡張機能のすべての設定を一覧表示:**

```bash
qwen extensions settings list <extension-name>
```

**現在の値を表示 (ユーザーおよびワークスペース):**

```bash
qwen extensions settings show <extension-name> <setting-name>
```

**設定値を削除:**

```bash
qwen extensions settings unset <extension-name> <setting-name> [--scope user|workspace]
```

設定は以下の2つのレベルで構成できます。

- **ユーザー レベル** (デフォルト): すべてのプロジェクトにわたって設定が適用されます (`~/.qwen/.env`)
- **ワークスペース レベル**: 現在のプロジェクトに対してのみ設定が適用されます (`.qwen/.env`)

ワークスペースの設定は、ユーザーの設定より優先されます。機密性の高い設定は安全に保存され、決してプレーンテキストで表示されることはありません。

Qwen Code が起動すると、すべての拡張機能が読み込まれ、それらの構成がマージされます。競合が発生した場合は、ワークスペースの構成が優先されます。

### カスタムコマンド

拡張機能は、拡張ディレクトリ内の `commands/` サブディレクトリに Markdown ファイルを配置することで、[カスタムコマンド](./cli/commands.md#custom-commands) を提供できます。これらのコマンドは、ユーザーおよびプロジェクトのカスタムコマンドと同じ形式に従い、標準的な命名規則を使用します。

> **注釈:** コマンド形式が TOML から Markdown に更新されました。TOML ファイルは非推奨となりましたが、引き続きサポートされています。TOML ファイルが検出されたときに表示される自動移行プロンプトを使用して、既存の TOML コマンドを移行できます。

**例**

以下の構造を持つ `gcp` という名前の拡張機能の場合：

```
.qwen/extensions/gcp/
├── qwen-extension.json
└── commands/
    ├── deploy.md
    └── gcs/
        └── sync.md
```

以下のようなコマンドが提供されます：

- `/deploy` - ヘルプには `[gcp] Custom command from deploy.md` として表示されます
- `/gcs:sync` - ヘルプには `[gcp] Custom command from sync.md` として表示されます

### カスタムスキル

拡張機能は、拡張ディレクトリ内の `skills/` サブディレクトリにスキルファイルを配置することで、カスタムスキルを提供できます。各スキルには、YAML フロントマターでスキルの名前と説明を定義した `SKILL.md` ファイルが必要です。

**例**

```
.qwen/extensions/my-extension/
├── qwen-extension.json
└── skills/
    └── pdf-processor/
        └── SKILL.md
```

このスキルは、拡張機能が有効な状態で `/skills` コマンド経由で利用可能になります。

### カスタムサブエージェント

拡張機能は、拡張ディレクトリ内の `agents/` サブディレクトリにエージェント設定ファイルを配置することで、カスタムサブエージェントを提供できます。エージェントは YAML または Markdown ファイルを使用して定義されます。

**例**

```
.qwen/extensions/my-extension/
├── qwen-extension.json
└── agents/
    └── testing-expert.yaml
```

拡張機能のサブエージェントは、「拡張エージェント」セクションの下にあるサブエージェントマネージャーダイアログに表示されます。

### コンフリクトの解決

エクステンションコマンドは最も低い優先順位を持ちます。ユーザーまたはプロジェクトのコマンドと競合が発生した場合：

1. **競合なし**: エクステンションコマンドは自然な名前を使用します（例: `/deploy`）
2. **競合あり**: エクステンションコマンドはエクステンションのプレフィックス付きで名前変更されます（例: `/gcp.deploy`）

例えば、ユーザーと `gcp` エクステンションの両方が `deploy` コマンドを定義している場合：

- `/deploy` - ユーザーのデプロイコマンドを実行
- `/gcp.deploy` - エクステンションのデプロイコマンドを実行（`[gcp]` タグ付き）

## 変数

Qwen Code 拡張機能では、`qwen-extension.json` 内で変数置換が可能です。例えば、`"cwd": "${extensionPath}${/}run.ts"` のようにして現在のディレクトリを使用してMCPサーバーを実行する必要がある場合に便利です。

**サポートされている変数:**

| 変数                       | 説明                                                                                                                                                             |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `${extensionPath}`         | ユーザーのファイルシステムにおける拡張機能の完全修飾パス（例：'/Users/username/.qwen/extensions/example-extension'）。これはシンボリックリンクを展開しません。 |
| `${workspacePath}`         | 現在のワークスペースの完全修飾パス。                                                                                                                             |
| `${/} または ${pathSeparator}` | パス区切り文字（OSによって異なります）。                                                                                                                           |