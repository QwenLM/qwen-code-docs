# 常见工作流

> 了解如何使用 Qwen Code 进行常见工作流。

本文档中的每个任务都包含清晰的说明、示例命令和最佳实践，帮助你充分发挥 Qwen Code 的效能。

## 理解新代码库

### 快速了解代码库概览

假设你刚加入一个新项目，需要快速了解其结构。

**1. 进入项目根目录**

```bash
cd /path/to/project
```

**2. 启动 Qwen Code**

```bash
qwen
```

**3. 请求高层级概览**

```
give me an overview of this codebase
```

**4. 深入探究特定组件**

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
> - 从宽泛的问题开始，然后逐步聚焦到具体区域
> - 询问项目中使用的编码规范和设计模式
> - 请求生成项目专属术语表

### 查找相关代码

假设你需要查找与特定功能相关的代码。

**1. 让 Qwen Code 查找相关文件**

```
find the files that handle user authentication
```

**2. 了解组件间的交互上下文**

```
how do these authentication files work together?
```

**3. 理解执行流程**

```
trace the login process from front-end to database
```

> [!tip]
>
> - 明确说明你要查找的内容
> - 使用项目中的领域术语

## 高效修复 Bug

假设你遇到了错误信息，需要定位并修复其根源。

**1. 将错误信息提供给 Qwen Code**

```
I'm seeing an error when I run npm test
```

**2. 请求修复建议**

```
suggest a few ways to fix the @ts-ignore in user.ts
```

**3. 应用修复**

```
update user.tsto add the null check you suggested
```

> [!tip]
>
> - 告诉 Qwen Code 复现该问题的命令，并获取堆栈跟踪
> - 说明复现错误的具体步骤
> - 告知 Qwen Code 该错误是偶发还是必现

## 重构代码

假设你需要更新旧代码，以采用现代模式和最佳实践。

**1. 识别需要重构的遗留代码**

```
find deprecated API usage in our codebase
```

**2. 获取重构建议**

```
suggest how to refactor utils.js to use modern JavaScript features
```

**3. 安全地应用更改**

```
refactor utils.js to use ES 2024 features while maintaining the same behavior
```

**4. 验证重构结果**

```
run tests for the refactored code
```

> [!tip]
>
> - 让 Qwen Code 解释采用现代方法的优势
> - 在需要时，要求更改保持向后兼容性
> - 以小型、可测试的增量进行重构

## 使用专用子代理 (Subagents)

假设你想使用专用的 AI 子代理来更高效地处理特定任务。

**1. 查看可用的子代理**

```
/agents
```

这将显示所有可用的子代理，并允许你创建新的子代理。

**2. 自动使用子代理**

Qwen Code 会自动将合适的任务委派给专用的子代理：

```
review my recent code changes for security issues
```

```
run all tests and fix any failures
```

**3. 显式请求特定子代理**

```
use the code-reviewer subagent to check the auth module
```

```
have the debugger subagent investigate why users can't log in
```

**4. 为你的工作流创建自定义子代理**

```
/agents
```

然后选择 "create" 并按照提示定义：

- 描述子代理用途的唯一标识符（例如 `code-reviewer`、`api-designer`）。
- Qwen Code 应在何时使用此代理
- 它可以访问哪些工具
- 描述代理角色和行为的 system prompt

> [!tip]
>
> - 在 `.qwen/agents/` 中创建项目专属的子代理，以便团队共享
> - 使用描述性的 `description` 字段以启用自动委派
> - 将工具访问权限限制在每个子代理实际需要的范围内
> - 了解更多关于 [Sub Agents](./features/sub-agents) 的信息
> - 了解更多关于 [Approval Mode](./features/approval-mode) 的信息

## 编写与运行测试

假设你需要为未覆盖的代码添加测试。

**1. 识别未测试的代码**

```
find functions in NotificationsService.swift that are not covered by tests
```

**2. 生成测试脚手架**

```
add tests for the notification service
```

**3. 添加有意义的测试用例**

```
add test cases for edge conditions in the notification service
```

**4. 运行并验证测试**

```
run the new tests and fix any failures
```

Qwen Code 可以生成符合你项目现有模式和规范的测试。在请求生成测试时，请明确说明你想要验证的行为。Qwen Code 会检查你现有的测试文件，以匹配已使用的风格、框架和断言模式。

为了实现全面覆盖，可以让 Qwen Code 识别你可能遗漏的边界情况。Qwen Code 能够分析你的代码路径，并建议针对错误条件、边界值和容易被忽视的意外输入进行测试。

## 创建 Pull Request

假设你需要为你的更改创建一份文档完善的 Pull Request。

**1. 总结你的更改**

