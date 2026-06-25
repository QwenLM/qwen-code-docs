# 快速入门与操作指南

本页重点介绍**如何启动 `qwen serve`、如何验证其正常运行，以及从 `qwen serve` 到监听服务器的内部调用链路**。架构、组件和通信协议细节请参阅 daemon 深度解析的其他页面。

## 1. 最简启动

```bash
qwen serve
```

输出：

```text
qwen serve listening on http://127.0.0.1:4170 (mode=http-bridge, workspace=/your/cwd)
qwen serve: bound to workspace "/your/cwd"
qwen serve: bearer auth disabled (loopback default). Set QWEN_SERVER_TOKEN to enable.
```

在浏览器中打开 `http://127.0.0.1:4170/demo` 可以查看调试控制台：包含聊天 UI、事件流和工作区检查。在默认 loopback 开发模式下，`/demo` 在 `packages/cli/src/serve/server.ts` 的 loopback 路由分支中注册于 `bearerAuth` **之前**，因此无需 token。

## 2. 启动示例

```bash
# 1. 本地开发默认（loopback，无 token）
qwen serve

# 2. 指定工作区 + 临时端口
qwen serve --workspace /path/to/repo --port 0

# 3. 加固的 loopback 开发模式（在 loopback 上也强制要求 bearer 认证）
QWEN_SERVER_TOKEN=$(openssl rand -hex 32) qwen serve --require-auth

# 4. 暴露到局域网（非 loopback 需要 token）
QWEN_SERVER_TOKEN=$(openssl rand -hex 32) \
  qwen serve --hostname 0.0.0.0 --port 4170

# 5. 调整最大会话数和更大的重播环缓冲区
qwen serve --max-sessions 0 --event-ring-size 32000

# 6. 多客户端协作 + 严格 MCP 预算限制
QWEN_SERVER_TOKEN=secret \
  qwen serve --require-auth \
             --mcp-client-budget 10 \
             --mcp-budget-mode enforce

# 7. 使用 settings.json 中配置的共识策略启动
# settings.json: { "policy": { "permissionStrategy": "consensus", "consensusQuorum": 2 } }
qwen serve

# 8. 开启调试日志
QWEN_SERVE_DEBUG=1 qwen serve

# 9. 禁用 F2 池（回退到按会话创建 MCP 客户端）
QWEN_SERVE_NO_MCP_POOL=1 qwen serve

# 10. 允许浏览器 Web UI 跨域访问
QWEN_SERVER_TOKEN=secret \
  qwen serve --allow-origin 'http://localhost:3000'

# 11. 提示超时 + SSE 空闲超时
qwen serve --prompt-deadline-ms 300000 --writer-idle-timeout-ms 600000

# 12. 最后一个会话关闭后保持 ACP 子进程活跃
qwen serve --channel-idle-timeout-ms 60000

# 13. 启用 HTTP 速率限制
QWEN_SERVE_RATE_LIMIT=1 qwen serve
```

使用加固 loopback 模式（示例 3）时，`/demo` 在 `bearerAuth` 之后注册。普通浏览器导航需要 auth 头，因此请改用 curl 或 SDK 脚本。

## 3. 完整启动参数

CLI 定义在 **`packages/cli/src/commands/serve.ts`** 中：

