# 配置参考

## 概述

本页汇集了影响 `qwen serve` 守护进程及其适配器的所有设置：环境变量、CLI 标志、`settings.json` 键以及编程选项。当需要跨领域配置细节时，功能特定页面会链接回此处。

## CLI 标志 (`qwen serve`)

| 标志                                    | 类型                       | 默认值                                    | 效果                                                                                                                                                                                    |
| --------------------------------------- | -------------------------- | ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--hostname <host>`                     | 字符串                     | `127.0.0.1`                                | 绑定地址。回环值：`127.0.0.1`、`localhost`、`::1`、`[::1]`。非回环地址需要在启动时提供 bearer token。如果输入 `host:port` 格式，将被拒绝并提示使用 `--port`。 |
| `--port <n>`                            | 数字                       | `4170`                                     | 监听端口；`0` 表示临时端口。                                                                                                                                                   |
| `--token <s>`                           | 字符串                     | 环境变量                                        | Bearer token。会覆盖 `QWEN_SERVER_TOKEN`，并在启动时被修剪。它会出现在进程命令行中，因此部署时建议使用环境变量。                                           |
| `--require-auth`                        | 布尔值                    | `false`                                    | 将 bearer 认证扩展到回环地址和 `/health`；启动时如果没有 token 则拒绝启动。                                                                                               |
| `--workspace <dir>`                     | 绝对路径              | `process.cwd()`                            | 绑定的工作区。必须是绝对路径且指向目录；启动时规范化一次。                                                                                                      |
| `--max-sessions <n>`                    | 数字                     | `20`                                       | 活动会话上限。`0` / `Infinity` 表示无限制；`NaN` / 负值会抛出异常。                                                                                                |
| `--max-pending-prompts-per-session <n>` | 数字                     | `5`                                        | 每个会话已接受但待处理/运行中的提示上限。超出则返回503。`0` / `Infinity` 表示无限制；负值或非整数值会抛出异常。                             |
| `--max-connections <n>`                 | 数字                     | `256`                                      | HTTP 监听器的 `server.maxConnections`；`0` / `Infinity` 表示无限制。                                                                                                            |
| `--enable-session-shell`                | 布尔值                    | `false`                                    | 启用直接 `POST /session/:id/shell` 执行。需要 bearer token，并且每次调用必须携带会话绑定的 `X-Qwen-Client-Id`。                                            |
| `--event-ring-size <n>`                 | 数字                     | `8000`                                     | 每个会话的 SSE 重放环形缓冲区；软上限为 `1_000_000`。                                                                                                                               |
| `--http-bridge`                         | 布尔值                    | `true`                                     | 阶段1桥接模式。`--no-http-bridge` 仍然回退到 http-bridge 并打印到 stderr。                                                                                       |
| `--mcp-client-budget <n>`               | 正整数           | 未设置                                      | 设置 `WorkspaceMcpBudget.clientBudget` 并通过 `childEnvOverrides` 转发给 ACP 子进程。                                                                                |
| `--mcp-budget-mode <m>`                 | `off` / `warn` / `enforce` | 设置预算时为 `warn`，否则为 `off` | 设置 `WorkspaceMcpBudget.mode`；`enforce` 需要同时设置 `--mcp-client-budget`。                                                                                                           |
| `--allow-origin <pattern>`              | 可重复字符串          | 未设置                                      | 跨域白名单，替换默认的 CORS 拒绝。`*` 允许任何来源，但需要 token。                                                                           |
| `--allow-private-auth-base-url`         | 布尔值                    | `false`                                    | 允许 `/workspace/auth/provider` 安装 localhost / 私有网络的 auth provider `baseUrl`；仅在受信任的本地开发环境中使用。                                            |
| `--prompt-deadline-ms <n>`              | 正整数           | 未设置                                      | 服务器端提示的挂钟时间限制（毫秒）。超时中止并返回错误。                                                                                                      |
| `--writer-idle-timeout-ms <n>`          | 正整数           | 未设置                                      | 每个 SSE 连接的空闲超时（毫秒）。当在此持续时间内未发送任何事件时，守护进程关闭 SSE 连接。                                                                |
| `--channel-idle-timeout-ms <n>`         | 非负整数       | `0`                                        | 最后一个会话关闭后保持 ACP 子进程存活的时间。`0` 表示立即回收。                                                                                  |
| `--session-reap-interval-ms <n>`        | 非负整数       | `60000`                                    | 会话回收器扫描间隔；`0` 禁用。                                                                                                                                      |
| `--session-idle-timeout-ms <n>`         | 非负整数       | `1800000`                                  | 断开连接的会话空闲回收时间；`0` 禁用。                                                                                                                            |
| `--rate-limit` / `--no-rate-limit`      | 布尔值                    | 环境变量 / off                                  | 启用按层 HTTP 速率限制（提示、修改、读取路由）。                                                                                                          |
| `--rate-limit-prompt <n>`               | 正整数           | `10`                                       | 每个窗口的提示请求限制；需要启用速率限制。                                                                                                              |
| `--rate-limit-mutation <n>`             | 正整数           | `30`                                       | 每个窗口的修改请求限制；需要启用速率限制。                                                                                                            |
| `--rate-limit-read <n>`                 | 正整数           | `120`                                      | 每个窗口的读取请求限制；需要启用速率限制。                                                                                                                |
| `--rate-limit-window-ms <n>`            | 整数 `>= 1000`          | `60000`                                    | 速率限制窗口长度；需要启用速率限制。                                                                                                                     |
| 无标志                                 | -                          | -                                          | `QWEN_SERVE_NO_MCP_POOL=1` 完全禁用连接池。                                                                 |

## 环境变量

### 由 `runQwenServe` / Express 中间件读取

| 环境变量                                 | 效果                                                                                                                                                                   |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `QWEN_SERVER_TOKEN`                 | Bearer token；启动时被修剪。                                                                                                                                           |
| `QWEN_SERVE_DEBUG`                  | `1` / `true` / `on` / `yes`（不区分大小写）启用详细 stderr 日志。参见 [`19-observability.md`](./19-observability.md)。                                          |
| `QWEN_SERVE_NO_MCP_POOL`            | `1` 禁用工作区 MCP 传输连接池，回退到每个会话的 `McpClientManager`；能力声明中不再包含 `mcp_workspace_pool` / `mcp_pool_restart`。 |
| `QWEN_SERVE_PROMPT_DEADLINE_MS`     | `--prompt-deadline-ms` 的环境变量回退。                                                                                                                                 |
| `QWEN_SERVE_WRITER_IDLE_TIMEOUT_MS` | `--writer-idle-timeout-ms` 的环境变量回退。                                                                                                                             |
| `QWEN_SERVE_RATE_LIMIT`             | `1` / `true` 启用按层 HTTP 速率限制；CLI `--rate-limit` / `--no-rate-limit` 优先。                                                                           |
| `QWEN_SERVE_RATE_LIMIT_PROMPT`      | `--rate-limit-prompt` 的环境变量回退。                                                                                                                                  |
| `QWEN_SERVE_RATE_LIMIT_MUTATION`    | `--rate-limit-mutation` 的环境变量回退。                                                                                                                                |
| `QWEN_SERVE_RATE_LIMIT_READ`        | `--rate-limit-read` 的环境变量回退。                                                                                                                                    |
| `QWEN_SERVE_RATE_LIMIT_WINDOW_MS`   | `--rate-limit-window-ms` 的环境变量回退。                                                                                                                               |

### 通过 `BridgeOptions.childEnvOverrides` 转发给 ACP 子进程

`runQwenServe` 为每个句柄构建这些变量，因此同一进程中的两个守护进程不会在 `process.env` 上产生竞争。预算变量不是 `qwen serve` 的父进程环境变量回退；CLI 路径必须从 `--mcp-client-budget` / `--mcp-budget-mode` 生成它们。

| 环境变量                              | 效果                                                                                                                   |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `QWEN_SERVE_MCP_CLIENT_BUDGET`   | ACP 子进程的 `readBudgetFromEnv()` 使用的正整数形式字符串。                                               |
| `QWEN_SERVE_MCP_BUDGET_MODE`     | `off` / `warn` / `enforce`。                                                                                              |
| `QWEN_SERVE_MCP_POOL_TRANSPORTS` | 逗号分隔的传输白名单；默认池化传输为 `stdio,websocket`；可显式包含 `http,sse`。 |
| `QWEN_SERVE_MCP_POOL_DRAIN_MS`   | 连接池条目空闲排空延迟；默认 `30000`，限制在 `1000..600000` 毫秒。                                              |

### 由 SDK / 适配器读取

| 环境变量                     | 效果                                                            |
| ----------------------- | ----------------------------------------------------------------- |
| `QWEN_DAEMON_URL`       | CLI TUI 适配器、通道和 IDE 配套的守护进程基础 URL。 |
| `QWEN_DAEMON_TOKEN`     | Bearer token。                                                     |
| `QWEN_DAEMON_WORKSPACE` | 覆盖发送到 `POST /session` 的 `cwd`。                      |

## `settings.json` 键

守护进程在启动时通过 `runQserve` 内部的 `loadSettings(boundWorkspace)` 读取一次设置。格式错误的设置通过 try/catch 防护回退到默认值。

| 键                         | 类型                                                               | 效果                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| --------------------------- | ------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `policy.permissionStrategy` | `'first-responder' \| 'designated' \| 'consensus' \| 'local-only'` | 设置 `BridgeOptions.permissionPolicy`；当前值会出现在 `/capabilities` 中的 `policy.permission`。**启动时验证**通过 `validatePolicyConfig()` 对 `SERVE_CAPABILITY_REGISTRY.permission_mediation.modes` 进行。未知字面值会抛出 `InvalidPolicyConfigError` 并明确导致启动失败。                                                                                                                                                                                                                               |
| `policy.consensusQuorum`    | 正整数                                                   | 用于 `consensus` 策略的 N。**默认值**是 `floor(M/2) + 1`，其中 M 是 `votersAtIssue.size`（M=2 表示全部同意；更大的偶数 M 表示超过一半）。如果在非 consensus 策略下设置，则被忽略，启动时会打印 stderr 警告。非正整数会抛出 `InvalidPolicyConfigError`。参见 [`04-permission-mediation.md`](./04-permission-mediation.md)。                                                                                                                                                                        |
| `context.fileName`          | 字符串                                                             | 通过 `BridgeOptions.contextFilename` 覆盖 `getCurrentGeminiMdFilename()`。                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `tools.disabled`            | string[]                                                           | 为下一个 ACP 子进程生成的禁用工具。通过 `normalizeDisabledToolList()` 进行规范化（`packages/cli/src/config/normalizeDisabledTools.ts`）：非数组变为 `[]`，非字符串条目跳过，空白被修剪，空条目被丢弃，重复项被移除但保留首次出现。启动和 `restartMcpServer` 设置刷新都经过此函数。`ToolRegistry.has(name)` 精确匹配且区分大小写。`POST /workspace/tools/:name/enable` 和 `tool_toggled` 会更新此键。 |
| `tools.approvalMode`        | `'default' \| 'auto' \| ...`                                       | 默认会话批准模式；当 `persist: true` 时，`POST /session/:id/approval-mode` 会写入此处。                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `telemetry`                 | object                                                             | OTel 配置。键包括 `enabled`、`otlpEndpoint`、`otlpProtocol`、`otlpTracesEndpoint`、`otlpLogsEndpoint`、`otlpMetricsEndpoint`、`target`、`outfile`、`includeSensitiveSpanAttributes`、`sensitiveSpanAttributeMaxLength`、`resourceAttributes` 和 `metrics.includeSessionId`。`resolveTelemetrySettings()` 在启动时读取并初始化 `initializeTelemetry()`。                                                                                                                                                             |

## `ServeOptions`（编程嵌入）

`packages/cli/src/serve/types.ts` 定义了 `runQwenServe` 和 `createServeApp` 都接受的类型化选项对象。它镜像了上面的 CLI 标志，并增加了：

| 字段                         | 效果                                                                                        |
| ----------------------------- | --------------------------------------------------------------------------------------------- |
| `eventRingSize`               | 覆盖每个会话的默认环形缓冲区大小。                                                  |
| `maxPendingPromptsPerSession` | 每个会话的待处理提示上限；`0` / `Infinity` 表示无限制。                             |
| `mcpPoolActive`               | 编程开关，默认值来自 `QWEN_SERVE_NO_MCP_POOL`。                                |
| `allowOrigins`                | 跨域白名单（`string[]`），对应于 `--allow-origin`。                       |
| `allowPrivateAuthBaseUrl`     | 允许安装私有 / localhost auth provider `baseUrl`。                              |
| `enableSessionShell`          | 启用会话 shell 执行；仍然需要 bearer token 和会话绑定的客户端 ID。 |
| `promptDeadlineMs`            | 提示的挂钟时间限制。                                                                       |
| `writerIdleTimeoutMs`         | SSE 写入器空闲超时。                                                                      |
| `channelIdleTimeoutMs`        | 最后一个会话关闭后保持 ACP 子进程活跃的时间。                            |
| `sessionReapIntervalMs`       | 会话回收器扫描间隔。                                                                 |
| `sessionIdleTimeoutMs`        | 断开连接的会话空闲回收时间。                                                       |
| `rateLimit*`                  | 按层 HTTP 速率限制开关、阈值和窗口。                                             |
## `BridgeOptions`（编程式桥接嵌入）

`packages/acp-bridge/src/bridgeOptions.ts` 定义了桥接选项。完整表格请参见 [`03-acp-bridge.md`](./03-acp-bridge.md)。关键字段：

| 字段                                                                                                                   | 作用                                                                                        |
| ----------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `boundWorkspace`                                                                                                        | 必需的规范工作区。                                                                 |
| `sessionScope`                                                                                                          | `'single'`（默认）或 `'thread'`.                                                           |
| `initializeTimeoutMs`, `maxSessions`, `eventRingSize`, `permissionResponseTimeoutMs`, `maxPendingPermissionsPerSession` | 有界资源上限。                                                                        |
| `channelFactory`                                                                                                        | 可插拔的 ACP 子工厂；默认为 `defaultSpawnChannelFactory`.                         |
| `fileSystem`                                                                                                            | `BridgeFileSystem` 适配器。参见 [`07-workspace-filesystem.md`](./07-workspace-filesystem.md). |
| `permissionPolicy`, `permissionConsensusQuorum`, `permissionAudit`                                                      | 中介器连接。                                                                              |
| `statusProvider`                                                                                                        | 守护进程宿主预检单元。                                                                  |
| `childEnvOverrides`                                                                                                     | 按句柄的环境变量添加或移除。                                                 |
| `contextFilename`                                                                                                       | 覆盖 `getCurrentGeminiMdFilename()`.                                                     |
| `channelIdleTimeoutMs`                                                                                                  | 最后一个会话关闭后保持 ACP 子进程存活的时间（毫秒）；默认 `0`.       |

## 重要默认值

| 常量                          | 文件                    | 值             | 含义                                                           |
| --------------------------------- | ----------------------- | ----------------- | ----------------------------------------------------------------- |
| `DEFAULT_MAX_SESSIONS`            | `bridge.ts`             | `20`              | 会话上限，超过则抛出 `SessionLimitExceededError`.                   |
| `MAX_EVENT_RING_SIZE`             | `bridge.ts`             | `1_000_000`       | `BridgeOptions.eventRingSize` 的软上限；防止拼写错误。 |
| `DEFAULT_RING_SIZE`               | `eventBus.ts`           | `8000`            | 每个会话的 SSE 回放环形缓冲区深度。                                |
| `DEFAULT_MAX_QUEUED`              | `eventBus.ts`           | `256`             | 每个订阅者的队列上限。                                         |
| `DEFAULT_MAX_SUBSCRIBERS`         | `eventBus.ts`           | `64`              | 每个总线的订阅者上限。                                           |
| `WARN_THRESHOLD_RATIO`            | `eventBus.ts`           | `0.75`            | `slow_client_warning` 触发阈值。                                    |
| `WARN_RESET_RATIO`                | `eventBus.ts`           | `0.375`           | 回滞重新武装阈值。                                      |
| `DEFAULT_INIT_TIMEOUT_MS`         | `bridge.ts`             | `10_000`          | ACP `initialize` 握手超时。                               |
| `MCP_RESTART_TIMEOUT_MS`          | `bridge.ts`             | `300_000`         | `/workspace/mcp/:server/restart` 的桥接超时。              |
| `DEFAULT_PERMISSION_TIMEOUT_MS`   | `bridge.ts`             | `5 * 60_000`      | 每个权限请求的挂钟时间。                                 |
| `DEFAULT_MAX_PENDING_PER_SESSION` | `bridge.ts`             | `64`              | 与 `DEFAULT_MAX_SUBSCRIBERS` 保持一致。                           |
| `MAX_RESOLVED_PERMISSION_RECORDS` | `permissionMediator.ts` | `512`             | 最近已解决权限的 FIFO 记录数。                           |
| `KILL_HARD_DEADLINE_MS`           | `spawnChannel.ts`       | `10_000`          | 每个通道的优雅关闭窗口。                             |
| `SHUTDOWN_FORCE_CLOSE_MS`         | `run-qwen-serve.ts`       | `5_000`           | HTTP 服务强制关闭定时器。                                    |
| `MAX_READ_BYTES`                  | `fs/policy.ts`          | `256 * 1024`      | 读取上限。                                                         |
| `MAX_WRITE_BYTES`                 | `fs/policy.ts`          | `5 * 1024 * 1024` | 写入上限。                                                        |
| `MAX_DISPLAY_NAME_LENGTH`         | `bridge.ts`             | `256`             | 会话 `displayName` 长度上限。                                        |

## 交叉引用

- 鉴权设置：[`12-auth-security.md`](./12-auth-security.md)
- 能力与协议版本：[`11-capabilities-versioning.md`](./11-capabilities-versioning.md)
- 事件环与背压调优：[`10-event-bus.md`](./10-event-bus.md)
- MCP 池/预算：[`05-mcp-transport-pool.md`](./05-mcp-transport-pool.md) 和 [`06-mcp-budget-guardrails.md`](./06-mcp-budget-guardrails.md)
- 权限策略：[`04-permission-mediation.md`](./04-permission-mediation.md)
- 用户操作指南：[`../../users/qwen-serve.md`](../../users/qwen-serve.md)