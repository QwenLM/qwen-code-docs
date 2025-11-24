# 网络搜索工具 (`web_search`)

本文档描述了使用多个提供商执行网络搜索的 `web_search` 工具。

## 描述

使用 `web_search` 执行网络搜索并从互联网获取信息。该工具支持多个搜索提供商，并在有结果时返回简洁的答案及来源引用。

### 支持的提供商

1. **DashScope**（官方，免费）- Qwen OAuth 用户自动可用（200 次请求/分钟，2000 次请求/天）
2. **Tavily** - 高质量的搜索 API，内置答案生成功能
3. **Google Custom Search** - Google 的自定义搜索 JSON API

### 参数

`web_search` 接受两个参数：

- `query`（字符串，必填）：搜索查询内容
- `provider`（字符串，可选）：指定使用的提供商（"dashscope"、"tavily"、"google"）
  - 如果未指定，则使用配置中的默认提供商

## 配置

### 方法 1：配置文件（推荐）

在你的 `settings.json` 中添加：

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

**说明：**

- DashScope 不需要 API key（官方免费服务）
- **Qwen OAuth 用户：** 即使没有显式配置，DashScope 也会自动加入到你的 provider 列表中
- 如果你想同时使用其他 provider（如 Tavily、Google），可以进行额外配置
- 设置 `default` 来指定默认使用的 provider（未设置时，默认优先级为：Tavily > Google > DashScope）

### 方法 2：环境变量

在 shell 或 `.env` 文件中设置环境变量：

```bash

# Tavily
export TAVILY_API_KEY="tvly-xxxxx"
```

```markdown
# Google
export GOOGLE_API_KEY="your-api-key"
export GOOGLE_SEARCH_ENGINE_ID="your-engine-id"
```

### 方法 3：命令行参数

在运行 Qwen Code 时传入 API keys：

```bash

# Tavily
qwen --tavily-api-key tvly-xxxxx

# Google
qwen --google-api-key your-key --google-search-engine-id your-id

# 指定默认 provider
qwen --web-search-default tavily
```

### 向后兼容（已弃用）

⚠️ **已弃用：** 旧版的 `tavilyApiKey` 配置仍受支持以确保向后兼容，但已被弃用：

```json
{
  "advanced": {
    "tavilyApiKey": "tvly-xxxxx" // ⚠️ 已弃用
  }
}
```

**重要提示：** 此配置已被弃用，并将在未来版本中移除。请迁移至上述新的 `webSearch` 配置格式。旧配置会自动将 Tavily 配置为 provider，但我们强烈建议你更新配置。
```

## 禁用 Web 搜索

如果你想禁用 Web 搜索功能，可以在 `settings.json` 中排除 `web_search` 工具：

```json
{
  "tools": {
    "exclude": ["web_search"]
  }
}
```

**注意：** 此设置需要重启 Qwen Code 才能生效。一旦禁用，即使配置了 Web 搜索提供商，模型也无法使用 `web_search` 工具。

## 使用示例

### 基础搜索（使用默认提供商）

```
web_search(query="latest advancements in AI")
```

### 指定提供商的搜索

```
web_search(query="latest advancements in AI", provider="tavily")
```

### 实际应用示例

```
web_search(query="weather in San Francisco today")
web_search(query="latest Node.js LTS version", provider="google")
web_search(query="best practices for React 19", provider="dashscope")
```

## 提供商详情

### DashScope (官方)

- **费用：** 免费
- **认证方式：** 使用 Qwen OAuth 认证时自动可用
- **配置：** 无需 API key，Qwen OAuth 用户的 provider 列表中会自动添加
- **配额：** 200 次请求/分钟，2000 次请求/天
- **适用场景：** 通用查询，对于 Qwen OAuth 用户始终作为备用选项
- **自动注册：** 如果你使用 Qwen OAuth，即使没有显式配置，DashScope 也会自动添加到你的 provider 列表中

### Tavily

- **费用：** 需要 API key（付费服务，提供免费额度）
- **注册地址：** https://tavily.com
- **特性：** 高质量结果，支持 AI 生成答案
- **适用场景：** 研究类查询，提供引用来源的综合性答案

### Google Custom Search

- **Cost:** 提供免费额度（100 次查询/天）
- **Setup:**
  1. 在 Google Cloud Console 中启用 Custom Search API
  2. 在 https://programmablesearchengine.google.com 创建一个 Custom Search Engine
- **Features:** 使用 Google 的搜索质量
- **Best for:** 特定的、事实类查询

## Important Notes

- **Response format:** 返回简洁的答案，并附带编号的来源引用
- **Citations:** 来源链接会以编号列表形式附加在结果中：[1]、[2] 等
- **Multiple providers:** 如果某个 provider 失败，可以通过 `provider` 参数手动指定另一个
- **DashScope 可用性:** 对于使用 Qwen OAuth 的用户自动可用，无需额外配置
- **默认 provider 选择:** 系统将根据以下优先级自动选择默认 provider：
  1. 用户显式设置的 `default` 配置（最高优先级）
  2. CLI 参数 `--web-search-default`
  3. 按优先级顺序选择第一个可用的 provider：Tavily > Google > DashScope

## 故障排除

**工具不可用？**

- **对于 Qwen OAuth 用户：** 工具会自动注册到 DashScope provider，无需额外配置
- **对于其他认证类型：** 确保至少配置了一个 provider（Tavily 或 Google）
- 对于 Tavily/Google：确认你的 API key 正确无误

**遇到特定 provider 的错误？**

- 使用 `provider` 参数尝试切换到不同的搜索 provider
- 检查你的 API 配额和速率限制
- 确认 API key 在配置中已正确设置

**需要帮助？**

- 检查你的配置：运行 `qwen` 并使用设置对话框
- 查看当前设置：
  - macOS/Linux: `~/.qwen-code/settings.json`
  - Windows: `%USERPROFILE%\.qwen-code\settings.json`