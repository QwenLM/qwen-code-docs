# Serve 运行时

## 概述

`packages/cli/src/serve/` 是 `qwen serve` 的启动层。它将 CLI 标志转换为 `ServeOptions`，验证启动配置，构建 Express 应用，连接中间件，注册路由，暴露守护进程主机的预检/状态提供者，维护权限审计环，并负责两阶段优雅关闭序列。面向 HTTP 的工作在此层进行；面向 ACP 的工作在下一层的 `@qwen-code/acp-bridge` 中进行（参见 [`03-acp-bridge.md`](./03-acp-bridge.md)）。

## 职责

- 解析并验证 `ServeOptions`：监听地址、认证、工作区、会话/连接上限、MCP 预算/池、CORS、prompt/SSE/会话空闲超时、速率限制及相关开关。
- 对主工作区进行**规范化**处理，且仅执行一次；在注册会话运行时之前，对每个重复的 `--workspace` 也进行规范化。主规范化形式由 `/capabilities.workspaceCwd`、`POST /session` 回退机制和主 bridge 共享。
- 解析 bearer：依次检查 `--token`、`QWEN_SERVER_TOKEN`，当两者均不存在且请求的 `--hostname` 为非环回地址（字面量 `localhost` 优先按自身解析）时，生成一个临时的 128 位 base64url bearer（22 个字符），并在启动时打印一次。环回拼写形式永不生成 token，并保持受信任的无 token 模式，除非设置了 `--require-auth`。生成依据拼写形式决定密钥，而启动拒绝检查则依据解析后的地址，这产生两种特殊情况：解析到非环回地址的 `localhost` 永不生成 token，且仅在 token 来源已解析时才允许启动（否则输出 `Refusing to bind …`）；非字面量名称解析到环回地址时会生成 token，从而失去受信任的无 token 模式，其 bearer 仅以 token 形式打印。
- 拒绝不安全或无效的启动配置：非环回绑定但其 token 来源显式为空、无 token 的环回绑定上设置 `--require-auth`、无 token 的环回绑定上使用通配符或非环回 HTTP(S) `--allow-origin`、无正数 `mcpClientBudget` 的 `mcpBudgetMode='enforce'`、不存在或非目录的 `--workspace`，以及无效的超时或速率限制值。
- 构建 `WorkspaceFileSystem` 工厂、权限审计发布者、`DaemonStatusProvider` 和 `acp-bridge`。
- 构建 Express 应用，连接中间件（环回 `Origin` 剥离 -> 访问日志 -> 入站 trace-id 捕获 -> `hostAllowlist` -> 远程同源 `Origin` 剥离 -> 基于可变来源允许列表的 `allowOriginCors` -> 预认证 `/health` -> 预认证 Web Shell 资源 -> channel webhook -> `bearerAuth` -> 速率限制 -> JSON 解析器 -> 遥测 -> 每路由 `mutationGate`），并挂载会话、工作区 CRUD、文件、设备流认证、权限投票和 ACP HTTP 路由。（无条件拒绝的 `denyBrowserOriginCors` 墙仅保留在引导应用 `run-qwen-serve.ts` 中。）
- 绑定监听端口并注册信号处理器。
- 在 SIGINT/SIGTERM 上运行两阶段关闭；在收到第二个信号时强制退出。

## 架构

**入口**：`packages/cli/src/serve/run-qwen-serve.ts` 中的 `runQwenServe(opts, deps)`。返回一个 `RunHandle`（`{ url, port, close, ... }`）。

**应用工厂**：`packages/cli/src/serve/server.ts` 中的 `createServeApp(opts, getPort, deps)`。构建 Express `Application`。直接嵌入者和测试无需引导包装即可调用它。

**能力注册表**：`packages/cli/src/serve/capabilities.ts` 中的 `SERVE_CAPABILITY_REGISTRY`。每个 tag 都有一个 `since` 版本和可选的 `modes`。当对应的部署或运行时谓词为 false 时，条件 tag 会被省略；注册表和谓词映射是唯一真实来源。参见 [`11-capabilities-versioning.md`](./11-capabilities-versioning.md)。

**中间件**（`packages/cli/src/serve/auth.ts` 和 `server.ts`）：

