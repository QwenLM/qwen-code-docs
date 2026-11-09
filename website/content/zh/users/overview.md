# Qwen Code 概述

[![@qwen-code/qwen-code 下载量](https://img.shields.io/npm/dw/@qwen-code/qwen-code.svg)](https://npm-compare.com/@qwen-code/qwen-code) [![@qwen-code/qwen-code 版本](https://img.shields.io/npm/v/@qwen-code/qwen-code.svg)](https://www.npmjs.com/package/@qwen-code/qwen-code)

> 了解 Qwen Code，这是 Qwen 的智能编码工具，运行于您的终端中，助您比以往更快地将想法转化为代码。

## 30 秒快速上手

### 安装 Qwen Code：

推荐的安装程序在您的平台有独立归档文件时会使用它。如果回退到 npm，则 PATH 中必须包含 Node.js 22 或更高版本以及 npm。

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
> 如果安装后 `qwen` 未立即出现在 PATH 中，建议重启终端。如果安装失败，请参阅快速入门指南中的[手动安装](./quickstart#manual-installation)。对于离线安装，请下载发布归档文件并使用 `--archive PATH` 运行安装程序；将 `SHA256SUMS` 保留在归档文件旁边。

### 开始使用 Qwen Code：

```bash
cd your-project
qwen
```

首次启动时，系统会提示你连接一个模型提供商。菜单提供 [**Qwen Account with Subscription**](https://chat.qwen.ai/?memberPlan=qwen_code&entry=qwen_code&paywallScene=cli)（使用来自 [**chat.qwen.ai**](https://chat.qwen.ai/?memberPlan=qwen_code&entry=qwen_code&paywallScene=cli) 的 Qwen Plus 或 Pro 订阅）、**QwenCloud**（官方推荐的设置方式）、**Alibaba ModelStudio**、**第三方提供商**（内置提供商，如 DeepSeek、MiniMax、Z.AI、Kimi 和 OpenRouter，通过 API key 连接）以及 **自定义提供商**（本地服务器、代理或不支持的提供商）。

要使用你的 Qwen 订阅，请选择 [**Qwen Account with Subscription**](https://chat.qwen.ai/?memberPlan=qwen_code&entry=qwen_code&paywallScene=cli) 并使用你的 Qwen 账户登录。**Plus 或 Pro 订阅**可解锁对 **Qwen Code and Agent** 的访问。如果你还没有订阅，请访问 [**chat.qwen.ai**](https://chat.qwen.ai/?memberPlan=qwen_code&entry=qwen_code&paywallScene=cli) 订阅 Plus 或 Pro，然后返回 Qwen Code 并选择 [**Qwen Account with Subscription**](https://chat.qwen.ai/?memberPlan=qwen_code&entry=qwen_code&paywallScene=cli)。

如需 QwenCloud 密钥，请选择 **QwenCloud → Token Plan** 或 **QwenCloud → Standard API Key**，然后选择平台（中国区或国际版）— 请参阅[身份验证](https://qwenlm.github.io/qwen-code-docs/en/users/configuration/auth/)。

对于[阿里云 Token 计划](https://bailian.console.aliyun.com/cn-beijing?tab=doc#/doc/?type=model&url=3028856)（[国际版](https://modelstudio.console.alibabacloud.com/ap-southeast-1?tab=doc#/doc/?type=model)），选择 **Alibaba ModelStudio → Token Plan**；要使用 ModelStudio API key，请选择 **Alibaba ModelStudio → Standard API Key** 并按照 API 设置指南（[北京](https://bailian.console.aliyun.com/cn-beijing/?tab=doc#/doc/?type=model&url=3023091) / [国际版](https://modelstudio.console.alibabacloud.com/ap-southeast-1?tab=doc#/doc/?type=model&url=2974721)）操作。

然后让我们开始了解你的代码库。试试以下命令之一：

```
what does this project do?
```

![](https://cloud.video.taobao.com/vod/j7-QtQScn8UEAaEdiv619fSkk5p-t17orpDbSqKVL5A.mp4)

首次使用时系统会提示你登录。就这么简单！[继续快速入门（5 分钟）→](./quickstart)

> [!tip]
>
> 如果遇到问题，请参阅[故障排除](./support/troubleshooting)。

> [!note]
>
> **新的 VS Code 扩展（Beta）**：更喜欢图形界面？我们全新的 **VS Code 扩展** 提供了易于使用的原生 IDE 体验，无需熟悉终端。只需从市场安装，即可直接在侧边栏中使用 Qwen Code 进行编码。立即下载并安装 [Qwen Code Companion](https://marketplace.visualstudio.com/items?itemName=qwenlm.qwen-code-vscode-ide-companion)。

## Qwen Code 能为你做什么

- **根据描述构建功能**：用自然语言告诉 Qwen Code 你想构建什么。它会制定计划、编写代码并确保其正常工作。
- **调试并修复问题**：描述一个 bug 或粘贴错误信息。Qwen Code 会分析你的代码库，找出问题并实施修复。
- **导航任何代码库**：询问关于团队代码库的任何问题，获得深思熟虑的回答。Qwen Code 能够感知整个项目结构，可以从网络获取最新信息，并通过 [MCP](./features/mcp) 从外部数据源（如 Google Drive、Figma 和 Slack）拉取数据。
- **自动化繁琐任务**：修复棘手的 lint 问题、解决合并冲突、编写发布说明。在你的开发机器上通过一条命令完成所有这些操作，或在 CI 中自动执行。
- **[后续建议](./features/followup-suggestions)**：Qwen Code 会预测你接下来要输入的内容，并以幽灵文本形式显示。按 Tab 接受，或继续输入以取消。

## 为什么开发者喜爱 Qwen Code

- **在你的终端中工作**：不是另一个聊天窗口，也不是另一个 IDE。Qwen Code 在你已经工作的环境中运行，使用你已经喜爱的工具。
- **采取行动**：Qwen Code 可以直接编辑文件、运行命令和创建提交。还需要更多？通过 [MCP](./features/mcp)，Qwen Code 可以读取你在 Google Drive 中的设计文档、更新你在 Jira 中的工单，或使用 _你_ 的自定义开发工具。
- **Unix 哲学**：Qwen Code 是可组合和可脚本化的。`tail -f app.log | qwen -p "Slack me if you see any anomalies appear in this log stream"` _确实有效_。你的 CI 可以运行 `qwen -p "If there are new text strings, translate them into French and raise a PR for @lang-fr-team to review"`。
