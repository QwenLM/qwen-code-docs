# Qwen Code ファイルシステムツール

Qwen Code は、ローカルファイルシステムとやり取りするための包括的なツールスイートを提供します。これらのツールにより、モデルはファイルやディレクトリの読み書き、一覧表示、検索、変更などの操作を行えます。すべての操作はユーザーの管理下にあり、通常、機密性の高い操作については確認が求められます。

**注:** すべてのファイルシステムツールは、セキュリティのために `rootDirectory`（通常は CLI を起動した現在の作業ディレクトリ）内で動作します。これらのツールに指定するパスは、一般的に絶対パスであるか、このルートディレクトリからの相対パスとして解決されます。

## 1. `list_directory` (ListFiles)

`list_directory` は、指定されたディレクトリパス直下のファイル名とサブディレクトリ名を一覧表示します。オプションで、指定されたglobパターンに一致するエントリを無視できます。

- **ツール名:** `list_directory`
- **表示名:** ListFiles
- **ファイル:** `ls.ts`
- **パラメータ:**
  - `path` (string, 必須): 一覧を表示するディレクトリの絶対パス。
  - `ignore` (文字列の配列, オプション): 一覧から除外するglobパターンのリスト（例: `["*.log", ".git"]`）。
  - `respect_git_ignore` (boolean, オプション): ファイルを一覧表示する際に `.gitignore` パターンを尊重するかどうか。デフォルトは `true`。
- **動作:**
  - ファイル名とディレクトリ名のリストを返します。
  - 各エントリがディレクトリかどうかを示します。
  - エントリをディレクトリを先に、その後アルファベット順にソートします。
- **出力 (`llmContent`):** 次のような文字列: `Directory listing for /path/to/your/folder:\n[DIR] subfolder1\nfile1.txt\nfile2.png`
- **確認:** なし。

## 2. `read_file` (ReadFile)

`read_file` は指定されたファイルの内容を読み取り、返します。このツールはテキスト、画像（PNG、JPG、GIF、WEBP、SVG、BMP）、およびPDFファイルを処理できます。テキストファイルについては、特定の行範囲を読み取ることも可能です。その他のバイナリファイル形式は通常スキップされます。

- **ツール名:** `read_file`
- **表示名:** ReadFile
- **ファイル:** `read-file.ts`
- **パラメータ:**
  - `path` (string, 必須): 読み込むファイルの絶対パス。
  - `offset` (number, オプション): テキストファイルの場合、読み込みを開始する0始まりの行番号。`limit` の設定が必要です。
  - `limit` (number, オプション): テキストファイルの場合、読み込む最大行数。省略された場合、デフォルトの最大値（例：2000行）または可能であればファイル全体を読み込みます。
- **動作:**
  - テキストファイルの場合: 内容を返します。`offset` と `limit` が使用された場合は、その行範囲のみを返します。行制限や行長制限により内容が切り捨てられた場合はその旨を示します。
  - 画像およびPDFファイルの場合: モデルでの利用に適したbase64エンコードされたデータ構造としてファイル内容を返します。
  - その他のバイナリファイルの場合: 識別を試み、スキップして汎用バイナリファイルであることを示すメッセージを返します。
- **出力:** (`llmContent`):
  - テキストファイルの場合: ファイル内容。切り捨てメッセージが先頭に付加される場合があります（例：`[File content truncated: showing lines 1-100 of 500 total lines...]\nActual file content...`）。
  - 画像/PDFファイルの場合: `mimeType` とbase64 `data` を含む `inlineData` を持つオブジェクト（例：`{ inlineData: { mimeType: 'image/png', data: 'base64encodedstring' } }`）。
  - その他のバイナリファイルの場合: `Cannot display content of binary file: /path/to/data.bin` のようなメッセージ。
- **確認:** なし。

## 3. `write_file` (WriteFile)

`write_file` は指定されたファイルに内容を書き込みます。ファイルが存在する場合、上書きされます。ファイルが存在しない場合は、そのファイル（および必要な親ディレクトリ）が作成されます。

- **ツール名:** `write_file`
- **表示名:** WriteFile
- **ファイル:** `write-file.ts`
- **パラメータ:**
  - `file_path` (string, 必須): 書き込むファイルの絶対パス。
  - `content` (string, 必須): ファイルに書き込む内容。
- **動作:**
  - 指定された `content` を `file_path` に書き込みます。
  - 親ディレクトリが存在しない場合は作成します。
- **出力 (`llmContent`):** 成功メッセージ。例: `Successfully overwrote file: /path/to/your/file.txt` または `Successfully created and wrote to new file: /path/to/new/file.txt`。
- **確認:** あり。変更内容の差分を表示し、書き込む前にユーザーの承認を求めます。

## 4. `glob` (Glob)

`glob` は特定の glob パターン（例：`src/**/*.ts`、`*.md`）に一致するファイルを検索し、変更時刻順（新しい順）にソートされた絶対パスを返します。

- **ツール名:** `glob`
- **表示名:** Glob
- **ファイル:** `glob.ts`
- **パラメータ:**
  - `pattern` (文字列, 必須): 一致させる glob パターン（例：`"*.py"`、`"src/**/*.js"`）。
  - `path` (文字列, 任意): 検索対象のディレクトリ。指定しない場合、現在の作業ディレクトリが使用されます。
- **動作:**
  - 指定されたディレクトリ内で glob パターンに一致するファイルを検索します。
  - 絶対パスのリストを、最も最近変更されたファイルが先頭にくるようにソートして返します。
  - デフォルトで .gitignore および .qwenignore パターンを尊重します。
  - コンテキストのオーバーフローを防ぐため、結果は最大100ファイルに制限されます。
