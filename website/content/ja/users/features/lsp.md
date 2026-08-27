# Language Server Protocol (LSP) サポート

Qwen Code はネイティブの Language Server Protocol（LSP）サポートを提供し、定義へ移動、参照検索、診断、コードアクションなどの高度なコードインテリジェンス機能を実現します。この統合により、AI エージェントはコードをより深く理解し、より正確な支援を提供できます。

## 概要

Qwen Code の LSP サポートは、コードを理解する言語サーバーに接続することで機能します。`.lsp.json`（または拡張機能）を介してサーバーを設定すると、Qwen Code はそれらを起動し、以下の用途に使用できます：

- シンボル定義への移動
- シンボルのすべての参照を検索
- ホバー情報の取得（ドキュメント、型情報）
- 診断メッセージの表示（エラー、警告）
- コードアクションへのアクセス（クイックフィックス、リファクタリング）
- 呼び出し階層の分析

## クイックスタート

LSP は Qwen Code の実験的機能です。有効にするには、`--experimental-lsp` コマンドラインフラグを使用します：

```bash
qwen --experimental-lsp
```

LSP サーバーは設定駆動型です。Qwen Code がそれらを起動するには、`.lsp.json`（または拡張機能経由）で定義する必要があります。

### 前提条件

使用するプログラミング言語の言語サーバーがインストールされている必要があります：

