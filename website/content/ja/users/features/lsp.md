# Language Server Protocol (LSP) サポート

Qwen Code は、ネイティブの Language Server Protocol (LSP) サポートを提供しており、定義へのジャンプ、参照の検索、診断、コードアクションなどの高度なコードインテリジェンス機能を実現します。この統合により、AI エージェントがコードをより深く理解し、より正確な支援を提供できるようになります。

## 概要

Qwen Code の LSP サポートは、コードを理解する言語サーバーに接続することで動作します。TypeScript、Python、Go など、サポート対象の言語で作業している場合、Qwen Code は適切な言語サーバーを自動的に起動し、以下の操作に利用できます：

- シンボルの定義へ移動
- シンボルへのすべての参照を検索
- ホバー情報の取得（ドキュメンテーション、型情報）
- 診断メッセージの表示（エラー、警告）
- コードアクションへのアクセス（クイックフィックス、リファクタリング）
- 呼び出し階層の解析

## クイックスタート

LSP は Qwen Code の実験的機能です。有効にするには、`--experimental-lsp` コマンドラインフラグを使用します。

```bash
qwen --experimental-lsp
```

ほとんどの一般的な言語において、Qwen Code はシステム上にインストール済みの適切な言語サーバーを自動的に検出し、起動します。

### 前提条件

使用するプログラミング言語に対応した言語サーバーをインストールしておく必要があります。

