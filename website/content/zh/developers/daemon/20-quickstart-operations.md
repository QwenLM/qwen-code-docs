# 快速启动与操作

本页重点介绍**如何启动 `qwen serve`、如何验证其是否正常工作，以及从 `qwen serve` 到监听服务器的内部调用链**。架构、组件和通信协议的详细信息请参阅其他 daemon 深度解析页面。

## 1. 最短路径

```bash
qwen serve
```

输出：

```text
qwen serve listening on http://127.0.0.1:4170 (mode=http-bridge, workspace=/your/cwd)
qwen serve: bound to workspace "/your/cwd"
qwen serve: bearer auth disabled (loopback default). Set QWEN_SERVER_TOKEN to enable.
```

在浏览器中打开 `http://127.0.0.1:4170/demo` 即可查看调试控制台：包含聊天 UI、事件流和工作区检查功能。在默认的 loopback 开发模式下，`createServeApp()` 会在 `bearerAuth` **之前**挂载来自 `packages/cli/src/serve/routes/health-demo.ts` 的 `/demo` 路由，因此无需 token。

## 2. 启动方案

```bash
# 1. 本地开发默认配置（loopback，无 token）
qwen serve

# 2. 显式指定工作区 + 临时端口
qwen serve --workspace /path/to/repo --port 0

# 3. 加固的 loopback 开发模式（即使在 loopback 也强制 bearer 认证）
QWEN_SERVER_TOKEN=$(openssl rand -hex 32) qwen serve --require-auth

# 4. 暴露到局域网（非 loopback 需要 token）
QWEN_SERVER_TOKEN=$(openssl rand -hex 32) \
  qwen serve --hostname 0.0.0.0 --port 4170

# 5. 针对多会话和更大的重放环进行调优
qwen serve --max-sessions 0 --event-ring-size 32000

# 6. 多客户端协作 + 严格的 MCP 预算
QWEN_SERVER_TOKEN=secret \
  qwen serve --require-auth \
             --mcp-client-budget 10 \
             --mcp-budget-mode enforce

# 7. 使用 settings.json 中配置的 consensus 策略启动
# settings.json: { "policy": { "permissionStrategy": "consensus", "consensusQuorum": 2 } }
qwen serve

# 8. 调试日志
QWEN_SERVE_DEBUG=1 qwen serve

# 9. 禁用 F2 池（回退到每会话 MCP 客户端）
QWEN_SERVE_NO_MCP_POOL=1 qwen serve

# 10. 允许浏览器 Web UI 跨域访问
QWEN_SERVER_TOKEN=secret \
  qwen serve --allow-origin 'http://localhost:3000'

# 11. Prompt 截止时间 + SSE 空闲超时
qwen serve --prompt-deadline-ms 300000 --writer-idle-timeout-ms 600000

# 12. 在最后一个会话关闭后保持 ACP 子进程处于预热状态
qwen serve --channel-idle-timeout-ms 60000

# 13. 启用 HTTP 速率限制
QWEN_SERVE_RATE_LIMIT=1 qwen serve
```

使用加固的 loopback 方案 (3) 时，`/demo` 会在 `bearerAuth` 之后注册。普通的浏览器导航需要 auth header，因此请改用 curl 或 SDK 脚本。

## 3. 完整启动选项

CLI 定义在 **`packages/cli/src/commands/serve.ts`** 中：

