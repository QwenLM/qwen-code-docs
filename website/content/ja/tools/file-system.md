# Qwen Code ファイルシステムツール

Qwen Code は、ローカルファイルシステムとやり取りするための包括的なツールスイートを提供します。これらのツールにより、モデルはファイルやディレクトリの読み込み、書き込み、一覧表示、検索、変更などを行うことができます。すべての操作はユーザーの管理下にあり、通常、機密性の高い操作については確認が求められます。

**Note:** すべてのファイルシステムツールは、セキュリティのために `rootDirectory`（通常は CLI を起動したカレントワーキングディレクトリ）内で動作します。これらのツールに指定するパスは、一般的に絶対パスであるか、このルートディレクトリからの相対パスとして解決されます。

## 1. `list_directory` (ReadFolder)

`list_directory` は、指定されたディレクトリパス直下のファイル名とサブディレクトリ名を一覧表示します。オプションで、指定された glob パターンに一致するエントリを無視することもできます。

- **Tool name:** `list_directory`
- **Display name:** ReadFolder
- **File:** `ls.ts`
- **Parameters:**
  - `path` (string, required): 一覧を取得するディレクトリの絶対パス。
  - `ignore` (array of strings, optional): 一覧から除外する glob パターンのリスト（例: `["*.log", ".git"]`）。
  - `respect_git_ignore` (boolean, optional): ファイル一覧取得時に `.gitignore` パターンを尊重するかどうか。デフォルトは `true`。
- **Behavior:**
  - ファイル名とディレクトリ名のリストを返す。
  - 各エントリがディレクトリかどうかを示す。
  - エントリをディレクトリを先に、その後アルファベット順にソートする。
- **Output (`llmContent`):** 以下のような文字列: `Directory listing for /path/to/your/folder:\n[DIR] subfolder1\nfile1.txt\nfile2.png`
- **Confirmation:** 不要。

## 2. `read_file` (ReadFile)

`read_file` は指定されたファイルの内容を読み込んで返します。このツールはテキスト、画像（PNG、JPG、GIF、WEBP、SVG、BMP）、および PDF ファイルを処理できます。テキストファイルについては、特定の行範囲を読み込むことも可能です。その他のバイナリファイル形式は通常スキップされます。

- **ツール名:** `read_file`
- **表示名:** ReadFile
- **ファイル:** `read-file.ts`
- **パラメータ:**
  - `path` (string, 必須): 読み込むファイルの絶対パス。
  - `offset` (number, オプション): テキストファイルの場合、読み込みを開始する0から始まる行番号。`limit` の設定が必要です。
  - `limit` (number, オプション): テキストファイルの場合、読み込む最大行数。省略された場合、デフォルトの最大値（例：2000行）または可能であればファイル全体を読み込みます。
- **動作:**
  - テキストファイルの場合：内容を返します。`offset` と `limit` が使用されている場合は、その範囲の行のみを返します。行数制限や1行の長さ制限により内容が切り捨てられた場合はその旨を示します。
  - 画像およびPDFファイルの場合：モデルで利用可能な形式として、base64エンコードされたデータ構造でファイル内容を返します。
  - その他のバイナリファイルの場合：識別を試みてスキップし、汎用的なバイナリファイルであることを示すメッセージを返します。
- **出力:** (`llmContent`):
  - テキストファイルの場合：ファイル内容。切り捨てがある場合は先頭にメッセージが付加されます（例：`[File content truncated: showing lines 1-100 of 500 total lines...]\nActual file content...`）。
  - 画像／PDFファイルの場合：`mimeType` と base64 の `data` を含む `inlineData` オブジェクト（例：`{ inlineData: { mimeType: 'image/png', data: 'base64encodedstring' } }`）。
  - その他のバイナリファイルの場合：`Cannot display content of binary file: /path/to/data.bin` のようなメッセージ。
- **確認:** なし。

## 3. `write_file` (WriteFile)

