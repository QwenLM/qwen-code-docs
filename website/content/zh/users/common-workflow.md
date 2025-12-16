# 常见工作流程

> 了解使用 Qwen Code 的常见工作流程。

本文档中的每个任务都包含清晰的说明、示例命令和最佳实践，帮助你充分利用 Qwen Code。

## 理解新代码库

### 快速了解代码库概览

假设你刚加入一个新项目，需要快速理解其结构。

**1. 导航到项目根目录**

```bash
cd /path/to/project
```

**2. 启动 Qwen Code**

```bash
qwen
```

**3. 请求高层次概览**

```
give me an overview of this codebase
```

**4. 深入了解特定组件**

```
explain the main architecture patterns used here
```

```
what are the key data models?
```

```
how is authentication handled?
```

> [!tip]
>
> - 先从广泛的问题开始，再逐步聚焦到具体领域
> - 询问项目中使用的编码规范和模式
> - 要求提供项目专用术语的词汇表

### 查找相关代码

假设你需要定位与特定功能或特性相关的代码。

**1. 让 Qwen Code 查找相关文件**

```
查找处理用户认证的文件
```

**2. 获取组件如何交互的上下文信息**

```
这些认证文件是如何协同工作的？
```

**3. 理解执行流程**

```
从前端到数据库追踪登录过程
```

> [!tip]
>
> - 明确说明你要查找的内容
> - 使用项目中的领域语言

## 高效修复 bug

假设你遇到了一个错误信息，需要找到并修复其来源。

**1. 与 Qwen Code 分享错误**

```
运行 npm test 时出现错误
```

**2. 请求修复建议**

```
建议几种修复 user.ts 中 @ts-ignore 的方法
```

**3. 应用修复**

```
更新 user.ts 以添加你建议的空值检查
```

> [!tip]
>
> - 告诉 Qwen Code 重现问题的命令并获取堆栈跟踪
> - 提及重现错误的任何步骤
> - 让 Qwen Code 知道错误是间歇性还是持续性的

## 重构代码

假设你需要更新旧代码以使用现代模式和实践。

**1. 识别需要重构的遗留代码**

```
在我们的代码库中查找已弃用的 API 使用情况
```

**2. 获取重构建议**

```
建议如何重构 utils.js 以使用现代 JavaScript 特性
```

**3. 安全地应用更改**

```
重构 utils.js 以使用 ES 2024 特性，同时保持相同的行为
```

**4. 验证重构结果**

```
为重构后的代码运行测试
```

> [!tip]
>
> - 让通义千问代码解释现代方法的好处
> - 在需要时要求更改保持向后兼容性
> - 以小的、可测试的增量进行重构

## 使用专业子代理

假设你想使用专业的 AI 子代理来更高效地处理特定任务。

**1. 查看可用的子代理**

```
/agents
```

此命令会显示所有可用的子代理，并允许你创建新的子代理。

**2. 自动使用子代理**

Qwen Code 会自动将适当的任务委派给专业的子代理：

```
审查我最近的代码更改中的安全问题
```

```
运行所有测试并修复任何失败
```

**3. 显式请求特定子代理**

```
使用 code-reviewer 子代理检查认证模块
```

```
让 debugger 子代理调查用户无法登录的原因
```

**4. 为你的工作流创建自定义子代理**

```
/agents
```

然后选择“创建”，并按照提示定义以下内容：

- 描述子代理用途的唯一标识符（例如，`code-reviewer`、`api-designer`）。
- Qwen Code 应在何时使用该代理
- 它可以访问哪些工具
- 描述代理角色和行为的系统提示

> [!tip]
>
> - 在 `.qwen/agents/` 中创建项目专用的子代理以便团队共享
> - 使用描述性的 `description` 字段以启用自动委派
> - 将工具访问权限限制在每个子代理实际需要的范围内
> - 了解更多关于 [子代理](../users/features/sub-agents) 的信息
> - 了解更多关于 [审批模式](../users/features/approval-mode) 的信息

## 编写测试

假设你需要为未覆盖的代码添加测试。

**1. 识别未经测试的代码**

```
查找 NotificationsService.swift 中未被测试覆盖的函数
```

**2. 生成测试脚手架**

```
为通知服务添加测试
```

**3. 添加有意义的测试用例**

```
为通知服务中的边缘条件添加测试用例
```

**4. 运行并验证测试**

```
运行新测试并修复任何失败
```

Qwen Code 可以生成遵循项目现有模式和约定的测试。在请求测试时，请具体说明你想要验证的行为。Qwen Code 会检查你现有的测试文件，以匹配已在使用的风格、框架和断言模式。

为了实现全面覆盖，请让 Qwen Code 识别你可能遗漏的边缘情况。Qwen Code 可以分析你的代码路径，并建议对错误条件、边界值和容易被忽略的意外输入进行测试。

## 创建拉取请求

