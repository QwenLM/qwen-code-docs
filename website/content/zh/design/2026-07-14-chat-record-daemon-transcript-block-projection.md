# 从仅追加 ChatRecords 到 DaemonTranscriptBlocks 的共享投射内核

## 文档状态

- 状态：已实现
- 日期：2026-07-14
- 实现日期：2026-07-15
- 范围：core、acp-bridge、cli、sdk-typescript、web-shell
- 输入：调用方已从 JSONL 解析出的仅追加 unknown 记录
- 输出：带有诊断和完整性信息的 `DaemonTranscriptBlock` 投射

## 结论

实现结果：记录准备、ACP 重放机、纯 live/replay 构建器、CLI 适配器、感知来源的压缩、SDK 规范化器/reducer，以及 opt-in 的 SDK 门面都已落地。默认的 daemon 浏览器 bundle 仍在其 151 KiB 预算之内；压缩后的 transcript 浏览器 bundle 为 67,730 字节。分离的 daemon 和 daemon/transcript 产物合计 222,335 字节，而同时导入两者的产物为 222,722 字节。多出的 387 字节是组合模块的包装开销，因此调用方应把 transcript 子路径视为显式的 opt-in 成本。同步性能基线和 Web Worker 指引记录在 SDK README 中。

Web 调用方使用一个单独的 opt-in SDK 子路径：

    import {
      projectChatRecordsToDaemonTranscript,
      type ChatRecordTranscriptProjection,
    } from "@qwen-code/sdk/daemon/transcript";

    const projection = projectChatRecordsToDaemonTranscript(records);
    const { blocks, diagnostics, complete, truncated } = projection;

这个同步函数不会启动 daemon、Express 或 ACP 子进程；不会访问文件系统、网络、DOM 或浏览器存储；也不会解析 JSONL 文本。它接受 `JSON.parse` 之后的原始仅追加记录，并在内部执行：

    runtime validation
      -> active leaf selection
      -> parentUuid chain reconstruction
      -> same-UUID fragment aggregation
      -> persisted transcript replay
      -> SessionUpdate normalization
      -> DaemonTranscriptBlock projection

共享实现分为三个深模块，归属明确：

    packages/core/src/utils/transcript-records.ts
      -> package export @qwen-code/qwen-code-core/transcriptRecords
      -> browser-safe record preparation
      -> active chain, aggregation, gaps, diagnostics

    packages/acp-bridge/src/transcript-replay.ts
      -> browser-safe replay machine
      -> shared pure SessionUpdate builders

    packages/sdk-typescript/src/daemon/ui/chat-record-transcript.ts
      -> SDK adapter
      -> normalizer/reducer/finalize
      -> public projection interface

CLI 的 `HistoryReplayer` 和实时的 `MessageEmitter`、`ToolCallEmitter`、`PlanEmitter` 都复用来自 acp-bridge 的纯 update 构建器。这防止了漂移仅仅从“CLI 对 Web”转移到“live 对 replay”：记录解释和 update 构造各自只有一个实现。

SDK 适配器把相同的 `SessionUpdate` 值包装为无 ID 的 `DaemonEvent` 值，复用现有的 `normalizeDaemonEvent` 和 transcript reducer，并最终返回 `blocks`、`diagnostics`、`complete` 和 `truncated`。

## 背景

目标场景是在 WebShell 中只读渲染由 `qwen -p` 生成的持久化 JSONL，例如：

    /root/.qwen/projects/-root--qwen-workspace/chats/<session-id>.jsonl

浏览器已经通过 host、文件选择器或其他可信读取路径获得了文件内容，并负责把 JSONL 文本解析为 unknown 记录。之后的完整路径是：

    parsed append-only records
      -> shared record preparation
      -> shared transcript replay
      -> DaemonTranscriptBlock projection
      -> WebShellTranscript

调用方不需要理解 `parentUuid` 树、回退后的活跃分支、相同 UUID 的追加片段、session artifact 记录或历史缺口。把这些持久化语义留给调用方会制造一个浅模块：接口看似单个函数，但正确使用它需要调用方重新实现 `SessionService` 的知识。

本设计不使用 `compactedReplay`。那是 daemon 为实时会话维护的有界内存恢复窗口；本工具处理的是调用方显式提供的持久化记录。离线投射默认没有块数上限，但保留了单个文本块的安全上限，并通过 `diagnostics` 和 `truncated` 显式报告所有有损处理。

## 现有基线：daemon `/load` 如何重放 JSONL

