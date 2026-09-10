# 网络搜索

Qwen Code 提供两种网络搜索方式：

1. **内置 `web_search` 工具** —— 由 DashScope Responses API 的服务端搜索提供支持。默认在启动时为支持的 ModelStudio 和 OpenAI 兼容 DashScope 配置开启；无需额外的 provider 或 MCP 设置。
2. **MCP（模型上下文协议）集成** —— 连接任何外部搜索服务（Tavily、GLM 等）。当你的 provider 无法支持内置工具时使用此方式。

## 内置 `web_search`

内置工具会向一个小型辅助模型发出独立的搜索请求，该模型使用 DashScope 的服务端 `web_search`（和 `web_extractor`）工具，并返回带来源 URL 的叙述性搜索结果。

### 自动开启条件

如果你没有在 `tools.webSearch` 下进行任何配置，只要你运行的模型能够使用相同凭据支持搜索请求，该工具就会注册：

| 登录方式                                                                                                                   | 内置搜索                                            |
| -------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| 阿里巴巴 ModelStudio → **标准 API Key**                                                                                    | 开启                                                |
| 阿里巴巴 ModelStudio → **Token Plan**                                                                                      | 开启                                                |
| 阿里巴巴 ModelStudio → **Coding Plan**                                                                                     | 关闭 —— 其端点未针对此 API 进行验证                  |
| 在已识别的 DashScope Responses 主机上，带有直接密钥的 OpenAI 兼容 `modelProviders` 或 Custom Provider 条目                   | 开启                                                |
| 第三方 provider（OpenRouter、DeepSeek、ModelScope 等）、其他主机上的自定义端点、本地模型                                       | 关闭                                                |

搜索使用与主模型相同的密钥计费。权限处理遵循当前的审批模式和规则；在 `default` 审批模式下，首次搜索会请求确认。当你的 provider 无法支持该工具时，它不会在启动时出现——没有启动警告。

要关闭它：

```json
{ "tools": { "webSearch": { "enabled": false } } }
```

或 `ENABLE_WEB_SEARCH=false`。Bare mode 和 safe mode 始终禁用它。

### 显式配置

将工具指向 ModelStudio 标准/Token Plan 或其他经过验证的 DashScope Responses 条目。当你的主模型运行在另一个 provider 上，并且你还持有单独的受支持 DashScope 密钥时，这很有用。Coding Plan 主机被排除在自动激活之外，因为 Responses 搜索工具未在那里进行验证。你可以使用 `tools.webSearch.model` 显式选择加入；如果端点不提供这些工具，首次搜索会明确失败。如果你不想依赖该未验证路径，请使用 MCP 搜索 provider。

```json
{
  "modelProviders": {
    "openai": [
      {
        "id": "qwen3.6-plus",
        "envKey": "DASHSCOPE_API_KEY",
        "baseUrl": "https://dashscope.aliyuncs.com/compatible-mode/v1"
      }
    ]
  },
  "tools": {
    "webSearch": {
      "enabled": true,
      "model": "qwen3.6-plus"
    }
  }
}
```

