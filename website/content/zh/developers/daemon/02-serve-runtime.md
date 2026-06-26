# 服务运行时

## 概述

`packages/cli/src/serve/` 是 `qwen serve` 的引导层。它将 CLI 参数转换为 `ServeOptions`，验证启动配置，构建 Express 应用，挂载中间件，注册路由，暴露守护进程预检/状态提供者，维护权限审计环，并拥有两阶段优雅关闭序列。与 HTTP 相关的工作位于此层；与 ACP 相关的工作位于下一层的 `@qwen-code/acp-bridge`（参见 [`03-acp-bridge.md`](./03-acp-bridge.md)）。

## 职责

- 解析并验证 `ServeOptions`：监听地址、认证、工作空间、会话/连接上限、MCP 预算/池、CORS、提示/SSE/会话空闲超时、速率限制及相关开关。
- **标准化**绑定的工作空间，仅执行一次。标准化的结果被 `/capabilities`、`POST /session` 回退逻辑以及桥接器共享。
- 拒绝不安全或无效的启动配置：无令牌的非回环绑定、有`--require-auth` 但无令牌、`--allow-origin '*'` 但无令牌、`mcpBudgetMode='enforce'` 但未设置正数 `mcpClientBudget`、不存在的或非目录的 `--workspace`、无效的超时或速率限制值。
- 构造 `WorkspaceFileSystem` 工厂、权限审计发布者、`DaemonStatusProvider` 以及 `acp-bridge`。
- 构建 Express 应用，挂载中间件（`denyBrowserOriginCors` / `allowOriginCors` -> `hostAllowlist` -> 访问日志 -> `bearerAuth` -> 速率限制 -> JSON 解析 -> 遥测 -> 每个路由的 `mutationGate`），并挂载会话、工作空间 CRUD、文件、设备流认证、权限投票和 ACP HTTP 路由。
- 绑定监听端口并注册信号处理函数。
- 在 SIGINT/SIGTERM 时运行两阶段关闭；收到第二个信号时强制退出。

## 架构

**入口**：`packages/cli/src/serve/run-qwen-serve.ts` 中的 `runQwenServe(opts, deps)`。返回一个 `RunHandle`（`{ url, port, close, ... }`）。

**应用工厂**：`packages/cli/src/serve/server.ts` 中的 `createServeApp(opts, getPort, deps)`。构建 Express `Application`。直接嵌入者和测试可以直接调用此函数，无需引导包装。

**能力注册表**：`packages/cli/src/serve/capabilities.ts` 中的 `SERVE_CAPABILITY_REGISTRY`。每个标签都有 `since` 版本和可选的 `modes`。十个条件标签（`require_auth`、`mcp_workspace_pool`、`mcp_pool_restart`、`allow_origin`、`prompt_absolute_deadline`、`writer_idle_timeout`、`workspace_settings`、`session_shell_command`、`rate_limit`、`workspace_reload`）在对应的开关关闭时被省略。参见 [`11-capabilities-versioning.md`](./11-capabilities-versioning.md)。

**中间件**（`packages/cli/src/serve/auth.ts` 和 `server.ts`）：

| 中间件（按注册顺序） | 目的 | 备注 |
| --- | --- | --- |
| `denyBrowserOriginCors` / `allowOriginCors` | 默认拒绝所有 `Origin` 头；当配置了 `--allow-origin <pattern>` 时切换到允许列表。 | 参见 [`12-auth-security.md`](./12-auth-security.md)。 |
| `hostAllowlist(bind, getPort)` | 在回环上，验证 `Host` 属于 `localhost`、`127.0.0.1`、`[::1]` 或 `host.docker.internal` 加上实际端口。 | 防御 DNS 重新绑定。比较不区分大小写，并按端口缓存。 |
| 访问日志中间件 | 在请求完成时记录方法、路径、状态码、持续时间（ms）、sessionId 和 clientId 到 `DaemonLogger`。 | 在 `bearerAuth` **之前**注册，因此 401 拒绝也会被记录。跳过 `/health` 和心跳。 |
| `bearerAuth(token)` | SHA-256 加 `timingSafeEqual` 常量时间 bearer 比较。 | 未配置令牌时（回环开发默认）开放放行。`Bearer` 方案不区分大小写。 |
| 速率限制中间件 | 可选的每层令牌桶：提示、变更、读取路由。 | 在 `bearerAuth` 之后、JSON 解析之前注册；当令牌桶耗尽时，在解析之前返回 429。 |
| `express.json({ limit: '10mb' })` | JSON 主体解析。 | 解析错误返回 400。 |
| `daemonTelemetryMiddleware` | 通过 `withDaemonRequestSpan` 将每个 HTTP 请求包装为 OpenTelemetry span。 | 属性包括路由、sessionId、clientId 和状态码。 |
| `createMutationGate`（每个路由） | 针对需变更的路由、即使在回环上也需要令牌的路由级可选门控。 | 返回 `401 { code: 'token_required' }`。不是全局 `app.use`；路由根据需要调用 `mutate({ strict: true })`。 |

