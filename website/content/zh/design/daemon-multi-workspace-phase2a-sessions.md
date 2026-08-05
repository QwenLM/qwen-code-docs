# Phase 2a 多工作区会话基础

> **历史状态：** 本文档记录的是 Phase 2a/早期 Phase 2b 的序列，而不是当前完整的面。所有权模型、失败语义、资源边界和剩余的仅主工作空间路由，现在由
> [`daemon-multi-workspace-hardening.md`](./daemon-multi-workspace-hardening.md) 定义。这里记录的活跃会话 rewind 快照、rewind 和 shell 限制已被
> [`daemon-multi-workspace-session-file-ops.md`](./daemon-multi-workspace-session-file-ops.md) 取代。活跃会话 continue、language 和 artifact 变更操作后来被归为仅主工作空间的分类也已被取代：这些单数 REST 路由现在分发到拥有该会话的受信任工作空间运行时。其他阶段范围内的表述也可能被后续设计记录取代，不得将其视为当前的路由清单。

## 概述

本文档记录了在 Phase 1 `WorkspaceRegistry` PR、Phase 2a 基础 PR 和第一个 Phase 2b 路由扩展 PR 之后，issue #6378 的多工作区会话契约。Phase 2a 被拆分为两个实现 PR：PR 1 落地了 env 隔离和总会话准入防护机制，同时多工作区仍受门控；PR 2 接通了非主活跃会话分发，并发布了增量能力/状态 schema。Phase 2b PR 1 增加了会话 owner 索引，并扩展了仅限会话的路由面，但不迁移文件、memory、MCP、设置、语音、channel worker、ACP 或 SDK 工作空间客户端。

多工作区工作仍然仅限于会话。Phase 2a 没有添加复数路由、`WorkspaceDaemonClient`、带工作区限定的 ACP/WebSocket、文件、memory、MCP、设置、语音或 channel-worker 迁移。Phase 2b PR 1 只添加下文描述的复数会话列表别名；它仍然不添加工作空间客户端 API，也不迁移非会话面。PR 1 没有添加 `workspaces[]`、`multi_workspace_sessions` 能力、路由分发或非主运行时构建。

## 基础契约

- 在 CLI 解析器层，`--workspace` 是可重复的，因此 yargs 会保留数组输入而不是将其折叠。
- 当存在重复的工作空间值时，serve 快路径会回退到完整解析器。
- 包含单项的工作空间数组将被视为主工作空间，并保持现有的单工作空间行为。
- PR 1 在运行时启动之前保持多个显式工作空间受门控。
- PR 2 为仅限会话的多工作区模式接受互不相同的非嵌套显式工作空间。
- 重复的规范工作空间输入仍然显式失败。
- 嵌套的工作空间输入仍然显式失败。
- 第一个显式工作空间是主工作空间，并继续由旧式 `workspaceCwd` / `app.locals.boundWorkspace` 兼容字段镜像。

内部 `WorkspaceRuntime` 契约现在携带了用于后续 Phase 2a 工作的稳定元数据：

- `workspaceId`：规范工作空间 cwd 的稳定哈希值。
- `workspaceCwd`：规范工作空间 cwd。
- `primary`：对于主运行时为 true。
- `trusted`：启动时的信任元数据；除非生产环境传递显式的 trusted 值，否则直接 `createServeApp` 回退保持为 false。
- `env`：运行时本地 env 来源元数据。在单工作空间生产中，主运行时现在接收一个计算出的有效 env 快照和一个可在 daemon env 重载后刷新的可变 env 来源。直接 `createServeApp` 回退保持为父进程元数据。

内部 `WorkspaceRegistry` 支持精确的 cwd 查找、精确的 id 查找、`resolveWorkspaceCwd(undefined)` 主回退以及活跃会话 owner 解析。活跃 owner 解析仅扫描运行时 bridge 摘要；它不扫描持久化存储、创建子进程或路由任何请求。重复的活跃 owner 会作为歧义结果 fail closed（失败即拒绝）。

`createServeApp` 可以接受注入的 registry 用于测试和未来的组装。基础 PR 让路由模块保持在主运行时输入上；PR 2 只用 owner 分发所需的 registry 扩展了活跃会话、SSE 和会话权限路由的接线。现有的遗留 `app.locals.boundWorkspace` 和 `app.locals.fsFactory` 保持为仅限主运行时的兼容局部变量。

## Phase 2a 路由分类

第一个解除门控的 Phase 2a 里程碑必须在启用多个显式工作空间之前，对所有 `/session/:id/*` 路由进行分类。

Phase 2a 分发的路由：

- `POST /session`
- `GET /session/:id/events`
- `POST /session/:id/prompt`
- `POST /session/:id/cancel`
- `POST /session/:id/permission/:requestId`
- `POST /session/:id/heartbeat`
- `POST /session/:id/detach`
- `GET /session/:id/pending-prompts`
- `DELETE /session/:id/pending-prompts/:promptId`
- `DELETE /session/:id`
- `GET /session/:id/status`

Phase 2b 新增分发的路由：

