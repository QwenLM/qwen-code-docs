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
| `--workspace <dir>`                     | absolute path / repeatable   | `process.cwd()`                           | 启动时的工作区运行时；重复使用可注册额外的隔离运行时。第一个为主运行时。每个值必须是绝对路径且为目录；在启动时进行规范化处理。                                                                                                      |
| `--memory-project-scope <mode>`         | `git-root` / `workspace`     | `workspace`                               | 项目内存分区。`workspace` 按精确的工作区目录隔离；`git-root` 是同一 Git root 下工作区共享的旧版兼容作用域。覆盖 `QWEN_CODE_MEMORY_PROJECT_SCOPE`。                               |
| `--max-sessions <n>`                    | number                     | `32`                                      | 每个工作区的活跃会话上限。`0` / `Infinity` 表示无限制；`NaN` 或负值会抛出异常。                                                                                                |
| `--max-total-sessions <n>`              | number                       | 多个启动/恢复的工作区时派生                  | 守护进程级别的活跃会话上限。省略时，根据每个工作区的上限和启动/恢复的工作区数量派生一个有限的默认值。`0` / `Infinity` 表示无限制。                                         |
| `--max-pending-prompts-per-session <n>` | number                       | `5`                                       | 每个会话已接受但处于 pending/running 状态的 prompt 上限。超出的 prompt 将返回 503。`0` / `Infinity` 表示无限制；负值或非整数值会抛出异常。                             |
| `--max-connections <n>`                 | number                       | `256`                                     | HTTP 监听器的 `server.maxConnections`；`0` / `Infinity` 表示无限制。                                                                                                            |
| `--enable-session-shell`                | boolean                      | `false`                                   | 启用直接的 `POST /session/:id/shell` 执行。需要 bearer token，且每次调用都必须携带绑定到会话的 `X-Qwen-Client-Id`。                                            |
| `--event-ring-size <n>`                 | number                       | `8000`                                    | 每个会话的 SSE 重放 ring；软上限为 `1_000_000`。                                                                                                                               |
| `--compacted-replay-max-bytes <n>`      | positive integer             | `4194304`                                 | `POST /session/:id/load` 返回的有界内存重放快照的字节上限；硬上限为 `268435456`。                                                                                                         |
| `--max-journal-events <n>`              | positive safe integer        | `10000`                                                                           | 每个会话未完成的轮次的 `liveJournal` 重放条目的基线上限。自适应增长可以提高它（参见 `--max-journal-bytes`）；固定任一 journal 标志都会禁用增长。                                                                                                            |
| `--max-journal-bytes <n>`               | positive safe integer        | `8388608` (8 MiB)                                                                 | 每个会话 `liveJournal` 的基线字节上限。当轮次超过它时，自适应增长会按需提高会话的上限，向双倍增长但受限于剩余 pool 余量，且不超过每会话 256 MiB 的硬上限 — 在有效的 `--memory-budget-mb` 的 5% 的守护进程级别 pool 内（上限为 `1024` MB；当有效预算低于 1024 MB 最小值时为 0 — 增长禁用），由每个 workspace bridge 共享；没有余量时最旧的条目会被丢弃并标记 `history_truncated`。固定任一 journal 标志都会禁用增长。 |
| `--memory-budget-mb <n>`                | integer in `[1024, 1048576]` | 受 cgroup 限制或主机内存的 50%，上限为参数最大值（1048576 MB） | 守护进程进程树的总内存预算，上限为解析后的可用内存。在守护进程状态的 `limits.memory` 中观察和报告；它不影响子进程的大小 — 当前的唯一消费者是自适应 live-journal 增长（参见 `--max-journal-bytes`）。启动时拒绝超出范围的值。 |
| `--memory-pressure-mode <mode>`         | `off` \| `observe`           | `observe`                                                                         | 守护进程是否根据自身 RSS 和 V8 堆派生内存压力级别。两种模式都会报告 `runtime.memory.pressure`；仅 `observe` 会触发 `daemon_memory_pressure`。仅限根进程；无自动修复措施。                               |
| `--child-heap-mode <mode>`              | `off` \| `observe`           | `observe`                                                                         | 守护进程是否为预算中的每个子进程建模堆分区。`observe` 会报告该分区并统计超出分区的 spawn 次数；不应用任何限制。`off` 完全不发布分区 — `maxConcurrentChildren` 和 `perChildCeilingMb` 均为 `null`。 |
| `--http-bridge`                         | boolean                    | `true`                                    | Stage 1 bridge 模式。`--no-http-bridge` 仍会回退到 http-bridge 并将信息打印到 stderr。                                                                                       |
| `--mcp-client-budget <n>`               | positive integer           | unset                                     | 设置 `WorkspaceMcpBudget.clientBudget` 并通过 `childEnvOverrides` 将其转发给 ACP 子进程。                                                                                |
| `--mcp-budget-mode <m>`                 | `off` / `warn` / `enforce`   | 设置了 budget 时为 `warn`，否则为 `off`                                        | 设置 `WorkspaceMcpBudget.mode`；`enforce` 需要配合 `--mcp-client-budget` 使用。                                                                                                           |
| `--external-tool-guard-mode <m>`        | `off` / `required`           | `off`                                                                             | 启用托管 ACP 外部预执行 Guard。`required` 模式下，如果其环回 provider 未完成 v1 握手，则启动失败。                                                                                   |
| `--external-tool-guard-endpoint <url>`  | loopback HTTP(S) origin      | unset                                                                             | 仅在 `required` 模式下使用的 provider origin。必须是纯 origin 且使用 `127.0.0.1`、`localhost` 或 `::1`；路径、凭据、重定向和代理路由会被拒绝。                                           |
| `--external-tool-guard-timeout-ms <n>`  | integer `100..30000`         | `3000`                                                                            | 每次握手和每次 prepare 的截止时间。超时在握手期间会导致启动失败，在轮次期间会 fail closed 该调用。                                                                                        |
| `--allow-origin <pattern>`              | repeatable string            | unset                                                                             | 跨域白名单，用于替换默认的 CORS 拒绝策略。`*` 允许任何 origin，但需要 token。                                                                           |
| `--allow-private-auth-base-url`         | boolean                    | `false`                                   | 允许 `/workspace/auth/provider` 安装 localhost / 私有网络 auth provider 的 `baseUrl`；仅在受信任的本地开发环境中使用。                                            |
| `--web` / `--no-web`                    | boolean                    | `true`                                    | 在守护进程根路径提供构建好的 Web Shell SPA（`GET /`、`/assets/*` 以及 `/session/:id` 文档导航）。这些入口点在 `bearerAuth` 之前挂载；每个 API 路由仍受 token 门控。`--no-web` 使守护进程仅提供 API。 |
| `--prompt-deadline-ms <n>`              | positive integer           | unset                                     | 服务端 prompt 的绝对时间限制（毫秒）。超时将中止并返回错误。                                                                                                      |
| `--writer-idle-timeout-ms <n>`          | positive integer           | unset                                     | 每个 SSE 连接的空闲超时时间（毫秒）。如果在此时间内没有发送事件，守护进程将关闭 SSE 连接。                                                                |
| `--channel-idle-timeout-ms <n>`         | non-negative integer       | `0`                                       | 在最后一个会话关闭后，保持 ACP 子进程存活的时间。`0` 表示立即回收。                                                                                  |
| `--initialize-timeout-ms <n>`           | positive integer           | `10000`                                   | ACP 子进程请求超时时间，包括 initialize 握手（毫秒）。                                                                                                                                                       |
| `--session-restore-timeout-ms <n>`      | positive integer             | `60000`                                                                           | ACP 会话 load/resume 超时时间（毫秒）。省略此参数时，显式提供的 initialize 超时时间会提高预算，但不会将其降低到默认值以下。                                                                            |
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
| `QWEN_CODE_MEMORY_PROJECT_SCOPE`    | `workspace` 按精确的工作区目录键控项目内存；`git-root` 选择旧版共享作用域。未设置时，守护进程注入 `workspace`；无法识别的值警告一次并保留旧版 `git-root` 行为。通过运行时 base env 传播，而非 `childEnvOverrides`；`--memory-project-scope` 优先级更高。每个工作区的 remember/forget/dream lane 将 pending 任务上限设为 `MAX_PENDING = 16`；N 个工作区最多允许 16·N 个排队任务，无守护进程级别上限。 |

