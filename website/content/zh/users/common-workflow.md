# 常见工作流

> 了解 Qwen Code 的常见工作流。

本文档中的每个任务都包含清晰的操作说明、示例命令和最佳实践，帮助你充分发挥 Qwen Code 的潜力。

## 了解新代码库

### 快速概览代码库

假设你刚加入一个新项目，需要快速了解其结构。

**1. 进入项目根目录**

```bash
cd /path/to/project
```

**2. 启动 Qwen Code**

```bash
qwen
```

**3. 请求高层概览**

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
> - 先提宏观问题，再逐步聚焦到具体领域
> - 询问项目使用的编码规范和模式
> - 请求生成项目专有术语的词汇表

### 查找相关代码

假设你需要定位与特定功能相关的代码。

**1. 让 Qwen Code 找到相关文件**

```
find the files that handle user authentication
```

**2. 了解组件之间的交互方式**

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
> - 使用项目的领域术语

## 高效修复 Bug

假设你遇到了一条错误信息，需要找到并修复其根源。

**1. 将错误信息分享给 Qwen Code**

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
> - 告诉 Qwen Code 用于复现问题的命令，并获取堆栈跟踪信息
> - 说明复现错误的具体步骤
> - 告知 Qwen Code 该错误是偶发的还是必现的

## 重构代码

假设你需要将旧代码升级为使用现代模式和最佳实践。

**1. 识别需要重构的旧代码**

```
find deprecated API usage in our codebase
```

**2. 获取重构建议**

```
suggest how to refactor utils.js to use modern JavaScript features
```

**3. 安全地应用变更**

```
refactor utils.js to use ES 2024 features while maintaining the same behavior
```

**4. 验证重构结果**

```
run tests for the refactored code
```

> [!tip]
>
> - 让 Qwen Code 解释现代写法的优势
> - 在需要时要求保持向后兼容性
> - 以小步骤、可测试的方式进行重构

## 使用专用子智能体

假设你希望使用专用 AI 子智能体来更高效地处理特定任务。

**1. 查看可用的子智能体**

```
/agents
```

这会显示所有可用的子智能体，并允许你创建新的子智能体。

**2. 自动使用子智能体**

Qwen Code 会自动将合适的任务委派给专用子智能体：

```
review my recent code changes for security issues
```

```
run all tests and fix any failures
```

**3. 显式指定子智能体**

```
use the code-reviewer subagent to check the auth module
```

```
have the debugger subagent investigate why users can't log in
```

**4. 为你的工作流创建自定义子智能体**

```
/agents
```

选择"create"并按照提示定义以下内容：

- 描述子智能体用途的唯一标识符（例如 `code-reviewer`、`api-designer`）
- Qwen Code 应何时使用此智能体
- 它可以访问哪些工具
- 描述智能体角色和行为的系统提示

> [!tip]
>
> - 在 `.qwen/agents/` 中创建项目专用子智能体以供团队共享
> - 使用描述性的 `description` 字段以启用自动委派
> - 将工具访问权限限制为每个子智能体实际需要的范围
> - 了解更多关于[子智能体](./features/sub-agents)的内容
> - 了解更多关于[审批模式](./features/approval-mode)的内容

## 处理测试

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

Qwen Code 生成的测试会遵循你项目现有的模式和规范。在请求测试时，请明确说明你想验证的行为。Qwen Code 会分析你现有的测试文件，以匹配已使用的风格、框架和断言模式。

为了实现全面覆盖，可以让 Qwen Code 找出你可能遗漏的边界情况。Qwen Code 能够分析代码路径，并为错误条件、边界值和容易忽视的意外输入提供测试建议。

## 创建 Pull Request

假设你需要为你的变更创建一个文档完善的 pull request。

**1. 总结你的变更**

```
summarize the changes I've made to the authentication module
```

**2. 使用 Qwen Code 生成 pull request**

```
create a pr
```

**3. 审阅并完善**

```
enhance the PR description with more context about the security improvements
```

**4. 添加测试说明**

```
add information about how these changes were tested
```

