# 网络搜索

开发版本（`npm run dev`）在 Qwen Plus/Pro 会员登录后支持内置搜索，通过预发 MCP 服务 `https://pre-api.qwen.ai/api/v1/mcp/web_search` 发送请求，复用当前设备的访问令牌，无需单独填写搜索密钥或配置 `mcpServers`。CLI、VS Code 和桌面端共享此 Core 实现；普通发布版本尚未开放会员搜索。

Qwen Code 提供两种网络搜索方式：

1. **内置 `web_search` 工具** —— 使用 DashScope Responses 搜索，或开发版本会员会话中的 Qwen MCP 搜索服务。支持的 ModelStudio 和 OpenAI 兼容 DashScope 配置会在启动时默认开启，无需额外配置 provider 或 MCP。
2. **MCP（模型上下文协议）集成** —— 连接 Tavily、GLM 等外部搜索服务。当你的 provider 无法支持内置工具时使用此方式。

## 内置 `web_search`

DashScope 搜索会向小型辅助模型发出独立请求，使用服务端 `web_search` 和 `web_extractor` 工具。开发版本的会员搜索直接调用 MCP `web_search`，使用服务默认的结果数量，并返回带来源 URL 的结果文本。会员搜索的查询上限为 500 个字符；`webExtractor` 仅适用于 DashScope。

### 自动开启条件

未配置 `tools.webSearch` 时，客户端会根据当前身份验证方式和模型配置注册工具：

| 登录方式                                                                                                 | 内置搜索                        |
| -------------------------------------------------------------------------------------------------------- | ------------------------------- |
| 开发版本中的 Qwen Plus/Pro 会员登录                                                                      | 开启，使用预发 MCP 服务         |
| Alibaba ModelStudio → **Standard API Key**                                                               | 开启                            |
| Alibaba ModelStudio → **Token Plan**                                                                     | 开启                            |
| Alibaba ModelStudio → **Coding Plan**                                                                    | 关闭，其端点尚未针对该 API 验证 |
| QwenCloud → **Standard API Key**                                                                         | 开启                            |
| QwenCloud → **Token Plan**                                                                               | 开启                            |
| 已识别的 DashScope Responses 主机上，携带直接密钥的 OpenAI 兼容 `modelProviders` 或 Custom Provider 条目 | 开启                            |
| 第三方 provider、其他主机上的自定义端点、本地模型                                                        | 关闭                            |

DashScope 搜索使用与主模型相同的密钥计费；会员搜索使用当前登录会话管理和刷新的访问令牌。权限处理遵循当前审批模式及规则，在 `default` 审批模式下首次搜索会请求确认。无法从当前 provider 推导搜索后端时，工具不会自动启用，也不会显示启动警告。

要关闭它：

```json
{ "tools": { "webSearch": { "enabled": false } } }
```

或 `ENABLE_WEB_SEARCH=false`。Bare mode 和 safe mode 始终禁用它。

### 显式配置

本节用于配置 DashScope 搜索。会员搜索复用会员凭证，无需配置辅助搜索模型。

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

