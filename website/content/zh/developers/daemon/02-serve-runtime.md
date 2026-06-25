# Serve Runtime

## 概述

`packages/cli/src/serve/` 是 `qwen serve` 的启动层。它将 CLI flags 转换为 `ServeOptions`，验证启动配置，构建 Express 应用，串联中间件，注册路由，暴露 daemon-host 预检/状态提供者，维护权限审计环，并负责两阶段优雅关闭流程。面向 HTTP 的工作在此层处理；面向 ACP 的工作在下一层 `@qwen-code/acp-bridge` 中处理（参见 [`03-acp-bridge.md`](./03-acp-bridge.md)）。

## 职责

- 解析并验证 `ServeOptions`：监听地址、认证、工作区、session / 连接上限、MCP budget / 连接池、CORS、prompt / SSE / session 空闲超时、限流及相关开关。
- **规范化**绑定的工作区（仅执行一次）。同一规范形式被 `/capabilities`、`POST /session` 回退逻辑和 bridge 共用。
- 拒绝不安全或无效的启动配置：非回环地址绑定但无 token、`--require-auth` 但无 token、`--allow-origin '*'` 但无 token、`mcpBudgetMode='enforce'` 但未设置正整数 `mcpClientBudget`、`--workspace` 指向不存在的路径或非目录，以及无效的超时或限流值。
- 构建 `WorkspaceFileSystem` 工厂、权限审计发布者、`DaemonStatusProvider` 和 `acp-bridge`。
- 构建 Express 应用，串联中间件（`denyBrowserOriginCors` / `allowOriginCors` -> `hostAllowlist` -> 访问日志 -> `bearerAuth` -> 限流 -> JSON 解析 -> 遥测 -> 各路由 `mutationGate`），并挂载 session、工作区 CRUD、文件、device-flow 认证、权限投票和 ACP HTTP 路由。
- 绑定监听端口并注册信号处理器。
- 在收到 SIGINT/SIGTERM 时执行两阶段关闭；收到第二次信号时强制退出。

## 架构

**入口**：`packages/cli/src/serve/run-qwen-serve.ts` 中的 `runQwenServe(opts, deps)`。返回 `RunHandle`（`{ url, port, close, ... }`）。

**应用工厂**：`packages/cli/src/serve/server.ts` 中的 `createServeApp(opts, getPort, deps)`。构建 Express `Application`。直接嵌入方和测试可不经过启动包装器直接调用它。

**能力注册表**：`packages/cli/src/serve/capabilities.ts` 中的 `SERVE_CAPABILITY_REGISTRY`。每个标签都有 `since` 版本和可选的 `modes`。十个条件标签（`require_auth`、`mcp_workspace_pool`、`mcp_pool_restart`、`allow_origin`、`prompt_absolute_deadline`、`writer_idle_timeout`、`workspace_settings`、`session_shell_command`、`rate_limit`、`workspace_reload`）在对应开关关闭时会被省略。参见 [`11-capabilities-versioning.md`](./11-capabilities-versioning.md)。

**中间件**（`packages/cli/src/serve/auth.ts` 和 `server.ts`）：

| 中间件（按注册顺序）                        | 用途                                                                                                                | 备注                                                                                              |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `denyBrowserOriginCors` / `allowOriginCors` | 默认拒绝所有 `Origin` 请求头；配置 `--allow-origin <pattern>` 后切换为白名单模式。                                  | 参见 [`12-auth-security.md`](./12-auth-security.md)。                                             |
| `hostAllowlist(bind, getPort)`              | 在回环地址上，验证 `Host` 是否属于 `localhost`、`127.0.0.1`、`[::1]` 或 `host.docker.internal` 加实际端口。        | 防御 DNS 重绑定攻击。比较不区分大小写，并按端口缓存结果。                                         |
| 访问日志中间件                              | 请求结束时将 method、path、status、durationMs、sessionId 和 clientId 记录到 `DaemonLogger`。                        | 注册在 `bearerAuth` **之前**，因此 401 拒绝也会被记录。跳过 `/health` 和心跳请求。               |
| `bearerAuth(token)`                         | 使用 SHA-256 和 `timingSafeEqual` 进行常数时间 bearer 比较。                                                        | 未配置 token 时为透传模式（回环开发默认）。`Bearer` scheme 不区分大小写。                         |
| 限流中间件                                  | 可选的按 tier 划分的 token bucket，适用于 prompt、mutation 和 read 路由。                                           | 在 `bearerAuth` 之后、JSON 解析之前注册；bucket 耗尽时在解析前返回 429。                          |
| `express.json({ limit: '10mb' })`           | JSON body 解析。                                                                                                    | 解析错误返回 400。                                                                                |
| `daemonTelemetryMiddleware`                 | 通过 `withDaemonRequestSpan` 将每个 HTTP 请求包装在 OpenTelemetry span 中。                                         | 属性包括 route、sessionId、clientId 和 status code。                                              |
| `createMutationGate`（各路由单独配置）      | 路由级可选门控，用于需要 token 的 mutation 路由（即使在回环地址上也要求 token）。                                   | 返回 `401 { code: 'token_required' }`。非全局 `app.use`；路由按需调用 `mutate({ strict: true })`。|

