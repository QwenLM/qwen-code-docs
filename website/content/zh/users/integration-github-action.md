# GitHub Actions：qwen-code-action

## 概述

`qwen-code-action` 是一个 GitHub Action，它通过 [Qwen Code CLI] 将 [Qwen Code] 集成到你的开发工作流中。它既可以作为自主代理处理关键的日常编码任务，也可以作为按需协作者，让你快速委派工作。

你可以直接在 GitHub 仓库中使用它，通过对话方式（例如 `@qwencoder fix this issue`）使用 [Qwen Code] 来执行 GitHub pull request 审查、问题分类、代码分析和修改等操作。

## 特性

- **自动化**：基于事件（如 issue 创建）或计划任务（如每晚）触发工作流。
- **按需协作**：在 issue 和 pull request 评论中提及 [Qwen Code CLI](./features/commands) 来触发工作流（例如 `@qwencoder /review`）。
- **工具扩展**：利用 [Qwen Code](../developers/tools/introduction.md) 模型的工具调用能力，与 [GitHub CLI] (`gh`) 等其他 CLI 进行交互。
- **可定制**：在仓库中使用 `QWEN.md` 文件，为 [Qwen Code CLI](./features/commands) 提供特定于项目的指令和上下文。

## 快速开始

只需几分钟，即可在你的仓库中开始使用 Qwen Code CLI：

### 1. 获取 Qwen API Key

