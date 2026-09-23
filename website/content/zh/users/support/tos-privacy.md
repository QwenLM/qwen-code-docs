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

## Chrome 扩展与 Browser Use

Qwen Code Chrome 扩展将 Chrome 连接到运行在你计算机上的 Qwen Code。其侧边栏显示本地 Qwen Code Web 应用，Browser Use 通过本地 Native Messaging host 交换浏览器命令与结果。以下描述了为浏览器任务所处理的数据，与下文可选的使用统计分开说明。

### 用于你的任务的浏览器数据

浏览器工具可以访问打开的 HTTP(S) 标签页标题与 URL、页面文本与结构、截图、浏览器交互结果，以及调试信息（如控制台消息、网络活动和 Cookie）。显式的浏览器历史搜索会在请求的查询限制内返回匹配的 URL、页面标题和访问时间。根据你选择的页面和任务，这些结果可能包含个人标识信息、健康信息、财务或支付信息、认证信息、个人通信以及位置信息。该扩展还使用导航来源信息，将最近由助手操作打开的新页面与同一浏览器会话关联。

这些能力支持你通过 Qwen Code 请求的浏览器任务和 Web 开发工作。浏览器工具在你的 Chrome 配置文件中运行，包括你已登录的页面。请据此选择你要与助手共享的页面和任务。

### 本地处理与 AI 提供商

该扩展将浏览器命令与结果发送到同一台计算机上的 Qwen Code。Qwen Code 可能会将这些结果包含在对话上下文中，并将其传输到为该会话配置的 AI 提供商。提供商的隐私、留存和模型训练条款如本声明其他部分所述适用。扩展的本地连接只是此数据流的一部分；后续处理可能在你选择的 AI 提供商处进行。

### 存储的数据与用户控制

该扩展在 Chrome 扩展本地存储中保存连接偏好设置、可选的本地守护进程认证令牌以及持久的浏览器实例标识符。它还在 Chrome 会话存储中保存标签页和会话所有权状态，以支持在其后台 service worker 重启后进行清理。

包含在 Qwen Code 对话中或由浏览器工具保存的浏览器结果可能保留在本地对话记录、截图、下载或其他输出文件中。使用适用的 Qwen Code 和文件系统控制来管理这些记录。AI 提供商的留存由其各自的政策单独管理。

你可以在 Chrome 的扩展管理器中禁用或卸载该扩展以停止其浏览器集成。清除扩展存储会移除其保存的偏好设置、令牌和实例标识符。移除扩展后，单独安装的 Qwen Code 应用程序、其 Native Messaging host、本地对话和文件，以及已发送到 AI 提供商的副本需单独管理。

### 浏览器数据的有限使用

Qwen Code 对通过 Chrome 扩展接收的数据的使用和传输遵循 [Chrome Web Store 用户数据政策](https://developer.chrome.com/docs/webstore/program-policies/user-data)，包括其有限使用要求。浏览器数据用于提供扩展的单一用途：将 Chrome 连接到 Qwen Code 以进行用户请求的浏览器协助。这些数据不会被出售、用于广告，或用于确定信用worthiness或贷款资格。传输仅限于提供该功能，包括由你配置的 AI 提供商进行的处理，以及该政策允许的其他用途。

有关浏览器数据处理的问题，请通过 [Qwen Code issue tracker](https://github.com/QwenLM/qwen-code/issues) 联系团队。仅分享解释问题所需的详细信息；从公开报告中移除凭证和私密页面内容。

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