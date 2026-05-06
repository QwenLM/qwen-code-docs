# Web Fetch 工具 (`web_fetch`)

本文档介绍了 Qwen Code 的 `web_fetch` 工具。

## 描述

使用 `web_fetch` 从指定 URL 获取内容，并使用 AI 模型进行处理。该工具接收 URL 和 prompt 作为输入，抓取 URL 内容后，使用一个轻量、快速的模型结合 prompt 对内容进行处理。

### 参数

`web_fetch` 接收三个参数：

- `url`（string，必填）：要获取内容的 URL。必须是格式完整且有效的 URL，以 `http://` 或 `https://` 开头。
- `prompt`（string，必填）：用于描述你想从页面内容中提取哪些信息的 prompt。
- `format`（string，可选）：仅控制发送给服务器的 `Accept` 请求头，用于表明你的内容偏好。**无论指定何种格式，所有获取的内容都会被标准化为纯文本以供 LLM 处理**。若未指定，默认值为 `"auto"`。
  - `"auto"`（默认）：通过内容协商优先获取 markdown（`Accept: text/markdown, text/html`），以 HTML 作为备选。**推荐在大多数场景下使用**，对于支持 markdown 的服务器，最多可减少 80% 的 token 消耗。
  - `"markdown"`：发送 `Accept: text/markdown`。当你明确需要 markdown 内容时使用。
  - `"html"`：发送 `Accept: text/html`。当服务器要求 Accept 请求头包含 HTML 时使用。内容仍会被转换为纯文本以供 LLM 处理。
  - `"text"`：发送 `Accept: text/plain`。当你明确需要纯文本内容时使用。

## 如何在 Qwen Code 中使用 `web_fetch`

要在 Qwen Code 中使用 `web_fetch`，请提供一个 URL 以及描述你想从该 URL 提取什么内容的 prompt。工具在抓取 URL 前会请求确认。确认后，工具将直接获取内容并使用 AI 模型进行处理。

该工具会自动执行以下操作：

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

- **单次处理单个 URL：** `web_fetch` 每次仅处理一个 URL。如需分析多个 URL，请分别调用该工具。
- **URL 格式：** 工具会自动将 HTTP URL 升级为 HTTPS，并将 GitHub blob URL 转换为 raw 格式，以便更好地获取内容。
- **内容协商：** 工具支持 "Markdown for Agents" 内容协商。使用 `format="auto"`（默认）时，会发送 `Accept: text/markdown, text/html` 请求头，使支持 markdown 的服务器直接返回 markdown 而非 HTML。这最多可减少 80% 的 token 消耗。
- **内容处理：** 工具直接获取内容并使用 AI 模型进行处理。当服务器返回 HTML 时，会将其转换为易读的文本格式。当服务器返回 markdown 或纯文本时，则直接使用原始内容。
- **输出质量：** 输出质量取决于 prompt 中指令的清晰程度。
- **MCP 工具：** 如果存在由 MCP 提供的网页抓取工具（以 `mcp__` 开头），建议优先使用该工具，因为它可能具有更少的限制。

## Markdown for Agents 支持

Qwen Code 的 `web_fetch` 工具实现了对 [Cloudflare 的 Markdown for Agents](https://blog.cloudflare.com/markdown-for-agents/) 规范的支持。该功能允许网站直接向 AI Agent 提供 markdown 内容，与解析 HTML 相比，可显著降低 token 消耗。

### 工作原理

1. `format` 参数**仅**控制发送给服务器的 `Accept` 请求头（不影响输出格式）：
   - `format="auto"`：发送 `Accept: text/markdown, text/html`
   - `format="markdown"`：发送 `Accept: text/markdown`
   - `format="html"`：发送 `Accept: text/html`
   - `format="text"`：发送 `Accept: text/plain`
2. 如果服务器支持 markdown，将返回 `Content-Type: text/markdown`
3. 工具直接使用 markdown 或纯文本内容，无需转换
4. 如果服务器返回 HTML，会将其转换为易读的文本格式以供 LLM 处理
5. 所有内容在交由 AI 模型处理前，都会被标准化为文本

### 优势

- **Token 效率：** markdown 内容通常比等效的 HTML 节省 80% 的 token
- **结构更优：** markdown 保留了语义结构（标题、列表等）
- **向后兼容：** 适用于所有网站，并为支持的服务器提供增强体验

### 支持 markdown 的示例服务器

- Cloudflare 开发者文档
- Cloudflare 博客
- 任何使用 Cloudflare "Markdown for Agents" 功能的网站