**子系统**：

| 路径 | 角色 |
| --- | --- |
| `serve/fs/` | `WorkspaceFileSystem` 工厂，加上 `policy.ts`（大小/信任/二进制检查）、`paths.ts`（规范化、resolveWithin、符号链接拒绝）、`audit.ts` 以及类型化的 `FsError` 值。 |
| `serve/routes/workspace-file-read.ts`、`workspace-file-write.ts` | `GET /file`、`GET /file/bytes`、`POST /file/write` 和 `POST /file/edit` 的 HTTP 处理器。 |
| `serve/workspace-memory.ts` | `GET/POST /workspace/memory`（QWEN.md CRUD）。 |
| `serve/workspace-agents.ts` | `GET/POST/DELETE /workspace/agents`（子代理 CRUD）。 |
| `serve/daemon-status-provider.ts` | 环境快照加守护进程预检信息：Node 版本、CLI 入口、工作空间状态、ripgrep、git、npm。 |
| `serve/permission-audit.ts` | `PermissionAuditRing`（512 条 FIFO）和 `createPermissionAuditPublisher`。 |
| `serve/auth/device-flow.ts`、`qwen-device-flow-provider.ts` | 设备流 OAuth 路由。参见 [`12-auth-security.md`](./12-auth-security.md)。 |
| `serve/daemon-logger.ts` | `DaemonLogger` 结构化文件日志。参见 [`19-observability.md`](./19-observability.md)。 |
| `serve/debug-mode.ts` | 共享的 `isServeDebugMode()` 断言，控制 HTTP 响应中详细错误上下文的显示。 |
| `serve/acp-http/` | ACP Streamable HTTP 传输（RFD #721），挂载在 `/acp` 下。七个文件实现了 JSON-RPC POST、SSE GET、DELETE 拆除，以及与 REST 表面并行的共享桥接器使用。 |
| `serve/demo.ts` | 自包含内联 HTML，用于 `GET /demo`：浏览器调试控制台，带有聊天 UI、事件日志和工作空间检查器。在回环且没有 `--require-auth` 时，它在 `bearerAuth` **之前**注册；在非回环或有 `--require-auth` 时，它在 `bearerAuth` **之后**注册。提供 CSP `default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; frame-ancestors 'none'` 以及 `X-Frame-Options: DENY`。 |

**重导出 shim**，用于兼容 F1 之前的导入路径：

- `serve/event-bus.ts` -> `@qwen-code/acp-bridge/eventBus`
- `serve/status.ts` -> `@qwen-code/acp-bridge/status`
- `serve/httpAcpBridge.ts` -> `@qwen-code/acp-bridge`

## 流程

### 启动序列

