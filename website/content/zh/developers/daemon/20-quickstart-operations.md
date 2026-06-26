# 快速入门与操作

本页重点介绍**如何启动 `qwen serve`，如何验证其正常工作，以及从 `qwen serve` 到监听服务器之间的内部调用链**。关于架构、组件和线路协议细节，请参考其他守护进程深入解读页面。

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

在浏览器中打开 `http://127.0.0.1:4170/demo` 即可看到调试控制台：聊天界面、事件流和工作区检查。在默认的回环开发模式下，`/demo` 在 `packages/cli/src/serve/server.ts` 的回环路由分支中注册于 `bearerAuth` **之前**，因此无需 token。

## 2. 启动配方

```bash
# 1. 本地开发默认（回环，无 token）
qwen serve

# 2. 显式指定工作区 + 临时端口
qwen serve --workspace /path/to/repo --port 0

# 3. 强化回环开发（即使在回环上也强制 bearer）
QWEN_SERVER_TOKEN=$(openssl rand -hex 32) qwen serve --require-auth

# 4. 暴露到局域网（非回环需要 token）
QWEN_SERVER_TOKEN=$(openssl rand -hex 32) \
  qwen serve --hostname 0.0.0.0 --port 4170

# 5. 针对大量会话和更大的回放环进行调优
qwen serve --max-sessions 0 --event-ring-size 32000

# 6. 多客户端协作 + 严格 MCP 预算
QWEN_SERVER_TOKEN=secret \
  qwen serve --require-auth \
             --mcp-client-budget 10 \
             --mcp-budget-mode enforce

# 7. 使用 settings.json 中配置的共识策略启动
# settings.json: { "policy": { "permissionStrategy": "consensus", "consensusQuorum": 2 } }
qwen serve

# 8. 调试日志
QWEN_SERVE_DEBUG=1 qwen serve

# 9. 禁用 F2 池（回退到基于会话的 MCP 客户端）
QWEN_SERVE_NO_MCP_POOL=1 qwen serve

# 10. 允许浏览器 Web UI 跨域访问
QWEN_SERVER_TOKEN=secret \
  qwen serve --allow-origin 'http://localhost:3000'

# 11. 提示截止时间 + SSE 空闲超时
qwen serve --prompt-deadline-ms 300000 --writer-idle-timeout-ms 600000

# 12. 最后一个会话关闭后保持 ACP 子进程存活
qwen serve --channel-idle-timeout-ms 60000

# 13. 启用 HTTP 速率限制
QWEN_SERVE_RATE_LIMIT=1 qwen serve
```

使用强化回环配方（3）时，`/demo` 在 `bearerAuth` 之后注册。普通的浏览器导航需要 auth header，请改用 curl 或 SDK 脚本。

## 3. 完整启动参数

CLI 定义在 **`packages/cli/src/commands/serve.ts`** 中：

