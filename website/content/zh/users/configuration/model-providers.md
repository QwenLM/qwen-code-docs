# 模型提供商

Qwen Code 支持通过 `settings.json` 中的 `modelProviders` 配置多个模型提供商。配置完成后，你可以使用 `/model` 命令在不同 AI 模型和提供商之间切换。

## 概述

使用 `modelProviders` 声明各认证类型对应的模型，供 `/model` 选择器切换。键名必须是合法的认证类型（`openai`、`anthropic`、`gemini` 等）。每个认证类型对应一个 `ProviderConfig` 对象，包含 `protocol` 字段和 `models` 字段（模型定义数组）。`models` 中的每条记录必须包含 `id`；`envKey` 是**可选但推荐**的字段（省略时回退到该认证类型的默认环境变量，如 `openai` 对应 `OPENAI_API_KEY`），还支持可选的 `name`、`description`、`baseUrl` 和 `generationConfig`。凭据不会持久化存储到 settings 中，运行时通过 `process.env[envKey]` 读取。Qwen OAuth 模型为硬编码内置，不可通过 `modelProviders` 覆盖。

> [!note]
>
> 只有 `/model` 命令才会暴露非默认认证类型。Anthropic、Gemini 等必须通过 `modelProviders` 定义。`/auth` 命令提供三个顶级选项：**Alibaba ModelStudio**（子菜单包含 Coding Plan、Token Plan 和标准 API Key）、**Third-party Providers** 以及 **Custom Provider**。（Qwen OAuth 已不再作为可选对话框入口；其免费套餐已于 2026-04-15 终止。）

> [!note]
>
> **模型唯一性：** 同一 `authType` 下的模型通过 `id` + `baseUrl` 的组合唯一标识。这意味着你可以在同一 `authType` 下多次定义相同的模型 ID（如 `"gpt-4o"`），只要每条记录的 `baseUrl` 不同——例如一条指向 OpenAI 官方，另一条指向代理端点。如果两条记录的 `id` 和 `baseUrl` 均相同（或均未填写 `baseUrl`），则第一条生效，后续重复项将被跳过并输出警告。

## 各认证类型配置示例

以下为不同认证类型的完整配置示例，展示了可用参数及其组合方式。

### 支持的认证类型

`modelProviders` 对象的键名必须是合法的 `authType` 值。目前支持的认证类型如下：

| Auth Type    | 说明                                                                                                                                               |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `openai`     | OpenAI 兼容 API（OpenAI、Azure OpenAI、本地推理服务器如 vLLM/Ollama）                                                                              |
| `anthropic`  | Anthropic Claude API                                                                                                                               |
| `gemini`     | Google Gemini API                                                                                                                                  |
| `qwen-oauth` | Qwen OAuth（硬编码内置，不可在 `modelProviders` 中覆盖）                                                                                           |
| `vertex-ai`  | Google Vertex AI（使用 `gemini` 协议和 Vertex AI 模式下的 `@google/genai` SDK；选择后会设置 `GOOGLE_GENAI_USE_VERTEXAI=true`）                      |

> [!warning]
> 如果使用了未知的认证类型键名（如拼写错误的 `"openai-custom"`），非空键名会被原样接受为独立的 auth-type 分组，但不会映射到已知协议——因此其下的模型无法正常工作，在 `/model` 选择器中也不会正确显示。只有空（或纯空白）键名才会被跳过。请始终使用上表中列出的支持认证类型值。

### API 请求使用的 SDK

Qwen Code 使用以下官方 SDK 向各提供商发送请求：

