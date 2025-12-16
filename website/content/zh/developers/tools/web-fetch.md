# Web 抓取工具 (`web_fetch`)

本文档描述了用于 Qwen Code 的 `web_fetch` 工具。

## 描述

使用 `web_fetch` 从指定 URL 获取内容，并通过 AI 模型进行处理。该工具接收一个 URL 和一个提示作为输入，获取 URL 内容，将 HTML 转换为 Markdown，并使用一个小而快速的模型根据提示处理内容。

### 参数

`web_fetch` 接收两个参数：

- `url`（字符串，必填）：要从中获取内容的 URL。必须是有效的完整 URL，以 `http://` 或 `https://` 开头。
- `prompt`（字符串，必填）：描述你希望从页面内容中提取哪些信息的提示。

## 如何在 Qwen Code 中使用 `web_fetch`

要在 Qwen Code 中使用 `web_fetch`，请提供一个 URL 和一段描述你希望从该 URL 中提取内容的提示。该工具会在获取 URL 之前请求确认。确认后，工具将直接获取内容并使用 AI 模型进行处理。

该工具会自动将 HTML 转换为文本，处理 GitHub blob URL（将其转换为原始 URL），并将 HTTP URL 升级为 HTTPS 以确保安全性。

用法：

```
web_fetch(url="https://example.com", prompt="总结这篇文章的主要观点")
```

## `web_fetch` 示例

总结单篇文章：

```
web_fetch(url="https://example.com/news/latest", prompt="你能总结这篇文章的主要观点吗？")
```

提取特定信息：

```
web_fetch(url="https://arxiv.org/abs/2401.0001", prompt="这篇论文中描述的关键发现和方法论是什么？")
```

分析 GitHub 文档：

```
web_fetch(url="https://github.com/QwenLM/Qwen/blob/main/README.md", prompt="安装步骤和主要功能是什么？")
```

## 重要说明

- **单个 URL 处理：** `web_fetch` 一次只处理一个 URL。如需分析多个 URL，请分别调用该工具。
- **URL 格式：** 该工具会自动将 HTTP URL 升级为 HTTPS，并将 GitHub 的 blob URL 转换为原始格式，以便更好地访问内容。
- **内容处理：** 该工具直接获取内容，并使用 AI 模型进行处理，将 HTML 转换为可读的文本格式。
- **输出质量：** 输出质量取决于提示中指令的清晰度。
- **MCP 工具：** 如果有可用的 MCP 提供的网页抓取工具（以 "mcp\_\_" 开头），请优先使用该工具，因为它可能具有更少的限制。