| 设置                            | 环境变量覆盖                 | 含义                                                                                                                                                                                                                                                                                                                                                                              |
| ------------------------------- | ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tools.webSearch.enabled`       | `ENABLE_WEB_SEARCH`          | 设为 `false` 以关闭工具。隐式启动激活需要保持 `enabled`、`model` 和仅环境变量的后端未设置。设置 `true` 仅在仅环境变量的后端也未设置时才允许自动推导；否则需要 `model`。                                                                                                                                                                                                           |
| `tools.webSearch.model`         | `WEB_SEARCH_MODEL`           | 显式路径的搜索模型选择器（`modelId` 或 `authType:modelId`）。配合 `WEB_SEARCH_BASE_URL` 使用时，它是该端点的纯模型 id；否则必须匹配已声明的 DashScope 兼容 `modelProviders` 条目。自动路径使用 `qwen3.8-flash`。                                                                                                                                                                  |
| `tools.webSearch.webExtractor`  | `WEB_SEARCH_EXTRACTOR`       | 允许搜索代理打开结果页面以获得更有依据的回答（默认 `true`；由 DashScope 单独计费）。                                                                                                                                                                                                                                                                                              |
| `tools.webSearch.timeoutMs`     | `WEB_SEARCH_TIMEOUT_MS`      | 单次搜索的总时间预算，单位为毫秒（默认 `120000`，最大值 `600000`；其他值回退到默认值）。超时的搜索在至少一次搜索调用完成后，将已到达的内容作为部分结果返回；如果预算在首次搜索调用完成前耗尽，工具会报告超时错误，因为没有执行搜索的叙述不构成可审计的证据。低于此预算的单工具执行上限（`QWEN_CODE_TOOL_EXECUTION_TIMEOUT_MS`）会先触发并丢弃部分结果；请保持它高于 `timeoutMs`。 |
| `tools.webSearch.allowedHosts`  | `WEB_SEARCH_ALLOWED_HOSTS`   | 为显式配置的搜索后端增加可信主机后缀，默认空列表。可填写完整主机名或域名后缀；环境变量使用逗号分隔。仅显式的 `WEB_SEARCH_BASE_URL` 或 `modelProviders` 搜索路径使用此配置，自动推导不会使用。配置的主机会收到搜索 API Key。条目会去除首尾空白并转为小写，不含点号的条目会被忽略。                                                                                                 |
| `tools.webSearch.maxPerSession` | `WEB_SEARCH_MAX_PER_SESSION` | 单个会话中最大的 `web_search` 调用次数（默认 `200`，最大值 `10000`；其他值回退到默认值）。该计数与子代理共享，并在会话变更时重置（`/clear`、`/resume`、分支）。达到上限后，后续搜索会被跳过，并告知模型使用已收集的内容继续。                                                                                                                                                     |

### 仅环境变量配置（无需 settings.json）

对于无法写入设置文件的环境（受限容器、仅支持环境变量注入的 CI），该工具可以完全通过环境变量配置——无需 `modelProviders` 条目：

```bash
export ENABLE_WEB_SEARCH=true
export WEB_SEARCH_MODEL=qwen3.8-flash
export WEB_SEARCH_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1
export WEB_SEARCH_ALLOWED_HOSTS=llm-gw.example.com   # 仅用于自定义网关主机
export DASHSCOPE_API_KEY=sk-...        # 或者设置 WEB_SEARCH_API_KEY
```

`WEB_SEARCH_BASE_URL` 对应 `modelProviders` 条目的 `baseUrl`，必须是一个 DashScope 兼容的端点；当设置此变量时，它会优先于 `modelProviders` 解析，并且 `WEB_SEARCH_MODEL` 会被用作纯 DashScope 模型 id。API Key 优先从 `WEB_SEARCH_API_KEY` 读取，否则从 `DASHSCOPE_API_KEY` 读取。使用自有域名网关时，还需通过 `WEB_SEARCH_ALLOWED_HOSTS` 或 `tools.webSearch.allowedHosts` 显式信任该主机。配置错误仍会以启动通知的形式呈现。

注意事项：

- 显式 DashScope 搜索的选择器必须解析到通过 `envKey` 提供直接 API Key 的 DashScope 兼容 `modelProviders` 条目，主模型可使用其他 provider。已停用的旧免费 Qwen OAuth 无法支持此路径；开发版本会员搜索使用上文独立的 MCP 后端。
- 身份验证成功变更后会重新检查搜索工具的注册状态；会员登录可在当前会话中启用搜索，无需重启。显式关闭、bare/safe mode 和工具权限仍然生效。显式指定的其他搜索模型或端点优先于会员搜索。
- 自动推导只接受已知的 DashScope 区域、ModelStudio、QwenCloud MaaS（含 `token-plan.` 子域名）和阿里巴巴内部主机。通用 `*.alicloudapi.com` 网关、`DASHSCOPE_PROXY_BASE_URL` 以及仅加入 `allowedHosts` 的自定义主机不会被自动选择。使用自定义网关时，需同时配置可信主机和显式搜索端点或 `modelProviders` 条目。
- 如果显式启用但配置错误，工具将保持关闭状态，启动通知会说明哪个条件失败。自动激活永远不会发出通知。
- DashScope 搜索使用你的 DashScope 密钥计费（`usage.x_tools` 计数）。Auto 审批模式（默认）让分类器无需提示即可批准搜索；在 `default` 审批模式下，工具会询问，使用"始终允许"批准会持久化一个标准的 `WebSearch` 权限规则，与其他工具一样。
- 没有客户端模型白名单；Responses 端点不支持的模型会在首次使用时明确报错。
- 超过时间预算的搜索在至少一次搜索调用完成后，将已到达的内容作为部分结果返回；如果预算在首次搜索调用完成前耗尽，工具会报告超时错误，因为没有执行搜索的叙述不构成可审计的证据。当搜索调用已完成但叙述性回答未到达时，结果最多包含代理已读取的 6,000 个字符的页面文本，标记为原始页面内容。
- 每会话上限计算的是 `web_search` 工具调用次数，而非单次调用内部运行的搜索次数，失败的调用也计入，因为请求已发送。被跳过的调用不是错误：它会告知模型预算已用完，并建议在确实需要更多搜索时提高 `tools.webSearch.maxPerSession`。

## MCP 替代方案

如果你的 provider 无法支持内置工具，可以通过连接外部 MCP 服务器来使用网络搜索——参见以下服务。

## ⚠️ 历史重大变更：原始内置 `web_search` 已移除

> **受影响版本：** `V0.0.7+` 至最后一个包含原始多 provider 内置网络搜索的版本。

原始内置 `web_search` 工具（Tavily/Google/GLM/DashScope 多 provider）及其配置已被**移除**。上述内置工具是不同的实现，具有不同的配置。如果你曾使用以下任何内容，请迁移到新的内置工具（DashScope）或 MCP：

| 已移除                                                                | 操作指南                                                   |
| --------------------------------------------------------------------- | ---------------------------------------------------------- |
| `settings.json` 中的 `webSearch` 块                                   | 改为在 `mcpServers` 中配置 MCP 服务器（见下文）            |
| `settings.json` 中的 `advanced.tavilyApiKey`                          | 使用 [Tavily MCP 服务器](#tavily-websearch)                |
| 环境变量 `TAVILY_API_KEY`                                             | 使用 [Tavily MCP 服务器](#tavily-websearch)                |
| 用于网络搜索的 `DASHSCOPE_API_KEY`                                    | 使用[内置 `web_search` 工具](#内置-web_search)             |
| 用于网络搜索的 `GLM_API_KEY`                                          | 使用 [GLM WebSearch Prime MCP](#glm-websearch-prime智谱ai) |
| CLI 标志 `--tavily-api-key` / `--glm-api-key` / `--dashscope-api-key` | 通过 `settings.json` 中的 `mcpServers` 配置                |

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

### GLM WebSearch Prime（智谱AI）

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

Firecrawl 官方托管的 MCP 服务，提供网络搜索、页面抓取、网站爬取与映射、浏览器交互及文件解析。搜索结果可同时返回页面的 Markdown 内容，模型无需另行抓取即可读取来源。托管服务的搜索、抓取和解析无需 API Key。搜索词、请求读取的 URL 及解析的文件会发送给 Firecrawl。

- **文档：** https://docs.firecrawl.dev/mcp-server
- **费用：** 搜索、抓取和解析无需 API Key，按 IP 提供每日限额；更高限额需付费套餐
- **获取 API Key：** https://www.firecrawl.dev/app/api-keys
- **适用场景：** 搜索后还需读取页面内容，或无需 API Key 试用 MCP 搜索

#### 可用工具

- `firecrawl_search`：网络搜索，可同时返回各结果页面的 Markdown 内容
- `firecrawl_scrape`：将单个页面转换为干净的 Markdown
- `firecrawl_parse`：将 PDF、Word、电子表格等本地文件转换为 Markdown

提供 API Key 后，还能使用网站映射与爬取、页面点击/输入/导航，以及 GitHub issue、文档等开发者来源搜索工具。

#### 设置

**方式 1：CLI 命令（远程 MCP）**

```bash
qwen mcp add firecrawl \
  -t http \
  "https://mcp.firecrawl.dev/v2/mcp" \
  -H "Authorization: Bearer ${FIRECRAWL_API_KEY}"