| 标志                                    | 类型                           | 默认值                                      | 何时必须                            | 效果                                                                                                                                                                                                                  |
| --------------------------------------- | ------------------------------ | -------------------------------------------- | ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--port <n>`                            | number                         | `4170`                                       | -                                        | TCP 端口；`0` 表示由操作系统分配的临时端口。                                                                                                                                                                           |
| `--hostname <host>`                     | string                         | `127.0.0.1`                                  | 非回环需要 token              | 绑定地址。回环值：`127.0.0.1`、`localhost`、`::1`、`[::1]`。`[::1]` 括号自动去除；`host:port` 格式输入会被拒绝并提示使用 `--port`。                                                                                     |
| `--token <s>`                           | string                         | 环境变量 / 无                               | 非回环且 `--require-auth`        | Bearer token；仅修剪一次。**它会出现在 `/proc/<pid>/cmdline` 中，因此推荐使用 `QWEN_SERVER_TOKEN`**。启动 stderr 也会对此发出警告。                                                                                     |
| `--max-sessions <n>`                    | number                         | `20`                                         | -                                        | 活跃会话上限。超出将返回 503。`0` 表示无限制。`NaN` / 负值会抛出异常。                                                                                                                                    |
| `--max-pending-prompts-per-session <n>` | number                         | `5`                                          | -                                        | 每个会话允许的已接受但待处理/运行中的提示上限。超出将返回 503。`0` / `Infinity` 表示无限制。负值或非整数值会抛出异常。                                                                                                   |
| `--workspace <dir>`                     | string                         | `process.cwd()`                              | -                                        | 绑定的工作区。**必须是绝对路径，必须存在，并且必须是目录**。启动时通过 `canonicalizeWorkspace` 规范化一次。`POST /session` 时若 `cwd` 不匹配则返回 `400 workspace_mismatch`。                                                 |
| `--max-connections <n>`                 | number                         | `256`                                        | -                                        | 监听器级别的 `server.maxConnections`。`0` / `Infinity` 表示无限制。`NaN` / 负值会导致启动失败，以避免 fail-open 行为。                                                                                                   |
| `--require-auth`                        | boolean                        | `false`                                      | 需要 token                           | 将 bearer 认证扩展到回环 **以及 `/health`**。如果没有 token，启动时会拒绝启动。                                                                                                                                        |
| `--enable-session-shell`                | boolean                        | `false`                                      | 需要 token                           | 启用直接 `POST /session/:id/shell` 执行。调用者还必须发送一个与会话绑定的 `X-Qwen-Client-Id`。                                                                                                                          |
| `--event-ring-size <n>`                 | number                         | `8000`                                       | -                                        | 每个会话的 SSE 回放环深度。软上限为 `MAX_EVENT_RING_SIZE = 1_000_000`；超出范围的值会在桥接构造时抛出异常。                                                                                                           |
| `--http-bridge`                         | boolean                        | `true`                                       | -                                        | 阶段 1 桥接模式：一个由守护进程复用的 `qwen --acp` 子进程。阶段 2 进程内模式尚未实现；`--no-http-bridge` 会回退并打印到 stderr。                                                                                      |
| `--mcp-client-budget <n>`               | number                         | 无                                         | `mcp-budget-mode=enforce` 时必需   | 工作区 MCP 客户端上限。必须为正整数。                                                                                                                                                                                    |
| `--mcp-budget-mode <m>`                 | `'enforce' \| 'warn' \| 'off'` | 设置了预算时为 `warn`，否则为 `off` | `enforce` 需要 `--mcp-client-budget` | `enforce` 拒绝，`warn` 仅警告（75% 时），`off` 仅为观察。                                                                                                                                                               |
| `--allow-origin <pattern>`              | repeatable string              | 无                                         | -                                        | CORS 允许列表，替换默认的 Origin 拒绝。`*` 需要 token。                                                                                                                                                                 |
| `--allow-private-auth-base-url`         | boolean                        | `false`                                      | -                                        | 允许 localhost / 私有网络认证提供者的 `baseUrl` 安装。仅用于受信任的本地开发。                                                                                                                                          |
| `--prompt-deadline-ms <n>`              | number                         | 无                                         | -                                        | 服务端提示的墙钟时间限制（毫秒）；超时则中止提示。                                                                                                                                                                    |
| `--writer-idle-timeout-ms <n>`          | number                         | 无                                         | -                                        | 每个 SSE 连接的空闲超时（毫秒）。                                                                                                                                                                                        |
| `--channel-idle-timeout-ms <n>`         | number                         | `0`                                          | -                                        | 最后一个会话关闭后保持 ACP 子进程存活。`0` 表示立即回收。                                                                                                                                                               |
| `--session-reap-interval-ms <n>`        | number                         | `60000`                                      | -                                        | 会话回收器扫描间隔。`0` 禁用它。                                                                                                                                                                                        |
| `--session-idle-timeout-ms <n>`         | number                         | `1800000`                                    | -                                        | 已断开会话的空闲超时。`0` 禁用它。                                                                                                                                                                                     |
| `--rate-limit` / `--no-rate-limit`      | boolean                        | 环境变量 / 关闭                              | -                                        | 启用或禁用按层 HTTP 速率限制。                                                                                                                                                                                          |
| `--rate-limit-prompt <n>`               | number                         | `10`                                         | `--rate-limit`                           | 每个窗口的提示请求数。                                                                                                                                                                                               |
| `--rate-limit-mutation <n>`             | number                         | `30`                                         | `--rate-limit`                           | 每个窗口的变更请求数。                                                                                                                                                                                               |
| `--rate-limit-read <n>`                 | number                         | `120`                                        | `--rate-limit`                           | 每个窗口的读取请求数。                                                                                                                                                                                               |
| `--rate-limit-window-ms <n>`            | number                         | `60000`                                      | `--rate-limit`                           | 速率限制窗口长度；必须 `>= 1000`。                                                                                                                                                                                  |

## 4. 环境变量

| 环境变量                             | 等效标志 / 效果                                                                                                                                                     |
| ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `QWEN_SERVER_TOKEN`                 | 等效于 `--token`；`--token` 优先级更高。启动时修剪一次，以避免 `cat token.txt` 带来的尾部换行。                                                                         |
| `QWEN_SERVE_DEBUG`                  | `1` / `true` / `on` / `yes`（不区分大小写）启用详细 stderr 日志。                                                                                                       |
| `QWEN_SERVE_NO_MCP_POOL`            | `1` 完全禁用工作区 MCP 池，回退到基于会话的 `McpClientManager`。能力将停止通告 `mcp_workspace_pool` / `mcp_pool_restart`。                                                 |
| `QWEN_SERVE_MCP_CLIENT_BUDGET`      | ACP 子进程内部预算输入。CLI 通过 `childEnvOverrides` 从 `--mcp-client-budget` 生成；不是父进程环境变量的回退。                                                              |
| `QWEN_SERVE_MCP_BUDGET_MODE`        | ACP 子进程内部预算模式。CLI 通过 `childEnvOverrides` 从 `--mcp-budget-mode` 生成；不是父进程环境变量的回退。                                                              |
| `QWEN_SERVE_PROMPT_DEADLINE_MS`     | `--prompt-deadline-ms` 的环境变量回退。                                                                                                                                  |
| `QWEN_SERVE_WRITER_IDLE_TIMEOUT_MS` | `--writer-idle-timeout-ms` 的环境变量回退。                                                                                                                              |
| `QWEN_SERVE_MCP_POOL_TRANSPORTS`    | 由 ACP 子进程读取。逗号分隔的池化传输允许列表；默认为 `stdio,websocket`。                                                                                                  |
| `QWEN_SERVE_MCP_POOL_DRAIN_MS`      | 由 ACP 子进程读取。池条目空闲排空延迟；默认为 `30000`，限制在 `1000..600000` 毫秒之间。                                                                                   |
| `QWEN_SERVE_RATE_LIMIT`             | `1` / `true` 启用速率限制；CLI 标志优先级更高。                                                                                                                           |
| `QWEN_SERVE_RATE_LIMIT_PROMPT`      | `--rate-limit-prompt` 的环境变量回退。                                                                                                                                   |
| `QWEN_SERVE_RATE_LIMIT_MUTATION`    | `--rate-limit-mutation` 的环境变量回退。                                                                                                                                 |
| `QWEN_SERVE_RATE_LIMIT_READ`        | `--rate-limit-read` 的环境变量回退。                                                                                                                                     |
| `QWEN_SERVE_RATE_LIMIT_WINDOW_MS`   | `--rate-limit-window-ms` 的环境变量回退。                                                                                                                                |

每个句柄的环境变量覆盖是有意为之：同一个进程中的两个守护进程不会在 `process.env` 上产生竞态。`defaultSpawnChannelFactory` 在生成时拍摄 env 快照。

## 5. `settings.json` 也会被读取

启动时调用一次 `loadSettings(boundWorkspace)`：

| 键                         | 类型                                                               | 行为                                                                                                                                                                 |
| --------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `policy.permissionStrategy` | `'first-responder' \| 'designated' \| 'consensus' \| 'local-only'` | 设置 `BridgeOptions.permissionPolicy`。**启动时通过 `validatePolicyConfig` 验证**；未知值会抛出 `InvalidPolicyConfigError`，而非静默回退。                                  |
| `policy.consensusQuorum`    | 正整数                                                             | 用于 `consensus` 策略的 N。默认为 `floor(M/2)+1`。如果在非 consensus 策略下设置，则忽略并记录 stderr 警告。                                                              |
| `context.fileName`          | string                                                             | 覆盖 `getCurrentGeminiMdFilename()`，并控制 `POST /workspace/init` 写入哪个文件。                                                                                        |
| `tools.disabled`            | string[]                                                           | 通过 `normalizeDisabledToolList()` 进行规范化（修剪、去除空条目、去重），然后影响下一次 ACP 子进程生成。                                                                   |
| `tools.approvalMode`        | string                                                             | 默认会话审批模式。                                                                                                                                                         |
| `telemetry`                 | object                                                             | OTel 配置：`enabled`、`otlpEndpoint`、`otlpProtocol`、按信号端点的等。详见 [`17-configuration.md`](./17-configuration.md)。                                               |

设置 I/O 失败（例如 JSON 格式错误）则回退到默认值。`InvalidPolicyConfigError` 是例外：策略配置错误会显式使启动失败。

## 6. 启动拒绝场景（显式失败）

`run-qwen-serve.ts` 在以下情况下会主动抛出异常，而非静默回退：

| 场景                                                                          | 错误前缀                                                                                        |
| ----------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| 非回环绑定但没有 token                                                       | `Refusing to bind ... without a bearer token`                                                       |
| `--require-auth` 但没有 token                                                 | `Refusing to start with --require-auth set but no bearer token`                                     |
| `--workspace` 不存在、不是目录或不是绝对路径                                  | `Invalid --workspace ...`                                                                           |
| `--workspace` stat 权限被拒绝                                                 | `Invalid --workspace ...: permission denied`                                                        |
| `--mcp-client-budget` 不是正整数                                             | `Must be a positive integer`                                                                        |
| `--mcp-budget-mode=enforce` 但没有预算                                       | `requires a positive mcpClientBudget`                                                               |
| `--hostname` 写成 `localhost:4170`                                            | `looks like a "host:port" combination. Use --port`                                                  |
| `--hostname [::1]:8080`                                                       | `Invalid --hostname ... brackets indicate an IPv6 literal but the value is not a clean [addr] form` |
| `--max-connections` 是 `NaN` 或负值                                          | `Must be >= 0`                                                                                      |
| `--event-ring-size > 1_000_000`                                               | 桥接构造时抛出                                                                                   |
| `--allow-origin '*'` 但没有 token                                             | `Refusing to start with --allow-origin '*' but no bearer token configured`                          |
| `--prompt-deadline-ms` / `--writer-idle-timeout-ms` 不是正整数                | `Must be a positive integer`                                                                        |
| 未知的 `policy.permissionStrategy` 或非正数的 `policy.consensusQuorum`       | `InvalidPolicyConfigError`                                                                          |
## 7. Curl 验证检查清单

```bash
# 1. 存活检查
curl http://127.0.0.1:4170/health
# -> {"status":"ok"}