假设你需要为你的更改创建一个文档完善的拉取请求。

**1. 总结你的更改**

```
总结我对认证模块所做的更改
```

**2. 使用 Qwen Code 生成拉取请求**

```
创建一个 PR
```

**3. 审阅并优化**

```
在 PR 描述中增加更多关于安全改进的上下文信息
```

**4. 添加测试详情**

```
添加有关这些更改如何被测试的信息
```

> [!tip]
>
> - 直接要求 Qwen Code 为你创建 PR
> - 在提交前审阅 Qwen Code 生成的 PR
> - 要求 Qwen Code 突出显示潜在风险或注意事项

## 处理文档

假设你需要为代码添加或更新文档。

**1. 识别未文档化的代码**

```
查找 auth 模块中缺少适当 JSDoc 注释的函数
```

**2. 生成文档**

```
为 auth.js 中未文档化的函数添加 JSDoc 注释
```

**3. 审阅和增强**

```
通过提供更多上下文和示例来改进生成的文档
```

**4. 验证文档**

```
检查文档是否符合我们的项目标准
```

> [!tip]
>
> - 指定你想要的文档风格（JSDoc、docstrings 等）
> - 要求在文档中提供示例
> - 请求为公共 API、接口和复杂逻辑编写文档

## 引用文件和目录

使用 `@` 快速包含文件或目录，无需等待 Qwen Code 读取它们。

**1. 引用单个文件**

```
解释 @src/utils/auth.js 中的逻辑
```

这会在对话中包含该文件的完整内容。

**2. 引用目录**

```
@src/components 的结构是什么？
```

这会提供一个包含文件信息的目录列表。

**3. 引用 MCP 资源**

```
显示来自 @github: repos/owner/repo/issues 的数据
```

这会使用格式 @server: resource 从已连接的 MCP 服务器获取数据。详情请参见 [MCP](../users/features/mcp)。

> [!tip]
>
> - 文件路径可以是相对路径或绝对路径
> - @ 文件引用会在文件所在目录及其父目录中添加 `QWEN.md` 到上下文中
> - 目录引用显示文件列表，而非文件内容
> - 你可以在单条消息中引用多个文件（例如，"`@file 1.js` 和 `@file 2.js`"）

## 恢复之前的对话

假设你一直在使用 Qwen Code 处理某个任务，现在需要在后续会话中继续之前的工作。

Qwen Code 提供了两种恢复之前对话的方式：

- 使用 `--continue` 自动继续最近一次的对话
- 使用 `--resume` 显示一个对话选择器

**1. 继续最近一次对话**

```bash
qwen --continue
```

此命令将立即恢复你最近一次的对话，不会有任何提示。

**2. 在非交互模式下继续**

```bash
qwen --continue --p "Continue with my task"
```

结合使用 `--print` 和 `--continue` 可以在非交互模式下恢复最近一次对话，非常适合用于脚本或自动化流程。

**3. 显示对话选择器**

```bash
qwen --resume
```

该命令将显示一个交互式对话选择器，清晰地列出以下信息：

- 会话摘要（或初始提示）
- 元数据：已用时间、消息数量和 Git 分支

你可以使用方向键进行导航，按 Enter 键选择对话，按 Esc 键退出。

> [!tip]
>
> - 对话历史记录存储在你本地机器上
> - 使用 `--continue` 快速访问最近一次对话
> - 使用 `--resume` 选择特定的历史对话
> - 恢复对话时，你会看到完整的对话历史后再继续
> - 恢复的对话将使用与原始对话相同的模型和配置
>
> **工作原理**：
>
> 1. **对话存储**：所有对话都会自动保存在本地，并包含完整的消息历史
> 2. **消息反序列化**：恢复对话时，系统会还原全部消息历史以保持上下文连贯
> 3. **工具状态保留**：前一次对话中的工具调用及结果会被保留下来
> 4. **上下文恢复**：对话将在原有全部上下文中继续进行
>
> **示例**：
>
> ```bash
> # 继续最近一次对话
> qwen --continue
>
> # 带指定提示继续最近一次对话
> qwen --continue --p "Show me our progress"
>
> # 显示对话选择器
> qwen --resume
>
> # 非交互模式下继续最近一次对话
> qwen --continue --p "Run the tests again"
> ```

## 使用 Git worktrees 运行并行的 Qwen Code 会话

假设你需要同时处理多个任务，并且希望每个 Qwen Code 实例之间具备完全的代码隔离。

**1. 了解 Git worktrees**

