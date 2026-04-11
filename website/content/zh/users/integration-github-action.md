# GitHub Actions：qwen-code-action

## 概述

`qwen-code-action` 是一个 GitHub Action，它通过 [Qwen Code CLI] 将 [Qwen Code] 集成到你的开发工作流中。它既可以作为处理关键日常编码任务的自主代理，也可以作为你随时委派工作的按需协作者。

你可以直接在 GitHub 仓库中使用 [Qwen Code] 以对话方式（例如 `@qwencoder fix this issue`）执行 GitHub Pull Request 审查、Issue 分类、代码分析与修改等任务。

## 功能特性

- **自动化**：基于事件（例如 Issue 创建）或计划（例如每日夜间）触发工作流。
- **按需协作**：在 Issue 和 Pull Request 评论中提及 [Qwen Code CLI](./features/commands) 即可触发工作流（例如 `@qwencoder /review`）。
- **工具扩展**：利用 [Qwen Code](../developers/tools/introduction.md) 模型的工具调用能力，与其他 CLI（如 [GitHub CLI] (`gh`)）进行交互。
- **可定制**：在仓库中使用 `QWEN.md` 文件，为 [Qwen Code CLI](./features/commands) 提供项目专属的指令和上下文。

## 快速开始

只需几分钟，即可在你的仓库中开始使用 Qwen Code CLI：

### 1. 获取 Qwen API Key

