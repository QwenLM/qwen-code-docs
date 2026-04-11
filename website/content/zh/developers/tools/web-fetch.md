# Web Fetch 工具 (`web_fetch`)

本文档介绍了适用于 Qwen Code 的 `web_fetch` 工具。

## 简介

使用 `web_fetch` 从指定 URL 获取内容，并使用 AI 模型进行处理。该工具接收 URL 和 prompt 作为输入，获取 URL 内容，将 HTML 转换为 Markdown，并使用轻量、快速的模型结合 prompt 对内容进行处理。

### 参数

`web_fetch` 接受两个参数：

- `url`（string，必填）：要获取内容的 URL。必须是以 `http://` 或 `https://` 开头的完整有效 URL。
- `prompt`（string，必填）：用于描述你希望从页面内容中提取哪些信息的 prompt。

## 如何在 Qwen Code 中使用 `web_fetch`

要在 Qwen Code 中使用 `web_fetch`，请提供一个 URL 以及描述你想从该 URL 提取内容的 prompt。工具在获取 URL 前会请求确认。确认后，工具将直接获取内容并使用 AI 模型进行处理。

该工具会自动将 HTML 转换为文本，处理 GitHub blob URL（将其转换为 raw URL），并出于安全考虑将 HTTP URL 升级为 HTTPS。

用法：

```
web_fetch(url="https://example.com", prompt="Summarize the main points of this article")
```

## `web_fetch` 示例

总结单篇文章：

```
web_fetch(url="https://example.com/news/latest", prompt="Can you summarize the main points of this article?")
```

提取特定信息：

```
web_fetch(url="https://arxiv.org/abs/2401.0001", prompt="What are the key findings and methodology described in this paper?")
```

分析 GitHub 文档：

```
web_fetch(url="https://github.com/QwenLM/Qwen/blob/main/README.md", prompt="What are the installation steps and main features?")
```

## 注意事项

- **单次处理单个 URL：** `web_fetch` 每次仅处理一个 URL。如需分析多个 URL，请分别调用该工具。
- **URL 格式：** 工具会自动将 HTTP URL 升级为 HTTPS，并将 GitHub blob URL 转换为 raw 格式，以便更好地获取内容。
- **内容处理：** 工具会直接获取内容并使用 AI 模型进行处理，将 HTML 转换为可读的文本格式。
- **输出质量：** 输出质量取决于 prompt 中指令的清晰程度。
- **MCP 工具：** 如果存在 MCP 提供的网页抓取工具（以 `mcp__` 开头），建议优先使用该工具，因为它可能限制更少。