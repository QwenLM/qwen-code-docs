# Subagents

Subagents 是专门处理 Qwen Code 中特定类型任务的 AI 助手。它们允许你将专注性工作委托给配置了特定任务提示词、工具和行为的 AI 智能体。

## 什么是 Subagents？

Subagents 是独立的 AI 助手，具有以下特点：

- **专注于特定任务** - 每个 Subagent 都配置了针对特定工作类型的专属系统提示词
- **拥有独立上下文** - 它们维护各自独立的对话历史，与主对话分离
- **使用受控工具** - 你可以配置每个 Subagent 能访问哪些工具
- **自主工作** - 接到任务后，它们独立工作直至完成或失败
- **提供详细反馈** - 你可以实时查看它们的进度、工具使用情况和执行统计

## Fork Subagent

除命名 subagent 外，Qwen Code 还支持 **fork** —— 通过显式指定 `subagent_type: "fork"` 来触发（仅在交互式会话中可用）。fork 会继承父会话的完整对话上下文，并在后台独立运行。省略 `subagent_type` 不会触发 fork，而是启动通用 subagent，该 subagent 会运行至完成并将结果内联返回。

### Fork 与命名 Subagent 的区别

|               | 命名 Subagent                    | Fork Subagent                                         |
| ------------- | --------------------------------- | ----------------------------------------------------- |
| 上下文       | 全新开始，无父会话历史   | 继承父会话的完整对话历史           |
| 系统提示词 | 使用自身配置的提示词    | 使用父会话的精确系统提示词（用于缓存共享） |
| 执行方式     | 阻塞父会话直至完成      | 在后台运行，父会话立即继续      |
| 适用场景 | 专项任务（测试、文档） | 需要当前上下文的并行任务          |

### Fork 的使用场景

AI 会在以下情况下自动使用 fork：

- 并行运行多个研究任务（例如："调查模块 A、B 和 C"）
- 在继续主对话的同时执行后台工作
- 委托需要理解当前对话上下文的任务

### 提示词缓存共享

所有 fork 共享父会话的精确 API 请求前缀（系统提示词、工具、对话历史），从而命中 DashScope 提示词缓存。当 3 个 fork 并行运行时，共享前缀只需缓存一次并重复使用 —— 与独立 subagent 相比可节省 80% 以上的 token 成本。

### 防止递归 Fork

Fork 子任务不能再创建新的 fork。这在运行时强制执行 —— 如果 fork 尝试生成另一个 fork，将收到错误提示，要求其直接执行任务。

### 当前限制

- **无结果反馈**：Fork 的结果会反映在 UI 进度显示中，但不会自动反馈到主对话。父 AI 只看到占位消息，无法对 fork 的输出做出响应。
- **无工作目录隔离**：Fork 共享父会话的工作目录。多个 fork 并发修改文件可能导致冲突。

## 核心优势

- **任务专业化**：创建针对特定工作流优化的智能体（测试、文档、重构等）
- **上下文隔离**：将专项工作与主对话分离
- **上下文继承**：Fork subagent 继承完整对话，适用于上下文密集型并行任务
- **提示词缓存共享**：Fork subagent 共享父会话的缓存前缀，降低 token 成本
- **可复用性**：在项目和会话之间保存并复用智能体配置
- **访问控制**：限制每个智能体可使用的工具，兼顾安全性与专注度
- **进度可见性**：通过实时进度更新监控智能体执行情况

## Subagents 的工作原理

1. **配置**：创建 Subagents 配置，定义其行为、工具和系统提示词
2. **委托**：主 AI 可以自动将任务委托给合适的 Subagents —— 或者在需要继承完整对话上下文并丢弃中间输出时 fork 自身（`subagent_type: "fork"`）
3. **执行**：Subagents 独立工作，使用配置的工具完成任务
4. **结果**：它们将结果和执行摘要返回给主对话

## 快速入门

### 快速开始

1. **创建第一个 Subagent**：

   `/agents create`

   按照引导向导创建专属智能体。

