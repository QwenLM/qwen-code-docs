# Language Server Protocol (LSP) サポート

Qwen Code は Language Server Protocol (LSP) をネイティブにサポートしており、定義へ移動、参照の検索、診断、コードアクションなどの高度なコードインテリジェンス機能を有効にします。この統合により、AI エージェントがコードをより深く理解し、より正確な支援を提供できるようになります。

## 概要

Qwen Code の LSP サポートは、コードを理解する言語サーバーに接続することで機能します。`.lsp.json`（または拡張機能）でサーバーを設定すると、Qwen Code はそれらを起動し、以下の操作に利用できます：

- シンボルの定義へ移動
- シンボルへのすべての参照を検索
- ホバー情報（ドキュメント、型情報）の取得
- 診断メッセージ（エラー、警告）の表示
- コードアクション（クイックフィックス、リファクタリング）へのアクセス
- コール階層の分析

## クイックスタート

LSP は Qwen Code の実験的機能です。有効にするには、`--experimental-lsp` コマンドラインフラグを使用します：

```bash
qwen --experimental-lsp
```

LSP サーバーは構成駆動型です。Qwen Code がサーバーを起動するには、`.lsp.json`（または拡張機能経由）で定義する必要があります。

### 前提条件

使用しているプログラミング言語の言語サーバーがインストールされている必要があります：