```

无需密钥试用时，省略 `-H` 行，即可在按 IP 的每日限额内使用 `firecrawl_search`、`firecrawl_scrape` 和 `firecrawl_parse`。

**方式 2：`settings.json`（远程 MCP）**

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

将 `${FIRECRAWL_API_KEY}` 替换为真实密钥，或设置对应环境变量。密钥为空时仍可连接，但只提供上述三个免密钥工具。

**方式 3：`settings.json`（本地 NPX）**

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

SerpApi 官方托管的 MCP 服务，通过单个工具提供 Google、百度、Bing 等搜索引擎的实时结构化结果。搜索词和参数会发送给 SerpApi。

- **文档：** https://serpapi.com/integrations/mcp
- **费用：** 付费，提供免费计划
- **获取 API Key：** https://serpapi.com/manage-api-key
- **适用场景：** 使用多种搜索引擎获取结构化结果

#### 可用工具

- `search`：网络搜索，可返回 Markdown 格式结果

#### 设置

**方式 1：CLI 命令**

```bash
qwen mcp add serpapi \
  -t http \
  "https://mcp.serpapi.com/mcp" \
  -H "Authorization: Bearer ${SERPAPI_API_KEY}"
```

**方式 2：`settings.json`**

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

将 `${SERPAPI_API_KEY}` 替换为真实密钥，或设置对应环境变量。密钥仅在搜索时需要；没有有效密钥时服务仍可连接并列出工具，但 `search` 会返回错误。

---

### looot

looot 托管的 MCP 服务，提供网络搜索、Google SERP 结果、新闻搜索和网页读取。搜索词与请求读取的 URL 会发送给 looot。

- **文档：** https://docs.looot.ai
- **费用：** 付费，使用预付余额，无免费额度
- **获取 API Key：** https://looot.ai
- **适用场景：** 网络、Google SERP、新闻搜索，以及将网页读取为文本

#### 可用工具

- `web_search`：网络搜索
- `google_search_results`：Google SERP 结果
- `news_search`：新闻搜索
- `read_web_page`：读取单个网页文本

服务还提供公司和邮箱查询工具。

#### 设置

**方式 1：CLI 命令（远程 MCP）**

```bash
qwen mcp add looot \
  -t http \
  "https://api.looot.ai/mcp" \
  -H "Authorization: Bearer ${LOOOT_API_KEY}"
```

**方式 2：`settings.json`（远程 MCP）**

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

将 `${LOOOT_API_KEY}` 替换为真实密钥，或设置对应环境变量。

---
