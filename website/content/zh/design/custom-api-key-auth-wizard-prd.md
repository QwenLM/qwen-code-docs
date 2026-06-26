# 自定义 API Key 认证向导 PRD

## 概述

通过用终端内设置向导替代当前仅显示文档的界面，改进 `/auth -> API Key -> 自定义 API Key` 体验，使其支持自定义 API 提供商。

Qwen Code 通过 `authType` / `modelProviders` 键支持多种 API 协议，包括 `openai`、`anthropic` 和 `gemini`。因此，自定义设置向导应首先要求用户选择协议，然后收集该协议的端点、密钥和模型信息。

向导引导用户完成以下流程：

```text
选择协议 -> 输入基础 URL -> 输入 API Key -> 输入模型 ID -> 预览 JSON -> 保存 + 认证
```

这使自定义 API Key 设置保持在 Qwen Code 内部，减少手动编辑 `settings.json` 的需求，并通过在保存前显示生成的 JSON 使最终配置透明。

## 背景

目前，在 `/auth` 中选择 `自定义 API Key` 会显示一个静态信息页面：

```text
自定义配置

您可以在 settings.json 中配置您的 API Key 和模型

有关设置说明，请参阅文档
https://qwenlm.github.io/qwen-code-docs/en/users/configuration/model-providers/

按 Esc 返回
```

这要求用户离开 CLI、阅读文档、理解 `settings.json`、手动配置 `modelProviders`、选择 `envKey`、添加 API Key，然后再返回 Qwen Code。用户反馈该流程困难且与 `/auth` 的其他体验脱节。

现有的 ModelStudio 标准 API Key 路径已经提供了引导式的设置流程：

```text
阿里云 ModelStudio 标准 API Key
└─ 选择区域
   └─ 输入 API Key
      └─ 输入模型 ID
         └─ 保存 + 认证
```

自定义 API Key 设置应提供类似的引导式体验，同时尊重 Qwen Code 支持多种提供商协议的事实。

## 问题陈述

自定义 API Key 路径目前在 `/auth` 中是一条死胡同：

```text
/auth
└─ 选择认证方法
   ├─ 阿里云代码计划
   ├─ API Key
   │  └─ 选择 API Key 类型
   │     ├─ 阿里云 ModelStudio 标准 API Key
   │     │  ├─ 选择区域
   │     │  ├─ 输入 API Key
   │     │  ├─ 输入模型 ID
   │     │  └─ 保存 + 认证
   │     │
   │     └─ 自定义 API Key
   │        └─ 仅含文档的界面
   │
   └─ Qwen OAuth
```

这导致以下可用性问题：

- 用户无法从 `/auth` 完成自定义提供商的设置。
- 用户在认证前需要先理解底层设置概念。
- 用户可能不清楚哪些字段是必需的：`authType`、`baseUrl`、`envKey`、`modelProviders`、`model.name` 和 `security.auth.selectedType`。
- 用户可能会意外与已有的环境变量冲突，或覆盖已有的提供商配置。
- 手动编辑设置后，用户无法立即获得认证反馈。

## 目标

1. 让用户完全在 `/auth` 内完成自定义 API 提供商的配置。
2. 支持 Qwen Code 在 `modelProviders` 中支持的主要协议：`openai`、`anthropic` 和 `gemini`。
3. 保持流程与现有的 ModelStudio 标准流程接近。
4. 将 `baseUrl` 视为自定义提供商对应的“区域”选择。
5. 根据所选协议和输入的 `baseUrl` 自动生成由 Qwen 管理的私有 `envKey`。
6. 将 API Key 存储在 `settings.json.env` 中，与当前 Qwen 管理的凭证模式一致。
7. 通过使用 Qwen 特定的生成密钥名称，避免与用户 shell 环境变量冲突。
8. 在保存前显示生成的 JSON，以便用户审查确切的设置变更。
9. 保留不相关的现有 `modelProviders` 条目。
10. 保存后立即认证，并显示成功或失败反馈。

