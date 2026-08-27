# 常见工作流

> 了解 Qwen Code 的常见工作流。

本文档中的每个任务都包含清晰的说明、示例命令和最佳实践，帮助你充分利用 Qwen Code。

## 理解新代码库

### 快速了解代码库概况

假设你刚加入一个新项目，需要快速了解其结构。

**1. 导航到项目根目录**

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

**4. 深入探索特定组件**

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
> - 从宽泛的问题开始，然后逐步聚焦到具体领域
> - 询问项目中使用的编码规范和模式
> - 请求生成项目专属术语表

### 查找相关代码

假设你需要定位与某个特定功能相关的代码。

**1. 让 Qwen Code 查找相关文件**

```
find the files that handle user authentication
```

**2. 获取组件交互的上下文**

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

假设你遇到一个错误信息，需要定位并修复其根源。

**1. 向 Qwen Code 分享错误信息**

```
I'm seeing an error when I run npm test
```

**2. 请求修复建议**

```
suggest a few ways to fix the @ts-ignore in user.ts
```

**3. 应用修复**

```
update user.ts to add the null check you suggested
```

> [!tip]
>
> - 告诉 Qwen Code 重现问题的命令并获取堆栈跟踪
> - 提及重现错误的步骤
> - 告知 Qwen Code 错误是间歇性出现还是一直存在

## 重构代码

假设你需要将旧代码更新为现代模式和最佳实践。

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
> - 请 Qwen Code 解释现代方法带来的好处
> - 在需要时要求更改保持向后兼容
> - 以小的、可测试的增量进行重构

## 使用专用子代理

假设你想使用专门的 AI 子代理更高效地处理特定任务。

**1. 查看可用的子代理**

```
/agents
```

这将显示所有可用的子代理，并允许你创建新的。

**2. 自动使用子代理**

Qwen Code 会自动将合适的任务委派给专用子代理：

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

然后选择“create”并按照提示定义：

- 一个唯一标识符，描述子代理的用途（例如 `code-reviewer`、`api-designer`）
- Qwen Code 何时应使用此代理
- 它可以访问哪些工具
- 描述代理角色和行为的系统提示

> [!tip]
>
> - 在 `.qwen/agents/` 中创建项目专属子代理，方便团队共享
> - 使用描述性的 `description` 字段以启用自动委派
> - 只为每个子代理开放其实际需要的工具权限
> - 了解更多关于[子代理](./features/sub-agents)的信息
> - 了解更多关于[审批模式](./features/approval-mode)的信息

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

Qwen Code 可以生成遵循项目现有模式和约定的测试。在请求测试时，明确说明你想验证的行为。Qwen Code 会检查你现有的测试文件，以匹配已有的风格、框架和断言模式。

为了获得全面的覆盖，请让 Qwen Code 识别你可能遗漏的边界情况。Qwen Code 可以分析你的代码路径，并为错误条件、边界值和意外输入建议测试，这些内容很容易被忽略。

## 创建 Pull Request

假设你需要为你的更改创建一个文档完善的 pull request。

**1. 总结你的更改**

```
summarize the changes I've made to the authentication module
```

**2. 使用 Qwen Code 生成 pull request**

```
create a pr
```

**3. 审查并优化**

```
enhance the PR description with more context about the security improvements
```

**4. 添加测试细节**

```
add information about how these changes were tested
```

> [!tip]
>
> - 直接请求 Qwen Code 为你创建 PR
> - 在提交前审查 Qwen Code 生成的 PR
> - 让 Qwen Code 指出潜在的风险或注意事项

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

**3. 审查并增强**

```
improve the generated documentation with more context and examples
```

**4. 验证文档**

```
check if the documentation follows our project standards
```

> [!tip]
>
> - 指定你想要的文档风格（JSDoc、docstring 等）
> - 在文档中要求添加示例
> - 为公共 API、接口和复杂逻辑请求文档

## 引用文件和目录

使用 `@` 快速包含文件或目录，无需等待 Qwen Code 读取。

**1. 引用单个文件**

```
Explain the logic in @src/utils/auth.js
```

这将把文件的完整内容加入到对话中。

**2. 引用目录**

```
What's the structure of @src/components?
```

这将提供目录列表及文件信息。

**3. 引用 MCP 资源**

```
Show me the data from @github: repos/owner/repo/issues
```

这将从已连接的 MCP 服务器获取数据，格式为 `@server: resource`。参见 [MCP](./features/mcp) 了解详情。

> [!tip]
>
> - 文件路径可以是相对路径或绝对路径
> - `@` 文件引用会将文件所在目录及其父目录中的 `QWEN.md` 加入上下文
> - 目录引用显示文件列表，而非内容
> - 可以在单条消息中引用多个文件（例如 `@file 1.js` 和 `@file 2.js`）

## 恢复之前的对话

假设你之前正在与 Qwen Code 共同处理一项任务，需要在后续会话中从中断处继续。

Qwen Code 提供了两种恢复之前对话的选项：

- `--continue`：自动继续最近的对话
- `--resume`：显示对话选择器

**1. 继续最近的对话**

```bash
qwen --continue
```

这会立即恢复最近的对话，无需任何提示。

**2. 在非交互模式下继续**

```bash
qwen --continue -p "Continue with my task"
```

使用 `-p`（或 `--prompt`）配合 `--continue` 以非交互模式恢复最近的对话，非常适合脚本或自动化。

**3. 显示对话选择器**

```bash
qwen --resume
```

这会显示一个交互式对话选择器，以清晰的列表视图展示：

- 会话摘要（或初始提示）
- 元数据：经过的时间、消息数量和 Git 分支

