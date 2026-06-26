# Auth Provider Registry 动机

认证模块过去将每个设置路径建模为独立的流程：API key、OAuth、订阅计划和自定义提供商。实际上，所有这些路径产生相同类型的输出：更新 `~/.qwen/settings.json` 中的用户提供商配置。

这次重构将提供商设置变为共享抽象。一个提供商描述其展示方式、凭证收集方式、安装哪些模型以及应用哪些设置补丁。API keys、OAuth、coding plans、token plans 和自定义向导是提供商的设置方法，而不是独立的认证架构。

## 目标

- 保持 `/auth` 面向用户的流程易于理解：
  - 阿里巴巴 ModelStudio 用于第一方 Qwen 设置。
  - 第三方提供商用于常见内置集成，例如 DeepSeek、MiniMax 和 Z.AI。
  - OAuth 提供商，例如 OpenRouter。
  - 自定义提供商用于本地服务器、代理或未内置的提供商。
- 将提供商特定数据移入小型声明式提供商配置。
- 使第三方提供商的贡献变得简单：添加一个常见提供商通常意味着添加一个提供商配置加上测试。
- 通过 `ProviderInstallPlan` 和 `applyProviderInstallPlan` 集中管理设置写入。
- 保持 UI 分组与安装行为分离。分组帮助用户导航 `/auth`；它们不应驱动设置逻辑。
- 保留模型列表所有权和提供商元数据的路径，以便安全检测和应用提供商模型更新。

## 架构

新结构将提供商定义、安装逻辑和 UI 状态分离：

```text
packages/cli/src/auth/
├── allProviders.ts
├── providerConfig.ts
├── types.ts
├── install/
│   └── applyProviderInstallPlan.ts
└── providers/
    ├── alibaba/
    ├── custom/
    ├── oauth/
    └── thirdParty/
```

`ProviderConfig` 是内置提供商的声明式契约。它包含提供商标签、协议、base URL 选项、环境键、模型列表、模型元数据、UI 分组和设置行为。

`buildInstallPlan` 将提供商配置和收集的设置输入转换为 `ProviderInstallPlan`。安装计划是设置写入器唯一需要理解的对象。

`applyProviderInstallPlan` 通过更新环境设置、`modelProviders`、选定的认证类型、可选的模型选择以及提供商元数据来应用该计划。这使设置持久化与收集输入的 UI 流程保持独立。

## 用户流程

`/auth` 仍然可以提供不同的入口点，但它们都应汇聚到同一个提供商安装路径：

1. **阿里巴巴 ModelStudio**
   - Coding Plan
   - Token Plan
   - Standard API key

2. **第三方提供商**
   - 具有内置默认值的常见提供商。
   - 每个提供商应拥有自己的 base URL、env key、默认模型和模型元数据。
   - Z.AI 必须使用特定于设置的 base URL：
     - Coding Plan：`https://api.z.ai/api/coding/paas/v4`
     - Standard API key：`https://api.z.ai/api/paas/v4`

3. **OAuth**
   - 基于浏览器的授权用于路由平台，例如 OpenRouter。
   - OAuth 特定的机制可以存在于提供商实现中，但最终结果仍应是一个提供商安装计划。

4. **自定义提供商**
   - 手动设置用于本地服务器、代理或不受支持的提供商。
   - 向导收集协议、base URL、API key、模型 ID 以及高级模型选项，例如 thinking、multimodal input、context window 和 max tokens。

## 模型所有权和更新

静态内置提供商可以将提供商元数据持久化在 `providerMetadata.<providerId>` 下，包括模型列表版本和 base URL。这让 Qwen Code 能够检测到提供商的内置模型列表何时发生变化，并提示用户更新拥有的模型，而不会覆盖无关的自定义模型。

自定义提供商不同：它们的模型列表由用户编写，不应被视为可自动更新的内置模型列表。

## 非目标

- 不要将 API key、OAuth、coding plan 或 token plan 作为顶级设置架构。
- 不要将设置写入与 React 组件或 CLI 命令处理程序耦合。
- 不要将 UI 分组作为业务逻辑轴线。
- 不要要求贡献者理解完整的认证 UI 来添加一个简单的第三方提供商。