| 选项                                    | 类型                           | 默认值                                      | 何时必需                            | 作用                                                                                                                                                                                                                |
| --------------------------------------- | ------------------------------ | -------------------------------------------- | ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--port <n>`                            | number                         | `4170`                                       | -                                        | TCP 端口；`0` 表示由操作系统分配的临时端口。                                                                                                                                                                       |
| `--hostname <host>`                     | string                         | `127.0.0.1`                                  | 非 loopback 需要 token              | 绑定地址。Loopback 值：`127.0.0.1`、`localhost`、`::1`、`[::1]`。`[::1]` 的方括号会自动去除；如果输入 `host:port` 格式会被拒绝，并提示使用 `--port`。                                    |
| `--token <s>`                           | string                         | env / none                                   | 非 loopback 和 `--require-auth`        | Bearer token；会进行一次 trim 处理。**它会出现在 `/proc/<pid>/cmdline` 中，因此建议优先使用 `QWEN_SERVER_TOKEN`**。启动时的 stderr 也会对此发出警告。                                                                                |
| `--max-sessions <n>`                    | number                         | `20`                                         | -                                        | 活跃会话上限。超出限制的 spawn 请求将返回 503。`0` 表示无限制。`NaN` 或负值会抛出异常。                                                                                                                     |
| `--max-pending-prompts-per-session <n>` | number                         | `5`                                          | -                                        | 每个会话已接受但处于 pending/running 状态的 prompt 上限。超出的 prompt 将返回 503。`0` / `Infinity` 表示无限制。负值或非整数值会抛出异常。                                                               |
| `--workspace <dir>`                     | string                         | `process.cwd()`                              | -                                        | 绑定的工作区。**必须是绝对路径、必须存在且必须是目录**。启动时通过 `canonicalizeWorkspace` 对其进行一次规范化处理。如果 `POST /session` 的 `cwd` 不匹配，将返回 `400 workspace_mismatch`。 |
| `--max-connections <n>`                 | number                         | `256`                                        | -                                        | 监听器级别的 `server.maxConnections`。`0` / `Infinity` 表示无限制。`NaN` 或负值会导致启动失败，以避免 fail-open 行为。                                                                              |
| `--require-auth`                        | boolean                        | `false`                                      | 需要 token                           | 将 bearer 认证扩展到 loopback **和** `/health`。如果没有 token，启动将拒绝执行。                                                                                                                             |
| `--enable-session-shell`                | boolean                        | `false`                                      | 需要 token                           | 启用直接的 `POST /session/:id/shell` 执行。调用方还必须发送与会话绑定的 `X-Qwen-Client-Id`。                                                                                                        |
| `--event-ring-size <n>`                 | number                         | `8000`                                       | -                                        | 每个会话的 SSE 重放环深度。软上限为 `MAX_EVENT_RING_SIZE = 1_000_000`；超出范围的值会在构建 bridge 时抛出异常。                                                                               |
| `--http-bridge`                         | boolean                        | `true`                                       | -                                        | 阶段 1 bridge 模式：由 daemon 多路复用一个 `qwen --acp` 子进程。阶段 2 进程内模式尚未实现；`--no-http-bridge` 会回退并输出到 stderr。                                            |
| `--mcp-client-budget <n>`               | number                         | none                                         | `mcp-budget-mode=enforce` 时必需   | 工作区 MCP 客户端上限。必须是正整数。                                                                                                                                                                 |
| `--mcp-budget-mode <m>`                 | `'enforce' \| 'warn' \| 'off'` | 设置了预算时为 `warn`，否则为 `off` | `enforce` 需要 `--mcp-client-budget` | `enforce` 会拒绝请求，`warn` 仅在达到 75% 时发出警告，`off` 仅用于观察。                                                                                                                                               |
| `--allow-origin <pattern>`              | repeatable string              | none                                         | -                                        | 替换默认 Origin 拒绝策略的 CORS 允许列表。`*` 需要 token。                                                                                                                                         |
| `--allow-private-auth-base-url`         | boolean                        | `false`                                      | -                                        | 允许安装 localhost / 私有网络 auth provider 的 `baseUrl`。仅用于受信任的本地开发。                                                                                                      |
| `--prompt-deadline-ms <n>`              | number                         | none                                         | -                                        | 服务端 prompt 的挂钟时间限制（毫秒）；超时将中止 prompt。                                                                                                                                                  |
| `--writer-idle-timeout-ms <n>`          | number                         | none                                         | -                                        | 每个 SSE 连接的空闲超时时间（毫秒）。                                                                                                                                                                                |
| `--channel-idle-timeout-ms <n>`         | number                         | `0`                                          | -                                        | 在最后一个会话关闭后保持 ACP 子进程存活。`0` 表示立即回收。                                                                                                                               |
| `--session-reap-interval-ms <n>`        | number                         | `60000`                                      | -                                        | 会话回收器扫描间隔。`0` 表示禁用。                                                                                                                                                                        |
| `--session-idle-timeout-ms <n>`         | number                         | `1800000`                                    | -                                        | 已断开会话的空闲超时时间。`0` 表示禁用。                                                                                                                                                                   |
| `--rate-limit` / `--no-rate-limit`      | boolean                        | env / off                                    | -                                        | 启用或禁用分层 HTTP 速率限制。                                                                                                                                                                      |
| `--rate-limit-prompt <n>`               | number                         | `10`                                         | `--rate-limit`                           | 每个时间窗口内的 prompt 请求数。                                                                                                                                                                                           |
| `--rate-limit-mutation <n>`             | number                         | `30`                                         | `--rate-limit`                           | 每个时间窗口内的 mutation 请求数。                                                                                                                                                                                         |
| `--rate-limit-read <n>`                 | number                         | `120`                                        | `--rate-limit`                           | 每个时间窗口内的 read 请求数。                                                                                                                                                                                             |
| `--rate-limit-window-ms <n>`            | number                         | `60000`                                      | `--rate-limit`                           | 速率限制窗口长度；必须 `>= 1000`。                                                                                                                                                                          |

## 4. 环境变量

| 环境变量                                 | 等效选项 / 作用                                                                                                                                                |
| ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `QWEN_SERVER_TOKEN`                 | 等效于 `--token`；`--token` 优先级更高。启动时会进行一次 trim 处理，以避免 `cat token.txt` 带来的尾部换行符。                                                         |
| `QWEN_SERVE_DEBUG`                  | `1` / `true` / `on` / `yes`（不区分大小写）启用详细的 stderr 日志。                                                                                             |
| `QWEN_SERVE_NO_MCP_POOL`            | `1` 完全禁用工作区 MCP 池，并回退到每会话的 `McpClientManager`。Capabilities 将停止通告 `mcp_workspace_pool` / `mcp_pool_restart`。 |
| `QWEN_SERVE_MCP_CLIENT_BUDGET`      | ACP 子进程的内部预算输入。CLI 通过 `childEnvOverrides` 从 `--mcp-client-budget` 生成它；它不是父进程的环境变量回退。                  |
| `QWEN_SERVE_MCP_BUDGET_MODE`        | ACP 子进程的内部预算模式。CLI 通过 `childEnvOverrides` 从 `--mcp-budget-mode` 生成它；它不是父进程的环境变量回退。                     |
| `QWEN_SERVE_PROMPT_DEADLINE_MS`     | `--prompt-deadline-ms` 的环境变量回退。                                                                                                                                |
| `QWEN_SERVE_WRITER_IDLE_TIMEOUT_MS` | `--writer-idle-timeout-ms` 的环境变量回退。                                                                                                                            |
| `QWEN_SERVE_MCP_POOL_TRANSPORTS`    | 由 ACP 子进程读取。逗号分隔的池化 transport 允许列表；默认为 `stdio,websocket`。                                                                        |
| `QWEN_SERVE_MCP_POOL_DRAIN_MS`      | 由 ACP 子进程读取。池条目空闲排空延迟；默认为 `30000`，限制在 `1000..600000` 毫秒之间。                                                                   |
| `QWEN_SERVE_RATE_LIMIT`             | `1` / `true` 启用速率限制；CLI 选项优先级更高。                                                                                                                      |
| `QWEN_SERVE_RATE_LIMIT_PROMPT`      | `--rate-limit-prompt` 的环境变量回退。                                                                                                                                 |
| `QWEN_SERVE_RATE_LIMIT_MUTATION`    | `--rate-limit-mutation` 的环境变量回退。                                                                                                                               |
| `QWEN_SERVE_RATE_LIMIT_READ`        | `--rate-limit-read` 的环境变量回退。                                                                                                                                   |
| `QWEN_SERVE_RATE_LIMIT_WINDOW_MS`   | `--rate-limit-window-ms` 的环境变量回退。                                                                                                                              |

每个 handle 的环境变量覆盖是有意为之的：在同一进程中运行的两个 daemon 不会在 `process.env` 上产生竞争。`defaultSpawnChannelFactory` 会在 spawn 时对 env 进行快照。

## 5. 同时读取 `settings.json`

启动时会调用一次 `loadSettings(boundWorkspace)`：

| 键                         | 类型                                                               | 行为                                                                                                                                                                 |
| --------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `policy.permissionStrategy` | `'first-responder' \| 'designated' \| 'consensus' \| 'local-only'` | 设置 `BridgeOptions.permissionPolicy`。**启动时会使用 `validatePolicyConfig` 进行验证**；未知值会抛出 `InvalidPolicyConfigError`，而不是静默回退。 |
| `policy.consensusQuorum`    | positive integer                                                   | `consensus` 策略的 N 值。默认为 `floor(M/2)+1`。如果在非 consensus 策略下设置，它将被忽略，并且启动时会在 stderr 中记录警告。                              |
| `context.fileName`          | string                                                             | 覆盖 `getCurrentGeminiMdFilename()` 并控制 `POST /workspace/init` 写入哪个文件。                                                                          |
| `tools.disabled`            | string[]                                                           | 在影响下一次 ACP 子进程 spawn 之前，通过 `normalizeDisabledToolList()` 进行规范化（trim、丢弃空条目、去重）。                                           |
| `tools.approvalMode`        | string                                                             | 默认会话审批模式。                                                                                                                                           |
| `telemetry`                 | object                                                             | OTel 配置：`enabled`、`otlpEndpoint`、`otlpProtocol`、每个 signal 的 endpoint 等。请参阅 [`17-configuration.md`](./17-configuration.md)。                       |

设置 I/O 失败（例如 JSON 格式错误）会回退到默认值。`InvalidPolicyConfigError` 是例外情况：策略配置错误会明确导致启动失败。

## 6. 启动拒绝场景（明确失败）

在以下情况下，`run-qwen-serve.ts` 会故意抛出异常而不是回退：

| 场景                                                                      | 错误前缀                                                                                        |
| ----------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| 无 token 绑定非 loopback 地址                                               | `Refusing to bind ... without a bearer token`                                                       |
| 设置 `--require-auth` 但无 token                                                | `Refusing to start with --require-auth set but no bearer token`                                     |
| `--workspace` 不存在、不是目录或不是绝对路径          | `Invalid --workspace ...`                                                                           |
| `--workspace` stat 权限被拒绝                                          | `Invalid --workspace ...: permission denied`                                                        |
| `--mcp-client-budget` 不是正整数                               | `Must be a positive integer`                                                                        |
| 设置 `--mcp-budget-mode=enforce` 但未设置预算                                    | `requires a positive mcpClientBudget`                                                               |
| `--hostname` 写成了 `localhost:4170` 格式                                   | `looks like a "host:port" combination. Use --port`                                                  |
| `--hostname [::1]:8080`                                                       | `Invalid --hostname ... brackets indicate an IPv6 literal but the value is not a clean [addr] form` |
| `--max-connections` 为 `NaN` 或负数                                      | `Must be >= 0`                                                                                      |
| `--event-ring-size > 1_000_000`                                               | 在构建 bridge 时抛出异常                                                                   |
| 设置 `--allow-origin '*'` 但未配置 token                                            | `Refusing to start with --allow-origin '*' but no bearer token configured`                          |
| `--prompt-deadline-ms` / `--writer-idle-timeout-ms` 不是正整数 | `Must be a positive integer`                                                                        |
| 未知的 `policy.permissionStrategy` 或非正数的 `policy.consensusQuorum`  | `InvalidPolicyConfigError`                                                                          |
## 7. Curl 验证清单

```bash
# 1. Liveness
curl http://127.0.0.1:4170/health
# -> {"status":"ok"}

