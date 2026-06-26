# 认证

Qwen Code 首次运行时，`/auth` 菜单提供三个顶级选项。请根据你希望运行 CLI 的方式选择：

- **Alibaba ModelStudio**：官方推荐设置。会打开一个子菜单，包含 **Coding Plan**（面向个人开发者 · 包含每周配额）、**Token Plan**（面向团队和公司 · 基于使用量计费，提供专用端点）或 **Standard API Key**（使用已有的 ModelStudio API key 进行连接）。
- **第三方提供商**：选择一个内置提供商并使用 API key 进行连接（DeepSeek、MiniMax、Z.AI、Idealab、ModelScope、OpenRouter、Requesty）。
- **自定义提供商**：手动连接本地服务器、代理或不受支持的提供商——支持 OpenAI、Anthropic、Gemini 及其他兼容端点。

> [!note]
>
> **Qwen OAuth** 不再是可选的对话框条目——其免费层级已于 2026-04-15 停用。下文仍将其作为硬编码的已停用提供商进行说明。

## 选项 1：Qwen OAuth（已停用）

> [!warning]
>
> Qwen OAuth 免费层级已于 2026-04-15 停用。现有缓存的令牌可能仍会短暂工作，但新请求将被拒绝。请切换至阿里云 Coding Plan、[OpenRouter](https://openrouter.ai)、[Fireworks AI](https://app.fireworks.ai) 或其他提供商。运行 `qwen` 并使用 `/auth` 进行配置。

- **工作原理**：首次启动时，Qwen Code 会打开一个浏览器登录页面。完成后，凭证会缓存在本地，因此通常无需再次登录。
- **要求**：一个 `qwen.ai` 账户 + 互联网连接（至少首次登录时需要）。
- **优点**：无需管理 API key，凭证自动刷新。
- **费用与配额**：免费层级已于 2026-04-15 停用。

启动 CLI 并按照浏览器流程操作：

```bash
qwen
```

Qwen OAuth 已不再作为 `/auth` 对话框中的可选条目提供；请运行 `/auth` 并选择当前选项之一（Alibaba ModelStudio、第三方提供商或自定义提供商）。

> [!note]
>
> 在非交互式或无头环境（例如 CI、SSH、容器）中，通常**无法**完成 OAuth 浏览器登录流程。
> 此时，请使用阿里云 Coding Plan 或 API Key 认证方式。

## 💳 选项 2：阿里云 Coding Plan

如果你希望获得可预测的费用、多样化的模型选项以及更高的使用配额，请选择此项。

- **工作原理**：以固定的月度费用订阅 Coding Plan，然后配置 Qwen Code 使用专用端点和你的订阅 API key。
- **要求**：根据你的账户所在区域，从[阿里云 ModelStudio（北京）](https://bailian.console.aliyun.com/cn-beijing?tab=coding-plan#/efm/coding-plan-index)或[阿里云 ModelStudio（国际站）](https://modelstudio.console.alibabacloud.com/?tab=coding-plan#/efm/coding-plan-index)获取有效的 Coding Plan 订阅。
- **优点**：模型选项多样、使用配额更高、月费用可预测，可访问多种模型（Qwen、GLM、Kimi、Minimax 等）。
- **费用与配额**：查看阿里云 ModelStudio Coding Plan 文档[北京站](https://bailian.console.aliyun.com/cn-beijing/?tab=doc#/doc/?type=model&url=3005961)[国际站](https://modelstudio.console.alibabacloud.com/?tab=doc#/doc/?type=model&url=2840914)。

阿里云 Coding Plan 在两个区域可用：

| 区域                           | 控制台 URL                                                                   |
| ------------------------------ | ---------------------------------------------------------------------------- |
| 阿里云 ModelStudio（北京）     | [bailian.console.aliyun.com](https://bailian.console.aliyun.com)             |
| 阿里云（国际站）               | [bailian.console.alibabacloud.com](https://bailian.console.alibabacloud.com) |

### 交互式设置

在终端中输入 `qwen` 启动 Qwen Code，然后运行 `/auth` 命令，选择 **Alibaba ModelStudio**，再在子菜单中选择 **Coding Plan**。选择你的区域，然后输入你的 `sk-sp-xxxxxxxxx` 密钥。

认证后，使用 `/model` 命令可在所有阿里云 Coding Plan 支持的模型之间切换（包括 qwen3.5-plus、qwen3.6-plus、qwen3.7-plus、qwen3-coder-plus、qwen3-coder-next、qwen3-max-2026-01-23、glm-5、glm-4.7、kimi-k2.5 和 MiniMax-M2.5）。

### 无头环境或脚本化设置

对于 CI、容器或脚本，使用环境变量或 `settings.json` 配置 Coding Plan，而不是已移除的 `qwen auth coding-plan` 命令。

```bash
export BAILIAN_CODING_PLAN_API_KEY="sk-sp-xxxxxxxxx"
export OPENAI_BASE_URL="https://coding.dashscope.aliyuncs.com/v1"
export OPENAI_MODEL="qwen3-coder-plus"
```

对于中国（北京）端点，使用 `https://coding.dashscope.aliyuncs.com/v1`；对于国际端点，使用 `https://coding-intl.dashscope.aliyuncs.com/v1`。

### 替代方案：通过 `settings.json` 配置

如果你希望跳过交互式的 `/auth` 流程，请在 `~/.qwen/settings.json` 中添加以下内容：

```json
{
  "modelProviders": {
    "openai": {
      "protocol": "openai",
      "models": [
        {
          "id": "qwen3-coder-plus",
          "name": "qwen3-coder-plus (Coding Plan)",
          "baseUrl": "https://coding.dashscope.aliyuncs.com/v1",
          "description": "来自阿里云 Coding Plan 的 qwen3-coder-plus",
          "envKey": "BAILIAN_CODING_PLAN_API_KEY"
        }
      ]
    }
  },
  "env": {
    "BAILIAN_CODING_PLAN_API_KEY": "sk-sp-xxxxxxxxx"
  },
  "security": {
    "auth": {
      "selectedType": "openai"
    }
  },
  "model": {
    "name": "qwen3-coder-plus"
  }
}
```

> [!note]
>
> Coding Plan 使用专用端点（`https://coding.dashscope.aliyuncs.com/v1`），与标准 Dashscope 端点不同。请确保使用正确的 `baseUrl`。

## 🚀 选项 3：API Key（灵活）

如果你希望连接第三方提供商，如 OpenAI、Anthropic、Google、Azure OpenAI、OpenRouter、Requesty、ModelScope 或自托管端点，请选择此项。支持多种协议和提供商。

### 推荐：通过 `settings.json` 单文件设置

开始使用 API Key 认证的最简单方式是将所有内容放在一个 `~/.qwen/settings.json` 文件中。以下是一个完整的、可直接使用的示例：

```json
{
  "modelProviders": {
    "openai": {
      "protocol": "openai",
      "models": [
        {
          "id": "qwen3-coder-plus",
          "name": "qwen3-coder-plus",
          "baseUrl": "https://dashscope.aliyuncs.com/compatible-mode/v1",
          "description": "通过 Dashscope 的 Qwen3-Coder",
          "envKey": "DASHSCOPE_API_KEY"
        }
      ]
    }
  },
  "env": {
    "DASHSCOPE_API_KEY": "sk-xxxxxxxxxxxxx"
  },
  "security": {
    "auth": {
      "selectedType": "openai"
    }
  },
  "model": {
    "name": "qwen3-coder-plus"
  }
}
```

每个字段的作用：

| 字段                          | 描述                                                                                                                                     |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `modelProviders`              | 声明哪些模型可用以及如何连接它们。键（`openai`、`anthropic`、`gemini`）代表 API 协议。                                                   |
| `env`                         | 将 API key 直接存储在 `settings.json` 中作为后备方案（优先级最低——shell `export` 和 `.env` 文件的优先级更高）。                          |
| `security.auth.selectedType`  | 告诉 Qwen Code 在启动时使用哪个协议（例如 `openai`、`anthropic`、`gemini`）。如果没有此项，则需要交互式地运行 `/auth`。                  |
| `model.name`                  | Qwen Code 启动时激活的默认模型。必须与 `modelProviders` 中的某个 `id` 值匹配。                                                           |

保存文件后，只需运行 `qwen`——无需交互式的 `/auth` 设置。

> [!tip]
>
> 下面的章节会详细解释每个部分。如果上面的快速示例已经满足你的需求，可以直接跳到[安全注意事项](#安全注意事项)。

核心概念是**模型提供商**（`modelProviders`）：Qwen Code 支持多种 API 协议，不仅仅是 OpenAI。你可以通过编辑 `~/.qwen/settings.json` 来配置哪些提供商和模型可用，然后在运行时使用 `/model` 命令进行切换。

#### 支持的协议

| 协议              | `modelProviders` 键 | 环境变量                                                                                         | 提供商                                                                                                   |
| ----------------- | ------------------- | ------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| OpenAI 兼容       | `openai`            | `OPENAI_API_KEY`, `OPENAI_BASE_URL`, `OPENAI_MODEL`                                               | OpenAI, Azure OpenAI, OpenRouter, Requesty, ModelScope, 阿里云, 任何 OpenAI 兼容的端点                   |
| Anthropic         | `anthropic`         | `ANTHROPIC_API_KEY`, `ANTHROPIC_BASE_URL`, `ANTHROPIC_MODEL`                                      | Anthropic Claude                                                                                         |
| Google GenAI      | `gemini`            | `GEMINI_API_KEY`, `GEMINI_MODEL`                                                                  | Google Gemini                                                                                            |
| Vertex AI         | `vertex-ai`         | `GOOGLE_API_KEY`, `GOOGLE_MODEL` (设置 `GOOGLE_GENAI_USE_VERTEXAI=true`；使用 `gemini` 协议)      | Google Vertex AI                                                                                         |

#### 步骤 1：在 `~/.qwen/settings.json` 中配置模型和提供商

定义每个协议下可用的模型。每个模型条目至少需要一个 `id`；`envKey`（保存 API key 的环境变量名）是可选的但推荐使用——省略时会回退到该认证类型的默认环境变量名（例如 `openai` 的 `OPENAI_API_KEY`）。

> [!important]
>
> 建议在用户级作用域 `~/.qwen/settings.json` 中定义 `modelProviders`，以避免项目设置与用户设置之间的合并冲突。

编辑 `~/.qwen/settings.json`（如果不存在则创建）。你可以在一个文件中混合多种协议——以下是一个多提供商示例，仅展示 `modelProviders` 部分：

```json
{
  "modelProviders": {
    "openai": {
      "protocol": "openai",
      "models": [
        {
          "id": "gpt-4o",
          "name": "GPT-4o",
          "envKey": "OPENAI_API_KEY",
          "baseUrl": "https://api.openai.com/v1"
        }
      ]
    },
    "anthropic": {
      "protocol": "anthropic",
      "models": [
        {
          "id": "claude-sonnet-4-20250514",
          "name": "Claude Sonnet 4",
          "envKey": "ANTHROPIC_API_KEY"
        }
      ]
    },
    "gemini": {
      "protocol": "gemini",
      "models": [
        {
          "id": "gemini-2.5-pro",
          "name": "Gemini 2.5 Pro",
          "envKey": "GEMINI_API_KEY"
        }
      ]
    }
  }
}
```

> [!tip]
>
> 别忘了同时设置 `env`、`security.auth.selectedType` 和 `model.name`，与 `modelProviders` 一起——请参考上面的[完整示例](#推荐通过-settingsjson-单文件设置)。

**`ModelConfig` 字段（`modelProviders` 内的每个条目）：**

| 字段                | 必填 | 描述                                                                                                              |
| ------------------- | ---- | ----------------------------------------------------------------------------------------------------------------- |
| `id`                | 是   | 发送给 API 的模型 ID（例如 `gpt-4o`、`claude-sonnet-4-20250514`）                                                  |
| `name`              | 否   | 在 `/model` 选择器中显示的名称（默认为 `id`）                                                                     |
| `envKey`            | 否   | API key 的环境变量名（例如 `OPENAI_API_KEY`）；可选但推荐——省略时回退到该认证类型的默认环境变量名                  |
| `baseUrl`           | 否   | API 端点覆盖（用于代理或自定义端点）                                                                              |
| `generationConfig`  | 否   | 微调 `timeout`、`maxRetries`、`samplingParams` 等                                                                  |

> [!note]
>
> 在 `settings.json` 中使用 `env` 字段时，凭证以明文形式存储。为了更好的安全性，推荐使用 `.env` 文件或 shell `export`——请参见[步骤 2](#步骤-2设置环境变量)。

有关 `modelProviders` 的完整模式以及 `generationConfig`、`customHeaders`、`extra_body` 等高级选项，请参阅[模型提供商参考](model-providers.md)。

#### 步骤 2：设置环境变量

Qwen Code 从环境变量（由模型配置中的 `envKey` 指定）读取 API key。有多种提供方式，按**优先级从高到低**排列如下：

**1. Shell 环境 / `export`（最高优先级）**

直接在 shell 配置文件（`~/.zshrc`、`~/.bashrc` 等）中设置，或在启动前内联设置：

```bash

# 阿里云 Dashscope
export DASHSCOPE_API_KEY="sk-..."

# OpenAI / OpenAI 兼容
export OPENAI_API_KEY="sk-..."

# Anthropic
export ANTHROPIC_API_KEY="sk-ant-..."

# Google GenAI
export GEMINI_API_KEY="AIza..."
```

**2. `.env` 文件**

Qwen Code 会自动加载它找到的**第一个** `.env` 文件（变量**不会**跨多个文件合并）。仅当变量尚未存在于 `process.env` 中时才会加载。

搜索顺序（从当前目录开始，向上遍历到 `/`）：

1. `.qwen/.env`（推荐——将 Qwen Code 变量与其他工具的变量隔离）
2. `.env`

如果未找到，则回退到家目录：

3. `~/.qwen/.env`
4. `~/.env`

> [!tip]
>
> 建议使用 `.qwen/.env` 而不是 `.env`，以避免与其他工具发生冲突。某些变量（如 `DEBUG` 和 `DEBUG_MODE`）被排除在项目级 `.env` 文件之外，以免干扰 Qwen Code 的行为。

**3. `settings.json` → `env` 字段（最低优先级）**

你也可以直接在 `~/.qwen/settings.json` 的 `env` 键下定义 API key。这些被加载为**最低优先级的后备方案**——仅当变量尚未通过系统环境或 `.env` 文件设置时才会应用。

```json
{
  "env": {
    "DASHSCOPE_API_KEY": "sk-...",
    "OPENAI_API_KEY": "sk-...",
    "ANTHROPIC_API_KEY": "sk-ant-..."
  }
}
```

这就是上面[单文件设置示例](#推荐通过-settingsjson-单文件设置)中使用的方法。方便将所有内容放在一个地方，但请注意 `settings.json` 可能被共享或同步——对于敏感机密信息，推荐使用 `.env` 文件。

**优先级总结：**

| 优先级      | 来源                          | 覆盖行为                              |
| ----------- | ----------------------------- | ------------------------------------- |
| 1（最高）   | CLI 标志（`--openai-api-key`）| 始终优先                              |
| 2           | 系统环境（`export`、内联）    | 覆盖 `.env` 和 `settings.json` → `env`|
| 3           | `.env` 文件                   | 仅当系统环境中不存在时设置            |
| 4（最低）   | `settings.json` → `env`       | 仅当系统环境或 `.env` 中不存在时设置  |

#### 步骤 3：使用 `/model` 切换模型

启动 Qwen Code 后，使用 `/model` 命令在配置的所有模型之间切换。模型按协议分组：

```
/model
```

选择器将显示来自你 `modelProviders` 配置的所有模型，并按协议分组（例如 `openai`、`anthropic`、`gemini`）。你的选择会在会话间持久化。

你也可以直接通过命令行参数切换模型，这在跨多个终端工作时非常方便。

```bash
# 在一个终端中
qwen --model "qwen3-coder-plus"

# 在另一个终端中
qwen --model "qwen3.5-plus"
```

## 已移除的 `qwen auth` CLI 命令

独立的 `qwen auth` CLI 命令已被移除。请使用以下替代方案：

| 之前的用途                     | 替代方案                                                                                         |
| ------------------------------ | ------------------------------------------------------------------------------------------------ |
| 交互式认证设置                 | 运行 `qwen`，然后使用 `/auth`                                                                    |
| Coding Plan 设置               | 使用 `/auth`，或设置 `BAILIAN_CODING_PLAN_API_KEY` 并指定 Coding Plan 基础 URL                  |
| OpenRouter 设置                | 使用 `/auth`，或设置 `OPENROUTER_API_KEY` 和 `OPENAI_BASE_URL=https://openrouter.ai/api/v1`      |
| Requesty 设置                  | 使用 `/auth`，或设置 `REQUESTY_API_KEY` 和 `OPENAI_BASE_URL=https://router.requesty.ai/v1`       |
| API key 或自定义提供商设置     | 配置 `~/.qwen/settings.json`、`.env` 或提供商特定的环境变量                                      |
| 检查当前认证状态               | 在 Qwen Code 中运行 `/doctor`                                                                    |
| OAuth 浏览器流程               | 交互式运行 `qwen` 并使用 `/auth`；OAuth 无法仅通过环境变量配置                                   |

旧版调用方式（如 `qwen auth status`）现在会打印一条移除通知，并附带这些迁移路径。

## 安全注意事项

- 不要将 API key 提交到版本控制系统。
- 优先使用 `.qwen/.env` 存储项目本地机密信息（并确保它不被纳入 Git）。
- 如果终端输出中包含凭证验证信息，请将其视为敏感内容。