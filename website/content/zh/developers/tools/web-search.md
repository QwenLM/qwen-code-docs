# Web Search 工具 (`web_search`)

本文档介绍了 `web_search` 工具，用于通过多个提供商执行网络搜索。

## 描述

使用 `web_search` 执行网络搜索并获取互联网信息。该工具支持多个搜索提供商，并在可用时返回带有来源引用的简明答案。

### 支持的提供商

1. **DashScope**（官方，免费）- Qwen OAuth 用户自动可用（200 次请求/分钟，1000 次请求/天）
2. **Tavily** - 高质量搜索 API，内置答案生成功能
3. **Google Custom Search** - Google 的自定义搜索 JSON API

### 参数

`web_search` 接受两个参数：

- `query`（string，必填）：搜索查询
- `provider`（string，可选）：指定使用的提供商（"dashscope"、"tavily"、"google"）
  - 如果未指定，则使用配置中的默认提供商

## 配置

### 方法 1：设置文件（推荐）

添加到你的 `settings.json` 中：

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

**注意：**

- DashScope 无需 API key（官方免费服务）
- **Qwen OAuth 用户：** 即使未显式配置，DashScope 也会自动添加到你的提供商列表中
- 如果希望与 DashScope 配合使用，可配置其他提供商（Tavily、Google）
- 设置 `default` 以指定默认使用的提供商（如果未设置，优先级顺序为：Tavily > Google > DashScope）

### 方法 2：环境变量

在 shell 或 `.env` 文件中设置环境变量：

```bash
# Tavily
export TAVILY_API_KEY="tvly-xxxxx"

# Google
export GOOGLE_API_KEY="your-api-key"
export GOOGLE_SEARCH_ENGINE_ID="your-engine-id"
```

### 方法 3：命令行参数

运行 Qwen Code 时传入 API key：

```bash
# Tavily
qwen --tavily-api-key tvly-xxxxx

# Google
qwen --google-api-key your-key --google-search-engine-id your-id

# 指定默认提供商
qwen --web-search-default tavily
```

### 向后兼容（已弃用）

⚠️ **已弃用：** 旧版 `tavilyApiKey` 配置仍为向后兼容而保留，但已弃用：

```json
{
  "advanced": {
    "tavilyApiKey": "tvly-xxxxx" // ⚠️ Deprecated
  }
}
```

**重要提示：** 此配置已弃用，并将在未来版本中移除。请迁移到上述新的 `webSearch` 配置格式。旧配置会自动将 Tavily 配置为提供商，但我们强烈建议更新你的配置。

## 禁用 Web Search

如果要禁用网络搜索功能，可以在 `settings.json` 中排除 `web_search` 工具：

```json
{
  "tools": {
    "exclude": ["web_search"]
  }
}
```

**注意：** 此设置需要重启 Qwen Code 才能生效。禁用后，即使已配置网络搜索提供商，模型也无法使用 `web_search` 工具。

## 使用示例

### 基础搜索（使用默认提供商）

```
web_search(query="latest advancements in AI")
```

### 使用指定提供商搜索

```
web_search(query="latest advancements in AI", provider="tavily")
```

### 实际示例

```
web_search(query="weather in San Francisco today")
web_search(query="latest Node.js LTS version", provider="google")
web_search(query="best practices for React 19", provider="dashscope")
```

## 提供商详情

### DashScope（官方）

- **费用：** 免费
- **身份验证：** 使用 Qwen OAuth 身份验证时自动可用
- **配置：** 无需 API key，Qwen OAuth 用户会自动添加到提供商列表
- **配额：** 200 次请求/分钟，1000 次请求/天
- **适用场景：** 常规查询，始终作为 Qwen OAuth 用户的备用选项
- **自动注册：** 如果你使用 Qwen OAuth，即使未显式配置，DashScope 也会自动添加到你的提供商列表中

### Tavily

- **费用：** 需要 API key（付费服务，提供免费额度）
- **注册：** https://tavily.com
- **特性：** 高质量结果，附带 AI 生成的答案
- **适用场景：** 研究、带引用的全面解答

### Google Custom Search

- **费用：** 提供免费额度（100 次查询/天）
- **设置步骤：**
  1. 在 Google Cloud Console 中启用 Custom Search API
  2. 在 https://programmablesearchengine.google.com 创建自定义搜索引擎
- **特性：** Google 级别的搜索质量
- **适用场景：** 具体、事实性查询

## 重要说明

- **响应格式：** 返回简明答案，并附带带编号的来源引用
- **引用：** 来源链接以编号列表形式附加在末尾：[1]、[2] 等。
- **多提供商：** 如果某个提供商失败，可使用 `provider` 参数手动指定其他提供商
- **DashScope 可用性：** Qwen OAuth 用户自动可用，无需配置
- **默认提供商选择：** 系统会根据可用性自动选择默认提供商：
  1. 你显式配置的 `default`（最高优先级）
  2. CLI 参数 `--web-search-default`
  3. 按优先级首个可用的提供商：Tavily > Google > DashScope

## 故障排查

**工具不可用？**

- **Qwen OAuth 用户：** 该工具会自动注册 DashScope 提供商，无需配置
- **其他身份验证类型：** 确保至少配置了一个提供商（Tavily 或 Google）
- 对于 Tavily/Google：验证你的 API key 是否正确

**特定提供商错误？**

- 使用 `provider` 参数尝试其他搜索提供商
- 检查你的 API 配额和速率限制
- 验证 API key 是否已在配置中正确设置

**需要帮助？**

- 检查配置：运行 `qwen` 并使用设置对话框
- 查看当前设置：`~/.qwen-code/settings.json`（macOS/Linux）或 `%USERPROFILE%\.qwen-code\settings.json`（Windows）