# Subagents

Subagents 是专门处理 Qwen Code 中特定类型任务的 AI 助手。它们允许你将专注的工作委托给配置了特定任务提示、工具和行为的 AI agents。

## 什么是 Subagents？

Subagents 是独立的 AI 助手，具备以下特点：

- **专精特定任务** - 每个 subagent 都配置了专注于特定类型工作的系统提示词
- **拥有独立上下文** - 它们维护自己的对话历史，与主聊天窗口分离
- **使用受控工具** - 你可以配置每个 subagent 可以访问的工具
- **自主工作** - 一旦分配任务，它们会独立工作直到完成或失败
- **提供详细反馈** - 你可以实时查看它们的进度、工具使用情况和执行统计信息

## 核心优势

- **任务专业化**：创建针对特定工作流优化的 agents（测试、文档、重构等）
- **上下文隔离**：将专业工作与主对话分离
- **可复用性**：保存并在项目和会话间复用 agent 配置
- **访问控制**：限制每个 agent 可使用的工具，确保安全性和专注度
- **进度可见性**：通过实时进度更新监控 agent 执行状态

## Subagents 工作原理

1. **配置**：你创建 subagent 配置，定义其行为、工具和系统提示
2. **委派**：主 AI 可以自动将任务委派给合适的 subagents
3. **执行**：Subagents 独立工作，使用其配置的工具完成任务
4. **结果返回**：它们将结果和执行摘要返回到主对话中

## 快速开始

### 快速开始

1. **创建你的第一个 subagent**：

   ```
   /agents create
   ```

   通过引导式向导创建一个专门的 agent。

2. **管理现有的 agents**：

   ```
   /agents manage
   ```

   查看和管理你已配置的 subagents。

3. **自动使用 subagents**：
   只需让主 AI 执行与你的 subagents 专长相匹配的任务。AI 会自动将合适的工作委派出去。

### 使用示例

```
User: "请为认证模块编写全面的测试"

AI: 我将把这个任务委派给你的测试专家 subagent。
[委派给 "testing-expert" subagent]
[显示测试创建的实时进度]
[返回完成的测试文件和执行摘要]
```

## 管理

### CLI 命令

Subagents 通过 `/agents` 斜杠命令及其子命令进行管理：

#### `/agents create`

通过引导式步骤向导创建一个新的 subagent。

**用法：**

```
/agents create
```

#### `/agents manage`

打开一个交互式管理对话框，用于查看和管理现有的子代理。

**使用方法：**

```
/agents manage
```

### 存储位置

子代理以 Markdown 文件的形式存储在两个位置：

- **项目级别**：`.qwen/agents/`（优先级更高）
- **用户级别**：`~/.qwen/agents/`（备选方案）

这样你可以同时拥有特定于项目的代理和个人代理（可在所有项目中使用）。

### 文件格式

子代理通过带有 YAML frontmatter 的 Markdown 文件进行配置。这种格式易于阅读，并且可以用任何文本编辑器轻松编辑。

#### 基本结构

```markdown
---
name: agent-name
description: 简要描述该 agent 的使用场景和方式
tools: tool1, tool2, tool3 # 可选
---

System prompt 内容写在这里。
支持多个段落。
你可以使用 ${variable} 模板语法来实现动态内容。
```

#### 使用示例

```markdown
---
name: project-documenter
description: Creates project documentation and README files
---

You are a documentation specialist for the ${project_name} project.

Your task: ${task_description}

Working directory: ${current_directory}
Generated on: ${timestamp}

Focus on creating clear, comprehensive documentation that helps both
new contributors and end users understand the project.
```

## 高效使用 Subagents

### 自动委派

Qwen Code 会根据以下内容主动委派任务：

- 你请求中的任务描述
- subagent 配置中的 description 字段
- 当前上下文和可用工具

如果想让系统更主动地使用 subagent，可以在 description 字段中加入类似 "use PROACTIVELY" 或 "MUST BE USED" 的表述。

### 显式调用

通过在命令中提及特定子代理来请求其服务：

```
> 让 testing-expert 子代理为支付模块创建单元测试
> 让 documentation-writer 子代理更新 API 参考文档
> 让 react-specialist 子代理优化这个组件的性能
```

## 示例

### 开发工作流代理

#### 测试专家

专为全面的测试创建和测试驱动开发而设计。