Git worktrees 允许你将同一仓库中的多个分支检出到不同的目录中。每个 worktree 都拥有独立的工作目录和文件，但共享相同的 Git 历史记录。更多信息请参阅 [官方 Git worktree 文档](https://git-scm.com/docs/git-worktree)。

**2. 创建新的 worktree**

```bash

# 创建一个带有新分支的新 worktree
git worktree add ../project-feature-a -b feature-a

# 或者使用现有分支创建 worktree
git worktree add ../project-bugfix bugfix-123
```

这将在新目录中创建一个仓库的独立工作副本。

**3. 在每个 worktree 中运行 Qwen Code**

```bash

# 导航至你的 worktree
cd ../project-feature-a

# 在此隔离环境中运行 Qwen 代码
qwen
```

**4. 在另一个工作树中运行 Qwen 代码**

```bash
cd ../project-bugfix
qwen
```

**5. 管理你的工作树**

```bash

# 列出所有工作树
git worktree list

# 完成后删除工作树
git worktree remove ../project-feature-a
```

> [!tip]
>
> - 每个工作树都有其独立的文件状态，这使其非常适合并行的 Qwen Code 会话
> - 在一个工作树中所做的更改不会影响其他工作树，防止 Qwen Code 实例之间相互干扰
> - 所有工作树共享相同的 Git 历史记录和远程连接
> - 对于长期运行的任务，你可以在一个工作树中让 Qwen Code 进行工作，同时在另一个工作树中继续开发
> - 使用描述性的目录名称可以轻松识别每个工作树的用途
> - 记得根据项目的设置，在每个新的工作树中初始化你的开发环境。根据你的技术栈，这可能包括：
>   - JavaScript 项目：运行依赖安装（`npm install`、`yarn`）
>   - Python 项目：设置虚拟环境或使用包管理器进行安装
>   - 其他语言：遵循你项目的标准设置流程

## 将 Qwen Code 作为 Unix 风格的工具使用

### 将 Qwen Code 添加到你的验证流程中

假设你想将 Qwen Code 用作代码检查工具或代码审查工具。

**将 Qwen Code 添加到你的构建脚本中：**

```json
// package.json
{
    ...
    "scripts": {
        ...
        "lint:Qwen Code": "qwen -p '你是一个代码检查工具。请查看与 main 分支的差异，并报告任何与拼写错误相关的问题。请在一行中报告文件名和行号，在下一行中描述问题。不要返回其他任何文本。'"
    }
}
```

> [!tip]
>
> - 在你的 CI/CD 流水线中使用 Qwen Code 进行自动化代码审查
> - 自定义提示词以检查与你的项目相关的特定问题
> - 考虑为不同类型的验证创建多个脚本

### 管道输入，管道输出

假设你想将数据通过管道传入 Qwen Code，并以结构化格式获取返回的数据。

**通过 Qwen Code 传输数据：**

```bash
cat build-error.txt | qwen -p '简洁地解释此构建错误的根本原因' > output.txt
```

> [!tip]
>
> - 使用管道将 Qwen-Code 集成到现有的 shell 脚本中
> - 与其他 Unix 工具结合使用，实现强大的工作流
> - 考虑使用 --output-format 获取结构化输出

### 控制输出格式

假设你需要 Qwen Code 的输出为特定格式，尤其是在将 Qwen Code 集成到脚本或其他工具中时。

**1. 使用文本格式（默认）**

```bash
cat data.txt | qwen -p 'summarize this data' --output-format text > summary.txt
```

这只会输出 Qwen Code 的纯文本响应（默认行为）。

**2. 使用 JSON 格式**

```bash
cat code.py | qwen -p 'analyze this code for bugs' --output-format json > analysis.json
```

这会输出一个包含元数据（如成本和耗时）的消息 JSON 数组。

**3. 使用流式 JSON 格式**

```bash
cat log.txt | qwen -p 'parse this log file for errors' --output-format stream-json
```

这会在 Qwen Code 处理请求时实时输出一系列 JSON 对象。每条消息都是有效的 JSON 对象，但如果将整个输出连接起来则不是有效的 JSON。

> [!tip]
>
> - 当你只需要 Qwen Code 的响应时，使用 `--output-format text` 进行简单集成
> - 当你需要完整的对话日志时，使用 `--output-format json`
> - 当你需要实时输出每次对话回合时，使用 `--output-format stream-json`

## 询问 Qwen Code 的功能

Qwen Code 内置了对其文档的访问权限，可以回答有关其自身功能和限制的问题。

### 示例问题

```
Qwen Code 可以创建拉取请求吗？
```

```
Qwen Code 如何处理权限？
```

```
有哪些斜杠命令可用？
```

```
如何将 MCP 与 Qwen Code 一起使用？
```

```
如何为 Amazon Bedrock 配置 Qwen Code？
```

```
Qwen Code 有哪些限制？
```

> [!note]
>
> Qwen Code 提供基于文档的答案来回应这些问题。如需可执行示例和动手演示，请参阅上方的具体工作流部分。

> [!tip]
>
> - Qwen Code 始终能够访问最新的 Qwen Code 文档，无论你使用的是哪个版本
> - 提出具体问题以获得详细答案
> - Qwen Code 可以解释复杂的功能，例如 MCP 集成、企业配置和高级工作流程