当前的 response-mode `/load` 不会把 JSONL 直接交给 SDK。完整路径是：

    SessionService.loadSession
      -> JSONL parse
      -> last non-artifact leaf
      -> buildOrderedUuidChain
      -> same-UUID aggregateRecords
      -> ResumedSessionData.conversation.messages

    QwenAgent.loadSession
      -> collectHistoryReplayUpdates
      -> HistoryReplayer
      -> MessageEmitter / ToolCallEmitter / PlanEmitter
      -> SessionUpdate[] in LOAD_REPLAY_META_KEY

    acp-bridge restoreSession
      -> extractLoadReplayResponse
      -> BridgeClient.seedSessionUpdates
      -> prepareSessionUpdateFrames
      -> EventBus.seedReplayEvents
      -> compactedReplay + liveJournal

    DaemonSessionClient.load
      -> replaySnapshot
      -> normalizeDaemonEvent
      -> reduceDaemonTranscriptEvents
      -> DaemonTranscriptState.blocks

stream-mode `/load` 的前半部分仍然由 `HistoryReplayer` 产生；这些 update 以 ACP 通知的形式进入待恢复的 `EventBus`，而不是包含在 load 响应中。两种模式最终都经过相同的 bridge 帧准备、规范化器和 reducer。

当前实现有三个必须收敛的分支：

- `SessionService` 和 `SessionTranscriptReader` 各自有自己的 `aggregateRecords` 实现。
- `SessionService` 选择最后一个非 artifact 记录作为叶子，而 `SessionTranscriptReader` 目前选择最后一个结构有效的记录。当 artifact 恰好位于文件末尾时，两者的语义不同。
- JSONL 重放依赖 CLI emitter 类，因此浏览器无法在不引入 `Config` 和 Node 运行时的情况下复用它。

本设计不创建单独的 JSONL-to-blocks 捷径。相反，它从上述路径中提取浏览器安全的记录准备和 `SessionUpdate` 构造，然后继续使用 daemon 现有的规范化/reducer 尾部。

## 目标

- 提供一个同步、内存内、浏览器安全的函数，把原始解析记录投射为 transcript。
- 把活跃链选择、相同 UUID 聚合和历史缺口整合到一个记录准备模块中。
- 让 CLI 重放、daemon load 和 Web 离线投射共享记录解释和 `SessionUpdate` 构造规则。
- 让实时 emitter 和重放机共享纯 update 构建器，以保持 live/replay 的局部性。
- 保留时间戳、源记录身份、part 顺序、工具开始/结果关联、分页状态和 EOF 悬挂清理。
- 对相同输入产生确定性投射，对不依赖当前 `Config` 的字段使用确定性回退。
- 把持久化 JSON 视为不可信输入，并区分调用方错误、可恢复的损坏和向前兼容的未知值。
- 为每一次跳过、歧义和截断发出结构化诊断；绝不把部分投射呈现为完整。

## 非目标

- 读取文件或解析 JSONL 文本。
- 模拟 `EventBus`、SSE 游标、`Last-Event-ID` 或 `compactedReplay`。
- 从记录中推断未持久化的 live-only 块，例如 permission、shell、user_shell 或取消。
- 把 core 的 Node-only reader、provider 类型或完整运行时拉进浏览器 bundle。
- 保证在缺少持久化调用 ID 时对同名并发工具调用进行无歧义恢复。
- 返回 session artifact 存储；artifact 仍然是单独的侧信道。
- 把整个 CLI emitter 类层次移入共享叶子；只有纯 update 构建器被共享。

## 架构

### 1. 记录准备模块

记录准备归 core 的持久化会话模型所有。添加一个浏览器安全的叶子：

    packages/core/src/utils/transcript-records.ts
      -> @qwen-code/qwen-code-core/transcriptRecords

该模块：

- 对 unknown 记录执行运行时校验；
- 选择显式的 `leafUuid`，或默认选择最后一个有效的非 artifact 对话记录；
- 通过 `parentUuid` 从叶子走到根；
- 在父节点缺失时停止，不连接更早的孤岛，并产生一个 `HistoryGap`；
- 按活跃链顺序聚合同 UUID 的片段；
- 使用 `SessionService` 目前使用的字段合并规则；
- 识别环、冲突的 `parentUuid` 值、损坏的记录和被跳过的 artifact 记录；以及
- 返回新的顶层记录和 part 数组，不修改输入。校验过的嵌套负载作为 readonly 值复用，而不是无谓地深拷贝。

完整数组和流式索引的读取方式不同，因此它们共享相同的语义原语，而不是强迫 `SessionTranscriptReader` 把整个文件加载进内存：

    validateTranscriptRecord
    isTranscriptConversationRecord
    selectTranscriptLeaf
    walkTranscriptUuidChain(lookup)
    aggregateTranscriptRecordFragments

`prepareTranscriptRecords` 为原始数组组合这些原语。`SessionService` 直接使用组合后的函数。`SessionTranscriptReader` 保留其字节偏移索引和分页读取，但使用相同的分类器、基于 lookup 的链行走器和聚合器。现有的 `buildOrderedUuidChain` 被折叠进该实现，不得作为第二次行走保留。

