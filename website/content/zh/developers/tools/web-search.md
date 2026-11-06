# 网络搜索

Qwen Code 提供两种网络搜索方式：

1. **内置 `web_search` 工具** — 由 DashScope Responses API 服务端搜索支持，或在 Qwen 订阅会话中由 Qwen MCP 搜索服务支持。在登录 Plus/Pro 订阅后启用，并在启动时默认开启（适用于支持的 ModelStudio 和 OpenAI 兼容的 DashScope 配置）；无需额外的提供商或 MCP 设置。
2. **MCP（模型上下文协议）集成** —— 连接任何外部搜索服务（Tavily、GLM 等）。当你的 provider 无法支持内置工具时使用此方式。

## 内置 `web_search` [#built-in-web_search]

对于 DashScope，内置工具向一个小型辅助模型发出自包含的搜索请求，该模型使用服务端 `web_search`（以及 `web_extractor`）工具，并返回叙述性发现结果及源 URL。使用 [带订阅的 Qwen 账户](../../users/configuration/auth.md) 时，它使用 Qwen MCP 搜索服务和您当前的登录凭据。无需单独的搜索 API 密钥、辅助模型或 `mcpServers` 配置。`webExtractor` 仅适用于 DashScope 搜索。

### 自动开启条件

如果你没有在 `tools.webSearch` 下进行任何配置，只要你运行的模型能够使用相同凭据支持搜索请求，该工具就会注册：

