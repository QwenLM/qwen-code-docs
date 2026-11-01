# 模型提供商

## Qwen Subscription 模型（开发预览）

[Qwen Account with Subscription](./auth.md) 从会员服务加载模型列表，无需填写 API Key 或手动配置 `modelProviders`。CLI 的 `/model` 会刷新列表；VS Code、桌面端复用模型选择器及刷新操作。网络或服务异常、空响应可以使用上次成功加载的列表；没有缓存时需重试。HTTP 403 会展示服务端错误说明，不返回缓存模型。已选模型下线后需重新选择，不自动回退。下文的旧 OAuth 固定目录与会员服务独立。

首次连接时，Qwen Code 会从返回的列表中选择默认模型；当前认证方式仍为 Qwen Subscription 时，会保留仍然可用的已选模型。

**会员思考设置：** 对于模型 ID 恰为 `qwen3.8-max` 或 `qwen3.8-flash` 的会员请求，网关使用 `enable_thinking` 和 `thinking_budget`。当思考档位生效且没有显式预算覆盖时，`low` 对应 4096、`medium` 对应 16384，`high`/`xhigh`/`max` 对应 32768 个思考 Token。模型允许关闭思考时，会发送 `enable_thinking: false` 并移除预算。请使用当前模型提供的思考控件；下方 DashScope API Key 的 `reasoning_effort` 规则不适用于此会员映射。可用模型列表仍以会员服务返回为准。

Qwen Code 允许你通过 `settings.json` 中的 `modelProviders` 设置来配置多个模型提供商。这使你能够使用 `/model` 命令在不同的 AI 模型和提供商之间进行切换。

## 概述