## 非目标

1. 不要求用户手动输入 `envKey`。
2. 不将提供商名称作为一个单独概念引入。
3. 不在向导中添加高级的 `generationConfig`、`capabilities` 或按模型覆盖。
4. 不完全移除文档链接；它应仍可用于高级配置。
5. 不改变现有的代码计划或 ModelStudio 标准 API Key 流程。
6. 在第一个版本中不尝试从 `baseUrl` 自动检测协议；用户需明确选择协议。

## 目标用户

- 使用自己自定义 API 端点的用户。
- 配置诸如 OpenAI 兼容 API、Anthropic 兼容 API、Gemini 兼容 API、vLLM、Ollama、LM Studio 或内部网关等提供商的用户。
- 更倾向于通过 CLI 而不是手动编辑 `settings.json` 进行认证设置的用户。

## 支持的协议

向导应初始暴露以下协议选项：

```text
openai
anthropic
gemini
```

每个协议直接映射到一个 `modelProviders` 键和 `security.auth.selectedType` 值。

| 协议选项               | Auth 类型 / modelProviders 键 | 说明                                                                 |
| ---------------------- | ------------------------------ | -------------------------------------------------------------------- |
| OpenAI 兼容            | `openai`                       | OpenAI、OpenRouter、Fireworks、本地 OpenAI 兼容服务器、内部网关       |
| Anthropic 兼容         | `anthropic`                    | Anthropic 兼容端点                                                    |
| Gemini 兼容            | `gemini`                       | Gemini 兼容端点                                                       |

## 用户体验概述

### 更新后的 `/auth` 树

```text
/auth
└─ 选择认证方法
   ├─ 阿里云代码计划
   │  └─ 选择区域
   │     └─ 输入 API Key
   │        └─ 保存 + 认证
   │
   ├─ API Key
   │  └─ 选择 API Key 类型
   │     ├─ 阿里云 ModelStudio 标准 API Key
   │     │  ├─ 选择区域
   │     │  ├─ 输入 API Key
   │     │  ├─ 输入模型 ID
   │     │  └─ 保存 + 认证
   │     │
   │     └─ 自定义 API Key
   │        ├─ 选择协议
   │        ├─ 输入基础 URL
   │        ├─ 输入 API Key
   │        ├─ 输入模型 ID
   │        ├─ 预览生成的 JSON
   │        └─ 保存 + 认证
   │
   └─ Qwen OAuth
```

### 自定义 API Key 状态机

```text
api-key-type-select
  │
  └─ CUSTOM_API_KEY
      │
      ▼
custom-protocol-select
      │ Enter
      ▼
custom-base-url-input
      │ Enter
      │ 根据 protocol + baseUrl 生成 envKey
      ▼
custom-api-key-input
      │ Enter
      ▼
custom-model-id-input
      │ Enter
      ▼
custom-review-json
      │ Enter
      ▼
保存设置 + refreshAuth(selectedProtocol)
```

### 回退行为

```text
custom-review-json
  Esc -> custom-model-id-input

custom-model-id-input
  Esc -> custom-api-key-input

custom-api-key-input
  Esc -> custom-base-url-input

custom-base-url-input
  Esc -> custom-protocol-select

custom-protocol-select
  Esc -> api-key-type-select
```

## 详细交互设计

### 步骤 1：选择协议

```text
┌──────────────────────────────────────────────────────────────┐
│ 自定义 API Key · 选择协议                                    │
│                                                              │
│  ◉ OpenAI 兼容                                               │
│    OpenAI、OpenRouter、Fireworks、vLLM、Ollama、LM Studio    │
│                                                              │
│  ○ Anthropic 兼容                                            │
│    Anthropic 兼容端点                                        │
│                                                              │
│  ○ Gemini 兼容                                               │
│    Gemini 兼容端点                                           │
│                                                              │
│ Enter 选择，↑↓ 导航，Esc 返回上一级                          │
└──────────────────────────────────────────────────────────────┘
```