使用方向键导航，按 Enter 选择对话，按 Esc 退出。

> [!tip]
>
> - 对话历史存储在本地机器上
> - 使用 `--continue` 快速访问最近的对话
> - 当需要选择特定的历史对话时使用 `--resume`
> - 恢复时，你会看到完整的对话历史然后继续
> - 恢复的对话使用与原对话相同的模型和配置
>
> **工作原理**：
>
> 1. **对话存储**：所有对话自动保存在本地，包含完整的消息历史
> 2. **消息反序列化**：恢复时，会还原完整的消息历史以保持上下文
> 3. **工具状态**：之前对话中的工具使用及其结果会被保留
> 4. **上下文恢复**：对话以完整的历史上下文恢复
>
> **示例**：
>
> ```bash
> # 继续最近的对话
> qwen --continue
>
> # 使用特定提示继续最近的对话
> qwen --continue -p "Show me our progress"
>
> # 显示对话选择器
> qwen --resume
>
> # 在非交互模式下继续最近的对话
> qwen --continue -p "Run the tests again"
> ```

## 使用 Git Worktree 运行并行 Qwen Code 会话

假设你需要同时处理多个任务，并且要求 Qwen Code 实例之间完全隔离代码。

**1. 理解 Git worktree**

Git worktree 允许你将同一个仓库的多个分支检出到不同的目录。每个 worktree 拥有独立的工作目录和隔离的文件，同时共享相同的 Git 历史。了解更多请参阅[官方 Git worktree 文档](https://git-scm.com/docs/git-worktree)。

**2. 创建新的 worktree**

```bash
# 创建带新分支的 worktree
git worktree add ../project-feature-a -b feature-a

# 或创建带已有分支的 worktree
git worktree add ../project-bugfix bugfix-123
```

这会创建一个新目录，包含仓库的独立工作副本。

**3. 在每个 worktree 中运行 Qwen Code**

```bash
# 进入 worktree
cd ../project-feature-a

# 在此隔离环境中运行 Qwen Code
qwen
```

**4. 在另一个 worktree 中运行 Qwen Code**

```bash
cd ../project-bugfix
qwen
```

**5. 管理你的 worktrees**

```bash
# 列出所有 worktrees
git worktree list

# 完成后移除 worktree
git worktree remove ../project-feature-a
```

> [!tip]
>
> - 每个 worktree 拥有独立的文件状态，非常适合并行的 Qwen Code 会话
> - 一个 worktree 中的修改不会影响其他 worktree，防止 Qwen Code 实例相互干扰
> - 所有 worktrees 共享相同的 Git 历史和远程连接
> - 对于长时间运行的任务，你可以让 Qwen Code 在一个 worktree 中工作，而你在另一个 worktree 中继续开发
> - 使用描述性的目录名称，方便识别每个 worktree 对应的任务
> - 记得在每个新 worktree 中根据项目设置初始化开发环境。根据你的技术栈，这可能需要：
>   - JavaScript 项目：运行依赖安装（`npm install`、`yarn`）
>   - Python 项目：设置虚拟环境或使用包管理器安装
>   - 其他语言：遵循项目的标准设置流程

## 将 Qwen Code 用作 Unix 风格的工具

### 将 Qwen Code 加入验证流程

假设你想将 Qwen Code 作为 linter 或代码审查工具。

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
> - 自定义提示以检查项目中特定的问题
> - 考虑为不同类型的验证创建多个脚本

### 管道输入输出

假设你想将数据通过管道输入 Qwen Code，并以结构化格式获取输出。

**通过管道将数据交给 Qwen Code：**

```bash
cat build-error.txt | qwen -p 'concisely explain the root cause of this build error' > output.txt
```

> [!tip]
>
> - 使用管道将 Qwen Code 集成到现有的 shell 脚本中
> - 与其他 Unix 工具结合使用，实现强大的工作流
> - 考虑使用 `--output-format` 获取结构化输出

### 控制输出格式

假设你需要 Qwen Code 以特定格式输出，尤其是在将 Qwen Code 集成到脚本或其他工具中时。

**1. 使用文本格式（默认）**

```bash
cat data.txt | qwen -p 'summarize this data' --output-format text > summary.txt
```

这只输出 Qwen Code 的纯文本响应（默认行为）。

**2. 使用 JSON 格式**

```bash
cat code.py | qwen -p 'analyze this code for bugs' --output-format json > analysis.json
```

这会输出一个包含消息及元数据（包括成本和时间）的 JSON 数组。

**3. 使用流式 JSON 格式**

```bash
cat log.txt | qwen -p 'parse this log file for errors' --output-format stream-json
```

这会在 Qwen Code 处理请求时实时输出一系列 JSON 对象。每条消息都是一个有效的 JSON 对象，但整体输出拼接后并不是有效的 JSON。

> [!tip]
>
> - 对简单的集成（只需 Qwen Code 的响应）使用 `--output-format text`
> - 当你需要完整的对话日志时使用 `--output-format json`
> - 对每个对话轮次的实时输出使用 `--output-format stream-json`

## 向 Qwen Code 询问其功能

Qwen Code 内建了对自身文档的访问能力，可以回答关于其功能和限制的问题。

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
> Qwen Code 会基于文档回答这些问题。如需可执行的示例和动手实践，请参考上述具体的工作流章节。

> [!tip]
>
> - Qwen Code 始终可以获取最新的 Qwen Code 文档，无论你使用的是哪个版本
> - 提出具体问题以获得详细答案
> - Qwen Code 可以解释复杂功能，如 MCP 集成、企业配置和高级工作流