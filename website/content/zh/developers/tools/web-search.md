# 网络搜索工具 (`web_search`)

本文档描述了用于使用多个提供商执行网络搜索的 `web_search` 工具。

## 描述

使用 `web_search` 执行网络搜索并从互联网获取信息。该工具支持多个搜索提供商，并在可用时返回带有来源引用的简洁答案。

### 支持的提供商

1. **DashScope**（官方，免费）- 自动为 Qwen OAuth 用户提供（200 次请求/分钟，1000 次请求/天）
2. **Tavily** - 高质量搜索 API，内置答案生成功能
3. **Google Custom Search** - Google 的自定义搜索 JSON API

### 参数

`web_search` 接受两个参数：

- `query`（字符串，必需）：搜索查询
- `provider`（字符串，可选）：要使用的特定提供商（"dashscope"、"tavily"、"google"）
  - 如果未指定，则使用配置中的默认提供商

## 配置

### 方法一：设置文件（推荐）

添加到你的 `settings.json`：

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

- DashScope 不需要 API 密钥（官方免费服务）
- **Qwen OAuth 用户：** 即使没有显式配置，DashScope 也会自动添加到你的提供商列表中
- 如果你想与 DashScope 一起使用其他提供商（Tavily、Google），请配置它们
- 设置 `default` 来指定默认使用的提供商（如果不设置，默认优先级顺序为：Tavily > Google > DashScope）

### 方法二：环境变量

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

⚠️ **已弃用：** 旧的 `tavilyApiKey` 配置仍受支持以保持向后兼容性，但已被弃用：

```json
{
  "advanced": {
    "tavilyApiKey": "tvly-xxxxx" // ⚠️ 已弃用
  }
}
```

**重要：** 此配置已被弃用，并将在未来版本中移除。请迁移到上面显示的新 `webSearch` 配置格式。旧配置将自动配置 Tavily 作为提供商，但我们强烈建议更新你的配置。

## 禁用网络搜索

如果你想禁用网络搜索功能，可以在 `settings.json` 中排除 `web_search` 工具：

```json
{
  "tools": {
    "exclude": ["web_search"]
  }
}
```

**注意：** 此设置需要重启 Qwen Code 才能生效。一旦禁用，即使配置了网络搜索提供商，`web_search` 工具对模型也不可用。

## 使用示例

### 基础搜索（使用默认提供商）

```
web_search(query="latest advancements in AI")
```

### 使用特定提供商搜索

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
- **认证：** 使用 Qwen OAuth 认证时自动可用
- **配置：** 无需 API 密钥，对 Qwen OAuth 用户自动添加到提供商列表中
- **配额：** 200 次请求/分钟，1000 次请求/天
- **最适合：** 通用查询，始终作为 Qwen OAuth 用户的备用选项
- **自动注册：** 如果你正在使用 Qwen OAuth，即使你没有明确配置，DashScope 也会自动添加到你的提供商列表中

### Tavily

- **费用：** 需要 API 密钥（付费服务，提供免费套餐）
- **注册：** https://tavily.com
- **功能：** 提供高质量结果和 AI 生成的答案
- **最适合：** 研究、带引用的全面答案

### Google 自定义搜索

- **费用：** 提供免费套餐（每天 100 次查询）
- **设置：**
  1. 在 Google Cloud Console 中启用自定义搜索 API
  2. 在 https://programmablesearchengine.google.com 创建一个自定义搜索引擎
- **特性：** Google 的搜索质量
- **最佳适用场景：** 特定的、事实性的查询

## 重要说明

- **响应格式：** 返回简洁的答案并带有编号的来源引用
- **引用：** 来源链接以编号列表形式附加：[1]、[2] 等
- **多个提供商：** 如果一个提供商失败，使用 `provider` 参数手动指定另一个
- **DashScope 可用性：** 对于 Qwen OAuth 用户自动可用，无需配置
- **默认提供商选择：** 系统根据可用性自动选择默认提供商：
  1. 你明确的 `default` 配置（最高优先级）
  2. CLI 参数 `--web-search-default`
  3. 按优先级排列的第一个可用提供商：Tavily > Google > DashScope

## 故障排除

**工具不可用？**

- **对于 Qwen OAuth 用户：** 工具已自动在 DashScope 提供商中注册，无需配置
- **对于其他认证类型：** 确保至少配置了一个提供商（Tavily 或 Google）
- 对于 Tavily/Google：验证您的 API 密钥是否正确

**特定提供商的错误？**

- 使用 `provider` 参数尝试不同的搜索提供商
- 检查您的 API 配额和速率限制
- 验证 API 密钥已在配置中正确设置

**需要帮助？**

- 检查您的配置：运行 `qwen` 并使用设置对话框
- 在 `~/.qwen-code/settings.json`（macOS/Linux）或 `%USERPROFILE%\.qwen-code\settings.json`（Windows）中查看当前设置