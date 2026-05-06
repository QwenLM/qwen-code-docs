# Language Server Protocol (LSP) サポート

Qwen Code は Language Server Protocol (LSP) をネイティブにサポートしており、定義へ移動、参照の検索、診断、コードアクションなどの高度なコードインテリジェンス機能を利用できます。この統合により、AI エージェントがコードをより深く理解し、より正確な支援を提供できるようになります。

## 概要

Qwen Code の LSP サポートは、コードを理解する言語サーバーに接続することで動作します。`.lsp.json`（または拡張機能）でサーバーを設定すると、Qwen Code はそれらを起動し、以下の操作に利用できます：

- シンボルの定義へ移動
- シンボルへのすべての参照を検索
- ホバー情報の取得（ドキュメント、型情報）
- 診断メッセージの表示（エラー、警告）
- コードアクションへのアクセス（クイックフィックス、リファクタリング）
- コール階層の分析

## クイックスタート

LSP は Qwen Code の実験的機能です。有効にするには、`--experimental-lsp` コマンドラインフラグを使用します：

```bash
qwen --experimental-lsp
```

LSP サーバーは構成駆動型です。Qwen Code がサーバーを起動するには、`.lsp.json`（または拡張機能経由）で定義する必要があります。

### 前提条件

プログラミング言語に対応する言語サーバーがインストールされている必要があります：