所选协议决定：

- 要更新的 `modelProviders` 键。
- 要持久化的 `security.auth.selectedType` 值。
- 后续界面中显示的协议标签。
- 保存后使用的 `refreshAuth()` 认证类型。

### 步骤 2：输入基础 URL

`baseUrl` 是自定义提供商的“区域”选择等价物。它应在 API Key 输入之前出现，因为它决定了 API Key 所属的端点。

OpenAI 兼容：

```text
┌──────────────────────────────────────────────────────────────┐
│ 自定义 API Key · 基础 URL                                    │
│                                                              │
│ 协议：OpenAI 兼容                                             │
│                                                              │
│ 输入 OpenAI 兼容 API 端点。                                  │
│                                                              │
│ 基础 URL：https://openrouter.ai/api/v1_                      │
│                                                              │
│ 示例：                                                       │
│   OpenAI:      https://api.openai.com/v1                     │
│   OpenRouter: https://openrouter.ai/api/v1                   │
│   Fireworks:  https://api.fireworks.ai/inference/v1          │
│   Ollama:     http://localhost:11434/v1                      │
│   LM Studio:  http://localhost:1234/v1                       │
│                                                              │
│ Enter 继续，Esc 返回上一级                                    │
└──────────────────────────────────────────────────────────────┘
```

Anthropic 兼容：

```text
┌──────────────────────────────────────────────────────────────┐
│ 自定义 API Key · 基础 URL                                    │
│                                                              │
│ 协议：Anthropic 兼容                                          │
│                                                              │
│ 输入 Anthropic 兼容 API 端点。                               │
│                                                              │
│ 基础 URL：https://api.anthropic.com/v1_                      │
│                                                              │
│ Enter 继续，Esc 返回上一级                                    │
└──────────────────────────────────────────────────────────────┘
```

Gemini 兼容：

```text
┌──────────────────────────────────────────────────────────────┐
│ 自定义 API Key · 基础 URL                                    │
│                                                              │
│ 协议：Gemini 兼容                                             │
│                                                              │
│ 输入 Gemini 兼容 API 端点。                                  │
│                                                              │
│ 基础 URL：https://generativelanguage.googleapis.com_         │
│                                                              │
│ Enter 继续，Esc 返回上一级                                    │
└──────────────────────────────────────────────────────────────┘
```

验证：

- 必填。
- 必须以 `http://` 或 `https://` 开头。
- 去除首尾空白。
- 保留输入的规范化字符串，仅做修剪操作。

验证通过后提交：

- 根据选定的协议和 `baseUrl` 生成由 Qwen 管理的 `envKey`。
- 进入 API Key 输入。

### 步骤 3：输入 API Key

```text
┌──────────────────────────────────────────────────────────────┐
│ 自定义 API Key · API Key                                     │
│                                                              │
│ 协议：OpenAI 兼容                                             │
│ 端点：https://openrouter.ai/api/v1                           │
│                                                              │
│ 输入此端点的 API Key。                                       │
│                                                              │
│ API Key：sk-or-v1-••••••••••••••••_                          │
│                                                              │
│ Enter 继续，Esc 返回上一级                                    │
└──────────────────────────────────────────────────────────────┘
```

验证：

- 必填。
- 去除首尾空白。

说明：

- 输入可先使用与相邻流程一致的标准文本输入行为。
- 预览界面应遮盖 API Key。

### 步骤 4：输入模型 ID

```text
┌──────────────────────────────────────────────────────────────┐
│ 自定义 API Key · 模型 ID                                     │
│                                                              │
│ 协议：OpenAI 兼容                                             │
│ 端点：https://openrouter.ai/api/v1                           │
│                                                              │
│ 输入一个或多个模型 ID，用逗号分隔。                           │
│                                                              │
│ 模型 ID：qwen/qwen3-coder,openai/gpt-4.1_                    │
│                                                              │
│ Enter 继续，Esc 返回上一级                                    │
└──────────────────────────────────────────────────────────────┘
```

