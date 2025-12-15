# Qwen Code 拡張機能

Qwen Code 拡張機能は、プロンプト、MCP サーバー、およびカスタムコマンドをよく知られたユーザーフレンドリーな形式にパッケージ化します。拡張機能を使用して、Qwen Code の機能を拡張し、その機能を他の人と共有できます。これらは簡単にインストールおよび共有できるように設計されています。

## 拡張機能の管理

`qwen extensions` コマンドを使用して、拡張機能管理ツールの一式を提供しています。

これらのコマンドは CLI 内からはサポートされていませんが、`/extensions list` サブコマンドを使用してインストール済みの拡張機能を一覧表示することはできます。

これらのコマンドはすべて、再起動時にアクティブな CLI セッションにのみ反映されることに注意してください。

### 拡張機能のインストール

GitHub の URL またはローカルパスを指定して、`qwen extensions install` を使用して拡張機能をインストールできます。

インストールされた拡張機能のコピーが作成されることに注意してください。そのため、ローカルで定義された拡張機能と GitHub 上の拡張機能の両方から変更を取得するには、`qwen extensions update` を実行する必要があります。

```
qwen extensions install https://github.com/qwen-cli-extensions/security
```

これにより、Qwen Code Security 拡張機能がインストールされ、`/security:analyze` コマンドのサポートが提供されます。

### 拡張機能のアンインストール

アンインストールするには、`qwen extensions uninstall extension-name` を実行します。上記のインストール例の場合：

```
qwen extensions uninstall qwen-cli-security
```

### 拡張機能の無効化

拡張機能は、デフォルトですべてのワークスペースで有効になっています。拡張機能を全体的に無効にすることも、特定のワークスペースに対してのみ無効にすることもできます。

例えば、`qwen extensions disable extension-name` はユーザー レベルで拡張機能を無効にするため、すべての場所で無効になります。`qwen extensions disable extension-name --scope=workspace` は現在のワークスペース内でのみ拡張機能を無効にします。

### 拡張機能の有効化

`qwen extensions enable extension-name` を使用して拡張機能を有効にできます。また、特定のワークスペース内で `qwen extensions enable extension-name --scope=workspace` を実行することで、そのワークスペースに対してのみ拡張機能を有効にできます。

これは、トップレベルでは拡張機能が無効になっていて、特定の場所でのみ有効にしている場合に便利です。

### 拡張機能の更新

ローカルパスまたはGitリポジトリからインストールされた拡張機能については、`qwen extensions update extension-name` を使用して、最新バージョン（`qwen-extension.json` の `version` フィールドに反映されている）に明示的に更新できます。

すべての拡張機能を更新するには以下を実行します：

```
qwen extensions update --all
```

## 拡張機能の作成

拡張機能の開発を容易にするために、いくつかのコマンドを提供しています。

### ボイラープレート拡張機能の作成