空白的 `QWEN_CODE_MEMORY_PROJECT_SCOPE` 值被视为未设置，因此默认为 `workspace`；无法识别的非空值仍然警告一次并保留旧版 `git-root` 行为。

### 由 `qwen serve` CLI 包装器读取

| 环境变量                                  | 作用                                                                                                                                                                                                                                                                                                                      |
| ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `QWEN_CODE_EXTERNAL_TOOL_GUARD_TOKEN` | 非空 bearer token，最多 8192 个 UTF-16 编码单元，不含控制字符，仅在 required 模式下复制到 `ServeOptions.externalToolGuard`。然后 CLI 在运行时环境被冻结之前删除环境变量；ACP 子进程、channel worker 和执行器环境也会防御性地清除它。 |

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

守护进程从每个工作区合并后的设置和环境覆盖构建该工作区的运行时。进程全局的监听器/认证选项只解析一次，而运行时特定的服务和 ACP 子进程接收所属运行时的快照。格式错误的设置遵循受影响运行时的已文档化启动回退或失败行为；它们不得导致另一个工作区的设置被复用。

| 键                         | 类型                                                               | 作用                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| --------------------------- | ------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `policy.permissionStrategy` | `'first-responder' \| 'designated' \| 'consensus' \| 'local-only'` | 设置 `BridgeOptions.permissionPolicy`；当前生效的值会作为 `policy.permission` 出现在 `/capabilities` 中。**启动时会**通过 `validatePolicyConfig()` 对照 `SERVE_CAPABILITY_REGISTRY.permission_mediation.modes` 进行**验证**。未知的字面量会抛出 `InvalidPolicyConfigError` 并明确导致启动失败。                                                                                                                                                                                                                               |
| `policy.consensusQuorum`    | positive integer                                                   | `consensus` 策略的 N 值。**默认值**为 `votersAtIssue.size` 的 `floor(M/2) + 1`（M=2 表示一致同意；更大的偶数 M 表示超过半数）。如果在非 consensus 策略下设置，它将被忽略，并且启动时会在 stderr 打印警告。非正整数会抛出 `InvalidPolicyConfigError`。请参阅 [`04-permission-mediation.md`](./04-permission-mediation.md)。                                                                                                                                                                        |
| `context.fileName`          | string                                                             | 通过 `BridgeOptions.contextFilename` 覆盖 `getCurrentGeminiMdFilename()`。                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `tools.disabled`            | string[]                                                           | 在下次生成 ACP 子进程时禁用的工具。通过 `normalizeDisabledToolList()`（`packages/cli/src/config/normalizeDisabledTools.ts`）进行规范化：非数组变为 `[]`，非字符串条目被跳过，修剪空白，丢弃空条目，并在保留首次出现的情况下移除重复项。启动和 `restartMcpServer` 设置刷新都会运行此函数。`ToolRegistry.has(name)` 是精确且区分大小写的。`POST /workspace/tools/:name/enable` 和 `tool_toggled` 会更新此键。 |
| `tools.approvalMode`        | `'default' \| 'auto' \| ...`                                       | 默认会话审批模式；当 `persist: true` 时，`POST /session/:id/approval-mode` 会写入此处。                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `telemetry`                 | object                                                             | OTel 配置。键包括 `enabled`、`otlpEndpoint`、`otlpProtocol`、`otlpTracesEndpoint`、`otlpLogsEndpoint`、`otlpMetricsEndpoint`、`target`、`outfile`、`userId`、`includeSensitiveSpanAttributes`、`sensitiveSpanAttributeMaxLength`、`resourceAttributes` 和 `metrics.includeSessionId`。`resolveTelemetrySettings()` 在启动时读取它并初始化 `initializeTelemetry()`。`userId` 是进程级别的，当守护进程服务多个用户时，不得将其配置为终端用户身份。                                                                                                                                                             |

