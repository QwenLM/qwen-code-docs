# GitHub Actions：qwen-code-action

## 概述

`qwen-code-action` 是一个 GitHub Action，通过 [Qwen Code CLI] 将 [Qwen Code] 集成到您的开发工作流中。它既可作为自主代理，处理关键的日常编码任务；也可作为按需协作伙伴，让您快速委派工作。

您可使用它在 GitHub 仓库中以对话方式（例如 `@qwencoder 修复此问题`）执行拉取请求（Pull Request）审查、问题分类、代码分析与修改等任务。

## 功能特性

- **自动化**：基于事件（例如创建 Issue）或定时计划（例如每晚执行）触发工作流。
- **按需协作**：在 Issue 和 Pull Request 的评论中提及 [Qwen Code CLI](./features/commands)（例如 `@qwencoder /review`）即可触发工作流。
- **可扩展的工具集成**：利用 [Qwen Code](../developers/tools/introduction.md) 模型的工具调用能力，与其他命令行工具（如 [GitHub CLI] (`gh`)）交互。
- **高度可定制**：在仓库中添加 `QWEN.md` 文件，为 [Qwen Code CLI](./features/commands) 提供项目专属的指令与上下文信息。

## 快速开始

只需几分钟，即可在你的仓库中启用 Qwen Code CLI：

### 1. 获取 Qwen API 密钥

