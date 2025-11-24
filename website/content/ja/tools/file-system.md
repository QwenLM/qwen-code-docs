# Qwen Code ファイルシステムツール

Qwen Code は、ローカルファイルシステムとやり取りするための包括的なツールスイートを提供します。これらのツールにより、モデルはファイルやディレクトリの読み込み、書き込み、一覧表示、検索、変更などの操作を行うことができます。すべての操作はユーザーの管理下にあり、通常、機密性の高い操作については確認が求められます。

**注意:** すべてのファイルシステムツールは、セキュリティのために `rootDirectory`（通常は CLI を起動したカレントワーキングディレクトリ）内で動作します。これらのツールに指定するパスは、一般的に絶対パスであるか、またはこのルートディレクトリからの相対パスとして解決されます。

## 1. `list_directory` (ListFiles)

`list_directory` は、指定されたディレクトリパス直下のファイル名とサブディレクトリ名を一覧表示します。オプションで、指定した glob パターンに一致するエントリを無視することもできます。

- **ツール名:** `list_directory`
- **表示名:** ListFiles
- **ファイル:** `ls.ts`
- **パラメータ:**
  - `path` (string, 必須): 一覧を表示するディレクトリの絶対パス。
  - `ignore` (文字列の配列, オプション): 一覧から除外する glob パターンのリスト（例: `["*.log", ".git"]`）。
  - `respect_git_ignore` (boolean, オプション): ファイル一覧表示時に `.gitignore` パターンを尊重するかどうか。デフォルトは `true`。
- **動作:**
  - ファイル名とディレクトリ名のリストを返す。
  - 各エントリがディレクトリかどうかを示す。
  - エントリをディレクトリを先に、その後アルファベット順にソートする。
- **出力 (`llmContent`):** 次のような文字列: `Directory listing for /path/to/your/folder:\n[DIR] subfolder1\nfile1.txt\nfile2.png`
- **確認:** 不要。

## 2. `read_file` (ReadFile)

`read_file` は指定されたファイルの内容を読み込んで返します。このツールはテキスト、画像（PNG、JPG、GIF、WEBP、SVG、BMP）、および PDF ファイルを処理できます。テキストファイルについては特定の行範囲を読み込むことも可能です。その他のバイナリファイル形式は通常スキップされます。

- **ツール名:** `read_file`
- **表示名:** ReadFile
- **ファイル:** `read-file.ts`
- **パラメータ:**
  - `path` (string, 必須): 読み込むファイルの絶対パス。
  - `offset` (number, 任意): テキストファイルの場合、読み込みを開始する0から始まる行番号。`limit` の設定が必要です。
  - `limit` (number, 任意): テキストファイルの場合、読み込む最大行数。省略した場合、デフォルトの最大値（例：2000行）または可能であればファイル全体を読み込みます。
- **動作仕様:**
  - テキストファイルの場合：内容を返します。`offset` と `limit` が使用された場合は、その範囲の行のみを返します。行数制限や1行の長さ制限により内容が切り捨てられた場合はその旨を示します。
  - 画像およびPDFファイルの場合：モデルが処理できるように、base64エンコードされたデータ構造としてファイル内容を返します。
  - その他のバイナリファイルの場合：識別を試みてスキップし、汎用的なバイナリファイルであることを示すメッセージを返します。
- **出力:** (`llmContent`):
  - テキストファイルの場合：ファイル内容。切り捨てがあった場合は先頭にメッセージが付加されます（例：`[File content truncated: showing lines 1-100 of 500 total lines...]\nActual file content...`）。
  - 画像／PDFファイルの場合：`mimeType` とbase64の `data` を含む `inlineData` オブジェクト（例：`{ inlineData: { mimeType: 'image/png', data: 'base64encodedstring' } }`）。
  - その他のバイナリファイルの場合：`Cannot display content of binary file: /path/to/data.bin` のようなメッセージ。
- **確認ダイアログ:** なし。

## 3. `write_file` (WriteFile)

