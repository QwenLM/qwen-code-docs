# Agent 工具 (`agent`)

本文档介绍 Qwen Code 的 `agent` 工具。

## 描述

使用 `agent` 启动一个专门的子代理（subagent），自主处理复杂多步骤任务。Agent 工具将工作委托给专用子代理，这些子代理可以独立工作，并访问自己的工具集，从而实现并行任务执行和专业能力。

### 参数

`agent` 接受以下参数：

- `description`（字符串，必需）：任务的简短描述（3-5 个词），用于用户可见性和跟踪。
- `prompt`（字符串，必需）：子代理执行的详细任务提示。应包含自主执行的全面指令。
- `subagent_type`（字符串，可选）：用于此任务的专用代理类型。如果省略，默认为 `general-purpose`。
- `run_in_background`（布尔值，可选）：设置为 `true` 可让代理在后台运行。完成后你会收到通知。
- `isolation`（字符串，可选）：设置为 `"worktree"` 可在隔离的 Git worktree 中运行代理。

## 如何使用 `agent` 与 Qwen Code

Agent 工具从你的配置中动态加载可用的子代理，并将任务委托给它们。每个子代理独立运行，可以使用自己的工具集，实现专业能力和并行执行。

当你使用 Agent 工具时，子代理将：

1. 接收任务提示并获得完全自主权
2. 使用其可用工具执行任务
3. 返回最终结果消息
4. 终止（子代理无状态且单次使用）

用法：

```
agent(description="Brief task description", prompt="Detailed task instructions for the subagent", subagent_type="agent_name")
```

## 可用的子代理

可用的子代理取决于你的配置。常见的子代理类型可能包括：

- **general-purpose**：用于需要多种工具的复杂多步骤任务
- **code-reviewer**：用于审查和分析代码质量
- **test-runner**：用于运行测试和分析结果
- **documentation-writer**：用于创建和更新文档

你可以在 Qwen Code 中使用 `/agents` 命令查看可用的子代理。

## Agent 工具功能

### 实时进度更新

Agent 工具提供实时更新，显示：

- 子代理执行状态
- 子代理正在进行的工具调用
- 工具调用结果和任何错误
- 整体任务进度和完成状态

### 并行执行

你可以通过单条消息多次调用 Agent 工具来启动多个子代理并发执行，从而实现并行任务处理并提高效率。

### 专业能力

每个子代理可以配置：

- 特定的工具访问权限
- 专门的系统提示和指令
- 自定义模型配置
- 特定领域的知识和能力

## `agent` 示例

### 委托给通用代理

```
agent(
  description="Code refactoring",
  prompt="Please refactor the authentication module in src/auth/ to use modern async/await patterns instead of callbacks. Ensure all tests still pass and update any related documentation.",
  subagent_type="general-purpose"
)
```

### 并行运行任务

```
# Launch code review and test execution in parallel
agent(
  description="Code review",
  prompt="Review the recent changes in the user management module for code quality, security issues, and best practices compliance.",
  subagent_type="general-purpose"
)

agent(
  description="Run tests",
  prompt="Execute the full test suite and analyze any failures. Provide a summary of test coverage and recommendations for improvement.",
  subagent_type="test-engineer"
)
```

### 文档生成

```
agent(
  description="Update docs",
  prompt="Generate comprehensive API documentation for the newly implemented REST endpoints in the orders module. Include request/response examples and error codes.",
  subagent_type="general-purpose"
)
```

## 何时使用 Agent 工具

在以下情况下使用 Agent 工具：

1. **复杂多步骤任务** - 需要多个操作且可自主处理的任务
2. **专业能力** - 需要特定领域知识或工具的任务
3. **并行执行** - 有多个可以同时运行的独立任务
4. **委托需求** - 希望将整个任务移交处理，而非逐步微观管理
5. **资源密集型操作** - 可能需要大量时间或计算资源的任务

## 何时不应使用 Agent 工具

不要将 Agent 工具用于：

- **简单的单步操作** - 直接使用诸如 Read、Edit 等工具
- **交互式任务** - 需要来回交流的任务
- **特定的文件读取** - 直接使用 Read 工具性能更好
- **简单搜索** - 直接使用 Grep 或 Glob 工具

## 重要说明

- **无状态执行**：每次子代理调用都是独立的，不会记忆之前的执行
- **单次通信**：子代理只提供一条最终结果消息，不进行持续交流
- **全面的提示**：你的提示应包含自主执行所需的所有上下文和指令
- **工具访问**：子代理只能访问其特定配置中设置的工具
- **并行能力**：多个子代理可以同时运行以提高效率
- **配置依赖**：可用的子代理类型取决于系统配置

## 配置

子代理通过 Qwen Code 的代理配置系统进行配置。使用 `/agents` 命令可以：

- 查看可用的子代理
- 创建新的子代理配置
- 修改现有子代理设置
- 设置工具权限和能力

有关配置子代理的更多信息，请参阅子代理文档。