从 [DashScope](https://help.aliyun.com/zh/model-studio/qwen-code)（阿里云 AI 平台）获取你的 API Key。

### 2. 将其添加为 GitHub Secret

将你的 API Key 作为名为 `QWEN_API_KEY` 的 Secret 存储在仓库中：

- 进入仓库的 **Settings > Secrets and variables > Actions**
- 点击 **New repository secret**
- Name: `QWEN_API_KEY`，Value: 你的 API Key

### 3. 更新你的 .gitignore

将以下内容添加到你的 `.gitignore` 文件中：

```gitignore
# qwen-code-cli settings
.qwen/

# GitHub App credentials
gha-creds-*.json
```

### 4. 选择工作流

你有两种设置工作流的方式：

**选项 A：使用 setup 命令（推荐）**

1. 在终端中启动 Qwen Code CLI：

   ```shell
   qwen
   ```

2. 在终端的 Qwen Code CLI 中输入：

   ```
   /setup-github
   ```

**选项 B：手动复制工作流**

1. 将 [`examples/workflows`](./common-workflow) 目录中的预构建工作流复制到仓库的 `.github/workflows` 目录。注意：必须同时复制 `qwen-dispatch.yml` 工作流，它负责触发其他工作流运行。

### 5. 试用

**Pull Request 审查：**

- 在仓库中创建 Pull Request 并等待自动审查
- 在现有的 Pull Request 中评论 `@qwencoder /review` 以手动触发审查

**Issue 分类：**

- 创建 Issue 并等待自动分类
- 在现有的 Issue 中评论 `@qwencoder /triage` 以手动触发分类

**通用 AI 辅助：**

- 在任何 Issue 或 Pull Request 中提及 `@qwencoder` 并附上你的需求
- 示例：
  - `@qwencoder explain this code change`
  - `@qwencoder suggest improvements for this function`
  - `@qwencoder help me debug this error`
  - `@qwencoder write unit tests for this component`

## 工作流

该 Action 提供了多个针对不同使用场景的预构建工作流。每个工作流都设计为复制到仓库的 `.github/workflows` 目录中，并按需进行定制。

### Qwen Code Dispatch

此工作流充当 Qwen Code CLI 的中心调度器，根据触发事件和评论中提供的命令，将请求路由到相应的工作流。有关如何设置调度工作流的详细指南，请参阅 [Qwen Code Dispatch 工作流文档](./common-workflow)。

### Issue Triage

此 Action 可用于自动或按计划对 GitHub Issue 进行分类。有关如何设置 Issue 分类系统的详细指南，请参阅 [GitHub Issue Triage 工作流文档](./examples/workflows/issue-triage)。

### Pull Request Review

此 Action 可在 Pull Request 创建时自动进行审查。有关如何设置 Pull Request 审查系统的详细指南，请参阅 [GitHub PR Review 工作流文档](./common-workflow)。

### Qwen Code CLI Assistant

此类 Action 可用于在 Pull Request 和 Issue 中调用通用的对话式 Qwen Code AI 助手，以执行各种任务。有关如何设置通用 Qwen Code CLI 工作流的详细指南，请参阅 [Qwen Code Assistant 工作流文档](./common-workflow)。

## 配置

### 输入参数

<!-- BEGIN_AUTOGEN_INPUTS -->

- <a name="__input_qwen_api_key"></a><a href="#user-content-__input_qwen_api_key"><code>qwen*api_key</code></a>: *(可选)* Qwen API 的 API Key。

- <a name="__input_qwen_cli_version"></a><a href="#user-content-__input_qwen_cli_version"><code>qwen*cli_version</code></a>: *(可选，默认：`latest`)* 要安装的 Qwen Code CLI 版本。可以是 "latest"、"preview"、"nightly"、具体版本号，或 git 分支、标签、提交。更多信息请参阅 [Qwen Code CLI 版本发布](https://github.com/QwenLM/qwen-code-action/blob/main/docs/releases.md)。

- <a name="__input_qwen_debug"></a><a href="#user-content-__input_qwen_debug"><code>qwen*debug</code></a>: *(可选)* 启用调试日志和输出流。

- <a name="__input_qwen_model"></a><a href="#user-content-__input_qwen_model"><code>qwen*model</code></a>: *(可选)* 与 Qwen Code 配合使用的模型。

- <a name="__input_prompt"></a><a href="#user-content-__input_prompt"><code>prompt</code></a>: _(可选，默认：`You are a helpful assistant.`)_ 传递给 Qwen Code CLI [`--prompt` 参数](https://github.com/QwenLM/qwen-code-action/blob/main/docs/cli/configuration.md#command-line-arguments) 的字符串。

- <a name="__input_settings"></a><a href="#user-content-__input_settings"><code>settings</code></a>: _(可选)_ 写入 `.qwen/settings.json` 的 JSON 字符串，用于配置 CLI 的 _项目_ 设置。
  更多详情，请参阅 [设置文件文档](https://github.com/QwenLM/qwen-code-action/blob/main/docs/cli/configuration.md#settings-files)。

- <a name="__input_use_qwen_code_assist"></a><a href="#user-content-__input_use_qwen_code_assist"><code>use*qwen_code_assist</code></a>: *(可选，默认：`false`)* 是否使用 Code Assist 访问 Qwen Code 模型，而非默认的 Qwen Code API Key。
  更多信息请参阅 [Qwen Code CLI 文档](https://github.com/QwenLM/qwen-code-action/blob/main/docs/cli/authentication.md)。

- <a name="__input_use_vertex_ai"></a><a href="#user-content-__input_use_vertex_ai"><code>use*vertex_ai</code></a>: *(可选，默认：`false`)* 是否使用 Vertex AI 访问 Qwen Code 模型，而非默认的 Qwen Code API Key。
  更多信息请参阅 [Qwen Code CLI 文档](https://github.com/QwenLM/qwen-code-action/blob/main/docs/cli/authentication.md)。

- <a name="__input_extensions"></a><a href="#user-content-__input_extensions"><code>extensions</code></a>: _(可选)_ 要安装的 Qwen Code CLI 扩展列表。

- <a name="__input_upload_artifacts"></a><a href="#user-content-__input_upload_artifacts"><code>upload*artifacts</code></a>: *(可选，默认：`false`)* 是否将产物上传到 GitHub Action。

- <a name="__input_use_pnpm"></a><a href="#user-content-__input_use_pnpm"><code>use*pnpm</code></a>: *(可选，默认：`false`)* 是否使用 pnpm 而非 npm 安装 qwen-code-cli。

- <a name="__input_workflow_name"></a><a href="#user-content-__input_workflow_name"><code>workflow*name</code></a>: *(可选，默认：`${{ github.workflow }}`)* GitHub 工作流名称，用于遥测目的。

<!-- END_AUTOGEN_INPUTS -->

### 输出参数

<!-- BEGIN_AUTOGEN_OUTPUTS -->

- <a name="__output_summary"></a><a href="#user-content-__output_summary"><code>summary</code></a>: Qwen Code CLI 执行后的摘要输出。

- <a name="__output_error"></a><a href="#user-content-__output_error"><code>error</code></a>: Qwen Code CLI 执行后的错误输出（如有）。

<!-- END_AUTOGEN_OUTPUTS -->

### 仓库变量

我们建议将以下值设置为仓库变量，以便在所有工作流中复用。你也可以在单个工作流中将其作为 Action 输入参数内联设置，或用于覆盖仓库级别的值。

| 名称               | 描述                                               | 类型     | 是否必需 | 何时需要             |
| ------------------ | --------------------------------------------------------- | -------- | -------- | ------------------------- |
| `DEBUG`            | 启用 Qwen Code CLI 的调试日志。              | 变量 | 否       | 从不                     |
| `QWEN_CLI_VERSION` | 控制安装的 Qwen Code CLI 版本。 | 变量 | 否       | 固定 CLI 版本时   |
| `APP_ID`           | 用于自定义身份验证的 GitHub App ID。                  | 变量 | 否       | 使用自定义 GitHub App 时 |

添加仓库变量的步骤：

1. 进入仓库的 **Settings > Secrets and variables > Actions > New variable**。
2. 输入变量名称和值。
3. 保存。

有关仓库变量的详细信息，请参阅 [GitHub 变量文档][variables]。

### Secrets

你可以在仓库中设置以下 Secrets：

| 名称              | 描述                                   | 是否必需 | 何时需要                              |
| ----------------- | --------------------------------------------- | -------- | ------------------------------------------ |
| `QWEN_API_KEY`    | 来自 DashScope 的 Qwen API Key。             | 是      | 所有调用 Qwen 的工作流均需要。 |
| `APP_PRIVATE_KEY` | 你的 GitHub App 私钥（PEM 格式）。 | 否       | 使用自定义 GitHub App 时。                 |

添加 Secret 的步骤：

1. 进入仓库的 **Settings > Secrets and variables > Actions > New repository secret**。
2. 输入 Secret 名称和值。
3. 保存。

更多信息，请参阅 [GitHub 创建和使用加密 Secrets 官方文档][secrets]。

## 身份验证

此 Action 需要对 GitHub API 进行身份验证，并可选择对 Qwen Code 服务进行身份验证。

### GitHub 身份验证

你可以通过以下两种方式向 GitHub 进行身份验证：

1. **默认 `GITHUB_TOKEN`：** 对于较简单的使用场景，Action 可以使用工作流提供的默认 `GITHUB_TOKEN`。
2. **自定义 GitHub App（推荐）：** 为了获得最安全、最灵活的身份验证，我们建议创建自定义 GitHub App。

有关 Qwen 和 GitHub 身份验证的详细设置说明，请参阅 [**身份验证文档**](./configuration/auth)。

## 扩展

Qwen Code CLI 可以通过扩展添加额外功能。
这些扩展从其 GitHub 仓库以源码形式安装。

有关如何设置和配置扩展的详细说明，请参阅 [扩展文档](../developers/extensions/extension)。

## 最佳实践

为确保自动化工作流的安全性、可靠性和效率，我们强烈建议遵循我们的最佳实践。这些指南涵盖仓库安全、工作流配置和监控等关键领域。

核心建议包括：

- **保护仓库安全：** 实施分支和标签保护，并限制 Pull Request 审批人。
- **监控与审计：** 定期审查 Action 日志，并启用 OpenTelemetry 以深入了解性能和行为。

有关保护仓库和工作流的完整指南，请参阅我们的 [**最佳实践文档**](./common-workflow)。

## 自定义

在仓库根目录创建 `QWEN.md` 文件，为 [Qwen Code CLI](./common-workflow) 提供项目专属的上下文和指令。这有助于定义编码规范、架构模式或模型在特定仓库中应遵循的其他指南。

## 贡献指南

欢迎贡献！请查阅 Qwen Code CLI **贡献指南**，了解如何开始参与。

[secrets]: https://docs.github.com/en/actions/security-guides/using-secrets-in-github-actions
[Qwen Code]: https://github.com/QwenLM/qwen-code
[DashScope]: https://dashscope.console.aliyun.com/apiKey
[Qwen Code CLI]: https://github.com/QwenLM/qwen-code-action/
[variables]: https://docs.github.com/en/actions/how-tos/write-workflows/choose-what-workflows-do/use-variables#creating-configuration-variables-for-a-repository
[GitHub CLI]: https://docs.github.com/en/github-cli/github-cli
[QWEN.md]: https://github.com/QwenLM/qwen-code-action/blob/main/docs/cli/configuration.md#context-files-hierarchical-instructional-context