从阿里云 AI 平台 [DashScope](https://help.aliyun.com/zh/model-studio/qwen-code) 获取你的 API 密钥。

### 2. 将其添加为 GitHub 密钥

将你的 API key 作为名为 `QWEN_API_KEY` 的密钥存储在你的仓库中：

- 进入仓库的 **Settings > Secrets and variables > Actions**
- 点击 **New repository secret**
- 名称：`QWEN_API_KEY`，值：你的 API key

### 3. 更新你的 `.gitignore`

在 `.gitignore` 文件中添加以下条目：

```gitignore

# qwen-code-cli 设置
.qwen/

# GitHub App 凭据
gha-creds-*.json
```

### 4. 选择一个工作流

你有两种方式来配置工作流：

**选项 A：使用 setup 命令（推荐）**

1. 在终端中启动 Qwen Code CLI：

   ```shell
   qwen
   ```

2. 在终端中的 Qwen Code CLI 中输入：

   ```
   /setup-github
   ```

**选项 B：手动复制工作流**

1. 将 [`examples/workflows`](./common-workflow) 目录下的预构建工作流复制到你仓库的 `.github/workflows` 目录中。注意：还需一并复制 `qwen-dispatch.yml` 工作流，该工作流用于触发其他工作流运行。

### 5. 动手试一试

**拉取请求（Pull Request）审查：**

- 在你的仓库中创建一个拉取请求，等待自动审查
- 在已有拉取请求下评论 `@qwencoder /review`，以手动触发审查

**问题分类（Issue Triage）：**

- 创建一个问题，等待自动分类
- 在已有问题下评论 `@qwencoder /triage`，以手动触发分类

**通用 AI 辅助：**

- 在任意问题或拉取请求中，提及 `@qwencoder` 并附上你的请求
- 示例：
  - `@qwencoder 解释这一处代码变更`
  - `@qwencoder 为该函数提出改进建议`
  - `@qwencoder 帮我调试这个错误`
  - `@qwencoder 为该组件编写单元测试`

## 工作流（Workflows）

该 GitHub Action 提供了多个针对不同使用场景的预置工作流。每个工作流均可直接复制到你仓库的 `.github/workflows` 目录下，并根据需要进行自定义。

### Qwen Code 分发

该工作流作为 Qwen Code CLI 的中央分发器，根据触发事件及评论中提供的命令，将请求路由至对应的工作流。有关如何配置分发工作流的详细指南，请参阅 [Qwen Code 分发工作流文档](./common-workflow)。

### Issue 分类处理

该操作可用于自动或按计划对 GitHub Issues 进行分类处理。有关如何配置 Issue 分类处理系统的详细指南，请参阅 [GitHub Issue 分类处理工作流文档](./examples/workflows/issue-triage)。

### 拉取请求（PR）评审

该操作可在拉取请求（Pull Request）被创建时自动对其进行评审。有关如何配置 PR 评审系统的详细指南，请参阅 [GitHub PR 评审工作流文档](./common-workflow)。

### Qwen Code CLI 助手

此类操作可用于在拉取请求（Pull Request）和议题（Issue）中调用通用型、支持对话的 Qwen Code AI 助手，以执行多种任务。有关如何配置通用型 Qwen Code CLI 工作流的详细指南，请参阅 [Qwen Code 助手工作流文档](./common-workflow)。

## 配置

### 输入

<!-- BEGIN_AUTOGEN_INPUTS -->

- <a name="__input_qwen_api_key"></a><a href="#user-content-__input_qwen_api_key"><code>qwen*api_key</code></a>: （可选）Qwen API 的密钥。

- <a name="__input_qwen_cli_version"></a><a href="#user-content-__input_qwen_cli_version"><code>qwen*cli_version</code></a>: （可选，默认值：`latest`）要安装的 Qwen Code CLI 版本。可以是 `latest`、`preview`、`nightly`、特定版本号，或 Git 分支、标签、提交哈希。更多信息请参阅 [Qwen Code CLI 发布说明](https://github.com/QwenLM/qwen-code-action/blob/main/docs/releases.md)。

- <a name="__input_qwen_debug"></a><a href="#user-content-__input_qwen_debug"><code>qwen*debug</code></a>: （可选）启用调试日志和输出流式传输。

- <a name="__input_qwen_model"></a><a href="#user-content-__input_qwen_model"><code>qwen*model</code></a>: （可选）Qwen Code 所使用的模型。

- <a name="__input_prompt"></a><a href="#user-content-__input_prompt"><code>prompt</code></a>: （可选，默认值：`You are a helpful assistant.`）传递给 Qwen Code CLI [`--prompt`](https://github.com/QwenLM/qwen-code-action/blob/main/docs/cli/configuration.md#command-line-arguments) 参数的字符串。

- <a name="__input_settings"></a><a href="#user-content-__input_settings"><code>settings</code></a>: （可选）一个 JSON 字符串，将写入 `.qwen/settings.json` 以配置 CLI 的_项目_设置。  
  更多详情请参阅 [设置文件](https://github.com/QwenLM/qwen-code-action/blob/main/docs/cli/configuration.md#settings-files) 文档。

- <a name="__input_use_qwen_code_assist"></a><a href="#user-content-__input_use_qwen_code_assist"><code>use*qwen_code_assist</code></a>: （可选，默认值：`false`）是否使用 Code Assist 访问 Qwen Code 模型，而非默认的 Qwen Code API 密钥。  
  更多信息请参阅 [Qwen Code CLI 文档](https://github.com/QwenLM/qwen-code-action/blob/main/docs/cli/authentication.md)。

- <a name="__input_use_vertex_ai"></a><a href="#user-content-__input_use_vertex_ai"><code>use*vertex_ai</code></a>: （可选，默认值：`false`）是否使用 Vertex AI 访问 Qwen Code 模型，而非默认的 Qwen Code API 密钥。  
  更多信息请参阅 [Qwen Code CLI 文档](https://github.com/QwenLM/qwen-code-action/blob/main/docs/cli/authentication.md)。

- <a name="__input_extensions"></a><a href="#user-content-__input_extensions"><code>extensions</code></a>: （可选）要安装的 Qwen Code CLI 扩展列表。

- <a name="__input_upload_artifacts"></a><a href="#user-content-__input_upload_artifacts"><code>upload*artifacts</code></a>: （可选，默认值：`false`）是否将产物上传至 GitHub Action。

- <a name="__input_use_pnpm"></a><a href="#user-content-__input_use_pnpm"><code>use*pnpm</code></a>: （可选，默认值：`false`）是否使用 pnpm 而非 npm 安装 qwen-code-cli。

- <a name="__input_workflow_name"></a><a href="#user-content-__input_workflow_name"><code>workflow*name</code></a>: （可选，默认值：`${{ github.workflow }}`）GitHub 工作流名称，用于遥测目的。

<!-- END_AUTOGEN_INPUTS -->

### 输出

<!-- BEGIN_AUTOGEN_OUTPUTS -->

- <a name="__output_summary"></a><a href="#user-content-__output_summary"><code>summary</code></a>: Qwen Code CLI 执行生成的摘要输出。

- <a name="__output_error"></a><a href="#user-content-__output_error"><code>error</code></a>: Qwen Code CLI 执行过程中产生的错误输出（如有）。

<!-- END_AUTOGEN_OUTPUTS -->

### 仓库变量

我们建议将以下值设置为仓库变量，以便在所有工作流中复用。您也可以选择在单个工作流中以内联方式作为操作输入进行设置，或用于覆盖仓库级别的变量值。

| 名称               | 描述                                                       | 类型     | 是否必需 | 何时必需                 |
| ------------------ | ---------------------------------------------------------- | -------- | -------- | ------------------------ |
| `DEBUG`            | 启用 Qwen Code CLI 的调试日志输出。                         | 变量     | 否       | 从不                     |
| `QWEN_CLI_VERSION` | 控制安装的 Qwen Code CLI 版本。                             | 变量     | 否       | 需要固定 CLI 版本时      |
| `APP_ID`           | 自定义身份验证所用的 GitHub App ID。                        | 变量     | 否       | 使用自定义 GitHub App 时 |

添加仓库变量的方法如下：

1. 进入仓库的 **Settings（设置）> Secrets and variables（密钥和变量）> Actions（操作）> New variable（新建变量）**。
2. 输入变量名称和值。
3. 保存。

有关仓库变量的详细信息，请参阅 [GitHub 关于变量的文档][variables]。

### 机密信息（Secrets）

你可以在仓库中设置以下机密信息：

| 名称              | 描述                                           | 是否必需 | 何时必需                                   |
| ----------------- | ---------------------------------------------- | -------- | ------------------------------------------ |
| `QWEN_API_KEY`    | 你在 DashScope 上获取的 Qwen API 密钥。         | 是       | 所有调用 Qwen 的工作流均需配置。            |
| `APP_PRIVATE_KEY` | GitHub App 的私钥（PEM 格式）。                 | 否       | 使用自定义 GitHub App 时需要。              |

添加机密信息的方法如下：

1. 进入仓库的 **Settings > Secrets and variables > Actions > New repository secret**。
2. 输入机密信息的名称和值。
3. 保存。

更多详细信息，请参阅 [GitHub 官方文档：创建和使用加密机密][secrets]。

## 身份验证（Authentication）

本操作需要对 GitHub API 进行身份验证，并可选地对 Qwen Code 服务进行身份验证。

### GitHub 身份验证

你可以通过以下两种方式对 GitHub 进行身份验证：

1. **默认 `GITHUB_TOKEN`：** 对于较简单的使用场景，该操作可直接使用工作流提供的默认 `GITHUB_TOKEN`。
2. **自定义 GitHub App（推荐）：** 为实现最高安全性与灵活性，我们建议创建一个自定义 GitHub App。

有关 Qwen 和 GitHub 身份验证的详细配置说明，请参阅  
[**身份验证文档**](./configuration/auth)。

## 扩展

Qwen Code CLI 可通过扩展来增强功能。这些扩展均从其 GitHub 仓库的源码安装。

有关如何设置和配置扩展的详细说明，请参阅  
[扩展文档](../developers/extensions/extension)。

## 最佳实践

为确保自动化工作流的安全性、可靠性和高效性，我们强烈建议您遵循我们的最佳实践。这些指南涵盖关键领域，例如仓库安全、工作流配置和监控。

主要建议包括：

- **保障仓库安全**：启用分支和标签保护，并限制拉取请求（Pull Request）的审批人。
- **监控与审计**：定期审查操作日志，并启用 OpenTelemetry，以更深入地洞察性能与行为。

如需全面了解如何保障仓库及工作流的安全，请参阅我们的 [**最佳实践文档**](./common-workflow)。

## 自定义

在仓库根目录下创建一个 `QWEN.md` 文件，向 [Qwen Code CLI](./common-workflow) 提供项目特定的上下文和说明。该文件可用于定义编码规范、架构模式，或其他模型在处理该仓库时应遵循的指导原则。

## 贡献

欢迎贡献！请查阅 Qwen Code CLI 的 **贡献指南**，了解如何开始贡献的更多详细信息。

[secrets]: https://docs.github.com/zh/actions/security-guides/using-secrets-in-github-actions  
[Qwen Code]: https://github.com/QwenLM/qwen-code  
[DashScope]: https://dashscope.console.aliyun.com/apiKey  
[Qwen Code CLI]: https://github.com/QwenLM/qwen-code-action/  
[variables]: https://docs.github.com/zh/actions/how-tos/write-workflows/choose-what-workflows-do/use-variables#creating-configuration-variables-for-a-repository  
[GitHub CLI]: https://docs.github.com/zh/github-cli/github-cli  
[QWEN.md]: https://github.com/QwenLM/qwen-code-action/blob/main/docs/cli/configuration.md#context-files-hierarchical-instructional-context