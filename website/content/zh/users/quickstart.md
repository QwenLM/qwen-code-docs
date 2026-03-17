# 快速入门

> 👏 欢迎使用 Qwen Code！

本快速入门指南将帮助你在几分钟内开始使用 AI 驱动的编程辅助功能。完成本指南后，你将掌握如何在常见开发任务中使用 Qwen Code。

## 开始前准备

请确保你已具备以下条件：

- 已打开一个**终端**或命令提示符
- 有一个可供操作的代码项目
- 拥有一个 [Qwen Code](https://chat.qwen.ai/auth?mode=register) 账户

## 步骤 1：安装 Qwen Code

可通过以下任一方式安装 Qwen Code：

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
> 建议安装完成后重启终端，以确保环境变量生效。

### 手动安装

**前提条件**

请确保已安装 Node.js 20 或更高版本。可从 [nodejs.org](https://nodejs.org/zh-cn/download/) 下载。

**NPM**

```bash
npm install -g @qwen-code/qwen-code@latest
```

**Homebrew（macOS、Linux）**

```bash
brew install qwen-code
```

## 第二步：登录你的账号

Qwen Code 需要账号才能使用。首次运行 `qwen` 命令启动交互式会话时，系统将提示你登录：

```bash

# 首次使用时会提示登录
qwen
```

# 按照提示使用您的账户登录  

 `/auth`，选择 `Qwen OAuth`，登录您的账户并按提示完成确认。登录成功后，您的凭据将被保存，后续无需重复登录。

> [!note]
>
> 首次使用 Qwen Code 通过 Qwen 账户完成身份验证时，系统会自动为您创建一个名为 `.qwen` 的工作区。该工作区可集中跟踪和管理您所在组织内所有 Qwen Code 的使用成本。

> [!tip]
>
> 如需重新登录或切换账户，请在 Qwen Code 中执行 `/auth` 命令。

## 第三步：启动您的首个会话  

在任意项目目录中打开终端，并启动 Qwen Code：

```bash
# （可选）进入项目目录
cd /path/to/your/project

# 启动 Qwen
qwen
```

您将看到 Qwen Code 的欢迎界面，其中包含当前会话信息、最近的对话记录以及最新更新。输入 `/help` 可查看所有可用命令。

## 与 Qwen Code 聊天

### 提出你的第一个问题

Qwen Code 将分析你的文件并提供摘要。你也可以提出更具体的问题：

```
解释该文件夹的结构
```

你还可以向 Qwen Code 询问其自身能力：

```
Qwen Code 能做什么？
```

> [!note]
>
> Qwen Code 仅在需要时读取你的文件——你无需手动添加上下文。此外，Qwen Code 可访问其自身文档，因此能回答有关其功能和能力的问题。

### 进行你的首次代码修改

现在让我们让 Qwen Code 真正编写一些代码。尝试一个简单任务：

```
在主文件中添加一个 hello world 函数
```

Qwen Code 将执行以下操作：

1. 找到合适的文件  
2. 向你展示拟议的更改  
3. 请求你的批准  
4. 执行编辑  

> [!note]
>
> Qwen Code 在修改任何文件前总会请求你的许可。你可以逐项批准更改，或在当前会话中启用“全部接受”模式。

### 使用 Git 与 Qwen Code 协作

Qwen Code 让 Git 操作变得像对话一样自然：

```
我修改了哪些文件？
```

```
用一条描述性消息提交我的更改
```

你还可以提示执行更复杂的 Git 操作：

```
创建一个名为 feature/quickstart 的新分支
```

```
显示最近的 5 次提交记录
```

```
帮我解决合并冲突
```

### 修复 Bug 或添加功能

Qwen Code 擅长调试和实现新功能。

用自然语言描述你的需求：

```
为用户注册表单添加输入验证
```

或修复现有问题：

```
当前存在一个 Bug：用户可以提交空表单——请修复它
```

Qwen Code 将会：

- 定位相关代码  
- 理解上下文  
- 实现解决方案  
- 如有可用测试，则运行测试

### 尝试其他常见工作流

使用 Qwen Code 有多种方式：

**重构代码**

```
将认证模块重构为使用 async/await，而非回调函数
```

**编写测试**

```
为计算器函数编写单元测试
```

**更新文档**

```
在 README 中添加安装说明
```

**代码审查**

```
审查我的修改并提出改进建议
```

> [!tip]
>
> **请记住**：Qwen Code 是你的 AI 结对编程伙伴。像与一位乐于助人的同事交流一样与它对话——描述你希望达成的目标，它会助你实现。

## 必备命令

以下是日常使用中最重要的一些命令：

| 命令                 | 功能说明                                         | 示例                           |
| --------------------- | ------------------------------------------------ | ----------------------------- |
| `qwen`                | 启动 Qwen Code                                   | `qwen`                        |
| `/auth`               | 更改认证方式                                     | `/auth`                       |
| `/help`               | 显示可用命令的帮助信息                           | `/help` 或 `/?`               |
| `/compress`           | 用摘要替换聊天历史以节省 Token                   | `/compress`                   |
| `/clear`              | 清空终端屏幕内容                                 | `/clear`（快捷键：`Ctrl+L`）  |
| `/theme`              | 更改 Qwen Code 的视觉主题                        | `/theme`                      |
| `/language`           | 查看或更改语言设置                               | `/language`                   |
| → `ui [language]`     | 设置用户界面语言                                 | `/language ui zh-CN`          |
| → `output [language]` | 设置大语言模型（LLM）输出语言                    | `/language output Chinese`    |
| `/quit`               | 立即退出 Qwen Code                               | `/quit` 或 `/exit`            |

完整命令列表请参阅 [CLI 参考文档](./features/commands)。

## 新手实用技巧

**请求要具体明确**

- 不要这样写：“修复这个 bug”
- 而应这样写：“修复登录功能的 bug：用户输入错误凭据后显示空白页面”

**使用分步指令**

- 将复杂任务拆解为多个步骤：

```
1. 为用户档案创建一张新的数据库表
2. 创建一个用于获取和更新用户档案的 API 接口
3. 构建一个网页，允许用户查看并编辑自己的信息
```

**先让 Qwen Code 自主探索**

- 在做出修改前，先让 Qwen Code 理解你的代码：

```
分析数据库结构
```

```
构建一个仪表板，展示被英国客户退货最频繁的商品
```

**使用快捷键节省时间**

- 按 `?` 键查看所有可用的键盘快捷键
- 使用 Tab 键自动补全命令
- 按 ↑ 键调出历史命令
- 输入 `/` 查看所有斜杠命令

## 获取帮助

- **在 Qwen Code 中**：输入 `/help` 或提问“我该如何……”
- **文档**：您当前就在文档中！请浏览其他指南
- **社区**：加入我们的 [GitHub 讨论区](https://github.com/QwenLM/qwen-code/discussions)，获取使用技巧与支持