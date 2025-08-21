# Qwen Code ファイルシステムツール

Qwen Code は、ローカルファイルシステムとやり取りするための包括的なツールスイートを提供します。これらのツールにより、モデルはファイルやディレクトリの読み書き、一覧表示、検索、変更などの操作を実行できます。すべての操作はユーザーの管理下にあり、通常、機密性の高い操作については確認が求められます。

**注意:** すべてのファイルシステムツールは、セキュリティのために `rootDirectory`（通常は CLI を起動した現在の作業ディレクトリ）内で動作します。これらのツールに指定するパスは、一般的に絶対パスであるか、またはこのルートディレクトリからの相対パスとして解決されます。

## 1. `list_directory` (ReadFolder)

`list_directory` は、指定されたディレクトリパス直下にあるファイルとサブディレクトリの名前を一覧表示します。オプションで、指定された glob パターンに一致するエントリを無視することもできます。

- **ツール名:** `list_directory`
- **表示名:** ReadFolder
- **ファイル:** `ls.ts`
- **パラメータ:**
  - `path` (string, 必須): 一覧を表示するディレクトリの絶対パス。
  - `ignore` (string の配列, オプション): 一覧から除外する glob パターンのリスト（例: `["*.log", ".git"]`）。
  - `respect_git_ignore` (boolean, オプション): ファイルを一覧表示する際に `.gitignore` パターンを尊重するかどうか。デフォルトは `true`。
- **動作:**
  - ファイル名とディレクトリ名のリストを返します。
  - 各エントリがディレクトリかどうかを示します。
  - ディレクトリを先に、その後アルファベット順にエントリをソートします。
- **出力 (`llmContent`):** 以下のような文字列: `Directory listing for /path/to/your/folder:\n[DIR] subfolder1\nfile1.txt\nfile2.png`
- **確認:** なし。

## 2. `read_file` (ReadFile)

`read_file` は指定されたファイルの内容を読み込み、返却します。このツールはテキストファイル、画像ファイル（PNG、JPG、GIF、WEBP、SVG、BMP）、および PDF ファイルを処理できます。テキストファイルについては、特定の行範囲を読み込むことも可能です。その他のバイナリファイル形式は通常スキップされます。

- **ツール名:** `read_file`
- **表示名:** ReadFile
- **ファイル:** `read-file.ts`
- **パラメータ:**
  - `path` (string, 必須): 読み込むファイルの絶対パス。
  - `offset` (number, 任意): テキストファイルの場合、読み込みを開始する0始まりの行番号。`limit` が設定されている必要があります。
  - `limit` (number, 任意): テキストファイルの場合、読み込む最大行数。省略された場合、デフォルトの最大行数（例: 2000行）または可能であればファイル全体を読み込みます。
- **動作:**
  - テキストファイルの場合: 内容を返却します。`offset` と `limit` が指定された場合は、その範囲の行のみを返却します。行数制限または1行の長さ制限により内容が切り捨てられた場合はその旨を示します。
  - 画像および PDF ファイルの場合: モデルが処理できる形式の base64 エンコードされたデータ構造としてファイル内容を返却します。
  - その他のバイナリファイルの場合: 識別を試み、スキップして汎用的なバイナリファイルであることを示すメッセージを返却します。
- **出力:** (`llmContent`):
  - テキストファイルの場合: ファイル内容。切り捨てが発生した場合は先頭に切り捨てメッセージが付加されます（例: `[File content truncated: showing lines 1-100 of 500 total lines...]\nActual file content...`）。
  - 画像/PDF ファイルの場合: `mimeType` と base64 の `data` を含む `inlineData` オブジェクト（例: `{ inlineData: { mimeType: 'image/png', data: 'base64encodedstring' } }`）。
  - その他のバイナリファイルの場合: `Cannot display content of binary file: /path/to/data.bin` のようなメッセージ。
- **確認:** なし。

## 3. `write_file` (WriteFile)

`write_file` は指定されたファイルに内容を書き込みます。ファイルが存在する場合は上書きされ、存在しない場合はファイル（および必要な親ディレクトリ）が作成されます。

- **ツール名:** `write_file`
- **表示名:** WriteFile
- **ファイル:** `write-file.ts`
- **パラメータ:**
  - `file_path` (string, 必須): 書き込み先ファイルの絶対パス
  - `content` (string, 必須): ファイルに書き込む内容
- **動作:**
  - 指定された `content` を `file_path` に書き込みます
  - 親ディレクトリが存在しない場合は作成します
- **出力 (`llmContent`):** 成功メッセージ、例: `Successfully overwrote file: /path/to/your/file.txt` または `Successfully created and wrote to new file: /path/to/new/file.txt`
- **確認:** あり。変更内容の差分を表示し、書き込み前にユーザーの承認を求めます

## 4. `glob` (FindFiles)

`glob` は特定の glob パターン（例: `src/**/*.ts`、`*.md`）に一致するファイルを検索し、最終更新日時順（新しい順）にソートされた絶対パスを返します。

- **ツール名:** `glob`
- **表示名:** FindFiles
- **ファイル:** `glob.ts`
- **パラメータ:**
  - `pattern` (string, 必須): マッチさせる glob パターン（例: `"*.py"`、`"src/**/*.js"`）。
  - `path` (string, 任意): 検索対象のディレクトリの絶対パス。省略された場合、ツールのルートディレクトリを検索します。
  - `case_sensitive` (boolean, 任意): 検索時に大文字小文字を区別するかどうか。デフォルトは `false`。
  - `respect_git_ignore` (boolean, 任意): ファイル検索時に .gitignore パターンを尊重するかどうか。デフォルトは `true`。
