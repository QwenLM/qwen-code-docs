# Subagent 追踪树设计（P3 阶段三）

> Issue #3731 — 分层会话追踪的第三阶段。新增 `qwen-code.subagent` span，使 subagent 调用拥有独立、可查询的追踪结构，而非默默交织在父级 `qwen-code.interaction` span 下。
>
> 基于阶段一（#4126）、阶段一点五（#4302）和阶段二（#4321）构建。

## 问题

当前所有 `AgentTool.execute` 调用都运行在父级的 `qwen-code.interaction` span 下，存在三个问题：

1. **并发 subagent 相互交织。** `coreToolScheduler.ts:728` 将 `AGENT` 标记为并发安全——`Promise.all` 最多并行运行 10 个 subagent。它们的 LLM 请求 / 工具 / hook span 全部挂载到同一个共享父级 interaction span，导致追踪浏览器无法区分"这个 LLM 请求属于 subagent A"还是"属于 subagent B"。
2. **subagent 边界本身缺少 span。** 虽然存在一个 `qwen-code.subagent_execution` LogRecord（从 `agent-headless.ts:268,329` 发出），并通过 `LogToSpanProcessor` 桥接为同名 span，但它只是一个独立标记，而非将 subagent 的 LLM / 工具 / hook span 嵌套在其下的父级。
3. **Fork / 后台 subagent 游离在外。** fire-and-forget 路径（`runInForkContext` / 后台）的生命周期超出父级 `AgentTool.execute`，在后续多个用户轮次中持续发出 span。父级工具 span 在这些 span 出现时已经结束，OTel 的 `context.active()` 也无能为力——它们会挂载到触发时恰好处于活跃状态的 interaction，或者根本不挂载。

## 现有接口（不做改动）

| 组件                               | 位置                                                                                                                                                                                             | 不改动原因                                      |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------- |
| 统一 spawn 入口                     | `packages/core/src/tools/agent/agent.ts:1147` `AgentTool.execute()`                                                                                                                              | 单一入口点；适合处理 3 种调用方式               |
| 三种调用方式                        | 前台命名（`runFramed` 在 `:2154`——await 等待）、fork（`void runInForkContext(runFramedFork)` 在 `:1991`——fire-and-forget）、后台（`void framedBgBody()` 在 `:1934`——fire-and-forget）               | 生命周期不同——span 设计覆盖全部三种              |
| 并发                               | `coreToolScheduler.runConcurrently`（`Promise.all`，上限 10）——由 `partitionToolCalls` 将 AGENT 标记为 `concurrent: true` 驱动                                                                    | 这正是需要隔离的原因                            |
| `runInForkContext` ALS             | `packages/core/src/tools/agent/fork-subagent.ts:32` `forkExecutionStorage`                                                                                                                       | 仅用于递归 fork 防护——不传播 OTel context       |
| Agent 身份 ALS                     | `packages/core/src/agents/runtime/agent-context.ts:46` `runWithAgentContext(agentId, ...)`                                                                                                       | 已携带 `agentId`；我们为其扩展 `depth`          |
| `SubagentExecutionEvent` LogRecord | `agent-headless.ts:268,329` → `loggers.ts:773` → 3 个下游（LogToSpanProcessor span 桥接 + QwenLogger RUM + `recordSubagentExecutionMetrics`）                                                    | LogRecord 保留；下游依赖它                      |

## 超出范围（推迟处理）

- **按 subagent 聚合 token 用量**（汇总 subagent 内所有 LLM span 的 `gen_ai.usage.*`）。属于阶段四（LLM 请求分解）的内容。
- **将 `qwen-code.subagent_execution` LogRecord 迁移为新 span 的 span 事件。** RUM 和 metrics 与 LogRecord 紧密耦合；推迟到能同时重新协商 3 个消费者时再处理。
- **自动成本汇总。** 原因相同——需要先有 token 用量数据。
- **移除 AGENT 工具的 `concurrent: true` 标记。** 并发行为是正确的；我们对其进行插桩，而不是加以限制。

## 参考资料（决策依据）