| 参数                                    | 类型                           | 默认值                                       | 必填条件                                     | 说明                                                                                                                                                                                                                |
| --------------------------------------- | ------------------------------ | -------------------------------------------- | -------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--port <n>`                            | number                         | `4170`                                       | -                                            | TCP 端口；`0` 表示 OS 分配的临时端口。                                                                                                                                                                               |
| `--hostname <host>`                     | string                         | `127.0.0.1`                                  | 非 loopback 需要 token                       | 绑定地址。Loopback 值：`127.0.0.1`、`localhost`、`::1`、`[::1]`。`[::1]` 的方括号会自动去除；`host:port` 格式输入会被拒绝并提示使用 `--port`。                                                                        |
| `--token <s>`                           | string                         | env / 无                                     | 非 loopback 及 `--require-auth`              | Bearer token；去除一次首尾空白。**会出现在 `/proc/<pid>/cmdline` 中，建议优先使用 `QWEN_SERVER_TOKEN`**。启动时 stderr 也会对此发出警告。                                                                              |
| `--max-sessions <n>`                    | number                         | `20`                                         | -                                            | 活跃会话上限。超出时 spawn 返回 503。`0` 表示无限制。`NaN` / 负值会抛出异常。                                                                                                                                         |
| `--max-pending-prompts-per-session <n>` | number                         | `5`                                          | -                                            | 每个会话可接受的待处理/运行中提示上限。超出时返回 503。`0` / `Infinity` 表示无限制。负数或非整数值会抛出异常。                                                                                                          |
| `--workspace <dir>`                     | string                         | `process.cwd()`                              | -                                            | 绑定的工作区。**必须是绝对路径、必须存在且必须是目录**。启动时通过 `canonicalizeWorkspace` 规范化一次。`POST /session` 若 `cwd` 不匹配则返回 `400 workspace_mismatch`。                                                  |
| `--max-connections <n>`                 | number                         | `256`                                        | -                                            | 监听器级别的 `server.maxConnections`。`0` / `Infinity` 表示无限制。`NaN` / 负值会导致启动失败，以避免 fail-open 行为。                                                                                                 |
| `--require-auth`                        | boolean                        | `false`                                      | 需要 token                                   | 将 bearer 认证扩展到 loopback **以及** `/health`。未提供 token 时启动拒绝。                                                                                                                                            |
| `--enable-session-shell`                | boolean                        | `false`                                      | 需要 token                                   | 启用直接 `POST /session/:id/shell` 执行。调用方还需发送会话绑定的 `X-Qwen-Client-Id`。                                                                                                                                 |
| `--event-ring-size <n>`                 | number                         | `8000`                                       | -                                            | 每个会话的 SSE 重播环深度。软上限为 `MAX_EVENT_RING_SIZE = 1_000_000`；超出范围的值在 bridge 构建时抛出异常。                                                                                                           |
| `--http-bridge`                         | boolean                        | `true`                                       | -                                            | Stage 1 bridge 模式：一个 `qwen --acp` 子进程由 daemon 多路复用。Stage 2 进程内模式尚未实现；`--no-http-bridge` 会回退并向 stderr 打印信息。                                                                             |
| `--mcp-client-budget <n>`               | number                         | 无                                           | `mcp-budget-mode=enforce` 时必填             | 工作区 MCP 客户端上限。必须是正整数。                                                                                                                                                                                  |
| `--mcp-budget-mode <m>`                 | `'enforce' \| 'warn' \| 'off'` | 设置预算时为 `warn`，否则为 `off`            | `enforce` 需要 `--mcp-client-budget`         | `enforce` 拒绝超限，`warn` 仅在 75% 时警告，`off` 仅用于观察。                                                                                                                                                        |
| `--allow-origin <pattern>`              | 可重复的 string                | 无                                           | -                                            | 替换默认 Origin 拒绝策略的 CORS 白名单。`*` 需要 token。                                                                                                                                                               |
| `--allow-private-auth-base-url`         | boolean                        | `false`                                      | -                                            | 允许 localhost / 私有网络认证提供商 `baseUrl` 安装。仅用于可信的本地开发。                                                                                                                                              |
| `--prompt-deadline-ms <n>`              | number                         | 无                                           | -                                            | 服务端提示挂钟时间限制（毫秒）；超时后中止提示。                                                                                                                                                                       |
| `--writer-idle-timeout-ms <n>`          | number                         | 无                                           | -                                            | 每个 SSE 连接的空闲超时（毫秒）。                                                                                                                                                                                      |
| `--channel-idle-timeout-ms <n>`         | number                         | `0`                                          | -                                            | 最后一个会话关闭后保持 ACP 子进程存活的时间。`0` 表示立即回收。                                                                                                                                                        |
| `--session-reap-interval-ms <n>`        | number                         | `60000`                                      | -                                            | 会话回收器扫描间隔。`0` 表示禁用。                                                                                                                                                                                     |
| `--session-idle-timeout-ms <n>`         | number                         | `1800000`                                    | -                                            | 断连会话的空闲超时。`0` 表示禁用。                                                                                                                                                                                     |
| `--rate-limit` / `--no-rate-limit`      | boolean                        | env / 关闭                                   | -                                            | 启用或禁用按层级的 HTTP 速率限制。                                                                                                                                                                                     |
| `--rate-limit-prompt <n>`               | number                         | `10`                                         | `--rate-limit`                               | 每个时间窗口内的提示请求数。                                                                                                                                                                                           |
| `--rate-limit-mutation <n>`             | number                         | `30`                                         | `--rate-limit`                               | 每个时间窗口内的变更请求数。                                                                                                                                                                                           |
| `--rate-limit-read <n>`                 | number                         | `120`                                        | `--rate-limit`                               | 每个时间窗口内的读取请求数。                                                                                                                                                                                           |
| `--rate-limit-window-ms <n>`            | number                         | `60000`                                      | `--rate-limit`                               | 速率限制时间窗口长度；必须 `>= 1000`。                                                                                                                                                                                 |

## 4. 环境变量

| 环境变量                            | 等效参数 / 说明                                                                                                                                                         |
| ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `QWEN_SERVER_TOKEN`                 | 等效于 `--token`；`--token` 优先。启动时去除一次首尾空白，以避免 `cat token.txt` 带来的尾部换行符。                                                                      |
| `QWEN_SERVE_DEBUG`                  | `1` / `true` / `on` / `yes`（不区分大小写）启用详细 stderr 日志。                                                                                                       |
| `QWEN_SERVE_NO_MCP_POOL`            | `1` 完全禁用工作区 MCP 池，回退到每会话的 `McpClientManager`。Capabilities 将停止广播 `mcp_workspace_pool` / `mcp_pool_restart`。                                        |
| `QWEN_SERVE_MCP_CLIENT_BUDGET`      | ACP 子进程内部预算输入。CLI 通过 `childEnvOverrides` 从 `--mcp-client-budget` 生成；不是父进程的 env 回退。                                                              |
| `QWEN_SERVE_MCP_BUDGET_MODE`        | ACP 子进程内部预算模式。CLI 通过 `childEnvOverrides` 从 `--mcp-budget-mode` 生成；不是父进程的 env 回退。                                                                |
| `QWEN_SERVE_PROMPT_DEADLINE_MS`     | `--prompt-deadline-ms` 的环境变量回退。                                                                                                                                  |
| `QWEN_SERVE_WRITER_IDLE_TIMEOUT_MS` | `--writer-idle-timeout-ms` 的环境变量回退。                                                                                                                              |
| `QWEN_SERVE_MCP_POOL_TRANSPORTS`    | 由 ACP 子进程读取。逗号分隔的池化 transport 白名单；默认值为 `stdio,websocket`。                                                                                          |
| `QWEN_SERVE_MCP_POOL_DRAIN_MS`      | 由 ACP 子进程读取。池条目空闲排水延迟；默认值为 `30000`，范围限制在 `1000..600000` 毫秒。                                                                                 |
| `QWEN_SERVE_RATE_LIMIT`             | `1` / `true` 启用速率限制；CLI 参数优先。                                                                                                                                |
| `QWEN_SERVE_RATE_LIMIT_PROMPT`      | `--rate-limit-prompt` 的环境变量回退。                                                                                                                                   |
| `QWEN_SERVE_RATE_LIMIT_MUTATION`    | `--rate-limit-mutation` 的环境变量回退。                                                                                                                                 |
| `QWEN_SERVE_RATE_LIMIT_READ`        | `--rate-limit-read` 的环境变量回退。                                                                                                                                     |
| `QWEN_SERVE_RATE_LIMIT_WINDOW_MS`   | `--rate-limit-window-ms` 的环境变量回退。                                                                                                                                |

按句柄配置环境变量覆盖是有意为之：在同一进程中运行的两个 daemon 不会在 `process.env` 上产生竞争。`defaultSpawnChannelFactory` 在 spawn 时对 env 进行快照。

## 5. 也会读取 `settings.json`

启动时调用一次 `loadSettings(boundWorkspace)`：

| 键                          | 类型                                                               | 行为                                                                                                                                                                 |
| --------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `policy.permissionStrategy` | `'first-responder' \| 'designated' \| 'consensus' \| 'local-only'` | 设置 `BridgeOptions.permissionPolicy`。**启动时通过 `validatePolicyConfig` 进行校验**；未知值抛出 `InvalidPolicyConfigError` 而不是静默回退。                            |
| `policy.consensusQuorum`    | 正整数                                                              | `consensus` 策略的 N 值。默认为 `floor(M/2)+1`。若在非 consensus 策略下设置此值，会被忽略并向 stderr 打印警告。                                                          |
| `context.fileName`          | string                                                              | 覆盖 `getCurrentGeminiMdFilename()`，并控制 `POST /workspace/init` 写入的文件。                                                                                          |
| `tools.disabled`            | string[]                                                            | 在影响下一次 ACP 子进程 spawn 之前，通过 `normalizeDisabledToolList()` 规范化（去除空白、删除空条目、去重）。                                                              |
| `tools.approvalMode`        | string                                                              | 默认的会话审批模式。                                                                                                                                                      |
| `telemetry`                 | object                                                              | OTel 配置：`enabled`、`otlpEndpoint`、`otlpProtocol`、各信号端点等。详见 [`17-configuration.md`](./17-configuration.md)。                                                |

Settings 读写失败（如 JSON 格式错误）会回退到默认值。`InvalidPolicyConfigError` 是例外：策略配置错误会显式导致启动失败。

## 6. 启动拒绝场景（明确失败）

`run-qwen-serve.ts` 在以下情况会主动抛出异常而非回退：

| 场景                                                                          | 错误前缀                                                                                            |
| ----------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| 非 loopback 绑定但未提供 token                                                | `Refusing to bind ... without a bearer token`                                                       |
| `--require-auth` 但未提供 token                                               | `Refusing to start with --require-auth set but no bearer token`                                     |
| `--workspace` 不存在、不是目录或不是绝对路径                                  | `Invalid --workspace ...`                                                                           |
| `--workspace` stat 权限被拒                                                   | `Invalid --workspace ...: permission denied`                                                        |
| `--mcp-client-budget` 不是正整数                                              | `Must be a positive integer`                                                                        |
| `--mcp-budget-mode=enforce` 但未设置预算                                      | `requires a positive mcpClientBudget`                                                               |
| `--hostname` 写成 `localhost:4170`                                            | `looks like a "host:port" combination. Use --port`                                                  |
| `--hostname [::1]:8080`                                                       | `Invalid --hostname ... brackets indicate an IPv6 literal but the value is not a clean [addr] form` |
| `--max-connections` 为 `NaN` 或负值                                           | `Must be >= 0`                                                                                      |
| `--event-ring-size > 1_000_000`                                               | 在 bridge 构建时抛出                                                                                 |
| `--allow-origin '*'` 但未配置 token                                           | `Refusing to start with --allow-origin '*' but no bearer token configured`                          |
| `--prompt-deadline-ms` / `--writer-idle-timeout-ms` 不是正整数               | `Must be a positive integer`                                                                        |
| 未知的 `policy.permissionStrategy` 或非正数的 `policy.consensusQuorum`        | `InvalidPolicyConfigError`                                                                          |

## 7. curl 验证清单

```bash
# 1. 存活检查
curl http://127.0.0.1:4170/health
# -> {"status":"ok"}