- **動作:**
  - 指定されたディレクトリ内で glob パターンに一致するファイルを検索します。
  - 絶対パスのリストを返し、最も最近更新されたファイルが先頭に来るようにソートされます。
  - デフォルトでは `node_modules` や `.git` などの一般的な不要なディレクトリは無視されます。
- **出力 (`llmContent`):** 以下のようなメッセージ: `Found 5 file(s) matching "*.ts" within src, sorted by modification time (newest first):\nsrc/file1.ts\nsrc/subdir/file2.ts...`
- **確認:** なし。

## 5. `search_file_content` (SearchText)

`search_file_content` は、指定されたディレクトリ内のファイルの内容に対して正規表現パターンを検索します。glob パターンでファイルをフィルタリングできます。マッチした行とそのファイルパス、行番号を返します。

- **Tool name:** `search_file_content`
- **Display name:** SearchText
- **File:** `grep.ts`
- **Parameters:**
  - `pattern` (string, required): 検索する正規表現（regex）（例: `"function\s+myFunction"`）。
  - `path` (string, optional): 検索対象のディレクトリの絶対パス。デフォルトはカレントワーキングディレクトリ。
  - `include` (string, optional): 検索するファイルをフィルタリングする glob パターン（例: `"*.js"`, `"src/**/*.{ts,tsx}"`）。省略した場合、一般的な無視ファイルを除いてほとんどのファイルを検索。
- **Behavior:**
  - Git リポジトリ内で利用可能な場合は高速化のため `git grep` を使用し、それ以外の場合はシステムの `grep` または JavaScript ベースの検索にフォールバックします。
  - マッチした行のリストを返し、各行には検索ディレクトリからの相対パスと行番号がプレフィックスとして付加されます。
- **Output (`llmContent`):** 以下のようにフォーマットされたマッチ結果の文字列:
  ```
  Found 3 matches for pattern "myFunction" in path "." (filter: "*.ts"):
  ---
  File: src/utils.ts
  L15: export function myFunction() {
  L22:   myFunction.call();
  ---
  File: src/index.ts
  L5: import { myFunction } from './utils';
  ---
  ```
- **Confirmation:** なし

## 6. `replace` (編集)

`replace` はファイル内のテキストを置換します。デフォルトでは1つの出現箇所のみを置換しますが、`expected_replacements` を指定することで複数の出現箇所を置換することも可能です。このツールは正確で対象を絞った変更を行うために設計されており、正しい場所を変更するために `old_string` の前後にある十分なコンテキストを必要とします。

- **ツール名:** `replace`
- **表示名:** 編集
- **ファイル:** `edit.ts`
- **パラメータ:**
  - `file_path` (string, 必須): 変更するファイルの絶対パス。
  - `old_string` (string, 必須): 置換する正確な文字列。

    **重要:** この文字列は変更する単一のインスタンスを一意に識別する必要があります。ターゲットテキストの前後少なくとも3行分のコンテキストを含み、空白やインデントも正確に一致させる必要があります。`old_string` が空の場合、ツールは `new_string` を内容として `file_path` に新しいファイルを作成しようとします。

  - `new_string` (string, 必須): `old_string` を置換する正確な文字列。
  - `expected_replacements` (number, 任意): 置換する出現回数。デフォルトは `1`。

- **動作:**
  - `old_string` が空で `file_path` が存在しない場合、`new_string` を内容として新しいファイルを作成します。
  - `old_string` が指定されている場合、`file_path` を読み込み、`old_string` の出現箇所を正確に1つだけ探します。
  - 出現箇所が1つ見つかった場合、それを `new_string` で置換します。
  - **信頼性の向上 (マルチステージ編集修正):** 編集の成功率を大幅に向上させるために、特にモデルが提供した `old_string` が完全に正確でない可能性がある場合に備えて、ツールにはマルチステージ編集修正メカニズムが組み込まれています。
    - 初期の `old_string` が見つからない、または複数の場所に一致する場合、ツールはGeminiモデルを活用して `old_string`（および場合によっては `new_string`）を段階的に洗練させることができます。
    - この自己修正プロセスは、モデルが変更しようとした一意のセグメントを識別しようとし、初期コンテキストがわずかに不完全であっても `replace` 操作をより堅牢にします。
- **失敗条件:** 修正メカニズムにもかかわらず、以下の場合はツールが失敗します:
  - `file_path` が絶対パスでない、またはルートディレクトリ外にある。
  - `old_string` が空でなく、`file_path` が存在しない。
  - `old_string` が空で、`file_path` が既に存在する。
  - 修正を試みた後も `old_string` がファイル内に見つからない。
  - `old_string` が複数回見つかり、自己修正メカニズムが一意で明確な一致に解決できない。
- **出力 (`llmContent`):**
  - 成功時: `Successfully modified file: /path/to/file.txt (1 replacements).` または `Created new file: /path/to/new_file.txt with provided content.`
  - 失敗時: 失敗理由を説明するエラーメッセージ（例: `Failed to edit, 0 occurrences found...`, `Failed to edit, expected 1 occurrences but found 2...`）。
- **確認:** あり。提案された変更の差分を表示し、ファイルに書き込む前にユーザーの承認を求めます。

これらのファイルシステムツールは、Qwen Codeがローカルプロジェクトのコンテキストを理解し、操作するための基盤を提供します。