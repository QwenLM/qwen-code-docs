# Qwen Code ファイルシステムツール

Qwen Code は、ローカルファイルシステムとやり取りするための包括的なツールスイートを提供します。これらのツールを使用すると、モデルはファイルやディレクトリの読み取り、書き込み、一覧表示、検索、変更を、すべてユーザーの管理下で、通常は機密操作の確認を伴って実行できます。

**注:** すべてのファイルシステムツールは、セキュリティ上の理由から `rootDirectory` （通常はCLIを起動した現在のワーキングディレクトリ）内で動作します。これらのツールに指定するパスは、絶対パスであるか、またはこのルートディレクトリに対して相対的に解決されることが想定されています。

## 1. `list_directory` （ListFiles）

`list_directory` は、指定されたディレクトリパス内のファイルとサブディレクトリの名前を一覧表示します。提供された glob パターンに一致するエントリをオプションで無視できます。

- **ツール名:** `list_directory`
- **表示名:** ListFiles
- **ファイル:** `ls.ts`
- **パラメータ:**
  - `path` （文字列、必須）: 一覧表示するディレクトリの絶対パス。
  - `ignore` （文字列の配列、オプション）: 一覧から除外する glob パターンのリスト （例: `["*.log", ".git"]`） 。
  - `respect_git_ignore` （ブーリアン、オプション）: ファイルを一覧表示する際に `.gitignore` のパターンを尊重するかどうか。デフォルトは `true`。
- **動作:**
  - ファイルとディレクトリ名のリストを返します。
  - 各エントリがディレクトリかどうかを示します。
  - エントリをディレクトリが先、次にアルファベット順でソートします。
- **出力 （`llmContent`）:** `Directory listing for /path/to/your/folder:\n[DIR] subfolder1\nfile1.txt\nfile2.png` のような文字列。
- **確認:** いいえ。

## 2. `read_file` （ReadFile）

`read_file` は、指定されたファイルの内容を読み取って返します。このツールはテキストファイルと、現在のモデルがサポートするモダリティのメディアファイル（画像、PDF、音声、動画）を処理します。テキストファイルの場合は、特定の行範囲を読み取ることができます。現在のモデルがサポートしていないモダリティのメディアファイルは、役立つエラーメッセージとともに拒否されます。その他のバイナリファイルタイプは通常スキップされます。

- **ツール名:** `read_file`
- **表示名:** ReadFile
- **ファイル:** `read-file.ts`
- **パラメータ:**
  - `path` （文字列、必須）: 読み取るファイルの絶対パス。
  - `offset` （数値、オプション）: テキストファイルの場合、読み取りを開始する0ベースの行番号。`limit` の設定が必要です。
  - `limit` （数値、オプション）: テキストファイルの場合、読み取る最大行数。省略した場合、デフォルトの最大値（例: 2000行）またはファイル全体を読み取ります（可能な場合）。
- **動作:**
  - テキストファイル: 内容を返します。`offset` と `limit` が使用された場合は、その行のスライスのみを返します。行数制限または行長制限により内容が切り詰められた場合はその旨を示します。
  - メディアファイル（画像、PDF、音声、動画）: 現在のモデルがファイルのモダリティをサポートしている場合、base64エンコードされた `inlineData` オブジェクトとしてファイル内容を返します。モデルがモダリティをサポートしていない場合、ガイダンス付きのエラーメッセージ（スキルや外部ツールの提案など）を返します。
  - その他のバイナリファイル: それらを識別してスキップしようとし、一般的なバイナリファイルであることを示すメッセージを返します。
- **出力 （`llmContent`）:**
  - テキストファイル: ファイルの内容。場合によっては切り詰めメッセージが前に付加されます（例: `[File content truncated: showing lines 1-100 of 500 total lines...]\nActual file content...`）。
  - サポートされているメディアファイル: `inlineData` を含むオブジェクト。`mimeType` と base64 の `data` を含みます （例: `{ inlineData: { mimeType: 'image/png', data: 'base64encodedstring' } }`）。
  - サポートされていないメディアファイル: 現在のモデルがこのモダリティをサポートしていないことを説明し、代替手段を提案するエラーメッセージ文字列。
  - その他のバイナリファイル: `Cannot display content of binary file: /path/to/data.bin` のようなメッセージ。
