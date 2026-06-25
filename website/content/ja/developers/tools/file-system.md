# Qwen Code ファイルシステムツール

Qwen Code は、ローカルファイルシステムを操作するための包括的なツール群を提供しています。これらのツールを使用すると、モデルがファイルやディレクトリの読み取り、書き込み、一覧表示、検索、変更を行えます。すべてあなたの管理下で動作し、センシティブな操作には通常確認が求められます。

**注意:** すべてのファイルシステムツールは、セキュリティのため `rootDirectory`（通常は CLI を起動したカレントワーキングディレクトリ）内で動作します。ツールに渡すパスは、絶対パスであるか、このルートディレクトリからの相対パスとして解決されることが一般的に想定されています。

## 1. `list_directory` (ListFiles)

`list_directory` は、指定したディレクトリパス直下にあるファイルやサブディレクトリの名前を一覧表示します。指定した glob パターンに一致するエントリを除外することもできます。

- **ツール名:** `list_directory`
- **表示名:** ListFiles
- **ファイル:** `ls.ts`
- **パラメータ:**
  - `path` (string, 必須): 一覧表示するディレクトリの絶対パス。
  - `ignore` (array of strings, 任意): 一覧から除外する glob パターンのリスト（例: `["*.log", ".git"]`）。
  - `respect_git_ignore` (boolean, 任意): ファイル一覧表示時に `.gitignore` パターンを考慮するかどうか。デフォルトは `true`。
- **動作:**
  - ファイルとディレクトリ名の一覧を返します。
  - 各エントリがディレクトリかどうかを示します。
  - ディレクトリを先頭に、その後アルファベット順にソートします。
- **出力 (`llmContent`):** `Directory listing for /path/to/your/folder:\n[DIR] subfolder1\nfile1.txt\nfile2.png` のような文字列。
- **確認:** なし。

## 2. `read_file` (ReadFile)

`read_file` は、指定したファイルの内容を読み取って返します。テキストファイルと、現在のモデルがサポートするモダリティのメディアファイル（画像、PDF、音声、動画）を処理できます。テキストファイルについては、特定の行範囲を読み取ることができます。現在のモデルがサポートしないモダリティのメディアファイルは、わかりやすいエラーメッセージとともに拒否されます。その他のバイナリファイル形式は基本的にスキップされます。

- **ツール名:** `read_file`
- **表示名:** ReadFile
- **ファイル:** `read-file.ts`
- **パラメータ:**
  - `path` (string, 必須): 読み取るファイルの絶対パス。
  - `offset` (number, 任意): テキストファイルの場合、読み取り開始位置の 0 始まりの行番号。`limit` の設定が必要です。
  - `limit` (number, 任意): テキストファイルの場合、読み取る最大行数。省略した場合、デフォルトの最大行数（例: 2000 行）またはファイル全体が読み取られます。
- **動作:**
  - テキストファイル: 内容を返します。`offset` と `limit` を使用した場合、その範囲の行のみを返します。行数制限や行長制限によって内容が切り捨てられた場合はその旨を示します。
  - メディアファイル（画像、PDF、音声、動画）: 現在のモデルがそのモダリティをサポートしている場合、ファイル内容を base64 エンコードされた `inlineData` オブジェクトとして返します。モデルがそのモダリティをサポートしない場合、ガイダンス付きのエラーメッセージを返します（例: スキルや外部ツールの使用を提案）。
  - その他のバイナリファイル: 識別してスキップを試み、汎用バイナリファイルである旨のメッセージを返します。
- **出力:** (`llmContent`):
  - テキストファイル: ファイル内容。切り捨て時はそのメッセージが付きます（例: `[File content truncated: showing lines 1-100 of 500 total lines...]\nActual file content...`）。
  - サポート対象のメディアファイル: `mimeType` と base64 `data` を含む `inlineData` オブジェクト（例: `{ inlineData: { mimeType: 'image/png', data: 'base64encodedstring' } }`）。
  - サポート対象外のメディアファイル: 現在のモデルがそのモダリティをサポートしないことを説明し、代替手段を提案するエラーメッセージ文字列。
  - その他のバイナリファイル: `Cannot display content of binary file: /path/to/data.bin` のようなメッセージ。
