# Token 缓存与成本优化

Qwen Code 在使用 API key 认证时（例如，与 OpenAI 兼容的提供商），会通过 token 缓存自动优化 API 成本。该功能通过复用之前的系统指令和上下文，减少后续请求中处理的 token 数量。

**支持 token 缓存的用户类型：**

- API key 用户（Qwen API key）
- Vertex AI 用户（已配置项目和区域）

**不支持 token 缓存的用户类型：**

- OAuth 用户（Google 个人/企业账户）——目前 Code Assist API 不支持创建缓存内容

你可以通过 `/stats` 命令查看 token 使用情况和缓存节省的 token 数。当有缓存 token 可用时，它们会显示在统计输出中。