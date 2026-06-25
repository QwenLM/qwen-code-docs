# Language Server Protocol (LSP) サポート

Qwen Code はネイティブの Language Server Protocol (LSP) サポートを提供しており、定義へのジャンプ・参照の検索・診断・コードアクションといった高度なコードインテリジェンス機能を利用できます。この統合により、AI エージェントがコードをより深く理解し、より正確なサポートを提供できるようになります。

## 概要

Qwen Code の LSP サポートは、コードを理解する言語サーバーに接続することで機能します。`.lsp.json`（または拡張機能）でサーバーを設定すると、Qwen Code はそれらを起動して以下の操作に使用できます。

- シンボルの定義へのナビゲーション
- シンボルへのすべての参照を検索
- ホバー情報の取得（ドキュメント、型情報）
- 診断メッセージの表示（エラー、警告）
- コードアクションへのアクセス（クイックフィックス、リファクタリング）
- コールヒエラルキーの解析

## クイックスタート

LSP は Qwen Code の試験的な機能です。有効にするには、`--experimental-lsp` コマンドラインフラグを使用してください。

```bash
qwen --experimental-lsp
```

LSP サーバーは設定ファイルで管理されます。Qwen Code が起動できるよう、`.lsp.json`（または拡張機能）で定義する必要があります。

### 前提条件

プログラミング言語に対応した言語サーバーをインストールしておく必要があります。

