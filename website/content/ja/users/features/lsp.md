# Language Server Protocol (LSP) サポート

Qwen Code は、ネイティブの Language Server Protocol (LSP) サポートを提供し、定義への移動、参照の検索、診断、コードアクションなどの高度なコードインテリジェンス機能を実現します。この統合により、AI エージェントはコードをより深く理解し、より正確な支援を提供できるようになります。

## 概要

Qwen Code の LSP サポートは、コードを理解する言語サーバーに接続することで動作します。TypeScript、Python、Go、または他のサポートされている言語で作業する際、Qwen Code は適切な言語サーバーを自動的に起動し、以下のために使用できます：

- シンボル定義へのナビゲーション
- シンボルへのすべての参照の検索
- ホバー情報の取得（ドキュメント、型情報）
- 診断メッセージの表示（エラー、警告）
- コードアクションへのアクセス（クイックフィックス、リファクタリング）
- 呼び出し階層の分析

## クイックスタート

LSP は Qwen Code の実験的機能です。有効にするには、`--experimental-lsp` コマンドラインフラグを使用してください：

```bash
qwen --experimental-lsp
```

一般的な言語の多くについて、Qwen Code はシステムにインストールされている適切な言語サーバーを自動的に検出して起動します。

### 前提条件

プログラミング言語に対応する言語サーバーがインストールされている必要があります。

