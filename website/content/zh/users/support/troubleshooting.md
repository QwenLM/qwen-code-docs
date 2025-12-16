# 故障排除

本指南提供了常见问题的解决方案和调试技巧，包括以下主题：

- 身份验证或登录错误
- 常见问题解答（FAQ）
- 调试技巧
- 与你遇到的问题相似的现有 GitHub Issues 或创建新 Issues

## 身份验证或登录错误

- **错误：`UNABLE_TO_GET_ISSUER_CERT_LOCALLY` 或 `unable to get local issuer certificate`**
  - **原因：** 您可能处于一个企业网络环境中，该环境的防火墙会拦截并检查 SSL/TLS 流量。这通常需要 Node.js 信任一个自定义的根证书颁发机构（CA）证书。
  - **解决方案：** 将 `NODE_EXTRA_CA_CERTS` 环境变量设置为您的企业根 CA 证书文件的绝对路径。
    - 示例：`export NODE_EXTRA_CA_CERTS=/path/to/your/corporate-ca.crt`

- **问题：身份验证失败后无法显示 UI**
  - **原因：** 如果在选择某种身份验证类型后身份验证失败，`security.auth.selectedType` 设置可能会被保存到 `settings.json` 中。重启时，CLI 可能会卡在尝试使用失败的身份验证类型进行身份验证，并且无法显示 UI。
  - **解决方案：** 清除 `settings.json` 文件中的 `security.auth.selectedType` 配置项：
    - 打开 `~/.qwen/settings.json`（或者项目特定设置的 `./.qwen/settings.json`）
    - 移除 `security.auth.selectedType` 字段
    - 重新启动 CLI，使其可以再次提示进行身份验证

## 常见问题 (FAQs)

- **问：如何将 Qwen Code 更新到最新版本？**
  - 答：如果你是通过 `npm` 全局安装的，可以使用命令 `npm install -g @qwen-code/qwen-code@latest` 进行更新。如果你是从源码编译的，请从仓库中拉取最新的更改，然后使用命令 `npm run build` 重新构建。

- **问：Qwen Code 的配置或设置文件存储在哪里？**
  - 答：Qwen Code 的配置存储在两个 `settings.json` 文件中：
    1. 在你的主目录下：`~/.qwen/settings.json`。
    2. 在你项目的根目录下：`./.qwen/settings.json`。

    更多详情请参考 [Qwen Code 配置](../users/configuration/settings)。

- **问：为什么我在统计输出中看不到缓存的 token 数量？**
  - 答：缓存的 token 信息仅在使用缓存 token 时显示。此功能适用于 API 密钥用户（Qwen API 密钥或 Google Cloud Vertex AI），但不适用于 OAuth 用户（例如 Google 个人/企业账户如 Google Gmail 或 Google Workspace）。这是因为 Qwen Code Assist API 不支持缓存内容的创建。你仍然可以使用 `/stats` 命令查看总 token 使用情况。

## 常见错误信息及解决方案

- **错误：启动 MCP 服务器时出现 `EADDRINUSE`（地址已被使用）。**
  - **原因：** 另一个进程已经占用了 MCP 服务器试图绑定的端口。
  - **解决方案：**
    停止占用该端口的其他进程，或配置 MCP 服务器使用不同的端口。

- **错误：运行命令 `qwen` 时提示“命令未找到”。**
  - **原因：** CLI 未正确安装，或者未添加到系统的 `PATH` 环境变量中。
  - **解决方案：**
    更新方式取决于你安装 Qwen Code 的方法：
    - 如果你是全局安装的 `qwen`，请检查你的 `npm` 全局二进制目录是否已加入 `PATH`。你可以通过命令 `npm install -g @qwen-code/qwen-code@latest` 进行更新。
    - 如果你是从源码运行 `qwen`，请确保使用了正确的命令来调用它（例如 `node packages/cli/dist/index.js ...`）。要更新，请从仓库拉取最新更改，然后使用命令 `npm run build` 重新构建。

- **错误：`MODULE_NOT_FOUND` 或导入错误。**
  - **原因：** 依赖项未正确安装，或者项目尚未构建。
  - **解决方案：**
    1. 运行 `npm install` 确保所有依赖项都已安装。
    2. 运行 `npm run build` 编译项目。
    3. 使用 `npm run start` 验证构建是否成功完成。

