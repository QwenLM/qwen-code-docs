# 自定义 API Key 认证向导 PRD

## 概述

改进 `/auth -> API Key -> Custom API Key` 的体验，将当前仅展示文档的静态页面替换为终端内的自定义 API 提供商设置向导。

Qwen Code 通过 `authType` / `modelProviders` 键支持多种 API 协议，包括 `openai`、`anthropic` 和 `gemini`。因此，自定义设置向导应先让用户选择协议，再收集该协议对应的 endpoint、密钥和模型信息。

向导引导用户完成以下步骤：

```text
Select Protocol -> Enter Base URL -> Enter API Key -> Enter Model IDs -> Review JSON -> Save + authenticate
```

这使自定义 API key 的设置流程保留在 Qwen Code 内部，减少手动编辑 `settings.json` 的需求，并通过在保存前展示生成的 JSON 让最终配置透明可见。

## 背景

目前，在 `/auth` 中选择 `Custom API Key` 会显示一个静态信息页面：

```text
Custom Configuration

You can configure your API key and models in settings.json

Refer to the documentation for setup instructions
https://qwenlm.github.io/qwen-code-docs/en/users/configuration/model-providers/

Esc to go back
```

这要求用户离开 CLI、阅读文档、理解 `settings.json`、手动配置 `modelProviders`、选择 `envKey`、添加 API key，再返回 Qwen Code。用户反映此流程繁琐，与 `/auth` 其他部分的体验脱节。

当前 ModelStudio 标准 API key 路径已提供引导式设置流程：

```text
Alibaba Cloud ModelStudio Standard API Key
└─ Select Region
   └─ Enter API Key
      └─ Enter Model IDs
         └─ Save + authenticate
```

自定义 API key 的设置应提供类似的引导体验，同时兼顾 Qwen Code 支持多种提供商协议的特点。

## 问题陈述

自定义 API key 路径目前在 `/auth` 中是一个死胡同：

```text
/auth
└─ Select Authentication Method
   ├─ Alibaba Cloud Coding Plan
   ├─ API Key
   │  └─ Select API Key Type
   │     ├─ Alibaba Cloud ModelStudio Standard API Key
   │     │  ├─ Select Region
   │     │  ├─ Enter API Key
   │     │  ├─ Enter Model IDs
   │     │  └─ Save + authenticate
   │     │
   │     └─ Custom API Key
   │        └─ Documentation-only screen
   │
   └─ Qwen OAuth
```

这带来了以下可用性问题：

- 用户无法在 `/auth` 中完成自定义提供商的设置。
- 用户需要先理解底层配置概念才能完成认证。
- 用户可能不清楚哪些字段是必填的：`authType`、`baseUrl`、`envKey`、`modelProviders`、`model.name` 和 `security.auth.selectedType`。
- 用户可能意外与现有环境变量冲突，或覆盖已有的提供商配置。
- 手动编辑设置后，用户无法立即获得认证反馈。

## 目标

1. 让用户完全在 `/auth` 内配置自定义 API 提供商。
2. 支持 Qwen Code 在 `modelProviders` 中支持的主要协议：`openai`、`anthropic` 和 `gemini`。
3. 保持流程与现有 ModelStudio Standard 流程一致。
4. 将 `baseUrl` 作为自定义提供商中等效于 `region` 的概念。
5. 根据所选协议和输入的 `baseUrl` 自动生成 Qwen 托管的私有 `envKey`。
6. 将 API key 存储在 `settings.json.env` 下，与当前 Qwen 托管凭证模式保持一致。
7. 通过使用 Qwen 特定的生成键名，避免与用户 shell 环境变量冲突。
8. 在保存前展示生成的 JSON，让用户审查确切的设置变更。
9. 保留不相关的现有 `modelProviders` 条目。
10. 保存后立即进行认证，并显示成功或失败的反馈。

## 非目标

1. 不要求用户手动输入 `envKey`。
2. 不将提供商名称作为单独概念引入。
3. 不在向导中添加高级 `generationConfig`、`capabilities` 或单模型覆盖配置。
4. 不完全移除文档链接；高级配置仍应保留该链接。
5. 不更改现有的 Coding Plan 或 ModelStudio Standard API key 流程。
6. 第一版不尝试从 `baseUrl` 自动检测协议；用户需显式选择协议。

