# 模型提供商

Qwen Code 允许你通过 `settings.json` 中的 `modelProviders` 设置来配置多个模型提供商。这使你能够使用 `/model` 命令在不同的 AI 模型和提供商之间切换。

## 概述

使用 `modelProviders` 为每个提供商 ID 声明模型，以便 `/model` 选择器可以在这些模型之间切换。每个键是一个提供商 ID，其值是 **一个模型定义数组**（`ModelConfig[]`）。对于内置提供商，该键必须是有效的身份验证类型（`openai`、`anthropic`、`gemini`、`vertex-ai`）；自定义提供商 ID（例如 `idealab`）也是允许的，只要你能通过顶层 [`providerProtocol`](#custom-provider-ids-providerprotocol) 设置将其映射到某个协议即可。每个模型条目都需要一个 `id`；`envKey` 是 **可选且推荐** 的（如果省略，则回退到身份验证类型的默认环境变量键，例如 `openai` 对应 `OPENAI_API_KEY`），此外还有可选的 `name`、`description`、`baseUrl` 和 `generationConfig`。凭据绝不会保存在设置中；运行时从 `process.env[envKey]` 读取它们。遗留的免费 Qwen OAuth 模型仍然是硬编码的，无法被覆盖。

> [!note]
>
> 早期预览版本曾将每个 provider 的模型包装在 `{ "protocol": ..., "models": [...] }` 对象中。该格式已被回退——当前值为本页展示的裸 `ModelConfig[]` 数组。在已迁移（`$version: 4`）的设置文件中，包装格式的条目会被静默跳过，因此请将任何旧配置更新为数组形式。

> [!note]
>
> 通过 `modelProviders` 配置 API 密钥提供商，然后使用 `/model` 进行选择。对于 Qwen 账户登录，请在 `/auth` 中选择 [**Qwen Account with Subscription**](https://chat.qwen.ai/?memberPlan=qwen_code)；无需 API 密钥或手动 `modelProviders` 配置。使用 `/model` 从你的订阅可用的模型中进行选择。有关登录说明，请参阅 [Authentication](./auth.md)。

> [!note]
>
> **模型唯一性：** 模型由其有效 API 协议、`id` 和配置的 `baseUrl` 标识。你可以同时使用 `wireApi: "chat-completions"` 和 `wireApi: "responses"` 定义相同的模型和 URL，也可以为同一模型和 API 使用不同的 URL。如果条目共享这三个值，则首次出现的条目生效，后续重复项将被跳过并发出警告。

> [!note]
>
> **热重载与重启：** 在 `settings.json` 中对 `modelProviders` 进行的编辑会被正在运行的交互式会话拾取而无需重启（文件监视器有约 300ms 的去抖动延迟；重新打开 `/model` 以查看新条目，当前选择会保留）。更改活动模型的 `wireApi` 会创建不同的路由；请显式选择该路由或重启以使用它。无效的 API 编辑会使之前的注册表保持可用。`providerProtocol` 仅在启动时读取一次，并且 **需要重启**。

### 图像生成路由

当路由可供内置 `image_gen` 工具使用时，设置 `supportsImageGeneration: true`。此功能独立于图像输入支持（如 `capabilities.vision` 或 `generationConfig.modalities.image`）。

当路由专用于图像生成且不得出现在普通模型选择器中时，使用 `imageOnly: true`。为了向后兼容，`imageOnly: true` 也隐含了图像生成功能，因此现有设置无需迁移。

双角色路由既可以作为主模型选择，也可以通过 `/model --image` 选择：

```json
{
  "modelProviders": {
    "openai": [
      {
        "id": "omni-model",
        "envKey": "MODEL_API_KEY",
        "baseUrl": "https://gateway.example.com/model-api",
        "supportsImageGeneration": true
      }
    ]
  }
}
```

专用图像路由会设置这两个字段。仅包含 `imageOnly: true` 的旧格式仍然有效：

```json
{
  "id": "image-model",
  "envKey": "MODEL_API_KEY",
  "baseUrl": "https://images.example.com/api/v1",
  "supportsImageGeneration": true,
  "imageOnly": true
}
```

所选路由必须声明显式的 HTTPS `baseUrl` 和非空的 `envKey`。图像生成使用该路由相同的端点和凭据；如果聊天和图像生成需要不同的端点或凭据，请配置两个路由。

### Live Voice 路由

在支持 DashScope Realtime（语音到语音）协议的路由上设置 `realtimeOnly: true`。此类路由绝不会作为聊天、快速、视觉、语音或图像模型提供；它只能通过 `experimental.liveVoice.model` 作为 Live Voice 模型选择（即 `modelId`，或者当同一 ID 存在于多个提供商下时为 `provider:modelId`）。

```json
{
  "modelProviders": {
    "openai": [
      {
        "id": "qwen3.5-omni-plus-realtime",
        "baseUrl": "https://dashscope.aliyuncs.com/compatible-mode/v1",
        "envKey": "DASHSCOPE_API_KEY",
        "realtimeOnly": true
      }
    ]
  },
  "experimental": {
    "liveVoice": {
      "enabled": true,
      "model": "qwen3.5-omni-plus-realtime",
      "voice": "Tina"
    }
  }
}
```

当所选模型指定了 `realtimeOnly` 路由时，Live Voice 通过该路由的 `envKey` 读取 API 密钥（首先检查进程环境，然后检查 `settings.json` 的 `env` 块），并从其 `baseUrl` 派生 WebSocket 端点（`https://<host>/compatible-mode/v1` 变为 `wss://<host>/api-ws/v1/realtime`）。该路由必须同时声明 `baseUrl` 和 `envKey`，且主机必须是 DashScope 端点。

以下两条规则是有意设计的：

- 工作区设置永远不会被查阅，仅查阅用户级和系统级设置。项目的 `.qwen/settings.json` 无法添加或重定向 Live Voice 路由。
- 匹配不到任何 `realtimeOnly` 路由的 **裸** `modelId` 像以前一样使用独立的 `experimental.liveVoice.endpoint` 和 `experimental.liveVoice.apiKey` 字段，因此现有设置保持不变即可正常工作。如果 `provider:modelId` 选择器指定的提供商存在但没有这样的路由，则视为错误：已删除或拼写错误的路由不会静默回退到存储的密钥。
- 当选择了某个路由时，`experimental.liveVoice.apiKey` 和 `experimental.liveVoice.endpoint` 未被使用，并且设置 API 拒绝存储新的值。

在独立路径上，Web Shell 的 Qwen Live 设置直接设置端点和模型。输入你的密钥所属区域或专用域的 OpenAI 兼容基础 URL，例如 `https://dashscope-intl.aliyuncs.com/compatible-mode/v1`；如果留空，Live 将使用北京（`https://dashscope.aliyuncs.com/compatible-mode/v1`），来自其他地方的密钥将被拒绝并显示 `401`。基础 URL 按原样存储，并在调用开始时转换为 `wss://<host>/api-ws/v1/realtime`；主机必须是 DashScope 或 `*.maas.aliyuncs.com` 端点。当 Live Voice 开启时，新端点在保存前会通过 Realtime 握手进行检查。

## 覆盖推理能力 [#override-reasoning-capabilities]

在模型条目上设置 `capabilities.reasoning` 以覆盖其推理格式、提供的努力层级和默认值。已知模型从所选端点的提供商目录继承省略的字段；例如，`"capabilities": { "reasoning": { "defaultEffort": "medium" } }` 使 DashScope `qwen3.8-max` 路由在未选择明确努力层级时使用 medium。对于未知别名，需声明所有三个字段：

```json
{
  "id": "company-model-v2",
  "baseUrl": "https://gateway.example.com/v1",
  "envKey": "COMPANY_MODEL_API_KEY",
  "capabilities": {
    "reasoning": {
      "profile": "openai-effort",
      "efforts": ["low", "medium", "high"],
      "defaultEffort": "medium"
    }
  }
}
```

`efforts` 替换 `low/medium/high/xhigh/max` 的支持子集。显式默认值必须属于该子集。配置文件复用现有格式：Chat 接受 `openai-effort`、`openai-reasoning`、`deepseek-openai`、`dashscope-effort`、`dashscope-thinking` 和 `qwen-chat-template`；Responses 接受 `openai-reasoning`；Anthropic 接受 `anthropic-manual`、`anthropic-adaptive` 和 `deepseek-anthropic`；Gemini/Vertex 使用 `gemini`。两个仅切换的配置文件省略 `efforts` 和 `defaultEffort`。Gemini 使用 low/medium/high。自适应配置文件即使配置了旧版手动预算也会选择自适应思考。现有的完整能力声明继续有效。

推理更改在下一次用户提示之前应用。其请求、重试和子代理共享捕获的推理配置。无效的更新保留之前的配置并记录模型/字段错误。新会话中的无效声明会安全地回退到现有的模型行为。`reasoning`、`samplingParams` 和 `extra_body` 中的显式用户选择和提供商原生覆盖保持其现有优先级；模型默认值不会作为用户选择保存。此机制不改变端点、凭据或图像模型的生命周期。

## 以下是针对不同认证类型的全面配置示例，展示了可用参数及其组合。

支持的认证类型

### 支持的认证类型

使用以下内置提供商 ID 之一，或通过 `providerProtocol` 映射自定义 ID：

| 有效协议 | 描述 |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `openai` | OpenAI 兼容 API。默认为 Chat Completions；将模型的 `wireApi` 设置为 `responses` 以使用 Responses API。 |
| `anthropic` | Google Gemini API |
| `gemini` | Google Gemini API |
| `vertex-ai` | Google Vertex AI（在 Vertex AI 模式下使用 `gemini` 协议和 `@google/genai` SDK；选择此项会设置 `GOOGLE_GENAI_USE_VERTEXAI=true`） |

> [!note]
> Vertex AI 条目可以使用 **Application Default Credentials** 进行认证。设置 `GOOGLE_CLOUD_PROJECT`（以及可选的 `GOOGLE_CLOUD_LOCATION`，默认为 `global`），并让 `envKey` 以及解析器读取的所有其他密钥来源保持未设置：`GOOGLE_API_KEY`、`settings.security.auth.apiKey` 和 CLI 密钥参数。任何传入 Vertex 条目的 API key 都会使 Google SDK 切换到 Vertex Express 模式，从而忽略项目、区域和 ADC 凭据。声明了 `envKey` 的条目绝不会转而使用 ADC，因此变量注入失败后会继续针对该变量报错，而不会静默改用其他主体进行认证。

> [!warning]
> 既不是内置协议也未通过 `providerProtocol` 映射的提供商 ID（例如拼写错误如 `"openai-custom"`）无法被路由，因此其整个条目会被**跳过**并显示警告——其模型不会出现在 `/model` 选择器中。对于内置提供商，请使用上述支持的身份验证类型值之一，或为自定义 ID 添加 [`providerProtocol`](#custom-provider-ids-providerprotocol) 映射。

### 自定义 provider id（`providerProtocol`） [#custom-provider-ids-providerprotocol]

内置 provider id（`openai`、`gemini`、`anthropic`、`vertex-ai`、`qwen-oauth`）会自动路由到其对应的 SDK 协议。要使用**自定义** provider id——例如将多个兼容 OpenAI 的端点归组到一个更友好的名称下——请在 `modelProviders` 中声明它，并通过顶层的 `providerProtocol` 设置将其映射到内置协议：

```json
{
  "modelProviders": {
    "idealab": [
      {
        "id": "my-model",
        "envKey": "IDEALAB_API_KEY",
        "baseUrl": "https://idealab.example.com/v1"
      }
    ]
  },
  "providerProtocol": {
    "idealab": "openai"
  }
}
```

如果没有匹配的 `providerProtocol` 条目，自定义 provider id 会被跳过（见上方警告）。

### 选择 OpenAI API

在 OpenAI 兼容模型上，将 `wireApi` 与 `id`、`envKey` 和 `baseUrl` 一起设置：

```json
{
  "modelProviders": {
    "openai": [
      {
        "id": "my-model",
        "wireApi": "responses",
        "envKey": "OPENAI_API_KEY",
        "baseUrl": "https://api.openai.com/v1"
      }
    ]
  },
  "security": { "auth": { "selectedType": "openai" } },
  "model": { "name": "my-model" }
}
```

支持的值为 `chat-completions` 和 `responses`。省略 `wireApi` 时，对 `openai` 使用 Chat Completions，包括映射到 `openai` 的自定义提供商。其他值，或在 Anthropic、Gemini、Vertex AI 或 Qwen OAuth 模型上使用 `wireApi`，均属于配置错误。

对于新配置，请使用 `openai` 配合每个模型的 `wireApi`。v0.23.3 版本中发布的 `modelProviders.openai-responses` 格式和 `providerProtocol` 到 `openai-responses` 的映射仍然可读。显式提供商映射优先于存储桶名称；显式 `wireApi` 优先于任一 OpenAI 协议。加载过程不会重写设置或更改凭据引用。重新配置将以新格式写入选定的路由，并仅移除可写范围内匹配的旧条目；包含点的提供商 ID 下的条目保持不变，无关的模型、端点、API 和作用域也保持不变。`api` 不是 `wireApi` 的别名。

`wireApi` 是本地路由元数据；它不属于 `generationConfig` 或 `extra_body`，也不会包含在请求体中。新的自定义设置在两个 API 之间共享同一 OpenAI 端点的一个凭据槽位，因此轮换该密钥会同时更新两条路由。手动配置的模型在需要独立凭据时可以使用不同的显式 `envKey` 引用。在 `/auth` → Custom Provider 中，选择 OpenAI-compatible，然后选择 API 格式。

启动时，当所选配置端点上没有匹配的 Chat 路由时，`selectedType: "openai"` 可以解析显式配置了 `wireApi: "responses"` 的模型。模型选择器和记录的会话保留有效协议（`openai` 或 `openai-responses`），以便可以独立选择和恢复这两条路由。当 API 请求失败时，不会进行端点检测或自动回退。

### 用于 API 请求的传输方式

有效模型协议决定传输方式。两种 OpenAI API 都使用 `openai` 提供商组；`wireApi` 选择 Chat Completions 或 Responses：

| 有效协议 | 传输方式 |
| ------------------ | ------------------------------------------------------------------------------------------------------------------ |
| `openai` | [`openai`](https://www.npmjs.com/package/openai) - 官方 OpenAI Node.js SDK |
| `openai-responses` | 直接 HTTP/SSE 调用 `/v1/responses`（无 SDK）；嵌入使用 [`openai`](https://www.npmjs.com/package/openai) |
| `anthropic` | [`@anthropic-ai/sdk`](https://www.npmjs.com/package/@anthropic-ai/sdk) - 官方 Google GenAI SDK |
| `gemini` | [`@google/genai`](https://www.npmjs.com/package/@google/genai) 配合自定义提供商（DashScope 兼容） |
| `qwen-oauth` | 带有自定义提供商（DashScope 兼容）的 [`openai`](https://www.npmjs.com/package/openai) |

这意味着你配置的 `baseUrl` 应与相应传输方式预期的 API 格式兼容。例如，`wireApi: "responses"` 需要一个兼容 Responses 的端点。

### 兼容 OpenAI 的提供商 (`openai`)

此 auth type 不仅支持 OpenAI 的官方 API，还支持任何兼容 OpenAI 的端点，包括 OpenRouter 和 Requesty 等聚合模型提供商。

```json
{
  "env": {
    "OPENAI_API_KEY": "sk-your-actual-openai-key-here",
    "OPENROUTER_API_KEY": "sk-or-your-actual-openrouter-key-here",
    "REQUESTY_API_KEY": "sk-your-actual-requesty-key-here"
  },
  "modelProviders": {
    "openai": [
      {
        "id": "gpt-4o",
        "name": "GPT-4o",
        "envKey": "OPENAI_API_KEY",
        "baseUrl": "https://api.openai.com/v1",
        "generationConfig": {
          "timeout": 60000,
          "maxRetries": 3,
          "retryInitialDelayMs": 3000,
          "retryMaxDelayMs": 30000,
          "enableCacheControl": true,
          "contextWindowSize": 128000,
          "modalities": {
            "image": true
          },
          "customHeaders": {
            "X-Client-Request-ID": "req-123"
          },
          "extra_body": {
            "enable_thinking": true,
            "service_tier": "priority"
          },
          "samplingParams": {
            "temperature": 0.2,
            "top_p": 0.8,
            "max_tokens": 4096,
            "presence_penalty": 0.1,
            "frequency_penalty": 0.1
          }
        }
      },
      {
        "id": "gpt-4o-mini",
        "name": "GPT-4o Mini",
        "envKey": "OPENAI_API_KEY",
        "baseUrl": "https://api.openai.com/v1",
        "generationConfig": {
          "timeout": 30000,
          "samplingParams": {
            "temperature": 0.5,
            "max_tokens": 2048
          }
        }
      },
      {
        "id": "openai/gpt-4o",
        "name": "GPT-4o (via OpenRouter)",
        "envKey": "OPENROUTER_API_KEY",
        "baseUrl": "https://openrouter.ai/api/v1",
        "generationConfig": {
          "timeout": 120000,
          "maxRetries": 3,
          "samplingParams": {
            "temperature": 0.7
          }
        }
      },
      {
        "id": "openai/gpt-4o-mini",
        "name": "GPT-4o Mini (via Requesty)",
        "envKey": "REQUESTY_API_KEY",
        "baseUrl": "https://router.requesty.ai/v1",
        "generationConfig": {
          "timeout": 120000,
          "maxRetries": 3,
          "samplingParams": {
            "temperature": 0.7
          }
        }
      }
    ]
  }
}
```

当指向托管的 OpenAI 兼容网关时，将 `baseUrl` 设置为 API 的 `/v1` 根路径（例如 `https://gateway.example.com/v1`），而不是完整的 `/v1/chat/completions` 路径——SDK 会自动追加请求路径。

### OpenAI Responses API (`openai-responses`)

使用 `openai` 配合 `wireApi: "responses"` 以定位 OpenAI 的 `/v1/responses` 端点。当端点返回带有可见思维文本的加密推理时，它会跨轮次重放先前轮次的推理并通过 `reasoning.encrypted_content` 进行 `--resume`。流式传输 `response.reasoning_text.delta` 的兼容端点也会显示其推理内容，但没有 `encrypted_content` 的端点无法重放不透明的推理状态。使用 `reasoning.effort`（而不是 Chat Completions 线路使用的 `extra_body.enable_thinking`）来控制推理强度。

```json
{
  "env": {
    "OPENAI_API_KEY": "sk-your-actual-openai-key-here"
  },
  "modelProviders": {
    "openai": [
      {
        "id": "gpt-5.1",
        "wireApi": "responses",
        "name": "GPT-5.1 (Responses API)",
        "envKey": "OPENAI_API_KEY",
        "baseUrl": "https://api.openai.com/v1",
        "generationConfig": {
          "timeout": 60000,
          "reasoning": {
            "effort": "high"
          },
          "samplingParams": {
            "temperature": 0.7,
            "max_tokens": 4096
          }
        }
      }
    ]
  }
}
```

> [!note]
> 此处的 `extra_body` 仅用于填充：只有当生成的请求中没有该键的值时，才会将其写入请求体，因此它无法覆盖流水线已设置的字段（`model`、`input`、`reasoning`、`temperature`、`max_output_tokens` 等）。遗留的 `enable_thinking` 键是唯一的例外——它会被移除而不是转发（因为它不是 Responses API 字段），并且在未显式设置 `reasoning` 时转换为 `reasoning.effort: "medium"`。对于此提供商，请直接设置 `reasoning.effort` 而不是 `extra_body.enable_thinking`。

### Anthropic (`anthropic`)

Claude Opus 5.5、Sonnet 5.5、Fable 5.1 和 Mythos 5.1 拒绝强制工具选择。对于这些模型上的结构化侧查询，Qwen Code 使用自动工具选择以及显式的模式响应指令。支持强制选择的模型保留此功能。自动选择不保证工具调用；JSON 侧查询也可以从响应文本中读取原始 JSON 对象，而不包含 Markdown 围栏或周围文字。参见 [Anthropic 的工具选择限制](https://platform.claude.com/docs/en/agents-and-tools/tool-use/define-tools#forcing-tool-use)。

```json
{
  "env": {
    "ANTHROPIC_API_KEY": "sk-ant-your-actual-anthropic-key-here"
  },
  "modelProviders": {
    "anthropic": [
      {
        "id": "claude-3-5-sonnet",
        "name": "Claude 3.5 Sonnet",
        "envKey": "ANTHROPIC_API_KEY",
        "baseUrl": "https://api.anthropic.com/v1",
        "generationConfig": {
          "timeout": 120000,
          "maxRetries": 3,
          "contextWindowSize": 200000,
          "samplingParams": {
            "temperature": 0.7,
            "max_tokens": 8192,
            "top_p": 0.9
          }
        }
      },
      {
        "id": "claude-3-opus",
        "name": "Claude 3 Opus",
        "envKey": "ANTHROPIC_API_KEY",
        "baseUrl": "https://api.anthropic.com/v1",
        "generationConfig": {
          "timeout": 180000,
          "samplingParams": {
            "temperature": 0.3,
            "max_tokens": 4096
          }
        }
      }
    ]
  }
}
```

### Google Gemini (`gemini`)

```json
{
  "env": {
    "GEMINI_API_KEY": "AIza-your-actual-gemini-key-here"
  },
  "modelProviders": {
    "gemini": [
      {
        "id": "gemini-2.0-flash",
        "name": "Gemini 2.0 Flash",
        "envKey": "GEMINI_API_KEY",
        "baseUrl": "https://generativelanguage.googleapis.com",
        "capabilities": {
          "vision": true
        },
        "generationConfig": {
          "timeout": 60000,
          "maxRetries": 2,
          "contextWindowSize": 1000000,
          "schemaCompliance": "auto",
          "samplingParams": {
            "temperature": 0.4,
            "top_p": 0.95,
            "max_tokens": 8192,
            "top_k": 40
          }
        }
      }
    ]
  }
}
```

对于也能遵循正常 Qwen Code agent 策略并使用工具的视觉模型，请同时启用两个 capabilities 以开启完整轮次的图像路由：

```json
"capabilities": {
  "vision": true,
  "agent": true
}
```

当纯文本主模型将该模型配置为视觉回退时，完整的带图像轮次会在该 provider、模型和端点上保持完整，跨越工具调用和重试。下一个独立轮次会返回到主模型，每个模型请求只接收其目标支持的媒体模态。省略 `agent`（或设为 `false`）则保留更安全的 Vision Bridge 转录流程。

### 本地自托管模型（通过兼容 OpenAI 的 API）

大多数本地推理服务器（vLLM、Ollama、LM Studio 等）都提供兼容 OpenAI 的 API 端点。使用 `openai` auth type 和本地 `baseUrl` 进行配置：

```json
{
  "env": {
    "OLLAMA_API_KEY": "ollama",
    "VLLM_API_KEY": "not-needed",
    "LMSTUDIO_API_KEY": "lm-studio"
  },
  "modelProviders": {
    "openai": [
      {
        "id": "qwen2.5-7b",
        "name": "Qwen2.5 7B (Ollama)",
        "envKey": "OLLAMA_API_KEY",
        "baseUrl": "http://localhost:11434/v1",
        "generationConfig": {
          "timeout": 300000,
          "streamIdleTimeoutMs": 600000,
          "maxRetries": 1,
          "contextWindowSize": 32768,
          "samplingParams": {
            "temperature": 0.7,
            "top_p": 0.9,
            "max_tokens": 4096
          }
        }
      },
      {
        "id": "llama-3.1-8b",
        "name": "Llama 3.1 8B (vLLM)",
        "envKey": "VLLM_API_KEY",
        "baseUrl": "http://localhost:8000/v1",
        "generationConfig": {
          "timeout": 120000,
          "maxRetries": 2,
          "contextWindowSize": 128000,
          "samplingParams": {
            "temperature": 0.6,
            "max_tokens": 8192
          }
        }
      },
      {
        "id": "local-model",
        "name": "Local Model (LM Studio)",
        "envKey": "LMSTUDIO_API_KEY",
        "baseUrl": "http://localhost:1234/v1",
        "generationConfig": {
          "timeout": 60000,
          "samplingParams": {
            "temperature": 0.5
          }
        }
      }
    ]
  }
}
```

对于排队或缓慢的本地 OpenAI 兼容服务器，`streamIdleTimeoutMs` 控制该模型在流式传输块之间可以保持沉默的时间长度。它覆盖了所选提供商条目的全局 `QWEN_STREAM_IDLE_TIMEOUT_MS` 值；将其设置为 `0` 可禁用空闲保护。除非提高或禁用 `QWEN_STREAM_MAX_LIFETIME_MS`，否则单独的 15 分钟流生命周期上限仍然适用。

对于不需要身份验证的本地服务器，您可以为 API 密钥使用任何占位符值：

```bash
# For Ollama (no auth required)
export OLLAMA_API_KEY="ollama"

# For vLLM (if no auth is configured)
export VLLM_API_KEY="not-needed"
```

> [!note]
>
> `extra_body` 参数**仅支持 OpenAI 兼容提供商**（`openai`、`qwen-oauth`）。它在 Anthropic 和 Gemini 提供商中被忽略。在 `openai-responses` 上，`enable_thinking` 键被转换而非转发——请参阅 [OpenAI Responses API](#openai-responses-api-openai-responses) 说明。

> [!note]
>
> **关于 `envKey`**：`envKey` 字段指定的是**环境变量的名称**，而不是实际的 API key 值。要使配置生效，你需要确保对应的环境变量已设置为你的真实 API key。有两种方法可以实现这一点：
>
> - **选项 1：使用 `.env` 文件**（出于安全考虑推荐）：
>   ```bash
>   # ~/.qwen/.env (or project root)
>   OPENAI_API_KEY=sk-your-actual-key-here
>   ```
>   请务必将 `.env` 添加到你的 `.gitignore` 中，以防止意外提交密钥。
> - **选项 2：在 `settings.json` 中使用 `env` 字段**（如上述示例所示）：
>   ```json
>   {
>     "env": {
>       "OPENAI_API_KEY": "sk-your-actual-key-here"
>     }
>   }
>   ```
>
> 每个提供商示例都包含一个 `env` 字段，以说明应如何配置 API key。

#### 以自定义模型名称提供的 Qwen3.x

思考控制和上下文窗口是根据模型 ID 推断的。如果 vLLM 或 SGLang 服务器以不以 `qwen` 开头的 ID（例如 `--served-model-name chat`）暴露 Qwen3.x 模型，则两者均不适用：自动模式权限分类器等侧请求会保持思考开启状态，且上下文窗口回退到默认的 200K。请在模型条目中声明这两项，如 [覆盖推理能力](#override-reasoning-capabilities) 中所述：

```json
{
  "id": "chat",
  "name": "Qwen3.6 35B A3B (vLLM)",
  "envKey": "VLLM_API_KEY",
  "baseUrl": "http://localhost:8000/v1",
  "capabilities": { "reasoning": { "profile": "qwen-chat-template" } },
  "generationConfig": { "contextWindowSize": 262144 }
}
```

`qwen-chat-template` 发送 `chat_template_kwargs.enable_thinking`，这些服务器将其传递给 Qwen 聊天模板；它们不会读取顶层的 `enable_thinking` 字段。将 `contextWindowSize` 设置为服务器的最大模型长度（vLLM 在 `/v1/models` 中将其报告为 `max_model_len`）。Qwen Code 在每个请求中都发送工具定义，因此服务器还需要启用工具调用和推理解析器；在 vLLM 上，这包括 `--enable-auto-tool-choice`、模型的 `--tool-call-parser`（例如 `qwen3_xml`）以及 `--reasoning-parser qwen3`。解析器名称在不同服务器版本之间可能会变化，请查阅您服务器的文档。

## 阿里云 Coding Plan

阿里云 Coding Plan 提供了一组针对编码任务优化的预配置 Qwen 模型。此功能适用于拥有阿里云 Coding Plan API 访问权限的用户，并提供简化的设置体验及自动模型配置更新。

### 概述

当你使用 `/auth` 命令通过阿里云 Coding Plan API key 进行身份验证时，Qwen Code 会自动配置以下模型：

| 模型 ID                | 名称                 | 描述                                               |
| ---------------------- | -------------------- | --------------------------------------------------------- |
| `qwen3.5-plus`         | qwen3.5-plus         | 启用思考功能的高级模型                      |
| `qwen3.6-plus`         | qwen3.6-plus         | 启用思考功能的最新模型（仅限 Pro 订阅用户） |
| `qwen3.7-plus`         | qwen3.7-plus         | 启用思考功能的高级模型                      |
| `qwen3-coder-plus`     | qwen3-coder-plus     | 针对编码任务优化                                |
| `qwen3-coder-next`     | qwen3-coder-next     | 实验性编码模型                                 |
| `qwen3-max-2026-01-23` | qwen3-max-2026-01-23 | 启用思考功能的最新 max 模型                    |
| `glm-5`                | glm-5                | 启用思考功能的 GLM 模型                           |
| `glm-4.7`              | glm-4.7              | 启用思考功能的 GLM 模型                           |
| `kimi-k2.5`            | kimi-k2.5            | 支持思考和视觉/视频的 Kimi 模型         |
| `MiniMax-M2.5`         | MiniMax-M2.5         | 启用思考功能的 MiniMax 模型                       |

### 设置

1. 获取阿里云 Coding Plan API key：
   - **中国**：<https://bailian.console.aliyun.com/?tab=model#/efm/coding_plan>
   - **国际**：<https://modelstudio.console.alibabacloud.com/?tab=dashboard#/efm/coding_plan>
2. 在 Qwen Code 中运行 `/auth` 命令
3. 选择 **Alibaba ModelStudio**，然后从子菜单中选择 **Coding Plan**
4. 选择你的区域
5. 根据提示输入你的 API key

这些模型将被自动配置并添加到你的 `/model` 选择器中。

### 区域

阿里云 Coding Plan 支持两个区域：

| 区域               | Endpoint                                        | 描述             |
| -------------------- | ----------------------------------------------- | ----------------------- |
| 中国                | `https://coding.dashscope.aliyuncs.com/v1`      | 中国大陆端点 |
| 全球/国际 | `https://coding-intl.dashscope.aliyuncs.com/v1` | 国际端点  |

区域在身份验证期间进行选择，并存储在 `settings.json` 的 `modelProviders` 配置下。要切换区域，请重新运行 `/auth` 命令并选择不同的区域。

### API Key 存储

当您通过 `/auth` 命令配置 Coding Plan 时，API 密钥使用保留的环境变量名 `BAILIAN_CODING_PLAN_API_KEY` 存储。默认情况下，它存储在您的 `settings.json` 文件的 `env` 字段中。

> [!warning]
>
> **安全建议**：为了提高安全性，建议将 API key 从 `settings.json` 移至单独的 `.env` 文件中，并将其作为环境变量加载。例如：
>
> ```bash
> # ~/.qwen/.env
> BAILIAN_CODING_PLAN_API_KEY=your-api-key-here
> ```
>
> 然后，如果你使用的是项目级设置，请确保将此文件添加到你的 `.gitignore` 中。

### 自动更新

Coding Plan 模型配置是有版本的。当 Qwen Code 检测到较新版本的模型模板时，系统将提示您进行更新。接受更新将：

- 用最新版本替换现有的 Coding Plan 模型配置
- 保留您手动添加的任何自定义模型配置
- 保持所选模型不变；如果它不再存在于更新后的配置中，请使用 `/model` 选择一个新的模型

更新过程会刷新模型配置和功能，而不会更改您选择的模型。

### 手动配置（高级）

如果你倾向于手动配置 Coding Plan 模型，可以像配置任何 OpenAI 兼容的 provider 一样将它们添加到 `settings.json` 中：

```json
{
  "modelProviders": {
    "openai": [
      {
        "id": "qwen3-coder-plus",
        "name": "qwen3-coder-plus",
        "description": "Qwen3-Coder via Alibaba Cloud Coding Plan",
        "envKey": "YOUR_CUSTOM_ENV_KEY",
        "baseUrl": "https://coding.dashscope.aliyuncs.com/v1"
      }
    ]
  }
}
```

> [!note]
>
> 使用手动配置时：
>
> - 你可以为 `envKey` 使用任何环境变量名
> - 你不需要配置 `codingPlan.*`
> - **自动更新不会应用**于手动配置的 Coding Plan 模型

> [!warning]
>
> 如果你同时使用了自动 Coding Plan 配置，当手动配置与自动配置使用相同的 `envKey` 和 `baseUrl` 时，自动更新可能会覆盖你的手动配置。为避免这种情况，请尽可能确保你的手动配置使用不同的 `envKey`。

## 解析层与原子性

有效的 auth/model/credential 值按字段使用以下优先级进行选择（优先采用首个存在的值）。你可以将 `--auth-type` 与 `--model` 结合使用，直接指向 provider 条目；这些 CLI flags 会在其他层之前运行。

| 层（最高 → 最低）   | authType                            | model                                           | apiKey                                                | baseUrl                                                | apiKeyEnvKey           | proxy                             |
| -------------------------- | ----------------------------------- | ----------------------------------------------- | ----------------------------------------------------- | ------------------------------------------------------ | ---------------------- | --------------------------------- |
| 编程覆盖     | `/auth`                             | `/auth` 输入                                   | `/auth` 输入                                         | `/auth` 输入                                          | —                      | —                                 |
| 模型 provider 选择   | —                                   | `modelProvider.id`                              | `env[modelProvider.envKey]`                           | `modelProvider.baseUrl`                                | `modelProvider.envKey` | —                                 |
| CLI 参数              | `--auth-type`                       | `--model`                                       | `--openai-api-key`                                    | `--openai-base-url`                                    | —                      | —                                 |
| 环境变量      | —                                   | Provider 特定映射（例如 `OPENAI_MODEL`） | Provider 特定映射（例如 `OPENAI_API_KEY`）     | Provider 特定映射（例如 `OPENAI_BASE_URL`）     | —                      | —                                 |
| 设置（`settings.json`） | `security.auth.selectedType`        | `model.name`                                    | `security.auth.apiKey`                                | `security.auth.baseUrl`                                | —                      | —                                 |
| 默认 / 计算值         | 回退到 `AuthType.QWEN_OAUTH` | 内置默认值（OpenAI ⇒ `qwen3.5-plus`）      | —                                                     | —                                                      | —                      | 如果配置了则使用 `Config.getProxy()` |

\*存在时，CLI 认证标志覆盖设置。否则，`security.auth.selectedType` 或隐式默认值决定认证类型。有关登录选项，请参阅[认证](./auth.md)。遗留的免费 Qwen OAuth 提供商与 [订阅版 Qwen 账户](https://chat.qwen.ai/?memberPlan=qwen_code)是分开的。

> [!note]
>
> `--openai-api-key` 和 `--openai-base-url` 是唯一的 credential CLI flags。无论名称如何，它们都应用于当前活跃的 OpenAI 兼容 provider——没有 `--anthropic-*` / `--gemini-*` credential flags。未通过 CLI 传递的 provider 特定 credentials 将从环境变量中解析（见下行）。

> [!warning]
>
> **弃用 `security.auth.apiKey` 和 `security.auth.baseUrl`：** 通过在 `settings.json` 中的 `security.auth.apiKey` 和 `security.auth.baseUrl` 直接配置 API 凭证已被弃用。这些设置在历史版本中用于通过 UI 输入的凭证，但凭证输入流程已在 0.10.1 版本中移除。这些字段将在未来版本中完全移除。**强烈建议迁移到 `modelProviders`** 以进行所有模型和凭证配置。请在 `modelProviders` 中使用 `envKey` 引用环境变量以实现安全的凭证管理，而不是在设置文件中硬编码凭证。

## Generation Config 分层：不可穿透的 Provider 层

配置解析遵循严格的分层模型，其中有一条关键规则：**modelProvider 层是不可渗透的**。

### 工作原理

1. **当选择了 modelProvider 模型时**（例如，通过 `/model` 命令选择由 provider 配置的模型）：
   - 来自 provider 的整个 `generationConfig` 将被**原子地**应用
   - **provider 层是完全不可渗透的** —— 下层（CLI、环境变量、设置）完全不参与 generationConfig 的解析
   - `modelProviders[].generationConfig` 中定义的所有字段均使用 provider 的值
   - Provider **未定义**的所有字段均设置为 `undefined`（不从 settings 继承）
   - 这确保了 provider 配置作为一个完整、自包含的“密封包”发挥作用

   如果某个模型列在 `modelProviders` 中，请将该模型的所有特定生成设置放在匹配的提供商条目中。对于提供商模型，顶层的 `model.generationConfig` 值（包括 `contextWindowSize`、`modalities`、`customHeaders` 和 `extra_body`）会被忽略。请将那些字段配置在 `modelProviders[authType][].generationConfig` 下才能生效。

2. **当未选择任何 modelProvider 模型时**（例如，使用带有原始模型 ID 的 `--model`，或直接使用 CLI/环境变量/设置）：
   - 解析会向下传递到较低层
   - 字段按 CLI → 环境变量 → 设置 → 默认值的顺序填充
   - 这会创建一个 **运行时模型**（Runtime Model，见下一节）

### `generationConfig` 的逐字段优先级

| 优先级 | 来源                                        | 行为                                                                                                 |
| -------- | --------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| 1        | 编程覆盖                        | 运行时 `/model`、`/auth` 更改                                                                        |
| 2 | `modelProviders[authType][].generationConfig` | **不可渗透层** - 完全替换所有 generationConfig 字段；下层不参与 |
| 3        | `settings.model.generationConfig`             | 仅用于 **Runtime Models**（未选择 provider 模型时）                                    |
| 4        | Content-generator 默认值                    | Provider 特定默认值（例如 OpenAI 与 Gemini）- 仅用于 Runtime Models                            |

### `customHeaders` 中的动态值 [#dynamic-values-in-customheaders]

`customHeaders` 的值可能包含占位符 `${session_id}`，该占位符会在每个请求中使用当前的 Qwen Code 会话 ID 进行展开。请将其用于需要稳定每对话标识符的网关——例如，OpenCode Go 会拒绝没有 `x-opencode-session` 的请求：

```json
{
  "generationConfig": {
    "customHeaders": {
      "x-opencode-session": "${session_id}"
    }
  }
}
```

由于该值是逐个请求解析的，而不是固化在 SDK 客户端中，因此 `/new` 和 `/resume` 可以在无需重启的情况下轮换它。

⚠️ **需要两个步骤。** 上面的提供商条目只是其中一半——占位符在您同时开启 [`outboundCorrelation.allowDynamicHeaderValues`](./settings.md#outboundcorrelation) 之前是无效的：

```json
{
  "outboundCorrelation": {
    "allowDynamicHeaderValues": true
  }
}
```

在您执行此操作之前，包含占位符的值将被**丢弃**而不是发送，并且 Qwen Code 会在启动时打印一条警告，指明该标头名称和此设置。该标头永远不会带有字面量 `${session_id}` 发送。

**保留一个标头。** 在 QwenCloud MaaS 端点——即 `/auth` 条目 `China — 千问AI平台` 和 `International — QwenCloud`——上，Qwen Code 拥有 `X-DashScope-Source-Config` 并将第一方归因值写入其中。该名称下的任何条目（无论大小写如何）都会在构建请求之前被移除，因此其中的 `${session_id}` 占位符永远不会存活，且 `allowDynamicHeaderValues` 也不会改变这一点。该标头本身仍会被发送；只有您的值会被替换。有关从设置角度陈述的相同规则，请参阅 [`customHeaders`](./settings.md#model)。

该开关是全局性的，因为它是一个同意决策，与值去向_哪里_无关：展开的值会将实时会话状态携带给接收者，而该开关仅控制是否允许展开 `${session_id}`。它并不识别是哪个设置源提供了该标头。

**隐私说明：** 会话 ID 是对话生命周期内的稳定标识符，因此您发送它的任何主机都可以对该对话的所有请求进行分组。哪些主机接收它取决于哪些提供商条目携带了该标头——没有单独的主机列表需要与您的 `baseUrl` 保持同步。

### 原子字段处理

以下字段被视为原子对象 - provider 值完全替换整个对象，不发生合并：

- `samplingParams` - Temperature、top_p、max_tokens 等。
- `customHeaders` - 自定义 HTTP 标头（可能包含 `${session_id}`；参见 [动态值](#dynamic-values-in-customheaders)）
- `extra_body` - 额外的请求体参数

### 示例

```jsonc
// User settings (~/.qwen/settings.json)
{
  "model": {
    "generationConfig": {
      "timeout": 30000,
      "samplingParams": { "temperature": 0.5, "max_tokens": 1000 }
    }
  }
}

// modelProviders configuration
{
  "modelProviders": {
    "openai": [{
      "id": "gpt-4o",
      "envKey": "OPENAI_API_KEY",
      "generationConfig": {
        "timeout": 60000,
        "samplingParams": { "temperature": 0.2 }
      }
    }]
  }
}
```

当从 modelProviders 中选择 `gpt-4o` 时：

- `timeout` = 60000（来自 provider，覆盖设置）
- `samplingParams.temperature` = 0.2（来自 provider，完全替换设置对象）
- `samplingParams.max_tokens` = **undefined**（未在 provider 中定义，且 provider 层不从设置继承——如果未提供，字段显式设置为 undefined）

当通过 `--model gpt-4` 使用原始模型时（非来自 modelProviders，创建运行时模型）：

- `timeout` = 30000（来自设置）
- `samplingParams.temperature` = 0.5（来自设置）
- `samplingParams.max_tokens` = 1000（来自设置）

`modelProviders` 本身的合并策略是 REPLACE（替换）：项目设置中的整个 `modelProviders` 将覆盖用户设置中的相应部分，而不是将两者合并。

## 推理 / 思考配置

`generationConfig` 下的可选 `reasoning` 字段控制模型在响应前推理的激进程度。Anthropic 和 Gemini 转换器始终遵循它。OpenAI 兼容管道也遵循它，**除非**设置了 `generationConfig.samplingParams`。已知的 GPT-5 模型和 GPT-6 Astra 是例外：无关的采样键不会抑制配置的 effort。参见下方的“与 `samplingParams` 的交互”。

```jsonc
{
  "modelProviders": {
    "openai": [
      {
        "id": "deepseek-v4-pro",
        "name": "DeepSeek V4 Pro",
        "baseUrl": "https://api.deepseek.com/v1",
        "envKey": "DEEPSEEK_API_KEY",
        "generationConfig": {
          // The effort tiers:
          //   'low'    — lightest reasoning
          //   'medium' | 'xhigh' — mapped to 'high' on DeepSeek
          //   'high'   — default reasoning intensity
          //   'max'    — DeepSeek-specific extra-strong tier
          // Or set `false` to disable reasoning entirely.
          "reasoning": { "effort": "max" },
        },
      },
    ],
  },
}
```

### 各 provider 行为

| 协议 / provider | 线格式 (Wire shape) | 备注 |
| --------------------------------------------- | ---------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **OpenAI / DashScope** (`qwen3.8-max` 系列) | 扁平的 `reasoning_effort: <effort>` body 参数 | 对于以 `qwen3.8-max` 开头的任何模型 ID（包括带日期的快照和 `-latest` 别名）、仅限邀请的 `qwen-latest-series-invite-*` 预览版以及 `qwen4*` 系列（均不区分大小写），会透传 `/effort` 层级；DashScope 应用特定于模型的映射。该系列的阶梯止于 `xhigh`，因此配置的 `max` 会被钳制为 `xhigh`（记录一次日志）而不是发送后被拒绝。在 `samplingParams` 或 `extra_body` 中显式指定 `reasoning_effort` 是逐字覆盖，不会被钳制。当 `reasoning_effort` 和 `thinking_budget` 冲突时，正常的 `extra_body` > `samplingParams` > `reasoning` 优先级仅保留更高优先级的字段；同一层级的显式配对保留 `reasoning_effort`，这与跨层解析之前提供者的行为一致。如果静态字段胜出，`/effort` 将报告该字段，而不是暗示请求的层级有效。当 effort 层级胜出时，冲突的 `enable_thinking` 也会被丢弃。在 `extra_body` 中显式指定的 `enable_thinking: false` 会被尊重而不是被丢弃：它作为 `reasoning_effort: 'none'` 覆盖配置的层级，这是 `extra_body` 不会逐字胜出的少数情况之一。其他 Qwen 模型继续将选定的 effort 映射到 `enable_thinking: true`；除非与 `thinking_budget` 冲突（DashScope 拒绝的一对），否则 `reasoning_effort` 覆盖在那里透传，在这种情况下，无效的 `reasoning_effort` 被丢弃，而 `enable_thinking` 和 `thinking_budget` 都保留。 |
| **OpenAI / DeepSeek** (`api.deepseek.com`) | 扁平的 `reasoning_effort: <effort>` body 参数 | 当在嵌套配置形状中设置 `reasoning.effort` 时，它会被重写为扁平的 `reasoning_effort`；对于内置的 DeepSeek 模型，`'low'`、`'high'` 和 `'max'` 透传，而 `'medium'`/`'xhigh'` 被规范化为 `'high'` —— 镜像了 DeepSeek 的 [effort mapping](https://api-docs.deepseek.com/guides/thinking_mode)。这种透传和规范化描述了官方端点：在 MaaS 和第三方主机上，确切的 `deepseek-v4-pro` / `deepseek-v4-flash` ID 仅提供 `high`/`max`（配置的 `low` 被提升到 `high`，且 `xhigh` 规范化为 `max`），而较新的 Flash 别名 (`deepseek-v4.1-flash*`) 保留 `low`/`high`/`max` 并带有 `xhigh → high`。顶层的 `samplingParams.reasoning_effort` 或 `extra_body.reasoning_effort` 覆盖跳过此规范化并逐字发送。`max` 在真实的 DeepSeek 主机名上和任何 `deepseek-v4*` 模型 ID 上都被接受（不区分大小写，包括带日期的快照），这在任何 OpenAI 兼容的主机上都能被识别（第三方网关获得 MaaS 风格的 `enable_thinking` 契约）；另一主机上的其他 `deepseek` 命名模型保持通用的 `xhigh` 上限，匹配重塑本身的 hostname 门控。 |
| **OpenAI / Z.ai** (`z.ai`, `bigmodel.cn`) | 扁平的 `reasoning_effort: <effort>` body 参数 | Z.ai 主机上的 GLM-5.2+ 采用完整阶梯，包括 `max`，且嵌套的 `reasoning.effort` 被重写为扁平字段。较旧的 GLM ID，以及在任何其他主机上访问到的 `glm-*` 模型，保持通用的 `xhigh` 上限：仅凭模型名称无法说明该端点接受什么。 |
| **OpenAI** (其他兼容服务器) | 已知的 GPT-5 / GPT-6 Astra: 扁平的 `reasoning_effort`; 其他模型: 嵌套的 `reasoning` | GPT effort 在两个方向上都被钳制到已知模型支持的子集。GPT-5.6 和 GPT-6 Astra 允许 `max`，而较早的模型具有较低的上限。低于模型下限的层级会被提升：GPT-5 Pro 仅接受 `high`；GPT-5.2 Pro、GPT-5.4 Pro 和 GPT-5.5 Pro 将 `low` 提升到 `medium`。OpenRouter 保留嵌套的 `reasoning`。未知的模型名称保持通用的 `xhigh` 上限和嵌套形状。在 `samplingParams` / `extra_body` 中的显式推理值绕过配置的层级钳制。 |
| **OpenAI Responses** (`openai-responses`) | `reasoning: { effort, summary: "auto" }` 加上 `include: ["reasoning.encrypted_content"]` | 每个层级都逐字透传，没有钳制。当未设置显式的 `reasoning` 时，`extra_body.enable_thinking: true` 被翻译为 `reasoning: { effort: "medium" }`（并且它本身永远不会被转发——在此线路上没有意义）；建议直接设置 `reasoning.effort`。 |
| **Anthropic** (真实的 `api.anthropic.com`) | `output_config: { effort }` 加上 `effort-2025-11-24` beta header | 真实的 Anthropic 仅接受 `'low'`/`'medium'`/`'high'`。`'max'` 被 **钳制为 `'high'`** 并伴随一条 `debugLogger.warn` 行（每个生成器一次）；如果你想要最大 effort，请将 baseURL 切换到支持它的 DeepSeek 兼容端点。 |
| **Anthropic** (`api.deepseek.com/anthropic`) | 相同的 `output_config: { effort }` + beta header | `'low'`、`'high'` 和 `'max'` 不变地透传；`'medium'`/`'xhigh'` 被映射到 `'high'`，匹配 DeepSeek 的服务端映射。 |
| **Gemini** (`@google/genai`) | `thinkingConfig: { includeThoughts: true, thinkingLevel }` | `'low'` → `LOW`, `'high'`/`'max'` → `HIGH`, 其他 → `THINKING_LEVEL_UNSPECIFIED` (Gemini 没有 `MAX` 层级)。 |

### `reasoning: false`

显式设置 `reasoning: false`（字面布尔值）会在支持禁用思考的模型上禁用思考——这对于不需要推理的廉价侧查询很有用。这也通过 `request.config.thinkingConfig.includeThoughts: false` 在请求级别得到尊重，用于一次性调用（例如建议生成）。

在 `api.deepseek.com` baseURL 上，OpenAI 管道发出 DeepSeek V4+ 所需的显式 `thinking: { type: 'disabled' }` 字段——服务端默认值是 `'enabled'`，因此仅仅省略 `reasoning_effort` 仍然会产生思考延迟/成本。自托管的 DeepSeek 后端 (sglang/vllm) 和其他 OpenAI 兼容服务器 **不会** 接收此字段；如果你需要在这些服务器上禁用思考，请通过 `samplingParams`/`extra_body` 注入 `thinking: { type: 'disabled' }`（或你的推理框架暴露的任何旋钮）。任何 `deepseek-v4*` 模型 ID（不区分大小写）都是例外：在任何第三方 OpenAI 兼容主机上，它遵循 MaaS 契约，并在禁用思考时接收 `enable_thinking: false`。在任何新识别的路由上（第三方主机，或已建立主机上的新别名），没有推理配置文件的遗留 `capabilities.reasoning` 声明保持其自身的线路语义：内置规范化器退让，既不扁平化也不重新分层声明的或静态的 effort。声明必须命名模型在 `disableField` 中读取的旋钮（`thinking`、`enable_thinking` 或 `reasoning_effort`）；省略它的声明根本不会解析任何能力，因此不会发出禁用字段，并且应用服务端默认值（开启思考）。

对于允许禁用的已知 GPT 模型，非 OpenRouter 端点接收 `reasoning_effort: 'none'`；OpenRouter 改为接收嵌套的 `reasoning: { enabled: false }`。强制思考模型在模型控制中拒绝 off，并从请求中省略不支持的禁用值，因此 `reasoning: false` 无法关闭它们的思考。显式的模型推理能力优先于内置层级列表并选择原生禁用字段；OpenRouter 保持其提供者级别的禁用行为。内置的强制集合是 `gpt-5`、`gpt-5-mini`、`gpt-5-nano`、`gpt-5-pro`、`gpt-5.1-codex`、`gpt-5.1-codex-max`、`gpt-5.2-codex`、`gpt-5.3-codex`、`gpt-5.2-pro`、`gpt-5.4-pro`、`gpt-5.5-pro` 和 `gpt-6-astra`。

在 `openrouter.ai` baseURL 上，当禁用推理时，OpenAI 管道发出 OpenRouter 的提供者级别 `reasoning: { enabled: false }` 字段。强制思考模型不会接收此禁用字段。其他 OpenAI 兼容服务器不会自动接收此 OpenRouter 特定字段；使用其原生禁用旋钮。

### 与 `samplingParams` 的交互（仅限 OpenAI 兼容）

> [!warning]
>
> 除了已知的 GPT 模型和具有显式推理能力的模型外，当在 OpenAI 兼容的提供商上设置 `generationConfig.samplingParams` 时，管道会将这些键**原样**发送到网络，并完全跳过单独的 `reasoning` 注入。因此，像 `{ samplingParams: { temperature: 0.5 }, reasoning: { effort: 'max' } }` 这样的配置会在 OpenAI/DeepSeek 请求中静默丢弃 reasoning 字段。放置在 `samplingParams` 内部的 `reasoning` 对象是您自己的值，在启用推理时保持不变地发送：上述努力程度上限仅适用于管道从 `/effort` 注入的层级。
>
> 已知的 GPT-5 模型和 GPT-6 Astra 在保留配置的 effort 的同时也保留无关的采样键。例如，在 GPT-5.4 上，`{ samplingParams: { temperature: 0.5 }, reasoning: { effort: 'max' } }` 发送 `temperature: 0.5` 和平坦的 `reasoning_effort: 'xhigh'`，或在 GPT-5.6 / GPT-6 Astra 上发送 `'max'`。在 `openrouter.ai` baseURL 上，相同的钳制层级作为嵌套的 `reasoning: { effort }` 发送。在非 OpenRouter 端点上，显式的平坦 reasoning 覆盖优先；空值或空字符串的平坦占位符允许配置的层级。在 OpenRouter 上，除非显式模型能力注入它，否则采样的平坦覆盖会抑制配置的嵌套 effort；仅存在于 extra-body 中的平坦覆盖不会替换配置的嵌套 effort。
>
> DashScope Qwen 模型是另一个例外：其提供商直接读取 `reasoning` 并将其映射到 `reasoning_effort` 或 `enable_thinking`。在分层 effort 系列（`qwen3.8-max`、`qwen-latest-series-invite-*`、`qwen4*`）中，当网络参数冲突时，提供商特定的 `samplingParams` 字段仍然优先；在较旧的 qwen 混合模型中，配置的 effort 层级会坍缩为 `enable_thinking: true`，这会覆盖 `samplingParams.enable_thinking` 值。
>
> 对于其他模型，在使用 `samplingParams` 时直接包含提供商的 reasoning 旋钮——对于 DeepSeek，这是 `samplingParams.reasoning_effort`。已知的 GPT 模型会自动映射配置的 effort；只有在故意绕过该映射时才添加原始覆盖。包括 `null` 在内的原始嵌套 `reasoning` 在启用推理时仍作为整个对象的覆盖。通过 `reasoning: false` 或请求级 `includeThoughts: false` 禁用会移除嵌套值，包括任一层中的原始覆盖。如果允许禁用，非 OpenRouter GPT 请求随后发送 `reasoning_effort: 'none'`；OpenRouter 使用其嵌套禁用字段代替。强制思考模型既不接受替代方案。在 OpenRouter 之外，其含义取决于网关，因此模型控件显示模型默认值。任何阻止配置层级的原始覆盖都会导致显式层级更改失败且不保存偏好设置。仅在允许思考时，思考开关才会在禁用后恢复配置的原始默认值。如果原始状态或配置的 reasoning 默认值为关闭，则无法打开思考开关，且保留已保存的偏好设置。这也适用于显式能力省略默认层级或仅暴露思考切换的情况。显式的默认命令仍会重置偏好设置。移除阻止性的原始覆盖以选择不同的层级。
>
> Anthropic 和 Gemini 转换器不受影响——无论 `samplingParams` 如何，它们始终直接读取 `reasoning.effort`。

### `budget_tokens`

您可以通过在 `effort` 旁边包含 `budget_tokens` 来固定确切的思考令牌预算：

```jsonc
"reasoning": { "effort": "high", "budget_tokens": 50000 }
```

对于 Anthropic，这会转换为 `thinking.budget_tokens`。对于 OpenAI/DeepSeek，该字段会被保留但目前被服务端忽略 —— `reasoning_effort` 才是起实际作用的控制参数。

## Provider Models 与 Runtime Models

Qwen Code 区分两种类型的模型配置：

### 提供商模型

- 在 `modelProviders` 配置中定义
- 拥有完整、原子的配置包
- 被选中时，其配置会作为一个不可穿透的层应用
- 出现在 `/model` 命令列表中，并带有完整的元数据（名称、描述、能力）
- 推荐用于多模型工作流和保持团队一致性

### 运行时模型

- 当通过 CLI (`--model`)、环境变量或设置使用原始模型 ID 时动态创建
- 未在 `modelProviders` 中定义
- 配置是通过解析层（CLI → env → settings → defaults）进行“投影”构建的
- 检测到完整配置时自动捕获为 **RuntimeModelSnapshot**
- 允许重用而无需重新输入凭据

### RuntimeModelSnapshot 生命周期

当您在不使用 `modelProviders` 的情况下配置模型时，Qwen Code 会自动创建一个 RuntimeModelSnapshot 以保留您的配置：

```bash
# This creates a RuntimeModelSnapshot with ID: $runtime|openai|my-custom-model
qwen --auth-type openai --model my-custom-model --openai-api-key $KEY --openai-base-url https://api.example.com/v1
```

快照：

- 捕获模型 ID、API 密钥、基础 URL 和生成配置
- 跨会话持久化（在运行时存储在内存中）
- 作为运行时选项出现在 `/model` 命令列表中
- 可以使用 `/model $runtime|openai|my-custom-model` 切换至该模型

### 主要区别

| 方面 | Provider Model | Runtime Model |
| ----------------------- | --------------------------------- | ------------------------------------------ |
| 配置来源 | 设置中的 `modelProviders` | CLI、env、settings 层 |
| 配置原子性 | 完整、不可穿透的包 | 分层，每个字段独立解析 |
| 可重用性 | 始终在 `/model` 列表中可用 | 捕获为快照，完整时显示 |
| 团队共享 | 是（通过提交的设置） | 否（用户本地） |
| 凭据存储 | 仅通过 `envKey` 引用 | 可能会在快照中捕获实际密钥 |

### 何时使用哪种

- **使用 Provider Models**：当你有团队共享的标准模型、需要一致的配置，或者想要防止意外覆盖时。
- **使用 Runtime Models**：当你快速测试新模型、使用临时凭据，或处理临时端点时。

## 选择持久化和推荐

> [!important]
>
> 尽可能在用户范围的 `~/.qwen/settings.json` 中定义 `modelProviders`，并避免在任何范围中持久化凭据覆盖。将提供商目录保留在用户设置中可防止项目和用户范围之间的合并/覆盖冲突，并确保 `/auth` 和 `/model` 更新始终写回一致的范围。

- `/model` 和 `/auth` 会将 `model.name`（如适用）和 `security.auth.selectedType` 持久化到已定义 `modelProviders` 的最近可写作用域；否则它们会回退到用户作用域。这使工作区/用户文件与活动的 provider 目录保持同步。
- 如果没有 `modelProviders`，解析器会混合 CLI/env/settings 层，从而创建 Runtime Models。这对于单 provider 设置来说没问题，但在频繁切换时会很繁琐。当多模型工作流很常见时，请定义 provider 目录，以便切换保持原子性、来源可追溯且可调试。
