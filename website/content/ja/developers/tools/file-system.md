# Qwen Code ファイルシステムツール

Qwen Code は、ローカルファイルシステムを操作するための包括的なツールスイートを提供します。これらのツールにより、モデルはファイルやディレクトリの読み取り、書き込み、一覧表示、検索、変更を行えます。すべての操作はあなたの管理下にあり、機密性の高い操作には通常確認プロセスが設けられています。

**注:** セキュリティ上の理由から、すべてのファイルシステムツールは `rootDirectory`（通常は CLI を起動したカレントワーキングディレクトリ）内で動作します。これらのツールに指定するパスは、絶対パスであるか、このルートディレクトリからの相対パスとして解決されることが想定されています。

## 1. `list_directory` (ListFiles)

`list_directory` は、指定されたディレクトリパス直下にあるファイルとサブディレクトリの名前を一覧表示します。オプションで、指定された glob パターンに一致するエントリを除外できます。

- **ツール名:** `list_directory`
- **表示名:** ListFiles
- **ファイル:** `ls.ts`
- **パラメータ:**
  - `path` (string, 必須): 一覧表示するディレクトリの絶対パス。
  - `ignore` (array of strings, オプション): 一覧から除外する glob パターンのリスト（例: `["*.log", ".git"]`）。
  - `respect_git_ignore` (boolean, オプション): ファイル一覧表示時に `.gitignore` パターンを適用するかどうか。デフォルトは `true`。
- **動作:**
  - ファイル名とディレクトリ名のリストを返します。
  - 各エントリがディレクトリかどうかを示します。
  - エントリはディレクトリが先頭になり、その後はアルファベット順にソートされます。
- **出力 (`llmContent`):** 以下のような文字列: `Directory listing for /path/to/your/folder:\n[DIR] subfolder1\nfile1.txt\nfile2.png`
- **確認:** なし。

## 2. `read_file` (ReadFile)

`read_file` は指定されたファイルの内容を読み取り、返します。このツールは、テキストファイルと、現在のモデルがサポートするモダリティを持つメディアファイル（画像、PDF、音声、動画）を処理します。テキストファイルの場合、特定の行範囲を読み取ることができます。現在のモデルがサポートしないモダリティのメディアファイルは、有用なエラーメッセージと共に拒否されます。その他のバイナリファイルタイプは通常スキップされます。

- **ツール名:** `read_file`
- **表示名:** ReadFile
- **ファイル:** `read-file.ts`
- **パラメータ:**
  - `path` (string, 必須): 読み取るファイルの絶対パス。
  - `offset` (number, オプション): テキストファイルの場合、読み込みを開始する 0 起点の行番号。`limit` の設定が必要です。
  - `limit` (number, オプション): テキストファイルの場合、読み取る最大行数。省略した場合、デフォルトの最大値（例: 2000 行）または可能であればファイル全体を読み取ります。
- **動作:**
  - テキストファイル: 内容を返します。`offset` と `limit` が使用されている場合、指定された行範囲のみを返します。行数制限や行長制限により内容が切り捨てられた場合はその旨を示します。
  - メディアファイル（画像、PDF、音声、動画）: 現在のモデルがファイルのモダリティをサポートしている場合、ファイル内容を base64 エンコードされた `inlineData` オブジェクトとして返します。モデルがサポートしていない場合、ガイダンス付きのエラーメッセージを返します（例: スキルや外部ツールの提案）。
  - その他のバイナリファイル: 識別を試みてスキップし、汎用バイナリファイルであることを示すメッセージを返します。
- **出力:** (`llmContent`):
  - テキストファイル: ファイル内容。切り捨てメッセージが前置される場合があります（例: `[File content truncated: showing lines 1-100 of 500 total lines...]\nActual file content...`）。
  - サポートされているメディアファイル: `mimeType` と base64 `data` を含む `inlineData` オブジェクト（例: `{ inlineData: { mimeType: 'image/png', data: 'base64encodedstring' } }`）。
  - サポートされていないメディアファイル: 現在のモデルがこのモダリティをサポートしていないことを説明し、代替案を提案するエラーメッセージ文字列。
  - その他のバイナリファイル: `Cannot display content of binary file: /path/to/data.bin` のようなメッセージ。
- **確認:** なし。

## 3. `write_file` (WriteFile)

`write_file` は指定されたファイルに内容を書き込みます。ファイルが既に存在する場合は上書きされます。ファイルが存在しない場合は、ファイル（および必要な親ディレクトリ）が作成されます。

- **ツール名:** `write_file`
- **表示名:** WriteFile
- **ファイル:** `write-file.ts`
- **パラメータ:**
  - `file_path` (string, 必須): 書き込み先ファイルの絶対パス。
  - `content` (string, 必須): ファイルに書き込む内容。
- **動作:**
  - 指定された `content` を `file_path` に書き込みます。
  - 親ディレクトリが存在しない場合は作成します。