1. **解析并裁剪令牌**：从 `opts.token` 或 `QWEN_SERVER_TOKEN` 中读取；这样可避免 `cat token.txt` 产生的尾部换行符悄悄破坏 bearer 比较。
2. **主机名拼写错误防护**：`--hostname localhost:4170` 会报错并建议使用 `--port`。
3. **认证预检**：非回环绑定且无令牌时拒绝；`--require-auth` 但无令牌时拒绝。
4. **工作空间验证**：绝对路径、存在、是目录。`EACCES`/`EPERM` 会被包装以指向标志。
5. **标准化工作空间**：`canonicalizeWorkspace(rawWorkspace)` 运行一次 `realpathSync.native`，并将结果提供给 `/capabilities`、`POST /session` 回退和桥接器。
6. **MCP 预算验证**：必须为正整数；`enforce` 模式需要设定预算。
7. **MCP 池开关推断**：父环境变量 `QWEN_SERVE_NO_MCP_POOL=1` 会使 `mcpPoolActive=false`，从而能力列表如实省略 `mcp_workspace_pool` 和 `mcp_pool_restart`。
8. **CORS / 超时 / 速率限制验证**：`--allow-origin '*'` 需要令牌；提示、写入端、通道空闲、会话空闲、回收器和速率限制窗口值若无效则快速失败。
9. **每个句柄的 `childEnvOverrides`**：通过 `BridgeOptions.childEnvOverrides` 将 `QWEN_SERVE_MCP_CLIENT_BUDGET` 和 `QWEN_SERVE_MCP_BUDGET_MODE` 传递给 ACP 子进程，而不是修改 `process.env`。
10. **加载一次 `settings.json`**：读取 `context.fileName`、`policy.permissionStrategy` 和 `policy.consensusQuorum`。损坏的文件回退到默认值。`validatePolicyConfig()` 检查 `policy.*` 是否位于 `SERVE_CAPABILITY_REGISTRY.permission_mediation.modes` 中；未知策略或非正数的 `consensusQuorum` 会抛出 `InvalidPolicyConfigError`。在非 `consensus` 策略下设置法定人数时，会在 stderr 上输出警告。
11. **分配 `PermissionAuditRing`**（512 条）。
12. **构建 `fsFactory`**：`runQwenServe` 默认 `trusted: true`；直接调用 `createServeApp` 的调用者默认 `trusted: false` 并输出一次警告。
13. **`createHttpAcpBridge`**，参见 [`03-acp-bridge.md`](./03-acp-bridge.md)。
14. **`createServeApp`** 组装 Express。
15. **`server.listen(port, hostname)`**，然后解析实际的 `getPort()` 用于主机允许列表。
16. **注册 SIGINT / SIGTERM 处理函数**以便优雅关闭。

### 优雅关闭

1. **阶段 1 - 桥接器拆除**（首次信号时）：
   - 释放设备流注册表并取消待处理的流。
   - `bridge.shutdown()` 将每个通道标记为 `isDying = true`，向每个 ACP 子进程的 stdin 发送优雅关闭消息，等待 `KILL_HARD_DEADLINE_MS`（10 秒）每通道，然后在必要时调用 `channel.kill()`。
2. **阶段 2 - HTTP 拆除**：
   - `server.close()` 停止接受新连接，并让正在处理的请求完成。
   - `SHUTDOWN_FORCE_CLOSE_MS`（5 秒）触发 `server.closeAllConnections()`。
   - 如果需要，另一个 2 秒的截止时间会再次升级。
3. **在退出过程中收到第二个信号**：
   - `bridge.killAllSync()` + `process.exit(1)`，以避免孤儿子进程阻止守护进程退出。

## 状态与生命周期

`RunHandle` 暴露：

- `url`：解析后的监听 URL（在临时端口解析后）。
- `port`：实际端口，包含 `0` 的解析结果。
- `close({ timeoutMs? })`：程序化关闭，供嵌入者和测试使用。

直接调用 `createServeApp` 仅返回一个 `Application`；嵌入者负责 `listen` 和关闭。

## 依赖关系

| `serve/` 使用的上游 | 使用 `serve/` 的下游 |
| --- | --- |
| `@qwen-code/acp-bridge`：桥接器、事件总线、状态类型 | `qwen` CLI 的 `serve` 子命令处理器 |
| `packages/core`：`loadSettings`、`getCurrentGeminiMdFilename`、`Config`、`WorkspaceContext` | 直接嵌入者、测试 |
| ACP SDK (`@agentclientprotocol/sdk`)：通过桥接器使用 `PROTOCOL_VERSION`、`ClientSideConnection` | |
| Express + body-parser、`node:crypto`、`node:fs`、`node:path` | |

## 配置