| 设置                           | 环境变量覆盖           | 含义                                                                                                                                                                                                                                                                       |
| ------------------------------ | ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tools.webSearch.enabled`      | `ENABLE_WEB_SEARCH`    | 设为 `false` 以关闭工具。隐式启动激活需要保持 `enabled`、`model` 和仅环境变量的后端未设置。设置 `true` 仅在仅环境变量的后端也未设置时才允许自动推导；否则需要 `model`。                                                                                                        |
| `tools.webSearch.model`        | `WEB_SEARCH_MODEL`     | 显式路径的搜索模型选择器（`modelId` 或 `authType:modelId`）。配合 `WEB_SEARCH_BASE_URL` 使用时，它是该端点的纯模型 id；否则必须匹配已声明的 DashScope 兼容 `modelProviders` 条目。自动路径使用 `qwen3.6-plus`。                                                              |
| `tools.webSearch.webExtractor` | `WEB_SEARCH_EXTRACTOR` | 允许搜索代理打开结果页面以获得更有依据的回答（默认 `true`；由 DashScope 单独计费）。                                                                                                                                                                                          |

### 仅环境变量配置（无需 settings.json）

对于无法写入设置文件的环境（受限容器、仅支持环境变量注入的 CI），该工具可以完全通过环境变量配置——无需 `modelProviders` 条目：

```bash
export ENABLE_WEB_SEARCH=true
export WEB_SEARCH_MODEL=qwen3.6-plus
export WEB_SEARCH_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1
export DASHSCOPE_API_KEY=sk-...        # 或者设置 WEB_SEARCH_API_KEY
```

`WEB_SEARCH_BASE_URL` 对应 `modelProviders` 条目的 `baseUrl`，必须是一个 DashScope 兼容的端点；当设置此变量时，它会优先于 `modelProviders` 解析，并且 `WEB_SEARCH_MODEL` 会被用作纯 DashScope 模型 id。API key 优先从 `WEB_SEARCH_API_KEY` 读取，否则从 `DASHSCOPE_API_KEY` 读取。配置错误仍会以启动通知的形式呈现。

注意事项：

- 选择器必须解析到一个通过 `envKey` 携带直接 API key 的 DashScope 兼容 `modelProviders` 条目。你的主模型可以是任何 provider——只有搜索侧请求需要 DashScope 条目。Qwen OAuth 无法支持此工具。
- 哪些 provider 可以激活该工具在启动时决定。一旦激活，搜索后端会在下一次搜索时跟随当前选定的模型；切换到不支持的 provider 会使该次调用失败，而从工具不存在的会话切换过来仍需要重启才能注册它。
- 自动主机检测有意只接受已知的 DashScope 区域、Token Plan MaaS 和阿里巴巴内部主机。通用的 `*.alicloudapi.com` 网关和 `DASHSCOPE_PROXY_BASE_URL` 被排除，因为不确定它们是否会转发 Responses 搜索工具。
- 如果显式启用但配置错误，工具将保持关闭状态，启动通知会说明哪个条件失败。自动激活永远不会发出通知。
- 搜索使用你的 DashScope 密钥计费（`usage.x_tools` 计数）。Auto 审批模式（默认）让分类器无需提示即可批准搜索；在 `default` 审批模式下，工具会询问，使用"始终允许"批准会持久化一个标准的 `WebSearch` 权限规则，与其他工具一样。
- 没有客户端模型白名单；Responses 端点不支持的模型会在首次使用时明确报错。

## MCP 替代方案

如果你的 provider 无法支持内置工具，可以通过连接外部 MCP 服务器来使用网络搜索——参见以下服务。

## ⚠️ 历史重大变更：原始内置 `web_search` 已移除

> **受影响版本：** `V0.0.7+` 至最后一个包含原始多 provider 内置网络搜索的版本。

原始内置 `web_search` 工具（Tavily/Google/GLM/DashScope 多 provider）及其配置已被**移除**。上述内置工具是不同的实现，具有不同的配置。如果你曾使用以下任何内容，请迁移到新的内置工具（DashScope）或 MCP：

| 已移除                                                                 | 操作指南                                                        |
| ---------------------------------------------------------------------- | ----------------------------------------------------------------- |
| `settings.json` 中的 `webSearch` 块                                    | 改为在 `mcpServers` 中配置 MCP 服务器（见下文）                    |
| `settings.json` 中的 `advanced.tavilyApiKey`                           | 使用 [Tavily MCP 服务器](#tavily-websearch)                        |
| 环境变量 `TAVILY_API_KEY`                                              | 使用 [Tavily MCP 服务器](#tavily-websearch)                        |
| 用于网络搜索的 `DASHSCOPE_API_KEY`                                     | 使用[内置 `web_search` 工具](#built-in-web_search)            |
| 用于网络搜索的 `GLM_API_KEY`                                          | 使用 [GLM WebSearch Prime MCP](#glm-websearch-prime-zhipuai)       |
| CLI 标志 `--tavily-api-key` / `--glm-api-key` / `--dashscope-api-key` | 通过 `settings.json` 中的 `mcpServers` 配置                        |

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