这既移除了两个 `aggregateRecords` 实现，也修复了当 artifact 是最后一条记录时 reader 的语义差异，同时不牺牲其流式索引或分页读取。

该叶子只能导入浏览器安全的类型和纯函数。它不得导入 `fs`、`path`、`Buffer`、`ChatRecordingService` 类或 provider 运行时代码。

Core 目前没有 exports map。实现必须显式保留根、`transcriptRecords`、`package.json` 以及现有 `./dist/*` 深导入的导出。添加浏览器叶子时不得意外关闭仓库记录为兼容的 `@qwen-code/qwen-code-core/dist/...` 路径。

### 2. Transcript 重放模块

`SessionUpdate` 语义属于 ACP，因此重放机和纯 update 构建器位于：

    packages/acp-bridge/src/transcript-replay.ts
      -> @qwen-code/acp-bridge/transcriptReplay

该模块隐藏：

- 记录类型/子类型分发；
- 消息 part 排序；
- text、thought、image 和 function-call 转换；
- 工具开始/结果/悬挂状态；
- Todo/plan、diff/content、usage 和来源；
- notification、cron、轮次中消息和 slash-command 结果；
- 源记录元数据；以及
- 分页重放状态。

删除该模块会把复杂性重新分散到 CLI 重放、实时 emitter 和 SDK 投射中，因此它通过了删除测试并具有足够的深度。

### 3. 共享 Update 构建器

重放机不重复 `MessageEmitter`、`ToolCallEmitter` 和 `PlanEmitter` 中现有的 update 构造规则。acp-bridge 叶子提供仅由适配器使用的纯构建器，例如：

    createUserMessageUpdate
    createAgentMessageUpdate
    createAgentThoughtUpdate
    createUsageUpdate
    createToolCallStartUpdate
    createToolCallResultUpdate
    createPlanUpdate

构建器只接受结构化参数并返回 `SessionUpdate`。它们不访问 `Config`、注册表、i18n 或网络。

CLI 实时 emitter：

    runtime input
      -> CLI metadata adapter
      -> shared builder
      -> sendUpdate

`HistoryReplayer`：

    prepared ChatRecord
      -> replay machine
      -> shared builder
      -> sendUpdate

SDK 离线投射：

    prepared ChatRecord
      -> replay machine
      -> shared builder
      -> id-less DaemonEvent
      -> normalizer/reducer

Diff 预览、Todo 提取、工具内容转换、usage 到 plan 的顺序以及来源回退必须放在共享构建器或其私有 helper 中。实时 emitter 只保留异步发送和运行时增强。

### 4. SDK 投射适配器

SDK 门面位于单独的 opt-in 入口：

    packages/sdk-typescript/src/daemon/ui/chat-record-transcript.ts
    packages/sdk-typescript/src/daemon/transcript.ts
    @qwen-code/sdk/daemon/transcript

它复用 daemon UI 规范化器和 reducer，但不进入默认的 `@qwen-code/sdk/daemon` 浏览器 bundle。调用方只需安装 SDK，不直接依赖 core 或 acp-bridge 子路径。

## 浏览器安全的包接缝

添加两个内部叶子导出：

    @qwen-code/qwen-code-core/transcriptRecords
    @qwen-code/acp-bridge/transcriptReplay

约束：

- 运行时不导入 Node 内置模块。
- 不访问 `process`、`Buffer`、DOM 或存储。
- 对 provider 和 ACP 包优先使用仅类型导入。
- SDK transcript 入口把实现内联进发布的 bundle。
- SDK 发布的 `.d.ts` 必须内联公共输入/投射类型，不得引用只作为 dev 依赖存在的 acp-bridge 子路径。
- 为 core、acp-bridge 和 SDK transcript bundle 添加 Node 内置模块守卫。

## 记录准备接口

公共 SDK 门面接受 `readonly unknown[]`。内部校验后，core 叶子产生：

    export interface TranscriptRecordInput {
      readonly uuid: string;
      readonly parentUuid: string | null;
      readonly sessionId: string;
      readonly timestamp?: string;
      readonly type: "user" | "assistant" | "tool_result" | "system";
      readonly subtype?: string;
      readonly message?: {
        readonly role?: string;
        readonly parts?: readonly unknown[];
      };
      readonly usageMetadata?: unknown;
      readonly toolCallResult?: unknown;
      readonly systemPayload?: unknown;
    }

    export interface TranscriptReplayGapInput {
      readonly childUuid: string;
      readonly missingParentUuid: string;
    }

    export interface PreparedTranscriptRecords {
      readonly sessionId?: string;
      readonly records: readonly TranscriptRecordInput[];
      readonly gaps: readonly TranscriptReplayGapInput[];
      readonly diagnostics: readonly TranscriptProjectionDiagnostic[];
    }

### 校验策略

