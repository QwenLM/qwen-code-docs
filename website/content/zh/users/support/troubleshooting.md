# 故障排除

本指南提供了常见问题的解决方案和调试技巧，包括以下主题：

- 身份验证或登录错误
- 常见问题解答（FAQ）
- 调试技巧
- 与你遇到的问题相似的现有 GitHub Issues 或创建新的 Issues

## 认证或登录错误

- **错误：`UNABLE_TO_GET_ISSUER_CERT_LOCALLY`、`UNABLE_TO_VERIFY_LEAF_SIGNATURE` 或 `unable to get local issuer certificate`**
  - **原因：** 你可能在企业网络上，防火墙会拦截和检查 SSL/TLS 流量。这通常需要 Node.js 信任自定义的根 CA 证书。
  - **解决方案：** 将 `NODE_EXTRA_CA_CERTS` 环境变量设置为企业根 CA 证书文件的绝对路径。
    - 示例：`export NODE_EXTRA_CA_CERTS=/path/to/your/corporate-ca.crt`

- **错误：`Device authorization flow failed: fetch failed`**
  - **原因：** Node.js 无法访问 Qwen OAuth 端点（通常是代理或 SSL/TLS 信任问题）。如果可用，Qwen Code 还会打印底层错误原因（例如：`UNABLE_TO_VERIFY_LEAF_SIGNATURE`）。
  - **解决方案：**
    - 确认你可以从同一台机器/网络访问 `https://chat.qwen.ai`。
    - 如果你在代理后面，请通过 `qwen --proxy <url>`（或 `settings.json` 中的 `proxy` 设置）设置代理。
    - 如果你的网络使用企业 TLS 检查 CA，请按上述说明设置 `NODE_EXTRA_CA_CERTS`。

- **问题：认证失败后无法显示 UI**
  - **原因：** 如果在选择认证类型后认证失败，`security.auth.selectedType` 设置可能会保留在 `settings.json` 中。重启时，CLI 可能会卡住，尝试使用失败的认证类型进行认证，导致无法显示 UI。
  - **解决方案：** 清除 `settings.json` 文件中的 `security.auth.selectedType` 配置项：
    - 打开 `~/.qwen/settings.json`（或项目特定设置的 `./.qwen/settings.json`）
    - 移除 `security.auth.selectedType` 字段
    - 重新启动 CLI 以允许其再次提示进行认证

## 常见问题解答（FAQ）

- **问：如何将 Qwen Code 更新到最新版本？**
  - 答：如果你通过 `npm` 全局安装，可以使用命令 `npm install -g @qwen-code/qwen-code@latest` 进行更新。如果你是从源码编译的，请从仓库拉取最新的更改，然后使用命令 `npm run build` 重新构建。

- **问：Qwen Code 的配置或设置文件存储在哪里？**
  - 答：Qwen Code 配置存储在两个 `settings.json` 文件中：
    1. 在你的主目录中：`~/.qwen/settings.json`。
    2. 在你项目的根目录中：`./.qwen/settings.json`。

    更多详情请参阅 [Qwen Code 配置](../configuration/settings)。

- **问：为什么在我的统计输出中看不到缓存的令牌计数？**
  - 答：只有在使用缓存令牌时才会显示缓存令牌信息。此功能适用于 API 密钥用户（Qwen API 密钥或 Google Cloud Vertex AI），但不适用于 OAuth 用户（例如 Google 个人/企业账户，如 Google Gmail 或 Google Workspace）。这是因为 Qwen Code Assist API 不支持创建缓存内容。你仍然可以使用 `/stats` 命令查看总令牌使用量。

## 常见错误信息及解决方案

- **错误：启动 MCP 服务器时出现 `EADDRINUSE`（地址已在使用中）错误。**
  - **原因：** 另一个进程已经在使用 MCP 服务器尝试绑定的端口。
  - **解决方案：**
    要么停止使用该端口的其他进程，要么配置 MCP 服务器使用不同的端口。

- **错误：命令未找到（尝试使用 `qwen` 运行 Qwen Code 时）。**
  - **原因：** CLI 未正确安装或不在系统的 `PATH` 中。
  - **解决方案：**
    更新方式取决于你如何安装 Qwen Code：
    - 如果你全局安装了 `qwen`，请检查 `npm` 全局二进制目录是否在 `PATH` 中。你可以使用命令 `npm install -g @qwen-code/qwen-code@latest` 进行更新。
    - 如果你是从源码运行 `qwen`，请确保使用正确的命令来调用它（例如 `node packages/cli/dist/index.js ...`）。要进行更新，请从仓库拉取最新更改，然后使用命令 `npm run build` 重新构建。