# 1.1 深度健康检查
curl -s 'http://127.0.0.1:4170/health?deep=1' | jq

# 2. 能力查询
curl -s http://127.0.0.1:4170/capabilities | jq

# 3. 预检就绪状态
curl -s http://127.0.0.1:4170/workspace/preflight | jq

# 4. 环境快照（仅报告密钥是否存在）
curl -s http://127.0.0.1:4170/workspace/env | jq

# 5. MCP 池/预算快照
curl -s http://127.0.0.1:4170/workspace/mcp | jq

# 6. 创建会话
curl -s -X POST http://127.0.0.1:4170/session \
  -H 'Content-Type: application/json' \
  -H 'X-Qwen-Client-Id: curl-debug' \
  -d '{}' | jq

# 7. 跟踪 SSE（替换 <sid>）
curl -N \
  -H 'Accept: text/event-stream' \
  -H 'X-Qwen-Client-Id: curl-debug' \
  -H 'Last-Event-ID: 0' \
  'http://127.0.0.1:4170/session/<sid>/events'

# 8. 演示页面
open http://127.0.0.1:4170/demo
```

当 Bearer 认证启用时，需要在每个请求中添加 `-H "Authorization: Bearer $QWEN_SERVER_TOKEN"`。

## 8. 可以使用演示页面吗？

**可以。** 演示页面由 `packages/cli/src/serve/demo.ts` 中的 `getDemoHtml(port)` 实现，是自包含的 HTML，无外部依赖。

| 启动模式                            | `/demo` 注册的位置                                         | 直接浏览器导航                                   |
| ---------------------------------- | --------------------------------------------------------- | ------------------------------------------------ |
| Loopback 模式，未启用 `--require-auth` | `server.ts` 中 loopback 预认证路由分支，**早于** `bearerAuth` | 无需 Token 即可工作                              |
| Loopback 模式，启用 `--require-auth`  | `server.ts` 中认证后路由分支，**晚于** `bearerAuth`           | 从普通浏览器使用困难；请使用 curl 或 SDK         |
| 非 loopback 绑定                    | `server.ts` 中认证后路由分支，**晚于** `bearerAuth`           | 同上                                             |

CSP 为 `default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; frame-ancestors 'none'`，并设置 `X-Frame-Options: DENY`。页面只能获取 `'self'`（即守护进程），无法加载外部脚本或样式。

## 9. 从 `qwen serve` 到监听服务器的调用链

```text
qwen serve
   |
   v (进程)
