# 快速入门

> 👏 欢迎使用 Qwen Code！

本快速入门指南将帮助你在几分钟内开始使用 AI 辅助编程。通过本指南，你将了解如何将 Qwen Code 用于常见的开发任务。

## 开始之前

请确保你已准备好：

- 一个打开的 **终端** 或命令提示符
- 一个可供操作的项目代码
- 来自阿里云模型即服务的 API key（[国内站](https://bailian.console.aliyun.com/) / [国际站](https://modelstudio.console.alibabacloud.com/)），或阿里云编码计划（[国内站](https://bailian.console.aliyun.com/cn-beijing/?tab=coding-plan#/efm/coding-plan-index) / [国际站](https://modelstudio.console.alibabacloud.com/?tab=coding-plan#/efm/coding-plan-index)）订阅

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
> 建议安装后重启终端，以确保环境变量生效。

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
# 首次使用时，系统会提示你配置身份认证
qwen
```

```bash
# 或随时运行 /auth 更改认证方式
/auth
```

首次运行时的菜单会让你连接一个模型提供商。请从以下选项中选择：

- **阿里云模型即服务** — 推荐的设置方式。打开子菜单：
  - **编码计划**：面向个人开发者，包含每周配额和多种模型选择。请参阅[编码计划指南](https://bailian.console.aliyun.com/cn-beijing/?tab=coding-plan#/efm/coding-plan-index)（[国际站](https://modelstudio.console.alibabacloud.com/?tab=coding-plan#/efm/coding-plan-index)）了解设置说明。
  - **Token 计划**：按用量计费，使用专有端点，适用于团队和企业。
  - **标准 API Key**：使用阿里云模型即服务（[国内站](https://bailian.console.aliyun.com/) / [国际站](https://modelstudio.console.alibabacloud.com/)）的现有 API key 进行连接。详情请参阅 API 设置指南（[国内站](https://bailian.console.aliyun.com/cn-beijing/?tab=doc#/doc/?type=model&url=3023091) / [国际站](https://modelstudio.console.alibabacloud.com/ap-southeast-1?tab=doc#/doc/?type=model&url=2974721)）。
- **第三方提供商** — 选择内置提供商（DeepSeek、MiniMax、Z.AI、ModelScope、OpenRouter、Requesty 等），并通过 API key 连接。
- **自定义提供商** — 手动连接本地服务器、代理或不受支持的提供商。

> ⚠️ **注意**：Qwen OAuth 已于 2026 年 4 月 15 日停用。如果你之前使用的是 Qwen OAuth，请切换到上述方法之一。

> [!note]
>
> 当你首次使用 Qwen 账号认证 Qwen Code 时，系统会自动为你创建一个名为 ".qwen" 的工作空间。该工作空间为你组织内的所有 Qwen Code 使用情况提供集中的成本跟踪和管理。

> [!tip]
>
> 要配置身份认证，启动 Qwen Code 并运行 `/auth`。随时运行 `/doctor` 检查当前配置。详情请参阅[身份认证](./configuration/auth)页面。

## 第三步：开始你的第一个会话

在任意项目目录中打开终端，启动 Qwen Code：

```bash
# 可选
cd /path/to/your/project
# 启动 Qwen
qwen
```

你将看到 Qwen Code 欢迎界面，包含会话信息、最近对话和最新更新。输入 `/help` 查看可用命令。

## 与 Qwen Code 对话

### 提出你的第一个问题

Qwen Code 会分析你的文件并给出摘要。你也可以提出更具体的问题：

```
解释一下文件夹结构
```

你还可以询问 Qwen Code 自身的能力：

```
Qwen Code 能做什么？
```

> [!note]
>
> Qwen Code 会根据需要读取你的文件，无需手动添加上下文。Qwen Code 也可以访问自己的文档，回答关于其功能和能力的问题。

### 进行你的第一次代码修改

现在让 Qwen Code 做一些实际的编码工作。尝试一个简单的任务：

```
在主文件中添加一个 hello world 函数
```

Qwen Code 将：

1. 找到合适的文件
2. 展示提议的修改
3. 征求你的批准
4. 执行编辑

> [!note]
>
> Qwen Code 在修改文件前总会请求权限。你可以逐个批准更改，也可以在会话中启用“全部接受”模式。

### 使用 Git 与 Qwen Code 协作

Qwen Code 让 Git 操作变得自然对话化：

```
我改动了哪些文件？
```

```
提交我的更改，附上描述性信息
```

你也可以提示更复杂的 Git 操作：

```
创建一个名为 feature/quickstart 的新分支
```

```

让我看看最近 5 次提交
```

```
帮我解决合并冲突
```

### 修复 Bug 或添加功能

Qwen Code 擅长调试和功能实现。

用自然语言描述你的需求：

```
在用户注册表单中添加输入验证
```

或者修复现有问题：

```
有个 bug，用户能提交空表单——修复它
```

Qwen Code 将：

- 定位相关代码
- 理解上下文
- 实现解决方案
- 运行测试（如果可用）

### 尝试其他常见工作流程

与 Qwen Code 协作的方式有很多：

**重构代码**

```
重构认证模块，使用 async/await 替代回调
```

**编写测试**

```

计算器函数的单元测试
```

**更新文档**

```
更新 README，添加安装说明
```

**代码审查**

```
审查我的更改并提出改进建议
```

> [!tip]
>
> **请记住**：Qwen Code 是你的 AI 编程搭档。像与乐于助人的同事交流一样——描述你想实现的目标，它会帮你达成。

## 常用命令

以下是日常使用中最常用的命令：

| 命令                  | 作用                                           | 示例                           |
| --------------------- | ---------------------------------------------- | ------------------------------ |
| `qwen`                | 启动 Qwen Code                                 | `qwen`                         |
| `/auth`               | 更改身份认证方式（会话中）                     | `/auth`                        |
| `/doctor`             | 检查当前身份认证和环境                         | `/doctor`                      |
| `/help`               | 显示可用命令的帮助信息                         | `/help` 或 `/?`                |
| `/compress`           | 用摘要替换聊天历史以节省 Token                 | `/compress`                    |
| `/clear`              | 清除终端屏幕内容                               | `/clear`（快捷键：`Ctrl+L`）   |
| `/theme`              | 更改 Qwen Code 的视觉主题                      | `/theme`                       |
| `/language`           | 查看或更改语言设置                             | `/language`                    |
| → `ui [语言]`         | 设置 UI 界面语言                              | `/language ui zh-CN`           |
| → `output [语言]`     | 设置 LLM 输出语言                            | `/language output Chinese`       |
| `/quit`               | 立即退出 Qwen Code                             | `/quit` 或 `/exit`             |

参见 [CLI 参考](./features/commands) 获取完整命令列表。

## 给初学者的实用建议

**具体描述你的需求**

- 不要说：“修复这个 bug”
- 可以尝试：“修复登录 bug，用户输入错误密码后看到空白页面”

**分步骤说明**

- 将复杂任务分解成步骤：

```
1. 为用户资料表创建一个新的数据库表
2. 创建一个获取和更新用户资料的 API 端点
3. 构建一个允许用户查看和编辑信息的网页
```

**让 Qwen Code 先探索**

- 在做出更改前，让 Qwen Code 理解你的代码：

```
分析数据库架构
```

```
构建一个仪表板，显示我们英国客户最常退货的产品
```

**使用快捷键节省时间**

- 按 `?` 查看所有可用的键盘快捷键
- 使用 Tab 进行命令补全
- 按 ↑ 查看命令历史
- 输入 `/` 查看所有斜杠命令

## 获取帮助

- **在 Qwen Code 中**：输入 `/help` 或提问“如何...”
- **文档**：你正在阅读！浏览其他指南
- **社区**：加入我们的 [GitHub Discussion](https://github.com/QwenLM/qwen-code/discussions) 获取技巧和支持