验证：

- 必填。
- 按逗号分割。
- 修剪每个模型 ID。
- 移除空条目。
- 去重，保持顺序。
- 必须至少有一个模型 ID。

模型命名：

- `id` 和 `name` 应相同。
- 不要求用户输入单独的提供商名称。

示例：

```text
输入：
qwen/qwen3-coder, openai/gpt-4.1, qwen/qwen3-coder

规范化：
qwen/qwen3-coder, openai/gpt-4.1
```

### 步骤 5：预览 JSON

保存前，显示将被写入或合并到 `settings.json` 中的 JSON 片段。

OpenAI 兼容示例：

```text
┌──────────────────────────────────────────────────────────────┐
│ 自定义 API Key · 预览                                        │
│                                                              │
│ 以下 JSON 将保存到 settings.json:                             │
│                                                              │
│ {                                                            │
│   "env": {                                                   │
│     "QWEN_CUSTOM_API_KEY_OPENAI_HTTPS_OPENROUTER_AI_API_V1":│
│       "sk-••••••••••••••••"                                  │
│   },                                                         │
│   "modelProviders": {                                        │
│     "openai": [                                              │
│       {                                                      │
│         "id": "qwen/qwen3-coder",                           │
│         "name": "qwen/qwen3-coder",                         │
│         "baseUrl": "https://openrouter.ai/api/v1",          │
│         "envKey": "QWEN_CUSTOM_API_KEY_OPENAI_HTTPS_OPENROUTER_AI_API_V1"│
│       }                                                      │
│     ]                                                        │
│   },                                                         │
│   "security": {                                              │
│     "auth": {                                                │
│       "selectedType": "openai"                              │
│     }                                                        │
│   },                                                         │
│   "model": {                                                 │
│     "name": "qwen/qwen3-coder"                              │
│   }                                                          │
│ }                                                            │
│                                                              │
│ Enter 保存，Esc 返回上一级                                    │
└──────────────────────────────────────────────────────────────┘
```

Anthropic 兼容示例：

```json
{
  "env": {
    "QWEN_CUSTOM_API_KEY_ANTHROPIC_HTTPS_API_ANTHROPIC_COM_V1": "sk-••••"
  },
  "modelProviders": {
    "anthropic": [
      {
        "id": "claude-sonnet-4-5",
        "name": "claude-sonnet-4-5",
        "baseUrl": "https://api.anthropic.com/v1",
        "envKey": "QWEN_CUSTOM_API_KEY_ANTHROPIC_HTTPS_API_ANTHROPIC_COM_V1"
      }
    ]
  },
  "security": {
    "auth": {
      "selectedType": "anthropic"
    }
  },
  "model": {
    "name": "claude-sonnet-4-5"
  }
}
```

显示的 JSON 应：

- 使用所选协议作为 `modelProviders` 键。
- 使用所选协议作为 `security.auth.selectedType`。
- 使用实际生成的 `envKey`。
- 遮盖 API Key。
- 使用用户输入的 `baseUrl`。
- 每个模型使用 `id === name`。
- `model.name` 设置为第一个规范化的模型 ID。

如果 JSON 在当前终端中过宽，允许换行。目标是透明，而非可复制粘贴的完美格式。

### 步骤 6：保存并认证

在预览界面按下 Enter：

```text
保存：
  env[generatedEnvKey] = apiKey
  modelProviders[selectedProtocol] = [
    ...新自定义配置（使用 generatedEnvKey），
    ...envKey !== generatedEnvKey 的现有配置
  ]
  security.auth.selectedType = selectedProtocol
  model.name = firstModelId
  reloadModelProvidersConfig()
  refreshAuth(selectedProtocol)
```

成功消息：

```text
自定义 API Key 认证成功。设置已更新，包含生成的 env key 和模型提供商配置。
提示：使用 /model 可在已配置的模型之间切换。
```

失败消息应保留现有的认证失败模式，并尽可能添加面向用户的提示：