2. **管理现有智能体**：

   `/agents manage`

   查看和管理已配置的 Subagents。

3. **自动使用 Subagents**：直接让主 AI 执行与你的 Subagents 专长匹配的任务，AI 会自动委托相应工作。

### 使用示例

```
User: "Please write comprehensive tests for the authentication module"
AI: I'll delegate this to your testing specialist Subagents.
[Delegates to "testing-expert" Subagents]
[Shows real-time progress of test creation]
[Returns with completed test files and execution summary]`
```

## 管理

### CLI 命令

Subagents 通过 `/agents` slash 命令及其子命令进行管理：

**用法：**：`/agents create`。通过引导步骤向导创建新的 Subagent。

**用法：**：`/agents manage`。打开交互式管理对话框，用于查看和管理现有 Subagents。

### 存储位置

Subagents 以 Markdown 文件形式存储在多个位置：

- **项目级**：`.qwen/agents/`（最高优先级）
- **用户级**：`~/.qwen/agents/`（备选）
- **扩展级**：由已安装的扩展提供

这样你可以拥有项目专属智能体、跨项目通用的个人智能体，以及扩展提供的专项能力智能体。

### 扩展 Subagents

扩展可以提供自定义 subagent，在扩展启用时即可使用。这些智能体存储在扩展的 `agents/` 目录中，格式与个人和项目智能体相同。

扩展 subagent：

- 扩展启用时自动被发现
- 在 `/agents manage` 对话框中的"Extension Agents"部分显示
- 不可直接编辑（请编辑扩展源代码）
- 遵循与用户定义智能体相同的配置格式

要查看哪些扩展提供了 subagent，请检查扩展的 `qwen-extension.json` 文件中的 `agents` 字段。

### 文件格式

Subagents 使用带有 YAML frontmatter 的 Markdown 文件配置。该格式可读性强，可用任意文本编辑器编辑。

#### 基本结构

```
---
name: agent-name
description: Brief description of when and how to use this agent
model: inherit # Optional: inherit, fast, modelId, or authType:modelId
approvalMode: auto-edit # Optional: default, plan, auto-edit, yolo, bubble
tools:         # Optional: allowlist of tools
  - tool1
  - tool2
disallowedTools: # Optional: blocklist of tools
  - tool3
---

System prompt content goes here.
Multiple paragraphs are supported.
```

#### 模型选择

使用可选的 `model` frontmatter 字段控制 subagent 使用哪个模型：

- `inherit`：与主对话使用相同的模型。
- 省略该字段：等同于 `inherit`。
- `fast`：使用配置的 `fastModel`。如果未配置有效的 fast model，subagent 将回退到 `inherit`。
- `glm-5`：使用该模型 ID。Qwen Code 首先检查主对话的认证类型；如果该模型在该认证类型下不可用，则可从其他已配置的 provider 解析该模型。
- `openai:gpt-4o`：使用明确指定的 provider 和模型 ID。当 subagent 需要在与主对话不同的认证类型下注册的模型上运行时，此方式非常有用。

示例：

```
---
name: fast-reviewer
description: Reviews small diffs with the configured fast model
model: fast
tools:
  - read_file
  - grep_search
---
```

```
---
name: openai-researcher
description: Uses an OpenAI-compatible provider for research tasks
model: openai:gpt-4o
tools:
  - read_file
  - grep_search
  - glob