## `ServeOptions`（编程式嵌入）

`packages/cli/src/serve/types.ts` 定义了通过公开 serve API 传递的类型化选项。它映射了上述 CLI 参数并增加了以下内容：

| 字段                         | 作用                                                                                        |
| ----------------------------- | --------------------------------------------------------------------------------------------- |
| `eventRingSize`               | 覆盖默认的每个会话 ring 大小。                                                  |
| `memoryProjectScope`          | 仅限 `runQwenServe`；优先级为选项、启动时环境变量，然后回退到 `workspace`。直接调用 `createServeApp` 的使用 `deps.daemonEnv`。                                          |
| `maxPendingPromptsPerSession` | 每个会话的 pending prompt 上限；`0` / `Infinity` 表示无限制。                             |
| `mcpPoolActive`               | 编程式开关，默认值来自 `QWEN_SERVE_NO_MCP_POOL`。                                |
| `externalToolGuard`           | 可选的 `{mode:'required', endpoint, token, timeoutMs?}`。省略表示完全关闭；required 模式在监听前执行 provider 握手。 |
| `allowOrigins`                | 跨域白名单（`string[]`），对应 `--allow-origin`。                       |
| `allowPrivateAuthBaseUrl`     | 允许安装私有 / localhost auth provider 的 `baseUrl`。                              |
| `serveWebShell`               | 在守护进程根路径提供构建好的 Web Shell SPA（默认 `true`）；`false`（CLI 的 `--no-web`）使守护进程仅提供 API。当构建产物不包含 shell 资源时无效。 |
| `enableSessionShell`          | 启用会话 shell 执行；仍然需要 bearer token 和绑定到会话的 client id。 |
| `promptDeadlineMs`            | Prompt 绝对时间限制。                                                                       |
| `writerIdleTimeoutMs`         | SSE writer 空闲超时时间。                                                                      |
| `channelIdleTimeoutMs`        | 在最后一个会话关闭后，保持 ACP 子进程预热状态的时间。                            |
| `initializeTimeoutMs`         | ACP 子进程请求超时时间，包括 initialize 握手。                                                                                    |
| `sessionRestoreTimeoutMs`     | ACP 会话 load/resume 超时时间。优先级：显式的 restore 值；否则显式的 initialize 值会提高 60000 默认值但不会降低它；否则为 60000。 |
| `sessionReapIntervalMs`       | 会话回收扫描间隔。                                                                 |
| `sessionIdleTimeoutMs`        | 已断开连接会话的空闲回收时间。                                                       |
| `rateLimit*`                  | 分层 HTTP 速率限制开关、阈值和时间窗口。                                      |
## `BridgeOptions`（编程式 bridge 嵌入）

