# Daemon REST API 参考

这是运行 `qwen serve --no-web` 并提供自有 UI 的集成所使用的公共 REST/SSE 接口。请先阅读[集成指南](./rest-api-integration.md)，然后使用本页面进行端点发现，并参考 [HTTP 协议参考](./qwen-serve-protocol.md) 了解详细的生命周期语义。

## OpenAPI

经过整理的 25 个操作契约以 [OpenAPI 3.1 JSON](https://raw.githubusercontent.com/QwenLM/qwen-code/main/docs/developers/daemon-rest-api.openapi.json) 形式提供。将该 URL 导入兼容 OpenAPI 的渲染器、客户端生成器或验证工具。已提交的 JSON 是下方索引操作的便携接口契约，并在 CI 中根据指南、协议标题和已注册路由进行了验证。

本索引涵盖 daemon REST 接口中经过整理的核心子集，而非全部内容。索引之外包括第一方 Web Shell 路由、条件内部表面以及其他公开但非核心的路由：文件变更、工作区注册、会话组织与 generation，以及工作区 MCP、skill 和 provider 等。这些表面由各自的能力标签进行通告；[HTTP 协议参考](./qwen-serve-protocol.md) 记录了会话、工作区状态和文件表面，MCP 服务器管理、认证提供者和设备流登录则由 [daemon 认证与安全说明](./daemon/12-auth-security.md) 覆盖。它们不在本契约范围内，但并未被弃用。

## 阅读索引

- **Capability** 是在 `GET /capabilities` 中需要检查的功能标签。破折号表示该操作没有专属的功能标签；需要支持较旧 daemon 构建版本的客户端应处理 `404`。
- **Scope** 指明哪个运行时拥有该操作。`process-global` 读取 daemon 全局状态，`selected-runtime` 使用请求的工作区选择，`persisted-workspace` 解析持久化会话存储，`live-session-owner` 通过实时会话进行路由，`legacy-primary` 始终定位 daemon 的主工作区。`GET /session/:id/export` 固定为主工作区：它仅在托管内部运行时中解析，然后回退到主工作区。
- 本索引中的所有操作在 v1 REST 契约中均为 **stable**。已弃用的 `unstable_session_resume` 能力名称仅为别名；请使用 `session_resume` 作为稳定的 resume 路由。

## Discovery

| Operation                                                        | Capability     | Scope            | TypeScript SDK              |
| ---------------------------------------------------------------- | -------------- | ---------------- | --------------------------- |
| [`GET /health`](./qwen-serve-protocol.md#get-health)             | `health`       | `process-global` | `DaemonClient.health`       |
| [`GET /capabilities`](./qwen-serve-protocol.md#get-capabilities) | `capabilities` | `process-global` | `DaemonClient.capabilities` |

## 会话生命周期

| Operation                                                                         | Capability          | Scope                | TypeScript SDK                       |
| --------------------------------------------------------------------------------- | ------------------- | -------------------- | ------------------------------------ |
| [`POST /session`](./qwen-serve-protocol.md#post-session)                          | `session_create`    | `selected-runtime`   | `DaemonClient.createOrAttachSession` |
| [`POST /session/:id/load`](./qwen-serve-protocol.md#post-sessionidload)           | `session_load`      | `selected-runtime`   | `DaemonClient.loadSession`           |
| [`POST /session/:id/resume`](./qwen-serve-protocol.md#post-sessionidresume)       | `session_resume`    | `selected-runtime`   | `DaemonClient.resumeSession`         |
| [`POST /session/:id/heartbeat`](./qwen-serve-protocol.md#post-sessionidheartbeat) | `client_heartbeat`  | `live-session-owner` | `DaemonClient.heartbeat`             |
| [`PATCH /session/:id/metadata`](./qwen-serve-protocol.md#patch-sessionidmetadata) | `session_metadata`  | `live-session-owner` | `DaemonClient.updateSessionMetadata` |
| [`POST /session/:id/model`](./qwen-serve-protocol.md#post-sessionidmodel)         | `session_set_model` | `live-session-owner` | `DaemonClient.setSessionModel`       |
| [`DELETE /session/:id`](./qwen-serve-protocol.md#delete-sessionid)                | `session_close`     | `live-session-owner` | `DaemonClient.closeSession`          |

## 提示与事件

| Operation                                                                                   | Capability           | Scope                 | TypeScript SDK                          |
| ------------------------------------------------------------------------------------------- | -------------------- | --------------------- | --------------------------------------- |
| [`GET /session/:id/status`](./qwen-serve-protocol.md#get-sessionidstatus)                   | `session_status`     | `live-session-owner`  | `DaemonClient.sessionStatus`            |
| [`POST /session/:id/prompt`](./qwen-serve-protocol.md#post-sessionidprompt)                 | `session_prompt`     | `live-session-owner`  | `DaemonClient.promptNonBlocking`        |
| [`POST /session/:id/cancel`](./qwen-serve-protocol.md#post-sessionidcancel)                 | `session_cancel`     | `live-session-owner`  | `DaemonClient.cancel`                   |
| [`GET /session/:id/events`](./qwen-serve-protocol.md#get-sessionidevents-sse)               | `session_events`     | `live-session-owner`  | `DaemonClient.subscribeEvents`          |
| [`GET /session/:id/transcript`](./qwen-serve-protocol.md#get-sessionidtranscript)           | `session_transcript` | `persisted-workspace` | `DaemonClient.getSessionTranscriptPage` |
| [`GET /session/:id/context`](./qwen-serve-protocol.md#get-sessionidcontext)                 | `session_context`    | `live-session-owner`  | `DaemonClient.sessionContext`           |
| [`GET /session/:id/export`](./qwen-serve-protocol.md#get-sessionidexport)                   | `session_export`     | `legacy-primary`      | `DaemonClient.exportSession`            |
| [`GET /session/:id/pending-prompts`](./qwen-serve-protocol.md#get-sessionidpending-prompts) | —                    | `live-session-owner`  | `DaemonClient.getPendingPrompts`        |

`POST /session/:id/prompt` 在提示进入队列时返回 `202`，而非 Agent 完成时。请先订阅，然后通过 `promptId` 关联 `turn_complete` 或 `turn_error`。

## 权限

| Operation                                                                                               | Capability                | Scope                | TypeScript SDK                            |
| ------------------------------------------------------------------------------------------------------- | ------------------------- | -------------------- | ----------------------------------------- |
| [`POST /session/:id/permission/:requestId`](./qwen-serve-protocol.md#post-sessionidpermissionrequestid) | `session_permission_vote` | `live-session-owner` | `DaemonClient.respondToSessionPermission` |
| [`POST /permission/:requestId`](./qwen-serve-protocol.md#post-permissionrequestid)                      | `permission_vote`         | `legacy-primary`     | `DaemonClient.respondToPermission`        |

新的多工作区集成应始终使用会话作用域路由。旧版路由对属于另一个运行时的请求可能返回与已解决投票相同的 `404`。

## 只读工作区上下文

| Operation                                                             | Capability             | Scope            | TypeScript SDK                        |
| --------------------------------------------------------------------- | ---------------------- | ---------------- | ------------------------------------- |
| [`GET /workspace/tools`](./qwen-serve-protocol.md#get-workspacetools) | —                      | `legacy-primary` | `DaemonClient.workspaceTools`         |
| [`GET /file`](./qwen-serve-protocol.md#get-file)                      | `workspace_file_read`  | `legacy-primary` | `DaemonClient.readWorkspaceFile`      |
| [`GET /file/bytes`](./qwen-serve-protocol.md#get-filebytes)           | `workspace_file_bytes` | `legacy-primary` | `DaemonClient.readWorkspaceFileBytes` |
| [`GET /stat`](./qwen-serve-protocol.md#get-stat)                      | `workspace_file_read`  | `legacy-primary` | `DaemonClient.fileStat`               |
| [`GET /list`](./qwen-serve-protocol.md#get-list)                      | `workspace_file_read`  | `legacy-primary` | `DaemonClient.dirList`                |
| [`GET /glob`](./qwen-serve-protocol.md#get-glob)                      | `workspace_file_read`  | `legacy-primary` | `DaemonClient.glob`                   |

这些单一路由定位主工作区。暴露多个已注册工作区的集成应使用完整协议中记录的工作区限定对应路由，并预检 `workspace_qualified_rest_core`。

## 通用协议规则

- 使用 `Authorization: Bearer <token>` 对常规路由进行认证。默认的本地回环 `/health` 探测可以豁免；非本地回环绑定则不可豁免。
- 当 create/load 响应提供了 `X-Qwen-Client-Id` 时发送该头。它是一个附加和归因标识符，而非终端用户安全主体。
- 将错误体视为附加信息。主要根据 HTTP 状态码以及稳定的 `code` 或 `errorKind`（如果存在）进行分支处理。
- 保留 SSE 响应头并禁用代理缓冲。当 daemon 提供了 epoch 时，同时使用 `Last-Event-ID` 和 `X-Qwen-Event-Epoch` 进行恢复。
- 工作区信任边界不是租户隔离。当安全主体或进程级故障边界必须独立时，请运行独立的 daemon。