# Daemon 首输出延迟

- **跟踪**: #7757
- **immediate-prompt 后续**: #7982
- **背景**: #7264
- **范围**: daemon/ACP 客户端可观测的延迟
- **状态**: 测量与 immediate-prompt 归因

## 决策与范围

第一个 PR 只做测量：一个 opt-in 基准测试、纯分类/统计辅助函数、测试和带版本的产物。它不改变生产启动行为。

只有当单 bundle 基线通过其门禁时，才允许一个独立的 Provider 准备原型。发布该原型还要求独立的对照 bundle 与候选 bundle 通过本文档中的所有延迟、资源、功能和清理门禁。一个有效的阴性结果即终止该工作。

基准测试测量从进程 spawn 到首个模型派生输出的过程，同时把本地准备、Provider 请求到达、首输出、首个回答文本和终态完成分开记录。现有的生产 `ttft_ms` 保持不变：它仍然测量从 Provider 分发到首个可见内容，不会吸收惰性加载或本地 prompt 准备。

不在范围内的有：TUI/Web Shell/编辑器渲染、prompt 缓存、压缩、模型思考/工具行为、网络预连接、真实模型延迟优化、生产遥测变更、公开生命周期 API、协议字段、配置和功能开关。

## 仓库与 runner 契约

| 路径                                                               | 职责                                                                                             |
| ------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------- |
| `integration-tests/cli/qwen-daemon-first-output-benchmark.test.ts` | opt-in runner、假 Provider、隔离的进程生命周期、基线/对比协议和产物写入 |
| `integration-tests/cli/_first-output-benchmark.ts`                 | 纯事件跟踪、分类、百分位数、配对 bootstrap 和决策输入                    |
| `integration-tests/cli/_first-output-benchmark.test.ts`            | 针对纯契约的确定性测试                                                                  |
| `integration-tests/fake-openai-server.ts`                          | 现有的假 Provider，带 opt-in 连接关闭，以获得无偏的冷/热测量                  |

runner 在 `QWEN_FIRST_OUTPUT_BENCHMARK=1` 之外是禁用的。其两种输入模式互斥：

- **基线**: `BENCHMARK_CLI_PATH`。
- **对比**: 同时提供 `BENCHMARK_CONTROL_CLI_PATH` 和 `BENCHMARK_CANDIDATE_CLI_PATH`。

`BENCHMARK_POST_SESSION_DWELL_MS` 仅用于对比，只接受 `0`、`100` 或 `500`，默认为 `0`。`BENCHMARK_MEASURED_PAIRS` 也仅用于对比，只接受 `10` 或 `30`；500 ms 诊断默认 `10`，其他情况默认 `30`。500 ms 运行要求 10 对，0/100 ms 运行要求 30 对，因此诊断结果不会被误标为可作决策。正式的 Phase 2 运行会为三个 dwell 场景分别调用 runner；不同 dwell 值的样本绝不混合。缺失或混杂的模式、相同的对比 bundle、不可读的路径、不支持的 dwell 或配对数量，以及不匹配的 dwell/采样计划，都会在采样前以 `invalid_configuration` 失败。

dwell 锚定在 SSE 就绪而不是会话就绪上。SSE 连接位于两者之间，因此锚定到 `sessionReady` 会让一次慢连接消耗掉整个窗口，把 100 ms 场景悄悄缩减成一个 immediate-prompt 运行，而它仍报告其配置的 dwell。`sseReadyToPromptMs` 记录每个样本实际收到的空闲窗口。

毫秒级数字只有在没有其他任务争抢主机时才有意义，因此 runner 被排除在共享集成配置之外，并在 `integration-tests/vitest.firstoutput.config.ts` 有自己的串行配置（`fileParallelism: false`、串行执行、`retry: 0`）。纯辅助函数测试继续在共享套件中运行。按如下方式运行基准测试：

```text
QWEN_FIRST_OUTPUT_BENCHMARK=1 QWEN_SANDBOX=false BENCHMARK_CLI_PATH=... \
  npx vitest run --config integration-tests/vitest.firstoutput.config.ts
```

产物写入 `.qwen/investigations/daemon-first-output-benchmark/` 之下，位于集成 harness 的一次性运行目录之外。这使成功、失败和阴性结果的运行在全局拆除后仍然保留，而不需要 `KEEP_OUTPUT`。

## 测量契约

### 单一时钟

