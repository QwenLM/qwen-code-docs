# 故障排除

本指南提供常见问题的解决方案和调试技巧，涵盖以下主题：

- 身份验证或登录错误
- 常见问题解答（FAQ）
- 调试技巧
- 与您遇到的问题相似的现有 GitHub Issues，或创建新的 Issues

## 身份验证或登录错误

- **错误：`UNABLE_TO_GET_ISSUER_CERT_LOCALLY`、`UNABLE_TO_VERIFY_LEAF_SIGNATURE` 或 `unable to get local issuer certificate`**
  - **原因：** 您可能处于启用了防火墙的企业网络中，该防火墙会拦截并检查 SSL/TLS 流量。这通常要求将企业自定义根 CA 证书添加到 Node.js 的受信任证书列表中。
  - **解决方案：** 将 `NODE_EXTRA_CA_CERTS` 环境变量设置为您的企业根 CA 证书文件的绝对路径。
    - 示例：`export NODE_EXTRA_CA_CERTS=/path/to/your/corporate-ca.crt`

- **错误：`Device authorization flow failed: fetch failed`**
  - **原因：** Node.js 无法访问 Qwen 的 OAuth 端点（通常由代理或 SSL/TLS 信任问题导致）。当可用时，Qwen Code 还会打印底层错误原因（例如：`UNABLE_TO_VERIFY_LEAF_SIGNATURE`）。
  - **解决方案：**
    - 确认您能从同一台机器或网络访问 `https://chat.qwen.ai`。
    - 如果您使用代理，请通过 `qwen --proxy <url>`（或在 `settings.json` 中配置 `proxy` 设置）指定代理。
    - 如果您的网络使用企业级 TLS 检查 CA，请按上述方式设置 `NODE_EXTRA_CA_CERTS`。

- **问题：身份验证失败后无法显示 UI**
  - **原因：** 在选择身份验证类型后若发生身份验证失败，`security.auth.selectedType` 设置项可能已持久化保存至 `settings.json`。重启 CLI 时，它可能持续尝试使用此前失败的身份验证方式，从而卡住并无法显示 UI。
  - **解决方案：** 清除 `settings.json` 文件中的 `security.auth.selectedType` 配置项：
    - 打开 `~/.qwen/settings.json`（项目级设置则为 `./.qwen/settings.json`）
    - 删除 `security.auth.selectedType` 字段
    - 重启 CLI，使其重新提示您进行身份验证

## 常见问题解答（FAQ）

- **Q：如何将 Qwen Code 更新至最新版本？**  
  - A：若通过 `npm` 全局安装，请运行命令 `npm install -g @qwen-code/qwen-code@latest` 进行更新。若从源码编译安装，请先从代码仓库拉取最新变更，再运行 `npm run build` 重新构建。

- **Q：Qwen Code 的配置或设置文件存储在何处？**  
  - A：Qwen Code 的配置保存在两个 `settings.json` 文件中：  
    1. 用户主目录下：`~/.qwen/settings.json`；  
    2. 当前项目根目录下：`./.qwen/settings.json`。  

    更多详情请参阅 [Qwen Code 配置](../configuration/settings)。

- **Q：为什么我的统计输出中未显示缓存的 token 数量？**  
  - A：仅当实际使用了缓存 token 时，统计信息中才会显示缓存 token 数据。该功能仅对使用 API 密钥的用户（例如 Qwen API 密钥或 Google Cloud Vertex AI）可用，不适用于 OAuth 用户（例如 Google 个人/企业账户，包括 Gmail 或 Google Workspace）。这是因为 Qwen Code Assist API 不支持创建缓存内容。您仍可通过 `/stats` 命令查看总 token 使用量。

## 常见错误信息及解决方案

- **错误：启动 MCP 服务器时出现 `EADDRINUSE`（地址已被占用）。**  
  - **原因：** 其他进程已占用 MCP 服务器尝试绑定的端口。  
  - **解决方案：**  
    停止占用该端口的其他进程，或配置 MCP 服务器使用其他端口。

- **错误：命令未找到（尝试使用 `qwen` 运行 Qwen Code 时）。**  
  - **原因：** CLI 未正确安装，或其可执行路径未加入系统 `PATH` 环境变量。  
  - **解决方案：**  
    更新方式取决于你安装 Qwen Code 的方法：  
    - 若以全局方式安装了 `qwen`，请确认你的 `npm` 全局二进制目录已加入 `PATH`。可使用命令 `npm install -g @qwen-code/qwen-code@latest` 进行更新。  
    - 若从源码运行 `qwen`，请确保使用正确的命令调用（例如 `node packages/cli/dist/index.js ...`）。更新时，请先从仓库拉取最新代码，再运行 `npm run build` 重新构建。