packages/cli/index.ts              main()
   |
   v
gemini.tsx                         main() - parseArguments()
   |
   v (yargs 装配)
config/config.ts                   import { serveCommand } ...
config/config.ts                   .command(serveCommand)
config/config.ts                   await yargsInstance.parse()
   |
   v (处理函数)
commands/serve.ts                  handler(argv) - 启动预检查
commands/serve.ts                  const { runQwenServe } = await import('../serve/index.js')   # 懒加载
commands/serve.ts                  await runQwenServe({...})
   |
   v
serve/run-qwen-serve.ts              runQwenServe(opts, deps)
   |  |- 裁剪 Token
   |  |- 主机名不匹配时的回退
   |  |- 认证预检
   |  |- 工作区验证与规范化
   |  |- MCP 预算验证及子环境覆盖
   |  |- loadSettings + validatePolicyConfig
   |  |- PermissionAuditRing + publisher
   |  |- 解析 BridgeFsFactory
   |  `- createHttpAcpBridge({...})
   |
   v
serve/run-qwen-serve.ts              const app = createServeApp(opts, () => actualPort, {...})
   |
   v
serve/server.ts                    createServeApp() - 构建 Express 应用（**不监听**）
   |  |- 中间件链（Host 白名单 / CORS / bearerAuth / 突变门控 / 速率限制）
   |  |- 路由挂载（health / demo / capabilities / workspace / session / SSE / ACP HTTP）
   |  `- 返回 app
   |
   v