```text
认证失败。消息：<错误>

请检查：
- 基础 URL 是否与所选协议兼容
- API Key 是否对该端点有效
- 模型 ID 是否存在于该提供商中
```

## Env Key 生成

向导不应要求用户输入 `envKey`。

Qwen 管理的 API Key 存储在 `settings.json.env` 中，因此 env key 应在 Qwen 特定命名空间下自动生成。这避免了与用户管理的 shell 环境变量冲突，并防止多个自定义端点互相覆盖。

### 格式

```text
QWEN_CUSTOM_API_KEY_${协议}_${规范化后的基础URL}
```

包含协议可避免同一端点在不通协议适配器下使用的冲突。

### 示例

```text
协议：openai
基础 URL：https://api.openai.com/v1
-> QWEN_CUSTOM_API_KEY_OPENAI_HTTPS_API_OPENAI_COM_V1

协议：openai
基础 URL：https://openrouter.ai/api/v1
-> QWEN_CUSTOM_API_KEY_OPENAI_HTTPS_OPENROUTER_AI_API_V1

协议：anthropic
基础 URL：https://api.anthropic.com/v1
-> QWEN_CUSTOM_API_KEY_ANTHROPIC_HTTPS_API_ANTHROPIC_COM_V1

协议：gemini
基础 URL：https://generativelanguage.googleapis.com
-> QWEN_CUSTOM_API_KEY_GEMINI_HTTPS_GENERATIVELANGUAGE_GOOGLEAPIS_COM

协议：openai
基础 URL：http://localhost:11434/v1
-> QWEN_CUSTOM_API_KEY_OPENAI_HTTP_LOCALHOST_11434_V1
```

### 规范化规则

```text
protocol
  -> 修剪
  -> 转大写
  -> 将每个非 A-Z / 0-9 字符替换为 _

baseUrl
  -> 修剪
  -> 转大写
  -> 将每个非 A-Z / 0-9 字符替换为 _
  -> 合并连续 _ 字符
  -> 移除首尾 _

return QWEN_CUSTOM_API_KEY_${规范化后的PROTOCOL}_${规范化后的BASEURL}
```

伪代码：

```ts
function generateCustomApiKeyEnvKey(protocol: string, baseUrl: string): string {
  const normalize = (value: string) =>
    value
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_+|_+$/g, '');

  return `QWEN_CUSTOM_API_KEY_${normalize(protocol)}_${normalize(baseUrl)}`;
}
```
## 设置写入设计

给定用户输入：

```text
Protocol: openai
Base URL: https://openrouter.ai/api/v1
API key: sk-or-v1-xxx
Model IDs: qwen/qwen3-coder,openai/gpt-4.1
```

向导应生成：

```json
{
  "env": {
    "QWEN_CUSTOM_API_KEY_OPENAI_HTTPS_OPENROUTER_AI_API_V1": "sk-or-v1-xxx"
  },
  "modelProviders": {
    "openai": [
      {
        "id": "qwen/qwen3-coder",
        "name": "qwen/qwen3-coder",
        "baseUrl": "https://openrouter.ai/api/v1",
        "envKey": "QWEN_CUSTOM_API_KEY_OPENAI_HTTPS_OPENROUTER_AI_API_V1"
      },
      {
        "id": "openai/gpt-4.1",
        "name": "openai/gpt-4.1",
        "baseUrl": "https://openrouter.ai/api/v1",
        "envKey": "QWEN_CUSTOM_API_KEY_OPENAI_HTTPS_OPENROUTER_AI_API_V1"
      }
    ]
  },
  "security": {
    "auth": {
      "selectedType": "openai"
    }
  },
  "model": {
    "name": "qwen/qwen3-coder"
  }
}
```

对于 `anthropic`，使用相同结构，区别如下：

```text
modelProviders.anthropic
security.auth.selectedType = anthropic
refreshAuth(anthropic)
```

对于 `gemini`，使用相同结构，区别如下：

