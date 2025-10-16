# 故障排除指南

本指南提供了常见问题的解决方案和调试技巧，包括以下主题：

- 认证或登录错误
- 常见问题解答 (FAQs)
- 调试技巧
- 与你遇到的问题相似的现有 GitHub Issues 或创建新的 Issues

## 认证或登录错误

- **错误: `UNABLE_TO_GET_ISSUER_CERT_LOCALLY` 或 `unable to get local issuer certificate`**
  - **原因:** 你可能在 corporate network 中，防火墙会拦截并检查 SSL/TLS 流量。这通常需要 Node.js 信任自定义的根 CA 证书。
  - **解决方案:** 将 `NODE_EXTRA_CA_CERTS` 环境变量设置为你的 corporate root CA 证书文件的绝对路径。
    - 示例: `export NODE_EXTRA_CA_CERTS=/path/to/your/corporate-ca.crt`

## 常见问题 (FAQs)

- **Q: 如何将 Qwen Code 更新到最新版本？**
  - A: 如果你是通过 `npm` 全局安装的，可以使用命令 `npm install -g @qwen-code/qwen-code@latest` 进行更新。如果你是从源码编译的，则需要从仓库拉取最新的更改，然后使用命令 `npm run build` 重新构建。

- **Q: Qwen Code 的配置或设置文件存储在哪里？**
  - A: Qwen Code 的配置信息保存在两个 `settings.json` 文件中：
    1. 用户主目录下：`~/.qwen/settings.json`
    2. 项目根目录下：`./.qwen/settings.json`

    更多详情请参考 [Qwen Code 配置说明](./cli/configuration.md)。

- **Q: 为什么我在统计输出中看不到缓存的 token 数量？**
  - A: 缓存的 token 信息只有在实际使用了缓存时才会显示。此功能适用于 API key 用户（如 Qwen API key 或 Google Cloud Vertex AI），但不支持 OAuth 用户（例如 Google 个人账户或企业账户，如 Gmail 或 Google Workspace）。这是因为 Qwen Code Assist API 不支持创建缓存内容。你仍然可以通过 `/stats` 命令查看总的 token 使用情况。

## 常见错误信息及解决方案

- **错误：启动 MCP server 时出现 `EADDRINUSE`（地址已被使用）**
  - **原因：** 另一个进程已经占用了 MCP server 尝试绑定的端口。
  - **解决方案：**
    要么停止占用该端口的其他进程，要么配置 MCP server 使用不同的端口。

- **错误：运行 `qwen` 命令时提示 “Command not found”**
  - **原因：** CLI 没有正确安装，或者未添加到系统的 `PATH` 环境变量中。
  - **解决方案：**
    具体操作取决于你如何安装 Qwen Code：
    - 如果你是全局安装了 `qwen`，请确认你的 `npm` 全局二进制目录已加入系统 `PATH`。你可以通过以下命令更新：`npm install -g @qwen-code/qwen-code@latest`
    - 如果你是从源码运行 `qwen`，请确保使用正确的命令调用它（例如：`node packages/cli/dist/index.js ...`）。要更新的话，请先拉取仓库最新代码，然后执行构建命令：`npm run build`

- **错误：`MODULE_NOT_FOUND` 或导入相关错误**
  - **原因：** 依赖项没有正确安装，或项目尚未完成构建。
  - **解决方案：**
    1. 运行 `npm install` 确保所有依赖都已安装。
    2. 运行 `npm run build` 编译整个项目。
    3. 执行 `npm run start` 验证是否成功启动。

