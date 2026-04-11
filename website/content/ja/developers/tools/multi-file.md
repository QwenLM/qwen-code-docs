# マルチファイル読み込みツール (`read_many_files`)

このドキュメントでは、Qwen Code の `read_many_files` ツールについて説明します。

## 概要

パスまたは glob パターンで指定された複数のファイルの内容を読み取るには、`read_many_files` を使用します。このツールの動作は、指定されたファイルの種類によって異なります。

- テキストファイルの場合、このツールはそれらの内容を 1 つの文字列に結合します。
- 画像（PNG、JPEG など）、PDF、音声（MP3、WAV）、動画（MP4、MOV）ファイルの場合、ファイル名または拡張子で明示的に指定されている場合、それらを読み取り、base64 エンコードされたデータとして返します。

`read_many_files` は、コードベースの概要把握、特定の機能が実装されている場所の特定、ドキュメントの確認、複数の設定ファイルからのコンテキスト収集などのタスクに使用できます。

**注:** `read_many_files` は、提供されたパスまたは glob パターンに従ってファイルを検索します。`"/docs"` のようなディレクトリパスを指定すると空の結果が返されます。関連するファイルを特定するには、`"/docs/*"` や `"/docs/*.md"` などのパターンを指定する必要があります。

### 引数

`read_many_files` は以下の引数を受け取ります。

- `paths` (list[string], 必須): ツールのターゲットディレクトリからの相対パスまたは glob パターンの配列（例: `["src/**/*.ts"]`、`["README.md", "docs/*", "assets/logo.png"]`）。
- `exclude` (list[string], オプション): 除外するファイル/ディレクトリの glob パターン（例: `["**/*.log", "temp/"]`）。`useDefaultExcludes` が true の場合、デフォルトの除外リストに追加されます。
- `include` (list[string], オプション): 追加で含める glob パターン。`paths` とマージされます（例: 広範囲に除外されている場合にテストファイルを明示的に追加する `["*.test.ts"]` や、特定の画像タイプを含める `["images/*.jpg"]`）。
- `recursive` (boolean, オプション): 再帰的に検索するかどうか。主に glob パターンの `**` によって制御されます。デフォルトは `true` です。
- `useDefaultExcludes` (boolean, オプション): デフォルトの除外パターンリスト（`node_modules`、`.git`、画像/PDF 以外のバイナリファイルなど）を適用するかどうか。デフォルトは `true` です。
- `respect_git_ignore` (boolean, オプション): ファイル検索時に .gitignore パターンを尊重するかどうか。デフォルトは true です。

## Qwen Code での `read_many_files` の使用方法

`read_many_files` は、提供された `paths` および `include` パターンに一致するファイルを検索します。この際、`exclude` パターンとデフォルトの除外設定（有効な場合）が適用されます。

- テキストファイルの場合: 一致した各ファイルの内容を読み取り（画像/PDF として明示的に要求されていないバイナリファイルはスキップを試みます）、各ファイルの内容の間に区切り文字 `--- {filePath} ---` を挿入して 1 つの文字列に結合します。デフォルトでは UTF-8 エンコーディングを使用します。
- ツールは最後のファイルの後に `--- End of content ---` を挿入します。
- 画像および PDF ファイルの場合: ファイル名または拡張子で明示的に要求されている場合（例: `paths: ["logo.png"]` または `include: ["*.pdf"]`）、ツールはファイルを読み取り、その内容を base64 エンコードされた文字列として返します。
- ツールは、他のバイナリファイル（一般的な画像/PDF タイプに一致しないもの、または明示的に要求されていないもの）について、先頭の内容に null バイトが含まれていないか確認し、検出とスキップを試みます。

使用方法:

```
read_many_files(paths=["Your files or paths here."], include=["Additional files to include."], exclude=["Files to exclude."], recursive=False, useDefaultExcludes=false, respect_git_ignore=true)
```

## `read_many_files` の使用例

`src` ディレクトリ内のすべての TypeScript ファイルを読み取る:

```
read_many_files(paths=["src/**/*.ts"])
```

メインの README、`docs` ディレクトリ内のすべての Markdown ファイル、および特定のロゴ画像を読み取り、特定のファイルを除外する:

```
read_many_files(paths=["README.md", "docs/**/*.md", "assets/logo.png"], exclude=["docs/OLD_README.md"])
```

すべての JavaScript ファイルを読み取り、テストファイルと `images` フォルダ内のすべての JPEG を明示的に含める:

```
read_many_files(paths=["**/*.js"], include=["**/*.test.js", "images/**/*.jpg"], useDefaultExcludes=False)
```

## 重要な注意事項

- **バイナリファイルの処理:**
  - **画像/PDF/音声/動画ファイル:** ツールは一般的な画像タイプ（PNG、JPEG など）、PDF、音声（mp3、wav）、動画（mp4、mov）ファイルを読み取り、base64 エンコードされたデータとして返すことができます。これらのファイルは、`paths` または `include` パターンによって明示的にターゲットにする必要があります（例: `video.mp4` のような正確なファイル名や `*.mov` のようなパターンを指定）。
  - **その他のバイナリファイル:** ツールは、先頭の内容に null バイトが含まれていないか確認することで、他のタイプのバイナリファイルを検出し、スキップを試みます。これらのファイルは出力から除外されます。
- **パフォーマンス:** 非常に多数のファイル、または非常に大きな単一ファイルを読み取ると、リソース負荷が高くなる可能性があります。
- **パスの指定:** パスと glob パターンが、ツールのターゲットディレクトリからの相対パスとして正しく指定されていることを確認してください。画像/PDF ファイルの場合、それらを含めるのに十分な具体性を持つパターンであることを確認してください。
- **デフォルトの除外設定:** `node_modules` や `.git` などのデフォルトの除外パターンに注意してください。これらを上書きする必要がある場合は `useDefaultExcludes=False` を使用しますが、慎重に行ってください。