```text
modelProviders.gemini
security.auth.selectedType = gemini
refreshAuth(gemini)
```

### 持久化作用域

采用与模型选择及现有API key流程相同的持久化作用域策略：

```text
getPersistScopeForModelSelection(settings)
```

这使得行为与现有的 `modelProviders` 所有权规则保持一致。

### 备份

在写入之前，备份目标设置文件，与现有的 Coding Plan 和 ModelStudio Standard 流程一致。

### 同步环境变量

在写入 `settings.json.env[generatedEnvKey]` 之后，立即同步：

```text
process.env[generatedEnvKey] = apiKey
```

这确保 `refreshAuth(selectedProtocol)` 在同一会话中能使用新输入的 key。

### 模型提供者合并规则

对于生成的环境变量 key：

```text
generatedEnvKey = QWEN_CUSTOM_API_KEY_${PROTOCOL}_${NORMALIZED_BASE_URL}
```

按如下方式更新 `modelProviders[selectedProtocol]`：

```text
newConfigs = normalizedModelIds.map(modelId => ({
  id: modelId,
  name: modelId,
  baseUrl,
  envKey: generatedEnvKey,
}))

existingConfigs = settings.merged.modelProviders?.[selectedProtocol] ?? []

preservedConfigs = existingConfigs.filter(config =>
  config.envKey !== generatedEnvKey
)

updatedConfigs = [
  ...newConfigs,
  ...preservedConfigs,
]
```

理由：

- 重新配置相同的协议 + `baseUrl` 会替换该端点的旧模型。
- 配置不同的协议或 `baseUrl` 会使用不同的环境变量 key，不会覆盖之前的自定义端点。
- Coding Plan、ModelStudio Standard 和其他用户配置会被保留，除非它们在同一协议下使用了相同的生成环境变量 key。
- 新的配置放在前面，以便新配置的模型立即可见并被默认选中。

## 错误处理

### 协议验证错误

协议必须是以下之一：

```text
openai
anthropic
gemini
```

### Base URL 验证错误

```text
Base URL 不能为空。
```

```text
Base URL 必须以 http:// 或 https:// 开头。
```

### API key 验证错误

```text
API key 不能为空。
```

### Model IDs 验证错误

```text
Model IDs 不能为空。
```

### 认证失败

尽可能使用现有的失败处理机制，但面向用户的错误信息应帮助用户恢复：

```text
认证失败。消息：<message>

请检查：
- Base URL 是否与所选协议兼容
- API key 是否对该端点有效
- Model ID 是否存在于该提供者中
```

## 文档链接

向导仍应为高级用户展示现有的模型提供者文档。

建议放置位置：

- 在审核页面的底部，或
- 作为 Base URL 页面的辅助文本。

建议文案：

```text
需要高级 generationConfig 或 capabilities？请参阅：
https://qwenlm.github.io/qwen-code-docs/en/users/configuration/model-providers/
```

## 实现说明

预期的 `AuthDialog` 视图层级：

```ts
type ViewLevel =
  | 'main'
  | 'region-select'
  | 'api-key-input'
  | 'api-key-type-select'
  | 'alibaba-standard-region-select'
  | 'alibaba-standard-api-key-input'
  | 'alibaba-standard-model-id-input'
  | 'custom-protocol-select'
  | 'custom-base-url-input'
  | 'custom-api-key-input'
  | 'custom-model-id-input'
  | 'custom-review-json';
```

预期的自定义协议类型：

```ts
type CustomApiProtocol =
  | AuthType.USE_OPENAI
  | AuthType.USE_ANTHROPIC
  | AuthType.USE_GEMINI;
```

`AuthDialog` 中预期的新状态：

