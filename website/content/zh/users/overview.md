# Qwen Code 概述

[![@qwen-code/qwen-code downloads](https://img.shields.io/npm/dw/@qwen-code/qwen-code.svg)](https://npm-compare.com/@qwen-code/qwen-code)
[![@qwen-code/qwen-code version](https://img.shields.io/npm/v/@qwen-code/qwen-code.svg)](https://www.npmjs.com/package/@qwen-code/qwen-code)

> 了解 Qwen Code，这是 Qwen 推出的 Agent 编程工具，直接运行在你的终端中，助你以前所未有的速度将想法转化为代码。

## 30 秒快速上手

### 安装 Qwen Code：

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
> 建议安装完成后重启终端，以确保环境变量生效。如果安装失败，请参阅快速入门指南中的[手动安装](./quickstart#manual-installation)。

### 开始使用 Qwen Code：

```bash
cd your-project
qwen
```

选择 **Qwen OAuth (Free)** 认证方式，并按照提示完成登录。接下来，让我们从了解你的代码库开始。尝试输入以下命令之一：

```
what does this project do?
```

![](https://cloud.video.taobao.com/vod/j7-QtQScn8UEAaEdiv619fSkk5p-t17orpDbSqKVL5A.mp4)

首次使用时会提示你登录。就这么简单！[继续快速入门（5 分钟）→](./quickstart)

> [!tip]
>
> 如果遇到问题，请参阅[故障排除](./support/troubleshooting)。

> [!note]
>
> **全新 VS Code 扩展（Beta）**：更喜欢图形界面？我们全新的 **VS Code 扩展**提供了易于使用的原生 IDE 体验，无需熟悉终端操作。只需从应用市场安装，即可在侧边栏直接使用 Qwen Code 进行编程。立即下载并安装 [Qwen Code Companion](https://marketplace.visualstudio.com/items?itemName=qwenlm.qwen-code-vscode-ide-companion)。

## Qwen Code 能为你做什么

- **根据描述构建功能**：用自然语言告诉 Qwen Code 你想构建什么。它会制定计划、编写代码，并确保代码正常运行。
- **调试与修复问题**：描述一个 bug 或粘贴错误信息。Qwen Code 会分析你的代码库，定位问题并实施修复。
- **浏览任意代码库**：随时询问关于团队代码库的任何问题，并获得详尽的解答。Qwen Code 会掌握整个项目结构，能够从网络获取最新信息，并且通过 [MCP](./features/mcp) 还能接入 Google Drive、Figma 和 Slack 等外部数据源。
- **自动化繁琐任务**：修复琐碎的 lint 问题、解决合并冲突、编写发布说明。只需在开发机上输入一条命令即可完成，或在 CI 中自动执行。
- **[后续建议](./features/followup-suggestions)**：Qwen Code 会预测你接下来想输入的内容，并以幽灵文本（ghost text）形式显示。按 Tab 键接受，或继续输入以忽略。

## 为什么开发者喜爱 Qwen Code

- **直接在终端中运行**：不是又一个聊天窗口，也不是又一个 IDE。Qwen Code 在你熟悉的工作环境中，与你喜爱的工具无缝协作。
- **主动执行操作**：Qwen Code 可以直接编辑文件、运行命令和创建 commit。还不够？[MCP](./features/mcp) 让 Qwen Code 能够读取 Google Drive 中的设计文档、更新 Jira 中的工单，或使用_你自定义的_开发工具。
- **遵循 Unix 哲学**：Qwen Code 支持组合与脚本化。`tail -f app.log | qwen -p "Slack me if you see any anomalies appear in this log stream"` _完全可行_。你的 CI 也可以运行 `qwen -p "If there are new text strings, translate them into French and raise a PR for @lang-fr-team to review"`。