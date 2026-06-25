# Auth Provider Registry 设计动机

auth 模块曾将每种配置路径建模为独立的流程：API key、OAuth、订阅计划和自定义 provider。但实际上，所有这些路径产生的输出类型相同：更新用户在 `~/.qwen/settings.json` 中的 provider 配置。

此次重构将 provider 配置作为共享抽象。一个 provider 描述了它的展示方式、凭据收集方式、安装的模型列表以及需要应用的 settings patch。API key、OAuth、编程计划、token 计划和自定义向导都是 provider 的配置方法，而非独立的 auth 架构。

## 目标

- 保持 `/auth` 面向用户的流程易于理解：
  - Alibaba ModelStudio，用于第一方 Qwen 配置。
  - 第三方 provider，用于 DeepSeek、MiniMax、Z.AI 等常见内置集成。
  - OAuth provider，如 OpenRouter。
  - 自定义 provider，用于本地服务器、代理或未内置的 provider。
- 将 provider 特定数据移入小型声明式 provider 配置中。
- 简化第三方 provider 的贡献流程：添加一个常见 provider 通常只需添加一个 provider 配置和对应测试。
- 通过 `ProviderInstallPlan` 和 `applyProviderInstallPlan` 集中处理 settings 写入。
- 将 UI 分组与安装行为分离。分组帮助用户在 `/auth` 中导航，不应驱动 settings 逻辑。
- 保留模型列表归属和 provider 元数据的路径，以便安全地检测并应用 provider 模型更新。

## 架构

新结构将 provider 定义、安装逻辑和 UI 状态分离：

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

`ProviderConfig` 是内置 provider 的声明式契约，包含 provider 标签、协议、base URL 选项、环境变量 key、模型列表、模型元数据、UI 分组和配置行为。

`buildInstallPlan` 将 provider 配置和收集到的配置输入转换为 `ProviderInstallPlan`。install plan 是 settings 写入器唯一需要理解的对象。

`applyProviderInstallPlan` 通过更新环境 settings、`modelProviders`、选定的 auth 类型、可选的模型选择和 provider 元数据来应用该 plan。这使得 settings 持久化与收集输入的 UI 流程相互独立。

## 用户流程

`/auth` 仍可呈现不同的入口点，但它们都应收敛到同一个 provider 安装路径：

1. **Alibaba ModelStudio**
   - 编程计划
   - Token 计划
   - 标准 API key

2. **第三方 Provider**
   - 带有内置默认值的常见 provider。
   - 每个 provider 应管理自己的 base URL、env key、默认模型和模型元数据。
   - Z.AI 必须使用配置专用的 base URL：
     - 编程计划：`https://api.z.ai/api/coding/paas/v4`
     - 标准 API key：`https://api.z.ai/api/paas/v4`

3. **OAuth**
   - 面向 OpenRouter 等路由平台的基于浏览器的授权方式。
   - OAuth 特定机制可在 provider 实现中处理，但最终结果仍应为 provider install plan。

4. **自定义 Provider**
   - 用于本地服务器、代理或不受支持 provider 的手动配置。
   - 向导收集协议、base URL、API key、模型 ID 以及高级模型选项（如 thinking、多模态输入、context window 和最大 token 数）。

## 模型归属与更新

静态内置 provider 可在 `providerMetadata.<providerId>` 下持久化 provider 元数据，包括模型列表版本和 base URL。这使 Qwen Code 能够检测 provider 内置模型列表的变化，并在不覆盖无关自定义模型的情况下提示用户更新已归属的模型。

自定义 provider 有所不同：其模型列表由用户编写，不应被视为可自动更新的内置模型列表。

## 非目标

- 不将 API key、OAuth、编程计划或 token 计划作为顶层 settings 架构。
- 不将 settings 写入与 React 组件或 CLI 命令处理器耦合。
- 不将 UI 分组作为业务逻辑维度。
- 不要求贡献者在添加简单第三方 provider 时理解完整的 auth UI。
