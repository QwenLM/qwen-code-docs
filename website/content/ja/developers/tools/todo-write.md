# Todo Write ツール (`todo_write`)

このドキュメントでは、Qwen Code の `todo_write` ツールについて説明します。

## 概要

`todo_write` を使用すると、現在のコーディングセッションに対して構造化されたタスクリストを作成・管理できます。このツールにより、AI アシスタントが進捗を追跡し、複雑なタスクを整理するとともに、実行中の作業内容を確認できるようになります。

### 引数

`todo_write` は以下の引数を受け取ります:

- `todos` (array, required): Todo アイテムの配列。各アイテムには以下が含まれます:
  - `content` (string, required): タスクの説明。
  - `status` (string, required): 現在のステータス (`pending`、`in_progress`、または `completed`)。
  - `id` (string, required): Todo アイテムの一意の識別子。

## Qwen Code での `todo_write` の使い方

AI アシスタントは、複雑な複数ステップのタスクを処理する際に自動的にこのツールを使用します。明示的に指示する必要はありませんが、リクエストに対する計画されたアプローチを確認したい場合は、アシスタントに Todo リストの作成を依頼できます。

このツールは、ホームディレクトリ (`~/.qwen/todos/`) にセッション固有のファイルとして Todo リストを保存するため、各コーディングセッションは独自のタスクリストを持ちます。

## AI がこのツールを使用するタイミング

アシスタントは以下の場合に `todo_write` を使用します:

- 複数のステップを必要とする複雑なタスク
- 複数のコンポーネントを含む機能実装
- 複数ファイルにまたがるリファクタリング作業
- 3 つ以上の明確なアクションを含む作業

シンプルな単一ステップのタスクや純粋な情報提供のリクエストには使用しません。

### `todo_write` の使用例

機能実装の計画を作成する例:

```
todo_write(todos=[
  {
    "id": "1",
    "content": "Create user preferences model",
    "status": "pending"
  },
  {
    "id": "2",
    "content": "Add API endpoints for preferences",
    "status": "pending"
  },
  {
    "id": "3",
    "content": "Implement frontend components",
    "status": "pending"
  }
])
```

## 重要事項

- **自動使用:** AI アシスタントは複雑なタスクの実行中に Todo リストを自動的に管理します。
- **進捗の可視化:** 作業の進行に合わせて Todo リストがリアルタイムで更新されます。
- **セッションの独立性:** 各コーディングセッションは独自の Todo リストを持ち、他のセッションに影響を与えません。