从 [DashScope](https://help.aliyun.com/zh/model-studio/qwen-code)（阿里云的 AI 平台）获取你的 API key。

### 2. 将其添加为 GitHub Secret

将你的 API key 作为名为 `QWEN_API_KEY` 的 secret 存储在仓库中：

- 进入仓库的 **Settings > Secrets and variables > Actions**
- 点击 **New repository secret**
- Name：`QWEN_API_KEY`，Value：你的 API key

### 3. 更新 .gitignore

将以下条目添加到你的 `.gitignore` 文件中：

```gitignore
# qwen-code-cli settings
.qwen/

# GitHub App credentials
gha-creds-*.json
```

### 4. 选择工作流

你有两个选项来设置工作流：

**选项 A：使用 setup 命令（推荐）**

1. 在终端中启动 Qwen Code CLI：

   ```shell
   qwen
   ```

2. 在终端的 Qwen Code CLI 中，输入：

   ```
   /setup-github
   ```

**选项 B：手动复制工作流**

1. 将 [`examples/workflows`](./common-workflow) 目录中的预构建工作流复制到仓库的 `.github/workflows` 目录中。注意：还必须复制 `qwen-dispatch.yml` 工作流，它会触发其他工作流运行。

### 5. 试用

**Pull Request 审查：**

- 在仓库中打开一个 pull request 并等待自动审查
- 在现有的 pull request 中评论 `@qwencoder /review` 以手动触发审查

**Issue 分类：**

- 打开一个 issue 并等待自动分类
- 在现有 issue 中评论 `@qwencoder /triage` 以手动触发分类

**通用 AI 协助：**

- 在任何 issue 或 pull request 中，提及 `@qwencoder` 并附上你的请求
- 示例：
  - `@qwencoder explain this code change`
  - `@qwencoder suggest improvements for this function`
  - `@qwencoder help me debug this error`
  - `@qwencoder write unit tests for this component`

## 工作流

此 action 为不同的用例提供了几个预构建的工作流。每个工作流都旨在被复制到仓库的 `.github/workflows` 目录中，并根据需要进行自定义。

### Qwen Code Dispatch

此工作流充当 Qwen Code CLI 的中央调度器，根据触发事件和评论中提供的命令将请求路由到相应的工作流。有关如何设置调度工作流的详细指南，请参阅 [Qwen Code Dispatch 工作流文档](./common-workflow)。

### Issue 分类

此 action 可用于自动或按计划对 GitHub Issues 进行分类。有关可运行的 issue 分类设置，请参阅[自动化 issue 分类工作流](https://github.com/QwenLM/qwen-code/blob/main/.github/workflows/qwen-automated-issue-triage.yml)。

### Pull Request 审查

此 action 可用于在 pull request 打开时自动进行审查。有关如何设置 pull request 审查系统的详细指南，请参阅 [GitHub PR Review 工作流文档](./common-workflow)。

### Qwen Code CLI Assistant

此类 action 可用于在 pull request 和 issue 中调用通用的对话式 Qwen Code AI 助手，以执行各种任务。有关如何设置通用 Qwen Code CLI 工作流的详细指南，请参阅 [Qwen Code Assistant 工作流文档](./common-workflow)。

## 配置

### 输入

<!-- BEGIN_AUTOGEN_INPUTS -->

- <a name="__input_qwen_api_key"></a><a href="#user-content-__input_qwen_api_key"><code>qwen*api_key</code></a>: *(Optional)\_ Qwen API 的 API key。

- <a name="__input_qwen_cli_version"></a><a href="#user-content-__input_qwen_cli_version"><code>qwen*cli_version</code></a>: *(Optional, default: `latest`)\_ 要安装的 Qwen Code CLI 版本。可以是 "latest"、"preview"、"nightly"、特定版本号，或 git 分支、标签、提交。有关更多信息，请参阅 [Qwen Code CLI releases](https://github.com/QwenLM/qwen-code-action/blob/main/docs/releases.md)。

- <a name="__input_qwen_debug"></a><a href="#user-content-__input_qwen_debug"><code>qwen*debug</code></a>: *(Optional)\_ 启用调试日志和输出流。

- <a name="__input_qwen_model"></a><a href="#user-content-__input_qwen_model"><code>qwen*model</code></a>: *(Optional)\_ 与 Qwen Code 一起使用的模型。

- <a name="__input_prompt"></a><a href="#user-content-__input_prompt"><code>prompt</code></a>: _(Optional, default: `You are a helpful assistant.`)_ 传递给 Qwen Code CLI 的 [`--prompt` 参数](https://github.com/QwenLM/qwen-code-action/blob/main/docs/cli/configuration.md#command-line-arguments) 的字符串。

- <a name="__input_settings"></a><a href="#user-content-__input_settings"><code>settings</code></a>: _(Optional)_ 写入 `.qwen/settings.json` 以配置 CLI _项目_ 设置的 JSON 字符串。
  有关更多详细信息，请参阅[设置文件](https://github.com/QwenLM/qwen-code-action/blob/main/docs/cli/configuration.md#settings-files)文档。

- <a name="__input_use_qwen_code_assist"></a><a href="#user-content-__input_use_qwen_code_assist"><code>use*qwen_code_assist</code></a>: *(Optional, default: `false`)\_ 是否使用 Code Assist 进行 Qwen Code 模型访问，而不是使用默认的 Qwen Code API key。
  有关更多信息，请参阅 [Qwen Code CLI 文档](https://github.com/QwenLM/qwen-code-action/blob/main/docs/cli/authentication.md)。

- <a name="__input_use_vertex_ai"></a><a href="#user-content-__input_use_vertex_ai"><code>use*vertex_ai</code></a>: *(Optional, default: `false`)\_ 是否使用 Vertex AI 进行 Qwen Code 模型访问，而不是使用默认的 Qwen Code API key。
  有关更多信息，请参阅 [Qwen Code CLI 文档](https://github.com/QwenLM/qwen-code-action/blob/main/docs/cli/authentication.md)。

- <a name="__input_extensions"></a><a href="#user-content-__input_extensions"><code>extensions</code></a>: _(Optional)_ 要安装的 Qwen Code CLI 扩展列表。

- <a name="__input_upload_artifacts"></a><a href="#user-content-__input_upload_artifacts"><code>upload*artifacts</code></a>: *(Optional, default: `false`)\_ 是否将 artifacts 上传到 github action。

- <a name="__input_use_pnpm"></a><a href="#user-content-__input_use_pnpm"><code>use*pnpm</code></a>: *(Optional, default: `false`)\_ 是否使用 pnpm 而不是 npm 来安装 qwen-code-cli

- <a name="__input_workflow_name"></a><a href="#user-content-__input_workflow_name"><code>workflow*name</code></a>: *(Optional, default: `${{ github.workflow }}`)\_ GitHub 工作流名称，用于遥测目的。

<!-- END_AUTOGEN_INPUTS -->

### 输出

<!-- BEGIN_AUTOGEN_OUTPUTS -->

- <a name="__output_summary"></a><a href="#user-content-__output_summary"><code>summary</code></a>: Qwen Code CLI 执行的摘要输出。

- <a name="__output_error"></a><a href="#user-content-__output_error"><code>error</code></a>: Qwen Code CLI 执行的错误输出（如果有）。

<!-- END_AUTOGEN_OUTPUTS -->

### 仓库变量

我们建议将以下值设置为仓库变量，以便在所有工作流中重用。或者，你可以在各个工作流中将它们作为 action 输入内联设置，或用于覆盖仓库级别的值。

| 名称 | 描述 | 类型 | 必填 | 何时必填 |
| ------------------ | --------------------------------------------------------- | -------- | -------- | ------------------------- |
| `DEBUG`            | 启用 Qwen Code CLI 的调试日志。              | 变量 | 否       | 从不                     |
| `QWEN_CLI_VERSION` | 控制安装的 Qwen Code CLI 版本。 | 变量 | 否       | 固定 CLI 版本时   |
| `APP_ID`           | 用于自定义身份验证的 GitHub App ID。                  | 变量 | 否       | 使用自定义 GitHub App 时 |

添加仓库变量：

1. 进入仓库的 **Settings > Secrets and variables > Actions > New variable**。
2. 输入变量名称和值。
3. 保存。

有关仓库变量的详细信息，请参阅 [GitHub 变量文档][variables]。

### Secrets

你可以在仓库中设置以下 secrets：

| 名称              | 描述                                   | 必填 | 何时必填                              |
| ----------------- | --------------------------------------------- | -------- | ------------------------------------------ |
| `QWEN_API_KEY`    | 你从 DashScope 获取的 Qwen API key。             | 是      | 所有调用 Qwen 的工作流均需要 |
| `APP_PRIVATE_KEY` | 你的 GitHub App 私钥（PEM 格式）。 | 否       | 使用自定义 GitHub App 时                 |

添加 secret：

1. 进入仓库的 **Settings > Secrets and variables > Actions > New repository secret**。
2. 输入 secret 名称和值。
3. 保存。

有关更多信息，请参阅[创建和使用加密 secrets 的 GitHub 官方文档][secrets]。

## 身份验证

此 action 需要对 GitHub API 进行身份验证，并可选择对 Qwen Code 服务进行身份验证。

### GitHub 身份验证

你可以通过两种方式对 GitHub 进行身份验证：

1. **默认 `GITHUB_TOKEN`：** 对于较简单的用例，action 可以使用工作流提供的默认 `GITHUB_TOKEN`。
2. **自定义 GitHub App（推荐）：** 为了获得最安全、最灵活的身份验证，我们建议创建自定义 GitHub App。

有关 Qwen 和 GitHub 身份验证的详细设置说明，请参阅[**身份验证文档**](./configuration/auth)。

## 扩展

Qwen Code CLI 可以通过扩展来增加额外功能。
这些扩展从其 GitHub 仓库的源代码安装。

有关如何设置和配置扩展的详细说明，请参阅[扩展文档](./extension/introduction.md)。

## 最佳实践

为了确保自动化工作流的安全性、可靠性和效率，我们强烈建议遵循我们的最佳实践。这些指南涵盖了仓库安全、工作流配置和监控等关键领域。

主要建议包括：

- **保护你的仓库：** 实施分支和标签保护，并限制 pull request 审批者。
- **监控和审计：** 定期审查 action 日志并启用 OpenTelemetry，以深入了解性能和行为。

有关保护仓库和工作流的全面指南，请参阅我们的[**最佳实践文档**](./common-workflow)。

## 自定义

在仓库根目录创建 QWEN.md 文件，为 [Qwen Code CLI](./common-workflow) 提供特定于项目的上下文和指令。这有助于定义编码规范、架构模式或模型在特定仓库中应遵循的其他指南。
## 参与贡献

欢迎参与贡献！请查阅 Qwen Code CLI **贡献指南**，了解更多入门详情。

[secrets]: https://docs.github.com/en/actions/security-guides/using-secrets-in-github-actions
[Qwen Code]: https://github.com/QwenLM/qwen-code
[DashScope]: https://dashscope.console.aliyun.com/apiKey
[Qwen Code CLI]: https://github.com/QwenLM/qwen-code-action/
[variables]: https://docs.github.com/en/actions/how-tos/write-workflows/choose-what-workflows-do/use-variables#creating-configuration-variables-for-a-repository
[GitHub CLI]: https://docs.github.com/en/github-cli/github-cli
[QWEN.md]: https://github.com/QwenLM/qwen-code-action/blob/main/docs/cli/configuration.md#context-files-hierarchical-instructional-context