- **出力 (`llmContent`):** 以下のようなメッセージ：`Found 5 file(s) matching "*.ts" within /path/to/search/dir, sorted by modification time (newest first):\n---\n/path/to/file1.ts\n/path/to/subdir/file2.ts\n---\n[95 files truncated] ...`
- **確認:** なし。

## 5. `grep_search` (Grep)

`grep_search` は、指定されたディレクトリ内のファイルの内容から正規表現パターンを検索します。グロブパターンでファイルをフィルタリングできます。一致した行とそのファイルパスおよび行番号を返します。

- **ツール名:** `grep_search`
- **表示名:** Grep
- **ファイル:** `grep.ts`（フォールバックとして `ripGrep.ts` を使用）
- **パラメータ:**
  - `pattern`（文字列、必須）：ファイル内容内で検索する正規表現パターン（例：`"function\\s+myFunction"`、`"log.*Error"`）。
  - `path`（文字列、オプション）：検索対象のファイルまたはディレクトリ。デフォルトは現在の作業ディレクトリ。
  - `glob`（文字列、オプション）：ファイルをフィルタリングするグロブパターン（例：`"*.js"`、`"src/**/*.{ts,tsx}"`）。
  - `limit`（数値、オプション）：最初の N 件の一致行に結果を制限します。省略時はすべての一致を表示します。
- **動作:**
  - 利用可能な場合は高速な検索のために ripgrep を使用し、それ以外の場合は JavaScript ベースの検索実装にフォールバックします。
  - 一致した行とそのファイルパスおよび行番号を返します。
  - デフォルトでは大文字小文字を区別しません。
  - `.gitignore` および `.qwenignore` のパターンを尊重します。
  - コンテキストのオーバーフローを防ぐために出力を制限します。
- **出力（`llmContent`）:** 一致結果の整形された文字列。例：

  ```
  パス "." 内でパターン "myFunction" の一致が 3 件見つかりました（フィルタ："*.ts"）：
  ---
  src/utils.ts:15:export function myFunction() {
  src/utils.ts:22:  myFunction.call();
  src/index.ts:5:import { myFunction } from './utils';
  ---

  [0 行が切り捨てられました] ...
  ```

- **確認:** 不要。

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

`edit` はファイル内のテキストを置換します。デフォルトでは、`old_string` が一意の位置と一致することを要求します。意図的にすべての出現箇所を変更したい場合は、`replace_all` を `true` に設定してください。このツールは正確で対象を絞った変更を行うために設計されており、正しい場所を修正するために `old_string` の周囲に十分なコンテキストを必要とします。

- **ツール名:** `edit`
- **表示名:** 編集
- **ファイル:** `edit.ts`
- **パラメータ:**
  - `file_path` (文字列, 必須): 変更するファイルへの絶対パス。
  - `old_string` (文字列, 必須): 置換する正確なリテラルテキスト。

    **重要:** この文字列は変更する単一のインスタンスを一意に識別する必要があります。ターゲットテキストの周囲に十分なコンテキストを含め、空白やインデントを正確に一致させる必要があります。`old_string` が空の場合、ツールは `file_path` に新しいファイルを作成し、内容として `new_string` を使用しようとします。

  - `new_string` (文字列, 必須): `old_string` を置換する正確なリテラルテキスト。
  - `replace_all` (ブール値, オプション): `old_string` のすべての出現箇所を置換します。デフォルトは `false`。

- **動作:**
  - `old_string` が空で `file_path` が存在しない場合、`new_string` を内容とする新しいファイルを作成します。
  - `old_string` が指定されている場合、`file_path` を読み取り、`replace_all` が true でない限り、ちょうど一つの出現箇所を見つけようとします。
  - マッチが一意である（または `replace_all` が true）、テキストを `new_string` で置換します。
  - **信頼性向上（マルチステージ編集補正）：** 編集の成功率を大幅に向上させるため、特にモデル提供の `old_string` が完全には正確でない可能性がある場合、ツールにはマルチステージ編集補正メカニズムが組み込まれています。
    - 初期の `old_string` が見つからないか複数の場所にマッチする場合、ツールはQwenモデルを利用して `old_string` （および潜在的に `new_string`）を反復的に洗練させることができます。
    - この自己補正プロセスは、モデルが変更しようとした一意のセグメントを特定しようと試み、初期コンテキストがわずかに不完全であっても `edit` 操作をより堅牢にします。
- **失敗条件:** 補正メカニズムにもかかわらず、以下の場合はツールは失敗します：
  - `file_path` が絶対パスではない、またはルートディレクトリ外にある。
  - `old_string` が空でなく、`file_path` が存在しない。
  - `old_string` が空で、`file_path` が既に存在する。
  - 補正を試みた後でも `old_string` がファイル内に見つからない。
  - `old_string` が複数回見つかり、`replace_all` が false で、自己補正メカニズムが単一の明確なマッチに解決できない。
- **出力 (`llmContent`):**
  - 成功時: `Successfully modified file: /path/to/file.txt (1 replacements).` または `Created new file: /path/to/new_file.txt with provided content.`
  - 失敗時: 失敗理由を説明するエラーメッセージ（例: `Failed to edit, 0 occurrences found...`, `Failed to edit because the text matches multiple locations...`）。
- **確認:** あり。提案された変更の差分を表示し、ファイルに書き込む前にユーザーの承認を求めます。

これらのファイルシステムツールは、Qwen Code がローカルプロジェクトのコンテキストを理解し、操作するための基盤を提供します。