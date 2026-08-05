# 工作空间限定的会话导出

## 摘要

Issue #6378 要求客户端能够从一个显式选定的已注册工作空间导出持久化会话。现有的 `GET /session/:id/export` 路由刻意绑定到主工作空间，因此复用它来导出次级会话要么返回 `404`，要么在同一会话 id 存在于多个工作空间时可能选错 transcript。

本变更新增 `GET /workspaces/:workspace/session/:id/export?format=html|md|json|jsonl`、`workspace_session_export` 能力、对应的 `WorkspaceDaemonClient` 方法，以及配套文档。旧式路由保持绑定主工作空间。

## 契约

工作空间选择器遵循现有的复数路由规则：先精确匹配已注册工作空间 id，然后是规范化之后的 URL 编码绝对 cwd。所选运行时必须是受信任的。解析和信任检查发生在会话或格式校验之前。

该路由只读取所选工作空间的活跃持久化 JSONL。它不搜索其他工作空间，不回退到主工作空间，不解析活跃 owner，不启动 ACP，不附加客户端，也不加载工作空间设置。已归档会话仍然不可用。成功时使用与旧式导出路由相同的格式化器、文件名净化、MIME 类型、缓存策略和附件头。

错误保留现有的导出/存储形状，包括 `400 workspace_mismatch`、`403 untrusted_workspace`、`400 invalid_export_format`、`404 session_not_found`，以及现有的 `409 session_archived`、`session_archiving` 和 `session_conflict` 契约。

## 能力与兼容性

`workspace_session_export` 是一个无条件的 v1 能力，因为复数路由对按 id 或 cwd 选定的受信任单工作空间主工作空间也是有用的。信任仍然按请求评估。新标签独立于 `multi_workspace_sessions`，不能从 `session_export` 或 `workspace_qualified_rest_core` 推断；已发布的 daemon 通告两个旧标签，但不实现该路由。

直接调用 SDK 的调用方在旧版 daemon 上调用新方法时会收到正常的 HTTP 错误。Web Shell 集成不在本变更范围内，因此其现有的仅主导出行为保持不变。

## 并发与安全

导出保留现有的以会话 id 为键的共享 archive-coordinator 锁，因此归档和删除在重放期间无法移动或删除文件。coordinator 保持保守的全局性：不同工作空间中的相同 id 可能会串行化，即使它们的文件相互独立。重命名所有归档/删除锁键不在本变更范围内。

与有界的持久化 transcript 分页器不同，完整导出会物化完整的 transcript，并且对不受信任的次级工作空间不可用。现有的受信任导出没有新的响应大小预算；增加工作空间特定的限制会使复数和旧式格式契约产生分歧。daemon bearer 认证、默认的 GET 读取速率分级，以及每请求的工作空间信任检查继续适用。

运行时移除竞争使用请求解析时选定的运行时。移除不会删除 transcript 存储，因此导出不需要运行时租约，也不会让 ACP 子进程保持存活。

## SDK 与可观测性

`WorkspaceDaemonClient.exportSession` 复用现有的导出结果和格式类型，并总是使用原生 REST，包括当父客户端拥有 ACP 传输时。共享的请求 helper 保留 token、客户端身份、超时、错误解析、内容类型和附件文件名行为。

daemon 遥测把新路径归一化为 `GET /workspaces/:workspace/session/:id/export`，解码会话 id，并使用中间件工作空间解析得到所选工作空间的哈希。

## 已否决的替代方案

- 按活跃 owner 路由单数导出，对不活跃的持久化会话会失败，并且在重启后使所有权产生歧义。
- 给旧式路由添加 `cwd` 查询参数会改变仅主工作空间的兼容契约，并且与现有的复数工作空间路由不一致。
- 未命中时回退到主工作空间，在 id 冲突时可能导出其他工作空间的会话。
- 允许不受信任的完整导出会绕过为持久化 transcript 分页器设计的有界读取策略。

## 验证

测试覆盖能力通告、id/cwd 选择器、相同 id 隔离、每种格式、响应头、信任和归档边界、缺失/未知目标、bridge 无活动、遥测归因、SDK 传输和编码，以及归档/删除协调。端到端验证使用隔离的运行时和工作空间目录，以及确定性的持久化 transcript。
