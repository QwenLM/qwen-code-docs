# `qwen serve` HTTP 协议参考

[qwen-code 守护进程设计](https://github.com/QwenLM/qwen-code/issues/3803)的第一阶段。所有路由均位于守护进程的 base URL 下（默认为 `http://127.0.0.1:4170`）。

## 身份验证

当使用 `--token` 或 `QWEN_SERVER_TOKEN` 启动守护进程时，**除环回绑定（loopback binds）上的 `/health` 外的所有路由**都必须携带：

```
Authorization: Bearer <token>
```

如果未配置 token（环回开发的默认情况），则该 header 是可选的。Token 比较采用恒定时间算法。对于 `missing header` / `wrong scheme` / `wrong token`，返回的 401 响应格式是统一的。

**`/health` 豁免**（Bctum）：在环回绑定（`127.0.0.1` / `localhost` / `::1` / `[::1]`）上，`/health` 注册在 bearer 中间件**之前**，因此即使守护进程使用 `--token` 启动，pod 内部的存活探针也无需携带 token。非环回绑定（如 `--hostname 0.0.0.0`）会像其他所有路由一样将 `/health` 置于 bearer 验证之后——有关基本原理，请参阅 [`GET /health`](#get-health) 部分。

**`--require-auth`（#4175 PR 15）。** 在启动时传递此标志，可将“必须具有 token”的规则扩展到环回绑定。如果没有 token，启动将失败；`/health` 豁免将被取消（因此 `/health` 也需要 `Authorization: Bearer …`）。

启用该标志后，全局 `bearerAuth` 中间件将拦截**所有**路由——包括 `/capabilities`。因此，**未经身份验证**的客户端无法通过预检 `caps.features` 来发现需要身份验证：在这种情况下，发现途径是 **401 响应体**本身（根据 [身份验证](#身份验证) 部分，所有路由的响应格式统一）。`require_auth` 能力标签是一种**身份验证后的确认**——一旦客户端成功通过身份验证并读取 `/capabilities`，该标签的存在即确认守护进程是使用 `--require-auth` 启动的（这对于审计/合规 UI 以及 SDK 客户端在设置面板中显示“此部署已加固”非常有用）。选择加入每路由严格模式的变更路由（Wave 4 后续更新）在无 token 的环回默认情况下被访问时，会拒绝并返回 `401 { code: "token_required", error: "…" }`——但在启用 `--require-auth` 的情况下，全局 bearer 中间件会在每路由拦截之前直接拦截请求，因此未经身份验证的调用者实际看到的是旧版的 `Unauthorized` 响应体。

**`--allow-origin <pattern>`（T2.4 [#4514](https://github.com/QwenLM/qwen-code/issues/4514)）。** 默认情况下，跨域访问守护进程的浏览器 webui 会被阻止——任何携带 `Origin` header 的请求都会返回 `403 {"error":"Request denied by CORS policy"}`，因为 CLI/SDK 客户端从不发送 `Origin`，守护进程将其存在视为请求来自操作员未加入的浏览器上下文的标志。在启动时传递 `--allow-origin <pattern>`（可重复）以安装允许列表而不是拦截墙。每个 pattern 可以是：

- 字面量 `*`——允许任何 origin。**风险**：当配置了 `*` 但未设置 bearer token 时，启动将被拒绝（任何来源均可：`--token`、`QWEN_SERVER_TOKEN` 或要求在启动时提供 token 的 `--require-auth`）。当列表中包含 `*` 时，启动引导信息会在 stderr 中发出警告。**建议**：在环回绑定上与 `--require-auth` 结合使用，这样 `/health` 和 `/demo` 也会受 bearer 拦截——默认情况下，它们在环回绑定上注册在 bearer 中间件之前（因此 k8s/Compose 探针无需 token 即可访问 `/health`），而 `*` 允许列表使它们可从任何跨域浏览器访问。在非环回绑定上，bearer 在启动时已经是强制的，因此 `*` 的暴露面仅为 `/health`（状态 JSON）和 `/demo`（一个静态页面，其 JS 仍会调用受 token 拦截的路由）——实际的 API 暴露面无论如何都会被拦截。
- 规范的 URL origin——`<scheme>://<host>[:<port>]`。**无尾部斜杠、无路径、无用户信息、无查询参数。** 如果条目未通过往返测试 `new URL(pattern).origin === pattern`，启动将拒绝并抛出 `InvalidAllowOriginPatternError`；错误信息会指出错误的 pattern 和规范形式。严格设计意图：静默规范化（例如去除尾部 `/`）会让拼写错误溜走并接受模糊输入。

匹配的 origin 在每个请求中都会收到标准的 CORS 响应 header：

```
Access-Control-Allow-Origin: <echoed origin>
Vary: Origin
Access-Control-Allow-Methods: GET, POST, PATCH, DELETE, OPTIONS
Access-Control-Allow-Headers: Authorization, Content-Type, X-Qwen-Client-Id, Last-Event-ID
Access-Control-Max-Age: 86400
Access-Control-Expose-Headers: Retry-After
```

`Access-Control-Allow-Origin` 会逐字回显请求的 origin（浏览器发送时的大小写），而不是字面量 `*`，即使在 `*` 模式下也是如此——浏览器缓存根据它与 `Vary: Origin` 的配对来缓存响应，回显方式为在后续版本中添加 `Access-Control-Allow-Credentials` 留下了空间，而无需更改 schema。`Access-Control-Expose-Headers: Retry-After` 允许浏览器 webui 遵循守护进程在 `429` / `503` 响应中的重试提示。今天**不**发送 `Access-Control-Allow-Credentials`：守护进程通过 `Authorization` 中的 bearer 进行身份验证，这在跨域时无需 `credentials: 'include'` 即可工作。

OPTIONS 预检请求（带有 `Access-Control-Request-Method` 或 `Access-Control-Request-Headers` 的 OPTIONS）会短路并返回 `204 No Content` 以及上述 header。这是传统的 CORS 模式，是安全的——预检仅确认守护进程将接受哪些 method/header；实际的后续请求仍会运行完整的链路（host 允许列表 → bearer 身份验证 → 路由），因此反 DNS 重绑定和 bearer 强制执行仍会在读取或变更任何状态之前触发。来自匹配 origin 的普通 OPTIONS 请求会继续流向下游，并附加 CORS header。

不匹配允许列表的 origin 仍会收到 `403 {"error":"Request denied by CORS policy"}`——与默认拦截墙的响应格式相同，因此已解析拦截墙响应的客户端无需对部署了允许列表的守护进程进行特殊处理。拒绝路径**不会**发出任何 `Access-Control-*` header（浏览器会忽略它们，并且发出它们会通过 header 的存在间接暴露允许列表的大小）。

配置的 pattern 列表故意**不**在 `/capabilities` 中回显——浏览器 webui 已经知道自己的 origin（毕竟它调用了守护进程），并且暴露该列表会让 `/capabilities` 的未经身份验证的读取者枚举每个受信任的 origin（这对于配置错误的部署是有用的侦察信息）。SDK 客户端通过 `caps.features.allow_origin` 标签来拦截“此守护进程允许跨域浏览器访问”，而无需知道具体是哪些 origin。

环回自 origin 请求（例如 `/demo` 页面在相同的 `127.0.0.1:port` 调用守护进程）由一个**单独的** Origin 剥离 shim 处理，该 shim 在 CORS 中间件**之前**运行，并移除 `127.0.0.1:port` / `localhost:port` / `[::1]:port` / `host.docker.internal:port` 的 `Origin` header。因此，无论 `--allow-origin` 配置如何，它们都会通过——操作员无需列出守护进程自己的端口即可使 demo 页面正常工作。

## 常见错误格式

5xx 响应在存在时会携带原始错误的 `code` 和 `data`（JSON-RPC 风格——ACP SDK 从 agent 转发 `{code, message, data}`）：

```json
{
  "error": "Internal error",
  "code": -32000,
  "data": { "reason": "model quota exceeded" }
}
```

请求体中的 JSON 格式错误会返回：

```json
{ "error": "Invalid JSON in request body" }
```

状态码为 `400`。

未知 session id 的 `SessionNotFoundError` 会返回：

```json
{ "error": "No session with id \"<sid>\"", "sessionId": "<sid>" }
```

状态码为 `404`。

对于 `POST /session`，如果其 `cwd` 无法规范化为守护进程绑定的 workspace（#3803 §02 — 1 个守护进程 = 1 个 workspace），`WorkspaceMismatchError` 会返回 `400` 及以下内容：

```json
{
  "error": "Workspace mismatch: daemon is bound to \"…\" but request asked for \"…\". …",
  "code": "workspace_mismatch",
  "boundWorkspace": "/path/the/daemon/binds",
  "requestedWorkspace": "/path/in/the/request"
}
```

使用此信息在预检时检测不匹配：从 `/capabilities` 读取 `workspaceCwd` 并在 `POST /session` 中省略 `cwd`（它将回退到绑定的 workspace），或者将请求路由到绑定到 `requestedWorkspace` 的守护进程。

超过守护进程 `--max-sessions` 上限的 `POST /session` 会返回 `503`，并带有 `Retry-After: 5` header 及以下内容：

```json
{
  "error": "Session limit reached (20)",
  "code": "session_limit_exceeded",
  "limit": 20
}
```

附加到现有会话**不**计入上限，因此即使达到容量上限，空闲守护进程的重连也能继续工作。

`RestoreInProgressError`——仅由 `POST /session/:id/load` 和 `POST /session/:id/resume` 发出——返回 `409`，并带有 `Retry-After: 5` header（与 `session_limit_exceeded` 匹配）及以下内容：

```json
{
  "error": "Session \"<sid>\" is already being restored via session/<resume|load>; retry session/<load|resume> after it completes",
  "code": "restore_in_progress",
  "sessionId": "<sid>",
  "activeAction": "load",
  "requestedAction": "resume"
}
```

当对已经有一个 `session/resume` 正在进行的 id 发出 `session/load` 时触发（反之亦然）。请至少等待 `Retry-After` 秒后重试——底层恢复会在 `initTimeoutMs`（默认 10 秒）内完成。相同操作的竞争（`load` 对 `load`，`resume` 对 `resume`）会合并而不是报错。

## 能力

守护进程从 serve 能力注册表中公布其支持的功能标签。客户端**必须**根据 `features` 而不是 `mode` 来控制 UI（根据设计 §10）。

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

> 条件标签仅在其匹配的部署开关开启时出现（见下表）。F3 的 `permission_mediation` 标签始终开启，并携带 `modes: ['first-responder', 'designated', 'consensus', 'local-only']`，以便 SDK 客户端可以内省构建支持的集合；运行时激活的策略位于 `body.policy.permission`。

`session_scope_override` 是 `POST /session` 上每请求 `sessionScope` 字段的协商句柄（见下文）。旧版守护进程会静默忽略该字段，因此 SDK 客户端在发送该字段之前应预检 `caps.features` 中是否包含此标签。

`session_load` 和 `session_resume` 公布显式恢复路由（`POST /session/:id/load` 和 `POST /session/:id/resume`）。旧版守护进程对这些路径返回 `404`，因此 SDK 客户端在调用之前应预检 `caps.features`。`unstable_session_resume` 仍作为已弃用的别名公布，以兼容在底层 ACP 方法名为 `connection.unstable_resumeSession` 时发布的 SDK；新客户端应拦截 `session_resume`。

`slow_client_warning` 涵盖了 #4175 Wave 2.5 PR 10 中共同发布的两个 SSE 背压控制：(a) 当订阅者的队列超过 75% 满时，守护进程会发出一个 `slow_client_warning` 合成事件流帧，每个溢出事件一次（在队列排空到 37.5% 以下后重新启用）；(b) `GET /session/:id/events` 接受 `?maxQueued=N` 查询参数（范围 `[16, 2048]`），以针对大型重放环的冷重连预分配每个订阅者的积压大小。全局环大小由 `--event-ring-size` 控制（默认 **8000**，根据 #3803 §02）。旧版守护进程静默缺少这两者——在启用之前预检此标签。

`typed_event_schema` 公布与 SDK 的 `KnownDaemonEvent` schema 匹配的守护进程事件 payload。旧版守护进程可能仍会流式传输兼容的帧，但 SDK 客户端在假设具有类型化事件覆盖之前应预检此标签。

`client_heartbeat` 公布 `POST /session/:id/heartbeat`。旧版守护进程返回 `404`；在发出定期心跳之前预检此标签。

`session_close` 和 `session_metadata` 公布 `DELETE /session/:id` 和 `PATCH /session/:id/metadata`。旧版守护进程返回 `404`；在暴露关闭或重命名功能之前预检这些标签。

`session_lsp` 公布 `GET /session/:id/lsp`，这是守护进程客户端的只读结构化 LSP 状态快照。旧版守护进程返回 `404`；在暴露远程 LSP 状态之前预检此标签。

`session_status` 公布 `GET /session/:id/status`，这是按 id 查询单个会话的实时桥接摘要（`clientCount` / `hasActivePrompt` 及核心字段）。旧版守护进程返回 `404`；在轮询单个会话状态而不是扫描完整会话列表之前预检此标签。

`session_approval_mode_control`、`workspace_tool_toggle`、`workspace_init` 和 `workspace_mcp_restart`（issue [#4175](https://github.com/QwenLM/qwen-code/issues/4175) PR 17）公布下文“变更：审批、工具、初始化、MCP 重启”中记录的四个变更控制路由。这四个路由都受 PR 15 变更网关的严格拦截（未配置 bearer token 的守护进程会以 401 `token_required` 拒绝它们）。旧版守护进程返回 `404`；在暴露相应功能之前预检每个标签。

`mcp_guardrails`（issue [#4175](https://github.com/QwenLM/qwen-code/issues/4175) PR 14）涵盖 MCP 预算机制：`GET /workspace/mcp` 上的 `clientCount` / `clientBudget` / `budgetMode` / `budgets[]` 字段、每个服务器单元格上的 `disabledReason` 字段，以及 `--mcp-client-budget` / `--mcp-budget-mode` CLI 标志。旧版守护进程完全省略新字段；SDK 客户端在依赖 `budgets[]` 语义之前预检此标签。注册表描述符还携带 `modes: ['warn', 'enforce']` 以供未来功能模式暴露使用——目前，客户端从快照的 `budgetMode` 字段推断模式。在 `enforce` 模式下，服务器拒绝由 `Object.entries(mcpServers)` 声明顺序决定；未来的作用域优先级层（如果 qwen-code 采用）将将其转变为“最低优先级优先”，以镜像 claude-code 的 `plugin < user < project < local` 约定。

> ⚠️ **PR 14 v1 作用域：每会话，而非每 workspace。** 守护进程内的每个 ACP 会话都会构建自己的 `Config` + `McpClientManager`（通过 `acpAgent.newSessionConfig`）。预算上限限制**每个会话**的活跃 MCP 客户端；每个会话独立地从转发的 env 中读取 `QWEN_SERVE_MCP_CLIENT_BUDGET`。使用 `--mcp-client-budget=10` 和 5 个并发 ACP 会话，守护进程的实际活跃 MCP 客户端数量最多可达 5 × 10 = 50。`GET /workspace/mcp` 快照仅读取**引导会话**的 `McpClientManager` 统计信息——`budgets[0].scope: 'session'` 值是表明这是每会话而非聚合的明确信号。**Wave 5 PR 23（共享 MCP 池）** 将引入 workspace 作用域的管理器，并在每会话单元格旁边添加一个 `scope: 'workspace'` 单元格，以实现真正的跨会话聚合。v1 是 PR 23 构建的进程内计数器 + 软执行基础。

`workspace_file_read` 涵盖文本/列表/状态/glob workspace 文件路由（`GET /file`、`GET /list`、`GET /glob`、`GET /stat`）。`workspace_file_bytes` 涵盖 `GET /file/bytes`，这是后来添加的，以便客户端可以针对 PR19 时代的守护进程预检原始字节窗口支持。`workspace_file_write` 涵盖感知哈希的文本变更路由（`POST /file/write`、`POST /file/edit`）。写入标签意味着路由契约存在；这并不意味着当前部署对匿名变更开放。写入/编辑是严格的变更路由，即使在环回上也需要配置 bearer token。

`daemon_status` 公布 `GET /daemon/status`，这是下文记录的整合的只读操作员诊断快照。

**条件标签。** 少数功能标签仅在匹配的部署开关开启时公布。标签存在 = 行为开启；标签缺失 = 要么是早于该标签的旧版守护进程，要么是当前守护进程中操作员未选择加入。目前：

| Tag                        | Advertised when …                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `require_auth`             | 守护进程使用 `--require-auth`（或通过嵌入式 API 的 `requireAuth: true`）启动。每个路由都必须使用 Bearer token，包括环回绑定上的 `/health`。                                                                                                                                                                                                                                                                                                                                                                    |
| `mcp_workspace_pool`       | 共享 MCP 传输池处于活动状态。当 `QWEN_SERVE_NO_MCP_POOL=1` 禁用池时省略。                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `mcp_pool_restart`         | 共享 MCP 传输池处于活动状态；重启响应可能包含池感知的多条目结构。                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `allow_origin`             | T2.4（[#4514](https://github.com/QwenLM/qwen-code/issues/4514)）。守护进程使用至少一个 `--allow-origin <pattern>`（或通过嵌入式 API 的 `allowOrigins: [...]`）启动。来自匹配 origin 的跨域请求会收到正确的 CORS 响应 header；不匹配的 origin 仍会收到默认的 403。配置的 pattern 列表故意**不**在 `/capabilities` 中回显，以避免将受信任的 origin 集合泄露给未经身份验证的读取者——浏览器 webui 已经知道自己的 origin。 |
| `prompt_absolute_deadline` | `--prompt-deadline-ms` / `QWEN_SERVE_PROMPT_DEADLINE_MS` / `ServeOptions.promptDeadlineMs` 设置为正整数。                                                                                                                                                                                                                                                                                                                                                                                                        |
| `writer_idle_timeout`      | `--writer-idle-timeout-ms` / `QWEN_SERVE_WRITER_IDLE_TIMEOUT_MS` / `ServeOptions.writerIdleTimeoutMs` 设置为正整数。                                                                                                                                                                                                                                                                                                                                                                                             |
| `workspace_settings`       | 创建守护进程时具有设置持久化功能。                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `session_shell_command`    | 明确启用了会话 shell 执行。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `rate_limit`               | 启用了 `--rate-limit` / `QWEN_SERVE_RATE_LIMIT=1` / `ServeOptions.rateLimit`。                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `workspace_reload`         | 嵌入式路由配置中提供了 workspace 重载支持。                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
`mcp_guardrails` **不**在此条件表中——它是一个始终开启的标签，只要二进制文件支持新的 `/workspace/mcp` 预算字段就会进行通告，无论操作员是否配置了预算。未设置 `--mcp-client-budget` 的操作员仍会获取新字段（此时 `budgetMode: 'off'`，`budgets: []`）。

`mcp_guardrail_events`（issue [#4175](https://github.com/QwenLM/qwen-code/issues/4175) PR 14b）通告了类型化的 SSE 推送事件，这些事件可以在无需轮询循环的情况下暴露 MCP 预算状态跨越。`GET /session/:id/events` 会接收两种帧类型：

- `mcp_budget_warning` — 在 `reservedSlots.size / clientBudget` 向上跨越 75% 时触发一次。仅当比例降至 37.5%（`MCP_BUDGET_REARM_FRACTION`）以下时才会重新触发。它镜像了 PR 10 中 `slow_client_warning` 的迟滞逻辑，但作用于管理器级别而非每个订阅者的积压级别。Payload：`{ liveCount, reservedCount, budget, thresholdRatio: 0.75, mode: 'warn' | 'enforce' }`。在 `warn` 和 `enforce` 模式下均会触发；在 `off` 模式下永不触发。
- `mcp_child_refused_batch` — 在每次 `discoverAllMcpTools*` 遍历结束时，如果有一个或多个服务器被拒绝则触发；同时在 `readResource` 延迟生成拒绝路径上作为长度为 1 的批次触发。Payload：`{ refusedServers: [{ name, transport, reason: 'budget_exhausted' }, ...], budget, liveCount, reservedCount, mode: 'enforce' }`。`mode` 是字面量 `'enforce'`，因为 `warn` 模式永远不会拒绝。

这两个事件都存在于每个会话的 SSE 重放环中（它们携带 `id`），因此使用 `Last-Event-ID` 重新连接的客户端可以通过它们恢复状态；`GET /workspace/mcp` 处的快照仍然是长时间断开连接后状态的唯一真实来源。一旦通告即为始终开启——没有条件切换开关。SDK reducer 状态（`DaemonSessionViewState`）暴露了 `mcpBudgetWarningCount`、`lastMcpBudgetWarning`、`mcpChildRefusedBatchCount`、`lastMcpChildRefusedBatch`，供需要简单延迟风格 UI 的适配器使用。

## 路由

### `GET /health`

存活探针。默认形式在监听器启动时返回 `200 {"status":"ok"}`——开销小，无需访问 bridge，适用于高频的 k8s/Compose 存活探针。

传递 `?deep=1`（也接受 `?deep=true` 或单独的 `?deep`）以使用暴露 bridge **计数器**的探针（仅供参考，并非真正的存活检查）：

```json
{ "status": "ok", "sessions": 3, "pendingPermissions": 1 }
```

> ⚠️ 深度探针**仅供参考**，并非真正的存活验证。它读取计数器访问器（`bridge.sessionCount`、`bridge.pendingPermissionCount`），这些只是简单的 Map-size getter；它们不会 ping 各个子进程/通道，因此无法检测到卡住但仍被计数的会话。请将其用于容量仪表盘（当前并发数与 `--max-sessions` 的对比、队列深度），而不是作为“将此 daemon 移出轮转”的触发器。如果自定义 bridge 实现的 getter 抛出异常，理论上可能会返回 `503 {"status":"degraded"}`，但真实 bridge 的 getter 永远不会这样做——在正常操作下，深度探针始终返回 200。对于真正的存活检查，请依赖监听器是否接受 TCP 连接（即不带 `?deep` 的默认 `/health`）。

**Auth：** **仅在非环回绑定时需要**。在环回地址（`127.0.0.1`、`::1`、`[::1]`）上，`/health` 在 bearer 中间件之前注册，因此 pod 内的 k8s/Compose 探针无需携带 token。在非环回地址（`--hostname 0.0.0.0` 等）上，该路由在 bearer 中间件之后注册，如果没有有效 token 则返回 401——否则未经身份验证的调用者可以探测任意地址以确认 `qwen serve` 是否存在，这是一种低严重程度的信息泄露，与端口扫描结合时风险较高。CORS 拒绝 + Host 允许列表在环回豁免中仍然适用。

### `GET /daemon/status`

只读操作员诊断。与 `/health` 不同，这是一个普通的 daemon API：
它在 bearer 身份验证和速率限制之后注册，包括在环回
绑定上。查询参数：

- `detail=summary`（默认）仅读取内存中的 daemon 状态。
- `detail=full` 还包括实时会话诊断、ACP 连接
  诊断、auth device-flow 计数以及 workspace 状态部分。
- 任何其他 `detail` 都会返回 `400 { "code": "invalid_detail" }`。

`summary` 故意不查询 workspace 状态方法、不启动 ACP
子进程或生成会话。`full` 独立查询每个 workspace 部分；
超时或异常仅将该部分标记为 `unavailable` 并添加一个
`workspace_status_unavailable` 问题。

响应结构：

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

如果任何问题具有 error 严重性，则 `status` 为 `error`；如果任何问题具有
warning 严重性，则为 `warning`；否则为 `ok`。Issue 代码是稳定的，包括
`session_capacity_high`、`connection_capacity_high`、`pending_permissions`、
`acp_channel_down`、`preflight_error`、`mcp_budget_warning`、
`mcp_budget_exhausted`、`rate_limit_hits` 和
`workspace_status_unavailable`。在监听器就绪但完整运行时挂载之前的短暂窗口期内，`/daemon/status` 可能会报告
`daemon_runtime_starting`；如果异步运行时挂载失败，它会报告
`daemon_runtime_failed`，同时非状态运行时路由返回 `503`。

安全性：响应中绝不包含 bearer token、client id、完整的 ACP
连接 id、device-flow user code 或验证 URL。`summary` 省略了
daemon 日志路径；`full` 可能会为经过身份验证的操作员包含该路径。

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

稳定契约：当 `v` 递增时，表示帧布局发生了向后不兼容的更改。

> **`protocolVersions`** 描述 daemon 可以使用的 serve 协议版本。`current` 是 daemon 的首选协议版本，`supported` 是兼容集合。需要特定协议的客户端应检查 `supported`；特定功能的 UI 仍应以 `features` 为门控。v=1 的附加项：较旧的 v=1 daemon 会省略此字段，因此针对旧构建的 SDK 客户端应将其视为可选。

> **在 Stage 1 中，`modelServices` 始终为 `[]`。** 代理使用其单个默认模型服务，并且不会通过网络枚举它。Stage 2 将从注册的模型适配器中填充此内容，以便 SDK 客户端可以构建服务选择器；在此之前，请勿依赖此字段为非空。

> **`workspaceCwd`** 是此 daemon 绑定的规范绝对路径（#3803 §02 — 1 个 daemon = 1 个 workspace）。使用它来 (a) 在发布 `/session` 之前检测不匹配，以及 (b) 在 `POST /session` 上省略 `cwd`（该路由会回退到此路径）。多 workspace 部署会在不同端口上公开多个 daemon，每个 daemon 都有自己的 `workspaceCwd`。v=1 的附加项：§02 之前的 v=1 daemon 会省略该字段——针对旧构建的客户端在使用前应进行 null 检查。

### 只读运行时状态路由

这些路由报告 daemon 端的运行时快照。它们是 v1 的附加路由，
不会改变状态，也不会更改 serve 协议版本。Workspace
状态路由故意**不会**仅仅因为客户端轮询 GET 路由就启动 ACP 子进程：如果 daemon 处于空闲状态，它们会返回
`initialized: false` 并带有空快照。会话状态路由需要实时会话，并对未知 id 使用标准的 `404 SessionNotFoundError` 结构。

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

通用状态单元：

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

`errorKind` 是一个封闭枚举，由 `/workspace/preflight`、
`/workspace/env` 以及（最终）MCP guardrails 共享，以便 SDK 客户端可以按类别呈现修复建议，而不是解析自由格式的消息。PR 13
（#4175）引入了上面列出的七个字面量；一旦 egress 探针落地，PR 14 将填充
`blocked_egress`。

状态 payload 绝不暴露 MCP env 值、标头、OAuth/服务帐户
详细信息、提供商 API 密钥、提供商 `baseUrl` / `envKey`、skill 主体、skill
文件系统路径、hook 定义或秘密环境变量的值。`/workspace/env` 仅报告白名单 env 变量的**存在性**；代理 URL 在传输前会被剥离凭据并简化为
`host:port`。

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
      "description": "Documentation server",
      "extensionName": "docs-ext"
    }
  ]
}
```

`discoveryState` 是 `not_started`、`in_progress` 或 `completed` 之一。
`transport` 是 `stdio`、`sse`、`http`、`websocket`、`sdk` 或
`unknown` 之一。发现成功时会省略 `errors`。

**MCP 客户端 guardrails（issue [#4175](https://github.com/QwenLM/qwen-code/issues/4175) PR 14）。** PR-14 之后的 daemon 使用四个附加字段和一个 workspace 级别的单元扩展了 payload：

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
      "hint": "Raise --mcp-client-budget or remove servers from mcpServers config.",
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

`budgetMode` 是 `enforce`、`warn` 或 `off` 之一。未设置预算时不存在 `clientBudget`。在 PR-14 之后的 daemon 上，`budgets[]` **始终是一个数组**（当 `budgetMode === 'off'` 时可能为空）；PR-14 之前的 daemon 会完全省略该字段。v1 发出一个带有 `scope: 'session'` 的单元（每个会话强制执行——原因见上文的能力部分）。消费者**必须**容忍具有无法识别的 `scope` 值的额外 `budgets[]` 条目——Wave 5 PR 23 将在每个会话单元旁边添加 `scope: 'workspace'`（或 `'pool'`），而无需进行 schema 升级。

每个服务器单元上的 `disabledReason` 区分了操作员禁用（`'config'` — `disabledMcpServers` 配置列表）和预算拒绝（`'budget'` — 已发现但由于 `enforce` 模式从未连接）。拒绝顺序由 `Object.entries(mcpServers)` 的声明顺序决定，具有确定性。每个服务器的 `status: 'error', errorKind: 'budget_exhausted'` 掩盖了原始的 `mcpStatus: 'disconnected'`（这是事实，但不是面向操作员的严重性）。

PR 14 v1 中的预算强制执行是**每个会话的，而不是每个 workspace 的**。尽管在进程级别上，Mode B daemon 在 #4113 之后是 `1 个 daemon = 1 个 workspace × N 个会话`，但 `McpClientManager` 是通过 `acpAgent.newSessionConfig` 在每个 ACP 会话的 `Config` 内部构建的，因此 N 个会话各自强制执行其自己的上限副本。快照表示引导会话的视图。Wave 5 PR 23 引入了 workspace 范围的共享 MCP 池，将其升级为真正的每个 workspace 强制执行。

**检测预算压力。** 两个表面，均在 PR-14b 之后填充：

- **推送事件**（通过 `mcp_guardrail_events` 通告）：订阅 `GET /session/:id/events` 并通过 `KnownDaemonEvent` 缩小 `mcp_budget_warning` / `mcp_child_refused_batch` 帧的范围。状态机在每次向上跨越 75% 时触发一次（在 37.5% 以下重新触发）；在 `enforce` 模式下，每次发现遍历会合并一次拒绝。
- **快照轮询**（通过 `mcp_guardrails` 通告）：`GET /workspace/mcp` 并检查每个会话的预算单元（`budgets[0]`）：

- `budgets[0].status === 'warning'` ⇔ `liveCount >= 0.75 * clientBudget`（匹配 PR 14b 推送事件将使用的迟滞阈值）。
- `budgets[0].status === 'error'` ⇔ `refusedCount > 0`（一个或多个服务器在此次发现遍历中被拒绝）。
- `budgets[0].status === 'ok'` ⇔ 低于 75% 阈值且没有拒绝。

建议的轮询节奏：与已经轮询 `/workspace/mcp` 的任何内容保持一致；快照开销很小，且预算单元不会产生额外的发现成本。订阅推送事件的 SDK 客户端仍然可以从快照中获益，以获取长时间断开连接后的状态（SSE 重放环深度是有限的——`--event-ring-size`，默认 8000——因此离线时间长于环覆盖范围的客户端会回退到快照重新同步）。

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
      "description": "Review code",
      "level": "project",
      "modelInvocable": true,
      "argumentHint": "[path]"
    }
  ]
}
```

`level` 是 `project`、`user`、`extension` 或 `bundled` 之一。
发现成功时会省略 `errors`。

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

模型按 auth 类型分组。提供商连接诊断位于
`/workspace/preflight` 的 `providers` 单元上；环境预检位于
`/workspace/preflight` 和 `/workspace/env`（下文）上。快照构建成功时会省略
`errors`。

### `GET /workspace/env`

报告 daemon 进程的运行时、平台、沙箱、代理以及白名单秘密环境变量的**存在性**。始终从 `process.*` 状态回答——daemon 永远不会生成 ACP 子进程来服务此路由，并且无论 ACP 是启动还是空闲，响应都相同。
`acpChannelLive` 字段仅供参考。

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

单元结构：

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

**脱敏策略。** `kind: 'env_var'` 单元绝不包含 `value`
字段；客户端只能看到 `present: boolean`。`kind: 'proxy'` 单元将原始 env 值通过凭据脱敏（`redactProxyCredentials`）运行，然后通过 `URL` 解析，因此传输中仅携带 `host:port`。`NO_PROXY`
会逐字通过脱敏传递，因为它是主机列表而不是 URL。当前枚举的秘密 env 变量白名单包括
`OPENAI_API_KEY`、`ANTHROPIC_API_KEY`、`GEMINI_API_KEY`、`GOOGLE_API_KEY`、
`DASHSCOPE_API_KEY`、`OPENROUTER_API_KEY` 和 `QWEN_SERVER_TOKEN`。其他
env 变量不会被枚举，因此意外设置的秘密将保持不可见。

### `GET /workspace/preflight`

报告 daemon 就绪检查。**Daemon 级别单元**（`node_version`、
`cli_entry`、`workspace_dir`、`ripgrep`、`git`、`npm`）始终
从 `process.*` 和 `node:fs` 填充。**ACP 级别单元**（`auth`、
`mcp_discovery`、`skills`、`providers`、`tool_registry`、`egress`）
需要实时 ACP 子进程——当 daemon 空闲时它们会发出
`status: 'not_started'` 占位符。该路由绝不会仅仅为了填充单元而生成 ACP；相应的单元会回退到 `not_started`。

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
      "hint": "spawn a session to populate"
    },
    {
      "kind": "mcp_discovery",
      "status": "not_started",
      "locality": "acp",
      "hint": "spawn a session to populate"
    },
    {
      "kind": "skills",
      "status": "not_started",
      "locality": "acp",
      "hint": "spawn a session to populate"
    },
    {
      "kind": "providers",
      "status": "not_started",
      "locality": "acp",
      "hint": "spawn a session to populate"
    },
    {
      "kind": "tool_registry",
      "status": "not_started",
      "locality": "acp",
      "hint": "spawn a session to populate"
    },
    {
      "kind": "egress",
      "status": "not_started",
      "locality": "acp",
      "hint": "egress probing lands in PR 14 (#4175)"
    }
  ]
}
```
Cell shape:

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

- `missing_binary` — Node 版本低于要求，缺少 `QWEN_CLI_ENTRY`，ripgrep / git / npm 不在 PATH 中（对于可选二进制文件，这些是警告而非错误）。
- `missing_file` — `boundWorkspace` 不存在或不是目录；skill 解析错误指向缺失或不可读的文件。
- `parse_error` — `SKILL.md` 解析失败，配置 JSON 格式错误。
- `auth_env_error` — `validateAuthMethod` 返回非 null 的失败字符串，或者从 provider 解析中传播了 `ModelConfigError` 子类。
- `init_timeout` — bridge 中的 `withTimeout` reject（等待 ACP 往返时的实际超时）。通过 `BridgeTimeoutError` 类型化类识别。注意：带有 `connecting > 0` 的瞬态 `mcp_discovery` `warning` cell 不会携带此 kind —— 那是正常的握手进行中状态，与真正的超时不同。
- `protocol_error` — ACP `extMethod` 被拒绝，因为 channel 在请求中途关闭，或者 tool registry 意外缺失。
- `blocked_egress` — 预留给 PR 14 (#4175)。PR 13 将 `egress` cell 保留为 `status: 'not_started'`。

如果 bridge 在提供 preflight 请求时无法连接到 ACP 子进程（例如请求中途 channel 关闭），envelope 的 `errors` 数组将携带一个描述该失败的 `ServeStatusCell`，并且 cells 会回退到 `not_started` 的 ACP 占位符。Daemon 级别的 cells 仍会返回。

### Workspace 文件路由

所有文件路径都通过 daemon 绑定的 workspace 进行解析。响应使用 workspace 相对路径，在正常成功情况下永远不会返回绝对文件系统路径。成功的文件响应包含：

```http
Cache-Control: no-store
X-Content-Type-Options: nosniff
```

文件系统错误使用以下 JSON 结构：

```json
{
  "errorKind": "hash_mismatch",
  "error": "expected sha256:..., found sha256:...",
  "hint": "re-read the file and retry with the latest hash",
  "status": 409
}
```

`errorKind` 的值包括 `path_outside_workspace`、`symlink_escape`、`path_not_found`、`binary_file`、`file_too_large`、`untrusted_workspace`、`permission_denied`、`parse_error`、`hash_mismatch`、`file_already_exists`、`text_not_found` 和 `ambiguous_text_match`。

#### `GET /file`

读取文本文件。查询参数：`path`（必填）、`maxBytes`、`line` 和 `limit`。daemon 会拒绝二进制文件和超过文本读取上限的文件。响应包含 `hash`，即整个文件在磁盘上原始字节的 SHA-256 摘要，即使 `line`、`limit` 或 `maxBytes` 只返回了切片。

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

从文件中读取原始字节而不进行解码。查询参数：`path`（必填）、`offset`（默认 `0`）和 `maxBytes`（默认 `65536`，最大 `262144`）。此路由支持在大型二进制文件上进行有界窗口读取，而无需将整个文件加载到内存中。仅当返回的窗口覆盖整个文件时，响应才包含 `hash`。

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

创建或替换文本文件。这是一个严格的变更路由：在 loopback 且未配置 token 的情况下，它会返回 `401 { "code": "token_required" }`。启用 `--require-auth` 时，全局 bearer 中间件会在路由运行前拒绝未认证的请求。

Body：

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

`mode` 必须是 `create` 或 `replace`。`create` 永远不会覆盖现有文件（返回 `409 file_already_exists`）。`replace` 需要 `expectedHash`；缺失或格式错误的 hash 会返回 `400 parse_error`，过期的 hash 会返回 `409 hash_mismatch`。`expectedHash` 是 `sha256:` 加上 64 个小写十六进制字符，基于磁盘上的原始字节计算得出。

可以提供 `bom`、`encoding` 和 `lineEnding`。默认情况下，替换操作会保留现有文件的编码配置；显式提供的字段会覆盖它。不支持二进制写入。

daemon 会写入目标目录中的一个随机临时文件，在支持的情况下执行 fsync，在 `rename()` 之前立即重新检查当前 hash，然后重命名到位。这可以防止观察到不完整的文件，并序列化对同一文件的 daemon 发起的写入，但它不是跨进程的内核 compare-and-swap：外部编辑器仍然可以在最终 hash 检查和重命名之间的极小窗口内发生竞争。

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

对现有文本文件应用一次精确的文本替换。这也是一个严格的变更路由，需要 `expectedHash`。

```json
{
  "path": "src/config.ts",
  "oldText": "timeout: 30000",
  "newText": "timeout: 60000",
  "expectedHash": "sha256:..."
}
```

`oldText` 必须非空且恰好出现一次。没有匹配项会返回 `422 text_not_found`；多个匹配项会返回 `422 ambiguous_text_match`。该路由会保留编码、BOM 和换行符，并在原子重命名之前立即重新检查 `expectedHash`。

允许对忽略路径进行显式写入/编辑，因为经过认证的调用方指定了该路径。成功响应和审计事件包含 `matchedIgnore: "file" | "directory" | null`。

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

`state` 镜像了 `POST /session`、`POST /session/:id/load` 和 `POST /session/:id/resume` 使用的相同 ACP model/mode/config-option 结构。

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

`availableCommands` 与 `available_commands_update` SSE 通知使用的命令快照相同。`availableSkills` 仅列出 skill 名称；客户端不应期望通过此路由获取 skill 主体或路径。

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

此路由是一个只读的带外快照。它故意不是一个 prompt，并且可以在 session 流式传输时进行查询。响应仅包含来自 agent、shell 和 monitor task 注册表的白名单元数据；controllers、timers、offsets、pending messages 和原始注册表对象永远不会暴露。

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

`status` 是 `NOT_STARTED`、`IN_PROGRESS`、`READY` 或 `FAILED` 之一。对于失败的 server，如果可用，会存在可选的 `error`。禁用的 LSP（包括 bare 模式）返回 HTTP 200，其中 `enabled: false`，计数为零，且 `servers: []`。启用 LSP 但没有配置 server 时返回 `enabled: true`，`configuredServers: 0`，且 `servers: []`。如果在客户端存在之前初始化失败，响应可能包含 `initializationError`；如果活跃的客户端无法提供快照，响应包含 `statusUnavailable: true`。

此路由仅暴露稳定的面向客户端的字段。它故意省略调试内部信息，如进程 ID、spawn 参数、stderr 尾部、root URI 和 workspace-folder 路径。

### `POST /session`

生成一个新的 agent 或附加到一个现有的 agent（在 `sessionScope: 'single'`（默认值）下）。

Request：

```json
{
  "cwd": "/absolute/path/to/workspace",
  "modelServiceId": "qwen-prod",
  "sessionScope": "thread"
}
```

| 字段 | 必填 | 说明 |
| --- | --- | --- |
| `cwd` | 否 | 与 daemon 绑定的 workspace 匹配的绝对路径。如果省略，路由会回退到 `boundWorkspace`（从 `/capabilities.workspaceCwd` 读取）。不匹配的非空 `cwd` 会返回 `400 workspace_mismatch` (#3803 §02 — 1 daemon = 1 workspace)。Workspace 路径通过 `realpathSync.native` 进行规范化（对于不存在的路径使用仅解析的回退），因此不区分大小写的文件系统不会因为拼写不同而拒绝 session。 |
| `modelServiceId` | 否 | 选择 agent 将通过哪个配置的 _model service_（后端 provider —— 阿里云百炼、OpenRouter 等）进行路由。如果省略，agent 使用其默认值。如果 workspace 已经有一个 session，这会在现有 session 上调用 `setSessionModel` 并广播 `model_switched`。这与 `POST /session/:id/model` 上的 `modelId` 不同，后者选择在已绑定 service **内部**的 model。`/capabilities` 上的 `modelServices` 数组保留用于广播配置的 services；在 Stage 1 中它始终为 `[]`（使用 agent 的默认 service，不通过 HTTP 枚举）。 |
| `sessionScope` | 否 | 每个请求的 session 共享覆盖。`'single'`（daemon 全局默认值）使第二个相同 workspace 的 `POST /session` 重用现有 session（`attached: true`）；`'thread'` 强制每次调用都创建一个新的独立 session。省略以继承 daemon 全局默认值。枚举之外的值会返回 `400 { code: 'invalid_session_scope' }`。旧版 daemon（#4175 PR 5 之前）会静默忽略此字段 —— 发送前预检 `caps.features.session_scope_override`。目前生产环境中的 daemon 全局默认值硬编码为 `'single'`；#4175 可能会在后续版本中添加 `--sessionScope` CLI 标志。 |

Response：

```json
{
  "sessionId": "<uuid>",
  "workspaceCwd": "/canonical/path",
  "attached": false
}
```

`attached: true` 表示该 workspace 的 session 已经存在，你现在正在共享它。

对同一 workspace 的并发 `POST /session` 调用会被**合并**为一次生成 —— 两个调用方都会获得相同的 `sessionId`，且恰好有一个报告 `attached: false`。如果底层生成失败（初始化超时、agent 输出格式错误、OOM），**所有合并的调用方都会收到相同的错误** —— 飞行中的 slot 会被清除，以便后续调用可以从头重试。

> ⚠️ **在 HTTP 响应上，新 session 的 `modelServiceId` 拒绝是静默的。**
> 错误的 `modelServiceId`（拼写错误、未配置的 service）**不会**导致创建时返回 500 —— session 会在 agent 的默认 model 上保持运行，因此调用方仍然会获得一个 `sessionId`，他们可以针对该 ID 重试 model 切换（通过 `POST /session/:id/model`）。
> 可见的失败信号是 session SSE 流上的 `model_switch_failed` 事件，在生成握手和你的第一次订阅之间触发。**需要观察此事件的订阅者应在其第一次 `GET /session/:id/events` 时传递 `Last-Event-ID: 0`**，以从 ring 中最旧的可用事件开始重放（即使订阅在 create 响应后几毫秒才到达，也能覆盖生成时的 `model_switch_failed`）。

### `POST /session/:id/load`

通过 id 恢复持久化的 ACP session，并通过 SSE 重放其历史记录。路径中的 id 是权威的；body 中的任何 `sessionId` 字段都会被忽略。预检 `caps.features.session_load` —— 旧版 daemon 对此路由返回 `404`。

Request：

```json
{
  "cwd": "/absolute/path/to/workspace"
}
```

| 字段 | 必填 | 说明 |
| --- | --- | --- |
| `cwd` | 否 | 与 `POST /session` 相同的规范化 + `workspace_mismatch` 规则。省略以继承 `/capabilities.workspaceCwd`。此处故意**不**接受 `mcpServers` —— daemon 全局的 MCP 是由设置驱动的（与 `POST /session` 匹配）。 |

Response：

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

`state` 镜像 ACP 的 `LoadSessionResponse` —— `models` 是 `SessionModelState`，`modes` 是 `SessionModeState`，`configOptions` 是 `SessionConfigOption` 数组。缺失的字段由 agent 决定。迟到的附加者（下面的 `attached: true` 路径）会获得与原始 load 调用方看到的**相同**的 `state` 快照 —— daemon 在入口处缓存它；运行时变更（例如 `model_switched`）通过 SSE 流传递，而不是在后续的附加响应中传递。

`attached: true` 表示 session 已经处于活跃状态（要么来自之前的 `session/load`/`session/resume`，要么因为合并的并发调用方刚好抢先一步）。

**通过 SSE 重放历史记录。** 当 agent 端的 `loadSession` 在飞行中时，agent 会为每个持久化的 turn 发出 `session_update` 通知。daemon 在路由响应返回之前将它们缓冲到 session 的 event-bus 上，因此立即使用 `Last-Event-ID: 0` 调用 `GET /session/:id/events` 的订阅者会看到完整的重放。**重放 ring 是有界的**（默认每个 session 8000 帧）。包含许多 tool-call / thought-stream turn 的长历史记录可能会超过该限制 —— 最旧的帧会被静默丢弃。需要完整历史记录的客户端应在 `load` 返回后立即订阅；或者他们可以持久化 SSE event id 并使用 `Last-Event-ID` 从稍后的 turn 边界恢复。

**错误：**

- `404` —— 持久化的 session id 不存在（`SessionNotFoundError`）。
- `400` —— `workspace_mismatch`（与 `POST /session` 结构相同）。
- `503` —— `session_limit_exceeded`（计入 `--max-sessions`；飞行中的恢复也计算在内）。
- `409` —— `restore_in_progress`（相同 id 的 `session/resume` 已经在飞行中）。`Retry-After: 5`。相同操作的竞争（两个并发的相同 id 的 `session/load`）会合并 —— 恰好有一个返回 `attached: false`，其余的返回 `attached: true` 并带有相同的 `state`。

### `POST /session/:id/resume`

通过 id 恢复持久化的 ACP session，**不**通过 SSE 重放历史记录。model context 在 agent 端内部恢复（通过 `geminiClient.initialize` 读取 `config.getResumedSessionData`）；SSE 流对于已经渲染了历史记录的客户端保持干净。预检 `caps.features.session_resume`；`unstable_session_resume` 仍然是旧客户端的已弃用兼容别名。

与 `/load` 相同的请求结构。相同的响应结构 —— `state` 镜像 ACP 的 `ResumeSessionResponse`。相同的错误 envelope，包括 `409 restore_in_progress`（当 `session/load` 在飞行中时触发；`session/resume` 在另一个 `session/resume` 之后竞争会合并）。

当客户端没有渲染历史记录时（冷重连，选择器 → 打开），使用 `/load`。当客户端已经在屏幕上显示了 turns 并且只需要 daemon 端的句柄时，使用 `/resume`。

> ⚠️ **为什么仍然广播 `unstable_session_resume`？**
> daemon 的 HTTP 路由和 `session_resume` 能力对于 v1 是稳定的，但 bridge 仍然调用 ACP 的 `connection.unstable_resumeSession`。保留旧标签只是为了让在 `session_resume` 之前发布的 SDK 能够继续工作。

### `GET /workspace/:id/sessions`

列出所有规范 workspace 匹配 `:id`（URL 编码的绝对 cwd）的活跃 session。

```bash
curl http://127.0.0.1:4170/workspace/$(jq -rn --arg c "$PWD" '$c|@uri')/sessions
```

Response：

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

当没有 session 存在时返回空数组（而不是 404）—— session 选择器 UI 不应该仅仅因为 workspace 空闲就报错。

### `POST /session/:id/prompt`

将 prompt 转发给 agent。多 prompt 调用方在每个 session 中按 FIFO 排队（ACP 保证每个 session 只有一个活跃的 prompt）。

Request：

```json
{
  "prompt": [{ "type": "text", "text": "What does src/main.ts do?" }]
}
```

验证：`prompt` 必须是非空的对象数组。其他失败会在到达 bridge 之前返回 `400`。

Response：

```json
{ "stopReason": "end_turn" }
```

其他停止原因：`cancelled`、`max_tokens`、`error`、`length`（根据 ACP 规范）。

如果 HTTP 客户端在 prompt 中途断开连接，daemon 会向 agent 发送 ACP `cancel` 通知，agent 会以 `stopReason: "cancelled"` 结束 prompt。
> **第一阶段限制 — 无服务端 prompt 超时。** Bridge 仅将 agent 的 `prompt()` 与 `transportClosedReject`（agent 子进程崩溃）以及调用方的 HTTP 断开连接 AbortSignal 进行竞争。一个卡住但仍存活的 agent（例如挂起的模型调用）会阻塞每个 session 的 FIFO，直到 HTTP 客户端在其端超时并断开连接。长时间运行的 prompt 是合理的（如深度研究、大型代码库分析），因此故意不设置默认截止时间；第二阶段将暴露可配置的 `promptTimeoutMs` 选项。在此之前，调用方应设置自己的客户端超时，并在到期时断开连接（或调用 `POST /session/:id/cancel`）。

### `POST /session/:id/cancel`

取消 session 上**当前处于活动状态**的 prompt。在 ACP 侧，这是一个通知而非请求 — agent 通过将活动的 `prompt()` 解析为 `cancelled` 来进行确认。

```bash
curl -X POST http://127.0.0.1:4170/session/$SID/cancel
# → 204 No Content
```

> **多 prompt 契约：** cancel 仅影响活动的 prompt。同一客户端之前 POST 且仍排队在活动 prompt 之后的任何 prompt 将继续执行。多 prompt 排队是 daemon 引入的行为（不在 ACP 规范中）；排队 prompt 的契约是“它们会继续运行，除非你逐个取消它们，或者通过 channel exit 终止 session”。

### `DELETE /session/:id`

显式关闭一个活动的 session。即使有其他客户端连接也会强制关闭 — 取消任何活动的 prompt，将挂起的权限解析为已取消，发布 `session_closed` 事件，关闭 EventBus，并从 daemon maps 中移除该 session。磁盘上持久化的 session 不会被删除 — 它们可以通过 `POST /session/:id/load` 重新加载。预检 `caps.features.session_close`。

```bash
curl -X DELETE http://127.0.0.1:4170/session/$SID
# → 204 No Content
```

幂等：对于未知的 session 返回 `404`（与其他路由相同的 `SessionNotFoundError` 结构）。

> **`session_closed` 事件。** SSE 订阅者在流结束前会收到一个终止的 `session_closed` 事件，包含 `{ sessionId, reason: 'client_close', closedBy?: '<clientId>' }`。SDK reducers 对此的处理与 `session_died` 完全相同（设置 `alive: false`，清除 `pendingPermissions`）。

### `PATCH /session/:id/metadata`

更新可变的 session 元数据。目前仅支持 `displayName`。预检 `caps.features.session_metadata`。

请求：

```json
{ "displayName": "My Investigation Session" }
```

| 字段 | 必填 | 说明 |
| ------------- | -------- | ------------------------------------------------------------------------------ |
| `displayName` | 否 | 字符串，最多 256 个字符。空字符串会清除名称。省略则保持不变。 |

响应：

```json
{ "sessionId": "<uuid>", "displayName": "My Investigation Session" }
```

在 session 的 SSE 流上发布 `session_metadata_updated` 事件，包含 `{ sessionId, displayName }`。

### `POST /session/:id/heartbeat`

更新 daemon 对此 session 的最后可见时间记录。长生命周期的适配器（TUI/IDE/web）会按间隔 ping 此接口，以便未来的撤销策略（Wave 5 PR 24）能够区分死掉的客户端和静默的客户端。

请求头：

| Header | 必填 | 说明 |
| ------------------ | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `X-Qwen-Client-Id` | 否 | 回显 `POST /session` 中 daemon 颁发的 id。已识别的客户端也会更新其每个客户端的时间戳；匿名心跳仅更新每个 session 的水位线。必须满足与其他地方相同的 `[A-Za-z0-9._:-]{1,128}` 格式。 |

请求体为空（`{}` 即可 — 目前不读取任何字段）。

响应：

```json
{
  "sessionId": "<sid>",
  "clientId": "<cid>",
  "lastSeenAt": 1700000000123
}
```

仅当提供了受信任的 `X-Qwen-Client-Id` 时才会回显 `clientId`。`lastSeenAt` 是 bridge 存储的 daemon 侧 `Date.now()` 纪元时间（毫秒）。

错误：

- `400` — 当 header 格式错误（header 格式规则）或携带了未在此 session 注册的 `clientId` 时返回 `{ code: 'invalid_client_id' }`（bridge 在更新任何时间戳之前会抛出 `InvalidClientIdError`）。
- `404` — 未知的 session。

能力门控：预检 `caps.features.client_heartbeat`。较旧的 daemon 对此路径返回 `404`。

### `POST /session/:id/model`

在 session 当前绑定的模型服务**内部**切换活动模型。通过每个 session 的模型变更队列进行序列化。

（如果要切换_服务_本身 — 例如 Alibaba ModelStudio vs OpenRouter 等 — 请在 `POST /session` 中传递 `modelServiceId` 以创建新 session。第一阶段没有实时的服务切换路由。）

请求：

```json
{ "modelId": "qwen-staging" }
```

响应：

```json
{ "modelId": "qwen-staging" }
```

成功时，向 SSE 流发布 `model_switched`。失败时，发布 `model_switch_failed`（以便被动订阅者也能看到失败，而不仅仅是调用方）。与 agent channel exit 进行竞争，因此卡住的子进程无法阻塞 HTTP handler。

### `POST /session/:id/recap`

能力标签：`session_recap`。Bridge → ACP extMethod `qwen/control/session/recap`。

生成关于 session 的一句话“我上次进行到哪里了”总结。封装了 core 的 `generateSessionRecap`（`packages/core/src/services/sessionRecap.ts`），它对快速模型运行一个 side-query，禁用 tools，设置 `maxOutputTokens: 300`，并采用严格的 `<recap>...</recap>` 输出格式。该 side-query 读取 session 现有的 GeminiClient 聊天记录，并**不会**向其添加内容。

请求体被忽略（发送 `{}` 或空）。非严格 mutation gate — 姿态与 `/session/:id/prompt` 镜像（调用会消耗 tokens 但不改变任何状态）。不发布 SSE 事件。

响应 (200)：

```json
{
  "sessionId": "sess:42",
  "recap": "Debugging the auth retry race. Next: add deterministic timing to the integration test."
}
```

当出现以下情况时，`recap` 为 `null`（正常的 200，不是错误）：

- session 的对话轮次少于两次，
- side-query 未返回可提取的 `<recap>...</recap>` 负载，
- 或发生任何底层模型错误（core helper 是尽力而为的，永远不会抛出异常）。

错误：

- `400 {code: 'invalid_client_id'}` — `X-Qwen-Client-Id` header 格式错误。
- `404` — session 未知。

取消：**v1 中无**。该路由不监听 HTTP 客户端断开连接，没有 `AbortSignal` 被引入 bridge，并且 ACP 子进程会运行 side-query 直到完成，无论调用方是否已断开连接。唯一的限制是 bridge 的 60 秒兜底超时（`SESSION_RECAP_TIMEOUT_MS`）以及与 ACP channel 死亡的 transport-closed 竞争。这是可以接受的，因为 recap 很短（单次尝试，`maxOutputTokens: 300`，通常约 1-5 秒）；如果带宽成本合理，基于 request-id 的 cancel ext-method 可以在未来的版本中引入完整的端到端取消功能。

### 变更操作：approval, tools, init, MCP restart

Issue [#4175](https://github.com/QwenLM/qwen-code/issues/4175) Wave 4 PR 17 添加了四个变更控制路由，允许远程客户端更改运行时状态，而无需接触 daemon 主机的 CLI。所有四个路由：

- 受 PR 15 中**严格**的 mutation gate 门控。未配置 bearer token 的 daemon 会以 `401 {code: 'token_required'}` 拒绝它们。在启用前配置 `--token`（或 `QWEN_SERVER_TOKEN`）。
- 接受并标记 `X-Qwen-Client-Id` header（PR 7 审计链）。当 header 携带受信任的 id 时，daemon 会在相应的 SSE 事件上发出 `originatorClientId`，以便跨客户端 UI 可以抑制自身变更的回显。
- 在暴露功能前预检每个标签的能力。较旧的 daemon 对该路由返回 `404`。

四个路由中的三个（`tools/:name/enable`、`init`、`mcp/:server/restart`）发出**工作区作用域**的事件：每个活动的 session SSE bus 都会收到该事件，无论触发变更时附加了哪个 session。`approval-mode` 发出**session 作用域**的事件，因为该更改仅局限于单个 session 的 `Config`。

#### `POST /session/:id/approval-mode`

能力标签：`session_approval_mode_control`。Bridge → ACP extMethod `qwen/control/session/approval_mode`。

更改活动 session 的 approval mode。新模式会立即生效于 ACP 子进程的每个 session `Config` 中。默认情况下，设置不会写入磁盘 — 传递 `persist: true` 以同时将 `tools.approvalMode` 写入工作区设置。

请求：

```json
{ "mode": "auto-edit", "persist": false }
```

`mode` 必须是 `'plan' | 'default' | 'auto-edit' | 'auto' | 'yolo'` 之一（core 的 `ApprovalMode` 枚举的镜像；SDK 导出 `DAEMON_APPROVAL_MODES` 用于运行时验证）。`persist` 默认为 `false`。

响应 (200)：

```json
{
  "sessionId": "sess:42",
  "mode": "auto-edit",
  "previous": "default",
  "persisted": false
}
```

错误：

- `400 {code: 'invalid_approval_mode', allowed: [...]}` — 未知的 mode 字面量。
- `400 {code: 'invalid_persist_flag'}` — `persist` 不是布尔值。
- `403 {code: 'trust_gate', errorKind: 'auth_env_error'}` — 请求的 mode 需要受信任的文件夹（core 的 `Config.setApprovalMode` 会拒绝不受信任工作区中的特权 mode）。
- `404` — session 未知。

SSE 事件（session 作用域）：`approval_mode_changed`，包含 `{sessionId, previous, next, persisted, originatorClientId?}`。

#### `POST /workspace/tools/:name/enable`

能力标签：`workspace_tool_toggle`。纯文件 IO — 无 ACP 往返。

在工作区的 `tools.disabled` 设置列表中切换 tool 名称。列在其中的 tools **根本不会被注册**（不同于 `permissions.deny`，后者保持 tool 注册但拒绝调用）。内置 tools 和 MCP 发现的 tools 都会经过 `ToolRegistry.registerTool`，该过程会查询 disabled 集合。

> ⚠️ **名称必须与 registry 暴露的标识符完全匹配。** 不会发生别名解析 — 该路由将 path 参数中的任何字符串存储到 `tools.disabled` 中，下一个 ACP 子进程在注册时会与 `tool.name` 进行比较。内置 tools 使用其规范的 registry 名称（snake_case 动词形式）：`run_shell_command`、`read_file`、`write_file`、`list_directory`、`glob`、`grep_search`、`web_fetch` 等 — 而不是 CLI 表面显示的显示标签（`Shell`、`Read`、`Write`）。MCP 发现的 tools 使用限定的 `mcp__<server>__<name>` 形式（这也是 `tool_toggled` 事件广播的形式以及 `GET /workspace/mcp` 列出的形式）。禁用 `Bash` **不会**阻止 `run_shell_command` 在下一个 session 中注册。

活动的 ACP 子进程保留已注册的 tools — 切换在**下一个** ACP 子进程生成时生效。结合 `POST /workspace/mcp/:server/restart`（针对 MCP 来源的 tools）或创建新 session，以使更改在当前 daemon 中生效。

接受未知的 tool 名称：预先禁用尚未安装的 MCP tool 是一个合理的使用场景。

请求：

```json
{ "enabled": false }
```

响应 (200)：

```json
{ "toolName": "run_shell_command", "enabled": false }
```

错误：

- `400 {code: 'invalid_tool_name'}` — path 参数为空，或 path 参数超过 256 个字符的上限。
- `400 {code: 'invalid_enabled_flag'}` — `enabled` 缺失或不是布尔值。

SSE 事件（工作区作用域）：`tool_toggled`，包含 `{toolName, enabled, originatorClientId?}`。

#### `POST /workspace/init`

能力标签：`workspace_init`。纯文件 IO — 无 ACP 往返，**无 LLM 调用**。

在 daemon 绑定的工作区根目录生成一个空的 `QWEN.md`（或在 `--memory-file-name` 覆盖下 `getCurrentGeminiMdFilename()` 返回的任何文件）。仅限机械操作 — 对于 AI 驱动的内容填充，请接着使用 `POST /session/:id/prompt`。

默认情况下，当目标文件存在且包含非空白内容时，拒绝覆盖。仅包含空白的文件被视为不存在（与本地 `/init` 斜杠命令匹配）。

请求：

```json
{ "force": false }
```

响应 (200)：

```json
{ "path": "/work/bound/QWEN.md", "action": "created" }
```

对于全新创建，`action` 为 `'created'`；当现有的仅空白文件未被触碰（未执行写入）时，为 `'noop'`；当 `force: true` 替换了非空内容时，为 `'overwrote'`。`workspace_initialized` SSE 事件镜像响应 action — 观察者可以过滤 `action !== 'noop'` 以仅对实际的磁盘更改做出反应。

错误：

- `400 {code: 'invalid_force_flag'}` — `force` 不是布尔值。
- `409 {code: 'workspace_init_conflict', path, existingSize}` — 文件存在且包含非空白内容，且 `force` 被省略或为 false。Body 携带绝对路径和大小（字节），以便 SDK 客户端可以渲染“覆盖 N 字节？”的提示，而无需重新 stat。

SSE 事件（工作区作用域）：`workspace_initialized`，包含 `{path, action, originatorClientId?}`。

#### `POST /workspace/mcp/:server/restart`

能力标签：`workspace_mcp_restart`。Bridge → ACP extMethod `qwen/control/workspace/mcp/restart`。

通过 ACP 子进程的 `McpClientManager.discoverMcpToolsForServer`（断开连接 + 重新连接 + 重新发现）重启已配置的 MCP server。预检来自 PR 14 v1 记账的实时预算快照，因此在预算饱和的工作区上重启会返回软拒绝，而不是触发 `BudgetExhaustedError` 级联。

请求体为空（`{}`）。path 参数是 URL 编码的 server 名称，如 `mcpServers` 配置中所示。

响应 (200) — 基于 `restarted` 的判别联合：

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

| `reason` | 含义 |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `'in_flight'` | 该 server 的另一个发现/重启已在进行中。该路由立即返回而不是等待原始 promise。调用方应在短暂延迟后重试。 |
| `'disabled'` | Server 已配置但列在 `excludedMcpServers` 中。重启前请重新启用。 |
| `'budget_would_exceed'` | Daemon 为 `--mcp-budget-mode=enforce`，目标 server 当前不在 `reservedSlots` 中，且实时总数已达到 `clientBudget`。调用方应先释放一个 slot。 |

错误（非 2xx）：

- `400 {code: 'invalid_server_name'}` — path 参数为空。
- `404` — server 名称不在 `mcpServers` 配置中，或者不存在活动的 ACP channel（重启本质上需要活动的 `McpClientManager` 实例）。
- `500` — 内部错误（例如 `ToolRegistry` 未初始化）。

SSE 事件（工作区作用域）：成功时 `mcp_server_restarted`，包含 `{serverName, durationMs, originatorClientId?}`；软跳过时 `mcp_server_restart_refused`，包含 `{serverName, reason, originatorClientId?}`。

### `GET /session/:id/events` (SSE)

订阅 session 的事件流。

请求头：

```
Accept: text/event-stream
Last-Event-ID: 42        ← optional, replays from after id 42
```

查询参数：

| 参数 | 必填 | 说明 |
| ----------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `maxQueued` | 否 | 每个订阅者的**实时积压**上限。范围 `[16, 2048]`，默认 256。订阅时强制推送的 Replay 帧不受此上限限制；实际消耗它的是在订阅者仍在排空大型 `Last-Event-ID: 0` replay 时到达的实时事件。为冷重连调高此值，以便实时尾部不会在消费者赶上之前触发慢客户端警告/驱逐。超出范围/非十进制/存在但为空的值会在 SSE 握手打开前返回 `400 invalid_max_queued`。预检 `caps.features.slow_client_warning` — 旧 daemon 会静默忽略该参数。 |

帧格式。`data:` 行是**完整的事件信封**，JSON 字符串化在单行上 — `{id?, v, type, data, originatorClientId?}`。特定于 ACP 的负载（`sessionUpdate`、`requestPermission` 参数等）位于信封的 `data` 字段下；信封自身的 `type` 与 SSE 的 `event:` 行匹配。

```
id: 7
event: session_update
data: {"id":7,"v":1,"type":"session_update","data":{"sessionUpdate":"agent_message_chunk","content":{"type":"text","text":"…"}}}

id: 8
event: permission_request
data: {"id":8,"v":1,"type":"permission_request","data":{"requestId":"<uuid>","sessionId":"<sid>","toolCall":{...},"options":[...]}}

: heartbeat              ← every 15s, no payload

event: client_evicted    ← terminal frame, no id (synthetic)
data: {"v":1,"type":"client_evicted","data":{"reason":"queue_overflow","droppedAfter":42}}
```

SSE 级别的 `id:` / `event:` 行复制了 `envelope.id` / `envelope.type` 以兼容 EventSource。Raw-`fetch` 消费者（SDK 的 `parseSseStream`）从 JSON 信封中读取所有内容，并忽略 SSE 前导行。

| 事件类型 | 触发条件 |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `session_update` | 任何 ACP `sessionUpdate` 通知（LLM chunks、tool calls、usage） |
| `permission_request` | Agent 请求 tool 审批 |
| `permission_resolved` | 某些客户端通过 `POST /permission/:requestId` 对权限进行了投票 |
| `permission_partial_vote` | （仅限 consensus）记录了投票但尚未达到法定人数。携带 `{requestId, sessionId, votesReceived, votesNeeded, quorum, optionTallies}`。预检 `caps.features.permission_mediation`。 |
| `permission_forbidden` | 投票被活动策略拒绝（`designated` 不匹配、`local-only` 非环回，或 `consensus` 投票者不在快照中）。携带 `{requestId, sessionId, clientId?, reason}`。预检 `caps.features.permission_mediation`。 |
| `model_switched` | `POST /session/:id/model` 成功 |
| `model_switch_failed` | `POST /session/:id/model` 被拒绝 |
| `session_died` | Agent 子进程意外崩溃。**终止：SSE 流在此帧后关闭；session 从 `byId` 中消失。** 订阅者应通过 `POST /session` 重新连接以生成新的 session。 |
| `slow_client_warning` | 订阅者本地：队列 ≥ 75% 满。**非终止** — 流继续；该警告是驱逐前的提醒。携带 `{queueSize, maxQueued, lastEventId}`。每次溢出事件触发一次；当队列排空到 37.5% 以下时重新激活。无 `id`（合成）。预检 `caps.features.slow_client_warning`。 |
| `client_evicted` | 订阅者本地：队列溢出。**终止：SSE 流在此帧后关闭**（无 `id` — 合成）。同一 session 上的其他订阅者继续。 |
| `stream_error` | 扇出期间的 daemon 侧错误。**终止：SSE 流在此帧后关闭**（无 `id` — 合成）。 |
重连语义：

- 发送 `Last-Event-ID: <n>` 以从每个 session 的 ring 中重放 `id > n` 的事件（默认深度 **8000**，可通过 `qwen serve --event-ring-size <n>` 调整）
- **Gap 检测（客户端）：** 如果 `<n>` 早于 ring 中仍存在的最老事件（例如，你使用 `Last-Event-ID: 50` 重连，但 ring 现在包含 200–1199），daemon 会从最老的可用事件开始重放，且不会抛出异常。将第一个重放事件的 `id` 与 `n + 1` 进行比较；任何差值即为丢失窗口的大小。Stage 2 将在 daemon 端注入显式的 `stream_gap` 合成帧；在 Stage 1 中，检测是客户端的责任。
- ID 在每个 session 内是单调递增的，从 1 开始
- 合成帧（`client_evicted`、`slow_client_warning`、`stream_error`）故意省略 `id`，以免占用其他订阅者的序列槽位

背压：

- 每个订阅者的队列默认包含 `maxQueued: 256` 个活跃项（重连期间的重放帧绕过此上限）。可通过 SSE 请求上的 `?maxQueued=N`（范围 `[16, 2048]`）进行覆盖。
- 当订阅者的队列达到 75% 满时，bus 会向该订阅者强制推送一个 `slow_client_warning` 合成帧（每次溢出事件推送一次；排空至 37.5% 以下后重新触发）。流保持打开状态——此警告是一个提前通知，以便客户端可以更快地排空队列，或者干净地断开并重新连接。
- 如果队列在警告后实际发生溢出，bus 会发出 `client_evicted` 终止帧并关闭订阅。

### `POST /permission/:requestId`

对挂起的 `permission_request` 进行投票。当前生效的 **mediation policy** 决定谁获胜：

| Policy                      | Behavior                                                                                                                                                                                              |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `first-responder`（默认） | 任何经过验证的投票者获胜；后续投票者收到 `404`。F3 之前的基线。                                                                                                                                    |
| `designated`                | 仅由 prompt 发起者（`originatorClientId`）决定；非发起者收到 `403 permission_forbidden / designated_mismatch`。对于匿名 prompt，回退到 first-responder。                 |
| `consensus`                 | M 个投票者中必须有 N 个同意（默认 `N = floor(M/2) + 1`，可通过 `policy.consensusQuorum` 覆盖）。第一个达到 `N` 票的选项获胜。未决出结果的投票会收到 `200` + `permission_partial_vote` SSE 帧。 |
| `local-only`                | 仅由 loopback 投票者决定；远程调用者收到 `403 permission_forbidden / remote_not_allowed`。                                                                                                      |

当前生效的 policy 在 `settings.json` 中的 `policy.permissionStrategy` 下配置，并在 `/capabilities` 的 `body.policy.permission` 中暴露。预检（Pre-flight）使用 `caps.features.permission_mediation`（包含 `modes: [...]`）获取构建支持的集合。

> **F3 (#4175)：多客户端权限协调。** F3 添加了上述四种 policy。F3 之前的 daemon 硬编码了 first-responder；当配置的 policy 为 `first-responder` 时，wire shape 保持逐位不变。新事件（`permission_partial_vote`、`permission_forbidden`）是增量添加的——旧 SDK 会将它们视为 `unrecognized_known_event` 并优雅地忽略。

> **权限超时（默认 5 分钟）。** `permission_request` 保持挂起状态，直到：(a) 某个客户端在此处投票，(b) 触发 `POST /session/:id/cancel`，(c) 驱动 prompt 的 HTTP 客户端断开连接（prompt 中途取消会将未决权限解析为 `cancelled`），(d) session 被终止，(e) daemon 关闭，**或 (f) 触发每个 session 的权限超时**（`DEFAULT_PERMISSION_TIMEOUT_MS`，5 分钟）。超时触发时，agent 的 `requestPermission` 解析为 `{outcome: 'cancelled'}`，audit ring 记录一条 `permission.timeout` 条目，daemon stderr 输出一行 breadcrumb，SSE bus 扇出标准的 `permission_resolved` cancelled 帧以便订阅者清理。超时时间可通过 `BridgeOptions.permissionResponseTimeoutMs` 配置；运行长 prompt 的 headless 调用者可能需要延长此时间。

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

- `{ "outcome": "selected", "optionId": "<one-of-the-options>" }` — 根据 agent 提供的选项，接受 / 拒绝 / 继续一次 等
- `{ "outcome": "cancelled" }` — 放弃请求（与 `cancelSession` / `shutdown` 内部执行的操作一致）

响应：

- `200 {}` — 你的投票被接受（已解析或在 consensus 法定人数下记录）
- `403 { "code": "permission_forbidden", "reason": "designated_mismatch" | "remote_not_allowed", "requestId", "sessionId" }` — F3：当前生效的 policy 拒绝了你的投票
- `404 { "error": "..." }` — requestId 未知（已解析、从未存在或 session 已拆除）
- `500 { "code": "cancel_sentinel_collision", ... }` — F3：agent 的 `allowedOptionIds` 包含保留的哨兵值 `'__cancelled__'`；违反了 agent / daemon 契约
- `501 { "code": "permission_policy_not_implemented", "policy": "<name>" }` — F3 向前兼容：policy 字面量已落入 schema，但其 mediator 分支尚未构建（当前不可达；为未来的 policy 保留）

投票成功后，每个连接的客户端都会看到具有相同 `requestId` 和所选 `outcome` 的 `permission_resolved`。在 `consensus` 下，中间投票会额外扇出 `permission_partial_vote`，直到达到法定人数。

### Auth device-flow 路由（issue #4175 PR 21）

daemon 代理 OAuth 2.0 Device Authorization Grant（RFC 8628），以便远程 SDK 客户端可以触发登录，其 token 落在 **daemon** 文件系统上——而不是客户端上。daemon 自身轮询 IdP；客户端唯一的工作是显示验证 URL + user code，并（可选）订阅 SSE 以获取完成事件。

Capability tag：`auth_device_flow`（始终广播）。v1 中支持的 provider：`qwen-oauth`。

> [!note]
>
> Qwen OAuth 免费层已于 2026-04-15 停止服务。在此协议中，将 `qwen-oauth` 视为旧版 v1 provider 标识符；新客户端应优先使用当前受支持的 auth provider（如果可用）。

**运行时局部性（Runtime locality）。** daemon 永远不会启动浏览器——即使它可以。客户端决定是否在本地调用 `open(verificationUri)`；在 headless pod 上（典型的 Mode B 部署），用户在他们有浏览器的任何设备上打开 URL。推荐的用户体验请参阅 `docs/users/qwen-serve.md`。

**事件中无 token 泄漏。** `auth_device_flow_started` 仅携带 `{deviceFlowId, providerId, expiresAt}`。user code 和验证 URL 通过 POST 201 body 和 `GET /workspace/auth/device-flow/:id` 点对点返回；它们永远不会在 SSE 上广播。

**每个 provider 单例。** 当 flow 挂起时，对同一 provider 发起第二次 `POST` 是幂等的接管——它返回带有 `attached: true` 的现有条目，而不是启动新的 IdP 请求。

#### `POST /workspace/auth/device-flow`

严格的变更门控：即使在无 token 的 loopback 默认情况下也需要 bearer token（`401 token_required`）。

请求：

```json
{ "providerId": "qwen-oauth" }
```

响应（`201` 全新启动，`200` 幂等接管）：

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

- `400 unsupported_provider` — 未知的 `providerId`（响应包含 `supportedProviders`）
- `409 too_many_active_flows` — 达到 workspace 上限 (4)；使用 `DELETE` 取消一个
- `401 token_required` — 严格门控拒绝了无 token 的请求
- `502 upstream_error` — IdP 返回意外错误

#### `GET /workspace/auth/device-flow/:id`

读取当前状态。挂起条目回显 `userCode/verificationUri/expiresAt/intervalMs`；终止条目（5 分钟宽限期）丢弃它们并暴露 `status` + 可选的 `errorKind/hint`。

对于未知的 id 和宽限期后被驱逐的条目，返回 `404 device_flow_not_found`。

#### `DELETE /workspace/auth/device-flow/:id`

幂等取消：

- 挂起条目 → `204` + 发出 `auth_device_flow_cancelled`
- 终止条目 → `204` 无操作（不重新发出事件）
- 未知 id → `404`

#### `GET /workspace/auth/status`

挂起 flow + 受支持 provider 的快照：

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

#### Device-flow SSE 事件

五种类型的事件（workspace 作用域，扇出到每个活跃的 session bus）：

- `auth_device_flow_started` `{deviceFlowId, providerId, expiresAt}` — POST 成功；SDK 应订阅（此处无 userCode，如需请通过 GET 获取）
- `auth_device_flow_throttled` `{deviceFlowId, intervalMs}` — daemon 遵从了上游的 `slow_down`；轮询 GET 的客户端应将其间隔调整为匹配的值
- `auth_device_flow_authorized` `{deviceFlowId, providerId, expiresAt?, accountAlias?}` — 凭证已持久化；`accountAlias` 是非 PII 标签（永远不是 email/phone）
- `auth_device_flow_failed` `{deviceFlowId, errorKind, hint?}` — 终止；`errorKind` 是 `expired_token | access_denied | invalid_grant | upstream_error | persist_failed` 之一。`persist_failed` 是 daemon 内部错误：IdP 交换成功，但 daemon 无法持久存储凭证（EACCES / EROFS / ENOSPC）。用户应在底层磁盘条件修复后重试。
- `auth_device_flow_cancelled` `{deviceFlowId}` — 对挂起条目成功执行 DELETE

> **不兼容 MCP。** MCP 授权规范（2025-06-18）强制要求使用带有重定向回调的 OAuth 2.1 + PKCE auth-code，这不适用于 headless-pod daemon。Mode B 的 device-flow 表面是 daemon 私有的——针对兼容 MCP 的服务器的客户端应使用不同的 auth 路径。

## 流式 wire format

事件作为标准 EventSource 帧发出。daemon 为每个帧写入一行 `data:`（JSON 在 `JSON.stringify` 后没有嵌入的换行符）；位于 `packages/sdk-typescript/src/daemon/sse.ts` 的 SDK 解析器在接收端同时处理该格式和规范允许的多 `data:` 格式。

## 流式传输期间的错误帧

如果 bridge iterator 在为 SSE 订阅者提供服务时抛出异常，daemon 会发出终止的 `stream_error` 帧（无 `id`）。`data:` 行是完整的 envelope（与本文档中所有其他 SSE 帧的形状相同）；实际的错误消息位于 `envelope.data.error` 下：

```
event: stream_error
data: {"v":1,"type":"stream_error","data":{"error":"<message>"}}
```

然后连接关闭。

## 环境变量

| Var                 | Purpose                                                        |
| ------------------- | -------------------------------------------------------------- |
| `QWEN_SERVER_TOKEN` | Bearer token。在启动时去除前导和尾随空格。 |

## 源码布局

| Path                                                 | Purpose                                                                                                    |
| ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `packages/cli/src/commands/serve.ts`                 | yargs 命令 + flag schema                                                                                |
| `packages/cli/src/serve/run-qwen-serve.ts`           | listener 生命周期 + signal 处理                                                                       |
| `packages/cli/src/serve/server.ts`                   | Express app 组装、中间件顺序及剩余的直连路由                                     |
| `packages/cli/src/serve/routes/*.ts`                 | 专注的 Express 路由组，包括 session、SSE、workspace auth、workspace status 和 file 路由    |
| `packages/cli/src/serve/auth.ts`                     | bearer + Host 允许列表 + CORS 拒绝                                                                        |
| `packages/cli/src/serve/acp-session-bridge.ts`       | 用于 spawn-or-attach、每个 session FIFO 和 permission 注册表的 CLI 本地 bridge 兼容外观       |
| `packages/acp-bridge/src/status.ts`                  | 只读 daemon 状态 wire 类型 + `ServeErrorKind` + `BridgeTimeoutError` + `mapDomainErrorToErrorKind` |
| `packages/cli/src/serve/env-snapshot.ts`             | 纯辅助函数，从 `process.*` 状态构建 `/workspace/env` payload，包括凭证脱敏   |
| `packages/acp-bridge/src/eventBus.ts`                | 有界异步队列 + 重放 ring                                                                          |
| `packages/sdk-typescript/src/daemon/DaemonClient.ts` | TS 客户端                                                                                                  |
| `packages/sdk-typescript/src/daemon/sse.ts`          | EventSource 帧解析器                                                                                   |
| `integration-tests/cli/qwen-serve-routes.test.ts`    | 18 个用例，无 LLM                                                                                           |
| `integration-tests/cli/qwen-serve-streaming.test.ts` | 3 个用例，由本地 fake OpenAI server 支持的真实 `qwen --acp` 子进程（仅限 POSIX；在 Windows 上跳过）   |