```
summarize the changes I've made to the authentication module
```

**2. 使用 Qwen Code 生成 Pull Request**

```
create a pr
```

**3. 审查与优化**

```
enhance the PR description with more context about the security improvements
```

**4. 添加测试详情**

```
add information about how these changes were tested
```

> [!tip]
>
> - 直接让 Qwen Code 为你创建 PR
> - 在提交前审查 Qwen Code 生成的 PR
> - 让 Qwen Code 标出潜在风险或注意事项

## 处理文档

假设你需要为代码添加或更新文档。

**1. 识别缺少文档的代码**

```
find functions without proper JSDoc comments in the auth module
```

**2. 生成文档**

```
add JSDoc comments to the undocumented functions in auth.js
```

**3. 审查与增强**

```
improve the generated documentation with more context and examples
```

**4. 验证文档**

```
check if the documentation follows our project standards
```

> [!tip]
>
> - 指定你想要的文档风格（如 JSDoc、docstrings 等）
> - 要求在文档中包含示例
> - 请求为公共 API、接口和复杂逻辑生成文档

## 引用文件和目录

使用 `@` 快速引入文件或目录，无需等待 Qwen Code 读取。

**1. 引用单个文件**

```
Explain the logic in @src/utils/auth.js
```

这会将文件的完整内容包含到对话上下文中。

**2. 引用目录**

```
What's the structure of @src/components?
```

这将提供包含文件信息的目录列表。

**3. 引用 MCP 资源**

```
Show me the data from @github: repos/owner/repo/issues
```

这将使用 `@server: resource` 格式从已连接的 MCP 服务器获取数据。详情请参阅 [MCP](./features/mcp)。

> [!tip]
>
> - 文件路径可以是相对路径或绝对路径
> - `@` 文件引用会将该文件所在目录及父目录中的 `QWEN.md` 添加到上下文中
> - 目录引用仅显示文件列表，而非文件内容
> - 你可以在单条消息中引用多个文件（例如 "`@file 1.js` 和 `@file 2.js`"）

## 恢复之前的对话

假设你正在使用 Qwen Code 处理某项任务，需要在后续会话中从中断处继续。

Qwen Code 提供两种恢复之前对话的选项：

- `--continue` 自动继续最近的对话
- `--resume` 显示对话选择器

**1. 继续最近的对话**

```bash
qwen --continue
```

这将立即恢复你最近的对话，无需任何提示。

**2. 在非交互模式下继续**

```bash
qwen --continue --p "Continue with my task"
```

将 `--print` 与 `--continue` 结合使用，可在非交互模式下恢复最近的对话，非常适合脚本或自动化流程。

**3. 显示对话选择器**

```bash
qwen --resume
```

这将显示一个交互式对话选择器，以清晰的列表视图展示：

- 会话摘要（或初始提示词）
- 元数据：已用时间、消息数量和 Git 分支

使用方向键导航，按 Enter 选择对话。按 Esc 退出。

> [!tip]
>
> - 对话历史记录存储在本地计算机上
> - 使用 `--continue` 快速访问最近的对话
> - 当需要选择特定的历史对话时，使用 `--resume`
> - 恢复对话时，在继续之前你会看到完整的对话历史
> - 恢复的对话将使用与原始对话相同的模型和配置开始
>
> **工作原理**：
>
> 1. **对话存储**：所有对话及其完整消息历史都会自动保存到本地
> 2. **消息反序列化**：恢复时，会还原完整的消息历史以保持上下文
> 3. **工具状态**：保留上一次对话中的工具使用情况和结果
> 4. **上下文恢复**：对话将在保留所有先前上下文的情况下继续
>
> **示例**：
>
> ```bash
> # Continue most recent conversation
> qwen --continue
>
> # Continue most recent conversation with a specific prompt
> qwen --continue --p "Show me our progress"
>
> # Show conversation picker
> qwen --resume
>
> # Continue most recent conversation in non-interactive mode
> qwen --continue --p "Run the tests again"
> ```

## 使用 Git worktrees 运行并行的 Qwen Code 会话

假设你需要同时处理多个任务，并在不同的 Qwen Code 实例之间实现完全的代码隔离。

**1. 了解 Git worktrees**

