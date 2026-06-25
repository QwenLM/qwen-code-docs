# Agent 工具 (`agent`)

本文档介绍 Qwen Code 的 `agent` 工具。

## 描述

使用 `agent` 可以启动专用子 Agent 来自主处理复杂的多步骤任务。Agent 工具将工作委托给专用 Agent，这些 Agent 可以独立运行并访问各自的工具集，支持并行任务执行和专业化能力。

### 参数

`agent` 接受以下参数：

- `description`（string，必填）：任务的简短描述（3-5 个词），用于用户可见性和 tracking 目的。
- `prompt`（string，必填）：子 Agent 执行的详细任务提示词，应包含自主执行所需的完整指令。
- `subagent_type`（string，可选）：用于此任务的专用 Agent 类型。若省略，默认为 `general-purpose`。
- `run_in_background`（boolean，可选）：设为 `true` 可在后台运行 Agent，完成后会收到通知。
- `isolation`（string，可选）：设为 `"worktree"` 可在隔离的 git worktree 中运行 Agent。

## 在 Qwen Code 中使用 `agent`

Agent 工具会从你的配置中动态加载可用的子 Agent，并将任务委托给它们。每个子 Agent 独立运行，可以使用各自的工具集，从而实现专业化能力和并行执行。

使用 Agent 工具时，子 Agent 将：

1. 以完全自主的方式接收任务提示词
2. 使用可用工具执行任务
3. 返回最终结果消息
4. 终止（子 Agent 是无状态的，且为一次性使用）

用法：

```
agent(description="Brief task description", prompt="Detailed task instructions for the subagent", subagent_type="agent_name")
```

## 可用子 Agent

可用的子 Agent 取决于你的配置。常见的子 Agent 类型包括：

- **general-purpose**：适用于需要多种工具的复杂多步骤任务
- **code-reviewer**：用于审查和分析代码质量
- **test-runner**：用于运行测试并分析结果
- **documentation-writer**：用于创建和更新文档

你可以在 Qwen Code 中使用 `/agents` 命令查看可用的子 Agent。

## Agent 工具功能

### 实时进度更新

Agent 工具提供实时更新，展示：

- 子 Agent 执行状态
- 子 Agent 正在进行的各项工具调用
- 工具调用结果及错误信息
- 整体任务进度和完成状态

### 并行执行

你可以在一条消息中多次调用 Agent 工具来并发启动多个子 Agent，从而实现并行任务执行，提高效率。

### 专业化能力

每个子 Agent 可配置：

- 特定的工具访问权限
- 专用的系统提示词和指令
- 自定义模型配置
- 特定领域的知识和能力

## `agent` 示例

### 委托给通用 Agent

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

1. **复杂的多步骤任务** —— 需要多个操作且可自主处理的任务
2. **专业化能力** —— 受益于特定领域知识或工具的任务
3. **并行执行** —— 存在多个可同时运行的独立任务时
4. **委托需求** —— 希望移交完整任务而非逐步微管理时
5. **资源密集型操作** —— 可能需要大量时间或计算资源的任务

## 何时不使用 Agent 工具

以下情况不要使用 Agent 工具：

- **简单的单步操作** —— 直接使用 Read、Edit 等工具
- **交互式任务** —— 需要来回沟通的任务
- **特定文件读取** —— 直接使用 Read 工具以获得更好的性能
- **简单搜索** —— 直接使用 Grep 或 Glob 工具

## 重要说明

- **无状态执行**：每次子 Agent 调用均相互独立，不保留之前执行的记忆
- **单次通信**：子 Agent 只提供一条最终结果消息，不支持持续通信
- **完整提示词**：提示词应包含自主执行所需的所有上下文和指令
- **工具访问**：子 Agent 只能访问其特定配置中设置的工具
- **并行能力**：多个子 Agent 可同时运行以提高效率
- **依赖配置**：可用的子 Agent 类型取决于你的系统配置

## 配置

子 Agent 通过 Qwen Code 的 Agent 配置系统进行配置。使用 `/agents` 命令可以：

- 查看可用的子 Agent
- 创建新的子 Agent 配置
- 修改现有子 Agent 设置
- 设置工具权限和能力

有关配置子 Agent 的更多信息，请参阅子 Agent 文档。