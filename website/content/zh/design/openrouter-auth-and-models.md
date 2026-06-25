# OpenRouter 认证与模型管理设计

本文档记录了 OpenRouter 认证流程及相关模型管理变更背后的设计意图，重点关注产品和架构层面的决策，而非实现历史。

## 目标

- 允许用户通过 CLI 和 `/auth` 两种方式完成 OpenRouter 认证。
- 复用现有的 OpenAI 兼容 provider 路径，而不为 OpenRouter 新增认证类型。
- 让首次运行体验开箱即用，无需立即让用户管理数以百计的模型。
- 为通过 `/manage-models` 实现更丰富的模型管理保留清晰的扩展路径。

## OpenRouter 认证

OpenRouter 作为 OpenAI 兼容 provider 集成：

- auth type：`AuthType.USE_OPENAI`
- provider 设置：`modelProviders.openai`
- API key 环境变量：`OPENROUTER_API_KEY`
- base URL：`https://openrouter.ai/api/v1`

由于运行时模型 provider 路径已兼容 OpenAI，此方案避免了引入 OpenRouter 专属的 `AuthType`，同时保持认证状态、模型解析、provider 选择和 settings schema 与现有 provider 抽象保持一致。

面向用户的流程如下：

- `/auth` → OpenRouter，用于交互式 TUI 流程。
- 环境变量，用于自动化或直接配置 API key：`OPENROUTER_API_KEY` 加上 `OPENAI_BASE_URL=https://openrouter.ai/api/v1`。
- `~/.qwen/settings.json`，用于需要显式指定模型 provider 条目的脚本化配置。

浏览器 OAuth 使用 OpenRouter 的 PKCE 流程，将换取的 API key 写入 settings，然后以 `AuthType.USE_OPENAI` 刷新认证状态。

## 模型管理

OpenRouter 提供了一个规模庞大的动态模型目录。将所有发现的模型写入 `modelProviders.openai` 会让 `/model` 变得嘈杂，也会使这个长期 settings 字段沦为远端目录的缓存。

核心设计拆分如下：

- **Catalog**：从 OpenRouter 等数据源发现的完整模型集合。
- **已启用集合**：应出现在 `/model` 中并持久化到用户 settings 的较小模型集合。

在初始 OpenRouter 流程中，认证完成后应提供一个有用的默认已启用集合，而不是用一个庞大的选择器打断用户。推荐集合应精简、稳定，并优先选取能让用户成功体验产品的模型，包括可用的免费模型。

`/model` 应保持为快速模型切换器，不应成为用户浏览和管理完整 provider 目录的地方。

## `/manage-models`

更丰富的模型管理功能应在独立的 `/manage-models` 入口点实现。该流程应允许用户：

- 浏览已发现的模型；
- 按 id、显示名称、provider 前缀以及 `free`、`vision` 等派生标签进行搜索；
- 查看当前已启用的模型；
- 批量启用或禁用模型。

数据源维度必须保留在此设计中。OpenRouter 只是第一个动态 catalog 数据源，未来的 ModelScope、ModelStudio 等数据源应适配相同的结构。UI 复杂度可以降低，但底层的数据源抽象应作为扩展点保留。

## 当前边界

此次变更只做让 OpenRouter 认证和模型配置体验流畅所需的最小工作：

- OAuth 或基于 key 的认证通过现有的 OpenAI 兼容 provider 路径配置 OpenRouter。
- 初始已启用模型集合经过精心筛选，而不是将完整目录导入 settings。
- 完整目录的存储、浏览、筛选和批量管理推迟到 `/manage-models` 实现。

设计原则很简单：认证应让用户快速进入可用状态，模型筛选则应在专属的管理流程中完成。