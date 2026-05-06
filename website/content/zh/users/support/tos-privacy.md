# Qwen Code：服务条款与隐私声明

Qwen Code 是由 Qwen Code 团队维护的开源 AI 编程助手工具。本文档概述了在使用 Qwen Code 的身份验证方法和 AI 模型服务时适用的服务条款与隐私政策。

## 如何确定你的身份验证方法

Qwen Code 支持三种身份验证方法来访问 AI 模型。你的身份验证方法决定了适用于你使用情况的服务条款和隐私政策：

1. **Qwen OAuth** — 使用你的 qwen.ai 账号登录（免费层级将于 2026-04-15 停用）
2. **Alibaba Cloud Coding Plan** — 使用来自阿里云的 API key
3. **API Key** — 使用自带的 API key

对于每种身份验证方法，适用的服务条款和隐私声明可能因底层服务提供商而异。

| 身份验证方法              | 服务提供商        | 服务条款                                                           | 隐私声明                                                           |
| :------------------------ | :---------------- | :----------------------------------------------------------------- | :----------------------------------------------------------------- |
| Qwen OAuth                | Qwen AI           | [Qwen 服务条款](https://qwen.ai/termsservice)              | [Qwen 隐私政策](https://qwen.ai/privacypolicy)               |
| Alibaba Cloud Coding Plan | 阿里云            | 详见[下方说明](#2-if-you-are-using-alibaba-cloud-coding-plan) | 详见[下方说明](#2-if-you-are-using-alibaba-cloud-coding-plan) |
| API Key                   | 多家提供商        | 取决于你选择的 API 提供商（OpenAI、Anthropic 等）                  | 取决于你选择的 API 提供商                                          |

## 1. 如果你使用 Qwen OAuth 身份验证

当你使用 qwen.ai 账号进行身份验证时，将适用以下服务条款和隐私声明文档：

- **服务条款：** 你的使用行为受 [Qwen 服务条款](https://qwen.ai/termsservice) 约束。
- **隐私声明：** 你的数据收集与使用方式详见 [Qwen 隐私政策](https://qwen.ai/privacypolicy)。

有关身份验证设置、配额和支持功能的详细信息，请参阅 [身份验证设置](../configuration/settings)。

## 2. 如果你使用 Alibaba Cloud Coding Plan

当你使用来自阿里云的 API key 进行身份验证时，将适用阿里云的相关服务条款和隐私声明。

Alibaba Cloud Coding Plan 提供两个区域版本：

- **阿里云百炼 (aliyun.com)** — [bailian.console.aliyun.com](https://bailian.console.aliyun.com)
- **Alibaba Cloud (alibabacloud.com)** — [bailian.console.alibabacloud.com](https://bailian.console.alibabacloud.com)

> [!important]
>
> 使用 Alibaba Cloud Coding Plan 时，你将受阿里云的条款和隐私政策约束。请查阅其文档，了解有关数据使用、保留和隐私实践的具体细节。

## 3. 如果你使用自己的 API Key

当你使用其他提供商的 API key 进行身份验证时，适用的服务条款和隐私声明取决于你选择的提供商。

> [!important]
>
> 使用自己的 API key 时，你将受所选 API 提供商的条款和隐私政策约束，而非 Qwen Code 的条款。请查阅提供商的文档，了解有关数据使用、保留和隐私实践的具体细节。

Qwen Code 支持多种兼容 OpenAI 的提供商。有关详细信息，请参阅你具体使用的提供商的服务条款和隐私政策。

## 使用统计与遥测数据

Qwen Code 可能会收集匿名使用统计数据和 [遥测](../../developers/development/telemetry) 数据，以改善用户体验和产品质量。此数据收集为可选操作，可通过配置设置进行控制。

### 收集哪些数据

启用后，Qwen Code 可能会收集：

- 匿名使用统计数据（运行的命令、性能指标）
- 错误报告和崩溃数据
- 功能使用模式

### 按身份验证方法划分的数据收集

- **Qwen OAuth：** 使用统计数据受 Qwen 隐私政策约束。你可以通过 Qwen Code 的配置设置选择退出。
- **Alibaba Cloud Coding Plan：** 使用统计数据受阿里云隐私政策约束。你可以通过 Qwen Code 的配置设置选择退出。
- **API Key：** 除你选择的 API 提供商收集的数据外，Qwen Code 不会收集任何额外数据。

## 常见问题解答 (FAQ)

### 1. 我的代码（包括提示词和回答）会被用于训练 AI 模型吗？

你的代码（包括提示词和回答）是否会被用于训练 AI 模型，取决于你的身份验证方法以及你使用的具体 AI 服务提供商：

- **Qwen OAuth**：数据使用受 [Qwen 隐私政策](https://qwen.ai/privacy) 约束。有关数据收集和模型训练实践的具体细节，请参阅其政策。

- **Alibaba Cloud Coding Plan**：数据使用受阿里云隐私政策约束。有关数据收集和模型训练实践的具体细节，请参阅其政策。

- **API Key**：数据使用完全取决于你选择的 API 提供商。每个提供商都有自己的数据使用政策。请查阅你具体使用的提供商的隐私政策和服务条款。

**重要提示**：Qwen Code 本身不会将你的提示词、代码或回答用于模型训练。任何用于训练目的的数据使用都将受你进行身份验证的 AI 服务提供商的政策约束。

### 2. 什么是使用统计？选择退出控制的是什么？

**使用统计**设置控制 Qwen Code 为改善用户体验和产品质量而进行的可选数据收集。

启用后，Qwen Code 可能会收集：

- 匿名遥测数据（运行的命令、性能指标、功能使用情况）
- 错误报告和崩溃数据
- 常规使用模式

**Qwen Code 不会收集以下内容：**

- 你的代码内容
- 发送给 AI 模型的提示词
- AI 模型返回的回答
- 个人信息

使用统计设置仅控制 Qwen Code 自身的数据收集。它不会影响你选择的 AI 服务提供商（Qwen、OpenAI 等）根据其自身隐私政策可能收集的数据。

### 3. 如何在不同身份验证方法之间切换？

你可以随时在 Qwen OAuth、Alibaba Cloud Coding Plan 和自己的 API key 之间切换：

1. **启动时**：在提示时选择你偏好的身份验证方法
2. **在 CLI 中**：使用 `/auth` 命令重新配置你的身份验证方法
3. **环境变量**：配置 `.env` 文件以实现 API key 自动身份验证

有关详细说明，请参阅 [身份验证设置](../configuration/settings#environment-variables-for-api-access) 文档。