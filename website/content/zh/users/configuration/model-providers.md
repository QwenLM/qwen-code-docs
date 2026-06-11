# 模型提供商

Qwen Code 允许你通过 `settings.json` 中的 `modelProviders` 设置配置多个模型提供商。这使你能够使用 `/model` 命令在不同的 AI 模型和提供商之间切换。

## 概述

使用 `modelProviders` 可按认证类型（auth type）声明精选的模型列表，供 `/model` 选择器切换。键名必须是有效的认证类型（如 `openai`、`anthropic`、`gemini` 等）。每个条目都需要一个 `id` 且**必须包含 `envKey`**，可选字段包括 `name`、`description`、`baseUrl` 和 `generationConfig`。凭据绝不会保存在设置文件中；运行时将从 `process.env[envKey]` 读取它们。Qwen OAuth 模型保持硬编码，无法被覆盖。

> [!note]
>
> 只有 `/model` 命令会暴露非默认的认证类型。Anthropic、Gemini 等必须通过 `modelProviders` 定义。`/auth` 命令列出的内置认证选项为 Qwen OAuth、阿里云 Coding Plan 和 API Key。

> [!warning]
>
> **同一 authType 下的重复模型 ID：** 在单个 `authType` 下定义多个具有相同 `id` 的模型（例如在 `openai` 中定义两个 `"id": "gpt-4o"` 的条目）目前不受支持。如果存在重复项，**首个出现的条目将生效**，后续重复项将被跳过并输出警告。请注意，`id` 字段既用作配置标识符，也用作实际发送给 API 的模型名称，因此使用唯一 ID（如 `gpt-4o-creative`、`gpt-4o-balanced`）并非可行的变通方案。这是一个已知限制，我们计划在后续版本中修复。

## 按认证类型的配置示例

以下是针对不同认证类型的完整配置示例，展示了可用参数及其组合。

### 支持的认证类型

`modelProviders` 对象的键必须是有效的 `authType` 值。目前支持的认证类型包括：

| Auth Type    | 描述                                                                             |
| ------------ | --------------------------------------------------------------------------------------- |
| `openai`     | OpenAI 兼容的 API（OpenAI、Azure OpenAI、vLLM/Ollama 等本地推理服务器） |
| `anthropic`  | Anthropic Claude API                                                                    |
| `gemini`     | Google Gemini API                                                                       |
| `qwen-oauth` | Qwen OAuth（硬编码，无法在 `modelProviders` 中覆盖）                       |

> [!warning]
> 如果使用了无效的认证类型键（例如拼写错误如 `"openai-custom"`），该配置将被**静默跳过**，且模型不会出现在 `/model` 选择器中。请务必使用上述列出的受支持的认证类型值。

### API 请求使用的 SDK

Qwen Code 使用以下官方 SDK 向各提供商发送请求：

