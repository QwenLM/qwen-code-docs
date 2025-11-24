# Qwen Code Extensions

Qwen Code Extensions は、プロンプト、MCP サーバー、カスタムコマンドをパッケージ化し、使い慣れたユーザーフレンドリーな形式で提供します。Extensions を使うことで、Qwen Code の機能を拡張し、その機能を他の人と共有できます。インストールや共有が簡単にできるように設計されています。

## Extension の管理

`qwen extensions` コマンドを使って、Extension 管理用のツール群を提供しています。

ただし、これらのコマンドは CLI 内からはサポートされていません。インストール済みの Extensions 一覧は、`/extensions list` サブコマンドで確認できます。

また、これらのコマンドによる変更は、CLI セッションを再起動するまで反映されません。

### エクステンションのインストール

GitHub URL またはローカルパスを指定して、`qwen extensions install` コマンドでエクステンションをインストールできます。

インストールされたエクステンションはコピーが作成されるため、ローカルで定義したエクステンションも GitHub 上のエクステンションも、変更を反映するには `qwen extensions update` を実行する必要があります。

```
qwen extensions install https://github.com/qwen-cli-extensions/security
```

これにより、Qwen Code Security エクステンションがインストールされ、`/security:analyze` コマンドが利用可能になります。

### エクステンションのアンインストール

アンインストールするには、`qwen extensions uninstall extension-name` を実行します。先ほどのインストール例の場合：

```
qwen extensions uninstall qwen-cli-security
```

### 拡張機能の無効化

拡張機能はデフォルトで全てのワークスペースで有効になっています。拡張機能を全体的に無効にするか、特定のワークスペースのみ無効にするか選択できます。

例えば、`qwen extensions disable extension-name` はユーザー レベルで拡張機能を無効にするため、すべての場所で無効になります。`qwen extensions disable extension-name --scope=workspace` は現在のワークスペース内でのみ拡張機能を無効にします。

### 拡張機能の有効化

`qwen extensions enable extension-name` を使用して拡張機能を有効にできます。また、特定のワークスペース内で `qwen extensions enable extension-name --scope=workspace` を実行することで、そのワークスペースに対してのみ拡張機能を有効にすることも可能です。

これは、トップレベルでは拡張機能が無効になっていて、特定の場所でのみ有効にしている場合に便利です。

### Extensionの更新

ローカルパスまたはGitリポジトリからインストールされたExtensionについては、`qwen extensions update extension-name` を使用して、最新バージョン（`qwen-extension.json` の `version` フィールドに記載されているバージョン）に明示的に更新できます。

すべてのExtensionを一括で更新するには以下のコマンドを使用します：

```
qwen extensions update --all
```

## Extensionの作成

Extension開発をより簡単に進めるために、いくつかの便利なコマンドを提供しています。

### Boilerplate Extensionの作成