致命的调用方错误直接抛出 `TranscriptProjectionInputError`，不返回任何部分结果：

    export type TranscriptProjectionInputErrorCode =
      | "invalid_records"
      | "invalid_max_blocks"
      | "leaf_not_found"
      | "mixed_session_ids";

    export class TranscriptProjectionInputError extends TypeError {
      readonly code: TranscriptProjectionInputErrorCode;
    }

- `records` 不是数组。
- `options.maxBlocks` 不是正的安全整数。
- 显式的 `leafUuid` 不存在。
- 一次投射中混入了两个或更多结构有效且不同的 `sessionId` 值。

SDK 入口一致地导出该错误。Core 内部的校验错误在门面边界处映射，使内部包的类不会泄漏到公共 `.d.ts`。除这些情况外，单个格式错误的记录不得让整个投射抛异常。

当单条记录或嵌套负载格式错误时，尽可能保留可恢复的历史并发出诊断：

- 跳过非对象、无 UUID 的记录、无效的 `parentUuid` 值和未知记录类型。
- 保留时间戳无效的记录，但为这些记录省略 `serverTimestamp`。
- 对重复 UUID 片段之间冲突的 `parentUuid` 值，保留第一个片段并报告冲突。
- 当 `parentUuid` 缺失时停止链并报告缺口。
- 当 `parentUuid` 值构成环时停止链并报告环。
- 跳过已识别类型的格式错误 part，并把投射标记为不完整。
- 跳过未知但向前兼容的子类型/part，并发出警告而不是抛异常。
- 按现有语义跳过不产生 transcript 内容的已识别 system 子类型，例如 `chat_compression`、`ui_telemetry`、`file_history_snapshot` 和 artifact 记录，不影响 `complete`。

空输入返回空 `blocks` 且 `complete` 为 `true`。仅含 artifact 的输入同样返回空 transcript，并附带一条信息性诊断。

显式的 `leafUuid` 必须指向对话记录。只匹配到 artifact 记录等同于叶子不存在。Artifact 记录不进入 UUID 链，也不参与重复父节点冲突检测。

### 诊断

    export interface TranscriptProjectionDiagnostic {
      readonly code: string;
      readonly severity: "info" | "warning" | "error";
      readonly message: string;
      readonly affectsCompleteness: boolean;
      readonly recordIndex?: number;
      readonly recordId?: string;
      readonly path?: string;
    }

诊断消息不得包含未脱敏的参数、结果、token 或凭据。调用方应按 `code` 分支；`message` 仅用于日志和默认展示。

`projection.complete` 意味着：

- 没有诊断的 `affectsCompleteness` 为 `true`；
- 没有发生块或文本截断；
- 重放终结已完成；以及
- 没有发生歧义的工具关联。

第一版至少稳定以下诊断码。码是兼容性契约；消息不是。

| code                            | affectsCompleteness | 含义                                       |
| ------------------------------- | ------------------- | --------------------------------------------- |
| invalid_record                  | true                | 整条记录被跳过                  |
| invalid_timestamp               | false               | 内容被保留但没有历史时间  |
| conflicting_parent_uuid         | true                | 同 UUID 片段的父节点冲突  |
| history_gap                     | true                | 活跃链缺少父节点          |
| parent_cycle                    | true                | 活跃链包含环             |
| malformed_part                  | true                | 一个已识别的格式错误 part 被跳过       |
| unknown_record_or_part          | true                | 未知扩展可能包含可见数据 |
| ambiguous_tool_call_correlation | true                | 工具结果无法唯一关联   |
| missing_tool_result             | true                | 工具调用没有持久化的结果           |
| presentation_fallback           | false               | 展示适配器失败；使用了回退    |
| transcript_blocks_truncated     | true                | `maxBlocks` 移除了较早的块              |
| transcript_text_truncated       | true                | 文本块超过字符上限     |

仅含 artifact 的输入可以使用信息性诊断而不影响 `complete`。之后添加码不得改变现有码的 `affectsCompleteness` 语义。

## 重放发出接口

共享层发出完整的 `SessionUpdate` 值并保留投射来源：

    import type { SessionUpdate } from "@agentclientprotocol/sdk";

    export interface TranscriptReplayEmission {
      readonly sourceRecordId: string;
      readonly sourceTimestamp?: string;
      readonly emissionOrdinal: number;
      readonly update: SessionUpdate;
    }