| 言語              | 言語サーバー            | インストールコマンド                                                                |
| --------------------- | -------------------------- | ------------------------------------------------------------------------------ |
| TypeScript/JavaScript | typescript-language-server | `npm install -g typescript-language-server typescript`                         |
| Python                | pylsp                      | `pip install python-lsp-server`                                                |
| Go                    | gopls                      | `go install golang.org/x/tools/gopls@latest`                                   |
| Rust                  | rust-analyzer              | [Installation guide](https://rust-analyzer.github.io/manual.html#installation) |
| C/C++                 | clangd                     | パッケージマネージャー経由で LLVM/clangd をインストール                                   |
| Java                  | jdtls                      | JDTLS と JDK をインストール                                                        |

## 構成

### .lsp.json ファイル

プロジェクトルートの `.lsp.json` ファイルを使用して言語サーバーを構成できます。これは、[Claude Code プラグイン LSP 構成リファレンス](https://code.claude.com/docs/en/plugins-reference#lsp-servers) で説明されている言語キー形式を使用します。

**基本形式：**

```json
{
  "typescript": {
    "command": "typescript-language-server",
    "args": ["--stdio"],
    "extensionToLanguage": {
      ".ts": "typescript",
      ".tsx": "typescriptreact",
      ".js": "javascript",
      ".jsx": "javascriptreact"
    }
  }
}
```

### C/C++ (clangd) の構成

依存関係：

- clangd (LLVM) がインストールされ、PATH で利用可能である必要があります。
- 正確な結果を得るには、コンパイルデータベース（`compile_commands.json`）または `compile_flags.txt` が必要です。

例：

```json
{
  "cpp": {
    "command": "clangd",
    "args": [
      "--background-index",
      "--clang-tidy",
      "--header-insertion=iwyu",
      "--completion-style=detailed"
    ]
  }
}
```

### Java (jdtls) の構成

依存関係：

- JDK がインストールされ、PATH（`java`）で利用可能である必要があります。
- JDTLS がインストールされ、PATH（`jdtls`）で利用可能である必要があります。

例：

```json
{
  "java": {
    "command": "jdtls",
    "args": ["-configuration", ".jdtls-config", "-data", ".jdtls-workspace"]
  }
}
```

### 構成オプション

#### 必須フィールド

| オプション    | 型   | 説明                                       |
| --------- | ------ | ------------------------------------------------- |
| `command` | string | LSP サーバーを起動するコマンド（PATH 内にある必要があります） |

#### オプションフィールド

| オプション                  | 型     | デフォルト   | 説明                                             |
| ----------------------- | -------- | --------- | ------------------------------------------------------- |
| `args`                  | string[] | `[]`      | コマンドライン引数                                  |
| `transport`             | string   | `"stdio"` | トランスポートタイプ：`stdio`、`tcp`、または `socket`             |
| `env`                   | object   | -         | 環境変数                                   |
| `initializationOptions` | object   | -         | LSP 初期化オプション                              |
| `settings`              | object   | -         | `workspace/didChangeConfiguration` 経由のサーバー設定  |
| `extensionToLanguage`   | object   | -         | ファイル拡張子を言語識別子にマッピング            |
| `workspaceFolder`       | string   | -         | ワークスペースフォルダーの上書き（プロジェクトルート内である必要があります） |
| `startupTimeout`        | number   | `10000`   | 起動タイムアウト（ミリ秒）                         |
| `shutdownTimeout`       | number   | `5000`    | シャットダウンタイムアウト（ミリ秒）                        |
| `restartOnCrash`        | boolean  | `false`   | クラッシュ時の自動再起動                                   |
| `maxRestarts`           | number   | `3`       | 最大再起動試行回数                                |
| `trustRequired`         | boolean  | `true`    | 信頼されたワークスペースを要求                               |

### TCP/Socket トランスポート

TCP または Unix ソケットトランスポートを使用するサーバーの場合：

```json
{
  "remote-lsp": {
    "transport": "tcp",
    "socket": {
      "host": "127.0.0.1",
      "port": 9999
    },
    "extensionToLanguage": {
      ".custom": "custom"
    }
  }
}
```

## 利用可能な LSP 操作

Qwen Code は、統合された `lsp` ツールを通じて LSP 機能を公開します。利用可能な操作は次のとおりです：

### コードナビゲーション

#### 定義へ移動

シンボルが定義されている場所を検索します。

```
Operation: goToDefinition
Parameters:
  - filePath: Path to the file
  - line: Line number (1-based)
  - character: Column number (1-based)
```

#### 参照の検索

シンボルへのすべての参照を検索します。

```
Operation: findReferences
Parameters:
  - filePath: Path to the file
  - line: Line number (1-based)
  - character: Column number (1-based)
  - includeDeclaration: Include the declaration itself (optional)
```

#### 実装へ移動

インターフェースまたは抽象メソッドの実装を検索します。

```
Operation: goToImplementation
Parameters:
  - filePath: Path to the file
  - line: Line number (1-based)
  - character: Column number (1-based)
```

### シンボル情報

#### ホバー

シンボルのドキュメントと型情報を取得します。

```
Operation: hover
Parameters:
  - filePath: Path to the file
  - line: Line number (1-based)
  - character: Column number (1-based)
```

#### ドキュメントシンボル

ドキュメント内のすべてのシンボルを取得します。

```
Operation: documentSymbol
Parameters:
  - filePath: Path to the file
```

#### ワークスペースシンボル検索

ワークスペース全体でシンボルを検索します。

```
Operation: workspaceSymbol
Parameters:
  - query: Search query string
  - limit: Maximum results (optional)
```

### コール階層

#### コール階層の準備

指定位置のコール階層アイテムを取得します。

```
Operation: prepareCallHierarchy
Parameters:
  - filePath: Path to the file
  - line: Line number (1-based)
  - character: Column number (1-based)
```

#### 呼び出し元（Incoming Calls）

指定された関数を呼び出しているすべての関数を検索します。

```
Operation: incomingCalls
Parameters:
  - callHierarchyItem: Item from prepareCallHierarchy
```

#### 呼び出し先（Outgoing Calls）

指定された関数から呼び出されているすべての関数を検索します。

```
Operation: outgoingCalls
Parameters:
  - callHierarchyItem: Item from prepareCallHierarchy
```

### 診断

#### ファイル診断

ファイルの診断メッセージ（エラー、警告）を取得します。

```
Operation: diagnostics
Parameters:
  - filePath: Path to the file
```

#### ワークスペース診断

ワークスペース全体のすべての診断メッセージを取得します。

```
Operation: workspaceDiagnostics
Parameters:
  - limit: Maximum results (optional)
```

### コードアクション

#### コードアクションの取得

指定位置で利用可能なコードアクション（クイックフィックス、リファクタリング）を取得します。

```
Operation: codeActions
Parameters:
  - filePath: Path to the file
  - line: Start line number (1-based)
  - character: Start column number (1-based)
  - endLine: End line number (optional, defaults to line)
  - endCharacter: End column (optional, defaults to character)
  - diagnostics: Diagnostics to get actions for (optional)
  - codeActionKinds: Filter by action kind (optional)
```

コードアクションの種類：

- `quickfix` - エラー/警告のクイックフィックス
- `refactor` - リファクタリング操作
- `refactor.extract` - 関数/変数への抽出
- `refactor.inline` - 関数/変数のインライン化
- `source` - ソースコードアクション
- `source.organizeImports` - インポートの整理
- `source.fixAll` - 自動修正可能なすべての問題を修正

## セキュリティ

LSP サーバーは、デフォルトでは信頼されたワークスペースでのみ起動します。これは、言語サーバーがユーザー権限で実行され、コードを実行できるためです。

### 信頼コントロール

- **信頼されたワークスペース**: 構成されていれば LSP サーバーが起動します
- **信頼されていないワークスペース**: サーバー構成で `trustRequired: false` が設定されていない限り、LSP サーバーは起動しません

ワークスペースを信頼済みとしてマークするには、`/trust` コマンドを使用するか、設定で信頼済みフォルダーを構成します。

### サーバーごとの信頼オーバーライド

構成内で特定のサーバーの信頼要件をオーバーライドできます：

```json
{
  "safe-server": {
    "command": "safe-language-server",
    "args": ["--stdio"],
    "trustRequired": false,
    "extensionToLanguage": {
      ".safe": "safe"
    }
  }
}
```

## トラブルシューティング

### サーバーが起動しない

1. **サーバーがインストールされているか確認する**: コマンドを手動で実行して確認します
2. **PATH を確認する**: サーバーバイナリがシステムの PATH に含まれていることを確認します
3. **ワークスペースの信頼を確認する**: LSP を使用するにはワークスペースが信頼されている必要があります
4. **ログを確認する**: コンソール出力にエラーメッセージがないか確認します
5. **`--experimental-lsp` フラグを確認する**: Qwen Code 起動時にフラグを使用していることを確認します

### パフォーマンスの低下

1. **大規模プロジェクト**: `node_modules` やその他の大容量ディレクトリを除外することを検討します
2. **サーバータイムアウト**: 起動が遅いサーバーの場合、構成の `startupTimeout` を増やします

### 結果が返らない

1. **サーバーの準備ができていない**: サーバーがまだインデックスを作成中の可能性があります
2. **ファイルが保存されていない**: サーバーが変更を反映するにはファイルを保存する必要があります
3. **言語が間違っている**: 使用している言語に対して正しいサーバーが実行されているか確認します

### デバッグ

LSP 通信を確認するには、デバッグログを有効にします：

```bash
DEBUG=lsp* qwen --experimental-lsp
```

または、`packages/cli/LSP_DEBUGGING_GUIDE.md` の LSP デバッグガイドを参照してください。

## Claude Code との互換性

Qwen Code は、[Claude Code プラグインリファレンス](https://code.claude.com/docs/en/plugins-reference#lsp-servers) で定義されている言語キー形式の Claude Code スタイル `.lsp.json` 構成ファイルをサポートしています。Claude Code から移行する場合は、構成で言語をキーとするレイアウトを使用してください。

### 構成形式

推奨形式は Claude Code の仕様に従います：

```json
{
  "go": {
    "command": "gopls",
    "args": ["serve"],
    "extensionToLanguage": {
      ".go": "go"
    }
  }
}
```

Claude Code LSP プラグインは、`plugin.json`（または参照される `.lsp.json`）で `lspServers` を提供することもできます。Qwen Code は拡張機能が有効な場合にこれらの構成を読み込み、同じ言語キー形式を使用する必要があります。

## ベストプラクティス

1. **言語サーバーをグローバルにインストールする**: すべてのプロジェクトで利用可能になります
2. **プロジェクト固有の設定を使用する**: 必要に応じて `.lsp.json` でプロジェクトごとにサーバーオプションを構成します
3. **サーバーを最新の状態に保つ**: 最適な結果を得るために言語サーバーを定期的に更新します
4. **信頼は慎重に設定する**: 信頼できるソースからのワークスペースのみを信頼します

## FAQ

### Q: LSP を有効にするにはどうすればよいですか？

Qwen Code 起動時に `--experimental-lsp` フラグを使用します：

```bash
qwen --experimental-lsp
```

### Q: どの言語サーバーが実行されているか確認するにはどうすればよいですか？

`/lsp status` コマンドを使用して、構成済みおよび実行中のすべての言語サーバーを確認できます。

### Q: 同じファイルタイプに対して複数の言語サーバーを使用できますか？

はい。ただし、各操作で使用されるのは 1 つのみです。最初に結果を返したサーバーが優先されます。

### Q: LSP はサンドボックスモードで動作しますか？

LSP サーバーはコードにアクセスするため、サンドボックスの外で実行されます。ワークスペースの信頼コントロールの対象となります。