## 目标用户

- 使用自定义 API endpoint 的用户。
- 配置 OpenAI 兼容 API、Anthropic 兼容 API、Gemini 兼容 API、vLLM、Ollama、LM Studio 或内部网关等提供商的用户。
- 更倾向于通过 CLI 设置认证而非手动编辑 `settings.json` 的用户。

## 支持的协议

向导初始应提供以下协议选项：

```text
openai
anthropic
gemini
```

每种协议直接映射到一个 `modelProviders` 键和 `security.auth.selectedType` 值。

| 协议选项             | Auth type / modelProviders 键  | 说明                                                                              |
| -------------------- | ------------------------------ | --------------------------------------------------------------------------------- |
| OpenAI-compatible    | `openai`                       | OpenAI、OpenRouter、Fireworks、本地 OpenAI 兼容服务器、内部网关 |
| Anthropic-compatible | `anthropic`                    | Anthropic 兼容 endpoint                                                    |
| Gemini-compatible    | `gemini`                       | Gemini 兼容 endpoint                                                       |

## 用户体验概述

### 更新后的 `/auth` 结构树

```text
/auth
└─ Select Authentication Method
   ├─ Alibaba Cloud Coding Plan
   │  └─ Select Region
   │     └─ Enter API Key
   │        └─ Save + authenticate
   │
   ├─ API Key
   │  └─ Select API Key Type
   │     ├─ Alibaba Cloud ModelStudio Standard API Key
   │     │  ├─ Select Region
   │     │  ├─ Enter API Key
   │     │  ├─ Enter Model IDs
   │     │  └─ Save + authenticate
   │     │
   │     └─ Custom API Key
   │        ├─ Select Protocol
   │        ├─ Enter Base URL
   │        ├─ Enter API Key
   │        ├─ Enter Model IDs
   │        ├─ Review generated JSON
   │        └─ Save + authenticate
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
      │ generate envKey from protocol + baseUrl
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
save settings + refreshAuth(selectedProtocol)
```

### Esc 返回行为

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
│ Custom API Key · Select Protocol                             │
│                                                              │
│  ◉ OpenAI-compatible                                         │
│    OpenAI, OpenRouter, Fireworks, vLLM, Ollama, LM Studio    │
│                                                              │
│  ○ Anthropic-compatible                                      │
│    Anthropic-compatible endpoints                            │
│                                                              │
│  ○ Gemini-compatible                                         │
│    Gemini-compatible endpoints                               │
│                                                              │
│ Enter to select, ↑↓ to navigate, Esc to go back              │
└──────────────────────────────────────────────────────────────┘
```

所选协议决定：

- 要更新的 `modelProviders` 键。
- 要持久化的 `security.auth.selectedType` 值。
- 后续页面显示的协议标签。
- 保存后 `refreshAuth()` 使用的 auth type。

### 步骤 2：输入 Base URL

`baseUrl` 是自定义提供商中等效于区域选择的概念。它应在 API key 输入之前，因为它决定了 API key 所属的 endpoint。

OpenAI-compatible：

```text
┌──────────────────────────────────────────────────────────────┐
│ Custom API Key · Base URL                                    │
│                                                              │
│ Protocol: OpenAI-compatible                                  │
│                                                              │
│ Enter the OpenAI-compatible API endpoint.                    │
│                                                              │
│ Base URL: https://openrouter.ai/api/v1_                      │
│                                                              │
│ Examples:                                                    │
│   OpenAI:      https://api.openai.com/v1                     │
│   OpenRouter: https://openrouter.ai/api/v1                   │
│   Fireworks:  https://api.fireworks.ai/inference/v1          │
│   Ollama:     http://localhost:11434/v1                      │
│   LM Studio:  http://localhost:1234/v1                       │
│                                                              │
│ Enter to continue, Esc to go back                            │
└──────────────────────────────────────────────────────────────┘
```

Anthropic-compatible：

```text
┌──────────────────────────────────────────────────────────────┐
│ Custom API Key · Base URL                                    │
│                                                              │
│ Protocol: Anthropic-compatible                               │
│                                                              │
│ Enter the Anthropic-compatible API endpoint.                 │
│                                                              │
│ Base URL: https://api.anthropic.com/v1_                      │
│                                                              │
│ Enter to continue, Esc to go back                            │
└──────────────────────────────────────────────────────────────┘
```

Gemini-compatible：

```text
┌──────────────────────────────────────────────────────────────┐
│ Custom API Key · Base URL                                    │
│                                                              │
│ Protocol: Gemini-compatible                                  │
│                                                              │
│ Enter the Gemini-compatible API endpoint.                    │
│                                                              │
│ Base URL: https://generativelanguage.googleapis.com_         │
│                                                              │
│ Enter to continue, Esc to go back                            │
└──────────────────────────────────────────────────────────────┘
```

验证规则：

- 必填。
- 必须以 `http://` 或 `https://` 开头。
- 去除首尾空白字符。
- 保留去除空白后的原始字符串，不做其他修改。