所有延迟时间戳在父 harness 中使用 `performance.now()`。没有任何时延组合了 daemon、ACP 子进程、Provider 或墙上时钟。daemon FIFO 队列等待值是隔离的 prompt 完成后读取的一个现有独立时延；它绝不从父时间戳中减去。

| 时间戳                  | 客户端可观测的定义                                                       |
| -------------------------- | ---------------------------------------------------------------------------------- |
| `processSpawnAt`           | daemon `spawn` 之前的一瞬间                                                  |
| `sessionReadyAt`           | 成功的会话响应被完整读取并校验                               |
| `sseReadyAt`               | 观察到首个 SSE epoch 回调；dwell 锚点                                |
| `promptStartedAt`          | 启动非阻塞 prompt 请求之前的一瞬间                        |
| `promptAcceptedAt`         | HTTP `202` 主体校验通过，包括顶层 `promptId` 和重放游标        |
| `userEchoAt`               | 从 SSE 解析出匹配的中继 `user_message_chunk`                              |
| `providerRequestArrivalAt` | 假 Provider 接受被测量的请求，位于其固定延迟之前                 |
| `providerReadyAt`          | 固定的 50 ms 延迟已过，响应流可用之前的一瞬间 |
| `firstModelOutputAt`       | 解析出被接受的顶层 `promptId` 的首个合格 SSE 事件            |
| `firstAnswerTextAt`        | 解析出首个合格的回答文本事件；可为空                                |
| `terminalAt`               | 解析出匹配的 `turn_complete` 或 `turn_error`                                    |

原始时间戳产生这些精确的指标：

| 指标                                 | 计算                                           |
| -------------------------------------- | ----------------------------------------------------- |
| `processToSessionReadyMs`              | `sessionReadyAt - processSpawnAt`                     |
| `sseReadyToPromptMs`                   | `promptStartedAt - sseReadyAt`，诊断用            |
| `promptToAcceptanceMs`                 | `promptAcceptedAt - promptStartedAt`                  |
| `acceptanceToProviderRequestArrivalMs` | `providerRequestArrivalAt - promptAcceptedAt`，带符号 |
| `promptToUserEchoMs`                   | `userEchoAt - promptStartedAt`                        |
| `userEchoToProviderRequestArrivalMs`   | `providerRequestArrivalAt - userEchoAt`，带符号       |
| `daemonPromptQueueWaitMs`              | 现有的 daemon FIFO 队列等待时延              |
| `promptToProviderRequestArrivalMs`     | `providerRequestArrivalAt - promptStartedAt`          |
| `promptToFirstModelOutputMs`           | `firstModelOutputAt - promptStartedAt`                |
| `promptToFirstAnswerTextMs`            | `firstAnswerTextAt - promptStartedAt`，可为空       |
| `providerReadyToFirstModelOutputMs`    | `firstModelOutputAt - providerReadyAt`                |
| `promptToTerminalMs`                   | `terminalAt - promptStartedAt`                        |
| `processToFirstModelOutputMs`          | `firstModelOutputAt - processSpawnAt`                 |

`promptAcceptedAt` 是诊断用的，不是延迟起点：Provider 请求或事件可能先于 HTTP `202` 的接收而到达。daemon 在转发 ACP prompt 之前先发布匹配的 user echo，但 SSE 投递仍可能输给 Provider 请求到达。因此 `acceptanceToProviderRequestArrivalMs` 和 `userEchoToProviderRequestArrivalMs` 都是带符号的偏移量，负值有效。所有其他时延必须为非负。队列等待计数器必须对每个隔离 prompt 恰好推进一次，并保留有限的非负 `lastMs`；否则样本无效，因为该值无法安全关联。缺失必需的时间戳或非有限值会使样本无效。harness 拥有 30 秒的 SSE 就绪截止时间；SDK 连接超时被记录并设置为晚五秒，因此定时器顺序不会把 `sse_connect_timeout` 变成另一个失败码。

immediate-prompt 归因指标刻意止步于现有边界。它们合起来可以区分客户端/路由接受、转发前的中继 user echo、daemon FIFO 排队，以及剩余的 ACP 子进程/本地准备区间，而无需新增跨进程时间戳、协议字段或生产遥测。echo 边界包含 SSE 中继时间，是近似的，而不是 daemon 内部时间戳。这些指标不把剩余区间细分到 ACP 传输、prompt 准备、Provider loader 落定和请求构造之间；更深的插桩需要单独的证据和设计。

### Prompt 与事件关联