Git worktrees 允许你将同一仓库的多个分支检出到不同的目录中。每个 worktree 都有自己独立的工作目录和文件，同时共享相同的 Git 历史记录。详情请参阅 [官方 Git worktree 文档](https://git-scm.com/docs/git-worktree)。

**2. 创建新的 worktree**

```bash
# Create a new worktree with a new branch
git worktree add ../project-feature-a -b feature-a

# Or create a worktree with an existing branch
git worktree add ../project-bugfix bugfix-123
```

这将创建一个新目录，其中包含你仓库的独立工作副本。

**3. 在每个 worktree 中运行 Qwen Code**

```bash
# Navigate to your worktree
cd ../project-feature-a

# Run Qwen Code in this isolated environment
qwen
```

**4. 在另一个 worktree 中运行 Qwen Code**

```bash
cd ../project-bugfix
qwen
```

**5. 管理你的 worktrees**

```bash
# List all worktrees
git worktree list

# Remove a worktree when done
git worktree remove ../project-feature-a
```

> [!tip]
>
> - 每个 worktree 都有独立的文件状态，非常适合并行的 Qwen Code 会话
> - 在一个 worktree 中所做的更改不会影响其他 worktree，从而防止 Qwen Code 实例相互干扰
> - 所有 worktree 共享相同的 Git 历史记录和远程连接
> - 对于长时间运行的任务，你可以让 Qwen Code 在一个 worktree 中工作，同时你在另一个 worktree 中继续开发
> - 使用具有描述性的目录名称，以便轻松识别每个 worktree 对应的任务
> - 记得根据项目设置，在每个新的 worktree 中初始化开发环境。根据你的技术栈，这可能包括：
>   - JavaScript 项目：运行依赖安装（`npm install`、`yarn`）
>   - Python 项目：设置虚拟环境或使用包管理器安装
>   - 其他语言：遵循项目的标准设置流程

## 将 Qwen Code 用作 Unix 风格工具

### 将 Qwen Code 加入验证流程

假设你想将 Qwen Code 用作 linter 或代码审查工具。

**将 Qwen Code 添加到构建脚本中：**

```json
// package.json
{
    ...
    "scripts": {
        ...
        "lint:Qwen Code": "qwen -p 'you are a linter. please look at the changes vs. main and report any issues related to typos. report the filename and line number on one line, and a description of the issue on the second line. do not return any other text.'"
    }
}
```

> [!tip]
>
> - 在 CI/CD 流水线中使用 Qwen Code 进行自动化代码审查
> - 自定义 prompt 以检查与项目相关的特定问题
> - 考虑为不同类型的验证创建多个脚本

### 管道输入与输出

假设你想将数据通过管道输入 Qwen Code，并以结构化格式获取返回数据。

**通过管道将数据传入 Qwen Code：**

```bash
cat build-error.txt | qwen -p 'concisely explain the root cause of this build error' > output.txt
```

> [!tip]
>
> - 使用管道将 Qwen Code 集成到现有的 shell 脚本中
> - 与其他 Unix 工具结合，构建强大的工作流
> - 考虑使用 `--output-format` 获取结构化输出

### 控制输出格式

假设你需要 Qwen Code 以特定格式输出，尤其是在将其集成到脚本或其他工具时。

**1. 使用文本格式（默认）**

```bash
cat data.txt | qwen -p 'summarize this data' --output-format text > summary.txt
```

这将仅输出 Qwen Code 的纯文本响应（默认行为）。

**2. 使用 JSON 格式**

```bash
cat code.py | qwen -p 'analyze this code for bugs' --output-format json > analysis.json
```

这将输出包含元数据（如费用和耗时）的消息 JSON 数组。

**3. 使用流式 JSON 格式**

```bash
cat log.txt | qwen -p 'parse this log file for errors' --output-format stream-json
```

这将在 Qwen Code 处理请求时实时输出一系列 JSON 对象。每条消息都是有效的 JSON 对象，但如果将所有输出拼接在一起，则整体不是有效的 JSON。

> [!tip]
>
> - 在只需获取 Qwen Code 响应的简单集成中，使用 `--output-format text`
> - 在需要完整对话日志时，使用 `--output-format json`
> - 在需要实时输出每轮对话时，使用 `--output-format stream-json`

## 询问 Qwen Code 的功能

Qwen Code 内置了对自身文档的访问权限，可以回答关于其自身功能和限制的问题。

### 示例问题

```
can Qwen Code create pull requests?
```

```
how does Qwen Code handle permissions?
```

```
what slash commands are available?
```

```
how do I use MCP with Qwen Code?
```

```
how do I configure Qwen Code for Amazon Bedrock?
```

```
what are the limitations of Qwen Code?
```

> [!note]
>
> Qwen Code 会基于文档回答这些问题。如需可执行的示例和实际操作演示，请参阅上方的具体工作流章节。

> [!tip]
>
> - 无论你使用哪个版本，Qwen Code 始终可以访问最新的 Qwen Code 文档
> - 提出具体问题以获取详细解答
> - Qwen Code 可以解释 MCP 集成、企业级配置和高级工作流等复杂功能