# 带工作空间限定的归档会话导出

## 摘要

daemon 可以从选定的已注册工作空间导出活跃的持久化会话，但已归档的 transcript 在被移回活跃存储之前一直无法访问。本变更增加了一个只读的归档导出，不改变活跃导出的行为，也不改变归档状态机。

协议新增
`GET /workspaces/:workspace/session/:id/archive/export?format=html|md|json|jsonl`、
无条件的 `workspace_archived_session_export` 能力，以及
`WorkspaceDaemonClient.exportArchivedSession`。该路由和能力与活跃导出区分开来，使旧版 daemon 不会忽略归档意图而返回相同 id 的活跃 transcript。

## 契约

选择器先按精确匹配的已注册工作空间 id 解析，再按 URL 编码的规范绝对 cwd 解析。所选运行时必须是受信任的；选择器和信任检查先于会话和格式校验。

只有所选工作空间的 `chats/archive/<id>.jsonl` 是合格的。该路由不会扫描活跃存储或其他工作空间，不会回退到主存储，不会解析活跃 owner，不会调用 bridge，不会启动 ACP，不会附加客户端，也不会加载设置。仅活跃的会话返回 `409 session_not_archived`，缺失的会话返回 `404 session_not_found`，活跃与归档文件同时存在返回 `409 session_conflict`，转换中的会话返回 `409 session_archiving`。

## 复用与并发

`SessionService.loadArchivedSession` 是唯一新增的核心消费面。它委托给与 `loadSession` 相同的私有重建逻辑，但读取的是归档路径；现有的 load/resume 调用方仍然仅限活跃存储。daemon 复用现有的导出收集器、格式化器、响应头和 SDK 附件解析器，因此归档导出和活跃导出的格式行为完全一致。在重建之前，仅归档的加载器强制执行现有的 256 MiB transcript 索引上限，超过时返回 `413 transcript_too_large`。活跃导出保留其已发布的不设上限的契约。

导出在完整的位置检查、transcript 重建和格式化操作期间持有现有的共享 `SessionArchiveCoordinator` 租约。归档、取消归档和删除保留独占租约，因此一次转换要么在导出之前开始并拒绝导出，要么在共享租约释放之后才开始。coordinator 继续保守地以会话 id 为键，跨工作空间亦然。

## 兼容性与验证

活跃工作空间导出路由、`workspace_session_export` 能力、旧版主存储导出、归档变更操作和持久化布局均不变。当新方法指向旧版 daemon 时，直接调用 SDK 的调用方会收到正常的 HTTP 错误。

测试覆盖能力通告、id 和 cwd 选择器、所有格式、附件元数据、活跃/缺失/冲突/转换状态、信任优先级、相同 id 的工作空间隔离、bridge 无活动、两个方向的锁、核心归档重建、遥测归因，以及原生 REST SDK 传输。大小测试接受恰好等于归档上限的值，并在 transcript 物化之前拒绝比上限多一个字节的稀疏文件。