一次发出对应一条记录的投射，因此外层形态保留单数的 `sourceRecordId`。写入 `SessionUpdate` 时，它变成单元素的 `sourceRecordIds` 数组，以便后续压缩/upsert 操作安全合并。

    export interface TranscriptReplayUsageState {
      readonly promptTokens: number;
      readonly cachedTokens: number;
      readonly candidateTokens: number;
      readonly apiTimeMs: number;
    }

    export interface PendingTranscriptToolCall {
      readonly callId: string;
      readonly toolName: string;
      readonly sourceRecordId: string;
      readonly sourceTimestamp?: string;
    }

    export interface TranscriptReplayStateV1 {
      readonly v: 1;
      readonly pendingToolCalls: readonly PendingTranscriptToolCall[];
      readonly cumulativeUsage: TranscriptReplayUsageState;
    }

    export interface TranscriptReplayMachineOptions {
      readonly initialState?: TranscriptReplayStateV1;
      readonly gaps?: readonly TranscriptReplayGapInput[];
      readonly presentation?: TranscriptReplayPresentationAdapter;
      readonly onDiagnostic?: (
        diagnostic: TranscriptProjectionDiagnostic,
      ) => void;
    }

重放状态必须有版本，且 `snapshot` 返回分离的副本。`initialState` 中格式错误的待处理条目会附带诊断被过滤；无效或非有限的 usage 会附带诊断被重置为零。未知的状态版本会被直接拒绝，以避免带着错误状态继续分页。

为了兼容部署前发出的 transcript 游标，没有 `v` 的旧状态在严格匹配当前 `{ pendingToolCalls, cumulativeUsage }` 形态时直接提升为 v1。显式的未知 `v` 仍然被拒绝。旧版分支只解析这一种已发布的形态，不会演化为第二种状态 schema。

## 增量重放机

    export interface TranscriptReplayMachine {
      project(
        record: TranscriptRecordInput,
      ): Iterable<TranscriptReplayEmission>;
      finalize(): Iterable<TranscriptReplayEmission>;
      snapshot(): TranscriptReplayStateV1;
    }

    export function createTranscriptReplayMachine(
      options?: TranscriptReplayMachineOptions,
    ): TranscriptReplayMachine;

`project` 返回惰性迭代器。CLI 在获得每次发出后立即等待 `sendUpdate`，只有在发送成功后才请求下一次发出。因此生成器 `yield` 之后的状态变更只在上一次发送成功后才提交。

接口必须显式记录这些迭代约束：

- 适配器必须完整迭代 `project` 返回的每个值。
- 在一次普通发出发送失败后，停止当前记录和所有后续记录。
- 保留移除待处理工具结果的当前时机。
- 只有在工具开始发送成功后才将其加入待处理。
- 在相关 plan 构建器读取累积值之前提交 usage。
- `finalize` 是幂等的；第二次调用返回空迭代器。
- `finalize` 的 CLI 适配器必须逐个捕获发送错误，继续尝试剩余的悬挂清理，并保留第一个清理错误。
- 当重放错误和清理错误同时存在时继续使用 `AggregateError`。

SDK 适配器没有外部异步发送失败，可以完整消费每个迭代器。

## 工具调用关联

调用 ID 遵循以下优先级：

1. 显式持久化的 ID，位于 `functionCall.id`、`toolCallResult.callId` 或 `functionResponse.id`。
2. 如果开始没有显式 ID，用包含源记录 UUID 和 part 索引的保留前缀生成稳定的合成 ID。
3. 如果结果没有显式 ID，只有当恰好一个待处理调用同名时才关联。
4. 当没有待处理调用或有多个同名待处理调用时，不猜测。生成独立的合成结果 ID 并发出 `ambiguous_tool_call_correlation` 诊断。
5. 在 `finalize` 期间把未关联的开始视为悬挂工具。

合成 ID 使用 `qwen-replay-tool:` 前缀。机器会检查它们与显式 ID 及更早合成 ID 的冲突，冲突时追加稳定的出现次数后缀。

稳定的回退只保证确定性身份；它无法在信息缺失时保证正确的关联。

## 源记录来源

记录身份必须贯穿 CLI、daemon 和 SDK，而不是只存在于外层发出上。文本块通常来自一条记录，而工具块同时吸收开始和结果记录，因此传输事件和块使用有序的、去重的数组。重放构建器将其添加到 `SessionUpdate._meta`：

    {
      qwenTranscript: {
        sourceRecordIds: ["..."]
      },
      timestamp: 1783958400000
    }

约束：