- **错误：`MODULE_NOT_FOUND` 或导入错误。**  
  - **原因：** 依赖项未正确安装，或项目尚未构建。  
  - **解决方案：**  
    1. 运行 `npm install`，确保所有依赖均已安装。  
    2. 运行 `npm run build`，编译项目。  
    3. 使用 `npm run start` 验证构建是否成功完成。

- **错误：“操作不被允许”、“权限被拒绝”或类似提示。**  
  - **原因：** 启用沙箱模式后，Qwen Code 可能尝试执行受沙箱配置限制的操作，例如向项目目录或系统临时目录之外的位置写入文件。  
  - **解决方案：** 请参阅 [配置：沙箱](../features/sandbox) 文档获取更多信息，包括如何自定义沙箱配置。

- **Qwen Code 在“CI”环境中未以交互模式运行**  
  - **问题：** 若设置了以 `CI_` 开头的环境变量（例如 `CI_TOKEN`），Qwen Code 将不会进入交互模式（无命令提示符显示）。这是因为底层 UI 框架所使用的 `is-in-ci` 包会检测此类变量，并默认当前为非交互式 CI 环境。  
  - **原因：** `is-in-ci` 包会检查是否存在 `CI`、`CONTINUOUS_INTEGRATION` 环境变量，或任意以 `CI_` 为前缀的环境变量。只要检测到任一变量，即判定环境为非交互式，从而阻止 CLI 启动交互模式。  
  - **解决方案：** 若该 `CI_` 前缀变量对 CLI 运行并非必需，可在执行命令时临时将其取消设置，例如：`env -u CI_TOKEN qwen`

- **无法通过项目 `.env` 文件启用 DEBUG 模式**  
  - **问题：** 在项目 `.env` 文件中设置 `DEBUG=true` 并不能为 CLI 启用调试模式。  
  - **原因：** `DEBUG` 和 `DEBUG_MODE` 变量会被自动排除在项目 `.env` 文件之外，以避免干扰 CLI 行为。  
  - **解决方案：** 改用 `.qwen/.env` 文件，或在 `settings.json` 中配置 `advanced.excludedEnvVars` 设置，减少被排除的环境变量数量。

## IDE Companion 无法连接

- 确保 VS Code 中仅打开一个工作区文件夹。
- 安装扩展后，重启集成终端，使其继承以下环境变量：
  - `QWEN_CODE_IDE_WORKSPACE_PATH`
  - `QWEN_CODE_IDE_SERVER_PORT`
- 若在容器中运行，请确认 `host.docker.internal` 可正常解析；否则，请正确映射宿主机。
- 使用 `/ide install` 重新安装 companion，并通过命令面板执行 “Qwen Code: Run” 验证其是否成功启动。

## 退出代码

Qwen Code 使用特定的退出代码来指示终止原因。这对于脚本编写和自动化尤其有用。

| 退出代码 | 错误类型                     | 描述                                                                                           |
| -------- | ---------------------------- | ---------------------------------------------------------------------------------------------- |
| 41       | `FatalAuthenticationError`   | 认证过程中发生错误。                                                                            |
| 42       | `FatalInputError`            | 向 CLI 提供了无效或缺失的输入。（仅限非交互模式）                                                |
| 44       | `FatalSandboxError`          | 沙箱环境（例如 Docker、Podman 或 Seatbelt）发生错误。                                            |
| 52       | `FatalConfigError`           | 配置文件（`settings.json`）无效或包含错误。                                                      |
| 53       | `FatalTurnLimitedError`      | 当前会话已达到最大对话轮次限制。（仅限非交互模式）                                                 |

## 调试技巧

- **CLI 调试：**
  - 对 CLI 命令使用 `--verbose` 标志（如果支持），以获取更详细的输出。
  - 查看 CLI 日志，通常位于用户专属的配置目录或缓存目录中。

- **核心调试：**
  - 检查服务器控制台输出中的错误信息或堆栈跟踪。
  - 如果支持，提高日志详细程度。
  - 如需逐步调试服务端代码，可使用 Node.js 调试工具（例如 `node --inspect`）。

- **工具问题：**
  - 若某个特定工具失败，请尝试通过运行该工具所执行的最简命令或操作来隔离问题。
  - 对于 `run_shell_command`，请先在您的 Shell 中直接运行对应命令，确认其能正常工作。
  - 对于 _文件系统类工具_，请验证路径是否正确，并检查相关权限。

- **预检检查：**
  - 提交代码前务必运行 `npm run preflight`。该命令可捕获大量与格式、代码检查（linting）及类型错误相关的常见问题。

## 与您遇到的问题相似的现有 GitHub Issue，或创建新的 Issue

如果您遇到的问题未在本 _故障排除指南_ 中提及，请先搜索 Qwen Code 的 [GitHub Issue 跟踪器](https://github.com/QwenLM/qwen-code/issues)。若找不到与您问题相似的 Issue，欢迎创建一个新的 GitHub Issue，并提供详细描述。我们也欢迎提交 Pull Request！