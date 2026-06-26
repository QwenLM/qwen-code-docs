# 子代理

子代理是专门化的 AI 助手，在 Qwen Code 中处理特定类型的任务。它们允许你将聚焦的工作委托给配置了特定提示词、工具和行为的 AI 代理。

## 什么是子代理？

子代理是独立的 AI 助手，具有以下特点：

- **专精于特定任务** — 每个子代理都配置了针对特定工作类型的聚焦系统提示词
- **拥有独立的上下文** — 它们维护自己的对话历史，与你的主对话分离
- **使用受控的工具** — 你可以配置每个子代理可以访问哪些工具
- **自主工作** — 一旦分派任务，它们会独立工作直到完成或失败
- **提供详细反馈** — 你可以实时查看它们的进度、工具使用和执行统计

## Fork 子代理

除了命名的子代理外，Qwen Code 还支持 **fork** — 通过显式指定 `subagent_type: "fork"` 来选择（在交互式会话中可用）。Fork 继承父对话的完整上下文，并在后台分离运行。省略 `subagent_type` 则 **不会** 创建 fork；它会启动通用子代理，运行至完成并直接返回结果。

### Fork 与命名子代理的区别

|              | 命名子代理                          | Fork 子代理                                          |
| ------------ | ----------------------------------- | ----------------------------------------------------- |
| 上下文       | 全新开始，无父对话历史              | 继承父对话的完整对话历史                              |
| 系统提示词   | 使用自身配置的提示词                | 使用父对话的精确系统提示词（用于缓存共享）            |
| 执行方式     | 阻塞父对话直到完成                  | 在后台运行，父对话可立即继续                          |
| 使用场景     | 专门化任务（测试、文档）            | 需要当前上下文的并行任务                              |

### 何时使用 Fork

AI 在需要以下场景时自动使用 fork：

- 并行执行多个研究任务（例如：“调查模块 A、B 和 C”）
- 在继续主对话的同时进行后台工作
- 委派需要理解当前对话上下文的任务

### 提示缓存共享

所有 fork 共享父对话的精确 API 请求前缀（系统提示词、工具、对话历史），从而实现 DashScope 提示缓存命中。当 3 个 fork 并行运行时，共享前缀被缓存一次并重用 — 相比独立子代理可节省 80%+ 的 token 成本。

### 递归 Fork 阻止

Fork 子节点不能创建进一步的 fork。这在运行时强制执行 — 如果某个 fork 尝试生成另一个 fork，它会收到错误指示其直接执行任务。

### 当前限制

- **无结果反馈**：Fork 的结果会在 UI 进度显示中反映，但不会自动回传到主对话。父 AI 会看到占位消息，无法对 fork 的输出做出反应。
- **无工作树隔离**：Fork 共享父对话的工作目录。多个 fork 的并发文件修改可能产生冲突。

## 主要优势

- **任务专门化**：创建针对特定工作流优化（测试、文档、重构等）的代理
- **上下文隔离**：将专门化工作与主对话分离
- **上下文继承**：Fork 子代理继承完整对话以处理上下文密集的并行任务
- **提示缓存共享**：Fork 子代理共享父对话的缓存前缀，降低 token 成本
- **可重用性**：跨项目和会话保存和重用代理配置
- **受控访问**：限制每个代理可使用的工具，以确保安全和专注
- **进度可见性**：通过实时进度更新监控代理执行

## 子代理如何工作

1. **配置**：你创建子代理配置，定义其行为、工具和系统提示词
2. **委派**：主 AI 可以自动将任务委派给合适的子代理 — 或者 fork 自身（`subagent_type: "fork"`），当它希望继承完整对话上下文并丢弃中间输出时
3. **执行**：子代理独立工作，使用其配置的工具完成任务
4. **结果**：它们将结果和执行摘要返回给主对话

## 入门指南

### 快速开始

1. **创建你的第一个子代理**：

   `/agents create`

   按照引导向导创建一个专门化的代理。

2. **管理现有代理**：

   `/agents manage`

   查看和管理你配置的子代理。

