# ファイルの除外

このドキュメントでは、Qwen Code の Qwen Ignore（`.qwenignore`）機能の概要について説明します。

Qwen Code には、Git で使用される `.gitignore` と同様に、ファイルを自動的に除外する機能が備わっています。`.qwenignore` ファイルにパスを追加すると、この機能をサポートするツールから該当のファイルやディレクトリが除外されます（Git などの他のサービスからは引き続き参照可能です）。

## 動作の仕組み

`.qwenignore` ファイルにパスを追加すると、このファイルを参照するツールは、一致するファイルやディレクトリを操作対象から除外します。例えば、[`read_many_files`](../../developers/tools/multi-file) コマンドを使用した場合、`.qwenignore` ファイルに記載されたパスは自動的に除外されます。

基本的に、`.qwenignore` は `.gitignore` ファイルの規則に従います：

- 空行および `#` で始まる行は無視されます。
- 標準的な glob パターン（`*`、`?`、`[]` など）がサポートされています。
- 末尾に `/` を付けると、ディレクトリのみが一致します。
- 先頭に `/` を付けると、`.qwenignore` ファイルが存在するディレクトリからの相対パスとして扱われます。
- `!` を使用すると、パターンの除外を解除できます。

`.qwenignore` ファイルはいつでも更新できます。変更を反映するには、Qwen Code のセッションを再起動する必要があります。

## `.qwenignore` の使用方法

| ステップ                   | 説明                                                                            |
| ---------------------- | -------------------------------------------------------------------------------------- |
| **.qwenignore を有効にする** | プロジェクトのルートディレクトリに `.qwenignore` という名前のファイルを作成する                       |
| **除外ルールを追加する**   | `.qwenignore` ファイルを開き、除外するパスを追加する（例：`/archive/` または `apikeys.txt`） |

### `.qwenignore` の使用例

`.qwenignore` を使用して、ディレクトリやファイルを除外できます：

```
# Exclude your /packages/ directory and all subdirectories
/packages/

# Exclude your apikeys.txt file
apikeys.txt
```

`.qwenignore` ファイルでは、`*` を使用してワイルドカードを指定できます：

```
# Exclude all .md files
*.md
```

最後に、`!` を使用して、除外ルールから特定のファイルやディレクトリを除外解除できます：

```
# Exclude all .md files except README.md
*.md
!README.md
```

`.qwenignore` ファイルからパスを削除するには、該当する行を削除してください。