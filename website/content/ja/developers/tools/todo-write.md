# Todo Write ツール (`todo_write`)

このドキュメントでは、Qwen Code 用の `todo_write` ツールについて説明します。

## 説明

現在のコーディングセッションにおいて、構造化されたタスクリストの作成と管理に `todo_write` を使用します。このツールは AI アシスタントが進捗を追跡し、複雑なタスクを整理するのに役立ち、実行されている作業の状況を可視化します。

### 引数

`todo_write` は 1 つの引数を受け取ります：

- `todos`（配列、必須）：todo アイテムの配列。各アイテムには以下が含まれます：
  - `content`（文字列、必須）：タスクの説明。
  - `status`（文字列、必須）：現在のステータス（`pending`、`in_progress`、または `completed`）。
  - `activeForm`（文字列、必須）：現在実行中の作業を表す現在進行形の説明（例："Running tests"、"Building the project"）。

## Qwen Code での `todo_write` の使用方法

AI アシスタントは、複雑な複数ステップのタスクに取り組む際に、このツールを自動的に使用します。明示的にリクエストする必要はありませんが、リクエストに対する計画されたアプローチを確認したい場合は、アシスタントに todo リストの作成を依頼できます。

このツールは、セッション固有のファイルとして todo リストをホームディレクトリ（`~/.qwen/todos/`）に保存するため、各コーディングセッションは独自のタスクリストを維持します。

## AI がこのツールを使用するタイミング

アシスタントは以下のケースで `todo_write` を使用します：

- 複数のステップを必要とする複雑なタスク
- 複数のコンポーネントからなる機能の実装
- 複数ファイルにまたがるリファクタリング作業
- 3 つ以上の明確なアクションを含む作業

アシスタントは、単純な単一ステップのタスクや、情報照会のみを目的としたリクエストにはこのツールを使用しません。

### `todo_write` の使用例

機能実装計画の作成：

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

## 重要な注意事項

- **自動使用：** AI アシスタントは複雑なタスク中に todo リストを自動的に管理します。
- **進捗の可視化：** 作業の進行に伴い、todo リストがリアルタイムで更新されるのを確認できます。
- **セッションの分離：** 各コーディングセッションは独自の todo リストを持ち、他のセッションと干渉しません。