- **確認:** なし。

### Jupyter Notebook の読み取り

Jupyter Notebook（`.ipynb`）の場合、`read_file` はノートブックの JSON をパースし、生の JSON の代わりに、モデルが読みやすい構造化されたノートブックビューを返します。レンダリングされた出力には、ノートブックの言語、順序付きセル、セル ID、ソース、要約された出力が含まれます。

その後、ノートブックのセルは `notebook_edit` で編集できます。モデルはセルを指定する際、`read_file` が表示したセル ID を使用する必要があります。

`offset` と `limit` は `.ipynb` ファイルには対応していません。ノートブックの読み取りは構造化されたファイル全体の読み取りとして扱われます。レンダリングされたノートブック出力がサイズ超過で内部的に切り捨てられた場合、`notebook_edit` はセルレベルの編集を拒否し、編集前に出力を削減するかノートブックを分割するよう求めます。

## 3. `notebook_edit` (NotebookEdit)

`notebook_edit` は、Jupyter Notebook（`.ipynb`）ファイルをセルレベルで安全に編集します。ノートブックのセルを変更する際は、`edit` や `write_file` の代わりにこのツールを使用してください。

- **ツール名:** `notebook_edit`
- **表示名:** NotebookEdit
- **ファイル:** `notebook-edit.ts`
- **パラメータ:**
  - `notebook_path` (string, 必須): `.ipynb` ファイルの絶対パス。
  - `cell_id` (string, 任意): `read_file` が表示した対象セルの ID。`replace` と `delete` には必須です。`insert` の場合、新しいセルはこのセルの後に挿入されます。省略した場合、先頭に挿入されます。
  - `new_source` (string, 任意): `replace` および `insert` の新しいセルソース。`delete` では不要です。
  - `cell_type` (`code` または `markdown`, 任意): 挿入するセルのセル種別、またはセルを置換する際の対象の種別。
  - `edit_mode` (`replace`、`insert`、または `delete`, 任意): 編集操作。デフォルトは `replace`。
- **動作:**
  - 現在のセッションで `read_file` によってノートブックを事前に読み取っておく必要があります。
  - `read_file` がレンダリングした ID（実際のノートブックセル ID と表示上のフォールバック ID `cell-N` の両方）を使用してセルを特定します。
  - 曖昧なレンダリングセル ID は推測せずに拒否します。
  - コードセルの場合、ソースが変更されると古い出力をクリアし、`execution_count` をリセットします。
  - 可能な限りノートブック JSON のフォーマット、改行コード、エンコーディング、BOM を保持します。
  - フォールバック ID がシフトする可能性がある構造的な編集後は、読み取り済み状態を無効化します。次のノートブック編集には新たな `read_file` が必要です。
- **出力 (`llmContent`):** 編集されたノートブックセルを説明する成功メッセージ。削除以外の操作では更新後のソースも含みます。
- **確認:** あり。ノートブック JSON の差分を表示し、書き込み前にユーザーの承認を求めます（現在の権限モードやルールで編集ツールが自動承認される場合を除く）。

### `notebook_edit` の使用例

コードセルを置換する:

```
notebook_edit(
  notebook_path="/path/to/analysis.ipynb",
  cell_id="load-data",
  new_source="result = 41 + 1\nprint(result)"
)
```

既存のセルの後に Markdown セルを挿入する:

```
notebook_edit(
  notebook_path="/path/to/analysis.ipynb",
  edit_mode="insert",
  cell_id="summary",
  cell_type="markdown",
  new_source="## Findings\n\nThe cleaned data is ready for modeling."
)
```

セルを削除する:

