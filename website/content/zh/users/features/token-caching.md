# Token 缓存与成本优化

在使用 API Key 认证时，Qwen Code 会通过 Token 缓存自动优化 API 成本。该功能会缓存系统指令和对话历史等常用内容，从而减少后续请求中需要处理的 Token 数量。

## 主要收益

- **降低成本**：Token 用量减少，API 成本随之降低
- **响应更快**：缓存内容可被快速检索
- **自动优化**：无需任何配置，后台自动运行

## Token 缓存适用于

- API Key 用户（Qwen API Key、兼容 OpenAI 的提供商）

## 查看节省情况

使用 `/stats` 命令查看 Token 缓存带来的节省情况：

- 功能启用时，统计面板会显示有多少 Token 来自缓存
- 你可以同时看到缓存 Token 的具体数量和百分比
- 示例：“10,500 (90.4%) 的输入 Token 来自缓存，已降低成本。”

该信息仅在使用缓存 Token 时显示。此功能适用于 API Key 认证，不适用于 OAuth 认证。

## 统计信息示例

![Qwen Code 统计信息展示](https://img.alicdn.com/imgextra/i3/O1CN01F1yzRs1juyZu63jdS_!!6000000004609-2-tps-1038-738.png)

上图展示了 `/stats` 命令的输出示例，重点标出了 Token 缓存的节省信息。