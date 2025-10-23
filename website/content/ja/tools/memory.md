# メモリーツール (`save_memory`)

このドキュメントでは、Qwen Code 用の `save_memory` ツールについて説明します。

## 概要

`save_memory` を使用すると、Qwen Code セッション間で情報を保存し、後で呼び出すことができます。`save_memory` を使うことで、CLI にセッションをまたいで重要な詳細を記憶させ、パーソナライズされた適切なサポートを提供できます。

### 引数

`save_memory` は以下の引数を取ります：

- `fact` (string, 必須): 記憶する特定の事実や情報。これは自然言語で書かれた、明確で自己完結型の文である必要があります。

## Qwen Code で `save_memory` を使う方法

このツールは、指定された `fact` をユーザーのホームディレクトリにあるコンテキストファイルに追加します（デフォルトでは `~/.qwen/QWEN.md`）。このファイル名は `contextFileName` で設定可能です。

一度追加されると、これらの情報は `## Qwen Added Memories` セクション以下に保存されます。このファイルは以降のセッションでコンテキストとして読み込まれるため、CLI が保存された情報を呼び出せるようになります。

使用例：

```
save_memory(fact="Your fact here.")
```

### `save_memory` の使用例

ユーザーの設定を記憶する：

```
save_memory(fact="My preferred programming language is Python.")
```

プロジェクト固有の詳細情報を保存する：

```
save_memory(fact="The project I'm currently working on is called 'qwen-code'.")
```

## 重要な注意点

- **一般的な使い方：** このツールは簡潔で重要な事実を記録するために使用してください。大量のデータや会話履歴の保存には向いていません。
- **メモリファイル：** メモリファイルはプレーンテキスト形式の Markdown ファイルなので、必要に応じて手動で確認・編集できます。