> [!tip]
>
> - 直接让 Qwen Code 为你创建 PR
> - 在提交前审阅 Qwen Code 生成的 PR
> - 请 Qwen Code 指出潜在风险或注意事项

## 处理文档

假设你需要为代码添加或更新文档。

**1. 识别未文档化的代码**

```
find functions without proper JSDoc comments in the auth module
```

**2. 生成文档**

```
add JSDoc comments to the undocumented functions in auth.js
```

**3. 审阅并完善**

```
improve the generated documentation with more context and examples
```

**4. 验证文档**

```
check if the documentation follows our project standards
```

> [!tip]
>
> - 指定你想要的文档风格（JSDoc、docstrings 等）
> - 要求在文档中包含示例
> - 为公共 API、接口和复杂逻辑请求文档

## 引用文件和目录

使用 `@` 快速引入文件或目录，无需等待 Qwen Code 读取它们。

**1. 引用单个文件**

```
Explain the logic in @src/utils/auth.js
```

这会将文件的完整内容包含在对话中。

**2. 引用目录**

```
What's the structure of @src/components?
```

这会提供包含文件信息的目录列表。

**3. 引用 MCP 资源**

```
Show me the data from @github: repos/owner/repo/issues
```

这会使用 `@server: resource` 格式从已连接的 MCP 服务器获取数据。详见 [MCP](./features/mcp)。

> [!tip]
>
> - 文件路径可以是相对路径或绝对路径
> - `@` 文件引用会将文件所在目录及父目录中的 `QWEN.md` 添加到上下文中
> - 目录引用显示文件列表，而非文件内容
> - 可以在单条消息中引用多个文件（例如，"`@file 1.js` 和 `@file 2.js`"）

## 恢复之前的对话

假设你之前在使用 Qwen Code 处理某个任务，需要在后续会话中从中断的地方继续。

Qwen Code 提供两种恢复之前对话的方式：

- `--continue`：自动继续最近一次对话
- `--resume`：显示对话选择器

**1. 继续最近一次对话**

```bash
qwen --continue
```

这会立即恢复你最近的对话，无需任何提示。

**2. 在非交互模式下继续**

```bash
qwen --continue -p "Continue with my task"
```

配合 `--continue` 使用 `-p`（或 `--prompt`），可在非交互模式下恢复最近的对话，非常适合脚本或自动化场景。

**3. 显示对话选择器**

```bash
qwen --resume
```

这会显示一个交互式对话选择器，以简洁的列表视图展示：

- 会话摘要（或初始提示）
- 元数据：已过时间、消息数量和 git 分支

使用方向键导航，按 Enter 选择对话，按 Esc 退出。

> [!tip]
>
> - 对话历史记录存储在你本地机器上
> - 使用 `--continue` 快速访问最近一次对话
> - 使用 `--resume` 选择特定的历史对话
> - 恢复时，你将看到完整的对话历史，然后继续
> - 恢复的对话将使用与原始对话相同的模型和配置
>
> **工作原理**：
>
> 1. **对话存储**：所有对话连同完整消息历史自动保存在本地
> 2. **消息反序列化**：恢复时，完整的消息历史将被还原以保持上下文
> 3. **工具状态**：前次对话中的工具使用记录和结果将被保留
> 4. **上下文还原**：对话恢复时保留所有之前的上下文
>
> **示例**：
>
> ```bash
> # 继续最近一次对话
> qwen --continue
>
> # 带特定提示继续最近一次对话
> qwen --continue -p "Show me our progress"
>
> # 显示对话选择器
> qwen --resume
>
> # 在非交互模式下继续最近一次对话
> qwen --continue -p "Run the tests again"
> ```

## 使用 Git worktree 并行运行 Qwen Code 会话

假设你需要同时处理多个任务，并且每个 Qwen Code 实例之间需要完全的代码隔离。

**1. 了解 Git worktree**