| 中间件（按注册顺序）                      | 用途                                                                                                                     | 备注                                                                                                              |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------- |
| `allowOriginCors`                          | 始终安装在运行时应用上，基于 `MutableOriginAllowlist`：`--allow-origin <pattern>` 条目作为种子，Local Control 在启用时添加 LAN 来源；未匹配的来源收到 403 拒绝信封。 | 参见 [`12-auth-security.md`](./12-auth-security.md)。 |
| `hostAllowlist(bind, getPort)`              | 在环回地址上，验证 `Host` 是否属于 `localhost`、`127.0.0.1`、`[::1]`、`host.docker.internal` 或确切绑定的环回地址，加上实际端口；无端口形式在 80 和 443 端口上被接受。              | 防御 DNS 重绑定攻击。比较时不区分大小写，并按端口缓存。Local Control LAN 监听器始终强制执行其通告权限的 Host 检查，无论主绑定是什么。 |
| 访问日志中间件                            | 请求完成时，将 method、path、status、durationMs、sessionId 和 clientId 记录到 `DaemonLogger`。                             | 在 `bearerAuth` **之前**注册，因此 401 拒绝也会被记录。跳过 `/health` 和心跳。                                    |
| `bearerAuth(token)`                         | SHA-256 加上 `timingSafeEqual` 恒定时间 bearer 比较。                                                                    | 未配置 token 时开放直通（环回开发默认值）。`Bearer` scheme 不区分大小写。                                         |
| 速率限制中间件                            | 为 prompt、mutation 和 read 路由提供可选的每层令牌桶。                                                                   | 在 `bearerAuth` 之后、JSON 解析之前注册；当令牌桶耗尽时，在解析前返回 429。                                       |
| `express.json({ limit: '10mb' })`           | JSON body 解析。                                                                                                         | 解析错误返回 400。                                                                                                |
| `daemonTelemetryMiddleware`                 | 通过 `withDaemonRequestSpan` 将到达此处的已分类 daemon API 请求包装在 OpenTelemetry span 中。                                              | 属性包括 canonical route、已解析的工作区哈希、sessionId、clientId 和 status code。更早的认证、速率限制和 body-parser 拒绝在此 span 边界之外。 |
| `createMutationGate` (per-route)            | 需要操作员权限的 mutation 的路由级 opt-in 门控。受信任的主监听器请求、bearer 认证请求和配对的 Local Control 请求符合条件。                                              | 缺少受信任环回权限的无 token 主请求到达严格门控时返回 `401 { code: 'token_required' }`。缺失或无效的已配置凭证会被 bearer 中间件更早地以简单的 `401 Unauthorized` 拒绝。不是全局的 `app.use`；路由根据需要调用 `mutate({ strict: true })`。        |

**子系统**：