`write_file` は指定されたファイルに内容を書き込みます。ファイルが存在する場合は上書きされ、存在しない場合はファイル（および必要な親ディレクトリ）が作成されます。

- **ツール名:** `write_file`
- **表示名:** WriteFile
- **ファイル:** `write-file.ts`
- **パラメータ:**
  - `file_path` (string, 必須): 書き込むファイルの絶対パス。
  - `content` (string, 必須): ファイルに書き込む内容。
- **動作:**
  - 指定された `content` を `file_path` に書き込みます。
  - 親ディレクトリが存在しない場合、それらも作成されます。
- **出力 (`llmContent`):** 成功メッセージ。例: `Successfully overwrote file: /path/to/your/file.txt` または `Successfully created and wrote to new file: /path/to/new/file.txt`。
- **確認:** あり。変更内容の差分を表示し、書き込む前にユーザーの承認を求めます。

## 4. `glob` (Glob)

`glob` は特定の glob パターン（例: `src/**/*.ts`、`*.md`）に一致するファイルを検索し、更新時刻順（新しい順）にソートされた絶対パスを返します。

- **ツール名:** `glob`
- **表示名:** Glob
- **ファイル:** `glob.ts`
- **パラメータ:**
  - `pattern` (string, 必須): 検索する glob パターン（例: `"*.py"`、`"src/**/*.js"`）。
  - `path` (string, 任意): 検索対象のディレクトリ。指定しない場合はカレントディレクトリが使用されます。
- **動作:**
  - 指定されたディレクトリ内で glob パターンに一致するファイルを検索します。
  - 結果として絶対パスのリストを返し、最も最近更新されたファイルが先頭に来るようにソートされています。
  - デフォルトで `.gitignore` および `.qwenignore` のパターンを尊重します。
  - コンテキストのオーバーフローを防ぐため、結果は最大100ファイルまでに制限されます。
- **出力 (`llmContent`):** 以下のようなメッセージ: `Found 5 file(s) matching "*.ts" within /path/to/search/dir, sorted by modification time (newest first):\n---\n/path/to/file1.ts\n/path/to/subdir/file2.ts\n---\n[95 files truncated] ...`
- **確認:** 不要。

## 5. `grep_search` (Grep)

`grep_search` は、指定されたディレクトリ内のファイルの内容に対して正規表現パターンを検索します。glob パターンでファイルをフィルタリングできます。マッチした行とそのファイルパス、行番号を返します。

- **ツール名:** `grep_search`
- **表示名:** Grep
- **ファイル:** `ripGrep.ts` (ただし、`grep.ts` をフォールバックとして使用)
- **パラメータ:**
  - `pattern` (string, 必須): ファイル内容から検索する正規表現パターン（例: `"function\\s+myFunction"`, `"log.*Error"`）。
  - `path` (string, 任意): 検索対象のファイルまたはディレクトリ。デフォルトではカレントワーキングディレクトリを使用。
  - `glob` (string, 任意): ファイルをフィルタリングするための glob パターン（例: `"*.js"`, `"src/**/*.{ts,tsx}"`）。
  - `limit` (number, 任意): 最初の N 行に一致する結果に限定して出力。省略時はすべてのマッチ結果を表示。
- **動作仕様:**
  - 利用可能な場合は高速な検索のために ripgrep を使用し、それ以外の場合は JavaScript ベースの検索実装にフォールバックします。
  - マッチした行とそのファイルパスおよび行番号を返します。
  - デフォルトでは大文字・小文字を区別しません。
  - `.gitignore` および `.qwenignore` のパターンを尊重します。
  - コンテキストのオーバーフローを防ぐために出力を制限します。
- **出力 (`llmContent`):** 以下のような整形されたマッチ結果の文字列：

  ```
  Found 3 matches for pattern "myFunction" in path "." (filter: "*.ts"):
  ---
  src/utils.ts:15:export function myFunction() {
  src/utils.ts:22:  myFunction.call();
  src/index.ts:5:import { myFunction } from './utils';
  ---

  [0 lines truncated] ...
  ```

