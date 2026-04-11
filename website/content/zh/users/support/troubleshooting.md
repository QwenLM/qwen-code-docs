# 故障排查

本指南提供了常见问题的解决方案和调试技巧，涵盖以下主题：

- 身份验证或登录错误
- 常见问题解答 (FAQ)
- 调试技巧
- 查找类似的现有 GitHub Issue 或创建新 Issue

## 身份验证或登录错误

- **错误：`UNABLE_TO_GET_ISSUER_CERT_LOCALLY`、`UNABLE_TO_VERIFY_LEAF_SIGNATURE` 或 `unable to get local issuer certificate`**
  - **原因：** 你可能处于带有防火墙的企业网络中，该防火墙会拦截并检查 SSL/TLS 流量。这通常需要 Node.js 信任自定义的根 CA 证书。
  - **解决方案：** 将 `NODE_EXTRA_CA_CERTS` 环境变量设置为企业根 CA 证书文件的绝对路径。
    - 示例：`export NODE_EXTRA_CA_CERTS=/path/to/your/corporate-ca.crt`

- **错误：`Device authorization flow failed: fetch failed`**
  - **原因：** Node.js 无法访问 Qwen OAuth 端点（通常是代理或 SSL/TLS 信任问题）。如果可用，Qwen Code 还会打印底层错误原因（例如：`UNABLE_TO_VERIFY_LEAF_SIGNATURE`）。
  - **解决方案：**
    - 确认你能从同一台机器/网络访问 `https://chat.qwen.ai`。
    - 如果你使用了代理，请通过 `qwen --proxy <url>` 进行设置（或在 `settings.json` 中配置 `proxy` 选项）。
    - 如果你的网络使用了企业 TLS 检查 CA，请按照上述说明设置 `NODE_EXTRA_CA_CERTS`。

- **问题：身份验证失败后无法显示 UI**
  - **原因：** 如果在选择身份验证类型后验证失败，`security.auth.selectedType` 设置可能会被持久化到 `settings.json` 中。重启时，CLI 可能会卡在尝试使用失败的身份验证类型进行验证，从而导致无法显示 UI。
  - **解决方案：** 清除 `settings.json` 文件中的 `security.auth.selectedType` 配置项：
    - 打开 `~/.qwen/settings.json`（或项目级设置的 `./.qwen/settings.json`）
    - 删除 `security.auth.selectedType` 字段
    - 重启 CLI，使其再次提示进行身份验证

## 常见问题解答 (FAQ)

- **Q：如何将 Qwen Code 更新到最新版本？**
  - A：如果你通过 `npm` 全局安装，请使用命令 `npm install -g @qwen-code/qwen-code@latest` 进行更新。如果你是从源码编译的，请从仓库拉取最新更改，然后使用命令 `npm run build` 重新构建。

- **Q：Qwen Code 的配置或设置文件存储在哪里？**
  - A：Qwen Code 的配置存储在两个 `settings.json` 文件中：
    1. 你的主目录：`~/.qwen/settings.json`。
    2. 你的项目根目录：`./.qwen/settings.json`。

    更多详情请参阅 [Qwen Code 配置](../configuration/settings)。

- **Q：为什么我在 stats 输出中看不到缓存的 token 数量？**
  - A：仅在使用缓存 token 时才会显示缓存 token 信息。此功能适用于 API key 用户（Qwen API key 或 Google Cloud Vertex AI），但不适用于 OAuth 用户（例如 Google 个人/企业账户，如 Google Gmail 或 Google Workspace）。这是因为 Qwen Code Assist API 不支持创建缓存内容。你仍然可以使用 `/stats` 命令查看总的 token 使用量。

## 常见错误信息及解决方案

- **错误：启动 MCP server 时出现 `EADDRINUSE`（地址已被占用）。**
  - **原因：** 另一个进程已经占用了 MCP server 尝试绑定的端口。
  - **解决方案：**
    停止占用该端口的其他进程，或将 MCP server 配置为使用其他端口。

- **错误：找不到命令（尝试使用 `qwen` 运行 Qwen Code 时）。**
  - **原因：** CLI 未正确安装，或未添加到系统的 `PATH` 中。
  - **解决方案：**
    更新方法取决于你安装 Qwen Code 的方式：
    - 如果你全局安装了 `qwen`，请检查 `npm` 全局二进制目录是否在 `PATH` 中。你可以使用命令 `npm install -g @qwen-code/qwen-code@latest` 进行更新。
    - 如果你从源码运行 `qwen`，请确保使用了正确的调用命令（例如 `node packages/cli/dist/index.js ...`）。要更新，请从仓库拉取最新更改，然后使用命令 `npm run build` 重新构建。

