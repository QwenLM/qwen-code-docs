# 模型提供商

Qwen Code 允许你通过 `settings.json` 文件中的 `modelProviders` 设置来配置多个模型提供商。这样，你就可以使用 `/model` 命令在不同的 AI 模型和提供商之间切换。

## 概述

使用 `modelProviders` 为每种认证类型声明经过筛选的模型列表，供 `/model` 选择器在不同列表间切换。键名必须是有效的认证类型（例如 `openai`、`anthropic`、`gemini` 等）。每个条目必须包含 `id` 字段，且**必须包含 `envKey`**；`name`、`description`、`baseUrl` 和 `generationConfig` 为可选字段。凭证绝不会持久化保存在设置中；运行时从 `process.env[envKey]` 中读取。Qwen 的 OAuth 模型仍为硬编码，无法通过配置覆盖。

> [!note]
>
> 仅 `/model` 命令支持非默认的认证类型。Anthropic、Gemini 等模型必须通过 `modelProviders` 显式定义。`/auth` 命令仅列出 Qwen OAuth、阿里云 Coding 计划和 API Key 这三种内置认证方式。

> [!warning]
>
> **同一 `authType` 下存在重复的模型 ID：** 在同一 `authType` 下定义多个具有相同 `id` 的模型（例如在 `openai` 下定义两个 `"id": "gpt-4o"` 的条目）目前不被支持。若存在重复，**以首次出现的条目为准**，后续重复条目将被跳过并发出警告。请注意，`id` 字段既用作配置标识符，也作为实际发送给 API 的模型名称，因此采用唯一 ID（如 `gpt-4o-creative`、`gpt-4o-balanced`）并非可行的规避方案。这是当前已知的限制，我们计划在未来版本中解决。

## 按认证类型划分的配置示例

以下是针对不同认证类型的完整配置示例，展示了可用参数及其组合方式。

### 支持的认证类型

`modelProviders` 对象的键必须是有效的 `authType` 值。当前支持的认证类型如下：

| 认证类型     | 说明                                                                                     |
| ------------ | ---------------------------------------------------------------------------------------- |
| `openai`     | 兼容 OpenAI 的 API（包括 OpenAI、Azure OpenAI，以及 vLLM/Ollama 等本地推理服务器）         |
| `anthropic`  | Anthropic Claude API                                                                     |
| `gemini`     | Google Gemini API                                                                        |
| `qwen-oauth` | Qwen OAuth（硬编码，无法在 `modelProviders` 中覆盖）                                       |

> [!warning]
> 如果使用了无效的认证类型键（例如拼写错误，如 `"openai-custom"`），该配置将被**静默跳过**，对应模型也不会出现在 `/model` 选择器中。请务必使用上表所列的支持的认证类型值。

### 用于 API 请求的 SDK

Qwen Code 使用以下官方 SDK 向各服务商发送请求：

