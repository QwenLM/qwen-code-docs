# 模型提供者

Qwen Code 允许你通过 `settings.json` 中的 `modelProviders` 配置来使用多个模型提供者。这样你就可以使用 `/model` 命令在不同的 AI 模型和提供者之间切换。

## 概述

使用 `modelProviders` 按认证类型声明模型，供 `/model` 选择器切换。键必须是有效的认证类型（`openai`、`anthropic`、`gemini` 等）。每个认证类型映射到一个包含 `protocol` 字段和 `models` 字段（模型定义数组）的 `ProviderConfig` 对象。`models` 中的每一项都需要一个 `id`；`envKey` 是 **可选但推荐的**（省略时，会回退到该认证类型的默认环境变量键，例如 `openai` 对应 `OPENAI_API_KEY`），此外还有可选的 `name`、`description`、`baseUrl` 和 `generationConfig`。凭据永远不会持久化在 settings 中；运行时从 `process.env[envKey]` 读取。Qwen OAuth 模型是硬编码的，无法被覆盖。

> [!note]
>
> 只有 `/model` 命令会暴露非默认的认证类型。Anthropic、Gemini 等必须通过 `modelProviders` 定义。`/auth` 命令列出三个顶层选项：**阿里云 ModelStudio**（其子菜单中包含 Coding Plan、Token Plan 和 Standard API Key）、**第三方提供者** 和 **自定义提供者**。（Qwen OAuth 不再是可选择的对话框条目；其免费套餐已于 2026-04-15 停止。）

> [!note]
>
> **模型唯一性：** 同一 `authType` 下的模型通过 `id` + `baseUrl` 的组合唯一标识。这意味着你可以在同一个 `authType` 下多次定义相同的模型 ID（例如 `"gpt-4o"`），只要每个条目的 `baseUrl` 不同即可——例如，一个指向 OpenAI 官方，另一个指向代理端点。如果两个条目的 `id` 和 `baseUrl` 都相同（或两者都省略了 `baseUrl`），则第一个条目生效，后续重复的条目会被跳过并给出警告。

## 按认证类型的配置示例

以下是针对不同认证类型的全面配置示例，展示了可用的参数及其组合。

### 支持的认证类型

`modelProviders` 对象的键必须是有效的 `authType` 值。目前支持的认证类型有：

| 认证类型       | 描述                                                                                              |
| -------------- | ------------------------------------------------------------------------------------------------- |
| `openai`       | 兼容 OpenAI 的 API（OpenAI、Azure OpenAI、本地推理服务器如 vLLM/Ollama）                          |
| `anthropic`    | Anthropic Claude API                                                                              |
| `gemini`       | Google Gemini API                                                                                 |
| `qwen-oauth`   | Qwen OAuth（硬编码，无法在 `modelProviders` 中覆盖）                                              |
| `vertex-ai`    | Google Vertex AI（使用 `gemini` 协议和 Vertex AI 模式下的 `@google/genai` SDK；选择后会设置 `GOOGLE_GENAI_USE_VERTEXAI=true`） |

> [!warning]
> 如果使用了未知的认证类型键（例如拼写错误 `"openai-custom"`），非空键会按原样作为独立的认证类型组被接受，但不会映射到已知的协议——因此其模型将无法按预期工作，并且在 `/model` 选择器中行为不正确。只有空白（空或仅含空白字符）键会被跳过。始终使用上面列出的受支持的认证类型值。

### 用于 API 请求的 SDK

Qwen Code 使用以下官方 SDK 向各个提供者发送请求：

