# Qwen Code 拡張機能

Qwen Code の拡張機能パッケージには、プロンプト、MCP サーバー、およびカスタムコマンドが含まれており、親しみやすく使いやすい形式で提供されます。拡張機能を使用すると、Qwen Code の機能を拡張し、その機能を他の人と共有できます。これらは簡単にインストールおよび共有できるように設計されています。

## 拡張機能の管理

`qwen extensions` コマンドを使用した一連の拡張機能管理ツールを提供しています。

これらのコマンドは CLI 内ではサポートされていませんが、`/extensions list` サブコマンドを使用してインストール済みの拡張機能を一覧表示できます。

これらのコマンドはすべて、再起動時にアクティブな CLI セッションでのみ反映されることに注意してください。

### 拡張機能のインストール

GitHub の URL またはローカルパスを指定して、`qwen extensions install` を使用して拡張機能をインストールできます。

インストールされた拡張機能のコピーを作成するため、ローカルで定義された拡張機能および GitHub 上の拡張機能の変更を取り込むには、`qwen extensions update` を実行する必要があります。

```
qwen extensions install https://github.com/qwen-cli-extensions/security
```

これにより、`/security:analyze` コマンドをサポートする Qwen Code Security 拡張機能がインストールされます。

### 拡張機能のアンインストール

アンインストールするには、`qwen extensions uninstall 拡張機能名` を実行します。したがって、先ほどのインストール例では以下のようになります。

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

ローカルパスまたは Git リポジトリからインストールされた拡張機能については、`qwen extensions update 拡張機能名` を使用して、明示的に最新バージョン（`qwen-extension.json` の `version` フィールドに反映されているバージョン）へ更新できます。

すべての拡張機能を更新するには、以下を実行します：

```
qwen extensions update --all
```

## 拡張機能の作成

拡張機能開発を容易にするためのコマンドを提供しています。

### 基本的な拡張機能を作成する

いくつかのサンプル拡張機能として、`context`、`custom-commands`、`exclude-tools`、`mcp-server` があります。これらの例は[こちら](https://github.com/QwenLM/qwen-code/tree/main/packages/cli/src/commands/extensions/examples)で確認できます。

これらの例の中から1つを選択し、指定した種類の開発ディレクトリにコピーするには、以下を実行します：

```
qwen extensions new path/to/directory custom-commands
```

### ローカル拡張機能をリンクする

`qwen extensions link` コマンドは、拡張機能のインストールディレクトリから開発パスへのシンボリックリンクを作成します。

これにより、テストしたい変更を行うたびに `qwen extensions update` を実行する必要がなくなるため便利です。

```
qwen extensions link path/to/directory
```

## 動作原理

起動時に、Qwen Code は `<home>/.qwen/extensions` 内の拡張機能を探します。

拡張機能は `qwen-extension.json` ファイルを含むディレクトリとして存在します。例:

`<home>/.qwen/extensions/my-extension/qwen-extension.json`

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
  "excludeTools": ["run_shell_command"]
}
```

- `name`: 拡張機能の名前です。この拡張機能を一意に識別し、拡張機能のコマンドとユーザーまたはプロジェクトのコマンドの名前が重複した場合の競合解決に使用されます。名前は小文字または数字で、アンダースコアやスペースの代わりにハイフンを使用してください。これは、CLI でユーザーがあなたの拡張機能を参照する方法です。なお、この名前は拡張機能ディレクトリ名と一致している必要があります。
- `version`: 拡張機能のバージョンです。
- `mcpServers`: 設定する MCP サーバーのマップです。キーはサーバーの名前、値はサーバーの設定です。これらのサーバーは、[`settings.json` ファイル](./cli/configuration.md) で設定された MCP サーバーと同様に起動時に読み込まれます。拡張機能と `settings.json` ファイルの両方が同じ名前の MCP サーバーを設定している場合、`settings.json` ファイルで定義されたサーバーが優先されます。
  - `trust` を除くすべての MCP サーバー設定オプションがサポートされています。
- `contextFileName`: 拡張機能のコンテキストを含むファイル名です。これを使用して、拡張機能ディレクトリからコンテキストを読み込みます。このプロパティが使用されておらず、拡張機能ディレクトリに `QWEN.md` ファイルが存在する場合は、そのファイルが読み込まれます。
- `excludeTools`: モデルから除外するツール名の配列です。`run_shell_command` ツールのように、それをサポートするツールに対してコマンド固有の制限を指定することもできます。例えば、`"excludeTools": ["run_shell_command(rm -rf)"]` とすると、`rm -rf` コマンドがブロックされます。これは、MCP サーバーの設定でリストできる MCP サーバーの `excludeTools` 機能とは異なることに注意してください。**重要:** `excludeTools` で指定されたツールは、会話コンテキスト全体で無効になり、現在のセッション内の以降のすべてのクエリに影響します。

Qwen Code が起動すると、すべての拡張機能が読み込まれ、その設定がマージされます。競合がある場合は、ワークスペースの設定が優先されます。

### カスタムコマンド

拡張機能は、拡張ディレクトリ内の `commands/` サブディレクトリに TOML ファイルを配置することで、[カスタムコマンド](./cli/commands.md#custom-commands) を提供できます。これらのコマンドは、ユーザーおよびプロジェクトのカスタムコマンドと同じ形式に従い、標準的な命名規則を使用します。

**例**

以下の構造を持つ `gcp` という名前の拡張機能を考えてみましょう：

```
.qwen/extensions/gcp/
├── qwen-extension.json
└── commands/
    ├── deploy.toml
    └── gcs/
        └── sync.toml
```

この場合、以下のコマンドが提供されます：

- `/deploy` - ヘルプには `[gcp] Custom command from deploy.toml` として表示されます
- `/gcs:sync` - ヘルプには `[gcp] Custom command from sync.toml` として表示されます

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