- **確認ダイアログ表示:** なし

### `grep_search` の例

デフォルトの結果制限でパターンを検索:

```
grep_search(pattern="function\\s+myFunction", path="src")
```

カスタム結果制限でパターンを検索:

```
grep_search(pattern="function", path="src", limit=50)
```

ファイルフィルタリングとカスタム結果制限でパターンを検索:

```
grep_search(pattern="function", glob="*.js", limit=10)
```

## 6. `edit` (編集)

`edit` はファイル内のテキストを置換します。デフォルトでは、`old_string` がファイル内で一意の位置に一致することを要求します。意図的にすべての出現箇所を変更したい場合は、`replace_all` を `true` に設定してください。このツールは正確で対象を絞った変更を行うことを目的としており、正しい場所を確実に修正するために、`old_string` の前後には十分なコンテキスト（最低でも前後に3行ずつ）を含める必要があります。

- **ツール名:** `edit`
- **表示名:** 編集
- **ファイル:** `edit.ts`
- **パラメータ:**
  - `file_path` (string, 必須): 変更するファイルの絶対パス。
  - `old_string` (string, 必須): 置換する正確な文字列。

    **重要:** この文字列は、変更対象の一意な箇所を特定できるようにする必要があります。ターゲットとなるテキストの前後それぞれに少なくとも3行分のコンテキストを含め、空白やインデントも正確に一致させてください。もし `old_string` が空の場合、ツールは `file_path` に新しいファイルを作成し、内容として `new_string` を書き込みます。

  - `new_string` (string, 必須): `old_string` を置き換える正確な文字列。
  - `replace_all` (boolean, オプション): `old_string` のすべての出現箇所を置換するかどうか。デフォルトは `false`。

- **動作:**
  - `old_string` が空で、かつ `file_path` が存在しない場合、`new_string` を内容とする新しいファイルを作成します。
  - `old_string` が指定されている場合、ツールは `file_path` を読み込み、`replace_all` が `true` でない限り、その文字列がファイル内にちょうど1回だけ出現することを確認します。
  - マッチが一意である（または `replace_all` が `true`）場合、`old_string` を `new_string` で置換します。
  - **信頼性向上（マルチステージ編集補正）:** 編集の成功率を大幅に高めるため、特にモデルが提供した `old_string` が完全に正確でない可能性がある場合に備えて、ツールにはマルチステージの編集補正メカニズムが組み込まれています。
    - 初期の `old_string` が見つからない、または複数箇所にマッチする場合、ツールは Qwen モデルを使用して `old_string`（および必要に応じて `new_string`）を段階的に改善します。
    - この自己補正プロセスにより、モデルが変更しようとした一意なセグメントを特定でき、初期のコンテキストが多少不正確であっても `edit` 操作をより堅牢に行えるようになります。

- **失敗条件:** 補正メカニズムがあっても、以下の場合はツールは失敗します：
  - `file_path` が絶対パスではない、またはルートディレクトリ外にある。
  - `old_string` が空でなく、かつ `file_path` が存在しない。
  - `old_string` が空で、かつ `file_path` が既に存在する。
  - 補正を試みた結果、`old_string` がファイル内に見つからない。
  - `old_string` が複数箇所にマッチし、`replace_all` が `false` で、かつ自己補正によって一意なマッチに解決できない。

- **出力 (`llmContent`):**
  - 成功時: `Successfully modified file: /path/to/file.txt (1 replacements).` または `Created new file: /path/to/new_file.txt with provided content.`
  - 失敗時: 失敗理由を示すエラーメッセージ（例: `Failed to edit, 0 occurrences found...`, `Failed to edit because the text matches multiple locations...`）

- **確認:** あり。変更内容の差分（diff）を表示し、ファイルへの書き込み前にユーザーの承認を求めます。

これらのファイルシステムツールにより、Qwen Code はローカルプロジェクトのコンテキストを理解し、操作することが可能になります。