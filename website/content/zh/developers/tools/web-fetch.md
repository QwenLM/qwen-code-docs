# Web Fetch 工具（`web_fetch`）

本文档介绍 Qwen Code 的 `web_fetch` 工具。

## 说明

使用 `web_fetch` 可从指定 URL 获取内容，并通过 AI 模型进行处理。该工具接收一个 URL 和一个提示词（prompt）作为输入，获取对应 URL 的内容，将 HTML 转换为 Markdown 格式，并使用轻量、快速的模型结合提示词对内容进行处理。

### 参数

`web_fetch` 接收两个参数：

- `url`（字符串，必需）：要获取内容的 URL。必须是格式完整且有效的 URL，以 `http://` 或 `https://` 开头。
- `prompt`（字符串，必需）：描述你希望从网页内容中提取哪些信息的提示词。

## 如何在 Qwen Code 中使用 `web_fetch`

要在 Qwen Code 中使用 `web_fetch`，请提供一个 URL 和一段提示词（prompt），用于描述你希望从该 URL 中提取的内容。该工具会在获取 URL 前请求你的确认。确认后，工具将直接获取网页内容，并使用 AI 模型对其进行处理。

该工具会自动将 HTML 转换为纯文本，支持 GitHub blob URL（自动转换为 raw URL），并为安全起见将 HTTP URL 升级为 HTTPS。

用法：

```
web_fetch(url="https://example.com", prompt="总结本文的主要观点")
```

## `web_fetch` 示例

总结单篇文章：

```
web_fetch(url="https://example.com/news/latest", prompt="你能总结这篇文章的主要观点吗？")
```

提取特定信息：

```
web_fetch(url="https://arxiv.org/abs/2401.0001", prompt="这篇论文描述的关键发现和方法论是什么？")
```

分析 GitHub 文档：

```
web_fetch(url="https://github.com/QwenLM/Qwen/blob/main/README.md", prompt="安装步骤和主要功能有哪些？")
```

## 重要说明

- **单 URL 处理：** `web_fetch` 每次仅处理一个 URL。如需分析多个 URL，请分别调用该工具。
- **URL 格式：** 该工具会自动将 HTTP URL 升级为 HTTPS，并将 GitHub blob URL 转换为 raw 格式，以提升内容获取效果。
- **内容处理：** 该工具直接抓取内容，并使用 AI 模型进行处理，将 HTML 转换为可读的纯文本格式。
- **输出质量：** 输出质量取决于提示词中指令的清晰程度。
- **MCP 工具：** 如果存在 MCP 提供的网页抓取工具（名称以 `mcp__` 开头），请优先使用该工具，因其限制通常更少。