**子系统**：

| 路径                                                             | 作用                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `serve/fs/`                                                      | `WorkspaceFileSystem` 工厂加 `policy.ts`（大小/信任/二进制检查）、`paths.ts`（规范化、resolveWithin、符号链接拒绝）、`audit.ts` 和类型化 `FsError` 值。                                                                                                                                                                                                                                                                                                       |
| `serve/routes/workspace-file-read.ts`、`workspace-file-write.ts` | `GET /file`、`GET /file/bytes`、`POST /file/write` 和 `POST /file/edit` 的 HTTP 处理器。                                                                                                                                                                                                                                                                                                                                                                     |
| `serve/workspace-memory.ts`                                      | `GET/POST /workspace/memory`（QWEN.md CRUD）。                                                                                                                                                                                                                                                                                                                                                                                                               |
| `serve/workspace-agents.ts`                                      | `GET/POST/DELETE /workspace/agents`（子 agent CRUD）。                                                                                                                                                                                                                                                                                                                                                                                                        |
| `serve/daemon-status-provider.ts`                                | 环境快照加 daemon-host 预检单元：Node 版本、CLI 入口、工作区 stat、ripgrep、git、npm。                                                                                                                                                                                                                                                                                                                                                                        |
| `serve/permission-audit.ts`                                      | `PermissionAuditRing`（512 条 FIFO）和 `createPermissionAuditPublisher`。                                                                                                                                                                                                                                                                                                                                                                                    |
| `serve/auth/device-flow.ts`、`qwen-device-flow-provider.ts`      | Device-flow OAuth 路由。参见 [`12-auth-security.md`](./12-auth-security.md)。                                                                                                                                                                                                                                                                                                                                                                                |
| `serve/daemon-logger.ts`                                         | `DaemonLogger` 结构化文件日志。参见 [`19-observability.md`](./19-observability.md)。                                                                                                                                                                                                                                                                                                                                                                         |
| `serve/debug-mode.ts`                                            | 共享的 `isServeDebugMode()` 谓词，控制 HTTP 响应中是否输出详细错误上下文。                                                                                                                                                                                                                                                                                                                                                                                   |
| `serve/acp-http/`                                                | ACP Streamable HTTP 传输（RFD #721），挂载于 `/acp`。七个文件实现 JSON-RPC POST、SSE GET、DELETE 拆除，以及与 REST 接口并行的共享 bridge 使用。                                                                                                                                                                                                                                                                                                               |
| `serve/demo.ts`                                                  | `GET /demo` 的自包含内联 HTML：带聊天 UI、事件日志和工作区检查器的浏览器调试控制台。在回环且无 `--require-auth` 时，注册在 `bearerAuth` **之前**；在非回环或有 `--require-auth` 时，注册在 `bearerAuth` **之后**。CSP 为 `default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; frame-ancestors 'none'`，加 `X-Frame-Options: DENY`。 |

**兼容旧版 F1 前导入路径的重导出 shim**：

- `serve/event-bus.ts` -> `@qwen-code/acp-bridge/eventBus`
- `serve/status.ts` -> `@qwen-code/acp-bridge/status`
- `serve/httpAcpBridge.ts` -> `@qwen-code/acp-bridge`

## 流程

### 启动序列

