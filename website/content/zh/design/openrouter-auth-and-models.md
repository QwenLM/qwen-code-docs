# OpenRouter 认证与模型管理设计

本文档记录了 OpenRouter 认证流程及其引入的模型管理变更的设计意图。本文档有意聚焦于产品与架构层面的选择，而非实现历史。

## 目标

- 允许用户通过 CLI 和 `/auth` 界面进行 OpenRouter 认证。
- 复用现有的 OpenAI 兼容 provider 路径，而非为 OpenRouter 新增独立的认证类型。
- 优化首次运行体验，避免要求用户立即管理数百个模型。
- 为通过 `/manage-models` 实现更丰富的模型管理保留清晰的路径。

## OpenRouter 认证

OpenRouter 作为 OpenAI 兼容的 provider 集成：

- auth type: `AuthType.USE_OPENAI`
- provider settings: `modelProviders.openai`
- API key env var: `OPENROUTER_API_KEY`
- base URL: `https://openrouter.ai/api/v1`

由于运行时模型 provider 路径已兼容 OpenAI，此举避免了引入 OpenRouter 专属的 `AuthType`。它使认证状态、模型解析、provider 选择以及配置 schema 与现有的 provider 抽象保持一致。

面向用户的流程如下：

- `qwen auth openrouter --key <key>`：用于自动化或直接配置 API key。
- `qwen auth openrouter`：用于基于浏览器的 OAuth 认证。
- `/auth` → API Key → OpenRouter：用于 TUI 流程。

浏览器 OAuth 使用 OpenRouter 的 PKCE 流程，在将认证刷新为 `AuthType.USE_OPENAI` 之前，会将交换获取的 API key 写入配置。

## 模型管理

OpenRouter 提供了庞大的动态模型目录。若将每个发现的模型都写入 `modelProviders.openai`，会导致 `/model` 界面杂乱，并将长期配置字段变成远程目录的缓存。

核心设计拆分如下：

- **Catalog**：从 OpenRouter 等来源发现的全部模型集合。
- **Enabled set**：应显示在 `/model` 中并持久化到用户配置的较小模型集合。

在初始的 OpenRouter 流程中，认证完成后应提供一个实用的默认启用集，而非用庞大的选择器打断用户。推荐集应保持精简、稳定，并优先偏向能帮助用户成功体验产品的模型（在可用时包含免费模型）。

`/model` 仍作为快速模型切换器。它不应成为用户浏览和管理完整 provider 目录的地方。

## `/manage-models`

更丰富的模型管理功能应归属于独立的 `/manage-models` 入口。该流程应允许用户：

- 浏览已发现的模型；
- 按 id、显示名称、provider 前缀以及派生标签（如 `free` 或 `vision`）进行搜索；
- 查看当前已启用的模型；
- 批量启用或禁用模型。

来源（source）维度必须保留在此设计中。OpenRouter 仅是首个动态目录来源；未来的来源（如 ModelScope 和 ModelStudio）应适配相同的结构。可以降低 UI 复杂度，但底层的 source 抽象应作为扩展点保留。

## 当前边界

本次变更应仅实现让 OpenRouter 认证与模型设置体验顺畅所需的最小改动：

- OAuth 或基于 key 的认证通过现有的 OpenAI 兼容 provider 路径配置 OpenRouter。
- 初始启用模型集经过精选，而非将完整目录全量写入配置中。
- 完整目录的存储、浏览、过滤和批量管理将推迟至 `/manage-models` 实现。

设计原则很简单：认证应让用户快速进入可用状态，而模型筛选与管理应交由专用的管理流程处理。