SSE 收集器在 prompt 之前处于激活状态，或从其之前的游标恢复，并缓冲固定数量的事件，直到 `202` 给出被接受的顶层 `promptId`。接受信封必须包含非空的 `promptId` 和非负整数 `lastEventId`；旧式同步结果仅通过其 `stopReason` 识别，任何其他格式错误的响应都会被拒绝。prompt 接受超时会在样本拆除之前中止底层请求。收集器随后按原始到达顺序评估缓冲事件和实时事件，只接受精确的顶层 ID 匹配。更早的、缺少 ID 的和不相关的 prompt 事件被忽略；缓冲区溢出时，跟踪器锁存该失败并停止缓冲，因此样本被判定无效，多余事件被丢弃。

Provider 请求不携带 daemon `promptId`。因此每个隔离的假 Provider 一次只允许一个预期的被测量请求，并匹配其唯一的固定长度 prompt 哨兵。其时间戳可以在 `202` 之前缓冲；多余、缺失、过早或并发的请求都会使样本失败。

首个合格事件决定 `firstOutputAt`：

| 事件                                | 种类                                     |
| ------------------------------------ | ---------------------------------------- |
| 非空的 `agent_message_chunk` 文本 | `answer_text`，且是首回答边界 |
| 非空的 `agent_thought_chunk` 文本 | `thought_text`                           |
| 格式良好的首个 `tool_call`      | `tool_call`                              |

非空指解码后的文本长度大于零；文本不会被裁剪或改写。重放/状态帧、本地离散消息（包括斜杠命令和后台通知输出）、user echo、仅含角色或用量的 chunk、压缩诊断、格式错误的更新，以及 `tool_call_update` 都不计入。`turn_error` 总是失败。合格输出之前的 `turn_complete` 也失败。纯跟踪器允许有效的思考优先或工具优先轮次且回答指标为空，而实时假 Provider 必须产生其已知的回答哨兵。

## 假 Provider 与隔离

仅回环的 OpenAI 兼容假 Provider 记录请求到达、校验请求/模型、等待配置的 50 ms 定时器、记录实际经过的延迟和 `providerReadyAt`、发出一个流式回答哨兵，并正常完成。基准测试响应显式使用 `Connection: close`，因此热轮次不会从冷轮次打开的 TCP 连接中获益；网络预连接保持在被测量优化之外。该延迟把本地请求前工作与响应/事件传播分开；它不模拟真实延迟分布。纯测试覆盖思考优先和工具优先的固定样例，不给实时运行增加非确定性。

每个基线进程和每个对比分支都获得全新的 daemon/ACP 进程树、工作空间、home 与 `QWEN_HOME`、临时 daemon/Provider 端口、事件收集器和请求账本。样本串行运行。

Node 编译缓存在正式运行开始时为空，按 bundle 和模式隔离，只由被排除的热身填充，然后只被同一 bundle 复用。产物记录每个缓存目录以溯源，但干净的运行会在拆除时删除它，因此记录的路径事后不应存在。对照和候选绝不共享它们。热身观察以 `measured: false` 保留在产物中。

子进程从最小的环境允许列表启动。它使用固定的 locale/时区、隔离的可写路径、禁用的遥测/更新检查、哑 Provider 配置，以及清空的真实凭据和代理变量。产物只记录刻意提供的非机密值。

正式对比使用在同一台空闲 2-vCPU Linux 主机上、从同一 lockfile 构建的 release bundle。产物记录解析后的路径、SHA-256 哈希、可得时的源码修订号、Node/OS/CPU/内存和负载元数据。文件系统页缓存和调度器噪声无法可靠地冲刷，因此 AB/BA 顺序和顺序敏感性门禁是强制的。

## Phase 1：单 bundle 冷/热基线

运行 2 个被排除的热身进程，然后运行 50 个被测量进程。每个被测量进程：

1. 创建一个全新的 `sessionScope: thread` 会话并发送一个立即的固定长度 prompt（`cold`）；
2. 等待其校验通过的终态；
3. 保持第一个会话打开，在同一个 ACP 子进程上创建一个不同的 `sessionScope: thread` 会话；然后
4. 发送一个带不同哨兵的同长度 prompt（`warm`）。

