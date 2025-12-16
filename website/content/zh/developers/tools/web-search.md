# 网络搜索工具 (`web_search`)

本文档描述了使用多个提供商执行网络搜索的 `web_search` 工具。

## 描述

使用 `web_search` 执行网络搜索并从互联网获取信息。该工具支持多个搜索提供商，并在有来源时返回简洁的答案和来源引用。

### 支持的提供商

1. **DashScope**（官方，免费）- Qwen OAuth 用户自动可用（200 次请求/分钟，2000 次请求/天）
2. **Tavily** - 具有内置答案生成功能的高质量搜索 API
3. **Google 自定义搜索** - Google 的自定义搜索 JSON API

### 参数

`web_search` 接受两个参数：

- `query`（字符串，必填）：搜索查询
- `provider`（字符串，可选）：要使用的特定提供商（"dashscope"、"tavily"、"google"）
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

- DashScope 不需要 API 密钥（官方免费服务）
- **Qwen OAuth 用户：** 即使未明确配置，DashScope 也会自动添加到你的 provider 列表中
- 如果你想与 DashScope 一起使用其他 provider（如 Tavily、Google），请进行额外配置
- 设置 `default` 可指定默认使用的 provider（若不设置，默认优先级顺序为：Tavily > Google > DashScope）

### 方法 2：环境变量

在你的 shell 或 `.env` 文件中设置环境变量：

```bash

# Tavily
export TAVILY_API_KEY="tvly-xxxxx"
```

# Google
export GOOGLE_API_KEY="your-api-key"
export GOOGLE_SEARCH_ENGINE_ID="your-engine-id"
```

### 方法 3：命令行参数

运行 Qwen Code 时传递 API 密钥：

```bash

# Tavily
qwen --tavily-api-key tvly-xxxxx

# Google
qwen --google-api-key your-key --google-search-engine-id your-id

# 指定默认提供商
qwen --web-search-default tavily
```

### 向后兼容性（已弃用）

⚠️ **已弃用：** 旧版的 `tavilyApiKey` 配置仍受支持以确保向后兼容，但已被弃用：

```json
{
  "advanced": {
    "tavilyApiKey": "tvly-xxxxx" // ⚠️ 已弃用
  }
}
```

**重要提示：** 此配置已被弃用，并将在未来版本中移除。请迁移到上面所示的新 `webSearch` 配置格式。旧配置将自动将 Tavily 配置为提供商，但我们强烈建议更新您的配置。

## 禁用网络搜索

如果你想禁用网络搜索功能，可以在 `settings.json` 中排除 `web_search` 工具：

```json
{
  "tools": {
    "exclude": ["web_search"]
  }
}
```

**注意：** 此设置需要重启 Qwen Code 才能生效。一旦禁用，即使配置了网络搜索提供商，模型也无法使用 `web_search` 工具。

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

### DashScope（官方）

- **费用：** 免费
- **认证方式：** 使用通义千问 OAuth 认证时自动可用
- **配置：** 无需 API 密钥，通义千问 OAuth 用户的提供商列表中会自动添加
- **配额：** 每分钟 200 次请求，每天 2000 次请求
- **适用场景：** 常规查询，始终作为通义千问 OAuth 用户的备用选项
- **自动注册：** 如果你使用的是通义千问 OAuth，则即使你不显式配置，DashScope 也会自动添加到你的提供商列表中

### Tavily

- **费用：** 需要 API 密钥（付费服务，提供免费额度）
- **注册地址：** https://tavily.com
- **功能：** 提供高质量结果，并附带 AI 生成的答案
- **适用场景：** 研究、需要引用来源的综合性回答

### Google 自定义搜索

- **费用：** 提供免费额度（每天 100 次查询）
- **设置步骤：**
  1. 在 Google Cloud Console 中启用 Custom Search API
  2. 在 https://programmablesearchengine.google.com 创建一个自定义搜索引擎
- **功能特点：** 使用 Google 的搜索质量
- **适用场景：** 特定的、基于事实的查询

## 重要说明

- **响应格式：** 返回简洁的答案，并附带编号的来源引用
- **引用方式：** 来源链接以编号列表形式附加在结果末尾，如 [1]、[2] 等
- **多提供商支持：** 如果某个提供商失败，可以使用 `provider` 参数手动指定另一个提供商
- **DashScope 可用性：** 对于已通过 Qwen OAuth 登录的用户，系统将自动提供 DashScope，无需额外配置
- **默认提供商选择规则：** 系统会根据可用情况按以下优先级自动选择默认提供商：
  1. 用户显式配置的 `default` 值（最高优先级）
  2. CLI 参数 `--web-search-default`
  3. 按照优先顺序第一个可用的提供商：Tavily > Google > DashScope

## 故障排除

**工具不可用？**

- **对于 Qwen OAuth 用户：** 工具会自动注册到 DashScope 提供商，无需额外配置
- **对于其他认证类型：** 确保至少配置了一个提供商（Tavily 或 Google）
- 对于 Tavily/Google：验证你的 API 密钥是否正确

**遇到特定提供商的错误？**

- 使用 `provider` 参数尝试不同的搜索提供商
- 检查你的 API 配额和速率限制
- 确认 API 密钥已在配置中正确设置

**需要帮助？**

- 检查你的配置：运行 `qwen` 并使用设置对话框
- 查看当前设置：
  - macOS/Linux: `~/.qwen-code/settings.json`
  - Windows: `%USERPROFILE%\.qwen-code\settings.json`