# 故障排查

本指南提供了常见问题的解决方案和调试技巧，涵盖以下主题：

- 身份验证或登录错误
- 常见问题解答 (FAQ)
- 调试技巧
- 查找类似的现有 GitHub Issue 或创建新 Issue

## 身份验证或登录错误

- **错误：`Qwen OAuth free tier was discontinued on 2026-04-15`**
  - **原因：** 自 2026 年 4 月 15 日起，Qwen OAuth 已不再提供服务。
  - **解决方案：** 切换到其他身份验证方法。运行 `qwen` → `/auth` 并选择以下选项之一：
    - **API Key**：使用 Alibaba Cloud Model Studio 的 API Key（[中国站](https://bailian.console.aliyun.com/) / [国际站](https://modelstudio.console.alibabacloud.com/)）。请参阅 API 配置指南（[中国站](https://bailian.console.aliyun.com/cn-beijing/?tab=doc#/doc/?type=model&url=3023091) / [国际站](https://modelstudio.console.alibabacloud.com/ap-southeast-1?tab=doc#/doc/?type=model&url=2974721)）。
    - **Alibaba Cloud Coding Plan**：订阅固定月费套餐，享有更高配额。请参阅 Coding Plan 指南（[中国站](https://bailian.console.aliyun.com/cn-beijing/?tab=coding-plan#/efm/coding-plan-index) / [国际站](https://modelstudio.console.alibabacloud.com/?tab=coding-plan#/efm/coding-plan-index)）。

- **错误：`UNABLE_TO_GET_ISSUER_CERT_LOCALLY`、`UNABLE_TO_VERIFY_LEAF_SIGNATURE` 或 `unable to get local issuer certificate`**
  - **原因：** 你可能处于企业网络中，防火墙会拦截并检查 SSL/TLS 流量。这通常需要 Node.js 信任自定义的根 CA 证书。
  - **解决方案：** 将 `NODE_EXTRA_CA_CERTS` 环境变量设置为企业根 CA 证书文件的绝对路径。
    - 示例：`export NODE_EXTRA_CA_CERTS=/path/to/your/corporate-ca.crt`

- **错误：`Device authorization flow failed: fetch failed`**
  - **原因：** Node.js 无法访问 Qwen OAuth 端点（通常是代理或 SSL/TLS 信任问题）。如果可用，Qwen Code 还会打印底层错误原因（例如：`UNABLE_TO_VERIFY_LEAF_SIGNATURE`）。注意：此错误仅针对旧版 Qwen OAuth 流程。
  - **解决方案：**
    - 如果你仍在使用 Qwen OAuth，请通过 `/auth` 切换到 API Key 或 Coding Plan。
    - 如果你处于代理之后，请通过 `qwen --proxy <url>` 进行设置（或在 `settings.json` 中配置 `proxy` 选项）。
    - 如果你的网络使用企业 TLS 检查 CA，请按上述说明设置 `NODE_EXTRA_CA_CERTS`。

- **问题：身份验证失败后无法显示 UI**
  - **原因：** 如果在选择身份验证类型后验证失败，`security.auth.selectedType` 设置可能会被持久化到 `settings.json` 中。重启时，CLI 可能会卡在尝试使用失败的身份验证类型进行验证，从而导致无法显示 UI。
  - **解决方案：** 清除 `settings.json` 文件中的 `security.auth.selectedType` 配置项：
    - 打开 `~/.qwen/settings.json`（或项目级设置的 `./.qwen/settings.json`）
    - 删除 `security.auth.selectedType` 字段
    - 重启 CLI，使其再次提示进行身份验证

## 常见问题解答 (FAQ)

- **问：如何将 Qwen Code 更新到最新版本？**
  - **答：** 如果你使用独立安装程序安装了 Qwen Code，请重新运行独立安装命令。如果你通过 `npm` 全局安装，请使用命令 `npm install -g @qwen-code/qwen-code@latest` 进行更新。如果你是从源码编译的，请从仓库拉取最新更改，然后使用命令 `npm run build` 重新构建。

- **问：Qwen Code 的配置或设置文件存储在哪里？**
  - **答：** Qwen Code 的配置存储在两个 `settings.json` 文件中：
    1. 用户主目录：`~/.qwen/settings.json`。
    2. 项目根目录：`./.qwen/settings.json`。

    更多详情请参阅 [Qwen Code 配置](../configuration/settings)。

- **问：为什么我在 stats 输出中看不到缓存的 token 数量？**
  - **答：** 仅在使用缓存 token 时才会显示缓存 token 信息。此功能适用于 API Key 用户（例如 Alibaba Cloud Model Studio API Key 或 Google Cloud Vertex AI）。你仍然可以使用 `/stats` 命令查看总的 token 使用量。

## 常见错误信息及解决方案

- **错误：启动 MCP 服务器时出现 `EADDRINUSE`（地址已被占用）。**
  - **原因：** 另一个进程已经占用了 MCP 服务器尝试绑定的端口。
  - **解决方案：**
    停止占用该端口的其他进程，或配置 MCP 服务器使用其他端口。

- **错误：Command not found（尝试使用 `qwen` 运行 Qwen Code 时）。**
  - **原因：** CLI 未正确安装，或未添加到系统的 `PATH` 环境变量中。
  - **解决方案：**
    更新方法取决于你安装 Qwen Code 的方式：
    - 如果你使用独立安装程序安装了 `qwen`，请重新运行独立安装命令，然后打开新终端。
    - 如果你全局安装了 `qwen`，请检查 `npm` 全局二进制目录是否已加入 `PATH`。你可以使用命令 `npm install -g @qwen-code/qwen-code@latest` 进行更新。
    - 如果你从源码运行 `qwen`，请确保使用正确的命令调用它（例如 `node packages/cli/dist/index.js ...`）。如需更新，请从仓库拉取最新更改，然后使用命令 `npm run build` 重新构建。

- **错误：`MODULE_NOT_FOUND` 或导入错误。**
  - **原因：** 依赖未正确安装，或项目尚未构建。
  - **解决方案：**
    1. 运行 `npm install` 以确保所有依赖项已就位。
    2. 运行 `npm run build` 编译项目。
    3. 使用 `npm run start` 验证构建是否成功完成。

- **错误："Operation not permitted"、"Permission denied" 或类似错误。**
  - **原因：** 启用沙箱后，Qwen Code 可能会尝试执行受沙箱配置限制的操作，例如在项目目录或系统临时目录之外写入文件。
  - **解决方案：** 请参阅 [配置：沙箱](../features/sandbox) 文档获取更多信息，包括如何自定义沙箱配置。

- **问题：Qwen Code 在 "CI" 环境中未以交互模式运行**
  - **现象：** 如果设置了以 `CI_` 开头的环境变量（例如 `CI_TOKEN`），Qwen Code 将不会进入交互模式（不会出现提示符）。这是因为底层 UI 框架使用的 `is-in-ci` 包会检测这些变量，并假定当前为非交互的 CI 环境。
  - **原因：** `is-in-ci` 包会检查是否存在 `CI`、`CONTINUOUS_INTEGRATION` 或任何带有 `CI_` 前缀的环境变量。当检测到其中任意一个时，它会标记当前环境为非交互环境，从而阻止 CLI 以交互模式启动。
  - **解决方案：** 如果 CLI 运行不需要该 `CI_` 前缀的变量，你可以在执行命令时临时取消设置它。例如：`env -u CI_TOKEN qwen`

- **问题：项目 .env 文件中的 DEBUG 模式未生效**
  - **现象：** 在项目的 `.env` 文件中设置 `DEBUG=true` 无法为 CLI 启用调试模式。
  - **原因：** 为防止干扰 CLI 行为，`DEBUG` 和 `DEBUG_MODE` 变量会自动从项目 `.env` 文件中排除。
  - **解决方案：** 改用 `.qwen/.env` 文件，或在 `settings.json` 中配置 `advanced.excludedEnvVars` 设置以减少排除的变量。

- **问题：在 tmux 中触控板滚动改变提示历史记录而非滚动对话**
  - **现象：** 在 tmux 会话中，触控板或滚轮滚动可能会循环遍历之前的提示，类似于按 `Up Arrow` 或 `Down Arrow`。
  - **原因：** tmux 可以将滚轮手势转换为普通方向键序列。这些序列在 qwen-code 收到时与真实方向键按键无法区分。
  - **解决方案：** 启用 `ui.useTerminalBuffer`；然后使用 `Shift+Up` / `Shift+Down`，或在 tmux 将滚轮事件转发给应用时使用鼠标滚轮。如果你偏好宿主回滚，请调整 tmux 中滚轮事件的鼠标绑定。

## IDE Companion 无法连接

- 确保 VS Code 仅打开了一个工作区文件夹。
- 安装扩展后重启集成终端，以便其继承以下环境变量：
  - `QWEN_CODE_IDE_WORKSPACE_PATH`
  - `QWEN_CODE_IDE_SERVER_PORT`
- 如果在容器中运行，请验证 `host.docker.internal` 能否正确解析。否则，请适当映射主机。
- 使用 `/ide install` 重新安装 Companion，并在命令面板中使用 “Qwen Code: Run” 验证其是否正常启动。

## 退出码

Qwen Code 使用特定的退出码来指示终止原因。这在编写脚本和自动化任务时非常有用。

| 退出码 | 错误类型                   | 描述                                                                      |
| ------ | -------------------------- | ------------------------------------------------------------------------- |
| 41     | `FatalAuthenticationError` | 身份验证过程中发生错误。                                                  |
| 42     | `FatalInputError`          | 向 CLI 提供了无效或缺失的输入。（仅限非交互模式）                        |
| 44     | `FatalSandboxError`        | 沙箱环境发生错误（例如 Docker、Podman 或 Seatbelt）。                    |
| 52     | `FatalConfigError`         | 配置文件（`settings.json`）无效或包含错误。                               |
| 53     | `FatalTurnLimitedError`    | 已达到会话的最大对话轮数限制。（仅限非交互模式）                         |

## 调试技巧

- **CLI 调试：**
  - 在 CLI 命令中使用 `--verbose` 标志（如果可用）以获取更详细的输出。
  - 检查 CLI 日志，通常位于用户特定的配置或缓存目录中。

- **核心调试：**
  - 检查服务器控制台输出中的错误消息或堆栈跟踪。
  - 如果支持配置，请提高日志详细程度。
  - 如果需要逐步调试服务端代码，请使用 Node.js 调试工具（例如 `node --inspect`）。

- **工具问题：**
  - 如果某个特定工具失败，请尝试运行该工具执行的最简命令或操作版本，以隔离问题。
  - 对于 `run_shell_command`，请先检查该命令能否直接在 shell 中正常运行。
  - 对于_文件系统工具_，请验证路径是否正确并检查权限。

- **预检检查：**
  - 提交代码前务必运行 `npm run preflight`。这可以捕获许多与格式化、代码检查和类型错误相关的常见问题。

## 查找类似的现有 GitHub Issue 或创建新 Issue

如果你遇到本_故障排查指南_未涵盖的问题，建议搜索 Qwen Code 的 [GitHub Issue 跟踪器](https://github.com/QwenLM/qwen-code/issues)。如果找不到类似的问题，建议创建一个包含详细描述的新 GitHub Issue。同时也欢迎提交 Pull Request！