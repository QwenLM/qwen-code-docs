# Memory Tool (`save_memory`)

このドキュメントでは、Qwen Code 用の `save_memory` ツールについて説明します。

## 概要

`save_memory` を使用すると、Qwen Code のセッション間で情報を保存し、後で呼び出すことができます。`save_memory` を使うことで、CLI に重要な詳細情報をセッションをまたいで記憶させ、パーソナライズされた適切なサポートを提供できます。

### 引数

`save_memory` は以下の引数を取ります：

- `fact` (string, required): 記憶させたい特定の事実や情報。これは自然言語で書かれた、明確で自己完結的な文である必要があります。

## Qwen Code で `save_memory` を使う方法

このツールは、指定された `fact` をユーザーのホームディレクトリにあるコンテキストファイルに追加します（デフォルトでは `~/.qwen/QWEN.md`）。このファイル名は `contextFileName` で設定可能です。

追加された事実は、`## Qwen Added Memories` セクションの下に保存されます。このファイルは以降のセッションでコンテキストとして読み込まれ、CLI が保存された情報を呼び出せるようになります。

使用例：

```
save_memory(fact="Your fact here.")
```

### `save_memory` の例

ユーザーの設定を記憶する:

```
save_memory(fact="My preferred programming language is Python.")
```

プロジェクト固有の詳細を保存する:

```
save_memory(fact="The project I'm currently working on is called 'gemini-cli'.")
```

## 重要な注意点

- **一般的な使用法:** このツールは、簡潔で重要な事実を保存するために使用してください。大量のデータや会話履歴の保存を目的としていません。
- **メモリファイル:** メモリファイルはプレーンテキストの Markdown ファイルなので、必要に応じて手動で表示・編集できます。