# 网络搜索

Qwen Code 通过 **MCP（模型上下文协议）** 集成支持网络搜索功能。网络搜索并非内置搜索工具，而是通过连接外部 MCP 服务器实现，让您可以灵活选择最适合需求的搜索服务。

## ⚠️ 重大变更：内置 `web_search` 工具已移除

> **受影响版本：** `V0.0.7+` 至最后一个支持内置网络搜索的版本。

内置的 `web_search` 工具及其所有相关配置已被**移除**。如果您曾使用以下任何内容，请迁移至本文档所述的基于 MCP 的方法：

| 已移除项                                                                  | 操作指南                                                                                      |
| ------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `settings.json` 中的 `webSearch` 块                                        | 改为在 `mcpServers` 中配置 MCP 服务器（见下文）                                                |
| `settings.json` 中的 `advanced.tavilyApiKey`                               | 使用 [Tavily MCP 服务器](#tavily-websearch)                                                    |
| 环境变量 `TAVILY_API_KEY`                                                  | 使用 [Tavily MCP 服务器](#tavily-websearch)                                                    |
| 用于网络搜索的 `DASHSCOPE_API_KEY`                                         | 使用 [阿里云百炼 WebSearch MCP](#alibaba-cloud-bailian-websearch-recommended)                   |
| 用于网络搜索的 `GLM_API_KEY`                                              | 使用 [GLM WebSearch Prime MCP](#glm-websearch-prime-zhipuai)                                    |
| CLI 标志 `--tavily-api-key` / `--glm-api-key` / `--dashscope-api-key` | 通过 `settings.json` 中的 `mcpServers` 配置                                                     |

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

### 阿里云百炼 WebSearch（推荐）

阿里云百炼平台提供的官方网络搜索 MCP 服务，基于 DashScope。

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

将 `${DASHSCOPE_API_KEY}` 替换为您的实际 API Key，或者将其设置为环境变量，Qwen Code 会自动读取。

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

将 `${TAVILY_API_KEY}` 替换为您的实际 API Key，或者将其设置为环境变量。

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

将 `${GLM_API_KEY}` 替换为您的实际智谱AI API Key，或者将其设置为环境变量。