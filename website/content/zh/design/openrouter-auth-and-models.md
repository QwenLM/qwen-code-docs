# OpenRouter 认证与模型管理设计

本文档记录了 OpenRouter 认证流程及其引入的模型管理变更背后的设计意图。它有意侧重于产品和架构选择，而非实现历史。

## 目标

- 让用户既可以通过 CLI 也可以通过 `/auth` 使用 OpenRouter 进行认证。
- 复用现有的 OpenAI 兼容 provider 路径，而不是为 OpenRouter 添加新的认证类型。
- 使首次运行体验可用，而无需用户立即管理数百个模型。
- 通过 `/manage-models` 保留通往更丰富模型管理的清晰路径。

## OpenRouter 认证

OpenRouter 作为兼容 OpenAI 的 provider 集成：

- auth 类型：`AuthType.USE_OPENAI`
- provider 设置：`modelProviders.openai`
- API key 环境变量：`OPENROUTER_API_KEY`
- 基础 URL：`https://openrouter.ai/api/v1`

这避免了在运行时模型 provider 路径已经兼容 OpenAI 的情况下引入 OpenRouter 专属的 `AuthType`。它使认证状态、模型解析、provider 选择和设置模式与现有的 provider 抽象保持一致。

面向用户的流程如下：

- `/auth` → OpenRouter 用于交互式 TUI 流程。
- 环境变量用于自动化或直接设置 API key：`OPENROUTER_API_KEY` 加上 `OPENAI_BASE_URL=https://openrouter.ai/api/v1`。
- `~/.qwen/settings.json` 用于需要显式模型 provider 条目的脚本化设置。

浏览器 OAuth 使用 OpenRouter 的 PKCE 流程，并将交换后的 API key 写入设置，然后以 `AuthType.USE_OPENAI` 刷新认证。

## 模型管理

OpenRouter 暴露了一个庞大且动态的模型目录。将每个发现的模型都写入 `modelProviders.openai` 会使 `/model` 变得杂乱，并将一个长期使用的设置字段变成远程目录的缓存。

关键的设计划分是：

- **目录**：从诸如 OpenRouter 等来源发现的所有模型集合。
- **启用集**：应出现在 `/model` 中并持久化到用户设置的较小模型集合。

对于初始的 OpenRouter 流程，认证应最终提供一个有用的默认启用集，而不是用一个大选择器中断用户。推荐的集合应小而稳定，并且偏向于能让用户成功试用产品的模型，包括可用的免费模型。

`/model` 仍然是一个快速的模型切换器。它不应成为用户浏览和整理完整 provider 目录的地方。

## `/manage-models`

更丰富的模型管理应属于一个独立的 `/manage-models` 入口点。该流程应允许用户：

- 浏览发现的模型；
- 按 ID、显示名称、provider 前缀以及派生标签（如 `free` 或 `vision`）搜索；
- 查看当前哪些模型已启用；
- 批量启用或禁用模型。

源维度必须保留在此设计中。OpenRouter 只是第一个动态目录源；未来的源如 ModelScope 和 ModelStudio 应适合同样的形态。可以降低 UI 复杂性，但底层的源抽象应作为扩展点保持可用。

## 当前边界

此变更应做最低限度的工作，使 OpenRouter 认证和模型设置体验愉悦：

- OAuth 或基于密钥的认证通过现有的 OpenAI 兼容 provider 路径配置 OpenRouter。
- 初始启用模型集是经过精心挑选的，而不是将整个目录转储到设置中。
- 完整的目录存储、浏览、筛选和批量管理推迟到 `/manage-models` 进行。

设计原则很简单：认证应让用户快速进入工作状态，而模型管理应放在专用的管理流程中。