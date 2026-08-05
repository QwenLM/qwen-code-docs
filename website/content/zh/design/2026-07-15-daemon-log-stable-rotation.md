# 稳定且有界的 Daemon 日志

- **状态：** 已实现
- **日期：** 2026-07-15
- **范围：** `qwen serve` 文件日志、生命周期归属、访问日志准入、daemon 状态，以及 TypeScript SDK 状态镜像

## 决策

每个运行时日志命名空间有一个稳定的活跃路径：

```text
${runtimeBaseDir}/debug/daemon/daemon.log
```

正常重启会追加到该路径。固定策略是：

| 限制                                 |        值 |
| ------------------------------------- | -----------: |
| 活跃文件                           |       10 MiB |
| 每个家族的归档数                   |            4 |
| 渲染后的文件记录                  |      256 KiB |
| 已接受但未落盘的文件负载   |        4 MiB |
| 稳定租约过期/更新             |  60 s / 10 s |
| 稳定/维护获取预算 | 1 s / 250 ms |
| 公共 logger 关闭预算            |          2 s |

这些值有意不作为 CLI 标志、环境变量或设置。一个健康的稳定家族最多占用约 50 MiB。保留最近一个不活跃的 fallback 家族会使收敛后的命名空间达到约 100 MiB。存活或尚未过期的 fallback 所有者绝不会被删除，因此临时占用可能随潜在存活的 daemon 数量增长。

每次启动生成一个随机的 128 位 `runId`。每条文件记录都以不可变的 `runId` 和 daemon PID 上下文开头。调用方上下文无法替换这些值。Stderr 保持现有格式和字段顺序。

## 命名空间与归属

配置的日志目录是归属和保留命名空间。工作空间、listener 端口和 PID 不是存储身份：一个 daemon 可以托管多个工作空间，端口零是动态的，端口可能在冲突时递进，嵌入式 daemon 可能共享 PID。

稳定家族由一个终生的 `proper-lockfile` 租约拥有。无法获取它的竞争者写入：

```text
debug/daemon/runs/run-<32-hex-runId>/daemon.log
```

它在其生命周期内持有该家族的 `.owner.lock`，并且在运行期间绝不提升进稳定家族。启动横幅和完整 daemon 状态对所选路径具有权威性。`runs/recent-fallback` 只是一个经过验证的发现提示。

Fallback 分配和清理由 `runs/.maintenance.lock` 串行化。清理保留每个忙碌的所有者家族，并最多保留一个不活跃的家族。它优先使用有效的定位符，然后是最新的活跃日志 mtime，再以基名作为确定性的决胜手段。非锁类清理错误或删除失败会拒绝分配，使损坏的命名空间不会在每次启动时累积一个新目录。

干净的 fallback 关闭会获取维护所有权、释放其所有者租约、保留当前家族、移除其他不活跃家族，并修复定位符。如果维护所有权不可用，关闭只释放所有者租约，把修复留给之后的启动。

## 文件系统布局

```text
debug/daemon/
├── daemon.log
├── latest -> daemon.log
├── .stable-writer.lock/
├── archive/
│   └── daemon-000000000001-20260715T031415926Z-a1b2c3d4.log
└── runs/
    ├── .maintenance.lock/
    ├── recent-fallback
    └── run-6a45c211000000000000000000000000/
        ├── .owner.lock/
        ├── daemon.log
        └── archive/
```

只有严格匹配的常规归档文件参与保留。旧的 `serve-<pid>.log` 和 `serve-<pid>-<workspaceHash>.log` 文件既不迁移也不删除。

新目录使用模式 `0700`；新的活跃日志和定位符临时文件使用 `0600`。不重写现有对象的权限。`latest` 只由成功的稳定所有者更新，在符号链接不可用的地方保持尽力而为。

## 文件记录与队列

文件记录在有效的 UTF-8 边界上截断。最终记录（包括原始字节数标记和换行符）最大 256 KiB。其 stderr 副本不截断。