- `sourceRecordIds` 不是 `EventBus` ID，不得写入 `event.id` 或参与 `Last-Event-ID`。
- 在适配器接缝处把 `sourceTimestamp` 转换为有限的毫秒纪元值，并继续复用现有的 `timestamp` 字段。
- 历史缺口的发出使用 `[gap.childUuid]` 和子记录的时间戳。
- CLI `HistoryReplayer` 和 SDK 离线适配器发送的 `SessionUpdate` 值使用相同的元数据。
- 没有持久化记录上下文的实时 emitter 不写入 `qwenTranscript`。
- 规范化器从 `qwenTranscript` 提升 `sourceRecordIds`，然后从展示元数据中移除内部传输对象。
- 为 `DaemonUiEventBase` 和 `DaemonTranscriptBlockBase` 添加可选的 readonly `sourceRecordIds`。
- reducer 只在 `sourceRecordIds` 相等且所有其他合并条件都满足时合并 text/thought/image。
- 工具块继续按 `toolCallId` upsert，并按事件顺序对 `sourceRecordIds` 取并集。Plan 和其他 upsert 块使用相同的稳定并集规则。
- 压缩引擎的 text-slot 键也包含 `sourceRecordIds`，防止跨记录边界合并。
- 当压缩引擎合并相同的 `toolCallId` 时，必须稳定地对 `qwenTranscript.sourceRecordIds` 取并集；结果元数据不得覆盖开始来源。
- 使用结构化相等和 `Map` 来比较和索引 `sourceRecordIds`，而不是允许恶意 UUID 造成键冲突的未转义分隔符拼接。
- 没有 `qwenTranscript` 的实时事件保留当前压缩行为。

这为两种 daemon `/load` 模式和离线投射保留了相同的记录分段，因此一致性测试不需要仅供测试的 `activeRecordId` 上下文。

## 可变展示数据的适配器接缝

    export interface TranscriptReplayPresentationAdapter {
      resolveToolMetadata(
        toolName: string,
        args: Readonly<Record<string, unknown>>,
      ): TranscriptReplayToolMetadata;

      formatHistoryGap(gap: TranscriptReplayGapInput): string;
    }

- CLI 适配器使用当前 `Config`/工具注册表来解析 title、kind 和 locations，并使用 CLI i18n 来格式化历史缺口。
- 浏览器适配器使用确定性回退：title 是工具名加上持久化的描述参数，kind 为 `other`，locations 为空，历史缺口使用固定的 SDK 文案。

如果适配器抛异常，重放机使用确定性回退并发出诊断，而不是让展示增强终止整个 transcript。

来源、Todo/diff/content、usage 和调用关联不属于这个接缝，必须由共享实现决定。

## CLI 适配器

`HistoryReplayer` 保留其现有调用接口，但被简化为一个异步适配器：

    prepared records
      -> seed replay state
      -> machine.project(record)
      -> await sendUpdate(emission.update) in order
      -> machine.finalize() when requested
      -> copy machine.snapshot()
      -> clear active replay context

以下行为保留在 CLI 中：

- `Config`/工具注册表增强；
- 本地化的 CLI 历史缺口文案；
- `messageRewriter.interceptUpdate`；
- 异步 `sendUpdate` 失败处理；
- 在 `AggregateError` 中组合重放错误和悬挂清理错误；以及
- live-only 的 goals、stop hooks 和其他未持久化事件。

Load、分页 transcript 和导出路径必须使用相同的记录准备和重放机，使同一份 JSONL 不会通过不同入口产生不同的 `SessionUpdate` 值。

## SDK Transcript 接口

    export interface ChatRecordTranscriptOptions {
      readonly leafUuid?: string;
      readonly maxBlocks?: number;
    }

    export interface ChatRecordTranscriptProjection {
      readonly blocks: readonly DaemonTranscriptBlock[];
      readonly diagnostics: readonly TranscriptProjectionDiagnostic[];
      readonly complete: boolean;
      readonly truncated: boolean;
    }

    export function projectChatRecordsToDaemonTranscript(
      records: readonly unknown[],
      options?: ChatRecordTranscriptOptions,
    ): ChatRecordTranscriptProjection;

当省略 `options.maxBlocks` 时，离线投射不裁剪块数。显式值必须是正的安全整数。发生裁剪时：

- `truncated` 为 `true`；
- `complete` 为 `false`；
- `diagnostics` 包含 `transcript_blocks_truncated`；以及
- 工具、权限和父节点索引继续遵循 reducer 的安全清理规则。

离线适配器显式地以 `Number.MAX_SAFE_INTEGER` 作为默认值传入。它不改变在线 `createDaemonTranscriptState` 的 `DEFAULT_MAX_BLOCKS`，也不把 `Infinity` 放进 reducer 状态。

SDK 适配器的事件路径是：

    TranscriptReplayEmission
      -> id-less DaemonEvent(type = session_update)
      -> normalizeDaemonEvent
      -> reduceDaemonTranscriptEvents
      -> finalizeOfflineDaemonTranscriptState
      -> ChatRecordTranscriptProjection

事件没有 ID，因为它们不来自 `EventBus`。`sourceTimestamp` 变成 `serverTimestamp`，而 `sourceRecordIds` 保持为独立的投射来源。

离线适配器使用固定的 reducer 时钟 `0`，防止 `Date.now` 进入可观察字段。相同的输入、选项和展示适配器必须产生深度相等的投射；`serverTimestamp` 表示实际的历史时间。

新的私有 `finalizeOfflineDaemonTranscriptState` 只执行离线投射的清理，不从默认 daemon 入口导出：

