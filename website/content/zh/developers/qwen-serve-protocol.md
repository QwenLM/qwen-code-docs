# `qwen serve` HTTP 协议参考

[qwen-code 守护进程设计](https://github.com/QwenLM/qwen-code/issues/3803) 的第一阶段。所有路由均位于守护进程的 base URL 下（默认为 `http://127.0.0.1:4170`）。

## 身份验证

当守护进程使用 `--token` 或 `QWEN_SERVER_TOKEN` 启动时，**除环回绑定（loopback binds）上的 `/health` 外的所有路由**都必须携带：

```
Authorization: Bearer <token>
```

如果未配置 token（环回开发的默认情况），则该 header 是可选的。Token 比较采用恒定时间算法。对于 `missing header` / `wrong scheme` / `wrong token`，401 响应格式是统一的。

**`/health` 豁免**（Bctum）：在环回绑定（`127.0.0.1` / `localhost` / `::1` / `[::1]`）上，`/health` 在 bearer 中间件之前注册，因此即使守护进程使用 `--token` 启动，pod 内的存活探针（liveness probes）也无需携带 token。非环回绑定（如 `--hostname 0.0.0.0`）会像其他所有路由一样将 `/health` 置于 bearer 验证之后——有关基本原理，请参阅 [`GET /health`](#get-health) 部分。

**`--require-auth`（#4175 PR 15）。** 在启动时传递此标志，可将“必须具有 token”的规则扩展到环回绑定。如果没有 token，启动将失败；同时取消 `/health` 豁免（因此 `/health` 也需要 `Authorization: Bearer …`）。

启用该标志后，全局 `bearerAuth` 中间件将拦截**所有**路由——包括 `/capabilities`。因此，**未经身份验证**的客户端无法通过预检 `caps.features` 来发现需要身份验证：这种情况下的发现途径是 **401 响应体**本身（根据 [身份验证](#身份验证) 部分，所有路由的响应格式统一）。`require_auth` 能力标签是一种**身份验证后的确认**——一旦客户端成功通过身份验证并读取 `/capabilities`，该标签的存在即可确认守护进程是使用 `--require-auth` 启动的（这对于审计/合规 UI 以及 SDK 客户端在设置面板中显示“此部署已加固”非常有用）。选择加入每路由严格模式的变更路由（Wave 4 后续跟进）在无 token 的环回默认情况下被访问时，会返回 `401 { code: "token_required", error: "…" }` 拒绝请求——但在启用 `--require-auth` 的情况下，全局 bearer 中间件会在每路由拦截之前使请求短路，因此未经身份验证的调用者实际看到的是旧版的 `Unauthorized` 响应体。

**`--allow-origin <pattern>`（T2.4 [#4514](https://github.com/QwenLM/qwen-code/issues/4514)）。** 默认情况下，跨域访问守护进程的浏览器 webui 会被阻止——任何携带 `Origin` header 的请求都会返回 `403 {"error":"Request denied by CORS policy"}`，因为 CLI/SDK 客户端从不发送 `Origin`，守护进程将其存在视为请求来自操作员未加入的浏览器上下文的标志。在启动时传递 `--allow-origin <pattern>`（可重复）以安装允许列表（allowlist）来替代拦截墙。每个 pattern 可以是：

- 字面量 `*` —— 允许任何 origin。**风险**：当配置了 `*` 但未设置 bearer token（来源可以是 `--token`、`QWEN_SERVER_TOKEN` 或要求在启动时提供 token 的 `--require-auth`）时，启动将被拒绝。当列表中包含 `*` 时，启动日志会在 stderr 发出警告。**建议**：在环回绑定上与 `--require-auth` 结合使用，这样 `/health` 和 `/demo` 也会受 bearer 拦截——默认情况下它们在环回绑定时注册在 bearer 中间件之前（因此 k8s/Compose 探针可以在没有 token 的情况下访问 `/health`），而 `*` 允许列表使它们可以从任何跨域浏览器访问。在非环回绑定上，bearer 在启动时已经是强制的，因此 `*` 暴露面仅为 `/health`（状态 JSON）和 `/demo`（一个静态页面，其 JS 仍会调用受 token 拦截的路由）——无论如何，实际的 API 暴露面都是受拦截的。
- 规范的 URL origin —— `<scheme>://<host>[:<port>]`。**无尾部斜杠、无路径、无用户信息、无查询参数。** 如果条目未通过往返测试 `new URL(pattern).origin === pattern`，启动将拒绝并抛出 `InvalidAllowOriginPatternError`；错误信息会指出错误的 pattern 和规范形式。严格设计：静默规范化（例如去除尾部 `/`）会让拼写错误溜走并接受模糊输入。

匹配的 origin 在每个请求中都会收到标准的 CORS 响应 header：

```
Access-Control-Allow-Origin: <echoed origin>
Vary: Origin
Access-Control-Allow-Methods: GET, POST, PATCH, DELETE, OPTIONS
Access-Control-Allow-Headers: Authorization, Content-Type, X-Qwen-Client-Id, Last-Event-ID
Access-Control-Max-Age: 86400
Access-Control-Expose-Headers: Retry-After
```

`Access-Control-Allow-Origin` 会逐字回显请求的 origin（浏览器发送时的大小写），而不是字面量 `*`，即使在 `*` 模式下也是如此——浏览器缓存基于它与 `Vary: Origin` 的配对来缓存响应，回显方式为在后续版本中添加 `Access-Control-Allow-Credentials` 留出了空间，而无需更改 schema。`Access-Control-Expose-Headers: Retry-After` 允许浏览器 webui 遵循守护进程在 `429` / `503` 响应中的重试提示。今天**不**发送 `Access-Control-Allow-Credentials`：守护进程通过 `Authorization` 中的 bearer 进行身份验证，这可以在没有 `credentials: 'include'` 的情况下跨域工作。

OPTIONS 预检请求（带有 `Access-Control-Request-Method` 或 `Access-Control-Request-Headers` 的 OPTIONS）会直接返回 `204 No Content` 以及上述 header。这是传统的 CORS 模式，是安全的——预检仅确认守护进程将接受哪些 methods/headers；实际的后续请求仍会运行完整的链路（host 允许列表 → bearer 身份验证 → 路由），因此反 DNS 重绑定和 bearer 强制执行仍会在读取或变更任何状态之前触发。来自匹配 origin 的普通 OPTIONS 请求会继续流向下游，并附带 CORS header。

不匹配允许列表的 origin 仍会收到 `403 {"error":"Request denied by CORS policy"}`——与默认拦截墙的响应格式相同，因此已经解析了拦截墙响应的客户端无需对部署了允许列表的守护进程进行特殊处理。拒绝路径**不会**发出任何 `Access-Control-*` header（浏览器会忽略它们，并且发出它们会通过 header 的存在间接暴露允许列表的大小）。

配置的 pattern 列表故意**不**在 `/capabilities` 中回显——浏览器 webui 已经知道自己的 origin（毕竟它调用了守护进程），并且暴露该列表会让 `/capabilities` 的未身份验证读取者枚举每个受信任的 origin（这对于配置错误的部署是有用的侦察信息）。SDK 客户端通过 `caps.features.allow_origin` 标签来判断“此守护进程允许跨域浏览器访问”，而无需知道具体是哪些 origin。

环回自 origin 请求（例如 `/demo` 页面在相同的 `127.0.0.1:port` 调用守护进程）由一个**独立**的 Origin 剥离 shim 处理，该 shim 在 CORS 中间件**之前**运行，并移除 `127.0.0.1:port` / `localhost:port` / `[::1]:port` / `host.docker.internal:port` 的 `Origin` header。因此，无论 `--allow-origin` 如何配置，它们都能通过——操作员无需列出守护进程自身的端口即可使 demo 页面正常工作。

## 常见错误格式

5xx 响应在存在时会携带原始错误的 `code` 和 `data`（JSON-RPC 风格——ACP SDK 从 agent 转发 `{code, message, data}`）：

```json
{
  "error": "Internal error",
  "code": -32000,
  "data": { "reason": "model quota exceeded" }
}
```

请求体中格式错误的 JSON 会返回：

```json
{ "error": "Invalid JSON in request body" }
```

状态码为 `400`。

未知 session id 的 `SessionNotFoundError` 会返回：

```json
{ "error": "No session with id \"<sid>\"", "sessionId": "<sid>" }
```

状态码为 `404`。

对于 `POST /session`，如果其 `cwd` 无法规范化为守护进程绑定的 workspace（#3803 §02 — 1 个守护进程 = 1 个 workspace），`WorkspaceMismatchError` 会返回 `400`，并带有：

```json
{
  "error": "Workspace mismatch: daemon is bound to \"…\" but request asked for \"…\". …",
  "code": "workspace_mismatch",
  "boundWorkspace": "/path/the/daemon/binds",
  "requestedWorkspace": "/path/in/the/request"
}
```

使用此信息在预检时检测不匹配：从 `/capabilities` 读取 `workspaceCwd` 并在 `POST /session` 中省略 `cwd`（它将回退到绑定的 workspace），或者将请求路由到绑定到 `requestedWorkspace` 的守护进程。

当 `POST /session` 超过守护进程的 `--max-sessions` 上限时，返回 `503`，并带有 `Retry-After: 5` header 和：

```json
{
  "error": "Session limit reached (20)",
  "code": "session_limit_exceeded",
  "limit": 20
}
```

附加到现有 session 的操作**不**计入上限，因此即使达到容量上限，空闲守护进程的重连也能继续工作。

`RestoreInProgressError` —— 仅由 `POST /session/:id/load` 和 `POST /session/:id/resume` 发出 —— 返回 `409`，并带有 `Retry-After: 5` header（与 `session_limit_exceeded` 匹配）和：

```json
{
  "error": "Session \"<sid>\" is already being restored via session/<resume|load>; retry session/<load|resume> after it completes",
  "code": "restore_in_progress",
  "sessionId": "<sid>",
  "activeAction": "load",
  "requestedAction": "resume"
}
```

当对已经有一个正在进行的 `session/resume` 的 id 发出 `session/load` 时（反之亦然）会触发此错误。请至少等待 `Retry-After` 秒后重试——底层恢复操作会在 `initTimeoutMs`（默认 10 秒）内完成。相同操作竞争（`load` 对 `load`，`resume` 对 `resume`）会合并而不是报错。

当调用者尝试加载或恢复其 JSONL 位于 `chats/archive/` 下的 session 时，会发出 `SessionArchivedError`：

```json
{
  "error": "Session \"<sid>\" is archived. Unarchive it before loading.",
  "code": "session_archived",
  "sessionId": "<sid>"
}
```

状态码为 `409`。

当同一 id 的 session 归档或取消归档转换已经在进行中时，会发出 `SessionArchivingError`：

```json
{
  "error": "Session \"<sid>\" is being archived or unarchived; retry later.",
  "code": "session_archiving",
  "sessionId": "<sid>"
}
```

状态码为 `409`，并带有 `Retry-After: 5`。

## 能力

守护进程从 serve 能力注册表中公布其支持的功能标签。客户端**必须**根据 `features` 来控制 UI，而不是根据 `mode`（根据设计 §10）。

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
 'session_close', 'session_metadata', 'session_organization',
 'session_archive', 'mcp_guardrails',
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

> 条件标签仅在其匹配的部署开关开启时才会出现（见下表）。F3 的 `permission_mediation` 标签始终开启，并带有 `modes: ['first-responder', 'designated', 'consensus', 'local-only']`，以便 SDK 客户端可以内省构建支持的集合；运行时激活的策略位于 `body.policy.permission`。
`session_scope_override` 是 `POST /session` 请求中 `sessionScope` 字段的协商句柄（见下文）。旧版 daemon 会静默忽略该字段，因此 SDK 客户端在发送前应预先检查 `caps.features` 中是否包含此 tag。

`session_load` 和 `session_resume` 宣告了显式恢复路由（`POST /session/:id/load` 和 `POST /session/:id/resume`）。旧版 daemon 对这些路径返回 `404`，因此 SDK 客户端在调用前应预先检查 `caps.features`。`unstable_session_resume` 仍作为已弃用的别名被宣告，以兼容在底层 ACP 方法名为 `connection.unstable_resumeSession` 时发布的 SDK；新客户端应使用 `session_resume` 进行门控。

`slow_client_warning` 涵盖 SSE 背压行为：(a) 当订阅者的实时帧积压或实时序列化字节积压超过 75% 时，daemon 会发出一个 `slow_client_warning` 合成事件流帧，每次溢出事件仅发出一次（当两项指标均降至 37.5% 以下时重新触发）；(b) `GET /session/:id/events` 接受 `?maxQueued=N` 查询参数（范围 `[16, 2048]`），用于在针对大型重放环进行冷重连时，预设每个订阅者的帧积压大小。序列化字节上限由 daemon 控制（默认每个订阅者 **2 MiB**），仅限实时数据，且故意不提供查询参数。全局 ring 大小由 `--event-ring-size` 控制（默认 **8000**，参见 #3803 §02）。旧版 daemon 会静默缺失该警告/查询行为——在启用前请预先检查此 tag。

`typed_event_schema` 宣告 daemon 事件负载符合 SDK 的 `KnownDaemonEvent` schema。旧版 daemon 可能仍会流式传输兼容的帧，但 SDK 客户端在假定具备类型化事件覆盖之前，应预先检查此 tag。

`client_heartbeat` 宣告了 `POST /session/:id/heartbeat`。旧版 daemon 返回 `404`；在发送周期性心跳前，请预先检查此 tag。

`session_close` 和 `session_metadata` 宣告了 `DELETE /session/:id` 和 `PATCH /session/:id/metadata`。旧版 daemon 返回 `404`；在暴露关闭或重命名功能前，请预先检查这些 tag。

`session_organization` 宣告了自定义会话分组和置顶功能。它新增了 `GET/POST/PATCH/DELETE /workspace/:id/session-groups`、`PATCH /session/:id/organization`，以及可选的有序列表视图 `GET /workspace/:id/sessions?view=organized`。旧版 daemon 对变更/分组路由返回 `404`，并忽略有序视图契约，因此 WebShell/SDK 客户端在显示分组或置顶 UI 前，必须预先检查此 tag。

`session_archive` 宣告了 v1 目录状态归档 API：`POST /sessions/archive`、`POST /sessions/unarchive` 和 `GET /workspace/:id/sessions?archiveState=active|archived`。归档的会话在取消归档前无法被加载或恢复。

`session_lsp` 宣告了 `GET /session/:id/lsp`，即为 daemon 客户端提供的只读结构化 LSP 状态快照。旧版 daemon 返回 `404`；在暴露远程 LSP 状态前，请预先检查此 tag。

`session_status` 宣告了 `GET /session/:id/status`，即按 id 查询单个会话的实时桥接摘要（包含 `clientCount` / `hasActivePrompt` 及核心字段）。旧版 daemon 返回 `404`；在轮询单个会话状态而非扫描完整会话列表前，请预先检查此 tag。

`session_approval_mode_control`、`workspace_tool_toggle`、`workspace_init` 和 `workspace_mcp_restart`（issue [#4175](https://github.com/QwenLM/qwen-code/issues/4175) PR 17）宣告了下文“变更：审批、工具、初始化、MCP 重启”中记录的四个变更控制路由。这四个路由均受 PR 15 变更门控的严格限制（未配置 bearer token 的 daemon 会以 401 `token_required` 拒绝它们）。旧版 daemon 返回 `404`；在暴露相应功能前，请预先检查每个 tag。

`mcp_guardrails`（issue [#4175](https://github.com/QwenLM/qwen-code/issues/4175) PR 14）涵盖 MCP 预算层面：`GET /workspace/mcp` 上的 `clientCount` / `clientBudget` / `budgetMode` / `budgets[]` 字段、每个服务器单元上的 `disabledReason` 字段，以及 `--mcp-client-budget` / `--mcp-budget-mode` CLI 标志。旧版 daemon 会完全省略这些新字段；SDK 客户端在依赖 `budgets[]` 语义前应预先检查此 tag。注册表描述符还包含 `modes: ['warn', 'enforce']`，以便未来暴露功能模式——目前，客户端从快照的 `budgetMode` 字段推断模式。在 `enforce` 模式下，服务器拒绝行为由 `Object.entries(mcpServers)` 的声明顺序决定；未来的作用域优先级层（如果 qwen-code 采用）会将其转变为“最低优先级优先”，以镜像 claude-code 的 `plugin < user < project < local` 约定。

> ⚠️ **PR 14 v1 作用域：按会话，而非按工作区。** daemon 内部的每个 ACP 会话都会构建自己的 `Config` + `McpClientManager`（通过 `acpAgent.newSessionConfig`）。预算上限限制的是**每个会话**的实时 MCP 客户端数量；每个会话独立从转发的环境变量中读取 `QWEN_SERVE_MCP_CLIENT_BUDGET`。当设置 `--mcp-client-budget=10` 且有 5 个并发 ACP 会话时，整个 daemon 的实际实时 MCP 客户端数量可达 5 × 10 = 50。`GET /workspace/mcp` 快照仅读取**引导会话**的 `McpClientManager` 统计信息——`budgets[0].scope: 'session'` 的值明确表明这是按会话计算的，而非聚合的。**Wave 5 PR 23（共享 MCP 池）** 将引入工作区作用域的管理器，并在按会话单元旁添加一个 `scope: 'workspace'` 单元，以实现真正的跨会话聚合。v1 是进程内计数器 + 软执行的基础，PR 23 将在此基础上构建。

`workspace_file_read` 涵盖文本/列表/状态/glob 工作区文件路由（`GET /file`、`GET /list`、`GET /glob`、`GET /stat`）。`workspace_file_bytes` 涵盖 `GET /file/bytes`，该路由是后续添加的，以便客户端可以针对 PR19 时代的 daemon 预先检查原始字节窗口支持。`workspace_file_write` 涵盖感知哈希的文本变更路由（`POST /file/write`、`POST /file/edit`）。write tag 表示路由契约存在；并不意味着当前部署对匿名变更开放。write/edit 是严格的变更路由，即使在环回地址上也需要配置 bearer token。

`daemon_status` 宣告了 `GET /daemon/status`，即下文记录的整合型只读运维诊断快照。

**条件 tag。** 只有当匹配的部署开关开启时，才会宣告少量功能 tag。Tag 存在 = 行为已开启；Tag 缺失 = 要么是早于该 tag 的旧版 daemon，要么是运维人员未选择启用的当前 daemon。目前包括：

| Tag                        | 宣告条件                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `require_auth`             | daemon 启动时带有 `--require-auth`（或通过嵌入式 API 设置 `requireAuth: true`）。每个路由都强制要求 Bearer token，包括环回绑定上的 `/health`。                                                                                                                                                                                                                                                                                                                                    |
| `mcp_workspace_pool`       | 共享 MCP 传输池处于活动状态。当 `QWEN_SERVE_NO_MCP_POOL=1` 禁用该池时省略。                                                                                                                                                                                                                                                                                                                                                                                                             |
| `mcp_pool_restart`         | 共享 MCP 传输池处于活动状态；重启响应可能包含感知池的多条目结构。                                                                                                                                                                                                                                                                                                                                                                                                           |
| `allow_origin`             | T2.4 ([#4514](https://github.com/QwenLM/qwen-code/issues/4514))。daemon 启动时带有至少一个 `--allow-origin <pattern>`（或通过嵌入式 API 设置 `allowOrigins: [...]`）。来自匹配源的跨域请求会收到正确的 CORS 响应头；不匹配的源仍会收到默认的 403。配置的 pattern 列表故意不在 `/capabilities` 中回显，以避免向未认证的读取者泄露受信任源集——浏览器 webui 已经知道自己的源。 |
| `prompt_absolute_deadline` | `--prompt-deadline-ms` / `QWEN_SERVE_PROMPT_DEADLINE_MS` / `ServeOptions.promptDeadlineMs` 被设置为正整数。                                                                                                                                                                                                                                                                                                                                                                                        |
| `writer_idle_timeout`      | `--writer-idle-timeout-ms` / `QWEN_SERVE_WRITER_IDLE_TIMEOUT_MS` / `ServeOptions.writerIdleTimeoutMs` 被设置为正整数。                                                                                                                                                                                                                                                                                                                                                                             |
| `workspace_settings`       | daemon 创建时启用了设置持久化功能。                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `session_shell_command`    | 明确启用了会话 shell 执行。                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `rate_limit`               | 启用了 `--rate-limit` / `QWEN_SERVE_RATE_LIMIT=1` / `ServeOptions.rateLimit`。                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `workspace_reload`         | 嵌入式路由配置中提供了工作区重载支持。                                                                                                                                                                                                                                                                                                                                                                                                                                      |
`mcp_guardrails` **不**在此条件表中——它是一个始终开启的标签，只要二进制文件支持新的 `/workspace/mcp` 预算字段就会进行通告，无论 operator 是否配置了预算。未设置 `--mcp-client-budget` 的 operator 依然会获取新字段（此时 `budgetMode: 'off'`，`budgets: []`）。

`mcp_guardrail_events`（issue [#4175](https://github.com/QwenLM/qwen-code/issues/4175) PR 14b）通告了类型化的 SSE 推送事件，这些事件可以在无需轮询循环的情况下反映 MCP 预算状态的跨越情况。`GET /session/:id/events` 会接收两种帧类型：

- `mcp_budget_warning` — 在 `reservedSlots.size / clientBudget` 向上跨越 75% 时触发一次。仅当该比例降至 37.5%（`MCP_BUDGET_REARM_FRACTION`）以下时才会重新触发。它镜像了 PR 10 中 `slow_client_warning` 的迟滞机制，但作用于 manager 级别而非每个 subscriber 的积压级别。Payload：`{ liveCount, reservedCount, budget, thresholdRatio: 0.75, mode: 'warn' | 'enforce' }`。在 `warn` 和 `enforce` 模式下均会触发；在 `off` 模式下永不触发。
- `mcp_child_refused_batch` — 在每次 `discoverAllMcpTools*` 遍历结束时，如果有一个或多个 server 被拒绝则触发；同时在 `readResource` 的 lazy-spawn 拒绝路径上作为长度为 1 的批次触发。Payload：`{ refusedServers: [{ name, transport, reason: 'budget_exhausted' }, ...], budget, liveCount, reservedCount, mode: 'enforce' }`。`mode` 为字面量 `'enforce'`，因为 `warn` 模式永远不会拒绝。

这两个事件都存在于每个 session 的 SSE 重放环中（它们带有 `id`），因此使用 `Last-Event-ID` 重新连接的客户端可以通过它们恢复状态；`GET /workspace/mcp` 处的快照仍然是长时间断开连接后状态的唯一真实来源（source-of-truth）。一旦通告即为始终开启——没有条件开关。SDK reducer 状态（`DaemonSessionViewState`）暴露了 `mcpBudgetWarningCount`、`lastMcpBudgetWarning`、`mcpChildRefusedBatchCount`、`lastMcpChildRefusedBatch`，供需要简单延迟风格 UI 的 adapter 使用。

## 路由

### `GET /health`

存活探针（Liveness probe）。默认形式在 listener 启动时返回 `200 {"status":"ok"}`——开销小，无需访问 bridge，适用于高频的 k8s/Compose 存活探针。

传递 `?deep=1`（也接受 `?deep=true` 或单独的 `?deep`）以使用暴露 bridge **计数器**的探针（仅供参考，并非真正的存活检查）：

```json
{ "status": "ok", "sessions": 3, "pendingPermissions": 1 }
```

> ⚠️ 深度探针**仅供参考**，并非真正的存活验证。它读取计数器访问器（`bridge.sessionCount`、`bridge.pendingPermissionCount`），这些只是简单的 Map-size getter；它们不会 ping 各个子进程/通道，因此无法检测到卡住但仍被计数的 session。请将其用于容量仪表盘（当前并发数与 `--max-sessions` 的对比、队列深度），而不是作为“将此 daemon 移出轮转”的触发条件。如果自定义 bridge 实现的 getter 抛出异常，理论上可能会返回 `503 {"status":"degraded"}`，但真实 bridge 的 getter 永远不会这样做——在正常操作下，深度探针始终返回 200。对于真正的存活检查，请依赖 listener 是否接受 TCP 连接（即不带 `?deep` 的默认 `/health`）。

**Auth：** **仅在非环回绑定（non-loopback binds）时需要**。在环回地址（`127.0.0.1`、`::1`、`[::1]`）上，`/health` 在 bearer 中间件之前注册，因此 pod 内的 k8s/Compose 探针无需携带 token。在非环回地址（`--hostname 0.0.0.0` 等）上，该路由在 bearer 中间件之后注册，如果没有有效 token 则返回 401——否则未经身份验证的调用者可以探测任意地址以确认 `qwen serve` 是否存在，这是一种低严重性的信息泄露，与端口扫描结合会产生不良影响。CORS 拒绝 + Host 白名单在环回豁免中依然适用。

### `GET /daemon/status`

只读的 operator 诊断信息。与 `/health` 不同，这是一个常规的 daemon API：
它在 bearer 认证和速率限制之后注册，包括在环回绑定上。查询参数：

- `detail=summary`（默认）仅读取内存中的 daemon 状态。
- `detail=full` 还包括实时 session 诊断、ACP 连接诊断、auth device-flow 计数以及 workspace 状态部分。
- 任何其他 `detail` 值均返回 `400 { "code": "invalid_detail" }`。

`summary` 故意不查询 workspace 状态方法、不启动 ACP 子进程或生成 session。`full` 独立查询每个 workspace 部分；超时或异常仅会将该部分标记为 `unavailable`，并添加一个 `workspace_status_unavailable` issue。

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
    "channelWorker": {
      "enabled": false,
      "state": "disabled",
      "channels": []
    },
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
    },
    "perf": {
      "eventLoop": { "meanMs": 0, "p50Ms": 0, "p99Ms": 0, "maxMs": 0 },
      "promptQueueWait": {
        "count": 0,
        "meanMs": 0,
        "maxMs": 0,
        "lastMs": null
      },
      "pipe": {
        "inbound": { "count": 0, "totalBytes": 0, "maxBytes": 0 },
        "outbound": { "count": 0, "totalBytes": 0, "maxBytes": 0 }
      }
    },
    "activity": {
      "activePrompts": 0,
      "pendingPrompts": 0,
      "queuedPrompts": 0,
      "lastActivityAt": null,
      "idleSinceMs": null
    }
  }
}
```

`runtime.perf` 是可选的。存在时，它仅报告 daemon 进程的事件循环延迟、prompt FIFO 队列等待采样以及 daemon 子进程管道字节计数器；ACP 子进程的事件循环延迟不包含在 `/daemon/status` 中。

如果任何 issue 具有 error 严重性，则 `status` 为 `error`；如果任何 issue 具有 warning 严重性，则为 `warning`；否则为 `ok`。Issue 代码是稳定的，包括 `session_capacity_high`、`connection_capacity_high`、`pending_permissions`、`acp_channel_down`、`preflight_error`、`mcp_budget_warning`、`mcp_budget_exhausted`、`rate_limit_hits`、`channel_worker_exited`、`channel_worker_partial_connect` 和 `workspace_status_unavailable`。在 listener 就绪但完整 runtime 挂载之前的短暂窗口期内，`/daemon/status` 可能会报告 `daemon_runtime_starting`；如果异步 runtime 挂载失败，它将报告 `daemon_runtime_failed`，同时非状态 runtime 路由返回 `503`。

`runtime.activity` 报告 daemon 全局的 prompt 活动。`activePrompts` 统计具有进行中 prompt 的 session 数量。`pendingPrompts` 统计所有已接受但尚未完成的 prompt，包括正在运行的 prompt 和 FIFO 等待中的 prompt。`queuedPrompts` 统计已接受但尚未分发的 FIFO 等待中的 prompt。`lastActivityAt` 是最后一次 prompt 开始/结束或 session 生成的 ISO 8601 时间戳；如果 daemon 自启动以来从未处理过任何活动，则为 `null`。`idleSinceMs` 在生成响应时根据 `lastActivityAt` 计算得出。

`runtime.channel.live` 报告 daemon 内部的 ACP bridge 通道。它不是 channel-adapter worker。Daemon 管理的通道使用 `runtime.channelWorker`，其 `state` 为 `disabled`、`starting`、`running`、`exited`、`failed` 或 `stopped` 之一。当 worker 达到 `running` 状态然后退出时，`/daemon/status` 保持 daemon 在线，并报告 warning issue 代码 `channel_worker_exited`。

Daemon 管理的 channel worker 启动依然保持快速失败（fail-fast）：如果 `qwen serve --channel ...` 无法启动一个达到 ready 状态的 worker，则 serve 启动失败。在 worker 达到 ready 状态后，意外退出将由 serve supervisor 在有限策略内重启：在 5 分钟窗口内最多尝试重启 3 次，退避时间分别为 1s、5s 和 15s。Worker 每 15s 发送一次 IPC 心跳；如果 45s 内未观察到心跳，supervisor 会将 worker 视为过期，将其终止，记录 `staleHeartbeatAt`，并使用相同的路径进行重启。

`runtime.channelWorker` 可能包含附加的操作字段：`requestedChannels`、`pid`、`startedAt`、`exitCode`、`signal`、`error`、`restartCount`、`lastExitAt`、`lastRestartAt`、`nextRestartAt`、`lastHeartbeatAt` 和 `staleHeartbeatAt`。`restartCount` 是此 serve 进程在其生命周期内进行的重新启动尝试次数；除非存在其他 issue，否则 `restartCount > 0` 的运行中 worker 是健康的。如果运行中 worker 的 `requestedChannels` 包含 `channels` 中缺失的名称，则报告 `channel_worker_partial_connect`。

`qwen channel status` 继续读取 pidfile 元数据。在重启窗口期间，serve 拥有的 pidfile 保持保留状态，但会省略 `workerPid`，以免客户端显示过期的 worker 进程。Worker 的 stdout/stderr 会被转发到 daemon 日志中，同时会脱敏（redacted）bearer token、敏感的 worker 环境变量值以及代理 URL 凭据。

安全性：响应中绝不包含 bearer token、client id、完整的 ACP 连接 id、device-flow user code 或验证 URL。`summary` 会省略 daemon 日志路径；`full` 可能会为经过身份验证的 operator 包含该路径。

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

稳定的契约：当 `v` 递增时，表示帧布局发生了向后不兼容的更改。

> **`protocolVersions`** 描述 daemon 可以使用的 serve 协议版本。`current` 是 daemon 首选的协议版本，`supported` 是兼容版本集合。需要特定协议的客户端应检查 `supported`；特定功能的 UI 仍应以 `features` 为准。v=1 的附加项：较旧的 v=1 daemon 会省略此字段，因此针对旧版本构建的 SDK 客户端应将其视为可选。

> **在 Stage 1 中，`modelServices` 始终为 `[]`。** Agent 使用其单一默认 model service，并且不会通过网络枚举它。Stage 2 将从注册的 model adapter 中填充此字段，以便 SDK 客户端可以构建 service-picker；在此之前，请勿依赖此字段为非空。

> **`workspaceCwd`** 是此 daemon 绑定的规范绝对路径（#3803 §02 — 1 个 daemon = 1 个 workspace）。使用它可以 (a) 在发布 `/session` 之前检测不匹配情况，以及 (b) 在 `POST /session` 上省略 `cwd`（该路由会回退到此路径）。多 workspace 部署会在不同端口上暴露多个 daemon，每个 daemon 都有自己的 `workspaceCwd`。v=1 的附加项：§02 之前的 v=1 daemon 会省略此字段——针对旧版本构建的客户端在使用前应进行 null 检查。

### 只读 runtime 状态路由

这些路由报告 daemon 端的 runtime 快照。它们是 v1 的附加路由，
不会改变状态，也不会更改 serve 协议版本。Workspace
状态路由故意**不会**仅仅因为客户端轮询 GET 路由就启动 ACP 子进程：如果 daemon 处于空闲状态，它们将返回
`initialized: false` 并附带空快照。Session 状态路由需要存活的 session，并对未知 id 使用标准的 `404 SessionNotFoundError` 结构。

能力标签（Capability tags）：
- `workspace_mcp` → `GET /workspace/mcp`
- `workspace_skills` → `GET /workspace/skills`
- `workspace_providers` → `GET /workspace/providers`
- `workspace_env` → `GET /workspace/env`
- `workspace_preflight` → `GET /workspace/preflight`
- `session_context` → `GET /session/:id/context`
- `session_supported_commands` → `GET /session/:id/supported-commands`
- `session_tasks` → `GET /session/:id/tasks`
- `session_status` → `GET /session/:id/status`

通用状态 cell：

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

`errorKind` 是一个封闭枚举，由 `/workspace/preflight`、`/workspace/env` 以及（最终）MCP guardrails 共享，以便 SDK 客户端可以按类别渲染修复建议，而不是解析自由格式的消息。PR 13 (#4175) 引入了上面列出的七个字面量；PR 14 将在 egress 探测落地后填充 `blocked_egress`。

状态 payload 永远不会暴露 MCP env 值、headers、OAuth/服务账户详情、provider API keys、provider `baseUrl` / `envKey`、skill body、skill 文件系统路径、hook 定义或秘密环境变量的值。`/workspace/env` 仅报告白名单 env vars 的**存在状态**；代理 URL 在发送到网络之前会被剥离凭据并简化为 `host:port`。

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

`discoveryState` 的值为 `not_started`、`in_progress` 或 `completed` 之一。`transport` 的值为 `stdio`、`sse`、`http`、`websocket`、`sdk` 或 `unknown` 之一。当发现成功时，会省略 `errors`。

**MCP 客户端 guardrails（issue [#4175](https://github.com/QwenLM/qwen-code/issues/4175) PR 14）。** PR 14 之后的 daemon 会在 payload 中扩展四个附加字段和一个 workspace 级别的 cell：

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

`budgetMode` 的值为 `enforce`、`warn` 或 `off` 之一。未设置 budget 时，`clientBudget` 会缺失。在 PR 14 之后的 daemon 中，`budgets[]` **始终是一个数组**（当 `budgetMode === 'off'` 时可能为空）；PR 14 之前的 daemon 会完全省略该字段。v1 会发出一个带有 `scope: 'session'` 的 cell（按 session 强制执行——原因见上文 capabilities 部分）。消费者**必须**容忍带有无法识别的 `scope` 值的额外 `budgets[]` 条目——Wave 5 PR 23 将在按 session 的 cell 旁边添加 `scope: 'workspace'`（或 `'pool'`），且不会进行 schema 升级。

每个 server cell 上的 `disabledReason` 用于区分操作员禁用（`'config'` — `disabledMcpServers` 配置列表）和 budget 拒绝（`'budget'` — 已发现但因 `enforce` 模式从未连接）。拒绝顺序由 `Object.entries(mcpServers)` 的声明顺序决定，具有确定性。每个 server 的 `status: 'error', errorKind: 'budget_exhausted'` 会覆盖原始的 `mcpStatus: 'disconnected'`（虽然这是事实，但不是面向操作员的严重级别）。

PR 14 v1 中的 Budget 强制执行是**按 session 的，而不是按 workspace 的**。尽管在进程级别，#4113 之后的 Mode B daemon 是 `1 daemon = 1 workspace × N sessions`，但 `McpClientManager` 是在每个 ACP session 的 `Config` 内部通过 `acpAgent.newSessionConfig` 构建的，因此 N 个 session 各自强制执行其自己的 cap 副本。快照表示 bootstrap session 的视图。Wave 5 PR 23 引入了 workspace 作用域的共享 MCP 池，将其升级为真正的按 workspace 强制执行。

**检测 budget 压力。** 有两个数据接口，均在 PR-14b 之后填充：

- **Push 事件**（通过 `mcp_guardrail_events` 广播）：订阅 `GET /session/:id/events` 并通过 `KnownDaemonEvent` 过滤 `mcp_budget_warning` / `mcp_child_refused_batch` 帧。状态机在每次向上跨越 75% 时触发一次（在低于 37.5% 时重新激活）；在 `enforce` 模式下，拒绝操作会在每次发现过程中合并一次。
- **快照轮询**（通过 `mcp_guardrails` 广播）：调用 `GET /workspace/mcp` 并检查按 session 的 budget cell（`budgets[0]`）：

- `budgets[0].status === 'warning'` ⇔ `liveCount >= 0.75 * clientBudget`（匹配 PR 14b 的 push 事件将使用的迟滞阈值）。
- `budgets[0].status === 'error'` ⇔ `refusedCount > 0`（本次发现过程中有一个或多个 server 被拒绝）。
- `budgets[0].status === 'ok'` ⇔ 低于 75% 阈值且没有拒绝。

建议的轮询频率：与已经轮询 `/workspace/mcp` 的频率保持一致；快照的开销很小，且 budget cell 不会产生额外的发现成本。订阅了 push 事件的 SDK 客户端仍然可以从快照中获益，以获取长时间断开连接后的状态（SSE 重放环深度是有限的——`--event-ring-size`，默认 8000——因此离线时间长于环覆盖范围的客户端将回退到快照重新同步）。

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

`level` 的值为 `project`、`user`、`extension` 或 `bundled` 之一。当发现成功时，会省略 `errors`。

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

模型按 auth type 分组。Provider 连接诊断位于 `/workspace/preflight` 的 `providers` cell 中；环境预检位于 `/workspace/preflight` 和 `/workspace/env`（下文）中。当快照构建成功时，会省略 `errors`。

### `GET /workspace/env`

报告 daemon 进程的 runtime、platform、sandbox、proxy 以及白名单秘密环境变量的**存在状态**。始终根据 `process.*` 状态进行响应——daemon 永远不会生成 ACP 子进程来服务此路由，并且无论 ACP 是运行中还是空闲，响应都相同。`acpChannelLive` 字段仅供参考。

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

Cell 结构：

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

**脱敏策略。** `kind: 'env_var'` 的 cell 永远不包含 `value` 字段；客户端只能看到 `present: boolean`。`kind: 'proxy'` 的 cell 会将原始 env 值通过凭据脱敏（`redactProxyCredentials`）处理，然后再通过 `URL` 解析，以便网络传输中只携带 `host:port`。`NO_PROXY` 会逐字通过脱敏处理，因为它是一个主机列表而不是 URL。当前枚举的秘密 env vars 白名单包括 `OPENAI_API_KEY`、`ANTHROPIC_API_KEY`、`GEMINI_API_KEY`、`GOOGLE_API_KEY`、`DASHSCOPE_API_KEY`、`OPENROUTER_API_KEY` 和 `QWEN_SERVER_TOKEN`。其他 env vars 不会被枚举，因此意外设置的秘密信息将保持不可见。

### `GET /workspace/preflight`

报告 daemon 的就绪检查。**Daemon 级别的 cell**（`node_version`、`cli_entry`、`workspace_dir`、`ripgrep`、`git`、`npm`）始终从 `process.*` 和 `node:fs` 填充。**ACP 级别的 cell**（`auth`、`mcp_discovery`、`skills`、`providers`、`tool_registry`、`egress`）需要一个活跃的 ACP 子进程——当 daemon 空闲时，它们会发出 `status: 'not_started'` 占位符。该路由永远不会仅仅为了填充 cell 而生成 ACP；相应的 cell 会回退到 `not_started`。

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
Cell 结构：

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

- `missing_binary` — Node 版本低于要求，缺少 `QWEN_CLI_ENTRY`，
  ripgrep / git / npm 不在 PATH 中（对于可选的二进制文件，这些是警告而非错误）。
- `missing_file` — `boundWorkspace` 不存在或不是目录；
  skill 解析错误指向缺失或不可读的文件。
- `parse_error` — `SKILL.md` 解析失败，配置 JSON 格式错误。
- `auth_env_error` — `validateAuthMethod` 返回了非空的失败
  字符串，或者从 provider 解析中传播了 `ModelConfigError` 子类。
- `init_timeout` — bridge 中的 `withTimeout` reject（等待 ACP 往返时的实际超时）。
  通过 `BridgeTimeoutError` 类型化类识别。注意：带有 `connecting > 0` 的瞬态 `mcp_discovery`
  `warning` cell 不会携带此 kind —— 那是正常的握手进行中状态，与真正的超时不同。
- `protocol_error` — ACP `extMethod` 被拒绝，因为通道在请求中途关闭，
  或者 tool registry 意外缺失。
- `blocked_egress` — 预留给 PR 14 (#4175)。PR 13 将
  `egress` cell 保留为 `status: 'not_started'`。

如果 bridge 在提供 preflight 请求时无法连接到 ACP 子进程（例如请求中途通道关闭），envelope 的 `errors` 数组将包含一个描述该失败的 `ServeStatusCell`，并且这些 cell 会回退到 `not_started` 的 ACP 占位符。Daemon 级别的 cell 仍会被返回。

### Workspace 文件路由

所有文件路径都通过 daemon 绑定的 workspace 进行解析。响应使用 workspace 相对路径，在正常成功的情况下永远不会返回绝对文件系统路径。成功的文件响应包含以下 header：

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

`errorKind` 的值包括 `path_outside_workspace`、`symlink_escape`、
`path_not_found`、`binary_file`、`file_too_large`、`untrusted_workspace`、
`permission_denied`、`parse_error`、`hash_mismatch`、
`file_already_exists`、`text_not_found` 和 `ambiguous_text_match`。

#### `GET /file`

读取文本文件。Query 参数：`path`（必填）、`maxBytes`、`line` 和
`limit`。Daemon 会拒绝二进制文件以及超过文本读取上限的文件。
响应包含 `hash`，即整个文件在磁盘上原始字节的 SHA-256 摘要，即使 `line`、`limit` 或 `maxBytes` 只返回了部分内容（切片）。

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

不解码直接读取文件的原始字节。Query 参数：`path`（必填）、
`offset`（默认 `0`）和 `maxBytes`（默认 `65536`，最大 `262144`）。
此路由支持在大型二进制文件上读取有界窗口，而无需将整个文件加载到内存中。仅当返回的窗口覆盖整个文件时，响应才会包含 `hash`。

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

创建或替换文本文件。这是一个严格的变更路由：在没有配置 token 的 loopback 环境下，它会返回 `401 { "code": "token_required" }`。
启用 `--require-auth` 时，全局 bearer 中间件会在路由执行前拒绝未经身份验证的请求。

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

可以提供 `bom`、`encoding` 和 `lineEnding`。默认情况下，替换操作会保留现有文件的编码配置；显式指定的字段会覆盖它。不支持二进制文件写入。

Daemon 会写入目标目录中的一个随机临时文件，在支持的地方执行 fsync，在 `rename()` 之前立即重新检查当前 hash，然后重命名到位。这可以防止观察到不完整的文件，并将 daemon 发起的对同一文件的写入操作串行化，但它不是跨进程的内核 compare-and-swap：外部编辑器仍然可以在最终 hash 检查和重命名之间的极小窗口内发生竞争。

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

`oldText` 必须非空且恰好出现一次。没有匹配项返回 `422 text_not_found`；多个匹配项返回 `422 ambiguous_text_match`。
该路由会保留编码、BOM 和换行符，并在原子重命名之前立即重新检查 `expectedHash`。

允许对忽略的路径进行显式写入/编辑，因为经过身份验证的调用方指定了该路径。成功响应和审计事件包含 `matchedIgnore: "file" | "directory" | null`。

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

`availableCommands` 是 `available_commands_update` SSE 通知使用的相同命令快照。`availableSkills` 仅列出 skill 名称；客户端不应期望通过此路由获取 skill 内容或路径。

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
    },
    {
      "kind": "agent",
      "id": "agent-2",
      "label": "general-purpose: run the failing test",
      "description": "run the failing test",
      "status": "running",
      "startTime": 1699999999500,
      "runtimeMs": 500,
      "outputFile": "/tmp/agent-2.jsonl",
      "isBackgrounded": false,
      "subagentType": "general-purpose",
      "parentAgentId": "agent-1",
      "parentName": "reviewer",
      "depth": 1
    }
  ]
}
```

此路由是一个只读的带外快照。它故意不作为 prompt，并且可以在 session 流式传输时进行查询。响应仅包含来自 agent、shell 和 monitor task 注册表的白名单元数据；controllers、timers、offsets、pending messages 和原始注册表对象永远不会暴露。

由另一个 sub-agent 生成的 agent task（嵌套 sub-agent，受 `maxSubagentDepth` 限制）包含三个可选的 lineage 字段：`parentAgentId`（生成它的 agent task 的 `id`）、`parentName`（生成它的 agent 的 `subagentType`，在注册时捕获以便在父级从注册表中被驱逐后仍能保留），以及 `depth`（从 0 开始的启动深度；0 = 由顶层 session 生成）。由顶层 session 启动的 agent 会省略 `parentAgentId` 和 `parentName`；客户端应将这三个字段都视为可选，并在它们缺失时回退到扁平列表。

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

`status` 是 `NOT_STARTED`、`IN_PROGRESS`、`READY` 或 `FAILED` 之一。可选的 `error` 在失败的 server 可用时存在。禁用的 LSP（包括 bare mode）返回 HTTP 200，其中 `enabled: false`，计数为零，且 `servers: []`。启用 LSP 但没有配置 server 时返回 `enabled: true`、`configuredServers: 0` 和 `servers: []`。如果在 client 存在之前初始化失败，响应可能包含 `initializationError`；如果活跃的 client 无法提供快照，响应包含 `statusUnavailable: true`。

此路由仅暴露稳定的面向 client 的字段。它故意省略了调试内部信息，如进程 ID、spawn 参数、stderr 尾部、root URI 和 workspace-folder 路径。

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

| Field            | Required | Notes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ---------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `cwd`            | no       | 与 daemon 绑定的 workspace 匹配的绝对路径。如果省略，路由会回退到 `boundWorkspace`（从 `/capabilities.workspaceCwd` 读取）。不匹配的非空 `cwd` 会返回 `400 workspace_mismatch`（#3803 §02 — 1 个 daemon = 1 个 workspace）。Workspace 路径通过 `realpathSync.native` 进行规范化（对于不存在的路径使用仅解析的回退），因此不区分大小写的文件系统不会因拼写不同而拒绝 session。                                                                                                                                                                          |
| `modelServiceId` | no       | 选择 agent 将通过哪个配置的*模型服务*（后端 provider — 阿里云百炼、OpenRouter 等）进行路由。如果省略，agent 将使用其默认值。如果 workspace 已经有一个 session，这会在现有 session 上调用 `setSessionModel` 并广播 `model_switched`。这与 `POST /session/:id/model` 上的 `modelId` 不同，后者选择在已绑定服务**内部**的模型。`/capabilities` 上的 `modelServices` 数组保留用于广播配置的服务；在 Stage 1 中它始终为 `[]`（使用 agent 的默认服务，不通过 HTTP 枚举）。 |
| `sessionScope`   | no       | 每次请求的 session 共享覆盖。`'single'`（daemon 全局默认值）使第二个相同 workspace 的 `POST /session` 重用现有 session（`attached: true`）；`'thread'` 强制每次调用都创建一个新的独立 session。省略则继承 daemon 全局默认值。枚举之外的值返回 `400 { code: 'invalid_session_scope' }`。旧版 daemon（#4175 PR 5 之前）会静默忽略此字段 — 发送前请预检 `caps.features.session_scope_override`。目前生产环境中 daemon 全局默认值硬编码为 `'single'`；#4175 可能会在后续版本中添加 `--sessionScope` CLI 标志。         |
Response:

```json
{
  "sessionId": "<uuid>",
  "workspaceCwd": "/canonical/path",
  "attached": false
}
```

`attached: true` 表示该 workspace 的 session 已存在，你现在正在共享它。

需要独立对话的多客户端集成应在每次 `POST /session` 时发送 `sessionScope: "thread"`。仅当客户端有意共享一个协作 session 时，才使用默认的 `single` scope；共享 session 会通过一个 FIFO 队列串行化 prompts，这可以通过 `/daemon/status` 中的 `runtime.activity.pendingPrompts` 和 `runtime.activity.queuedPrompts` 看到。

针对同一 workspace 的并发 `POST /session` 调用会被**合并 (coalesced)** 为一次 spawn —— 两个调用方都会获得相同的 `sessionId`，且恰好只有一个会返回 `attached: false`。如果底层 spawn 失败（初始化超时、agent 输出格式错误、OOM），**所有合并的调用方都会收到相同的错误** —— 进行中的 slot 会被清除，以便后续调用可以从头重试。

> ⚠️ **在全新 session 上拒绝 `modelServiceId` 在 HTTP 响应中是静默的。** 错误的 `modelServiceId`（拼写错误、未配置的服务）**不会**导致创建时返回 500 错误 —— session 会在 agent 的默认 model 上保持运行，因此调用方仍然会获得一个 `sessionId`，他们可以借此重试切换 model（通过 `POST /session/:id/model`）。可见的失败信号是 session 的 SSE 流上的 `model_switch_failed` 事件，该事件在 spawn 握手和你的第一次 subscribe 之间触发。**需要观察此事件的订阅者应在第一次 `GET /session/:id/events` 时传递 `Last-Event-ID: 0`**，以便从 ring 中最旧的可用事件开始重放（即使 subscribe 在 create 响应之后几毫秒才到达，也能覆盖 spawn 时的 `model_switch_failed`）。

### `POST /session/:id/load`

通过 id 恢复持久化的 ACP session，并通过 SSE 重放其历史记录。路径中的 id 具有权威性；body 中的任何 `sessionId` 字段都会被忽略。Pre-flight 检查 `caps.features.session_load` —— 较旧的 daemon 会对此路由返回 `404`。

Request:

```json
{
  "cwd": "/absolute/path/to/workspace"
}
```

| 字段 | 是否必填 | 说明 |
|---|---|---|
| `cwd` | 否 | 与 `POST /session` 具有相同的规范化及 `workspace_mismatch` 规则。省略则继承 `/capabilities.workspaceCwd`。此处故意不接受 `mcpServers` —— daemon 全局的 MCP 由 settings 驱动（与 `POST /session` 一致）。 |

Response:

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

`state` 镜像了 ACP 的 `LoadSessionResponse` —— `models` 是 `SessionModelState`，`modes` 是 `SessionModeState`，`configOptions` 是 `SessionConfigOption` 数组。缺失的字段由 agent 决定。后加入的客户端（即下文 `attached: true` 的路径）将获得与原始 load 调用方看到的**相同**的 `state` 快照 —— daemon 会在入口处缓存它；运行时变更（例如 `model_switched`）会通过 SSE 流传递，而不会在后续的 attach 响应中传递。

`attached: true` 表示 session 已经处于活跃状态（要么是因为之前的 `session/load`/`session/resume`，要么是因为一个被合并的并发调用方刚好抢先完成）。

**通过 SSE 重放历史记录。** 当 agent 端的 `loadSession` 正在进行时，agent 会为每个持久化的 turn 发出 `session_update` 通知。daemon 会在路由响应返回之前将它们缓冲到 session 的 event-bus 上，因此立即使用 `Last-Event-ID: 0` 调用 `GET /session/:id/events` 的订阅者可以看到完整的重放。**重放 ring 是有界的**（默认每个 session 8000 帧）。包含大量 tool-call / thought-stream turn 的长历史记录可能会超出此限制 —— 最旧的帧会被静默丢弃。需要完整历史记录的客户端应在 `load` 返回后立即 subscribe；或者，他们可以持久化 SSE event id，并使用 `Last-Event-ID` 从稍后的 turn 边界恢复。

**Errors:**

- `404` —— 持久化的 session id 不存在 (`SessionNotFoundError`)。
- `400` —— `workspace_mismatch`（与 `POST /session` 结构相同）。
- `503` —— `session_limit_exceeded`（计入 `--max-sessions` 限制；进行中的 restore 也会被计算在内）。
- `409` —— `restore_in_progress`（相同 id 的 `session/resume` 正在进行中）。`Retry-After: 5`。相同操作的并发（同一 id 的两个并发 `session/load`）会被合并 —— 恰好有一个返回 `attached: false`，其余返回 `attached: true` 且具有相同的 `state`。
- `409` —— 当 id 仅存在于 `chats/archive/` 下时返回 `session_archived`；在 `load` 或 `resume` 之前调用 `POST /sessions/unarchive`。
- `409` —— 当相同 id 的 archive 或 unarchive 正在进行中时返回 `session_archiving`。`Retry-After: 5`。
- `409` —— 当 id 同时存在于 `chats/` 和 `chats/archive/` 中时返回 `session_conflict`；在 load 之前使用 `POST /sessions/delete` 删除该 session。

### `POST /session/:id/resume`

通过 id 恢复持久化的 ACP session，**不**通过 SSE 重放历史记录。model context 会在 agent 端内部恢复（通过 `geminiClient.initialize` 读取 `config.getResumedSessionData`）；对于已经渲染了历史记录的客户端，SSE 流保持干净。Pre-flight 检查 `caps.features.session_resume`；`unstable_session_resume` 仍作为面向旧客户端的已弃用兼容别名保留。

请求结构与 `/load` 相同。响应结构也相同 —— `state` 镜像了 ACP 的 `ResumeSessionResponse`。错误信封也相同，包括 `409 restore_in_progress`（当 `session/load` 正在进行时触发；在另一个 `session/resume` 之后竞争的 `session/resume` 会被合并）。

当客户端没有渲染历史记录时（冷重连，picker → open），使用 `/load`。当客户端已经在屏幕上显示了 turns，只需要拿回 daemon 端的 handle 时，使用 `/resume`。

> ⚠️ **为什么 `unstable_session_resume` 仍在被通告？** daemon 的 HTTP 路由和 `session_resume` capability 在 v1 中是稳定的，但 bridge 仍然调用 ACP 的 `connection.unstable_resumeSession`。保留旧标签仅仅是为了让在 `session_resume` 之前发布的 SDK 能够继续工作。

### `GET /workspace/:id/sessions`

列出规范 workspace 匹配 `:id`（URL 编码的绝对 cwd）的持久化 sessions。默认列表是 `chats/` 中的活跃 sessions；传递 `archiveState=archived` 以列出 `chats/archive/` 中的归档 sessions。v1 不支持 `archiveState=all`。默认响应和数字 `cursor` 语义不受 `session_organization` 影响。

```bash
curl http://127.0.0.1:4170/workspace/$(jq -rn --arg c "$PWD" '$c|@uri')/sessions
curl http://127.0.0.1:4170/workspace/$(jq -rn --arg c "$PWD" '$c|@uri')/sessions?archiveState=archived
```

Query parameters:

| 字段 | 是否必填 | 说明 |
|---|---|---|
| `archiveState` | 否 | `active`（默认）或 `archived`。任何其他值都会返回 `400 { code: "invalid_archive_state" }`。 |
| `cursor` | 否 | 来自上一次响应的分页 cursor。 |
| `size` | 否 | 分页大小。无效值会返回 `400 { code: "invalid_cursor" }` 或现有的 page-size 验证错误。 |
| `view` | 否 | 省略则使用传统的 recent 列表。`organized` 会启用服务端的 pinned/group 排序，并添加可选的 organization 字段。任何其他值都会返回 `400 { code: "invalid_session_view" }`。 |
| `group` | 否 | 仅在 `view=organized` 时有意义。`all`（默认）、`pinned`、`ungrouped` 或自定义 group id。未知的 group id 会返回 `404 { code: "group_not_found" }`。 |

Response:

```json
{
  "sessions": [
    {
      "sessionId": "<uuid>",
      "workspaceCwd": "/canonical/path",
      "createdAt": "2026-05-17T08:30:00.000Z",
      "displayName": "My Session",
      "clientCount": 2,
      "hasActivePrompt": false,
      "isArchived": false
    }
  ],
  "nextCursor": 1772251200000
}
```

当 `view=organized` 时，daemon 会读取 `<Storage.getProjectDir(cwd)>/session-organization.v1.json`，首先返回 pinned sessions，然后按活动时间降序排列，最后按 `sessionId` 排列以保证顺序稳定。organized cursor 是不透明的 base64url JSON，不能与传统的 recent 列表混用。`pinned` 是一个虚拟过滤器，而不是一个 group。`groupId: null` 表示未分组。归档 sessions 保留其 organization 元数据，但 `archiveState=archived&view=organized` 仍然只返回归档 sessions。

当 `view=organized` 时，每个 session 可能会出现以下额外字段：

```json
{
  "isPinned": true,
  "pinnedAt": "2026-07-04T12:00:00.000Z",
  "groupId": "018f..."
}
```

活跃列表包含实时的 daemon 覆盖字段，如 `clientCount` 和 `hasActivePrompt`。归档列表仅来自存储：`isArchived` 为 `true`，实时覆盖字段保持缺失或为 false。当没有 sessions 存在时返回空数组（而不是 404）—— session-picker UI 不应仅仅因为 workspace 处于空闲状态就报错。

### `GET /workspace/:id/session-groups`

列出 workspace 的用户自定义 session groups。Pre-flight 检查 `caps.features.includes('session_organization')`。

Response:

```json
{
  "groups": [
    {
      "id": "018f...",
      "name": "Frontend",
      "color": "blue",
      "order": 0,
      "createdAt": "2026-07-04T12:00:00.000Z",
      "updatedAt": "2026-07-04T12:00:00.000Z"
    }
  ],
  "colorOptions": ["red", "orange", "yellow", "green", "blue", "purple"]
}
```

颜色仅仅是协议 token；客户端负责本地化显示名称。不会创建以默认颜色命名的 groups。

### `POST /workspace/:id/session-groups`

创建自定义 session group。严格的变更门控。Pre-flight 检查 `caps.features.includes('session_organization')`。

Request:

```json
{ "name": "Frontend", "color": "blue" }
```

`name` 会被去除首尾空格，长度必须为 1-64 个字符，不能包含控制字符，并且在 workspace 内通过忽略大小写的去空格比较保持唯一。重复的名称会返回 `409 { code: "group_name_conflict" }`。`color` 必须是返回的 `colorOptions` 之一。

Response:

```json
{
  "group": {
    "id": "018f...",
    "name": "Frontend",
    "color": "blue",
    "order": 0,
    "createdAt": "...",
    "updatedAt": "..."
  }
}
```

### `PATCH /workspace/:id/session-groups/:groupId`

更新自定义 session group。严格的变更门控。Pre-flight 检查 `caps.features.includes('session_organization')`。Body 字段是可选的：`{ "name"?: string, "color"?: string, "order"?: number }`。未知的 group id 会返回 `404 { code: "group_not_found" }`；重复/无效的名称和颜色使用与创建时相同的错误。

### `DELETE /workspace/:id/session-groups/:groupId`

删除自定义 session group。严格的变更门控。Pre-flight 检查 `caps.features.includes('session_organization')`。引用该 group 的 sessions 会被清除为 `groupId: null`；pinned 状态会被保留。当 group 被移除时响应为 `{ "deleted": true }`，当 id 不存在时响应为 `{ "deleted": false }`。
### `POST /sessions/delete`

硬删除一个或多个持久化的 session JSONL 文件。daemon 会首先尽力关闭活跃的 session，然后移除 active 或 archived 的 JSONL 文件。如果同一个 id 同时存在 active 和 archived 副本，则两者都会被移除。两侧的 worktree sidecars 会被清理；文件历史记录、subagent 转录和 runtime sidecars 会被有意保留。

请求：

```json
{ "sessionIds": ["<uuid>"] }
```

响应：

```json
{
  "removed": ["<uuid>"],
  "notFound": [],
  "errors": []
}
```

### `POST /sessions/archive`

归档一个或多个 session。归档是一种状态转换，而非删除：JSONL 文件会从 `chats/<id>.jsonl` 移动到 `chats/archive/<id>.jsonl`。文件历史记录、subagent 转录和 runtime sidecars 保持原位。如果 session 处于活跃状态，daemon 会首先执行严格关闭，并要求 ACP agent 的 close handler 刷新（flush）聊天记录；如果关闭或刷新失败，则不会移动 JSONL 文件。预检（Pre-flight）`caps.features.session_archive`。

请求：

```json
{ "sessionIds": ["<uuid>"] }
```

`sessionIds` 必须是一个非空字符串数组，最多包含 100 个 id。重复项会被去重。

响应：

```json
{
  "archived": ["<uuid>"],
  "alreadyArchived": [],
  "notFound": [],
  "errors": []
}
```

`errors` 条目格式为 `{ "sessionId": "<uuid>", "error": "message" }`。具有相同 id 的 active 和 archived 文件会被视为冲突并报告在 `errors` 中；不会覆盖任何文件。

### `POST /sessions/unarchive`

将归档的 session 恢复到 active 目录。这本身不会恢复 session；它只是将 `chats/archive/<id>.jsonl` 移回 `chats/<id>.jsonl`。取消归档成功后，客户端可以调用 `POST /session/:id/load` 或 `POST /session/:id/resume`。

请求：

```json
{ "sessionIds": ["<uuid>"] }
```

响应：

```json
{
  "unarchived": ["<uuid>"],
  "alreadyActive": [],
  "notFound": [],
  "errors": []
}
```

如果该 id 已存在 active 的 JSONL 文件，取消归档会在 `errors` 中报告冲突且不会覆盖它。如果同一个 id 正在进行归档或取消归档操作，会在开始批处理前返回 `409 session_archiving`。

ACP-over-HTTP 通过 vendor 方法 `_qwen/sessions/archive` 和 `_qwen/sessions/unarchive` 使用相同的请求和响应体。REST 路由表将 `POST /sessions/archive` 和 `POST /sessions/unarchive` 映射到 ACP 传输的这些方法。

### `POST /session/:id/prompt`

将 prompt 转发给 agent。多 prompt 调用者按 session 进行 FIFO 队列排队（ACP 保证每个 session 只有一个 active prompt）。

请求：

```json
{
  "prompt": [{ "type": "text", "text": "What does src/main.ts do?" }]
}
```

校验：`prompt` 必须是非空的对象数组。其他校验失败会在到达 bridge 前返回 `400`。

响应：

```json
{ "stopReason": "end_turn" }
```

其他停止原因：`cancelled`、`max_tokens`、`error`、`length`（根据 ACP 规范）。

如果 HTTP 客户端在 prompt 执行中途断开连接，daemon 会向 agent 发送 ACP `cancel` 通知，agent 会以 `stopReason: "cancelled"` 结束该 prompt。

> **阶段 1 限制 — 无服务端 prompt 超时。** bridge 仅将 agent 的 `prompt()` 与 `transportClosedReject`（agent 子进程崩溃）以及调用方的 HTTP 断开连接 AbortSignal 进行竞争处理。一个卡住但仍存活的 agent（例如挂起的模型调用）会阻塞每个 session 的 FIFO 队列，直到 HTTP 客户端在其端超时并断开连接。长时间运行的 prompt 是合理的（如深度研究、大型代码库分析），因此故意不设置默认截止时间；阶段 2 将暴露一个可配置的 `promptTimeoutMs` 选项。在此之前，调用方应设置自己的客户端超时，并在超时时断开连接（或调用 `POST /session/:id/cancel`）。

### `POST /session/:id/cancel`

取消 session 上**当前活跃**的 prompt。在 ACP 侧，这是一个通知而非请求 — agent 通过将活跃的 `prompt()` 解析为 `cancelled` 来进行确认。

```bash
curl -X POST http://127.0.0.1:4170/session/$SID/cancel
# → 204 No Content
```

> **多 prompt 契约：** 取消仅影响活跃的 prompt。同一客户端之前 POST 且仍排队在活跃 prompt 之后的任何 prompt 将继续执行。多 prompt 队列是 daemon 引入的行为（不在 ACP 规范中）；排队 prompt 的契约是“它们会持续运行，除非你逐个取消它们，或者通过 channel exit 终止 session”。

如果在多客户端部署中不期望出现排队的 prompt，请首先确认调用方是否共享了默认的 `sessionScope: "single"` session。对于独立的每线程对话，请使用 `sessionScope: "thread"` 创建 session，这样 prompt 仅在该线程内串行化。

### `DELETE /session/:id`

显式关闭一个活跃的 session。即使有其他客户端连接也会强制关闭 — 取消任何活跃的 prompt，将待处理的权限解析为已取消，发布 `session_closed` 事件，关闭 EventBus，并从 daemon 映射中移除该 session。磁盘上持久化的 session 不会被删除 — 它们可以通过 `POST /session/:id/load` 重新加载。预检 `caps.features.session_close`。

```bash
curl -X DELETE http://127.0.0.1:4170/session/$SID
# → 204 No Content
```

幂等：对于未知的 session 返回 `404`（与其他路由相同的 `SessionNotFoundError` 结构）。

> **`session_closed` 事件。** SSE 订阅者会在流结束前收到一个终止的 `session_closed` 事件，包含 `{ sessionId, reason: 'client_close', closedBy?: '<clientId>' }`。SDK reducer 对此的处理与 `session_died` 完全相同（设置 `alive: false`，清除 `pendingPermissions`）。

### `PATCH /session/:id/metadata`

更新可变的 session 元数据。目前仅支持 `displayName`。预检 `caps.features.session_metadata`。分组和置顶故意不包含在此路由中；请使用 `session_organization` 下的 `PATCH /session/:id/organization`。

请求：

```json
{ "displayName": "My Investigation Session" }
```

| 字段            | 必填 | 说明                                                                          |
| ------------- | -------- | ------------------------------------------------------------------------------ |
| `displayName` | 否       | 字符串，最多 256 个字符。空字符串会清除名称。省略则保持原样。 |

响应：

```json
{ "sessionId": "<uuid>", "displayName": "My Investigation Session" }
```

在 session 的 SSE 流上发布 `session_metadata_updated` 事件，包含 `{ sessionId, displayName }`。

### `PATCH /session/:id/organization`

更新本地 session 组织状态。严格的变更门控。预检 `caps.features.includes('session_organization')`。

请求：

```json
{ "isPinned": true, "groupId": "018f..." }
```

| 字段       | 必填 | 说明                                                                                                |
| ---------- | -------- | ---------------------------------------------------------------------------------------------------- |
| `isPinned` | 否       | 布尔值。如果尚未置顶，`true` 会设置 `pinnedAt`；`false` 会清除 `pinnedAt`。             |
| `groupId`  | 否       | 自定义组 id，或 `null` 表示未分组。未知的组 id 会返回 `404 { code: "group_not_found" }`。 |

响应：

```json
{
  "sessionId": "<uuid>",
  "groupId": "018f...",
  "isPinned": true,
  "pinnedAt": "2026-07-04T12:00:00.000Z",
  "updatedAt": "2026-07-04T12:00:00.000Z"
}
```

此状态存储在 daemon 运行时存储目录下的项目级 session 组织 sidecar 中。它不是转录内容，不会更新转录的 `mtime`，不会随转录一起导出，并且在归档/取消归档时会被保留。

### `POST /session/:id/heartbeat`

更新 daemon 对此 session 的 last-seen 记录。长生命周期的适配器（TUI/IDE/web）会按间隔 ping 此接口，以便未来的撤销策略（Wave 5 PR 24）能够区分死掉的客户端和静默的客户端。

请求头：

| 请求头               | 必填 | 说明                                                                                                                                                                                                                                   |
| ------------------ | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `X-Qwen-Client-Id` | 否       | 回显 `POST /session` 中 daemon 分配的 id。已识别的客户端还会更新其每个客户端的时间戳；匿名心跳仅更新每个 session 的水位线。必须满足与其他地方相同的 `[A-Za-z0-9._:-]{1,128}` 格式。 |

请求体为空（发送 `{}` 即可 — 目前不读取任何字段）。

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

- `400` — 当请求头格式错误（请求头格式规则）或携带了未在此 session 注册的 `clientId` 时，返回 `{ code: 'invalid_client_id' }`（bridge 在更新任何时间戳前会抛出 `InvalidClientIdError`）。
- `404` — 未知的 session。

能力门控：预检 `caps.features.client_heartbeat`。较旧的 daemon 会对此路径返回 `404`。

### `POST /session/:id/model`

在 session 当前绑定的模型服务**内部**切换活跃模型。通过每个 session 的模型变更队列进行串行化。

（如果要切换_服务_本身 — 例如阿里云百炼 vs OpenRouter 等 — 请在创建新 session 时通过 `POST /session` 传递 `modelServiceId`。阶段 1 没有动态切换服务的路由。）

请求：

```json
{ "modelId": "qwen-staging" }
```

响应：

```json
{ "modelId": "qwen-staging" }
```

成功时，向 SSE 流发布 `model_switched`。失败时，发布 `model_switch_failed`（这样被动订阅者也能看到失败，而不仅仅是调用方）。与 agent channel exit 进行竞争处理，以防止卡住的子进程阻塞 HTTP handler。

### `POST /session/:id/recap`

能力标签：`session_recap`。Bridge → ACP extMethod `qwen/control/session/recap`。

生成关于该 session 的一句话“我上次进行到哪里了”的总结。封装了 core 的 `generateSessionRecap`（`packages/core/src/services/sessionRecap.ts`），它针对快速模型运行一个 side-query，禁用工具，设置 `maxOutputTokens: 300`，并采用严格的 `<recap>...</recap>` 输出格式。side-query 读取 session 现有的 GeminiClient 聊天记录，并**不会**向其添加内容。

请求体被忽略（发送 `{}` 或空即可）。非严格变更门控 — 行为模式与 `/session/:id/prompt` 类似（调用会消耗 tokens 但不会变更状态）。不会发布 SSE 事件。

响应 (200)：

```json
{
  "sessionId": "sess:42",
  "recap": "Debugging the auth retry race. Next: add deterministic timing to the integration test."
}
```

在以下情况下 `recap` 为 `null`（正常的 200 响应，非错误）：

- session 的对话轮次还少于两次，
- side-query 没有返回可提取的 `<recap>...</recap>` 内容，
- 或发生了任何底层模型错误（core 辅助函数是尽力而为的，永远不会抛出异常）。

错误：

- `400 {code: 'invalid_client_id'}` — `X-Qwen-Client-Id` 请求头格式错误。
- `404` — 未知的 session。

取消：**v1 中不支持**。该路由不监听 HTTP 客户端断开连接，没有 `AbortSignal` 被传入 bridge，并且 ACP 子进程会将 side-query 运行到完成，无论调用方是否已断开连接。唯一的限制是 bridge 的 60 秒兜底超时（`SESSION_RECAP_TIMEOUT_MS`）以及与 ACP channel 死亡的 transport-closed 竞争。这是可以接受的，因为 recap 很短（单次尝试，`maxOutputTokens: 300`，通常约 1-5 秒）；如果带宽成本合理，未来的版本可以通过基于 request-id 的 cancel ext-method 实现完整的端到端取消。

### 变更：approval, tools, init, MCP restart
Issue [#4175](https://github.com/QwenLM/qwen-code/issues/4175) Wave 4 PR 17 新增了四个变更控制路由，允许远程客户端在不接触 daemon 宿主机 CLI 的情况下更改运行时状态。这四个路由均：

- 受 PR 15 中引入的 **strict** mutation gate 控制。未配置 bearer token 的 daemon 会以 `401 {code: 'token_required'}` 拒绝请求。在启用前请先配置 `--token`（或 `QWEN_SERVER_TOKEN`）。
- 接收并记录 `X-Qwen-Client-Id` 请求头（PR 7 审计链）。当该请求头携带受信任的 id 时，daemon 会在相应的 SSE 事件中发出 `originatorClientId`，以便跨客户端 UI 能够抑制自身变更产生的回显。
- 在暴露功能前，对每个按 tag 划分的能力进行预检 (pre-flight)。旧版 daemon 会为该路由返回 `404`。

这四个路由中的三个（`tools/:name/enable`、`init`、`mcp/:server/restart`）会发出 **workspace 作用域** 的事件：每个活跃的 session SSE 总线都会收到该事件，无论触发变更时附加的是哪个 session。`approval-mode` 发出的是 **session 作用域** 的事件，因为该更改仅局限于单个 session 的 `Config`。

#### `POST /session/:id/approval-mode`

Capability tag: `session_approval_mode_control`。Bridge → ACP extMethod `qwen/control/session/approval_mode`。

更改活跃 session 的审批模式 (approval mode)。新模式会立即生效于 ACP 子进程的 per-session `Config` 中。默认情况下，设置**不会**写入磁盘——传入 `persist: true` 可同时将 `tools.approvalMode` 写入 workspace 设置。

请求：

```json
{ "mode": "auto-edit", "persist": false }
```

`mode` 必须是 `'plan' | 'default' | 'auto-edit' | 'auto' | 'yolo'` 之一（对应 core 的 `ApprovalMode` 枚举；SDK 导出了 `DAEMON_APPROVAL_MODES` 用于运行时校验）。`persist` 默认为 `false`。

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
- `403 {code: 'trust_gate', errorKind: 'auth_env_error'}` — 请求的模式需要受信任的文件夹（core 的 `Config.setApprovalMode` 会拒绝在非信任 workspace 中使用特权模式）。
- `404` — session 未知。

SSE 事件（session 作用域）：`approval_mode_changed`，携带 `{sessionId, previous, next, persisted, originatorClientId?}`。

#### `POST /workspace/tools/:name/enable`

Capability tag: `workspace_tool_toggle`。纯文件 IO——无 ACP 往返。

切换 workspace 的 `tools.disabled` 设置列表中的工具名称。列入其中的工具**完全不会被注册**（这与 `permissions.deny` 不同，后者会保留工具注册但拒绝调用）。内置工具和 MCP 发现的工具都会经过 `ToolRegistry.registerTool`，该方法会查询 disabled 集合。

> ⚠️ **名称必须与注册表暴露的标识符完全匹配。** 不会进行别名解析——该路由将路径参数中的任何字符串直接存入 `tools.disabled`，下一个 ACP 子进程在注册时会将其与 `tool.name` 进行比对。内置工具使用其规范的注册表名称（snake_case 动词形式）：`run_shell_command`、`read_file`、`write_file`、`list_directory`、`glob`、`grep_search`、`web_fetch` 等——而**不是** CLI 界面显示的标签（如 `Shell`、`Read`、`Write`）。MCP 发现的工具使用限定的 `mcp__<server>__<name>` 形式（这也是 `tool_toggled` 事件广播的形式以及 `GET /workspace/mcp` 列出的形式）。禁用 `Bash` **不会**阻止 `run_shell_command` 在下一次 session 中注册。

活跃的 ACP 子进程会保留已注册的工具——切换操作将在**下一个** ACP 子进程生成时生效。结合 `POST /workspace/mcp/:server/restart`（针对 MCP 来源的工具）或创建新 session，可使更改在当前 daemon 中生效。

接受未知的工具名称：预先禁用尚未安装的 MCP 工具是一个合理的使用场景。

请求：

```json
{ "enabled": false }
```

响应 (200)：

```json
{ "toolName": "run_shell_command", "enabled": false }
```

错误：

- `400 {code: 'invalid_tool_name'}` — 路径参数为空，或路径参数超过 256 个字符的上限。
- `400 {code: 'invalid_enabled_flag'}` — `enabled` 缺失或不是布尔值。

SSE 事件（workspace 作用域）：`tool_toggled`，携带 `{toolName, enabled, originatorClientId?}`。

#### `POST /workspace/init`

Capability tag: `workspace_init`。纯文件 IO——无 ACP 往返，**无 LLM 调用**。

在 daemon 绑定的 workspace 根目录下生成一个空的 `QWEN.md`（或在 `--memory-file-name` 覆盖下 `getCurrentGeminiMdFilename()` 返回的任何文件）。这仅是机械性操作——若需 AI 驱动的内容填充，请后续调用 `POST /session/:id/prompt`。

默认情况下，如果目标文件存在且包含非空白内容，则拒绝覆盖。仅包含空白字符的文件被视为不存在（与本地 `/init` 斜杠命令行为一致）。

请求：

```json
{ "force": false }
```

响应 (200)：

```json
{ "path": "/work/bound/QWEN.md", "action": "created" }
```

`action` 在全新创建时为 `'created'`，在保留现有仅含空白字符的文件（未执行写入）时为 `'noop'`，在 `force: true` 替换非空内容时为 `'overwrote'`。`workspace_initialized` SSE 事件会镜像响应中的 action——观察者可以过滤 `action !== 'noop'` 以仅对实际的磁盘更改做出反应。

错误：

- `400 {code: 'invalid_force_flag'}` — `force` 不是布尔值。
- `409 {code: 'workspace_init_conflict', path, existingSize}` — 文件存在且包含非空白内容，且 `force` 被省略或为 false。响应体包含绝对路径和大小（字节），以便 SDK 客户端无需重新 stat 即可渲染“是否覆盖 N 字节？”的提示。

SSE 事件（workspace 作用域）：`workspace_initialized`，携带 `{path, action, originatorClientId?}`。

#### `POST /workspace/mcp/:server/restart`

Capability tag: `workspace_mcp_restart`。Bridge → ACP extMethod `qwen/control/workspace/mcp/restart`。

通过 ACP 子进程的 `McpClientManager.discoverMcpToolsForServer`（断开连接 + 重新连接 + 重新发现）重启已配置的 MCP server。会预检 PR 14 v1 记账机制中的实时预算快照，因此在预算饱和的 workspace 上重启会返回软拒绝，而不是触发 `BudgetExhaustedError` 级联错误。

请求体为空（`{}`）。路径参数为 `mcpServers` 配置中出现的 URL 编码后的 server 名称。

响应 (200) — 基于 `restarted` 的判别联合类型：

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

| `reason`                | 含义                                                                                                                                                                               |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `'in_flight'`           | 该 server 的另一个发现/重启操作已在进行中。该路由会立即返回，而不是等待原始 promise。调用方应在短暂延迟后重试。 |
| `'disabled'`            | Server 已配置但列在 `excludedMcpServers` 中。请在重启前重新启用。                                                                                                    |
| `'budget_would_exceed'` | Daemon 处于 `--mcp-budget-mode=enforce` 模式，目标 server 当前不在 `reservedSlots` 中，且实时总数已达到 `clientBudget`。调用方应先释放一个 slot。         |

错误（非 2xx）：

- `400 {code: 'invalid_server_name'}` — 路径参数为空。
- `404` — server 名称不在 `mcpServers` 配置中，或不存在活跃的 ACP 通道（重启本质上需要活跃的 `McpClientManager` 实例）。
- `500` — 内部错误（例如 `ToolRegistry` 未初始化）。

SSE 事件（workspace 作用域）：成功时发出 `mcp_server_restarted`，携带 `{serverName, durationMs, originatorClientId?}`；软跳过时发出 `mcp_server_restart_refused`，携带 `{serverName, reason, originatorClientId?}`。

### `GET /session/:id/events` (SSE)

订阅 session 的事件流。

请求头：

```
Accept: text/event-stream
Last-Event-ID: 42        ← 可选，从 id 42 之后开始重放
```

查询参数：

| 参数       | 必填 | 说明                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ----------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `maxQueued` | 否       | 每个订阅者的**实时帧积压**上限。范围 `[16, 2048]`，默认 256。订阅时强制推送的重放帧不受帧和字节上限限制；实际消耗上限的是在订阅者仍在排空大型 `Last-Event-ID: 0` 重放时到达的实时事件。对于冷重连，请调高此值，以免实时尾部在消费者追上之前触发慢客户端警告/驱逐。实时序列化字节上限在 daemon 侧是固定的（默认 2 MiB），且没有查询参数。超出范围/非十进制/存在但为空的值会在 SSE 握手打开前返回 `400 invalid_max_queued`。预检 `caps.features.slow_client_warning`——旧版 daemon 会静默忽略该参数。 |

帧格式。`data:` 行是**完整的事件信封 (envelope)**，JSON 序列化在单行上——`{id?, v, type, data, originatorClientId?}`。ACP 特定的负载（`sessionUpdate`、`requestPermission` 参数等）位于信封的 `data` 字段下；信封自身的 `type` 与 SSE 的 `event:` 行匹配。

```
id: 7
event: session_update
data: {"id":7,"v":1,"type":"session_update","data":{"sessionUpdate":"agent_message_chunk","content":{"type":"text","text":"…"}}}

id: 8
event: permission_request
data: {"id":8,"v":1,"type":"permission_request","data":{"requestId":"<uuid>","sessionId":"<sid>","toolCall":{...},"options":[...]}}

: heartbeat              ← 每 15s 一次，无 payload

event: client_evicted    ← 终止帧，无 id（合成）
data: {"v":1,"type":"client_evicted","data":{"reason":"queue_overflow","droppedAfter":42,"queueSize":256,"maxQueued":256,"queuedBytes":1800000,"maxQueuedBytes":2097152}}

event: client_evicted    ← 字节溢出的终止帧，无 id（合成）
data: {"v":1,"type":"client_evicted","data":{"reason":"queue_bytes_overflow","droppedAfter":43,"queueSize":1,"maxQueued":256,"queuedBytes":1900000,"maxQueuedBytes":2097152,"eventBytes":300000}}
```

SSE 级别的 `id:` / `event:` 行复制了 `envelope.id` / `envelope.type`，以兼容 EventSource。原生 `fetch` 消费者（如 SDK 的 `parseSseStream`）直接从 JSON 信封中读取所有内容，并忽略 SSE 前导行。
| 事件类型                  | 触发条件                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `session_update`          | 任何 ACP `sessionUpdate` 通知（LLM 分块、工具调用、使用情况）                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `permission_request`      | Agent 请求工具授权                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `permission_resolved`     | 某个客户端通过 `POST /permission/:requestId` 对权限进行了投票                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `permission_partial_vote` | （仅限 consensus）已记录投票但尚未达到法定票数。携带 `{requestId, sessionId, votesReceived, votesNeeded, quorum, optionTallies}`。预检 `caps.features.permission_mediation`。                                                                                                                                                                                                                                                                                                          |
| `permission_forbidden`    | 投票被当前策略拒绝（`designated` 不匹配、`local-only` 非环回地址，或 `consensus` 投票者不在快照中）。携带 `{requestId, sessionId, clientId?, reason}`。预检 `caps.features.permission_mediation`。                                                                                                                                                                                                                                                                                           |
| `model_switched`          | `POST /session/:id/model` 成功                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `model_switch_failed`     | `POST /session/:id/model` 被拒绝                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `session_died`            | Agent 子进程意外崩溃。**终态：SSE 流在此帧之后关闭；该 session 将从 `byId` 中移除。** 订阅者应通过 `POST /session` 重新连接以生成一个新的 session。                                                                                                                                                                                                                                                                                                                                    |
| `slow_client_warning`     | 订阅者本地：实时帧积压或实时序列化字节积压 ≥ 75% 满。**非终态** — 流继续运行；此警告是在驱逐前发出的提醒。携带 `{queueSize, maxQueued, lastEventId, queuedBytes?, maxQueuedBytes?, threshold?}`，其中 `threshold` 为 `frames`、`bytes` 或 `frames_and_bytes`。每次溢出事件仅触发一次；当两项指标均降至 37.5% 以下时重新激活。无 `id`（合成帧）。预检 `caps.features.slow_client_warning`。 |
| `client_evicted`          | 订阅者本地：队列溢出。对于实时帧上限，`reason` 为 `queue_overflow`；对于实时序列化字节上限，`reason` 为 `queue_bytes_overflow`。**终态：SSE 流在此帧之后关闭**（无 `id` — 合成帧）。同一 session 的其他订阅者继续运行。                                                                                                                                                                                                                                                                    |
| `stream_error`            | 扇出期间的 Daemon 端错误。**终态：SSE 流在此帧之后关闭**（无 `id` — 合成帧）。                                                                                                                                                                                                                                                                                                                                                                                                         |

重连语义：

- 发送 `Last-Event-ID: <n>` 以从每个 session 的 ring 中重放 `id > n` 的事件（默认深度 **8000**，可通过 `qwen serve --event-ring-size <n>` 调整）
- **间隙检测（客户端侧）：** 如果 `<n>` 早于 ring 中仍保留的最早事件（例如，你使用 `Last-Event-ID: 50` 重连，但 ring 现在包含 200–1199），daemon 将从最早可用的事件开始重放，且不会抛出异常。将第一个重放事件的 `id` 与 `n + 1` 进行比较；任何差异即为丢失窗口的大小。Stage 2 将在 daemon 端注入显式的 `stream_gap` 合成帧；在 Stage 1 中，检测是客户端的责任。
- ID 在每个 session 内是单调递增的，从 1 开始
- 合成帧（`client_evicted`、`slow_client_warning`、`stream_error`）故意省略 `id`，以免为其他订阅者消耗序列槽位

背压（Backpressure）：

- 每个订阅者的队列默认限制为 `maxQueued: 256` 个实时项，加上 daemon 拥有的 2 MiB 实时序列化字节上限。重连期间的重放帧、`slow_client_warning` 和 `client_evicted` 会绕过这两个上限。
- 仅通过 SSE 请求上的 `?maxQueued=N`（范围 `[16, 2048]`）覆盖帧上限。故意不提供 `?maxQueuedBytes`；客户端无法提高 daemon 的内存预算。
- 当订阅者的实时帧积压或实时字节积压超过 75% 时，总线会向该订阅者强制推送一个 `slow_client_warning` 合成帧（每次溢出事件仅推送一次；当两项指标均降至 37.5% 以下时重新激活）。流保持打开 — 此警告是一个提醒，以便客户端可以更快地排空队列或干净地断开并重新连接。
- 如果实时帧上限溢出，总线会发出 `client_evicted`，`reason` 为 `"queue_overflow"`。如果实时字节上限溢出，则发出 `reason` 为 `"queue_bytes_overflow"`。在这两种情况下，终态帧都会被强制推送，并且订阅关闭。

### `POST /permission/:requestId`

对挂起的 `permission_request` 进行投票。当前生效的**调解策略（mediation policy）** 决定谁获胜：

| 策略                        | 行为                                                                                                                                                                                              |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `first-responder`（默认）   | 任何经过验证的投票者获胜；后续投票者收到 `404`。F3 之前的基线。                                                                                                                                    |
| `designated`                | 仅提示词发起者（`originatorClientId`）可以决定；非发起者收到 `403 permission_forbidden / designated_mismatch`。对于匿名提示词，回退到 first-responder。                 |
| `consensus`                 | N/M 的投票者必须达成一致（默认 `N = floor(M/2) + 1`，可通过 `policy.consensusQuorum` 覆盖）。第一个达到 `N` 票的选项获胜。未决出结果的投票会收到 `200` + `permission_partial_vote` SSE 帧。 |
| `local-only`                | 仅环回地址（loopback）投票者可以决定；远程调用者收到 `403 permission_forbidden / remote_not_allowed`。                                                                                                      |

当前生效的策略在 `settings.json` 中的 `policy.permissionStrategy` 下配置，并在 `/capabilities` 的 `body.policy.permission` 中暴露。预检 `caps.features.permission_mediation`（包含 `modes: [...]`）以获取构建支持的集合。

> **F3 (#4175)：多客户端权限协调。** F3 添加了上述四种策略。F3 之前的 daemon 硬编码了 first-responder；当配置的策略为 `first-responder` 时，线路格式保持逐位不变。新事件（`permission_partial_vote`、`permission_forbidden`）是增量添加的 — 旧 SDK 会将它们视为 `unrecognized_known_event` 并优雅地忽略。

> **权限超时（默认 5 分钟）。** `permission_request`
> 保持挂起状态，直到：(a) 某个客户端在此处投票，(b) 触发 `POST /session/:id/cancel`
> 触发，(c) 驱动提示词的 HTTP 客户端断开连接
> （中途取消会将未决的权限解析为 `cancelled`），
> (d) session 被终止，(e) daemon 关闭，**或
> (f) 触发每个 session 的权限超时**（`DEFAULT_PERMISSION_TIMEOUT_MS`，
> 5 分钟）。超时触发时，agent 的 `requestPermission` 解析
> 为 `{outcome: 'cancelled'}`，审计 ring 记录一条
> `permission.timeout` 条目，daemon stderr 输出一行
> 提示信息，并且 SSE 总线扇出标准的
> `permission_resolved` cancelled 帧，以便订阅者进行清理。
> 超时时间可通过 `BridgeOptions.permissionResponseTimeoutMs` 配置；
> 运行长提示词的无头调用者可能需要延长此时间。

请求：

```json
{
  "outcome": {
    "outcome": "selected",
    "optionId": "proceed_once"
  }
}
```

结果（Outcomes）：

- `{ "outcome": "selected", "optionId": "<one-of-the-options>" }` — 根据 agent 提供的选项，接受 / 拒绝 / 仅执行一次等
- `{ "outcome": "cancelled" }` — 丢弃请求（与内部 `cancelSession` / `shutdown` 的行为一致）

响应：

- `200 {}` — 你的投票被接受（已解析或在 consensus 法定票数下被记录）
- `403 { "code": "permission_forbidden", "reason": "designated_mismatch" | "remote_not_allowed", "requestId", "sessionId" }` — F3：当前生效的策略拒绝了你的投票
- `404 { "error": "..." }` — requestId 未知（已解析、从未存在或 session 已销毁）
- `500 { "code": "cancel_sentinel_collision", ... }` — F3：agent 的 `allowedOptionIds` 包含保留的哨兵值 `'__cancelled__'`；agent / daemon 契约违规
- `501 { "code": "permission_policy_not_implemented", "policy": "<name>" }` — F3 向前兼容：策略字面量已落入 schema，但其调解器分支尚未构建（目前无法到达；为未来策略保留）
投票成功后，每个已连接的客户端都会看到带有相同 `requestId` 和所选 `outcome` 的 `permission_resolved`。在 `consensus` 模式下，中间投票还会额外广播 `permission_partial_vote`，直到达到法定人数（quorum）。

### Auth device-flow 路由 (issue #4175 PR 21)

守护进程代理 OAuth 2.0 Device Authorization Grant (RFC 8628) 流程，使得远程 SDK 客户端可以触发登录，且生成的 token 会保存在**守护进程**的文件系统上，而不是客户端上。守护进程自身会轮询 IdP；客户端的唯一任务是显示验证 URL + user code，并（可选）订阅 SSE 以获取完成事件。

Capability tag: `auth_device_flow`（始终广播）。v1 中支持的 provider：`qwen-oauth`。

> [!note]
>
> Qwen OAuth 免费套餐已于 2026-04-15 停止服务。在本协议中，请将 `qwen-oauth` 视为
> 遗留的 v1 provider 标识符；新客户端应优先使用当前受支持的 auth provider（如果有的话）。

**运行时局部性。** 守护进程永远不会启动浏览器——即使它有能力这么做。由客户端决定是否在本地调用 `open(verificationUri)`；在无头 pod 上（典型的 Mode B 部署），用户会在他们拥有浏览器的任何设备上打开该 URL。推荐的 UX 请参阅 `docs/users/qwen-serve.md`。

**事件中无 token 泄露。** `auth_device_flow_started` 仅携带 `{deviceFlowId, providerId, expiresAt}`。user code 和验证 URL 通过 POST 201 响应体和 `GET /workspace/auth/device-flow/:id` 点对点返回；它们永远不会在 SSE 上广播。

**每个 provider 单例。** 当 flow 处于 pending 状态时，对同一 provider 发起第二次 `POST` 是一种幂等的接管操作——它会返回带有 `attached: true` 的现有条目，而不是发起新的 IdP 请求。

#### `POST /workspace/auth/device-flow`

严格的变更门控：即使在无 token 的 loopback 默认配置下也需要 bearer token（`401 token_required`）。

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

- `400 unsupported_provider` — 未知的 `providerId`（响应中包含 `supportedProviders`）
- `409 too_many_active_flows` — 已达到 workspace 上限 (4)；使用 `DELETE` 取消其中一个
- `401 token_required` — 严格门控拒绝了无 token 的请求
- `502 upstream_error` — IdP 返回了意外错误

#### `GET /workspace/auth/device-flow/:id`

读取当前状态。Pending 条目会回显 `userCode/verificationUri/expiresAt/intervalMs`；terminal 条目（5 分钟宽限期后）会丢弃这些字段，并展示 `status` + 可选的 `errorKind/hint`。

对于未知的 id 和宽限期后被驱逐的条目，返回 `404 device_flow_not_found`。

#### `DELETE /workspace/auth/device-flow/:id`

幂等取消：

- pending 条目 → `204` + 触发 `auth_device_flow_cancelled`
- terminal 条目 → `204` 无操作（不重新触发事件）
- 未知 id → `404`

#### `GET /workspace/auth/status`

pending flows + 支持的 providers 的快照：

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

五种类型的事件（workspace 作用域，广播到每个活跃的 session bus）：

- `auth_device_flow_started` `{deviceFlowId, providerId, expiresAt}` — POST 成功；SDK 应进行订阅（此处无 userCode，如需获取请通过 GET 请求）
- `auth_device_flow_throttled` `{deviceFlowId, intervalMs}` — 守护进程遵从了上游的 `slow_down`；轮询 GET 的客户端应将其轮询间隔增加到与之匹配
- `auth_device_flow_authorized` `{deviceFlowId, providerId, expiresAt?, accountAlias?}` — 凭证已持久化；`accountAlias` 是非 PII 标签（绝不会是 email/phone）
- `auth_device_flow_failed` `{deviceFlowId, errorKind, hint?}` — terminal 状态；`errorKind` 为 `expired_token | access_denied | invalid_grant | upstream_error | persist_failed` 之一。`persist_failed` 是守护进程内部错误：IdP 交换成功，但守护进程无法持久存储凭证（EACCES / EROFS / ENOSPC）。用户应在底层磁盘问题修复后重试。
- `auth_device_flow_cancelled` `{deviceFlowId}` — 针对 pending 条目的 DELETE 成功

> **不兼容 MCP。** MCP 授权规范 (2025-06-18) 强制要求使用带有重定向回调的 OAuth 2.1 + PKCE auth-code，这不适用于无头 pod 守护进程。Mode B 的 device-flow 接口是守护进程私有的——针对兼容 MCP 的服务器的客户端应使用不同的 auth 路径。

## 流式传输线路格式

事件以标准 EventSource 帧的形式发出。守护进程为每帧写入一行 `data:`（JSON 在 `JSON.stringify` 后没有嵌入的换行符）；位于 `packages/sdk-typescript/src/daemon/sse.ts` 的 SDK 解析器在接收端同时处理这种格式和规范允许的多行 `data:` 格式。

## 流式传输期间的错误帧

如果 bridge 迭代器在为 SSE 订阅者提供服务时抛出异常，守护进程会发出一个 terminal `stream_error` 帧（无 `id`）。`data:` 行是完整的 envelope（与本文档中其他所有 SSE 帧的形状相同）；实际的错误信息位于 `envelope.data.error` 下：

```
event: stream_error
data: {"v":1,"type":"stream_error","data":{"error":"<message>"}}
```

随后连接将关闭。

## 环境变量

| 变量                | 用途                                                         |
| ------------------- | ------------------------------------------------------------ |
| `QWEN_SERVER_TOKEN` | Bearer token。在启动时去除前导/尾随空白字符。                |

## 源码布局

| 路径                                                 | 用途                                                                                                       |
| ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `packages/cli/src/commands/serve.ts`                 | yargs 命令 + flag schema                                                                                   |
| `packages/cli/src/serve/run-qwen-serve.ts`           | listener 生命周期 + 信号处理                                                                               |
| `packages/cli/src/serve/server.ts`                   | Express 应用组装、中间件排序以及剩余的直接路由                                                             |
| `packages/cli/src/serve/routes/*.ts`                 | 专注的 Express 路由组，包括 session、SSE、workspace auth、workspace status 和 file 路由                    |
| `packages/cli/src/serve/auth.ts`                     | bearer + Host 白名单 + CORS 拒绝                                                                         |
| `packages/cli/src/serve/acp-session-bridge.ts`       | 用于 spawn-or-attach、per-session FIFO 和 permission 注册表的 CLI 本地 bridge 兼容性 facade                |
| `packages/acp-bridge/src/status.ts`                  | 只读守护进程状态 wire types + `ServeErrorKind` + `BridgeTimeoutError` + `mapDomainErrorToErrorKind`         |
| `packages/cli/src/serve/env-snapshot.ts`             | 纯辅助函数，从 `process.*` 状态构建 `/workspace/env` 载荷，包括凭证脱敏                                    |
| `packages/acp-bridge/src/eventBus.ts`                | 有界异步队列 + 重放环                                                                                      |
| `packages/sdk-typescript/src/daemon/DaemonClient.ts` | TS 客户端                                                                                                  |
| `packages/sdk-typescript/src/daemon/sse.ts`          | EventSource 帧解析器                                                                                       |
| `integration-tests/cli/qwen-serve-routes.test.ts`    | 18 个用例，无 LLM                                                                                          |
| `integration-tests/cli/qwen-serve-streaming.test.ts` | 3 个用例，由本地 fake OpenAI server 支持的真实 `qwen --acp` 子进程（仅限 POSIX；在 Windows 上跳过）        |