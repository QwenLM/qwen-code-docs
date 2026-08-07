# 模型提供商

Qwen Code 允许你通过 `settings.json` 中的 `modelProviders` 设置来配置多个模型提供商。这使你能够使用 `/model` 命令在不同的 AI 模型和提供商之间进行切换。

## 概述

使用 `modelProviders` 按 provider id 声明 `/model` 选择器可切换的模型。每个键是一个 provider id，其值是**一个模型定义数组**（`ModelConfig[]`）。对于内置 provider，键必须是有效的 auth type（`openai`、`anthropic`、`gemini`、`vertex-ai`）；自定义 provider id（例如 `idealab`）也是允许的，只要你通过顶层的 [`providerProtocol`](#自定义 provider-idproviderprotocol) 设置将其映射到某个协议。每个模型条目需要一个 `id`；`envKey` 是**可选但推荐**的（如果省略，将回退到该 auth type 的默认环境变量键，例如 `openai` 对应 `OPENAI_API_KEY`），此外还有可选的 `name`、`description`、`baseUrl` 和 `generationConfig`。凭据永远不会持久化在设置中；运行时会从 `process.env[envKey]` 读取它们。Qwen OAuth 模型保持硬编码，无法被覆盖。

> [!note]
>
> 早期预览版本曾将每个 provider 的模型包装在 `{ "protocol": ..., "models": [...] }` 对象中。该格式已被回退——当前值为本页展示的裸 `ModelConfig[]` 数组。在已迁移（`$version: 4`）的设置文件中，包装格式的条目会被静默跳过，因此请将任何旧配置更新为数组形式。

> [!note]
>
> 只有 `/model` 命令会暴露非默认的 auth type。Anthropic、Gemini 等必须通过 `modelProviders` 进行定义。`/auth` 命令列出三个顶级选项：**Alibaba ModelStudio**（子菜单中包含 Coding Plan、Token Plan 和 Standard API Key）、**Third-party Providers** 和 **Custom Provider**。（Qwen OAuth 不再是可选的对话框条目；其免费套餐已于 2026-04-15 停止服务。）

> [!note]
>
> **模型唯一性：** 同一 `authType` 内的模型通过 `id` + `baseUrl` 的组合进行唯一标识。这意味着你可以在单个 `authType` 下多次定义相同的模型 ID（例如 `"gpt-4o"`），只要每个条目具有不同的 `baseUrl` —— 例如，一个直接指向 OpenAI，另一个指向代理端点。如果两个条目具有相同的 `id` 和相同的 `baseUrl`（或都省略了 `baseUrl`），则第一个出现的条目生效，后续的重复项将被跳过并附带警告。

## 各 Auth Type 的配置示例

以下是针对不同认证类型的全面配置示例，展示了可用的参数及其组合。

### 支持的 Auth Type

`modelProviders` 对象的键必须是有效的 `authType` 值。当前支持的 auth type 包括：

| Auth Type    | 描述                                                                                                                                          |
| ------------ | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `openai`     | 兼容 OpenAI 的 API（OpenAI、Azure OpenAI、vLLM/Ollama 等本地推理服务器）                                                                      |
| `anthropic`  | Anthropic Claude API                                                                                                                          |
| `gemini`     | Google Gemini API                                                                                                                             |
| `qwen-oauth` | Qwen OAuth（硬编码，无法在 `modelProviders` 中覆盖）                                                                                          |
| `vertex-ai`  | Google Vertex AI（在 Vertex AI 模式下使用 `gemini` 协议和 `@google/genai` SDK；选择它会设置 `GOOGLE_GENAI_USE_VERTEXAI=true`）                |

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

### 用于 API 请求的 SDK

Qwen Code 使用以下官方 SDK 向各个提供商发送请求：

| Auth Type    | SDK 包                                                                                              |
| ------------ | --------------------------------------------------------------------------------------------------- |
| `openai`     | [`openai`](https://www.npmjs.com/package/openai) - 官方 OpenAI Node.js SDK                          |
| `anthropic`  | [`@anthropic-ai/sdk`](https://www.npmjs.com/package/@anthropic-ai/sdk) - 官方 Anthropic SDK         |
| `gemini`     | [`@google/genai`](https://www.npmjs.com/package/@google/genai) - 官方 Google GenAI SDK              |
| `qwen-oauth` | 使用自定义提供商（兼容 DashScope）的 [`openai`](https://www.npmjs.com/package/openai)               |

这意味着你配置的 `baseUrl` 必须与相应 SDK 预期的 API 格式兼容。例如，使用 `openai` auth type 时，端点必须接受 OpenAI API 格式的请求。

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
    "openai": {
      "protocol": "openai",
      "models": [
        {
          "id": "gpt-4o",
          "name": "GPT-4o",
          "envKey": "OPENAI_API_KEY",
          "baseUrl": "https://api.openai.com/v1",
          "generationConfig": {
            "timeout": 60000,
            "maxRetries": 3,
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
}
```

### Anthropic (`anthropic`)

```json
{
  "env": {
    "ANTHROPIC_API_KEY": "sk-ant-your-actual-anthropic-key-here"
  },
  "modelProviders": {
    "anthropic": {
      "protocol": "anthropic",
      "models": [
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
}
```

### Google Gemini (`gemini`)

```json
{
  "env": {
    "GEMINI_API_KEY": "AIza-your-actual-gemini-key-here"
  },
  "modelProviders": {
    "gemini": {
      "protocol": "gemini",
      "models": [
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
    "openai": {
      "protocol": "openai",
      "models": [
        {
          "id": "qwen2.5-7b",
          "name": "Qwen2.5 7B (Ollama)",
          "envKey": "OLLAMA_API_KEY",
          "baseUrl": "http://localhost:11434/v1",
          "generationConfig": {
            "timeout": 300000,
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
}
```

对于不需要身份验证的本地服务器，你可以为 API key 使用任何占位符值：

```bash
# For Ollama (no auth required)
export OLLAMA_API_KEY="ollama"

# For vLLM (if no auth is configured)
export VLLM_API_KEY="not-needed"
```

> [!note]
>
> `extra_body` 参数**仅受兼容 OpenAI 的提供商**（`openai`、`qwen-oauth`）**支持**。对于 Anthropic 和 Gemini 提供商，该参数会被忽略。

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
- 自动切换到更新后配置中的第一个模型

更新过程确保你始终能够访问最新的模型配置和功能，而无需手动干预。

### 手动配置（高级）

如果你倾向于手动配置 Coding Plan 模型，可以像配置任何 OpenAI 兼容的 provider 一样将它们添加到 `settings.json` 中：

```json
{
  "modelProviders": {
    "openai": {
      "protocol": "openai",
      "models": [
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

\*当存在时，CLI auth flags 会覆盖设置。否则，由 `security.auth.selectedType` 或隐式默认值决定 auth type。Qwen OAuth 和 OpenAI 是唯一无需额外配置即可使用的 auth types。

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

| 优先级 | 来源                                        | 行为                                                                                                 |
| -------- | --------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| 1        | 编程覆盖                        | 运行时 `/model`、`/auth` 更改                                                                        |
| 2        | `modelProviders[authType][].generationConfig` | **不可穿透层** - 完全替换所有 `generationConfig` 字段；较低层不参与 |
| 3        | `settings.model.generationConfig`             | 仅用于 **Runtime Models**（未选择 provider 模型时）                                    |
| 4        | Content-generator 默认值                    | Provider 特定默认值（例如 OpenAI 与 Gemini）- 仅用于 Runtime Models                            |

### 原子字段处理

以下字段被视为原子对象——provider 的值将完全替换整个对象，不会发生合并：

- `samplingParams` - Temperature、top_p、max_tokens 等。
- `customHeaders` - 自定义 HTTP headers
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
    "openai": {
      "protocol": "openai",
      "models": [{
        "id": "gpt-4o",
        "envKey": "OPENAI_API_KEY",
        "generationConfig": {
          "timeout": 60000,
          "samplingParams": { "temperature": 0.2 }
        }
      }]
    }
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

`generationConfig` 下的可选 `reasoning` 字段控制模型在响应前进行推理的积极程度。Anthropic 和 Gemini 转换器始终遵循该字段。OpenAI 兼容管道也会遵循，**除非**设置了 `generationConfig.samplingParams` —— 请参阅下面的“与 `samplingParams` 的交互”注意事项。

```jsonc
{
  "modelProviders": {
    "openai": {
      "protocol": "openai",
      "models": [
        {
          "id": "deepseek-v4-pro",
          "name": "DeepSeek V4 Pro",
          "baseUrl": "https://api.deepseek.com/v1",
          "envKey": "DEEPSEEK_API_KEY",
          "generationConfig": {
            // 四级强度：
            //   'low'    | 'medium' — 在 DeepSeek 服务端会映射为 'high'
            //   'high'   — 默认推理强度
            //   'max'    — DeepSeek 特有的超强级别
            // 或者设置为 `false` 以完全禁用推理。
            "reasoning": { "effort": "max" },
          },
        },
      ],
    },
  },
}
```

### 各 provider 的行为

| 协议 / provider | 网络请求结构 | 备注 |
| --- | --- | --- |
| **OpenAI / DashScope**（`qwen3.8-max` 系列） | 扁平的 `reasoning_effort: <effort>` body 参数 | 五个 `/effort` 级别（`low`、`medium`、`high`、`xhigh`、`max`）对于任何以 `qwen3.8-max` 开头的模型 id（包括带日期的快照和 `-latest` 别名）会原样传递；DashScope 会应用任何模型特定的映射。该系列的级别单独发送：冲突的 `enable_thinking` 或 `thinking_budget` 会被丢弃（warn 日志，每个 generator 一次）—— DashScope 会拒绝将 `reasoning_effort` 与 `thinking_budget` 组合的请求，两个思考控制参数不应同时发送。`extra_body` 中的显式 `enable_thinking: false` 会被遵从而非丢弃：它会以 `reasoning_effort: 'none'` 覆盖配置的级别，这是 `extra_body` 少数不按原样生效的地方之一。其他 Qwen 模型继续将所选级别映射为 `enable_thinking: true`；`reasoning_effort` 覆盖会在那里原样传递，除非它与 `thinking_budget` 冲突（DashScope 会拒绝该组合），此时无效的 `reasoning_effort` 会被丢弃，`enable_thinking` 和 `thinking_budget` 均保留。 |
| **OpenAI / DeepSeek** (`api.deepseek.com`) | 扁平的 `reasoning_effort: <effort>` body 参数 | 当在嵌套配置中设置 `reasoning.effort` 时，它会被重写为扁平的 `reasoning_effort`，并且 `'low'`/`'medium'` 会被规范化为 `'high'`，`'xhigh'` 规范化为 `'max'` —— 这反映了 DeepSeek 的[服务端向后兼容](https://api-docs.deepseek.com/zh-cn/api/create-chat-completion)机制。顶层的 `samplingParams.reasoning_effort` 或 `extra_body.reasoning_effort` 覆盖会跳过此规范化并原样发送。 |
| **OpenAI**（其他兼容服务器） | `reasoning: { effort, ... }` 原样传递 | 当 provider 期望不同的结构时，通过 `samplingParams` 设置（例如 GPT-5/o-series 的 `samplingParams.reasoning_effort`）。 |
| **Anthropic**（真实的 `api.anthropic.com`） | `output_config: { effort }` 加上 `effort-2025-11-24` beta header | 真实的 Anthropic 仅接受 `'low'`/`'medium'`/`'high'`。`'max'` 会被**截断为 `'high'`** 并输出一行 `debugLogger.warn`（每个 generator 一次）；如果你需要最大强度，请将 baseURL 切换为支持该强度的 DeepSeek 兼容端点。 |
| **Anthropic** (`api.deepseek.com/anthropic`) | 相同的 `output_config: { effort }` + beta header | `'max'` 会原样传递。 |
| **Gemini** (`@google/genai`) | `thinkingConfig: { includeThoughts: true, thinkingLevel }` | `'low'` → `LOW`，`'high'`/`'max'` → `HIGH`，其他 → `THINKING_LEVEL_UNSPECIFIED`（Gemini 没有 `MAX` 级别）。 |

### `reasoning: false`

设置 `reasoning: false`（字面量布尔值）会在所有 provider 上显式禁用思考功能——这对于不需要推理的低成本辅助查询非常有用。在请求级别，也可以通过 `request.config.thinkingConfig.includeThoughts: false` 来遵循此设置，用于一次性调用（例如建议生成）。

在 `api.deepseek.com` baseURL 下，OpenAI 管道会发出 DeepSeek V4+ 所需的显式 `thinking: { type: 'disabled' }` 字段 —— 服务端默认值为 `'enabled'`，因此仅仅省略 `reasoning_effort` 仍然会产生思考的延迟/成本。自托管的 DeepSeek 后端（sglang/vllm）和其他 OpenAI 兼容服务器**不会**接收此字段；如果你需要在这些后端上禁用思考，请通过 `samplingParams`/`extra_body` 注入 `thinking: { type: 'disabled' }`（或你的推理框架暴露的任何控制参数）。

### 与 `samplingParams` 的交互（仅限 OpenAI 兼容）

> [!warning]
>
> 当在 OpenAI 兼容 provider 上设置了 `generationConfig.samplingParams` 时，管道会将这些键**原样**发送到网络，并完全跳过单独的 `reasoning` 注入。因此，像 `{ samplingParams: { temperature: 0.5 }, reasoning: { effort: 'max' } }` 这样的配置会在 OpenAI/DeepSeek 请求中静默丢弃 reasoning 字段。
>
> 如果你设置了 `samplingParams`，请直接将推理控制参数包含在其中 —— 对于 DeepSeek，它是 `samplingParams.reasoning_effort`；对于 GPT-5/o-series，它是 `samplingParams.reasoning_effort`（其扁平字段）或 `samplingParams.reasoning`（嵌套对象）。对于 OpenRouter 和其他 provider，字段名称会有所不同；请查阅 provider 文档。
>
> Anthropic 和 Gemini 转换器不受影响 —— 无论是否设置 `samplingParams`，它们始终直接读取 `reasoning.effort`。

### `budget_tokens`

你可以通过在 `effort` 旁边包含 `budget_tokens` 来固定精确的思考 token 预算：

```jsonc
"reasoning": { "effort": "high", "budget_tokens": 50000 }
```

对于 Anthropic，这会转换为 `thinking.budget_tokens`。对于 OpenAI/DeepSeek，该字段会被保留但目前被服务端忽略 —— `reasoning_effort` 才是起实际作用的控制参数。

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

| 方面 | Provider Model | Runtime Model |
| --- | --- | --- |
| 配置来源 | 设置中的 `modelProviders` | CLI、env、settings 层 |
| 配置原子性 | 完整、不可穿透的包 | 分层，每个字段独立解析 |
| 可重用性 | 始终在 `/model` 列表中可用 | 捕获为快照，完整时显示 |
| 团队共享 | 是（通过提交的设置） | 否（用户本地） |
| 凭据存储 | 仅通过 `envKey` 引用 | 可能会在快照中捕获实际密钥 |

### 何时使用哪种

- **使用 Provider Models**：当你有团队共享的标准模型、需要一致的配置，或者想要防止意外覆盖时。
- **使用 Runtime Models**：当你快速测试新模型、使用临时凭据，或处理临时端点时。

## 选择持久化与建议

> [!important]
>
> 尽可能在用户作用域的 `~/.qwen/settings.json` 中定义 `modelProviders`，并避免在任何作用域中持久化凭据覆盖。将 provider 目录保留在用户设置中，可以防止项目作用域和用户作用域之间的合并/覆盖冲突，并确保 `/auth` 和 `/model` 的更新始终写回一致的作用域。

- `/model` 和 `/auth` 会将 `model.name`（如适用）和 `security.auth.selectedType` 持久化到已定义 `modelProviders` 的最近可写作用域；否则它们会回退到用户作用域。这使工作区/用户文件与活动的 provider 目录保持同步。
- 如果没有 `modelProviders`，解析器会混合 CLI/env/settings 层，从而创建 Runtime Models。这对于单 provider 设置来说没问题，但在频繁切换时会很繁琐。当多模型工作流很常见时，请定义 provider 目录，以便切换保持原子性、来源可追溯且可调试。