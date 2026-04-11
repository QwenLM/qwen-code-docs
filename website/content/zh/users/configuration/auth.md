# 身份验证

Qwen Code 支持三种身份验证方法。请根据你运行 CLI 的方式选择合适的一种：

- **Qwen OAuth**：在浏览器中使用 `qwen.ai` 账号登录。免费，但有每日配额限制。
- **Alibaba Cloud Coding Plan**：使用阿里云提供的 API Key。付费订阅，提供丰富的模型选择和更高的配额。
- **API Key**：使用你自己的 API Key。灵活满足个人需求——支持 OpenAI、Anthropic、Gemini 及其他兼容端点。

## 选项 1：Qwen OAuth（免费）

如果你希望配置最简单，且主要使用 Qwen 模型，请选择此方式。

- **工作原理**：首次启动时，Qwen Code 会打开浏览器登录页面。完成登录后，凭证会缓存在本地，通常无需再次登录。
- **要求**：`qwen.ai` 账号 + 网络连接（至少首次登录时需要）。
- **优势**：无需管理 API Key，凭证自动刷新。
- **费用与配额**：免费，配额为 **60 次请求/分钟** 和 **1,000 次请求/天**。

启动 CLI 并按照浏览器提示完成流程：

```bash
qwen
```

或者在不启动会话的情况下直接进行身份验证：

```bash
qwen auth qwen-oauth
```

> [!note]
>
> 在非交互式或无头环境（如 CI、SSH、容器）中，通常**无法**完成 OAuth 浏览器登录流程。  
> 在这些情况下，请使用 Alibaba Cloud Coding Plan 或 API Key 身份验证方法。

## 💳 选项 2：Alibaba Cloud Coding Plan

如果你希望成本可控、模型选择丰富且使用配额更高，请选择此方式。