いくつかのサンプル拡張機能 `context`、`custom-commands`、`exclude-tools`、および `mcp-server` を提供しています。これらの例は[こちら](https://github.com/QwenLM/qwen-code/tree/main/packages/cli/src/commands/extensions/examples)で確認できます。

選択したタイプの例をコピーして開発ディレクトリに配置するには、以下を実行します：

```
qwen extensions new path/to/directory custom-commands
```

### ローカル拡張機能のリンク

`qwen extensions link` コマンドは、拡張機能のインストールディレクトリから開発パスへのシンボリックリンクを作成します。

これにより、テストしたい変更を加えるたびに `qwen extensions update` を実行する必要がなくなるため便利です。

```
qwen extensions link path/to/directory
```

## 動作方法

起動時に、Qwen Code は `<home>/.qwen/extensions` で拡張機能を探します。

拡張機能は、`qwen-extension.json` ファイルを含むディレクトリとして存在します。例：

`<home>/.qwen/extensions/my-extension/qwen-extension.json`

### `qwen-extension.json`

`qwen-extension.json` ファイルには、拡張機能の設定が含まれています。ファイルの構造は以下の通りです：

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
  "excludeTools": ["run_shell_command"]
}
```

- `name`: 拡張機能の名前です。これは拡張機能を一意に識別し、拡張機能のコマンドとユーザーまたはプロジェクトのコマンドが同じ名前の場合の競合を解決するために使用されます。名前は小文字または数字を使用し、アンダースコアやスペースの代わりにダッシュを使用してください。これが CLI でユーザーがあなたの拡張機能を参照する方法になります。この名前は拡張機能ディレクトリ名と一致することを期待しています。
- `version`: 拡張機能のバージョンです。
- `mcpServers`: 設定する MCP サーバーのマップです。キーはサーバーの名前であり、値はサーバーの設定です。これらのサーバーは [`settings.json` ファイル](./cli/configuration.md)で設定された MCP サーバーと同様に起動時にロードされます。拡張機能と `settings.json` ファイルの両方で同じ名前の MCP サーバーが設定されている場合、`settings.json` ファイルで定義されたサーバーが優先されます。
  - `trust` を除くすべての MCP サーバー設定オプションがサポートされています。
- `contextFileName`: 拡張機能のコンテキストを含むファイルの名前です。これは拡張機能ディレクトリからコンテキストをロードするために使用されます。このプロパティが使用されていないが拡張機能ディレクトリに `QWEN.md` ファイルが存在する場合、そのファイルがロードされます。
- `excludeTools`: モデルから除外するツール名の配列です。`run_shell_command` ツールのように対応しているツールについては、コマンド固有の制限を指定することもできます。例えば、`"excludeTools": ["run_shell_command(rm -rf)"]` とすると `rm -rf` コマンドがブロックされます。これは MCP サーバー設定でリストできる MCP サーバーの `excludeTools` 機能とは異なることに注意してください。**重要：** `excludeTools` で指定されたツールは会話全体のコンテキストで無効化され、現在のセッション内の後続のすべてのクエリに影響を与えます。

Qwen Code が起動すると、すべての拡張機能をロードしてその設定を統合します。競合がある場合は、ワークスペースの設定が優先されます。

### カスタムコマンド

拡張機能は、拡張機能ディレクトリ内の `commands/` サブディレクトリに TOML ファイルを配置することで、[カスタムコマンド](./cli/commands.md#custom-commands)を提供できます。これらのコマンドは、ユーザーおよびプロジェクトのカスタムコマンドと同じ形式に従い、標準的な命名規則を使用します。

**例**

以下の構造を持つ `gcp` という名前の拡張機能：

```
.qwen/extensions/gcp/
├── qwen-extension.json
└── commands/
    ├── deploy.toml
    └── gcs/
        └── sync.toml
```

は、以下のコマンドを提供します：

- `/deploy` - ヘルプでは `[gcp] Custom command from deploy.toml` として表示されます
- `/gcs:sync` - ヘルプでは `[gcp] Custom command from sync.toml` として表示されます

### 競合の解決

拡張機能コマンドは最も低い優先順位を持ちます。ユーザーまたはプロジェクトのコマンドと競合が発生した場合：

1. **競合なし**：拡張機能コマンドは本来の名前を使用します（例：`/deploy`）
2. **競合あり**：拡張機能コマンドは拡張機能のプレフィックス付きで名前が変更されます（例：`/gcp.deploy`）

例えば、ユーザーと `gcp` 拡張機能の両方で `deploy` コマンドが定義されている場合：

- `/deploy` - ユーザーの deploy コマンドを実行します
- `/gcp.deploy` - 拡張機能の deploy コマンドを実行します（`[gcp]` タグ付き）

## 変数

Qwen Code 拡張機能では、`qwen-extension.json` で変数の置換が可能です。例えば、MCP サーバーを実行する際にカレントディレクトリが必要な場合、`"cwd": "${extensionPath}${/}run.ts"` のように指定できます。

**サポートされている変数:**

| 変数                       | 説明                                                                                                                                                     |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `${extensionPath}`         | ユーザーのファイルシステムにおける拡張機能の完全修飾パス（例: '/Users/username/.qwen/extensions/example-extension'）。シンボリックリンクは展開されません。 |
| `${workspacePath}`         | 現在のワークスペースの完全修飾パス。                                                                                                                     |
| `${/} or ${pathSeparator}` | パス区切り文字（OS によって異なります）。                                                                                                                |