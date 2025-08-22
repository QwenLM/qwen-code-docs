# Qwen Code：服务条款与隐私声明

Qwen Code 是由 Qwen Code 团队维护的开源 AI 编程助手工具。本文档说明了在使用 Qwen Code 的认证方式和 AI 模型服务时所适用的服务条款和隐私政策。

## 如何确定你的认证方式

Qwen Code 支持两种主要的认证方式来访问 AI 模型。你的认证方式将决定适用于你使用的具体服务条款和隐私政策：

1. **Qwen OAuth** - 使用你的 qwen.ai 账户登录
2. **OpenAI-Compatible API** - 使用来自不同 AI 模型提供商的 API key

对于每种认证方式，根据底层服务提供商的不同，可能适用不同的服务条款和隐私声明。

| 认证方式               | 提供商            | 服务条款                                                                     | 隐私声明                                             |
| :--------------------- | :---------------- | :--------------------------------------------------------------------------- | :--------------------------------------------------- |
| Qwen OAuth             | Qwen AI           | [Qwen 服务条款](https://qwen.ai/termsservice)                                | [Qwen 隐私政策](https://qwen.ai/privacypolicy)       |
| OpenAI-Compatible API  | 多个提供商        | 取决于你选择的 API 提供商（OpenAI、阿里云、ModelScope 等）                   | 取决于你选择的 API 提供商                            |

## 1. 如果你使用 Qwen OAuth 认证

当你使用 qwen.ai 账户进行认证时，以下服务条款和隐私声明文档适用：

- **服务条款：** 你的使用受 [Qwen 服务条款](https://qwen.ai/termsservice) 约束。
- **隐私声明：** 你的数据收集和使用方式在 [Qwen 隐私政策](https://qwen.ai/privacypolicy) 中有详细说明。

有关认证设置、配额和受支持功能的详细信息，请参阅 [认证设置](./cli/authentication.md)。

## 2. 如果你使用 OpenAI 兼容的 API 认证

当你使用来自 OpenAI 兼容提供商的 API 密钥进行认证时，适用的服务条款和隐私声明将取决于你所选择的提供商。

**重要提示：** 当使用 OpenAI 兼容的 API 认证时，你需遵守所选 API 提供商的条款和隐私政策，而非 Qwen Code 的条款。请查阅你所选提供商的文档，了解有关数据使用、存储和隐私实践的具体信息。

Qwen Code 支持多种 OpenAI 兼容的提供商。请参考你所使用提供商的具体服务条款和隐私政策以获取详细信息。

## 使用统计与遥测数据

Qwen Code 可能会收集匿名的使用统计信息和遥测数据，以改善用户体验和产品质量。该数据收集是可选的，你可以通过配置设置进行控制。

### 收集哪些数据

启用后，Qwen Code 可能会收集：

- 匿名使用统计信息（运行的命令、性能指标）
- 错误报告和崩溃数据
- 功能使用模式

### 按认证方式的数据收集

- **Qwen OAuth：** 使用统计信息受 Qwen 隐私政策管辖。你可以通过 Qwen Code 的配置设置选择退出。
- **OpenAI 兼容 API：** Qwen Code 不会收集除你选择的 API 提供商收集之外的任何额外数据。

### 退出说明

你可以按照 [Usage Statistics Configuration](./cli/configuration.md#usage-statistics) 文档中的说明禁用使用统计信息收集。

## 常见问题 (FAQ)

### 1. 我的代码，包括 prompts 和 answers，会被用于训练 AI 模型吗？

你的代码，包括 prompts 和 answers 是否被用于训练 AI 模型，取决于你的认证方式以及你所使用的 AI 服务提供商：

- **Qwen OAuth**：数据使用受 [Qwen 隐私政策](https://qwen.ai/privacy) 管辖。请查阅他们的政策以了解有关数据收集和模型训练实践的具体细节。

- **OpenAI-Compatible API**：数据使用完全取决于你选择的 API 提供商。每个提供商都有自己的数据使用政策。请查看你所使用提供商的隐私政策和服务条款。

**重要提示**：Qwen Code 本身不会将你的 prompts、代码或 responses 用于模型训练。任何用于训练目的的数据使用都将受你所认证的 AI 服务提供商政策的管辖。

### 2. 什么是使用统计，以及退出控制是什么？

**使用统计**（Usage Statistics）设置用于控制 Qwen Code 收集可选数据，以改善用户体验和产品质量。

启用后，Qwen Code 可能会收集以下信息：

- 匿名遥测数据（执行的命令、性能指标、功能使用情况）
- 错误报告和崩溃数据
- 一般使用模式

**Qwen Code 不会收集以下信息：**

- 你的代码内容
- 发送给 AI 模型的 prompts
- AI 模型的响应内容
- 个人信息

使用统计设置仅控制 Qwen Code 自身的数据收集行为。它不会影响你所选择的 AI 服务提供商（如 Qwen、OpenAI 等）根据其隐私政策可能收集的数据。

你可以按照 [使用统计配置](./cli/configuration.md#usage-statistics) 文档中的说明，禁用使用统计的数据收集功能。

### 3. 如何在认证方式之间切换？

你可以随时在 Qwen OAuth 和 OpenAI 兼容的 API 认证之间切换：

1. **启动时**：在提示时选择你偏好的认证方式
2. **在 CLI 中**：使用 `/auth` 命令重新配置你的认证方式
3. **环境变量**：设置 `.env` 文件以自动启用 OpenAI 兼容的 API 认证

详细说明请参见 [认证设置](./cli/authentication.md) 文档。