serve/run-qwen-serve.ts              server = app.listen(port, hostname, cb)
   |  |- server.maxConnections = cap
   |  |- actualPort = server.address().port
   |  |- 输出 "qwen serve listening on ..."
   |  |- 注册 SIGINT / SIGTERM (onSignal)
   |  `- 返回 resolve(handle: RunHandle)
   |
   v
commands/serve.ts                  await blockForever()    // 永久阻塞直到收到信号
```

关键事实：

- **`createServeApp` 仅构建；不进行监听。** 它返回一个已挂载中间件和路由的 `express()` 实例。调用方负责 `app.listen()`。`server.test.ts` 中使用此工厂模式编写了约 25 个测试用例，因此工厂函数有意避免管理生命周期。
- **`() => actualPort` 是一个惰性闭包。** `actualPort` 在 `app.listen` 回调中被赋值。`hostAllowlist` 中间件按需读取它，因此使用临时端口（`--port 0`）时仍能正确校验 `Host` 头。
- **`await blockForever()` 是有意设计的。** 如果 `yargs.parse()` 解析完成，CLI 顶层会进入交互式 TUI 入口（`gemini.tsx`）。SIGINT / SIGTERM 通过 `runQwenServe` 的 `onSignal` 路径退出。

## 10. HTTP 路由文件拆分

主要整合在 `server.ts` 的 `createServeApp()` 中完成，该函数挂载了四个模块化的路由文件：

