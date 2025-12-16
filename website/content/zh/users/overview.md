# Qwen Code 概览

> 了解 Qwen Code，这是 Qwen 推出的一款智能编码工具，可在终端中使用，帮助你比以往更快地将想法转化为代码。

## 30 秒快速入门

前提条件：

- 一个 [Qwen Code](https://chat.qwen.ai/auth?mode=register) 账户
- 需要安装 [Node.js 20+](https://nodejs.org/zh-cn/download)，你可以使用 `node -v` 来检查版本。如果尚未安装，请使用以下命令进行安装。

### 安装 Qwen Code：

**NPM**（推荐）

```bash
npm install -g @qwen-code/qwen-code@latest
```

**Homebrew**（macOS、Linux）

```bash
brew install qwen-code
```

### 开始使用 Qwen Code：

```bash
cd your-project
qwen
```

选择 **Qwen OAuth（免费）** 认证方式并根据提示登录。然后我们开始了解你的代码库。尝试以下命令之一：

```
what does this project do?
```

![](https://gw.alicdn.com/imgextra/i2/O1CN01XoPbZm1CrsZzvMQ6m_!!6000000000135-1-tps-772-646.gif)

首次使用时会提示你登录。就是这样！[继续快速入门（5 分钟）→](/users/quickstart)

> [!tip]
>
> 如果遇到问题，请参见 [故障排除](/users/support/troubleshooting)。

> [!note]
>
> **全新 VS Code 扩展（Beta）**：更喜欢图形界面？我们的新 **VS Code 扩展** 提供了易于使用的原生 IDE 体验，无需熟悉终端操作。只需从市场安装，即可在侧边栏中直接使用 Qwen Code 编码。你可以在 VS Code 市场中搜索 **Qwen Code** 并下载。

## Qwen Code 为你做什么

- **根据描述构建功能**：用自然语言告诉 Qwen Code 你想要构建什么。它会制定计划、编写代码，并确保代码可以正常运行。
- **调试和修复问题**：描述一个 bug 或粘贴错误信息。Qwen Code 将分析你的代码库，找出问题所在，并实现修复。
- **浏览任何代码库**：询问有关团队代码库的任何问题，并获得深思熟虑的回答。Qwen Code 始终了解整个项目结构，能够从网络上查找最新信息，并通过 [MCP](/users/features/mcp) 从 Google Drive、Figma 和 Slack 等外部数据源获取信息。
- **自动化繁琐任务**：修复棘手的 lint 问题、解决合并冲突、编写发布说明。所有这些都可以通过开发机上的单个命令完成，或在 CI 中自动执行。

## 为什么开发者喜爱 Qwen Code

- **在你的终端中运行**：不是另一个聊天窗口，也不是另一个 IDE。Qwen Code 在你已经使用的地方、用你已经熟悉的工具来协助你。
- **可直接操作**：Qwen Code 可以直接编辑文件、执行命令和创建提交。需要更多功能？[MCP](/users/features/mcp) 让 Qwen Code 能够读取你在 Google Drive 中的设计文档、更新你在 Jira 中的工单，或者使用*你自己*定制的开发工具。
- **Unix 哲学**：Qwen Code 是可组合且可脚本化的。`tail -f app.log | qwen -p "如果在这个日志流中发现异常就发 Slack 给我"` *是可以运行的*。你的 CI 可以运行 `qwen -p "如果有新的文本字符串，将其翻译成法语并发起一个 PR 供 @lang-fr-team 审核"`。