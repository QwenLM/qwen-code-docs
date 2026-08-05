# 受信任的 daemon 调用上下文

## 目标

为一个被接受的根 prompt 携带 daemon 证明的身份信息，传递给 Qwen 通过
stdio 启动的 MCP 服务器。该上下文是关联元数据，而不是授权凭证。

完整的生产路径是：

```text
daemon prompt admission
  -> private ACP child
  -> root Session turn
  -> Qwen-launched stdio MCP tools/call request metadata
```

## 线级契约

Qwen 将以下值添加到 `tools/call.params._meta["qwen-code/invocation"]`：

```ts
interface InvocationContextV1 {
  version: 1;
  sessionId: string;
  promptId: string;
  originatorClientId?: string;
}
```

- `sessionId` 是请求路由所选择的存活 daemon 会话。
- `promptId` 在 daemon 准入该 prompt 时固定，早于它在按会话队列中等待的
  时间。非阻塞调用者可以提供现有终端事件匹配所使用的关联 id；否则 daemon
  生成一个 UUID。无论哪种情况，该值标识的都是 daemon 实际准入的 prompt，
  而不是从 prompt 正文复制的元数据。
- `originatorClientId` 在存在时，是 daemon 验证其已注册在该会话上之后的
  请求头值。
- 未知字段、未知版本和空白标识符都是无效的。

daemon 会移除调用者为保留元数据键提供的值，并从其自身状态重建上下文。
它只把该值传递给它自己启动并用按进程能力认证的 ACP 子进程。独立 ACP 调
用者无法注入保留的上下文。

## 生命周期与披露

ACP Session 验证上下文的会话与其实际会话匹配，并用 `AsyncLocalStorage`
将其绑定到根 prompt。并发的 prompt 保持隔离，包括在它们共享池化的 MCP
传输时。延迟的确认回调会显式恢复所捕获的上下文。

自动 cron 轮次、后台通知、恢复的后台代理，以及子代理推理循环，都在没有
调用上下文的情况下运行。根轮次落定之后，该上下文不会被持久化。

只有 Qwen 从 MCP `command` 配置创建为 `StdioClientTransport` 的传输实例
才会被标记为合格。HTTP、SSE、WebSocket、反向、SDK 提供和客户端托管的传
输不会收到该元数据。合格标记跟随工具发现、克隆、池化、重连和重试，而
不会成为公共的 MCP 配置选项。

## 非目标

- 没有 Browser Use、opencode、本地/远程后端、页面或 skill 特定的行为。
- 没有入口枚举或通用的 provenance 图。
- 没有新的 TypeScript SDK API 或 qwen-serve MCP 生命周期行为。
- 没有基于 `originatorClientId` 的授权决策。
