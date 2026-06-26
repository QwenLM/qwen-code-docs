# `qwen serve` HTTP 协议参考

这是 [qwen-code 守护进程设计](https://github.com/QwenLM/qwen-code/issues/3803) 的第一阶段。所有路由都位于守护进程的基 URL 下（默认 `http://127.0.0.1:4170`）。

## 身份验证

当守护进程使用 `--token` 或 `QWEN_SERVER_TOKEN` 启动时，**除 `/health` 在回环绑定上之外，每条路由**都必须携带：

```
Authorization: Bearer <token>
```

如果没有配置 token（回环开发的默认情况），则头部是可选的。Token 比较是恒定时间的。401 响应在 `缺少头部` / `错误的 scheme` / `错误的 token` 情况下是一致的。

**`/health` 豁免**（设计决策）：在回环绑定（`127.0.0.1` / `localhost` / `::1` / `[::1]`）上，`/health` 在 bearer 中间件之前注册，因此 Pod 内的存活探针即使守护进程使用 `--token` 启动也无需携带 token。非回环绑定（`--hostname 0.0.0.0` 等）则像其他路由一样将 `/health` 置于 bearer 之后——参见 [`GET /health`](#get-health) 章节了解原因。

**`--require-auth`（#4175 PR 15）。** 启动时传递此标志可将“必须要有 token”的规则扩展到回环。没有 token 则启动失败；`/health` 豁免被移除（因此 `/health` 也需要 `Authorization: Bearer …`）。

当该标志开启时，全局的 `bearerAuth` 中间件会守卫**每条**路由——包括 `/capabilities`。因此**未经身份验证**的客户端无法通过预检 `caps.features` 来发现需要认证：对于这种情况，发现的方式是 **401 响应体**本身（根据[身份验证](#authentication)章节，所有路由统一）。`require_auth` 能力标签是**认证后的确认**——一旦客户端成功认证并读取了 `/capabilities`，该标签的存在就确认了守护进程是以 `--require-auth` 启动的（用于审计/合规 UI 以及 SDK 客户端在设置面板中展示“此部署已加固”）。选择使用严格模式（Wave 4 后续）的突变路由，在没有 token 的回环默认情况下到达时，会返回 `401 { code: "token_required", error: "…" }`——但是当 `--require-auth` 启用时，全局的 bearer 中间件会在路由级别的守卫之前短路请求，因此未经身份验证的调用者实际看到的是传统的 `Unauthorized` 响应体。

**`--allow-origin <pattern>`（T2.4 [#4514](https://github.com/QwenLM/qwen-code/issues/4514)）。** 默认情况下，浏览器 WebUI 跨域访问守护进程会被阻止——任何携带 `Origin` 头的请求都会返回 `403 {"error":"Request denied by CORS policy"}`，因为 CLI/SDK 客户端从不发送 `Origin`，守护进程将其视为请求来自操作员未选择加入的浏览器上下文的标志。在启动时传递 `--allow-origin <pattern>`（可重复）以安装允许列表而不是直接拒绝。每个 pattern 可以是：

- 字面量 `*` —— 允许任何源。**有风险**：当配置了 `*` 但没有设置 bearer token（任何来源：`--token`、`QWEN_SERVER_TOKEN`，或需要 token 的 `--require-auth`）时，启动会拒绝。当 `*` 在列表中时，启动面包屑会在 stderr 上发出警告。**建议**：在回环绑定上搭配 `--require-auth`，这样 `/health` 和 `/demo` 也被 bearer 守卫——默认情况下它们在回环上是在 bearer 中间件之前注册的（以便 k8s/Compose 探针无需 token 即可访问 `/health`），而 `*` 允许列表使它们可从任何跨域浏览器访问。在非回环绑定上，bearer 在启动时已经是强制性的，因此 `*` 暴露的表面只有 `/health`（状态 JSON）和 `/demo`（静态页面，其 JS 仍然调用受 token 保护的路由）——实际的 API 表面是受保护的。
- 一个规范的 URL 源 —— `<scheme>://<host>[:<port>]`。**无尾部斜杠、无路径、无用户信息、无查询**。如果条目未能通过往返检查 `new URL(pattern).origin === pattern`，则启动会拒绝并返回 `InvalidAllowOriginPatternError`；错误消息会指明错误的 pattern 和规范形式。严格是有意为之：静默标准化（例如去除尾部斜杠）会让拼写错误溜过去，并接受模糊输入。

匹配的源在每个请求上都会收到标准的 CORS 响应头：

```
Access-Control-Allow-Origin: <echoed origin>
Vary: Origin
Access-Control-Allow-Methods: GET, POST, PATCH, DELETE, OPTIONS
Access-Control-Allow-Headers: Authorization, Content-Type, X-Qwen-Client-Id, Last-Event-ID
Access-Control-Max-Age: 86400
Access-Control-Expose-Headers: Retry-After
```

`Access-Control-Allow-Origin` 会原样回显请求的 Origin（按浏览器发送的大小写），而不是字面量 `*`，即使在 `*` 模式下也是如此——浏览器会根据它与 `Vary: Origin` 的组合来缓存键控响应，回显也为未来版本添加 `Access-Control-Allow-Credentials` 留下了空间，而无需更改 schema。`Access-Control-Expose-Headers: Retry-After` 允许浏览器 WebUI 处理守护进程从 `429` / `503` 响应中发出的重试提示。`Access-Control-Allow-Credentials` 当前**没有**发送：守护进程通过 bearer-in-`Authorization` 进行身份验证，这可以在跨域场景下工作，无需 `credentials: 'include'`。

OPTIONS 预检请求（带有 `Access-Control-Request-Method` 或 `Access-Control-Request-Headers` 的 OPTIONS）会短路并以 `204 No Content` 及上述头部响应。这是标准的 CORS 模式，并且是安全的——预检仅确认守护进程将接受哪些方法/头部；实际的后续请求仍会运行完整的链（主机允许列表 → bearer 认证 → 路由），因此在任何状态被读取或更改之前，反 DNS 重新绑定和 bearer 强制仍然生效。来自匹配源的普通 OPTIONS 请求会继续向下游流动，并附有 CORS 头部。

不匹配允许列表的源仍然会收到 `403 {"error":"Request denied by CORS policy"}`——与默认拒绝的响应体相同，因此已经解析过拒绝响应的客户端不需要对部署了允许列表的守护进程进行特殊处理。拒绝路径**不会**发出任何 `Access-Control-*` 头部（浏览器会忽略它们，而发出这些头部会间接通过头部的存在广告允许列表的大小）。

配置的模式列表有意不在 `/capabilities` 中回显——浏览器 WebUI 已经知道自己的源（毕竟它调用了守护进程），并且暴露列表会让未经验证的 `/capabilities` 读取者枚举所有受信任的源（对于配置错误的部署来说是有用的侦察）。SDK 客户端通过 `caps.features.allow_origin` 标签来判断“此守护进程支持跨域浏览器点击”，而无需知道具体是哪些源。

回环自源请求（例如 `/demo` 页面调用同一 `127.0.0.1:port` 上的守护进程）由一个**单独的** Origin 剥离垫片处理，该垫片在 CORS 中间件之前运行，并移除 `127.0.0.1:port` / `localhost:port` / `[::1]:port` / `host.docker.internal:port` 的 `Origin` 头。因此它们无论 `--allow-origin` 配置如何，都会通过——操作员不需要列出守护进程自己的端口就能使演示页面工作。

## 通用错误格式

5xx 响应在存在时携带原始错误的 `code` 和 `data`（JSON-RPC 风格——ACP SDK 会转发 agent 的 `{code, message, data}`）：

```json
{
  "error": "Internal error",
  "code": -32000,
  "data": { "reason": "model quota exceeded" }
}
```

请求体中的畸形 JSON 返回：

```json
{ "error": "Invalid JSON in request body" }
```

状态码为 `400`。

对于未知 session id 的 `SessionNotFoundError` 返回：

```json
{ "error": "No session with id \"<sid>\"", "sessionId": "<sid>" }
```

状态码为 `404`。

对于 `POST /session` 中 `cwd` 未规范化到守护进程绑定工作区（#3803 §02 — 1 个守护进程 = 1 个工作区）的 `WorkspaceMismatchError`，返回 `400` 并带有：

```json
{
  "error": "Workspace mismatch: daemon is bound to \"…\" but request asked for \"…\". …",
  "code": "workspace_mismatch",
  "boundWorkspace": "/path/the/daemon/binds",
  "requestedWorkspace": "/path/in/the/request"
}
```

使用此信息进行预检检测：读取 `/capabilities` 上的 `workspaceCwd` 并从 `POST /session` 中省略 `cwd`（它将回退到绑定的工作区），或者将请求路由到绑定到 `requestedWorkspace` 的守护进程。

`POST /session` 超过守护进程的 `--max-sessions` 上限，返回 `503` 及 `Retry-After: 5` 头部和：

```json
{
  "error": "Session limit reached (20)",
  "code": "session_limit_exceeded",
  "limit": 20
}
```

附加到现有 session 不计入上限，因此空闲守护进程的重连即使在容量满时也能继续工作。

`RestoreInProgressError` —— 仅由 `POST /session/:id/load` 和 `POST /session/:id/resume` 发出 —— 返回 `409` 及 `Retry-After: 5` 头部（与 `session_limit_exceeded` 相同）和：

```json
{
  "error": "Session \"<sid>\" is already being restored via session/<resume|load>; retry session/<load|resume> after it completes",
  "code": "restore_in_progress",
  "sessionId": "<sid>",
  "activeAction": "load",
  "requestedAction": "resume"
}
```

当对一个 id 发起了 `session/load`，而该 id 已有 `session/resume` 在处理（或反过来）时触发。等待至少 `Retry-After` 秒后重试 —— 底层恢复会在 `initTimeoutMs`（默认 10s）内完成。相同操作的竞争（`load` vs `load`、`resume` vs `resume`）会合并而不是报错。

## 能力

守护进程从 serve 能力注册表中公布其支持的功能标签。客户端**必须**根据 `features` 而不是 `mode` 来选通 UI（根据设计 §10）。

```
['health', 'capabilities', 'session_create', 'session_scope_override',
 'session_load', 'session_resume',
 'unstable_session_resume',
 'session_list', 'session_prompt', 'session_cancel', 'session_events',
 'slow_client_warning', 'typed_event_schema',
 'session_set_model', 'client_identity', 'client_heartbeat',
 'session_permission_vote', 'permission_vote', 'workspace_mcp', 'workspace_skills',
 'workspace_providers', 'auth_provider_install', 'workspace_memory',
 'workspace_agents', 'workspace_agent_generate', 'workspace_env',
 'workspace_preflight', 'session_context', 'session_context_usage',
 'session_supported_commands', 'session_tasks', 'session_stats',
 'session_lsp', 'session_status',
 'session_close', 'session_metadata', 'mcp_guardrails',
 'workspace_mcp_manage', 'mcp_guardrail_events',
 'mcp_server_runtime_mutation',
 'workspace_file_read', 'workspace_file_bytes', 'workspace_file_write',
 'session_approval_mode_control', 'workspace_tool_toggle',
 'workspace_settings', 'workspace_init', 'workspace_mcp_restart',
 'session_recap', 'session_btw', 'session_shell_command',
 'mcp_workspace_pool', 'mcp_pool_restart',
 'require_auth', 'allow_origin', 'auth_device_flow',
 'permission_mediation', 'prompt_absolute_deadline', 'writer_idle_timeout',
 'non_blocking_prompt', 'session_language', 'session_rewind',
 'workspace_hooks', 'session_hooks', 'workspace_extensions',
 'session_branch', 'rate_limit', 'workspace_reload']
```

> 条件性标签仅在其对应的部署开关开启时出现（见下表）。F3 的 `permission_mediation` 标签始终开启，并携带 `modes: ['first-responder', 'designated', 'consensus', 'local-only']`，以便 SDK 客户端可以内省构建支持集；运行时活跃策略在 `body.policy.permission` 中。

`session_scope_override` 是用于 `POST /session` 上每个请求字段 `sessionScope` 的协商句柄（见下文）。较旧的守护进程会静默忽略该字段，因此 SDK 客户端在发送之前应预检 `caps.features` 中是否存在此标签。

`session_load` 和 `session_resume` 公布显式恢复路由（`POST /session/:id/load` 和 `POST /session/:id/resume`）。较旧的守护进程对这些路径返回 `404`，因此 SDK 客户端在调用前应预检 `caps.features`。`unstable_session_resume` 仍作为废弃别名公布，用于兼容在底层 ACP 方法名为 `connection.unstable_resumeSession` 时发布的 SDK；新客户端应选通 `session_resume`。

`slow_client_warning` 涵盖了 #4175 Wave 2.5 PR 10 中引入的两个同时发布的 SSE 反压旋钮：(a) 当订阅者的队列超过 75% 满时，守护进程会发出一个 `slow_client_warning` 合成事件流帧，每次溢出事件一次（队列低于 37.5% 后重新武装）；(b) `GET /session/:id/events` 接受 `?maxQueued=N` 查询参数（范围 `[16, 2048]`）来为冷重连预置每个订阅者的积压队列大小（针对大重放环）。守护进程范围内的环大小由 `--event-ring-size` 控制（默认 **8000**，根据 #3803 §02）。旧守护进程静默缺少这两者——在选择加入之前预检此标签。

`typed_event_schema` 公布守护进程事件负载匹配 SDK 的 `KnownDaemonEvent` schema。较旧的守护进程可能仍会流式传输兼容的帧，但 SDK 客户端在假设类型化事件覆盖之前应预检此标签。

`client_heartbeat` 公布 `POST /session/:id/heartbeat`。较旧的守护进程返回 `404`；在发出定期心跳前预检此标签。

`session_close` 和 `session_metadata` 公布 `DELETE /session/:id` 和 `PATCH /session/:id/metadata`。较旧的守护进程返回 `404`；在公开关闭或重命名功能前预检这些标签。

`session_lsp` 公布 `GET /session/:id/lsp`，这是一个只读的结构化 LSP 状态快照，供守护进程客户端使用。较旧的守护进程返回 `404`；在公开远程 LSP 状态前预检此标签。

`session_status` 公布 `GET /session/:id/status`，这是单个 session 的实时桥接摘要（按 id 获取 `clientCount` / `hasActivePrompt` 及核心字段）。较旧的守护进程返回 `404`；在轮询单个 session 的状态（而非扫描全部 session 列表）前预检此标签。

`session_approval_mode_control`、`workspace_tool_toggle`、`workspace_init` 和 `workspace_mcp_restart`（问题 [#4175](https://github.com/QwenLM/qwen-code/issues/4175) PR 17）公布下文“突变：审批、工具、初始化、MCP 重启”一文中记录的四个突变控制路由。所有四个路由都受 PR 15 突变门的严格限制（未配置 bearer token 的守护进程会以 401 `token_required` 拒绝这些路由）。较旧的守护进程返回 `404`；在公开相应功能前预检每个标签。

`mcp_guardrails`（问题 [#4175](https://github.com/QwenLM/qwen-code/issues/4175) PR 14）涵盖了 MCP 预算相关部分：`GET /workspace/mcp` 上的 `clientCount` / `clientBudget` / `budgetMode` / `budgets[]` 字段、每个服务器单元格上的 `disabledReason` 字段，以及 `--mcp-client-budget` / `--mcp-budget-mode` CLI 标志。较旧的守护进程完全省略新字段；SDK 客户端在依赖 `budgets[]` 语义前预检此标签。注册表描述符还携带 `modes: ['warn', 'enforce']` 用于未来的特性模式暴露——目前，客户端从快照的 `budgetMode` 字段推断模式。在 `enforce` 模式下，服务器拒绝按 `Object.entries(mcpServers)` 声明顺序确定；如果 qwen-code 采用了作用域优先级层，则未来会改为“最低优先级优先”，以镜像 claude-code 的 `plugin < user < project < local` 约定。

> ⚠️ **PR 14 v1 作用域：每个 session，非每个工作区。** 守护进程内的每个 ACP session 构建自己的 `Config` + `McpClientManager`（通过 `acpAgent.newSessionConfig`）。预算上限作用于每个 session 的 MCP 客户端；每个 session 独立地从转发的环境变量中读取 `QWEN_SERVE_MCP_CLIENT_BUDGET`。使用 `--mcp-client-budget=10` 和 5 个并发 ACP session，实际活跃的 MCP 客户端数量可达 5 × 10 = 50 个跨守护进程。`GET /workspace/mcp` 快照仅读取**引导 session 的** `McpClientManager` 会计——`budgets[0].scope: 'session'` 值诚实表明这是按 session 计算的，不是聚合的。**Wave 5 PR 23（共享 MCP 池）** 将引入一个工作区作用域的管理器，并在每个 session 作用域单元格旁边添加一个 `scope: 'workspace'` 单元格，以实现真正的跨 session 聚合。v1 是 PR 23 构建基础的进程内计数器 + 软强制基础。

`workspace_file_read` 覆盖文本/列表/stat/glob 工作区文件路由（`GET /file`、`GET /list`、`GET /glob`、`GET /stat`）。`workspace_file_bytes` 覆盖 `GET /file/bytes`，这是后来添加的，以便客户端可以针对 PR19 时代的守护进程预检原始字节窗口支持。`workspace_file_write` 覆盖基于哈希的文本突变路由（`POST /file/write`、`POST /file/edit`）。写标签意味着路由契约存在；它并不意味着当前部署开放匿名突变。写/编辑是严格的突变路由，即使在回环上也需要配置的 bearer token。

`daemon_status` 公布 `GET /daemon/status`，即下文记录的整合只读操作员诊断快照。

**条件性标签。** 少数功能标签仅在其对应的部署开关开启时公布。标签存在 = 行为已开启；缺失 = 要么是标签出现之前的旧守护进程，要么是当前守护进程但操作员未选择加入。当前：

| 标签                        | 何时公布                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `require_auth`              | 守护进程以 `--require-auth` 启动（或通过嵌入式 API 使用 `requireAuth: true`）。Bearer token 在每条路由上都是强制性的，包括回环绑定上的 `/health`。                                                                                                                                                                                                                                                                                                                                                    |
| `mcp_workspace_pool`        | 共享的 MCP 传输池处于活动状态。当 `QWEN_SERVE_NO_MCP_POOL=1` 禁用池时省略。                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `mcp_pool_restart`          | 共享的 MCP 传输池处于活动状态；重启响应可能包含池感知的多条目形状。                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `allow_origin`              | T2.4 ([#4514](https://github.com/QwenLM/qwen-code/issues/4514))。守护进程至少以一个 `--allow-origin <pattern>` 启动（或通过嵌入式 API 使用 `allowOrigins: [...]`）。来自匹配源的跨域请求会收到正确的 CORS 响应头；不匹配的源仍会收到默认的 403。配置的模式列表有意不在 `/capabilities` 中回显，以避免向未经验证的读取者泄露受信任源集合——浏览器 WebUI 已经知道自己的源。                                                                                                                     |
| `prompt_absolute_deadline`  | `--prompt-deadline-ms` / `QWEN_SERVE_PROMPT_DEADLINE_MS` / `ServeOptions.promptDeadlineMs` 设置为正整数。                                                                                                                                                                                                                                                                                                                                                                                            |
| `writer_idle_timeout`       | `--writer-idle-timeout-ms` / `QWEN_SERVE_WRITER_IDLE_TIMEOUT_MS` / `ServeOptions.writerIdleTimeoutMs` 设置为正整数。                                                                                                                                                                                                                                                                                                                                                                                 |
| `workspace_settings`        | 守护进程创建时启用了设置持久化。                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `session_shell_command`     | session shell 执行已显式启用。                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `rate_limit`                | `--rate-limit` / `QWEN_SERVE_RATE_LIMIT=1` / `ServeOptions.rateLimit` 已启用。                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `workspace_reload`          | 嵌入式路由配置中支持工作区重载。                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
`mcp_guardrails` **并**不在此条件表中——它是一个始终启用的标签，只要二进制支持新的 `/workspace/mcp` 预算字段就会宣告，无论操作员是否配置了预算。尚未设置 `--mcp-client-budget` 的操作员仍会获得新字段（`budgetMode: 'off'`，`budgets: []`）。

`mcp_guardrail_events`（issue [#4175](https://github.com/QwenLM/qwen-code/issues/4175) PR 14b）宣告了类型化的 SSE 推送事件，用于在不借助轮询的情况下呈现 MCP 预算状态穿越。`GET /session/:id/events` 会收到两种帧类型：

- `mcp_budget_warning` —— 在 `reservedSlots.size / clientBudget` 向上穿越 75% 时触发一次。仅当比率降至 37.5%（`MCP_BUDGET_REARM_FRACTION`）以下后重新武装。与 PR 10 的 `slow_client_warning` 滞后机制类似，但作用在管理器级别而非单个订阅者的积压级别。负载：`{ liveCount, reservedCount, budget, thresholdRatio: 0.75, mode: 'warn' | 'enforce' }`。在 `warn` 和 `enforce` 模式下都会触发；在 `off` 模式下从不触发。
- `mcp_child_refused_batch` —— 在每次 `discoverAllMcpTools*` 流程结束时触发，当有一个或多个服务器被拒绝时；在 `readResource` 惰性生成拒绝路径上也以长度为 1 的批次触发。负载：`{ refusedServers: [{ name, transport, reason: 'budget_exhausted' }, ...], budget, liveCount, reservedCount, mode: 'enforce' }`。`mode` 始终为 `'enforce'`，因为 `warn` 模式下从不拒绝。

两个事件都位于每个会话的 SSE 回放环中（它们带有 `id`），因此使用 `Last-Event-ID` 重连的客户端可以重放它们；`GET /workspace/mcp` 的快照仍然是长时间断开后获取状态的权威来源。一旦宣告即始终启用——没有条件开关。SDK 归约状态（`DaemonSessionViewState`）公开了 `mcpBudgetWarningCount`、`lastMcpBudgetWarning`、`mcpChildRefusedBatchCount`、`lastMcpChildRefusedBatch`，以供需要简单滞后样式 UI 的适配器使用。

## 路由

### `GET /health`

存活探针。默认形式在监听器启动时返回 `200 {"status":"ok"}` —— 轻量，无需桥接访问，适合高频 k8s/Compose 存活探针。

传递 `?deep=1`（也接受 `?deep=true` 或裸 `?deep`）以获得展示桥接**计数器**的探针（仅用于信息展示，并非真正的存活检查）：

```json
{ "status": "ok", "sessions": 3, "pendingPermissions": 1 }
```

> ⚠️ 深层探针是**信息性**的，并非真正的存活验证。它读取计数器访问器（`bridge.sessionCount`、`bridge.pendingPermissionCount`），这些是简单的 Map 大小取值器；它们不会 ping 各个子进程/通道，因此无法检测到挂起但仍被计数的会话。将其用于容量仪表盘（当前并发数 vs. `--max-sessions`、队列深度），而不是作为“将该守护进程移出轮换”的触发器。如果自定义桥接实现的取值器抛出异常，理论上可能返回 `503 {"status":"degraded"}` 响应，但真正的桥接取值器从不抛出——正常运行时深层探针始终返回 200。对于真正的存活检测，请依赖监听器是否接受 TCP 连接（即不带 `?deep` 的默认 `/health`）。

**认证：** **仅在非环回绑定**时需要。在环回（`127.0.0.1`、`::1`、`[::1]`）上，`/health` 在 Bearer 中间件之前注册，因此 pod 内的 k8s/Compose 探针无需携带令牌。在非环回（`--hostname 0.0.0.0` 等）上，路由在 Bearer 中间件之后注册，没有有效令牌则返回 401——否则未认证的调用者可以探测任意地址以确认 `qwen serve` 存在，这是一个低严重性的信息泄露，与端口扫描结合使用效果更糟。在环回豁免上仍适用 CORS 拒绝 + Host 白名单。

### `GET /daemon/status`

只读操作员诊断。与 `/health` 不同，这是正常的守护进程 API：
它在 Bearer 认证和速率限制之后注册，包括环回绑定。查询参数：

- `detail=summary`（默认）仅读取内存中的守护进程状态。
- `detail=full` 还包含实时会话诊断、ACP 连接诊断、认证设备流计数和工作区状态部分。
- 任何其他 `detail` 返回 `400 { "code": "invalid_detail" }`。

`summary` 有意不查询工作区状态方法、启动 ACP 子进程或创建会话。`full` 独立查询每个工作区部分；超时或异常仅将该部分标记为 `unavailable` 并添加 `workspace_status_unavailable` 问题。

响应格式：

```json
{
  "v": 1,
  "detail": "summary",
  "generatedAt": "2026-06-16T00:00:00.000Z",
  "status": "ok",
  "issues": [],
  "daemon": {
    "pid": 12345,
    "uptimeMs": 3600000,
    "mode": "http-bridge",
    "workspaceCwd": "/repo",
    "qwenCodeVersion": "0.18.1",
    "daemonId": "serve-..."
  },
  "security": {
    "tokenConfigured": true,
    "requireAuth": false,
    "loopbackBind": true,
    "allowOriginConfigured": false,
    "allowOriginMode": "none",
    "sessionShellCommandEnabled": false
  },
  "limits": {
    "maxSessions": 20,
    "maxPendingPromptsPerSession": 5,
    "listenerMaxConnections": 256,
    "eventRingSize": 8000,
    "promptDeadlineMs": null,
    "writerIdleTimeoutMs": null,
    "channelIdleTimeoutMs": 0,
    "sessionIdleTimeoutMs": 1800000,
    "acpConnectionCap": 64
  },
  "runtime": {
    "sessions": { "active": 0 },
    "permissions": { "pending": 0, "policy": "first-responder" },
    "channel": { "live": false },
    "transport": {
      "restSseActive": 0,
      "acp": {
        "enabled": true,
        "connections": 0,
        "connectionStreams": 0,
        "sessionStreams": 0,
        "sseStreams": 0,
        "wsStreams": 0,
        "pendingClientRequests": 0
      }
    }
  }
}
```

`status` 为 `error`（如果任何问题有错误严重级别），`warning`（如果任何问题有警告严重级别），否则为 `ok`。问题代码是稳定的，包括 `session_capacity_high`、`connection_capacity_high`、`pending_permissions`、`acp_channel_down`、`preflight_error`、`mcp_budget_warning`、`mcp_budget_exhausted`、`rate_limit_hits` 和 `workspace_status_unavailable`。在监听器准备就绪但完整运行时尚未挂载的短暂窗口内，`/daemon/status` 可能报告 `daemon_runtime_starting`；如果异步运行时挂载失败，则报告 `daemon_runtime_failed`，同时非状态运行时路由返回 `503`。

安全：响应从不包含 bearer 令牌、客户端 ID、完整 ACP 连接 ID、设备流用户代码或验证 URL。`summary` 省略守护进程日志路径；`full` 可能为已认证的操作员包含该路径。

### `GET /capabilities`

```json
{
  "v": 1,
  "protocolVersions": {
    "current": "v1",
    "supported": ["v1"]
  },
  "mode": "http-bridge",
  "features": ["health", "daemon_status", "capabilities", "..."],
  "modelServices": [],
  "workspaceCwd": "/canonical/path/to/workspace"
}
```

稳定契约：当 `v` 增加时，帧布局发生了不向后兼容的变化。

> **`protocolVersions`** 描述守护进程能够使用的 serve 协议版本。`current` 是守护进程首选的协议版本，`supported` 是兼容的集合。需要特定协议版本的客户端应检查 `supported`；功能特定 UI 仍应基于 `features` 进行门控。对 v=1 的补充：较旧的 v=1 守护进程省略此字段，因此针对较旧版本构建的 SDK 客户端应将其视为可选字段。

> **`modelServices` 在阶段 1 始终为 `[]`。** 代理使用其单个默认模型服务，不会在网络上枚举它。阶段 2 将从注册的模型适配器填充此字段，以便 SDK 客户端可以构建服务选择器；在此之前，请**不要**依赖此字段为非空。

> **`workspaceCwd`** 是该守护进程绑定的规范绝对路径（#3803 §02 —— 1 个守护进程 = 1 个工作区）。使用它来（a）在 `POST /session` 之前检测不匹配，以及（b）在 `POST /session` 上省略 `cwd`（路由回退到此路径）。多工作区部署在不同端口上公开多个守护进程，每个都有自己的 `workspaceCwd`。对 v=1 的补充：§02 之前的 v=1 守护进程省略此字段——针对较旧版本构建的客户端在消费之前应进行空值检查。

### 只读运行时状态路由

这些路由报告守护进程端的运行时快照。它们是补充性的 v1 路由，不改变状态，也不更改 serve 协议版本。工作区状态路由特意**不会**仅仅因为客户端轮询 GET 路由而启动 ACP 子进程：如果守护进程空闲，它们返回 `initialized: false` 以及空快照。会话状态路由需要实时会话，对于未知 ID 使用标准的 `404 SessionNotFoundError` 格式。

能力标签：

- `workspace_mcp` → `GET /workspace/mcp`
- `workspace_skills` → `GET /workspace/skills`
- `workspace_providers` → `GET /workspace/providers`
- `workspace_env` → `GET /workspace/env`
- `workspace_preflight` → `GET /workspace/preflight`
- `session_context` → `GET /session/:id/context`
- `session_supported_commands` → `GET /session/:id/supported-commands`
- `session_tasks` → `GET /session/:id/tasks`
- `session_status` → `GET /session/:id/status`

通用状态单元格：

```ts
type DaemonStatus =
  | 'ok'
  | 'warning'
  | 'error'
  | 'disabled'
  | 'not_started'
  | 'unknown';

type DaemonErrorKind =
  | 'missing_binary'
  | 'blocked_egress'
  | 'auth_env_error'
  | 'init_timeout'
  | 'protocol_error'
  | 'missing_file'
  | 'parse_error';

interface DaemonStatusCell {
  kind: string;
  status: DaemonStatus;
  error?: string;
  errorKind?: DaemonErrorKind;
  hint?: string;
}
```

`errorKind` 是一个封闭枚举，由 `/workspace/preflight`、`/workspace/env` 和（最终）MCP 护栏共享，以便 SDK 客户端可以按类别呈现修复建议，而不是解析自由格式消息。PR 13（#4175）引入了上面列出的七个字面量；PR 14 将在出口探测落地后填充 `blocked_egress`。

状态负载永远不会暴露 MCP 环境值、标头、OAuth/服务账户详情、提供者 API key、提供者 `baseUrl` / `envKey`、技能体、技能文件系统路径、钩子定义或秘密环境变量的值。`/workspace/env` 仅报告白名单环境变量的**存在**；代理 URL 在发送到网络之前会被剥离凭据并缩减为 `host:port`。

### `GET /workspace/mcp`

```json
{
  "v": 1,
  "workspaceCwd": "/canonical/path",
  "initialized": true,
  "discoveryState": "completed",
  "servers": [
    {
      "kind": "mcp_server",
      "status": "ok",
      "name": "docs",
      "mcpStatus": "connected",
      "transport": "stdio",
      "disabled": false,
      "description": "文档服务器",
      "extensionName": "docs-ext"
    }
  ]
}
```

`discoveryState` 可以是 `not_started`、`in_progress` 或 `completed`。`transport` 可以是 `stdio`、`sse`、`http`、`websocket`、`sdk` 或 `unknown`。发现成功时省略 `errors`。

**MCP 客户端护栏（issue [#4175](https://github.com/QwenLM/qwen-code/issues/4175) PR 14）。** PR-14 后的守护进程通过四个补充字段和一个工作区级别的单元格扩展负载：

```jsonc
{
  "v": 1,
  "workspaceCwd": "/canonical/path",
  "initialized": true,
  "discoveryState": "completed",
  "clientCount": 3,
  "clientBudget": 2,
  "budgetMode": "enforce",
  "budgets": [
    {
      "kind": "mcp_budget",
      "scope": "session",
      "status": "error",
      "errorKind": "budget_exhausted",
      "hint": "提高 --mcp-client-budget 或从 mcpServers 配置中移除服务器。",
      "liveCount": 2,
      "budget": 2,
      "mode": "enforce",
      "refusedCount": 1,
    },
  ],
  "servers": [
    {
      "kind": "mcp_server",
      "status": "ok",
      "name": "a",
      "mcpStatus": "connected",
      "transport": "stdio",
      "disabled": false,
    },
    {
      "kind": "mcp_server",
      "status": "ok",
      "name": "b",
      "mcpStatus": "connected",
      "transport": "stdio",
      "disabled": false,
    },
    {
      "kind": "mcp_server",
      "status": "error",
      "name": "c",
      "mcpStatus": "disconnected",
      "transport": "stdio",
      "disabled": false,
      "disabledReason": "budget",
      "errorKind": "budget_exhausted",
      "hint": "...",
    },
  ],
}
```

`budgetMode` 可以是 `enforce`、`warn` 或 `off`。未设置预算时省略 `clientBudget`。`budgets[]` 在 PR-14 后的守护进程中**始终是一个数组**（当 `budgetMode === 'off'` 时可能为空）；PR-14 前的守护进程完全省略该字段。v1 发送一个 `scope: 'session'` 的单元格（每会话强制——有关原因请参见上面的能力部分）。消费者**必须**容忍具有无法识别的 `scope` 值的额外 `budgets[]` 条目——Wave 5 PR 23 将在没有架构变更的情况下添加 `scope: 'workspace'`（或 `'pool'`）与每会话单元格共存。

每个服务器单元格上的 `disabledReason` 区分操作员禁用（`'config'` —— `disabledMcpServers` 配置列表）与预算拒绝（`'budget'` —— 已发现但由于 `enforce` 模式而从未连接）。拒绝是确定性的，按 `Object.entries(mcpServers)` 声明顺序。每服务器 `status: 'error', errorKind: 'budget_exhausted'` 掩盖了原始的 `mcpStatus: 'disconnected'`（它本身为真，但不是面向操作员的严重级别）。

PR 14 v1 中的预算强制是**每会话**，而不是每工作区。尽管模式 B 守护进程在进程级别是 `1 个守护进程 = 1 个工作区 × N 个会话`（#4113 之后），但 `McpClientManager` 在每个 ACP 会话的 `Config` 中通过 `acpAgent.newSessionConfig` 构造，因此 N 个会话各自强制执行自己的容量副本。快照代表引导会话的视图。Wave 5 PR 23 引入了工作区范围的共享 MCP 池，将其提升为真正的每工作区强制。

**检测预算压力。** 两个表面，都在 PR-14b 之后填充：

- **推送事件**（通过 `mcp_guardrail_events` 宣告）：订阅 `GET /session/:id/events` 并通过 `KnownDaemonEvent` 筛选 `mcp_budget_warning` / `mcp_child_refused_batch` 帧。状态机在每次向上穿越 75% 时触发一次（低于 37.5% 时重新武装）；拒绝在每次发现阶段中在 `enforce` 模式下合并一次。
- **快照轮询**（通过 `mcp_guardrails` 宣告）：`GET /workspace/mcp` 并检查每会话预算单元格（`budgets[0]`）：

- `budgets[0].status === 'warning'` ⇔ `liveCount >= 0.75 * clientBudget`（匹配 PR 14b 推送事件将使用的滞后阈值）。
- `budgets[0].status === 'error'` ⇔ `refusedCount > 0`（此发现阶段拒绝了一个或多个服务器）。
- `budgets[0].status === 'ok'` ⇔ 低于 75% 阈值且无拒绝。

建议轮询频率：与已经轮询 `/workspace/mcp` 的对齐；快照是轻量的，预算单元格不会带来额外的发现成本。订阅推送事件的 SDK 客户端仍可受益于快照以获取长时间断开后的状态（SSE 回放环深度有限——`--event-ring-size`，默认 8000——因此离线时间超过环覆盖范围的客户端会回退到快照重新同步）。

### `GET /workspace/skills`

```json
{
  "v": 1,
  "workspaceCwd": "/canonical/path",
  "initialized": true,
  "skills": [
    {
      "kind": "skill",
      "status": "ok",
      "name": "review",
      "description": "审查代码",
      "level": "project",
      "modelInvocable": true,
      "argumentHint": "[路径]"
    }
  ]
}
```

`level` 可以是 `project`、`user`、`extension` 或 `bundled`。发现成功时省略 `errors`。

### `GET /workspace/providers`

```json
{
  "v": 1,
  "workspaceCwd": "/canonical/path",
  "initialized": true,
  "current": { "authType": "qwen", "modelId": "qwen3(qwen)" },
  "providers": [
    {
      "kind": "model_provider",
      "status": "ok",
      "authType": "qwen",
      "current": true,
      "models": [
        {
          "modelId": "qwen3(qwen)",
          "baseModelId": "qwen3",
          "name": "Qwen 3",
          "description": null,
          "contextLimit": 4096,
          "isCurrent": true,
          "isRuntime": false
        }
      ]
    }
  ]
}
```

模型按认证类型分组。提供者连接诊断位于 `/workspace/preflight` 的 `providers` 单元格中；环境预检位于 `/workspace/preflight` 和 `/workspace/env`（如下）。快照构建成功时省略 `errors`。

### `GET /workspace/env`

报告守护进程进程的运行时、平台、沙箱、代理以及**白名单秘密环境变量的存在**。始终从 `process.*` 状态回答——守护进程永远不会为了服务此路由而生成 ACP 子进程，无论 ACP 是否启动或空闲，响应都是相同的。`acpChannelLive` 字段仅用于信息性目的。

```json
{
  "v": 1,
  "workspaceCwd": "/canonical/path",
  "initialized": true,
  "acpChannelLive": false,
  "cells": [
    { "kind": "runtime", "name": "node", "status": "ok", "value": "22.4.0" },
    { "kind": "platform", "name": "darwin", "status": "ok", "value": "arm64" },
    {
      "kind": "sandbox",
      "name": "SANDBOX",
      "status": "disabled",
      "present": false
    },
    {
      "kind": "proxy",
      "name": "HTTPS_PROXY",
      "status": "ok",
      "present": true,
      "value": "proxy.internal:1080"
    },
    {
      "kind": "proxy",
      "name": "NO_PROXY",
      "status": "disabled",
      "present": false
    },
    {
      "kind": "env_var",
      "name": "OPENAI_API_KEY",
      "status": "ok",
      "present": true
    },
    {
      "kind": "env_var",
      "name": "ANTHROPIC_BASE_URL",
      "status": "disabled",
      "present": false
    }
  ]
}
```

单元格形状：

```ts
type DaemonEnvKind =
  | 'runtime' // name: 'node' | 'bun' | 'unknown'; value: process.versions.node
  | 'platform' // name: process.platform; value: process.arch
  | 'sandbox' // name: 'SANDBOX' | 'SEATBELT_PROFILE'; value optional
  | 'proxy' // name: HTTP_PROXY | HTTPS_PROXY | NO_PROXY | ALL_PROXY; value: redacted host
  | 'env_var'; // presence-only; value field is ALWAYS omitted

interface DaemonEnvCell extends DaemonStatusCell {
  kind: DaemonEnvKind;
  name: string;
  present?: boolean;
  value?: string;
}
```

**编辑策略。** `kind: 'env_var'` 单元格从不包含 `value` 字段；客户端仅看到 `present: boolean`。`kind: 'proxy'` 单元格先对原始环境变量值进行凭据编辑（`redactProxyCredentials`），然后通过 `URL` 解析，以便网络上仅携带 `host:port`。`NO_PROXY` 直接通过编辑传递，因为它是主机列表而非 URL。当前枚举的秘密环境变量白名单包括 `OPENAI_API_KEY`、`ANTHROPIC_API_KEY`、`GEMINI_API_KEY`、`GOOGLE_API_KEY`、`DASHSCOPE_API_KEY`、`OPENROUTER_API_KEY` 和 `QWEN_SERVER_TOKEN`。其他环境变量不会被枚举，因此意外设置的秘密保持不可见。

### `GET /workspace/preflight`

报告守护进程就绪检查。**守护进程级别单元格**（`node_version`、`cli_entry`、`workspace_dir`、`ripgrep`、`git`、`npm`）始终从 `process.*` 和 `node:fs` 填充。**ACP 级别单元格**（`auth`、`mcp_discovery`、`skills`、`providers`、`tool_registry`、`egress`）需要实时的 ACP 子进程——当守护进程空闲时，它们会发出 `status: 'not_started'` 占位符。该路由永远不会为了填充单元格而单独生成 ACP；相应的单元格会回退到 `not_started`。

空闲响应（无 ACP 子进程）：

```json
{
  "v": 1,
  "workspaceCwd": "/canonical/path",
  "initialized": true,
  "acpChannelLive": false,
  "cells": [
    {
      "kind": "node_version",
      "status": "ok",
      "locality": "daemon",
      "detail": { "version": "22.4.0", "required": ">=22" }
    },
    {
      "kind": "cli_entry",
      "status": "ok",
      "locality": "daemon",
      "detail": { "path": "/usr/local/bin/qwen", "source": "process.argv[1]" }
    },
    {
      "kind": "workspace_dir",
      "status": "ok",
      "locality": "daemon",
      "detail": { "path": "/canonical/path" }
    },
    { "kind": "ripgrep", "status": "ok", "locality": "daemon" },
    {
      "kind": "git",
      "status": "ok",
      "locality": "daemon",
      "detail": { "version": "2.45.0" }
    },
    {
      "kind": "npm",
      "status": "ok",
      "locality": "daemon",
      "detail": { "version": "10.7.0" }
    },
    {
      "kind": "auth",
      "status": "not_started",
      "locality": "acp",
      "hint": "创建一个会话以填充"
    },
    {
      "kind": "mcp_discovery",
      "status": "not_started",
      "locality": "acp",
      "hint": "创建一个会话以填充"
    },
    {
      "kind": "skills",
      "status": "not_started",
      "locality": "acp",
      "hint": "创建一个会话以填充"
    },
    {
      "kind": "providers",
      "status": "not_started",
      "locality": "acp",
      "hint": "创建一个会话以填充"
    },
    {
      "kind": "tool_registry",
      "status": "not_started",
      "locality": "acp",
      "hint": "创建一个会话以填充"
    },
    {
      "kind": "egress",
      "status": "not_started",
      "locality": "acp",
      "hint": "出口探测将在 PR 14（#4175）中落地"
    }
  ]
}
```
单元格形状：

```ts
type DaemonPreflightKind =
  | 'node_version'
  | 'cli_entry'
  | 'workspace_dir'
  | 'ripgrep'
  | 'git'
  | 'npm'
  | 'auth'
  | 'mcp_discovery'
  | 'skills'
  | 'providers'
  | 'tool_registry'
  | 'egress';

interface DaemonPreflightCell extends DaemonStatusCell {
  kind: DaemonPreflightKind;
  locality: 'daemon' | 'acp';
  detail?: Record<string, unknown>;
}
```

`errorKind` 语义：

- `missing_binary` — Node 版本低于要求，缺少 `QWEN_CLI_ENTRY`，ripgrep/git/npm 不在 PATH 上（对可选二进制文件而言是警告而非错误）。
- `missing_file` — `boundWorkspace` 不存在或不是目录；技能解析错误指向缺失或不可读的文件。
- `parse_error` — `SKILL.md` 解析失败，配置 JSON 格式错误。
- `auth_env_error` — `validateAuthMethod` 返回了非 null 失败字符串，或从提供商解析传播的 `ModelConfigError` 子类。
- `init_timeout` — 桥接器中的 `withTimeout` 拒绝（实际超时，等待 ACP 往返）。通过 `BridgeTimeoutError` 类型类识别。注意：瞬态 `mcp_discovery` `warning` 单元格的 `connecting > 0` 状态不包含此 kind——那是正常的握手进行中状态，与真实超时不同。
- `protocol_error` — ACP `extMethod` 因通道在请求中途关闭而拒绝，或工具注册表意外缺失。
- `blocked_egress` — 为 PR 14 (#4175) 预留。PR 13 将 `egress` 单元格保留为 `status: 'not_started'`。

如果在处理预检请求时桥接器无法到达 ACP 子进程（例如请求中途通道关闭），封包中的 `errors` 数组会包含一个 `ServeStatusCell` 描述失败，单元格则回退为 `not_started` ACP 占位符。守护进程级别的单元格仍然返回。

### 工作区文件路由

所有文件路径通过守护进程绑定的工作区解析。响应使用工作区相对路径，在正常成功情况下绝不返回绝对文件系统路径。成功的文件响应包含：

```http
Cache-Control: no-store
X-Content-Type-Options: nosniff
```

文件系统错误使用此 JSON 结构：

```json
{
  "errorKind": "hash_mismatch",
  "error": "expected sha256:..., found sha256:...",
  "hint": "re-read the file and retry with the latest hash",
  "status": 409
}
```

`errorKind` 值包括 `path_outside_workspace`、`symlink_escape`、`path_not_found`、`binary_file`、`file_too_large`、`untrusted_workspace`、`permission_denied`、`parse_error`、`hash_mismatch`、`file_already_exists`、`text_not_found` 和 `ambiguous_text_match`。

#### `GET /file`

读取文本文件。查询参数：`path`（必需）、`maxBytes`、`line` 和 `limit`。守护进程拒绝二进制文件和超过文本读取上限的文件。响应包含 `hash`，即整个文件原始磁盘字节的 SHA-256 摘要，即使 `line`、`limit` 或 `maxBytes` 返回了切片。

```json
{
  "kind": "file",
  "path": "src/index.ts",
  "content": "export {};\n",
  "encoding": "utf-8",
  "bom": false,
  "lineEnding": "lf",
  "sizeBytes": 11,
  "returnedBytes": 11,
  "truncated": false,
  "hash": "sha256:...",
  "matchedIgnore": null,
  "originalLineCount": null
}
```

#### `GET /file/bytes`

读取文件的原始字节，不解码。查询参数：`path`（必需）、`offset`（默认为 `0`）和 `maxBytes`（默认 `65536`，最大 `262144`）。此路由支持对大型二进制文件进行有界窗口读取，无需读取整个文件。只有当返回的窗口覆盖整个文件时，响应才包含 `hash`。

```json
{
  "kind": "file_bytes",
  "path": "assets/logo.png",
  "offset": 0,
  "sizeBytes": 3912,
  "returnedBytes": 3912,
  "truncated": false,
  "contentBase64": "...",
  "hash": "sha256:..."
}
```

#### `POST /file/write`

创建或替换文本文件。这是一个严格的可变路由：在环回（loopback）且未配置 token 时返回 `401 { "code": "token_required" }`。使用 `--require-auth` 时，全局 Bearer 中间件会在路由执行前拒绝未经身份验证的请求。

请求体：

```json
{
  "path": "src/new.ts",
  "content": "export const value = 1;\n",
  "mode": "create"
}
```

```json
{
  "path": "src/existing.ts",
  "content": "export const value = 2;\n",
  "mode": "replace",
  "expectedHash": "sha256:..."
}
```

`mode` 必须为 `create` 或 `replace`。`create` 从不覆写已有文件（返回 `409 file_already_exists`）。`replace` 需要 `expectedHash`；缺失或格式错误的哈希为 `400 parse_error`，陈旧的哈希为 `409 hash_mismatch`。`expectedHash` 格式为 `sha256:` 加上 64 个小写十六进制字符，基于原始磁盘字节计算。

可以指定 `bom`、`encoding` 和 `lineEnding`。替换操作默认保留现有文件的编码配置；显式字段会覆盖默认值。二进制写入不在范围之内。

守护进程在目标目录中写入一个随机临时文件，在支持的系统上执行 fsync，在 `rename()` 之前立即重新检查当前哈希，然后重命名到位。这样可以防止部分文件被观察到，并序列化同一文件的守护进程发起写入，但它不是跨进程的内核比较并交换：外部编辑器仍可能在最终哈希检查与重命名之间的微小窗口内竞争。

```json
{
  "kind": "file_write",
  "path": "src/existing.ts",
  "mode": "replace",
  "created": false,
  "sizeBytes": 24,
  "hash": "sha256:...",
  "encoding": "utf-8",
  "bom": false,
  "lineEnding": "lf",
  "matchedIgnore": null
}
```

#### `POST /file/edit`

对现有文本文件应用一次精确文本替换。这也是一个严格的可变路由，需要 `expectedHash`。

```json
{
  "path": "src/config.ts",
  "oldText": "timeout: 30000",
  "newText": "timeout: 60000",
  "expectedHash": "sha256:..."
}
```

`oldText` 必须非空且恰好出现一次。无匹配返回 `422 text_not_found`；多次匹配返回 `422 ambiguous_text_match`。该路由保留编码、BOM 和行结束符，并在原子重命名之前立即重新检查 `expectedHash`。

对忽略路径的显式写入/编辑是允许的，因为经过身份验证的调用者指定了路径。成功响应和审计事件包含 `matchedIgnore: "file" | "directory" | null`。

```json
{
  "kind": "file_edit",
  "path": "src/config.ts",
  "replacements": 1,
  "sizeBytes": 128,
  "hash": "sha256:...",
  "encoding": "utf-8",
  "bom": false,
  "lineEnding": "lf",
  "matchedIgnore": null
}
```

### `GET /session/:id/context`

```json
{
  "v": 1,
  "sessionId": "<sid>",
  "workspaceCwd": "/canonical/path",
  "state": {
    "models": {},
    "modes": {},
    "configOptions": []
  }
}
```

`state` 镜像了 `POST /session`、`POST /session/:id/load` 和 `POST /session/:id/resume` 使用的相同 ACP 模型/模式/配置选项结构。

### `GET /session/:id/supported-commands`

```json
{
  "v": 1,
  "sessionId": "<sid>",
  "availableCommands": [
    {
      "name": "init",
      "description": "Initialize the project",
      "input": null,
      "_meta": { "source": "builtin" }
    }
  ],
  "availableSkills": ["review"]
}
```

`availableCommands` 与 `available_commands_update` SSE 通知使用的命令快照相同。`availableSkills` 仅列出技能名称；客户端不应通过此路由期望技能主体或路径。

### `GET /session/:id/tasks`

```json
{
  "v": 1,
  "sessionId": "<sid>",
  "now": 1700000000000,
  "tasks": [
    {
      "kind": "agent",
      "id": "agent-1",
      "label": "reviewer: check failure",
      "description": "check failure",
      "status": "running",
      "startTime": 1699999999000,
      "runtimeMs": 1000,
      "outputFile": "/tmp/agent-1.jsonl",
      "isBackgrounded": true,
      "subagentType": "reviewer"
    }
  ]
}
```

此路由是一个只读的带外快照。它有意不作为 prompt，可以在会话流式传输时查询。响应仅包含来自 agent、shell 和 monitor 任务注册表的白名单元数据；控制器、计时器、偏移量、待处理消息和原始注册表对象从不暴露。

### `GET /session/:id/lsp`

```json
{
  "v": 1,
  "sessionId": "<sid>",
  "workspaceCwd": "/canonical/path",
  "enabled": true,
  "configuredServers": 1,
  "readyServers": 1,
  "failedServers": 0,
  "inProgressServers": 0,
  "notStartedServers": 0,
  "servers": [
    {
      "name": "typescript",
      "status": "READY",
      "languages": ["typescript", "javascript"],
      "transport": "stdio",
      "command": "typescript-language-server"
    }
  ]
}
```

`status` 为 `NOT_STARTED`、`IN_PROGRESS`、`READY` 或 `FAILED` 之一。可选字段 `error` 在失败的服务器上可用时存在。禁用的 LSP（包括 bare 模式）返回 HTTP 200，`enabled: false`、计数为零且 `servers: []`。启用 LSP 但未配置服务器时返回 `enabled: true`、`configuredServers: 0` 和 `servers: []`。如果在客户端存在之前初始化失败，响应可能包含 `initializationError`；如果活动客户端无法提供快照，响应包含 `statusUnavailable: true`。

此路由仅暴露稳定的客户端面向字段。它有意省略调试内部细节，如进程 ID、启动参数、stderr 尾部、根 URI 和工作区文件夹路径。

### `POST /session`

生成一个新的 agent 或附加到一个已有的 agent（在 `sessionScope: 'single'` 即默认情况下）。

请求：

```json
{
  "cwd": "/absolute/path/to/workspace",
  "modelServiceId": "qwen-prod",
  "sessionScope": "thread"
}
```

| 字段              | 必需 | 说明                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| ----------------- | ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `cwd`             | 否   | 绝对路径，必须匹配守护进程绑定的工作区。如果省略，路由回退到 `boundWorkspace`（可通过 `/capabilities.workspaceCwd` 读取）。不匹配的非空 `cwd` 返回 `400 workspace_mismatch`（#3803 §02 — 1 个守护进程 = 1 个工作区）。工作区路径通过 `realpathSync.native` 规范化（对于不存在的路径有仅解析的回退），因此大小写不敏感的文件系统不会因拼写差异而拒绝会话。                                                                                                                                                                                                                                                                                                                                             |
| `modelServiceId`  | 否   | 选择 agent 将路由通过哪个已配置的 _模型服务_（后端提供商 — 阿里云 ModelStudio、OpenRouter 等）。如果省略，agent 使用其默认值。如果工作区已有会话，则对现有会话调用 `setSessionModel` 并广播 `model_switched`。与 `POST /session/:id/model` 上的 `modelId` 不同，后者选择已绑定服务 **内** 的模型。`/capabilities` 上的 `modelServices` 数组用于宣传已配置的服务；在阶段 1 中它始终为 `[]`（agent 的默认服务被使用，不通过 HTTP 枚举）。                                                                                                                            |
| `sessionScope`    | 否   | 每次请求的会话共享覆盖。`'single'`（守护进程全局默认）使第二个相同工作区的 `POST /session` 重用现有会话（`attached: true`）；`'thread'` 强制每次调用都创建新的独立会话。省略则继承守护进程全局默认值。超出枚举的值返回 `400 { code: 'invalid_session_scope' }`。旧守护进程（pre-#4175 PR 5）会静默忽略此字段 — 请在发送前检查 `caps.features.session_scope_override`。当前生产环境中，守护进程全局默认硬编码为 `'single'`；#4175 可能会在后续添加 `--sessionScope` CLI 标志。                                                                                                         |

响应：

```json
{
  "sessionId": "<uuid>",
  "workspaceCwd": "/canonical/path",
  "attached": false
}
```

`attached: true` 表示该工作区会话已存在，你现在正在共享它。

同一工作区的并发 `POST /session` 调用会 **合并** 为一次生成 — 两个调用者都获得相同的 `sessionId`，仅有一个报告 `attached: false`。如果底层生成失败（初始化超时、agent 输出格式错误、OOM），**所有合并的调用者都会收到相同的错误** — 正在进行的槽位会被清除，以便后续调用可以从头重试。

> ⚠️ **在新会话上 `modelServiceId` 被拒绝时，HTTP 响应不会报错。** 错误的 `modelServiceId`（拼写错误、未配置的服务）不会导致创建返回 500 — 会话仍在 agent 默认模型上运行，因此调用者仍然获得一个 `sessionId`，之后可以通过 `POST /session/:id/model` 重试模型切换。可见的失败信号是会话 SSE 流上的 `model_switch_failed` 事件，在生成握手与你的第一次订阅之间触发。**需要观察此事件的订阅者应在首次 `GET /session/:id/events` 时传递 `Last-Event-ID: 0`**，以从环形缓冲区中最旧可用事件开始重放（覆盖生成时的 `model_switch_failed`，即使订阅在创建响应之后几毫秒才到达）。

### `POST /session/:id/load`

按 ID 恢复持久化的 ACP 会话，并通过 SSE 重放其历史。路径中的 id 是权威的；请求体中的任何 `sessionId` 字段都将被忽略。发送前检查 `caps.features.session_load` — 旧守护进程对此路由返回 `404`。

请求：

```json
{
  "cwd": "/absolute/path/to/workspace"
}
```

| 字段  | 必需 | 说明                                                                                                                                                                                                       |
| ----- | ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `cwd` | 否   | 与 `POST /session` 相同的规范化 + `workspace_mismatch` 规则。省略则继承 `/capabilities.workspaceCwd`。此处刻意不接受 `mcpServers` — 守护进程级别的 MCP 由设置驱动（与 `POST /session` 一致）。 |

响应：

```json
{
  "sessionId": "persisted-1",
  "workspaceCwd": "/canonical/path",
  "attached": false,
  "state": {
    "models": { ... },
    "modes": { ... },
    "configOptions": [ ... ]
  }
}
```

`state` 镜像 ACP 的 `LoadSessionResponse` — `models` 是 `SessionModelState`，`modes` 是 `SessionModeState`，`configOptions` 是 `SessionConfigOption` 数组。缺失的字段由 agent 决定。后期附加者（下面的 `attached: true` 路径）获得与原始加载调用者相同的 `state` 快照 — 守护进程将其缓存在条目上；运行时突变（例如 `model_switched`）通过 SSE 流传递，而不是在后续附加响应中。

`attached: true` 表示会话已经活跃（要么来自之前的 `session/load`/`session/resume`，要么因为合并的并发调用者抢先了一步）。

**通过 SSE 进行历史重放。** 当 `loadSession` 在 agent 端进行中时，agent 会为每个持久化的轮次发出 `session_update` 通知。守护进程在路由响应返回之前将这些通知缓冲到会话的事件总线上，因此立即调用 `GET /session/:id/events` 并传入 `Last-Event-ID: 0` 的订阅者可以看到完整重放。**重放环形缓冲区是有界的**（每个会话默认为 8000 帧）。包含许多工具调用/思考流轮次的长历史可能超出此限制 — 最旧的帧会被静默丢弃。需要完整历史的客户端应在 `load` 返回后立即订阅；或者，它们可以持久化 SSE 事件 ID 并使用 `Last-Event-ID` 从稍后的轮次边界继续。

**错误：**

- `404` — 持久化会话 ID 不存在（`SessionNotFoundError`）。
- `400` — `workspace_mismatch`（与 `POST /session` 相同结构）。
- `503` — `session_limit_exceeded`（计入 `--max-sessions`；正在进行的恢复也计算在内）。
- `409` — `restore_in_progress`（同一 ID 的 `session/resume` 正在进行中）。`Retry-After: 5`。相同操作的竞态（两个并发的 `session/load` 针对同一 ID）会合并 — 确切地有一个返回 `attached: false`，其余返回 `attached: true` 并携带相同的 `state`。

### `POST /session/:id/resume`

按 ID 恢复持久化的 ACP 会话，但不通过 SSE 重放历史。模型上下文在 agent 端内部恢复（通过 `geminiClient.initialize` 读取 `config.getResumedSessionData`）；SSE 流保持干净，适用于已经渲染了历史的客户端。发送前检查 `caps.features.session_resume`；`unstable_session_resume` 作为已弃用的兼容别名保留给旧客户端。

请求体与 `/load` 相同。响应体与 `/load` 相同 — `state` 镜像 ACP 的 `ResumeSessionResponse`。相同的错误封包，包括 `409 restore_in_progress`（当 `session/load` 正在进行时触发；`session/resume` 跟在另一个 `session/resume` 后面时合并）。

当客户端没有渲染任何历史记录时（冷重连、选择器 → 打开）使用 `/load`。当客户端已经拥有当前屏幕上的轮次，只需要守护进程端的句柄时使用 `/resume`。

> ⚠️ **为什么 `unstable_session_resume` 仍然被宣传？** 守护进程的 HTTP 路由和 `session_resume` 能力对于 v1 是稳定的，但桥接器仍然调用 ACP 的 `connection.unstable_resumeSession`。旧的标签只保留，以便在 `session_resume` 之前发布的 SDK 可以继续工作。

### `GET /workspace/:id/sessions`

列出所有规范工作区匹配 `:id`（URL 编码的绝对 cwd）的活跃会话。

```bash
curl http://127.0.0.1:4170/workspace/$(jq -rn --arg c "$PWD" '$c|@uri')/sessions
```

响应：

```json
{
  "sessions": [
    {
      "sessionId": "<uuid>",
      "workspaceCwd": "/canonical/path",
      "createdAt": "2026-05-17T08:30:00.000Z",
      "displayName": "My Session",
      "clientCount": 2,
      "hasActivePrompt": false
    }
  ]
}
```

当没有会话时返回空数组（而非 404）—— 会话选择器 UI 不应因为工作区空闲而报错。

### `POST /session/:id/prompt`

向 agent 转发一个 prompt。多 prompt 调用者按会话 FIFO 排队（ACP 保证每个会话只有一个活跃 prompt）。

请求：

```json
{
  "prompt": [{ "type": "text", "text": "What does src/main.ts do?" }]
}
```

验证：`prompt` 必须是非空对象数组。其他失败在到达桥接器前返回 `400`。

响应：

```json
{ "stopReason": "end_turn" }
```

其他停止原因：`cancelled`、`max_tokens`、`error`、`length`（根据 ACP 规范）。

如果 HTTP 客户端在 prompt 处理中断开连接，守护进程会向 agent 发送 ACP `cancel` 通知，agent 会以 `stopReason: "cancelled"` 结束 prompt。
> **阶段 1 的限制 — 无服务端 prompt 超时。** 桥接器仅将代理的 `prompt()` 与 `transportClosedReject`（代理子进程崩溃）以及调用方的 HTTP 断开 AbortSignal 进行竞争。一个卡住但仍活跃的代理（例如，挂起的模型调用）会阻塞每个会话的 FIFO 队列，直到 HTTP 客户端超时断开连接。长时间运行的 prompt 是合理的（深入研究、大型代码库分析），因此故意不设置默认截止时间；阶段 2 将暴露一个可配置的 `promptTimeoutMs` 选项。在此之前，调用方应自行设置客户端超时并在到期时断开连接（或调用 `POST /session/:id/cancel`）。

### `POST /session/:id/cancel`

取消会话中**当前正在执行**的 prompt。在 ACP 侧，这是一个通知，而非请求——代理通过将活跃的 `prompt()` 解析为 `cancelled` 来进行确认。

```bash
curl -X POST http://127.0.0.1:4170/session/$SID/cancel
# → 204 No Content
```

> **多 prompt 约定：** cancel 仅影响当前活跃的 prompt。同一客户端先前 POST 的、仍在当前 prompt 之后排队等待的任何 prompt 将继续执行。多 prompt 排队是守护进程引入的行为（不在 ACP 规范中）；排队 prompt 的约定是“除非你逐个取消，或通过通道退出终止会话，否则它们会继续运行”。

### `DELETE /session/:id`

显式关闭一个活跃的会话。即使其他客户端仍连接也会强制关闭——取消任何活跃的 prompt，将待处理的权限解析为已取消，发布 `session_closed` 事件，关闭 EventBus，并从守护进程映射中移除该会话。磁盘上持久化的会话**不会被删除**——可以通过 `POST /session/:id/load` 重新加载。前提条件：`caps.features.session_close`。

```bash
curl -X DELETE http://127.0.0.1:4170/session/$SID
# → 204 No Content
```

幂等性：对未知会话返回 `404`（与其他路由相同的 `SessionNotFoundError` 结构）。

> **`session_closed` 事件。** SSE 订阅者在流结束前会收到一个终止性的 `session_closed` 事件，包含 `{ sessionId, reason: 'client_close', closedBy?: '<clientId>' }`。SDK reducer 将其与 `session_died` 同等对待（设置 `alive: false`，清除 `pendingPermissions`）。

### `PATCH /session/:id/metadata`

更新可变的会话元数据。当前仅支持 `displayName`。前提条件：`caps.features.session_metadata`。

请求：

```json
{ "displayName": "My Investigation Session" }
```

| 字段          | 必需 | 说明                                                                    |
| ------------- | ---- | ----------------------------------------------------------------------- |
| `displayName` | 否   | 字符串，最多 256 字符。空字符串清除名称。省略则保持原样。               |

响应：

```json
{ "sessionId": "<uuid>", "displayName": "My Investigation Session" }
```

在会话的 SSE 流上发布一个 `session_metadata_updated` 事件，包含 `{ sessionId, displayName }`。

### `POST /session/:id/heartbeat`

更新守护进程对该会话的最后可见记录。长寿命适配器（TUI/IDE/Web）定期 ping 此端点，以便未来的撤销策略（Wave 5 PR 24）能够区分已死客户端与静默客户端。

请求头：

| 请求头                 | 必需 | 说明                                                                                                                                                                                                                                  |
| ---------------------- | ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `X-Qwen-Client-Id` | 否   | 回显从 `POST /session` 获得的守护进程颁发的 id。已识别的客户端同时更新其每个客户端的时间戳；匿名心跳仅更新每个会话的水位线。必须满足与其他地方相同的 `[A-Za-z0-9._:-]{1,128}` 格式。 |

请求体为空（允许 `{}`——当前不读取任何字段）。

响应：

```json
{
  "sessionId": "<sid>",
  "clientId": "<cid>",
  "lastSeenAt": 1700000000123
}
```

仅在提供了受信任的 `X-Qwen-Client-Id` 时，`clientId` 才会被回显。`lastSeenAt` 是守护进程侧存储的 `Date.now()` 纪元时间（毫秒）。

错误：

- `400` — `{ code: 'invalid_client_id' }`：请求头格式错误（请求头格式规则）或携带的 `clientId` 未注册到此会话（桥接器在更新任何时间戳之前抛出 `InvalidClientIdError`）。
- `404` — 未知会话。

能力门控：前提条件 `caps.features.client_heartbeat`。较老的守护进程对此路径返回 `404`。

### `POST /session/:id/model`

在会话当前绑定的模型服务内**切换**活跃模型。通过每个会话的模型变更队列进行序列化。

（要切换_服务本身_——例如 Alibaba ModelStudio 与 OpenRouter 等——请通过 `POST /session` 创建一个新的会话并传入 `modelServiceId`。阶段 1 没有实时的服务切换路由。）

请求：

```json
{ "modelId": "qwen-staging" }
```

响应：

```json
{ "modelId": "qwen-staging" }
```

成功时，向 SSE 流发布 `model_switched`。失败时，发布 `model_switch_failed`（以便被动订阅者也能看到失败，而不仅仅是调用方）。与代理通道退出竞争，因此卡住的子进程不会阻塞 HTTP 处理程序。

### `POST /session/:id/recap`

能力标签：`session_recap`。Bridge → ACP extMethod `qwen/control/session/recap`。

为会话生成一句话的“上次进展到哪了”总结。封装了 core 的 `generateSessionRecap`（`packages/core/src/services/sessionRecap.ts`），后者对快速模型发起一个侧查询，禁用工具，`maxOutputTokens: 300`，并采用严格的 `<recap>...</recap>` 输出格式。该侧查询读取会话现有的 GeminiClient 聊天历史，且**不会**向其中添加内容。

请求体被忽略（发送 `{}` 或空）。非严格变更门控——姿态与 `/session/:id/prompt` 类似（该调用消耗 token 但不改变状态）。不发布 SSE 事件。

响应（200）：

```json
{
  "sessionId": "sess:42",
  "recap": "Debugging the auth retry race. Next: add deterministic timing to the integration test."
}
```

`recap` 为 `null`（正常 200，而非错误）的情况：

- 会话尚少于两个对话轮次，
- 侧查询未返回可提取的 `<recap>...</recap>` 负载，
- 或发生任何底层模型错误（core 辅助函数是尽力而为的，从不抛出异常）。

错误：

- `400 {code: 'invalid_client_id'}` — `X-Qwen-Client-Id` 请求头格式错误。
- `404` — 会话未知。

取消：**v1 中没有**。该路由不监听 HTTP 客户端断开连接，没有 `AbortSignal` 被接入桥接器，并且无论调用方是否已断开连接，ACP 子进程都会将侧查询运行完成。唯一的限制是桥接器的 60 秒后备超时（`SESSION_RECAP_TIMEOUT_MS`）和针对 ACP 通道死亡的传输关闭竞争。这是可以接受的，因为 recap 很短（单次尝试，`maxOutputTokens: 300`，通常约 1–5 秒）；如果未来带宽成本证明其合理性，可以基于请求 ID 的取消扩展方法在将来版本中实现完整的端到端取消。

### 变更：批准、工具、初始化、MCP 重启

Issue [#4175](https://github.com/QwenLM/qwen-code/issues/4175) Wave 4 PR 17 新增了四个变更控制路由，允许远程客户端在无需接触守护进程主机的 CLI 的情况下更改运行时状态。这四条路由：

- 均受 PR 15 的**严格**变更门控限制。未配置令牌的守护进程会以 `401 {code: 'token_required'}` 拒绝它们。在决定启用之前，请配置 `--token`（或 `QWEN_SERVER_TOKEN`）。
- 接受并盖章 `X-Qwen-Client-Id` 请求头（PR 7 审计链）。当请求头携带受信任的 id 时，守护进程会在相应的 SSE 事件上发出 `originatorClientId`，以便跨客户端 UI 可以抑制自身变更的回显。
- 在暴露功能之前，对每个标签的能力进行预检。较老的守护进程对路由返回 `404`。

四条路由中的三条（`tools/:name/enable`、`init`、`mcp/:server/restart`）会发出**工作空间范围**的事件：每个活跃的会话 SSE 总线都会接收到该事件，无论触发变更时哪个会话被附着。`approval-mode` 会发出**会话范围**的事件，因为更改仅限于一个会话的 `Config`。

#### `POST /session/:id/approval-mode`

能力标签：`session_approval_mode_control`。Bridge → ACP extMethod `qwen/control/session/approval_mode`。

更改一个活跃会话的批准模式。新模式立即生效于 ACP 子进程的每个会话 `Config` 中。默认情况下**不会**写入磁盘——传递 `persist: true` 以同时将 `tools.approvalMode` 写入工作空间设置。

请求：

```json
{ "mode": "auto-edit", "persist": false }
```

`mode` 必须是 `'plan' | 'default' | 'auto-edit' | 'auto' | 'yolo'` 之一（与 core 的 `ApprovalMode` 枚举对应；SDK 导出了 `DAEMON_APPROVAL_MODES` 用于运行时验证）。`persist` 默认为 `false`。

响应（200）：

```json
{
  "sessionId": "sess:42",
  "mode": "auto-edit",
  "previous": "default",
  "persisted": false
}
```

错误：

- `400 {code: 'invalid_approval_mode', allowed: [...]}` — 未知的模式字面量。
- `400 {code: 'invalid_persist_flag'}` — `persist` 不是布尔值。
- `403 {code: 'trust_gate', errorKind: 'auth_env_error'}` — 请求的模式要求受信任文件夹（在不受信任的工作空间中，特权模式会被 core 的 `Config.setApprovalMode` 拒绝）。
- `404` — 会话未知。

SSE 事件（会话范围）：`approval_mode_changed`，包含 `{sessionId, previous, next, persisted, originatorClientId?}`。

#### `POST /workspace/tools/:name/enable`

能力标签：`workspace_tool_toggle`。纯文件 IO——无 ACP 往返。

在工作空间的 `tools.disabled` 设置列表中切换一个工具名称。列在其中的工具**根本不会被注册**（区别于 `permissions.deny`，后者保持工具注册但拒绝调用）。内置工具和 MCP 发现的工具都流经 `ToolRegistry.registerTool`，后者会检查禁用集。

> ⚠️ **名称必须与注册表暴露的标识符完全匹配。** 不会进行别名解析——路由会将路径参数中的任何字符串原样存储到 `tools.disabled` 中，下一个 ACP 子进程在注册时会将其与 `tool.name` 进行比较。内置工具使用其规范的注册表名称（蛇形命名法动词形式）：`run_shell_command`、`read_file`、`write_file`、`list_directory`、`glob`、`grep_search`、`web_fetch` 等——而不是 CLI 显示的标签（`Shell`、`Read`、`Write`）。MCP 发现的工具使用限定的 `mcp__<server>__<name>` 形式（这也是 `tool_toggled` 事件广播的形式，以及 `GET /workspace/mcp` 列出的形式）。禁用 `Bash` 不会阻止 `run_shell_command` 在下一个会话中注册。

活跃的 ACP 子进程会保留已注册的工具——该切换将在**下一个** ACP 子进程生成时生效。结合 `POST /workspace/mcp/:server/restart`（针对 MCP 来源的工具）或创建新会话，以使更改在当前守护进程中生效。

未知工具名称被接受：预先禁用一个尚未安装的 MCP 工具是一个合理的使用场景。

请求：

```json
{ "enabled": false }
```

响应（200）：

```json
{ "toolName": "run_shell_command", "enabled": false }
```

错误：

- `400 {code: 'invalid_tool_name'}` — 路径参数为空，或路径参数超过 256 字符限制。
- `400 {code: 'invalid_enabled_flag'}` — `enabled` 缺失或不是布尔值。

SSE 事件（工作空间范围）：`tool_toggled`，包含 `{toolName, enabled, originatorClientId?}`。

#### `POST /workspace/init`

能力标签：`workspace_init`。纯文件 IO——无 ACP 往返，**无 LLM 调用**。

在守护进程绑定的工作空间根目录中搭建一个空的 `QWEN.md`（或 `--memory-file-name` 覆盖下 `getCurrentGeminiMdFilename()` 返回的任何文件名）。仅机械操作——对于 AI 驱动的内容填充，请使用 `POST /session/:id/prompt` 进行操作。

默认拒绝在目标文件存在非空白内容时覆盖。仅空白字符的文件被视为不存在（与本地 `/init` 斜杠命令一致）。

请求：

```json
{ "force": false }
```

响应（200）：

```json
{ "path": "/work/bound/QWEN.md", "action": "created" }
```

`action` 对于新创建为 `'created'`，当现有的仅空白文件被保留未动时为 `'noop'`（未执行写入），当 `force: true` 替换了非空内容时为 `'overwrote'`。`workspace_initialized` SSE 事件镜像了响应的 action——观察者可以过滤 `action !== 'noop'` 以仅对实际的磁盘变更作出反应。

错误：

- `400 {code: 'invalid_force_flag'}` — `force` 不是布尔值。
- `409 {code: 'workspace_init_conflict', path, existingSize}` — 文件存在非空白内容且 `force` 被省略或为 false。响应体包含绝对路径和大小（字节），以便 SDK 客户端可以在不重新 stat 的情况下渲染“覆盖 N 字节？”的提示。

SSE 事件（工作空间范围）：`workspace_initialized`，包含 `{path, action, originatorClientId?}`。

#### `POST /workspace/mcp/:server/restart`

能力标签：`workspace_mcp_restart`。Bridge → ACP extMethod `qwen/control/workspace/mcp/restart`。

通过 ACP 子进程的 `McpClientManager.discoverMcpToolsForServer` 重启一个已配置的 MCP 服务器（断开连接 + 重新连接 + 重新发现）。预先检查来自 PR 14 v1 记账的实时预算快照，因此对预算已饱和的工作空间进行重启会返回一个软拒绝，而不会触发 `BudgetExhaustedError` 级联。

请求体为空（`{}`）。路径参数是 URL 编码的服务器名称，与 `mcpServers` 配置中显示的名称相同。

响应（200）——关于 `restarted` 的判别联合：

```json
{ "serverName": "docs", "restarted": true, "durationMs": 1234 }
```

```json
{
  "serverName": "docs",
  "restarted": false,
  "skipped": true,
  "reason": "budget_would_exceed"
}
```

软跳过原因（均返回 200）：

| `reason`                  | 含义                                                                                                                                                                                   |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `'in_flight'`             | 该服务器的另一个发现/重启正在进行中。路由立即返回，而非等待原始 promise。调用方应在短暂延迟后重试。                                                                                       |
| `'disabled'`              | 服务器已配置但被列入 `excludedMcpServers`。在重启前先启用。                                                                                                                             |
| `'budget_would_exceed'`   | 守护进程以 `--mcp-budget-mode=enforce` 运行，目标服务器当前不在 `reservedSlots` 中，且实时总数已达到 `clientBudget`。调用方应首先释放一个槽位。                                    |

错误（非 2xx）：

- `400 {code: 'invalid_server_name'}` — 路径参数为空。
- `404` — 服务器名称不在 `mcpServers` 配置中，或无活跃的 ACP 通道存在（重启本质上需要一个活跃的 `McpClientManager` 实例）。
- `500` — 内部错误（例如 `ToolRegistry` 未初始化）。

SSE 事件（工作空间范围）：成功时 `mcp_server_restarted`，包含 `{serverName, durationMs, originatorClientId?}`；软跳过时 `mcp_server_restart_refused`，包含 `{serverName, reason, originatorClientId?}`。

### `GET /session/:id/events` (SSE)

订阅会话的事件流。

请求头：

```
Accept: text/event-stream
Last-Event-ID: 42        ← 可选，从 id 42 之后重放
```

查询参数：

| 参数         | 必需 | 说明                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| ------------ | ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `maxQueued`  | 否   | 每个订阅者的**实时积压**上限。范围 `[16, 2048]`，默认 256。订阅时强制推送的重放帧不受此限制；实际消耗该上限的是订阅者仍在处理大的 `Last-Event-ID: 0` 重放时到达的实时事件。对于冷重连，增加此值，以使实时尾部不会在消费者追上之前触发慢客户端警告/驱逐。值超出范围/非十进制/存在但空的情况下，会在 SSE 握手打开之前返回 `400 invalid_max_queued`。前提条件 `caps.features.slow_client_warning`——较老的守护进程静默忽略此参数。 |

帧格式。`data:` 行是**完整的事件信封**，以单行 JSON 字符串化形式呈现——`{id?, v, type, data, originatorClientId?}`。ACP 特定负载（`sessionUpdate`、`requestPermission` 参数等）位于信封的 `data` 字段下；信封自身的 `type` 与 SSE `event:` 行匹配。

```
id: 7
event: session_update
data: {"id":7,"v":1,"type":"session_update","data":{"sessionUpdate":"agent_message_chunk","content":{"type":"text","text":"…"}}}

id: 8
event: permission_request
data: {"id":8,"v":1,"type":"permission_request","data":{"requestId":"<uuid>","sessionId":"<sid>","toolCall":{...},"options":[...]}}

: heartbeat              ← 每 15 秒一次，无负载

event: client_evicted    ← 终止帧，无 id（合成）
data: {"v":1,"type":"client_evicted","data":{"reason":"queue_overflow","droppedAfter":42}}
```

SSE 层面的 `id:` / `event:` 行重复了 `envelope.id` / `envelope.type`，以便与 EventSource 兼容。原始 `fetch` 消费者（SDK 的 `parseSseStream`）从 JSON 信封中读取所有内容，并忽略 SSE 前导行。

| 事件类型                      | 触发条件                                                                                                                                                                                                                                                                                                                  |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `session_update`              | 任何 ACP `sessionUpdate` 通知（LLM 块、工具调用、用量）                                                                                                                                                                                                                                                                   |
| `permission_request`          | 代理请求工具批准                                                                                                                                                                                                                                                                                                          |
| `permission_resolved`         | 某个客户端通过 `POST /permission/:requestId` 对权限进行了投票                                                                                                                                                                                                                                                             |
| `permission_partial_vote`     | （仅共识模式）已记录一票但未达到法定人数。携带 `{requestId, sessionId, votesReceived, votesNeeded, quorum, optionTallies}`。前提条件 `caps.features.permission_mediation`。                                                                                                                                             |
| `permission_forbidden`        | 投票被活跃策略拒绝（`designated` 不匹配、`local-only` 非回环、或 `consensus` 投票者不在快照中）。携带 `{requestId, sessionId, clientId?, reason}`。前提条件 `caps.features.permission_mediation`。                                                                                                                         |
| `model_switched`              | `POST /session/:id/model` 成功                                                                                                                                                                                                                                                                                            |
| `model_switch_failed`         | `POST /session/:id/model` 被拒绝                                                                                                                                                                                                                                                                                          |
| `session_died`                | 代理子进程意外崩溃。**终止性：此帧后 SSE 流关闭；该会话从 `byId` 中移除。** 订阅者应通过 `POST /session` 重新连接以生成一个新会话。                                                                                                                      |
| `slow_client_warning`         | 订阅者本地：队列 ≥ 75% 满。**非终止性**——流继续；警告是在驱逐前发出的提醒。携带 `{queueSize, maxQueued, lastEventId}`。每个溢出事件触发一次；在队列降至 37.5% 以下后重新布防。无 `id`（合成）。前提条件 `caps.features.slow_client_warning`。                                                                               |
| `client_evicted`              | 订阅者本地：队列溢出。**终止性：此帧后 SSE 流关闭**（无 `id`——合成）。同一会话上的其他订阅者继续。                                                                                                                                                                                                                      |
| `stream_error`                | 守护进程侧在扇出期间出错。**终止性：此帧后 SSE 流关闭**（无 `id`——合成）。                                                                                                                                                                                                                                                 |
重新连接语义：

- 发送 `Last-Event-ID: <n>` 以从每个会话的环形缓冲区（默认深度 **8000**，可通过 `qwen serve --event-ring-size <n>` 调整）重放 `id > n` 的事件
- **间隙检测（客户端）：** 如果 `<n>` 早于环形缓冲区中仍存在的最旧事件（例如，你使用 `Last-Event-ID: 50` 重新连接，但环形缓冲区现在保存 200–1199），守护进程将从最旧可用事件开始重放而不抛出异常。将第一个重放事件的 `id` 与 `n + 1` 进行比较；任何差值即为丢失窗口的大小。Stage 2 将在守护进程侧注入显式的 `stream_gap` 合成帧；在 Stage 1 中，检测由客户端负责。
- ID 在每个会话内单调递增，从 1 开始
- 合成帧（`client_evicted`、`slow_client_warning`、`stream_error`）故意省略 `id`，以免占用其他订阅者的序列槽位

背压：

- 每个订阅者队列默认有 `maxQueued: 256` 个活动项目（重连期间的重放帧绕过此上限）。可通过 SSE 请求中的 `?maxQueued=N`（范围 `[16, 2048]`）覆盖。
- 当订阅者队列超过 75% 满时，总线强制向该订阅者推送一个 `slow_client_warning` 合成帧（每个溢出周期一次；在队列降至 37.5% 以下后重新启用）。流保持打开状态——该警告是一个提示，以便客户端可以更快地消耗或干净地断开并重新连接。
- 如果队列实际溢出该警告，总线将发出 `client_evicted` 终止帧并关闭订阅。

### `POST /permission/:requestId`

对待定的 `permission_request` 进行投票。活动的 **调解策略** 决定谁获胜：

| 策略                      | 行为                                                                                                                                                                                                     |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `first-responder`（默认） | 任何经过验证的投票者获胜；后续投票者得到 `404`。Pre-F3 基线。                                                                                                                                             |
| `designated`              | 只有提示发起者（`originatorClientId`）决定；非发起者得到 `403 permission_forbidden / designated_mismatch`。对于匿名提示回退到 first-responder。                                                              |
| `consensus`               | N-of-M 投票者必须同意（默认 `N = floor(M/2) + 1`，可通过 `policy.consensusQuorum` 覆盖）。第一个达到 `N` 的选项获胜。未解决的投票会得到 `200` + `permission_partial_vote` SSE 帧。                          |
| `local-only`              | 只有回环投票者决定；远程调用者得到 `403 permission_forbidden / remote_not_allowed`。                                                                                                                      |

活动策略在 `settings.json` 中的 `policy.permissionStrategy` 下配置，并在 `/capabilities` 上的 `body.policy.permission` 暴露。构建支持的集合可通过 `caps.features.permission_mediation`（附带 `modes: [...]`）预检。

> **F3（#4175）：多客户端权限协调。** F3 添加了上述四种策略。Pre-F3 守护进程硬编码了 first-responder；当配置的策略为 `first-responder` 时，线缆格式保持逐位不变。新事件（`permission_partial_vote`、`permission_forbidden`）是新增的——旧 SDK 将其视为 `unrecognized_known_event` 并优雅地忽略。

> **权限超时（默认 5 分钟）。** `permission_request`
> 保持待定状态直到：(a) 某个客户端在此投票，(b) `POST /session/:id/cancel`
> 触发，(c) 驱动提示的 HTTP 客户端断开连接
> （提示中取消会将未完成的权限解析为 `cancelled`），
> (d) 会话被杀死，(e) 守护进程关闭，**或
> (f) 每会话权限超时触发**（`DEFAULT_PERMISSION_TIMEOUT_MS`，
> 5 分钟）。超时触发时，代理的 `requestPermission` 解析为
> `{outcome: 'cancelled'}`，审计环记录一条
> `permission.timeout` 条目，守护进程 stderr 输出一行
> 面包屑，SSE 总线将标准的
> `permission_resolved` 已取消帧分发给所有订阅者以便清理。该
> 超时可通过 `BridgeOptions.permissionResponseTimeoutMs` 配置；
> 运行长格式提示的无头调用者可能希望延长它。

请求：

```json
{
  "outcome": {
    "outcome": "selected",
    "optionId": "proceed_once"
  }
}
```

结果：

- `{ "outcome": "selected", "optionId": "<某个选项>" }` —— 接受 / 拒绝 / 执行一次 / 等，根据代理提供的选择
- `{ "outcome": "cancelled" }` —— 丢弃请求（与 `cancelSession` / `shutdown` 内部行为相同）

响应：

- `200 {}` —— 你的投票被接受（已解决或在共识法定人数下记录）
- `403 { "code": "permission_forbidden", "reason": "designated_mismatch" | "remote_not_allowed", "requestId", "sessionId" }` —— F3：活动策略拒绝了你的投票
- `404 { "error": "..." }` —— requestId 未知（已解决、从未存在或会话已拆除）
- `500 { "code": "cancel_sentinel_collision", ... }` —— F3：代理的 `allowedOptionIds` 包含保留的哨兵 `'__cancelled__'`；代理/守护进程合约违规
- `501 { "code": "permission_policy_not_implemented", "policy": "<name>" }` —— F3 前向兼容：策略字面量出现在模式中但其中介分支尚未构建（目前不可达；为未来策略保留）

成功投票后，每个已连接的客户端都会看到带有相同 `requestId` 和所选 `outcome` 的 `permission_resolved`。在 `consensus` 下，中间投票还会额外分发 `permission_partial_vote`，直到达到法定人数。

### 认证设备流路由（issue #4175 PR 21）

守护进程代理 OAuth 2.0 设备授权授权（RFC 8628），以便远程 SDK 客户端可以触发登录，其令牌存放在 **守护进程** 文件系统上——而不是客户端上。守护进程自行轮询 IdP；客户端的唯一工作是显示验证 URL + 用户代码，并（可选）订阅 SSE 以获取完成事件。

能力标签：`auth_device_flow`（始终通告）。v1 中支持的提供者：
`qwen-oauth`。

> [!note]
>
> Qwen OAuth 免费层已于 2026-04-15 停止。将 `qwen-oauth` 视为
> 本协议中的旧版 v1 提供者标识符；新客户端应优先选择
> 当前支持的认证提供者（如果可用）。

**运行时局部性。** 守护进程从不启动浏览器——即使它可以。客户端决定是否在本地调用 `open(verificationUri)`；在无头 Pod 上（典型的模式 B 部署），用户在他们有浏览器的任何设备上打开 URL。有关推荐的 UX，请参阅 `docs/users/qwen-serve.md`。

**事件中无令牌泄漏。** `auth_device_flow_started` 仅携带 `{deviceFlowId, providerId, expiresAt}`。用户代码和验证 URL 在 POST 201 响应体中点对点返回，并通过 `GET /workspace/auth/device-flow/:id` 获取；它们永远不会通过 SSE 广播。

**每个提供者单例。** 当流程待定时，对同一提供者的第二次 `POST` 是幂等的接管——它返回现有条目，并带有 `attached: true`，而不是发起新的 IdP 请求。

#### `POST /workspace/auth/device-flow`

严格变更网关：即使是在无令牌回环默认值下也需要 bearer 令牌（`401 token_required`）。

请求：

```json
{ "providerId": "qwen-oauth" }
```

响应（`201` 全新开始，`200` 幂等接管）：

```json
{
  "deviceFlowId": "fa07c61b-…",
  "providerId": "qwen-oauth",
  "status": "pending",
  "userCode": "USER-1",
  "verificationUri": "https://chat.qwen.ai/api/v1/oauth2/device",
  "verificationUriComplete": "https://chat.qwen.ai/api/v1/oauth2/device?user_code=USER-1",
  "expiresAt": 1700000600000,
  "intervalMs": 5000,
  "attached": false
}
```

错误：

- `400 unsupported_provider` —— 未知的 `providerId`（响应包含 `supportedProviders`）
- `409 too_many_active_flows` —— 工作区上限（4）已达；使用 `DELETE` 取消一个
- `401 token_required` —— 严格网关拒绝了无令牌请求
- `502 upstream_error` —— IdP 返回了意外错误

#### `GET /workspace/auth/device-flow/:id`

读取当前状态。待定条目返回 `userCode/verificationUri/expiresAt/intervalMs`；终止条目（5 分钟宽限期）删除它们并显示 `status` 及可选的 `errorKind/hint`。

对未知 ID 和宽限期后删除的条目返回 `404 device_flow_not_found`。

#### `DELETE /workspace/auth/device-flow/:id`

幂等取消：

- 待定条目 → `204` + 发出 `auth_device_flow_cancelled`
- 终止条目 → `204` 无操作（不重新发送事件）
- 未知 ID → `404`

#### `GET /workspace/auth/status`

待定流程 + 支持的提供者的快照：

```json
{
  "v": 1,
  "workspaceCwd": "/work/bound",
  "providers": [],
  "pendingDeviceFlows": [
    {
      "deviceFlowId": "fa07c61b-…",
      "providerId": "qwen-oauth",
      "expiresAt": 1700000600000
    }
  ],
  "supportedDeviceFlowProviders": ["qwen-oauth"]
}
```

#### 设备流 SSE 事件

五种类型的事件（工作区范围，分发给每个活动会话总线）：

- `auth_device_flow_started` `{deviceFlowId, providerId, expiresAt}` —— POST 成功；SDK 应订阅（此处无 userCode，如果需要可通过 GET 获取）
- `auth_device_flow_throttled` `{deviceFlowId, intervalMs}` —— 守护进程响应了上游的 `slow_down`；轮询 GET 的客户端应调整其间隔以匹配
- `auth_device_flow_authorized` `{deviceFlowId, providerId, expiresAt?, accountAlias?}` —— 凭据已持久化；`accountAlias` 是非 PII 标签（非邮箱/电话）
- `auth_device_flow_failed` `{deviceFlowId, errorKind, hint?}` —— 终止；`errorKind` 为 `expired_token | access_denied | invalid_grant | upstream_error | persist_failed` 之一。`persist_failed` 是守护进程内部错误：IdP 交换成功但守护进程无法持久存储凭据（EACCES / EROFS / ENOSPC）。用户应在底层磁盘问题修复后重试。
- `auth_device_flow_cancelled` `{deviceFlowId}` —— DELETE 对待定条目成功

> **不兼容 MCP。** MCP 授权规范（2025-06-18）要求 OAuth 2.1 + PKCE 授权码并带有重定向回调，这对无头 Pod 守护进程不可行。模式 B 的设备流界面是守护进程私有的——针对 MCP 兼容服务器的客户端应使用不同的认证路径。

## 流式传输线路格式

事件作为标准 EventSource 帧发出。守护进程每帧写入一行 `data:`（JSON 在 `JSON.stringify` 后没有嵌入换行符）；位于 `packages/sdk-typescript/src/daemon/sse.ts` 的 SDK 解析器在接收端同时处理该形式和规范允许的多行 `data:` 形式。

## 流式传输期间的错误帧

如果桥接器迭代器在为 SSE 订阅者服务时抛出异常，守护进程会发出一个终止性 `stream_error` 帧（无 `id`）。`data:` 行是完整信封（与此文档中其他 SSE 帧形状相同）；实际错误消息位于 `envelope.data.error` 下：

```
event: stream_error
data: {"v":1,"type":"stream_error","data":{"error":"<message>"}}
```

然后连接关闭。

## 环境变量

| 变量                | 目的                                         |
| ------------------- | -------------------------------------------- |
| `QWEN_SERVER_TOKEN` | Bearer 令牌。启动时去除首尾空白。            |

## 源代码布局

| 路径                                                 | 目的                                                                                                      |
| ---------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `packages/cli/src/commands/serve.ts`                 | yargs 命令 + 标志模式                                                                                      |
| `packages/cli/src/serve/run-qwen-serve.ts`           | 监听器生命周期 + 信号处理                                                                                 |
| `packages/cli/src/serve/server.ts`                   | Express 路由 + 中间件                                                                                     |
| `packages/cli/src/serve/auth.ts`                     | bearer + 主机允许列表 + CORS 拒绝                                                                          |
| `packages/cli/src/serve/httpAcpBridge.ts`            | 生成或附加 + 每会话 FIFO + 权限注册表                                                                     |
| `packages/cli/src/serve/status.ts`                   | 只读守护进程状态线路类型 + `ServeErrorKind` + `BridgeTimeoutError` + `mapDomainErrorToErrorKind`          |
| `packages/cli/src/serve/env-snapshot.ts`             | 纯辅助函数，从 `process.*` 状态构建 `/workspace/env` 有效载荷，包括凭据编辑                                 |
| `packages/acp-bridge/src/eventBus.ts`                | 有界异步队列 + 重放环形缓冲区                                                                             |
| `packages/sdk-typescript/src/daemon/DaemonClient.ts` | TypeScript 客户端                                                                                         |
| `packages/sdk-typescript/src/daemon/sse.ts`          | EventSource 帧解析器                                                                                      |
| `integration-tests/cli/qwen-serve-routes.test.ts`    | 18 个测试用例，无 LLM                                                                                     |
| `integration-tests/cli/qwen-serve-streaming.test.ts` | 3 个测试用例，由本地假 OpenAI 服务器支持的真实的 `qwen --acp` 子进程（仅 POSIX；Windows 上跳过）         |