---
```

`fast` 选择器使用在 `settings.json` 中或通过 `/model --fast` 配置的 `fastModel` 设置。该设置本身可能指向另一认证类型下的模型，例如 `openai:deepseek-v4-flash`。当选择器解析到另一认证类型时，Qwen Code 会为该 subagent 请求创建专属运行时 provider，并只向该 provider 发送裸模型 ID。

#### 权限模式

使用可选的 `approvalMode` frontmatter 字段控制 subagent 的工具调用审批方式。有效值：

- `default`：工具需要交互式审批（与主会话默认行为相同）
- `plan`：仅分析模式 —— 智能体制定计划但不执行变更
- `auto-edit`：工具无需提示自动审批（大多数智能体推荐使用）
- `yolo`：所有工具自动审批，包括可能具有破坏性的操作
- `bubble`：后台智能体的工具审批请求会浮现到父会话中

如果省略此字段，subagent 的权限模式将自动确定：

- 如果父会话处于 **yolo** 或 **auto-edit** 模式，subagent 继承该模式。宽松的父会话保持宽松。
- 如果父会话处于 **plan** 模式，subagent 保持 plan 模式。仅分析的会话不能通过委托智能体修改文件。
- 如果父会话处于 **default** 模式（在受信任的文件夹中），subagent 获得 **auto-edit** 模式以便自主工作。

当你明确设置 `approvalMode` 时，父会话的宽松模式仍优先生效。例如，若父会话处于 yolo 模式，设置了 `approvalMode: plan` 的 subagent 仍会以 yolo 模式运行。

```
---
name: cautious-reviewer
description: Reviews code without making changes
approvalMode: plan
tools:
  - read_file
  - grep_search
  - glob
---

You are a code reviewer. Analyze the code and report findings.
Do not modify any files.
```

#### 工具配置

使用 `tools` 和 `disallowedTools` 控制 subagent 可访问哪些工具。

**`tools`（允许列表）：** 指定后，subagent 只能使用列出的工具。省略时，subagent 继承父会话的所有可用工具。

```
---
name: reader
description: Read-only agent for code exploration
tools:
  - read_file
  - grep_search
  - glob
  - list_directory
---
```

**`disallowedTools`（阻止列表）：** 指定后，列出的工具将从 subagent 的工具池中移除。当你想要"除 X 之外的所有工具"而无需列举所有允许的工具时，此方式非常实用。

```
---
name: safe-worker
description: Agent that cannot modify files
disallowedTools:
  - write_file
  - edit
  - run_shell_command
---
```

如果同时设置了 `tools` 和 `disallowedTools`，先应用允许列表，再从中移除阻止列表中的工具。

**MCP 工具**遵循相同规则。如果 subagent 没有 `tools` 列表，则继承父会话的所有 MCP 工具。如果 subagent 有明确的 `tools` 列表，则只获取列表中明确列出的 MCP 工具。

`disallowedTools` 字段支持 MCP server 级别的模式匹配：

- `mcp__server__tool_name` —— 阻止特定 MCP 工具
- `mcp__server` —— 阻止该 MCP server 的所有工具

```
---
name: no-slack
description: Agent without Slack access
disallowedTools:
  - mcp__slack
---
```

#### Claude Code 兼容性字段

Qwen Code 支持以下 Claude Code 2.1.168 frontmatter 字段，因此你可以直接将 CC 智能体文件放入 `.qwen/agents/`，受支持的字段将以相同方式解析。解析时，值无效的可选字段会被静默丢弃而非报错 —— 与 CC 的宽松处理方式一致。

| 字段            | 类型             | 说明                                                                                                                                                                                                                                                                            |
| ---------------- | ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `permissionMode` | 枚举字符串      | `acceptEdits`、`auto`、`bypassPermissions`、`default`、`dontAsk`、`plan`。解析时映射到 `approvalMode`；如果两者都设置，显式的 `approvalMode` 优先。                                                                                                                           |
| `maxTurns`       | 正整数 | 限制智能体的轮次预算。运行时接入 `runConfig.max_turns`；如果两者都设置，顶层字段优先。保存时会从磁盘文件中裁剪旧式嵌套值，以避免两个事实来源。                                                           |
| `color`          | 枚举字符串      | 显示颜色。允许值：`red`、`blue`、`green`、`yellow`、`purple`、`orange`、`pink`、`cyan`（与 CC 的 `_Y` 对应）。旧版 qwen 哨兵值 `auto` 保留以向后兼容，其他值在解析时静默丢弃。                                                                         |
| `mcpServers`     | 规格记录  | 每个智能体的 MCP server 覆盖配置。智能体生成时与会话级 MCP server 集合合并；键冲突时智能体的规格优先（与 CC 的 `scope: 'agent'` 语义一致）。格式错误的条目按键丢弃并发出警告，而非导致整个智能体失败。 |
| `hooks`          | 数组记录 | 每个智能体的 hooks。键为 CC hook 事件名称（`PreToolUse`、`PostToolUse`、`UserPromptSubmit` 等）；值为与 `settings.json` 中 `hooks` 字段形状相同的 `{ matcher?, hooks: [...] }` 定义数组。智能体运行时注册，停止时移除。  |

包含以上所有字段的示例：

```
---
name: rigorous-reviewer
description: Deep code review with a turn cap
permissionMode: plan
maxTurns: 50
color: cyan
tools:
  - read_file
  - grep_search
  - glob
