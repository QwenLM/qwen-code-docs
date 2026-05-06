# 网页搜索

Qwen Code 通过 **MCP（Model Context Protocol）** 集成支持网页搜索功能。与内置搜索工具不同，网页搜索通过连接外部 MCP 服务器提供，让你可以灵活选择最适合需求的搜索服务。

## ⚠️ 破坏性更新：已移除内置的 `web_search` 工具

> **影响版本：** `V0.0.7+` 至最后一个支持内置网页搜索的版本。

内置的 `web_search` 工具及其所有相关配置已被 **移除**。如果你之前使用了以下任何配置，请迁移到本文档中描述的基于 MCP 的方案：

| 已移除项 | 替代方案 |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `settings.json` 中的 `webSearch` 配置块 | 改为在 `mcpServers` 中配置 MCP 服务器（见下文） |
| `settings.json` 中的 `advanced.tavilyApiKey` | 使用 [Tavily MCP server](#tavily-websearch) |
| `TAVILY_API_KEY` 环境变量 | 使用 [Tavily MCP server](#tavily-websearch) |
| 用于网页搜索的 `DASHSCOPE_API_KEY` | 使用 [Alibaba Cloud Bailian WebSearch MCP](#alibaba-cloud-bailian-websearch-recommended) |
| 用于网页搜索的 `GLM_API_KEY` | 使用 [GLM WebSearch Prime MCP](#glm-websearch-prime-zhipuai) |
| `--tavily-api-key` / `--glm-api-key` / `--dashscope-api-key` CLI 参数 | 通过 `settings.json` 中的 `mcpServers` 进行配置 |

### 迁移示例

**迁移前（通过内置工具使用 Tavily）：**

```json
{
  "webSearch": {
    "provider": [{ "type": "tavily", "apiKey": "tvly-xxx" }],
    "default": "tavily"
  }
}
```

**迁移后（通过 MCP 使用 Tavily）：**

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

**迁移前（通过内置工具使用 DashScope）：**

```json
{
  "webSearch": {
    "provider": [{ "type": "dashscope", "apiKey": "sk-xxx" }],
    "default": "dashscope"
  }
}
```

**迁移后（通过 MCP 使用阿里云百炼 WebSearch）：**

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

## 支持的 MCP 网页搜索服务

### 阿里云百炼 WebSearch（推荐）

由阿里云百炼平台提供的官方网页搜索 MCP 服务，基于 DashScope 驱动。

- **MCP 市场：** https://bailian.console.aliyun.com/cn-beijing?tab=mcp#/mcp-market/detail/WebSearch
- **费用：** 付费（通过阿里云 DashScope 计费）
- **获取 API Key：** https://help.aliyun.com/zh/model-studio/get-api-key
- **适用场景：** 中文查询、访问中文网页内容、与阿里云生态集成

#### 配置方法

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

将 `${DASHSCOPE_API_KEY}` 替换为你的实际 API Key，或将其设置为环境变量，以便 Qwen Code 自动读取。

---

### Tavily WebSearch

一个生产就绪的 MCP 服务器，提供实时网页搜索、内容提取、站点地图生成和爬取功能。

- **仓库：** https://github.com/tavily-ai/tavily-mcp
- **费用：** 付费（提供免费额度）
- **获取 API Key：** https://app.tavily.com/home
- **适用场景：** 通用网页搜索，提供高质量的 AI 生成摘要

#### 可用工具

- `tavily_search` — 实时网页搜索
- `tavily_extract` — 智能网页数据提取
- `tavily_map` — 生成网站结构化地图
- `tavily_crawl` — 系统化探索/爬取网站

#### 配置方法

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

将 `${TAVILY_API_KEY}` 替换为你的实际 API Key，或将其设置为环境变量。

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

### GLM WebSearch Prime（智谱 AI）

由智谱 AI（ZhipuAI）提供的官方远程 MCP 网页搜索服务，专为 GLM Coding Plan 用户设计。提供包含新闻、股价、天气等在内的实时网页搜索功能。

- **文档：** https://docs.bigmodel.cn/cn/coding-plan/mcp/search-mcp-server
- **费用：** 包含在 GLM Coding Plan 订阅中（Lite：100 次/月，Pro：1,000 次/月，Max：4,000 次/月）
- **获取 API Key：** https://open.bigmodel.cn/apikey/platform
- **适用场景：** 中文查询、实时信息检索

#### 可用工具

- `webSearchPrime` — 网页搜索，返回页面标题、URL、摘要、站点名称和网站图标

#### 配置方法

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

将 `${GLM_API_KEY}` 替换为你的实际智谱 AI API Key，或将其设置为环境变量。

---