# 1.1 深度健康检查
curl -s 'http://127.0.0.1:4170/health?deep=1' | jq

# 2. Capabilities
curl -s http://127.0.0.1:4170/capabilities | jq

# 3. 预检就绪
curl -s http://127.0.0.1:4170/workspace/preflight | jq

# 4. 环境快照（密钥仅报告是否存在）
curl -s http://127.0.0.1:4170/workspace/env | jq

# 5. MCP 池 / 预算快照
curl -s http://127.0.0.1:4170/workspace/mcp | jq

# 6. 创建会话
curl -s -X POST http://127.0.0.1:4170/session \
  -H 'Content-Type: application/json' \
  -H 'X-Qwen-Client-Id: curl-debug' \
  -d '{}' | jq

# 7. 追踪 SSE（替换 <sid>）
curl -N \
  -H 'Accept: text/event-stream' \
  -H 'X-Qwen-Client-Id: curl-debug' \
  -H 'Last-Event-ID: 0' \
  'http://127.0.0.1:4170/session/<sid>/events'

# 8. Demo 页面
open http://127.0.0.1:4170/demo
```

启用 bearer 认证后，每个请求都需添加 `-H "Authorization: Bearer $QWEN_SERVER_TOKEN"`。

## 8. Demo 页面是否可用？

**可以。** 它由 `packages/cli/src/serve/demo.ts` 中的 `getDemoHtml(port)` 实现，是一个不依赖任何外部资源的自包含 HTML 页面。

| 启动模式                          | `/demo` 的注册位置                                                  | 直接浏览器访问                                         |
| --------------------------------- | ------------------------------------------------------------------- | ------------------------------------------------------ |
| Loopback 且未使用 `--require-auth` | `server.ts` loopback 预认证路由分支，**位于** `bearerAuth` **之前** | 无需 token 即可访问                                    |
| Loopback 且使用 `--require-auth`  | `server.ts` 后认证路由分支，**位于** `bearerAuth` **之后**          | 普通浏览器难以使用；请改用 curl 或 SDK                  |
| 非 loopback 绑定                  | `server.ts` 后认证路由分支，**位于** `bearerAuth` **之后**          | 同上                                                   |

CSP 为 `default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; frame-ancestors 'none'`，外加 `X-Frame-Options: DENY`。该页面只能请求 `'self'`（即 daemon），无法加载外部脚本或样式。

## 9. 从 `qwen serve` 到监听服务器的调用链路

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
serve/server.ts                    createServeApp() - 构建 Express app（**不监听**）
   |  |- middleware 链（Host 白名单 / CORS / bearerAuth / mutation gate / rate limit）
   |  |- 路由挂载（health / demo / capabilities / workspace / session / SSE / ACP HTTP）
   |  `- return app
   |
   v
