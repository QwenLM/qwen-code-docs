# 快速入门

> 👏 欢迎使用 Qwen Code！

本快速入门指南将帮助你在几分钟内开始使用 AI 辅助编程。通过本指南，你将了解如何将 Qwen Code 用于常见的开发任务。

## **开始之前**

请确保你已准备好：

- 已打开终端或命令提示符
- 一个可供操作的项目代码
- **以下任一选项**：
  - 拥有来自 [**chat.qwen.ai**](https://chat.qwen.ai/?memberPlan=qwen_code&entry=qwen_code&paywallScene=cli) 的 **Plus 或 Pro 订阅**的 Qwen 账户，可解锁对 **Qwen Code 和 Agent** 的访问权限
  - 来自千问AI平台 / **QwenCloud** ([中国](https://platform.qianwenai.com/docs/developer-guides/administration/api-keys) / [国际](https://docs.qwencloud.com/developer-guides/administration/api-keys)) 的 API 密钥或 Token Plan 订阅 — 推荐设置
  - 来自 **阿里云 ModelStudio** ([北京](https://bailian.console.aliyun.com/) / [国际](https://modelstudio.console.alibabacloud.com/)) 的 API 密钥
  - **阿里云 Token Plan** ([北京](https://bailian.console.aliyun.com/cn-beijing?tab=doc#/doc/?type=model&url=3028856) / [国际](https://modelstudio.console.alibabacloud.com/ap-southeast-1?tab=doc#/doc/?type=model)) 订阅

## 第一步：安装 Qwen Code

使用以下任一方法安装 Qwen Code：

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
> 建议在安装后重启终端，以确保环境变量生效。

### 手动安装

**前提条件**

请确保已安装 Node.js 22 或更高版本。从 [nodejs.org](https://nodejs.org/en/download) 下载。

**NPM**

```bash
npm install -g @qwen-code/qwen-code@latest
```

**Homebrew（macOS、Linux）**

```bash
brew install qwen-code
```

## 第二步：配置身份认证

当你使用 `qwen` 命令启动交互式会话时，会提示你配置身份认证：

```bash
# You'll be prompted to set up authentication on first use
qwen
```

```bash
# Or run /auth anytime to change authentication method
/auth
```

首次运行菜单允许您连接模型提供商。请选择以下之一：

- [**带订阅的 Qwen 账户**](https://chat.qwen.ai/?memberPlan=qwen_code&entry=qwen_code&paywallScene=cli) — 使用您的 Qwen 账户登录，通过 **Plus 或 Pro 订阅**访问 **Qwen Code 和 Agent**。如果您还没有订阅，请访问 [**chat.qwen.ai**](https://chat.qwen.ai/?memberPlan=qwen_code&entry=qwen_code&paywallScene=cli) 订阅 Plus 或 Pro，然后返回 Qwen Code 并选择 [**带订阅的 Qwen 账户**](https://chat.qwen.ai/?memberPlan=qwen_code&entry=qwen_code&paywallScene=cli)。
- **QwenCloud** — 推荐设置。打开子菜单：
  - **Token Plan**：在专用端点上具有每月 Credit 配额的订阅（个人版和团队版）。
  - **标准 API 密钥**：按量付费，使用现有的平台 API 密钥进行连接。

  无论哪种方式，您都需要明确选择平台（中国或国际），因此 UI 语言不会决定您的端点。有关详细信息，请参阅[认证 → 选项 2：QwenCloud](./configuration/auth)。

- **阿里云模型即服务** — 打开子菜单：
  - **Coding Plan**：使用阿里云 Coding Plan API 密钥进行连接。有关设置，请参阅[认证](./configuration/auth.md#-option-3-alibaba-cloud-coding-plan)。
  - **Token 计划**：按用量计费，使用专有端点，适用于团队和企业。请参阅 [Token 计划指南](https://bailian.console.aliyun.com/cn-beijing?tab=doc#/doc/?type=model&url=3028856)（[国际站](https://modelstudio.console.alibabacloud.com/ap-southeast-1?tab=doc#/doc/?type=model)）了解设置说明。
  - **标准 API Key**：使用阿里云模型即服务（[国内站](https://bailian.console.aliyun.com/) / [国际站](https://modelstudio.console.alibabacloud.com/)）的现有 API key 进行连接。详情请参阅 API 设置指南（[国内站](https://bailian.console.aliyun.com/cn-beijing/?tab=doc#/doc/?type=model&url=3023091) / [国际站](https://modelstudio.console.alibabacloud.com/ap-southeast-1?tab=doc#/doc/?type=model&url=2974721)）。
- **第三方提供商** — 选择内置提供商（DeepSeek、Grok、MiniMax、Z.AI、Kimi、Idealab、ModelScope、OpenRouter、Requesty 等），并通过 API key 连接。
- **自定义提供商** — 手动连接本地服务器、代理或不受支持的提供商。

> [!note]
>
> Qwen Code 将配置和自定义项存储在 `.qwen` 目录中：`~/.qwen/` 用于用户级设置（如 `settings.json`）和全局自定义命令，`<project>/.qwen/` 用于项目级文件，如自定义命令和摘要。

> [!tip]
>
> 要配置身份认证，启动 Qwen Code 并运行 `/auth`。随时运行 `/doctor` 检查当前配置。详情请参阅[身份认证](./configuration/auth)页面。

## 第三步：开始您的第一次会话

在任何项目目录中打开终端并启动 Qwen Code：

```bash
# optional
cd /path/to/your/project
# start qwen
qwen
```

你将看到 Qwen Code 欢迎界面，包含会话信息、最近对话和最新更新。输入 `/help` 查看可用命令。

## 与 Qwen Code 聊天

### 提出您的第一个问题

Qwen Code 将分析您的文件并提供摘要。您也可以提出更具体的问题：

```
explain the folder structure
```

您还可以询问 Qwen Code 关于其自身功能的问题：

```
what can Qwen Code do?
```

> [!note]
>
> Qwen Code 会根据需要读取您的文件 - 您不必手动添加上下文。Qwen Code 还可以访问其自身的文档，并能回答有关其功能和能力的问题。

### 进行您的第一次代码更改

现在让我们让 Qwen Code 执行一些实际的编码工作。尝试一个简单的任务：

```
add a hello world function to the main file
```

Qwen Code 将：

1. 找到合适的文件
2. 向您显示拟议的更改
3. 请求您的批准
4. 进行编辑

> [!note]
>
> Qwen Code 在修改文件之前始终会请求许可。您可以批准单个更改，或在会话期间启用“全部接受”模式。

### 结合 Git 使用 Qwen Code

Qwen Code 使 Git 操作变得对话化：

```
what files have I changed?
```

```
commit my changes with a descriptive message
```

您也可以提示执行更复杂的 Git 操作：

```
create a new branch called feature/quickstart
```

```
show me the last 5 commits
```

```
help me resolve merge conflicts
```

### 修复错误或添加功能

Qwen Code 擅长调试和功能实现。

用自然语言描述您的需求：

```
add input validation to the user registration form
```

或者修复现有问题：

```
there's a bug where users can submit empty forms - fix it
```

Qwen Code 将：

- 定位相关代码
- 理解上下文
- 实施解决方案
- 如果可用，则运行测试

### 尝试其他常见工作流程

有多种方式使用 Qwen Code：

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
> **记住**：Qwen Code 是你的 AI 结对编程伙伴。像对待一位乐于助人的同事那样与它交流——描述你想要实现的目标，它会帮助你达成。

## 常用命令

以下是日常使用中最重要的一些命令：

| 命令               | 功能说明                                     | 示例                            |
| --------------------- | ------------------------------------------------ | ---------------------------------- |
| `qwen`                | 启动 Qwen Code                                 | `qwen`                         |
| `/auth`               | 更改身份认证方式（会话中）                     | `/auth`                        |
| `/doctor`             | 检查当前身份认证和环境                         | `/doctor`                      |
| `/help`               | 显示可用命令的帮助信息                         | `/help` 或 `/?`                |
| `/compress`           | 用摘要替换聊天历史以节省 Token                 | `/compress`                    |
| `/clear`              | 清除对话历史并释放上下文                               | `/clear`（别名：`reset`、`new`）   |
| `/theme`              | 更改 Qwen Code 的视觉主题                      | `/theme`                       |
| `/language`           | 查看或更改语言设置                             | `/language`                    |
| → `ui [language]`     | 设置界面语言                        | `/language ui zh-CN`               |
| → `output [language]` | 设置 LLM 输出语言                          | `/language output Chinese`         |
| `/quit`               | 立即退出 Qwen Code                             | `/quit` 或 `/exit`             |

参见 [CLI 参考](./features/commands) 获取完整命令列表。

## 新手进阶技巧

**请求要具体明确**

- 不要说：“修复 bug”
- 试着说：“修复用户输入错误凭据后登录页面显示空白屏幕的 bug”

**使用分步指令**

- 将复杂任务分解为步骤：

```
1. create a new database table for user profiles
2. create an API endpoint to get and update user profiles
3. build a webpage that allows users to see and edit their information
```

**先让 Qwen Code 探索代码**

- 在进行修改之前，先让 Qwen Code 理解你的代码：

```
analyze the database schema
```

```
build a dashboard showing products that are most frequently returned by our UK customers
```

**利用快捷键节省时间**

- 按 `?` 查看所有可用的键盘快捷键
- 使用 Tab 进行命令补全
- 按 ↑ 查看命令历史
- 输入 `/` 查看所有斜杠命令

## 获取帮助

- **在 Qwen Code 中**：输入 `/help` 或提问“如何...”
- **文档**：你正在阅读！浏览其他指南
- **社区**：加入我们的 [GitHub Discussion](https://github.com/QwenLM/qwen-code/discussions) 获取技巧和支持
