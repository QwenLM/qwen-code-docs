# Github Actions：qwen-code-action

## 概述

`qwen-code-action` 是一个 GitHub Action，通过 [Qwen Code CLI] 将 [Qwen Code] 集成到你的开发工作流中。它既可以作为一个自主 agent 处理关键的日常编码任务，也可以作为随叫随到的协作者，让你快速委派工作。

使用它可以直接在你的 GitHub 仓库中，通过 [Qwen Code] 以对话方式（例如 `@qwencoder fix this issue`）执行 GitHub 拉取请求审查、问题分类、代码分析与修改等操作。

## 功能

- **自动化**：基于事件（例如 issue 被打开）或计划（例如每晚）触发工作流。
- **按需协作**：在 issue 和拉取请求的评论中通过提及 [Qwen Code CLI](./features/commands)（例如 `@qwencoder /review`）来触发工作流。
- **可通过工具扩展**：利用 [Qwen Code](../developers/tools/introduction.md) 模型的工具调用能力，与 [GitHub CLI] (`gh`) 等其他 CLI 交互。
- **可定制**：在你的仓库中使用 `QWEN.md` 文件为 [Qwen Code CLI](./features/commands) 提供项目特定的指令和上下文。

## 快速开始

只需几分钟即可在你的仓库中开始使用 Qwen Code CLI：

### 1. 获取 Qwen API 密钥