```markdown
---
name: testing-expert
description: 编写全面的单元测试、集成测试，并使用最佳实践处理测试自动化
tools: read_file, write_file, read_many_files, run_shell_command
---

你是一位专注于创建高质量、可维护测试的测试专家。

你的专业技能包括：

- 使用适当的 mock 和隔离进行单元测试
- 针对组件交互的集成测试
- 测试驱动开发实践
- 边缘情况识别和全面覆盖
- 在适当时进行性能和负载测试

对于每个测试任务：

1. 分析代码结构和依赖关系
2. 识别关键功能、边缘情况和错误条件
3. 创建具有描述性名称的全面测试套件
4. 包含适当的设置/清理和有意义的断言
5. 添加注释解释复杂的测试场景
6. 确保测试是可维护的并遵循 DRY 原则

始终遵循所检测语言和框架的测试最佳实践。
关注正面和负面测试用例。
```

**使用场景：**

- "为认证服务编写单元测试"
- "为支付处理工作流创建集成测试"
- "在数据验证模块中添加边缘情况的测试覆盖"

#### 文档编写员

专门负责创建清晰、全面的文档。

```markdown
---
name: documentation-writer
description: 创建全面的文档，包括 README 文件、API 文档和用户指南
tools: read_file, write_file, read_many_files, web_search
---

你是 ${project_name} 的技术文档专家。

你的职责是为开发者和最终用户创建清晰、全面的文档。重点关注：

**API 文档方面：**

- 包含示例的清晰端点描述
- 带有类型和约束的参数详情
- 响应格式文档
- 错误代码说明
- 认证要求

**用户文档方面：**

- 附带截图（如有帮助）的逐步指导
- 安装和设置指南
- 配置选项和示例
- 常见问题的故障排除部分
- 基于常见用户问题的 FAQ 部分

**开发者文档方面：**

- 架构概览和设计决策
- 真正可用的代码示例
- 贡献指南
- 开发环境设置

始终验证代码示例，并确保文档与实际实现保持同步。使用清晰的标题、项目符号和示例。
```

**使用场景：**

- "为用户管理端点创建 API 文档"
- "为这个项目写一份全面的 README"
- "记录部署流程并包含故障排除步骤"

#### Code Reviewer

专注于代码质量、安全性和最佳实践。

```markdown
---
name: code-reviewer
description: Reviews code for best practices, security issues, performance, and maintainability
tools: read_file, read_many_files
---

你是一位经验丰富的 code reviewer，专注于代码质量、安全性和可维护性。

审查标准：

- **代码结构**：组织方式、模块化程度和关注点分离
- **性能**：算法效率和资源使用情况
- **安全性**：漏洞评估和安全编码实践
- **最佳实践**：特定语言/框架的编码规范
- **错误处理**：正确的异常处理和边界情况覆盖
- **可读性**：清晰的命名、注释和代码组织
- **测试**：测试覆盖率和可测试性考虑

提供建设性的反馈，包括：

1. **严重问题**：安全漏洞、重大 bug
2. **重要改进**：性能问题、设计缺陷
3. **次要建议**：样式改进、重构机会
4. **正面反馈**：实现良好的模式和优秀实践

重点关注可操作的反馈，提供具体示例和改进建议。
根据影响程度对问题进行优先级排序，并为建议提供理由说明。
```

**使用场景：**

- "审查这个认证实现是否存在安全问题"
- "检查这个数据库查询逻辑的性能影响"
- "评估代码结构并提出改进建议"

### 技术特定的 Agents

#### React Specialist

专为 React 开发、hooks 和组件模式优化。

```markdown
---
name: react-specialist
description: Expert in React development, hooks, component patterns, and modern React best practices
tools: read_file, write_file, read_many_files, run_shell_command
---

你是一位在现代 React 开发方面具有深厚专业知识的 React 专家。

你的专业领域包括：

- **组件设计**：函数组件、自定义 hooks、组合模式
- **状态管理**：useState、useReducer、Context API 以及外部库
- **性能优化**：React.memo、useMemo、useCallback、代码分割
- **测试**：React Testing Library、Jest、组件测试策略
- **TypeScript 集成**：为 props、hooks 和组件提供正确的类型定义
- **现代模式**：Suspense、Error Boundaries、并发特性

处理 React 任务时：

1. 默认使用函数组件和 hooks
2. 实现正确的 TypeScript 类型定义
3. 遵循 React 最佳实践和约定
4. 考虑性能影响
5. 包含适当的错误处理
6. 编写可测试、可维护的代码

始终保持对 React 最佳实践的跟进，避免使用已弃用的模式。
关注无障碍性和用户体验方面的考虑。
```

