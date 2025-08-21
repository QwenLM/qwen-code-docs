# Memory Import Processor

Memory Import Processor は、`@file.md` という構文を使って他のファイルからコンテンツをインポートすることで、コンテキストファイル（例：`QWEN.md`）をモジュール化できる機能です。

## 概要

この機能を使うことで、大きなコンテキストファイル（例：`QWEN.md`）をより小さく、管理しやすいコンポーネントに分割し、異なるコンテキスト間で再利用することが可能になります。Import processor は相対パスと絶対パスの両方をサポートしており、循環インポートを防ぎ、ファイルアクセスの安全性を確保するための組み込みセーフティ機能も備えています。

## 構文

インポートしたいファイルのパスの前に `@` シンボルを付けて使用します：

```markdown

# Main QWEN.md file

This is the main content.

@./components/instructions.md

More content here.

@./shared/configuration.md
```

## サポートされているパス形式

### 相対パス

- `@./file.md` - 同じディレクトリからインポート
- `@../file.md` - 親ディレクトリからインポート
- `@./components/file.md` - サブディレクトリからインポート

### 絶対パス

- `@/absolute/path/to/file.md` - 絶対パスを使ってインポート

## 例

### 基本的なインポート

```markdown

# My QWEN.md

Welcome to my project!

@./getting-started.md

## Features

@./features/overview.md
```

### ネストされたインポート

インポートされたファイル自体がインポートを含むことができ、ネスト構造を作成できます：

```markdown

# main.md

@./header.md
@./content.md
@./footer.md
```

```markdown

# header.md

# Project Header

@./shared/title.md
```

## セキュリティ機能

### 循環インポートの検出

プロセッサは自動的に循環インポートを検出し、防止します：

```markdown

# file-a.md

@./file-b.md

# file-b.md

@./file-a.md <!-- これは検出され、防止されます -->
```

### ファイルアクセスのセキュリティ

`validateImportPath` 関数により、インポートが指定されたディレクトリからのみ許可され、許可されたスコープ外の機密ファイルへのアクセスを防止します。

### 最大インポート深度

無限再帰を防ぐため、最大インポート深度を設定可能です（デフォルト: 5レベル）。

## エラーハンドリング

### 存在しないファイル

参照されたファイルが存在しない場合、インポートは失敗し、出力にはエラーコメントが表示されます。

### ファイルアクセスエラー

権限の問題やその他のファイルシステムエラーは、適切なエラーメッセージとともに適切に処理されます。

## コード領域の検出

インポートプロセッサは `marked` ライブラリを使用してコードブロックとインラインコードスパンを検出します。これにより、これらの領域内にある `@` インポートが正しく無視されるようになります。これにより、ネストされたコードブロックや複雑なMarkdown構造を堅牢に処理できます。

## Import Tree Structure

プロセッサは、インポートされたファイルの階層構造を示す import tree を返します。これにより、どのファイルが読み込まれ、どのようにインポート関係にあるかが表示されるため、context ファイルに関する問題をデバッグするのに役立ちます。

ツリー構造の例:

```
 Memory Files
 L project: QWEN.md
            L a.md
              L b.md
                L c.md
              L d.md
                L e.md
                  L f.md
            L included.md
```

このツリーは、ファイルがインポートされた順序を保持し、デバッグ目的で完全なインポートチェーンを表示します。

## Claude Code の `/memory` (`claude.md`) アプローチとの比較

Claude Code の `/memory` 機能（`claude.md` 参照）は、含まれるすべてのファイルを連結してフラットな線形ドキュメントを生成し、常に明確なコメントとパス名でファイル境界をマークします。インポート階層を明示的に提示することはありませんが、LLM にはすべてのファイル内容とパスが渡されるため、必要に応じて階層を再構築するのに十分です。

注: インポートツリーは主に開発中の明確性のためのものであり、LLM の処理には限定的な関連性しかありません。

## API リファレンス

### `processImports(content, basePath, debugMode?, importState?)`

コンテキストファイルの内容にある import 文を処理します。

**パラメータ:**

- `content` (string): import を処理する対象の内容
- `basePath` (string): 現在のファイルが配置されているディレクトリパス
- `debugMode` (boolean, optional): デバッグログを有効化するかどうか（デフォルト: false）
- `importState` (ImportState, optional): 循環 import を防止するための状態管理

**戻り値:** Promise<ProcessImportsResult> - 処理済みの内容と import ツリーを含むオブジェクト

### `ProcessImportsResult`

```typescript
interface ProcessImportsResult {
  content: string; // import が解決された処理済みの内容
  importTree: MemoryFile; // import 階層を示すツリー構造
}
```

### `MemoryFile`

```typescript
interface MemoryFile {
  path: string; // ファイルパス
  imports?: MemoryFile[]; // 直接 import されたファイル群。import された順序で並んでいる
}
```

### `validateImportPath(importPath, basePath, allowedDirectories)`

importパスが安全であり、許可されたディレクトリ内にあることを検証します。

**Parameters:**

- `importPath` (string): 検証するimportパス
- `basePath` (string): 相対パスを解決するためのベースディレクトリ
- `allowedDirectories` (string[]): 許可されたディレクトリパスの配列

**Returns:** boolean - importパスが有効かどうか

### `findProjectRoot(startDir)`

指定された開始ディレクトリから上方向に`.git`ディレクトリを検索して、プロジェクトのルートを特定します。Node.jsのイベントループをブロックしないように、非同期関数として**async**で実装され、ノンブロッキングなファイルシステムAPIを使用しています。

**Parameters:**

- `startDir` (string): 検索を開始するディレクトリ

**Returns:** Promise<string> - プロジェクトのルートディレクトリ（`.git`が見つからない場合は開始ディレクトリ）

## ベストプラクティス

1. **説明的なファイル名を使用する** - インポートするコンポーネントには意味のある名前を付けましょう
2. **インポートの階層を浅く保つ** - 深くネストされたインポートチェーンは避けてください
3. **構造をドキュメント化する** - インポートしたファイルの明確な階層構造を維持しましょう
4. **インポートをテストする** - 参照しているすべてのファイルが存在し、アクセス可能であることを確認してください
5. **可能な場合は相対パスを使用する** - ポータビリティ向上のため、相対パスを使用することを推奨します

## トラブルシューティング

### よくある問題

1. **インポートが機能しない**: ファイルが存在するか、パスが正しいか確認してください
2. **循環インポートの警告**: インポート構造に循環参照がないか確認してください
3. **権限エラー**: ファイルが読み取り可能で、許可されたディレクトリ内にあることを確認してください
4. **パス解決の問題**: 相対パスが正しく解決されない場合は、絶対パスを使用してください

### デバッグモード

インポートプロセスの詳細なログを表示するためにデバッグモードを有効にしてください：

```typescript
const result = await processImports(content, basePath, true);
```