- **工作原理**：订阅 Coding Plan 并支付固定月费，然后配置 Qwen Code 使用专用端点和你的订阅 API Key。
- **要求**：根据你的账号所属区域，从 [Alibaba Cloud ModelStudio（北京）](https://bailian.console.aliyun.com/cn-beijing?tab=coding-plan#/efm/coding-plan-index) 或 [Alibaba Cloud ModelStudio（国际）](https://modelstudio.console.alibabacloud.com/?tab=coding-plan#/efm/coding-plan-index) 获取有效的 Coding Plan 订阅。
- **优势**：模型选择丰富、使用配额更高、月度成本可控，可访问多种模型（Qwen、GLM、Kimi、Minimax 等）。
- **费用与配额**：查看阿里云百炼 Coding Plan 文档 [北京](https://bailian.console.aliyun.com/cn-beijing/?tab=doc#/doc/?type=model&url=3005961) [国际](https://modelstudio.console.alibabacloud.com/?tab=doc#/doc/?type=model&url=2840914)。

Alibaba Cloud Coding Plan 提供两个区域：

| 区域                       | 控制台 URL                                                                  |
| ---------------------------- | ---------------------------------------------------------------------------- |
| 阿里云百炼（北京） | [bailian.console.aliyun.com](https://bailian.console.aliyun.com)             |
| Alibaba Cloud（国际）         | [bailian.console.alibabacloud.com](https://bailian.console.alibabacloud.com) |

### 交互式配置

你可以通过以下两种方式配置 Coding Plan 身份验证：

**选项 A：通过终端（推荐首次配置使用）**

```bash
# 交互式 — 提示输入区域和 API Key
qwen auth coding-plan

# 或非交互式 — 直接传入区域和 Key
qwen auth coding-plan --region china --key sk-sp-xxxxxxxxx
```

**选项 B：在 Qwen Code 会话内**

在终端输入 `qwen` 启动 Qwen Code，然后运行 `/auth` 命令并选择 **Alibaba Cloud Coding Plan**。选择你的区域，然后输入 `sk-sp-xxxxxxxxx` Key。

完成身份验证后，使用 `/model` 命令在所有 Alibaba Cloud Coding Plan 支持的模型之间切换（包括 qwen3.5-plus、qwen3-coder-plus、qwen3-coder-next、qwen3-max、glm-4.7 和 kimi-k2.5）。

### 备选方案：通过 `settings.json` 配置

如果你希望跳过交互式 `/auth` 流程，请将以下内容添加到 `~/.qwen/settings.json`：

```json
{
  "modelProviders": {
    "openai": [
      {
        "id": "qwen3-coder-plus",
        "name": "qwen3-coder-plus (Coding Plan)",
        "baseUrl": "https://coding.dashscope.aliyuncs.com/v1",
        "description": "qwen3-coder-plus from Alibaba Cloud Coding Plan",
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
> Coding Plan 使用专用端点（`https://coding.dashscope.aliyuncs.com/v1`），与标准 Dashscope 端点不同。请确保使用正确的 `baseUrl`。

## 🚀 选项 3：API Key（灵活）

如果你希望连接第三方提供商（如 OpenAI、Anthropic、Google、Azure OpenAI、OpenRouter、ModelScope 或自建端点），请选择此方式。支持多种协议和提供商。

### 推荐：通过 `settings.json` 单文件配置

开始使用 API Key 身份验证的最简单方法是将所有配置放在单个 `~/.qwen/settings.json` 文件中。以下是一个完整且可直接使用的示例：

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

各字段说明：

| 字段                        | 说明                                                                                                                                     |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `modelProviders`             | 声明可用的模型及其连接方式。键（`openai`、`anthropic`、`gemini`）代表 API 协议。              |
| `env`                        | 将 API Key 直接存储在 `settings.json` 中作为备用（优先级最低——Shell `export` 和 `.env` 文件优先级更高）。                  |
| `security.auth.selectedType` | 告知 Qwen Code 启动时使用哪种协议（例如 `openai`、`anthropic`、`gemini`）。若不设置，则需交互式运行 `/auth`。 |
| `model.name`                 | Qwen Code 启动时激活的默认模型。必须与 `modelProviders` 中的某个 `id` 值匹配。                                |

保存文件后，直接运行 `qwen` 即可——无需交互式 `/auth` 配置。

> [!tip]
>
> 下文将详细解释每个部分。如果上面的快速示例已满足你的需求，可以直接跳转到 [安全注意事项](#security-notes)。

核心概念是 **Model Providers**（`modelProviders`）：Qwen Code 支持多种 API 协议，不仅限于 OpenAI。你可以通过编辑 `~/.qwen/settings.json` 配置可用的提供商和模型，然后在运行时使用 `/model` 命令进行切换。

#### 支持的协议

| 协议          | `modelProviders` 键 | 环境变量                                        | 提供商                                                                                   |
| ----------------- | -------------------- | ------------------------------------------------------------ | ------------------------------------------------------------------------------------------- |
| OpenAI 兼容 | `openai`             | `OPENAI_API_KEY`, `OPENAI_BASE_URL`, `OPENAI_MODEL`          | OpenAI、Azure OpenAI、OpenRouter、ModelScope、阿里云及任何 OpenAI 兼容端点 |
| Anthropic         | `anthropic`          | `ANTHROPIC_API_KEY`, `ANTHROPIC_BASE_URL`, `ANTHROPIC_MODEL` | Anthropic Claude                                                                            |
| Google GenAI      | `gemini`             | `GEMINI_API_KEY`, `GEMINI_MODEL`                             | Google Gemini                                                                               |

#### 步骤 1：在 `~/.qwen/settings.json` 中配置模型和提供商

定义每个协议可用的模型。每个模型条目至少需要包含 `id` 和 `envKey`（存储 API Key 的环境变量名称）。

> [!important]
>
> 建议在用户级 `~/.qwen/settings.json` 中定义 `modelProviders`，以避免项目设置与用户设置之间发生合并冲突。

编辑 `~/.qwen/settings.json`（如果不存在则创建）。你可以在单个文件中混合使用多种协议——以下是一个多提供商示例，仅展示 `modelProviders` 部分：

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
> 别忘了在配置 `modelProviders` 的同时设置 `env`、`security.auth.selectedType` 和 `model.name`——请参考上方的 [完整示例](#recommended-one-file-setup-via-settingsjson)。

**`ModelConfig` 字段（`modelProviders` 中的每个条目）：**

| 字段              | 是否必需 | 说明                                                          |
| ------------------ | -------- | -------------------------------------------------------------------- |
| `id`               | 是      | 发送给 API 的模型 ID（例如 `gpt-4o`、`claude-sonnet-4-20250514`） |
| `name`             | 否       | `/model` 选择器中显示的名称（默认为 `id`）               |
| `envKey`           | 是      | API Key 对应的环境变量名称（例如 `OPENAI_API_KEY`）    |
| `baseUrl`          | 否       | API 端点覆盖（适用于代理或自定义端点）       |
| `generationConfig` | 否       | 微调 `timeout`、`maxRetries`、`samplingParams` 等参数            |

> [!note]
>
> 在 `settings.json` 中使用 `env` 字段时，凭证将以明文形式存储。出于安全考虑，建议使用 `.env` 文件或 Shell `export`——请参阅 [步骤 2](#step-2-set-environment-variables)。

有关完整的 `modelProviders` 架构以及 `generationConfig`、`customHeaders` 和 `extra_body` 等高级选项，请参阅 [Model Providers 参考](model-providers.md)。

#### 步骤 2：设置环境变量

Qwen Code 会从环境变量（由模型配置中的 `envKey` 指定）读取 API Key。提供方式有多种，以下按**优先级从高到低**排列：

**1. Shell 环境 / `export`（最高优先级）**

直接在 Shell 配置文件（`~/.zshrc`、`~/.bashrc` 等）中设置，或在启动前以内联方式设置：

```bash

# 阿里云百炼
export DASHSCOPE_API_KEY="sk-..."

# OpenAI / OpenAI 兼容
export OPENAI_API_KEY="sk-..."

# Anthropic
export ANTHROPIC_API_KEY="sk-ant-..."

# Google GenAI
export GEMINI_API_KEY="AIza..."
```

**2. `.env` 文件**

Qwen Code 会自动加载它找到的**第一个** `.env` 文件（多个文件之间的变量**不会合并**）。仅加载 `process.env` 中尚未存在的变量。

搜索顺序（从当前目录开始，向上遍历至 `/`）：

1. `.qwen/.env`（推荐——将 Qwen Code 变量与其他工具隔离）
2. `.env`

如果未找到任何文件，则回退到**主目录**：

3. `~/.qwen/.env`
4. `~/.env`

> [!tip]
>
> 推荐使用 `.qwen/.env` 而非 `.env`，以避免与其他工具冲突。部分变量（如 `DEBUG` 和 `DEBUG_MODE`）会被排除在项目级 `.env` 文件之外，以免干扰 Qwen Code 的行为。

**3. `settings.json` → `env` 字段（最低优先级）**

你也可以直接在 `~/.qwen/settings.json` 的 `env` 键下定义 API Key。这些配置将作为**最低优先级的备用方案**加载——仅当系统环境或 `.env` 文件未设置该变量时才会生效。

```json
{
  "env": {
    "DASHSCOPE_API_KEY": "sk-...",
    "OPENAI_API_KEY": "sk-...",
    "ANTHROPIC_API_KEY": "sk-ant-..."
  }
}
```

这是上方 [单文件配置示例](#recommended-one-file-setup-via-settingsjson) 中使用的方法。将所有内容集中在一处非常方便，但请注意 `settings.json` 可能会被共享或同步——对于敏感密钥，建议优先使用 `.env` 文件。

**优先级总结：**

| 优先级    | 来源                         | 覆盖行为                            |
| ----------- | ------------------------------ | -------------------------------------------- |
| 1（最高） | CLI 参数（`--openai-api-key`） | 始终生效                                  |
| 2           | 系统环境变量（`export`、内联）  | 覆盖 `.env` 和 `settings.json` → `env` |
| 3           | `.env` 文件                    | 仅在系统环境变量未设置时生效               |
| 4（最低）  | `settings.json` → `env`        | 仅在系统环境变量或 `.env` 未设置时生效     |

#### 步骤 3：使用 `/model` 切换模型

启动 Qwen Code 后，使用 `/model` 命令在所有已配置的模型之间切换。模型会按协议分组：

```
/model
```

选择器将显示 `modelProviders` 配置中的所有模型，并按协议分组（例如 `openai`、`anthropic`、`gemini`）。你的选择会在会话之间持久保存。

你也可以直接通过命令行参数切换模型，这在多终端工作时非常方便。

```bash
# 在一个终端中

qwen --model "qwen3-coder-plus"

# 在另一个终端中

qwen --model "qwen3.5-plus"
```

## `qwen auth` CLI 命令

除了会话内的 `/auth` 斜杠命令外，Qwen Code 还提供了独立的 `qwen auth` CLI 命令，允许你直接在终端管理身份验证——无需先启动交互式会话。

### 交互模式

不带参数运行 `qwen auth` 即可打开交互式菜单：

```bash
qwen auth
```

你将看到一个支持方向键导航的选择器：

```
Select authentication method:

> Qwen OAuth - Free · Up to 1,000 requests/day · Qwen latest models
  Alibaba Cloud Coding Plan - Paid · Up to 6,000 requests/5 hrs · All Alibaba Cloud Coding Plan Models

(Use ↑ ↓ arrows to navigate, Enter to select, Ctrl+C to exit)
```

### 子命令

| 命令                                              | 说明                                       |
| ---------------------------------------------------- | ------------------------------------------------- |
| `qwen auth`                                          | 交互式身份验证配置                  |
| `qwen auth qwen-oauth`                               | 使用 Qwen OAuth 进行身份验证                      |
| `qwen auth coding-plan`                              | 使用 Alibaba Cloud Coding Plan 进行身份验证       |
| `qwen auth coding-plan --region china --key sk-sp-…` | 非交互式 Coding Plan 配置（适用于脚本） |
| `qwen auth status`                                   | 显示当前身份验证状态                |

**示例：**

```bash
# 直接使用 Qwen OAuth 进行身份验证
qwen auth qwen-oauth

# 交互式配置 Coding Plan（提示输入区域和 Key）
qwen auth coding-plan

# 非交互式配置 Coding Plan（适用于 CI/脚本）
qwen auth coding-plan --region china --key sk-sp-xxxxxxxxx

# 检查当前的身份验证配置
qwen auth status
```

## 安全注意事项

- 不要将 API Key 提交到版本控制系统。
- 项目本地密钥优先使用 `.qwen/.env`（并确保将其排除在 git 之外）。
- 如果终端输出包含用于验证的凭证，请将其视为敏感信息。