- 把活跃的 assistant/thought 块的 `streaming` 设为 `false`；
- 清除活跃的文本指针；
- 不伪造传输事件或可见块；以及
- 不修改已终结的工具状态。

单个文本块继续使用 SDK 的安全字符上限。发生字符截断时，reducer 诊断 hook 必须报告 `transcript_text_truncated` 并设置 `truncated=true` 和 `complete=false`；不得只依赖可见的 `[truncated]` 后缀。

为了让块/文本截断可观察，向 `DaemonTranscriptReducerOptions` 添加可选的 `onTruncation(detail)`。detail 至少包含 kind、块 ID 以及存在时的 `sourceRecordIds`。普通 store 不传这个回调；离线适配器把 detail 收集并去重为投射诊断。不要通过扫描 `[truncated]` 来推断截断，因为用户文本可能包含相同的后缀。

## 不可信标识符安全

离线输入中的 UUID、调用 ID 和父 ID 是不可信字符串。在集成之前，把这些 transcript reducer 索引改为 `Map` 或空原型对象：

- `blockIndexById`；
- `toolBlockByCallId`；
- `permissionBlockByRequestId`；
- `activeAssistantBlockByParent`；
- `activeThoughtBlockByParent`；以及
- 裁剪后的 notification map。

测试必须覆盖 `__proto__`、`constructor`、`prototype`、`toString` 和超长 ID，确保它们不能破坏查找、父子关系或裁剪清理。

## Artifacts

工具结果构建器可以继续把持久化的 artifact 放入 `SessionUpdate` 元数据，供 daemon bridge 的 artifact 侧信道使用。但 `DaemonTranscriptBlock` 没有 artifact 字段，SDK 离线投射也不返回 artifact 存储。

因此一致性分为两层：

- `SessionUpdate` 一致性包含 artifact。
- `DaemonTranscriptBlock` 一致性显式忽略 artifact 侧信道。

如果未来 `WebShellTranscript` 需要 artifact 卡片，添加单独的 artifact 投射，而不是把 artifact 偷渡进 transcript 块。

## 一致性契约

### 强一致行为

CLI 重放和 SDK 离线投射共享该机器，因此以下内容必须一致：

- 活跃链和同 UUID 聚合；
- 记录/子类型过滤和 update 顺序；
- 支持的消息 text/thought/image 形态和 part 顺序；
- 工具调用 ID 和开始/结果/悬挂状态；
- Todo/plan、diff/content 和原始输入/输出；
- usage、任务执行 usage 和 plan-stat 顺序；
- notification、cron、轮次中消息、slash-command 和缺口的插入位置；以及
- 时间戳、`sourceRecordIds` 和重放诊断。

实时 emitter 和重放机共享 update 构建器，因此为同一语义事件生成的 `SessionUpdate` 字段必须一致。

### 显式允许的适配器差异

- 由 CLI 当前 `Config`/工具注册表计算的工具 title、kind 和 locations。
- CLI 当前语言环境下的历史缺口文案。
- CLI 消息改写添加的派生消息。
- Artifact 侧信道。
- Live-only 的 permission、shell、取消和会话事件。

如果产品要求逐字段相同的工具元数据，重放元数据必须在记录工具调用时持久化，并遵循“持久化值优先，确定性回退”。不得从当前注册表重新计算历史事实。

## 一致性测试

测试有六层：

1. Core 记录准备黄金测试：原始仅追加 fixture 到活跃链、聚合、缺口和诊断。
2. acp-bridge 构建器测试：live/replay 输入断言完整的 `SessionUpdate` 值。
3. 重放机/压缩测试：顺序、版本化状态、分页、合成 ID、歧义关联、终结，以及 text/tool 压缩期间 `sourceRecordIds` 的保留。
4. CLI 适配器回归测试：异步发送、消息改写、部分失败、悬挂清理和 `AggregateError`。
5. SDK 投射测试：无 ID 事件、`sourceRecordIds`、规范化、记录分段、截断、恶意标识符和确定性块。
6. 跨包一致性：相同的原始 fixture 经过真实 CLI 重放和 SDK 离线投射。

跨包路径：

    raw records
      -> SDK projectChatRecordsToDaemonTranscript
      -> sdkProjection

    raw records
      -> shared record preparation
      -> CLI HistoryReplayer
      -> captured SessionUpdate with qwenTranscript metadata
      -> SDK normalizer/reducer/finalize
      -> cliProjection

对规范化后的投射执行深度相等。规范化器只能忽略显式允许的适配器差异；不得移除 `sourceRecordIds`、时间戳、工具状态、诊断或截断。

另外添加 daemon 集成 fixture，验证在没有窗口截断时 response-mode 和 stream-mode `/load` 保留的 replay 与离线投射一致。测试必须跨越后续轮次边界，以覆盖 bridge/压缩对 `qwenTranscript` 元数据和时间戳的保留。