1. **从 `opts.token` 或 `QWEN_SERVER_TOKEN` 解析并裁剪 token**；这可以避免 `cat token.txt` 产生的末尾换行符静默破坏 bearer 比较。
2. **hostname 拼写错误防护**：`--hostname localhost:4170` 会报错并建议改用 `--port`。
3. **认证预检**：非回环地址但无 token 则拒绝；`--require-auth` 但无 token 则拒绝。
4. **工作区验证**：必须是绝对路径、存在且为目录。`EACCES` / `EPERM` 被包装为指向该 flag 的错误。
5. **规范化工作区**：`canonicalizeWorkspace(rawWorkspace)` 执行一次 `realpathSync.native`，结果提供给 `/capabilities`、`POST /session` 回退逻辑和 bridge 使用。
6. **MCP budget 验证**：必须为正整数；`enforce` 模式要求设置 budget。
7. **MCP 连接池开关推断**：父进程环境变量 `QWEN_SERVE_NO_MCP_POOL=1` 使 `mcpPoolActive=false`，能力响应中也将诚实地省略 `mcp_workspace_pool` 和 `mcp_pool_restart`。
8. **CORS / 超时 / 限流验证**：`--allow-origin '*'` 需要 token；prompt、writer、channel idle、session idle、reaper 和限流窗口值无效时立即失败。
9. **每个 handle 的 `childEnvOverrides`**：通过 `BridgeOptions.childEnvOverrides` 将 `QWEN_SERVE_MCP_CLIENT_BUDGET` 和 `QWEN_SERVE_MCP_BUDGET_MODE` 传递给 ACP 子进程，而不是修改 `process.env`。
10. **一次性加载 `settings.json`**：读取 `context.fileName`、`policy.permissionStrategy` 和 `policy.consensusQuorum`。文件损坏时回退到默认值。`validatePolicyConfig()` 会将 `policy.*` 与 `SERVE_CAPABILITY_REGISTRY.permission_mediation.modes` 对比检查；未知策略或非正整数 `consensusQuorum` 会抛出 `InvalidPolicyConfigError`。在非 `consensus` 策略下设置 quorum 会在 stderr 打印警告。
11. **分配 `PermissionAuditRing`**（512 条）。
12. **构建 `fsFactory`**：`runQwenServe` 默认使用 `trusted: true`；直接调用 `createServeApp` 的调用方默认使用 `trusted: false`，并打印一次警告。
13. **`createHttpAcpBridge`**，参见 [`03-acp-bridge.md`](./03-acp-bridge.md)。
14. **`createServeApp`** 组装 Express。
15. **`server.listen(port, hostname)`**，然后解析实际的 `getPort()` 供 host 白名单使用。
16. **注册 SIGINT / SIGTERM 处理器**以执行优雅关闭。

### 优雅关闭

1. **第一阶段 - bridge 拆除**（首次收到信号时）：
   - 销毁 device-flow 注册表并取消待处理的流程。
   - `bridge.shutdown()` 将每个 channel 标记为 `isDying = true`，向每个 ACP 子进程 stdin 发送优雅关闭信号，每个 channel 等待 `KILL_HARD_DEADLINE_MS`（10s），超时后调用 `channel.kill()`。
2. **第二阶段 - HTTP 拆除**：
   - `server.close()` 停止接受新连接，让进行中的请求完成。
   - `SHUTDOWN_FORCE_CLOSE_MS`（5s）触发 `server.closeAllConnections()`。
   - 若仍需要，2s 后再次升级处理。
3. **退出过程中再次收到信号**：
   - `bridge.killAllSync()` + `process.exit(1)`，避免孤立子进程阻塞 daemon 退出。

## 状态与生命周期

`RunHandle` 暴露：

- `url`：解析后的监听 URL，包含临时端口解析结果。
- `port`：实际端口，包含 `0` 的解析结果。
- `close({ timeoutMs? })`：供嵌入方和测试使用的程序化关闭接口。

直接调用 `createServeApp` 只返回 `Application`；嵌入方自行负责 `listen` 和关闭。

## 依赖

| `serve/` 使用的上游依赖                                                                         | 使用 `serve/` 的下游                      |
| ----------------------------------------------------------------------------------------------- | ----------------------------------------- |
| `@qwen-code/acp-bridge`：bridge、event bus、status 类型                                         | `qwen` CLI 的 `serve` 子命令处理器        |
| `packages/core`：`loadSettings`、`getCurrentGeminiMdFilename`、`Config`、`WorkspaceContext`     | 直接嵌入方、测试                          |
| ACP SDK（`@agentclientprotocol/sdk`）：`PROTOCOL_VERSION`、通过 bridge 的 `ClientSideConnection` |                                           |
| Express + body-parser、`node:crypto`、`node:fs`、`node:path`                                    |                                           |

## 配置