serve/run-qwen-serve.ts              server = app.listen(port, hostname, cb)
   |  |- server.maxConnections = cap
   |  |- actualPort = server.address().port
   |  |- 写入 "qwen serve listening on ..."
   |  |- 注册 SIGINT / SIGTERM（onSignal）
   |  `- resolve(handle: RunHandle)
   |
   v
commands/serve.ts                  await blockForever()    // 永久阻塞直到收到信号
```

关键说明：

- **`createServeApp` 只负责构建，不负责监听。** 它返回一个已挂载 middleware 和路由的 `express()` 实例。调用方自行调用 `app.listen()`。`server.test.ts` 在约 25 个测试用例中就是这样使用该工厂的，因此工厂刻意不持有生命周期。
- **`() => actualPort` 是懒加载闭包。** `actualPort` 在 `app.listen` 回调中赋值。`hostAllowlist` middleware 按需读取它，因此临时端口（`--port 0`）也能正确校验 `Host` 头。
- **`await blockForever()` 是有意为之。** 若 `yargs.parse()` resolve，CLI 顶层会进入交互式 TUI 入口（`gemini.tsx`）。SIGINT / SIGTERM 通过 `runQwenServe` 的 `onSignal` 路径退出。

## 10. HTTP 路由文件划分

主要组装发生在 `server.ts` 的 `createServeApp()` 中，它挂载了四个模块化路由文件：