| 言語                  | 言語サーバー               | インストールコマンド                                                           |
| --------------------- | -------------------------- | ------------------------------------------------------------------------------ |
| TypeScript/JavaScript | typescript-language-server | `npm install -g typescript-language-server typescript`                         |
| Python                | pylsp                      | `pip install python-lsp-server`                                                |
| Go                    | gopls                      | `go install golang.org/x/tools/gopls@latest`                                   |
| Rust                  | rust-analyzer              | [インストールガイド](https://rust-analyzer.github.io/manual.html#installation) |
| C/C++                 | clangd                     | パッケージマネージャーで LLVM/clangd をインストール                             |
| Java                  | jdtls                      | JDTLS と JDK をインストール                                                    |

## 設定

### .lsp.json ファイル

プロジェクトルートに `.lsp.json` ファイルを置いて言語サーバーを設定できます。トップレベルの各キーが言語識別子で、その値がサーバー設定オブジェクトです。

**基本フォーマット:**

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

依存関係:

- clangd (LLVM) がインストールされ、PATH に含まれていること。
- 正確な結果を得るにはコンパイルデータベース（`compile_commands.json`）または `compile_flags.txt` が必要。

例:

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

依存関係:

- JDK がインストールされ、PATH に含まれていること（`java`）。
- JDTLS がインストールされ、PATH に含まれていること（`jdtls`）。

例:

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

| オプション | 型     | 説明                                                                                                                                               |
| ---------- | ------ | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `command`  | string | LSP サーバーを起動するコマンド。`PATH` で解決されるコマンド名（例: `clangd`）または絶対パス（例: `/opt/llvm/bin/clangd`）を指定できます。 |

#### オプションフィールド

| オプション              | 型       | デフォルト | 説明                                                    |
| ----------------------- | -------- | ---------- | ------------------------------------------------------- |
| `args`                  | string[] | `[]`       | コマンドライン引数                                      |
| `transport`             | string   | `"stdio"`  | トランスポートタイプ: `stdio`、`tcp`、または `socket`   |
| `env`                   | object   | -          | 環境変数                                                |
| `initializationOptions` | object   | -          | LSP 初期化オプション                                    |
| `settings`              | object   | -          | `workspace/didChangeConfiguration` 経由のサーバー設定  |
| `extensionToLanguage`   | object   | -          | ファイル拡張子から言語識別子へのマッピング              |
| `workspaceFolder`       | string   | -          | ワークスペースフォルダーの上書き（プロジェクトルート内）|
| `startupTimeout`        | number   | `10000`    | 起動タイムアウト（ミリ秒）                              |
| `shutdownTimeout`       | number   | `5000`     | シャットダウンタイムアウト（ミリ秒）                    |
| `restartOnCrash`        | boolean  | `false`    | クラッシュ時に自動再起動                                |
| `maxRestarts`           | number   | `3`        | 最大再起動回数                                          |
| `trustRequired`         | boolean  | `true`     | 信頼済みワークスペースを要求                            |

### TCP/Socket トランスポート

TCP または Unix ソケットトランスポートを使用するサーバーの場合:

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

## 使用可能な LSP 操作

Qwen Code は統一された `lsp` ツールを通じて LSP 機能を提供します。使用可能な操作は以下のとおりです。

位置ベースの操作（`goToDefinition`、`findReferences`、`hover`、`goToImplementation`、`prepareCallHierarchy`）には、正確な `filePath` + `line` + `character` の位置が必要です。正確な位置がわからない場合は、まず `workspaceSymbol` または `documentSymbol` でシンボルを特定してください。

### コードナビゲーション

#### 定義へジャンプ

シンボルが定義されている場所を検索します。

```
Operation: goToDefinition
Parameters:
  - filePath: Path to the file
  - line: Line number (1-based)
  - character: Column number (1-based)
```

#### 参照を検索

シンボルへのすべての参照を検索します。

```
Operation: findReferences
Parameters:
  - filePath: Path to the file
  - line: Line number (1-based)
  - character: Column number (1-based)
  - includeDeclaration: Include the declaration itself (optional)
```

#### 実装へジャンプ

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

ワークスペース全体からシンボルを検索します。

```
Operation: workspaceSymbol
Parameters:
  - query: Search query string
  - limit: Maximum results (optional)
```

### コールヒエラルキー

#### コールヒエラルキーの準備

指定した位置のコールヒエラルキーアイテムを取得します。

```
Operation: prepareCallHierarchy
Parameters:
  - filePath: Path to the file
  - line: Line number (1-based)
  - character: Column number (1-based)
```

#### 受信コール

指定した関数を呼び出すすべての関数を検索します。

```
Operation: incomingCalls
Parameters:
  - callHierarchyItem: Item from prepareCallHierarchy
```

#### 送信コール

指定した関数が呼び出すすべての関数を検索します。

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

指定した位置で使用可能なコードアクション（クイックフィックス、リファクタリング）を取得します。

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

コードアクションの種類:

- `quickfix` - エラー/警告のクイックフィックス
- `refactor` - リファクタリング操作
- `refactor.extract` - 関数/変数への抽出
- `refactor.inline` - 関数/変数のインライン化
- `source` - ソースコードアクション
- `source.organizeImports` - インポートの整理
- `source.fixAll` - 自動修正可能なすべての問題を修正

## セキュリティ

LSP サーバーはデフォルトで信頼済みワークスペースでのみ起動されます。これは、言語サーバーがユーザー権限で実行され、コードを実行できるためです。

### トラスト制御

- **信頼済みワークスペース**: 設定済みの場合、LSP サーバーが起動される
- **非信頼ワークスペース**: サーバー設定で `trustRequired: false` が設定されていない限り、LSP サーバーは起動されない

ワークスペースを信頼済みとしてマークするには、`/trust` コマンドを使用してください。

### サーバーごとのトラスト上書き

個々のサーバーのトラスト要件を設定で上書きできます。

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

1. **`--experimental-lsp` フラグを確認**: Qwen Code 起動時にフラグを使用しているか確認してください
2. **サーバーがインストールされているか確認**: コマンドを手動で実行（例: `clangd --version`）して確認してください
3. **コマンドを確認**: サーバーのバイナリがシステムの `PATH` に含まれているか、絶対パス（例: `/opt/llvm/bin/clangd`）で指定されている必要があります。ワークスペースを越える相対パスはブロックされます
4. **ワークスペースの信頼を確認**: LSP を使用するにはワークスペースが信頼済みである必要があります（`/trust` を使用）
5. **ログを確認**: `--debug` で Qwen Code を起動し、デバッグログの LSP 関連エントリーを検索してください（下記のデバッグセクション参照）
6. **プロセスを確認**: `ps aux | grep <server-name>` でサーバープロセスが実行されているか確認してください

### パフォーマンスが遅い

1. **大規模プロジェクト**: `node_modules` などの大きなディレクトリを除外することを検討してください
2. **サーバータイムアウト**: 起動が遅いサーバーの場合、サーバー設定の `startupTimeout` を増やしてください

### 結果が返ってこない

1. **サーバーの準備ができていない**: サーバーがまだインデックスを作成中の可能性があります。clangd を使う C/C++ プロジェクトでは、args に `--background-index` が含まれていること、プロジェクトルートまたは親ディレクトリに `compile_commands.json`（または `compile_flags.txt`）が存在することを確認してください。ビルドサブディレクトリにある場合は `--compile-commands-dir=<path>` を使用してください
2. **ファイルが保存されていない**: サーバーが変更を認識できるようにファイルを保存してください
3. **言語が違う**: 正しいサーバーがその言語用に実行されているか確認してください
4. **プロセスを確認**: `ps aux | grep <server-name>` でサーバーが実際に実行されているか確認してください

### デバッグ

LSP には専用のデバッグフラグはありません。Qwen Code の通常のデバッグモードと LSP 機能フラグを組み合わせて使用してください。

```bash
qwen --experimental-lsp --debug
```

デバッグログはセッションのデバッグログディレクトリに書き込まれます。LSP 関連のエントリーを確認するには:

```bash
# デフォルトのランタイムディレクトリ
rg "LSP|Native LSP|clangd|connection closed" ~/.qwen/debug/latest
# または ripgrep を使わない場合:
grep -E "LSP|Native LSP|clangd|connection closed" ~/.qwen/debug/latest

# QWEN_RUNTIME_DIR が設定されている場合
rg "LSP|Native LSP|clangd|connection closed" "$QWEN_RUNTIME_DIR/debug/latest"
```

有用なエントリー:

- `[LSP] ...`: ネイティブ LSP サービスおよびサーバーマネージャーが出力するログ。
- `[CONFIG] Native LSP status after discovery: ...`: セッションで検出された LSP サーバー設定。
- `[CONFIG] Native LSP status after startup: ...`: サーバー起動結果（準備完了/失敗の数を含む）。
- `[STATUS] LSP status snapshot for /status: ...`: デバッグモードで `/status` を実行したときに出力されるステータスのスナップショット。

CLI で `/status` を実行すると、LSP の簡易サマリーを確認できます。

```text
LSP: disabled
LSP: enabled, 1/1 ready
LSP: enabled, 0/1 ready (1 failed)
LSP: enabled, no servers configured
LSP: enabled, status unavailable
```

サーバーごとの詳細を確認するには `/lsp` を実行してください。

```text
**LSP Server Status**

| Server | Command | Languages | Status |
|--------|---------|-----------|--------|
| clangd | `clangd` | c, cpp | READY |
| pyright | `pyright-langserver` | python | FAILED - startup failed |
```

よく見られるエラーメッセージ:

```text
command path is unsafe        -> relative path escapes workspace, use absolute path or add to PATH
command not found             -> server binary not installed or not in PATH
requires trusted workspace    -> run /trust first
LSP connection closed         -> server started but exited or closed stdio before replying to initialize
```

clangd の起動に失敗した場合は、プロジェクトルートからサーバーを直接確認してください。

```bash
clangd --version
clangd --check=/path/to/file.cpp --log=verbose
```

C/C++ プロジェクトでは通常、`compile_commands.json` または `compile_flags.txt` が必要です。コンパイルデータベースがビルドディレクトリにある場合は、clangd に渡してください。

```json
{
  "cpp": {
    "command": "clangd",
    "args": ["--background-index", "--compile-commands-dir=build"]
  }
}
```

```bash
ps aux | grep clangd   # or typescript-language-server, jdtls, etc.
```

## 拡張機能の LSP 設定

拡張機能は `plugin.json` の `lspServers` フィールドを通じて LSP サーバー設定を提供できます。インラインオブジェクトまたは `.lsp.json` ファイルへのパスを指定できます。Qwen Code は拡張機能が有効になっているときにこれらの設定を読み込みます。フォーマットはプロジェクトの `.lsp.json` ファイルで使用される言語キーレイアウトと同じです。

## ベストプラクティス

1. **言語サーバーはグローバルにインストールする**: すべてのプロジェクトで使用できるようになります
2. **プロジェクト固有の設定を使用する**: 必要に応じて `.lsp.json` でプロジェクトごとにサーバーオプションを設定してください
3. **サーバーを最新に保つ**: 最良の結果を得るために言語サーバーを定期的に更新してください
4. **トラストは慎重に**: 信頼できるソースのワークスペースのみを信頼してください

## FAQ

### Q: LSP を有効にするにはどうすればよいですか？

Qwen Code を起動するときに `--experimental-lsp` フラグを使用してください。

```bash
qwen --experimental-lsp
```

### Q: どの言語サーバーが実行されているか確認するにはどうすればよいですか？

LSP とデバッグモードを有効にして Qwen Code を起動してください。

```bash
qwen --experimental-lsp --debug
```

その後、`/status` で簡易サマリーを、`/lsp` でサーバーごとのステータスを確認するか、デバッグログを調べてください。

```bash
# デフォルトのランタイムディレクトリ
rg "LSP|Native LSP|<server-name>" ~/.qwen/debug/latest
# または:
grep -E "LSP|Native LSP|<server-name>" ~/.qwen/debug/latest

# QWEN_RUNTIME_DIR が設定されている場合
rg "LSP|Native LSP|<server-name>" "$QWEN_RUNTIME_DIR/debug/latest"
```

LSP は Qwen Code の通常の `--debug` モードを使用します。LSP 専用のデバッグフラグはありません。

### Q: 同じファイルタイプに複数の言語サーバーを使用できますか？

はい、ただし各操作では 1 つだけが使用されます。最初に結果を返したサーバーが優先されます。

### Q: LSP はサンドボックスモードで動作しますか？

LSP サーバーはコードにアクセスするためにサンドボックスの外で実行されます。ワークスペースのトラスト制御の対象となります。
