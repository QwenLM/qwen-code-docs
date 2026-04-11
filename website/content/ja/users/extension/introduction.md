# Qwen Code 拡張機能

Qwen Code 拡張機能は、プロンプト、MCP サーバー、サブエージェント、スキル、カスタムコマンドを、使い慣れたユーザーフレンドリーな形式にパッケージ化します。拡張機能を使用することで、Qwen Code の機能を拡張し、他のユーザーと共有できます。インストールと共有が容易になるように設計されています。

[Gemini CLI Extensions Gallery](https://geminicli.com/extensions/) や [Claude Code Marketplace](https://claudemarketplaces.com/) の拡張機能やプラグインは、Qwen Code に直接インストールできます。このクロスプラットフォーム互換性により、豊富な拡張機能・プラグインのエコシステムを利用でき、拡張機能の開発者が別バージョンをメンテナンスする必要なく、Qwen Code の機能を大幅に拡張できます。

## 拡張機能の管理

`qwen extensions` CLI コマンドと、インタラクティブ CLI 内の `/extensions` スラッシュコマンドの両方を使用した、拡張機能管理ツールスイートを提供しています。

### ランタイム拡張機能管理（スラッシュコマンド）

インタラクティブ CLI 内で `/extensions` スラッシュコマンドを使用し、ランタイム中に拡張機能を管理できます。これらのコマンドはホットリロードをサポートしており、アプリケーションを再起動せずに変更を即時反映できます。

| コマンド                               | 説明                                                                  |
| ------------------------------------- | ---------------------------------------------------------------------------- |
| `/extensions` または `/extensions manage` | インストール済みのすべての拡張機能を管理                                              |
| `/extensions install <source>`        | git URL、ローカルパス、npm パッケージ、またはマーケットプレイスから拡張機能をインストール |
| `/extensions explore [source]`        | ブラウザで拡張機能のソースページ（Gemini または ClaudeCode）を開く            |

### CLI 拡張機能管理

`qwen extensions` CLI コマンドを使用して拡張機能を管理することもできます。CLI コマンドで行った変更は、再起動時にアクティブな CLI セッションに反映されます。

### 拡張機能のインストール

`qwen extensions install` を使用し、複数のソースから拡張機能をインストールできます。

#### Claude Code Marketplace からのインストール

Qwen Code は [Claude Code Marketplace](https://claudemarketplaces.com/) のプラグインもサポートしています。マーケットプレイスからインストールし、プラグインを選択します。

```bash
qwen extensions install <marketplace-name>
# or
qwen extensions install <marketplace-github-url>
```

特定のプラグインをインストールする場合は、プラグイン名を含む形式を使用します。

```bash
qwen extensions install <marketplace-name>:<plugin-name>
# or
qwen extensions install <marketplace-github-url>:<plugin-name>
```

例えば、[f/awesome-chatgpt-prompts](https://claudemarketplaces.com/plugins/f-awesome-chatgpt-prompts) マーケットプレイスから `prompts.chat` プラグインをインストールするには：

```bash
qwen extensions install f/awesome-chatgpt-prompts:prompts.chat
# or
qwen extensions install https://github.com/f/awesome-chatgpt-prompts:prompts.chat
```

Claude プラグインはインストール時に自動的に Qwen Code 形式に変換されます。

- `claude-plugin.json` が `qwen-extension.json` に変換されます
- エージェント設定が Qwen サブエージェント形式に変換されます
- スキル設定が Qwen スキル形式に変換されます
- ツールマッピングは自動的に処理されます

`/extensions explore` コマンドを使用すると、異なるマーケットプレイスで利用可能な拡張機能をすばやく閲覧できます。

```bash
# Open Gemini CLI Extensions marketplace
/extensions explore Gemini

# Open Claude Code marketplace
/extensions explore ClaudeCode
```

このコマンドはデフォルトのブラウザで該当するマーケットプレイスを開き、Qwen Code の体験を向上させる新しい拡張機能を見つけることができます。

> **クロスプラットフォーム互換性**: Gemini CLI と Claude Code の両方の豊富な拡張機能エコシステムを活用でき、Qwen Code ユーザーが利用可能な機能を大幅に拡張できます。

#### Gemini CLI 拡張機能からのインストール

Qwen Code は [Gemini CLI Extensions Gallery](https://geminicli.com/extensions/) の拡張機能を完全にサポートしています。git URL を使用してインストールするだけです。

```bash
qwen extensions install <gemini-cli-extension-github-url>
# or
qwen extensions install <owner>/<repo>
```

Gemini 拡張機能はインストール時に自動的に Qwen Code 形式に変換されます。

- `gemini-extension.json` が `qwen-extension.json` に変換されます
- TOML コマンドファイルは自動的に Markdown 形式に移行されます
- MCP サーバー、コンテキストファイル、設定は保持されます

#### npm レジストリからのインストール

Qwen Code は、スコープ付きパッケージ名を使用して npm レジストリから拡張機能をインストールすることをサポートしています。認証、バージョニング、公開インフラがすでに整っているプライベートレジストリを持つチームに最適です。

```bash
# Install the latest version
qwen extensions install @scope/my-extension

# Install a specific version
qwen extensions install @scope/my-extension@1.2.0

# Install from a custom registry
qwen extensions install @scope/my-extension --registry https://your-registry.com
```

`owner/repo` という GitHub 短縮形式との曖昧さを避けるため、スコープ付きパッケージ（`@scope/package-name`）のみがサポートされています。

**レジストリの解決**は以下の優先順位に従います。

1. `--registry` CLI フラグ（明示的な上書き）
2. `.npmrc` のスコープ付きレジストリ（例: `@scope:registry=https://...`）
3. `.npmrc` のデフォルトレジストリ
4. フォールバック: `https://registry.npmjs.org/`

**認証**は、`NPM_TOKEN` 環境変数または `.npmrc` ファイル内のレジストリ固有の `_authToken` エントリを介して自動的に処理されます。

> **注:** npm 拡張機能には、他の Qwen Code 拡張機能と同じ形式で、パッケージルートに `qwen-extension.json` ファイルを含める必要があります。パッケージ化の詳細については、[拡張機能のリリース](./extension-releasing.md#releasing-through-npm-registry) を参照してください。

#### Git リポジトリからのインストール

```bash
qwen extensions install https://github.com/github/github-mcp-server
```

これにより、GitHub MCP サーバー拡張機能がインストールされます。

#### ローカルパスからのインストール

```bash
qwen extensions install /path/to/your/extension
```

インストールされた拡張機能のコピーが作成されるため、ローカルで定義された拡張機能と GitHub 上の拡張機能の両方から変更を取り込むには、`qwen extensions update` を実行する必要があります。

### 拡張機能のアンインストール

アンインストールするには、`qwen extensions uninstall extension-name` を実行します。インストール例の場合：

```
qwen extensions uninstall qwen-cli-security
```

### 拡張機能の無効化

拡張機能はデフォルトですべてのワークスペースで有効になっています。拡張機能全体、または特定のワークスペースでのみ無効にできます。

例えば、`qwen extensions disable extension-name` はユーザーレベルで拡張機能を無効にするため、すべての場所で無効になります。`qwen extensions disable extension-name --scope=workspace` は、現在のワークスペースでのみ拡張機能を無効にします。

### 拡張機能の有効化

`qwen extensions enable extension-name` を使用して拡張機能を有効にできます。また、そのワークスペース内から `qwen extensions enable extension-name --scope=workspace` を使用して、特定のワークスペースに対して拡張機能を有効にすることもできます。

トップレベルで無効にし、特定の場所でのみ有効にしたい場合に便利です。

### 拡張機能の更新

ローカルパス、git リポジトリ、または npm レジストリからインストールした拡張機能は、`qwen extensions update extension-name` で明示的に最新バージョンに更新できます。バージョン固定なしでインストールした npm 拡張機能（例: `@scope/pkg`）の場合、更新時は `latest` dist-tag がチェックされます。特定の dist-tag でインストールした場合（例: `@scope/pkg@beta`）、更新時はそのタグが追跡されます。正確なバージョンに固定された拡張機能（例: `@scope/pkg@1.2.0`）は、常に最新とみなされます。

すべての拡張機能を更新するには：

```
qwen extensions update --all
```

## 動作の仕組み

起動時、Qwen Code は `<home>/.qwen/extensions` で拡張機能を検索します。

拡張機能は `qwen-extension.json` ファイルを含むディレクトリとして存在します。例：

`<home>/.qwen/extensions/my-extension/qwen-extension.json`

### `qwen-extension.json`

`qwen-extension.json` ファイルには拡張機能の設定が含まれています。ファイルの構造は以下の通りです。

```json
{
  "name": "my-extension",
  "version": "1.0.0",
  "mcpServers": {
    "my-server": {
      "command": "node my-server.js"
    }
  },
  "channels": {
    "my-platform": {
      "entry": "dist/index.js",
      "displayName": "My Platform Channel"
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

- `name`: 拡張機能の名前。拡張機能を一意に識別するため、および拡張機能のコマンドがユーザーまたはプロジェクトのコマンドと同名の場合の競合解決に使用されます。名前は小文字または数字にし、アンダースコアやスペースの代わりにダッシュを使用してください。これは CLI でユーザーが拡張機能を参照する方法です。この名前は拡張機能のディレクトリ名と一致している必要があります。
- `version`: 拡張機能のバージョン。
- `mcpServers`: 設定する MCP サーバーのマップ。キーはサーバー名、値はサーバー設定です。これらのサーバーは、[`settings.json` ファイル](./cli/configuration.md) で設定された MCP サーバーと同様に、起動時に読み込まれます。拡張機能と `settings.json` ファイルの両方が同じ名前の MCP サーバーを設定している場合、`settings.json` ファイルで定義されたサーバーが優先されます。
  - `trust` を除くすべての MCP サーバー設定オプションがサポートされている点に注意してください。
- `channels`: カスタムチャネルアダプターのマップ。キーはチャネルタイプ名、値には `entry`（コンパイル済み JS エントリポイントへのパス）とオプションの `displayName` が含まれます。エントリポイントは、`ChannelPlugin` インターフェースに準拠した `plugin` オブジェクトをエクスポートする必要があります。詳細なガイドは [チャネルプラグイン](../features/channels/plugins) を参照してください。
- `contextFileName`: 拡張機能のコンテキストを含むファイルの名前。拡張機能ディレクトリからコンテキストを読み込むために使用されます。このプロパティが使用されていない場合でも、拡張機能ディレクトリに `QWEN.md` ファイルが存在すれば、そのファイルが読み込まれます。
- `commands`: カスタムコマンドを含むディレクトリ（デフォルト: `commands`）。コマンドはプロンプトを定義する `.md` ファイルです。
- `skills`: カスタムスキルを含むディレクトリ（デフォルト: `skills`）。スキルは自動的に検出され、`/skills` コマンド経由で利用可能になります。
- `agents`: カスタムサブエージェントを含むディレクトリ（デフォルト: `agents`）。サブエージェントは、専門化された AI アシスタントを定義する `.yaml` または `.md` ファイルです。
- `settings`: 拡張機能が必要とする設定の配列。インストール時、ユーザーはこれらの設定の値の入力を求められます。値は安全に保存され、環境変数として MCP サーバーに渡されます。
  - 各設定には以下のプロパティがあります。
    - `name`: 設定の表示名
    - `description`: この設定の用途の説明
    - `envVar`: 設定される環境変数名
    - `sensitive`: 値を非表示にするかどうかを示すブール値（例: API キー、パスワード）

### 拡張機能設定の管理

拡張機能は、設定（API キーや認証情報など）を介して構成を要求できます。これらの設定は `qwen extensions settings` CLI コマンドを使用して管理できます。

**設定値の設定:**

```bash
qwen extensions settings set <extension-name> <setting-name> [--scope user|workspace]
```

**拡張機能のすべての設定の一覧表示:**

```bash
qwen extensions settings list <extension-name>
```

**現在の値の表示（ユーザーとワークスペース）:**

```bash
qwen extensions settings show <extension-name> <setting-name>
```

**設定値の削除:**

```bash
qwen extensions settings unset <extension-name> <setting-name> [--scope user|workspace]
```

設定は 2 つのレベルで構成できます。

- **ユーザーレベル**（デフォルト）: すべてのプロジェクトに適用されます（`~/.qwen/.env`）
- **ワークスペースレベル**: 現在のプロジェクトのみに適用されます（`.qwen/.env`）

ワークスペース設定はユーザー設定より優先されます。機密設定は安全に保存され、プレーンテキストで表示されることはありません。

Qwen Code の起動時、すべての拡張機能が読み込まれ、その設定がマージされます。競合がある場合、ワークスペース設定が優先されます。

### カスタムコマンド

拡張機能は、拡張機能ディレクトリ内の `commands/` サブディレクトリに Markdown ファイルを配置することで、[カスタムコマンド](./cli/commands.md#custom-commands) を提供できます。これらのコマンドは、ユーザーおよびプロジェクトのカスタムコマンドと同じ形式に従い、標準的な命名規則を使用します。

> **注:** コマンド形式は TOML から Markdown に更新されました。TOML ファイルは非推奨ですが、引き続きサポートされています。TOML ファイルが検出されたときに表示される自動移行プロンプトを使用して、既存の TOML コマンドを移行できます。

**例**

構造が以下の `gcp` という名前の拡張機能：

```
.qwen/extensions/gcp/
├── qwen-extension.json
└── commands/
    ├── deploy.md
    └── gcs/
        └── sync.md
```

以下のコマンドを提供します。

- `/deploy` - ヘルプに `[gcp] Custom command from deploy.md` として表示
- `/gcs:sync` - ヘルプに `[gcp] Custom command from sync.md` として表示

### カスタムスキル

拡張機能は、拡張機能ディレクトリ内の `skills/` サブディレクトリにスキルファイルを配置することで、カスタムスキルを提供できます。各スキルには、スキルの名前と説明を定義する YAML フロントマターを含む `SKILL.md` ファイルが必要です。

**例**

```
.qwen/extensions/my-extension/
├── qwen-extension.json
└── skills/
    └── pdf-processor/
        └── SKILL.md
```

拡張機能がアクティブな場合、このスキルは `/skills` コマンド経由で利用可能になります。

### カスタムサブエージェント

拡張機能は、拡張機能ディレクトリ内の `agents/` サブディレクトリにエージェント設定ファイルを配置することで、カスタムサブエージェントを提供できます。エージェントは YAML または Markdown ファイルを使用して定義されます。

**例**

```
.qwen/extensions/my-extension/
├── qwen-extension.json
└── agents/
    └── testing-expert.yaml
```

拡張機能のサブエージェントは、サブエージェントマネージャーダイアログの「Extension Agents」セクションに表示されます。

### 競合解決

拡張機能のコマンドは最も低い優先順位を持ちます。ユーザーまたはプロジェクトのコマンドと競合が発生した場合：

1. **競合なし**: 拡張機能のコマンドは本来の名前を使用します（例: `/deploy`）
2. **競合あり**: 拡張機能のコマンドは拡張機能プレフィックス付きの名前に変更されます（例: `/gcp.deploy`）

例えば、ユーザーと `gcp` 拡張機能の両方が `deploy` コマンドを定義している場合：

- `/deploy` - ユーザーの deploy コマンドを実行
- `/gcp.deploy` - 拡張機能の deploy コマンドを実行（`[gcp]` タグ付き）

## 変数

Qwen Code 拡張機能では、`qwen-extension.json` 内で変数置換を使用できます。例えば、`"cwd": "${extensionPath}${/}run.ts"` を使用して MCP サーバーを実行するために現在のディレクトリが必要な場合に便利です。

**サポートされている変数:**

| 変数                   | 説明                                                                                                                                                   |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `${extensionPath}`         | ユーザーのファイルシステムにおける拡張機能の絶対パス（例: `/Users/username/.qwen/extensions/example-extension`）。シンボリックリンクは展開されません。 |
| `${workspacePath}`         | 現在のワークスペースの絶対パス。                                                                                                            |
| `${/} または ${pathSeparator}` | パス区切り文字（OS によって異なります）。                                                                                                                          |