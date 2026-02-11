# 认证

Qwen Code 支持两种认证方式。选择与你运行 CLI 方式相匹配的一种：

- **Qwen OAuth（推荐）**：在浏览器中使用你的 `qwen.ai` 账户登录。
- **API-KEY**：使用 API 密钥连接到任何支持的提供商。更加灵活——支持 OpenAI、Anthropic、Google GenAI、阿里云百炼以及其他兼容的端点。

![](https://gw.alicdn.com/imgextra/i4/O1CN01yXSXc91uYxJxhJXBF_!!6000000006050-2-tps-2372-916.png)

## 👍 选项 1：Qwen OAuth（推荐且免费）

如果你想要最简单的设置并且正在使用 Qwen 模型，请使用此方法。

- **工作原理**：首次启动时，Qwen Code 会打开浏览器登录页面。完成登录后，凭证将被缓存在本地，因此通常你无需再次登录。
- **要求**：一个 `qwen.ai` 账户 + 网络访问权限（至少首次登录时需要）。
- **优势**：无需管理 API 密钥，自动刷新凭证。
- **费用和配额**：免费，配额为 **60 次请求/分钟** 和 **1,000 次请求/天**。

启动 CLI 并按照浏览器流程操作：

```bash
qwen
```

> [!note]
>
> 在非交互式或无头环境中（例如 CI、SSH、容器），通常**无法**完成 OAuth 浏览器登录流程。
> 在这些情况下，请使用 API-KEY 认证方法。

## 🚀 选项 2：API-KEY（灵活）

如果你希望对使用的提供商和模型有更多灵活性，请使用此选项。支持多种协议和提供商，包括 OpenAI、Anthropic、Google GenAI、阿里云百炼、Azure OpenAI、OpenRouter、魔搭或自托管的兼容端点。

### 选项1：编码计划（阿里云百炼）

如果你希望为 qwen3-coder-plus 模型获得可预测的成本和更高的使用配额，请使用此选项。

- **工作原理**：订阅固定月费的编码计划，然后配置 Qwen Code 使用专用端点和你的订阅 API 密钥。
- **要求**：从 [阿里云百炼](https://bailian.console.aliyun.com/cn-beijing/?tab=globalset#/efm/coding_plan) 获取有效的编码计划订阅。
- **优势**：更高的使用配额、可预测的月度成本、访问最新的 qwen3-coder-plus 模型。
- **费用和配额**：查看 [阿里云百炼编码计划文档](https://bailian.console.aliyun.com/cn-beijing/?tab=doc#/doc/?type=model&url=3005961)。

在终端中输入 `qwen` 启动 Qwen Code，然后输入 `/auth` 命令并选择 `API-KEY`

![](https://gw.alicdn.com/imgextra/i4/O1CN01yXSXc91uYxJxhJXBF_!!6000000006050-2-tps-2372-916.png)

输入后，选择 `Coding Plan`：

![](https://gw.alicdn.com/imgextra/i4/O1CN01Irk0AD1ebfop69o0r_!!6000000003890-2-tps-2308-830.png)

输入你的 `sk-sp-xxxxxxxxx` 密钥，然后使用 `/model` 命令在所有百炼 `Coding Plan` 支持的模型之间切换：

![](https://gw.alicdn.com/imgextra/i4/O1CN01fWArmf1kaCEgSmPln_!!6000000004699-2-tps-2304-1374.png)

### 选项2：第三方 API-KEY

如果你想要连接到第三方提供商，例如 OpenAI、Anthropic、Google、Azure OpenAI、OpenRouter、ModelScope 或自托管端点，请使用此选项。

核心概念是 **模型提供商**（`modelProviders`）：Qwen Code 支持多种 API 协议，而不仅仅是 OpenAI。你可以通过编辑 `~/.qwen/settings.json` 来配置可用的提供商和模型，然后在运行时使用 `/model` 命令在它们之间切换。

#### 支持的协议

| 协议              | `modelProviders` 键 | 环境变量                                                     | 提供商                                                                                                |
| ----------------- | ------------------- | ------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------- |
| OpenAI 兼容       | `openai`            | `OPENAI_API_KEY`, `OPENAI_BASE_URL`, `OPENAI_MODEL`          | OpenAI, Azure OpenAI, OpenRouter, ModelScope, 阿里云百炼, 任何 OpenAI 兼容的端点                      |
| Anthropic         | `anthropic`         | `ANTHROPIC_API_KEY`, `ANTHROPIC_BASE_URL`, `ANTHROPIC_MODEL` | Anthropic Claude                                                                                      |
| Google GenAI      | `gemini`            | `GEMINI_API_KEY`, `GEMINI_MODEL`                             | Google Gemini                                                                                         |
| Google Vertex AI  | `vertex-ai`         | `GOOGLE_API_KEY`, `GOOGLE_MODEL`                             | Google Vertex AI                                                                                      |

#### 步骤 1：在 `~/.qwen/settings.json` 中配置 `modelProviders`

定义每个协议可用的模型。每个模型条目至少需要一个 `id` 和一个 `envKey`（包含你的 API 密钥的环境变量名）。

> [!important]
>
> 建议在用户范围的 `~/.qwen/settings.json` 中定义 `modelProviders`，以避免项目设置和用户设置之间的合并冲突。

编辑 `~/.qwen/settings.json`（如果不存在则创建）：

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

你可以在单个配置中混合多个协议和模型。`ModelConfig` 字段如下：

| 字段               | 必需   | 描述                                                                 |
| ------------------ | ------ | -------------------------------------------------------------------- |
| `id`               | 是     | 发送到 API 的模型 ID（例如 `gpt-4o`、`claude-sonnet-4-20250514`）     |
| `name`             | 否     | 在 `/model` 选择器中的显示名称（默认为 `id`）                        |
| `envKey`           | 是     | API 密钥的环境变量名（例如 `OPENAI_API_KEY`）                         |
| `baseUrl`          | 否     | API 端点覆盖（用于代理或自定义端点）                                 |
| `generationConfig` | 否     | 微调 `timeout`、`maxRetries`、`samplingParams` 等参数                |

> [!note]
>
> 凭据**永远不会**存储在 `settings.json` 中。运行时会从 `envKey` 指定的环境变量中读取它们。

有关完整的 `modelProviders` 模式和高级选项，如 `generationConfig`、`customHeaders` 和 `extra_body`，请参见 [设置参考 → modelProviders](settings.md#modelproviders)。

#### 步骤 2：设置环境变量

Qwen Code 从环境变量中读取 API 密钥（在模型配置中的 `envKey` 指定）。有多种方式可以提供这些变量，以下按**优先级从高到低**列出：

**1. Shell 环境 / `export`（最高优先级）**

直接在你的 shell 配置文件（如 `~/.zshrc`、`~/.bashrc` 等）中设置，或在启动前内联设置：

```bash

# Alibaba Dashscope
export DASHSCOPE_API_KEY="sk-..."

# OpenAI / OpenAI-compatible
export OPENAI_API_KEY="sk-..."

# Anthropic
export ANTHROPIC_API_KEY="sk-ant-..."
```

# Google GenAI
```bash
export GEMINI_API_KEY="AIza..."
```

**2. `.env` 文件**

Qwen Code 会自动加载找到的**第一个**`.env`文件（变量**不会**在多个文件间合并）。只有尚未存在于 `process.env` 中的变量才会被加载。

搜索顺序（从当前目录开始，向上遍历到 `/`）：

1. `.qwen/.env`（推荐——将 Qwen Code 变量与其他工具隔离）
2. `.env`

如果找不到，则回退到你的**主目录**：

3. `~/.qwen/.env`
4. `~/.env`

> [!tip]
>
> 推荐使用 `.qwen/.env` 而不是 `.env` 来避免与其他工具冲突。某些变量（如 `DEBUG` 和 `DEBUG_MODE`）会被排除在项目级 `.env` 文件之外，以避免干扰 Qwen Code 行为。

**3. `settings.json` → `env` 字段（最低优先级）**

你也可以直接在 `~/.qwen/settings.json` 中的 `env` 键下定义环境变量。这些变量作为**最低优先级的备选**加载——仅当变量未被系统环境或 `.env` 文件设置时才应用。

```json
{
  "env": {
    "DASHSCOPE_API_KEY":"sk-...",
    "OPENAI_API_KEY": "sk-...",
    "ANTHROPIC_API_KEY": "sk-ant-...",
    "GEMINI_API_KEY": "AIza..."
  },
  "modelProviders": {
    ...
  }
}
```

> [!note]
>
> 当你想将所有配置（提供者+凭证）保存在单个文件中时，这很有用。但请注意，`settings.json` 可能会被共享或同步——敏感密钥建议使用 `.env` 文件。

**优先级总结：**

| 优先级     | 来源                           | 覆盖行为                               |
| ---------- | ------------------------------ | -------------------------------------- |
| 1（最高）  | CLI 标志（`--openai-api-key`） | 始终获胜                               |
| 2          | 系统环境（`export`、内联）     | 覆盖 `.env` 和 `settings.env`          |
| 3          | `.env` 文件                    | 仅在系统环境不存在时设置               |
| 4（最低）  | `settings.json` → `env`        | 仅在系统环境或 `.env` 不存在时设置     |

#### 步骤 3：使用 `/model` 切换模型

启动 Qwen Code 后，使用 `/model` 命令在所有已配置的模型之间切换。模型按协议分组：

```
/model
```

选择器将显示你 `modelProviders` 配置中的所有模型，并按其协议（例如 `openai`、`anthropic`、`gemini`）进行分组。你的选择会在会话间保持。

你也可以直接通过命令行参数切换模型，这在多个终端间工作时非常方便。

```bash
# 在一个终端中
qwen --model "qwen3-coder-plus"

# 在另一个终端中
qwen --model "qwen3-coder-next"
```

## 安全注意事项

- 不要将 API 密钥提交到版本控制中。
- 优先使用 `.qwen/.env` 存放项目本地的密钥（并确保它不在 git 中）。
- 如果终端输出中打印了用于验证的凭证，请将其视为敏感信息。