从 [DashScope](https://help.aliyun.com/zh/model-studio/qwen-code)（阿里云 AI 平台）获取你的 API 密钥。

### 2. 将其添加为 GitHub Secret

将你的 API 密钥以 `QWEN_API_KEY` 为名称存储为仓库 secret：

- 进入仓库的 **Settings > Secrets and variables > Actions**
- 点击 **New repository secret**
- Name: `QWEN_API_KEY`，Value: 你的 API 密钥

### 3. 更新你的 .gitignore

将以下条目添加到你的 `.gitignore` 文件中：

```gitignore
# qwen-code-cli settings
.qwen/

# GitHub App credentials
gha-creds-*.json
```

### 4. 选择工作流

你有两种方式设置工作流：

**选项 A：使用 setup 命令（推荐）**

1. 在终端中启动 Qwen Code CLI：

   ```shell
   qwen
   ```

2. 在 Qwen Code CLI 终端中输入：

   ```
   /setup-github
   ```

**选项 B：手动复制工作流**

1. 将预构建的工作流从 [`examples/workflows`](./common-workflow) 目录复制到你仓库的 `.github/workflows` 目录。注意：`qwen-dispatch.yml` 工作流也必须复制，它负责触发工作流的运行。

### 5. 尝试一下

**拉取请求审查：**

- 在你的仓库中打开一个拉取请求，等待自动审查
- 在现有的拉取请求上评论 `@qwencoder /review` 手动触发审查

**Issue 分类：**

- 打开一个 issue，等待自动分类
- 在现有 issue 上评论 `@qwencoder /triage` 手动触发分类

**通用 AI 辅助：**

- 在任何 issue 或拉取请求中，提及 `@qwencoder` 后跟你的请求
- 示例：
  - `@qwencoder explain this code change`
  - `@qwencoder suggest improvements for this function`
  - `@qwencoder help me debug this error`
  - `@qwencoder write unit tests for this component`

## 工作流

此 action 提供了多个预构建工作流用于不同场景。每个工作流都设计为可复制到你仓库的 `.github/workflows` 目录并根据需要进行定制。

### Qwen Code Dispatch

此工作流充当 Qwen Code CLI 的中心调度器，根据触发事件和评论中提供的命令将请求路由到相应的工作流。有关如何设置 dispatch 工作流的详细指南，请参阅 [Qwen Code Dispatch 工作流文档](./common-workflow)。

### Issue 分类

此 action 可用于自动或按计划对 GitHub Issue 进行分类。如需一个可正常工作的 issue 分类设置，请参见 [自动 issue 分类工作流](https://github.com/QwenLM/qwen-code/blob/main/.github/workflows/qwen-automated-issue-triage.yml)。

### 拉取请求审查

此 action 可用于在拉取请求被打开时自动审查。有关如何设置拉取请求审查系统的详细指南，请参阅 [GitHub PR Review 工作流文档](./common-workflow)。

### Qwen Code CLI 助手

此类 action 可用于在拉取请求和 issue 中调用通用、对话式的 Qwen Code AI 助手，以执行多种任务。有关如何设置通用 Qwen Code CLI 工作流的详细指南，请参阅 [Qwen Code Assistant 工作流文档](./common-workflow)。

## 配置

### 输入

<!-- BEGIN_AUTOGEN_INPUTS -->

- <a name="__input_qwen_api_key"></a><a href="#user-content-__input_qwen_api_key"><code>qwen*api_key</code></a>: *(可选)\_ Qwen API 的 API 密钥。

- <a name="__input_qwen_cli_version"></a><a href="#user-content-__input_qwen_cli_version"><code>qwen*cli_version</code></a>: *(可选，默认值：`latest`)\_ 要安装的 Qwen Code CLI 版本。可以是 "latest"、"preview"、"nightly"、特定版本号，或 git 分支、标签、提交。更多信息请参阅 [Qwen Code CLI 发布页](https://github.com/QwenLM/qwen-code-action/blob/main/docs/releases.md)。

- <a name="__input_qwen_debug"></a><a href="#user-content-__input_qwen_debug"><code>qwen*debug</code></a>: *(可选)\_ 启用调试日志和输出流。

- <a name="__input_qwen_model"></a><a href="#user-content-__input_qwen_model"><code>qwen*model</code></a>: *(可选)\_ 用于 Qwen Code 的模型。

- <a name="__input_prompt"></a><a href="#user-content-__input_prompt"><code>prompt</code></a>: _(可选，默认值：`You are a helpful assistant.`)_ 传递给 Qwen Code CLI 的 [`--prompt` 参数](https://github.com/QwenLM/qwen-code-action/blob/main/docs/cli/configuration.md#command-line-arguments) 的字符串。

- <a name="__input_settings"></a><a href="#user-content-__input_settings"><code>settings</code></a>: _(可选)_ 写入 `.qwen/settings.json` 的 JSON 字符串，用于配置 CLI 的 _项目_ 设置。更多详情请参阅 [设置文件文档](https://github.com/QwenLM/qwen-code-action/blob/main/docs/cli/configuration.md#settings-files)。

- <a name="__input_use_qwen_code_assist"></a><a href="#user-content-__input_use_qwen_code_assist"><code>use*qwen_code_assist</code></a>: *(可选，默认值：`false`)\_ 是否使用 Code Assist 来访问 Qwen Code 模型，而非默认的 Qwen API 密钥。更多信息请参阅 [Qwen Code CLI 文档](https://github.com/QwenLM/qwen-code-action/blob/main/docs/cli/authentication.md)。

- <a name="__input_use_vertex_ai"></a><a href="#user-content-__input_use_vertex_ai"><code>use*vertex_ai</code></a>: *(可选，默认值：`false`)\_ 是否使用 Vertex AI 来访问 Qwen Code 模型，而非默认的 Qwen API 密钥。更多信息请参阅 [Qwen Code CLI 文档](https://github.com/QwenLM/qwen-code-action/blob/main/docs/cli/authentication.md)。

- <a name="__input_extensions"></a><a href="#user-content-__input_extensions"><code>extensions</code></a>: _(可选)_ 要安装的 Qwen Code CLI 扩展列表。

- <a name="__input_upload_artifacts"></a><a href="#user-content-__input_upload_artifacts"><code>upload*artifacts</code></a>: *(可选，默认值：`false`)\_ 是否将产物上传到 github action。

- <a name="__input_use_pnpm"></a><a href="#user-content-__input_use_pnpm"><code>use*pnpm</code></a>: *(可选，默认值：`false`)\_ 是否使用 pnpm 替代 npm 来安装 qwen-code-cli。

- <a name="__input_workflow_name"></a><a href="#user-content-__input_workflow_name"><code>workflow*name</code></a>: *(可选，默认值：`${{ github.workflow }}`)\_ GitHub 工作流名称，用于遥测目的。

<!-- END_AUTOGEN_INPUTS -->

### 输出

<!-- BEGIN_AUTOGEN_OUTPUTS -->

- <a name="__output_summary"></a><a href="#user-content-__output_summary"><code>summary</code></a>: Qwen Code CLI 执行后的摘要输出。

- <a name="__output_error"></a><a href="#user-content-__output_error"><code>error</code></a>: Qwen Code CLI 执行后的错误输出（如果有）。

<!-- END_AUTOGEN_OUTPUTS -->

### 仓库变量

建议将以下值设置为仓库变量，以便在所有工作流中复用。或者，你也可以在单个工作流中将其内联设置为 action 输入，或覆盖仓库级别的值。

| 名称               | 描述                                               | 类型     | 必需 | 何时需要             |
| ------------------ | --------------------------------------------------------- | -------- | -------- | ------------------------- |
| `DEBUG`            | 启用 Qwen Code CLI 的调试日志。              | 变量       | 否       | 从不                     |
| `QWEN_CLI_VERSION` | 控制安装哪个版本的 Qwen Code CLI。 | 变量       | 否       | 固定 CLI 版本   |
| `APP_ID`           | 自定义认证用的 GitHub App ID。                  | 变量       | 否       | 使用自定义 GitHub App |

要添加仓库变量：

1. 进入仓库的 **Settings > Secrets and variables > Actions > New variable**。
2. 输入变量名称和值。
3. 保存。

关于仓库变量的详情，请参考 [GitHub 变量文档][variables]。

### Secrets

你可以在仓库中设置以下 secrets：

| 名称              | 描述                                   | 必需 | 何时需要                              |
| ----------------- | --------------------------------------------- | -------- | ------------------------------------------ |
| `QWEN_API_KEY`    | 你的 Qwen API 密钥，来自 DashScope。             | 是       | 所有调用 Qwen 的工作流都需要。 |
| `APP_PRIVATE_KEY` | GitHub App 的私钥（PEM 格式）。 | 否       | 使用自定义 GitHub App。                 |

要添加 secret：

1. 进入仓库的 **Settings > Secrets and variables > Actions > New repository secret**。
2. 输入 secret 名称和值。
3. 保存。

更多信息，请参考 [GitHub 官方文档：创建和使用加密 secrets][secrets]。

## 认证

此 action 需要对 GitHub API 进行认证，并可选地对 Qwen Code 服务进行认证。

### GitHub 认证

你可以通过两种方式向 GitHub 进行认证：

1. **默认的 `GITHUB_TOKEN`：** 对于简单的用例，action 可以使用工作流提供的默认 `GITHUB_TOKEN`。
2. **自定义 GitHub App（推荐）：** 为了最安全、最灵活的认证，我们建议创建一个自定义 GitHub App。

有关 Qwen 和 GitHub 认证的详细设置说明，请参阅 [**认证文档**](./configuration/auth)。

## 扩展

Qwen Code CLI 可以通过扩展来添加额外功能。这些扩展从其 GitHub 仓库的源代码安装。

有关如何设置和配置扩展的详细说明，请参阅 [扩展文档](./extension/introduction.md)。

## 最佳实践

为确保自动化工作流的安全性、可靠性和效率，我们强烈建议遵循我们的最佳实践。这些指南涵盖关键领域，如仓库安全、工作流配置和监控。

主要建议包括：

- **保护你的仓库：** 实施分支和标签保护，限制拉取请求审批者。
- **监控与审计：** 定期查看 action 日志，启用 OpenTelemetry 以深入了解性能和行为。

有关保护仓库和工作流的全面指南，请参阅我们的 [**最佳实践文档**](./common-workflow)。

## 定制化

在仓库根目录下创建 `QWEN.md` 文件，为 [Qwen Code CLI](./common-workflow) 提供项目特定的上下文和指令。这对于定义编码约定、架构模式或其他模型在特定仓库中应遵循的指南非常有用。

## 贡献

欢迎贡献！查看 Qwen Code CLI **贡献指南**，了解如何开始的更多细节。

[secrets]: https://docs.github.com/en/actions/security-guides/using-secrets-in-github-actions
[Qwen Code]: https://github.com/QwenLM/qwen-code
[DashScope]: https://dashscope.console.aliyun.com/apiKey
[Qwen Code CLI]: https://github.com/QwenLM/qwen-code-action/
[variables]: https://docs.github.com/en/actions/how-tos/write-workflows/choose-what-workflows-do/use-variables#creating-configuration-variables-for-a-repository
[GitHub CLI]: https://docs.github.com/en/github-cli/github-cli
[QWEN.md]: https://github.com/QwenLM/qwen-code-action/blob/main/docs/cli/configuration.md#context-files-hierarchical-instructional-context