いくつかのサンプルExtensionとして、`context`、`custom-commands`、`exclude-tools`、`mcp-server` を用意しています。これらのサンプルは[こちら](https://github.com/QwenLM/qwen-code/tree/main/packages/cli/src/commands/extensions/examples)で確認できます。

選択した種類のサンプルをコピーして開発ディレクトリに配置するには、次のように実行してください：

```
qwen extensions new path/to/directory custom-commands
```

### ローカルの拡張機能をリンクする

`qwen extensions link` コマンドは、拡張機能のインストールディレクトリから開発用パスへのシンボリックリンクを作成します。

これにより、テストしたい変更を加えるたびに `qwen extensions update` を実行する必要がなくなります。

```
qwen extensions link path/to/directory
```

## 動作の仕組み

起動時に、Qwen Code は `<home>/.qwen/extensions` 内の拡張機能を探します。

拡張機能は、`qwen-extension.json` ファイルを含むディレクトリとして存在します。例：

`<home>/.qwen/extensions/my-extension/qwen-extension.json`

### `qwen-extension.json`

`qwen-extension.json` ファイルには、エクステンションの設定が含まれています。このファイルは以下の構造を持っています：

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

- `name`: エクステンションの名前です。これはエクステンションを一意に識別し、ユーザーまたはプロジェクトのコマンドと同名の場合に競合を解決するために使用されます。名前は小文字または数字を使用し、アンダースコアやスペースの代わりにダッシュを使用してください。CLI でユーザーがこのエクステンションを参照する際の名前になります。なお、この名前はエクステンションディレクトリ名と一致している必要があります。
- `version`: エクステンションのバージョンです。
- `mcpServers`: 設定する MCP サーバーのマップです。キーはサーバー名、値はサーバー設定です。これらのサーバーは [`settings.json` ファイル](./cli/configuration.md)で設定された MCP サーバーと同様に起動時にロードされます。もしエクステンションと `settings.json` の両方で同じ名前の MCP サーバーが設定されている場合、`settings.json` ファイルで定義されたサーバーが優先されます。
  - `trust` を除くすべての MCP サーバー設定オプションがサポートされています。
- `contextFileName`: エクステンションのコンテキストを含むファイル名です。これを使ってエクステンションディレクトリからコンテキストをロードします。このプロパティが指定されていないが、エクステンションディレクトリ内に `QWEN.md` ファイルがある場合は、そのファイルがロードされます。
- `excludeTools`: モデルから除外するツール名の配列です。`run_shell_command` ツールのように対応しているツールについては、コマンド単位での制限も指定できます。例えば `"excludeTools": ["run_shell_command(rm -rf)"]` とすると `rm -rf` コマンドがブロックされます。これは MCP サーバー設定でリストできる MCP サーバー側の `excludeTools` 機能とは異なる点に注意してください。**重要：** `excludeTools` で指定されたツールは会話全体のコンテキストで無効化され、現在のセッション内のすべての後続クエリに影響を与えます。

Qwen Code が起動すると、すべてのエクステンションをロードしてその設定をマージします。もし競合がある場合は、ワークスペースの設定が優先されます。

### カスタムコマンド

拡張機能は、拡張機能ディレクトリ内の `commands/` サブディレクトリに TOML ファイルを配置することで、[カスタムコマンド](./cli/commands.md#custom-commands)を提供できます。これらのコマンドは、ユーザーおよびプロジェクトのカスタムコマンドと同じ形式に従い、標準的な命名規則を使用します。

**例**

以下のような構造を持つ `gcp` という名前の拡張機能：

```
.qwen/extensions/gcp/
├── qwen-extension.json
└── commands/
    ├── deploy.toml
    └── gcs/
        └── sync.toml
```

この拡張機能は以下のコマンドを提供します：

- `/deploy` - ヘルプでは `[gcp] Custom command from deploy.toml` として表示されます
- `/gcs:sync` - ヘルプでは `[gcp] Custom command from sync.toml` として表示されます

### コンフリクトの解決

拡張機能のコマンドは最も低い優先順位を持ちます。ユーザーまたはプロジェクトのコマンドと競合が発生した場合：

1. **競合なし**: 拡張機能コマンドは本来の名前を使用（例：`/deploy`）
2. **競合あり**: 拡張機能コマンドは拡張機能のプレフィックス付きでリネームされる（例：`/gcp.deploy`）

例えば、ユーザーと `gcp` 拡張機能の両方で `deploy` コマンドが定義されている場合：

- `/deploy` - ユーザーの deploy コマンドを実行
- `/gcp.deploy` - 拡張機能の deploy コマンドを実行（`[gcp]` タグ付き）

## 変数

Qwen Code 拡張機能では、`qwen-extension.json` 内で変数の置換が可能です。例えば、MCP サーバーを実行する際にカレントディレクトリが必要な場合、`"cwd": "${extensionPath}${/}run.ts"` のように指定できます。

**サポートされている変数:**

| 変数                        | 説明                                                                                                                                                      |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `${extensionPath}`          | ユーザーのファイルシステムにおける拡張機能の絶対パス（例: '/Users/username/.qwen/extensions/example-extension'）。シンボリックリンクは展開されません。 |
| `${workspacePath}`          | 現在のワークスペースの絶対パス。                                                                                                                           |
| `${/} or ${pathSeparator}` | パス区切り文字（OS によって異なります）。                                                                                                                  |