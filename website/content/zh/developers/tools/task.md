# Task 工具 (`task`)

本文档介绍了 Qwen Code 中的 `task` 工具。

## 描述

使用 `task` 启动专门的子代理（subagent），以自主处理复杂的多步骤任务。Task 工具将工作委托给专用代理，这些代理可以独立运行并访问各自的工具集，从而实现任务的并行执行和专业化处理。

### 参数

`task` 接受以下参数：

- `description`（string，必填）：任务的简短描述（3-5 个词），用于用户可见性和跟踪。
- `prompt`（string，必填）：供子代理执行的详细任务提示词。应包含自主执行所需的完整指令。
- `subagent_type`（string，必填）：用于此任务的专用代理类型。必须与已配置的可用子代理之一匹配。

## 如何在 Qwen Code 中使用 `task`

Task 工具会根据你的配置动态加载可用的子代理，并将任务委托给它们。每个子代理独立运行，可以使用自己的工具集，从而实现专业化处理和并行执行。

使用 Task 工具时，子代理将：

1. 接收任务提示词并完全自主运行
2. 使用可用工具执行任务
3. 返回最终结果消息
4. 终止（子代理是无状态的，且仅限单次使用）

用法：

```
task(description="Brief task description", prompt="Detailed task instructions for the subagent", subagent_type="agent_name")
```

## 可用子代理

可用的子代理取决于你的配置。常见的子代理类型可能包括：

- **general-purpose**：适用于需要多种工具的复杂多步骤任务
- **code-reviewer**：用于审查和分析代码质量
- **test-runner**：用于运行测试并分析结果
- **documentation-writer**：用于创建和更新文档

你可以在 Qwen Code 中使用 `/agents` 命令查看可用的子代理。

## Task 工具特性

### 实时进度更新

Task 工具提供实时状态更新，显示：

- 子代理执行状态
- 子代理发起的单个工具调用
- 工具调用结果及任何错误
- 整体任务进度和完成状态

### 并行执行

你可以在单条消息中多次调用 Task 工具，从而并发启动多个子代理，实现任务并行执行并提升效率。

### 专业化能力

每个子代理可配置以下内容：

- 特定的工具访问权限
- 专用的系统提示词和指令
- 自定义模型配置
- 领域特定的知识和能力

## `task` 示例

### 委托给通用代理

```
task(
  description="Code refactoring",
  prompt="Please refactor the authentication module in src/auth/ to use modern async/await patterns instead of callbacks. Ensure all tests still pass and update any related documentation.",
  subagent_type="general-purpose"
)
```

### 运行并行任务

```
# Launch code review and test execution in parallel
task(
  description="Code review",
  prompt="Review the recent changes in the user management module for code quality, security issues, and best practices compliance.",
  subagent_type="code-reviewer"
)

task(
  description="Run tests",
  prompt="Execute the full test suite and analyze any failures. Provide a summary of test coverage and recommendations for improvement.",
  subagent_type="test-runner"
)
```

### 文档生成

```
task(
  description="Update docs",
  prompt="Generate comprehensive API documentation for the newly implemented REST endpoints in the orders module. Include request/response examples and error codes.",
  subagent_type="documentation-writer"
)
```

## 何时使用 Task 工具

在以下情况下使用 Task 工具：

1. **复杂的多步骤任务** - 需要多项操作且可自主处理的任务
2. **需要专业知识** - 受益于特定领域知识或工具的任务
3. **并行执行** - 存在多个可同时运行的独立任务时
4. **需要委托** - 希望移交完整任务而非逐步微操时
5. **资源密集型操作** - 可能消耗大量时间或计算资源的任务

## 何时不应使用 Task 工具

以下情况请勿使用 Task 工具：

- **简单的单步操作** - 直接使用 Read、Edit 等工具
- **交互式任务** - 需要来回沟通的任务
- **读取特定文件** - 直接使用 Read 工具以获得更好性能
- **简单搜索** - 直接使用 Grep 或 Glob 工具

## 重要说明

- **无状态执行**：每次子代理调用都是独立的，不保留历史执行记忆
- **单次通信**：子代理仅提供一条最终结果消息，不支持持续交互
- **完整的提示词**：你的 prompt 应包含自主执行所需的所有上下文和指令
- **工具访问权限**：子代理仅能访问其特定配置中定义的工具
- **并行能力**：多个子代理可同时运行以提升效率
- **依赖配置**：可用的子代理类型取决于你的系统配置

## 配置

子代理通过 Qwen Code 的代理配置系统进行配置。使用 `/agents` 命令可以：

- 查看可用子代理
- 创建新的子代理配置
- 修改现有子代理设置
- 设置工具权限和能力

有关配置子代理的更多信息，请参阅子代理文档。