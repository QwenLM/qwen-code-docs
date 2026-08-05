# Daemon 全局深度健康检查

## 问题

`GET /health?deep=1` 是在 daemon 只拥有一个工作空间运行时的时候引入的。多工作空间支持落地后，该路由仍然接到主 bridge 上，因此当次级工作空间还有会话、prompt 或待处理权限时，其计数器可能把 daemon 报告为空闲。

浅层端点是刻意不同的：`GET /health` 只证明监听器能够响应。它必须保持廉价，且不得访问运行时状态。

## 决策

深度健康是一个 daemon 范围的信息性快照。它聚合 `WorkspaceRegistry.listManaged()` 返回的每一个运行时，包括正在 drain 但尚未完成 bridge 清理的工作空间。

| 字段                | 聚合方式                                              |
| -------------------- | -------------------------------------------------------- |
| `workspaceCount`     | 快照中受管运行时的数量               |
| `sessions`           | 求和                                                      |
| `pendingPermissions` | 求和                                                      |
| `activePrompts`      | 求和                                                      |
| `connectedClients`   | 现有的 daemon 范围 REST SSE 计数                      |
| `channelAlive`       | 任一受管运行时的 channel 存活时为 true            |
| `lastActivityAt`     | 最新的非空 bridge 活动时间                     |
| `idleSinceMs`        | 一次 `Date.now()` 快照减去最新活动时间 |
| `rateLimitHits`      | 现有的可选 daemon 范围限流计数          |

路由在合并各值之前读取每个运行时所需的 getter。它不会对 channel 读取做短路。如果 registry 或任何 getter 抛出异常，整个深度探测以 `503 {"status":"degraded","reason":"aggregation_failed"}` 失败，而不是返回部分快照。getter 失败会在 daemon stderr 日志中标识出对应的工作空间运行时，但不在 HTTP 响应中暴露该标识符。

当 bootstrap 监听器已启动但运行时 registry 尚未就绪时，深度请求返回一个带 `reason: "bootstrap"` 和 `Retry-After: 1` 的 degraded 主体。在健康优先的启动模式下，完成该响应仍会触发运行时启动。浅层 bootstrap 响应保持为 `200 {"status":"ok"}`。

## 兼容性与边界

- `deep=1`、`deep=true` 和裸 `deep` 启用快照；所有其他值使用浅层健康检查。
- 单工作空间的深度响应保留其现有值，并新增 `workspaceCount: 1`。
- 认证、Host 允许列表、CORS 和限流行为不变。
- 响应不暴露工作空间 ID、路径、信任状态或每工作空间细节。
- 不需要能力或 SDK 变更。`workspaceCount` 让消费方识别 daemon 全局契约。

深度健康不是全工作空间就绪检查，也不是原子回收租约。计数器访问器不 ping 子进程，`connectedClients` 只代表 REST SSE。回收方应要求重复的空闲样本并做优雅关闭；需要传输层或每工作空间诊断的运维人员应使用需认证的 `/daemon/status` 端点。

## 已否决的替代方案

- 只聚合 `WorkspaceRegistry.list()` 会在 bridge 清理完成之前隐藏正在 drain 的运行时，可能过早报告空闲。
- 复用 `/daemon/status` 会使健康检查依赖一个更重的快照，且其活跃工作空间范围和失败契约都不同。
- 增加工作空间选择器会保留调用方的扇出问题，且无法满足 daemon 级空闲检测。
- 把 `channelAlive` 定义为“所有 channel 存活”会悄悄改变其与 daemon status 兼容的现有含义。每工作空间的失败属于 `/daemon/status`。