# 1.1 Deep health
curl -s 'http://127.0.0.1:4170/health?deep=1' | jq

# 2. Capabilities
curl -s http://127.0.0.1:4170/capabilities | jq

# 3. Preflight readiness
curl -s http://127.0.0.1:4170/workspace/preflight | jq

# 4. Env snapshot (secrets only report presence)
curl -s http://127.0.0.1:4170/workspace/env | jq

# 5. MCP pool / budget snapshot
curl -s http://127.0.0.1:4170/workspace/mcp | jq

# 6. Create a session
curl -s -X POST http://127.0.0.1:4170/session \
  -H 'Content-Type: application/json' \
  -H 'X-Qwen-Client-Id: curl-debug' \
  -d '{}' | jq

# 7. Tail SSE (replace <sid>)
curl -N \
  -H 'Accept: text/event-stream' \
  -H 'X-Qwen-Client-Id: curl-debug' \
  -H 'Last-Event-ID: 0' \
  'http://127.0.0.1:4170/session/<sid>/events'

# 8. Demo page
open http://127.0.0.1:4170/demo
```

启用 Bearer 认证时，请在每个请求中添加 `-H "Authorization: Bearer $QWEN_SERVER_TOKEN"`。

## 8. 可以使用 demo 页面吗？

**可以。** 它由 `packages/cli/src/serve/demo.ts` 中的 `getDemoHtml(port)` 实现，是一个自包含的 HTML，没有外部依赖。

| 启动模式 | `/demo` 的注册位置 | 浏览器直接访问 |
| --- | --- | --- |
| 未使用 `--require-auth` 的 Loopback | `routes/health-demo.ts`，由 `createServeApp()` 在 `bearerAuth` 之前挂载 | 无需 token 即可访问 |
| 使用 `--require-auth` 的 Loopback | `routes/health-demo.ts`，由 `createServeApp()` 在 `bearerAuth` 之后挂载 | 难以通过普通浏览器使用；请使用 curl 或 SDK |
| 非 Loopback 绑定 | `routes/health-demo.ts`，由 `createServeApp()` 在 `bearerAuth` 之后挂载 | 同上 |

CSP 为 `default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; frame-ancestors 'none'`，并附加 `X-Frame-Options: DENY`。该页面只能请求 `'self'`（即 daemon），无法加载外部脚本或样式。

## 9. 从 `qwen serve` 到监听服务器的调用链

```text
qwen serve
   |
   v (process)