- **確認:** いいえ。

### Jupyter ノートブックの読み取り

Jupyter ノートブック（`.ipynb`）の場合、`read_file` はノートブックの JSON を解析し、生の JSON ではなく構造化されたモデル読み取り可能なノートブックビューを返します。レンダリングされた出力には、ノートブックの言語、順序付けられたセル、セル ID、ソース、および要約された出力が含まれます。

ノートブックセルはその後、`notebook_edit` で編集できます。モデルは、セルをターゲットにする際に `read_file` が表示したセル ID を使用する必要があります。

`offset` と `limit` は `.ipynb` ファイルではサポートされていません。ノートブックの読み取りは構造化されたファイル全体の読み取りとして扱われます。レンダリングされたノートブック出力が大きすぎて内部で切り詰められた場合、`notebook_edit` はセルレベルの編集を拒否し、編集前に出力を減らすかノートブックを分割するよう要求します。

## 3. `notebook_edit` （NotebookEdit）

`notebook_edit` は、Jupyter ノートブック（`.ipynb`）ファイルをセルレベルで安全に編集します。ノートブックのセルを変更する場合は、`edit` や `write_file` の代わりにこれを使用してください。

- **ツール名:** `notebook_edit`
- **表示名:** NotebookEdit
- **ファイル:** `notebook-edit.ts`
- **パラメータ:**
  - `notebook_path` （文字列、必須）: `.ipynb` ファイルの絶対パス。
  - `cell_id` （文字列、オプション）: `read_file` が表示したターゲットセル ID。`replace` と `delete` で必須です。`insert` の場合、新しいセルはこのセルの後に挿入されます。省略した場合、新しいセルは先頭に挿入されます。
  - `new_source` （文字列、オプション）: `replace` と `insert` の新しいセルソース。`delete` では不要です。
  - `cell_type` （`code` または `markdown`、オプション）: 挿入するセルのタイプ、またはセルを置き換える場合のターゲットタイプ。
  - `edit_mode` （`replace`, `insert`, または `delete`、オプション）: 編集操作。デフォルトは `replace`。
- **動作:**
  - 現在のセッションで最初に `read_file` でノートブックが読み取られている必要があります。
  - `read_file` によってレンダリングされた ID（実際のノートブックセル ID と表示される `cell-N` フォールバック ID を含む）を使用してセルをターゲットにします。
  - あいまいなレンダリングセル ID を推測する代わりに拒否します。
  - コードセルの場合、ソースが変更されると古い出力をクリアし、`execution_count` をリセットします。
  - 可能な限り、ノートブックの JSON 書式、改行、エンコーディング、および BOM を保持します。
  - 表示されるフォールバック ID がシフトする可能性がある構造編集後は、以前の読み取り状態を無効化します。そのため、次のノートブック編集には新しい `read_file` が必要です。
- **出力 （`llmContent`）:** 編集されたノートブックセルを説明する成功メッセージと、`delete` 以外の操作の場合は更新されたソース。
- **確認:** はい。ノートブックの JSON diff を表示し、書き込み前にユーザーの承認を求めます（現在の権限モードまたはルールで編集ツールが自動承認されていない場合）。

### `notebook_edit` の例

コードセルの置き換え:

```
notebook_edit(
  notebook_path="/path/to/analysis.ipynb",
  cell_id="load-data",
  new_source="result = 41 + 1\nprint(result)"
)
```

既存のセルの後にマークダウンセルを挿入:

```
notebook_edit(
  notebook_path="/path/to/analysis.ipynb",
  edit_mode="insert",
  cell_id="summary",
  cell_type="markdown",
  new_source="## Findings\n\nThe cleaned data is ready for modeling."
)
```