```
notebook_edit(
  notebook_path="/path/to/analysis.ipynb",
  edit_mode="delete",
  cell_id="old-experiment"
)
```

## 4. `write_file` (WriteFile)

`write_file` は、指定したファイルに内容を書き込みます。ファイルが存在する場合は上書きされます。ファイルが存在しない場合は、ファイル（および必要な親ディレクトリ）が作成されます。

- **ツール名:** `write_file`
- **表示名:** WriteFile
- **ファイル:** `write-file.ts`
- **パラメータ:**
  - `file_path` (string, 必須): 書き込むファイルの絶対パス。
  - `content` (string, 必須): ファイルに書き込む内容。
- **動作:**
  - 指定した `content` を `file_path` に書き込みます。
  - Jupyter Notebook の生の JSON は書き込みません。`.ipynb` のセル編集には `notebook_edit` を使用してください。
  - 親ディレクトリが存在しない場合は作成します。
- **出力 (`llmContent`):** 成功メッセージ（例: `Successfully overwrote file: /path/to/your/file.txt` または `Successfully created and wrote to new file: /path/to/new/file.txt`）。
- **確認:** あり。変更の差分を表示し、書き込み前にユーザーの承認を求めます。

## 5. `glob` (Glob)

`glob` は、特定の glob パターン（例: `src/**/*.ts`、`*.md`）に一致するファイルを検索し、更新日時の新しい順にソートした絶対パスの一覧を返します。

- **ツール名:** `glob`
- **表示名:** Glob
- **ファイル:** `glob.ts`
- **パラメータ:**
  - `pattern` (string, 必須): マッチングに使用する glob パターン（例: `"*.py"`、`"src/**/*.js"`）。
  - `path` (string, 任意): 検索するディレクトリ。指定しない場合はカレントワーキングディレクトリが使用されます。
- **動作:**
  - 指定したディレクトリ内で glob パターンに一致するファイルを検索します。
  - 最近変更されたファイルを先頭にソートした絶対パスの一覧を返します。
  - デフォルトで .gitignore、.qwenignore、および設定されたカスタム Qwen の無視ファイルを考慮します。
  - コンテキストのオーバーフローを防ぐため、結果を 100 ファイルに制限します。
- **出力 (`llmContent`):** `Found 5 file(s) matching "*.ts" within /path/to/search/dir, sorted by modification time (newest first):\n---\n/path/to/file1.ts\n/path/to/subdir/file2.ts\n---\n[95 files truncated] ...` のようなメッセージ。
- **確認:** なし。

## 6. `grep_search` (Grep)

`grep_search` は、指定したディレクトリ内のファイルの内容に対して正規表現パターンを検索します。glob パターンでファイルをフィルタリングできます。一致する行と、そのファイルパスおよび行番号を返します。

- **ツール名:** `grep_search`
- **表示名:** Grep
- **ファイル:** `grep.ts`（フォールバックとして `ripGrep.ts`）
- **パラメータ:**
  - `pattern` (string, 必須): ファイル内容を検索する正規表現パターン（例: `"function\\s+myFunction"`、`"log.*Error"`）。
  - `path` (string, 任意): 検索するファイルまたはディレクトリ。デフォルトはカレントワーキングディレクトリ。
  - `glob` (string, 任意): ファイルをフィルタリングする glob パターン（例: `"*.js"`、`"src/**/*.{ts,tsx}"`）。
  - `limit` (integer, 任意): 出力を最初の N 件の一致行に制限します。正の整数である必要があります。省略した場合はすべての一致を表示します。
- **動作:**
  - 利用可能な場合は高速検索のために ripgrep を使用し、利用できない場合は JavaScript ベースの検索実装にフォールバックします。
  - ファイルパスと行番号付きの一致行を返します。
  - デフォルトで大文字小文字を区別しません。
  - .gitignore、.qwenignore、および設定されたカスタム Qwen の無視ファイルを考慮します。
  - コンテキストのオーバーフローを防ぐため、出力を制限します。