Git worktree 允许你将同一仓库的多个分支检出到不同的目录中。每个 worktree 拥有独立的工作目录和隔离的文件，同时共享相同的 Git 历史。了解更多请参阅 [Git worktree 官方文档](https://git-scm.com/docs/git-worktree)。

**2. 创建新的 worktree**

```bash
# 创建一个带新分支的 worktree
git worktree add ../project-feature-a -b feature-a

# 或基于已有分支创建 worktree
git worktree add ../project-bugfix bugfix-123
```

这会创建一个包含仓库独立工作副本的新目录。

**3. 在每个 worktree 中运行 Qwen Code**

```bash
# 进入你的 worktree
cd ../project-feature-a

# 在此隔离环境中运行 Qwen Code
qwen
```

**4. 在另一个 worktree 中运行 Qwen Code**

```bash
cd ../project-bugfix
qwen
```

**5. 管理你的 worktree**

```bash
# 列出所有 worktree
git worktree list

# 完成后移除 worktree
git worktree remove ../project-feature-a
```

> [!tip]
>
> - 每个 worktree 拥有独立的文件状态，非常适合并行运行多个 Qwen Code 会话
> - 一个 worktree 中的变更不会影响其他 worktree，防止 Qwen Code 实例之间互相干扰
> - 所有 worktree 共享相同的 Git 历史和远程连接
> - 对于长时间运行的任务，可以让 Qwen Code 在一个 worktree 中工作，同时在另一个 worktree 中继续开发
> - 使用描述性的目录名，便于识别每个 worktree 对应的任务
> - 记得在每个新 worktree 中按照项目的配置说明初始化开发环境。根据你的技术栈，这可能包括：
>   - JavaScript 项目：运行依赖安装（`npm install`、`yarn`）
>   - Python 项目：设置虚拟环境或使用包管理器安装依赖
>   - 其他语言：遵循项目的标准配置流程

## 将 Qwen Code 用作 Unix 风格工具

### 将 Qwen Code 集成到验证流程中

假设你想将 Qwen Code 用作代码检查器或代码审阅工具。

**将 Qwen Code 添加到你的构建脚本中：**

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
> - 在 CI/CD 流水线中使用 Qwen Code 进行自动化代码审阅
> - 自定义提示以检查项目相关的特定问题
> - 考虑为不同类型的验证创建多个脚本

### 管道输入与输出

假设你想将数据通过管道传入 Qwen Code，并以结构化格式获取输出。

**通过 Qwen Code 传输数据：**

```bash
cat build-error.txt | qwen -p 'concisely explain the root cause of this build error' > output.txt
```

> [!tip]
>
> - 使用管道将 Qwen Code 集成到现有的 shell 脚本中
> - 与其他 Unix 工具组合，构建强大的工作流
> - 考虑使用 --output-format 获取结构化输出

### 控制输出格式

假设你需要 Qwen Code 以特定格式输出，尤其是在将 Qwen Code 集成到脚本或其他工具时。

**1. 使用文本格式（默认）**

```bash
cat data.txt | qwen -p 'summarize this data' --output-format text > summary.txt
```

这会输出 Qwen Code 的纯文本响应（默认行为）。

**2. 使用 JSON 格式**

```bash
cat code.py | qwen -p 'analyze this code for bugs' --output-format json > analysis.json
```

这会输出一个包含元数据（包括费用和耗时）的 JSON 消息数组。

**3. 使用流式 JSON 格式**

```bash
cat log.txt | qwen -p 'parse this log file for errors' --output-format stream-json
```

这会在 Qwen Code 处理请求时实时输出一系列 JSON 对象。每条消息都是有效的 JSON 对象，但整个输出拼接在一起并不是有效的 JSON。

> [!tip]
>
> - 在只需要 Qwen Code 响应的简单集成中使用 `--output-format text`
> - 需要完整对话日志时使用 `--output-format json`
> - 需要实时输出每轮对话时使用 `--output-format stream-json`

## 向 Qwen Code 咨询其功能

Qwen Code 内置了对自身文档的访问权限，可以回答关于其功能和限制的问题。

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
> Qwen Code 基于文档提供对这些问题的回答。如需可执行示例和实际演示，请参阅上方的具体工作流章节。

> [!tip]
>
> - 无论你使用哪个版本，Qwen Code 始终能访问最新的 Qwen Code 文档
> - 提问越具体，得到的答案越详细
> - Qwen Code 能解释 MCP 集成、企业配置和高级工作流等复杂功能
