# 故障排除指南

本指南提供了常见问题的解决方案和调试技巧，包括以下主题：

- 认证或登录错误
- 常见问题解答 (FAQs)
- 调试技巧
- 与你遇到的问题相似的现有 GitHub Issues，或创建新的 Issues

## 身份验证或登录错误

- **错误：`Failed to login. Message: Request contains an invalid argument`**
  - 使用 Google Workspace 账户或与 Gmail 账户关联的 Google Cloud 账户的用户可能无法激活 Google Code Assist 计划的免费额度。
  - 对于 Google Cloud 账户，你可以通过设置 `GOOGLE_CLOUD_PROJECT` 为你的项目 ID 来解决这个问题。
  - 或者，你可以从 [Google AI Studio](http://aistudio.google.com/app/apikey) 获取 Gemini API key，该服务也包含独立的免费额度。

- **错误：`UNABLE_TO_GET_ISSUER_CERT_LOCALLY` 或 `unable to get local issuer certificate`**
  - **原因：** 你可能处于企业网络环境中，防火墙会拦截并检查 SSL/TLS 流量。这通常需要 Node.js 信任自定义的根 CA 证书。
  - **解决方案：** 将 `NODE_EXTRA_CA_CERTS` 环境变量设置为你的企业根 CA 证书文件的绝对路径。
    - 示例：`export NODE_EXTRA_CA_CERTS=/path/to/your/corporate-ca.crt`

## 常见问题 (FAQs)

- **Q: 如何将 Qwen Code 更新到最新版本？**
  - A: 如果你是通过 `npm` 全局安装的，可以使用命令 `npm install -g @qwen-code/qwen-code@latest` 进行更新。如果你是从源码编译的，请从 repository 拉取最新更改，然后使用命令 `npm run build` 重新构建。

- **Q: Qwen Code 的配置或设置文件存储在哪里？**
  - A: Qwen Code 的配置存储在两个 `settings.json` 文件中：
    1. 在你的 home 目录下：`~/.qwen/settings.json`。
    2. 在你的项目根目录下：`./.qwen/settings.json`。

    更多详情请参考 [Qwen Code Configuration](./cli/configuration.md)。

- **Q: 为什么我在 stats 输出中看不到缓存的 token 数量？**
  - A: 缓存的 token 信息只有在使用缓存 token 时才会显示。此功能适用于 API key 用户（Gemini API key 或 Google Cloud Vertex AI），但不适用于 OAuth 用户（例如 Google 个人/企业账户，如 Google Gmail 或 Google Workspace）。这是因为 Gemini Code Assist API 不支持缓存内容的创建。你仍然可以使用 `/stats` 命令查看总 token 使用量。

## 常见错误信息及解决方案

- **错误：启动 MCP server 时出现 `EADDRINUSE`（地址已被占用）**
  - **原因：** 另一个进程已经占用了 MCP server 尝试绑定的端口。
  - **解决方案：**
    停止正在使用该端口的其他进程，或者配置 MCP server 使用不同的端口。

- **错误：命令未找到（运行 `qwen` 时提示 command not found）**
  - **原因：** CLI 没有正确安装，或者未添加到系统的 `PATH` 中。
  - **解决方案：**
    更新方式取决于你安装 Qwen Code 的方式：
    - 如果你是全局安装的 `qwen`，请确认你的 `npm` 全局二进制目录已加入 `PATH`。你可以使用命令 `npm install -g @qwen-code/qwen-code@latest` 进行更新。
    - 如果你是从源码运行 `qwen`，请确保使用了正确的命令来调用（例如 `node packages/cli/dist/index.js ...`）。要更新的话，请从仓库拉取最新更改，然后使用命令 `npm run build` 重新构建。

- **错误：`MODULE_NOT_FOUND` 或导入错误**
  - **原因：** 依赖未正确安装，或者项目尚未构建。
  - **解决方案：**
    1. 运行 `npm install` 确保所有依赖都已安装。
    2. 运行 `npm run build` 编译项目。
    3. 使用 `npm run start` 验证构建是否成功完成。

- **错误：提示 "Operation not permitted"、"Permission denied" 或类似信息**
  - **原因：** 当启用沙箱时，Qwen Code 可能尝试执行被沙箱配置限制的操作，例如在项目目录或系统临时目录之外进行写入。
  - **解决方案：** 请参考 [配置：沙箱](./cli/configuration.md#sandboxing) 文档获取更多信息，包括如何自定义沙箱配置。

- **Qwen Code 在“CI”环境中未以交互模式运行**
  - **问题：** 如果设置了以 `CI_` 开头的环境变量（例如 `CI_TOKEN`），Qwen Code 不会进入交互模式（不会显示提示符）。这是因为底层 UI 框架使用的 `is-in-ci` 包检测到这些变量后，会认为当前处于非交互式的 CI 环境中。
  - **原因：** `is-in-ci` 包会检查是否存在 `CI`、`CONTINUOUS_INTEGRATION` 或任何以 `CI_` 为前缀的环境变量。一旦检测到，它就会标记当前环境为非交互式，从而阻止 CLI 启动交互模式。
  - **解决方案：** 如果 CLI 并不需要使用以 `CI_` 为前缀的变量，可以临时取消设置该变量后再运行命令。例如：`env -u CI_TOKEN qwen`

- **DEBUG 模式无法通过项目 .env 文件启用**
  - **问题：** 在项目的 `.env` 文件中设置 `DEBUG=true` 并不会启用 CLI 的 debug 模式。
  - **原因：** 为了避免影响 CLI 行为，`DEBUG` 和 `DEBUG_MODE` 变量会自动从项目 `.env` 文件中排除。
  - **解决方案：** 使用 `.qwen/.env` 文件代替，或者在 `settings.json` 中配置 `excludedProjectEnvVars` 设置，减少被排除的变量数量。

## IDE Companion 无法连接

- 确保 VS Code 中只打开一个 workspace folder。
- 安装插件后重启集成终端，以便继承以下环境变量：
  - `QWEN_CODE_IDE_WORKSPACE_PATH`
  - `QWEN_CODE_IDE_SERVER_PORT`
- 如果在容器中运行，请确认 `host.docker.internal` 可以正确解析。否则，请适当配置 host 映射。
- 使用 `/ide install` 重新安装 companion，并通过 Command Palette 中的 “Qwen Code: Run” 命令验证其是否能正常启动。

## 调试技巧

- **CLI 调试：**
  - 使用 `--verbose` 参数（如果可用）来获取更详细的输出信息。
  - 检查 CLI 日志，通常位于用户特定的配置或缓存目录中。

- **核心调试：**
  - 检查服务器控制台输出中的错误信息或堆栈跟踪。
  - 如果可以配置，增加日志详细程度。
  - 如果需要逐步调试服务端代码，可以使用 Node.js 调试工具（例如 `node --inspect`）。

- **工具问题：**
  - 如果某个特定工具失败，尝试通过运行该工具执行的最简版本命令或操作来隔离问题。
  - 对于 `run_shell_command`，首先检查命令是否能在你的 shell 中直接运行。
  - 对于**文件系统工具**，验证路径是否正确并检查权限。

- **预检检查：**
  - 提交代码前始终运行 `npm run preflight`。这可以捕获许多与格式化、代码规范和类型错误相关的常见问题。

## 查找类似的 GitHub Issues 或创建新 Issues

如果你遇到的问题未在本 _Troubleshooting guide_ 中涵盖，建议前往 Qwen Code 的 [GitHub Issue tracker](https://github.com/QwenLM/qwen-code/issues) 进行搜索。如果找不到与你问题相似的 Issue，欢迎创建一个新的 GitHub Issue，并提供详细描述。我们也非常欢迎你提交 Pull requests！