- **错误：`MODULE_NOT_FOUND` 或导入错误。**
  - **原因：** 依赖未正确安装，或项目尚未构建。
  - **解决方案：**
    1. 运行 `npm install` 确保所有依赖已安装。
    2. 运行 `npm run build` 编译项目。
    3. 使用 `npm run start` 验证构建是否成功完成。

- **错误："Operation not permitted"、"Permission denied" 或类似错误。**
  - **原因：** 启用沙箱后，Qwen Code 可能会尝试执行受沙箱配置限制的操作，例如在项目目录或系统临时目录之外写入文件。
  - **解决方案：** 参阅 [配置：沙箱](../features/sandbox) 文档了解更多信息，包括如何自定义沙箱配置。

- **Qwen Code 在 "CI" 环境中未以交互模式运行**
  - **问题：** 如果设置了以 `CI_` 开头的环境变量（例如 `CI_TOKEN`），Qwen Code 将不会进入交互模式（不会出现提示符）。这是因为底层 UI 框架使用的 `is-in-ci` 包会检测这些变量，并假定当前为非交互的 CI 环境。
  - **原因：** `is-in-ci` 包会检查是否存在 `CI`、`CONTINUOUS_INTEGRATION` 或任何带有 `CI_` 前缀的环境变量。当发现其中任何一个时，它会标记环境为非交互模式，从而阻止 CLI 以交互模式启动。
  - **解决方案：** 如果 CLI 运行不需要该 `CI_` 前缀的变量，你可以临时取消设置它。例如：`env -u CI_TOKEN qwen`

- **DEBUG 模式在项目 .env 文件中不生效**
  - **问题：** 在项目的 `.env` 文件中设置 `DEBUG=true` 无法为 CLI 启用调试模式。
  - **原因：** 为防止干扰 CLI 行为，`DEBUG` 和 `DEBUG_MODE` 变量会自动从项目 `.env` 文件中排除。
  - **解决方案：** 改用 `.qwen/.env` 文件，或在 `settings.json` 中配置 `advanced.excludedEnvVars` 设置以减少排除的变量。

## IDE Companion 无法连接

- 确保 VS Code 仅打开了一个工作区文件夹。
- 安装扩展后重启集成终端，以便其继承以下环境变量：
  - `QWEN_CODE_IDE_WORKSPACE_PATH`
  - `QWEN_CODE_IDE_SERVER_PORT`
- 如果在容器中运行，请验证 `host.docker.internal` 能否正确解析。否则，请适当映射主机。
- 使用 `/ide install` 重新安装 Companion，并在命令面板中使用 “Qwen Code: Run” 验证其是否正常启动。

## 退出码

Qwen Code 使用特定的退出码来指示终止原因。这在编写脚本和自动化任务时非常有用。

| 退出码 | 错误类型                 | 描述                                                                                         |
| --------- | -------------------------- | --------------------------------------------------------------------------------------------------- |
| 41        | `FatalAuthenticationError` | 身份验证过程中发生错误。                                                |
| 42        | `FatalInputError`          | 向 CLI 提供了无效或缺失的输入。（仅限非交互模式）                       |
| 44        | `FatalSandboxError`        | 沙箱环境发生错误（例如 Docker、Podman 或 Seatbelt）。               |
| 52        | `FatalConfigError`         | 配置文件（`settings.json`）无效或包含错误。                               |
| 53        | `FatalTurnLimitedError`    | 已达到会话的最大对话轮数。（仅限非交互模式） |

## 调试技巧

- **CLI 调试：**
  - 在 CLI 命令中使用 `--verbose` 标志（如果可用）以获取更详细的输出。
  - 检查 CLI 日志，通常位于用户特定的配置或缓存目录中。

- **核心调试：**
  - 检查服务器控制台输出中的错误信息或堆栈跟踪。
  - 如果支持配置，请提高日志详细程度。
  - 如果需要逐步调试服务端代码，请使用 Node.js 调试工具（例如 `node --inspect`）。

- **工具问题：**
  - 如果某个特定工具失败，请尝试运行该工具执行的最简命令或操作，以隔离问题。
  - 对于 `run_shell_command`，请先检查该命令能否直接在 shell 中运行。
  - 对于 _文件系统工具_，请验证路径是否正确并检查权限。

- **预检检查：**
  - 提交代码前始终运行 `npm run preflight`。这可以捕获许多与格式化、代码检查和类型错误相关的常见问题。

## 查找类似的现有 GitHub Issue 或创建新 Issue

如果你遇到了本_故障排查指南_未涵盖的问题，建议搜索 Qwen Code 的 [GitHub Issue 跟踪器](https://github.com/QwenLM/qwen-code/issues)。如果找不到类似的问题，建议创建一个包含详细描述的新 GitHub Issue。同时也欢迎提交 Pull Request！