`write_file` は指定されたファイルに内容を書き込みます。ファイルが存在する場合は上書きされます。ファイルが存在しない場合は、そのファイル（および必要な親ディレクトリ）が作成されます。

- **ツール名:** `write_file`
- **表示名:** WriteFile
- **ファイル:** `write-file.ts`
- **パラメータ:**
  - `file_path` (string, 必須): 書き込むファイルの絶対パス。
  - `content` (string, 必須): ファイルに書き込む内容。
- **動作:**
  - 指定された `content` を `file_path` に書き込みます。
  - 親ディレクトリが存在しない場合は作成します。
- **出力 (`llmContent`):** 成功メッセージ、例: `Successfully overwrote file: /path/to/your/file.txt` または `Successfully created and wrote to new file: /path/to/new/file.txt`。
- **確認:** あり。変更内容の差分を表示し、書き込む前にユーザーの承認を求めます。

## 4. `glob` (FindFiles)

`glob` は特定の glob パターン（例: `src/**/*.ts`、`*.md`）に一致するファイルを検索し、最終更新日時順（新しい順）にソートされた絶対パスを返します。

- **ツール名:** `glob`
- **表示名:** FindFiles
- **ファイル:** `glob.ts`
- **パラメータ:**
  - `pattern` (string, 必須): マッチさせる glob パターン（例: `"*.py"`、`"src/**/*.js"`）。
  - `path` (string, 任意): 検索対象のディレクトリの絶対パス。省略された場合、ツールのルートディレクトリを検索します。
  - `case_sensitive` (boolean, 任意): 検索時に大文字小文字を区別するかどうか。デフォルトは `false`。
  - `respect_git_ignore` (boolean, 任意): ファイル検索時に .gitignore のパターンを尊重するかどうか。デフォルトは `true`。
- **動作:**
  - 指定されたディレクトリ内で glob パターンに一致するファイルを検索します。
  - 絶対パスのリストを返し、最も最近更新されたファイルが先頭に来るようにソートされます。
  - デフォルトでは `node_modules` や `.git` などの一般的な不要なディレクトリは無視されます。
- **出力 (`llmContent`):** 以下のようなメッセージ: `Found 5 file(s) matching "*.ts" within src, sorted by modification time (newest first):\nsrc/file1.ts\nsrc/subdir/file2.ts...`
- **確認:** なし。

## 5. `search_file_content` (SearchText)

`search_file_content` は、指定されたディレクトリ内のファイルの内容に対して正規表現パターンを検索します。glob パターンを使って対象ファイルをフィルタリングすることも可能です。マッチした行とそのファイルパス、行番号を返します。

- **Tool name:** `search_file_content`
- **Display name:** SearchText
- **File:** `grep.ts`
- **Parameters:**
  - `pattern` (string, required): 検索する正規表現（regex）パターン（例: `"function\s+myFunction"`）。
  - `path` (string, optional): 検索対象のディレクトリへの絶対パス。省略時はカレントディレクトリを使用します。
  - `include` (string, optional): 対象ファイルをフィルタリングするための glob パターン（例: `"*.js"`, `"src/**/*.{ts,tsx}"`）。省略時は一般的な無視設定を尊重しつつ、ほとんどのファイルを検索します。
  - `maxResults` (number, optional): コンテキストオーバーフローを防ぐために返すマッチ結果の最大数（デフォルト: 20、最大: 100）。広範囲な検索では少ない値を、特定の検索では多い値を使うことを推奨します。
- **動作仕様:**
  - Git リポジトリ内で利用可能な場合は高速化のため `git grep` を使用し、それ以外ではシステムの `grep` または JavaScript ベースの検索にフォールバックします。
  - マッチした各行を、ファイルパス（検索ディレクトリからの相対パス）と行番号付きでリスト形式で返します。
  - デフォルトではコンテキストオーバーフローを防ぐため、最大20件までのマッチ結果に制限されます。結果が切り捨てられた場合、検索条件の絞り込みに関する明確な警告メッセージを表示します。
