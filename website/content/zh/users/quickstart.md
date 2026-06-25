# 快速开始

> 👏 欢迎使用 Qwen Code！

本快速入门指南将帮助你在几分钟内开始使用 AI 辅助编程。完成后，你将了解如何使用 Qwen Code 完成常见的开发任务。

## 开始之前

请确保你已准备好：

- 打开的**终端**或命令提示符
- 一个代码项目
- 来自阿里云百炼的 API key（[国内版](https://bailian.console.aliyun.com/) / [国际版](https://modelstudio.console.alibabacloud.com/)），或阿里云编程计划（[国内版](https://bailian.console.aliyun.com/cn-beijing/?tab=coding-plan#/efm/coding-plan-index) / [国际版](https://modelstudio.console.alibabacloud.com/?tab=coding-plan#/efm/coding-plan-index)）订阅

## 第一步：安装 Qwen Code

使用以下任一方式安装 Qwen Code：

### 快速安装（推荐）

**Linux / macOS**

```sh
curl -fsSL https://qwen-code-assets.oss-cn-hangzhou.aliyuncs.com/installation/install-qwen-standalone.sh | bash
```

**Windows**

```powershell
irm https://qwen-code-assets.oss-cn-hangzhou.aliyuncs.com/installation/install-qwen-standalone.ps1 | iex
```

> [!note]
>
> 建议安装完成后重启终端，以确保环境变量生效。

### 手动安装

**前置条件**

请确保已安装 Node.js 22 或更高版本。从 [nodejs.org](https://nodejs.org/en/download) 下载。

**NPM**

```bash
npm install -g @qwen-code/qwen-code@latest
```

**Homebrew（macOS、Linux）**

```bash
brew install qwen-code
```

## 第二步：配置认证

使用 `qwen` 命令启动交互式会话时，系统会提示你配置认证：

```bash
# 首次使用时会提示配置认证
qwen
```

```bash
# 或随时运行 /auth 切换认证方式
/auth
```

首次运行菜单可让你连接模型提供商，选择以下之一：

- **Alibaba ModelStudio** — 推荐配置，进入子菜单后可选：
  - **编程计划（Coding Plan）**：面向个人开发者，含每周额度和丰富的模型选项。配置说明请参见[编程计划指南](https://bailian.console.aliyun.com/cn-beijing/?tab=coding-plan#/efm/coding-plan-index)（[国际版](https://modelstudio.console.alibabacloud.com/?tab=coding-plan#/efm/coding-plan-index)）。
  - **Token 计划（Token Plan）**：按量计费，使用专属 endpoint，面向团队和企业。
  - **标准 API Key**：使用阿里云百炼的现有 API key 接入（[国内版](https://bailian.console.aliyun.com/) / [国际版](https://modelstudio.console.alibabacloud.com/)）。详情参见 API 配置指南（[国内版](https://bailian.console.aliyun.com/cn-beijing/?tab=doc#/doc/?type=model&url=3023091) / [国际版](https://modelstudio.console.alibabacloud.com/ap-southeast-1?tab=doc#/doc/?type=model&url=2974721)）。
- **第三方提供商** — 选择内置提供商（DeepSeek、MiniMax、Z.AI、ModelScope、OpenRouter、Requesty 等）并使用 API key 接入。
- **自定义提供商** — 手动接入本地服务器、代理或不支持的提供商。

> ⚠️ **注意**：Qwen OAuth 已于 2026 年 4 月 15 日停止使用。如果你之前使用的是 Qwen OAuth，请切换至上述方式之一。

> [!note]
>
> 首次使用 Qwen 账号认证 Qwen Code 时，系统会自动为你创建一个名为 ".qwen" 的工作区，用于集中追踪和管理组织内所有 Qwen Code 的使用费用。

> [!tip]
>
> 启动 Qwen Code 后运行 `/auth` 可配置认证。随时运行 `/doctor` 查看当前配置。详情参见[认证](./configuration/auth)页面。

## 第三步：开始第一个会话

在任意项目目录中打开终端，启动 Qwen Code：

```bash
# 可选
cd /path/to/your/project
# 启动 qwen
qwen
```

你将看到 Qwen Code 欢迎界面，其中包含会话信息、最近对话和最新更新。输入 `/help` 查看可用命令。

## 与 Qwen Code 对话

### 提出第一个问题

Qwen Code 会分析你的文件并提供摘要。你也可以提出更具体的问题：

```
explain the folder structure
```

你还可以询问 Qwen Code 自身的能力：

```
what can Qwen Code do?
```

> [!note]
>
> Qwen Code 会按需读取你的文件，无需手动添加上下文。Qwen Code 还可以访问自身文档，并能回答关于其功能和能力的问题。

### 进行第一次代码修改

现在让 Qwen Code 实际编写代码。试试这个简单任务：

```
add a hello world function to the main file
```

Qwen Code 将：

1. 找到对应文件
2. 展示建议的修改内容
3. 请求你的确认
4. 执行编辑

> [!note]
>
> Qwen Code 在修改文件之前始终会请求权限。你可以逐一确认更改，也可以为当前会话开启"全部接受"模式。

### 使用 Git

Qwen Code 让 Git 操作变得像对话一样自然：

```
what files have I changed?
```

```
commit my changes with a descriptive message
```

你也可以让它执行更复杂的 Git 操作：

```
create a new branch called feature/quickstart
```

```
show me the last 5 commits
```

```
help me resolve merge conflicts
```

### 修复 bug 或添加功能

Qwen Code 擅长调试和功能实现。

用自然语言描述你的需求：

```
add input validation to the user registration form
```

或修复已有问题：

```
there's a bug where users can submit empty forms - fix it
```

Qwen Code 将：

- 定位相关代码
- 理解上下文
- 实现解决方案
- 如有测试则运行测试

### 体验其他常见工作流

Qwen Code 支持多种工作方式：

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
> **提示**：Qwen Code 是你的 AI 结对编程伙伴。像与同事交流一样与它对话——描述你想实现的目标，它会帮你达成。

## 核心命令

以下是日常使用中最重要的命令：

| 命令                  | 功能说明                                         | 示例                          |
| --------------------- | ------------------------------------------------ | ----------------------------- |
| `qwen`                | 启动 Qwen Code                                   | `qwen`                        |
| `/auth`               | 切换认证方式（会话内）                           | `/auth`                       |
| `/doctor`             | 检查当前认证和环境配置                           | `/doctor`                     |
| `/help`               | 显示可用命令的帮助信息                           | `/help` 或 `/?`               |
| `/compress`           | 用摘要替换聊天历史以节省 Token                   | `/compress`                   |
| `/clear`              | 清空终端屏幕内容                                 | `/clear`（快捷键：`Ctrl+L`）  |
| `/theme`              | 更改 Qwen Code 视觉主题                          | `/theme`                      |
| `/language`           | 查看或更改语言设置                               | `/language`                   |
| → `ui [language]`     | 设置 UI 界面语言                                 | `/language ui zh-CN`          |
| → `output [language]` | 设置 LLM 输出语言                                | `/language output Chinese`    |
| `/quit`               | 立即退出 Qwen Code                               | `/quit` 或 `/exit`            |

完整命令列表请参见 [CLI 参考](./features/commands)。

## 新手进阶技巧

**明确表达你的需求**

- 不要说："fix the bug"
- 改为说："fix the login bug where users see a blank screen after entering wrong credentials"

**分步骤描述任务**

- 将复杂任务拆解为步骤：

```
1. create a new database table for user profiles
2. create an API endpoint to get and update user profiles
3. build a webpage that allows users to see and edit their information
```

**先让 Qwen Code 了解你的代码**

- 在修改之前，让 Qwen Code 先理解你的代码：

```
analyze the database schema
```

```
build a dashboard showing products that are most frequently returned by our UK customers
```

**善用快捷键节省时间**

- 按 `?` 查看所有可用键盘快捷键
- 使用 Tab 键补全命令
- 按 ↑ 键查看命令历史
- 输入 `/` 查看所有斜杠命令

## 获取帮助

- **在 Qwen Code 中**：输入 `/help` 或询问"how do I..."
- **文档**：你正在查看！浏览其他指南
- **社区**：加入我们的 [GitHub Discussion](https://github.com/QwenLM/qwen-code/discussions) 获取技巧和支持