使用 `modelProviders` 按 provider id 声明 `/model` 选择器可切换的模型。每个键是一个 provider id，其值是**一个模型定义数组**（`ModelConfig[]`）。对于内置 provider，键必须是有效的 auth type（`openai`、`anthropic`、`gemini`、`vertex-ai`）；自定义 provider id（例如 `idealab`）也是允许的，只要你通过顶层的 [`providerProtocol`](#自定义-provider-idproviderprotocol) 设置将其映射到某个协议。每个模型条目需要一个 `id`；`envKey` 是**可选但推荐**的（如果省略，将回退到该 auth type 的默认环境变量键，例如 `openai` 对应 `OPENAI_API_KEY`），此外还有可选的 `name`、`description`、`baseUrl` 和 `generationConfig`。模型条目通过 `envKey` 引用凭据；运行时解析对应的环境变量，也支持设置文件 `env` 块提供的值。Qwen OAuth 模型保持硬编码，无法被覆盖。

> [!note]
>
> 早期预览版本曾将每个 provider 的模型包装在 `{ "protocol": ..., "models": [...] }` 对象中。该格式已被回退——当前值为本页展示的裸 `ModelConfig[]` 数组。在已迁移（`$version: 4`）的设置文件中，包装格式的条目会被静默跳过，因此请将任何旧配置更新为数组形式。

> [!note]
>
> Anthropic、Gemini 等 API 提供商需通过 `modelProviders` 配置，再使用 `/model` 选择。Qwen 账号登录使用独立的会员模型列表。当前 `/auth` 入口及开发预览条件请参阅[身份验证](./auth.md)。

> [!note]
>
> **模型唯一性：** 模型通过有效 API 协议、`id` 和配置的 `baseUrl` 共同标识。同一模型和 URL 可以分别声明 `wireApi: "chat-completions"` 与 `wireApi: "responses"`，同一模型和 API 也可以使用不同 URL。三者都相同的条目中，第一个生效，后续重复条目会被跳过并显示警告。

> [!note]
>
> **热重载 vs. 重启：** 修改 `settings.json` 中的 `modelProviders` 会由运行中的交互式会话自动加载，无需重启（文件监听约 300ms 防抖；重新打开 `/model` 查看，保留当前选择）。修改当前模型的 `wireApi` 会创建不同的路由，需显式选择该路由或重启。无效的 API 修改不会破坏此前可用的注册表。`providerProtocol` 仅在启动时读取，**需要重启**。

### 图像生成路由

某个路由可供内置 `image_gen` 工具使用时，设置 `supportsImageGeneration: true`。此能力与 `capabilities.vision`、`generationConfig.modalities.image` 等图像输入能力相互独立。

专用于图像生成、无需出现在普通模型选择器中的路由还应设置 `imageOnly: true`。为兼容旧配置，`imageOnly: true` 本身也意味着支持图像生成，已有配置无需迁移。

兼具聊天和图像生成能力的路由可以同时作为主模型，并通过 `/model --image` 选择：

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

专用图像路由设置以下两个字段；仅设置 `imageOnly: true` 的旧配置仍然有效：

```json
{
  "id": "image-model",
  "envKey": "MODEL_API_KEY",
  "baseUrl": "https://images.example.com/api/v1",
  "supportsImageGeneration": true,
  "imageOnly": true
}
```

所选路由必须声明显式 HTTPS `baseUrl` 和非空 `envKey`。图像生成使用该路由的同一端点及凭据；如果聊天与图像生成需要不同的端点或凭据，请分别配置两个路由。

### Live Voice 路由

对使用 DashScope Realtime（语音到语音）协议的路由设置 `realtimeOnly: true`。该路由不会作为聊天、快速、视觉、语音输入或图像模型出现，只能通过 `experimental.liveVoice.model` 选择为 Live Voice 模型。选择器可填写 `modelId`；同一 ID 出现在多个提供商下时，使用 `provider:modelId`。

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

选择 `realtimeOnly` 路由后，Live Voice 通过其 `envKey` 读取 API Key：先读进程环境变量，再读 `settings.json` 的 `env` 块；WebSocket 端点由 `baseUrl` 推导，`https://<host>/compatible-mode/v1` 转换为 `wss://<host>/api-ws/v1/realtime`。路由必须同时声明 `baseUrl` 与 `envKey`，主机必须是 DashScope 端点。

以下规则是有意设计的：

- 仅使用用户级和系统级设置，不读取工作区设置。项目的 `.qwen/settings.json` 不能添加或重定向 Live Voice 路由。
- **不带提供商前缀**的 `modelId` 若未匹配任何 `realtimeOnly` 路由，会继续使用独立的 `experimental.liveVoice.endpoint` 和 `experimental.liveVoice.apiKey`，保持旧配置有效。如果 `provider:modelId` 指向已存在的提供商，但该提供商没有此路由，则会报错；已删除或拼错的路由不会静默回退到已保存的密钥。
- 选中路由后，`experimental.liveVoice.apiKey` 和 `experimental.liveVoice.endpoint` 不参与请求，设置 API 也会拒绝保存这两个字段的新值。

使用独立配置时，在 Web Shell 的 Qwen Live 设置中直接填写端点和模型。请填写密钥所属区域或专用域名的 OpenAI 兼容 base URL，例如 `https://dashscope-intl.aliyuncs.com/compatible-mode/v1`。留空时使用北京端点 `https://dashscope.aliyuncs.com/compatible-mode/v1`，其他区域的密钥会被拒绝并返回 `401`。base URL 按输入原样保存，在通话开始时转换为 `wss://<host>/api-ws/v1/realtime`；主机必须是 DashScope 或 `*.maas.aliyuncs.com` 端点。Live Voice 开启时，新端点需先通过 Realtime 握手验证才能保存。

## 覆盖推理能力

在模型条目中设置 `capabilities.reasoning`，可覆盖推理格式、可选档位和默认档位。对于已知模型，省略的字段会继承所选端点的提供商目录。例如，`"capabilities": { "reasoning": { "defaultEffort": "medium" } }` 会让 DashScope 的 `qwen3.8-max` 路由在用户未显式选择档位时使用 medium。对于未知别名，请声明全部三个字段：

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

`efforts` 会替换 `low/medium/high/xhigh/max` 中受支持的子集，显式默认值必须属于该子集。各 profile 复用已有请求格式：Chat 接受 `openai-effort`、`openai-reasoning`、`deepseek-openai`、`dashscope-effort`、`dashscope-thinking` 和 `qwen-chat-template`；Responses 接受 `openai-reasoning`；Anthropic 接受 `anthropic-manual`、`anthropic-adaptive` 和 `deepseek-anthropic`；Gemini/Vertex 使用 `gemini`。两个仅支持开关的 profile 不填写 `efforts` 和 `defaultEffort`。Gemini 使用 low/medium/high。adaptive profile 会选择自适应思考，即使还配置了旧式手动预算。已有的完整能力声明仍然有效。

推理配置变更会在下一个用户请求前生效；该请求、重试及子代理共用捕获的推理配置。无效更新会保留旧配置，并记录模型与字段错误。新会话中的无效声明会安全回退到既有模型行为。用户的显式选择以及 `reasoning`、`samplingParams`、`extra_body` 中的提供商原生覆盖值保持原有优先级；模型默认值不会作为用户选择保存。此机制不改变端点、凭据或图像模型的生命周期。

## 各 Auth Type 的配置示例

以下是针对不同认证类型的全面配置示例，展示了可用的参数及其组合。

### 支持的 Auth Type

使用以下内置 provider ID，或通过 `providerProtocol` 映射自定义 ID：

| Auth Type    | 描述                                                                                                                           |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------ |
| `openai`     | 兼容 OpenAI 的 API，默认使用 Chat Completions；设置模型的 `wireApi: "responses"` 可选择 Responses API。                        |
| `anthropic`  | Anthropic Claude API                                                                                                           |
| `gemini`     | Google Gemini API                                                                                                              |
| `qwen-oauth` | 旧免费 Qwen OAuth（已停用，仅为兼容已有配置保留）                                                                              |
| `vertex-ai`  | Google Vertex AI（在 Vertex AI 模式下使用 `gemini` 协议和 `@google/genai` SDK；选择它会设置 `GOOGLE_GENAI_USE_VERTEXAI=true`） |

> [!note]
> Vertex AI 条目可以使用 **Application Default Credentials** 进行认证。设置 `GOOGLE_CLOUD_PROJECT`（以及可选的 `GOOGLE_CLOUD_LOCATION`，默认为 `global`），并让 `envKey` 以及解析器读取的所有其他密钥来源保持未设置：`GOOGLE_API_KEY`、`settings.security.auth.apiKey` 和 CLI 密钥参数。任何传入 Vertex 条目的 API key 都会使 Google SDK 切换到 Vertex Express 模式，从而忽略项目、区域和 ADC 凭据。声明了 `envKey` 的条目绝不会转而使用 ADC，因此变量注入失败后会继续针对该变量报错，而不会静默改用其他主体进行认证。

> [!warning]
> 既不是内置协议也未通过 `providerProtocol` 映射的 provider id（例如拼写错误如 `"openai-custom"`）无法被路由，因此其整个条目会被**跳过**并附带警告——其模型不会出现在 `/model` 选择器中。内置 provider 请使用上面列出的受支持 auth type 值之一，自定义 id 请添加 [`providerProtocol`](#自定义-provider-idproviderprotocol) 映射。

### 自定义 provider id（`providerProtocol`）

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

在 OpenAI 兼容模型的 `id`、`envKey`、`baseUrl` 同级设置 `wireApi`：

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

支持的值为 `chat-completions` 和 `responses`。`openai` 以及映射到 `openai` 的自定义提供商省略 `wireApi` 时，使用 Chat Completions。其他取值，或在 Anthropic、Gemini、Vertex AI、Qwen OAuth 模型上声明 `wireApi`，都会产生配置错误。

新配置请使用 `openai` 加模型级 `wireApi`。v0.23.3 发布的 `modelProviders.openai-responses` 格式，以及映射到 `openai-responses` 的 `providerProtocol`，仍可读取。显式提供商映射优先于分组名称，显式 `wireApi` 优先于两种 OpenAI 协议。加载不会重写设置或变更凭据引用。重新配置会以新格式写入选中的路由，且只删除可写作用域内与其匹配的旧条目；ID 含点号的提供商条目保持原样，其他模型、端点、API 和作用域不受影响。`api` 不是 `wireApi` 的别名。

`wireApi` 是本地路由元数据，不属于 `generationConfig` 或 `extra_body`，不会出现在请求体中。新建自定义配置时，同一 OpenAI 端点的两种 API 共用一个凭据槽，因此轮换密钥会同时更新两种路由。需要独立凭据时，手动配置的模型可以引用不同的显式 `envKey`。在 `/auth` → Custom Provider 中，先选 OpenAI-compatible，再选择 API 格式。

启动时，若所选配置端点没有匹配的 Chat 路由，`selectedType: "openai"` 可以解析显式配置了 `wireApi: "responses"` 的模型。模型选择器和已记录会话保留有效协议（`openai` 或 `openai-responses`），因此两种路由可独立选择和恢复。API 请求失败时不会检测端点或自动回退。

### 用于 API 请求的传输方式

有效模型协议决定传输方式。两种 OpenAI API 均使用 `openai` 提供商分组，由 `wireApi` 选择 Chat Completions 或 Responses：

| 有效协议           | 传输方式                                                                                                            |
| ------------------ | ------------------------------------------------------------------------------------------------------------------- |
| `openai`           | [`openai`](https://www.npmjs.com/package/openai)，官方 OpenAI Node.js SDK                                           |
| `openai-responses` | 直接通过 HTTP/SSE 调用 `/v1/responses`，不使用 SDK；embedding 使用 [`openai`](https://www.npmjs.com/package/openai) |
| `anthropic`        | [`@anthropic-ai/sdk`](https://www.npmjs.com/package/@anthropic-ai/sdk)，官方 Anthropic SDK                          |
| `gemini`           | [`@google/genai`](https://www.npmjs.com/package/@google/genai)，官方 Google GenAI SDK                               |
| `qwen-oauth`       | [`openai`](https://www.npmjs.com/package/openai) 加自定义提供商，兼容 DashScope                                     |

因此，配置的 `baseUrl` 必须兼容所选传输方式所需的 API 格式。例如 `wireApi: "responses"` 要求端点兼容 Responses API。

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

指向托管 OpenAI 兼容网关时，`baseUrl` 应填写 API 的 `/v1` 根路径，例如 `https://gateway.example.com/v1`，不要填写完整的 `/v1/chat/completions`；SDK 会自行追加请求路径。

### OpenAI Responses API（`openai-responses`）

使用 `openai` 加 `wireApi: "responses"` 可访问 OpenAI 的 `/v1/responses` 端点。端点同时返回加密推理和可见思考文本时，客户端通过 `reasoning.encrypted_content` 在后续轮次及 `--resume` 恢复时重放此前推理。兼容端点若发送 `response.reasoning_text.delta`，也会显示推理文本；不返回 `encrypted_content` 的端点无法重放不透明推理状态。请用 `reasoning.effort` 控制推理强度，而不是 Chat Completions 使用的 `extra_body.enable_thinking`。

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
>
> 此协议的 `extra_body` 仅补充尚未生成的字段：只有当生成的请求中没有该键时才写入，因此不能覆盖管线已设置的 `model`、`input`、`reasoning`、`temperature`、`max_output_tokens` 等字段。旧 `enable_thinking` 是例外：它不是 Responses API 字段，会被移除而非转发；如果没有显式 `reasoning`，则转换为 `reasoning.effort: "medium"`。请直接设置 `reasoning.effort`。

### Anthropic (`anthropic`)

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

对于有排队或响应较慢的本地 OpenAI 兼容服务器，`streamIdleTimeoutMs` 控制所选模型在流式数据块之间最多可保持静默多久。它会覆盖所选 provider 条目的全局 `QWEN_STREAM_IDLE_TIMEOUT_MS` 值；设为 `0` 可禁用空闲保护。除非提高或禁用 `QWEN_STREAM_MAX_LIFETIME_MS`，否则独立的 15 分钟流生命周期上限仍然生效。

对于不需要身份验证的本地服务器，你可以为 API key 使用任何占位符值：

```bash
# For Ollama (no auth required)
export OLLAMA_API_KEY="ollama"

# For vLLM (if no auth is configured)
export VLLM_API_KEY="not-needed"
```

> [!note]
>
> `extra_body` 参数**仅受兼容 OpenAI 的提供商**（`openai`、`qwen-oauth`）**支持**，Anthropic 和 Gemini 会忽略它。`openai-responses` 会转换 `enable_thinking`，而非原样转发，详见 [OpenAI Responses API](#openai-responses-apiopenai-responses)。

> [!note]
>
> **关于 `envKey`**：`envKey` 字段指定的是**环境变量的名称**，而不是实际的 API key 值。要使配置生效，你需要确保对应的环境变量已设置为你的真实 API key。有两种方法可以实现这一点：
>
> - **选项 1：使用 `.env` 文件**（出于安全考虑推荐）：
>   ```bash
>   # ~/.qwen/.env（或项目根目录）
>   OPENAI_API_KEY=sk-your-actual-key-here
>   ```
>   请务必将 `.env` 添加到你的 `.gitignore` 中，以防止意外提交密钥。
> - **选项 2：使用 `settings.json` 中的 `env` 字段**（如上述示例所示）：
>   ```json
>   {
>     "env": {
>       "OPENAI_API_KEY": "sk-your-actual-key-here"
>     }
>   }
>   ```
>
> 每个提供商示例都包含一个 `env` 字段，以说明应如何配置 API key。

## 阿里云 Coding Plan

阿里云 Coding Plan 提供了一组针对编码任务优化的预配置 Qwen 模型。此功能面向拥有阿里云 Coding Plan API 访问权限的用户开放，并提供简化的设置体验以及自动更新模型配置的功能。

### 概述

当你使用 `/auth` 命令通过阿里云 Coding Plan API key 进行身份验证时，Qwen Code 会自动配置以下模型：

| 模型 ID                | 名称                 | 描述                                        |
| ---------------------- | -------------------- | ------------------------------------------- |
| `qwen3.5-plus`         | qwen3.5-plus         | 启用思考功能的高级模型                      |
| `qwen3.6-plus`         | qwen3.6-plus         | 启用思考功能的最新模型（仅限 Pro 订阅用户） |
| `qwen3.7-plus`         | qwen3.7-plus         | 启用思考功能的高级模型                      |
| `qwen3-coder-plus`     | qwen3-coder-plus     | 针对编码任务优化                            |
| `qwen3-coder-next`     | qwen3-coder-next     | 实验性编码模型                              |
| `qwen3-max-2026-01-23` | qwen3-max-2026-01-23 | 启用思考功能的最新 max 模型                 |
| `glm-5`                | glm-5                | 启用思考功能的 GLM 模型                     |
| `glm-4.7`              | glm-4.7              | 启用思考功能的 GLM 模型                     |
| `kimi-k2.5`            | kimi-k2.5            | 支持思考和视觉/视频的 Kimi 模型             |
| `MiniMax-M2.5`         | MiniMax-M2.5         | 启用思考功能的 MiniMax 模型                 |

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

| 区域      | Endpoint                                        | 描述         |
| --------- | ----------------------------------------------- | ------------ |
| 中国      | `https://coding.dashscope.aliyuncs.com/v1`      | 中国大陆端点 |
| 全球/国际 | `https://coding-intl.dashscope.aliyuncs.com/v1` | 国际端点     |

区域在身份验证期间进行选择，并存储在 `settings.json` 的 `modelProviders` 配置下。要切换区域，请重新运行 `/auth` 命令并选择不同的区域。

### API Key 存储

当你通过 `/auth` 命令配置 Coding Plan 时，API key 会使用保留的环境变量名 `BAILIAN_CODING_PLAN_API_KEY` 进行存储。默认情况下，它存储在你的 `settings.json` 文件的 `env` 字段中。

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

Coding Plan 模型配置具有版本控制。当 Qwen Code 检测到模型模板有新版本时，会提示你进行更新。接受更新将会：

- 将现有的 Coding Plan 模型配置替换为最新版本
- 保留你手动添加的任何自定义模型配置
- 保持你选中的模型不变；如果它不再存在于更新后的配置中，请使用 `/model` 选择新模型

更新过程会刷新模型配置和功能，而不会改变你选中的模型。

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

| 层（最高 → 最低）       | authType                     | model                                    | apiKey                                     | baseUrl                                     | apiKeyEnvKey           | proxy                                |
| ----------------------- | ---------------------------- | ---------------------------------------- | ------------------------------------------ | ------------------------------------------- | ---------------------- | ------------------------------------ |
| 编程覆盖                | `/auth`                      | `/auth` 输入                             | `/auth` 输入                               | `/auth` 输入                                | —                      | —                                    |
| 模型 provider 选择      | —                            | `modelProvider.id`                       | `env[modelProvider.envKey]`                | `modelProvider.baseUrl`                     | `modelProvider.envKey` | —                                    |
| CLI 参数                | `--auth-type`                | `--model`                                | `--openai-api-key`                         | `--openai-base-url`                         | —                      | —                                    |
| 环境变量                | —                            | Provider 特定映射（例如 `OPENAI_MODEL`） | Provider 特定映射（例如 `OPENAI_API_KEY`） | Provider 特定映射（例如 `OPENAI_BASE_URL`） | —                      | —                                    |
| 设置（`settings.json`） | `security.auth.selectedType` | `model.name`                             | `security.auth.apiKey`                     | `security.auth.baseUrl`                     | —                      | —                                    |
| 默认 / 计算值           | 回退到 `AuthType.QWEN_OAUTH` | 内置默认值（OpenAI ⇒ `qwen3.5-plus`）    | —                                          | —                                           | —                      | 如果配置了则使用 `Config.getProxy()` |

\*当存在时，CLI auth flags 会覆盖设置。否则，由 `security.auth.selectedType` 或隐式默认值决定 auth type。可用登录方式及仅限开发版本的 Qwen Subscription 入口请参阅[身份验证](./auth.md)。旧免费 Qwen OAuth provider 仅为兼容已有配置保留。

> [!note]
>
> `--openai-api-key` 和 `--openai-base-url` 是唯一的 credential CLI flags。无论名称如何，它们都应用于当前活跃的 OpenAI 兼容 provider——没有 `--anthropic-*` / `--gemini-*` credential flags。未通过 CLI 传递的 provider 特定 credentials 将从环境变量中解析（见下行）。

> [!warning]
>
> **弃用 `security.auth.apiKey` 和 `security.auth.baseUrl`：** 通过 `settings.json` 中的 `security.auth.apiKey` 和 `security.auth.baseUrl` 直接配置 API credentials 已被弃用。这些设置在历史版本中用于通过 UI 输入的 credentials，但 credential 输入流程已在 0.10.1 版本中移除。这些字段将在未来的版本中完全移除。**强烈建议迁移到 `modelProviders`** 以进行所有模型和 credential 配置。在 `modelProviders` 中使用 `envKey` 引用环境变量来进行安全的 credential 管理，而不是在设置文件中硬编码 credentials。

## Generation Config 分层：不可穿透的 Provider 层

配置解析遵循严格的分层模型，其中有一条关键规则：**`modelProvider` 层是不可穿透的**。

### 工作原理

1. **当选择了 `modelProvider` 模型时**（例如，通过 `/model` 命令选择 provider 配置的模型）：
   - 来自 provider 的整个 `generationConfig` 将被**原子地**应用
   - **Provider 层完全不可穿透**——较低层（CLI、env、settings）根本不参与 `generationConfig` 解析
   - `modelProviders[].generationConfig` 中定义的所有字段均使用 provider 的值
   - Provider **未定义**的所有字段均设置为 `undefined`（不从 settings 继承）
   - 这确保了 provider 配置作为一个完整、自包含的“密封包”运行

   如果模型列在 `modelProviders` 中，请将该模型的所有特定于模型的 generation 设置放在匹配的 provider 条目中。对于 provider 模型，顶层的 `model.generationConfig` 值（包括 `contextWindowSize`、`modalities`、`customHeaders` 和 `extra_body`）将被忽略。请在 `modelProviders[authType][].generationConfig` 下配置这些字段以使其生效。

2. **当未选择 `modelProvider` 模型时**（例如，将 `--model` 与原始模型 ID 一起使用，或直接使用 CLI/env/settings）：
   - 解析会穿透到较低层
   - 字段按 CLI → env → settings → defaults 的顺序填充
   - 这将创建一个 **Runtime Model**（见下一节）

### `generationConfig` 的逐字段优先级

| 优先级 | 来源                                          | 行为                                                                |
| ------ | --------------------------------------------- | ------------------------------------------------------------------- |
| 1      | 编程覆盖                                      | 运行时 `/model`、`/auth` 更改                                       |
| 2      | `modelProviders[authType][].generationConfig` | **不可穿透层** - 完全替换所有 `generationConfig` 字段；较低层不参与 |
| 3      | `settings.model.generationConfig`             | 仅用于 **Runtime Models**（未选择 provider 模型时）                 |
| 4      | Content-generator 默认值                      | Provider 特定默认值（例如 OpenAI 与 Gemini）- 仅用于 Runtime Models |

### `customHeaders` 中的动态值

`customHeaders` 的值可以包含占位符 `${session_id}`，它会在每次请求时扩展为当前 Qwen Code 会话 ID。可用于要求每个对话具有稳定标识符的网关——例如 OpenCode Go 会拒绝缺少 `x-opencode-session` 的请求：

```json
{
  "generationConfig": {
    "customHeaders": {
      "x-opencode-session": "${session_id}"
    }
  }
}
```

由于该值是在每次请求时解析的，而非烘焙到 SDK 客户端中，`/new` 和 `/resume` 可以在不重启的情况下轮换它。

⚠️ **需要两个步骤。** 上面的 provider 条目只是一半——占位符本身是惰性的，你还需要开启
[`outboundCorrelation.allowDynamicHeaderValues`](./settings.md#outboundcorrelation)：

```json
{
  "outboundCorrelation": {
    "allowDynamicHeaderValues": true
  }
}
```

在此之前，包含占位符的值会被**丢弃**而不会发送，Qwen Code 会在启动时打印一条警告，指明该 header 和此设置名。该 header 绝不会带着字面量 `${session_id}` 被发出。

**保留请求头：** 对于千问AI平台与 QwenCloud 的 MaaS 端点，`X-DashScope-Source-Config` 由 Qwen Code 生成并写入来源信息。用户配置的同名请求头（不区分大小写）会被替换，其中的 `${session_id}` 不会展开；`allowDynamicHeaderValues` 不会改变这一规则。请求头本身仍会发送，只是使用客户端生成的值。另见设置参考中的 [customHeaders](settings.md#model)。

该开关是全局的，因为它是一个同意决策，独立于值被发送到*哪里*：扩展后的值会将实时会话状态带给接收方，而该开关仅控制 `${session_id}` 是否可以被扩展。它不会标识是哪个设置源提供了该 header。

**隐私说明：** 会话 ID 在对话生命周期内是一个稳定的标识符，因此你发送到的任何 host 都可以将该对话的每个请求归组。具体是哪些 host 由哪些 provider 条目携带该 header 决定——没有单独的 host 列表需要与你的 `baseUrl` 保持同步。

### 原子字段处理

以下字段被视为原子对象——provider 的值将完全替换整个对象，不会发生合并：

- `samplingParams` - Temperature、top_p、max_tokens 等。
- `customHeaders` - 自定义 HTTP headers（可能包含 `${session_id}`；参见[动态值](#customheaders-中的动态值)）
- `extra_body` - 额外的请求体参数

### 示例

```jsonc
// 用户设置 (~/.qwen/settings.json)
{
  "model": {
    "generationConfig": {
      "timeout": 30000,
      "samplingParams": { "temperature": 0.5, "max_tokens": 1000 }
    }
  }
}

// modelProviders 配置
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

当从 `modelProviders` 中选择 `gpt-4o` 时：

- `timeout` = 60000（来自 provider，覆盖 settings）
- `samplingParams.temperature` = 0.2（来自 provider，完全替换 settings 对象）
- `samplingParams.max_tokens` = **undefined**（未在 provider 中定义，且 provider 层不会从 settings 继承——如果未提供，字段会被显式设置为 undefined）

当通过 `--model gpt-4` 使用原始模型时（不来自 `modelProviders`，会创建一个 Runtime Model）：

- `timeout` = 30000（来自 settings）
- `samplingParams.temperature` = 0.5（来自 settings）
- `samplingParams.max_tokens` = 1000（来自 settings）

`modelProviders` 本身的合并策略是 REPLACE（替换）：项目设置中的整个 `modelProviders` 将覆盖用户设置中的相应部分，而不是将两者合并。

## Reasoning / thinking 配置

`generationConfig` 下的可选 `reasoning` 字段控制模型回答前的推理强度。Anthropic 和 Gemini 转换器始终使用它。OpenAI 兼容管线通常会在设置 `generationConfig.samplingParams` 后跳过独立的 reasoning 注入，但已知 GPT-5 模型和 GPT-6 Astra 例外：不相关的采样字段不会抑制推理档位。详见下方“与 `samplingParams` 的交互”。

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

### 各 provider 的行为

| 协议 / 提供商                                 | 请求格式                                                                               | 说明                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| --------------------------------------------- | -------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **OpenAI / DashScope**（`qwen3.8-max` 系列）  | 扁平 `reasoning_effort: <effort>`                                                      | 对所有以 `qwen3.8-max` 开头的模型 ID（包括日期快照和 `-latest` 别名），`/effort` 档位会传给 DashScope，由服务端完成模型特定映射。该系列最高为 `xhigh`，配置的 `max` 会被限制为 `xhigh`，并记录一次日志。`samplingParams` 或 `extra_body` 中显式设置的 `reasoning_effort` 原样发送，不受档位限制。它与 `thinking_budget` 冲突时，按 `extra_body` > `samplingParams` > `reasoning` 保留较高优先级字段；同层显式同时设置时保留 `reasoning_effort`。静态字段生效时，`/effort` 会报告该字段，不会声称请求档位已生效。档位生效时还会移除冲突的 `enable_thinking`。`extra_body.enable_thinking: false` 会覆盖档位并转换成 `reasoning_effort: 'none'`，这是 `extra_body` 不原样生效的少数情况之一。其他 Qwen 模型仍将选中档位映射为 `enable_thinking: true`；显式 `reasoning_effort` 会原样保留，除非它与 `thinking_budget` 同时存在、构成 DashScope 拒绝的组合，此时移除无效的 `reasoning_effort`，保留 `enable_thinking` 与 `thinking_budget`。 |
| **OpenAI / DeepSeek**（`api.deepseek.com`）   | 扁平 `reasoning_effort: <effort>`                                                      | 嵌套配置中的 `reasoning.effort` 会改写为扁平 `reasoning_effort`。内置 DeepSeek 模型的 `low`、`high`、`max` 原样传递，`medium`/`xhigh` 归一为 `high`，与 DeepSeek 的[档位映射](https://api-docs.deepseek.com/guides/thinking_mode)一致。顶层 `samplingParams.reasoning_effort` 或 `extra_body.reasoning_effort` 跳过此归一化并原样发送。只有真实 DeepSeek 主机接受 `max`；其他主机上名为 deepseek 的模型仍使用通用的 `xhigh` 上限，与请求改写的主机校验一致。                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| **OpenAI / Z.ai**（`z.ai`、`bigmodel.cn`）    | 扁平 `reasoning_effort: <effort>`                                                      | Z.ai 主机上的 GLM-5.2+ 支持包含 `max` 的完整档位，并将嵌套 `reasoning.effort` 改写为扁平字段。较旧的 GLM ID，以及其他主机上的 `glm-*` 模型，仍使用通用 `xhigh` 上限；仅凭模型名无法确定端点能力。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| **OpenAI**（其他兼容服务）                    | 已知 GPT-5 / GPT-6 Astra 使用扁平 `reasoning_effort`；其他模型使用嵌套 `reasoning`     | GPT 档位会向上或向下限制到已知模型支持的子集。GPT-5.6 和 GPT-6 Astra 支持 `max`，较早模型的上限更低。低于模型下限的档位会被提高：GPT-5 Pro 仅接受 `high`；GPT-5.2 Pro、GPT-5.4 Pro、GPT-5.5 Pro 将 `low` 提高到 `medium`。OpenRouter 保留嵌套 `reasoning`。未知模型使用通用 `xhigh` 上限和嵌套格式。`samplingParams` / `extra_body` 中的显式推理值绕过配置档位限制。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| **OpenAI Responses**（`openai-responses`）    | `reasoning: { effort, summary: "auto" }` 与 `include: ["reasoning.encrypted_content"]` | 所有档位原样发送，不做限制。未显式设置 `reasoning` 时，`extra_body.enable_thinking: true` 转换为 `reasoning: { effort: "medium" }`，自身不会转发，因为该协议没有此字段。建议直接设置 `reasoning.effort`。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| **Anthropic**（真实 `api.anthropic.com`）     | `output_config: { effort }` 与 `effort-2025-11-24` beta 请求头                         | 仅接受 `low`/`medium`/`high`。`max` 会被**限制为 `high`**，并通过 `debugLogger.warn` 每个生成器记录一次。需要 max 时，应切换到支持它的 DeepSeek 兼容端点。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| **Anthropic**（`api.deepseek.com/anthropic`） | 同样使用 `output_config: { effort }` 与 beta 请求头                                    | `low`、`high`、`max` 原样传递；`medium`/`xhigh` 映射为 `high`，与 DeepSeek 服务端映射一致。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| **Gemini**（`@google/genai`）                 | `thinkingConfig: { includeThoughts: true, thinkingLevel }`                             | `low` → `LOW`，`high`/`max` → `HIGH`，其他值 → `THINKING_LEVEL_UNSPECIFIED`；Gemini 没有 MAX 档位。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |

### `reasoning: false`

设置布尔值 `reasoning: false`，可在支持关闭思考的模型上显式关闭思考，适合无需推理的低成本辅助请求。单次请求也可通过 `request.config.thinkingConfig.includeThoughts: false` 关闭，例如生成建议时。

base URL 为 `api.deepseek.com` 时，OpenAI 管线会发送 DeepSeek V4+ 所需的显式 `thinking: { type: 'disabled' }`。服务端默认开启思考，仅省略 `reasoning_effort` 仍会产生思考延迟和成本。自托管 DeepSeek（sglang/vllm）及其他 OpenAI 兼容服务**不会**自动收到此字段；需通过 `samplingParams` / `extra_body` 注入它或推理框架提供的其他开关。

对于允许关闭思考的已知 GPT 模型，非 OpenRouter 端点会收到 `reasoning_effort: 'none'`，OpenRouter 则收到嵌套 `reasoning: { enabled: false }`。强制思考模型会在控件中拒绝关闭，并从请求中移除不支持的关闭值，`reasoning: false` 无法关闭其思考。显式模型推理能力优先于内置档位列表，并选择原生关闭字段；OpenRouter 保留提供商级关闭行为。内置强制思考模型包括 `gpt-5`、`gpt-5-mini`、`gpt-5-nano`、`gpt-5-pro`、`gpt-5.1-codex`、`gpt-5.1-codex-max`、`gpt-5.2-codex`、`gpt-5.3-codex`、`gpt-5.2-pro`、`gpt-5.4-pro`、`gpt-5.5-pro` 和 `gpt-6-astra`。

base URL 为 `openrouter.ai` 时，关闭推理会发送 OpenRouter 的提供商级 `reasoning: { enabled: false }`；强制思考模型不会收到它。其他 OpenAI 兼容服务不会自动收到此 OpenRouter 专用字段，请使用其原生关闭开关。

### 与 `samplingParams` 的交互（仅限 OpenAI 兼容）

> [!warning]
>
> 除已知 GPT 模型及显式声明推理能力的模型外，OpenAI 兼容提供商设置 `generationConfig.samplingParams` 后，管线会原样发送其中的字段，并完全跳过独立的 `reasoning` 注入。例如 `{ samplingParams: { temperature: 0.5 }, reasoning: { effort: 'max' } }` 会在 OpenAI/DeepSeek 请求中静默丢弃 reasoning 字段。`samplingParams` 内的 `reasoning` 是用户显式值，在思考开启时原样发送；上述档位上限仅适用于管线从 `/effort` 注入的档位。
>
> 已知 GPT-5 模型和 GPT-6 Astra 会在不相关采样字段之外保留配置档位。例如上述配置在 GPT-5.4 上发送 `temperature: 0.5` 和扁平 `reasoning_effort: 'xhigh'`，在 GPT-5.6 / GPT-6 Astra 上则发送 `max`。OpenRouter 会将同一受限档位作为嵌套 `reasoning: { effort }` 发送。非 OpenRouter 端点上的显式扁平推理值优先；空值或空字符串占位符不会阻止配置档位生效。在 OpenRouter 上，采样层的扁平覆盖值会抑制配置的嵌套档位，除非显式模型能力注入它；仅 extra-body 层的扁平值不会替换配置的嵌套档位。
>
> DashScope Qwen 模型也是例外：提供商会直接读取 `reasoning` 并映射为 `reasoning_effort` 或 `enable_thinking`。qwen3.8-max 系列发生请求参数冲突时，提供商特定的 `samplingParams` 字段仍然优先；较早的 Qwen 混合思考模型则将配置档位转为 `enable_thinking: true`，覆盖 `samplingParams.enable_thinking`。
>
> 对其他模型，使用 `samplingParams` 时应直接填写提供商的推理字段；DeepSeek 对应 `samplingParams.reasoning_effort`。已知 GPT 模型会自动映射档位，仅在有意绕过映射时添加原始覆盖值。包括 `null` 在内的原始嵌套 `reasoning`，在思考开启时仍按整个对象覆盖。`reasoning: false` 或请求级 `includeThoughts: false` 会移除嵌套值，包括两层中的原始覆盖。允许关闭时，非 OpenRouter GPT 请求发送 `reasoning_effort: 'none'`，OpenRouter 使用嵌套关闭字段；强制思考模型两者都不发送。在 OpenRouter 之外，其含义由网关决定，模型控件会显示模型默认值。任何阻止配置档位生效的原始覆盖值，都会让显式档位修改失败且不保存偏好。关闭后再开启思考时，只有原始默认配置允许思考才会恢复它；如果原始状态或默认 reasoning 已关闭，思考开关无法开启，已保存偏好保持不变。显式能力未指定默认档位或只提供思考开关时也适用。显式 default 命令仍可重置偏好；要选择其他档位，请先移除阻塞它的原始覆盖值。
>
> Anthropic 和 Gemini 转换器不受影响，始终直接读取 `reasoning.effort`，不取决于 `samplingParams`。

### `budget_tokens`

可在 `effort` 旁设置 `budget_tokens`，指定精确的思考 Token 预算：

```jsonc
"reasoning": { "effort": "high", "budget_tokens": 50000 }
```

Anthropic 会将其转换为 `thinking.budget_tokens`。OpenAI/DeepSeek 会保留该字段，但服务端目前忽略它，实际生效的是 `reasoning_effort`。

## Provider Models 与 Runtime Models

Qwen Code 区分两种类型的模型配置：

### Provider Model

- 在 `modelProviders` 配置中定义
- 拥有完整、原子的配置包
- 被选中时，其配置会作为一个不可穿透的层应用
- 出现在 `/model` 命令列表中，并带有完整的元数据（名称、描述、能力）
- 推荐用于多模型工作流和保持团队一致性

### Runtime Model

- 当通过 CLI (`--model`)、环境变量或设置使用原始模型 ID 时动态创建
- 未在 `modelProviders` 中定义
- 配置是通过“投影”解析层（CLI → env → settings → defaults）构建的
- 当检测到完整配置时，会自动捕获为 **RuntimeModelSnapshot**
- 允许重复使用而无需重新输入凭据

### RuntimeModelSnapshot 生命周期

当你不使用 `modelProviders` 配置模型时，Qwen Code 会自动创建一个 RuntimeModelSnapshot 来保留你的配置：

```bash
# 这会创建一个 ID 为 $runtime|openai|my-custom-model 的 RuntimeModelSnapshot
qwen --auth-type openai --model my-custom-model --openai-api-key $KEY --openai-base-url https://api.example.com/v1
```

该快照：

- 捕获模型 ID、API key、base URL 和 generation config
- 跨会话持久化（在运行期间存储在内存中）
- 作为运行时选项出现在 `/model` 命令列表中
- 可以使用 `/model $runtime|openai|my-custom-model` 切换至该模型

### 主要区别

| 方面       | Provider Model             | Runtime Model              |
| ---------- | -------------------------- | -------------------------- |
| 配置来源   | 设置中的 `modelProviders`  | CLI、env、settings 层      |
| 配置原子性 | 完整、不可穿透的包         | 分层，每个字段独立解析     |
| 可重用性   | 始终在 `/model` 列表中可用 | 捕获为快照，完整时显示     |
| 团队共享   | 是（通过提交的设置）       | 否（用户本地）             |
| 凭据存储   | 仅通过 `envKey` 引用       | 可能会在快照中捕获实际密钥 |

### 何时使用哪种

- **使用 Provider Models**：当你有团队共享的标准模型、需要一致的配置，或者想要防止意外覆盖时。
- **使用 Runtime Models**：当你快速测试新模型、使用临时凭据，或处理临时端点时。

## 选择持久化与建议

> [!important]
>
> 尽可能在用户作用域的 `~/.qwen/settings.json` 中定义 `modelProviders`，并避免在任何作用域中持久化凭据覆盖。将 provider 目录保留在用户设置中，可以防止项目作用域和用户作用域之间的合并/覆盖冲突，并确保 `/auth` 和 `/model` 的更新始终写回一致的作用域。

- `/model` 和 `/auth` 会将 `model.name`（如适用）和 `security.auth.selectedType` 持久化到已定义 `modelProviders` 的最近可写作用域；否则它们会回退到用户作用域。这使工作区/用户文件与活动的 provider 目录保持同步。
- 如果没有 `modelProviders`，解析器会混合 CLI/env/settings 层，从而创建 Runtime Models。这对于单 provider 设置来说没问题，但在频繁切换时会很繁琐。当多模型工作流很常见时，请定义 provider 目录，以便切换保持原子性、来源可追溯且可调试。