| 认证类型       | SDK 包                                                                                             |
| -------------- | -------------------------------------------------------------------------------------------------- |
| `openai`       | [`openai`](https://www.npmjs.com/package/openai) – OpenAI 官方 Node.js SDK                         |
| `anthropic`    | [`@anthropic-ai/sdk`](https://www.npmjs.com/package/@anthropic-ai/sdk) – Anthropic 官方 SDK         |
| `gemini`       | [`@google/genai`](https://www.npmjs.com/package/@google/genai) – Google GenAI 官方 SDK              |
| `qwen-oauth`   | [`openai`](https://www.npmjs.com/package/openai) 配合自定义提供者（兼容 DashScope）                 |

这意味着你配置的 `baseUrl` 应与相应 SDK 所期望的 API 格式兼容。例如，使用 `openai` 认证类型时，端点必须接受 OpenAI API 格式的请求。

### 兼容 OpenAI 的提供者（`openai`）

此认证类型不仅支持 OpenAI 官方 API，还支持任何兼容 OpenAI 的端点，包括聚合模型提供者如 OpenRouter 和 Requesty。

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

### Anthropic（`anthropic`）

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

### Google Gemini（`gemini`）

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

### 本地自托管模型（通过兼容 OpenAI 的 API）

大多数本地推理服务器（vLLM、Ollama、LM Studio 等）都提供兼容 OpenAI 的 API 端点。使用 `openai` 认证类型并设置本地 `baseUrl` 进行配置：

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

对于不需要认证的本地服务器，你可以为 API key 使用任意占位符值：

```bash
# 对于 Ollama（无需认证）
export OLLAMA_API_KEY="ollama"

# 对于 vLLM（如果未配置认证）
export VLLM_API_KEY="not-needed"
```

> [!note]
>
> `extra_body` 参数 **仅支持兼容 OpenAI 的提供者**（`openai`、`qwen-oauth`）。对于 Anthropic 和 Gemini 提供者，该参数会被忽略。

> [!note]
>
> **关于 `envKey`**：`envKey` 字段指定的是 **环境变量的名称**，而不是实际的 API key 值。要使配置生效，你需要确保设置了相应的环境变量并赋值为你的真实 API key。有两种方式可以实现：
>
> - **方式 1：使用 `.env` 文件**（推荐，更安全）：
>   ```bash
>   # ~/.qwen/.env（或项目根目录）
>   OPENAI_API_KEY=sk-your-actual-key-here
>   ```
>   请务必将 `.env` 添加到你的 `.gitignore` 中，以防止意外提交密钥。
> - **方式 2：使用 `settings.json` 中的 `env` 字段**（如上方示例所示）：
>   ```json
>   {
>     "env": {
>       "OPENAI_API_KEY": "sk-your-actual-key-here"
>     }
>   }
>   ```
>
> 每个提供者示例中都包含一个 `env` 字段，用以说明 API key 应如何配置。

## 阿里云 Coding Plan

阿里云 Coding Plan 提供了一组预配置的 Qwen 模型，针对编码任务进行了优化。此功能适用于拥有阿里云 Coding Plan API 访问权限的用户，并提供简化的设置体验，且模型配置会自动更新。

### 概述

当你使用 `/auth` 命令使用阿里云 Coding Plan API key 进行认证时，Qwen Code 会自动配置以下模型：

| 模型 ID                 | 名称                 | 描述                                   |
| ---------------------- | -------------------- | -------------------------------------- |
| `qwen3.5-plus`         | qwen3.5-plus         | 高级模型，已启用思考功能               |
| `qwen3.6-plus`         | qwen3.6-plus         | 最新模型，已启用思考功能（仅 Pro 订阅用户） |
| `qwen3.7-plus`         | qwen3.7-plus         | 高级模型，已启用思考功能               |
| `qwen3-coder-plus`     | qwen3-coder-plus     | 针对编码任务优化                       |
| `qwen3-coder-next`     | qwen3-coder-next     | 实验性编码模型                         |
| `qwen3-max-2026-01-23` | qwen3-max-2026-01-23 | 最新最大模型，已启用思考功能           |
| `glm-5`                | glm-5                | GLM 模型，已启用思考功能               |
| `glm-4.7`              | glm-4.7              | GLM 模型，已启用思考功能               |
| `kimi-k2.5`            | kimi-k2.5            | Kimi 模型，支持思考与视觉/视频         |
| `MiniMax-M2.5`         | MiniMax-M2.5         | MiniMax 模型，已启用思考功能           |

### 设置

1. 获取阿里云 Coding Plan API key：
   - **中国站**：<https://bailian.console.aliyun.com/?tab=model#/efm/coding_plan>
   - **国际站**：<https://modelstudio.console.alibabacloud.com/?tab=dashboard#/efm/coding_plan>
2. 在 Qwen Code 中运行 `/auth` 命令
3. 选择 **阿里云 ModelStudio**，然后在子菜单中选择 **Coding Plan**
4. 选择你的区域
5. 根据提示输入你的 API key

模型将自动配置并添加到你的 `/model` 选择器中。

### 区域

阿里云 Coding Plan 支持两个区域：

| 区域                 | 端点                                            | 描述                 |
| -------------------- | ----------------------------------------------- | -------------------- |
| 中国                 | `https://coding.dashscope.aliyuncs.com/v1`      | 中国大陆端点         |
| 全球/国际            | `https://coding-intl.dashscope.aliyuncs.com/v1` | 国际端点             |

区域在认证时选择，并存储在 `settings.json` 的 `modelProviders` 配置中。要切换区域，请重新运行 `/auth` 命令并选择不同的区域。

### API Key 存储

当你通过 `/auth` 命令配置 Coding Plan 时，API key 会使用保留的环境变量名称 `BAILIAN_CODING_PLAN_API_KEY` 进行存储。默认情况下，它存储在 `settings.json` 文件的 `env` 字段中。

> [!warning]
>
> **安全建议**：为了更好的安全性，建议将 API key 从 `settings.json` 移到单独的 `.env` 文件中，并将其作为环境变量加载。例如：
>
> ```bash
> # ~/.qwen/.env
> BAILIAN_CODING_PLAN_API_KEY=your-api-key-here
> ```
>
> 然后确保此文件已添加到 `.gitignore`（如果你使用的是项目级设置）。

### 自动更新

Coding Plan 模型配置是版本化的。当 Qwen Code 检测到模型模板的新版本时，系统会提示你进行更新。接受更新将：

- 用最新版本替换现有的 Coding Plan 模型配置
- 保留你手动添加的任何自定义模型配置
- 自动切换到更新后配置中的第一个模型

更新过程确保你无需手动干预即可始终使用最新的模型配置和功能。

### 手动配置（高级）

如果你更愿意手动配置 Coding Plan 模型，可以像配置任何兼容 OpenAI 的提供者一样，将其添加到 `settings.json` 中：

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
> - 你可以为 `envKey` 使用任意的环境变量名称
> - 你不需要配置 `codingPlan.*`
> - **自动更新不会应用于** 手动配置的 Coding Plan 模型

> [!warning]
>
> 如果你同时使用了自动 Coding Plan 配置，那么自动更新可能会覆盖你的手动配置（如果它们使用了与自动配置相同的 `envKey` 和 `baseUrl`）。为避免这种情况，请确保你的手动配置尽可能使用不同的 `envKey`。

## 解析层级与原子性

最终的认证类型/模型/凭据值按字段使用以下优先级（第一个存在的获胜）。你可以将 `--auth-type` 与 `--model` 结合使用，直接指向某个提供者条目；这些 CLI 标志在其他层级之前运行。

| 层级（最高 → 最低）     | authType                            | model                                           | apiKey                                                | baseUrl                                                | apiKeyEnvKey           | proxy                             |
| ------------------------ | ----------------------------------- | ----------------------------------------------- | ----------------------------------------------------- | ------------------------------------------------------ | ---------------------- | --------------------------------- |
| 程序化覆盖               | `/auth`                             | `/auth` 输入                                   | `/auth` 输入                                         | `/auth` 输入                                          | —                      | —                                 |
| 模型提供者选择           | —                                   | `modelProvider.id`                              | `env[modelProvider.envKey]`                           | `modelProvider.baseUrl`                                | `modelProvider.envKey` | —                                 |
| CLI 参数                 | `--auth-type`                       | `--model`                                       | `--openai-api-key`（或其他提供者对应参数）           | `--openai-base-url`（或其他提供者对应参数）           | —                      | —                                 |
| 环境变量                 | —                                   | 提供者特定映射（例如 `OPENAI_MODEL`）            | 提供者特定映射（例如 `OPENAI_API_KEY`）                | 提供者特定映射（例如 `OPENAI_BASE_URL`）                | —                      | —                                 |
| 设置（`settings.json`）  | `security.auth.selectedType`        | `model.name`                                    | `security.auth.apiKey`                                | `security.auth.baseUrl`                                | —                      | —                                 |
| 默认值 / 计算值          | 回退到 `AuthType.QWEN_OAUTH`        | 内置默认（OpenAI ⇒ `qwen3.5-plus`）            | —                                                     | —                                                      | —                      | `Config.getProxy()`（如果配置了） |
\*当存在 CLI 认证标志时，它们会覆盖设置。否则，`security.auth.selectedType` 或隐式默认值决定认证类型。Qwen OAuth 和 OpenAI 是唯一无需额外配置即可显示的认证类型。

> [!warning]
>
> **`security.auth.apiKey` 和 `security.auth.baseUrl` 已弃用：** 直接在 `settings.json` 中通过 `security.auth.apiKey` 和 `security.auth.baseUrl` 配置 API 凭据的方式已弃用。这些设置曾在历史版本中用于 UI 输入的凭据，但凭据输入流程已在 0.10.1 版本中移除。这些字段将在未来的版本中完全移除。**强烈建议迁移至 `modelProviders`** 进行所有模型和凭据配置。在 `modelProviders` 中使用 `envKey` 引用环境变量，以实现安全的凭据管理，而不是在设置文件中硬编码凭据。

## 生成配置分层：不可穿透的 Provider 层

配置解析遵循严格的分层模型，其核心规则是：**modelProvider 层是不可穿透的**。

### 工作原理

1. **当选择了 modelProvider 中的模型时**（例如，通过 `/model` 命令选择了一个由 provider 配置的模型）：
   - Provider 的整个 `generationConfig` 将被**原子性地**应用
   - **Provider 层是完全不可穿透的**——更低层（CLI、环境变量、设置）完全不参与 generationConfig 的解析
   - `modelProviders[].generationConfig` 中定义的所有字段都使用 provider 的值
   - Provider **未定义**的所有字段都被设置为 `undefined`（不从设置中继承）
   - 这确保了 provider 的配置作为一个完整的、自包含的“密封包”运行

   如果一个模型列在了 `modelProviders` 中，请将该模型的所有特定生成设置放在对应的 provider 条目中。顶层的 `model.generationConfig` 值，包括 `contextWindowSize`、`modalities`、`customHeaders` 和 `extra_body`，对于 provider 模型将被忽略。要使这些字段生效，请在 `modelProviders[authType][].generationConfig` 下配置它们。

2. **当没有选择 modelProvider 中的模型时**（例如，使用 `--model` 指定原始模型 ID，或直接使用 CLI/环境变量/设置）：
   - 解析会回退到更低层
   - 字段从 CLI → 环境变量 → 设置 → 默认值依次填充
   - 这会创建一个**运行时模型**（Runtime Model，见下一节）

### `generationConfig` 各字段的优先级

| 优先级 | 来源                                        | 行为                                                                                           |
| ------ | ------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| 1      | 程序性覆盖                                  | 运行时 `/model`、`/auth` 更改                                                                  |
| 2      | `modelProviders[authType][].generationConfig` | **不可穿透层**——完全替换所有 generationConfig 字段；更低层不参与                                |
| 3      | `settings.model.generationConfig`           | 仅用于**运行时模型**（当未选择 provider 模型时）                                                |
| 4      | 内容生成器默认值                            | Provider 特定默认值（例如 OpenAI vs Gemini）——仅用于运行时模型                                 |

### 原子字段处理

以下字段被视为原子对象——provider 的值完全替换整个对象，不进行合并：

- `samplingParams`——Temperature、top_p、max_tokens 等
- `customHeaders`——自定义 HTTP 头
- `extra_body`——额外的请求体参数

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

当从 modelProviders 选择 `gpt-4o` 时：

- `timeout` = 60000（来自 provider，覆盖设置）
- `samplingParams.temperature` = 0.2（来自 provider，完全替换设置中的对象）
- `samplingParams.max_tokens` = **undefined**（provider 中未定义，且 provider 层不从设置继承——如果未提供，则字段显式设置为 undefined）

当使用原始模型 `--model gpt-4` 时（不在 modelProviders 中，创建运行时模型）：

- `timeout` = 30000（来自设置）
- `samplingParams.temperature` = 0.5（来自设置）
- `samplingParams.max_tokens` = 1000（来自设置）

`modelProviders` 本身的合并策略是替换（REPLACE）：项目设置中的整个 `modelProviders` 将覆盖用户设置中的对应部分，而不是合并两者。

## 推理/思考配置

`generationConfig` 下的可选字段 `reasoning` 控制模型在响应前进行推理的强度。Anthropic 和 Gemini 转换器始终遵循该配置。OpenAI 兼容管道会遵循该配置，**除非**设置了 `generationConfig.samplingParams`——请参见下方的“与 `samplingParams` 的交互”注意事项。

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
            //   'low'    | 'medium' — 在 DeepSeek 上服务端映射为 'high'
            //   'high'   — 默认推理强度
            //   'max'    — DeepSeek 特有的超强级别
            // 或者设为 `false` 完全禁用推理。
            "reasoning": { "effort": "max" },
          },
        },
      ],
    },
  },
}
```

### 各 Provider 的行为

| 协议 / Provider                              | 传输格式                                                        | 说明                                                                                                                                                                                                                                                                                                                                                                                                                            |
| -------------------------------------------- | --------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **OpenAI / DeepSeek** (`api.deepseek.com`)   | 扁平化 `reasoning_effort: <effort>` 请求体参数                  | 当嵌套配置结构中设置了 `reasoning.effort` 时，会将其重写为扁平化的 `reasoning_effort`，并将 `'low'`/`'medium'` 归一化为 `'high'`，`'xhigh'` 归一化为 `'max'`——与 DeepSeek 的[服务端向后兼容](https://api-docs.deepseek.com/zh-cn/api/create-chat-completion)一致。顶层的 `samplingParams.reasoning_effort` 或 `extra_body.reasoning_effort` 会跳过此归一化，按原样发送。                                                                 |
| **OpenAI**（其他兼容服务器）                 | `reasoning: { effort, ... }` 原样传递                           | 当 provider 期望不同的格式时，通过 `samplingParams` 设置（例如 GPT-5/o 系列使用 `samplingParams.reasoning_effort`）。                                                                                                                                                                                                                                                                                                             |
| **Anthropic**（真实 `api.anthropic.com`）    | `output_config: { effort }` 加上 `effort-2025-11-24` beta 头    | 真实 Anthropic 仅接受 `'low'`/`'medium'`/`'high'`。`'max'` 会被**限制为 `'high'`**，并输出 `debugLogger.warn`（每个生成器一次）；如果你需要最大强度，请将 baseURL 切换到支持它的 DeepSeek 兼容端点。                                                                                                                                                                                                                               |
| **Anthropic**（`api.deepseek.com/anthropic`）| 相同的 `output_config: { effort }` + beta 头                    | `'max'` 保持不变，按原样传递。                                                                                                                                                                                                                                                                                                                                                                                                   |
| **Gemini**（`@google/genai`）                | `thinkingConfig: { includeThoughts: true, thinkingLevel }`      | `'low'` → `LOW`，`'high'`/`'max'` → `HIGH`，其他 → `THINKING_LEVEL_UNSPECIFIED`（Gemini 没有 `MAX` 级别）。                                                                                                                                                                                                                                                                                                                    |

### `reasoning: false`

将 `reasoning` 设为 `false`（布尔值字面量）可显式禁用所有 provider 上的思考功能——适用于不需要推理的廉价侧边查询。也可在请求级别通过 `request.config.thinkingConfig.includeThoughts: false` 实现单次禁用（例如建议生成）。

对于 `api.deepseek.com` 的 baseURL，OpenAI 管道会发送显式的 `thinking: { type: 'disabled' }` 字段，这是 DeepSeek V4+ 所必需的——服务端默认值为 `'enabled'`，因此仅省略 `reasoning_effort` 仍会付出思考的延迟/成本。自托管 DeepSeek 后端（sglang/vllm）和其他 OpenAI 兼容服务器**不会接收到**此字段；如果你需要在这些服务器上禁用思考，请通过 `samplingParams`/`extra_body` 注入 `thinking: { type: 'disabled' }`（或你的推理框架暴露的任何开关）。

### 与 `samplingParams` 的交互（仅限 OpenAI 兼容）

> [!warning]
>
> 当在 OpenAI 兼容的 provider 上设置了 `generationConfig.samplingParams` 时，管道会将这些键**原封不动地**发送到线路，并完全跳过单独的 `reasoning` 注入。因此，像 `{ samplingParams: { temperature: 0.5 }, reasoning: { effort: 'max' } }` 这样的配置会在 OpenAI/DeepSeek 请求中静默丢弃 reasoning 字段。
>
> 如果你设置了 `samplingParams`，请将推理开关直接包含在其中——对于 DeepSeek 是 `samplingParams.reasoning_effort`，对于 GPT-5/o 系列是 `samplingParams.reasoning_effort`（它们的扁平字段）或 `samplingParams.reasoning`（嵌套对象）。对于 OpenRouter 和其他 provider，字段名称可能不同，请查阅 provider 文档。
>
> Anthropic 和 Gemini 转换器不受影响——它们始终直接读取 `reasoning.effort`，无论 `samplingParams` 如何。

### `budget_tokens`

你可以通过将 `budget_tokens` 与 `effort` 一起包含来指定精确的思考令牌预算：

```jsonc
"reasoning": { "effort": "high", "budget_tokens": 50000 }
```

对于 Anthropic，这变为 `thinking.budget_tokens`。对于 OpenAI/DeepSeek，该字段被保留但当前被服务器忽略——`reasoning_effort` 是控制推理强度的关键参数。

## Provider 模型 vs 运行时模型

Qwen Code 区分两种类型的模型配置：

### Provider 模型

- 在 `modelProviders` 配置中定义
- 具有完整、原子性的配置包
- 选择后，其配置作为不可穿透层应用
- 出现在 `/model` 命令列表中，包含完整的元数据（名称、描述、能力）
- 推荐用于多模型工作流和团队一致性

### 运行时模型

- 通过 CLI（`--model`）、环境变量或设置使用原始模型 ID 时动态创建
- 不在 `modelProviders` 中定义
- 配置通过“投射”解析层（CLI → 环境变量 → 设置 → 默认值）构建
- 检测到完整配置时，自动捕获为 **RuntimeModelSnapshot**
- 允许无需重新输入凭据即可重用

### RuntimeModelSnapshot 生命周期

当你未使用 `modelProviders` 配置模型时，Qwen Code 会自动创建一个 RuntimeModelSnapshot 来保存你的配置：

```bash
# 这会创建一个 ID 为 $runtime|openai|my-custom-model 的 RuntimeModelSnapshot
qwen --auth-type openai --model my-custom-model --openai-api-key $KEY --openai-base-url https://api.example.com/v1
```

该快照：

- 捕获模型 ID、API 密钥、base URL 和生成配置
- 在会话之间持久化（运行时存储在内存中）
- 出现在 `/model` 命令列表中，作为运行时选项
- 可以通过 `/model $runtime|openai|my-custom-model` 切换

### 关键区别

| 方面         | Provider 模型                   | 运行时模型                                 |
| ------------ | ------------------------------- | ------------------------------------------ |
| 配置来源     | 设置中的 `modelProviders`       | CLI、环境变量、设置层                      |
| 配置原子性   | 完整、不可穿透的包              | 分层，每个字段独立解析                     |
| 可重用性     | 始终在 `/model` 列表中可用      | 作为快照捕获，完整时出现                   |
| 团队共享     | 是（通过提交的设置）            | 否（用户本地）                             |
| 凭据存储     | 仅通过 `envKey` 引用            | 可能在快照中捕获实际密钥                   |

### 何时使用哪种

- **使用 Provider 模型**：当你有团队共享的标准模型、需要一致的配置，或希望防止意外覆盖时
- **使用运行时模型**：当快速测试新模型、使用临时凭据，或使用临时端点时

## 选择持久化与建议

> [!important]
>
> 尽可能在用户作用域 `~/.qwen/settings.json` 中定义 `modelProviders`，并避免在任何作用域中持久化凭据覆盖。将 provider 目录放在用户设置中，可以防止项目作用域和用户作用域之间的合并/覆盖冲突，并确保 `/auth` 和 `/model` 的更新始终写回一致的作用域。

- `/model` 和 `/auth` 将 `model.name`（如适用）和 `security.auth.selectedType` 持久化到最近的可写作用域（该作用域已定义 `modelProviders`）；否则回退到用户作用域。这使工作空间/用户文件与活动的 provider 目录保持同步。
- 没有 `modelProviders` 时，解析器混合 CLI/环境变量/设置层，创建运行时模型。这对于单 provider 设置可以接受，但在频繁切换时很麻烦。只要多模型工作流很常见，就定义 provider 目录，这样切换保持原子性、来源可追溯且可调试。