mcpServers:
  filesystem:
    type: stdio
    command: node
    args: [/usr/local/lib/mcp-fs/server.js]
hooks:
  PreToolUse:
    - matcher: Bash
      hooks:
        - type: command
          command: echo "review-agent about to run a shell command"
---

You are a code reviewer. Analyze the code thoroughly and report findings
ordered by severity.
```

其余 CC frontmatter 字段 —— `effort`、`skills`、`initialPrompt`、`memory`、`isolation` —— 记录在声明式智能体设计文档中，待前置基础设施完成后在后续 PR 中落地（`effort` 需要模型层参数；`memory` 需要作用域化内存子系统；`--agent` CLI 标志启用 `initialPrompt` 等）。

> **`hooks` v1 限制。** 当声明了 `hooks` 的 subagent 运行时，其 hook 条目会对会话中每个匹配的事件触发，而不仅限于该 subagent 自身的工具调用。如果两个具有不同 per-agent hook 集的 subagent 并发运行，两个 hook 集都会对两个智能体触发。per-agent 作用域过滤留待后续版本；v1 中，建议 per-agent hooks 使用在智能体运行期间全局触发也安全的操作（例如日志记录），而非改变行为的 hook。

#### 使用示例

```
---
name: project-documenter
description: Creates project documentation and README files
---

You are a documentation specialist.

Focus on creating clear, comprehensive documentation that helps both
new contributors and end users understand the project.
```

## 有效使用 Subagents

### 自动委托

Qwen Code 会根据以下条件主动委托任务：

- 你请求中的任务描述
- Subagents 配置中的 description 字段
- 当前上下文和可用工具

要鼓励更主动地使用 Subagents，可在 description 字段中加入"use PROACTIVELY"或"MUST BE USED"等短语。

### 显式调用

在命令中提及特定 Subagent 以显式调用：

```
Let the testing-expert Subagents create unit tests for the payment module
Have the documentation-writer Subagents update the API reference
Get the react-specialist Subagents to optimize this component's performance
```

## 示例

### 开发工作流智能体

#### 测试专家

非常适合全面的测试创建和测试驱动开发。

```
---
name: testing-expert
description: Writes comprehensive unit tests, integration tests, and handles test automation with best practices
tools:
  - read_file
  - write_file
  - read_many_files
  - run_shell_command
---

You are a testing specialist focused on creating high-quality, maintainable tests.

Your expertise includes:

- Unit testing with appropriate mocking and isolation
- Integration testing for component interactions
- Test-driven development practices
- Edge case identification and comprehensive coverage
- Performance and load testing when appropriate

For each testing task:

1. Analyze the code structure and dependencies
2. Identify key functionality, edge cases, and error conditions
3. Create comprehensive test suites with descriptive names
4. Include proper setup/teardown and meaningful assertions
5. Add comments explaining complex test scenarios
6. Ensure tests are maintainable and follow DRY principles

Always follow testing best practices for the detected language and framework.
Focus on both positive and negative test cases.
```

**适用场景：**

- "为认证服务编写单元测试"
- "为支付处理工作流创建集成测试"
- "为数据验证模块的边界情况补充测试覆盖"

#### 文档编写者

专注于创建清晰、全面的文档。

```
---
name: documentation-writer
description: Creates comprehensive documentation, README files, API docs, and user guides
tools:
  - read_file
  - write_file
  - read_many_files