| 路径                                                           | 角色                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `serve/fs/`                                                      | `WorkspaceFileSystem` 工厂，以及 `policy.ts`（大小/信任/二进制检查）、`paths.ts`（规范化、resolveWithin、拒绝符号链接）、`audit.ts` 和类型化的 `FsError` 值。                                                                                                                                                                                                                                                                                                  |
| `serve/routes/workspace-file-read.ts`, `workspace-file-write.ts` | `GET /file`、`GET /file/bytes`、`POST /file/write` 和 `POST /file/edit` 的 HTTP 处理器。                                                                                                                                                                                                                                                                                                                                                                     |
| `serve/workspace-memory.ts`                                      | `GET/POST /workspace/memory`（QWEN.md CRUD）。                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `serve/workspace-agents.ts`                                      | `GET/POST/DELETE /workspace/agents`（子代理 CRUD）。                                                                                                                                                                                                                                                                                                                                                                                                         |
| `serve/daemon-status-provider.ts`                                | 环境快照加上守护进程主机预检单元：Node 版本、CLI 入口、工作区状态、ripgrep、git、npm。                                                                                                                                                                                                                                                                                                                                                                         |
| `serve/permission-audit.ts`                                      | `PermissionAuditRing`（512 条目的 FIFO）和 `createPermissionAuditPublisher`。                                                                                                                                                                                                                                                                                                                                                                                 |
| `serve/auth/device-flow.ts`, `qwen-device-flow-provider.ts`      | 设备流 OAuth 路由。参见 [`12-auth-security.md`](./12-auth-security.md)。                                                                                                                                                                                                                                                                                                                                                                                       |
| `serve/daemon-logger.ts`                                         | `DaemonLogger` 结构化文件日志。参见 [`19-observability.md`](./19-observability.md)。                                                                                                                                                                                                                                                                                                                                                                         |
| `serve/debug-mode.ts`                                            | 共享的 `isServeDebugMode()` 谓词，用于控制 HTTP 响应中的详细错误上下文。                                                                                                                                                                                                                                                                                                                                                                                       |
| `serve/acp-http/`                                                | ACP Streamable HTTP 传输（RFD #721），挂载在 `/acp`。七个文件实现了 JSON-RPC POST、SSE GET、DELETE 拆卸，以及与 REST 表面并行的共享 bridge 使用。                                                                                                                                                                                                                                                                                                              |
| `serve/web-shell-static.ts`, `serve/web-shell-resolver.ts`       | 定位并挂载已构建的 Web Shell 资源（daemon 的浏览器 UI）到 `/`、`/assets` 和 `/session/:id`，以及在所有 API 路由之后注册的 SPA 深度链接回退。在每种启动模式下均挂载在 `bearerAuth` **之前** — 浏览器无法在导航或子资源请求中附加 `Authorization` — API 调用遵循正常的权限策略：已配置的 token 门控常规 API 路由，环回 `/health` 除外（除非设置了 `--require-auth`）；而 channel webhook 入口始终使用其自身的共享密钥，无 token 的受信任环回主监听器具有完整的操作员访问权限。资源缺失时降级为纯 API 模式；`--no-web` 可显式关闭。 |

**ACP bridge 包导入**：

- 事件总线原语从 `@qwen-code/acp-bridge/eventBus` 导入。
- 状态原语从 `@qwen-code/acp-bridge/status` 导入。
- `serve/acp-session-bridge.ts` 保留为更广泛 bridge 表面的 CLI 本地兼容性门面。

## 流程

### 启动序列

在 `runQwenServe()` 启动此序列之前，仅 CLI 使用的 `--open-with-auth` 模式会验证环回/Web Shell 资格，并使用选定的已配置 token 填充 `ServeOptions.token`，当该选择为空时则使用 32 个随机字节（256 位 bearer）以 base64url 编码。就以下每个步骤而言，该生成的值被视为普通的已配置 token — 这也是 `--require-auth --open-with-auth` 能够启动的原因 — 并且它与步骤 1 中的非环回临时 bearer 是独立的生成器。直接调用 `createServeApp` 的直接嵌入者从不生成 token。

