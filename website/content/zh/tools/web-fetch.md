# Web Fetch Tool (`web_fetch`)

本文档介绍了 Qwen Code 的 `web_fetch` 工具。

## 描述

使用 `web_fetch` 可以从指定 URL 获取内容，并通过 AI 模型进行处理。该工具接收一个 URL 和一个 prompt 作为输入，获取 URL 内容后，将 HTML 转换为 markdown 格式，并使用一个小而快的模型结合 prompt 对内容进行处理。

### 参数

`web_fetch` 接收两个参数：

- `url` (string, 必填): 要获取内容的 URL。必须是一个以 `http://` 或 `https://` 开头的完整有效 URL。
- `prompt` (string, 必填): 描述你希望从页面内容中提取哪些信息的 prompt。

## 如何在 Qwen Code 中使用 `web_fetch`

要在 Qwen Code 中使用 `web_fetch`，你需要提供一个 URL 和一个 prompt，描述你希望从该 URL 中提取什么内容。该工具在抓取 URL 之前会请求确认。确认后，工具将直接获取内容并使用 AI 模型进行处理。

该工具会自动将 HTML 转换为文本，处理 GitHub blob URL（将其转换为 raw URL），并出于安全考虑将 HTTP URL 升级为 HTTPS。

用法：

```
web_fetch(url="https://example.com", prompt="总结这篇文章的主要观点")
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

## 重要说明

- **单 URL 处理：** `web_fetch` 一次只处理一个 URL。如需分析多个 URL，请分别调用该工具。
- **URL 格式：** 该工具会自动将 HTTP URL 升级为 HTTPS，并将 GitHub blob URL 转换为 raw 格式，以便更好地访问内容。
- **内容处理：** 该工具直接获取内容，并使用 AI 模型进行处理，将 HTML 转换为可读的文本格式。
- **输出质量：** 输出质量将取决于 prompt 中指令的清晰度。
- **MCP 工具：** 如果有 MCP 提供的 web fetch 工具（以 "mcp\_\_" 开头），请优先使用该工具，因为它可能限制更少。