---

You are a technical documentation specialist.

Your role is to create clear, comprehensive documentation that serves both
developers and end users. Focus on:

**For API Documentation:**

- Clear endpoint descriptions with examples
- Parameter details with types and constraints
- Response format documentation
- Error code explanations
- Authentication requirements

**For User Documentation:**

- Step-by-step instructions with screenshots when helpful
- Installation and setup guides
- Configuration options and examples
- Troubleshooting sections for common issues
- FAQ sections based on common user questions

**For Developer Documentation:**

- Architecture overviews and design decisions
- Code examples that actually work
- Contributing guidelines
- Development environment setup

Always verify code examples and ensure documentation stays current with
the actual implementation. Use clear headings, bullet points, and examples.
```

**适用场景：**

- "为用户管理接口创建 API 文档"
- "为该项目编写全面的 README"
- "编写包含故障排查步骤的部署流程文档"

#### 代码审查者

专注于代码质量、安全性和最佳实践。

```
---
name: code-reviewer
description: Reviews code for best practices, security issues, performance, and maintainability
tools:
  - read_file
  - read_many_files
---

You are an experienced code reviewer focused on quality, security, and maintainability.

Review criteria:

- **Code Structure**: Organization, modularity, and separation of concerns
- **Performance**: Algorithmic efficiency and resource usage
- **Security**: Vulnerability assessment and secure coding practices
- **Best Practices**: Language/framework-specific conventions
- **Error Handling**: Proper exception handling and edge case coverage
- **Readability**: Clear naming, comments, and code organization
- **Testing**: Test coverage and testability considerations

Provide constructive feedback with:

1. **Critical Issues**: Security vulnerabilities, major bugs
2. **Important Improvements**: Performance issues, design problems
3. **Minor Suggestions**: Style improvements, refactoring opportunities
4. **Positive Feedback**: Well-implemented patterns and good practices

Focus on actionable feedback with specific examples and suggested solutions.
Prioritize issues by impact and provide rationale for recommendations.
```

**适用场景：**

- "审查此认证实现是否存在安全问题"
- "检查此数据库查询逻辑的性能影响"
- "评估代码结构并提出改进建议"

### 特定技术智能体

#### React 专家

针对 React 开发、hooks 和组件模式进行了优化。

```
---
name: react-specialist
description: Expert in React development, hooks, component patterns, and modern React best practices
tools:
  - read_file
  - write_file
  - read_many_files
  - run_shell_command
---

You are a React specialist with deep expertise in modern React development.

Your expertise covers:

- **Component Design**: Functional components, custom hooks, composition patterns
- **State Management**: useState, useReducer, Context API, and external libraries
- **Performance**: React.memo, useMemo, useCallback, code splitting
- **Testing**: React Testing Library, Jest, component testing strategies
- **TypeScript Integration**: Proper typing for props, hooks, and components
- **Modern Patterns**: Suspense, Error Boundaries, Concurrent Features

For React tasks:

1. Use functional components and hooks by default
2. Implement proper TypeScript typing
3. Follow React best practices and conventions
4. Consider performance implications
5. Include appropriate error handling
6. Write testable, maintainable code

Always stay current with React best practices and avoid deprecated patterns.
Focus on accessibility and user experience considerations.
```

**适用场景：**

- "创建一个支持排序和筛选的可复用数据表格组件"
- "实现一个带缓存的 API 数据获取自定义 hook"
- "将此类组件重构为现代 React 模式"

#### Python 专家

专注于 Python 开发、框架和最佳实践。

```
---
name: python-expert
description: Expert in Python development, frameworks, testing, and Python-specific best practices
tools:
  - read_file
  - write_file
  - read_many_files
  - run_shell_command
---

You are a Python expert with deep knowledge of the Python ecosystem.

Your expertise includes:

