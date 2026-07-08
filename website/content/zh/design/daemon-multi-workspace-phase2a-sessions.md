# Phase 2a 多工作区会话基础

## 概述

本文档记录了在 Phase 1 `WorkspaceRegistry` PR 之后，issue #6378 的 Phase 2a 基础契约。当前的实现批次结合了 Phase 1 中重复 `--workspace` 参数的后续处理、Phase 2a 的准备防护机制，以及后续多工作区会话工作所需的第一个内部 registry/runtime 契约。

Phase 2a 仍然仅限于会话（sessions-only）。在此基础批次中，它不会添加复数路由、`WorkspaceDaemonClient`、带工作区限定的 ACP/WebSocket、文件、内存、MCP、设置、语音、channel-worker 迁移、环境变量覆盖（env overlays）、总会话准入、`workspaces[]` 能力、`multi_workspace_sessions`、路由分发或非主运行时构建。

## 基础契约

- 在 CLI 解析器层，`--workspace` 是可重复的，因此 yargs 会保留数组输入而不是将其折叠。
- 当存在重复的工作区值时，serve 快速路径会回退到完整解析器。
- 包含单项的工作区数组将被视为主工作区，并保持现有的单工作区行为。
- 多个显式工作区仍然受门控限制，并在运行时启动前失败。
- 重复的规范工作区输入会显式失败。
- 嵌套的工作区输入会显式失败。
- 不同的非嵌套多工作区输入会因通用的“multi-workspace serve is not enabled”启动错误而失败。
- 一旦移除门控，第一个显式工作区将成为未来的主工作区；此基础批次不会公开暴露该列表。

内部 `WorkspaceRuntime` 契约现在携带了用于后续 Phase 2a 工作的稳定元数据：

- `workspaceId`：规范工作区 cwd 的稳定哈希值。
- `workspaceCwd`：规范工作区 cwd。
- `primary`：对于主运行时为 true。
- `trusted`：启动时的信任元数据；除非生产环境传递显式的 trusted 值，否则直接 `createServeApp` 回退保持为 false。
- `env`：仅限元数据。此基础批次记录父进程模式和空的覆盖键（overlay keys）；它不计算运行时本地的 env 覆盖。

内部 `WorkspaceRegistry` 支持精确的 cwd 查找、精确的 id 查找、`resolveWorkspaceCwd(undefined)` 主回退以及实时会话所有者解析。实时所有者解析仅扫描运行时 bridge 摘要；它不扫描持久化存储、创建子项或路由任何请求。重复的实时所有者会因结果歧义而 fail closed。

`createServeApp` 可以接受注入的 registry 用于测试和未来的组装，但路由模块仍然只接收主运行时。现有的遗留 `app.locals.boundWorkspace` 和 `app.locals.fsFactory` 保持为仅限主运行时的兼容局部变量。

## Phase 2a 路由分类

第一个解除门控的 Phase 2a 里程碑必须在启用多个显式工作区之前，对所有 `/session/:id/*` 路由进行分类。

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

后续或仅限主运行的路由：

- 非主 `POST /session/:id/load`
- 非主 `POST /session/:id/resume`
- `GET /session/:id/export`
- `POST /sessions/delete`
- `POST /sessions/archive`
- `POST /sessions/unarchive`
- `PATCH /session/:id/organization`
- 会话组变更
- branch、fork、cd、rewind、shell、model 和 language 会话变更
- 非会话 `POST /permission/:requestId`
- `/acp`

只有在测试证明额外的实时读取路由仅依赖于所属的实时 bridge 后，才可能在后续的 Phase 2a 切片中对其进行所有者路由。

## 后续 Phase 2a 需求

- 将扫描未命中保持为 `404 session_not_found`；绝不回退到主运行时。
- 如果多个运行时报告相同的实时会话 id，则 fail closed。
- 保持非主会话列表为仅限实时（live-only），除非持久化条目被显式标记为不可恢复。
- 在非主子进程生成之前，添加运行时本地的 env 覆盖。
- 在 bridge 新创建接缝处添加 `maxTotalSessions`，以便 REST 和主 `/acp` 无法绕过它，同时 attach 仍然绕过准入。
- 仅在最终的解除门控 PR 中发布 `workspaces[]`、总限制和 `multi_workspace_sessions`。
- 当附加能力模式发布时更新 SDK 能力类型，但不要在 Phase 2a 中添加工作区客户端。

## 审计决策

- 基础 PR 不得创建非主运行时或放宽任何 REST 路由。
- 现有的 `app.locals.boundWorkspace` 和 `app.locals.fsFactory` 保持为仅限主运行时的兼容局部变量。
- REST `routeFileSystemFactory` 保持独立于 bridge 文件系统工厂；它不得用于表示非主 bridge 边界。
- IDE 辅助文件系统根目录不得提升为显式工作区运行时。
- 单工作区父环境行为保持兼容，直到真正的多工作区模式解除门控。