```ts
const [customProtocol, setCustomProtocol] = useState<CustomApiProtocol>(
  AuthType.USE_OPENAI,
);
const [customProtocolIndex, setCustomProtocolIndex] = useState<number>(0);
const [customBaseUrl, setCustomBaseUrl] = useState('');
const [customBaseUrlError, setCustomBaseUrlError] = useState<string | null>(
  null,
);
const [customApiKey, setCustomApiKey] = useState('');
const [customApiKeyError, setCustomApiKeyError] = useState<string | null>(null);
const [customModelIds, setCustomModelIds] = useState('');
const [customModelIdsError, setCustomModelIdsError] = useState<string | null>(
  null,
);
```

预期的新 UI 操作：

```ts
handleCustomApiKeySubmit: (
  protocol: CustomApiProtocol,
  baseUrl: string,
  apiKey: string,
  modelIdsInput: string,
) => Promise<void>;
```

预期的辅助函数：

```ts
generateCustomApiKeyEnvKey(protocol: string, baseUrl: string): string
normalizeCustomModelIds(modelIdsInput: string): string[]
maskApiKey(apiKey: string): string
```

## 验收标准

### 用户体验

- 选择 `/auth -> API Key -> Custom API Key` 会打开自定义向导，而不是仅文档页面。
- 自定义向导的第一步要求选择协议。
- 第二步要求输入 Base URL，并显示所选协议。
- 第三步要求输入 API key，并显示所选协议和端点。
- 第四步要求输入 Model IDs，并显示所选协议和端点。
- 审核步骤显示生成的 JSON，包括掩码后的 API key、所选协议和生成的环境变量 key。
- 在审核步骤按回车键保存设置并尝试认证。
- 按 Esc 键每次回退一步。

### 设置

- API key 被写入 `settings.json.env[generatedEnvKey]`。
- `generatedEnvKey` 由所选协议和 `baseUrl` 派生，使用 Qwen 私有命名空间。
- `modelProviders[selectedProtocol]` 每个归一化的 model ID 对应一个条目。
- 每个自定义模型条目使用 `id === name`。
- `security.auth.selectedType` 设置为所选协议。
- `model.name` 设置为第一个归一化的 model ID。
- `modelProviders[selectedProtocol]` 中具有不同 `envKey` 的现有条目被保留。
- `modelProviders[selectedProtocol]` 中具有相同生成 `envKey` 的现有条目被替换。
- 其他 `modelProviders` 协议键下的条目被保留。

### 认证

- 生成的环境变量 key 在认证刷新前同步到 `process.env`。
- 应用在调用 `refreshAuth(selectedProtocol)` 之前重新加载模型提供者配置。
- 认证成功关闭认证对话框并显示成功消息。
- 认证失败让用户保持在认证流程中并显示可操作错误。

### 测试

- 添加或更新 `AuthDialog` 测试以覆盖自定义向导路径。
- 添加协议选择测试。
- 添加从协议和 Base URL 生成环境变量 key 的测试。
- 添加 Model ID 归一化和去重测试。
- 添加设置合并行为测试：
  - 同一生成的环境变量 key 会在同一协议下替换旧的自定义条目；
  - 不同的环境变量 key 被保留；
  - 其他协议键被保留；
  - Coding Plan 和 ModelStudio Standard 条目被保留。
- 在可行的情况下添加对生成的 JSON 预览内容的测试。

## 待解决问题

1. 输入 API key 时是否掩码，还是只在审核界面掩码？
2. 本地端点（如 `http://localhost:11434/v1`）是否允许空或占位符 API key，用于不需要认证的服务器？
3. 生成的 JSON 预览是仅显示正在应用的补丁，还是合并后最终相关设置子树的整体效果？
4. Vertex AI 是否应包含在此自定义 API key 向导中，还是由于其认证设置与简单的 API key 提供者不同而保持在外？

对于第一个版本，建议默认：

- 支持 `openai`、`anthropic` 和 `gemini`。
- 输入过程中使用现有输入行为。
- 要求非空 API key，以保持与 API key 认证流程一致。
- 显示将要保存或更新的补丁式 JSON。
- 将 Vertex AI 排除在自定义 API key 向导之外，直到有单独的产品决策。