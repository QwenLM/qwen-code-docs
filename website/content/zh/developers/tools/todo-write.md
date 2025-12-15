# Todo Write 工具 (`todo_write`)

本文档描述了用于 Qwen Code 的 `todo_write` 工具。

## 描述

使用 `todo_write` 可以为你当前的编码会话创建和管理结构化的任务列表。此工具帮助 AI 助手跟踪进度并组织复杂的任务，让你能够清楚地了解正在进行的工作。

### 参数

`todo_write` 接受一个参数：

- `todos`（数组，必填）：待办事项的数组，每个项目包含：
  - `content`（字符串，必填）：任务的描述。
  - `status`（字符串，必填）：当前状态（`pending`、`in_progress` 或 `completed`）。
  - `activeForm`（字符串，必填）：表示正在进行操作的现在进行时形式（例如："Running tests"、"Building the project"）。

## 如何使用 `todo_write` 与 Qwen Code

在处理复杂的多步骤任务时，AI 助手会自动使用此工具。你无需显式请求，但如果你希望查看请求的计划方案，可以要求助手创建待办事项列表。

该工具会在你的主目录（`~/.qwen/todos/`）中存储待办事项列表，并使用特定于会话的文件，因此每个编码会话都会维护其独立的任务列表。

## AI 使用此工具的情况

助手会在以下情况下使用 `todo_write`：

- 需要多个步骤的复杂任务  
- 涉及多个组件的功能实现  
- 跨多个文件的重构操作  
- 涉及三个或更多不同操作的工作  

对于简单的单步任务或纯信息查询，助手不会使用此工具。

### `todo_write` 示例

创建功能实现计划：

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

## 重要说明

- **自动使用：** AI 助手在复杂任务期间自动管理待办事项列表。
- **进度可见性：** 随着工作进展，您将实时看到待办事项列表的更新。
- **会话隔离：** 每个编码会话都有自己的待办事项列表，不会相互干扰。