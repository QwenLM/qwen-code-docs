# Web Fetch 工具（`web_fetch`）

本文档介绍 Qwen Code 的 `web_fetch` 工具。

## 描述

使用 `web_fetch` 可以从指定 URL 获取内容，并通过 AI 模型进行处理。该工具接受 URL 和提示词作为输入，获取 URL 内容后，使用一个小型快速模型结合提示词对内容进行处理。

### 参数

`web_fetch` 接受三个参数：

- `url`（string，必填）：要获取内容的 URL。必须是以 `http://` 或 `https://` 开头的完整有效 URL。
- `prompt`（string，必填）：描述你希望从页面内容中提取哪些信息的提示词。
- `format`（string，可选）：仅控制发送给服务器的 `Accept` 请求头，用于表达你的内容偏好。**无论指定何种格式，所有获取的内容都会被规范化为纯文本供 LLM 处理。** 未指定时默认为 `"auto"`。
  - `"auto"`（默认）：通过内容协商优先请求 markdown（`Accept: text/markdown, text/html;q=0.9, text/plain;q=0.8, */*;q=0.1`），然后回退到 HTML、纯文本或其他内容类型。**推荐用于大多数场景**，对于支持 markdown 的服务器，可减少最多 80% 的 token 用量，同时也能兼容纯 JSON API。
  - `"markdown"`：优先请求 `Accept: text/markdown, */*;q=0.1`。当你明确需要 markdown 内容时使用。
  - `"html"`：优先请求 `Accept: text/html, */*;q=0.1`。当服务器要求 Accept 头中包含 HTML 时使用。内容仍会被转换为纯文本供 LLM 处理。
  - `"text"`：优先请求 `Accept: text/plain, */*;q=0.1`。当你特别需要纯文本内容时使用。

## 如何在 Qwen Code 中使用 `web_fetch`

在 Qwen Code 中使用 `web_fetch` 时，需要提供 URL 以及描述你希望从该 URL 中提取什么内容的提示词。工具在获取 URL 之前会请求确认。确认后，工具将直接获取内容并使用 AI 模型进行处理。

该工具会自动：

- 在必要时将 HTML 转换为文本
- 处理 GitHub blob URL（将其转换为 raw URL）
- 出于安全考虑，将 HTTP URL 升级为 HTTPS
- 支持 markdown 内容协商（显著降低 token 消耗）

用法：

```
web_fetch(url="https://example.com", prompt="Summarize the main points of this article")
```

指定 format 参数：

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

## 注意事项

- **单 URL 处理：** `web_fetch` 每次只处理一个 URL。如需分析多个 URL，请分别调用该工具。
- **URL 格式：** 该工具会自动将 HTTP URL 升级为 HTTPS，并将 GitHub blob URL 转换为 raw 格式，以便更好地访问内容。
- **内容协商：** 该工具支持"Markdown for Agents"内容协商。使用 `format="auto"`（默认）时，会发送 `Accept: text/markdown, text/html;q=0.9, text/plain;q=0.8, */*;q=0.1`，允许支持 markdown 的服务器直接返回 markdown 而非 HTML。低优先级的 `*/*` 回退确保纯 JSON API 及其他非文本端点仍可正常访问。这可减少最多 80% 的 token 用量。
- **内容处理：** 工具直接获取内容并使用 AI 模型进行处理。当服务器返回 HTML 时，会将其转换为可读文本格式；当服务器返回 markdown、纯文本或 JSON 等其他回退内容类型时，则直接使用原始内容。
- **输出质量：** 输出质量取决于提示词中指令的清晰程度。
- **MCP 工具：** 如果存在 MCP 提供的 web fetch 工具（以 "mcp\_\_" 开头），优先使用该工具，因为它可能限制更少。

## Markdown for Agents 支持

Qwen Code 的 `web_fetch` 工具实现了对 [Cloudflare 的 Markdown for Agents](https://blog.cloudflare.com/markdown-for-agents/) 规范的支持。该功能允许网站直接向 AI Agent 提供 markdown 内容，与解析 HTML 相比，可显著降低 token 消耗。

### 工作原理

1. `format` 参数**仅**控制发送给服务器的 `Accept` 请求头（不影响输出格式）：
   - `format="auto"`：发送 `Accept: text/markdown, text/html;q=0.9, text/plain;q=0.8, */*;q=0.1`
   - `format="markdown"`：发送 `Accept: text/markdown, */*;q=0.1`
   - `format="html"`：发送 `Accept: text/html, */*;q=0.1`
   - `format="text"`：发送 `Accept: text/plain, */*;q=0.1`
2. 如果服务器支持 markdown，则返回 `Content-Type: text/markdown`
3. 工具直接使用 markdown 或纯文本内容，无需转换
4. 如果服务器返回 HTML，则将其转换为可读文本格式供 LLM 处理；markdown、纯文本以及 JSON 等回退内容类型则直接使用
5. 所有内容在经过 AI 模型处理之前均会被规范化为文本

### 优势

- **Token 效率：** markdown 内容通常比等效的 HTML 节省 80% 的 token
- **结构更优：** markdown 保留了语义结构（标题、列表等）
- **向后兼容：** 适用于所有网站，并为支持的服务器提供增强体验

### 支持 markdown 的示例服务器

- Cloudflare 开发者文档
- Cloudflare 博客
- 任何使用 Cloudflare "Markdown for Agents" 功能的网站