# Todo Write ツール (`todo_write`)

このドキュメントでは、Qwen Code 向けの `todo_write` ツールについて説明します。

## 説明

`todo_write` を使用して、現在のコーディングセッション用に構造化されたタスクリストを作成・管理できます。このツールは、AIアシスタントが進捗状況を追跡し、複雑なタスクを整理するのに役立ち、あなたがどの作業が実行されているかを可視化できます。

### 引数

`todo_write` は1つの引数を取ります：

- `todos`（配列、必須）：todoアイテムの配列で、各アイテムには以下が含まれます：
  - `content`（文字列、必須）：タスクの説明。
  - `status`（文字列、必須）：現在のステータス（`pending`、`in_progress`、または`completed`）。
  - `activeForm`（文字列、必須）：現在行われていることを示す現在進行形の表現（例："Running tests"、"Building the project"）。

## `todo_write` の使い方 (Qwen Code と一緒に)

AI アシスタントは、複雑な複数ステップのタスクに取り組む際、自動的にこのツールを使用します。明示的にリクエストする必要はありませんが、リクエストに対する計画的なアプローチを確認したい場合は、アシスタントに ToDo リストを作成するよう依頼できます。

このツールは、ToDo リストをホームディレクトリ (`~/.qwen/todos/`) にセッション固有のファイルとして保存するため、各コーディングセッションで独自のタスクリストを維持します。

## AI がこのツールを使用するタイミング

アシスタントは次の場合に `todo_write` を使用します：

- 複数のステップが必要な複雑なタスク
- 複数のコンポーネントを持つ機能の実装
- 複数のファイルにまたがるリファクタリング操作
- 3つ以上の明確なアクションを含む作業

アシスタントは、単純な1ステップのタスクや、純粋に情報提供のみを目的とするリクエストに対しては、このツールを使用しません。

### `todo_write` の例

機能実装計画の作成:

```
todo_write(todos=[
  {
    "content": "Create user preferences model",
    "status": "pending",
    "activeForm": "Creating user preferences model"
  },
  {
    "content": "Add API endpoints for preferences",
    "status": "pending",
    "activeForm": "Adding API endpoints for preferences"
  },
  {
    "content": "Implement frontend components",
    "status": "pending",
    "activeForm": "Implementing frontend components"
  }
])
```

## 重要な注意点

- **自動使用:** AIアシスタントは複雑なタスク中に自動的にTODOリストを管理します。
- **進捗可視化:** 作業が進むにつれてTODOリストがリアルタイムで更新される様子が確認できます。
- **セッションの分離:** 各コーディングセッションには独立したTODOリストがあり、他のセッションと干渉しません。