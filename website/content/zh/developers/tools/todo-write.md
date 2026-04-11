# Todo Write 工具 (`todo_write`)

本文档介绍了适用于 Qwen Code 的 `todo_write` 工具。

## 简介

使用 `todo_write` 为当前编码会话创建和管理结构化的任务列表。该工具可帮助 AI 助手跟踪进度并组织复杂任务，让你清晰了解正在执行的工作。

### 参数

`todo_write` 接受一个参数：

- `todos`（数组，必填）：todo 项数组，每个项包含：
  - `content`（字符串，必填）：任务描述。
  - `status`（字符串，必填）：当前状态（`pending`、`in_progress` 或 `completed`）。
  - `activeForm`（字符串，必填）：描述当前正在执行操作的现在进行时形式（例如 "Running tests"、"Building the project"）。

## 如何在 Qwen Code 中使用 `todo_write`

在处理复杂的多步骤任务时，AI 助手会自动使用此工具。你无需显式请求，但如果想查看针对你请求的规划方案，可以要求助手创建 todo 列表。

该工具将会话专属的 todo 列表文件存储在你的主目录（`~/.qwen/todos/`）中，因此每个编码会话都会维护独立的任务列表。

## AI 何时使用此工具

助手会在以下场景使用 `todo_write`：

- 需要多个步骤的复杂任务
- 包含多个组件的功能实现
- 跨多个文件的重构操作
- 涉及 3 个或以上独立操作的任何工作

对于简单的单步任务或纯信息查询请求，助手不会使用此工具。

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

- **自动使用：** 在处理复杂任务时，AI 助手会自动管理 todo 列表。
- **进度可见：** 随着工作推进，你将实时看到 todo 列表的更新。
- **会话隔离：** 每个编码会话都有独立的 todo 列表，互不干扰。