## 与 WebShellTranscript 的集成

    import { useMemo } from "react";
    import {
      projectChatRecordsToDaemonTranscript,
    } from "@qwen-code/sdk/daemon/transcript";
    import { WebShellTranscript } from "@qwen-code/web-shell";

    function ReadonlyHistory({ records }: { records: readonly unknown[] }) {
      const projection = useMemo(
        () => projectChatRecordsToDaemonTranscript(records),
        [records],
      );

      return (
        <>
          {projection.complete ? null : (
            <TranscriptDiagnostics diagnostics={projection.diagnostics} />
          )}
          <WebShellTranscript blocks={projection.blocks} />
        </>
      );
    }

SDK 拥有数据准备和投射；WebShell 只负责只读渲染。`WebShellTranscript` 不添加 `records` prop，也不启动 provider、会话或网络连接。

## 同步性能契约

公共门面是同步的 O(records + parts) 投射，即使显式的 `maxBlocks` 最终只保留尾部块，它也会扫描所有输入。`maxBlocks` 限制的是输出内存，不是计算量。

实现之前，使用小、中、大型真实 fixture 建立时间和峰值内存基线，并在 SDK 文档中记录建议的主线程上限。超过该上限的宿主应在 Web Worker 中调用相同的浏览器安全接口，并把投射传递给主线程。

第一版不添加单独的 async/worker 包装器。在出现第二个真实调用方之后再重新考虑该适配器，避免只有一个适配器的假接缝。

## Bundle 与发布约束

转换器不进入默认的 `@qwen-code/sdk/daemon` bundle。添加这个包导出：

    "./daemon/transcript": {
      "types": "./dist/daemon/transcript.d.ts",
      "import": "./dist/daemon/transcript.js",
      "require": "./dist/daemon/transcript.cjs"
    }

构建要求：

- 分离的浏览器 ESM 和 Node CJS bundle。
- 单独的 Node 内置模块守卫。
- 单独的大小预算，并记录基线 commit 和测量命令。
- 公共 `.d.ts` 文件不泄漏 core/acp-bridge dev 依赖。
- 在同时导入 `daemon` 和 `daemon/transcript` 的示例构建中测量重复代码。
- 不依赖导入包根或偶然的 tree shaking 来获得浏览器安全性。

默认的 daemon 预算 151 KiB 不因该功能增加。

## 迁移顺序

1. 向 core 添加浏览器安全的 transcript 记录准备叶子，并让 `SessionService` 和 `SessionTranscriptReader` 共享分类、叶子选择、链行走和聚合。
2. 向 acp-bridge 添加纯 `SessionUpdate` 构建器，并逐步把实时 emitter 迁移过去。
3. 添加重放机和黄金测试。
4. 把 `HistoryReplayer` 转换为 CLI 适配器，同时保留其现有调用接口和错误语义。
5. 添加 `qwenTranscript` 元数据，并扩展 bridge、压缩、规范化器和 reducer 对 `sourceRecordIds` 的处理。
6. 加固 reducer 的不可信标识符索引和截断诊断。
7. 向 SDK 添加 opt-in 的 `daemon/transcript` 门面和分离的发布产物。
8. 添加跨包一致性和 daemon 集成 fixture。
9. 把 WebShell 的只读页面接到 `projection.blocks` 并显示诊断。

在每一步中，先迁移现有消费者再删除旧实现，确保任何阶段都不会同时存在两套活跃链、聚合或 update 构建器规则。

## 预估代码量

- Core 记录准备和两个现有消费者的迁移：约 180–280 行生产代码。
- acp-bridge 构建器和重放机：约 400–550 行。
- CLI `HistoryReplayer` 适配器：约 60–100 行。
- SDK 投射门面、身份和诊断胶水：约 140–220 行。
- Reducer 安全/截断支持：约 60–120 行。
- 其余主要是 fixture、回归测试和一致性测试。

这是一项跨包的核心变更。实现之前，维护者必须在仓库的核心 triage 门控下确认范围。不应仅仅为了减少行数而保留重复的聚合或 update 构建器。

## 有损范围

投射只能恢复记录中存在的信息。以下内容显式不可恢复或可能有损：

- live-only 块，例如 permission、shell、user_shell 和 prompt_cancelled；
- session artifact 存储；
- 当前 `Config`/注册表/语言环境的历史事实；
- 不支持的 binary/audio/fileData；
- 没有 `parentToolCallId` 的旧 sidechain 子代理嵌套；
- 缺少显式调用 ID 且有多个同名工具待处理时的精确关联；
- 超过单个文本块安全字符上限的内容；
- 被显式调用方提供的 `maxBlocks` 移除的较早块；以及
- 因损坏输入、未知扩展或断链而跳过的内容。

每一个影响完整性的情况都必须发出诊断并设置 `complete=false`。每一次实际裁剪也必须设置 `truncated=true`。
