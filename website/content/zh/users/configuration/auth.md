# 身份验证

Qwen Code 支持三种身份验证方式。请选择与您运行 CLI 方式相匹配的方式：

- **Qwen OAuth**：在浏览器中使用您的 `qwen.ai` 账户登录。免费，每日有调用配额。
- **阿里云 Coding 计划**：使用来自阿里云的 API 密钥。需付费订阅，提供多种模型选项及更高的调用配额。
- **API 密钥**：使用您自己的 API 密钥。灵活适配您的需求 — 支持 OpenAI、Anthropic、Gemini 及其他兼容的端点。

## 方案 1：Qwen OAuth（免费）

如果你希望采用最简单的配置方式，并且使用的是 Qwen 模型，请选择此方案。

- **工作原理**：首次启动时，Qwen Code 会自动打开浏览器登录页面。完成登录后，凭据将被缓存在本地，因此通常无需再次登录。
- **前提条件**：需拥有一个 `qwen.ai` 账户，并具备网络连接（至少首次登录时需要）。
- **优势**：无需手动管理 API key，凭据可自动刷新。
- **费用与配额**：完全免费，配额为 **每分钟 60 次请求**，**每天 1,000 次请求**。

启动 CLI 并按浏览器流程操作：

```bash
qwen
```

> [!note]
>
> 在非交互式或无图形界面的环境中（例如 CI 环境、SSH 连接、容器），你通常**无法**完成 OAuth 浏览器登录流程。  
> 此类情况下，请改用阿里云编码计划（Alibaba Cloud Coding Plan）或 API Key 认证方式。

## 💳 方案 2：阿里云“编码计划”

若你希望获得可预测的成本、丰富的模型选择以及更高的调用配额，请选用此方案。