runner 在两个轮次之后记录 ACP 子进程 PID，除非恰好一个未变化的子进程服务了这两个轮次，否则判定样本无效。只在第二个轮次之后才关闭两个会话。因此第二个会话拥有全新的每会话惰性 Provider 包装器，但拥有热的 ACP 进程级 ESM/运行时缓存。这一对框定了进程首次经过 prompt 路径的一次性本地成本，且不受对话历史混淆。Provider 构造是该成本的一个组成部分；第一个 prompt 还要为首次 daemon 路由命中、首次 ACP IPC 往返、JIT 预热和任何不相关的惰性导入付出代价。因此该差值是预加载 Provider 所能挽回的上限，而不是 Provider 加载的估计，通过门禁并不证明 Provider 占其中任何特定份额。归因由 Phase 2 的配对比较测试来回答。两个会话仍然各自在 prompt 时构造自己的 Provider，因此原型可能移入 dwell 的工作不计入；该门禁是保守的。第二会话的 process-to 指标是诊断用的。

基线期望每个进程恰好两个 Provider 请求。全部 50 个冷/热对必须有效。冷和热共享一个进程，因此它们的差值是配对样本而非独立样本，门禁用配对中位数及其带种子的 bootstrap 95% 区间来判定：

```text
providerDelta[i] =
  cold promptToProviderRequestArrivalMs[i] -
  warm promptToProviderRequestArrivalMs[i]

providerDeltaCiLow = median(providerDelta) 的 95% CI 下界
```

Phase 1 在满足以下任一时通过：

```text
providerDeltaCiLow >= 25 ms
```

或：

```text
providerDeltaCiLow >= 10% * P50(cold promptToFirstModelOutputMs)
```

必须是下界而非点估计跨过阈值，因此仅勉强超过阈值的差值不能凭噪声的强度授权原型。两个 P50 的差仍然为连续性而记录，但不再决定任何事情。冷总是第一个会话，因此这一对不能像 Phase 2 对比那样做顺序均衡；这是该构造的已知限制，不是遗漏。

否则保留产物并停止生产工作。

## 对比与统计

每个对比 dwell 使用 2 个被排除的热身对，随后是 30 个测量对，但显式诊断的 500 ms 场景除外，它使用 10 对并总是报告一个不确定的顶层结果。奇数对先运行对照再运行候选（AB）；偶数对先运行候选再运行对照（BA）。每个分支都有全新状态，每个记录的差值都是 `candidate - control`，因此负延迟表示更快。

失败的分支保留在原始输出中并使其所在对无效。它们不会被替换。采样在第一个无效进程或完成的对之后停止。外层 Vitest 截止时间从最大合法采样计划和每个固定生命周期超时保守推导，并留有调度器余量，因此即使是合法的近截止样本也不会抢占产物写入。紧急拆除有自己的固定 hook 截止时间。没有异常值删除、winsorization、子集选择或 Vitest 重试。任何无效的主对都使正式运行无效。

对每个指标，报告每个分支的最近秩 P50/P90/P99 和均值、配对中位数差值、胜/平，以及 AB/BA 子组中位数。P90/P99 在 30 对时仅为描述性；没有至少 100 对，不做出任何 P95 或尾延迟结论。

两种中位数定义刻意共存，对比列的读者应预期它们在偶数个样本上有所不同。每分支的 `p50` 是最近秩的，因此总是一个观测值。配对 `median delta` 以及 bootstrap 内部重采样的中位数在偶数计数时取中间两个值的平均。因此一个 Markdown 行可以显示算术上对不起来的 `p50` 和 `median delta`，而两者都没有错。

配对中位数 95% 置信区间使用 10,000 次带种子的有效配对差值有放回 bootstrap 重采样；种子和迭代次数被存储。其边界是最近秩的 2.5 和 97.5 百分位数。每个指标的种子按其在指标列表中的位置偏移，因此插入或重排一个指标会移动其后每个指标的 bootstrap 边界，使变更两侧的产物即使原始样本相同也不可比较；每指标存储的 `seed` 使这一点可审计。当 AB 和 BA 的中位数差值符号相反且任一绝对中位数至少 10 ms 时，`orderSensitive` 为 true。顺序敏感性使运行结果不确定，而不是被平均掉。

配对产物的顶层结果只描述该场景中的主指标。它不评估跨场景、资源、功能或发布门禁，本身也不能授权 Phase 2 拉取请求。

## 失败、产物与清理

每个已分类的生命周期或样本失败都被保留，并有一个主代码：