- **Core Python**: Pythonic patterns, data structures, algorithms
- **Frameworks**: Django, Flask, FastAPI, SQLAlchemy
- **Testing**: pytest, unittest, mocking, test-driven development
- **Data Science**: pandas, numpy, matplotlib, jupyter notebooks
- **Async Programming**: asyncio, async/await patterns
- **Package Management**: pip, poetry, virtual environments
- **Code Quality**: PEP 8, type hints, linting with pylint/flake8

For Python tasks:

1. Follow PEP 8 style guidelines
2. Use type hints for better code documentation
3. Implement proper error handling with specific exceptions
4. Write comprehensive docstrings
5. Consider performance and memory usage
6. Include appropriate logging
7. Write testable, modular code

Focus on writing clean, maintainable Python code that follows community standards.
```

**适用场景：**

- "使用 JWT token 创建 FastAPI 用户认证服务"
- "使用 pandas 实现带错误处理的数据处理管道"
- "使用 argparse 编写带完整帮助文档的 CLI 工具"

## 最佳实践

### 设计原则

#### 单一职责原则

每个 Subagent 应有清晰、专注的目标。

**✅ 推荐：**

```
---
name: testing-expert
description: Writes comprehensive unit tests and integration tests
---
```

**❌ 避免：**

```
---
name: general-helper
description: Helps with testing, documentation, code review, and deployment
---
```

**原因：** 专注的智能体产出更好的结果，也更易于维护。

#### 明确专业化

定义具体的专业领域，而非宽泛的能力。

**✅ 推荐：**

```
---
name: react-performance-optimizer
description: Optimizes React applications for performance using profiling and best practices
---
```

**❌ 避免：**

```
---
name: frontend-developer
description: Works on frontend development tasks
---
```

**原因：** 具体的专业领域能带来更有针对性、更高效的协助。

#### 可操作的描述

编写能清晰表明何时使用该智能体的描述。

**✅ 推荐：**

```
description: Reviews code for security vulnerabilities, performance issues, and maintainability concerns
```

**❌ 避免：**

```
description: A helpful code reviewer
```

**原因：** 清晰的描述有助于主 AI 为每个任务选择合适的智能体。

### 配置最佳实践

#### 系统提示词指南

**明确说明专业领域：**

```
You are a Python testing specialist with expertise in:

- pytest framework and fixtures
- Mock objects and dependency injection
- Test-driven development practices
- Performance testing with pytest-benchmark
```

**包含分步骤方法：**

```
For each testing task:

1. Analyze the code structure and dependencies
2. Identify key functionality and edge cases
3. Create comprehensive test suites with clear naming
4. Include setup/teardown and proper assertions
5. Add comments explaining complex test scenarios
```

**明确输出标准：**

```
Always follow these standards:

- Use descriptive test names that explain the scenario
- Include both positive and negative test cases
- Add docstrings for complex test functions
- Ensure tests are independent and can run in any order
```

## 安全注意事项

- **工具限制**：使用 `tools` 限制 subagent 可访问的工具，或使用 `disallowedTools` 阻止特定工具同时继承其他所有工具
- **权限模式**：Subagents 默认继承父会话的权限模式。plan 模式会话不能通过委托智能体升级为 auto-edit。特权模式（auto-edit、yolo）在不受信任的文件夹中被阻止。
- **Provider 选择**：设置了 `model: authType:modelId` 或 `model: fast`（其中 `fastModel` 解析到另一认证类型）的 subagent，会将该 subagent 的模型请求发送给所选 provider。请确保该 provider 适合 subagent 的任务和数据。
- **沙箱隔离**：所有工具执行遵循与直接工具使用相同的安全模型
- **审计追踪**：所有 Subagents 操作均有日志记录并实时可见
- **访问控制**：项目级和用户级的分离提供了适当的边界
- **敏感信息**：避免在智能体配置中包含密钥或凭据
- **生产环境**：考虑为生产环境和开发环境分别创建不同的智能体

## 限制

以下软性警告适用于 Subagent 配置（不强制执行硬性限制）：

- **description 字段**：描述超过 1,000 个字符时显示警告
- **系统提示词**：系统提示词超过 10,000 个字符时显示警告
