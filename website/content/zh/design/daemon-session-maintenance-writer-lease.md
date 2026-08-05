# Daemon 会话维护 writer 租约

## 问题

daemon 可以在其进程内 ACP owner 关闭之后删除、归档或取消归档一个持久化 transcript。另一个 daemon 进程仍可能拥有同一个 transcript，因此仅靠进程内的 archive coordinator 无法防止 daemon 与外部 writer 竞争。

transcript 路径和 writer-lock 路径也必须从同一个工作空间运行时解析。回退到主 daemon 运行时可能一边在另一个工作空间检查锁，一边修改这一个工作空间。

## 范围

本变更覆盖 daemon 拥有的维护操作：

- REST 和 ACP 的 delete、archive 和 unarchive 请求
- 断连和孤儿清理
- 定时任务回滚和 keepalive 清理
- 维护已在运行时的 daemon 关闭

它不添加租约过期、心跳、基于 hostname 的恢复、自动夺取、强制解锁或锁 schema 迁移。不参与租约协议的 writer 仍然需要平台级的单 writer 隔离。

## 运行时存储绑定

每个 `WorkspaceRuntime` 在创建时解析一个绝对的会话运行时基础目录。解析保持现有优先级：

1. `QWEN_RUNTIME_DIR`
2. `advanced.runtimeOutputDir`，相对工作空间解析
3. 普通的 Qwen 运行时目录

解析出的目录保存在运行时上，并作为 `QWEN_RUNTIME_DIR` 注入每个受管 ACP 子进程。环境重载可能更新其他值，但保留这个固定值，因为更改 `runtimeOutputDir` 需要重启运行时。

列出、读取、导出、组织或维护会话的 daemon 父操作在所选运行时的存储上下文中运行。运行时解析失败不会回退到主运行时。

## 租约 API

`SessionService.acquireSessionWriterLease()` 从服务固定的 `Storage` 实例同时派生 writer-lock 根目录和活跃 transcript 路径。调用方只提供会话 ID、进程种类、版本和回收策略。无效的会话 ID 在触碰锁目录之前就被拒绝。

daemon 维护总是使用 `processKind: 'daemon'` 和 `reclaimPolicy: 'never'`。现有的锁 schema、键、owner 记录和获取/释放协议保持不变。

## 维护协议

每个会话独立处理：

1. 进入 daemon 的每会话独占 archive coordinator。
2. 关闭本地 owner。归档要求 agent close；删除使用普通的快速关闭。允许本地 owner 缺失。
3. 分类持久化状态，并保留现有的 not-found 和幂等结果，不创建锁。
4. 获取 daemon writer 租约。
5. 持有租约期间重新分类。
6. 验证所有权和 transcript 指纹，然后执行一次变更操作。
7. 带 owner-token 验证地释放租约。

批量请求可以并发处理独立的会话，但一个 worker 最多持有一个跨进程租约，绝不在持有多个租约时等待。

当释放成功时，失败的变更操作仍然是被报告的错误。即使变更操作也失败了，释放或所有权失败也是对外安全的错误。日志记录工作空间、会话、动作、错误种类，以及 transcript 变更是否已落盘；它们绝不包含 owner token 或锁路径。定时任务调和跟随实际的 transcript 变更，而不是租约释放随后是否成功。

孤儿清理先关闭本地 owner 并遵守 `requireZeroAttaches`。因此新附加的 owner 会阻止删除。晚 spawn 清理在获取租约并删除 transcript 之前等待关闭。

## 关闭

`SessionArchiveCoordinator.sealMaintenanceAndWait()` 同步拒绝新的独占维护，并等待已准入的独占操作。共享的 transcript 读取不包含在内，因此长时间导出不会消耗终止预算。REST 返回 `503 daemon_draining`；ACP 返回带 `data.errorKind = daemon_draining` 的 JSON-RPC 服务端错误。

daemon 关闭在子进程/进程拆除之前封存维护，并只在已准入的维护租约被释放之后才完成。

## 兼容性与发布

批量响应形状和现有的 archive/delete/unarchive 幂等性保持不变。预检的本地 `session_archiving` 冲突（在准入之前由 `assertNotTransitioning` 抛出）仍然以请求级 `409` 出现。在准入门内抛出的冲突，对 archive、unarchive 和 delete 一并在 `200` 响应体（`errors[]`）中按会话报告。混合版本的 writer 是不安全的，因此部署和回滚必须先 drain 旧 daemon 和受管 ACP 进程，再启动新版本。

## 验证

测试使用真实的临时运行时根目录来测试 writer 竞争和根隔离，覆盖初始分类与持锁分类之间的状态变化，并验证关闭、变更、释放、定时任务调和和关闭顺序。单元测试还覆盖无效 ID、重复 ID、活跃/归档冲突、租约释放失败、孤儿重新附加和日志脱敏。合并前要求运行相关包的测试、build 和 typecheck。
