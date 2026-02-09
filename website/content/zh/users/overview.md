# Qwen Code 概述

[![@qwen-code/qwen-code 下载量](https://img.shields.io/npm/dw/@qwen-code/qwen-code.svg)](https://npm-compare.com/@qwen-code/qwen-code)
[![@qwen-code/qwen-code 版本](https://img.shields.io/npm/v/@qwen-code/qwen-code.svg)](https://www.npmjs.com/package/@qwen-code/qwen-code)

> 了解 Qwen Code，这是 Qwen 的 AI 编码助手，运行在你的终端中，帮助你比以往更快地将想法转化为代码。

## 30 秒快速开始

前提条件：

- 一个 [Qwen Code](https://chat.qwen.ai/auth?mode=register) 账户
- 需要 [Node.js 20+](https://nodejs.org/zh-cn/download)，你可以使用 `node -v` 检查版本。如果未安装，请使用以下命令进行安装。

### 安装 Qwen Code：

**NPM**（推荐）

```bash
npm install -g @qwen-code/qwen-code@latest
```

**Homebrew**（macOS, Linux）

```bash
brew install qwen-code
```

### 开始使用 Qwen Code：

```bash
cd your-project
qwen
```

选择 **Qwen OAuth (免费)** 认证并按照提示登录。然后让我们从了解你的代码库开始。尝试以下命令之一：

```
这个项目是做什么的？
```

![](https://cloud.video.taobao.com/vod/j7-QtQScn8UEAaEdiv619fSkk5p-t17orpDbSqKVL5A.mp4)

首次使用时会提示你登录。就是这样！[继续快速入门（5 分钟）→](./quickstart)

> [!tip]
>
> 如果遇到问题，请参见[故障排除](./support/troubleshooting)。

> [!note]
>
> **新 VS Code 扩展（测试版）**：更喜欢图形界面？我们的新 **VS Code 扩展** 提供了易于使用的原生 IDE 体验，无需熟悉终端操作。只需从市场安装，即可直接在侧边栏中使用 Qwen Code 开始编码。立即下载并安装 [Qwen Code Companion](https://marketplace.visualstudio.com/items?itemName=qwenlm.qwen-code-vscode-ide-companion)。

## Qwen Code 能为你做什么

- **从描述构建功能**：用简单的语言告诉 Qwen Code 你想要构建什么。它会制定计划、编写代码并确保其正常工作。
- **调试和修复问题**：描述一个 bug 或粘贴错误消息。Qwen Code 将分析你的代码库，识别问题并实施修复。
- **导航任何代码库**：询问关于团队代码库的任何问题，并获得深思熟虑的答案。Qwen Code 维护对你整个项目结构的感知，可以从网络获取最新信息，并且通过 [MCP](./features/mcp) 可以从 Google Drive、Figma 和 Slack 等外部数据源拉取数据。
- **自动化繁琐任务**：修复棘手的 lint 问题、解决合并冲突和编写发布说明。所有这些都可以从你的开发机器上通过单个命令完成，或在 CI 中自动执行。

## 开发者为何青睐 Qwen Code

- **在你的终端中工作**：不是另一个聊天窗口。不是另一个 IDE。Qwen Code 在你已经工作的环境中，配合你已经喜爱的工具。
- **执行操作**：Qwen Code 可以直接编辑文件、运行命令和创建提交。需要更多功能？[MCP](./features/mcp) 让 Qwen Code 能够读取你在 Google Drive 中的设计文档，在 Jira 中更新工单，或使用 _你的_ 自定义开发工具。
- **Unix 哲学**：Qwen Code 是可组合和可脚本化的。`tail -f app.log | qwen -p "如果在此日志流中出现任何异常，请 Slack 通知我"` 这样的命令 _可以工作_。你的 CI 可以运行 `qwen -p "如果有新的文本字符串，将它们翻译成法语并为 @lang-fr-team 创建一个 PR 供审查"`。