3. **自动使用子代理**：只需让主 AI 执行与子代理专长匹配的任务。AI 会自动委派合适的工作。

### 使用示例

```
用户：“请为认证模块编写全面的测试”
AI：我将把这个任务委派给你的测试专家子代理。
[委派给“testing-expert”子代理]
[显示测试创建过程的实时进度]
[返回完成的测试文件和执行摘要]
```

## 管理

### CLI 命令

子代理通过 `/agents` 斜杠命令及其子命令管理：

**用法：** `/agents create`。通过引导步骤向导创建新的子代理。

**用法：** `/agents manage`。打开交互式管理对话框，用于查看和管理现有子代理。

### 存储位置

子代理以 Markdown 文件形式存储在多个位置：

- **项目级**：`.qwen/agents/`（最高优先级）
- **用户级**：`~/.qwen/agents/`（回退）
- **扩展级**：由已安装的扩展提供

这允许你拥有项目特定的代理、跨所有项目工作的个人代理，以及提供专门化能力的扩展代理。

### 扩展子代理

扩展可以提供自定义子代理，当扩展启用时这些代理变为可用。这些代理存储在扩展的 `agents/` 目录中，并遵循与个人代理和项目代理相同的格式。

扩展子代理：

- 在扩展启用时自动被发现
- 在 `/agents manage` 对话框的“扩展代理”部分显示
- 不能直接编辑（改为编辑扩展源）
- 遵循与用户定义代理相同的配置格式

要查看哪些扩展提供了子代理，请检查扩展的 `qwen-extension.json` 文件中的 `agents` 字段。

### 文件格式

子代理使用带有 YAML frontmatter 的 Markdown 文件进行配置。这种格式易于阅读，并可用任何文本编辑器编辑。

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

使用可选的 `model` frontmatter 字段来控制子代理使用的模型：

- `inherit`：使用与主对话相同的模型。
- 省略该字段：等同于 `inherit`。
- `fast`：使用配置的 `fastModel`。如果未配置有效的 fast 模型，子代理回退到 `inherit`。
- `glm-5`：使用该模型 ID。Qwen Code 首先检查主对话的认证类型；如果该模型在那里不可用，它可以从其他配置的提供者解析模型。
- `openai:gpt-4o`：使用显式的提供者和模型 ID。这在你希望子代理运行在注册了不同认证类型（与主对话不同）的模型上时很有用。

例如：

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

`fast` 选择器使用与 `settings.json` 中使用 `/model --fast` 配置的相同 `fastModel` 设置。该设置本身可能引用了另一个已配置认证类型下的模型，例如 `openai:deepseek-v4-flash`。当选择器解析到另一个认证类型时，Qwen Code 会为该子代理请求创建一个专用的运行时提供者，并仅向该提供者发送裸模型 ID。

#### 权限模式

使用可选的 `approvalMode` frontmatter 字段来控制子代理工具调用的批准方式。有效值：

- `default`：工具需要交互式批准（与主会话默认值相同）
- `plan`：仅分析模式 — 代理计划但不执行更改
- `auto-edit`：工具自动批准，无需提示（推荐用于大多数代理）
- `yolo`：所有工具自动批准，包括可能具有破坏性的工具
- `bubble`：后台代理工具批准会显示在父会话中

如果你省略此字段，子代理的权限模式会自动确定：

- 如果父会话处于 **yolo** 或 **auto-edit** 模式，子代理继承该模式。宽松的父会话保持宽松。
- 如果父会话处于 **plan** 模式，子代理保持 plan 模式。仅分析的会话无法通过委托的代理修改文件。
- 如果父会话处于 **default** 模式（在受信任的文件夹中），子代理获得 **auto-edit**，以便它可以自主工作。

当你显式设置 `approvalMode` 时，父会话的宽松模式仍然优先。例如，如果父会话处于 yolo 模式，则设置 `approvalMode: plan` 的子代理仍将以 yolo 模式运行。

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

使用 `tools` 和 `disallowedTools` 来控制子代理可以访问哪些工具。