| 言語                 | 言語サーバー              | インストールコマンド                                                              |
| -------------------- | ------------------------- | ---------------------------------------------------------------------------------- |
| TypeScript/JavaScript | typescript-language-server | `npm install -g typescript-language-server typescript`                           |
| Python               | pylsp                     | `pip install python-lsp-server`                                                  |
| Go                   | gopls                     | `go install golang.org/x/tools/gopls@latest`                                     |
| Rust                 | rust-analyzer             | [インストールガイド](https://rust-analyzer.github.io/manual.html#installation)   |
| C/C++                | clangd                    | パッケージマネージャー経由で LLVM/clangd をインストール                           |
| Java                 | jdtls                     | JDTLS と JDK をインストール                                                       |

## 設定

### .lsp.json ファイル

プロジェクトルートに `.lsp.json` ファイルを置くことで、言語サーバーを設定できます。各トップレベルのキーは言語識別子で、その値がサーバー設定オブジェクトです。

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

### C/C++（clangd）の設定

依存関係：

- clangd（LLVM）がインストールされ、PATH が通っていること。
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

### Java（jdtls）の設定

依存関係：

- JDK がインストールされ、PATH が通っていること（`java` コマンド）。
- JDTLS がインストールされ、PATH が通っていること（`jdtls` コマンド）。

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

| オプション | 型     | 説明                                                                                                     |
| ---------- | ------ | -------------------------------------------------------------------------------------------------------- |
| `command`  | string | LSP サーバーを起動するコマンド。`PATH` から解決される単純なコマンド名（例：`clangd`）や絶対パス（例：`/opt/llvm/bin/clangd`）をサポート |

#### オプションフィールド

| オプション                | 型       | デフォルト  | 説明                                                                 |
| ------------------------- | -------- | ----------- | -------------------------------------------------------------------- |
| `args`                    | string[] | `[]`        | コマンドライン引数                                                  |
| `transport`               | string   | `"stdio"`   | トランスポートタイプ：`stdio`、`tcp`、`socket`                     |
| `env`                     | object   | -           | 環境変数                                                             |
| `initializationOptions`   | object   | -           | LSP 初期化オプション                                                  |
| `settings`                | object   | -           | `workspace/didChangeConfiguration` を介したサーバー設定               |
| `extensionToLanguage`     | object   | -           | ファイル拡張子と言語識別子のマッピング                                 |
| `workspaceFolder`         | string   | -           | ワークスペースフォルダの上書き（プロジェクトルート内である必要があります） |
| `startupTimeout`          | number   | `10000`     | 起動タイムアウト（ミリ秒）                                           |
| `shutdownTimeout`         | number   | `5000`      | シャットダウンタイムアウト（ミリ秒）                                   |
| `restartOnCrash`          | boolean  | `false`     | クラッシュ時の自動再起動                                             |
| `maxRestarts`             | number   | `3`         | 最大再起動試行回数                                                   |
| `trustRequired`           | boolean  | `true`      | 信頼されたワークスペースが必要                                       |

### TCP/Socket トランスポート

TCP または Unix ソケットトランスポートを使用するサーバー向け：

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

Qwen Code は、統合された `lsp` ツールを通じて LSP 機能を公開します。利用可能な操作は以下の通りです：

位置ベースの操作（`goToDefinition`、`findReferences`、`hover`、`goToImplementation`、`prepareCallHierarchy`）には、正確な `filePath` + `line` + `character` 位置が必要です。正確な位置がわからない場合は、最初に `workspaceSymbol` または `documentSymbol` を使用してシンボルを見つけてください。

### コードナビゲーション

#### 定義へ移動

シンボルが定義されている場所を検索します。

```
Operation: goToDefinition
Parameters:
  - filePath: ファイルへのパス
  - line: 行番号（1 ベース）
  - character: 列番号（1 ベース）
```

#### 参照の検索

シンボルへのすべての参照を検索します。

```
Operation: findReferences
Parameters:
  - filePath: ファイルへのパス
  - line: 行番号（1 ベース）
  - character: 列番号（1 ベース）
  - includeDeclaration: 宣言自体を含めるかどうか（オプション）
```

#### 実装へ移動

インターフェースや抽象メソッドの実装を検索します。

```
Operation: goToImplementation
Parameters:
  - filePath: ファイルへのパス
  - line: 行番号（1 ベース）
  - character: 列番号（1 ベース）
```

### シンボル情報

#### ホバー

シンボルのドキュメントと型情報を取得します。

```
Operation: hover
Parameters:
  - filePath: ファイルへのパス
  - line: 行番号（1 ベース）
  - character: 列番号（1 ベース）
```

#### ドキュメント内のシンボル

ドキュメント内のすべてのシンボルを取得します。

```
Operation: documentSymbol
Parameters:
  - filePath: ファイルへのパス
```

#### ワークスペースシンボル検索

ワークスペース全体でシンボルを検索します。

```
Operation: workspaceSymbol
Parameters:
  - query: 検索クエリ文字列
  - limit: 最大結果数（オプション）
```

### 呼び出し階層

#### 呼び出し階層の準備

指定された位置の呼び出し階層アイテムを取得します。

```
Operation: prepareCallHierarchy
Parameters:
  - filePath: ファイルへのパス
  - line: 行番号（1 ベース）
  - character: 列番号（1 ベース）
```

#### 呼び出し元（インカミングコール）

指定された関数を呼び出すすべての関数を検索します。

```
Operation: incomingCalls
Parameters:
  - callHierarchyItem: prepareCallHierarchy からのアイテム
```

#### 呼び出し先（アウトゴーイングコール）

指定された関数が呼び出すすべての関数を検索します。

```
Operation: outgoingCalls
Parameters:
  - callHierarchyItem: prepareCallHierarchy からのアイテム
```

### 診断

#### ファイル診断

ファイルの診断メッセージ（エラー、警告）を取得します。

```
Operation: diagnostics
Parameters:
  - filePath: ファイルへのパス
```

#### ワークスペース診断

ワークスペース全体のすべての診断メッセージを取得します。

```
Operation: workspaceDiagnostics
Parameters:
  - limit: 最大結果数（オプション）
```

### コードアクション

#### コードアクションの取得

指定された位置で利用可能なコードアクション（クイックフィックス、リファクタリング）を取得します。

```
Operation: codeActions
Parameters:
  - filePath: ファイルへのパス
  - line: 開始行番号（1 ベース）
  - character: 開始列番号（1 ベース）
  - endLine: 終了行番号（オプション、デフォルトは line）
  - endCharacter: 終了列番号（オプション、デフォルトは character）
  - diagnostics: アクションを取得する診断（オプション）
  - codeActionKinds: アクションの種類でフィルター（オプション）
```

コードアクションの種類：

- `quickfix` - エラー/警告のクイックフィックス
- `refactor` - リファクタリング操作
- `refactor.extract` - 関数/変数への抽出
- `refactor.inline` - 関数/変数のインライン化
- `source` - ソースコードアクション
- `source.organizeImports` - インポートの整理
- `source.fixAll` - 自動修正可能な問題をすべて修正

## セキュリティ

LSP サーバーは、デフォルトでは信頼されたワークスペースでのみ起動されます。言語サーバーはユーザーの権限で実行され、コードを実行できる可能性があるためです。

### 信頼制御

- **信頼されたワークスペース**：設定されていれば LSP サーバーが起動します
- **信頼されていないワークスペース**：サーバー設定で `trustRequired: false` が設定されていない限り、LSP サーバーは起動しません

ワークスペースを信頼するには、`/trust` コマンドを使用します。

### サーバーごとの信頼オーバーライド

特定のサーバーの信頼要件を、その設定でオーバーライドできます：

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

1. **`--experimental-lsp` フラグを確認**：Qwen Code 起動時にフラグを使用していることを確認してください
2. **サーバーがインストールされているか確認**：コマンドを手動で実行（例：`clangd --version`）して確認してください
3. **コマンドを確認**：サーバーバイナリがシステムの `PATH` にあるか、絶対パス（例：`/opt/llvm/bin/clangd`）で指定されている必要があります。ワークスペース外への相対パスはブロックされます
4. **ワークスペースの信頼を確認**：LSP を使用するにはワークスペースが信頼されている必要があります（`/trust` を使用）
5. **ログを確認**：`--debug` フラグを付けて Qwen Code を起動し、デバッグログ内の LSP 関連エントリを検索してください（下記のデバッグセクションを参照）
6. **プロセスを確認**：`ps aux | grep <サーバー名>` を実行してサーバープロセスが動作しているか確認してください

### パフォーマンスが遅い

1. **大規模プロジェクト**：`node_modules` やその他の大規模ディレクトリを除外することを検討してください
2. **サーバータイムアウト**：遅いサーバーの場合は、サーバー設定で `startupTimeout` を増やしてください

### 結果が得られない

1. **サーバーの準備ができていない**：サーバーがまだインデックス作成中かもしれません。clangd を使用した C/C++ プロジェクトの場合は、`--background-index` が引数に含まれていること、およびプロジェクトルートまたは親ディレクトリに `compile_commands.json`（または `compile_flags.txt`）が存在することを確認してください。ビルドサブディレクトリにある場合は `--compile-commands-dir=<パス>` を使用してください
2. **ファイルが保存されていない**：サーバーが変更を認識できるようにファイルを保存してください
3. **言語が間違っている**：正しいサーバーが言語に対して実行されているか確認してください
4. **プロセスを確認**：`ps aux | grep <サーバー名>` を実行してサーバーが実際に動作しているか確認してください

### デバッグ

LSP に専用のデバッグフラグはありません。Qwen Code の通常のデバッグモードを LSP 機能フラグと一緒に使用します：

```bash
qwen --experimental-lsp --debug
```

デバッグログはセッションのデバッグログディレクトリに書き込まれます。LSP 関連のエントリを確認するには：

```bash
# デフォルトのランタイムディレクトリ
rg "LSP|Native LSP|clangd|connection closed" ~/.qwen/debug/latest
# または ripgrep がない場合：
grep -E "LSP|Native LSP|clangd|connection closed" ~/.qwen/debug/latest

# QWEN_RUNTIME_DIR が設定されている場合
rg "LSP|Native LSP|clangd|connection closed" "$QWEN_RUNTIME_DIR/debug/latest"
```

役立つエントリには以下が含まれます：

- `[LSP] ...`：ネイティブ LSP サービスとサーバーマネージャーによって出力されるログ。
- `[CONFIG] Native LSP status after discovery: ...`：セッションで検出された LSP サーバー設定。
- `[CONFIG] Native LSP status after startup: ...`：サーバーの起動結果（準備完了/失敗のカウントを含む）。
- `[STATUS] LSP status snapshot for /status: ...`：デバッグモードで `/status` 実行時に出力されるステータススナップショット。

CLI で `/status` を実行すると、短い LSP サマリーを表示できます：

```text
LSP: disabled
LSP: enabled, 1/1 ready
LSP: enabled, 0/1 ready (1 failed)
LSP: enabled, no servers configured
LSP: enabled, status unavailable
```

サーバーごとの詳細を確認するには、`/lsp` を実行します：

```text
**LSP Server Status**

| Server | Command | Languages | Status |
|--------|---------|-----------|--------|
| clangd | `clangd` | c, cpp | READY |
| pyright | `pyright-langserver` | python | FAILED - startup failed |
```

よくあるエラーメッセージ：

```text
command path is unsafe        -> 相対パスがワークスペース外を指している。絶対パスを使用するか PATH に追加してください
command not found             -> サーバーバイナリがインストールされていないか PATH にありません
requires trusted workspace    -> 最初に /trust を実行してください
LSP connection closed         -> サーバーが起動したが、initialize に応答する前に stdio を終了または閉じました
```

clangd の起動に失敗する場合は、プロジェクトルートからサーバーを直接確認します：

```bash
clangd --version
clangd --check=/path/to/file.cpp --log=verbose
```

C/C++ プロジェクトは通常、`compile_commands.json` または `compile_flags.txt` を提供する必要があります。コンパイルデータベースがビルドディレクトリにある場合は、clangd に以下のように渡します：

```json
{
  "cpp": {
    "command": "clangd",
    "args": ["--background-index", "--compile-commands-dir=build"]
  }
}
```

```bash
ps aux | grep clangd   # または typescript-language-server、jdtls など
```

## 拡張機能の LSP 設定

拡張機能は、その `plugin.json` の `lspServers` フィールドを通じて LSP サーバー設定を提供できます。これはインラインオブジェクトまたは `.lsp.json` ファイルへのパスのいずれかです。Qwen Code は拡張機能が有効になっているときにこれらの設定を読み込みます。形式はプロジェクトの `.lsp.json` ファイルで使用されるものと同じ言語キー形式です。

## ベストプラクティス

1. **言語サーバーをグローバルにインストールする**：すべてのプロジェクトで利用可能になります
2. **プロジェクト固有の設定を使用する**：必要に応じて `.lsp.json` でプロジェクトごとにサーバーオプションを設定します
3. **サーバーを最新に保つ**：最良の結果を得るために言語サーバーを定期的に更新します
4. **信頼は慎重に**：信頼できるソースからのワークスペースのみを信頼してください

## FAQ

### Q: LSP を有効にするにはどうすればよいですか？

Qwen Code 起動時に `--experimental-lsp` フラグを使用します：

```bash
qwen --experimental-lsp
```

### Q: どの言語サーバーが実行されているかを確認するにはどうすればよいですか？

LSP とデバッグモードを有効にして Qwen Code を起動します：

```bash
qwen --experimental-lsp --debug
```

その後、`/status` で短いサマリー、`/lsp` でサーバーごとのステータスを確認するか、デバッグログを調べます：

```bash
# デフォルトのランタイムディレクトリ
rg "LSP|Native LSP|<サーバー名>" ~/.qwen/debug/latest
# または：
grep -E "LSP|Native LSP|<サーバー名>" ~/.qwen/debug/latest

# QWEN_RUNTIME_DIR が設定されている場合
rg "LSP|Native LSP|<サーバー名>" "$QWEN_RUNTIME_DIR/debug/latest"
```

LSP は Qwen Code の通常の `--debug` モードを使用します。専用の LSP デバッグフラグはありません。

### Q: 同じファイルタイプに複数の言語サーバーを使用できますか？

はい。ただし、各操作で使用されるのは 1 つだけです。最初に結果を返したサーバーが優先されます。

### Q: LSP はサンドボックスモードで動作しますか？

LSP サーバーはコードにアクセスするためにサンドボックス外で実行されます。これらはワークスペースの信頼制御の対象となります。