- **错误：`MODULE_NOT_FOUND` 或导入错误。**
  - **原因：** 依赖项未正确安装，或者项目尚未构建。
  - **解决方案：**
    1.  运行 `npm install` 确保所有依赖项都已存在。
    2.  运行 `npm run build` 编译项目。
    3.  使用 `npm run start` 验证构建是否成功完成。

- **错误："Operation not permitted"、"Permission denied" 或类似错误。**
  - **原因：** 启用沙箱时，Qwen Code 可能会尝试执行受沙箱配置限制的操作，例如写入项目目录或系统临时目录之外的位置。
  - **解决方案：** 请参阅[配置：沙箱](../features/sandbox)文档了解更多信息，包括如何自定义沙箱配置。

- **Qwen Code 在 "CI" 环境中不以交互模式运行**
  - **问题：** 如果设置了以 `CI_` 开头的环境变量（例如 `CI_TOKEN`），Qwen Code 不会进入交互模式（不会出现提示）。这是因为底层 UI 框架使用的 `is-in-ci` 包检测到这些变量并假定为非交互式 CI 环境。
  - **原因：** `is-in-ci` 包检查是否存在 `CI`、`CONTINUOUS_INTEGRATION` 或任何以 `CI_` 为前缀的环境变量。当找到其中任何一个时，它会表示环境是非交互式的，这会阻止 CLI 以交互模式启动。
  - **解决方案：** 如果 CLI 功能不需要 `CI_` 前缀的变量，你可以为命令临时取消设置它。例如 `env -u CI_TOKEN qwen`

- **无法从项目 .env 文件启用 DEBUG 模式**
  - **问题：** 在项目的 `.env` 文件中设置 `DEBUG=true` 不会为 CLI 启用调试模式。
  - **原因：** 为了防止干扰 CLI 行为，`DEBUG` 和 `DEBUG_MODE` 变量会自动从项目 `.env` 文件中排除。
  - **解决方案：** 改用 `.qwen/.env` 文件，或在 `settings.json` 中配置 `advanced.excludedEnvVars` 设置以排除更少的变量。

## IDE Companion 无法连接

- 确保 VS Code 只打开了一个工作区文件夹。
- 安装扩展后重启集成终端，以便继承：
  - `QWEN_CODE_IDE_WORKSPACE_PATH`
  - `QWEN_CODE_IDE_SERVER_PORT`
- 如果在容器中运行，请验证 `host.docker.internal` 是否能解析。否则，请适当地映射主机。
- 使用 `/ide install` 重新安装 companion，并在命令面板中使用“Qwen Code: Run”来验证它是否启动。

## 退出码

Qwen Code 使用特定的退出码来指示终止原因。这对于脚本编写和自动化特别有用。

| 退出码 | 错误类型                     | 描述                                                                                             |
| ------ | -------------------------- | ------------------------------------------------------------------------------------------------ |
| 41     | `FatalAuthenticationError` | 认证过程中发生错误。                                                                             |
| 42     | `FatalInputError`          | 向 CLI 提供了无效或缺失的输入。（仅限非交互模式）                                                  |
| 44     | `FatalSandboxError`        | 沙箱环境（例如 Docker、Podman 或 Seatbelt）发生错误。                                              |
| 52     | `FatalConfigError`         | 配置文件（`settings.json`）无效或包含错误。                                                      |
| 53     | `FatalTurnLimitedError`    | 已达到会话的最大对话轮数。（仅限非交互模式）                                                       |

## 调试技巧

- **CLI 调试：**
  - 在 CLI 命令中使用 `--verbose` 标志（如果可用）以获得更详细的输出。
  - 检查 CLI 日志，通常可以在用户特定的配置或缓存目录中找到。

- **核心调试：**
  - 检查服务器控制台输出中的错误消息或堆栈跟踪。
  - 如果可配置，请增加日志详细程度。
  - 如果需要逐步执行服务器端代码，请使用 Node.js 调试工具（例如 `node --inspect`）。

- **工具问题：**
  - 如果特定工具失败，请尝试通过运行该工具执行的命令或操作的最简单版本来隔离问题。
  - 对于 `run_shell_command`，请先检查命令是否可以直接在你的 shell 中正常工作。
  - 对于_文件系统工具_，请验证路径是否正确并检查权限。

- **预检检查：**
  - 在提交代码之前始终运行 `npm run preflight`。这可以捕获许多与格式化、linting 和类型错误相关的常见问题。

## 查找与你遇到的类似问题或创建新的 Issue

如果你遇到了本文档 _故障排除指南_ 中未涵盖的问题，可以考虑搜索 Qwen Code 的 [GitHub Issue 跟踪器](https://github.com/QwenLM/qwen-code/issues)。如果找不到与你遇到的类似问题，请考虑创建一个新的 GitHub Issue，并提供详细的描述。我们也欢迎提交 Pull Request！