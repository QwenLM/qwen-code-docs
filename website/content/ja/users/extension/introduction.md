# Qwen Code Extensions

Qwen Code extensionsは、プロンプト・MCP サーバー・サブエージェント・スキル・カスタムコマンドを、使いやすい形式にパッケージ化したものです。Extensions を使えば Qwen Code の機能を拡張し、その機能を他のユーザーと共有できます。簡単にインストール・共有できるよう設計されています。

[Gemini CLI Extensions Gallery](https://geminicli.com/extensions/) や [Claude Code Marketplace](https://claudemarketplaces.com/) の Extensions・プラグインは、Qwen Code に直接インストールできます。このクロスプラットフォーム互換性により、豊富な Extension エコシステムにアクセスでき、Extension 作者が別バージョンを管理する必要なく Qwen Code の機能を大幅に拡張できます。

## Extension の管理

`qwen extensions` CLI コマンドと、インタラクティブ CLI 内の `/extensions` スラッシュコマンドの両方で、Extension 管理ツール一式を提供しています。

### ランタイム Extension 管理（スラッシュコマンド）

インタラクティブ CLI 内で `/extensions` スラッシュコマンドを使い、実行時に Extension を管理できます。これらのコマンドはホットリロードに対応しており、アプリケーションを再起動しなくても変更が即座に反映されます。

| コマンド                               | 説明                                                                                          |
| ------------------------------------- | --------------------------------------------------------------------------------------------- |
| `/extensions` または `/extensions manage` | インストール済みの全 Extension を管理                                                          |
| `/extensions install <source>`        | git URL、ローカルパス、アーカイブ、アーカイブ URL、npm パッケージ、またはマーケットプレイスから Extension をインストール |
| `/extensions explore [source]`        | ブラウザで Extensions ソースページ（Gemini または ClaudeCode）を開く                            |

#### インタラクティブ Extension マネージャー

`/extensions`（または `/extensions manage`）を実行すると、3 つのタブを持つインタラクティブなマネージャーが開きます。`Tab` キーまたは `←`/`→` 矢印キーでタブを切り替えられます。

- **Discover** — 設定済みのマーケットプレイスソースからプラグインを参照。入力して検索し、`Enter` でプラグインの詳細を表示してインストール（インストールスコープの選択を求められます）。`Ctrl+R` で一覧を再取得、`Esc` で戻ります。
- **Installed** — インストール済みの Extension をスコープ別（**User level**、**Project level**、お気に入り）にグループ表示。`↑`/`↓` でナビゲート、`Space` で Extension の有効/無効を切り替え、`f` でお気に入り登録、`Enter` で詳細を開きます。Extension にバンドルされた MCP サーバーは親 Extension の配下にネストされ、ライブ接続ステータスが表示されます。各サーバーを個別に有効/無効にできます。
- **Sources** — Discover タブに表示するマーケットプレイスソースを管理。`↑`/`↓` でナビゲート、`Enter` でソースを選択、`d` で削除。これらは後述の `qwen extensions sources` CLI コマンドで管理するソースと同じです。

ここで行った変更は Qwen Code を再起動せずに即座にホットリロードされます。

### CLI Extension 管理

`qwen extensions` CLI コマンドを使って Extension を管理することもできます。CLI コマンドによる変更は、アクティブな CLI セッションの再起動後に反映されます。

### Extension のインストール

`qwen extensions install` を使って、複数のソースから Extension をインストールできます。

#### Claude Code Marketplace から

Qwen Code は [Claude Code Marketplace](https://claudemarketplaces.com/) のプラグインにも対応しています。マーケットプレイスからインストールしてプラグインを選択します。

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

例えば、[f/awesome-chatgpt-prompts](https://claudemarketplaces.com/plugins/f-awesome-chatgpt-prompts) マーケットプレイスから `prompts.chat` プラグインをインストールするには：

```bash
qwen extensions install f/awesome-chatgpt-prompts:prompts.chat
# または
qwen extensions install https://github.com/f/awesome-chatgpt-prompts:prompts.chat
```

Claude プラグインはインストール時に自動的に Qwen Code 形式に変換されます。

- `claude-plugin.json` は `qwen-extension.json` に変換
- エージェント設定は Qwen サブエージェント形式に変換
- スキル設定は Qwen スキル形式に変換
- ツールマッピングは自動的に処理

`/extensions explore` コマンドを使って、さまざまなマーケットプレイスの利用可能な Extension をすばやく参照できます。

```bash
# Gemini CLI Extensions マーケットプレイスを開く
/extensions explore Gemini

# Claude Code マーケットプレイスを開く
/extensions explore ClaudeCode
```

このコマンドはデフォルトブラウザで各マーケットプレイスを開き、Qwen Code の体験を充実させる新しい Extension を発見できます。

> **クロスプラットフォーム互換性**: Gemini CLI と Claude Code の豊富な Extension エコシステムを活用でき、Qwen Code ユーザーが利用できる機能を大幅に拡張できます。

#### Gemini CLI Extensions から

Qwen Code は [Gemini CLI Extensions Gallery](https://geminicli.com/extensions/) の Extension を完全サポートしています。git URL を使ってインストールするだけです。

```bash
qwen extensions install <gemini-cli-extension-github-url>
# または
qwen extensions install <owner>/<repo>
```

Gemini Extensions はインストール時に自動的に Qwen Code 形式に変換されます。

- `gemini-extension.json` は `qwen-extension.json` に変換
- TOML コマンドファイルは自動的に Markdown 形式に移行
- MCP サーバー、コンテキストファイル、設定は保持

#### npm Registry から

Qwen Code はスコープ付きパッケージ名を使って npm レジストリから Extension をインストールできます。認証・バージョン管理・公開インフラがすでに整っているプライベートレジストリを持つチームに最適です。

```bash
# 最新バージョンをインストール
qwen extensions install @scope/my-extension

# 特定バージョンをインストール
qwen extensions install @scope/my-extension@1.2.0

# カスタムレジストリからインストール
qwen extensions install @scope/my-extension --registry https://your-registry.com
```

`owner/repo` GitHub ショートハンド形式との曖昧さを避けるため、スコープ付きパッケージ（`@scope/package-name`）のみサポートしています。

**レジストリの解決**は以下の優先順位に従います。

1. `--registry` CLI フラグ（明示的な上書き）
2. `.npmrc` のスコープ別レジストリ（例：`@scope:registry=https://...`）
3. `.npmrc` のデフォルトレジストリ
4. フォールバック：`https://registry.npmjs.org/`

**認証**は `NPM_TOKEN` 環境変数または `.npmrc` ファイルのレジストリ別 `_authToken` エントリで自動的に処理されます。

> **Note:** npm Extension はパッケージルートに `qwen-extension.json` ファイルが必要です。形式は他の Qwen Code Extension と同じです。パッケージングの詳細は [Extension Releasing](./extension-releasing.md#releasing-through-npm-registry) を参照してください。

#### Git リポジトリから

```bash
qwen extensions install https://github.com/github/github-mcp-server
```

これにより github mcp server Extension がインストールされます。

#### ローカルパスから

```bash
qwen extensions install /path/to/your/extension
```

ローカルの `.zip` および `.tar.gz` アーカイブもサポートしています。

```bash
qwen extensions install /path/to/your/extension.zip
qwen extensions install /path/to/your/extension.tar.gz
```

アーカイブのルートに完全な Extension が含まれているか、Extension を含む単一のトップレベルディレクトリが必要です。

インストールされた Extension はコピーが作成されるため、ローカルで定義した Extension や GitHub 上の Extension の変更を取り込むには `qwen extensions update` を実行する必要があります。

#### アーカイブ URL から

```bash
qwen extensions install https://example.com/your/extension.zip
qwen extensions install https://example.com/your/extension.tar.gz
```

アーカイブ URL は、同じ Extension の新しいアーカイブを URL が指し続ける限り、後で更新できます。

#### インストールスコープの選択

デフォルトでは、インストールした Extension はグローバル（ユーザースコープ）で有効になります。現在のワークスペースのみで有効にするには `--scope project` を指定します。

```bash
qwen extensions install <source> --scope project
```

`--scope workspace` は `--scope project` のエイリアスとして使用できます。これは `/extensions manage` の Discover タブからインストール時に表示されるスコープ選択と同じです。

### マーケットプレイスソースの管理

マーケットプレイスソース（Claude プラグインマーケットプレイス）は `/extensions manage` の Discover タブを動かします。CLI からも管理できます。

```bash
# マーケットプレイスを追加（owner/repo、git URL、marketplace.json への https URL、またはローカルパス）
qwen extensions sources add <source>

# 設定済みマーケットプレイスを一覧表示
qwen extensions sources list

# マーケットプレイスのプラグイン一覧を再取得
qwen extensions sources update <name>

# マーケットプレイスを削除
qwen extensions sources remove <name>
```

### Extension のアンインストール

アンインストールするには `qwen extensions uninstall extension-name` を実行します。インストール例の場合：

```
qwen extensions uninstall qwen-cli-security
```

### Extension の無効化

Extension はデフォルトですべてのワークスペースで有効です。Extension を完全に、または特定のワークスペースのみで無効化できます。

例えば、`qwen extensions disable extension-name` はユーザーレベルで Extension を無効化するため、どこでも無効になります。`qwen extensions disable extension-name --scope=workspace` は現在のワークスペースでのみ無効化します。

### Extension の有効化

`qwen extensions enable extension-name` で Extension を有効化できます。また、特定のワークスペース内で `qwen extensions enable extension-name --scope=workspace` を実行することで、そのワークスペースのみで有効化することもできます。

トップレベルで無効にして特定の場所だけで有効にしたい場合に便利です。

### Extension の更新

ローカルパスやアーカイブ、アーカイブ URL、git リポジトリ、npm レジストリからインストールした Extension は、`qwen extensions update extension-name` で明示的に最新バージョンに更新できます。バージョン固定なしでインストールした npm Extension（例：`@scope/pkg`）は `latest` dist-tag を確認します。特定の dist-tag でインストールしたもの（例：`@scope/pkg@beta`）はそのタグを追跡します。特定バージョンに固定した Extension（例：`@scope/pkg@1.2.0`）は常に最新とみなされます。

全 Extension を更新するには：

```
qwen extensions update --all
```

## 仕組み

起動時に Qwen Code は `<home>/.qwen/extensions` 内の Extension を検索します。

Extension は `qwen-extension.json` ファイルを含むディレクトリとして存在します。例：

`<home>/.qwen/extensions/my-extension/qwen-extension.json`

### `qwen-extension.json`

`qwen-extension.json` ファイルは Extension の設定を含みます。ファイルの構造は以下の通りです。

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

- `name`: Extension の名前。Extension を一意に識別し、Extension コマンドとユーザーまたはプロジェクトコマンドが同名の場合の競合解決に使用します。名前は小文字または数字で、アンダースコアやスペースの代わりにダッシュを使用してください。これが CLI で Extension を参照する際の名前になります。この名前は Extension ディレクトリ名と一致する必要があります。
- `version`: Extension のバージョン。
- `mcpServers`: 設定する MCP サーバーのマップ。キーはサーバー名、値はサーバー設定です。これらのサーバーは [`settings.json` ファイル](../configuration/settings.md) で設定した MCP サーバーと同様に起動時にロードされます。Extension と `settings.json` ファイルの両方が同名の MCP サーバーを設定している場合、`settings.json` ファイルのサーバーが優先されます。
  - `trust` を除くすべての MCP サーバー設定オプションがサポートされています。
- `channels`: カスタムチャネルアダプターのマップ。キーはチャネルタイプ名、値は `entry`（コンパイル済み JS エントリーポイントへのパス）とオプションの `displayName` です。エントリーポイントは `ChannelPlugin` インターフェイスに準拠した `plugin` オブジェクトをエクスポートする必要があります。詳細は [Channel Plugins](../features/channels/plugins) を参照してください。
- `contextFileName`: Extension のコンテキストを含むファイルの名前。Extension ディレクトリからコンテキストをロードするために使用されます。このプロパティを使用しないが Extension ディレクトリに `QWEN.md` ファイルがある場合は、そのファイルがロードされます。
- `commands`: カスタムコマンドを含むディレクトリ（デフォルト：`commands`）。コマンドはプロンプトを定義する `.md` ファイルです。
- `skills`: カスタムスキルを含むディレクトリ（デフォルト：`skills`）。スキルは自動的に検出され、`/skills` コマンドで利用可能になります。
- `agents`: カスタムサブエージェントを含むディレクトリ（デフォルト：`agents`）。サブエージェントは特化した AI アシスタントを定義する `.yaml` または `.md` ファイルです。
- `settings`: Extension が必要とする設定の配列。インストール時にユーザーはこれらの設定値の入力を求められます。値はセキュアに保存され、環境変数として MCP サーバーに渡されます。
  - 各設定には以下のプロパティがあります：
    - `name`: 設定の表示名
    - `description`: この設定の用途の説明
    - `envVar`: 設定される環境変数名
    - `sensitive`: 値を非表示にするかどうかを示すブール値（API キーやパスワードなど）

### Extension 設定の管理

Extension は設定（API キーや認証情報など）による構成を必要とする場合があります。これらの設定は `qwen extensions settings` CLI コマンドで管理できます。

**設定値を設定する：**

```bash
qwen extensions settings set <extension-name> <setting-name> [--scope user|workspace]
```

**Extension の全設定と現在の値を一覧表示する：**

```bash
qwen extensions settings list <extension-name>
```

設定は 2 つのレベルで構成できます。

- **User level**（デフォルト）：すべてのプロジェクトに設定が適用される（`~/.qwen/.env`）
- **Workspace level**：現在のプロジェクトのみに設定が適用される（`.qwen/.env`）

ワークスペース設定はユーザー設定より優先されます。機密設定はセキュアに保存され、平文では表示されません。

Qwen Code の起動時に、すべての Extension がロードされて設定がマージされます。競合がある場合はワークスペース設定が優先されます。

### カスタムコマンド

Extensions は、Extension ディレクトリ内の `commands/` サブディレクトリに Markdown ファイルを配置することで、[カスタムコマンド](../features/commands.md#4-custom-commands)を提供できます。これらのコマンドはユーザーおよびプロジェクトカスタムコマンドと同じ形式で、標準的な命名規則を使用します。

> **Note:** コマンド形式は TOML から Markdown に更新されました。TOML ファイルは非推奨ですが引き続きサポートされます。TOML ファイルが検出されたときに表示される自動移行プロンプトを使って、既存の TOML コマンドを移行できます。

**例**

`gcp` という名前の Extension が以下の構造を持つ場合：

```
.qwen/extensions/gcp/
├── qwen-extension.json
└── commands/
    ├── deploy.md
    └── gcs/
        └── sync.md
```

以下のコマンドが提供されます：

- `/deploy` - ヘルプで `[gcp] Custom command from deploy.md` と表示
- `/gcs:sync` - ヘルプで `[gcp] Custom command from sync.md` と表示

### カスタムスキル

Extensions は、Extension ディレクトリ内の `skills/` サブディレクトリにスキルファイルを配置することで、カスタムスキルを提供できます。各スキルにはスキルの名前と説明を定義する YAML フロントマターを含む `SKILL.md` ファイルが必要です。

**例**

```
.qwen/extensions/my-extension/
├── qwen-extension.json
└── skills/
    └── pdf-processor/
        └── SKILL.md
```

Extension がアクティブな場合、スキルは `/skills` コマンドで利用可能になります。

### カスタムサブエージェント

Extensions は、Extension ディレクトリ内の `agents/` サブディレクトリにエージェント設定ファイルを配置することで、カスタムサブエージェントを提供できます。エージェントは YAML または Markdown ファイルで定義します。

**例**

```
.qwen/extensions/my-extension/
├── qwen-extension.json
└── agents/
    └── testing-expert.yaml
```

Extension のサブエージェントはサブエージェントマネージャーダイアログの「Extension Agents」セクションに表示されます。

### 競合解決

Extension コマンドは最も低い優先順位を持ちます。ユーザーまたはプロジェクトコマンドと競合が発生した場合：

1. **競合なし**：Extension コマンドは本来の名前を使用（例：`/deploy`）
2. **競合あり**：Extension コマンドは Extension プレフィックス付きに改名（例：`/gcp.deploy`）

例えば、ユーザーと `gcp` Extension の両方が `deploy` コマンドを定義している場合：

- `/deploy` - ユーザーの deploy コマンドを実行
- `/gcp.deploy` - Extension の deploy コマンドを実行（`[gcp]` タグ付き）

## 変数

Qwen Code Extensions では `qwen-extension.json` 内で変数置換が使えます。例えば、`"cwd": "${extensionPath}${/}run.ts"` のように MCP サーバーの実行に現在のディレクトリが必要な場合などに便利です。

**サポートされている変数：**

| 変数                       | 説明                                                                                                                                                   |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `${extensionPath}`         | ユーザーのファイルシステムにおける Extension の完全パス（例：'/Users/username/.qwen/extensions/example-extension'）。シンボリックリンクは解決されません。 |
| `${workspacePath}`         | 現在のワークスペースの完全パス。                                                                                                                        |
| `${/} or ${pathSeparator}` | パス区切り文字（OS によって異なります）。                                                                                                               |
