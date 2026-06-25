# 配置参考

## 概述

本页汇总了影响 `qwen serve` 守护进程及其适配器的所有配置项：环境变量、CLI 标志、`settings.json` 键，以及编程接口选项。功能专项页面在需要跨领域配置细节时会链接回本页。

## CLI 标志（`qwen serve`）

| 标志                                    | 类型                       | 默认值                                     | 说明                                                                                                                                                                              |
| --------------------------------------- | -------------------------- | ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--hostname <host>`                     | string                     | `127.0.0.1`                                | 绑定地址。回环地址：`127.0.0.1`、`localhost`、`::1`、`[::1]`。非回环地址在启动时需要 bearer token。输入 `host:port` 格式将被拒绝并提示改用 `--port`。 |
| `--port <n>`                            | number                     | `4170`                                     | 监听端口；`0` 表示使用临时端口。                                                                                                                                                   |
| `--token <s>`                           | string                     | env                                        | Bearer token。覆盖 `QWEN_SERVER_TOKEN`，启动时去除首尾空白。该值会出现在进程命令行中，生产环境建议使用环境变量。                                           |
| `--require-auth`                        | boolean                    | `false`                                    | 将 bearer 认证扩展至回环地址和 `/health`；无 token 时启动失败。                                                                                                               |
| `--workspace <dir>`                     | absolute path              | `process.cwd()`                            | 绑定的工作空间目录。必须为绝对路径且为目录；启动时进行一次规范化。                                                                                                                      |
| `--max-sessions <n>`                    | number                     | `20`                                       | 活跃会话上限。`0` / `Infinity` 表示无限制；`NaN` / 负值会抛出异常。                                                                                                                |
| `--max-pending-prompts-per-session <n>` | number                     | `5`                                        | 每个会话中待处理/正在运行的 prompt 上限。超出时返回 503。`0` / `Infinity` 表示无限制；负值或非整数值会抛出异常。                                                               |
| `--max-connections <n>`                 | number                     | `256`                                      | HTTP 监听器的 `server.maxConnections`；`0` / `Infinity` 表示无限制。                                                                                                            |
| `--enable-session-shell`                | boolean                    | `false`                                    | 启用直接 `POST /session/:id/shell` 执行。需要 bearer token，且每次调用必须携带会话绑定的 `X-Qwen-Client-Id`。                                                                    |
| `--event-ring-size <n>`                 | number                     | `8000`                                     | 每会话 SSE 重放环形缓冲区大小；软上限为 `1_000_000`。                                                                                                                               |
| `--http-bridge`                         | boolean                    | `true`                                     | Stage 1 bridge 模式。`--no-http-bridge` 仍回退至 http-bridge 并向 stderr 打印提示。                                                                                              |
| `--mcp-client-budget <n>`               | positive integer           | unset                                      | 设置 `WorkspaceMcpBudget.clientBudget`，并通过 `childEnvOverrides` 转发给 ACP 子进程。                                                                                           |
| `--mcp-budget-mode <m>`                 | `off` / `warn` / `enforce` | 设置 budget 时默认 `warn`，否则 `off` | 设置 `WorkspaceMcpBudget.mode`；`enforce` 需要同时设置 `--mcp-client-budget`。                                                                                                   |
| `--allow-origin <pattern>`              | repeatable string          | unset                                      | 跨域允许列表，替换默认的 CORS 拒绝策略。`*` 允许任意来源，但需要 token。                                                                                                         |
| `--allow-private-auth-base-url`         | boolean                    | `false`                                    | 允许 `/workspace/auth/provider` 安装 localhost / 私有网络认证提供者的 `baseUrl`；仅在受信任的本地开发环境中使用。                                                                    |
| `--prompt-deadline-ms <n>`              | positive integer           | unset                                      | 服务端 prompt 挂钟时间限制（ms）。超时后中止并返回错误。                                                                                                                          |
| `--writer-idle-timeout-ms <n>`          | positive integer           | unset                                      | 每个 SSE 连接的空闲超时（ms）。在此期间内无事件发送时，守护进程关闭该 SSE 连接。                                                                                                  |
| `--channel-idle-timeout-ms <n>`         | non-negative integer       | `0`                                        | 最后一个会话关闭后保持 ACP 子进程存活的时长。`0` 表示立即回收。                                                                                                                  |
| `--session-reap-interval-ms <n>`        | non-negative integer       | `60000`                                    | 会话清理器扫描间隔；`0` 表示禁用。                                                                                                                                               |
| `--session-idle-timeout-ms <n>`         | non-negative integer       | `1800000`                                  | 断连会话的空闲清理时间；`0` 表示禁用。                                                                                                                                            |
| `--rate-limit` / `--no-rate-limit`      | boolean                    | env / off                                  | 为 prompt、mutation、read 路由启用按层级的 HTTP 频率限制。                                                                                                                        |
| `--rate-limit-prompt <n>`               | positive integer           | `10`                                       | 每个窗口内 prompt 请求限制数；需要先启用频率限制。                                                                                                                                |
| `--rate-limit-mutation <n>`             | positive integer           | `30`                                       | 每个窗口内 mutation 请求限制数；需要先启用频率限制。                                                                                                                              |
| `--rate-limit-read <n>`                 | positive integer           | `120`                                      | 每个窗口内 read 请求限制数；需要先启用频率限制。                                                                                                                                  |
| `--rate-limit-window-ms <n>`            | integer `>= 1000`          | `60000`                                    | 频率限制窗口长度；需要先启用频率限制。                                                                                                                                            |
| no flag                                 | -                          | -                                          | `QWEN_SERVE_NO_MCP_POOL=1` 完全禁用连接池。                                                                                                                                      |

## 环境变量

### 由 `runQwenServe` / Express 中间件读取

| 环境变量                                | 说明                                                                                                                                                                   |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `QWEN_SERVER_TOKEN`                 | Bearer token；启动时去除首尾空白。                                                                                                                                       |
| `QWEN_SERVE_DEBUG`                  | `1` / `true` / `on` / `yes`（大小写不敏感）开启详细 stderr 日志。参见 [`19-observability.md`](./19-observability.md)。                                          |
| `QWEN_SERVE_NO_MCP_POOL`            | `1` 禁用工作空间 MCP transport 连接池，回退至每会话 `McpClientManager`；capabilities 将停止通告 `mcp_workspace_pool` / `mcp_pool_restart`。 |
| `QWEN_SERVE_PROMPT_DEADLINE_MS`     | `--prompt-deadline-ms` 的环境变量回退值。                                                                                                                                |
| `QWEN_SERVE_WRITER_IDLE_TIMEOUT_MS` | `--writer-idle-timeout-ms` 的环境变量回退值。                                                                                                                            |
| `QWEN_SERVE_RATE_LIMIT`             | `1` / `true` 启用按层级的 HTTP 频率限制；CLI 的 `--rate-limit` / `--no-rate-limit` 优先级更高。                                                                          |
| `QWEN_SERVE_RATE_LIMIT_PROMPT`      | `--rate-limit-prompt` 的环境变量回退值。                                                                                                                                  |
| `QWEN_SERVE_RATE_LIMIT_MUTATION`    | `--rate-limit-mutation` 的环境变量回退值。                                                                                                                                |
| `QWEN_SERVE_RATE_LIMIT_READ`        | `--rate-limit-read` 的环境变量回退值。                                                                                                                                    |
| `QWEN_SERVE_RATE_LIMIT_WINDOW_MS`   | `--rate-limit-window-ms` 的环境变量回退值。                                                                                                                               |

### 通过 `BridgeOptions.childEnvOverrides` 转发给 ACP 子进程

`runQwenServe` 按句柄构建这些变量，以防同一进程中两个守护进程在 `process.env` 上产生竞争。budget 变量不是 `qwen serve` 父进程的环境变量回退；CLI 路径必须通过 `--mcp-client-budget` / `--mcp-budget-mode` 生成它们。

| 环境变量                              | 说明                                                                                                                   |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `QWEN_SERVE_MCP_CLIENT_BUDGET`   | 正整数字符串，由 ACP 子进程的 `readBudgetFromEnv()` 消费。                                                               |
| `QWEN_SERVE_MCP_BUDGET_MODE`     | `off` / `warn` / `enforce`。                                                                                              |
| `QWEN_SERVE_MCP_POOL_TRANSPORTS` | 逗号分隔的 transport 允许列表；默认连接池 transport 为 `stdio,websocket`；可显式加入 `http,sse`。 |
| `QWEN_SERVE_MCP_POOL_DRAIN_MS`   | 连接池条目空闲排空延迟；默认 `30000`，范围限制在 `1000..600000` ms。                                                      |

### 由 SDK / 适配器读取

| 环境变量                    | 说明                                                            |
| ----------------------- | ----------------------------------------------------------------- |
| `QWEN_DAEMON_URL`       | 守护进程基础 URL，供 CLI TUI 适配器、channel 及 IDE 伴侣使用。 |
| `QWEN_DAEMON_TOKEN`     | Bearer token。                                                     |
| `QWEN_DAEMON_WORKSPACE` | 覆盖发送至 `POST /session` 的 `cwd`。                      |

## `settings.json` 键

守护进程在启动时通过 `runQwenServe` 内的 `loadSettings(boundWorkspace)` 一次性读取配置。格式错误的配置通过 try/catch 回退至默认值。

| 键                          | 类型                                                               | 说明                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| --------------------------- | ------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `policy.permissionStrategy` | `'first-responder' \| 'designated' \| 'consensus' \| 'local-only'` | 设置 `BridgeOptions.permissionPolicy`；当前值以 `policy.permission` 形式出现在 `/capabilities` 中。**启动时**通过 `validatePolicyConfig()` 对照 `SERVE_CAPABILITY_REGISTRY.permission_mediation.modes` 进行校验。未知字面量会抛出 `InvalidPolicyConfigError` 并导致启动失败。                                                                                                                                                                                                                                               |
| `policy.consensusQuorum`    | positive integer                                                   | `consensus` 策略的 N 值。**默认**为 `floor(M/2) + 1`（M 为 `votersAtIssue.size`，M=2 时表示全票通过；较大的偶数 M 表示超过半数）。若在非 consensus 策略下设置此项，则被忽略，启动时在 stderr 打印警告。非正整数会抛出 `InvalidPolicyConfigError`。参见 [`04-permission-mediation.md`](./04-permission-mediation.md)。                                                                                                                                                                        |
| `context.fileName`          | string                                                             | 通过 `BridgeOptions.contextFilename` 覆盖 `getCurrentGeminiMdFilename()`。                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `tools.disabled`            | string[]                                                           | 下次 ACP 子进程生成时禁用的工具列表。通过 `normalizeDisabledToolList()`（`packages/cli/src/config/normalizeDisabledTools.ts`）进行规范化：非数组转为 `[]`，非字符串条目被跳过，去除首尾空白，空条目被丢弃，保留首次出现并去重。启动和 `restartMcpServer` 配置刷新均经过此函数处理。`ToolRegistry.has(name)` 精确且区分大小写。`POST /workspace/tools/:name/enable` 和 `tool_toggled` 会更新此键。 |
| `tools.approvalMode`        | `'default' \| 'auto' \| ...`                                       | 默认会话审批模式；`POST /session/:id/approval-mode` 在 `persist: true` 时写入此键。                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `telemetry`                 | object                                                             | OTel 配置。键包括 `enabled`、`otlpEndpoint`、`otlpProtocol`、`otlpTracesEndpoint`、`otlpLogsEndpoint`、`otlpMetricsEndpoint`、`target`、`outfile`、`includeSensitiveSpanAttributes`、`resourceAttributes` 和 `metrics.includeSessionId`。`resolveTelemetrySettings()` 在启动时读取并初始化 `initializeTelemetry()`。                                                                                                                                                                               |

## `ServeOptions`（编程嵌入）

`packages/cli/src/serve/types.ts` 定义了 `runQwenServe` 和 `createServeApp` 均接受的类型化选项对象。它与上面的 CLI 标志一一对应，并额外增加：

| 字段                          | 说明                                                                                        |
| ----------------------------- | --------------------------------------------------------------------------------------------- |
| `eventRingSize`               | 覆盖每会话的默认环形缓冲区大小。                                                                  |
| `maxPendingPromptsPerSession` | 每会话待处理 prompt 上限；`0` / `Infinity` 表示无限制。                                          |
| `mcpPoolActive`               | 编程开关，默认值来自 `QWEN_SERVE_NO_MCP_POOL`。                                                |
| `allowOrigins`                | 跨域允许列表（`string[]`），对应 `--allow-origin`。                                              |
| `allowPrivateAuthBaseUrl`     | 允许安装私有 / localhost 认证提供者的 `baseUrl`。                                               |
| `enableSessionShell`          | 启用会话 shell 执行；仍需要 bearer token 和会话绑定的 client id。                               |
| `promptDeadlineMs`            | Prompt 挂钟时间限制。                                                                           |
| `writerIdleTimeoutMs`         | SSE writer 空闲超时。                                                                           |
| `channelIdleTimeoutMs`        | 最后一个会话关闭后保持 ACP 子进程热备的时长。                                                    |
| `sessionReapIntervalMs`       | 会话清理器扫描间隔。                                                                             |
| `sessionIdleTimeoutMs`        | 断连会话的空闲清理时间。                                                                         |
| `rateLimit*`                  | 按层级的 HTTP 频率限制开关、阈值及窗口。                                                          |

## `BridgeOptions`（编程 bridge 嵌入）

`packages/acp-bridge/src/bridgeOptions.ts` 定义了 bridge 选项。完整字段表参见 [`03-acp-bridge.md`](./03-acp-bridge.md)。关键字段：

| 字段                                                                                                                   | 说明                                                                                        |
| ----------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `boundWorkspace`                                                                                                        | 必填的规范化工作空间路径。                                                                    |
| `sessionScope`                                                                                                          | `'single'`（默认）或 `'thread'`。                                                           |
| `initializeTimeoutMs`、`maxSessions`、`eventRingSize`、`permissionResponseTimeoutMs`、`maxPendingPermissionsPerSession` | 有界资源上限。                                                                                |
| `channelFactory`                                                                                                        | 可插拔的 ACP 子进程工厂；默认为 `defaultSpawnChannelFactory`。                                |
| `fileSystem`                                                                                                            | `BridgeFileSystem` 适配器。参见 [`07-workspace-filesystem.md`](./07-workspace-filesystem.md)。 |
| `permissionPolicy`、`permissionConsensusQuorum`、`permissionAudit`                                                      | 权限仲裁器配置。                                                                              |
| `statusProvider`                                                                                                        | 守护进程宿主预检单元。                                                                        |
| `childEnvOverrides`                                                                                                     | 每句柄的环境变量追加或移除项。                                                                |
| `contextFilename`                                                                                                       | 覆盖 `getCurrentGeminiMdFilename()`。                                                         |
| `channelIdleTimeoutMs`                                                                                                  | 最后一个会话关闭后保持 ACP 子进程存活的时长（ms）；默认 `0`。                               |

## 重要默认值

| 常量                              | 文件                    | 值                | 含义                                                           |
| --------------------------------- | ----------------------- | ----------------- | ----------------------------------------------------------------- |
| `DEFAULT_MAX_SESSIONS`            | `bridge.ts`             | `20`              | 触发 `SessionLimitExceededError` 前的会话上限。                   |
| `MAX_EVENT_RING_SIZE`             | `bridge.ts`             | `1_000_000`       | `BridgeOptions.eventRingSize` 的软上限；防止误输入。              |
| `DEFAULT_RING_SIZE`               | `eventBus.ts`           | `8000`            | 每会话 SSE 重放环形缓冲区深度。                                   |
| `DEFAULT_MAX_QUEUED`              | `eventBus.ts`           | `256`             | 每订阅者队列上限。                                                |
| `DEFAULT_MAX_SUBSCRIBERS`         | `eventBus.ts`           | `64`              | 每 bus 的订阅者上限。                                             |
| `WARN_THRESHOLD_RATIO`            | `eventBus.ts`           | `0.75`            | `slow_client_warning` 触发阈值。                                  |
| `WARN_RESET_RATIO`                | `eventBus.ts`           | `0.375`           | 滞后复位阈值。                                                    |
| `DEFAULT_INIT_TIMEOUT_MS`         | `bridge.ts`             | `10_000`          | ACP `initialize` 握手超时。                                       |
| `MCP_RESTART_TIMEOUT_MS`          | `bridge.ts`             | `300_000`         | `/workspace/mcp/:server/restart` 的 bridge 超时。                |
| `DEFAULT_PERMISSION_TIMEOUT_MS`   | `bridge.ts`             | `5 * 60_000`      | 每条权限请求的挂钟时间。                                          |
| `DEFAULT_MAX_PENDING_PER_SESSION` | `bridge.ts`             | `64`              | 与 `DEFAULT_MAX_SUBSCRIBERS` 对齐。                               |
| `MAX_RESOLVED_PERMISSION_RECORDS` | `permissionMediator.ts` | `512`             | 最近已解决权限记录的 FIFO 队列。                                  |
| `KILL_HARD_DEADLINE_MS`           | `spawnChannel.ts`       | `10_000`          | 每 channel 的优雅关闭窗口。                                       |
| `SHUTDOWN_FORCE_CLOSE_MS`         | `run-qwen-serve.ts`       | `5_000`           | HTTP 服务器强制关闭计时器。                                       |
| `MAX_READ_BYTES`                  | `fs/policy.ts`          | `256 * 1024`      | 读取上限。                                                        |
| `MAX_WRITE_BYTES`                 | `fs/policy.ts`          | `5 * 1024 * 1024` | 写入上限。                                                        |
| `MAX_DISPLAY_NAME_LENGTH`         | `bridge.ts`             | `256`             | 会话 `displayName` 长度上限。                                     |

## 交叉参考

- 认证配置：[`12-auth-security.md`](./12-auth-security.md)
- Capabilities 与协议版本：[`11-capabilities-versioning.md`](./11-capabilities-versioning.md)
- 事件环形缓冲区与背压调优：[`10-event-bus.md`](./10-event-bus.md)
- MCP 连接池 / budget：[`05-mcp-transport-pool.md`](./05-mcp-transport-pool.md) 和 [`06-mcp-budget-guardrails.md`](./06-mcp-budget-guardrails.md)
- 权限策略：[`04-permission-mediation.md`](./04-permission-mediation.md)
- 用户操作指南：[`../../users/qwen-serve.md`](../../users/qwen-serve.md)
