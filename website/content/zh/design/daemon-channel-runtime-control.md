# Daemon channel 运行时控制

## 摘要

为 daemon 管理的 channel worker 增加运行时期望状态控制。daemon 可以在不带 `--channel` 的情况下启动，然后在不重启 daemon 的前提下启用、替换、检查、重载和停止其 channel 选择。运行时变更不会持久化；下一次 daemon 启动仍然遵循 `--channel`。

控制层位于按工作空间分组的 worker 实现之上。它持有已提交的选择，串行化生命周期变更，保留 serve 持有的 channel-service 租约，并且只调和有序选择发生变化的工作空间组。

## 公开契约

`GET /workspace/channel` 返回已提交的选择、可选的待定选择、当前转换过程，以及带工作空间标注的 worker 快照。

`PUT /workspace/channel` 接受：

```json
{ "selection": { "mode": "names", "names": ["telegram", "feishu"] } }
```

或 `{ "selection": { "mode": "all" } }`。命名选择会被裁剪并去重，但不排序。空选择是非法的。在多工作空间模式下，`all` 仍然仅限于主工作空间。

`DELETE /workspace/channel` 以幂等方式禁用运行时选择。`POST /workspace/channel/reload` 仍然可用，并为已提交的选择重新读取设置。变更操作使用严格的 bearer-token 闸门。

`channel_control` 能力通告该资源。`channel_reload` 仅在 manager 持有已提交的、可重载的选择时继续通告。

## 生命周期

manager 暴露不可变快照，并把所有变更都通过一条 FIFO lane 发送。选择更新会在停止 worker 之前预检工作空间的所有权和信任。未变化的工作空间条目被保留。已变化和已移除的条目在替代项启动之前停止，同时 daemon 保持全局 channel-service 租约。

如果替换失败，manager 会尝试停止新启动的条目并重启先前的条目。客户端需要检查 `rolledBack`、`rollbackError` 和 `state`，因为清理或恢复也可能失败。SIGKILL 之后未能观察到子进程退出属于硬性停止失败：supervisor 保留子进程引用，manager 保留 service 租约，并且不会 spawn 任何替代项。

worker 回调携带一个 generation。来自已替换条目的回调可以记日志，但不能更新当前的 pidfile 或路由状态。一次成功的提交会一起切换选择、webhook 配置和 worker 映射，然后重写完整的 pidfile 快照。

部分 adapter 连接保留现有行为：当至少一个请求的 channel 连接成功时，worker 即为就绪。控制结果报告 `partial`，daemon 状态继续发出 `channel_worker_partial_connect`。

## 兼容性

启动时的 `--channel` 使用同一个 manager，同时保留监听前的租约预留和成功后才就绪的行为。没有 `--channel` 时，daemon 在第一次运行时变更之前不会预留 channel service，也不会加载沉重的 channel 运行时。

旧式 `runtime.channelWorker`、分组的 `runtime.channelWorkers`、pidfile 字段、独立的 `qwen channel start` 和 `qwen channel reload` 保持兼容。新的 CLI 控制通过 `qwen channel set` 暴露，外加 channel stop 和 status 的远程变体。