セルの削除:

```
notebook_edit(
  notebook_path="/path/to/analysis.ipynb",
  edit_mode="delete",
  cell_id="old-experiment"
)
```

## 4. `write_file` （WriteFile）

`write_file` は、指定されたファイルに内容を書き込みます。ファイルが存在する場合は上書きされます。ファイルが存在しない場合は、（必要な親ディレクトリとともに）作成されます。

- **ツール名:** `write_file`
- **表示名:** WriteFile
- **ファイル:** `write-file.ts`
- **パラメータ:**
  - `file_path` （文字列、必須）: 書き込むファイルの絶対パス。
  - `content` （文字列、必須）: ファイルに書き込む内容。
- **動作:**
  - 提供された `content` を `file_path` に書き込みます。
  - 生の Jupyter ノートブック JSON は書き込みません。`.ipynb` セルの編集には `notebook_edit` を使用してください。
  - 親ディレクトリが存在しない場合は作成します。
- **出力 （`llmContent`）:** 成功メッセージ。例: `Successfully overwrote file: /path/to/your/file.txt` または `Successfully created and wrote to new file: /path/to/new/file.txt`。
- **確認:** はい。変更の diff を表示し、書き込み前にユーザーの承認を求めます。

## 5. `glob` （Glob）

`glob` は、特定の glob パターン（例: `src/**/*.ts`, `*.md`）に一致するファイルを検索し、絶対パスを変更時刻順（新しい順）で返します。

- **ツール名:** `glob`
- **表示名:** Glob
- **ファイル:** `glob.ts`
- **パラメータ:**
  - `pattern` （文字列、必須）: 照合する glob パターン（例: `"*.py"`, `"src/**/*.js"`)。
  - `path` （文字列、オプション）: 検索するディレクトリ。指定しない場合は、現在の作業ディレクトリが使用されます。
- **動作:**
  - 指定されたディレクトリ内で、glob パターンに一致するファイルを検索します。
  - 絶対パスのリストを返し、最も最近変更されたファイルが最初になるようにソートされます。
  - デフォルトで .gitignore、.qwenignore、および設定されたカスタム Qwen 無視ファイルを尊重します。
  - コンテキストオーバーフローを防ぐため、結果を100ファイルに制限します。
- **出力 （`llmContent`）:** `Found 5 file(s) matching "*.ts" within /path/to/search/dir, sorted by modification time (newest first):\n---\n/path/to/file1.ts\n/path/to/subdir/file2.ts\n---\n[95 files truncated] ...` のようなメッセージ。
- **確認:** いいえ。

## 6. `grep_search` （Grep）

`grep_search` は、指定されたディレクトリ内のファイルの内容から正規表現パターンを検索します。glob パターンでファイルをフィルタリングできます。一致する行を、ファイルパスと行番号とともに返します。

- **ツール名:** `grep_search`
- **表示名:** Grep
- **ファイル:** `grep.ts` （フォールバックとして `ripGrep.ts`）
- **パラメータ:**
  - `pattern` （文字列、必須）: ファイル内容で検索する正規表現パターン（例: `"function\\s+myFunction"`, `"log.*Error"`）。
  - `path` （文字列、オプション）: 検索するファイルまたはディレクトリ。デフォルトは現在の作業ディレクトリ。
  - `glob` （文字列、オプション）: ファイルをフィルタリングする glob パターン（例: `"*.js"`, `"src/**/*.{ts,tsx}"`）。
  - `limit` （整数、オプション）: 出力を最初の N 件の一致行に制限します。正の整数である必要があります。指定しない場合は、すべての一致が表示されます。