| 言語                  | 言語サーバー               | インストールコマンド                                                           |
| --------------------- | -------------------------- | ------------------------------------------------------------------------------ |
| TypeScript/JavaScript | typescript-language-server | `npm install -g typescript-language-server typescript`                         |
| Python                | pylsp                      | `pip install python-lsp-server`                                                |
| Go                    | gopls                      | `go install golang.org/x/tools/gopls@latest`                                   |
| Rust                  | rust-analyzer              | [インストールガイド](https://rust-analyzer.github.io/manual.html#installation) |

## 設定

### `.lsp.json` ファイル

プロジェクトのルートディレクトリに `.lsp.json` ファイルを作成することで、言語サーバーを設定できます。このファイルは、[Claude Code プラグインの LSP 設定リファレンス](https://code.claude.com/docs/en/plugins-reference#lsp-servers) で説明されている「言語名をキーとした形式」を使用します。

**基本フォーマット：**

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

### 設定オプション

#### 必須フィールド

| オプション              | 型     | 説明                                               |
| ----------------------- | ------ | -------------------------------------------------- |
| `command`               | 文字列 | LSP サーバーを起動するコマンド（PATH に存在する必要があります） |
| `extensionToLanguage`   | オブジェクト | ファイル拡張子を言語識別子にマッピングします             |

#### オプション項目

| オプション                  | 型       | デフォルト値 | 説明                                                     |
| --------------------------- | -------- | ------------ | -------------------------------------------------------- |
| `args`                      | string[] | `[]`         | コマンドライン引数                                       |
| `transport`                 | string   | `"stdio"`    | トランスポート方式：`stdio` または `socket`              |
| `env`                       | object   | -            | 環境変数                                                 |
| `initializationOptions`     | object   | -            | LSP の初期化オプション                                   |
| `settings`                  | object   | -            | `workspace/didChangeConfiguration` を通じたサーバー設定 |
| `workspaceFolder`           | string   | -            | ワークスペースフォルダーの上書き                         |
| `startupTimeout`            | number   | `10000`      | 起動タイムアウト（ミリ秒）                               |
| `shutdownTimeout`           | number   | `5000`       | シャットダウンタイムアウト（ミリ秒）                     |
| `restartOnCrash`            | boolean  | `false`      | クラッシュ時に自動再起動                                 |
| `maxRestarts`               | number   | `3`          | 最大再起動回数                                           |
| `trustRequired`             | boolean  | `true`       | 信頼されたワークスペースを要求                           |

### TCP/ソケットトランスポート

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

Qwen Code は、統合された `lsp` ツールを通じて LSP 機能を提供します。以下に利用可能な操作を示します。

### コードナビゲーション

#### 定義へ移動

シンボルが定義されている場所を検索します。

```
操作: goToDefinition
パラメーター:
  - filePath: ファイルのパス
  - line: 行番号（1始まり）
  - character: 列番号（1始まり）
```

#### 参照の検索

シンボルへのすべての参照を検索します。

```
操作: findReferences
パラメーター:
  - filePath: ファイルのパス
  - line: 行番号（1始まり）
  - character: 列番号（1始まり）
  - includeDeclaration: 宣言自体を含めるかどうか（任意）
```

#### 実装へ移動

インターフェースまたは抽象メソッドの実装を検索します。

```
操作: goToImplementation
パラメーター:
  - filePath: ファイルのパス
  - line: 行番号（1始まり）
  - character: 列番号（1始まり）
```

### シンボル情報

#### ホバー

シンボルのドキュメンテーションおよび型情報を取得します。

```
操作: hover
パラメーター:
  - filePath: ファイルのパス
  - line: 行番号（1始まり）
  - character: 列番号（1始まり）
```

#### ドキュメント内のシンボル

ドキュメント内にあるすべてのシンボルを取得します。

```
操作: documentSymbol
パラメーター:
  - filePath: ファイルのパス
```

#### ワークスペース内のシンボル検索

ワークスペース全体でシンボルを検索します。

```
操作: workspaceSymbol
パラメーター:
  - query: 検索クエリ文字列
  - limit: 最大結果数（省略可能）
```

### 呼び出し階層

#### 呼び出し階層の準備

指定位置における呼び出し階層項目を取得します。

```
操作: prepareCallHierarchy
パラメーター:
  - filePath: ファイルのパス
  - line: 行番号（1始まり）
  - character: 列番号（1始まり）
```

#### 呼び出し元

指定された関数を呼び出すすべての関数を検索します。

```
操作: incomingCalls
パラメーター:
  - callHierarchyItem: prepareCallHierarchy から得られた項目
```

#### 呼び出し先

指定された関数から呼び出されるすべての関数を検索します。

```
操作: outgoingCalls
パラメーター:
  - callHierarchyItem: prepareCallHierarchy から得られた項目
```

### 診断

#### ファイル診断

ファイルに対する診断メッセージ（エラー、警告など）を取得します。

```
操作: diagnostics
パラメーター:
  - filePath: ファイルのパス
```

#### ワークスペース診断

ワークスペース全体にわたるすべての診断メッセージを取得します。

```
操作: workspaceDiagnostics
パラメーター:
  - limit: 最大結果数（省略可）
```

### コードアクション

#### コード アクションの取得

指定位置で利用可能なコード アクション（クイック フィックス、リファクタリング）を取得します。

```
操作: codeActions
パラメーター:
  - filePath: ファイルのパス
  - line: 開始行番号（1 から始まる）
  - character: 開始列番号（1 から始まる）
  - endLine: 終了行番号（省略可。デフォルトは line）
  - endCharacter: 終了列番号（省略可。デフォルトは character）
  - diagnostics: アクションを取得する診断情報（省略可）
  - codeActionKinds: アクションの種類によるフィルター（省略可）
```

コード アクションの種類:

- `quickfix` — エラー／警告に対するクイック フィックス
- `refactor` — リファクタリング操作
- `refactor.extract` — 関数／変数への抽出
- `refactor.inline` — 関数／変数のインライン化
- `source` — ソース コード アクション
- `source.organizeImports` — インポートの整理
- `source.fixAll` — 自動修正可能なすべての問題の修正

## セキュリティ

LSP サーバーは、デフォルトでは信頼されたワークスペース内でのみ起動されます。これは、言語サーバーがユーザーの権限で実行され、任意のコードを実行できるためです。

### 信頼制御

- **信頼されたワークスペース**: LSP サーバーが自動的に起動します。
- **信頼されていないワークスペース**: サーバー設定で `trustRequired: false` を指定しない限り、LSP サーバーは起動しません。

ワークスペースを信頼済みとしてマークするには、`/trust` コマンドを使用するか、設定で信頼済みフォルダーを構成してください。

### サーバー単位の信頼オーバーライド

特定のサーバーについて、その設定内で信頼要件をオーバーライドできます。

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

1. **サーバーがインストールされているか確認する**: コマンドを手動で実行して検証します
2. **PATH を確認する**: サーバーのバイナリがシステムの PATH に含まれていることを確認します
3. **ワークスペースの信頼性を確認する**: LSP を使用するには、ワークスペースが信頼済みである必要があります
4. **ログを確認する**: コンソール出力にエラーメッセージがないか確認します
5. **`--experimental-lsp` フラグを確認する**: Qwen Code を起動する際に、このフラグが指定されていることを確認します

### パフォーマンスが遅い

1. **大規模なプロジェクト**: `node_modules` やその他の大規模ディレクトリを除外することを検討してください
2. **サーバーのタイムアウト**: サーバーの起動が遅い場合は、サーバー設定で `startupTimeout` を増加させます

### 結果が得られない

1. **サーバーが準備完了していない**: サーバーがまだインデックス作成中である可能性があります
2. **ファイルが保存されていない**: サーバーが変更を検知できるよう、ファイルを保存してください
3. **言語が正しくない**: 使用中の言語に対応した正しいサーバーが実行されているか確認してください

### デバッグ

LSP の通信を確認するには、デバッグログを有効化します。

```bash
DEBUG=lsp* qwen --experimental-lsp
```

または、`packages/cli/LSP_DEBUGGING_GUIDE.md` にある LSP デバッグガイドを参照してください。

## Claude Code との互換性

Qwen Code は、[Claude Code プラグインリファレンス](https://code.claude.com/docs/en/plugins-reference#lsp-servers)で定義されている言語キー形式の Claude Code 風 `.lsp.json` 設定ファイルをサポートしています。Claude Code から移行する場合は、設定ファイルで「言語をキーとする」レイアウトを使用してください。

### 設定フォーマット

推奨されるフォーマットは、Claude Code の仕様に従います。

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

Claude Code の LSP プラグインでは、`plugin.json`（または参照される `.lsp.json`）内に `lspServers` を指定することもできます。Qwen Code は、その拡張機能が有効化された際にこれらの設定を読み込みますが、それらは同様に「言語をキーとする」フォーマットである必要があります。

## 最佳実践

1. **言語サーバーをグローバルにインストールする**: これにより、すべてのプロジェクトで利用可能になります。
2. **プロジェクト固有の設定を使用する**: 必要に応じて、`.lsp.json` を使ってプロジェクトごとにサーバーのオプションを設定します。
3. **サーバーを最新の状態に保つ**: 最高の結果を得るために、言語サーバーを定期的に更新してください。
4. **信頼は慎重に設定する**: 信頼できるソースからのみワークスペースを信頼してください。

## よくある質問（FAQ）

### Q: LSP を有効にするにはどうすればよいですか？

Qwen Code を起動する際に `--experimental-lsp` フラグを使用します：

```bash
qwen --experimental-lsp
```

### Q: どの言語サーバーが実行中か確認するにはどうすればよいですか？

すべての設定済みおよび実行中の言語サーバーを表示するには、`/lsp status` コマンドを使用します。

### Q: 同じファイルタイプに対して複数の言語サーバーを使用できますか？

はい。ただし、各操作では 1 つのみが使用されます。結果を最初に返したサーバーが採用されます。

### Q: サンドボックスモードで LSP は動作しますか？

LSP サーバーは、コードにアクセスできるようサンドボックス外で実行されます。ただし、ワークスペースの信頼制御の対象となります。