提交有效值后：

- 根据所选协议和 `baseUrl` 生成 Qwen 托管的 `envKey`。
- 进入 API key 输入步骤。

### 步骤 3：输入 API Key

```text
┌──────────────────────────────────────────────────────────────┐
│ Custom API Key · API Key                                     │
│                                                              │
│ Protocol: OpenAI-compatible                                  │
│ Endpoint: https://openrouter.ai/api/v1                       │
│                                                              │
│ Enter the API key for this endpoint.                         │
│                                                              │
│ API key: sk-or-v1-••••••••••••••••_                          │
│                                                              │
│ Enter to continue, Esc to go back                            │
└──────────────────────────────────────────────────────────────┘
```

验证规则：

- 必填。
- 去除首尾空白字符。

说明：

- 输入框可沿用现有的文本输入行为，以保持与相邻流程的一致性。
- 审查页面应对 API key 进行脱敏处理。

### 步骤 4：输入 Model ID

```text
┌──────────────────────────────────────────────────────────────┐
│ Custom API Key · Model IDs                                   │
│                                                              │
│ Protocol: OpenAI-compatible                                  │
│ Endpoint: https://openrouter.ai/api/v1                       │
│                                                              │
│ Enter one or more model IDs, separated by commas.            │
│                                                              │
│ Model IDs: qwen/qwen3-coder,openai/gpt-4.1_                  │
│                                                              │
│ Enter to continue, Esc to go back                            │
└──────────────────────────────────────────────────────────────┘
```

验证规则：

- 必填。
- 以逗号分割。
- 去除每个 model ID 的首尾空白。
- 移除空条目。
- 去重并保留原始顺序。
- 至少保留一个 model ID。

模型命名：

- `id` 和 `name` 应相同。
- 不向用户请求单独的提供商名称。

示例：

```text
Input:
qwen/qwen3-coder, openai/gpt-4.1, qwen/qwen3-coder

Normalized:
qwen/qwen3-coder, openai/gpt-4.1
```

### 步骤 5：审查 JSON

保存前，展示将写入或合并到 `settings.json` 的生成 JSON 片段。

OpenAI-compatible 示例：

```text
┌──────────────────────────────────────────────────────────────┐
│ Custom API Key · Review                                      │
│                                                              │
│ The following JSON will be saved to settings.json:           │
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
│ Enter to save, Esc to go back                                │
└──────────────────────────────────────────────────────────────┘
```

Anthropic-compatible 示例：

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

展示的 JSON 应：

- 使用所选协议作为 `modelProviders` 键。
- 使用所选协议作为 `security.auth.selectedType`。
- 使用实际生成的 `envKey`。
- 对 API key 进行脱敏处理。
- 使用用户输入的 `baseUrl`。
- 每个模型使用 `id === name`。
- 将 `model.name` 设置为第一个规范化后的 model ID。

如果 JSON 宽度超出当前终端，允许换行。目标是透明展示，而非追求完美的复制粘贴格式。