| 言語                  | 言語サーバー               | インストールコマンド                                                         |
| --------------------- | -------------------------- | ------------------------------------------------------------------------------ |
| TypeScript/JavaScript | typescript-language-server | `npm install -g typescript-language-server typescript`                         |
| Python                | pylsp                      | `pip install python-lsp-server`                                                |
| Go                    | gopls                      | `go install golang.org/x/tools/gopls@latest`                                   |
| Rust                  | rust-analyzer              | [インストールガイド](https://rust-analyzer.github.io/manual.html#installation) |

## 設定

### .lsp.json ファイル

プロジェクトルートに `.lsp.json` ファイルを作成して、言語サーバーを設定できます。これは [Claude Code プラグイン LSP 設定リファレンス](https://code.claude.com/docs/en/plugins-reference#lsp-servers) で説明されている言語別キー形式を使用します。

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

### 設定オプション

#### 必須フィールド

| オプション            | 型     | 説明                                              |
| --------------------- | ------ | ------------------------------------------------- |
| `command`             | string | LSP サーバーを起動するコマンド (PATH にある必要があります) |
| `extensionToLanguage` | object | ファイル拡張子を言語識別子にマッピングします      |

#### オプションフィールド

| オプション                | 型       | デフォルト | 説明                                                     |
| ------------------------- | -------- | ---------- | -------------------------------------------------------- |
| `args`                    | string[] | `[]`       | コマンドライン引数                                       |
| `transport`               | string   | `"stdio"`  | トランスポートタイプ: `stdio` または `socket`            |
| `env`                     | object   | -          | 環境変数                                                 |
| `initializationOptions`   | object   | -          | LSP 初期化オプション                                     |
| `settings`                | object   | -          | `workspace/didChangeConfiguration` 経由のサーバー設定     |
| `workspaceFolder`         | string   | -          | ワークスペースフォルダーの上書き                         |
| `startupTimeout`          | number   | `10000`    | 起動タイムアウト（ミリ秒）                               |
| `shutdownTimeout`         | number   | `5000`     | シャットダウンタイムアウト（ミリ秒）                     |
| `restartOnCrash`          | boolean  | `false`    | クラッシュ時の自動再起動                                 |
| `maxRestarts`             | number   | `3`        | 最大再起動試行回数                                       |
| `trustRequired`           | boolean  | `true`     | 信頼されたワークスペースが必要                           |

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

## 利用可能な LSP 操作

Qwen Code は、統合された `lsp` ツールを通じて LSP 機能を公開します。以下は利用可能な操作です:

### コードナビゲーション

#### 定義へ移動

シンボルが定義されている場所を検索します。

```
操作: goToDefinition
パラメータ:
  - filePath: ファイルのパス
  - line: 行番号 (1から始まる)
  - character: 列番号 (1から始まる)
```

#### 参照の検索

シンボルへのすべての参照を検索します。

```
操作: findReferences
パラメータ:
  - filePath: ファイルのパス
  - line: 行番号 (1から始まる)
  - character: 列番号 (1から始まる)
  - includeDeclaration: 宣言自体を含める (オプション)
```

#### 実装へ移動

インターフェースまたは抽象メソッドの実装を見つける。

```
操作: goToImplementation
パラメータ:
  - filePath: ファイルへのパス
  - line: 行番号（1から始まる）
  - character: 列番号（1から始まる）
```

### シンボル情報

#### ホバー

シンボルのドキュメントと型情報を取得する。

```
操作: hover
パラメータ:
  - filePath: ファイルへのパス
  - line: 行番号（1から始まる）
  - character: 列番号（1から始まる）
```

#### ドキュメントシンボル

ドキュメント内のすべてのシンボルを取得する。

```
操作: documentSymbol
パラメータ:
  - filePath: ファイルへのパス
```

#### ワークスペースシンボル検索

ワークスペース全体からシンボルを検索する。

```
操作: workspaceSymbol
パラメータ:
  - query: 検索クエリ文字列
  - limit: 最大結果数（オプション）
```

### 呼び出し階層

#### 呼び出し階層の準備

位置における呼び出し階層アイテムを取得します。

```
操作: prepareCallHierarchy
パラメータ:
  - filePath: ファイルへのパス
  - line: 行番号 (1から始まる)
  - character: 列番号 (1から始まる)
```

#### 呼び出し元

指定された関数を呼び出しているすべての関数を検索します。

```
操作: incomingCalls
パラメータ:
  - callHierarchyItem: prepareCallHierarchy からのアイテム
```

#### 呼び出し先

指定された関数が呼び出しているすべての関数を検索します。

```
操作: outgoingCalls
パラメータ:
  - callHierarchyItem: prepareCallHierarchy からのアイテム
```

### 診断

#### ファイル診断

ファイルに対する診断メッセージ（エラー、警告）を取得します。

```
操作: diagnostics
パラメータ:
  - filePath: ファイルへのパス
```

#### ワークスペース診断

ワークスペース全体のすべての診断メッセージを取得します。

```
操作: workspaceDiagnostics
パラメータ:
  - limit: 最大結果数（オプション）
```

### コードアクション

#### コードアクションの取得

指定位置で利用可能なコードアクション（クイックフィックス、リファクタリング）を取得します。

```
操作: codeActions
パラメータ:
  - filePath: ファイルへのパス
  - line: 開始行番号（1から始まる）
  - character: 開始列番号（1から始まる）
  - endLine: 終了行番号（オプション、デフォルトはline）
  - endCharacter: 終了列番号（オプション、デフォルトはcharacter）
  - diagnostics: アクションを取得するための診断情報（オプション）
  - codeActionKinds: アクションの種類でフィルタリング（オプション）
```

コードアクションの種類:

- `quickfix` - エラー/警告に対するクイックフィックス
- `refactor` - リファクタリング操作
- `refactor.extract` - 関数/変数への抽出
- `refactor.inline` - 関数/変数のインライン化
- `source` - ソースコードアクション
- `source.organizeImports` - インポートの整理
- `source.fixAll` - 自動修正可能なすべての問題を修正

## セキュリティ

LSPサーバーは、デフォルトでは信頼されたワークスペースでのみ起動されます。これは、言語サーバーがユーザー権限で実行され、コードを実行できる可能性があるためです。

### 信頼コントロール

- **信頼されたワークスペース**: LSPサーバーが自動的に起動します
- **信頼されていないワークスペース**: サーバー設定で `trustRequired: false` が設定されていない限り、LSPサーバーは起動しません

ワークスペースを信頼済みとしてマークするには、`/trust` コマンドを使用するか、設定で信頼されたフォルダーを構成してください。

### サーバーごとの信頼上書き

特定のサーバーについて、その設定内で信頼要件を上書きできます：

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

1. **サーバーがインストールされているか確認する**: コマンドを手動で実行して検証してください
2. **PATH を確認する**: サーバーのバイナリがシステムの PATH にあることを確認してください
3. **ワークスペースの信頼を確認する**: LSP を使用するには、ワークスペースが信頼されている必要があります
4. **ログを確認する**: コンソール出力にエラーメッセージがないか調べてください
5. **--experimental-lsp フラグを確認する**: Qwen Code を起動する際にこのフラグを使用していることを確認してください

### パフォーマンスが遅い

1. **大規模なプロジェクト**: `node_modules` やその他の大きなディレクトリを除外することを検討してください
2. **サーバータイムアウト**: 遅いサーバーのためにサーバー構成で `startupTimeout` を増やしてください

### 結果が得られない

1. **サーバーが準備できていない**: サーバーがまだインデックス作成中かもしれません
2. **ファイルが保存されていない**: 変更を反映させるためにファイルを保存してください
3. **言語が間違っている**: 正しい言語用のサーバーが実行されているか確認してください

### デバッグ

デバッグロギングを有効にして、LSP通信を確認できます：

```bash
DEBUG=lsp* qwen --experimental-lsp
```

または、`packages/cli/LSP_DEBUGGING_GUIDE.md` のLSPデバッグガイドを参照してください。

## Claude Code互換性

Qwen Codeは、[Claude Codeプラグインリファレンス](https://code.claude.com/docs/en/plugins-reference#lsp-servers)で定義されている言語キー形式のClaude Codeスタイルの`.lsp.json`設定ファイルをサポートしています。Claude Codeから移行する場合は、設定で言語をキーとするレイアウトを使用してください。

### 設定フォーマット

推奨されるフォーマットはClaude Codeの仕様に従います：

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

Claude CodeのLSPプラグインは、`plugin.json`（または参照される`.lsp.json`）内に`lspServers`を提供することもできます。Qwen Codeは拡張機能が有効化されている際にそれらの設定を読み込み、それらは同じ言語キー形式を使用しなければなりません。

## ベストプラクティス

1. **言語サーバーをグローバルにインストールする**: これにより、すべてのプロジェクトで利用可能になります
2. **プロジェクト固有の設定を使用する**: 必要に応じて `.lsp.json` を介してプロジェクトごとにサーバーのオプションを構成します
3. **サーバーを最新の状態に保つ**: 最良の結果を得るために、言語サーバーを定期的に更新してください
4. **賢く信頼する**: 信頼できるソースからのワークスペースのみを信頼してください

## よくある質問

### Q: LSP を有効にするにはどうすればよいですか？

Qwen Code を起動する際に `--experimental-lsp` フラグを使用してください：

```bash
qwen --experimental-lsp
```

### Q: 実行中の言語サーバーを確認するにはどうすればよいですか？

`/lsp status` コマンドを使用して、構成および実行中のすべての言語サーバーを表示します。

### Q: 同じファイルタイプに対して複数の言語サーバーを使用できますか？

はい、ただし各操作では1つのサーバーのみが使用されます。最初に結果を返したサーバーが優先されます。

### Q: LSP はサンドボックスモードで動作しますか？

LSP サーバーはコードにアクセスするためにサンドボックス外で実行されます。これらはワークスペースの信頼制御の対象となります。