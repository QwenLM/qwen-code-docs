# Qwen Code Extensions

Qwen Code Extensions は、プロンプト、MCP サーバー、カスタムコマンドをパッケージ化し、使い慣れたユーザーフレンドリーな形式で提供します。Extensions を使うことで、Qwen Code の機能を拡張し、その機能を他の人と共有できます。これらは簡単にインストール・共有できるように設計されています。

## Extension の管理

`qwen extensions` コマンドを使って、Extension の管理ツール一式を提供しています。

ただし、これらのコマンドは CLI 内からはサポートされていませんが、`/extensions list` サブコマンドを使用してインストール済みの Extensions を一覧表示することは可能です。

これらのコマンドはすべて、CLI セッションを再起動したときにのみ反映されることに注意してください。

### エクステンションのインストール

エクステンションは、GitHub URL またはローカルパスを指定して `qwen extensions install` コマンドでインストールできます。

インストールされたエクステンションはコピーが作成されるため、ローカルで定義したエクステンションも、GitHub 上のエクステンションも、変更を反映するには `qwen extensions update` を実行する必要があります。

```
qwen extensions install https://github.com/qwen-cli-extensions/security
```

これにより、Qwen Code Security エクステンションがインストールされ、`/security:analyze` コマンドが利用可能になります。

### エクステンションのアンインストール

アンインストールするには、`qwen extensions uninstall extension-name` を実行します。先ほどのインストール例の場合、以下のようになります：

```
qwen extensions uninstall qwen-cli-security
```

### 拡張機能の無効化

拡張機能は、デフォルトではすべてのワークスペースで有効になっています。拡張機能を全体的に無効にすることも、特定のワークスペースのみ無効にすることもできます。

例えば、`qwen extensions disable extension-name` はユーザー レベルで拡張機能を無効にするため、すべての場所で無効になります。`qwen extensions disable extension-name --scope=workspace` は現在のワークスペースでのみ拡張機能を無効にします。

### 拡張機能の有効化

`qwen extensions enable extension-name` を使用して拡張機能を有効にできます。また、特定のワークスペース内から `qwen extensions enable extension-name --scope=workspace` を使用して、そのワークスペースでのみ拡張機能を有効にすることもできます。

これは、トップ レベルでは拡張機能が無効になっていて、特定の場所でのみ有効にしている場合に便利です。

### Extensionの更新

ローカルパスまたはGitリポジトリからインストールされたExtensionについては、`qwen extensions update extension-name` を使用して、最新バージョン（`qwen-extension.json` の `version` フィールドに記載されたバージョン）に明示的に更新できます。

すべてのExtensionを更新するには以下のコマンドを使用します：

```
qwen extensions update --all
```

## Extensionの作成

Extension開発を簡単に進めるために、いくつかのコマンドを提供しています。

### Boilerplate Extensionの作成

いくつかのサンプルExtensionとして `context`、`custom-commands`、`exclude-tools`、`mcp-server` を用意しています。これらのサンプルは[こちら](https://github.com/QwenLM/qwen-code/tree/main/packages/cli/src/commands/extensions/examples)で確認できます。

選択した種類のサンプルを、開発用ディレクトリにコピーするには、以下のように実行してください：

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

起動時に、Qwen Code は `<home>/.qwen/extensions` から拡張機能を探します。

拡張機能は、`qwen-extension.json` ファイルを含むディレクトリとして存在します。例:

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

- `name`: エクステンションの名前です。これはエクステンションを一意に識別し、エクステンションのコマンドとユーザーまたはプロジェクトのコマンドが同じ名前の場合の競合解決のために使用されます。名前は小文字または数字で、アンダースコアやスペースの代わりにダッシュを使用してください。これはCLIでユーザーがあなたのエクステンションを参照する方法です。この名前はエクステンションディレクトリ名と一致することを期待しています。
- `version`: エクステンションのバージョンです。
- `mcpServers`: 設定するMCPサーバーのマップです。キーはサーバーの名前で、値はサーバーの設定です。これらのサーバーは [`settings.json` ファイル](./cli/configuration.md) で設定されたMCPサーバーと同様に起動時にロードされます。エクステンションと `settings.json` ファイルの両方で同じ名前のMCPサーバーが設定されている場合、`settings.json` ファイルで定義されたサーバーが優先されます。
  - `trust` を除くすべてのMCPサーバー設定オプションがサポートされていることに注意してください。
- `contextFileName`: エクステンションのコンテキストを含むファイルの名前です。これはエクステンションディレクトリからコンテキストをロードするために使用されます。このプロパティが使用されていないがエクステンションディレクトリに `QWEN.md` ファイルが存在する場合、そのファイルがロードされます。
- `excludeTools`: モデルから除外するツール名の配列です。`run_shell_command` ツールのように対応しているツールについては、コマンド固有の制限を指定することもできます。例えば、`"excludeTools": ["run_shell_command(rm -rf)"]` とすると `rm -rf` コマンドをブロックします。これはMCPサーバーの `excludeTools` 機能とは異なり、MCPサーバー設定でリストアップできることに注意してください。

Qwen Code が起動すると、すべてのエクステンションをロードしてその設定をマージします。競合がある場合は、ワークスペースの設定が優先されます。

### カスタムコマンド

拡張機能は、拡張機能ディレクトリ内の `commands/` サブディレクトリに TOML ファイルを配置することで、[カスタムコマンド](./cli/commands.md#custom-commands)を提供できます。これらのコマンドは、ユーザーおよびプロジェクトのカスタムコマンドと同じ形式に従い、標準的な命名規則を使用します。

**例**

以下のような構造を持つ `gcp` という名前の拡張機能:

```
.qwen/extensions/gcp/
├── qwen-extension.json
└── commands/
    ├── deploy.toml
    └── gcs/
        └── sync.toml
```

この拡張機能は以下のコマンドを提供します:

- `/deploy` - ヘルプでは `[gcp] Custom command from deploy.toml` として表示
- `/gcs:sync` - ヘルプでは `[gcp] Custom command from sync.toml` として表示

### コンフリクトの解決

拡張機能のコマンドは最も低い優先順位を持ちます。ユーザーまたはプロジェクトのコマンドと競合が発生した場合：

1. **競合なし**: 拡張機能コマンドは自然な名前を使用（例: `/deploy`）
2. **競合あり**: 拡張機能コマンドは拡張機能のプレフィックス付きでリネームされる（例: `/gcp.deploy`）

例えば、ユーザーと `gcp` 拡張機能の両方で `deploy` コマンドが定義されている場合：

- `/deploy` - ユーザーの deploy コマンドを実行
- `/gcp.deploy` - 拡張機能の deploy コマンドを実行（`[gcp]` タグ付き）

## 変数

Qwen Code 拡張機能では、`qwen-extension.json` で変数の置換が可能です。例えば、MCP サーバーを実行する際にカレントディレクトリが必要な場合、`"cwd": "${extensionPath}${/}run.ts"` のように指定できます。

**サポートされている変数:**

| 変数                        | 説明                                                                                                                                                        |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `${extensionPath}`          | ユーザーのファイルシステムにおける拡張機能の完全修飾パス（例: '/Users/username/.qwen/extensions/example-extension'）。シンボリックリンクは展開されません。 |
| `${workspacePath}`          | 現在のワークスペースの完全修飾パス。                                                                                                                       |
| `${/} or ${pathSeparator}`  | パス区切り文字（OS によって異なります）。                                                                                                                  |