| 路由                                                                                          | 文件                                                       | 挂载入口                                         |
| -------------------------------------------------------------------------------------------- | -------------------------------------------------------- | ------------------------------------------------ |
| `/health`, `/demo`, `/capabilities`, 所有会话路由, 设备流, 权限投票, SSE, 以及单服务器 MCP 重启 | `packages/cli/src/serve/server.ts`                       | 直接在 `createServeApp()` 内部注册                |
| `/workspace/memory` (GET/POST)                                                               | `packages/cli/src/serve/workspace-memory.ts`             | `mountWorkspaceMemoryRoutes()`                   |
| 所有 `/workspace/agents` CRUD 路由                                                           | `packages/cli/src/serve/workspace-agents.ts`             | `mountWorkspaceAgentsRoutes()`                   |
| `GET /file`, `/file/bytes`, `/list`, `/glob`, `/stat`                                        | `packages/cli/src/serve/routes/workspace-file-read.ts`   | `registerWorkspaceFileReadRoutes()`              |
| `POST /file/write`, `/file/edit`                                                             | `packages/cli/src/serve/routes/workspace-file-write.ts`  | `registerWorkspaceFileWriteRoutes()`             |

完整路由和有线协议参考，请参见 [`../qwen-serve-protocol.md`](../qwen-serve-protocol.md)。架构文档请参见 [`01-architecture.md`](./01-architecture.md)。

## 11. 优雅关闭 vs 强制关闭

- **首次 SIGINT / SIGTERM** -> `runQwenServe` 的 `onSignal` -> 两阶段优雅关闭：
  1. `bridge.shutdown()`：每个通道获得 `KILL_HARD_DEADLINE_MS`（10 秒），超时后调用 `channel.kill()`。
  2. `server.close()`：等待正在处理的请求完成，`SHUTDOWN_FORCE_CLOSE_MS`（5 秒）后触发 `closeAllConnections()`，再施加第二个 2 秒截止时间。
- **第二次 SIGINT / SIGTERM（已在退出中）** -> `bridge.killAllSync()` 同步 SIGKILL 所有 ACP 子进程，并调用 `process.exit(1)` 以避免孤儿进程。

`runQwenServe` 返回的 `RunHandle.close()` 是供嵌入器和测试程序使用的编程等效接口。

## 12. 嵌入式调用（绕过 CLI）

```ts
import { runQwenServe } from '@qwen-code/qwen-code/serve';

const handle = await runQwenServe({
  port: 0, // 临时端口
  hostname: '127.0.0.1',
  mode: 'http-bridge',
  maxSessions: 20,
  workspace: '/abs/path/to/repo',
});
console.log(`Daemon at ${handle.url}`);
// ... 直接调用 handle.bridge 或访问 handle.server
await handle.close(); // 程序化关闭
```

或者直接获取 Express 应用并自行监听：

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
    /* 依赖：bridge, fsFactory, ... */
  },
);

const server = app.listen(0, '127.0.0.1', () => {
  console.log('listening on', server.address());
});
```

注意：直接调用 `createServeApp` 时，默认 `fsFactory.trusted = false`。Agent 侧的 ACP `writeTextFile` 将被拒绝并返回 `untrusted_workspace`，同时标准错误输出会打印一次警告。请显式向 `deps.fsFactory` 注入信任，或注入 `deps.bridge`，或接受信任受限的默认行为。

## 13. 调试技巧

请参见 [`19-observability.md`](./19-observability.md) 中的调试章节。常用命令如下：

```bash
# 守护进程是否存活？
curl http://127.0.0.1:4170/health

# 公告了哪些能力？
curl -s http://127.0.0.1:4170/capabilities | jq

# 守护进程的主机就绪状态
curl -s http://127.0.0.1:4170/workspace/preflight | jq

# 跟踪实时 SSE
curl -N -H 'Accept: text/event-stream' \
     -H 'Last-Event-ID: 0' \
     'http://127.0.0.1:4170/session/<sid>/events'

# 详细日志
QWEN_SERVE_DEBUG=1 qwen serve
```

## 参考信息

- CLI 入口：`packages/cli/src/commands/serve.ts`
- 启动引导：`packages/cli/src/serve/run-qwen-serve.ts`
- Express 工厂：`packages/cli/src/serve/server.ts`
- 中间件：`packages/cli/src/serve/auth.ts`
- Bridge 工厂：`packages/acp-bridge/src/bridge.ts`
- 演示页面 HTML：`packages/cli/src/serve/demo.ts`
- 用户文档：[`../../users/qwen-serve.md`](../../users/qwen-serve.md)
- 有线协议：[`../qwen-serve-protocol.md`](../qwen-serve-protocol.md)