- **错误：出现“操作不被允许”、“权限被拒绝”或类似提示。**
  - **原因：** 当启用沙箱机制时，Qwen Code 可能尝试执行被沙箱配置限制的操作，例如在项目目录或系统临时目录之外进行写入。
  - **解决方案：** 更多信息请参考 [配置：沙箱机制](../users/features/sandbox) 文档，包括如何自定义沙箱配置。

- **Qwen Code 在“CI”环境中未以交互模式运行**
  - **问题：** 如果设置了以 `CI_` 开头的环境变量（如 `CI_TOKEN`），Qwen Code 将不会进入交互模式（即不会显示提示符）。这是因为底层 UI 框架使用的 `is-in-ci` 包检测到了这些变量，并假定当前处于非交互式的 CI 环境。
  - **原因：** `is-in-ci` 包会检查是否存在 `CI`、`CONTINUOUS_INTEGRATION` 或任何以 `CI_` 为前缀的环境变量。一旦发现其中之一，就会判定当前环境为非交互式，从而阻止 CLI 启动交互模式。
  - **解决方案：** 如果不需要该 `CI_` 前缀变量来运行 CLI，可以临时取消设置后再执行命令。例如：`env -u CI_TOKEN qwen`

- **从项目 .env 文件无法启用 DEBUG 模式**
  - **问题：** 在项目的 `.env` 文件中设置 `DEBUG=true` 并不能启用 CLI 的调试模式。
  - **原因：** 为了避免干扰 CLI 行为，`DEBUG` 和 `DEBUG_MODE` 变量会被自动排除在项目 `.env` 文件之外。
  - **解决方案：** 改用 `.qwen/.env` 文件，或在 `settings.json` 中配置 `advanced.excludedEnvVars` 设置以减少被排除的变量。

## IDE Companion 无法连接

- 确保 VS Code 中只打开一个工作区文件夹。
- 安装扩展后重启集成终端，以便其继承以下环境变量：
  - `QWEN_CODE_IDE_WORKSPACE_PATH`
  - `QWEN_CODE_IDE_SERVER_PORT`
- 如果在容器中运行，请确认 `host.docker.internal` 可以解析。否则，请适当映射主机地址。
- 使用 `/ide install` 重新安装 companion，并通过命令面板中的“Qwen Code: Run”来验证是否能正常启动。

## 退出码

Qwen Code 使用特定的退出码来指示终止的原因。这对于脚本编写和自动化尤其有用。

| 退出码 | 错误类型                   | 描述                                                         |
| ------ | -------------------------- | ------------------------------------------------------------ |
| 41     | `FatalAuthenticationError` | 身份验证过程中发生错误。                                     |
| 42     | `FatalInputError`          | 提供给 CLI 的输入无效或缺失。（仅限非交互模式）             |
| 44     | `FatalSandboxError`        | 沙箱环境（例如 Docker、Podman 或 Seatbelt）发生错误。       |
| 52     | `FatalConfigError`         | 配置文件（`settings.json`）无效或包含错误。                 |
| 53     | `FatalTurnLimitedError`    | 已达到会话的最大对话轮数。（仅限非交互模式）               |

## 调试技巧

- **CLI 调试：**
  - 使用 `--verbose` 标志（如果可用）与 CLI 命令一起运行，以获取更详细的输出。
  - 检查 CLI 日志，通常位于用户特定的配置或缓存目录中。

- **核心调试：**
  - 检查服务器控制台输出中的错误消息或堆栈跟踪。
  - 如果可以配置，请提高日志详细程度。
  - 如需逐步执行服务器端代码，可使用 Node.js 调试工具（例如 `node --inspect`）。

- **工具问题：**
  - 如果某个特定工具失败，请尝试通过运行该工具执行的最简版本命令或操作来隔离问题。
  - 对于 `run_shell_command`，请先检查该命令是否可以直接在你的 shell 中运行。
  - 对于_文件系统工具_，请验证路径是否正确并检查权限。

- **预检检查：**
  - 提交代码前始终运行 `npm run preflight`。这可以捕获许多与格式化、代码规范和类型错误相关的常见问题。

## 与你遇到的问题相似的现有 GitHub Issues 或创建新 Issues

如果你遇到了本_故障排除指南_中未涵盖的问题，请考虑在 Qwen Code 的 [GitHub Issue 跟踪器](https://github.com/QwenLM/qwen-code/issues) 中进行搜索。如果找不到与你问题相似的 Issue，建议你创建一个新的 GitHub Issue，并提供详细描述。我们也欢迎 Pull Request！