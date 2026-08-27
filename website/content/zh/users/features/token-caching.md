# Token 缓存与成本优化

Qwen Code 在使用 API key 认证时会自动通过 token 缓存来优化 API 成本。该功能会缓存频繁使用的内容（如系统指令和对话历史），从而减少后续请求中需要处理的 token 数量。

## 为您带来的好处

- **降低成本**：更少的 token 意味着更低的 API 费用
- **响应更快**：缓存的内容可以更快被检索
- **自动优化**：无需配置，在后台自动运行

## Token 缓存适用于

- API key 用户（Qwen API key、兼容 OpenAI 的提供商）

## 监控您的节省情况

使用 `/stats` 命令查看缓存的 token 节省量：

- 当缓存生效时，统计信息会显示从缓存中提供的 token 数量
- 您会看到缓存的 token 绝对数量和百分比
- 示例："10,500 个输入 token（90.4%）来自缓存，从而降低了成本。"

此信息仅在使用了缓存的 token 时显示，这在使用 API key 认证时发生，而 OAuth 认证则不会。

## 统计信息显示示例

![Qwen Code 统计信息显示](https://img.alicdn.com/imgextra/i3/O1CN01F1yzRs1juyZu63jdS_!!6000000004609-2-tps-1038-738.png)

上图展示了 `/stats` 命令输出的示例，其中突出显示了缓存的 token 节省信息。