- **出力 (`llmContent`):** 一致結果のフォーマットされた文字列（例）:

  ```
  Found 3 matches for pattern "myFunction" in path "." (filter: "*.ts"):
  ---
  src/utils.ts:15:export function myFunction() {
  src/utils.ts:22:  myFunction.call();
  src/index.ts:5:import { myFunction } from './utils';
  ---

  [0 lines truncated] ...
  ```

- **確認:** なし。

### `grep_search` の使用例

デフォルトの結果制限でパターンを検索する:

```
grep_search(pattern="function\\s+myFunction", path="src")
```

カスタムの結果制限でパターンを検索する:

```
grep_search(pattern="function", path="src", limit=50)
```

ファイルフィルタリングとカスタムの結果制限でパターンを検索する:

```
grep_search(pattern="function", glob="*.js", limit=10)
```

## 7. `edit` (Edit)

`edit` は、ファイル内のテキストを置換します。デフォルトでは `old_string` が単一の一意な箇所に一致することが必要です。すべての出現箇所を変更したい場合は `replace_all` を `true` に設定してください。このツールは精密でピンポイントな変更を目的として設計されており、正しい箇所を変更するために `old_string` の周囲に十分なコンテキストが必要です。

- **ツール名:** `edit`
- **表示名:** Edit
- **ファイル:** `edit.ts`
- **パラメータ:**
  - `file_path` (string, 必須): 変更するファイルの絶対パス。
  - `old_string` (string, 必須): 置換する正確なリテラルテキスト。

    **重要:** この文字列は変更する単一のインスタンスを一意に識別する必要があります。対象テキストの周囲に十分なコンテキストを含め、空白やインデントを正確に一致させてください。`old_string` が空の場合、ツールは `file_path` に `new_string` を内容とする新しいファイルの作成を試みます。

  - `new_string` (string, 必須): `old_string` と置換する正確なリテラルテキスト。
  - `replace_all` (boolean, 任意): `old_string` のすべての出現箇所を置換します。デフォルトは `false`。

- **動作:**
  - Jupyter Notebook の生の JSON は編集しません。`.ipynb` のセル編集には `notebook_edit` を使用してください。
  - `old_string` が空で `file_path` が存在しない場合、`new_string` を内容とする新しいファイルを作成します。
  - `old_string` が指定された場合、`file_path` を読み取り、`replace_all` が true でない限り一致箇所が正確に 1 つであることを確認します。
  - 一致箇所が一意（または `replace_all` が true）の場合、テキストを `new_string` で置換します。
  - **信頼性の向上（マルチステージ編集修正）:** 特にモデルが提供した `old_string` が完全に正確でない場合でも編集の成功率を大幅に高めるため、ツールはマルチステージ編集修正メカニズムを採用しています。
    - 最初の `old_string` が見つからない、または複数箇所に一致する場合、ツールは Qwen モデルを活用して `old_string`（および場合によっては `new_string`）を反復的に洗練させることができます。
    - この自己修正プロセスにより、モデルが変更しようとした一意のセグメントを特定し、初期コンテキストが若干不正確な場合でも `edit` 操作をより堅牢にします。
- **失敗条件:** 修正メカニズムにもかかわらず、以下の場合にツールは失敗します:
  - `file_path` が絶対パスでない、またはルートディレクトリ外にある。
  - `old_string` が空でないが、`file_path` が存在しない。
  - `old_string` が空だが、`file_path` がすでに存在する。
  - 修正を試みた後もファイル内に `old_string` が見つからない。
  - `old_string` が複数箇所に一致し、`replace_all` が false で、自己修正メカニズムが単一の明確な一致に解決できない。
- **出力 (`llmContent`):**
  - 成功時: `Successfully modified file: /path/to/file.txt (1 replacements).` または `Created new file: /path/to/new_file.txt with provided content.`
  - 失敗時: 理由を説明するエラーメッセージ（例: `Failed to edit, 0 occurrences found...`、`Failed to edit because the text matches multiple locations...`）。
