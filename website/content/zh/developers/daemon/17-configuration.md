# 配置参考

## 概述

本页面汇总了影响 `qwen serve` 守护进程及其适配器的所有设置：环境变量、CLI 参数、`settings.json` 键以及编程式选项。当特定功能页面需要跨领域的配置细节时，会链接回此处。

## CLI 参数 (`qwen serve`)

| 参数                                    | 类型                       | 默认值                                    | 作用                                                                                                                                                                              |
| --------------------------------------- | -------------------------- | ----------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--hostname <host>`                     | string                     | `127.0.0.1`                               | 绑定地址。环回值：`127.0.0.1`、`localhost`、`::1`、`[::1]`。非环回地址需要在启动时提供 bearer token。拒绝 `host:port` 格式的输入，并提示使用 `--port`。 |
| `--port <n>`                            | number                     | `4170`                                    | 监听端口；`0` 表示临时端口。                                                                                                                                                   |
| `--token <s>`                           | string                     | env                                       | Bearer token。覆盖 `QWEN_SERVER_TOKEN` 并在启动时进行 trim 处理。由于它会出现在进程命令行中，因此在部署时建议使用环境变量。                                           |
| `--require-auth`                        | boolean                    | `false`                                   | 将 bearer 认证扩展到环回地址和 `/health` 端点；如果没有 token，启动时将拒绝运行。                                                                                               |
| `--workspace <dir>`                     | absolute path              | `process.cwd()`                           | 绑定的工作区。必须是绝对路径且为目录；在启动时进行一次规范化处理。                                                                                                      |
| `--max-sessions <n>`                    | number                     | `20`                                      | 活跃会话上限。`0` / `Infinity` 表示无限制；`NaN` 或负值会抛出异常。                                                                                                |
| `--max-pending-prompts-per-session <n>` | number                     | `5`                                       | 每个会话已接受但处于 pending/running 状态的 prompt 上限。超出的 prompt 将返回 503。`0` / `Infinity` 表示无限制；负值或非整数值会抛出异常。                             |
| `--max-connections <n>`                 | number                     | `256`                                     | HTTP 监听器的 `server.maxConnections`；`0` / `Infinity` 表示无限制。                                                                                                            |
| `--enable-session-shell`                | boolean                    | `false`                                   | 启用直接的 `POST /session/:id/shell` 执行。需要 bearer token，且每次调用都必须携带绑定到会话的 `X-Qwen-Client-Id`。                                            |
| `--event-ring-size <n>`                 | number                     | `8000`                                    | 每个会话的 SSE 重放 ring；软上限为 `1_000_000`。                                                                                                                               |
| `--http-bridge`                         | boolean                    | `true`                                    | Stage 1 bridge 模式。`--no-http-bridge` 仍会回退到 http-bridge 并将信息打印到 stderr。                                                                                       |
| `--mcp-client-budget <n>`               | positive integer           | unset                                     | 设置 `WorkspaceMcpBudget.clientBudget` 并通过 `childEnvOverrides` 将其转发给 ACP 子进程。                                                                                |
| `--mcp-budget-mode <m>`                 | `off` / `warn` / `enforce` | 设置了 budget 时为 `warn`，否则为 `off` | 设置 `WorkspaceMcpBudget.mode`；`enforce` 需要配合 `--mcp-client-budget` 使用。                                                                                                           |
| `--allow-origin <pattern>`              | repeatable string          | unset                                     | 跨域白名单，用于替换默认的 CORS 拒绝策略。`*` 允许任何 origin，但需要 token。                                                                           |
| `--allow-private-auth-base-url`         | boolean                    | `false`                                   | 允许 `/workspace/auth/provider` 安装 localhost / 私有网络 auth provider 的 `baseUrl`；仅在受信任的本地开发环境中使用。                                            |
| `--prompt-deadline-ms <n>`              | positive integer           | unset                                     | 服务端 prompt 的绝对时间限制（毫秒）。超时将中止并返回错误。                                                                                                      |
| `--writer-idle-timeout-ms <n>`          | positive integer           | unset                                     | 每个 SSE 连接的空闲超时时间（毫秒）。如果在此时间内没有发送事件，守护进程将关闭 SSE 连接。                                                                |
| `--channel-idle-timeout-ms <n>`         | non-negative integer       | `0`                                       | 在最后一个会话关闭后，保持 ACP 子进程存活的时间。`0` 表示立即回收。                                                                                  |
| `--session-reap-interval-ms <n>`        | non-negative integer       | `60000`                                   | 会话回收扫描间隔；`0` 表示禁用。                                                                                                                                      |
| `--session-idle-timeout-ms <n>`         | non-negative integer       | `1800000`                                 | 已断开连接会话的空闲回收时间；`0` 表示禁用。                                                                                                                            |
| `--rate-limit` / `--no-rate-limit`      | boolean                    | env / off                                 | 为 prompt、mutation 和 read 路由启用分层 HTTP 速率限制。                                                                                                          |
| `--rate-limit-prompt <n>`               | positive integer           | `10`                                      | 每个时间窗口内的 prompt 请求限制；需要启用速率限制。                                                                                                              |
| `--rate-limit-mutation <n>`             | positive integer           | `30`                                      | 每个时间窗口内的 mutation 请求限制；需要启用速率限制。                                                                                                            |
| `--rate-limit-read <n>`                 | positive integer           | `120`                                     | 每个时间窗口内的 read 请求限制；需要启用速率限制。                                                                                                                |
| `--rate-limit-window-ms <n>`            | integer `>= 1000`          | `60000`                                   | 速率限制时间窗口长度；需要启用速率限制。                                                                                                                     |
| 无参数                                 | -                          | -                                         | `QWEN_SERVE_NO_MCP_POOL=1` 完全禁用 pool。                                                                                                                                 |

## 环境变量

### 由 `runQwenServe` / Express 中间件读取

| 环境变量                                 | 作用                                                                                                                                                                   |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `QWEN_SERVER_TOKEN`                 | Bearer token；在启动时进行 trim 处理。                                                                                                                                           |
| `QWEN_SERVE_DEBUG`                  | `1` / `true` / `on` / `yes`（不区分大小写）启用详细的 stderr 日志。请参阅 [`19-observability.md`](./19-observability.md)。                                          |
| `QWEN_SERVE_NO_MCP_POOL`            | `1` 禁用工作区 MCP transport pool 并回退到每个会话的 `McpClientManager`；capabilities 将停止广播 `mcp_workspace_pool` / `mcp_pool_restart`。 |
| `QWEN_SERVE_PROMPT_DEADLINE_MS`     | `--prompt-deadline-ms` 的环境变量回退值。                                                                                                                                 |
| `QWEN_SERVE_WRITER_IDLE_TIMEOUT_MS` | `--writer-idle-timeout-ms` 的环境变量回退值。                                                                                                                             |
| `QWEN_SERVE_RATE_LIMIT`             | `1` / `true` 启用分层 HTTP 速率限制；CLI 参数 `--rate-limit` / `--no-rate-limit` 优先级更高。                                                                           |
| `QWEN_SERVE_RATE_LIMIT_PROMPT`      | `--rate-limit-prompt` 的环境变量回退值。                                                                                                                                  |
| `QWEN_SERVE_RATE_LIMIT_MUTATION`    | `--rate-limit-mutation` 的环境变量回退值。                                                                                                                                |
| `QWEN_SERVE_RATE_LIMIT_READ`        | `--rate-limit-read` 的环境变量回退值。                                                                                                                                    |
| `QWEN_SERVE_RATE_LIMIT_WINDOW_MS`   | `--rate-limit-window-ms` 的环境变量回退值。                                                                                                                               |

### 通过 `BridgeOptions.childEnvOverrides` 转发给 ACP 子进程

`runQwenServe` 会为每个 handle 构建这些变量，因此同一进程中的两个守护进程不会在 `process.env` 上产生竞争。budget 变量不是 `qwen serve` 父进程的环境变量回退值；CLI 路径必须从 `--mcp-client-budget` / `--mcp-budget-mode` 生成它们。

| 环境变量                              | 作用                                                                                                                   |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `QWEN_SERVE_MCP_CLIENT_BUDGET`   | 正整数字符串，由 ACP 子进程的 `readBudgetFromEnv()` 消费。                                               |
| `QWEN_SERVE_MCP_BUDGET_MODE`     | `off` / `warn` / `enforce`。                                                                                              |
| `QWEN_SERVE_MCP_POOL_TRANSPORTS` | 逗号分隔的 transport 白名单；默认的 pooled transports 为 `stdio,websocket`；可以显式包含 `http,sse`。 |
| `QWEN_SERVE_MCP_POOL_DRAIN_MS`   | Pool 条目的空闲排空延迟；默认值为 `30000`，限制在 `1000..600000` 毫秒之间。                                              |

### 由 SDK / 适配器读取

| 环境变量                     | 作用                                                            |
| ----------------------- | ----------------------------------------------------------------- |
| `QWEN_DAEMON_URL`       | CLI TUI 适配器、channels 和 IDE companion 的守护进程 base URL。 |
| `QWEN_DAEMON_TOKEN`     | Bearer token。                                                     |
| `QWEN_DAEMON_WORKSPACE` | 覆盖发送给 `POST /session` 的 `cwd`。                      |

## `settings.json` 键

守护进程在启动时通过 `runQwenServe` 内部的 `loadSettings(boundWorkspace)` 读取一次设置。格式错误的设置会通过 try/catch 保护机制回退到默认值。

| 键                         | 类型                                                               | 作用                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| --------------------------- | ------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `policy.permissionStrategy` | `'first-responder' \| 'designated' \| 'consensus' \| 'local-only'` | 设置 `BridgeOptions.permissionPolicy`；当前生效的值会作为 `policy.permission` 出现在 `/capabilities` 中。**启动时会**通过 `validatePolicyConfig()` 对照 `SERVE_CAPABILITY_REGISTRY.permission_mediation.modes` 进行**验证**。未知的字面量会抛出 `InvalidPolicyConfigError` 并明确导致启动失败。                                                                                                                                                                                                                               |
| `policy.consensusQuorum`    | positive integer                                                   | `consensus` 策略的 N 值。**默认值**为 `votersAtIssue.size` 的 `floor(M/2) + 1`（M=2 表示一致同意；更大的偶数 M 表示超过半数）。如果在非 consensus 策略下设置，它将被忽略，并且启动时会在 stderr 打印警告。非正整数会抛出 `InvalidPolicyConfigError`。请参阅 [`04-permission-mediation.md`](./04-permission-mediation.md)。                                                                                                                                                                        |
| `context.fileName`          | string                                                             | 通过 `BridgeOptions.contextFilename` 覆盖 `getCurrentGeminiMdFilename()`。                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `tools.disabled`            | string[]                                                           | 在下次生成 ACP 子进程时禁用的工具。通过 `normalizeDisabledToolList()`（`packages/cli/src/config/normalizeDisabledTools.ts`）进行规范化：非数组变为 `[]`，非字符串条目被跳过，修剪空白，丢弃空条目，并在保留首次出现的情况下移除重复项。启动和 `restartMcpServer` 设置刷新都会运行此函数。`ToolRegistry.has(name)` 是精确且区分大小写的。`POST /workspace/tools/:name/enable` 和 `tool_toggled` 会更新此键。 |
| `tools.approvalMode`        | `'default' \| 'auto' \| ...`                                       | 默认会话审批模式；当 `persist: true` 时，`POST /session/:id/approval-mode` 会写入此处。                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `telemetry`                 | object                                                             | OTel 配置。键包括 `enabled`、`otlpEndpoint`、`otlpProtocol`、`otlpTracesEndpoint`、`otlpLogsEndpoint`、`otlpMetricsEndpoint`、`target`、`outfile`、`includeSensitiveSpanAttributes`、`sensitiveSpanAttributeMaxLength`、`resourceAttributes` 和 `metrics.includeSessionId`。`resolveTelemetrySettings()` 在启动时读取它并初始化 `initializeTelemetry()`。                                                                                                                                                             |

## `ServeOptions`（编程式嵌入）

`packages/cli/src/serve/types.ts` 定义了 `runQwenServe` 和 `createServeApp` 均接受的类型化选项对象。它映射了上述 CLI 参数并增加了以下内容：

| 字段                         | 作用                                                                                        |
| ----------------------------- | --------------------------------------------------------------------------------------------- |
| `eventRingSize`               | 覆盖默认的每个会话 ring 大小。                                                  |
| `maxPendingPromptsPerSession` | 每个会话的 pending prompt 上限；`0` / `Infinity` 表示无限制。                             |
| `mcpPoolActive`               | 编程式开关，默认值来自 `QWEN_SERVE_NO_MCP_POOL`。                                |
| `allowOrigins`                | 跨域白名单（`string[]`），对应 `--allow-origin`。                       |
| `allowPrivateAuthBaseUrl`     | 允许安装私有 / localhost auth provider 的 `baseUrl`。                              |
| `enableSessionShell`          | 启用会话 shell 执行；仍然需要 bearer token 和绑定到会话的 client id。 |
| `promptDeadlineMs`            | Prompt 绝对时间限制。                                                                       |
| `writerIdleTimeoutMs`         | SSE writer 空闲超时时间。                                                                      |
| `channelIdleTimeoutMs`        | 在最后一个会话关闭后，保持 ACP 子进程预热状态的时间。                            |
| `sessionReapIntervalMs`       | 会话回收扫描间隔。                                                                 |
| `sessionIdleTimeoutMs`        | 已断开连接会话的空闲回收时间。                                                       |
| `rateLimit*`                  | 分层 HTTP 速率限制开关、阈值和时间窗口。                                      |
## `BridgeOptions`（编程式 bridge 嵌入）

`packages/acp-bridge/src/bridgeOptions.ts` 定义了 bridge 选项。完整表格请参见 [`03-acp-bridge.md`](./03-acp-bridge.md)。关键字段如下：

| Field                                                                                                                   | Effect                                                                                        |
| ----------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `boundWorkspace`                                                                                                        | 必需的规范工作区。                                                                            |
| `sessionScope`                                                                                                          | `'single'`（默认）或 `'thread'`。                                                             |
| `initializeTimeoutMs`, `maxSessions`, `eventRingSize`, `permissionResponseTimeoutMs`, `maxPendingPermissionsPerSession` | 资源上限约束。                                                                                |
| `channelFactory`                                                                                                        | 可插拔的 ACP 子进程工厂；默认为 `defaultSpawnChannelFactory`。                                |
| `fileSystem`                                                                                                            | `BridgeFileSystem` 适配器。参见 [`07-workspace-filesystem.md`](./07-workspace-filesystem.md)。|
| `permissionPolicy`, `permissionConsensusQuorum`, `permissionAudit`                                                      | 中介器组件配置。                                                                              |
| `statusProvider`                                                                                                        | 守护进程宿主预检单元。                                                                        |
| `childEnvOverrides`                                                                                                     | 按句柄添加或移除环境变量。                                                                    |
| `contextFilename`                                                                                                       | 覆盖 `getCurrentGeminiMdFilename()`。                                                         |
| `channelIdleTimeoutMs`                                                                                                  | 最后一个会话关闭后，保持 ACP 子进程存活的时长（毫秒）；默认为 `0`。                           |

## 重要默认值

| Constant                          | File                    | Value             | Meaning                                                           |
| --------------------------------- | ----------------------- | ----------------- | ----------------------------------------------------------------- |
| `DEFAULT_MAX_SESSIONS`            | `bridge.ts`             | `20`              | 触发 `SessionLimitExceededError` 前的会话上限。                   |
| `MAX_EVENT_RING_SIZE`             | `bridge.ts`             | `1_000_000`       | `BridgeOptions.eventRingSize` 的软上限；防止输入错误。            |
| `DEFAULT_RING_SIZE`               | `eventBus.ts`           | `8000`            | 每个会话的 SSE 重放环形缓冲区深度。                               |
| `DEFAULT_MAX_QUEUED`              | `eventBus.ts`           | `256`             | 每个订阅者的队列上限。                                            |
| `DEFAULT_MAX_SUBSCRIBERS`         | `eventBus.ts`           | `64`              | 每个总线的订阅者上限。                                            |
| `WARN_THRESHOLD_RATIO`            | `eventBus.ts`           | `0.75`            | `slow_client_warning` 触发阈值。                                  |
| `WARN_RESET_RATIO`                | `eventBus.ts`           | `0.375`           | 迟滞重新触发阈值。                                                |
| `DEFAULT_INIT_TIMEOUT_MS`         | `bridge.ts`             | `10_000`          | ACP `initialize` 握手超时时间。                                   |
| `MCP_RESTART_TIMEOUT_MS`          | `bridge.ts`             | `300_000`         | `/workspace/mcp/:server/restart` 的 bridge 超时时间。             |
| `DEFAULT_PERMISSION_TIMEOUT_MS`   | `bridge.ts`             | `5 * 60_000`      | 每个权限请求的实际时间上限。                                      |
| `DEFAULT_MAX_PENDING_PER_SESSION` | `bridge.ts`             | `64`              | 与 `DEFAULT_MAX_SUBSCRIBERS` 对齐。                               |
| `MAX_RESOLVED_PERMISSION_RECORDS` | `permissionMediator.ts` | `512`             | 近期已解决权限的 FIFO 队列。                                      |
| `KILL_HARD_DEADLINE_MS`           | `spawnChannel.ts`       | `10_000`          | 每个通道的优雅关闭时间窗口。                                      |
| `SHUTDOWN_FORCE_CLOSE_MS`         | `run-qwen-serve.ts`     | `5_000`           | HTTP 服务器强制关闭计时器。                                       |
| `MAX_READ_BYTES`                  | `fs/policy.ts`          | `256 * 1024`      | 读取上限。                                                        |
| `MAX_WRITE_BYTES`                 | `fs/policy.ts`          | `5 * 1024 * 1024` | 写入上限。                                                        |
| `MAX_DISPLAY_NAME_LENGTH`         | `bridge.ts`             | `256`             | 会话 `displayName` 长度上限。                                     |

## 交叉引用

- 身份验证设置：[`12-auth-security.md`](./12-auth-security.md)
- 能力与协议版本：[`11-capabilities-versioning.md`](./11-capabilities-versioning.md)
- 事件环形缓冲区与背压调优：[`10-event-bus.md`](./10-event-bus.md)
- MCP 池 / 预算：[`05-mcp-transport-pool.md`](./05-mcp-transport-pool.md) 和 [`06-mcp-budget-guardrails.md`](./06-mcp-budget-guardrails.md)
- 权限策略：[`04-permission-mediation.md`](./04-permission-mediation.md)
- 用户操作指南：[`../../users/qwen-serve.md`](../../users/qwen-serve.md)