- **出力 (`llmContent`):** 成功メッセージ（例: `Successfully overwrote file: /path/to/your/file.txt` または `Successfully created and wrote to new file: /path/to/new/file.txt`）。
- **確認:** あり。書き込み前に変更の diff を表示し、ユーザーの承認を求めます。

## 4. `glob` (Glob)

`glob` は特定の glob パターン（例: `src/**/*.ts`, `*.md`）に一致するファイルを検索し、更新時刻でソートされた絶対パスを返します（最新順）。

- **ツール名:** `glob`
- **表示名:** Glob
- **ファイル:** `glob.ts`
- **パラメータ:**
  - `pattern` (string, 必須): マッチさせる glob パターン（例: `"*.py"`, `"src/**/*.js"`）。
  - `path` (string, オプション): 検索対象のディレクトリ。指定しない場合、カレントワーキングディレクトリが使用されます。
- **動作:**
  - 指定されたディレクトリ内で glob パターンに一致するファイルを検索します。
  - 絶対パスのリストを、更新日が新しい順にソートして返します。
  - デフォルトで `.gitignore` および `.qwenignore` パターンを適用します。
  - コンテキストオーバーフローを防ぐため、結果を 100 ファイルに制限します。
- **出力 (`llmContent`):** 以下のようなメッセージ: `Found 5 file(s) matching "*.ts" within /path/to/search/dir, sorted by modification time (newest first):\n---\n/path/to/file1.ts\n/path/to/subdir/file2.ts\n---\n[95 files truncated] ...`
- **確認:** なし。

## 5. `grep_search` (Grep)

`grep_search` は指定されたディレクトリ内のファイル内容から正規表現パターンを検索します。glob パターンでファイルをフィルタリングできます。マッチした行を、ファイルパスと行番号と共に返します。

- **ツール名:** `grep_search`
- **表示名:** Grep
- **ファイル:** `grep.ts`（フォールバックとして `ripGrep.ts` を使用）
- **パラメータ:**
  - `pattern` (string, 必須): ファイル内容内で検索する正規表現パターン（例: `"function\\s+myFunction"`, `"log.*Error"`）。
  - `path` (string, オプション): 検索対象のファイルまたはディレクトリ。デフォルトはカレントワーキングディレクトリ。
  - `glob` (string, オプション): ファイルをフィルタリングする glob パターン（例: `"*.js"`, `"src/**/*.{ts,tsx}"`）。
  - `limit` (number, オプション): 出力を最初の N 件のマッチ行に制限します。省略した場合はすべてのマッチを表示します。
- **動作:**
  - 利用可能な場合は ripgrep を使用して高速に検索します。利用できない場合は JavaScript ベースの検索実装にフォールバックします。
  - マッチした行をファイルパスと行番号と共に返します。
  - デフォルトで大文字・小文字を区別しません。
  - `.gitignore` および `.qwenignore` パターンを適用します。
  - コンテキストオーバーフローを防ぐため出力を制限します。
- **出力 (`llmContent`):** マッチ結果のフォーマット済み文字列（例）:

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

## 6. `edit` (Edit)

`edit` はファイル内のテキストを置換します。デフォルトでは `old_string` が一意の場所に一致する必要があります。すべての出現箇所を意図的に変更したい場合は `replace_all` を `true` に設定してください。このツールは正確でターゲットを絞った変更を目的として設計されており、正しい場所を変更できるように `old_string` の周囲に十分なコンテキストを含める必要があります。

- **ツール名:** `edit`
- **表示名:** Edit
- **ファイル:** `edit.ts`
- **パラメータ:**
  - `file_path` (string, 必須): 変更対象ファイルの絶対パス。
  - `old_string` (string, 必須): 置換対象の正確なリテラルテキスト。

    **重要:** この文字列は変更対象の単一インスタンスを一意に識別する必要があります。対象テキストの周囲に十分なコンテキストを含め、空白やインデントを正確に一致させてください。`old_string` が空の場合、ツールは `file_path` に `new_string` を内容とする新しいファイルの作成を試みます。

  - `new_string` (string, 必須): `old_string` を置換する正確なリテラルテキスト。
  - `replace_all` (boolean, オプション): `old_string` のすべての出現箇所を置換します。デフォルトは `false`。

- **動作:**
  - `old_string` が空で `file_path` が存在しない場合、`new_string` を内容とする新しいファイルを作成します。
  - `old_string` が指定されている場合、`file_path` を読み取り、`replace_all` が true でない限り正確に 1 件の一致を探します。
  - 一致が一意である場合（または `replace_all` が true の場合）、テキストを `new_string` に置換します。
  - **信頼性の向上（多段階編集修正）:** 編集の成功率を大幅に向上させるため、特にモデルが提供する `old_string` が完全に正確でない場合に備え、このツールには多段階の編集修正メカニズムが組み込まれています。
    - 初期の `old_string` が見つからない場合や複数の場所に一致する場合、ツールは Qwen モデルを活用して `old_string`（および必要に応じて `new_string`）を反復的に改善できます。
    - この自己修正プロセスは、モデルが変更を意図した一意のセグメントを特定しようとし、初期コンテキストがわずかに不完全であっても `edit` 操作をより堅牢にします。
