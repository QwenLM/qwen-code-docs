# Qwen Code 拡張機能

Qwen Code 拡張機能は、プロンプト、MCPサーバー、サブエージェント、スキル、カスタムコマンドを、使い慣れたユーザーフレンドリーな形式にパッケージ化します。拡張機能を使用すると、Qwen Code の機能を拡張し、それらの機能を他のユーザーと共有できます。拡張機能は、簡単にインストールして共有できるように設計されています。

[Gemini CLI Extensions Gallery](https://geminicli.com/extensions/) および [Claude Code Marketplace](https://claudemarketplaces.com/) の拡張機能とプラグインは、Qwen Code に直接インストールできます。このクロスプラットフォーム互換性により、拡張機能の作成者が別バージョンを維持する必要なく、豊富な拡張機能エコシステムにアクセスでき、Qwen Code の機能を大幅に拡張できます。

## 拡張機能の管理

`qwen extensions` CLI コマンドと、インタラクティブ CLI 内の `/extensions` スラッシュコマンドの両方を使用して、拡張機能管理ツールのスイートを提供しています。

### ランタイム拡張機能管理（スラッシュコマンド）

インタラクティブ CLI 内で `/extensions` スラッシュコマンドを使用して、ランタイムで拡張機能を管理できます。これらのコマンドはホットリロードをサポートしているため、アプリケーションを再起動しなくても変更がすぐに反映されます。

| コマンド                              | 説明                                                                                                            |
| ------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `/extensions` または `/extensions manage` | インストールされているすべての拡張機能を管理する                                                                        |
| `/extensions install <source>`        | Git URL、ローカルパスまたはアーカイブ、アーカイブURL、npmパッケージ、マーケットプレイスから拡張機能をインストールする                              |
| `/extensions explore [source]`        | ブラウザで拡張機能のソースページ（Gemini または ClaudeCode）を開く                                                            |

#### インタラクティブ拡張機能マネージャー

`/extensions`（または `/extensions manage`）を実行すると、3つのタブを持つインタラクティブマネージャーが開きます。`Tab` キーまたは `←`/`→` キーでタブを切り替えます。

- **Discover** — 設定済みのマーケットプレイスソースからプラグインを参照します。入力して検索、`Enter` でプラグインの詳細を表示し、インストールします（インストールスコープの選択が求められます）。`Ctrl+R` でリストを再取得し、`Esc` で戻ります。
- **Installed** — インストール済みの拡張機能がスコープ別（**ユーザーレベル**、**プロジェクトレベル**、お気に入り）にグループ化されて表示されます。`↑`/`↓` で移動、`Space` で拡張機能の有効/無効を切り替え、`f` でお気に入りに追加、`Enter` で詳細を開きます。拡張機能にバンドルされた MCP サーバーは、親拡張機能の下にネストされ、ライブ接続状態が表示されます。各サーバーは個別に有効/無効にできます。
- **Sources** — Discover タブに表示するマーケットプレイスソースを管理します。`↑`/`↓` で移動、`Enter` でソースを選択、`d` で削除します。これらは、後述の `qwen extensions sources` CLI コマンドで管理されるソースと同じものです。

ここでの変更は、Qwen Code を再起動することなく、即座にホットリロードされます。

### CLI による拡張機能管理

`qwen extensions` CLI コマンドを使用して拡張機能を管理することもできます。CLI コマンドによる変更は、再起動後にアクティブな CLI セッションに反映されることに注意してください。

### 拡張機能のインストール

複数のソースから、`qwen extensions install` を使用して拡張機能をインストールできます。

#### Claude Code マーケットプレイスから

Qwen Code は [Claude Code Marketplace](https://claudemarketplaces.com/) のプラグインもサポートしています。マーケットプレイスからインストールしてプラグインを選択します。

```bash
qwen extensions install <marketplace-name>
# または
qwen extensions install <marketplace-github-url>
```

特定のプラグインをインストールする場合は、プラグイン名を含む形式を使用できます。

```bash
qwen extensions install <marketplace-name>:<plugin-name>
# または
qwen extensions install <marketplace-github-url>:<plugin-name>
```

例えば、[f/awesome-chatgpt-prompts](https://claudemarketplaces.com/plugins/f-awesome-chatgpt-prompts) マーケットプレイスから `prompts.chat` プラグインをインストールする場合:

```bash
qwen extensions install f/awesome-chatgpt-prompts:prompts.chat
# または
qwen extensions install https://github.com/f/awesome-chatgpt-prompts:prompts.chat
```

Claude プラグインはインストール中に自動的に Qwen Code 形式に変換されます。

- `claude-plugin.json` は `qwen-extension.json` に変換されます
- エージェント設定は Qwen サブエージェント形式に変換されます
- スキル設定は Qwen スキル形式に変換されます
- ツールマッピングは自動的に処理されます

`/extensions explore` コマンドを使用すると、さまざまなマーケットプレイスから利用可能な拡張機能をすばやく参照できます。

```bash
# Gemini CLI Extensions マーケットプレイスを開く
/extensions explore Gemini

# Claude Code マーケットプレイスを開く
/extensions explore ClaudeCode
```

このコマンドは、デフォルトのブラウザでそれぞれのマーケットプレイスを開き、Qwen Code 体験を強化する新しい拡張機能を見つけることができます。

> **クロスプラットフォーム互換性**: これにより、Gemini CLI と Claude Code の両方の豊富な拡張機能エコシステムを活用でき、Qwen Code ユーザーが利用できる機能を大幅に拡張できます。

#### Gemini CLI 拡張機能から

Qwen Code は [Gemini CLI Extensions Gallery](https://geminicli.com/extensions/) の拡張機能を完全にサポートしています。Git URL を使用してインストールするだけです。

```bash
qwen extensions install <gemini-cli-extension-github-url>
# または
qwen extensions install <owner>/<repo>
```

Gemini 拡張機能はインストール中に自動的に Qwen Code 形式に変換されます。

- `gemini-extension.json` は `qwen-extension.json` に変換されます
- TOML コマンドファイルは自動的に Markdown 形式に移行されます
- MCP サーバー、コンテキストファイル、設定は保持されます

#### npm レジストリから

Qwen Code は、スコープ付きパッケージ名を使用した npm レジストリからの拡張機能のインストールをサポートしています。これは、認証、バージョン管理、公開インフラがすでに整っているチームのプライベートレジストリに最適です。

```bash
# 最新バージョンをインストール
qwen extensions install @scope/my-extension

# 特定のバージョンをインストール
qwen extensions install @scope/my-extension@1.2.0

# カスタムレジストリからインストール
qwen extensions install @scope/my-extension --registry https://your-registry.com
```

`owner/repo` GitHub ショートハンド形式との曖昧さを避けるため、スコープ付きパッケージ（`@scope/package-name`）のみがサポートされています。

**レジストリ解決** は次の優先順位に従います。

1. `--registry` CLI フラグ（明示的なオーバーライド）
2. `.npmrc` のスコープ付きレジストリ（例: `@scope:registry=https://...`）
3. `.npmrc` のデフォルトレジストリ
4. フォールバック: `https://registry.npmjs.org/`

**認証** は、`NPM_TOKEN` 環境変数、または `.npmrc` ファイルのレジストリ固有の `_authToken` エントリを介して自動的に処理されます。

> **注:** npm 拡張機能は、パッケージルートに `qwen-extension.json` ファイルを含める必要があります。形式は他の Qwen Code 拡張機能と同じです。パッケージの詳細については、[拡張機能のリリース](./extension-releasing.md#releasing-through-npm-registry) を参照してください。

#### Git リポジトリから

```bash
qwen extensions install https://github.com/github/github-mcp-server
```

これにより、github mcp server 拡張機能がインストールされます。

#### ローカルパスから

```bash
qwen extensions install /path/to/your/extension
```

ローカルの `.zip` および `.tar.gz` アーカイブもサポートされています。

```bash
qwen extensions install /path/to/your/extension.zip
qwen extensions install /path/to/your/extension.tar.gz
```

アーカイブには、ルートに完全な拡張機能が含まれているか、拡張機能を含む単一のトップレベルディレクトリが含まれている必要があります。

インストールされた拡張機能のコピーが作成されるため、ローカルで定義された拡張機能と GitHub 上の拡張機能の両方の変更を反映するには、`qwen extensions update` を実行する必要があることに注意してください。

#### アーカイブ URL から

```bash
qwen extensions install https://example.com/your/extension.zip
qwen extensions install https://example.com/your/extension.tar.gz
```

アーカイブ URL は、URL が同じ拡張機能の新しいアーカイブを引き続き指している限り、後で更新できます。

#### インストールスコープの選択

デフォルトでは、インストールされた拡張機能はグローバルに有効になります（ユーザースコープ）。現在のワークスペースでのみ有効にするには、`--scope project` を渡します。

```bash
qwen extensions install <source> --scope project
```

`--scope workspace` は `--scope project` のエイリアスとして受け入れられます。これは、`/extensions manage` の Discover タブからインストールするときに提供されるスコープ選択と一致します。

### マーケットプレイスソースの管理

マーケットプレイスソース（Claude プラグインマーケットプレイス）は、`/extensions manage` の Discover タブを強化します。CLI からも管理できます。

```bash
# マーケットプレイスを追加（owner/repo、git URL、marketplace.json への https URL、ローカルパス）
qwen extensions sources add <source>

# 設定済みのマーケットプレイスを一覧表示
qwen extensions sources list

# マーケットプレイスのプラグインリストを再取得
qwen extensions sources update <name>

# マーケットプレイスを削除
qwen extensions sources remove <name>
```

### 拡張機能のアンインストール

アンインストールするには、`qwen extensions uninstall extension-name` を実行します。インストールの例の場合:

```
qwen extensions uninstall qwen-cli-security
```

### 拡張機能の無効化

拡張機能は、デフォルトですべてのワークスペースで有効になっています。拡張機能を完全に無効にするか、特定のワークスペースでのみ無効にすることができます。

例えば、`qwen extensions disable extension-name` はユーザーレベルで拡張機能を無効にするため、すべての場所で無効になります。`qwen extensions disable extension-name --scope=workspace` は、現在のワークスペースでのみ拡張機能を無効にします。

### 拡張機能の有効化

拡張機能は、`qwen extensions enable extension-name` を使用して有効にできます。また、そのワークスペース内で `qwen extensions enable extension-name --scope=workspace` を使用して、特定のワークスペースでのみ拡張機能を有効にすることもできます。

これは、トップレベルで拡張機能を無効にして、特定の場所でのみ有効にしている場合に便利です。

### 拡張機能の更新

ローカルパスまたはアーカイブ、アーカイブ URL、git リポジトリ、npm レジストリからインストールされた拡張機能は、`qwen extensions update extension-name` で明示的に最新バージョンに更新できます。バージョン固定なしでインストールされた npm 拡張機能（例: `@scope/pkg`）の場合、更新は `latest` dist-tag をチェックします。特定の dist-tag（例: `@scope/pkg@beta`）でインストールされた場合、更新はそのタグを追跡します。正確なバージョンに固定された拡張機能（例: `@scope/pkg@1.2.0`）は、常に最新と見なされます。

すべての拡張機能を更新するには:

```
qwen extensions update --all
```

## 仕組み

起動時に、Qwen Code は `<home>/.qwen/extensions` 内の拡張機能を検索します。

拡張機能は、`qwen-extension.json` ファイルを含むディレクトリとして存在します。例:

`<home>/.qwen/extensions/my-extension/qwen-extension.json`

### `qwen-extension.json`

`qwen-extension.json` ファイルには、拡張機能の設定が含まれています。ファイルの構造は次のとおりです。

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

- `name`: 拡張機能の名前。拡張機能を一意に識別し、拡張機能コマンドがユーザーコマンドやプロジェクトコマンドと同じ名前を持つ場合の競合解決に使用されます。名前は小文字または数字を使用し、アンダースコアやスペースの代わりにダッシュを使用する必要があります。これは、ユーザーが CLI で拡張機能を参照する方法です。この名前は拡張機能ディレクトリ名と一致する必要があることに注意してください。
- `version`: 拡張機能のバージョン。
- `mcpServers`: 設定する MCP サーバーのマップ。キーはサーバー名、値はサーバー設定です。これらのサーバーは、[`settings.json` ファイル](../configuration/settings.md) で設定された MCP サーバーと同様に、起動時に読み込まれます。拡張機能と `settings.json` ファイルの両方が同じ名前の MCP サーバーを設定する場合、`settings.json` ファイルで定義されたサーバーが優先されます。
  - `trust` を除くすべての MCP サーバー設定オプションがサポートされていることに注意してください。
- `channels`: カスタムチャネルアダプターのマップ。キーはチャネルタイプ名、値には `entry`（コンパイル済み JS エントリポイントへのパス）とオプションの `displayName` が含まれます。エントリポイントは、`ChannelPlugin` インターフェースに準拠した `plugin` オブジェクトをエクスポートする必要があります。詳細なガイドについては、[チャネルプラグイン](../features/channels/plugins) を参照してください。
- `contextFileName`: 拡張機能のコンテキストを含むファイルの名前。拡張機能ディレクトリからコンテキストを読み込むために使用されます。このプロパティが使用されていないが、拡張機能ディレクトリに `QWEN.md` ファイルが存在する場合、そのファイルが読み込まれます。
- `commands`: カスタムコマンドを含むディレクトリ（デフォルト: `commands`）。コマンドはプロンプトを定義する `.md` ファイルです。
- `skills`: カスタムスキルを含むディレクトリ（デフォルト: `skills`）。スキルは自動的に検出され、`/skills` コマンドで使用可能になります。
- `agents`: カスタムサブエージェントを含むディレクトリ（デフォルト: `agents`）。サブエージェントは、特殊な AI アシスタントを定義する `.yaml` または `.md` ファイルです。
- `settings`: 拡張機能が必要とする設定の配列。インストール時に、ユーザーはこれらの設定の値を入力するよう求められます。値は安全に保存され、環境変数として MCP サーバーに渡されます。
  - 各設定には次のプロパティがあります。
    - `name`: 設定の表示名
    - `description`: この設定が何に使用されるかの説明
    - `envVar`: 設定される環境変数名
    - `sensitive`: 値を非表示にするかどうかを示すブール値（例: API キー、パスワード）

### 拡張機能設定の管理

拡張機能は、設定（API キーや認証情報など）による構成を必要とする場合があります。これらの設定は、`qwen extensions settings` CLI コマンドを使用して管理できます。

**設定値を設定する:**

```bash
qwen extensions settings set <extension-name> <setting-name> [--scope user|workspace]
```

**拡張機能のすべての設定と現在の値を一覧表示する:**

```bash
qwen extensions settings list <extension-name>
```

設定は2つのレベルで構成できます。

- **ユーザーレベル**（デフォルト）: 設定はすべてのプロジェクトに適用されます（`~/.qwen/.env`）
- **ワークスペースレベル**: 設定は現在のプロジェクトにのみ適用されます（`.qwen/.env`）

ワークスペース設定はユーザー設定よりも優先されます。機密性の高い設定は安全に保存され、プレーンテキストで表示されることはありません。

Qwen Code が起動すると、すべての拡張機能が読み込まれ、それらの設定がマージされます。競合がある場合は、ワークスペース設定が優先されます。

### カスタムコマンド

拡張機能は、拡張機能ディレクトリ内の `commands/` サブディレクトリに Markdown ファイルを配置することで、[カスタムコマンド](../features/commands.md#4-custom-commands) を提供できます。これらのコマンドは、ユーザーおよびプロジェクトのカスタムコマンドと同じ形式に従い、標準の命名規則を使用します。

> **注:** コマンド形式は TOML から Markdown に更新されました。TOML ファイルは非推奨ですが、引き続きサポートされています。既存の TOML コマンドは、TOML ファイルが検出されたときに表示される自動移行プロンプトを使用して移行できます。

**例**

次の構造を持つ `gcp` という名前の拡張機能:

```
.qwen/extensions/gcp/
├── qwen-extension.json
└── commands/
    ├── deploy.md
    └── gcs/
        └── sync.md
```

次のコマンドを提供します。

- `/deploy` - ヘルプに `[gcp] Custom command from deploy.md` と表示されます
- `/gcs:sync` - ヘルプに `[gcp] Custom command from sync.md` と表示されます

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

拡張機能がアクティブな場合、スキルは `/skills` コマンドを介して使用可能になります。

### カスタムサブエージェント

拡張機能は、拡張機能ディレクトリ内の `agents/` サブディレクトリにエージェント設定ファイルを配置することで、カスタムサブエージェントを提供できます。エージェントは YAML または Markdown ファイルを使用して定義されます。

**例**

```
.qwen/extensions/my-extension/
├── qwen-extension.json
└── agents/
    └── testing-expert.yaml
```

拡張機能のサブエージェントは、サブエージェントマネージャーダイアログの「拡張機能エージェント」セクションに表示されます。

### 競合解決

拡張機能コマンドは最も低い優先順位を持ちます。ユーザーまたはプロジェクトのコマンドと競合が発生した場合:

1. **競合なし**: 拡張機能コマンドは自然な名前を使用します（例: `/deploy`）
2. **競合あり**: 拡張機能コマンドは拡張機能プレフィックスで名前が変更されます（例: `/gcp.deploy`）

例えば、ユーザーと `gcp` 拡張機能の両方が `deploy` コマンドを定義している場合:

- `/deploy` - ユーザーのデプロイコマンドを実行します
- `/gcp.deploy` - 拡張機能のデプロイコマンドを実行します（`[gcp]` タグが付いています）

## 変数

Qwen Code 拡張機能では、`qwen-extension.json` 内で変数置換が可能です。これは、例えば MCP サーバーを実行するために現在のディレクトリが必要な場合に便利です（`"cwd": "${extensionPath}${/}run.ts"` など）。

**サポートされている変数:**

| 変数                          | 説明                                                                                                                    |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `${extensionPath}`            | ユーザーのファイルシステム上での拡張機能の完全修飾パス。例: '/Users/username/.qwen/extensions/example-extension'。シンボリックリンクは展開されません。 |
| `${workspacePath}`            | 現在のワークスペースの完全修飾パス。                                                                                    |
| `${/} または ${pathSeparator}` | パス区切り文字（OS によって異なります）。                                                                               |