- `POST /session/:id/load`
- `POST /session/:id/resume`
- `GET /session/:id/context`
- `GET /session/:id/context-usage`
- `GET /session/:id/stats`
- `GET /session/:id/supported-commands`
- `GET /session/:id/tasks`
- `GET /session/:id/lsp`
- `GET /session/:id/hooks`
- `GET /session/:id/artifacts`

后续或仅限主运行的路由：

- `GET /session/:id/export`
- `POST /sessions/delete`
- `POST /sessions/archive`
- `POST /sessions/unarchive`
- `PATCH /session/:id/organization`
- 会话组变更
- branch、fork、cd、rewind、shell、model 和 language 会话变更
- 非会话 `POST /permission/:requestId`
- `/acp`

## Phase 2a 跨 PR 需求

- 将扫描未命中保持为 `404 session_not_found`；绝不回退到主运行时。
- 如果多个运行时报告相同的活跃会话 id，则 fail closed。
- 保持非主持久化会话列表受门控，直到恢复所有权、信任检查和活跃会话发现一起实现。
- 在非主子进程 spawn 之前，复用 PR 1 的运行时本地 env 覆盖层。
- 在未来每一个全新创建接缝处复用 PR 1 的 `maxTotalSessions` 准入，使 REST 和主 `/acp` 无法绕过它，同时 attach 仍然绕过准入。
- PR 2 只在活跃会话分发循环完成后才发布 `workspaces[]` 和 `multi_workspace_sessions`。
- PR 2 为增量能力 schema 更新 SDK 能力类型，但 Phase 2a 仍然不添加工作空间客户端。

## PR 1 防护机制

- 运行时 env 从 daemon 基础 env 加工作空间 `.env`、设置 env 和 Cloud Shell 默认值计算得出，且在运行时初始化期间不修改父进程的 `process.env`。
- env helper 刻意不虚拟化 `QWEN_HOME`、Storage 或全局配置路由。这些仍然是 daemon 启动/基础 env 的职责。
- ACP 子进程 spawn 接受显式的 `sourceEnv`，低成本的按工作空间状态/配置读取器使用注入的 env 而不是直接读取 `process.env`。
- `maxTotalSessions` 是一个可选的 daemon 范围全新会话上限。它覆盖 spawn、持久化 load/resume 恢复和 branch/fork 会话创建；attach 绕过它。在多工作区模式下，当运维人员未设置它且每工作空间的 `maxSessions` 上限是有限值时，PR 2 将有效总上限推导为 `maxSessionsPerWorkspace * workspaceCount`；单工作空间模式保持历史上不设限的总量默认值。
- bridge 准入接缝是一个同步预留 hook。失败的全新创建会释放预留，一旦非主 bridge 存在，即可防止跨运行时的并发超卖。
- `/daemon/status.limits.maxTotalSessions` 是增量的。在 PR 2 解除多工作区会话门控之前，`/capabilities` 和 SDK 能力类型保持不变。

## PR 2 会话闭环

PR 2 为仅限会话的 daemon 模式移除了显式多工作区启动门。多个显式 `--workspace` 值现在为每个规范工作空间创建一个运行时，第一个工作空间为主。重复和嵌套的工作空间输入仍然是启动错误，因为它们使会话所有权在任何路由级分发能够安全解析请求之前就处于歧义状态。

生产组装保持现有的主运行时职责：daemon 身份、日志身份、遥测服务 id、Web Shell、`/acp`、文件、memory、MCP、设置、语音、channel worker，以及旧式的无工作空间 REST 路由，保持仅限主运行时。非主运行时是仅服务于活跃 REST 会话的 bridge/工作空间服务运行时。它们的 ACP 子进程仍然是惰性的：bridge 对象在启动时存在，但在一个受信任的 `POST /session { cwd }` 请求需要全新会话之前，不会 spawn 任何非主子进程。

会话创建通过 `WorkspaceRegistry` 的精确规范 cwd 匹配来解析 `cwd`。省略的 `cwd` 解析到主运行时。未知的 `cwd` 返回 `400 workspace_mismatch`；不受信任的非主 `cwd` 返回 `403 untrusted_workspace`；受信任的已注册运行时使用该运行时自己的规范 cwd 调用其 bridge。这刻意避免了在 Phase 2a 中做前缀匹配、最近父级匹配或持久化存储查找。

被分发的活跃会话路由通过 `WorkspaceRegistry.resolveLiveSessionOwner(sessionId)` 扫描活跃 bridge 摘要来解析 owner 运行时。`not_found` 映射为 `404 session_not_found`，`ambiguous` 映射为 fail-closed 的服务端错误。扫描是同步且仅限活跃的；它绝不 spawn 子进程，也绝不把未命中当作主回退。被分发的路由集合恰好是：

- `GET /session/:id/events`
- `POST /session/:id/prompt`
- `POST /session/:id/cancel`
- `POST /session/:id/permission/:requestId`
- `POST /session/:id/heartbeat`
- `POST /session/:id/detach`
- `GET /session/:id/pending-prompts`
- `DELETE /session/:id/pending-prompts/:promptId`
- `DELETE /session/:id`
- `GET /session/:id/status`

