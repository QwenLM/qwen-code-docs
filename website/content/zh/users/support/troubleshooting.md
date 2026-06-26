# 故障排除

本指南提供了常见问题的解决方案和调试技巧，涵盖以下主题：

- 身份验证或登录错误
- 常见问题解答（FAQ）
- 调试技巧
- 与您的问题相似的现有 GitHub Issue，或创建新的 Issue

## 身份验证或登录错误

- **错误：`Qwen OAuth free tier was discontinued on 2026-04-15`**
  - **原因：** Qwen OAuth 自 2026 年 4 月 15 日起不再可用。
  - **解决方案：** 切换到其他身份验证方法。运行 `qwen` → `/auth`，选择以下之一：
    - **API Key**：使用来自阿里云百炼平台（[北京区域](https://bailian.console.aliyun.com/) / [国际区域](https://modelstudio.console.alibabacloud.com/)）的 API 密钥。请参阅 API 配置指南（[北京区域](https://bailian.console.aliyun.com/cn-beijing/?tab=doc#/doc/?type=model&url=3023091) / [国际区域](https://modelstudio.console.alibabacloud.com/ap-southeast-1?tab=doc#/doc/?type=model&url=2974721)）。
    - **阿里云 Coding Plan**：按月订阅固定费用，享有更高配额。请参阅 Coding Plan 指南（[北京区域](https://bailian.console.aliyun.com/cn-beijing/?tab=coding-plan#/efm/coding-plan-index) / [国际区域](https://modelstudio.console.alibabacloud.com/?tab=coding-plan#/efm/coding-plan-index)）。

- **错误：`UNABLE_TO_GET_ISSUER_CERT_LOCALLY`、`UNABLE_TO_VERIFY_LEAF_SIGNATURE` 或 `unable to get local issuer certificate`**
  - **原因：** 您可能位于企业网络中，防火墙正在拦截并检查 SSL/TLS 流量。这通常需要将自定义根 CA 证书添加到 Node.js 的信任中。
  - **解决方案：** 设置 `NODE_EXTRA_CA_CERTS` 环境变量，指向您的企业根 CA 证书文件的绝对路径。
    - 示例：`export NODE_EXTRA_CA_CERTS=/path/to/your/corporate-ca.crt`

- **错误：`Device authorization flow failed: fetch failed`**
  - **原因：** Node.js 无法连接到 Qwen OAuth 端点（通常是代理或 SSL/TLS 信任问题）。如果可能，Qwen Code 还会打印底层错误原因（例如：`UNABLE_TO_VERIFY_LEAF_SIGNATURE`）。注意：此错误仅适用于旧版 Qwen OAuth 流程。
  - **解决方案：**
    - 如果您仍在使用的 Qwen OAuth，请通过 `/auth` 切换到 API Key 或 Coding Plan。
    - 如果使用代理，请通过 `qwen --proxy <url>` 设置（或 `settings.json` 中的 `proxy` 设置）。
    - 如果您的网络使用企业 TLS 检查 CA，请按上述方法设置 `NODE_EXTRA_CA_CERTS`。

- **问题：身份验证失败后无法显示 UI**
  - **原因：** 如果选择身份验证类型后身份验证失败，`security.auth.selectedType` 设置可能会保留在 `settings.json` 中。重新启动时，CLI 可能会卡在尝试使用失败的身份验证类型进行身份验证，从而无法显示 UI。
  - **解决方案：** 清除 `settings.json` 文件中的 `security.auth.selectedType` 配置项：
    - 打开 `~/.qwen/settings.json`（或项目特定的 `./.qwen/settings.json`）
    - 移除 `security.auth.selectedType` 字段
    - 重启 CLI，它将再次提示进行身份验证。

## 常见问题解答（FAQ）

- **问：如何将 Qwen Code 更新到最新版本？**
  - **答：** 如果您使用独立安装程序安装了 Qwen Code，请重新运行独立安装命令。如果您通过 `npm` 全局安装，请使用命令 `npm install -g @qwen-code/qwen-code@latest` 更新。如果您从源代码编译，请从仓库拉取最新更改，然后使用 `npm run build` 重建。

- **问：Qwen Code 配置文件或设置文件存放在哪里？**
  - **答：** Qwen Code 配置存储在两个 `settings.json` 文件中：
    1. 在您的主目录中：`~/.qwen/settings.json`。
    2. 在您项目的根目录中：`./.qwen/settings.json`。

    更多详情请参阅 [Qwen Code 配置](../configuration/settings)。

- **问：为什么我的统计输出中没有显示缓存的 token 数量？**
  - **答：** 只有在使用缓存 token 时才会显示缓存 token 信息。此功能适用于 API 密钥用户（例如阿里云百炼 API 密钥或 Google Cloud Vertex AI）。您仍然可以使用 `/stats` 命令查看总 token 使用量。

## 常见错误消息及解决方案

- **错误：启动 MCP 服务器时出现 `EADDRINUSE`（地址已在使用）。**
  - **原因：** 另一个进程正在使用 MCP 服务器尝试绑定的端口。
  - **解决方案：**
    停止占用该端口的其他进程，或者将 MCP 服务器配置为使用其他端口。

- **错误：尝试使用 `qwen` 运行 Qwen Code 时提示“命令未找到”（Command not found）。**
  - **原因：** CLI 未正确安装，或不在系统的 `PATH` 中。
  - **解决方案：**
    更新方式取决于您如何安装 Qwen Code：
    - 如果您使用独立安装程序安装了 `qwen`，请重新运行独立安装命令，然后打开新终端。
    - 如果您全局安装了 `qwen`，请检查您的 `npm` 全局二进制目录是否在 `PATH` 中。您可以使用命令 `npm install -g @qwen-code/qwen-code@latest` 更新。
    - 如果您从源代码运行 `qwen`，请确保使用正确的命令调用它（例如 `node packages/cli/dist/index.js ...`）。如需更新，请从仓库拉取最新更改，然后使用 `npm run build` 重建。

- **错误：`MODULE_NOT_FOUND` 或导入错误。**
  - **原因：** 依赖项未正确安装，或项目尚未构建。
  - **解决方案：**
    1. 运行 `npm install` 以确保所有依赖项存在。
    2. 运行 `npm run build` 编译项目。
    3. 使用 `npm run start` 验证构建是否成功完成。

- **错误："Operation not permitted"、"Permission denied" 或类似信息。**
  - **原因：** 当沙箱启用时，Qwen Code 可能会尝试执行沙箱配置限制的操作，例如在项目目录或系统临时目录之外写入。
  - **解决方案：** 请参阅 [配置：沙箱](../features/sandbox) 文档了解更多信息，包括如何自定义沙箱配置。

- **在“CI”环境中 Qwen Code 未以交互模式运行**
  - **问题：** 如果设置了以 `CI_` 开头的环境变量（例如 `CI_TOKEN`），Qwen Code 不会进入交互模式（不显示提示符）。这是因为底层 UI 框架使用的 `is-in-ci` 包会检测到这些变量，并假定为非交互式 CI 环境。
  - **原因：** `is-in-ci` 包会检查是否存在 `CI`、`CONTINUOUS_INTEGRATION` 或以 `CI_` 为前缀的任何环境变量。如果发现这些变量，它会指示环境是非交互式的，从而阻止 CLI 以交互模式启动。
  - **解决方案：** 如果该 `CI_` 前缀变量不是 CLI 运行所必需的，您可以临时将其取消设置用于该命令。例如：`env -u CI_TOKEN qwen`

- **从项目 .env 文件中启用 DEBUG 模式无效**
  - **问题：** 在项目的 `.env` 文件中设置 `DEBUG=true` 并不会为 CLI 启用调试模式。
  - **原因：** `DEBUG` 和 `DEBUG_MODE` 变量会自动从项目 `.env` 文件中排除，以防止干扰 CLI 行为。
  - **解决方案：** 改用 `.qwen/.env` 文件，或配置 `settings.json` 中的 `advanced.excludedEnvVars` 设置以排除更少的变量。

- **在 tmux 中使用触控板滚动会更改提示历史记录，而不是滚动对话**
  - **问题：** 在 tmux 会话中，触控板或滚轮滚动可能会循环显示之前的提示，类似于按 `上箭头` 或 `下箭头`。
  - **原因：** tmux 会将滚轮手势转换为普通的箭头键序列。当 qwen-code 接收到这些序列时，无法与真实的箭头按键区分。
  - **解决方案：** 启用 `ui.useTerminalBuffer`；然后使用 `Shift+上箭头` / `Shift+下箭头`，或者在 tmux 将滚轮事件转发给应用程序时使用鼠标滚轮。如果您更喜欢主机滚动缓冲区，请调整 tmux 中滚轮事件的鼠标绑定。

## IDE Companion 无法连接

- 确保 VS Code 已打开单个工作区文件夹。
- 安装扩展程序后重启集成终端，以便继承：
  - `QWEN_CODE_IDE_WORKSPACE_PATH`
  - `QWEN_CODE_IDE_SERVER_PORT`
- 如果在容器中运行，请验证 `host.docker.internal` 是否可以解析。否则，请正确映射主机。
- 使用 `/ide install` 重新安装 companion，然后使用命令面板中的“Qwen Code: Run”验证其是否正常启动。

## 退出码

Qwen Code 使用特定的退出码来指示终止原因。这对脚本编写和自动化尤为有用。

| 退出码 | 错误类型                   | 描述                                                                 |
| ------ | -------------------------- | -------------------------------------------------------------------- |
| 41     | `FatalAuthenticationError` | 身份验证过程中发生错误。                                             |
| 42     | `FatalInputError`          | 向 CLI 提供了无效或缺失的输入。（仅非交互模式）                      |
| 44     | `FatalSandboxError`        | 沙箱环境出错（例如 Docker、Podman 或 Seatbelt）。                    |
| 52     | `FatalConfigError`         | 配置文件 (`settings.json`) 无效或包含错误。                          |
| 53     | `FatalTurnLimitedError`    | 会话达到了最大对话轮次数。（仅非交互模式）                           |

## 调试技巧

- **CLI 调试：**
  - 在 CLI 命令中使用 `--verbose` 标志（如果可用）以获得更详细的输出。
  - 检查 CLI 日志，通常位于用户特定的配置或缓存目录中。

- **核心调试：**
  - 检查服务器控制台输出，查看错误消息或堆栈跟踪。
  - 如果可配置，增加日志详细程度。
  - 如果需要逐步调试服务器端代码，可使用 Node.js 调试工具（例如 `node --inspect`）。

- **工具问题：**
  - 如果某个特定工具失败，请尝试隔离问题：先运行该工具所执行命令或操作的最简单版本。
  - 对于 `run_shell_command`，请先检查该命令是否可直接在您的 shell 中工作。
  - 对于文件系统工具，请验证路径是否正确，并检查权限。

- **预检查：**
  - 在提交代码之前，始终运行 `npm run preflight`。这可以捕获许多与格式、lint 和类型错误相关的常见问题。

## 与您的问题类似的现有 GitHub Issue，或创建新的 Issue

如果您遇到了本《故障排除指南》中未涵盖的问题，请考虑搜索 Qwen Code 的 [GitHub Issue 跟踪器](https://github.com/QwenLM/qwen-code/issues)。如果找不到与您类似的问题，请考虑创建一个新的 GitHub Issue，并提供详细描述。也欢迎提交 Pull Request！