- **確認:** あり。提案された変更の差分を表示し、ファイルへの書き込み前にユーザーの承認を求めます。

## ファイルエンコーディングとプラットフォーム固有の動作

### エンコーディングの検出と保持

Qwen Code はファイル読み取り時に、マルチステップの戦略でファイルのエンコーディングを検出します:

1. **UTF-8** — 最初に試行（ほとんどの現代的なツールは UTF-8 を出力）
2. **chardet** — UTF-8 以外のコンテンツに対する統計的な検出
3. **システムエンコーディング** — OS のコードページにフォールバック（Windows `chcp` / Unix `LANG`）

`write_file` と `edit` は、既存ファイルの元のエンコーディングと BOM（バイトオーダーマーク）を保持します。GBK として読み取られた UTF-8 BOM 付きファイルは、同じ形式で書き戻されます。

### 新しいファイルのデフォルトエンコーディングの設定

`defaultFileEncoding` 設定は、**新しく作成される**ファイルのエンコーディングを制御します（既存ファイルの編集には影響しません）:

| 値          | 動作                                                                        |
| ----------- | --------------------------------------------------------------------------- |
| _(未設定)_  | BOM なし UTF-8、自動的なプラットフォーム固有の調整あり（下記参照）          |
| `utf-8`     | BOM なし UTF-8、自動調整なし                                                |
| `utf-8-bom` | すべての新しいファイルに BOM 付き UTF-8                                     |

`.qwen/settings.json` または `~/.qwen/settings.json` で設定します:

```json
{
  "general": {
    "defaultFileEncoding": "utf-8-bom"
  }
}
```

### Windows: バッチファイルの CRLF

Windows では、`.bat` および `.cmd` ファイルは自動的に CRLF（`\r\n`）の改行コードで書き込まれます。これは `cmd.exe` が行区切りとして CRLF を使用するために必要であり、LF のみの改行コードは複数行の `if`/`else`、`goto` ラベル、`for` ループを破壊する可能性があります。これはエンコーディング設定に関わらず、Windows 上でのみ適用されます。

### Windows: PowerShell スクリプトの UTF-8 BOM

**UTF-8 以外のシステムコードページ**（例: GBK/cp936、Big5/cp950、Shift_JIS/cp932）の Windows では、新しく作成される `.ps1` ファイルには自動的に UTF-8 BOM が付与されます。これは、Windows PowerShell 5.1（Windows 10/11 に組み込まれているバージョン）が BOM のないスクリプトをシステムの ANSI コードページで読み取るために必要です。BOM がないと、スクリプト内の非 ASCII 文字が誤って解釈されます。

この自動 BOM は以下の条件をすべて満たす場合にのみ適用されます:

- プラットフォームが Windows である
- システムコードページが UTF-8 でない（コードページ 65001 以外）
- ファイルが新しい `.ps1` ファイルである（既存ファイルは元のエンコーディングを保持）
- ユーザーが設定で `defaultFileEncoding` を明示的に設定**していない**

PowerShell 7+（pwsh）はデフォルトで UTF-8 を使用し BOM を透過的に処理するため、BOM は無害です。

`defaultFileEncoding` を `"utf-8"` に明示的に設定すると、自動 BOM が無効になります。これは BOM を拒否するリポジトリやツールのための意図的な回避手段です。

### まとめ

| ファイル種別    | プラットフォーム               | 自動動作                        |
| -------------- | ----------------------------- | ------------------------------- |
| `.bat`, `.cmd` | Windows                       | CRLF 改行コード                 |
| `.ps1`         | Windows (UTF-8 以外のコードページ) | 新しいファイルに UTF-8 BOM      |
| その他すべて   | すべて                        | BOM なし UTF-8（デフォルト）    |

これらのファイルシステムツールは、Qwen Code がローカルプロジェクトのコンテキストを理解し操作するための基盤を提供します。