### 步骤 6：保存并认证

在审查页面按下 Enter：

```text
save:
  env[generatedEnvKey] = apiKey
  modelProviders[selectedProtocol] = [
    ...new custom configs using generatedEnvKey,
    ...existing configs whose envKey !== generatedEnvKey
  ]
  security.auth.selectedType = selectedProtocol
  model.name = firstModelId
  reloadModelProvidersConfig()
  refreshAuth(selectedProtocol)
```

成功消息：

```text
Custom API Key authenticated successfully. Settings updated with generated env key and model provider config.
Tip: Use /model to switch between configured models.
```

失败消息应沿用现有的认证失败模式，并尽可能提供用户可操作的提示：

```text
Failed to authenticate. Message: <error>

Please check:
- Base URL is compatible with the selected protocol
- API key is valid for this endpoint
- Model ID exists for this provider
```

## Env Key 生成规则

向导不应要求用户输入 `envKey`。

Qwen 托管的 API key 存储在 `settings.json.env` 中，因此 env key 应在 Qwen 专属命名空间下自动生成。这可避免与用户管理的 shell 环境变量冲突，并防止多个自定义 endpoint 互相覆盖。

### 格式

```text
QWEN_CUSTOM_API_KEY_${PROTOCOL}_${NORMALIZED_BASE_URL}
```

包含协议可避免同一 endpoint 在不同协议适配器下产生冲突。

### 示例

```text
Protocol: openai
Base URL: https://api.openai.com/v1
-> QWEN_CUSTOM_API_KEY_OPENAI_HTTPS_API_OPENAI_COM_V1

Protocol: openai
Base URL: https://openrouter.ai/api/v1
-> QWEN_CUSTOM_API_KEY_OPENAI_HTTPS_OPENROUTER_AI_API_V1

Protocol: anthropic
Base URL: https://api.anthropic.com/v1
-> QWEN_CUSTOM_API_KEY_ANTHROPIC_HTTPS_API_ANTHROPIC_COM_V1

Protocol: gemini
Base URL: https://generativelanguage.googleapis.com
-> QWEN_CUSTOM_API_KEY_GEMINI_HTTPS_GENERATIVELANGUAGE_GOOGLEAPIS_COM

Protocol: openai
Base URL: http://localhost:11434/v1
-> QWEN_CUSTOM_API_KEY_OPENAI_HTTP_LOCALHOST_11434_V1
```

### 规范化规则

```text
protocol
  -> trim
  -> uppercase
  -> replace every non A-Z / 0-9 character with _

baseUrl
  -> trim
  -> uppercase
  -> replace every non A-Z / 0-9 character with _
  -> collapse consecutive _ characters
  -> remove leading/trailing _

return QWEN_CUSTOM_API_KEY_${NORMALIZED_PROTOCOL}_${NORMALIZED_BASE_URL}
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

对于 `anthropic`，结构相同，区别在于：

```text
modelProviders.anthropic
security.auth.selectedType = anthropic
refreshAuth(anthropic)
```

对于 `gemini`，结构相同，区别在于：

```text
modelProviders.gemini
security.auth.selectedType = gemini
refreshAuth(gemini)
```

### 持久化范围

使用与模型选择及现有 API key 流程相同的持久化范围策略：

```text
getPersistScopeForModelSelection(settings)
```

这与现有 `modelProviders` 所有权规则保持一致。

### 备份

写入前，备份目标 settings 文件，与现有 Coding Plan 和 ModelStudio Standard 流程保持一致。

### 进程 env 同步

写入 `settings.json.env[generatedEnvKey]` 后，立即同步：

```text
process.env[generatedEnvKey] = apiKey
```

这确保 `refreshAuth(selectedProtocol)` 在同一会话中可使用新输入的密钥。

### 模型提供商合并规则

对于生成的 env key：

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

设计理由：

- 重新配置相同协议 + `baseUrl` 时，替换该 endpoint 下的旧模型。
- 配置不同协议或 `baseUrl` 时，使用不同的 env key，不覆盖之前的自定义 endpoint。
- Coding Plan、ModelStudio Standard 及其他用户配置得以保留，除非它们在相同协议下使用了相同的生成 env key。
- 新配置排在最前，使新配置的模型立即可见并默认选中。

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
Base URL cannot be empty.
```

