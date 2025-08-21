# Web Search Tool (`web_search`)

本文档描述了 `web_search` 工具。

## 描述

使用 `web_search` 通过 Tavily API 执行网页搜索。该工具在可能的情况下会返回一个简洁的答案以及来源信息。

### 参数

`web_search` 接受一个参数：

- `query` (string, 必填): 搜索查询语句。

## 如何使用 `web_search`

`web_search` 直接调用 Tavily API。你必须通过以下方式之一配置 `TAVILY_API_KEY`：

1. **Settings file**: 在你的 `settings.json` 中添加 `"tavilyApiKey": "your-key-here"`
2. **Environment variable**: 在你的环境或 `.env` 文件中设置 `TAVILY_API_KEY`
3. **Command line**: 运行 CLI 时使用 `--tavily-api-key your-key-here`

如果未配置 key，该工具将被禁用并跳过。

使用方法：

```
web_search(query="Your query goes here.")
```

## `web_search` 示例

获取某个主题的信息：

```
web_search(query="latest advancements in AI-powered code generation")
```

## 重要说明

- **返回响应：** `web_search` 工具在有结果时会返回一个简洁的答案，并附带来源链接列表。
- **引用来源：** 来源链接会以编号列表的形式附加在结果中。
- **API key：** 通过 settings.json、环境变量、.env 文件或命令行参数来配置 `TAVILY_API_KEY`。如果未配置，则该工具不会被注册。