1. **解析 token**：从 `opts.token` 或 `QWEN_SERVER_TOKEN` 获取并修剪，使 `cat token.txt` 产生的尾部换行符无法悄悄破坏 bearer 比较。当请求的 `--hostname` 为非环回地址（字面量 `localhost` 优先按自身解析一次）且**两个**来源均不存在时，生成一个临时的 128 位（16 字节）bearer（22 个 base64url 字符），而不是拒绝；该值在 `listen()` 之后由远程快速启动打印一次，并在每次重启时轮换。环回拼写形式永不生成，因此保留受信任的无 token 模式。**显式为空白**的来源（`--token ''`，或 `QWEN_SERVER_TOKEN` 设置为空值或仅含空白字符的值）不算“不存在”，因此始终抑制生成 — 但空白性仅在一个方向上决定解析后的 token：空白的 `--token` 会遮蔽已设置的环境值并解析为无 token，而空白的环境值仅在未传递 `--token` 时才解析为无 token（非空白的 `--token` 仍然优先）；在这两种情况下，没有解析到 token 的非环回绑定仍然无法通过下方的守卫。
2. **主机名拼写错误防护**：`--hostname localhost:4170` 会报错并建议改用 `--port`。
3. **认证预检**：没有_解析后_ token 的非环回绑定会被拒绝 — 这可能通过显式为空的来源达到，或通过 `localhost` 绑定的一次性解析落到非环回地址达到（生成依据拼写形式决定，因此那里没有生成任何内容）；`--require-auth` 在无 token 的绑定上拒绝，经过步骤 1 后这意味着没有已配置来源的环回绑定。通配符和非环回 HTTP(S) `--allow-origin` 守卫读取相同的解析后 token，因此在非环回绑定上生成的 bearer 可以满足它们，这些拒绝也仅限环回。
4. **工作区验证**：绝对路径、存在、是目录。`EACCES` / `EPERM` 会被包装以指向该标志。
5. **规范化工作区**：`canonicalizeWorkspace(rawWorkspace)` 运行一次 `realpathSync.native`，并将其提供给 `/capabilities`、`POST /session` 回退机制和 bridge。
6. **MCP 预算验证**：正整数；`enforce` 需要预算。
7. **MCP 池开关推断**：父环境 `QWEN_SERVE_NO_MCP_POOL=1` 使 `mcpPoolActive=false`，因此 capabilities 会如实省略 `mcp_workspace_pool` 和 `mcp_pool_restart`。
8. **CORS / 超时 / 速率限制验证**：通配符和非环回 HTTP(S) `--allow-origin` 值需要 token；prompt、SSE writer、channel idle、session idle、reaper 和速率限制窗口值在无效时会快速失败。
9. **每句柄 `childEnvOverrides`**：通过 `BridgeOptions.childEnvOverrides` 将 `QWEN_SERVE_MCP_CLIENT_BUDGET` 和 `QWEN_SERVE_MCP_BUDGET_MODE` 传递给 ACP 子进程，而不是修改 `process.env`。
10. **一次性加载 `settings.json`**：读取 `context.fileName`、`policy.permissionStrategy` 和 `policy.consensusQuorum`。损坏的文件会回退到默认值。`validatePolicyConfig()` 根据 `SERVE_CAPABILITY_REGISTRY.permission_mediation.modes` 检查 `policy.*`；未知的策略或非正的 `consensusQuorum` 会抛出 `InvalidPolicyConfigError`。在非 `consensus` 策略下设置 quorum 会记录 stderr 警告。
11. **分配 `PermissionAuditRing`**（512 个条目）。
12. **构建 `fsFactory`**：`runQwenServe` 默认为 `trusted: true`；直接调用 `createServeApp` 的调用者默认为 `trusted: false` 并警告一次。
13. **`createHttpAcpBridge`**，参见 [`03-acp-bridge.md`](./03-acp-bridge.md)。
14. **`createServeApp`** 组装 Express。
15. **在监听之前创建并绑定 HTTP(S) 服务器的生命周期**，然后调用 `server.listen(port, hostname)` 并解析实际的 `getPort()` 用于主机允许列表。在此监听器和其余主机启动闸门就绪之前，Conversations 所有权无法启动。
16. **注册 SIGINT / SIGTERM 处理器**，通过共享的应用生命周期实现优雅关闭。

### 优雅关闭

1. 收到第一个信号时**封闭准入并开始所有 drain**：
   - 处置设备流注册表并取消待处理的流。
   - `bridge.shutdown()` 将每个 channel 标记为 `isDying = true`，向每个 ACP 子进程的 stdin 发送优雅关闭信号，每个 channel 等待 `KILL_HARD_DEADLINE_MS`（10 秒），然后在需要时调用 `channel.kill()`。
2. **在应用和主机 drain 运行时关闭监听器**：
   - `server.close()` 停止接受新连接并让进行中的请求完成。
   - `SHUTDOWN_FORCE_CLOSE_MS`（5 秒）触发 `server.closeAllConnections()`。
   - 如果需要，第二个 2 秒的截止时间会再次升级。
3. **仅在收到监听器、应用本地工作、主机所有工作、Live 发现清理和运行时 drain 的正向关闭证明后，才释放 Conversations 所有权**。任何未完成的证明都会拒绝关闭，而不是允许不安全的交接。
4. **退出过程中收到第二个信号**：
   - `bridge.killAllSync()` + `process.exit(1)` 以避免孤儿子进程阻塞守护进程退出。

## 状态与生命周期

`RunHandle` 暴露：

- `url`：解析后的监听 URL，在临时端口解析之后。
- `port`：实际端口，包括 `0` 的解析。
- `close()`：供嵌入者和测试使用的编程式关闭。