- **出力 (`llmContent`):** 以下のような整形された文字列として結果を返します：

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

  WARNING: Results truncated to prevent context overflow. To see more results:
  - Use a more specific pattern to reduce matches
  - Add file filters with the 'include' parameter (e.g., "*.js", "src/**")
  - Specify a narrower 'path' to search in a subdirectory
  - Increase 'maxResults' parameter if you need more matches (current: 20)
  ```

- **確認ダイアログ:** 不要（No）

### `search_file_content` の例

デフォルトの結果制限でパターンを検索:

```
search_file_content(pattern="function\s+myFunction", path="src")
```

カスタム結果制限でパターンを検索:

```
search_file_content(pattern="function", path="src", maxResults=50)
```

ファイルフィルタリングとカスタム結果制限でパターンを検索:

```
search_file_content(pattern="function", include="*.js", maxResults=10)
```

## 6. `edit` (編集)

`edit` はファイル内のテキストを置換します。デフォルトでは最初に見つかった1箇所のみを置換しますが、`expected_replacements` を指定することで複数箇所の置換も可能です。このツールは正確で対象を絞った変更を行うために設計されており、正しい位置を確実に修正するために `old_string` の前後には十分なコンテキストが必要です。

- **ツール名:** `edit`
- **表示名:** 編集
- **ファイル:** `edit.ts`
- **パラメータ:**
  - `file_path` (string, 必須): 変更するファイルへの絶対パス。
  - `old_string` (string, 必須): 置換する正確な文字列。

    **重要:** この文字列は変更対象の箇所を一意に特定できる必要があります。ターゲットとなるテキストの前後それぞれ最低でも3行分のコンテキストを含み、空白やインデントも正確に一致させてください。もし `old_string` が空の場合、ツールは `file_path` に新しいファイルを作成し、内容として `new_string` を設定しようとします。

  - `new_string` (string, 必須): `old_string` を置き換える正確な文字列。
  - `expected_replacements` (number, オプション): 置換する回数。デフォルトは `1` 回です。

- **動作仕様:**
  - `old_string` が空でかつ `file_path` が存在しない場合、`new_string` を内容として新しいファイルを作成します。
  - `old_string` が指定されている場合、`file_path` を読み込み、`old_string` と完全一致する箇所をちょうど1つだけ探します。
  - 該当箇所が1つ見つかった場合は、それを `new_string` で置換します。
  - **信頼性向上（マルチステージ編集補正）:** 編集成功率を大幅に高めるため、特にモデルから提供された `old_string` が完全に正確でない可能性がある場合でも、ツールにはマルチステージ編集補正メカニズムが組み込まれています。
    - 初期の `old_string` が見つからない、または複数箇所にマッチした場合、Qwen モデルを使って段階的に `old_string` （および必要に応じて `new_string`）を改善できます。
    - この自己補正プロセスにより、モデルが本来変更しようとしたユニークな部分を識別でき、わずかに不正確な初期コンテキストでも `edit` 操作をより堅牢に行えるようになります。
- **失敗条件:** 補正機能があっても以下の場合はツールは失敗します：
  - `file_path` が絶対パスではない、またはルートディレクトリ外にある。
  - `old_string` が空でなく、かつ `file_path` が存在しない。
  - `old_string` が空だが、`file_path` は既に存在している。
  - 自己補正を試みても `old_string` がファイル内に見つからない。
  - `old_string` が複数箇所に見つかり、自己補正によって一意に特定できない。
- **出力 (`llmContent`):**
  - 成功時: `Successfully modified file: /path/to/file.txt (1 replacements).` または `Created new file: /path/to/new_file.txt with provided content.`
  - 失敗時: 原因を説明するエラーメッセージ（例：`Failed to edit, 0 occurrences found...`、`Failed to edit, expected 1 occurrences but found 2...`）
- **確認:** あり。提案された変更内容の差分(diff)を表示し、ファイル書き込み前にユーザーの承認を求めます。

これらのファイルシステムツールにより、Qwen Code はローカルプロジェクトのコンテキストを理解し操作することが可能になります。