一个 Promise 队列保持文件变更顺序。已接受但未落盘的记录字节被同步记账。一条会使队列超过 4 MiB 的记录只丢失其文件副本；logger 递增 `droppedRecords` 和 `droppedBytes`，并为该溢出时段警告一次。

容量恢复后，下一条调用方记录之前会有一条名为 `daemon file log records dropped` 的仅文件警告。它报告未报告的记录和字节总数，且不会递归地贡献给它们。关闭会在排空队列后做最后一次尝试。

每个队列任务捕获自身的失败，并在 `finally` 中释放其待处理字节记账；共享的尾部永远不会停留在 rejected 状态。如果一次活跃追加被拒绝，其结果是未知的：logger 记录 `write_failed`，停止该运行所有后续的文件变更，并且不声称失败的记录是精确损失。之后被有意跳过的记录会被计数。

租约受损同样会立即停止新的文件变更。一个已经开始的单一文件系统操作可能完成，但之后没有追加、轮转或删除会通过该家族启动。

## 轮转事务

在一条记录会使活跃文件超过 10 MiB 之前，logger：

1. 验证 `archive/` 是一个真实的、非符号链接的目录；
2. 移除最旧的已生成归档，直到最多剩三个；
3. 选择一个不存在的名称，包含 12 位代数、UTC 时间戳和随机后缀；
4. 原子地把活跃路径重命名为该归档名；
5. 以模式 `0600` 把触发记录追加到新的 `daemon.log`；以及
6. 提交内存中的大小和代数状态。

因此，由本实现产生的家族最多有一个活跃文件和四个归档。如果新活跃文件的追加失败，之前的活跃文件仍完整地保留在最新的归档中。

归档验证、修剪、命名或重命名失败会丢弃该记录，而不是允许活跃文件越过 10 MiB。轮转每 60 秒最多重试一次，同时仍然放得下的较小记录可以继续。没有特殊的 ENOSPC/EDQUOT 删除重试协议，也没有被拒绝追加的截断回滚，因为两者都无法证明文件的结果状态。

初始化时读取活跃文件的真实大小。如果其最后一个字节不是换行符，且启动记录没有先轮转它，logger 会插入一个换行符，并用 `previousTailIncomplete=true` 标记启动记录。如果稳定启动探测无法安全写入，它会释放稳定租约并尝试一次 fallback 家族。失败的 fallback 探测产生降级为仅 stderr 的日志记录。

## Logger 状态与生命周期

```ts
type DaemonLogMode = 'stable' | 'fallback' | 'stderr-only';
type DaemonLogHealth = 'ok' | 'degraded';
type DaemonLogIssue =
  | 'init_failed'
  | 'rotation_failed'
  | 'retention_failed'
  | 'queue_overflow'
  | 'write_failed'
  | 'lease_compromised';
```

`getStatus()` 返回运行身份、模式、健康状况、有序问题列表和损失计数器。`QWEN_DAEMON_LOG_FILE=0|false|off|no` 返回一个健康的仅 stderr logger，不访问文件系统：`info`、`warn` 和 `error` 仍写入 stderr，而 `raw` 仍然只写文件，因此什么都不做。

`close()` 是幂等且不拒绝的。它同步停止接受文件副本，而结构化 stderr 调用保持可用。其后台终结器排空队列、尝试最终的损失汇总、执行 fallback 清理，并释放终生租约。公共 Promise 最多等待两秒；超时不会提前释放租约，终结器保持存活直到已开始的 I/O 稳定。`flush()` 保持其无界的队列快照语义。强制信号路径和可重试的资源关闭失败以 250 ms 与之竞争。

Logger 归属的流转：

```text
startup -> published handle -> terminal close
       \-> startup signal -> terminal close
```

