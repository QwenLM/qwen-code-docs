# 网络搜索工具（`web_search`）

本文档介绍用于通过多个服务商执行网络搜索的 `web_search` 工具。

## 描述

使用 `web_search` 执行网络搜索，从互联网获取信息。该工具支持多种搜索服务商，并在可用时返回简洁的答案及来源引用。

### 支持的服务商

1. **DashScope**（官方，免费）—— Qwen OAuth 用户自动可用（每分钟 200 次请求，每日 1000 次请求）
2. **Tavily** —— 高质量搜索 API，内置答案生成能力
3. **Google 自定义搜索** —— Google 的 Custom Search JSON API

### 参数

`web_search` 接受两个参数：

- `query`（字符串，必需）：搜索查询语句
- `provider`（字符串，可选）：指定要使用的服务商（"dashscope"、"tavily" 或 "google"）
  - 若未指定，则使用配置中设定的默认服务商

## 配置

### 方法 1：配置文件（推荐）

在你的 `settings.json` 文件中添加以下内容：

```json
{
  "webSearch": {
    "provider": [
      { "type": "dashscope" },
      { "type": "tavily", "apiKey": "tvly-xxxxx" },
      {
        "type": "google",
        "apiKey": "your-google-api-key",
        "searchEngineId": "your-search-engine-id"
      }
    ],
    "default": "dashscope"
  }
}
```

**注意事项：**

- DashScope 无需 API key（官方免费服务）
- **Qwen OAuth 用户**：即使未显式配置，DashScope 也会自动加入你的 provider 列表
- 如需与 DashScope 一起使用其他搜索服务（如 Tavily、Google），请额外配置对应 provider
- 通过 `default` 字段指定默认使用的 provider（若未设置，则按优先级顺序使用：Tavily > Google > DashScope）

### 方法 2：环境变量

在你的 shell 或 `.env` 文件中设置环境变量：

```bash

# Tavily
export TAVILY_API_KEY="tvly-xxxxx"

# Google
export GOOGLE_API_KEY="your-api-key"
export GOOGLE_SEARCH_ENGINE_ID="your-engine-id"
```

### 方法 3：命令行参数

运行 Qwen Code 时通过命令行参数传入 API 密钥：

```bash

# Tavily
qwen --tavily-api-key tvly-xxxxx

# Google
qwen --google-api-key your-key --google-search-engine-id your-id

# 指定默认搜索提供商
qwen --web-search-default tavily
```

### 向后兼容性（已弃用）

⚠️ **已弃用：** 旧版 `tavilyApiKey` 配置项仍为向后兼容而保留，但已被弃用：

```json
{
  "advanced": {
    "tavilyApiKey": "tvly-xxxxx" // ⚠️ 已弃用
  }
}
```

**重要：** 此配置项已被弃用，将在未来版本中移除。请迁移至上方所示的新型 `webSearch` 配置格式。旧配置会自动将 Tavily 设置为搜索提供商，但我们强烈建议您更新配置。

## 禁用网页搜索

如需禁用网页搜索功能，可在 `settings.json` 中排除 `web_search` 工具：

```json
{
  "tools": {
    "exclude": ["web_search"]
  }
}
```

**注意：** 此设置需要重启 Qwen Code 才能生效。禁用后，即使已配置网页搜索提供商，模型也无法使用 `web_search` 工具。

## 使用示例

### 基础搜索（使用默认提供商）

```
web_search(query="人工智能领域的最新进展")
```

### 指定提供商的搜索

```
web_search(query="人工智能领域的最新进展", provider="tavily")
```

### 实际应用场景示例

```
web_search(query="今天旧金山的天气")
web_search(query="最新的 Node.js LTS 版本", provider="google")
web_search(query="React 19 的最佳实践", provider="dashscope")
```

## 提供商详情

### DashScope（官方）

- **费用：** 免费  
- **认证方式：** 使用 Qwen OAuth 认证时自动可用  
- **配置：** 无需 API 密钥，Qwen OAuth 用户将自动将其加入提供方列表  
- **配额：** 200 次请求/分钟，1000 次请求/天  
- **适用场景：** 通用查询；对 Qwen OAuth 用户始终作为备用提供方可用  
- **自动注册：** 若你正在使用 Qwen OAuth，即使未显式配置，DashScope 也会自动添加至你的提供方列表  

### Tavily

- **费用：** 需要 API 密钥（付费服务，提供免费额度）  
- **注册地址：** https://tavily.com  
- **特性：** 提供高质量搜索结果，并附带 AI 生成的答案  
- **适用场景：** 研究类任务，需提供全面答案并附带引用来源

### Google 自定义搜索

- **费用：** 提供免费额度（每日 100 次查询）
- **配置步骤：**
  1. 在 Google Cloud 控制台中启用自定义搜索 API
  2. 在 https://programmablesearchengine.google.com 创建自定义搜索引擎
- **特性：** 使用 Google 的搜索质量
- **适用场景：** 针对具体事实性问题的查询

## 重要说明

- **响应格式：** 返回简洁答案，并附带编号的来源引用
- **引用方式：** 来源链接以编号列表形式附加，例如：[1]、[2] 等
- **多提供商支持：** 若某提供商调用失败，可手动通过 `provider` 参数指定其他提供商
- **DashScope 可用性：** Qwen OAuth 用户可自动使用，无需额外配置
- **默认提供商选择逻辑：** 系统根据可用性自动选择默认提供商，优先级顺序如下：
  1. 您显式配置的 `default`（最高优先级）
  2. CLI 参数 `--web-search-default`
  3. 按优先级顺序选取首个可用提供商：Tavily > Google > DashScope

## 故障排除

**工具不可用？**

- **Qwen OAuth 用户：** 工具已自动向 DashScope 提供商注册，无需额外配置  
- **其他认证方式用户：** 请确保至少配置了一个提供商（Tavily 或 Google）  
- **Tavily/Google 用户：** 请确认您的 API key 正确无误  

**特定提供商的错误？**

- 使用 `provider` 参数尝试切换至其他搜索提供商  
- 检查您的 API 配额与速率限制  
- 确认 API key 已在配置中正确设置  

**需要帮助？**

- 检查您的配置：运行 `qwen` 命令并使用设置对话框  
- 在 `~/.qwen-code/settings.json`（macOS/Linux）或 `%USERPROFILE%\.qwen-code\settings.json`（Windows）中查看当前配置