packages/cli/index.ts              main()
   |
   v
gemini.tsx                         main() - parseArguments()
   |
   v (yargs assembly)
config/config.ts                   import { serveCommand } ...
config/config.ts                   .command(serveCommand)
config/config.ts                   await yargsInstance.parse()
   |
   v (handler)
commands/serve.ts                  handler(argv) - boot pre-checks
commands/serve.ts                  const { runQwenServe } = await import('../serve/index.js')   # lazy load
commands/serve.ts                  await runQwenServe({...})
   |
   v
serve/run-qwen-serve.ts              runQwenServe(opts, deps)
   |  |- trim token
   |  |- hostname mismatch fallback
   |  |- auth preflight
   |  |- workspace validation + canonicalization
   |  |- MCP budget validation + childEnvOverrides
   |  |- loadSettings + validatePolicyConfig
   |  |- PermissionAuditRing + publisher
   |  |- resolveBridgeFsFactory
   |  `- createHttpAcpBridge({...})
   |
   v
serve/run-qwen-serve.ts              const app = createServeApp(opts, () => actualPort, {...})
   |
   v
serve/server.ts                    createServeApp() - builds Express app (**does not listen**)
   |  |- middleware chain (Host allowlist / CORS / bearerAuth / mutation gate / rate limit)
   |  |- route mounting (health / demo / capabilities / workspace / session / SSE / ACP HTTP)
   |  `- return app
   |
   v