**`tools`（允许列表）：** 当指定时，子代理只能使用列出的工具。当省略时，子代理继承父会话的所有可用工具。

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

**`disallowedTools`（阻止列表）：** 当指定时，列出的工具从子代理的工具池中移除。这在你想“除了 X 以外的所有工具”而不必列出每个允许的工具时很有用。

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

如果同时设置了 `tools` 和 `disallowedTools`，则先应用允许列表，然后通过阻止列表从该集合中移除。

**MCP 工具**遵循相同的规则。如果子代理没有 `tools` 列表，则继承父会话的所有 MCP 工具。如果子代理有显式的 `tools` 列表，则只获得该列表中明确命名的 MCP 工具。

`disallowedTools` 字段支持 MCP 服务器级别的模式：

- `mcp__server__tool_name` — 阻止特定的 MCP 工具
- `mcp__server` — 阻止来自该 MCP 服务器的所有工具

```
---
name: no-slack
description: Agent without Slack access
disallowedTools:
  - mcp__slack
---
```

#### Claude Code 兼容性字段

Qwen Code 接受以下 Claude Code 2.1.168 frontmatter 字段，因此你可以将 CC 代理文件放入 `.qwen/agents/` 中，并让支持的字段以相同方式解析。可选字段若值无效会在解析时静默丢弃，而不是拒绝 — 与 CC 使用的宽松态度相同。

| 字段              | 类型             | 说明                                                                                                                                                                                                                                                                            |
| ----------------- | ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `permissionMode`  | 枚举字符串       | `acceptEdits`, `auto`, `bypassPermissions`, `default`, `dontAsk`, `plan`。在解析时映射到 `approvalMode`；当两者都设置时，显式的 `approvalMode` 胜出。                                                                                                                           |
| `maxTurns`        | 正整数           | 限制代理的轮次预算。在运行时绑定到 `runConfig.max_turns`；当两者都设置时，顶层字段胜出。在保存时，从磁盘文件中修剪掉遗留的嵌套值，以避免两个事实来源。                                                                                                                           |
| `color`           | 枚举字符串       | 显示颜色。允许列表：`red`, `blue`, `green`, `yellow`, `purple`, `orange`, `pink`, `cyan`（镜像 CC 的 `_Y`）。为向后兼容保留遗留的 qwen 哨兵值 `auto`。其他值在解析时静默丢弃。                                                                                               |
| `mcpServers`      | 规范记录         | 每个代理的 MCP 服务器覆盖。在代理启动时与会话级别的 MCP 服务器集合合并；键冲突时代理的规范胜出（匹配 CC 的 `scope: 'agent'` 语义）。格式错误的条目会按键丢弃并给出警告，而不是导致整个代理失败。                                                                                |
| `hooks`           | 数组记录         | 每个代理的钩子。键是 CC 钩子事件名称（`PreToolUse`, `PostToolUse`, `UserPromptSubmit`, …）；值是 `{ matcher?, hooks: [...] }` 定义的数组，形状与 `settings.json` 的 `hooks` 字段相同。在代理运行时注册，代理停止时移除。                                                        |

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

剩余的 CC frontmatter 字段 — `effort`, `skills`, `initialPrompt`, `memory`, `isolation` — 已在声明式代理设计文档中记录，并在后续的 PR 中落地，前提是所需的基础设施已存在（`effort` 需要模型层参数；`memory` 需要作用域化的内存子系统；`--agent` CLI 标志启用 `initialPrompt`；等等）。

> **`hooks` v1 限制。** 当声明了 `hooks` 的子代理正在运行时，其钩子条目会为会话中每个匹配的事件触发，而不仅仅是该子代理自身的工具调用。如果两个具有不同按代理钩子集的子代理同时运行，两个集合都会为两个代理触发。按代理的作用域过滤（在钩子触发时）留给后续实现；对于 v1，建议优先使用在代理运行期间全局触发也是安全的按代理钩子（例如日志记录），而不是那些改变行为的钩子。

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

## 有效使用子代理

### 自动委派

Qwen Code 会根据以下因素主动委派任务：