`packages/acp-bridge/src/bridgeOptions.ts` 定义了 bridge 选项。完整表格请参见 [`03-acp-bridge.md`](./03-acp-bridge.md)。关键字段如下：

| Field                                                                                                                   | Effect                                                                                        |
| ----------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `boundWorkspace`                                                                                                        | 必需的规范工作区。                                                                            |
| `sessionScope`                                                                                                          | `'single'`（默认）或 `'thread'`。                                                             |
| `initializeTimeoutMs`, `sessionRestoreTimeoutMs`, `maxSessions`, `eventRingSize`, `permissionResponseTimeoutMs`, `maxPendingPermissionsPerSession` | 资源上限约束。                                                                                |
| `channelFactory`                                                                                                        | 可插拔的 ACP 子进程工厂；默认为 `defaultSpawnChannelFactory`。                                |
| `fileSystem`                                                                                                            | `BridgeFileSystem` 适配器。参见 [`07-workspace-filesystem.md`](./07-workspace-filesystem.md)。|
| `permissionPolicy`, `permissionConsensusQuorum`, `permissionAudit`                                                      | 中介器组件配置。                                                                              |
| `statusProvider`                                                                                                        | 守护进程宿主预检单元。                                                                        |
| `childEnvOverrides`                                                                                                     | 按句柄添加或移除环境变量。                                                                    |
| `externalToolGuard`                                                                                                     | 可选的守护进程侧处理器，用于私有的子进程到父进程的 prepare RPC。bridge 在调用处理器前后验证通道所有权和当前活跃的 Prompt。 |
| `contextFilename`                                                                                                       | 覆盖 `getCurrentGeminiMdFilename()`。                                                         |
| `channelIdleTimeoutMs`                                                                                                  | 最后一个会话关闭后，保持 ACP 子进程存活的时长（毫秒）；默认为 `0`。                           |

## 重要默认值

| Constant                          | File                    | Value             | Meaning                                                           |
| --------------------------------- | ----------------------- | ----------------- | ----------------------------------------------------------------- |
| `DEFAULT_MAX_SESSIONS`            | `bridge.ts`             | `32`              | 触发 `SessionLimitExceededError` 前的会话上限。                   |
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
| `MAX_READ_BYTES`                  | `fs/policy.ts`          | `256 * 1024`      | 完整快照和返回文本的上限；更大的 UTF-8 文本需要有限的行限制。                                                        |
| `MAX_WRITE_BYTES`                 | `fs/policy.ts`          | `5 * 1024 * 1024` | 写入上限。                                                        |
| `MAX_DISPLAY_NAME_LENGTH`         | `bridge.ts`             | `256`             | 会话 `displayName` 长度上限。                                     |

## 交叉引用

- 身份验证设置：[`12-auth-security.md`](./12-auth-security.md)
- 能力与协议版本：[`11-capabilities-versioning.md`](./11-capabilities-versioning.md)
- 事件环形缓冲区与背压调优：[`10-event-bus.md`](./10-event-bus.md)
- MCP 池 / 预算：[`05-mcp-transport-pool.md`](./05-mcp-transport-pool.md) 和 [`06-mcp-budget-guardrails.md`](./06-mcp-budget-guardrails.md)
- 权限策略：[`04-permission-mediation.md`](./04-permission-mediation.md)
- 用户操作指南：[`../../users/qwen-serve.md`](../../users/qwen-serve.md)