- **動作:**
  - 利用可能な場合は ripgrep を使用して高速検索を実行します。それ以外の場合は、JavaScriptベースの検索実装にフォールバックします。
  - 一致する行をファイルパスと行番号とともに返します。
  - デフォルトで大文字と小文字を区別しません。
  - .gitignore、.qwenignore、および設定されたカスタム Qwen 無視ファイルを尊重します。
  - コンテキストオーバーフローを防ぐために出力を制限します。
- **出力 （`llmContent`）:** 一致結果のフォーマットされた文字列。例:

  ```
  Found 3 matches for pattern "myFunction" in path "." (filter: "*.ts"):
  ---
  src/utils.ts:15:export function myFunction() {
  src/utils.ts:22:  myFunction.call();
  src/index.ts:5:import { myFunction } from './utils';
  ---

  [0 lines truncated] ...
  ```

- **確認:** いいえ。

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

## 7. `edit` （Edit）

`edit` は、ファイル内のテキストを置き換えます。デフォルトでは、`old_string` が一意の場所に一致する必要があります。すべての出現箇所を意図的に変更する場合は、`replace_all` を `true` に設定します。このツールは、正確でターゲットを絞った変更のために設計されており、`old_string` の周囲に十分なコンテキストが必要です。

- **ツール名:** `edit`
- **表示名:** Edit
- **ファイル:** `edit.ts`
- **パラメータ:**
  - `file_path` （文字列、必須）: 変更するファイルの絶対パス。
  - `old_string` （文字列、必須）: 置き換える正確なリテラルテキスト。

    **重要:** この文字列は、変更する単一のインスタンスを一意に識別する必要があります。ターゲットテキストの周囲に十分なコンテキストを含め、空白とインデントを正確に一致させる必要があります。`old_string` が空の場合、ツールは `new_string` を内容として `file_path` に新しいファイルを作成しようとします。

  - `new_string` （文字列、必須）: `old_string` を置き換える正確なリテラルテキスト。
  - `replace_all` （ブーリアン、オプション）: `old_string` のすべての出現箇所を置き換えます。デフォルトは `false`。

- **動作:**
  - 生の Jupyter ノートブック JSON は編集しません。`.ipynb` セルの編集には `notebook_edit` を使用してください。
  - `old_string` が空で `file_path` が存在しない場合、`new_string` を内容として新しいファイルを作成します。
  - `old_string` が提供された場合、`file_path` を読み取り、`replace_all` が true でない限り、1つの出現箇所を検出しようとします。
  - 一致が一意である（または `replace_all` が true である）場合、テキストを `new_string` で置き換えます。
  - **信頼性の向上（マルチステージ編集補正）:** 特にモデルが提供する `old_string` が完全に正確でない可能性がある場合に、編集の成功率を大幅に向上させるために、ツールはマルチステージ編集補正メカニズムを組み込んでいます。
    - 最初の `old_string` が見つからないか、複数の場所に一致する場合、ツールは Qwen モデルを活用して `old_string`（および場合によっては `new_string`）を反復的に調整します。
    - この自己補正プロセスは、モデルが変更しようとした一意のセグメントを特定しようと試み、最初のコンテキストがわずかに不完全であっても `edit` 操作をより堅牢にします。
- **失敗条件:** 補正メカニズムにもかかわらず、ツールは以下の場合に失敗します:
  - `file_path` が絶対パスでないか、ルートディレクトリの外側にある場合。
  - `old_string` が空ではないが、`file_path` が存在しない場合。
  - `old_string` が空であるが、`file_path` がすでに存在する場合。
  - 補正を試みた後も `old_string` がファイル内に見つからない場合。
  - `old_string` が複数回見つかり、`replace_all` が false で、自己補正メカニズムがそれを単一のあいまいでない一致に解決できない場合。
- **出力 （`llmContent`）:**
  - 成功時: `Successfully modified file: /path/to/file.txt (1 replacements).` または `Created new file: /path/to/new_file.txt with provided content.`
  - 失敗時: 理由を説明するエラーメッセージ。（例: `Failed to edit, 0 occurrences found...`, `Failed to edit because the text matches multiple locations...`）。
