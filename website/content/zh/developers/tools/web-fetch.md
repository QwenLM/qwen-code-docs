# Web 获取工具 (`web_fetch`)

本文档介绍了 Qwen Code 的 `web_fetch` 工具。

## 描述

使用 `web_fetch` 从指定 URL 获取内容，并通过 AI 模型进行处理。该工具接收一个 URL 和一个提示词作为输入，获取 URL 内容后，使用一个小型快速模型结合提示词对内容进行处理。

### 参数

`web_fetch` 接收三个参数：

- `url`（字符串，必需）：要从中获取内容的 URL。必须是格式完整的有效 URL，以 `http://` 或 `https://` 开头。
- `prompt`（字符串，必需）：描述你想从页面内容中提取什么信息的提示词。
- `format`（字符串，可选）：仅控制发送给服务器的 `Accept` 头部，表明你对内容的偏好。**无论指定何种格式，所有获取到的内容都会归一化为纯文本以供 LLM 处理**。如果未指定，默认为 `"auto"`。
  - `"auto"`（默认）：通过内容协商优先获取 markdown（`Accept: text/markdown, text/html;q=0.9, text/plain;q=0.8, */*;q=0.1`），然后回退到 HTML、纯文本或其他内容类型。**推荐用于大多数场景**，因为对于支持 markdown 的服务器，这可以减少最多 80% 的 token 消耗，同时仍然支持仅返回 JSON 的 API。
  - `"markdown"`：优先请求 `Accept: text/markdown, */*;q=0.1`。当你明确需要 markdown 内容时使用。
  - `"html"`：优先请求 `Accept: text/html, */*;q=0.1`。当服务器要求在 Accept 头部包含 HTML 时使用。内容仍会转换为纯文本供 LLM 处理。
  - `"text"`：优先请求 `Accept: text/plain, */*;q=0.1`。当你特别需要纯文本内容时使用。

## 如何将 `web_fetch` 与 Qwen Code 结合使用

要将 `web_fetch` 与 Qwen Code 一起使用，请提供一个 URL 和一个描述你想从该 URL 中提取什么内容的提示词。该工具会在获取 URL 内容之前请求确认。确认后，工具会直接获取内容并通过 AI 模型进行处理。

该工具会自动：

- 在必要时将 HTML 转换为文本
- 处理 GitHub blob URL（将其转换为 raw URL）
- 将 HTTP URL 升级为 HTTPS 以提高安全性
- 支持 markdown 的内容协商（显著减少 token 使用）

用法：

```
web_fetch(url="https://example.com", prompt="Summarize the main points of this article")
```

指定格式：

```
web_fetch(url="https://example.com", prompt="Get the raw content", format="markdown")
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

获取 markdown 内容（适用于支持 Markdown for Agents 的服务器）：

```
web_fetch(url="https://developers.cloudflare.com/fundamentals/reference/markdown-for-agents/", prompt="Extract the key information", format="markdown")
```

## 重要说明

- **单次 URL 处理：** `web_fetch` 一次只处理一个 URL。要分析多个 URL，请分别调用该工具。
- **URL 格式：** 该工具会自动将 HTTP URL 升级为 HTTPS，并将 GitHub blob URL 转换为 raw 格式，以获得更好的内容访问效果。
- **内容协商：** 该工具支持“Markdown for Agents”内容协商。当使用 `format="auto"`（默认）时，它会发送 `Accept: text/markdown, text/html;q=0.9, text/plain;q=0.8, */*;q=0.1`，允许支持 markdown 的服务器直接返回 markdown 而不是 HTML。低优先级的 `*/*` 回退使得仅返回 JSON 的 API 和其他非文本端点仍然可获取。这可以将 token 消耗减少最多 80%。
- **内容处理：** 该工具直接获取内容并通过 AI 模型进行处理。当服务器返回 HTML 时，会将其转换为可读的文本格式。当服务器返回 markdown、纯文本或其他回退内容类型（如 JSON）时，则直接使用原内容。
- **输出质量：** 输出的质量取决于提示词指令的清晰度。
- **MCP 工具：** 如果有 MCP 提供的 web 获取工具可用（名称以“mcp\_\_”开头），建议优先使用该工具，因为它可能限制更少。

## Markdown for Agents 支持

Qwen Code 的 `web_fetch` 工具实现了对 [Cloudflare 的 Markdown for Agents](https://blog.cloudflare.com/markdown-for-agents/) 规范的支持。该特性允许网站直接向 AI 代理提供 markdown 内容，相比解析 HTML 可显著减少 token 消耗。

### 工作原理

1. `format` 参数**仅**控制发送给服务器的 `Accept` 头部（不影响输出格式）：
   - `format="auto"`：发送 `Accept: text/markdown, text/html;q=0.9, text/plain;q=0.8, */*;q=0.1`
   - `format="markdown"`：发送 `Accept: text/markdown, */*;q=0.1`
   - `format="html"`：发送 `Accept: text/html, */*;q=0.1`
   - `format="text"`：发送 `Accept: text/plain, */*;q=0.1`
2. 如果服务器支持 markdown，它会返回 `Content-Type: text/markdown`
3. 工具直接使用 markdown 或纯文本内容，无需转换
4. 如果服务器返回 HTML，则将其转换为可读的文本格式供 LLM 处理；markdown、纯文本以及回退内容类型（如 JSON）则直接使用
5. 所有内容在交由 AI 模型处理前都归一化为文本

### 优势

- **token 效率：** markdown 内容通常比等效的 HTML 少消耗 80% 的 token
- **更好的结构：** markdown 保留了语义结构（标题、列表等）
- **向后兼容：** 适用于所有网站，对支持服务器提供增强体验

### 支持 markdown 的示例服务器

- Cloudflare 开发者文档
- Cloudflare 博客
- 任何使用 Cloudflare “Markdown for Agents” 特性的网站