- **工作原理**：按月订阅“编码计划”，支付固定费用，然后配置 Qwen Code 使用专属端点及你的订阅 API 密钥。
- **前提条件**：根据你的账号所在区域，在 [阿里云百炼](https://bailian.console.aliyun.com/?tab=model#/efm/coding_plan) 或 [阿里云](https://bailian.console.alibabacloud.com/?tab=model#/efm/coding_plan) 获取有效的“编码计划”订阅。
- **优势**：支持多种模型、享有更高调用配额、每月成本可预期，并可访问一系列主流模型（包括 Qwen、GLM、Kimi、Minimax 等）。
- **费用与配额**：详见 [阿里云百炼“编码计划”文档](https://bailian.console.aliyun.com/cn-beijing/?tab=doc#/doc/?type=model&url=3005961)。

阿里云“编码计划”目前在以下两个区域提供：

| 区域                           | 控制台地址                                                                  |
| -------------------------------- | ---------------------------------------------------------------------------- |
| 阿里云百炼（aliyun.com）         | [bailian.console.aliyun.com](https://bailian.console.aliyun.com)             |
| 阿里云（alibabacloud.com）       | [bailian.console.alibabacloud.com](https://bailian.console.alibabacloud.com) |

### 交互式设置

在终端中输入 `qwen` 启动 Qwen Code，然后运行 `/auth` 命令并选择 **阿里云编码计划**。选择所在区域，再输入你的 `sk-sp-xxxxxxxxx` 密钥。

认证完成后，使用 `/model` 命令在所有阿里云编码计划支持的模型之间切换（包括 qwen3.5-plus、qwen3-coder-plus、qwen3-coder-next、qwen3-max、glm-4.7 和 kimi-k2.5）。

### 替代方案：通过 `settings.json` 进行配置

如果你希望跳过交互式的 `/auth` 流程，请将以下内容添加到 `~/.qwen/settings.json` 文件中：

```json
{
  "modelProviders": {
    "openai": [
      {
        "id": "qwen3-coder-plus",
        "name": "qwen3-coder-plus (Coding Plan)",
        "baseUrl": "https://coding.dashscope.aliyuncs.com/v1",
        "description": "来自阿里云 Coding Plan 的 qwen3-coder-plus",
        "envKey": "BAILIAN_CODING_PLAN_API_KEY"
      }
    ]
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
> Coding Plan 使用专用端点（`https://coding.dashscope.aliyuncs.com/v1`），该端点与标准 Dashscope 端点不同。请确保使用正确的 `baseUrl`。

## 🚀 选项 3：API 密钥（灵活）

如果你希望连接第三方服务商（例如 OpenAI、Anthropic、Google、Azure OpenAI、OpenRouter、ModelScope 或自托管的端点），请使用此方式。支持多种协议和多个服务商。

### 推荐：通过 `settings.json` 单文件配置

使用 API Key 进行身份验证最简单的方式是将所有配置放入单个 `~/.qwen/settings.json` 文件中。以下是一个完整、开箱即用的示例：

```json
{
  "modelProviders": {
    "openai": [
      {
        "id": "qwen3-coder-plus",
        "name": "qwen3-coder-plus",
        "baseUrl": "https://dashscope.aliyuncs.com/compatible-mode/v1",
        "description": "Qwen3-Coder via Dashscope",
        "envKey": "DASHSCOPE_API_KEY"
      }
    ]
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

各字段说明如下：

| 字段                         | 说明                                                                                                                                              |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `modelProviders`             | 声明可用的模型及其连接方式。键名（如 `openai`、`anthropic`、`gemini`）代表所使用的 API 协议。                                                         |
| `env`                        | 将 API Key 直接存入 `settings.json` 作为备用方案（优先级最低；shell 中的 `export` 和 `.env` 文件优先级更高）。                                          |
| `security.auth.selectedType` | 告知 Qwen Code 启动时应使用哪种协议（例如 `openai`、`anthropic`、`gemini`）。若不设置此项，则需手动运行 `/auth` 进行交互式配置。                          |
| `model.name`                 | Qwen Code 启动时默认激活的模型。其值必须与 `modelProviders` 中某项的 `id` 字段完全匹配。                                                               |

保存该文件后，直接运行 `qwen` 即可启动 —— 无需再执行交互式的 `/auth` 配置。

> [!tip]
>
> 下文各小节将更详细地解释每个配置项。如果上方快速示例已满足你的需求，可直接跳至 [安全注意事项](#security-notes)。

核心概念是 **模型提供方**（`modelProviders`）：Qwen Code 不仅支持 OpenAI 协议，还支持多种其他 API 协议。你可通过编辑 `~/.qwen/settings.json` 来配置可用的提供方及模型，并在运行时使用 `/model` 命令动态切换。

#### 支持的协议

| 协议              | `modelProviders` 键 | 环境变量                                                     | 提供商                                                                                     |
| ----------------- | -------------------- | ------------------------------------------------------------ | ------------------------------------------------------------------------------------------ |
| OpenAI 兼容协议   | `openai`             | `OPENAI_API_KEY`、`OPENAI_BASE_URL`、`OPENAI_MODEL`         | OpenAI、Azure OpenAI、OpenRouter、ModelScope、阿里云、任意 OpenAI 兼容端点                 |
| Anthropic         | `anthropic`          | `ANTHROPIC_API_KEY`、`ANTHROPIC_BASE_URL`、`ANTHROPIC_MODEL` | Anthropic Claude                                                                            |
| Google GenAI      | `gemini`             | `GEMINI_API_KEY`、`GEMINI_MODEL`                             | Google Gemini                                                                               |

#### 步骤 1：在 `~/.qwen/settings.json` 中配置模型与提供商

为每个协议定义可用的模型。每个模型条目至少需包含 `id` 和 `envKey`（用于存放 API 密钥的环境变量名）。

> [!important]
>
> 建议在用户级 `~/.qwen/settings.json` 中定义 `modelProviders`，以避免项目设置与用户设置之间发生合并冲突。

编辑 `~/.qwen/settings.json`（若文件不存在，请先创建）。你可在单个文件中混合使用多种协议——以下是一个多提供商示例，仅展示 `modelProviders` 部分：

```json
{
  "modelProviders": {
    "openai": [
      {
        "id": "gpt-4o",
        "name": "GPT-4o",
        "envKey": "OPENAI_API_KEY",
        "baseUrl": "https://api.openai.com/v1"
      }
    ],
    "anthropic": [
      {
        "id": "claude-sonnet-4-20250514",
        "name": "Claude Sonnet 4",
        "envKey": "ANTHROPIC_API_KEY"
      }
    ],
    "gemini": [
      {
        "id": "gemini-2.5-pro",
        "name": "Gemini 2.5 Pro",
        "envKey": "GEMINI_API_KEY"
      }
    ]
  }
}
```

> [!tip]
>
> 别忘了同时设置 `env`、`security.auth.selectedType` 和 `model.name` 字段——可参考上方的[完整配置示例](#recommended-one-file-setup-via-settingsjson)。

**`ModelConfig` 字段说明（即 `modelProviders` 内每个条目的字段）：**

| 字段               | 是否必需 | 说明                                                                 |
| ------------------ | -------- | -------------------------------------------------------------------- |
| `id`               | 是       | 发送给 API 的模型 ID（例如 `gpt-4o`、`claude-sonnet-4-20250514`）   |
| `name`             | 否       | 在 `/model` 模型选择器中显示的名称（默认为 `id`）                    |
| `envKey`           | 是       | API 密钥所对应的环境变量名（例如 `OPENAI_API_KEY`）                  |
| `baseUrl`          | 否       | API 端点覆盖地址（适用于代理或自定义端点）                           |
| `generationConfig` | 否       | 微调 `timeout`、`maxRetries`、`samplingParams` 等参数               |

> [!note]
>
> 在 `settings.json` 中使用 `env` 字段时，凭证将以明文形式存储。如需更高安全性，建议改用 `.env` 文件或 Shell 的 `export` 命令——详见 [步骤 2](#step-2-set-environment-variables)。

关于完整的 `modelProviders` Schema 及高级选项（如 `generationConfig`、`customHeaders` 和 `extra_body`），请参阅 [模型提供商参考文档](model-providers.md)。

#### 步骤 2：设置环境变量

Qwen Code 从环境变量中读取 API 密钥（环境变量名由模型配置中的 `envKey` 指定）。提供这些密钥的方式有多种，以下按**优先级从高到低**列出：

**1. Shell 环境 / `export`（最高优先级）**

直接在你的 Shell 配置文件（如 `~/.zshrc`、`~/.bashrc` 等）中设置，或在启动前内联设置：

```bash

# 阿里云 Dashscope
export DASHSCOPE_API_KEY="sk-..."

# OpenAI / 兼容 OpenAI 的服务
export OPENAI_API_KEY="sk-..."

# Anthropic
export ANTHROPIC_API_KEY="sk-ant-..."

# Google GenAI
export GEMINI_API_KEY="AIza..."
```

**2. `.env` 文件**

Qwen Code 会自动加载它找到的**第一个** `.env` 文件（**不会合并**多个文件中的变量）。仅加载 `process.env` 中尚不存在的变量。

搜索顺序（从当前目录开始，逐级向上遍历至根目录 `/`）：

1. `.qwen/.env`（推荐 — 可将 Qwen Code 的变量与其他工具隔离）
2. `.env`

若未找到任何文件，则回退到你的**主目录**：

3. `~/.qwen/.env`
4. `~/.env`

> [!tip]
>
> 推荐使用 `.qwen/.env` 而非 `.env`，以避免与其他工具发生冲突。部分变量（如 `DEBUG` 和 `DEBUG_MODE`）被明确排除在项目级 `.env` 文件之外，防止干扰 Qwen Code 的行为。

**3. `settings.json` → `env` 字段（最低优先级）**

你也可以直接在 `~/.qwen/settings.json` 的 `env` 字段中定义 API 密钥。这些变量作为**最低优先级的后备方案**加载——仅当该变量尚未通过系统环境变量或 `.env` 文件设置时才生效。

```json
{
  "env": {
    "DASHSCOPE_API_KEY": "sk-...",
    "OPENAI_API_KEY": "sk-...",
    "ANTHROPIC_API_KEY": "sk-ant-..."
  }
}
```

上述 [单文件配置示例](#recommended-one-file-setup-via-settingsjson) 即采用此方式。它便于将所有配置集中管理，但需注意：`settings.json` 文件可能被共享或同步——对于敏感密钥，请优先使用 `.env` 文件。

**优先级汇总：**

| 优先级     | 来源                             | 覆盖行为                                           |
| ---------- | -------------------------------- | -------------------------------------------------- |
| 1（最高）  | CLI 参数（`--openai-api-key`）   | 始终生效                                           |
| 2          | 系统环境变量（`export`、内联）   | 覆盖 `.env` 文件及 `settings.json` → `env` 字段   |
| 3          | `.env` 文件                      | 仅在系统环境变量中未定义时生效                     |
| 4（最低）  | `settings.json` → `env` 字段     | 仅在系统环境变量和 `.env` 文件中均未定义时生效     |

#### 步骤 3：使用 `/model` 切换模型

启动 Qwen Code 后，使用 `/model` 命令在所有已配置的模型之间切换。模型按协议分组显示：

```
/model
```

选择器将显示 `modelProviders` 配置中的全部模型，并按其协议（例如 `openai`、`anthropic`、`gemini`）分组。您的选择将在会话间持久保存。

您也可以通过命令行参数直接切换模型，这在多终端协作时尤为便捷。

```bash

# 在一个终端中

qwen --model "qwen3-coder-plus"

# 在另一个终端中

qwen --model "qwen3.5-plus"
```

## 安全提示

- 不要将 API 密钥提交至版本控制系统。
- 建议使用 `.qwen/.env` 文件存储项目本地密钥（并确保该文件不被纳入 Git 版本控制）。
- 若终端输出中打印了用于验证的凭据，请将其视为敏感信息加以保护。