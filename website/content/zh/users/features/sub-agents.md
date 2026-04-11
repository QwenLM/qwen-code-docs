# Subagent

Subagent 是 Qwen Code 中专用于处理特定类型任务的 AI 助手。你可以将专注性工作委托给配置了特定任务提示词、工具和行为的 AI 代理。

## 什么是 Subagent？

Subagent 是独立的 AI 助手，具备以下特性：

- **专注特定任务** - 每个 Subagent 都配置了针对特定工作类型的专用 system prompt
- **独立上下文** - 它们维护自己的对话历史，与主聊天窗口隔离
- **受控工具访问** - 你可以配置每个 Subagent 可使用的工具
- **自主运行** - 接收任务后，它们会独立工作直至完成或失败
- **提供详细反馈** - 你可以实时查看其进度、工具使用情况和执行统计信息

## 核心优势

- **任务专精**：创建针对特定工作流（测试、文档、重构等）优化的代理
- **上下文隔离**：将专项工作与主对话隔离开
- **可复用性**：跨项目和会话保存并复用代理配置
- **访问控制**：限制每个代理可用的工具，以提升安全性和专注度
- **进度可见**：通过实时进度更新监控代理执行情况

## Subagent 工作原理

1. **配置**：创建 Subagent 配置，定义其行为、工具和 system prompt
2. **任务委派**：主 AI 可自动将任务委派给合适的 Subagent
3. **执行**：Subagent 独立工作，使用配置的工具完成任务
4. **结果返回**：将结果和执行摘要返回给主对话

## 快速上手

### 快速开始

1. **创建你的第一个 Subagent**：

   `/agents create`

   按照引导向导创建专用代理。

2. **管理现有代理**：

   `/agents manage`

   查看和管理已配置的 Subagent。

3. **自动使用 Subagent**：只需让主 AI 执行与你的 Subagent 专长匹配的任务。AI 会自动委派合适的工作。

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

Subagent 通过 `/agents` 斜杠命令及其子命令进行管理：

**用法**：`/agents create`。通过分步引导向导创建新的 Subagent。

**用法**：`/agents manage`。打开交互式管理对话框，用于查看和管理现有 Subagent。

### 存储位置

Subagent 以 Markdown 文件形式存储在多个位置：

- **项目级**：`.qwen/agents/`（优先级最高）
- **用户级**：`~/.qwen/agents/`（回退路径）
- **扩展级**：由已安装的扩展提供

这使你能够拥有项目专属代理、跨所有项目使用的个人代理，以及提供专项能力的扩展代理。

### 扩展 Subagent

扩展可以提供自定义 Subagent，在启用扩展时即可使用。这些代理存储在扩展的 `agents/` 目录中，格式与个人和项目代理相同。

扩展 Subagent：

- 启用扩展时自动发现
- 在 `/agents manage` 对话框的 "Extension Agents" 部分显示
- 无法直接编辑（需修改扩展源码）
- 遵循与用户定义代理相同的配置格式

要查看哪些扩展提供了 Subagent，请检查扩展的 `qwen-extension.json` 文件中的 `agents` 字段。

### 文件格式

Subagent 使用带有 YAML frontmatter 的 Markdown 文件进行配置。该格式易于阅读，且可使用任何文本编辑器轻松修改。

#### 基本结构

```
---
name: agent-name
description: Brief description of when and how to use this agent
model: inherit # Optional: inherit or model-id
tools:
	- tool1
	- tool2
	- tool3 # Optional
---

System prompt content goes here.
Multiple paragraphs are supported.
```

#### 模型选择

使用可选的 `model` frontmatter 字段控制 Subagent 使用的模型：

- `inherit`：使用与主对话相同的模型
- 省略该字段：等同于 `inherit`
- `glm-5`：使用该模型 ID，并沿用主对话的认证类型
- `openai:gpt-4o`：使用其他提供商（从环境变量解析凭证）

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

## 高效使用 Subagent

### 自动委派

Qwen Code 会根据以下信息主动委派任务：

- 请求中的任务描述
- Subagent 配置中的 `description` 字段
- 当前上下文和可用工具

若要鼓励更主动地使用 Subagent，可在 `description` 字段中加入 "use PROACTIVELY" 或 "MUST BE USED" 等短语。

### 显式调用

在指令中明确提及即可调用特定的 Subagent：

```
Let the testing-expert Subagents create unit tests for the payment module
Have the documentation-writer Subagents update the API reference
Get the react-specialist Subagents to optimize this component's performance
```

## 示例

### 开发工作流代理

#### 测试专家

非常适合全面的测试创建和测试驱动开发（TDD）。

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

- “为认证服务编写单元测试”
- “为支付处理工作流创建集成测试”
- “为数据验证模块的边界情况补充测试覆盖”

#### 文档编写专家

专注于创建清晰、全面的文档。

```
---
name: documentation-writer
description: Creates comprehensive documentation, README files, API docs, and user guides
tools:
  - read_file
  - write_file
  - read_many_files
  - web_search
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

- “为用户管理端点创建 API 文档”
- “为该项目编写全面的 README”
- “编写包含故障排除步骤的部署流程文档”

#### 代码审查专家

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

- “审查此认证实现的安全性问题”
- “检查此数据库查询逻辑的性能影响”
- “评估代码结构并提出改进建议”

### 技术专属代理

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

**适用场景：**

- “创建支持排序和过滤的可复用数据表格组件”
- “实现带缓存功能的 API 数据获取自定义 Hook”
- “将此 Class 组件重构为现代 React 模式”

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

- “创建基于 JWT 令牌的用户认证 FastAPI 服务”
- “使用 pandas 实现带错误处理的数据处理管道”
- “使用 argparse 编写带完整帮助文档的 CLI 工具”

## 最佳实践

### 设计原则

#### 单一职责原则

每个 Subagent 都应有明确、专注的用途。

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

**原因**：专注的代理能产出更好的结果，且更易于维护。

#### 明确的专业领域

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

**原因**：明确的专业领域能带来更具针对性和高效的协助。

#### 可操作的描述

编写能清晰指示何时使用该代理的描述。

**✅ 推荐：**

```
description: Reviews code for security vulnerabilities, performance issues, and maintainability concerns
```

**❌ 避免：**

```
description: A helpful code reviewer
```

**原因**：清晰的描述有助于主 AI 为每个任务选择正确的代理。

### 配置最佳实践

#### System Prompt 编写指南

**明确专业能力：**

```
You are a Python testing specialist with expertise in:

- pytest framework and fixtures
- Mock objects and dependency injection
- Test-driven development practices
- Performance testing with pytest-benchmark
```

**包含分步执行方法：**

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

## 安全注意事项

- **工具限制**：Subagent 仅能访问其配置的工具
- **沙箱隔离**：所有工具执行均遵循与直接使用工具相同的安全模型
- **审计追踪**：所有 Subagent 操作均会被记录并实时可见
- **访问控制**：项目级和用户级隔离提供了适当的权限边界
- **敏感信息**：避免在代理配置中包含密钥或凭证
- **生产环境**：建议为生产环境和开发环境分别配置代理

## 限制

以下软性警告适用于 Subagent 配置（不强制执行硬性限制）：

- **Description 字段**：描述超过 1,000 个字符时将显示警告
- **System Prompt**：提示词超过 10,000 个字符时将显示警告