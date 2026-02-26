# 模型提供商

Qwen Code 允许你通过 `settings.json` 中的 `modelProviders` 设置来配置多个模型提供商。这使你能够使用 `/model` 命令在不同的 AI 模型和提供商之间切换。

## 概述

使用 `modelProviders` 来声明每种认证类型下的精选模型列表，`/model` 选择器可以在这些列表之间切换。键必须是有效的认证类型（如 `openai`、`anthropic`、`gemini`、`vertex-ai` 等）。每个条目都需要一个 `id` 并且**必须包含 `envKey`**，可选字段包括 `name`、`description`、`baseUrl` 和 `generationConfig`。凭证永远不会持久化存储在设置中；运行时会从 `process.env[envKey]` 中读取它们。Qwen OAuth 模型仍然是硬编码的，无法被覆盖。

> [!note]
> 只有 `/model` 命令暴露非默认的认证类型。Anthropic、Gemini、Vertex AI 等必须通过 `modelProviders` 定义。`/auth` 命令有意只列出内置的 Qwen OAuth 和 OpenAI 流程。

> [!warning]
> **同一认证类型内的重复模型 ID：** 目前不支持在同一 `authType` 下定义多个具有相同 `id` 的模型（例如，在 `openai` 中有两个条目都使用 `"id": "gpt-4o"`）。如果存在重复项，**第一个出现的条目获胜**，后续的重复项会被跳过并显示警告。请注意，`id` 字段既用作配置标识符，也用作发送到 API 的实际模型名称，因此使用唯一 ID（如 `gpt-4o-creative`、`gpt-4o-balanced`）并不是可行的解决方法。这是一个已知限制，我们计划在未来的版本中解决。

## 按认证类型分类的配置示例

以下是针对不同认证类型的全面配置示例，展示了可用参数及其组合。

### 支持的认证类型

`modelProviders` 对象的键必须是有效的 `authType` 值。目前支持的认证类型如下：

| 认证类型     | 描述                                                                                     |
| ------------ | ---------------------------------------------------------------------------------------- |
| `openai`     | OpenAI 兼容的 API（OpenAI、Azure OpenAI、本地推理服务器如 vLLM/Ollama）                  |
| `anthropic`  | Anthropic Claude API                                                                     |
| `gemini`     | Google Gemini API                                                                        |
| `vertex-ai`  | Google Vertex AI                                                                         |
| `qwen-oauth` | Qwen OAuth（硬编码，无法在 `modelProviders` 中覆盖）                                     |

> [!warning]
> 如果使用了无效的认证类型键（例如拼写错误如 `"openai-custom"`），该配置将被**静默跳过**，并且这些模型不会出现在 `/model` 选择器中。请始终使用上述列出的支持的认证类型值。

### 用于 API 请求的 SDK

Qwen Code 使用以下官方 SDK 向每个提供商发送请求：