| 来源                                                                                                                   | 关键结论                                                                                                                                                                                                                                                                                                                     |
| ---------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [OTel Trace Spec — Links between spans](https://opentelemetry.io/docs/specs/otel/overview/#links-between-spans)        | 原文："新链接的 Trace 也可以表示由众多快速入站请求中的某一个发起的长时间异步数据处理操作。"→ fork/后台应为带 Link 的根 span，而非子 span。                                                                                                                                                                                   |
| [OTel GenAI Agent Spans](https://opentelemetry.io/docs/specs/semconv/gen-ai/gen-ai-agent-spans/)（状态：Development）  | span 名称 `invoke_agent {gen_ai.agent.name}`；必填属性 `gen_ai.operation.name`、`gen_ai.provider.name`；推荐：`gen_ai.agent.id`、`gen_ai.agent.name`、`gen_ai.conversation.id`。                                                                                                                                              |
| LangSmith — 每个 trace 25,000 次运行上限                                                                               | 长 agent 会话最终必须拆分 trace；有利于混合 traceId 设计。                                                                                                                                                                                                                                                                   |
| [Sentry — distributed tracing](https://docs.sentry.io/concepts/key-terms/tracing/distributed-tracing/)                 | "子事务的生命周期可能超过包含父 span 的事务"——支持子 span 超出父 span 生命周期。                                                                                                                                                                                                                                              |
| claude-code（Anthropic）                                                                                                | subagent 层次结构仅存在于本地 Perfetto JSON 文件中；OTel 导出是扁平的。无可移植代码。                                                                                                                                                                                                                                         |
| opencode（sst/opencode）                                                                                                | 使用 `@effect/opentelemetry` 自动插桩；对 `withRunSpan` 显式调用 `context.with(trace.setSpan(active, span), fn)`。**验证了 context.with 隔离模式。** 其关于手动注册 `AsyncLocalStorageContextManager` 的警告不适用——qwen-code 的 `NodeSDK` 会自动注册。                                                                       |

## 设计——六个决策，各有依据

### D1 — Span 生命周期：调用方创建，被调用方在 `context.with(span, fn)` 内运行

`agent.ts`（调用方）构造 span。函数体——无论是 await 等待的（`runFramed`）还是 fire-and-forget 的（`runInForkContext` / 后台）——都在 `runInSubagentSpanContext(span, fn)` 内运行，该函数调用 `otelContext.with(trace.setSpan(active, span), fn)`。

**span 在 `AgentTool.execute` 的哪个位置创建？** 在**调用方式相关的初始化操作之前**（`createAgentHeadless` / `createForkSubagent` 等）立即创建——这样初始化时间（配置构建、ToolRegistry 重建、ContextOverride 接线）就会包含在 `qwen-code.subagent` 的持续时间内。运维人员排查"为何这个 subagent 很慢"时可以看到完整信息。初始化时间通常远小于 LLM 时间，基本可以忽略不计。

替代方案：在初始化后创建，排除初始化时间。已拒绝，因为 subagent 的初始化本身就是归属于该 subagent 的工作——隐藏它会导致汇总所有 subagent span 时总时长计算出错。

**为什么不只由被调用方处理**：fork / 后台函数体实际运行时，调用方已经返回。此时 OTel 的 `context.active()` 返回的是异步运行时携带的环境 context——对于父级结束后的 `void` fire-and-forget 而言，这是不可靠的。父级 span 已经关闭；事后重新指定父级是错误的。

**为什么不只由调用方处理**：前台场景没有问题，但 fork / 后台 span 必须在 `AgentTool.execute` 返回后继续发出子 span（LLM / 工具 / hook）。这些子 span 需要 `context.active()` 返回 subagent span——只有函数体显式在 `context.with(subagentSpan, body)` 内运行才能做到。

两端缺一不可。**本设计就是这座桥梁**——调用方创建 span + 基于调用方式的 traceId 策略，然后通过 `runInSubagentSpanContext` 移交。

### D2 — 混合 traceId：前台 = 子 span，fork/后台 = 新 traceId + Link

| 调用方式      | 父级                        | TraceId                 | 原因                                                                                                                                                                         |
| ------------- | --------------------------- | ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `foreground`  | 调用方工具 span 的子 span   | 继承父级 traceId        | OTel 默认行为；调用方在时间上完全包含被调用方                                                                                                                                |
| `fork`        | 带 Link 的根 span           | 新 traceId              | 调用方立即返回；fork 跨越后续多个 interaction 运行。OTel 规范明确推荐对此使用 Link。避免父级 trace 的持续时间 / 大小膨胀。                                                    |
| `background`  | 带 Link 的根 span           | 新 traceId              | 理由同 fork。                                                                                                                                                                |

**Link 内容**：

```ts
tracer.startSpan(
  'qwen-code.subagent',
  {
    kind: SpanKind.INTERNAL,
    links: [
      {
        context: invokerSpanContext,
        attributes: { 'qwen-code.link.kind': 'invoker' },
      },
    ],
  } /* 显式 context = root，不继承 active */,
);
```

通过 session id 实现跨 trace 查询：`gen_ai.conversation.id` 在每个 subagent span（前台和 linked-root）上都会设置，因此按 `session.id` 在 ARMS 查询时会同时返回父级 interaction 的 trace 和 linked-root subagent trace。Link 本身在父级 trace 的 UI 中显示为"Spawned: subagent X (other trace)"，方便导航。

**为什么不总是使用子 span**：4 小时的后台 subagent 会将父级 trace 的挂钟时长膨胀到 4 小时；trace 大小超出多个后端的上限（LangSmith 的 25,000 次运行限制是文档中最明确的边界）。用户实际等待的前台 subagent 不存在这个问题，因为它们在时间上是被包含的。

**为什么不总是使用 linked-root**：前台场景会破坏自然的追踪树。用户触发一个同步 Explore subagent 的提示词理应显示为一棵树，而不是两个 linked trace。

### D3 — TTL：按类型区分，subagent fork/后台 = 4h，其他 = 30min

`session-tracing.ts:124` 定义了 `SPAN_TTL_MS = 30 * 60 * 1000`。`:144-152` 的清理逻辑已经对 `tool.blocked_on_user` 做了特殊处理，标记 `decision: 'aborted' + source: 'system'`。从本质上看，它已经具备按类型处理的意识。

**变更**：引入按类型区分的 TTL：

```ts
const SPAN_TTL_MS_DEFAULT = 30 * 60 * 1000; // 30min
const SPAN_TTL_MS_LONG = 4 * 60 * 60 * 1000; // 4h

function ttlFor(ctx: SpanContext): number {
  if (
    ctx.type === 'subagent' &&
    ctx.attributes['qwen-code.subagent.invocation_kind'] !== 'foreground'
  ) {
    return SPAN_TTL_MS_LONG;
  }
  return SPAN_TTL_MS_DEFAULT;
}
```

TTL 到期时，subagent span 会被标记：

```ts
{
  'qwen-code.span.ttl_expired': true,
  'qwen-code.span.duration_ms': age,
  'qwen-code.subagent.status': 'aborted',
  'qwen-code.subagent.terminate_reason': 'ttl_swept',
}
```

**为什么不统一用 30min**：真正执行时间较长的 subagent（大型仓库分析、慢构建、深度研究任务）会被错误地标记为 TTL 超期。4h 覆盖 99 百分位，同时又不会宽松到真正的挂起无法被检测到。

**为什么不取消 TTL**：进程崩溃 / OOM / kill -9 → span 永远留在 `activeSpans` Map 中。30min 安全网可以防止这种情况；subagent fork/后台只是需要更宽的窗口，而不是完全移除。

**4h 的来源**：非平凡 agent 任务（长时间深度研究 / 大型代码库分析）的经验上限值。如果生产数据表明需要调整，可通过常量配置。

### D4 — LogRecord 保留：保持发送，跳过 LogToSpanProcessor 桥接

`SubagentExecutionEvent` LogRecord 有 3 个下游消费者（通过代码库审计验证）：

| 消费者                                                                              | 位置                                              | 操作                                                                                    |
| ----------------------------------------------------------------------------------- | ------------------------------------------------- | --------------------------------------------------------------------------------------- |
| OTel LogRecord → `LogToSpanProcessor` → 桥接 span `qwen-code.subagent_execution`   | `loggers.ts:773` → `log-to-span-processor.ts:346` | **跳过该桥接**——新的 `qwen-code.subagent` span 取而代之                                  |
| QwenLogger RUM 采集（阿里云内部统计）                                                | `qwen-logger.ts:573-574`                          | 保留——RUM 不感知 OTel span，只感知 LogRecord                                             |
| `recordSubagentExecutionMetrics` 计数器                                             | `metrics.ts:829`                                  | 保留——metric 消费者独立于 trace 桥接                                                     |

**桥接跳过**（对 LogToSpanProcessor 的唯一改动）：

```ts
// log-to-span-processor.ts — 在 onEmit 内，deriveSpanName 之后
const skipBridge = new Set<string>([
  EVENT_SUBAGENT_EXECUTION, // 已由原生 qwen-code.subagent span 覆盖
]);
if (skipBridge.has(eventName)) return;
```

**对 trace 消费者的影响**：按 span 名称 `qwen-code.subagent_execution` 过滤的 dashboard 开始返回零结果。应更新为 `qwen-code.subagent`。在发版说明中注明。

**为什么不删除 LogRecord**：它是 RUM 和 metrics 的输入。删除它需要重构 3 个系统；超出本次范围。

**为什么不同时保留两者**：trace 中每个 subagent 会出现两个 span（`qwen-code.subagent` + `qwen-code.subagent_execution`），携带重叠信息——对阅读 trace 的运维人员造成困惑，且 span 量重复。

### D5 — Span 名称 + 属性：混合规范合规，扩展字段使用厂商前缀

**Span 名称**：`qwen-code.subagent`（与阶段一/二代码库惯例一致：`qwen-code.interaction`、`qwen-code.tool`、`qwen-code.hook`……）。

OTel GenAI 规范建议的规范 span 名称为 `invoke_agent {gen_ai.agent.name}`——但**同时**说明"各 GenAI 系统/框架可以指定不同的 span 名称格式"。我们使用自己的名称，并设置 `gen_ai.operation.name='invoke_agent'`，使支持规范的工具仍能识别该 span。运维人员阅读追踪树时看到一致的 `qwen-code.*` 命名。

**Span kind**：`INTERNAL`（进程内 subagent 调用，符合规范）。

**属性集**：

| 类别                                                              | 属性                                            | 来源                                                                 | 备注                                                                                                                                                                             |
| ----------------------------------------------------------------- | ----------------------------------------------- | -------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **规范必填**                                                       | `gen_ai.operation.name='invoke_agent'`          | 字面量                                                               | 规范要求                                                                                                                                                                         |
| **规范必填**                                                       | `gen_ai.provider.name='qwen-code'`              | 字面量                                                               | 规范要求；对进程内 agent 含义模糊（规范是为 LLM provider 设计的）。设为 `'qwen-code'` 是最合理的解释                                                                              |
| **必填（双写）**                                                   | `gen_ai.agent.id` + `qwen-code.subagent.id`     | `agentContext.agentId`                                               | 在规范达到 Stable 之前双写；之后移除厂商 key                                                                                                                                     |
| **必填（双写）**                                                   | `gen_ai.agent.name` + `qwen-code.subagent.name` | `agentConfig.subagentType`（如 `Explore`、`code-reviewer`、`fork`）  | 同样双写                                                                                                                                                                         |
| **规范推荐**                                                       | `gen_ai.conversation.id`                        | `config.getSessionId()`                                              | 支持按 session 跨 trace 查询；与现有 `session.id` span 属性共存（由 #4367 全局设置）——两者指向同一 UUID，规范稳定后删除其中一个                                                    |
| **规范推荐**                                                       | `gen_ai.request.model`                          | 模型覆盖值（如有）                                                   | 仅在 subagent 覆盖父级模型时设置                                                                                                                                                 |
| **厂商**                                                           | `qwen-code.subagent.invocation_kind`            | `'foreground'` ❘ `'fork'` ❘ `'background'`                           | 驱动 TTL + traceId 策略                                                                                                                                                          |
| **厂商**                                                           | `qwen-code.subagent.is_built_in`                | bool                                                                 | dashboard 过滤器                                                                                                                                                                 |
| **厂商**                                                           | `qwen-code.subagent.parent_agent_id`            | 父级 ALS 的 `agentId`                                                | 用于嵌套 subagent + 跨 trace 血缘关系                                                                                                                                            |
| **厂商**                                                           | `qwen-code.subagent.depth`                      | 父级 depth + 1（顶层 = 0）                                           | 递归 bug 检测器                                                                                                                                                                  |
| **厂商**                                                           | `qwen-code.subagent.invoking_request_id`        | 来自 `agentContext`                                                   | 请求级别关联                                                                                                                                                                     |
| **span 结束时（规范）**                                             | `error.type`（失败时）                          | error 类名                                                           | OTel 标准                                                                                                                                                                        |
| **span 结束时（规范）**                                             | `exception.message`（失败时）                   | `truncateSpanError(error.message)`                                   | OTel 标准；复用阶段二的截断逻辑                                                                                                                                                  |
| **span 结束时（厂商）**                                             | `qwen-code.subagent.status`                     | `'completed'` ❘ `'failed'` ❘ `'cancelled'` ❘ `'aborted'`             | 比 OTel SpanStatus（OK / ERROR / UNSET）更细粒度                                                                                                                                 |
| **span 结束时（厂商）**                                             | `qwen-code.subagent.terminate_reason`           | 来自 `SubagentExecutionEvent.terminate_reason`                        | 如 `task_complete`、`max_iterations`、`user_abort`、`ttl_swept`                                                                                                                  |
| **span 结束时（厂商）**                                             | `qwen-code.subagent.result_summary_present`     | bool                                                                 | "subagent 是否产生输出"——有界                                                                                                                                                    |
| **可选（敏感）** 由 `includeSensitiveSpanAttributes` 控制           | `gen_ai.input.messages`                         | 结构化对话历史                                                       | 复用 #4097 的门控                                                                                                                                                                |
| **可选（敏感）**                                                   | `gen_ai.output.messages`                        | 模型响应                                                             | 同上                                                                                                                                                                             |
| **可选（敏感）**                                                   | `gen_ai.system_instructions`                    | system prompt                                                        | 同上                                                                                                                                                                             |
| **可选（敏感）**                                                   | `gen_ai.tool.definitions`                       | 工具 schema                                                          | 同上                                                                                                                                                                             |

**SpanStatus 映射**：

- `status === 'completed'` → `SpanStatus { code: OK }`
- `status === 'failed'` → `SpanStatus { code: ERROR, message: truncated(error.message) }`
- `status === 'cancelled'` 或 `'aborted'` → `SpanStatus { code: UNSET }`（与阶段二惯例一致）

**为什么对 `id` + `name` 双写**：规范处于 Development 阶段（比 Experimental 早一步）。`OTEL_SEMCONV_STABILITY_OPT_IN=gen_ai_latest_experimental` 支持选择加入。规范属性名称在达到 Stable 之前可能重命名。双写与阶段二对 `call_id` → `tool.call_id` 使用的模式相同；规范达到 Stable 后移除厂商 key。

**为什么用 `qwen-code.subagent.*`（而非 `qwen.subagent.*`）**：`constants.ts` 中所有现有厂商前缀 key 都使用 `qwen-code.*`（`qwen-code.user_prompt`、`qwen-code.tool_call` 等）。内部一致性优先于 OTel 命名约定偏好，因为运维人员按前缀在 ARMS 中查询。

**基数**：span 属性不是 OTel 中的 metric 标签；UUID 类属性（`id`、`parent_agent_id`、`invoking_request_id`）在 span 层面是安全的。之后不要将它们提升为 metric 标签。

**每个 span 约 10-15 个属性**（取决于调用方式、是否失败、是否嵌套）。顺序与 `qwen-code.tool` 相同。

### D6 — 直接在 `AgentContext` 中添加 `depth` 字段

`AgentContext`（`agent-context.ts:32`）**未导出**——只有辅助函数（`getCurrentAgentId`、`runWithAgentContext`、`getRuntimeContentGenerator`、`runWithRuntimeContentGenerator`）被导出。TypeScript 层面不存在下游破坏性变更。通过 `getCurrentAgentId()` 读取的 6 个已知消费者只读取 `agentId`；添加 `depth?: number` 对它们不可见。

```ts
interface AgentContext {
  agentId: string;
  subagentName: string;
  invokingRequestId: string;
  invocationKind: 'spawn' | 'resume';
  isBuiltIn: boolean;
  depth?: number; // 新增——读取时默认为 0
}
```

`runWithAgentContext` 已使用 `{ ...current, agentId }` 展开，因此 `depth` 在现有调用点保持不变。**更新 `runWithAgentContext` 在内部自动递增 depth**——调用方无需感知 depth：

```ts
function runWithAgentContext<T>(agentId: string, fn: () => T): T {
  const parent = agentContextStorage.getStore();
  const next: AgentContext = {
    ...parent,
    agentId,
    depth: (parent?.depth ?? -1) + 1, // 自动递增
  };
  return agentContextStorage.run(next, fn);
}
```

顶层 subagent：无父级 ALS → `depth: 0`。嵌套：父级 depth+1。

新增一个小型访问器 `getCurrentAgentDepth(): number`，返回 `agentContextStorage.getStore()?.depth ?? 0`——由 `startSubagentSpan` 用于填充 `qwen-code.subagent.depth`。

**为什么不单独为遥测创建 ALS**：会与已有的 context 结构重复。不合理。复用现有的。

## 辅助 API（`session-tracing.ts`）

```ts
// constants.ts
export const SPAN_SUBAGENT = 'qwen-code.subagent';

// session-tracing.ts
export interface StartSubagentSpanOptions {
  agentId: string;
  subagentName: string;
  invocationKind: 'foreground' | 'fork' | 'background';
  isBuiltIn: boolean;
  parentAgentId?: string;
  depth: number;
  invokingRequestId?: string;
  sessionId: string;
  modelOverride?: string;
  invokerSpanContext?: SpanContext; // fork / background 必填（Link 来源）
}

export interface SubagentSpanMetadata {
  status: 'completed' | 'failed' | 'cancelled' | 'aborted';
  terminateReason?: string;
  resultSummaryPresent?: boolean;
  error?: string;
  errorType?: string;
}

export function startSubagentSpan(opts: StartSubagentSpanOptions): Span;
export function endSubagentSpan(
  span: Span,
  metadata: SubagentSpanMetadata,
): void;
export function runInSubagentSpanContext<T>(
  span: Span,
  fn: () => Promise<T>,
): Promise<T>;
```

`runInSubagentSpanContext` 是隔离原语：

```ts
export function runInSubagentSpanContext<T>(
  span: Span,
  fn: () => Promise<T>,
): Promise<T> {
  const ctx = trace.setSpan(otelContext.active(), span);
  return otelContext.with(ctx, fn);
}
```

`startSubagentSpan` 内部根据 `invocationKind` 分支：

```ts
function startSubagentSpan(opts: StartSubagentSpanOptions): Span {
  const attributes = buildSpanAttributes(opts);
  const tracer = getTracer();

  if (opts.invocationKind === 'foreground') {
    // 当前活跃 span（调用方工具 span）的子 span
    return tracer.startSpan(SPAN_SUBAGENT, {
      kind: SpanKind.INTERNAL,
      attributes,
    });
  }

  // fork / background：带 Link 的根 span
  return tracer.startSpan(SPAN_SUBAGENT, {
    kind: SpanKind.INTERNAL,
    attributes,
    links: opts.invokerSpanContext
      ? [
          {
            context: opts.invokerSpanContext,
            attributes: { 'qwen-code.link.kind': 'invoker' },
          },
        ]
      : undefined,
    root: true, // 强制使用新 traceId；忽略 active context 作为父级
  });
}
```

## 生命周期接线

### 前台命名（常规路径）

```ts
// agent.ts:~2154
// 拉取父级 ALS 帧以在 span 上设置 parentAgentId。新子级的
// depth 在 runWithAgentContext 内部自动计算（D6）——在进入子级 ALS
// 帧之后通过 getCurrentAgentDepth() 读取。分两步：
const parentAgentId = getCurrentAgentId();  // 进入子级帧之前

// ... 现有 runFramed 调用进入 runWithAgentContext(hookOpts.agentId, ...) ...

// 在 runFramed 内部可以读取子级的 depth：
//   const depth = getCurrentAgentDepth();
//
// 实际处理：将 depth 作为闭包变量传递，在 runWithAgentContext 生效后设置
// ——或者从调用方侧计算为 `(getCurrentAgentDepth() 在外部) + 1`（更简单）。
const depth = getCurrentAgentDepth();  // 在帧外部；子级将是 this + 1
// （在 startSubagentSpan 参数中设置 qwen-code.subagent.depth = depth）

const span = startSubagentSpan({
  agentId, subagentName, invocationKind: 'foreground',
  isBuiltIn, parentAgentId, depth, invokingRequestId, sessionId,
  modelOverride,
  // 省略 invokerSpanContext——前台通过 context.with 自然继承
});
let metadata: SubagentSpanMetadata = { status: 'aborted' };
try {
  await runInSubagentSpanContext(span, () =>
    runFramed(() => this.runSubagentWithHooks(...)),
  );
  metadata = { status: 'completed' /* + resultSummaryPresent */ };
} catch (error) {
  metadata = {
    status: signal.aborted ? 'aborted' : 'failed',
    error: error instanceof Error ? error.message : String(error),
    errorType: error?.constructor?.name,
  };
  throw error;
} finally {
  endSubagentSpan(span, metadata);
}
```

### Fork（fire-and-forget）

```ts
const invokerSpanContext = trace.getSpan(otelContext.active())?.spanContext();
const span = startSubagentSpan({
  ..., invocationKind: 'fork', invokerSpanContext,
});
void runInForkContext(() =>
  runInSubagentSpanContext(span, async () => {
    let metadata: SubagentSpanMetadata = { status: 'aborted' };
    try {
      await runFramedFork();
      metadata = { status: 'completed' };
    } catch (error) {
      metadata = {
        status: signal.aborted ? 'aborted' : 'failed',
        error: error instanceof Error ? error.message : String(error),
      };
    } finally {
      endSubagentSpan(span, metadata);
    }
  }),
);
// AgentTool.execute 立即返回 FORK_PLACEHOLDER_RESULT；
// span 在父级 session 的后续 interaction 中持续存在。
```

### 后台

与 fork 结构相同，使用 `invocationKind: 'background'` 并以 `bgEventEmitter` 替代 `eventEmitter`。TTL 为 4h（与 fork 相同——来自 D3 的类型规则）。

## 并发隔离——核心保证

来自一个用户提示词的三个并发 subagent 调用（模型发出 3 个 AGENT tool_use block → `coreToolScheduler.runConcurrently` 并行运行 3 个 `executeSingleToolCall`；每个按阶段二逻辑创建自己的 `qwen-code.tool` span）：

```
qwen-code.interaction                         [traceId=T0]
├─ qwen-code.tool [agent call #A]
│  └─ qwen-code.subagent (A, foreground)     [traceId=T0, child]
│     ├─ qwen-code.llm_request
│     └─ qwen-code.tool [...]
│        └─ qwen-code.tool.execution
├─ qwen-code.tool [agent call #B]
│  └─ qwen-code.subagent (B, foreground)     [traceId=T0, child]
│     └─ qwen-code.llm_request
└─ qwen-code.tool [agent call #C]
   └─ qwen-code.subagent (C, fork)           [traceId=T1, linked root]
      └─ qwen-code.llm_request                [traceId=T1]
         └─ ...                               [traceId=T1, 可能数小时后发出]
```

A、B、C 各自的 `context.with(span, runX)` 并发运行。`AsyncLocalStorageContextManager`（已由 `sdk.ts:273` 的 NodeSDK 自动注册）按 fiber 隔离；不会相互干扰。每个 subagent 的子级 LLM / 工具 / hook span 在其自身的异步链中通过 `context.active()` 看到对应的 `span`。

Fork（C）是独立的 trace——即使其子 span 在父级 session 的后续多个 interaction 中发出，也继承 `traceId=T1`。在 ARMS 按 `session.id` 查询会同时返回 T0 和 T1；T1 的根 → C 的调用方 `qwen-code.tool` span 之间的 Link 提供了明确的导航路径。

## 需要修改的文件

| 文件                                                        | 变更内容                                                                                                                                                                                      | 行数估计 |
| ----------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| `packages/core/src/telemetry/constants.ts`                  | 添加 `SPAN_SUBAGENT`、`SPAN_TTL_MS_LONG`、属性 key 常量                                                                                                                                       | +8       |
| `packages/core/src/telemetry/session-tracing.ts`            | 添加 `startSubagentSpan`（前台/linked-root 分支）、`endSubagentSpan`、`runInSubagentSpanContext`、类型；扩展 `SpanType` 联合类型加入 `'subagent'`；用 `ttlFor(ctx)` 扩展 TTL 清理逻辑          | +120     |
| `packages/core/src/telemetry/log-to-span-processor.ts`      | 添加跳过列表以绕过 `qwen-code.subagent_execution` 的桥接                                                                                                                                      | +6       |
| `packages/core/src/telemetry/index.ts`                      | 重新导出新辅助函数和类型                                                                                                                                                                      | +6       |
| `packages/core/src/agents/runtime/agent-context.ts`         | 在 `AgentContext` 中添加 `depth?: number` 及 `getCurrentAgentDepth()` 访问器                                                                                                                  | +12      |
| `packages/core/src/tools/agent/agent.ts`                    | 用 `runInSubagentSpanContext` 包裹 3 条执行路径（前台/fork/后台），配合 try/catch/finally                                                                                                      | +60      |
| `packages/core/src/telemetry/session-tracing.test.ts`       | 新增 `describe('subagent spans')`：创建/结束、child vs linked-root、context 传播、depth、按类型 TTL、幂等结束、SDK 未初始化时 NOOP                                                             | +120     |
| `packages/core/src/telemetry/log-to-span-processor.test.ts` | 断言跳过列表使 subagent_execution 桥接短路                                                                                                                                                    | +20      |
| `packages/core/src/tools/agent/agent.test.ts`               | 端到端：3 个并发 subagent 各自拥有独立子树；fork 的 span 通过 Link 继承新 traceId；后台生命周期                                                                                               | +80      |

共计：9 个文件，约 430 行。比典型的阶段二提交大，但有依据——TTL 变更涉及独立文件，LogToSpanProcessor 跳过是独立文件，测试文件也翻倍了。拆分会导致遥测接口不完整落地。

如果评审认为改动过大：拆分为 2 个 PR——（A）遥测辅助函数 + 测试，（B）`agent.ts` 接线 + 端到端测试。先落地辅助函数不影响运行时行为。

## 测试策略

| 测试                                                                         | 验证内容                                                    |
| ---------------------------------------------------------------------------- | ----------------------------------------------------------- |
| `startSubagentSpan foreground parents to active OTel span`                   | 子 span 路径                                                |
| `startSubagentSpan fork creates new traceId + Link to invoker`               | linked-root 路径                                            |
| `runInSubagentSpanContext propagates span through awaits / Promise.all`      | 隔离原语                                                    |
| `3 concurrent subagent spans don't share children`                           | 核心并发隔离保证                                            |
| `nested subagent records depth + parentAgentId`                              | 嵌套元数据                                                  |
| `endSubagentSpan status mapping (completed / failed / cancelled / aborted)`  | 状态分类                                                    |
| `endSubagentSpan dual-emits gen_ai.agent.id + qwen-code.subagent.id`         | 规范合规双写                                                |
| `fork lifecycle: span survives AgentTool.execute return`                     | fire-and-forget 正确性                                      |
| `TTL: subagent fork stays past 30min, gets stamped + ended at 4h`            | 按类型 TTL                                                  |
| `TTL: foreground subagent at 30min gets default sweep`                       | TTL 不过度延伸                                              |
| `LogToSpanProcessor skips qwen-code.subagent_execution but still RUM-emits`  | 桥接跳过生效                                                |
| `runConcurrently of 3 agent tool calls produces 3 distinct subagent spans`   | 调度器层面的端到端验证                                      |
| `failed subagent sets exception.message + error.type + SpanStatus=ERROR`     | OTel 标准错误路径                                           |
| `opt-in attrs gated on includeSensitiveSpanAttributes`                       | 正确复用 #4097 的门控                                       |
| `startSubagentSpan returns NOOP_SPAN when SDK is uninitialized`              | 与阶段一/二 NOOP 规范一致；下游调用保持安全                  |
| `fork span Link.context matches invoker tool span's spanContext`             | 跨 trace 导航端到端可用                                     |
| `runWithAgentContext auto-increments depth: parent=0, child=1, grandchild=2` | depth 记账无需调用方配合即可正确完成                         |

## 边界情况

| 情况                                                                                                                    | 处理方式                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| ----------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 工具内嵌套 subagent 内再嵌套 subagent（depth > 1）                                                                      | `depth` 属性记录；建议在 depth ≥ 5 时通过 `debugLogger.warn` 软警告（无限递归检测器）                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| subagent 在父级工具 `awaiting_approval` 期间被 spawn                                                                    | subagent span 是 AGENT 工具 span 的子级；AGENT 工具的 `tool.blocked_on_user` 是同级而非父级——两者都是 AGENT 工具 span 的子级。树结构保持正确                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| subagent 运行中 `signal.aborted`                                                                                        | `runInSubagentSpanContext` 的回调抛出或 resolve；`finally` 设置 `status='aborted'`，SpanStatus 为 UNSET                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| Fork 在父级 session 结束后仍存活                                                                                         | 4h TTL 触发；标记哨兵属性 `qwen-code.span.ttl_expired:true`、`qwen-code.subagent.terminate_reason='ttl_swept'`、`status='aborted'`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `endSubagentSpan` 被调用两次                                                                                             | 幂等——检查 `activeSpans` map；第二次调用为 no-op（与阶段二模式一致）                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| subagent 的 LLM 调用使用与父级不同的模型                                                                                 | `gen_ai.request.model` 设置在 subagent span 上；LLM 请求子 span 也记录模型——无冲突                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| 兄弟 subagent 的 prelude 抛出异常逃逸 `attemptExecutionOfScheduledCalls`                                                 | 落入阶段二近期修复的 `handleConfirmationResponse` catch 中，该 catch 在 try 块之外——不归属于已确认工具的 span。subagent span 通过自身的 try/finally 正确关闭                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| 同一父级同时存在 fork + 前台 subagent                                                                                    | 前台继承 T0 traceId，fork 获得 T1。两者独立进行正确的 context 传播。父级工具 span 在同步工作返回时结束；fork span（独立 trace）继续存活                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| fork span 在调用方同步流中创建，但函数体稍后才运行                                                                       | `startSubagentSpan` 在 `void runInForkContext(...)` 之前调用，因此 span（及其指向调用方的 Link）在调用方的 spanContext 仍可读时即被捕获。span 持续时间因此包含函数体实际开始前的微任务队列调度延迟——通常在亚毫秒级；如果生产数据显示存在不可忽视的间隔，可添加 `qwen-code.subagent.scheduling_delay_ms` 属性（待定问题）                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| SDK 未初始化（遥测已禁用）                                                                                               | `startSubagentSpan` 提前返回 NOOP_SPAN（与所有阶段一/二辅助函数一致）。`runInSubagentSpanContext(NOOP_SPAN, fn)` 仍正常调用 `fn`。`endSubagentSpan(NOOP_SPAN, …)` 为 no-op                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| fork 的日志桥接 span（`tool_call`、`api_request` 等）使用 session 派生的 traceId，而 fork 的原生 span 使用 T1           | 已有行为——日志桥接 span 始终使用 `deriveTraceId(sessionId)`，原生 span 使用 OTel context。这种差异在单个 trace 内不可见，但意味着按 traceId T1 在 ARMS 查询时不会包含 fork 的日志桥接子 span。超出本 PR 范围；作为待定问题 #5 列出                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| 前台与后台 `SubagentStart` hook span 的父级不同                                                                          | 前台在 `runSubagentWithHooks` 内触发 `fireSubagentStartEvent`——此时已在 `runInSubagentSpanContext` 内，因此 hook span 的父级是 `qwen-code.subagent`。后台在 `runWithSubagentSpan` 包裹之前触发（subagent span 尚未存在），因此其 hook span 的父级是 AGENT 的 `qwen-code.tool`。查询"subagent span 下的 hook span"的运维人员应预期后台的 `SubagentStart` 不会出现在该视图中。将后台 hook 触发移入 `framedBgBody` 在机制上很简单（`contextState` 变更无论如何都能到达 `bgSubagent.execute`），但会改变用户可见的语义：目前 hook 在 `AgentTool.execute` 返回"后台 agent 已启动"消息之前同步触发，因此 hook 的任何同步初始化工作都发生在阻塞用户的轮次内；移动后 hook 将在启动消息返回后异步触发。推迟处理，待明确偏好哪种语义后再决定 |

## 回滚

该变更在 OTel 层面是纯增量的——不按 subagent 相关 span 名称过滤的现有 dashboard 继续正常工作。按父级 span 分组的 trace 消费者会在 `qwen-code.tool` 和 `qwen-code.llm_request` 之间看到新的 `qwen-code.subagent` 节点；在发版说明中注明。

影响行为的变更是 LogToSpanProcessor 跳过——之前消费 `qwen-code.subagent_execution` span 的 dashboard 返回零结果。缓解措施：保持 LogRecord 完整（RUM + metrics 仍能看到）；仅移除 span 桥接。基于日志的现有查询不受影响。

回滚路径：回退单个 PR。新的 span 辅助函数仅从 `agent.ts` 调用；移除接线 + LogToSpanProcessor 跳过即可 1:1 恢复之前的行为。

## 采样影响

| 调用方式                                       | 采样决策来源                                                             |
| ---------------------------------------------- | ------------------------------------------------------------------------ |
| `foreground`（子 span，相同 traceId）           | 通过基于父级的 sampler 继承父级 trace 的采样决策                          |
| `fork` / `background`（linked root，新 traceId）| 在 root 创建时独立做出采样决策                                            |

对于 qwen-code 当前的默认配置（见 `tracer.ts:shouldForceSampled()`——parent-based + always_on，其余 always_on），每个 span 都会被采样，因此差异不会产生问题。对于使用概率 sampler 的部署（如 `traceidratio=0.1`），这意味着：

- 某个用户提示词可能被采样（T0 完整捕获），但其 fork（T1）可能被丢弃，反之亦然。
- 运维人员查看父级 T0 时看到"Link: subagent C (T1)"——点击后若 T1 未被采样则可能 404。

缓解措施：向运维人员说明。如果需要完整捕获 subagent，可通过未来的配置开关强制对 fork/后台进行采样。超出本次范围。

## 敏感属性（#4097 集成）

复用现有的 `includeSensitiveSpanAttributes` 门控。为 true 时，在数据可用的生命周期 hook 处设置到 subagent span：

| 规范属性                     | 来源                                                     | 设置时机                                                                                 |
| ---------------------------- | -------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `gen_ai.system_instructions` | 从 `agentConfig` / 父级 context 渲染的 system prompt     | `startSubagentSpan`（如在 span 创建前可用）或在函数体早期通过 `setAttributes` 设置         |
| `gen_ai.tool.definitions`    | subagent 可用的工具声明                                  | 同上                                                                                     |
| `gen_ai.input.messages`      | 传递给 subagent 的初始输入（prompt + extraHistory）      | 在函数体开始时                                                                           |
| `gen_ai.output.messages`     | subagent 返回的最终响应消息                              | 在 `endSubagentSpan` metadata 中                                                         |

以上均已门控；#4097 的模式是在函数体内调用 `addSubagentSensitiveAttributes(span, opts)` 辅助函数。此为实现细节——设计仅标注集成点。

## 排期

- 独立于 #4367（resource 属性——评审中）。无合并顺序约束，但 subagent span 上的 `gen_ai.conversation.id` 受益于 #4367 将 `session.id` 从 resource 中移出。**建议先落地 #4367**，以确定 `getSessionId()` 的单一来源。
- 独立于阶段四（LLM 请求分解 / TTFT）。阶段四挂载到 `qwen-code.llm_request` span，无论它们位于 subagent 下还是 interaction 下。建议阶段三先于阶段四，以便阶段四的每次尝试 metrics 可以按 subagent 聚合。

## 待定问题

1. **`gen_ai.provider.name`**：规范要求设置，但描述是针对 LLM provider 而非 agent 框架的。设为 `'qwen-code'` 是最佳解释；若未来规范修订新增 `agent.provider.name` 变体，届时切换。
2. **span 名称 `qwen-code.subagent` 与规范 `invoke_agent {name}`**：选择了内部一致性。若 GenAI 感知工具采用率提高，`invoke_agent ${name}` 成为自动发现的关键，可以切换——span 名称是 OTel 中最易更名的东西。
3. **depth ≥ 5 时软警告**：数字为经验值。可作为配置项。推迟到生产数据表明有需要时再处理。
4. **`SubagentExecutionEvent.result` 的完整 LLM 输出体积较大**：目前会膨胀 LogRecord 体积。迁移计划（LogRecord → span events）已推迟，但值得在阶段四 token 用量聚合落地后再做。
5. **fork 内部的日志桥接 span 最终使用 session 派生的 traceId，而非 fork 的 T1**：见边界情况。修复方案是更宏观的"interaction span 不继承 session 根 context"问题，在 sessionId-vs-traceId 讨论中已提出——这是影响所有原生 span 而非仅 subagent 的独立设计。超出范围。