- **失敗条件:** 修正メカニズムにもかかわらず、以下の条件でツールは失敗します:
  - `file_path` が絶対パスでないか、ルートディレクトリの外にある場合。
  - `old_string` が空でないが、`file_path` が存在しない場合。
  - `old_string` が空だが、`file_path` が既に存在する場合。
  - 修正を試みた後もファイル内で `old_string` が見つからない場合。
  - `old_string` が複数回見つかり、`replace_all` が false であり、自己修正メカニズムでも単一の明確な一致に解決できない場合。
- **出力 (`llmContent`):**
  - 成功時: `Successfully modified file: /path/to/file.txt (1 replacements).` または `Created new file: /path/to/new_file.txt with provided content.`
  - 失敗時: 理由を説明するエラーメッセージ（例: `Failed to edit, 0 occurrences found...`, `Failed to edit because the text matches multiple locations...`）。
- **確認:** あり。ファイルへの書き込み前に提案された変更の diff を表示し、ユーザーの承認を求めます。

## ファイルエンコーディングとプラットフォーム固有の動作

### エンコーディングの検出と保持

ファイルの読み取り時、Qwen Code は以下の多段階戦略を使用してファイルのエンコーディングを検出します:

1. **UTF-8** — 最初に試行されます（最新のツールチェーンのほとんどは UTF-8 を出力します）
2. **chardet** — UTF-8 以外のコンテンツに対する統計的検出
3. **システムエンコーディング** — OS のコードページにフォールバックします（Windows `chcp` / Unix `LANG`）

`write_file` と `edit` の両方とも、既存ファイルの元のエンコーディングと BOM（バイトオーダーマーク）を保持します。UTF-8 BOM 付きの GBK として読み取られたファイルは、同じ形式で書き戻されます。

### 新規ファイルのデフォルトエンコーディングの設定

`defaultFileEncoding` 設定は、**新規作成**されるファイルのエンコーディングを制御します（既存ファイルの編集には適用されません）:

| 値       | 動作                                                                    |
| ----------- | --------------------------------------------------------------------------- |
| _(未設定)_ | BOM なし UTF-8。プラットフォーム固有の自動調整が適用されます（下記参照） |
| `utf-8`     | BOM なし UTF-8。自動調整は行われません                                 |
| `utf-8-bom` | すべての新規ファイルに BOM 付き UTF-8 を使用                                            |

`.qwen/settings.json` または `~/.qwen/settings.json` で設定します:

```json
{
  "general": {
    "defaultFileEncoding": "utf-8-bom"
  }
}
```

### Windows: バッチファイルの CRLF

Windows では、`.bat` および `.cmd` ファイルは自動的に CRLF（`\r\n`）の改行コードで書き込まれます。これは `cmd.exe` が行区切りとして CRLF を使用するため必須です。LF のみの改行コードは、複数行の `if`/`else`、`goto` ラベル、`for` ループを壊す可能性があります。これはエンコーディング設定に関係なく、Windows 環境でのみ適用されます。

### Windows: PowerShell スクリプトの UTF-8 BOM

**UTF-8 以外のシステムコードページ**（例: GBK/cp936、Big5/cp950、Shift_JIS/cp932）を使用する Windows では、新規作成された `.ps1` ファイルは自動的に UTF-8 BOM 付きで書き込まれます。これは、Windows PowerShell 5.1（Windows 10/11 に組み込まれているバージョン）が BOM なしスクリプトをシステムの ANSI コードページで読み取るため必要です。BOM がない場合、スクリプト内の非 ASCII 文字が誤って解釈されます。

この自動 BOM 付与は以下の条件でのみ適用されます:

- プラットフォームが Windows である
- システムコードページが UTF-8 ではない（コードページ 65001 ではない）
- ファイルが新規の `.ps1` ファイルである（既存ファイルは元のエンコーディングを保持）
- ユーザーが設定で `defaultFileEncoding` を**明示的に設定していない**

PowerShell 7+ (pwsh) はデフォルトで UTF-8 を使用し BOM を透過的に処理するため、BOM があっても問題ありません。

`defaultFileEncoding` を `"utf-8"` に明示的に設定すると、自動 BOM 付与は無効になります。これは BOM を拒否するリポジトリやツールチェーンのための意図的なエスケープハッチです。

### まとめ

| ファイルタイプ      | プラットフォーム                      | 自動動作          |
| -------------- | ----------------------------- | --------------------------- |
| `.bat`, `.cmd` | Windows                       | CRLF 改行コード           |
| `.ps1`         | Windows（UTF-8 以外のコードページ） | 新規ファイルに UTF-8 BOM      |
| その他すべて     | すべて                           | BOM なし UTF-8（デフォルト） |

これらのファイルシステムツールは、Qwen Code がローカルプロジェクトのコンテキストを理解し、対話するための基盤を提供します。