serve/run-qwen-serve.ts              server = app.listen(port, hostname, cb)
   |  |- server.maxConnections = cap
   |  |- actualPort = server.address().port
   |  |- write "qwen serve listening on ..."
   |  |- register SIGINT / SIGTERM (onSignal)
   |  `- resolve(handle: RunHandle)
   |
   v
commands/serve.ts                  await blockForever()    // block forever until signal
```

关键事实：

- **`createServeApp` 仅负责构建，不负责监听。** 它返回一个挂载了中间件和路由的 `express()` 实例。调用方负责 `app.listen()`。`server.test.ts` 在大约 25 个用例中以这种方式使用该工厂函数，因此该工厂函数有意不管理生命周期。
- **`() => actualPort` 是一个惰性闭包。** `actualPort` 在 `app.listen` 的回调中赋值。`hostAllowlist` 中间件按需读取它，因此临时端口（`--port 0`）仍能正确校验 `Host` 请求头。
- **`await blockForever()` 是有意为之。** 如果 `yargs.parse()` 解析完成，CLI 顶层会进入交互式 TUI 入口（`gemini.tsx`）。SIGINT / SIGTERM 通过 `runQwenServe` 的 `onSignal` 路径退出。

## 10. HTTP 路由文件拆分

主要的组装工作在 `server.ts` 的 `createServeApp()` 中完成，它会连接中间件并挂载专门的路由模块：