| 言語              | 言語サーバー            | インストールコマンド                                                                |
| --------------------- | -------------------------- | ------------------------------------------------------------------------------ |
| TypeScript/JavaScript | typescript-language-server | `npm install -g typescript-language-server typescript`                         |
| Python                | pylsp                      | `pip install python-lsp-server`                                                |
| Go                    | gopls                      | `go install golang.org/x/tools/gopls@latest`                                   |
| Rust                  | rust-analyzer              | [インストールガイド](https://rust-analyzer.github.io/manual.html#installation) |
| C/C++                 | clangd                     | パッケージマネージャー経由で LLVM/clangd をインストール                                   |
| Java                  | jdtls                      | JDTLS と JDK をインストール                                                        |

## 設定

### .lsp.json ファイル

プロジェクトルートの `.lsp.json` ファイルを使用して言語サーバーを設定できます。各トップレベルのキーは言語識別子であり、その値はサーバー設定オブジェクトです。

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

### C/C++ (clangd) の設定

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

### Java (jdtls) の設定

依存関係：

- JDK がインストールされ、PATH (`java`) で利用可能である必要があります。
- JDTLS がインストールされ、PATH (`jdtls`) で利用可能である必要があります。

例：

```json
{
  "java": {
    "command": "jdtls",
    "args": ["-configuration", ".jdtls-config", "-data", ".jdtls-workspace"]
  }
}
```

### 設定オプション

#### 必須フィールド

| オプション    | 型   | 説明                                                                                                                                       |
| --------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `command` | string | LSP サーバーを起動するコマンド。`PATH` 経由で解決されるコマンド名（例：`clangd`）や絶対パス（例：`/opt/llvm/bin/clangd`）をサポートします |

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

Qwen Code は、統合された `lsp` ツールを通じて LSP 機能を提供します。利用可能な操作は以下の通りです：

位置ベースの操作（`goToDefinition`、`findReferences`、`hover`、`goToImplementation`、および `prepareCallHierarchy`）には、正確な `filePath` + `line` + `character` の位置が必要です。正確な位置がわからない場合は、まず `workspaceSymbol` または `documentSymbol` を使用してシンボルを特定してください。

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

指定された位置のコール階層アイテムを取得します。

```
Operation: prepareCallHierarchy
Parameters:
  - filePath: Path to the file
  - line: Line number (1-based)
  - character: Column number (1-based)
```

#### 呼び出し元（Incoming Calls）

指定された関数を呼び出すすべての関数を検索します。

```
Operation: incomingCalls
Parameters:
  - callHierarchyItem: Item from prepareCallHierarchy
```

#### 呼び出し先（Outgoing Calls）

指定された関数から呼び出されるすべての関数を検索します。

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

指定された位置で利用可能なコードアクション（クイックフィックス、リファクタリング）を取得します。

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
- `source.fixAll` - 自動修正可能なすべての問題の修正

## セキュリティ

LSP サーバーは、デフォルトでは信頼されたワークスペースでのみ起動されます。これは、言語サーバーがユーザー権限で実行され、コードを実行できるためです。

### 信頼コントロール

- **信頼されたワークスペース**: 設定されていれば LSP サーバーが起動します
- **信頼されていないワークスペース**: サーバー設定で `trustRequired: false` が設定されていない限り、LSP サーバーは起動しません

ワークスペースを信頼済みとしてマークするには、`/trust` コマンドを使用します。

### サーバーごとの信頼設定の上書き

設定内で特定のサーバーに対する信頼要件を上書きできます：

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

1. **`--experimental-lsp` フラグの確認**: Qwen Code 起動時にフラグを使用していることを確認してください
2. **サーバーのインストール確認**: コマンドを手動で実行（例：`clangd --version`）して確認してください
3. **コマンドの確認**: サーバーのバイナリはシステムの `PATH` に存在するか、絶対パス（例：`/opt/llvm/bin/clangd`）で指定されている必要があります。ワークスペース外に逸脱する相対パスはブロックされます
4. **ワークスペースの信頼確認**: LSP を使用するにはワークスペースが信頼されている必要があります（`/trust` を使用）
5. **ログの確認**: デバッグログ内の `[LSP]` エントリを確認してください（以下のデバッグセクションを参照）
6. **プロセスの確認**: `ps aux | grep <server-name>` を実行して、サーバープロセスが実行中であることを確認してください

### パフォーマンスの低下

1. **大規模プロジェクト**: `node_modules` やその他の大規模なディレクトリを除外することを検討してください
2. **サーバーのタイムアウト**: 起動が遅いサーバーの場合は、サーバー設定の `startupTimeout` を増やしてください

### 結果が返らない

1. **サーバーの準備未完了**: サーバーがまだインデックスを作成中の可能性があります。clangd を使用する C/C++ プロジェクトの場合、引数に `--background-index` が含まれており、プロジェクトルートまたは親ディレクトリに `compile_commands.json`（または `compile_flags.txt`）が存在することを確認してください。ビルドサブディレクトリにある場合は `--compile-commands-dir=<path>` を使用してください
2. **ファイルが保存されていない**: サーバーが変更を検知できるよう、ファイルを保存してください
3. **言語の不一致**: 使用している言語に対して正しいサーバーが実行中か確認してください
4. **プロセスの確認**: `ps aux | grep <server-name>` を実行して、サーバーが実際に実行中であることを確認してください

### デバッグ

LSP のデバッグログは、`~/.qwen/debug/` 内のセッションログファイルに自動的に書き込まれます。LSP 関連のエントリを確認するには：

```bash
# View the latest session log
grep '\[LSP\]' ~/.qwen/debug/latest

# Common error messages to look for:
#   "command path is unsafe"  → relative path escapes workspace, use absolute path or add to PATH
#   "command not found"       → server binary not installed or not in PATH
#   "requires trusted workspace" → run /trust first
```

サーバープロセスが実行中であることも確認できます：

```bash
ps aux | grep clangd   # or typescript-language-server, jdtls, etc.
```

## 拡張機能の LSP 設定

拡張機能は、`plugin.json` の `lspServers` フィールドを通じて LSP サーバー設定を提供できます。これはインラインオブジェクト、または `.lsp.json` ファイルへのパスのいずれかです。Qwen Code は拡張機能が有効になるとこれらの設定を読み込みます。形式はプロジェクトの `.lsp.json` ファイルで使用される言語キー形式と同じです。

## ベストプラクティス

1. **言語サーバーをグローバルにインストールする**: すべてのプロジェクトで利用可能になります
2. **プロジェクト固有の設定を使用する**: 必要に応じて `.lsp.json` でプロジェクトごとにサーバーオプションを設定します
3. **サーバーを最新の状態に保つ**: 最適な結果を得るために、言語サーバーを定期的に更新してください
4. **信頼設定を慎重に行う**: 信頼できるソースからのワークスペースのみを信頼してください

## FAQ

### Q: LSP を有効にするにはどうすればよいですか？

Qwen Code 起動時に `--experimental-lsp` フラグを使用します：

```bash
qwen --experimental-lsp
```

### Q: どの言語サーバーが実行中か確認するには？

デバッグログの `[LSP]` エントリを確認するか（`grep '\[LSP\]' ~/.qwen/debug/latest`）、`ps aux | grep <server-name>` でプロセスを直接確認してください。

### Q: 同じファイルタイプに対して複数の言語サーバーを使用できますか？

はい。ただし、各操作には 1 つのサーバーのみが使用されます。最初に結果を返したサーバーが優先されます。

### Q: LSP はサンドボックスモードで動作しますか？

LSP サーバーはコードにアクセスするため、サンドボックスの外で実行されます。ワークスペースの信頼コントロールの対象となります。