句柄发布之前的内部关闭会排空 daemon 资源而不等待 logger 队列，然后把 logger 留给外层启动错误的所有者。该所有者记录 `daemon startup failed` 并关闭它。终态的已发布或信号拥有的关闭会封存访问日志、记录 `daemon stopped`，即使资源关闭返回不可重试的错误也关闭 logger；原始资源错误仍是返回的错误。终态诊断写入是尽力而为的，因此不可用的 stderr 不能替代原始失败或跳过 logger 清理。可重试的 channel-worker/service-lease 失败会保持 logger 打开，使用上述有界 flush，并且不记录 `daemon stopped`。

## 访问日志准入

每个运行时 Express 应用拥有一个常量空间令牌桶，突发 60，以单调时钟计量每秒补充 2 条记录。时钟回退绝不会把补充基线向后移动。Health、heartbeat 和成功的 SSE 排除保持不变。

Route、会话 ID 和第一个原始 `x-qwen-client-id` 出现在 UTF-8 边界上分别限制为 2 KiB、256 字节和 256 字节。被截断的值携带原始字节数的上下文字段。使用第一个原始 header 可以避免合并的重复 header 成为新的基数来源。

当没有令牌可用时，只保留五个固定计数器：2xx、3xx、4xx、5xx 和 other。恢复时，一条 WARN 级 `access logs suppressed` 汇总会在任何单条记录之前消耗下一个令牌。如果那是唯一的令牌，当前请求并入下一次汇总。关闭在正常 listener 排空或次级截止之后封存控制器，发出最终汇总，忽略迟到的完成回调，然后记录 `daemon stopped`。

限流只影响诊断；它绝不改变 HTTP 结果。被抑制的单条记录既不到达 stderr 也不到达文件，而汇总两者都到达。

## Daemon 状态与 SDK

每个状态响应获取一次 logger 快照。汇总和完整响应可能包含：

- `daemon.runId`
- `daemon.logMode`
- `daemon.logHealth`

完整响应还可能包含 `daemon.logPath`、`daemon.logIssues`、`daemon.logDroppedRecords` 和 `daemon.logDroppedBytes`。降级日志会向现有的汇总添加一条无路径的顶层 `daemon_log_degraded` 警告。TypeScript SDK 镜像这些可选字段和封闭联合类型。不需要能力标签或客户端升级。

退出选择报告 `stderr-only/ok`；普通的稳定竞争报告 `fallback/ok`；文件系统初始化失败报告带 `init_failed` 的降级日志。

## 运维与兼容性边界

- 使用独立的运行时目录来获得独立的保留或审计命名空间。
- 在 macOS/Linux 上使用 `tail -F daemon.log`；在每个平台上，查看器都必须在轮转后重新打开路径名。
- 不要配置外部 logrotate 来变更 `daemon.log`。复制或传输它是安全的；重命名、截断或删除它会破坏内存中的大小模型。
- 在过期窗口内的并发 daemon 或崩溃重启风暴期间，没有按时间过期、压缩、fsync 持久性或绝对上限。
- 同用户篡改、虚假的过期接管、永不返回的文件系统调用、突然断电，以及阻止重命名的 Windows 读取器，都通过安全降级处理，而不是通过平台特定的 no-follow、fsync 或进程准入协议。
- 降级仍然可行；较旧的版本只是恢复创建以 PID 命名的文件。

## 验证策略

单元测试覆盖格式化、不可变的文件上下文、稳定复用、UTF-8 截断、轮转边界、不完整尾部、队列溢出汇总、中毒的追加、活跃和释放后受损的租约、有界关闭和重试 flush、稳定/fallback 并发、fallback 保留、清理拒绝、生命周期诊断失败、访问令牌准入、关闭封存、状态快照、隔离的测试运行时命名空间，以及 SDK 类型表面。

进程级验证使用构建的 bundle 和隔离的运行时目录，验证重启复用、真实阈值轮转、稳定/fallback 并发、信号租约释放、SIGKILL 过期窗口行为、访问聚合、旧文件保留，以及不访问文件系统的退出选择。CI 平台矩阵必须在 macOS、Linux 和 Windows 上演练直接活跃路径；Windows 还要验证当读取器阻止活跃/归档重命名时的安全降级。