- **確認:** はい。提案された変更の diff を表示し、ファイルへの書き込み前にユーザーの承認を求めます。

## ファイルエンコーディングとプラットフォーム固有の動作

### エンコーディングの検出と保持

ファイルを読み取るとき、Qwen Code はマルチステップ戦略を使用してファイルのエンコーディングを検出します。

1. **UTF-8** — 最初に試行されます（最新のツールはほとんどが UTF-8 を出力します）
2. **chardet** — 非 UTF-8 コンテンツに対する統計的検出
3. **システムエンコーディング** — OS のコードページにフォールバックします（Windows `chcp` / Unix `LANG`）

`write_file` と `edit` はどちらも、既存ファイルの元のエンコーディングと BOM（バイトオーダーマーク）を保持します。ファイルが UTF-8 BOM 付きの GBK として読み取られた場合、同じ方法で書き戻されます。

### 新規ファイルのデフォルトエンコーディングの設定

`defaultFileEncoding` 設定は、**新しく作成される**ファイル（既存ファイルへの編集ではない）のエンコーディングを制御します。

| 値          | 動作                                                                           |
| ----------- | ------------------------------------------------------------------------------ |
| （未設定）    | BOM なしの UTF-8。プラットフォーム固有の自動調整あり（以下参照）              |
| `utf-8`     | BOM なしの UTF-8。自動調整なし                                               |
| `utf-8-bom` | すべての新規ファイルに UTF-8 BOM を付加                                        |

`.qwen/settings.json` または `~/.qwen/settings.json` で設定します:

```json
{
  "general": {
    "defaultFileEncoding": "utf-8-bom"
  }
}
```

### Windows: バッチファイルの CRLF

Windows では、`.bat` および `.cmd` ファイルは自動的に CRLF（`\r\n`）改行で書き込まれます。これは、`cmd.exe` が改行区切り文字として CRLF を使用するために必要です。LF のみの改行では、複数行の `if`/`else`、`goto` ラベル、`for` ループが壊れる可能性があります。これはエンコーディング設定に関係なく適用され、Windows でのみ発生します。

### Windows: PowerShell スクリプトの UTF-8 BOM

**非 UTF-8 システムコードページ**（例: GBK/cp936、Big5/cp950、Shift_JIS/cp932）の Windows では、新しく作成された `.ps1` ファイルは自動的に UTF-8 BOM 付きで書き込まれます。これは、Windows PowerShell 5.1（Windows 10/11 に組み込まれているバージョン）が BOM なしのスクリプトをシステムの ANSI コードページを使用して読み取るためです。BOM がないと、スクリプト内の非 ASCII 文字は誤って解釈されます。

この自動 BOM は、以下の場合にのみ適用されます。

- プラットフォームが Windows である
- システムコードページが UTF-8 ではない（コードページ 65001 ではない）
- ファイルが新しい `.ps1` ファイルである（既存のファイルは元のエンコーディングを保持）
- ユーザーが設定で `defaultFileEncoding` を明示的に設定していない

PowerShell 7+（pwsh）はデフォルトで UTF-8 になり、BOM を透過的に処理するため、BOM はそこで問題になりません。

設定で `defaultFileEncoding` を明示的に `"utf-8"` に設定した場合、自動 BOM は無効になります。これは、BOM を拒否するリポジトリまたはツールのための意図的なエスケープハッチです。

### まとめ

| ファイルタイプ | プラットフォーム                     | 自動動作                       |
| -------------- | ------------------------------------ | ------------------------------ |
| `.bat`, `.cmd` | Windows                              | CRLF 改行                     |
| `.ps1`         | Windows（非 UTF-8 コードページ）      | 新規ファイルに UTF-8 BOM      |
| その他すべて   | すべて                               | BOM なしの UTF-8（デフォルト） |

これらのファイルシステムツールは、Qwen Code がローカルプロジェクトのコンテキストを理解し、対話するための基盤を提供します。