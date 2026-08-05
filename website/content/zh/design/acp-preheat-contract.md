# ACP 预热契约与兼容性

## 背景

守护进程暴露了 `POST /workspace/acp/preheat` 和
`GET /workspace/acp/status`，但已发布的客户端无法通过 `/capabilities` 发现这些路由。TypeScript SDK 默认还把这两个调用走其活动的 ACP 传输发送，尽管它们是守护进程 REST 控制面路由。最后，一个超时的 HTTP 等待器目前会清掉工作区服务共享的预热 promise，而底层的通道初始化还在继续。

本次改动让现有的主工作区路由可发现、可靠。它不引入持久的就绪状态，也不移动首个 Session 的屏障。Session 仍是权威操作：预热和 Session 创建通过桥接的共享通道初始化合并，且 Session 创建会在任何时点状态或预热响应之后重新校验通道。

## 能力与范围

守护进程广播两个常开的 v1 能力标签：

- `workspace_acp_preheat` 对应 `POST /workspace/acp/preheat`
- `workspace_acp_status` 对应 `GET /workspace/acp/status`

每个标签只表示对应名称的路由契约存在。两个标签都不表示 ACP 通道当前是活跃的。路由保持单数且仅限主工作区。客户端不得把它们用于次级工作区，也不得从次级工作区回退到主运行时。

带工作区限定的 ACP 预热需要独立的归属、信任、drain 和资源限额语义，不在本次改动范围内。

## 响应语义

`GET /workspace/acp/status` 返回一个时点快照：

```ts
{
  channelLive: boolean;
}
```

`POST /workspace/acp/preheat` 保持其现有响应形状：

```ts
interface WorkspaceAcpPreheatResult {
  ready: boolean;
  channelLive: boolean;
  durationMs: number;
  reason?: 'timeout' | 'error';
  error?: string;
}
```

以下不变量适用：

- `ready` 恒等于 `channelLive`。
- 活跃快照返回 `ready: true`，不带 `reason` 或 `error`。
- 等待器超时只在构建响应时通道仍不活跃的情况下返回 `reason: 'timeout'`。
- 初始化失败，或预热已解析但未产生活跃通道时，返回 `reason: 'error'`。
- `durationMs` 是用单调时钟测得的有限、非负整数。它是当前 HTTP 调用的耗时，而不是该调用可能加入的共享初始化的生存期。
- 客户端可见的错误文本稳定且经过清洗。详细的子进程错误留在守护进程日志中。

运维意义上的超时和初始化失败继续使用 HTTP 200，以便现有客户端检查结果。无效输入、认证、限流和延迟运行时启动失败保留其现有的 HTTP 错误契约。

## 并发与失败行为

工作区服务保持一个共享的预热 promise，直到该 promise 落定。每个请求都用自身的超时与同一个 promise 赛跑。等待器超时只结束该请求；它既不取消桥接操作，也不清除共享 promise。落定只在其标识仍与当前共享操作匹配时才清除 promise，因此较早的完成不会抹掉较新的尝试。

共享操作落定后，如果通道不活跃，后续请求可以重试。成功响应之后退出的通道不受租约保护：状态报告新的快照，下一个 Session 或预热启动新通道。

## 客户端兼容性

TypeScript SDK 无论配置了何种 ACP 传输，都通过其 REST fetch 路径发送这两个路由。它不会自动获取 capabilities；调用方自行决定何时做预检。

Web UI 只在其延迟、无会话的引导流程中使用这些路由。它要求 `workspace_acp_preheat`，把可选的状态优化门控在 `workspace_acp_status` 上，并要求生效工作区与 `capabilities.workspaceCwd` 精确匹配。精确比较可以保守地为主路径的另一种写法跳过预热，但它不可能预热到错误的运行时。

如果旧版守护进程缺少这些 capabilities，Web UI 不发起 ACP 状态或预热请求，首个 Session 走现有的惰性初始化路径。预热失败保持尽力而为，不会导致连接或 Session 创建失败。

## 非目标

- 在首个 Session 之前等待预热
- 把预热提前到守护进程或 Web UI 启动的更早阶段
- 就绪租约、generation、令牌或协议版本升级
- 在 HTTP 等待器超时时取消共享通道初始化
- 带工作区限定的 ACP 预热或状态路由
- 声称这个仅涉及契约的改动带来延迟改进