`GET /workspace/:id/sessions` 先按精确工作空间 id 解析，其次按精确规范 cwd 解析。主工作空间保持现有的持久化/活跃合并和已组织视图行为。非主工作空间只返回活跃会话，拒绝 `archiveState=archived`，并拒绝已组织/分组查询，因为这些是保留给后续阶段的持久化/组织支撑面。

`/capabilities` 保持向后兼容：`workspaceCwd` 仍然命名主工作空间。当注册了多个运行时时，它额外发布 `workspaces[]`、`multi_workspace_sessions` 和增量会话限制。`/daemon/status` 添加相同的 `workspaces[]` 元数据，并跨运行时 bridge 聚合活跃会话计数器，同时完整的 workspace 部分保持仅限主运行时。

Phase 2a PR 2 不添加复数路由、带工作区限定的 ACP/WebSocket、文件/memory/MCP/设置/语音/channel-worker 迁移、动态添加/移除、非主持久化 load/resume/export/archive/delete、branch/fork/cd/rewind、shell/model/language 迁移或 SDK 工作空间客户端 API。

## Phase 2b PR 1 Owner 索引与恢复扩展

Phase 2b PR 1 增加了一个 bridge 生命周期回调接缝和一个由 `WorkspaceRegistry` 拥有的 `WorkspaceSessionOwnerIndex`。bridge 的注册/移除生命周期事件在 spawn、load/resume、channel 退出、关闭、kill 和 daemon 关闭时更新索引。owner 解析先查询索引，用 `getSessionSummary` 验证索引的运行时，丢弃过期索引条目，并回退到现有的活跃 bridge 扫描。回退命中会被缓存回索引。索引保持为优化和一致性接缝，而不是持久化的所有权数据库。

`POST /session/:id/load` 和 `POST /session/:id/resume` 现在为任何受信任的已注册工作空间接受显式 `cwd`。省略的 `cwd` 仍然解析到主运行时。未知的 `cwd` 返回 `400 workspace_mismatch`；不受信任的非主 `cwd` 返回 `403 untrusted_workspace`；如果同一会话 id 已经在另一个运行时中活跃或正在恢复，恢复以 `409 session_workspace_conflict` fail closed。同一工作空间的恢复竞争保持 bridge 现有的合并和 `restore_in_progress` 行为。恢复仍然从被请求工作空间的现有存储路径读取持久化会话存储，并且不启用非主 export/archive/delete。

owner 路由的只读活跃路由现在使用所属运行时的 bridge：context、context-usage、stats、supported-commands、tasks、lsp、hooks 和 artifacts。这些路由不修改持久化存储，也不需要 ACP/WebSocket 连接本地状态，因此可以安全地跟随活跃 owner。`GET /session/:id/rewind/snapshots` 保持仅限主运行时，因为 rewind 状态不属于仅限会话的闭环。

`GET /workspaces/:workspace/sessions` 是 `GET /workspace/:id/sessions` 的复数别名。两者都先按精确工作空间 id 解析，其次按精确规范 cwd 解析。主工作空间保持持久化/活跃合并语义。Phase 2b PR 1 让非主工作空间保持仅限活跃，并拒绝归档或已组织的列表视图。

## Phase 2b PR 2 持久化会话发现

受信任的非主工作空间会话列表现在包含来自该工作空间会话存储的活跃持久化会话，并合并匹配的活跃摘要且不重复。这完成了 Phase 2b 恢复流程的发现端：客户端可以列出一个受信任的次级工作空间，找到一个活跃持久化会话，然后调用 Phase 2b PR 1 中工作空间感知的 `POST /session/:id/load` 或 `POST /session/:id/resume`。

如果受信任的非主工作空间没有活跃持久化会话，列表保持先前仅限活跃的游标行为。归档、已组织和分组的非主列表视图仍然被拒绝，因为 archive/unarchive/delete 和会话组织面仍然是仅主运行时/后续阶段的工作。

到目前为止的 Phase 2b 工作不添加新的能力标签，不改变 `/capabilities` schema，不改变 SDK 类型，也不把 ACP、语音、channel-worker、文件、memory、MCP、设置、branch/fork/cd/rewind、shell/model/language、export、archive、delete 或组织面路由到非主运行时。

## 审计决策

- 基础 PR 不得创建非主运行时或放宽任何 REST 路由。
- 现有的 `app.locals.boundWorkspace` 和 `app.locals.fsFactory` 保持为仅限主运行时的兼容局部变量。
- REST `routeFileSystemFactory` 保持独立于 bridge 文件系统工厂；它不得用于表示非主 bridge 边界。
- IDE 辅助文件系统根目录不得提升为显式工作空间运行时。
- 单工作空间父环境行为保持兼容，直到真正的多工作空间模式解除门控。
- PR 2 的安全边界是活跃会话闭环加上增量能力/状态元数据。如果一个路由需要持久化存储、组织状态、工作空间设置或 ACP 连接本地状态，它就保持仅限主运行时或留待后续。