直接调用 `createServeApp` 仅返回一个 `Application`。需要 Live/Conversations 的嵌入者必须创建实际的 Node 服务器，在首次 `listen()` 之前调用 `getServeAppLifecycle(app).bindServer(server)`，并在关闭期间 await `lifecycle.close()`。未绑定时，普通路由仍可用，但 Live/Conversations 会 fail closed。调用原始的 `server.close()` 会触发事件驱动的清理，但嵌入者仍必须 await `lifecycle.close()` 以观察 drain 或所有权释放失败。

## 依赖

| `serve/` 使用的上游                                                                       | 使用 `serve/` 的下游                  |
| ----------------------------------------------------------------------------------------- | ------------------------------------- |
| `@qwen-code/acp-bridge`：bridge、事件总线、状态类型                                       | `qwen` CLI 的 `serve` 子命令处理器    |
| `packages/core`：`getAllMemoryFilenames`、`Config`、`WorkspaceContext`                          | 直接嵌入者、测试                      |
| ACP SDK (`@agentclientprotocol/sdk`)：通过 bridge 的 `PROTOCOL_VERSION`、`ClientSideConnection` |                                       |
| Express + body-parser、`node:crypto`、`node:fs`、`node:path`                              |                                       |

## 配置

| 来源            | 键                                                                                              | 效果                                                                                                  |
| --------------- | ----------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Env             | `QWEN_SERVER_TOKEN`                                                                             | 修剪后的 Bearer token。                                                                               |
| Env             | `QWEN_SERVE_NO_MCP_POOL=1`                                                                      | 强制 `mcpPoolActive=false`。                                                                          |
| ACP 子进程 env  | `QWEN_SERVE_MCP_CLIENT_BUDGET` / `QWEN_SERVE_MCP_BUDGET_MODE`                                   | 从 `--mcp-client-budget` / `--mcp-budget-mode` 生成并通过 `childEnvOverrides` 转发。                  |
| Env             | `QWEN_SERVE_PROMPT_DEADLINE_MS` / `QWEN_SERVE_WRITER_IDLE_TIMEOUT_MS`                           | 默认的 prompt / SSE 空闲超时。                                                                        |
| Env             | `QWEN_SERVE_RATE_LIMIT*`                                                                        | 速率限制开关、prompt / mutation / read 上限及窗口默认值。                                             |
| Env             | `QWEN_SERVE_DEBUG=1`                                                                            | 详细的 stderr 日志。参见 [`19-observability.md`](./19-observability.md)。                             |
| Flags           | `--hostname`, `--port`                                                                          | 监听绑定。                                                                                            |
| Flags           | `--token`, `--require-auth`, `--enable-session-shell`                                           | Bearer token、环回认证加固和显式 shell 执行开关。                                                     |
| CLI flags       | `--open-with-auth`                                                                              | 默认关闭的环回 Web Shell 启动，在运行时之前复用或生成进程生命周期的 bearer。                            |
| Flag            | `--workspace`                                                                                   | 覆盖 `process.cwd()`；重复可注册额外的隔离工作区运行时。                                               |
| Flags           | `--max-sessions`, `--max-pending-prompts-per-session`, `--max-connections`, `--event-ring-size` | Bridge / Express 上限。                                                                               |
| Flags           | `--mcp-client-budget=N`, `--mcp-budget-mode={off,warn,enforce}`                                 | 转发给 ACP 子进程。                                                                                   |
| Flags           | `--allow-origin`, `--allow-private-auth-base-url`                                               | 浏览器 CORS 允许列表及 localhost/私有认证提供者安装开关。                                             |
| Flag            | `--web` / `--no-web`                                                                            | 在 daemon 根路径提供或跳过 Web Shell UI（默认提供）。`--no-web` 使 daemon 仅保留 API。                 |
| Flags           | `--prompt-deadline-ms`, `--writer-idle-timeout-ms`, `--channel-idle-timeout-ms`, `--initialize-timeout-ms` | Prompt、SSE writer、ACP 子进程空闲生命周期及 ACP 子进程请求超时控制。         |
| Flags           | `--session-reap-interval-ms`, `--session-idle-timeout-ms`                                       | 断开连接的会话回收控制。                                                                              |
| Flags           | `--rate-limit*`                                                                                 | 每层 HTTP 速率限制。                                                                                  |
| `settings.json` | `policy.permissionStrategy`, `policy.consensusQuorum`                                           | `MultiClientPermissionMediator` 策略和 quorum。                                                       |
| `settings.json` | `context.fileName`                                                                                         | 通过 workspace-service 的 `contextFilename` 传递给 `/workspace/init` 的工作区内存文件名。             |
合并后的参考文档请参见 [`17-configuration.md`](./17-configuration.md)。