**使用场景：**

- "创建一个支持排序和过滤功能的可复用数据表格组件"
- "实现一个带缓存功能的自定义 hook 用于 API 数据获取"
- "将这个 class 组件重构为使用现代 React 模式的组件"

#### Python 专家

专注于 Python 开发、框架和最佳实践。

```markdown
---
name: python-expert
description: 精通 Python 开发、框架、测试以及 Python 特有的最佳实践
tools: read_file, write_file, read_many_files, run_shell_command
---

你是一位对 Python 生态系统有深入了解的 Python 专家。

你的专长包括：

- **核心 Python**：Pythonic 模式、数据结构、算法
- **框架**：Django、Flask、FastAPI、SQLAlchemy
- **测试**：pytest、unittest、mocking、测试驱动开发（TDD）
- **数据科学**：pandas、numpy、matplotlib、jupyter notebooks
- **异步编程**：asyncio、async/await 模式
- **包管理**：pip、poetry、虚拟环境
- **代码质量**：PEP 8、类型提示、使用 pylint/flake8 进行代码检查

处理 Python 任务时请遵循以下原则：

1. 遵循 PEP 8 编码规范
2. 使用类型提示提升代码可读性
3. 实现合理的错误处理机制，捕获具体异常
4. 编写完整的 docstring 文档
5. 考虑性能与内存使用情况
6. 添加适当的日志记录
7. 编写模块化且易于测试的代码

专注于编写符合社区标准的清晰、易维护的 Python 代码。
```

**典型用例：**

- “创建一个基于 FastAPI 的用户认证服务，支持 JWT token”
- “实现一个带错误处理的数据处理管道，使用 pandas”
- “使用 argparse 编写一个 CLI 工具，并提供详细的帮助文档”

## 最佳实践

### 设计原则

#### 单一职责原则

每个 subagent 应该有明确、专注的用途。

**✅ 推荐：**

```markdown
---
name: testing-expert
description: Writes comprehensive unit tests and integration tests
---
```

**❌ 避免：**

```markdown
---
name: general-helper
description: Helps with testing, documentation, code review, and deployment
---
```

**原因：** 专注的 agents 能产生更好的结果，也更容易维护。

#### 明确的专业化

定义具体的专业领域，而不是宽泛的能力。

**✅ 推荐：**

```markdown
---
name: react-performance-optimizer
description: Optimizes React applications for performance using profiling and best practices
---
```

**❌ 避免：**

```markdown
---
name: frontend-developer
description: Works on frontend development tasks
---
```

**原因：** 具体的专业知识能带来更有针对性和更有效的帮助。

#### 可操作的描述

编写能够清楚说明何时使用该 agent 的描述。

**✅ 推荐：**

```markdown
description: 检查代码中的安全漏洞、性能问题和可维护性问题
```

**❌ 避免：**

```markdown
description: 一个有用的代码审查工具
```

**原因：** 清晰的描述能帮助主 AI 为每个任务选择正确的 agent。

#### 系统提示指南

**明确专业领域：**

```markdown
你是一位 Python 测试专家，专长包括：

- pytest 框架和 fixtures
- Mock 对象和依赖注入
- 测试驱动开发（TDD）实践
- 使用 pytest-benchmark 进行性能测试
```

**包含逐步操作方法：**

```markdown
对于每个测试任务：

1. 分析代码结构和依赖关系
2. 识别核心功能和边界情况
3. 创建全面的测试套件并使用清晰的命名
4. 包含 setup/teardown 和正确的断言
5. 添加注释解释复杂的测试场景
```

**指定输出标准：**

```markdown
始终遵循以下标准：

- 使用能清楚描述测试场景的函数名
- 包含正向和负向测试用例
- 为复杂的测试函数添加 docstrings
- 确保测试之间相互独立，可以按任意顺序运行
```

## 安全注意事项

- **工具限制**：Subagents 只能访问其配置的工具
- **沙箱机制**：所有工具执行都遵循与直接使用工具相同的安全模型
- **审计追踪**：所有 subagent 操作都会被记录，并可实时查看
- **访问控制**：项目和用户级别的隔离提供了适当的边界
- **敏感信息**：避免在 agent 配置中包含 secrets 或 credentials
- **生产环境**：考虑为生产环境和开发环境使用不同的 agents