| 路由                                                                                                                        | 文件                                                    | 挂载入口                                              |
| ------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- | --------------------------------------------- |
| `/health`、`/demo`、`/capabilities`、所有 session 路由、device flow、permission vote、SSE 以及单服务器 MCP 重启 | `packages/cli/src/serve/server.ts`                    | 直接注册在 `createServeApp()` 内                |
| `/workspace/memory`（GET/POST）                                                                                            | `packages/cli/src/serve/workspace-memory.ts`           | `mountWorkspaceMemoryRoutes()`                |
| 所有 `/workspace/agents` CRUD 路由                                                                                          | `packages/cli/src/serve/workspace-agents.ts`           | `mountWorkspaceAgentsRoutes()`                |
| `GET /file`、`/file/bytes`、`/list`、`/glob`、`/stat`                                                                      | `packages/cli/src/serve/routes/workspace-file-read.ts`  | `registerWorkspaceFileReadRoutes()`           |
| `POST /file/write`、`/file/edit`                                                                                           | `packages/cli/src/serve/routes/workspace-file-write.ts` | `registerWorkspaceFileWriteRoutes()`          |

完整的路由和通信协议参考，请见 [`../qwen-serve-protocol.md`](../qwen-serve-protocol.md)。架构说明请见 [`01-architecture.md`](./01-architecture.md)。