| 登录方式                                                                                                                   | 内置搜索                                            |
| -------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| [带订阅的 Qwen 账户](https://chat.qwen.ai/?memberPlan=qwen_code) — **Plus 或 Pro**                             | 开启                                              |
| 阿里巴巴 ModelStudio → **标准 API Key**                                                                                    | 开启                                                |
| 阿里巴巴 ModelStudio → **Token Plan**                                                                                      | 开启                                                |
| 阿里巴巴 ModelStudio → **Coding Plan**                                                                                     | 关闭 —— 其端点未针对此 API 进行验证                  |
| QwenCloud → **标准 API Key**                                                                                               | 开启                                                |
| QwenCloud → **Token Plan**                                                                                                 | 开启                                                |
| 在已识别的 DashScope Responses 主机上，带有直接密钥的 OpenAI 兼容 `modelProviders` 或 Custom Provider 条目                   | 开启                                                |
| 第三方 provider（OpenRouter、DeepSeek、ModelScope 等）、其他主机上的自定义端点、本地模型                                       | 关闭                                                |

DashScope 搜索与您的主模型使用相同的密钥计费；订阅搜索复用您的 Qwen 登录凭据。权限处理遵循当前激活的审批模式和规则；在 `default` 审批模式下，首次搜索会请求确认。当您的提供商无法支持该工具时，它在启动时根本不会出现——没有启动警告。

要关闭它：

```json
{ "tools": { "webSearch": { "enabled": false } } }
```

或 `ENABLE_WEB_SEARCH=false`。Bare mode 和 safe mode 始终禁用它。

### 显式配置

本节配置 DashScope 搜索。订阅搜索复用您的会员凭据，无需额外设置。显式搜索设置仍优先于自动订阅搜索。

将工具指向 ModelStudio 标准/Token Plan 或其他经过验证的 DashScope Responses 条目。当你的主模型运行在另一个 provider 上，并且你还持有单独的受支持 DashScope 密钥时，这很有用。Coding Plan 主机被排除在自动激活之外，因为 Responses 搜索工具未在那里进行验证。你可以使用 `tools.webSearch.model` 显式选择加入；如果端点不提供这些工具，首次搜索会明确失败。如果你不想依赖该未验证路径，请使用 MCP 搜索 provider。

```json
{
  "modelProviders": {
    "openai": [
      {
        "id": "qwen3.8-flash",
        "envKey": "DASHSCOPE_API_KEY",
        "baseUrl": "https://dashscope.aliyuncs.com/compatible-mode/v1"
      }
    ]
  },
  "tools": {
    "webSearch": {
      "enabled": true,
      "model": "qwen3.8-flash"
    }
  }
}
```

| 设置                           | 环境变量覆盖           | 含义                                                                                                                                                                                                                                                                       |
| ------------------------------ | ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tools.webSearch.enabled`      | `ENABLE_WEB_SEARCH`    | 设为 `false` 以关闭工具。隐式启动激活需要保持 `enabled`、`model` 和仅环境变量的后端未设置。设置 `true` 仅在仅环境变量的后端也未设置时才允许自动推导；否则需要 `model`。                                                                                                        |
| `tools.webSearch.model`        | `WEB_SEARCH_MODEL`     | 显式路径的搜索模型选择器（`modelId` 或 `authType:modelId`）。配合 `WEB_SEARCH_BASE_URL` 使用时，它是该端点的纯模型 id；否则必须匹配已声明的 DashScope 兼容 `modelProviders` 条目。自动路径使用 `qwen3.8-flash`。                                                              |
| `tools.webSearch.webExtractor` | `WEB_SEARCH_EXTRACTOR` | 允许搜索代理打开结果页面以获得更有依据的回答（默认 `true`；由 DashScope 单独计费）。                                                                                                                                                                                          |
| `tools.webSearch.timeoutMs`     | `WEB_SEARCH_TIMEOUT_MS`      | 单次搜索的总时间预算，单位为毫秒（默认 `120000`，最大值 `600000`；其他值回退到默认值）。超时的搜索在至少一次搜索调用完成后，将已到达的内容作为部分结果返回；如果预算在首次搜索调用完成前耗尽，工具会报告超时错误，因为没有执行搜索的叙述不构成可审计的证据。低于此预算的单工具执行上限（`QWEN_CODE_TOOL_EXECUTION_TIMEOUT_MS`）会先触发并丢弃部分结果；请保持它高于 `timeoutMs`。 |
| `tools.webSearch.allowedHosts`  | `WEB_SEARCH_ALLOWED_HOSTS`   | 信任用于您显式配置的搜索后端的其他主机后缀——精确的主机名，或所列后缀的任何子域名（在环境变量中以逗号分隔）。默认为空，因此除非设置，否则行为不变。只有 `WEB_SEARCH_BASE_URL` 后端和 `modelProviders` 路径会参考它；自动推导从不参考它，因此自定义主机仅在您的配置明确指定时才使用。配置的主机会接收 API 密钥。条目会被修剪并转换为小写，且不含点的条目会被忽略。                                                 |
| `tools.webSearch.maxPerSession` | `WEB_SEARCH_MAX_PER_SESSION` | 单个会话中最大的 `web_search` 调用次数（默认 `200`，最大值 `10000`；其他值回退到默认值）。该计数与子代理共享，并在会话变更时重置（`/clear`、`/resume`、分支）。达到上限后，后续搜索会被跳过，并告知模型使用已收集的内容继续。                                                                                                                                                              |

### 仅环境变量配置（无需 settings.json）

对于无法写入设置文件的环境（锁定容器、仅通过环境变量注入的 CI），可以完全通过环境变量配置该工具——无需 `modelProviders` 条目：

```bash
export ENABLE_WEB_SEARCH=true
export WEB_SEARCH_MODEL=qwen3.8-flash
export WEB_SEARCH_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1
export WEB_SEARCH_ALLOWED_HOSTS=llm-gw.example.com   # only for a gateway host
export DASHSCOPE_API_KEY=sk-...        # or set WEB_SEARCH_API_KEY instead
```

`WEB_SEARCH_BASE_URL` 对应 `modelProviders` 中的 `baseUrl`，且必须是兼容 DashScope 的端点；设置后，其优先级高于 `modelProviders` 解析，并将 `WEB_SEARCH_MODEL` 用作普通的 DashScope 模型 ID。如果设置了 `WEB_SEARCH_API_KEY`，则从中读取 API 密钥，否则从 `DASHSCOPE_API_KEY` 读取。如果端点是位于您自己域名上的网关，请在 `WEB_SEARCH_ALLOWED_HOSTS`（或 `tools.webSearch.allowedHosts`）中列出该主机——否则内置列表是检查所接受的唯一内容。配置错误仍会在启动时显示通知。

注意：

- 对于显式 DashScope 搜索，选择器必须解析为携带直接 API 密钥（通过 `envKey`）的 DashScope 兼容 `modelProviders` 条目。您的主模型可以是任何提供商。遗留的免费 Qwen OAuth 提供商无法支持此路径；Qwen 订阅搜索使用上述单独的 MCP 服务。
- 成功身份验证更改后会重新评估搜索注册。登录 Qwen 订阅会在当前会话中启用搜索而无需重启。显式禁用、裸机/安全模式以及工具权限规则仍然适用。
- 自动主机检测有意只接受已知的 DashScope 区域主机、Model Studio 和 QwenCloud MaaS 主机（包括其 `token-plan.` 订阅子域名）以及内部 Alibaba 主机。通用 `*.alicloudapi.com` 网关、`DASHSCOPE_PROXY_BASE_URL` 以及您仅添加到 `allowedHosts` 的任何主机都被排除在该自动路径之外，因为它在没有您参与的情况下运行，否则会将您主提供商的密钥交给无人声明的主机。对于您确实声明的网关，请在 `tools.webSearch.allowedHosts` 中列出它，并将 `WEB_SEARCH_BASE_URL`（或 `modelProviders` 条目）指向它。
- 如果显式启用但配置错误，工具将保持关闭状态，启动通知会说明哪个条件失败。自动激活永远不会发出通知。
- DashScope 搜索对您的 DashScope 密钥计费（`usage.x_tools` 计入）。自动审批模式（默认）允许分类器批准搜索而不提示；在 `default` 审批模式下，工具会询问，并且使用“始终允许”批准会持久化标准的 `WebSearch` 权限规则，就像其他工具一样。
- 没有客户端模型白名单；Responses 端点不支持的模型会在首次使用时明确报错。
- 超过时间预算的搜索在至少一次搜索调用完成后，将已到达的内容作为部分结果返回；如果预算在首次搜索调用完成前耗尽，工具会报告超时错误，因为没有执行搜索的叙述不构成可审计的证据。当搜索调用已完成但叙述性回答未到达时，结果最多包含代理已读取的 6,000 个字符的页面文本，标记为原始页面内容。
- 每会话上限计算的是 `web_search` 工具调用次数，而非单次调用内部运行的搜索次数，失败的调用也计入，因为请求已发送。被跳过的调用不是错误：它会告知模型预算已用完，并建议在确实需要更多搜索时提高 `tools.webSearch.maxPerSession`。

## MCP 替代方案

如果你的 provider 无法支持内置工具，可以通过连接外部 MCP 服务器来使用网络搜索——参见以下服务。

## ⚠️ 历史重大变更：原始内置 `web_search` 已移除

> **受影响版本：** `V0.0.7+` 至最后一个包含原始多 provider 内置网络搜索的版本。

原始内置 `web_search` 工具（Tavily/Google/GLM/DashScope 多 provider）及其配置已被**移除**。上述内置工具是不同的实现，具有不同的配置。如果你曾使用以下任何内容，请迁移到新的内置工具（DashScope）或 MCP：

| 已移除                                                                 | 操作指南                                                        |
| ---------------------------------------------------------------------- | ----------------------------------------------------------------- |
| `settings.json` 中的 `webSearch` 块                                   | 改为在 `mcpServers` 中配置 MCP 服务器（见下文）     |
| `advanced.tavilyApiKey` 在 `settings.json` 中 | 使用 [Tavily MCP 服务器](#tavily-websearch) |
| 环境变量 `TAVILY_API_KEY`                                              | 使用 [Tavily MCP 服务器](#tavily-websearch)                        |
| 用于网络搜索的 `DASHSCOPE_API_KEY`                                     | 使用[内置 `web_search` 工具](#built-in-web_search)            |
| 用于网络搜索的 `GLM_API_KEY`                                          | 使用 [GLM WebSearch Prime MCP](#glm-websearch-prime-zhipuai)       |
| `--tavily-api-key` / `--glm-api-key` / `--dashscope-api-key` CLI 标志 | 通过 `settings.json` 中的 `mcpServers` 进行配置 |

### 迁移示例

**之前（通过内置工具使用 Tavily）：**

```json
{
  "webSearch": {
    "provider": [{ "type": "tavily", "apiKey": "tvly-xxx" }],
    "default": "tavily"
  }
}
```

**之后（通过 MCP 使用 Tavily）：**

```json
{
  "mcpServers": {
    "tavily": {
      "httpUrl": "https://mcp.tavily.com/mcp/?tavilyApiKey=tvly-xxx"
    }
  }
}
```

---

**之前（通过内置工具使用 DashScope）：**

```json
{
  "webSearch": {
    "provider": [{ "type": "dashscope", "apiKey": "sk-xxx" }],
    "default": "dashscope"
  }
}
```

**之后（通过 MCP 使用阿里云百炼 WebSearch）：**

```json
{
  "mcpServers": {
    "WebSearch": {
      "httpUrl": "https://dashscope.aliyuncs.com/api/v1/mcps/WebSearch/mcp",
      "headers": {
        "Authorization": "Bearer sk-xxx"
      }
    }
  }
}
```

---

## 支持的 MCP 网络搜索服务

### 阿里云百炼 WebSearch

阿里云百炼平台提供的官方网络搜索 MCP 服务，基于 DashScope。如果你有 DashScope key，建议优先使用上方的内置 `web_search` 工具——它比此 MCP 服务使用更强的搜索路径。

- **MCP 市场：** https://bailian.console.aliyun.com/cn-beijing?tab=mcp#/mcp-market/detail/WebSearch
- **费用：** 付费（通过阿里云 DashScope 计费）
- **获取 API Key：** https://help.aliyun.com/zh/model-studio/get-api-key
- **适用场景：** 中文查询、访问中文网页内容、与阿里云生态集成

#### 设置

**方法 1：CLI 命令**

```bash
qwen mcp add WebSearch \
  -t http \
  "https://dashscope.aliyuncs.com/api/v1/mcps/WebSearch/mcp" \
  -H "Authorization: Bearer ${DASHSCOPE_API_KEY}"
```

**方法 2：`settings.json`**

```json
{
  "mcpServers": {
    "WebSearch": {
      "httpUrl": "https://dashscope.aliyuncs.com/api/v1/mcps/WebSearch/mcp",
      "headers": {
        "Authorization": "Bearer ${DASHSCOPE_API_KEY}"
      }
    }
  }
}
```

将 `${DASHSCOPE_API_KEY}` 替换为你的实际 API Key，或者将其设置为环境变量，Qwen Code 会自动读取。

---

### Tavily WebSearch

一个生产级 MCP 服务器，提供实时网络搜索、内容提取、网站地图和爬取功能。

- **代码仓库：** https://github.com/tavily-ai/tavily-mcp
- **费用：** 付费（提供免费额度）
- **获取 API Key：** https://app.tavily.com/home
- **适用场景：** 通用网络搜索，提供高质量 AI 生成的答案

#### 可用工具

- `tavily_search` — 实时网络搜索
- `tavily_extract` — 从网页中智能提取数据
- `tavily_map` — 创建网站的结构化地图
- `tavily_crawl` — 系统化地探索网站

#### 设置

**方法 1：CLI 命令（远程 MCP）**

```bash
qwen mcp add tavily \
  -t http \
  "https://mcp.tavily.com/mcp/?tavilyApiKey=${TAVILY_API_KEY}"
```

**方法 2：`settings.json`（远程 MCP）**

```json
{
  "mcpServers": {
    "tavily": {
      "httpUrl": "https://mcp.tavily.com/mcp/?tavilyApiKey=${TAVILY_API_KEY}"
    }
  }
}
```

将 `${TAVILY_API_KEY}` 替换为你的实际 API Key，或者将其设置为环境变量。

**方法 3：`settings.json`（本地 NPX）**

```json
{
  "mcpServers": {
    "tavily-mcp": {
      "command": "npx",
      "args": ["-y", "tavily-mcp@latest"],
      "env": {
        "TAVILY_API_KEY": "your-api-key-here"
      }
    }
  }
}
```

---

### GLM WebSearch Prime（智谱AI） [#glm-websearch-prime-zhipuai]

智谱AI 提供的官方网络搜索远程 MCP 服务，专为 GLM 编程计划用户设计。提供实时网络搜索，包括新闻、股票价格、天气等。

- **文档：** https://docs.bigmodel.cn/cn/coding-plan/mcp/search-mcp-server
- **费用：** 包含在 GLM 编程计划订阅中（Lite：100 次/月，Pro：1,000 次/月，Max：4,000 次/月）
- **获取 API Key：** https://open.bigmodel.cn/apikey/platform
- **适用场景：** 中文查询、实时信息检索

#### 可用工具

- `webSearchPrime` — 网络搜索，返回页面标题、URL、摘要、站点名称和图标

#### 设置

**方法 1：CLI 命令**

```bash
qwen mcp add web-search-prime \
  -t http \
  "https://open.bigmodel.cn/api/mcp/web_search_prime/mcp" \
  -H "Authorization: Bearer ${GLM_API_KEY}"
```

**方法 2：`settings.json`**

```json
{
  "mcpServers": {
    "web-search-prime": {
      "httpUrl": "https://open.bigmodel.cn/api/mcp/web_search_prime/mcp",
      "headers": {
        "Authorization": "Bearer ${GLM_API_KEY}"
      }
    }
  }
}
```

将 `${GLM_API_KEY}` 替换为你的实际智谱AI API Key，或者将其设置为环境变量。

---

### Firecrawl

Firecrawl 官方托管 MCP 服务器，提供网络搜索、页面抓取、网站爬取与地图生成、浏览器交互以及文件解析功能。搜索结果可以包含每个页面的 Markdown 内容，因此模型无需单独的获取步骤即可阅读其来源。托管服务器在进行搜索、抓取和解析时无需 API key。搜索查询、你要求它读取的 URL 以及你解析的任何文件都会被发送到 Firecrawl。

- **文档：** https://docs.firecrawl.dev/mcp-server
- **费用：** 搜索、抓取和解析无需 API key（每 IP 每日限额）；付费计划可获得更高限额
- **获取 API Key：** https://www.firecrawl.dev/app/api-keys
- **适用场景：** 模型需要同时阅读搜索到的页面内容的网络搜索，以及无需 API key 试用 MCP 网络搜索

#### 可用工具

- `firecrawl_search` — 网络搜索，可选择将每个结果的页面内容以 Markdown 返回
- `firecrawl_scrape` — 将单个页面转换为干净的 Markdown
- `firecrawl_parse` — 将本地文件（PDF、Word、电子表格等）转换为 Markdown

使用 API key 后，服务器还提供网站地图生成与爬取、页面交互（点击、输入、导航）以及搜索 GitHub issues 和文档等开发者来源的工具。

#### 设置

**方法 1：CLI 命令（远程 MCP）**

```bash
qwen mcp add firecrawl \
  -t http \
  "https://mcp.firecrawl.dev/v2/mcp" \
  -H "Authorization: Bearer ${FIRECRAWL_API_KEY}"
```

要在没有 key 的情况下试用，请省略 `-H` 行。你可以在每 IP 每日限额内使用 `firecrawl_search`、`firecrawl_scrape` 和 `firecrawl_parse`。

**方法 2：`settings.json`（远程 MCP）**

```json
{
  "mcpServers": {
    "firecrawl": {
      "httpUrl": "https://mcp.firecrawl.dev/v2/mcp",
      "headers": {
        "Authorization": "Bearer ${FIRECRAWL_API_KEY}"
      }
    }
  }
}
```

将 `${FIRECRAWL_API_KEY}` 替换为你的实际 API key，或者将其设置为环境变量。如果 key 为空，服务器仍会连接，但仅提供三个无需 key 的工具。

**方法 3：`settings.json`（本地 NPX）**

```json
{
  "mcpServers": {
    "firecrawl-mcp": {
      "command": "npx",
      "args": ["-y", "firecrawl-mcp@latest"],
      "env": {
        "FIRECRAWL_API_KEY": "your-api-key-here"
      }
    }
  }
}
```

---

### SerpApi

由 SerpApi 提供的官方托管 MCP 服务器，通过单一工具提供来自 Google、百度、Bing 等搜索引擎的实时结构化搜索结果。搜索查询及其参数将发送至 SerpApi。

- **文档：** https://serpapi.com/integrations/mcp
- **费用：** 付费（提供免费计划）
- **获取 API Key：** https://serpapi.com/manage-api-key
- **适用场景：** 从多种搜索引擎中获取结构化结果

#### 可用工具

- `search` — 网络搜索，可选择将结果以 Markdown 返回

#### 设置

**方法 1：CLI 命令**

```bash
qwen mcp add serpapi \
  -t http \
  "https://mcp.serpapi.com/mcp" \
  -H "Authorization: Bearer ${SERPAPI_API_KEY}"
```

**方法 2：`settings.json`**

```json
{
  "mcpServers": {
    "serpapi": {
      "httpUrl": "https://mcp.serpapi.com/mcp",
      "headers": {
        "Authorization": "Bearer ${SERPAPI_API_KEY}"
      }
    }
  }
}
```

将 `${SERPAPI_API_KEY}` 替换为你的实际 API key，或者将其设置为环境变量。该 key 仅在搜索时需要。没有有效的 API key，服务器仍会连接并列出其工具，但 `search` 会返回错误。

---

### looot

looot 提供的托管 MCP 服务器，支持网络搜索、Google SERP 结果、新闻搜索和网页阅读。搜索查询以及你要求它读取的 URL 会被发送到 looot。

- **文档：** https://docs.looot.ai
- **费用：** 付费（预付费余额，无免费套餐）
- **获取 API Key：** https://looot.ai
- **适用场景：** 网络搜索、Google SERP 和新闻结果，以及将页面作为文本阅读

#### 可用工具

- `web_search` — 网络搜索
- `google_search_results` — Google SERP 结果
- `news_search` — 新闻搜索
- `read_web_page` — 将单个页面作为文本阅读

该服务器还提供公司和邮箱查询功能。

#### 设置

**方法 1：CLI 命令（远程 MCP）**

```bash
qwen mcp add looot \
  -t http \
  "https://api.looot.ai/mcp" \
  -H "Authorization: Bearer ${LOOOT_API_KEY}"
```

**方法 2：`settings.json`（远程 MCP）**

```json
{
  "mcpServers": {
    "looot": {
      "httpUrl": "https://api.looot.ai/mcp",
      "headers": {
        "Authorization": "Bearer ${LOOOT_API_KEY}"
      }
    }
  }
}
```

将 `${LOOOT_API_KEY}` 替换为你的实际 API key，或者将其设置为环境变量。

---
