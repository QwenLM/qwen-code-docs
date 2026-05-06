# メモリツール (`save_memory`)

このドキュメントでは、Qwen Code の `save_memory` ツールについて説明します。

## 概要

`save_memory` を使用すると、Qwen Code のセッション間で情報を保存・呼び出すことができます。このツールを使うことで、セッション間で重要な詳細を CLI に記憶させ、パーソナライズされた的確なサポートを受けられます。

### 引数

`save_memory` は 1 つの引数を受け取ります：

- `fact` (string, 必須): 記憶させる具体的な事実や情報。自然言語で記述された、明確で独立した文である必要があります。

## Qwen Code での `save_memory` の使用方法

このツールは、指定された `fact` をユーザーのホームディレクトリにあるコンテキストファイルに追記します（デフォルトは `~/.qwen/QWEN.md`）。このファイル名は `contextFileName` で設定できます。

追加された情報は、`## Qwen Added Memories` セクションに保存されます。このファイルは後続のセッションでコンテキストとして読み込まれるため、CLI は保存された情報を呼び出すことができます。

使用例：

```
save_memory(fact="Your fact here.")
```

### `save_memory` の使用例

ユーザー設定を記憶させる場合：

```
save_memory(fact="My preferred programming language is Python.")
```

プロジェクト固有の詳細を保存する場合：

```
save_memory(fact="The project I'm currently working on is called 'qwen-code'.")
```

## 注意事項

- **一般的な使用方法:** このツールは、簡潔で重要な事実の保存に使用してください。大量のデータや会話履歴の保存を目的としていません。
- **メモリファイル:** メモリファイルはプレーンテキストの Markdown ファイルであるため、必要に応じて手動で表示・編集できます。