- 你请求中的任务描述
- 子代理配置中的 `description` 字段
- 当前上下文和可用工具

要鼓励更主动地使用子代理，可以在 `description` 字段中包含诸如“主动使用”或“必须使用”之类的短语。

### 显式调用

通过在命令中提及特定子代理来请求它：

```
让 testing-expert 子代理为支付模块创建单元测试
让 documentation-writer 子代理更新 API 参考
让 react-specialist 子代理优化此组件的性能
```

## 示例

### 开发工作流代理

#### 测试专员

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

**使用场景：**

- “为认证服务编写单元测试”
- “为支付处理工作流创建集成测试”
- “为数据验证模块的边缘情况添加测试覆盖”

#### 文档撰写者

专精于创建清晰、全面的文档。

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

**使用场景：**

- “为用户管理端点创建 API 文档”
- “为此项目编写全面的 README”
- “记录包含故障排除步骤的部署过程”

#### 代码评审者

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
**使用场景：**

- "审查此认证实现是否存在安全问题"
- "检查此数据库查询逻辑的性能影响"
- "评估代码结构并提出改进建议"

### 特定技术子智能体

#### React 专家

针对 React 开发、Hooks 和组件模式进行了优化。

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

**使用场景：**

- "创建一个带有排序和筛选功能的可复用数据表格组件"
- "实现一个用于 API 数据获取并带有缓存功能的自定义 Hook"
- "将此 class 组件重构为使用现代 React 模式"

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

**使用场景：**

- "创建一个使用 JWT 令牌进行用户认证的 FastAPI 服务"
- "实现一个使用 pandas 并带有错误处理的数据处理管道"
- "编写一个使用 argparse 并带有完整帮助文档的 CLI 工具"

## 最佳实践

### 设计原则

#### 单一职责原则

每个子智能体应有清晰、专注的用途。

**✅ 好：**

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

**原因：** 专注的智能体产出更好的结果，且更易于维护。

#### 清晰的专长领域

定义具体的专业领域，而非宽泛的能力。

**✅ 好：**

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

**原因：** 具体的专长能带来更有针对性、更有效的帮助。

#### 可操作的描述

编写能清晰表明何时使用该智能体的描述。

**✅ 好：**

```
description: Reviews code for security vulnerabilities, performance issues, and maintainability concerns
```

**❌ 避免：**

```
description: A helpful code reviewer
```

**原因：** 清晰的描述有助于主AI为每个任务选择正确的智能体。

### 配置最佳实践

#### 系统提示词指南

**明确说明专长领域：**

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

**指定输出标准：**

```
Always follow these standards:

- Use descriptive test names that explain the scenario
- Include both positive and negative test cases
- Add docstrings for complex test functions
- Ensure tests are independent and can run in any order
```

## 安全考虑

- **工具限制**：使用 `tools` 限制子智能体可以访问的工具，或使用 `disallowedTools` 阻止特定工具，同时继承其他所有工具。
- **权限模式**：子智能体默认继承其父级的权限模式。计划模式下的会话不能通过委派给其他智能体升级为自动编辑模式。在不受信任的文件夹中，特权模式（自动编辑、yolo）将被阻止。
- **提供商选择**：子智能体配置了 `model: authType:modelId` 或 `model: fast`（其中 `fastModel` 解析为另一种认证类型）时，该子智能体的模型请求将发送给所选提供商。请确保提供商适合子智能体的任务和数据。
- **沙箱**：所有工具执行遵循与直接使用工具相同的安全模型。
- **审计追踪**：所有子智能体的操作都会记录并可实时查看。
- **访问控制**：项目和用户级别的分离提供了适当的边界。
- **敏感信息**：避免在智能体配置中包含密钥或凭据。
- **生产环境**：考虑为生产环境与开发环境分别设置不同的智能体。

## 限制

以下是对子智能体配置的软性警告（不强制执行硬性限制）：

- **描述字段**：描述超过 1,000 个字符时显示警告。
- **系统提示词**：系统提示词超过 10,000 个字符时显示警告。