| 来源 | 键 | 效果 |
| --- | --- | --- |
| 环境变量 | `QWEN_SERVER_TOKEN` | 裁剪后的 Bearer 令牌。 |
| 环境变量 | `QWEN_SERVE_NO_MCP_POOL=1` | 强制 `mcpPoolActive=false`。 |
| ACP 子进程环境 | `QWEN_SERVE_MCP_CLIENT_BUDGET` / `QWEN_SERVE_MCP_BUDGET_MODE` | 从 `--mcp-client-budget` / `--mcp-budget-mode` 生成，通过 `childEnvOverrides` 转发。 |
| 环境变量 | `QWEN_SERVE_PROMPT_DEADLINE_MS` / `QWEN_SERVE_WRITER_IDLE_TIMEOUT_MS` | 默认的提示/SSE 空闲超时。 |
| 环境变量 | `QWEN_SERVE_RATE_LIMIT*` | 速率限制开关、提示/变更/读取上限以及窗口默认值。 |
| 环境变量 | `QWEN_SERVE_DEBUG=1` | 详细信息输出到 stderr。参见 [`19-observability.md`](./19-observability.md)。 |
| 标志 | `--hostname`、`--port` | 监听绑定。 |
| 标志 | `--token`、`--require-auth`、`--enable-session-shell` | Bearer 令牌、回环认证强化及显式 shell 执行开关。 |
| 标志 | `--workspace` | 覆盖 `process.cwd()`。 |
| 标志 | `--max-sessions`、`--max-pending-prompts-per-session`、`--max-connections`、`--event-ring-size` | 桥接器/Express 上限。 |
| 标志 | `--mcp-client-budget=N`、`--mcp-budget-mode={off,warn,enforce}` | 转发给 ACP 子进程。 |
| 标志 | `--allow-origin`、`--allow-private-auth-base-url` | 浏览器 CORS 允许列表及 localhost/private 认证提供者安装开关。 |
| 标志 | `--prompt-deadline-ms`、`--writer-idle-timeout-ms`、`--channel-idle-timeout-ms` | 提示、SSE 写入端和 ACP 子进程空闲生命周期控制。 |
| 标志 | `--session-reap-interval-ms`、`--session-idle-timeout-ms` | 断开会话的回收控制。 |
| 标志 | `--rate-limit*` | 每层 HTTP 速率限制。 |
| `settings.json` | `policy.permissionStrategy`、`policy.consensusQuorum` | `MultiClientPermissionMediator` 策略和法定人数。 |
| `settings.json` | `context.fileName` | 桥接器的 `getCurrentGeminiMdFilename` 覆盖。 |
参见 [`17-configuration.md`](./17-configuration.md) 获取合并后的参考文档。

## 注意事项和已知限制

- 直接使用 `createServeApp` 且未提供 `deps.fsFactory` 或 `deps.bridge` 时，默认 `trusted: false`；agent 端的 ACP `writeTextFile` 会因 `untrusted_workspace` 被拒绝。该警告仅打印一次。
- `denyBrowserOriginCors` 会拒绝**所有**携带 `Origin` 的请求；演示页面能正常工作是因为另一个中间件会先剥离匹配的同源值。
- Body-parser 顺序：使用 `mutate({ strict: true })` 的路由只有在 `express.json()` 之后才会返回 401。最坏情况是 `--max-connections × express.json({limit: '10mb'})`，在饱和的回环监听器上会产生最多约 2.5 GB 的瞬时内存；这种权衡是有意为之。
- 同一进程中的多个守护进程必须使用每个句柄独立的 `childEnvOverrides`；直接修改 `process.env` 存在竞态条件，因为 `defaultSpawnChannelFactory` 会在 spawn 时快照环境变量。

## 参考资料

- `packages/cli/src/serve/run-qwen-serve.ts`（引导、启动验证、优雅关闭）
- `packages/cli/src/serve/server.ts`（`createServeApp()`，中间件和路由组装）
- `packages/cli/src/serve/auth.ts`（CORS、Host 白名单、Bearer 认证、变异门控）
- `packages/cli/src/serve/rate-limit.ts`（分层 HTTP 速率限制）
- `packages/cli/src/serve/capabilities.ts`（能力注册和条件公告）
- `packages/cli/src/serve/types.ts`（`ServeOptions`，`CapabilitiesEnvelope`）
- `packages/cli/src/serve/daemon-status-provider.ts`
- `packages/cli/src/serve/permission-audit.ts`
- Issues: [#3803](https://github.com/QwenLM/qwen-code/issues/3803), [#4175](https://github.com/QwenLM/qwen-code/issues/4175)