| 认证类型               | SDK 包                                                                                         |
| ---------------------- | ---------------------------------------------------------------------------------------------- |
| `openai`               | [`openai`](https://www.npmjs.com/package/openai) - 官方 OpenAI Node.js SDK                    |
| `anthropic`            | [`@anthropic-ai/sdk`](https://www.npmjs.com/package/@anthropic-ai/sdk) - 官方 Anthropic SDK   |
| `gemini` / `vertex-ai` | [`@google/genai`](https://www.npmjs.com/package/@google/genai) - 官方 Google GenAI SDK        |
| `qwen-oauth`           | [`openai`](https://www.npmjs.com/package/openai) 配合自定义提供商 (与 DashScope 兼容)         |

这意味着你配置的 `baseUrl` 应该与相应 SDK 期望的 API 格式兼容。例如，当使用 `openai` 认证类型时，端点必须接受 OpenAI API 格式的请求。

### OpenAI 兼容提供商 (`openai`)

此认证类型不仅支持 OpenAI 的官方 API，还支持任何与 OpenAI 兼容的端点，包括像 OpenRouter 这样的聚合模型提供商。

```json
{
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

### Google Vertex AI (`vertex-ai`)

```json
{
  "modelProviders": {
    "vertex-ai": [
      {
        "id": "gemini-1.5-pro-vertex",
        "name": "Gemini 1.5 Pro (Vertex AI)",
        "envKey": "GOOGLE_API_KEY",
        "baseUrl": "https://generativelanguage.googleapis.com",
        "generationConfig": {
          "timeout": 90000,
          "contextWindowSize": 2000000,
          "samplingParams": {
            "temperature": 0.2,
            "max_tokens": 8192
          }
        }
      }
    ]
  }
}
```

### 本地自托管模型（通过 OpenAI 兼容 API）

大多数本地推理服务器（vLLM、Ollama、LM Studio 等）提供 OpenAI 兼容的 API 端点。使用 `openai` 认证类型和本地 `baseUrl` 进行配置：

```json
{
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

对于不需要认证的本地服务器，你可以为 API key 使用任何占位符值：

```bash

```bash
# 对于 Ollama（无需认证）
export OLLAMA_API_KEY="ollama"

# 对于 vLLM（如果没有配置认证）
export VLLM_API_KEY="not-needed"
```

> [!note]
> `extra_body` 参数**仅支持与 OpenAI 兼容的提供商**（`openai`、`qwen-oauth`）。对于 Anthropic、Gemini 和 Vertex AI 提供商，该参数将被忽略。

## 百炼编码方案

百炼编码方案提供了一组预配置的 Qwen 模型，专为编码任务优化。此功能适用于拥有百炼 API 访问权限的用户，并提供了简化的设置体验和自动模型配置更新。

### 概述

当你使用 `/auth` 命令通过百炼编码计划 API 密钥进行认证时，Qwen Code 会自动配置以下模型：

| 模型 ID                | 名称                 | 描述                                   |
| ---------------------- | -------------------- | -------------------------------------- |
| `qwen3.5-plus`         | qwen3.5-plus         | 启用思考功能的高级模型                 |
| `qwen3-coder-plus`     | qwen3-coder-plus     | 针对编码任务优化                       |
| `qwen3-max-2026-01-23` | qwen3-max-2026-01-23 | 最新的最大模型，启用思考功能           |

### 设置

1. 获取百炼编码计划 API 密钥：
   - **中国**：<https://bailian.console.aliyun.com/?tab=model#/efm/coding_plan>
   - **国际**：<https://modelstudio.console.alibabacloud.com/?tab=dashboard#/efm/coding_plan>
2. 在 Qwen Code 中运行 `/auth` 命令
3. 选择 API-KEY 认证方式
4. 选择你的区域（中国或全球/国际）
5. 提示时输入你的 API 密钥

模型将自动配置并添加到你的 `/model` 选择器中。

### 区域

Bailian 编码计划支持两个区域：

| 区域                 | 端点                                            | 描述             |
| -------------------- | ----------------------------------------------- | ---------------- |
| 中国                 | `https://coding.dashscope.aliyuncs.com/v1`      | 中国大陆端点     |
| 全球/国际            | `https://coding-intl.dashscope.aliyuncs.com/v1` | 国际端点         |

区域在认证期间选择，并存储在 `settings.json` 中的 `codingPlan.region` 下。要切换区域，请重新运行 `/auth` 命令并选择不同的区域。

### API 密钥存储

当你通过 `/auth` 命令配置 Coding Plan 时，API 密钥会使用保留的环境变量名 `BAILIAN_CODING_PLAN_API_KEY` 进行存储。默认情况下，它会存储在你 `settings.json` 文件的 `settings.env` 字段中。

> [!warning]
> **安全建议**：为了更好的安全性，建议将 API 密钥从 `settings.json` 移动到单独的 `.env` 文件中，并将其作为环境变量加载。例如：
>
> ```bash
> # ~/.qwen/.env
> BAILIAN_CODING_PLAN_API_KEY=your-api-key-here
> ```
>
> 然后如果你使用项目级设置，请确保将此文件添加到你的 `.gitignore` 中。

### 自动更新

编码计划模型配置是有版本的。当 Qwen Code 检测到模型模板有较新版本时，系统会提示你进行更新。接受更新后将会：

- 用最新版本替换现有的编码计划模型配置
- 保留你手动添加的任何自定义模型配置
- 自动切换到更新配置中的第一个模型

更新过程确保你始终能够访问最新的模型配置和功能，无需手动干预。

### 手动配置（高级）

如果你希望手动配置 Coding Plan 模型，可以像配置任何兼容 OpenAI 的提供商一样，将它们添加到你的 `settings.json` 中：

```json
{
  "modelProviders": {
    "openai": [
      {
        "id": "qwen3-coder-plus",
        "name": "qwen3-coder-plus",
        "description": "通过 Bailian Coding Plan 的 Qwen3-Coder",
        "envKey": "YOUR_CUSTOM_ENV_KEY",
        "baseUrl": "https://coding.dashscope.aliyuncs.com/v1"
      }
    ]
  }
}
```

> [!note]
> 使用手动配置时：

> - 你可以为 `envKey` 使用任何环境变量名称
> - 你不需要配置 `codingPlan.*`
> - **自动更新不会应用** 到手动配置的 Coding Plan 模型

> [!warning]
> 如果你还使用自动 Coding Plan 配置，当手动配置与自动配置使用相同的 `envKey` 和 `baseUrl` 时，自动更新可能会覆盖你的手动配置。为避免这种情况，请确保你的手动配置尽可能使用不同的 `envKey`。

## 解析层级和原子性

有效的认证/模型/凭证值是按字段选择的，遵循以下优先级（首先出现的生效）。你可以将 `--auth-type` 与 `--model` 结合使用，直接指向提供程序条目；这些 CLI 标志在其他层级之前运行。

| 层级（最高 → 最低） | authType | model | apiKey | baseUrl | apiKeyEnvKey | proxy |
| ------------------- | -------- | ----- | ------ | ------- | ------------ | ----- |
| 编程覆盖 | `/auth` | `/auth` 输入 | `/auth` 输入 | `/auth` 输入 | — | — |
| 模型提供程序选择 | — | `modelProvider.id` | `env[modelProvider.envKey]` | `modelProvider.baseUrl` | `modelProvider.envKey` | — |
| CLI 参数 | `--auth-type` | `--model` | `--openaiApiKey`（或提供程序特定的等效项） | `--openaiBaseUrl`（或提供程序特定的等效项） | — | — |
| 环境变量 | — | 提供程序特定映射（例如 `OPENAI_MODEL`） | 提供程序特定映射（例如 `OPENAI_API_KEY`） | 提供程序特定映射（例如 `OPENAI_BASE_URL`） | — | — |
| 设置（`settings.json`） | `security.auth.selectedType` | `model.name` | `security.auth.apiKey` | `security.auth.baseUrl` | — | — |
| 默认/计算值 | 回退到 `AuthType.QWEN_OAUTH` | 内置默认值（OpenAI ⇒ `qwen3-coder-plus`） | — | — | — | 配置时为 `Config.getProxy()` |

\* 当存在时，CLI 认证标志会覆盖设置。否则，`security.auth.selectedType` 或隐式默认值确定认证类型。Qwen OAuth 和 OpenAI 是唯一无需额外配置即可显示的认证类型。

> [!warning]
> **弃用 `security.auth.apiKey` 和 `security.auth.baseUrl`：** 不推荐通过 `settings.json` 中的 `security.auth.apiKey` 和 `security.auth.baseUrl` 直接配置 API 凭证。这些设置在历史版本中用于通过 UI 输入的凭证，但在 0.10.1 版本中移除了凭证输入流程。这些字段将在未来版本中完全移除。**强烈建议迁移到 `modelProviders`** 来进行所有模型和凭证配置。在 `modelProviders` 中使用 `envKey` 引用环境变量，以实现安全的凭证管理，而不是在设置文件中硬编码凭证。

## 生成配置分层：不可渗透的提供者层

配置解析遵循严格的分层模型，其中有一条关键规则：**modelProvider 层是不可渗透的**。

### 工作原理

1. **当选择了 modelProvider 模型时**（例如，通过 `/model` 命令选择一个提供程序配置的模型）：
   - 提供程序的整个 `generationConfig` 被**原子性地**应用
   - **提供程序层完全不可穿透** —— 较低层级（CLI、环境变量、设置）根本不参与 generationConfig 解析
   - 在 `modelProviders[].generationConfig` 中定义的所有字段都使用提供程序的值
   - 提供程序**未定义的**所有字段都被设置为 `undefined`（不从设置中继承）
   - 这确保了提供程序配置作为一个完整、独立的"密封包"运行

2. **当未选择 modelProvider 模型时**（例如，使用 `--model` 配合原始模型 ID，或直接使用 CLI/环境变量/设置）：
   - 解析会向下传递到较低层级
   - 字段按 CLI → 环境变量 → 设置 → 默认值 的顺序填充
   - 这将创建一个**运行时模型**（参见下一节）

### `generationConfig` 的字段优先级

| 优先级 | 来源                                          | 行为                                                                                                     |
|--------|-----------------------------------------------|----------------------------------------------------------------------------------------------------------|
| 1      | 程序化覆盖                                    | 运行时的 `/model`、`/auth` 变更                                                                          |
| 2      | `modelProviders[authType][].generationConfig` | **不可渗透层** - 完全替换所有 generationConfig 字段；较低层不参与                                           |
| 3      | `settings.model.generationConfig`             | 仅用于**运行时模型**（当未选择提供程序模型时）                                                            |
| 4      | 内容生成器默认值                              | 提供程序特定的默认值（例如，OpenAI 与 Gemini）- 仅适用于运行时模型                                        |

### 原子字段处理

以下字段被视为原子对象 - 提供者值会完全替换整个对象，不会发生合并：

- `samplingParams` - Temperature、top_p、max_tokens 等
- `customHeaders` - 自定义 HTTP 头
- `extra_body` - 额外的请求体参数

### 示例

```json
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

当从 modelProviders 中选择 `gpt-4o` 时：

- `timeout` = 60000（来自提供者，覆盖设置）
- `samplingParams.temperature` = 0.2（来自提供者，完全替换设置对象）
- `samplingParams.max_tokens` = **undefined**（提供者中未定义，且提供者层不会从设置继承 — 如果未提供，字段会被明确设置为 undefined）

当通过 `--model gpt-4` 使用原始模型时（不来自 modelProviders，创建运行时模型）：

- `timeout` = 30000（来自设置）
- `samplingParams.temperature` = 0.5（来自设置）
- `samplingParams.max_tokens` = 1000（来自设置）

`modelProviders` 本身的合并策略是 REPLACE：项目设置中的整个 `modelProviders` 将覆盖用户设置中的相应部分，而不是合并两者。

## 提供商模型 vs 运行时模型

Qwen Code 区分两种类型的模型配置：

### 提供商模型

- 在 `modelProviders` 配置中定义
- 具有完整、原子的配置包
- 选择后，其配置作为不可渗透的层应用
- 在 `/model` 命令列表中显示，带有完整元数据（名称、描述、功能）
- 推荐用于多模型工作流和团队一致性

### 运行时模型

- 通过 CLI（`--model`）、环境变量或设置使用原始模型 ID 时动态创建
- 未在 `modelProviders` 中定义
- 配置通过"投影"解析层构建（CLI → 环境 → 设置 → 默认值）
- 检测到完整配置时自动捕获为 **RuntimeModelSnapshot**
- 允许重复使用而无需重新输入凭据

### RuntimeModelSnapshot 生命周期

当你在不使用 `modelProviders` 的情况下配置模型时，Qwen Code 会自动创建一个 RuntimeModelSnapshot 来保存你的配置：

```bash

# 这将创建一个 ID 为 $runtime|openai|my-custom-model 的 RuntimeModelSnapshot
qwen --auth-type openai --model my-custom-model --openaiApiKey $KEY --openaiBaseUrl https://api.example.com/v1
```

该快照：

- 捕获模型 ID、API 密钥、基础 URL 和生成配置
- 跨会话持久化（在运行时存储在内存中）
- 在 `/model` 命令列表中显示为运行时选项
- 可以通过 `/model $runtime|openai|my-custom-model` 切换到该快照

### 主要差异

| 方面                 | 提供者模型                      | 运行时模型                                 |
| -------------------- | ------------------------------- | ------------------------------------------ |
| 配置来源             | 设置中的 `modelProviders`       | CLI、环境变量、设置层级                    |
| 配置原子性           | 完整、不可渗透的包              | 分层，每个字段独立解析                     |
| 可重用性             | 始终在 `/model` 列表中可用      | 作为快照捕获，完整时显示                   |
| 团队共享             | 是（通过提交的设置）            | 否（用户本地）                             |
| 凭据存储             | 仅通过 `envKey` 引用            | 可能在快照中捕获实际密钥                   |

### 何时使用每个

- **使用 Provider 模型** 当：你有团队共享的标准模型，需要一致的配置，或想要防止意外覆盖时
- **使用 Runtime 模型** 当：快速测试新模型、使用临时凭证，或处理临时端点时

## 选择持久化和建议

> [!important]
> 尽可能在用户范围的 `~/.qwen/settings.json` 中定义 `modelProviders`，并避免在任何范围内持久化凭证覆盖。将提供程序目录保存在用户设置中可以防止项目范围和用户范围之间的合并/覆盖冲突，并确保 `/auth` 和 `/model` 更新始终写回到一致的范围。

- `/model` 和 `/auth` 将 `model.name`（如适用）和 `security.auth.selectedType` 持久化到已定义 `modelProviders` 的最近可写范围；否则它们会回退到用户范围。这使工作区/用户文件与活动提供程序目录保持同步。
- 没有 `modelProviders` 时，解析器会混合 CLI/env/settings 层，创建运行时模型。这对于单提供程序设置是可以的，但在频繁切换时会很麻烦。当多模型工作流程很常见时，请定义提供程序目录，以便切换保持原子性、源归因和可调试性。