| 路由 | 文件 | 挂载入口 |
| --- | --- | --- |
| `/health`, `/demo` | `packages/cli/src/serve/routes/health-demo.ts` | `healthDemoRoutes.register()` |
| `/daemon/status` | `packages/cli/src/serve/routes/daemon-status.ts` | `registerDaemonStatusRoutes()` |
| `/capabilities`、workspace init/tool/MCP mutation 路由、ACP HTTP bridge | `packages/cli/src/serve/server.ts` | 直接在 `createServeApp()` 内部注册 |
| Workspace 状态、env、preflight、MCP/tool/provider/skill 摘要 | `packages/cli/src/serve/routes/workspace-status.ts` | `registerWorkspaceStatusRoutes()`, `registerWorkspaceDiagnosticStatusRoutes()` |
| Workspace 扩展及扩展操作 | `packages/cli/src/serve/routes/workspace-extensions.ts` | `registerWorkspaceExtensionRoutes()` |
| `/workspace/memory` (GET/POST) | `packages/cli/src/serve/workspace-memory.ts` | `mountWorkspaceMemoryRoutes()` |
| 所有 `/workspace/agents` CRUD 路由 | `packages/cli/src/serve/workspace-agents.ts` | `mountWorkspaceAgentsRoutes()` |
| `GET /file`, `/file/bytes`, `/list`, `/glob`, `/stat` | `packages/cli/src/serve/routes/workspace-file-read.ts` | `registerWorkspaceFileReadRoutes()` |
| `POST /file/write`, `/file/edit` | `packages/cli/src/serve/routes/workspace-file-write.ts` | `registerWorkspaceFileWriteRoutes()` |
| Workspace setup、trust、settings、permissions 和 voice 路由 | `packages/cli/src/serve/routes/workspace-*.ts` | `registerWorkspaceSetupGithubRoutes()`, `registerWorkspaceTrustRoutes()` 等 |
| Workspace auth provider 和 device-flow 路由 | `packages/cli/src/serve/routes/workspace-auth.ts` | `registerWorkspaceAuthRoutes()` |
| Session 生命周期、prompt、metadata、language、shell、recap、rewind、branch 和 list 路由 | `packages/cli/src/serve/routes/session.ts` | `registerSessionRoutes()` |
| `GET /session/:id/events` SSE 流 | `packages/cli/src/serve/routes/sse-events.ts` | `registerSseEventsRoutes()` |
| Permission 响应路由 | `packages/cli/src/serve/routes/permission.ts` | `registerPermissionRoutes()` |