| 代码                              | 触发                                                          |
| --------------------------------- | ---------------------------------------------------------------- |
| `invalid_configuration`           | 无效的模式、路径、dwell、环境或 bundle 身份       |
| `daemon_boot_timeout`             | 截止时间前没有监听端点                            |
| `daemon_exited_before_listen`     | daemon 在就绪前退出                                   |
| `session_create_failed`           | 错误或格式错误的会话响应                              |
| `sse_connect_timeout`             | 截止时间前 SSE 未建立                              |
| `sse_stream_ended`                | SSE 在匹配终态之前结束                               |
| `prompt_accept_timeout`           | prompt 请求未在截止时间前完成                    |
| `prompt_rejected`                 | 错误或格式错误的 `202` 响应                                |
| `legacy_prompt_response`          | 端点同步完成而不是返回 `promptId` |
| `event_buffer_overflow`           | 超过固定的接受前缓冲区                             |
| `provider_request_count_mismatch` | 多余、缺失、过早或并发的假请求                |
| `unexpected_output_kind`          | 仅回答的实时基准测试首先发出了另一种输出种类     |
| `first_output_timeout`            | 截止时间前没有合格输出                             |
| `terminal_before_first_output`    | 没有合格输出的干净终态                         |
| `turn_error`                      | 匹配的错误终态                                          |
| `terminal_timeout`                | 输出后截止时间前没有终态                         |
| `wrong_final_text`                | 回答与哨兵不同                                     |
| `cleanup_timeout`                 | 自有资源未在截止时间前停止                         |
| `residual_process`                | 被跟踪的 daemon/ACP 后代在清理后幸存                   |
| `harness_error`                   | 未分类的 harness 不变量或 I/O 失败                    |

首个因果生命周期失败保持为主；SSE/会话和进程清理失败单独记录，仍使该对无效。非有限计时和除两个带符号偏移之外的无效负计时保留为 harness 失败，但在聚合前归一化为 `null`，失败的运行绝不参与百分位数或门禁计算。固定超时、请求限制和缓冲容量被序列化。诊断消息和有界的 stdout/stderr 尾部不影响决策。

每次调用写入 schema 版本 2 的 `daemon-first-output` JSON，加上仅从该 JSON 派生的 Markdown。它包含运行/平台/bundle 身份、脱敏配置、热身、每个原始相对时间戳和指标、锁存的首输出/回答/终态事件类型和关联计数、Provider 请求计数、无效样本和对、失败、清理结果、统计/bootstrap/顺序汇总，以及带显式决策理由的门禁输入。Phase 2 资源运行用 RSS 测量扩展其验证证据。已分类的样本失败保留在其固定样本槽位中；无效配置或未分类的 harness 失败产生致命产物。产物排除凭据、token 和非基准测试哨兵之外的 prompt 内容。

清理总是中止并等待 SSE、关闭活跃会话、捕获 ACP/MCP 后代 PID、在其 leader 仍已知存活时向自有进程组发送 `SIGTERM`，并且只有当同一 leader 在固定宽限期后仍存活时才升级整个组。捕获的后代和枚举完整性锁存通过紧急清理保持附加在活跃资源上。一旦 leader 退出，清理绝不再探测或向其数值进程组 ID 发信号，因为 POSIX 可能复用它；它只验证保留的后代集合，如果有后代幸存或枚举不完整则安全失败。Provider socket 只在进程拆除之后关闭，临时状态只在两者都验证之后才删除。清理绝不使用按进程名全量杀杀。任何无效进程或完成的对都立即停止采样并保留失败。如果自有进程或监听器无法被验证为已停止，runner 记录推迟到紧急清理的临时根、在需要时标记一个未启动的对应项以保留无效对，并使紧急拆除失败可见，而不是悄悄丢弃其跟踪的资源。紧急拆除在删除推迟的临时根或编译缓存之前重试被跟踪的进程和 Provider。

## Phase 2：尽力而为的 Provider 准备

### 行为与边界

当前的惰性 generator 在 generation、流式、token 计数和 embedding 之间记忆一个 loader promise。准备可以提前启动同一个 promise；它不得添加另一个 loader/Provider、发出任何模型/token/embed 请求、刷新凭据，或改变急切校验和 Qwen OAuth 凭据时序。立即的 prompt 必须加入同一个 promise。

被拒绝的准备 promise 保持被记忆，使第一个 prompt 观察到同样的失败。分离的调用方可以附加一个拒绝观察者，仅为防止未处理的拒绝；它不得清除或替换存储的 promise。该能力保持在 Core 内部，不扩展公开的 `ContentGenerator` 契约。

最早允许的触发是 ACP 子进程成功写入 `session/new` 结果：

