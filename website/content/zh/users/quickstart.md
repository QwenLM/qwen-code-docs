# 快速开始

> 👏 欢迎使用 Qwen Code！

本快速入门指南将帮助你在几分钟内上手 AI 编程辅助功能。阅读完毕后，你将了解如何使用 Qwen Code 完成常见的开发任务。

## 开始之前

请确保你已具备以下条件：

- 已打开**终端**或命令提示符
- 一个可供操作的代码项目
- 一个 [Qwen Code](https://chat.qwen.ai/auth?mode=register) 账号

## 步骤 1：安装 Qwen Code

请使用以下任一方法安装 Qwen Code：

### 快速安装（推荐）

**Linux / macOS**

```sh
curl -fsSL https://qwen-code-assets.oss-cn-hangzhou.aliyuncs.com/installation/install-qwen.sh | bash
```

**Windows（以管理员身份运行 CMD）**

```sh
curl -fsSL -o %TEMP%\install-qwen.bat https://qwen-code-assets.oss-cn-hangzhou.aliyuncs.com/installation/install-qwen.bat && %TEMP%\install-qwen.bat
```

> [!note]
>
> 安装完成后建议重启终端，以确保环境变量生效。

### 手动安装

**前置条件**

请确保已安装 Node.js 20 或更高版本。可从 [nodejs.org](https://nodejs.org/en/download) 下载。

**NPM**

```bash
npm install -g @qwen-code/qwen-code@latest
```

**Homebrew（macOS, Linux）**

```bash
brew install qwen-code
```

## 步骤 2：登录账号

使用 Qwen Code 需要登录账号。当你使用 `qwen` 命令启动交互式会话时，系统会提示你登录：

```bash
# You'll be prompted to log in on first use
qwen
```

```bash
# Follow the prompts to log in with your account
/auth
```

选择 `Qwen OAuth`，登录你的账号并按提示确认。登录成功后，凭证将被保存，后续无需重复登录。

> [!note]
>
> 首次使用 Qwen 账号对 Qwen Code 进行身份验证时，系统会自动为你创建一个名为 `.qwen` 的工作区。该工作区为你的组织提供所有 Qwen Code 使用情况的集中成本跟踪与管理。

> [!tip]
>
> 你也可以在不启动会话的情况下，直接在终端运行 `qwen auth` 来配置身份验证。随时使用 `qwen auth status` 检查当前配置。详情请参阅[身份验证](./configuration/auth)页面。

## 步骤 3：开始首次会话

在任意项目目录中打开终端并启动 Qwen Code：

```bash
# optiona
cd /path/to/your/project
# start qwen
qwen
```

你将看到 Qwen Code 欢迎界面，其中包含会话信息、近期对话和最新更新。输入 `/help` 查看可用命令。

## 与 Qwen Code 对话

### 提出你的第一个问题

Qwen Code 会分析你的文件并提供摘要。你也可以提出更具体的问题：

```
explain the folder structure
```

你还可以询问 Qwen Code 关于其自身能力的问题：

```
what can Qwen Code do?
```

> [!note]
>
> Qwen Code 会按需读取你的文件，无需手动添加上下文。Qwen Code 还可以访问其自身文档，能够回答关于其功能和能力的问题。

### 进行首次代码修改

现在让 Qwen Code 进行实际的编码工作。尝试一个简单的任务：

```
add a hello world function to the main file
```

Qwen Code 将会：

1. 找到合适的文件
2. 向你展示建议的修改
3. 请求你的批准
4. 执行修改

> [!note]
>
> Qwen Code 在修改文件前始终会请求许可。你可以逐个批准修改，或在会话中启用“全部接受”模式。

### 结合 Qwen Code 使用 Git

Qwen Code 让 Git 操作可以通过对话完成：

```
what files have I changed?
```

```
commit my changes with a descriptive message
```

你也可以提示它执行更复杂的 Git 操作：

```
create a new branch called feature/quickstart
```

```
show me the last 5 commits
```

```
help me resolve merge conflicts
```

### 修复 Bug 或添加功能

Qwen Code 擅长调试和功能实现。

使用自然语言描述你的需求：

```
add input validation to the user registration form
```

或修复现有问题：

```
there's a bug where users can submit empty forms - fix it
```

Qwen Code 将会：

- 定位相关代码
- 理解上下文
- 实现解决方案
- 运行可用测试

### 尝试其他常见工作流

你可以通过多种方式与 Qwen Code 协作：

**重构代码**

```
refactor the authentication module to use async/await instead of callbacks
```

**编写测试**

```
write unit tests for the calculator functions
```

**更新文档**

```
update the README with installation instructions
```

**代码审查**

```
review my changes and suggest improvements
```

> [!tip]
>
> **记住**：Qwen Code 是你的 AI 结对编程伙伴。像与乐于助人的同事交流那样与它对话——描述你想要实现的目标，它会协助你达成。

## 常用命令

以下是日常使用中最常用的命令：

| 命令 | 功能说明 | 示例 |
| --------------------- | ------------------------------------------------ | ----------------------------- |
| `qwen` | 启动 Qwen Code | `qwen` |
| `/auth` | 更改身份验证方式（会话内） | `/auth` |
| `qwen auth` | 从终端配置身份验证 | `qwen auth` |
| `qwen auth status` | 检查当前身份验证状态 | `qwen auth status` |
| `/help` | 显示可用命令的帮助信息 | `/help` 或 `/?` |
| `/compress` | 用摘要替换聊天记录以节省 Token | `/compress` |
| `/clear` | 清除终端屏幕内容 | `/clear`（快捷键：`Ctrl+L`） |
| `/theme` | 更改 Qwen Code 视觉主题 | `/theme` |
| `/language` | 查看或更改语言设置 | `/language` |
| → `ui [language]` | 设置 UI 界面语言 | `/language ui zh-CN` |
| → `output [language]` | 设置 LLM 输出语言 | `/language output Chinese` |
| `/quit` | 立即退出 Qwen Code | `/quit` 或 `/exit` |

完整命令列表请参阅 [CLI 参考](./features/commands)。

## 新手进阶技巧

**请求尽量具体明确**

- 不要说：“修复 bug”
- 尝试说：“修复登录 bug，该 bug 会导致用户在输入错误凭证后看到空白屏幕”

**使用分步指令**

- 将复杂任务拆分为步骤：

```
1. create a new database table for user profiles
2. create an API endpoint to get and update user profiles
3. build a webpage that allows users to see and edit their information
```

**让 Qwen Code 先探索代码**

- 在修改前，先让 Qwen Code 理解你的代码：

```
analyze the database schema
```

```
build a dashboard showing products that are most frequently returned by our UK customers
```

**使用快捷键节省时间**

- 按 `?` 查看所有可用键盘快捷键
- 使用 Tab 键自动补全命令
- 按 ↑ 键查看命令历史
- 输入 `/` 查看所有斜杠命令

## 获取帮助

- **在 Qwen Code 中**：输入 `/help` 或询问“如何...”
- **文档**：你正在阅读！浏览其他指南
- **社区**：加入我们的 [GitHub Discussion](https://github.com/QwenLM/qwen-code/discussions) 获取技巧与支持