```text
Base URL must start with http:// or https://.
```

### API key 验证错误

```text
API key cannot be empty.
```

### Model ID 验证错误

```text
Model IDs cannot be empty.
```

### 认证失败

尽量使用现有的失败机制，但用户可见的错误信息应帮助用户恢复：

```text
Failed to authenticate. Message: <message>

Please check:
- Base URL is compatible with the selected protocol
- API key is valid for this endpoint
- Model ID exists for this provider
```

## 文档链接

向导仍应为高级用户提供现有的 model providers 文档链接。

推荐放置位置：

- 审查页面的页脚，或
- Base URL 页面的次要文字处。

建议文案：

```text
Need advanced generationConfig or capabilities? See:
https://qwenlm.github.io/qwen-code-docs/en/users/configuration/model-providers/
```

## 实现说明

预期的 `AuthDialog` view level：

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

预期的新 UI action：

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

- 选择 `/auth -> API Key -> Custom API Key` 打开自定义向导，而非文档静态页面。
- 自定义向导第一步请求选择协议。
- 第二步请求 Base URL，并显示所选协议。
- 第三步请求 API key，并显示所选协议和 endpoint。
- 第四步请求 model ID，并显示所选协议和 endpoint。
- 审查步骤展示生成的 JSON，包括脱敏后的 API key、所选协议和生成的 env key。
- 在审查步骤按下 Enter 后保存设置并尝试认证。
- 按下 Esc 逐步返回上一步。

### 设置

- API key 写入 `settings.json.env[generatedEnvKey]`。
- `generatedEnvKey` 由所选协议和 `baseUrl` 通过 Qwen 私有命名空间派生。
- `modelProviders[selectedProtocol]` 为每个规范化后的 model ID 添加一条条目。
- 每个自定义模型条目使用 `id === name`。
- `security.auth.selectedType` 设置为所选协议。
- `model.name` 设置为第一个规范化后的 model ID。
- `modelProviders[selectedProtocol]` 下使用不同 `envKey` 的现有条目得以保留。
- `modelProviders[selectedProtocol]` 下使用相同生成 `envKey` 的现有条目被替换。
- 其他 `modelProviders` 协议键下的条目得以保留。

### 认证

- 认证刷新前，生成的 env key 同步到 `process.env`。
- 应用在 `refreshAuth(selectedProtocol)` 之前重新加载 model provider 配置。
- 认证成功后关闭认证对话框并显示成功消息。
- 认证失败后用户留在认证流程中，并显示可操作的错误提示。

### 测试

- 新增或更新 `AuthDialog` 测试以覆盖自定义向导路径。
- 新增协议选择的测试。
- 新增根据协议和 base URL 生成 env key 的测试。
- 新增 model ID 规范化和去重的测试。
- 新增设置合并行为的测试：
  - 相同生成 env key 替换同协议下的旧自定义条目；
  - 不同 env key 得以保留；
  - 其他协议键得以保留；
  - Coding Plan 和 ModelStudio Standard 条目得以保留。
- 在可行的情况下，新增生成 JSON 预览内容的测试。

## 待解决问题

1. API key 输入过程中是否应脱敏显示，还是仅在审查页面脱敏？
2. 对于不需要认证的服务器，`http://localhost:11434/v1` 等本地 endpoint 是否应允许空的或占位 API key？
3. 生成的 JSON 预览应仅展示本次变更的差量，还是合并后的完整相关设置子树？
4. Vertex AI 是否应纳入此自定义 API key 向导，还是因其认证设置与简单 API key 提供商不同而保留在外？

第一版推荐默认值：

- 支持 `openai`、`anthropic` 和 `gemini`。
- 输入过程中沿用现有输入行为。
- 为与 API key 认证流程保持一致，要求 API key 非空。
- 展示将保存或更新的差量式 JSON。
- 在单独的产品决策出台前，将 Vertex AI 排除在自定义 API key 向导之外。