| 认证类型     | SDK 包                                                                                          |
| ------------ | ------------------------------------------------------------------------------------------------- |
| `openai`     | [`openai`](https://www.npmjs.com/package/openai) — 官方 OpenAI Node.js SDK                      |
| `anthropic`  | [`@anthropic-ai/sdk`](https://www.npmjs.com/package/@anthropic-ai/sdk) — 官方 Anthropic SDK     |
| `gemini`     | [`@google/genai`](https://www.npmjs.com/package/@google/genai) — 官方 Google GenAI SDK         |
| `qwen-oauth` | [`openai`](https://www.npmjs.com/package/openai)（配合自定义 provider，兼容 DashScope）         |

这意味着你配置的 `baseUrl` 必须与对应 SDK 所期望的 API 格式兼容。例如，使用 `openai` 认证类型时，该端点必须能接收符合 OpenAI API 格式的请求。

### OpenAI 兼容服务提供商（`openai`）

此认证类型不仅支持 OpenAI 官方 API，还支持任何与 OpenAI 兼容的端点，包括 OpenRouter 等聚合模型服务商。

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
        "name": "GPT-4o（通过 OpenRouter）",
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

### Anthropic（`anthropic`）

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

### Google Gemini（`gemini`）

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

### 本地自托管模型（通过 OpenAI 兼容 API）

大多数本地推理服务器（如 vLLM、Ollama、LM Studio 等）均提供 OpenAI 兼容的 API 端点。请使用 `openai` 认证类型，并配置本地 `baseUrl` 来接入它们：

```json
{
  "modelProviders": {
    "openai": [
      {
        "id": "qwen2.5-7b",
        "name": "Qwen2.5 7B（Ollama）",
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
        "name": "Llama 3.1 8B（vLLM）",
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
        "name": "本地模型（LM Studio）",
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

对于无需身份验证的本地服务器，API 密钥可使用任意占位值：  

```bash

# 对于 Ollama（无需认证）
export OLLAMA_API_KEY="ollama"

# 对于 vLLM（若未配置认证）
export VLLM_API_KEY="not-needed"
```

> [!note]
>
> `extra_body` 参数**仅支持 OpenAI 兼容的提供商**（`openai`、`qwen-oauth`），对于 Anthropic 和 Gemini 提供商将被忽略。

## 阿里云 Coding Plan

阿里云 Coding Plan 提供了一组预配置的、专为编程任务优化的 Qwen 模型。该功能面向已开通阿里云 Coding Plan API 权限的用户，提供简化的配置体验，并支持自动更新模型配置。

### 概览

当你使用 `/auth` 命令并通过阿里云 Coding Plan API 密钥完成身份验证后，Qwen Code 会自动配置以下模型：

| 模型 ID                | 名称                 | 描述                                   |
| ---------------------- | -------------------- | -------------------------------------- |
| `qwen3.5-plus`         | qwen3.5-plus         | 启用推理能力的高级模型                 |
| `qwen3-coder-plus`     | qwen3-coder-plus     | 针对编程任务优化的模型                 |
| `qwen3-max-2026-01-23` | qwen3-max-2026-01-23 | 最新 max 模型，启用推理能力             |

### 设置

1. 获取阿里云编码计划 API 密钥：
   - **中国站**：<https://bailian.console.aliyun.com/?tab=model#/efm/coding_plan>
   - **国际站**：<https://modelstudio.console.alibabacloud.com/?tab=dashboard#/efm/coding_plan>
2. 在 Qwen Code 中运行 `/auth` 命令
3. 选择 **阿里云编码计划**
4. 选择您的所在区域
5. 按提示输入您的 API 密钥

模型将自动完成配置，并添加至您的 `/model` 选择器中。

### 地域

阿里云 Coding Plan 支持两个地域：

| 地域               | 终端节点                                        | 描述                   |
| ------------------ | ----------------------------------------------- | ---------------------- |
| 中国               | `https://coding.dashscope.aliyuncs.com/v1`      | 中国大陆终端节点       |
| 全球/国际          | `https://coding-intl.dashscope.aliyuncs.com/v1` | 国际终端节点           |

地域在认证过程中选择，并保存在 `settings.json` 文件的 `codingPlan.region` 字段中。如需切换地域，请重新运行 `/auth` 命令并选择其他地域。

### API 密钥存储

通过 `/auth` 命令配置 Coding Plan 时，API 密钥将使用保留的环境变量名 `BAILIAN_CODING_PLAN_API_KEY` 进行存储。默认情况下，该密钥会保存在你的 `settings.json` 文件的 `env` 字段中。

> [!warning]
>
> **安全建议**：为提升安全性，建议将 API 密钥从 `settings.json` 移至独立的 `.env` 文件，并将其作为环境变量加载。例如：
>
> ```bash
> # ~/.qwen/.env
> BAILIAN_CODING_PLAN_API_KEY=your-api-key-here
> ```
>
> 若你使用的是项目级配置，请确保将该文件加入 `.gitignore`。

### 自动更新

编码计划（Coding Plan）模型配置采用版本化管理。当 Qwen Code 检测到模型模板有新版本时，系统将提示你更新。接受更新后，将执行以下操作：

- 使用最新版本替换当前的编码计划模型配置  
- 保留你手动添加的所有自定义模型配置  
- 自动切换至更新后配置中的第一个模型  

该更新流程确保你无需手动干预，即可始终使用最新的模型配置与功能。

### 手动配置（高级）

如果你希望手动配置 Coding Plan 模型，可以像配置任何兼容 OpenAI 的提供商一样，将它们添加到 `settings.json` 文件中：

```json
{
  "modelProviders": {
    "openai": [
      {
        "id": "qwen3-coder-plus",
        "name": "qwen3-coder-plus",
        "description": "通过阿里云 Coding Plan 使用的 Qwen3-Coder",
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
> - `envKey` 可使用任意环境变量名称  
> - 无需配置 `codingPlan.*` 相关项  
> - **手动配置的 Coding Plan 模型不会接收自动更新**

> [!warning]
>
> 如果你同时启用了自动 Coding Plan 配置，则当手动配置与自动配置使用相同的 `envKey` 和 `baseUrl` 时，自动更新可能会覆盖你的手动配置。为避免此问题，建议手动配置时尽可能使用不同的 `envKey`。

## 解析层级与原子性

有效的认证方式（auth）、模型（model）和凭证（credential）值按字段分别选取，遵循以下优先级规则（**最先出现者生效**）。你可以组合使用 `--auth-type` 和 `--model` CLI 参数，直接指向某个模型提供方（provider）条目；这些 CLI 标志的解析优先级高于其他层级。

| 层级（从高到低）         | authType                            | model                                           | apiKey                                              | baseUrl                                              | apiKeyEnvKey           | proxy                             |
| ------------------------ | ----------------------------------- | ----------------------------------------------- | --------------------------------------------------- | ---------------------------------------------------- | ---------------------- | --------------------------------- |
| 编程式覆盖（Programmatic overrides） | `/auth`                             | `/auth` 输入                                    | `/auth` 输入                                        | `/auth` 输入                                         | —                      | —                                 |
| 模型提供方选择（Model provider selection） | —                                   | `modelProvider.id`                              | `env[modelProvider.envKey]`                         | `modelProvider.baseUrl`                              | `modelProvider.envKey` | —                                 |
| CLI 参数                 | `--auth-type`                       | `--model`                                       | `--openaiApiKey`（或其他提供方对应的等效参数）      | `--openaiBaseUrl`（或其他提供方对应的等效参数）      | —                      | —                                 |
| 环境变量                 | —                                   | 提供方特定映射（如 `OPENAI_MODEL`）             | 提供方特定映射（如 `OPENAI_API_KEY`）               | 提供方特定映射（如 `OPENAI_BASE_URL`）               | —                      | —                                 |
| 配置文件（`settings.json`） | `security.auth.selectedType`        | `model.name`                                    | `security.auth.apiKey`                              | `security.auth.baseUrl`                              | —                      | —                                 |
| 默认值 / 计算值            | 回退至 `AuthType.QWEN_OAUTH`        | 内置默认值（OpenAI ⇒ `qwen3-coder-plus`）       | —                                                   | —                                                    | —                      | 若已配置，则为 `Config.getProxy()` |

\*当 CLI 认证相关标志存在时，将覆盖 `settings.json` 中的对应配置；否则，由 `security.auth.selectedType` 或隐式默认值决定认证类型。目前仅 Qwen OAuth 和 OpenAI 两种认证类型无需额外配置即可直接使用。

> [!warning]
>
> **弃用 `security.auth.apiKey` 和 `security.auth.baseUrl`：**  
> 在 `settings.json` 中通过 `security.auth.apiKey` 和 `security.auth.baseUrl` 直接配置 API 凭据的方式已被弃用。这两个字段曾在历史版本中用于保存用户通过 UI 输入的凭证，但该凭证输入流程已在 0.10.1 版本中移除。这些字段将在后续版本中彻底删除。**强烈建议将所有模型与凭证配置迁移至 `modelProviders`**。请在 `modelProviders` 中使用 `envKey` 字段引用环境变量，以实现安全的凭据管理，避免在配置文件中硬编码敏感信息。

## 生成配置分层：不可穿透的提供者层

配置解析遵循严格的分层模型，其中有一条关键规则：**`modelProvider` 层不可穿透**。

### 工作原理

1. **当已选择一个 `modelProvider` 模型时**（例如，通过 `/model` 命令选择了一个由提供方配置的模型）：
   - 提供方定义的整个 `generationConfig` 将被**原子化应用**
   - **提供方层级完全不可穿透** —— 更低层级（CLI、环境变量、设置）完全不参与 `generationConfig` 的解析
   - 所有在 `modelProviders[].generationConfig` 中定义的字段均使用该提供方指定的值
   - 所有**未由提供方定义**的字段均设为 `undefined`（不会从设置中继承）
   - 这确保了提供方配置表现为一个完整、自包含的“密封包”

2. **当未选择任何 `modelProvider` 模型时**（例如，使用 `--model` 指定原始模型 ID，或直接通过 CLI/环境变量/设置指定）：
   - 解析逻辑将逐级回落至更低层级
   - 字段按如下优先级填充：CLI → 环境变量 → 设置 → 默认值
   - 此过程生成一个**运行时模型**（参见下一节）

### `generationConfig` 的字段级优先级

| 优先级 | 来源                                                | 行为                                                                                                     |
| ------ | --------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| 1      | 编程方式覆盖                                          | 运行时 `/model`、`/auth` 的变更                                                                          |
| 2      | `modelProviders[authType][].generationConfig`       | **不可穿透层** —— 完全替换所有 `generationConfig` 字段；下层配置不参与                                      |
| 3      | `settings.model.generationConfig`                   | 仅用于 **运行时模型**（即未选择提供方模型时）                                                              |
| 4      | 内容生成器默认值                                       | 提供方特定的默认值（例如 OpenAI 与 Gemini 的差异）—— 仅适用于运行时模型                                        |

### 原子字段处理

以下字段被视为原子对象——提供方的值将完全替换整个对象，不进行任何合并：

- `samplingParams` — 温度（temperature）、top_p、max_tokens 等参数  
- `customHeaders` — 自定义 HTTP 请求头  
- `extra_body` — 额外的请求体参数

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

当从 `modelProviders` 中选择 `gpt-4o` 时：

- `timeout` = 60000（来自 provider，覆盖用户设置）
- `samplingParams.temperature` = 0.2（来自 provider，完全替换用户设置中的整个 `samplingParams` 对象）
- `samplingParams.max_tokens` = **undefined**（provider 中未定义该字段；provider 层不会继承用户设置中的字段——未显式提供的字段将被设为 `undefined`）

当通过 `--model gpt-4` 直接使用原始模型（不经过 `modelProviders`，此时创建一个运行时模型）时：

- `timeout` = 30000（来自用户设置）
- `samplingParams.temperature` = 0.5（来自用户设置）
- `samplingParams.max_tokens` = 1000（来自用户设置）

`modelProviders` 自身的合并策略为 **REPLACE（完全替换）**：项目设置中的整个 `modelProviders` 部分将直接覆盖用户设置中对应的部分，而非与之合并。

## 提供商模型 vs 运行时模型

Qwen Code 区分两种模型配置：

### 提供商模型

- 在 `modelProviders` 配置中定义
- 拥有完整、原子化的配置包
- 被选中时，其配置将作为不可穿透的层级被应用
- 在 `/model` 命令列表中显示，附带完整元数据（名称、描述、能力）
- 推荐用于多模型工作流及团队配置一致性

### 运行时模型

- 通过 CLI（`--model`）、环境变量或设置使用原始模型 ID 时动态创建
- 未在 `modelProviders` 中定义
- 配置通过解析层级“投影”构建（CLI → 环境变量 → 设置 → 默认值）
- 当检测到完整配置时，自动捕获为 **RuntimeModelSnapshot**
- 支持复用，无需重新输入凭据

### RuntimeModelSnapshot 生命周期

当你在未使用 `modelProviders` 的情况下配置模型时，Qwen Code 会自动创建一个 RuntimeModelSnapshot 来保存你的配置：

```bash
# 此命令将创建一个 ID 为 $runtime|openai|my-custom-model 的 RuntimeModelSnapshot
qwen --auth-type openai --model my-custom-model --openaiApiKey $KEY --openaiBaseUrl https://api.example.com/v1
```

该快照具有以下特性：

- 捕获模型 ID、API 密钥、基础 URL 和生成配置
- 跨会话持久化（运行时存储在内存中）
- 在 `/model` 命令列表中显示为一个运行时选项
- 可通过 `/model $runtime|openai|my-custom-model` 切换使用

### 主要差异

| 方面               | 提供商模型                     | 运行时模型                              |
| ------------------ | ------------------------------ | --------------------------------------- |
| 配置来源           | 设置中的 `modelProviders`       | CLI、环境变量、设置等多层配置           |
| 配置原子性         | 完整且不可分割的包              | 分层配置，每个字段独立解析              |
| 可复用性           | 始终在 `/model` 列表中可用      | 以快照形式捕获，仅当完整时才显示        |
| 团队共享           | 是（通过已提交的设置）          | 否（仅限用户本地）                      |
| 凭据存储           | 仅通过 `envKey` 引用            | 快照中可能直接保存实际密钥              |

### 何时使用每种模型

- **使用 Provider 模型** 的场景：团队内共享标准模型、需要统一配置，或希望防止意外覆盖
- **使用 Runtime 模型** 的场景：快速测试新模型、使用临时凭据，或对接临时端点

## 选择持久化与建议

> [!important]
>
> 尽可能在用户作用域的 `~/.qwen/settings.json` 中定义 `modelProviders`，并避免在任何作用域中持久化凭据覆盖项。将提供程序目录保留在用户设置中，可防止项目作用域与用户作用域之间发生合并/覆盖冲突，并确保 `/auth` 和 `/model` 的更新始终写回到一致的作用域。

- `/model` 和 `/auth` 会将 `model.name`（如适用）及 `security.auth.selectedType` 持久化到**已定义 `modelProviders` 的最近可写作用域**；若无匹配作用域，则回退至用户作用域。此举可使工作区/用户配置文件与当前激活的提供程序目录保持同步。
- 若未定义 `modelProviders`，解析器将混合 CLI、环境变量和设置各层，从而生成运行时模型（Runtime Models）。单提供程序场景下此行为可行，但频繁切换提供程序时则较为繁琐。因此，只要多模型工作流较为常见，就应明确定义提供程序目录，以确保切换操作具备原子性、来源可追溯性及可调试性。