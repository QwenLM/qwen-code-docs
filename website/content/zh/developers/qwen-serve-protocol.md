# `qwen serve` HTTP 协议参考

[qwen-code 守护进程设计](https://github.com/QwenLM/qwen-code/issues/3803) 第一阶段。所有路由均位于守护进程基础 URL 下（默认 `http://127.0.0.1:4170`）。

## Authentication

当守护进程以 `--token` 或 `QWEN_SERVER_TOKEN` 启动时，**除回环绑定上的 `/health` 外，每个路由**都必须携带：

```
Authorization: Bearer <token>
```

未配置 token 时（回环开发默认），该请求头为可选。Token 比对采用恒定时间算法。`missing header` / `wrong scheme` / `wrong token` 三种情况的 401 响应格式统一。

**`/health` 豁免**（Bctum）：在回环绑定（`127.0.0.1` / `localhost` / `::1` / `[::1]`）上，`/health` 在 bearer 中间件之前注册，因此 Pod 内部的存活探针无需携带 token，即使守护进程以 `--token` 启动亦然。非回环绑定（`--hostname 0.0.0.0` 等）与其他路由一样，`/health` 也受 bearer 保护——详见 [`GET /health`](#get-health) 章节中的说明。

**`--require-auth`（#4175 PR 15）。** 启动时传入此标志，可将"必须持有 token"的规则扩展至回环连接。未提供 token 时启动失败；`/health` 豁免同时被取消（即 `/health` 也需要 `Authorization: Bearer …`）。

启用该标志后，全局 `bearerAuth` 中间件会拦截**所有**路由，包括 `/capabilities`。因此**未认证**的客户端无法通过预检 `caps.features` 来发现认证要求：该场景下的发现入口是 **401 响应体**本身（依据 [Authentication](#authentication) 章节，所有路由响应格式统一）。`require_auth` 能力标签是**认证后的确认信息**——客户端成功认证并读取 `/capabilities` 后，该标签的存在表明守护进程以 `--require-auth` 启动（适用于审计/合规 UI，以及需要在设置面板中显示"此部署已加固"的 SDK 客户端）。选择启用每路由严格模式的变更路由（Wave 4 后续跟进）在无 token 的回环默认情况下被访问时，会以 `401 { code: "token_required", error: "…" }` 拒绝——但启用 `--require-auth` 后，全局 bearer 中间件会在每路由门控之前短路请求，因此未认证调用者实际看到的是旧版 `Unauthorized` 响应体。

**`--allow-origin <pattern>`（T2.4 [#4514](https://github.com/QwenLM/qwen-code/issues/4514)）。** 浏览器 webui 跨域访问守护进程默认被拦截——携带 `Origin` 请求头的任何请求都会返回 `403 {"error":"Request denied by CORS policy"}`，因为 CLI/SDK 客户端从不发送 `Origin`，守护进程将其视为请求来自运营商未选择接入的浏览器上下文的标志。启动时传入 `--allow-origin <pattern>`（可重复）来使用允许列表替代墙。每个 pattern 为以下之一：

- 字面量 `*`——允许任意 origin。**存在风险**：若配置了 `*` 但未设置 bearer token（来源包括 `--token`、`QWEN_SERVER_TOKEN` 或要求启动时必须有 token 的 `--require-auth`），启动会被拒绝。允许列表中含 `*` 时，启动面包屑会向 stderr 输出警告。**建议**：在回环绑定上与 `--require-auth` 配合使用，以便 `/health` 和 `/demo` 也受 bearer 保护——默认情况下在回环上，它们在 bearer 中间件之前注册（以便 k8s/Compose 探针无需 token 即可访问 `/health`），而 `*` 允许列表会使它们可从任意跨域浏览器访问。在非回环绑定上，启动时已强制要求 bearer，因此 `*` 的暴露面仅有 `/health`（状态 JSON）和 `/demo`（一个静态页面，其 JS 仍调用受 token 保护的路由）——实际 API 面无论如何都受到保护。
- 规范 URL origin——`<scheme>://<host>[:<port>]`。**不带尾部斜线、路径、用户信息或查询参数。** 若条目未通过 `new URL(pattern).origin === pattern` 的往返验证，启动会以 `InvalidAllowOriginPatternError` 拒绝；错误信息会指明错误 pattern 及规范形式。设计上刻意严格：静默归一化（例如去掉尾部 `/`）会让拼写错误悄然通过并接受有歧义的输入。

匹配的 origin 在每个请求上收到标准 CORS 响应头：

```
Access-Control-Allow-Origin: <echoed origin>
Vary: Origin
Access-Control-Allow-Methods: GET, POST, PATCH, DELETE, OPTIONS
Access-Control-Allow-Headers: Authorization, Content-Type, X-Qwen-Client-Id, Last-Event-ID
Access-Control-Max-Age: 86400
Access-Control-Expose-Headers: Retry-After
```

`Access-Control-Allow-Origin` 原样回显请求的 origin（保留浏览器发送时的大小写），而非字面量 `*`——即使在 `*` 模式下也如此。浏览器缓存会以其与 `Vary: Origin` 配对作为响应的 key，且回显方式为后续版本在不更改 schema 的情况下添加 `Access-Control-Allow-Credentials` 留有余地。`Access-Control-Expose-Headers: Retry-After` 使浏览器 webui 能够遵守守护进程在 `429` / `503` 响应中的重试提示。**今日不发送** `Access-Control-Allow-Credentials`：守护进程通过 bearer-in-`Authorization` 进行认证，无需 `credentials: 'include'` 即可跨域工作。

OPTIONS 预检请求（携带 `Access-Control-Request-Method` 或 `Access-Control-Request-Headers` 的 OPTIONS）会以 `204 No Content` 加上述请求头短路。这是标准 CORS 模式且安全——预检仅确认守护进程接受哪些方法/请求头；后续实际请求仍会执行完整链路（主机允许列表 → bearer 认证 → 路由），因此防 DNS 重绑定和 bearer 强制在任何状态读取或变更之前依然生效。来自匹配 origin 的普通 OPTIONS 请求继续流向下游并附加 CORS 请求头。

不匹配允许列表的 origin 仍收到 `403 {"error":"Request denied by CORS policy"}`——与默认墙的响应格式相同，因此已解析墙响应的客户端无需针对启用了允许列表的守护进程做特殊处理。拒绝路径**不会**输出任何 `Access-Control-*` 请求头（浏览器会忽略它们，且输出会通过请求头的存在间接暴露允许列表大小）。

配置的 pattern 列表有意**不**在 `/capabilities` 中回显——浏览器 webui 已知自己的 origin（毕竟它调用了守护进程），而暴露列表会让未认证的 `/capabilities` 读取者枚举出所有受信 origin（对配置有误的部署极具价值的侦察信息）。SDK 客户端通过 `caps.features.allow_origin` 标签来判断"此守护进程支持跨域浏览器访问"，无需知道具体哪些 origin。

回环自身 origin 请求（例如 `/demo` 页面调用同一 `127.0.0.1:port` 的守护进程）由一个**独立的** Origin 剥离 shim 处理，该 shim 在 CORS 中间件之前运行，并为 `127.0.0.1:port` / `localhost:port` / `[::1]:port` / `host.docker.internal:port` 移除 `Origin` 请求头。因此它们无论 `--allow-origin` 配置如何都能通过——运营商无需将守护进程自身的端口加入列表来使演示页面正常工作。

## 通用错误格式

5xx 响应在存在时携带原始错误的 `code` 和 `data`（JSON-RPC 风格——ACP SDK 从 agent 转发 `{code, message, data}`）：

```json
{
  "error": "Internal error",
  "code": -32000,
  "data": { "reason": "model quota exceeded" }
}
```

请求体中 JSON 格式错误时返回：

```json
{ "error": "Invalid JSON in request body" }
```

状态码为 `400`。

未知 session id 触发 `SessionNotFoundError` 时返回：

```json
{ "error": "No session with id \"<sid>\"", "sessionId": "<sid>" }
```

状态码为 `404`。

`POST /session` 的 `cwd` 无法规范化到守护进程绑定的工作区时（#3803 §02——1 个守护进程 = 1 个工作区），触发 `WorkspaceMismatchError`，返回 `400` 及：

```json
{
  "error": "Workspace mismatch: daemon is bound to \"…\" but request asked for \"…\". …",
  "code": "workspace_mismatch",
  "boundWorkspace": "/path/the/daemon/binds",
  "requestedWorkspace": "/path/in/the/request"
}
```

使用此错误进行预飞检测：从 `/capabilities` 读取 `workspaceCwd`，并在 `POST /session` 中省略 `cwd`（将回退到绑定的工作区），或将请求路由到绑定了 `requestedWorkspace` 的守护进程。

`POST /session` 超过守护进程 `--max-sessions` 上限时，返回 `503` 及 `Retry-After: 5` 请求头和：

```json
{
  "error": "Session limit reached (20)",
  "code": "session_limit_exceeded",
  "limit": 20
}
```

连接到已有 session 不计入上限，因此已满载的守护进程上空闲 session 的重连依然有效。

`RestoreInProgressError`——仅由 `POST /session/:id/load` 和 `POST /session/:id/resume` 触发——返回 `409` 及 `Retry-After: 5` 请求头（与 `session_limit_exceeded` 一致）和：

```json
{
  "error": "Session \"<sid>\" is already being restored via session/<resume|load>; retry session/<load|resume> after it completes",
  "code": "restore_in_progress",
  "sessionId": "<sid>",
  "activeAction": "load",
  "requestedAction": "resume"
}
```

当某个 id 已有 `session/resume` 进行中时又发起 `session/load`（或反之）时触发。等待至少 `Retry-After` 秒后重试——底层恢复会在 `initTimeoutMs`（默认 10 秒）内完成。相同动作的竞态（`load` vs `load`、`resume` vs `resume`）会合并处理而非报错。

## Capabilities

守护进程从 serve capability 注册表中广播其支持的特性标签。客户端**必须**根据 `features` 控制 UI，而非根据 `mode`（依据设计 §10）。

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
 'session_lsp',
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

> 条件标签仅在对应的部署开关启用时出现（见下表）。F3 的 `permission_mediation` 标签始终开启，并携带 `modes: ['first-responder', 'designated', 'consensus', 'local-only']`，供 SDK 客户端自省构建支持的策略集；运行时激活的策略位于 `body.policy.permission`。

`session_scope_override` 是 `POST /session` 上每请求 `sessionScope` 字段的协商句柄（见下文）。旧版 daemon 会静默忽略该字段，因此 SDK 客户端在发送前应预检 `caps.features` 中是否存在此标签。

`session_load` 和 `session_resume` 声明显式恢复路由（`POST /session/:id/load` 和 `POST /session/:id/resume`）。旧版 daemon 对这些路径返回 `404`，因此 SDK 客户端在调用前应预检 `caps.features`。`unstable_session_resume` 仍作为已废弃的别名进行声明，以兼容底层 ACP 方法还叫 `connection.unstable_resumeSession` 时发布的 SDK；新客户端应以 `session_resume` 为准。

`slow_client_warning` 涵盖 #4175 Wave 2.5 PR 10 引入的两个协同发布的 SSE 背压旋钮：(a) 当某订阅者队列超过 75% 满时，daemon 会发出一个 `slow_client_warning` 合成事件流帧，每次溢出事件仅发一次（队列降至 37.5% 以下后重置）；(b) `GET /session/:id/events` 接受 `?maxQueued=N` 查询参数（范围 `[16, 2048]`），用于在对大型回放环进行冷重连时预设每个订阅者的积压大小。daemon 级别的环大小由 `--event-ring-size` 控制（默认 **8000**，见 #3803 §02）。旧版 daemon 静默缺少上述两者——在启用前请预检此标签。

`typed_event_schema` 声明 daemon 事件载荷与 SDK 的 `KnownDaemonEvent` schema 匹配。旧版 daemon 仍可能流式传输兼容帧，但 SDK 客户端在假定具有类型化事件覆盖之前应预检此标签。

`client_heartbeat` 声明 `POST /session/:id/heartbeat`。旧版 daemon 返回 `404`；在发送周期性心跳之前请预检此标签。

`session_close` 和 `session_metadata` 声明 `DELETE /session/:id` 和 `PATCH /session/:id/metadata`。旧版 daemon 返回 `404`；在暴露关闭或重命名功能之前请预检这些标签。

`session_lsp` 声明 `GET /session/:id/lsp`，即供 daemon 客户端使用的只读结构化 LSP 状态快照。旧版 daemon 返回 `404`；在暴露远程 LSP 状态之前请预检此标签。

`session_approval_mode_control`、`workspace_tool_toggle`、`workspace_init` 和 `workspace_mcp_restart`（issue [#4175](https://github.com/QwenLM/qwen-code/issues/4175) PR 17）声明下文"变更操作：审批、工具、初始化、MCP 重启"中记录的四条变更控制路由。这四条路由均受 PR 15 变更门控的严格限制（未配置 bearer token 的 daemon 会以 401 `token_required` 拒绝请求）。旧版 daemon 返回 `404`；在暴露对应功能之前请预检各标签。

`mcp_guardrails`（issue [#4175](https://github.com/QwenLM/qwen-code/issues/4175) PR 14）涵盖 MCP 预算接口：`GET /workspace/mcp` 上的 `clientCount` / `clientBudget` / `budgetMode` / `budgets[]` 字段、每个服务器单元上的 `disabledReason` 字段，以及 `--mcp-client-budget` / `--mcp-budget-mode` CLI 标志。旧版 daemon 会完全省略新字段；SDK 客户端在依赖 `budgets[]` 语义之前请预检此标签。注册表描述符还携带 `modes: ['warn', 'enforce']` 以供未来功能模式暴露——目前客户端通过快照的 `budgetMode` 字段推断模式。`enforce` 模式下的服务器拒绝按 `Object.entries(mcpServers)` 声明顺序确定性执行；如果 qwen-code 未来采用作用域优先级层，则会改为"最低优先级优先"，以镜像 claude-code 的 `plugin < user < project < local` 约定。

> ⚠️ **PR 14 v1 范围：每会话，而非每工作区。** daemon 内的每个 ACP 会话都会构建自己的 `Config` + `McpClientManager`（通过 `acpAgent.newSessionConfig`）。预算上限适用于**每会话**的活跃 MCP 客户端；每个会话独立从转发的环境变量中读取 `QWEN_SERVE_MCP_CLIENT_BUDGET`。在 `--mcp-client-budget=10` 且有 5 个并发 ACP 会话的情况下，daemon 中实际活跃的 MCP 客户端总数可达 5 × 10 = 50。`GET /workspace/mcp` 快照仅读取**引导会话的** `McpClientManager` 统计数据——`budgets[0].scope: 'session'` 值是诚实的信号，表明这是每会话统计，而非聚合数据。**Wave 5 PR 23（共享 MCP 池）**将引入工作区范围的管理器，并在每会话单元旁边添加 `scope: 'workspace'` 单元，实现真正的跨会话聚合。v1 是 PR 23 构建所依赖的进程内计数器与软执行基础。

`workspace_file_read` 涵盖文本/列表/统计/通配工作区文件路由
（`GET /file`、`GET /list`、`GET /glob`、`GET /stat`）。`workspace_file_bytes`
涵盖 `GET /file/bytes`，该路由后续添加，以便客户端能够针对 PR19 时代的 daemon 预检原始
字节窗口支持。`workspace_file_write` 涵盖
哈希感知的文本变更路由（`POST /file/write`、`POST /file/edit`）。
写入标签表示路由契约存在；并不意味着当前
部署对匿名变更开放。写入/编辑是严格的变更
路由，即使在回环上也需要配置的 bearer token。

`daemon_status` 声明 `GET /daemon/status`，即下文记录的整合只读
运营者诊断快照。

**条件标签。** 少量功能标签仅在对应的部署开关启用时才会声明。标签存在 = 行为已开启；不存在 = 旧版 daemon（早于该标签）或当前 daemon 中运营者未启用。当前条件标签如下：

| 标签                        | 声明条件 …                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `require_auth`             | daemon 以 `--require-auth`（或通过嵌入式 API 的 `requireAuth: true`）启动。每条路由（包括回环绑定上的 `/health`）均强制要求 bearer token。                                                                                                                                                                                                                                                                                                                                                                    |
| `mcp_workspace_pool`       | 共享 MCP 传输池已激活。当 `QWEN_SERVE_NO_MCP_POOL=1` 禁用池时省略。                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `mcp_pool_restart`         | 共享 MCP 传输池已激活；重启响应可能包含池感知的多条目形状。                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `allow_origin`             | T2.4（[#4514](https://github.com/QwenLM/qwen-code/issues/4514)）。daemon 以至少一个 `--allow-origin <pattern>`（或通过嵌入式 API 的 `allowOrigins: [...]`）启动。来自匹配来源的跨域请求会收到正确的 CORS 响应头；不匹配的来源仍获得默认的 403。配置的模式列表有意不在 `/capabilities` 中回显，以避免向未认证的读者泄露受信任来源集——浏览器 webui 已知悉自身来源。 |
| `prompt_absolute_deadline` | `--prompt-deadline-ms` / `QWEN_SERVE_PROMPT_DEADLINE_MS` / `ServeOptions.promptDeadlineMs` 被设置为正整数。                                                                                                                                                                                                                                                                                                                                                                                                        |
| `writer_idle_timeout`      | `--writer-idle-timeout-ms` / `QWEN_SERVE_WRITER_IDLE_TIMEOUT_MS` / `ServeOptions.writerIdleTimeoutMs` 被设置为正整数。                                                                                                                                                                                                                                                                                                                                                                                             |
| `workspace_settings`       | daemon 创建时具有可用的配置持久化。                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `session_shell_command`    | 会话 shell 执行已显式启用。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `rate_limit`               | `--rate-limit` / `QWEN_SERVE_RATE_LIMIT=1` / `ServeOptions.rateLimit` 已启用。                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `workspace_reload`         | 嵌入式路由配置中提供工作区重载支持。                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |

`mcp_guardrails` **不**在此条件表中——它是一个始终开启的标签，只要二进制文件支持新的 `/workspace/mcp` 预算字段就会声明，无论运营者是否配置了预算。未设置 `--mcp-client-budget` 的运营者仍会获得新字段（`budgetMode: 'off'`，`budgets: []`）。

`mcp_guardrail_events`（issue [#4175](https://github.com/QwenLM/qwen-code/issues/4175) PR 14b）声明类型化的 SSE 推送事件，无需轮询循环即可感知 MCP 预算状态跨越。两种帧类型出现在 `GET /session/:id/events` 中：

- `mcp_budget_warning`——在 `reservedSlots.size / clientBudget` 向上穿越 75% 时触发一次。仅在比率降至 37.5%（`MCP_BUDGET_REARM_FRACTION`）以下后才重置。与 PR 10 的 `slow_client_warning` 滞回类似，但发生在管理器层面而非每个订阅者积压层面。载荷：`{ liveCount, reservedCount, budget, thresholdRatio: 0.75, mode: 'warn' | 'enforce' }`。在 `warn` 和 `enforce` 模式下均会触发；`off` 模式下从不触发。
- `mcp_child_refused_batch`——在每次 `discoverAllMcpTools*` 遍历结束时（若有一个或多个服务器被拒绝），以及在 `readResource` 懒启动拒绝路径上以长度为 1 的批次触发。载荷：`{ refusedServers: [{ name, transport, reason: 'budget_exhausted' }, ...], budget, liveCount, reservedCount, mode: 'enforce' }`。`mode` 为字面量 `'enforce'`，因为 `warn` 模式从不拒绝。

两个事件均存在于每会话 SSE 回放环中（携带 `id`），因此携带 `Last-Event-ID` 重连的客户端可以从中恢复；`GET /workspace/mcp` 的快照仍是断连后长期状态的真实来源。声明后始终开启——没有条件开关。SDK reducer 状态（`DaemonSessionViewState`）暴露 `mcpBudgetWarningCount`、`lastMcpBudgetWarning`、`mcpChildRefusedBatchCount`、`lastMcpChildRefusedBatch`，供需要简单延迟样式 UI 的适配器使用。

## 路由

### `GET /health`

存活探针。默认形式在监听器启动时返回 `200 {"status":"ok"}`——轻量，无需访问桥接层，适合高频 k8s/Compose 存活探针。

传入 `?deep=1`（也接受 `?deep=true` 或裸 `?deep`）可获得一个暴露桥接层**计数器**（仅供参考，非真实存活检查）的探针：

```json
{ "status": "ok", "sessions": 3, "pendingPermissions": 1 }
```

> ⚠️ 深度探针是**参考性**的，而非真实的存活验证。它读取计数器访问器（`bridge.sessionCount`、`bridge.pendingPermissionCount`），这些只是简单的 Map 大小 getter；它们不会 ping 单个子进程/通道，因此无法检测到"卡住但仍被计数"的会话。请将其用于容量仪表板（当前并发数与 `--max-sessions` 的对比、队列深度），而非作为"将此 daemon 移出轮换"的触发器。如果自定义桥接实现的 getter 抛出异常，理论上可能返回 `503 {"status":"degraded"}`，但真实桥接的 getter 永远不会抛出——在正常操作下，深度探针始终返回 200。对于真实的存活检查，请依赖监听器是否接受 TCP 连接（即默认的不带 `?deep` 的 `/health`）。

**认证：** 仅在**非回环绑定**上需要。在回环上（`127.0.0.1`、`::1`、`[::1]`），`/health` 注册在 bearer 中间件之前，因此 pod 内的 k8s/Compose 探针无需携带 token。在非回环上（`--hostname 0.0.0.0` 等），路由注册在 bearer 中间件之后，没有有效 token 时返回 401——否则未认证的调用者可以通过探针任意地址来确认 `qwen serve` 的存在，这是一个低严重度的信息泄露，与端口扫描结合效果更差。CORS 拒绝和 Host 允许列表仍适用于回环豁免。

### `GET /daemon/status`

只读运营者诊断信息。与 `/health` 不同，这是一个普通的 daemon API：
它注册在 bearer 认证和速率限制之后，包括在回环绑定上。查询参数：

- `detail=summary`（默认）仅读取内存中的 daemon 状态。
- `detail=full` 还包括实时会话诊断、ACP 连接
  诊断、认证设备流计数和工作区状态部分。
- 其他 `detail` 值返回 `400 { "code": "invalid_detail" }`。

`summary` 有意不查询工作区状态方法、不启动 ACP
子进程，也不创建会话。`full` 独立查询每个工作区部分；
超时或异常仅将该部分标记为 `unavailable` 并添加
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

如果任何问题的严重级别为 error，则 `status` 为 `error`；如果任何问题的严重级别为 warning，则为 `warning`；否则为 `ok`。问题代码是稳定的，包括 `session_capacity_high`、`connection_capacity_high`、`pending_permissions`、`acp_channel_down`、`preflight_error`、`mcp_budget_warning`、`mcp_budget_exhausted`、`rate_limit_hits` 和 `workspace_status_unavailable`。在监听器就绪但完整运行时尚未挂载的短暂窗口期内，`/daemon/status` 可能报告 `daemon_runtime_starting`；若异步运行时挂载失败，则报告 `daemon_runtime_failed`，此时非状态运行时路由返回 `503`。

安全性：响应中绝不包含 bearer token、client id、完整 ACP 连接 id、device-flow 用户码或验证 URL。`summary` 省略 daemon 日志路径；`full` 可为已认证的运维人员提供该路径。

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

稳定约定：当 `v` 递增时，表示帧布局已发生不向后兼容的变更。

> **`protocolVersions`** 描述 daemon 能够使用的 serve 协议版本。`current` 是 daemon 首选的协议版本，`supported` 是兼容集合。需要特定协议的客户端应检查 `supported`；针对特定功能的 UI 仍应以 `features` 作为判断依据。相对于 v=1 的增量说明：旧版 v=1 daemon 会省略此字段，因此面向旧版构建的 SDK 客户端应将其视为可选字段。

> **`modelServices` 在 Stage 1 中始终为 `[]`。** Agent 使用其唯一的默认模型服务，不通过网络枚举该服务。Stage 2 将从已注册的模型适配器中填充此字段，以便 SDK 客户端构建服务选择器；在此之前，请**不要**依赖此字段为非空值。

> **`workspaceCwd`** 是该 daemon 绑定的规范绝对路径（#3803 §02 — 1 daemon = 1 workspace）。可用于：(a) 在发起 `/session` 请求前检测路径不匹配；(b) 在 `POST /session` 时省略 `cwd`（该路由会回退到此路径）。多工作区部署会在不同端口上暴露多个 daemon，每个 daemon 有各自的 `workspaceCwd`。相对于 v=1 的增量说明：§02 之前的 v=1 daemon 会省略此字段——面向旧版构建的客户端在使用前应进行 null 检查。

### 只读运行时状态路由

这些路由报告 daemon 侧的运行时快照。它们是 v1 的增量路由，不会改变状态，也不会变更 serve 协议版本。工作区状态路由特意**不会**因客户端轮询 GET 路由而启动 ACP 子进程：若 daemon 处于空闲状态，它们会返回 `initialized: false` 并附带空快照。会话状态路由需要一个活跃会话，并对未知 id 使用标准的 `404 SessionNotFoundError` 格式。

能力标签：

- `workspace_mcp` → `GET /workspace/mcp`
- `workspace_skills` → `GET /workspace/skills`
- `workspace_providers` → `GET /workspace/providers`
- `workspace_env` → `GET /workspace/env`
- `workspace_preflight` → `GET /workspace/preflight`
- `session_context` → `GET /session/:id/context`
- `session_supported_commands` → `GET /session/:id/supported-commands`
- `session_tasks` → `GET /session/:id/tasks`

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

`errorKind` 是一个封闭枚举，由 `/workspace/preflight`、`/workspace/env` 以及（未来的）MCP 防护机制共享，使 SDK 客户端能够按类别渲染修复建议，而无需解析自由格式的消息。PR 13（#4175）引入了上述七个字面量；PR 14 将在 egress 探针落地后填充 `blocked_egress`。

状态载荷绝不暴露 MCP 环境变量值、请求头、OAuth/服务账号详情、provider API 密钥、provider `baseUrl` / `envKey`、skill 正文、skill 文件系统路径、hook 定义或私密环境变量的值。`/workspace/env` 仅报告白名单环境变量的**存在性**；代理 URL 在传输前会去除凭据，并简化为 `host:port` 格式。

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

`discoveryState` 取值为 `not_started`、`in_progress` 或 `completed` 之一。`transport` 取值为 `stdio`、`sse`、`http`、`websocket`、`sdk` 或 `unknown` 之一。发现成功时省略 `errors`。
**MCP 客户端保护机制（issue [#4175](https://github.com/QwenLM/qwen-code/issues/4175) PR 14）。** PR 14 之后的守护进程在载荷中新增四个附加字段和一个工作区级单元：

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

`budgetMode` 的取值为 `enforce`、`warn` 或 `off` 之一。未设置预算时 `clientBudget` 字段缺失。`budgets[]` 在 PR 14 之后的守护进程中**始终为数组**（当 `budgetMode === 'off'` 时可能为空）；PR 14 之前的守护进程则完全省略该字段。v1 会输出一个 `scope: 'session'` 的单元（按会话执行——原因见上方能力章节）。消费方**必须**容忍 `budgets[]` 中出现未知 `scope` 值的额外条目——Wave 5 PR 23 将在不升级 schema 的情况下，在现有按会话单元旁新增 `scope: 'workspace'`（或 `'pool'`）。

每个服务器单元上的 `disabledReason` 用于区分两种情况：运营商主动禁用（`'config'`——`disabledMcpServers` 配置列表）和因预算被拒绝（`'budget'`——已发现但因 `enforce` 模式从未建立连接）。拒绝顺序由 `Object.entries(mcpServers)` 的声明顺序确定。每个服务器的 `status: 'error', errorKind: 'budget_exhausted'` 会覆盖原始的 `mcpStatus: 'disconnected'`（后者虽然属实，但不是面向运营商的严重程度表达）。

PR 14 v1 中的预算执行是**按会话而非按工作区**的。尽管在进程层面，Mode B 守护进程在 #4113 之后已是 `1 daemon = 1 workspace × N sessions`，但 `McpClientManager` 是在每个 ACP 会话的 `Config` 内部通过 `acpAgent.newSessionConfig` 构建的，因此 N 个会话各自独立执行各自的预算上限。快照反映的是引导会话的视角。Wave 5 PR 23 将引入工作区范围内的共享 MCP 池，使其升级为真正的按工作区执行。

**检测预算压力。** 有两种途径，均在 PR 14b 之后填充：

- **推送事件**（通过 `mcp_guardrail_events` 声明）：订阅 `GET /session/:id/events`，并通过 `KnownDaemonEvent` 筛选 `mcp_budget_warning` / `mcp_child_refused_batch` 帧。状态机在每次超过 75% 阈值时触发一次（降至 37.5% 以下后重新激活）；在 `enforce` 模式下，每次发现流程中的拒绝事件会被合并为一次。
- **快照轮询**（通过 `mcp_guardrails` 声明）：`GET /workspace/mcp` 并检查按会话预算单元（`budgets[0]`）：

- `budgets[0].status === 'warning'` ⇔ `liveCount >= 0.75 * clientBudget`（与 PR 14b 推送事件所用的迟滞阈值一致）。
- `budgets[0].status === 'error'` ⇔ `refusedCount > 0`（本次发现流程中有一个或多个服务器被拒绝）。
- `budgets[0].status === 'ok'` ⇔ 低于 75% 阈值且无拒绝。

推荐轮询频率：与现有 `/workspace/mcp` 轮询对齐即可；快照开销极低，预算单元不会产生额外的发现成本。订阅推送事件的 SDK 客户端仍可从快照中获益，以应对长时间断连后的状态恢复（SSE 重放环形缓冲区深度有限——`--event-ring-size`，默认 8000——离线时间超过缓冲区覆盖范围的客户端需回退到快照重新同步）。

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

`level` 的取值为 `project`、`user`、`extension` 或 `bundled` 之一。发现成功时省略 `errors` 字段。

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

模型按 auth 类型分组。Provider 连接诊断信息位于 `/workspace/preflight` 的 `providers` 单元；环境预检信息位于 `/workspace/preflight` 和 `/workspace/env`（见下文）。快照构建成功时省略 `errors` 字段。

### `GET /workspace/env`

报告守护进程的运行时、平台、沙箱、代理信息，以及白名单密钥环境变量的**存在情况**。始终从 `process.*` 状态中响应——守护进程不会为该路由启动 ACP 子进程，无论 ACP 是否运行，响应内容均相同。`acpChannelLive` 字段仅供参考。

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

**脱敏策略。** `kind: 'env_var'` 的 cell 永远不包含 `value` 字段；客户端只能看到 `present: boolean`。`kind: 'proxy'` 的 cell 会先对原始环境变量值执行凭据脱敏（`redactProxyCredentials`），再通过 `URL` 解析，确保传输层只携带 `host:port`。`NO_PROXY` 因为是主机列表而非 URL，会直接透传给脱敏函数。当前枚举的敏感环境变量白名单包括 `OPENAI_API_KEY`、`ANTHROPIC_API_KEY`、`GEMINI_API_KEY`、`GOOGLE_API_KEY`、`DASHSCOPE_API_KEY`、`OPENROUTER_API_KEY` 和 `QWEN_SERVER_TOKEN`。其他环境变量不在枚举范围内，因此意外配置的密钥不会被暴露。

### `GET /workspace/preflight`

报告守护进程就绪状态检查。**守护进程级 cell**（`node_version`、`cli_entry`、`workspace_dir`、`ripgrep`、`git`、`npm`）始终从 `process.*` 和 `node:fs` 中填充。**ACP 级 cell**（`auth`、`mcp_discovery`、`skills`、`providers`、`tool_registry`、`egress`）需要活跃的 ACP 子进程——当守护进程处于空闲状态时，这些 cell 会输出 `status: 'not_started'` 占位符。该路由不会为了填充 cell 而单独启动 ACP；对应 cell 会回退为 `not_started`。

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

- `missing_binary` — Node 版本低于要求、缺少 `QWEN_CLI_ENTRY`、
  ripgrep / git / npm 不在 PATH 中（可选二进制文件为警告而非错误）。
- `missing_file` — `boundWorkspace` 不存在或不是目录；
  skill 解析错误指向缺失或不可读的文件。
- `parse_error` — `SKILL.md` 解析失败、JSON 配置格式错误。
- `auth_env_error` — `validateAuthMethod` 返回非空失败字符串，
  或 `ModelConfigError` 子类从 provider 解析中传播出来。
- `init_timeout` — bridge 中 `withTimeout` 被拒绝（等待 ACP 往返时实际超时）。
  通过 `BridgeTimeoutError` 类型类识别。注意：带有 `connecting > 0` 的瞬态
  `mcp_discovery` `warning` cell 不携带此类型——那是握手进行中的正常状态，
  与真正的超时不同。
- `protocol_error` — ACP `extMethod` 因通道在请求中途关闭或 tool registry
  意外缺失而被拒绝。
- `blocked_egress` — 为 PR 14 (#4175) 保留。PR 13 将 `egress` cell 保持为
  `status: 'not_started'`。

如果 bridge 在服务 preflight 请求时无法到达 ACP 子进程（例如请求中途通道关闭），
则信封的 `errors` 数组包含一个描述失败的 `ServeStatusCell`，cells 回退为
`not_started` 的 ACP 占位符。daemon 级别的 cells 仍会返回。

### 工作区文件路由

所有文件路径均通过 daemon 绑定的工作区解析。响应使用工作区相对路径，
正常成功情况下不返回绝对文件系统路径。成功的文件响应包含：

```http
Cache-Control: no-store
X-Content-Type-Options: nosniff
```

文件系统错误使用如下 JSON 结构：

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

读取文本文件。查询参数：`path`（必填）、`maxBytes`、`line` 和
`limit`。daemon 会拒绝二进制文件及超过文本读取上限的文件。
响应包含 `hash`，即整个文件原始磁盘字节的 SHA-256 摘要，
即使 `line`、`limit` 或 `maxBytes` 只返回了部分内容也是如此。

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

读取文件的原始字节而不进行解码。查询参数：`path`（必填）、
`offset`（默认 `0`）和 `maxBytes`（默认 `65536`，最大 `262144`）。
该路由支持在大型二进制文件上进行有界窗口读取，无需读取整个文件。
仅当返回窗口覆盖整个文件时，响应才包含 `hash`。

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

创建或替换一个文本文件。这是一个严格的写变更路由：在未配置 token 的回环地址访问时，会返回 `401 { "code": "token_required" }`。
启用 `--require-auth` 后，全局 bearer 中间件会在路由执行前拒绝未认证的请求。

Body:

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

`mode` 必须为 `create` 或 `replace`。`create` 不会覆盖已存在的文件（返回 `409 file_already_exists`）。`replace` 需要提供 `expectedHash`；hash 缺失或格式错误时返回 `400 parse_error`，hash 过期时返回 `409 hash_mismatch`。`expectedHash` 的格式为 `sha256:` 加 64 个小写十六进制字符，基于磁盘原始字节计算。

`bom`、`encoding` 和 `lineEnding` 均可指定。替换操作默认保留原文件的编码配置；显式指定的字段会覆盖默认值。不支持二进制写入。

daemon 会先在目标目录中写入一个随机临时文件，在支持的系统上执行 fsync，在执行 `rename()` 前立即重新校验当前 hash，然后将其原子重命名到目标位置。这可以防止读取到写入中的不完整文件，并使 daemon 发起的同文件写操作串行化，但这不是跨进程的内核级比较并交换：在最终 hash 校验与 rename 之间的极短窗口内，外部编辑器仍可能产生竞争。

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

对现有文本文件执行一次精确的文本替换操作。这同样是一个严格的写变更路由，需要提供 `expectedHash`。

```json
{
  "path": "src/config.ts",
  "oldText": "timeout: 30000",
  "newText": "timeout: 60000",
  "expectedHash": "sha256:..."
}
```

`oldText` 必须非空且在文件中只出现一次。未找到匹配时返回 `422 text_not_found`；出现多处匹配时返回 `422 ambiguous_text_match`。该路由保留文件的编码、BOM 和换行符，并在原子重命名前立即重新校验 `expectedHash`。

对已忽略路径的显式写入和编辑操作是允许的，因为经过认证的调用方已明确指定了路径。成功响应和审计事件中均包含 `matchedIgnore: "file" | "directory" | null`。

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

`state` 的结构与 `POST /session`、`POST /session/:id/load` 和 `POST /session/:id/resume` 所使用的 ACP model/mode/config-option 格式相同。

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

`availableCommands` 与 `available_commands_update` SSE 通知所使用的命令快照相同。`availableSkills` 仅列出技能名称；客户端不应期望通过此路由获取技能内容或路径。

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

此路由是一个只读的带外快照，设计上不是 prompt，可在会话流式传输期间查询。响应仅包含来自 agent、shell 和 monitor 任务注册表的白名单元数据；控制器、计时器、偏移量、待处理消息以及原始注册表对象均不会暴露。

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

`status` 的取值为 `NOT_STARTED`、`IN_PROGRESS`、`READY` 或 `FAILED` 之一。失败的服务器在有可用信息时会附带可选的 `error` 字段。禁用 LSP（包括 bare 模式）时返回 HTTP 200，其中 `enabled: false`、计数均为零、`servers: []`。LSP 已启用但未配置任何服务器时返回 `enabled: true`、`configuredServers: 0` 和 `servers: []`。若初始化在客户端存在之前失败，响应中可能包含 `initializationError`；若活跃客户端无法提供快照，响应中则包含 `statusUnavailable: true`。

此路由仅暴露稳定的面向客户端字段，有意省略调试内部信息，如进程 ID、spawn 参数、stderr 尾部内容、根 URI 以及工作区文件夹路径。

### `POST /session`

创建新 agent 或附加到现有 agent（在 `sessionScope: 'single'`（默认值）下）。

请求：

```json
{
  "cwd": "/absolute/path/to/workspace",
  "modelServiceId": "qwen-prod",
  "sessionScope": "thread"
}
```

| 字段             | 是否必填 | 说明                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ---------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `cwd`            | 否       | 与 daemon 绑定工作区匹配的绝对路径。若省略，路由回退到 `boundWorkspace`（从 `/capabilities.workspaceCwd` 读取）。不匹配的非空 `cwd` 返回 `400 workspace_mismatch`（#3803 §02 — 1 个 daemon = 1 个工作区）。工作区路径通过 `realpathSync.native` 规范化（对不存在的路径使用仅解析的回退），以防止大小写不敏感文件系统因拼写差异拒绝会话。                                                                                                                                                                          |
| `modelServiceId` | 否       | 选择 agent 将路由到的已配置_模型服务_（后端提供商——阿里云 ModelStudio、OpenRouter 等）。若省略，agent 使用其默认值。若工作区已有会话，此操作会在现有会话上调用 `setSessionModel` 并广播 `model_switched`。与 `POST /session/:id/model` 上的 `modelId` 不同，后者是在已绑定服务**内部**选择模型。`/capabilities` 上的 `modelServices` 数组保留用于通告已配置服务；在 Stage 1 中始终为 `[]`（agent 使用默认服务，不通过 HTTP 枚举）。 |
| `sessionScope`   | 否       | 会话共享的每次请求覆盖选项。`'single'`（daemon 全局默认值）使第二次同工作区的 `POST /session` 复用现有会话（`attached: true`）；`'thread'` 强制每次调用都创建一个全新的独立会话。省略则继承 daemon 全局默认值。枚举范围以外的值返回 `400 { code: 'invalid_session_scope' }`。旧版 daemon（#4175 PR 5 之前）会静默忽略此字段——发送前请预检 `caps.features.session_scope_override`。daemon 全局默认值在生产环境中硬编码为 `'single'`；#4175 可能在后续跟进中添加 `--sessionScope` CLI 标志。         |

响应：

```json
{
  "sessionId": "<uuid>",
  "workspaceCwd": "/canonical/path",
  "attached": false
}
```

`attached: true` 表示该工作区已存在会话，当前正在共享该会话。

针对同一工作区的并发 `POST /session` 请求会被**合并**为一次 spawn——两个调用方获得相同的 `sessionId`，其中恰好一个报告 `attached: false`。若底层 spawn 失败（初始化超时、agent 输出格式错误、OOM），**所有被合并的调用方都会收到相同的错误**——进行中的槽位会被清除，以便后续调用可从头重试。

> ⚠️ **`modelServiceId` 在新会话上的拒绝在 HTTP 响应中是静默的。** 错误的 `modelServiceId`（拼写错误、未配置的服务）不会导致创建请求返回 500——会话仍会以 agent 的默认模型正常运行，调用方仍能获得可用于重试模型切换的 `sessionId`（通过 `POST /session/:id/model`）。可见的失败信号是会话 SSE 流上的 `model_switch_failed` 事件，该事件在 spawn 握手与首次订阅之间触发。**需要观察此事件的订阅者应在首次 `GET /session/:id/events` 时传入 `Last-Event-ID: 0`**，以从环形缓冲区最旧的可用事件开始回放（即使订阅在创建响应后几毫秒才到达，也能覆盖 spawn 时产生的 `model_switch_failed`）。

### `POST /session/:id/load`

通过 id 恢复持久化的 ACP 会话，并通过 SSE 回放其历史记录。路径中的 id 具有权威性；请求体中的任何 `sessionId` 字段均被忽略。请预检 `caps.features.session_load`——旧版 daemon 对此路由返回 `404`。

请求：

```json
{
  "cwd": "/absolute/path/to/workspace"
}
```

| 字段  | 是否必填 | 说明                                                                                                                                                                                                                                 |
| ----- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `cwd` | 否       | 与 `POST /session` 相同的规范化及 `workspace_mismatch` 规则。省略则继承 `/capabilities.workspaceCwd`。此处有意不接受 `mcpServers`——daemon 范围的 MCP 由设置驱动（与 `POST /session` 保持一致）。 |

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

`state` 对应 ACP 的 `LoadSessionResponse`——`models` 为 `SessionModelState`，`modes` 为 `SessionModeState`，`configOptions` 为 `SessionConfigOption` 数组。缺失字段由 agent 自行决定。后续附加者（下文 `attached: true` 路径）获得的 `state` 快照与原始 load 调用方所见相同——守护进程在条目上缓存该快照；运行时变更（如 `model_switched`）通过 SSE 流推送，而非后续 attach 响应。

`attached: true` 表示会话已存活（来自先前的 `session/load`/`session/resume`，或因合并的并发调用方抢先一步）。

**通过 SSE 回放历史记录。** 在 agent 侧执行 `loadSession` 期间，agent 会为每个已持久化的轮次发出 `session_update` 通知。守护进程在路由响应返回之前将其缓冲到会话的事件总线上，因此在 `load` 返回后立即调用 `GET /session/:id/events` 并携带 `Last-Event-ID: 0` 的订阅者可看到完整回放。**回放环形缓冲区有上限**（每个会话默认 8000 帧）。包含大量工具调用/思维流轮次的长历史记录可能超出该上限——最旧的帧会被静默丢弃。需要完整历史记录的客户端应在 `load` 返回后立即订阅；也可以持久化 SSE 事件 id，并使用 `Last-Event-ID` 从较新的轮次边界恢复。

**错误：**

- `404` — 持久化会话 id 不存在（`SessionNotFoundError`）。
- `400` — `workspace_mismatch`（与 `POST /session` 形状相同）。
- `503` — `session_limit_exceeded`（计入 `--max-sessions`；正在进行的恢复也会被计入）。
- `409` — `restore_in_progress`（同一 id 的 `session/resume` 已在进行中）。`Retry-After: 5`。相同操作的竞争（两个并发 `session/load` 针对同一 id）会被合并——恰好一个返回 `attached: false`，其余返回 `attached: true` 并附带相同的 `state`。

### `POST /session/:id/resume`

通过 id 恢复已持久化的 ACP 会话，**不**通过 SSE 回放历史记录。模型上下文在 agent 侧内部恢复（通过 `geminiClient.initialize` 读取 `config.getResumedSessionData`）；SSE 流保持干净，供已完成历史记录渲染的客户端使用。预检 `caps.features.session_resume`；`unstable_session_resume` 是兼容旧版客户端的已弃用别名。

请求形状与 `/load` 相同。响应形状相同——`state` 对应 ACP 的 `ResumeSessionResponse`。错误信封相同，包括 `409 restore_in_progress`（当 `session/load` 正在进行时触发；`session/resume` 在另一个 `session/resume` 之后竞争时会被合并）。

当客户端尚未渲染历史记录时使用 `/load`（冷重连、选择器 → 打开）。当客户端已在屏幕上显示轮次、仅需要守护进程侧句柄时使用 `/resume`。

> ⚠️ **为何 `unstable_session_resume` 仍被公布？** 守护进程的 HTTP 路由和 `session_resume` 能力在 v1 中已稳定，但 bridge 仍调用 ACP 的 `connection.unstable_resumeSession`。保留旧标签仅为使在 `session_resume` 之前发布的 SDK 能继续正常工作。

### `GET /workspace/:id/sessions`

列出所有规范工作区与 `:id`（URL 编码的绝对 cwd）匹配的存活会话。

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

当不存在会话时返回空数组（而非 404）——会话选择器 UI 不应因工作区处于空闲状态而报错。

### `POST /session/:id/prompt`

将提示词转发给 agent。多提示词调用方按会话 FIFO 排队（ACP 保证每个会话同时只有一个活跃提示词）。

请求：

```json
{
  "prompt": [{ "type": "text", "text": "What does src/main.ts do?" }]
}
```

验证：`prompt` 必须是非空对象数组。其他失败情况在到达 bridge 之前返回 `400`。

响应：

```json
{ "stopReason": "end_turn" }
```

其他停止原因：`cancelled`、`max_tokens`、`error`、`length`（按 ACP 规范）。

如果 HTTP 客户端在提示词进行中断开连接，守护进程会向 agent 发送 ACP `cancel` 通知，agent 以 `stopReason: "cancelled"` 结束提示词。

> **阶段 1 限制——无服务端提示词超时。** bridge
> 仅将 agent 的 `prompt()` 与 `transportClosedReject`
>（agent 子进程崩溃）及调用方的 HTTP 断开连接
> AbortSignal 进行竞争。处于卡死但仍存活状态的 agent（例如模型调用挂起）
> 会阻塞每个会话的 FIFO，直到 HTTP 客户端在其一侧超时并断开连接。
> 长时间运行的提示词是合法的（深度研究、大型代码库分析），
> 因此有意不设置默认截止时间；阶段 2 将提供可配置的
> `promptTimeoutMs` 选项。在此之前，调用方应自行设置客户端超时，
> 并在到期时断开连接（或调用
> `POST /session/:id/cancel`）。

### `POST /session/:id/cancel`

取消会话上**当前活跃**的提示词。在 ACP 侧这是一条通知而非请求——agent 通过将活跃 `prompt()` 以 `cancelled` 状态 resolve 来确认。

```bash
curl -X POST http://127.0.0.1:4170/session/$SID/cancel
# → 204 No Content
```

> **多提示词约定：** cancel 仅影响活跃提示词。同一客户端此前已 POST 且仍在活跃提示词之后排队的提示词将继续执行。多提示词排队是守护进程引入的行为（不在 ACP 规范中）；排队提示词的约定为"除非逐一取消，或通过 channel exit 终止会话，否则它们会持续运行"。

### `DELETE /session/:id`

显式关闭存活会话。即使有其他客户端附加也会强制关闭——取消所有活跃提示词、将待处理权限以已取消状态 resolve、发布 `session_closed` 事件、关闭 EventBus，并将会话从守护进程映射中移除。磁盘上已持久化的会话**不会**被删除——可通过 `POST /session/:id/load` 重新加载。预检 `caps.features.session_close`。

```bash
curl -X DELETE http://127.0.0.1:4170/session/$SID
# → 204 No Content
```

幂等：对未知会话返回 `404`（与其他路由形状相同的 `SessionNotFoundError`）。

> **`session_closed` 事件。** SSE 订阅者在流结束前会收到一个终止 `session_closed` 事件，内容为 `{ sessionId, reason: 'client_close', closedBy?: '<clientId>' }`。SDK reducer 对其处理方式与 `session_died` 相同（设置 `alive: false`，清空 `pendingPermissions`）。

### `PATCH /session/:id/metadata`

更新可变会话元数据。当前仅支持 `displayName`。预检 `caps.features.session_metadata`。

请求：

```json
{ "displayName": "My Investigation Session" }
```

| 字段          | 是否必填 | 说明                                                                           |
| ------------- | -------- | ------------------------------------------------------------------------------ |
| `displayName` | 否       | 字符串，最多 256 个字符。空字符串清除名称。省略则保持不变。 |

响应：

```json
{ "sessionId": "<uuid>", "displayName": "My Investigation Session" }
```

在会话的 SSE 流上发布 `session_metadata_updated` 事件，内容为 `{ sessionId, displayName }`。

### `POST /session/:id/heartbeat`

更新守护进程对该会话的最近活跃时间记录。长期运行的适配器（TUI/IDE/Web）会定期发送此请求，以便未来的吊销策略（Wave 5 PR 24）能够区分已断开的客户端和静默中的客户端。

Headers:

| Header             | Required | Notes                                                                                                                                                                                                                                   |
| ------------------ | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `X-Qwen-Client-Id` | no       | 回显 `POST /session` 时守护进程颁发的 id。已识别的客户端同时更新其自身的时间戳；匿名心跳仅更新会话级别的水位线。必须满足与其他地方相同的 `[A-Za-z0-9._:-]{1,128}` 格式规范。 |

请求体为空（发送 `{}` 亦可——当前不读取任何字段）。

Response:

```json
{
  "sessionId": "<sid>",
  "clientId": "<cid>",
  "lastSeenAt": 1700000000123
}
```

仅当提供了受信任的 `X-Qwen-Client-Id` 时，`clientId` 才会被回显。`lastSeenAt` 是桥接层存储的守护进程侧 `Date.now()` 时间戳（毫秒）。

Errors:

- `400` — `{ code: 'invalid_client_id' }`：header 格式错误（header 格式规则），或携带的 `clientId` 未在该会话中注册（桥接层在更新任何时间戳之前抛出 `InvalidClientIdError`）。
- `404` — 未知会话。

能力门控：预检 `caps.features.client_heartbeat`。较旧的守护进程对该路径返回 `404`。

### `POST /session/:id/model`

在会话当前绑定的模型服务**内部**切换活跃模型。通过每个会话的模型切换队列串行化执行。

（如需切换_服务_本身——Alibaba ModelStudio 与 OpenRouter 等——请在 `POST /session` 时传入 `modelServiceId` 以创建新会话。Stage 1 没有在线服务切换路由。）

Request:

```json
{ "modelId": "qwen-staging" }
```

Response:

```json
{ "modelId": "qwen-staging" }
```

成功时，向 SSE 流发布 `model_switched` 事件。失败时，发布 `model_switch_failed`（使被动订阅者也能看到失败，而不仅限于调用方）。与 agent channel 退出竞争，以防卡死的子进程阻塞 HTTP 处理器。

### `POST /session/:id/recap`

能力标签：`session_recap`。Bridge → ACP extMethod `qwen/control/session/recap`。

生成一句话"我上次做到哪里了"的会话摘要。封装了核心层的 `generateSessionRecap`（`packages/core/src/services/sessionRecap.ts`），该函数以禁用工具、`maxOutputTokens: 300` 以及严格的 `<recap>...</recap>` 输出格式，针对快速模型发起一次旁路查询。旁路查询读取会话现有的 GeminiClient 对话历史，**不**向其追加内容。

请求体被忽略（发送 `{}` 或空均可）。非严格的变更门控——姿态与 `/session/:id/prompt` 保持一致（该调用消耗 token，但不改变任何状态）。不发布 SSE 事件。

Response (200):

```json
{
  "sessionId": "sess:42",
  "recap": "Debugging the auth retry race. Next: add deterministic timing to the integration test."
}
```

以下情况下 `recap` 为 `null`（正常的 200 响应，而非错误）：

- 会话的对话轮次少于两轮，
- 旁路查询未返回可提取的 `<recap>...</recap>` 内容，
- 或发生了任何底层模型错误（核心层辅助函数为尽力而为模式，永不抛出异常）。

Errors:

- `400 {code: 'invalid_client_id'}` — `X-Qwen-Client-Id` header 格式错误。
- `404` — 会话未知。

取消：**v1 中不支持**。该路由不监听 HTTP 客户端断开事件，桥接层未向 ACP 子进程传入任何 `AbortSignal`，无论调用方是否已断开连接，ACP 子进程都会将旁路查询执行完毕。唯一的上限是桥接层 60 秒的兜底超时（`SESSION_RECAP_TIMEOUT_MS`）以及与 ACP channel 断开的传输竞争。这是可接受的，因为 recap 耗时很短（单次尝试，`maxOutputTokens: 300`，典型耗时约 1–5 秒）；如果未来带宽成本足以支撑，可通过基于请求 id 的取消扩展方法来实现完整的端到端取消。

### Mutation: approval, tools, init, MCP restart

Issue [#4175](https://github.com/QwenLM/qwen-code/issues/4175) Wave 4 PR 17 新增了四条变更控制路由，允许远程客户端在不修改守护进程宿主机 CLI 的情况下更改运行时姿态。四条路由均：

- 受 PR 15 中**严格**变更门控约束。未配置 bearer token 的守护进程会以 `401 {code: 'token_required'}` 拒绝请求。使用前需配置 `--token`（或 `QWEN_SERVER_TOKEN`）。
- 接受并记录 `X-Qwen-Client-Id` header（PR 7 审计链）。当 header 携带受信任的 id 时，守护进程会在对应的 SSE 事件中附带 `originatorClientId`，以便跨客户端 UI 抑制对自身变更的回显。
- 在暴露功能前预检每个按标签划分的能力。较旧的守护进程对该路由返回 `404`。

四条路由中有三条（`tools/:name/enable`、`init`、`mcp/:server/restart`）发出**工作空间级别**事件：无论触发变更时附加的是哪个会话，所有活跃会话的 SSE 总线均会收到该事件。`approval-mode` 发出**会话级别**事件，因为该变更仅作用于单个会话的 `Config`。

#### `POST /session/:id/approval-mode`

能力标签：`session_approval_mode_control`。Bridge → ACP extMethod `qwen/control/session/approval_mode`。

更改活跃会话的审批模式。新模式立即生效于 ACP 子进程的每会话 `Config` 内。默认**不**将设置写入磁盘——传入 `persist: true` 可同时将 `tools.approvalMode` 写入工作空间设置。

Request:

```json
{ "mode": "auto-edit", "persist": false }
```

`mode` 必须为 `'plan' | 'default' | 'auto-edit' | 'auto' | 'yolo'` 之一（与核心层 `ApprovalMode` 枚举一致；SDK 导出 `DAEMON_APPROVAL_MODES` 用于运行时校验）。`persist` 默认为 `false`。

Response (200):

```json
{
  "sessionId": "sess:42",
  "mode": "auto-edit",
  "previous": "default",
  "persisted": false
}
```

Errors:

- `400 {code: 'invalid_approval_mode', allowed: [...]}` — 未知的模式字面量。
- `400 {code: 'invalid_persist_flag'}` — `persist` 不是布尔值。
- `403 {code: 'trust_gate', errorKind: 'auth_env_error'}` — 所请求的模式需要受信任的文件夹（核心层 `Config.setApprovalMode` 会拒绝在不受信任工作空间中使用特权模式）。
- `404` — 会话未知。

SSE event（会话级别）：`approval_mode_changed`，携带 `{sessionId, previous, next, persisted, originatorClientId?}`。

#### `POST /workspace/tools/:name/enable`

能力标签：`workspace_tool_toggle`。纯文件 IO——无 ACP 往返。

在工作空间的 `tools.disabled` 设置列表中切换工具名称。列在其中的工具**完全不会被注册**（有别于 `permissions.deny`——后者保留工具注册，仅拒绝调用）。内置工具和 MCP 发现的工具均通过 `ToolRegistry.registerTool` 流转，该函数会查阅已禁用集合。

> ⚠️ **名称必须与注册表暴露的标识符完全一致。** 不进行别名解析——该路由将路径参数中的字符串原样存入 `tools.disabled`，下一个 ACP 子进程在注册时与 `tool.name` 进行比对。内置工具使用其规范注册表名称（snake_case 动词形式）：`run_shell_command`、`read_file`、`write_file`、`list_directory`、`glob`、`grep_search`、`web_fetch` 等——**而非** CLI 显示的标签名（`Shell`、`Read`、`Write`）。MCP 发现的工具使用限定形式 `mcp__<server>__<name>`（这也是 `tool_toggled` 事件广播以及 `GET /workspace/mcp` 列出的形式）。禁用 `Bash` **不会**阻止 `run_shell_command` 在下次会话时注册。

已在运行的 ACP 子进程会保留已注册的工具——切换在**下一次** ACP 子进程启动时生效。如需在当前守护进程中立即生效，可配合 `POST /workspace/mcp/:server/restart`（针对 MCP 来源的工具）或创建新会话使用。

接受未知工具名称：预先禁用尚未安装的 MCP 工具是合法用例。

Request:

```json
{ "enabled": false }
```

响应（200）：

```json
{ "toolName": "run_shell_command", "enabled": false }
```

错误：

- `400 {code: 'invalid_tool_name'}` — 路径参数为空，或路径参数超过 256 个字符的限制。
- `400 {code: 'invalid_enabled_flag'}` — `enabled` 缺失或非布尔值。

SSE 事件（工作区范围）：`tool_toggled`，携带 `{toolName, enabled, originatorClientId?}`。

#### `POST /workspace/init`

能力标签：`workspace_init`。纯文件 IO — 无 ACP 往返，**不调用 LLM**。

在守护进程绑定的工作区根目录下创建一个空的 `QWEN.md`（或 `--memory-file-name` 覆盖时 `getCurrentGeminiMdFilename()` 返回的文件名）。仅为机械性操作 — 如需 AI 驱动的内容填充，请后续调用 `POST /session/:id/prompt`。

默认情况下，当目标文件已存在且含有非空白内容时拒绝覆盖。仅含空白字符的文件视为不存在（与本地 `/init` 斜杠命令行为一致）。

请求：

```json
{ "force": false }
```

响应（200）：

```json
{ "path": "/work/bound/QWEN.md", "action": "created" }
```

`action` 的值：全新创建时为 `'created'`；已有仅含空白字符的文件未执行写入时为 `'noop'`；`force: true` 覆盖非空内容时为 `'overwrote'`。`workspace_initialized` SSE 事件会镜像响应中的 action — 观察者可过滤 `action !== 'noop'` 以仅响应磁盘上的实际变更。

错误：

- `400 {code: 'invalid_force_flag'}` — `force` 为非布尔值。
- `409 {code: 'workspace_init_conflict', path, existingSize}` — 文件已存在且含有非空白内容，且 `force` 未设置或为 false。响应体携带绝对路径和大小（字节），SDK 客户端无需重新 stat 即可渲染"覆盖 N 字节？"的提示。

SSE 事件（工作区范围）：`workspace_initialized`，携带 `{path, action, originatorClientId?}`。

#### `POST /workspace/mcp/:server/restart`

能力标签：`workspace_mcp_restart`。桥接 → ACP extMethod `qwen/control/workspace/mcp/restart`。

通过 ACP 子进程的 `McpClientManager.discoverMcpToolsForServer`（断开 + 重连 + 重新发现）重启已配置的 MCP 服务器。在重启前会预检 PR 14 v1 计费方案中的实时预算快照，若工作区预算已耗尽，则返回软性拒绝，而非触发 `BudgetExhaustedError` 级联。

请求体为空（`{}`）。路径参数为 URL 编码的服务器名称，与 `mcpServers` 配置中的名称一致。

响应（200）— 基于 `restarted` 的判别联合类型：

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

软性跳过原因（均返回 200）：

| `reason`                | 含义                                                                                                                                                                               |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `'in_flight'`           | 该服务器已有另一个发现/重启操作正在进行中。路由立即返回，而非等待原始 Promise 完成。调用方应稍后重试。 |
| `'disabled'`            | 服务器已配置但列于 `excludedMcpServers` 中。请先重新启用再重启。                                                                                                    |
| `'budget_would_exceed'` | 守护进程处于 `--mcp-budget-mode=enforce` 模式，目标服务器当前不在 `reservedSlots` 中，且实时总量已达到 `clientBudget`。调用方应先释放一个槽位。         |

错误（非 2xx）：

- `400 {code: 'invalid_server_name'}` — 路径参数为空。
- `404` — 服务器名称不在 `mcpServers` 配置中，或不存在活跃的 ACP 通道（重启本身需要活跃的 `McpClientManager` 实例）。
- `500` — 内部错误（例如 `ToolRegistry` 未初始化）。

SSE 事件（工作区范围）：成功时发送 `mcp_server_restarted`，携带 `{serverName, durationMs, originatorClientId?}`；软性跳过时发送 `mcp_server_restart_refused`，携带 `{serverName, reason, originatorClientId?}`。

### `GET /session/:id/events`（SSE）

订阅会话的事件流。

请求头：

```
Accept: text/event-stream
Last-Event-ID: 42        ← 可选，从 id 42 之后开始重放
```

查询参数：

| 参数       | 是否必填 | 说明                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ----------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `maxQueued` | 否       | 每个订阅者的**实时积压**上限。范围 `[16, 2048]`，默认 256。订阅时强制推送的重放帧不计入上限；真正消耗上限的是订阅者在排空大量 `Last-Event-ID: 0` 重放期间到达的实时事件。冷重连时请调大此值，以防实时尾流在消费者追上进度前触发慢客户端警告/驱逐。超出范围、非十进制或值为空的参数会在 SSE 握手建立前返回 `400 invalid_max_queued`。请预检 `caps.features.slow_client_warning` — 旧版守护进程会静默忽略此参数。 |

帧格式。`data:` 行为**完整事件信封**，JSON 序列化为单行 — `{id?, v, type, data, originatorClientId?}`。ACP 特定载荷（`sessionUpdate`、`requestPermission` 参数等）位于信封的 `data` 字段下；信封自身的 `type` 与 SSE `event:` 行一致。

```
id: 7
event: session_update
data: {"id":7,"v":1,"type":"session_update","data":{"sessionUpdate":"agent_message_chunk","content":{"type":"text","text":"…"}}}

id: 8
event: permission_request
data: {"id":8,"v":1,"type":"permission_request","data":{"requestId":"<uuid>","sessionId":"<sid>","toolCall":{...},"options":[...]}}

: heartbeat              ← 每 15 秒一次，无载荷

event: client_evicted    ← 终止帧，无 id（合成）
data: {"v":1,"type":"client_evicted","data":{"reason":"queue_overflow","droppedAfter":42}}
```

SSE 级别的 `id:` / `event:` 行与 `envelope.id` / `envelope.type` 重复，以兼容 EventSource。使用原始 `fetch` 的消费者（SDK 的 `parseSseStream`）从 JSON 信封读取所有内容，忽略 SSE 前导行。

| 事件类型                | 触发条件                                                                                                                                                                                                                                                                                                                  |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `session_update`          | 任何 ACP `sessionUpdate` 通知（LLM 数据块、工具调用、用量）                                                                                                                                                                                                                                                     |
| `permission_request`      | Agent 请求工具授权                                                                                                                                                                                                                                                                                                            |
| `permission_resolved`     | 某客户端通过 `POST /permission/:requestId` 对权限进行了投票                                                                                                                                                                                                                                                      |
| `permission_partial_vote` | （仅限共识模式）票已记录但尚未达到法定人数。携带 `{requestId, sessionId, votesReceived, votesNeeded, quorum, optionTallies}`。请预检 `caps.features.permission_mediation`。                                                                                   |
| `permission_forbidden`    | 投票被活跃策略拒绝（`designated` 不匹配、`local-only` 非回环地址，或 `consensus` 投票者不在快照中）。携带 `{requestId, sessionId, clientId?, reason}`。请预检 `caps.features.permission_mediation`。                                                                                 |
| `model_switched`          | `POST /session/:id/model` 成功                                                                                                                                                                                                                                                                                      |
| `model_switch_failed`     | `POST /session/:id/model` 被拒绝                                                                                                                                                                                                                                                                                       |
| `session_died`            | Agent 子进程意外崩溃。**终止：此帧后 SSE 流关闭；会话从 `byId` 中移除。** 订阅者应通过 `POST /session` 重连以启动新会话。                                                                                                                                                              |
| `slow_client_warning`     | 订阅者本地：队列已满 ≥ 75%。**非终止** — 流继续；此警告是驱逐前的提示。携带 `{queueSize, maxQueued, lastEventId}`。每次溢出事件仅触发一次；队列降至 37.5% 以下后重置。无 `id`（合成）。请预检 `caps.features.slow_client_warning`。 |
| `client_evicted`          | 订阅者本地：队列溢出。**终止：此帧后 SSE 流关闭**（无 `id` — 合成）。同一会话的其他订阅者不受影响。                                                                                                                                                                                |
| `stream_error`            | 守护进程在扇出期间发生错误。**终止：此帧后 SSE 流关闭**（无 `id` — 合成）。                                                                                                                                                                                                                                                |

重连语义：

- 发送 `Last-Event-ID: <n>` 以从会话环形缓冲区（默认深度 **8000**，可通过 `qwen serve --event-ring-size <n>` 调整）重放 `id > n` 的事件。
- **间隙检测（客户端）：** 若 `<n>` 早于环形缓冲区中最旧的事件（例如以 `Last-Event-ID: 50` 重连，但环形缓冲区现在存储的是 200–1199），守护进程会从最旧的可用事件开始重放，不会抛出异常。将第一个重放事件的 `id` 与 `n + 1` 比较；任何差值即为丢失窗口的大小。第二阶段将在守护进程侧注入显式的 `stream_gap` 合成帧；第一阶段检测由客户端负责。
- ID 在每个会话内单调递增，从 1 开始。
- 合成帧（`client_evicted`、`slow_client_warning`、`stream_error`）有意省略 `id`，以免为其他订阅者消耗序列号。

背压：

- 每个订阅者的队列默认上限为 `maxQueued: 256` 条实时消息（重连时的重放帧不计入上限）。可在 SSE 请求中通过 `?maxQueued=N`（范围 `[16, 2048]`）覆盖此设置。
- 当某个订阅者的队列超过 75% 满载时，消息总线会向该订阅者强制推送一条 `slow_client_warning` 合成帧（每次溢出事件推送一次；队列消耗至 37.5% 以下后重新激活）。流保持打开状态——此警告仅作为提示，让客户端加快消耗速度或主动断开并重新连接。
- 如果队列在警告之后仍然溢出，消息总线将发出 `client_evicted` 终止帧并关闭该订阅。

### `POST /permission/:requestId`

对一个待处理的 `permission_request` 投票。当前生效的**仲裁策略**决定最终结果：

| 策略                        | 行为                                                                                                                                                                                              |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `first-responder`（默认）   | 任意经过验证的投票者均可获胜；后续投票者收到 `404`。F3 之前的基准行为。                                                                                                                             |
| `designated`                | 仅提示词发起者（`originatorClientId`）可做决定；非发起者收到 `403 permission_forbidden / designated_mismatch`。对于匿名提示词，降级为 first-responder 策略。                                        |
| `consensus`                 | M 个投票者中需有 N 个达成一致（默认 `N = floor(M/2) + 1`，可通过 `policy.consensusQuorum` 覆盖）。首个达到 N 票的选项获胜。未能决定结果的投票返回 `200` 以及 `permission_partial_vote` SSE 帧。     |
| `local-only`                | 仅回环投票者可做决定；远程调用者收到 `403 permission_forbidden / remote_not_allowed`。                                                                                                               |

当前生效的策略在 `settings.json` 中的 `policy.permissionStrategy` 下配置，并通过 `/capabilities` 的 `body.policy.permission` 对外公开。可预检 `caps.features.permission_mediation`（含 `modes: [...]`）以获取构建所支持的策略集合。

> **F3 (#4175)：多客户端权限协调。** F3 新增了上述四种策略。F3 之前的守护进程硬编码了 first-responder；当配置策略为 `first-responder` 时，线缆格式保持逐位不变。新事件（`permission_partial_vote`、`permission_forbidden`）为增量添加——旧 SDK 会将其视为 `unrecognized_known_event` 并优雅地忽略。

> **权限超时（默认 5 分钟）。** 一个 `permission_request`
> 会一直处于待处理状态，直至：(a) 某个客户端在此投票，(b) `POST /session/:id/cancel`
> 被触发，(c) 驱动提示词的 HTTP 客户端断开连接
>（提示词执行中途取消会将未决权限解析为 `cancelled`），
> (d) 会话被终止，(e) 守护进程关闭，**或
> (f) 每会话权限超时触发**（`DEFAULT_PERMISSION_TIMEOUT_MS`，
> 5 分钟）。超时触发后，代理的 `requestPermission` 解析为
> `{outcome: 'cancelled'}`，审计环记录一条
> `permission.timeout` 条目，守护进程 stderr 输出一行
> 面包屑日志，SSE 总线向所有订阅者广播标准的
> `permission_resolved` cancelled 帧以便订阅者清理资源。
> 超时时长可通过 `BridgeOptions.permissionResponseTimeoutMs` 配置；
> 运行长形式提示词的无头调用者可能需要适当延长此值。

请求：

```json
{
  "outcome": {
    "outcome": "selected",
    "optionId": "proceed_once"
  }
}
```

结果类型：

- `{ "outcome": "selected", "optionId": "<one-of-the-options>" }` — 接受 / 拒绝 / 仅本次执行 / 等，具体取决于代理提供的选项
- `{ "outcome": "cancelled" }` — 丢弃该请求（与 `cancelSession` / `shutdown` 内部行为一致）

响应：

- `200 {}` — 您的投票已被接受（已解析，或在 consensus quorum 下已记录）
- `403 { "code": "permission_forbidden", "reason": "designated_mismatch" | "remote_not_allowed", "requestId", "sessionId" }` — F3：当前策略拒绝了您的投票
- `404 { "error": "..." }` — requestId 未知（已解析、从未存在或会话已销毁）
- `500 { "code": "cancel_sentinel_collision", ... }` — F3：代理的 `allowedOptionIds` 包含保留哨兵值 `'__cancelled__'`；代理 / 守护进程合约违规
- `501 { "code": "permission_policy_not_implemented", "policy": "<name>" }` — F3 前向兼容：某个策略字面量已进入 schema，但其仲裁分支尚未构建（当前不可达；为未来策略预留）

投票成功后，所有已连接的客户端都会收到 `permission_resolved`，其中包含相同的 `requestId` 和所选的 `outcome`。在 `consensus` 模式下，中间投票还会额外广播 `permission_partial_vote`，直至达到 quorum。

### Auth device-flow 路由（issue #4175 PR 21）

守护进程代理 OAuth 2.0 设备授权流程（RFC 8628），使远程 SDK 客户端可以触发登录，并将令牌保存在**守护进程**文件系统上，而非客户端。守护进程本身负责轮询 IdP；客户端唯一的工作是显示验证 URL 和用户码，并（可选地）订阅 SSE 以接收完成事件。

能力标签：`auth_device_flow`（始终公告）。v1 中支持的提供商：`qwen-oauth`。

> [!note]
>
> Qwen OAuth 免费套餐已于 2026-04-15 停止服务。在此协议中，请将 `qwen-oauth` 视为
> 旧版 v1 提供商标识符；如有当前支持的认证提供商，新客户端应优先使用。

**运行时本地性。** 守护进程不会启动浏览器——即便它具备此能力。客户端自行决定是否在本地调用 `open(verificationUri)`；在无头 Pod（标准 Mode B 部署）上，用户需在任意有浏览器的设备上打开该 URL。推荐的用户体验请参见 `docs/users/qwen-serve.md`。

**事件中不泄露令牌。** `auth_device_flow_started` 仅携带 `{deviceFlowId, providerId, expiresAt}`。用户码和验证 URL 通过 POST 201 响应体以及 `GET /workspace/auth/device-flow/:id` 点对点返回，永远不会在 SSE 上广播。

**每个提供商单例。** 当某个流程仍处于待处理状态时，对同一提供商再次发起 `POST` 是幂等的接管操作——它会返回已有条目并附带 `attached: true`，而不会发起新的 IdP 请求。

#### `POST /workspace/auth/device-flow`

严格变更门控：即使在无令牌的回环默认配置下，也需要提供 bearer token（`401 token_required`）。

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
- `409 too_many_active_flows` — 已达到工作区上限（4 个）；请先用 `DELETE` 取消一个
- `401 token_required` — 严格门控拒绝了无令牌请求
- `502 upstream_error` — IdP 返回了意外错误

#### `GET /workspace/auth/device-flow/:id`

读取当前状态。待处理条目会返回 `userCode/verificationUri/expiresAt/intervalMs`；终止状态条目（5 分钟宽限期）不再返回上述字段，仅返回 `status` 及可选的 `errorKind/hint`。

对于未知 ID 以及宽限期后已驱逐的条目，返回 `404 device_flow_not_found`。

#### `DELETE /workspace/auth/device-flow/:id`

幂等取消：

- 待处理条目 → `204` + 发出 `auth_device_flow_cancelled`
- 终止状态条目 → `204` 无操作（不重复发出事件）
- 未知 ID → `404`

#### `GET /workspace/auth/status`

待处理流程及支持的提供商快照：

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

五种类型化事件（工作区范围，向每个活跃会话总线扇出）：

- `auth_device_flow_started` `{deviceFlowId, providerId, expiresAt}` — POST 成功；SDK 应订阅（此处无 userCode，如需获取请通过 GET）
- `auth_device_flow_throttled` `{deviceFlowId, intervalMs}` — 守护进程遵从上游 `slow_down`；轮询 GET 的客户端应相应增大轮询间隔
- `auth_device_flow_authorized` `{deviceFlowId, providerId, expiresAt?, accountAlias?}` — 凭据已持久化；`accountAlias` 是非 PII 标签（不含邮箱/电话）
- `auth_device_flow_failed` `{deviceFlowId, errorKind, hint?}` — 终态；`errorKind` 为以下之一：`expired_token | access_denied | invalid_grant | upstream_error | persist_failed`。`persist_failed` 是守护进程内部错误：IdP 交换成功，但守护进程无法持久存储凭据（EACCES / EROFS / ENOSPC）。用户应在磁盘条件修复后重试。
- `auth_device_flow_cancelled` `{deviceFlowId}` — 针对待处理条目的 DELETE 成功

> **与 MCP 不兼容。** MCP 授权规范（2025-06-18）要求使用 OAuth 2.1 + PKCE 授权码与重定向回调，不适用于无头 Pod 守护进程。Mode B 的 device-flow 接口是守护进程私有的——面向 MCP 兼容服务器的客户端应使用其他授权路径。

## 流式传输线路格式

事件以标准 EventSource 帧形式发出。守护进程每帧写入一行 `data:`（`JSON.stringify` 后 JSON 不含嵌入换行符）；`packages/sdk-typescript/src/daemon/sse.ts` 中的 SDK 解析器在接收端同时支持该格式和规范允许的多 `data:` 形式。

## 流式传输中的错误帧

若桥接迭代器在为 SSE 订阅者提供服务时抛出异常，守护进程将发出终态 `stream_error` 帧（无 `id`）。`data:` 行为完整信封（与本文档中其他 SSE 帧结构相同）；实际错误消息位于 `envelope.data.error`：

```
event: stream_error
data: {"v":1,"type":"stream_error","data":{"error":"<message>"}}
```

连接随后关闭。

## 环境变量

| 变量                | 用途                                                           |
| ------------------- | -------------------------------------------------------------- |
| `QWEN_SERVER_TOKEN` | Bearer token。启动时去除首尾空白字符。 |

## 源码目录结构

| 路径                                                 | 用途                                                                                                    |
| ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `packages/cli/src/commands/serve.ts`                 | yargs 命令及 flag 模式定义                                                                                |
| `packages/cli/src/serve/run-qwen-serve.ts`           | 监听器生命周期及信号处理                                                                                       |
| `packages/cli/src/serve/server.ts`                   | Express 路由及中间件                                                                                |
| `packages/cli/src/serve/auth.ts`                     | bearer 认证 + Host 允许列表 + CORS 拒绝                                                                        |
| `packages/cli/src/serve/httpAcpBridge.ts`            | 启动或附加进程 + 每会话 FIFO + 权限注册表                                                                   |
| `packages/cli/src/serve/status.ts`                   | 只读守护进程状态线路类型 + `ServeErrorKind` + `BridgeTimeoutError` + `mapDomainErrorToErrorKind` |
| `packages/cli/src/serve/env-snapshot.ts`             | 纯辅助函数，从 `process.*` 状态构建 `/workspace/env` 载荷，包含凭据脱敏   |
| `packages/acp-bridge/src/eventBus.ts`                | 有界异步队列 + 重放环形缓冲区                                                                          |
| `packages/sdk-typescript/src/daemon/DaemonClient.ts` | TS 客户端                                                                                                  |
| `packages/sdk-typescript/src/daemon/sse.ts`          | EventSource 帧解析器                                                                                   |
| `integration-tests/cli/qwen-serve-routes.test.ts`    | 18 个用例，无 LLM                                                                                           |
| `integration-tests/cli/qwen-serve-streaming.test.ts` | 3 个用例，真实 `qwen --acp` 子进程由本地 fake OpenAI 服务器支撑（仅 POSIX；Windows 上跳过）   |
