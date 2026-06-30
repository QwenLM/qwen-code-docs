# 故障排查

本指南提供常见问题的解决方案和调试技巧，包括以下主题：

- 身份验证或登录错误
- 常见问题解答 (FAQ)
- 调试技巧
- 查找类似的现有 GitHub Issue 或创建新 Issue

## 身份验证或登录错误

- **错误：`Qwen OAuth free tier was discontinued on 2026-04-15`**
  - **原因：** 自 2026 年 4 月 15 日起，Qwen OAuth 已不再可用。
  - **解决方案：** 切换到其他身份验证方法。运行 `qwen` → `/auth` 并选择以下选项之一：
    - **API Key**：使用阿里云百炼的 API key（[北京](https://bailian.console.aliyun.com/) / [国际](https://modelstudio.console.alibabacloud.com/)）。请参阅 API 设置指南（[北京](https://bailian.console.aliyun.com/cn-beijing/?tab=doc#/doc/?type=model&url=3023091) / [国际](https://modelstudio.console.alibabacloud.com/ap-southeast-1?tab=doc#/doc/?type=model&url=2974721)）。
    - **阿里云 Coding Plan**：以固定月费订阅，享受更高配额。请参阅 Coding Plan 指南（[北京](https://bailian.console.aliyun.com/cn-beijing/?tab=coding-plan#/efm/coding-plan-index) / [国际](https://modelstudio.console.alibabacloud.com/?tab=coding-plan#/efm/coding-plan-index)）。

- **错误：`UNABLE_TO_GET_ISSUER_CERT_LOCALLY`、`UNABLE_TO_VERIFY_LEAF_SIGNATURE` 或 `unable to get local issuer certificate`**
  - **原因：** 你可能处于带有防火墙的企业网络中，该防火墙会拦截并检查 SSL/TLS 流量。这通常需要 Node.js 信任自定义的根 CA 证书。
  - **解决方案：** 将 `NODE_EXTRA_CA_CERTS` 环境变量设置为企业根 CA 证书文件的绝对路径。
    - 示例：`export NODE_EXTRA_CA_CERTS=/path/to/your/corporate-ca.crt`

- **错误：针对自签名端点出现 `Connection error. (cause: fetch failed)`**
  - **原因：** 你将 Qwen Code 指向了自托管服务器（例如 `https://` 背后的本地模型），其 TLS 证书是自签名的，因此 Node.js 会拒绝该连接。
  - **解决方案：** 建议通过 `NODE_EXTRA_CA_CERTS`（如上所述）信任该证书。如果在受信任的实验室/私有网络中这不可行，请使用 `--insecure` 标志（或 `QWEN_TLS_INSECURE=1`）跳过验证：
    - 示例：`qwen --insecure --openaiBaseUrl https://192.168.1.10:8080 ...`
    - **警告：** 禁用验证将移除对中间人攻击的防护。请仅对你完全信任的端点使用此选项。

- **错误：`Device authorization flow failed: fetch failed`**
  - **原因：** Node.js 无法访问 Qwen OAuth 端点（通常是代理或 SSL/TLS 信任问题）。如果可用，Qwen Code 还会打印底层错误原因（例如：`UNABLE_TO_VERIFY_LEAF_SIGNATURE`）。注意：此错误特定于旧版 Qwen OAuth 流程。
  - **解决方案：**
    - 如果你仍在使用 Qwen OAuth，请通过 `/auth` 切换到 API Key 或 Coding Plan。
    - 如果你处于代理之后，请通过 `qwen --proxy <url>`（或 `settings.json` 中的 `proxy` 设置）进行配置。
    - 如果你的网络使用企业 TLS 检查 CA，请按上述说明设置 `NODE_EXTRA_CA_CERTS`。

- **问题：身份验证失败后无法显示 UI**
  - **原因：** 如果在选择身份验证类型后身份验证失败，`security.auth.selectedType` 设置可能会被持久化到 `settings.json` 中。重启时，CLI 可能会卡在尝试使用失败的身份验证类型进行认证，从而无法显示 UI。
  - **解决方案：** 清除 `settings.json` 文件中的 `security.auth.selectedType` 配置项：
    - 打开 `~/.qwen/settings.json`（或项目特定设置的 `./.qwen/settings.json`）
    - 移除 `security.auth.selectedType` 字段
    - 重启 CLI 以允许其再次提示进行身份验证

## 常见问题解答 (FAQ)

- **Q：如何将 Qwen Code 更新到最新版本？**
  - A：如果你使用独立安装程序安装了 Qwen Code，请重新运行独立安装命令。如果你通过 `npm` 全局安装，请使用命令 `npm install -g @qwen-code/qwen-code@latest` 进行更新。如果你从源码编译，请从仓库拉取最新更改，然后使用命令 `npm run build` 重新构建。

- **Q：Qwen Code 的配置或设置文件存储在哪里？**
  - A：Qwen Code 配置存储在两个 `settings.json` 文件中：
    1. 你的主目录：`~/.qwen/settings.json`。
    2. 你的项目根目录：`./.qwen/settings.json`。

    有关更多详细信息，请参阅 [Qwen Code 配置](../configuration/settings)。

- **Q：为什么我在 stats 输出中看不到缓存的 token 数量？**
  - A：仅在使用缓存 token 时才会显示缓存 token 信息。此功能适用于 API key 用户（例如，阿里云百炼 API key 或 Google Cloud Vertex AI）。你仍然可以使用 `/stats` 命令查看总 token 使用量。

## 常见错误信息及解决方案

- **错误：** 启动 MCP 服务器时出现 `EADDRINUSE`（地址已被占用）。
  - **原因：** 另一个进程已经在使用 MCP 服务器尝试绑定的端口。
  - **解决方案：**
    停止使用该端口的其他进程，或者将 MCP 服务器配置为使用不同的端口。

- **错误：** Command not found（尝试使用 `qwen` 运行 Qwen Code 时）。
  - **原因：** CLI 未正确安装，或者它不在系统的 `PATH` 中。
  - **解决方案：**
    更新方式取决于你安装 Qwen Code 的方式：
    - 如果你使用独立安装程序安装了 `qwen`，请重新运行独立安装命令，然后打开一个新的终端。
    - 如果你全局安装了 `qwen`，请检查你的 `npm` 全局二进制目录是否在 `PATH` 中。你可以使用命令 `npm install -g @qwen-code/qwen-code@latest` 进行更新。
    - 如果你从源码运行 `qwen`，请确保使用正确的命令来调用它（例如 `node packages/cli/dist/index.js ...`）。要更新，请从仓库拉取最新更改，然后使用命令 `npm run build` 重新构建。

- **错误：** `MODULE_NOT_FOUND` 或导入错误。
  - **原因：** 依赖项未正确安装，或者项目尚未构建。
  - **解决方案：**
    1.  运行 `npm install` 以确保所有依赖项都已存在。
    2.  运行 `npm run build` 来编译项目。
    3.  使用 `npm run start` 验证构建是否成功完成。

- **错误：** "Operation not permitted"、"Permission denied" 或类似错误。
  - **原因：** 启用沙盒后，Qwen Code 可能会尝试受沙盒配置限制的操作，例如在项目目录或系统临时目录之外进行写入。
  - **解决方案：** 请参阅 [配置：沙盒](../features/sandbox) 文档以获取更多信息，包括如何自定义沙盒配置。

- **问题：** Qwen Code 在“CI”环境中未以交互模式运行
  - **问题：** 如果设置了以 `CI_` 开头的环境变量（例如 `CI_TOKEN`），Qwen Code 不会进入交互模式（不显示提示符）。这是因为底层 UI 框架使用的 `is-in-ci` 包会检测这些变量并假定处于非交互式的 CI 环境中。
  - **原因：** `is-in-ci` 包会检查是否存在 `CI`、`CONTINUOUS_INTEGRATION` 或任何带有 `CI_` 前缀的环境变量。当找到其中任何一个时，它会发出环境为非交互式的信号，从而阻止 CLI 以交互模式启动。
  - **解决方案：** 如果 CLI 运行不需要 `CI_` 前缀的变量，你可以为该命令临时取消设置它。例如：`env -u CI_TOKEN qwen`

- **问题：** 从项目 .env 文件启用 DEBUG 模式无效
  - **问题：** 在项目的 `.env` 文件中设置 `DEBUG=true` 无法为 CLI 启用调试模式。
  - **原因：** 为了防止干扰 CLI 行为，`DEBUG` 和 `DEBUG_MODE` 变量会自动从项目 `.env` 文件中排除。
  - **解决方案：** 请改用 `.qwen/.env` 文件，或者在 `settings.json` 中配置 `advanced.excludedEnvVars` 设置以排除更少的变量。

- **问题：** 在 tmux 中使用触控板滚动会更改提示历史记录，而不是滚动对话
  - **问题：** 在 tmux 会话中，触控板或鼠标滚轮滚动可能会循环浏览之前的提示，类似于按 `Up Arrow` 或 `Down Arrow`。
  - **原因：** tmux 可以将滚轮手势转换为普通的箭头键序列。当 qwen-code 接收到这些序列时，它们与真实的箭头键按下无法区分。
  - **解决方案：** 启用 `ui.useTerminalBuffer`；然后使用 `Shift+Up` / `Shift+Down`，或者在 tmux 将滚轮事件转发给应用时使用鼠标滚轮。如果你更喜欢宿主机的回滚，请调整 tmux 中针对滚轮事件的鼠标绑定。

## IDE Companion 无法连接

- 确保 VS Code 仅打开了一个工作区文件夹。
- 安装扩展后重启集成终端，以便其继承以下环境变量：
  - `QWEN_CODE_IDE_WORKSPACE_PATH`
  - `QWEN_CODE_IDE_SERVER_PORT`
- 如果在容器中运行，请验证 `host.docker.internal` 是否可以解析。否则，请适当映射宿主机。
- 使用 `/ide install` 重新安装 companion，并在命令面板中使用“Qwen Code: Run”来验证其是否启动。

## 退出码

Qwen Code 使用特定的退出码来指示终止原因。这对于脚本编写和自动化特别有用。

| 退出码 | 错误类型 | 描述 |
| --- | --- | --- |
| 41 | `FatalAuthenticationError` | 身份验证过程中发生错误。 |
| 42 | `FatalInputError` | 提供给 CLI 的输入无效或缺失。（仅限非交互模式） |
| 44 | `FatalSandboxError` | 沙盒环境发生错误（例如 Docker、Podman 或 Seatbelt）。 |
| 52 | `FatalConfigError` | 配置文件（`settings.json`）无效或包含错误。 |
| 53 | `FatalTurnLimitedError` | 已达到会话的最大对话轮数。（仅限非交互模式） |

## 调试技巧

- **CLI 调试：**
  - 在 CLI 命令中使用 `--verbose` 标志（如果可用）以获取更详细的输出。
  - 检查 CLI 日志，通常位于用户特定的配置或缓存目录中。

- **核心调试：**
  - 检查服务器控制台输出以查找错误消息或堆栈跟踪。
  - 如果可配置，请增加日志详细程度。
  - 如果需要单步调试服务端代码，请使用 Node.js 调试工具（例如 `node --inspect`）。

- **工具问题：**
  - 如果特定工具失败，请尝试通过运行该工具执行的最简单版本的命令或操作来隔离问题。
  - 对于 `run_shell_command`，请先检查该命令是否可以直接在你的 shell 中运行。
  - 对于_文件系统工具_，请验证路径是否正确并检查权限。

- **预检：**
  - 在提交代码前始终运行 `npm run preflight`。这可以捕获许多与格式化、lint 和类型错误相关的常见问题。

## 查找类似的现有 GitHub Issue 或创建新 Issue

如果你遇到本_故障排查指南_中未涵盖的问题，请考虑在 Qwen Code 的 [GitHub Issue 跟踪器](https://github.com/QwenLM/qwen-code/issues)中进行搜索。如果找不到类似的问题，请考虑创建一个新的 GitHub Issue 并提供详细描述。同时也欢迎提交 Pull Request！