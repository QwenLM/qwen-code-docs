# Qwen Code 概览

[![@qwen-code/qwen-code downloads](https://img.shields.io/npm/dw/@qwen-code/qwen-code.svg)](https://npm-compare.com/@qwen-code/qwen-code)
[![@qwen-code/qwen-code version](https://img.shields.io/npm/v/@qwen-code/qwen-code.svg)](https://www.npmjs.com/package/@qwen-code/qwen-code)

> 了解 Qwen Code——Qwen 推出的智能编程工具，运行在你的终端中，帮助你更快地将想法转化为代码。

## 30 秒快速上手

### 安装 Qwen Code：

推荐使用独立归档包安装器（如果你的平台有对应版本）。若回退到 npm 安装，需要 PATH 中有 Node.js 22 或更高版本及 npm。

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
> 如果安装后 `qwen` 命令未立即在 PATH 中生效，建议重启终端。若安装失败，请参考快速入门指南中的[手动安装](./quickstart#manual-installation)部分。如需离线安装，请下载 release 归档包并使用 `--archive PATH` 运行安装器；保持 `SHA256SUMS` 文件与归档包在同一目录。

### 开始使用 Qwen Code：

```bash
cd your-project
qwen
```

首次启动时，系统会提示你连接模型提供商。菜单提供以下选项：**Alibaba ModelStudio**（Coding Plan、Token Plan 或标准 API Key）、**第三方提供商**（DeepSeek、MiniMax、Z.AI、OpenRouter 等内置提供商，使用 API key 连接）以及**自定义提供商**（本地服务器、代理或不在内置列表中的提供商）。使用 [阿里云 Coding Plan](https://bailian.console.aliyun.com/cn-beijing/?tab=coding-plan#/efm/coding-plan-index)（[国际版](https://modelstudio.console.alibabacloud.com/?tab=coding-plan#/efm/coding-plan-index)）请选择 **Alibaba ModelStudio → Coding Plan**；使用 ModelStudio API key 请选择 **Alibaba ModelStudio → Standard API Key** 并参考 API 配置指南（[北京](https://bailian.console.aliyun.com/cn-beijing/?tab=doc#/doc/?type=model&url=3023091) / [国际版](https://modelstudio.console.alibabacloud.com/ap-southeast-1?tab=doc#/doc/?type=model&url=2974721)）。接下来先从了解你的代码库开始，试试这条命令：

```
what does this project do?
```

![](https://cloud.video.taobao.com/vod/j7-QtQScn8UEAaEdiv619fSkk5p-t17orpDbSqKVL5A.mp4)

首次使用时系统会提示你登录。就这么简单！[继续阅读快速入门（5 分钟）→](./quickstart)

> [!tip]
>
> 遇到问题请查看[故障排查](./support/troubleshooting)。

> [!note]
>
> **全新 VS Code 扩展（Beta）**：偏好图形界面？我们全新的 **VS Code 扩展**提供易用的原生 IDE 体验，无需熟悉终端操作。只需从应用商店安装，即可直接在侧边栏中使用 Qwen Code 编写代码。立即下载并安装 [Qwen Code Companion](https://marketplace.visualstudio.com/items?itemName=qwenlm.qwen-code-vscode-ide-companion)。

## Qwen Code 能为你做什么

- **根据描述构建功能**：用自然语言告诉 Qwen Code 你想构建什么，它会制定计划、编写代码并确保其正常运行。
- **调试并修复问题**：描述 bug 或粘贴错误信息，Qwen Code 会分析你的代码库、定位问题并实现修复。
- **浏览任意代码库**：随时向 Qwen Code 询问团队代码库中的任何问题，并获得深思熟虑的回答。它能感知整个项目结构，可以从网络获取最新信息，并通过 [MCP](./features/mcp) 接入 Google Drive、Figma、Slack 等外部数据源。
- **自动化繁琐任务**：修复 lint 问题、解决合并冲突、撰写发布说明。这些操作都可以在开发机上通过单条命令完成，也可以在 CI 中自动执行。
- **[后续建议](./features/followup-suggestions)**：Qwen Code 能预测你接下来想输入的内容，并以幽灵文本形式展示。按 Tab 接受，或继续输入以忽略。

## 开发者为什么喜欢 Qwen Code

- **在终端中工作**：不是另一个聊天窗口，也不是另一个 IDE。Qwen Code 在你已经熟悉的工作环境中陪伴你，配合你已经喜爱的工具。
- **直接采取行动**：Qwen Code 可以直接编辑文件、运行命令并创建提交。需要更多能力？[MCP](./features/mcp) 让 Qwen Code 能读取 Google Drive 中的设计文档、更新 Jira 中的工单，或使用你自定义的开发者工具。
- **Unix 哲学**：Qwen Code 支持组合与脚本化。`tail -f app.log | qwen -p "Slack me if you see any anomalies appear in this log stream"` _完全可行_。你的 CI 也可以运行 `qwen -p "If there are new text strings, translate them into French and raise a PR for @lang-fr-team to review"`。