- **错误："Operation not permitted"、"Permission denied" 或类似问题**
  - **原因：** 当启用沙箱机制后，Qwen Code 可能会尝试一些被沙箱策略限制的操作，比如在项目目录或系统临时目录之外进行写入。
  - **解决方案：** 更多详情以及自定义沙箱配置的方法，请参考文档 [Configuration: Sandboxing](./cli/configuration.md#sandboxing)

- **Qwen Code 在 CI 环境下无法进入交互模式**
  - **现象：** 如果设置了以 `CI_` 开头的环境变量（如 `CI_TOKEN`），Qwen Code 不会进入交互模式（即不会显示输入提示符）。这是因为底层 UI 框架使用的 `is-in-ci` 包检测到了这些变量，并认为当前处于非交互式的 CI 环境。
  - **原因：** `is-in-ci` 包会检查是否存在 `CI`、`CONTINUOUS_INTEGRATION` 或任何以 `CI_` 为前缀的环境变量。一旦发现其中之一，就会判定为非交互式环境，从而阻止 CLI 启动交互模式。
  - **解决方案：** 若不需要这个 `CI_` 前缀的变量来驱动 CLI 功能，可以临时取消设置后再运行命令，例如：`env -u CI_TOKEN qwen`

- **DEBUG 模式无法通过项目中的 .env 文件生效**
  - **现象：** 即使你在项目的 `.env` 文件里设置了 `DEBUG=true`，也无法激活 CLI 的 debug 模式。
  - **原因：** 为了避免影响 CLI 行为，`DEBUG` 和 `DEBUG_MODE` 这两个变量会被自动排除在项目 `.env` 文件之外。
  - **解决方案：** 改用 `.qwen/.env` 文件来进行配置，或者修改你的 `settings.json` 中的 `excludedProjectEnvVars` 设置，减少被排除的变量数量。

## IDE Companion 无法连接

- 确保 VS Code 中只打开一个 workspace folder。
- 安装扩展后重启集成终端，以便继承以下环境变量：
  - `QWEN_CODE_IDE_WORKSPACE_PATH`
  - `QWEN_CODE_IDE_SERVER_PORT`
- 如果在容器中运行，请确认 `host.docker.internal` 可以解析。否则，请适当映射主机地址。
- 使用 `/ide install` 重新安装 companion，并通过命令面板中的 "Qwen Code: Run" 来验证是否能正常启动。

## 退出码

Qwen Code 使用特定的退出码来指示终止的原因。这对于脚本编写和自动化特别有用。

| 退出码 | 错误类型                   | 描述                                                                                           |
| ------ | -------------------------- | ---------------------------------------------------------------------------------------------- |
| 41     | `FatalAuthenticationError` | 在认证过程中发生了错误。                                                                       |
| 42     | `FatalInputError`          | 提供给 CLI 的输入无效或缺失。（仅限非交互模式）                                                 |
| 44     | `FatalSandboxError`        | 沙箱环境（例如 Docker、Podman 或 Seatbelt）发生了错误。                                         |
| 52     | `FatalConfigError`         | 配置文件（`settings.json`）无效或包含错误。                                                    |
| 53     | `FatalTurnLimitedError`    | 达到了会话的最大对话轮数。（仅限非交互模式）                                                   |

## 调试技巧

- **CLI 调试：**
  - 使用 `--verbose` 参数（如果可用）来获取更详细的输出信息。
  - 检查 CLI 日志，通常位于用户特定的配置或缓存目录中。

- **核心调试：**
  - 查看服务器控制台输出中的错误信息或堆栈跟踪。
  - 如果可以配置，尝试提高日志详细程度。
  - 如需逐步调试服务端代码，可使用 Node.js 调试工具（例如 `node --inspect`）。

- **工具问题：**
  - 如果某个特定工具失败，尝试通过运行该工具执行的最简版本命令或操作来隔离问题。
  - 对于 `run_shell_command`，先确认命令在你的 shell 中可以直接运行。
  - 对于_文件系统工具_，验证路径是否正确并检查权限设置。

- **预检检查：**
  - 提交代码前务必运行 `npm run preflight`。这能捕获许多常见的格式、linting 和类型错误问题。

## 查找类似的 GitHub Issues 或创建新 Issue

如果你遇到的问题未在本 _故障排除指南_ 中涵盖，建议搜索 Qwen Code 的 [GitHub Issue 跟踪器](https://github.com/QwenLM/qwen-code/issues)。如果找不到与你问题相似的 Issue，欢迎创建一个新的 GitHub Issue，并提供详细描述。我们也欢迎 Pull Request！