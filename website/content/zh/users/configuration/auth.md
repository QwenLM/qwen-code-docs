# 身份验证

Qwen Code 首次运行时的 `/auth` 菜单包含三个顶级选项。请根据你运行 CLI 的方式选择对应的选项：

- **Alibaba ModelStudio**：官方推荐的配置方式。打开子菜单后可选择 **Coding Plan**（面向个人开发者 · 包含每周配额）、**Token Plan**（面向团队和企业 · 按量计费并提供专属 endpoint）或 **Standard API Key**（使用现有的 ModelStudio API key 进行连接）。
- **Third-party Providers**：选择内置的 provider 并使用 API key 进行连接（DeepSeek、MiniMax、Z.AI、Idealab、ModelScope、OpenRouter、Requesty）。
- **Custom Provider**：手动连接本地服务器、代理或不支持的 provider —— 支持 OpenAI、Anthropic、Gemini 及其他兼容的 endpoint。

> [!note]
>
> **Qwen OAuth** 不再是可选的对话框条目 —— 其免费套餐已于 2026-04-15 停止服务。以下内容仅作为硬编码的已废弃 provider 保留在文档中。

## 选项 1：Qwen OAuth（已停用）

> [!warning]
>
> Qwen OAuth 免费套餐已于 2026-04-15 停用。现有的缓存 token 可能还会短暂生效，但新请求将被拒绝。请切换到 Alibaba Cloud Coding Plan、[OpenRouter](https://openrouter.ai)、[Fireworks AI](https://app.fireworks.ai) 或其他 provider。运行 `qwen` 并使用 `/auth` 进行配置。

- **工作原理**：首次启动时，Qwen Code 会打开浏览器登录页面。完成登录后，凭据会被缓存在本地，通常无需再次登录。
- **要求**：一个 `qwen.ai` 账号 + 网络连接（至少首次登录时需要）。
- **优势**：无需管理 API key，凭据自动刷新。
- **费用与配额**：免费套餐已于 2026-04-15 停用。

启动 CLI 并按照浏览器流程操作：

```bash
qwen
```

Qwen OAuth 已不再作为 `/auth` 对话框中的可选条目；请运行 `/auth` 并选择当前的可用选项（Alibaba ModelStudio、Third-party Providers 或 Custom Provider）。

> [!note]
>
> 在非交互式或无头环境（例如 CI、SSH、容器）中，通常**无法**完成 OAuth 浏览器登录流程。
> 在这些情况下，请使用 Alibaba Cloud Coding Plan 或 API Key 身份验证方式。

## 💳 选项 2：Alibaba Cloud Coding Plan

如果你希望成本可预测，同时拥有丰富的模型选项和更高的使用配额，请使用此选项。

- **工作原理**：以固定月费订阅 Coding Plan，然后配置 Qwen Code 使用专属 endpoint 和你的订阅 API key。
- **要求**：根据你账号所在的区域，从 [Alibaba Cloud ModelStudio(Beijing)](https://bailian.console.aliyun.com/cn-beijing?tab=coding-plan#/efm/coding-plan-index) 或 [Alibaba Cloud ModelStudio(intl)](https://modelstudio.console.alibabacloud.com/?tab=coding-plan#/efm/coding-plan-index) 获取有效的 Coding Plan 订阅。
- **优势**：丰富的模型选项、更高的使用配额、可预测的月度成本，以及访问广泛的模型（Qwen、GLM、Kimi、Minimax 等）。
- **费用与配额**：查看阿里云 ModelStudio Coding Plan 文档 [Beijing](https://bailian.console.aliyun.com/cn-beijing/?tab=doc#/doc/?type=model&url=3005961) [intl](https://modelstudio.console.alibabacloud.com/?tab=doc#/doc/?type=model&url=2840914)。

Alibaba Cloud Coding Plan 在两个区域可用：

| 区域 | 控制台 URL |
| --- | --- |
| Aliyun ModelStudio (Beijing) | [bailian.console.aliyun.com](https://bailian.console.aliyun.com) |
| Alibaba Cloud (intl) | [bailian.console.alibabacloud.com](https://bailian.console.alibabacloud.com) |

### 交互式配置

在终端中输入 `qwen` 启动 Qwen Code，然后运行 `/auth` 命令，选择 **Alibaba ModelStudio**，并在子菜单中选择 **Coding Plan**。选择你的区域，然后输入你的 `sk-sp-xxxxxxxxx` key。

身份验证完成后，使用 `/model` 命令在所有 Alibaba Cloud Coding Plan 支持的模型之间切换（包括 qwen3.5-plus、qwen3.6-plus、qwen3.7-plus、qwen3-coder-plus、qwen3-coder-next、qwen3-max-2026-01-23、glm-5、glm-4.7、kimi-k2.5 和 MiniMax-M2.5）。

### 无头或脚本化配置

对于 CI、容器或脚本，请使用环境变量或 `settings.json` 来配置 Coding Plan，而不是使用已移除的 `qwen auth coding-plan` 命令。

```bash
export BAILIAN_CODING_PLAN_API_KEY="sk-sp-xxxxxxxxx"
export OPENAI_BASE_URL="https://coding.dashscope.aliyuncs.com/v1"
export OPENAI_MODEL="qwen3-coder-plus"
```

中国（北京）endpoint 使用 `https://coding.dashscope.aliyuncs.com/v1`，国际 endpoint 使用 `https://coding-intl.dashscope.aliyuncs.com/v1`。

### 替代方案：通过 `settings.json` 配置

如果你希望跳过交互式 `/auth` 流程，请将以下内容添加到 `~/.qwen/settings.json` 中：

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
          "description": "qwen3-coder-plus from Alibaba Cloud Coding Plan",
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
> Coding Plan 使用专属 endpoint（`https://coding.dashscope.aliyuncs.com/v1`），这与标准的 Dashscope endpoint 不同。请确保使用正确的 `baseUrl`。

## 🚀 选项 3：API Key（灵活）

如果你希望连接到 OpenAI、Anthropic、Google、Azure OpenAI、OpenRouter、Requesty、ModelScope 等第三方 provider 或自托管 endpoint，请使用此选项。支持多种协议和 provider。

### 推荐：通过 `settings.json` 进行单文件配置

开始使用 API Key 身份验证的最简单方法是将所有配置放在单个 `~/.qwen/settings.json` 文件中。以下是一个完整且可直接使用的示例：

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
          "description": "Qwen3-Coder via Dashscope",
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

各字段的作用：

| 字段 | 描述 |
| --- | --- |
| `modelProviders` | 声明可用的模型及其连接方式。键（`openai`、`anthropic`、`gemini`）代表 API 协议。 |
| `env` | 将 API key 直接存储在 `settings.json` 中作为后备方案（优先级最低 —— shell `export` 和 `.env` 文件优先级更高）。 |
| `security.auth.selectedType` | 告诉 Qwen Code 在启动时使用哪种协议（例如 `openai`、`anthropic`、`gemini`）。如果没有此项，你需要交互式运行 `/auth`。 |
| `model.name` | Qwen Code 启动时激活的默认模型。必须与 `modelProviders` 中的某个 `id` 值匹配。 |

保存文件后，直接运行 `qwen` 即可 —— 无需进行交互式 `/auth` 配置。

> [!tip]
>
> 以下部分将更详细地解释每个部分。如果上面的快速示例已经满足你的需求，可以直接跳到[安全注意事项](#security-notes)。

核心概念是 **Model Providers**（`modelProviders`）：Qwen Code 支持多种 API 协议，而不仅仅是 OpenAI。你可以通过编辑 `~/.qwen/settings.json` 来配置可用的 provider 和模型，然后在运行时使用 `/model` 命令在它们之间切换。

#### 支持的协议

| 协议 | `modelProviders` 键 | 环境变量 | Providers |
| --- | --- | --- | --- |
| OpenAI 兼容 | `openai` | `OPENAI_API_KEY`、`OPENAI_BASE_URL`、`OPENAI_MODEL`（别名：`QWEN_MODEL`） | OpenAI、Azure OpenAI、OpenRouter、Requesty、ModelScope、Alibaba Cloud、任何兼容 OpenAI 的 endpoint |
| Anthropic | `anthropic` | `ANTHROPIC_API_KEY`、`ANTHROPIC_BASE_URL`、`ANTHROPIC_MODEL` | Anthropic Claude |
| Google GenAI | `gemini` | `GEMINI_API_KEY`、`GEMINI_MODEL` | Google Gemini |
| Vertex AI | `vertex-ai` | `GOOGLE_API_KEY`、`GOOGLE_MODEL`（设置 `GOOGLE_GENAI_USE_VERTEXAI=true`；使用 `gemini` 协议） | Google Vertex AI |

#### 步骤 1：在 `~/.qwen/settings.json` 中配置模型和 provider

定义每种协议可用的模型。每个模型条目至少需要一个 `id`；`envKey`（保存 API key 的环境变量名）是可选但推荐的 —— 如果省略，它将回退到该身份验证类型的默认环境变量（例如 `openai` 的 `OPENAI_API_KEY`）。

> [!important]
>
> 建议在用户作用域的 `~/.qwen/settings.json` 中定义 `modelProviders`，以避免项目设置和用户设置之间的合并冲突。

编辑 `~/.qwen/settings.json`（如果不存在则创建）。你可以在单个文件中混合使用多种协议 —— 以下是一个多 provider 示例，仅展示 `modelProviders` 部分：

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
> 别忘了在配置 `modelProviders` 的同时设置 `env`、`security.auth.selectedType` 和 `model.name` —— 请参考[上面的完整示例](#recommended-one-file-setup-via-settingsjson)。

**`ModelConfig` 字段（`modelProviders` 中的每个条目）：**

| 字段 | 必填 | 描述 |
| --- | --- | --- |
| `id` | 是 | 发送给 API 的模型 ID（例如 `gpt-4o`、`claude-sonnet-4-20250514`） |
| `name` | 否 | `/model` 选择器中的显示名称（默认为 `id`） |
| `envKey` | 否 | API key 的环境变量名（例如 `OPENAI_API_KEY`）；可选/推荐 —— 省略时默认为该身份验证类型的默认环境变量 |
| `baseUrl` | 否 | API endpoint 覆盖（适用于代理或自定义 endpoint） |
| `generationConfig` | 否 | 微调 `timeout`、`maxRetries`、`samplingParams` 等。 |

> [!note]
>
> 在 `settings.json` 中使用 `env` 字段时，凭据将以明文形式存储。为了更高的安全性，建议使用 `.env` 文件或 shell `export` —— 请参阅[步骤 2](#step-2-set-environment-variables)。

有关完整的 `modelProviders` schema 以及 `generationConfig`、`customHeaders` 和 `extra_body` 等高级选项，请参阅 [Model Providers Reference](model-providers.md)。

#### 步骤 2：设置环境变量

Qwen Code 从环境变量（由模型配置中的 `envKey` 指定）读取 API key。有多种方式提供这些变量，以下按**优先级从高到低**列出：

**1. Shell 环境 / `export`（最高优先级）**

直接在 shell 配置文件（`~/.zshrc`、`~/.bashrc` 等）中设置，或在启动前内联设置：

```bash

# Alibaba Dashscope
export DASHSCOPE_API_KEY="sk-..."

# OpenAI / OpenAI-compatible
export OPENAI_API_KEY="sk-..."

# Anthropic
export ANTHROPIC_API_KEY="sk-ant-..."

# Google GenAI
export GEMINI_API_KEY="AIza..."
```

**2. `.env` 文件**

Qwen Code 会自动加载它找到的**第一个** `.env` 文件（变量**不会**在多个文件之间合并）。仅加载 `process.env` 中尚不存在的变量。

搜索顺序（从当前目录开始，向上查找至 `/`）：

1. `.qwen/.env`（推荐 —— 保持 Qwen Code 变量与其他工具隔离）
2. `.env`

如果未找到，则回退到你的**主目录**：

3. `~/.qwen/.env`
4. `~/.env`

> [!tip]
>
> 建议使用 `.qwen/.env` 而不是 `.env`，以避免与其他工具冲突。某些变量（如 `DEBUG` 和 `DEBUG_MODE`）被排除在项目级 `.env` 文件之外，以免干扰 Qwen Code 的行为。

**3. `settings.json` → `env` 字段（最低优先级）**

你也可以直接在 `~/.qwen/settings.json` 的 `env` 键下定义 API key。这些将作为**最低优先级的后备方案**加载 —— 仅在系统环境或 `.env` 文件未设置该变量时应用。

```json
{
  "env": {
    "DASHSCOPE_API_KEY": "sk-...",
    "OPENAI_API_KEY": "sk-...",
    "ANTHROPIC_API_KEY": "sk-ant-..."
  }
}
```

这就是上面[单文件配置示例](#recommended-one-file-setup-via-settingsjson)中使用的方法。将所有内容保存在一个地方很方便，但请注意 `settings.json` 可能会被共享或同步 —— 对于敏感密钥，建议使用 `.env` 文件。

**优先级总结：**

| 优先级 | 来源 | 覆盖行为 |
| --- | --- | --- |
| 1（最高） | CLI 参数（`--openai-api-key`） | 始终生效 |
| 2 | 系统环境变量（`export`、内联） | 覆盖 `.env` 和 `settings.json` → `env` |
| 3 | `.env` 文件 | 仅在系统环境变量中未设置时生效 |
| 4（最低） | `settings.json` → `env` | 仅在系统环境变量或 `.env` 中未设置时生效 |

#### 步骤 3：使用 `/model` 切换模型

启动 Qwen Code 后，使用 `/model` 命令在所有已配置的模型之间切换。模型按协议分组：

```
/model
```

选择器将显示 `modelProviders` 配置中的所有模型，并按协议（例如 `openai`、`anthropic`、`gemini`）分组。你的选择会在各个会话之间持久化。

你也可以直接通过命令行参数切换模型，这在跨多个终端工作时非常方便。

```bash
# In one terminal

qwen --model "qwen3-coder-plus"

# In another terminal

qwen --model "qwen3.5-plus"
```

## 已移除的 `qwen auth` CLI 命令

独立的 `qwen auth` CLI 命令已被移除。请使用以下替代方案：

| 以前的用例 | 替代方案 |
| --- | --- |
| 交互式身份验证配置 | 运行 `qwen`，然后使用 `/auth` |
| Coding Plan 配置 | 使用 `/auth`，或设置 `BAILIAN_CODING_PLAN_API_KEY` 及 Coding Plan base URL |
| OpenRouter 配置 | 使用 `/auth`，或设置 `OPENROUTER_API_KEY` 和 `OPENAI_BASE_URL=https://openrouter.ai/api/v1` |
| Requesty 配置 | 使用 `/auth`，或设置 `REQUESTY_API_KEY` 和 `OPENAI_BASE_URL=https://router.requesty.ai/v1` |
| API key 或自定义 provider 配置 | 配置 `~/.qwen/settings.json`、`.env` 或 provider 特定的环境变量 |
| 检查当前身份验证 | 在 Qwen Code 中运行 `/doctor` |
| OAuth 浏览器流程 | 交互式运行 `qwen` 并使用 `/auth`；OAuth 无法仅通过环境变量配置 |

像 `qwen auth status` 这样的旧版调用现在会打印移除通知及这些迁移路径。

## 安全注意事项

- 不要将 API key 提交到版本控制中。
- 优先使用 `.qwen/.env` 存储项目本地密钥（并将其排除在 git 之外）。
- 如果终端输出打印了用于验证的凭据，请将其视为敏感信息。