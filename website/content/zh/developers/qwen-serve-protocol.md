# `qwen serve` HTTP 协议参考

[qwen-code daemon 设计](https://github.com/QwenLM/qwen-code/issues/3803)的第一阶段。所有路由均位于 daemon 的基础 URL 下（默认为 `http://127.0.0.1:4170`）。

本参考文档描述了 HTTP 路由和 SSE 帧格式。请结合 [类型化事件模式](./daemon/09-event-schema.md)（用于负载契约、重新同步原因和历史锚点）、[事件总线与重放指南](./daemon/10-event-bus.md)（用于投递和背压）以及 [功能与版本控制](./daemon/11-capabilities-versioning.md)（用于现有的 `v1` 协议和兼容性规则）一起阅读。[守护进程文档索引](./daemon/00-index.md)链接了完整的契约集。

## 身份验证 [#authentication]

当 daemon 启动时指定了 `--token` 或 `QWEN_SERVER_TOKEN` —— 或者绑定到非回环地址且未指定两者（这会生成一个临时 bearer token 并在启动时打印一次）—— **除了普通回环绑定上的 `/health` 之外，每个常规 API 路由**都必须携带：

```
Authorization: Bearer <token>
```

如果在默认回环绑定上未配置令牌，则该标头是可选的，通过主监听器到达的请求拥有完全的操作员 API 权限。工作区信任、会话所有权、`X-Qwen-Client-Id`、权限、功能、验证和资源检查仍然适用。令牌比较采用恒定时间算法。401 响应在 `missing header` / `wrong scheme` / `wrong token` 中保持一致。

**`--open-with-auth`。** 此默认关闭的 CLI 模式要求绑定到回环地址并有一个可用的 Web Shell。它复用正常的 `--token`-over-`QWEN_SERVER_TOKEN` 选择，或者在该选择为空时，在 daemon 启动前生成 32 个随机字节并以 base64url 编码。浏览器通过 `#token=` 接收选定的 bearer token 并按标签页存储；协议和中间件将其视为普通的已配置令牌。片段传递键基于解析后的令牌，而不是此标志：任何 `--open` 启动都会将解析后的 bearer token（无论是配置的还是生成的）附加到启动 URL 的 `#token=` 片段中（本地用户可通过 `ps` / `/proc` 看到，正如启动器警告的那样），因此带有裸 `--open` 的非回环绑定也会以相同方式将其生成的 bearer token 传递给浏览器；此标志的独特贡献在于回环上的令牌 _生成_ 以及浏览器不可用环境下的手动 URL 备用方案。只有忽略 `RunHandle.resolvedToken` 的直接嵌入式调用者，以及从不启动浏览器的客户端，才不会收到自动凭证。浏览器不可用的环境会打印包含密钥的片段 URL 以供手动打开。回环 `/health` 和静态 Web Shell 资源保留下文所述的豁免；`--require-auth` 仍然门控 `/health`。

通道 webhook 入口（`POST /channels/:channelName/webhooks/:source`）在所有模式下都与该 bearer 契约分离。挂载时，它在 `bearerAuth` 之前注册，并使用其配置的 `x-qwen-webhook-secret` 进行身份验证；轮换 daemon bearer token 不会轮换 webhook 源密钥。

**`/health` 豁免** (Bctum)：在回环绑定上（`127.0.0.0/8` / `localhost` / `::1` / `[::1]`），`/health` 在 bearer 中间件之前注册，因此即使 daemon 启动时指定了 `--token`，Pod 内的存活探针也不需要携带令牌。非回环绑定（如 `--hostname 0.0.0.0`）与其他常规 API 路由一样对 `/health` 进行门控 — 有关理由，请参阅 [`GET /health`](#get-health) 部分。

**`--require-auth` (#4175 PR 15)。** 在启动时传递此标志以将“必须具有令牌”的规则扩展到回环地址。当没有令牌源解析成功时，启动失败 — 在回环上这意味着 `--token`、`QWEN_SERVER_TOKEN` 或 `--open-with-auth`（后者会在启动前安装自己生成的令牌，因此 `--require-auth --open-with-auth` 可以启动）。快速失败仅适用于回环：如果不存在两个配置源，非回环绑定会解析其生成的临时 bearer token，这满足该标志的要求。无论哪种情况，`/health` 豁免都会被移除，因此 `/health` 也需要 `Authorization: Bearer …`。

当启用该标志时，全局 `bearerAuth` 中间件门控 **每个常规 API 路由** — 包括 `/health` 和 `/capabilities`。通道 webhook 入口保持独立的共享密钥身份验证，Web Shell 文档和资源路由保持预认证状态。因此，**未经身份验证**的客户端无法预先探测 `caps.features` 以发现需要身份验证：这种情况的发现面是 **401 响应体**本身（根据 [身份验证](#authentication) 部分，在 bearer 门控路由中保持一致）。`require_auth` 能力标签是一个 **身份验证后的确认** — 一旦客户端成功身份验证并读取 `/capabilities`，该标签的存在确认 daemon 启动时指定了 `--require-auth`（有助于审计/合规 UI 以及 SDK 客户端在设置面板中显示“此部署已加固”）。严格变更路由接受受信任的回环主监听器请求、bearer 身份验证请求或配对的 Local Control 请求。不受信任的无令牌嵌入仍会收到 `401 { code: "token_required", error: "…" }`；使用 `--require-auth` 时，全局 bearer 中间件首先拒绝并返回遗留的 `Unauthorized` 响应体。

**`--allow-origin <pattern>` (T2.4 [#4514](https://github.com/QwenLM/qwen-code/issues/4514))。** 默认情况下，跨域访问 daemon 的浏览器客户端会被阻止 — 携带 `Origin` 标头的请求会返回 `403 {"error":"Request denied by CORS policy"}`，因为 CLI/SDK 客户端从不发送 `Origin`，而 daemon 将其存在视为请求来自操作员未选择加入的浏览器上下文的迹象。在非回环绑定且带有令牌的墙上有一个例外先于墙生效：同源请求（`Origin` 等于直接套接字方案加上规范化的 `Host` 权限）经过 bearer 身份验证，并且其 `Origin` 被剥离 **在主监听器上** — 如果 bearer 有效，则遵循路由自身的状态码，如果缺失或无效 bearer，则返回 `401`，**除了预认证的 Web Shell 文档、`/assets/*`、`/manifest.webmanifest`、`/sw.js` 和 `/mcp-app-sandbox` 路由，它们像其他所有模式一样无需凭证即可提供服务** — 只有跨域或不匹配的 `Origin` 值才会保留 `403` 信封。在启动时传递 `--allow-origin <pattern>`（可重复）以安装允许列表而不是墙。每个模式要么是：

- 字面量 `*` —— 允许任何来源。**风险**：当配置了 `*` 但未解析到 bearer token 时，启动将被拒绝。守卫读取的是 _已解析_ 的 token —— `--token`、`QWEN_SERVER_TOKEN`、`--open-with-auth` 生成的回环 token，或者在非回环绑定且两个配置源均不存在时生成的临时 bearer token —— 因此此拒绝仅针对回环地址。当列表中包含 `*` 时，启动面包屑会在 stderr 中发出警告。**建议**：在回环绑定上配合使用 `--require-auth`，以便 `/health` 也受 bearer 保护 —— 默认情况下它在回环上注册于 bearer 中间件之前（因此 k8s/Compose 探针可以在没有 token 的情况下访问它），而 `*` 白名单使其可从任何跨域浏览器访问。`--require-auth` 仍然使 Web Shell 静态资源（`/`、`/assets/*`、`/manifest.webmanifest`、`/sw.js` 以及 `/session/:id`、`/plugins`、`/channels`、`/live`、`/scheduled-tasks`、`/goals` 和 `/settings` 文档导航）按设计在回环上保持预认证状态 —— 它们挂载在 bearer 中间件之前 —— 因此在 `*` 白名单下，它们仍可从任何跨域浏览器读取；`--no-web` 移除了该表面。在非回环绑定上，bearer 在启动时已是强制性的，且 `/health` 注册在其后。常规 API 路由受 bearer 保护，通道 webhook 入口保留其自身的共享密钥门控，除非 `--no-web` 移除它们，否则 Web Shell 静态资源（`/`、`/assets/*`、`/manifest.webmanifest`、`/sw.js` 以及 `/session/:id`、`/plugins`、`/channels`、`/live`、`/scheduled-tasks`、`/goals` 和 `/settings` 文档导航）保持预认证状态。
- 规范 URL 来源 —— `<scheme>://<host>[:<port>]`。**无尾随斜杠，无路径，无用户信息，无查询参数。**如果条目未通过往返 `new URL(pattern).origin === pattern` 验证，启动将以 `InvalidAllowOriginPatternError` 拒绝；错误消息会指明错误的模式和规范形式。严格遵循意图：静默规范化（例如修剪尾随的 `/`）会让拼写错误溜过并接受有歧义的输入。如果没有已解析的 token —— 生成后意味着回环绑定 —— HTTP(S) 条目仅限于回环主机；非回环浏览器来源需要 token，因为它否则可以驱动完整的操作员 API，包括以守护进程用户身份执行代码。显式浏览器扩展来源保留其现有的无 token 本地自动化路径。启动日志记录授予任何无 token 允许的浏览器来源的权限。

匹配的来源在每个请求上接收标准的 CORS 响应头：

```
Access-Control-Allow-Origin: <echoed origin>
Vary: Origin
Access-Control-Allow-Methods: GET, POST, PUT, PATCH, DELETE, OPTIONS
Access-Control-Allow-Headers: Authorization, Content-Type, X-Qwen-Client-Id, Last-Event-ID, X-Qwen-Event-Epoch
Access-Control-Max-Age: 86400
Access-Control-Expose-Headers: Retry-After, X-Qwen-Event-Epoch, X-Qwen-SSE-Stream-Id
```

`Access-Control-Allow-Origin` 逐字回显请求的来源（大写/小写与浏览器发送的一致），而不是字面量 `*`，即使在 `*` 模式下也是如此 —— 浏览器缓存将响应键定于此并与 `Vary: Origin` 配对，回显为后续版本中添加 `Access-Control-Allow-Credentials` 留出了空间而无需更改架构。暴露的头允许浏览器客户端遵守重试提示，保留 SSE 纪元，并关联接受的物理流。`Access-Control-Allow-Credentials` **今天不发送**：配置的守护进程凭据使用 bearer-in-`Authorization`，这在跨域时无需 `credentials: 'include'` 即可工作；可信回环权限不需要浏览器凭据。

OPTIONS 预检请求（带有 `Access-Control-Request-Method` 或 `Access-Control-Request-Headers` 的 OPTIONS）短路返回 `204 No Content` 加上上述头。这是常规的 CORS 模式且安全 —— 预检仅确认守护进程将接受哪些方法/头；实际后续请求在读取或修改任何状态之前，仍先运行 Host 门控，然后要么经过 bearer/监听器权限，要么经过通道 webhook 共享密钥门控。来自匹配来源的普通 OPTIONS 请求继续向下流动并附带 CORS 头。

不匹配白名单的来源仍然获得 `403 {"error":"Request denied by CORS policy"}` —— 与默认墙相同的信封，因此已经解析了墙的响应的客户端不必对部署了白名单的守护进程进行特殊处理。拒绝路径**不**发出任何 `Access-Control-*` 头（浏览器会忽略它们，并且发出这些头会通过头的存在间接泄露白名单大小）。

配置的模式列表有意不在 `/capabilities` 中回显 —— 浏览器客户端已经知道其自身的来源（毕竟它调用了守护进程），并且显示该列表会让 `/capabilities` 的未认证读者枚举每个受信任的来源（对于配置错误的部署是有用的侦察）。SDK 客户端基于 `caps.features.allow_origin` 标签来门控“此守护进程尊重跨域浏览器命中”，而无需知道具体是哪些来源。

回环自来源请求（例如 Web Shell 调用同一 `127.0.0.1:port` 处的守护进程）由一个**单独的** Origin-strip shim 处理，该 shim 在 CORS 中间件之前运行，并为 `127.0.0.1:port` / `localhost:port` / `[::1]:port` / `host.docker.internal:port` 或精确绑定的回环地址和端口移除 `Origin` 头。它还接受浏览器为默认端口发送的方案匹配的无端口形式：端口 80 上的 `http://host` 和端口 443 上的 `https://host`。无论 `--allow-origin` 配置如何，这些请求都会通过 —— 操作员无需列出守护进程自己的端口即可使 Web Shell 工作。

## 常见错误形状

5xx 响应在存在时携带原始错误的 `code` 和 `data`（JSON-RPC 风格 —— ACP SDK 从 Agent 转发 `{code, message, data}`）：

```json
{
  "error": "Internal error",
  "code": -32000,
  "data": { "reason": "model quota exceeded" }
}
```

请求体中的格式错误 JSON 返回：

```json
{ "error": "Invalid JSON in request body" }
```

状态码为 `400`。

未知会话 ID 的 `SessionNotFoundError` 返回：

```json
{
  "error": "No session with id \"<sid>\"",
  "sessionId": "<sid>",
  "code": "session_not_found"
}
```

状态码为 `404`。并发关闭使用 `code: "session_closing"`。

对于 `cwd` 未规范化为已注册工作区的 `POST /session` 的 `WorkspaceMismatchError` 返回 `400` 及：

```json
{
  "error": "Workspace mismatch: daemon is bound to \"…\"",
  "code": "workspace_mismatch",
  "boundWorkspace": "/path/the/daemon/uses/as-primary",
  "requestedWorkspace": "/path/in/the/request"
}
```

使用此功能在预飞行期间检测不匹配：从 `/capabilities` 读取 `workspaceCwd` 并从 `POST /session` 中省略 `cwd`（它回退到主工作区），或者当广告了 `multi_workspace_sessions` 时选择 `workspaces[].cwd` 中的一个。

超过守护进程的 `--max-sessions` 上限的 `POST /session` 返回 `503` 及 `Retry-After: 5` 头和：

```json
{
  "error": "Session limit reached (20)",
  "code": "session_limit_exceeded",
  "limit": 20,
  "scope": "workspace"
}
```

当有效的全守护进程总上限拒绝新会话时 —— `--max-total-sessions`，或在 `limits.maxTotalSessions` 下描述的默认值 —— 返回具有 `"scope": "total"` 的相同响应形状。

附加到现有会话不计入上限，因此即使达到容量上限，空闲守护进程的重新连接仍可正常工作。

如果在 `newSession` 被调度之前 ACP 通道初始化预算过期，`POST /session` 返回 `504` 及 `Retry-After: 5` 和：

```json
{
  "error": "AcpSessionBridge initialize timed out after 10000ms",
  "code": "init_timeout",
  "errorKind": "init_timeout",
  "retryable": true,
  "sideEffectPossible": false,
  "phase": "channel.initialize",
  "timeoutMs": 10000
}
```

`timeoutMs` —— 以及 `error` 的数字后缀 —— 反映守护进程配置的 `--initialize-timeout-ms` 预算（上述值为默认值）。上述完整的安全重试形状仅为普通会话创建发出，其中通道初始化严格先于每个持久变更：在该路径上，`sideEffectPossible: false` 字段是权威的，因为初始化先于 ACP `newSession` 请求，理解此结构化契约的客户端可以在广告延迟后重试而不会冒着重复 Session 的风险。

携带 `branch` 或 `worktree` 的请求，以及由非单纯创建类（例如 `POST /session/:id/branch` 和 `POST /session/:id/side-task`，其中已提交的分支可能比失败的手续存活更久）的变更承载路由所暴露的初始化超时，会返回相同的 `504`，包含 `code: "init_timeout"`、`phase` 和 `timeoutMs` —— 但不包含 `Retry-After`、`retryable` 或 `sideEffectPossible`。对于这些情况，变更结果未知：分支和工作树准备会在通道初始化之前变更 git，而失败时尝试的回滚是尽力而为的（失败的检出回滚会使工作区停留在新分支上，重试可能会暴露分支已存在的冲突）。将所有 5xx 变更响应归类为模糊响应的客户端仍保持保守的故障关闭策略，并应对简化后的结构应用相同的策略。`POST /session/:id/load` 和 `POST /session/:id/resume` 在恢复请求分派之前（即 `ensureChannel` 阶段）通道初始化超时时，会暴露相同的简化 `init_timeout` `504`；与其错误列表中记录的 `session_restore_timeout` `504` 不同，此结构不包含 `Retry-After`，不包含 `retryable`，也不安装防护栏，因为恢复请求从未被分派。`POST /session` 上的 `newSession` 分派超时是一个例外：它返回 `504`，包含 `code: "init_timeout"`、`retryable: true` 和基于预算得出的 `Retry-After`，但不包含 `phase` 或 `sideEffectPossible`，因为创建结果是不确定的。所有其他超时标签保留通用映射。

`RestoreInProgressError` —— 由 `POST /session/:id/load`、`POST /session/:id/resume` 或调用方提供的 id `POST /session` 发出，当另一个注册已经拥有该 id 时 —— 返回 `409` 并包含：

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

当针对一个已有 `session/resume` 正在进行的 id 发出 `session/load`（或反之亦然），或者当调用方提供的 id 生成与任一恢复方向发生竞争时触发。请至少等待 `Retry-After` 秒后重试。同操作竞争（`load` 对 `load`，`resume` 对 `resume`）在恢复活动期间会合并而不是报错。

`reason` 区分共享此代码的两个围栏，且 `Retry-After` 标头跟踪它：

| `reason` | 含义 | `Retry-After` |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------ |
| `restore_in_progress` | 普通恢复正在运行。 | `5`（匹配 `session_limit_exceeded`） |
| `awaiting_abandoned_cleanup` | 公共调用方已获得超时（对于恢复为 `504`，对于会话初始化为 `init_timeout`），且不可取消的 ACP 请求及其清理尚未完成。 | 超时操作的预算秒数 —— 恢复，或调用方提供 id 生成的初始化 —— 限制在 `5`–`120` 之间 |

公共恢复请求受 `limits.sessionRestoreTimeoutMs`（默认 60s）控制。在 `504` 之后，id 保持围栏状态直到迟到的 ACP 请求和清理完成，因此以普通 5 秒节奏持续重试的客户端会在无法清除的 409 上空转 —— 请遵循随 `awaiting_abandoned_cleanup` 一起提供的基于预算推导出的提示。

`SessionWorkspaceConflictError` —— 由 `POST /session/:id/load` 和 `POST /session/:id/resume` 发出，当请求的 `cwd` 指向一个已注册的工作区，但同一会话 id 已由另一个运行时处于活动状态或正在恢复时 —— 返回 `409` 并包含：

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

客户端应使用拥有者工作区重试，或在将 id 恢复到不同工作区之前等待正在进行的恢复完成。同工作区恢复竞争继续使用桥接器的 `restore_in_progress` / 合并行为。

当调用方尝试加载或恢复其 JSONL 位于 `chats/archive/` 下的会话时，发出 `SessionArchivedError`：

```json
{
  "error": "Session \"<sid>\" is archived. Unarchive it before loading.",
  "code": "session_archived",
  "sessionId": "<sid>"
}
```

状态为 `409`。

当同一 id 的会话归档或取消归档转换已在进行中时，发出 `SessionArchivingError`：

```json
{
  "error": "Session \"<sid>\" is being archived or unarchived; retry later.",
  "code": "session_archiving",
  "sessionId": "<sid>"
}
```

状态为 `409` 且 `Retry-After: 5`。

## 能力 [#capabilities]

守护进程从 serve 功能注册表中通告其支持的功能标签。客户端 **必须** 基于 `features` 而非 `mode` 来控制 UI（根据设计 §10）。

```
['health', 'capabilities', 'session_create', 'session_startup_config', 'session_id_override', 'session_scope_override',
 'session_load', 'session_resume', 'session_transcript',
 'unstable_session_resume',
 'session_list', 'session_catalog_batch', 'session_info', 'session_prompt', 'session_mid_turn_message_mutation',
 'session_mid_turn_send_now',
 'session_cancel', 'session_events',
 'slow_client_warning', 'typed_event_schema',
 'session_set_model', 'client_identity', 'client_heartbeat',
 'session_permission_vote', 'permission_vote', 'workspace_mcp', 'workspace_skills',
 'workspace_skills_config_runtime',
 'workspace_providers', 'workspace_acp_preheat', 'workspace_acp_status',
 'auth_provider_install', 'workspace_memory',
 'workspace_agents', 'workspace_agent_generate', 'workspace_env',
 'workspace_preflight', 'session_context', 'session_context_usage',
 'session_supported_commands', 'session_tasks', 'scheduled_task_gate', 'autofix_pr_watches', 'session_monitor_tool_correlation', 'session_stats',
 'session_lsp', 'session_resources', 'session_status',
 'session_close', 'session_metadata', 'session_organization',
 'session_archive', 'mcp_guardrails',
 'workspace_mcp_manage', 'mcp_guardrail_events',
 'mcp_server_runtime_mutation',
 'workspace_file_read', 'workspace_file_bytes', 'workspace_file_write',
 'workspace_file_upload', 'workspace_file_delete', 'workspace_directory_create', 'workspace_directory_delete',
 'session_approval_mode_control', 'workspace_tool_toggle',
 'workspace_skill_settings_toggle', 'workspace_skill_settings_batch_toggle',
 'workspace_session_refresh',
 'extension_batch_activation_v2', 'extension_activation_explicit_refresh',
 'extension_state',
 'workspace_settings', 'workspace_init', 'workspace_mcp_restart',
 'session_recap', 'session_generation', 'session_btw', 'session_btw_stream', 'session_shell_command',
 'standalone_sessions_v1', 'standalone_session_options_v1',
 'mcp_workspace_pool', 'mcp_pool_restart',
 'require_auth', 'allow_origin', 'auth_device_flow',
 'permission_mediation', 'prompt_absolute_deadline', 'writer_idle_timeout',
 'non_blocking_prompt', 'session_language', 'user_language_sync', 'session_message_deletion', 'session_rewind',
 'workspace_hooks', 'session_hooks', 'workspace_extensions',
 'session_branch', 'rate_limit', 'workspace_reload', 'workspace_model_reload', 'channel_delivery',
 'multi_workspace_sessions', 'multi_workspace_session_rewind',
 'multi_workspace_session_shell', 'persistent_workspace_registration',
 'workspace_display_name', 'workspace_runtime_removal', 'workspace_runtime',
 'workspace_qualified_rest_core', 'workspace_qualified_voice',
 'workspace_qualified_memory', 'extension_management_v2', 'extension_git_credentials',
 'extension_local_path_install',
 'workspace_persisted_transcript',
 'workspace_session_export', 'workspace_archived_session_export',
 'workspace_session_live_state', 'workspace_session_live_state_batch',
 'client_mcp_over_ws', 'cdp_tunnel_over_ws', 'browser_automation_mcp']
```

> 条件标签仅在其部署或运行时可用性条件满足时出现（见下表）。F3 的 `permission_mediation` 标签始终开启，并携带 `modes: ['first-responder', 'designated', 'consensus', 'local-only']`，以便 SDK 客户端可以内省构建支持的功能集；运行时激活的策略位于 `body.policy.permission`。

`session_startup_config` 在普通创建和独立创建中通告可选的 `startupConfig: { modelServiceId, reasoningEffort? }`。务必预检此标签：较旧的普通创建路由可能会静默忽略该对象。`modelServiceId` 是必需的（1–256 个字符）；`reasoningEffort` 接受 `none`、`default`、`low`、`medium`、`high`、`xhigh` 或 `max`（如果所选模型支持）。省略时仅应用模型，不使用推理设置器或隐式的 `default`。该对象不能与遗留的顶层 `modelServiceId` 或显式单作用域结合使用，并意味着创建一个新线程。启动期间从不保存共享默认值；后续会话行为保持不变。

成功响应包含 `modelApplied: true` 和 `startupConfigApplied: { modelServiceId, reasoningEffort?, effectiveReasoning? }`。模型选择器是规范化的。只有显式的推理请求才包含两个推理字段；有效状态为 `{ state: 'disabled' }`、`{ state: 'provider-default' }` 或 `{ state: 'enabled', effort? }`（仅切换推理没有 effort 级别）。无效结构为 `400 invalid_startup_config`；被拒绝或未确认的选择为 `422 startup_config_rejected`。明确的独立创建拒绝会回滚其拥有的记录，并在返回前尝试丢弃空输出目录；无法确认移除的记录回滚以及瞬态启动失败会保留 `standalone_creation_outcome_unknown`，而失败的目录丢弃仅会被记录日志，明确的拒绝仍会返回。SDK 中成功响应体的确认失败属于协议错误，而不是采用已恢复会话的指令。

`session_scope_override` 是用于协商 `POST /session` 上每请求 `sessionScope` 字段的句柄（见下文）。较旧的守护进程会静默忽略该字段，因此 SDK 客户端应在发送前预检 `caps.features` 以确认支持此标签。

`session_id_override` 是用于协商 `POST /session` 和 ACP `session/new` 元数据上可选调用方提供的 `sessionId` 的句柄。客户端必须在发送该字段前确认 `caps.features` 包含此标签，因为较旧的守护进程可能会静默忽略它。

`persistent_workspace_registration` 通告对运行时添加的工作区的持久化注册。`POST /workspaces` 接受 `{ "cwd": "/absolute/path", "persist": true }`；成功响应包含 `persisted: true`。注册范围限定于用户 Qwen 主目录下守护进程的规范化主工作区，并在下次守护进程启动时恢复。省略 `persist` 可保留进程本地注册。`GET /workspace-registrations` 列出存储的期望集合，`DELETE /workspace-registrations/:id` 会在下次重启时忘记某个条目，而不会热移除活动运行时。

`workspace_display_name` 通告 `POST /workspaces` 上的可选 `displayName` 输入、通过 `PATCH /workspaces/:workspace` 进行的工作区元数据更新，以及工作区投影中的可选显示名称字段。名称不参与查找或路由：`id` 和规范的 `cwd` 仍然是唯一的选择器，且允许重复名称。

`workspace_runtime_removal` 通过 `DELETE /workspaces/:workspace` 宣告支持同步热移除。Capability workspace 条目添加可选的 `removable`；仅带有 `removable: true` 的行可被移除。移除操作还会忘记运行时的所有持久化注册别名，但绝不会删除文件、设置、转录记录或归档。

`workspace_runtime` 宣告支持 `GET /workspace/runtime/status`、`POST /workspace/runtime/ensure` 及其对应的 `/workspaces/:workspace/runtime/...` 变体。`ensure` 不接受 capability 选择：它启动或复用所选受信任工作区的 ACP 运行时，并返回其生命周期状态和单调递增的运行时纪元（epoch）。主路由仅由主运行时拥有；限定路由仅解析所选的已注册运行时，绝不回退。成功的 ensure 操作会续期运行时的十分钟保活窗口。Status 是只读的，且绝不会启动子进程。并发 ensure 共享一次物理启动过程。启动进行中或失败时返回可重试的 `503 runtime_still_starting` 或 `503 runtime_initialization_failed`。即使 ensure 观察预算过期，capability 准备仍可能继续；在这种情况下，ensure 仍然返回具有非就绪 capability 状态的活跃运行时，以便进行 status 轮询。仅当所有活跃的运行时桥接提供权威的生命周期快照时，才宣告该 capability；选定的遗留注入式桥接返回 `501 workspace_runtime_not_supported`，而不是猜测的状态或纪元。

`workspace_runtime_stop` 独立宣告支持用户确认的运行时停止。`GET /workspaces/runtime-stop-options` 是一个只读的全局进程预览：包括已提交的子进程数量、建模的子进程上限，以及每个可见工作区的会话、阻塞原因、通道 ID、纪元、当前停止令牌和最新回执。普通加载的会话可以被显式停止；独立的 ACP 客户端、启用的计划任务、待处理的调度器/管理/启动工作、内存任务、工作线程、语音和专用运行时均被阻塞。`POST /workspaces/:workspace/runtime/stop` 使用严格的变更门控，且仅针对选定的受信任运行时。发送来自预览的 `confirmInterruptions: true`、`expectedChannelId`、`expectedRuntimeEpoch`、`expectedStopToken` 和精确的 `expectedSessionIds`。绝不回退到主运行时。预览和每个回执将运行时的活跃 ACP 通道列为 `channels`（`channelId`、`runtimeEpoch`、可选的 `executionEngine`）；一个运行时可以为每个执行引擎拥有一个通道，而停止操作涵盖所有这些通道。`channelId` 指定第一个列出的通道，`runtimeEpoch` 是最新列出的纪元，因此如果在预览之后启动了新通道，则确认信息将变为陈旧。

成功响应包含 `state: "stopped"`、`stopped: true` 和 `released: true`，这是在确认会话关闭以及进程注册表释放所有列出的子进程之后生成的。注册信息、文件和保存的历史记录保持不变。响应包括受影响的、中断的、已关闭的和剩余的会话 ID。陈旧或被阻塞的确认返回 HTTP 409（`workspace_runtime_stop_stale` / `workspace_runtime_stop_blocked`）；部分关闭返回 409 `workspace_runtime_stop_incomplete`；正在进行的拆除或未证明释放的失败拆除返回 503 `workspace_runtime_stop_in_progress` / `workspace_runtime_stop_failed`；不支持的管理操作返回 501 `workspace_runtime_stop_not_supported`。如果后续证明了注册表释放，不干净的拆除可能会返回带有错误警告的 200；未确认的会话刷新仍返回部分/错误结果。总观察/关闭预算为 60 秒。如果预算在会话关闭仍在进行时过期，响应将以 `state: "failed"` 和 `503 workspace_runtime_stop_failed` 结束；清理工作单独继续。所选工作区保持隔离，其子进程在实际清理完成之前仍被计入，即使调用者已经收到失败通知。只读选项可以在确认关闭并证明释放后报告 `stopped`，或在持久化未确认时报告 `incomplete`；已返回的失败快照不会改变。如果预算是在会话关闭之间耗尽的，响应将以 `state: "incomplete"` 和 `409 workspace_runtime_stop_incomplete` 结束：不再启动进一步的关闭或强制终止，停止操作的准入守卫被释放（存活的子进程照常计入），停止剩余会话需要新的预览和确认。对刷新的拒绝不能通过强制终止剩余会话来绕过。根进程退出或全局进程计数下降本身并不能确立所选子进程的释放。在 Windows 上，由于注册表不跟踪后代进程组，根进程的确定退出即为释放证据，因此 `released: true` 在那里并不能证明进程树已消失。

重复确认最近消费的令牌会观察到相同的操作。新的确认可以重试未完成的停止操作，轮换令牌；较早消费的令牌随后变为陈旧。如果响应丢失，请读取选项并根据工作区和停止令牌匹配最新回执，而不是停止另一个目标。在移除、信任更改或守护进程/桥接重建后，回执可能不可用；缺失意味着结果未知，且绝不授权继续执行。SDK `runtimeStopOptions()` 和 `workspaceById(id).stopRuntime(confirmation)` 即使使用 ACP 传输也采用 REST，并且绝不自动重复 POST。会话订阅者接收带有 `reason: "client_close"` 和 `cause: "workspace_runtime_stop"` 的 `session_closed`；与停止相关的致命退出额外标记 `persistenceUnconfirmed: true`。更新的 Web Shell 客户端保留保存的选择/转录记录，并等待显式的 Resume。这是一次性停止，而非持久挂起；错过事件的用户可能会再次竞争容量。

运行时状态和 ensure 响应使用此格式：

```json
{
  "v": 1,
  "workspaceCwd": "/work/project",
  "state": "active",
  "runtimeLive": true,
  "runtimeEpoch": 4,
  "capabilities": {
    "skills": {
      "state": "ready",
      "revision": 2,
      "runtimeEpoch": 4
    }
  }
}
```

当工作区运行时拥有多个执行引擎时，`runtimeLive` 和 `runtimeEpoch` 描述服务于工作区控制（MCP 和 Skills）的通道：只要该通道处于活动状态，其他引擎的启动或退出不会改变它们。当该通道不活动时，`state` 将其报告为 `cold`、`starting` 或 `stopping`；`active` 和 `idle` 统计所有引擎上的工作负载。

`capabilities.skills.state` 是 `not_started`、`starting`、`ready`、`stale` 或 `error`；失败时在 `capabilities.skills.error` 中包含 `{code, message}`。Skills 目录仅在顶层和 capability `runtimeEpoch` 值匹配时才被视为最新。`revision` 在一个运行时纪元内对 Skills 准备进行排序，不得跨纪元进行比较。

`workspace_skills_config_runtime` 在 `/workspace/{config,runtime}/skills` 和 `/workspaces/:workspace/{config,runtime}/skills` 下宣告分离的 Skills 读取和配置变更。Web Shell 使用这些路由进行 Skills 管理，并在组合新会话时，在替换为匹配纪元的运行时目录之前，立即从配置中填充斜杠命令。当缺少该功能时，客户端必须继续使用遗留的 Skills 路由，且不得仅为 Skills 调用 runtime ensure。

`session_load` 和 `session_resume` 宣告显式恢复路由（`POST /session/:id/load` 和 `POST /session/:id/resume`）。较旧的守护进程对这些路径返回 `404`，因此 SDK 客户端应在调用前预检 `caps.features`。`unstable_session_resume` 仍作为弃用的别名被宣告，以兼容底层 ACP 方法命名为 `connection.unstable_resumeSession` 时发布的 SDK；新客户端应基于 `session_resume` 进行门控。

`limits.sessionRestoreTimeoutMs`（如果存在）是守护进程为底层 ACP `loadSession` / `unstable_resumeSession` 请求设定的挂钟时间预算。这是一个附加的 v1 字段。TypeScript SDK 给守护进程预留了 10 秒的客户端余量，而 Web Shell 看门狗预留了 15 秒；与旧版守护进程通信的客户端应分别使用 70 秒和 75 秒。

`session_transcript` 宣告了 `GET /session/:id/transcript`，这是对持久化活动会话 JSONL 的只读分页回放视图。它与 `/load` 分开：它不会附加客户端、初始化实时 EventBus、创建实时会话或更改实时回放窗口。当客户端需要长会话的完整磁盘转录记录时，应使用此功能，并仅在冷 UI 恢复期间继续使用 `/load` 进行有界实时回放。

`workspace_persisted_transcript` 宣告了 `GET /workspaces/:workspace/session/:id/transcript`，这是一个仅本地守护进程的持久化分页器，它不启动 ACP、查询桥接状态、加载设置、发现项目能力或创建遗留的持久化游标键。该标签是无条件的，因为受信任的单工作区主进程可以使用复数路由；每个工作区的信任授权仍在每次请求时进行评估。已注册的不受信任的次要工作区可以读取，而不受信任的主进程仍会被拒绝。

`workspace_session_export` 宣告了 `GET /workspaces/:workspace/session/:id/export`，这是选定工作区活动持久化会话的仅限受信任用户的完整导出。它独立于 `session_export` 和 `workspace_qualified_rest_core`：发布的守护进程可以在不实现复数路由的情况下宣告这两个较旧的标签，因此客户端必须直接预检此标签。该标签是无条件的，因为受信任的单工作区主进程可以通过 id 或 cwd 使用该路由。导出不解析实时所有者、不启动 ACP、不附加客户端，也不回退到另一个工作区。

`workspace_archived_session_export` 宣告了 `GET /workspaces/:workspace/session/:id/archive/export`，这是从选定工作区的归档持久化存储中进行的仅限受信任用户的完整导出。它独立于 `workspace_session_export` 和 `workspace_qualified_rest_core`；客户端必须直接预检此标签。不同的路由可防止旧版守护进程忽略归档意图并返回具有相同 id 的活动转录记录。

`workspace_session_live_state` 宣告了 `GET /workspaces/:workspace/sessions/live-state`，这是选定工作区运行时实时会话的仅限受信任用户、仅内存快照，以及一个告知客户端何时需要进行完整持久化目录重载的内存目录版本。它独立于 `workspace_qualified_rest_core`：发布的守护进程可以在不实现此路由的情况下宣告更广泛的工作区 REST 功能，因此客户端必须直接预检此标签。该标签是无条件的，因为受信任的单工作区主进程可以通过 id 或 cwd 使用该路由；每个工作区的信任检查仍然适用于每次请求，并且该路由不会将宽松的不受信任次要工作区持久化目录读取策略扩展到实时桥接状态。该标签意味着端点存在；它并不承诺每个实时项都携带可选的 `updatedAt` 活动水印，这取决于生命周期。

`workspace_session_live_state_batch` 宣告了 `POST /sessions/live-state`。客户端在批量轮询之前预检一次，并为旧版守护进程保留单工作区路由。批量操作使用与单工作区路由相同的受信任、仅内存快照和目录版本语义。

可选的顶层 `/capabilities` 字段 `sessionLiveStatePollIntervalMs` 以毫秒为单位宣告守护进程范围的实时状态轮询间隔。它根据启动环境变量 `QWEN_SESSION_LIVE_STATE_POLL_INTERVAL_MS` 解析一次，独立于工作区环境覆盖。接受从 `1000` 到 `2147483647` 的整数值；缺失或无效的值使用 `5000`。Web Shell 对所有工作区实时状态轮询使用此提示，并且在来自旧版或不兼容守护进程的字段缺失或无效时，也回退到 `5000`。此字段不会改变路由的快照语义、立即本地/可见性刷新或完整目录轮询。SDK 客户端仍需负责自己的计时器。

`slow_client_warning` 涵盖 SSE 背压行为：(a) 当订阅者的实时帧积压或实时序列化字节积压超过 75% 满时，守护进程发出一个 `slow_client_warning` 合成事件流帧，每次溢出事件发生一次（在两个测量值均降至 37.5% 以下后重新武装）；(b) `GET /session/:id/events` 接受一个 `?maxQueued=N` 查询参数（范围 `[16, 2048]`），用于针对大型回放环冷重连时预分配每个订阅者的帧积压大小。序列化字节上限由守护进程拥有（默认每个订阅者 **2 MiB**），仅限实时，且有意没有查询参数。守护进程范围的环大小由 `--event-ring-size` 控制（默认 **8000**，参见 #3803 §02）。旧版守护进程静默地缺乏警告/查询行为——在选择加入之前预检此标签。

`typed_event_schema` 宣告与 SDK 的 `KnownDaemonEvent` 架构匹配的守护进程事件负载。旧版守护进程可能仍会流式传输兼容帧，但 SDK 客户端应在假设类型化事件覆盖之前预检此标签。

`client_heartbeat` 宣告了 `POST /session/:id/heartbeat`。旧版守护进程返回 `404`；在发出周期性心跳之前预检此标签。

`session_close` 和 `session_metadata` 宣告了 `DELETE /session/:id` 和 `PATCH /session/:id/metadata`。旧版守护进程返回 `404`；在暴露关闭或重命名功能之前预检这些标签。

`session_organization` 宣告自定义会话组和置顶。它添加了 `GET/POST/PATCH/DELETE /workspace/:id/session-groups`、`PATCH /session/:id/organization` 以及选择性启用的组织列表视图 `GET /workspace/:id/sessions?view=organized`。当同时宣告 `session_organization` 和 `workspace_qualified_rest_core` 时，工作区限定的组织变更 `PATCH /workspaces/:workspace/session/:id/organization` 也可用。遗留变更仍然仅限于主工作区。旧版守护进程对变更/组路由返回 `404` 并忽略组织视图契约，因此 WebShell/SDK 客户端必须在显示匹配的分组或置顶 UI 之前预检这些标签。

`session_archive` 宣告 v1 目录状态归档 API：`POST /sessions/archive`、`POST /sessions/unarchive` 和 `GET /workspace/:id/sessions?archiveState=active|archived`。归档会话在取消归档之前无法加载或恢复。`session_archive_idle_guard` 宣告附加的 `requireIdle` 归档选项：拥有运行时在开始关闭之前立即检查确认活动工作处于空闲状态，否则保留活动转录记录。`session_storage_conflict_repair` 宣告下面描述的附加 `resolveConflicts` 请求选项和 `resolvedConflicts` 响应桶。

`workspace_qualified_rest_core` 在 `/workspaces/:workspace/...` 下提供复数核心 REST 路由。选择器首先解析为精确的工作区 ID，然后解析为规范化后的 URL 编码绝对 cwd。较新的单工作区守护进程即使在 `multi_workspace_sessions` 缺失时也会在 `workspaces[]` 中包含主运行时，允许客户端发现工作区限定路由所需的 ID；对于省略该数组的旧版守护进程，客户端应回退到 `capabilities.workspaceCwd`。信任状态和信任请求路由可用于已注册的未受信任工作区；限定的钩子状态读取 (`GET /workspaces/:workspace/hooks`) 也可用于已注册的未受信任工作区，因为它报告待处理的项目钩子信任决策，与限定的批准变更匹配；文件读取路由遵循现有的文件系统读取策略。已注册的未受信任次要工作区还暴露仅持久化的会话和会话组目录：这些读取操作不会附加到会话、启动 ACP 或合并实时桥接状态。除非单独的能力文档说明了更窄的策略，否则文件写入、目录变更和其他复数核心路由需要受信任的工作区：`workspace_persisted_transcript`（只读），或信任授予变更，无论是否广告 `workspace_trust_grant`，它都接受已注册的未受信任工作区——该标签仅报告信任热重载是否已连接，因此记录的决策可以在无需重启守护进程的情况下到达运行中的运行时；它从不报告路由是否被服务。未受信任的主工作区继续从复数目录和转录路由接收 `403 { code: "untrusted_workspace" }`；遗留的单数主路由保持其现有的兼容性行为。此标签涵盖核心文件、状态、设置、权限、信任、生命周期、MCP 控制、工具和技能切换、内存、工作区代理 CRUD 以及会话存储表面。它不涵盖身份验证、语音、扩展、ACP/WebSocket 传输、通道工作者路由或工作区限定的会话导出；请分别预检 `workspace_session_export` 或 `workspace_archived_session_export`。工作区信任不是 ACL：持有守护进程令牌的客户端可以读取此策略允许的每个已注册工作区表面。

`workspace_qualified_voice` 提供由受信任工作区运行时选择的语音路由：`GET` 和 `POST /workspaces/:workspace/voice`、`POST /workspaces/:workspace/voice/transcribe` 以及 `WS /workspaces/:workspace/voice/stream`。仅当多工作区运行时和共享 ACP/语音 WebSocket 监听器均启用时才提供此功能。选择器遵循与其他复数路由相同的 ID 或编码绝对 cwd 规则。对于 REST，未知选择器返回 `400 { code: "workspace_mismatch" }`，未受信任选择器返回 `403 { code: "untrusted_workspace" }`；WebSocket 升级拒绝会暴露相应的 HTTP 400/403 状态，而不使用结构化 JSON 信封。两种传输方式都不会回退到主工作区。遗留的 `/workspace/voice`、`/workspace/voice/transcribe` 和 `/voice/stream` 仍然仅限主工作区。客户端对所有限定语音模式使用 `workspace_qualified_voice`，并让选定的运行时报告配置特定的错误。遗留的 `workspace_voice`、`workspace_voice_transcription` 和 `voice_transcribe` 标签仅描述绑定到主工作区的路由，且不得隐藏限定的次要配置。

`workspace_qualified_memory` 提供工作区限定的托管内存路由：`POST /workspaces/:workspace/memory/{remember,forget,dream}` 入队任务和 `GET /workspaces/:workspace/memory/{remember,forget,dream}/:taskId` 读回它们。仅当 ACP HTTP 和多工作区运行时均启用时才提供此功能。选择器遵循与其他复数路由相同的 ID 或编码绝对 cwd 规则。每个已注册的工作区都有自己的任务通道；主工作区的限定通道与单数 `/workspace/memory` 表面是同一实例，因此在一个通道上入队的任务可以在另一个通道上读取。解析严格针对选定的运行时，没有主工作区回退：未知选择器返回 `400 { code: "workspace_mismatch" }`，未受信任选择器返回 `403 { code: "untrusted_workspace" }`，非活动或正在排空的运行时返回 `503 { code: "workspace_runtime_unavailable" }`。读取操作永远不会分配通道，因此轮询没有任务的工作区将返回 `404 { code: "<kind>_task_not_found" }`。任务 ID 的范围限于其通道，并且在重新配置工作区或替换运行时后不会存活；过期的 ID 返回 `404`，而不是数据丢失条件。当禁用 ACP HTTP 时，不提供此标签，并且非主工作区限定请求返回不可重试的 `501 { code: "workspace_memory_unavailable" }`，而主工作区限定路由通过本地拥有的通道继续工作。

`session_lsp` 提供 `GET /session/:id/lsp`，即供守护进程客户端使用的只读结构化 LSP 状态快照。旧版守护进程返回 `404`；在公开远程 LSP 状态之前预检此标签。

`session_resources` 提供 `GET /session/:id/resources`，即根据选定实时会话的配置构建的经过净化的技能和 MCP 快照的只读对。该路由范围限于实时会话所有者：它永远不会回退到主运行时，也不会从工作区状态推断会话的资源。嵌套的 `skills` 和 `mcp` 对象重用相应的工作区状态载荷，但省略了 MCP 身份验证、池、工作区预算和工作区发现错误增强信息。选定会话的 MCP 管理器报告的状态、发现和会计信息仍然存在。旧版守护进程返回 `404`；在显示会话资源目录之前预检此标签。

`session_status` 提供 `GET /session/:id/status`，即按 ID 列出的单个会话的实时桥接摘要。除了 `clientCount` 和 `hasActivePrompt` 之外，实时会话还暴露 `isWaitingForPermission`、`isWaitingForUserQuestion`、`pendingInteractionCount` 以及在失败回合后保留的 `turnError`。当下一个提示实际开始时，错误会被清除。在当前桥接中已结算运行回合的实时会话也携带 `updatedAt`，即实时状态路由下记录的相同活动水印；因为此路由直接返回桥接摘要，所以该值不会与持久化转录修改时间合并，并且可能早于会话列表报告的值。单会话状态响应和工作区会话列表都包含 `turnError` 和 `pendingInteractions`：渲染就绪的权限操作或 `ask_user_question` 问题，加上现有权限投票路由所需的 `requestId` 和可选选项。每个用户问题都有一个 `answerKey`；使用 `answers` 进行投票，例如 `{ "0": "Polling" }`，以该值为键。仅持久化的会话省略运行时状态，因为不存在运行时。旧版守护进程返回 `404`；在轮询单个会话状态而不是扫描完整会话列表之前预检此标签。

`session_info` 提供 `GET /workspace/:id/session-info` 及其 `/workspaces/:workspace/session-info` 对应项。响应聚合持久化的活跃和归档会话计数，而不清水合列表元数据。这是一个显式的 O(n) 磁盘扫描，不得轮询；客户端应将 `truncated: true` 视为下限结果。

`session_approval_mode_control`、`workspace_tool_toggle`、`workspace_skill_settings_toggle`、`workspace_skill_settings_batch_toggle`、`extension_batch_activation_v2`、`workspace_init` 和 `workspace_mcp_restart` 通告了下文记录的变更控制路由。审批模式控制保留其非严格兼容性门控。其他控制项受操作员权限的严格门控：可信回环主请求、Bearer 认证请求或配对的本地控制请求可通过。未携带令牌且缺乏可信回环权限的主请求在到达严格门控时返回 401 `token_required`；缺失或无效的配置凭据以及未配对的本地控制凭据会被 Bearer 中间件更早拒绝，返回普通的 `401 Unauthorized`。缺少这些路由之一的守护进程返回 `404`。设置特定的 Skill 标签有所不同：来自已弃用标签代次的守护进程通告 `workspace_skill_toggle` 和 `workspace_skill_batch_toggle`，并在相同路径上提供其目录验证契约。已弃用的单目标路由可返回 HTTP `404 skill_not_found` 或 `409 skill_not_toggleable`；已弃用的批量路由返回 HTTP 200，并将目录派生的失败置于 `errors[]` 中。在暴露其功能前预检每个标签，不要通过探测路由可达性来推断设置特定的 Skill 契约。路由路径和请求体未发生变化。

`mcp_guardrails`（问题 [#4175](https://github.com/QwenLM/qwen-code/issues/4175) PR 14）涵盖 MCP 预算界面：`GET /workspace/mcp` 上的 `clientCount` / `clientBudget` / `budgetMode` / `budgets[]` 字段、每服务器单元格上的 `disabledReason` 字段，以及 `--mcp-client-budget` / `--mcp-budget-mode` CLI 标志。较旧的守护进程完全省略新字段；SDK 客户端在依赖 `budgets[]` 语义之前需预检此标签。注册表描述符还携带 `modes: ['warn', 'enforce']` 以用于未来的功能模式暴露——目前，客户端从快照的 `budgetMode` 字段推断模式。在 `enforce` 模式下，服务器拒绝由 `Object.entries(mcpServers)` 声明顺序确定性地决定；未来的作用域优先级层（如果 qwen-code 采用）将把此行为改为“最低优先级优先”，以镜像 claude-code 的 `plugin < user < project < local` 约定。

> **作用域由能力驱动。** 使用 `mcp_workspace_pool` 时，同一工作区运行时内的会话共享传输池和 `WorkspaceMcpBudget`，快照发出 `budgets[0].scope: 'workspace'`。不同的工作区运行时拥有独立的池。没有该标签时，每个 ACP 会话使用其遗留的 `McpClientManager`，快照发出 `scope: 'session'`，N 个会话可能各自消耗配置的容量上限。

`workspace_file_read` 涵盖文本/列表/统计/glob 工作区文件路由（`GET /file`, `GET /list`, `GET /glob`, `GET /stat`）。`workspace_file_bytes` 涵盖 `GET /file/bytes`，这是后来添加的，以便客户端可以针对 PR19 时代的守护进程预检原始字节窗口支持。`workspace_file_write` 涵盖哈希感知的文本变更路由（`POST /file/write`, `POST /file/edit`）。write 标签意味着路由契约存在；但这并不意味着当前部署允许匿名变更。Write/edit 是严格的变更路由，需要操作员权限；无令牌的受信任回环符合条件。`workspace_file_upload` 涵盖 `POST /file/upload`，即二进制入口路由：一个上限为 `MAX_UPLOAD_BYTES` (50 MiB) 的 `application/octet-stream` 主体被写入工作区且永不覆盖——占用的名称会自动编号（`name (1).ext`, `name (2).ext`, ...）。它也是一个严格的变更路由。

`workspace_file_delete` 仅涵盖 `POST /workspaces/:workspace/file/delete`；不存在遗留主 `/file/delete` 路由。JSON 主体为 `{ "path": "relative/file.txt" }`，成功返回 `{ "kind": "file_delete", "path": "relative/file.txt" }`。这个严格变更路由永久移除所选受信本地工作区中的一个常规文件。目录和符号链接被拒绝；不支持的工厂（包括 SSH）返回 422。该能力描述协议支持，而非在每个工作区删除的权限。客户端还必须预检 `workspace_qualified_rest_core`。

当通告 `workspace_qualified_rest_core` 时，相同的文件界面也可在 `/workspaces/:workspace/file`、`/workspaces/:workspace/file/bytes`、`/workspaces/:workspace/stat`、`/workspaces/:workspace/list`、`/workspaces/:workspace/glob`、`/workspaces/:workspace/file/write`、`/workspaces/:workspace/file/edit`、`/workspaces/:workspace/file/upload` 和 `/workspaces/:workspace/file/delete` 处获得（最后一个路由另外需要 `workspace_file_delete`）。

`workspace_directory_create` 和 `workspace_directory_delete` 独立通告 `POST /workspaces/:workspace/directory/create` 和 `POST /workspaces/:workspace/directory/delete`。预检操作标签以及 `workspace_qualified_rest_core`；较旧的合格守护进程可能缺少这些路由。两者都是由受信活动选定本地运行时拥有的严格变更，没有主回退或遗留主对应物。在现有父级下创建是排他的；删除是永久且递归的。

同一标签还在 `/workspaces/:workspace/agents` 和 `/workspaces/:workspace/agents/:agentType` 处暴露工作区限定的项目代理 CRUD。这些复数路由仅读取或变更所选工作区的项目级代理；`global` 和 `user` 作用域请求返回 `400 { code: "global_scope_not_supported_for_workspace_route" }`。无工作区的 `/workspace/agents` 路由保留其现有的主工作区行为，并且仍然是用户级代理作用域的唯一 REST 界面。

`extension_management_v2` 在 `/extensions/*` 处通告用户级扩展目录和变更界面，以及在 `/workspaces/:workspace/extensions/*` 处的工作区激活投影。工件是全局的；工作区路由仅暴露投影读取、精确激活覆盖和运行时刷新。读取可能针对不受信的注册工作区，而激活、刷新和工作区限定的安装需要受信目标。慢速变更使用守护进程本地操作 `/extensions/operations/:operationId`；存储生成而非操作历史在重启和跨守护进程中具有权威性。发布的 `workspace_extensions` 能力和 `/workspace/extensions/*` 路由保持为主工作区兼容性适配器。客户端必须预检 `extension_management_v2`，并且不得从守护进程模式或 `workspace_qualified_rest_core` 推断它。

`extension_git_credentials` 在 `POST /workspace/extensions/install` 和 `POST /extensions/install` 上均通告经过身份验证的 HTTPS Git 安装。客户端必须在发送 URL 用户信息或 `credentialPersistence` 之前预检此标签；较旧的守护进程拒绝 URL 凭据。该标签描述后端协议支持，而非密钥链的可用性：存储模式在终端操作结果中报告选定的后端。

`extension_local_path_install` 在 `POST /workspace/extensions/install` 和 `POST /extensions/install` 上均通告守护进程本地扩展源。`source` 必须是存在于守护进程主机上的绝对路径。相对路径仍然不受支持，因此守护进程工作目录不能更改源标识或遮蔽 GitHub `owner/repo` 简写。现有的安装操作将扩展复制到托管存储中；它不会链接源。客户端必须预检此标签，因为较旧的守护进程拒绝本地源。

`extension_batch_activation_v2` 添加 `PUT /extensions/activation` 和 `PUT /workspaces/:workspace/extensions/activation`。两者均接受在 `extensionNames` 中的 1–100 个名称，在不区分大小写的情况下对其进行去重，同时保留首次出现的顺序，在一次生成中持久化更改的目标，并返回一个 `202` 操作句柄。设置 `enabled` 或 `disabled` 时，目标无需已安装：其名称会创建一个期望状态声明，当安装具有该名称的 Extension 时，该声明会被保留。全局路由接受 `state: "enabled" | "disabled"` 并写入 V2 `defaultActivation`；工作区路由还接受 `"inherit"`，并为选定的受信任运行时应用或清除精确覆盖项。`inherit` 不会声明未知名称，且全部为未知名称的清除操作会报告 `updated: false`。

`extension_activation_explicit_refresh` 意味着单条和批量激活操作在持久策略提交后完成，而不会直接刷新活动会话。需要立即应用的调用方应等待激活成功，然后提交同步的主工作区 `POST /workspace/extensions/refresh`（直接返回刷新计数）或选定工作区的异步 `POST /workspaces/:workspace/extensions/refresh`（返回单独的操作句柄）。这两种形式不可互换：异步操作在其完整运行时协调完成时记录已应用的生成版本，而同步路由不记录任何内容，因此生成协调器仍会将该工作区视为待处理状态，并在下一次通过时再次刷新其会话。能够针对特定工作区的调用方应优先使用异步形式。刷新失败不会回滚或降级激活结果。不具备此功能的守护进程已在激活过程中包含运行时刷新，因此兼容性客户端不得提交第二次刷新。独立的 30 秒生成协调器保持启用状态，通常会在下一次通过时应用已提交的策略；失败的协调将由后续通过重试。

### Extension Management V2 线协议契约 [#extension-management-v2-wire-contract]

所有路由均使用上述守护进程 Bearer 认证规则。对于 V2 变更路由，`X-Qwen-Client-Id` 是可选的；如果提供，它必须标识注册到该变更的一个目标工作区运行时的客户端。`:extensionId` 是小写 64 位十六进制的扩展身份。`:workspace` 首先解析为精确的工作区 ID，否则在规范化后解析为 URL 编码的绝对当前工作目录 (cwd)。

| 方法和路径 | 成功响应 |
| ------------------------------------------------------------------ | --------------------------------------------------------------------------- |
| `GET /extensions` | `200` 全局工件目录 |
| `PUT /extensions/activation` | `202` 全局默认激活批量操作 |
| `PUT /extensions/:extensionId/activation` | `202` 全局默认激活操作 |
| `POST /extensions/install` | `202` 安装操作 |
| `POST /extensions/check-updates` | `202` 更新检查操作 |
| `POST /extensions/:extensionId/update` | `202` 更新操作 |
| `DELETE /extensions/:extensionId` | `202` 卸载操作，或在扩展不存在时幂等返回 `204` |
| `GET /extensions/operations/:operationId` | `200` 操作快照 |
| `GET /workspaces/:workspace/extensions` | `200` 工作区激活投影 |
| `GET /workspaces/:workspace/extensions/:extensionId/state` | `200` 工作区资源状态 (`extension_state`) |
| `PUT /workspaces/:workspace/extensions/:extensionId/state` | `202` 工作区资源状态操作 (`extension_state`) |
| `PUT /workspaces/:workspace/extensions/activation` | `202` 精确工作区激活批量操作 |
| `PUT /workspaces/:workspace/extensions/:extensionId/activation` | `202` 精确工作区激活操作 |
| `DELETE /workspaces/:workspace/extensions/:extensionId/activation` | `202` 清除覆盖操作 |
| `POST /workspaces/:workspace/extensions/refresh` | `202` 运行时刷新操作 |

#### 显式 Extension 刷新

能力标签：用于可选会话选择的 `workspace_session_refresh`。`POST /workspace/extensions/refresh`（主运行时）和 `POST /workspaces/:workspace/extensions/refresh`（选定运行时）均接受：

```json
{ "sessionIds": ["session-1", "session-2"] }
```

省略 `sessionIds` 可保留完整的运行时刷新。提供的数组按请求顺序去重，且 `[]` 不刷新任何会话或引导缓存。ID 必须是非空字符串。无效的请求格式返回 HTTP 400；未知 ID（包括属于其他工作区的会话）在工作开始前返回 HTTP 404。会话所有权仅在解析后的运行时内部检查，没有主运行时回退机制。现有的认证、严格变更、工作区信任和客户端身份门控仍然适用。

主路由仍返回带有 `{ refreshed, failed }` 的 HTTP 200；限定路由仍返回带有操作句柄的 HTTP 202。计数描述选定的会话。带有 `sessionIds` 的刷新不会推进工作区范围的已应用生成版本，即使选择覆盖了每个当前会话。自动完整协调保持不变，稍后可能会刷新其他会话。选择不会创建会话范围的激活策略：共享运行时缓存可以更改，且工作区事件仍保持工作区范围。

客户端必须在提供字段之前预检 `workspace_session_refresh`，包括空数组；较旧的守护进程可能会静默忽略它。不带该字段的现有调用不需要新的能力检查。

#### 工作区资源状态

独立预检 `extension_state`。它仅支持 Skills；不隐含 MCP 资源管理。两个路由均选择注册的工作区运行时，从不回退到主运行时。GET 遵循现有的只读信任规则；PUT 需要受信任的工作区。

```json
{
  "skills": [
    { "name": "review", "state": "enabled" },
    { "name": "deploy", "state": "disabled" }
  ]
}
```

PUT 接受 1–100 个条目，包括单元素批次。它在排队前拒绝格式错误的条目、不区分大小写的重复名称和不支持的组。所有名称必须属于已安装的目标 Extension，包括当前禁用的 Skills；无效目标会导致操作失败而不进行部分写入。一次锁定存储提交合并列出的覆盖项以应用于精确规范化的工作区。未列出的 Skills 和其他工作区被保留。没有设置写入、未来名称声明或父 Extension 的隐式激活。

GET 返回 `v: 1`, `workspaceId`, `workspaceCwd`, `extensionId`, `name` 和 `skills`。每个 Skill 都有 `name`, `defaultEnabled`, 可为 null 的 `workspaceEnabled`, `effectiveEnabled`, 以及可选的 `disabledReason`/`lockedScope`。清单中可选的 `skillStates` 提供默认值；缺失的值默认为启用。对于活动的父级，优先级顺序为：设置硬禁用、设置显式启用、设置默认禁用、工作区内部覆盖、清单默认值。内部禁用使用 `disabledReason: "default"` 且从不锁定设置。禁用或移除的父级无法通过 Skill 覆盖恢复。

`set_extension_state` 操作返回包含有序 `result.resourceStates.skills` 的 `status: "updated"`；`result.states` 保留其更新检查的含义。持久化状态并不能证明每个会话都已刷新。守护进程仅针对目标运行时（包括引导和实时会话）刷新 Skills 及其命令/模型上下文，而不会重启无关的 MCP/LSP/hooks。提交后的刷新失败会产生警告，但不会回滚状态。覆盖设置在重启和 Extension 更新后依然有效，并在卸载时被移除。客户端不得回退到 Skill settings API，因为该 API 会写入更高优先级的设置。

#### 全局目录

全局目录响应如下：

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

当没有安装元数据可用时，省略 `installType`。`defaultActivation` 为 `enabled` 或 `disabled`。`workspaceOverrideCount` 排除存储的 `inherit` 条目。

工作区投影响应如下：

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

对于继承，`workspaceActivation` 为 `enabled`、`disabled` 或 `null`。`activationSource` 为 `default`、`workspace_override`、`legacy_path_rule` 或 `cli_override`。`desiredGeneration` 是持久存储生成号；`appliedGeneration` 是控制器记录为已应用于该工作区运行时的最新生成号，可能会暂时滞后。

安装需要明确同意和初始激活：

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

对于仅限工作区的初始激活，使用 `{ "scope": "workspace", "workspaceId": "target-workspace-id" }`；目标必须存在且受信任。守护进程安装接受 GitHub、Git 和 npm 源。当宣传 `extension_local_path_install` 时，它们也接受在守护进程主机上存在的绝对路径。`ref` 不适用于 npm，`ref` 和 `autoUpdate` 不适用于本地源，`registry` 仅适用于 npm。`ref`、`autoUpdate`、`allowPreRelease` 和 `registry` 是可选的。

当宣传 `extension_git_credentials` 时，HTTPS Git 源可以包含 userinfo，例如 `https://username:token@git.example.com/org/repository.git`。`credentialPersistence` 仅在此类源下有效。它是 `stored` 或 `one_time`，省略时默认为 `one_time`。存储模式通过守护进程的混合密钥存储保存凭据，并在安装元数据中仅保留干净的仓库 URL，从而使 extension 保持可更新。一次性模式既不保存仓库 URL 也不保存凭据，并创建一个不可更新的 `snapshot`；此模式下拒绝 `autoUpdate: true`。在没有 URL 凭据的情况下提供该字段、提供无效凭据，或将凭据用于 npm、archive、local、SSH 或非 Git 源，将返回 `400`。

带凭据的安装响应和操作暴露 `credentialPersistence`，并可能将 `credentialStorage` 暴露为 `keychain` 或 `encrypted_file`。一次性操作省略 `source`；存储操作可能返回干净源。快照目录/状态条目省略 source，将 `credentialPersistence` 设置为 `one_time`，并报告 `not updatable`。更新以 `extension_not_updatable` 失败；不可用的存储密钥在网络访问前以 `extension_credential_unavailable` 失败。

全局和工作区激活 `PUT` 请求使用相同的主体：

```json
{ "state": "enabled" }
```

`state` 为 `enabled` 或 `disabled`。Update、uninstall、check-updates、clear-activation 和 refresh 请求没有必需的主体。

批量激活请求使用 Extension 名称：

```json
{
  "extensionNames": ["formatter", "review-tools"],
  "state": "disabled"
}
```

工作区批量操作也接受 `"state": "inherit"`。终端全局结果包含 `name` 和 `defaultActivation`；工作区结果包含 `name`、`workspaceActivation`（对于 inherit 为 `null`）和 `effectiveActivation`。格式错误的名称会拒绝请求；与现有 Store 标识冲突会导致原子性失败，而不进行部分提交。未知的 `inherit` 目标不会被持久化，因为清除覆盖设置不得制造默认激活声明或替换后续的安装同意。

每个接受的异步变更返回：

```http
HTTP/1.1 202 Accepted
Location: /extensions/operations/<operation-id>
Retry-After: 1
Content-Type: application/json

{"accepted":true,"operationId":"<operation-id>"}
```

限定于工作区的变更使用相同的全局 `/extensions/operations/:operationId` 轮询路径。操作历史是进程本地的，仅保留有限数量的终端条目，并在守护进程重启时丢失；当操作 id 消失时，客户端必须重新读取目录或工作区投影并比较生成号。

操作快照具有以下形状：

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

`status` 从 `queued` 过渡到 `running`，然后过渡到 `succeeded`、`succeeded_with_warnings` 或 `failed`。在运行时，`phase` 为 `preparing`、`committing` 或 `reconciling`。终端成功可能包含 `result`，其中 `status` 等于 `installed`、`enabled`、`disabled`、`updated`、`uninstalled`、`checked` 或 `refreshed`；协调结果还可以包含 `refreshed`、`failed` 和 `error`，而批量激活结果包含有序的 `results`。更新检查返回 `result.states`，以扩展名为键，值如 `checking for updates`、`update available`、`up to date`、`not updatable` 或 `error`。凭据和授权标头绝不会作为操作字段出现。

持久提交后若清理或运行时协调未完成，则不会报告为失败的变更。它返回 `succeeded_with_warnings` 并保留已提交的结果：

```json
{
  "v": 1,
  "operationId": "<operation-id>",
  "operation": "uninstall",
  "status": "succeeded_with_warnings",
  "createdAt": 1750000000000,
  "updatedAt": 1750000000200,
  "result": {
    "status": "uninstalled",
    "name": "demo",
    "refreshed": 2,
    "failed": 0
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

警告 `workspaceId` 和 `code` 是可选的；`workspaceCwd` 和 `error` 始终存在。客户端应显示警告，刷新其目录/投影，并且不得盲目重试持久变更。

验证和授权失败是使用 `{ "error": "...", "code": "..." }` 的同步 HTTP 错误（当存在稳定代码时）。重要情况包括 `400 invalid_extension_id`、`400 invalid_extension_names`、`400 invalid_extension_name`、`400 invalid_extension_activation`、`400 workspace_mismatch`、`403 untrusted_workspace`、`404 extension_operation_not_found` 和 `429 extension_queue_full`。安装验证还会因无效的 source/ref/registry 选项、缺少同意或缺少/无效的初始激活而返回 `400`。在 `202` 之后失败的变更在操作历史中保留表示，带有 `status: "failed"`、`error` 和一个可选的稳定 `code`；常见代码包括 `extension_prepare_timeout` 和 `extension_conflict`。操作的 HTTP `404` 并不意味着回滚，因为操作历史不是持久的。

`daemon_status` 通告 `GET /daemon/status`，即下文记录的合并只读操作员诊断快照。

`daemon_update` 通告进程全局的 `GET /daemon/update`, `POST /daemon/update/prepare` 和 `POST /daemon/update/restart` 表面。

`scheduled_task_gate` 在 `POST` 和 `PATCH /scheduled-tasks` 上通告可选的 `gate`，并在任务视图上通告 `gate` 和 `gateStatus`。Gate 是拥有会话在每次触发时运行的 shell 命令，独立于模型：退出码为 0 且有输出则附带该输出交付触发结果，退出码为 0 但 stdout 无内容则跳过，非零退出码仅在 gate 开始失败时报告，而不是每次触发都报告。`gateStatus.lastOutcome` 是 `quiet`, `delivered`, `failed` 或 `blocked`。

- Gate 需要一个重复任务：带有 `recurring: false` 的 `POST`，或者设置 gate 的一次性任务或将带 gate 的任务设为一次性任务的 `PATCH`，会返回 400 `gate_requires_recurring`；已处于该状态的任务保留其他编辑。格式错误的 gate（在 `POST` 上为空、仅有注释、超过 2048 个字符、包含 NUL 字符或未配对的 UTF-16 代理项、类似 `bash -c '…'` 的 shell 包装器，或使用 `&` 后台化的任何部分）返回 400 `invalid_gate`。`&` 检查是词法性的且尽力而为；在不确定的情况下会拒绝（注释中的 `&`、heredoc 主体或 `(( … ))`），如果 gate 通过了检查但在后台部分仍持有 stdout 时以 stdout 无内容退出，则报告为 `failed`（bwrap shell 沙箱之外，其 PID 命名空间会在命令结束时终止该部分）。在 `PATCH`, `gate: null` 或 `gate: ""` 上清除 gate 及其 `condition`。
- 由 `condition` 保护的遗留任务在 `PATCH` 中拒绝任何 `gate` 键并返回 409 `task_legacy_unsupported`，因此客户端仅在更改时才发送 `gate`。
- 通过这些路由写入的 gate 不会从会话获得确认。它仅在相同命令的 `monitor` 调用无需询问即可运行的地方无人值守运行：在保存的 `Monitor(...)` 或 `Bash(...)` 允许规则下、作为只读命令、或在 auto 或 yolo 会话中。Deny 规则在所有模式下都会阻止它，plan 模式也会阻止它；被阻止的触发最终状态为 `blocked`。
- 客户端不得向没有此标签的守护进程发送 `gate`：此类守护进程会在 `POST` 上丢弃它，并对仅含 gate 的 `PATCH` 返回 400 `empty_patch`。

`autofix_pr_watches` 通告 `GET /autofix-pr/watches`（主工作区）和 `GET /workspaces/:workspace/autofix-pr/watches`（已注册的受信任工作区）。每个工作区根据 `qwen autofix-pr status` 列出的顺序响应工作区克隆的 `/autofix-pr` watches，这些 watches 从克隆的主工作树下的 watch 文件中读取（`.qwen/tmp`），每个文件打开时不跟随链接且不阻塞。不获取锁，不询问 GitHub，除了找到克隆的 `git worktree list` 外不运行任何 git 命令。答案是 `{ v: 1, available, root?, now?, watches, unreadable? }`：当未找到工作区的 git 仓库（或 git 无法在那里运行）时，`available` 为 false 且无 watches，`root` 是克隆的主工作树，对于同一克隆的两个工作区而言相同。Watch 携带 `status`（`/autofix-pr` 设计的第 6.10 节）的字段，但不包括 `thisSession`, `worktreePath`, `pushTarget`, `gitTrusted` 和 `worktreeWork`；其 `session` 是拥有它的会话，可能不是此守护进程的会话。停止 watch 是该技能的职责（在拥有它的会话中执行 `/autofix-pr stop <n>`）；这些路由不改变任何内容。

**条件标签。** 这些功能标签仅在其部署开关、运行时接线或可用性条件处于活动状态时才被通告。标签存在意味着文档所述行为可用；不存在意味着要么是早于该标签的旧版 daemon，要么是当前 daemon 中该条件为假。目前：

<!-- conditional-serve-features:start -->

| 标签 | 在以下情况通告 … |
| ---------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `agent_collaboration_v1` | 至少有一个注册的工作区通过 `experimental.agentCollaboration`（任意范围，包含工作区）或 `QWEN_CODE_ENABLE_AGENT_COLLABORATION=1` 选择了加入持久化工作区 Agent 协作。存在意味着 `/workspaces/:workspace/agent/*` 和 Agent Host 传输路由已挂载；`workspaces[].agentCollaborationEnabled` 标识每个工作区的选择加入状态，客户端必须仅为启用条目显示或调用协作界面。较旧的 daemon 省略该工作区字段，因此客户端可能回退到此顶层标签以保持兼容性。不存在意味着协作不在此响应上提供服务——该标签按请求重新计算，而非在启动时快照——因此客户端必须移除入口点而不是渲染它并让调用返回 404。首次启用需要重启；在一个工作区已启用的情况下切换另一个工作区的设置将在下一个请求生效。与无条件 `workspace_agents` 标签不同，后者是子代理定义 CRUD。 |
| `session_message_deletion` | 私有 Hosted Harness 配置文件未激活。通过实时会话所有者路由列出和删除消息组；普通本地 daemon 会话支持物理删除，而 Managed 权威存储和 SSH 工作区拒绝删除。 |
| `hosted_harness_private_v1` | 私有 Hosted Harness 配置文件已激活；仅其经过身份验证的会话 API 可用。 |
| `managed_session_journal_delta_v1` | 私有 Hosted Harness 配置文件已激活（与 `hosted_harness_private_v1` 条件相同）且此构建可以打开包含 `message.delta` 记录的 Managed Session 日志。控制平面在能力协商时需要该标签，因此早于这些记录的已回滚 Harness 会被拒绝一次，而不是每次 Session 打开都失败（`managed_session_open_failed`）。 |
| `require_auth` | daemon 以 `--require-auth` 启动（或通过嵌入式 API 使用 `requireAuth: true`）。每个正常 API 路由都需要 Bearer token，包括 loopback 绑定上的 `/health`；channel webhook 入口保持其独立的共享密钥认证，Web Shell 文档和资源路由仍为预认证。 |
| `mcp_workspace_pool` | 共享 MCP 传输池处于活动状态。当 `QWEN_SERVE_NO_MCP_POOL=1` 禁用池时省略。 |
| `mcp_pool_restart` | 共享 MCP 传输池处于活动状态；重启响应可能包含池感知的多条目形状。 |
| `external_tool_guard` | `qwen serve` 完成了针对 `--external-tool-guard-mode=required` 的启动握手；每个生成的 ACP channel 必须在创建 Session 前确认已安装的回调，并且每个到达最终执行边界的受支持的顶级 managed ACP 工具调用必须收到一次外部预执行允许。较早的 permission/hook 拒绝不会发起 provider 请求。嵌套 AgentCore 执行不在 v1 范围内，并且在此外部 provider 模式活动期间会被拒绝。该标签仅反映外部 provider：独立于此，每个 daemon 都对携带 shell 命令行的 managed 工具应用内置 Git 重定位守卫（`run_shell_command` 和 `monitor`），因此缺少此标签并不意味着没有预执行拒绝。 |
| `allow_origin` | T2.4 ([#4514](https://github.com/QwenLM/qwen-code/issues/4514))。守护进程启动时至少配置了一个 `--allow-origin <pattern>`（或通过嵌入式 API 配置的 `allowOrigins: [...]`）。来自匹配来源的跨域请求会收到正确的 CORS 响应头；未匹配的来源仍返回默认的 403。配置的模式列表有意不在 `/capabilities` 中回显，以避免将受信任来源集合泄露给未经身份验证的读取者——浏览器客户端已经知道其自身的来源。 |
| `prompt_absolute_deadline` | `--prompt-deadline-ms` / `QWEN_SERVE_PROMPT_DEADLINE_MS` / `ServeOptions.promptDeadlineMs` 设置为正整数。 |
| `writer_idle_timeout` | `--writer-idle-timeout-ms` / `QWEN_SERVE_WRITER_IDLE_TIMEOUT_MS` / `ServeOptions.writerIdleTimeoutMs` 设置为正整数。 |
| `workspace_settings` | 创建守护进程时启用了设置持久化功能。 |
| `user_language_sync` | 创建守护进程时启用了设置持久化功能（与 `workspace_settings` 条件相同），因此注册了无会话的 `POST /language` 路由。 |
| `workspace_voice` | 设置持久化可用，因此旧版主工作区语音设置路由处于激活状态。 |
| `workspace_voice_transcription` | 主工作区已配置语音转录模型。 |
| `session_shell_command` | 在 Bearer 认证或可信回环权限下明确启用并生效了会话 Shell 执行；调用仍需绑定会话的客户端 ID。 |
| `standalone_sessions_v1` | 守护进程已安装完整的独立会话运行时、生命周期协调器、持久删除日志、托管目录实现以及 `/standalone/sessions` 路由族。缺少完整依赖图的直接嵌入将省略这些路由和此标签。 |
| `standalone_session_options_v1` | 安装了完整的独立会话运行时（与 `standalone_sessions_v1` 条件相同），因此在内部对话运行时上注册了只读、无会话的 `GET /standalone/session-options` 路由。 |
| `session_artifacts_persistence` | 为运行时接入了会话工件持久化。 |
| `session_artifact_library` | 已接入会话工件持久化；支持通过 `/workspaces/:workspace/session/:id/artifact-library` 进行可信工作区所有者对活跃、冷存储及归档注册的读取/移除操作。 |
| `workspace_artifact_library` | 通过 `/workspaces/:workspace/artifact-library` 支持持久化的工作区级工件查询、批量会话查询及显式配对移除。 |
| `workspace_artifact_library_stream` | 在所有工件库读取操作中提供会话元数据，并为全量及选定会话查询提供可选的有限 SSE；需要工件持久化。 |
| `session_sources` | 为运行时接入了会话源持久化。通过活跃会话所有者注册仅含元数据的工作区文件、上传附件和 HTTP(S) 链接。 |
| `session_generation` | 会话生成辅助工具可用。 |
| `session_btw_stream` | 每个注册的运行时桥接都支持可恢复的 BTW 流式传输。客户端在调用 `/session/:id/btw/stream` 之前必须检查此标志；否则请使用现有的 JSON BTW 接口。 |
| `scheduled_task_session_reuse` | 持久化计划任务会话管理已激活，且每个托管守护进程运行时都已安装回调，允许任务显式绑定到其当前存在的会话。 |
| `workspace_generation` | 工作区级生成辅助工具可用。 |
| `rate_limit` | `--rate-limit` / `QWEN_SERVE_RATE_LIMIT=1` / `ServeOptions.rateLimit` 已启用。 |
| `workspace_reload` | 嵌入式路由配置中提供了工作区重载支持。 |
| `workspace_trust_grant` | 已接入信任热重载（与 `workspace_trust_hot_reload` 条件相同）。两个授权路由仅授予绑定文件夹的信任，保留现有的 `TRUST_FOLDER` 或 `TRUST_PARENT` 规则。持久化后，仅当主机策略和报告状态均受信任时，`200` 才返回 v1 状态；否则 `409 { error, code: "trust_grant_ineffective" }` 会在 `error` 中指明检查的状态/来源，包括策略加载或 IDE/文件拒绝。信任文件持久化失败时，对于 `FatalConfigError` 返回 `500 trusted_folders_invalid`，否则返回 `500 internal_error`。信任文件读取接受 JSONC 写入器的注释和尾随逗号。即使没有热重载也会提供服务：守护进程自身的 API 授权会立即更新缓存的 v1 状态，但启动绑定的门控需要重启（`requiresDaemonRestartForChanges: true`）。外部终端/文件编辑需要重启守护进程以更新该缓存状态。 |
| `workspace_trust_hot_reload` | 已接入工作区信任策略监控和运行时生成协调，因此信任更改无需重启守护进程即可生效，且 v2 信任状态报告会收敛。 |
| `channel_reload` | 启用了守护进程管理的通道工作者管理器，并可重新加载其当前选择。 |
| `channel_control` | 已接入守护进程管理的通道工作者运行时控制。 |
| `channel_management` | 已接入工作区范围的通道设置、生命周期和配对管理。 |
| `channel_delete_config_loss_convergence` | 已接入工作区通道管理（与 `channel_management` 条件相同）。`DELETE /workspaces/:workspace/channels/:name` 会收敛一个配置已从 Worker 解析的合并设置视图（系统 + 用户 + 工作区范围）中消失的通道：运行时必须对该通道保持静默，或确认在该工作区中恰好有一个已提交的 Worker 所有者，在移除该范围内持有的持久化启动选择之前先停止它，而不是报告 `channel_instance_not_found`。如果合并视图仍包含某通道的配置，但该工作区的解析通道设置范围并不拥有它——例如仅在用户或系统范围配置而工作区是项目目录——则报告 `channel_instance_not_found` 且不触及运行时；如果解析范围确实配置了某个通道，则正常删除；如果工作区的目录是用户的主目录，则该范围解析为共享的用户文件，因此用户范围的通道在此处被配置——并被删除。 |
| `multi_workspace_sessions` | 注册了多个工作区运行时，因此会话创建可以通过 cwd 选择受信任的运行时。 |
| `multi_workspace_session_rewind` | 注册了多个工作区运行时；单数形式的活跃会话回溯路由会解析所属运行时。 |
| `multi_workspace_session_shell` | 注册了多个工作区运行时，且在 Bearer 认证或可信回环权限下明确启用了会话 Shell 执行；单数 REST Shell 会解析所属运行时。 |
| `dynamic_workspace_registration` | 已将工作区运行时工厂接入守护进程，因此可以在运行时将现有受信任目录注册为次要运行时。 |
| `persistent_workspace_registration` | 已将工作区注册存储接入守护进程。生产环境的 `runQwenServe` 会自动提供用户级存储；直接的 `createServeApp` 嵌入必须显式注入一个，并负责其工作区注册表的启动恢复。 |
| `scratch_workspace_registration` | 托管临时工作区创建功能可用——运行时工厂、经过验证的托管临时根目录以及运行时处置均已接入，且每个托管运行时都遵守临时根目录边界。 |
| `git_workspace_clone` | 守护进程主机具有 `git` 二进制文件；使用 `{ kind: "git", url, target }` 执行 `POST /workspaces` 会启动一个异步克隆任务，其路由报告进度、取消状态和标准 cwd。没有 `git` 的主机会省略该标签。 |
| `workspace_runtime_removal` | 可移除的动态或持久化恢复的辅助运行时可以通过管理路由进行排空和移除。 |
| `workspace_directories` | 守护进程持久化工作区设置，并且每个受信任的本地运行时都可以将其额外目录应用到其活动会话：`/workspaces/:workspace/directories` 列出、添加和移除在工作区范围内持久化的条目（`context.includeDirectories`）。即使存在该标签，SSH、托管和独立工作区也会被拒绝，而实验性的配对引擎守护进程会省略该标签和路由，因为工作区范围的变更无法到达托管子进程。 |
| `native_directory_picker` | 守护进程主机可以打开原生操作系统目录选择器（macOS 上的 `osascript`，Windows 上的 PowerShell，带有显示器的 Linux 主机上的 `zenity`）。无头主机会省略该标签，以便客户端隐藏守护进程原生的选择器，而不是呈现一个保证失败的操作。当没有可用的选择器时，Web Shell 会隐藏“浏览”按钮；[嵌入主机目录选择器](../design/web-shell-host-directory-picker.md#public-api-and-precedence)可以在没有此标签的情况下提供该功能。 |
| `workspace_runtime_stop` | 守护进程拥有 ACP 进程统计、完整的独立活动和计划任务观察数据，以及支持确认停止和接收快照的运行时桥接。不支持的单个运行时在预览中被禁用。 |
| `workspace_runtime` | 每个活动的工作区桥接都提供权威的运行时生命周期快照；混合或遗留注入的桥接会省略该标签。 |
| `workspace_skills_config_runtime` | 每个活动工作区都支持权威的运行时生命周期以及用于技能管理和新会话编辑器的拆分配置/运行时技能路由。 |
| `skill_archive_install` | 权威的工作区生命周期、原始技能压缩包安装以及所有者范围的尝试接收记录均可用。 |
| `skill_zip_file_source` | 权威的工作区生命周期、守护进程本地的 ZIP 复制以及所有者范围的尝试接收记录均可用。 |
| `workspace_local_open` | 守护进程主机可以在主机的 OS 文件管理器中打开工作区目录（macOS 上的 `open`，Windows 上的 `explorer.exe`，带有显示器的 Linux 主机上的 `xdg-open`）。无头主机会省略该标签，以便客户端隐藏“本地打开”选项，而不是呈现一个保证失败的启动操作。打开的路径始终是解析后的已注册工作区 cwd，通过 `POST /workspaces/:workspace/open`；该路由接受可选的 JSON 正文 `{ "target": "terminal" }`（缺失/其他 = 文件夹），并回答 `{ kind: 'workspace-local-open', opened: true, target }`，其中 `target` 设置为 `folder` 或 `terminal`。 |
| `workspace_local_terminal` | 守护进程主机可以在工作区目录中打开终端窗口（macOS 上的 `open -a Terminal`，Windows 上带有 `cmd.exe` 回退的 `wt.exe`，带有显示器的 Linux 主机上的 `gnome-terminal`/`konsole`/`xterm`）。无头主机会省略该标签，以便客户端隐藏“在终端中打开”选项，而不是呈现一个保证失败的启动操作。由 `POST /workspaces/:workspace/open` 提供服务，正文为 `{ "target": "terminal" }`。 |
| `workspace_qualified_acp` | ACP HTTP 和多工作区运行时处于活动状态，因此复数形式的 ACP 端点可以选择辅助运行时。 |
| `workspace_qualified_voice` | 多工作区运行时和共享的 ACP/Voice WebSocket 监听器处于活动状态，因此每个工作区限定的 Voice 模态对于辅助运行时都是可达的。 |
| `workspace_qualified_memory` | ACP HTTP 和多工作区运行时处于活动状态，因此工作区限定的托管内存路由可以为记住、遗忘和做梦操作选择每个工作区的任务通道。 |
| `client_mcp_over_ws` | 守护进程通过 ACP WebSocket 接受客户端托管的 MCP 服务器。这是一个显式的选择加入，CDP 隧道路径不需要它。 |
| `cdp_tunnel_over_ws` | 守护进程暴露反向 `/cdp` WebSocket 隧道，要么通过显式选择加入，要么因为允许 Chrome 扩展来源。这仅意味着隧道存在；并不意味着 Chrome DevTools MCP 工具已注册。 |
| `browser_automation_mcp` | ACP HTTP 已启用，`cdp_tunnel_over_ws` 处于活动状态，没有 bearer token 阻止 `/cdp`，且 `QWEN_CDP_MCP_COMMAND` 指定了一个外部 stdio MCP 适配器。主 CLI 包不捆绑浏览器自动化适配器；如果没有此标签，Chrome 扩展侧边栏聊天可能仍然有效，但控制台/网络/截图/点击工具默认不会注册。 |
| `voice_transcribe` | Voice WebSocket 端点已挂载；成功的转录仍需要配置的 Voice 模型。 |
| `realtime_voice` | macOS WebShell 守护进程已启用实时语音，且原生主机已通过 `QWEN_SERVE_LIVE_NATIVE_HOST=1` 选择加入（默认关闭；见下文）。`/live/status` 报告就绪状态，但在功能启用之前，该能力被撤回。 |
| `realtime_voice_web` | 实时语音已启用，Web Shell 页面本身可以是任何平台上的音频端点，通过 WS `/live/web`，且是默认端点（原生主机仅限 macOS 且需选择加入）。该路由像 `/voice/stream` 一样进行身份验证（bearer 子协议），需要一个受信任的主工作区，并使用简化的 hello 消息与 Live Host 协议通信：麦克风权限加上音频输入/输出自检。保持单一主机租约：原生主机取代浏览器（`4010`），浏览器永远不会取代原生主机（`4009`），第二个标签页仅在 `?takeover=1` 时接管。`/live/status` 报告 `host.kind: "browser"`；屏幕捕获需要共享屏幕（见下文），快捷键更改是为下一个原生主机存储的，而不是注册的。 |
| `web_terminal` | ACP HTTP 已启用，因此经过身份验证的 Web Terminal 端点可用。 |
| `user_skill_activation` | 用户设置持久化可用。`PUT /skills/activation` 保存精确名称的用户偏好并排队异步传播。 |

<!-- conditional-serve-features:end -->

Live Voice 在所有平台上默认使用 Web Shell 端点（`realtime_voice_web`, WS `/live/web`）。原生 macOS 主机是选择加入的：只有以 `QWEN_SERVE_LIVE_NATIVE_HOST=1` 启动的 macOS 守护进程才会通告 `realtime_voice`，在启用 Live 时注册 WS `/live/host` 并安装主机。如果没有它，`/live/setup` 报告 `nativeHost: false` 并带有不可重试的 `install` 错误，且 `POST /live/setup/install` 和 `POST /live/setup/launch` 回答 `409 live_native_host_unavailable`。

浏览器 Host 仅在用户与页面共享屏幕时响应 `host.capture_visual`，页面在其 hello 消息中通过 `selfChecks.screenShare` 报告这一点。共享是一个单独的显式行为——模型在回合中间请求，而 `getDisplayMedia` 需要用户手势——因此页面保持流连接并按请求抓取一帧。如果没有共享内容，它会立即响应 `success: false`，而不是让请求超时。

因为页面无法写入守护进程的文件系统，所以它只发送 JPEG。守护进程忽略浏览器租约报告的任何 `screenshotPath`，并将图像本身存储在其选择的名称下，位于原生 Host 写入的同一私有捕获目录中。原生 Host 仍然持久化其自己的 PNG 并传递路径，如前所述。

`mcp_guardrails` **不**在此条件表中——它是一个始终开启的标签，只要二进制文件支持新的 `/workspace/mcp` 预算字段就会广告，无论操作员是否配置了预算。尚未设置 `--mcp-client-budget` 的操作员仍会获得新字段（带有 `budgetMode: 'off'`, `budgets: []`）。

`mcp_guardrail_events` (issue [#4175](https://github.com/QwenLM/qwen-code/issues/4175) PR 14b) 广告类型化的 SSE 推送事件，这些事件无需轮询循环即可呈现 MCP 预算状态跨越。两种帧类型到达 `GET /session/:id/events`：

- `mcp_budget_warning` — 在 `reservedSlots.size / clientBudget` 向上跨越 75% 时触发一次。仅在比率降至 37.5% 以下后重新武装 (`MCP_BUDGET_REARM_FRACTION`)。镜像 PR 10 的 `slow_client_warning` 滞回，但在管理器级别而非每个订阅者积压级别。载荷：`{ liveCount, reservedCount, budget, thresholdRatio: 0.75, mode: 'warn' | 'enforce' }`。在 `warn` 和 `enforce` 模式下均触发；在 `off` 下从不触发。
- `mcp_child_refused_batch` — 在每个 `discoverAllMcpTools*` 通过结束时触发，当有一个或多个服务器被拒绝时，并且在 `readResource` 惰性生成拒绝路径上作为长度为 1 的批次触发。载荷：`{ refusedServers: [{ name, transport, reason: 'budget_exhausted' }, ...], budget, liveCount, reservedCount, mode: 'enforce' }`。`mode` 是字面量 `'enforce'`，因为 `warn` 模式从不拒绝。

这两个事件都存在于每个会话的 SSE 重放环中（它们携带一个 `id`），因此使用 `Last-Event-ID` 重连的客户端可以通过它们恢复；`GET /workspace/mcp` 处的快照仍然是扩展断开连接后状态的真相来源。一旦广告即始终开启——没有条件切换。SDK 缩减器状态 (`DaemonSessionViewState`) 暴露 `mcpBudgetWarningCount`, `lastMcpBudgetWarning`, `mcpChildRefusedBatchCount`, `lastMcpChildRefusedBatch` 供想要简单滞后式 UI 的适配器使用。

## 路由

客户端可以功能检测 `session_turn_status` 并轮询 `GET /session/:id/turns/current` 或 `GET /session/:id/turns/:promptId`。这些路由需要活动的拥有 Session，并且从不加载或扫描另一个工作区。已结算的结果是从活动分支读取的最佳努力转录记录，具有有界扫描；`prompt_not_found` 意味着在活动队列、64 条目终端覆盖层或有界活动窗口中未找到结果。`resultText` 是最后一个工具边界后的原始最终父模型答案，在可选消息重写之前，可能缺失。超过 32,768 个 UTF-16 代码单元的结果包括 `resultTruncated: true` 和 `resultCode: "RESULT_TEXT_TRUNCATED"`。

### `GET /health`

活性探测。默认形式如果监听器启动则返回 `200 {"status":"ok"}` —— 便宜，无桥接访问，适合高频 k8s/Compose 活性探测。

传递 `?deep=1` (也接受 `?deep=true` 或裸 `?deep`) 以进行守护进程范围的探测，该探测聚合每个管理工作区运行时的桥接 **计数器**，包括仍在排空的工作区（仅供参考，不是真正的活性检查）：

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

`sessions`, `pendingPermissions` 和 `activePrompts` 是总和。`activeWork` 为真，当任何运行时有一个已接受但未结算的提示（包括 FIFO 等待中的提示）、正在运行的后台 Agent、排队/进行中的 Agent 终端通知、Session 管理的后台 shell 或工作流工作，或子拥有的 Session 回合。聚合 `session` 持有涵盖目标和 cron 处理、历史变更以及排队或运行的 Monitor 延续；前台提示仍由守护进程拥有。运行的 Monitors、后续建议和 shell 注册表不再能跟踪的外部进程保留在字段之外。它是会话范围的：尚未附加会话的通道级工作——飞行中的生成、待处理的恢复、MCP 发现或认证——不计入，因此 `activeWork` 可能在守护进程仍拒绝回收该通道时读取为 false。不要将此字段读作“守护进程是可回收的”；它仅描述会话拥有的工作。`activeWorkReporting` 说明该布尔值实际有多少得到担保：`full` 当每个活动会话都被来自报告所有必需类别的子项的新鲜报告覆盖时，`none` 当没有会话协商报告时，以及 `partial` 对于介于两者之间的任何东西——包括过时的快照或省略必需类别的协商子项。比三个报告间隔更旧的快照停止计为覆盖：它不是会话空闲的报告，因此会话回到读取为保留，就像子项从未报告一样。对于协商但不完整的子项，普通自动清理也被禁用；不理解 `shell` 或 `session` 的子项不能根据完整的当前谓词安全地授权条件关闭。完全不支持的历史子项保留遗留清理行为，显式关闭、杀死、关闭和通道退出仍然是强制操作。`activeWorkStaleMs` 是布尔值所依赖的最旧快照的年龄 **在覆盖的会话中**，当没有会话被覆盖时为 `0`；它是诊断性的，因为新鲜度已由守护进程分级到 `activeWorkReporting`（只有守护进程知道每个通道的协商节奏）。等级是在每个管理运行时上计算一次，而不是每个运行时然后组合——没有会话的运行时是空洞地完整，将其视为证据会让空工作区为另一个工作区的未报告会话担保。`lastActivityAt` 是最新的非空工作区活动时间，`idleSinceMs` 源自同一快照。`channelAlive` 意味着至少一个管理工作区通道是活动的；它并不意味着每个工作区都是健康的。`connectedClients` 和可选的 `rateLimitHits` 仍然是守护进程范围的计数器，而不是每个工作区的总和。

重启控制器应在以下情况下将守护进程视为繁忙：

```ts
const busy =
  health.activePrompts > 0 ||
  health.activeWork ||
  health.activeWorkReporting !== 'full';
```

丢弃第三项使 `activeWork === false` 与“没有子项告诉我任何信息”无法区分，这是对其采取行动不安全的一种情况。未知响应和失败的探测也必须阻止重启。`activePrompts` 仍然是一个独立的兼容性信号。

这些字段是观察缓存，而不是重启租约：即使是一个新鲜的、完全分级的、空的答案也描述了采样时刻，工作可以在之后立即开始。上述规则大大降低了错误重启的风险，但并未消除它——严格的安全需要一个准备重启栅栏，停止新工作准入，确认排空，然后才关闭。

> ⚠️ 深度探测是**信息性**的，并非真正的存活验证或原子回收租约。协商后的 ACP 子进程按协商的节奏发布通道范围的活动工作快照，守护进程将其新鲜度分级为 `activeWorkReporting` —— 但它绝不会因缺少报告而杀死通道，因为一个会话的沉默并不能证明进程已死亡。传输层存活检测和停滞 Agent 检测是独立的机制。`connectedClients` 统计 REST SSE 连接数，而非每个 ACP 传输层。对于空闲回收，请使用重复采样和优雅关闭；对于传输层和每工作区诊断，请使用经过身份验证的 `/daemon/status`。如果任何托管运行时 getter 抛出异常，深度健康检查将以 `503 {"status":"degraded","reason":"aggregation_failed"}` 失败关闭，而不是返回部分总计，并且守护进程日志会标识出失败的工作区运行时。在引导期间，在运行时注册表就绪之前，它返回带有 `Retry-After: 1` 的 `503 {"status":"degraded","reason":"bootstrap"}`。对于监听器存活检测，请使用默认的 `/health` 而不带 `?deep`。

**认证：** 在非回环绑定以及回环通过 `--require-auth` 加固时必需。在普通回环绑定（`127.0.0.0/8`、`localhost`、`::1`、`[::1]`）上，`/health` 在 Bearer 中间件之前注册，因此 Pod 内的 k8s/Compose 探针无需携带令牌。在非回环（如 `--hostname 0.0.0.0`）或加固的回环上，该路由在 Bearer 中间件之后注册，并在没有有效令牌时返回 401 —— 否则未经身份验证的调用者可以探测任意地址以确认 `qwen serve` 的存在，这是一种低严重性的信息泄露，与端口扫描结合使用时危害更大。即使在普通回环豁免下，CORS 拒绝 + Host 允许列表仍然适用。

### `GET /daemon/update`, `POST /daemon/update/prepare`, and `POST /daemon/update/restart`

这些经过身份验证的路由管理守护进程的 Qwen Code 安装，独立于所选工作区。它们始终使用 REST，包括来自具有 ACP 会话传输的 SDK 客户端的请求。`daemon_update` 能力通告了该协议；可用性由返回的状态确定。

GET 检查发布版本而不下载或激活它们。成功的检查缓存 15 分钟，错误缓存一分钟；`?refresh=true` 请求一次新的检查。并发检查共享一次查找。响应包含 `state`（`available`、`up-to-date`、`installing`、`ready`、`restarting`、`unavailable` 或 `error`）、`canInstall`、可选的 `currentVersion` 和 `latestVersion`，以及可选的 `instructions` 和 `message`。`currentVersion` 标识正在运行的守护进程，包括在更新准备就绪后。不支持的安装方法可以报告 `available`，并附带 `canInstall: false` 和手动说明。

自动更新需要真实的 CLI 生命周期，具备 POSIX `process.execve`、独立安装或运行已发布启动器的全局 npm/pnpm/yarn/bun 安装（包含 root 所有权的 npm 前缀，因为暂存从不写入全局前缀），以及允许 `general.enableAutoUpdate` 的操作员设置。嵌入式服务器、Windows、不支持的 Node 运行时和开发模式报告 `unavailable`。仅应用全局/系统设置；工作区设置无法启用安装。连接必须使用主监听器及其守护进程运行时令牌，或使用显式信任的回环部署且无需令牌。配对的浏览器和本地控制连接报告 `unavailable`，因为它们的凭据或监听器在重启后不会存活；它们的更新变更返回 `403 update_connection_unsupported`。

两个 POST 路由都需要严格变更门控的守护进程操作员权限，并且不接受任何参数。服务器选择发布版本、目标和启动器；客户端不能提供版本或命令。

- `POST /daemon/update/prepare` 启动后台下载并返回带有 `state: "installing"` 的 `202`。它不会更改当前活动安装。轮询 GET 直到状态为 `ready`；重复的准备操作共享同一操作，已准备好的更新返回 `200`。如果没有可用的自动更新，则返回 `409 update_unavailable`。
- `POST /daemon/update/restart` 需要一个已准备好的更新，否则返回 `409 update_not_ready`。它在激活更新之前响应 `202` 和 `state: "restarting"`，优雅地关闭守护进程，并用更新后的启动器替换进程。重复点击共享一次重启。响应后，守护进程重新解析当前发布版本一次：如果它比已准备好的版本更新且一键更新涵盖它，则暂存较新的版本并丢弃已准备好的载荷，因此长期运行的守护进程会落在当前的最新版本上，而不是首次准备时的最新版本上。较新的载荷在提交到被取代的版本之前会被保留，且该丢弃是尽力而为的：失败的丢弃会泄漏磁盘空间，但绝不会孤立较新的载荷或回退到可能半删除的载荷。`latestVersion` 随后报告较新的目标，而 `state` 保持为 `restarting`。失败的重新解析或暂存会改为应用已准备好的版本；由于注册表故障，点击永远不会卡在运行版本上。替换过程保留 PID、工作目录、CLI 选项、绑定端口和有效的守护进程令牌，清除旧版本固定，并且不重新打开浏览器。客户端轮询 GET 直到 `currentVersion` 发生变化，然后重新加载在请求更新时捕获的 URL 处的文档。因为暂存在 `202` 之后运行且可能需要几分钟，所以客户端从持续不可达开始测量其重启截止时间，而不是从点击开始：一个仍在响应的守护进程仍在工作。一个宽松的绝对上限（20 分钟）作为后备，防止守护进程保持可达但从未离开 `restarting`。它位于整个暂存链之上，而不是单个超时常量之上：独立存档下载依次尝试 OSS 和 GitHub，每个预算为五分钟 _each_，校验和与签名获取额外增加最多两分钟，因此一次重新暂存在激活之前可能花费约十二分钟进行下载和验证；托管的 npm 子进程上限为十分钟。每条放弃路径都在屏幕上保留一个可重试的条目，因为卡住的守护进程继续报告 `restarting`，而控件通常不显示此状态。一旦重启得到确认，`restarting` 就会粘滞直到进程被替换，因此一个可达的守护进程报告任何其他状态且 `currentVersion` 未变，意味着替换未落到新构建上；客户端停止等待，发布该稳定状态，并报告失败，而不是永远等待版本变化。该检查仅适用于在确认后 _发起_ 的轮询：状态和重启请求是独立的，因此较早开始的轮询可以在之后传递重启前的快照，将其读取为稳定的守护进程会报告虚假失败并抑制成功更新仍欠用户的重新加载。独立启动器验证在关闭服务之前运行；失败的检查会让守护进程保持运行。在关闭开始后或进程替换期间发生的失败不保证能恢复。

Web Shell 会在后台自动检查并准备可用的受支持更新，并在准备好的更新就绪或可用更新包含手动说明时显示其版本旁边的更新按钮。在手动说明状态下，该按钮会打开一个包含检查所得说明的弹出框，且绝不会进行准备或重启。准备工作及就绪状态可在工作区运行时重载后保留。已准备的更新会固定其目标：轮询 GET（包括 `?refresh=true`）会继续报告已准备的 `latestVersion` 且不会重新下载，因此跨多个版本保持运行的守护进程不会在后台频繁下载。只有重启操作会重新解析目标。普通的守护进程关闭会丢弃已下载的更新。激活失败会使守护进程继续运行并报告 `error`；在一分钟错误缓存过期后的下一次检查可以准备新的下载以供重试。禁用自动更新会在重启开始前移除就绪状态并清理下载内容。一旦重启正在进行中，它就不会受到干扰：当状态为 `restarting` 时，状态、准备和重启路由均直接返回而不查询操作员设置，且关闭清理操作为空操作，因此耗时数分钟的重新暂存过程不会导致其载荷被移除。在就绪状态下点击该按钮会显式重启整个守护进程并中断其活动会话。

### `GET /daemon/status`

只读操作员诊断信息。与 `/health` 不同，这是一个正常的守护进程 API：它在 Bearer 身份验证和速率限制之后注册，包括在回环绑定上。查询参数：

- `detail=summary`（默认）仅读取内存中的守护进程状态。
- `detail=full` 还包含实时会话诊断信息、ACP 连接诊断信息、认证设备流计数以及工作区状态部分。
- 任何其他 `detail` 返回 `400 { "code": "invalid_detail" }`。

`summary` 有意不查询工作区状态方法、不启动 ACP 子进程也不生成会话。`full` 独立查询每个工作区部分；超时或异常仅将该部分标记为 `unavailable` 并添加一个 `workspace_status_unavailable` 问题。

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
    "maxRegisteredWorkspaces": 256,
    "maxChannelControlWorkspaces": 25,
    "maxSessions": 32,
    "maxTotalSessions": 800,
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

多工作区响应还包括带有 `{ id, cwd, displayName?, primary, trusted }` 的顶层 `workspaces[]` 行。如果未设置，则省略可选的显示名称，并且它仅用于展示目的；状态消费者必须继续使用 `id` 或 `cwd` 来关联运行时。

`runtime.perf` 是可选的。存在时，它仅报告守护进程事件循环延迟、提示 FIFO 队列等待样本以及守护进程子管道字节计数器；ACP 子事件循环延迟不包含在 `/daemon/status` 中。

如果任何问题具有错误严重性，则 `status` 为 `error`；如果任何问题具有警告严重性，则为 `warning`；否则为 `ok`。问题代码是稳定的，包括 `session_capacity_high`、`connection_capacity_high`、`pending_permissions`、`acp_channel_down`、`preflight_error`、`mcp_budget_warning`、`mcp_budget_exhausted`、`rate_limit_hits`、`channel_worker_exited`、`channel_worker_partial_connect`、`channel_restore_failed` 和 `workspace_status_unavailable`。在监听器就绪但完整运行时挂载之前的短暂窗口期内，`/daemon/status` 可能报告 `daemon_runtime_starting`；如果异步运行时挂载失败，它会报告 `daemon_runtime_failed`，而非状态运行时路由返回 `503`。

`runtime.activity` 报告守护进程范围内的提示活动。`activePrompts` 统计包含进行中提示的会话数量。`pendingPrompts` 统计所有已接受但尚未完成的提示，包括正在运行的提示和 FIFO 等待中的提示。`queuedPrompts` 统计已接受但尚未分发的 FIFO 等待中的提示。`lastActivityAt` 是最后一次提示开始/结束或会话生成的 ISO 8601 时间戳；如果守护进程自启动以来从未处理过任何活动，则为 `null`。`idleSinceMs` 在生成响应时根据 `lastActivityAt` 计算得出。

`limits.memory` 是累加的，并报告守护进程解析后的内存数据：一个必需的 `enforced: false`、一个 `childHeap` 对象（`mode`：`off`、`observe` 或 `admit`；`admissionEnforced`，仅对受管的 `admit` 为 true；`maxConcurrentChildren` 和 `perChildCeilingMb`，两者在 `mode: 'off'` 下均为 `null`，该模型不模拟任何内容——并且 `perChildCeilingMb` 另外在 `modeled.minChildHeapMb` 内无法建模任何分区时 `null`——要么池在该层级无法覆盖任何一个子项，要么一旦上限被限制为 `modeled.legacyChildCeilingMb`（即 `floor(available / 2)`），上限就会落在下限之下，因此在低于 1024 MB 的主机上会低于下限。它永远不会为 0，并且在这些情况下 `maxConcurrentChildren` 为 `0`，因为不模拟任何分区的主机是一个计算得出的答案，而不是缺失的模型；以及 `refusals`，即那些会超出模拟限制的衍生进程）、`configuredBudgetMb`、`effectiveBudgetMb`（配置的值，以解析后的 cgroup/主机内存为上限）、`budgetSource`（`flag` / `derived`）、`availableMemoryMb`、`availableMemorySource`（`constrained` / `host`）、`insufficientMemory`，以及一个包含 `rootReserveMb`、`childPoolMb`、`minChildHeapMb`、`maxChildHeapMb` 和 `legacyChildCeilingMb`（ACP 子项当前接收的上限的保守模型，可能低于实际值）的 `modeled` 对象。`runtime.memory` 另外还报告 `registeredWorkspaces`（注册计数——未移除的工作区条目，包括正在排空、转换或阻塞的条目；并非活跃子项计数）、`activeAcpChildren`（具有活跃且非死亡通道的由守护进程管理的 ACP 子项——包括正在转换或阻塞的条目，但排除已启动终止即使子项尚未退出的工作区；不包括通道工作器、MCP 后代或未附加的衍生预留）、`childRssCoverage`（`active_children`——每个具有活跃通道的 ACP 子项，这是 `activeAcpChildren` 计数的集合；较旧的守护进程发送 `primary_only`）、如下所述的 `children` 对象，以及一个包含 `recommendedShareAtRegisteredMb`（当没有注册工作区时为 `null`）和 `recommendedShareAtActiveMb`（当没有活跃子项时为 `null`）的 `modeled` 对象。每个份额以上限为旧版子项上限为界，并且仅在上限允许时以下限为最小堆大小为界——在小型主机上，上限位于下限之下，因此份额 × 数量可能会超过子项池。将份额视为建议性信息，而非池的分区。子项堆大小调整仍然是建议性的：没有任何子项衍生参数源自这些值。选择加入的 `admit` 强制执行模拟的并发子项数量，而默认的 `observe` 仅记录本应被拒绝的情况。`runtime.memory.committedAcpChildren` 计数受管的 ACP 预留和附加的子项，包括直到注册表释放前的终止中子项；当受管注册表不可用时，它为 `null`。`childHeap` 模拟 `modeled.childPoolMb` 的固定分区——每个子项将接收相同的 `perChildCeilingMb`，因此模拟的总数保持在池内，而不是像每个衍生份额那样累积。仅将 `refusals` 解读为准入压力：计数为 0 **并不**意味着应用该分区是安全的，因为子项在更大的源自主机的上限上运行，因此需要比 `perChildCeilingMb` 更多旧空间的工作负载在此处是健康的，只有在应用分区后才会失败。非零计数不一定意味着容量压力的另外两个原因：准入决策在终止子项退出前一直对其进行计数，因此在已达到 `maxConcurrentChildren` 的守护进程上，每次通道替换都会在重叠窗口期间记录一次拒绝；并且在太小而无法模拟分区的主机上，`maxConcurrentChildren` 为 `0`，因此 `refusals` 等于总的 ACP 衍生计数，`insufficientMemory` 是解释这一点的字段。在 `admit` 中，零槽位模型会导致启动失败。面临容量耗尽的完全受管守护进程可能会回收一个最近最少使用的、没有活跃会话或待处理工作的空 ACP，等待跟踪的释放，然后在衍生之前重试一次准入。已加载的会话受到保护；工作区注册和保存的历史记录得以保留。`refusals` 计数器计数被拒绝的准入尝试，包括初始拒绝随后成功回收的情况，而非最终用户可见的失败。容量耗尽时返回 REST HTTP 503，带有 `code: "acp_child_capacity_exhausted"`、`maxConcurrentChildren` 和 `committedAcpChildren`（不包括被拒绝的预留），不带 `Retry-After`。ACP JSON-RPC 使用 `-32603`，其中 `data.errorKind` 携带该代码、`data.httpStatus: 503` 以及相同的计数器。经验证的预调度独立创建回滚保留 `standalone_creation_rolled_back`、其会话 ID 和可重试性，并将容量代码和计数器嵌套在 `capacity` 下；不确定的创建结果保留其现有的恢复语义。客户端应停止自动容量重试，并保留草稿或选定的会话以供手动重试。在正常的 `runQwenServe` 路径上，预算在创建引导应用程序之前解析，因此 `limits.memory` 在引导窗口期间已填充。仅在未解析任何预算的路径（例如绕过 `runQwenServeImpl` 的直接嵌入）上，它才为 `null`。SDK 类型允许 `null`，因此正确的客户端能够应对。

`runtime.memory.children` 在该块内是附加字段，报告 `childRssCoverage` 命名的子进程的聚合 RSS：`rssBytes`（它们自我报告的 RSS 总和），`sampled`（产生读数的数量），以及 `oldestReadingAgeMs`（总和中最早读数的年龄，以便调用者知道各部分取样的时间间隔）。`sampled` 的分母是同级的 `activeAcpChildren`，不在块内重复；当 `sampled` 较低时，`rssBytes` 是下限而非总数。采样受活跃的 SSE/WS 监视器门控，因此针对无人流式传输的守护进程的状态请求报告 `sampled: 0`，即使有活跃的子进程——旁边的 `activeAcpChildren` 使该差距可见，且与 `sampled: 0` 一起的 `rssBytes: 0` 绝不表示测量值为零。当未采样任何内容时，以及当每个贡献者都是早于该字段的桥接时，`oldestReadingAgeMs` 为 `null`，因此它绝不表示“新鲜”。将该总和同时视为高估和低估：对每个进程的 RSS 求和会重复计算子进程共享的页面，而每个子进程只报告其自身进程，因此其 MCP 后代和每个通道工作器都缺失。这不是守护进程树的内存。由于报告 `primary_only` 的守护进程从不发送该字段，因此该字段在 SDK 镜像中是可选的。

`runtime.memory.children.heap` 在该块内是累加的，并报告每个 ACP 子进程生命周期内 V8 老年代的高水位标记，聚合方式为 **最大值而非总和**：`peakOldGenerationBytes`、`peakLiveSetBytes`、`peakTotalHeapBytes`、`majorGcCount`、`majorGcMs`、`unclassifiedSpaceNames` 和 `reported`。堆内存上限适用于每个子进程，且峰值是在不同时间达到的，因此总和无法回答任何问题；每个字段都是跨所有上报子进程的独立最大值，而不是单个子进程的画像，并且针对每个轴单独判断每个子进程的上限。`reported` 统计了有多少个 `sampled` 做出了贡献，当某些子进程早于这些字段存在时，该数值会更低。每个字节数值涵盖的是 **老年代** —— 即 `--max-old-space-size` 实际限制的部分 —— 而不仅仅是 `old_space`，因为子进程可能在 `old_space` 仅为几兆字节时就耗尽上限，而 `large_object_space` 包含所有内容。`peakOldGenerationBytes` 是已提交字节数，随着分配给子进程的上限增加而上升，因此应将其视为工作负载需求的上界，而非其确切需求；`peakLiveSetBytes` 是经过主要 GC 后存活下来的部分，不随上限变化，这使得它能够表明某个子进程无法容纳一个上限；应将其视为上界而非确切的活跃集，因为 GC 条目是异步到达的，且在集合与读取之间分配的任何内容都会被计入。`peakLiveSetBytes` 在观察到主要 GC 之前等于 `0`，这是一种缺失状态而非测量结果。`unclassifiedSpaceNames` 是所有上报子进程无法分类的堆空间的并集；V8 在不同版本间会重命名和添加空间，未知空间会从总和中丢弃，而丢弃会导致计数不足——因此非空数组意味着字节数值是不完整的，不能被视为完整测量值。当没有采样的子进程报告任何数据时，整个对象为 `null`，绝不会是一个清零的对象；如果没有附加 SSE/WS 监视器，则根本不会进行采样，因此这是一种常规状态而非边缘情况。所有这些都是观察性的：这里没有任何内容用于确定子进程大小、拒绝生成或使 `limits.memory.enforced` 脱离 `false`。

`runtime.memory.pressure` 在该块内是累加的，并报告守护进程根进程自身的内存压力：`mode`（`off` / `observe`）、`level`（`normal` / `soft` / `hard` / `critical`）、`source`（`rss` / `heap` / `unknown`）、`ratio`，以及比率来源的六个原始数值 — `rssBytes`、`rssRatio`、`availableBytes`、`heapUsedBytes`、`heapRatio`、`heapLimitBytes`。`ratio` 是 `rssRatio` 和 `heapRatio` 中的较大者，`source` 指明它是哪一个；平局报告为 `rss`。`availableBytes` 以字节为单位表示 `limits.memory.availableMemoryMb` — 特意使用检测到的 cgroup/主机数值而非 `effectiveBudgetMb`，因为终止进程的是真实限制，而非操作员的策略数值。`source: "unknown"` 意味着两个分母都无法测量，绝不能解读为健康状态；`level` 在这种情况下仅为 `normal`，因为没有可供分类的内容。这些数值仅涵盖守护进程 **根进程**：它们是此进程自身的 `memoryUsage()`，因此子进程的增长不会影响它们。`runtime.memory.children` 单独报告这些内容，且这两个数值都不是进程树内存。两种模式都报告整个块；只有 `observe` 额外将无路径的 `daemon_memory_pressure` 警告提升到状态汇总中，因此 `off` 保持顶层 `status` 不变。两种模式下都没有补救措施。由于在 `runtime.memory` 出现之前发布的守护进程发送的块不包含该字段，因此在 SDK 镜像中该字段是可选的。

`limits.maxRegisteredWorkspaces` 是累加的，并报告解析后的用户注册上限（默认 256，可配置范围为 1 到 256）。`limits.maxChannelControlWorkspaces` 报告标准守护进程上独立的控制/恢复所有者上限为 25，即使通道被禁用也是如此。自定义控制器仅在强制执行时才通告该字段。这些字段存在于引导和就绪响应中；较旧的守护进程可能会省略它们。通道控制器在构建候选工作进程之前，使用 `409 channel_control_workspace_limit_reached` 拒绝超过其上限的过渡性所有者联合；初始启动时的联合若超过上限，则在发布监听器之前导致启动失败，因此没有 HTTP 表面。注册容量不决定 SDK 通道超时。

`limits.maxTotalSessions` 是累加的。`null` 意味着有效的全守护进程新会话上限被禁用。当解析后的注册容量（默认 256，可通过 `QWEN_SERVE_MAX_WORKSPACES` 或嵌入的 `maxRegisteredWorkspaces` 配置）超过 25 且省略 `--max-total-sessions` 时，标准守护进程使用固定的总数 800，即使只有一个启动工作区。在注册容量为 25 或更少的情况下，具有有限 `maxSessionsPerWorkspace` 的几个启动/恢复工作区通过 `maxSessionsPerWorkspace * workspaceCount` 基于相同的启动加恢复计数一次性推导有效总数；一个启动或恢复的工作区保留无限默认值。显式总限制（包括禁用的值）优先。后续的动态注册不会重新计算总数。直接 `createServeApp` 嵌入必须提供自己的共享准入策略。设置后，它限制整个守护进程的新会话创建，并使用现有的 `session_limit_exceeded` 错误形状加上 `scope: "total"` 报告总限制失败。

`runtime.channel.live` 报告守护进程内的 ACP 桥接通道。它不是通道适配器工作进程。守护进程管理的通道使用 `runtime.channelWorker`，其 `state` 是 `disabled`、`starting`、`running`、`exited`、`failed` 或 `stopped` 之一。当工作进程达到 `running` 然后退出时，`/daemon/status` 使守护进程保持在线并报告警告问题代码 `channel_worker_exited`。

从显式 `qwen serve --channel ...` 启动守护进程管理的通道工作进程仍然快速失败，并优先于持久化的启动设置。无标志启动会从每个受信任的已注册工作区恢复 `serve.channels`，每个工作区在其自己的工作区范围设置中贡献列表。恢复的名称形成一个选择，其所有者按常规方式解析，列出名称的工作区打破其他方面模糊的所有权平局。这种启动归属持续的时间与守护进程运行的时间一样长：`PUT /workspace/channel` 重新启用此类名称会以启动时的方式解析它，即使选择在中间已被停止。当非主要工作区贡献的名称无法解析时，会被丢弃并记录日志以标识它，因此一个工作区的过时条目不会阻碍其他工作区；主要工作区列出的名称仍会导致整体恢复失败，无论另一个工作区是否也列出了它。`all` 仍然仅限主要工作区：在其他任何地方都会被忽略并报告。

引导后注册的受信任非主要工作区也会恢复其自身的 `serve.channels`，加载通道运行时，并在没有其他因素占用时预留通道服务租约。该恢复：

- **每次守护进程运行发生一次** — 在工作区请求任何内容时立即记录 — 因此后续的移除和重新注册，或信任的重新实体化，不会撤销在此期间停止其中一个通道的操作员的操作；
- 不在显式 `--channel` 选择下发生，后续注册的工作区不会扩展该选择；
- 在 `DELETE /workspace/channel` 停止托管后不发生，直到 `PUT /workspace/channel` 再次提交选择或守护进程重启；
- 保持已提交的 `all` 选择不变；
- 在一次变更中将该工作区的名称添加到已提交的选中项，每次仅处理一个延迟恢复。与启动时丢弃无法承载的名称并保留其余名称不同，若某个名称无法归属到工作区，则该工作区的整个列表都不会被恢复，错误会按照下文所述进行记录并报告。

注册完全不需要等待通道控制。恢复操作在通道控制队列中排队，响应写入无需等待其完成；由注册或信任变更触发的、针对守护进程已托管通道的协调操作也是如此。因此，从未就绪的工作者只会延迟其后排队的通道工作，绝不会延迟其他注册或信任协调。另一方面，来自 `POST /workspaces` 的 `201` 并不意味着该工作区的通道已启动，也不意味着它拥有的已托管通道已完成重启；请阅读 `GET /workspace/channel` 以了解相关信息。

如果没有显式选择、启动时的 `serve.channels` 恢复，或上述类似的注册，通道运行时加载将保持惰性。

存储的启动名称必须非空，没有前导或尾随空格，且不包含不安全控制字符或不可见字符。无效条目会被单独跳过并按数组索引记录日志；启动过程不会将它们修剪为其他实例名称或重写设置。工作者参数使用 `--channel=<value>`，保留作为名称一部分的前导连字符。

如果存在无效的启动字段，或在工作者启动之前发生验证或租约错误，则跳过自动恢复，并记录标识 `serve.channels` 的日志，同时无关设置仍然生效。工作者启动失败允许守护进程在清理成功后继续运行。全局运行时启动超时和未确认的工作者停止遵循现有的启动失败路径；在工作者终止未确认期间，租约保持持有状态。通道管理报告持久化的启动设置和实际运行时状态。

某些守护进程未启动的 `serve.channels` 名称会被报告，而不仅仅是记录日志。此类名称永远不会加入已提交的选中项，因此没有任何工作者快照包含它。有三种情况会被报告：

- 配置了启动选择但工作者启动失败的情况，发生在保持守护进程在无通道状态下服务的启动路径上；
- 启动所有权解析器在将其归属到工作区时丢弃的名称，会在每个列出该名称的工作区上进行报告；
- 它们出现在两个地方：

它们出现在两个地方：

- `/daemon/status` 为每个工作区报告一个 `channel_restore_failed` 警告，列出每个通道及其错误。这是完整的表面信息，也存在于引导响应中，这是启动记录写入期间唯一存在的响应。每个工作区最多列出 64 个通道，每个名称限制为 128 个字符，如果列表更长则显示 `and <n> more`；
- 该工作区的 `GET /workspaces/:workspace/channels` 列出带有 `runtime: { state: "error", lastError }` 而不是 `stopped` 的通道，其中 `lastError` 是当工作者为该通道报告错误时适配器自身的启动错误，否则是尝试的错误。此表面信息基于工作区自身的通道设置范围构建，因此只能携带该范围定义的名称——任何已注册工作区未配置的名称，或其配置位于另一个工作区的名称，在此处没有行，仅在 `/daemon/status` 上报告。

其他导致 `serve.channels` 名称未被托管的情况仅在守护进程日志中诊断：因整个列表不可读或无效而丢失的名称，因主工作区选择了 `all` 而被丢弃的非主工作区列表，因已提交选中项为 `all` 而被跳过的延迟恢复，以及远程 (SSH) 工作区列表。请检查守护进程日志以获取这些信息。

报告持续存在直到通道被托管——由该工作区或由来自另一个工作区的后续恢复——直到其工作区不再注册，或直到操作员采取行动：对通道执行 `POST` 启动、停止或重启，`PUT`/`DELETE /workspace/channels/:name`，或改变选中项的 `PUT`/`DELETE /workspace/channel`。`PUT /workspace/channels/:name/startup` 不会清除它：它重写 `serve.channels` 而不提及失败的尝试。报告保存在内存中：重启后的守护进程再次恢复并报告该尝试的结果。错误文本经过凭据脱敏处理，并以守护进程日志渲染的方式限制长度。

工作者达到就绪状态后，意外退出会在有界策略内由 serve 监督程序重启：在 5 分钟窗口内最多 3 次重启尝试，退避时间分别为 1s、5s 和 15s。工作者每 15s 发送 IPC 心跳；如果 45s 内未观察到心跳，监督程序将视工作者为陈旧，杀死它，记录 `staleHeartbeatAt`，并使用相同的重启路径。

`runtime.channelWorker` 可能包含附加的操作字段：`requestedChannels`、`pid`、`startedAt`、`exitCode`、`signal`、`error`、`restartCount`、`lastExitAt`、`lastRestartAt`、`nextRestartAt`、`lastHeartbeatAt`、`staleHeartbeatAt`、`startupFailures` 和 `startupFailuresTruncated`。每次启动失败都包含 `channel`、`phase`（目前为 `connect`）、可选的适配器提供的 `code`，以及经过凭证脱敏处理的 `message`。当前工作进程代次最多保留 64 个失败记录；截断标志表示观察到了更多失败。`code` 仅用于诊断，并非稳定的跨适配器分类。`restartCount` 是该 serve 进程在生命周期内进行的重启尝试次数；如果运行中的工作进程的 `restartCount > 0` 符合预期且没有其他问题，则视为健康状态。如果运行中工作进程的 `requestedChannels` 包含在 `channels` 中缺失的名称，则报告 `channel_worker_partial_connect`。

在多工作区守护进程（`--workspace` 重复出现）上，`runtime` 还额外包含 `channelWorkers[]` —— 每个拥有该资源的工作区对应一个条目，每个条目都是一个带有 `workspaceId`、`workspaceCwd` 和 `primary` 注释的 `channelWorker` 快照。为了兼容性，`channelWorker` 仍保持为主工作区的快照。单工作区守护进程省略 `channelWorkers[]`。

### 守护进程管理的通道控制

`channel_control` 能力通告运行时选择资源。尽管其兼容路径使用单数形式的 `/workspace` 前缀，但该资源是守护进程范围的。运行时选择不会被持久化，也不会修改守护进程启动时的 `--channel` 选项。

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

禁用时，`selection` 为 `null`。`pendingSelection` 仅在变更期间存在。`transition` 是 `idle`、`starting`、`reconciling`、`stopping` 或 `rolling_back` 之一。

`PUT /workspace/channel`。相等的选择让健康的工作器保持原位，但会恢复一个工作器已停止或

```json
{ "selection": { "mode": "all" } }
```

```json
{ "selection": { "mode": "names", "names": ["telegram", "feishu"] } }
```

名称会被修剪并去重，但不进行排序；空名称数组无效。`all` 仍然仅限主工作区。从禁用变为启用返回 `201`；幂等的 PUT 或替换操作返回 `200`。响应为 `{ changed, replaced, partial, state }`。相同的选择会保留健康的工作进程，但会恢复那些工作进程已停止或失败的相同选择。

`DELETE /workspace/channel` 受严格门控且具有幂等性。它返回 `{ changed, state }`；成功状态为禁用。`POST /workspace/channel/reload` 也受严格门控，它会重新读取设置、重新解析工作区分组，并强制协调已提交的选择。禁用时它返回 `409 channel_worker_not_enabled`。`channel_reload` 能力仅在管理器具有已提交且可重载的选择时才会动态通告。

每次启用、替换、重载、停止和守护进程关闭都会进入一个 FIFO 生命周期通道。GET 请求不会等待该通道。有序选择未发生变化的工作区分组保持在线。替换失败时会尝试停止新启动的工作进程并恢复之前已提交的选择。客户端必须检查 `rolledBack`、`rollbackError` 和 `state`，因为清理或恢复也可能失败。守护进程在整个事务期间保持 channel-service PID 租约，直到确认所有相关子进程退出后才释放。

一旦请求开始，断开 HTTP 客户端连接不会取消生命周期事务；客户端可以重试

- `400 invalid_channel_selection`，包含 `channel_workspace_mismatch` 和一个可选的凭据脱敏后的 `ambiguous_channel_workspace`
- `403 untrusted_workspace`
- `409 channel_service_conflict`、`channel_worker_not_enabled` 或 `channel_control_workspace_limit_reached`
- `500 channel_worker_stop_failed`
- `502 channel_worker_start_failed`，附带 `rolledBack` 和可选的凭据脱敏 `rollbackError`
- `503 daemon_draining`

来自无令牌的主请求的严格写入，如果在到达门控时没有可信回环权限，则在控制代码运行前返回 `401 token_required`。缺失或无效的配置凭证以及未配对的本地控制凭证会更早地被拒绝，并返回普通的 `401 Unauthorized`。具有可信回环权限的主请求正常执行。一旦请求开始，断开 HTTP 客户端连接不会取消生命周期事务；客户端可以安全地重试相同的 PUT 请求。

对于 `502 channel_worker_start_failed`，响应还可能包含 `startupFailures[]` 和 `startupFailuresTruncated`。每次失败都会添加所尝试工作进程的可信 `workspaceCwd`。这些字段描述失败的事务，而 `state` 描述回滚后的当前状态；后续的 GET 请求不会保留失败的尝试记录。部分连接的工作进程反而返回成功，并在其工作进程快照中暴露其失败信息。显式 `--channel` 启动若没有连接适配器则会导致启动失败。由设置派生的启动失败会被记录日志，并在清理成功后允许守护进程继续运行，但需遵守全局运行时启动超时限制。若无法确认清理完成，则保留正常的启动失败行为和服务租约。

不带 `--daemon-url` 的 `qwen channel status` 继续读取 pidfile 元数据；带 `--daemon-url` 时读取 `GET /workspace/channel`。在重启窗口期间，serve 拥有的 pidfile 保持预留状态，但省略了 `workerPid`，以免客户端显示过期的工作进程。在多工作区守护进程上，pidfile 还携带一个附加的 `workers[]` 数组（每个工作区的 `workspaceId` / `workspaceCwd` / `channels` / 实时 `workerPid`），同时顶层的 `channels`（联合集）和 `workerPid`（主工作区）保持填充以兼容旧版读取器；单工作区守护进程保持原始的单一工作进程结构。工作进程的 stdout/stderr 被转发到守护进程日志中，其中的 bearer 令牌、敏感的工作进程环境变量值和代理 URL 凭证均已被脱敏。

### 工作区 Channel 管理

`channel_management` 能力通告工作区范围的 Channel 配置和运行时管理。单数形式的 `/workspace` 路由指向主运行时。`/workspaces/:workspace` 解析确切的已注册可信运行时，绝不会回退到主运行时。

只读发现使用：

- `GET /workspace/channel-types`
- `GET /workspace/channels`
- `GET /workspace/channels/events`
- `GET /workspaces/:workspace/channel-types`
- `GET /workspaces/:workspace/channels`
- `GET /workspaces/:workspace/channels/events`

`GET .../channels/events` 返回已解析工作区的 Channel 事件日志，格式为 `{ "events": [...], "truncated": boolean }` 并包含 `Cache-Control: no-store`，以及一个可选的 `channelLinkMeta` 成员：这是一个从 channel 实例名称到非机密链接元数据（`type` 和 `baseUrl`，仅当配置为字符串时存在；对于 GitHub channels，还包括已解析的 `webOrigin`——即 Web UI 客户端应直接拼接而非从 API 根路径重新推导的来源）的映射。该元数据根据 channel workers 运行时使用的合并后的系统 + 用户 + 工作区设置进行解析——作用域本地的管理列表不包含在其他作用域中配置的 channels——并且过滤掉那些已解析的 `cwd` 不属于所查询工作区的 channels，因此一个工作区绝不会接收到另一个工作区的 channel 元数据。这使得客户端能够关联日志行（例如，GitHub PR 或 issue 引用），即使这些 channels 是从用户或系统设置继承而来的。当没有 channel 被解析时，该成员会被完全省略，且较旧的守护进程永远不会发送它；读取设置失败会降级为缺失该成员，而不是导致日志读取失败。每个事件记录了一个 Channel 执行的操作——它接受或跳过的入站消息（附带机器可读的原因：`reason_filter`、`mention_required`、`duplicate`、发送者门控拒绝、`github_api_error`）、处理失败且将再次读取的 GitHub 线程（`failed` 附带 `github_api_error`：GitHub 错误，或者本地错误，此时 channel 无法读写其自身状态或其中一个任务未完成）、发布结果、入站任务转换或轮询结果——并且绝不携带消息文本。如果 GitHub 轮询过滤出超过 20 条通知，则单独记录前 20 条，并额外记录一行 `reason_filter`，其 `detail.filtered` 计数剩余部分，从而防止固定的轮询游标用同一批次的重复项淹没日志。在持有游标期间，轮询再次读取到的评论在每个窗口内仅作为 `duplicate` 或 `mention_required` 记录一次，失败的线程在其在该窗口内的第一次失败轮询以及每第十次失败轮询时作为 `github_api_error` 记录（速率限制或凭据失效：其第一次及每第十次轮询），并在被跳过时记录一次。每个窗口一次的行最多跟踪 8,192 个键；如果某行的键不再适合，则在每次轮询时都记录该行。查询参数：`limit`（1-500，默认 100）、`type`（逗号分隔的 `inbound`、`outbound`、`task`、`poll`）、`channel`（每个实例名称重复该参数一次）以及 `since`（ISO 8601）。该路由不需要操作员权限。日志读取是异步且有界的：当前日志加上每个 Channel 的一个轮换文件，每个文件 256 KiB，每个请求 4 MiB，每个请求 32 个文件，最新的在前。链接元数据另外同步读取合并设置的无副作用快照（几个小的 JSON 文件，针对运行时的有效环境进行解析）；这是尽力而为的装饰，因此任何失败都会省略该成员而不是使日志读取失败。当记录限制或任何读取边界截断结果时，包括比每个文件尾部窗口更高的日志，`truncated` 为 true。尚无日志的工作区返回空列表；无法读取的作用域目录返回 5xx 而不是空列表。

目录使用 `manageable: true` 标记此管理 API 支持的类型。实例快照包含修订版本、脱敏的机密存在性元数据、启动状态和运行时状态；绝不返回字面机密。Channel 快照使用 `Cache-Control: no-store`。

字段描述符可以通过 `properties` 暴露嵌套对象元数据。数值描述符可以使用 `exclusiveMinimum` 表示开放下限，使用 `maximum` 表示包含上限。当客户端原样重发时，超出新声明边界的存储数字仍被接受，因此声明边界不会阻止对现有 channel 的无关编辑；客户端实际更改的值必须满足两个边界。字符串和机密描述符可以使用 `multiline` 向客户端请求多行文本区域；描述符类型仅允许在顶层字段上使用它。不渲染已广告字段类型的客户端必须保留其现有配置值，而不是强制转换或删除它，并且以单行控件渲染 `multiline` 字段的客户端必须逐字保留存储值，而不是写回其去除换行符的输入值。对象字段不能是必需的，嵌套属性不能是机密或环境可解析字段；这些管理协议仍然仅限于顶层。仅在写入中存在父对象时，才强制执行嵌套的 `required` 属性；省略父对象会使嵌套要求不被检查。写入会整体替换每个字段的存储值，因此保留对象意味着重发存储的对象；守护进程不会合并部分对象。

配置写入使用乐观并发控制和严格的操作员权限门控：

- `PUT /workspace/channels/:name`
- `DELETE /workspace/channels/:name`
- `PUT /workspace/channels/:name/startup`
- 每次设置变更都包含 `/workspaces/:workspace/...`。Upsert 请求包含一个

每个设置变更都包含 `expectedRevision`。Upsert 请求包含一个 `config` 对象，并可能包含显式的机密操作：`preserve`、`replace` 或 `clear`。Channel 配置不能选择在已解析工作区之外的工作目录。

运行时操作是严格门控的 `POST` 请求，指向 `.../channels/:name/start`、`stop` 或 `restart`。它们仅作用于已解析工作区所属的工作器。

配对管理仅适用于配置了 `pairing` 发送者策略或群组策略的实例：

- `GET .../channels/:name/pairing-requests`
- `POST .../channels/:name/pairing-requests/approve` 与 `{ "code": "..." }`
- `GET .../channels/:name/pairing-approvals`
- `DELETE .../channels/:name/pairing-approvals` 配合 `{ "senderId": "..." }` 或 `{ "groupId": "..." }`

所有配对路由都需要严格的运营商权限并使用 `Cache-Control: no-store`。请求、批准和撤销的范围限定于选定的 Channel 实例和工作区。待处理请求包含类型化的用户或群组主体；群组请求还保留发起请求的发送者。批准快照包含 `senderIds` 和 `groupIds`，因为允许列表不持久化显示名称。撤销未知用户或群组返回 `404 channel_pairing_approval_not_found`。

### 通道交付和通知

`channel_delivery` 宣告支持即时尽力而为的投递。这是一种协议能力，而非 worker 健康信号。投递绝不会启动缺失的 worker、回退到另一个工作区、重试、持久化发件箱或重放历史通知。

两个路由都使用严格变更门控。限定路由仅解析

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

两个路由都使用严格变更门控。合格路由仅解析已注册且受信任的工作区。成功状态为 `200 {delivered:true,deliveryId}`。`delivered:true` 表示 Channel 发送 Promise 已解决；它并不证明提供商接受、用户接收或读取回执。特定于提供商的响应验证以及跨 IM 适配器的一致错误原因语义不在本 V1 契约范围内。错误包括 `400 channel_delivery_invalid`、`503 channel_worker_unavailable` 或 `channel_delivery_queue_full`、`504 channel_delivery_timeout`，以及 `502 channel_delivery_rejected` 或 `channel_delivery_failed`。超时结果未知且不重试。有意不设单独的连接性测试端点：正常的 Notify 调用即为端到端测试。

成功的空 Prompt 最终状态省略了错误字段：

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

`source` 是 `prompt` 或 `scheduled`；`status` 是 `delivered`、`failed` 或 `skipped`。`skipped` 表示符合条件的轮次已成功完成，但其最后一个无工具调用的助手响应块为空或仅含空白字符。守护进程消耗投递授权并发布事件，而不解析 Channel Worker。计划关联使用 `taskId` 和 `firedAt`。事件绝不包含目标 ID、消息文本、凭据或 webhook 密钥。

安全性：响应绝不包含 bearer 令牌、客户端 ID、完整的 ACP 连接 ID、设备流用户代码或验证 URL。两种详细级别都可能包含附加的 `daemon.runId`、`daemon.logMode` 和 `daemon.logHealth`。`summary` 省略守护进程日志路径和丢失详情；`full` 可能为经过身份验证的运营商包含 `logPath`、`logIssues`、`logDroppedRecords` 和 `logDroppedBytes`。降级文件日志记录会在正常状态汇总中添加不含路径的 `daemon_log_degraded` 警告。

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
    "maxRegisteredWorkspaces": 256,
    "maxChannelControlWorkspaces": 25,
    "maxPendingPromptsPerSession": 5,
    "maxSessionsPerWorkspace": 32,
    "maxTotalSessions": 800,
    "sessionRestoreTimeoutMs": 60000
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

稳定契约：当 `v` 递增时，帧布局以向后不兼容的方式发生了变化。

> **`protocolVersions`** 描述了守护进程可以支持的 serve 协议版本。`current` 是守护进程首选的协议版本，`supported` 是兼容集。需要特定协议的客户端应检查 `supported`；特定功能的 UI 仍应基于 `features` 进行门控。对 v=1 的附加内容：较旧的 v=1 守护进程会省略此字段，因此针对旧构建版本的 SDK 客户端应将其视为可选字段。

> **在 Stage 1 中，`modelServices` 始终为 `[]`。** Agent 使用其单一默认模型服务，并且不会通过网络枚举它。Stage 2 将从注册的模型适配器填充此字段，以便 SDK 客户端可以构建服务选择器；在此之前，请勿依赖此字段非空。

> **`workspaceCwd`** 是守护进程主工作区的规范绝对路径。使用它在 `POST /session` 上省略 `cwd`（路由回退到此主路径），并保持与旧的单工作区客户端兼容。对 v=1 的附加内容：§02 之前的 v=1 守护进程会省略该字段——针对旧构建版本的客户端在使用前应进行 null 检查。

> **`workspaces[]`** 列出了所有已注册的运行时。较新的单工作区守护进程即使在没有 `multi_workspace_sessions` 的情况下也会包含主运行时，以便客户端可以发现工作区限定路由所需的稳定 id；较旧的守护进程可能会省略该数组。每个条目都是 `{ id, cwd, displayName?, primary, trusted, removable? }`。`displayName` 仅用于展示，未设置时会省略。第一个/主工作区仍由 `workspaceCwd` 镜像反映；新客户端通过将该条目的 `cwd` 传递给 `POST /session` 来选择非主运行时。不受信任的工作区会被广播用于诊断，但在信任更改之前会以 `403 untrusted_workspace` 拒绝创建新会话。支持运行时移除的守护进程上存在 `removable`，且仅对于进程动态或持久化恢复的次级运行时为 true。

> **`session_worktree_persistence_v1`** 意味着守护进程可以持久化并验证 Part 4A worktree 所有权。成功的 worktree 创建响应，以及子项在空闲时被移动或已经报告经过验证的 worktree cwd 的恢复响应，携带 `worktree` 元数据加上 `worktreeState: "persisted-v1"`。遗留的最佳努力恢复，或者触发而非停放恢复提示（`suppressWorktreeContextRestore` 关闭，因此路由要求桥接不进行延迟）并因此报告没有当前 cwd 的活动提示的冷恢复，可能仍然返回 `worktree` 而没有该证明。请求隔离的客户端必须预检此标签并验证每个响应；单独的 `worktree` 对象不是持久所有权的证明。

> **`session_worktree_reset_v1`** 意味着守护进程支持 worktree 所有权转移：`POST /session/:id/worktree-reset` 将持久化的 worktree 会话的检出所有权移动到新的替换会话。恢复响应随之获得三种类型的 409 分类：`worktree_session_superseded`（会话的 sidecar 携带一个 `supersededBy` 链接——分类仅根据该链接决定，在任何标记读取之前，并且链接在标记翻转之前写入，因此正文中的 `replacementSessionId` 是需要验证的重定向而不是所有权证明：在中断提交状态下，它命名了一个不是标记所有者的会话，本身无法恢复，并被重试的重置回收）、`worktree_marker_missing`（检出标记缺失；重置任务以重新创建它——恢复重试不能这样做，因为没有恢复路径会写入标记）以及 `worktree_reset_interrupted`（之前的传输在飞行中崩溃，其 sidecar 链接一致；重试重置）。中断分类首先被检查：缺少标记但其 `supersedes`/`supersededBy` 链接一致的情况显示为 `worktree_reset_interrupted`，绝不会显示为 `worktree_marker_missing`。有关传输协议和失败分类法，请参见下面的路由部分。

工作区功能标签和 `workspaces[]` 是动态的。添加工作区的客户端必须在变更完成后再次获取 `/capabilities`；守护进程不会向缓存了较早响应的客户端广播能力变化。忘记持久化不会卸载活动运行时，因此该运行时在重启前仍会被广播。

### `GET /brand`

Web Shell 的产品品牌标识，供希望白标 shell 的主机使用。从操作员设置范围中的 `ui.brand` 解析。受 `web_shell_brand` 功能标签门控；没有该路由的守护进程回答 404。

```json
{
  "name": "QiuQiu Code",
  "logoDataUri": "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%2F%3E"
}
```

> **两个字段都是可选的，且 `{}` 是一个正常响应。** 字段缺失意味着“使用客户端内置品牌”——Web Shell 渲染其自己的名称和内联 logo。客户端不得将空主体视为错误。

> **处理程序始终返回 200，即使配置了被拒绝的徽标。** 文件缺失、符号链接、硬链接文件、目录、非 SVG 文档或超过 32 KiB 的内容都会导致响应体中没有 `logoDataUri`，且原因会作为 `qwen serve: GET /brand: ui.brand.logoPath …` 写入守护进程的 stderr。因此客户端无法区分“未配置品牌”和“操作员的徽标被拒绝”；面向操作员的信息渠道是守护进程日志。有一条建议比拒绝更宽松，共有两条：根元素 `<svg>` 没有可用的 `viewBox` 且没有正的、非百分比的 `width`/`height`（格式错误或零面积的 viewBox 视为不可用），浏览器可能在侧边栏固定大小下将其渲染为空白；以及前缀绑定的根元素其无前缀元素缺少默认命名空间绑定，这会使它们不可见。位于处理程序之前的中间件会在其运行之前做出响应——当需要 Bearer 认证但缺失时返回 `401`，当可选速率限制器启用时返回 `429`。正在排空的守护进程不会拒绝此路由：在排空期间速率限制器是宽松的，因此处理程序会持续返回 200，直到监听器关闭且客户端看到连接失败。在此路由上启动不是 503：在默认的延迟运行时路径中，请求会被 _挂起_ 直到运行时就绪然后返回 200，因此较短的客户端超时可能会提前触发。带有 `code: "daemon_runtime_starting"` 的 503 仅在运行时就绪前就响应的配置（例如 `--open`）上到达此路由，并且是可重试的；带有 `code: "daemon_runtime_failed"` 的 503 是终止性的，直到守护进程重启，且不携带 `Retry-After` —— 不要重试它。

> **工作区设置永远不会贡献内容。** 该路由使用 `skipWorkspaceSettings` 加载设置，因此仓库的 `.qwen/settings.json` 不能重命名产品或指定供守护进程读取并内联到每个已连接浏览器的文件。仅按此优先级读取系统默认值、用户和系统设置。出于同样的原因，每当占位符替换会更改品牌值时，守护进程的 stderr 上都会发出警告并拒绝该品牌值：替换从进程范围的环境变量中提取，而工作区的 `.qwen/.env` 或 `env` 块在启动时首先填充这些变量。无法解析的占位符（变量未设置）保持原样，因此拼写错误的变量显示为字面文本而不是静默回退。

> **`logoDataUri` 必须作为图像渲染，绝不能作为标记注入。** 守护进程不会对读取的 SVG 进行清理。通过 `img` src 或 favicon href 加载的 SVG 无法执行脚本；注入到文档中的 SVG 可以。Web Shell 只将其分配给图像上下文，这一不变性使得缺少清理器是安全的。

> **进程全局。** 该路由不接受工作区选择器和会话 ID：值源自用户全局配置，因此对于守护进程服务的每个工作区都是相同的。它在 `bearerAuth` 和速率限制器之后注册，并在 Web Shell SPA 回退之前注册，因此它对任何 `Accept` 头都响应 JSON。

### `POST /workspaces`

注册额外的运行时工作区。路径必须是现有的、可访问的绝对目录，且不与另一个已注册的工作区重复或嵌套。除非客户端发送 `persist: true`，否则注册是进程本地的；客户端必须在请求持久化之前预检 `persistent_workspace_registration`。当宣传 `workspace_display_name` 时，请求还可以包含一个可选的 `displayName`。

当宣传 `git_workspace_clone` 时，相同的路由也接受 `{ "kind": "git", "url": "...", "target": "/absolute/new/path" }`。这种形式要求一个尚不存在的绝对 `target`，启动异步克隆，不注册任何内容，并返回 `202 { "kind": "git-workspace-clone", "jobId": "..." }`。下面的 `201` 和 `200` 响应描述了同步的 `cwd` 和 `scratch` 形式；git 形式不注册任何内容，克隆进度和取消使用 `GET`/`DELETE /workspace-git-clone-jobs/:jobId`。

```json
{
  "cwd": "/canonical/path/to/secondary-workspace",
  "persist": true,
  "displayName": "Payments Production"
}
```

新创建的运行时返回 `201`；将已激活的次要工作区提升为持久化返回 `200`。持久化成功包括 `persisted: true`：

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

`displayName` 必须是修剪周围空白后长度不超过 256 个字符的字符串。空结果被视为无名称，内部 C0 (`U+0000`–`U+001F`) 或 DEL (`U+007F`) 控制字符会被拒绝。JSON `null` 不是创建值并返回 `400 invalid_display_name`；省略该字段以不提供初始名称。允许重复的显示名称。随进程本地注册提供的名称仅在该守护进程存续期间有效；`persist: true` 将其与持久化注册一起存储，以便在重启后可以恢复。对已持久化的工作区重复请求是幂等的，并且不会重命名它。

错误包括 `400 invalid_path` / `invalid_persist_flag` / `invalid_persist_target` / `invalid_display_name`, `409 workspace_exists` / `workspace_nested` / `workspace_limit_reached` / `workspace_registration_store_too_large`, `500 workspace_registration_store_error` / `runtime_creation_failed`, 以及 `501 persistence_not_available` / `not_implemented`。

### `PATCH /workspaces/:workspace`

更新由工作区 ID 或 URL 编码的绝对 cwd 选择的活跃工作区资源。该端点目前仅支持显示名称元数据：

```json
{ "displayName": "Payments Production" }
```

发送 `{ "displayName": null }` 以清除名称。这里 `null` 是一个仅限更新的删除哨兵；非 null 值遵循与 `POST /workspaces` 相同的字符串规范化规则。响应是更新后的 `{ id, cwd, displayName?, primary, trusted, removable? }` 工作区投影。运行时元数据始终更新。如果运行时具有匹配的持久化注册身份，则每个别名都通过现有的 schema-v1 注册存储原子性地更新；该端点从不创建或提升持久化注册。

不支持的字段会失败关闭而不是被静默忽略。错误包括 `400 empty_patch` / `invalid_display_name` / `unsupported_field` / `workspace_mismatch`, `409 workspace_registration_in_progress`, `500 workspace_registration_store_error`, 以及 `503 daemon_shutting_down`。

### `DELETE /workspaces/:workspace`

移除一个可移除的次要运行时。选择器遵循复数工作区路由规则，并接受工作区 ID 或 URL 编码的绝对 cwd。可选的 JSON 主体是 `{ "force": boolean }`；省略它表示请求非强制移除。

当冻结的运行时拥有会话、提示词、待处理的启动、ACP 连接、内存任务或工作区通道工作者时，非强制移除返回带有 `activity` 快照的 `409 workspace_busy`。发送 `{ "force": true }` 请求终止这些资源。持久化移除是提交点：随后的清理是有界且尽力而为的，清理失败会被记录，逻辑移除仍然收敛而不是恢复运行时。成功的响应是：

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

立即繁忙的非强制请求返回快速的预排空活动快照。一旦排空开始，繁忙或成功响应包含在准入和 ACP 排空门关闭之后、清理开始之前拍摄的最终快照。错误包括 `400 invalid_force_flag` / `workspace_mismatch`, `409 workspace_busy` / `primary_workspace_removal_forbidden` / `static_workspace_removal_forbidden` / `workspace_removal_in_progress` / `workspace_registration_in_progress`, `500 workspace_persist_failed` / `workspace_runtime_removal_failed`, `501 workspace_runtime_removal_unsupported`, 以及 `503 daemon_shutting_down`。

### `GET /workspace-registrations`

列出此主工作区的持久化期望工作区集。当当前启动期间无法恢复存储目录时，条目仍可见并带有 `active: false`。只要其运行时正在排空，条目就保持 `active: true` 状态，因为在移除完成之前，运行时仍拥有活动资源。如果持久化注册包含可选的 `displayName`，则条目中也包含该字段。

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

忘记一个持久化的注册。这不会卸载活动运行时或终止其会话；`restartRequired: true` 意味着活动运行时将在下次守护进程重启时消失。

```json
{ "removed": true, "active": true, "restartRequired": true }
```

返回 `404 workspace_registration_not_found`、`500 workspace_registration_store_error` 或 `501 persistence_not_available`。与其他变更路由一样，当启用守护进程身份验证时，此端点需要变更身份验证。

### 只读运行时状态路由

这些路由报告守护进程侧的运行时快照。它们是附加的 v1 路由，不会改变状态，也不会更改 serve 协议版本。工作区状态路由有意**不**仅仅因为客户端轮询 GET 路由就启动 ACP 子进程。`GET /workspace/mcp` 在守护进程空闲且未持有保留的 MCP 观察结果时，返回带有空快照的 `initialized: false`；如果之前的活动子进程曾回答过，空闲读取会重放该观察结果，并带有 `source: "cache"` 及其原始 `initialized` 值。相反，`GET /workspace/skills` 提供保留的守护进程观察结果或守护进程本地枚举，并且仅在不存在保留的观察结果且两个源均不可用（或冷读取被节流）时，才报告带有 **`errors` 条目**的 `initialized: false`（可重试的不可用性，而非空目录）——参见 [`GET /workspace/skills`](#get-workspaceskills)。`GET /workspace/providers` 由守护进程本地根据工作区设置和环境变量进行回答，因此不依赖于活动的 ACP 子进程，且 `acpChannelLive` 报告存活状态。其 `initialized` 在成功路径上为 `true`，当工作区设置或模型配置无法解析时，则为带有 `errors` 条目的 `false`；构造时没有守护进程本地提供程序构建器的守护进程会回退到活动的 ACP 快照，而守护进程本地的回答会省略运行时注册的模型。会话状态路由需要活动会话，并对未知 ID 返回 `404 { code: "session_not_found", ... }`。

运行时，其配置的启动策略可能独立地预热 ACP。

- `workspace_mcp` → `GET /workspace/mcp`
- `workspace_skills` → `GET /workspace/skills`
- `workspace_providers` → `GET /workspace/providers`
- `workspace_acp_status` → `GET /workspace/acp/status`
- `workspace_env` → `GET /workspace/env`
- `workspace_preflight` → `GET /workspace/preflight`
- `session_context` → `GET /session/:id/context`
- `session_supported_commands` → `GET /session/:id/supported-commands`
- `session_tasks` → `GET /session/:id/tasks`
- `session_resources` → `GET /session/:id/resources`
- `session_monitor_tool_correlation` → 来自 `GET /session/:id/tasks` 的监控条目包含 `toolUseId` 以用于转录到任务的关联
- `session_status` → `GET /session/:id/status`
- `session_info` → `GET /workspace/:id/session-info` 和 `GET /workspaces/:workspace/session-info`
- `session_transcript` → `GET /session/:id/transcript`
- `workspace_persisted_transcript` → `GET /workspaces/:workspace/session/:id/transcript`
- `workspace_session_export` → `GET /workspaces/:workspace/session/:id/export`
- `workspace_archived_session_export` → `GET /workspaces/:workspace/session/:id/archive/export`
- `workspace_session_live_state` → `GET /workspaces/:workspace/sessions/live-state`
- `workspace_qualified_memory` → `POST /workspaces/:workspace/memory/{remember,forget,dream}` 和 `GET /workspaces/:workspace/memory/{remember,forget,dream}/:taskId`

`workspace_acp_status` 将主工作区 ACP 通道的瞬时存活状态报告为 `{ channelLive: boolean }`。处理程序不会创建通道，但访问运行时路由可能会首先启动延迟的守护进程运行时，其配置的启动策略可能会独立预热 ACP。快照不是租约：客户端必须让 Session 创建重新验证或启动通道。

### ACP 预热

能力标签：`workspace_acp_preheat`。

`POST /workspace/acp/preheat?timeoutMs=N` 尽力初始化主工作区 ACP 通道。`timeoutMs` 默认为 5000，必须是正整数且不大于 60000。并发调用者和 Session 创建共享相同的桥接初始化。请求超时仅结束该 HTTP 等待；它不会取消共享初始化。

```ts
interface WorkspaceAcpPreheatResult {
  ready: boolean;
  channelLive: boolean;
  durationMs: number;
  reason?: 'timeout' | 'error';
  error?: string;
}
```

`ready` 始终等于 `channelLive`。实时响应省略 `reason` 和 `error`；否则 `reason` 为 `timeout` 或 `error`。`durationMs` 衡量的是当前的 HTTP 调用，而非该调用所加入的初始化过程的整个生命周期。操作超时或失败返回 HTTP 200。无效的 `timeoutMs` 返回 400，而身份验证、速率限制和延迟运行时故障保留其正常响应。

两个 ACP 工作区路由均为单数且仅针对主工作区。客户端不得将它们用于辅助工作区，也不得将任一响应解释为持久就绪保证。

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
  | 'restore_timeout'
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

`errorKind` 是一个由 `/workspace/preflight`、`/workspace/env` 以及（最终）MCP 护栏共享的封闭枚举，以便 SDK 客户端可以按类别渲染补救措施，而不是解析自由格式的消息。最初的七个状态字面量来自 #4175；`restore_timeout` 是为会话恢复请求单独添加的。在出口探测落地之前，`blocked_egress` 保持保留状态。

状态载荷绝不暴露 MCP 环境变量值、标头、OAuth/服务账户详细信息、提供商 API 密钥、提供商 `baseUrl` / `envKey`、技能正文、技能文件系统路径、钩子定义或秘密环境变量的值。`/workspace/env` 仅报告白名单环境变量的 **存在性**；代理 URL 在传输前会被剥离凭据并简化为 `host:port`。

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

`discoveryState` 是 `not_started`、`in_progress` 或 `completed` 之一。`transport` 是 `stdio`、`sse`、`http`、`websocket`、`sdk` 或 `unknown` 之一。当发现成功时，省略 `errors`。

当产生观察结果的子进程处于活动状态时，`source` 为 `"live"`。当守护进程空闲且活动的子进程此前已响应时，响应会重放带有 `source: "cache"` 及子进程原始值（包括 `initialized: true` 及其服务器列表）的观察结果。缓存的观察结果仅在新的 MCP 发现开始时清除；回收子进程不会丢弃它，因此空闲的 `GET /workspace/mcp` 可能会报告当前没有活动子进程提供的目录。

**MCP 客户端护栏（问题 [#4175](https://github.com/QwenLM/qwen-code/issues/4175)）。** 当前守护进程通过四个附加字段和一个能力范围预算单元扩展了载荷：

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

`budgetMode` 是 `enforce`、`warn` 或 `off` 之一。当未设置预算时，`clientBudget` 不存在。在宣传 `mcp_guardrails` 的守护进程上，`budgets[]` **始终是一个数组**（当 `budgetMode === 'off'` 时可能为空）；较旧的守护进程完全省略该字段。当宣传 `mcp_workspace_pool` 时，该单元具有 `scope: 'workspace'` 并覆盖所选工作区运行时的共享池。当缺少该标签时，包括在 `QWEN_SERVE_NO_MCP_POOL=1` 下，遗留管理器发出 `scope: 'session'`。消费者必须容忍额外的无法识别的范围值。

每服务器单元上的 `disabledReason` 区分操作员禁用（`'config'` — `disabledMcpServers` 配置列表）与预算拒绝（`'budget'` — 已发现但因 `enforce` 模式从未连接）。拒绝由 `Object.entries(mcpServers)` 声明顺序确定性地决定。每服务器的 `status: 'error', errorKind: 'budget_exhausted'` 遮蔽了原始的 `mcpStatus: 'disconnected'`（后者为真但并非面向操作员的严重性级别）。

预算执行由能力驱动。使用 `mcp_workspace_pool` 时，一个工作区运行时内的会话共享传输层和一个 `WorkspaceMcpBudget`；不同的工作区运行时从不共享池或预算。没有该标签时，每个 ACP 会话的 `McpClientManager` 强制执行其自身的上限副本，快照代表该遗留会话视图。

**检测预算压力。** 两个表面，均在 PR-14b 后填充：

- **推送事件**（通过 `mcp_guardrail_events` 宣传）：订阅 `GET /session/:id/events` 并通过 `KnownDaemonEvent` 缩小 `mcp_budget_warning` / `mcp_child_refused_batch` 帧。状态机在每次向上跨越 75% 阈值时触发一次（低于 37.5% 时重新武装）；在 `enforce` 模式下，拒绝在每个发现过程中合并一次。
- **快照轮询**（通过 `mcp_guardrails` 宣传）：`GET /workspace/mcp` 并检查预算单元（`budgets[0]`）以及 `mcp_workspace_pool` 以确定其范围：

- `budgets[0].status === 'warning'` ⇔ `liveCount >= 0.75 * clientBudget`（匹配 PR 14b 推送事件将使用的滞回阈值）。
- `budgets[0].status === 'error'` ⇔ `refusedCount > 0`（一个或多个服务器在此发现过程中被拒绝）。
- `budgets[0].status === 'ok'` ⇔ 低于 75% 阈值且无拒绝。

建议轮询频率：与已经轮询 `/workspace/mcp` 的任何内容对齐；快照成本低廉，且预算单元不带来额外的发现成本。订阅推送事件的 SDK 客户端仍可从快照中受益，以获取长时间断开后的状态（SSE 重放环深度有限 — `--event-ring-size`，默认 8000 — 因此离线时间超过环覆盖范围的客户端回退到快照重新同步）。

### `GET /workspace/skills`

主要和工作区限定的清单路由会在后台重新验证的同时立即返回保留的快照。启动频率被限制为每秒一次，从任务开始计时，并发读取器共享一个任务。暖后台重新验证在五秒后释放其槽位；超时允许重试，但不会取消观察或 ACP 工作。冷读取遵循 ACP 配置的请求超时（默认为十秒），如果 ACP 不可用，则随后进行守护进程本地枚举。它们不对任一来源施加后台截止时间。如果在开始后一秒内失败的冷读取，则该窗口的剩余部分会立即返回不可用状态；较慢的失败不会留下节流窗口，因此客户端需要自己的重试退避策略。晚到的成功后台观察可以在重试挂起期间发布，但不能替换稍后已开始并已发布的观察。失效的任务不能发布；成功的失效观察仍可以响应其原始调用者。显式失效会丢弃已知无效的清单并清除节流。在其超时前完成的成功的 ACP 预热也会使保留的清单失效，包括当子进程已经处于活动状态时，因此随后的读取可以看到该子进程。超时然后发现通道处于活动状态的预热也会报告 `ready: true` —— ready 始终等于 `channelLive` —— 但保留清单，因为启动可能仍未完成；下一次读取返回该保留数据，一旦一秒的启动节流允许，后台重新验证就会将其替换。技能删除绕过快照和节流，但需要一个新枚举的目录：它使用本地回退，并且绝不从保留的快照中响应。启用身份读取绕过快照和节流，等待新的观察结果，先使用本地回退，然后在两个来源都失败时使用保留的快照。

携带保留守护进程观察结果的清单响应还包含可选的快照元数据。直接配置/运行时状态读取、会话资源清单和较旧的守护进程省略此信息。被取代的成功冷读取在可用时返回更新的保留快照；否则，它返回其自己的未缓存观察结果而不带此元数据。只有没有错误的已初始化观察结果才能替换保留的快照：

```json
{
  "snapshot": {
    "observedAt": 1792486800000,
    "ageMs": 1500,
    "stale": true,
    "refreshing": true
  }
}
```

`observedAt` 是成功观察结果的 Unix 毫秒级开始时间；`ageMs` 会在每次响应时重新计算，并保守地包含收集时间。`stale` 表示该观察结果至少已存在一秒。`refreshing` 报告重新验证是否占用共享槽位；超时的观察结果可能在槽位释放后仍会完成。读取失败、槽位超时以及运行时停止后的重放不会刷新时间戳；后续成功的发布将记录其自身的观察开始时间。客户端可以显示此年龄信息，但它不是文件系统修订版本，也不能证明每个会话都是最新的。如果不存在已初始化的快照且两个源均不可用（或冷读取被节流），则响应包含 `initialized: false`、一个 `errors` 条目，并且没有 `snapshot` 元数据。这是可重试的不可用状态，而不是空目录；有效的空目录具有 `initialized: true`。状态读取不会调用影响会话的技能刷新命令。已关闭或正在排空的工作区运行时会拒绝读取；保留的数据在子通道回收后依然存在，但在运行时退役后不再存在。

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
    },
    {
      "kind": "skill",
      "status": "ok",
      "name": "database-review",
      "description": "Review database changes",
      "level": "extension",
      "modelInvocable": true,
      "installedPath": "/home/alice/.qwen/extensions/alibabacloud-database-suite/skills/database-review/SKILL.md",
      "extensionName": "alibabacloud-database-suite",
      "extensionDisplayName": "Alibaba Cloud Database Suite"
    }
  ]
}
```

`level` 是 `project`、`user`、`extension` 或 `bundled` 之一。`userInvocable`（布尔值，可选）对于普通技能会被省略（意味着 `true`），仅当技能无法手动调用时才作为 `false` 出现。它不会限制下面描述的仅限设置的技能切换路由。`modelInvocable` 是独立的：`false` 意味着技能仍然可以手动使用，但对模型调用隐藏。`installedPath` 是指向技能的 `SKILL.md` 的现有绝对路径；守护进程按存储原样返回它，不单独解析符号链接或规范化它。当前守护进程会为每个技能发出此字段，而客户端必须容忍较旧的 v1 守护进程中缺少此字段的情况。技能主体、钩子、`skillRoot` 和其他技能配置仍然被排除在外。当发现成功时，`errors` 会被省略。

对于扩展拥有的技能，`extensionName` 是规范的清单名称，可以安全地用作所有者标识。`extensionDisplayName` 是一个可选的本地化展示值，可能不唯一。新客户端应显示 `extensionDisplayName ?? extensionName`；较旧的守护进程会省略展示字段。

重复读取从最后提交的工作区快照中提供服务，并定期针对子进程的内存缓存进行重新验证。稳态读取不会扫描技能目录或重新解析 `SKILL.md` 文件；冷守护进程本地回退可以从磁盘枚举。子进程确实会验证其扩展源未发生变化——即扩展目录的一个 `readdir` 加上每个条目的一个 `stat`、启用文件以及存储的激活状态——并且仅在它们发生移动时刷新，因此在守护进程外部安装或切换的扩展将通过重新验证被拾取，并在该重新验证发布后的后续读取中出现。暖读取始终返回保留的观察结果，即使它启动了后台工作。安全和裸模式会跳过检查，这与它们排除扩展的行为一致。

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

模型按认证类型分组。提供商连接诊断位于 `/workspace/preflight` 的 `providers` 单元格中；环境预检位于 `/workspace/preflight` 和 `/workspace/env`（见下文）。当快照构建成功时，`errors` 会被省略。

### `GET /workspace/env`

报告守护进程运行时的运行时、平台、沙箱、代理以及白名单密钥环境变量**的存在性**。始终从 `process.*` 状态获取答案——守护进程绝不会生成 ACP 子进程来服务此路由，无论 ACP 处于活动还是空闲状态，响应都是相同的。`acpChannelLive` 字段仅供参考。

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

**脱敏策略。** `kind: 'env_var'` 单元格从不包含 `value` 字段；客户端只能看到 `present: boolean`。`kind: 'proxy'` 单元格将原始环境变量值通过凭证脱敏（`redactProxyCredentials`）处理，然后通过 `URL` 解析，因此传输线上只携带 `host:port`。`NO_PROXY` 经过脱敏处理后原样传递，因为它是一个主机列表而不是 URL。当前枚举的密钥环境变量白名单包括 `OPENAI_API_KEY`、`ANTHROPIC_API_KEY`、`GEMINI_API_KEY`、`GOOGLE_API_KEY`、`DASHSCOPE_API_KEY`、`OPENROUTER_API_KEY` 和 `QWEN_SERVER_TOKEN`。其他环境变量未被枚举，因此意外设置的密钥保持不可见。

### `GET /workspace/preflight`

报告守护进程就绪检查。**守护进程级别的单元格**（`node_version`、`cli_entry`、`workspace_dir`、`ripgrep`、`git`、`npm`）始终从 `process.*` 和 `node:fs` 填充。**ACP 级别的单元格**（`auth`、`mcp_discovery`、`skills`、`providers`、`tool_registry`、`egress`）需要一个活动的 ACP 子进程——当守护进程空闲时，它们发出 `status: 'not_started'` 占位符。该路由绝不会仅为填充单元格而生成的 ACP；相应的单元格回退到 `not_started`。

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

- `missing_binary` — Node 版本低于要求，缺少 `QWEN_CLI_ENTRY`，ripgrep / git / npm 不在 PATH 中（对于可选二进制文件，这些是警告而非错误）。
- `missing_file` — `boundWorkspace` 不存在或不是目录；指向缺失或不可读文件的技能解析错误。
- `parse_error` — `SKILL.md` 解析失败，配置 JSON 格式错误。
- `auth_env_error` — `validateAuthMethod` 返回了非空的失败字符串，或者从提供商解析传播来的 `ModelConfigError` 子类。
- `init_timeout` — 桥接中的 `withTimeout` 拒绝（在等待 ACP 往返时实际发生超时）。通过 `BridgeTimeoutError` 类型类识别。注意：带有 `connecting > 0` 的瞬时 `mcp_discovery` `warning` 单元格不携带此类型——这是正常的握手进行中状态，与真正的超时不同。
- `restore_timeout` — 会话加载或恢复超出了专用的恢复预算。REST 响应为 `504`，且可重试；它与子进程初始化以及有界重放窗口限制不同。
- `protocol_error` — ACP `extMethod` 被拒绝，因为通道在请求中途关闭，或者工具注册表意外缺失。
- `blocked_egress` — 保留给 PR 14 (#4175)。PR 13 将 `egress` 单元格留为 `status: 'not_started'`。

如果桥接器在处理预检请求时无法连接到 ACP 子进程（例如请求中途通道关闭），则信封的 `errors` 数组包含一个描述该失败的 `ServeStatusCell`，并且单元格回退到 `not_started` ACP 占位符。仍然返回守护进程级别的单元格。

### `GET /workspace/tools`

返回由主工作区的 ACP 子进程报告的工具目录。这是一个遗留的主工作区路由：它没有工作区选择器，不得用于推断非主运行时的工具。

```json
{
  "v": 1,
  "workspaceCwd": "/canonical/path",
  "initialized": true,
  "acpChannelLive": true,
  "tools": [
    {
      "name": "ReadFile",
      "displayName": "Read",
      "description": "Read a file",
      "enabled": true
    }
  ]
}
```

当没有活动的 ACP 子进程时，路由仍然返回 `200`，其中包含 `acpChannelLive: false`、一个空的 `tools` 数组，以及可选 `errors` 数组中的一个 `not_started` 条目。意外的桥接失败使用标准的 `500` 桥接错误响应。TypeScript SDK 方法是 `workspaceTools()`；没有专用的能力标签，因此支持旧版守护进程的客户端应将 `404` 视为不支持。

### 工作区文件路由

遗留文件路由通过主工作区解析路径；`/workspaces/:workspace/...` 路由通过选定运行时的的工作区解析路径。响应使用相对于工作区的路径，并且在正常成功情况下绝不返回绝对文件系统路径。成功的文件响应包括：

```http
Cache-Control: no-store
X-Content-Type-Options: nosniff
```

文件系统错误使用此 JSON 格式：

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

读取文本文件。查询参数：`path`（必需）、`maxBytes`、`line`、`limit` 和 `cursor`。守护进程拒绝二进制文件。超过 256 KiB 完整快照上限的文件需要至少一个显式窗口参数（`line`、`limit` 或 `maxBytes`）；如果没有这些参数，请求仍保持 `file_too_large`。这样的窗口是流式传输的，其返回的 UTF-8 内容保持在 256 KiB 的上限内。`maxBytes` 始终适用于解码后的 UTF-8 响应字节，包括当源在完整快照上限内使用另一种支持的编码时。

行偏移量是通过从文件开头扫描来解析的，因此如果到达某个窗口需要读取超过 8 MiB（`MAX_TEXT_SCAN_BYTES`），则该窗口也会被 `file_too_large` 拒绝。使用 `GET /file/bytes` 直接到达更深的偏移量。路由无法解码的大文本编码会返回 `binary_file`，而不是 `file_too_large` — 使用更小的窗口重试无济于事，而 `readBytes` 是同样适用于二进制文件的补救措施。

对于在完整快照上限内的文件，响应包括 `hash`，即整个文件原始磁盘字节的 SHA-256 摘要，即使 `line`、`limit` 或 `maxBytes` 返回了切片也是如此。大型部分窗口省略 `hash`，保留完整的 `sizeBytes`，设置 `truncated: true`，并在流在 EOF 之前停止时返回 `originalLineCount: null`。

##### 使用 `cursor` 进行分页

需要 `workspace_file_read_cursor` 能力。如果有更多数据可供返回，响应将返回 `hasMore: true`，并且当可以推导出文件字节偏移量时，返回一个 `nextCursor` 令牌。将其作为 `cursor` 传回可在 O(1) 时间内恢复，而深层 `line` 偏移量需要从字节 0 开始扫描，并且在超过 8 MiB 时被拒绝。

```
GET /file?path=big.log&limit=500          → { content, nextCursor, hasMore: true }
GET /file?path=big.log&limit=500&cursor=… → next page
```

`cursor` 和 `line` 互斥（`parse_error`）— 两者都指定起始点。格式错误或过长的游标会导致 `parse_error`；如果文件已被替换或截断，则游标会导致 `hash_mismatch` (409)。追加操作**不会**使未完成的游标失效，这正是该功能存在的原因。

`content` 省略其最后一行的终止换行符，与其他所有读取操作一样，因此重新组装页面的客户端使用 `\n` 将它们连接起来。`hasMore` 不是 `nextCursor` 的重述：使用 `limit` 读取的小型非 UTF-8 文件有更多内容但没有可推导的字节偏移量，因此它报告 `hasMore: true` 并带有 `nextCursor: null`。当字节上限切断当前行时，游标也为 null，因为从该偏移量恢复将返回部分行。对于许多短行，降低 `limit` 直到页面在字节上限之前结束并返回游标。对于单个超大行，显式请求下一行（例如，从第 1 行开始时使用 `line=2`），然后继续使用游标；当需要完整的超大行时使用 `GET /file/bytes`。

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

从文件中读取原始字节而不进行解码。查询参数：`path`（必需）、`offset`（默认 `0`）和 `maxBytes`（默认 `65536`，最大 `262144`）。此路由支持对大型二进制文件进行有界窗口读取，而无需一次性读取整个文件。仅当返回的窗口覆盖整个文件时，响应才包括 `hash`。

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

#### `GET /stat`

返回一个主工作区路径的元数据。查询参数 `path` 是必需的。

```json
{
  "kind": "stat",
  "path": "src/index.ts",
  "type": "file",
  "sizeBytes": 128,
  "modifiedMs": 1700000000123
}
```

`type` 是 `file`、`directory`、`symlink` 或 `other`。该路由使用工作区文件边界和上述常见的文件系统错误信封。TypeScript SDK 方法是 `fileStat()`。

#### `GET /list`

列出主工作区中的一个目录。查询参数 `path` 为必填项；`includeIgnored=1`（或 `true`）包含被忽略规则匹配的条目。响应上限为 2,000 个条目，当存在更多条目时设置 `truncated: true`。

```json
{
  "kind": "list",
  "path": ".",
  "entries": [{ "name": "src", "kind": "directory", "ignored": false }],
  "truncated": false,
  "matchedIgnore": null
}
```

每个条目的 `kind` 为 `file`、`directory`、`symlink` 或 `other`。TypeScript SDK 方法为 `dirList()`。

#### `GET /glob`

匹配主工作区内的路径。查询参数 `pattern` 为必填项。可选的 `cwd` 缩小搜索范围，`includeIgnored=1`（或 `true`）包含被忽略的路径，`maxResults` 是 1 到 50,000 之间的整数（默认值为 5,000）。

```json
{
  "kind": "glob",
  "pattern": "**/*.ts",
  "cwd": "",
  "matches": ["src/index.ts"],
  "count": 1,
  "truncated": false,
  "durationMs": 4
}
```

匹配结果相对于工作区。无效的查询值返回 `400`；工作区信任、包含关系、缺失路径和意外失败使用通用的文件系统错误封装。TypeScript SDK 方法为 `glob()`。

#### `POST /file/write`

创建或替换文本文件。这是一个严格的变更路由：无令牌的受信任回环主请求已被授权。到达网关但缺乏受信任回环权限的无令牌主请求返回 `401 { "code": "token_required" }`。配置令牌和本地控制凭据失败会在更早阶段以普通的 `401 Unauthorized` 拒绝；若启用 `--require-auth`，全局 Bearer 中间件会在路由运行前拒绝未认证请求。

字符，基于磁盘上的原始字节计算得出。

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

`mode` 必须为 `create` 或 `replace`。`create` 永远不会覆盖现有文件（`409 file_already_exists`）。`replace` 需要 `expectedHash`；缺失或格式错误的哈希值为 `400 parse_error`，过期的哈希值为 `409 hash_mismatch`。`expectedHash` 由 `sha256:` 加上 64 个小写十六进制字符组成，基于磁盘上的原始字节计算得出。

可提供 `bom`、`encoding` 和 `lineEnding`。默认情况下，替换操作会保留现有文件的编码配置文件；显式字段会覆盖它。二进制写入不在范围内。

守护进程在目标目录中写入一个随机临时文件，在支持的地方执行 fsync，在 `rename()` 之前立即重新检查当前哈希值，然后重命名到位。这防止了部分文件观察并序列化了对同一文件的守护进程发起的写入，但这不是跨进程的内核比较并交换（CAS）：外部编辑器仍可能在最终哈希检查和重命名之间的微小窗口内发生竞争。

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

`oldText` 必须非空且恰好出现一次。无匹配返回 `422 text_not_found`；多个匹配返回 `422 ambiguous_text_match`。该路由保留编码、BOM 和行尾符，并在原子重命名之前立即重新检查 `expectedHash`。

允许对被忽略路径进行显式写入/编辑，因为已认证的调用者指定了该路径。成功响应和审计事件包含 `matchedIgnore: "file" | "directory" | null`。

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

#### `POST /workspaces/:workspace/directory/create`

需要 `workspace_qualified_rest_core` 和 `workspace_directory_create`、严格的变更权限以及受信任的活动本地工作区。正文：

```json
{ "path": "src/new-folder" }
```

父目录必须存在。创建操作是排他的：现有的文件或目录返回 `409 file_already_exists`；最终的符号链接返回 `400 symlink_escape`。成功状态码为 `201 { "kind": "directory_create", "path": "src/new-folder" }`。SDK 方法为 `WorkspaceDaemonClient.createWorkspaceDirectory(path, clientId?)`。

#### `POST /workspaces/:workspace/directory/delete`

在相同的严格变更和受信任本地运行时策略下，需要 `workspace_qualified_rest_core` 和 `workspace_directory_delete`。正文：

```json
{ "path": "src/old-folder" }
```

递归删除空或非空目录。工作区根目录、常规文件和最终符号链接会被拒绝；嵌套的符号链接条目在不跟随其目标的情况下被移除。缺失的目标返回 `404 path_not_found`。成功状态码为 `200 { "kind": "directory_delete", "path": "src/old-folder" }`。SDK 方法为 `WorkspaceDaemonClient.deleteWorkspaceDirectory(path, clientId?)`。

两个目录路由在解析选定工作区内的父目录时，都会保留词汇上的最终名称。路径不得以分隔符结尾；可疑的路径模式返回 `400 path_outside_workspace`，而格式错误的叶节点形状返回 `400 parse_error`。不支持的自定义工厂返回 `422`；SSH 工作区被 SSH 边界以 `501` 拒绝。未知、不可用、已移除或不受信任的所有者绝不会回退到主工作区。

删除操作是永久性的，失败可能会留下部分删除的内容。并发写入者可能导致 `ENOTEMPTY`，作为 `503 io_error` 返回；在写入者停止后重试相同操作。按路径加锁不会将目录与每个子写入操作序列化，并且通过可移植的路径检查无法使外部目录替换成为原子操作。允许对被忽略目录进行显式变更，并在适用时在审计事件中注释 `matchedIgnore`；创建记录 `sizeBytes: 0`。

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

对于顶级会话，`state` 镜像了 `POST /session`、`POST /session/:id/load` 和 `POST /session/:id/resume` 使用的相同 ACP 模型/模式/配置选项形状。带有 `subagent.` 前缀的虚拟会话 ID 针对其父运行时解析，并返回一个空的 `state` 对象。

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

`availableCommands` 是 `available_commands_update` SSE 通知使用的相同命令快照。`availableSkills` 仅列出技能名称；客户端不应期望通过此路由获取技能主体或路径。

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

此路由是一个只读的带外快照。它有意不作为提示，可以在会话流式传输期间查询。响应仅包含来自代理、Shell 和监控任务注册表的白名单元数据；控制器、计时器、偏移量、待处理消息和原始注册表对象永远不会暴露。

由另一个子代理生成的代理任务（嵌套子代理，受 `maxSubagentDepth` 限制）包含三个可选的血统字段：`parentAgentId`（生成该任务的代理任务的 `id`）、`parentName`（生成该任务的代理的 `subagentType`，在注册时捕获，因此即使父级从注册表中被驱逐也能保留），以及 `depth`（基于 0 的启动深度；0 = 由顶层会话生成）。由顶层会话启动的代理会省略 `parentAgentId` 和 `parentName`；客户端应将这三个字段视为可选字段，并在缺失时回退到扁平列表。

### `GET /session/:id/tasks/:taskId/runtime`

单个 Shell 任务的按需详细信息。`GET /session/:id/tasks` 仅包含生命周期事实；此路由读取捕获的输出文件并探测进程树，因此打开的详情面板会单独请求这些信息。

ACP 方法是 `_qwen/session/task_runtime`，带有 `sessionId` 和 `taskId` 参数。两种传输方式都会解析活动会话所有者；ACP 还要求连接拥有该会话。

路径的 `taskId` 会根据会话自身的 Shell 注册表进行解析；调用者永远不会传递文件路径。

```json
{
  "v": 1,
  "sessionId": "<sid>",
  "taskId": "bg_0123abcd",
  "runtime": {
    "memoryBytes": 104857600,
    "outputBytes": 65536,
    "outputModifiedAt": 1700000000000,
    "outputTail": "ready in 120ms\n",
    "outputTailTruncated": true
  }
}
```

当任务未知、已被驱逐或不是 Shell 任务时，`runtime` 为 `null`。`memoryBytes` 是 Shell 进程树的常驻集，仅在任务运行时采样；共享页面每个进程只计算一次，容器沙箱可能仅暴露包装器进程。`outputTail` 的上限与完成通知使用的 8 KiB 限制相同，且 `outputTailTruncated` 标记从文件中间开始的尾部。当文件无法读取时设置 `outputError`；成功部分中的字段仍可能存在。

### `POST /session/:id/tasks/:taskId/workflow-action`

控制工作流运行，或启动新运行。ACP 方法是 `_qwen/session/tasks/workflow_action`。

```json
{
  "action": "run-script",
  "script": "export const meta = { name: 'daily-audit', description: 'Audits yesterday' }\nreturn await agent(args.question)",
  "args": { "question": "which tables grew?" },
  "sourceRef": { "id": "definition-7", "revision": "rev-3" }
}
```

`taskId` 的名称取决于操作：

| `action` | `taskId` | 启动运行 |
| ----------------------------------- | ------------------------------------------------------------------ | ---------------------- |
| `pause`, `resume`, `retry`, `rerun` | 运行 ID | `retry` 和 `rerun` 执行 |
| `delete-history` | 运行 ID | 否 |
| `run-saved` | 保存的工作流名称，扩展名为 `<extension>:<name>` | 是 |
| `run-script` | 调用者选择的启动键 | 是 |

`args`、`sourceRef` 和 `script` 仅由 `run-saved` 和 `run-script` 读取。`args` 绑定到脚本的 `args` 全局变量，可以是任何 JSON 值；`sourceRef` 是调用者自己的 `{id, revision}`，记录在运行、其日志及其快照中；`script` 是源 `run-script` 运行的内容，且为其所必需。重试或重新运行会重放原始运行自身的 `args` 和 `sourceRef` —— 这就是使其成为同一运行的原因 —— 因此这些字段与控制操作一起被忽略。

已启动的运行属于会话所有：它在后台运行而无需审批提示，其完成状态会到达会话的完成通道。之后它像任何其他运行一样是一个 `retry`/`rerun` 目标。

`retry` 和 `rerun` 也接受从历史记录恢复的运行（`GET /session/:id/tasks` 中的 `isHistorical`），例如守护进程重启中断的运行：运行从其快照的脚本、`args` 和 `sourceRef` 重新开始，并在发送操作的会话中注册并向其报告完成状态。`retry` 在相同的运行 ID 下恢复运行的日志，适用于没有进程仍在运行的 `failed` 运行；`rerun` 从任何已完成的运行开始一个新的运行 ID。携带 `argsOmitted` 的历史条目因 `args` 过大而无法保留而启动，因此这两种操作都不适用于它。在 `args` 被保留之前写入的快照也不适用，因为它既不携带 `argsOmitted` 也不携带 `argsRecorded`：运行的日志以其 `args` 的哈希值为键，因此重启一个其 `args` 无法通过历史命名的运行将不会重放任何内容并会重新调度每个代理。这两种拒绝都是 `workflow_args_unavailable`，且 `GET /session/:id/tasks` 在条目上将两者都报告为 `argsUnavailable`，以便客户端可以隐藏这两个操作，而不是通过调用发现拒绝。`argsOmitted` 作为原因保留在其旁边，供想要说明具体原因的客户端使用。`args` 本身绝不会发送到网络上。

`run-script` 不传递定义名称，因此运行由脚本自身的 `export const meta` 标记 —— 编译后的脚本应声明一个，否则运行只显示其 ID。

对于已启动的运行，响应为 `{"changed": true, "status": "running", "taskId": "<runId>"}`；对于生效的控制操作，响应为 `{"changed": true, "status": "<status>"}`；对于未发生任何情况，响应为 `{"changed": false}`：工作流对会话不可用（禁用、裸模式、不受信任文件夹）、工作区不受信任、保存的工作流名称未知、运行 ID 未知，或者在相同的 `taskId` 下已有另一个启动正在进行。仅重叠的启动会被去重：在一个 `taskId` 下的两个并发 `run-script` 调用只会启动一个运行。一旦该启动返回，键即被释放；再次提交它可以启动另一个运行，即使第一个运行仍处于活动状态。该键不提供丢失响应后的重试幂等性。

被拒绝的参数是一个 `400`（在 ACP 上为 `-32602`），而不是已启动的运行：未知的 `action`、没有 `script` 的 `run-script`、不是非空字符串的 `{id, revision}` 的 `sourceRef`，或因无效语法或确定性违规而在启动前被拒绝的脚本。工作流启动输入错误携带 `workflow_invalid_params` 并保留拒绝消息。

四种拒绝来自运行存储的状态而非请求。每种在 ACP 上都是 `-32602`，携带其 `errorKind` 和其 `data.httpStatus`。其中三种是 `409`；第四种 `workflow_not_recorded` 是 `503`，因为什么都没启动且同样的调用可以简单地再次执行：`retry` 在运行开始前记录其正在再次运行 —— 该记录可防止其他进程第二次启动它 —— 但该记录无法写入。

| `code` / `errorKind` | HTTP | 何时 | 如何处理 |
| ------------------------------ | ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| `workflow_journal_unavailable` | `409` | 一个 `retry`，其运行在磁盘上没有日志，或日志无法读取 | `rerun` 它，这会从头开始启动它 |
| `workflow_args_unavailable` | `409` | 一个标记为 `argsUnavailable` 的历史条目的 `retry` 或 `rerun`：其 `args` 太大而无法保留，或其快照早于保留它们的时间 | 使用 `run-saved` 或 `run-script` 及其 `args` 重新启动它 |
| `workflow_run_live_elsewhere` | `409` | 一个 `retry`，其检查点记录了一个尚未观察到退出的进程——仍在运行的进程、另一台机器上的进程，或 PID 已被复用的进程 | `rerun` 它，这会获取一个新的运行 ID |
| `workflow_not_recorded` | `503` | 一个 `retry`，其“运行正在再次启动”的记录无法写入，因此它未启动 | 再次执行相同的调用；运行未受影响 |

`workflowToolFeatures` 在 `GET /session/:id/supported-commands` 中宣告支持 `runSavedArgs` 和 `runScript`；不具备这些功能的守护进程既不接受启动输入，也不接受 `run-script` 操作。它还携带 `nameOnly`，当会话的模型仅可运行命名工作流时为 true（`tools.workflowNameOnly`）：模型自身的 `script` 和 `scriptPath` 调用会被拒绝，但上述所有操作（包括 `run-script`）仍可启动运行。`retryHistorical` 为 true 时表示 `retry` 和 `rerun` 接受从历史记录恢复的运行；较旧的守护进程会以 `{"changed": false}` 响应它们，因此客户端应仅在报告了该状态时，才为历史条目提供这些控件。

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

`status` 是 `NOT_STARTED`、`IN_PROGRESS`、`READY` 或 `FAILED` 之一。可选的 `error` 在服务器失败且可用时存在。禁用的 LSP（包括裸模式）返回 HTTP 200，包含 `enabled: false`、零计数以及 `servers: []`。启用 LSP 但未配置服务器时返回 `enabled: true`、`configuredServers: 0` 和 `servers: []`。如果初始化在客户端存在之前失败，响应可能包含 `initializationError`；如果活动客户端无法提供快照，响应将包含 `statusUnavailable: true`。

此路由仅暴露稳定的面向客户端字段。它有意省略调试内部信息，如进程 ID、生成参数、stderr 尾部、根 URI 和工作区文件夹路径。

### `GET /session/:id/resources`

```json
{
  "v": 1,
  "sessionId": "<sid>",
  "workspaceCwd": "/canonical/session/path",
  "skills": {
    "v": 1,
    "workspaceCwd": "/canonical/session/path",
    "initialized": true,
    "skills": []
  },
  "mcp": {
    "v": 1,
    "workspaceCwd": "/canonical/session/path",
    "initialized": true,
    "discoveryState": "completed",
    "servers": []
  }
}
```

此活动会话所有者路由通过其自身的 ACP 连接读取所选会话的配置。它不会合并进程全局或工作区级状态路由，不会初始化冷运行时，不会附加客户端，也不会回退到主工作区。未知和仅持久化的会话返回现有的 `session_not_found` 响应。

嵌套对象使用精确的 `GET /workspace/skills` 和 `GET /workspace/mcp` 状态契约。它们的 `workspaceCwd` 字段标识产生快照的配置，并与顶层值匹配。现有的脱敏规则仍然适用：MCP 凭据和标头、环境值、技能正文和原始设置绝不会出现在响应中。由于 MCP 身份验证、池、工作区预算和工作区发现错误增强功能的支持状态由工作区拥有或仅按服务器名称键控而非按会话键控，因此这些信息缺失。来自所选会话自身 MCP 管理器的状态、发现和统计信息仍然可用。

### 独立会话生命周期 (`standalone_sessions_v1`)

当 `/capabilities.features` 包含 `standalone_sessions_v1` 时，守护进程暴露一个进程全局的路由族，用于其专用 Conversations 运行时拥有的顶级独立会话。这些路由从不接受工作区选择器，也从不回退到主工作区。无法构建完整的 Conversations 所有权、运行时、目录、生命周期和删除日志依赖图的直接嵌入会省略该功能以及以下所有路由。

| 路由 | 请求 | 成功 |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST /standalone/sessions` | `{ "sessionId": "<UUID>", "modelServiceId"?: string, "startupConfig"?: { "modelServiceId": string, "reasoningEffort"?: ReasoningSelection }, "approvalMode"?: ApprovalMode }` | 返回包含独立会话、`context: { "kind": "standalone" }` 及其托管的非项目输出目录的 `200`。创建过程无提示。 |
| `GET /standalone/session-options` | 无；任何查询字段都会被拒绝并返回 400 | 返回带有 `{ v, initialized, current?, approvalMode?, providers, errors? }` 的 `200`；内部工作区路径和 ACP 通道状态被省略 |
| `GET /standalone/sessions` | 查询：`cursor?`, `size?` (1-100), `archiveState?` (`active` 或 `archived`) | `200 { sessions, nextCursor?, liveMergeFailed?, truncated? }` |
| `GET /standalone/sessions/:id` | 无 | 本地创建进行中时返回 `202 { sessionId, state: "creating" }`，否则返回包含确切摘要的 `200`。 |
| `POST /standalone/sessions/:id/load` | 仅限现有恢复选项：`historyPageSize?`, `liveReplayMode?`, `compactedReplayMode?`, `hideInheritedHistory?`, `approvalMode?`；客户端身份保留在 `X-Qwen-Client-Id` 中。 | 恢复的独立会话 `200`。 |
| `POST /standalone/sessions/:id/resume` | 与 `load` 相同的恢复选项。 | 不带历史记录重放的恢复独立会话 `200`。 |
| `POST /standalone/sessions/:id/repair-directory` | 空主体或 `{}` | 返回经过验证或重新创建的托管目录的 `200`。 |
| `PATCH /standalone/sessions/:id/metadata`        | `{ "displayName": string }`                                                                                                                                                          | `200 { sessionId, displayName }`                                                                                                               |
| `GET /standalone/sessions/:id/export` | 查询：`format=html`, `format=md`, `format=json` 或 `format=jsonl` (默认为 `html`)。 | 现有的导出内容类型、文件名和主体。 |
| `POST /standalone/sessions/archive`              | `{ "sessionIds": ["<UUID>", ...] }`                                                                                                                                                  | `200 { archived, alreadyArchived, notFound, errors }`                                                                                          |
| `POST /standalone/sessions/unarchive`            | `{ "sessionIds": ["<UUID>", ...] }`                                                                                                                                                  | `200 { unarchived, alreadyActive, notFound, errors }`                                                                                          |
| `POST /standalone/sessions/delete`               | `{ "sessionIds": ["<UUID>", ...] }`                                                                                                                                                  | `200 { removed, notFound, errors, fileCleanupPending }`                                                                                        |

当 `POST /standalone/sessions` 携带遗留的 `modelServiceId` 时，响应包含 `modelApplied`：`false` 表示启动时的模型切换失败（也通过 `model_switch_failed` 会话事件显示），且会话正在运行于代理默认模型——创建本身仍然成功，以便调用者可以显式警告、释放或重试。

主体必须是 JSON 对象，且不能包含未知字段。ID 是 RFC UUID v1-v5 值；守护进程将其规范化为小写。批量请求包含 1-100 个字符串，并在变更之前进行验证和去重。批量失败报告为 `{ sessionId, code, message }`，并且不会回滚其他 ID 上的成功操作。`fileCleanupPending` 表示转录本删除已提交，但必须通过协调重试经日志授权的边车文件或托管目录清理；会话已在逻辑上移除。

只有显式的独立转录本和记录的顶级遗留兼容形状可见。子级、Live、项目、工作树、歧义、不可读或删除日志记录会安全失败关闭。如果其 HTTP 响应断开连接，创建仍会继续；已提交的会话不会被删除，且响应客户端会被分离。通过精确的 GET 然后 load/resume 来恢复，而不是将 create 作为 attach 重试。

归档、取消归档、修复、重命名和删除共享与 load/resume 和 prompts 相同的每会话生命周期准入。删除使用转录本 unlink 作为其持久提交点，并使用私有日志和原子托管目录暂存以进行崩溃恢复。如果转录本保持完整，恢复会还原目录；如果转录本消失，则完成清理；任何不匹配的身份、冲突的路径、外部所有者或歧义的转录本都会返回结构化的安全失败关闭错误。

### `POST /session`

可选的 `startupConfig` 契约在 [Capabilities](#capabilities) 下描述。与遗留的最佳努力模型选择不同，被拒绝的启动选择会导致创建失败。

生成新代理或附加到现有代理（在 `sessionScope: 'single'` 下，默认行为）。

请求：

```json
{
  "cwd": "/absolute/path/to/workspace",
  "modelServiceId": "qwen-prod",
  "sessionId": "550e8400-e29b-41d4-a716-446655440000",
  "sessionScope": "thread",
  "worktree": { "slug": "feature-a" }
}
```

| 字段 | 必需 | 备注 |
| ---------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `cwd` | 否 | 匹配一个注册工作区的绝对路径。如果省略，路由回退到主工作区（从 `/capabilities.workspaceCwd` 读取）。不匹配的非空 `cwd` 返回 `400 workspace_mismatch`。当 `features` 包含 `multi_workspace_sessions` 时，客户端可以传递任何受信任的 `workspaces[].cwd`；否则只接受主工作区。工作区路径通过 `realpathSync.native` 进行规范化（对于不存在的路径有仅解析的回退方案），因此不区分大小写的文件系统不会因拼写差异而拒绝会话。 |
| `modelServiceId` | 否 | 选择代理将通过哪个配置的 _模型服务_ 进行路由（后端提供商——Alibaba ModelStudio, OpenRouter 等）。如果省略，代理使用其默认值。如果工作区已有会话，这会在现有会话上调用 `setSessionModel` 并广播 `model_switched`。这与 `POST /session/:id/model` 上的 `modelId` 不同，后者选择在已绑定服务**内部**的模型。`/capabilities` 上的 `modelServices` 数组保留用于广告配置的服务；在第 1 阶段，它始终是 `[]`（使用代理的默认服务且不通过 HTTP 枚举）。 |
| `startupConfig` | 否 | `{ modelServiceId: string, reasoningEffort?: ReasoningSelection }`；需要 `session_startup_config`，创建一个新线程并确认请求的选择而不写入共享默认值。不能与顶层 `modelServiceId` 或显式单作用域混合。 |
| `sessionId` | 否 | 由调用者选择的 RFC 变体 UUID v1-v5。守护进程将其规范化为小写，并始终创建一个新的线程会话；它从不将此字段视为幂等的附加。发送前请确认 `caps.features` 包含 `session_id_override`，因为较旧的守护进程可能会忽略未知字段。`null` 等同于省略。 |
| `sessionScope` | 否 | 针对单次请求的会话共享覆盖设置。`'single'`（守护进程全局默认值）使同一工作区的第二个 `POST /session` 复用现有会话（`attached: true`）；`'thread'` 强制每次调用创建全新的独立会话。省略此字段则继承守护进程全局默认值。超出枚举范围的值将返回 `400 { code: 'invalid_session_scope' }`。旧版守护进程（#4175 PR 5 之前版本）会静默忽略该字段——发送前请预检 `caps.features.session_scope_override`。目前生产环境中，守护进程全局默认值硬编码为 `'single'`；#4175 可能在后续更新中添加 `--sessionScope` CLI 标志。 |
| `worktree` | 否 | 在用户命名的 Git worktree 中创建新的线程会话。可选的 `slug` 使用守护进程的 worktree 名称验证规则。预检 `session_worktree_persistence_v1`；客户端不得从较旧的 worktree 格式响应中推断持久隔离性。Worktree 创建不是附加操作，不能与分支创建组合使用。仅在重定位、独占所有权标记创建、边车持久化以及最终运行时生成检查完成后，路由才返回成功。 |

响应：

```json
{
  "sessionId": "<uuid>",
  "workspaceCwd": "/canonical/path",
  "attached": false,
  "worktree": {
    "slug": "feature-a",
    "path": "/canonical/path/.qwen/worktrees/feature-a",
    "branch": "worktree-feature-a"
  },
  "worktreeState": "persisted-v1"
}
```

`attached: true` 表示该工作区的会话已存在，您现在正在共享它。

`worktreeState` 仅存在于经过认证的 worktree 会话中。遗留的最佳努力恢复可能会返回 `worktree` 而不包含 `worktreeState`。冷启动 Part 4A 恢复若触发而非暂存了恢复提示（`suppressWorktreeContextRestore` 关闭，因此路由要求桥接器不延迟），也会返回未验证的 `worktree` 元数据直到提示结束：子进程读取活动状态但未报告 cwd，在活动提示下无法进行重定位，且路由保留会话而不是杀死调用者刚刚恢复的那个会话。这两种响应都不是持久的执行根证明。请求 worktree 隔离的客户端必须在路由提示前要求 `worktreeState: "persisted-v1"` 和预期的规范路径；初始加载可在活动提示结束后重试。在 SDK 重新连接时，结果取决于响应是否仍携带 `worktree` 元数据：携带该元数据但缺少认证或路径发生变化的响应对该客户端而言是终止性的——新附件被分离且提示不会重试——而完全没有 `worktree` 对象的响应则会自愈：客户端丢弃其缓存的 worktree 声明，保留新附件，并在同一次调用中重试提示。自愈不会阻止该重试，因此一个回合仍可能在客户端无法再认证的目录中执行（客户端从未见过的 `exit_worktree` 是常见原因，且客户端无法将其与清除的内存关联区分开来）。因此，感知隔离的调用者在分发提示前必须自行重新验证 worktree 认证；丢弃的声明只会导致该调用者在其下一个加载或选择步骤中的自身身份门控处失败关闭。

调用者提供的 ID 在所有当前注册的工作区运行时和每个仍然存活的桥接器代次中都是唯一的，包括正在排空的替换实例。重复的活动、待处理、活跃、归档或基于 worktree 的会话将返回 `409 session_id_conflict`。无效值返回 `400 invalid_session_id`；不可用的活动所有者或持久化状态检查返回可重试的 `503 session_id_admission_unavailable`。在桥接器或存储健康状态变化后，使用有界退避策略重试；`retryable` 意味着再次尝试是安全的，并不意味着立即重试会成功。如果下游代理返回不同的 ID，守护进程会移除该孤立会话并返回 `500 session_id_not_honored`。在出现歧义响应后，应加载或恢复已知 ID，而不是将创建作为附加操作进行重试。

希望进行独立对话的多客户端集成应在每个 `POST /session` 上发送 `sessionScope: "thread"`。仅当客户端有意共享一个协作会话时，才使用默认的 `single` 范围；共享会话通过单个 FIFO 序列化提示，可通过 `/daemon/status` 中的 `runtime.activity.pendingPrompts` 和 `runtime.activity.queuedPrompts` 观察到。

对同一工作区的并发 `POST /session` 调用会被**合并**为一次生成——两个调用者获得相同的 `sessionId`，恰好有一个报告 `attached: false`。如果底层生成失败（初始化超时、格式错误的代理输出、OOM），**所有合并的调用者都会收到相同的错误**——飞行中的槽位被清除，以便后续调用可以从头开始重试。

> ⚠️ **在全新会话上拒绝 `modelServiceId` 在 HTTP 响应中是静默的。** 错误的 `modelServiceId`（拼写错误、未配置的服务）不会导致创建请求返回 500 — 会话保持在代理默认模型上运行，以便调用者仍能获得一个 `sessionId`，从而可以重试模型切换（通过 `POST /session/:id/model`）。可见的失败信号是会话 SSE 流上的 `model_switch_failed` 事件，在生成握手和首次订阅之间触发。**需要观察此事件的订阅者应在其首次 `GET /session/:id/events` 时传递 `Last-Event-ID: 0`**，以从环形缓冲区中最旧可用事件开始重放（即使订阅在创建响应后几毫秒到达，也能覆盖生成时的 `model_switch_failed`）。

### `GET /session/:id/status`

从拥有该会话的运行时返回实时摘要。此路由不加载仅持久化的会话，也绝不回退到主运行时。预检 `caps.features.session_status`。

```json
{
  "sessionId": "<sid>",
  "workspaceCwd": "/canonical/path",
  "createdAt": "2026-09-10T08:00:00.000Z",
  "clientCount": 1,
  "hasActivePrompt": true,
  "isWaitingForPermission": false,
  "isWaitingForUserQuestion": false,
  "pendingInteractionCount": 0,
  "pendingInteractions": []
}
```

响应是 `DaemonSessionSummary` 线格式。可选字段包括显示和源元数据、`activeWorkState`、`updatedAt`、`turnError`、工作树或分支元数据以及 PR 绑定。`404` 表示不存在活动所有者；正在引导、排空或不可用的所有者会返回 `503` 而不是回退。不受信任的非主所有者返回 `403 untrusted_workspace`，而在多个工作区中存在的 ID 返回 `500 ambiguous_session_owner`。TypeScript SDK 方法是 `sessionStatus()`。

### ACP `session/new` 调用者提供的 ID

ACP 客户端通过扩展元数据字段请求相同的行为：

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

响应包含规范化的小写 ID。主挂载和工作区限定的 ACP 挂载与 REST 共享准入控制，包括 `session/load` 和 `session/resume`。无效的 ID 使用 ACP `INVALID_PARAMS` 配合 `data.httpStatus=400` 和 `data.errorKind="invalid_session_id"`；冲突使用 `data.httpStatus=409`；不可用的活动所有者或持久化状态检查使用 `data.httpStatus=503` 和 `data.retryable=true`。

由 ACP 创建的会话若从未收到提示词，则不会留下持久化痕迹，守护进程会在其所属连接关闭且无附加会话时回收它。回收后，相同的 ID 可以再次创建——这是连接生命周期问题，而非 ID 重用：只要连接（或任何附加项）处于活动状态，准入检查就会拒绝重复请求。

### `POST /session/:id/load`

`liveReplayMode` 和 `compactedReplayMode` 接受 `full`（默认）或 `summary`。它们分别投影 `liveJournal` 和 `compactedReplay`，而不改变存储的历史记录。页面选择在过滤之前进行，因此可见项目可能少于 `historyPageSize`。无效值返回 `400 invalid_live_replay_mode` 或 `400 invalid_compacted_replay_mode`。独立加载接受这两个选项，但将无效值报告为 `400 invalid_request`。

通过 id 恢复持久化的 ACP 会话，并通过 SSE 重放其历史记录。路径中的 id 具有权威性；正文中的任何 `sessionId` 字段均被忽略。预检 `caps.features.session_load` —— 较旧的守护进程对此路由返回 `404`。

请求：

```json
{
  "cwd": "/absolute/path/to/workspace"
}
```

| 字段 | 必填 | 备注 |
| ----- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `cwd` | 否 | 与 `POST /session` 采用相同的规范化规则，但在恢复操作中有更严格的缺失契约：显式指定 `cwd` 但注册表中没有条目（已移除或从未注册）时返回 `404 workspace_not_found` —— 这是一种永久缺失，调用方可以将其归类为“已消失”；而工作区条目存在但处于可逆状态（正在排空、转换中、阻塞中）时仍返回 `400 workspace_mismatch`。省略此参数以继承 `/capabilities.workspaceCwd`。当 `features` 包含 `multi_workspace_sessions` 时，调用方可以传递任何受信任的已注册 `workspaces[].cwd`；不受信任的非主要工作区返回 `403 untrusted_workspace`。此处有意不接受 `mcpServers` —— 守护进程范围的 MCP 由设置驱动（匹配 `POST /session`）。 |

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

`state` 镜像了 ACP 的 `LoadSessionResponse` —— `models` 是一个 `SessionModelState`，`modes` 是一个 `SessionModeState`，`configOptions` 是 `SessionConfigOption` 的数组。缺失字段由代理决定。后来的附加者（下面的 `attached: true` 路径）会获得与原始加载调用者看到的相同的 `state` 快照 —— 守护进程在条目上缓存该快照；运行时变更（例如 `model_switched`）通过 SSE 流传递，而不是在后续的附加响应中传递。

`attached: true` 意味着会话已经处于活动状态（要么来自之前的 `session/load`/`session/resume`，要么因为合并的并发调用者刚好抢先一步）。

当持久化会话拥有 Part 4A 工作树时，load/resume 会验证其 sidecar、规范包含关系以及精确的检出标记。空闲子进程会在响应前被重新定位；活跃子进程仅在其报告的 cwd 已经等于工作树时才被证实，而报告的 cwd 缺失或在其他位置的活跃子进程会失败关闭，而不是在其提示词下被移动——除了无法延迟其恢复提示词的冷恢复（`suppressWorktreeContextRestore` 关闭——任何有效源非 Channel 拥有的恢复——或不支持延迟 API 的桥接器）：这种形状仍然返回 `worktree` 而没有 `worktreeState`，未重新定位，且会话存活。重新定位和已证实的响应返回 `worktree` 加上 `worktreeState: "persisted-v1"`。恢复侧的类型化 409 分类（由 `session_worktree_reset_v1` 通告）：当会话的 sidecar 携带 `supersededBy` 链接时为 `worktree_session_superseded` —— 分类仅读取该链接，在每个检出的所有权锁下且在读取任何标记之前，因此如果在 load 等待期间回滚传输，不能将调用者重定向到同一守护进程正在删除的会话；不过，链接是在标记翻转之前写入的，因此正文中的 `replacementSessionId` 是一个需要验证的重定向，而不是所有权已转移的证明：在提交后的传输中，调用者应改为加载该 id 并更新其记账，但在提交前的中断状态下，它命名了一个不是标记所有者的替换项，其自身的恢复返回 `worktree_reset_interrupted`，并且重试的重置随后会回收它——因此在成功加载之前，不得将 `replacementSessionId` 作为任务的会话 id 持久化；当恢复会话的 `supersedes` 链接与命名会话的 `supersededBy` 链接一致但标记从未移动或缺失时为 `worktree_reset_interrupted` —— 之前的重置在传输中途崩溃，重试的重置即为修复；当检出标记缺失且没有该一致链接对时为 `worktree_marker_missing` —— 重置任务即为修复，因为没有恢复路径会重建标记，且恢复重试会返回相同的 409。首先检查中断分类，因此一致的链接对永远不会显示为 `worktree_marker_missing`。每当有效的恢复源由 Channel 拥有时，路由会抑制代理针对 Part 4A 或不可分类 sidecar 状态的最佳努力清理，从而保留陈旧、外部、模糊或所有权不匹配的持久化状态并使请求失败。持久化源元数据优先；当缺失时，load/resume 请求提供有效源。结构上有效但没有 Part 4A `workspaceCwd` 字段的遗留 sidecar 保留现有的最佳努力代理恢复，可能被该路径清理，并可能返回 `worktree` 而没有 `worktreeState`；客户端不得从该兼容性元数据推断隔离性。除了该显式的遗留兼容性情况外，只有有效恢复源非 Channel 拥有的会话才会在路由验证前保留现有的最佳努力清理。缺失的 sidecar 不会返回工作树证明；感知隔离的客户端必须拒绝该响应，而不是将会话重新绑定到共享工作区。

**通过 SSE 进行历史重放。** 当 `loadSession` 在代理端处于进行中状态时，代理可能会为已持久化的轮次发出 `session_update` 通知，或在响应元数据中返回批量重放更新。守护进程会在路由响应返回之前，将这些事件种子化到会话的有界重放快照窗口中。对于实时会话，`POST /session/:id/load` 仅承诺该有界窗口（`compactedReplay`、`liveJournal`、可选的 `lifecycleReplay`、`lastEventId`），而非完整转录记录。当空闲的实时会话从有界的持久化页面刷新时，`lifecycleReplay` 会使用最多 1024 个仅包含元数据的 `session_update` 帧来补充该页面，这些帧携带来自内存窗口的 `_meta.executionLifecycle` 或 `_meta.toolLifecycle`。补充内容可能与持久化的生命周期记录重叠；客户端必须幂等地对其进行归约，且不得推断重放的启动项仍在运行。`lifecycleReplayIncomplete: true` 报告不可用、降级或截断的内存覆盖情况；`false` 不承诺完整的转录记录。这些可选字段并非单独持久化的存储，较旧的守护进程可能会省略它们。该窗口受 `--compacted-replay-max-bytes` 字节上限限制（默认 4 MiB，最大 256 MiB）；如果较旧的重放条目被丢弃，`compactedReplay[0]` 是一个无 ID 的 `history_truncated` 标记。进行中的 `liveJournal` 分别受 `--max-journal-events`（默认 10,000 个重放条目）和 `--max-journal-bytes`（默认 8 MiB 序列化源事件）的限制。这些是每会话的 **基线** 上限。当进行中的轮次超出这些限制时，守护进程首先尝试自适应增长：它将向双倍方向提升该会话的上限（直至每会话 256 MiB 的硬性上限，条目按比例缩放，并受剩余池余量的限制），同时所有实时会话的增长总和需适应一个守护进程范围的池，该池大小为守护进程有效内存预算的 5% —— 即传入时的 `--memory-budget-mb` 值，受解析后的可用内存限制，否则为自动检测内存的 50% —— 上限为 `1024` MB。核算范围是整个守护进程 —— 多工作区守护进程每个工作区运行一个桥接器，它们共享同一个池。增长按需发生，且仅在池允许的范围内；操作员固定的 `--max-journal-events` 或 `--max-journal-bytes` 会禁用此功能，有效预算低于 1024 MB 最小值的主机也会禁用此功能（`insufficientMemory`）：此时池为 0，自适应增长完全禁用。连续的兼容 `agent_message_chunk` 或 `agent_thought_chunk` 源事件共享一个重放条目，每个条目最多包含 256 个源事件，同时工具、归属、来源和离散消息边界保持不变。当日志在池允许的增长后仍超过其（可能已增长的）上限时——包括未授予余量或授予仅覆盖部分超额的情况——最旧的条目将被整体丢弃（因此保留的尾部可能远小于字节上限），并前置一个带有 `scope: 'live_journal'` 的 `history_truncated` 标记；其 `truncatedEvents` 和 `retainedEvents` 字段统计的是源事件数量，而非重放条目数量，其 `maxBytes` / `maxEvents` 反映当前生效的上限（可能已经增长）。客户端应将该标记渲染为状态并继续应用保留的事件。完整的持久化转录访问权限通过 `GET /session/:id/transcript` 单独暴露。

重放窗口的字节上限适用于子进程重建持久化转录记录之后；它们不会限制磁盘上的 JSONL 读取。超出守护进程预算的恢复操作将返回 `504`，其中包含源自恢复预算（钳制在 5-120s）的 `Retry-After` 以及 `{code: "session_restore_timeout", errorKind: "restore_timeout", retryable: true, sessionId, action, timeoutMs}`。守护进程会对仍在运行的 ACP 请求设置栅栏，并清理任何迟到的会话，而不是注册它。针对同一 ID 的重试将返回 `409 restore_in_progress`，其中包含 `reason: "awaiting_abandoned_cleanup"` 和源自恢复预算（钳制在 5-120s）的 `Retry-After`，直到该清理完成为止。如果迟到的恢复清理不确定，或者被放弃的恢复在其截止时间后仍未在一个完整的恢复预算内完成，则该工作区上的新会话将返回 `503 acp_channel_unavailable`，其中包含 `reason: "restore_cleanup_failed"` 或 `"restore_settlement_overdue"`。超时的会话初始化遵循相同的失败关闭准入策略，以应对迟到完成的旧版 ACP 子进程：不确定的清理返回 `reason: "new_session_cleanup_failed"`，而再经过一个初始化预算仍未完成的请求返回 `reason: "new_session_settlement_overdue"`。结算逾期状态会在迟到失败完成后立即清除，或在迟到成功完成其精确 ID 清理后清除；不确定的清理则转换为相应的清理失败状态。清理失败状态持续存在，直到工作区通道排空并被回收。在这两种情况下，已活跃的会话仍然可用。

**错误：**

- `404` — 持久化会话 ID 不存在（`SessionNotFoundError`）。
- `404` — 当显式的 `cwd` 完全没有注册表条目时（已移除或从未注册）返回 `workspace_not_found`：这是一种永久性缺失，不同于下面的可逆状态。正文：`{ error, code: "workspace_not_found", boundWorkspace, requestedWorkspace }` — 没有 `workspaceCount`。读取过“404 意味着会话已消失”这一旧契约的客户端应将此代码视为可以绕过的路由故障（例如重新注册工作区），而不是会话已被删除的证据。
- `400` — `workspace_mismatch`（与 `POST /session` 形状相同），包括可逆的生命周期状态：注册表条目存在但正在排空、转换或被阻塞的工作区。待工作区稳定后重试；不要将其归类为已消失。
- `403` — 当 `cwd` 指向非主工作区的不可信目标时返回 `untrusted_workspace`。
- `503` — `session_limit_exceeded`（计入 `--max-sessions`；进行中的恢复也会被计算在内）。
- `504` — `session_restore_timeout`；可重试，包含源自恢复预算（钳制在 5-120s）的 `Retry-After`，因为同一会话 ID 会被设置栅栏，直到迟到的清理完成。
- `504` — `init_timeout`；不可重试，没有 `Retry-After`，没有 `sideEffectPossible`，没有安装栅栏。当通道初始化在恢复请求分发之前超时（`ensureChannel` 阶段）时发出；恢复从未尝试过，因此没有会话 ID 被设置栅栏，也没有待处理的清理。
- `503` — `acp_channel_unavailable`，当工作区通道因新的会话工作而关闭时。`reason` 说明了原因：`restore_cleanup_failed` 当无法确定性地清理被放弃的恢复操作时；`restore_settlement_overdue` 当被放弃的恢复操作在截止日期后仍未在一个完整的恢复预算内完成结算时；`new_session_cleanup_failed` 当在公共初始化超时之后创建的会话无法被确定性地关闭时；或者 `new_session_settlement_overdue` 当超时的初始化在截止日期后仍未在一个额外的初始化预算内完成结算时。现有会话仍然可用。在具有多个执行引擎的工作区运行时中，这些隔离措施会针对该引擎的通道生效：其会话也不会接受新工作（提示、继续、侧请求、shell 命令、回合中消息以及 Goal 或工作流启动都会返回相同的 `503`），已结算的会话会被关闭，并且该引擎的新建会话在该通道的进程树消失之前仍会被拒绝，在此期间若无法确认则显示 `channel_exit_unverified`。在那里，`workspace_change_unacknowledged` 意味着通道未确认影响会话的工作区变更（权限规则、设置重新加载、Session Workflow 门控、模型提供商或 Skills）；对每个缺失变更的迟到确认会提前结束该隔离状态。逾期结算状态会在迟到的失败结算或迟到的成功完成其精确 ID 清理后清除；不确定的清理会转换为匹配的清理失败状态，这需要工作区通道排空并回收。响应体包含 `retryAfterSeconds`，标头包含匹配的基于预算的 `Retry-After`，以便客户端使用操作预算规模的退避策略，而不是以普通的 5 秒节奏进行轮询。
- `409` — `restore_in_progress`（相同 id 的 `session/resume` 已在进行中，或者新的生成提供了由恢复拥有的 id）。在恢复活动期间为 `Retry-After: 5`；一旦它被隔离为 `awaiting_abandoned_cleanup`，则为基于预算的提示。相同操作的竞争（两个并发的针对相同 id 的 `session/load`）会合并——恰好一个返回 `attached: false`，其余返回带有相同 `state` 的 `attached: true`。
- `409` — `session_workspace_conflict`，当相同的会话 id 已由另一个工作区运行时处于活动状态或正在恢复时。
- `409` — `session_archived`，当 id 仅存在于 `chats/archive/` 下时；在 `load` 或 `resume` 之前调用 `POST /sessions/unarchive`。
- `409` — `session_archiving`，当针对相同 id 的归档或取消归档正在进行时。`Retry-After: 5`。
- `409` — `session_conflict`，当 id 同时存在于 `chats/` 和 `chats/archive/` 中时；在加载之前使用 `POST /sessions/delete` 删除会话。

### `GET /session/:id/transcript`

返回一页从活动持久化 JSONL 转录本重建的无 id `session_update` 重放帧。预检 `caps.features.session_transcript` — 较旧的守护进程对此路由返回 `404`。

查询参数：

| 字段 | 必需 | 备注 |
| --------------------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `cursor` | 否 | 上一页返回的不透明 base64url 游标。第一页省略此参数。游标由守护进程签发并经过篡改检查；修改它会返回 `400 invalid_transcript_cursor`。它绑定到转录本文件标识和冻结的第一页字节大小；删除、截断、替换或归档文件会使游标失效并返回 `409`。 |
| `limit` | 否 | 页面中活动 `ChatRecord` 的目标数量。默认为 `100`，最大值为 `500`。向后翻页可能会扩展至最多 `3 * limit` 条记录，以保留回合和工具调用/结果的边界。一条记录可以产生多个重放帧，因此 `events.length` 可能更大。无效值将返回 `400 invalid_transcript_limit`。 |
| `direction` | 否 | 唯一可接受的值是 `backward`，它从最新的记录开始分页。在第一页向前翻页时省略此参数，或在继续 `cursor` 中冻结的方向时也省略此参数。不能与 `cursor`、`beforeRecordId`、`atRecordId` 或 `snapshot` 组合使用。 |
| `beforeRecordId` | 否 | 在此记录 id 之前开始向后翻页。隐含向后方向，因此不要同时发送 `direction`。不能与 `cursor` 或 `atRecordId` 组合使用；可以与 `snapshot` 配对使用。 |
| `compactedReplayMode` | 否 | `full`（默认）或 `summary`。在页面选择后投影 `events`，因此可见计数可能小于 `limit`。不会改变存储的历史记录或游标选择。工作区限定的转录本路由也接受此参数。无效值将返回 `400 invalid_compacted_replay_mode`。 |

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

`events` 仅为重放帧：`{ v: 1, type: "session_update", data: SessionUpdate }`。它们不携带 EventBus id，且响应从不包含 `lastEventId`。调用此路由不会调用 `/load`、附加客户端、种子化实时 EventBus、创建实时会话或更改当前实时重放窗口。活动和空闲的活动会话均由子端只读状态方法重建，以便重放使用相同的工作区设置、运行时输出目录、发射器和 `/load` 历史语义，而不会修改守护进程会话状态。

第一页冻结当前的 JSONL 快照大小。后续页面仅读取该字节前缀，因此第 1 页之后的追加内容不会改变结果集。如果文件消失、被截断至低于冻结大小、被替换为不同的 inode 或被移动到归档，下一页将返回 `409`，客户端应从第 1 页重新开始或要求用户重新打开转录本。

为了保护守护进程的内存和延迟，超过转录本索引上限的快照会在守护进程扫描 JSONL 之前失败。客户端收到 `413 transcript_too_large`，应回退到导出/离线处理或要求用户缩短/归档较旧的历史记录。

如果重放转换在产生一些帧后失败，可能会出现 `partial: true` 和 `replayError`。部分响应从不包含 `nextCursor`，因此客户端不能静默地翻过那些未被转换的记录。

**错误：**

- `400` — 无效的 `limit`、`cursor`、`direction`、`beforeRecordId` 或会话 id 格式。分页参数互斥：`cursor` 不能与 `beforeRecordId`、`atRecordId` 或 `snapshot` 组合使用；`snapshot` 需要 `atRecordId` 或 `beforeRecordId`；`atRecordId` 需要 `snapshot`；且 `backward` 不能与游标或任何记录锚点组合使用。
- `404` — 在第一页请求中，活动持久化会话 id 不存在。
- `409` — `session_archived`、`session_archiving` 或 `session_conflict`，来自与 `/load` 相同的可加载性检查。
- `409` — 由于文件在游标签发后被删除、截断、替换或归档，导致转录本快照不可用；当预检无法再找到游标请求的活动文件时，这也适用。
- `413` — `transcript_too_large`，当冻结的转录本快照超过守护进程索引上限时。
- `413` — `transcript_page_too_large`，当一个聚合记录超过工作区限定页面预算或序列化页面超过其响应预算时。

### `GET /session/:id/export`

下载主工作区的活动持久化会话转录本。可选的 `format` 查询是 `html`（默认）、`md`、`json` 或 `jsonl`。预检 `caps.features.session_export`。

成功响应是带有经过清理的文件名、`Cache-Control: no-store` 和 `X-Content-Type-Options: nosniff` 的附件。内容类型根据所选格式为 `text/html`、`text/markdown`、`application/json` 或 `application/jsonl`。此路由仅读取持久化存储：它不解析活动所有者，不启动 ACP，也不附加客户端。当目标可能位于非主工作区时，请使用下面的工作区限定路由。无效格式返回 `400 invalid_export_format`；缺少活动会话返回 `404`；归档、过渡中或冲突的存储返回 `409`。TypeScript SDK 方法是 `exportSession()`。

### `GET /workspaces/:workspace/session/:id/transcript`

从所选注册工作区的活动持久化 JSONL 中返回与单数路由相同的 `DaemonSessionTranscriptPage` 投影。预检 `workspace_persisted_transcript`；此功能独立于 `multi_workspace_sessions`，适用于通过 id 或 cwd 选定的可信单工作区主运行时。

选择器和查询参数遵循现有的复数工作区和转录规则。可信的主和次运行时以及不可信的次运行时可以读取。不可信的主运行时返回 `403 untrusted_workspace`。不返回已归档内容。

对于此工作区限定路由，`limit` 是前向页面的最大记录数。后向页面最多可扩展至 `3 * limit` 条记录，以保持轮次和工具调用/结果对完整。页面可能在 4 MiB 持久化源预算处提前停止并返回续接游标。序列化响应上限为 32 MiB，游标上限为 64 KiB。如果重放状态将超过游标上限，则页面返回其成功转换的事件，包含 `partial: true`、`hasMore: false` 且无 `nextCursor`。

前向页面和游标页面完全在守护进程内实现。活动会话的后向首页首先跨越一个单记录的工作区桥接刷新屏障，以确保持久化尾部是最新的；该屏障可能会启动 ACP 并加载工作区设置。持久化页面读取本身不会解析项目定义的代理或技能，也不会创建/修复 `session-transcript-cursor-key`。工具帧使用持久化的工具名称和描述，而无需咨询运行时工具注册表。其 HMAC 游标密钥仅存在于守护进程内存中，按工作区隔离，并在重启时轮换；来自先前守护进程的游标返回 `400 invalid_transcript_cursor`。

### `GET /workspaces/:workspace/session/:id/export`

将所选注册工作区的活动持久化会话导出为附件。预检 `workspace_session_export`；不要根据 `session_export` 或 `workspace_qualified_rest_core` 推断支持情况。选择器首先解析为精确的工作区 id，然后在规范化后解析为 URL 编码的绝对 cwd。主和次运行时都必须可信。不可信运行时在会话或格式验证之前返回 `403 untrusted_workspace`。

可选的 `format` 查询为 `html`（默认）、`md`、`json` 或 `jsonl`。正文、MIME 类型、文件名清理、`Cache-Control: no-store`、`X-Content-Type-Options: nosniff` 和附件处置与 `GET /session/:id/export` 匹配。遗留路由仍绑定到主存储。

复数路由仅在现有共享归档协调器下读取所选工作区的活动持久化 JSONL。它不扫描其他工作区存储，不回退到主存储，不解析活动所有者，不调用工作区桥接，不启动 ACP，不附加客户端，也不加载设置。仅存在于另一个工作区中的会话 id 返回 `404 { code: "session_not_found" }`；已归档会话返回 `409 session_archived`。无效格式返回 `400 invalid_export_format`，存储竞争保留现有的 `session_archiving` 和 `session_conflict` 错误。

### `GET /workspaces/:workspace/session/:id/archive/export`

将所选注册工作区的已归档持久化会话导出为附件。预检 `workspace_archived_session_export`；无法从活动导出或复数核心功能推断支持情况。工作区选择器解析和信任检查在会话 id 和格式验证之前运行。

TypeScript SDK 调用者使用 `WorkspaceDaemonClient.exportArchivedSession(sessionId, options)`。该方法始终使用原生 REST 并返回现有的 `DaemonSessionExportResult` 附件投影。

可选的 `format` 查询、响应正文、MIME 类型、清理后的文件名、缓存策略、安全标头和附件处置与活动工作区导出相同。已归档源 JSONL 在重建前限制为 256 MiB；较大的文件返回 `413 transcript_too_large`，包含 `sessionId`、`snapshotSize` 和 `maxBytes`。活动导出保持其现有的大小行为。

该路由仅在共享归档协调器租约下读取所选可信工作区中的 `chats/archive/<id>.jsonl`。它不检查活动内容以进行回退，不扫描另一个工作区，不解析活动所有者，不调用桥接，不启动 ACP，不附加客户端，也不加载设置。仅活动的 id 返回 `409 { code: "session_not_archived" }`；缺失的 id 返回 `404 { code: "session_not_found" }`；同时存在的活动和已归档文件返回 `409 session_conflict`；归档转换返回 `409 session_archiving`，包含 `Retry-After: 5`。

### `POST /session/:id/resume`

通过 id 恢复持久化 ACP 会话，但不通过 SSE 重放历史记录。模型上下文在代理端内部恢复（通过 `geminiClient.initialize` 读取 `config.getResumedSessionData`）；SSE 流对于已经渲染了历史记录的客户端保持干净。预检 `caps.features.session_resume`；`unstable_session_resume` 仍然是旧客户端的弃用兼容性别名。

接受与 `/load` 相同的 `cwd`、`approvalMode`、`sourceType` 和 `sourceId` 字段。此处不解析、验证或转发仅用于加载重放的字段 `historyPageSize`、`liveReplayMode` 和 `compactedReplayMode` —— 它们会被静默忽略，以匹配已发布的恢复请求架构。响应结构相同 —— `state` 镜像了 ACP 的 `ResumeSessionResponse`。错误封装也相同，包括 `409 restore_in_progress`（当有 `session/load` 正在处理时触发；另一个 `session/resume` 后面紧跟着的 `session/resume` 会合并）。

当客户端没有渲染历史记录时（冷重连、选择器 → 打开），使用 `/load`。当客户端屏幕上已有轮次且只需要取回守护进程端的句柄时，使用 `/resume`。

> ⚠️ **为什么仍然宣传 `unstable_session_resume`？** 守护进程的 HTTP 路由和 `session_resume` 功能在 v1 中保持稳定，但桥接仍然调用 ACP 的 `connection.unstable_resumeSession`。旧标签仅保留以便在 `session_resume` 之前发布的 SDK 可以继续工作。

### `POST /session/:id/worktree-reset`

将持久化的 Part 4A worktree 会话的检出所有权转移给一个新的替换会话。预检 `session_worktree_reset_v1` — 较旧的守护进程对此路由返回 `404`。该路由是 Channel 命名任务 `/clear` 在不丢弃文件的情况下重置 worktree 任务的方式：替换会话获得全新的对话，而被取代的会话在目录中保留其转录记录，但永远无法再次恢复。

请求体（所有字段均为可选）：

```json
{
  "cwd": "/canonical/path",
  "modelServiceId": "service-id",
  "approvalMode": "plan",
  "sourceType": "channel",
  "sourceId": "dingtalk-main"
}
```

`cwd` 遵循与 `POST /session/:id/load` 相同的解析规则，对于守护进程的主工作区可以省略。元数据字段使用与创建 worktree 时相同的线程范围和源约定来标记替换会话。

成功时，该路由返回 `200` 以及替换会话的创建形状响应 — 新的 `sessionId`、`workspaceCwd`、`currentCwd` 等于验证后的规范 worktree 路径、`worktree` 元数据和 `worktreeState: "persisted-v1"`。调用方应丢弃对旧 ID 的句柄，并从那时起使用替换 ID；旧 ID 后续的恢复操作会返回带有 `replacementSessionId` 的 `worktree_session_superseded`，客户端也可以利用这一点来自愈过时的簿记 — 但仅在该 ID 加载成功后才有效。分类仅根据 sidecar 链接决定，且该链接在标记翻转之前写入，因此中断的预提交转移会交还一个并非标记所有者的替换会话，其自身的恢复操作会返回 `worktree_reset_interrupted`，而重试的重置则会将其回收。

此路由从不读取 `X-Qwen-Client-Id`，因此替换会话以未附加状态生成 — 但成功响应并非无需注册。新的转移会为那次生成铸造一个所有者风格的 `clientId`，在替换会话上注册它，并在正文中报告；已提交转移的幂等恢复则不报告任何内容。铸造的 ID 不是附加项（替换会话的附加计数保持不变，因此带有 `requireZeroAttaches` 的 `killSession` 仍视其为未附加），但活跃的客户端注册正是阻止守护进程空闲清理的关键：如果你不再继续使用某个 ID，请将其分离，否则替换会话将无限期保持活跃 — 而一个仍然活跃但没有标记的替换会话是后续重置拒绝拆除的形状。请将响应视为替换会话的身份标识，并在需要注册客户端时通过正常的 `POST /session/:id/load` 或 `/resume` 接口进行附加。

转移针对每个检出相对于 worktree 恢复和其他重置进行序列化，当任一会话繁忙（提示词正在处理或存在待处理的交互）时拒绝运行，并在被取代的会话上设置准入屏障：当屏障激活时，九个写入器在准入阶段会被 `worktree_reset_active` 拒绝 — `POST /session/:id/prompt`、`/rewind`、`/cd`、`/branch`、`/fork`、`/shell`、`/goal`、`/tasks/:taskId/workflow-action` 和 `/messages/delete`。其他八个被隔离是因为它们要么移动会话的工作目录，要么在其中启动工作而不经过提示词准入：shell 命令在会话的有效工作目录中运行，对于迁移后的 worktree 会话而言即为检出本身；fork agent 在该工作目录中运行其工具；rewind 相对于该目录恢复文件；cd 移动该目录，包括进入检出的子目录；branch 修改被取代会话的持久化历史，并在所有权变动期间派生新会话；goal `resume` 提升队列中的轮次并排队继续执行；消息删除重写持久化历史；workflow action 通过会话自己的工具注册表运行保存的工作流或调用者提供的脚本，或重启活动运行。`POST /session/:id/continue` 不是第十个门控：它驱动已接受的继续执行通过被隔离的提示词准入，并在那里被拒绝。该列表构成了整个隔离机制，但隔离机制并非涵盖所有到达子会话的操作 — 释放和停止路径在设计上允许在转移过程中使用（取消任务、清除目标、分离客户端、终止会话），并且守护进程内部的后台通知入队 — 子会话向其父会话发送完成确认，没有 HTTP 路由调用它 — 也是未被隔离的，因为它只是入队一个通知而不是启动一个轮次。转移的最后一步切断被取代会话的客户端注册，清除其内存中的 worktree 关联，并报告被取代会话是否确实消失。幸存者 — 仍持有后台工作的子会话，因此最后一次分离触发的空闲关闭被拒绝并推迟 — 会被暴露出来而不是掩盖：守护进程记录它，屏障作为仅剩的隔离手段保持在该条目上激活，且 `200` 正文携带 `supersededSessionLive: true`，以便调用者知道被取代的 ID 仍然活跃，并且可以在刚刚发生所有权移动的检出中重新附加。崩溃安全性按窗口划分，写入顺序定义了这些窗口：首先写入旧 sidecar 的 `supersededBy` 链接，然后写入携带 `supersedes` 的替换会话 sidecar，最后翻转标记。因此，翻转前的崩溃会使旧会话在三种形状之一中保持权威，重试可以区分这三种情况 — 完全没有链接（替换会话是一个普通的孤儿，重试只需开始新的转移）、仅有向后链接且替换会话 sidecar 缺失（重试失败关闭并返回 `worktree_reset_invalid_state`，保留中断状态以供操作员修复），或两个链接都存在（重试回滚部分转移并完成新的转移 — 除非由于仍有客户端附加到其上而无法移除中断的替换会话，在这种情况下回滚失败关闭并返回 `worktree_reset_invalid_state` 并保留两个链接，因此稍后的重试会在该客户端消失后收敛）。翻转后的崩溃使替换会话保持权威，重试作为空操作恢复。旧会话永远不会被删除，worktree 检出也永远不会因重置而被移除。

**错误：**

- `404` — 当会话记录不存在时返回 `session_not_found`。
- `409` — 当会话没有有效的 Part 4A sidecar（不是 worktree 会话）时返回 `worktree_reset_unsupported`。
- `409` — 当参与转移的会话繁忙时返回 `worktree_reset_active`；请在其稳定后重试。在转移过程中的会话上，任何受屏障覆盖的写入器 — 提示词、rewind、cwd 更改、branch、fork、shell 命令、goal 控制或 workflow-task action — 的准入都会以相同的代码失败。
- `409` — `worktree_reset_invalid_state` 用于损坏的 sidecar、无效标记、包含性失败或不一致的 supersede 链接对。对于本次请求启动的操作是非破坏性的：本次请求开始的任何部分传输在调用者看到之前会被回滚，而 fail-closed 恢复分支——包括无效标记、不一致的 supersede 链接对（包括替换 sidecar 缺失的反向链接）、有歧义的标记所有者，以及当标记缺失时仍在当前守护进程上活跃的替换项——保留预先存在的中断状态以供操作员修复，从而使该状态对后续的 reset 或 restore 保持可见。针对这些状态的重试会重新读取并返回相同的 409：它不会收敛，因此需要操作员修复而不是重试循环。具体原因写入守护进程日志而非网络响应中。
- `500` — fail-closed 内部错误（例如不支持 reset 的桥接器，或回滚后的重定位拒绝）；不能按原样重试。有一种 `500` 性质不同：其自身提交后尾部在翻转持久化提交 _之后_ 失败的标记传输报告所有权已转移，从不运行破坏性回滚，并通过重试 reset 来修复，这会幂等地恢复已提交的传输。

### `GET /workspace/:id/session-info` and `GET /workspaces/:workspace/session-info`

返回所选工作区的聚合持久化会话计数，而不更改分页会话列表路径：

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

`active`、`archived` 和 `total` 统计用户可见的本地 JSONL 会话；内部守护进程主机会话和工作区代理任务会话（`sourceType` `agent-host` 和 `agent`）不包含在这些计数中，也不包含在任何会话列表中；人员仍可通过 ID 打开代理会话。`live` 是匹配的用户可见内存桥接计数，对于注册的不可信辅助工作区会被省略，因为仅持久化的读取不得查询实时状态。`expensive` 始终为 `true`，且 `cost` 始终为 `"disk_scan"`；客户端必须不频繁地调用此端点，而不是轮询它。如果扫描达到其安全限制或无法分类每个候选文件，响应将添加 `"truncated": true`，且持久化计数为下限。缺失存储返回零持久化计数。复数路由使用与复数会话目录相同的工作区选择器和信任策略；不可信主节点仍返回 `403 untrusted_workspace`。

TypeScript 守护进程 SDK 通过 `workspaceById(...)` 或 `workspaceByCwd(...)` 暴露复数路由，随后是 `getWorkspaceSessionInfo()`。

### 工作区会话工件库

`workspace_artifact_library` 另外支持工作区范围的查询和批量操作：

| 方法 | 路由 | 输入 |
| ------ | ------------------------------------------------ | ------------------------------------------------------------------------------- |
| GET | `/workspaces/:workspace/artifact-library` | 工作区中所有活跃、未加载和归档的会话 |
| POST | `/workspaces/:workspace/artifact-library/query` | `{ "sessionIds": ["session-id"] }` |
| POST | `/workspaces/:workspace/artifact-library/delete` | `{ "artifacts": [{ "sessionId": "session-id", "artifactId": "artifact-id" }] }` |

两个 POST 请求体都是包含 1–100 个条目的严格对象。重复的 ID 或配对只处理一次。查询响应为 `{ "v": 1, "sessions": [<session artifact envelope>], "errors": [<member error>] }`。每个成员错误包含 `sessionId`、`status`、`code` 和 `message`。完整发现省略不存在/外部会话；显式查询会报告它们。其他成员失败保持明确，同时返回成功的会话。

使用 `workspace_artifact_library_stream` 时，每个工件库会话信封（包括现有的单会话 GET）还包含：

```json
{
  "session": {
    "displayName": "Task title",
    "createdAt": "2026-10-26T00:00:00.000Z",
    "archiveState": "archived",
    "sourceType": "scheduled_task",
    "sourceId": "task-id"
  }
}
```

`displayName` 和 `sourceId` 是可选的。`createdAt` 是原始会话创建时间，即使在恢复后也是如此；它不是工件时间戳。`archiveState` 是 `active` 或 `archived`。源类型是开放字符串，缺失归属变为 `default`。像 `resource_inspection` 这样的源被保留，以便客户端可以显式排除它们。源 ID 与其原始源类型配对。名称遵循当前实时标题或持久化的自定义标题/第一个提示词。通用的 `/session/:id/artifacts` 响应保持不变。

完整的 GET 和选定的会话 POST 也接受 `Accept: text/event-stream`。如果没有该协商，它们返回上述 JSON 响应。对 POST 使用基于 fetch 的流式传输；在较旧的守护进程上检查能力和响应内容类型。有限的 SSE 序列如下：

| 事件 | 数据 |
| --------------- | -------------------------------------------------------------------------------- |
| `start`         | `{ "v": 1, "total": <candidate sessions> }`                                      |
| `session` | 一个完整的工件库信封，包括 `session` |
| `session_error` | `{ "v": 1, "sessionId": "...", "status": 404, "code": "...", "message": "..." }` |
| `complete`      | `{ "v": 1, "total": 10, "succeeded": 8, "failed": 1, "skipped": 1 }`             |
| `error` | 致命 `{ "v": 1, "status": 503, "code": "...", "message": "..." }` |

结果按完成顺序到达，最多有四个并发会话读取；慢速会话不会阻塞其他工作线程。JSON 保留选择顺序。完整查询中不存在/外部的会话计为 `skipped`；显式查询失败发出 `session_error`。`total` 统计候选项数量，而不是工件数量。只有 `complete` 标记扫描完成。致命的 `error` 或在没有 `complete` 的情况下断开连接意味着部分结果；没有重放游标、自动重连或订阅。等待期间可能会出现心跳注释。初始失败使用普通的 HTTP 状态码；在 SSE 标头之后，致命错误是流事件。断开的请求停止调度新的读取；已经运行的共享缓存加载可能会完成。背压限制待处理的结果帧，并且在等待客户端时不持有归档屏障。

批量移除返回 `{ "v": 1, "results": [...] }`。每个结果包含 `sessionId` 和 `artifactId`，以及现有的变更信封（`v`、`changes`、可选的 `warnings`/`warningDetails`）或 `error: { status, code, message }`。缺失的工件是幂等的空变更。客户端必须检查每个结果和持久化警告；200 批量响应并不意味着每个成员都成功了。移除是按会话分组的，跨会话不是事务性的，保留实际文件，并且需要与单工件移除相同的严格操作员权限。无效输入返回 400 `invalid_artifact_library_request`；工作区级别的错误保留普通的 HTTP 状态码。

实时工件和标题来自桥接器；有界的持久化身份元数据保留原始创建时间和源归属。未加载的元数据（包括空结果）按运行时缓存，序列化大小预算为 32 MiB。在重复查询或 TTL 之后，未更改的文件不会被重放。每次读取时都会检查转录本和所有权元数据身份；更改的条目会被重建。候选发现按目录身份缓存，并在完成扫描至少两秒后的第一次查询时刷新，即使目录时间戳没有变化也是如此。这种仅基于文件名的刷新保留了未更改的工件缓存。并发冷读取共享一个加载；每个请求一次最多处理四个会话。准入的未更改条目被保留；超出预算的新结果在未缓存的情况下返回，因此重复的全量扫描不会驱逐整个缓存。那些未缓存的会话或守护进程重启需要重建。这避免了缓存条目的重复 JSONL 解析，但文件系统检查和响应大小仍随工作区规模扩展。冷文件可用性保留了现有的仅元数据语义。

现有的单会话工件库 GET 与完整和批量查询共享此相同缓存，仅在其响应中添加 `session` 摘要并保留现有的错误形状。预热一条路由有利于其他路由；单条和批量移除会使共享条目失效。仅标题的转录本追加和归档移动也会刷新元数据；实时标题在每个请求时读取，无需等待磁盘持久化。实时持久化元数据和冷信封共享相同的 32 MiB 预算，实时/冷转换会重建条目。缓存信封的 `generatedAt` 是其投影创建时间。

`session_artifact_library` 公开这些持久化工作区范围的端点：

| 方法 | 路由 | 结果 |
| ------ | ----------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| GET | `/workspaces/:workspace/session/:id/artifact-library` | 会话工件信封，包括未加载和已归档会话的持久化注册信息。 |
| DELETE | `/workspaces/:workspace/session/:id/artifact-library/:artifactId` | 工件变更结果。已不存在的注册返回 `changes: []`。 |

工作区选择器解析为受信任的运行时。两个路由在访问工件之前都会拒绝模糊的实时所有者和其他运行时中的实时所有者。它们参与内部运行时活动屏障；读取持有共享会话归档屏障，删除独占持有该屏障。这两个路由都不会加载代理或取消归档会话。删除需要通过严格的变更门控获得守护进程操作员权限；它不需要 `X-Qwen-Client-Id`。现有的客户端拥有的工件端点保持其授权规则。

冷读取重放持久化工件记录，并返回元数据和定位符，例如工作区相对路径 `workspacePath`、`managedId` 或 `url`。它们保留记录的时间戳，并报告每个工件的兼容性警告，而不会标记成功持久化为不可用。`limits.maxArtifacts` 描述了实时存储的注册限制；冷投影不会为了强制执行该限制而驱逐历史注册。

冷删除追加一个持久的显式墓碑标记。它保留工作区文件，并使用现有的尽力而为清理机制释放未被引用的守护进程管理的 Web 预览快照引用。如果持久化失败，实时删除可以返回 HTTP 200 以及 `changes: []`、`warnings` 和 `warningDetails`；调用者必须检查结果并保留注册信息。冷写入失败作为错误返回。

当工件持久化被禁用时，两个路由都返回 `409 artifact_library_unavailable`。未知会话返回 `404 session_not_found`；外部项目存储被视为未找到，模糊或非常规存储返回 `409 session_storage_conflict`。不完整的对话记录或非权威的变更日志返回 `409 session_transcript_corrupt`，这与并发写入者的 `session_transcript_changed` 不同。超过 64 MiB 的读取返回 413。冷托管执行变更返回 `409 artifact_mutation_requires_managed_authority`。现有的工作区所有权和生命周期错误响应也适用。

### `GET /workspace/:id/sessions` and `GET /workspaces/:workspace/sessions`

列出规范工作区与 `:id` 或 `:workspace` 匹配的会话。路径参数首先解析为精确的工作区 ID，然后解析为 URL 编码的绝对 cwd。主要工作区包括现有的持久化/实时合并：默认列表来自 `chats/` 的活动会话；传递 `archiveState=archived` 以列出来自 `chats/archive/` 的已归档会话。受信任的非主要工作区包括从其自身的 `chats/` 存储中获取的活动持久化会话，并合并匹配的实时摘要而不产生重复项；如果不存在活动持久化会话，该路由保留之前的仅实时游标行为。受信任的非主要工作区还支持 `archiveState=archived`、有组织的 `view=organized` 列表以及 `group` 过滤器，读取其自身的 `chats/`、`chats/archive/` 和会话组织存储；组合的 `view=organized&archiveState=archived` 查询仅返回已归档会话，不进行实时合并。注册的不可信非主要工作区支持相同的列表、过滤和分页格式，但仅返回持久化条目：守护进程不会查询实时桥接器，也不会从运行时填充待处理交互、轮次错误或客户端状态。诸如 `clientCount: 0` 和 `hasActivePrompt: false` 等持久化默认值仍然存在以保持线路兼容性。缺失存储返回空列表。复数路由对于不可信的主要工作区仍返回 `403 { code: "untrusted_workspace" }`；遗留的主要路由保持其现有的兼容行为。v1 不支持 `archiveState=all`。主要和基于持久化的列表保持现有的数值 `cursor` 语义；无持久化的受信任非主要实时回退保持其现有的不透明实时游标。

```bash
curl http://127.0.0.1:4170/workspace/$(jq -rn --arg c "$PWD" '$c|@uri')/sessions
curl http://127.0.0.1:4170/workspace/$(jq -rn --arg c "$PWD" '$c|@uri')/sessions?archiveState=archived
curl http://127.0.0.1:4170/workspaces/<workspace-id>/sessions
```

当宣布 `workspace_qualified_rest_core` 时，工作区范围的会话批量操作、组 CRUD 和会话组织变更可在 `/workspaces/:workspace/sessions/{delete,archive,unarchive}`、`/workspaces/:workspace/session-groups` 和 `/workspaces/:workspace/session/:id/organization` 下使用。对于不可信的次要工作区，组 GET 仍然可用；每个组、会话和组织变更仍然受信任门控限制。无工作区的批量和组织变更路由出于兼容性原因仍仅限主要工作区。

查询参数：

| 字段 | 必填 | 备注 |
| -------------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `archiveState` | 否 | `active`（默认）或 `archived`。任何其他值返回 `400 { code: "invalid_archive_state" }`。 |
| `cursor` | 否 | 来自先前响应的分页游标。 |
| `size` | 否 | 页面大小。无效值返回 `400 { code: "invalid_cursor" }` 或现有的页面大小验证错误。 |
| `view` | 否 | 省略以获取遗留最近列表。`organized` 选择加入服务器端固定/分组排序并添加可选的组织字段。任何其他值返回 `400 { code: "invalid_session_view" }`。 |
| `group` | 否 | 仅在配合 `view=organized` 时有意义。`all`（默认）、`pinned`、`ungrouped` 或自定义组 ID。未知的组 ID 返回 `404 { code: "group_not_found" }`。 |

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
      "hasActivePrompt": false,
      "isArchived": false
    }
  ],
  "nextCursor": 1772251200000
}
```

启用 `view=organized` 时，守护进程读取 `<Storage.getProjectDir(cwd)>/session-organization.v1.json`，首先返回固定的会话，然后按活动时间降序排列，最后使用 `sessionId` 处理稳定平局。有组织的游标是不透明的 base64url JSON，不得与遗留最近列表重用。`pinned` 是一个虚拟过滤器，而不是一个组。`groupId: null` 表示未分组。已归档会话保留其组织元数据，但 `archiveState=archived&view=organized` 仍然仅返回已归档会话。

按活动顺序排列的游标——有组织的视图以及 `parentSessionId` / `sourceType` 过滤列表——不是快照隔离的，并且受信任的活动列表根据转录本 mtime 和实时活动水印中的较晚者对行进行排序。实时水印仅存在于内存中，因此当实时条目在两次页面获取之间退出时，会话的键可能会回退到其 mtime。游标对此进行了补偿：它携带了在实时派生键处已经发出的身份——在行从页面的集合中缺失期间以及固定翻转可能重新接纳它们期间保留这些身份——并在本次遍历的其余部分排除它们，因此实时派生键的移动每次遍历最多返回一个会话一次。该保证的范围限于携带内容：上限为 64 个身份（单次遍历中超出的身份降级为至多一次的重复项而不是错误），并且在固定状态更改之前发出的仅持久化行永远不会被携带，因此在获取之间取消固定可能会第二次返回该行，就像此字段存在之前一样。累积页面的调用者因此应始终通过 `sessionId` 对行进行键控，而不仅仅是在超过 64 的情况下。在并发活动下，行仍然可以移动或被跳过，这与以前完全一样；需要一致视图的调用者在活动更改后应从第一页重新加载。

当 `view=organized` 时，每个会话上可能会出现其他字段：

```json
{
  "isPinned": true,
  "pinnedAt": "2026-07-04T12:00:00.000Z",
  "groupId": "018f..."
}
```

受信任的活动列表包含实时守护进程覆盖字段，如 `clientCount`、`hasActivePrompt` 和 `activeWorkState`。不可信次要和已归档列表仅涉及存储：实时覆盖字段保持缺失或为 false，且已归档条目将 `isArchived` 设置为 `true`。当不存在会话时返回空数组（而非 404）——会话选择器 UI 不应仅因工作区空闲而报错。

### `POST /sessions/catalog`

在一次请求中独立分页读取多个注册工作区的会话目录。预检 `session_catalog_batch` 一次；较旧的守护进程保留工作区限定的会话列表和组端点。每个批量成员具有持久化工作区所有权：认证和请求准入是进程全局的，而每个条目仅解析和读取其所属的工作区。它从不注册工作区、创建会话、启动 ACP 或回退到主要运行时。

```json
{
  "workspaces": [
    { "workspace": "workspace-a", "cursor": "previous-a-cursor" },
    { "workspace": "/canonical/workspace-b" }
  ],
  "options": {
    "size": 20,
    "archiveState": "active",
    "view": "organized",
    "group": "all"
  },
  "includeGroups": true
}
```

`workspaces` 是一个有序数组，包含 1–20 个 `{ workspace, cursor? }` 条目，或者 `"all"` 用于选择所有公共注册工作区。选择器在解析为精确 ID 之前先解析为规范绝对路径。`all` 排除内部对话和已移除条目，包括暂时不可用的条目，如果将选择超过 20 个条目则失败；调用者随后必须拆分显式选择。空的公共注册表返回空结果。显式的内部选择器返回条目错误而不启动内部运行时。

共享 `options` 接受 `size`（整数 1–100，默认 20）、`archiveState`、`view`、`group`、`parentSessionId`、`sourceType` 和 `sourceId`，并使用现有的列表过滤器和组合。`group` 和 `parentSessionId` 限制为 256 个字符。`includeGroups` 默认为 false。每个工作区有其自己的游标。批量默认页面使用活动排序和不透明游标，包括对于仅实时会话；这些游标不能与遗留数值列表游标互换。使用该条目返回的 `cwd` 和 `nextCursor` 继续，同时保留过滤器。没有全局排序或全局分页游标。

```json
{
  "workspaces": [
    {
      "workspace": "workspace-a",
      "workspaceId": "workspace-a",
      "cwd": "/canonical/workspace-a",
      "sessions": [],
      "groups": {
        "groups": [],
        "colorOptions": ["red", "orange", "yellow", "green", "blue", "purple"]
      }
    },
    {
      "workspace": "/canonical/workspace-b",
      "error": {
        "code": "workspace_not_found",
        "message": "Workspace is not registered with this daemon.",
        "status": 404
      }
    }
  ]
}
```

结果保留选择顺序并将原始选择器作为 `workspace` 返回。成功条目包含规范化的 `cwd`、`workspaceId` 以及现有的页面字段（`sessions`、可选的 `nextCursor`、`truncated` 和 `liveMergeFailed`）。每个返回会话的 `workspaceCwd` 均规范化为其所在条目的规范 `cwd`。当请求时，`groups` 包含完整的组目录；组标识符的作用域限定于其所在的工作区。组读取保留现有的规范化逻辑，并对格式错误或不可读的组织存储采用警告并返回空值的回退策略。失败条目包含 `error: { code, message, status }` 以及在可用时的已解析身份，但不包含成功的空 `sessions` 列表。即使部分条目失败，有效批次仍返回 HTTP 200。格式错误的请求信封在存储读取前返回 HTTP 400。

未知、内部和已移除的工作区产生 `404 workspace_not_found`；不可用或已更改的运行时代次产生 `503 workspace_runtime_unavailable`；不受信任的主工作区产生 `403 untrusted_workspace`。不受信任的辅助工作区保持现有的仅持久化目录策略，不进行实时桥接读取、修复写入或调试会话日志记录。抛出的游标和组失败保留其现有代码；其他抛出的读取失败变为 `500 session_catalog_failed`。受信任的活动条目可以合并现有的实时桥接状态；归档条目保持仅存储模式。

守护进程在每个批次中最多并发执行四次工作区读取，将选择器限制为 4096 个字符，将游标限制为 16384 个字符，并将每个序列化后的成功条目大小上限设为 512 KiB。过大的条目返回 `413 catalog_response_too_large`；请在重试前减少 `size` 或省略组。这将批次响应的大小限制在约 10 MiB 加上信封/错误开销之内。客户端断开连接会取消待处理的读取操作，并阻止启动额外的读取操作。现有的守护进程 JSON 正文大小限制和持久化扫描限制同样适用。目录请求使用读取速率限制层级。

### `POST /sessions/live-state`

在一次请求中读取 1–20 个显式选择的已注册工作区的实时状态快照。严格的请求体为 `{ "workspaces": ["workspace-id", "/absolute/workspace/path"] }`；选择器在规范绝对路径之前解析为精确的工作区 ID。响应按请求顺序返回 `{ "workspaces": [...] }`。每个成功条目包含其原始的 `workspace` 选择器、规范的 `workspaceId` 和 `cwd`，以及与下方单工作区路由相同的完整 `v: 1`、`catalogVersion` 和 `sessions` 快照。这些快照是独立的；不存在跨工作区的原子性或合并的会话流。两个路由共享目录版本暴露和缓存失效机制，因此在它们之间交替使用可保持单工作区目录协调契约。即使部分条目失败，有效批次也返回 HTTP 200 和 `Cache-Control: no-store`。

每个失败条目包含 `workspace`、可选的已解析 `workspaceId` 和 `cwd`，以及 `error: { code, message, status }`，但不包含成功的空 `sessions` 列表。未知、内部或已移除的选择器返回 `404 workspace_not_found`；不可用或被替换的运行时代次返回 `503 workspace_runtime_unavailable`；不受信任的主或辅助工作区返回 `403 untrusted_workspace`；意外的桥接失败返回 `500 session_live_state_failed`。超过 512 KiB 的成功条目返回 `413 live_state_response_too_large`。无效的信封、多余的键、空数组、超过 20 个选择器以及长度超过 4096 个字符的选择器在任何桥接读取之前返回 HTTP 400 `invalid_session_live_state_batch_request`。该路由仅读取每个选定的活动运行时的内存桥接，绝不读取持久化目录或 ACP 子进程；成员读取按顺序执行，且 POST 请求计入守护进程的读取速率限制层级。

### `GET /workspaces/:workspace/sessions/live-state`

返回选定工作区运行时的仅内存实时会话快照以及内存中的目录版本，以便客户端停止轮询位于 `GET /workspaces/:workspace/sessions` 的持久化目录以获取易失性状态（如 `hasActivePrompt`、等待标志和 `clientCount`）。预检 `workspace_session_live_state`；该标签独立于 `workspace_qualified_rest_core`，因此宣传更广泛的工作区 REST 功能的旧版守护进程不实现此路由。选择器首先解析为精确的工作区 ID，然后在规范化后解析为 URL 编码的绝对 cwd，与其他复数会话路由匹配。对于主和辅助运行时，该路由仅限受信任访问：它从不回退到主运行时，也不使用允许不受信任的辅助工作区进行有界目录读取的宽松持久化目录策略。该端点没有查询参数，且不执行会话存储、设置、外部命令或 ACP 往返操作，因此其成本与持久化会话数量和 JSONL 大小无关；默认的实时会话上限使响应大小受限，且在禁用上限时，成本仅与实时会话数量成正比。

响应：

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
      "activeWorkState": "active",
      "isWaitingForPermission": false,
      "isWaitingForUserQuestion": false,
      "updatedAt": "2026-08-18T08:12:30.123Z"
    }
  ]
}
```

`v` 是响应架构版本。每个成功响应都包含 `Cache-Control: no-store`。`sessions` 是当前在选定运行时中处于活动状态的会话的完整、未分页、无序集合；空的活动运行时返回 `200` 和 `sessions: []`。`clientCount`、`hasActivePrompt`、`isWaitingForPermission` 和 `isWaitingForUserQuestion` 是必需的传输字段，缺失的可选桥接值投影为 `0` 或 `false`。`activeWorkState` 是传输层新增字段，在旧版守护进程中不存在：`active` 表示守护进程拥有未结算的工作或子进程发送了新的非空挂起快照；`idle` 仅针对覆盖所有必需类别的新空快照发出；`unknown` 表示协商的报告已过时或不完整；`unsupported` 表示子进程未协商报告。它不改变 `hasActivePrompt`：后台 shell、cron 回合或待处理的终端通知是活动工作，但不会成为前台提示。显示名称、创建时间、组织和源元数据等静态目录字段被故意排除，并由完整目录拥有。缺失的实时状态行仅清除已知目录行的易失性字段；它绝不会删除持久化的目录行。

`updatedAt` 是一个可选的守护进程观察到的活动水位线，当达到运行状态的提示词在当前桥接中发布了正式终止状态时存在。每个此类终止状态（无论是成功、错误、取消还是截止时间）都会使其恰好前进一次——在发布终止事件之前写入，并且在同一实时会话中严格递增，即使两个终止状态落在同一个墙钟毫秒内或墙钟时间回退也是如此；因此，时钟向前跳跃会持续存在直到墙钟时间追上。它永远不会早于该会话的 `createdAt`：第一次前进以创建时间为下限，因此创建与第一个终止状态之间的墙钟回滚不能将行键入到其已列出的 `createdAt` 之后。提示词准入、队列等待、流式更新、仅队列取消、心跳和交互等待都不会使其前进。客户端使用它在完成一轮后刷新已持有的目录行的时效性，而不是重新加载完整目录。它不是持久化确认：记录器异步写入轮次结果，因此该值仅证明守护进程观察到运行中的尝试已结算。在桥接代际中的第一个运行终止状态之前不存在——包括从磁盘恢复的会话——因此缺失不代表支持探测，并且当守护进程重启或工作区运行时替换安装新桥接时会消失。当同一会话同时存在实时和持久化摘要时，完整目录响应报告较晚的有效时间戳，因此直接返回桥接摘要而不进行合并的 `GET /session/:id/status` 可能报告比列表响应更早的值。

`catalogVersion` 是用于守护进程观察到的目录变化的相等性令牌。`generation` 是每个桥接实例创建的随机 UUID，并在守护进程重启或工作区运行时替换时改变；`revision` 从零开始，并在一个代际内单调增加。唯一支持的操作是对整个对进行相等性比较：相同的代际和修订号意味着没有守护进程观察到的目录变化，任何差异都意味着重新加载完整目录。客户端不得执行修订号算术运算或跨代际比较修订号，允许保守的额外增量。版本涵盖守护进程观察到的目录成员资格和静态元数据变化；普通轮次活动、提示词生命周期、附加/分离以及等待状态转换不会使其前进，因为实时快照已经携带了相应的易变字段。因此，在未变更的版本下发生变化的 `updatedAt` 是有效且预期的，并且它不会使守护进程的持久化列表缓存失效。两个易变覆盖值故意排除在这两个信号之外：轮次错误状态（`hasTurnError`/`turnError`）和待处理交互计数/内容（`pendingInteractionCount`/`pendingInteractions`）既不推进版本也不出现在快照中，因此需要这些值的客户端必须继续读取每会话事件流或完整目录，而不是依赖此路由；当有具体消费者需要时，可以以向后兼容的方式添加任一字段。由另一个守护进程、TUI 或外部进程直接编写的变更不会被观察到，因此一旦客户端停止定期轮询完整目录，这些写入就没有有限的发现时间，仅在显式完整重载、另一个观察到的目录变更、重连或守护进程/运行时替换后才显现。

客户端通过两次读取握手来协调目录包：读取实时状态 A，加载完整会话列表（如果客户端消费 `session_organization`，则加上 `GET /workspaces/:workspace/session-groups`），然后读取实时状态 B。A 和 B 版本相同则接受该包；版本不同则标记目录为陈旧，并最多合并一次尾随重载，而不是进入紧密重试循环。每个接受的目录请求必须在 A 之后发起——在 A 之前开始的请求或去重后的 Promise 不能满足协调要求。版本驱动的重载在每个工作区上是单飞（single-flight）的，并遵守非零后台最小间隔，因此持续的目录变动不会导致每次实时状态轮询都进行一次完整目录扫描；显式本地变更仍可通过同一单飞操作请求立即刷新。

**错误：**

- `400` — 对于未知、格式错误、嵌套或未注册的选择器，保持现有的选择器验证或 `workspace_mismatch` 行为；该路由绝不会将未知选择器解析为主运行时。
- `403` — 对于任何不受信任的运行时（包括不受信任的主运行时），返回 `untrusted_workspace`。
- `503` — 对于正在引导、过渡、排空、阻塞或被移除的运行时，或在请求中途关闭的运行时代际，返回带有 `Retry-After` 的 `workspace_runtime_unavailable`。
- `500` — 意外的本地错误使用现有的桥接错误映射。

### `GET /workspace/:id/session-groups`

列出工作区的用户定义会话组。单数 GET 选择器接受任何注册的工作区 ID 或 URL 编码的规范 cwd。复数 GET 别名也可供不受信任的辅助程序使用，并且只读取组织侧车文件。复数组变更仍然受信任门控，而单数组变更保留其仅限主程序的兼容性行为。预检 `caps.features.includes('session_organization')`。

响应：

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

颜色仅是协议令牌；客户端本地化显示名称。不创建默认的颜色命名组。

### `POST /workspace/:id/session-groups`

创建自定义会话组。严格的变更门控。预检 `caps.features.includes('session_organization')`。

请求：

```json
{ "name": "Frontend", "color": "blue" }
```

`name` 会被修剪，必须为 1-64 个字符，不能包含控制字符，并通过大小写不敏感的修剪比较在工作区内唯一。重复名称返回 `409 { code: "group_name_conflict" }`。`color` 必须是返回的 `colorOptions` 之一。

响应：

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

更新自定义会话组。严格的变更门控。预检 `caps.features.includes('session_organization')`。主体字段是可选的：`{ "name"?: string, "color"?: string, "order"?: number }`。未知的组 ID 返回 `404 { code: "group_not_found" }`；重复/无效的名称和颜色使用与创建相同的错误。

### `DELETE /workspace/:id/session-groups/:groupId`

删除自定义会话组。严格的变更门控。预检 `caps.features.includes('session_organization')`。引用该组的会话被清除为 `groupId: null`；固定状态得以保留。如果移除了一个组，响应为 `{ "deleted": true }`；如果 ID 不存在，响应为 `{ "deleted": false }`。

### `POST /sessions/delete`

硬删除一个或多个持久化的会话 JSONL 文件。守护进程首先尽力关闭实时会话，然后移除活动或归档的 JSONL。如果同一 ID 同时存在活动和归档副本，两者都会被移除。两侧的 Worktree 侧车文件会被清理；文件历史、子代理转录本和运行时侧车文件被有意保留。

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

归档一个或多个会话。归档是一种状态转换，而非删除：JSONL 文件从 `chats/<id>.jsonl` 移动到 `chats/archive/<id>.jsonl`。文件历史记录、子代理转录和运行时辅助文件保持原位。如果会话处于活动状态，守护进程首先执行严格关闭，并要求 ACP 代理的关闭处理程序刷新聊天记录；如果关闭或刷新失败，则不会移动 JSONL 文件。预检 `caps.features.session_archive`。

请求：

```json
{ "sessionIds": ["<uuid>"], "resolveConflicts": true, "requireIdle": true }
```

`sessionIds` 必须是一个非空字符串数组，最多包含 100 个 ID。重复项会被合并。

响应：

```json
{
  "archived": ["<uuid>"],
  "alreadyArchived": [],
  "resolvedConflicts": ["<uuid>"],
  "notFound": [],
  "errors": []
}
```

`resolveConflicts` 是可选的，默认为 `false`。默认情况下，具有相同 ID 的活动文件和归档文件会在 `errors` 中报告，且两个副本均不会被移动、移除或覆盖。归档活动会话时，在分类冲突之前仍会执行上述严格关闭操作，以便关闭操作可以将排队记录刷新到活动转录中。使用 `resolveConflicts: true` 时，仅当两个副本都是选定工作区可以维护的常规转录文件（包括拥有的空文件或损坏的转录文件）时，归档才会修复冲突。它会保留归档副本，移除活动副本，并在 `archived` 和 `resolvedConflicts` 中都报告该 ID。此选项不会绕过所有权检查；混合本地/外部或其他模糊的所有权情况会在 `errors` 中报告，且两个副本均不会被移动。`errors` 条目具有 `{ "sessionId": "<uuid>", "error": "message" }`。

`requireIdle` 是可选的，默认为 `false`。客户端必须在发送之前预检 `session_archive_idle_guard`。使用 `requireIdle: true` 时，如果活动所有者的活动工作状态为 active、unknown 或 unsupported，则该会话将在 `errors` 中返回；守护进程不会关闭它或移动其转录。检查和进入关闭状态在一个拥有运行时的控制平面回合中发生，因此新任务无法在这两者之间进入。对于持久化会话，如果其活动子进程已被回收，则仍有资格进行归档。

仅在归档的会话会在守护进程获取写入器或维护租约以协调待处理的辅助文件清理后，在 `alreadyArchived` 中返回。如果另一个进程仍然持有写入器租约，则在租约可用之前，仅在归档的 ID 将在 `errors` 中报告。

如果后续的清理所有权检查失败，转录移动或冲突修复不会回滚。在这种情况下，ID 可能仅出现在 `errors` 中，即使归档状态已经更改，并且可能从 `archived` 和 `resolvedConflicts` 中省略。在将错误视为活动副本或冲突仍然存在的确凿证据之前，请对同一工作区重试相同的生命周期请求。当服务能够验证存储的转录身份并获取所需的写入器或维护租约时，重试将报告权威的 `alreadyArchived` 状态，即使是会话列表省略的空文件或损坏的转录文件，并恢复待处理的辅助文件清理。无法验证存储身份的转录在重试时将继续报告 `errors` 并需要手动检查；无法获取所需租约的重试将保持在 `errors` 中，直到租约可用。

生命周期冲突是批量项目的结果：无工作区和限定工作区的路由都会返回 HTTP `200`，并将冲突包含在 `errors` 中。这取代了之前的限定工作区 HTTP `409 session_conflict` 信封；调用该路由的客户端必须检查批量响应。内部运行时 REST 批次在继续编辑其他每个会话的失败详细信息的同时，保留了安全的冲突消息。

### `POST /sessions/unarchive`

将归档的会话恢复到活动目录。这本身不会恢复会话；它只是将 `chats/archive/<id>.jsonl` 移回 `chats/<id>.jsonl`。取消归档成功后，客户端可以调用 `POST /session/:id/load` 或 `POST /session/:id/resume`。

请求：

```json
{ "sessionIds": ["<uuid>"], "resolveConflicts": true }
```

响应：

```json
{
  "unarchived": ["<uuid>"],
  "alreadyActive": [],
  "resolvedConflicts": ["<uuid>"],
  "notFound": [],
  "errors": []
}
```

`resolveConflicts` 是可选的，默认为 `false`。默认情况下，同时存在的活动和归档 JSONL 文件会在 `errors` 中产生冲突，且两个副本均不会被移动、移除或覆盖；仅在活动的会话会在守护进程获取写入器或维护租约以协调待处理的辅助文件清理后，在 `alreadyActive` 中返回。如果活动会话仍然持有写入器租约，则在会话关闭之前，仅在活动的 ID 将在 `errors` 中报告。使用 `resolveConflicts: true` 时，仅当两个副本都是选定工作区可以维护的常规转录文件（包括拥有的空文件或损坏的转录文件）时，取消归档才会修复冲突。它会保留活动副本，移除归档副本，并在 `unarchived` 和 `resolvedConflicts` 中都报告该 ID。此选项不会绕过所有权检查；混合本地/外部或其他模糊的所有权情况会在 `errors` 中报告，且两个副本均不会被移动。对于同一 ID，如果在批处理开始前正在进行归档或取消归档，将返回 `409 session_archiving`。

如果后续的清理所有权检查失败，转录移动或冲突修复不会回滚。在这种情况下，ID 可能仅出现在 `errors` 中，即使归档状态已经更改，并且可能从 `unarchived` 和 `resolvedConflicts` 中省略。在将错误视为归档副本或冲突仍然存在的确凿证据之前，请对同一工作区重试相同的生命周期请求。当服务能够验证存储的转录身份并获取所需的写入器或维护租约时，重试将报告权威的 `alreadyActive` 状态，即使是会话列表省略的空文件或损坏的转录文件，并恢复待处理的辅助文件清理。无法验证存储身份的转录在重试时将继续报告 `errors` 并需要手动检查；无法获取所需租约的重试（包括因为活动会话仍然持有租约）将保持在 `errors` 中，直到租约可用。

ACP-over-HTTP 通过供应商方法 `_qwen/sessions/archive` 和 `_qwen/sessions/unarchive` 使用相同的请求和响应体。REST 路由表将 `POST /sessions/archive` 和 `POST /sessions/unarchive` 映射到这些方法以供 ACP 传输使用。

### 多工作区活动会话路由

当宣布支持 `multi_workspace_sessions` 时，活动会话操作会从 `sessionId` 中识别其工作区；客户端不会向 URL 添加工作区选择器。除了现有的所有者路由的生命周期操作外，这还适用于 `PATCH /session/:id/metadata`, `POST /session/:id/recap`, `POST /session/:id/generate`, `POST /session/:id/btw`, `POST /session/:id/btw/stream`, `DELETE /session/:id/btw/stream/:requestId`, `POST /session/:id/mid-turn-message`, `GET /session/:id/mid-turn-messages`, `POST /session/:id/mid-turn-messages/send-now`, `DELETE /session/:id/mid-turn-messages/:messageId`, `POST /session/:id/tasks/:taskId/cancel`, `POST /session/:id/goal/clear`, `POST /session/:id/continue`, `POST /session/:id/language`, `POST /session/:id/artifacts`, `DELETE /session/:id/artifacts/:artifactId`, `GET /session/:id/sources`, `POST /session/:id/sources` 和 `DELETE /session/:id/sources/:sourceId`。守护进程将每个请求路由到拥有该活动会话的可信运行时。不可信的非主要所有者返回 `403 untrusted_workspace`，缺失的活动所有者返回 `404 session_not_found`，而模糊的所有者会以 `500 ambiguous_session_owner` 失败关闭。

此规则仅适用于实时会话，并不会使所有无工作区会话路由都具备多工作区感知能力。持久化或归档操作使用其文档中规定的工作区限定路由。`POST /session/:id/branch`、`POST /session/:id/fork` 和 `POST /session/:id/cd` 有意保持仅主工作区可用，并对非主所有者返回 `non_primary_session_route_not_supported`。

### 轮次中途消息

`POST /session/:id/mid-turn-message` 接受 `{ "message": "...", "messageId": "<optional-message-id>" }`。成功准入会返回 `{ "accepted": true, "messageId": "<id>" }` 并将所有权转移给守护进程：消息会被排入当前活动轮次，或在会话变为空闲时提升为普通提示 FIFO。使用 `session_mid_turn_message_query` 的客户端发送一个稳定的 `messageId`；只要它仍处于排队、待处理或有界协调环中，重复发送即具有幂等性。对守护进程已验证的请求的拒绝会返回 `{ "accepted": false }` 且从不转移所有权：对于没有提示准入到其提示 FIFO 且没有活动 Goal 轮次的开放会话，报告 `{ "accepted": false, "reason": "session_idle" }`，以便客户端可以将该消息作为普通提示重新提交，而不是显示失败。对于真正的新准入，引用会话不再持有的附件——或无效引用——的 `content` 块会在空闲和队列判定之前被拒绝：请求以 `410 session_attachment_gone`（或 `400 invalid_session_attachment_reference`）响应，并带有 `{ "error", "code" }` 主体，即使会话处于空闲状态，该主体也不携带 `reason`。两个较早的门控会抢占它：载荷仍然匹配的重复 `messageId` 会以 `{ "accepted": true, "messageId" }` 幂等地结算，即使附件此后已被移除；正在关闭或授权关闭的会话会被无理由的 `{ "accepted": false }` 拒绝。该判定仅描述可以排空轮次中途消息的内容，而非会话可能持有的所有内容——例如，当延迟恢复提示停泊时，会话快照仍可为其报告 `hasActivePrompt: true`。无理由拒绝另有原因——队列已满、会话正在关闭或授权关闭、排队的内联附件预算耗尽，或者重复的 `messageId` 不再匹配守护进程持有的载荷。守护进程保留其已准入的载荷而不是替换它，但这并不是交付承诺：客户端已移除的提升消息会立即从待处理提示快照中消失——尚未开始的消息在其所在位置被丢弃，已经开始运行的消息则隐藏直到其中止的轮次结算——因此移除响应是客户端观察到的唯一 `removed = true`。正在关闭的会话绝不会提升剩余排队的消息，而在关闭仍在授权期间结算的轮次会将队列交给准入门控，门控会拒绝它，因此这些消息被丢弃而非提升，并且不会落入任何环中。如果子进程随后拒绝关闭，则会话保持活跃，剩余排队的消息仍列在其中，并且在后续某个轮次结束前没有任何计划将其提升。这些消息仍属于守护进程，因此默认恢复方法是等待：下一个轮次的结算会提升积压消息，不会丢失也不会重复交付。无法等待的客户端——没有后续轮次到来且用户正在观看一个不会排空的队列——可以强制排空，唯一支持的方法是在再次发送之前释放每个载荷。两条路径都从同一集合开始：根据客户端自己在该窗口期间入队内容的记录减去拥有正面交付证据的内容来构建该集合，而不是根据列表的沉默来构建。查询不是守护进程持有内容的清单——它会省略已标记为移除的提示，两个环都是有界的，并且未附带客户端 ID 发送的入队在此表面上根本不被跟踪——因此未在任何地方报告的 ID 可能在交付后过期、未被交付而被丢弃，或者从未被列出。正面交付证据包括 `mid_turn_message_injected` 回声、针对该 ID 的 `pending_prompt_started`，或属于任一环的成员资格。

轮次中途的 POST 请求还接受可选的 `eventDetailMode`：`full`（默认）或 `summary`；无效值将返回 `400 invalid_event_detail_mode`。守护进程会将此模式与消息一起保留，并在未排空的消息成为新提示词时使用它。排入现有轮次不会改变该轮次的模式。在排队或已提升且待处理期间，使用相同 `messageId` 的重试必须匹配文本、媒体和有效模式（省略即表示完整）。Web Shell 发送其当前的 Provider 模式。REST 路由仍会以 `reason: "session_idle"` 拒绝新的空闲准入；调用方随后提交普通提示词。

要强制排空，请 `DELETE /session/:id/mid-turn-messages/:messageId` 该集合中查询仍报告为排队的每个 ID，然后才在新 `messageId` 下再次发布文本，因为重复的 ID 会被幂等地确认且不会重新武装任何东西。顺序很重要，并且适用于整个集合而不是一次一个 ID：守护进程拥有的仍排队的载荷会被下一次结算提升，因此重新发布其载荷从未被释放的 ID 会导致该消息被交付两次——一次来自该提升，一次来自重发。如果未广告 `session_mid_turn_message_mutation`，则无法释放载荷，因此等待是唯一安全的选择。没有 DELETE 判定本身能确立交付。`{ "removed": false }` 涵盖已注入或完成的 ID——已交付，因此不得重新发布——以及根据下面的 DELETE 路由涵盖的另外两种情况。一种是排空仍持有的 ID，这也绝不能重新发布。稍后的查询会在 `settledMessageIds` 中列出它，但这并非最终结果：如果排空失败，ID 会离开环并返回队列而没有事件。下面的“立即发送”段落描述了超时排空的消息何时丢失。另一种是未找到的 ID，对于查询刚刚列为排队的 ID，这意味着它在两次调用之间离开了队列，并可能被上述关闭授权路径未交付地丢弃；根据客户端自己的证据决定这种情况。`{ "removed": true }` 释放载荷，但对于在该窗口中被结算提升的 ID，它涵盖了在分发之前拼接的 FIFO 条目，这是可以安全重新发布的，以及已经开始的提升提示的中止，重新发布后会第二次发送。提升的 ID 也通过同一路由保持可删除，直到它结算，尽管列表不再将其报告为排队。重新发布本身是一个轮次中途准入，可能会被拒绝 `{ "accepted": false, "reason": "session_idle" }`；这不是失败，而是上述信号，表明会话现在接受普通提示，并通过普通路由提交会启动一个轮次，其结算会提升仍排队的任何内容——这也是为什么必须先释放集合中的每个 ID 的原因。

因此，缺少 `reason` 并不能证明会话处于繁忙状态。早于 `reason` 的守护进程在所有情况下都会省略该字段，因此客户端需在其旁边保留自己的空闲检测机制。连接到较旧守护进程的新客户端会检测到缺失的功能并保留其传统的本地回退方案。

`GET /session/:id/mid-turn-messages` 返回整个会话中由守护进程管理的队列以及有界的 `settledMessageIds` 和 `promotedMessageIds` 环形缓冲区。已结算的 ID 已被注入或显式删除；已提升的 ID 已进入正常的提示 FIFO。任一环形缓冲区中的 ID 不得重新发送。

当排队消息被排入活动轮次时，守护进程发布携带对齐的 `messages` 和 `messageIds` 数组（以及已知时的运行轮次的 `promptId`）的 `mid_turn_message_injected`。这是一个瞬态去重信号，而非转录项：客户端会结算在这些消息 ID 下注册的完成回调，并丢弃它们的任何本地待处理行。较旧的守护进程还会在载荷中携带 `originatorClientId`。错过的回声可通过上述查询从已结算环形缓冲区中恢复。

每当工具批次结束时，代理都会排空队列，因此在模型响应流式传输期间接收的消息将等待该响应及其工具批次。当宣传 `session_mid_turn_send_now` 时，附加的会话客户端可以调用 `POST /session/:id/mid-turn-messages/send-now` 以立即交付排队消息：如果前台轮次（包括目标延续）正在流式传输模型响应，代理会立即排空队列，中断该响应，将在对话中保留已流式传输的部分，并使用这些消息继续同一轮次。如果提供商已宣布开始工具调用的响应（即使其参数仍在流式传输），则不会中断，且正在运行的工具永远不会被打断：消息保持排队状态，并与工具结果一起交付，或者在工具结束轮次时提升到下一个提示。某些提供商仅在参数完成后才宣布工具调用，此类调用仍可被中断。在某些情况下，消息已离开队列但在该轮次中未得到答复。当发送即排空操作已在进行中，而提供商随后宣布一个结束轮次的工具调用，或者轮次被停止时，消息将保留在对话和转录中，但不会被提升。当发送即排空操作本身超时（代理等待 2 秒，且守护进程可能仍在读取附件）时，守护进程随后移交的消息如果响应仍在无工具调用的情况下流式传输，则会中断响应，否则会在稍后的排空中交付，可能在稍后的轮次中；与任何超时的排空一样，如果守护进程在超时后超过 30 秒才应答，或者在该稍后排空解析其附件期间轮次被停止，则消息将丢失。在所有情况下，它们的 ID 都像任何已排空消息的 ID 一样被结算：重新发送其中一个会被确认而无需再次排队，并且希望获得保留在对话中的消息答复的客户端会发送一个新提示。仅队列内部引导从不触发中断，也不被发送即排空操作获取；它随下一个对模型的请求发出，或者通过调用者在轮次先结束时驱动的结算路径发出。通道、cron 和后台轮次保持工具边界交付。当用户消息正在等待且代理被要求交付它们时，响应为 `{ "requested": true }`；当没有消息正在等待（它们已被交付、移除或提升）时，响应为 `{ "requested": false }`。早于该请求的代理会以 `-32601` 回答并保持工具边界交付。

当宣传 `session_mid_turn_message_mutation` 时，附加的会话客户端可以调用 `DELETE /session/:id/mid-turn-messages/:messageId`。它会从轮次中间队列或其已提升的待处理提示状态中移除消息；移除已提升且正在运行的消息会中止该轮次，这与普通的待处理提示移除相匹配。守护进程管理的队列添加和移除会发布现有的 `pending_prompt_added` 和 `pending_prompt_completed` 会话事件，以便附加的客户端刷新两个权威队列快照。`{ "removed": false }` 表示消息已被注入、已完成或未找到。已被排空但尚未移交给代理的消息也会回答 `{ "removed": false }`。如果该排空失败，消息将返回队列而不产生队列事件，且其 ID 会离开已结算环形缓冲区。随后的排空或轮次的结算将获取它，但当排空在其轮次结算后失败时，消息将保持排队直到下一个轮次。

### `GET /session/:id/pending-prompts`

返回当前正在运行的提示词以及等待在活动会话 FIFO 中的提示词。请求可能包含 `X-Qwen-Client-Id`；如果存在，它必须标识一个已连接的客户端。

```json
{
  "pendingPrompts": [
    {
      "promptId": "<prompt-id>",
      "text": "Explain the failure",
      "queuedAt": 1700000000123,
      "state": "running",
      "originatorClientId": "<client-id>"
    }
  ]
}
```

`state` 对于正在分发的提示为 `running`，对于等待中的提示为 `queued`。当提示包含结构化内容（如图像）时，会出现 `content`。这是一个实时会话所有者路由：`404` 表示没有实时所有者，`503` 表示所有者暂时不可用。不受信任的非主要所有者返回 `403 untrusted_workspace`，而在多个工作区中存在的 id 返回 `500 ambiguous_session_owner`。没有专用的功能标签；较旧的守护进程返回 `404`。TypeScript SDK 方法为 `getPendingPrompts()`。

### `POST /session/:id/prompt`

`eventDetailMode` 接受 `full`（默认）或 `summary`；无效值将返回 `400 invalid_event_detail_mode`。Summary 会在环形缓冲区保留和 SSE 交付之前过滤嵌套子代理详情，并移除 Agent 提示词、嵌入工具和进行中的令牌计数器，同时保留根内容和主模型使用情况。已结算的 Agent 结果会保留 `tokenCount` 和 `executionSummary` 令牌总数（包括失败/取消）用于轮次指标；嵌套的使用情况帧保持被过滤状态。同样的规则适用于 summary load/transcript 响应。模式在准入时捕获，仅在分发时应用，并在结算时重置为 full。迟到的子代理事件使用发布时的模式：空闲时为 full，或者当后续提示词运行时为活动提示词的模式。它们不会继承最初启动子代理的提示词的模式。它适用于会话的所有订阅者；被过滤的详情之后无法从环形缓冲区中检索。守护进程的 `/acp` `session/prompt` 接受具有相同作用域的相同可选顶层扩展（无效值为 JSON-RPC `-32602`）；它不是标准的 ACP 字段，也不会转发给子进程。

向 Agent 发送提示词。多提示词调用者按会话进行 FIFO 排队（ACP 保证每个会话只有一个活动提示词）。

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

`delivery` 是可选的，并且需要 `channel_delivery` 能力。即使提示词被准入，守护进程仍然返回 `202 {promptId,lastEventId}`。在成功的 `end_turn` 之后，会话将可见的最终文本提交到确切工作区中已在运行的 Channel Worker。载荷仅包含最后一个无工具调用的助手响应块；排除工具调用前言、工具间叙述、被取代的重试以及早期的自动续写块。空的或仅含空白字符的最终输出在授权消耗后仍会产生相关的带有 `status: "skipped"` 的 `channel_delivery_result`，但它不会联系 worker。交付的成功或失败稍后通过相同的可重放事件到达，并且永远不会将 `turn_complete` 更改为 `turn_error`。取消、Agent 失败和令牌限制终止不会发送或发布交付结果。

验证：`prompt` 必须是非空对象数组。其他失败会在到达桥接器之前返回 `400`。

`idempotencyKey` 是一个可选的非空字符串，最多 200 个字符（无效值将返回 `400 invalid_idempotency_key`）。它标识调用方的 EVENT，而不是 HTTP 请求：第一次准入会为每个会话记住该键，使用相同键的重复 POST 会返回原始准入——带有第一个提示词的 `promptId` 和一个新的 cursor/epoch 的 `202 { promptId, lastEventId, eventEpoch, deduplicated: true }`——而不会入队第二个轮次。这允许中继在 `202` 之后持久化标记接受（或丢失响应）时安全重试。去重在守护进程生命周期内是尽力而为的：环形缓冲区位于内存中且有界（每个会话 128 个键，1024 个会话，两级均使用 FIFO 驱逐）。任一上限都可以在其事件的队列条目仍然存活时驱逐一个键——在单个长寿命会话准入超过 128 个不同事件的常规情况下受每会话上限限制，当超过 1024 个会话持有键时受会话上限限制——在这种驱逐后的重试会重新注入。环形缓冲区也会随着它所保护的内存提示词队列一起消亡，因此守护进程重启会同时丢失两者，重新注入成为正确的恢复方式。键的作用域是每个会话；该字段是准入元数据，绝不会转发给 agent。

通道中继依赖三个 `_meta` 键，路由在转发前会剥离它们：`qwen.channel.prompt`（通道轮次分类）、`qwen.daemon.channelBoundRelay: true`（跨工作区绑定投递意图）和 `qwen.daemon.channelPromptAuthorization`（通道工作者授权令牌；参考工作者仅在持有凭证时发送）。`qwen.channel.prompt` 要求注册一个通道工作者授权令牌——目标工作区的每工作区注册，或者对于 CROSS 工作区绑定投递，任意已注册的工作者令牌加上显式的 `qwen.daemon.channelBoundRelay: true` 标记以及主要/受信任的目标。仅发送两个标记而不带凭证的中继不会获得通道分类：它被作为普通交互式提示接受（循环检测拒绝、中继文本上的实时 PR 绑定回填）。携带外部工作者令牌的普通提示同样不会获得通道分类，也不会获得调用方提供的显示投影。

响应：

```json
{ "promptId": "session-id########1", "lastEventId": 42 }
```

`202` 响应确认的是准入，而非 Agent 完成。在 `lastEventId` 之后观察会话 SSE 流，并通过 `promptId` 关联 `turn_complete` 或 `turn_error`。每个可达的预入队准入检查——包括保留的独立工作目录守卫——都会同步抛出异常，因此路由在任何接受之前都会回答非 202 错误：守卫在会话的托管对话绑定尚未释放时回答 `409 working_directory_missing`（`retryable: true`, `Retry-After: 5`），而通道中继会推迟事件而不是消耗幻影接受。如果桥接仍在准入前拒绝延迟请求，路由会丢弃请求的 `idempotencyKey`，以便后续重试被新鲜准入，而不是去重进入幻影准入——这是对该情况的纵深防御，其当前投递已被调用方消耗。

`turn_complete.data.stopReason` 携带 agent 返回的 ACP `StopReason`——`end_turn`、`max_tokens`、`max_turn_requests`、`refusal` 或 `cancelled`。守护进程还可以为未运行 agent 即中止的提示发出 `cancelled`，包括排队提示移除、调用方断开连接或排空/拆除；该值不能证明 agent 运行了提示。**将此字段视为开放字符串**：它在传输层类型为 `string`，ACP 集合可以增长，穷举切换它的客户端将在下次添加时中断。

两种守护进程端结果**不**通过此字段到达。在守护进程内部失败的轮次——截止时间过期、拆除刷新、子进程崩溃——发布为 `turn_error` 事件，绝不作为 `turn_complete` stopReason。其 `data` 始终携带 `message`；`code` 仅在守护进程对失败进行分类时存在（截止时间过期 → `prompt_deadline_exceeded`，拆除刷新 → `channel_closed`、`session_closed`、`session_killed` 或 `daemon_shutdown`），并且因 ACP 子进程在请求中途死亡而被拒绝的提示帧既不携带 `code` 也不携带 `errorKind`。将两者都视为可选，并根据 `message` 进行分支。

重启后从持久化历史恢复的轮次根本不会在流上重新发布；它出现在 `promptTerminals[]` 响应的 `POST /session/:id/load` 响应体中——当持久化尾部显示轮次已完成时为 `{ terminal: "completed", stopReason: "reconstructed_from_transcript" }`，或者当守护进程在轮次中途死亡时为 `{ terminal: "interrupted", code: "daemon_lost" }` 且**没有** `stopReason`。通过 `promptId` 匹配条目并根据 `terminal` 分支；当账本中没有会话证据时，`promptTerminals` 完全从响应中省略。

如果 HTTP 客户端在提示词处理过程中断开连接，守护进程会向代理发送 ACP `cancel` 通知，代理随后通过 `stopReason: "cancelled"` 终止该提示词。

当宣传 `prompt_absolute_deadline` 时，`deadlineMs` 可能会缩短配置的服务器截止时间。过期会发出相关的 `turn_error` 并带有 `code: "prompt_deadline_exceeded"`。截止时间在不杀死 agent 的情况下释放调用方；如果 agent 稍后结算，针对该 `promptId` 的轮次状态轮询将返回已结算的转录结果，而不是截止时间错误。

### `POST /session/:id/cancel`

取消会话上**当前活跃**的提示词。在 ACP 端，这是一个通知而非请求——代理通过以 `cancelled` 解析活跃的 `prompt()` 来确认。

```bash
curl -X POST http://127.0.0.1:4170/session/$SID/cancel
# → 204 No Content
```

> **多提示词契约：**取消操作仅影响活跃提示词。同一客户端之前 POST 提交且仍在活跃提示词之后排队的任何提示词将继续执行。多提示词排队是守护进程引入的行为（不在 ACP 规范中）；排队提示词的契约是“除非你逐个取消它们，或通过通道退出杀死会话，否则它们会继续运行”。

如果在多客户端部署中意外出现排队提示，首先确认调用方是否共享默认 `sessionScope: "single"` 会话。对于独立的每线程对话，使用 `sessionScope: "thread"` 创建会话，以便提示仅在该线程内序列化。

### `DELETE /session/:id`

显式关闭活动会话。即使有其他客户端连接也会强制关闭——取消任何活跃提示词，将待处理权限解析为已取消，发布 `session_closed` 事件，关闭 EventBus，并从守护进程映射中移除会话。磁盘上的持久化会话不会被删除——可以通过 `POST /session/:id/load` 重新加载。预检 `caps.features.session_close`。

```bash
curl -X DELETE http://127.0.0.1:4170/session/$SID
# → 204 No Content
```

幂等：对未知会话返回 `404`。错误信封使用 `code: "session_not_found"`；并发关闭可能返回 `code: "session_closing"`，客户端可将其视为此路由的相同成功终端状态。

> **`session_closed` 事件。**SSE 订阅者在流结束前会收到带有 `{ sessionId, reason: 'client_close', closedBy?: '<clientId>' }` 的终端 `session_closed` 事件。SDK reducer 对此的处理与 `session_died` 相同（设置 `alive: false`，清除 `pendingPermissions`）。

### `PATCH /session/:id/metadata`

更新可变会话元数据。预检 `caps.features.session_metadata`。分组和固定有意不包含在此路由中；在 `session_organization` 下使用 `PATCH /session/:id/organization`。

请求：

```json
{
  "displayName": "My Investigation Session",
  "pr": {
    "number": 123,
    "url": "https://github.com/QwenLM/qwen-code/pull/123",
    "state": "open"
  }
}
```

| 字段 | 必需 | 备注 |
| ------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `displayName` | 否 | 字符串。超过 256 个 UTF-16 代码单元的值会被截断，且截断不感知代理对，因此以非 BMP 字符结尾的名称可能会丢失单独的代理半区。空值或仅含空白字符的值会被 `400 invalid_metadata` 拒绝；省略该字段以保持名称不变。 |
| `pr` | 否 | 绑定一个拉取请求。需要正整数 `number`、最多 2,048 个字符且不含控制字符的 HTTP(S) `url`，以及可选的 `state`：`open`、`merged` 或 `closed`。 |

请求：

```json
{
  "sessionId": "<uuid>",
  "displayName": "My Investigation Session",
  "prs": [
    {
      "number": 123,
      "url": "https://github.com/QwenLM/qwen-code/pull/123",
      "state": "open"
    }
  ]
}
```

`prs` 是有效的有界绑定历史，可能包含刷新的问题链接。在会话的 SSE 流上发布 `session_metadata_updated` 事件，仅携带发生变化的字段组：重命名发出 `displayName`（当设置名称时加上 `titleSource`）并使 `prs` 缺失，而 PR 绑定变更发出 `prs` 并在设置时回显当前的 `displayName`。将事件中缺失的字段视为未更改，而不是清除，并在需要完整元数据时重新读取 `200` 主体或会话列表。

### `PATCH /session/:id/organization` and `PATCH /workspaces/:workspace/session/:id/organization`

通过现有变更网关更新本地会话组织状态。预检 `caps.features.includes('session_organization')`；复数路由 additionally 需要 `workspace_qualified_rest_core`。在复数路由上，`:workspace` 首先解析为精确注册的工作区 ID，然后解析为 URL 编码的规范绝对 cwd。所选运行时必须是受信任的。会话存在性和非空 `groupId` 验证仅限于该运行时的活动持久化、归档持久化和活动会话状态及组存储，不回退到主工作区或其他工作区。遗留路由仍仅限主工作区。

请求：

```json
{ "isPinned": true, "groupId": "018f..." }
```

| 字段 | 必需 | 说明 |
| ---------- | -------- | ---------------------------------------------------------------------------------------------------- |
| `isPinned` | 否 | 布尔值。`true` 在尚未固定时设置 `pinnedAt`；`false` 清除 `pinnedAt`。 |
| `groupId` | 否 | 自定义组 ID 或用于未分组的 `null`。未知组 ID 返回 `404 { code: "group_not_found" }`。 |
| `color` | 否 | 支持的会话颜色令牌，或用于清除会话颜色的 `null`。 |

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

此状态存储在守护进程运行时存储目录下的项目级会话组织 sidecar 中。它不是转录内容，不会更新转录 `mtime`，不会随转录一起导出，并且在归档/取消归档过程中会被保留。

### `POST /session/:id/heartbeat`

为此会话增加守护进程的最近查看记录。长期运行的适配器（TUI/IDE/web）会定期 ping 此接口，以便未来的撤销策略（Wave 5 PR 24）能够区分已死客户端和静默客户端。

请求头：

| 请求头 | 必需 | 备注 |
| ------------------ | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `X-Qwen-Client-Id` | 否 | 回显由 `POST /session` 发出的守护进程 ID。已识别的客户端也会增加其每个客户端的时间戳；匿名心跳仅增加每个会话的水位线。必须满足与其他地方相同的 `[A-Za-z0-9._:-]{1,128}` 格式。 |

请求体为空（使用 `{}` 即可——目前不读取任何字段）。

响应：

```json
{
  "sessionId": "<sid>",
  "clientId": "<cid>",
  "lastSeenAt": 1700000000123
}
```

仅在提供了可信的 `X-Qwen-Client-Id` 时才会回显 `clientId`。`lastSeenAt` 是桥接器存储的守护进程端 `Date.now()` 纪元（毫秒）。

错误：

- `400` — 当请求头格式错误（请求头格式规则）或携带了未在此会话注册的 `clientId` 时抛出 `{ code: 'invalid_client_id' }`（桥接器在增加任何时间戳之前抛出 `InvalidClientIdError`）。
- `404` — 未知会话。

能力门控：预检 `caps.features.client_heartbeat`。较旧的守护进程对此路径返回 `404`。

### `POST /session/:id/model`

**在**会话当前绑定的模型服务内切换活动模型。通过每个会话的模型变更队列进行序列化。

（若要切换 _服务_ 本身——例如 Alibaba ModelStudio 与 OpenRouter 等——请在 `POST /session` 上为全新会话传递 `modelServiceId`。Stage 1 没有实时服务切换路由。）

请求：

```json
{ "modelId": "qwen-staging" }
```

响应：ACP agent 的模型切换结果，原样转发——守护进程不会重塑它，因此顶层不携带 `modelId`。从 `_meta.qwenModelSwitch` 读取切换详情。

成功时，向 SSE 流发布 `model_switched`。失败时，发布 `model_switch_failed`（因此被动订阅者能看到失败，而不仅仅是调用者）。与 agent 通道退出竞争，以防卡住的子进程阻塞 HTTP 处理程序。成功的切换还会尽力将 session model 记录到 session JSONL 中；当记录写入后，守护进程加载/恢复会在身份验证之前尝试恢复此会话的模型。如果记录的模型无法再应用（模型被移除、凭据不可用），恢复会使用存在的同 ID 注册表路由——对于运行时快照记录，这可能是不同于记录绑定的端点——并且仅在无法解析路由时才继续 `settings.model.name` 默认值。`settings.model.name` 仍作为 **新** 会话的默认值进行更新。

### `GET /session/:id/message-groups`

能力标签：`session_message_deletion`。Bridge → ACP extMethod `qwen/status/session/message_groups`。这是一个实时会话所有者读取：它解析会话的所有者运行时，绝不会回退到主工作区。守护进程范围的能力并不意味着支持每个会话；SSH 工作区和 Managed 权威存储拒绝删除。

按活动历史顺序列出可安全归因的 prompt/reply 或 command-display 组。普通遗留记录器不会获取 writer lease。读取会等待较早的历史变更；随着会话变化，返回的快照可能会变得陈旧。删除本身要求会话处于空闲状态。

响应 (200)：

```json
{
  "snapshot": "<opaque selection token>",
  "groups": [
    {
      "id": "<group-id>",
      "promptId": "<prompt-id>",
      "recordIds": ["<user-record-id>", "<reply-record-id>"]
    }
  ]
}
```

`promptId` 和 `promptIds` 是可选的 prompt 标识；`recordIds` 标识组的保存记录。空历史返回 `groups: []`。请将组 ID 和快照视为不透明数据；删除时请原样传递返回的快照。

错误包括针对未知会话的 `404`，针对 SSH 工作区的 `400 unsupported_operation`，以及针对不支持的存储或不可用记录的 `422 session_message_deletion_unsupported`。现有的 writer-integrity 错误也可能返回 `409 session_writer_conflict`、`409 session_writer_lost`、`409 session_transcript_changed` 或 `503 session_writer_unavailable`。

### `POST /session/:id/messages/delete`

能力标签：`session_message_deletion`。Bridge → ACP extMethod `qwen/control/session/messages_delete`。严格的变更门控；限定于实时会话所有者，不回退到主工作区。接受可选的 `X-Qwen-Client-Id` 用于事件归因。

请求：

```json
{ "snapshot": "<token from message-groups>", "groupIds": ["<group-id>"] }
```

两个字段均为必填。`snapshot` 必须非空；`groupIds` 必须包含不同的非空字符串。选定的组在该快照中必须仍然存在。服务器拒绝繁忙会话，而不是将删除排队在模型轮次之后。

响应 (200)：

```json
{
  "deletedGroupIds": ["<group-id>"],
  "deletedPromptIds": ["<daemon-prompt-id>"]
}
```

选定的原始记录及其拥有的 raw compression context 会从 JSONL 中物理移除。现有的摘要文本、命令效果和项目文件会被保留。删除所有组会使会话可用于后续的 prompts。

错误：

- `400 invalid_message_groups` — 格式错误、未知或重复的组选择。
- `400 invalid_client_id` — 格式错误的归因请求头。
- `404` — 未知会话。
- `409 session_busy` — prompt 或 history 变更处于活动状态；待其完成后重试。
- `409 worktree_reset_active` — 此会话正被 worktree reset 取代；重新附加到替换会话。
- `409 message_groups_conflict` — 选择快照已过时；再次获取组并在重试前要求新的选择。
- `409 message_history_invalid` — 历史无法安全归因；仅更改选择令牌无法修复它。
- `400 unsupported_operation` / `422 session_message_deletion_unsupported` — 会话/工作区存储不支持此操作；刷新并重试请求不会启用它。
- `409 session_writer_conflict`、`409 session_writer_lost`、`409 session_transcript_changed` 或 `503 session_writer_unavailable` — 无法建立或保留 exclusive transcript ownership。
- `503 message_deletion_context_unavailable` — 删除 **已持久化**，但无法安装 live context。JSON body 包含 `persisted: true`、`deletedGroupIds` 和 `deletedPromptIds`。请根据权威历史协调 UI，并在发送另一个 prompt 之前重新打开会话。不要像什么都没删除一样重试删除；在上下文恢复成功之前，后续 prompts 仍将被拒绝。

在上下文恢复挂起期间，后续依赖历史的变更和模型请求会返回 503 `session_history_context_unavailable`，且不包含 `persisted` 或删除标识。加载或恢复会话会重试安装权威的 JSONL 上下文；只有安装成功才会重新开放模型准入。生命周期关闭仍然可用。

持久化后，会话会在 **事件信封** 上发布 `session_messages_deleted`，数据为 `{sessionId, deletedGroupIds, deletedPromptIds}` 以及可选的 `originatorClientId`。内部 API 历史标识不会在此线路上发布。此事件也会发生在持久化-503 路径中。对等方必须使缓存的转录、导航、搜索和选择状态失效，并重新加载权威历史。发起者必须协调成功的 HTTP 响应和 `persisted: true` 错误；它不能依赖处理自己的 SSE 回声。

### `POST /session/:id/recap`

能力标签：`session_recap`。Bridge → ACP extMethod `qwen/control/session/recap`。

生成一句“我刚才做到哪里了”的会话摘要。封装核心中的 `generateSessionRecap`（`packages/core/src/services/sessionRecap.ts`），该函数针对快速模型运行一个侧查询，禁用工具，使用 `maxOutputTokens: 300`，并采用严格的 `<recap>...</recap>` 输出格式。侧查询读取会话现有的 GeminiClient 聊天历史，并且**不会**向其添加内容。

请求体被忽略（发送 `{}` 或留空）。非严格变更门控——姿态镜像 `/session/:id/prompt`（调用消耗令牌但不改变状态）。不发布任何 SSE 事件。

响应 (200)：

```json
{
  "sessionId": "sess:42",
  "recap": "Debugging the auth retry race. Next: add deterministic timing to the integration test."
}
```

当以下情况时，`recap` 是 `null`（正常的 200，而非错误）：

- 会话尚不足两轮对话，
- 侧查询未返回可提取的 `<recap>...</recap>` 载荷，
- 或者发生了任何底层模型错误（核心辅助函数尽力而为且从不抛出异常）。

错误：

- `400 {code: 'invalid_client_id'}` — `X-Qwen-Client-Id` 标头格式错误。
- `404` — 会话未知。

取消：**v1 中无**。路由不监听 HTTP 客户端断开连接，没有 `AbortSignal` 接入 bridge，且无论调用者是否断开连接，ACP 子进程都会将侧查询执行至完成。唯一的上限是 bridge 的 60 秒兜底超时（`SESSION_RECAP_TIMEOUT_MS`）以及与 ACP 通道死亡之间的传输关闭竞争。这是可以接受的，因为回顾很短（单次尝试，`maxOutputTokens: 300`，典型耗时约 1–5 秒）；如果带宽成本证明合理，未来版本可以通过基于请求 ID 的取消扩展方法实现端到端取消。

### `POST /session/:id/generate`

能力标签：`session_generation`。

从调用方提供的提示运行请求范围的文本生成。请求不读取或修改对话历史，且不暴露工具。它优先使用配置的快速模型，如果快速模型缺失或无法解析，则回退到会话的主模型。该端点与任务无关；翻译只是可能的调用方定义提示之一。

请求：

```json
{ "prompt": "Translate into Chinese: Hello" }
```

响应为 `text/event-stream`。服务器立即写入初始 SSE 注释，随后是 `started`、可选的 `thinking` 进度事件、零个或多个 `delta` 事件以及 `done`。`thinking` 事件不包含推理内容。流式传输开始后若模型失败，会产生 `error` 事件；不会使用其他模型重试。提示词限制为 32 KiB UTF-8 文本。断开 HTTP 客户端连接会取消生成请求。

### `POST /session/:id/btw/stream`

能力标签：`session_btw_stream`。范围：实时会话所有者。

利用实时会话的对话上下文提出一个无需工具的问题，但不追加到其转录记录或中断其主要任务。现有的 JSON `POST /session/:id/btw` API 保持原有行为并继续可用。

请求：

```json
{ "question": "Why?", "requestId": "unique-request-id", "resume": false }
```

`question` 是一个非空且已修剪的字符串，在修剪前限制为 4096 个字符。`requestId` 包含 1–64 个 ASCII 字母、数字、下划线或连字符。`resume` 是可选的，默认为 `false`。如果提供 `X-Qwen-Client-Id`，必须指定与实时会话注册的客户端名称。每次启动和恢复都使用解析后的所有者运行时及其信任和变更门控。

响应为 `text/event-stream`，每个事件均带有 `v: 1`：

| 事件 | 载荷 |
| -------- | --------------------------------------------------------------------------- |
| `answer` | `{ "type": "answer", "requestId": "...", "answer": "accumulated text" }`    |
| `done`   | `{ "type": "done", "requestId": "...", "answer": "trimmed complete text" }` |
| `error`  | `{ "type": "error", "requestId": "...", "code": "...", "message": "..." }`  |

每个 `answer` 替换之前的文本；它不是要追加的增量。部分快照保留空白字符；`done` 修剪前导和尾随空白，匹配现有的 JSON BTW 结果。初始快照可以为空。`done` 和 `error` 终止流。每 15 秒发送一次心跳注释。答案限制为 1 MiB UTF-8 文本；超出此限制会产生 `btw_failed`。守护进程在五分钟后以 `btw_timeout` 结束生成；子进程和桥接清理截止时间分别允许额外五秒和十秒。显式取消会产生 `btw_cancelled`；其他上游故障会产生 `btw_failed`。

HTTP 断开连接仅分离订阅者。使用相同的 `requestId`、问题和客户端身份以及 `resume: true` 重新连接，以接收最新快照而无需启动另一个模型调用。具有相同身份的重复初始提交也会重用保留的工作。不需要事件游标或 `Last-Event-ID`。对于保留条目缺失的 `resume: true` 请求，返回 410 且从不启动新工作。请求按桥接身份、会话、客户端和请求 ID 进行范围限定；它们不能跨守护进程重启或替换的所有者运行时恢复。

每个所有者运行时最多保留 32 个请求。终端回执和取消标记在 60 秒后过期，并且为了接纳新请求可能会更早地按最旧优先顺序被驱逐。活动请求不会被驱逐。生成过程在等待模型或订阅者时不持有会话的共享归档准入锁；桥接活动仍保护其免受空闲清理的影响。显式会话关闭和守护进程关机保留其正常的取消行为。

SSE 开始前的错误：

- `400 invalid_btw_request` — 无效的问题、请求 ID 或恢复标志。
- `400 invalid_client_id` — 格式错误或未注册的客户端身份。
- `403 untrusted_workspace` — 解析出的非主要所有者不可信。
- `404 session_not_found` — 不存在活跃的所有者。
- `409 btw_request_conflict` — 保留的 ID 属于另一个问题。
- `410 btw_expired` — 恢复操作没有保留的请求。
- `429 btw_limit` — 所有 32 个保留的请求均处于活动状态。
- `501 btw_stream_not_supported` — 所有者的桥接无法流式传输 BTW。

### `DELETE /session/:id/btw/stream/:requestId`

能力标签：`session_btw_stream`。范围：live-session-owner。

使用启动该 BTW 请求时相同的会话和客户端身份来取消匹配的 BTW 请求。返回空的 `204`；对于保留的请求，取消操作是幂等的。确切的缓存身份可以在其客户端分离后进行取消，而未知 ID 则需要仍然注册的客户端。取消未知 ID 会记录一个短生命周期的取消标记，以便延迟的初始 POST 无法启动工作。

该路由使用与流式 POST 相同的所有者解析、信任和变更门控。无效的 ID 返回 `400 invalid_btw_request`；无效的客户端身份返回 `400 invalid_client_id`。当所有 32 个保留请求都处于活动状态时，未知的取消返回 `429 btw_limit`。即使运行时已满，已知活动请求始终可以被取消。取消操作不会取消主提示或其他会话的 BTW。

### 变更：审批、工具、技能、初始化、MCP 重启

守护进程暴露五个变更控制路由，允许远程客户端更改运行时姿态，而无需接触守护进程主机的 CLI。审批模式控制保留其非严格兼容性门控。工具切换、技能切换、工作区初始化和 MCP 重启使用严格的变更门控：可信回环主要请求、Bearer 认证以及配对的 Local Control 请求可以通过。到达门控但没有可信回环权限的无令牌主要请求接收 `401 {code: 'token_required'}`；缺失或无效的配置凭据以及未配对的 Local Control 凭据会在更早阶段被拒绝并返回普通的 `401 Unauthorized`。全部五个：

- 接受并戳记 `X-Qwen-Client-Id` 标头（PR 7 审计链）。当标头携带可信 ID 时，守护进程在相应的 SSE 事件上发出 `originatorClientId`，以便跨客户端 UI 可以抑制其自身变更的回声。
- 在暴露功能之前预检每个标签的能力。缺少路由的守护进程返回 `404`。对于 Skill 设置路由，标签缺失可能意味着相同的路径服务于已退役的目录验证契约：单目标路由可以返回 HTTP `404 skill_not_found` 或 `409 skill_not_toggleable`，而批量路由返回 HTTP 200，并在 `errors[]` 中包含目录派生的失败项。不要将路由探测用作版本检查。

工具切换、技能切换、初始化和 MCP 重启路由发出 **工作区范围** 的事件：每个活动的会话 SSE 总线都会收到该事件，无论触发变更时附加的是哪个会话。`approval-mode` 发出 **会话范围** 的事件，因为更改仅局限于单个会话的 `Config`。

#### `POST /session/:id/approval-mode`

能力标签：`session_approval_mode_control`。Bridge → ACP extMethod `qwen/control/session/approval_mode`。

更改活动会话的审批模式。新模式立即落入 ACP 子进程的每会话 `Config` 中，并在聊天录制可用时从该会话的记录中恢复。计划的选定执行模式也会随之恢复。默认情况下不写入工作区设置 — 传递 `persist: true` 以同时将 `tools.approvalMode` 写入工作区设置。如果录制被禁用或降级，则模式仅保留在活动会话中。

请求：

```json
{ "mode": "auto-edit", "persist": false }
```

`mode` 必须是 `'plan' | 'default' | 'auto-edit' | 'auto' | 'yolo'` 之一（核心 `ApprovalMode` 枚举的镜像；SDK 导出 `DAEMON_APPROVAL_MODES` 用于运行时验证）。`persist` 默认为 `false`。

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

- `400 {code: 'invalid_approval_mode', allowed: [...]}` — 未知的模式字面量。
- `400 {code: 'invalid_persist_flag'}` — `persist` 不是布尔值。
- `403 {code: 'trust_gate', errorKind: 'auth_env_error'}` — 请求的模式需要受信任的文件夹（不受信任的工作区中的特权模式会被核心的 `Config.setApprovalMode` 拒绝）。
- `404` — 会话未知。

SSE 事件（会话范围）：带有 `{sessionId, previous, next, persisted, originatorClientId?}` 的 `approval_mode_changed`。

#### `POST /workspace/tools/:name/enable`

能力标签：`workspace_tool_toggle`。纯文件 IO — 无 ACP 往返。

在工作区的 `tools.disabled` 设置列表中切换工具名称。列在那里的工具根本 **未注册**（与 `permissions.deny` 不同，后者保持工具注册但拒绝调用）。内置工具和 MCP 发现的工具都流经 `ToolRegistry.registerTool`，它会查询禁用集合。

> ⚠️ **名称必须与注册表暴露的标识符完全匹配。** 不进行别名解析——路由将路径参数中的任何字符串存储到 `tools.disabled` 中，下一个 ACP 子项在注册时会与 `tool.name` 进行比较。内置工具使用其规范注册表名称（snake_case 动词形式）：`run_shell_command`、`read_file`、`write_file`、`list_directory`、`glob`、`grep_search`、`web_fetch` 等——而不是 CLI 显示的标签（`Shell`、`Read`、`Write`）。MCP 发现的工具使用限定的 `mcp__<server>__<name>` 形式（这也是 `tool_toggled` 事件广播的形式以及 `GET /workspace/mcp` 列出的形式）。禁用 `Bash` 不会阻止 `run_shell_command` 在下一个会话中注册。

活动的 ACP 子进程保留已注册的工具 — 切换在 **下一个** ACP 子进程生成时生效。结合 `POST /workspace/mcp/:server/restart`（针对源自 MCP 的工具）或创建新会话以使更改在当前守护进程中生效。

未知工具名称会被接受：预先禁用尚未安装的 MCP 工具是一种合法的使用场景。

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
- `400 {code: 'invalid_enabled_flag'}` — `enabled` 缺失或非布尔值。

SSE 事件（工作区范围）：带有 `{toolName, enabled, originatorClientId?}` 的 `tool_toggled`。

#### 拆分 Skills 配置与运行时路由

能力标签：`workspace_skills_config_runtime`。

`GET /workspace/config/skills` 读取守护进程本地的全局配置所有者。`GET /workspaces/:workspace/config/skills` 读取精确注册的已配置工作区配置，不需要活跃或受信任的运行时。两者均返回标准的 Skills 状态格式，且不要求存在 `runtimeEpoch`：

```json
{
  "v": 1,
  "workspaceCwd": "/work/project",
  "initialized": true,
  "skills": []
}
```

`GET /workspace/runtime/skills` 和 `GET /workspaces/:workspace/runtime/skills` 在不启动所选受信任运行时的情况下读取它。活跃目录包含生成它的运行时版本：

```json
{
  "v": 1,
  "workspaceCwd": "/work/project",
  "initialized": true,
  "runtimeEpoch": 4,
  "skills": []
}
```

全局安装和删除使用 `POST /workspace/config/skills/install` 和 `DELETE /workspace/config/skills/:name?scope=global`。工作区安装、删除和启用使用 `POST /workspaces/:workspace/config/skills/install`、`DELETE /workspaces/:workspace/config/skills/:name?scope=workspace` 和 `POST /workspaces/:workspace/config/skills/:name/enable`。配置写入在调度运行时协调之前提交持久化状态。当没有当前运行时可更新时，其 `activation` 为 `deferred`；当更新已排队时，其为 `reconciling`；空操作切换保留外观层的激活状态，而不是声称发生了运行时刷新。

当无法枚举守护进程本地的 Skill 清单时，配置删除返回 `503 skills_config_unavailable` 而不是明确的未找到响应。运行时删除（`DELETE /workspace/skills/:name` 及其工作区限定形式）需要重新枚举的目录：当运行时目录和守护进程本地枚举均未产生初始化目录时，即使存在保留的观察结果，也会返回相同的 `503 skills_config_unavailable`。`404 skill_not_found` 表示目录已被枚举且名称不在其中。

单数变异所有者拒绝工作区范围并返回 `400 workspace_scope_requires_qualified_workspace`；限定变异拒绝全局范围并返回 `400 global_scope_requires_singular_owner`。限定写入需要受信任的工作区。对于需要运行时协调的限定配置写入，遗留注入桥接返回 `501 workspace_runtime_not_supported`。未知、已移除、过渡中和排空中的工作区遵循标准限定工作区错误，并且永远不会回退到主要工作区。

#### 原生 Skill 归档安装与回执

`skill_archive_install` 和 `skill_zip_file_source` 宣传原生 ZIP 输入及相应的所有者范围回执查询。两者都限制在现代配置表面。它们的 `limits.maxSkillArchiveBytes`、`maxSkillArchiveExpandedBytes`、`maxSkillArchiveEntries` 和 `maxSkillArchiveManifestBytes` 仅适用于这两个来源：50 MiB 压缩大小，200 MiB 解压大小，4096 个 ZIP 记录，以及有效根目录 `SKILL.md` 的 32 MiB。显式目录和被忽略的元数据在过滤前计为记录；隐式父目录不计入。被忽略的元数据不会被膨胀。遗留 base64、目录和 GitHub 限制（包括 10 MiB JSON 解析器）保持不变。

- `POST /workspace/config/skills/install-archive?name=...&attemptId=...` 进行全局安装；`/workspaces/:workspace/config/skills/install-archive` 安装到所选工作区。发送 `application/octet-stream` 时不使用 HTTP 内容编码。该路由固定了范围。
- 现有的现代 JSON 安装路由也接受 `{ "name": "example", "scope": "global", "attemptId": "<UUID>", "source": { "type": "zip-file", "path": "/absolute/daemon/path.zip", "sha256": "<optional 64 hex digits>" } }`。限定路由要求 `scope: "workspace"`。守护进程将打开的常规文件复制到私有存储中，并且绝不会删除或重命名调用者的文件。在复制期间保持源文件稳定；仅检查元数据不是原子快照。
- `GET /workspace/config/skills/install-attempts/:attemptId` 和 `GET /workspaces/:workspace/config/skills/install-attempts/:attemptId` 查询原始所有者。响应携带 `running`（含阶段）、`committed`、`not_committed` 或 `recovery_required`。缺失或不可访问的回执意味着结果无法确认。查询既不会启动运行时，也不会获取变异协调器。

客户端在发送前提供 UUID；SDK 可以生成它。同一所有者下的重复 ID 返回 409 而不重复安装。每个守护进程可能有两个活动操作，包括锁等待和清理；进一步的准入返回带有 `Retry-After` 的 429。有一个覆盖从回执接收至发布准入的 120 秒预算。发布前的取消会停止操作；准入后，即使 HTTP 连接消失，提交或回滚仍会完成。

成功保留变异结果和激活状态，添加 `attemptId` 和 `archiveSha256`。提交后的激活失败是 `activationWarning`，而不是失败的提交。回执是进程本地的历史结果，在工作结算后保留十分钟，容量为 256 且无早期驱逐。它们不能证明后续操作没有替换已安装的内容。重启、过期或失去所有者访问权限会使结果未知。客户端必须在模糊失败后进行查询，并且不得自动重传。

#### `POST /workspace/skills/refresh`

能力标签：`workspace_session_refresh`。工作区限定形式为 `POST /workspaces/:workspace/skills/refresh`。单数路由拥有主要运行时；限定路由解析精确选择的受信任运行时，并且永远不会回退到主要运行时。两者都使用严格的变异门控和现有的客户端身份检查。

显式重新加载所有活跃会话的 Skill 设置和内容，或仅重新加载提供的会话 ID：

```json
{ "sessionIds": ["session-1", "session-2"] }
```

省略 `sessionIds` 会刷新所有活跃会话。ID 必须是非空字符串，并按请求顺序去重；`[]` 返回零计数而不刷新会话或缓存。无效的请求格式返回 HTTP 400。在任何刷新开始之前，未知 ID 和由其他工作区拥有的 ID 返回 HTTP 404。选定的会话仅路由到其所属的执行引擎通道；无关通道不会收到刷新命令。

响应 (200)：

```json
{
  "sessionsRefreshed": 2,
  "sessionsFailed": 0,
  "configsRefreshed": 3,
  "configsFailed": 0,
  "reason": "all"
}
```

计数描述选定会话以及为其所有者通道刷新的共享/会话配置。选择控制即时会话刷新和命令通知；共享通道缓存可能会改变，而工作区事件仍限于工作区范围。显式请求不会更新 Skill 协调器的修订版或就绪状态。Skill 启用/禁用、安装/删除和自动协调保留其现有的完全刷新行为。此路由不会向 Skill 切换正文添加 `refreshRuntime` 或 `sessionIds`。

#### `POST /workspace/skills/:name/enable`

能力标签：`workspace_skill_settings_toggle`。工作区限定形式为 `POST /workspaces/:workspace/skills/:name/enable`。

更新某个名称的工作区 Skill 设置。启用时，守护进程首先根据最新的目录观察结果解析由扩展编写的名称，绕过保留数据和读取节流，并在需要时等待 ACP 以及守护进程本地回退；如果两个最新来源均失败，则在传统名称启发式方法之前使用保留的观察结果。名称不会针对目录进行验证。禁用操作不读取目录。修剪后的请求名称会传递给持久化层，并在响应中返回。启用任何名称都会记录一个工作区 `skills.enabled` 选择加入，即使在安装之前也是如此；禁用会移除该选择加入并添加一个工作区 `skills.disabled` 条目。对于不再加载的 Skills 的现有条目会被保留，目标名称的重复/大小写变体条目会被合并。从更高作用域继承的硬性 `skills.disabled` 条目对有效可用性仍具有权威性，但不会阻止工作区作用域记录或移除其自身的声明。否则，工作区声明参与常规的 `skills.disabled > skills.enabled > skills.defaultDisabled` 解析，并可覆盖更高作用域的 `skills.defaultDisabled` 或 `skills.enabled` 条目。

这与 ACP `qwen/skills/setEnabled` 托管技能操作和 `disable-model-invocation` frontmatter 字段不同。对于活动的 Extension 父级，有效的 Skill 可用性遵循 `skills.disabled` > `skills.enabled` > `skills.defaultDisabled` > 工作区内部覆盖 > manifest `skillStates` > 已启用。硬性禁用和默认禁用都会从斜杠命令/模型可用性中移除该技能，并拒绝后续的技能执行。`disable-model-invocation: true` 保持直接用户调用可用，仅将技能从模型调用中隐藏。

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

`activation` 独立于 `changed` 反映子进程的活动状态和任何所需的刷新。当 ACP 子进程处于活动状态且所有必需的刷新都成功时，它为 `applied`；当在活性检查时没有子进程处于活动状态，或者更改的请求在必需刷新期间失去了其子进程/会话时，它为 `deferred`；当至少一个其他必需的刷新失败时，它为 `partial`。因此，无操作可以是带有 `changed: false` 的 `applied` 或 `deferred`；当 `changed` 为 true 且激活状态为 `deferred` 时，子进程启动时会使用持久化的声明。繁忙的会话包含在必需的刷新中。守护进程重新加载 ACP 子进程和每个活动会话的工作区设置，通知 SkillManager 消费者，并推送 `available_commands_update`。已经发送给模型的请求不会被重写；后续的验证、命令快照和模型上下文使用新状态。如果持久化失败，则不会发出刷新或事件。如果会话刷新失败，则保留已提交的设置。当子进程返回每会话结果时，会话计数是准确的。如果刷新控制在返回这些结果之前本身失败，`sessionsFailed: 1` 是一个保守的下界，表明刷新请求失败。

错误：

- `400 {code: 'invalid_skill_name'}` — 路径参数为空，或超过 256 个字符。
- `400 {code: 'invalid_enabled_flag'}` — `enabled` 缺失或非布尔值。
- `403 {code: 'untrusted_workspace'}` — 选定的工作区不受信任。

该变更复用工作区范围的 `settings_changed` 事件来处理每个更改的键（`skills.disabled` 和/或 `skills.enabled`）；它不会添加新的事件类型。这些事件中的每一个都包含相同的 `mutation` 对象：`{ id, kind: 'skill_toggle', skills: [{ name, enabled }], activation, sessionsRefreshed, sessionsFailed }`。`id` 关联由单个切换请求产生的每个设置事件。`skills` 列出实际更改了工作区设置声明的请求名称和请求的启用值；更高作用域的设置可能使有效可用性保持不变。工作区技能状态单元格包含可选的 `disabledReason: 'hard' | 'default' | 'inactive_extension'` 和 `lockedScope: 'system' | 'user' | 'systemDefaults'` 字段。

#### `POST /workspace/skills/enable`

能力标签：`workspace_skill_settings_batch_toggle`。工作区限定形式为 `POST /workspaces/:workspace/skills/enable`。

在一个请求中更新最多 100 个名称的工作区 Skill 设置；上限计算去重前的原始 `skillNames` 条目数。名称经过修剪，并以不区分大小写的方式去重，同时保留首次出现的顺序和大小写。启用时，守护进程首先根据最新的目录观察结果解析由扩展编写的名称，绕过保留数据和读取节流，并在需要时等待 ACP 以及守护进程本地回退；如果两个最新来源均失败，则在传统名称启发式方法之前使用保留的观察结果。名称不会针对目录进行验证。禁用操作不读取目录。它在最多一次锁定的设置写入中应用所有 resulting 声明更改，并且如果有变化，则刷新活动会话一次。启用始终记录显式的工作区 `skills.enabled` 选择加入，包括尚未安装的名称，因此它可以覆盖 Extension 的内部禁用。重复相同的声明仍然是无操作。意外的持久化或运行时生成失败会导致整个请求失败。

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
    },
    {
      "skillName": "missing",
      "enabled": false,
      "changed": true
    }
  ],
  "errors": []
}
```

格式错误的请求返回 HTTP 400，伴随 `invalid_skill_names`、`invalid_skill_name` 或 `invalid_enabled_flag`。身份验证、工作区信任、客户端身份、意外的持久化失败和运行时生成失败通过标准路由门控导致整个请求失败。`errors` 为了线兼容性保留在响应中，对于结构上有效的名称为空。批次级别的 `activation`、`sessionsRefreshed` 和 `sessionsFailed` 描述子进程的活动状态以及所有更改结果共享的单个活动会话刷新。即使没有任何目标发生变化的批次，当子进程处于活动状态时仍可回答 `applied`，当不存在子进程时回答 `deferred`，这与单个 Skill 的无操作响应相匹配，因此请从每个结果的 `changed` 标志推导实际发生的变化。当至少一个目标发生变化时，守护进程发出与单个 Skill 路由相同的 `settings_changed` 变更元数据；该请求产生的每个 `skills.disabled` / `skills.enabled` 事件共享一个 `mutation.id`。

#### `PUT /skills/activation`

能力：`user_skill_activation`（当 User 设置持久化可用时通告）。此进程全局变更保存 User Skill 偏好，无需受信任的工作区或扫描已安装的 Skills。它使用常规的身份验证变更门控；可选的 `X-Qwen-Client-Id` 必须属于仍在管理的运行时，包括正在排空的运行时。

```json
{
  "skillNames": ["rust:pdf", "go:review"],
  "state": "enabled"
}
```

提供 1–100 个名称（每个最多 256 个字符）。名称经过修剪并以不区分大小写的方式去重。`state` 为 `enabled` 或 `disabled`。只有 `disabled` 接受 `mode`：`hard`（默认）或 `default`。名称不必已安装。无效批次在任何写入之前被拒绝。

Qwen 在设置写入锁下读取最新的用户设置，将每个显式名称添加到 `skills.enabled`、`skills.disabled` 或 `skills.defaultDisabled` 中，并在一次保存操作中从其他两个列表中移除该相同名称。其他名称、拼写、作用域和设置均保持不变。特别是，启用 `rust:pdf` 不会移除 `pdf` 限制。显式的裸名称保留现有的匹配规则。系统限制仍然适用。

```json
{
  "scope": "user",
  "state": "enabled",
  "results": [
    { "skillName": "rust:pdf", "changed": true },
    { "skillName": "go:review", "changed": true }
  ],
  "propagation": "queued"
}
```

禁用的响应还包括规范化的 `mode`。`propagation` 描述的是调度情况，而非实测可用性：`queued` 表示至少有一个活动运行时已将刷新加入队列；`deferred` 表示已保存的设置正等待运行时生命周期处理；`not_required` 表示此请求未更改任何内容。空操作既不写入也不发出事件，并且不确认早期刷新的完成情况。请读取现有的工作区配置和运行时 Skill 状态端点以获取有效状态。

成功的更改会使配置缓存失效，并广播带有 `scope: "user"` 的普通 `settings_changed` 事件。刷新会原子性地重新读取用户和工作区设置；失败的配置或会话刷新会为生命周期恢复和有限重试保留待处理的工作。现有的仅工作区刷新行为保持不变。

格式错误的输入返回 HTTP 400（`invalid_skill_names`、`invalid_skill_name`、`invalid_skill_activation_state` 或 `invalid_skill_activation_mode`）。在提交之前关闭的主运行时生成返回 HTTP 503 及 `Retry-After: 1`，与设置路由一致。SDK 暴露 `setUserSkillsActivation(skillNames, activation, { clientId? })` 并发送一个 PUT 请求，无需预先读取配置。

#### `POST /workspace/init`

能力标签：`workspace_init`。纯文件 IO — 无 ACP 往返，**无 LLM 调用**。

在守护进程的主工作区根目录下搭建一个空的 `QWEN.md`（或工作区 `context.fileName` 设置覆盖项）。仅限机械操作 — 对于由 AI 驱动的内容填充，请后续使用 `POST /session/:id/prompt`。

默认情况下，当目标文件存在且包含非空白内容时拒绝覆盖。仅包含空白的文件被视为不存在（符合本地 `/init` 斜杠命令的行为）。

请求：

```json
{ "force": false }
```

响应 (200)：

```json
{ "path": "/work/bound/QWEN.md", "action": "created" }
```

对于新建操作，`action` 为 `'created'`；当现有的仅包含空白的文件未被修改（未执行写入）时，为 `'noop'`；当 `force: true` 替换了非空内容时，为 `'overwrote'`。`workspace_initialized` SSE 事件镜像响应动作 — 观察者可以筛选 `action !== 'noop'` 以仅对实际磁盘更改做出反应。

错误：

- `400 {code: 'invalid_force_flag'}` — `force` 不是布尔值。
- `409 {code: 'workspace_init_conflict', path, existingSize}` — 文件存在且包含非空白内容，且省略了 `force` 或其值为 false。正文包含绝对路径和大小（字节），以便 SDK 客户端渲染“覆盖 N 字节？”提示而无需重新 stat。

SSE 事件（工作区范围）：带有 `{path, action, originatorClientId?}` 的 `workspace_initialized`。

#### `POST /workspace/mcp/reload`

将持久化的 MCP 设置重新加载到工作区发现配置和每个活动会话中。工作区限定形式为 `POST /workspaces/:workspace/mcp/reload`。

请求体：

```json
{ "forceReconnectAll": true }
```

`forceReconnectAll` 是可选的，默认为 `false`，保留增量协调。当为 true 时，守护进程在设置协调后重连每个符合条件的已配置 MCP 服务器。或者，传递 `forceReconnectWhich: ["server-a", "server-b"]` 仅重连命名服务器。这些选项互斥。强制重连会导致每个传输读取另一个本地 Qwen Code 进程可能写入令牌存储的凭据；它不会启动 OAuth 授权流程。

该路由返回 `202 { "accepted": true }`；轮询 `GET /workspace/mcp` 以获取最终连接状态。无效的选项值返回 400。

#### `POST /workspace/mcp/:server/restart`

能力标签：`workspace_mcp_restart`。Bridge → ACP extMethod `qwen/control/workspace/mcp/restart`。

通过 ACP 子进程的 `McpClientManager.discoverMcpToolsForServer` 重启已配置的 MCP 服务器（断开 + 重连 + 重新发现）。预检查来自 PR 14 v1 计账的活动预算快照，因此在对预算饱和的工作区进行重启时会返回软拒绝，而不是触发 `BudgetExhaustedError` 级联。

请求体为空（`{}`）。路径参数是 URL 编码的服务器名称，如 `mcpServers` 配置中所显示。

响应 (200) — 基于 `restarted` 的可辨识联合类型：

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

软跳过原因（全部返回 200）：

| `reason` | 含义 |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `'in_flight'` | 针对此服务器的另一个发现/重启已在进行中。该路由立即返回，而不等待原始 Promise。调用者应在短暂延迟后重试。 |
| `'disabled'` | 服务器已配置但列在 `excludedMcpServers` 中。请在重启前重新启用。 |
| `'budget_would_exceed'` | 守护进程处于 `--mcp-budget-mode=enforce` 状态，目标服务器当前不在 `reservedSlots` 中，且活动总数已达到 `clientBudget`。调用者应先释放一个槽位。 |

错误（非 2xx）：

- `400 {code: 'invalid_server_name'}` — 路径参数为空。
- `404` — 服务器名称不在 `mcpServers` 配置中，或者不存在活动的 ACP 通道（重启本质上需要一个活动的 `McpClientManager` 实例）。
- `500` — 内部错误（例如 `ToolRegistry` 未初始化）。

SSE 事件（工作区范围）：成功时带有 `{serverName, durationMs, originatorClientId?}` 的 `mcp_server_restarted`；软跳过时带有 `{serverName, reason, originatorClientId?}` 的 `mcp_server_restart_refused`。

#### `POST /workspaces/:workspace/language`

无会话的工作区 UI 语言同步，在设置持久化可用时注册。所有权：选定的运行时。解析工作区 ID 或编码后的绝对 cwd，要求有一个活动的受信任运行时，并根据该运行时验证客户端所有权。非活动生成返回 `503 workspace_runtime_unavailable`；未解析的选择器绝不会回退到主工作区。

请求：`{ "language": "zh" }`。语言使用与 `POST /language` 相同的受支持代码。仅持久化选定工作区的 `general.language`，然后读取其有效的合并设置，并通过带有 `scope: "workspace"` 的 `qwen/control/user/language` 同步已经活动的通道。冷通道被跳过，不会启动进程或创建对话。输出语言和模型设置保持不变；`syncOutputLanguage: true` 被拒绝。

响应的形状与 `POST /language` 相同，带有 `outputLanguage: null`；`language` 是有效的配置区域设置（包括 `auto`），且 `refresh` 仅统计选定的运行时。成功时会发出工作区 `language_changed` 事件。SDK 通过 REST 暴露 `client.workspaceByCwd(cwd).setUiLanguage(language)`，独立于会话传输。

#### `POST /language`

能力标签：`user_language_sync`（条件性 — 仅在设置持久化可用时通告，与 `workspace_settings` 的条件相同）。Bridge → ACP extMethod `qwen/control/user/language`，针对具有活动通道的每个受信任运行时。

无会话的 **用户级** 语言同步（issue #10234），适用于需要在任何会话存在之前切换语言的宿主（例如欢迎页面）。所有权分类：进程全局 — 它仅修改用户全局状态（`~/.qwen/settings.json`、全局 `~/.qwen/output-language.md`）以及尽力而为的运行时刷新，因此不需要工作区选择器或会话 ID。注册在非严格 `mutate()` 门控之后，与同级 `POST /session/:id/language` 匹配。

守护进程是唯一的写入者：它在扇出之前持久化 `general.language`（并且当 `syncOutputLanguage` 为 true 时，还包括 `general.outputLanguage` 和全局 `output-language.md`）。然后每个受信任的运行时切换其自身的进程 UI 语言并从磁盘重新加载用户范围设置；当 `syncOutputLanguage` 为 true 时，它还刷新每个本地会话的系统指令。与会话范围路由的区别：

- 项目绑定的输出语言文件不会被重写 — 如果会话的工作区拥有自己的 `.qwen/output-language.md`，则保留该覆盖项（在刷新时项目范围优先）。
- 零个会话和零个活动运行时通道被视为 **成功**，而不是错误；没有活动通道的运行时会被跳过（而非失败），并在其通道下次生成时读取持久化的文件。
- 不受信任的工作区运行时会被跳过，这与会话路由的 `403 untrusted_workspace` 姿态一致。

请求：

```json
{ "language": "zh", "syncOutputLanguage": true }
```

`language` 必须是 `/capabilities` `supportedLanguages` 中列出的代码之一（加上 `'auto'`）；`syncOutputLanguage` 默认为 `false`。

响应 (200)：

```json
{
  "language": "zh",
  "outputLanguage": "Chinese",
  "refresh": { "runtimes": 1, "sessions": 2, "failed": 0 }
}
```

`language` 是守护进程解析出的 UI 区域设置，因此 `'auto'` 请求可以返回具体的语言；宿主应读取持久化的 `general.language` 设置以获取选择器状态。当 `syncOutputLanguage` 为 false 时，`outputLanguage` 为 `null`。`refresh.runtimes` 统计通过活动通道应用了切换的运行时数量；`refresh.sessions` 汇总每个会话的系统指令刷新次数；`refresh.failed` 聚合每个会话的刷新失败和失败的运行时（扇出是尽力而为的，在持久化成功后绝不会导致请求失败）。

错误：

- `400 {code: 'invalid_language', allowed: [...]}` — 未知的语言代码。
- `400 {code: 'invalid_sync_flag'}` — `syncOutputLanguage` 不是布尔值。
- `400 {code: 'invalid_client_id'}` — `X-Qwen-Client-Id` 不是任何运行时已知的客户端（头部可选；当不存在会话时省略它）。
- `500 {code: 'persist_error'}` — 用户设置或输出语言文件写入失败；失败的步骤及其后的所有步骤均未运行（先前应用的步骤，如 `general.language` 写入，不会回滚）。
- `404` — 守护进程早于该路由，或者构建时未包含设置持久化（检查能力标签）。

SSE 事件（工作区范围，在每个运行时的会话总线上）：带有 `{language, outputLanguage, userLevel: true, originatorClientId?}` 的 `language_changed`。`userLevel: true` 标记将此扇出与会话路由的每会话事件区分开来，后者携带的是 `sessionId`。

### `GET /session/:id/events` (SSE)

订阅会话的事件流。

头部：

```
Accept: text/event-stream
Last-Event-ID: 42        ← optional, replays from after id 42
X-Qwen-Event-Epoch: ...  ← optional, pairs the cursor with its bus epoch
X-Qwen-Client-Id: ...    ← optional client identity and diagnostic correlation
```

查询参数：

| 参数 | 必需 | 备注 |
| ------------------ | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `maxQueued` | 否 | 每个订阅者的 **实时帧积压** 上限。范围 `[16, 2048]`，默认 256。在订阅时强制推送的重放帧不受帧和字节上限的限制；实际消耗它们的是在订阅者仍在排空大型 `Last-Event-ID: 0` 重放期间到达的实时事件。对于冷重连请提高此值，以便实时尾部在消费者赶上之前不会触发慢客户端警告 / 驱逐。实时序列化字节上限由守护进程端固定（默认 2 MiB），没有查询参数。超出范围 / 非十进制 / 存在但为空的值会在 SSE 握手打开之前返回 `400 invalid_max_queued`。预检 `caps.features.slow_client_warning` — 旧版守护进程会静默忽略此参数。 |
| `connectReason` | 否 | 客户端报告的诊断提示：`initial`、`resume`、`prompt_restart`、`stream_end`、`transport_error`、`state_resync` 或 `unknown`。无效值归一化为 `unknown`，且绝不会拒绝握手。守护进程不使用此字段进行身份验证、重放、驱逐、去重或流替换。 |
| `previousStreamId` | 否 | 客户端报告的先前接受的 REST/SSE 流的 UUID。无效值将被忽略。这仅是尽力而为的血缘关系，绝不会改变流行为。 |

成功的握手包括 `X-Qwen-SSE-Stream-Id: <uuid>`。浏览器网关必须保留该响应头并通过 `Access-Control-Expose-Headers` 暴露它。旧版守护进程或中间件可能会省略它；客户端必须继续正常操作并将血缘关系视为不可用。该 ID 标识此物理 REST/SSE 连接，并关联其守护进程生命周期、队列诊断和请求跟踪。

帧格式。`data:` 行是 **完整的事件信封**，以单行 JSON 字符串形式呈现 — `{id?, v, type, data, originatorClientId?}`。ACP 特定的载荷（`sessionUpdate`、`requestPermission` 参数等）位于信封的 `data` 字段下；信封自身的 `type` 与 SSE `event:` 行匹配。

```
id: 7
event: session_update
data: {"id":7,"v":1,"type":"session_update","data":{"sessionUpdate":"agent_message_chunk","content":{"type":"text","text":"…"}}}

id: 8
event: permission_request
data: {"id":8,"v":1,"type":"permission_request","data":{"requestId":"<uuid>","sessionId":"<sid>","toolCall":{...},"options":[...]}}

: heartbeat              ← every 15s, no payload

event: client_evicted    ← terminal frame, no id (synthetic)
data: {"v":1,"type":"client_evicted","data":{"reason":"queue_overflow","droppedAfter":42,"queueSize":256,"maxQueued":256,"queuedBytes":1800000,"maxQueuedBytes":2097152}}

event: client_evicted    ← terminal frame for byte overflow, no id (synthetic)
data: {"v":1,"type":"client_evicted","data":{"reason":"queue_bytes_overflow","droppedAfter":43,"queueSize":1,"maxQueued":256,"queuedBytes":1900000,"maxQueuedBytes":2097152,"eventBytes":300000}}
```

SSE 级别的 `id:` / `event:` 行重复了 `envelope.id` / `envelope.type` 以兼容 EventSource。原始 `fetch` 消费者（SDK 的 `parseSseStream`）从 JSON 信封读取所有内容并忽略 SSE 前导行。

| 事件类型 | 触发条件 |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `session_update` | 任何 ACP `sessionUpdate` 通知（LLM 块、工具调用、用量） |
| `permission_request` | Agent 请求工具批准 |
| `permission_resolved` | 某些客户端通过 `POST /permission/:requestId` 对权限进行了投票 |
| `permission_partial_vote` | （仅限共识）记录了一次投票但尚未达到法定人数。携带 `{requestId, sessionId, votesReceived, votesNeeded, quorum, optionTallies}`。预检 `caps.features.permission_mediation`。 |
| `permission_forbidden` | 投票被活动策略拒绝（`designated` 不匹配、`local-only` 非环回，或 `consensus` 投票者不在快照中）。携带 `{requestId, sessionId, clientId?, reason}`。预检 `caps.features.permission_mediation`。 |
| `model_switched` | `POST /session/:id/model` 成功 |
| `model_switch_failed` | `POST /session/:id/model` 被拒绝 |
| `session_died` | Agent 子进程意外崩溃。**终止性：在此帧之后 SSE 流关闭；会话已从 `byId` 中消失。** 订阅者应通过 `POST /session` 重连以生成一个新的会话。 |
| `slow_client_warning` | 订阅者本地：实时帧积压或实时序列化字节积压达到 ≥ 75%。**非终止** — 流继续；该警告是在驱逐前的提示。携带 `{queueSize, maxQueued, lastEventId, queuedBytes?, maxQueuedBytes?, threshold?}`，其中 `threshold` 为 `frames`、`bytes` 或 `frames_and_bytes`。每次溢出事件仅触发一次；当两项测量值均降至 37.5% 以下时重新启用。无 `id`（合成）。预检 `caps.features.slow_client_warning`。 |
| `client_evicted` | 订阅者本地：队列溢出。`reason` 对于实时帧上限为 `queue_overflow`，对于实时序列化字节上限为 `queue_bytes_overflow`。**终端：SSE 流在此帧后关闭**（无 `id` — 合成）。同一会话上的其他订阅者继续。 |
| `stream_error` | 守护进程端在扇出期间发生错误。**终止：SSE 流在此帧后关闭**（无 `id` — 合成）。 |

重连语义：

- 发送 `Last-Event-ID: <n>` 以从每个会话的环形缓冲区中重放具有 `id > n` 的事件（默认深度 **8000**，可通过 `qwen serve --event-ring-size <n>` 调整）。
- **间隙检测：**在同一纪元内，如果第一个保留的环形缓冲区 ID 大于 `<n> + 1`，则守护进程会发出一个无 ID 的 `state_resync_required` 帧，其 `reason: 'ring_evicted'` 位于重放存活后缀之前。其他原因为 `epoch_reset`、`seeded_replay_not_in_ring` 和 `replay_budget_exceeded`；预算信号跟随已交付的重放前缀。有关其触发器、游标字段和恢复规则，请参阅 [resync reasons and ordering](./daemon/09-event-schema.md#resync-reasons-and-ordering)。
- SDK 锁定 `awaitingResync`；客户端应调用 `POST /session/:id/load` 并从当前有界重放快照窗口重建。当较旧的内存重放条目被丢弃时，该快照本身可能以 `history_truncated` 开头；此标记仅供参考，不得启动另一个 resync 循环。其可选的分页锚点 [frozen at replay-window eviction](./daemon/09-event-schema.md#history-truncation-anchor)。
- ID 在会话的事件总线纪元内单调递增，从 1 开始。被拒绝的发布不得消耗 ID；参见 [event sequence invariants](./daemon/09-event-schema.md#state-and-forward-compatibility)。
- 合成帧（`client_evicted`、`slow_client_warning`、`stream_error`、`state_resync_required`、`replay_complete`）有意省略 `id`，以免为其他订阅者消耗序列槽位。`replay_complete` 标记重放的结束，包括空或不完整的重放；它并不意味着 resync 已完成。

背压：

- 每个订阅者的队列默认为 `maxQueued: 256` 个实时项目加上守护进程拥有的 2 MiB 实时序列化字节上限。重连期间的重放帧、`slow_client_warning` 和 `client_evicted` 绕过这两个上限。
- 仅通过 SSE 请求上的 `?maxQueued=N`（范围 `[16, 2048]`）覆盖帧上限。故意没有 `?maxQueuedBytes`；客户端不能提高守护进程的内存预算。
- 当订阅者的实时帧积压或实时字节积压超过 75% 满时，总线向该订阅者强制推送一个 `slow_client_warning` 合成帧（每次溢出事件一次；当两项测量值均降至 37.5% 以下时重新启用）。流保持打开 — 该警告是提示，以便客户端可以更快地排空或干净地断开 + 重连。
- 如果实时帧上限溢出，总线发出带有 `reason: "queue_overflow"` 的 `client_evicted`。空的实时队列允许一个超大事件不变地进入。在拒绝非空队列中的字节溢出之前，当其 `fallbackText` 非空时，总线可能会将整个 MCP App 的 `rawOutput.html` 降级为 `''`。如果该副本适合，则在不进行驱逐或 resync 信号的情况下继续交付。否则，它发出 `reason: "queue_bytes_overflow"`。在任何一种驱逐情况下，都会强制推送终止帧并关闭订阅。
- 这种可选的 App 降级仅影响排队交付。直接交付和重放环形缓冲区保留原始内容；压缩重放窗口应用其自身的预算。降级副本携带与原始环形缓冲区条目相同的事件 ID。因此，带 ID 的已交付载荷不必等于环形缓冲区的载荷，并且在该 ID 之后恢复将无法恢复其 HTML。需要文档的客户端必须显式重新分页持久化转录本，这也受页面大小限制的影响。

### `POST /session/:id/permission/:requestId`

投出下面记录的相同选票，但将其路由通过拥有命名实时会话的运行时。新的多工作区集成应使用此形式而不是遗留的进程全局路由。预检 `caps.features.session_permission_vote`。

请求体、调解策略、结果和成功响应与 `POST /permission/:requestId` 完全相同。可选的 `X-Qwen-Client-Id` 头参与指定和共识策略。如注所述，故障使用稳定的 `code` 值；格式错误的输入和丢失的待处理请求竞争可以省略 `code`：

- `400` — 格式错误的投票体（无 `code`）或无效的客户端身份（`invalid_client_id`），或者当所选选项未被提供时的 `invalid_option_id`。请重新阅读提供的选项，而不是重试相同的投票。
- `403` — 当活动策略拒绝投票者时为 `permission_forbidden`，或当非主属工作区未受信任时为 `untrusted_workspace`。不受信任的主属所有者可豁免此信任检查，且其投票可能被接受。
- `404` — 当不存在活跃所有者时为 `session_not_found`，或当请求不处于待处理状态时无 `code`。
- `500` — 当代理的 `allowedOptionIds` 包含保留的 `__cancelled__` 哨兵值时为 `cancel_sentinel_collision`，或当多个工作区声称拥有该会话时为 `ambiguous_session_owner`。
- `501` — 对于当前构建版本未实现的策略为 `permission_policy_not_implemented`。
- `503` — 当所属运行时不可用时为 `workspace_runtime_unavailable`，或当守护进程不再接受工作时为 `daemon_draining`。

它绝不会针对主桥接器重试。TypeScript SDK 方法为 `respondToSessionPermission()`。

### `POST /permission/:requestId`

对待处理的 `permission_request` 进行投票。活动的 **调解策略** 决定谁获胜：

| 策略 | 行为 |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `first-responder`（默认） | 任何经过验证的投票者获胜；后续投票者获得 `404`。F3 之前的基线。 |
| `designated` | 只有提示发起者 (`originatorClientId`) 决定；非发起者获得 `403 permission_forbidden / designated_mismatch`。对于匿名提示回退到首个响应者。 |
| `consensus` | N-of-M 投票者必须达成一致（默认 `N = floor(M/2) + 1`，通过 `policy.consensusQuorum` 覆盖）。首先达到 `N` 的选项获胜。未解决的投票会收到 `200` + `permission_partial_vote` SSE 帧。 |
| `local-only` | 仅回环地址投票者决定；远程调用者获得 `403 permission_forbidden / remote_not_allowed`。 |

当前策略在 `settings.json` 中的 `policy.permissionStrategy` 下配置，并在 `/capabilities` 的 `body.policy.permission` 处显示。预检 `caps.features.permission_mediation`（带有 `modes: [...]`）以获取构建支持的集合。

> **F3 (#4175)：多客户端权限协调。** F3 添加了上述四种策略。F3 之前的守护进程硬编码了首个响应者；当配置的策略为 `first-responder` 时，线格式保持逐位不变。新事件（`permission_partial_vote`, `permission_forbidden`）是附加性的——旧 SDK 将它们视为 `unrecognized_known_event` 并优雅地忽略。

> **权限超时（默认禁用）。** `permission_request` 将保持待处理状态，直到：(a) 某些客户端在此处投票，(b) `POST /session/:id/cancel` 触发，(c) 驱动提示词的 HTTP 客户端断开连接（提示词中途取消会将未决权限解析为 `cancelled`），(d) 会话被终止，(e) 守护进程关闭，**或 (f) 其配置的超时时间到达**。超时触发时，代理的 `requestPermission` 解析为 `{outcome: 'cancelled'}`，审计环形缓冲区记录一条 `permission.timeout` 条目，守护进程 stderr 输出一行面包屑日志，并且 SSE 总线广播标准的 `permission_resolved` 已取消帧以便订阅者清理。共享超时可通过 `BridgeOptions.permissionResponseTimeoutMs` 或 `qwen serve --permission-response-timeout-ms` 配置。其默认值为 `0`，因此普通权限和 `ask_user_question` 都会无限期等待人工决策。投票者取消、会话取消、断开连接清理以及守护进程关闭仍会将待处理的交互解析为已取消。

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

- `{ "outcome": "selected", "optionId": "<one-of-the-options>" }` — 接受 / 拒绝 / 继续一次 / 等，根据代理提供的选项
- `{ "outcome": "cancelled" }` — 丢弃请求（与内部 `cancelSession` / `shutdown` 的行为一致）

响应：

- `200 {}` — 您的投票已被接受（在共识法定人数下已解决或已记录）
- `400` — 格式错误的投票正文（无 `code`）、`invalid_client_id`，或当选定的选项未被提供时为 `invalid_option_id`；请重新读取提供的选项，而不是重试相同的投票
- `403 { "code": "permission_forbidden", "reason": "designated_mismatch" | "remote_not_allowed", "requestId", "sessionId" }` — F3：当前策略拒绝了您的投票
- `404 { "error": "..." }` — requestId 未知（已解决、从未存在或会话已拆除）
- `500 { "code": "cancel_sentinel_collision", ... }` — F3：代理的 `allowedOptionIds` 包含保留哨兵值 `'__cancelled__'`；代理/守护进程契约违规
- `501 { "code": "permission_policy_not_implemented", "policy": "<name>" }` — F3 向前兼容：策略字面量已进入架构但其调解器分支尚未构建（目前不可达；为未来策略预留）

成功投票后，每个连接的客户端都会看到具有相同 `requestId` 和选定 `outcome` 的 `permission_resolved`。在 `consensus` 下，中间投票还会额外广播 `permission_partial_vote` 直到达到法定人数。

### 认证设备流路由 (issue #4175 PR 21)

守护进程代理 OAuth 2.0 设备授权授予 (RFC 8628)，以便远程 SDK 客户端可以触发登录，其令牌落在 **守护进程** 文件系统上——而不是在客户端上。守护进程自行轮询 IdP；客户端的唯一任务是显示验证 URL + 用户代码，并（可选地）订阅 SSE 以获取完成事件。

能力标签：`auth_device_flow`（始终通告）。v1 中支持的提供商：`qwen-oauth`。

> [!note]
>
> Qwen OAuth 免费层级已于 2026-04-15 停止服务。在本协议中将 `qwen-oauth` 视为遗留的 v1 提供商标识符；新客户端应在有可用选项时优先选择当前支持的认证提供商。

**运行时局部性。** 守护进程从不启动浏览器——即使它可以。客户端决定是否本地调用 `open(verificationUri)`；在无头 Pod（标准模式 B 部署）上，用户在拥有浏览器的任何设备上打开 URL。有关推荐的 UX，请参阅 `docs/users/qwen-serve.md`。

**事件中无令牌泄露。** `auth_device_flow_started` 仅携带 `{deviceFlowId, providerId, expiresAt}`。用户代码和验证 URL 通过 POST 201 正文点对点返回，并通过 `GET /workspace/auth/device-flow/:id` 返回；它们绝不会在 SSE 上广播。

**每提供商单例。** 当流程处于待定状态时，对同一提供商的第二次 `POST` 是幂等的接管——它返回带有 `attached: true` 的现有条目，而不是启动新的 IdP 请求。

#### `POST /workspace/auth/device-flow`

严格变更门控：无令牌的受信回环主请求通过。到达门控时无受信回环权限的无令牌主请求将收到 `401 token_required`；缺失或无效的配置凭据以及未配对的本地控制凭据会在更早阶段被拒绝，返回普通的 `401 Unauthorized`。

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
- `409 too_many_active_flows` — 工作区上限 (4) 已达到；使用 `DELETE` 取消其中一个
- `401 token_required` — 严格门控拒绝了无受信回环权限的无令牌主请求
- `502 upstream_error` — IdP 返回了意外错误

#### `GET /workspace/auth/device-flow/:id`

读取当前状态。待定条目回显 `userCode/verificationUri/expiresAt/intervalMs`；终端条目（5 分钟宽限期）删除它们并显示 `status` + 可选的 `errorKind/hint`。

对于未知 ID 和宽限期后被驱逐的条目返回 `404 device_flow_not_found`。

#### `DELETE /workspace/auth/device-flow/:id`

幂等取消：

- 待定条目 → `204` + 发出 `auth_device_flow_cancelled`
- 终端条目 → `204` 空操作（不重新发出事件）
- 未知 ID → `404`

#### `GET /workspace/auth/status`

待定流程和受支持提供商的快照：

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

五种类型化事件（工作区范围，广播到每个活动会话总线）：

- `auth_device_flow_started` `{deviceFlowId, providerId, expiresAt}` — POST 成功；SDK 应进行订阅（此处无 userCode，如有需要请通过 GET 获取）
- `auth_device_flow_throttled` `{deviceFlowId, intervalMs}` — daemon 已遵循上游 `slow_down`；轮询 GET 的客户端应将间隔调整为匹配值
- `auth_device_flow_authorized` `{deviceFlowId, providerId, expiresAt?, accountAlias?}` — 凭据已持久化；`accountAlias` 是一个非 PII 标签（绝不包含邮箱/电话）
- `auth_device_flow_failed` `{deviceFlowId, errorKind, hint?}` — 终止状态；`errorKind` 是 `expired_token | access_denied | invalid_grant | upstream_error | persist_failed` 之一。`persist_failed` 为 daemon 内部错误：IdP 交换成功，但 daemon 无法持久存储凭据（EACCES / EROFS / ENOSPC）。用户应在底层磁盘条件修复后重试一次。
- `auth_device_flow_cancelled` `{deviceFlowId}` — DELETE 针对待处理条目执行成功

> **不兼容 MCP。** MCP 授权规范 (2025-06-18) 强制要求使用带有重定向回调的 OAuth 2.1 + PKCE 授权码流程，这不适用于无头 Pod daemon。模式 B 的设备流界面是 daemon 私有的——面向符合 MCP 标准的服务器的客户端应使用不同的认证路径。

### 会话附件分块上传

能力：`session_attachment_chunk_upload`。以下四条路由均由活动会话的运行时拥有并执行变更操作。它们使用现有的 bearer 令牌和可选的 `X-Qwen-Client-Id` 标头。上传归属于其创建时的会话存储和确切的客户端身份；省略的身份与命名的身份是不同的。

设 `U = /session/:id/attachment-uploads`：

| 请求 | 正文 | 响应 |
| ---------------------------------- | ------------------------------------------------- | ------------------------------------------------------------------------------- |
| `POST U` | JSON `{ name, mimeType, size }`，最大 4 KiB | 201 `{ uploadId }` |
| `POST U/:uploadId/chunks?offset=N` | 原始 `application/octet-stream`，最大 512 KiB | 200 `{ offset }`，下一个字节偏移量 |
| `POST U/:uploadId/complete` | 无需正文；JSON 正文会被解析并忽略 | 200 现有附件引用 `{ type, attachmentId, mimeType, size }` |
| `DELETE U/:uploadId` | 空 | 对于接收中、失败或不存在的上传返回 204；对于完成中或已完成的状态返回 409 |

最大附件大小仍为 8 MiB。元数据遵循现有的文件名/MIME 规则；空的图像文件无效。发送顺序的 512 KiB 分块，最后一个分块需包含精确的剩余部分。仅允许使用相同的偏移量、长度和字节重试紧邻的前一个分块。间隙、重叠、更改的重试或过早完成将返回 409；格式错误的输入返回 400，超大输入返回 413，不支持的分块媒体类型或 JSON 字符集返回 415 `invalid_attachment_upload_content_type`。创建和分块请求上不支持的请求编码返回 415 `invalid_attachment_upload_encoding`。未知、过期或所有权不同的上传 ID 在三个 POST 路由上返回 404；DELETE 对不存在的上传返回 204，在完成期间或之后返回 409。创建和分块请求不接受压缩正文。完成路由使用全局 JSON 解析器，因此有效的压缩 JSON 正文可能会被忽略，而格式错误的 JSON 会在完成前被拒绝。

完成操作在存储前后验证会话/客户端/运行时的所有权。并发或重复的完成操作会返回相同的结果而不进行另一次写入。并发的会话副本暂时返回 `503 attachment_upload_store_busy` 且带有 `retryable: true`；在复制结束后，暂存的字节仍可使用相同的上传 ID 进行完成。实际的存储故障对该上传 ID 而言仍是终止性的。接收中的上传在创建五分钟后过期。成功/失败回执在五分钟后过期，每个 daemon 进程最多限制为 1024 个。会话关闭/删除以及最终客户端注销会使未完成的上传失效。只有已完成的附件才能被读取、引用或复制。DELETE 无法回滚正在最终确定或已完成的附件；即使响应丢失，已完成的文件也可能保留。

暂存区限制为单个进程中所有运行时的 128 MiB 和 32 个活跃上传，每个会话存储最多八个活跃上传。资源耗尽时返回 `429 attachment_upload_capacity_exceeded`；现有的请求速率限制同样适用。这是暂存缓冲区限制，而非总进程内存限制。临时 ID 不会在 daemon 重启后存活。

当广告该协议时，TypeScript SDK 会自动对大于 512 KiB 的附件使用此协议，每个客户端有两个并发文件和顺序分块。即使在 ACP 传输下也使用经过认证的 REST，缓存有效的发现信息 60 秒，并为较小的文件和较旧的 daemon 保留现有的原始端点。在网络错误、请求超时或 502/503/504 后，追加/完成操作最多重试两次；速率限制重试在五分钟的操作期限内遵循 `Retry-After`。模糊的创建和容量故障不会重试。失败的上传获得一次独立的两秒清理尝试。`DaemonAttachmentUploadError` 保留原因和 `httpStatus`；其 `status` 省略了上传内部的 404，以免消费者将其误认为是受支持的传统附件路由。

有关生命周期和兼容性详情，请参阅 [完整设计](../design/session-attachment-chunk-upload.md)。

### 模型目录重载

`workspace_model_reload` 能力广告 `POST /workspaces/:workspace/models/reload`。此经过认证的、受信任的、选定运行时的变更操作重新读取用户和工作区范围的设置，刷新选定运行时的环境覆盖层，并在重建模型提供者配置之前在其 ACP 子进程中重新应用环境。环境更改支持提供者凭据并可包含其他环境键；它们不会在响应或设置事件中报告。daemon 进程环境和工作流启用保持不变。它返回 `{ "status": "applied" | "deferred" | "failed" }`；`deferred` 意味着没有活动的 ACP 子进程应用了目录。它不会获取平台目录、写入设置、切换活动对话模型或广播设置事件。之后读取现有会话的 `/session/:id/context` 以获取其当前可选模型；在会话创建之前，读取选定工作区的提供者。未知、不受信任、排空或已关闭的运行时不会回退到主要运行时。

## 流式传输线格式

事件作为标准 EventSource 帧发出。Daemon 每帧写入一行 `data:`（JSON 在 `JSON.stringify` 后没有嵌入换行符）；位于 `packages/sdk-typescript/src/daemon/sse.ts` 的 SDK 解析器在处理接收端时同时支持这种形式和规范允许多 `data:` 的形式。

## 流式传输期间的错误帧

如果桥接迭代器在为 SSE 订阅者提供服务时抛出异常，daemon 会发出一个终止的 `stream_error` 帧（无 `id`）。`data:` 行是完整的信封（与本文件中其他所有 SSE 帧的形状相同）；实际的错误消息位于 `envelope.data.error` 下：

```
event: stream_error
data: {"v":1,"type":"stream_error","data":{"error":"<message>"}}
```

然后连接关闭。

## 环境变量

| 变量 | 用途 |
| ------------------- | -------------------------------------------------------------- |
| `QWEN_SERVER_TOKEN` | Bearer token。启动时去除首尾空白字符。 |

## 源码布局

| 路径 | 用途 |
| ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `packages/cli/src/commands/serve.ts` | yargs 命令 + flag 模式 |
| `packages/cli/src/serve/run-qwen-serve.ts` | 监听器生命周期 + 信号处理 |
| `packages/cli/src/serve/server.ts` | Express 应用组装、中间件排序及剩余直接路由 |
| `packages/cli/src/serve/routes/*.ts` | 专用 Express 路由组，包括会话、SSE、工作区认证、工作区状态和文件路由 |
| `packages/cli/src/serve/auth.ts` | bearer + Host 白名单 + CORS 拒绝 |
| `packages/cli/src/serve/acp-session-bridge.ts` | CLI 本地桥接兼容门面，用于 spawn-or-attach、每会话 FIFO 和权限注册表 |
| `packages/acp-bridge/src/status.ts` | 只读守护进程状态线格式类型 + `ServeErrorKind` + `BridgeTimeoutError` + `mapDomainErrorToErrorKind` |
| `packages/cli/src/serve/env-snapshot.ts` | 纯辅助函数，从 `process.*` 状态构建 `/workspace/env` 载荷，包括凭证脱敏 |
| `packages/acp-bridge/src/eventBus.ts` | 有界异步队列 + 重放环形缓冲区 |
| `packages/sdk-typescript/src/daemon/DaemonClient.ts` | TS 客户端 |
| `packages/sdk-typescript/src/daemon/sse.ts` | EventSource 帧解析器 |
| `integration-tests/cli/qwen-serve-routes.test.ts` | 18 个用例，无 LLM |
| `integration-tests/cli/qwen-serve-streaming.test.ts` | 3 个用例，真实 `qwen --acp` 子进程由本地 fake OpenAI 服务器支持（仅限 POSIX；在 Windows 上跳过） |
