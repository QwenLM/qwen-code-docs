
# `qwen serve` HTTP 协议参考

[qwen-code 守护进程设计](https://github.com/QwenLM/qwen-code/issues/3803) 的第一阶段。所有路由均位于守护进程的 base URL 下（默认为 `http://127.0.0.1:4170`）。

## 身份验证

当守护进程使用 `--token` 或 `QWEN_SERVER_TOKEN` 启动时，**除环回绑定（loopback binds）上的 `/health` 外的所有路由**都必须携带：

```
Authorization: Bearer <token>
```

如果未配置 token（环回开发的默认情况），则该 header 是可选的。Token 比较采用恒定时间算法。对于 `missing header` / `wrong scheme` / `wrong token`，401 响应格式是统一的。

**`/health` 豁免**（Bctum）：在环回绑定（`127.0.0.1` / `localhost` / `::1` / `[::1]`）上，`/health` 在 bearer 中间件之前注册，因此即使守护进程使用 `--token` 启动，pod 内的存活探针（liveness probes）也无需携带 token。非环回绑定（如 `--hostname 0.0.0.0`）会像其他所有路由一样将 `/health` 置于 bearer 验证之后——有关基本原理，请参阅 [`GET /health`](#get-health) 部分。

**`--require-auth`（#4175 PR 15）。** 在启动时传递此标志，可将"必须具有 token"的规则扩展到环回绑定。如果没有 token，启动将失败；同时取消 `/health` 豁免（因此 `/health` 也需要 `Authorization: Bearer …`）。

启用该标志后，全局 `bearerAuth` 中间件将拦截**所有**路由——包括 `/capabilities`。因此，**未经身份验证**的客户端无法通过预检 `caps.features` 来发现需要身份验证：这种情况下的发现途径是 **401 响应体**本身（根据 [身份验证](#身份验证) 部分，所有路由的响应格式统一）。`require_auth` 能力标签是一种**身份验证后的确认**——一旦客户端成功通过身份验证并读取 `/capabilities`，该标签的存在即可确认守护进程是使用 `--require-auth` 启动的（这对于审计/合规 UI 以及 SDK 客户端在设置面板中显示"此部署已加固"非常有用）。选择加入每路由严格模式的变更路由（Wave 4 后续跟进）在无 token 的环回默认情况下被访问时，会返回 `401 { code: "token_required", error: "…" }` 拒绝请求——但在启用 `--require-auth` 的情况下，全局 bearer 中间件会在每路由拦截之前使请求短路，因此未经身份验证的调用者实际看到的是旧版的 `Unauthorized` 响应体。

**`--allow-origin <pattern>`（T2.4 [#4514](https://github.com/QwenLM/qwen-code/issues/4514)）。** 默认情况下，跨域访问守护进程的浏览器 webui 会被阻止——任何携带 `Origin` header 的请求都会返回 `403 {"error":"Request denied by CORS policy"}`，因为 CLI/SDK 客户端从不发送 `Origin`，守护进程将其存在视为请求来自操作员未加入的浏览器上下文的标志。在启动时传递 `--allow-origin <pattern>`（可重复）以安装允许列表（allowlist）来替代拦截墙。每个 pattern 可以是：

- 字面量 `*` —— 允许任何 origin。**风险**：当配置了 `*` 但未设置 bearer token（来源可以是 `--token`、`QWEN_SERVER_TOKEN` 或要求在启动时提供 token 的 `--require-auth`）时，启动将被拒绝。当列表中包含 `*` 时，启动日志会在 stderr 发出警告。**建议**：在环回绑定上与 `--require-auth` 结合使用，这样 `/health` 也会受 bearer 拦截——默认情况下它在环回绑定时注册在 bearer 中间件之前（因此 k8s/Compose 探针可以在没有 token 的情况下访问它），而 `*` 允许列表使它可以被任何跨域浏览器访问。`--require-auth` 仍然让 Web Shell 静态资源（`/`、`/assets/*` 和 `/session/:id` 文档导航）在环回上保持预认证——它们被设计为挂载在 bearer 中间件之前——因此在 `*` 允许列表下它们仍然可以被任何跨域浏览器读取；`--no-web` 移除了该暴露面。在非环回绑定上，bearer 在启动时已经是强制的，且 `/health` 注册在其之后，因此 `*` 在无 token 情况下暴露的唯一表面是 Web Shell 静态资源（`/`、`/assets/*` 和 `/session/:id` 文档导航——它们的 JS 仍然调用受 token 拦截的路由）。`--no-web` 甚至可以移除该表面；实际的 API 暴露面无论如何都是受拦截的。
- 规范的 URL origin —— `<scheme>://<host>[:<port>]`。**无尾部斜杠、无路径、无用户信息、无查询参数。** 如果条目未通过往返测试 `new URL(pattern).origin === pattern`，启动将拒绝并抛出 `InvalidAllowOriginPatternError`；错误信息会指出错误的 pattern 和规范形式。严格设计：静默规范化（例如去除尾部 `/`）会让拼写错误溜走并接受模糊输入。

匹配的 origin 在每个请求中都会收到标准的 CORS 响应 header：

```
Access-Control-Allow-Origin: <echoed origin>
Vary: Origin
Access-Control-Allow-Methods: GET, POST, PATCH, DELETE, OPTIONS
Access-Control-Allow-Headers: Authorization, Content-Type, X-Qwen-Client-Id, Last-Event-ID, X-Qwen-Event-Epoch
Access-Control-Max-Age: 86400
Access-Control-Expose-Headers: Retry-After, X-Qwen-Event-Epoch, X-Qwen-SSE-Stream-Id
```

`Access-Control-Allow-Origin` 会逐字回显请求的 origin（浏览器发送时的大小写），而不是字面量 `*`，即使在 `*` 模式下也是如此——浏览器缓存基于它与 `Vary: Origin` 的配对来缓存响应，回显方式为在后续版本中添加 `Access-Control-Allow-Credentials` 留出了空间，而无需更改 schema。暴露的 header 允许浏览器 webui 遵循重试提示、保留 SSE epoch 并关联已接受的物理流。今天**不**发送 `Access-Control-Allow-Credentials`：守护进程通过 `Authorization` 中的 bearer 进行身份验证，这可以在没有 `credentials: 'include'` 的情况下跨域工作。

OPTIONS 预检请求（带有 `Access-Control-Request-Method` 或 `Access-Control-Request-Headers` 的 OPTIONS）会直接返回 `204 No Content` 以及上述 header。这是传统的 CORS 模式，是安全的——预检仅确认守护进程将接受哪些 methods/headers；实际的后续请求仍会运行完整的链路（host 允许列表 → bearer 身份验证 → 路由），因此反 DNS 重绑定和 bearer 强制执行仍会在读取或变更任何状态之前触发。来自匹配 origin 的普通 OPTIONS 请求会继续流向下游，并附带 CORS header。

不匹配允许列表的 origin 仍会收到 `403 {"error":"Request denied by CORS policy"}`——与默认拦截墙的响应格式相同，因此已经解析了拦截墙响应的客户端无需对部署了允许列表的守护进程进行特殊处理。拒绝路径**不会**发出任何 `Access-Control-*` header（浏览器会忽略它们，并且发出它们会通过 header 的存在间接暴露允许列表的大小）。

配置的 pattern 列表故意**不**在 `/capabilities` 中回显——浏览器 webui 已经知道自己的 origin（毕竟它调用了守护进程），并且暴露该列表会让 `/capabilities` 的未身份验证读取者枚举每个受信任的 origin（这对于配置错误的部署是有用的侦察信息）。SDK 客户端通过 `caps.features.allow_origin` 标签来判断"此守护进程允许跨域浏览器访问"，而无需知道具体是哪些 origin。

环回自 origin 请求（例如 Web Shell 在相同的 `127.0.0.1:port` 调用守护进程）由一个**独立**的 Origin 剥离 shim 处理，该 shim 在 CORS 中间件**之前**运行，并移除 `127.0.0.1:port` / `localhost:port` / `[::1]:port` / `host.docker.internal:port` 的 `Origin` header。因此，无论 `--allow-origin` 如何配置，它们都能通过——操作员无需列出守护进程自身的端口即可使 Web Shell 正常工作。

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
{
  "error": "No session with id \"<sid>\"",
  "sessionId": "<sid>",
  "code": "session_not_found"
}
```

状态码为 `404`。并发关闭使用 `code: "session_closing"`。

`WorkspaceMismatchError` 对于 `POST /session`，如果其 `cwd` 无法规范化为已注册的 workspace，返回 `400`，并带有：

```json
{
  "error": "Workspace mismatch: daemon is bound to \"…\"",
  "code": "workspace_mismatch",
  "boundWorkspace": "/path/the/daemon/uses/as-primary",
  "requestedWorkspace": "/path/in/the/request"
}
```

使用此信息在预检时检测不匹配：从 `/capabilities` 读取 `workspaceCwd` 并在 `POST /session` 中省略 `cwd`（它将回退到主 workspace），或者当 `multi_workspace_sessions` 被通告时选择 `workspaces[].cwd` 之一。

当 `POST /session` 超过守护进程的 `--max-sessions` 上限时，返回 `503`，并带有 `Retry-After: 5` header 和：

```json
{
  "error": "Session limit reached (20)",
  "code": "session_limit_exceeded",
  "limit": 20,
  "scope": "workspace"
}
```

当 `--max-total-sessions` 拒绝新 session 时，返回相同的响应格式，但 `"scope": "total"`。

附加到现有 session 的操作**不**计入上限，因此即使达到容量上限，空闲守护进程的重连也能继续工作。

`RestoreInProgressError` —— 由 `POST /session/:id/load`、`POST /session/:id/resume` 或调用者指定 ID 的 `POST /session`（当另一个注册已拥有该 id 时）发出 —— 返回 `409` 和：

```json
{
  "error": "Session \"<sid>\" is already being restored via session/<resume|load>; retry session/<load|resume> after it completes",
  "code": "restore_in_progress",
  "reason": "restore_in_progress",
  "retryable": true,
  "sessionId": "<sid>",
  "activeAction": "load",
  "requestedAction": "resume"
}
```

当对已经有一个正在进行的 `session/resume` 的 id 发出 `session/load` 时（反之亦然），或当调用者指定 ID 的 spawn 与任一恢复方向发生竞争时会触发此错误。请至少等待 `Retry-After` 秒后重试。相同操作竞争（`load` 对 `load`，`resume` 对 `resume`）在恢复活跃期间会合并而不是报错。

`reason` 区分共享此 code 的两个围栏，`Retry-After` header 会跟踪它：

| `reason`                     | 含义                                                                                                           | `Retry-After`                                                  |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| `restore_in_progress`        | 普通恢复正在运行。                                                                                              | `5`（与 `session_limit_exceeded` 匹配）                         |
| `awaiting_abandoned_cleanup` | 公共调用者已收到 `504`，不可取消的 ACP 请求及其清理尚未结算。                                                      | 有效恢复预算（秒），限制在 `5`–`120` 之间                       |

公共恢复请求受 `limits.sessionRestoreTimeoutMs`（默认 60 秒）管控。在 `504` 之后，该 id 保持围栏状态，直到迟到的 ACP 请求和清理结算完毕，因此以普通 5 秒节奏持续重试的客户端会在无法清除的 409 上空转——请遵循 `awaiting_abandoned_cleanup` 附带的预算派生提示。

`SessionWorkspaceConflictError` —— 由 `POST /session/:id/load` 和 `POST /session/:id/resume` 发出，当请求的 `cwd` 指向一个已注册的 workspace，但同一个 session id 已在另一个 runtime 中活跃或正在被恢复时 —— 返回 `409`，并带有：

```json
{
  "error": "Session \"<sid>\" is already live or restoring in another workspace runtime.",
  "code": "session_workspace_conflict",
  "sessionId": "<sid>",
  "workspaceCwd": "/requested/workspace",
  "workspaceId": "requested-workspace-id",
  "liveWorkspaceCwd": "/live/owner/workspace",
  "liveWorkspaceId": "live-owner-workspace-id"
}
```

客户端应使用拥有该 session 的 workspace 进行重试，或等待进行中的恢复完成后再将该 id 恢复到不同的 workspace。同 workspace 的恢复竞争继续使用 bridge 的 `restore_in_progress` / 合并行为。

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
['health', 'capabilities', 'session_create', 'session_id_override', 'session_scope_override',
 'session_load', 'session_resume', 'session_transcript',
 'unstable_session_resume',
 'session_list', 'session_info', 'session_prompt', 'session_mid_turn_message_mutation',
 'session_cancel', 'session_events',
 'slow_client_warning', 'typed_event_schema',
 'session_set_model', 'client_identity', 'client_heartbeat',
 'session_permission_vote', 'permission_vote', 'workspace_mcp', 'workspace_skills',
 'workspace_providers', 'workspace_acp_preheat', 'workspace_acp_status',
 'auth_provider_install', 'workspace_memory',
 'workspace_agents', 'workspace_agent_generate', 'workspace_env',
 'workspace_preflight', 'session_context', 'session_context_usage',
 'session_supported_commands', 'session_tasks', 'session_monitor_tool_correlation', 'session_stats',
 'session_lsp', 'session_status',
 'session_close', 'session_metadata', 'session_organization',
 'session_archive', 'mcp_guardrails',
 'workspace_mcp_manage', 'mcp_guardrail_events',
 'mcp_server_runtime_mutation',
 'workspace_file_read', 'workspace_file_bytes', 'workspace_file_write',
 'workspace_file_upload',
 'session_approval_mode_control', 'workspace_tool_toggle', 'workspace_skill_toggle',
 'workspace_skill_batch_toggle',
 'extension_batch_activation_v2',
 'workspace_settings', 'workspace_init', 'workspace_mcp_restart',
 'session_recap', 'session_generation', 'session_btw', 'session_shell_command',
 'mcp_workspace_pool', 'mcp_pool_restart',
 'require_auth', 'allow_origin', 'auth_device_flow',
 'permission_mediation', 'prompt_absolute_deadline', 'writer_idle_timeout',
 'non_blocking_prompt', 'session_language', 'session_rewind',
 'workspace_hooks', 'session_hooks', 'workspace_extensions',
 'session_branch', 'rate_limit', 'workspace_reload', 'channel_delivery',
 'multi_workspace_sessions', 'multi_workspace_session_rewind',
 'multi_workspace_session_shell', 'persistent_workspace_registration',
 'workspace_display_name',
 'workspace_qualified_rest_core', 'workspace_qualified_voice',
 'workspace_qualified_memory', 'extension_management_v2', 'extension_git_credentials',
 'workspace_persisted_transcript',
 'workspace_session_export', 'workspace_archived_session_export',
 'workspace_session_live_state',
 'client_mcp_over_ws', 'cdp_tunnel_over_ws', 'browser_automation_mcp']
```

> 条件标签仅在其匹配的部署开关开启时才会出现（见下表）。F3 的 `permission_mediation` 标签始终开启，并带有 `modes: ['first-responder', 'designated', 'consensus', 'local-only']`，以便 SDK 客户端可以内省构建支持的集合；运行时激活的策略位于 `body.policy.permission`。

`session_scope_override` 是 `POST /session` 请求中 `sessionScope` 字段的协商句柄（见下文）。旧版 daemon 会静默忽略该字段，因此 SDK 客户端在发送前应预先检查 `caps.features` 中是否包含此 tag。

`session_id_override` 是 `POST /session` 和 ACP `session/new` 元数据中可选的调用者提供 `sessionId` 的协商句柄。客户端必须在发送该字段前确认 `caps.features` 包含此 tag，因为旧版 daemon 可能会静默忽略它。

`persistent_workspace_registration` 通告在运行时添加的 workspace 的持久化注册。`POST /workspaces` 接受 `{ "cwd": "/absolute/path", "persist": true }`；成功响应包含 `persisted: true`。注册的作用域限定在守护进程的规范主 workspace 下、用户的 Qwen home 目录中，并在下次守护进程启动时恢复。省略 `persist` 则保留进程内注册。`GET /workspace-registrations` 列出存储的期望集合，`DELETE /workspace-registrations/:id` 遗忘一个条目使其在下次启动时消失，而不会热移除活跃的 runtime。

`workspace_display_name` 通告 `POST /workspaces` 上的可选 `displayName` 输入、通过 `PATCH /workspaces/:workspace` 进行的 workspace 元数据更新，以及 workspace 投影中的可选 display-name 字段。名称不参与查找或路由：`id` 和规范 `cwd` 仍然是唯一的选择器，且允许重复名称。

`workspace_runtime_removal` 通告通过 `DELETE /workspaces/:workspace` 进行的同步热移除。Capability 中的 workspace 条目新增可选 `removable`；仅 `removable: true` 的行可被移除。移除同时会遗忘该 runtime 的每个持久化注册别名，但不会删除文件、设置、转录或归档。

`session_load` 和 `session_resume` 宣告了显式恢复路由（`POST /session/:id/load` 和 `POST /session/:id/resume`）。旧版 daemon 对这些路径返回 `404`，因此 SDK 客户端在调用前应预先检查 `caps.features`。`unstable_session_resume` 仍作为已弃用的别名被宣告，以兼容在底层 ACP 方法名为 `connection.unstable_resumeSession` 时发布的 SDK；新客户端应使用 `session_resume` 进行门控。

`session_transcript` 通告 `GET /session/:id/transcript`，一个对持久化活跃 session JSONL 的只读分页重放视图。它与 `/load` 不同：不会附加客户端、不会为活跃 EventBus 播种、不会创建活跃 session，也不会改变活跃重放窗口。客户端应在需要长 session 的完整磁盘转录时使用它，并继续仅在冷 UI 恢复期间使用 `/load` 进行有界的活跃重放。

`limits.sessionRestoreTimeoutMs`（存在时）是 daemon 对底层 ACP `loadSession` / `unstable_resumeSession` 请求的挂钟预算。它是一个附加的 v1 字段。TypeScript SDK 给 daemon 10 秒的客户端裕量，WebUI watchdog 给 15 秒；与旧版 daemon 通信的客户端应分别使用 70 秒和 75 秒。

`workspace_persisted_transcript` 通告 `GET /workspaces/:workspace/session/:id/transcript`，一个 daemon 本地的仅持久化分页器，不启动 ACP、不查询活跃 bridge 状态、不加载设置、不发现项目能力，也不创建旧版持久化 cursor key。该标签是无条件的，因为受信任的单 workspace 主实例可以使用复数路由；每个 workspace 的信任授权仍然在每个请求上进行评估。已注册的不受信任的次要 workspace 可以读取，而不受信任的主 workspace 仍然会被拒绝。

`workspace_session_export` 通告 `GET /workspaces/:workspace/session/:id/export`，一个仅限受信任的选定 workspace 活跃持久化 session 的完整导出。它独立于 `session_export` 和 `workspace_qualified_rest_core`：已发布的 daemon 可以同时通告旧标签而不实现复数路由，因此客户端必须直接预检此标签。该标签是无条件的，因为受信任的单 workspace 主实例可以通过 id 或 cwd 使用该路由。导出不会解析活跃所有者、启动 ACP、附加客户端或回退到另一个 workspace。

`workspace_archived_session_export` 通告 `GET /workspaces/:workspace/session/:id/archive/export`，一个仅限受信任的选定 workspace 归档持久化存储的完整导出。它独立于 `workspace_session_export` 和 `workspace_qualified_rest_core`；客户端必须直接预检此标签。独立的路由防止旧版 daemon 忽略归档意图并返回具有相同 id 的活跃转录。

`workspace_session_live_state` 通告 `GET /workspaces/:workspace/sessions/live-state`，一个仅限受信任的、仅内存的选定 workspace runtime 活跃 session 快照，以及一个内存中的目录版本，告知客户端何时需要进行完整的持久化目录重新加载。它独立于 `workspace_qualified_rest_core`：已发布的 daemon 可以通告更广泛的 workspace REST 能力而不实现此路由，因此客户端必须直接预检此标签。该标签是无条件的，因为受信任的单 workspace 主实例可以通过 id 或 cwd 使用该路由；每个 workspace 的信任检查仍然在每个请求上适用，且该路由不会将宽松的不受信任次要持久化目录读取策略扩展到活跃 bridge 状态。该标签表示端点存在；并不保证每个活跃项都携带可选的 `updatedAt` 活动水位标记，该标记取决于生命周期。

`slow_client_warning` 涵盖 SSE 背压行为：(a) 当订阅者的实时帧积压或实时序列化字节积压超过 75% 时，daemon 会发出一个 `slow_client_warning` 合成事件流帧，每次溢出事件仅发出一次（当两项指标均降至 37.5% 以下时重新触发）；(b) `GET /session/:id/events` 接受 `?maxQueued=N` 查询参数（范围 `[16, 2048]`），用于在针对大型重放环进行冷重连时，预设每个订阅者的帧积压大小。序列化字节上限由 daemon 控制（默认每个订阅者 **2 MiB**），仅限实时数据，且故意不提供查询参数。全局 ring 大小由 `--event-ring-size` 控制（默认 **8000**，参见 #3803 §02）。旧版 daemon 会静默缺失该警告/查询行为——在启用前请预先检查此 tag。

`typed_event_schema` 宣告 daemon 事件负载符合 SDK 的 `KnownDaemonEvent` schema。旧版 daemon 可能仍会流式传输兼容的帧，但 SDK 客户端在假定具备类型化事件覆盖之前，应预先检查此 tag。

`client_heartbeat` 宣告了 `POST /session/:id/heartbeat`。旧版 daemon 返回 `404`；在发送周期性心跳前，请预先检查此 tag。

`session_close` 和 `session_metadata` 宣告了 `DELETE /session/:id` 和 `PATCH /session/:id/metadata`。旧版 daemon 返回 `404`；在暴露关闭或重命名功能前，请预先检查这些 tag。

`session_organization` 宣告了自定义会话分组和置顶功能。它新增了 `GET/POST/PATCH/DELETE /workspace/:id/session-groups`、`PATCH /session/:id/organization`，以及可选的有序列表视图 `GET /workspace/:id/sessions?view=organized`。当同时通告了 `session_organization` 和 `workspace_qualified_rest_core` 时，workspace 限定的组织变更 `PATCH /workspaces/:workspace/session/:id/organization` 也可用。旧版变更路由仍然仅限主 workspace。旧版 daemon 对变更/分组路由返回 `404`，并忽略有序视图契约，因此 WebShell/SDK 客户端在显示分组或置顶 UI 前，必须预先检查这些 tag。

`session_archive` 宣告了 v1 目录状态归档 API：`POST /sessions/archive`、`POST /sessions/unarchive` 和 `GET /workspace/:id/sessions?archiveState=active|archived`。归档的会话在取消归档前无法被加载或恢复。

`workspace_qualified_rest_core` 通告 `/workspaces/:workspace/...` 下的复数核心 REST 路由。选择器首先解析为精确的 workspace id，然后解析为规范化后的 URL 编码绝对 cwd。较新的单 workspace daemon 即使在 `multi_workspace_sessions` 缺失时也会在 `workspaces[]` 中包含主 runtime，以便客户端可以发现 workspace 限定路由所需的 id；客户端应对省略该数组的旧版 daemon 回退到 `capabilities.workspaceCwd`。信任状态和信任请求路由可用于已注册的不受信任的 workspace；文件读取路由遵循现有的文件系统读取策略。已注册的不受信任的次要 workspace 还暴露仅持久化的 session 和 session-group 目录：这些读取不会附加到 session、启动 ACP 或合并活跃 bridge 状态。文件写入、目录变更和其他复数核心路由需要受信任的 workspace，除非单独的能力明确定义了更窄的只读策略，例如 `workspace_persisted_transcript`。不受信任的主 workspace 仍然会从复数目录和转录路由收到 `403 { code: "untrusted_workspace" }`；旧版单数主路由保持其现有的兼容行为。此标签涵盖核心文件、状态、设置、权限、信任、生命周期、MCP 控制、工具和 skill 切换、memory、workspace agent CRUD 和 session 存储暴露面。它不涵盖 auth、voice、extensions、ACP/WebSocket 传输、channel-worker 路由或 workspace 限定的 session 导出；请单独预检 `workspace_session_export` 或 `workspace_archived_session_export`。Workspace 信任不是 ACL：持有 daemon token 的客户端可以读取此策略允许的每个已注册 workspace 暴露面。

`workspace_qualified_voice` 通告由受信任的 workspace runtime 选择的 Voice 路由：`GET` 和 `POST /workspaces/:workspace/voice`、`POST /workspaces/:workspace/voice/transcribe`，以及 `WS /workspaces/:workspace/voice/stream`。它仅在多 workspace runtime 和共享 ACP/Voice WebSocket 监听器同时启用时被通告。选择器遵循与其他复数路由相同的 id 或编码绝对 cwd 规则。对于 REST，未知的选择器返回 `400 { code: "workspace_mismatch" }`，不受信任的选择器返回 `403 { code: "untrusted_workspace" }`；WebSocket 升级拒绝暴露相应的 HTTP 400/403 状态，不带结构化 JSON 信封。两种传输都不回退到主 workspace。旧版 `/workspace/voice`、`/workspace/voice/transcribe` 和 `/voice/stream` 仍然仅限主 workspace。客户端对所有限定的 Voice 模态使用 `workspace_qualified_voice`，并让选定的 runtime 报告配置特定的错误。旧版 `workspace_voice`、`workspace_voice_transcription` 和 `voice_transcribe` 标签仅描述主绑定的路由，不得隐藏限定的次要配置。

`workspace_qualified_memory` 通告 workspace 限定的托管 memory 路由：`POST /workspaces/:workspace/memory/{remember,forget,dream}` 入队任务，`GET /workspaces/:workspace/memory/{remember,forget,dream}/:taskId` 读取它们。它仅在 ACP HTTP 和多 workspace runtime 同时启用时被通告。选择器遵循与其他复数路由相同的 id 或编码绝对 cwd 规则。每个已注册的 workspace 都有自己的任务通道；主 workspace 的限定通道与单数 `/workspace/memory` 暴露面是同一个实例，因此在一个上入队的任务可以在另一个上读取。解析严格按选定的 runtime 进行，不回退到主 workspace：未知的选择器返回 `400 { code: "workspace_mismatch" }`，不受信任的选择器返回 `403 { code: "untrusted_workspace" }`，不活跃或正在排空的 runtime 返回 `503 { code: "workspace_runtime_unavailable" }`。读取从不分配通道，因此轮询没有任务的 workspace 会返回 `404 { code: "<kind>_task_not_found" }`。任务 id 的作用域限定在其通道内，不会在 workspace 重新配置或 runtime 替换后保留；过期的 id 返回 `404`，而非数据丢失状况。当 ACP HTTP 被禁用时，该标签不会被通告，非主的限定请求返回不可重试的 `501 { code: "workspace_memory_unavailable" }`，而主限定路由通过本地拥有的通道继续工作。

`session_lsp` 宣告了 `GET /session/:id/lsp`，即为 daemon 客户端提供的只读结构化 LSP 状态快照。旧版 daemon 返回 `404`；在暴露远程 LSP 状态前，请预先检查此 tag。

`session_status` 宣告了 `GET /session/:id/status`，即按 id 查询单个会话的实时桥接摘要。除了 `clientCount` 和 `hasActivePrompt` 外，活跃 session 还暴露 `isWaitingForPermission`、`isWaitingForUserQuestion`、`pendingInteractionCount`，以及失败 turn 后保留的 `turnError`。该错误在下一次 prompt 实际开始时清除。在当前 bridge 中已稳定运行 turn 的活跃 session 还携带 `updatedAt`，与 live-state 路由下记录的活动水位标记相同；由于此路由直接返回 bridge 摘要，该值不会与持久化转录 mtime 合并，可能早于 session 列表报告的值。单 session 状态响应和 workspace session 列表都包含 `turnError` 和 `pendingInteractions`：可渲染的权限操作或 `ask_user_question` 问题，加上现有权限投票路由所需的 `requestId` 和可选选项。每个用户问题都有一个 `answerKey`；使用 `answers` 投票，例如 `{ "0": "Polling" }`，以该值为键。仅持久化的 session 省略 runtime 状态，因为不存在 runtime。旧版 daemon 返回 `404`；在轮询单个 session 状态而非扫描完整 session 列表前，请预先检查此 tag。

`session_info` 宣告 `GET /workspace/:id/session-info` 及其 `/workspaces/:workspace/session-info` 对应路由。响应聚合持久化的活跃和归档 session 计数，而不加载列表元数据。这是一个显式的 O(n) 磁盘扫描，不得被轮询；客户端应将 `truncated: true` 视为下界结果。

`session_approval_mode_control`、`workspace_tool_toggle`、`workspace_skill_toggle`、`workspace_skill_batch_toggle`、`extension_batch_activation_v2`、`workspace_init` 和 `workspace_mcp_restart` 宣告了下文记录的变更控制路由。它们受变更门控的严格限制（未配置 bearer token 的 daemon 会以 401 `token_required` 拒绝它们）。旧版 daemon 返回 `404`；在暴露相应功能前，请预先检查每个 tag。

`mcp_guardrails`（issue [#4175](https://github.com/QwenLM/qwen-code/issues/4175) PR 14）涵盖 MCP 预算层面：`GET /workspace/mcp` 上的 `clientCount` / `clientBudget` / `budgetMode` / `budgets[]` 字段、每个服务器单元上的 `disabledReason` 字段，以及 `--mcp-client-budget` / `--mcp-budget-mode` CLI 标志。旧版 daemon 会完全省略这些新字段；SDK 客户端在依赖 `budgets[]` 语义前应预先检查此 tag。注册表描述符还包含 `modes: ['warn', 'enforce']`，以便未来暴露功能模式——目前，客户端从快照的 `budgetMode` 字段推断模式。在 `enforce` 模式下，服务器拒绝行为由 `Object.entries(mcpServers)` 的声明顺序决定；未来的作用域优先级层（如果 qwen-code 采用）会将其转变为"最低优先级优先"，以镜像 claude-code 的 `plugin < user < project < local` 约定。

> **作用域是能力驱动的。** 使用 `mcp_workspace_pool` 时，一个 workspace runtime 内的 session 共享传输池和 `WorkspaceMcpBudget`，快照发出 `budgets[0].scope: 'workspace'`。不同的 workspace runtime 拥有独立的池。没有该标签时，每个 ACP session 使用其旧版 `McpClientManager`，快照发出 `scope: 'session'`，N 个 session 可能各自消耗配置的上限。

`workspace_file_read` 涵盖文本/列表/状态/glob 工作区文件路由（`GET /file`、`GET /list`、`GET /glob`、`GET /stat`）。`workspace_file_bytes` 涵盖 `GET /file/bytes`，该路由是后续添加的，以便客户端可以针对 PR19 时代的 daemon 预先检查原始字节窗口支持。`workspace_file_write` 涵盖感知哈希的文本变更路由（`POST /file/write`、`POST /file/edit`）。write tag 表示路由契约存在；并不意味着当前部署对匿名变更开放。write/edit 是严格的变更路由，即使在环回地址上也需要配置 bearer token。`workspace_file_upload` 涵盖 `POST /file/upload`，即二进制导入路由：`application/octet-stream` body 上限为 `MAX_UPLOAD_BYTES`（50 MiB），写入 workspace 时不会覆盖——已占用的名称会自动编号（`name (1).ext`、`name (2).ext`、...）。它也是严格的变更路由。

当 `workspace_qualified_rest_core` 被通告时，相同的文件暴露面也可在 `/workspaces/:workspace/file`、`/workspaces/:workspace/file/bytes`、`/workspaces/:workspace/stat`、`/workspaces/:workspace/list`、`/workspaces/:workspace/glob`、`/workspaces/:workspace/file/write`、`/workspaces/:workspace/file/edit` 和 `/workspaces/:workspace/file/upload` 使用。

同一标签还暴露了 workspace 限定的项目 agent CRUD，位于 `/workspaces/:workspace/agents` 和 `/workspaces/:workspace/agents/:agentType`。这些复数路由仅读取或变更选定 workspace 的项目级 agent；`global` 和 `user` 作用域请求返回 `400 { code: "global_scope_not_supported_for_workspace_route" }`。无 workspace 的 `/workspace/agents` 路由保留其现有的主 workspace 行为，并且仍然是 user 级 agent 作用域的唯一 REST 暴露面。

`extension_management_v2` 通告用户级 extension 目录和 `/extensions/*` 的变更暴露面，以及 `/workspaces/:workspace/extensions/*` 的 workspace 激活投影。制品是全局的；workspace 路由仅暴露投影读取、精确的激活覆盖和 runtime 刷新。读取可以针对不受信任的已注册 workspace，而激活、刷新和 workspace 作用域的安装需要受信任的目标。慢速变更使用 `/extensions/operations/:operationId` 的 daemon 本地操作；存储代（store generation），而非操作历史，在重启和跨 daemon 间具有权威性。已发布的 `workspace_extensions` 能力和 `/workspace/extensions/*` 路由保留为主 workspace 兼容适配器。客户端必须预检 `extension_management_v2`，不得从 daemon 模式或 `workspace_qualified_rest_core` 推断它。

`extension_git_credentials` 在 `POST /workspace/extensions/install` 和 `POST /extensions/install` 上通告经过认证的 HTTPS Git 安装。客户端在发送 URL userinfo 或 `credentialPersistence` 前必须预检此标签；旧版 daemon 会拒绝 URL 凭证。该标签描述的是后端协议支持，而非密钥链的可用性：stored 模式在终端操作结果中报告所选后端。

`extension_batch_activation_v2` 新增 `PUT /extensions/activation` 和 `PUT /workspaces/:workspace/extensions/activation`。两者接受 `extensionNames` 中的 1–100 个名称，以不区分大小写的方式去重同时保留首次出现的顺序，在一代中持久化变更的目标，并返回一个 `202` 操作句柄。设置 `enabled` 或 `disabled` 时目标无需已安装：其名称会创建一个期望状态声明，当安装同名 Extension 时该声明会被保留。全局路由接受 `state: "enabled" | "disabled"`，写入 V2 `defaultActivation`，并调和每个已注册的 runtime。workspace 路由还接受 `"inherit"`，为选定的受信任 runtime 应用或清除精确覆盖，并仅调和该 runtime。`inherit` 不会为未知名称创建声明；全未知清除报告 `updated: false` 并跳过调和。单数激活路由保持为仅已安装且按 id 寻址。

### Extension Management V2 线路契约

所有路由使用上述 daemon bearer 身份验证规则。`X-Qwen-Client-Id` 对于 V2 变更路由是可选的；提供时，它必须标识已向变更的目标 workspace runtime 之一注册的客户端。`:extensionId` 是小写的 64 位十六进制 extension 标识。`:workspace` 首先解析为精确的 workspace id，否则解析为规范化后的 URL 编码绝对 cwd。

| Method and path                                                    | Success                                                                     |
| ------------------------------------------------------------------ | --------------------------------------------------------------------------- |
| `GET /extensions`                                                  | `200` 全局制品目录                                                            |
| `PUT /extensions/activation`                                       | `202` 全局默认激活批量操作                                                    |
| `PUT /extensions/:extensionId/activation`                          | `202` 全局默认激活操作                                                        |
| `POST /extensions/install`                                         | `202` 安装操作                                                                |
| `POST /extensions/check-updates`                                   | `202` 更新检查操作                                                            |
| `POST /extensions/:extensionId/update`                             | `202` 更新操作                                                                |
| `DELETE /extensions/:extensionId`                                  | `202` 卸载操作，或 extension 不存在时的幂等 `204`                              |
| `GET /extensions/operations/:operationId`                          | `200` 操作快照                                                                |
| `GET /workspaces/:workspace/extensions`                            | `200` workspace 激活投影                                                      |
| `PUT /workspaces/:workspace/extensions/activation`                 | `202` 精确 workspace 激活批量操作                                             |
| `PUT /workspaces/:workspace/extensions/:extensionId/activation`    | `202` 精确 workspace 激活操作                                                 |
| `DELETE /workspaces/:workspace/extensions/:extensionId/activation` | `202` 清除覆盖操作                                                            |
| `POST /workspaces/:workspace/extensions/refresh`                   | `202` runtime 刷新操作                                                        |

全局目录响应为：

```json
{
  "v": 1,
  "generation": 12,
  "extensions": [
    {
      "id": "<64 lowercase hex characters>",
      "name": "demo",
      "version": "1.2.3",
      "installType": "npm",
      "defaultActivation": "enabled",
      "workspaceOverrideCount": 1
    }
  ]
}
```

当没有安装元数据可用时，`installType` 会被省略。`defaultActivation` 为 `enabled` 或 `disabled`。`workspaceOverrideCount` 排除存储的 `inherit` 条目。

workspace 投影响应为：

```json
{
  "v": 1,
  "workspaceId": "workspace-id",
  "workspaceCwd": "/absolute/workspace",
  "trusted": true,
  "desiredGeneration": 12,
  "appliedGeneration": 11,
  "extensions": [
    {
      "extensionId": "<64 lowercase hex characters>",
      "name": "demo",
      "version": "1.2.3",
      "defaultActivation": "enabled",
      "workspaceActivation": "disabled",
      "effectiveActivation": "disabled",
      "activationSource": "workspace_override"
    }
  ]
}
```

`workspaceActivation` 为 `enabled`、`disabled` 或 `null`（表示继承）。`activationSource` 为 `default`、`workspace_override`、`legacy_path_rule` 或 `cli_override`。`desiredGeneration` 是持久化存储代；`appliedGeneration` 是控制器记录的已应用到该 workspace runtime 的最新代，可能会暂时落后。

安装需要明确的同意和初始激活：

```json
{
  "source": "@scope/demo",
  "consent": true,
  "activation": { "scope": "user" },
  "ref": "optional-git-ref",
  "autoUpdate": true,
  "allowPreRelease": false,
  "registry": "https://registry.npmjs.org"
}
```

对于仅 workspace 的初始激活，使用 `{ "scope": "workspace", "workspaceId": "target-workspace-id" }`；目标必须存在且受信任。Daemon 安装接受 GitHub、Git 和 npm 源。`ref` 不适用于 npm，`registry` 仅适用于 npm。`ref`、`autoUpdate`、`allowPreRelease` 和 `registry` 是可选的。

当 `extension_git_credentials` 被通告时，HTTPS Git 源可以包含 userinfo，例如 `https://username:token@git.example.com/org/repository.git`。`credentialPersistence` 仅对此类源有效。它为 `stored` 或 `one_time`，省略时默认为 `one_time`。Stored 模式通过 daemon 的混合密钥存储保存凭证，并仅在安装元数据中保留干净的仓库 URL，因此 extension 保持可更新。One-time 模式既不保存仓库 URL 也不保存凭证，并创建一个不可更新的 `snapshot`；此模式下 `autoUpdate: true` 会被拒绝。在没有 URL 凭证的情况下提供该字段、提供无效凭证，或对 npm、归档、本地、SSH 或非 Git 源使用凭证，都会返回 `400`。

带凭证的安装响应和操作会暴露 `credentialPersistence`，并可能暴露 `credentialStorage` 为 `keychain` 或 `encrypted_file`。One-time 操作省略 `source`；stored 操作可能返回干净的 source。Snapshot 目录/状态条目省略 source，将 `credentialPersistence` 设为 `one_time`，并报告 `not updatable`。更新会因 `extension_not_updatable` 失败；不可用的 stored 密钥会在网络访问前因 `extension_credential_unavailable` 失败。

全局和 workspace 激活 `PUT` 请求使用相同的 body：

```json
{ "state": "enabled" }
```

`state` 为 `enabled` 或 `disabled`。更新、卸载、检查更新、清除激活和刷新请求没有必需的 body。

批量激活请求使用 Extension 名称：

```json
{
  "extensionNames": ["formatter", "review-tools"],
  "state": "disabled"
}
```

Workspace 批量还接受 `"state": "inherit"`。终态全局结果包含 `name` 和 `defaultActivation`；workspace 结果包含 `name`、`workspaceActivation`（inherit 时为 `null`）和 `effectiveActivation`。格式错误的名称会拒绝请求；与现有 Store 标识的冲突会原子性地失败，不会部分提交。未知的 `inherit` 目标不会被持久化，因为清除覆盖不得制造 default-activation 声明或替换后续的安装同意。

每个接受的异步变更返回：

```http
HTTP/1.1 202 Accepted
Location: /extensions/operations/<operation-id>
Retry-After: 1
Content-Type: application/json

{"accepted":true,"operationId":"<operation-id>"}
```

Workspace 限定的变更使用相同的全局 `/extensions/operations/:operationId` 轮询路径。操作历史是进程本地的，仅保留有界的终态条目数量，并在 daemon 重启时丢失；当操作 id 消失时，客户端必须重新读取目录或 workspace 投影并比较代。

操作快照的结构如下：

```json
{
  "v": 1,
  "operationId": "<operation-id>",
  "operation": "install",
  "status": "running",
  "phase": "preparing",
  "createdAt": 1750000000000,
  "updatedAt": 1750000000100,
  "source": "owner/repository",
  "name": "demo"
}
```

`status` 从 `queued` 过渡到 `running`，然后到 `succeeded`、`succeeded_with_warnings` 或 `failed`。运行中时，`phase` 为 `preparing`、`committing` 或 `reconciling`。终态成功可能包含 `result`，其 `status` 等于 `installed`、`enabled`、`disabled`、`updated`、`uninstalled`、`checked` 或 `refreshed`；协调结果还可以额外包含 `refreshed`、`failed` 和 `error`。更新检查返回 `result.states`，以 extension 名称为键，值如 `checking for updates`、`update available`、`up to date`、`not updatable` 或 `error`。

持久化提交后跟不完整的清理或 runtime 协调不会被报告为失败的变更。它返回 `succeeded_with_warnings` 并保留已提交的结果：

```json
{
  "v": 1,
  "operationId": "<operation-id>",
  "operation": "activation",
  "status": "succeeded_with_warnings",
  "createdAt": 1750000000000,
  "updatedAt": 1750000000200,
  "result": {
    "status": "disabled",
    "name": "demo",
    "refreshed": 1,
    "failed": 1
  },
  "warnings": [
    {
      "workspaceId": "workspace-id",
      "workspaceCwd": "/absolute/workspace",
      "code": "reconcile_slow",
      "error": "Runtime reconciliation took 31000ms."
    }
  ]
}
```

警告的 `workspaceId` 和 `code` 是可选的；`workspaceCwd` 和 `error` 始终存在。客户端应显示警告、刷新其目录/投影，并且不得盲目重试持久化变更。

验证和授权失败是同步 HTTP 错误，使用 `{ "error": "...", "code": "..." }`（当存在稳定的 code 时）。重要的情况包括 `400 invalid_extension_id`、`400 invalid_extension_activation`、`400 workspace_mismatch`、`403 untrusted_workspace`、`404 extension_operation_not_found` 和 `429 extension_queue_full`。安装验证还会为无效的 source/ref/registry 选项、缺少同意或缺少/无效的初始激活返回 `400`。在 `202` 之后失败的变更在操作历史中保留时，以 `status: "failed"`、`error` 和可选的稳定 `code` 表示；常见的 code 包括 `extension_prepare_timeout` 和 `extension_conflict`。操作的 HTTP `404` 不意味着回滚，因为操作历史不是持久化的。

`daemon_status` 宣告了 `GET /daemon/status`，即下文记录的整合型只读运维诊断快照。

**条件 tag。** 只有当匹配的部署开关、runtime 连接或可用性条件处于活动状态时，才会宣告功能 tag。Tag 存在 = 文档中记录的行为可用；Tag 缺失 = 要么是早于该 tag 的旧版 daemon，要么是该条件为 false 的当前 daemon。目前包括：

<!-- conditional-serve-features:start -->

| Tag                                 | 宣告条件                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `require_auth`                      | daemon 启动时带有 `--require-auth`（或通过嵌入式 API 设置 `requireAuth: true`）。每个路由都强制要求 Bearer token，包括环回绑定上的 `/health`。                                                                                                                                                                                                                                                                                                                                    |
| `mcp_workspace_pool`                | 共享 MCP 传输池处于活动状态。当 `QWEN_SERVE_NO_MCP_POOL=1` 禁用该池时省略。                                                                                                                                                                                                                                                                                                                                                                                                             |
| `mcp_pool_restart`                  | 共享 MCP 传输池处于活动状态；重启响应可能包含感知池的多条目结构。                                                                                                                                                                                                                                                                                                                                                                                                           |
| `external_tool_guard`               | `qwen serve` 完成了 `--external-tool-guard-mode=required` 的启动握手；每个生成的 ACP channel 必须在 Session 创建前确认已安装的回调，每个到达最终执行边界的受支持的顶层托管 ACP 工具调用必须收到一个外部执行前允许。更早的 permission/hook 拒绝不会发起 provider 请求。嵌套的 AgentCore 执行不在 v1 范围内，会被拒绝。                                                                                                                      |
| `allow_origin`                      | T2.4 ([#4514](https://github.com/QwenLM/qwen-code/issues/4514))。daemon 启动时带有至少一个 `--allow-origin <pattern>`（或通过嵌入式 API 设置 `allowOrigins: [...]`）。来自匹配源的跨域请求会收到正确的 CORS 响应头；不匹配的源仍会收到默认的 403。配置的 pattern 列表故意不在 `/capabilities` 中回显，以避免向未认证的读取者泄露受信任源集——浏览器 webui 已经知道自己的源。 |
| `prompt_absolute_deadline`          | `--prompt-deadline-ms` / `QWEN_SERVE_PROMPT_DEADLINE_MS` / `ServeOptions.promptDeadlineMs` 被设置为正整数。                                                                                                                                                                                                                                                                                                                                                                                        |
| `writer_idle_timeout`               | `--writer-idle-timeout-ms` / `QWEN_SERVE_WRITER_IDLE_TIMEOUT_MS` / `ServeOptions.writerIdleTimeoutMs` 被设置为正整数。                                                                                                                                                                                                                                                                                                                                                                             |
| `workspace_settings`                | daemon 创建时启用了设置持久化功能。                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `workspace_voice`                   | 设置持久化可用，因此旧版主 workspace Voice 设置路由处于活动状态。                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `workspace_voice_transcription`     | 主 workspace 配置了 Voice 转录模型。                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `session_shell_command`             | 明确启用了会话 shell 执行。                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `session_artifacts_persistence`     | session 制品持久化已为 runtime 连接。                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `session_generation`                | session 生成助手可用。                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `workspace_generation`              | workspace 作用域的生成助手可用。                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `rate_limit`                        | 启用了 `--rate-limit` / `QWEN_SERVE_RATE_LIMIT=1` / `ServeOptions.rateLimit`。                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `workspace_reload`                  | 嵌入式路由配置中提供了工作区重载支持。                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `workspace_trust_hot_reload`        | workspace 信任策略监控和 runtime 代协调已连接，因此信任变更无需重启 daemon 即可生效，且 v2 信任状态报告会反映收敛情况。                                                                                                                                                                                                                                                                                                                                                                   |
| `channel_reload`                    | daemon 管理的 channel worker 管理器已启用，且可以重新加载其当前选择。                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `channel_control`                   | daemon 管理的 channel worker runtime 控制已连接。                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `channel_management`                | workspace 作用域的 Channel 设置、生命周期和配对管理已连接。                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `multi_workspace_sessions`          | 注册了多个 workspace runtime，因此 session 创建可以通过 cwd 选择受信任的 runtime。                                                                                                                                                                                                                                                                                                                                                                                                          |
| `multi_workspace_session_rewind`    | 注册了多个 workspace runtime；单数活跃 session 回退路由解析拥有该 session 的 runtime。                                                                                                                                                                                                                                                                                                                                                                                                         |
| `multi_workspace_session_shell`     | 注册了多个 workspace runtime 且 session shell 执行已明确启用；单数 REST shell 解析拥有该 session 的 runtime。                                                                                                                                                                                                                                                                                                                                                                                 |
| `dynamic_workspace_registration`    | workspace runtime 工厂已连接到 daemon，因此现有的受信任目录可以在运行时被注册为次要 runtime。                                                                                                                                                                                                                                                                                                                                                                                                |
| `persistent_workspace_registration` | workspace 注册的持久化存储已配置。`runQwenServe` 会自动提供用户级存储；直接的 `createServeApp` 嵌入必须显式注入一个并自行管理启动时的 workspace 注册表恢复。                                                                                                                                                                                                                                                                                                                                   |
| `scratch_workspace_registration`    | 托管的 scratch workspace 创建可用——runtime 工厂、经过验证的托管 scratch 根目录和 runtime 处置已连接，且每个托管 runtime 都遵守 scratch 根目录边界。                                                                                                                                                                                                                                                                                                                                          |
| `workspace_runtime_removal`         | 可移除的动态或持久化恢复的次要 runtime 可以通过管理路由进行排空和移除。                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `workspace_qualified_acp`           | ACP HTTP 和多 workspace runtime 均已启用，因此复数 ACP 端点可以选择次要 runtime。                                                                                                                                                                                                                                                                                                                                                                                                          |
| `workspace_qualified_voice`         | 多 workspace runtime 和共享 ACP/Voice WebSocket 监听器均已启用，因此每个 workspace 限定的 Voice 模态对次要 runtime 均可达。                                                                                                                                                                                                                                                                                                                                                                  |
| `workspace_qualified_memory`        | ACP HTTP 和多 workspace runtime 均已启用，因此 workspace 限定的托管 memory 路由可以为 remember、forget 和 dream 操作选择按 workspace 的任务通道。                                                                                                                                                                                                                                                                                                                                              |
| `client_mcp_over_ws`                | daemon 接受通过 ACP WebSocket 的客户端托管 MCP server。这是显式 opting，CDP 隧道路径不需要它。                                                                                                                                                                                                                                                                                                                                                                                               |
| `cdp_tunnel_over_ws`                | daemon 暴露反向 `/cdp` WebSocket 隧道，通过显式 opting 或因 Chrome extension origin 被允许。这仅表示隧道存在；并不意味着 Chrome DevTools MCP 工具已注册。                                                                                                                                                                                                                                                                                                                                      |
| `browser_automation_mcp`            | ACP HTTP 已启用，`cdp_tunnel_over_ws` 处于活动状态，无 bearer token 阻止 `/cdp`，且 `QWEN_CDP_MCP_COMMAND` 命名了一个外部 stdio MCP adapter。主 CLI 包不捆绑浏览器自动化 adapter；没有此 tag 时，Chrome extension 侧面板聊天可能仍然有效，但 console/network/screenshot/click 工具默认不注册。                                                                                                                                                                                                    |
| `voice_transcribe`                  | Voice WebSocket 端点已挂载；仍需配置 Voice 模型才能成功转录。                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `realtime_voice`                    | macOS WebShell daemon 已启用 Live Voice 且原生 Host 集成处于活动状态。`/live/status` 报告就绪状态，但该能力在功能启用前会被撤回。                                                                                                                                                                                                                                                                                                                                                             |

<!-- conditional-serve-features:end -->

`mcp_guardrails` **不**在此条件表中——它是一个始终开启的标签，只要二进制文件支持新的 `/workspace/mcp` 预算字段就会进行通告，无论 operator 是否配置了预算。未设置 `--mcp-client-budget` 的 operator 依然会获取新字段（此时 `budgetMode: 'off'`，`budgets: []`）。

`mcp_guardrail_events`（issue [#4175](https://github.com/QwenLM/qwen-code/issues/4175) PR 14b）通告了类型化的 SSE 推送事件，这些事件可以在无需轮询循环的情况下反映 MCP 预算状态的跨越情况。`GET /session/:id/events` 会接收两种帧类型：

- `mcp_budget_warning` — 在 `reservedSlots.size / clientBudget` 向上跨越 75% 时触发一次。仅当该比例降至 37.5%（`MCP_BUDGET_REARM_FRACTION`）以下时才会重新触发。它镜像了 PR 10 中 `slow_client_warning` 的迟滞机制，但作用于 manager 级别而非每个 subscriber 的积压级别。Payload：`{ liveCount, reservedCount, budget, thresholdRatio: 0.75, mode: 'warn' | 'enforce' }`。在 `warn` 和 `enforce` 模式下均会触发；在 `off` 模式下永不触发。
- `mcp_child_refused_batch` — 在每次 `discoverAllMcpTools*` 遍历结束时，如果有一个或多个 server 被拒绝则触发；同时在 `readResource` 的 lazy-spawn 拒绝路径上作为长度为 1 的批次触发。Payload：`{ refusedServers: [{ name, transport, reason: 'budget_exhausted' }, ...], budget, liveCount, reservedCount, mode: 'enforce' }`。`mode` 为字面量 `'enforce'`，因为 `warn` 模式永远不会拒绝。

这两个事件都存在于每个 session 的 SSE 重放环中（它们带有 `id`），因此使用 `Last-Event-ID` 重新连接的客户端可以通过它们恢复状态；`GET /workspace/mcp` 处的快照仍然是长时间断开连接后状态的唯一真实来源（source-of-truth）。一旦通告即为始终开启——没有条件开关。SDK reducer 状态（`DaemonSessionViewState`）暴露了 `mcpBudgetWarningCount`、`lastMcpBudgetWarning`、`mcpChildRefusedBatchCount`、`lastMcpChildRefusedBatch`，供需要简单延迟风格 UI 的 adapter 使用。

## 路由

### `GET /health`

存活探针（Liveness probe）。默认形式在 listener 启动时返回 `200 {"status":"ok"}`——开销小，无需访问 bridge，适用于高频的 k8s/Compose 存活探针。

传递 `?deep=1`（也接受 `?deep=true` 或单独的 `?deep`）以使用 daemon 级探针，该探针聚合所有受管 workspace runtime 的 bridge **计数器**，包括仍在排空中的 workspace（仅供参考，并非真正的存活检查）：

```json
{
  "status": "ok",
  "workspaceCount": 2,
  "sessions": 3,
  "pendingPermissions": 1,
  "activePrompts": 1,
  "activeWork": true,
  "activeWorkReporting": "full",
  "activeWorkStaleMs": 4200,
  "connectedClients": 2,
  "channelAlive": true,
  "lastActivityAt": "2026-07-15T08:30:00.000Z",
  "idleSinceMs": 120000
}
```

`sessions`、`pendingPermissions` 和 `activePrompts` 为汇总值。`activeWork` **不统计后台 shell、Monitor、workflow、cron 任务或后续建议** — 当任何 runtime 拥有一个已接受但未结算的 prompt（包括 FIFO 等待中的 prompt）、一个运行中的后台 Agent，或一个排队/进行中的 Agent 终端通知时为 true，仅此而已。它是 session 作用域的：尚无 session 附加的 channel 级工作 — 进行中的 spawn、待处理的恢复、MCP 发现或身份验证 — 不会被计入，因此 `activeWork` 可能为 false，而 daemon 仍拒绝回收该 channel。不要将此字段解读为"daemon 可被回收"；它仅描述 session 拥有的工作。`activeWorkReporting` 说明该布尔值中有多少实际被担保：`full` 表示每个活跃 session 都有来自报告所有类别的子进程的新鲜报告，`none` 表示没有 session 有，`partial` 表示介于两者之间的任何情况 — 包括过时的快照或从未确认该能力的旧版子进程。超过三个报告间隔的快照不再算作覆盖：它不是该 session 空闲的报告，因此该 session 回到保留状态，就像子进程从未报告过一样。`activeWorkStaleMs` 是该布尔值所依据的最旧快照的年龄，**仅限于被覆盖的 session**，当没有 session 被覆盖时为 `0`；它是诊断性的，因为新鲜度已由 daemon 分级到 `activeWorkReporting` 中（只有 daemon 知道每个 channel 的协商节奏）。该分级在每个受管 runtime 上计算一次而非按 runtime 计算，然后合并 — 没有 session 的 runtime 是空真的完整，将其视为证据会让空 workspace 为另一个 workspace 未报告的 session 作担保。`lastActivityAt` 是最新的非空 workspace 活动时间，`idleSinceMs` 由同一快照推导得出。`channelAlive` 表示至少有一个受管 workspace channel 存活；并不意味着每个 workspace 都健康。`connectedClients` 和可选的 `rateLimitHits` 仍然是 daemon 全局计数器，而非按 workspace 汇总。

重启控制器应在以下条件时将 daemon 视为忙碌：

```ts
const busy =
  health.activePrompts > 0 ||
  health.activeWork ||
  health.activeWorkReporting !== 'full';
```

去掉第三项会使 `activeWork === false` 与"没有子进程告诉我任何事"无法区分，而这正是据此行动不安全的唯一情况。未知响应和失败的探针也必须阻止重启。`activePrompts` 保留为独立的兼容性信号。

这些字段是观察缓存，而非重启租约：即使是新鲜的、完全分级的、空的答案也描述的是采样时刻，工作可能在此之后立即开始。上述规则大幅降低了错误重启的风险，但并未消除它 — 严格安全需要一个 prepare-restart 栅栏，停止新的工作准入，确认 drain，然后才关闭。

> ⚠️ 深度探针是**信息性的**，并非真正的存活验证或原子回收租约。协商的 ACP 子进程按协商的节奏发布 channel 范围的活跃工作快照，daemon 将其新鲜度分级到 `activeWorkReporting` 中 — 但它绝不会因缺失报告而终止 channel，因为一个 session 的沉默不是进程已死亡的证据。传输活跃性和停滞 Agent 检测是独立的机制。`connectedClients` 统计的是 REST SSE 连接，而非所有 ACP 传输。使用重复采样和优雅关闭进行空闲回收；使用经过认证的 `/daemon/status` 进行传输和按 workspace 的诊断。如果任何受管 runtime getter 抛出异常，深度探针会 fail closed 并返回 `503 {"status":"degraded","reason":"aggregation_failed"}`，而不是返回部分汇总，daemon 日志会标识失败的 workspace runtime。在引导期间，runtime 注册表就绪之前，它返回 `503 {"status":"degraded","reason":"bootstrap"}` 并带有 `Retry-After: 1`。对于 listener 存活检查，请使用不带 `?deep` 的默认 `/health`。

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
    "maxSessions": 32,
    "maxTotalSessions": null,
    "maxPendingPromptsPerSession": 5,
    "listenerMaxConnections": 256,
    "eventRingSize": 8000,
    "compactedReplayMaxBytes": 4194304,
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

多 workspace 响应还包含顶层的 `workspaces[]` 行，格式为 `{ id, cwd, displayName?, primary, trusted }`。可选的 display name 未设置时会被省略，且仅用于展示；状态消费者必须继续使用 `id` 或 `cwd` 来关联 runtime。

`runtime.perf` 是可选的。存在时，它仅报告 daemon 进程的事件循环延迟、prompt FIFO 队列等待采样以及 daemon 子进程管道字节计数器；ACP 子进程的事件循环延迟不包含在 `/daemon/status` 中。

如果任何 issue 具有 error 严重性，则 `status` 为 `error`；如果任何 issue 具有 warning 严重性，则为 `warning`；否则为 `ok`。Issue 代码是稳定的，包括 `session_capacity_high`、`connection_capacity_high`、`pending_permissions`、`acp_channel_down`、`preflight_error`、`mcp_budget_warning`、`mcp_budget_exhausted`、`rate_limit_hits`、`channel_worker_exited`、`channel_worker_partial_connect` 和 `workspace_status_unavailable`。在 listener 就绪但完整 runtime 挂载之前的短暂窗口期内，`/daemon/status` 可能会报告 `daemon_runtime_starting`；如果异步 runtime 挂载失败，它将报告 `daemon_runtime_failed`，同时非状态 runtime 路由返回 `503`。

`runtime.activity` 报告 daemon 全局的 prompt 活动。`activePrompts` 统计具有进行中 prompt 的 session 数量。`pendingPrompts` 统计所有已接受但尚未完成的 prompt，包括正在运行的 prompt 和 FIFO 等待中的 prompt。`queuedPrompts` 统计已接受但尚未分发的 FIFO 等待中的 prompt。`lastActivityAt` 是最后一次 prompt 开始/结束或 session 生成的 ISO 8601 时间戳；如果 daemon 自启动以来从未处理过任何活动，则为 `null`。`idleSinceMs` 在生成响应时根据 `lastActivityAt` 计算得出。

`limits.memory` 是增量字段，报告 daemon 的已解析内存数据：必需的 `enforced: false`、一个 `childHeap` 对象（`mode`；`maxConcurrentChildren` 和 `perChildCeilingMb`，在 `mode: 'off'` 下两者均为 `null`，不建模任何内容——且 `perChildCeilingMb` 在无法在 `modeled.minChildHeapMb` 内建模分区时也额外为 `null`——要么池无法以该下限覆盖一个子进程，要么在上限被 `modeled.legacyChildCeilingMb`（即 `floor(available / 2)`）截断后低于下限，这发生在主机内存低于 1024 MB 时。它永远不为 0，且在这些情况下 `maxConcurrentChildren` 为 `0`，因为无法建模分区的主机是一个计算结果而非缺失模型），以及 `refusals`（本会超出建模限制的 spawn 数）。`configuredBudgetMb`、`effectiveBudgetMb`（配置值在已解析的 cgroup/主机内存处封顶）、`budgetSource`（`flag` / `derived`）、`availableMemoryMb`、`availableMemorySource`（`constrained` / `host`）、`insufficientMemory`，以及一个 `modeled` 对象，包含 `rootReserveMb`、`childPoolMb`、`minChildHeapMb`、`maxChildHeapMb` 和 `legacyChildCeilingMb`（对今天 ACP 子进程获得的上限的保守模型，可能低于实际值）。`runtime.memory` 还报告 `registeredWorkspaces`（注册计数——未移除的 workspace 条目，包括排空中、转换中或被阻止的条目；不是活跃子进程计数）、`activeAcpChildren`（具有活跃非垂死通道的 daemon 管理的 ACP 子进程——包括转换中或受阻的条目，但排除已开始 kill 的 workspace，即使子进程尚未退出；不包括 channel worker、MCP 后代或未附加的 spawn 预留）、`childRssCoverage`（`active_children`——每个具有活跃通道的 ACP 子进程，即 `activeAcpChildren` 统计的集合；旧版 daemon 发送 `primary_only`）、一个 `children` 对象（见下文描述），以及一个 `modeled` 对象，包含 `recommendedShareAtRegisteredMb`（无 workspace 注册时为 `null`）和 `recommendedShareAtActiveMb`（无子进程活跃时为 `null`）。每个份额在上限处封顶，在下限处取底（仅当上限允许时——在小型主机上下限低于下限，因此份额 × 数量可能超过子进程池）。将份额视为建议值，而非池的分区。所有这些都是观察值：没有子进程 spawn 参数从这些值派生，也没有请求基于它们被拒绝。`childHeap` 建模 `modeled.childPoolMb` 的固定分区——每个子进程获得相同的 `perChildCeilingMb`，因此建模总量保持在池内，而非像按 spawn 累计份额那样增长。将 `refusals` 仅视为准入压力：计数为 0 **不**意味着分区可以安全应用，因为子进程运行在更大的主机派生上限上，因此需要比 `perChildCeilingMb` 更多老年代空间的工作负载在此处是健康的，只有在应用分区后才会失败。非零计数不一定意味着容量压力的另外两个原因：准入决策会统计正在终止的子进程直到其退出，因此在已达到 `maxConcurrentChildren` 的 daemon 上，每次 channel 替换在重叠窗口期间都会记录一次拒绝；且在太小而无法建模分区的主机上 `maxConcurrentChildren` 为 `0`，因此 `refusals` 等于总 ACP spawn 计数，`insufficientMemory` 是解释该情况的字段。在正常的 `runQwenServe` 路径上，预算在引导应用创建之前解析，因此 `limits.memory` 在引导窗口期间已填充。仅在未解析预算的路径上（如直接嵌入绕过 `runQwenServeImpl`）为 `null`。SDK 类型允许 `null`，因此正确的客户端可以处理。

`runtime.memory.children` 在该块内是增量的，报告 `childRssCoverage` 命名的子进程的聚合 RSS：`rssBytes`（它们自报 RSS 的总和）、`sampled`（有多少产生了读数）和 `oldestReadingAgeMs`（总和中最早读数的年龄，因此调用者可以判断各部分的采集时间间隔）。`sampled` 的分母是兄弟字段 `activeAcpChildren`，不在块内重复；当 `sampled` 较低时，`rssBytes` 是下界而非总量。采样由活跃的 SSE/WS watcher 门控，因此对无人流式传输的 daemon 发起状态请求会报告 `sampled: 0`，即使有活跃子进程——旁边的 `activeAcpChildren` 使该差距可见，而 `rssBytes: 0` 且 `sampled: 0` 永远不表示测量为零。当没有采样时以及当每个贡献者都是早于该字段的 bridge 时，`oldestReadingAgeMs` 为 `null`，因此它永远不表示"新鲜"。将总和视为同时高估和低估：按进程汇总 RSS 会重复计算子进程共享的页面，而每个子进程仅报告自己的进程，因此其 MCP 后代和每个 channel worker 都缺失。它不是 daemon 树的内存。该字段在 SDK 镜像中是可选的，因为报告 `primary_only` 的 daemon 从不发送它。

`runtime.memory.pressure` 在该块内是增量的，报告 daemon 根进程自身的内存压力：`mode`（`off` / `observe`）、`level`（`normal` / `soft` / `hard` / `critical`）、`source`（`rss` / `heap` / `unknown`）、`ratio`，以及比率来源的六个原始数据——`rssBytes`、`rssRatio`、`availableBytes`、`heapUsedBytes`、`heapRatio`、`heapLimitBytes`。`ratio` 是 `rssRatio` 和 `heapRatio` 中较大的一个，`source` 命名其来源；平局报告为 `rss`。`availableBytes` 是 `limits.memory.availableMemoryMb` 的字节形式——故意使用检测到的 cgroup/主机数据而非 `effectiveBudgetMb`，因为终止进程的是真实限制，而非操作员的策略数字。`source: "unknown"` 表示两个分母都不可测量，不得被解读为健康；`level` 在这种情况下为 `normal` 仅因为没有可分类的内容。这些数据仅覆盖 daemon **根进程**：它们是此进程自身的 `memoryUsage()`，因此子进程增长不会影响它们。`runtime.memory.children` 单独报告子进程数据，两个数据都不是进程树内存。两种模式都报告整个块；仅 `observe` 会额外将无路径的 `daemon_memory_pressure` 警告提升到状态汇总中，因此 `off` 保持顶层 `status` 不变。两种模式下都不会自动修复。该字段在 SDK 镜像中是可选的，因为在它存在之前就发布了 `runtime.memory` 的 daemon 会发送不包含它的块。

`limits.maxTotalSessions` 是增量字段。`null` 表示有效的 daemon 全局新 session 上限已禁用。当存在多个启动/恢复的 workspace、省略了 `--max-total-sessions`，且 `maxSessionsPerWorkspace` 有限时，daemon 会将有效的总上限推导为 `maxSessionsPerWorkspace * startupWorkspaceCount`；后续动态注册不会重新计算。设置后，它限制跨 daemon 的新 session 创建，并使用现有的 `session_limit_exceeded` 错误格式加上 `scope: "total"` 报告总限制失败。

`runtime.channel.live` 报告 daemon 内部的 ACP bridge 通道。它不是 channel-adapter worker。Daemon 管理的通道使用 `runtime.channelWorker`，其 `state` 为 `disabled`、`starting`、`running`、`exited`、`failed` 或 `stopped` 之一。当 worker 达到 `running` 状态然后退出时，`/daemon/status` 保持 daemon 在线，并报告 warning issue 代码 `channel_worker_exited`。

Daemon 管理的 channel worker 启动依然保持快速失败（fail-fast）：如果 `qwen serve --channel ...` 无法启动一个达到 ready 状态的 worker，则 serve 启动失败。在 worker 达到 ready 状态后，意外退出将由 serve supervisor 在有限策略内重启：在 5 分钟窗口内最多尝试重启 3 次，退避时间分别为 1s、5s 和 15s。Worker 每 15s 发送一次 IPC 心跳；如果 45s 内未观察到心跳，supervisor 会将 worker 视为过期，将其终止，记录 `staleHeartbeatAt`，并使用相同的路径进行重启。

`runtime.channelWorker` 可能包含附加的操作字段：`requestedChannels`、`pid`、`startedAt`、`exitCode`、`signal`、`error`、`restartCount`、`lastExitAt`、`lastRestartAt`、`nextRestartAt`、`lastHeartbeatAt`、`staleHeartbeatAt`、`startupFailures` 和 `startupFailuresTruncated`。每个启动失败包含 `channel`、`phase`（当前为 `connect`）、可选的 adapter 提供的 `code`，以及经过凭证脱敏的 `message`。当前 worker 代最多保留 64 个失败；截断标志表示观察到了更多失败。`code` 是诊断性的，不是稳定的跨适配器分类。`restartCount` 是此 serve 进程在其生命周期内进行的重新启动尝试次数；除非存在其他 issue，否则 `restartCount > 0` 的运行中 worker 是健康的。如果运行中 worker 的 `requestedChannels` 包含 `channels` 中缺失的名称，则报告 `channel_worker_partial_connect`。

在多 workspace daemon（`--workspace` 重复）上，`runtime` 还包含 `channelWorkers[]`——每个拥有 workspace 一个条目，每个都是带有 `workspaceId`、`workspaceCwd` 和 `primary` 注解的 `channelWorker` 快照。`channelWorker` 保持填充为主 workspace 的快照以兼容。单 workspace daemon 省略 `channelWorkers[]`。

### Daemon 管理的 channel 控制

`channel_control` 能力通告 runtime 选择资源。该资源是 daemon 全局的，即使其兼容路径使用单数 `/workspace` 前缀。Runtime 选择不会被持久化，也不会修改 daemon 的启动时 `--channel` 选项。

`GET /workspace/channel` 返回一个不可变的管理器快照：

```json
{
  "enabled": true,
  "selection": { "mode": "names", "names": ["telegram", "feishu"] },
  "pendingSelection": { "mode": "names", "names": ["telegram"] },
  "transition": "reconciling",
  "workers": [
    {
      "workspaceId": "primary-id",
      "workspaceCwd": "/work/primary",
      "primary": true,
      "enabled": true,
      "state": "running",
      "channels": ["telegram"],
      "pid": 1234
    }
  ]
}
```

禁用时 `selection` 为 `null`。`pendingSelection` 仅在变更期间存在。`transition` 为 `idle`、`starting`、`reconciling`、`stopping` 或 `rolling_back` 之一。

`PUT /workspace/channel` 受严格门控，仅接受一个选择：

```json
{ "selection": { "mode": "all" } }
```

```json
{ "selection": { "mode": "names", "names": ["telegram", "feishu"] } }
```

名称会被去除首尾空格并去重，不排序；空的 names 数组无效。`all` 仍然仅限主 workspace。从禁用到启用的变更返回 `201`；幂等的 PUT 或替换返回 `200`。响应为 `{ changed, replaced, partial, state }`。相同的选择保持健康的 worker 不变，但会恢复 worker 已停止或失败的相同选择。

`DELETE /workspace/channel` 受严格门控且幂等。返回 `{ changed, state }`；成功状态为 disabled。`POST /workspace/channel/reload` 也受严格门控，重新读取设置、重新解析 workspace 组，并强制协调已提交的选择。禁用时返回 `409 channel_worker_not_enabled`。`channel_reload` 能力仅在管理器拥有已提交的可重载选择时动态通告。

每次启用、替换、重载、停止和 daemon 关闭都进入一个 FIFO 生命周期通道。GET 不等待该通道。有序选择未变更的 workspace 组保持在线。替换失败会尝试停止新启动的 worker 并恢复先前已提交的选择。客户端必须检查 `rolledBack`、`rollbackError` 和 `state`，因为清理或恢复也可能失败。Daemon 在整个事务期间保持 channel-service PID 租约，直到每个相关子进程退出被确认后才释放。

稳定的控制错误包括：

- `400 invalid_channel_selection`、`channel_workspace_mismatch` 或 `ambiguous_channel_workspace`
- `403 untrusted_workspace`
- `409 channel_service_conflict` 或 `channel_worker_not_enabled`
- `500 channel_worker_stop_failed`
- `502 channel_worker_start_failed`，带有 `rolledBack` 和可选的经过凭证脱敏的 `rollbackError`
- `503 daemon_draining`

对没有配置 token 的 daemon 的严格写入在控制代码运行前返回 `401 token_required`。请求开始后，断开 HTTP 客户端不会取消生命周期事务；客户端可以安全地重试相同的 PUT。

对于 `502 channel_worker_start_failed`，响应可能还包含 `startupFailures[]` 和 `startupFailuresTruncated`。每个失败添加所尝试 worker 的受信任 `workspaceCwd`。这些字段描述失败的事务，而 `state` 描述回滚后的当前状态；后续的 GET 不会保留失败的尝试。部分连接的 worker 则返回成功，并在 worker 快照中暴露其失败。启动时的全部失败仍然会在可查询的 daemon 存在之前中止 `qwen serve`。

`qwen channel status` 在不带 `--daemon-url` 时继续读取 pidfile 元数据；带 `--daemon-url` 时读取 `GET /workspace/channel`。在重启窗口期间，serve 拥有的 pidfile 保持保留状态，但会省略 `workerPid`，以免客户端显示过期的 worker 进程。在多 workspace daemon 上，pidfile 还携带一个附加的 `workers[]` 数组（每个 workspace 的 `workspaceId` / `workspaceCwd` / `channels` / 活跃 `workerPid`），而顶层的 `channels`（并集）和 `workerPid`（主 workspace）保持填充，以兼容旧版读取者；单 workspace daemon 保持原始的单 worker 结构。Worker 的 stdout/stderr 会被转发到 daemon 日志中，同时会脱敏（redacted）bearer token、敏感的 worker 环境变量值以及代理 URL 凭据。

### Workspace Channel 管理

`channel_management` 能力通告 workspace 作用域的 Channel 配置和 runtime 管理。单数 `/workspace` 路由针对主 runtime。`/workspaces/:workspace` 解析精确的已注册受信任 runtime，且从不回退到主 runtime。

只读发现使用：

- `GET /workspace/channel-types`
- `GET /workspace/channels`
- `GET /workspaces/:workspace/channel-types`
- `GET /workspaces/:workspace/channels`

目录将本管理 API 支持的类型标记为 `manageable: true`。实例快照包含修订版、脱敏的秘密存在状态元数据、启动状态和 runtime 状态；字面秘密永远不会被返回。Channel 快照使用 `Cache-Control: no-store`。

字段描述符可以通过 `properties` 暴露嵌套对象元数据。数值描述符可以使用 `exclusiveMinimum` 表示开放下界。不渲染已通告字段类型的客户端必须保留其现有配置值，而不是强制转换或删除它。对象字段不能是必需的，嵌套属性不能是秘密或环境可解析字段；这些管理协议仍然仅限顶层。嵌套的 `required` 属性仅在其父对象存在于写入中时才被强制执行；省略父对象则其嵌套要求不被检查。写入会整体替换每个字段的存储值，因此保留对象意味着重新发送存储的对象；daemon 不会合并部分对象。

配置写入使用乐观并发和严格的 bearer token 门控：

- `PUT /workspace/channels/:name`
- `DELETE /workspace/channels/:name`
- `PUT /workspace/channels/:name/startup`
- 等效的 `/workspaces/:workspace/...` 路由

每个设置变更包含 `expectedRevision`。Upsert 请求包含一个 `config` 对象，并可能包含显式的秘密操作：`preserve`、`replace` 或 `clear`。Channel 配置不能选择已解析 workspace 之外的工作目录。

Runtime 操作是严格门控的 `POST` 请求，目标为 `.../channels/:name/start`、`stop` 或 `restart`。它们仅操作由已解析 workspace 拥有的 worker。

配对管理仅适用于配置了 `pairing` sender 策略或 group policy 的实例：

- `GET .../channels/:name/pairing-requests`
- `POST .../channels/:name/pairing-requests/approve` 携带 `{ "code": "..." }`
- `GET .../channels/:name/pairing-approvals`
- `DELETE .../channels/:name/pairing-approvals` 携带 `{ "senderId": "..." }` 或 `{ "groupId": "..." }`

所有配对路由都需要 bearer token 并使用 `Cache-Control: no-store`。请求、批准和撤销的作用域限定在选定的 Channel 实例和 workspace。待处理的请求包含类型化的 user 或 group subject；group 请求还保留发起请求的 sender。批准快照包含 `senderIds` 和 `groupIds`，因为允许列表不持久化显示名称。撤销未知的 user 或 group 返回 `404 channel_pairing_approval_not_found`。

### Channel 投递和 Notify

`channel_delivery` 通告即时、尽力投递支持。它是一种协议能力，而非 worker 健康信号。投递从不启动缺失的 worker、不回退到另一个 workspace、不重试、不持久化发件箱，也不重放历史通知。

直接 Notify 绕过 Agent 和 Session，等待一次发送尝试：

```http
POST /workspace/notify
POST /workspaces/:workspace/notify
Authorization: Bearer <token>
Content-Type: application/json

{
  "text": "service unavailable",
  "delivery": {
    "kind": "channel",
    "target": {
      "channelName": "dingtalk",
      "type": "user",
      "id": "platform-user-id"
    }
  }
}
```

两个路由都使用严格变更门控。限定路由仅解析已注册的受信任 workspace。成功为 `200 {delivered:true,deliveryId}`。`delivered:true` 表示 Channel 发送 Promise 已解析；它不证明 provider 接受、用户收到或已读回执。Provider 特定的响应验证和跨 IM adapter 的一致错误原因语义不在此 V1 契约范围内。
错误包括 `400 channel_delivery_invalid`、`503 channel_worker_unavailable` 或 `channel_delivery_queue_full`、`504 channel_delivery_timeout`，以及 `502 channel_delivery_rejected` 或 `channel_delivery_failed`。超时表示结果未知，不会重试。
故意没有单独的连接测试端点：正常的 Notify 调用就是端到端测试。

可重放的结果事件仅包含关联和脱敏状态：

```json
{
  "type": "channel_delivery_result",
  "promptId": "prompt-1",
  "data": {
    "sessionId": "session-1",
    "deliveryId": "prompt-1",
    "source": "prompt",
    "status": "failed",
    "promptId": "prompt-1",
    "code": "channel_worker_unavailable",
    "error": "Channel worker is not running."
  }
}
```

空的成功 Prompt 最终结果省略错误字段：

```json
{
  "type": "channel_delivery_result",
  "promptId": "prompt-1",
  "data": {
    "sessionId": "session-1",
    "deliveryId": "prompt-1",
    "source": "prompt",
    "status": "skipped",
    "promptId": "prompt-1"
  }
}
```

`source` 为 `prompt` 或 `scheduled`；`status` 为 `delivered`、`failed` 或 `skipped`。`skipped` 表示符合条件的 turn 成功完成，但其最后一个无工具的助手响应块为空或仅包含空白字符。Daemon 消费投递授权并发布事件，而不解析 Channel Worker。计划关联使用 `taskId` 和 `firedAt`。事件从不包含目标 ID、消息文本、凭据或 webhook 秘密。

安全性：响应中绝不包含 bearer token、client id、完整的 ACP 连接 id、device-flow user code 或验证 URL。两个详情级别都可能包含附加的 `daemon.runId`、`daemon.logMode` 和 `daemon.logHealth`。`summary` 省略 daemon 日志路径和丢失详情；`full` 可能包含 `logPath`、`logIssues`、`logDroppedRecords` 和 `logDroppedBytes`，供已认证的 operator 使用。降级的文件日志会将无路径的 `daemon_log_degraded` 警告添加到正常的状态汇总中。

### `GET /capabilities`

```json
{
  "v": 1,
  "protocolVersions": {
    "current": "v1",
    "supported": ["v1"]
  },
  "mode": "http-bridge",
  "features": [
    "health",
    "daemon_status",
    "capabilities",
    "multi_workspace_sessions",
    "..."
  ],
  "limits": {
    "maxPendingPromptsPerSession": 5,
    "maxSessionsPerWorkspace": 32,
    "maxTotalSessions": 64
  },
  "modelServices": [],
  "workspaceCwd": "/canonical/path/to/primary-workspace",
  "workspaces": [
    {
      "id": "stable-workspace-id",
      "cwd": "/canonical/path/to/primary-workspace",
      "primary": true,
      "trusted": true
    },
    {
      "id": "stable-secondary-workspace-id",
      "cwd": "/canonical/path/to/secondary-workspace",
      "displayName": "Payments Production",
      "primary": false,
      "trusted": true
    }
  ]
}
```

稳定的契约：当 `v` 递增时，表示帧布局发生了向后不兼容的更改。

> **`protocolVersions`** 描述 daemon 可以使用的 serve 协议版本。`current` 是 daemon 首选的协议版本，`supported` 是兼容版本集合。需要特定协议的客户端应检查 `supported`；特定功能的 UI 仍应以 `features` 为准。v=1 的附加项：较旧的 v=1 daemon 会省略此字段，因此针对旧版本构建的 SDK 客户端应将其视为可选。

> **在 Stage 1 中，`modelServices` 始终为 `[]`。** Agent 使用其单一默认 model service，并且不会通过网络枚举它。Stage 2 将从注册的 model adapter 中填充此字段，以便 SDK 客户端可以构建 service-picker；在此之前，请勿依赖此字段为非空。

> **`workspaceCwd`** 是此 daemon 主 workspace 的规范绝对路径。使用它可以省略 `POST /session` 上的 `cwd`（该路由会回退到此主路径），并保持旧版单 workspace 客户端的兼容性。v=1 的附加项：§02 之前的 v=1 daemon 会省略此字段——针对旧版本构建的客户端在使用前应进行 null 检查。

> **`workspaces[]`** 列出每个已注册的 runtime。较新的单 workspace daemon 即使在 `multi_workspace_sessions` 缺失时也会在 `workspaces[]` 中包含主 runtime，以便客户端可以发现 workspace 限定路由所需的稳定 id；旧版 daemon 可能省略该数组。每个条目为 `{ id, cwd, displayName?, primary, trusted, removable? }`。`displayName` 仅用于展示，未设置时会被省略。第一个/主 workspace 仍然由 `workspaceCwd` 镜像；新客户端通过将该条目的 `cwd` 传递给 `POST /session` 来选择非主 runtime。不受信任的 workspace 会被通告用于诊断，但在信任变更之前会以 `403 untrusted_workspace` 拒绝新 session 创建。`removable` 存在于支持 runtime 移除的 daemon 上，且仅对进程动态或持久化恢复的次要 runtime 为 true。

Workspace 功能标签和 `workspaces[]` 是动态的。添加 workspace 的客户端必须在变更完成后重新获取 `/capabilities`；daemon 不会向缓存了早期响应的客户端广播能力变更。遗忘持久化不会卸载活跃的 runtime，因此该 runtime 在重启前仍会被通告。

### `POST /workspaces`

注册一个额外的 workspace runtime。路径必须是现有的、可访问的、绝对的目录，且不与另一个已注册的 workspace 重复或嵌套。注册默认为进程内，除非客户端发送 `persist: true`；客户端必须在请求持久化前预检 `persistent_workspace_registration`。当 `workspace_display_name` 被通告时，请求还可以包含可选的 `displayName`。

```json
{
  "cwd": "/canonical/path/to/secondary-workspace",
  "persist": true,
  "displayName": "Payments Production"
}
```

新创建的 runtime 返回 `201`；将已活跃的次要 workspace 提升为持久化返回 `200`。持久化成功包含 `persisted: true`：

```json
{
  "id": "stable-workspace-id",
  "cwd": "/canonical/path/to/secondary-workspace",
  "displayName": "Payments Production",
  "primary": false,
  "trusted": true,
  "persisted": true
}
```

`displayName` 必须是去除首尾空格后不超过 256 个字符的字符串。空结果被视为无名称，内部 C0（`U+0000`–`U+001F`）或 DEL（`U+007F`）控制字符会被拒绝。JSON `null` 不是创建值，会返回 `400 invalid_display_name`；省略该字段以不提供初始名称。允许重复的显示名称。随进程内注册提供的名称仅在该 daemon 进程期间有效；`persist: true` 将其与持久化注册一起存储，以便在重启后恢复。对已持久化的 workspace 重复请求是幂等的，不会重命名它。

错误包括 `400 invalid_path` / `invalid_persist_flag` / `invalid_persist_target` / `invalid_display_name`、`409 workspace_exists` / `workspace_nested` / `workspace_limit_reached`、`500 workspace_registration_store_error` / `runtime_creation_failed`，以及 `501 persistence_not_available` / `not_implemented`。

### `PATCH /workspaces/:workspace`

更新按 workspace ID 或 URL 编码绝对 cwd 选择的活跃 workspace 资源。端点目前仅支持 display-name 元数据：

```json
{ "displayName": "Payments Production" }
```

发送 `{ "displayName": null }` 以清除名称。此处 `null` 是仅限更新的删除标记；非 null 值遵循与 `POST /workspaces` 相同的字符串规范化规则。响应为更新后的 `{ id, cwd, displayName?, primary, trusted, removable? }` workspace 投影。Runtime 元数据始终会被更新。如果 runtime 有匹配的持久化注册标识，每个别名都会通过现有的 schema-v1 注册存储原子更新；端点从不创建或提升持久化注册。

不支持的字段会失败而非被静默忽略。错误包括 `400 empty_patch` / `invalid_display_name` / `unsupported_field` / `workspace_mismatch`、`409 workspace_registration_in_progress`、`500 workspace_registration_store_error`，以及 `503 daemon_shutting_down`。

### `DELETE /workspaces/:workspace`

移除一个可移除的次要 runtime。选择器遵循复数 workspace 路由规则，接受 workspace ID 或 URL 编码的绝对 cwd。可选的 JSON body 为 `{ "force": boolean }`；省略则请求非强制移除。

非强制移除在冻结的 runtime 拥有 session、prompt、待处理的启动、ACP 连接、memory 任务或 workspace channel worker 时，返回 `409 workspace_busy` 以及 `activity` 快照。发送 `{ "force": true }` 请求终止这些资源。持久化移除是提交点：后续清理是有界且尽力的，清理失败会被记录，逻辑移除仍然会收敛而不是恢复 runtime。成功响应为：

```json
{
  "removed": true,
  "workspaceId": "stable-workspace-id",
  "workspaceCwd": "/canonical/path/to/secondary-workspace",
  "forced": true,
  "persistedRegistrationRemoved": true,
  "activity": {
    "sessions": 2,
    "activePrompts": 1,
    "pendingSessionStarts": 0,
    "acpConnections": 1,
    "memoryTasks": 0,
    "channelWorkers": 0,
    "voiceSessions": 0
  }
}
```

立即繁忙的非强制请求返回一个快速的排空前 activity 快照。一旦排空开始，busy 或成功响应包含在准入和 ACP 排空门关闭后、清理开始前获取的最终快照。错误包括 `400 invalid_force_flag` / `workspace_mismatch`、`409 workspace_busy` / `primary_workspace_removal_forbidden` / `static_workspace_removal_forbidden` / `workspace_removal_in_progress` / `workspace_registration_in_progress`、`500 workspace_persist_failed` / `workspace_runtime_removal_failed`、`501 workspace_runtime_removal_unsupported`，以及 `503 daemon_shutting_down`。

### `GET /workspace-registrations`

列出此主 workspace 的持久化期望 workspace 集合。当存储的目录在当前启动期间无法恢复时，条目仍以 `active: false` 可见。
当 runtime 正在排空时，条目仍保持 `active: true`，因为 runtime 在移除完成前仍拥有活跃资源。
条目包含可选的 `displayName`（当持久化注册拥有该名称时）。

```json
{
  "schemaVersion": 1,
  "primaryWorkspace": "/canonical/path/to/primary-workspace",
  "entries": [
    {
      "id": "stable-registration-id",
      "cwd": "/canonical/path/to/secondary-workspace",
      "displayName": "Payments Production",
      "active": true,
      "persisted": true
    }
  ]
}
```

当未配置注册存储时返回 `501 persistence_not_available`，当存储无法读取时返回 `500 workspace_registration_store_error`。

### `DELETE /workspace-registrations/:id`

遗忘一个持久化注册。这不会卸载活跃的 runtime 或终止其 session；`restartRequired: true` 表示活跃的 runtime 将在下次 daemon 重启时消失。

```json
{ "removed": true, "active": true, "restartRequired": true }
```

返回 `404 workspace_registration_not_found`、`500 workspace_registration_store_error`，或 `501 persistence_not_available`。与其他变更路由一样，当 daemon 身份验证启用时，此端点需要变更身份验证。

### 只读 runtime 状态路由

这些路由报告 daemon 端的 runtime 快照。它们是 v1 的附加路由，
不会改变状态，也不会更改 serve 协议版本。Workspace
状态路由故意**不会**仅仅因为客户端轮询 GET 路由就启动 ACP 子进程：如果 daemon 处于空闲状态，它们将返回
`initialized: false` 并附带空快照。Session 状态路由需要存活的 session，并对未知 id 使用标准的 `404 { code: "session_not_found", ... }` 结构。

能力标签（Capability tags）：
- `workspace_mcp` → `GET /workspace/mcp`
- `workspace_skills` → `GET /workspace/skills`
- `workspace_providers` → `GET /workspace/providers`
- `workspace_acp_status` → `GET /workspace/acp/status`
- `workspace_env` → `GET /workspace/env`
- `workspace_preflight` → `GET /workspace/preflight`
- `session_context` → `GET /session/:id/context`
- `session_supported_commands` → `GET /session/:id/supported-commands`
- `session_tasks` → `GET /session/:id/tasks`
- `session_monitor_tool_correlation` → `GET /session/:id/tasks` 的 monitor 条目
  包含 `toolUseId`，用于转录到任务的关联
- `session_status` → `GET /session/:id/status`
- `session_info` → `GET /workspace/:id/session-info` 和 `GET /workspaces/:workspace/session-info`
- `session_transcript` → `GET /session/:id/transcript`
- `workspace_persisted_transcript` → `GET /workspaces/:workspace/session/:id/transcript`
- `workspace_session_export` → `GET /workspaces/:workspace/session/:id/export`
- `workspace_archived_session_export` → `GET /workspaces/:workspace/session/:id/archive/export`
- `workspace_session_live_state` → `GET /workspaces/:workspace/sessions/live-state`
- `workspace_qualified_memory` → `POST /workspaces/:workspace/memory/{remember,forget,dream}` 和 `GET /workspaces/:workspace/memory/{remember,forget,dream}/:taskId`

`workspace_acp_status` 报告主 workspace ACP channel 的时间点活跃状态，为 `{ channelLive: boolean }`。handler 不创建 channel，但到达 runtime 路由可能首先启动延迟的 daemon runtime，其配置的启动策略可能独立地预热 ACP。快照不是租约：客户端必须让 Session 创建重新验证或启动 channel。

### ACP 预热

能力标签：`workspace_acp_preheat`。

`POST /workspace/acp/preheat?timeoutMs=N` 尽力初始化主 workspace ACP channel。`timeoutMs` 默认为 5000，且必须是不超过 60000 的正整数。并发调用者和 Session 创建共享相同的 bridge 初始化。请求超时仅结束该 HTTP 等待；它不会取消共享初始化。

```ts
interface WorkspaceAcpPreheatResult {
  ready: boolean;
  channelLive: boolean;
  durationMs: number;
  reason?: 'timeout' | 'error';
  error?: string;
}
```

`ready` 始终等于 `channelLive`。活跃响应省略 `reason` 和 `error`；否则 `reason` 为 `timeout` 或 `error`。`durationMs` 衡量当前 HTTP 调用，而非该调用加入的初始化的完整生命周期。操作超时或失败返回 HTTP 200。无效的 `timeoutMs` 返回 400，而身份验证、速率限制和延迟 runtime 失败保留其正常响应。

两个 ACP workspace 路由都是单数的且仅限主 workspace。客户端不得将它们用于次要 workspace，也不得将任一响应解释为持久的就绪保证。

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

**MCP 客户端 guardrails（issue [#4175](https://github.com/QwenLM/qwen-code/issues/4175)）。** 当前 daemon 会在 payload 中扩展四个附加字段和一个能力作用域的 budget cell：

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
      "scope": "workspace",
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

`budgetMode` 的值为 `enforce`、`warn` 或 `off` 之一。未设置 budget 时，`clientBudget` 会缺失。`budgets[]` 在通告 `mcp_guardrails` 的 daemon 上**始终是一个数组**（当 `budgetMode === 'off'` 时可能为空）；旧版 daemon 会完全省略该字段。当 `mcp_workspace_pool` 被通告时，cell 具有 `scope: 'workspace'`，覆盖选定 workspace runtime 的共享池。当该标签缺失时（包括在 `QWEN_SERVE_NO_MCP_POOL=1` 下），旧版 manager 发出 `scope: 'session'`。消费者**必须**容忍额外的无法识别的 scope 值。

每个 server cell 上的 `disabledReason` 用于区分操作员禁用（`'config'` — `disabledMcpServers` 配置列表）和 budget 拒绝（`'budget'` — 已发现但因 `enforce` 模式从未连接）。拒绝顺序由 `Object.entries(mcpServers)` 的声明顺序决定，具有确定性。每个 server 的 `status: 'error', errorKind: 'budget_exhausted'` 会覆盖原始的 `mcpStatus: 'disconnected'`（虽然这是事实，但不是面向操作员的严重级别）。

Budget 强制执行是能力驱动的。使用 `mcp_workspace_pool` 时，一个 workspace runtime 内的 session 共享传输和一个 `WorkspaceMcpBudget`；不同的 workspace runtime 从不共享池或预算。没有该标签时，每个 ACP session 的 `McpClientManager` 强制执行其自己的上限副本，快照表示该旧版 session 视图。

**检测 budget 压力。** 有两个数据接口，均在 PR-14b 之后填充：

- **Push 事件**（通过 `mcp_guardrail_events` 广播）：订阅 `GET /session/:id/events` 并通过 `KnownDaemonEvent` 过滤 `mcp_budget_warning` / `mcp_child_refused_batch` 帧。状态机在每次向上跨越 75% 时触发一次（在低于 37.5% 时重新激活）；在 `enforce` 模式下，拒绝操作会在每次发现过程中合并一次。
- **快照轮询**（通过 `mcp_guardrails` 广播）：调用 `GET /workspace/mcp` 并结合 `mcp_workspace_pool` 检查 budget cell（`budgets[0]`）以确定其作用域：

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
      "userInvocable": false,
      "installedPath": "/home/alice/project/.qwen/skills/review/SKILL.md",
      "argumentHint": "[path]"
    }
  ]
}
```

`level` 的值为 `project`、`user`、`extension` 或 `bundled` 之一。
`userInvocable`（布尔值，可选）对于普通 skill 会被省略（表示
`true`），仅在 skill 无法手动调用或通过 skill API 切换时作为 `false` 存在。`modelInvocable` 是独立的：`false`
表示 skill 仍然可以手动使用，但对模型调用隐藏。
`installedPath` 是 skill 的 `SKILL.md` 的现有绝对路径；daemon 按存储原样返回，不单独解析符号链接或
规范化它。当前 daemon 为每个 skill 发出它，而客户端必须
容忍旧版 v1 daemon 中缺失该字段。Skill body、hook、`skillRoot`
和其他 skill 配置仍然被排除。当发现成功时，会省略 `errors`。

重复读取从最后提交的 workspace 快照提供服务，
定期与子进程的内存缓存进行重新验证。读取从不
扫描 skill 目录或重新解析 `SKILL.md` 文件。子进程确实会验证
其 extension 源是否未更改——对 extensions
目录进行一次 `readdir`，加上对每个条目、启用文件和存储的
激活状态进行一次 `stat`——并且仅在它们移动时刷新，因此在 daemon 外部安装或切换的 extension 仍然会在下一次读取时被获取。
Safe 和 bare 模式跳过此检查，与其排除 extensions 一致。

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

所有文件路径都通过 daemon 的主 workspace 进行解析。响应使用 workspace 相对路径，在正常成功的情况下永远不会返回绝对文件系统路径。成功的文件响应包含以下 header：

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

读取文本文件。Query 参数：`path`（必填）、`maxBytes`、`line`、`limit`
和 `cursor`。Daemon 会拒绝二进制文件。超过 256 KiB
完整快照上限的文件需要至少一个显式窗口参数（`line`、`limit` 或
`maxBytes`）；没有任何一个参数的请求仍然返回 `file_too_large`。这样的
窗口会被流式传输，其返回的 UTF-8 内容仍然限制在 256 KiB。
`maxBytes` 始终应用于解码后的 UTF-8 响应字节，包括
当源使用完整快照上限内的其他受支持编码时。

行偏移通过从文件开头扫描来解析，因此当到达窗口需要读取超过
8 MiB（`MAX_TEXT_SCAN_BYTES`）时，也会被拒绝并返回 `file_too_large`。使用 `GET /file/bytes` 直接到达更深的偏移。
该路由无法解码的编码中的大文本返回
`binary_file`，而非 `file_too_large`——使用更小的窗口重试无法
帮助，`readBytes` 是与二进制文件相同的补救措施。

对于完整快照上限内的文件，响应包含 `hash`，即整个文件在磁盘上原始字节的 SHA-256 摘要，即使 `line`、`limit` 或 `maxBytes` 只返回了部分内容（切片）。大型部分窗口省略 `hash`，保留完整的 `sizeBytes`，设置 `truncated: true`，并在流在 EOF 之前停止时返回 `originalLineCount: null`。

##### 使用 `cursor` 分页

需要 `workspace_file_read_cursor` 能力。还有更多内容可返回的响应返回 `hasMore: true`，以及当文件字节偏移可推导时的 `nextCursor` token。将其作为 `cursor` 传回可在 O(1) 内恢复，而深层 `line` 偏移需要从字节 0 开始扫描，且超过 8 MiB 时会被拒绝。

```
GET /file?path=big.log&limit=500          → { content, nextCursor, hasMore: true }
GET /file?path=big.log&limit=500&cursor=… → next page
```

`cursor` 和 `line` 互斥（`parse_error`）——两者都指定一个起始点。格式错误或过长的 cursor 返回 `parse_error`；文件已被替换或截断的 cursor 返回 `hash_mismatch`（409）。追加**不会**使未完成的 cursor 失效，这正是该功能存在的场景。

`content` 省略其最后一行的终止换行符，与所有其他读取一样，因此重新组装分页的客户端需要用 `\n` 连接它们。`hasMore` 不是 `nextCursor` 的重述：一个使用 `limit` 读取的小型非 UTF-8 文件还有更多内容但没有可推导的字节偏移，因此它报告 `hasMore: true` 且 `nextCursor: null`。当字节上限截断当前行时，cursor 也为 null，因为从该偏移恢复会返回不完整的行。对于许多短行，降低 `limit` 直到页面在字节上限之前结束并返回 cursor。对于单个超大行，显式请求下一行（例如，从第 1 行开始时使用 `line=2`），然后继续使用 cursor；当需要完整的超大行时，使用 `GET /file/bytes`。

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
  "sessionId": "550e8400-e29b-41d4-a716-446655440000",
  "sessionScope": "thread"
}
```

| Field            | Required | Notes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ---------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `cwd`            | no       | 匹配一个已注册 workspace 的绝对路径。如果省略，路由会回退到主 workspace（从 `/capabilities.workspaceCwd` 读取）。不匹配的非空 `cwd` 会返回 `400 workspace_mismatch`。当 `features` 包含 `multi_workspace_sessions` 时，客户端可以传递任何受信任的 `workspaces[].cwd`；否则仅接受主 workspace。Workspace 路径通过 `realpathSync.native` 进行规范化（对于不存在的路径使用仅解析的回退），因此不区分大小写的文件系统不会因拼写不同而拒绝 session。                                          |
| `modelServiceId` | no       | 选择 agent 将通过哪个配置的*模型服务*（后端 provider — 阿里云百炼、OpenRouter 等）进行路由。如果省略，agent 将使用其默认值。如果 workspace 已经有一个 session，这会在现有 session 上调用 `setSessionModel` 并广播 `model_switched`。这与 `POST /session/:id/model` 上的 `modelId` 不同，后者选择在已绑定服务**内部**的模型。`/capabilities` 上的 `modelServices` 数组保留用于广播配置的服务；在 Stage 1 中它始终为 `[]`（使用 agent 的默认服务，不通过 HTTP 枚举）。 |
| `sessionId`      | no       | 调用者选择的 RFC 变体 UUID v1-v5。Daemon 将其规范化为小写并始终创建新的线程 session；不会将此字段视为幂等附加。发送前请确认 `caps.features` 包含 `session_id_override`，因为旧版 daemon 可能会忽略未知字段。`null` 等价于省略。                                                                                                                                                                                                                                                                                                                              |
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

调用者提供的 ID 在所有当前已注册的 workspace runtime 和每个仍然活跃的 bridge generation（包括排空中的替换）中是唯一的。活跃的、待处理的、活动的、归档的或 worktree 支持的重复返回 `409 session_id_conflict`。无效值返回 `400 invalid_session_id`；不可用的活跃所有者或持久化状态检查返回可重试的 `503 session_id_admission_unavailable`。在 bridge 或存储健康状况变更后使用有界退避重试；`retryable` 表示另一次尝试是安全的，而非立即重试会成功。如果下游 agent 返回不同的 ID，daemon 会移除该孤儿并返回 `500 session_id_not_honored`。在模糊响应之后，加载或恢复已知 ID，而不是重试创建作为附加。

需要独立对话的多客户端集成应在每次 `POST /session` 时发送 `sessionScope: "thread"`。仅当客户端有意共享一个协作 session 时，才使用默认的 `single` scope；共享 session 会通过一个 FIFO 队列串行化 prompts，这可以通过 `/daemon/status` 中的 `runtime.activity.pendingPrompts` 和 `runtime.activity.queuedPrompts` 看到。

针对同一 workspace 的并发 `POST /session` 调用会被**合并 (coalesced)** 为一次 spawn —— 两个调用方都会获得相同的 `sessionId`，且恰好只有一个会返回 `attached: false`。如果底层 spawn 失败（初始化超时、agent 输出格式错误、OOM），**所有合并的调用方都会收到相同的错误** —— 进行中的 slot 会被清除，以便后续调用可以从头重试。

> ⚠️ **在全新 session 上拒绝 `modelServiceId` 在 HTTP 响应中是静默的。** 错误的 `modelServiceId`（拼写错误、未配置的服务）**不会**导致创建时返回 500 错误 —— session 会在 agent 的默认 model 上保持运行，因此调用方仍然会获得一个 `sessionId`，他们可以借此重试切换 model（通过 `POST /session/:id/model`）。可见的失败信号是 session 的 SSE 流上的 `model_switch_failed` 事件，该事件在 spawn 握手和你的第一次 subscribe 之间触发。**需要观察此事件的订阅者应在第一次 `GET /session/:id/events` 时传递 `Last-Event-ID: 0`**，以便从 ring 中最旧的可用事件开始重放（即使 subscribe 在 create 响应之后几毫秒才到达，也能覆盖 spawn 时的 `model_switch_failed`）。

### ACP `session/new` 调用者提供的 ID

ACP 客户端通过 extension 元数据字段请求相同的行为：

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "session/new",
  "params": {
    "cwd": "/absolute/path/to/workspace",
    "_meta": {
      "qwen-code/sessionId": "550E8400-E29B-41D4-A716-446655440000"
    }
  }
}
```

响应包含规范化为小写的 ID。主 workspace 和 workspace 限定的 ACP 挂载与 REST 共享准入，包括 `session/load` 和 `session/resume`。无效 ID 使用 ACP `INVALID_PARAMS` 并附带 `data.httpStatus=400` 和 `data.errorKind="invalid_session_id"`；冲突使用 `data.httpStatus=409`；不可用的活跃所有者或持久化状态检查使用 `data.httpStatus=503` 和 `data.retryable=true`。

从未收到 prompt 的 ACP 创建的 session 不会留下持久化痕迹，当其所属连接关闭且附加 session 为零时，daemon 会回收它。回收后，同一 ID 可以再次被创建——这是连接生命周期，而非 ID 重用：当连接（或任何附加）活跃时，准入会拒绝重复。

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
| `cwd` | 否 | 与 `POST /session` 具有相同的规范化及 `workspace_mismatch` 规则。省略则继承 `/capabilities.workspaceCwd`。当 `features` 包含 `multi_workspace_sessions` 时，调用方可以传递任何受信任的已注册 `workspaces[].cwd`；不受信任的非主 workspace 返回 `403 untrusted_workspace`。此处故意不接受 `mcpServers` —— daemon 全局的 MCP 由 settings 驱动（与 `POST /session` 一致）。 |

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

**通过 SSE 重放历史记录。** 当 agent 端的 `loadSession` 正在进行时，agent 可能会为持久化的 turn 发出 `session_update` 通知，或在响应元数据中返回批量重放更新。Daemon 在路由响应返回之前将这些事件播种到 session 的有界重放快照窗口中。对于活跃 session，`POST /session/:id/load` 仅承诺该有界窗口（`compactedReplay`、`liveJournal`、`lastEventId`），而非完整转录。窗口由 `--compacted-replay-max-bytes`（默认 4 MiB，最大 256 MiB）进行字节上限；如果较旧的重放条目被丢弃，`compactedReplay[0]` 是一个无 id 的 `history_truncated` 标记。进行中的 `liveJournal` 由 `--max-journal-events`（默认 10 000）和 `--max-journal-bytes`（默认 8 MiB）单独限制；超出时，最旧的日志条目被丢弃，并前置一个 `scope: 'live_journal'` 的 `history_truncated` 标记。客户端应将该标记渲染为状态并继续应用保留的事件。完整的持久化转录访问通过 `GET /session/:id/transcript` 单独暴露。

**Errors:**

- `404` —— 持久化的 session id 不存在 (`SessionNotFoundError`)。
- `400` —— `workspace_mismatch`（与 `POST /session` 结构相同）。
- `403` —— 当 `cwd` 指向不受信任的非主 workspace 时返回 `untrusted_workspace`。
- `503` —— `session_limit_exceeded`（计入 `--max-sessions` 限制；进行中的 restore 也会被计算在内）。
- `409` —— `restore_in_progress`（相同 id 的 `session/resume` 正在进行中）。`Retry-After: 5`。相同操作的并发（同一 id 的两个并发 `session/load`）会被合并 —— 恰好有一个返回 `attached: false`，其余返回 `attached: true` 且具有相同的 `state`。
- `409` —— 当同一个 session id 已在另一个 workspace runtime 中活跃或正在被恢复时返回 `session_workspace_conflict`。
- `409` —— 当 id 仅存在于 `chats/archive/` 下时返回 `session_archived`；在 `load` 或 `resume` 之前调用 `POST /sessions/unarchive`。
- `409` —— 当相同 id 的 archive 或 unarchive 正在进行中时返回 `session_archiving`。`Retry-After: 5`。
- `409` —— 当 id 同时存在于 `chats/` 和 `chats/archive/` 中时返回 `session_conflict`；在 load 之前使用 `POST /sessions/delete` 删除该 session。

### `GET /session/:id/transcript`

返回从活跃持久化 JSONL 转录重建的无 id `session_update` 重放帧的一页。预检 `caps.features.session_transcript` —— 旧版 daemon 对此路由返回 `404`。

查询参数：

| 字段     | 是否必填 | 说明 |
| -------- | -------- | --- |
| `cursor` | 否       | 上一页返回的不透明 base64url cursor。首页省略。cursor 由 daemon 签发并进行防篡改检查；修改它会返回 `400 invalid_transcript_cursor`。它绑定到转录文件标识和冻结的首页字节大小；删除、截断、替换或归档文件会使它失效并返回 `409`。 |
| `limit`  | 否       | 页面中包含的活跃 `ChatRecord` 数量。默认为 `100`，最大 `500`。一条记录可以产生多个重放帧，因此 `events.length` 可能大于 `limit`。无效值返回 `400 invalid_transcript_limit`。 |

响应：

```json
{
  "v": 1,
  "sessionId": "persisted-1",
  "events": [
    {
      "v": 1,
      "type": "session_update",
      "data": {
        "sessionUpdate": "user_message_chunk",
        "content": { "type": "text", "text": "..." }
      }
    }
  ],
  "nextCursor": "opaque",
  "hasMore": true,
  "startTime": "2026-07-08T00:00:00.000Z",
  "lastUpdated": "2026-07-08T00:01:00.000Z"
}
```

`events` 仅为重放帧：`{ v: 1, type: "session_update", data: SessionUpdate }`。它们不携带 EventBus id，响应也从不包含 `lastEventId`。调用此路由不会调用 `/load`、附加客户端、为活跃 EventBus 播种、创建活跃 session，也不会改变当前活跃重放窗口。活跃和非活跃 session 都由子进程端的只读状态方法重建，因此重放使用相同的 workspace 设置、runtime 输出目录、发射器和 `/load` 历史语义，而不变更 daemon session 状态。

首页冻结当前 JSONL 快照大小。后续页面仅读取该字节前缀，因此首页之后的追加不会改变结果集。如果文件消失、被截断到冻结大小以下、被替换为不同的 inode，或被移动到归档，下一页返回 `409`，客户端应从第 1 页重新开始或请用户重新打开转录。

为了保护 daemon 内存和延迟，超过转录索引上限的快照会在 daemon 扫描 JSONL 之前失败。客户端收到 `413 transcript_too_large`，应回退到导出/离线处理或请用户缩短/归档较旧的历史。

如果在产生一些帧后重放转换失败，可能会出现 `partial: true` 和 `replayError`。部分响应从不包含 `nextCursor`，因此客户端不会默默地分页跳过未转换的记录。

**Errors:**

- `400` —— 无效的 `limit`、`cursor` 或 session id 格式。
- `404` —— 首页请求时活跃持久化 session id 不存在。
- `409` —— 来自与 `/load` 相同的可加载性检查的 `session_archived`、`session_archiving` 或 `session_conflict`。
- `409` —— 转录快照不可用，因为文件在 cursor 签发后被删除、截断、替换或归档；这也适用于预检不再能为 cursor 请求找到活跃文件时。
- `413` —— 当冻结的转录快照超过 daemon 索引上限时返回 `transcript_too_large`。
- `413` —— 当一个聚合记录超过 workspace 限定的页面预算或序列化页面超过其响应预算时返回 `transcript_page_too_large`。

### `GET /workspaces/:workspace/session/:id/transcript`

从选定已注册 workspace 的活跃持久化 JSONL 返回与单数路由相同的 `DaemonSessionTranscriptPage` 投影。预检 `workspace_persisted_transcript`；此能力独立于 `multi_workspace_sessions`，适用于通过 id 或 cwd 选择的受信任单 workspace 主实例。

选择器和查询参数遵循现有的复数 workspace 和转录规则。受信任的主和次要 runtime 以及不受信任的次要 runtime 可以读取。不受信任的主 workspace 返回 `403 untrusted_workspace`。不会返回归档内容。

对于此 workspace 限定路由，`limit` 是最大记录数。页面可能在 4 MiB 持久化源预算处提前停止，并返回继续 cursor。序列化响应限制为 32 MiB，cursor 限制为 64 KiB。如果重放状态会超过 cursor 上限，页面返回其成功转换的事件，并带有 `partial: true`、`hasMore: false`，且没有 `nextCursor`。

与旧版单数路由不同，此路径完全在 daemon 进程内实现。它不调用 workspace bridge、不启动 ACP、不加载设置、不解析项目定义的 agent 或 skill，也不创建/修复 `session-transcript-cursor-key`。工具帧使用持久化的工具名称和描述，而不咨询 runtime 工具注册表。其 HMAC cursor key 仅存在于 daemon 内存中，按 workspace 隔离，并在重启时轮换；来自上一个 daemon 进程的 cursor 返回 `400 invalid_transcript_cursor`。

### `GET /workspaces/:workspace/session/:id/export`

将选定已注册 workspace 的活跃持久化 session 导出为附件。预检 `workspace_session_export`；不要从 `session_export` 或 `workspace_qualified_rest_core` 推断支持。选择器首先解析为精确的 workspace id，然后解析为规范化后的 URL 编码绝对 cwd。主和次要 runtime 都必须受信任。不受信任的 runtime 在 session 或格式验证之前返回 `403 untrusted_workspace`。

可选的 `format` 查询为 `html`（默认）、`md`、`json` 或 `jsonl`。body、MIME 类型、文件名清理、`Cache-Control: no-store`、`X-Content-Type-Options: nosniff` 和附件处置与 `GET /session/:id/export` 匹配。旧版路由仍然绑定到主存储。

复数路由在现有的共享归档协调器下仅读取选定 workspace 的活跃持久化 JSONL。它不扫描其他 workspace 存储、不回退到主 workspace、不解析活跃所有者、不调用 workspace bridge、不启动 ACP、不附加客户端或不加载设置。仅存在于另一个 workspace 中的 session id 返回 `404 { code: "session_not_found" }`；归档的 session 返回 `409 session_archived`。无效格式返回 `400 invalid_export_format`，存储竞争保留现有的 `session_archiving` 和 `session_conflict` 错误。

### `GET /workspaces/:workspace/session/:id/archive/export`

将选定已注册 workspace 的归档持久化 session 导出为附件。预检 `workspace_archived_session_export`；不能从活跃导出或复数核心能力推断支持。Workspace 选择器解析和信任检查在 session-id 和格式验证之前运行。

TypeScript SDK 调用者使用 `WorkspaceDaemonClient.exportArchivedSession(sessionId, options)`。该方法始终使用原生 REST 并返回现有的 `DaemonSessionExportResult` 附件投影。

可选的 `format` 查询、响应 body、MIME 类型、清理后的文件名、缓存策略、安全 header 和附件处置与活跃 workspace 导出相同。归档源 JSONL 在重建前限制为 256 MiB；更大的文件返回 `413 transcript_too_large`，并带有 `sessionId`、`snapshotSize` 和 `maxBytes`。活跃导出保持其现有的大小行为。

该路由在共享归档协调器租约下仅读取选定受信任 workspace 中的 `chats/archive/<id>.jsonl`。它不为回退检查活跃内容、不扫描另一个 workspace、不解析活跃所有者、不调用 bridge、不启动 ACP、不附加客户端或不加载设置。仅有活跃版本的 id 返回 `409 { code: "session_not_archived" }`；缺失的 id 返回 `404 { code: "session_not_found" }`；同时存在活跃和归档文件返回 `409 session_conflict`；归档转换返回 `409 session_archiving` 并带有 `Retry-After: 5`。

### `POST /session/:id/resume`

通过 id 恢复持久化的 ACP session，**不**通过 SSE 重放历史记录。model context 会在 agent 端内部恢复（通过 `geminiClient.initialize` 读取 `config.getResumedSessionData`）；对于已经渲染了历史记录的客户端，SSE 流保持干净。Pre-flight 检查 `caps.features.session_resume`；`unstable_session_resume` 仍作为面向旧客户端的已弃用兼容别名保留。

请求结构与 `/load` 相同。响应结构也相同 —— `state` 镜像了 ACP 的 `ResumeSessionResponse`。错误信封也相同，包括 `409 restore_in_progress`（当 `session/load` 正在进行时触发；在另一个 `session/resume` 之后竞争的 `session/resume` 会被合并）。

当客户端没有渲染历史记录时（冷重连，picker → open），使用 `/load`。当客户端已经在屏幕上显示了 turns，只需要拿回 daemon 端的 handle 时，使用 `/resume`。

> ⚠️ **为什么 `unstable_session_resume` 仍在被通告？** daemon 的 HTTP 路由和 `session_resume` capability 在 v1 中是稳定的，但 bridge 仍然调用 ACP 的 `connection.unstable_resumeSession`。保留旧标签仅仅是为了让在 `session_resume` 之前发布的 SDK 能够继续工作。

### `GET /workspace/:id/session-info` 和 `GET /workspaces/:workspace/session-info`

返回选定 workspace 的聚合持久化 session 计数，而不改变分页 session 列表路径：

```json
{
  "active": 450,
  "archived": 30,
  "total": 480,
  "live": 2,
  "expensive": true,
  "cost": "disk_scan"
}
```

`active`、`archived` 和 `total` 统计本地 JSONL session。`live` 是匹配的内存 bridge 计数，对于已注册的不受信任的次要 workspace 会被省略，因为该仅持久化读取不得查询活跃状态。`expensive` 始终为 `true`，`cost` 始终为 `"disk_scan"`；客户端必须不频繁调用此端点而非轮询它。如果扫描达到其安全限制或无法分类每个候选文件，响应会添加 `"truncated": true`，持久化计数为下界。缺失的存储返回零持久化计数。复数路由使用与复数 session 目录相同的 workspace 选择器和信任策略；不受信任的主 workspace 仍然返回 `403 untrusted_workspace`。

TypeScript daemon SDK 通过 `workspaceById(...)` 或 `workspaceByCwd(...)` 暴露复数路由，然后调用 `getWorkspaceSessionInfo()`。

### `GET /workspace/:id/sessions` 和 `GET /workspaces/:workspace/sessions`

列出规范 workspace 匹配 `:id` 或 `:workspace` 的 session。路径参数首先解析为精确的 workspace id，然后解析为 URL 编码的绝对 cwd。主 workspace 包含现有的持久化/活跃合并：默认列表是 `chats/` 中的活跃 sessions；传递 `archiveState=archived` 以列出 `chats/archive/` 中的归档 sessions。受信任的非主 workspace 包含来自其自身 `chats/` 存储的活跃持久化 session，并合并匹配的活跃摘要而不重复；如果没有活跃的持久化 session，该路由保留之前的仅活跃 cursor 行为。受信任的非主 workspace 还支持 `archiveState=archived`、有序的 `view=organized` 列表和 `group` 过滤器，从其自身的 `chats/`、`chats/archive/` 和 session 组织存储中读取；组合的 `view=organized&archiveState=archived` 查询仅返回归档 sessions，不进行活跃合并。已注册的不受信任的非主 workspace 支持相同的列表、过滤器和分页结构，但仅返回持久化条目：daemon 不查询活跃 bridge 或从 runtime 填充待处理的交互、turn 错误或客户端状态。`clientCount: 0` 和 `hasActivePrompt: false` 等持久化默认值仍然保留以兼容线路。缺失的存储返回空列表。复数路由仍然对不受信任的主 workspace 返回 `403 { code: "untrusted_workspace" }`；旧版主路由保持其现有的兼容行为。v1 不支持 `archiveState=all`。主和持久化支持的列表保留现有的数字 `cursor` 语义；无持久化的受信任非主活跃回退保留其现有的不透明活跃 cursor。

```bash
curl http://127.0.0.1:4170/workspace/$(jq -rn --arg c "$PWD" '$c|@uri')/sessions
curl http://127.0.0.1:4170/workspace/$(jq -rn --arg c "$PWD" '$c|@uri')/sessions?archiveState=archived
curl http://127.0.0.1:4170/workspaces/<workspace-id>/sessions
```

当 `workspace_qualified_rest_core` 被通告时，workspace 作用域的 session 批量操作、group CRUD 和 session 组织变更可在 `/workspaces/:workspace/sessions/{delete,archive,unarchive}`、`/workspaces/:workspace/session-groups` 和 `/workspaces/:workspace/session/:id/organization` 下使用。对于不受信任的次要 workspace，group GET 仍然可用；每个 group、session 和组织变更仍然受信任门控。无 workspace 的批量和组织变更路由仍然仅限主 workspace 以兼容。

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

受信任的活跃列表包含实时的 daemon 覆盖字段，如 `clientCount` 和 `hasActivePrompt`。不受信任的次要和归档列表仅来自存储：活跃覆盖字段保持缺失或为 false，归档条目将 `isArchived` 设置为 `true`。当没有 sessions 存在时返回空数组（而不是 404）—— session-picker UI 不应仅仅因为 workspace 处于空闲状态就报错。

### `GET /workspaces/:workspace/sessions/live-state`

返回选定 workspace runtime 的仅内存活跃 session 快照以及内存中的目录版本，使客户端无需在 `GET /workspaces/:workspace/sessions` 的持久化目录上轮询 `hasActivePrompt`、等待标志和 `clientCount` 等易变状态。预检 `workspace_session_live_state`；该标签独立于 `workspace_qualified_rest_core`，因此通告更广泛 workspace REST 能力的旧版 daemon 不会实现此路由。选择器首先解析为精确的 workspace id，然后解析为规范化后的 URL 编码绝对 cwd，与其他复数 session 路由一致。该路由对主 runtime 和次要 runtime 均为仅限受信任：它从不回退到主 runtime，也不使用授予不受信任次要 workspace 有限目录读取权限的宽松持久化目录策略。该端点没有查询参数，也不执行 session 存储、设置、外部命令或 ACP 往返，因此其成本与持久化 session 数量和 JSONL 大小无关；默认的活跃 session 上限保持响应有界，禁用上限后成本仍仅与活跃 session 数量成正比。

Response:

```json
{
  "v": 1,
  "catalogVersion": {
    "generation": "7eca3164-bce1-4f50-94d8-c842c480f213",
    "revision": 17
  },
  "sessions": [
    {
      "sessionId": "session-123",
      "clientCount": 1,
      "hasActivePrompt": true,
      "isWaitingForPermission": false,
      "isWaitingForUserQuestion": false
    }
  ]
}
```

`v` 是响应 schema 版本。每个成功响应都包含 `Cache-Control: no-store`。`sessions` 是选定 runtime 中当前活跃的完整、未分页、无序的 session 集合；空的活跃 runtime 返回 `200` 和 `sessions: []`。`clientCount`、`hasActivePrompt`、`isWaitingForPermission` 和 `isWaitingForUserQuestion` 是必需的线格式字段，缺失的可选 bridge 值投影为 `0` 或 `false`。显示名称、时间戳、组织和来源元数据等静态目录字段被故意排除，仍由完整目录拥有。缺失的活跃状态行仅清除已知目录行的易变字段；它从不删除持久化目录行。

`catalogVersion` 是 daemon 观测的目录变更的相等性令牌。`generation` 是每个 bridge 实例创建的随机 UUID，在 daemon 重启或 workspace runtime 替换时变更；`revision` 从零开始，在一个 generation 内单调递增。唯一支持的操作是整个配对上的相等性判断：相同的 generation 和 revision 表示没有 daemon 观测的目录变更，任何差异表示重新加载完整目录。客户端不得对 revision 进行算术运算或跨 generation 比较 revision，允许保守的额外递增。该版本涵盖 daemon 观测的目录成员资格和静态元数据变更；普通的轮次活动、prompt 生命周期、附加/分离和等待状态转换不会推进它，因为活跃快照已经携带了相应的易变字段。两个易变覆盖值被故意排除在两个信号之外：turn-error 状态（`hasTurnError`/`turnError`）和待处理交互计数/内容（`pendingInteractionCount`/`pendingInteractions`）既不推进版本也不出现在快照中，因此需要它们的客户端必须继续读取每个 session 的事件流或完整目录，而不是依赖此路由；当有具体消费者需要时，这两个字段可以以线格式附加方式添加。由另一个 daemon、TUI 或外部进程直接写入的变更不会被观测，因此一旦客户端停止周期性完整目录轮询，这些写入就没有有界的发现时间，仅在显式完整重新加载、另一个观测到的目录变更、重连或 daemon/runtime 替换后才出现。

客户端通过两次读取握手来调和目录包：读取活跃状态 A，加载完整 session 列表（当客户端消费 `session_organization` 时加上 `GET /workspaces/:workspace/session-groups`），然后读取活跃状态 B。A 和 B 版本相等则接受该包；不同版本将目录标记为过期，并合并最多一次尾随重新加载，而不是进入紧密重试循环。每个接受的目录请求必须在 A 之后发起——在 A 之前开始的请求或去重承诺不能满足调和要求。版本驱动的重新加载在每个 workspace 上是单飞的，并遵循非零的最小后台间隔，因此持续的目录变动不会驱动每个活跃状态轮询进行一次完整目录扫描；显式的本地变更仍然可以通过同一个单飞操作请求立即刷新。

**错误：**

- `400` —— 未知、格式错误、嵌套或未注册的选择器的现有选择器验证或 `workspace_mismatch` 行为；该路由从不将未知选择器解析到主 runtime。
- `403` —— 任何不受信任的 runtime（包括不受信任的主 workspace）返回 `untrusted_workspace`。
- `503` —— 引导中、转换中、排空中、被阻止或已移除的 runtime，或请求中途关闭的 runtime generation，返回 `workspace_runtime_unavailable` 和 `Retry-After`。
- `500` —— 意外的本地错误使用现有的 bridge 错误映射。

### `GET /workspace/:id/session-groups`

列出 workspace 的用户自定义 session groups。单数 GET 选择器接受任何已注册的 workspace id 或 URL 编码的规范 cwd。复数 GET 别名也可用于不受信任的次要 workspace，仅读取组织 sidecar。复数 group 变更仍然受信任门控，而单数 group 变更保留其仅限主的兼容行为。Pre-flight 检查 `caps.features.includes('session_organization')`。

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

### 多 workspace 活跃 session 路由

当 `multi_workspace_sessions` 被通告时，活跃 session 操作从 `sessionId` 识别其 workspace；客户端不需要在 URL 中添加 workspace 选择器。除了现有的所有者路由的生命周期操作外，这还适用于 `PATCH /session/:id/metadata`、`POST /session/:id/recap`、`POST /session/:id/generate`、`POST /session/:id/btw`、`POST /session/:id/mid-turn-message`、`DELETE /session/:id/mid-turn-messages/:messageId`、`POST /session/:id/tasks/:taskId/cancel`、`POST /session/:id/goal/clear`、`POST /session/:id/continue`、`POST /session/:id/language`、`POST /session/:id/artifacts` 和 `DELETE /session/:id/artifacts/:artifactId`。Daemon 将每个请求路由到拥有该活跃 session 的受信任 runtime。不受信任的非主所有者返回 `403 untrusted_workspace`，缺失的活跃所有者返回 `404 session_not_found`，模糊的所有者以 `500 ambiguous_session_owner` 关闭失败。

此规则仅限活跃 session，不会使每个无 workspace 的 session 路由都具备多 workspace 感知。持久化或归档操作使用其文档中记录的 workspace 限定路由。`POST /session/:id/branch`、`POST /session/:id/fork` 和 `POST /session/:id/cd` 故意保留仅限主 workspace，对非主所有者返回 `non_primary_session_route_not_supported`。

### Turn 中间消息

`POST /session/:id/mid-turn-message` 在 turn 活跃时接受 `{ "message": "..." }`。成功的准入返回 `{ "accepted": true, "messageId": "<uuid>" }`；空闲的 session 或已满的 turn 中间队列返回 `{ "accepted": false }`，客户端应保留该消息以便在下一个普通 turn 中提交。当消息被排入运行中的 turn 时，`mid_turn_message_injected` 包含对齐的 `messages` 和 `messageIds` 数组以及发起客户端 id。

当 `session_mid_turn_message_mutation` 被通告时，发起客户端可以调用 `DELETE /session/:id/mid-turn-messages/:messageId`。它仅在该消息仍在 daemon 队列中等待时返回 `{ "removed": true }`。`{ "removed": false }` 表示未找到、属于另一个客户端或已被排入。

### `POST /session/:id/prompt`

将 prompt 转发给 agent。多 prompt 调用者按 session 进行 FIFO 队列排队（ACP 保证每个 session 只有一个 active prompt）。

请求：

```json
{
  "prompt": [{ "type": "text", "text": "What does src/main.ts do?" }],
  "delivery": {
    "kind": "channel",
    "target": {
      "channelName": "dingtalk",
      "type": "user",
      "id": "platform-user-id"
    }
  }
}
```

`delivery` 是可选的，需要 `channel_delivery` 能力。当 prompt 被准入时，daemon 仍然返回 `202 {promptId,lastEventId}`。在成功的 `end_turn` 之后，session 将可见的最终文本提交到确切 workspace 的已运行 Channel Worker。有效负载仅为最后一个无工具的助手响应块；工具调用前导、工具间叙述、被取代的重试和更早的自动继续块被排除。空的或仅包含空白字符的最终结果仍然会在授权被消费后产生一个相关的 `channel_delivery_result`，其 `status: "skipped"`，但它不会联系 worker。投递成功或失败稍后通过相同的可重放事件到达，且永远不会将 `turn_complete` 变为 `turn_error`。取消、Agent 失败和 token 限制终止不会发送或发布投递结果。

校验：`prompt` 必须是非空的对象数组。其他校验失败会在到达 bridge 前返回 `400`。

响应：

```json
{ "promptId": "session-id########1", "lastEventId": 42 }
```

`202` 响应确认准入，而非 Agent 完成。在 `lastEventId` 之后观察 session SSE 流，并通过 `promptId` 关联 `turn_complete` 或 `turn_error`。`turn_complete.data.stopReason` 可能是 `end_turn`、`cancelled`、`max_tokens`、`error` 或 `length`。

如果 HTTP 客户端在 prompt 执行中途断开连接，daemon 会向 agent 发送 ACP `cancel` 通知，agent 会以 `stopReason: "cancelled"` 结束该 prompt。

当 `prompt_absolute_deadline` 被通告时，`deadlineMs` 可以缩短配置的服务器截止时间。到期会发出一个相关的 `turn_error`，其 `errorKind: "prompt_deadline_exceeded"`。

### `POST /session/:id/cancel`

取消 session 上**当前活跃**的 prompt。在 ACP 侧，这是一个通知而非请求 — agent 通过将活跃的 `prompt()` 解析为 `cancelled` 来进行确认。

```bash
curl -X POST http://127.0.0.1:4170/session/$SID/cancel
# → 204 No Content
```

> **多 prompt 契约：** 取消仅影响活跃的 prompt。同一客户端之前 POST 且仍排队在活跃 prompt 之后的任何 prompt 将继续执行。多 prompt 队列是 daemon 引入的行为（不在 ACP 规范中）；排队 prompt 的契约是"它们会持续运行，除非你逐个取消它们，或者通过 channel exit 终止 session"。

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

### `PATCH /session/:id/organization` 和 `PATCH /workspaces/:workspace/session/:id/organization`

通过现有的变更门控更新本地 session 组织状态。预检 `caps.features.includes('session_organization')`；复数路由还需要 `workspace_qualified_rest_core`。在复数路由上，`:workspace` 首先解析为精确的已注册 workspace id，然后解析为 URL 编码的规范绝对 cwd。选定的 runtime 必须受信任。Session 存在性和非空 `groupId` 验证的作用域限定在该 runtime 的活跃持久化、归档持久化和活跃 session 状态以及 group 存储，不回退到主 workspace 或另一个 workspace。旧版路由仍然仅限主 workspace。

请求：

```json
{ "isPinned": true, "groupId": "018f..." }
```

| 字段       | 必填 | 说明                                                                                                |
| ---------- | -------- | ---------------------------------------------------------------------------------------------------- |
| `isPinned` | 否       | 布尔值。如果尚未置顶，`true` 会设置 `pinnedAt`；`false` 会清除 `pinnedAt`。             |
| `groupId`  | 否       | 自定义组 id，或 `null` 表示未分组。未知的组 id 会返回 `404 { code: "group_not_found" }`。 |
| `color`    | 否       | 受支持的 session 颜色 token，或 `null` 以清除 session 颜色。 |

响应：

```json
{
  "sessionId": "<uuid>",
  "groupId": "018f...",
  "color": "blue",
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

生成关于该 session 的一句话"我上次进行到哪里了"的总结。封装了 core 的 `generateSessionRecap`（`packages/core/src/services/sessionRecap.ts`），它针对快速模型运行一个 side-query，禁用工具，设置 `maxOutputTokens: 300`，并采用严格的 `<recap>...</recap>` 输出格式。side-query 读取 session 现有的 GeminiClient 聊天记录，并**不会**向其添加内容。

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

### `POST /session/:id/generate`

能力标签：`session_generation`。

从调用方提供的 prompt 运行请求作用域的文本生成。请求不读取或变更对话历史，也不暴露工具。它优先使用配置的快速模型，如果快速模型缺失或无法解析则回退到 session 的主模型。该端点是任务无关的；翻译只是调用方定义的 prompt 的一种可能用途。

请求：

```json
{ "prompt": "Translate into Chinese: Hello" }
```

响应为 `text/event-stream`。服务器立即写入一个初始 SSE 注释，随后是 `started`、可选的 `thinking` 进度事件、零个或多个 `delta` 事件，以及 `done`。`thinking` 事件不携带推理内容。流式传输开始后的模型失败会产生 `error` 事件；它不会用另一个模型重试。Prompt 限制为 32 KiB 的 UTF-8 文本。断开 HTTP 客户端会取消生成请求。

### 变更：approval, tools, skills, init, MCP restart

Daemon 暴露五个变更控制路由，允许远程客户端在不接触 daemon 宿主机 CLI 的情况下更改运行时状态。这五个路由均：

- 受 PR 15 中引入的 **strict** mutation gate 控制。未配置 bearer token 的 daemon 会以 `401 {code: 'token_required'}` 拒绝请求。在启用前请先配置 `--token`（或 `QWEN_SERVER_TOKEN`）。
- 接收并记录 `X-Qwen-Client-Id` 请求头（PR 7 审计链）。当该请求头携带受信任的 id 时，daemon 会在相应的 SSE 事件中发出 `originatorClientId`，以便跨客户端 UI 能够抑制自身变更产生的回显。
- 在暴露功能前，对每个按 tag 划分的能力进行预检 (pre-flight)。旧版 daemon 会为该路由返回 `404`。

工具切换、skill 切换、init 和 MCP 重启路由会发出 **workspace 作用域** 的事件：每个活跃的 session SSE 总线都会收到该事件，无论触发变更时附加的是哪个 session。`approval-mode` 发出的是 **session 作用域** 的事件，因为该更改仅局限于单个 session 的 `Config`。

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

#### `POST /workspace/skills/:name/enable`

Capability tag: `workspace_skill_toggle`。Workspace 限定形式为 `POST /workspaces/:workspace/skills/:name/enable`。

通过 workspace skill 设置切换已加载的、用户可调用的 skill，匹配 CLI `/skills` 面板的 Space 键行为。查找不区分大小写，而持久化和响应使用 skill 的规范名称。启用 `skills.defaultDisabled` 的 skill 会添加一个 workspace `skills.enabled` 选择加入；禁用会移除该选择加入并添加一个 workspace `skills.disabled` 条目。不再加载的 skill 的现有条目会被保留，目标的重复/大小写变体条目会被合并。从系统默认、用户或系统作用域继承的硬禁用条目会锁定 skill：workspace 作用域无法覆盖它。

这不同于 ACP `qwen/skills/setEnabled` 托管 skill 操作和 `disable-model-invocation` frontmatter 字段。有效的 skill 可用性遵循 `skills.disabled` > `skills.enabled` > `skills.defaultDisabled`。硬禁用和默认禁用都会将 skill 从斜杠命令/模型可用性中移除，并拒绝后续的 skill 执行。`disable-model-invocation: true` 保持直接用户调用可用，仅将 skill 从模型调用中隐藏。

请求：

```json
{ "enabled": false }
```

响应 (200)：

```json
{
  "skillName": "review",
  "enabled": false,
  "changed": true,
  "activation": "applied",
  "sessionsRefreshed": 2,
  "sessionsFailed": 0
}
```

`activation` 在每个活跃 session 都刷新时为 `applied`，在没有 ACP 子进程时为 `deferred`（持久化设置会在一个子进程启动时使用），在至少一个活跃 session 刷新失败时为 `partial`。繁忙的 session 也包含在内。Daemon 为 ACP 子进程和每个活跃 session 重新加载 workspace 设置，通知 SkillManager 消费者，并推送 `available_commands_update`。已发送给模型的请求不会被重写；后续的验证、命令快照和模型上下文使用新状态。如果持久化失败，不会发出刷新或事件。如果 session 刷新失败，已提交的设置会被保留。当子进程返回每个 session 的结果时，session 计数是精确的。如果刷新控制本身在返回这些结果之前失败，`sessionsFailed: 1` 是一个保守的下界，表示刷新请求失败。

错误：

- `400 {code: 'invalid_skill_name'}` — 路径参数为空，或超过 256 个字符。
- `400 {code: 'invalid_enabled_flag'}` — `enabled` 缺失或不是布尔值。
- `403 {code: 'untrusted_workspace'}` — 选定的 workspace 不受信任。
- `404 {code: 'skill_not_found'}` — 没有已加载的 skill 匹配该名称。
- `409 {code: 'skill_not_toggleable', reason: 'not_user_invocable' | 'inactive_extension' | 'locked', lockedScope?: 'system' | 'user' | 'systemDefaults'}` — CLI 面板不允许切换目标。`lockedScope` 仅在 `reason` 为 `locked` 时存在。

该变更复用 workspace 作用域的 `settings_changed` 事件（针对每个变更的 key，`skills.disabled` 和/或 `skills.enabled`）；它不添加新的事件类型。Workspace skill 状态 cell 包含可选的 `disabledReason: 'hard' | 'default' | 'inactive_extension'` 和 `lockedScope: 'system' | 'user' | 'systemDefaults'` 字段。

#### `POST /workspace/skills/enable`

Capability tag：`workspace_skill_batch_toggle`。Workspace 限定形式为 `POST /workspaces/:workspace/skills/enable`。

在一个请求中切换最多 100 个已加载的 Skill；上限按去重前的原始 `skillNames` 条目计数。名称会被修剪并按大小写不敏感去重，同时保留首次出现的顺序。Daemon 根据一个 Skill 状态快照进行验证，在一次锁定的设置写入中持久化所有有效变更，并刷新活跃 session 一次。对于预期的目标错误采用尽力处理：未知、隐藏、非活跃 extension 或锁定的目标会被记录在 `errors` 中，不会阻止其他有效目标被应用。意外的持久化或 runtime generation 失败仍会使整个请求失败。

请求：

```json
{
  "skillNames": ["review", "deploy", "missing"],
  "enabled": false
}
```

响应 (200)：

```json
{
  "enabled": false,
  "activation": "applied",
  "sessionsRefreshed": 2,
  "sessionsFailed": 0,
  "results": [
    {
      "skillName": "review",
      "enabled": false,
      "changed": true
    },
    {
      "skillName": "deploy",
      "enabled": false,
      "changed": true
    }
  ],
  "errors": [
    {
      "skillName": "missing",
      "code": "skill_not_found",
      "error": "Skill not found: missing"
    }
  ]
}
```

目标错误使用 `skill_not_found`、`skill_not_toggleable` 或 `skill_inactive_extension`。格式错误的请求返回 HTTP 400 并附带 `invalid_skill_names`、`invalid_skill_name` 或 `invalid_enabled_flag`。身份验证、workspace 信任、客户端身份、意外的持久化失败和 runtime generation 失败通过标准路由门控使整个请求失败。批次级的 `activation`、`sessionsRefreshed` 和 `sessionsFailed` 描述所有已变更结果共享的单次活跃 session 刷新。`activation` 报告刷新尝试而非结果：没有目标变更的批次（例如每个目标都出错）在 session 活跃时仍然回答 `applied`，匹配单个 Skill 的无操作响应，因此请从每个结果的 `changed` 标志和 `errors` 数组派生实际变更内容。

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
- `409 {code: 'workspace_init_conflict', path, existingSize}` — 文件存在且包含非空白内容，且 `force` 被省略或为 false。响应体包含绝对路径和大小（字节），以便 SDK 客户端无需重新 stat 即可渲染"是否覆盖 N 字节？"的提示。

SSE 事件（workspace 作用域）：`workspace_initialized`，携带 `{path, action, originatorClientId?}`。

#### `POST /workspace/mcp/reload`

将持久化的 MCP 设置重新加载到 workspace 发现配置和每个活跃 session 中。Workspace 限定形式为 `POST /workspaces/:workspace/mcp/reload`。

请求 body：

```json
{ "forceReconnectAll": true }
```

`forceReconnectAll` 是可选的，默认为 `false`，保留增量协调。当为 true 时，daemon 在设置协调后重新连接每个符合条件的已配置 MCP server。或者，传递 `forceReconnectWhich: ["server-a", "server-b"]` 仅重新连接指定名称的 server。这两个选项互斥。强制重新连接会导致每个传输读取另一个本地 Qwen Code 进程可能已写入 token 存储的凭据；它不会启动 OAuth 授权流程。

该路由返回 `202 { "accepted": true }`；轮询 `GET /workspace/mcp` 以获取最终连接状态。无效的选项值返回 400。

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
X-Qwen-Event-Epoch: ...  ← 可选，将 cursor 与其 bus epoch 配对
X-Qwen-Client-Id: ...    ← 可选的客户端标识和诊断关联
```

查询参数：

| 参数               | 必填 | 说明                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ------------------ | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `maxQueued`        | 否       | 每个订阅者的**实时帧积压**上限。范围 `[16, 2048]`，默认 256。订阅时强制推送的重放帧不受帧和字节上限限制；实际消耗上限的是在订阅者仍在排空大型 `Last-Event-ID: 0` 重放时到达的实时事件。对于冷重连，请调高此值，以免实时尾部在消费者追上之前触发慢客户端警告/驱逐。实时序列化字节上限在 daemon 侧是固定的（默认 2 MiB），且没有查询参数。超出范围/非十进制/存在但为空的值会在 SSE 握手打开前返回 `400 invalid_max_queued`。预检 `caps.features.slow_client_warning`——旧版 daemon 会静默忽略该参数。 |
| `connectReason`    | 否       | 客户端报告的诊断提示：`initial`、`resume`、`prompt_restart`、`stream_end`、`transport_error`、`state_resync` 或 `unknown`。无效值会规范化为 `unknown`，且从不拒绝握手。Daemon 不使用此字段进行 auth、重放、驱逐、去重或流替换。                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `previousStreamId` | 否       | 客户端报告的先前已接受的 REST/SSE 流的 UUID。无效值会被忽略。这仅为尽力而为的 lineage，从不改变流行为。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |

成功的握手包含 `X-Qwen-SSE-Stream-Id: <uuid>`。浏览器网关必须保留该响应 header 并通过 `Access-Control-Expose-Headers` 暴露它。旧版 daemon 或中间件可能省略它；客户端必须正常继续并将 lineage 视为不可用。该 id 标识此物理 REST/SSE 连接，并关联其 daemon 生命周期、队列诊断和请求跟踪。

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

- 发送 `Last-Event-ID: <n>` 以从每个 session 的 ring 中重放 `id > n` 的事件（默认深度 **8000**，可通过 `qwen serve --event-ring-size <n>` 调整）。
- **间隙检测：** 如果 `<n>` 早于 ring 中仍保留的最早事件，daemon 会在重放幸存后缀之前发出一个无 id 的 `state_resync_required` 帧。SDK 锁存 `awaitingResync`；客户端应调用 `POST /session/:id/load` 并从当前有界重放快照窗口重建。该快照本身可能以 `history_truncated` 开头（当较旧的内存重放条目被丢弃时）；此标记是信息性的，不得启动另一个 resync 循环。
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