1. 观察收到的请求 ID；
2. 观察带有相同 ID 的已发送响应；

3. 依赖现有观察只在 `writer.write(frame)` resolve 之后发生；以及
4. 调度一个 unref 的 `setImmediate`，启动但不 await 准备。

失败的响应、认证、`session/load`、`session/resume` 和其他 RPC 不触发它。不使用 sleep 来猜测响应投递。ESM 导入不可取消，因此已关闭的会话可能允许已开始的导入完成；它仍必须不发出任何请求、不保留外部资源、不产生未处理的拒绝。

这个边界只是尽力而为。daemon 在子进程写入之后仍然执行会话所有权/配置/来源持久化工作并串行化外层 HTTP 响应。Provider 导入可能在 2-vCPU 主机上争抢并使 `processToSessionReadyMs` 退化；`setImmediate` 不创建跨进程的 happens-before 关系。因此会话非劣性是阻塞性的。如果失败，停止而不是调定时器。一个精确的外层响应完成信号需要跨越 HTTP 传输、daemon bridge 和 ACP 子进程，只有当测量值证明该复杂性值得时才需要单独设计。

### 发布门禁

在参考主机上使用不同的 release bundle：

| 场景                     | 要求的结果                                                                                                     |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| 假 Provider，0 ms dwell，30 对   | `processToSessionReadyMs` 和 `promptToFirstModelOutputMs` 两者的 95% 配对中位数 CI 上界都 `<= +10 ms` |
| 假 Provider，100 ms dwell，30 对 | `processToFirstModelOutputMs` 配对中位数 `<= -10 ms` 且其 95% CI 上界 `< 0`                      |
| 假 Provider，500 ms dwell，10 对 | 仅诊断上界；不能补偿另一个失败的门禁，也不能独立证明合并合理               |

在 0 和 100 ms 假 Provider 运行中，全部 60/60 对必须有效，零个预加载窗口内的 Provider 请求，零残留进程，且无顺序敏感性。

在 Provider 准备落定之后、任何 prompt 之前，测量 1、4 和 16 个空闲会话的整个进程树 RSS。两个门禁都必须通过：

- 单会话候选减对照 P50 RSS `<= +10 MiB`；
- 从 1 到 16 个活跃会话的候选减对照增量增长每个新增会话 `<= +0.5 MiB`：

```text
((candidateRss16 - candidateRss1) -
 (controlRss16 - controlRss1)) / 15
```

每个空闲会话探针串行创建会话，等待准备落定，并在 RSS 测量之前不发送任何 prompt；任何 Provider 请求都使其失败。配对数量和顺序在正式测量之前固定在 Phase 2 验证产物中。

只有在所有假 Provider/资源门禁通过之后，才在同一主机上运行真实 Provider 的外部有效性：100 ms 下 30 个 AB/BA 对，外加一个 10 对的立即冒烟。功能/认证/流式/回答失败会阻塞。网络不确定性被报告，但不能在任一方向上推翻假 Provider 本地结论。

## 验证与决策

Phase 1 纯测试覆盖回答/思考/工具分类；本地/重放/诊断排除；精确和 `202` 前关联；缓冲区溢出；终态/错误路径；可为空的回答指标；最近秩百分位数；确定性 bootstrap；差值符号；无效对保留；顺序敏感性；代表性致命产物；以及 JSON 到 Markdown 的渲染。一个 opt-in release bundle 冒烟验证 Provider 接线、生命周期、产物 schema 和清理。正式基准测试不是默认 CI。

Phase 2 候选还额外测试触发时机和 RPC 过滤、与立即 prompt 的单飞、零 Provider 请求/凭据刷新、记忆化的拒绝、非阻塞响应写入，以及安全关闭。它必须通过构建、typecheck、受影响的单元/集成测试，以及完整的产物门禁。

```text
50 进程冷/热基线有效且满足阈值？
├─ 否  → 保留产物；停止
└─ 是 → 单独做原型
         └─ 假 Provider 0 ms 非劣？
            ├─ 否  → 保留产物；停止
            └─ 是
               └─ 假 Provider 100 ms 显著更快且 CI < 0？
                  ├─ 否  → 保留产物；停止
                  └─ 是
                     └─ 60/60 有效 + 请求/清理/顺序/RSS 门禁通过？
                        ├─ 否  → 保留产物；停止
                        └─ 是
                           └─ 真实 Provider 运行功能通过？
                              ├─ 否  → 保留产物；停止
                              └─ 是 → 可以发布优化 PR
```
