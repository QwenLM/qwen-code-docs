# Agent 工具 (`agent`)

本文档介绍 Qwen Code 的 `agent` 工具。

## 描述

使用 `agent` 启动一个专门的子代理（subagent），自主处理复杂多步骤任务。Agent 工具将工作委托给专用子代理，这些子代理可以独立工作，并访问自己的工具集，从而实现并行任务执行和专业能力。

### 参数

`agent` 接受以下参数：

- `description`（字符串，必需）：任务的简短描述（3-5 个词），用于用户可见性和跟踪。
- `prompt`（字符串，必需）：子代理执行的详细任务提示。应包含自主执行的全面指令。
- `subagent_type`（字符串，可选）：用于此任务的专用代理类型。如果省略，默认为 `general-purpose`。
- `fork_turns`（字符串，可选）：仅在 `subagent_type="fork"` 时有效。省略或使用 `all` 继承完整的父会话上下文，或使用正整数字符串（如 `"3"`）继承最近三个真实用户轮次。工具响应和纯系统提醒不计入轮次。
- `fork_tools`（字符串数组，可选）：仅在 `subagent_type="fork"` 时有效。将执行限制为精确的规范工具名称或 MCP 服务器模式，同时保持 fork 当前对模型可见的工具声明不变以共享 prompt 缓存。条目不能包含前后空白；通配符仅限于 `mcp__*` 或尾部 MCP 工具前缀模式（如 `mcp__github__read_*`）。Fork 永远不会执行 `ask_user_question`；省略 `fork_tools` 以允许所有其他继承的工具，或使用空数组拒绝所有工具调用。
- `fork_profile`（字符串，可选）：仅在 `subagent_type="fork"` 时有效。从活动项目根目录加载一个仅含 frontmatter 的普通 `.qwen/fork-profiles/<name>.md` 文件（最大 64 KiB），并应用其必需的 `tools` 数组以及可选的最多 200 个字符的 `promptHint`。该文件不能解析到项目 profile 目录之外。`fork_profile` 不能与 `fork_tools` 或命名的 teammate 组合使用，且在安全模式或裸模式下不可用。
- `run_in_background`（布尔值，可选）：默认为 `true`（针对顶层常规代理）。设置为 `false` 以同步等待常规代理的结果。无头 fork 始终在后台运行。嵌套代理在前台运行，除非 `run_in_background` 显式为 `true`（这会被拒绝，因为嵌套代理无法接收后台完成通知）。未命名且由调用者拥有 `working_dir` 的启动会在前台运行：显式的 `run_in_background: true` 请求会被拒绝；配置的后台默认值（subagent 定义中的 `background: true`）在顶层会被拒绝，在嵌套时则降级为前台运行。
- `isolation`（字符串，可选）：设置为 `"worktree"` 可在 Qwen Code 创建和管理的隔离 Git worktree 中运行显式命名的非 fork 代理。
- `working_dir`（字符串，可选）：将显式命名的非 fork 代理固定到当前仓库中已有的已注册 Git worktree。未命名启动会在前台运行，因为调用者拥有 worktree 的生命周期（参见 `run_in_background`）；固定到该 worktree 的命名队友会并发运行，移除 worktree 前必须先将其关闭。如果同时提供 `working_dir` 和 `isolation`，则 `working_dir` 优先。

## 如何使用 `agent` 与 Qwen Code

Agent 工具从你的配置中动态加载可用的子代理，并将任务委托给它们。每个子代理独立运行，可以使用自己的工具集，实现专业能力和并行执行。

当你使用 Agent 工具时，子代理将：

1. 接收任务提示，对于 fork，还会接收选定的父会话上下文
2. 使用其可用工具执行任务
3. 默认报告完成通知，或者当常规代理在前台运行时返回最终结果消息
4. 在后台运行后，当其保留状态支持继续时仍可被寻址

用法：

```
agent(description="Brief task description", prompt="Detailed task instructions for the subagent", subagent_type="agent_name")
agent(description="Brief task description", prompt="Detailed task instructions for the fork", subagent_type="fork", fork_turns="3")
agent(description="Read-only investigation", prompt="Inspect the implementation", subagent_type="fork", fork_tools=["read_file", "grep_search", "mcp__github"])
agent(description="Profiled investigation", prompt="Inspect the implementation", subagent_type="fork", fork_profile="ro-research")
```

当当前轮次必须在继续之前使用子代理结果时，设置 `run_in_background=false`。

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

### 后台代理继续

后台代理在初始完成后可以接收后续工作：

1. 调用 `list_agents` 发现当前会话可寻址的后台代理及其 `task_id` 值。这包括父会话恢复后兼容的已恢复代理。
2. 使用 `task_id` 和后续指令调用 `send_message`。运行中的代理在下一个工具轮次边界接收消息，暂停的代理以此消息恢复，已完成的代理在有可用常驻运行时继续运行，或从其保留的转录中复活。
3. 等待下一个完成通知后再使用后续结果。

如果代理无法继续，`list_agents` 会返回 `resume_blocked_reason`。将已恢复或已继续代理的输出视为证据，并在集成更改之前进行验证。

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

- **独立上下文**：常规子代理在没有父会话历史的情况下启动。Fork 默认继承完整会话，并在有限的近期窗口足够时接受 `fork_turns`。
- **子代理交互**：常规子代理不会接收 `ask_user_question`。Fork 保留父级的声明列表以共享缓存，但在调度或审批之前拒绝该工具；当缺少用户输入阻碍工作时，子代理会向父级报告阻塞。
- **Fork 执行限制**：`fork_tools` 进一步缩小 fork 可以执行的已声明工具范围。不允许的调用在调度或审批之前返回错误；相同的声明列表仍对模型可见以共享缓存。这是调用者选择的每调用限制，而非管理员强制的沙箱。
- **Fork profile**：`.qwen/fork-profiles/` 下的项目 profile 复用与 `fork_tools` 相同的执行门控。它在启动前解析一次；解析后的列表会被持久化以供复活使用，可选的 `promptHint` 仅添加到任务指令中。
- **完成交付**：后台结果通过后续轮次中的完成通知到达。在通知到达之前不要假设结果。
- **继续**：对相关的后续工作使用 `list_agents` 和 `send_message`，而不是启动重复的代理。继续取决于兼容的保留状态，可能不可用。
- **全面的提示**：你的初始提示应包含自主执行所需的所有上下文和指令。常规子代理看不到父会话。
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
