# GitHub Actions：qwen-code-action

## 概述

`qwen-code-action` 是一个 GitHub Action，通过 [Qwen Code CLI](../users/features/commands/) 将 [Qwen Code] 集成到你的开发工作流中。它既可以作为自主代理来处理关键的日常编码任务，也可以作为你可以快速委派工作的按需协作者。

使用它可以在 GitHub 仓库内以对话方式（例如，`@qwencoder fix this issue`）执行 GitHub Pull Request 审查、问题分类、代码分析和修改等操作。

## 功能特性

- **自动化**：基于事件（例如问题开启）或时间表（例如每晚）触发工作流。
- **按需协作**：在问题和拉取请求的评论中通过提及 [Qwen Code CLI](../users/features/commands/) 来触发工作流（例如，`@qwencoder /review`）。
- **工具可扩展性**：利用 [Qwen Code] 模型的工具调用功能与其它命令行工具交互，如 [GitHub CLI] (`gh`)。
- **自定义配置**：使用仓库中的 `QWEN.md` 文件为 [Qwen Code CLI](../users/features/commands/) 提供项目特定的指令和上下文。

## 快速开始

只需几分钟即可在您的仓库中开始使用 Qwen Code CLI：

### 1. 获取 Qwen API 密钥

从 [DashScope](https://help.aliyun.com/zh/model-studio/qwen-code?spm=a2c4g.11186623.help-menu-2400256.d_0_9_3.54d2248e4fdRjY)（阿里云的 AI 平台）获取您的 API 密钥

### 2. 将其添加为 GitHub Secret

将您的 API 密钥以名为 `QWEN_API_KEY` 的秘密存储在您的仓库中：

- 进入您仓库的 **Settings > Secrets and variables > Actions**
- 点击 **New repository secret**
- 名称：`QWEN_API_KEY`，值：您的 API 密钥

### 3. 更新你的 .gitignore

在你的 `.gitignore` 文件中添加以下条目：

```gitignore
# qwen-code-cli 配置
.qwen/

# GitHub App 凭据
gha-creds-*.json
```

### 4. 选择一个工作流

你有两种方式来设置工作流：

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

1. 从 [`examples/workflows`](../users/common-workflow/) 目录复制预构建的工作流到你仓库的 `.github/workflows` 目录。注意：必须同时复制 `qwen-dispatch.yml` 工作流，它用于触发其他工作流运行。

### 5. 试用一下

**Pull Request 审阅：**

- 在你的仓库中打开一个 pull request 并等待自动审阅
- 在现有的 pull request 中评论 `@qwencoder /review` 来手动触发审阅

**问题分类：**

- 打开一个问题并等待自动分类
- 在现有问题上评论 `@qwencoder /triage` 来手动触发分类

**通用 AI 辅助：**

- 在任何问题或 pull request 中，提及 `@qwencoder` 并附上你的请求
- 示例：
  - `@qwencoder explain this code change`
  - `@qwencoder suggest improvements for this function`
  - `@qwencoder help me debug this error`
  - `@qwencoder write unit tests for this component`

## 工作流程

此操作为不同使用场景提供了多个预构建的工作流程。每个工作流程都设计为可复制到你仓库的 `.github/workflows` 目录中，并根据需要进行自定义。

### Qwen Code 调度

此工作流作为 Qwen Code CLI 的中央调度器，根据触发事件和评论中提供的命令，将请求路由到相应的工作流。有关如何设置调度工作流的详细指南，请参阅 [Qwen Code 调度工作流文档](../users/common-workflow/)。

### 问题分类

此操作可用于自动或按计划对 GitHub Issues 进行分类。有关如何设置问题分类系统的详细指南，请参阅 [GitHub 问题分类工作流文档](../users/common-workflow/)。

### 拉取请求审查

此操作可用于在打开拉取请求时自动进行审查。有关如何设置拉取请求审查系统的详细指南，请参阅 [GitHub PR 审查工作流文档](../users/common-workflow/)。

### Qwen Code CLI 助手

这种操作可用于在拉取请求和议题中调用通用的、对话式的 Qwen Code AI 助手，以执行各种任务。有关如何设置通用 Qwen Code CLI 工作流的详细指南，请参阅 [Qwen Code 助手工作流文档](../users/common-workflow/)。

## 配置

### 输入

<!-- BEGIN_AUTOGEN_INPUTS -->

- <a name="__input_qwen_api_key"></a><a href="#user-content-__input_qwen_api_key"><code>qwen*api_key</code></a>: *(可选)\_ Qwen API 的 API 密钥。

- <a name="__input_qwen_cli_version"></a><a href="#user-content-__input_qwen_cli_version"><code>qwen*cli_version</code></a>: *(可选，默认值：`latest`)\_ 要安装的 Qwen Code CLI 版本。可以是 "latest"、"preview"、"nightly"、特定版本号，或 Git 分支、标签或提交。更多信息请参见 [Qwen Code CLI 发布页面](https://github.com/QwenLM/qwen-code-action/blob/main/docs/releases.md)。

- <a name="__input_qwen_debug"></a><a href="#user-content-__input_qwen_debug"><code>qwen*debug</code></a>: *(可选)\_ 启用调试日志和输出流。

- <a name="__input_qwen_model"></a><a href="#user-content-__input_qwen_model"><code>qwen*model</code></a>: *(可选)\_ 使用 Qwen Code 时要使用的模型。

- <a name="__input_prompt"></a><a href="#user-content-__input_prompt"><code>prompt</code></a>: _(可选，默认值：`You are a helpful assistant.`)_ 传递给 Qwen Code CLI 的 [`--prompt` 参数](https://github.com/QwenLM/qwen-code-action/blob/main/docs/cli/configuration.md#command-line-arguments) 的字符串。

- <a name="__input_settings"></a><a href="#user-content-__input_settings"><code>settings</code></a>: _(可选)_ 写入 `.qwen/settings.json` 的 JSON 字符串，用于配置 CLI 的 _项目_ 设置。
  更多详情请参见关于 [设置文件](https://github.com/QwenLM/qwen-code-action/blob/main/docs/cli/configuration.md#settings-files) 的文档。

- <a name="__input_use_qwen_code_assist"></a><a href="#user-content-__input_use_qwen_code_assist"><code>use*qwen_code_assist</code></a>: *(可选，默认值：`false`)\_ 是否使用 Code Assist 来访问 Qwen Code 模型，而不是默认的 Qwen Code API 密钥。
  更多信息请参见 [Qwen Code CLI 文档](https://github.com/QwenLM/qwen-code-action/blob/main/docs/cli/authentication.md)。

- <a name="__input_use_vertex_ai"></a><a href="#user-content-__input_use_vertex_ai"><code>use*vertex_ai</code></a>: *(可选，默认值：`false`)\_ 是否使用 Vertex AI 来访问 Qwen Code 模型，而不是默认的 Qwen Code API 密钥。
  更多信息请参见 [Qwen Code CLI 文档](https://github.com/QwenLM/qwen-code-action/blob/main/docs/cli/authentication.md)。

- <a name="__input_extensions"></a><a href="#user-content-__input_extensions"><code>extensions</code></a>: _(可选)_ 要安装的 Qwen Code CLI 扩展列表。

- <a name="__input_upload_artifacts"></a><a href="#user-content-__input_upload_artifacts"><code>upload*artifacts</code></a>: *(可选，默认值：`false`)\_ 是否将工件上传到 GitHub Action。

- <a name="__input_use_pnpm"></a><a href="#user-content-__input_use_pnpm"><code>use*pnpm</code></a>: *(可选，默认值：`false`)\_ 是否使用 pnpm 而不是 npm 来安装 qwen-code-cli。

- <a name="__input_workflow_name"></a><a href="#user-content-__input_workflow_name"><code>workflow*name</code></a>: *(可选，默认值：`${{ github.workflow }}`)\_ GitHub 工作流名称，用于遥测目的。

<!-- END_AUTOGEN_INPUTS -->

### 输出

<!-- BEGIN_AUTOGEN_OUTPUTS -->

- <a name="__output_summary"></a><a href="#user-content-__output_summary"><code>summary</code></a>: Qwen Code CLI 执行的汇总输出。

- <a name="__output_error"></a><a href="#user-content-__output_error"><code>error</code></a>: Qwen Code CLI 执行的错误输出（如果有）。

<!-- END_AUTOGEN_OUTPUTS -->

### 仓库变量

我们建议将以下值设置为仓库变量，以便在所有工作流中重复使用。或者，你也可以将它们作为操作输入内联设置到单个工作流中，或用于覆盖仓库级别的值。

| 名称               | 描述                                                     | 类型     | 是否必填 | 何时需要                 |
| ------------------ | -------------------------------------------------------- | -------- | -------- | ------------------------ |
| `DEBUG`            | 启用 Qwen Code CLI 的调试日志。                          | 变量     | 否       | 从不需要                 |
| `QWEN_CLI_VERSION` | 控制安装的 Qwen Code CLI 版本。                          | 变量     | 否       | 固定 CLI 版本时          |
| `APP_ID`           | 自定义身份验证的 GitHub App ID。                         | 变量     | 否       | 使用自定义 GitHub App 时 |

添加仓库变量的方法：

1. 进入你的仓库 **Settings > Secrets and variables > Actions > New variable**。
2. 输入变量名称和值。
3. 保存。

有关仓库变量的详细信息，请参阅 [GitHub 关于变量的文档][../users/configuration/settings/]。

### 密钥

你可以在仓库中设置以下密钥：

| 名称              | 描述                                       | 是否必填 | 何时需要                                  |
| ----------------- | ------------------------------------------ | -------- | ----------------------------------------- |
| `QWEN_API_KEY`    | 你在 DashScope 上的 Qwen API 密钥。         | 是       | 所有调用 Qwen 的工作流都需要。             |
| `APP_PRIVATE_KEY` | GitHub App 的私钥（PEM 格式）。            | 否       | 使用自定义 GitHub App 时需要。             |

添加密钥的方法：

1. 进入仓库的 **Settings > Secrets and variables > Actions > New repository secret**。
2. 输入密钥名称和值。
3. 保存。

更多信息请参考 [GitHub 官方关于创建和使用加密密钥的文档](https://docs.github.com/en/actions/security-guides/using-secrets-in-github-actions)。

## 身份验证

此操作需要对 GitHub API 进行身份验证，也可选择性地对 Qwen Code 服务进行身份验证。

### GitHub 身份验证

你可以通过以下两种方式与 GitHub 进行身份验证：

1. **默认 `GITHUB_TOKEN`：** 对于较简单的使用场景，操作可以使用工作流提供的默认 `GITHUB_TOKEN`。
2. **自定义 GitHub App（推荐）：** 为了实现最安全和灵活的身份验证，我们建议创建一个自定义的 GitHub App。

有关 Qwen 和 GitHub 身份验证的详细设置说明，请参阅  
[**身份验证文档**](../users/configuration/auth/)。

## 扩展

Qwen Code CLI 可以通过扩展来增加额外功能。这些扩展从其 GitHub 仓库中以源代码形式安装。

## 最佳实践

为确保自动化工作流的安全性、可靠性和效率，我们强烈建议遵循我们的最佳实践。这些指南涵盖仓库安全、工作流配置和监控等关键领域。

主要建议包括：

- **保护您的仓库：** 实施分支和标签保护，并限制 Pull Request 审批者。
- **监控与审计：** 定期审查操作日志并启用 OpenTelemetry 以深入了解性能和行为。

有关保护仓库和工作流的完整指南，请参阅我们的 [**常用工作流**](../users/common-workflow/)。

## 自定义

在您的仓库根目录中创建一个 [QWEN.md] 文件，以提供项目特定的上下文和说明给 [Qwen Code CLI](../users/features/commands/)。这对于定义编码约定、架构模式或模型应遵循的其他指导原则非常有用针对给定仓库。

## 贡献

欢迎贡献！请查看 Qwen Code CLI [**贡献指南**](./CONTRIBUTING.md) 了解更多关于如何开始的详细信息。

[secrets]: https://docs.github.com/en/actions/security-guides/using-secrets-in-github-actions
[Qwen Code]: https://github.com/QwenLM/qwen-code
[DashScope]: https://dashscope.console.aliyun.com/apiKey
[Qwen Code CLI]: https://github.com/QwenLM/qwen-code-action/
[variables]: https://docs.github.com/en/actions/how-tos/write-workflows/choose-what-workflows-do/use-variables#creating-configuration-variables-for-a-repository
[GitHub CLI]: https://docs.github.com/en/github-cli/github-cli
[QWEN.md]: https://github.com/QwenLM/qwen-code-action/blob/main/docs/cli/configuration.md#context-files-hierarchical-instructional-context
[https://docs.github.com/en/actions/security-guides/using-secrets-in-github-actions]: 