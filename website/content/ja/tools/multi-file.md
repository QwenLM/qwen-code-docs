# Multi File Read Tool (`read_many_files`)

このドキュメントでは、Qwen Code 用の `read_many_files` ツールについて説明します。

## 説明

`read_many_files` を使用して、パスまたは glob パターンで指定された複数のファイルからコンテンツを読み込みます。このツールの動作は、提供されたファイルによって異なります：

- テキストファイルの場合、このツールはその内容を1つの文字列に連結します。
- 画像（PNG、JPEGなど）、PDF、音声（MP3、WAV）、動画（MP4、MOV）ファイルについては、ファイル名または拡張子で明示的に要求された場合に限り、base64エンコードされたデータとして読み込んで返します。

`read_many_files` は、コードベースの概要を把握したり、特定の機能が実装されている場所を見つけたり、ドキュメントをレビューしたり、複数の設定ファイルからコンテキスト情報を収集したりするなどのタスクを実行するために使用できます。

**注意：** `read_many_files` は、指定されたパスまたは glob パターンに従ってファイルを検索します。`"/docs"` のようなディレクトリパスを指定すると空の結果が返されます。関連するファイルを特定するには、`"/docs/*"` や `"/docs/*.md"` のようなパターンを指定する必要があります。

### 引数

`read_many_files` は以下の引数を取ります：

- `paths` (list[string], 必須): glob パターンまたはツールのターゲットディレクトリからの相対パスの配列（例：`["src/**/*.ts"]`、`["README.md", "docs/*", "assets/logo.png"]`）。
- `exclude` (list[string], 任意): 除外するファイル/ディレクトリの glob パターン（例：`["**/*.log", "temp/"]`）。`useDefaultExcludes` が true の場合、これらはデフォルトの除外リストに追加されます。
- `include` (list[string], 任意): 追加で含める glob パターン。これらは `paths` とマージされます（例：広範囲で除外された場合にテストファイルを明示的に追加する `["*.test.ts"]` や、特定の画像形式を含める `["images/*.jpg"]`）。
- `recursive` (boolean, 任意): 再帰的に検索するかどうか。これは主に glob パターン内の `**` によって制御されます。デフォルトは `true`。
- `useDefaultExcludes` (boolean, 任意): デフォルトの除外パターンのリスト（例：`node_modules`、`.git`、画像/PDF 以外のバイナリファイル）を適用するかどうか。デフォルトは `true`。
- `respect_git_ignore` (boolean, 任意): ファイル検索時に .gitignore パターンを尊重するかどうか。デフォルトは true。

## `read_many_files` の使い方 (Qwen Code)

`read_many_files` は、指定された `paths` と `include` パターンに一致するファイルを検索します。このとき、`exclude` パターンとデフォルトの除外設定（有効な場合）も考慮されます。

- **テキストファイルの場合**: 一致した各ファイルの内容を読み込み（明示的に画像/PDFとしてリクエストされていないバイナリファイルはスキップ）、各ファイルの内容間に区切り文字 `--- {filePath} ---` を挿入して1つの文字列に結合します。デフォルトではUTF-8エンコーディングを使用します。
- ツールは最後のファイルの後に `--- End of content ---` を挿入します。
- **画像およびPDFファイルの場合**: 名前または拡張子で明示的にリクエストされた場合（例: `paths: ["logo.png"]` や `include: ["*.pdf"]`）、ファイルを読み込んでその内容をbase64エンコードされた文字列として返します。
- その他のバイナリファイル（一般的な画像/PDF形式に一致せず、明示的にリクエストもされていないもの）については、ツールが先頭部分の内容にnullバイトが含まれるかをチェックし、検出された場合はスキップを試みます。

使用方法:

```
read_many_files(paths=["Your files or paths here."], include=["Additional files to include."], exclude=["Files to exclude."], recursive=False, useDefaultExcludes=false, respect_git_ignore=true)
```

## `read_many_files` の例

`src` ディレクトリ内のすべての TypeScript ファイルを読み込む：

```
read_many_files(paths=["src/**/*.ts"])
```

メインの README、`docs` ディレクトリ内のすべての Markdown ファイル、および特定のロゴ画像を読み込み、特定のファイルを除外する：

```
read_many_files(paths=["README.md", "docs/**/*.md", "assets/logo.png"], exclude=["docs/OLD_README.md"])
```

すべての JavaScript ファイルを読み込むが、明示的にテストファイルと `images` フォルダ内のすべての JPEG を含める：

```
read_many_files(paths=["**/*.js"], include=["**/*.test.js", "images/**/*.jpg"], useDefaultExcludes=False)
```

## 重要な注意事項

- **バイナリファイルの取り扱い:**
  - **画像/PDF/音声/動画ファイル:** このツールは一般的な画像形式（PNG、JPEGなど）、PDF、音声（mp3、wav）、動画（mp4、mov）ファイルを読み込み、それらをbase64エンコードされたデータとして返すことができます。これらのファイルは、`paths`または`include`パターンで明示的に指定する必要があります（例：`video.mp4`のような具体的なファイル名や、`*.mov`のようなパターンを指定する）。
  - **その他のバイナリファイル:** ツールは、ファイルの先頭部分にnullバイトが含まれているかどうかをチェックすることで、その他のバイナリファイルを検出し、スキップしようとします。これらのファイルはツールの出力から除外されます。
- **パフォーマンス:** 多数のファイルや非常に大きなサイズの個別ファイルを読み込む場合、リソース消費が大きくなる可能性があります。
- **パスの指定:** パスおよびglobパターンは、ツールの対象ディレクトリからの相対パスとして正しく指定してください。画像/PDFファイルについては、それらを確実に含めるために十分な specificity を持ったパターンを使用してください。
- **デフォルトの除外設定:** デフォルトの除外パターン（`node_modules`、`.git`など）があることを意識し、必要に応じて`useDefaultExcludes=False`で上書きできますが、慎重にご利用ください。