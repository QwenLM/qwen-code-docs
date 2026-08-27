# Qwen Code：服务条款与隐私声明

Qwen Code 是一款由 Qwen Code 团队维护的开源 AI 编程助手工具。本文档概述了在使用 Qwen Code 的认证方式及 AI 模型服务时所适用的服务条款与隐私政策。

## 如何确定你的认证方式

Qwen Code 支持四种认证方式来访问 AI 模型。你的认证方式决定了哪些服务条款与隐私政策适用于你的使用场景：

1. **Qwen OAuth** — 使用你的 qwen.ai 账号登录（免费套餐已于 2026-04-15 停用）
2. **阿里云百炼计划** — 使用来自阿里云的 API key
3. **API Key** — 携带你自己的 API key
4. **Vertex AI** — 使用 Google Cloud Vertex AI

不同认证方式可能适用不同的服务条款与隐私声明，具体取决于底层的服务提供商。

| 认证方式                | 提供商              | 服务条款                                                        | 隐私声明                                                        |
| :---------------------- | :------------------ | :-------------------------------------------------------------- | :-------------------------------------------------------------- |
| Qwen OAuth              | Qwen AI             | [Qwen 服务条款](https://qwen.ai/termsservice)                   | [Qwen 隐私政策](https://qwen.ai/privacypolicy)                  |
| 阿里云百炼计划          | 阿里云              | 参见[下方详情](#2-如果你使用的是阿里云百炼计划)                | 参见[下方详情](#2-如果你使用的是阿里云百炼计划)                |
| API Key                 | 多种提供商          | 取决于你选择的 API 提供商（OpenAI、Anthropic 等）               | 取决于你选择的 API 提供商                                       |
| Vertex AI               | Google Cloud        | [Google Cloud 服务条款](https://cloud.google.com/terms)         | [Google Cloud 隐私声明](https://cloud.google.com/privacy)       |

## 1. 如果你使用的是 Qwen OAuth 认证

当你使用 qwen.ai 账号进行认证时，适用以下服务条款与隐私声明文档：

- **服务条款：** 你的使用受 [Qwen 服务条款](https://qwen.ai/termsservice) 约束。
- **隐私声明：** 关于数据收集与使用的说明见 [Qwen 隐私政策](https://qwen.ai/privacypolicy)。

有关认证设置、配额及支持功能的详细信息，请参见[认证设置](../configuration/settings)。

## 2. 如果你使用的是阿里云百炼计划

当你使用来自阿里云的 API key 进行认证时，适用阿里云相应的服务条款与隐私声明。

阿里云百炼计划支持两个区域：

- **阿里云百炼（aliyun.com）** — [bailian.console.aliyun.com](https://bailian.console.aliyun.com)
- **Alibaba Cloud（alibabacloud.com）** — [bailian.console.alibabacloud.com](https://bailian.console.alibabacloud.com)

> [!important]
>
> 在使用阿里云百炼计划时，你需遵守阿里云的服务条款与隐私政策。请查阅其文档，以了解关于数据使用、留存及隐私实践的具体细节。

## 3. 如果你使用的是自己的 API Key

当你使用来自其他提供商的 API key 进行认证时，适用的服务条款与隐私声明取决于你选择的提供商。

> [!important]
>
> 在使用你自己的 API key 时，你需遵守所选 API 提供商的服务条款与隐私政策，而非 Qwen Code 的条款。请查阅你的提供商的文档，以了解关于数据使用、留存及隐私实践的具体细节。

Qwen Code 支持多种兼容 OpenAI 的提供商。请参考你具体提供商的条款与隐私政策获取详细信息。

## 4. 如果你使用的是 Vertex AI

当你使用 Google Cloud Vertex AI 进行认证时，适用的服务条款与隐私声明为 Google Cloud 的相关文档。

> [!important]
>
> 在使用 Vertex AI 时，你需遵守 [Google Cloud 服务条款](https://cloud.google.com/terms) 和 [Google Cloud 隐私声明](https://cloud.google.com/privacy)，而非 Qwen Code 的条款。请查阅 Google Cloud 的文档，以了解关于数据使用、留存及隐私实践的具体细节。

## 使用统计与遥测

Qwen Code 可能会收集匿名的使用统计和[遥测](../../developers/development/telemetry)数据，以改善用户体验和产品质量。此数据收集为可选功能，可通过配置设置进行控制。

### 收集哪些数据

启用后，Qwen Code 可能会收集：

- 匿名使用统计（运行的命令、性能指标）
- 错误报告与崩溃数据
- 功能使用模式

### 按认证方式的数据收集

- **Qwen OAuth：** 使用统计受 Qwen 隐私政策约束。你可以通过 Qwen Code 的配置设置选择退出。
- **阿里云百炼计划：** 使用统计受阿里云隐私政策约束。你可以通过 Qwen Code 的配置设置选择退出。
- **API Key：** Qwen Code 不会额外收集数据，但你的 API 提供商可能收集数据。
- **Vertex AI：** 使用统计受 Google Cloud 隐私政策约束。Qwen Code 不会额外收集数据，仅 Google Cloud 可能收集数据。

## 常见问题解答（FAQ）

### 1. 我的代码（包括提示词和回答）是否会被用于训练 AI 模型？

你的代码（包括提示词和回答）是否会被用于训练 AI 模型，取决于你的认证方式以及具体使用的 AI 服务提供商：

- **Qwen OAuth：** 数据使用受 [Qwen 隐私政策](https://qwen.ai/privacypolicy) 约束。请参考其政策，了解关于数据收集与模型训练实践的具体细节。

- **阿里云百炼计划：** 数据使用受阿里云隐私政策约束。请参考其政策，了解关于数据收集与模型训练实践的具体细节。

- **API Key：** 数据使用完全取决于你选择的 API 提供商。每个提供商都有自己的数据使用政策。请查看你具体提供商的隐私政策与服务条款。

- **Vertex AI：** 数据使用受 [Google Cloud 服务条款](https://cloud.google.com/terms) 和 [隐私声明](https://cloud.google.com/privacy) 约束。请查阅 Google Cloud 的政策，了解关于数据收集与模型训练实践的具体细节。

**重要提示**：Qwen Code 本身不会将你的提示词、代码或回答用于模型训练。任何用于训练目的的数据使用将由你认证的 AI 服务提供商的政策决定。

### 2. 什么是使用统计，退出控制有什么作用？

**使用统计**设置用于控制 Qwen Code 是否收集可选数据，以改善用户体验和产品质量。

启用后，Qwen Code 可能会收集：

- 匿名遥测（运行的命令、性能指标、功能使用情况）
- 错误报告与崩溃数据
- 一般使用模式

**Qwen Code 不会收集以下内容：**

- 你的代码内容
- 发送给 AI 模型的提示词
- AI 模型的回答
- 个人信息

使用统计设置仅控制 Qwen Code 自身的数据收集。它不会影响你选择的 AI 服务提供商（如 Qwen、OpenAI 等）根据其自身隐私政策可能收集的数据。

### 3. 如何在不同的认证方式之间切换？

你可以在 Qwen OAuth、阿里云百炼计划、你自己的 API key 以及 Vertex AI 之间随时切换：

1. **启动时**：在提示时选择你偏好的认证方式
2. **在 CLI 中**：使用 `/auth` 命令重新配置认证方式
3. **环境变量**：设置 `.env` 文件以自动进行 API key 认证

有关详细说明，请参见[认证设置](../configuration/auth.md)文档。