| Auth Type    | SDK 包                                                                                     |
| ------------ | ----------------------------------------------------------------------------------------------- |
| `openai`     | [`openai`](https://www.npmjs.com/package/openai) - OpenAI 官方 Node.js SDK                  |
| `anthropic`  | [`@anthropic-ai/sdk`](https://www.npmjs.com/package/@anthropic-ai/sdk) - Anthropic 官方 SDK |
| `gemini`     | [`@google/genai`](https://www.npmjs.com/package/@google/genai) - Google GenAI 官方 SDK      |
| `qwen-oauth` | [`openai`](https://www.npmjs.com/package/openai) 配合自定义提供商（兼容 DashScope）    |

这意味着你配置的 `baseUrl` 必须与对应 SDK 预期的 API 格式兼容。例如，使用 `openai` 认证类型时，端点必须接受 OpenAI API 格式的请求。

### OpenAI 兼容提供商 (`openai`)

此认证类型不仅支持 OpenAI 官方 API，还支持任何 OpenAI 兼容的端点，包括 OpenRouter 等聚合模型提供商。

```json
{
  "env": {
    "OPENAI_API_KEY": "sk-your-actual-openai-key-here",
    "OPENROUTER_API_KEY": "sk-or-your-actual-openrouter-key-here"
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
      }
    ]
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

### 本地自托管模型（通过 OpenAI 兼容 API）

大多数本地推理服务器（vLLM、Ollama、LM Studio 等）都提供 OpenAI 兼容的 API 端点。使用 `openai` 认证类型并配置本地 `baseUrl` 即可接入：

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

对于不需要身份验证的本地服务器，你可以为 API Key 使用任意占位符值：

```bash
# For Ollama (no auth required)
export OLLAMA_API_KEY="ollama"

# For vLLM (if no auth is configured)
export VLLM_API_KEY="not-needed"
```

> [!note]
>
> `extra_body` 参数**仅支持 OpenAI 兼容提供商**（`openai`、`qwen-oauth`）。对于 Anthropic 和 Gemini 提供商，该参数将被忽略。

> [!note]
>
> **关于 `envKey`**：`envKey` 字段指定的是**环境变量的名称**，而非实际的 API Key 值。要使配置生效，你需要确保对应的环境变量已设置为真实的 API Key。有两种方式可以实现：
>
> - **方式 1：使用 `.env` 文件**（出于安全考虑推荐）：
>   ```bash
>   # ~/.qwen/.env (or project root)
>   OPENAI_API_KEY=sk-your-actual-key-here
>   ```
>   请务必将 `.env` 添加到 `.gitignore` 中，以防意外提交敏感信息。
> - **方式 2：在 `settings.json` 中使用 `env` 字段**（如上述示例所示）：
>   ```json
>   {
>     "env": {
>       "OPENAI_API_KEY": "sk-your-actual-key-here"
>     }
>   }
>   ```
>
> 每个提供商示例都包含一个 `env` 字段，用于演示如何配置 API Key。

## 阿里云 Coding Plan

阿里云 Coding Plan 提供了一组预配置的、针对编码任务优化的 Qwen 模型。该功能面向拥有阿里云 Coding Plan API 访问权限的用户，提供简化的设置体验与自动的模型配置更新。

### 概述

当你使用 `/auth` 命令通过阿里云 Coding Plan API Key 进行认证时，Qwen Code 会自动配置以下模型：

| Model ID               | Name                 | 描述                            |
| ---------------------- | -------------------- | -------------------------------------- |
| `qwen3.5-plus`         | qwen3.5-plus         | 启用思考能力的高级模型   |
| `qwen3-coder-plus`     | qwen3-coder-plus     | 针对编码任务优化             |
| `qwen3-max-2026-01-23` | qwen3-max-2026-01-23 | 启用思考能力的最新 max 模型 |

### 设置步骤

1. 获取阿里云 Coding Plan API Key：
   - **中国大陆**：<https://bailian.console.aliyun.com/?tab=model#/efm/coding_plan>
   - **国际**：<https://modelstudio.console.alibabacloud.com/?tab=dashboard#/efm/coding_plan>
2. 在 Qwen Code 中运行 `/auth` 命令
3. 选择 **Alibaba Cloud Coding Plan**
4. 选择你的区域
5. 按提示输入你的 API Key

模型将自动配置并添加到你的 `/model` 选择器中。

### 区域

阿里云 Coding Plan 支持两个区域：

| Region               | Endpoint                                        | 描述             |
| -------------------- | ----------------------------------------------- | ----------------------- |
| 中国大陆                | `https://coding.dashscope.aliyuncs.com/v1`      | 中国大陆端点 |
| 全球/国际 | `https://coding-intl.dashscope.aliyuncs.com/v1` | 国际端点  |

区域在认证时选定，并存储在 `settings.json` 的 `codingPlan.region` 字段中。如需切换区域，请重新运行 `/auth` 命令并选择其他区域。

### API Key 存储

当你通过 `/auth` 命令配置 Coding Plan 时，API Key 将使用保留的环境变量名 `BAILIAN_CODING_PLAN_API_KEY` 进行存储。默认情况下，它会存储在你 `settings.json` 文件的 `env` 字段中。

> [!warning]
>
> **安全建议**：为了更高的安全性，建议将 API Key 从 `settings.json` 移至独立的 `.env` 文件中，并作为环境变量加载。例如：
>
> ```bash
> # ~/.qwen/.env
> BAILIAN_CODING_PLAN_API_KEY=your-api-key-here
> ```
>
> 如果你使用的是项目级设置，请确保将此文件添加到 `.gitignore` 中。

### 自动更新

Coding Plan 模型配置具有版本控制。当 Qwen Code 检测到模型模板的较新版本时，会提示你进行更新。接受更新将：

- 将现有的 Coding Plan 模型配置替换为最新版本
- 保留你手动添加的任何自定义模型配置
- 自动切换到更新后配置中的第一个模型

更新过程确保你无需手动干预即可始终使用最新的模型配置和功能。

### 手动配置（高级）

如果你倾向于手动配置 Coding Plan 模型，可以像配置其他 OpenAI 兼容提供商一样将它们添加到 `settings.json` 中：

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
> - 你可以为 `envKey` 使用任意环境变量名
> - 无需配置 `codingPlan.*`
> - **自动更新不适用于**手动配置的 Coding Plan 模型

> [!warning]
>
> 如果你同时使用自动 Coding Plan 配置，且手动配置与自动配置使用了相同的 `envKey` 和 `baseUrl`，自动更新可能会覆盖你的手动配置。为避免此情况，请尽可能确保手动配置使用不同的 `envKey`。

## 解析层级与原子性

有效的认证/模型/凭据值按字段根据以下优先级进行选择（首次出现者生效）。你可以将 `--auth-type` 与 `--model` 结合使用，直接指向某个提供商条目；这些 CLI 标志会在其他层级之前运行。

| 层级（最高 → 最低）   | authType                            | model                                           | apiKey                                              | baseUrl                                              | apiKeyEnvKey           | proxy                             |
| -------------------------- | ----------------------------------- | ----------------------------------------------- | --------------------------------------------------- | ---------------------------------------------------- | ---------------------- | --------------------------------- |
| 编程式覆盖     | `/auth`                             | `/auth` 输入                                   | `/auth` 输入                                       | `/auth` 输入                                        | —                      | —                                 |
| 模型提供商选择   | —                                   | `modelProvider.id`                              | `env[modelProvider.envKey]`                         | `modelProvider.baseUrl`                              | `modelProvider.envKey` | —                                 |
| CLI 参数              | `--auth-type`                       | `--model`                                       | `--openaiApiKey`（或提供商特定等效参数） | `--openaiBaseUrl`（或提供商特定等效参数） | —                      | —                                 |
| 环境变量      | —                                   | 提供商特定映射（例如 `OPENAI_MODEL`） | 提供商特定映射（例如 `OPENAI_API_KEY`）   | 提供商特定映射（例如 `OPENAI_BASE_URL`）   | —                      | —                                 |
| 设置 (`settings.json`) | `security.auth.selectedType`        | `model.name`                                    | `security.auth.apiKey`                              | `security.auth.baseUrl`                              | —                      | —                                 |
| 默认 / 计算         | 回退至 `AuthType.QWEN_OAUTH` | 内置默认值（OpenAI ⇒ `qwen3-coder-plus`）  | —                                                   | —                                                    | —                      | 若已配置则使用 `Config.getProxy()` |

\*当存在时，CLI 认证标志会覆盖设置。否则，由 `security.auth.selectedType` 或隐式默认值决定认证类型。无需额外配置即可使用的认证类型仅有 Qwen OAuth 和 OpenAI。

> [!warning]
>
> **弃用 `security.auth.apiKey` 和 `security.auth.baseUrl`：** 在 `settings.json` 中直接通过 `security.auth.apiKey` 和 `security.auth.baseUrl` 配置 API 凭据已被弃用。这些设置在历史版本中用于通过 UI 输入的凭据，但凭据输入流程已在 0.10.1 版本中移除。这些字段将在未来版本中完全移除。**强烈建议将所有模型和凭据配置迁移至 `modelProviders`**。在 `modelProviders` 中使用 `envKey` 引用环境变量以进行安全的凭据管理，而不是在设置文件中硬编码凭据。

## 生成配置层级：不可穿透的提供商层

配置解析遵循严格的层级模型，并有一条关键规则：**modelProvider 层是不可穿透的**。

### 工作原理

1. **当选中 modelProvider 模型时**（例如通过 `/model` 命令选择已配置的提供商模型）：
   - 提供商的整个 `generationConfig` 将**原子化**应用
   - **提供商层完全不可穿透** — 较低层级（CLI、环境变量、设置）完全不参与 generationConfig 的解析
   - `modelProviders[].generationConfig` 中定义的所有字段均使用提供商的值
   - 提供商**未定义**的所有字段将设置为 `undefined`（不会从设置继承）
   - 这确保提供商配置作为一个完整、自包含的“密封包”运行

2. **当未选中 modelProvider 模型时**（例如使用 `--model` 指定原始模型 ID，或直接使用 CLI/环境变量/设置）：
   - 解析将向下穿透至较低层级
   - 字段按 CLI → 环境变量 → 设置 → 默认值的顺序填充
   - 这将创建一个**运行时模型**（见下一节）

### `generationConfig` 的逐字段优先级

| 优先级 | 来源                                        | 行为                                                                                                 |
| -------- | --------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| 1        | 编程式覆盖                        | 运行时 `/model`、`/auth` 更改                                                                        |
| 2        | `modelProviders[authType][].generationConfig` | **不可穿透层** - 完全替换所有 generationConfig 字段；较低层级不参与 |
| 3        | `settings.model.generationConfig`             | 仅用于**运行时模型**（未选择提供商模型时）                                    |
| 4        | 内容生成器默认值                    | 提供商特定默认值（如 OpenAI 与 Gemini）- 仅适用于运行时模型                            |

### 原子字段处理

以下字段被视为原子对象 — 提供商的值将完全替换整个对象，不会进行合并：

- `samplingParams` - Temperature、top_p、max_tokens 等
- `customHeaders` - 自定义 HTTP 请求头
- `extra_body` - 额外的请求体参数

### 示例

```json
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

- `timeout` = 60000（来自提供商，覆盖设置）
- `samplingParams.temperature` = 0.2（来自提供商，完全替换设置对象）
- `samplingParams.max_tokens` = **undefined**（提供商未定义，且提供商层不从设置继承 — 未提供的字段会显式设置为 undefined）

当通过 `--model gpt-4` 使用原始模型时（非来自 modelProviders，创建运行时模型）：

- `timeout` = 30000（来自设置）
- `samplingParams.temperature` = 0.5（来自设置）
- `samplingParams.max_tokens` = 1000（来自设置）

`modelProviders` 本身的合并策略为 REPLACE（替换）：项目设置中的整个 `modelProviders` 将覆盖用户设置中的对应部分，而不是将两者合并。

## 推理 / 思考配置

`generationConfig` 下的可选 `reasoning` 字段控制模型在响应前进行推理的强度。Anthropic 和 Gemini 转换器始终遵循该配置。OpenAI 兼容管道**除非**设置了 `generationConfig.samplingParams`，否则也会遵循该配置 — 请参阅下方“与 `samplingParams` 的交互”注意事项。

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
          // The four-tier scale:
          //   'low'    | 'medium' — server-mapped to 'high' on DeepSeek
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

### 各提供商行为

| 协议 / 提供商                          | 网络请求格式                                                           | 备注                                                                                                                                                                                                                                                                                                                                                                                                                            |
| -------------------------------------------- | -------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **OpenAI / DeepSeek** (`api.deepseek.com`)   | 扁平的 `reasoning_effort: <effort>` 请求体参数                     | 当嵌套配置中设置了 `reasoning.effort` 时，它会被重写为扁平的 `reasoning_effort`，且 `'low'`/`'medium'` 会被规范化为 `'high'`，`'xhigh'` 规范化为 `'max'` — 这与 DeepSeek 的[服务端向后兼容](https://api-docs.deepseek.com/zh-cn/api/create-chat-completion)保持一致。顶层的 `samplingParams.reasoning_effort` 或 `extra_body.reasoning_effort` 覆盖会跳过此规范化并原样发送。 |
| **OpenAI**（其他兼容服务器）        | 原样传递 `reasoning: { effort, ... }`                 | 当提供商期望不同格式时，通过 `samplingParams` 设置（例如 GPT-5/o-series 使用 `samplingParams.reasoning_effort`）。                                                                                                                                                                                                                                                                                                |
| **Anthropic**（真实的 `api.anthropic.com`）     | `output_config: { effort }` 加上 `effort-2025-11-24` beta 请求头 | 真实的 Anthropic 仅接受 `'low'`/`'medium'`/`'high'`。`'max'` 会被**钳制为 `'high'`** 并输出一条 `debugLogger.warn`（每个生成器仅一次）；如果你需要最大强度，请将 baseURL 切换为支持它的 DeepSeek 兼容端点。                                                                                                                                                                                  |
| **Anthropic** (`api.deepseek.com/anthropic`) | 相同的 `output_config: { effort }` + beta 请求头                       | `'max'` 会原样传递。                                                                                                                                                                                                                                                                                                                                                                                             |
| **Gemini** (`@google/genai`)                 | `thinkingConfig: { includeThoughts: true, thinkingLevel }`           | `'low'` → `LOW`，`'high'`/`'max'` → `HIGH`，其他 → `THINKING_LEVEL_UNSPECIFIED`（Gemini 没有 `MAX` 层级）。                                                                                                                                                                                                                                                                                                                    |

### `reasoning: false`

将 `reasoning` 设置为 `false`（布尔字面量）会显式禁用所有提供商的思考功能 — 适用于不需要推理的低成本辅助查询。在单次调用（例如建议生成）中，也可以通过请求级别的 `request.config.thinkingConfig.includeThoughts: false` 来遵循此设置。

在 `api.deepseek.com` baseURL 上，OpenAI 管道会发出 DeepSeek V4+ 所需的显式 `thinking: { type: 'disabled' }` 字段 — 服务端默认为 `'enabled'`，因此仅省略 `reasoning_effort` 仍会产生思考延迟/成本。自托管的 DeepSeek 后端（sglang/vllm）和其他 OpenAI 兼容服务器**不会**接收此字段；如果你需要在这些服务器上禁用思考，请通过 `samplingParams`/`extra_body` 注入 `thinking: { type: 'disabled' }`（或你的推理框架暴露的任何控制参数）。

### 与 `samplingParams` 的交互（仅限 OpenAI 兼容）

> [!warning]
>
> 当在 OpenAI 兼容提供商上设置了 `generationConfig.samplingParams` 时，管道会将这些键**原样**发送到网络，并完全跳过独立的 `reasoning` 注入。因此，类似 `{ samplingParams: { temperature: 0.5 }, reasoning: { effort: 'max' } }` 的配置会在 OpenAI/DeepSeek 请求中静默丢弃 reasoning 字段。
>
> 如果你设置了 `samplingParams`，请直接将推理控制参数包含在其中 — 对于 DeepSeek 是 `samplingParams.reasoning_effort`，对于 GPT-5/o-series 是 `samplingParams.reasoning_effort`（扁平字段）或 `samplingParams.reasoning`（嵌套对象）。对于 OpenRouter 和其他提供商，字段名称可能有所不同；请查阅提供商文档。
>
> Anthropic 和 Gemini 转换器不受影响 — 无论是否设置 `samplingParams`，它们始终直接读取 `reasoning.effort`。

### `budget_tokens`

你可以通过在 `effort` 旁包含 `budget_tokens` 来指定精确的思考 token 预算：

```jsonc
"reasoning": { "effort": "high", "budget_tokens": 50000 }
```

对于 Anthropic，这会变为 `thinking.budget_tokens`。对于 OpenAI/DeepSeek，该字段会被保留但目前被服务端忽略 — `reasoning_effort` 才是实际生效的控制参数。

## 提供商模型与运行时模型

Qwen Code 区分两种类型的模型配置：

### 提供商模型

- 在 `modelProviders` 配置中定义
- 具有完整、原子的配置包
- 选中时，其配置将作为不可穿透层应用
- 在 `/model` 命令列表中显示完整元数据（名称、描述、能力）
- 推荐用于多模型工作流和团队一致性

### 运行时模型

- 通过 CLI (`--model`)、环境变量或设置使用原始模型 ID 时动态创建
- 未在 `modelProviders` 中定义
- 配置通过解析层级（CLI → 环境变量 → 设置 → 默认值）“投影”构建
- 检测到完整配置时自动捕获为 **RuntimeModelSnapshot**
- 允许复用而无需重新输入凭据

### RuntimeModelSnapshot 生命周期

当你不使用 `modelProviders` 配置模型时，Qwen Code 会自动创建 RuntimeModelSnapshot 以保留你的配置：

```bash
# This creates a RuntimeModelSnapshot with ID: $runtime|openai|my-custom-model
qwen --auth-type openai --model my-custom-model --openaiApiKey $KEY --openaiBaseUrl https://api.example.com/v1
```

该快照：

- 捕获模型 ID、API Key、Base URL 和生成配置
- 跨会话持久化（运行时存储在内存中）
- 在 `/model` 命令列表中作为运行时选项显示
- 可通过 `/model $runtime|openai|my-custom-model` 切换

### 关键差异

| 方面                  | 提供商模型                    | 运行时模型                              |
| ----------------------- | --------------------------------- | ------------------------------------------ |
| 配置来源    | 设置中的 `modelProviders`      | CLI、环境变量、设置层级                  |
| 配置原子性 | 完整、不可穿透的包     | 分层，每个字段独立解析 |
| 可复用性             | 始终在 `/model` 列表中可用 | 捕获为快照，完整时显示  |
| 团队共享            | 是（通过提交的设置）      | 否（用户本地）                            |
| 凭据存储      | 仅通过 `envKey` 引用       | 可能在快照中捕获实际 Key         |

### 何时使用

- **使用提供商模型**：当你在团队间共享标准模型、需要一致的配置，或希望防止意外覆盖时
- **使用运行时模型**：当快速测试新模型、使用临时凭据，或处理临时端点时

## 选择持久化与建议

> [!important]
>
> 尽可能在用户级 `~/.qwen/settings.json` 中定义 `modelProviders`，并避免在任何作用域中持久化凭据覆盖。将提供商目录保留在用户设置中可防止项目与用户作用域之间的合并/覆盖冲突，并确保 `/auth` 和 `/model` 的更新始终写回一致的作用域。

- `/model` 和 `/auth` 会将 `model.name`（如适用）和 `security.auth.selectedType` 持久化到已定义 `modelProviders` 的最近可写作用域；否则回退到用户作用域。这使工作区/用户文件与活动的提供商目录保持同步。
- 如果没有 `modelProviders`，解析器会混合 CLI/环境变量/设置层级，从而创建运行时模型。这对于单提供商设置没问题，但在频繁切换时会很繁琐。当多模型工作流常见时，请定义提供商目录，以确保切换保持原子性、可追溯来源且易于调试。