# 欢迎阅读 Qwen Code 文档

本文档提供了安装、使用和开发 Qwen Code 的全面指南。该工具允许你通过命令行界面与 AI 模型进行交互。

## 概述

Qwen Code 将先进的代码模型能力带入你的终端，提供交互式的 Read-Eval-Print Loop (REPL) 环境。Qwen Code 由一个客户端应用（`packages/cli`）组成，它与本地服务器（`packages/core`）通信。Qwen Code 还包含多种工具，用于执行文件系统操作、运行 shell 和网络获取等任务，这些工具由 `packages/core` 管理。

## 浏览文档

本文档组织如下：

- **[执行与部署](./deployment.md)：** 运行 Qwen Code 的相关信息。
- **[架构概览](./architecture.md)：** 了解 Qwen Code 的高层设计，包括其组件及交互方式。
- **CLI 使用：** `packages/cli` 的文档。
  - **[CLI 简介](./cli/index.md)：** 命令行界面的概述。
  - **[命令](./cli/commands.md)：** 可用 CLI 命令的说明。
  - **[配置](./cli/configuration.md)：** CLI 配置的相关信息。
  - **[Checkpointing](./checkpointing.md)：** checkpointing 功能的文档。
  - **[扩展](./extension.md)：** 如何通过新功能扩展 CLI。
  - **[IDE 集成](./ide-integration.md)：** 将 CLI 与你的编辑器连接。
  - **[遥测](./telemetry.md)：** CLI 中遥测功能的概述。
- **核心细节：** `packages/core` 的文档。
  - **[核心简介](./core/index.md)：** 核心组件的概述。
  - **[Tools API](./core/tools-api.md)：** 核心如何管理和暴露 tools 的信息。
- **工具：**
  - **[工具概览](./tools/index.md)：** 可用工具的概述。
  - **[文件系统工具](./tools/file-system.md)：** `read_file` 和 `write_file` 工具的文档。
  - **[多文件读取工具](./tools/multi-file.md)：** `read_many_files` 工具的文档。
  - **[Shell 工具](./tools/shell.md)：** `run_shell_command` 工具的文档。
  - **[Web 抓取工具](./tools/web-fetch.md)：** `web_fetch` 工具的文档。
  - **[Web 搜索工具](./tools/web-search.md)：** `web_search` 工具的文档。
  - **[Memory 工具](./tools/memory.md)：** `save_memory` 工具的文档。
- **[子代理](./subagents.md)：** 专注于特定任务的 AI 助手，提供全面的管理、配置和使用指导。
- **[贡献与开发指南](../CONTRIBUTING.md)：** 面向贡献者和开发者的相关信息，包括环境设置、构建、测试和编码规范。
- **[NPM](./npm.md)：** 项目包结构的详细说明。
- **[故障排除指南](./troubleshooting.md)：** 常见问题和 FAQ 的解决方案。
- **[服务条款与隐私声明](./tos-privacy.md)：** 适用于你使用 Qwen Code 的服务条款和隐私声明信息。

我们希望这份文档能帮助你充分发挥 Qwen Code 的潜力！