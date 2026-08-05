# Daemon 容量模型与内存边界

## 背景

Issue [#8051](https://github.com/QwenLM/qwen-code/issues/8051) 观察到 daemon 按
数量限制注册的工作空间和会话，而数量限制并不是内存限制。
[#8091](https://github.com/QwenLM/qwen-code/issues/8091) 提议以七个 PR 交付修复，
其中 [#8093](https://github.com/QwenLM/qwen-code/pull/8093) 是第一个：一个覆盖
daemon 根进程 JavaScript 堆的进程级 `ResourceBudget`，带十五个字节类别、复合
原子准入、可拆分可转移的租约、三个 `AsyncLocalStorage` 作用域的公平调度器，
以及一个堆代理计费模型——把 JavaScript 值定价为每字符串码元 2 字节、每对象
节点 96 字节、每属性 16 字节。

本文档对同一问题提出不同的分解。它认同 #8051 的前提，也认同 #8091 增量交付
的直觉。它的分歧在于：哪个进程持有内存、哪种机制能约束它，以及哪个变更应该
先落地。

下面三个发现来自对现状 daemon 的阅读。

### Daemon 不是一个进程

`ServeMode` 是 `http-bridge`（`packages/cli/src/serve/types.ts:18-35`）：daemon
为每个工作空间运行时预热一个 `qwen --acp` 子进程，一个运行时中的多个会话通过
`connection.newSession()` 复用到该子进程上。daemon 根进程通过 HTTP 和 SSE 管道
传输 ACP NDJSON。大约 30–50 MB 的每会话 RSS——`maxSessions` 在
`types.ts:58-68` 所依据的数字——是在子进程内部消耗的，不是在根进程。

因此，子进程 RSS 总和是多工作空间稳态内存的去处，而对根进程堆的字节预算既
观察不到它、也约束不了它、更拒绝不了它。

这是反对_把通用的根堆账本作为 daemon 级边界_的论据，而不是反对根进程本地
保护。根进程仍然拥有 ACP NDJSON 组装、EventBus 重放环、虚拟子代理快照、设置
加载、活跃会话导出、HTTP 和 WebSocket 队列，以及 generation 作用域的缓存，其中
每一项都可以独立于任何子进程把它耗尽。下面的 Part 3 完全是根侧工作，正是出于
这个原因。

### 容量模型与宿主内存脱节

三个旋钮决定 daemon 可以消耗多少内存。每个都独立推导，没有代码调和它们：

| 旋钮                | 推导方式                                                    | 位置                                                    |
| ------------------- | ----------------------------------------------------------- | ------------------------------------------------------- |
| 注册工作空间数      | 固定常量 `25`                                               | `packages/acp-bridge/src/channel-control-timeouts.ts:7` |
| 总会话数            | `maxSessionsPerWorkspace × workspaceCount`                  | `packages/cli/src/serve/run-qwen-serve.ts:391`          |
| 每子进程 V8 堆      | `max(min(50% cgroup 或宿主内存, 16 GB), V8 默认值)`         | `packages/acp-bridge/src/spawnChannel.ts:18-36`         |

第三个是关键的。`getAcpMemoryArgs()` 计算一个值，缓存到模块级变量中，并应用到
**每一个** spawn 的子进程。它是宿主的一个比例，而不是任何资源的份额。

`max(…, V8 默认值)` 这一项从代码中看不出来，而且有双重影响。该标志只在计算出的
目标超过**spawn 方 daemon 自己的** `heap_size_limit` 时才发出
（`spawnChannel.ts:27-34`），因此在目标更小的宿主上该标志被丢弃，子进程悄悄继承
V8 默认值——而它本身也是从宿主内存推导的。在一台 3.4 GB 宿主上实测：目标
1747 MB，daemon 限制 1795 MB，标志被丢弃，子进程上限 1795 MB。在一台 32 GB 宿主
上默认值约 4 GB，目标 16384 MB，标志被发出。

所以允许的总量在 32 GB 宿主上是 25 × 16 GB，在 3.4 GB 宿主上是 25 × 约 1.8 GB——
无论哪种都是大约十二倍的超卖，而该守卫今天唯一的效果是提高上限，从不降低。
最后这个性质正是下面的变更必须显式绕过它的原因。

根进程中的任何字节核算都不会改变这些数字中的任何一个，因为根进程不是分配这些
内存的进程。

### Daemon 测量内存但没有分母

`DaemonMetricsRing` 已经每五秒采样 `rssBytes`、`heapUsedBytes`、`cpuPercent` 和
`eventLoopLagP99Ms` 到 180 桶的环中，提供十五分钟的历史，并且已经用单飞守卫和
30 秒过期悬崖轮询主 ACP 子进程的 RSS
（`packages/cli/src/serve/daemon-metrics-ring.ts`，接线于
`run-qwen-serve.ts:4231-4377`）。`GET /daemon/status` 返回全部这些。

Daemon 缺少的是任何可以作为分母的数字。没有 cgroup 读取、没有
`heap_size_limit`、没有比例、没有压力级别、没有内存推导的 issue 码、没有
`limits.*` 内存字段，daemon 进程中也没有任何 CLI 标志。Core 的
`MemoryPressureMonitor` 计算了所有这些，但 `computeEffectiveMemoryLimit()` 是一个
私有方法（`packages/core/src/services/memoryPressureMonitor.ts:766`），属于一个只由
`Config.initialize()` 构造的类，而 daemon 从不调用它。次级工作空间子进程和每个
channel worker 完全不报告 RSS。

Daemon 能说出它正在使用多少字节，却说不出那是否算多。

## 问题

精确表述：**daemon 的容量模型与宿主内存没有关系，且 daemon 无法观察它离耗尽
有多近。** 另外且独立地，一小撮可枚举的根进程容器是真正无界的——其中任何一个
都可以独自耗尽根进程，而不需要任何子进程参与。两者都是真实的；两者都不是在每次
分配之上构建通用核算层的理由。

## 目标

- 从一个内存数字推导容量旋钮，使子进程的堆上限是某种资源的份额，而不是每个
  子进程重复一次的宿主比例。
- 给 daemon 一个分母，使压力在致命之前可观察。
- 在容器处约束真正无界的容器。
- 约束多个各自有界容器的_总量_，在数量倍增使总和成为真正风险的地方。
- 保持每个变更可独立评审且独立有用——并保持每个变更诚实地说明它覆盖哪些
  路径。

## 非目标

- 没有覆盖根堆的进程级字节账本，也没有堆代理计费模型。见"被拒绝的备选方案"。
- 观察工作中不做任何补救：不强制 GC、不做 LRU 驱逐、不关闭会话、不终止进程。
- 不改变交互式 CLI 或 IDE companion 的内存行为。
- 没有 RSS 或进程树内存_保证_。Part 1 约束 ACP 子进程的 V8 老生代空间；
  Buffer、原生分配、channel worker 和 MCP 后代不在其内。
- 现在没有通用调度层。Spawn 时准入在路上——它是任何可强制执行的活跃子进程
  预算所需要的——但它等待 Part 2 的数据，重 I/O 和进程 lane 等待并发放大的
  证据。见"被拒绝的备选方案"。

## 设计原则

**让边界成为容器的属性，而不是调用方的承诺。**

调用方声明的预留只与调用方一样可靠。#8093 的
`runBufferedProcessOperation(scheduler, budget, cwd, operation, maximumBufferedBytes, task)`
接受调用方断言的字节数，没有任何东西与进程的实际输出核对；声明 1 MB 却输出
500 MB 的调用方让账本在堆增长时报告健康。泛化该模式意味着几百个分配点中的每
一个都必须在每条路径上永远记得估计、预留和释放，且没有编译器协助。覆盖将是
部分的。部分覆盖不是无用——当状态和能力准确说出哪些路径受保护时它是好的、
正常的，这正是 #8093 自己的交付计划已经施加的纪律。失败模式比"部分"更窄：它
是在不完整核算之上宣告 daemon 级保证，使得已核算的路径在 503 拒绝工作，而真正
耗尽堆的是未核算的路径。

这个原则已经是本仓库的风格，本仓库最好的工作都遵循它：

- `readTextRangeFromHandle` 接受两个**必填**字节预算——`maxOutputBytes` 限制
  读取返回多少、`maxScanBytes` 限制其成本——因为"调用方恰恰在需要读取有界时
  才使用句柄"
  （[`2026-07-29-handle-bound-text-range-reads.md`](./2026-07-29-handle-bound-text-range-reads.md)）。
  它在每个 chunk 而不是每帧检查累加器，因为"没有换行符的区域否则会让它增长到
  整个文件常驻"（`packages/core/src/utils/read-text-range.ts:350-353`）。
- `packages/cli/src/serve/fs/policy.ts:33-62` 把软截断（`enforceReadSize`）与硬拒绝
  （`enforceWriteSize`、`enforceReadBytesSize`）分开，并把 `MAX_WRITE_BYTES` 刻意定在
  Express body 限制之下，使幸存于解析器的 body 也幸存于策略闸门。
- 有界重放窗口
  （[`2026-07-07-bounded-replay-snapshot-window.md`](./2026-07-07-bounded-replay-snapshot-window.md)）
  按序列化字节限制保留的重放，在单个单元超过上限时至少保留一个单元，并把丢失
  呈现为显式的 `history_truncated` 标记而不是悄悄截断。其 Audit Note 第 3 轮直接
  记录了教训："当一轮包含大型工具输出时，轮次数量上限无法约束内存。"

下面的工作泛化这些做法。它不在它们旁边添加第二种范式。

## 设计

### Part 1 — 一个预算、一个分母，先报告再应用

一次性解析 daemon 的内存数字并报告它们。还没有任何东西消费它们来给子进程定
大小，这种克制是设计本身，不是分阶段的权宜之计。

```
availableMemoryMb        = cgroup 限制，否则 os.totalmem()          （以宿主总量为上限）
configuredBudgetMb  = --memory-budget-mb ?? floor(availableMemoryMb * 0.5)
effectiveBudgetMb   = min(configuredBudgetMb, availableMemoryMb)
rootReserveMb       = min(clamp(floor(effectiveBudgetMb * 0.1), 256, 1024), effectiveBudgetMb)
childPoolMb         = effectiveBudgetMb - rootReserveMb
legacyChildCeilingMb     = min(floor(availableMemoryMb * 0.5), 16384)     // 今天子进程得到的值
insufficientMemory  = effectiveBudgetMb < 1024
```

配置值与生效值分开，因为它们在两个方向上都会偏离，合并它们会产生机器无法
支撑的分母。超过宿主的显式预算被向下封顶。低于文档最小值的推导预算**不会**
被向上钳制——早期草稿恰恰那样做了，一台 768 MB 宿主因此报告 1024 MB 预算，
这会毒化观察工作本要计算的每个比例。太小的宿主是一个观察结果
（`insufficientMemory`），不是发明容量的许可证。

`recommendedChildShareMb(budget, children)` 被导出并在注册子进程数和活跃子进程
数两处报告。它从不被应用。这两个数字之间的差距正是报告它们的意义。

#### 为什么份额不被应用

把池除以工作空间数量在它自己的逻辑上就失败，而本文档此前曾提议这样做：

- **注册不是分配。** 工作空间运行时惰性 spawn 其子进程，且
  `channelIdleTimeoutMs` 默认为 `0`——"立即杀死 channel"
  （`packages/acp-bridge/src/bridgeOptions.ts:415-422`）——因此休眠的次级运行时
  没有子进程。预热的主运行时是例外。
- **以注册数为除数有真实成本却一无所获。** 在一台 32 GB 宿主上，25 个注册
  工作空间而只有预热的主运行时活跃时，那个子进程会从 16384 MB 上限降到
  614 MB——由 24 个不持有内存的注册驱动的 26.7 倍削减。同时每子进程下限意味着
  分割后的份额总和仍超过池：在 8 GB 宿主上，25 个以 512 MB 为下限的子进程对着
  3687 MB 的池授权了 12800 MB。
- **动态注册留不下可靠的计数。** 启动时计数漏掉之后的工作空间；重新计算无法
  缩小运行中子进程的 V8 堆；当前注册数惩罚休眠的工作空间。改为除以_活跃_子
  进程仍然产生依赖 spawn 顺序的上限，仍然没有总量边界。

真正的控制是 spawn 时以并发活跃子进程为键的准入，并对下一个子进程将超过池
的情况有明示策略。这需要 Part 2 产生的数据，因此推迟而不是猜测。

#### 子进程容量策略到来时必须尊重什么

- **`--max-old-space-size` 约束 V8 的老生代空间，不是 RSS。** 它不覆盖 Buffer、
  外部分配和原生分配、新生代、channel worker、MCP 后代或任何其他子进程。这里
  的任何策略都是_子进程堆策略_，绝不是进程树内存保证，根预留是对冲而不是对
  那些消费者的核算。
- **即使没有拒绝，应用份额也是兼容性变更**，因为它改变了子进程的 GC 和 OOM
  行为。它不能作为"仅报告"发布。
- **它绝不能提高上限。** 钳制到 `legacyChildCeilingMb` 正是让该策略可以无条件
  安全应用的东西；没有它，最小预算常量和过大的显式标志都会抬高份额。
- **spawn 路径有一个陷阱。** `getAcpMemoryArgs()` 只在其计算目标超过_spawn 方
  daemon 自己的_ `heap_size_limit` 时才发出 `--max-old-space-size`
  （`spawnChannel.ts:27-34`）。预算推导的份额通常低于该值，因此朴素的变更会被
  悄悄丢弃，超卖回归。回归测试必须断言该标志在低于测试进程自身限制的值下
  存活。

### Part 2 — 在强制之前，带着分母观察

现有的五秒采样器获得有效内存限制、`v8.getHeapStatistics().heap_size_limit`，以及
跨**所有**工作空间子进程和 channel worker 的 RSS 总和，而不仅是主进程。状态增加
`runtime.memory { level, ratio, source }`，并在 `daemon-status.ts:70-85` 的封闭 issue
联合上增加两个码。

模式标志遵循既有的 `--mcp-client-budget` / `--mcp-budget-mode` 惯例：
`off | warn | enforce`，设置预算时默认 `warn`，`enforce` 在启动时被拒绝，直到后续
变更赢得它。本部分没有任何补救。

这是刻意提升到字节上限工作之前的。它是唯一一个其价值不依赖设计其余部分正确的
部件，之后选择的每个限制都应该用它的数据校准而不是猜测。#8093 的限制表对这个
顺序的论证比表面看起来弱，较弱的形式才是诚实的：`prompt: 384 MiB` 恰好是
`normalAdmissionBytes`，因此冗余，但 256 MiB 类别_并非_死代码——单个类别达到
256 MiB 会在正常总用量达到 384 MiB 上限之前就绑定。该表的问题只是常量未校准，
这正是观察要修复的。

### Part 3 — 约束真正无界的容器

按测量到的风险排序，每个可独立发布。

**NDJSON 帧读取器没有任何上限。** `packages/acp-bridge/src/ndJsonStream.ts:35`
声明 `pending: Uint8Array[]`，在 `:92` 推入未终止的尾部字节，从不检查数量或字节
总数。`takeLineBytes`（`:96-111`）然后为累积总量分配一个连续副本，
`TextDecoder.decode` 产生约其两倍的 UTF-16 字符串，`JSON.parse` 再次构建对象——
对没有上限的帧约五倍放大。这是每个 spawn 的 ACP 子进程 stdout 的读取侧，而
`packages/cli/src/serve/large-pipe-frame-observer.ts:10` 只记录超过 256 KiB 的帧。
修复是每个 chunk 检查的帧字节上限、daemon 管理流上的带类型致命错误，以及
`:33` 处解码消息 `ReadableStream` 的排队策略——它从不查询 `desiredSize`，是慢
消费者后面的第二个无界缓冲。`createStderrForwarder`（`spawnChannel.ts:58-72`，
64 KiB 带 `[truncated]` 标记）和 channel worker 的日志缓冲
（`channel-worker-supervisor.ts:67-69`）是仓库内的模板。

**EventBus 重放环只按帧数限制。** `packages/acp-bridge/src/eventBus.ts:473` 在
`ring.length > ringSize` 时驱逐，默认每会话 8000 帧，可调到一百万。这很显眼，
因为环周围的一切都已经是字节有界的：每订阅者队列 2 MiB、重放突发 8 MiB、日志
8 MiB、压缩重放 4 MiB。环是缺口，它把上面无界的帧乘以 8000。序列化大小在
`:459` 处**已经计算且在作用域内**，在那里它被交给压缩引擎；把它应用到环上就是
一个滚动总计、一个覆盖两个边界的驱逐循环，以及压缩引擎已经实现的至少保留一个
的保证。

**虚拟子代理会话记录被整体读取。**
`packages/cli/src/serve/virtual-subagent-sessions.ts:331,385` 在首次读取时以
`this.offset === 0` 调用 `Buffer.alloc(size - this.offset)`，物化整个 `.jsonl` 会话
记录以及单独的整个 `.stream` 附属文件，然后 `.toString('utf8')`，然后
`.split('\n')`，然后逐行解析。`createSnapshotOnce`（`:593-620`）构造第二个目标并
重新读取整个会话记录，留下两到三个活跃副本。已在路上的分页读取器和字节游标
模式就是替代方案。

**会话加载和导出的上限不对称。**
`packages/cli/src/serve/server/session-export.ts:83-108` 在归档分支传递字节上限，
在活跃分支调用 `loadSession()` 时没有上限——daemon 加载和恢复使用的是同一条
无上限路径。归档上限是 256 MB JSONL，解析成一到两 GB 对象，因此两个分支都不是
真正的边界。`session-transcript-reader.ts` 是正确的模型并且已经存在。

**工作空间提供的配置文件读取没有大小闸门。** 对工作空间 `.qwen/settings.json`
（`packages/cli/src/config/settings.ts:557,733`）、trusted folder、serve 快路径
（同步，因此还阻塞事件循环）以及每个发现的 `QWEN.md`（并发二十个，
`packages/core/src/utils/memoryDiscovery.ts:225,245`）使用
`fs.readFileSync(path, 'utf-8')`。注册一个包含两 GB `settings.json` 的工作空间
就能在没有会话、没有 prompt、没有代理的情况下耗尽 daemon——这是该组中最便宜的
攻击，也是离堆账本会注意到的东西最远的一个。

记录在案并带证据推迟的：SSE 和 WebSocket 写链尊重背压但不限制排队字节
（`acp-http/sse-stream.ts:110-128`、`ws-stream.ts:58-82`）；ACP 附加前帧缓冲镜像了
EventBus 的 `maxQueued` 但没有其 `maxQueuedBytes`（`connection-registry.ts:18,30`）；
整理后的会话列表物化 50,000 条摘要；若干每工作空间缓存比其工作空间活得更久。

### Part 4 — 在数量倍增要紧的地方的小总量配额

约束一个容器约束的是一个容器。它不约束 _N_ 个容器，而 daemon 的形态是许多小的
有界事物：每工作空间 32 个会话、25 个工作空间、每个 8 MiB 日志和 4 MiB 压缩
重放。每一个都可以待在其文档限制之内而总量达到数 GB。因此仅 Part 3 不产生总量
边界，声称相反会重复本文档批评 #8093 的错误。

所需的是窄的：对保留环、队列、缓存和并发大操作的工作空间级和进程级计数器，在
实际的插入和删除点更新。两个性质防止它变回 #8093 的账本——它计算容器**实际
保留**的字节而不是估计的 V8 对象成本，并且它在数据结构已经变更的地方维护，而
不是在每个调用方必须记住的单独预留调用处。`EventBus` 现有的每订阅者
`maxQueuedBytes` 是要复制的形态；它已经正确，只是没有聚合。

这部分的范围和常量属于 Part 2 之后，原因与其常量的原因相同。

### 共享辅助函数，在第二个消费者出现时提取

`truncateUtf8` 存在两个私有副本。一个按数量、字节和 TTL 约束的容器被正确实现了
一次（`session-transcript-reader.ts:148-150`），其他地方是近似实现。REST 和 ACP
对同一套共享错误类维护两个手写映射，其中 `FsError`（`fs/errors.ts:101`）是唯一
携带自己 HTTP 状态码的成员。当本工作中出现第二个消费者时每一个都值得统一，
而不是更早。

## 被拒绝的备选方案

**覆盖根堆的进程级字节账本（#8093 的 `ResourceBudget`）。** 它给根进程做预算，
而内存不在那里；它的堆代理常量与 V8 没有稳定关系——V8 把字符串表示为 rope、
切片或外部数据，并按隐藏类共享给对象定价——所以误差在两个方向上是两到五倍；
它的类别是全局的而不是每工作空间的，因此不能交付 #8051 要求的租户隔离。它自己
的默认值显示了没有测量就选择数字的困难，如上所述。

运行该分支确认的两个实现性质值得记录，以免日后重新推导。
`ResourceBudget.release()` 和 `ResourceBudgetLease.commitGrow()` 是公开且无校验的，
因此一次游离调用就能把 `usedBytes` 打成负数，之后每个上限都悄悄停止绑定；而
`grow()` 接受属于另一个预算的租约，这会同时损坏两者。另外，只要提供了
`capBytes`，`emergencyPoolBytes` 就变成 `0`（`resource-budget.ts:199-201`），因此
为保持关闭和过载响应可行而存在的预留在运维人员配置预算时恰好消失——这正是
`--memory-budget-mb` 会做的事。

**按原样新增公平调度层（`FairDaemonBulkScheduler` 及其 spawn 和进程 lane）。**
上面列举的每个热点都是大小问题；没有一个能通过准入更少的并发操作来修复。并发
原语已经存在且在使用中：带 FIFO 准入、`AbortSignal` 出队和 `runUntilReleased`
提前释放槽位的 `createFifoTaskQueue(limit)`
（`extension-operation-scheduler.ts:31`）；按键锁定的 `PathMutexRegistry`；以及带
幂等释放和带类型错误的计数准入 `createTotalSessionAdmissionController`
（`total-session-adoption.ts:40-121`）——它今天提供每工作空间隔离。

提议的 lane 还带有反对把它们作为基础采纳的缺陷：`AbortSignal` 被接受但从不转发
给任务，因此取消请求只在排队时将其出队，运行中的子进程继续持有其槽位；嵌套和
跨 lane 获取是硬 503，通过 `AsyncLocalStorage` 传播到所有继承的异步工作，这在一
个批量操作正当地需要 spawn 时第一次就失败；spawn 和进程 lane 把每工作空间活跃
限制设为等于全局限制，因此一个工作空间可以占用所有槽位。这是推迟并收窄调度器
的理由，不是排除它的理由，本文档的早期草稿夸大了这一点。现有原语不是完全的
替代品：`createFifoTaskQueue` 没有等待上限和超时，`PathMutexRegistry` 可以累积无界
的 promise 链，`createTotalSessionAdmissionController` 限制会话数但不限制子进程
spawn、文件系统解码或外部进程。更具决定性的是，**任何可强制执行的活跃子进程
预算都需要 spawn 时准入**——这恰恰是一个调度 lane。所以 spawn 准入在路上；重
I/O 和进程 lane 应该等待显示并发放大或跨工作空间饥饿的测量，如果需要每工作
空间公平性，在现有队列上加键控轮询大约四十行，对照一个经过测试的原语。

**daemon 请求路径上的 `AsyncLocalStorage`。** 今天在 `packages/cli/src/serve` 或
`packages/acp-bridge` 中没有。工作空间归属已经显式地作为
`WorkspaceRequestContext.workspaceCwd`（`workspace-service/types.ts:68-77`）和文件
系统边界的 `AuditContext` 流动。添加隐式传播来携带已经显式携带的数据，只增加
机制不增加信息。

## 兼容性

交互式 CLI、IDE companion 和直接嵌入 bridge 路径不变：它们 spawn 一个子进程并
保留宿主推导的上限。

Part 1 不改变任何子进程 spawn 参数，因此在任何宿主上任何子进程的定大小方式都
没有变化。唯一新的启动行为是拒绝越界的 `--memory-budget-mb`，以及在显式设置
预算或宿主低于文档最小值时的 stderr 面包屑。

属于这里的兼容性讨论是给随后的子进程容量策略的，并与它一起推迟。现在可以说
的是：该策略会降低上限且绝不能提高它们，即使没有拒绝它也是兼容性变更，而且它
需要一条针对已运行子进程无法缩小这种情况的准入规则。

不引入新的拒绝。唯一新的启动失败是越界 `--memory-budget-mb` 的既有校验形态。
工作空间注册、持久化恢复和 `POST /workspaces` 不变。

`maxSessions` 和 `maxTotalSessions` 保留其当前默认值和推导，本变更不给它们新的
边界。早期草稿声称 `maxTotalSessions` 被传递性地约束，因为 `workspaceCount` 会被
预算封顶；对照本 PR 这是假的——工作空间上限仍是固定的
`MAX_REGISTERED_WORKSPACES = 25`，没有任何东西从预算推导限制。会话仍然复用到每
工作空间一个子进程上，因此每会话内存位于一个子进程堆内，而除了 V8 自己的上限
外目前没有任何东西约束它。`maxSessions` 的文档应该被读作公平性和文件描述符
杠杆，而不是内存杠杆。

`GET /daemon/status` 上的 `limits.memory` 和 `runtime.memory` 在 SDK 镜像中是增量
且可选的，因此较旧的 daemon 可以被较新的客户端解析。

Channel worker 每工作空间 spawn `process.execPath`，不带内存参数
（`channel-worker-supervisor.ts:823`）。它们是 daemon 进程树内存的真实消费者，不
被每子进程上限覆盖；根预留名义上覆盖它们，Part 2 测量它们。

## 验证计划

- 在注入宿主数字的情况下，跨受限和不受限宿主单元测试预算算术，包括每子进程
  下限、16 GB 上限、cgroup 哨兵钳制，以及每子进程份额对子进程数的单调性。
- 回归测试预算推导的上限即使低于 spawn 方 daemon 自己的堆限制也会被发出。
  `getAcpMemoryArgs()` 目前只在计算目标超过当前限制时才发出
  `--max-old-space-size`；预算推导的值通常更小，因此朴素的变更会悄悄丢弃该标志
  并恢复超卖。这是第一个变更中最重要的单个测试。
- 断言有效预算在两个方向上都不超过解析出的宿主内存：超过宿主的显式预算被
  向下封顶，低于文档最小值的宿主报告 `insufficientMemory` 而不是被向上钳制。
  断言在 768 MB 到 32 GB 的宿主规模上建议份额绝不超过 `legacyChildCeilingMb`。
- 断言没有子进程 spawn 参数变化：现有 spawn 套件原样通过，`getAcpMemoryArgs`
  在这个阶段不动。
- 端到端：用若干 `--workspace` 值启动并读取 `GET /daemon/status`；`limits.memory`
  应该诚实描述宿主，`runtime.memory` 应该在工作空间空闲后显示
  `activeAcpChildren` 低于 `registeredWorkspaces`——这正是把后续策略键到活跃
  子进程上的观察依据。
- 对 Part 2，断言在 cgroup v2、cgroup v1 和两者皆无的情况下比例有限；断言级别
  分类；断言不存在补救路径；确认子进程 RSS 总和包括次级工作空间和 channel
  worker。然后在真实使用下运行 daemon 并读取结果——那份数据校准 Part 3。
- 对每个 Part 3 变更，验收测试是对真实超大输入的前后对比：单个多 GB NDJSON
  帧、8000 帧大事件环、两 GB 的 `settings.json`。daemon 必须以带类型的错误拒绝
  而 RSS 保持平坦，而今天它会增长到进程死亡。该证据正是重点：账本内部一致的
  测试不是内存有界的测试。
- 对每个变更运行 `npm run build`、`npm run typecheck` 和 `npm run lint`，加上
  触碰文件的同目录套件。
