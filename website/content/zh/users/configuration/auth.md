# 身份验证

Qwen Code 首次运行时的 `/auth` 菜单提供三个顶级选项，选择最适合你使用场景的一项：

- **Alibaba ModelStudio**：官方推荐方式。展开子菜单后可选 **Coding Plan**（面向个人开发者，含每周配额）、**Token Plan**（面向团队和企业，按量计费，使用专属 endpoint）或 **Standard API Key**（使用已有的 ModelStudio API key）。
- **Third-party Providers**：选择内置提供商并填入 API key（DeepSeek、MiniMax、Z.AI、Idealab、ModelScope、OpenRouter、Requesty）。
- **Custom Provider**：手动连接本地服务器、代理或不受支持的提供商，支持 OpenAI、Anthropic、Gemini 及其他兼容 endpoint。

> [!note]
>
> **Qwen OAuth** 已不再作为可选对话框入口——其免费额度已于 2026-04-15 停止服务。以下文档仅作为硬编码已停用提供商的历史记录保留。

## 选项 1：Qwen OAuth（已停用）

> [!warning]
>
> Qwen OAuth 免费额度已于 2026-04-15 停止服务。已缓存的 token 可能短期内仍可使用，但新请求将被拒绝。请切换至 Alibaba Cloud Coding Plan、[OpenRouter](https://openrouter.ai)、[Fireworks AI](https://app.fireworks.ai) 或其他提供商。运行 `qwen` 并使用 `/auth` 进行配置。

- **工作原理**：首次启动时，Qwen Code 打开浏览器登录页面。完成登录后，凭据会缓存到本地，通常无需再次登录。
- **要求**：一个 `qwen.ai` 账号 + 网络访问权限（至少首次登录需要）。
- **优势**：无需管理 API key，凭据自动刷新。
- **费用与配额**：免费额度已于 2026-04-15 停止服务。

在终端中启动 CLI 并按提示完成浏览器授权流程：

```bash
qwen
```

Qwen OAuth 已不再作为 `/auth` 对话框中的可选项；请运行 `/auth` 并选择当前可用的选项（Alibaba ModelStudio、Third-party Providers 或 Custom Provider）。

> [!note]
>
> 在非交互式或无界面环境中（如 CI、SSH、容器），通常**无法**完成 OAuth 浏览器登录流程。
> 在这些场景下，请使用 Alibaba Cloud Coding Plan 或 API Key 身份验证方式。

## 💳 选项 2：Alibaba Cloud Coding Plan

适合希望成本可预测、模型选择多样且使用配额更高的用户。

- **工作原理**：订阅 Coding Plan，按固定月费计费，然后配置 Qwen Code 使用专属 endpoint 和订阅 API key。
- **要求**：从 [Alibaba Cloud ModelStudio（北京）](https://bailian.console.aliyun.com/cn-beijing?tab=coding-plan#/efm/coding-plan-index) 或 [Alibaba Cloud ModelStudio（国际站）](https://modelstudio.console.alibabacloud.com/?tab=coding-plan#/efm/coding-plan-index) 获取有效的 Coding Plan 订阅，具体取决于你的账号所在地域。
- **优势**：模型选择多样，使用配额更高，月费可预测，可访问丰富的模型（Qwen、GLM、Kimi、Minimax 等）。
- **费用与配额**：查看阿里云 ModelStudio Coding Plan 文档 [北京](https://bailian.console.aliyun.com/cn-beijing/?tab=doc#/doc/?type=model&url=3005961) [国际站](https://modelstudio.console.alibabacloud.com/?tab=doc#/doc/?type=model&url=2840914)。

Alibaba Cloud Coding Plan 支持两个地域：

| 地域                         | 控制台 URL                                                                   |
| ---------------------------- | ---------------------------------------------------------------------------- |
| 阿里云 ModelStudio（北京）   | [bailian.console.aliyun.com](https://bailian.console.aliyun.com)             |
| Alibaba Cloud（国际站）      | [bailian.console.alibabacloud.com](https://bailian.console.alibabacloud.com) |

### 交互式配置

在终端中输入 `qwen` 启动 Qwen Code，然后运行 `/auth` 命令，选择 **Alibaba ModelStudio**，再从子菜单中选择 **Coding Plan**。选择地域后，输入你的 `sk-sp-xxxxxxxxx` key。

完成身份验证后，使用 `/model` 命令在所有 Alibaba Cloud Coding Plan 支持的模型之间切换（包括 qwen3.5-plus、qwen3.6-plus、qwen3.7-plus、qwen3-coder-plus、qwen3-coder-next、qwen3-max-2026-01-23、glm-5、glm-4.7、kimi-k2.5 和 MiniMax-M2.5）。

### 无界面或脚本化配置

在 CI、容器或脚本中，使用环境变量或 `settings.json` 配置 Coding Plan，而非已移除的 `qwen auth coding-plan` 命令。

```bash
export BAILIAN_CODING_PLAN_API_KEY="sk-sp-xxxxxxxxx"
export OPENAI_BASE_URL="https://coding.dashscope.aliyuncs.com/v1"
export OPENAI_MODEL="qwen3-coder-plus"
```

中国（北京）endpoint 使用 `https://coding.dashscope.aliyuncs.com/v1`，国际站 endpoint 使用 `https://coding-intl.dashscope.aliyuncs.com/v1`。

### 备选方案：通过 `settings.json` 配置

如果你希望跳过交互式 `/auth` 流程，可在 `~/.qwen/settings.json` 中添加以下内容：

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
> Coding Plan 使用专属 endpoint（`https://coding.dashscope.aliyuncs.com/v1`），与标准 Dashscope endpoint 不同。请确保使用正确的 `baseUrl`。

## 🚀 选项 3：API Key（灵活）

适合需要连接第三方提供商（如 OpenAI、Anthropic、Google、Azure OpenAI、OpenRouter、Requesty、ModelScope 或自托管 endpoint）的用户。支持多种协议和提供商。

### 推荐：通过 `settings.json` 单文件配置

使用 API Key 身份验证最简单的方式是将所有配置放在单个 `~/.qwen/settings.json` 文件中。以下是一个完整的即用示例：

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

各字段说明：

| 字段                         | 说明                                                                                                                                              |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `modelProviders`             | 声明可用模型及其连接方式。键名（`openai`、`anthropic`、`gemini`）代表 API 协议。                                                                  |
| `env`                        | 将 API key 直接存储在 `settings.json` 中作为兜底（最低优先级——shell `export` 和 `.env` 文件优先级更高）。                                         |
| `security.auth.selectedType` | 告知 Qwen Code 启动时使用哪种协议（如 `openai`、`anthropic`、`gemini`）。若不配置此项，每次启动都需要交互式运行 `/auth`。                          |
| `model.name`                 | Qwen Code 启动时激活的默认模型。必须与 `modelProviders` 中某个 `id` 值匹配。                                                                      |

保存文件后，直接运行 `qwen`，无需交互式 `/auth` 配置。

> [!tip]
>
> 以下各节将详细解释每个部分。如果上面的快速示例已满足你的需求，可直接跳至[安全注意事项](#安全注意事项)。

核心概念是**模型提供商**（`modelProviders`）：Qwen Code 不仅支持 OpenAI，还支持多种 API 协议。通过编辑 `~/.qwen/settings.json` 配置可用的提供商和模型，然后在运行时使用 `/model` 命令在它们之间切换。

#### 支持的协议

| 协议              | `modelProviders` 键  | 环境变量                                                                                              | 提供商                                                                                                |
| ----------------- | -------------------- | ----------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| OpenAI 兼容       | `openai`             | `OPENAI_API_KEY`、`OPENAI_BASE_URL`、`OPENAI_MODEL`                                                   | OpenAI、Azure OpenAI、OpenRouter、Requesty、ModelScope、阿里云、任何 OpenAI 兼容 endpoint             |
| Anthropic         | `anthropic`          | `ANTHROPIC_API_KEY`、`ANTHROPIC_BASE_URL`、`ANTHROPIC_MODEL`                                          | Anthropic Claude                                                                                      |
| Google GenAI      | `gemini`             | `GEMINI_API_KEY`、`GEMINI_MODEL`                                                                      | Google Gemini                                                                                         |
| Vertex AI         | `vertex-ai`          | `GOOGLE_API_KEY`、`GOOGLE_MODEL`（设置 `GOOGLE_GENAI_USE_VERTEXAI=true`；使用 `gemini` 协议）         | Google Vertex AI                                                                                      |

#### 第一步：在 `~/.qwen/settings.json` 中配置模型和提供商

为每种协议定义可用的模型。每个模型条目至少需要 `id`；`envKey`（存储 API key 的环境变量名称）可选但推荐填写——省略时会回退到该认证类型的默认环境变量（如 `openai` 对应 `OPENAI_API_KEY`）。

> [!important]
>
> 建议在用户级别的 `~/.qwen/settings.json` 中定义 `modelProviders`，以避免项目设置与用户设置之间的合并冲突。

编辑 `~/.qwen/settings.json`（不存在则创建）。单个文件中可以混合使用多种协议——以下是仅展示 `modelProviders` 部分的多提供商示例：

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
> 别忘了在 `modelProviders` 旁边同时设置 `env`、`security.auth.selectedType` 和 `model.name`——参考[上方的完整示例](#推荐通过-settingsjson-单文件配置)。

**`ModelConfig` 字段（`modelProviders` 中的每个条目）：**

| 字段               | 是否必填 | 说明                                                                                                                                                 |
| ------------------ | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`               | 是       | 发送给 API 的模型 ID（如 `gpt-4o`、`claude-sonnet-4-20250514`）                                                                                     |
| `name`             | 否       | 在 `/model` 选择器中显示的名称（默认为 `id`）                                                                                                        |
| `envKey`           | 否       | API key 对应的环境变量名称（如 `OPENAI_API_KEY`）；可选但推荐——省略时回退到该认证类型的默认环境变量                                                   |
| `baseUrl`          | 否       | API endpoint 覆盖（适用于代理或自定义 endpoint）                                                                                                     |
| `generationConfig` | 否       | 微调 `timeout`、`maxRetries`、`samplingParams` 等参数                                                                                                |

> [!note]
>
> 在 `settings.json` 中使用 `env` 字段时，凭据以明文存储。为了更好的安全性，建议优先使用 `.env` 文件或 shell `export`——参见[第二步](#第二步设置环境变量)。

完整的 `modelProviders` schema 及 `generationConfig`、`customHeaders`、`extra_body` 等高级选项，请参阅[模型提供商参考文档](model-providers.md)。

#### 第二步：设置环境变量

Qwen Code 从环境变量中读取 API key（由模型配置中的 `envKey` 指定）。有多种提供方式，按**从高到低**的优先级列出如下：

**1. Shell 环境 / `export`（最高优先级）**

直接在 shell 配置文件（`~/.zshrc`、`~/.bashrc` 等）中设置，或在启动前内联设置：

```bash

# 阿里巴巴 Dashscope
export DASHSCOPE_API_KEY="sk-..."

# OpenAI / OpenAI 兼容
export OPENAI_API_KEY="sk-..."

# Anthropic
export ANTHROPIC_API_KEY="sk-ant-..."

# Google GenAI
export GEMINI_API_KEY="AIza..."
```

**2. `.env` 文件**

Qwen Code 自动加载找到的**第一个** `.env` 文件（多个文件中的变量**不会合并**）。只有 `process.env` 中尚不存在的变量才会被加载。

查找顺序（从当前目录开始向上查找至 `/`）：

1. `.qwen/.env`（推荐——将 Qwen Code 变量与其他工具隔离）
2. `.env`

若未找到，则回退到**主目录**：

3. `~/.qwen/.env`
4. `~/.env`

> [!tip]
>
> 建议使用 `.qwen/.env` 而非 `.env`，以避免与其他工具冲突。某些变量（如 `DEBUG` 和 `DEBUG_MODE`）会被排除在项目级 `.env` 文件之外，以防影响 Qwen Code 的行为。

**3. `settings.json` → `env` 字段（最低优先级）**

也可以在 `~/.qwen/settings.json` 的 `env` 键下直接定义 API key。这些值作为**最低优先级的兜底**加载——仅在系统环境变量和 `.env` 文件中均未设置该变量时才生效。

```json
{
  "env": {
    "DASHSCOPE_API_KEY": "sk-...",
    "OPENAI_API_KEY": "sk-...",
    "ANTHROPIC_API_KEY": "sk-ant-..."
  }
}
```

这也是上方[单文件配置示例](#推荐通过-settingsjson-单文件配置)所采用的方式。将所有配置集中在一处非常方便，但请注意 `settings.json` 可能被共享或同步——敏感密钥建议优先使用 `.env` 文件。

**优先级汇总：**

| 优先级      | 来源                           | 覆盖行为                                       |
| ----------- | ------------------------------ | ---------------------------------------------- |
| 1（最高）   | CLI 参数（`--openai-api-key`） | 始终优先                                       |
| 2           | 系统环境（`export`、内联）     | 覆盖 `.env` 和 `settings.json` → `env`         |
| 3           | `.env` 文件                    | 仅在系统环境中不存在时设置                     |
| 4（最低）   | `settings.json` → `env`        | 仅在系统环境和 `.env` 中均不存在时设置         |

#### 第三步：使用 `/model` 切换模型

启动 Qwen Code 后，使用 `/model` 命令在所有已配置的模型之间切换。模型按协议分组显示：

```
/model
```

选择器会展示 `modelProviders` 配置中的所有模型，按协议分组（如 `openai`、`anthropic`、`gemini`）。你的选择会跨会话持久保存。

也可以通过命令行参数直接切换模型，在多个终端中工作时非常方便。

```bash
# 在一个终端中

qwen --model "qwen3-coder-plus"

# 在另一个终端中

qwen --model "qwen3.5-plus"
```

## 已移除的 `qwen auth` CLI 命令

独立的 `qwen auth` CLI 命令已被移除。请使用以下替代方式：

| 原使用场景               | 替代方式                                                                                    |
| ------------------------ | ------------------------------------------------------------------------------------------- |
| 交互式身份验证配置       | 运行 `qwen`，然后使用 `/auth`                                                               |
| Coding Plan 配置         | 使用 `/auth`，或设置 `BAILIAN_CODING_PLAN_API_KEY` 和 Coding Plan base URL                  |
| OpenRouter 配置          | 使用 `/auth`，或设置 `OPENROUTER_API_KEY` 和 `OPENAI_BASE_URL=https://openrouter.ai/api/v1` |
| Requesty 配置            | 使用 `/auth`，或设置 `REQUESTY_API_KEY` 和 `OPENAI_BASE_URL=https://router.requesty.ai/v1`  |
| API key 或自定义提供商   | 配置 `~/.qwen/settings.json`、`.env` 或特定提供商的环境变量                                 |
| 查看当前身份验证状态     | 在 Qwen Code 中运行 `/doctor`                                                               |
| OAuth 浏览器授权流程     | 交互式运行 `qwen` 并使用 `/auth`；OAuth 不能仅通过环境变量配置                              |

调用 `qwen auth status` 等旧命令时，现在会打印包含上述迁移路径的移除通知。

## 安全注意事项

- 不要将 API key 提交到版本控制系统。
- 优先使用 `.qwen/.env` 存储项目本地的密钥（并将其加入 .gitignore）。
- 如果终端输出中打印了凭据用于验证，请将其视为敏感信息。
