# Qwen Code Extensions

Qwen Code は、機能を設定および拡張するために使用できる Extensions をサポートしています。

## 動作方法

起動時に、Qwen Code は以下の 2 つの場所で Extensions を検索します：

1.  `<workspace>/.qwen/extensions`
2.  `<home>/.qwen/extensions`

Qwen Code は両方の場所からすべての Extensions をロードします。同じ名前の Extension が両方の場所に存在する場合、ワークスペースディレクトリ内の Extension が優先されます。

各場所内で、個々の Extensions は `qwen-extension.json` ファイルを含むディレクトリとして存在します。例：

`<workspace>/.qwen/extensions/my-extension/qwen-extension.json`

### `qwen-extension.json`

`qwen-extension.json` ファイルには、エクステンションの設定が含まれています。ファイルの構造は以下の通りです：

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

- `name`: エクステンションの名前です。これは、エクステンションを一意に識別し、エクステンションのコマンドがユーザーまたはプロジェクトのコマンドと同じ名前を持つ場合の競合解決に使用されます。
- `version`: エクステンションのバージョンです。
- `mcpServers`: 設定する MCP サーバーのマップです。キーはサーバーの名前で、値はサーバーの設定です。これらのサーバーは、[`settings.json` ファイル](./cli/configuration.md)で設定された MCP サーバーと同様に、起動時にロードされます。エクステンションと `settings.json` ファイルの両方で同じ名前の MCP サーバーが設定されている場合、`settings.json` ファイルで定義されたサーバーが優先されます。
- `contextFileName`: エクステンションのコンテキストを含むファイルの名前です。ワークスペースからコンテキストをロードするために使用されます。このプロパティが使用されていないが、エクステンションディレクトリに `QWEN.md` ファイルが存在する場合、そのファイルがロードされます。
- `excludeTools`: モデルから除外するツール名の配列です。`run_shell_command` ツールのように、対応しているツールについてはコマンド固有の制限を指定することもできます。例えば、`"excludeTools": ["run_shell_command(rm -rf)"]` とすると、`rm -rf` コマンドがブロックされます。

Qwen Code が起動すると、すべてのエクステンションがロードされ、それらの設定がマージされます。競合がある場合は、ワークスペースの設定が優先されます。

## Extension Commands

拡張機能は、拡張機能ディレクトリ内の `commands/` サブディレクトリに TOML ファイルを配置することで、[カスタムコマンド](./cli/commands.md#custom-commands)を提供できます。これらのコマンドは、ユーザーおよびプロジェクトのカスタムコマンドと同じ形式に従い、標準的な命名規則を使用します。

### 例

以下の構造を持つ `gcp` という名前の拡張機能:

```
.qwen/extensions/gcp/
├── qwen-extension.json
└── commands/
    ├── deploy.toml
    └── gcs/
        └── sync.toml
```

以下のコマンドを提供します:

- `/deploy` - ヘルプでは `[gcp] Custom command from deploy.toml` として表示
- `/gcs:sync` - ヘルプでは `[gcp] Custom command from sync.toml` として表示

### コンフリクトの解決

Extension コマンドは最も低い優先順位を持ちます。ユーザーまたはプロジェクトのコマンドと競合が発生した場合：

1. **競合なし**: Extension コマンドは本来の名前を使用（例: `/deploy`）
2. **競合あり**: Extension コマンドは拡張機能のプレフィックス付きでリネームされる（例: `/gcp.deploy`）

例えば、ユーザーと `gcp` Extension の両方で `deploy` コマンドが定義されている場合：

- `/deploy` - ユーザーの deploy コマンドを実行
- `/gcp.deploy` - Extension の deploy コマンドを実行（`[gcp]` タグ付き）