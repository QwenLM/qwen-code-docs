# Todo Write 工具（`todo_write`）

本文档描述了 Qwen Code 的 `todo_write` 工具。

## 描述

使用 `todo_write` 创建并管理当前编码会话的结构化任务列表。该工具帮助 AI 助手跟踪进度、组织复杂任务，同时让你清晰了解正在执行的工作。

### 参数

`todo_write` 接受一个参数：

- `todos`（数组，必需）：一个待办事项数组，每个事项包含：
  - `content`（字符串，必需）：任务的描述。
  - `status`（字符串，必需）：当前状态（`pending`、`in_progress` 或 `completed`）。
  - `id`（字符串，必需）：待办事项的唯一标识符。

## 如何在 Qwen Code 中使用 `todo_write`

AI 助手在复杂、多步骤任务中会自动使用此工具。你无需显式请求，但如果想查看助手对你请求的规划方案，可以要求它创建一个待办事项列表。

该工具将待办事项列表存储在你的主目录（`~/.qwen/todos/`）中，使用会话特定文件，因此每个编码会话都维护自己的任务列表。

## AI 何时使用此工具

助手使用 `todo_write` 的场景：

- 需要多步骤的复杂任务
- 包含多个组件的功能实现
- 跨多个文件的重构操作
- 涉及 3 个或更多独立操作的工作

助手不会将此工具用于简单的单步骤任务或纯粹的信息查询请求。

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

## 注意事项

- **自动使用：** AI 助手在复杂任务期间自动管理待办事项列表。
- **进度可见性：** 你将看到待办事项列表随着工作进展实时更新。
- **会话隔离：** 每个编码会话拥有独立的待办事项列表，互不干扰。