## 11. 优雅关闭与强制关闭

- **第一次 SIGINT / SIGTERM** -> `runQwenServe` `onSignal` -> 两阶段优雅关闭：
  1. `bridge.shutdown()`：每个 channel 等待 `KILL_HARD_DEADLINE_MS`（10s），然后执行 `channel.kill()`。
  2. `server.close()`：等待飞行中的请求完成，`SHUTDOWN_FORCE_CLOSE_MS`（5s）后触发 `closeAllConnections()`，之后再等待 2s。
- **关闭过程中再次收到 SIGINT / SIGTERM** -> `bridge.killAllSync()` 同步 SIGKILL 所有 ACP 子进程并调用 `process.exit(1)`，以避免产生孤儿进程。

`runQwenServe` 返回的 `RunHandle.close()` 是供嵌入者和测试使用的等效编程接口。

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
// ... 直接调用 handle.bridge 或访问 handle.server
await handle.close(); // 编程式关闭
```

或直接获取 Express app 并自行监听：

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

注意：直接调用 `createServeApp` 时，默认的 `fsFactory.trusted = false`。Agent 端的 ACP `writeTextFile` 会被拒绝并返回 `untrusted_workspace`，且 stderr 会打印一次警告。请注入带有显式信任的 `deps.fsFactory`、注入 `deps.bridge`，或接受信任门控的默认行为。

## 13. 调试方法

请参阅 [`19-observability.md`](./19-observability.md) 中的调试部分。常用命令如下：

```bash
# daemon 是否存活？
curl http://127.0.0.1:4170/health

# 广播了哪些 capabilities？
curl -s http://127.0.0.1:4170/capabilities | jq

# daemon 主机就绪状态
curl -s http://127.0.0.1:4170/workspace/preflight | jq

# 追踪实时 SSE
curl -N -H 'Accept: text/event-stream' \
     -H 'Last-Event-ID: 0' \
     'http://127.0.0.1:4170/session/<sid>/events'

# 详细日志
QWEN_SERVE_DEBUG=1 qwen serve
```

## 参考资料

- CLI 入口：`packages/cli/src/commands/serve.ts`
- 启动引导：`packages/cli/src/serve/run-qwen-serve.ts`
- Express 工厂：`packages/cli/src/serve/server.ts`
- Middleware：`packages/cli/src/serve/auth.ts`
- Bridge 工厂：`packages/acp-bridge/src/bridge.ts`
- Demo 页面 HTML：`packages/cli/src/serve/demo.ts`
- 用户文档：[`../../users/qwen-serve.md`](../../users/qwen-serve.md)
- 通信协议：[`../qwen-serve-protocol.md`](../qwen-serve-protocol.md)
