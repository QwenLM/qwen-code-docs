# Todo Write 工具（`todo_write`）

本文档介绍 Qwen Code 的 `todo_write` 工具。

## 描述

使用 `todo_write` 为当前编码会话创建和管理结构化任务列表。该工具帮助 AI 助手跟踪进度、组织复杂任务，让你清楚地了解正在执行的工作内容。

### 参数

`todo_write` 接受一个参数：

- `todos`（array，必填）：todo 条目数组，每个条目包含：
  - `content`（string，必填）：任务描述。
  - `status`（string，必填）：当前状态（`pending`、`in_progress` 或 `completed`）。
  - `id`（string，必填）：todo 条目的唯一标识符。

## 如何在 Qwen Code 中使用 `todo_write`

AI 助手在处理复杂的多步骤任务时会自动调用此工具。你无需显式请求，但如果你想查看请求的规划方案，可以要求助手创建一个 todo 列表。

该工具将 todo 列表存储在你的主目录（`~/.qwen/todos/`）下的会话专属文件中，每个编码会话都有独立的任务列表。

## AI 何时使用此工具

助手会在以下情况下使用 `todo_write`：

- 需要多个步骤的复杂任务
- 包含多个组件的功能实现
- 跨多个文件的重构操作
- 涉及 3 个或以上独立操作的工作

对于简单的单步骤任务或纯信息查询请求，助手不会使用此工具。

### `todo_write` 示例

创建功能实现计划：

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

## 重要说明

- **自动使用：** AI 助手在复杂任务执行过程中自动管理 todo 列表。
- **进度可见性：** 随着工作推进，你将实时看到 todo 列表的更新。
- **会话隔离：** 每个编码会话有独立的 todo 列表，互不干扰。
