# Todo Write Tool (`todo_write`)

このドキュメントでは、Qwen Code 用の `todo_write` ツールについて説明します。

## 概要

`todo_write` を使用して、現在のコーディングセッション用に構造化されたタスクリストを作成・管理できます。このツールは、AIアシスタントが進捗状況を追跡し、複雑なタスクを整理するのに役立ち、あなたがどの作業が行われているかを可視化できます。

### 引数

`todo_write` は1つの引数を取ります：

- `todos` (array, required): todoアイテムの配列。各アイテムには以下が含まれます：
  - `id` (string, required): todoアイテムの一意の識別子。
  - `content` (string, required): タスクの説明。
  - `status` (string, required): 現在のステータス（`pending`、`in_progress`、または`completed`）。

## Qwen Code で `todo_write` を使う方法

AIアシスタントは、複雑な複数ステップのタスクに取り組む際、自動的にこのツールを使用します。明示的にリクエストする必要はありませんが、リクエストに対する計画的なアプローチを確認したい場合は、アシスタントにtodoリストの作成を依頼できます。

このツールは、ホームディレクトリ（`~/.qwen/todos/`）にセッション固有のファイルとしてtodoリストを保存するため、各コーディングセッションで独自のタスクリストを維持します。

## AIがこのツールを使うタイミング

アシスタントは以下のケースで `todo_write` を使用します：

- 複数のステップを必要とする複雑なタスク
- 複数のコンポーネントを持つ機能の実装
- 複数のファイルにまたがるリファクタリング操作
- 3つ以上の異なるアクションを含む作業

アシスタントは、単純な1ステップのタスクや純粋に情報提供のみを目的とするリクエストに対しては、このツールを使用しません。

### `todo_write` の例

機能実装プランの作成:

```
todo_write(todos=[
  {
    "id": "create-model",
    "content": "Create user preferences model",
    "status": "pending"
  },
  {
    "id": "add-endpoints",
    "content": "Add API endpoints for preferences",
    "status": "pending"
  },
  {
    "id": "implement-ui",
    "content": "Implement frontend components",
    "status": "pending"
  }
])
```

## 重要な注意点

- **自動利用:** AIアシスタントは複雑なタスク中に自動的にtodoリストを管理します。
- **進捗可視化:** 作業が進むにつれてtodoリストがリアルタイムで更新されるのを確認できます。
- **セッション隔離:** 各コーディングセッションは独立したtodoリストを持ち、他のセッションと干渉しません。