# Qwen Code 概览

[![@qwen-code/qwen-code 下载量](https://img.shields.io/npm/dw/@qwen-code/qwen-code.svg)](https://npm-compare.com/@qwen-code/qwen-code)  
[![@qwen-code/qwen-code 版本号](https://img.shields.io/npm/v/@qwen-code/qwen-code.svg)](https://www.npmjs.com/package/@qwen-code/qwen-code)

> 了解 Qwen Code —— Qwen 推出的终端内智能编程工具，助你以前所未有的速度将想法转化为代码。

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

选择 **Qwen OAuth（免费）** 认证方式，并按提示完成登录。接下来，让我们先了解你的代码库。可尝试以下任一命令：

```
这个项目是做什么的？
```

![](https://cloud.video.taobao.com/vod/j7-QtQScn8UEAaEdiv619fSkk5p-t17orpDbSqKVL5A.mp4)

首次使用时会提示你登录。就这样！[继续快速入门（5 分钟）→](./quickstart)

> [!tip]
>
> 若遇到问题，请参阅 [故障排除指南](./support/troubleshooting)。

> [!note]
>
> **全新 VS Code 扩展（Beta 版）**：更倾向图形化界面？我们的全新 **VS Code 扩展** 提供开箱即用的原生 IDE 体验，无需熟悉终端操作。只需从 Marketplace 安装，即可直接在侧边栏中使用 Qwen Code 进行编程。立即下载并安装 [Qwen Code Companion](https://marketplace.visualstudio.com/items?itemName=qwenlm.qwen-code-vscode-ide-companion)。

## Qwen Code 为你提供的功能

- **根据描述构建功能**：用自然语言告诉 Qwen Code 你想构建什么。它会制定计划、编写代码，并确保代码正常运行。
- **调试与修复问题**：描述一个 Bug 或粘贴错误信息。Qwen Code 将分析你的代码库，定位问题并实现修复。
- **轻松浏览任意代码库**：就团队代码库中的任何问题向 Qwen Code 提问，即可获得深思熟虑的回答。Qwen Code 持续感知你整个项目的结构，能从网络获取最新信息，并借助 [MCP](./features/mcp) 从 Google Drive、Figma、Slack 等外部数据源拉取内容。
- **自动化繁琐任务**：修复烦琐的代码风格（lint）问题、解决合并冲突、撰写发布说明。所有这些操作均可通过开发者机器上的单条命令完成，或在 CI 中自动执行。

## 为什么开发者钟爱 Qwen Code

- **在终端中运行**：不是另一个聊天窗口，也不是另一个 IDE。Qwen Code 在你本就工作的环境中、用你早已喜爱的工具与你相遇。
- **可执行操作**：Qwen Code 可直接编辑文件、运行命令并创建提交。需要更多能力？[MCP](./features/mcp) 让 Qwen Code 能读取 Google Drive 中的设计文档、更新 Jira 中的任务，或集成 _你_ 自定义的开发工具。
- **遵循 Unix 哲学**：Qwen Code 具备可组合性与可脚本化特性。例如：`tail -f app.log | qwen -p "Slack 我，若在此日志流中发现任何异常"` _完全可行_。你的 CI 也可运行：`qwen -p "若出现新的文本字符串，则将其翻译为法语，并发起 PR 供 @lang-fr-team 审阅"`。