有关完整的路由和有线协议参考，请参阅 [`../qwen-serve-protocol.md`](../qwen-serve-protocol.md)。有关架构信息，请参阅 [`01-architecture.md`](./01-architecture.md)。

## 11. 优雅关闭与强制关闭

- **首次 SIGINT / SIGTERM** -> `runQwenServe` 的 `onSignal` -> 两阶段优雅关闭：
  1. `bridge.shutdown()`：每个 channel 获得 `KILL_HARD_DEADLINE_MS`（10 秒）的超时时间，然后执行 `channel.kill()`。
  2. `server.close()`：排空进行中的请求，`SHUTDOWN_FORCE_CLOSE_MS`（5 秒）后触发 `closeAllConnections()`，然后再应用 2 秒的超时时间。
- **退出过程中再次收到 SIGINT / SIGTERM** -> `bridge.killAllSync()` 同步向所有 ACP 子进程发送 SIGKILL，并调用 `process.exit(1)` 以避免产生孤儿进程。

`runQwenServe` 返回的 `RunHandle.close()` 是供嵌入方和测试使用的编程式等效方法。

## 12. 嵌入式调用（绕过 CLI）

```ts
import { runQwenServe } from '@qwen-code/qwen-code/serve';

const handle = await runQwenServe({
  port: 0, // ephemeral
  hostname: '127.0.0.1',
  mode: 'http-bridge',
  maxSessions: 20,
  workspace: '/abs/path/to/repo',
});
console.log(`Daemon at ${handle.url}`);
// ... call handle.bridge directly or access handle.server
await handle.close(); // programmatic shutdown
```

或者直接获取 Express app 并自行监听：

```ts
import { createServeApp } from '@qwen-code/qwen-code/serve';

const app = createServeApp(
  {
    port: 0,
    hostname: '127.0.0.1',
    mode: 'http-bridge',
    maxSessions: 20,
  },
  () => 0,
  {
    /* deps: bridge, fsFactory, ... */
  },
);

const server = app.listen(0, '127.0.0.1', () => {
  console.log('listening on', server.address());
});
```

注意：直接调用 `createServeApp` 时，默认的 `fsFactory.trusted = false`。Agent 端的 ACP `writeTextFile` 会被作为 `untrusted_workspace` 拒绝，并在 stderr 打印一次警告。你可以注入带有显式信任配置的 `deps.fsFactory`，注入 `deps.bridge`，或者接受默认的信任门控行为。

## 13. 调试方案

请参阅 [`19-observability.md`](./19-observability.md) 中的调试部分。常用命令如下：

```bash
# Is the daemon alive?
curl http://127.0.0.1:4170/health

# Which capabilities are advertised?
curl -s http://127.0.0.1:4170/capabilities | jq

# Daemon-host readiness
curl -s http://127.0.0.1:4170/workspace/preflight | jq

# Tail live SSE
curl -N -H 'Accept: text/event-stream' \
     -H 'Last-Event-ID: 0' \
     'http://127.0.0.1:4170/session/<sid>/events'

# Verbose logs
QWEN_SERVE_DEBUG=1 qwen serve
```

## 参考资料

- CLI 入口：`packages/cli/src/commands/serve.ts`
- 引导程序：`packages/cli/src/serve/run-qwen-serve.ts`
- Express 工厂函数：`packages/cli/src/serve/server.ts`
- 中间件：`packages/cli/src/serve/auth.ts`
- Bridge 工厂函数：`packages/acp-bridge/src/bridge.ts`
- Demo 页面 HTML：`packages/cli/src/serve/demo.ts`
- 用户文档：[`../../users/qwen-serve.md`](../../users/qwen-serve.md)
- 有线协议：[`../qwen-serve-protocol.md`](../qwen-serve-protocol.md)