| Auth Type    | SDK 包                                                                                            |
| ------------ | ------------------------------------------------------------------------------------------------- |
| `openai`     | [`openai`](https://www.npmjs.com/package/openai) - OpenAI 官方 Node.js SDK                        |
| `anthropic`  | [`@anthropic-ai/sdk`](https://www.npmjs.com/package/@anthropic-ai/sdk) - Anthropic 官方 SDK       |
| `gemini`     | [`@google/genai`](https://www.npmjs.com/package/@google/genai) - Google GenAI 官方 SDK            |
| `qwen-oauth` | [`openai`](https://www.npmjs.com/package/openai) 配合自定义提供商（兼容 DashScope）               |

因此，你配置的 `baseUrl` 需要与对应 SDK 期望的 API 格式兼容。例如，使用 `openai` 认证类型时，端点必须接受 OpenAI API 格式的请求。

### OpenAI 兼容提供商（`openai`）

此认证类型不仅支持 OpenAI 官方 API，还支持所有 OpenAI 兼容端点，包括 OpenRouter、Requesty 等聚合模型提供商。

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

### 本地自托管模型（通过 OpenAI 兼容 API）

大多数本地推理服务器（vLLM、Ollama、LM Studio 等）都提供 OpenAI 兼容的 API 端点。使用 `openai` 认证类型并填写本地 `baseUrl` 即可完成配置：

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

对于不需要认证的本地服务器，API key 可填任意占位值：

```bash
# Ollama（不需要认证）
export OLLAMA_API_KEY="ollama"

# vLLM（未配置认证时）
export VLLM_API_KEY="not-needed"
```

> [!note]
>
> `extra_body` 参数**仅支持 OpenAI 兼容提供商**（`openai`、`qwen-oauth`），对 Anthropic 和 Gemini 提供商无效。

> [!note]
>
> **关于 `envKey`**：`envKey` 字段指定的是**环境变量的名称**，而非实际的 API key 值。要使配置生效，需要确保对应的环境变量已设置为你的真实 API key。有两种方式：
>
> - **方式一：使用 `.env` 文件**（推荐，更安全）：
>   ```bash
>   # ~/.qwen/.env（或项目根目录）
>   OPENAI_API_KEY=sk-your-actual-key-here
>   ```
>   请务必将 `.env` 添加到 `.gitignore`，避免意外提交密钥。
> - **方式二：在 `settings.json` 的 `env` 字段中配置**（如上方示例所示）：
>   ```json
>   {
>     "env": {
>       "OPENAI_API_KEY": "sk-your-actual-key-here"
>     }
>   }
>   ```
>
> 每个提供商示例均包含 `env` 字段，用于说明如何配置 API key。

## 阿里云 Coding Plan

阿里云 Coding Plan 提供了一套针对编程任务优化的预配置 Qwen 模型。该功能面向拥有阿里云 Coding Plan API 访问权限的用户，提供简化的配置体验，并支持模型配置自动更新。

### 概述

使用 `/auth` 命令通过阿里云 Coding Plan API key 完成认证后，Qwen Code 会自动配置以下模型：

| Model ID               | 名称                 | 说明                                                   |
| ---------------------- | -------------------- | ------------------------------------------------------ |
| `qwen3.5-plus`         | qwen3.5-plus         | 高级模型，已启用 thinking                              |
| `qwen3.6-plus`         | qwen3.6-plus         | 最新模型，已启用 thinking（仅 Pro 订阅者可用）         |
| `qwen3.7-plus`         | qwen3.7-plus         | 高级模型，已启用 thinking                              |
| `qwen3-coder-plus`     | qwen3-coder-plus     | 针对编程任务优化                                       |
| `qwen3-coder-next`     | qwen3-coder-next     | 实验性编程模型                                         |
| `qwen3-max-2026-01-23` | qwen3-max-2026-01-23 | 最新 max 模型，已启用 thinking                         |
| `glm-5`                | glm-5                | GLM 模型，已启用 thinking                              |
| `glm-4.7`              | glm-4.7              | GLM 模型，已启用 thinking                              |
| `kimi-k2.5`            | kimi-k2.5            | Kimi 模型，已启用 thinking，支持视觉/视频              |
| `MiniMax-M2.5`         | MiniMax-M2.5         | MiniMax 模型，已启用 thinking                          |

### 配置步骤

1. 获取阿里云 Coding Plan API key：
   - **中国区**：<https://bailian.console.aliyun.com/?tab=model#/efm/coding_plan>
   - **国际区**：<https://modelstudio.console.alibabacloud.com/?tab=dashboard#/efm/coding_plan>
2. 在 Qwen Code 中运行 `/auth` 命令
3. 选择 **Alibaba ModelStudio**，然后在子菜单中选择 **Coding Plan**
4. 选择你的区域
5. 按提示输入你的 API key

模型将自动完成配置并添加到 `/model` 选择器中。

### 区域

阿里云 Coding Plan 支持两个区域：

| 区域     | 端点                                             | 说明             |
| -------- | ------------------------------------------------ | ---------------- |
| 中国区   | `https://coding.dashscope.aliyuncs.com/v1`       | 中国大陆端点     |
| 国际区   | `https://coding-intl.dashscope.aliyuncs.com/v1`  | 国际端点         |

区域在认证时选定，并存储在 `settings.json` 的 `modelProviders` 配置中。如需切换区域，重新运行 `/auth` 命令并选择其他区域即可。

### API Key 存储

通过 `/auth` 命令配置 Coding Plan 时，API key 将使用保留的环境变量名 `BAILIAN_CODING_PLAN_API_KEY` 进行存储。默认情况下，它存储在 `settings.json` 的 `env` 字段中。

> [!warning]
>
> **安全建议**：为了更好的安全性，建议将 API key 从 `settings.json` 迁移到单独的 `.env` 文件中，并以环境变量方式加载。例如：
>
> ```bash
> # ~/.qwen/.env
> BAILIAN_CODING_PLAN_API_KEY=your-api-key-here
> ```
>
> 如果使用项目级 settings，请确保将该文件添加到 `.gitignore`。

### 自动更新

Coding Plan 模型配置有版本管理。当 Qwen Code 检测到更新版本的模型模板时，会提示你进行更新。接受更新后将：

- 将现有 Coding Plan 模型配置替换为最新版本
- 保留你手动添加的自定义模型配置
- 自动切换到更新后配置中的第一个模型

更新过程确保你无需手动干预，即可始终使用最新的模型配置和功能。

### 手动配置（高级）

如果你希望手动配置 Coding Plan 模型，可以像配置其他 OpenAI 兼容提供商一样将其添加到 `settings.json`：

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
> - `envKey` 可使用任意环境变量名
> - 无需配置 `codingPlan.*`
> - **自动更新不会应用**于手动配置的 Coding Plan 模型

> [!warning]
>
> 如果你同时使用自动 Coding Plan 配置，且手动配置与自动配置使用相同的 `envKey` 和 `baseUrl`，自动更新可能会覆盖你的手动配置。为避免此问题，请尽量为手动配置使用不同的 `envKey`。

## 解析层与原子性

有效的 auth/model/credential 值按以下优先级逐字段选取（以第一个存在的为准）。你可以将 `--auth-type` 与 `--model` 组合使用，直接指向某个提供商条目；这些 CLI 标志优先于其他层处理。

| 层级（优先级从高到低）  | authType                            | model                                               | apiKey                                                 | baseUrl                                                   | apiKeyEnvKey           | proxy                             |
| ----------------------- | ----------------------------------- | --------------------------------------------------- | ------------------------------------------------------ | --------------------------------------------------------- | ---------------------- | --------------------------------- |
| 程序化覆盖              | `/auth`                             | `/auth` 输入                                        | `/auth` 输入                                           | `/auth` 输入                                              | —                      | —                                 |
| 模型提供商选择          | —                                   | `modelProvider.id`                                  | `env[modelProvider.envKey]`                            | `modelProvider.baseUrl`                                   | `modelProvider.envKey` | —                                 |
| CLI 参数                | `--auth-type`                       | `--model`                                           | `--openai-api-key`（或特定提供商等效参数）             | `--openai-base-url`（或特定提供商等效参数）               | —                      | —                                 |
| 环境变量                | —                                   | 特定提供商映射（如 `OPENAI_MODEL`）                 | 特定提供商映射（如 `OPENAI_API_KEY`）                  | 特定提供商映射（如 `OPENAI_BASE_URL`）                    | —                      | —                                 |
| Settings（`settings.json`） | `security.auth.selectedType`    | `model.name`                                        | `security.auth.apiKey`                                 | `security.auth.baseUrl`                                   | —                      | —                                 |
| 默认值/计算值           | 回退到 `AuthType.QWEN_OAUTH`        | 内置默认值（OpenAI ⇒ `qwen3.5-plus`）               | —                                                      | —                                                         | —                      | 如已配置则使用 `Config.getProxy()` |

\*存在时，CLI auth 标志会覆盖 settings。否则，`security.auth.selectedType` 或隐式默认值决定认证类型。Qwen OAuth 和 OpenAI 是无需额外配置即可使用的认证类型。

> [!warning]
>
> **`security.auth.apiKey` 和 `security.auth.baseUrl` 已废弃：** 在 `settings.json` 中直接通过 `security.auth.apiKey` 和 `security.auth.baseUrl` 配置 API 凭据的方式已废弃。这些设置在历史版本中用于存储通过 UI 输入的凭据，但凭据输入流程已在 0.10.1 版本中移除。这些字段将在未来版本中完全删除。**强烈建议迁移到 `modelProviders`** 来管理所有模型和凭据配置。使用 `modelProviders` 中的 `envKey` 引用环境变量进行安全凭据管理，而非在 settings 文件中硬编码凭据。

## 生成配置分层：不可穿透的提供商层

配置解析遵循严格的分层模型，其中有一条关键规则：**modelProvider 层是不可穿透的**。

### 工作原理

1. **当选择了 modelProvider 模型时**（如通过 `/model` 命令选择了提供商配置的模型）：
   - 提供商的整个 `generationConfig` 将**原子性**地应用
   - **提供商层完全不可穿透** — 低优先级层（CLI、环境变量、settings）完全不参与 generationConfig 的解析
   - `modelProviders[].generationConfig` 中定义的所有字段使用提供商的值
   - 提供商**未定义**的字段设为 `undefined`（不从 settings 继承）
   - 这确保了提供商配置作为一个完整、自包含的"密封包"来运作

   如果模型在 `modelProviders` 中有定义，请将该模型所有特定于模型的
   generation settings 放在对应的提供商条目中。顶层的
   `model.generationConfig` 值（包括 `contextWindowSize`、
   `modalities`、`customHeaders` 和 `extra_body`）对提供商模型无效。
   这些字段需配置在 `modelProviders[authType][].generationConfig` 下才会生效。

2. **当未选择任何 modelProvider 模型时**（如通过 `--model` 使用原始模型 ID，或直接使用 CLI/环境变量/settings）：
   - 解析将降至低优先级层
   - 字段从 CLI → 环境变量 → settings → 默认值依次填充
   - 此时会自动创建一个 **RuntimeModel**（详见下一节）

### `generationConfig` 的逐字段优先级

| 优先级 | 来源                                          | 行为                                                                                                            |
| ------ | --------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| 1      | 程序化覆盖                                    | 运行时 `/model`、`/auth` 变更                                                                                   |
| 2      | `modelProviders[authType][].generationConfig` | **不可穿透层** — 完全替换所有 generationConfig 字段，低优先级层不参与                                          |
| 3      | `settings.model.generationConfig`             | 仅用于 **Runtime Models**（未选择提供商模型时）                                                                 |
| 4      | 内容生成器默认值                              | 特定提供商默认值（如 OpenAI vs Gemini）— 仅用于 Runtime Models                                                  |

### 原子字段处理

以下字段被视为原子对象——提供商值会完全替换整个对象，不会进行合并：

- `samplingParams` — temperature、top_p、max_tokens 等
- `customHeaders` — 自定义 HTTP headers
- `extra_body` — 额外的请求体参数

### 示例

```jsonc
// 用户 settings (~/.qwen/settings.json)
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

从 modelProviders 中选择 `gpt-4o` 时：

- `timeout` = 60000（来自提供商，覆盖 settings）
- `samplingParams.temperature` = 0.2（来自提供商，完全替换 settings 中的对象）
- `samplingParams.max_tokens` = **undefined**（提供商未定义，且提供商层不从 settings 继承——未提供的字段会被显式设为 undefined）

通过 `--model gpt-4` 使用原始模型时（不来自 modelProviders，创建 Runtime Model）：

- `timeout` = 30000（来自 settings）
- `samplingParams.temperature` = 0.5（来自 settings）
- `samplingParams.max_tokens` = 1000（来自 settings）

`modelProviders` 本身的合并策略为 REPLACE：项目 settings 中的整个 `modelProviders` 将覆盖用户 settings 中的对应部分，而不是合并两者。

## 推理/思考配置

`generationConfig` 下的可选 `reasoning` 字段控制模型在响应前的推理强度。Anthropic 和 Gemini 转换器始终遵循此字段。OpenAI 兼容管道在**未设置 `generationConfig.samplingParams`** 时遵循此字段——详见下方"与 `samplingParams` 的交互"注意事项。

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
            //   'low'    | 'medium' — 服务端映射为 DeepSeek 的 'high'
            //   'high'   — 默认推理强度
            //   'max'    — DeepSeek 专属超强档位
            // 或设为 `false` 完全禁用推理。
            "reasoning": { "effort": "max" },
          },
        },
      ],
    },
  },
}
```

### 各提供商行为

| 协议/提供商                                      | 请求体格式                                                            | 说明                                                                                                                                                                                                                                                                                                                                                                          |
| ------------------------------------------------ | --------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **OpenAI / DeepSeek** (`api.deepseek.com`)       | 扁平的 `reasoning_effort: <effort>` 请求体参数                        | 当嵌套配置中设置了 `reasoning.effort` 时，会被改写为扁平的 `reasoning_effort`，且 `'low'`/`'medium'` 会标准化为 `'high'`，`'xhigh'` 标准化为 `'max'`——与 DeepSeek 的[服务端向后兼容](https://api-docs.deepseek.com/zh-cn/api/create-chat-completion)保持一致。通过顶层 `samplingParams.reasoning_effort` 或 `extra_body.reasoning_effort` 设置的覆盖值会跳过标准化，直接原样发送。 |
| **OpenAI**（其他兼容服务器）                     | `reasoning: { effort, ... }` 原样传递                                 | 当提供商期望不同格式时，通过 `samplingParams` 设置（如 GPT-5/o 系列用 `samplingParams.reasoning_effort`）。                                                                                                                                                                                                                                                                   |
| **Anthropic**（真实 `api.anthropic.com`）        | `output_config: { effort }` 加 `effort-2025-11-24` beta header        | 真实 Anthropic 仅接受 `'low'`/`'medium'`/`'high'`。`'max'` 会被**截断为 `'high'`**，并通过 `debugLogger.warn` 输出一次警告；如需最大强度，请将 baseURL 切换到支持该选项的 DeepSeek 兼容端点。                                                                                                                                                                                |
| **Anthropic**（`api.deepseek.com/anthropic`）    | 同样的 `output_config: { effort }` + beta header                      | `'max'` 原样传递。                                                                                                                                                                                                                                                                                                                                                            |
| **Gemini**（`@google/genai`）                    | `thinkingConfig: { includeThoughts: true, thinkingLevel }`            | `'low'` → `LOW`，`'high'`/`'max'` → `HIGH`，其他 → `THINKING_LEVEL_UNSPECIFIED`（Gemini 没有 `MAX` 档位）。                                                                                                                                                                                                                                                                  |

### `reasoning: false`

将 `reasoning` 设为 `false`（布尔字面量）会在所有提供商上明确禁用思考——适用于不需要推理的轻量查询。这也在请求级别生效，通过 `request.config.thinkingConfig.includeThoughts: false` 用于一次性调用（如建议生成）。

在 `api.deepseek.com` baseURL 下，OpenAI 管道会发出 DeepSeek V4+ 所需的显式 `thinking: { type: 'disabled' }` 字段——服务端默认值为 `'enabled'`，因此仅省略 `reasoning_effort` 仍会产生思考延迟/成本。自托管的 DeepSeek 后端（sglang/vllm）和其他 OpenAI 兼容服务器**不会**接收此字段；如需在这些服务器上禁用思考，请通过 `samplingParams`/`extra_body` 注入 `thinking: { type: 'disabled' }`（或你的推理框架所暴露的对应配置项）。

### 与 `samplingParams` 的交互（仅 OpenAI 兼容）

> [!warning]
>
> 当 OpenAI 兼容提供商设置了 `generationConfig.samplingParams` 时，管道会将这些键**原样**发送到请求体，并完全跳过 `reasoning` 注入。因此，类似 `{ samplingParams: { temperature: 0.5 }, reasoning: { effort: 'max' } }` 的配置在 OpenAI/DeepSeek 请求中会静默忽略 reasoning 字段。
>
> 如果设置了 `samplingParams`，请将推理配置直接包含在其中——对于 DeepSeek 是 `samplingParams.reasoning_effort`，对于 GPT-5/o 系列是 `samplingParams.reasoning_effort`（扁平字段）或 `samplingParams.reasoning`（嵌套对象）。对于 OpenRouter 及其他提供商，字段名称各异，请查阅对应文档。
>
> Anthropic 和 Gemini 转换器不受影响——无论是否设置 `samplingParams`，它们始终直接读取 `reasoning.effort`。

### `budget_tokens`

可以通过在 `effort` 旁边添加 `budget_tokens` 来指定精确的思考 token 预算：

```jsonc
"reasoning": { "effort": "high", "budget_tokens": 50000 }
```

对于 Anthropic，这会转换为 `thinking.budget_tokens`。对于 OpenAI/DeepSeek，该字段会保留，但目前服务端会忽略它——`reasoning_effort` 才是核心配置项。

## 提供商模型 vs 运行时模型

Qwen Code 区分两种模型配置类型：

### 提供商模型（Provider Model）

- 在 `modelProviders` 配置中定义
- 拥有完整的原子配置包
- 选择后，其配置作为不可穿透层应用
- 在 `/model` 命令列表中显示完整元数据（name、description、capabilities）
- 推荐用于多模型工作流和团队一致性场景

### 运行时模型（Runtime Model）

- 通过 CLI（`--model`）、环境变量或 settings 使用原始模型 ID 时动态创建
- 不在 `modelProviders` 中定义
- 配置通过"投影"解析层（CLI → 环境变量 → settings → 默认值）构建
- 检测到完整配置时自动捕获为 **RuntimeModelSnapshot**
- 支持复用而无需重新输入凭据

### RuntimeModelSnapshot 生命周期

当你在不使用 `modelProviders` 的情况下配置模型时，Qwen Code 会自动创建 RuntimeModelSnapshot 以保存你的配置：

```bash
# 创建 ID 为 $runtime|openai|my-custom-model 的 RuntimeModelSnapshot
qwen --auth-type openai --model my-custom-model --openai-api-key $KEY --openai-base-url https://api.example.com/v1
```

Snapshot 会：

- 捕获模型 ID、API key、base URL 和 generation config
- 在会话期间持久存储（存储在运行时内存中）
- 在 `/model` 命令列表中作为运行时选项显示
- 可通过 `/model $runtime|openai|my-custom-model` 切换

### 主要区别

| 方面             | 提供商模型                          | 运行时模型                               |
| ---------------- | ----------------------------------- | ---------------------------------------- |
| 配置来源         | settings 中的 `modelProviders`      | CLI、环境变量、settings 层               |
| 配置原子性       | 完整、不可穿透的包                  | 分层，每个字段独立解析                   |
| 可复用性         | 始终在 `/model` 列表中可用          | 捕获为 snapshot，配置完整时显示          |
| 团队共享         | 是（通过提交的 settings）           | 否（用户本地）                           |
| 凭据存储         | 仅通过 `envKey` 引用                | 可能在 snapshot 中捕获实际 key           |

### 适用场景

- **使用提供商模型**：团队共享标准模型、需要一致配置或防止意外覆盖时
- **使用运行时模型**：快速测试新模型、使用临时凭据或临时端点时

## 选择持久化与建议

> [!important]
>
> 尽量在用户级 `~/.qwen/settings.json` 中定义 `modelProviders`，避免在任何作用域中持久化凭据覆盖。将提供商目录保存在用户 settings 中，可防止项目和用户作用域之间的合并/覆盖冲突，并确保 `/auth` 和 `/model` 的更新始终写回到一致的作用域。

- `/model` 和 `/auth` 将 `model.name`（如适用）和 `security.auth.selectedType` 持久化到已定义 `modelProviders` 的最近可写作用域；否则回退到用户作用域。这使 workspace/user 文件与当前激活的提供商目录保持同步。
- 没有 `modelProviders` 时，解析器会混合 CLI/环境变量/settings 层，创建 Runtime Models。这对单提供商场景没问题，但频繁切换时会很麻烦。在多模型工作流常见的情况下，建议定义提供商目录，以确保切换操作原子化、来源可追溯、易于调试。