| 来源            | 键                                                                                              | 效果                                                                                                  |
| --------------- | ----------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| 环境变量        | `QWEN_SERVER_TOKEN`                                                                             | 裁剪后的 bearer token。                                                                               |
| 环境变量        | `QWEN_SERVE_NO_MCP_POOL=1`                                                                      | 强制 `mcpPoolActive=false`。                                                                          |
| ACP 子进程环境变量 | `QWEN_SERVE_MCP_CLIENT_BUDGET` / `QWEN_SERVE_MCP_BUDGET_MODE`                               | 由 `--mcp-client-budget` / `--mcp-budget-mode` 生成并通过 `childEnvOverrides` 转发。                   |
| 环境变量        | `QWEN_SERVE_PROMPT_DEADLINE_MS` / `QWEN_SERVE_WRITER_IDLE_TIMEOUT_MS`                           | 默认 prompt / SSE 空闲超时。                                                                          |
| 环境变量        | `QWEN_SERVE_RATE_LIMIT*`                                                                        | 限流开关、prompt / mutation / read 上限和默认窗口。                                                   |
| 环境变量        | `QWEN_SERVE_DEBUG=1`                                                                            | 详细 stderr 日志。参见 [`19-observability.md`](./19-observability.md)。                               |
| Flags           | `--hostname`、`--port`                                                                          | 监听绑定。                                                                                            |
| Flags           | `--token`、`--require-auth`、`--enable-session-shell`                                           | Bearer token、回环认证加固和显式 shell 执行开关。                                                     |
| Flag            | `--workspace`                                                                                   | 覆盖 `process.cwd()`。                                                                               |
| Flags           | `--max-sessions`、`--max-pending-prompts-per-session`、`--max-connections`、`--event-ring-size` | Bridge / Express 上限。                                                                               |
| Flags           | `--mcp-client-budget=N`、`--mcp-budget-mode={off,warn,enforce}`                                 | 转发给 ACP 子进程。                                                                                   |
| Flags           | `--allow-origin`、`--allow-private-auth-base-url`                                               | 浏览器 CORS 白名单和 localhost/私有认证提供者安装开关。                                               |
| Flags           | `--prompt-deadline-ms`、`--writer-idle-timeout-ms`、`--channel-idle-timeout-ms`                 | Prompt、SSE writer 和 ACP 子进程空闲生命周期控制。                                                    |
| Flags           | `--session-reap-interval-ms`、`--session-idle-timeout-ms`                                       | 已断连 session 的回收控制。                                                                           |
| Flags           | `--rate-limit*`                                                                                 | 按 tier 划分的 HTTP 限流。                                                                            |
| `settings.json` | `policy.permissionStrategy`、`policy.consensusQuorum`                                           | `MultiClientPermissionMediator` 策略和 quorum。                                                       |
| `settings.json` | `context.fileName`                                                                              | bridge 的 `getCurrentGeminiMdFilename` 覆盖。                                                         |

参见 [`17-configuration.md`](./17-configuration.md) 了解合并后的完整参考。

## 注意事项与已知限制

- 直接调用 `createServeApp` 但未传入 `deps.fsFactory` 或 `deps.bridge` 时，默认使用 `trusted: false`；agent 侧 ACP 的 `writeTextFile` 会以 `untrusted_workspace` 拒绝。警告仅打印一次。
- `denyBrowserOriginCors` 拒绝**所有**携带 `Origin` 的请求；demo 页面之所以能正常工作，是因为另一个中间件会先剥离匹配的同源值。
- Body-parser 顺序：使用 `mutate({ strict: true })` 的路由只在 `express.json()` 之后才返回 401。最坏情况是 `--max-connections × express.json({limit: '10mb'})`，在饱和的回环监听器上可达约 2.5 GB 瞬时内存；这是有意为之的权衡。
- 同一进程中的多个 daemon 必须使用各自 handle 的 `childEnvOverrides`；直接修改 `process.env` 存在竞态，因为 `defaultSpawnChannelFactory` 在 spawn 时对 env 做快照。

## 参考资料

- `packages/cli/src/serve/run-qwen-serve.ts`（启动引导、启动验证、优雅关闭）
- `packages/cli/src/serve/server.ts`（`createServeApp()`、中间件与路由组装）
- `packages/cli/src/serve/auth.ts`（CORS、Host 白名单、bearer 认证、mutation gate）
- `packages/cli/src/serve/rate-limit.ts`（按 tier 划分的 HTTP 限流）
- `packages/cli/src/serve/capabilities.ts`（能力注册表与条件广播）
- `packages/cli/src/serve/types.ts`（`ServeOptions`、`CapabilitiesEnvelope`）
- `packages/cli/src/serve/daemon-status-provider.ts`
- `packages/cli/src/serve/permission-audit.ts`
- Issues: [#3803](https://github.com/QwenLM/qwen-code/issues/3803)、[#4175](https://github.com/QwenLM/qwen-code/issues/4175)
