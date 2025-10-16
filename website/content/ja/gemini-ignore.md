# ファイルの無視

このドキュメントでは、Qwen Code の Gemini Ignore（`.geminiignore`）機能の概要を説明します。

Qwen Code には、ファイルを自動的に無視する機能が含まれており、これは Git で使われる `.gitignore` や Gemini Code Assist で使われる `.aiexclude` と同様です。`.geminiignore` ファイルにパスを追加することで、この機能をサポートするツールからそれらのファイルを除外できますが、他のサービス（Git など）からは引き続き参照可能です。

## 仕組み

`.geminiignore` ファイルにパスを追加すると、このファイルを尊重するツールは、一致するファイルやディレクトリを操作から除外します。例えば、[`read_many_files`](./tools/multi-file.md) コマンドを使用する際、`.geminiignore` ファイル内のすべてのパスは自動的に除外されます。

基本的に、`.geminiignore` は `.gitignore` ファイルの規則に従います：

- 空行や `#` で始まる行は無視されます。
- 標準的な glob パターンがサポートされています（例：`*`、`?`、`[]`）。
- 末尾に `/` を置くと、ディレクトリのみに一致します。
- 先頭に `/` を置くと、`.geminiignore` ファイルからの相対パスとしてパスが固定されます。
- `!` はパターンを否定します。

`.geminiignore` ファイルはいつでも更新できます。変更を適用するには、Qwen Code セッションを再起動する必要があります。

## `.geminiignore` の使い方

`.geminiignore` を有効にするには：

1. プロジェクトディレクトリのルートに `.geminiignore` という名前のファイルを作成します。

ファイルやディレクトリを `.geminiignore` に追加するには：

1. `.geminiignore` ファイルを開きます。
2. 無視したいパスやファイルを追加します。例：`/archive/` や `apikeys.txt`。

### `.geminiignore` の例

`.geminiignore` を使ってディレクトリやファイルを無視できます：

```

# /packages/ ディレクトリとそのサブディレクトリを除外
/packages/

# apikeys.txt ファイルを除外
apikeys.txt
```

`.geminiignore` ファイルでは `*` を使ってワイルドカードが使えます：

```

# すべての .md ファイルを除外
*.md
```

最後に、`!` を使って除外対象から特定のファイルやディレクトリを除外解除できます：

```

# README.md を除くすべての .md ファイルを除外
*.md
!README.md
```

`.geminiignore` ファイルからパスを削除するには、該当する行を削除してください。