## 注意事项与已知限制

- 直接调用 `createServeApp` 时，若未提供 `deps.fsFactory` 或 `deps.bridge`，则默认 `trusted: false`；agent 端的 ACP `writeTextFile` 会因 `untrusted_workspace` 而拒绝执行。该警告仅打印一次。
- 运行时应用基于可变允许列表运行 `allowOriginCors`；未匹配的 `Origin` 值收到 403 拒绝信封（无条件拒绝的 `denyBrowserOriginCors` 墙仅保留在引导应用中）。**环回** Web Shell 能正常工作是因为另一个中间件会先剥离匹配的环回同源值；在带 token 的非环回绑定上，Shell 的同源 XHR 经过 bearer 认证，其 `Origin` 在到达该墙之前被剥离，因此不需要 `--allow-origin`。仍有三种情况需要允许列表条目：WebSocket 升级（终端、语音）、TLS 终止的前端代理（其 `https` 来源永远无法匹配明文 socket），以及任何重写 `Host` 头的明文 HTTP 中间层 — nginx 默认的 `proxy_set_header Host $proxy_host` 和 k8s Ingress 都会这样做。仅端口转换在**非环回绑定**上不需要任何配置（`docker -p 8080:4170`）：检查仅将 `Origin` 与规范化后的转发 `Host` 进行比较，从不查询监听端口（仅剥离协议默认的 `:80`/`:443`；非默认端口必须原样保留在其中）。在默认的**环回**绑定上则不行：DNS 重绑定 Host 允许列表仅接受 daemon 自身的端口，因此端口转换隧道（`ssh -L 8080:localhost:4170`）会对每个请求（包括 shell 文档）返回 `403 Invalid Host header` 拒绝，且 `--allow-origin` 无法覆盖它 — 请转发相同端口或绑定非环回地址。WebSocket 和 TLS 终止情况的补救措施是 `--allow-origin <origin>`；重写 Host 的中间层可以改为配置为原样转发 `Host` — 但一旦 TLS 在代理处终止则无法帮助，因为协议是从 daemon 自身的 socket 读取的。
- Body-parser 顺序：使用 `mutate({ strict: true })` 的路由只有在 `express.json()` 之后才会返回 401。最坏情况下的内存占用为 `--max-connections × express.json({limit: '10mb'})`，在饱和的 loopback 监听器上可能产生高达约 2.5 GB 的瞬态内存；这种权衡是有意为之的。
- 同一进程中的多个 daemon 必须使用针对每个 handle 的 `childEnvOverrides`；修改 `process.env` 会产生竞态条件，因为 `defaultSpawnChannelFactory` 会在 spawn 时对 env 进行快照。

## 参考资料

- `packages/cli/src/serve/run-qwen-serve.ts`（引导、启动验证、优雅关闭）
- `packages/cli/src/serve/server.ts`（`createServeApp()`、中间件与路由组装）
- `packages/cli/src/serve/auth.ts`（CORS、Host 允许列表、bearer 认证、mutation 门控）
- `packages/cli/src/serve/rate-limit.ts`（分级 HTTP 速率限制）
- `packages/cli/src/serve/capabilities.ts`（能力注册表与条件宣告）
- `packages/cli/src/serve/types.ts`（`ServeOptions`、`CapabilitiesEnvelope`）
- `packages/cli/src/serve/daemon-status-provider.ts`
- `packages/cli/src/serve/permission-audit.ts`
- Issues：[#3803](https://github.com/QwenLM/qwen-code/issues/3803), [#4175](https://github.com/QwenLM/qwen-code/issues/4175)