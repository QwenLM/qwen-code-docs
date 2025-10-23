# Todo Write Tool (`todo_write`)

本文档描述了用于 Qwen Code 的 `todo_write` 工具。

## 描述

使用 `todo_write` 为当前 coding session 创建和管理结构化的任务列表。该工具帮助 AI assistant 跟踪进度并组织复杂任务，让你能够清楚地了解正在进行的工作。

### 参数

`todo_write` 接受一个参数：

- `todos` (array, 必填): 一个包含待办事项的数组，每个项目包含：
  - `id` (string, 必填): 待办事项的唯一标识符。
  - `content` (string, 必填): 任务描述。
  - `status` (string, 必填): 当前状态（`pending`、`in_progress` 或 `completed`）。

## 如何在 Qwen Code 中使用 `todo_write`

在处理复杂的多步骤任务时，AI 助手会自动使用这个工具。你无需显式调用它，但如果你希望查看请求的计划执行步骤，可以要求助手创建一个待办事项列表。

该工具会将待办事项列表存储在你的主目录下 (`~/.qwen/todos/`)，并为每个会话创建独立的文件，因此每个编程会话都会维护自己的任务列表。

## AI 何时使用此工具

助手会在以下情况下使用 `todo_write`：

- 需要多个步骤的复杂任务
- 涉及多个组件的功能实现
- 跨多个文件的重构操作
- 涉及 3 个或更多不同操作的任务

对于简单的单步任务或纯信息查询，助手不会使用此工具。

### `todo_write` 示例

创建功能实现计划：

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

## 重要说明

- **自动使用：** AI 助手在复杂任务期间会自动管理待办事项列表。
- **进度可见性：** 随着工作进展，你会实时看到待办事项列表的更新。
- **会话隔离：** 每个编码会话都有自己的待办事项列表，不会相互干扰。